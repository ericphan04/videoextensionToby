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
class GrokConfig {
  static async fetch() {
    return this._fetch(false);
  }
  static async refresh() {
    return this._fetch(true);
  }
  static fetchInBackground() {
    this.fetch().catch((error) =>
      console.warn("[GrokConfig]", error.code || error.message),
    );
  }
  static async _fetch(force) {
    if (this._fetchPromise) {
      if (!force) return this._fetchPromise;
      try {
        await this._fetchPromise;
      } catch (_) {}
    }
    const task = this._doFetch(force);
    this._fetchPromise = task;
    try {
      return await task;
    } finally {
      if (this._fetchPromise === task) this._fetchPromise = null;
    }
  }
  static async _doFetch(force = false) {
    const result = await RequestSigner.fetchProtected("api", { force });
    return RequestSigner.readDerivedSnapshot(
      this._CACHE_KEY,
      result.meta.access,
    );
  }
  static async clearCache() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.remove([this._CACHE_KEY], resolve);
      } catch (e) {
        resolve();
      }
    });
  }
}
__publicField(GrokConfig, "_CACHE_KEY", "af_grok_config");
__publicField(GrokConfig, "_CACHE_TTL_MS", 60 * 60 * 1e3);
__publicField(GrokConfig, "_fetchPromise", null);
window.GrokConfig = GrokConfig;
