var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) =>
  key in obj
    ? __defProp(obj, key, {
        enumerable: true,
        configurable: true,
        writable: true,
        value,
      })
    : (obj[key] = value);
var __publicField = (obj, key, value) =>
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
(function () {
  "use strict";
  const BRIDGE_ID = "heieobedadlfdkppgagnhfakcdapbfka";
  const PING_TTL_MS = 3e4;
  const STATUS_TTL_MS = 5e3;
  const TRANSIENT_CONTROL_TTL_MS = 1e3;
  const BRIDGE_CONTROL_TIMEOUT_MS = 5e3;
  const TOKEN_REFRESH_TIMEOUT_MS = 2e4;
  class BridgeClient {
    static _runtimeErrorCode(message) {
      const detail = String(message || "");
      if (
        /receiving end does not exist|could not establish connection/i.test(
          detail,
        )
      ) {
        return "BRIDGE_NOT_INSTALLED";
      }
      return "BRIDGE_CHANNEL_CLOSED";
    }
    static _isTransientControlError(error) {
      return [
        "BRIDGE_REQUEST_TIMEOUT",
        "BRIDGE_CHANNEL_CLOSED",
        "EMPTY_RESPONSE",
      ].includes(String(error || ""));
    }
    static _uncertainResult(method, error, detail = null) {
      const mutation =
        method === "flow_v2_upload_ref" ||
        method === "flow_v2_upload_video" ||
        method === "flow_v2_submit_image" ||
        method === "flow_v2_submit_image_batch" ||
        method === "flow_v2_submit_video" ||
        method === "flow_v2_submit_video_edit" ||
        method === "flow_v2_upscale_image" ||
        method === "flow_v2_upscale_video";
      const acceptedRead =
        method === "flow_v2_poll_operations" ||
        method === "flow_v2_resolve_media";
      return {
        ok: false,
        error,
        detail,
        ...(mutation
          ? { stage: "ambiguous", dispatchStarted: true, ambiguous: true }
          : acceptedRead
            ? { stage: "accepted_poll", dispatchStarted: true }
            : {}),
      };
    }
    static _undeliveredResult(method, error, detail = null) {
      const mutation =
        method === "flow_v2_upload_ref" ||
        method === "flow_v2_upload_video" ||
        method === "flow_v2_submit_image" ||
        method === "flow_v2_submit_image_batch" ||
        method === "flow_v2_submit_video" ||
        method === "flow_v2_submit_video_edit" ||
        method === "flow_v2_upscale_image" ||
        method === "flow_v2_upscale_video";
      const acceptedRead =
        method === "flow_v2_poll_operations" ||
        method === "flow_v2_resolve_media";
      return {
        ok: false,
        error,
        detail,
        ...(mutation
          ? { stage: "pre_dispatch", dispatchStarted: false, ambiguous: false }
          : acceptedRead
            ? { stage: "accepted_poll", dispatchStarted: true }
            : {}),
      };
    }
    static _requestTimeout(method, params) {
      if (method === "refresh_token") return TOKEN_REFRESH_TIMEOUT_MS;
      if (method === "flow_v2_reconnect") {
        const configured = Number(params?.runtime?.session_refresh_timeout_ms);
        return Number.isInteger(configured) &&
          configured >= 3e3 &&
          configured <= 6e4
          ? configured + 1e4
          : 1e4;
      }
      if (
        [
          "flow_validate_session",
          "open_flow_login",
          "open_flow_login_manual",
        ].includes(method)
      ) {
        return TOKEN_REFRESH_TIMEOUT_MS * 3;
      }
      if (method === "flow_v2_health") {
        const configured = Number(params?.runtime?.poll_interval_ms);
        return Number.isInteger(configured) &&
          configured >= 250 &&
          configured <= 6e4
          ? configured + 5e3
          : 1e4;
      }
      if (
        [
          "flow_v2_upload_ref",
          "flow_v2_upload_video",
          "flow_v2_resolve_media",
          "flow_v2_poll_operations",
          "flow_v2_submit_image",
          "flow_v2_submit_image_batch",
          "flow_v2_submit_video",
          "flow_v2_submit_video_edit",
          "flow_v2_upscale_image",
          "flow_v2_upscale_video",
          "flow_v2_get_upload_receipt",
        ].includes(method)
      ) {
        const configured = Number(params?.runtime?.request_timeout_ms);
        if (
          !Number.isInteger(configured) ||
          configured < 1e3 ||
          configured > 12e4
        )
          return 1e4;
        const mutationTimeout =
          params?.runtime?.mutation_timeout_ms == null
            ? configured
            : Number(params.runtime.mutation_timeout_ms);
        if (
          !Number.isInteger(mutationTimeout) ||
          mutationTimeout < 1e3 ||
          mutationTimeout > 12e4
        )
          return 1e4;
        if (method === "flow_v2_get_upload_receipt")
          return Math.min(configured + 5e3, 3e4);
        const generation = [
          "flow_v2_submit_image",
          "flow_v2_submit_image_batch",
          "flow_v2_submit_video",
          "flow_v2_submit_video_edit",
        ].includes(method);
        const referenceRead =
          method === "flow_v2_submit_video" &&
          params?.input?.refMediaIds?.length > 0;
        const phases =
          method === "flow_v2_upscale_video" || referenceRead
            ? 4
            : generation ||
                method === "flow_v2_upscale_image" ||
                ["flow_v2_upload_ref", "flow_v2_upload_video"].includes(method)
              ? 3
              : 1;
        const mutation =
          generation ||
          [
            "flow_v2_upload_ref",
            "flow_v2_upload_video",
            "flow_v2_upscale_image",
            "flow_v2_upscale_video",
          ].includes(method);
        return (
          configured * phases +
          (phases > 1 ? 3e4 : 2e4) +
          (mutation ? Math.max(0, mutationTimeout - configured) : 0)
        );
      }
      return 0;
    }
    static _sendRaw(method, params = {}, timeoutMs = 0) {
      return new Promise((resolve) => {
        let settled = false;
        let timer = null;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          resolve(value);
        };
        if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
          timer = setTimeout(
            () =>
              finish(
                this._uncertainResult(
                  method,
                  "BRIDGE_REQUEST_TIMEOUT",
                  `${method} timed out after ${timeoutMs}ms`,
                ),
              ),
            timeoutMs,
          );
        }
        try {
          if (!chrome?.runtime?.sendMessage)
            return finish({ ok: false, error: "NO_RUNTIME" });
          chrome.runtime.sendMessage(BRIDGE_ID, { method, params }, (res) => {
            const err = chrome.runtime.lastError;
            if (err) {
              const code = this._runtimeErrorCode(err.message);
              return finish(
                code === "BRIDGE_NOT_INSTALLED"
                  ? this._undeliveredResult(method, code, err.message)
                  : this._uncertainResult(method, code, err.message),
              );
            }
            finish(res || this._uncertainResult(method, "EMPTY_RESPONSE"));
          });
        } catch (e) {
          const detail = (e && e.message) || "SEND_FAILED";
          const code = this._runtimeErrorCode(detail);
          finish(
            code === "BRIDGE_NOT_INSTALLED"
              ? this._undeliveredResult(method, code, detail)
              : this._uncertainResult(method, code, detail),
          );
        }
      });
    }
    static async request(method, params = {}, options = {}) {
      const v2Command = method.startsWith("flow_v2_");
      const cancellable = v2Command && typeof options.abortFn === "function";
      if (cancellable && options.abortFn())
        return {
          ok: false,
          error: "ABORTED",
          stage: "pre_dispatch",
          dispatchStarted: false,
        };
      const commandId = v2Command
        ? `v2-client-${Date.now()}-${Math.random().toString(36).slice(2)}`
        : null;
      if (commandId) params = { ...params, commandId };
      const timeoutMs = this._requestTimeout(method, params);
      if (method.startsWith("flow_v2_") && timeoutMs > 0)
        params = { ...params, commandExpiresAt: Date.now() + timeoutMs };
      let cancelTimer = null,
        cancelSent = false,
        stoppedLocally = false;
      let resolveStopped;
      const stopped = new Promise((resolve) => {
        resolveStopped = resolve;
      });
      const raw = this._sendRaw(method, params, timeoutMs);
      raw
        .then((late) => {
          if (!stoppedLocally) return;
          console.info(
            "[FlowApiStoppedReceipt]",
            JSON.stringify({
              commandId,
              method,
              ok: late?.ok === true,
              stage: late?.stage || null,
              error: late?.error || null,
              outputs: (late?.outputs || []).map((output) => ({
                operationId: output.operationId || null,
                mediaId: output.mediaId || null,
                state: output.state || null,
              })),
            }),
          );
        })
        .catch(() => {});
      const cancel = () => {
        if (cancelSent || !options.abortFn?.()) return;
        cancelSent = true;
        stoppedLocally = true;
        void this._sendRaw(
          "flow_v2_cancel_command",
          { commandId, commandExpiresAt: params.commandExpiresAt },
          1e4,
        );
        resolveStopped({
          ...this._uncertainResult(method, "ABORTED"),
          commandId,
          cancelled: true,
          noRetry: true,
          noReplay: true,
        });
      };
      if (cancellable) {
        cancelTimer = setInterval(cancel, 100);
        cancel();
      }
      let result;
      try {
        result = await (cancellable ? Promise.race([raw, stopped]) : raw);
      } finally {
        if (cancelTimer) clearInterval(cancelTimer);
      }
      if (stoppedLocally) return result;
      if (
        ["flow_v2_upload_ref", "flow_v2_upload_video"].includes(method) &&
        result?.ambiguous === true &&
        commandId
      ) {
        for (let attempt = 0; attempt < 4; attempt++) {
          if (attempt) await new Promise((resolve) => setTimeout(resolve, 500));
          const recovered = await this._sendRaw(
            "flow_v2_get_upload_receipt",
            {
              projectId: params.projectId,
              targetCommandId: commandId,
              runtime: params.runtime,
              commandExpiresAt: Date.now() + 3e4,
            },
            1e4,
          );
          if (
            recovered?.ok === true &&
            recovered?.stage === "receipt" &&
            recovered?.mediaId
          ) {
            result = recovered;
            console.info(
              "[FlowUploadReceiptRecovery]",
              JSON.stringify({ recovered: true, attempt: attempt + 1 }),
            );
            break;
          }
          if (
            ![
              "UPLOAD_RECEIPT_PENDING",
              "BRIDGE_CHANNEL_CLOSED",
              "BRIDGE_REQUEST_TIMEOUT",
              "EMPTY_RESPONSE",
            ].includes(recovered?.error)
          )
            break;
        }
      }
      const authError = String(result?.error || "").toUpperCase();
      if (authError === "TOKEN_EXPIRED" || authError === "NO_FLOW_KEY") {
        this._statusCache = null;
        try {
          chrome.storage.session.set({
            flowApiLastAuthError: { error: authError, at: Date.now(), method },
          });
        } catch (_) {}
        try {
          window.eventBus?.emit?.("flow_api:auth_invalid", {
            error: authError,
            method,
          });
        } catch (_) {}
      }
      return result;
    }
    static async supportsFlowCookieRecovery(force = false) {
      const ping = await this.ping(force);
      if (
        !ping?.installed ||
        !ping.capabilities?.includes("flow_clear_cookies_reload") ||
        !ping.capabilities?.includes("flow_clear_cache_reload") ||
        !/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(ping.version || "")
      )
        return false;
      const parts = ping.version.split(".").map(Number);
      const minimum = [1, 3, 33];
      for (let i = 0; i < minimum.length; i++) {
        if (parts[i] !== minimum[i]) return parts[i] > minimum[i];
      }
      return true;
    }
    static async clearFlowCookiesAndReload({ tabId, projectId }) {
      if (!(await this.supportsFlowCookieRecovery(true))) {
        return { ok: false, error: "BRIDGE_COOKIE_RECOVERY_UNAVAILABLE" };
      }
      const timeoutMs = Number(
        window.SystemConfig?.safeGetTimeout?.("api_timeout_ms"),
      );
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
        return { ok: false, error: "CONFIG_NOT_READY" };
      const result = await this._sendRaw(
        "flow_clear_cookies_reload",
        { tabId, projectId, userInitiated: true },
        timeoutMs,
      );
      this.invalidate();
      if (
        result?.ok &&
        (result.cacheCleared !== true || result.reloaded !== true)
      )
        return { ok: false, error: "FLOW_CACHE_RELOAD_UNCONFIRMED" };
      return result;
    }
    static async setFlowApiMaintenance(enabled) {
      return this._sendRaw(
        "set_flow_api_maintenance",
        { enabled: enabled === true },
        BRIDGE_CONTROL_TIMEOUT_MS,
      );
    }
    static async ping(force = false) {
      const pingTtl = this._isTransientControlError(this._pingCache?.error)
        ? TRANSIENT_CONTROL_TTL_MS
        : PING_TTL_MS;
      if (
        !force &&
        this._pingCache &&
        Date.now() - this._pingCache.at < pingTtl
      ) {
        return this._pingCache;
      }
      if (this._pingFlight) return this._pingFlight;
      const flight = (async () => {
        const previous = this._pingCache || this._lastVerifiedPing;
        const r = await this._sendRaw("ping", {}, BRIDGE_CONTROL_TIMEOUT_MS);
        let result =
          r && r.ok
            ? {
                installed: true,
                version: r.version || null,
                capabilities: r.capabilities || [],
                flowV2MaxReferences: Number.isInteger(r.flowV2MaxReferences)
                  ? r.flowV2MaxReferences
                  : null,
                native: r.native || null,
                at: Date.now(),
              }
            : {
                installed: false,
                version: null,
                capabilities: [],
                at: Date.now(),
                error: r?.error || "BRIDGE_PING_FAILED",
                detail: r?.detail || null,
              };
        if (
          previous?.installed === true &&
          this._isTransientControlError(result.error)
        ) {
          result = {
            ...previous,
            at: Date.now(),
            error: result.error,
            detail: result.detail || null,
            uncertain: true,
          };
        }
        this._pingCache = result;
        if (result.installed === true && result.uncertain !== true)
          this._lastVerifiedPing = result;
        const signature = (value) =>
          JSON.stringify([
            value?.installed === true,
            value?.version || null,
            Array.isArray(value?.capabilities)
              ? [...value.capabilities].sort()
              : [],
          ]);
        if (previous && signature(previous) !== signature(result)) {
          try {
            window.eventBus?.emit?.("bridge:changed", {
              installed: result.installed,
              version: result.version,
              capabilities: result.capabilities,
            });
          } catch (_) {}
        }
        return result;
      })();
      this._pingFlight = flight;
      try {
        return await flight;
      } finally {
        if (this._pingFlight === flight) this._pingFlight = null;
      }
    }
    static async isAvailable(force = false) {
      const p = await this.ping(force);
      return !!p.installed;
    }
    static async hasCapability(name) {
      const p = await this.ping();
      return !!(
        p.installed &&
        Array.isArray(p.capabilities) &&
        p.capabilities.includes(name)
      );
    }
    static async getStatus(force = false) {
      const statusTtl = this._isTransientControlError(this._statusCache?.error)
        ? TRANSIENT_CONTROL_TTL_MS
        : STATUS_TTL_MS;
      if (
        !force &&
        this._statusCache &&
        Date.now() - this._statusCache.at < statusTtl
      ) {
        return this._statusCache;
      }
      if (this._statusFlight) return this._statusFlight;
      const flight = (async () => {
        const previous = this._statusCache || this._lastVerifiedStatus;
        const r = await this._sendRaw(
          "get_status",
          {},
          BRIDGE_CONTROL_TIMEOUT_MS,
        );
        let result =
          r && r.ok
            ? {
                installed: true,
                tokenReady: !!r.tokenReady,
                tokenAgeMs: r.tokenAgeMs ?? null,
                flowTabOpen: !!r.flowTabOpen,
                tokenBootstrapActive: !!r.tokenBootstrapActive,
                version: r.version || null,
                at: Date.now(),
              }
            : {
                installed: false,
                tokenReady: false,
                tokenAgeMs: null,
                flowTabOpen: false,
                version: null,
                at: Date.now(),
                error: r?.error || "BRIDGE_STATUS_FAILED",
                detail: r?.detail || null,
              };
        if (
          previous?.installed === true &&
          this._isTransientControlError(result.error)
        ) {
          result = {
            ...previous,
            at: Date.now(),
            error: result.error,
            detail: result.detail || null,
            uncertain: true,
          };
        }
        this._statusCache = result;
        if (result.installed === true && result.uncertain !== true)
          this._lastVerifiedStatus = result;
        return result;
      })();
      this._statusFlight = flight;
      try {
        return await flight;
      } finally {
        if (this._statusFlight === flight) this._statusFlight = null;
      }
    }
    static invalidate() {
      this._pingCache = null;
      this._statusCache = null;
    }
    static stream() {
      try {
        if (!chrome?.runtime?.connect) return null;
        const port = chrome.runtime.connect(BRIDGE_ID);
        if (!port) return null;
        let reqSeq = 0;
        const pending = new Map();
        const listeners = new Set();
        port.onMessage.addListener((msg) => {
          if (msg?.progress && msg.reqId != null && pending.has(msg.reqId)) {
            for (const cb of listeners) {
              try {
                cb(msg);
              } catch (_) {}
            }
          } else if (msg && msg.reqId != null && pending.has(msg.reqId)) {
            pending.get(msg.reqId)(msg.result);
            pending.delete(msg.reqId);
          } else {
            for (const cb of listeners) {
              try {
                cb(msg);
              } catch (_) {}
            }
          }
        });
        port.onDisconnect.addListener(() => {
          for (const res of pending.values())
            res({ ok: false, error: "PORT_DISCONNECTED" });
          pending.clear();
        });
        return {
          port,
          onMessage: (cb) => {
            listeners.add(cb);
            return () => listeners.delete(cb);
          },
          request: (method, params = {}) =>
            new Promise((resolve) => {
              const reqId = ++reqSeq;
              pending.set(reqId, resolve);
              try {
                port.postMessage({ reqId, method, params });
              } catch (e) {
                resolve({ ok: false, error: e.message });
              }
            }),
          close: () => {
            try {
              port.disconnect();
            } catch (_) {}
          },
        };
      } catch (_) {
        return null;
      }
    }
  }
  __publicField(BridgeClient, "BRIDGE_ID", BRIDGE_ID);
  __publicField(BridgeClient, "_pingCache", null);
  __publicField(BridgeClient, "_statusCache", null);
  __publicField(BridgeClient, "_lastVerifiedPing", null);
  __publicField(BridgeClient, "_lastVerifiedStatus", null);
  __publicField(BridgeClient, "_pingFlight", null);
  __publicField(BridgeClient, "_statusFlight", null);
  if (typeof window !== "undefined") window.BridgeClient = BridgeClient;
  if (typeof globalThis !== "undefined") globalThis.BridgeClient = BridgeClient;
})();
