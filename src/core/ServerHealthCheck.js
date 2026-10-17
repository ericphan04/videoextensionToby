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
class ServerHealthCheck {
  static async check(forceRefresh = false) {
    if (
      !forceRefresh &&
      this._lastResult !== null &&
      Date.now() - this._lastCheckTime < this._checkInterval
    ) {
      return this._lastResult;
    }
    try {
      const apiBaseUrl = window.ApiBaseConfig.get();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this._timeout);
      const response = await fetch(`${apiBaseUrl}/health`, {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timeoutId);
      const reachable = response.ok || response.status === 429;
      this._lastResult = reachable;
      this._lastCheckTime = Date.now();
      if (response.ok) {
        console.log("[ServerHealthCheck] Server is healthy");
      } else if (response.status === 429) {
        console.warn(
          "[ServerHealthCheck] Rate limited (429) \u2014 server reachable, treat as online",
        );
      } else {
        console.warn(
          "[ServerHealthCheck] Server returned non-OK status:",
          response.status,
        );
      }
      return this._lastResult;
    } catch (err) {
      console.warn("[ServerHealthCheck] Server check failed:", err.message);
      this._lastResult = false;
      this._lastCheckTime = Date.now();
      return false;
    }
  }
  static showOfflineOverlay() {
    const overlay = document.getElementById("tobyflow-offline-overlay");
    if (overlay) {
      overlay.classList.remove("hidden");
      console.log("[ServerHealthCheck] Offline overlay shown");
    }
  }
  static hideOfflineOverlay() {
    if (window.ConfigAccessUI?.serviceUnavailable?.()) return;
    const overlay = document.getElementById("tobyflow-offline-overlay");
    if (overlay) {
      overlay.classList.add("hidden");
      console.log("[ServerHealthCheck] Offline overlay hidden");
    }
  }
  static async checkAndBlock() {
    const isHealthy = await this.check();
    if (!isHealthy) {
      this.showOfflineOverlay();
      return false;
    }
    this.hideOfflineOverlay();
    return !window.ConfigAccessUI?.serviceUnavailable?.();
  }
  static reset() {
    this._lastResult = null;
    this._lastCheckTime = 0;
  }
}
__publicField(ServerHealthCheck, "_lastCheckTime", 0);
__publicField(ServerHealthCheck, "_lastResult", null);
__publicField(ServerHealthCheck, "_checkInterval", 3e4);
__publicField(ServerHealthCheck, "_timeout", 8e3);
window.ServerHealthCheck = ServerHealthCheck;
