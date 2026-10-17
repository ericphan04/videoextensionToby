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
  class FlowCookieRecovery {
    static async _withLoading(work, { owner = null, workflowId = null } = {}) {
      if (typeof document === "undefined" || !document.body)
        return await work();
      const translated = (key) => {
        const value = window.I18n?.t?.(key);
        return value && value !== key ? value : null;
      };
      const overlay = document.createElement("div");
      overlay.id = "flow-cookie-recovery-loading";
      overlay.className =
        "tobyflow-loading-overlay flow-cookie-recovery-loading";
      overlay.setAttribute("role", "status");
      overlay.setAttribute("aria-live", "polite");
      overlay.setAttribute("aria-busy", "true");
      const content = document.createElement("div");
      content.className = "tobyflow-loading-content";
      const spinner = document.createElement("div");
      spinner.className = "tobyflow-loading-spinner";
      spinner.setAttribute("aria-hidden", "true");
      const title = document.createElement("p");
      title.className = "flow-cookie-recovery-loading-title";
      title.textContent = translated("flowCookieRecovery.menu") || "";
      const text = document.createElement("p");
      text.className = "tobyflow-loading-text";
      const labels = {
        preparing: "workflow.flowReloadPreparing",
        waiting_pending: "workflow.flowReloadPreparing",
        reloading: "workflow.flowReloading",
        waiting_editor: "workflow.flowReloadWaiting",
        restoring: "workflow.flowReloadRestoring",
      };
      const paint = (stage) => {
        text.textContent =
          translated(labels[stage]) ||
          translated("common.loading") ||
          title.textContent;
      };
      const onState = (data) => {
        if (
          data?.reason !== "user-flow-cookie-recovery" ||
          (owner && data.scope !== owner) ||
          (workflowId && data.workflowId !== workflowId) ||
          !labels[data.stage]
        )
          return;
        paint(data.stage);
      };
      content.append(spinner, title, text);
      overlay.appendChild(content);
      paint("preparing");
      document.body.appendChild(overlay);
      window.eventBus?.on?.("flow:reload_sync_state", onState);
      try {
        return await work();
      } finally {
        window.eventBus?.off?.("flow:reload_sync_state", onState);
        overlay.remove();
      }
    }
    static _logMenuStatus(reason, bridge = null) {
      const status = {
        reason,
        apiActive: this._menuActive === true,
        bridgeVersion: bridge?.version || null,
        bridgeInstalled: bridge ? bridge.installed === true : null,
        cookieCapability: bridge
          ? bridge.capabilities?.includes("flow_clear_cookies_reload") === true
          : null,
        cacheCapability: bridge
          ? bridge.capabilities?.includes("flow_clear_cache_reload") === true
          : null,
      };
      const signature = JSON.stringify(status);
      if (signature === this._menuStatusSignature) return;
      this._menuStatusSignature = signature;
      console.info("[FlowCookieRecovery] menu", signature);
    }
    static async updateMenuVisibility(active) {
      this._menuActive = active === true;
      const button = document.getElementById("clearFlowCookiesBtn");
      if (!button) return;
      const paint = (this._menuPaint = (this._menuPaint || 0) + 1);
      if (!this._menuActive) {
        button.classList.add("hidden");
        this._logMenuStatus("FLOW_API_NOT_ACTIVE");
        return;
      }
      let bridge = null,
        supported = false;
      try {
        bridge = await window.BridgeClient?.ping?.();
        supported = await window.BridgeClient?.supportsFlowCookieRecovery?.();
      } catch (_) {
        if (paint === this._menuPaint) {
          button.classList.add("hidden");
          this._logMenuStatus("BRIDGE_CHECK_FAILED", bridge);
        }
        return;
      }
      if (paint !== this._menuPaint || !this._menuActive) return;
      if (!supported) {
        button.classList.add("hidden");
        this._logMenuStatus("BRIDGE_COOKIE_RECOVERY_UNAVAILABLE", bridge);
        return;
      }
      const label = window.I18n?.t?.("flowCookieRecovery.menu");
      if (!label || label === "flowCookieRecovery.menu") {
        button.classList.add("hidden");
        this._logMenuStatus(
          "MISSING_SERVER_TRANSLATION:flowCookieRecovery.menu",
          bridge,
        );
        return;
      }
      button.querySelector("span").textContent = label;
      button.classList.remove("hidden");
      this._logMenuStatus("VISIBLE", bridge);
    }
    static async showManual() {
      if (
        !this._menuActive ||
        this._flight ||
        window.FlowApiAdapter?.isApiModeIntended?.() !== true ||
        !(await window.BridgeClient?.supportsFlowCookieRecovery?.(true))
      )
        return false;
      const queue = window.PromptQueue?.getInstance?.();
      const t = (key) => {
        const value = window.I18n?.t?.(`flowCookieRecovery.${key}`);
        return value && value !== `flowCookieRecovery.${key}` ? value : null;
      };
      const title = t("menu"),
        message = t("manualMessage"),
        confirmText = t("clear");
      const cancelText = window.I18n?.t?.("common.cancel");
      if (
        !queue ||
        !title ||
        !message ||
        !confirmText ||
        !cancelText ||
        cancelText === "common.cancel" ||
        !window.CustomDialog
      )
        return false;
      if (!queue._flowCookieRecoveryQuiet?.()) {
        const notice = t("busy");
        if (notice) window.showNotification?.(notice, "warning", 6e3);
        return false;
      }
      const expectedTarget = await window.MessageBridge?.getTargetContext?.();
      if (
        !expectedTarget?.tabId ||
        expectedTarget.driverKey !== "flow_v2" ||
        !expectedTarget.projectId
      ) {
        console.info(
          "[FlowCookieRecovery] recovery result",
          JSON.stringify({
            owner: "manual",
            ok: false,
            error: "COOKIE_RECOVERY_PROJECT_MISMATCH",
          }),
        );
        const notice = t("failed");
        if (notice) window.showNotification?.(notice, "warning", 6e3);
        return false;
      }
      if (this._flight) return false;
      const flight = (async () => {
        const dialog = new window.CustomDialog();
        if (
          !(await dialog.confirm(message, {
            title,
            type: "chrome",
            confirmText,
            cancelText,
          }))
        )
          return false;
        const result = await this._withLoading(() =>
          queue.clearFlowCookiesForTest(expectedTarget),
        );
        console.info(
          "[FlowCookieRecovery] recovery result",
          JSON.stringify({
            owner: "manual",
            ok: result?.ok === true,
            error: result?.error || null,
          }),
        );
        const paused = Array.from(queue._jobs.values()).some(
          (job) => job.state === "paused",
        );
        const key = result?.ok
          ? paused
            ? "success"
            : "successIdle"
          : result?.error === "COOKIE_RECOVERY_GENERATION_ACTIVE"
            ? "busy"
            : "failed";
        const notice = t(key);
        if (notice) {
          if (window.showNotification)
            window.showNotification(
              notice,
              result?.ok ? "success" : "warning",
              6e3,
            );
          else
            await dialog.alert(notice, {
              title,
              type: result?.ok ? "success" : "warning",
            });
        }
        return result?.ok === true;
      })();
      this._flight = flight;
      try {
        return await flight;
      } finally {
        if (this._flight === flight) this._flight = null;
      }
    }
    static async show(data = {}, { workflowId = null } = {}) {
      if (
        data.errorType !== "bot_detected" ||
        data.genMode !== "api" ||
        data.paused !== true ||
        !data.jobId ||
        !["prompts", "workflow"].includes(data.owner)
      )
        return false;
      if (
        workflowId
          ? data.owner !== "workflow" || data.workflowId !== workflowId
          : data.owner !== "prompts"
      )
        return false;
      if (!(await window.BridgeClient?.supportsFlowCookieRecovery?.()))
        return false;
      const queue = window.PromptQueue?.getInstance?.();
      const job = queue?.getJob?.(data.jobId);
      if (
        !job ||
        job.state !== "paused" ||
        job.pauseReason !== "api_unusual_activity" ||
        !queue._flowCookieRecoveryQuiet?.() ||
        this._flight ||
        this._seen.has(data.jobId)
      )
        return false;
      const t = (key) => {
        const value = window.I18n?.t?.(`flowCookieRecovery.${key}`);
        return value && value !== `flowCookieRecovery.${key}` ? value : null;
      };
      const title = t("title"),
        message = t("message"),
        confirmText = t("clear"),
        cancelText = window.I18n?.t?.("common.cancel");
      if (
        !title ||
        !message ||
        !confirmText ||
        !cancelText ||
        cancelText === "common.cancel" ||
        !window.CustomDialog
      ) {
        console.warn("[FlowCookieRecovery] dialog translations/UI unavailable");
        job._flowCookieRecoveryOffered = false;
        return false;
      }
      this._seen.add(data.jobId);
      if (this._seen.size > 100)
        this._seen.delete(this._seen.values().next().value);
      const flight = (async () => {
        const dialog = new window.CustomDialog();
        const accepted = await dialog.confirm(message, {
          title,
          type: "chrome",
          confirmText,
          cancelText,
        });
        if (!accepted) return false;
        const result = await this._withLoading(
          () => queue.clearFlowCookiesAndReloadPausedJob(data.jobId),
          { owner: data.owner, workflowId: data.workflowId || null },
        );
        console.info(
          "[FlowCookieRecovery] recovery result",
          JSON.stringify({
            owner: data.owner,
            ok: result?.ok === true,
            error: result?.error || null,
          }),
        );
        const notice = t(
          result?.ok
            ? "success"
            : result?.error === "BRIDGE_COOKIE_RECOVERY_UNAVAILABLE"
              ? "bridgeRequired"
              : "failed",
        );
        if (notice) {
          if (window.showNotification)
            window.showNotification(
              notice,
              result?.ok ? "success" : "error",
              6e3,
            );
          else
            await dialog.alert(notice, {
              title,
              type: result?.ok ? "success" : "error",
            });
        }
        if (!result?.ok)
          console.warn(
            "[FlowCookieRecovery] recovery failed",
            result?.error || "UNKNOWN",
          );
        return result?.ok === true;
      })();
      this._flight = flight;
      try {
        return await flight;
      } finally {
        if (this._flight === flight) this._flight = null;
      }
    }
  }
  __publicField(FlowCookieRecovery, "_flight", null);
  __publicField(FlowCookieRecovery, "_seen", new Set());
  window.FlowCookieRecovery = FlowCookieRecovery;
})();
