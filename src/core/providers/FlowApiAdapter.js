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
  const LOG = "[FlowApiAdapter]";
  class FlowApiAdapter {
    static _checkpointConfig() {
      return window.ProviderConfigManager?.getFlowChainConfigSync?.() || null;
    }
    static _storageGet(area, key) {
      return new Promise((resolve) =>
        chrome.storage[area].get([key], (value) => resolve(value?.[key])),
      );
    }
    static _storageSet(area, values) {
      return new Promise((resolve) =>
        chrome.storage[area].set(values, resolve),
      );
    }
    static _checkpointIdentity(item) {
      const job = window.PromptQueue?.getInstance?.().getJob?.(item.jobId);
      return {
        itemId: item.id,
        jobId: item.jobId,
        trackerSessionId: job?._trackerSessionId || null,
        projectId: item.projectId || job?.projectId || null,
        chainKind: job?.chain?.kind || null,
      };
    }
    static _saveCheckpoint(item, state) {
      const config = this._checkpointConfig();
      if (!config?.enabled || !item?.id || !item?.mediaId)
        return Promise.resolve();
      const identity = this._checkpointIdentity(item);
      const checkpoint = {
        ...identity,
        driver: "v1",
        protocolRevision: 1,
        mediaType: "video",
        genMode: "api",
        operationId: item.operationId || item.mediaId,
        mediaId: item.mediaId,
        state,
        submittedAt: item.submittedAt || Date.now(),
        lastPolledAt: Date.now(),
      };
      this._checkpointWriteTail = this._checkpointWriteTail
        .catch(() => {})
        .then(async () => {
          const all =
            (await this._storageGet("local", this.CHECKPOINT_KEY)) || {};
          all[checkpoint.operationId] = checkpoint;
          await this._storageSet("local", { [this.CHECKPOINT_KEY]: all });
        });
      return this._checkpointWriteTail;
    }
    static _removeCheckpoint(operationId) {
      if (!operationId) return Promise.resolve();
      this._checkpointWriteTail = this._checkpointWriteTail
        .catch(() => {})
        .then(async () => {
          const all =
            (await this._storageGet("local", this.CHECKPOINT_KEY)) || {};
          delete all[operationId];
          await this._storageSet("local", { [this.CHECKPOINT_KEY]: all });
        });
      return this._checkpointWriteTail;
    }
    static async removeCheckpointsForProject(projectId) {
      if (!projectId) return 0;
      let removed = 0;
      this._checkpointWriteTail = this._checkpointWriteTail
        .catch(() => {})
        .then(async () => {
          const all =
            (await this._storageGet("local", this.CHECKPOINT_KEY)) || {};
          for (const [operationId, checkpoint] of Object.entries(all)) {
            if (checkpoint?.projectId !== projectId) continue;
            delete all[operationId];
            removed++;
          }
          if (removed > 0)
            await this._storageSet("local", { [this.CHECKPOINT_KEY]: all });
        });
      await this._checkpointWriteTail;
      return removed;
    }
    static async removeCheckpointsForJob(jobId) {
      if (!jobId) return 0;
      let removed = 0;
      this._checkpointWriteTail = this._checkpointWriteTail
        .catch(() => {})
        .then(async () => {
          const all =
            (await this._storageGet("local", this.CHECKPOINT_KEY)) || {};
          for (const [operationId, checkpoint] of Object.entries(all)) {
            if (checkpoint?.jobId !== jobId) continue;
            delete all[operationId];
            removed++;
          }
          if (removed > 0)
            await this._storageSet("local", { [this.CHECKPOINT_KEY]: all });
        });
      await this._checkpointWriteTail;
      return removed;
    }
    static async recoverCheckpoints() {
      const config = this._checkpointConfig();
      if (!config?.enabled || config.recovery_enabled !== true) return;
      const currentProject =
        window._currentProjectId || window._flowProjectId || null;
      if (!currentProject) return;
      const all = (await this._storageGet("local", this.CHECKPOINT_KEY)) || {};
      const ttlMs = Math.max(6e4, Number(config.checkpoint_ttl_minutes) * 6e4);
      const owner = crypto.randomUUID();
      for (const checkpoint of Object.values(all)) {
        if (!checkpoint?.itemId || !checkpoint?.operationId) continue;
        if (checkpoint.driver && checkpoint.driver !== "v1") continue;
        if (checkpoint.projectId !== currentProject) {
          await chrome.runtime.sendMessage({
            action: "ft:recoveryPatch",
            projectId: checkpoint.projectId,
            itemId: checkpoint.itemId,
            patch: {
              state: "RECOVERY_REQUIRED",
              errorType: "project_mismatch",
              error: "FLOW_API_PROJECT_MISMATCH",
            },
            terminal: false,
          });
          continue;
        }
        if (
          Date.now() -
            Number(checkpoint.lastPolledAt || checkpoint.submittedAt || 0) >
          ttlMs
        ) {
          await chrome.runtime.sendMessage({
            action: "ft:recoveryPatch",
            projectId: currentProject,
            itemId: checkpoint.itemId,
            patch: {
              state: "RECOVERY_REQUIRED",
              errorType: "media_expired",
              error: "FLOW_API_CHECKPOINT_EXPIRED",
            },
            terminal: false,
          });
          await this._removeCheckpoint(checkpoint.operationId);
          continue;
        }
        const lockKey = "toby_flow_api_recovery_locks_v1";
        const locks = (await this._storageGet("session", lockKey)) || {};
        const previous = locks[checkpoint.operationId];
        if (previous && previous.expiresAt > Date.now()) continue;
        locks[checkpoint.operationId] = { owner, expiresAt: Date.now() + 45e3 };
        await this._storageSet("session", { [lockKey]: locks });
        const verified = (await this._storageGet("session", lockKey)) || {};
        if (verified[checkpoint.operationId]?.owner !== owner) continue;
        try {
          let status = await this._bridgeFlow("flow_poll_video", {
            config: this._rawConfig(),
            mediaId: checkpoint.mediaId,
            projectId: currentProject,
          });
          if (
            status?.ok &&
            status.status !== "done" &&
            status.status !== "failed"
          ) {
            const resumed = await this._pollVideoById(
              checkpoint.mediaId,
              currentProject,
              () => false,
              async () => {
                const heartbeat =
                  (await this._storageGet("session", lockKey)) || {};
                if (heartbeat[checkpoint.operationId]?.owner === owner) {
                  heartbeat[checkpoint.operationId].expiresAt =
                    Date.now() + 45e3;
                  await this._storageSet("session", { [lockKey]: heartbeat });
                }
              },
            );
            status = resumed.ok
              ? { ...resumed, status: "done" }
              : {
                  ok: false,
                  status: "recovery_required",
                  error: resumed.error,
                };
          }
          if (status?.ok && status.status === "done") {
            const url = status.durableUrl || status.videoUrl || null;
            await chrome.runtime.sendMessage({
              action: "ft:recoveryPatch",
              projectId: currentProject,
              itemId: checkpoint.itemId,
              patch: {
                state: "COMPLETED",
                completedAt: Date.now(),
                mediaId: checkpoint.mediaId,
                operationId: checkpoint.operationId,
                thumb: url,
                thumbPlayUrl: url,
                thumbVideo: true,
                results: url
                  ? [
                      {
                        url,
                        playUrl: url,
                        video: true,
                        tileId: checkpoint.mediaId,
                        fileName: checkpoint.mediaId,
                      },
                    ]
                  : [],
              },
              terminal: !checkpoint.chainKind,
            });
            await this._removeCheckpoint(checkpoint.operationId);
          } else if (status?.ok && status.status === "failed") {
            await chrome.runtime.sendMessage({
              action: "ft:recoveryPatch",
              projectId: currentProject,
              itemId: checkpoint.itemId,
              patch: {
                state: "FAILED",
                completedAt: Date.now(),
                errorType: "unknown",
                error: "VIDEO_FAILED",
              },
              terminal: true,
            });
            await this._removeCheckpoint(checkpoint.operationId);
          } else {
            await chrome.runtime.sendMessage({
              action: "ft:recoveryPatch",
              projectId: currentProject,
              itemId: checkpoint.itemId,
              patch: {
                state: "RECOVERY_REQUIRED",
                errorType: null,
                error: "FLOW_API_RECOVERY_PENDING",
              },
              terminal: false,
            });
          }
        } finally {
          const fresh = (await this._storageGet("session", lockKey)) || {};
          if (fresh[checkpoint.operationId]?.owner === owner) {
            delete fresh[checkpoint.operationId];
            await this._storageSet("session", { [lockKey]: fresh });
          }
        }
      }
    }
    static _maxConcurrent() {
      try {
        const n = parseInt(window.ExecutionConfig?.getQueueMaxMonitor?.(), 10);
        if (Number.isFinite(n) && n >= 1) return n;
      } catch (_) {}
      return 4;
    }
    static _pumpSlotWaiters() {
      for (const [waiters, counter, mediaType] of [
        [this._waiters, "_inFlight", "image"],
        [this._videoWaiters, "_videoInFlight", "video"],
      ]) {
        const kept = [];
        for (const waiter of waiters) {
          if (waiter.abortFn()) waiter.resolve(false);
          else kept.push(waiter);
        }
        waiters.splice(0, waiters.length, ...kept);
        let cap = this._maxConcurrent();
        if (mediaType === "video") {
          try {
            cap =
              Number(window.ExecutionConfig?.getQueueVideoMaxMonitor?.()) ||
              cap;
          } catch (_) {}
        }
        while (waiters.length && this[counter] < cap) {
          this[counter]++;
          waiters.shift().resolve(true);
        }
      }
      if (
        !this._waiters.length &&
        !this._videoWaiters.length &&
        this._slotWaitTimer
      ) {
        clearInterval(this._slotWaitTimer);
        this._slotWaitTimer = null;
      }
    }
    static async _acquire(abortFn = () => false, mediaType = "image") {
      if (abortFn()) return false;
      return new Promise((resolve) => {
        const waiters =
          mediaType === "video" ? this._videoWaiters : this._waiters;
        waiters.push({ abortFn, resolve });
        if (!this._slotWaitTimer)
          this._slotWaitTimer = setInterval(() => this._pumpSlotWaiters(), 250);
        this._pumpSlotWaiters();
      });
    }
    static _release(mediaType = "image") {
      const counter = mediaType === "video" ? "_videoInFlight" : "_inFlight";
      this[counter] = Math.max(0, this[counter] - 1);
      this._pumpSlotWaiters();
    }
    static hasInFlight() {
      return (
        this._inFlight > 0 ||
        this._waiters.length > 0 ||
        this._pacingCount > 0 ||
        this._videoInFlight > 0 ||
        this._videoWaiters.length > 0
      );
    }
    static inFlightCount() {
      return (
        this._inFlight +
        this._waiters.length +
        this._pacingCount +
        this._videoInFlight +
        this._videoWaiters.length
      );
    }
    static async _paceSubmit(delayMs, abortFn) {
      const delay = Math.max(0, Number(delayMs) || 0);
      this._pacingCount++;
      let release;
      const turn = new Promise((resolve) => {
        release = resolve;
      });
      const previous = this._submitPaceTail;
      this._submitPaceTail = previous.catch(() => {}).then(() => turn);
      await previous.catch(() => {});
      try {
        let loggedWait = false;
        while (!abortFn()) {
          const remaining = delay - (Date.now() - this._lastSubmitStartedAt);
          if (remaining <= 0) {
            this._lastSubmitStartedAt = Date.now();
            console.log(
              `${LOG} actual submit pacing granted (delay=${delay}ms)`,
            );
            return true;
          }
          if (!loggedWait) {
            loggedWait = true;
            console.log(
              `${LOG} actual submit pacing wait ${Math.ceil(remaining)}ms`,
            );
          }
          await this._sleep(Math.min(250, remaining));
        }
        return false;
      } finally {
        this._pacingCount = Math.max(0, this._pacingCount - 1);
        release();
      }
    }
    static _rl() {
      return window.ProviderConfigManager?.getFlowApiRateLimitsSync?.() || {};
    }
    static classifyError(error, suppliedType = null) {
      const allowed = new Set([
        "quota_exceeded",
        "per_model_daily",
        "content_blocked",
        "tier_restricted",
        "bot_detected",
        "media_expired",
        "captcha_failed",
        "auth_expired",
        "project_mismatch",
        "schema_changed",
        "server_unavailable",
        "unknown",
      ]);
      const raw = String(error || "").toUpperCase();
      if (
        /\bFLOW_RECOVERY_OBSERVER_(?:UPDATE_REQUIRED|UNAVAILABLE)\b/.test(raw)
      )
        return "unknown";
      if (/NO_FLOW_KEY|TOKEN_EXPIRED/.test(raw)) return "auth_expired";
      const configured =
        window.ProviderConfigManager?.getApiConfigValueSync?.(
          "flow",
          "api_error_codes",
        ) || {};
      for (const [code, type] of Object.entries(configured)) {
        if (raw.includes(String(code).toUpperCase()) && allowed.has(type))
          return type;
      }
      if (allowed.has(suppliedType)) return suppliedType;
      if (/PROJECT.*MISMATCH|WRONG_PROJECT/.test(raw))
        return "project_mismatch";
      if (/SCHEMA|ENDPOINT_MISSING|MODEL_KEY_MISSING|CONFIG_MISSING/.test(raw))
        return "schema_changed";
      if (
        /NETWORK|TIMEOUT|TRANSPORT|BRIDGE.*(?:MISSING|NOT_INSTALLED|CHANNEL|CLOSED)|(?:^|[^A-Z0-9])SERVER(?:[^A-Z0-9]|$)|FETCH/.test(
          raw,
        )
      )
        return "server_unavailable";
      return "unknown";
    }
    static getErrorPolicy(type) {
      const policies = {
        quota_exceeded: {
          retryable: false,
          manualOnly: true,
          fallbackDom: false,
          action: "wait_or_upgrade",
        },
        per_model_daily: {
          retryable: false,
          manualOnly: true,
          fallbackDom: false,
          action: "wait_or_change_model",
        },
        content_blocked: {
          retryable: false,
          manualOnly: true,
          fallbackDom: false,
          action: "edit_prompt",
        },
        tier_restricted: {
          retryable: false,
          manualOnly: true,
          fallbackDom: false,
          action: "change_model",
        },
        bot_detected: {
          retryable: false,
          manualOnly: true,
          fallbackDom: false,
          action: "open_flow",
        },
        captcha_failed: {
          retryable: false,
          manualOnly: true,
          fallbackDom: false,
          action: "open_flow",
        },
        auth_expired: {
          retryable: true,
          manualOnly: false,
          fallbackDom: false,
          action: "reconnect_flow",
        },
        media_expired: {
          retryable: false,
          manualOnly: true,
          fallbackDom: false,
          action: "regen",
        },
        project_mismatch: {
          retryable: false,
          manualOnly: true,
          fallbackDom: false,
          action: "open_project",
        },
        schema_changed: {
          retryable: false,
          manualOnly: true,
          fallbackDom: false,
          action: "update_config",
        },
        server_unavailable: {
          retryable: true,
          retryDelayMs: Number(this._rl().retry_delay_ms) || 0,
          manualOnly: false,
          fallbackDom: false,
          action: "retry",
        },
        unknown: {
          retryable: false,
          manualOnly: true,
          fallbackDom: false,
          action: "regen",
        },
      };
      return policies[type] || policies.unknown;
    }
    static _rawConfig() {
      return window.ProviderConfigManager?.getRawApiConfig?.("flow") || null;
    }
    static async _bridgeFlow(command, params) {
      if (!window.BridgeClient)
        return { ok: false, error: "BRIDGE_CLIENT_MISSING" };
      return await window.BridgeClient.request(command, params);
    }
    static _imageRatio(ratio) {
      const map =
        window.ProviderConfigManager?.getFlowImageRatioMappingSync?.() || {};
      return map[ratio] || map[String(ratio).toLowerCase()] || null;
    }
    static _videoRatio(ratio) {
      const map =
        window.ProviderConfigManager?.getFlowVideoRatioMappingSync?.() || {};
      return map[ratio] || map[String(ratio).toLowerCase()] || null;
    }
    static _imageModel(modelName) {
      const map =
        window.ProviderConfigManager?.getFlowApiModelMappingSync?.() || {};
      const img = map.image || {};
      const canonical = window.ModelRegistry?.getCanonicalValue?.(
        "flow",
        modelName,
      );
      for (const key of [modelName, canonical]) {
        if (
          typeof key !== "string" ||
          !Object.prototype.hasOwnProperty.call(img, key)
        )
          continue;
        const value = img[key];
        if (typeof value === "string" && value.trim()) return value;
      }
      return null;
    }
    static _computeVideoGenType(item, refCount) {
      const isFrames = item?.settings?.isFrames === true;
      if (this._declaredRefVideoIds(item).length > 0) {
        return { genType: "video_edit_video", endpointKey: "video_edit" };
      }
      if (refCount === 0)
        return { genType: "text_2_video", endpointKey: "video_text" };
      if (isFrames && refCount >= 2)
        return {
          genType: "start_end_frame_2_video",
          endpointKey: "video_start_end",
        };
      if (!isFrames && refCount >= 1)
        return {
          genType: "reference_frame_2_video",
          endpointKey: "video_references",
        };
      return { genType: "frame_2_video", endpointKey: "video_generate" };
    }
    static canResolveVideoKey(item) {
      try {
        const refCount = this._refUuids(item).length;
        const { genType } = this._computeVideoGenType(item, refCount);
        const ratioEnum = this._videoRatio(item?.settings?.ratio);
        const tier = this._cachedTier || "PAYGATE_TIER_ONE";
        if (
          !this._videoModelKey(
            genType,
            ratioEnum,
            tier,
            item?.settings?.model,
            item?.settings?.flowVideoDuration,
          )
        )
          return false;
        if (genType === "video_edit_video") {
          if (
            !window.ProviderConfigManager?.getFlowApiEndpointsSync?.()
              ?.video_edit
          ) {
            console.log(
              `${LOG} api_endpoints.video_edit ch\u01B0a seed \u2192 ref video ch\u1EA1y DOM`,
            );
            return false;
          }
          if (!this._videoEditFrames()) {
            console.log(
              `${LOG} api_video_edit ch\u01B0a c\xF3 frame range \u2192 ref video ch\u1EA1y DOM`,
            );
            return false;
          }
          if (this._splitRefUuids(item).videos.length === 0) {
            console.log(
              `${LOG} ref video ch\u01B0a resolve \u0111\u01B0\u1EE3c media identity \u2192 ch\u1EA1y DOM`,
            );
            return false;
          }
        }
        return true;
      } catch (_) {
        return false;
      }
    }
    static isApiModeIntended({
      forWorkflow = false,
      forDownload = false,
      executionMode = null,
    } = {}) {
      try {
        if (!window.FlowApiAdapter || !window.BridgeClient) return false;
        const runtimeDriver = window.SystemConfig?.get?.(
          "flow_api_driver",
          null,
        );
        if (!["v1", "v2", "v2_canary", "auto"].includes(runtimeDriver))
          return false;
        if (
          !forDownload &&
          forWorkflow &&
          window.ExecutionConfig?.getWorkflowFlowApiEnabled?.() !== true
        )
          return false;
        if (
          window.featureGate?.canUse &&
          !window.featureGate.canUse("flow_api_enabled")
        )
          return false;
        const s = window.storageSettings?.getSettings?.() || {};
        const enabled =
          executionMode === "api" ||
          s.apiModeEnabled === true ||
          s.apiModeEnabled === "true" ||
          s.apiModeEnabled === 1;
        if (!enabled) return false;
        if (forDownload) return true;
        const mode = executionMode || s.defaultGenMode || s.gen_mode || "web";
        return mode === "api" || mode === "auto";
      } catch (_) {
        return false;
      }
    }
    static isApiModeRequired({
      forWorkflow = false,
      executionMode = null,
    } = {}) {
      if (!this.isApiModeIntended({ forWorkflow, executionMode })) return false;
      try {
        const settings = window.storageSettings?.getSettings?.() || {};
        return (
          (executionMode ||
            settings.defaultGenMode ||
            settings.gen_mode ||
            "web") === "api"
        );
      } catch (_) {
        return false;
      }
    }
    static async checkSessionReady({
      forceCreditCheck = false,
      requireCreditValidation = false,
      allowAutoHeal = true,
    } = {}) {
      try {
        if (!window.BridgeClient)
          return { ready: false, installed: false, reason: "no_client" };
        const ping = await window.BridgeClient.ping();
        if (!ping?.installed) {
          const explicitlyMissing = ping?.error === "BRIDGE_NOT_INSTALLED";
          return {
            ready: false,
            installed: !explicitlyMissing,
            reason: explicitlyMissing ? "not_installed" : "bridge_timeout",
            detail: ping?.detail || ping?.error || null,
          };
        }
        let st = await window.BridgeClient.getStatus();
        if (st?.tokenReady) {
          const validation = await window.BridgeClient.request(
            "flow_validate_session",
            {
              config: this._rawConfig(),
              force: forceCreditCheck === true,
              allowAutoHeal: allowAutoHeal !== false,
            },
          );
          if (String(validation?.error || "").startsWith("UNKNOWN_METHOD:")) {
            if (requireCreditValidation)
              return {
                ready: false,
                installed: true,
                flowTabOpen: st?.flowTabOpen === true,
                reason: "credit_check_unsupported",
                validation: "unsupported",
              };
            return {
              ready: true,
              installed: true,
              flowTabOpen: st?.flowTabOpen === true,
              validation: "unsupported",
            };
          }
          if (validation?.valid === false) {
            window.BridgeClient.invalidate();
            return {
              ready: false,
              installed: true,
              flowTabOpen: st?.flowTabOpen === true,
              reason: validation?.reason || "login_required",
              validation: "rejected",
            };
          }
          if (validation?.valid !== true)
            return {
              ready: false,
              installed: true,
              flowTabOpen: st?.flowTabOpen === true,
              reason: "validation_unavailable",
              detail: validation?.reason || validation?.error || null,
            };
          return {
            ready: true,
            installed: true,
            flowTabOpen: st?.flowTabOpen === true,
            validation: "verified",
          };
        }
        return {
          ready: false,
          installed: true,
          reason: "no_token",
          flowTabOpen: st?.flowTabOpen === true,
        };
      } catch (_) {
        return { ready: false, installed: true, reason: "bridge_timeout" };
      }
    }
    static async checkBridgeReady(options = {}) {
      const session = await this.checkSessionReady({
        requireCreditValidation: true,
        ...options,
      });
      if (!session?.ready) return session;
      this._lastVerifiedBridgeReady = { ...session, checkedAt: Date.now() };
      return session;
    }
    static async checkBridgeUiReady() {
      if (
        window.__flowReloadSyncInProgress === true &&
        this._lastVerifiedBridgeReady?.ready === true
      ) {
        return {
          ...this._lastVerifiedBridgeReady,
          preservedDuringReload: true,
        };
      }
      return this.checkBridgeReady();
    }
    static async checkGenerationReady() {
      return this.checkBridgeReady({
        forceCreditCheck: true,
        requireCreditValidation: true,
      });
    }
    static async openGoogleFlowLogin() {
      const opened = await window.BridgeClient?.request(
        "open_flow_login_manual",
        {
          manualLogin: true,
          userInitiated: true,
          force: true,
          loginGuidance: window.I18n?.t("settings.bridgeLoginWaiting") || null,
        },
      );
      window.BridgeClient?.invalidate();
      if (!opened?.ok)
        return {
          ready: false,
          recoveryStarted: false,
          reason: String(opened?.error || "").startsWith("UNKNOWN_METHOD:")
            ? "FLOW_LOGIN_BRIDGE_UPDATE_REQUIRED"
            : opened?.error || "FLOW_LOGIN_OPEN_FAILED",
        };
      return {
        ready: false,
        recoveryStarted: true,
        reason: "login_required",
        tabId: opened.tabId,
      };
    }
    static async refreshBridgeConnection() {
      try {
        if (!window.BridgeClient)
          return { ready: false, installed: false, reason: "no_client" };
        const before = await window.BridgeClient.getStatus(true);
        if (!before?.installed) {
          const explicitlyMissing = before?.error === "BRIDGE_NOT_INSTALLED";
          return {
            ready: false,
            installed: !explicitlyMissing,
            reason: explicitlyMissing ? "not_installed" : "bridge_timeout",
            detail: before?.detail || before?.error || null,
          };
        }
        const current = await this.checkBridgeReady({ forceCreditCheck: true });
        if (current?.ready) return current;
        window.BridgeClient.invalidate();
        const finalHealth = await this.checkBridgeReady({
          forceCreditCheck: true,
        });
        if (finalHealth?.ready) return { ...finalHealth, healthRetried: true };
        const opened = await window.BridgeClient.request("open_flow_login", {
          loginGuidance: window.I18n?.t("settings.bridgeLoginWaiting") || null,
          userInitiated: true,
          force: true,
          config: this._rawConfig(),
        });
        if (
          opened?.ok === true &&
          opened.backgroundRecovery === true &&
          opened.validated !== true
        ) {
          return {
            ready: false,
            installed: true,
            recoveryStarted: true,
            reason: "connection_unverified",
            detail: opened.validationReason || opened.bootstrapError || null,
          };
        }
        if (String(opened?.error || "").startsWith("UNKNOWN_METHOD:")) {
          return {
            ready: false,
            installed: true,
            reason: "capability_missing",
            detail: opened.error,
          };
        }
        if (opened?.ok === true) {
          const previousTokenAge = Number(before?.tokenAgeMs);
          for (let attempt = 0; attempt < 10; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            window.BridgeClient.invalidate();
            const status = await window.BridgeClient.getStatus(true);
            const currentTokenAge = Number(status?.tokenAgeMs);
            const tokenRefreshed =
              status?.tokenReady === true &&
              (!Number.isFinite(previousTokenAge) ||
                (Number.isFinite(currentTokenAge) &&
                  currentTokenAge + 750 < previousTokenAge));
            if (!tokenRefreshed) continue;
            const settled2 = await this.checkBridgeReady({
              forceCreditCheck: true,
            });
            if (settled2?.ready)
              return {
                ...settled2,
                recoveryStarted: true,
                healthRetried: true,
                settledAfterRecovery: true,
              };
            break;
          }
          const settled = await this.checkBridgeReady({
            forceCreditCheck: true,
          });
          if (settled?.ready)
            return {
              ...settled,
              recoveryStarted: true,
              healthRetried: true,
              settledAfterRecovery: true,
            };
        }
        return {
          ready: false,
          installed: true,
          recoveryStarted: opened?.ok === true,
          reason: opened?.ok === true ? "login_required" : "login_open_failed",
          detail:
            opened?.error ||
            finalHealth?.detail ||
            finalHealth?.reason ||
            current?.reason ||
            null,
          healthRetried: true,
        };
      } catch (error) {
        return {
          ready: false,
          installed: true,
          reason: "bridge_timeout",
          detail: error?.message || null,
        };
      }
    }
    static async checkDownloadReady({
      mediaType = "image",
      requireUpscale = false,
      forWorkflow = false,
    } = {}) {
      if (!requireUpscale) return { ready: true, reason: "native_url_ready" };
      if (!this.isApiModeIntended({ forWorkflow })) {
        return { ready: false, reason: "api_mode_disabled" };
      }
      const bridge = await this.checkBridgeReady();
      if (!bridge?.ready) return bridge;
      if (requireUpscale) {
        const capability =
          mediaType === "video" ? "flow_upscale_video" : "flow_upscale_image";
        let supported = false;
        try {
          supported = await window.BridgeClient.hasCapability(capability);
        } catch (_) {}
        if (!supported)
          return {
            ready: false,
            installed: true,
            reason: "capability_missing",
            capability,
          };
      }
      return { ready: true, installed: true };
    }
    static _videoModelKey(genType, videoRatioEnum, tier, modelName, duration) {
      const keys =
        window.ProviderConfigManager?.getFlowVideoModelKeysSync?.() || {};
      const modelConfig =
        keys.by_model && modelName ? keys.by_model[modelName] : null;
      const tierConfig =
        tier &&
        modelName &&
        typeof keys.by_tier?.[tier]?.[modelName] === "object"
          ? keys.by_tier[tier][modelName]
          : null;
      const entry = tierConfig?.[genType] || modelConfig?.[genType] || null;
      return this._resolveKeyEntry(entry, videoRatioEnum, duration) || null;
    }
    static _resolveKeyEntry(entry, ratioEnum, duration) {
      if (!entry) return null;
      if (typeof entry === "string") return entry;
      if (typeof entry !== "object") return null;
      const dur = duration ? String(duration).replace(/[^0-9a-z]/gi, "") : null;
      if (dur && typeof entry[dur] === "string") return entry[dur];
      if (
        dur &&
        entry[dur] &&
        typeof entry[dur] === "object" &&
        entry[dur][ratioEnum]
      )
        return entry[dur][ratioEnum];
      if (typeof entry[ratioEnum] === "string") return entry[ratioEnum];
      if (dur && typeof entry[dur + "s"] === "string") return entry[dur + "s"];
      if (typeof entry.default === "string") return entry.default;
      const vals = Object.values(entry).filter((v) => typeof v === "string");
      return vals[0] || null;
    }
    static _videoResolutionEnum(label) {
      const map =
        window.ProviderConfigManager?.getFlowVideoResolutionsSync?.() || {};
      return (
        map[label] ||
        map[String(label).toLowerCase()] ||
        "VIDEO_RESOLUTION_1080P"
      );
    }
    static _maxVideoRefs(modelValue) {
      try {
        const fa = window.ProviderRegistry?.get?.("flow");
        const total = fa?.getMaxRefImagesTotal?.(modelValue);
        if (Number.isFinite(total) && total > 0) return total;
        const cap = fa?.getMaxRefImages?.({ mode: "image", modelValue });
        if (Number.isFinite(cap) && cap > 0) return cap;
      } catch (_) {}
      return 3;
    }
    static _imageInputType(kind) {
      const map =
        window.ProviderConfigManager?.getFlowImageInputTypesSync?.() || {};
      if (kind === "base") return map.base || "IMAGE_INPUT_TYPE_BASE_IMAGE";
      if (kind === "asset") return map.asset || "IMAGE_USAGE_TYPE_ASSET";
      return map.reference || "IMAGE_INPUT_TYPE_REFERENCE";
    }
    static _uuid4() {
      try {
        return crypto.randomUUID();
      } catch (_) {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === "x" ? r : (r & 3) | 8;
          return v.toString(16);
        });
      }
    }
    static async _resolveTier() {
      if (this._cachedTier && Date.now() - this._tierAt < 3e5)
        return this._cachedTier;
      try {
        const r = await this._bridgeFlow("flow_resolve_tier", {
          config: this._rawConfig(),
        });
        const t = r?.tier;
        if (typeof t === "string" && t.startsWith("PAYGATE_TIER_")) {
          this._cachedTier = t;
          this._tierAt = Date.now();
          return t;
        }
      } catch (_) {}
      return "PAYGATE_TIER_ONE";
    }
    static async _resolveProjectId(item) {
      const known =
        item?.projectId ||
        item?.settings?.projectId ||
        window._currentProjectId ||
        window._flowProjectId ||
        window.__flowActiveProjectId;
      if (known) return known;
      const title =
        item?.settings?.taskName || item?.settings?.label || "TobyFlow";
      const r = await this._bridgeFlow("flow_create_project", {
        config: this._rawConfig(),
        input: { title },
      });
      if (!r || !r.ok || !r.projectId)
        throw new Error(`CREATE_PROJECT_FAILED: ${(r && r.error) || "no_id"}`);
      const pid = r.projectId;
      try {
        window._flowProjectId = pid;
      } catch (_) {}
      return pid;
    }
    static isApiUploadMode() {
      try {
        if (!window.BridgeClient) return false;
        const runtimeDriver = window.SystemConfig?.get?.(
          "flow_api_driver",
          null,
        );
        if (!["v1", "v2", "v2_canary", "auto"].includes(runtimeDriver))
          return false;
        if (
          window.featureGate?.canUse &&
          !window.featureGate.canUse("flow_api_enabled")
        )
          return false;
        const s = window.storageSettings?.getSettings?.() || {};
        const enabled =
          s.apiModeEnabled === true ||
          s.apiModeEnabled === "true" ||
          s.apiModeEnabled === 1;
        if (!enabled) return false;
        const mode = s.defaultGenMode || s.gen_mode || "web";
        return mode === "api" || mode === "auto";
      } catch (_) {
        return false;
      }
    }
    static async _requireApiUploadRuntime() {
      try {
        await window.SystemConfig?.fetch?.();
      } catch (_) {}
      const mode = window.SystemConfig?.get?.("flow_api_driver", null);
      if (["v1", "v2", "v2_canary", "auto"].includes(mode)) return mode;
      const code =
        mode === "disabled"
          ? "SYSTEM_DRIVER_DISABLED"
          : "SYSTEM_CONFIG_MISSING";
      const error = new Error(code);
      error.code = code;
      error.stage = "pre_dispatch";
      error.noRetry = true;
      throw error;
    }
    static async uploadRefFromFile({ base64, mimeType, fileName }) {
      await this._requireApiUploadRuntime();
      if (!(await window.BridgeClient.isAvailable())) return null;
      const projectId = await this._resolveProjectId({});
      const uuid = await this.uploadRef(projectId, {
        base64,
        mimeType,
        fileName,
      });
      const thumb = base64
        ? `data:${mimeType || "image/jpeg"};base64,${String(base64).replace(/^data:[^;]+;base64,/, "")}`
        : null;
      return {
        success: true,
        tile_id: uuid,
        file_name: uuid,
        thumbnail_url: thumb,
        gen_mode: "api",
      };
    }
    static async uploadRef(projectId, input) {
      await this._requireApiUploadRuntime();
      let imageBytes = input.base64;
      let mimeType = input.mimeType || "image/jpeg";
      if (!imageBytes && input.url) {
        const resp = await fetch(input.url, { credentials: "include" });
        const blob = await resp.blob();
        mimeType = blob.type || mimeType;
        imageBytes = await this._blobToBase64(blob);
      }
      if (!imageBytes) throw new Error("UPLOAD_REF_NO_BYTES");
      imageBytes = String(imageBytes).replace(/^data:[^;]+;base64,/, "");
      const r = await this._bridgeFlow("flow_upload_ref", {
        config: this._rawConfig(),
        input: {
          imageBytes,
          mimeType,
          fileName: input.fileName || "ref.jpg",
          projectId,
        },
      });
      if (!r || !r.ok)
        throw new Error(`UPLOAD_REF_FAILED: ${(r && r.error) || "unknown"}`);
      if (!r.uuid || !this._isUuid(r.uuid))
        throw new Error("UPLOAD_REF_BAD_UUID");
      return r.uuid;
    }
    static _blobToBase64(blob) {
      return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () =>
          resolve(String(fr.result).replace(/^data:[^;]+;base64,/, ""));
        fr.onerror = () => reject(new Error("BLOB_READ_FAILED"));
        fr.readAsDataURL(blob);
      });
    }
    static _isUuid(s) {
      return (
        typeof s === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          s,
        )
      );
    }
    static _isAsbMediaId(s) {
      return (
        typeof s === "string" &&
        /^[A-Za-z0-9_-]{32,1024}$/.test(s) &&
        !this._isUuid(s)
      );
    }
    static _resolveRefUuid(item, id) {
      const names = item?.refFileNames || {};
      const direct = names[id];
      if (this._isUuid(direct)) return direct;
      if (this._isUuid(id)) return id;
      const asbCandidates = new Set();
      const collectAsb = (value) => {
        if (this._isAsbMediaId(value)) asbCandidates.add(value);
      };
      collectAsb(direct);
      collectAsb(id);
      const mediaMaps = [
        item?.resultThumbnails,
        item?.refThumbnails,
        item?.resultProviderUrls,
        item?.refProviderUrls,
      ];
      const videoUrlUuids = new Set();
      const collectVideoUuid = (value) => {
        if (typeof value !== "string") return;
        const match = value.match(
          /^https:\/\/flow-content\.google\/video\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\?[^#]*)?$/i,
        );
        if (match) videoUrlUuids.add(match[1].toLowerCase());
      };
      for (const map of mediaMaps) {
        const record =
          map && typeof map === "object" && !Array.isArray(map)
            ? map[id]
            : null;
        const explicitUuid = record?.media_uuid || record?.mediaUuid;
        if (this._isUuid(explicitUuid)) return explicitUuid;
        const aliasUuids = [
          ...new Set(
            (Array.isArray(record?.identity_aliases)
              ? record.identity_aliases
              : []
            )
              .filter((alias) => this._isUuid(alias))
              .map((alias) => alias.toLowerCase()),
          ),
        ];
        if (aliasUuids.length === 1) return aliasUuids[0];
        if (aliasUuids.length > 1) return null;
        collectVideoUuid(record?.video_url);
        collectVideoUuid(record?.videoUrl);
        collectAsb(record?.persistent_media_id);
        collectAsb(record?.persistentMediaId);
        collectAsb(record?.media_id);
        collectAsb(record?.mediaId);
        collectAsb(record?.file_name);
        for (const alias of Array.isArray(record?.identity_aliases)
          ? record.identity_aliases
          : []) {
          collectAsb(alias);
        }
      }
      if (videoUrlUuids.size > 1) return null;
      if (this._isAsbMediaId(id)) {
        const aliases = [
          ...new Set(
            Object.entries(names)
              .filter(([key, value]) => this._isUuid(key) && value === id)
              .map(([key]) => key.toLowerCase()),
          ),
        ];
        if (aliases.length === 1) return aliases[0];
        if (aliases.length > 1) return null;
      }
      const mentions = Array.isArray(item?.mentionData?.refImages)
        ? item.mentionData.refImages
        : [];
      const mention = mentions.find(
        (ref) => ref?.file_id === id || ref?.id === id,
      );
      if (this._isUuid(mention?.file_name)) return mention.file_name;
      if (this._isUuid(mention?.media_uuid)) return mention.media_uuid;
      collectAsb(mention?.persistent_media_id);
      collectAsb(mention?.media_id);
      collectAsb(mention?.file_name);
      if (videoUrlUuids.size === 1) return [...videoUrlUuids][0];
      try {
        const registered = window.MediaRegistry?.getFileName?.(id);
        if (this._isUuid(registered)) return registered;
        collectAsb(registered);
      } catch (_) {}
      const cached = window.GenTab?.fileNameCache?.[id];
      if (this._isUuid(cached)) return cached;
      collectAsb(cached);
      const cachedMediaUuid = window.GenTab?.mediaUuidCache?.[id];
      if (this._isUuid(cachedMediaUuid)) return cachedMediaUuid;
      const uploadedMediaUuid =
        window.MediaRegistry?.getRefIdentity?.(id)?.media_uuid;
      if (this._isUuid(uploadedMediaUuid)) return uploadedMediaUuid;
      collectVideoUuid(window.GenTab?.refVideoUrls?.[id]);
      if (videoUrlUuids.size === 1) return [...videoUrlUuids][0];
      return asbCandidates.size === 1 ? [...asbCandidates][0] : null;
    }
    static _resolveRefs(item) {
      const ids = item?.refFileIds || [];
      const resolved = [];
      const unresolved = [];
      for (const id of ids) {
        const uuid = this._resolveRefUuid(item, id);
        if (!uuid) unresolved.push(id);
        else resolved.push(uuid);
      }
      return { resolved, unresolved, declared: ids.length };
    }
    static _refUuids(item) {
      const {
        resolved: out,
        unresolved: bo,
        declared,
      } = this._resolveRefs(item);
      if (bo.length) {
        const m =
          `${LOG} ${bo.length}/${declared} ref KH\xD4NG gi\u1EA3i ra media identity \u2192 b\u1ECF: ` +
          bo.map((x) => String(x).substring(0, 16)).join(", ");
        if (out.length === 0)
          console.warn(m + " \u2014 gen s\u1EBD KH\xD4NG c\xF3 ref n\xE0o");
        else console.log(m);
      }
      const unique = [...new Set(out)];
      const model = item?.settings?.model;
      const adapter = window.ProviderRegistry?.get?.("flow");
      if (
        /video/i.test(item?.settings?.genType || "") &&
        this._declaredRefVideoIds(item).length
      ) {
        const split = this._splitRefUuids(item);
        return [...split.videos, ...split.images];
      }
      const imageCap = adapter?.getMaxRefImages?.({
        mode: /video/i.test(item?.settings?.genType || "") ? "video" : "image",
        isFrames: item?.settings?.isFrames === true,
        modelValue: model,
      });
      const totalCap = adapter?.getMaxRefImagesTotal?.(model);
      const caps = [
        imageCap,
        totalCap,
        ...(item?.settings?.isFrames === true ? [2] : []),
      ].filter((value) => Number.isInteger(value) && value >= 0);
      return unique.slice(0, caps.length ? Math.min(...caps) : unique.length);
    }
    static _splitRefUuids(item) {
      const ids = item?.refFileIds || [];
      const vidIds = new Set(item?.settings?.refVideoIds || []);
      const vidUuids = new Set(
        [...vidIds].map((id) => this._resolveRefUuid(item, id)).filter(Boolean),
      );
      const images = [],
        videos = [];
      for (const id of ids) {
        const uuid = this._resolveRefUuid(item, id);
        if (!uuid) continue;
        (vidIds.has(id) || vidUuids.has(uuid) ? videos : images).push(uuid);
      }
      const model = item?.settings?.model;
      const adapter = window.ProviderRegistry?.get?.("flow");
      const imageCap = adapter?.getMaxRefImages?.({
        mode: "video",
        modelValue: model,
      });
      const videoCap = adapter?.getMaxRefVideos?.(model);
      const totalCap = adapter?.getMaxRefImagesTotal?.(model);
      const keptVideos = [...new Set(videos)].slice(
        0,
        Number.isInteger(videoCap) && videoCap >= 0 ? Math.min(videoCap, 1) : 1,
      );
      const keptImages = [...new Set(images)].slice(
        0,
        Number.isInteger(imageCap) && imageCap >= 0 ? imageCap : images.length,
      );
      const total =
        Number.isInteger(totalCap) && totalCap >= 0 ? totalCap : Infinity;
      return {
        videos: keptVideos.slice(0, total),
        images: keptImages.slice(0, Math.max(0, total - keptVideos.length)),
      };
    }
    static _declaredRefVideoIds(item) {
      const declared = item?.settings?.refVideoIds;
      if (!Array.isArray(declared) || declared.length === 0) return [];
      const ids = new Set(item?.refFileIds || []);
      const activeUuids = new Set(
        [...ids].map((id) => this._resolveRefUuid(item, id)).filter(Boolean),
      );
      return declared.filter(
        (id) => ids.has(id) || activeUuids.has(this._resolveRefUuid(item, id)),
      );
    }
    static _videoEditFrames() {
      const cfg = window.ProviderConfigManager?.getApiConfigValueSync?.(
        "flow",
        "api_video_edit",
      );
      if (!cfg || typeof cfg !== "object") return null;
      const start = Number(cfg.start_frame_index);
      const end = Number(cfg.end_frame_index);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
        return null;
      return { start, end };
    }
    static async upscaleVideo(
      mediaId,
      ratioLabel,
      resolutionLabel,
      abortFn,
      projectId = null,
    ) {
      const ratioEnum = this._videoRatio(ratioLabel);
      const resolutionEnum = this._videoResolutionEnum(resolutionLabel);
      const keys =
        window.ProviderConfigManager?.getFlowVideoModelKeysSync?.() || {};
      const upModelKey =
        keys.upscale?.[resolutionEnum] ||
        (resolutionEnum === "VIDEO_RESOLUTION_4K"
          ? "veo_3_1_upsampler_4k"
          : "veo_3_1_upsampler_1080p");
      const pid =
        projectId || window._currentProjectId || window._flowProjectId || null;
      if (!pid) return { ok: false, error: "UPSCALE_NO_PROJECT" };
      const tier = await this._resolveTier();
      const r = await this._bridgeFlow("flow_upscale_video", {
        config: this._rawConfig(),
        input: {
          mediaId,
          projectId: pid,
          tier,
          ratioEnum,
          resolutionEnum,
          upModelKey,
        },
      });
      if (!r || !r.ok)
        return { ok: false, error: (r && r.error) || "UPSCALE_FAILED" };
      let videoUrl = r.videoUrl;
      if (!videoUrl && r.videoBase64) {
        videoUrl = await this._cleanVideoBase64(r.videoBase64);
        if (!videoUrl) {
          try {
            videoUrl = this._base64ToBlobUrl(r.videoBase64, "video/mp4");
          } catch (_) {}
        }
      }
      return {
        ok: true,
        videoUrl,
        mediaId: r.mediaId,
        revoke: this._ownedBlobUrls.has(videoUrl),
      };
    }
    static async upscaleImage(
      mediaId,
      resolutionLabel,
      abortFn,
      projectId = null,
    ) {
      const map =
        window.ProviderConfigManager?.getFlowImageUpsampleResolutionsSync?.() ||
        {};
      const targetResolution =
        map[resolutionLabel] || map[String(resolutionLabel).toLowerCase()];
      if (!targetResolution)
        return { ok: false, error: "UPSAMPLE_RESOLUTION_UNMAPPED" };
      const pid =
        projectId || window._currentProjectId || window._flowProjectId || null;
      if (!pid) return { ok: false, error: "UPSCALE_NO_PROJECT" };
      const tier = await this._resolveTier();
      const r = await this._bridgeFlow("flow_upscale_image", {
        config: this._rawConfig(),
        input: { mediaId, projectId: pid, tier, targetResolution },
      });
      if (!r || !r.ok)
        return { ok: false, error: (r && r.error) || "UPSAMPLE_FAILED" };
      return { ok: true, base64: r.base64, mime: r.mime, mediaId: r.mediaId };
    }
    static async _pollVideoById(mediaId, projectId, abortFn, onPolled) {
      const rl = this._rl();
      const interval =
        rl.poll_interval_ms && rl.poll_interval_ms >= 5e3
          ? rl.poll_interval_ms
          : 1e4;
      const timeout = rl.video_timeout_ms || 42e4;
      const start = Date.now();
      const config = this._rawConfig();
      while (Date.now() - start < timeout) {
        if (abortFn && abortFn()) return { ok: false, error: "ABORTED" };
        await this._sleep(interval);
        if (abortFn && abortFn()) return { ok: false, error: "ABORTED" };
        const r = await this._bridgeFlow("flow_poll_video", {
          config,
          mediaId,
          projectId,
        });
        try {
          await onPolled?.(r);
        } catch (_) {}
        if (r && r.ok) {
          if (r.status === "done")
            return {
              ok: true,
              videoUrl: r.videoUrl,
              posterUrl: r.posterUrl,
              videoBase64: r.videoBase64,
              durableUrl: r.durableUrl,
              mediaId,
            };
          if (r.status === "failed") {
            const _json = (v) => {
              try {
                return JSON.stringify(v);
              } catch (_) {
                return String(v);
              }
            };
            console.warn(`${LOG} Video gen FAILED (mediaId=${mediaId})
  failureReason: ${r.failureReason ? _json(r.failureReason) : "(Google kh\xF4ng tr\u1EA3 l\xFD do)"}
  rawStatus: ${_json(r.rawStatus)}
  metadataKeys: ${_json(r.rawMetadataKeys)}`);
            const fr = r.failureReason;
            const codeMsg = !fr
              ? null
              : typeof fr === "string"
                ? fr
                : fr.message || fr.reason || fr.code || _json(fr);
            const reasons =
              Array.isArray(r.failureReasons) && r.failureReasons.length
                ? r.failureReasons
                : Array.isArray(r.rawStatus?.failureReasons)
                  ? r.rawStatus.failureReasons
                  : [];
            let friendly = null;
            try {
              const map =
                window.ProviderConfigManager?.getApiConfigValueSync?.(
                  "flow",
                  "api_error_codes",
                ) || {};
              const et = map[codeMsg] || map[reasons[0]];
              if (et) friendly = window.I18n?.t?.("gen.flowErr_" + et) || null;
            } catch (_) {}
            const detail = reasons[0] || codeMsg || null;
            const msg = friendly
              ? `${friendly}${detail ? ` (${detail})` : ""}`
              : detail
                ? `VIDEO_FAILED: ${detail}`
                : "VIDEO_FAILED";
            return { ok: false, error: msg.slice(0, 300) };
          }
        }
      }
      return { ok: false, error: "POLL_TIMEOUT" };
    }
    static async _cleanVideoBase64(b64) {
      try {
        if (!b64 || !self.VideoWmClient) return null;
        if (!self.WatermarkClient?.enabled?.("video")) return null;
        const cfgResp = await chrome.runtime.sendMessage({
          action: "getWatermarkConfig",
          mediaType: "video",
        });
        if (!cfgResp?.success) return null;
        const blob = await (await fetch(`data:video/mp4;base64,${b64}`)).blob();
        const r = await self.VideoWmClient.process(blob, cfgResp.cfg, {});
        if (!r?.applied) return null;
        return this._createOwnedBlobUrl(r.blob);
      } catch (e) {
        console.warn(
          "[FlowApi] E33 b\u1ECF qua xo\xE1 watermark video:",
          e?.message,
        );
        return null;
      }
    }
    static _base64ToBlobUrl(b64, mime) {
      const bin = atob(b64);
      const len = bin.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
      return this._createOwnedBlobUrl(new Blob([bytes], { type: mime }));
    }
    static _createOwnedBlobUrl(blob) {
      const url = URL.createObjectURL(blob);
      this._ownedBlobUrls.add(url);
      return url;
    }
    static revokeOwnedBlobUrl(url) {
      if (!this._ownedBlobUrls.delete(url)) return false;
      URL.revokeObjectURL(url);
      return true;
    }
    static releaseResultBlobUrls(items = [], retainedUrls = new Set()) {
      for (const item of items) {
        for (const info of Object.values(item?.resultThumbnails || {})) {
          if (!info || typeof info !== "object") continue;
          if (!retainedUrls.has(info.video_url))
            this.revokeOwnedBlobUrl(info.video_url);
          if (!retainedUrls.has(info.thumbnail))
            this.revokeOwnedBlobUrl(info.thumbnail);
        }
      }
    }
    static _extractUuid(obj) {
      if (!obj) return null;
      if (this._isUuid(obj.mediaId)) return obj.mediaId;
      if (this._isUuid(obj.name)) return obj.name;
      const m = JSON.stringify(obj).match(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      );
      return m ? m[0] : null;
    }
    static async _resolveMediaEventually(
      config,
      mediaId,
      mediaType,
      options = {},
    ) {
      const rl = this._rl() || {};
      const attempts =
        options.singleAttempt === true
          ? 1
          : Math.max(1, Math.min(Number(rl.max_retries) || 1, 10));
      const delayMs = Math.max(0, Number(rl.poll_interval_ms) || 0);
      let result = null;
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        result = await this._bridgeFlow("flow_resolve_media", {
          config,
          mediaId,
          mediaType,
        });
        if (result?.ok && (result.url || result.base64)) {
          console.log(`${LOG} media consistency resolved`, {
            mediaType,
            attempt,
            hasUrl: !!result.url,
            hasBase64: !!result.base64,
          });
          return result;
        }
        if (
          /^(UNKNOWN_METHOD|BRIDGE_CLIENT_MISSING|FORBIDDEN|TOKEN_EXPIRED|NO_FLOW_KEY)/.test(
            String(result?.error || ""),
          )
        )
          break;
        if (attempt < attempts && delayMs > 0) await this._sleep(delayMs);
      }
      console.warn(
        `${LOG} media consistency exhausted`,
        JSON.stringify({
          mediaType,
          attempts,
          error: result?.error || null,
          status: result?.status || null,
        }),
      );
      return result;
    }
    static async resolveMediaUrl(mediaId, mediaType = "video") {
      const config = this._rawConfig();
      const startedAt = Date.now();
      const auditId = typeof mediaId === "string" ? mediaId.slice(0, 8) : null;
      if (!this._isUuid(mediaId) || !config || !window.BridgeClient) {
        console.warn(`${LOG} resolve media unavailable:`, {
          mediaUuid: auditId,
          mediaType,
          validMediaId: this._isUuid(mediaId),
          hasConfig: !!config,
          hasBridgeClient: !!window.BridgeClient,
        });
        return null;
      }
      try {
        console.info(`${LOG} media URL resolve start`, {
          mediaUuid: auditId,
          mediaType,
        });
        const result = await this._resolveMediaEventually(
          config,
          mediaId,
          mediaType,
        );
        if (!result?.ok) {
          console.warn(`${LOG} resolve media failed`, {
            mediaUuid: auditId,
            mediaType,
            error: result?.error || "unknown",
            elapsedMs: Date.now() - startedAt,
          });
          return null;
        }
        const url = result.url || result.durableUrl || null;
        if (!url) return null;
        let expiresAt = null;
        try {
          expiresAt = Number(new URL(url).searchParams.get("Expires")) || null;
        } catch (_) {}
        console.info(`${LOG} media URL resolve success`, {
          mediaUuid: auditId,
          mediaType,
          source: result.source || null,
          httpStatus: result.status || null,
          contentType: result.contentType || null,
          responseKeys: Array.isArray(result.responseKeys)
            ? result.responseKeys
            : [],
          host: (() => {
            try {
              return new URL(url).host;
            } catch (_) {
              return null;
            }
          })(),
          expiresAt,
          expiresInSec: expiresAt
            ? Math.round(expiresAt - Date.now() / 1e3)
            : null,
          elapsedMs: Date.now() - startedAt,
        });
        return { url, mediaId, revoke: false };
      } catch (error) {
        console.warn(
          `${LOG} resolve media exception:`,
          error?.message || error,
        );
        return null;
      }
    }
    static async resolveMediaDownload(
      mediaId,
      mediaType = "image",
      options = {},
    ) {
      const config = this._rawConfig();
      if (!this._isUuid(mediaId) || !config || !window.BridgeClient)
        return null;
      try {
        const result = await this._resolveMediaEventually(
          config,
          mediaId,
          mediaType,
          options,
        );
        if (!result?.ok) {
          console.warn(
            `${LOG} download media resolve failed:`,
            JSON.stringify({
              mediaType,
              mediaUuid: mediaId.slice(0, 8),
              error: result?.error || "unknown",
              status: result?.status || null,
            }),
          );
          if (options.singleAttempt)
            throw Object.assign(
              new Error(result?.error || "FLOW_DOWNLOAD_NOT_READY"),
              result || {},
            );
          return null;
        }
        const servingUrl =
          typeof result.url === "string" &&
          !result.url.includes("media.getMediaUrlRedirect")
            ? result.url
            : null;
        const base64 =
          typeof result.base64 === "string" && result.base64.length > 0
            ? result.base64
            : null;
        if (!servingUrl && !base64) {
          console.warn(
            `${LOG} download media resolve failed:`,
            JSON.stringify({ mediaType, error: "NO_SERVING_MEDIA" }),
          );
          return null;
        }
        const inferredMime =
          mediaType === "video"
            ? "video/mp4"
            : base64?.startsWith("iVBOR")
              ? "image/png"
              : base64?.startsWith("UklGR")
                ? "image/webp"
                : "image/jpeg";
        return { url: servingUrl, base64, mime: inferredMime, mediaId };
      } catch (error) {
        console.warn(
          `${LOG} download media resolve exception:`,
          error?.message || error,
        );
        if (options.singleAttempt) throw error;
        return null;
      }
    }
    static _extractMediaUrl(obj, mediaId = null) {
      if (!obj || typeof obj !== "object") return null;
      const seen = new Set();
      const candidates = [];
      const visit = (value, depth) => {
        if (value == null || depth > 8) return;
        if (typeof value === "string") {
          if (/^https?:\/\//i.test(value)) candidates.push(value);
          return;
        }
        if (typeof value !== "object" || seen.has(value)) return;
        seen.add(value);
        if (Array.isArray(value))
          value.forEach((entry) => visit(entry, depth + 1));
        else Object.values(value).forEach((entry) => visit(entry, depth + 1));
      };
      visit(obj, 0);
      if (!candidates.length) return null;
      if (mediaId) {
        const matching = candidates.find((url) => url.includes(mediaId));
        if (matching) return matching;
      }
      return (
        candidates.find((url) =>
          /flow-content\.google|flow\.google\.com\/asb\//i.test(url),
        ) || candidates[0]
      );
    }
    static _sleep(ms) {
      return new Promise((r) => setTimeout(r, ms));
    }
    static async submit(item, opts = {}) {
      const abortFn = opts.abortFn || (() => false);
      const gateMediaType = /video/i.test(item?.settings?.genType || "")
        ? "video"
        : "image";
      if (!(await this._acquire(abortFn, gateMediaType)))
        return this._fail(item, "ABORTED");
      try {
        const paced = await this._paceSubmit(
          item?.settings?.apiSubmitDelayMs,
          abortFn,
        );
        if (!paced) {
          item.completedAt = Date.now();
          if (window.QueueItem) item.state = window.QueueItem.STATE.CANCELLED;
          else item.state = "CANCELLED";
          return item;
        }
        while (opts.isPausedFn?.() && !abortFn()) await this._sleep(200);
        if (abortFn()) return this._fail(item, "ABORTED");
        await opts.onBeforeSubmit?.();
        if (abortFn()) return this._fail(item, "ABORTED");
        try {
          opts.onSlotAcquired?.();
        } catch (_) {}
        if (!window.BridgeClient) throw new Error("BRIDGE_CLIENT_MISSING");
        const tier = opts.tier || (await this._resolveTier());
        const projectId = await this._resolveProjectId(item);
        item.projectId = projectId;
        if (abortFn()) return this._fail(item, "ABORTED");
        const isVideo = /video/i.test(item.settings?.genType || "");
        if (isVideo)
          return await this._submitVideo(
            projectId,
            item,
            tier,
            abortFn,
            opts.onDispatchStarted,
            opts.onAccepted,
          );
        return await this._submitImage(
          projectId,
          item,
          tier,
          abortFn,
          opts.onDispatchStarted,
        );
      } catch (error) {
        if (abortFn()) return this._fail(item, "ABORTED");
        throw error;
      } finally {
        this._release(gateMediaType);
      }
    }
    static async _submitImage(
      projectId,
      item,
      tier,
      abortFn,
      onDispatchStarted = null,
    ) {
      const config = this._rawConfig();
      if (!config) return this._fail(item, "FLOW_CONFIG_MISSING");
      const model = this._imageModel(item.settings?.model);
      if (!model) {
        if (abortFn()) return this._fail(item, "ABORTED");
        item.noRetry = true;
        return this._fail(
          item,
          `MODEL_OPTION_NOT_FOUND: ${String(item.settings?.model || "").slice(0, 100)}`,
        );
      }
      if (onDispatchStarted) await onDispatchStarted();
      const r = await this._bridgeFlow("flow_generate", {
        kind: "image",
        config,
        input: {
          projectId,
          tier,
          prompt: item.prompt || "",
          refUuids: this._refUuids(item),
          aspect: this._imageRatio(item.settings?.ratio),
          model,
          isEdit: item.settings?.editMode === true,
          quantity: item.settings?.quantity,
          inputTypeBase: this._imageInputType("base"),
          inputTypeRef: this._imageInputType("reference"),
        },
      });
      if (abortFn()) return this._fail(item, "ABORTED");
      if (!r || !r.ok) {
        const message = this._googleFailureMessage(r, "IMAGE_SUBMIT_FAILED");
        if (Number(r?.status) >= 500) {
          throw Object.assign(new Error(message), {
            code: message,
            errorType: r?.errorType || "server_error_500",
            dispatchStarted: true,
            ambiguous: true,
          });
        }
        return this._fail(item, message, r && r.errorType);
      }
      const media = r.media || [];
      if (!media.length) return this._fail(item, "IMAGE_NO_MEDIA");
      const resultTileIds = [],
        resultThumbnails = {},
        resultFileNames = {},
        resultProviderUrls = {};
      for (const m of media) {
        const uuid = this._isUuid(m.name) ? m.name : this._extractUuid(m);
        if (!uuid) continue;
        let fifeUrl =
          m?.image?.generatedImage?.fifeUrl ||
          m?.image?.fifeUrl ||
          m?.fifeUrl ||
          m?.servingUri ||
          m?.resolved_url ||
          this._extractMediaUrl(m, uuid) ||
          null;
        if (!fifeUrl) {
          const resolved = await this._resolveMediaEventually(
            config,
            uuid,
            "image",
          );
          fifeUrl = resolved?.ok ? resolved.url || null : null;
        }
        const durableUrl = m.durable_url || null;
        resultTileIds.push(uuid);
        resultFileNames[uuid] = uuid;
        resultThumbnails[uuid] = {
          thumbnail: fifeUrl,
          type: "image",
          file_name: uuid,
          media_uuid: uuid,
          persistent_media_id: uuid,
          identity_kind: "flow-api-uuid",
          identity_durability: "durable-resolver",
          api_driver: "v1",
          protocol_revision: 1,
        };
        resultProviderUrls[uuid] = {
          url: fifeUrl || durableUrl || null,
          durable_url: durableUrl,
          provider: "flow",
          media_type: "image",
          project_id: projectId,
          media_uuid: uuid,
          persistent_media_id: uuid,
          identity_kind: "flow-api-uuid",
          identity_durability: "durable-resolver",
          api_driver: "v1",
          protocol_revision: 1,
          captured_at: Date.now(),
        };
      }
      if (!resultTileIds.length) return this._fail(item, "IMAGE_NO_UUID");
      console.log(
        "[FlowApiAdapter] image result mapped:",
        JSON.stringify({
          count: resultTileIds.length,
          thumbnails: Object.values(resultThumbnails).filter(
            (entry) => !!entry?.thumbnail,
          ).length,
          durableUrls: Object.values(resultProviderUrls).filter(
            (entry) => !!entry?.durable_url,
          ).length,
          mediaKeys: media.map((entry) =>
            Object.keys(entry || {}).slice(0, 12),
          ),
        }),
      );
      return this._complete(item, {
        resultTileIds,
        resultThumbnails,
        resultFileNames,
        resultProviderUrls,
      });
    }
    static async _submitVideo(
      projectId,
      item,
      tier,
      abortFn,
      onDispatchStarted = null,
      onAccepted = null,
    ) {
      const config = this._rawConfig();
      if (!config) return this._fail(item, "FLOW_CONFIG_MISSING");
      const refUuids = this._refUuids(item);
      const ratioEnum = this._videoRatio(item.settings?.ratio);
      const { genType, endpointKey } = this._computeVideoGenType(
        item,
        refUuids.length,
      );
      const videoModelKey = this._videoModelKey(
        genType,
        ratioEnum,
        tier,
        item.settings?.model,
        item.settings?.flowVideoDuration,
      );
      if (!videoModelKey)
        return this._fail(
          item,
          `VIDEO_MODEL_KEY_MISSING: ${genType}/${ratioEnum}`,
        );
      const generationResolutionCfg =
        window.ModelRegistry?.getGenerationResolutionConfig?.(
          "flow",
          item.settings?.model,
        );
      const generationResolution = generationResolutionCfg?.options?.find?.(
        (o) => o.value === item.settings?.flowVideoResolution,
      );
      const resolutionEnum =
        generationResolution?.api_value ||
        generationResolution?.dom_value ||
        null;
      const modelKeySuffix = generationResolution?.api_model_key_suffix || "";
      const effectiveVideoModelKey =
        modelKeySuffix && !videoModelKey.endsWith(modelKeySuffix)
          ? `${videoModelKey}${modelKeySuffix}`
          : videoModelKey;
      const _isEdit = genType === "video_edit_video";
      let editVideoUuid = null,
        editFrames = null,
        imageRefUuids = refUuids;
      if (_isEdit) {
        const split = this._splitRefUuids(item);
        editVideoUuid = split.videos[0] || null;
        imageRefUuids = split.images;
        editFrames = this._videoEditFrames();
        if (!editVideoUuid) return this._fail(item, "VIDEO_EDIT_NO_VIDEO_UUID");
        if (!editFrames) return this._fail(item, "VIDEO_EDIT_FRAMES_MISSING");
        if (split.videos.length > 1) {
          console.warn(
            `${LOG} ${split.videos.length} ref video \u2014 Flow ch\u1EC9 nh\u1EADn 1, d\xF9ng c\xE1i \u0111\u1EA7u`,
          );
        }
      }
      if (onDispatchStarted) await onDispatchStarted();
      const r = await this._bridgeFlow("flow_generate", {
        kind: "video",
        config,
        input: {
          projectId,
          tier,
          prompt: item.prompt || "",
          refUuids: imageRefUuids,
          ratioEnum,
          resolutionEnum,
          videoModelKey: effectiveVideoModelKey,
          genType,
          endpointKey,
          maxRefs: this._maxVideoRefs(item.settings?.model),
          inputTypeAsset: this._imageInputType("asset"),
          ...(_isEdit && {
            editVideoUuid,
            editStartFrame: editFrames.start,
            editEndFrame: editFrames.end,
          }),
        },
      });
      if (abortFn()) return this._fail(item, "ABORTED");
      if (!r || !r.ok) {
        console.warn(
          "[FlowApiAdapter] Video submit fail:",
          JSON.stringify({
            error: r && r.error,
            status: r && r.status,
            reason: r && r.reason,
            errorType: r && r.errorType,
            genType,
            endpointKey,
            videoModelKey: effectiveVideoModelKey,
            refCount: refUuids.length,
            imageRefCount: imageRefUuids.length,
            videoRefCount: editVideoUuid ? 1 : 0,
            hasProject: !!projectId,
          }),
        );
        const message = this._googleFailureMessage(r, "VIDEO_SUBMIT_FAILED");
        if (Number(r?.status) >= 500) {
          throw Object.assign(new Error(message), {
            code: message,
            errorType: r?.errorType || "server_error_500",
            dispatchStarted: true,
            ambiguous: true,
          });
        }
        return this._fail(item, message, r && r.errorType);
      }
      if (!r.mediaId) return this._fail(item, "NO_MEDIA_ID");
      item.mediaId = r.mediaId;
      item.operationId = r.mediaId;
      item.flowOperationId = r.operationId || r.mediaId;
      item.state = window.QueueItem
        ? window.QueueItem.STATE.MONITORING
        : "MONITORING";
      await this._saveCheckpoint(item, "MONITORING");
      try {
        onAccepted?.();
      } catch (_) {}
      const poll = await this._pollVideoById(
        r.mediaId,
        projectId,
        abortFn,
        () => this._saveCheckpoint(item, "MONITORING"),
      );
      if (!poll.ok) {
        const failed = this._fail(item, poll.error);
        await this._removeCheckpoint(item.operationId);
        return failed;
      }
      const uuid = poll.mediaId || this._uuid4();
      let videoUrl = poll.videoUrl;
      const videoDurableUrl = poll.durableUrl || null;
      let posterUrl = poll.posterUrl || null;
      if (!videoUrl) {
        try {
          const resolved = await this._resolveMediaEventually(
            config,
            uuid,
            "video",
          );
          if (resolved?.ok && resolved.url) videoUrl = resolved.url;
        } catch (error) {
          console.warn(
            `${LOG} immediate video URL resolve failed:`,
            error?.message || error,
          );
        }
      }
      if (!videoUrl && poll.videoBase64 && !abortFn?.()) {
        videoUrl = await this._cleanVideoBase64(poll.videoBase64);
        if (!videoUrl) {
          try {
            videoUrl = this._base64ToBlobUrl(poll.videoBase64, "video/mp4");
          } catch (_) {}
        }
      }
      if (!posterUrl) {
        try {
          const resolvedPoster = await this._resolveMediaEventually(
            config,
            uuid,
            "image",
          );
          if (resolvedPoster?.ok && resolvedPoster.url)
            posterUrl = resolvedPoster.url;
        } catch (error) {
          console.warn(
            `${LOG} immediate video poster resolve failed:`,
            error?.message || error,
          );
        }
      }
      if (abortFn?.()) {
        this.revokeOwnedBlobUrl(videoUrl);
        await this._removeCheckpoint(item.operationId);
        return this._fail(item, "ABORTED");
      }
      const previewVideoUrl = videoUrl || null;
      console.log(`${LOG} video result mapped`, {
        mediaId: uuid,
        hasVideoUrl: !!poll.videoUrl,
        hasVideoBase64: !!poll.videoBase64,
        hasPosterUrl: !!posterUrl,
        hasDurableUrl: !!poll.durableUrl,
        finalPreviewKind: previewVideoUrl
          ? String(previewVideoUrl).startsWith("blob:")
            ? "blob"
            : videoUrl
              ? "remote"
              : "durable"
          : "none",
      });
      const resultTileIds = [uuid];
      const resultThumbnails = {
        [uuid]: {
          thumbnail: posterUrl || previewVideoUrl,
          type: "video",
          video_url: previewVideoUrl,
          file_name: uuid,
          media_uuid: uuid,
          persistent_media_id: uuid,
          identity_kind: "flow-api-uuid",
          identity_durability: "durable-resolver",
          api_driver: "v1",
          protocol_revision: 1,
          ...(posterUrl && {
            source_thumbnail: posterUrl,
            thumb_is_poster: true,
          }),
        },
      };
      const resultFileNames = { [uuid]: uuid };
      const videoSrcUrl =
        videoUrl && !String(videoUrl).startsWith("blob:") ? videoUrl : null;
      const resultProviderUrls = {
        [uuid]: {
          url: videoSrcUrl || videoDurableUrl || null,
          durable_url: videoDurableUrl,
          provider: "flow",
          media_type: "video",
          project_id: projectId,
          media_uuid: uuid,
          persistent_media_id: uuid,
          identity_kind: "flow-api-uuid",
          identity_durability: "durable-resolver",
          api_driver: "v1",
          protocol_revision: 1,
          captured_at: Date.now(),
        },
      };
      const done = this._complete(item, {
        resultTileIds,
        resultThumbnails,
        resultFileNames,
        resultProviderUrls,
      });
      if (
        item._owner !== "workflow" &&
        opts_wantsFrame(item) &&
        previewVideoUrl
      ) {
        try {
          const frame = await window.VideoFrameExtractor.extractLastFrame(
            previewVideoUrl,
            { provider: "flow" },
          );
          if (frame?.base64) {
            const uploadFrame = async () => ({
              ok: true,
              file_id: await this.uploadRef(projectId, {
                base64: frame.base64,
                mimeType: "image/jpeg",
                fileName: "lastframe.jpg",
              }),
            });
            const executor = window.workflowExecutor;
            const uploadResult =
              item._owner === "workflow" && executor?._withWorkflowUploadToast
                ? await executor._withWorkflowUploadToast(
                    {
                      node_name:
                        executor._queue?.getJob?.(item.jobId)?.label || "",
                    },
                    "lastFrame",
                    uploadFrame,
                  )
                : await uploadFrame();
            const frameUuid = uploadResult.file_id;
            item.resultFrameFileIds = [frameUuid];
            item.resultFrameFileNames = { [frameUuid]: frameUuid };
            item.resultFrameThumbnails = {
              [frameUuid]: {
                thumbnail: null,
                type: "image",
                file_name: frameUuid,
                media_uuid: frameUuid,
                source_file_id: uuid,
                persistent_media_id: frameUuid,
                identity_kind: "flow-api-uuid",
                identity_durability: "durable-resolver",
                api_driver: "v1",
                protocol_revision: 1,
              },
            };
            item.resultFrameProviderUrls = {
              [frameUuid]: {
                provider: "flow",
                media_type: "image",
                project_id: projectId,
                media_uuid: frameUuid,
                persistent_media_id: frameUuid,
                identity_kind: "flow-api-uuid",
                identity_durability: "durable-resolver",
                api_driver: "v1",
                protocol_revision: 1,
                captured_at: Date.now(),
              },
            };
          }
        } catch (e) {
          item.chainHandoffError = "LAST_FRAME_HANDOFF_FAILED";
          console.warn(
            LOG,
            "last-frame extract/upload failed:",
            e?.message || e,
          );
        }
        if (!item.resultFrameFileIds?.length)
          item.chainHandoffError =
            item.chainHandoffError || "LAST_FRAME_HANDOFF_EMPTY";
      }
      await this._removeCheckpoint(item.operationId);
      return done;
    }
    static _complete(item, res) {
      if (item.state === "CANCELLED") return this._fail(item, "ABORTED");
      item.resultTileIds = res.resultTileIds;
      item.resultThumbnails = res.resultThumbnails;
      item.resultFileNames = res.resultFileNames;
      item.resultProviderUrls = res.resultProviderUrls;
      item.syncCompletedOutputs?.(res.resultTileIds, res.resultThumbnails);
      item.tileId = res.resultTileIds[0] || null;
      item.genMode = "api";
      item.completedAt = Date.now();
      if (window.QueueItem) item.state = window.QueueItem.STATE.COMPLETED;
      else item.state = "COMPLETED";
      return { ok: true, item };
    }
    static _googleFailureMessage(response, fallback) {
      const parts = [];
      const add = (value) => {
        if (typeof value === "string" || typeof value === "number") {
          const text = String(value).trim();
          if (text && !parts.includes(text)) parts.push(text);
        } else if (value && typeof value === "object") {
          add(value.message);
          add(value.code);
          add(value.reason);
        }
      };
      add(response?.error);
      add(response?.reason);
      for (const reason of Array.isArray(response?.failureReasons)
        ? response.failureReasons
        : [])
        add(reason);
      if (response?.status) add(`HTTP ${response.status}`);
      return parts.join(" \xB7 ").slice(0, 1200) || fallback;
    }
    static isUnverifiedResult(error) {
      const raw = String(error?.code || error?.message || error || "")
        .replace(/^Google Flow:\s*/, "")
        .trim();
      const codes = [
        "FLOW_RECOVERY_ACCEPTANCE_UNKNOWN",
        "FLOW_RECOVERY_RESULT_UNVERIFIED",
        "FLOW_RECOVERY_RETIRED_RESULT",
        "FLOW_RECOVERY_DUPLICATE_RESULT",
        "FLOW_RECOVERY_MEDIA_OWNER_CONFLICT",
        "V2_OPERATION_TIMEOUT",
      ];
      if (codes.includes(raw)) return true;
      return [
        ...codes.map((code) => "flowErrors.codes." + code),
        "gen.flowErr_unknown",
      ].some((key) => {
        const text = window.I18n?.t?.(key);
        return text && text !== key && raw === text;
      });
    }
    static formatError(error, errorType) {
      const raw = String(error || "API_FAILED");
      if (
        /^(?:Google Flow:\s*)?(?:SUBMIT_NOT_TRIGGERED:\s*)?FLOW_CREDIT_LIMIT$/.test(
          raw,
        )
      ) {
        const key2 = "flow.creditLimitHit";
        const translated2 = window.I18n?.t?.(key2);
        return translated2 && translated2 !== key2 ? translated2 : raw;
      }
      const modelContract =
        /^(?:Google Flow:\s*)?MODEL_OPTION_(?:NOT_FOUND|NOT_APPLIED):\s*(.{1,160})$/.exec(
          raw,
        );
      if (modelContract) {
        const key2 = "gen.flowModelUnavailable";
        const translated2 = window.I18n?.t?.(key2, {
          model: modelContract[1].trim(),
        });
        return translated2 && translated2 !== key2 ? translated2 : raw;
      }
      const providerPrefixed =
        /^([^:\n]{1,80}):\s*((?:(?:[A-Za-z][A-Za-z0-9_]{2,119}|HTTP \d{3}|gRPC \d{1,2}|Google status \d{1,2}))(?:\s*[,·]\s*(?:[A-Za-z][A-Za-z0-9_]{2,119}|HTTP \d{3}|gRPC \d{1,2}|Google status \d{1,2})){0,15})$/.exec(
          raw,
        );
      if (providerPrefixed) {
        const translatedCode = this.formatError(providerPrefixed[2], errorType);
        if (translatedCode !== providerPrefixed[2])
          return `${providerPrefixed[1]}: ${translatedCode}`;
      }
      const commaCodes = raw.split(/\s*,\s*/);
      if (
        commaCodes.length > 1 &&
        commaCodes.length <= 16 &&
        commaCodes.every((part) => /^[A-Za-z][A-Za-z0-9_]{2,119}$/.test(part))
      ) {
        return [
          ...new Set(
            commaCodes.map((part) => this.formatError(part, errorType)),
          ),
        ].join(" \xB7 ");
      }
      const parts = raw.split(/\s*·\s*/);
      if (parts.length > 1 && parts.length <= 16) {
        const translatedParts = parts.map((part) =>
          /^(?:[A-Za-z][A-Za-z0-9_]{2,119}|HTTP \d{3}|gRPC \d{1,2}|Google status \d{1,2})$/.test(
            part,
          )
            ? this.formatError(part)
            : part,
        );
        if (translatedParts.some((part, index) => part !== parts[index])) {
          return [...new Set(translatedParts)].join(" \xB7 ");
        }
      }
      const dictionaryCode = /^[A-Za-z][A-Za-z0-9_]{2,119}$/.test(raw);
      const grpc = /^gRPC (\d{1,2})$/.exec(raw);
      const http = /^HTTP (\d{3})$/.exec(raw);
      const status = /^Google status (\d{1,2})$/.exec(raw);
      const dictionaryKey = grpc
        ? "flowErrors.grpc." + grpc[1]
        : http
          ? "flowErrors.http." + http[1]
          : status
            ? "flowErrors.status." + status[1]
            : dictionaryCode
              ? "flowErrors.codes." + raw
              : null;
      const dictionaryText = dictionaryKey
        ? window.I18n?.t?.(dictionaryKey)
        : null;
      if (dictionaryText && dictionaryText !== dictionaryKey)
        return dictionaryText;
      if (
        raw === "REF_UPLOAD_FAILED" ||
        raw === "GEN_API_REFERENCE_UNVERIFIED" ||
        /^FLOW_RECOVERY_OBSERVER_(?:UPDATE_REQUIRED|UNAVAILABLE)$/.test(raw)
      )
        return raw;
      if (grpc || http || status) return raw;
      const type = this.classifyError(raw, errorType);
      const key = "gen.flowErr_" + type;
      const translated = dictionaryCode ? window.I18n?.t?.(key) : null;
      return translated && translated !== key ? translated : raw;
    }
    static _fail(item, error, errorType) {
      const raw = String(error || "API_FAILED");
      if (raw === "ABORTED" || item.state === "CANCELLED") {
        item.state = "CANCELLED";
        item.error = "ABORTED";
        item.errorType = "cancelled";
        item.errorPolicy = null;
        item.genMode = "api";
        item.completedAt = item.completedAt || Date.now();
        return {
          ok: false,
          item,
          error: item.error,
          errorType: item.errorType,
          cancelled: true,
        };
      }
      const resolvedErrorType = this.classifyError(raw, errorType);
      const msg = this.formatError(raw, resolvedErrorType);
      item.error = msg;
      item.syncFailedOutputs?.([], msg);
      item.errorType = resolvedErrorType;
      item.errorPolicy = { ...this.getErrorPolicy(item.errorType), code: raw };
      if (
        ["quota_exceeded", "per_model_daily", "tier_restricted"].includes(
          item.errorType,
        )
      )
        item.noRetry = true;
      item.genMode = "api";
      item.completedAt = Date.now();
      item.state = window.QueueItem ? window.QueueItem.STATE.FAILED : "FAILED";
      return {
        ok: false,
        item,
        error: item.error,
        errorType: item.errorType,
        cancelled: false,
      };
    }
  }
  __publicField(FlowApiAdapter, "_inFlight", 0);
  __publicField(FlowApiAdapter, "_waiters", []);
  __publicField(FlowApiAdapter, "_submitPaceTail", Promise.resolve());
  __publicField(FlowApiAdapter, "_lastSubmitStartedAt", 0);
  __publicField(FlowApiAdapter, "_pacingCount", 0);
  __publicField(FlowApiAdapter, "_checkpointWriteTail", Promise.resolve());
  __publicField(FlowApiAdapter, "_ownedBlobUrls", new Set());
  __publicField(
    FlowApiAdapter,
    "CHECKPOINT_KEY",
    "toby_flow_api_checkpoints_v1",
  );
  __publicField(FlowApiAdapter, "_videoInFlight", 0);
  __publicField(FlowApiAdapter, "_videoWaiters", []);
  __publicField(FlowApiAdapter, "_cachedTier", null);
  __publicField(FlowApiAdapter, "_tierAt", 0);
  function opts_wantsFrame(item) {
    return !!(item && (item._wantsLastFrame || item.settings?.wantsLastFrame));
  }
  if (typeof window !== "undefined") window.FlowApiAdapter = FlowApiAdapter;
  window.addEventListener?.("unload", () => {
    for (const url of FlowApiAdapter._ownedBlobUrls)
      FlowApiAdapter.revokeOwnedBlobUrl(url);
  });
})();
