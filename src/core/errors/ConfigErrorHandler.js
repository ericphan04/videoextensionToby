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
const _ConfigErrorHandler = class _ConfigErrorHandler {
  static _initLocale() {
    try {
      chrome.storage.local.get(["af_locale"], (r) => {
        if (r && r.af_locale) _ConfigErrorHandler._locale = r.af_locale;
      });
    } catch (e) {}
  }
  static _t(key) {
    const i18nResult = window.I18n?.t?.(key);
    if (i18nResult && i18nResult !== key && typeof i18nResult === "string") {
      return i18nResult;
    }
    const locale = this._locale || "en";
    return (this._LOCAL_I18N[locale] || this._LOCAL_I18N.en)[key] || key;
  }
  static handle(error, context = "") {
    if (
      !window.ConfigRequiredError?.is?.(error) &&
      error?.name !== "ConfigRequiredError"
    ) {
      throw error;
    }
    const configKey = error.configKey || "unknown";
    console.warn(
      `[ConfigErrorHandler] Missing config: ${configKey}`,
      context,
      JSON.stringify({
        code: error.code || null,
        reason: error.context || null,
        httpStatus: error.httpStatus ?? null,
      }),
    );
    if (error.accessDenied) {
      this.hideOverlay();
      const state = {
        code: error.code,
        httpStatus: error.httpStatus,
        configKey,
      };
      if (window.eventBus?.emit)
        window.eventBus.emit("config:access_required", state);
      else window.ConfigAccessUI?.show?.(state);
      return;
    }
    if (this._overlayVisible) return;
    this._handledConfigs.add(configKey);
    if (window.ConfigAccessUI) {
      window.ConfigAccessUI.show({
        code: "CONFIG_FETCH_FAILED",
        retryable: true,
      });
      return;
    }
    this.showOverlay({
      title: this._t("config.required"),
      message: this._t("config.offline"),
      configKey,
    });
  }
  static showOverlay(options) {
    if (
      document.getElementById("tobyflow-offline-overlay") &&
      window.ConfigAccessUI
    ) {
      this.hideOverlay();
      window.ConfigAccessUI.show({
        code: "CONFIG_FETCH_FAILED",
        retryable: true,
      });
      return;
    }
    if (this._overlayVisible) return;
    this._overlayVisible = true;
    document.querySelector(".config-error-overlay")?.remove();
    const overlay = document.createElement("div");
    overlay.className = "config-error-overlay";
    overlay.innerHTML = `
      <div class="config-error-content">
        <div class="config-error-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <h3>${options.title || "Connection error"}</h3>
        <p>${options.message || "Failed to load configuration from server."}</p>
        <div class="config-error-actions">
          <button class="config-error-retry btn-primary">
            ${this._t("common.retry")}
          </button>
        </div>
      </div>
    `;
    const retryButton = overlay.querySelector(".config-error-retry");
    retryButton.addEventListener("click", async () => {
      if (retryButton.disabled) return;
      retryButton.disabled = true;
      try {
        await this.retry();
      } catch (_) {
      } finally {
        retryButton.disabled = false;
      }
    });
    if (!document.getElementById("config-error-styles")) {
      const style = document.createElement("style");
      style.id = "config-error-styles";
      style.textContent = `
        .config-error-overlay {
          position: fixed;
          inset: 0;
          background: rgba(26, 26, 26, 0.92);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 99999;
          animation: fadeIn 0.2s ease-out;
        }
        .config-error-content {
          text-align: center;
          padding: 32px;
          max-width: 400px;
        }
        .config-error-icon {
          color: var(--warning-color, #f59e0b);
          margin-bottom: 16px;
        }
        .config-error-content h3 {
          color: var(--text-primary, #fff);
          margin: 0 0 8px 0;
          font-size: 20px;
        }
        .config-error-content p {
          color: var(--text-secondary, #9ca3af);
          margin: 0 0 24px 0;
          font-size: 14px;
          line-height: 1.5;
        }
        .config-error-retry {
          background: var(--primary-color, #3b82f6);
          color: white;
          border: none;
          padding: 10px 24px;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .config-error-retry:hover {
          background: var(--primary-hover, #2563eb);
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }
    document.body.appendChild(overlay);
  }
  static hideOverlay() {
    this._overlayVisible = false;
    document.querySelector(".config-error-overlay")?.remove();
  }
  static async retry() {
    if (window.ConfigAccessUI?.serviceUnavailable?.())
      return window.ConfigAccessUI.retry();
    this.hideOverlay();
    this._handledConfigs.clear();
    if (window.showGlobalLoading) {
      window.showGlobalLoading(this._t("common.loading"));
    }
    try {
      const promises = [];
      if (window.ProviderConfigManager?.fetchMandatory) {
        promises.push(
          window.ProviderConfigManager.fetchMandatory("api_configs"),
          window.ProviderConfigManager.fetchMandatory("dom_selectors"),
        );
      } else if (window.ProviderConfigManager?.fetch) {
        promises.push(
          window.ProviderConfigManager.fetch(),
          window.ProviderConfigManager._fetchApiConfigs?.(),
        );
      }
      if (window.ModelRegistry?.fetchMandatory) {
        promises.push(window.ModelRegistry.fetchMandatory());
      } else if (window.ModelRegistry?.fetch) {
        promises.push(window.ModelRegistry.fetch());
      }
      if (window.ValidationRules?.fetch) {
        promises.push(window.ValidationRules.fetch());
      }
      await Promise.all(promises.filter(Boolean));
      if (window.hideGlobalLoading) {
        window.hideGlobalLoading();
      }
      location.reload();
    } catch (e) {
      console.error("[ConfigErrorHandler] Retry failed:", e);
      if (window.hideGlobalLoading) {
        window.hideGlobalLoading();
      }
      if (e.accessDenied && window.ConfigRequiredError?.is?.(e)) {
        this.handle(e, "config retry");
        return;
      }
      this.showOverlay({
        title: this._t("config.retry_failed"),
        message: this._t("config.check_network"),
      });
    }
  }
  static getFailedConfigs() {
    return Array.from(this._handledConfigs);
  }
};
__publicField(_ConfigErrorHandler, "_overlayVisible", false);
__publicField(_ConfigErrorHandler, "_handledConfigs", new Set());
__publicField(_ConfigErrorHandler, "_locale", "en");
__publicField(_ConfigErrorHandler, "_LOCAL_I18N", {
  vi: {
    "config.required": "C\u1EA7n k\u1EBFt n\u1ED1i server",
    "config.offline":
      "Kh\xF4ng th\u1EC3 t\u1EA3i c\u1EA5u h\xECnh. Vui l\xF2ng ki\u1EC3m tra k\u1EBFt n\u1ED1i m\u1EA1ng v\xE0 th\u1EED l\u1EA1i.",
    "config.retry_failed": "Kh\xF4ng th\u1EC3 k\u1EBFt n\u1ED1i",
    "config.check_network":
      "Vui l\xF2ng ki\u1EC3m tra k\u1EBFt n\u1ED1i m\u1EA1ng v\xE0 th\u1EED l\u1EA1i.",
    "common.retry": "Th\u1EED l\u1EA1i",
    "common.loading": "\u0110ang t\u1EA3i...",
    "dialog.offline": "M\u1EA5t k\u1EBFt n\u1ED1i server",
    "dialog.offlineDescription":
      "Kh\xF4ng th\u1EC3 k\u1EBFt n\u1ED1i t\u1EDBi m\xE1y ch\u1EE7 Toby. Vui l\xF2ng ki\u1EC3m tra l\u1EA1i sau.",
  },
  en: {
    "config.required": "Server connection required",
    "config.offline":
      "Cannot load configuration. Please check your network and try again.",
    "config.retry_failed": "Cannot connect",
    "config.check_network": "Please check your network and try again.",
    "common.retry": "Retry",
    "common.loading": "Loading...",
    "dialog.offline": "Server Connection Lost",
    "dialog.offlineDescription":
      "Unable to connect to Toby server. Please try again later.",
  },
  ja: {
    "config.required": "\u30B5\u30FC\u30D0\u30FC\u63A5\u7D9A\u304C\u5FC5\u8981",
    "config.offline":
      "\u8A2D\u5B9A\u3092\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3002\u30CD\u30C3\u30C8\u30EF\u30FC\u30AF\u63A5\u7D9A\u3092\u78BA\u8A8D\u3057\u3066\u304B\u3089\u518D\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002",
    "config.retry_failed": "\u63A5\u7D9A\u3067\u304D\u307E\u305B\u3093",
    "config.check_network":
      "\u30CD\u30C3\u30C8\u30EF\u30FC\u30AF\u63A5\u7D9A\u3092\u78BA\u8A8D\u3057\u3066\u304B\u3089\u518D\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002",
    "common.retry": "\u518D\u8A66\u884C",
    "common.loading": "\u8AAD\u307F\u8FBC\u307F\u4E2D...",
    "dialog.offline":
      "\u30B5\u30FC\u30D0\u30FC\u63A5\u7D9A\u304C\u5207\u308C\u307E\u3057\u305F",
    "dialog.offlineDescription":
      "Toby\u30B5\u30FC\u30D0\u30FC\u306B\u63A5\u7D9A\u3067\u304D\u307E\u305B\u3093\u3002\u5F8C\u3067\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002",
  },
  th: {
    "config.required":
      "\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23\u0E01\u0E32\u0E23\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D\u0E40\u0E0B\u0E34\u0E23\u0E4C\u0E1F\u0E40\u0E27\u0E2D\u0E23\u0E4C",
    "config.offline":
      "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E42\u0E2B\u0E25\u0E14\u0E01\u0E32\u0E23\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32\u0E44\u0E14\u0E49 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E01\u0E32\u0E23\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D\u0E40\u0E04\u0E23\u0E37\u0E2D\u0E02\u0E48\u0E32\u0E22\u0E41\u0E25\u0E30\u0E25\u0E2D\u0E07\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07",
    "config.retry_failed":
      "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D\u0E44\u0E14\u0E49",
    "config.check_network":
      "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E01\u0E32\u0E23\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D\u0E40\u0E04\u0E23\u0E37\u0E2D\u0E02\u0E48\u0E32\u0E22\u0E41\u0E25\u0E30\u0E25\u0E2D\u0E07\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07",
    "common.retry":
      "\u0E25\u0E2D\u0E07\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07",
    "common.loading":
      "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E42\u0E2B\u0E25\u0E14...",
    "dialog.offline":
      "\u0E02\u0E32\u0E14\u0E01\u0E32\u0E23\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D\u0E40\u0E0B\u0E34\u0E23\u0E4C\u0E1F\u0E40\u0E27\u0E2D\u0E23\u0E4C",
    "dialog.offlineDescription":
      "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D\u0E01\u0E31\u0E1A\u0E40\u0E0B\u0E34\u0E23\u0E4C\u0E1F\u0E40\u0E27\u0E2D\u0E23\u0E4C Toby \u0E01\u0E23\u0E38\u0E13\u0E32\u0E25\u0E2D\u0E07\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07\u0E20\u0E32\u0E22\u0E2B\u0E25\u0E31\u0E07",
  },
});
let ConfigErrorHandler = _ConfigErrorHandler;
ConfigErrorHandler._initLocale();
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.af_locale) {
      ConfigErrorHandler._locale = changes.af_locale.newValue || "en";
    }
  });
} catch (e) {}
if (typeof window !== "undefined") {
  window.ConfigErrorHandler = ConfigErrorHandler;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = ConfigErrorHandler;
}
