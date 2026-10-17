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
class ModelRegistry {
  static async getModels(providerSlug, mediaType) {
    const all = await this.fetch();
    const filtered = (all || []).filter((m) =>
      this._supportsMedia(m, providerSlug, mediaType),
    );
    if (filtered.length > 0) return filtered;
    if (window.ConfigRequiredError) {
      throw new window.ConfigRequiredError(
        `models_${providerSlug}_${mediaType}`,
        "data_missing",
      );
    }
    return [];
  }
  static getModelsSync(providerSlug, mediaType) {
    if (!this._cache?.data) {
      this.fetch().catch(() => {});
      if (window.ConfigRequiredError) {
        throw new window.ConfigRequiredError(
          `models_${providerSlug}_${mediaType}`,
          "cache_empty",
        );
      }
      return [];
    }
    const filtered = this._cache.data.filter((m) =>
      this._supportsMedia(m, providerSlug, mediaType),
    );
    if (filtered.length > 0) return filtered;
    if (window.ConfigRequiredError) {
      throw new window.ConfigRequiredError(
        `models_${providerSlug}_${mediaType}`,
        "data_missing",
      );
    }
    return [];
  }
  static getDefault(providerSlug, mediaType) {
    const models = this.getModelsSync(providerSlug, mediaType);
    const def = models.find((m) => m.is_default) || models[0];
    return def?.value || null;
  }
  static async getDefaultAsync(providerSlug, mediaType) {
    const models = await this.getModels(providerSlug, mediaType);
    const def = models.find((m) => m.is_default) || models[0];
    return def?.value || null;
  }
  static getValuesList(providerSlug, mediaType) {
    return this.getModelsSync(providerSlug, mediaType).map((m) => m.value);
  }
  static safeGetModelsSync(providerSlug, mediaType) {
    try {
      return this.getModelsSync(providerSlug, mediaType);
    } catch (err) {
      if (window.ConfigRequiredError?.is?.(err)) {
        console.info(`[ModelRegistry] safeGetModelsSync: ${err.message}`);
        return [];
      }
      throw err;
    }
  }
  static safeGetDefault(providerSlug, mediaType) {
    try {
      return this.getDefault(providerSlug, mediaType);
    } catch (err) {
      if (window.ConfigRequiredError?.is?.(err)) {
        console.info(`[ModelRegistry] safeGetDefault: ${err.message}`);
        return null;
      }
      throw err;
    }
  }
  static safeGetValuesList(providerSlug, mediaType) {
    try {
      return this.getValuesList(providerSlug, mediaType);
    } catch (err) {
      if (window.ConfigRequiredError?.is?.(err)) {
        return [];
      }
      throw err;
    }
  }
  static findModel(providerSlug, modelValue) {
    if (!this._cache?.data || !providerSlug || !modelValue) return null;
    const providerModels = this._cache.data.filter(
      (m) => m?.provider === providerSlug,
    );
    const exact = providerModels.find((m) => m.value === modelValue);
    if (exact) return exact;
    const normalizedInput = this._normalizeModelIdentity(modelValue);
    if (!normalizedInput) return null;
    const canonical = providerModels.find(
      (m) => this._normalizeModelIdentity(m.value) === normalizedInput,
    );
    if (canonical) return canonical;
    const byName = providerModels.find(
      (m) => this._normalizeModelIdentity(m.name) === normalizedInput,
    );
    if (byName) return byName;
    return (
      providerModels.find(
        (m) =>
          Array.isArray(m.config?.dom_aliases) &&
          m.config.dom_aliases.some(
            (alias) => this._normalizeModelIdentity(alias) === normalizedInput,
          ),
      ) || null
    );
  }
  static getCanonicalValue(providerSlug, modelValue) {
    return this.findModel(providerSlug, modelValue)?.value || null;
  }
  static resolveModelSelection(
    providerSlug,
    models,
    requestedValue,
    previousValues = [],
  ) {
    const entries = Array.isArray(models)
      ? models.filter((model) => model?.value)
      : [];
    if (!entries.length) return null;
    const canonical = (value) =>
      this.getCanonicalValue(providerSlug, value) || value;
    const available = new Set(entries.map((model) => model.value));
    const requested = canonical(requestedValue);
    if (available.has(requested)) return requested;
    const oldIndex = previousValues.findIndex(
      (value) => value === requestedValue || canonical(value) === requested,
    );
    const next =
      oldIndex < 0
        ? null
        : previousValues
            .slice(oldIndex + 1)
            .map(canonical)
            .find((value) => available.has(value));
    return (
      next ||
      entries.find((model) => model.is_default)?.value ||
      entries[0].value
    );
  }
  static _normalizeModelIdentity(value) {
    return typeof value === "string" ? value.trim().toLocaleLowerCase() : "";
  }
  static getDomNames(providerSlug, modelValue) {
    const model = this.findModel(providerSlug, modelValue);
    const candidates = [model?.value, modelValue, model?.name];
    if (Array.isArray(model?.config?.dom_aliases)) {
      candidates.push(...model.config.dom_aliases);
    }
    const seen = new Set();
    return candidates
      .filter((value) => {
        if (typeof value !== "string" || !value.trim()) return false;
        const key = value.trim().toLocaleLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((value) => value.trim());
  }
  static getGenerationResolutionConfig(providerSlug, modelValue) {
    const model = this.findModel(providerSlug, modelValue);
    const cfg = model?.config?.generation_resolutions;
    if (!cfg || cfg.enabled !== true || !Array.isArray(cfg.options))
      return null;
    const options = cfg.options
      .filter((o) => o && typeof o.value === "string" && o.value.trim())
      .map((o) => ({
        value: o.value.trim(),
        label:
          typeof o.label === "string" && o.label.trim()
            ? o.label.trim()
            : o.value.trim(),
        dom_value:
          typeof o.dom_value === "string" && o.dom_value.trim()
            ? o.dom_value.trim()
            : null,
        api_value:
          typeof o.api_value === "string" && o.api_value.trim()
            ? o.api_value.trim()
            : null,
        api_model_key_suffix:
          typeof o.api_model_key_suffix === "string"
            ? o.api_model_key_suffix.trim()
            : null,
      }));
    if (!options.length) return null;
    const configuredDefault =
      typeof cfg.default === "string" ? cfg.default : null;
    return {
      enabled: true,
      default: options.some((o) => o.value === configuredDefault)
        ? configuredDefault
        : options[0].value,
      options,
    };
  }
  static getGenerationResolutionValue(
    providerSlug,
    modelValue,
    savedValue = null,
  ) {
    const cfg = this.getGenerationResolutionConfig(providerSlug, modelValue);
    if (!cfg) return null;
    return cfg.options.some((o) => o.value === savedValue)
      ? savedValue
      : cfg.default;
  }
  static _supportsMedia(model, providerSlug, mediaType) {
    if (model?.provider !== providerSlug) return false;
    if (model.media_type === mediaType) return true;
    if (model.media_type === "both")
      return mediaType === "image" || mediaType === "video";
    const shared = model.config?.shared_media;
    return Array.isArray(shared) && shared.includes(mediaType);
  }
  static async fetch(force = false) {
    if (this._fetchPromise) {
      if (!force) return this._fetchPromise;
      try {
        await this._fetchPromise;
      } catch (_) {}
    }
    const epoch = this._protectedEpoch;
    const task = this._doFetch(force, epoch);
    this._fetchPromise = task;
    try {
      return await task;
    } finally {
      if (this._fetchPromise === task) this._fetchPromise = null;
    }
  }
  static async _doFetch(force = false, epoch = this._protectedEpoch) {
    try {
      const json = await RequestSigner.fetchProtected("models", { force });
      if (!Array.isArray(json.data))
        throw new window.ConfigRequiredError("models", "response_invalid");
      if (epoch !== this._protectedEpoch)
        throw new window.ConfigRequiredError("models", "CONFIG_SCOPE_CHANGED", {
          code: "CONFIG_SCOPE_CHANGED",
          accessDenied: true,
        });
      const data = json.data.map((model) => {
        if (typeof model.config !== "string") return model;
        try {
          return { ...model, config: JSON.parse(model.config) };
        } catch (_) {
          return model;
        }
      });
      this._cache = {
        data,
        scope: json.meta.access,
        fetchedAt: Date.now(),
        expiresAt: Date.now() + this._CACHE_TTL_MS,
      };
      this._lastVersion = json.meta?.version ?? null;
      window.eventBus?.emit?.("provider:models_updated", {
        source: "protected_fetch",
      });
      return data;
    } catch (error) {
      if (epoch === this._protectedEpoch) this._cache = null;
      throw error;
    }
  }
  static async refresh() {
    return this.fetch(true);
  }
  static invalidateProtected() {
    this._protectedEpoch++;
    this._cache = null;
    this._lastVersion = null;
    this._fetchPromise = null;
  }
  static async _updateFromVersion(remoteVersion) {
    if (this._lastVersion === remoteVersion) return;
    console.log(
      "[ModelRegistry] Version mismatch:",
      this._lastVersion,
      "\u2192",
      remoteVersion,
    );
    await this.refresh();
    if (window.eventBus) {
      window.eventBus.emit("provider:models_updated", {
        source: "version_poller",
      });
    }
  }
  static async fetchMandatory() {
    const data = await this.fetch();
    if (!data.length)
      throw new window.ConfigRequiredError("models", "response_invalid");
    return data;
  }
  static fetchInBackground() {
    this.fetch().catch(() => {});
  }
  static async handleSseUpdate(data) {
    console.log("[ModelRegistry] SSE provider_models_updated:", data);
    try {
      await this.refresh();
    } catch (err) {
      console.warn(
        "[ModelRegistry] SSE fetch failed, UI getModelsSync s\u1EBD throw ConfigRequiredError:",
        err.message,
      );
    }
    if (window.eventBus) {
      window.eventBus.emit("provider:models_updated", data);
    }
  }
  static async _clearCache() {
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.remove([this._CACHE_KEY], resolve);
      } else {
        try {
          localStorage.removeItem(this._CACHE_KEY);
        } catch {}
        resolve();
      }
    });
  }
  static async _getApiBaseUrl() {
    return new Promise((resolve) => {
      const webBase = window.ApiBaseConfig?.getWebBase?.();
      if (!webBase)
        console.debug(
          "[Tier3] ModelRegistry._getApiBaseUrl: ApiBaseConfig not loaded",
        );
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.get(["af_api_url"], (res) => {
          resolve(res.af_api_url || webBase);
        });
      } else {
        resolve(webBase);
      }
    });
  }
}
__publicField(ModelRegistry, "_CACHE_KEY", "toby_provider_models");
__publicField(ModelRegistry, "_CACHE_TTL_MS", 4 * 60 * 60 * 1e3);
__publicField(ModelRegistry, "_lastVersion", null);
__publicField(ModelRegistry, "_GRACE_PERIOD_MS", 24 * 60 * 60 * 1e3);
__publicField(ModelRegistry, "_cache", null);
__publicField(ModelRegistry, "_fetchPromise", null);
__publicField(ModelRegistry, "_protectedEpoch", 0);
if (typeof window !== "undefined") {
  window.ModelRegistry = ModelRegistry;
  setTimeout(() => ModelRegistry.fetchInBackground(), 100);
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = ModelRegistry;
}
