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
class SystemConfig {
  static async fetch(forceRefresh = false) {
    const force =
      typeof forceRefresh === "object" ? !!forceRefresh.force : !!forceRefresh;
    const scope = window.authManager?.getToken?.() || "";
    if (this._fetchScope !== null && this._fetchScope !== scope)
      this.clearCache();
    this._fetchScope = scope;
    const epoch = this._snapshotEpoch;
    if (
      this._fetchFlight?.scope === scope &&
      this._fetchFlight.epoch === epoch
    ) {
      return this._fetchFlight.promise;
    }
    if (
      !force &&
      this._cache &&
      Date.now() - this._cacheTime < this._cacheTTL
    ) {
      return this._cache;
    }
    if (
      this._fetchFailure?.scope === scope &&
      this._fetchFailure.epoch === epoch &&
      Date.now() < this._fetchFailure.retryAt
    )
      return this._cache || this.getDefaults();
    const flight = { scope, epoch, promise: null };
    this._fetchFlight = flight;
    flight.promise = this._fetchOnce(scope, epoch).finally(() => {
      if (this._fetchFlight === flight) this._fetchFlight = null;
    });
    return flight.promise;
  }
  static async _fetchOnce(scope, epoch) {
    const startedAt = Date.now();
    const current = () =>
      epoch === this._snapshotEpoch &&
      scope === (window.authManager?.getToken?.() || "");
    try {
      const apiBaseUrl = window.ApiBaseConfig.get();
      const headers = {};
      try {
        if (chrome?.runtime?.id) headers["X-Extension-Id"] = chrome.runtime.id;
      } catch (_) {}
      if (scope) headers["Authorization"] = `Bearer ${scope}`;
      try {
        Object.assign(
          headers,
          await (window.RequestSigner?.headers?.(
            "GET",
            new URL(`${apiBaseUrl}/system-settings/public`).pathname,
            "",
          ) || {}),
        );
      } catch (_) {}
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8e3);
      let resp, data;
      try {
        resp = await fetch(`${apiBaseUrl}/system-settings/public`, {
          headers,
          signal: controller.signal,
        });
        if (!resp.ok) throw new Error(`SYSTEM_CONFIG_HTTP_${resp.status}`);
        data = await resp.json();
      } finally {
        clearTimeout(timeoutId);
      }
      if (!current()) return this._cache || this.getDefaults();
      if (
        data.success &&
        data.data &&
        typeof data.data === "object" &&
        !Array.isArray(data.data)
      ) {
        this._fetchFailure = null;
        this._cache = this._publicSettings(data.data);
        this._cacheTime = Date.now();
        if (data.meta && typeof data.meta.version !== "undefined") {
          this._lastVersion = data.meta.version;
        }
        this._persistToStorage(this._cache);
        window.ExtensionUpdateNotice?.render();
        return this._cache;
      }
      throw new Error(data.error?.message || "Unknown error");
    } catch (err) {
      console.warn(
        "[SystemConfig] Fetch failed:",
        JSON.stringify({
          error: err.message,
          durationMs: Date.now() - startedAt,
          stage: "backend_config",
        }),
      );
      if (current())
        this._fetchFailure = { scope, epoch, retryAt: Date.now() + 8e3 };
      return this._cache || this.getDefaults();
    }
  }
  static async _updateFromVersion(remoteVersion) {
    if (this._lastVersion === remoteVersion) return;
    console.log(
      "[SystemConfig] Version mismatch:",
      this._lastVersion,
      "\u2192",
      remoteVersion,
    );
    await this.fetch({ force: true });
    try {
      this.applyToUI();
    } catch (_) {}
  }
  static getDefaults() {
    return {
      google_enabled: true,
      show_upgrade_ui: true,
      show_tip_coffee: true,
      maintenance_mode: false,
      maintenance_message: "",
      app_name: "TobyFlow",
    };
  }
  static handleSseUpdate(data) {
    window.ProviderConfigManager?.clearPrivateConfigs?.();
    this._applyRuntimeUpdate(data, true);
  }
  static handleStorageUpdate(data) {
    this._applyRuntimeUpdate(data, false);
  }
  static _applyRuntimeUpdate(data, persist) {
    if (!data || typeof data !== "object") return;
    this._snapshotEpoch++;
    this._fetchFailure = null;
    const flowKeys = [
      "flow_api_driver",
      "flow_api_v2_enabled",
      "flow_api_v2_canary_percent",
      "flow_api_v2_surfaces",
      "flow_api_v2_media_types",
      "flow_api_auto_primary",
      "flow_api_auto_fallback",
      "flow_api_v2_config_revision",
    ];
    const snapshot = (source) =>
      Object.fromEntries(flowKeys.map((key) => [key, source?.[key] ?? null]));
    const previousFlow = snapshot(this._cache);
    const previousUpload = this.getBool("flow_api_v2_upload_enabled");
    this._cache = this._publicSettings(data);
    this._cacheTime = Date.now();
    if (persist) this._persistToStorage(this._cache);
    this.applyToUI();
    const currentUpload = this.getBool("flow_api_v2_upload_enabled");
    if (previousUpload !== currentUpload) {
      window.eventBus?.emit?.("flow_api:upload_changed", {
        enabled: currentUpload,
        trigger: persist ? "sse" : "storage",
      });
    }
    const currentFlow = snapshot(this._cache);
    const current = this._cache?.flow_api_driver || "v1";
    const revision = Number(this._cache?.flow_api_v2_config_revision || 1);
    if (JSON.stringify(previousFlow) !== JSON.stringify(currentFlow)) {
      window.eventBus?.emit?.("flow_api:driver_changed", {
        previous: previousFlow.flow_api_driver || "v1",
        current,
        revision,
        previousConfig: previousFlow,
        currentConfig: currentFlow,
      });
      window.FlowApiTelemetry?.emit?.(
        "sse_driver_changed",
        {
          from: previousFlow.flow_api_driver || "v1",
          to: current,
          protocolRevision: revision,
          trigger: persist ? "sse" : "storage",
        },
        {
          dedupeKey: `driver_config:${persist ? "sse" : "storage"}:${current}:${revision}:${JSON.stringify(currentFlow)}`,
        },
      );
    }
    console.log(
      "[SystemConfig] Updated via SSE, maintenance_mode:",
      this.getBool("maintenance_mode"),
    );
  }
  static get(key, defaultValue = null) {
    return this._cache?.[key] ?? defaultValue;
  }
  static getBool(key) {
    const val = this._cache?.[key];
    return val === true || val === "1" || val === 1;
  }
  static async getBoolReady(key) {
    const truthy = (v) => v === true || v === "1" || v === 1;
    const before = this._cache?.[key];
    try {
      await this.fetch(true);
    } catch (_) {}
    const after = this._cache?.[key];
    console.log(
      `[SystemConfig.getBoolReady] ${key}: cache_before=${before} \u2192 fetched=${after}`,
    );
    return truthy(after);
  }
  static getInt(key, defaultValue = 0) {
    const val = this._cache?.[key];
    if (val === void 0 || val === null || val === "") return defaultValue;
    const parsed = parseInt(val, 10);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }
  static getList(key, defaultValue = []) {
    const val = this._cache?.[key];
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
  static getJSON(key, defaultValue = null) {
    const val = this._cache?.[key];
    if (val === void 0 || val === null || val === "") return defaultValue;
    if (typeof val === "object") return val;
    if (typeof val === "string") {
      try {
        return JSON.parse(val);
      } catch {
        return defaultValue;
      }
    }
    return defaultValue;
  }
  static getTimeout(key) {
    const serverVal = this._cache?.[key];
    if (serverVal !== void 0 && serverVal !== null && serverVal !== "") {
      const parsed = parseInt(serverVal, 10);
      if (!Number.isNaN(parsed)) return parsed;
    }
    if (window.ConfigRequiredError && !this._cache) {
      this.fetch().catch(() => {});
      throw new window.ConfigRequiredError(`timeout_${key}`, "cache_empty");
    }
    return 0;
  }
  static safeGetTimeout(key) {
    try {
      return this.getTimeout(key);
    } catch (err) {
      if (window.ConfigRequiredError?.is?.(err)) {
        console.debug(`[SystemConfig] safeGetTimeout: ${err.message}`);
        return 0;
      }
      throw err;
    }
  }
  static debugTimeouts() {
    console.group("[SystemConfig] Timeout Values Debug");
    console.log("Cache loaded:", !!this._cache);
    console.log("Cache contents:", this._cache);
    console.groupEnd();
    return { cache: this._cache };
  }
  static clearCache() {
    this._snapshotEpoch++;
    this._fetchFailure = null;
    this._cache = null;
    this._cacheTime = 0;
  }
  static _persistToStorage(data) {
    try {
      chrome.storage?.local?.set({
        af_system_settings: this._publicSettings(data),
      });
    } catch (_) {}
  }
  static async restoreFromStorage() {
    return new Promise((resolve) => {
      try {
        chrome.storage?.local?.get(["af_system_settings"], (res) => {
          if (res?.af_system_settings) {
            this._cache = this._publicSettings(res.af_system_settings);
            if (Object.hasOwn(res.af_system_settings, "bridge_download_url"))
              this._persistToStorage(this._cache);
            this._cacheTime = Date.now() - this._cacheTTL - 1;
          }
          resolve(this._cache || this.getDefaults());
        });
      } catch (_) {
        resolve(this.getDefaults());
      }
    });
  }
  static _publicSettings(data) {
    const settings = { ...data };
    delete settings.bridge_download_url;
    return settings;
  }
  static applyToUI() {
    window.ExtensionUpdateNotice?.render();
    if (!this.getBool("show_upgrade_ui")) {
      document.body.classList.add("hide-upgrade-ui");
    } else {
      document.body.classList.remove("hide-upgrade-ui");
    }
    const tipCoffeeBtn = document.getElementById("tipCoffeeBtn");
    const showTipCoffee = this.getBool("show_tip_coffee");
    console.log(
      "[SystemConfig] show_tip_coffee:",
      showTipCoffee,
      "cache:",
      this._cache?.show_tip_coffee,
    );
    if (tipCoffeeBtn) {
      tipCoffeeBtn.style.display = showTipCoffee ? "" : "none";
    }
    const googleEnabled = this.getBool("google_enabled");
    document.querySelectorAll("[data-requires-google]").forEach((el) => {
      el.style.display = googleEnabled ? "" : "none";
    });
    if (!googleEnabled) {
      const googleLoginBtn = document.getElementById("googleLoginBtn");
      const googleRegisterBtn = document.getElementById("googleRegisterBtn");
      [googleLoginBtn, googleRegisterBtn].forEach((btn) => {
        if (btn) {
          const prevDivider = btn.previousElementSibling;
          if (prevDivider?.classList?.contains("login-divider")) {
            prevDivider.style.display = "none";
          }
        }
      });
    }
    this._applyMaintenanceMode();
    const appName = this.get("app_name");
    if (appName) {
      const headerTitles = document.querySelectorAll(".tobyflow-header-title");
      headerTitles.forEach((el) => {
        el.textContent = appName;
      });
      const headerLogos = document.querySelectorAll(
        ".tobyflow-header-logo img",
      );
      headerLogos.forEach((el) => {
        el.alt = appName;
      });
    }
    const logoUrl = this.get("app_logo_url");
    if (logoUrl) {
      const headerLogos = document.querySelectorAll(
        ".tobyflow-header-logo img, .tobyflow-header-logo-img",
      );
      headerLogos.forEach((el) => {
        el.dataset.fallbackSrc = el.src;
        el.src = logoUrl;
        el.onerror = function () {
          if (this.dataset.fallbackSrc) {
            this.src = this.dataset.fallbackSrc;
          }
        };
      });
    }
  }
  static _applyMaintenanceMode() {
    const isMaintenanceMode = this.getBool("maintenance_mode");
    let overlay = document.getElementById("tobyflow-maintenance-overlay");
    if (isMaintenanceMode) {
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "tobyflow-maintenance-overlay";
        overlay.className = "maintenance-overlay";
        overlay.innerHTML = `
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v4"></path>
            <path d="m4.93 4.93 2.83 2.83"></path>
            <path d="M2 12h4"></path>
            <path d="m4.93 19.07 2.83-2.83"></path>
            <path d="M12 18v4"></path>
            <path d="m19.07 19.07-2.83-2.83"></path>
            <path d="M18 12h4"></path>
            <path d="m19.07 4.93-2.83 2.83"></path>
            <circle cx="12" cy="12" r="4"></circle>
          </svg>
          <h2>${window.I18n?.t("msg.maintenanceTitle") || "System Maintenance"}</h2>
          <p>${this.get("maintenance_message", window.I18n?.t("msg.maintenanceDefault") || "System is under maintenance. Please come back later.")}</p>
        `;
        document.body.appendChild(overlay);
      } else {
        const msgEl = overlay.querySelector("p");
        if (msgEl) {
          msgEl.textContent = this.get(
            "maintenance_message",
            window.I18n?.t("msg.maintenanceDefault") ||
              "System is under maintenance. Please come back later.",
          );
        }
        overlay.style.display = "";
      }
    } else if (overlay) {
      overlay.style.display = "none";
    }
  }
}
__publicField(SystemConfig, "_cache", null);
__publicField(SystemConfig, "_cacheTime", 0);
__publicField(SystemConfig, "_cacheTTL", 60 * 60 * 1e3);
__publicField(SystemConfig, "_lastVersion", null);
__publicField(SystemConfig, "_fetchFlight", null);
__publicField(SystemConfig, "_snapshotEpoch", 0);
__publicField(SystemConfig, "_fetchFailure", null);
__publicField(SystemConfig, "_fetchScope", null);
window.SystemConfig = SystemConfig;
if (typeof chrome !== "undefined" && chrome.storage?.onChanged?.addListener) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.af_system_settings?.newValue) return;
    const snapshot = changes.af_system_settings.newValue;
    if (JSON.stringify(snapshot) === JSON.stringify(SystemConfig._cache))
      return;
    SystemConfig.handleStorageUpdate(snapshot);
  });
}
