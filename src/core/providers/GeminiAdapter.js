class GeminiAdapter extends AIProviderAdapter {
  constructor() {
    super();
    this.key = "gemini";
    this.displayName = "Gemini";
    this.featureKey = "gemini_enabled";
    this.executionAction = "gemini_run";
  }
  get capabilities() {
    if (this.constructor._capabilitiesCache)
      return this.constructor._capabilitiesCache;
    const pcm =
      typeof ProviderConfigManager !== "undefined"
        ? ProviderConfigManager
        : null;
    const supports = pcm?.safeGetSupportsSync?.("gemini") || {};
    const maxRef = pcm?.safeGetMaxRefImagesSync?.("gemini", "image") ?? 0;
    const ratios = pcm?.safeGetRatiosSync?.("gemini", "image") || [];
    const result = {
      supportsRatio: supports.ratio ?? false,
      supportsImageMode: supports.image_mode ?? false,
      supportsRefImage: supports.ref_image ?? false,
      supportsQuantity: supports.quantity ?? false,
      supportsVideo: supports.video ?? false,
      supportsAutoDownload: supports.auto_download ?? false,
      supportsHumanized: supports.humanized ?? false,
      maxRefImages: maxRef,
      supportedRatios: ratios.map((r) => r.value).filter(Boolean),
      ratioUiMap: ratios.reduce((map, item) => {
        if (item.value) map[item.value] = item.label || item.value;
        return map;
      }, {}),
    };
    this.constructor._capabilitiesCache = result;
    if (!this.constructor._invalidationBound && window.eventBus) {
      this.constructor._invalidationBound = true;
      window.eventBus.on("provider:api_config_updated", ({ provider } = {}) => {
        if (!provider || provider === "gemini")
          this.constructor._capabilitiesCache = null;
      });
    }
    return result;
  }
  getMaxRefImages({ mode: _mode = "image" } = {}) {
    const pcm =
      typeof ProviderConfigManager !== "undefined"
        ? ProviderConfigManager
        : null;
    return pcm?.safeGetMaxRefImagesSync?.("gemini", "image") ?? 0;
  }
  async ensureReady(options = {}) {
    if (!window.GeminiSession) {
      return { ready: false, error: "SESSION_NOT_LOADED" };
    }
    try {
      return await window.GeminiSession.ensureReady(options);
    } catch (e) {
      return { ready: false, error: e?.message || "SESSION_ERROR" };
    }
  }
  async submitText({ prompt, refFileIds = [], timeout } = {}) {
    const ready = await this.ensureReady({ forceCheck: true });
    if (!ready || !ready.ready) {
      throw new Error(ready?.error || "GEMINI_NOT_READY");
    }
    if (
      !window.MessageBridge ||
      typeof window.MessageBridge.geminiSubmitAndWait !== "function"
    ) {
      throw new Error("BRIDGE_NOT_LOADED");
    }
    const maxRefs = this.capabilities.maxRefImages;
    let resolvedRefs = Array.isArray(refFileIds) ? refFileIds : [];
    resolvedRefs = resolvedRefs.filter((x) => x && x.base64).slice(0, maxRefs);
    const result = await window.MessageBridge.geminiSubmitAndWait({
      text: prompt,
      images: resolvedRefs,
      timeout,
      tabId: ready.tabId,
    });
    if (!result || !result.success) {
      try {
        if (window.EditorExecutor?._incrementDailyStat) {
          window.EditorExecutor._incrementDailyStat("gemini_fail");
        }
      } catch (_) {}
      const code = result?.error || "GEMINI_TEXT_FAILED";
      const err = new Error(result?.message || code);
      err.code = code;
      throw err;
    }
    try {
      if (window.EditorExecutor?._incrementDailyStat) {
        window.EditorExecutor._incrementDailyStat("gemini_prompt_total");
      }
    } catch (_) {}
    return { text: result.text || "", turnId: result.turnId || null };
  }
  async submit({
    prompt,
    mediaType = "image",
    model,
    ratio = null,
    refs = [],
    timeout,
    runId,
    settings = {},
    shouldStop = () => false,
  } = {}) {
    if (mediaType !== "image" && mediaType !== "video")
      throw new Error("UNSUPPORTED_MEDIA_TYPE");
    const checkStopped = () => {
      if (shouldStop())
        throw Object.assign(new Error("ABORTED"), {
          code: "ABORTED",
          noRetry: true,
        });
    };
    checkStopped();
    const supports = this.capabilities;
    if (mediaType === "image" && !supports.supportsImageMode)
      throw new Error("GEMINI_IMAGE_DISABLED");
    if (mediaType === "video" && !supports.supportsVideo)
      throw new Error("GEMINI_VIDEO_DISABLED");
    const ready = await this.ensureReady();
    if (!ready?.ready) throw new Error(ready?.error || "GEMINI_NOT_READY");
    checkStopped();
    const pcm = window.ProviderConfigManager;
    if (!pcm) throw new Error("CONFIG_UNAVAILABLE");
    const maxRefs = pcm?.safeGetMaxRefImagesSync?.("gemini", "image") ?? 0;
    const images = (Array.isArray(refs) ? refs : [])
      .filter((x) => x?.base64)
      .slice(0, maxRefs);
    let ratioPromptSuffix = "";
    if (ratio) {
      const ratios = pcm?.safeGetRatiosSync?.("gemini", mediaType);
      const selected = Array.isArray(ratios)
        ? ratios.find((item) => item.value === ratio || item.ui_name === ratio)
        : null;
      if (!selected) throw new Error("RATIO_CONFIG_MISSING");
      ratioPromptSuffix = selected.prompt_suffix
        ? `

${selected.prompt_suffix}`
        : "";
    }
    const registryModel = window.ModelRegistry?.findModel?.("gemini", model);
    if (!registryModel) throw new Error("MODEL_CONFIG_MISSING");
    const monitor = pcm.getApiConfigValueSync?.(
      "gemini",
      "generation_monitor",
    )?.[mediaType];
    if (!monitor) throw new Error("MONITOR_CONFIG_MISSING");
    const absoluteMaxWaitMs = Number(monitor.absolute_max_wait_ms);
    if (!Number.isFinite(absoluteMaxWaitMs) || absoluteMaxWaitMs <= 0)
      throw new Error("MONITOR_CONFIG_MISSING");
    const requestedTimeoutMs = Number(timeout);
    const effectiveTimeoutMs =
      Number.isFinite(requestedTimeoutMs) && requestedTimeoutMs > 0
        ? Math.min(requestedTimeoutMs, absoluteMaxWaitMs)
        : absoluteMaxWaitMs;
    let result;
    const submitOnce = (attempt, newChat, retryConversationPath = null) => {
      checkStopped();
      return window.MessageBridge.geminiSubmitAndWait({
        text: prompt,
        images,
        timeout: effectiveTimeoutMs,
        tabId: ready.tabId,
        expect: mediaType,
        runId: `${runId || `gemini-${Date.now()}`}-attempt-${attempt}`,
        settings: retryConversationPath
          ? { ...settings, retryConversationPath }
          : settings,
        model: {
          value: registryModel.value,
          domIdentity: registryModel.config?.dom_identity || null,
        },
        ratio,
        ratioPromptSuffix,
        newChat,
      });
    };
    try {
      result = await submitOnce(1, true);
      const retryable = new Set([
        "SEND_FAILED",
        "COMPOSER_DIRTY",
        "NEW_CHAT_FAILED",
        "CONVERSATION_CHANGED",
        "MODEL_TRIGGER_NOT_FOUND",
        "MODEL_NOT_AVAILABLE",
        "MODEL_UNAVAILABLE",
        "TOOLS_MENU_NOT_FOUND",
        "TOOL_NOT_AVAILABLE",
        "TOOL_ACTIVATION_FAILED",
        "MODEL_TOOL_VERIFY_FAILED",
        "TOOL_VERIFY_FAILED",
        "VIDEO_RATIO_TRIGGER_NOT_FOUND",
        "VIDEO_RATIO_OPTION_NOT_FOUND",
        "VIDEO_RATIO_VERIFY_FAILED",
        "VIDEO_RATIO_MENU_CLOSE_FAILED",
      ]);
      if (!result?.success && retryable.has(result?.error)) {
        checkStopped();
        if (result.error === "SEND_FAILED") {
          const recovery =
            await window.GeminiSession?.reconnectAfterNavigation?.(
              Number(monitor.refresh_ready_timeout_ms),
            );
          if (!recovery?.ready) {
            const code = recovery?.error || "RECONNECT_READY_TIMEOUT";
            throw Object.assign(new Error(code), { code });
          }
          result = await submitOnce(2, false);
        } else if (result.error === "NEW_CHAT_FAILED") {
          const recovery = await window.GeminiSession?.forceRefresh?.(
            Number(monitor.refresh_ready_timeout_ms),
          );
          if (!recovery?.ready) {
            const code = recovery?.error || "REFRESH_READY_TIMEOUT";
            throw Object.assign(new Error(code), { code });
          }
          result = await submitOnce(2, false);
        } else {
          result = await submitOnce(2, true);
        }
      }
      if (result?.error === "GEMINI_TEXT_ONLY_RESULT") {
        if (
          result.textOnlyConfirmed !== true ||
          !window.RetryHelper?.recoverMediaTextOnly
        )
          result = { ...result, noRetry: true };
        else
          result = await window.RetryHelper.recoverMediaTextOnly(
            result,
            ({ retry, conversationPath }) =>
              submitOnce(`text-${retry}`, false, conversationPath),
            { code: "GEMINI_TEXT_ONLY_RESULT", provider: "gemini", shouldStop },
          );
      }
    } catch (error) {
      if (error?.code !== "ABORTED") {
        try {
          window.EditorExecutor?._incrementDailyStat?.("gemini_fail");
        } catch (_) {}
      }
      throw error;
    }
    if (!result?.success) {
      checkStopped();
      try {
        window.EditorExecutor?._incrementDailyStat?.("gemini_fail");
      } catch (_) {}
      const error = new Error(
        result?.message || result?.error || "GEMINI_MEDIA_FAILED",
      );
      error.code = result?.error || "GEMINI_MEDIA_FAILED";
      error.noRetry = result?.noRetry === true;
      throw error;
    }
    try {
      window.EditorExecutor?._incrementDailyStat?.("gemini_prompt_total");
    } catch (_) {}
    return {
      provider: "gemini",
      mediaType,
      model: registryModel.value,
      results: result.results || [],
      resultCount: Number(result.resultCount || result.results?.length || 0),
      tabId: ready.tabId,
      runId,
    };
  }
}
if (typeof window !== "undefined") {
  window.GeminiAdapter = GeminiAdapter;
}
