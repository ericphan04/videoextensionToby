class ChatGPTAdapter extends AIProviderAdapter {
  constructor() {
    super();
    this.key = "chatgpt";
    this.displayName = "ChatGPT";
    this.featureKey = "chatgpt_enabled";
    this.executionAction = "chatgpt_run";
  }
  get capabilities() {
    if (this.constructor._capabilitiesCache)
      return this.constructor._capabilitiesCache;
    const pcm =
      typeof ProviderConfigManager !== "undefined"
        ? ProviderConfigManager
        : null;
    const supports = pcm?.safeGetSupportsSync?.("chatgpt") || {};
    const maxRef = pcm?.safeGetMaxRefImagesSync?.("chatgpt", "image") ?? 0;
    const ratioUiMap = pcm?.safeGetRatioUiMapSync?.("chatgpt") || {};
    const ratioAriaLabels = pcm?.safeGetRatioAriaLabelsSync?.("chatgpt") || {};
    const ratios = pcm?.safeGetRatiosSync?.("chatgpt", "image") || [];
    const result = {
      supportsRatio: supports.ratio ?? false,
      supportsQuantity: supports.quantity ?? false,
      supportsVideo: supports.video ?? false,
      supportsRefImage: supports.ref_image ?? false,
      supportsAutoDownload: supports.auto_download ?? false,
      supportsHumanized: supports.humanized ?? false,
      supportsImageMode: supports.image_mode ?? false,
      maxRefImages: maxRef,
      supportedRatios: ratios.map((r) => r.ui_name),
      ratioUiMap:
        Object.keys(ratioUiMap).length > 0
          ? ratioUiMap
          : ratios.reduce((acc, r) => {
              acc[r.ui_name] = r.value;
              return acc;
            }, {}),
      ratioAriaLabels,
    };
    this.constructor._capabilitiesCache = result;
    this.constructor._bindCapabilitiesInvalidation();
    return result;
  }
  static _bindCapabilitiesInvalidation() {
    if (this._invalidationBound) return;
    this._invalidationBound = true;
    if (!window.eventBus) return;
    const invalidate = (data) => {
      if (!data?.provider || data.provider === "chatgpt") {
        this._capabilitiesCache = null;
      }
    };
    window.eventBus.on("sse:provider_config_updated", invalidate);
    window.eventBus.on("provider:api_config_updated", invalidate);
    window.eventBus.on("provider:dom_selector_updated", invalidate);
    window.eventBus.on("provider:models_updated", invalidate);
  }
  async ensureReady(options = {}) {
    if (!window.ChatGPTSession) {
      return { ready: false, error: "SESSION_NOT_LOADED" };
    }
    try {
      return await window.ChatGPTSession.ensureReady(options);
    } catch (e) {
      return { ready: false, error: e?.message || "SESSION_ERROR" };
    }
  }
  _normalizeRatio(ratio) {
    if (!ratio) return "story";
    const map = {
      "9:16": "story",
      "D\u1ECDc": "story",
      story: "story",
      Story: "story",
      "3:4": "portrait",
      "D\u1ECDc 3:4": "portrait",
      portrait: "portrait",
      Portrait: "portrait",
      "1:1": "square",
      "Vu\xF4ng": "square",
      square: "square",
      Square: "square",
      "4:3": "landscape",
      "Ngang 4:3": "landscape",
      landscape: "landscape",
      Landscape: "landscape",
      "16:9": "widescreen",
      Ngang: "widescreen",
      widescreen: "widescreen",
      Widescreen: "widescreen",
    };
    return map[ratio] || "story";
  }
  async submit({
    prompt,
    refFileIds,
    settings,
    taskName,
    shouldStop = null,
  } = {}) {
    const stopped = () => shouldStop?.() === true;
    const cancelled = () => ({ success: false, error: "ABORTED" });
    if (stopped()) return cancelled();
    const ready = await this.ensureReady({ waitForEditorMs: 12e3 });
    if (stopped()) return cancelled();
    if (!ready || !ready.ready) {
      return { success: false, error: ready?.error || "NOT_READY" };
    }
    const tabId = ready.tabId;
    const ratio = this._normalizeRatio(settings?.ratio);
    const images = await this._resolveRefImages(refFileIds);
    if (stopped()) return cancelled();
    console.log(
      "[ChatGPTAdapter] refImages resolved:",
      images.length,
      "/ tabId:",
      tabId,
    );
    const callerPrefix = settings?.fallbackPrefix;
    const fallbackPrefix =
      callerPrefix !== void 0 ? callerPrefix : await this._getFallbackPrefix();
    if (stopped()) return cancelled();
    if (
      !window.MessageBridge ||
      typeof window.MessageBridge.chatGPTSubmitAndWait !== "function"
    ) {
      console.error(
        "[ChatGPTAdapter] MessageBridge.chatGPTSubmitAndWait KH\xD4NG T\u1ED2N T\u1EA0I",
      );
      return { success: false, error: "BRIDGE_NOT_LOADED" };
    }
    console.log(
      "[ChatGPTAdapter] B\u1EAFt \u0111\u1EA7u chatGPTSubmitAndWait, prompt len:",
      (prompt || "").length,
    );
    const inputTimeoutMs =
      window.storageSettings?.getSettings()?.inputTimeout || 1200;
    const submitPayload = {
      text: prompt,
      images,
      settings: {
        imageMode: true,
        ratio,
        fallbackPrefix,
        model: settings?.model || null,
      },
      inputTimeoutMs,
      timeout:
        settings?.timeout ||
        (window.ExecutionConfig?.safeGetWorkflowConfig()?.timeout_sec ?? 300) *
          1e3,
      tabId,
      taskName: taskName || null,
    };
    let result = await window.MessageBridge.chatGPTSubmitAndWait(submitPayload);
    if (stopped() && !result?.success) return cancelled();
    const _reloadableErrors = [
      "COMPOSER_DIRTY",
      "SUBMIT_FAILED_NEED_RELOAD",
      "EDITOR_NOT_FOUND",
      "NEW_CHAT_NOT_READY",
      "SEND_FAILED",
    ];
    for (
      let _attempt = 1;
      _attempt <= 2 && _reloadableErrors.includes(result?.error);
      _attempt++
    ) {
      if (stopped()) return cancelled();
      if (!window.ChatGPTSession?.ensureTabActive) break;
      if (
        result?.reason === "YANKED" &&
        !submitPayload.settings?.skipImageToggle
      ) {
        submitPayload.settings = {
          ...submitPayload.settings,
          skipImageToggle: true,
        };
        console.warn(
          "[ChatGPTAdapter] YANKED \u2014 retry n\xE0y skip toggle Create image, d\xF9ng fallback prefix",
        );
      }
      console.warn(
        "[ChatGPTAdapter]",
        result.error,
        `\u2014 forceRefresh homepage + retry (${_attempt}/2)`,
      );
      await window.ChatGPTSession.ensureTabActive({ forceRefresh: true });
      if (stopped()) return cancelled();
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 1e3));
        if (stopped()) return cancelled();
        result = await window.MessageBridge.chatGPTSubmitAndWait(submitPayload);
        if (stopped() && !result?.success) return cancelled();
        if (result?.error !== "SEND_FAILED") break;
      }
    }
    if (result?.error === "TEXT_ONLY") {
      if (result.textOnlyConfirmed !== true)
        result = { ...result, noRetry: true };
      else if (!window.RetryHelper?.recoverMediaTextOnly)
        result = { ...result, noRetry: true };
      else
        result = await window.RetryHelper.recoverMediaTextOnly(
          result,
          ({ conversationPath }) => {
            if (stopped()) return cancelled();
            return window.MessageBridge.chatGPTSubmitAndWait({
              ...submitPayload,
              settings: {
                ...submitPayload.settings,
                newChat: false,
                retryConversationPath: conversationPath,
              },
            });
          },
          { code: "TEXT_ONLY", provider: "chatgpt", shouldStop: stopped },
        );
      if (stopped()) return cancelled();
    }
    if (!result || !result.success) {
      if (result?.error === "TEXT_ONLY" && result.diagnostic) {
        const diagnostic = {};
        for (const key of [
          "elapsedMs",
          "assistantImageCount",
          "renderedAssistantImageCount",
          "matchedImageCount",
          "generatedAltImageCount",
          "resultSelectorCount",
          "cdnSelectorCount",
          "generatedAltPatternCount",
          "baselineSourceCount",
        ]) {
          if (Number.isFinite(result.diagnostic[key]))
            diagnostic[key] = result.diagnostic[key];
        }
        diagnostic.assistantRendered =
          result.diagnostic.assistantRendered === true;
        console.warn(
          "[ChatGPTAdapter] TEXT_ONLY detection diagnostic:",
          JSON.stringify(diagnostic),
        );
      }
      try {
        if (window.EditorExecutor?._incrementDailyStat) {
          window.EditorExecutor._incrementDailyStat("chatgpt_fail");
        }
      } catch (_) {}
      return {
        success: false,
        error: result?.error || "SUBMIT_FAILED",
        noRetry: result?.noRetry === true,
        message: result?.message || result?.text,
        reason: result?.reason,
        hasPendingImage: result?.hasPendingImage === true,
        errorDetails: Array.isArray(result?.errorDetails)
          ? result.errorDetails
          : [],
        failureDetails: Array.isArray(result?.failureDetails)
          ? result.failureDetails
          : [],
        providerErrorCodes: Array.isArray(result?.providerErrorCodes)
          ? result.providerErrorCodes
          : [],
      };
    }
    try {
      if (window.EditorExecutor?._incrementDailyStat) {
        window.EditorExecutor._incrementDailyStat("chatgpt_prompt_total");
      }
    } catch (_) {}
    return {
      success: true,
      imageUrls: result.imageUrls || [],
      altPrompt: result.altPrompt,
      ratioUsed: ratio,
      imageModeUsed: result.imageModeUsed ?? true,
      tabId,
    };
  }
  async submitText({
    prompt,
    refFileIds = [],
    model = null,
    timeout = window.SystemConfig?.getTimeout("chatgpt_timeout_ms") || 6e4,
  } = {}) {
    const ready = await this.ensureReady({ waitForEditorMs: 12e3 });
    if (!ready || !ready.ready) {
      throw new Error(ready?.error || "CHATGPT_NOT_READY");
    }
    if (!window.ChatGPTSession?.ensureTabActive) {
      throw new Error("CHATGPT_SESSION_NOT_LOADED");
    }
    await window.ChatGPTSession.ensureTabActive({ forceRefresh: true });
    const freshReady = await this.ensureReady({
      forceCheck: true,
      waitForEditorMs: 12e3,
    });
    if (!freshReady?.ready || !freshReady.tabId) {
      throw new Error(freshReady?.error || "NEW_CHAT_NOT_READY");
    }
    const tabId = freshReady.tabId;
    if (window.ChatGPTSession) {
      window.ChatGPTSession._imageModeActive = false;
    }
    if (
      !window.MessageBridge ||
      typeof window.MessageBridge.chatGPTSubmitAndWait !== "function"
    ) {
      throw new Error("BRIDGE_NOT_LOADED");
    }
    const maxRefs = this.capabilities.maxRefImages;
    let resolvedRefs = Array.isArray(refFileIds) ? refFileIds : [];
    resolvedRefs = resolvedRefs.filter((x) => x && x.base64).slice(0, maxRefs);
    const selectedModel =
      model ||
      window.storageSettings?.getSettings?.()?.chatgptModel ||
      window.ModelRegistry?.safeGetDefault?.("chatgpt", "image") ||
      null;
    const result = await window.MessageBridge.chatGPTSubmitAndWait({
      text: prompt,
      images: resolvedRefs,
      settings: { imageMode: false, newChat: true, model: selectedModel },
      timeout,
      tabId,
      expectText: true,
    });
    if (!result || !result.success) {
      try {
        if (window.EditorExecutor?._incrementDailyStat) {
          window.EditorExecutor._incrementDailyStat("chatgpt_fail");
        }
      } catch (_) {}
      const code = result?.error || "CHATGPT_TEXT_FAILED";
      const err = new Error(result?.message || code);
      err.code = code;
      throw err;
    }
    try {
      if (window.EditorExecutor?._incrementDailyStat) {
        window.EditorExecutor._incrementDailyStat("chatgpt_prompt_total");
      }
    } catch (_) {}
    return { text: result.text || "", turnId: result.turnId || null };
  }
  async uploadRef(file) {
    if (!file) {
      throw new Error("FILE_REQUIRED");
    }
    const base64 = await this._fileToBase64(file);
    return {
      fileId:
        "chatgpt_ref_" +
        Date.now() +
        "_" +
        Math.random().toString(36).slice(2, 8),
      base64,
      name: file.name,
      type: file.type,
    };
  }
  async _resolveRefImages(refFileIds) {
    if (!refFileIds) return [];
    if (Array.isArray(refFileIds)) {
      if (refFileIds.length === 0) return [];
      if (typeof refFileIds[0] === "object" && refFileIds[0] !== null) {
        return refFileIds.filter((x) => x && x.base64);
      }
      console.warn(
        "[ChatGPTAdapter] _resolveRefImages: b\u1ECF qua",
        refFileIds.length,
        "tile ID(s) \u2014 ch\u01B0a wire resolution sang base64 (defer CG-7).",
      );
      return [];
    }
    if (typeof refFileIds === "string" && refFileIds.trim()) {
      const count = refFileIds.split(",").filter((s) => s.trim()).length;
      console.warn(
        "[ChatGPTAdapter] _resolveRefImages: b\u1ECF qua",
        count,
        "tile ID string(s) \u2014 ch\u01B0a wire resolution sang base64 (defer CG-7).",
      );
    }
    return [];
  }
  async _fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result || "";
        const m = String(result).match(/^data:.+?;base64,(.+)$/);
        resolve(m ? m[1] : "");
      };
      reader.onerror = () => reject(new Error("FILE_READ_ERROR"));
      reader.readAsDataURL(file);
    });
  }
  async _getFallbackPrefix() {
    const cached =
      window.storageSettings?.getSettings?.()?.chatgptFallbackPrefix;
    if (cached !== void 0 && cached !== null) return cached;
    try {
      const result = await new Promise((r) =>
        chrome.storage.local.get(["af_settings"], r),
      );
      const stored = result?.af_settings?.chatgptFallbackPrefix;
      if (stored !== void 0 && stored !== null) return stored;
    } catch (e) {}
    return "Generate an image of: ";
  }
}
window.ChatGPTAdapter = ChatGPTAdapter;
