class MuseAdapter extends AIProviderAdapter {
  constructor() {
    super();
    this.key = "muse";
    this.displayName = "Muse";
    this.featureKey = "muse_enabled";
    this.executionAction = "muse_run";
  }
  get capabilities() {
    const pcm = window.ProviderConfigManager;
    const supports = pcm?.safeGetSupportsSync?.("muse") || {};
    const ratios = pcm?.safeGetRatiosSync?.("muse", "image") || [];
    return {
      supportsRatio: supports.ratio ?? false,
      supportsQuantity: supports.quantity ?? false,
      supportsVideo: supports.video ?? false,
      supportsRefImage: supports.ref_image ?? false,
      supportsAutoDownload: supports.auto_download ?? false,
      supportsHumanized: supports.humanized ?? false,
      supportsImageMode: supports.image_mode ?? false,
      supportsDeleteAfterGen: supports.delete_after_gen === true,
      maxRefImages: this.getMaxRefImages({ mode: "image" }),
      supportedRatios: ratios
        .map((item) => item.ui_name || item.value)
        .filter(Boolean),
      ratioUiMap: ratios.reduce((map, item) => {
        const key = item.ui_name || item.value;
        if (key) map[key] = item.label || item.value || key;
        return map;
      }, {}),
    };
  }
  getRatios(mediaType = "image") {
    return (
      window.ProviderConfigManager?.safeGetRatiosSync?.("muse", mediaType) || []
    );
  }
  getMaxRefImages({ mode = "image", modelValue = null } = {}) {
    const normalizedMode = mode === "video" ? "video" : "image";
    const Registry =
      typeof ModelRegistry !== "undefined" ? ModelRegistry : null;
    const selectedModel =
      modelValue || Registry?.safeGetDefault?.("muse", normalizedMode) || null;
    const modelCap = selectedModel
      ? Registry?.findModel?.("muse", selectedModel)?.config?.max_ref_images
          ?.image
      : null;
    if (typeof modelCap === "number") return Math.max(0, modelCap);
    return (
      window.ProviderConfigManager?.safeGetMaxRefImagesSync?.(
        "muse",
        "image",
      ) ?? 0
    );
  }
  async ensureReady() {
    return (
      window.MuseSession?.ensureReady?.() || {
        ready: false,
        error: "SESSION_NOT_LOADED",
      }
    );
  }
  _composePrompt(prompt, settings = {}) {
    const config = window.ProviderConfigManager?.getApiConfigValueSync?.(
      "muse",
      "prompt_prefixes",
    );
    const mode = settings.mode === "video" ? "video" : "image";
    const ratio = String(settings.ratio || "");
    const modePrefix = config?.modes?.[mode];
    const ratioPrefix = config?.ratios?.[ratio];
    const template = config?.template;
    if (
      typeof template !== "string" ||
      !template ||
      typeof modePrefix !== "string" ||
      !modePrefix ||
      typeof ratioPrefix !== "string" ||
      !ratioPrefix
    ) {
      return { ok: false, error: "PROMPT_PREFIX_CONFIG_MISSING" };
    }
    return {
      ok: true,
      text: template
        .replaceAll("{mode_prefix}", modePrefix)
        .replaceAll("{ratio_prefix}", ratioPrefix)
        .replaceAll("{prompt}", String(prompt || "")),
    };
  }
  async submit({
    prompt,
    refs = [],
    settings = {},
    taskName = null,
    shouldStop = null,
  } = {}) {
    const cancelled = () => ({ success: false, error: "CANCELLED" });
    if (shouldStop?.()) return cancelled();
    const ready =
      settings.newChat === false
        ? await this.ensureReady()
        : await window.MuseSession?.prepareNewChat?.();
    if (shouldStop?.()) return cancelled();
    if (!ready?.ready) {
      return {
        success: false,
        error: ready?.error || "NOT_READY",
        diagnostic: ready?.diagnostic || null,
      };
    }
    const composed = this._composePrompt(prompt, settings);
    if (!composed.ok) return { success: false, error: composed.error };
    const timeouts =
      window.ProviderConfigManager?.getApiConfigValueSync?.(
        "muse",
        "timeouts",
      ) || {};
    const timeout =
      settings.mode === "video"
        ? Number(timeouts.video_ms)
        : Number(timeouts.image_ms);
    if (!Number.isFinite(timeout) || timeout <= 0)
      return { success: false, error: "TIMEOUT_CONFIG_MISSING" };
    const expectedMode = settings.mode === "video" ? "video" : "image";
    const payload = {
      text: composed.text,
      mode: expectedMode,
      images: refs,
      tabId: ready.tabId,
      timeout,
      taskName,
      autoDownload: settings.autoDownload === true,
    };
    let retries = 0,
      maxRetries = null;
    while (true) {
      if (shouldStop?.()) return cancelled();
      let result;
      try {
        result = await (window.MessageBridge?.museSubmitAndWait?.(payload) || {
          success: false,
          error: "BRIDGE_NOT_LOADED",
        });
      } catch (error) {
        if (shouldStop?.()) return cancelled();
        if (retries > 0)
          return {
            success: false,
            error: error?.message || "BRIDGE_ERROR",
            noRetry: true,
          };
        throw error;
      }
      if (shouldStop?.()) return cancelled();
      if (result?.success && result.mediaType !== expectedMode) {
        return {
          success: false,
          error: "MUSE_RESULT_TYPE_MISMATCH",
          noRetry: retries > 0,
          diagnostic: {
            expectedMode,
            receivedMediaType: result.mediaType || null,
          },
        };
      }
      if (result?.error !== "MUSE_TEXT_ONLY_RESULT") {
        return retries > 0 && !result?.success
          ? { ...result, noRetry: true }
          : result;
      }
      if (maxRetries === null) {
        let config;
        try {
          config = await window.ExecutionConfig?.getConfig?.();
        } catch (_) {}
        if (shouldStop?.()) return cancelled();
        const value = config?.workflow?.max_retries;
        if (
          value == null ||
          value === "" ||
          !Number.isSafeInteger(Number(value)) ||
          Number(value) < 0
        ) {
          return {
            success: false,
            error: "CONFIG_REQUIRED:exec_max_retries",
            noRetry: true,
            diagnostic: { providerError: result.error },
          };
        }
        maxRetries = Number(value);
      }
      if (retries >= maxRetries)
        return { ...result, noRetry: true, textOnlyRetries: retries };
      retries++;
      console.info(
        "[MuseTextRetry]",
        JSON.stringify({ retry: retries, maxRetries, tabId: ready.tabId }),
      );
      try {
        chrome.runtime
          .sendMessage({
            action: "muse:trace",
            stage: "text_only_retry",
            data: { retry: retries, maxRetries, tabId: ready.tabId },
          })
          ?.catch?.(() => {});
      } catch (_) {}
    }
  }
}
window.MuseAdapter = MuseAdapter;
