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
const _LocationCache = class _LocationCache {
  static async init() {
    try {
      const prefRes = await new Promise((resolve) => {
        chrome.storage.local.get(["af_preferred_currency"], (res) =>
          resolve(res),
        );
      });
      if (
        prefRes?.af_preferred_currency &&
        ["VND", "USD"].includes(prefRes.af_preferred_currency)
      ) {
        _LocationCache._cachedLocalPref = prefRes.af_preferred_currency;
      }
      if (
        !_LocationCache._storageListenerInstalled &&
        typeof chrome !== "undefined" &&
        chrome.storage?.onChanged
      ) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
          if (areaName !== "local" || !changes.af_preferred_currency) return;
          const newVal = changes.af_preferred_currency.newValue;
          const oldVal = _LocationCache._cachedLocalPref;
          if (newVal !== oldVal) {
            _LocationCache._cachedLocalPref =
              newVal && ["VND", "USD"].includes(newVal) ? newVal : null;
            window.eventBus?.emit?.("location:currency_changed", {
              currency: _LocationCache._cachedLocalPref,
            });
          }
        });
        _LocationCache._storageListenerInstalled = true;
      }
      const cached = await new Promise((resolve) => {
        chrome.storage.local.get([_LocationCache.CACHE_KEY], (res) =>
          resolve(res[_LocationCache.CACHE_KEY]),
        );
      });
      const fresh =
        cached &&
        cached.cached_at &&
        Date.now() - cached.cached_at < _LocationCache.CACHE_TTL_MS;
      if (fresh) {
        _LocationCache._data = cached;
        console.log(
          `[LocationCache] Loaded cached location: ${cached.country_code} / ${cached.locale} / ${cached.currency} (age: ${Math.round((Date.now() - cached.cached_at) / 1e3 / 60 / 60)}h)`,
        );
        return;
      }
      console.log("[LocationCache] Cache empty/expired \u2192 fetch fresh");
      await _LocationCache.fetch();
    } catch (e) {
      console.warn("[LocationCache] init error:", e.message);
    }
  }
  static async fetch() {
    if (_LocationCache._fetchPromise) return _LocationCache._fetchPromise;
    _LocationCache._fetchPromise = (async () => {
      try {
        const baseUrl =
          window.ApiBaseConfig?.get?.() || "https://labs.toby.vn/api/v1";
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5e3);
        const headers = {};
        try {
          if (chrome?.runtime?.id)
            headers["X-Extension-Id"] = chrome.runtime.id;
        } catch (_) {}
        try {
          Object.assign(
            headers,
            await (window.RequestSigner?.headers?.(
              "GET",
              new URL(`${baseUrl}/${_LocationCache.ENDPOINT}`).pathname,
              "",
            ) || {}),
          );
        } catch (_) {}
        let resp;
        try {
          resp = await fetch(`${baseUrl}/${_LocationCache.ENDPOINT}`, {
            cache: "no-store",
            signal: controller.signal,
            headers,
          });
        } finally {
          clearTimeout(timeoutId);
        }
        if (!resp.ok) {
          console.warn("[LocationCache] fetch HTTP", resp.status);
          return null;
        }
        const json = await resp.json();
        if (!json?.success || !json?.data) {
          console.warn("[LocationCache] fetch invalid response shape");
          return null;
        }
        const data = {
          country_code: json.data.country_code || "US",
          country_name: json.data.country_name || "United States",
          locale: json.data.locale || "en",
          currency: json.data.currency || "USD",
          ip_masked: json.data.ip_masked || null,
          cached_at: Date.now(),
        };
        _LocationCache._data = data;
        await new Promise((resolve) => {
          chrome.storage.local.set(
            { [_LocationCache.CACHE_KEY]: data },
            resolve,
          );
        });
        console.log(
          `[LocationCache] Fetched: ${data.country_code} / ${data.locale} / ${data.currency}`,
        );
        return data;
      } catch (e) {
        console.warn("[LocationCache] fetch failed:", e.message);
        return null;
      } finally {
        _LocationCache._fetchPromise = null;
      }
    })();
    return _LocationCache._fetchPromise;
  }
  static getLocation() {
    return (
      _LocationCache._data || {
        country_code: "US",
        country_name: "United States",
        locale: "en",
        currency: "USD",
        ip_masked: null,
        cached_at: 0,
      }
    );
  }
  static getCurrency() {
    if (
      _LocationCache._cachedLocalPref &&
      ["VND", "USD"].includes(_LocationCache._cachedLocalPref)
    ) {
      return _LocationCache._cachedLocalPref;
    }
    const serverPref = window.authManager?.getUser?.()?.preferred_currency;
    if (serverPref && ["VND", "USD"].includes(serverPref)) {
      return serverPref;
    }
    return _LocationCache.getLocation().currency || "USD";
  }
  static getCountryCode() {
    return _LocationCache.getLocation().country_code || "US";
  }
  static getLocale() {
    return _LocationCache.getLocation().locale || "en";
  }
  static async setPreferredCurrency(currency) {
    if (!["VND", "USD", null].includes(currency)) {
      console.warn("[LocationCache] Invalid currency:", currency);
      return;
    }
    try {
      await new Promise((resolve) => {
        chrome.storage.local.set({ af_preferred_currency: currency }, resolve);
      });
      _LocationCache._cachedLocalPref = currency;
      if (window.authManager?.isLoggedIn?.()) {
        try {
          await window.authManager._apiCall(
            "PATCH",
            "auth/me/preferred-currency",
            { currency },
          );
          if (window.authManager?.user) {
            window.authManager.user.preferred_currency = currency;
          }
          console.log(
            "[LocationCache] Server preferred_currency synced:",
            currency,
          );
        } catch (apiErr) {
          console.warn(
            "[LocationCache] Server sync failed (local override OK):",
            apiErr.message,
          );
        }
      }
      window.eventBus?.emit?.("location:currency_changed", { currency });
      console.log("[LocationCache] User preferred currency set:", currency);
    } catch (e) {
      console.warn("[LocationCache] setPreferredCurrency failed:", e.message);
    }
  }
};
__publicField(_LocationCache, "CACHE_KEY", "af_location");
__publicField(_LocationCache, "CACHE_TTL_MS", 24 * 60 * 60 * 1e3);
__publicField(_LocationCache, "ENDPOINT", "location/me");
__publicField(_LocationCache, "_data", null);
__publicField(_LocationCache, "_fetchPromise", null);
__publicField(_LocationCache, "_cachedLocalPref", null);
__publicField(_LocationCache, "_storageListenerInstalled", false);
let LocationCache = _LocationCache;
window.LocationCache = LocationCache;
