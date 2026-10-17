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
class ChatGPTSession {
  static _bindRuntimeListeners() {
    if (this._listenersBound) return;
    this._listenersBound = true;
    if (!chrome?.runtime?.onMessage) return;
    chrome.runtime.onMessage.addListener((message) => {
      if (!message || typeof message.action !== "string") return;
      if (message.action === "chatgpt:tabClosed") {
        if (!this._tabId || message.tabId === this._tabId) {
          this._resetCache();
          this._emit("chatgpt:error", { error: "TAB_CLOSED" });
        }
      } else if (message.action === "chatgpt:navigatedBroadcast") {
        if (this._tabId && message.tabId === this._tabId) {
          this._ready = false;
          this._lastCheck = 0;
          this._imageModeActive = false;
          this._currentRatio = null;
        }
      }
    });
  }
  static _resetCache() {
    this._tabId = null;
    this._ready = false;
    this._lastCheck = 0;
    this._imageModeActive = false;
    this._currentRatio = null;
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
    let releaseTurn;
    const previousTurn = this._readyCheckTail.catch(() => {});
    const myTurn = new Promise((resolve) => {
      releaseTurn = resolve;
    });
    this._readyCheckTail = previousTurn.then(() => myTurn);
    await previousTurn;
    try {
      return await this._ensureReadyOnce(options);
    } finally {
      releaseTurn();
    }
  }
  static async _ensureReadyOnce(options = {}) {
    this._bindRuntimeListeners();
    if (this._ensureActivePromise) {
      try {
        await this._ensureActivePromise;
      } catch (_) {}
    }
    const {
      createIfMissing = true,
      activate = true,
      focusWindow = false,
      silent = false,
      forceCheck = false,
      waitForEditorMs = 0,
      allowEditorPending = false,
    } = options;
    if (
      !forceCheck &&
      this._ready &&
      this._tabId &&
      Date.now() - this._lastCheck < this._readyTtlMs
    ) {
      if (activate) {
        if (focusWindow) {
          await this._sendToBackground("chatgpt:ensureActive", {
            tabId: this._tabId,
            focusWindow,
          }).catch(() => {});
        } else {
          this._sendToBackground("chatgpt:ensureActive", {
            tabId: this._tabId,
            focusWindow,
          }).catch(() => {});
        }
      }
      return { ready: true, tabId: this._tabId };
    }
    try {
      const findResp = await this._sendToBackground("chatgpt:findOrCreateTab", {
        createIfMissing,
        activate,
      });
      if (!findResp.success || !findResp.tabId) {
        const error = findResp.error || "NO_TAB";
        this._emit("chatgpt:error", { error });
        return { ready: false, error };
      }
      this._tabId = findResp.tabId;
      if (activate) {
        const activeResp = await this._sendToBackground(
          "chatgpt:ensureActive",
          { tabId: this._tabId, focusWindow },
        );
        if (!activeResp.success) {
          console.warn(
            "[ChatGPTSession] Kh\xF4ng activate \u0111\u01B0\u1EE3c tab:",
            activeResp.error,
          );
        }
      }
      const injectResp = await this._sendToBackground("chatgpt:injectScript", {
        tabId: this._tabId,
      });
      if (!injectResp.success) {
        const error = injectResp.error || "INJECT_FAILED";
        this._emit("chatgpt:error", { error });
        return { ready: false, error, tabId: this._tabId };
      }
      let loginResp = await this._sendToBackground("chatgpt:checkLogin", {
        tabId: this._tabId,
      });
      const editorDeadline =
        Date.now() + Math.max(0, Number(waitForEditorMs) || 0);
      while (
        !loginResp?.ready &&
        loginResp?.error === "EDITOR_NOT_FOUND" &&
        Date.now() < editorDeadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        loginResp = await this._sendToBackground("chatgpt:checkLogin", {
          tabId: this._tabId,
        });
      }
      if (!loginResp.success || !loginResp.ready) {
        const error = loginResp.error || "NOT_LOGGED_IN";
        if (allowEditorPending && error === "EDITOR_NOT_FOUND") {
          return { ready: true, tabId: this._tabId, editorPending: true };
        }
        if (!silent) {
          if (error === "NOT_LOGGED_IN") {
            this._emit("chatgpt:login_required", { tabId: this._tabId });
          } else {
            this._emit("chatgpt:error", { error });
          }
        }
        return { ready: false, error, tabId: this._tabId };
      }
      this._ready = true;
      this._lastCheck = Date.now();
      this._emit("chatgpt:ready", { tabId: this._tabId });
      return { ready: true, tabId: this._tabId };
    } catch (err) {
      console.error("[ChatGPTSession] ensureReady l\u1ED7i:", err.message);
      this._emit("chatgpt:error", { error: err.message });
      return { ready: false, error: err.message };
    }
  }
  static async activateImageMode() {
    this._bindRuntimeListeners();
    if (this._fallbackPrefixMode && Date.now() < this._fallbackUntil) {
      return {
        activated: false,
        ratioControlAvailable: false,
        error: "FALLBACK_PREFIX_ACTIVE",
      };
    }
    if (this._imageModeActive && this._tabId) {
      return { activated: true, ratioControlAvailable: true };
    }
    if (!this._tabId) {
      return { activated: false, error: "NO_TAB" };
    }
    try {
      const resp = await this._sendToBackground("chatgpt:activateImageMode", {
        tabId: this._tabId,
      });
      if (!resp.success) {
        this._activateFailCount++;
        if (this._activateFailCount >= 2) {
          this._fallbackPrefixMode = true;
          this._fallbackUntil = Date.now() + this._fallbackWindowMs;
          this._showFallbackToast();
        }
        const error = resp.error || "ACTIVATE_FAILED";
        this._emit("chatgpt:error", { error });
        return { activated: false, error };
      }
      this._activateFailCount = 0;
      this._fallbackPrefixMode = false;
      this._fallbackUntil = 0;
      this._imageModeActive = !!resp.activated;
      const ratioAvailable = !!resp.ratioControlAvailable;
      if (this._imageModeActive) {
        this._emit("chatgpt:image_mode_activated", {
          ratioControlAvailable: ratioAvailable,
        });
      }
      return {
        activated: this._imageModeActive,
        ratioControlAvailable: ratioAvailable,
        error: resp.error || null,
      };
    } catch (err) {
      console.error(
        "[ChatGPTSession] activateImageMode l\u1ED7i:",
        err.message,
      );
      this._activateFailCount++;
      if (this._activateFailCount >= 2) {
        this._fallbackPrefixMode = true;
        this._fallbackUntil = Date.now() + this._fallbackWindowMs;
        this._showFallbackToast();
      }
      this._emit("chatgpt:error", { error: err.message });
      return { activated: false, error: err.message };
    }
  }
  static _showFallbackToast() {
    try {
      const msg =
        "ChatGPT image mode kh\xF4ng kh\u1EA3 d\u1EE5ng, \u0111ang d\xF9ng fallback prefix";
      if (
        window.NotificationManager &&
        typeof window.NotificationManager.showToast === "function"
      ) {
        window.NotificationManager.showToast(msg, "warning");
      } else {
        console.warn("[ChatGPTSession]", msg);
      }
    } catch (err) {}
  }
  static async setRatio(ratio) {
    this._bindRuntimeListeners();
    if (!this.VALID_RATIOS.includes(ratio)) {
      return { success: false, error: "INVALID_RATIO_KEY" };
    }
    if (this._currentRatio === ratio && this._imageModeActive) {
      return { success: true };
    }
    if (!this._tabId) {
      return { success: false, error: "NO_TAB" };
    }
    try {
      const adapter = window.ProviderRegistry?.get?.("chatgpt");
      const ariaLabelMap = adapter?.capabilities?.ratioAriaLabels || null;
      const resp = await this._sendToBackground("chatgpt:setRatio", {
        tabId: this._tabId,
        ratio,
        ariaLabelMap,
      });
      if (!resp.success) {
        const error = resp.error || "SET_RATIO_FAILED";
        this._emit("chatgpt:error", { error });
        return { success: false, error };
      }
      this._currentRatio = ratio;
      return { success: true };
    } catch (err) {
      console.error("[ChatGPTSession] setRatio l\u1ED7i:", err.message);
      this._emit("chatgpt:error", { error: err.message });
      return { success: false, error: err.message };
    }
  }
  static async ensureTabActive({ forceRefresh = false } = {}) {
    this._bindRuntimeListeners();
    if (!this._tabId) return;
    if (this._ensureActivePromise) return this._ensureActivePromise;
    this._ready = false;
    this._lastCheck = 0;
    const operation = this._sendToBackground("chatgpt:ensureActive", {
      tabId: this._tabId,
      focusWindow: false,
      navigateToHome: true,
      forceRefresh,
    }).then((resp) => {
      if (!resp?.success) throw new Error(resp?.error || "ACTIVATE_FAILED");
      return resp;
    });
    this._ensureActivePromise = operation;
    try {
      return await operation;
    } catch (err) {
      console.warn("[ChatGPTSession] ensureTabActive l\u1ED7i:", err.message);
      throw err;
    } finally {
      if (this._ensureActivePromise === operation)
        this._ensureActivePromise = null;
    }
  }
  static async ensureChatMode({ waitForEditorMs = 0 } = {}) {
    const ready = await this.ensureReady({
      createIfMissing: false,
      activate: true,
      forceCheck: true,
      waitForEditorMs,
      allowEditorPending: true,
    });
    if (!ready?.ready || !ready?.tabId) {
      return { success: false, error: ready?.error || "CHATGPT_NOT_READY" };
    }
    try {
      const response = await new Promise((resolve) => {
        chrome.tabs.sendMessage(
          ready.tabId,
          { action: "chatgpt:ensureChatMode" },
          (result) => {
            if (chrome.runtime.lastError) {
              resolve({
                success: false,
                error: chrome.runtime.lastError.message || "NO_RECEIVER",
              });
              return;
            }
            resolve(result || { success: false, error: "NO_RESPONSE" });
          },
        );
      });
      return response;
    } catch (error) {
      return { success: false, error: error?.message || "CHAT_MODE_NOT_READY" };
    }
  }
  static async prepareNewChat({
    createIfMissing = true,
    forceRefresh = false,
  } = {}) {
    this._bindRuntimeListeners();
    let located;
    try {
      located = await this._sendToBackground("chatgpt:findOrCreateTab", {
        createIfMissing,
        activate: true,
      });
    } catch (error) {
      return { ready: false, error: error?.message || "NO_TAB" };
    }
    if (!located?.success || !located?.tabId) {
      return { ready: false, error: located?.error || "NO_TAB" };
    }
    this._tabId = located.tabId;
    this._ready = false;
    this._lastCheck = 0;
    try {
      await this.ensureTabActive({ forceRefresh });
    } catch (error) {
      return {
        ready: false,
        tabId: this._tabId,
        error: error?.message || "ACTIVATE_FAILED",
      };
    }
    const mode = await this.ensureChatMode({ waitForEditorMs: 0 });
    if (!mode?.success) {
      return {
        ready: false,
        tabId: this._tabId,
        error: mode?.error || "CHAT_MODE_NOT_READY",
      };
    }
    return { ready: true, tabId: this._tabId };
  }
  static async getTabInfo() {
    this._bindRuntimeListeners();
    if (!this._tabId) {
      return {
        tabId: null,
        url: null,
        active: false,
        imageModeActive: this._imageModeActive,
      };
    }
    try {
      const resp = await this._sendToBackground("chatgpt:getTabInfo", {
        tabId: this._tabId,
      });
      return {
        tabId: this._tabId,
        url: resp?.url || null,
        active: !!resp?.active,
        imageModeActive: this._imageModeActive,
      };
    } catch (err) {
      return {
        tabId: this._tabId,
        url: null,
        active: false,
        imageModeActive: this._imageModeActive,
      };
    }
  }
  static async closeTab() {
    this._bindRuntimeListeners();
    if (!this._tabId) return;
    try {
      await this._sendToBackground("chatgpt:closeTab", { tabId: this._tabId });
    } catch (err) {
      console.warn("[ChatGPTSession] closeTab l\u1ED7i:", err.message);
    } finally {
      this._resetCache();
    }
  }
  static async deleteLastMessage(options = {}) {
    this._bindRuntimeListeners();
    if (!this._tabId) {
      console.warn("[ChatGPTSession] deleteLastMessage: kh\xF4ng c\xF3 tabId");
      return { success: false, error: "No tab" };
    }
    try {
      const resp = await this._sendToBackground(
        "chatgpt:deleteConversationWithReloadFallback",
        {
          tabId: this._tabId,
          expectedConversationUrl: options.expectedConversationUrl || null,
        },
      );
      return resp;
    } catch (err) {
      console.warn("[ChatGPTSession] deleteLastMessage l\u1ED7i:", err.message);
      return { success: false, error: err.message };
    }
  }
  static isFallbackPrefixActive() {
    return this._fallbackPrefixMode && Date.now() < this._fallbackUntil;
  }
}
__publicField(ChatGPTSession, "_tabId", null);
__publicField(ChatGPTSession, "_ready", false);
__publicField(ChatGPTSession, "_lastCheck", 0);
__publicField(ChatGPTSession, "_readyTtlMs", 60 * 1e3);
__publicField(ChatGPTSession, "_readyCheckTail", Promise.resolve());
__publicField(ChatGPTSession, "_ensureActivePromise", null);
__publicField(ChatGPTSession, "_imageModeActive", false);
__publicField(ChatGPTSession, "_currentRatio", null);
__publicField(ChatGPTSession, "_activateFailCount", 0);
__publicField(ChatGPTSession, "_fallbackPrefixMode", false);
__publicField(ChatGPTSession, "_fallbackUntil", 0);
__publicField(ChatGPTSession, "_fallbackWindowMs", 5 * 60 * 1e3);
__publicField(ChatGPTSession, "_listenersBound", false);
__publicField(ChatGPTSession, "VALID_RATIOS", [
  "story",
  "portrait",
  "square",
  "landscape",
  "widescreen",
]);
if (typeof window !== "undefined") {
  window.ChatGPTSession = ChatGPTSession;
}
