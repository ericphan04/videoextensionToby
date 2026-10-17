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
class GrokSession {
  static _bindRuntimeListeners() {
    if (this._listenersBound) return;
    this._listenersBound = true;
    if (!chrome?.runtime?.onMessage) return;
    chrome.runtime.onMessage.addListener((message) => {
      if (!message || typeof message.action !== "string") return;
      if (message.action === "grok:tabClosed") {
        if (!this._tabId || message.tabId === this._tabId) {
          this._resetCache();
          this._emit("grok:error", { error: "TAB_CLOSED" });
        }
      } else if (message.action === "grok:navigatedBroadcast") {
        if (this._tabId && message.tabId === this._tabId) {
          const url = message.url || "";
          const inImagine = url.includes("/imagine");
          if (!inImagine) {
            this._currentMode = null;
            this._currentRatio = null;
            this._currentQuantity = null;
            this._currentDuration = null;
            this._currentResolution = null;
            this._currentImageQuality = null;
          }
          this._ready = false;
          this._lastCheck = 0;
        }
      }
    });
  }
  static _resetCache() {
    this._tabId = null;
    this._ready = false;
    this._lastCheck = 0;
    this._currentMode = null;
    this._currentRatio = null;
    this._currentQuantity = null;
    this._currentDuration = null;
    this._currentResolution = null;
    this._currentImageQuality = null;
  }
  static _emit(eventName, data) {
    try {
      if (window.eventBus && typeof window.eventBus.emit === "function") {
        window.eventBus.emit(eventName, data || {});
      }
    } catch (err) {}
  }
  static _sendToBackground(action, payload = {}) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ action, ...payload }, (resp) => {
          if (chrome.runtime.lastError) {
            reject(
              new Error(chrome.runtime.lastError.message || "Runtime error"),
            );
            return;
          }
          if (!resp) {
            reject(
              new Error(
                "Kh\xF4ng nh\u1EADn \u0111\u01B0\u1EE3c ph\u1EA3n h\u1ED3i t\u1EEB background",
              ),
            );
            return;
          }
          resolve(resp);
        });
      } catch (err) {
        reject(err);
      }
    });
  }
  static async ensureReady(options = {}) {
    this._bindRuntimeListeners();
    const {
      createIfMissing = true,
      activate = true,
      focusWindow = false,
      silent = false,
      forceCheck = false,
    } = options;
    if (
      !forceCheck &&
      this._ready &&
      this._tabId &&
      Date.now() - this._lastCheck < this._readyTtlMs
    ) {
      if (activate) {
        if (focusWindow) {
          await this._sendToBackground("grok:ensureActive", {
            tabId: this._tabId,
            focusWindow,
          }).catch(() => {});
        } else {
          this._sendToBackground("grok:ensureActive", {
            tabId: this._tabId,
            focusWindow,
          }).catch(() => {});
        }
      }
      return { ready: true, tabId: this._tabId };
    }
    try {
      const findResp = await this._sendToBackground("grok:findOrCreateTab", {
        createIfMissing,
        activate,
      });
      if (!findResp.success || !findResp.tabId) {
        const error = findResp.error || "NO_TAB";
        this._emit("grok:error", { error });
        return { ready: false, error };
      }
      this._tabId = findResp.tabId;
      if (activate) {
        const activeResp = await this._sendToBackground("grok:ensureActive", {
          tabId: this._tabId,
          focusWindow,
        });
        if (!activeResp.success) {
          console.warn(
            "[GrokSession] Kh\xF4ng activate \u0111\u01B0\u1EE3c tab:",
            activeResp.error,
          );
        }
      }
      const injectResp = await this._sendToBackground("grok:injectScript", {
        tabId: this._tabId,
      });
      if (!injectResp.success) {
        const error = injectResp.error || "INJECT_FAILED";
        this._emit("grok:error", { error });
        return { ready: false, error, tabId: this._tabId };
      }
      const loginResp = await this._sendToBackground("grok:checkLogin", {
        tabId: this._tabId,
      });
      if (!loginResp.success || !loginResp.ready) {
        const error = loginResp.error || "NOT_LOGGED_IN";
        if (!silent) {
          if (error === "NOT_LOGGED_IN") {
            this._emit("grok:login_required", { tabId: this._tabId });
          } else {
            this._emit("grok:error", { error });
          }
        }
        return { ready: false, error, tabId: this._tabId };
      }
      this._ready = true;
      this._lastCheck = Date.now();
      this._emit("grok:ready", { tabId: this._tabId });
      return { ready: true, tabId: this._tabId };
    } catch (err) {
      console.error("[GrokSession] ensureReady l\u1ED7i:", err.message);
      this._emit("grok:error", { error: err.message });
      return { ready: false, error: err.message };
    }
  }
  static async setMode(mode) {
    this._bindRuntimeListeners();
    if (!this.VALID_MODES.includes(mode)) {
      return { success: false, error: "INVALID_MODE_KEY" };
    }
    if (this._currentMode === mode) {
      return { success: true };
    }
    if (!this._tabId) {
      return { success: false, error: "NO_TAB" };
    }
    try {
      const resp = await this._sendToBackground("grok:applySettings", {
        tabId: this._tabId,
        settings: { mode },
      });
      if (!resp.success) {
        this._setModeFailCount++;
        if (this._setModeFailCount >= 2) {
          this._fallbackPrefixMode = true;
          this._fallbackUntil = Date.now() + this._fallbackWindowMs;
          this._showFallbackToast();
        }
        const error = resp.error || "SET_MODE_FAILED";
        this._emit("grok:error", { error });
        return { success: false, error };
      }
      this._setModeFailCount = 0;
      this._fallbackPrefixMode = false;
      this._fallbackUntil = 0;
      this._currentMode = mode;
      this._emit("grok:mode_set", { mode });
      return { success: true };
    } catch (err) {
      console.error("[GrokSession] setMode l\u1ED7i:", err.message);
      this._setModeFailCount++;
      if (this._setModeFailCount >= 2) {
        this._fallbackPrefixMode = true;
        this._fallbackUntil = Date.now() + this._fallbackWindowMs;
        this._showFallbackToast();
      }
      this._emit("grok:error", { error: err.message });
      return { success: false, error: err.message };
    }
  }
  static _showFallbackToast() {
    try {
      const msg =
        "Grok mode kh\xF4ng kh\u1EA3 d\u1EE5ng, \u0111ang d\xF9ng fallback prefix";
      if (
        window.NotificationManager &&
        typeof window.NotificationManager.showToast === "function"
      ) {
        window.NotificationManager.showToast(msg, "warning");
      } else {
        console.warn("[GrokSession]", msg);
      }
    } catch (err) {}
  }
  static async setRatio(ratio) {
    this._bindRuntimeListeners();
    const ratioKey = this._normalizeRatioKey(ratio);
    if (!ratioKey) {
      return { success: false, error: "INVALID_RATIO_KEY" };
    }
    if (this._currentRatio === ratioKey) {
      return { success: true };
    }
    if (!this._tabId) {
      return { success: false, error: "NO_TAB" };
    }
    try {
      const resp = await this._sendToBackground("grok:setRatio", {
        tabId: this._tabId,
        ratio: ratioKey,
      });
      if (!resp.success) {
        const error = resp.error || "SET_RATIO_FAILED";
        this._emit("grok:error", { error });
        return { success: false, error };
      }
      this._currentRatio = ratioKey;
      this._emit("grok:ratio_set", { ratio: ratioKey });
      return { success: true };
    } catch (err) {
      console.error("[GrokSession] setRatio l\u1ED7i:", err.message);
      this._emit("grok:error", { error: err.message });
      return { success: false, error: err.message };
    }
  }
  static _normalizeRatioKey(input) {
    if (!input) return null;
    const lower = String(input).trim().toLowerCase();
    if (this.VALID_RATIOS.includes(lower)) return lower;
    const displayMap = {
      "2:3": "portrait",
      "3:2": "landscape",
      "1:1": "square",
      "9:16": "story",
      "16:9": "widescreen",
    };
    return displayMap[lower] || null;
  }
  static async setVideoDuration(duration) {
    this._bindRuntimeListeners();
    if (!this.VALID_DURATIONS.includes(duration)) {
      return { success: false, error: "INVALID_DURATION" };
    }
    if (this._currentDuration === duration) {
      return { success: true };
    }
    if (!this._tabId) {
      return { success: false, error: "NO_TAB" };
    }
    try {
      const resp = await this._sendToBackground("grok:applySettings", {
        tabId: this._tabId,
        settings: { duration },
      });
      if (!resp.success) {
        const error = resp.error || "SET_DURATION_FAILED";
        this._emit("grok:error", { error });
        return { success: false, error };
      }
      this._currentDuration = duration;
      return { success: true };
    } catch (err) {
      console.error("[GrokSession] setVideoDuration l\u1ED7i:", err.message);
      this._emit("grok:error", { error: err.message });
      return { success: false, error: err.message };
    }
  }
  static async setVideoResolution(resolution) {
    this._bindRuntimeListeners();
    if (!this.VALID_RESOLUTIONS.includes(resolution)) {
      return { success: false, error: "INVALID_RESOLUTION" };
    }
    if (this._currentResolution === resolution) {
      return { success: true };
    }
    if (!this._tabId) {
      return { success: false, error: "NO_TAB" };
    }
    try {
      const resp = await this._sendToBackground("grok:applySettings", {
        tabId: this._tabId,
        settings: { resolution },
      });
      if (!resp.success) {
        const error = resp.error || "SET_RESOLUTION_FAILED";
        this._emit("grok:error", { error });
        return { success: false, error };
      }
      this._currentResolution = resolution;
      return { success: true };
    } catch (err) {
      console.error("[GrokSession] setVideoResolution l\u1ED7i:", err.message);
      this._emit("grok:error", { error: err.message });
      return { success: false, error: err.message };
    }
  }
  static async setImageQuality(quality) {
    this._bindRuntimeListeners();
    const lower = String(quality || "").toLowerCase();
    if (!this.VALID_IMAGE_QUALITIES.includes(lower)) {
      return { success: false, error: "INVALID_IMAGE_QUALITY" };
    }
    if (this._currentImageQuality === lower) {
      return { success: true };
    }
    if (!this._tabId) {
      return { success: false, error: "NO_TAB" };
    }
    try {
      const resp = await this._sendToBackground("grok:applySettings", {
        tabId: this._tabId,
        settings: { imageQuality: lower, mode: "image" },
      });
      if (!resp.success) {
        const error = resp.error || "SET_IMAGE_QUALITY_FAILED";
        this._emit("grok:error", { error });
        return { success: false, error };
      }
      this._currentImageQuality = lower;
      return { success: true };
    } catch (err) {
      console.error("[GrokSession] setImageQuality l\u1ED7i:", err.message);
      this._emit("grok:error", { error: err.message });
      return { success: false, error: err.message };
    }
  }
  static async ensureTabActive(options = {}) {
    this._bindRuntimeListeners();
    if (!this._tabId) return;
    const focusWindow = options.focusWindow !== false;
    try {
      await this._sendToBackground("grok:ensureActive", {
        tabId: this._tabId,
        focusWindow,
      });
    } catch (err) {
      console.warn("[GrokSession] ensureTabActive l\u1ED7i:", err.message);
    }
  }
  static async checkStatus() {
    this._bindRuntimeListeners();
    if (!this._tabId) {
      return { loggedIn: false, cloudflareChallenge: false, error: "NO_TAB" };
    }
    try {
      const resp = await new Promise((resolve) => {
        chrome.tabs.sendMessage(
          this._tabId,
          { action: "grok:checkStatus" },
          (r) => {
            if (chrome.runtime.lastError) {
              resolve({
                loggedIn: false,
                cloudflareChallenge: false,
                error: chrome.runtime.lastError.message,
              });
            } else {
              resolve(r || { loggedIn: false, cloudflareChallenge: false });
            }
          },
        );
      });
      return resp;
    } catch (err) {
      console.warn("[GrokSession] checkStatus error:", err.message);
      return {
        loggedIn: false,
        cloudflareChallenge: false,
        error: err.message,
      };
    }
  }
  static async getTabInfo() {
    this._bindRuntimeListeners();
    if (!this._tabId) {
      return { tabId: null, url: null, active: false, mode: this._currentMode };
    }
    try {
      const resp = await this._sendToBackground("grok:getTabInfo", {
        tabId: this._tabId,
      });
      return {
        tabId: this._tabId,
        url: resp?.url || null,
        active: !!resp?.active,
        mode: this._currentMode,
      };
    } catch (err) {
      return {
        tabId: this._tabId,
        url: null,
        active: false,
        mode: this._currentMode,
      };
    }
  }
  static async closeTab() {
    this._bindRuntimeListeners();
    if (!this._tabId) return;
    try {
      await this._sendToBackground("grok:closeTab", { tabId: this._tabId });
    } catch (err) {
      console.warn("[GrokSession] closeTab l\u1ED7i:", err.message);
    } finally {
      this._resetCache();
    }
  }
  static isFallbackPrefixActive() {
    return this._fallbackPrefixMode && Date.now() < this._fallbackUntil;
  }
}
__publicField(GrokSession, "_tabId", null);
__publicField(GrokSession, "_ready", false);
__publicField(GrokSession, "_lastCheck", 0);
__publicField(GrokSession, "_readyTtlMs", 60 * 1e3);
__publicField(GrokSession, "_currentMode", null);
__publicField(GrokSession, "_currentRatio", null);
__publicField(GrokSession, "_currentQuantity", null);
__publicField(GrokSession, "_currentDuration", null);
__publicField(GrokSession, "_currentResolution", null);
__publicField(GrokSession, "_currentImageQuality", null);
__publicField(GrokSession, "_setModeFailCount", 0);
__publicField(GrokSession, "_fallbackPrefixMode", false);
__publicField(GrokSession, "_fallbackUntil", 0);
__publicField(GrokSession, "_fallbackWindowMs", 5 * 60 * 1e3);
__publicField(GrokSession, "_listenersBound", false);
__publicField(GrokSession, "VALID_MODES", ["image", "video"]);
__publicField(GrokSession, "VALID_RATIOS", [
  "portrait",
  "landscape",
  "square",
  "story",
  "widescreen",
]);
__publicField(GrokSession, "VALID_QUANTITIES", [1, 2, 4]);
__publicField(GrokSession, "VALID_DURATIONS", ["6s", "10s"]);
__publicField(GrokSession, "VALID_RESOLUTIONS", ["480p", "720p"]);
__publicField(GrokSession, "VALID_IMAGE_QUALITIES", ["speed", "quality"]);
if (typeof window !== "undefined") {
  window.GrokSession = GrokSession;
}
