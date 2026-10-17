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
class GeminiSession {
  static _bindRuntimeListeners() {
    if (this._listenersBound) return;
    this._listenersBound = true;
    if (!chrome?.runtime?.onMessage) return;
    chrome.runtime.onMessage.addListener((message) => {
      if (!message || typeof message.action !== "string") return;
      if (message.action === "gemini:tabClosed") {
        if (!this._tabId || message.tabId === this._tabId) {
          this._resetCache();
          this._emit("gemini:error", { error: "TAB_CLOSED" });
        }
      } else if (message.action === "gemini:navigatedBroadcast") {
        if (this._tabId && message.tabId === this._tabId) {
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
        const active = await this._sendToBackground("gemini:ensureActive", {
          tabId: this._tabId,
          focusWindow,
        }).catch((error) => ({
          success: false,
          error: error?.message || "ACTIVATE_FAILED",
        }));
        if (!active?.success) {
          this._resetCache();
        } else {
          return { ready: true, tabId: this._tabId };
        }
      } else {
        return { ready: true, tabId: this._tabId };
      }
    }
    try {
      const findResp = await this._sendToBackground("gemini:findOrCreateTab", {
        createIfMissing,
        activate,
      });
      if (!findResp.success || !findResp.tabId) {
        const error = findResp.error || "NO_TAB";
        if (!silent) this._emit("gemini:error", { error });
        return { ready: false, error };
      }
      this._tabId = findResp.tabId;
      if (activate) {
        const activeResp = await this._sendToBackground("gemini:ensureActive", {
          tabId: this._tabId,
          focusWindow,
        });
        if (!activeResp.success) {
          this._ready = false;
          return {
            ready: false,
            error: activeResp.error || "ACTIVATE_FAILED",
            tabId: this._tabId,
          };
        }
      }
      const injectResp = await this._sendToBackground("gemini:injectScript", {
        tabId: this._tabId,
      });
      if (!injectResp.success) {
        const error = injectResp.error || "INJECT_FAILED";
        if (!silent) this._emit("gemini:error", { error });
        return { ready: false, error, tabId: this._tabId };
      }
      const loginResp = await this._sendToBackground("gemini:checkLogin", {
        tabId: this._tabId,
      });
      if (!loginResp.success || !loginResp.ready) {
        const error = loginResp.error || "NOT_LOGGED_IN";
        if (!silent) {
          if (error === "NOT_LOGGED_IN") {
            this._emit("gemini:login_required", { tabId: this._tabId });
          } else {
            this._emit("gemini:error", { error });
          }
        }
        return { ready: false, error, tabId: this._tabId };
      }
      this._ready = true;
      this._lastCheck = Date.now();
      this._emit("gemini:ready", { tabId: this._tabId });
      return { ready: true, tabId: this._tabId };
    } catch (err) {
      console.error("[GeminiSession] ensureReady l\u1ED7i:", err.message);
      if (!silent) this._emit("gemini:error", { error: err.message });
      return { ready: false, error: err.message };
    }
  }
  static async ensureTabActive() {
    this._bindRuntimeListeners();
    if (!this._tabId) return;
    try {
      await this._sendToBackground("gemini:ensureActive", {
        tabId: this._tabId,
        focusWindow: false,
      });
    } catch (err) {
      console.warn("[GeminiSession] ensureTabActive l\u1ED7i:", err.message);
    }
  }
  static async forceRefresh(timeoutMs) {
    this._bindRuntimeListeners();
    if (!this._tabId) return { ready: false, error: "NO_TAB" };
    const tabId = this._tabId;
    this._ready = false;
    this._lastCheck = 0;
    await chrome.tabs.reload(tabId);
    if (!Number.isFinite(Number(timeoutMs)) || Number(timeoutMs) <= 0)
      return { ready: false, error: "REFRESH_CONFIG_INVALID" };
    const deadline = Date.now() + Number(timeoutMs);
    await new Promise((resolve) => setTimeout(resolve, 150));
    while (Date.now() < deadline) {
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (tab?.status === "complete") break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    while (Date.now() < deadline) {
      const ready = await this.ensureReady({
        createIfMissing: false,
        activate: true,
      });
      if (ready?.ready) return ready;
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
    return { ready: false, error: "REFRESH_READY_TIMEOUT", tabId };
  }
  static async reconnectAfterNavigation(timeoutMs) {
    this._bindRuntimeListeners();
    if (!this._tabId) return { ready: false, error: "NO_TAB" };
    const tabId = this._tabId;
    const waitMs = Number(timeoutMs);
    if (!Number.isFinite(waitMs) || waitMs <= 0)
      return { ready: false, error: "RECONNECT_CONFIG_INVALID" };
    this._ready = false;
    this._lastCheck = 0;
    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline) {
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (tab?.status === "complete") {
        const ready = await this.ensureReady({
          createIfMissing: false,
          activate: true,
          silent: true,
        });
        if (ready?.ready) return ready;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return { ready: false, error: "RECONNECT_READY_TIMEOUT", tabId };
  }
  static async getTabInfo() {
    this._bindRuntimeListeners();
    if (!this._tabId) {
      return { tabId: null, url: null, active: false };
    }
    try {
      const resp = await this._sendToBackground("gemini:getTabInfo", {
        tabId: this._tabId,
      });
      return {
        tabId: this._tabId,
        url: resp?.url || null,
        active: !!resp?.active,
      };
    } catch (err) {
      return { tabId: this._tabId, url: null, active: false };
    }
  }
  static async closeTab() {
    this._bindRuntimeListeners();
    if (!this._tabId) return;
    try {
      await this._sendToBackground("gemini:closeTab", { tabId: this._tabId });
    } catch (err) {
      console.warn("[GeminiSession] closeTab l\u1ED7i:", err.message);
    } finally {
      this._resetCache();
    }
  }
  static async deleteCurrentConversation() {
    this._bindRuntimeListeners();
    if (!this._tabId) {
      console.warn(
        "[GeminiSession] deleteCurrentConversation: kh\xF4ng c\xF3 tabId",
      );
      return { success: false, error: "No tab" };
    }
    try {
      const resp = await new Promise((resolve) => {
        chrome.tabs.sendMessage(
          this._tabId,
          { action: "gemini:deleteCurrentConversation" },
          (r) => resolve(r || { success: false, error: "No response" }),
        );
      });
      return resp;
    } catch (err) {
      console.warn(
        "[GeminiSession] deleteCurrentConversation l\u1ED7i:",
        err.message,
      );
      return { success: false, error: err.message };
    }
  }
}
__publicField(GeminiSession, "_tabId", null);
__publicField(GeminiSession, "_ready", false);
__publicField(GeminiSession, "_lastCheck", 0);
__publicField(GeminiSession, "_readyTtlMs", 60 * 1e3);
__publicField(GeminiSession, "_listenersBound", false);
if (typeof window !== "undefined") {
  window.GeminiSession = GeminiSession;
}
