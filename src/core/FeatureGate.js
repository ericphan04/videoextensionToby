class FeatureGate {
  constructor() {
    this.cacheKey = "af_entitlements";
    this.cacheTTL = 30 * 60 * 1e3;
    this._lastEntitlementsVersion = null;
    this.lastFetch = 0;
    this._refreshPending = false;
    this._refreshPromise = null;
    this._initPromise = null;
    this._initialized = false;
    this._localUsageKey = "af_local_usage";
    this._localUsage = null;
    this._pendingGenRun = false;
    this._pendingTaskRun = false;
    this._pendingWorkflowRun = false;
    this._pendingAnglesRun = false;
    this._lastSseRefresh = 0;
    this._isLoggingOut = false;
    this._serverFetched = false;
    this._cacheSkippedDueToMismatch = false;
    this._freeDefaults = {
      gen_enabled: { type: "boolean", value: true },
      gen_run_max: { type: "quota", value: -1 },
      flow_api_enabled: { type: "boolean", value: false },
      image_remove_watermark_enabled: { type: "boolean", value: false },
      video_remove_watermark_enabled: { type: "boolean", value: false },
      chatgpt_enabled: { type: "boolean", value: false },
      chatgpt_run_max: { type: "quota", value: 0 },
      grok_enabled: { type: "boolean", value: false },
      grok_run_max: { type: "quota", value: 0 },
      muse_enabled: { type: "boolean", value: false },
      muse_run_max: { type: "quota", value: 0 },
      muse_mcp_enabled: { type: "boolean", value: false },
      tasks_enabled: { type: "boolean", value: false },
      tasks_max: { type: "quota", value: 2 },
      tasks_run_max: { type: "quota", value: 1 },
      workflows_enabled: { type: "boolean", value: false },
      workflows_max: { type: "quota", value: 1 },
      workflows_run_max: { type: "quota", value: 1 },
      workflows_nodes_max: { type: "quota", value: 5 },
      workflow_share_enabled: { type: "boolean", value: false },
      workflow_import: { type: "boolean", value: false },
      workflow_export: { type: "boolean", value: false },
      angles_enabled: { type: "boolean", value: true },
      angles_run_max: { type: "quota", value: 1 },
      effects_enabled: { type: "boolean", value: true },
      effects_run_max: { type: "quota", value: 1 },
      auto_download: { type: "boolean", value: false },
      retry_on_fail: { type: "boolean", value: false },
      ref_images: { type: "boolean", value: true },
      prompt_templates_enabled: { type: "boolean", value: false },
      workflow_templates_enabled: { type: "boolean", value: false },
      history_enabled: { type: "boolean", value: true },
      snippets_max: { type: "quota", value: -1 },
      priority_support: { type: "boolean", value: false },
      pipeline_queue_enabled: { type: "boolean", value: false },
      prompt_submit_max: { type: "quota", value: 20 },
      prompts_per_batch: { type: "quota", value: 4 },
      api_rate_limit_per_minute: { type: "quota", value: 200 },
    };
    this.entitlements = { ...this._freeDefaults };
    this.plan = null;
  }
  async init() {
    if (this._initialized) return;
    if (this._initPromise) return this._initPromise;
    this._initPromise = this._doInit();
    return this._initPromise;
  }
  async _doInit() {
    try {
      const cacheLoaded = await this._loadCache();
      await this._loadLocalUsage();
      if (this._cacheSkippedDueToMismatch) {
        console.log(
          "[TobyFlow] FeatureGate: Cache skipped, force fetching from server...",
        );
        this._cacheSkippedDueToMismatch = false;
        try {
          await this.refresh();
          console.log(
            "[TobyFlow] FeatureGate: Server fetch complete, plan:",
            this.plan?.slug || "trial",
          );
        } catch (err) {
          console.warn(
            "[TobyFlow] FeatureGate: Server fetch failed, using defaults",
            err.message,
          );
        }
        this._initialized = true;
        return;
      }
      this._initialized = true;
      if (!this._isCacheValid()) {
        this.refresh().catch((err) => {
          console.warn(
            "[TobyFlow] FeatureGate: Background refresh failed",
            err.message,
          );
        });
      }
      console.log(
        "[TobyFlow] FeatureGate: \u0110\xE3 kh\u1EDFi t\u1EA1o, plan:",
        this.plan?.slug || "trial",
        ", isLoggedIn:",
        this.isLoggedIn(),
      );
    } catch (err) {
      console.warn(
        "[TobyFlow] FeatureGate: L\u1ED7i kh\u1EDFi t\u1EA1o, d\xF9ng gi\xE1 tr\u1ECB m\u1EB7c \u0111\u1ECBnh",
        err.message,
      );
      this._initialized = true;
    } finally {
      this._initPromise = null;
    }
  }
  async refresh(options = {}) {
    if (this._refreshPromise) {
      return this._refreshPromise;
    }
    if (
      !options.force &&
      window.SseClient?.isConnected?.() &&
      this._lastSseRefresh > Date.now() - this.cacheTTL
    ) {
      console.log(
        "[TobyFlow] FeatureGate: Skip API refresh, using SSE-pushed data (last SSE:",
        new Date(this._lastSseRefresh).toLocaleTimeString(),
        ")",
      );
      return Promise.resolve(this._cachedEntitlements || this.entitlements);
    }
    this._refreshPending = true;
    this._refreshPromise = this._doRefresh();
    return this._refreshPromise;
  }
  async _updateFromVersion(remoteVersion) {
    if (this._lastEntitlementsVersion === remoteVersion) return;
    console.log(
      "[TobyFlow] FeatureGate: Version mismatch",
      this._lastEntitlementsVersion,
      "\u2192",
      remoteVersion,
    );
    await this.refresh({ force: true });
  }
  getEntitlementsVersion() {
    return this._lastEntitlementsVersion;
  }
  handleSseEntitlementsChanged(data) {
    if (this._isLoggingOut || !this.isLoggedIn()) {
      console.log(
        "[TobyFlow] FeatureGate: B\u1ECF qua SSE entitlements_changed (\u0111ang logout ho\u1EB7c \u0111\xE3 logout)",
      );
      return;
    }
    if (data?.features) {
      this.entitlements = { ...this._freeDefaults, ...data.features };
      this._serverFetched = true;
    }
    if (data?.plan) {
      this.plan = data.plan;
    }
    this._lastSseRefresh = Date.now();
    this.lastFetch = Date.now();
    this._saveCache().catch((err) => {
      console.warn(
        "[TobyFlow] FeatureGate: L\u1ED7i l\u01B0u SSE data v\xE0o cache",
        err.message,
      );
    });
    console.log(
      "[TobyFlow] FeatureGate: Updated from SSE push, plan:",
      this.plan?.slug || "trial",
    );
    if (window.eventBus) {
      window.eventBus.emit("featuregate:refreshed", {
        plan: this.plan,
        entitlements: this.entitlements,
        source: "sse",
      });
    }
  }
  async _doRefresh() {
    try {
      await this._fetchEntitlements();
    } catch (err) {
      console.error(
        "[TobyFlow] FeatureGate: L\u1ED7i fetch entitlements",
        err.message,
      );
    } finally {
      this._refreshPending = false;
      this._refreshPromise = null;
    }
  }
  async refreshAsync() {
    return this.refresh();
  }
  async resetForLogout() {
    console.log("[TobyFlow] FeatureGate: Reset for logout...");
    const wasFlagExternallySet = this._isLoggingOut;
    this._isLoggingOut = true;
    try {
      window.ProviderConfigManager?.clearPrivateConfigs?.();
    } catch (_) {}
    if (this._refreshPromise) {
      console.log(
        "[TobyFlow] FeatureGate: Ch\u1EDD existing refresh ho\xE0n th\xE0nh tr\u01B0\u1EDBc logout...",
      );
      try {
        await this._refreshPromise;
      } catch (e) {}
    }
    this.entitlements = { ...this._freeDefaults };
    this.plan = null;
    this._cachedEntitlements = null;
    this.lastFetch = 0;
    this._lastSseRefresh = 0;
    this._initialized = false;
    this._initPromise = null;
    this._refreshPending = false;
    this._serverFetched = false;
    if (window.eventBus) {
      window.eventBus.emit("featuregate:refreshed", {
        plan: null,
        entitlements: this.entitlements,
      });
    }
    this._refreshPromise = (async () => {
      try {
        await this._fetchEntitlements();
        console.log(
          "[TobyFlow] FeatureGate: \u0110\xE3 fetch trial entitlements sau logout",
        );
      } catch (err) {
        console.warn(
          "[TobyFlow] FeatureGate: L\u1ED7i fetch trial entitlements, d\xF9ng defaults",
          err.message,
        );
        throw err;
      }
    })();
    try {
      await this._refreshPromise;
    } catch (e) {
    } finally {
      this._refreshPromise = null;
    }
    this._initialized = true;
    if (!wasFlagExternallySet) {
      this._isLoggingOut = false;
    }
  }
  async resetForLogin() {
    console.log("[TobyFlow] FeatureGate: Reset for login...");
    if (this._refreshPromise) {
      console.log(
        "[TobyFlow] FeatureGate: Ch\u1EDD existing refresh ho\xE0n th\xE0nh tr\u01B0\u1EDBc...",
      );
      try {
        await this._refreshPromise;
      } catch (e) {}
    }
    this._refreshPending = false;
    this._lastSseRefresh = 0;
    this.lastFetch = 0;
    this._refreshPromise = (async () => {
      try {
        await this._fetchEntitlements();
        console.log(
          "[TobyFlow] FeatureGate: \u0110\xE3 fetch user entitlements sau login, plan:",
          this.plan?.slug,
        );
      } catch (err) {
        console.warn(
          "[TobyFlow] FeatureGate: L\u1ED7i fetch user entitlements sau login",
          err.message,
        );
        throw err;
      }
    })();
    try {
      await this._refreshPromise;
    } finally {
      this._refreshPromise = null;
    }
    try {
      await window.ProviderConfigManager?.fetchPrivateConfigs?.(true);
    } catch (_) {}
    this._initialized = true;
  }
  async _fetchEntitlements() {
    const wasLoggedIn = this._isLoggingOut ? false : this.isLoggedIn();
    const authToken = this._isLoggingOut ? null : window.authManager?.token;
    console.log(
      "[TobyFlow] FeatureGate: Fetching entitlements, isLoggedIn:",
      wasLoggedIn,
      ", hasToken:",
      !!authToken,
      ", isLoggingOut:",
      this._isLoggingOut,
    );
    const TIMEOUT_MS = 15e3;
    if (wasLoggedIn) {
      const rawResponse = await Promise.race([
        window.authManager._apiCall("GET", "entitlements"),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("FETCH_TIMEOUT: entitlements logged-in")),
            TIMEOUT_MS,
          ),
        ),
      ]);
      if (!this.isLoggedIn()) {
        console.warn(
          "[TobyFlow] FeatureGate: Discard logged-in response \u2014 user logged out gi\u1EEFa fetch",
        );
        return;
      }
      const response =
        rawResponse && rawResponse.data && rawResponse.meta !== void 0
          ? rawResponse.data
          : rawResponse;
      const meta = rawResponse && rawResponse.meta ? rawResponse.meta : null;
      this.entitlements = {
        ...this._freeDefaults,
        ...(response.features || {}),
      };
      this.plan = response.plan || null;
      this.lastFetch = Date.now();
      this._serverFetched = true;
      if (meta && typeof meta.version !== "undefined") {
        this._lastEntitlementsVersion = meta.version;
      }
      await this._saveCache();
      console.log(
        "[TobyFlow] FeatureGate: \u0110\xE3 c\u1EADp nh\u1EADt entitlements t\u1EEB server (logged-in), plan:",
        this.plan?.slug,
        "version:",
        this._lastEntitlementsVersion,
      );
    } else {
      const response = await new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(
            new Error(
              "FETCH_TIMEOUT: entitlements anonymous (SW c\xF3 th\u1EC3 \u0111\xE3 terminate)",
            ),
          );
        }, TIMEOUT_MS);
        chrome.runtime.sendMessage(
          { action: "apiRequest", method: "GET", endpoint: "entitlements" },
          (resp) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (resp?.success && resp?.data) {
              resolve({ data: resp.data, meta: resp.meta || null });
            } else {
              reject(
                new Error(
                  resp?.error?.message || "Failed to load entitlements",
                ),
              );
            }
          },
        );
      });
      if (this.isLoggedIn()) {
        console.warn(
          "[TobyFlow] FeatureGate: Discard anonymous response \u2014 user \u0111\xE3 login gi\u1EEFa fetch (race on reload). Triggering logged-in refresh...",
        );
        setTimeout(() => {
          this.refresh().catch((err) =>
            console.warn(
              "[TobyFlow] FeatureGate: post-discard refresh failed",
              err.message,
            ),
          );
        }, 0);
        return;
      }
      const payload = response.data || response;
      const meta = response.meta || null;
      this.entitlements = {
        ...this._freeDefaults,
        ...(payload.features || {}),
      };
      this.plan = payload.plan || { slug: "trial", name: "Trial" };
      this.lastFetch = Date.now();
      this._serverFetched = true;
      if (meta && typeof meta.version !== "undefined") {
        this._lastEntitlementsVersion = meta.version;
      }
      await this._saveCache();
      console.log(
        "[TobyFlow] FeatureGate: \u0110\xE3 c\u1EADp nh\u1EADt entitlements t\u1EEB server (anonymous), plan:",
        this.plan?.slug,
        "version:",
        this._lastEntitlementsVersion,
      );
    }
    if (window.eventBus) {
      window.eventBus.emit("featuregate:refreshed", {
        plan: this.plan,
        entitlements: this.entitlements,
      });
    }
  }
  isInitialized() {
    return this._initialized === true;
  }
  shouldRemoveWatermark(mediaType, opt = {}) {
    if (mediaType !== "image" && mediaType !== "video") return false;
    if (window.SystemConfig?.getBool?.("remove_watermark_enabled") !== true)
      return false;
    if (!this.canUse(`${mediaType}_remove_watermark_enabled`)) return false;
    if (opt.ignoreUserSetting) return true;
    const s = window.storageSettings?.getSettings?.() || {};
    const key =
      opt.scope === "input"
        ? "autoRemoveWatermarkInput"
        : mediaType === "video"
          ? "autoRemoveWatermarkVideo"
          : "autoRemoveWatermark";
    const v = s[key];
    return v === true || v === "1" || v === 1;
  }
  canUse(featureKey) {
    const authReady = !!window.authManager?.isInitialized;
    if (authReady && !this._isCacheValid() && !this._refreshPending) {
      this._refreshPending = true;
      this.refresh().finally(() => {
        this._refreshPending = false;
      });
    }
    const feature = this._getFeature(featureKey);
    if (!feature) return false;
    if (feature.type === "boolean") {
      const val = feature.value;
      if (val === "1" || val === 1 || val === true) return true;
      if (val === "0" || val === 0 || val === false || val === null)
        return false;
      return !!val;
    }
    if (feature.type === "quota") {
      const val = feature.value;
      if (val === "unlimited" || val === -1 || val === "-1") return true;
      const limit = typeof val === "string" ? parseInt(val, 10) : val;
      const usage = this._getUsageForFeature(featureKey, feature);
      return usage < limit;
    }
    return !!feature.value;
  }
  checkQuota(featureKey) {
    const authReady = !!window.authManager?.isInitialized;
    if (
      authReady &&
      !this._isCacheValid() &&
      !this._refreshPending &&
      !this._isLoggingOut
    ) {
      this._refreshPending = true;
      this.refresh().finally(() => {
        this._refreshPending = false;
      });
    }
    const feature = this._getFeature(featureKey);
    if (!feature || feature.type !== "quota") {
      return { allowed: false, used: 0, limit: 0 };
    }
    let limit = feature.value;
    if (typeof limit === "string") {
      limit = limit === "unlimited" ? "unlimited" : parseInt(limit, 10);
    }
    const used = this._getUsageForFeature(featureKey, feature);
    if (limit === "unlimited" || limit === -1) {
      return { allowed: true, used, limit: "unlimited" };
    }
    const result = { allowed: used < limit, used, limit };
    return result;
  }
  async canUseAsync(featureKey) {
    if (!this._isCacheValid()) {
      await this.refresh();
    }
    return this.canUse(featureKey);
  }
  canUseAiAgent() {
    return this.canUse("ai_agent_enabled");
  }
  async checkQuotaAsync(featureKey) {
    if (!this._isCacheValid()) {
      await this.refresh();
    }
    return this.checkQuota(featureKey);
  }
  _getUsageForFeature(featureKey, feature) {
    if (this.isLoggedIn()) {
      return feature.usage_today || 0;
    }
    return this._getLocalUsage(featureKey);
  }
  _getLocalUsage(featureKey) {
    if (!this._localUsage) {
      this._localUsage = {};
    }
    this._resetLocalUsageIfNewDay();
    return this._localUsage[featureKey] || 0;
  }
  async trackUsage(featureKey, action, quantity = 1) {
    try {
      if (this.isLoggedIn()) {
        if (this.entitlements && this.entitlements[featureKey]) {
          const feature = this.entitlements[featureKey];
          if (feature.type === "quota") {
            feature.usage_today = (feature.usage_today || 0) + quantity;
          }
          await this._saveCache();
        }
        await window.authManager._apiCall("POST", "usage/track", {
          feature_key: featureKey,
          action,
          quantity,
        });
        console.log(
          "[TobyFlow] FeatureGate: \u0110\xE3 ghi nh\u1EADn s\u1EED d\u1EE5ng (server)",
          featureKey,
          "+" + quantity,
        );
      } else {
        await this._incrementLocalUsage(featureKey, quantity);
        console.log(
          "[TobyFlow] FeatureGate: \u0110\xE3 ghi nh\u1EADn s\u1EED d\u1EE5ng (local)",
          featureKey,
          "+" + quantity,
        );
      }
    } catch (err) {
      console.warn(
        "[TobyFlow] FeatureGate: L\u1ED7i ghi nh\u1EADn s\u1EED d\u1EE5ng",
        featureKey,
        err.message,
      );
    }
  }
  _resetLocalUsageIfNewDay() {
    const today = new Date().toISOString().slice(0, 10);
    if (
      this._localUsage &&
      this._localUsage._usage_date &&
      this._localUsage._usage_date !== today
    ) {
      const oldDate = this._localUsage._usage_date;
      this._localUsage = { _usage_date: today };
      this._saveLocalUsage();
      console.log(
        "[FeatureGate] Local usage reset: ng\xE0y c\u0169",
        oldDate,
        "\u2192 ng\xE0y m\u1EDBi",
        today,
      );
    }
    if (this._localUsage && !this._localUsage._usage_date) {
      this._localUsage._usage_date = today;
      this._saveLocalUsage();
    }
  }
  async _incrementLocalUsage(featureKey, quantity = 1) {
    if (!this._localUsage) {
      this._localUsage = {};
    }
    this._resetLocalUsageIfNewDay();
    this._localUsage[featureKey] =
      (this._localUsage[featureKey] || 0) + quantity;
    await this._saveLocalUsage();
    if (window.eventBus) {
      window.eventBus.emit("featuregate:usage_changed", {
        featureKey,
        usage: this._localUsage[featureKey],
      });
    }
  }
  async _incrementDailyStat(key, amount = 1) {
    FeatureGate._statQueue = (FeatureGate._statQueue || Promise.resolve())
      .then(async () => {
        const today = new Date().toISOString().slice(0, 10);
        const currentUserId = window.authManager?.user?.id || null;
        const result = await new Promise((resolve) => {
          chrome.storage.local.get(["af_daily_stats"], (r) => resolve(r));
        });
        const stats = result.af_daily_stats || {};
        if (stats._date !== today || stats._user_id !== currentUserId) {
          stats._date = today;
          stats._user_id = currentUserId;
          stats.flow_prompt_total = 0;
          stats.chatgpt_prompt_total = 0;
          stats.gemini_prompt_total = 0;
          stats.grok_prompt_total = 0;
          stats.flow_fail = 0;
          stats.chatgpt_fail = 0;
          stats.gemini_fail = 0;
          stats.grok_fail = 0;
          stats.task_run = 0;
          stats.workflow_run = 0;
          stats.angles_run = 0;
        }
        stats[key] = (stats[key] || 0) + amount;
        await new Promise((resolve) => {
          chrome.storage.local.set({ af_daily_stats: stats }, resolve);
        });
      })
      .catch((err) => {
        console.warn("[FeatureGate] _incrementDailyStat error:", err);
      });
  }
  getPlan() {
    return this.plan;
  }
  isFreePlan() {
    return (
      this.plan?.slug === "free" || this.plan?.slug === "trial" || !this.plan
    );
  }
  isLoggedIn() {
    return window.authManager?.isLoggedIn?.() || false;
  }
  canManageWorkflowTemplates() {
    return window.authManager?.canManageTemplates() || false;
  }
  canAccessPremiumTemplates() {
    if (this.isAdmin()) {
      return true;
    }
    if (this.canUse("premium_templates")) {
      return true;
    }
    return false;
  }
  isAdmin() {
    return window.authManager?.isAdmin?.() || false;
  }
  isPremium() {
    if (!this.isLoggedIn()) {
      return false;
    }
    const planSlug = this.plan?.slug?.toLowerCase();
    const nonPremiumPlans = ["free", "trial", null, void 0, ""];
    return !nonPremiumPlans.includes(planSlug);
  }
  getConfig() {
    const tasks = this._getFeature("tasks_max");
    const workflows = this._getFeature("workflows_max");
    const workflowNodes = this._getFeature("workflows_nodes_max");
    const tasksRun = this._getFeature("tasks_run_max");
    const workflowsRun = this._getFeature("workflows_run_max");
    const anglesRun = this._getFeature("angles_run_max");
    return {
      trial_enabled: !this.isLoggedIn(),
      tasks_max_create: tasks?.value ?? 10,
      tasks_max_run: tasksRun?.value ?? 1,
      workflows_max_create: workflows?.value ?? 1,
      workflows_max_node: workflowNodes?.value ?? 5,
      workflows_max_run: workflowsRun?.value ?? 1,
      angles_max_run: anglesRun?.value ?? 1,
    };
  }
  getTrialStatus() {
    const config = this.getConfig();
    const usage = this._getUsage();
    return {
      isLoggedIn: this.isLoggedIn(),
      trialEnabled: config.trial_enabled,
      tasks: {
        created: usage.tasks_created,
        maxCreate: config.tasks_max_create,
        run: usage.tasks_run,
        maxRun: config.tasks_max_run,
      },
      workflows: {
        created: usage.workflows_created,
        maxCreate: config.workflows_max_create,
        run: usage.workflows_run,
        maxRun: config.workflows_max_run,
        maxNode: config.workflows_max_node,
      },
      angles: { run: usage.angles_run, maxRun: config.angles_max_run },
    };
  }
  _getUsage() {
    if (this.isLoggedIn()) {
      return {
        tasks_created: this.entitlements?.tasks_max?.usage_today || 0,
        tasks_run: this.entitlements?.tasks_run_max?.usage_today || 0,
        workflows_created: this.entitlements?.workflows_max?.usage_today || 0,
        workflows_run: this.entitlements?.workflows_run_max?.usage_today || 0,
        angles_run: this.entitlements?.angles_run_max?.usage_today || 0,
      };
    }
    return {
      tasks_created: this._getLocalUsage("tasks_max"),
      tasks_run: this._getLocalUsage("tasks_run_max"),
      workflows_created: this._getLocalUsage("workflows_max"),
      workflows_run: this._getLocalUsage("workflows_run_max"),
      angles_run: this._getLocalUsage("angles_run_max"),
    };
  }
  async canCreateTaskAsync() {
    if (!this.isLoggedIn()) {
      console.log("[FeatureGate] canCreateTaskAsync: false (requires login)");
      return false;
    }
    await this.refresh();
    const feature = this._getFeature("tasks_max");
    if (feature?.value === "-1" || feature?.value === -1) {
      return true;
    }
    let currentCount = 0;
    try {
      if (window.storageManager?.mode === "api") {
        const result2 = await window.storageManager.getTasks();
        currentCount = result2?.meta?.total || result2?.length || 0;
      }
    } catch (e) {
      console.warn("[FeatureGate] Error counting tasks from server:", e);
      return true;
    }
    const config = this.getConfig();
    const result = currentCount < config.tasks_max_create;
    console.log(
      "[FeatureGate] canCreateTaskAsync:",
      currentCount,
      "<",
      config.tasks_max_create,
      "=",
      result,
    );
    return result;
  }
  async canRunTaskAsync() {
    await this.refresh();
    const feature = this._getFeature("tasks_run_max");
    if (feature?.value === "-1" || feature?.value === -1) {
      return true;
    }
    const usage = this._getUsage();
    const config = this.getConfig();
    const result = usage.tasks_run < config.tasks_max_run;
    console.log(
      "[FeatureGate] canRunTaskAsync:",
      usage.tasks_run,
      "<",
      config.tasks_max_run,
      "=",
      result,
    );
    return result;
  }
  async recordTaskCreated() {
    await this.trackUsage("tasks_max", "create");
  }
  async recordTaskRun() {
    await this._incrementDailyStat("task_run");
    if (this.isLoggedIn()) {
      await this.refresh();
    } else {
      await this.trackUsage("tasks_run_max", "run");
    }
  }
  async canCreateWorkflowAsync() {
    if (!this.isLoggedIn()) {
      console.log(
        "[FeatureGate] canCreateWorkflowAsync: false (requires login)",
      );
      return false;
    }
    await this.refresh();
    const feature = this._getFeature("workflows_max");
    if (feature?.value === "-1" || feature?.value === -1) {
      return true;
    }
    let currentCount = 0;
    try {
      if (window.storageManager?.mode === "api") {
        const result2 = await window.storageManager.getWorkflows();
        currentCount = result2?.meta?.total || result2?.length || 0;
      }
    } catch (e) {
      console.warn("[FeatureGate] Error counting workflows from server:", e);
      return true;
    }
    const config = this.getConfig();
    const result = currentCount < config.workflows_max_create;
    console.log(
      "[FeatureGate] canCreateWorkflowAsync:",
      currentCount,
      "<",
      config.workflows_max_create,
      "=",
      result,
    );
    return result;
  }
  async canRunWorkflowAsync() {
    await this.refresh();
    const feature = this._getFeature("workflows_run_max");
    if (feature?.value === "-1" || feature?.value === -1) {
      return true;
    }
    const usage = this._getUsage();
    const config = this.getConfig();
    const result = usage.workflows_run < config.workflows_max_run;
    console.log(
      "[FeatureGate] canRunWorkflowAsync:",
      usage.workflows_run,
      "<",
      config.workflows_max_run,
      "=",
      result,
    );
    return result;
  }
  canAddNode(currentCount) {
    const feature = this._getFeature("workflows_nodes_max");
    if (feature?.value === "-1" || feature?.value === -1) {
      return true;
    }
    const config = this.getConfig();
    return currentCount < config.workflows_max_node;
  }
  async recordWorkflowCreated() {
    await this.trackUsage("workflows_max", "create");
  }
  async recordWorkflowRun() {
    await this._incrementDailyStat("workflow_run");
    if (this.isLoggedIn()) {
      await this.refresh();
    } else {
      await this.trackUsage("workflows_run_max", "run");
    }
  }
  async canRunAnglesAsync() {
    await this.refresh();
    const feature = this._getFeature("angles_run_max");
    if (feature?.value === "-1" || feature?.value === -1) {
      return true;
    }
    const usage = this._getUsage();
    const config = this.getConfig();
    const result = usage.angles_run < config.angles_max_run;
    console.log(
      "[FeatureGate] canRunAnglesAsync:",
      usage.angles_run,
      "<",
      config.angles_max_run,
      "=",
      result,
    );
    return result;
  }
  async recordAnglesRun() {
    await this._incrementDailyStat("angles_run");
    if (this.isLoggedIn()) {
      await this.refresh();
    } else {
      await this.trackUsage("angles_run_max", "run");
    }
  }
  async canRunGenAsync() {
    await this.refresh();
    const feature = this._getFeature("gen_run_max");
    if (feature?.value === "-1" || feature?.value === -1) {
      return true;
    }
    const usage = this._getUsageForFeature("gen_run_max", feature);
    const limit =
      typeof feature.value === "string"
        ? parseInt(feature.value, 10)
        : feature.value;
    const result = usage < limit;
    console.log(
      "[FeatureGate] canRunGenAsync:",
      usage,
      "<",
      limit,
      "=",
      result,
    );
    return result;
  }
  async recordGenRun() {
    await this._incrementDailyStat("gen_run");
    if (this.isLoggedIn()) {
      await this.refresh();
    } else {
      await this.trackUsage("gen_run_max", "run");
    }
  }
  async recordChatGPTRun(promptCount = 1) {
    await this._incrementDailyStat("chatgpt_run", promptCount);
    if (this.isLoggedIn()) {
      await this.refresh();
    } else {
      await this.trackUsage("chatgpt_run_max", "run", promptCount);
    }
  }
  async recordGrokRun(promptCount = 1) {
    await this._incrementDailyStat("grok_run", promptCount);
    if (this.isLoggedIn()) {
      await this.refresh();
    } else {
      await this.trackUsage("grok_run_max", "run", promptCount);
    }
  }
  async recordMuseRun(promptCount = 1) {
    await this._incrementDailyStat("muse_run", promptCount);
    if (this.isLoggedIn()) await this.refresh();
    else await this.trackUsage("muse_run_max", "run", promptCount);
  }
  async recordPromptSubmit(promptCount = 1, provider = "flow") {
    console.log(
      "[FeatureGate] recordPromptSubmit:",
      promptCount,
      "prompts from",
      provider,
    );
    await this._incrementDailyStat("prompt_submit", promptCount);
    if (this.isLoggedIn()) {
      await this.refresh();
    } else {
      await this.trackUsage("prompt_submit_max", "submit", promptCount);
    }
  }
  getRateLimit() {
    const feature = this._getFeature("api_rate_limit_per_minute");
    if (!feature || !feature.value) {
      return 200;
    }
    const limit =
      typeof feature.value === "string"
        ? parseInt(feature.value, 10)
        : feature.value;
    return isNaN(limit) ? 200 : limit;
  }
  async getRateLimitAsync() {
    await this.refresh();
    return this.getRateLimit();
  }
  getPromptBatchLimit() {
    const feature = this._getFeature("prompts_per_batch");
    if (!feature || !feature.value) {
      return 4;
    }
    const limit =
      typeof feature.value === "string"
        ? parseInt(feature.value, 10)
        : feature.value;
    if (isNaN(limit)) return 4;
    return limit;
  }
  checkPromptBatchLimit(promptCount) {
    const limit = this.getPromptBatchLimit();
    if (limit === -1) {
      return { allowed: true, limit: -1 };
    }
    return { allowed: promptCount <= limit, limit };
  }
  async canCreateSnippetAsync() {
    await this.refresh();
    const feature = this._getFeature("snippets_max");
    if (feature?.value === "-1" || feature?.value === -1) {
      return true;
    }
    let currentCount = 0;
    if (this.isLoggedIn()) {
      currentCount = feature?.usage_today || feature?.used_today || 0;
    } else {
      try {
        const stored = await this._storageGet("af_user_prompts");
        currentCount = Array.isArray(stored) ? stored.length : 0;
      } catch (e) {
        console.warn("[FeatureGate] Error counting snippets:", e);
      }
    }
    const limit =
      typeof feature?.value === "string"
        ? parseInt(feature.value, 10)
        : feature?.value || 0;
    const result = currentCount < limit;
    console.log(
      "[FeatureGate] canCreateSnippetAsync:",
      currentCount,
      "<",
      limit,
      "=",
      result,
    );
    return result;
  }
  canUseRefImages() {
    return this.canUse("ref_images");
  }
  canUseProviderRefImages(provider) {
    if (!provider || !this.canUseRefImages()) return false;
    return this.canUse(`${String(provider).toLowerCase()}_ref_images`);
  }
  canUseAutoDownload() {
    return this.canUse("auto_download");
  }
  canUseRetryOnFail() {
    return this.canUse("retry_on_fail");
  }
  canUsePromptTemplates() {
    return this.canUse("prompt_templates_enabled");
  }
  canUseHistory() {
    return this.canUse("history_enabled");
  }
  canFreePlanUse(featureKey) {
    if (!featureKey) return null;
    const plans = window._cachedPlans;
    if (!Array.isArray(plans) || plans.length === 0) return null;
    const free = plans.find((p) => p?.slug === "free");
    if (!free || !Array.isArray(free.features)) return null;
    const f = free.features.find((x) => x?.key === featureKey);
    if (!f) return false;
    const v = f.value;
    if (f.type === "boolean") {
      return v === true || v === "1" || v === 1;
    }
    if (f.type === "quota") {
      if (v === "unlimited" || v === -1 || v === "-1") return true;
      const limit = typeof v === "string" ? parseInt(v, 10) : v;
      return Number.isFinite(limit) && limit > 0;
    }
    return (
      v !== null &&
      v !== void 0 &&
      v !== "0" &&
      v !== 0 &&
      v !== false &&
      v !== ""
    );
  }
  getCrownLabel(featureKey) {
    const isLoggedIn = this.isLoggedIn();
    if (!isLoggedIn) {
      const freeHas = featureKey ? this.canFreePlanUse(featureKey) : null;
      if (freeHas === true) {
        return window.I18n?.t("common.requireLogin") || "Login required";
      }
    }
    return window.I18n?.t("common.premium") || "Premium";
  }
  renderCrownHTML(featureKey) {
    const label = this.getCrownLabel(featureKey);
    return (
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z"></path></svg> ' +
      label
    );
  }
  renderCrownSpan(featureKey) {
    const label = this.getCrownLabel(featureKey);
    const titleAttr = String(label)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `<span class="premium-crown" title="${titleAttr}">${this.renderCrownHTML(featureKey)}</span>`;
  }
  canSubmitPrompts(count = 1) {
    if (!this._isCacheValid() && !this._refreshPending) {
      this._refreshPending = true;
      this.refresh().finally(() => {
        this._refreshPending = false;
      });
    }
    const feature = this._getFeature("prompt_submit_max");
    if (!feature) return true;
    if (
      feature.value === "unlimited" ||
      feature.value === -1 ||
      feature.value === "-1"
    ) {
      return true;
    }
    const limit =
      typeof feature.value === "string"
        ? parseInt(feature.value, 10)
        : feature.value;
    const usage = this._getUsageForFeature("prompt_submit_max", feature);
    const result = usage + count <= limit;
    console.log(
      "[FeatureGate] canSubmitPrompts:",
      count,
      "prompts, usage:",
      usage,
      "/",
      limit,
      "=",
      result,
    );
    return result;
  }
  async canSubmitPromptsAsync(count = 1) {
    if (!this._isCacheValid()) {
      await this.refresh();
    }
    return this.canSubmitPrompts(count);
  }
  getGlobalRemaining() {
    const feature = this._getFeature("prompt_submit_max");
    if (!feature) return "unlimited";
    if (
      feature.value === "unlimited" ||
      feature.value === -1 ||
      feature.value === "-1"
    ) {
      return "unlimited";
    }
    const limit =
      typeof feature.value === "string"
        ? parseInt(feature.value, 10)
        : feature.value;
    const usage = this._getUsageForFeature("prompt_submit_max", feature);
    return Math.max(0, limit - usage);
  }
  getGlobalLimit() {
    const feature = this._getFeature("prompt_submit_max");
    if (!feature) return "unlimited";
    if (
      feature.value === "unlimited" ||
      feature.value === -1 ||
      feature.value === "-1"
    ) {
      return "unlimited";
    }
    return typeof feature.value === "string"
      ? parseInt(feature.value, 10)
      : feature.value;
  }
  getGlobalUsed() {
    const feature = this._getFeature("prompt_submit_max");
    if (!feature) return 0;
    return this._getUsageForFeature("prompt_submit_max", feature);
  }
  checkGlobalQuotaWarning(module = "Generate") {
    const limit = this.getGlobalLimit();
    const remaining = this.getGlobalRemaining();
    if (limit === "unlimited" || remaining === "unlimited") {
      return {
        shouldWarn: false,
        exhausted: false,
        remaining: "unlimited",
        limit: "unlimited",
      };
    }
    const numLimit = typeof limit === "number" ? limit : 0;
    const numRemaining = typeof remaining === "number" ? remaining : 0;
    if (numRemaining <= 0) {
      if (window.eventBus) {
        window.eventBus.emit("quota:exhausted", {
          limit: numLimit,
          remaining: 0,
          module,
        });
      }
      return {
        shouldWarn: false,
        exhausted: true,
        remaining: 0,
        limit: numLimit,
      };
    }
    const warningThreshold = Math.ceil(numLimit * 0.1);
    if (numRemaining <= warningThreshold) {
      if (window.eventBus) {
        window.eventBus.emit("quota:warning", {
          limit: numLimit,
          remaining: numRemaining,
          module,
        });
      }
      return {
        shouldWarn: true,
        exhausted: false,
        remaining: numRemaining,
        limit: numLimit,
      };
    }
    return {
      shouldWarn: false,
      exhausted: false,
      remaining: numRemaining,
      limit: numLimit,
    };
  }
  setPendingGenRun() {
    if (!this.isLoggedIn()) {
      this._pendingGenRun = true;
      console.log("[FeatureGate] setPendingGenRun: flag set");
    }
  }
  async recordPendingGenRun() {
    if (this._pendingGenRun) {
      this._pendingGenRun = false;
      await this.recordGenRun();
      console.log("[FeatureGate] recordPendingGenRun: recorded");
    } else if (this.isLoggedIn()) {
      await this.refresh();
    }
  }
  setPendingTaskRun() {
    if (!this.isLoggedIn()) {
      this._pendingTaskRun = true;
      console.log("[FeatureGate] setPendingTaskRun: flag set");
    }
  }
  async recordPendingTaskRun() {
    if (this._pendingTaskRun) {
      this._pendingTaskRun = false;
      await this.recordTaskRun();
      console.log("[FeatureGate] recordPendingTaskRun: recorded");
    }
  }
  setPendingWorkflowRun() {
    if (!this.isLoggedIn()) {
      this._pendingWorkflowRun = true;
      console.log("[FeatureGate] setPendingWorkflowRun: flag set");
    }
  }
  async recordPendingWorkflowRun() {
    if (this._pendingWorkflowRun) {
      this._pendingWorkflowRun = false;
      await this.recordWorkflowRun();
      console.log("[FeatureGate] recordPendingWorkflowRun: recorded");
    }
  }
  setPendingAnglesRun() {
    if (!this.isLoggedIn()) {
      this._pendingAnglesRun = true;
      console.log("[FeatureGate] setPendingAnglesRun: flag set");
    }
  }
  async recordPendingAnglesRun() {
    if (this._pendingAnglesRun) {
      this._pendingAnglesRun = false;
      await this.recordAnglesRun();
      console.log("[FeatureGate] recordPendingAnglesRun: recorded");
    }
  }
  clearAllPendingFlags() {
    this._pendingGenRun = false;
    this._pendingTaskRun = false;
    this._pendingWorkflowRun = false;
    this._pendingAnglesRun = false;
    console.log("[FeatureGate] clearAllPendingFlags: all flags cleared");
  }
  isModuleEnabled(module) {
    const key = `${module}_enabled`;
    return this.canUse(key);
  }
  async isModuleEnabledAsync(module) {
    if (!this._initialized && this._initPromise) {
      await this._initPromise;
    }
    if (!this._isCacheValid()) {
      await this.refresh();
    }
    return this.isModuleEnabled(module);
  }
  async showModuleBlockedDialog(module) {
    if (!window.customDialog) {
      console.warn(
        "[TobyFlow] FeatureGate: customDialog ch\u01B0a s\u1EB5n s\xE0ng",
      );
      return;
    }
    const moduleNames = {
      gen: "Generate",
      prompt_templates: "Prompt Templates",
      workflow_templates: "Workflow Templates",
      tasks: "Tasks",
      workflows: "Workflows",
      workflow_share: "Chia s\u1EBB Workflow",
      workflow_export: "Xu\u1EA5t Workflow",
      workflow_import: "Nh\u1EADp Workflow",
      ai_agent_enabled: "AI Agent \u2014 Use AI",
      angles: "Angles",
      effects: "Effects",
      image_remove_watermark_enabled: "X\xF3a watermark \u1EA3nh",
      video_remove_watermark_enabled: "X\xF3a watermark video",
      auto_capcut_enabled: "Auto CapCut Builder",
    };
    const moduleName = moduleNames[module] || module;
    const isLoggedIn = this.isLoggedIn();
    if (isLoggedIn) {
      const shouldUpgrade = await window.customDialog.confirm(
        window.I18n?.t("featuregate.featureLockedPaid", {
          module: moduleName,
        }) ||
          `Your current plan does not include the ${moduleName} feature.

Please upgrade to use it.`,
        {
          title:
            window.I18n?.t("featuregate.featureLockedTitle") ||
            "Feature Locked",
          type: "warning",
          confirmText: window.I18n?.t("common.upgrade") || "Upgrade",
          cancelText: window.I18n?.t("common.later") || "Later",
        },
      );
      if (shouldUpgrade) {
        if (typeof window.openUpgradeModal === "function") {
          window.openUpgradeModal();
        } else {
          try {
            chrome.runtime.sendMessage({ action: "showUpgradeModal" });
          } catch (e) {}
        }
      }
    } else {
      const confirmed = await window.customDialog.confirm(
        window.I18n?.t("featuregate.loginRequiredFeature", {
          module: moduleName,
        }) ||
          `The ${moduleName} feature requires signing in.

Sign in to use all features.`,
        {
          title:
            window.I18n?.t("featuregate.loginRequiredTitle") ||
            "Login Required",
          type: "warning",
          confirmText: window.I18n?.t("auth.login") || "Login",
          cancelText: window.I18n?.t("common.later") || "Later",
        },
      );
      if (confirmed) {
        const loginOverlay = document.getElementById("loginOverlay");
        if (loginOverlay) {
          loginOverlay.classList.remove("hidden");
        } else {
          chrome.runtime.sendMessage({ action: "openSettings" });
        }
      }
    }
  }
  async showLoginPrompt(reason) {
    if (!window.customDialog) {
      console.warn(
        "[TobyFlow] FeatureGate: customDialog ch\u01B0a s\u1EB5n s\xE0ng",
      );
      return;
    }
    const confirmed = await window.customDialog.confirm(
      window.I18n?.t("featuregate.trialExhaustedPrompt", { reason }) ||
        `${reason}

Sign in to continue using without limits.`,
      {
        title:
          window.I18n?.t("featuregate.trialExhaustedTitle") ||
          "Trial Quota Exhausted",
        type: "warning",
        confirmText: window.I18n?.t("auth.login") || "Login",
        cancelText: window.I18n?.t("common.later") || "Later",
      },
    );
    if (confirmed) {
      const loginOverlay = document.getElementById("loginOverlay");
      if (loginOverlay) {
        loginOverlay.classList.remove("hidden");
      } else {
        chrome.runtime.sendMessage({ action: "openSettings" });
      }
    }
  }
  async resetLocalUsage() {
    this._localUsage = {};
    await this._saveLocalUsage();
    console.log("[FeatureGate] resetLocalUsage: local usage reset");
  }
  getUsageStatus() {
    return {
      isLoggedIn: this.isLoggedIn(),
      plan: this.plan,
      localUsage: this._localUsage || {},
      entitlements: this.entitlements || {},
      usage: this._getUsage(),
    };
  }
  _storageGet(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => {
        resolve(result[key] || null);
      });
    });
  }
  _getFeature(featureKey) {
    if (this.entitlements && this.entitlements[featureKey]) {
      return this.entitlements[featureKey];
    }
    if (this._serverFetched) {
      return null;
    }
    return this._freeDefaults[featureKey] || null;
  }
  async _loadCache() {
    return new Promise((resolve) => {
      chrome.storage.local.get([this.cacheKey, "af_auth"], (result) => {
        const cached = result[this.cacheKey];
        const auth = result.af_auth;
        const currentUserId = auth?.user?.id || null;
        if (cached) {
          const hasUserIdField = "user_id" in cached;
          const cacheUserId = cached.user_id || null;
          const cachePlanSlug = cached.plan?.slug;
          let isValidCache = false;
          if (!hasUserIdField) {
            console.log(
              "[TobyFlow] FeatureGate: Legacy cache without user_id, skip \u2192 will force fetch",
            );
            isValidCache = false;
          } else if (currentUserId) {
            isValidCache = cacheUserId === currentUserId;
          } else {
            isValidCache = cacheUserId === null && cachePlanSlug === "trial";
          }
          if (!isValidCache) {
            console.log(
              "[TobyFlow] FeatureGate: Cache invalid, skip \u2192 will force fetch",
              "hasUserIdField:",
              hasUserIdField,
              "cacheUserId:",
              cacheUserId,
              "currentUserId:",
              currentUserId,
              "cachePlan:",
              cachePlanSlug,
            );
            this._cacheSkippedDueToMismatch = true;
            resolve(false);
            return;
          }
          if (
            cached.entitlements &&
            Object.keys(cached.entitlements).length > 0
          ) {
            this.entitlements = {
              ...this._freeDefaults,
              ...cached.entitlements,
            };
            this._serverFetched = true;
          }
          if (cached.plan) {
            this.plan = cached.plan;
          }
          this.lastFetch = cached.lastFetch || 0;
          resolve(true);
          return;
        }
        resolve(false);
      });
    });
  }
  async _saveCache() {
    const userId = window.authManager?.user?.id || null;
    return new Promise((resolve) => {
      chrome.storage.local.set(
        {
          [this.cacheKey]: {
            entitlements: this.entitlements,
            plan: this.plan,
            lastFetch: this.lastFetch,
            user_id: userId,
          },
        },
        resolve,
      );
    });
  }
  _isCacheValid() {
    if (!this.entitlements || !this.lastFetch) return false;
    return Date.now() - this.lastFetch < this.cacheTTL;
  }
  async _loadLocalUsage() {
    return new Promise((resolve) => {
      chrome.storage.local.get([this._localUsageKey], (result) => {
        this._localUsage = result[this._localUsageKey] || {};
        console.log("[FeatureGate] _loadLocalUsage:", this._localUsage);
        resolve();
      });
    });
  }
  async _saveLocalUsage() {
    return new Promise((resolve) => {
      chrome.storage.local.set(
        { [this._localUsageKey]: this._localUsage },
        resolve,
      );
    });
  }
}
FeatureGate._statQueue = Promise.resolve();
window.featureGate = new FeatureGate();
window.FeatureGate = FeatureGate;
