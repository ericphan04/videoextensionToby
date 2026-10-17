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
class MuseSession {
  static _send(action, payload = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action, ...payload }, (response) => {
        if (chrome.runtime.lastError)
          return reject(new Error(chrome.runtime.lastError.message));
        resolve(response || { success: false, error: "NO_RESPONSE" });
      });
    });
  }
  static async ensureReady({
    createIfMissing = true,
    activate = true,
    silent = false,
    waitForComposer = false,
  } = {}) {
    if (
      !waitForComposer &&
      this._ready &&
      this._tabId &&
      Date.now() - this._lastCheck < this._ttl
    ) {
      const active = await this._send("muse:ensureActive", {
        tabId: this._tabId,
        activate,
      }).catch(() => null);
      if (active?.success) return { ready: true, tabId: this._tabId };
      this._ready = false;
      this._tabId = null;
    }
    if (waitForComposer) this._ready = false;
    try {
      const newChatUrl =
        await window.ProviderConfigManager?.getProviderUrlAsync?.(
          "muse",
          "newChatUrl",
        );
      const configuredBaseUrl =
        await window.ProviderConfigManager?.getBaseUrl?.("muse");
      let baseUrl = configuredBaseUrl;
      if (!baseUrl && newChatUrl) {
        try {
          const parsed = new URL(newChatUrl);
          if (parsed.protocol === "https:") baseUrl = parsed.origin;
        } catch (_) {}
      }
      if (!baseUrl) return { ready: false, error: "MUSE_URL_CONFIG_MISSING" };
      await this._send("updateProviderUrlsCache", {
        data: { muse: { baseUrl, newChatUrl } },
      });
      const tab = await this._send("muse:findOrCreateTab", {
        createIfMissing,
        activate,
      });
      if (!tab.success || !tab.tabId)
        return { ready: false, error: tab.error || "NO_TAB" };
      this._tabId = tab.tabId;
      if (activate)
        await this._send("muse:ensureActive", { tabId: this._tabId });
      const injected = await this._send("muse:injectScript", {
        tabId: this._tabId,
      });
      if (!injected.success)
        return {
          ready: false,
          error: injected.error || "INJECT_FAILED",
          tabId: this._tabId,
        };
      const login = await this._send("muse:checkLogin", {
        tabId: this._tabId,
        waitForComposer,
      });
      if (!login.success || !login.ready) {
        return {
          ready: false,
          error: login.error || "NOT_LOGGED_IN",
          tabId: this._tabId,
          diagnostic: login?.diagnostic || null,
        };
      }
      this._ready = true;
      this._lastCheck = Date.now();
      return { ready: true, tabId: this._tabId };
    } catch (error) {
      if (!silent)
        console.warn("[MuseSession] ensureReady:", error?.message || error);
      return { ready: false, error: error?.message || "SESSION_ERROR" };
    }
  }
  static async ensureTabActive() {
    if (!this._tabId) return { success: false, error: "NO_TAB" };
    return this._send("muse:ensureActive", { tabId: this._tabId });
  }
  static async abort({ requestedAt = Date.now() } = {}) {
    if (!this._tabId) return { success: false, error: "NO_TAB" };
    return this._send("muse:abort", { tabId: this._tabId, requestedAt });
  }
  static async prepareNewChat({ createIfMissing = true } = {}) {
    const ready = await this.ensureReady({
      createIfMissing,
      activate: true,
      silent: true,
    });
    const tabId = ready?.tabId || this._tabId;
    if ((!ready?.ready && ready?.error !== "COMPOSER_NOT_READY") || !tabId) {
      return ready || { ready: false, error: "NOT_READY" };
    }
    let created = await this._send("muse:navigateNewChat", { tabId });
    if (!created?.success) {
      console.warn(
        "[MuseSession] New-thread redirect unavailable; using sidebar fallback:",
        created?.error || "UNKNOWN",
      );
      created = await this._send("muse:newChat", { tabId });
    }
    if (!created?.success)
      return {
        ready: false,
        tabId,
        error: created?.error || "NEW_CHAT_FAILED",
      };
    this._ready = false;
    return this.ensureReady({
      createIfMissing: false,
      activate: true,
      silent: true,
      waitForComposer: true,
    });
  }
  static async deleteCurrentConversation() {
    if (!this._tabId) return { success: false, error: "NO_TAB" };
    return this._send("muse:deleteCurrentChat", { tabId: this._tabId });
  }
}
__publicField(MuseSession, "_tabId", null);
__publicField(MuseSession, "_ready", false);
__publicField(MuseSession, "_lastCheck", 0);
__publicField(MuseSession, "_ttl", 60 * 1e3);
window.MuseSession = MuseSession;
