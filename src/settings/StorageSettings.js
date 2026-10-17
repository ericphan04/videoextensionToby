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
const _StorageSettings = class _StorageSettings {
  constructor() {
    this.defaults = {
      inputTimeout: 1200,
      randomDelayMin: 3,
      randomDelayMax: 10,
      queueEnabled: false,
      manualSubmitMode: false,
      autoDownload: false,
      flowApiAutoOpenTrackerGrid: true,
      autoRemoveWatermark: false,
      autoRemoveWatermarkVideo: false,
      autoRemoveWatermarkInput: false,
      downloadFolder: "tobyflow_output",
      fileNameProject: "",
      fileNameTemplate: "[Date]_[Project]_[Prompt]_[Index]",
      downloadResolution: "1k",
      videoDownloadResolution: "720p",
      theme: "dark",
      language: "vi",
      notifyOnComplete: true,
      notifySound: false,
      notifyTelegram: false,
      telegramAutoDownload: true,
      telegramDownloadFolder: "tobyflow_bot",
      telegramDownloadResolution: "1k",
      telegramVideoDownloadResolution: "720p",
      mcpAutoDownload: false,
      mcpDownloadFolder: "tobyflow_mcp",
      mcpDownloadResolution: "1k",
      mcpVideoDownloadResolution: "720p",
      telegramDefaultProvider: "flow",
      telegramFlowRatio: "16:9",
      telegramFlowModel: "",
      telegramChatgptRatio: "square",
      telegramGrokMode: "image",
      telegramGrokRatio: "widescreen",
      telegramGrokDuration: "6s",
      telegramGrokResolution: "720p",
      telegramGrokImageQuality: "speed",
      blobMaxAgeDays: 7,
      humanizedMode: false,
      humanizedSpeed: 0.5,
      defaultGenType: "Image",
      defaultRatio: "9:16",
      defaultImageRatio: "16:9",
      defaultVideoRatio: "16:9",
      defaultVideoInputType: "Ingredients",
      defaultImageModel: "",
      defaultVideoModel: "",
      defaultProvider: "flow",
      chatgptDefaultRatio: "story",
      chatgptModel: null,
      chatgptFallbackPrefix: "Generate an image of: ",
      chatgptAutoClose: false,
      chatgptDeleteAfterGen: false,
      museDefaultRatio: null,
      museDeleteAfterGen: false,
      grokDefaultMode: "image",
      grokDefaultRatio: "widescreen",
      grokDefaultDuration: "6s",
      grokDefaultResolution: "720p",
      grokDefaultImageQuality: "speed",
      grokAutoClose: false,
    };
    this.settings = { ...this.defaults };
    this._syncTimer = null;
    this._syncing = false;
    this._fetchingFromServer = false;
    this.ready = this.init();
  }
  async init() {
    this._listenForChanges();
    this._listenForAuthEvents();
    await Promise.all([this._refreshOwnerCache(), this._refreshTouchedCache()]);
    await this._loadServerDefaults();
    this._hydrateModelDefaults();
    await this.loadAndApply();
    await this._correctSavedFlowModelData();
    window.eventBus?.on?.("provider:models_updated", () => {
      this._hydrateModelDefaults();
      this._correctSavedFlowModelData().catch((error) =>
        console.warn(
          "[StorageSettings] Model data correction failed:",
          error?.message,
        ),
      );
    });
  }
  _hydrateModelDefaults() {
    try {
      const flowImage = window.ModelRegistry?.safeGetDefault?.("flow", "image");
      const flowVideo = window.ModelRegistry?.safeGetDefault?.("flow", "video");
      if (flowImage) {
        if (!this.defaults.defaultImageModel)
          this.defaults.defaultImageModel = flowImage;
        if (!this.defaults.telegramFlowModel)
          this.defaults.telegramFlowModel = flowImage;
      }
      if (flowVideo && !this.defaults.defaultVideoModel) {
        this.defaults.defaultVideoModel = flowVideo;
      }
    } catch (_) {}
  }
  async _loadServerDefaults() {
    const MAX_ATTEMPTS = 3;
    const TIMEOUTS_MS = [4e3, 6e3, 8e3];
    let lastErr = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const json = await this._fetchDefaultsOnce(TIMEOUTS_MS[attempt - 1]);
        if (json) return this._applyServerDefaults(json);
      } catch (err) {
        lastErr = err;
        if (err?.status === 429) break;
        if (attempt < MAX_ATTEMPTS) {
          const delay = 500 * attempt;
          console.warn(
            `[StorageSettings] Server defaults fetch attempt ${attempt}/${MAX_ATTEMPTS} failed (${err.message}), retry in ${delay}ms`,
          );
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    if (lastErr?.status === 429) {
      console.warn(
        "[StorageSettings] default-settings rate-limited (429) \u2014 server reachable, gi\u1EEF config cache, skip offline overlay",
      );
      return;
    }
    console.error(
      "[StorageSettings] Server defaults fetch FAILED after retries:",
      lastErr?.message,
    );
    window.eventBus?.emit?.("config:offline", {
      source: "default-settings",
      error: lastErr?.message,
    });
  }
  async _fetchDefaultsOnce(timeoutMs = 8e3) {
    const baseUrl = window.ApiBaseConfig.get();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const headers = { Accept: "application/json" };
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
    let resp;
    try {
      resp = await fetch(`${baseUrl}/default-settings`, {
        cache: "no-store",
        signal: controller.signal,
        headers,
      });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!resp.ok) {
      const e = new Error(`HTTP ${resp.status}`);
      e.status = resp.status;
      throw e;
    }
    const json = await resp.json();
    return json.success && json.data && typeof json.data === "object"
      ? json
      : null;
  }
  _applyServerDefaults(json) {
    try {
      const prevLanguage = this.defaults.language;
      this.defaults = { ...this.defaults, ...json.data };
      if (json.meta && typeof json.meta.version !== "undefined") {
        this._lastVersion = json.meta.version;
      }
      console.log("[StorageSettings] Loaded server defaults (Initiative 6)");
      chrome.storage?.local?.get(["af_settings"], (res) => {
        const existing = res.af_settings;
        const isFreshInstall = !existing || Object.keys(existing).length === 0;
        if (isFreshInstall) {
          chrome.storage.local.set({ af_settings: this.defaults }, () => {
            console.log(
              "[StorageSettings] Persisted server defaults to af_settings (fresh install)",
            );
          });
        }
      });
      const newLanguage = json.data.language;
      if (
        newLanguage &&
        newLanguage !== prevLanguage &&
        window.I18n?.setLocale
      ) {
        chrome.storage?.local?.get(["af_locale"], (res) => {
          if (!res.af_locale) {
            console.log(
              `[StorageSettings] Anonymous user: applying admin default_language=${newLanguage}`,
            );
            window.I18n.setLocale(newLanguage);
          }
        });
      }
    } catch (e) {
      console.warn("[StorageSettings] _applyServerDefaults error:", e.message);
    }
  }
  async loadAndApply() {
    try {
      const authScope = this._settingsAuthScope();
      const localSnapshot = await new Promise((resolve) => {
        chrome.storage.local.get(
          ["af_settings", "af_settings_owner", "af_settings_touched"],
          resolve,
        );
      });
      const localSettings = localSnapshot.af_settings || {};
      if (authScope !== this._settingsAuthScope()) return;
      this._cachedOwner = localSnapshot.af_settings_owner || null;
      this._cachedTouchedKeys = new Set(
        localSnapshot.af_settings_touched || [],
      );
      _StorageSettings._migrateRenamedKeys(localSettings);
      const validLocal = this._validateLocalOwner(localSettings);
      const hasRealLocal = this._hasUserOverride(validLocal);
      this.settings = { ...this.defaults, ...validLocal };
      const _pruned = _StorageSettings._pruneDeprecatedAiTools(this.settings);
      if (_pruned.removed > 0) {
        this.settings = _pruned.cleaned;
        console.log(
          `[StorageSettings] Pruned ${_pruned.removed} deprecated i2p/PA keys kh\u1ECFi settings`,
        );
      }
      if (
        window.authManager?.isLoggedIn() &&
        (!this._lastServerFetch || Date.now() - this._lastServerFetch > 3e3)
      ) {
        try {
          this._fetchingFromServer = true;
          const serverData = await this._fetchServerSettings();
          if (authScope !== this._settingsAuthScope()) return;
          if (serverData?.settings_json) {
            _StorageSettings._migrateRenamedKeys(serverData.settings_json);
            const mergedSettings = await this._mergeCurrentServerSettings(
              serverData.settings_json,
              validLocal,
            );
            if (authScope !== this._settingsAuthScope()) return;
            this.settings = mergedSettings;
            await this._saveLocalAndAwaitChange(this.settings);
          }
        } catch (err) {
          console.warn(
            "[StorageSettings] Server sync failed, using local:",
            err.message,
          );
        } finally {
          this._fetchingFromServer = false;
        }
      }
      this.applyTheme(this.settings.theme);
      this.syncExecutorSettings(this.settings);
      this._appliedSettingsAuthScope = authScope;
      console.log("[StorageSettings] Settings applied");
      window.eventBus?.emit?.("storageSettings:loaded", {
        settings: this.settings,
      });
    } catch (error) {
      console.error("[StorageSettings] Load failed:", error);
    }
  }
  _settingsAuthScope() {
    const userId = window.authManager?.user?.id;
    return window.authManager?.isLoggedIn?.() && userId != null
      ? `user:${userId}`
      : "anonymous";
  }
  async ensureAuthSettingsReady() {
    await this.ready;
    if (this._appliedSettingsAuthScope === this._settingsAuthScope()) return;
    if (this._authSettingsFlight) {
      const flightScope = this._authSettingsFlightScope;
      await this._authSettingsFlight;
      if (flightScope !== this._settingsAuthScope())
        return this.ensureAuthSettingsReady();
      return;
    }
    const authScope = this._settingsAuthScope();
    const flight = this.loadAndApply();
    this._authSettingsFlight = flight;
    this._authSettingsFlightScope = authScope;
    try {
      await flight;
    } finally {
      if (this._authSettingsFlight === flight) this._authSettingsFlight = null;
    }
    if (authScope !== this._settingsAuthScope())
      return this.ensureAuthSettingsReady();
  }
  getSettings() {
    _StorageSettings._canonicalizeFlowModelValues(this.settings);
    return this.settings;
  }
  get(key) {
    _StorageSettings._canonicalizeFlowModelValues(this.settings);
    return this.settings?.[key];
  }
  set(key, value) {
    this.settings = { ...this.settings, [key]: value };
    try {
      chrome.storage.local.get(["af_settings"], (r) => {
        const merged = { ...(r.af_settings || {}), [key]: value };
        chrome.storage.local.set({ af_settings: merged });
      });
    } catch (_) {}
  }
  async _updateFromVersion(remoteVersion) {
    if (this._lastVersion === remoteVersion) return;
    console.log(
      "[StorageSettings] Version mismatch:",
      this._lastVersion,
      "\u2192",
      remoteVersion,
    );
    await this._loadServerDefaults();
    this.settings = { ...this.defaults, ...this.settings };
    window.eventBus?.emit?.("default_settings:refreshed", {
      source: "version_poller",
    });
  }
  static _migrateRenamedKeys(obj) {
    if (!obj || typeof obj !== "object") return 0;
    _StorageSettings._canonicalizeFlowModelValues(obj);
    let n = 0;
    for (const [oldKey, newKey] of Object.entries(
      _StorageSettings._RENAMED_KEYS,
    )) {
      if (!(oldKey in obj)) continue;
      if (!(newKey in obj)) {
        obj[newKey] = obj[oldKey];
        n++;
      }
      delete obj[oldKey];
    }
    if (n)
      console.log(
        `[StorageSettings] Di tr\xFA ${n} kho\xE1 \u0111\xE3 \u0111\u1ED5i t\xEAn`,
      );
    return n;
  }
  static _canonicalizeFlowModelValues(
    obj,
    keys = ["defaultImageModel", "telegramFlowModel"],
  ) {
    if (!obj || typeof obj !== "object") return 0;
    let changed = 0;
    for (const key of keys) {
      const value = obj[key];
      if (typeof value !== "string" || !value) continue;
      const canonical = window.ModelRegistry?.getCanonicalValue?.(
        "flow",
        value,
      );
      if (canonical && canonical !== value) {
        obj[key] = canonical;
        changed++;
      }
    }
    return changed;
  }
  async _correctSavedFlowModelData() {
    const scope = this._settingsAuthScope();
    const stored = await chrome.storage.local.get([
      "af_settings",
      "af_settings_owner",
      "toby_gentab_state",
    ]);
    if (scope !== this._settingsAuthScope()) return;
    this._cachedOwner = stored.af_settings_owner || null;
    const patch = {};
    const local = this._validateLocalOwner(stored.af_settings || {});
    if (_StorageSettings._canonicalizeFlowModelValues(local))
      patch.af_settings = local;
    if (
      _StorageSettings._canonicalizeFlowModelValues(stored.toby_gentab_state, [
        "imageModel",
      ])
    ) {
      patch.toby_gentab_state = stored.toby_gentab_state;
    }
    _StorageSettings._canonicalizeFlowModelValues(this.defaults);
    const changed = _StorageSettings._canonicalizeFlowModelValues(
      this.settings,
    );
    if (Object.keys(patch).length) await chrome.storage.local.set(patch);
    if (changed || patch.af_settings)
      window.eventBus?.emit?.("storageSettings:loaded", {
        settings: this.settings,
      });
  }
  static _pruneDeprecatedAiTools(obj) {
    if (!obj || typeof obj !== "object") return { cleaned: obj, removed: 0 };
    const cleaned = {};
    let removed = 0;
    for (const [k, v] of Object.entries(obj)) {
      if (_StorageSettings.DEPRECATED_AI_TOOLS_KEYS.has(k)) {
        removed++;
        continue;
      }
      cleaned[k] = v;
    }
    return { cleaned, removed };
  }
  _hasUserOverride(localSettings) {
    if (!localSettings || typeof localSettings !== "object") return false;
    if (this._cachedTouchedKeys && this._cachedTouchedKeys.size > 0)
      return true;
    for (const key of Object.keys(localSettings)) {
      if (_StorageSettings.DEPRECATED_AI_TOOLS_KEYS.has(key)) continue;
      const localVal = localSettings[key];
      const defaultVal = this.defaults[key];
      if (typeof localVal === "object" && localVal !== null) {
        if (JSON.stringify(localVal) !== JSON.stringify(defaultVal))
          return true;
      } else if (localVal !== defaultVal) {
        return true;
      }
    }
    return false;
  }
  _extractOverrides(local) {
    if (!local || typeof local !== "object") return {};
    const out = {};
    const touched = this._cachedTouchedKeys;
    for (const key of Object.keys(local)) {
      const lv = local[key];
      const dv = this.defaults[key];
      const isTouched = !!(touched && touched.has(key));
      const differs =
        typeof lv === "object" && lv !== null
          ? JSON.stringify(lv) !== JSON.stringify(dv)
          : lv !== dv;
      if (isTouched || differs) out[key] = lv;
    }
    return out;
  }
  async markUserTouched(key) {
    if (!key || typeof key !== "string") return;
    if (!this._cachedTouchedKeys) this._cachedTouchedKeys = new Set();
    this._cachedTouchedKeys.add(key);
    return new Promise((resolve) => {
      chrome.storage.local.set(
        { af_settings_touched: Array.from(this._cachedTouchedKeys) },
        resolve,
      );
    });
  }
  async _refreshTouchedCache() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["af_settings_touched"], (res) => {
        const arr = Array.isArray(res.af_settings_touched)
          ? res.af_settings_touched
          : [];
        this._cachedTouchedKeys = new Set(arr);
        resolve();
      });
    });
  }
  async _mergeCurrentServerSettings(
    serverSettings,
    initialLocal = {},
    pendingOverrides = {},
  ) {
    const stored = await new Promise((resolve) =>
      chrome.storage.local.get(
        ["af_settings", "af_settings_touched", "af_settings_owner"],
        resolve,
      ),
    );
    this._cachedOwner = stored.af_settings_owner || null;
    this._cachedTouchedKeys = new Set(stored.af_settings_touched || []);
    const current = this._validateLocalOwner(stored.af_settings || {});
    _StorageSettings._migrateRenamedKeys(current);
    const overrides = this._extractOverrides(current);
    for (const [key, value] of Object.entries(current)) {
      if (
        Object.prototype.hasOwnProperty.call(initialLocal, key) &&
        JSON.stringify(value) !== JSON.stringify(initialLocal[key])
      )
        overrides[key] = value;
    }
    return _StorageSettings._pruneDeprecatedAiTools({
      ...this.defaults,
      ...serverSettings,
      ...pendingOverrides,
      ...overrides,
    }).cleaned;
  }
  _listenForChanges() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      if (changes.af_settings_touched) {
        this._cachedTouchedKeys = new Set(
          changes.af_settings_touched.newValue || [],
        );
      }
      if (!changes.af_settings) return;
      if (changes.af_settings.newValue == null) {
        this.settings = { ...this.defaults };
        return;
      }
      const oldSettings = changes.af_settings.oldValue || {};
      const newSettings = changes.af_settings.newValue || {};
      if (!this._fetchingFromServer) {
        const changedKeys = [];
        for (const key of Object.keys(newSettings)) {
          if (
            JSON.stringify(newSettings[key]) !==
            JSON.stringify(oldSettings[key])
          ) {
            changedKeys.push(key);
          }
        }
        if (changedKeys.length > 0) {
          if (!this._cachedTouchedKeys) this._cachedTouchedKeys = new Set();
          for (const k of changedKeys) this._cachedTouchedKeys.add(k);
          chrome.storage.local.set({
            af_settings_touched: Array.from(this._cachedTouchedKeys),
          });
        }
      }
      this.settings = { ...this.defaults, ...newSettings };
      this.applyTheme(this.settings.theme);
      this.syncExecutorSettings(this.settings);
      window.eventBus?.emit?.("storageSettings:loaded", {
        settings: this.settings,
      });
      this._debounceSyncToServer();
    });
  }
  _listenForAuthEvents() {
    if (!window.eventBus) return;
    window.eventBus.on("auth:logout", () => {
      if (this._syncTimer) {
        clearTimeout(this._syncTimer);
        this._syncTimer = null;
      }
      this.settings = { ...this.defaults };
      this._cachedTouchedKeys = new Set();
      chrome.storage.local.remove(["af_settings_touched"]);
      console.log(
        "[StorageSettings] auth:logout \u2014 cleared sync timer + reset settings to defaults",
      );
    });
    const onAuthIn = async (eventName) => {
      try {
        this._fetchingFromServer = true;
        await this._refreshOwnerCache();
        const localSettings = await new Promise((resolve) => {
          chrome.storage.local.get(["af_settings"], (res) =>
            resolve(res.af_settings || {}),
          );
        });
        _StorageSettings._migrateRenamedKeys(localSettings);
        const validLocal = this._validateLocalOwner(localSettings);
        const pending = await this._consumePendingResync(
          window.authManager?.user?.id,
        );
        if (pending) {
          console.log(
            `[StorageSettings] Recovered pending settings from previous session (${Object.keys(pending).length} keys)`,
          );
          Object.assign(validLocal, pending);
        }
        const hasRealLocal = this._hasUserOverride(validLocal);
        const serverData = await this._fetchServerSettings();
        if (serverData?.settings_json) {
          this.settings = await this._mergeCurrentServerSettings(
            serverData.settings_json,
            validLocal,
            pending || {},
          );
          await this._saveLocalAndAwaitChange(this.settings);
          if (hasRealLocal) await this._pushToServer(this.settings);
          this.applyTheme(this.settings.theme);
          this.syncExecutorSettings(this.settings);
          console.log(
            `[StorageSettings] Merged settings after ${eventName} (${hasRealLocal ? "local wins" : "server wins"})`,
          );
          this._appliedSettingsAuthScope = this._settingsAuthScope();
          window.eventBus?.emit?.("storageSettings:loaded", {
            settings: this.settings,
          });
        } else {
          this.settings = { ...this.defaults, ...validLocal };
          await this._saveLocalAndAwaitChange(this.settings);
          await this._pushToServer(this.settings);
          console.log(
            `[StorageSettings] Pushed local settings to server after ${eventName} (new user or no server row)`,
          );
          this._appliedSettingsAuthScope = this._settingsAuthScope();
          window.eventBus?.emit?.("storageSettings:loaded", {
            settings: this.settings,
          });
        }
        try {
          const userLocale = window.authManager?.user?.locale;
          if (
            userLocale &&
            window.I18n?.setLocale &&
            window.I18n._currentLocale !== userLocale
          ) {
            const explicit = await new Promise((r) =>
              chrome.storage.local.get(["af_locale_explicit"], (res) =>
                r(res.af_locale_explicit),
              ),
            );
            if (!explicit) {
              console.log(
                `[StorageSettings] Applying account locale after ${eventName}: ${userLocale}`,
              );
              window.I18n.setLocale(userLocale, true, false);
            }
          }
        } catch (_) {}
      } catch (err) {
        console.warn(
          `[StorageSettings] Post-${eventName} sync failed:`,
          err.message,
        );
      } finally {
        this._fetchingFromServer = false;
      }
    };
    window.eventBus.on("auth:login", async () => onAuthIn("login"));
    window.eventBus.on("auth:restored", async () => onAuthIn("restored"));
  }
  _debounceSyncToServer() {
    if (!window.authManager?.isLoggedIn()) return;
    if (this._fetchingFromServer) return;
    if (this._syncTimer) clearTimeout(this._syncTimer);
    this._syncTimer = setTimeout(() => {
      this._pushToServer(this.settings);
    }, 2e3);
  }
  async _fetchServerSettings() {
    if (!window.authManager?.isLoggedIn()) return null;
    const response = await window.authManager._apiCall("GET", "settings");
    this._lastServerFetch = Date.now();
    return response?.data || response;
  }
  async _pushToServer(settings) {
    if (!window.authManager?.isLoggedIn() || this._syncing) return;
    this._syncing = true;
    try {
      await window.authManager._apiCall("PUT", "settings", {
        settings_json: settings,
      });
      console.log("[StorageSettings] Synced to server");
    } catch (err) {
      const detail =
        err.errors || err.data?.errors || err.response?.data?.errors || null;
      console.warn(
        "[StorageSettings] Push to server failed:",
        err.message,
        detail ? { errors: detail } : "(no validation detail)",
      );
    } finally {
      this._syncing = false;
    }
  }
  async _saveLocal(settings) {
    const ownerId = window.authManager?.user?.id ?? null;
    return new Promise((resolve) => {
      chrome.storage.local.set(
        {
          af_settings: settings,
          af_settings_owner: { user_id: ownerId, saved_at: Date.now() },
        },
        resolve,
      );
    });
  }
  async _saveLocalAndAwaitChange(settings) {
    await this._saveLocal(settings);
    return;
  }
  _validateLocalOwner(localSettings) {
    if (!localSettings || Object.keys(localSettings).length === 0) return {};
    try {
      const owner = this._cachedOwner;
      const currentUserId = window.authManager?.user?.id ?? null;
      if (!owner) return localSettings;
      if (owner.user_id === null) return localSettings;
      if (String(owner.user_id) === String(currentUserId)) return localSettings;
      if (currentUserId === null) {
        console.debug(
          `[StorageSettings] Deferring owner=${owner.user_id} settings until auth restore`,
        );
        return {};
      }
      console.warn(
        `[StorageSettings] Discarding local settings from stale owner (was=${owner.user_id}, current=${currentUserId})`,
      );
      return {};
    } catch (_) {
      return localSettings;
    }
  }
  async _refreshOwnerCache() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["af_settings_owner"], (res) => {
        this._cachedOwner = res.af_settings_owner || null;
        resolve();
      });
    });
  }
  async _consumePendingResync(currentUserId) {
    if (!currentUserId) return null;
    return new Promise((resolve) => {
      chrome.storage.local.get(["af_settings_pending_resync"], (res) => {
        const pending = res.af_settings_pending_resync;
        if (!pending || String(pending.user_id) !== String(currentUserId)) {
          if (pending) {
            chrome.storage.local.remove(["af_settings_pending_resync"]);
          }
          resolve(null);
          return;
        }
        const ageMs = Date.now() - (pending.saved_at || 0);
        chrome.storage.local.remove(["af_settings_pending_resync"], () => {
          if (ageMs > 864e5) {
            console.warn(
              "[StorageSettings] Pending resync snapshot expired (>24h), discarded",
            );
            resolve(null);
          } else {
            resolve(pending.settings || null);
          }
        });
      });
    });
  }
  syncExecutorSettings(settings) {
    if (window.workflowExecutor) {
      const wfConfig = window.ExecutionConfig?.safeGetWorkflowConfig() || {};
      const timingConfig = window.ExecutionConfig?.safeGetTimingConfig() || {};
      window.workflowExecutor.settings = {
        delayBetweenNodes: (wfConfig.delay_nodes_sec ?? 3) * 1e3,
        retryOnFail: (wfConfig.max_retries ?? 0) > 0,
        maxRetries: wfConfig.max_retries ?? 2,
        retryDelay: (timingConfig.delay_between_prompts_sec ?? 5) * 1e3,
        tileTimeout: (wfConfig.timeout_sec ?? 180) * 1e3,
        timeout: (wfConfig.timeout_sec ?? 180) * 1e3,
        stopOnError: wfConfig.on_error === "stop",
      };
    }
  }
  applyTheme(theme) {
    const root = document.getElementById("flow-auto-sidebar-root");
    if (!root) return;
    root.classList.remove("theme-light", "theme-dark");
    if (theme === "system") {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      root.classList.add(prefersDark ? "theme-dark" : "theme-light");
    } else if (theme === "light") {
      root.classList.add("theme-light");
    } else {
      root.classList.add("theme-dark");
    }
  }
};
__publicField(
  _StorageSettings,
  "DEPRECATED_AI_TOOLS_KEYS",
  new Set([
    "workflowPersistFlowWebVideos",
    "i2pMode",
    "i2pDefaultProvider",
    "i2pMaxImagePx",
    "i2pTimeoutMs",
    "i2pDeleteAfter",
    "i2pPromptTemplate",
    "paDefaultProvider",
    "paDeleteAfter",
    "paDefaultMediaType",
    "paDefaultCount",
    "paDefaultLanguage",
    "paDefaultStyle",
    "paDefaultAspectRatio",
    "paDefaultDetailLevel",
    "paDefaultClipDuration",
    "paDefaultTotalDuration",
    "paDefaultSecondsPerImage",
    "paNumbered",
    "paSequential",
    "paConsistency",
    "paAutoScript",
    "paRenderSub",
    "paMaxCount",
    "paPromptTemplate",
  ]),
);
__publicField(_StorageSettings, "_RENAMED_KEYS", {
  autoRemoveWatermarkChain: "autoRemoveWatermarkInput",
});
let StorageSettings = _StorageSettings;
if (!window.storageSettings) {
  window.storageSettings = new StorageSettings();
}
window.StorageSettings = StorageSettings;
