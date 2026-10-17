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
class ConfigAccessUI {
  static _accessGroup(code) {
    if (code === "AUTH_REQUIRED") return "login";
    if (
      [
        "KEY_MISSING",
        "KEY_MISMATCH",
        "CLIENT_RESET_REQUIRES_REPLACEMENT",
        "REPLACEMENT_RESPONSE_LOST",
      ].includes(code)
    )
      return "key";
    if (
      /DEVICE_(UNREGISTERED|LIMIT|REVOKED)|EXTENSION_DEVICE_(LIMIT|REVOKED)/.test(
        code,
      )
    )
      return "device";
    if (/BANNED|BLOCKED|DISABLED|KEY_REVOKED|NOT_AUTHORIZED/.test(code))
      return "blocked";
    return "service";
  }
  static serviceUnavailable() {
    return (
      !!this._state?.code && this._accessGroup(this._state.code) === "service"
    );
  }
  static retry(trigger = "manual") {
    if (this._retryFlight) return this._retryFlight;
    const flight = chrome.runtime
      .sendMessage({ action: "RETRY_PROTECTED_CONFIG", trigger })
      .then(async (result) => {
        if (result?.success) await this.recovered();
        else await this.refresh();
        return result;
      });
    this._retryFlight = flight;
    flight
      .finally(() => {
        if (this._retryFlight === flight) this._retryFlight = null;
      })
      .catch(() => {});
    return flight;
  }
  static recovered() {
    if (this._recoveredFlight) return this._recoveredFlight;
    const flight = (async () => {
      await Promise.allSettled([
        window.ProviderConfigManager?.fetch?.(),
        window.ProviderConfigManager?._fetchApiConfigs?.(),
        window.ModelRegistry?.fetch?.(),
        window.ExecutionConfig?.getConfig?.(),
      ]);
      const status = await this.refresh();
      if (status.ready) {
        window.eventBus?.emit?.("provider:updated", {
          source: "config_recovery",
        });
        window.eventBus?.emit?.("config:protected_ready");
      }
    })();
    this._recoveredFlight = flight;
    flight
      .finally(() => {
        if (this._recoveredFlight === flight) this._recoveredFlight = null;
      })
      .catch(() => {});
    return flight;
  }
  static async refresh() {
    const status = await RequestSigner.protectedStatus();
    this.show(status.ready ? null : status);
    return status;
  }
  static show(state) {
    this._state = state;
    this._banner?.remove();
    this._banner = null;
    window.ConfigErrorHandler?.hideOverlay?.();
    if (document.getElementById("tobyflow-offline-overlay")) {
      window.eventBus?.emit?.(
        "config:service_unavailable",
        this.serviceUnavailable() ? state : null,
      );
      if (this.serviceUnavailable()) return;
    } else if (this.serviceUnavailable()) {
      window.ConfigErrorHandler?.showOverlay?.({
        title: window.ConfigErrorHandler._t("dialog.offline"),
        message: window.ConfigErrorHandler._t("dialog.offlineDescription"),
      });
      return;
    }
    if (!state?.code || !document.body) return;
    const code = state.code;
    const keyMissing = [
      "KEY_MISSING",
      "KEY_MISMATCH",
      "CLIENT_RESET_REQUIRES_REPLACEMENT",
      "REPLACEMENT_RESPONSE_LOST",
    ].includes(code);
    const group = this._accessGroup(code);
    const banner = document.createElement("aside");
    banner.id = "tobyflow-config-access-banner";
    banner.style.cssText =
      "padding:10px 14px;border:1px solid #a16207;background:#422006;color:#fef3c7;margin:8px;border-radius:8px;font:13px system-ui;";
    const message = document.createElement("span");
    message.textContent =
      window.I18n?.t?.(
        `configAccess.${code === "REPLACEMENT_RESPONSE_LOST" ? "lost" : group}`,
      ) || code;
    banner.appendChild(message);
    const button = document.createElement("button");
    const settingsPage = location.pathname === "/settings.html";
    button.textContent =
      window.I18n?.t?.(
        keyMissing && settingsPage
          ? `configAccess.${code === "REPLACEMENT_RESPONSE_LOST" ? "retryReplacement" : "replace"}`
          : "configAccess.settings",
      ) || "";
    button.style.cssText = "margin-left:10px;padding:5px 8px;cursor:pointer;";
    button.addEventListener("click", async () => {
      if (!keyMissing || !settingsPage) {
        chrome.runtime.sendMessage({ action: "openSettings" }).catch(() => {});
        return;
      }
      if (!window.confirm(window.I18n?.t?.("configAccess.confirm") || ""))
        return;
      button.disabled = true;
      try {
        const result = await chrome.runtime.sendMessage({
          action: "REPLACE_DEVICE_IDENTITY",
          confirmed: true,
          retryOrphan: code === "REPLACEMENT_RESPONSE_LOST",
        });
        if (!result?.success) {
          this.show({
            code: result?.error?.code || "CONFIG_CONTRACT_UNAVAILABLE",
          });
          return;
        }
        await window.ExtensionDeviceManager?.claim?.();
        await window.ProviderConfigManager?.fetch?.();
        await this.refresh();
      } catch (error) {
        this.show({ code: error.code || "CONFIG_CONTRACT_UNAVAILABLE" });
      } finally {
        button.disabled = false;
      }
    });
    banner.appendChild(button);
    (document.getElementById("sidebar-content") || document.body).prepend(
      banner,
    );
    this._banner = banner;
  }
}
__publicField(ConfigAccessUI, "_state", null);
__publicField(ConfigAccessUI, "_banner", null);
__publicField(ConfigAccessUI, "_retryFlight", null);
__publicField(ConfigAccessUI, "_recoveredFlight", null);
window.ConfigAccessUI = ConfigAccessUI;
window.eventBus?.on?.("config:access_required", (state) =>
  ConfigAccessUI.show(state),
);
window.eventBus?.on?.("config:protected_ready", () =>
  ConfigAccessUI.refresh().catch(() => {}),
);
window.eventBus?.on?.("provider:models_updated", () =>
  ConfigAccessUI.refresh().catch(() => {}),
);
window.eventBus?.on?.("i18n:changed", () =>
  ConfigAccessUI.show(ConfigAccessUI._state),
);
window.eventBus?.on?.("i18n:reloaded", () =>
  ConfigAccessUI.show(ConfigAccessUI._state),
);
document.addEventListener("DOMContentLoaded", () =>
  ConfigAccessUI.refresh().catch(() => {}),
);
try {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "CONFIG_ACCESS_INVALIDATED")
      ConfigAccessUI.show({ code: message.code, retryable: message.retryable });
    if (message.type === "CONFIG_ACCESS_RECOVERED")
      ConfigAccessUI.recovered().catch(() => {});
  });
  window.addEventListener("online", () =>
    ConfigAccessUI.retry("online").catch(() => {}),
  );
} catch (_) {}
