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
const _ConfigVersionPoller = class _ConfigVersionPoller {
  static async init() {
    if (this._initialized) return;
    this._initialized = true;
    try {
      const cached = await new Promise((resolve) => {
        if (typeof chrome === "undefined" || !chrome.storage?.local)
          return resolve(null);
        chrome.storage.local.get([this.CACHE_KEY], (res) =>
          resolve(res[this.CACHE_KEY] || null),
        );
      });
      if (
        cached &&
        typeof cached === "object" &&
        Object.keys(cached).length > 0
      ) {
        this._versions = cached;
        this._isFirstInit = false;
        console.log(
          "[ConfigVersionPoller] Loaded cached versions",
          Object.keys(cached).length,
          "modules",
        );
      }
      this._subscribeEvents();
      this._adjustPollingCadence();
      if (this._shouldPoll()) {
        this._startPollingTimer();
        setTimeout(
          () => this.checkAndRefresh({ trigger: "init" }).catch(() => {}),
          2e3,
        );
      }
    } catch (e) {
      console.warn("[ConfigVersionPoller] init error:", e.message);
    }
  }
  static async checkAndRefresh({ trigger = "timer" } = {}) {
    if (
      window.SseBroadcastManager?.isInitialized?.() &&
      !window.SseBroadcastManager.isLeader?.()
    ) {
      return { skipped: "not_leader" };
    }
    if (this._checkInFlight) {
      return { skipped: "in_flight" };
    }
    this._checkInFlight = true;
    try {
      const remoteVersions = await this._fetchVersions();
      if (!remoteVersions) {
        return { skipped: "fetch_failed" };
      }
      if (this._isFirstInit && !this._versions) {
        this._versions = remoteVersions;
        await this._persistVersions(remoteVersions);
        this._isFirstInit = false;
        console.log("[ConfigVersionPoller] Baseline saved (first init)", {
          trigger,
          modules: Object.keys(remoteVersions).length,
        });
        return { baseline: true, checked: Object.keys(remoteVersions).length };
      }
      const updated = [];
      for (const [module, remoteVersion] of Object.entries(remoteVersions)) {
        const cachedVersion = this._versions?.[module];
        if (this._isVersionMismatch(cachedVersion, remoteVersion)) {
          updated.push(module);
          try {
            await this._dispatchUpdate(module, remoteVersion);
          } catch (e) {
            console.warn(
              `[ConfigVersionPoller] dispatch ${module} failed:`,
              e.message,
            );
          }
        }
      }
      this._versions = remoteVersions;
      await this._persistVersions(remoteVersions);
      if (updated.length > 0) {
        console.log(
          `[ConfigVersionPoller] ${trigger} \u2192 updated:`,
          updated,
        );
      }
      return { checked: Object.keys(remoteVersions).length, updated };
    } catch (e) {
      console.warn("[ConfigVersionPoller] checkAndRefresh error:", e.message);
      return { skipped: "error", error: e.message };
    } finally {
      this._checkInFlight = false;
    }
  }
  static setPollingInterval(ms) {
    this._pollingInterval = ms;
    if (this._pollingTimer) {
      this._startPollingTimer();
    }
  }
  static async _fetchVersions() {
    return new Promise((resolve) => {
      let settled = false;
      const TIMEOUT_MS = 8e3;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        console.info(
          "[ConfigVersionPoller] fetch timeout; retaining cached config versions",
        );
        resolve(null);
      }, TIMEOUT_MS);
      try {
        chrome.runtime.sendMessage(
          { action: "apiRequest", method: "GET", endpoint: this.ENDPOINT },
          (resp) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (chrome.runtime.lastError) {
              console.warn(
                "[ConfigVersionPoller] runtime error:",
                chrome.runtime.lastError.message,
              );
              return resolve(null);
            }
            if (resp?.error?.httpStatus === 404 || resp?.httpStatus === 404) {
              if (!this._backwardCompatWarned) {
                console.warn(
                  "[ConfigVersionPoller] /config/versions 404 \u2014 backend ch\u01B0a deploy Phase 5.1, skip polling (backward compat)",
                );
                this._backwardCompatWarned = true;
              }
              return resolve(null);
            }
            if (resp?.success && resp?.data && typeof resp.data === "object") {
              return resolve(resp.data);
            }
            console.warn(
              "[ConfigVersionPoller] invalid response:",
              resp?.error?.message || "no data",
            );
            resolve(null);
          },
        );
      } catch (e) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        console.warn("[ConfigVersionPoller] fetch error:", e.message);
        resolve(null);
      }
    });
  }
  static _isVersionMismatch(cached, remote) {
    if (cached === void 0 || cached === null) return true;
    if (typeof cached !== typeof remote) return true;
    if (typeof remote === "object" && remote !== null) {
      const keys = new Set([
        ...Object.keys(cached || {}),
        ...Object.keys(remote || {}),
      ]);
      for (const k of keys) {
        if (cached?.[k] !== remote?.[k]) return true;
      }
      return false;
    }
    return cached !== remote;
  }
  static async _dispatchUpdate(module, remoteVersion) {
    const handler = this.MODULE_HANDLERS[module];
    if (!handler) {
      return;
    }
    await handler(remoteVersion);
  }
  static _subscribeEvents() {
    if (!window.eventBus) return;
    window.eventBus.on("sse:connected", () => {
      if (!this._shouldPoll()) return;
      console.log("[ConfigVersionPoller] sse:connected \u2192 catch-up check");
      this._adjustPollingCadence();
      this.checkAndRefresh({ trigger: "sse_connected" }).catch(() => {});
    });
    window.eventBus.on("sse:disconnected", () => {
      this._adjustPollingCadence();
    });
    window.eventBus.on("sse:config_versions_bumped", (data) => {
      if (!this._shouldPoll()) return;
      console.log("[ConfigVersionPoller] sse:config_versions_bumped:", data);
      this.checkAndRefresh({ trigger: "sse_bumped" }).catch(() => {});
    });
    window.eventBus.on("broadcast:became_leader", () => {
      console.log("[ConfigVersionPoller] Became leader \u2192 start polling");
      this._startPollingTimer();
      this.checkAndRefresh({ trigger: "became_leader" }).catch(() => {});
    });
    window.eventBus.on("broadcast:became_follower", () => {
      console.log("[ConfigVersionPoller] Became follower \u2192 stop polling");
      this._stopPollingTimer();
    });
  }
  static _adjustPollingCadence() {
    const sseConnected = !!window.SseClient?.isConnected?.();
    const newInterval = sseConnected
      ? this.POLL_INTERVAL_SSE_CONNECTED
      : this.POLL_INTERVAL_SSE_DISCONNECTED;
    if (newInterval !== this._pollingInterval) {
      this._pollingInterval = newInterval;
      console.log(
        `[ConfigVersionPoller] Adjusted polling interval: ${Math.round(newInterval / 6e4)}m (SSE ${sseConnected ? "connected" : "disconnected"})`,
      );
      if (this._pollingTimer) this._startPollingTimer();
    }
  }
  static _shouldPoll() {
    if (!window.SseBroadcastManager?.isInitialized?.()) return true;
    return window.SseBroadcastManager.isLeader?.() === true;
  }
  static _startPollingTimer() {
    this._stopPollingTimer();
    this._pollingTimer = setInterval(() => {
      if (!this._shouldPoll()) {
        this._stopPollingTimer();
        return;
      }
      this.checkAndRefresh({ trigger: "timer" }).catch(() => {});
    }, this._pollingInterval);
  }
  static _stopPollingTimer() {
    if (this._pollingTimer) {
      clearInterval(this._pollingTimer);
      this._pollingTimer = null;
    }
  }
  static async _persistVersions(versions) {
    return new Promise((resolve) => {
      try {
        if (typeof chrome === "undefined" || !chrome.storage?.local)
          return resolve();
        chrome.storage.local.set({ [this.CACHE_KEY]: versions }, resolve);
      } catch (_) {
        resolve();
      }
    });
  }
};
__publicField(_ConfigVersionPoller, "CACHE_KEY", "toby_config_versions");
__publicField(_ConfigVersionPoller, "ENDPOINT", "config/versions");
__publicField(
  _ConfigVersionPoller,
  "POLL_INTERVAL_SSE_CONNECTED",
  30 * 60 * 1e3,
);
__publicField(
  _ConfigVersionPoller,
  "POLL_INTERVAL_SSE_DISCONNECTED",
  5 * 60 * 1e3,
);
__publicField(_ConfigVersionPoller, "MODULE_HANDLERS", {
  system_settings: (v) => window.SystemConfig?._updateFromVersion?.(v),
  providers: (v) => window.ProviderConfigManager?._updateFromVersion?.(v),
  provider_models: (v) => window.ModelRegistry?._updateFromVersion?.(v),
  node_types: (v) => window.NodeTemplates?._updateFromVersion?.(v),
  validation_rules: (v) => window.ValidationRules?._updateFromVersion?.(v),
  default_settings: (v) => window.storageSettings?._updateFromVersion?.(v),
  i18n: (v) => window.I18n?._updateFromVersion?.(v),
  user_entitlements: async (v) => {
    await window.featureGate?._updateFromVersion?.(v);
    await window.RequestSigner?.refreshProtectedPermissions?.();
  },
});
__publicField(_ConfigVersionPoller, "_versions", null);
__publicField(_ConfigVersionPoller, "_pollingTimer", null);
__publicField(
  _ConfigVersionPoller,
  "_pollingInterval",
  _ConfigVersionPoller.POLL_INTERVAL_SSE_DISCONNECTED,
);
__publicField(_ConfigVersionPoller, "_isFirstInit", true);
__publicField(_ConfigVersionPoller, "_initialized", false);
__publicField(_ConfigVersionPoller, "_checkInFlight", false);
__publicField(_ConfigVersionPoller, "_backwardCompatWarned", false);
let ConfigVersionPoller = _ConfigVersionPoller;
window.ConfigVersionPoller = ConfigVersionPoller;
