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
class I18n {
  static async init(defaultLocale = null) {
    if (this._initialized) return;
    const savedLocale = await this._getSavedLocale();
    let serverDefaultLocale = null;
    if (!defaultLocale && !savedLocale) {
      const country = await this._fetchGeoCountry();
      serverDefaultLocale =
        country === "VN" ? "vi" : await this._fetchServerDefaultLocale();
    }
    this._currentLocale =
      defaultLocale || savedLocale || serverDefaultLocale || "vi";
    if (!savedLocale) {
      this._persistLocale(this._currentLocale);
    }
    await this._loadTranslations();
    this._initialized = true;
    const source = defaultLocale
      ? "param"
      : savedLocale
        ? "storage"
        : serverDefaultLocale
          ? "server"
          : "fallback";
    console.log("[I18n] Initialized:", this._currentLocale, `(${source})`);
  }
  static async _fetchServerDefaultLocale() {
    try {
      const baseUrl = window.ApiBaseConfig.get();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2e3);
      const headers = {};
      try {
        if (chrome?.runtime?.id) headers["X-Extension-Id"] = chrome.runtime.id;
      } catch (_) {}
      try {
        Object.assign(
          headers,
          await (window.RequestSigner?.headers?.(
            "GET",
            new URL(`${baseUrl}/default-settings`).pathname,
            "",
          ) || {}),
        );
      } catch (_) {}
      const resp = await fetch(`${baseUrl}/default-settings`, {
        cache: "no-store",
        signal: controller.signal,
        headers,
      });
      clearTimeout(timeoutId);
      if (!resp.ok) return null;
      const json = await resp.json();
      const lang = json?.data?.language;
      if (lang && this.SUPPORTED_LOCALES.some((l) => l.code === lang)) {
        return lang;
      }
      return null;
    } catch (e) {
      console.warn("[I18n] Server default locale fetch failed:", e.message);
      return null;
    }
  }
  static async _fetchGeoCountry() {
    try {
      const baseUrl = window.ApiBaseConfig.get();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2e3);
      const headers = {};
      try {
        if (chrome?.runtime?.id) headers["X-Extension-Id"] = chrome.runtime.id;
      } catch (_) {}
      try {
        Object.assign(
          headers,
          await (window.RequestSigner?.headers?.(
            "GET",
            new URL(`${baseUrl}/location/me`).pathname,
            "",
          ) || {}),
        );
      } catch (_) {}
      const resp = await fetch(`${baseUrl}/location/me`, {
        cache: "no-store",
        signal: controller.signal,
        headers,
      });
      clearTimeout(timeoutId);
      if (!resp.ok) return null;
      const json = await resp.json();
      return json?.data?.country_code || null;
    } catch (e) {
      console.warn("[I18n] Geo country fetch failed:", e?.message);
      return null;
    }
  }
  static _persistLocale(locale) {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.set({ af_locale: locale });
      } else {
        localStorage.setItem("af_locale", locale);
      }
    } catch (e) {}
  }
  static async _getSavedLocale() {
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.get(["af_locale", "af_settings"], (result) => {
          const explicit = result.af_locale;
          const fromSettings = result.af_settings?.language;
          resolve(explicit || fromSettings || null);
        });
      } else {
        const explicit = localStorage.getItem("af_locale");
        let fromSettings = null;
        try {
          const raw = localStorage.getItem("af_settings");
          if (raw) fromSettings = JSON.parse(raw).language;
        } catch (_) {}
        resolve(explicit || fromSettings || null);
      }
    });
  }
  static _detectBrowserLocale() {
    const browserLang = navigator.language?.split("-")[0] || "vi";
    const supported = this.SUPPORTED_LOCALES.map((l) => l.code);
    return supported.includes(browserLang) ? browserLang : "vi";
  }
  static async _loadTranslations() {
    try {
      const cached = await this._readStorageCache(this._currentLocale);
      if (cached?.data) {
        this._mergeTranslations(this._currentLocale, cached.data);
      }
    } catch (_) {}
    const hasCache =
      Object.keys(this._translations[this._currentLocale] || {}).length > 0;
    if (!hasCache) {
      await this._fetchServerTranslations(this._currentLocale);
    } else {
      this._fetchServerTranslations(this._currentLocale).catch(() => {});
    }
  }
  static async _fetchServerTranslations(locale) {
    try {
      const baseUrl = window.ApiBaseConfig.get();
      const headers = {};
      try {
        if (chrome?.runtime?.id) headers["X-Extension-Id"] = chrome.runtime.id;
      } catch (_) {}
      try {
        Object.assign(
          headers,
          await (window.RequestSigner?.headers?.(
            "GET",
            new URL(`${baseUrl}/i18n/${locale}`).pathname,
            "",
          ) || {}),
        );
      } catch (_) {}
      const resp = await fetch(`${baseUrl}/i18n/${locale}`, {
        cache: "no-store",
        headers,
      });
      if (!resp.ok) return;
      const json = await resp.json();
      if (!json.success || !json.data) return;
      this._mergeTranslations(locale, json.data);
      await this._writeStorageCache(locale, {
        version: json.version,
        data: json.data,
        fetchedAt: Date.now(),
      });
      if (window.eventBus) {
        window.eventBus.emit("i18n:reloaded", { locale });
      }
    } catch (e) {
      console.warn(`[I18n] Fetch ${locale} failed:`, e.message);
    }
  }
  static _mergeTranslations(locale, flatKeyValueMap) {
    if (!this._translations[locale]) this._translations[locale] = {};
    for (const [key, value] of Object.entries(flatKeyValueMap)) {
      this._setNestedValue(this._translations[locale], key, value);
    }
  }
  static _setNestedValue(obj, key, value) {
    const parts = key.split(".");
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]] || typeof cur[parts[i]] !== "object")
        cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }
  static async _readStorageCache(locale) {
    return new Promise((resolve) => {
      if (typeof chrome === "undefined" || !chrome.storage?.local) {
        resolve(null);
        return;
      }
      chrome.storage.local.get([`toby_i18n_${locale}`], (res) => {
        resolve(res[`toby_i18n_${locale}`] || null);
      });
    });
  }
  static async _writeStorageCache(locale, payload) {
    return new Promise((resolve) => {
      if (typeof chrome === "undefined" || !chrome.storage?.local) {
        resolve();
        return;
      }
      chrome.storage.local.set({ [`toby_i18n_${locale}`]: payload }, resolve);
    });
  }
  static getLocale() {
    return this._currentLocale;
  }
  static getSupportedLocales() {
    return this.SUPPORTED_LOCALES;
  }
  static async setLocale(locale, emitEvent = true, isExplicit = false) {
    if (!this.SUPPORTED_LOCALES.some((l) => l.code === locale)) {
      console.warn("[I18n] Unsupported locale:", locale);
      return;
    }
    const previousLocale = this._currentLocale;
    this._currentLocale = locale;
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const toSet = { af_locale: locale };
      if (isExplicit) toSet.af_locale_explicit = true;
      chrome.storage.local.set(toSet);
    } else {
      localStorage.setItem("af_locale", locale);
      if (isExplicit) localStorage.setItem("af_locale_explicit", "1");
    }
    console.log("[I18n] Locale changed to:", locale);
    if (previousLocale !== locale) {
      try {
        await this._loadTranslations();
      } catch (e) {
        console.warn(
          "[I18n] Failed to load translations for",
          locale,
          ":",
          e?.message,
        );
      }
    }
    if (emitEvent && window.eventBus) {
      window.eventBus.emit("i18n:changed", { locale });
    }
  }
  static t(key, params = {}) {
    if (!this._translations || Object.keys(this._translations).length === 0) {
      return void 0;
    }
    let translation = this._getNestedValue(
      this._translations[this._currentLocale],
      key,
    );
    if (
      translation === void 0 &&
      this._currentLocale !== this._fallbackLocale
    ) {
      translation = this._getNestedValue(
        this._translations[this._fallbackLocale],
        key,
      );
    }
    if (translation === void 0) {
      if (!this._missingKeyWarned) this._missingKeyWarned = new Set();
      if (!this._missingKeyWarned.has(key)) {
        this._missingKeyWarned.add(key);
        console.debug(
          `[I18n] Missing key: "${key}" (locale=${this._currentLocale}, fallback=${this._fallbackLocale}) \u2014 using caller fallback`,
        );
      }
      return void 0;
    }
    if (params && typeof translation === "string") {
      Object.keys(params).forEach((param) => {
        translation = translation.replace(
          new RegExp(`\\{${param}\\}`, "g"),
          params[param],
        );
      });
    }
    return translation;
  }
  static _getNestedValue(obj, key) {
    if (!obj || !key) return void 0;
    return key.split(".").reduce((o, k) => (o || {})[k], obj);
  }
  static scopedT(scope) {
    return (key, params) => this.t(`${scope}.${key}`, params);
  }
  static applyTranslations(container = document) {
    container.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const paramsStr = el.getAttribute("data-i18n-params");
      let params = {};
      if (paramsStr) {
        try {
          params = JSON.parse(paramsStr);
        } catch (e) {
          params = {};
        }
      }
      const val = this.t(key, params);
      if (val !== void 0) el.textContent = val;
    });
    container.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const ph = this.t(el.getAttribute("data-i18n-placeholder"));
      if (ph !== void 0) el.placeholder = ph;
    });
    container.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const text = this.t(el.getAttribute("data-i18n-title"));
      if (text === void 0) return;
      const isTabButton =
        el.hasAttribute("data-tab") || el.classList.contains("tobyflow-tab");
      if (!isTabButton) {
        el.setAttribute("data-tooltip", text);
      } else {
        if (el.hasAttribute("data-tooltip")) el.removeAttribute("data-tooltip");
      }
      if (!el.hasAttribute("aria-label")) {
        el.setAttribute("aria-label", text);
      }
      if (el.hasAttribute("title")) el.removeAttribute("title");
    });
    container.querySelectorAll("[data-i18n-value]").forEach((el) => {
      const v = this.t(el.getAttribute("data-i18n-value"));
      if (v !== void 0) el.value = v;
    });
    container.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      const a = this.t(el.getAttribute("data-i18n-aria"));
      if (a !== void 0) el.setAttribute("aria-label", a);
    });
    container.querySelectorAll("[data-i18n-html]").forEach((el) => {
      const key = el.getAttribute("data-i18n-html");
      const paramsStr = el.getAttribute("data-i18n-params");
      let params2 = {};
      if (paramsStr) {
        try {
          params2 = JSON.parse(paramsStr);
        } catch (e) {
          params2 = {};
        }
      }
      el.innerHTML = this.t(key, params2);
    });
    container.querySelectorAll("[data-i18n-tooltip]").forEach((el) => {
      const v = this.t(el.getAttribute("data-i18n-tooltip"));
      if (v !== void 0) el.setAttribute("data-tooltip", v);
    });
  }
  static formatDate(date, options = {}) {
    const d = date instanceof Date ? date : new Date(date);
    const locale = this.getLocaleCode();
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      ...options,
    }).format(d);
  }
  static formatTime(date, options = {}) {
    const d = date instanceof Date ? date : new Date(date);
    const locale = this.getLocaleCode();
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      ...options,
    }).format(d);
  }
  static formatDateTime(date, options = {}) {
    const d = date instanceof Date ? date : new Date(date);
    const locale = this.getLocaleCode();
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      ...options,
    }).format(d);
  }
  static getLocaleCode() {
    const localeMap = { vi: "vi-VN", en: "en-US", th: "th-TH", ja: "ja-JP" };
    return localeMap[this._currentLocale] || "en-US";
  }
  static formatNumber(number, options = {}) {
    return new Intl.NumberFormat(this.getLocaleCode(), options).format(number);
  }
  static formatCurrency(amount, currency = null) {
    const currencyMap = { vi: "VND", en: "USD", th: "THB", ja: "JPY" };
    const curr = currency || currencyMap[this._currentLocale] || "VND";
    return new Intl.NumberFormat(this.getLocaleCode(), {
      style: "currency",
      currency: curr,
      minimumFractionDigits: curr === "VND" || curr === "JPY" ? 0 : 2,
    }).format(amount);
  }
  static getCurrentLocaleInfo() {
    return (
      this.SUPPORTED_LOCALES.find((l) => l.code === this._currentLocale) ||
      this.SUPPORTED_LOCALES[0]
    );
  }
  static invalidate(locale = null) {
    if (locale) {
      delete this._translations[locale];
      try {
        chrome.storage?.local?.remove([`toby_i18n_${locale}`]);
      } catch (_) {}
      console.log(`[I18n] Invalidated locale: ${locale}`);
    } else {
      this._translations = {};
      try {
        chrome.storage?.local?.get(null, (items) => {
          const keysToRemove = Object.keys(items || {}).filter((k) =>
            k.startsWith("toby_i18n_"),
          );
          if (keysToRemove.length > 0)
            chrome.storage.local.remove(keysToRemove);
        });
      } catch (_) {}
      console.log("[I18n] Invalidated all locales");
    }
  }
  static async reload() {
    await this._loadTranslations();
    if (window.eventBus) {
      window.eventBus.emit("i18n:reloaded", { locale: this._currentLocale });
    }
    console.log(
      "[I18n] Reloaded translations for locale:",
      this._currentLocale,
    );
  }
  static async getLocaleVersion(locale) {
    const cached = await this._readStorageCache(locale);
    return cached?.version ?? null;
  }
  static async _updateFromVersion(localeVersionMap) {
    if (!localeVersionMap || typeof localeVersionMap !== "object") return;
    const currentLocale = this._currentLocale;
    const remoteVersion = localeVersionMap[currentLocale];
    if (remoteVersion === void 0 || remoteVersion === null) return;
    const cachedVersion = await this.getLocaleVersion(currentLocale);
    if (cachedVersion === remoteVersion) return;
    console.log(
      `[I18n] Version mismatch ${currentLocale}: ${cachedVersion} \u2192 ${remoteVersion}`,
    );
    await this._fetchServerTranslations(currentLocale);
  }
}
__publicField(I18n, "_translations", {});
__publicField(I18n, "_currentLocale", "vi");
__publicField(I18n, "_fallbackLocale", "vi");
__publicField(I18n, "_initialized", false);
__publicField(I18n, "SUPPORTED_LOCALES", [
  { code: "vi", name: "Ti\u1EBFng Vi\u1EC7t", flag: "VI" },
  { code: "en", name: "English", flag: "EN" },
  { code: "th", name: "\u0E44\u0E17\u0E22", flag: "TH" },
  { code: "ja", name: "\u65E5\u672C\u8A9E", flag: "JA" },
]);
window.I18n = I18n;
