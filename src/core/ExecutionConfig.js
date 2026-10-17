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
class ExecutionConfig {
  static _isValidPayload(data) {
    if (
      !data ||
      typeof data !== "object" ||
      !(
        data.workflow ||
        data.queue ||
        data.timing ||
        data.flow_recovery ||
        data.parallel
      )
    )
      return false;
    return ["pause_resume", "normal_error", "stop_batch"].includes(
      data.flow_recovery?.captcha_recovery_mode,
    );
  }
  static async getConfig(forceRefresh = false) {
    if (this._fetching) {
      return this._fetchPromise;
    }
    this._fetching = true;
    this._fetchPromise = this._fetchFromServer(forceRefresh);
    try {
      const result = await this._fetchPromise;
      console.log(
        "[ExecutionConfig] recovery config " +
          JSON.stringify({
            forceRefresh,
            webResubmitEnabled: result?.parallel?.web_resubmit_enabled ?? null,
            webParallelEnabled: result?.parallel?.flow_v2_web_enabled ?? null,
            maxRetries: result?.workflow?.max_retries ?? null,
          }),
      );
      return result;
    } finally {
      this._fetching = false;
      this._fetchPromise = null;
    }
  }
  static async _fetchFromServer(force = false) {
    const epoch = this._protectedEpoch;
    try {
      const json = await RequestSigner.fetchProtected("execution", { force });
      if (!this._isValidPayload(json.data))
        throw new window.ConfigRequiredError(
          "execution_config",
          "response_invalid",
        );
      if (epoch !== this._protectedEpoch)
        throw new window.ConfigRequiredError(
          "execution_config",
          "CONFIG_SCOPE_CHANGED",
          { code: "CONFIG_SCOPE_CHANGED", accessDenied: true },
        );
      this._cache = json.data;
      this._cacheTime = Date.now();
      return json.data;
    } catch (error) {
      if (epoch === this._protectedEpoch) this._cache = null;
      throw error;
    }
  }
  static invalidateProtected() {
    this._protectedEpoch++;
    this._cache = null;
    this._cacheTime = 0;
  }
  static getWorkflowConfig() {
    if (!this._cache) {
      this.getConfig().catch(() => {});
      if (window.ConfigRequiredError) {
        throw new window.ConfigRequiredError(
          "execution_workflow",
          "cache_empty",
        );
      }
      return {};
    }
    return this._cache.workflow || {};
  }
  static getWorkflowFlowApiEnabled() {
    try {
      return this.getWorkflowConfig().flow_api_enabled === true;
    } catch (_) {
      return false;
    }
  }
  static getQueueConfig() {
    if (!this._cache) {
      this.getConfig().catch(() => {});
      if (window.ConfigRequiredError) {
        throw new window.ConfigRequiredError("execution_queue", "cache_empty");
      }
      return {};
    }
    return this._cache.queue || {};
  }
  static getFlowRecoveryConfig() {
    if (!this._cache) {
      this.getConfig().catch(() => {});
      if (window.ConfigRequiredError) {
        throw new window.ConfigRequiredError(
          "execution_flow_recovery",
          "cache_empty",
        );
      }
      return {};
    }
    return this._cache.flow_recovery || {};
  }
  static getFlowCaptchaRecoveryMode() {
    const mode = this.getFlowRecoveryConfig().captcha_recovery_mode;
    if (["pause_resume", "normal_error", "stop_batch"].includes(mode))
      return mode;
    if (window.ConfigRequiredError) {
      throw new window.ConfigRequiredError(
        "flow_captcha_recovery_mode",
        "missing_or_invalid",
      );
    }
    throw new Error("FLOW_CAPTCHA_RECOVERY_MODE_REQUIRED");
  }
  static getTimingConfig() {
    if (!this._cache) {
      this.getConfig().catch(() => {});
      if (window.ConfigRequiredError) {
        throw new window.ConfigRequiredError("execution_timing", "cache_empty");
      }
      return {};
    }
    return this._cache.timing || {};
  }
  static getFlowWebResubmitEnabled() {
    return this._cache?.parallel?.web_resubmit_enabled === true;
  }
  static getFlowV2WebParallelEnabled() {
    try {
      return this._cache?.parallel?.flow_v2_web_enabled === true;
    } catch (_) {
      return false;
    }
  }
  static async getFlowV2WebParallelEnabledReady() {
    try {
      await this.getConfig(true);
      return this.getFlowV2WebParallelEnabled();
    } catch (error) {
      console.warn(
        "[ExecutionConfig] Parallel gate refresh failed; forcing sequential:",
        error?.message || error,
      );
      return false;
    }
  }
  static getDelayBetweenNodesSec() {
    const cfg = this.getWorkflowConfig();
    return cfg.delay_nodes_sec ?? 0;
  }
  static getMaxRetries() {
    const cfg = this.getWorkflowConfig();
    return cfg.max_retries ?? 0;
  }
  static getTimeoutSec() {
    const cfg = this.getWorkflowConfig();
    return cfg.timeout_sec ?? 0;
  }
  static getQueueBatchSize() {
    const cfg = this.getQueueConfig();
    return cfg.batch_size ?? 0;
  }
  static getQueueMaxMonitor() {
    const cfg = this.getQueueConfig();
    return cfg.max_monitor ?? 0;
  }
  static getQueueVideoMaxMonitor() {
    const cfg = this.getQueueConfig();
    return cfg.video_max_monitor ?? cfg.max_monitor ?? 0;
  }
  static getBackoffBaseSec() {
    const cfg = this.getFlowRecoveryConfig();
    return cfg.backoff_base_sec ?? 0;
  }
  static getBackoffMaxSec() {
    const cfg = this.getFlowRecoveryConfig();
    return cfg.backoff_max_sec ?? 0;
  }
  static getBackoffJitterPercent() {
    const cfg = this.getFlowRecoveryConfig();
    return cfg.backoff_jitter_percent ?? 0;
  }
  static getDelayBetweenPromptsSec() {
    const cfg = this.getTimingConfig();
    return cfg.delay_between_prompts_sec ?? 0;
  }
  static getFlowChunkConfig() {
    const cfg = this.getFlowRecoveryConfig();
    const raw = cfg.chunk_size;
    const size =
      typeof raw === "number" || (typeof raw === "string" && /^\d+$/.test(raw))
        ? Number(raw)
        : NaN;
    const valid = Number.isSafeInteger(size) && size > 0;
    return {
      enabled: cfg.chunk_mode_enabled === true && valid,
      size: valid ? size : 0,
    };
  }
  static safeGetWorkflowConfig() {
    try {
      return this.getWorkflowConfig();
    } catch (err) {
      if (window.ConfigRequiredError?.is?.(err)) {
        console.debug(
          `[Tier3] ExecutionConfig.safeGetWorkflowConfig fallback: ${err.message}`,
        );
        return {};
      }
      throw err;
    }
  }
  static safeGetQueueConfig() {
    try {
      return this.getQueueConfig();
    } catch (err) {
      if (window.ConfigRequiredError?.is?.(err)) {
        console.debug(
          `[Tier3] ExecutionConfig.safeGetQueueConfig fallback: ${err.message}`,
        );
        return {};
      }
      throw err;
    }
  }
  static safeGetTimingConfig() {
    try {
      return this.getTimingConfig();
    } catch (err) {
      if (window.ConfigRequiredError?.is?.(err)) {
        console.debug(
          `[Tier3] ExecutionConfig.safeGetTimingConfig fallback: ${err.message}`,
        );
        return {};
      }
      throw err;
    }
  }
  static safeGetFlowChunkConfig() {
    try {
      return this.getFlowChunkConfig();
    } catch (err) {
      if (window.ConfigRequiredError?.is?.(err)) {
        console.warn(
          `[ExecutionConfig] Flow chunk config unavailable; checkpoint reload disabled: ${err.message}`,
        );
        return null;
      }
      throw err;
    }
  }
  static safeGetFlowRecoveryConfig() {
    try {
      return this.getFlowRecoveryConfig();
    } catch (err) {
      if (window.ConfigRequiredError?.is?.(err)) {
        console.debug(
          `[Tier3] ExecutionConfig.safeGetFlowRecoveryConfig fallback: ${err.message}`,
        );
        return {};
      }
      throw err;
    }
  }
  static safeGetDelayBetweenPromptsSec() {
    const cfg = this.safeGetTimingConfig();
    const val = cfg.delay_between_prompts_sec;
    if (val === void 0 || val === null) {
      console.debug(
        "[Tier3] ExecutionConfig.safeGetDelayBetweenPromptsSec returned null \u2014 caller will fallback hardcoded",
      );
      return null;
    }
    return val;
  }
  static invalidate() {
    this.invalidateProtected();
  }
  static async refreshAfterSse() {
    if (this._fetching && this._fetchPromise) {
      try {
        await this._fetchPromise;
      } catch (_) {}
    }
    this._cache = null;
    this._cacheTime = 0;
    const config = await this.getConfig(true);
    window.eventBus?.emit?.("execution_config:refreshed", { source: "sse" });
    console.log(
      "[ExecutionConfig] SSE refresh completed (storage cleared before fetch)",
    );
    return config;
  }
  static isCacheWarm() {
    return (
      this._cache !== null && Date.now() - this._cacheTime < this._CACHE_TTL_MS
    );
  }
}
__publicField(ExecutionConfig, "_cache", null);
__publicField(ExecutionConfig, "_cacheTime", 0);
__publicField(ExecutionConfig, "_CACHE_TTL_MS", 5 * 60 * 1e3);
__publicField(ExecutionConfig, "_fetching", false);
__publicField(ExecutionConfig, "_fetchPromise", null);
__publicField(ExecutionConfig, "_DEBUG", false);
__publicField(ExecutionConfig, "_protectedEpoch", 0);
window.eventBus?.on("sse:system_settings_changed", (data) => {
  if (data?.group === "execution" || data?.section === "execution") {
    ExecutionConfig.refreshAfterSse().catch((error) => {
      console.warn(
        "[ExecutionConfig] SSE refresh failed:",
        error?.message || error,
      );
    });
  }
});
try {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (
      areaName === "local" &&
      changes.af_execution_config &&
      changes.af_execution_config.newValue == null
    ) {
      ExecutionConfig.invalidateProtected();
    }
  });
} catch (_) {}
window.ExecutionConfig = ExecutionConfig;
