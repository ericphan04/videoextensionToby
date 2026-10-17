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
class ExtensionDeviceManager {
  static init() {
    if (this._initialized) return;
    this._initialized = true;
    const claim = () =>
      this.claim().catch((error) => {
        console.warn("[ExtensionDeviceManager] Auto-claim failed", {
          code: error?.code || null,
          status: error?.httpStatus || null,
          message: error?.message || null,
        });
      });
    window.eventBus?.on("auth:login", claim);
    window.eventBus?.on("auth:restored", claim);
    window.eventBus?.on("sse:entitlements_changed", (data) => {
      this.handleEntitlementsChanged(data).catch((error) => {
        console.warn(
          "[ExtensionDeviceManager] Entitlement seat update failed",
          {
            code: error?.code || null,
            status: error?.httpStatus || null,
            message: error?.message || null,
          },
        );
      });
    });
    window.eventBus?.on("auth:logout", () => {
      this._promptedOwner = null;
      this._lastDeviceLimit = 0;
      this._dismissLimitModal();
    });
    this._lastDeviceLimit = this._getDeviceLimit(
      window.featureGate?.entitlements?.extension_device_max,
    );
    if (window.authManager?.isLoggedIn?.()) claim();
  }
  static async handleEntitlementsChanged(data) {
    if (!window.authManager?.isLoggedIn?.()) return null;
    if (
      !Object.prototype.hasOwnProperty.call(
        data?.features || {},
        "extension_device_max",
      )
    )
      return null;
    const nextLimit = this._getDeviceLimit(data.features.extension_device_max);
    const previousLimit = this._lastDeviceLimit;
    this._lastDeviceLimit = nextLimit;
    if (!this._isLimitIncrease(previousLimit, nextLimit)) return null;
    console.info(
      "[ExtensionDeviceManager] Device seat limit increased; claiming this extension",
      { previousLimit, nextLimit },
    );
    const result = await this.claim();
    if (result?.registered === true) {
      this._promptedOwner = null;
      this._limitModalActivation?.();
      window.eventBus?.emit?.("extension-device:claimed", {
        source: "entitlement_update",
      });
    }
    return result;
  }
  static _getDeviceLimit(feature) {
    const raw =
      feature && typeof feature === "object" ? feature.value : feature;
    const value = Number(raw);
    if (!Number.isFinite(value)) return 0;
    return Math.trunc(value);
  }
  static _isLimitIncrease(previous, next) {
    if (next === -1) return previous !== -1;
    if (next <= 0) return false;
    if (previous === -1) return false;
    return next > Math.max(0, previous);
  }
  static async claim() {
    if (!window.authManager?.isLoggedIn?.() || !window.authManager?._apiCall)
      return null;
    if (this._claimPromise) return this._claimPromise;
    this._claimPromise = chrome.runtime
      .sendMessage({ action: "CLAIM_PROTECTED_DEVICE" })
      .then((response) => {
        if (response?.success !== true)
          throw Object.assign(
            new Error(response?.error?.code || "CONFIG_ACCESS_REQUIRED"),
            { code: response?.error?.code, httpStatus: response?.httpStatus },
          );
        const result = response.data;
        if (result?.device_limit_reached === true) this._showLimitModal(result);
        return result;
      })
      .finally(() => {
        this._claimPromise = null;
      });
    return this._claimPromise;
  }
  static async _showLimitModal(claimResult = {}) {
    if (window.location?.pathname?.endsWith("settings.html")) return;
    const ownerId = String(window.authManager?.user?.id || "");
    if (!ownerId || this._promptedOwner === ownerId) return;
    this._promptedOwner = ownerId;
    const escape = (value) => {
      const el = document.createElement("div");
      el.textContent = String(value || "");
      return el.innerHTML;
    };
    const formatTime = (value) => {
      if (!value) return "Ch\u01B0a c\xF3 ho\u1EA1t \u0111\u1ED9ng";
      const date = new Date(value);
      return Number.isNaN(date.getTime())
        ? "Ch\u01B0a c\xF3 ho\u1EA1t \u0111\u1ED9ng"
        : date.toLocaleString();
    };
    const close = () => {
      if (modal.dataset.replaceInFlight !== "1") this._dismissLimitModal();
    };
    const modal = document.createElement("div");
    modal.className = "extension-device-limit-overlay";
    modal.innerHTML = `
      <div class="extension-device-limit-content" role="dialog" aria-modal="true" aria-labelledby="extension-device-limit-title">
        <div class="extension-device-limit-header">
          <svg class="extension-device-limit-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"></rect><path d="M8 21h8M12 17v4"></path></svg>
          <div class="extension-device-limit-header-text">
            <div class="extension-device-limit-title" id="extension-device-limit-title">\u0110\xE3 \u0111\u1EA1t gi\u1EDBi h\u1EA1n ${escape(claimResult.device_limit ?? "")} thi\u1EBFt b\u1ECB</div>
          </div>
        </div>
        <div class="extension-device-limit-intro">G\u1EE1 m\u1ED9t thi\u1EBFt b\u1ECB c\u0169 \u0111\u1EC3 k\xEDch ho\u1EA1t extension n\xE0y.</div>
        <div class="extension-device-limit-list" data-device-list><div class="extension-device-limit-empty">\u0110ang t\u1EA3i danh s\xE1ch thi\u1EBFt b\u1ECB\u2026</div></div>
        <div class="extension-device-limit-note">Thi\u1EBFt b\u1ECB \u0111\u01B0\u1EE3c g\u1EE1 s\u1EBD ng\u1EEBng ho\u1EA1t \u0111\u1ED9ng.</div>
        <p class="extension-device-limit-error" data-device-error hidden></p>
        <div class="extension-device-limit-actions" data-device-actions></div>
      </div>`;
    this._limitModal = modal;
    modal.addEventListener("click", (event) => event.stopPropagation());
    this._limitModalEscHandler = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
      }
    };
    document.addEventListener("keydown", this._limitModalEscHandler);
    (document.getElementById("sidebar-content") || document.body).appendChild(
      modal,
    );
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "btn";
    dismiss.textContent = window.I18n?.t?.("common.close") || "";
    dismiss.addEventListener("click", close);
    modal.querySelector(".extension-device-limit-header")?.appendChild(dismiss);
    const listEl = modal.querySelector("[data-device-list]");
    const errorEl = modal.querySelector("[data-device-error]");
    const actionsEl = modal.querySelector("[data-device-actions]");
    const showError = (message) => {
      errorEl.textContent = message;
      errorEl.hidden = false;
    };
    const activateCurrentExtension = () => {
      if (this._limitModal !== modal) return;
      this._stopLimitHealthCheck();
      listEl.innerHTML =
        '<div class="extension-device-limit-empty extension-device-limit-success">Extension n\xE0y \u0111\xE3 \u0111\u01B0\u1EE3c k\xEDch ho\u1EA1t th\xE0nh c\xF4ng.</div>';
      errorEl.hidden = true;
      actionsEl.innerHTML =
        '<button class="btn btn-primary" data-action="complete">Ho\xE0n t\u1EA5t</button>';
      actionsEl
        .querySelector('[data-action="complete"]')
        ?.addEventListener("click", close);
    };
    this._limitModalActivation = activateCurrentExtension;
    const checkSlot = async () => {
      try {
        const result = await this.claim();
        if (result?.registered === true) activateCurrentExtension();
        else if (result?.device_limit_reached !== true)
          showError(
            "Kh\xF4ng th\u1EC3 ki\u1EC3m tra ch\u1ED7 tr\u1ED1ng cho extension n\xE0y.",
          );
      } catch (error) {
        showError(
          error?.message ||
            "Kh\xF4ng th\u1EC3 ki\u1EC3m tra ch\u1ED7 tr\u1ED1ng. \u0110ang t\u1EF1 ki\u1EC3m tra l\u1EA1i.",
        );
      }
    };
    this._startLimitHealthCheck(modal, checkSlot);
    try {
      const response = await window.authManager._apiCall(
        "GET",
        "extension-devices",
      );
      if (this._limitModal !== modal) return;
      const devices = Array.isArray(response)
        ? response
        : Array.isArray(response?.data)
          ? response.data
          : [];
      const removable = devices.filter(
        (device) => !device.current && !device.revoked_at,
      );
      if (!removable.length) {
        listEl.innerHTML =
          '<div class="extension-device-limit-empty">Kh\xF4ng t\xECm th\u1EA5y thi\u1EBFt b\u1ECB c\u0169 c\xF3 th\u1EC3 g\u1EE1. H\xE3y th\u1EED l\u1EA1i sau.</div>';
        return;
      }
      listEl.innerHTML = removable
        .map(
          (device) => `
        <div class="extension-device-limit-item">
          <div class="extension-device-limit-device-icon" aria-hidden="true"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4" width="18" height="13" rx="2"></rect><path d="M8 21h8M12 17v4"></path></svg></div>
          <div class="extension-device-limit-item-info"><span class="extension-device-limit-name">${escape(device.label || "TobyFlow extension")}</span><span class="extension-device-limit-date">${escape(device.device_code ? `#${device.device_code} \xB7 ` : "")}${escape(formatTime(device.last_seen_at))}</span></div>
          <button class="extension-device-limit-remove" data-remove-device="${escape(device.id)}" title="G\u1EE1 thi\u1EBFt b\u1ECB" aria-label="G\u1EE1 thi\u1EBFt b\u1ECB">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v5M14 11v5"></path></svg>
          </button>
        </div>`,
        )
        .join("");
      listEl.querySelectorAll("[data-remove-device]").forEach((button) =>
        button.addEventListener("click", async () => {
          const deviceId = button.dataset.removeDevice;
          if (!deviceId) return;
          const device = removable.find(
            (item) => String(item.id) === String(deviceId),
          );
          const confirmed = window.customDialog?.confirmDangerous
            ? await window.customDialog.confirmDangerous(
                "Thi\u1EBFt b\u1ECB n\xE0y s\u1EBD b\u1ECB g\u1EE1 v\xE0 extension hi\u1EC7n t\u1EA1i s\u1EBD \u0111\u01B0\u1EE3c k\xEDch ho\u1EA1t thay th\u1EBF.",
                {
                  title: "G\u1EE1 thi\u1EBFt b\u1ECB",
                  itemName: device?.label || "TobyFlow extension",
                  confirmText: "G\u1EE1 & k\xEDch ho\u1EA1t",
                  cancelText: "H\u1EE7y",
                  zIndex: 10000080,
                },
              )
            : false;
          if (!confirmed || this._limitModal !== modal) return;
          modal.dataset.replaceInFlight = "1";
          const originalButtonContent = button.innerHTML;
          button.disabled = true;
          button.textContent = "\u2026";
          errorEl.hidden = true;
          try {
            const result = await window.authManager._apiCall(
              "DELETE",
              `extension-devices/${encodeURIComponent(deviceId)}`,
            );
            if (result?.replacement_registered !== true) {
              throw new Error(
                result?.error?.message ||
                  "Kh\xF4ng th\u1EC3 k\xEDch ho\u1EA1t extension n\xE0y.",
              );
            }
            activateCurrentExtension();
          } catch (error) {
            button.disabled = false;
            button.innerHTML = originalButtonContent;
            showError(
              error?.message ||
                "Kh\xF4ng th\u1EC3 g\u1EE1 thi\u1EBFt b\u1ECB. Vui l\xF2ng th\u1EED l\u1EA1i.",
            );
          } finally {
            delete modal.dataset.replaceInFlight;
          }
        }),
      );
    } catch (error) {
      if (this._limitModal === modal) {
        listEl.innerHTML =
          '<div class="extension-device-limit-empty">Kh\xF4ng t\u1EA3i \u0111\u01B0\u1EE3c danh s\xE1ch thi\u1EBFt b\u1ECB.</div>';
        showError(
          error?.message ||
            "Vui l\xF2ng ki\u1EC3m tra k\u1EBFt n\u1ED1i v\xE0 th\u1EED l\u1EA1i.",
        );
      }
    }
  }
  static _dismissLimitModal() {
    this._stopLimitHealthCheck();
    if (this._limitModalEscHandler)
      document.removeEventListener("keydown", this._limitModalEscHandler);
    this._limitModalEscHandler = null;
    this._limitModal?.remove();
    this._limitModal = null;
    this._limitModalActivation = null;
  }
  static _startLimitHealthCheck(modal, checkSlot) {
    this._stopLimitHealthCheck();
    this._limitHealthTimer = setInterval(() => {
      if (this._limitModal !== modal) return this._stopLimitHealthCheck();
      if (modal.dataset.replaceInFlight === "1") return;
      checkSlot();
    }, 15e3);
  }
  static _stopLimitHealthCheck() {
    if (this._limitHealthTimer) clearInterval(this._limitHealthTimer);
    this._limitHealthTimer = null;
  }
}
__publicField(ExtensionDeviceManager, "_initialized", false);
__publicField(ExtensionDeviceManager, "_claimPromise", null);
__publicField(ExtensionDeviceManager, "_promptedOwner", null);
__publicField(ExtensionDeviceManager, "_limitModal", null);
__publicField(ExtensionDeviceManager, "_limitModalActivation", null);
__publicField(ExtensionDeviceManager, "_limitModalEscHandler", null);
__publicField(ExtensionDeviceManager, "_limitHealthTimer", null);
__publicField(ExtensionDeviceManager, "_lastDeviceLimit", 0);
window.ExtensionDeviceManager = ExtensionDeviceManager;
