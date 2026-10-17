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
class ValidationRules {
  static async fetch(forceRefresh = false) {
    if (
      !forceRefresh &&
      this._cache &&
      Date.now() - this._cacheTime < this._cacheTTL
    ) {
      return this._cache;
    }
    if (this._fetchPromise) return this._fetchPromise;
    this._fetchPromise = this._doFetch();
    try {
      return await this._fetchPromise;
    } finally {
      this._fetchPromise = null;
    }
  }
  static async _doFetch() {
    try {
      const apiBaseUrl = window.ApiBaseConfig.get();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8e3);
      const headers = { Accept: "application/json" };
      try {
        if (chrome?.runtime?.id) headers["X-Extension-Id"] = chrome.runtime.id;
      } catch (_) {}
      try {
        Object.assign(
          headers,
          await (window.RequestSigner?.headers?.(
            "GET",
            new URL(`${apiBaseUrl}/validation-rules`).pathname,
            "",
          ) || {}),
        );
      } catch (_) {}
      let resp;
      try {
        resp = await fetch(`${apiBaseUrl}/validation-rules`, {
          cache: "no-store",
          signal: controller.signal,
          headers,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (json.success && json.data) {
        this._cache = json.data;
        this._cacheTime = Date.now();
        if (json.meta && typeof json.meta.version !== "undefined") {
          this._lastVersion = json.meta.version;
        }
        this._persistToStorage(this._cache);
        window.eventBus?.emit("validation_rules:loaded", {
          version: this._lastVersion,
        });
        return this._cache;
      }
      throw new Error("Invalid response shape");
    } catch (e) {
      console.error(
        "[ValidationRules] Fetch failed, Server-Only requires online:",
        e.message,
      );
      throw new Error("CONFIG_REQUIRED: validation_rules data unavailable");
    }
  }
  static async _updateFromVersion(remoteVersion) {
    if (this._lastVersion === remoteVersion) return;
    console.log(
      "[ValidationRules] Version mismatch:",
      this._lastVersion,
      "\u2192",
      remoteVersion,
    );
    await this.fetch(true);
  }
  static clearCache() {
    this._cache = null;
    this._cacheTime = 0;
  }
  static async fetchMandatory() {
    const ConfigRequiredError = window.ConfigRequiredError;
    try {
      const data = await this._doFetch();
      if (data && Object.keys(data).length > 0) {
        return data;
      }
    } catch (e) {
      console.warn("[ValidationRules] fetchMandatory server fail:", e.message);
    }
    if (this._cache) {
      const cacheAge = Date.now() - (this._cacheTime || 0);
      if (cacheAge < this._GRACE_PERIOD_MS) {
        console.log(
          `[ValidationRules] Using cached rules (age: ${Math.round(cacheAge / 1e3 / 60)}m)`,
        );
        return this._cache;
      }
      console.warn("[ValidationRules] Cache expired, grace period exceeded");
    }
    if (ConfigRequiredError) {
      throw new ConfigRequiredError(
        "validation_rules",
        "server_unavailable_cache_expired",
      );
    }
    console.error(
      "[ValidationRules] CRITICAL: No data, ConfigRequiredError not available",
    );
    throw new Error("CONFIG_REQUIRED: validation_rules data unavailable");
  }
  static fetchInBackground() {
    this.fetch().catch(() => {});
  }
  static get(key, defaultValue = null) {
    if (!this._cache) {
      this.fetch().catch(() => {});
      if (window.ConfigRequiredError) {
        throw new window.ConfigRequiredError(
          `validation_${key}`,
          "cache_empty",
        );
      }
      return defaultValue;
    }
    const val = this._cache[key];
    if (val !== void 0 && val !== null) return val;
    return defaultValue;
  }
  static getInt(key, defaultValue = 0) {
    if (!this._cache) {
      this.fetch().catch(() => {});
      if (window.ConfigRequiredError) {
        throw new window.ConfigRequiredError(
          `validation_${key}`,
          "cache_empty",
        );
      }
      return defaultValue;
    }
    const val = this._cache[key];
    if (val === void 0 || val === null || val === "") return defaultValue;
    const parsed = parseInt(val, 10);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }
  static getList(key, defaultValue = []) {
    if (!this._cache) {
      this.fetch().catch(() => {});
      if (window.ConfigRequiredError) {
        throw new window.ConfigRequiredError(
          `validation_${key}`,
          "cache_empty",
        );
      }
      return defaultValue;
    }
    const val = this._cache[key];
    if (val === void 0 || val === null || val === "") return defaultValue;
    if (Array.isArray(val)) return val;
    if (typeof val === "string") {
      return val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return defaultValue;
  }
  static safeGet(key, defaultValue = null) {
    try {
      return this.get(key, defaultValue);
    } catch (err) {
      if (window.ConfigRequiredError?.is?.(err)) {
        console.warn(`[ValidationRules] safeGet: ${err.message}`);
        return defaultValue;
      }
      throw err;
    }
  }
  static safeGetInt(key, defaultValue = 0) {
    try {
      return this.getInt(key, defaultValue);
    } catch (err) {
      if (window.ConfigRequiredError?.is?.(err)) {
        console.warn(`[ValidationRules] safeGetInt: ${err.message}`);
        return defaultValue;
      }
      throw err;
    }
  }
  static safeGetList(key, defaultValue = []) {
    try {
      return this.getList(key, defaultValue);
    } catch (err) {
      if (window.ConfigRequiredError?.is?.(err)) {
        return defaultValue;
      }
      throw err;
    }
  }
  static async handleSseUpdate(data) {
    console.log("[ValidationRules] SSE validation_rules_updated:", data);
    this.clearCache();
    try {
      await this.fetch();
    } catch (err) {
      console.warn(
        "[ValidationRules] SSE fetch failed, stale cache may be used:",
        err.message,
      );
    }
    if (window.eventBus) {
      window.eventBus.emit("validation_rules:updated", data);
    }
  }
  static _persistToStorage(data) {
    try {
      chrome.storage?.local?.set({ af_validation_rules: data });
    } catch {}
  }
  static async hydrateFromStorage() {
    return new Promise((resolve) => {
      if (typeof chrome === "undefined" || !chrome.storage?.local) {
        resolve();
        return;
      }
      chrome.storage.local.get(["af_validation_rules"], (res) => {
        if (res.af_validation_rules) {
          this._cache = res.af_validation_rules;
          this._cacheTime = Date.now();
        }
        resolve();
      });
    });
  }
}
__publicField(ValidationRules, "_cache", null);
__publicField(ValidationRules, "_cacheTime", 0);
__publicField(ValidationRules, "_cacheTTL", 60 * 60 * 1e3);
__publicField(ValidationRules, "_lastVersion", null);
__publicField(ValidationRules, "_GRACE_PERIOD_MS", 24 * 60 * 60 * 1e3);
__publicField(ValidationRules, "_fetchPromise", null);
if (typeof window !== "undefined") {
  window.ValidationRules = ValidationRules;
  ValidationRules.hydrateFromStorage().then(() => {
    setTimeout(() => ValidationRules.fetchInBackground(), 200);
  });
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = ValidationRules;
}
