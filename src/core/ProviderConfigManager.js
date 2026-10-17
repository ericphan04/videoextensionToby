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
class ProviderConfigManager {
  static async _queueForcedRefresh(promiseField, pending, refresh) {
    if (this._forcedRefreshes.has(promiseField))
      return this._forcedRefreshes.get(promiseField);
    const protectedEpoch = this._protectedEpoch;
    const queued = (async () => {
      await pending;
      if (protectedEpoch !== this._protectedEpoch) {
        throw new window.ConfigRequiredError(
          promiseField,
          "CONFIG_SCOPE_CHANGED",
          { code: "CONFIG_SCOPE_CHANGED", accessDenied: true },
        );
      }
      if (this[promiseField] === pending) this[promiseField] = null;
      if (this._forcedRefreshes.get(promiseField) === queued)
        this._forcedRefreshes.delete(promiseField);
      return refresh();
    })();
    this._forcedRefreshes.set(promiseField, queued);
    try {
      return await queued;
    } finally {
      if (this._forcedRefreshes.get(promiseField) === queued)
        this._forcedRefreshes.delete(promiseField);
    }
  }
  static async get(provider, key) {
    const data = await this.fetch();
    const providerData = data?.[provider];
    if (!providerData) {
      if (window.ConfigRequiredError) {
        throw new window.ConfigRequiredError(
          `selector_${provider}`,
          "provider_not_found",
        );
      }
      return null;
    }
    const selectors = providerData.selectors || {};
    const config = selectors[key];
    if (!config) {
      return null;
    }
    return {
      selectors: config.selectors || [],
      text_match: config.text_match || null,
      attribute: config.attribute || null,
      icon_text: config.icon_text || null,
      button_text: config.button_text || null,
    };
  }
  static resolveDomProfile(provider, pageUrl) {
    const providerData = this._cache?.data?.[provider];
    if (!providerData) return null;
    let origin = "";
    try {
      origin = new URL(pageUrl).origin;
    } catch (_) {
      return null;
    }
    const profiles = providerData.profiles || {};
    return (
      Object.values(profiles).find(
        (profile) =>
          Array.isArray(profile?.host_patterns) &&
          profile.host_patterns.includes(origin),
      ) || null
    );
  }
  static async getForPage(provider, key, pageUrl) {
    await this.fetch();
    const profile = this.resolveDomProfile(provider, pageUrl);
    if (!profile) {
      if (window.ConfigRequiredError) {
        throw new window.ConfigRequiredError(
          `selector_profile_${provider}`,
          "profile_not_found",
        );
      }
      return null;
    }
    return profile.selectors?.[key] || null;
  }
  static async getSelectors(provider, key) {
    const config = await this.get(provider, key);
    return config?.selectors || [];
  }
  static async getProvider(provider) {
    const data = await this.fetch();
    const remote = data?.[provider];
    if (!remote) {
      if (window.ConfigRequiredError) {
        throw new window.ConfigRequiredError(
          `provider_${provider}`,
          "provider_not_found",
        );
      }
      return {
        name: provider,
        status: "unknown",
        base_url: null,
        config_version: 0,
        selectors: {},
      };
    }
    return {
      name: remote.name || provider,
      status: remote.status || "active",
      base_url: remote.base_url || null,
      config_version: remote.config_version || 1,
      selectors: remote.selectors || {},
    };
  }
  static async getBaseUrl(providerSlug) {
    if (providerSlug === "flow") return "https://flow.google.com";
    const data = await this.fetch();
    const remote = data?.[providerSlug];
    return remote?.base_url || this._BOOTSTRAP_URLS[providerSlug]?.base || "";
  }
  static getBaseUrlSync(providerSlug) {
    if (providerSlug === "flow") return "https://flow.google.com";
    if (this._cache?.data?.[providerSlug]?.base_url) {
      return this._cache.data[providerSlug].base_url;
    }
    return this._BOOTSTRAP_URLS[providerSlug]?.base || "";
  }
  static getTabQuery(slug) {
    if (slug === "flow") return "https://flow.google.com/*";
    const serverUrl =
      this._apiConfigsCache?.data?.[slug]?.configs?.urls?.tab_query;
    if (serverUrl) return serverUrl;
    return this._BOOTSTRAP_URLS[slug]?.tabQuery || "";
  }
  static getTabQueryPatterns(slug) {
    if (slug === "flow") return ["https://flow.google.com/*"];
    const serverPatterns =
      this._apiConfigsCache?.data?.[slug]?.configs?.urls?.tab_query_patterns;
    if (Array.isArray(serverPatterns) && serverPatterns.length > 0) {
      const bootstrapPatterns2 =
        this._BOOTSTRAP_URLS[slug]?.tabQueryPatterns || [];
      return [...new Set([...serverPatterns, ...bootstrapPatterns2])];
    }
    const bootstrapPatterns = this._BOOTSTRAP_URLS[slug]?.tabQueryPatterns;
    if (Array.isArray(bootstrapPatterns) && bootstrapPatterns.length > 0)
      return bootstrapPatterns;
    return [this.getTabQuery(slug)].filter(Boolean);
  }
  static getCreateUrl(slug) {
    if (slug === "flow") return "https://flow.google.com/";
    const serverUrl =
      this._apiConfigsCache?.data?.[slug]?.configs?.urls?.create_url;
    if (serverUrl) {
      if (slug === "flow" && /^https:\/\/labs\.google\/fx\//i.test(serverUrl)) {
        return this._BOOTSTRAP_URLS.flow.base;
      }
      return serverUrl;
    }
    return this._BOOTSTRAP_URLS[slug]?.base || this.getBaseUrlSync(slug);
  }
  static getProviderUrl(slug, key) {
    const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
    if (slug === "flow") {
      if (snakeKey === "base") return this.getBaseUrlSync(slug);
      if (snakeKey === "create_url") return this.getCreateUrl(slug);
      if (snakeKey === "tab_query") return this.getTabQuery(slug);
      if (snakeKey === "tab_query_patterns")
        return this.getTabQueryPatterns(slug);
    }
    const serverUrl =
      this._apiConfigsCache?.data?.[slug]?.configs?.urls?.[snakeKey];
    if (serverUrl) return serverUrl;
    return null;
  }
  static async getProviderUrlAsync(slug, key) {
    const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
    let apiConfigs = await this._fetchApiConfigs();
    let value = apiConfigs?.[slug]?.configs?.urls?.[snakeKey];
    if (!value) {
      apiConfigs = await this._fetchApiConfigs(true);
      value = apiConfigs?.[slug]?.configs?.urls?.[snakeKey];
    }
    return typeof value === "string" && value ? value : null;
  }
  static isProviderUrl(url, slug) {
    if (!url || !slug) return false;
    const patterns = this.getTabQueryPatterns(slug);
    return patterns.some((pattern) => {
      const regex = new RegExp(
        "^" +
          pattern
            .split("*")
            .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
            .join(".*") +
          "$",
        "i",
      );
      return regex.test(url);
    });
  }
  static isCdnUrl(url, slug) {
    if (!url || !slug) return false;
    const serverPatterns =
      this._apiConfigsCache?.data?.[slug]?.configs?.urls?.cdn_patterns;
    if (Array.isArray(serverPatterns) && serverPatterns.length > 0) {
      return serverPatterns.some((pattern) => url.includes(pattern));
    }
    return false;
  }
  static getProviderSlugs() {
    const serverSlugs = Object.keys(this._apiConfigsCache?.data || {});
    const bootstrapSlugs = Object.keys(this._BOOTSTRAP_URLS);
    return [...new Set([...serverSlugs, ...bootstrapSlugs])];
  }
  static async getRatios(providerSlug, mode) {
    const apiConfigs = await this._fetchApiConfigs();
    const ratios = apiConfigs?.[providerSlug]?.configs?.ratios?.[mode];
    if (ratios && ratios.length > 0) return ratios;
    if (window.ConfigRequiredError) {
      throw new window.ConfigRequiredError(
        `ratios_${providerSlug}_${mode}`,
        "data_missing",
      );
    }
    return [];
  }
  static getRatiosSync(providerSlug, mode) {
    if (!this._apiConfigsCache?.data) {
      this._fetchApiConfigs().catch(() => {});
      if (window.ConfigRequiredError) {
        throw new window.ConfigRequiredError(
          `ratios_${providerSlug}_${mode}`,
          "cache_empty",
        );
      }
      return [];
    }
    const ratios =
      this._apiConfigsCache.data[providerSlug]?.configs?.ratios?.[mode];
    if (ratios && ratios.length > 0) return ratios;
    if (window.ConfigRequiredError) {
      throw new window.ConfigRequiredError(
        `ratios_${providerSlug}_${mode}`,
        "data_missing",
      );
    }
    return [];
  }
  static getDownloadResolutionsSync(providerSlug, mode = null) {
    if (!this._apiConfigsCache?.data) {
      this._fetchApiConfigs().catch(() => {});
      if (window.ConfigRequiredError) {
        throw new window.ConfigRequiredError(
          `download_resolutions_${providerSlug}`,
          "cache_empty",
        );
      }
      return mode === null ? null : [];
    }
    const cfg =
      this._apiConfigsCache.data[providerSlug]?.configs?.download_resolutions;
    if (!cfg) {
      return mode === null ? null : [];
    }
    if (mode === null) return cfg;
    return Array.isArray(cfg[mode]) ? cfg[mode] : [];
  }
  static getDownloadFallbackChainSync(providerSlug, mode) {
    const cfg = this.getDownloadResolutionsSync(providerSlug, null);
    if (!cfg) return [];
    const key = `${mode}_fallback_chain`;
    return Array.isArray(cfg[key]) ? cfg[key] : [];
  }
  static getDownloadPixelWidthSync(providerSlug, resolution) {
    const list = this.getDownloadResolutionsSync(providerSlug, "image");
    const found = list.find((r) => r.value === resolution);
    return found?.pixel_width || null;
  }
  static getDownloadMenuLabelSync(providerSlug, mode, resolution) {
    const list = this.getDownloadResolutionsSync(providerSlug, mode);
    const found = list.find((r) => r.value === resolution);
    return found?.menu_label || null;
  }
  static getDownloadResolutionRouteSync(providerSlug, mode, resolution) {
    const cfg = this.getDownloadResolutionsSync(providerSlug, null);
    const list = Array.isArray(cfg?.[mode]) ? cfg[mode] : [];
    const normalized = String(resolution || "").toLowerCase();
    const selected = list.find(
      (entry) => String(entry?.value || "").toLowerCase() === normalized,
    );
    if (!selected) return null;
    if (selected.route === "native" || selected.route === "upscale")
      return selected.route;
    console.warn(
      "[ProviderConfigManager] download resolution route missing:",
      providerSlug,
      mode,
      resolution,
    );
    return null;
  }
  static getMaxRefImagesSync(slug, mode = "image") {
    if (!this._apiConfigsCache?.data) {
      this._fetchApiConfigs().catch(() => {});
      if (window.ConfigRequiredError) {
        throw new window.ConfigRequiredError(
          `max_ref_images_${slug}`,
          "cache_empty",
        );
      }
      return 0;
    }
    const cfg = this._apiConfigsCache.data[slug]?.configs?.max_ref_images;
    if (!cfg) {
      if (window.ConfigRequiredError) {
        throw new window.ConfigRequiredError(
          `max_ref_images_${slug}`,
          "data_missing",
        );
      }
      return 0;
    }
    if (slug === "flow" && mode === "video_ingredients") {
      return cfg.video_ingredients ?? cfg.image ?? 0;
    }
    if (slug === "grok" && mode === "video") {
      return cfg.video ?? cfg.image ?? 0;
    }
    return cfg[mode] ?? cfg.image ?? 0;
  }
  static async getMaxRefImages(slug, mode = "image") {
    await this._fetchApiConfigs();
    return this.getMaxRefImagesSync(slug, mode);
  }
  static getSupportsSync(slug) {
    if (!this._apiConfigsCache?.data) {
      this._fetchApiConfigs().catch(() => {});
      if (window.ConfigRequiredError) {
        throw new window.ConfigRequiredError(`supports_${slug}`, "cache_empty");
      }
      return {};
    }
    const cfg = this._apiConfigsCache.data[slug]?.configs?.supports;
    if (!cfg) {
      if (window.ConfigRequiredError) {
        throw new window.ConfigRequiredError(
          `supports_${slug}`,
          "data_missing",
        );
      }
      return {};
    }
    return cfg;
  }
  static async getSupports(slug) {
    await this._fetchApiConfigs();
    return this.getSupportsSync(slug);
  }
  static getSupportedDurationsSync(slug) {
    if (!this._apiConfigsCache?.data) {
      this._fetchApiConfigs().catch(() => {});
      if (window.ConfigRequiredError) {
        throw new window.ConfigRequiredError(
          `supported_durations_${slug}`,
          "cache_empty",
        );
      }
      return [];
    }
    const cfg = this._apiConfigsCache.data[slug]?.configs?.supported_durations;
    return Array.isArray(cfg) ? cfg : [];
  }
  static getSupportedResolutionsSync(slug) {
    if (!this._apiConfigsCache?.data) {
      this._fetchApiConfigs().catch(() => {});
      if (window.ConfigRequiredError) {
        throw new window.ConfigRequiredError(
          `supported_resolutions_${slug}`,
          "cache_empty",
        );
      }
      return [];
    }
    const cfg =
      this._apiConfigsCache.data[slug]?.configs?.supported_resolutions;
    return Array.isArray(cfg) ? cfg : [];
  }
  static getSupportedImageQualitiesSync(slug) {
    if (!this._apiConfigsCache?.data) {
      this._fetchApiConfigs().catch(() => {});
      if (window.ConfigRequiredError) {
        throw new window.ConfigRequiredError(
          `supported_image_qualities_${slug}`,
          "cache_empty",
        );
      }
      return [];
    }
    const cfg =
      this._apiConfigsCache.data[slug]?.configs?.supported_image_qualities;
    return Array.isArray(cfg) ? cfg : [];
  }
  static getVideoDurationsSync(slug, tier = "default") {
    if (!this._apiConfigsCache?.data) {
      this._fetchApiConfigs().catch(() => {});
      if (window.ConfigRequiredError) {
        throw new window.ConfigRequiredError(
          `video_durations_${slug}`,
          "cache_empty",
        );
      }
      return [];
    }
    const cfg = this._apiConfigsCache.data[slug]?.configs?.video_durations;
    if (!cfg || typeof cfg !== "object") return [];
    return Array.isArray(cfg[tier])
      ? cfg[tier]
      : Array.isArray(cfg.default)
        ? cfg.default
        : [];
  }
  static safeGetVideoDurationsSync(slug, tier = "default") {
    try {
      return this.getVideoDurationsSync(slug, tier);
    } catch (err) {
      if (window.ConfigRequiredError?.is?.(err)) {
        if (
          err.source === "cache_empty" ||
          /\(cache_empty\)$/.test(err.message || "")
        ) {
          console.debug(
            `[PCM] safeGetVideoDurationsSync: waiting for server cache (${slug})`,
          );
        } else {
          console.warn(`[PCM] safeGetVideoDurationsSync: ${err.message}`);
        }
        return [];
      }
      throw err;
    }
  }
  static getRatioUiMapSync(slug) {
    if (this._apiConfigsCache?.data?.[slug]?.configs?.ratio_ui_map) {
      const legacy = this._apiConfigsCache.data[slug].configs.ratio_ui_map;
      if (Object.keys(legacy).length > 0) return legacy;
    }
    const ratios = this.getRatiosSync(slug, "image");
    if (Array.isArray(ratios) && ratios.length > 0 && ratios[0]?.ui_name) {
      return ratios.reduce((acc, r) => {
        acc[r.ui_name] = r.value;
        return acc;
      }, {});
    }
    return {};
  }
  static getRatioAriaLabelsSync(slug) {
    if (this._apiConfigsCache?.data?.[slug]?.configs?.ratio_aria_labels) {
      const legacy = this._apiConfigsCache.data[slug].configs.ratio_aria_labels;
      if (Object.keys(legacy).length > 0) return legacy;
    }
    const ratios = this.getRatiosSync(slug, "image");
    if (Array.isArray(ratios) && ratios.length > 0 && ratios[0]?.ui_name) {
      return ratios.reduce((acc, r) => {
        const label = r.ui_name.charAt(0).toUpperCase() + r.ui_name.slice(1);
        acc[r.ui_name] = `${label} ${r.value}`;
        return acc;
      }, {});
    }
    return {};
  }
  static safeGetRatiosSync(providerSlug, mode) {
    try {
      const result = this.getRatiosSync(providerSlug, mode);
      if (this._DEBUG)
        console.log(
          `[PCM] safeGetRatiosSync(${providerSlug}, ${mode}) \u2713`,
          result?.length,
          "items",
        );
      return result;
    } catch (err) {
      if (window.ConfigRequiredError?.is?.(err)) {
        if (this._DEBUG)
          console.log(
            `[PCM] safeGetRatiosSync(${providerSlug}, ${mode}) \u2192 [] (caught ConfigRequiredError)`,
          );
        return [];
      }
      throw err;
    }
  }
  static safeGetErrorPatternsSync(providerSlug) {
    try {
      const result = this.getErrorPatternsSync(providerSlug);
      if (this._DEBUG)
        console.log(
          `[PCM] safeGetErrorPatternsSync(${providerSlug}) \u2713`,
          result?.length,
          "patterns",
        );
      return result;
    } catch (err) {
      if (window.ConfigRequiredError?.is?.(err)) {
        if (this._DEBUG)
          console.log(
            `[PCM] safeGetErrorPatternsSync(${providerSlug}) \u2192 [] (caught ConfigRequiredError)`,
          );
        return [];
      }
      throw err;
    }
  }
  static safeGetDownloadResolutionsSync(providerSlug) {
    try {
      const result = this.getDownloadResolutionsSync(providerSlug);
      if (this._DEBUG)
        console.log(
          `[PCM] safeGetDownloadResolutionsSync(${providerSlug}) \u2713`,
          result?.length,
          "resolutions",
        );
      return result;
    } catch (err) {
      if (window.ConfigRequiredError?.is?.(err)) {
        if (this._DEBUG)
          console.log(
            `[PCM] safeGetDownloadResolutionsSync(${providerSlug}) \u2192 [] (caught ConfigRequiredError)`,
          );
        return [];
      }
      throw err;
    }
  }
  static safeGetRatioUiMapSync(slug) {
    try {
      return this.getRatioUiMapSync(slug);
    } catch (err) {
      if (window.ConfigRequiredError?.is?.(err)) {
        return {};
      }
      throw err;
    }
  }
  static safeGetRatioAriaLabelsSync(slug) {
    try {
      return this.getRatioAriaLabelsSync(slug);
    } catch (err) {
      if (window.ConfigRequiredError?.is?.(err)) {
        return {};
      }
      throw err;
    }
  }
  static safeGetSupportsSync(slug) {
    try {
      return this.getSupportsSync(slug);
    } catch (err) {
      if (window.ConfigRequiredError?.is?.(err)) {
        console.warn(`[PCM] safeGetSupportsSync: ${err.message}`);
        return {};
      }
      throw err;
    }
  }
  static safeGetMaxRefImagesSync(slug, mode) {
    try {
      return this.getMaxRefImagesSync(slug, mode);
    } catch (err) {
      if (window.ConfigRequiredError?.is?.(err)) {
        return null;
      }
      throw err;
    }
  }
  static getQuantityRangeSync(slug) {
    const data = this._apiConfigsCache?.data?.[slug]?.configs?.quantity_range;
    if (data && typeof data.min === "number" && typeof data.max === "number") {
      return { min: data.min, max: data.max };
    }
    return null;
  }
  static safeGetQuantityRangeSync(slug) {
    try {
      return this.getQuantityRangeSync(slug);
    } catch (err) {
      if (window.ConfigRequiredError?.is?.(err)) {
        return null;
      }
      throw err;
    }
  }
  static getApiConfigValueSync(slug, key) {
    if (this._isPrivateApiConfigKey(key)) {
      const token =
        window.authManager?.getToken?.() || window.authManager?.token;
      if (!token || token !== this._privateToken) return null;
    }
    if (key === "bridge_download_url") {
      const token = window.authManager?.getToken?.();
      if (
        !token ||
        token !== this._privateToken ||
        Date.now() - this._privateAt >= this._PRIVATE_TTL_MS ||
        !this._privateGranted.includes(key)
      )
        return null;
      const value = this._privateConfigs?.[slug]?.[key];
      return typeof value === "string" && value ? value : null;
    }
    if (this._isFlowApiV2Key(key)) {
      if (
        !this._privateConfigs ||
        Date.now() - this._privateAt >= this._PRIVATE_TTL_MS
      ) {
        this._retryPrivateConfigs?.();
        return null;
      }
      if (!this._privateGranted.includes(key)) return null;
      const value = this._privateConfigs?.[slug]?.[key];
      if (value != null) return value;
      return null;
    }
    if (this._GATED_API_CONFIG_KEYS.includes(key)) {
      if (
        !this._privateConfigs ||
        Date.now() - this._privateAt >= this._PRIVATE_TTL_MS
      ) {
        this._retryPrivateConfigs?.();
        return null;
      }
      if (!this._privateGranted.includes(key)) return null;
      return this._privateConfigs?.[slug]?.[key] ?? null;
    }
    const cfg = this._apiConfigsCache?.data?.[slug]?.configs?.[key];
    return cfg == null ? null : cfg;
  }
  static getFlowApiEndpointsSync() {
    return this.getApiConfigValueSync("flow", "api_endpoints");
  }
  static getRawApiConfig(slug) {
    const pub = this._apiConfigsCache?.data?.[slug]?.configs || null;
    const priv = this._privateConfigs?.[slug] || null;
    if (!pub && !priv) return null;
    const keys = new Set([
      ...Object.keys(pub || {}),
      ...Object.keys(priv || {}),
    ]);
    return Object.fromEntries(
      [...keys]
        .filter((key) => !this._isFlowApiV2Key(key))
        .map((key) => [key, this.getApiConfigValueSync(slug, key)])
        .filter(([, value]) => value != null),
    );
  }
  static _isFlowApiV2Key(key) {
    return typeof key === "string" && key.startsWith("flow_api_v2_");
  }
  static _isPrivateApiConfigKey(key) {
    return (
      this._isFlowApiV2Key(key) || this._GATED_API_CONFIG_KEYS.includes(key)
    );
  }
  static async fetchPrivateConfigs(force = false) {
    if (this._privateInflight) {
      if (!force) return this._privateInflight;
      return this._queueForcedRefresh(
        "_privateInflight",
        this._privateInflight,
        () => this.fetchPrivateConfigs(true),
      );
    }
    const epoch = ++this._privateEpoch;
    const task = (async () => {
      try {
        const json = await RequestSigner.fetchProtected("private", { force });
        if (epoch !== this._privateEpoch)
          throw new window.ConfigRequiredError(
            "private",
            "CONFIG_SCOPE_CHANGED",
            { code: "CONFIG_SCOPE_CHANGED", accessDenied: true },
          );
        const store = Object.fromEntries(
          Object.entries(json.data || {}).map(([slug, blob]) => [
            slug,
            blob?.configs || {},
          ]),
        );
        this._privateConfigs = store;
        this._privateGranted = json.meta?.granted || [];
        this._privateAt = Date.now();
        this._privateToken =
          window.authManager?.getToken?.() || window.authManager?.token;
        window.eventBus?.emit?.("provider:private_configs_loaded", {
          granted: this._privateGranted,
        });
        return store;
      } catch (error) {
        if (epoch === this._privateEpoch) this.clearPrivateConfigs();
        throw error;
      }
    })();
    this._privateInflight = task;
    try {
      return await task;
    } finally {
      if (this._privateInflight === task) this._privateInflight = null;
    }
  }
  static _retryPrivateConfigs() {
    const now = Date.now();
    if (now - this._privateRetryAt < 3e4) return;
    this._privateRetryAt = now;
    this.fetchPrivateConfigs().catch(() => {});
  }
  static clearPrivateConfigs() {
    this._privateEpoch++;
    this._privateInflight = null;
    this._privateConfigs = null;
    this._privateGranted = [];
    this._privateAt = 0;
    this._privateToken = null;
  }
  static isPrivateConfigGranted(key) {
    return this._privateGranted.includes(key);
  }
  static getFlowApiKeySync() {
    const cfg = this.getApiConfigValueSync("flow", "flow_api_key");
    return cfg && typeof cfg.key === "string" ? cfg.key : null;
  }
  static getFlowVerifyConfigSync() {
    return this.getApiConfigValueSync("flow", "captcha_config");
  }
  static getFlowApiModelMappingSync() {
    return this.getApiConfigValueSync("flow", "api_model_mapping");
  }
  static getFlowVideoModelKeysSync() {
    return this.getApiConfigValueSync("flow", "api_video_model_keys");
  }
  static getFlowImageRatioMappingSync() {
    return this.getApiConfigValueSync("flow", "api_image_ratio_mapping");
  }
  static getFlowVideoRatioMappingSync() {
    return this.getApiConfigValueSync("flow", "api_video_ratio_mapping");
  }
  static getFlowVideoResolutionsSync() {
    return this.getApiConfigValueSync("flow", "api_video_resolutions");
  }
  static getFlowImageInputTypesSync() {
    return this.getApiConfigValueSync("flow", "api_image_input_types");
  }
  static getFlowImageUpsampleResolutionsSync() {
    return this.getApiConfigValueSync("flow", "api_image_upsample_resolutions");
  }
  static getFlowApiRateLimitsSync() {
    return this.getApiConfigValueSync("flow", "api_rate_limits");
  }
  static getFlowApiErrorCodesSync() {
    return this.getApiConfigValueSync("flow", "api_error_codes");
  }
  static getFlowChainConfigSync() {
    return this.getApiConfigValueSync("flow", "chain_config");
  }
  static getFlowApiV2ConfigSync() {
    const keys = [
      "protocol",
      "models",
      "schema",
      "state_mapping",
      "runtime",
      "error_mapping",
    ];
    const result = {};
    for (const suffix of keys) {
      const value = this.getApiConfigValueSync("flow", `flow_api_v2_${suffix}`);
      if (value == null) return null;
      result[suffix] = value;
    }
    return result;
  }
  static async fetchFlowApiV2Configs(force = false) {
    await this.fetchPrivateConfigs(force);
    return this.getFlowApiV2ConfigSync();
  }
  static async _fetchApiConfigs(forceRefresh = false) {
    if (this._apiConfigsFetchPromise) {
      if (!forceRefresh) return this._apiConfigsFetchPromise;
      return this._queueForcedRefresh(
        "_apiConfigsFetchPromise",
        this._apiConfigsFetchPromise,
        () => this._fetchApiConfigs(true),
      );
    }
    const refreshEpoch = ++this._apiConfigsRefreshEpoch;
    const request = this._doFetchApiConfigs(forceRefresh, refreshEpoch);
    this._apiConfigsFetchPromise = request;
    try {
      return await request;
    } finally {
      if (this._apiConfigsFetchPromise === request)
        this._apiConfigsFetchPromise = null;
    }
  }
  static async _doFetchApiConfigs(
    forceRefresh = false,
    refreshEpoch = this._apiConfigsRefreshEpoch,
  ) {
    try {
      const json = await RequestSigner.fetchProtected("api", {
        force: forceRefresh,
      });
      if (!json.data || typeof json.data !== "object")
        throw new window.ConfigRequiredError("api_configs", "response_invalid");
      if (refreshEpoch !== this._apiConfigsRefreshEpoch)
        throw new window.ConfigRequiredError(
          "api_configs",
          "CONFIG_SCOPE_CHANGED",
          { code: "CONFIG_SCOPE_CHANGED", accessDenied: true },
        );
      this._apiConfigsCache = {
        data: json.data,
        scope: json.meta.access,
        expiresAt: Date.now() + this._CACHE_TTL_MS,
        fetchedAt: Date.now(),
      };
      window.eventBus?.emit?.("provider:api_configs_loaded", {
        data: json.data,
      });
      return json.data;
    } catch (error) {
      if (refreshEpoch === this._apiConfigsRefreshEpoch)
        this._apiConfigsCache = null;
      throw error;
    }
  }
  static async fetch(forceRefresh = false) {
    if (this._fetchPromise) {
      if (!forceRefresh) return this._fetchPromise;
      return this._queueForcedRefresh("_fetchPromise", this._fetchPromise, () =>
        this.fetch(true),
      );
    }
    const refreshEpoch = ++this._domConfigsRefreshEpoch;
    const request = this._doFetch(forceRefresh, refreshEpoch);
    this._fetchPromise = request;
    try {
      const data = await request;
      return data;
    } finally {
      if (this._fetchPromise === request) this._fetchPromise = null;
    }
  }
  static async _doFetch(
    forceRefresh = false,
    refreshEpoch = this._domConfigsRefreshEpoch,
  ) {
    try {
      const json = await RequestSigner.fetchProtected("dom", {
        force: forceRefresh,
      });
      if (!json.data || typeof json.data !== "object")
        throw new window.ConfigRequiredError(
          "dom_selectors",
          "response_invalid",
        );
      if (refreshEpoch !== this._domConfigsRefreshEpoch)
        throw new window.ConfigRequiredError(
          "dom_selectors",
          "CONFIG_SCOPE_CHANGED",
          { code: "CONFIG_SCOPE_CHANGED", accessDenied: true },
        );
      this._cache = {
        data: json.data,
        scope: json.meta.access,
        expiresAt: Date.now() + this._CACHE_TTL_MS,
        fetchedAt: Date.now(),
      };
      return json.data;
    } catch (error) {
      if (refreshEpoch === this._domConfigsRefreshEpoch) this._cache = null;
      throw error;
    }
  }
  static async refresh() {
    return this.fetch(true);
  }
  static async _updateFromVersion(providersVersionMap) {
    if (!providersVersionMap || typeof providersVersionMap !== "object") return;
    let anyMismatch = false;
    for (const [provider, remoteVersion] of Object.entries(
      providersVersionMap,
    )) {
      const cachedVersion = this._cache?.data?.[provider]?.config_version;
      if (cachedVersion !== remoteVersion) {
        anyMismatch = true;
        console.log(
          `[ProviderConfigManager] ${provider} version mismatch: ${cachedVersion} \u2192 ${remoteVersion}`,
        );
      }
    }
    if (!anyMismatch) return;
    await Promise.all([
      this.fetch(true).catch((e) =>
        console.warn(
          "[ProviderConfigManager] dom-selectors refresh failed:",
          e.message,
        ),
      ),
      this._fetchApiConfigs(true).catch((e) =>
        console.warn(
          "[ProviderConfigManager] api-configs refresh failed:",
          e.message,
        ),
      ),
    ]);
    if (window.eventBus) {
      window.eventBus.emit("provider:updated", { source: "version_poller" });
      window.eventBus.emit("provider:api_configs_loaded", {
        source: "version_poller",
        data: this._apiConfigsCache?.data || {},
      });
    }
  }
  static async fetchMandatory(configType) {
    const data =
      configType === "api_configs"
        ? await this._fetchApiConfigs()
        : await this.fetch();
    if (!data || Object.keys(data).length === 0)
      throw new window.ConfigRequiredError(configType, "response_invalid");
    return data;
  }
  static fetchInBackground() {
    this.fetch().catch(() => {});
  }
  static async handleSseUpdate(data) {
    const { type, provider, key, profile } = data || {};
    if (!type) return;
    try {
      if (type === "protected_config_invalidated") {
        await Promise.all([this.fetch(true), this._fetchApiConfigs(true)]);
        if (this._privateConfigs) await this.fetchPrivateConfigs(true);
        window.eventBus?.emit?.("provider:api_config_updated", {
          provider,
          key,
          type,
        });
      } else if (
        [
          "dom_selector_created",
          "dom_selector_updated",
          "dom_selector_deleted",
          "provider_status_changed",
        ].includes(type)
      ) {
        await this.fetch(true);
        window.eventBus?.emit?.("provider:selector_updated", {
          provider,
          profile,
          key,
        });
      } else {
        await this._fetchApiConfigs(true);
        if (this._privateConfigs) await this.fetchPrivateConfigs(true);
        window.eventBus?.emit?.("provider:api_config_updated", {
          provider,
          key,
          type,
        });
      }
      window.eventBus?.emit?.("provider:updated", { provider, source: "sse" });
    } catch (error) {
      window.ConfigErrorHandler?.handle?.(error, "provider SSE");
    }
  }
  static invalidateProtected() {
    this._protectedEpoch++;
    this._forcedRefreshes.clear();
    this._domConfigsRefreshEpoch++;
    this._apiConfigsRefreshEpoch++;
    this._cache = this._apiConfigsCache = null;
    this._fetchPromise = this._apiConfigsFetchPromise = null;
    this.clearPrivateConfigs();
  }
  static _notifyProviderUnavailable(provider, status, name) {
    const messages = {
      disabled: `${name} \u0111\xE3 b\u1ECB t\u1EAFt t\u1EA1m th\u1EDDi.`,
      maintenance: `${name} \u0111ang b\u1EA3o tr\xEC. Vui l\xF2ng th\u1EED l\u1EA1i sau.`,
    };
    if (window.TobyNotify) {
      window.TobyNotify.warning(messages[status] || `${name} is unavailable.`);
    }
  }
  static reportFailure(provider, key, triedSelectors) {
    const throttleKey = `sel_fail_${provider}_${key}`;
    if (this._recentFailures.has(throttleKey)) return;
    this._recentFailures.set(throttleKey, Date.now());
    setTimeout(() => this._recentFailures.delete(throttleKey), 5 * 60 * 1e3);
    this._getApiBaseUrl().then(async (baseUrl) => {
      const url = `${baseUrl}/api/v1/analytics/selector-failure`;
      const bodyStr = JSON.stringify({
        provider,
        key,
        tried_selectors: triedSelectors,
        page_url: location?.hostname + location?.pathname,
        timestamp: new Date().toISOString(),
      });
      const headers = {
        "Content-Type": "application/json",
        "X-Extension-Id": chrome.runtime.id,
      };
      try {
        Object.assign(
          headers,
          await (window.RequestSigner?.headers?.(
            "POST",
            new URL(url).pathname,
            bodyStr,
          ) || {}),
        );
      } catch (_) {}
      fetch(url, { method: "POST", headers, body: bodyStr }).catch(() => {});
    });
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
  static async _clearApiConfigsCache() {
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.remove([this._API_CONFIGS_CACHE_KEY], resolve);
      } else {
        try {
          localStorage.removeItem(this._API_CONFIGS_CACHE_KEY);
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
          "[Tier3] ProviderConfigManager._getApiBaseUrl: ApiBaseConfig not loaded",
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
__publicField(ProviderConfigManager, "_CACHE_KEY", "toby_provider_configs");
__publicField(
  ProviderConfigManager,
  "_API_CONFIGS_CACHE_KEY",
  "toby_provider_api_configs",
);
__publicField(ProviderConfigManager, "_CACHE_TTL_MS", 4 * 60 * 60 * 1e3);
__publicField(ProviderConfigManager, "_GRACE_PERIOD_MS", 24 * 60 * 60 * 1e3);
__publicField(ProviderConfigManager, "_cache", null);
__publicField(ProviderConfigManager, "_fetchPromise", null);
__publicField(ProviderConfigManager, "_domConfigsRefreshEpoch", 0);
__publicField(ProviderConfigManager, "_DEBUG", true);
__publicField(ProviderConfigManager, "_apiConfigsCache", null);
__publicField(ProviderConfigManager, "_apiConfigsFetchPromise", null);
__publicField(ProviderConfigManager, "_apiConfigsRefreshEpoch", 0);
__publicField(ProviderConfigManager, "_protectedEpoch", 0);
__publicField(ProviderConfigManager, "_forcedRefreshes", new Map());
__publicField(ProviderConfigManager, "_BOOTSTRAP_URLS", {
  flow: {
    base: "https://flow.google.com",
    tabQuery: "https://flow.google.com/*",
    tabQueryPatterns: ["https://flow.google.com/*"],
  },
  chatgpt: { base: "https://chatgpt.com", tabQuery: "*://chatgpt.com/*" },
  grok: { base: "https://grok.com", tabQuery: "*://grok.com/*" },
  gemini: {
    base: "https://gemini.google.com",
    tabQuery: "*://gemini.google.com/*",
  },
});
__publicField(ProviderConfigManager, "_GATED_API_CONFIG_KEYS", [
  "bridge_download_url",
  "prompt_prefixes",
  "video_flow_bridge",
  "watermark_removal",
  "watermark_removal_video",
  "api_endpoints",
  "flow_api_key",
  "captcha_config",
  "api_model_mapping",
  "api_video_model_keys",
  "api_image_ratio_mapping",
  "api_video_ratio_mapping",
  "api_video_resolutions",
  "api_image_input_types",
  "api_image_upsample_resolutions",
  "api_rate_limits",
  "api_error_codes",
  "api_video_edit",
]);
__publicField(ProviderConfigManager, "_privateConfigs", null);
__publicField(ProviderConfigManager, "_privateGranted", []);
__publicField(ProviderConfigManager, "_privateAt", 0);
__publicField(ProviderConfigManager, "_privateToken", null);
__publicField(ProviderConfigManager, "_privateInflight", null);
__publicField(ProviderConfigManager, "_PRIVATE_TTL_MS", 60 * 60 * 1e3);
__publicField(ProviderConfigManager, "_privateEpoch", 0);
__publicField(ProviderConfigManager, "_privateRetryAt", 0);
__publicField(ProviderConfigManager, "_recentFailures", new Map());
if (typeof window !== "undefined") {
  window.ProviderConfigManager = ProviderConfigManager;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = ProviderConfigManager;
}
