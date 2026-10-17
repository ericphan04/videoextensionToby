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
const _GenTab = class _GenTab {
  static _historyRefThumbnails(ids) {
    return Object.fromEntries(
      (ids || [])
        .filter((id) => _GenTab.thumbnailCache?.[id])
        .map((id) => [
          id,
          _GenTab.refMediaTypes?.[id] === "video"
            ? {
                thumbnail: _GenTab.thumbnailCache[id],
                type: "video",
                video_url: _GenTab.refVideoUrls?.[id] || null,
              }
            : _GenTab.thumbnailCache[id],
        ]),
    );
  }
  static get thumbnailCache() {
    return window.MediaRegistry
      ? MediaRegistry._thumbnails
      : _GenTab._thumbnailCacheFallback ||
          (_GenTab._thumbnailCacheFallback = {});
  }
  static set thumbnailCache(val) {
    if (window.MediaRegistry) MediaRegistry._thumbnails = val;
    else _GenTab._thumbnailCacheFallback = val;
  }
  static get fileNameCache() {
    return window.MediaRegistry
      ? MediaRegistry._fileNames
      : _GenTab._fileNameCacheFallback || (_GenTab._fileNameCacheFallback = {});
  }
  static set fileNameCache(val) {
    if (window.MediaRegistry) MediaRegistry._fileNames = val;
    else _GenTab._fileNameCacheFallback = val;
  }
  static _uploadStageLabel(stage) {
    const keys = {
      queued: "gen.uploadQueued",
      preparing: "gen.uploadPreparing",
      uploading: "gen.uploadingImages",
      resolving: "gen.uploadResolving",
      ready: "common.ready",
    };
    const fallbacks = {
      queued: "Waiting",
      preparing: "Preparing",
      uploading: "Uploading",
      resolving: "Preparing preview",
      ready: "Ready",
    };
    const key = keys[stage];
    const translated = key ? window.I18n?.t?.(key) : null;
    return translated && translated !== key
      ? translated.replace(/\.{3}$/, "")
      : fallbacks[stage] || "Uploading";
  }
  static _isRefUploading(fileId) {
    if (!String(fileId || "").startsWith("upload_")) return false;
    return (
      (_GenTab._providerLocalRefUpload?.provider ===
        _GenTab.providerSelect?.value &&
        _GenTab._providerLocalRefUpload?.uploadingIds.has(fileId) === true) ||
      _GenTab._uploadingRefIds?.has(fileId) === true ||
      window.ImmediateUploader?.isActivelyUploading?.(fileId) === true
    );
  }
  static async _submitWithLocalRefProgress(adapter, provider, params) {
    const refKey = Array.isArray(params.refs) ? "refs" : "refFileIds";
    const refs = params[refKey] || [];
    const ids = new Set(
      refs
        .map((ref) => ref?._fileId)
        .filter((id) => String(id || "").startsWith("upload_")),
    );
    if (!ids.size) return adapter.submit(params);
    const context = {
      provider,
      runId: crypto.randomUUID(),
      uploadingIds: new Set(),
    };
    _GenTab._providerLocalRefUpload = context;
    const listener = (message) => {
      if (
        message?.action !== "gen:localRefUploadProgress" ||
        message.runId !== context.runId ||
        !ids.has(message.refId) ||
        _GenTab._providerLocalRefUpload !== context
      )
        return;
      if (message.uploading === true) context.uploadingIds.add(message.refId);
      else context.uploadingIds.delete(message.refId);
      _GenTab.renderFileIdThumbnails();
    };
    chrome.runtime.onMessage.addListener(listener);
    try {
      return await adapter.submit({
        ...params,
        [refKey]: refs.map((ref) =>
          ids.has(ref?._fileId)
            ? {
                ...ref,
                genLocalRef: { runId: context.runId, refId: ref._fileId },
              }
            : ref,
        ),
      });
    } finally {
      chrome.runtime.onMessage.removeListener(listener);
      if (_GenTab._providerLocalRefUpload === context) {
        _GenTab._providerLocalRefUpload = null;
        _GenTab.renderFileIdThumbnails();
      }
    }
  }
  static _applyLocalUploadProgress(progress, payload) {
    const oldId = progress.key,
      newId = progress.newId;
    _GenTab._uploadingRefIds = _GenTab._uploadingRefIds || new Set();
    _GenTab._uploadingRefIds.clear();
    if (progress.state === "uploading") _GenTab._uploadingRefIds.add(oldId);
    if (progress.state === "completed" && oldId && newId && oldId !== newId) {
      const thumb =
        _GenTab.thumbnailCache?.[oldId] ||
        window.pendingUploadFiles?.get(oldId)?.thumbnail ||
        "";
      for (const name of [
        "thumbnailCache",
        "refImageNames",
        "fileNameCache",
        "refMediaTypes",
        "refVideoUrls",
      ]) {
        const cache = _GenTab[name];
        if (cache?.[oldId]) {
          cache[newId] = cache[oldId];
          delete cache[oldId];
        }
      }
      if (thumb) _GenTab.thumbnailCache[newId] = thumb;
      if (progress.detail?.file_name)
        _GenTab.fileNameCache[newId] = progress.detail.file_name;
      if (Array.isArray(payload.fileIds))
        payload.fileIds = payload.fileIds.map((id) =>
          id === oldId ? newId : id,
        );
      if (_GenTab.fileIdsInput) {
        _GenTab.fileIdsInput.value = _GenTab.fileIdsInput.value
          .split(",")
          .map((id) => (id.trim() === oldId ? newId : id.trim()))
          .filter(Boolean)
          .join(", ");
      }
      _GenTab._replacePerPromptFrameId(oldId, newId, thumb);
      for (const frameNum of [1, 2]) {
        if (
          document.getElementById(`genTabFrame${frameNum}FileId`)?.value ===
          oldId
        )
          _GenTab._setFrameImage(frameNum, newId, thumb);
      }
      const replaceFrames = (frames) =>
        frames && {
          ...frames,
          frame1: frames.frame1 === oldId ? newId : frames.frame1,
          frame2: frames.frame2 === oldId ? newId : frames.frame2,
        };
      if (Array.isArray(payload.frameFileIds))
        payload.frameFileIds = payload.frameFileIds.map(replaceFrames);
      else if (payload.frameFileIds)
        payload.frameFileIds = replaceFrames(payload.frameFileIds);
    }
    _GenTab.renderFileIdThumbnails();
    _GenTab._renderPerPromptFrames(_GenTab._getPromptCount());
    _GenTab._renderFramePreviews();
    _GenTab._renderFrameSourcePanel();
  }
  static _beginLocalUpload() {
    const controller = new AbortController();
    _GenTab._localUploadController = controller;
    const button = _GenTab.startBtn;
    const label = button?.querySelector("span");
    const previousLabel = label?.textContent;
    const previousTitle = button?.title || "";
    let complete = false;
    const cancel = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      controller.abort();
      if (button) button.disabled = true;
    };
    if (button) {
      button.disabled = false;
      button.title = window.I18n?.t("common.cancel") || "Cancel";
      button.addEventListener("click", cancel, true);
    }
    return {
      abortFn: () => controller.signal.aborted,
      onProgress: ({ completed, total }) => {
        complete = completed === total;
        if (label)
          label.textContent =
            (window.I18n?.t("gen.uploadingImages") || "Uploading images...") +
            ` ${completed}/${total}`;
      },
      finish: (success = complete) => {
        if (_GenTab._localUploadController === controller)
          _GenTab._localUploadController = null;
        if (button) {
          button.removeEventListener("click", cancel, true);
          button.title = previousTitle;
          button.disabled = success && !controller.signal.aborted;
        }
        if (label && typeof previousLabel === "string")
          label.textContent = previousLabel;
      },
    };
  }
  static _getSettings() {
    return new Promise((resolve) => {
      if (_GenTab._settingsCache) {
        resolve(_GenTab._settingsCache);
        return;
      }
      chrome.storage.local.get(["af_settings"], (res) => {
        _GenTab._settingsCache = res.af_settings || {};
        resolve(_GenTab._settingsCache);
      });
    });
  }
  static _getChainConfig() {
    const config = window.ProviderConfigManager?.getFlowChainConfigSync?.();
    return config && typeof config === "object" ? config : null;
  }
  static _chainState() {
    const enabled = _GenTab.chainToggle?.checked === true;
    const isVideo = _GenTab.genTypeSelect?.value === "Video";
    return enabled
      ? {
          enabled: true,
          kind: isVideo ? "video_last_frame" : "image_result",
          refPolicy: isVideo
            ? "generated_only"
            : _GenTab.chainPolicy?.value || "generated_only",
        }
      : null;
  }
  static _updateChainUI() {
    const config = _GenTab._getChainConfig();
    const provider = (
      _GenTab.providerSelect?.value ||
      document.getElementById("genProvider")?.value ||
      "flow"
    ).toLowerCase();
    const isVideo = _GenTab.genTypeSelect?.value === "Video";
    const inputType = _GenTab.videoInputTypeSelect?.value;
    const isMultiPrompt = _GenTab.multiPromptCheck?.checked === true;
    const hasGlobalRefs = !!String(_GenTab.fileIdsInput?.value || "").trim();
    const compatibleVideo =
      !isVideo ||
      inputType === "Frames" ||
      (inputType === "Ingredients" && !hasGlobalRefs);
    const settings = window.storageSettings?.getSettings?.() || {};
    const storedMode = settings.defaultGenMode || settings.gen_mode || "ui";
    const mode = storedMode === "ui" ? "web" : storedMode;
    const apiCapability = isVideo
      ? config?.video_enabled === true
      : config?.image_enabled === true;
    const webCapability = isVideo
      ? config?.video_web_chain_enabled === true
      : config?.image_web_chain_enabled === true;
    const capabilityEnabled =
      config?.enabled === true &&
      (mode === "web"
        ? webCapability
        : mode === "api"
          ? apiCapability
          : apiCapability || webCapability);
    const visible =
      provider === "flow" &&
      isMultiPrompt &&
      capabilityEnabled &&
      compatibleVideo;
    _GenTab.chainSection?.classList.toggle("hidden", !visible);
    if (!visible && _GenTab.chainToggle) _GenTab.chainToggle.checked = false;
    _GenTab.chainPolicy
      ?.closest(".gen-chain-policy-select")
      ?.classList.toggle("hidden", isVideo);
    const label = document.getElementById("genChainLabel");
    if (label) {
      const key = isVideo ? "gen.chainVideoLabel" : "gen.chainImageLabel";
      label.dataset.i18n = key;
      label.textContent =
        window.I18n?.t?.(key) ||
        (isVideo
          ? "Continue from previous last frame"
          : "Use previous result as next reference");
    }
    const active = visible && _GenTab.chainToggle?.checked;
    if (active) {
      if (!_GenTab._chainRunModeOverrideActive) {
        _GenTab._runModeBeforeChain = _GenTab.runMode || "parallel";
        _GenTab._chainRunModeOverrideActive = true;
      }
      if (_GenTab.runMode !== "sequential") {
        _GenTab.runMode = "sequential";
        _GenTab._updateRunModeUI();
        _GenTab.saveState?.();
      }
    } else if (_GenTab._chainRunModeOverrideActive) {
      _GenTab.runMode = _GenTab._runModeBeforeChain || "parallel";
      _GenTab._runModeBeforeChain = null;
      _GenTab._chainRunModeOverrideActive = false;
      _GenTab._updateRunModeUI();
      _GenTab.saveState?.();
    }
    if (_GenTab.genRunModeBtn) _GenTab.genRunModeBtn.disabled = !!active;
    if (_GenTab.quantitySelect) {
      if (active && _GenTab.quantitySelect.value !== "1") {
        _GenTab.quantitySelect.value = "1";
        _GenTab.updatePromptCount();
      }
      _GenTab.quantitySelect.disabled = !!active;
    }
  }
  static _flowWebOnlyComponentState(prompts, genType) {
    const list = Array.isArray(prompts) ? prompts : [prompts || ""];
    const isFrames =
      genType === "Video" && _GenTab.videoInputTypeSelect?.value === "Frames";
    const voiceSlug =
      document.getElementById("genVideoVoiceSelect")?.value || "";
    const characterSlug =
      document.getElementById("genCharacterSelect")?.value || "";
    const checks = {
      voicePayload:
        !isFrames &&
        genType === "Video" &&
        !!voiceSlug &&
        !!window.VoiceRegistry?.findBySlug?.(voiceSlug)?.search_value,
      characterPayload:
        !isFrames &&
        !!characterSlug &&
        !!window.CharacterRegistry?.payload?.(characterSlug)?.search_value,
      promptMentions:
        !isFrames &&
        list.some((prompt2) => window.MentionParser?.hasComponents?.(prompt2)),
    };
    return {
      hasWebOnlyComponents: Object.values(checks).some(Boolean),
      checks,
    };
  }
  static async _validateChain(
    prompts,
    genType,
    providerKey,
    confirmedFlowExecutionMode = null,
  ) {
    const chain = _GenTab._chainState();
    if (!chain) return { ok: true, chain: null };
    const config = _GenTab._getChainConfig();
    const apiCapability =
      genType === "Video"
        ? config?.video_enabled === true
        : config?.image_enabled === true;
    const webCapability =
      genType === "Video"
        ? config?.video_web_chain_enabled === true
        : config?.image_web_chain_enabled === true;
    const max = Number(
      genType === "Video"
        ? config?.max_video_segments
        : config?.max_image_segments,
    );
    if (
      providerKey !== "flow" ||
      !config?.enabled ||
      (!apiCapability && !webCapability) ||
      !Number.isFinite(max) ||
      max < 2
    ) {
      return {
        ok: false,
        message:
          window.I18n?.t?.("gen.chainUnavailable") ||
          "Flow chain generation is unavailable.",
      };
    }
    if (!_GenTab.multiPromptCheck?.checked || prompts.length < 2) {
      return {
        ok: false,
        message:
          window.I18n?.t?.("gen.chainNeedsPrompts") ||
          "Chain mode requires at least two prompts.",
      };
    }
    if (prompts.length > max) {
      const key =
        genType === "Video" ? "gen.chainVideoTooLong" : "gen.chainImageTooLong";
      const translated = window.I18n?.t?.(key, { count: prompts.length, max });
      const fallback =
        genType === "Video"
          ? `Last-frame video linking is on: ${prompts.length} clips, maximum ${max}. Turn off \u201CContinue from previous last frame\u201D to generate independent videos within your plan\u2019s batch limit.`
          : `Previous-image references are on: ${prompts.length} images, maximum ${max}. Turn off \u201CUse previous result as next reference\u201D to generate independent images within your plan\u2019s batch limit.`;
      return {
        ok: false,
        durationMs: 9e3,
        message: translated && translated !== key ? translated : fallback,
      };
    }
    const warningAt = Number(config.warning_segments);
    const secondsPerSegment = Number(
      genType === "Video"
        ? config.estimated_seconds_per_video
        : config.estimated_seconds_per_image,
    );
    if (Number.isFinite(warningAt) && prompts.length >= warningAt) {
      const minutes =
        Number.isFinite(secondsPerSegment) && secondsPerSegment > 0
          ? Math.max(1, Math.ceil((prompts.length * secondsPerSegment) / 60))
          : null;
      const message =
        window.I18n?.t?.("gen.chainLongWarning", {
          count: prompts.length,
          minutes: minutes || "?",
        }) ||
        `This chain has ${prompts.length} segments and may take about ${minutes || "?"} minutes. Continue?`;
      const confirmed = window.customDialog?.confirm
        ? await window.customDialog.confirm(message, {
            title: window.I18n?.t?.("gen.chainLongTitle") || "Long chain",
            type: "warning",
          })
        : window.confirm(message);
      if (!confirmed) return { ok: false, silent: true, message: "" };
    }
    if (parseInt(_GenTab.quantitySelect?.value, 10) !== 1) {
      return {
        ok: false,
        message:
          window.I18n?.t?.("gen.chainQuantityOne") ||
          "Chain mode requires quantity 1.",
      };
    }
    if (
      genType === "Video" &&
      _GenTab.videoInputTypeSelect?.value !== "Frames" &&
      String(_GenTab.fileIdsInput?.value || "").trim()
    ) {
      return {
        ok: false,
        message:
          window.I18n?.t?.("gen.chainVideoFramesOnly") ||
          "Video chain supports text-to-video or Frames input.",
      };
    }
    const settings = window.storageSettings?.getSettings?.() || {};
    const apiEnabled =
      settings.apiModeEnabled === true ||
      settings.apiModeEnabled === "true" ||
      settings.apiModeEnabled === 1;
    const storedMode = settings.defaultGenMode || settings.gen_mode || "ui";
    const serverApiDisabled =
      window.SystemConfig?.get?.("flow_api_driver", null) === "disabled";
    const requestedMode =
      confirmedFlowExecutionMode === "web" || serverApiDisabled
        ? "web"
        : storedMode === "ui"
          ? "web"
          : storedMode;
    const componentState = _GenTab._flowWebOnlyComponentState(prompts, genType);
    const componentChecks = componentState.checks;
    const hasUnsupportedApiComponents = componentState.hasWebOnlyComponents;
    const apiAllowed =
      apiCapability &&
      apiEnabled &&
      window.featureGate?.canUse?.("flow_api_enabled") &&
      !hasUnsupportedApiComponents;
    let bridgeReady = false;
    if (apiAllowed && requestedMode !== "web") {
      try {
        const status = await window.FlowApiSessionCoordinator?.check?.({
          surface: "gen",
          mediaType: genType === "Video" ? "video" : "image",
          force: true,
          passive: true,
        });
        bridgeReady = status?.ready === true;
      } catch (_) {
        bridgeReady = false;
      }
    }
    const resolvedChain = (engine, reason, allowWebFallback = false) => {
      console.log(
        "[GenChainRoute]",
        JSON.stringify({
          requestedMode,
          engine,
          reason,
          kind: chain.kind,
          segments: prompts.length,
          apiCapability,
          webCapability,
          apiEnabled,
          apiAllowed: !!apiAllowed,
          bridgeReady,
          hasUnsupportedApiComponents,
          componentChecks,
          allowWebFallback,
        }),
      );
      return { ok: true, chain: { ...chain, engine, allowWebFallback } };
    };
    if (requestedMode === "web") {
      if (!webCapability)
        return {
          ok: false,
          message:
            window.I18n?.t?.("gen.chainWebUnavailable") ||
            "Web chain generation is unavailable.",
        };
      return resolvedChain(
        "web",
        serverApiDisabled ? "SYSTEM_DRIVER_DISABLED" : "user_selected_web",
      );
    }
    if (requestedMode === "api") {
      if (!apiAllowed) {
        const key = hasUnsupportedApiComponents
          ? "gen.chainUnsupportedComponents"
          : "gen.chainApiRequired";
        return {
          ok: false,
          message:
            window.I18n?.t?.(key) ||
            "Flow API chain is unavailable for the current settings.",
        };
      }
      if (!bridgeReady)
        return {
          ok: false,
          message:
            window.I18n?.t?.("gen.chainBridgeRequired") ||
            "TobyBridge and an open Flow tab are required.",
        };
      return resolvedChain("api", "user_selected_api");
    }
    if (requestedMode === "auto") {
      if (apiAllowed && bridgeReady)
        return resolvedChain("api", "auto_api_ready", webCapability);
      if (webCapability)
        return resolvedChain(
          "web",
          !apiCapability
            ? "api_chain_disabled"
            : !apiEnabled
              ? "api_toggle_off"
              : hasUnsupportedApiComponents
                ? "unsupported_api_components"
                : !apiAllowed
                  ? "api_feature_unavailable"
                  : "api_session_not_ready",
        );
      return {
        ok: false,
        message:
          window.I18n?.t?.("gen.chainUnavailable") ||
          "Flow chain generation is unavailable.",
      };
    }
    return {
      ok: false,
      message:
        window.I18n?.t?.("gen.chainUnavailable") ||
        "Flow chain generation is unavailable.",
    };
  }
  static _showProviderErrorNotification(provider, errorCode, message = "") {
    if (typeof window.showNotification !== "function") return;
    const providerName =
      provider === "chatgpt"
        ? "ChatGPT"
        : provider === "grok"
          ? "Grok"
          : provider === "gemini"
            ? "Gemini"
            : provider === "muse"
              ? "Muse"
              : "Flow";
    const t = window.I18n?.t?.bind(window.I18n) || ((k) => null);
    const errorKeyMap = {
      RATE_LIMIT: "rateLimit",
      CONTENT_BLOCKED: "contentBlocked",
      IMAGE_GEN_FAILED: "imageGenFailed",
      TEXT_ONLY: "textOnly",
      NETWORK: "network",
      SUBSCRIPTION_REQUIRED: "subscriptionRequired",
      LIMIT_ALERT: "limitAlert",
      TIMEOUT: "timeout",
      CHALLENGE_TIMEOUT: "challengeTimeout",
      GENERATION_FAILED: "imageGenFailed",
    };
    const fallbackMessages = {
      RATE_LIMIT:
        "\u0110\xE3 h\u1EBFt l\u01B0\u1EE3t t\u1EA1o \u1EA3nh. Vui l\xF2ng th\u1EED l\u1EA1i sau.",
      CONTENT_BLOCKED:
        "N\u1ED9i dung b\u1ECB ch\u1EB7n do vi ph\u1EA1m ch\xEDnh s\xE1ch.",
      IMAGE_GEN_FAILED:
        "Kh\xF4ng th\u1EC3 t\u1EA1o \u1EA3nh. Vui l\xF2ng th\u1EED l\u1EA1i.",
      TEXT_ONLY:
        "Ch\u1EC9 nh\u1EADn \u0111\u01B0\u1EE3c text thay v\xEC \u1EA3nh.",
      NETWORK: "L\u1ED7i k\u1EBFt n\u1ED1i m\u1EA1ng.",
      SUBSCRIPTION_REQUIRED:
        "C\u1EA7n \u0111\u0103ng k\xFD g\xF3i tr\u1EA3 ph\xED \u0111\u1EC3 s\u1EED d\u1EE5ng.",
      LIMIT_ALERT:
        "\u0110\xE3 h\u1EBFt quota t\u1EA1o \u1EA3nh mi\u1EC5n ph\xED.",
      TIMEOUT: "H\u1EBFt th\u1EDDi gian ch\u1EDD ph\u1EA3n h\u1ED3i.",
      CHALLENGE_TIMEOUT:
        "C\u1EA7n x\xE1c minh captcha. Vui l\xF2ng m\u1EDF tab v\xE0 x\xE1c minh.",
      GENERATION_FAILED:
        "Kh\xF4ng th\u1EC3 t\u1EA1o n\u1ED9i dung. Vui l\xF2ng th\u1EED l\u1EA1i.",
    };
    const i18nKey = errorKeyMap[errorCode];
    const i18nMsg = i18nKey ? t(`errors.${i18nKey}`) : null;
    const providerMessage = typeof message === "string" ? message.trim() : "";
    const baseMsg =
      provider === "muse" && providerMessage
        ? providerMessage
        : i18nMsg || fallbackMessages[errorCode] || errorCode;
    const displayMsg = `${providerName}: ${baseMsg}`;
    window.showNotification(displayMsg, "error", 5e3);
    if (window.eventBus) {
      window.eventBus.emit("provider:error", {
        provider,
        errorCode,
        message: displayMsg,
      });
    }
    console.warn(
      `[GenTab] Provider error: ${provider} - ${errorCode}`,
      message,
    );
  }
  static _renderApiRefValidation() {
    const preview = _GenTab.fileIdThumbnails;
    if (!preview) return;
    const isFlow =
      _GenTab.providerSelect?.value === "flow" &&
      window.FlowApiAdapter?.isApiModeIntended?.() === true;
    const t = (key, params) => {
      const text = window.I18n?.t?.(key, params);
      return text && text !== key ? text : "";
    };
    for (const thumb of preview.querySelectorAll(".ref-thumb[data-file-id]")) {
      thumb.querySelector(".gen-api-ref-status")?.remove();
      thumb.classList.remove("gen-api-ref-invalid");
      const entry = isFlow
        ? _GenTab._apiRefValidation.get(thumb.dataset.fileId)
        : null;
      if (entry?.status !== "other_project") continue;
      const label = t("gen.apiRefOtherProject");
      if (!label) continue;
      thumb.classList.add("gen-api-ref-invalid");
      const badge = document.createElement("span");
      badge.className = "gen-api-ref-status";
      badge.textContent = label;
      badge.title = label;
      thumb.appendChild(badge);
    }
    const ids = (_GenTab.fileIdsInput?.value || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const entries = isFlow
      ? ids.map((id) => _GenTab._apiRefValidation.get(id)).filter(Boolean)
      : [];
    const invalid = entries.filter(
      (entry) => entry.status === "other_project",
    ).length;
    let note = preview.parentElement?.querySelector(
      ".gen-api-ref-validation-note",
    );
    if (!note && invalid) {
      note = document.createElement("div");
      note.className = "gen-api-ref-validation-note";
      note.setAttribute("role", "status");
      note.setAttribute("aria-live", "polite");
      preview.after(note);
    }
    if (note) {
      note.textContent = invalid ? t("gen.apiRefOtherProject") : "";
      note.hidden = !note.textContent;
    }
  }
  static _bindPromptResizer() {
    const textarea = _GenTab.promptsArea;
    if (!textarea || document.getElementById("genPromptResizer")) return;
    const handle = document.createElement("div");
    handle.id = "genPromptResizer";
    handle.className = "gen-prompt-resizer";
    handle.tabIndex = 0;
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-orientation", "horizontal");
    handle.setAttribute("aria-label", "Resize prompt");
    handle.setAttribute("aria-valuemin", "180");
    handle.setAttribute("aria-valuemax", "600");
    const height = () => textarea.getBoundingClientRect().height || 180;
    handle.setAttribute("aria-valuenow", String(Math.round(height())));
    let drag = null;
    const resize = (value) => {
      const next = Math.round(Math.max(180, Math.min(600, value)));
      textarea.style.height = `${next}px`;
      handle.setAttribute("aria-valuenow", String(next));
    };
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || textarea.disabled || textarea.readOnly) return;
      event.preventDefault();
      event.stopPropagation();
      drag = { id: event.pointerId, y: event.clientY, height: height() };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener("pointermove", (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      resize(drag.height + event.clientY - drag.y);
    });
    const end = (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      drag = null;
      if (handle.hasPointerCapture(event.pointerId))
        handle.releasePointerCapture(event.pointerId);
    };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
    handle.addEventListener("lostpointercapture", () => {
      drag = null;
    });
    handle.addEventListener("keydown", (event) => {
      if (
        textarea.disabled ||
        textarea.readOnly ||
        !["ArrowUp", "ArrowDown"].includes(event.key)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      resize(height() + (event.key === "ArrowDown" ? 20 : -20));
    });
    textarea.after(handle);
  }
  static init() {
    console.log("[TobyFlow] GenTab.init()");
    window.showProviderError =
      _GenTab._showProviderErrorNotification.bind(_GenTab);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.af_settings) {
        _GenTab._settingsCache = changes.af_settings.newValue || {};
        const previousGeminiVideoRatio =
          changes.af_settings.oldValue?.geminiVideoRatio;
        const nextGeminiVideoRatio =
          changes.af_settings.newValue?.geminiVideoRatio;
        if (previousGeminiVideoRatio !== nextGeminiVideoRatio) {
          _GenTab._geminiRatioSelections.video = null;
          const provider =
            document.getElementById("genProvider")?.value || "flow";
          if (
            provider === "gemini" &&
            _GenTab.genTypeSelect?.value === "Video"
          ) {
            try {
              _GenTab._renderGeminiRatioOptions();
            } catch (_) {}
          }
        }
        try {
          _GenTab._syncDownloadVisibility?.();
        } catch (_) {}
      }
    });
    _GenTab.promptsArea = document.getElementById("promptsArea");
    _GenTab._bindPromptResizer();
    if (!_GenTab._apiRefValidationBound && window.eventBus) {
      _GenTab._apiRefValidationBound = true;
      window.eventBus.on(
        "gen:api_ref_validation",
        ({ projectId, entries } = {}) => {
          if (_GenTab._apiRefValidationProject !== projectId)
            _GenTab._apiRefValidation.clear();
          _GenTab._apiRefValidationProject = projectId;
          for (const entry of entries || [])
            _GenTab._apiRefValidation.set(entry.fileId, entry);
          _GenTab._renderApiRefValidation();
        },
      );
    }
    _GenTab.multiPromptCheck = document.getElementById("multiPromptCheck");
    _GenTab.quantitySelect = document.getElementById("quantitySelect");
    try {
      _GenTab.updateQuantityOptions();
    } catch (_) {}
    try {
      _GenTab._bindQuantityButtons();
    } catch (_) {}
    _GenTab.delayBetweenInput = null;
    _GenTab.promptCountSpan = document.getElementById("promptCount");
    _GenTab.fileIdsInput = document.getElementById("fileIds");
    _GenTab.genTypeSelect = document.getElementById("genType");
    _GenTab.aspectRatioSelect = document.getElementById("aspectRatio");
    _GenTab.aspectRatioSelect?.addEventListener("change", () =>
      _GenTab._rememberProviderRatioSelection(),
    );
    _GenTab.imageModelContainer = document.getElementById(
      "imageModelContainer",
    );
    _GenTab.videoModelContainer = document.getElementById(
      "videoModelContainer",
    );
    _GenTab.imageModelSelect = document.getElementById("imageModel");
    _GenTab.videoModelSelect = document.getElementById("videoModel");
    _GenTab.chatgptModelSelect = document.getElementById("chatgptModel");
    _GenTab.geminiModelSelect = document.getElementById("geminiModel");
    _GenTab.museModelSelect = document.getElementById("museModel");
    try {
      _GenTab._initMentionMenu();
    } catch (e) {
      console.warn("[GenTab] MentionMenu init failed:", e.message);
    }
    try {
      _GenTab.updateModelOptions();
    } catch (_) {}
    _GenTab.videoInputTypeContainer = document.getElementById(
      "videoInputTypeContainer",
    );
    _GenTab.videoInputTypeSelect = document.getElementById("videoInputType");
    _GenTab.flowVideoDurationContainer = document.getElementById(
      "flowVideoDurationContainer",
    );
    _GenTab.flowVideoDurationSelect =
      document.getElementById("flowVideoDuration");
    _GenTab.flowVideoResolutionContainer = document.getElementById(
      "flowVideoResolutionContainer",
    );
    _GenTab.flowVideoResolutionSelect = document.getElementById(
      "flowVideoResolution",
    );
    try {
      _GenTab.updateFlowVideoDurationOptions();
    } catch (_) {}
    try {
      _GenTab.updateFlowVideoResolutionOptions();
    } catch (_) {}
    _GenTab.refImagesSection = document.getElementById("refImagesSection");
    _GenTab.startBtn = document.getElementById("startBtn");
    _GenTab.stopBtn = document.getElementById("stopBtn");
    _GenTab.pauseBtn = document.getElementById("pauseBtn");
    _GenTab.genRunningControls = document.getElementById("genRunningControls");
    _GenTab.genBtnRow = document.getElementById("genBtnRow");
    _GenTab.inputTimeoutInput = null;
    _GenTab.fileIdThumbnails = document.getElementById("refImagesPreview");
    _GenTab.videoFramesSection = document.getElementById("videoFramesSection");
    _GenTab.chainSection = document.getElementById("genChainSection");
    _GenTab.chainToggle = document.getElementById("genChainToggle");
    _GenTab.chainPolicy = document.getElementById("genChainPolicy");
    _GenTab.chainToggle?.addEventListener("change", () =>
      _GenTab._updateChainUI(),
    );
    _GenTab.addonPromptSelect = document.getElementById("addonPromptSelect");
    _GenTab.genRunModeBtn = document.getElementById("genRunModeBtn");
    _GenTab.refImageModeSelect = document.getElementById("refImageMode");
    _GenTab.mentionHelper = document.getElementById("mentionHelper");
    _GenTab.mentionHelperTags = document.getElementById("mentionHelperTags");
    _GenTab.saveToAlbumBtn = document.getElementById("saveToAlbumBtn");
    _GenTab.saveState = debounce(_GenTab._saveStateImmediate, 500);
    if (window.eventBus) {
      window.eventBus.on("execution:lock_changed", (state) => {
        _GenTab._updateLockBanner(state);
      });
      window.eventBus.on("upload:started", () => {
        _GenTab.renderFileIdThumbnails();
        _GenTab._renderPerPromptFrames(_GenTab._getPromptCount());
        _GenTab._renderFramePreviews();
        _GenTab._renderFrameSourcePanel();
        _GenTab._updateGenBtnUploadState();
      });
      window.eventBus.on("upload:stage", (data) => {
        if (!data?.key || !data?.stage) return;
        _GenTab._uploadStages.set(data.key, data.stage);
        _GenTab.renderFileIdThumbnails();
        _GenTab._updateGenBtnUploadState();
      });
      window.eventBus.on("upload:completed", (data) => {
        if (!data?.key || !data?.tile_id) return;
        _GenTab._uploadStages.delete(data.key);
        _GenTab._syncUploadKeyToTileId(data);
        _GenTab._handleFrameUploadCompleted(data);
        _GenTab._handlePerPromptFrameUploadCompleted(data);
        _GenTab._updateGenBtnUploadState();
      });
      window.eventBus.on("upload:failed", (data) => {
        if (data?.key) _GenTab._uploadStages.delete(data.key);
        _GenTab.renderFileIdThumbnails();
        _GenTab._handleFrameUploadFailed(data);
        _GenTab._handlePerPromptFrameUploadFailed(data);
        _GenTab._renderFrameSourcePanel();
        _GenTab._updateGenBtnUploadState();
      });
      window.eventBus.on("upload:cancelled", (data) => {
        if (data?.key) _GenTab._uploadStages.delete(data.key);
        _GenTab.renderFileIdThumbnails();
        _GenTab._handleFrameUploadFailed(data);
        _GenTab._handlePerPromptFrameUploadFailed(data);
        _GenTab._renderFrameSourcePanel();
        _GenTab._updateGenBtnUploadState();
      });
      window.eventBus.on("upload:pending", () => {
        _GenTab.renderFileIdThumbnails();
        _GenTab._renderPerPromptFrames(_GenTab._getPromptCount());
        _GenTab._renderFramePreviews();
        _GenTab._updateGenBtnUploadState();
      });
    }
    _GenTab._thumbObserver = new MutationObserver(
      debounce(_GenTab.checkMissingThumbnails, 1e3),
    );
    _GenTab._thumbObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
    const clearAllRefs = document.getElementById("clearAllGenRefsBtn");
    if (clearAllRefs)
      clearAllRefs.onclick = () => _GenTab._clearAllReferences();
    if (_GenTab.fileIdsInput) {
      _GenTab.fileIdsInput.addEventListener("input", () => {
        _GenTab.saveState();
        _GenTab.renderFileIdThumbnails();
        if (_GenTab.videoInputTypeSelect?.value === "Frames") {
          _GenTab._renderFrameSourcePanel();
          if (_GenTab.multiPromptCheck?.checked) {
            _GenTab._renderPerPromptFrames(_GenTab._getPromptCount());
          }
        }
        if (_GenTab.refImageMode === "mention") {
          _GenTab._refreshMentionHelper();
        }
        _GenTab._updateChainUI();
        if (_GenTab.providerSelect?.value === "grok")
          _GenTab.updateGrokFrameControls();
      });
    }
    if (_GenTab.genRunModeBtn) {
      _GenTab.genRunModeBtn.addEventListener("click", () => {
        _GenTab._toggleRunMode();
      });
      _GenTab._updateRunModeUI();
    }
    if (_GenTab.refImageModeSelect) {
      _GenTab.refImageModeSelect.addEventListener("change", () => {
        _GenTab.refImageModeSelect.dataset.userSet = "true";
        _GenTab.refImageMode = _GenTab.refImageModeSelect.value;
        _GenTab._updateRefModeUI();
        try {
          _GenTab.renderFileIdThumbnails();
        } catch (e) {}
        if (_GenTab.refImageMode !== "mention") {
          try {
            _GenTab._hideAutocomplete?.();
          } catch (e) {}
        }
        _GenTab.saveState();
      });
    }
    document
      .getElementById("refImagesPerPrompt")
      ?.addEventListener("change", (event) => {
        _GenTab.refImagesPerPrompt = window.RefImageAssignment.count(
          event.target.value,
        );
        _GenTab._updateRefModeUI();
        _GenTab.updatePromptCount();
        _GenTab.saveState();
      });
    for (const [suffix, step] of [
      ["Minus", -1],
      ["Plus", 1],
    ]) {
      document
        .getElementById("refImagesPerPrompt" + suffix)
        ?.addEventListener("click", () => {
          const input = document.getElementById("refImagesPerPrompt");
          input.value = Math.max(
            1,
            window.RefImageAssignment.count(input.value) + step,
          );
          input.dispatchEvent(new Event("change"));
        });
    }
    if (_GenTab.promptsArea) {
      const onPromptsChange = () => {
        if (
          _GenTab.multiPromptCheck?.checked &&
          _GenTab.refImageMode === "sequential"
        ) {
          try {
            _GenTab.renderFileIdThumbnails();
          } catch (e) {}
        }
      };
      _GenTab.promptsArea.addEventListener("input", onPromptsChange);
      _GenTab.promptsArea.addEventListener("paste", () =>
        setTimeout(onPromptsChange, 10),
      );
    }
    if (_GenTab.multiPromptCheck) {
      _GenTab.multiPromptCheck.addEventListener("change", () => {
        try {
          _GenTab.renderFileIdThumbnails();
        } catch (e) {}
      });
    }
    if (_GenTab.saveToAlbumBtn) {
      _GenTab.saveToAlbumBtn.addEventListener("click", () => {
        _GenTab._saveRefImagesToAlbum();
      });
    }
    _GenTab._bindRefQuickTabs();
    const genTabAutoDownload = document.getElementById("genTabAutoDownload");
    const genTabDownloadRes = document.getElementById(
      "genTabDownloadResolution",
    );
    const genTabVideoDownloadRes = document.getElementById(
      "genTabVideoDownloadResolution",
    );
    const genTabDownloadResWrap = document.getElementById(
      "genTabDownloadResWrap",
    );
    const genTabVideoDownloadResWrap = document.getElementById(
      "genTabVideoDownloadResWrap",
    );
    const genTabSubFolder = document.getElementById("genTabSubFolder");
    if (genTabAutoDownload && genTabDownloadRes) {
      _GenTab._wmOverride = _GenTab._wmOverride || {};
      if (!_GenTab._wmOvBound) {
        _GenTab._wmOvBound = true;
        const _loadOv = () => {
          try {
            chrome.storage.local.get(["toby_gentab_state"], (r) => {
              _GenTab._wmOverride = r?.toby_gentab_state?.wmOverride || {};
              try {
                _GenTab._syncWatermarkPills?.(
                  document.getElementById("genMediaType")?.value === "video",
                );
              } catch (_) {}
            });
          } catch (_) {}
        };
        _loadOv();
        try {
          chrome.storage.onChanged.addListener((ch, area) => {
            if (area !== "local") return;
            if (ch.toby_gentab_state)
              _GenTab._wmOverride =
                ch.toby_gentab_state.newValue?.wmOverride || {};
            if (ch.af_settings) {
              _GenTab._wmOverride = {};
              chrome.storage.local.get(["toby_gentab_state"], (r) => {
                const st2 = r?.toby_gentab_state || {};
                delete st2.wmOverride;
                chrome.storage.local.set({ toby_gentab_state: st2 });
              });
            }
          });
        } catch (_) {}
      }
      _GenTab._syncWatermarkPills = async (isVideo) => {
        try {
          const sysOn =
            window.SystemConfig?.getBool?.("remove_watermark_enabled") === true;
          const providerKey =
            document.getElementById("genProvider")?.value || "flow";
          const supportsWatermarkRemoval =
            providerKey === "flow" || providerKey === "gemini";
          const st = await _GenTab._getSettings();
          const dlOn = !!document.getElementById("genTabAutoDownload")?.checked;
          const row = document.getElementById("genTabWatermarkRow");
          const watermarkAvailable = supportsWatermarkRemoval && sysOn && dlOn;
          if (row) row.classList.toggle("hidden", !watermarkAvailable);
          [
            ["genTabWatermarkWrap", "genTabWatermarkPill", false],
            ["genTabWatermarkVideoWrap", "genTabWatermarkVideoPill", true],
          ].forEach(([wrapId, inputId, forVideo]) => {
            const wrap = document.getElementById(wrapId);
            const input = document.getElementById(inputId);
            if (!wrap || !input) return;
            const show = watermarkAvailable && forVideo === !!isVideo;
            wrap.classList.toggle("hidden", !show);
            if (!show) return;
            const key = forVideo
              ? "video_remove_watermark_enabled"
              : "image_remove_watermark_enabled";
            const can = window.featureGate?.canUse?.(key) ?? false;
            const setKey = forVideo
              ? "autoRemoveWatermarkVideo"
              : "autoRemoveWatermark";
            const ov = _GenTab._wmOverride?.[setKey];
            const v = ov === void 0 ? st[setKey] : ov;
            wrap.classList.toggle("locked", !can);
            input.checked = can && (v === true || v === "1" || v === 1);
            input.dataset.wmKey = setKey;
            input.dataset.wmCan = can ? "1" : "0";
            const crown = wrap.querySelector(".settings-tab-crown");
            if (crown) {
              const quyenSanSang = !!window.authManager?.isInitialized;
              crown.classList.toggle("hidden", can || !quyenSanSang);
            }
          });
          try {
            const resSel = document.getElementById(
              isVideo
                ? "genTabVideoDownloadResolution"
                : "genTabDownloadResolution",
            );
            if (resSel) {
              resSel.disabled = false;
              resSel.classList.remove("wm-res-warn");
              resSel.removeAttribute("data-i18n-tooltip");
              if (resSel.dataset.wmBaseTip)
                resSel.setAttribute("data-tooltip", resSel.dataset.wmBaseTip);
              else resSel.removeAttribute("data-tooltip");
              if (resSel.dataset.wmBaseTitle !== void 0)
                resSel.title = resSel.dataset.wmBaseTitle;
            }
          } catch (_) {}
          console.log(
            `[GenTab] toggle watermark: admin=${sysOn} autoDownload=${dlOn} mode=${isVideo ? "video" : "image"} b\u1EADt=${!!document.getElementById(isVideo ? "genTabWatermarkVideoPill" : "genTabWatermarkPill")?.checked}`,
          );
        } catch (e) {
          console.warn("[GenTab] toggle watermark:", e?.message);
        }
      };
      ["genTabWatermarkPill", "genTabWatermarkVideoPill"].forEach((id) => {
        const input = document.getElementById(id);
        if (!input || input.dataset.wmBound === "1") return;
        input.dataset.wmBound = "1";
        input.addEventListener("click", (e) => {
          if (input.dataset.wmCan !== "1") {
            e.preventDefault();
            try {
              chrome.runtime.sendMessage({
                action: "openSettings",
                tab: "ai-platform",
              });
            } catch (_) {}
          }
        });
        input.addEventListener("change", () => {
          if (input.dataset.wmCan !== "1") {
            input.checked = false;
            return;
          }
          try {
            const k = input.dataset.wmKey;
            chrome.storage.local.get(["toby_gentab_state"], (r) => {
              const st = r?.toby_gentab_state || {};
              st.wmOverride = {
                ...(st.wmOverride || {}),
                [k]: !!input.checked,
              };
              chrome.storage.local.set({ toby_gentab_state: st });
            });
          } catch (err) {
            console.warn(
              "[GenTab] kh\xF4ng l\u01B0u \u0111\u01B0\u1EE3c toggle watermark:",
              err?.message,
            );
          }
        });
      });
      if (!_GenTab._wmGateBound) {
        _GenTab._wmGateBound = true;
        const _repaintWmPills = () => {
          try {
            _GenTab._syncWatermarkPills?.(
              _GenTab.genTypeSelect?.value === "Video",
            );
          } catch (_) {}
        };
        try {
          window.eventBus?.on?.("featuregate:refreshed", _repaintWmPills);
        } catch (_) {}
        try {
          window.eventBus?.on?.("plan:changed", _repaintWmPills);
        } catch (_) {}
      }
      _GenTab._syncDownloadVisibility = () => {
        const toggle = document.getElementById("genTabAutoDownload");
        const subFolderWrap = document.getElementById("genTabSubFolderWrap");
        const resWrap = document.getElementById("genTabDownloadResWrap");
        const videoResWrap = document.getElementById(
          "genTabVideoDownloadResWrap",
        );
        const isVideo = _GenTab.genTypeSelect?.value === "Video";
        _GenTab._syncWatermarkPills(isVideo);
        const providerKey =
          document.getElementById("genProvider")?.value || "flow";
        const isChatGPT = providerKey === "chatgpt";
        const isGrok = providerKey === "grok";
        const isGemini = providerKey === "gemini";
        const isMuse = providerKey === "muse";
        if (toggle?.checked) {
          if (subFolderWrap) subFolderWrap.classList.remove("hidden");
          if (isChatGPT || isGrok || isGemini || isMuse) {
            if (resWrap) resWrap.classList.add("hidden");
            if (videoResWrap) videoResWrap.classList.add("hidden");
          } else if (isVideo) {
            if (resWrap) resWrap.classList.add("hidden");
            if (videoResWrap) videoResWrap.classList.remove("hidden");
          } else {
            if (resWrap) resWrap.classList.remove("hidden");
            if (videoResWrap) videoResWrap.classList.add("hidden");
          }
        } else {
          if (subFolderWrap) subFolderWrap.classList.add("hidden");
          if (resWrap) resWrap.classList.add("hidden");
          if (videoResWrap) videoResWrap.classList.add("hidden");
        }
      };
      const syncResVisibility = _GenTab._syncDownloadVisibility;
      try {
        _GenTab.updateDownloadResolutionOptions();
      } catch (_) {}
      const loadDefaultResolution = () => {
        _GenTab._getSettings().then((settings) => {
          if (
            settings.downloadResolution &&
            !genTabDownloadRes.dataset.userSet
          ) {
            genTabDownloadRes.value = settings.downloadResolution;
          }
          if (
            settings.videoDownloadResolution &&
            genTabVideoDownloadRes &&
            !genTabVideoDownloadRes.dataset.userSet
          ) {
            genTabVideoDownloadRes.value = settings.videoDownloadResolution;
          }
        });
      };
      genTabAutoDownload.addEventListener("change", () => {
        syncResVisibility();
        if (genTabAutoDownload.checked) {
          loadDefaultResolution();
        }
        _GenTab.saveState();
      });
      genTabDownloadRes.addEventListener("change", () => {
        genTabDownloadRes.dataset.userSet = "1";
        _GenTab.saveState();
      });
      if (genTabVideoDownloadRes) {
        genTabVideoDownloadRes.addEventListener("change", () => {
          genTabVideoDownloadRes.dataset.userSet = "1";
          _GenTab.saveState();
        });
      }
      if (genTabSubFolder) {
        genTabSubFolder.addEventListener("change", () => _GenTab.saveState());
      }
      const genDlSettingsGear = document.getElementById("genDlSettingsGear");
      if (genDlSettingsGear) {
        genDlSettingsGear.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          try {
            chrome.runtime.sendMessage({ action: "openSettings" });
          } catch (_) {}
        });
      }
      loadDefaultResolution();
      syncResVisibility();
      if (_GenTab.genTypeSelect) {
        _GenTab.genTypeSelect.addEventListener("change", syncResVisibility);
      }
    }
    const openImagePickerBtn = document.getElementById("openImagePickerBtn");
    if (openImagePickerBtn) {
      openImagePickerBtn.addEventListener("click", () => {
        const selectedProvider = (
          _GenTab.providerSelect?.value || "flow"
        ).toLowerCase();
        if (
          (selectedProvider === "chatgpt" ||
            selectedProvider === "gemini" ||
            selectedProvider === "muse") &&
          !window.featureGate?.canUseProviderRefImages?.(selectedProvider)
        ) {
          window.openUpgradeModal?.();
          return;
        }
        const existingIds = (_GenTab.fileIdsInput?.value || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (window.imagePickerModal) {
          const cgOpts = _GenTab._imagePickerModalOptions || {};
          const frameSourcePick = _GenTab._frameSourcePickerRequested === true;
          _GenTab._frameSourcePickerRequested = false;
          const refLimit = frameSourcePick ? Infinity : _GenTab.getRefLimit();
          if (!frameSourcePick && _GenTab.refImageMode === "none") {
            console.log("[GenTab] ref_mode=none, picker disabled");
            return;
          }
          const _gtCurrentProvider = (
            _GenTab.providerSelect?.value || "flow"
          ).toLowerCase();
          const _gtIsVideo = _GenTab.genTypeSelect?.value === "Video";
          const _gtModelValue =
            _gtCurrentProvider === "grok"
              ? document.getElementById("grokModel")?.value
              : _gtIsVideo
                ? _GenTab.videoModelSelect?.value || ""
                : _GenTab.imageModelSelect?.value || "";
          const _gtMediaType = _gtIsVideo ? "video" : "image";
          const _gtInputType = _gtIsVideo
            ? _gtCurrentProvider === "grok"
              ? document.getElementById("grokVideoInputType")?.value
              : _GenTab.videoInputTypeSelect?.value
            : void 0;
          const _gtDuration = _gtIsVideo
            ? _GenTab.flowVideoDurationSelect?.value || void 0
            : void 0;
          const _gtCaps =
            _gtCurrentProvider === "flow" &&
            typeof ImagePickerModal !== "undefined" &&
            ImagePickerModal.resolveCapsMulti
              ? ImagePickerModal.resolveCapsMulti({
                  provider: "flow",
                  mode: _gtMediaType,
                  isFrames: _gtInputType === "Frames",
                  modelValue: _gtModelValue,
                  duration: _gtDuration,
                })
              : { image: null, video: 0, total: null };
          const _gtExistingTypes = {};
          const _gtExistingMedia = {};
          for (const id of existingIds) {
            const type = _GenTab.refMediaTypes?.[id] || "image";
            if (type === "video") _gtExistingTypes[id] = "video";
            _gtExistingMedia[id] = {
              thumbnail: _GenTab.thumbnailCache?.[id] || "",
              source_thumbnail: _GenTab.thumbnailCache?.[id] || "",
              video_url: _GenTab.refVideoUrls?.[id] || "",
              file_name: _GenTab.fileNameCache?.[id] || "",
              media_uuid: _GenTab.mediaUuidCache?.[id] || "",
              persistent_media_id: _GenTab.fileNameCache?.[id] || "",
              identity_durability: _GenTab.fileNameCache?.[id]
                ? type === "video" &&
                  !/^[A-Za-z0-9_-]{32,1024}$/.test(
                    String(_GenTab.fileNameCache[id]),
                  )
                  ? "session"
                  : "durable"
                : "",
              type,
            };
          }
          window.imagePickerModal.open({
            refAuditContext: { surface: "gen" },
            refImagesPerPrompt:
              !frameSourcePick && _GenTab.refImageMode === "sequential"
                ? _GenTab.refImagesPerPrompt
                : null,
            existingFileIds: existingIds,
            existingFileTypes: _gtExistingTypes,
            existingMedia: _gtExistingMedia,
            mediaFilter: "image",
            allowVideo:
              !frameSourcePick &&
              _gtCurrentProvider === "flow" &&
              window.ProviderRegistry?.get?.("flow")?.supportsRefVideo?.(
                _gtModelValue,
              ) === true,
            hideFlowTilePicker: cgOpts.hideFlowTilePicker || false,
            maxSelections: refLimit === Infinity ? null : refLimit,
            maxImageSelections: refLimit === Infinity ? null : refLimit,
            maxVideoSelections: frameSourcePick ? 0 : _gtCaps.video || 0,
            maxTotalSelections: frameSourcePick
              ? refLimit === Infinity
                ? null
                : refLimit
              : _GenTab.refImageMode === "mention"
                ? null
                : _GenTab.refImageMode === "sequential"
                  ? refLimit
                  : _gtCaps.total,
            noRefSupportContext:
              refLimit === 0
                ? {
                    provider: _gtCurrentProvider,
                    modelValue: _gtModelValue,
                    mediaType: _gtMediaType,
                    inputType: _gtInputType,
                    duration: _gtDuration,
                  }
                : null,
            onConfirm: async (images) => {
              if (!_GenTab.fileIdsInput) return;
              const existingIds2 = _GenTab.fileIdsInput.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              const newIds = [];
              const resolvedSelection = new Map();
              if (!window.pendingUploadFiles)
                window.pendingUploadFiles = new Map();
              const albumImages = images.filter(
                (img) => img.source === "album",
              );
              const otherImages = images.filter(
                (img) => img.source !== "album",
              );
              for (const img of otherImages) {
                if (img.source === "upload" && img.file) {
                  const key =
                    img.fileId ||
                    `upload_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                  const _baseName = String(
                    img.name || img.file_name || img.file?.name || "",
                  ).replace(/\.[^/.]+$/, "");
                  window.pendingUploadFiles.set(key, {
                    file: img.file,
                    thumbnail: img.thumbnail,
                    name: _baseName || void 0,
                  });
                  if (img.thumbnail)
                    _GenTab.thumbnailCache[key] = img.thumbnail;
                  if (_baseName) _GenTab.refImageNames[key] = _baseName;
                  newIds.push(key);
                  resolvedSelection.set(img, key);
                  _GenTab.refMediaTypes = _GenTab.refMediaTypes || {};
                  _GenTab.refMediaTypes[key] = img.type || "image";
                  _GenTab.refVideoUrls = _GenTab.refVideoUrls || {};
                  if (img.video_url) _GenTab.refVideoUrls[key] = img.video_url;
                } else if (img.fileId) {
                  newIds.push(img.fileId);
                  resolvedSelection.set(img, img.fileId);
                  if (img.file_name) {
                    _GenTab.fileNameCache[img.fileId] = img.file_name;
                  }
                  if (img.media_uuid) {
                    _GenTab.mediaUuidCache = _GenTab.mediaUuidCache || {};
                    _GenTab.mediaUuidCache[img.fileId] = img.media_uuid;
                  }
                  if (img.thumbnail) {
                    _GenTab.thumbnailCache[img.fileId] = img.thumbnail;
                  }
                  _GenTab.refMediaTypes = _GenTab.refMediaTypes || {};
                  _GenTab.refMediaTypes[img.fileId] = img.type || "image";
                  _GenTab.refVideoUrls = _GenTab.refVideoUrls || {};
                  if (img.video_url)
                    _GenTab.refVideoUrls[img.fileId] = img.video_url;
                }
              }
              if (
                albumImages.length > 0 &&
                window.ImagePickerModal?.prepareAlbumImageForRef
              ) {
                for (const img of albumImages) {
                  try {
                    const prepared =
                      await window.ImagePickerModal.prepareAlbumImageForRef(
                        img,
                      );
                    if (!prepared) continue;
                    const key = prepared.key;
                    if (img.thumbnail_url) {
                      _GenTab.thumbnailCache[key] = img.thumbnail_url;
                    } else if (img.album_image_id && window.ImageStore) {
                      try {
                        const blobUrl = await window.ImageStore.getThumbnail(
                          img.album_image_id,
                        );
                        if (blobUrl) _GenTab.thumbnailCache[key] = blobUrl;
                      } catch (e) {}
                    } else if (img.thumbnail) {
                      _GenTab.thumbnailCache[key] = img.thumbnail;
                    }
                    if (prepared.file_name) {
                      _GenTab.fileNameCache[key] = prepared.file_name;
                    }
                    if (img.name) {
                      _GenTab.refImageNames[key] = img.name;
                    }
                    newIds.push(key);
                    resolvedSelection.set(img, key);
                  } catch (err) {
                    console.error(
                      "[GenTab] L\u1ED7i chu\u1EA9n b\u1ECB \u1EA3nh album:",
                      err,
                    );
                  }
                }
              }
              if (_gtCurrentProvider === "grok") {
                const orderedIds = images
                  .map((img) => resolvedSelection.get(img))
                  .filter(Boolean);
                if (
                  document.getElementById("grokVideoInputType")?.value ===
                    "Frames" &&
                  orderedIds.length !== images.length
                ) {
                  window.showNotification?.(
                    window.I18n?.t?.("albums.uploadFailedAll") ||
                      "Failed to prepare reference images. Please choose them again.",
                    "error",
                  );
                  return;
                }
                newIds.splice(0, newIds.length, ...orderedIds);
              }
              const mergedIds = [...new Set(newIds)];
              const selectedIdSet = new Set(mergedIds);
              const removedIds = existingIds2.filter(
                (id) => !selectedIdSet.has(id),
              );
              _GenTab.fileIdsInput.value = mergedIds.join(", ");
              for (const id of removedIds) {
                delete _GenTab.thumbnailCache?.[id];
                delete _GenTab.fileNameCache?.[id];
                delete _GenTab.refImageNames?.[id];
                delete _GenTab.refMediaTypes?.[id];
                delete _GenTab.refVideoUrls?.[id];
                delete _GenTab.mediaUuidCache?.[id];
                window.MediaRegistry?.delete?.(id);
                if (id.startsWith("upload_")) {
                  window.ImmediateUploader?.cancel?.(id);
                  window.pendingUploadFiles?.delete(id);
                  window.PendingUploadStore?.remove?.(id).catch?.(() => {});
                }
                for (
                  let promptIndex = 0;
                  promptIndex < (_GenTab._perPromptFrameData?.length || 0);
                  promptIndex++
                ) {
                  const pair = _GenTab._perPromptFrameData[promptIndex];
                  if (pair?.frame1 === id)
                    _GenTab._setPerPromptFrame(promptIndex, 1, "", "");
                  if (pair?.frame2 === id)
                    _GenTab._setPerPromptFrame(promptIndex, 2, "", "");
                }
                for (const frameNum of [1, 2]) {
                  if (
                    document.getElementById(`genTabFrame${frameNum}FileId`)
                      ?.value === id
                  ) {
                    _GenTab._setFrameImage(frameNum, "", "");
                  }
                }
              }
              _GenTab.fileIdsInput.dispatchEvent(
                new Event("input", { bubbles: true }),
              );
              const existingCount = Object.keys(_GenTab.refImageNames).length;
              let nameIdx = 0;
              newIds.forEach((id) => {
                if (!_GenTab.refImageNames[id]) {
                  nameIdx++;
                  _GenTab.refImageNames[id] =
                    `image_${existingCount + nameIdx}`;
                }
              });
              _GenTab.renderFileIdThumbnails();
              if (_GenTab.refImageMode === "mention") {
                _GenTab._refreshMentionHelper();
              }
            },
          });
        }
      });
      openImagePickerBtn.addEventListener("dragover", (e) => {
        e.preventDefault();
        openImagePickerBtn.classList.add("drag-over");
      });
      openImagePickerBtn.addEventListener("dragleave", () => {
        openImagePickerBtn.classList.remove("drag-over");
      });
      openImagePickerBtn.addEventListener("drop", (e) => {
        e.preventDefault();
        openImagePickerBtn.classList.remove("drag-over");
        const files = Array.from(e.dataTransfer.files).filter((f) =>
          f.type.startsWith("image/"),
        );
        if (files.length > 0) {
          _GenTab._handleDroppedFiles(files);
        }
      });
    }
    const screenCaptureBtn = document.getElementById("screenCaptureBtn");
    const headerCaptureBtn = document.getElementById("headerCaptureBtn");
    const handleScreenCapture = async (triggerBtn) => {
      if (!window.ScreenCapture) {
        window.customDialog?.alert(
          window.I18n?.t("gen.screenshotNotReady") ||
            "Screen capture feature is not ready.",
          { type: "warning" },
        );
        return;
      }
      if (triggerBtn) {
        triggerBtn.disabled = true;
        triggerBtn.classList.add("btn-loading");
      }
      window.showNotification?.(
        window.I18n?.t("gen.captureSelectArea") ||
          "Please select the capture area on the left",
        "success",
        3e3,
      );
      try {
        const result = await window.ScreenCapture.startCapture();
        if (result.success && result.uploadId) {
          if (_GenTab.fileIdsInput) {
            const existingIds = _GenTab.fileIdsInput.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            if (!existingIds.includes(result.uploadId)) {
              existingIds.push(result.uploadId);
              _GenTab.fileIdsInput.value = existingIds.join(", ");
              _GenTab.fileIdsInput.dispatchEvent(
                new Event("input", { bubbles: true }),
              );
            }
          }
          if (result.captureName) {
            _GenTab.refImageNames[result.uploadId] = result.captureName;
          }
          _GenTab.renderFileIdThumbnails();
          _GenTab.saveState();
          console.log(
            "[GenTab] \u0110\xE3 th\xEAm \u1EA3nh capture:",
            result.uploadId,
            "T\xEAn:",
            result.captureName,
          );
        } else if (result.cancelled) {
        } else if (result.error) {
          window.customDialog?.alert(result.error, {
            title: window.I18n?.t("gen.screenshotError") || "Screenshot error",
            type: "error",
          });
        }
      } finally {
        if (triggerBtn) {
          triggerBtn.disabled = false;
          triggerBtn.classList.remove("btn-loading");
        }
      }
    };
    if (screenCaptureBtn) {
      screenCaptureBtn.addEventListener("click", () =>
        handleScreenCapture(screenCaptureBtn),
      );
    }
    if (headerCaptureBtn) {
      headerCaptureBtn.addEventListener("click", () =>
        handleScreenCapture(headerCaptureBtn),
      );
    }
    const chatAIBtn = document.getElementById("chatAIBtn");
    if (chatAIBtn) {
      chatAIBtn.addEventListener("click", () => {
        const Modal = window.PromptAssistantModal;
        if (Modal) Modal.open();
      });
    }
    const importTxtBtn = document.getElementById("importTxtBtn");
    const importTxtFile = document.getElementById("importTxtFile");
    if (importTxtBtn && importTxtFile) {
      importTxtBtn.addEventListener("click", () => importTxtFile.click());
      importTxtFile.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
          _GenTab.importTxtFile(file);
          importTxtFile.value = "";
        }
      });
    }
    if (_GenTab.promptsArea) {
      _GenTab.promptsArea.addEventListener("dragover", (e) => {
        e.preventDefault();
        _GenTab.promptsArea.classList.add("drag-over");
      });
      _GenTab.promptsArea.addEventListener("dragleave", () => {
        _GenTab.promptsArea.classList.remove("drag-over");
      });
      _GenTab.promptsArea.addEventListener("drop", (e) => {
        e.preventDefault();
        _GenTab.promptsArea.classList.remove("drag-over");
        const files = Array.from(e.dataTransfer.files);
        const txtFile = files.find(
          (f) => f.name.endsWith(".txt") || f.name.endsWith(".csv"),
        );
        if (txtFile) {
          _GenTab.importTxtFile(txtFile);
        }
      });
    }
    _GenTab.bindFramePicker(1);
    _GenTab.bindFramePicker(2);
    if (_GenTab.genTypeSelect) {
      _GenTab.genTypeSelect.addEventListener("change", (event) => {
        if (event.isTrusted) _GenTab._genTypeExplicit = true;
      });
      _GenTab.genTypeSelect.addEventListener("change", _GenTab.updateGenTypeUI);
      _GenTab.genTypeSelect.addEventListener("change", () =>
        _GenTab._updateChainUI(),
      );
      _GenTab.updateRatioOptions();
    }
    const genTypeToggle = document.getElementById("genTypeToggle");
    if (genTypeToggle) {
      genTypeToggle.querySelectorAll(".gen-type-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const value = btn.dataset.value;
          _GenTab._rememberProviderRatioSelection();
          genTypeToggle
            .querySelectorAll(".gen-type-btn")
            .forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          if (_GenTab.genTypeSelect) {
            _GenTab._genTypeExplicit = true;
            _GenTab.genTypeSelect.dataset.userSet = "true";
            _GenTab.genTypeSelect.value = value;
            _GenTab.genTypeSelect.dispatchEvent(new Event("change"));
          }
        });
      });
    }
    if (_GenTab.videoInputTypeSelect) {
      _GenTab.videoInputTypeSelect.addEventListener("change", (event) => {
        if (event.isTrusted) _GenTab._videoInputTypeExplicit = true;
        _GenTab.updateRefImagesVisibility();
        _GenTab.renderFileIdThumbnails();
        _GenTab._updateChainUI();
        _GenTab._applyVoicePickerVisibility();
        _GenTab._applyCharacterPickerVisibility();
        _GenTab._syncPickerMentionState();
        _GenTab._mentionChips?.render?.();
        _GenTab._mentionMenu?.hide?.();
      });
    }
    _GenTab._initFramePickButtons();
    if (_GenTab.promptsArea) {
      _GenTab.promptsArea.addEventListener("input", _GenTab.updatePromptCount);
      _GenTab._debouncedUpdateFrameMode = debounce(
        () => _GenTab._updateFrameMode(),
        500,
      );
      _GenTab.promptsArea.addEventListener(
        "input",
        _GenTab._debouncedUpdateFrameMode,
      );
    }
    if (_GenTab.quantitySelect) {
      _GenTab.quantitySelect.addEventListener(
        "change",
        _GenTab.updatePromptCount,
      );
      _GenTab.quantitySelect.addEventListener("change", () => {
        try {
          chrome.storage.local.get(["af_settings"], (res) => {
            const s = res.af_settings || {};
            s.defaultFlowQuantity = _GenTab.quantitySelect.value;
            chrome.storage.local.set({ af_settings: s });
          });
        } catch (_) {}
      });
    }
    if (_GenTab.multiPromptCheck) {
      _GenTab.multiPromptCheck.addEventListener("change", () => {
        _GenTab.updatePromptCount();
        const isMulti = _GenTab.multiPromptCheck.checked;
        const hint = document.getElementById("multiPromptHint");
        if (hint) hint.classList.toggle("hidden", !isMulti);
        _GenTab._updateRunModeVisibility();
        _GenTab.renderFileIdThumbnails();
        _GenTab._updateRefModeUI();
        _GenTab._updateFrameMode();
        _GenTab._updateChainUI();
      });
    }
    chrome.storage.local.get(["toby_gentab_state", "presets"], (res) => {
      let state = res.toby_gentab_state;
      if (!state && res.presets) {
        state = res.presets;
        chrome.storage.local.set({ toby_gentab_state: state });
        chrome.storage.local.remove("presets");
      }
      if (state) {
        _GenTab.loadState(state);
        _GenTab.updatePromptCount();
      }
      _GenTab._applyStorageSettings();
    });
    _GenTab._loadAddonPrompts();
    _GenTab._initAddonPromptDropdown();
    if (_GenTab.addonPromptSelect) {
      _GenTab.addonPromptSelect.addEventListener("change", () => {
        _GenTab._updateAddonPromptTrigger();
        _GenTab.saveState();
      });
    }
    if (window.eventBus && !_GenTab._addonSseBound) {
      _GenTab._addonSseBound = true;
      window.eventBus.on("sse:addon_prompts_updated", async () => {
        try {
          await new Promise((r) =>
            chrome.storage.local.remove("af_addon_prompts", () => r()),
          );
          const fresh = await _GenTab._fetchAddonPromptsFromApi();
          _GenTab.addonPrompts = Array.isArray(fresh) ? fresh : [];
          _GenTab._renderAddonPromptSelect();
          console.log("[GenTab] addon prompts reloaded via SSE");
        } catch (e) {
          console.warn("[GenTab] addon SSE reload failed:", e?.message || e);
        }
      });
      window.eventBus.on("sse:entitlements_changed", () => {
        setTimeout(async () => {
          try {
            await new Promise((r) =>
              chrome.storage.local.remove("af_addon_prompts", () => r()),
            );
            const fresh = await _GenTab._fetchAddonPromptsFromApi();
            _GenTab.addonPrompts = Array.isArray(fresh) ? fresh : [];
            _GenTab._renderAddonPromptSelect();
            console.log(
              "[GenTab] addon prompts reloaded (entitlements changed)",
            );
          } catch (e) {
            console.warn(
              "[GenTab] addon reload after entitlements failed:",
              e?.message || e,
            );
          }
        }, 800);
      });
    }
    _GenTab._initConfirmModal();
    _GenTab._initPromptSearchRow();
    if (_GenTab.startBtn)
      _GenTab.startBtn.addEventListener("click", async () => {
        const t = (key, params) =>
          window.I18n ? window.I18n.t(key, params) : key;
        if (_GenTab._providerSubmitRunning) {
          if (window.showNotification) {
            window.showNotification(
              t("gen.alreadyRunning") || "Generating, please wait...",
              "warning",
              2e3,
            );
          }
          return;
        }
        const baseText = _GenTab.promptsArea.value.trim();
        if (!baseText) {
          if (window.customDialog)
            window.customDialog.alert(t("gen.noPromptWarning"), {
              title: t("gen.noPromptTitle"),
              type: "warning",
            });
          return;
        }
        let promptCount = 1;
        if (_GenTab.multiPromptCheck && _GenTab.multiPromptCheck.checked) {
          promptCount = baseText
            .split(/\n\s*\n/)
            .map((b) => b.trim())
            .filter((b) => b.length > 0).length;
        }
        const _submitProviderKey =
          document.getElementById("genProvider")?.value || "flow";
        try {
          const activation = _GenTab._ensureProviderTab(_submitProviderKey);
          if (_submitProviderKey === "flow" && activation?.then) {
            _GenTab._flowActivationPromise = activation;
          }
        } catch (_) {}
        const confirmed = await _GenTab._showConfirmModal(promptCount);
        if (!confirmed) return;
        promptCount = _GenTab._getConfirmPromptCount();
        if (promptCount > 1 && window.featureGate) {
          const batchCheck =
            window.featureGate.checkPromptBatchLimit(promptCount);
          if (!batchCheck.allowed) {
            _GenTab._recordPreSubmitDenial(
              baseText,
              promptCount,
              _submitProviderKey,
              {
                reason: "BATCH_LIMIT_EXCEEDED",
                message: "Prompt batch exceeds the current plan limit.",
                plan_slug: window.featureGate?.getPlan?.()?.slug || null,
                quota_key: "prompts_per_batch",
                limit: batchCheck.limit,
                remaining: batchCheck.limit,
              },
            );
            const limitText =
              batchCheck.limit === -1 ? "\u221E" : batchCheck.limit;
            window.showNotification?.(
              window.I18n?.t?.("gen.batchLimitExceeded", {
                count: promptCount,
                limit: limitText,
              }) ||
                window.I18n?.t?.("genNotifyExtra.batchLimitExceededFallback", {
                  count: promptCount,
                  limit: limitText,
                }) ||
                `G\xF3i c\u1EE7a b\u1EA1n gi\u1EDBi h\u1EA1n ${limitText} prompt/batch. B\u1EA1n \u0111ang c\xF3 ${promptCount} prompt. N\xE2ng c\u1EA5p \u0111\u1EC3 t\u0103ng gi\u1EDBi h\u1EA1n.`,
              "warning",
            );
            return;
          }
        }
        const _manualSubmitMode =
          typeof confirmed === "object" && confirmed?.manualSubmitMode === true;
        const _confirmedFlowExecutionMode =
          typeof confirmed === "object" &&
          confirmed?.flowExecutionMode === "web"
            ? "web"
            : null;
        if (typeof confirmed === "object" && confirmed?.reloadFlow) {
          const _reloadBtnSpan =
            _GenTab.startBtn?.querySelector("span") || null;
          const _savedReloadBtnText = _reloadBtnSpan?.textContent;
          if (_reloadBtnSpan) {
            _reloadBtnSpan.textContent =
              window.I18n?.t("gen.reloadingFlow") || "Reloading Flow...";
          }
          _GenTab.startBtn.disabled = true;
          _GenTab.startBtn.style.opacity = "0.7";
          try {
            if (typeof sendLog === "function")
              sendLog("\u0110ang reload Flow page...", "info");
            if (typeof window.showNotification === "function") {
              window.showNotification(
                window.I18n?.t("gen.reloadingFlowWait") ||
                  "Reloading Flow, please wait...",
                "info",
                3e3,
              );
            }
            if (window.PromptQueue?.getInstance?.()?.forceReloadAndStabilize) {
              const reloadOk =
                await window.PromptQueue.getInstance().forceReloadAndStabilize(
                  "user-pre-submit",
                );
              if (!reloadOk) {
                if (typeof sendLog === "function")
                  sendLog(
                    "Reload Flow kh\xF4ng th\xE0nh c\xF4ng (busy/timeout), ti\u1EBFp t\u1EE5c...",
                    "warn",
                  );
                if (typeof window.showNotification === "function") {
                  window.showNotification(
                    window.I18n?.t("genNotifyExtra.reloadFlowFailed") ||
                      "Flow reload failed, continuing submit...",
                    "warning",
                    3e3,
                  );
                }
              } else {
                if (typeof sendLog === "function")
                  sendLog(
                    "\u0110\xE3 reload Flow page, editor s\u1EB5n s\xE0ng",
                    "info",
                  );
                if (typeof window.showNotification === "function") {
                  window.showNotification(
                    window.I18n?.t("gen.flowReloaded") ||
                      "Flow page reloaded, ready!",
                    "success",
                    2e3,
                  );
                }
              }
            } else if (window.MessageBridge) {
              await window.MessageBridge.sendToContentScript(
                "autoReloadFlow",
                {},
              );
              await new Promise((r) => setTimeout(r, 2e3));
              const maxWait = 3e4;
              const pollInterval = 500;
              const startTime = Date.now();
              let editorReady = false;
              while (Date.now() - startTime < maxWait) {
                await new Promise((r) => setTimeout(r, pollInterval));
                try {
                  const state = await window.MessageBridge.sendToContentScript(
                    "getEditor",
                    {},
                  );
                  if (state?.exists && state?.hasSlateState) {
                    editorReady = true;
                    break;
                  }
                } catch (e) {}
              }
              if (editorReady) {
                await new Promise((r) => setTimeout(r, 3e3));
                if (typeof sendLog === "function")
                  sendLog(
                    "\u0110\xE3 reload Flow page, editor s\u1EB5n s\xE0ng",
                    "info",
                  );
                if (typeof window.showNotification === "function") {
                  window.showNotification(
                    window.I18n?.t("gen.flowReloaded") ||
                      "Flow page reloaded, ready!",
                    "success",
                    2e3,
                  );
                }
              } else {
                if (typeof sendLog === "function")
                  sendLog(
                    "Reload timeout, ti\u1EBFp t\u1EE5c submit...",
                    "warn",
                  );
                if (typeof window.showNotification === "function") {
                  window.showNotification(
                    "Reload timeout, continuing submit...",
                    "warning",
                    3e3,
                  );
                }
              }
            }
          } catch (e) {
            console.warn(
              "[GenTab] Reload Flow tr\u01B0\u1EDBc submit fail (degrade):",
              e.message,
            );
            if (typeof sendLog === "function")
              sendLog(
                "Reload th\u1EA5t b\u1EA1i, ti\u1EBFp t\u1EE5c submit...",
                "warn",
              );
          } finally {
            if (_reloadBtnSpan && typeof _savedReloadBtnText === "string") {
              _reloadBtnSpan.textContent = _savedReloadBtnText;
            }
            _GenTab.startBtn.style.opacity = "";
          }
        }
        if (window.featureGate) {
          const quotaCheck =
            window.featureGate.checkGlobalQuotaWarning("Generate");
          if (quotaCheck.exhausted) {
            return;
          }
        }
        const _isPipelineMode = window.PromptQueue && PromptQueue.isEnabled();
        const _earlyProviderCheck =
          document.getElementById("genProvider")?.value || "flow";
        if (
          !_isPipelineMode &&
          window.MessageBridge &&
          _earlyProviderCheck === "flow"
        ) {
          try {
            const runState = await window.MessageBridge.sendToContentScript(
              "getRunningState",
              {},
            );
            if (runState?.isRunning) {
              const crowIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:4px;color:#a855f7;"><path d="M16 7h.01"/><path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20"/><path d="m20 7 2 .5-2 .5"/><path d="M10 18v3"/><path d="M14 17.75V21"/><path d="M7 18a6 6 0 0 0 3.84-10.61"/></svg>`;
              if (window.customDialog) {
                window.customDialog.alert(
                  `<div style="line-height:1.6">${window.I18n?.t("gen.pipelineQueueHint", { icon: crowIcon }) || `Enable <strong>${crowIcon}Pipeline Queue</strong> mode to run multiple tasks at once.<br><br><span style="color:var(--muted-foreground);font-size:0.9em;">Guide: Settings \u2192 Advanced \u2192 Pipeline Queue</span>`}</div>`,
                  {
                    title:
                      window.I18n?.t("msg.flowBusy") || "Google Flow is busy",
                    type: "info",
                    html: true,
                    buttons: [
                      {
                        label: window.I18n?.t("common.close") || "Close",
                        primary: false,
                        action: () => {},
                      },
                      {
                        label: window.I18n?.t("header.settings") || "Settings",
                        primary: true,
                        action: () => {
                          chrome.runtime.sendMessage({
                            action: "openSettings",
                          });
                        },
                      },
                    ],
                  },
                );
              }
              return;
            }
          } catch (e) {
            console.warn("[GenTab] getRunningState check failed:", e.message);
          }
        }
        let _grokSubmitSelection = null;
        if (document.getElementById("genProvider")?.value === "grok") {
          _grokSubmitSelection = {
            genType: _GenTab.genTypeSelect?.value,
            model: document.getElementById("grokModel")?.value,
            videoInputType:
              document.getElementById("grokVideoInputType")?.value,
          };
          if (
            _grokSubmitSelection.genType === "Video" &&
            _grokSubmitSelection.videoInputType === "Frames"
          ) {
            if (document.getElementById("grokFramesSection")?._grokFrameBusy)
              return;
            try {
              const adapter = window.ProviderRegistry.get("grok");
              _grokSubmitSelection.frames = adapter.frameSelectionData(
                _GenTab._grokFrameData || {},
                promptCount,
                { requireStart: true },
              );
            } catch (error) {
              const message =
                error.code === "GROK_FIRST_FRAME_MISSING"
                  ? window.I18n?.t?.("gen.framesMissingStart", {
                      positions: error.positions?.join(", ") || "1",
                    }) ||
                    `Please add the first frame for prompt(s): ${error.positions?.join(", ") || "1"}.`
                  : error.code === "GROK_REF_LIMIT_EXCEEDED"
                    ? window.I18n?.t?.("gen.refExceedLimit", { max: 2 }) ||
                      "Frames: maximum 2 reference images."
                    : error.message || "Unable to prepare the frames.";
              window.showNotification?.(message, "warning");
              return;
            }
          }
        }
        if (
          !_isPipelineMode &&
          window.ExecutionLock &&
          ExecutionLock.isBlockedBy("prompts")
        ) {
          const shouldStop2 = await ExecutionLock.showBlockedDialog("prompts");
          if (!shouldStop2) return;
          await ExecutionLock.stopCurrent();
        }
        if (!_isPipelineMode && window.ExecutionLock)
          ExecutionLock.acquire("prompts", "Prompt batch");
        let _executionToken = null;
        if (window.ExecutionGate) {
          try {
            const _currentProvider =
              document.getElementById("genProvider")?.value || "flow";
            const _grokFrames =
              _currentProvider === "grok" &&
              _grokSubmitSelection?.genType === "Video" &&
              _grokSubmitSelection?.videoInputType === "Frames";
            const _rawRefCount = _grokFrames
              ? _grokSubmitSelection.frames.ref_file_ids
                  .split(",")
                  .filter(Boolean).length
              : _GenTab.fileIdsInput?.value
                  ?.split(",")
                  .map((v) => v.trim())
                  .filter(Boolean).length || 0;
            const _refCount = _grokFrames
              ? _rawRefCount
              : _GenTab.refImageMode === "none"
                ? 0
                : _rawRefCount;
            const _gateMediaType =
              (_grokSubmitSelection?.genType ||
                _GenTab.genTypeSelect?.value) === "Video"
                ? "video"
                : "image";
            const gate = await ExecutionGate.request("generate", promptCount, {
              owner: "prompts",
              label: "Auto Gen",
              provider: _currentProvider,
              media_type: _gateMediaType,
              has_ref: _refCount > 0,
              ref_count: _refCount,
            });
            if (!gate.allowed) {
              _GenTab._recordPreSubmitDenial(
                baseText,
                promptCount,
                _currentProvider,
                gate,
              );
              ExecutionGate.showDeniedDialog(gate, "Generate", () => {
                try {
                  _GenTab.startBtn?.click();
                } catch (e) {
                  console.warn("[GenTab] retry click failed:", e?.message);
                }
              });
              _GenTab.startBtn.disabled = false;
              if (window.ExecutionLock) ExecutionLock.release("prompts");
              return;
            }
            _executionToken = gate.token;
            _GenTab._currentExecutionToken = _executionToken;
          } catch (e) {
            if (window.QuotaErrorHandler?.handleIfQuotaError(e, "Generate")) {
              console.warn(
                "[GenTab] ExecutionGate denied:",
                e.code || e.reason,
              );
              _GenTab.startBtn.disabled = false;
              if (window.ExecutionLock) ExecutionLock.release("prompts");
              return;
            }
            if (e?.code === "PROVIDER_REF_IMAGES_DISABLED") {
              console.warn(
                "[GenTab] Provider reference images denied:",
                e.message,
              );
              window.showNotification?.(e.message, "error", 5e3);
              _GenTab.startBtn.disabled = false;
              if (window.ExecutionLock) ExecutionLock.release("prompts");
              return;
            }
            console.error(
              "[GenTab] ExecutionGate request failed, blocking submit:",
              e.message,
            );
            const gateHttpStatus = Number(e?.httpStatus || 0);
            const gateErrorMessage =
              gateHttpStatus >= 400 &&
              gateHttpStatus < 500 &&
              typeof e?.message === "string" &&
              e.message.trim()
                ? e.message
                : window.I18n?.t?.("gen.executionGateError") ||
                  "Unable to check quota. Please try again.";
            window.showNotification?.(gateErrorMessage, "error", 4e3);
            _GenTab.startBtn.disabled = false;
            if (window.ExecutionLock) ExecutionLock.release("prompts");
            return;
          }
        }
        const _executionProvider =
          document.getElementById("genProvider")?.value || "flow";
        if (_executionProvider === "flow" && window.MessageBridge) {
          try {
            const reset = await window.MessageBridge.sendToContentScript(
              "resetStop",
              {},
            );
            if (reset?.success !== true)
              throw new Error(reset?.error || "UPLOAD_STOP_RESET_FAILED");
            console.log(
              "[GenTab] Flow stop state reset before reference materialization",
            );
          } catch (error) {
            console.error(
              "[GenTab] Cannot reset Flow stop state before upload:",
              error?.message || error,
            );
            window.showNotification?.(
              window.I18n?.t?.("gen.flowNotReady") ||
                "Google Flow is not ready. Please try again.",
              "error",
              4e3,
            );
            _GenTab._resetRunningControls();
            window.ExecutionLock?.release?.("prompts");
            if (window.ExecutionGate && _executionToken)
              await ExecutionGate.cancel(_executionToken);
            return;
          }
        }
        let baseLines = [baseText];
        if (_GenTab.multiPromptCheck && _GenTab.multiPromptCheck.checked) {
          baseLines = baseText
            .split(/\n\s*\n/)
            .map((block) => block.trim())
            .filter((b) => b.length > 0);
        }
        const quantity = parseInt(_GenTab.quantitySelect?.value) || 1;
        const delayBetweenMs =
          (window.ExecutionConfig?.safeGetDelayBetweenPromptsSec?.() ?? 5) *
          1e3;
        let fileIds = _GenTab.fileIdsInput.value
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const genType = _GenTab.genTypeSelect.value;
        const providerKey =
          document.getElementById("genProvider")?.value || "flow";
        const aspectRatio =
          providerKey === "flow"
            ? _GenTab._resolveFlowRatio(_GenTab.aspectRatioSelect.value)
            : _GenTab.aspectRatioSelect.value;
        if (!aspectRatio) {
          window.showNotification?.(
            window.I18n?.t?.("config.ratiosUnavailable") ||
              "Generation ratios are unavailable. Please try again.",
            "error",
            4e3,
          );
          _GenTab._resetRunningControls();
          window.ExecutionLock?.release?.("prompts");
          if (window.ExecutionGate && _executionToken)
            ExecutionGate.cancel(_executionToken);
          return;
        }
        if (
          providerKey === "flow" &&
          _GenTab.aspectRatioSelect.value !== aspectRatio
        ) {
          _GenTab.aspectRatioSelect.value = aspectRatio;
        }
        const modelName =
          genType === "Image"
            ? _GenTab.imageModelSelect.value
            : _GenTab.videoModelSelect.value;
        if (providerKey === "gemini") {
          if (!window.featureGate?.canUse?.("gemini_enabled")) {
            window.openUpgradeModal?.();
            _GenTab._resetRunningControls();
            window.ExecutionLock?.release?.("prompts");
            if (window.ExecutionGate && _executionToken)
              ExecutionGate.cancel(_executionToken);
            return;
          }
          try {
            const settingsObj = await new Promise((resolve) =>
              chrome.storage.local.get(["af_settings"], (res) =>
                resolve(res.af_settings || {}),
              ),
            );
            let geminiPrompts = baseLines;
            const addon = _GenTab._getSelectedAddonPrompt();
            if (addon?.content)
              geminiPrompts = geminiPrompts.map(
                (prompt2) => `${prompt2}

${addon.content}`,
              );
            _GenTab._geminiStopRequested = false;
            _GenTab._providerSubmitRunning = true;
            _GenTab.startBtn.disabled = true;
            if (_GenTab.genBtnRow)
              _GenTab.genBtnRow.classList.add("is-running");
            if (_GenTab.genRunningControls)
              _GenTab.genRunningControls.classList.remove("hidden");
            const geminiResult = await _GenTab._submitViaGemini({
              prompts: geminiPrompts,
              mentionPrompts: baseLines,
              fileIds,
              settings: {
                ratio: aspectRatio,
                genType,
                model: _GenTab.geminiModelSelect?.value || null,
                refImageMode: _GenTab.refImageMode,
                refImagesPerPrompt: _GenTab.refImagesPerPrompt,
              },
              settingsObj,
            });
            if (window.ExecutionGate && _executionToken) {
              ExecutionGate.complete(
                _executionToken,
                geminiResult.completed > 0 ? "success" : "failed",
              );
              _GenTab._currentExecutionToken = null;
            }
            if (geminiResult.failedPrompts?.length) {
              _GenTab._showFailedPrompts(geminiResult.failedPrompts);
              _GenTab._showFailedPromptsSummaryModal(
                geminiResult.failedPrompts,
                geminiPrompts.length,
                geminiResult.completed,
              );
            }
            sendLog(
              `Gemini ho\xE0n t\u1EA5t: ${geminiResult.completed} th\xE0nh c\xF4ng, ${geminiResult.failed} th\u1EA5t b\u1EA1i`,
              geminiResult.failed ? "warn" : "success",
            );
          } catch (error) {
            console.error("[GenTab] Gemini submit error:", error);
            if (window.ExecutionGate && _executionToken)
              ExecutionGate.complete(_executionToken, "failed", {
                error: error.message,
              });
            _GenTab._currentExecutionToken = null;
            sendLog(`Gemini l\u1ED7i: ${error.message || error}`, "error");
          } finally {
            if (_GenTab._geminiTrackerContext) {
              try {
                _GenTab._geminiTrackerContext.tracker(false);
              } catch (trackerError) {
                console.warn(
                  "[GenTab] Gemini tracker cleanup failed:",
                  trackerError,
                );
              }
              _GenTab._geminiTrackerContext = null;
              window.eventBus?.emit?.("execution:tracker_update", {
                owner: "prompts",
                phase: "error",
              });
              window.eventBus?.emit?.("execution:lock_changed", {
                locked: false,
                owner: "prompts",
              });
            }
            _GenTab._providerSubmitRunning = false;
            _GenTab._resetRunningControls();
            window.ExecutionLock?.release?.("prompts");
          }
          return;
        }
        if (providerKey === "muse") {
          if (!window.featureGate?.canUse?.("muse_enabled")) {
            window.openUpgradeModal?.();
            _GenTab._resetRunningControls();
            window.ExecutionLock?.release?.("prompts");
            if (window.ExecutionGate && _executionToken)
              ExecutionGate.cancel(_executionToken);
            return;
          }
          try {
            _GenTab._providerStopRequested = false;
            let musePrompts = baseLines;
            const addon = _GenTab._getSelectedAddonPrompt();
            if (addon?.content)
              musePrompts = musePrompts.map(
                (prompt2) => `${prompt2}

${addon.content}`,
              );
            _GenTab._providerSubmitRunning = true;
            _GenTab.startBtn.disabled = true;
            if (_GenTab.genBtnRow)
              _GenTab.genBtnRow.classList.add("is-running");
            if (_GenTab.genRunningControls)
              _GenTab.genRunningControls.classList.remove("hidden");
            const museResult = await _GenTab._submitViaMuse({
              prompts: musePrompts,
              mentionPrompts: baseLines,
              fileIds,
              settings: {
                ratio: aspectRatio,
                genType,
                model: _GenTab.museModelSelect?.value || null,
                refImageMode: _GenTab.refImageMode,
                refImagesPerPrompt: _GenTab.refImagesPerPrompt,
              },
            });
            if (window.ExecutionGate && _executionToken)
              ExecutionGate.complete(
                _executionToken,
                museResult.completed > 0 ? "success" : "failed",
              );
            _GenTab._currentExecutionToken = null;
            if (museResult.completed) {
              window.featureGate?.recordMuseRun?.(museResult.completed);
              window.featureGate?.recordPromptSubmit?.(
                museResult.completed,
                "muse",
              );
            }
            if (museResult.failedPrompts?.length) {
              _GenTab._showFailedPrompts(museResult.failedPrompts);
              _GenTab._showFailedPromptsSummaryModal(
                museResult.failedPrompts,
                musePrompts.length,
                museResult.completed,
              );
              _GenTab._showProviderErrorNotification(
                "muse",
                "GENERATION_FAILED",
                museResult.failedPrompts[0]?.error || "",
              );
            }
            sendLog(
              `Muse ho\xE0n t\u1EA5t: ${museResult.completed} th\xE0nh c\xF4ng, ${museResult.failed} th\u1EA5t b\u1EA1i`,
              museResult.failed ? "warn" : "success",
            );
          } catch (error) {
            if (window.ExecutionGate && _executionToken)
              ExecutionGate.complete(_executionToken, "failed", {
                error: error?.message,
              });
            _GenTab._currentExecutionToken = null;
            sendLog(`Muse l\u1ED7i: ${error?.message || error}`, "error");
          } finally {
            _GenTab._providerSubmitRunning = false;
            _GenTab._resetRunningControls();
            window.ExecutionLock?.release?.("prompts");
          }
          return;
        }
        if (providerKey === "grok") {
          const canGrok = !!window.featureGate?.canUse?.("grok_enabled");
          if (!canGrok) {
            const isLoggedIn = !!window.authManager?.isLoggedIn?.();
            if (isLoggedIn && typeof window.openUpgradeModal === "function") {
              try {
                window.openUpgradeModal();
              } catch (_) {}
            } else {
              try {
                window.featureGate?.showLoginPrompt?.(
                  window.I18n?.t?.("gen.grokProviderLockedMsg") ||
                    "Grok requires the Pro plan.",
                );
              } catch (_) {}
            }
            try {
              _GenTab.startBtn.disabled = false;
            } catch (_) {}
            try {
              _GenTab._resetRunningControls();
            } catch (_) {}
            if (window.ExecutionLock) {
              try {
                ExecutionLock.release("prompts");
              } catch (_) {}
            }
            if (window.ExecutionGate && _executionToken) {
              try {
                ExecutionGate.cancel(_executionToken);
              } catch (_) {}
              _GenTab._currentExecutionToken = null;
            }
            return;
          }
          const grokQuota = window.featureGate?.checkQuota?.("grok_run_max");
          if (grokQuota && !grokQuota.allowed) {
            const limitText =
              grokQuota.limit === "unlimited" ? "\u221E" : grokQuota.limit;
            window.showNotification?.(
              window.I18n?.t?.("gen.providerQuotaExhausted", {
                provider: "Grok",
                used: grokQuota.used,
                limit: limitText,
              }) ||
                window.I18n?.t?.("genNotifyExtra.grokQuotaExhausted", {
                  used: grokQuota.used,
                  limit: limitText,
                }) ||
                `\u0110\xE3 h\u1EBFt ${grokQuota.used}/${limitText} l\u01B0\u1EE3t Grok h\xF4m nay.`,
              "warning",
            );
            try {
              _GenTab.startBtn.disabled = false;
            } catch (_) {}
            try {
              _GenTab._resetRunningControls();
            } catch (_) {}
            if (window.ExecutionLock) {
              try {
                ExecutionLock.release("prompts");
              } catch (_) {}
            }
            if (window.ExecutionGate && _executionToken) {
              try {
                ExecutionGate.cancel(_executionToken);
              } catch (_) {}
              _GenTab._currentExecutionToken = null;
            }
            return;
          }
          try {
            const settingsObj = await new Promise((resolve) => {
              chrome.storage.local.get(["af_settings"], (res) =>
                resolve(res.af_settings || {}),
              );
            });
            let grokPrompts = [baseText];
            if (_GenTab.multiPromptCheck && _GenTab.multiPromptCheck.checked) {
              grokPrompts = baseText
                .split(/\n\s*\n/)
                .map((b) => b.trim())
                .filter((b) => b.length > 0);
            }
            if (grokPrompts.length === 0) {
              sendLog("Grok: kh\xF4ng c\xF3 prompt h\u1EE3p l\u1EC7", "warn");
              _GenTab.startBtn.disabled = false;
              if (window.ExecutionLock) ExecutionLock.release("prompts");
              return;
            }
            const _grokAddon = _GenTab._getSelectedAddonPrompt();
            if (_grokAddon && _grokAddon.content) {
              grokPrompts = grokPrompts.map(
                (p) => `${p}

${_grokAddon.content}`,
              );
            }
            _GenTab._grokStopRequested = false;
            _GenTab._providerSubmitRunning = true;
            _GenTab.startBtn.disabled = true;
            if (_GenTab.genBtnRow)
              _GenTab.genBtnRow.classList.add("is-running");
            if (_GenTab.genRunningControls)
              _GenTab.genRunningControls.classList.remove("hidden");
            const grokResult = await _GenTab._submitViaGrok({
              prompts: grokPrompts,
              fileIds,
              settings: {
                ratio: aspectRatio,
                quantity,
                genType,
                model: document.getElementById("grokModel")?.value,
                videoInputType:
                  document.getElementById("grokVideoInputType")?.value,
                frames: _GenTab._grokFrameData || {},
                ...(_grokSubmitSelection || {}),
              },
              settingsObj,
              executionToken: _executionToken,
            });
            if (window.ExecutionGate && _executionToken) {
              const status =
                grokResult.completed > 0 && grokResult.failed === 0
                  ? "success"
                  : grokResult.completed === 0
                    ? "failed"
                    : "success";
              ExecutionGate.complete(_executionToken, status);
              _GenTab._currentExecutionToken = null;
            }
            if (grokResult.completed > 0 && window.featureGate) {
              window.featureGate.recordGrokRun(grokResult.completed);
              window.featureGate.recordPromptSubmit(
                grokResult.completed,
                "grok",
              );
            }
            sendLog(
              `Grok ho\xE0n t\u1EA5t: ${grokResult.completed} th\xE0nh c\xF4ng, ${grokResult.failed} th\u1EA5t b\u1EA1i${grokResult.stopped ? " (\u0111\xE3 d\u1EEBng)" : ""}`,
              "info",
            );
            if (
              grokResult.failedPrompts &&
              grokResult.failedPrompts.length > 0
            ) {
              _GenTab._showFailedPrompts(grokResult.failedPrompts);
              _GenTab._showFailedPromptsSummaryModal(
                grokResult.failedPrompts,
                grokPrompts.length,
                grokResult.completed,
              );
            }
            _GenTab._providerSubmitRunning = false;
            _GenTab._resetRunningControls();
            if (window.ExecutionLock) ExecutionLock.release("prompts");
          } catch (err) {
            console.error("[GenTab] Grok submit error:", err);
            sendLog("Grok l\u1ED7i: " + (err.message || err), "error");
            if (window.ExecutionGate && _executionToken) {
              ExecutionGate.complete(_executionToken, "failed", {
                error: err.message || String(err),
              });
              _GenTab._currentExecutionToken = null;
            }
            _GenTab._providerSubmitRunning = false;
            _GenTab._resetRunningControls();
            if (window.ExecutionLock) ExecutionLock.release("prompts");
          }
          return;
        }
        if (providerKey === "chatgpt") {
          const canChatGPT = !!window.featureGate?.canUse?.("chatgpt_enabled");
          if (!canChatGPT) {
            const isLoggedIn = !!window.authManager?.isLoggedIn?.();
            if (isLoggedIn && typeof window.openUpgradeModal === "function") {
              try {
                window.openUpgradeModal();
              } catch (_) {}
            } else {
              try {
                window.featureGate?.showLoginPrompt?.(
                  window.I18n?.t?.("gen.providerLockedMsg") ||
                    "ChatGPT requires the Pro plan.",
                );
              } catch (_) {}
            }
            try {
              _GenTab.startBtn.disabled = false;
            } catch (_) {}
            try {
              _GenTab._resetRunningControls();
            } catch (_) {}
            if (window.ExecutionLock) {
              try {
                ExecutionLock.release("prompts");
              } catch (_) {}
            }
            if (window.ExecutionGate && _executionToken) {
              try {
                ExecutionGate.cancel(_executionToken);
              } catch (_) {}
              _GenTab._currentExecutionToken = null;
            }
            return;
          }
          const chatgptQuota =
            window.featureGate?.checkQuota?.("chatgpt_run_max");
          if (chatgptQuota && !chatgptQuota.allowed) {
            const limitText =
              chatgptQuota.limit === "unlimited"
                ? "\u221E"
                : chatgptQuota.limit;
            window.showNotification?.(
              window.I18n?.t?.("gen.providerQuotaExhausted", {
                provider: "ChatGPT",
                used: chatgptQuota.used,
                limit: limitText,
              }) ||
                window.I18n?.t?.("genNotifyExtra.chatgptQuotaExhausted", {
                  used: chatgptQuota.used,
                  limit: limitText,
                }) ||
                `\u0110\xE3 h\u1EBFt ${chatgptQuota.used}/${limitText} l\u01B0\u1EE3t ChatGPT h\xF4m nay.`,
              "warning",
            );
            try {
              _GenTab.startBtn.disabled = false;
            } catch (_) {}
            try {
              _GenTab._resetRunningControls();
            } catch (_) {}
            if (window.ExecutionLock) {
              try {
                ExecutionLock.release("prompts");
              } catch (_) {}
            }
            if (window.ExecutionGate && _executionToken) {
              try {
                ExecutionGate.cancel(_executionToken);
              } catch (_) {}
              _GenTab._currentExecutionToken = null;
            }
            return;
          }
          try {
            const settingsObj = await new Promise((resolve) => {
              chrome.storage.local.get(["af_settings"], (res) =>
                resolve(res.af_settings || {}),
              );
            });
            let chatgptPrompts = [baseText];
            if (_GenTab.multiPromptCheck && _GenTab.multiPromptCheck.checked) {
              chatgptPrompts = baseText
                .split(/\n\s*\n/)
                .map((b) => b.trim())
                .filter((b) => b.length > 0);
            }
            if (chatgptPrompts.length === 0) {
              sendLog(
                "ChatGPT: kh\xF4ng c\xF3 prompt h\u1EE3p l\u1EC7",
                "warn",
              );
              _GenTab.startBtn.disabled = false;
              if (window.ExecutionLock) ExecutionLock.release("prompts");
              return;
            }
            const _cgAddon = _GenTab._getSelectedAddonPrompt();
            if (_cgAddon && _cgAddon.content) {
              chatgptPrompts = chatgptPrompts.map(
                (p) => `${p}

${_cgAddon.content}`,
              );
            }
            _GenTab._chatgptStopRequested = false;
            _GenTab._providerSubmitRunning = true;
            _GenTab.startBtn.disabled = true;
            if (_GenTab.genBtnRow)
              _GenTab.genBtnRow.classList.add("is-running");
            if (_GenTab.genRunningControls)
              _GenTab.genRunningControls.classList.remove("hidden");
            const cgResult = await _GenTab._submitViaChatGPT({
              prompts: chatgptPrompts,
              fileIds,
              settings: {
                ratio: aspectRatio,
                model: _GenTab.chatgptModelSelect?.value || null,
              },
              settingsObj,
              executionToken: _executionToken,
            });
            if (window.ExecutionGate && _executionToken) {
              const status =
                cgResult.completed > 0 && cgResult.failed === 0
                  ? "success"
                  : cgResult.completed === 0
                    ? "failed"
                    : "success";
              ExecutionGate.complete(_executionToken, status);
              _GenTab._currentExecutionToken = null;
            }
            if (cgResult.completed > 0 && window.featureGate) {
              window.featureGate.recordChatGPTRun(cgResult.completed);
              window.featureGate.recordPromptSubmit(
                cgResult.completed,
                "chatgpt",
              );
            }
            sendLog(
              `ChatGPT ho\xE0n t\u1EA5t: ${cgResult.completed} th\xE0nh c\xF4ng, ${cgResult.failed} th\u1EA5t b\u1EA1i${cgResult.stopped ? " (\u0111\xE3 d\u1EEBng)" : ""}`,
              "info",
            );
            if (cgResult.failedPrompts && cgResult.failedPrompts.length > 0) {
              _GenTab._showFailedPrompts(cgResult.failedPrompts);
              _GenTab._showFailedPromptsSummaryModal(
                cgResult.failedPrompts,
                chatgptPrompts.length,
                cgResult.completed,
              );
            }
            _GenTab._providerSubmitRunning = false;
            _GenTab._resetRunningControls();
            if (window.ExecutionLock) ExecutionLock.release("prompts");
          } catch (err) {
            console.error("[GenTab] ChatGPT submit error:", err);
            sendLog("ChatGPT l\u1ED7i: " + (err.message || err), "error");
            if (window.ExecutionGate && _executionToken) {
              ExecutionGate.complete(_executionToken, "failed", {
                error: err.message || String(err),
              });
              _GenTab._currentExecutionToken = null;
            }
            _GenTab._providerSubmitRunning = false;
            _GenTab._resetRunningControls();
            if (window.ExecutionLock) ExecutionLock.release("prompts");
          }
          return;
        }
        const canFlow = !!window.featureGate?.canUse?.("gen_enabled");
        if (!canFlow) {
          if (window.authManager?.isLoggedIn?.()) {
            const shouldUpgrade = await window.customDialog?.confirm?.(
              window.I18n?.t?.("gen.flowProviderLockedMsg") ||
                "Google Flow requires a suitable plan. Upgrade to unlock.",
              {
                title:
                  window.I18n?.t?.("gen.providerLocked") || "Feature locked",
                type: "warning",
                confirmText: window.I18n?.t?.("common.upgrade") || "Upgrade",
                cancelText: window.I18n?.t?.("common.later") || "Later",
              },
            );
            if (shouldUpgrade) {
              chrome.runtime
                .sendMessage({ action: "showUpgradeModal" })
                .catch(() => {});
            }
          } else {
            window.featureGate?.showLoginPrompt?.(
              window.I18n?.t?.("gen.flowProviderLockedMsg") ||
                "Google Flow requires sign-in and a suitable plan.",
            );
          }
          try {
            _GenTab.startBtn.disabled = false;
          } catch (_) {}
          if (window.ExecutionLock) ExecutionLock.release("prompts");
          return;
        }
        const _apiIntended =
          _confirmedFlowExecutionMode !== "web" &&
          window.FlowApiAdapter?.isApiModeIntended?.() === true;
        let _zoomArmedHere = false;
        const _endZoomIfArmed = () => {
          if (!_zoomArmedHere) return;
          _zoomArmedHere = false;
          _GenTab._endZoomSession();
        };
        const _abortBeforeQueue = () => {
          _endZoomIfArmed();
          if (window.ExecutionGate && _executionToken) {
            try {
              ExecutionGate.cancel(_executionToken);
            } catch (_) {}
            if (_GenTab._currentExecutionToken === _executionToken)
              _GenTab._currentExecutionToken = null;
            _executionToken = null;
          }
          if (!_isPipelineMode && window.ExecutionLock)
            ExecutionLock.release("prompts");
          const hasQueuedPromptJob =
            _isPipelineMode &&
            (window.PromptQueue?.getInstance?.()?.getJobsByOwner?.("prompts")
              ?.length || 0) > 0;
          if (hasQueuedPromptJob) {
            _GenTab.startBtn.disabled = false;
            _GenTab._updateGenBtnUploadState();
          } else {
            window.eventBus?.emit("execution:tracker_update", {
              owner: "prompts",
              phase: "error",
            });
            _GenTab._resetRunningControls();
          }
        };
        if (!_apiIntended && window.MessageBridge?.sendToContentScript) {
          try {
            await window.MessageBridge.sendToContentScript(
              "beginFlowZoomSession",
              { factor: 0.3 },
            );
            _zoomArmedHere = true;
          } catch (e) {}
        }
        if (fileIds.length > 0 && typeof window.correctFileIds === "function") {
          const hasThumbs = Object.keys(_GenTab.thumbnailCache).length > 0;
          const hasFileNames = Object.keys(_GenTab.fileNameCache).length > 0;
          const hasMediaUuids =
            Object.keys(_GenTab.mediaUuidCache || {}).length > 0;
          if (hasThumbs || hasFileNames || hasMediaUuids) {
            const previousRefIds = [...fileIds];
            const { correctedIds, changed, mediaMetadata } =
              await window.correctFileIds(
                fileIds.join(", "),
                _GenTab.thumbnailCache,
                _GenTab.fileNameCache,
                _GenTab.mediaUuidCache,
              );
            if (changed) {
              const newIds = correctedIds
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              for (let k = 0; k < fileIds.length; k++) {
                const oldId = fileIds[k];
                const newId = newIds[k];
                if (oldId && newId && oldId !== newId) {
                  if (_GenTab.refImageNames[oldId]) {
                    _GenTab.refImageNames[newId] = _GenTab.refImageNames[oldId];
                    delete _GenTab.refImageNames[oldId];
                  }
                  const _pt1 = window.pendingUploadFiles?.get(oldId)?.thumbnail;
                  if (_GenTab.thumbnailCache[oldId] || _pt1) {
                    _GenTab.thumbnailCache[newId] =
                      _GenTab.thumbnailCache[oldId] || _pt1;
                    delete _GenTab.thumbnailCache[oldId];
                  }
                  if (_GenTab.fileNameCache[oldId]) {
                    _GenTab.fileNameCache[newId] = _GenTab.fileNameCache[oldId];
                    delete _GenTab.fileNameCache[oldId];
                  }
                  if (_GenTab.refMediaTypes?.[oldId]) {
                    _GenTab.refMediaTypes[newId] = _GenTab.refMediaTypes[oldId];
                    delete _GenTab.refMediaTypes[oldId];
                  }
                  if (_GenTab.refVideoUrls?.[oldId]) {
                    _GenTab.refVideoUrls[newId] = _GenTab.refVideoUrls[oldId];
                    delete _GenTab.refVideoUrls[oldId];
                  }
                  if (_GenTab.mediaUuidCache?.[oldId]) {
                    _GenTab.mediaUuidCache[newId] =
                      _GenTab.mediaUuidCache[oldId];
                    delete _GenTab.mediaUuidCache[oldId];
                  }
                }
              }
              console.log(
                "[GenTab] Ref IDs corrected:",
                fileIds.join(", "),
                "->",
                correctedIds,
              );
              fileIds = newIds;
              _GenTab.fileIdsInput.value = correctedIds;
              _GenTab.renderFileIdThumbnails();
              _GenTab.saveState();
            }
            for (const [oldId, info] of Object.entries(mediaMetadata || {})) {
              const index = previousRefIds.indexOf(oldId);
              const key = index >= 0 ? fileIds[index] : null;
              if (!key) continue;
              _GenTab.mediaUuidCache || (_GenTab.mediaUuidCache = {});
              if (info.media_uuid)
                _GenTab.mediaUuidCache[key] = info.media_uuid;
              if (info.file_name) _GenTab.fileNameCache[key] = info.file_name;
              if (info.thumbnail) _GenTab.thumbnailCache[key] = info.thumbnail;
              _GenTab.refMediaTypes || (_GenTab.refMediaTypes = {});
              _GenTab.refMediaTypes[key] =
                info.type || _GenTab.refMediaTypes[key];
              if (info.video_url) {
                _GenTab.refVideoUrls || (_GenTab.refVideoUrls = {});
                _GenTab.refVideoUrls[key] = info.video_url;
              }
            }
            if (Object.keys(mediaMetadata || {}).length)
              _GenTab.renderFileIdThumbnails();
            window.MediaRegistry?.auditRefIdentity?.(
              "gen:before-ref-existence",
              fileIds.map((id) => ({
                id,
                media_uuid: _GenTab.mediaUuidCache?.[id],
                file_name: _GenTab.fileNameCache?.[id],
                thumbnail: _GenTab.thumbnailCache?.[id],
                type: _GenTab.refMediaTypes?.[id],
                video_url: _GenTab.refVideoUrls?.[id],
              })),
              { surface: "gen" },
            );
          }
        }
        if (
          fileIds.length > 0 &&
          typeof window.reuploadMissingFiles === "function"
        ) {
          let preReuploadMissing = [];
          try {
            const nonPending = fileIds.filter(
              (id) => !id.startsWith("upload_"),
            );
            if (nonPending.length > 0 && window.MessageBridge) {
              const catalog =
                await window.MessageBridge.lookupFlowMediaCatalog?.(nonPending);
              if (catalog?.supported !== true) {
                const check =
                  await window.MessageBridge.checkTilesExist(nonPending);
                preReuploadMissing = check?.missing || [];
              }
            }
          } catch (e) {
            console.warn("[GenTab] Pre-reupload check failed:", e.message);
          }
          if (preReuploadMissing.length > 0) {
            _GenTab.startBtn.disabled = true;
            _GenTab._savedBtnText = _GenTab.startBtn.textContent;
            _GenTab.startBtn.textContent =
              window.I18n?.t("gen.reloadingImages") || "Reloading images...";
            _GenTab.startBtn.style.opacity = "0.6";
            for (const missingId of preReuploadMissing) {
              const thumbEl = _GenTab.fileIdThumbnails?.querySelector(
                `.ref-thumb[data-ref-id="${missingId}"]`,
              );
              if (thumbEl) thumbEl.classList.add("ref-thumb-reuploading");
            }
          }
          const fileIdsBefore = [...fileIds];
          const fileIdsStr = fileIds.join(", ");
          const updated = await window.reuploadMissingFiles(
            fileIdsStr,
            _GenTab.thumbnailCache || {},
            null,
            _GenTab.fileNameCache || {},
          );
          if (updated !== fileIdsStr) {
            const newIds = updated
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            console.log(
              "[GenTab] Ref IDs after reupload:",
              fileIdsStr,
              "->",
              updated,
            );
            fileIds = newIds;
            _GenTab.fileIdsInput.value = updated;
            _GenTab.renderFileIdThumbnails();
            _GenTab.saveState();
          }
          if (fileIds.length < fileIdsBefore.length) {
            const droppedIds = fileIdsBefore.filter(
              (id) => !fileIds.includes(id),
            );
            const droppedNames = droppedIds.map((id) => {
              const name = _GenTab.refImageNames?.[id];
              const fileName = _GenTab.fileNameCache?.[id];
              return (
                name ||
                (fileName ? fileName.substring(0, 12) : id.substring(0, 12))
              );
            });
            for (const id of droppedIds) {
              _GenTab._removeFailedAlbumImage(id);
              if (_GenTab.refImageNames) delete _GenTab.refImageNames[id];
              if (_GenTab.thumbnailCache) delete _GenTab.thumbnailCache[id];
              if (_GenTab.fileNameCache) delete _GenTab.fileNameCache[id];
            }
            _GenTab.renderFileIdThumbnails();
            _GenTab.saveState();
            const listText = droppedNames.map((n) => `  - ${n}`).join("\n");
            await window.customDialog?.alert(
              window.I18n?.t("gen.refImageUnavailable", {
                count: droppedIds.length,
                list: listText,
              }) ||
                `${droppedIds.length} reference image(s) no longer exist on Flow and cannot be restored:

${listText}

The images were removed from the album. Please choose other images.`,
              {
                title:
                  window.I18n?.t("gen.refImageUnavailableTitle") ||
                  "Reference images unavailable",
                type: "warning",
              },
            );
            if (_GenTab._savedBtnText) {
              _GenTab.startBtn.textContent = _GenTab._savedBtnText;
              _GenTab._savedBtnText = null;
            }
            _GenTab.startBtn.style.opacity = "";
            _GenTab.startBtn.disabled = false;
            _endZoomIfArmed();
            return;
          }
          if (preReuploadMissing.length > 0) {
            const reuploadingEls = _GenTab.fileIdThumbnails?.querySelectorAll(
              ".ref-thumb-reuploading",
            );
            if (reuploadingEls)
              reuploadingEls.forEach((el) =>
                el.classList.remove("ref-thumb-reuploading"),
              );
            if (_GenTab._savedBtnText) {
              _GenTab.startBtn.textContent = _GenTab._savedBtnText;
              _GenTab._savedBtnText = null;
            }
            _GenTab.startBtn.style.opacity = "";
          }
        }
        let finalPrompts = baseLines;
        if (finalPrompts.length === 0) {
          _endZoomIfArmed();
          return;
        }
        const selectedAddon = _GenTab._getSelectedAddonPrompt();
        if (selectedAddon && selectedAddon.content) {
          finalPrompts = finalPrompts.map(
            (prompt2) => `${prompt2}

${selectedAddon.content}`,
          );
        }
        const chainValidation = await _GenTab._validateChain(
          finalPrompts,
          genType,
          providerKey,
          _confirmedFlowExecutionMode,
        );
        if (!chainValidation.ok) {
          if (!chainValidation.silent)
            window.showNotification?.(
              chainValidation.message,
              "warning",
              chainValidation.durationMs || 4500,
            );
          _GenTab.startBtn.disabled = false;
          window.ExecutionLock?.release?.("prompts");
          if (window.ExecutionGate && _executionToken) {
            try {
              ExecutionGate.cancel(_executionToken);
            } catch (_) {}
            _GenTab._currentExecutionToken = null;
          }
          _endZoomIfArmed();
          return;
        }
        const chainPayload = chainValidation.chain;
        let missingStartFrames = _GenTab._getMissingStartFrameIndexes(
          finalPrompts.length,
          genType,
        );
        if (chainPayload?.kind === "video_last_frame")
          missingStartFrames = missingStartFrames.filter(
            (index) => index === 0,
          );
        if (missingStartFrames.length > 0) {
          _GenTab._renderPerPromptFrames(finalPrompts.length);
          _GenTab._markMissingStartFrames(missingStartFrames);
          const positions = missingStartFrames.map((i) => i + 1).join(", ");
          const message =
            window.I18n?.t?.("gen.framesMissingStart", { positions }) ||
            `Missing Start frame for prompt(s): ${positions}`;
          sendLog(message, "warn");
          window.showNotification?.(message, "warning");
          _GenTab.startBtn.disabled = false;
          if (window.ExecutionLock) ExecutionLock.release("prompts");
          if (window.ExecutionGate && _executionToken) {
            try {
              ExecutionGate.cancel(_executionToken);
            } catch (_) {}
            _GenTab._currentExecutionToken = null;
          }
          _endZoomIfArmed();
          document
            .querySelector(
              `.per-prompt-frame-pair[data-prompt-index="${missingStartFrames[0]}"]`,
            )
            ?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
          return;
        }
        const isMultiPrompt = finalPrompts.length > 1;
        if (_isPipelineMode) {
          _GenTab.startBtn.disabled = true;
          if (isMultiPrompt) {
            if (_GenTab.genRunningControls)
              _GenTab.genRunningControls.classList.remove("hidden");
            if (_GenTab.pauseBtn) {
              _GenTab.pauseBtn.classList.remove("paused");
              _GenTab.pauseBtn.innerHTML = `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
              </svg>`;
              _GenTab.pauseBtn.dataset.paused = "false";
            }
          }
        } else {
          _GenTab.startBtn.disabled = true;
          if (_GenTab.genBtnRow) {
            _GenTab.genBtnRow.classList.add("is-running");
          }
          if (_GenTab.genRunningControls) {
            _GenTab.genRunningControls.classList.remove("hidden");
          }
          if (_GenTab.pauseBtn) {
            _GenTab.pauseBtn.classList.remove("paused");
            _GenTab.pauseBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <rect x="6" y="4" width="4" height="16"></rect>
              <rect x="14" y="4" width="4" height="16"></rect>
            </svg>`;
            _GenTab.pauseBtn.dataset.paused = "false";
          }
        }
        window.UsageSync?.trackEvent("gen_start", {
          prompt_count: finalPrompts.length,
          has_ref: fileIds.length > 0,
          pipeline: !!_isPipelineMode,
        });
        if (window.eventBus) {
          window.eventBus.emit("execution:tracker_update", {
            owner: "prompts",
            label: "Auto Gen",
            phase: "started",
            current: 0,
            total: finalPrompts.length,
            promptText: finalPrompts[0] || "",
          });
        }
        const logContainer = document.getElementById("logContainer");
        if (logContainer) logContainer.innerHTML = "";
        const videoInputType = _GenTab.videoInputTypeSelect
          ? _GenTab.videoInputTypeSelect.value
          : "";
        const isVideoFrames =
          genType === "Video" && videoInputType === "Frames";
        let frameFileIds = null;
        if (isVideoFrames) {
          const isMultiPrompt2 = _GenTab.multiPromptCheck?.checked;
          const promptCount2 = _GenTab._getPromptCount();
          if (
            isMultiPrompt2 &&
            promptCount2 > 1 &&
            _GenTab._perPromptFrameData.length > 0
          ) {
            frameFileIds = [];
            for (let fi = 0; fi < promptCount2; fi++) {
              const ppData = _GenTab._perPromptFrameData[fi];
              frameFileIds.push({
                frame1: ppData?.frame1 || "",
                frame2: ppData?.frame2 || "",
              });
            }
          } else {
            const f1 = document.getElementById("genTabFrame1FileId");
            const f2 = document.getElementById("genTabFrame2FileId");
            frameFileIds = {
              frame1: f1 ? f1.value.trim() : "",
              frame2: f2 ? f2.value.trim() : "",
            };
          }
          if (chainPayload?.kind === "video_last_frame") {
            const first = Array.isArray(frameFileIds)
              ? frameFileIds[0]
              : frameFileIds;
            frameFileIds = [
              { frame1: first?.frame1 || "", frame2: "" },
              ...finalPrompts.slice(1).map(() => ({ frame1: "", frame2: "" })),
            ];
          }
        }
        const refImageMode = _GenTab.refImageMode;
        let mentionProcessed = null;
        if (refImageMode === "mention" && window.MentionParser) {
          const refImagesWithNames = _GenTab._getCurrentRefImagesWithNames();
          console.log("[GenTab] @mention refs prepared:", {
            count: refImagesWithNames.length,
          });
          if (window.imageNameRegistry) {
            window.imageNameRegistry.registerFromRefImages(refImagesWithNames);
          }
          mentionProcessed =
            window.MentionParser.processMultiPrompts(finalPrompts);
          console.log("[GenTab] @mention parsed:", {
            prompts: mentionProcessed.length,
            resolvedRefs: mentionProcessed.reduce(
              (sum, entry) => sum + (entry.refImages?.length || 0),
              0,
            ),
            unresolvedPrompts: mentionProcessed.filter(
              (entry) => entry.hasUnresolvedMentions,
            ).length,
          });
          const unresolvedPrompts = mentionProcessed.filter(
            (p) => p.hasUnresolvedMentions,
          );
          if (unresolvedPrompts.length > 0) {
            const unresolvedNames = unresolvedPrompts.flatMap((p) =>
              p.mentions
                .filter((m) => !m.found)
                .map((m) => "@" + m.mention.imageName),
            );
            const uniqueNames = [...new Set(unresolvedNames)];
            sendLog(
              window.I18n?.t("gen.mentionWarning", {
                names: uniqueNames.join(", "),
              }) || `Warning: No images found for ${uniqueNames.join(", ")}`,
              "warn",
            );
          }
          _GenTab._uploadingRefIds = _GenTab._uploadingRefIds || new Set();
          _GenTab._uploadingRefIds.clear();
          const mentionUploadUi = { fileIds: [...fileIds], frameFileIds };
          if (window.MentionParser.uploadPendingImagesBatch) {
            await window.MentionParser.uploadPendingImagesBatch(
              mentionProcessed,
              {
                surface: "gen",
                onProgress: (progress) =>
                  _GenTab._applyLocalUploadProgress(progress, mentionUploadUi),
              },
            );
          } else {
            await window.MentionParser.uploadPendingImages(mentionProcessed, {
              surface: "gen",
              onProgress: (progress) =>
                _GenTab._applyLocalUploadProgress(progress, mentionUploadUi),
            });
          }
          console.log("[GenTab] @mention uploads resolved:", {
            prompts: mentionProcessed.length,
            flowRefs: mentionProcessed.reduce(
              (sum, entry) =>
                sum +
                (entry.refImages?.filter(
                  (ref) =>
                    ref.file_id && !String(ref.file_id).startsWith("upload_"),
                ).length || 0),
              0,
            ),
          });
          const uploadedRefImages = mentionProcessed.flatMap(
            (p) => p.refImages || [],
          );
          for (const ref of uploadedRefImages) {
            if (
              ref._pendingUploadKey &&
              ref.file_id &&
              !ref.file_id.startsWith("upload_")
            ) {
              const oldKey = ref._pendingUploadKey;
              const newId = ref.file_id;
              const idx = fileIds.indexOf(oldKey);
              if (idx !== -1) {
                fileIds[idx] = newId;
              }
              if (_GenTab.refImageNames[oldKey]) {
                _GenTab.refImageNames[newId] = _GenTab.refImageNames[oldKey];
                delete _GenTab.refImageNames[oldKey];
              }
              const _pt2 = window.pendingUploadFiles?.get(oldKey)?.thumbnail;
              if (_GenTab.thumbnailCache[oldKey] || _pt2) {
                _GenTab.thumbnailCache[newId] =
                  _GenTab.thumbnailCache[oldKey] || _pt2;
                delete _GenTab.thumbnailCache[oldKey];
              }
              if (_GenTab.refMediaTypes?.[oldKey]) {
                _GenTab.refMediaTypes[newId] = _GenTab.refMediaTypes[oldKey];
                delete _GenTab.refMediaTypes[oldKey];
              }
              if (_GenTab.refVideoUrls?.[oldKey]) {
                _GenTab.refVideoUrls[newId] = _GenTab.refVideoUrls[oldKey];
                delete _GenTab.refVideoUrls[oldKey];
              }
              _GenTab.mediaUuidCache || (_GenTab.mediaUuidCache = {});
              if (ref.media_uuid)
                _GenTab.mediaUuidCache[newId] = ref.media_uuid;
              if (ref.file_name) _GenTab.fileNameCache[newId] = ref.file_name;
              if (ref.thumbnail_url)
                _GenTab.thumbnailCache[newId] = ref.thumbnail_url;
              if (ref.video_url) {
                _GenTab.refVideoUrls || (_GenTab.refVideoUrls = {});
                _GenTab.refVideoUrls[newId] = ref.video_url;
              }
              if (ref.media_type) {
                _GenTab.refMediaTypes || (_GenTab.refMediaTypes = {});
                _GenTab.refMediaTypes[newId] = ref.media_type;
              }
              window.pendingUploadFiles?.delete(oldKey);
              console.log(
                `[GenTab] @mention: UI updated ${oldKey.substring(0, 15)}... \u2192 ${newId.substring(0, 20)}...`,
              );
            }
          }
          _GenTab._uploadingRefIds?.clear();
          window.MediaRegistry?.auditRefIdentity?.(
            "gen:uploads-ready",
            uploadedRefImages.map((ref) => ({ ...ref, type: ref.media_type })),
            { surface: "gen" },
          );
          if (_GenTab.fileIdsInput) {
            _GenTab.fileIdsInput.value = fileIds.join(", ");
            _GenTab.renderFileIdThumbnails();
          }
          const needReselect = mentionProcessed.flatMap((p) =>
            (p.refImages || [])
              .filter((ref) => ref._needReselect)
              .map((ref) => ref.name),
          );
          if (needReselect.length > 0) {
            const uniqueNames = [...new Set(needReselect)];
            sendLog(
              window.I18n?.t("gen.mentionReselect", {
                names: uniqueNames.join(", "),
              }) ||
                `Warning: Images "${uniqueNames.join(", ")}" are no longer available; please select them again`,
              "warn",
            );
            if (window.customDialog) {
              window.customDialog.alert(
                window.I18n?.t("gen.mentionReselectDialog", {
                  list: uniqueNames.map((n) => "\u2022 @" + n).join("\n"),
                }) ||
                  `Some images are no longer available:
${uniqueNames.map((n) => "\u2022 @" + n).join("\n")}

Please open the Album and reselect the images.`,
                window.I18n?.t("gen.mentionReselectTitle") ||
                  "Images need reselection",
              );
            }
          }
        }
        const refPerPrompt = refImageMode === "sequential";
        const isMultiPromptEnabled = _GenTab.multiPromptCheck?.checked;
        const isParallelMode =
          !isMultiPromptEnabled || _GenTab.runMode === "parallel";
        console.log(
          "[GenTab] Submit mode check: multiPrompt=",
          isMultiPromptEnabled,
          "runMode=",
          _GenTab.runMode,
          "isParallelMode=",
          isParallelMode,
        );
        const canUseAutoDownload =
          window.featureGate?.canUse("auto_download") ?? false;
        const autoDownloadToggle =
          document.getElementById("genTabAutoDownload");
        const autoDownload =
          canUseAutoDownload && (autoDownloadToggle?.checked || false);
        const downloadResolution =
          document.getElementById("genTabDownloadResolution")?.value || "1k";
        const videoDownloadResolution =
          document.getElementById("genTabVideoDownloadResolution")?.value ||
          "720p";
        let flowVideoDuration = _GenTab.flowVideoDurationSelect?.value || null;
        const flowVideoResolution =
          providerKey === "flow" && genType === "Video"
            ? _GenTab.flowVideoResolutionSelect?.value || null
            : null;
        if (flowVideoDuration && genType === "Video" && fileIds.length > 0) {
          const flowAdapter = window.ProviderRegistry?.get?.("flow");
          const _gtHasRefVideo = fileIds.some(
            (id) => _GenTab.refMediaTypes?.[id] === "video",
          );
          const forced = flowAdapter?.getDurationOverride?.({
            modelValue: modelName,
            hasRef: true,
            hasRefVideo: _gtHasRefVideo,
            inputType: "Ingredients",
          });
          if (forced && forced !== flowVideoDuration) {
            sendLog(
              `[Model Constraint] Duration \xE9p ${flowVideoDuration} \u2192 ${forced} (${modelName} + ref image). \u0110\u1ED5i UI \u0111\u1EC3 kh\u1EDBp.`,
              "warn",
            );
            flowVideoDuration = forced;
            if (_GenTab.flowVideoDurationSelect) {
              try {
                _GenTab.flowVideoDurationSelect.value = forced;
              } catch (_) {}
            }
          }
        }
        const genSubFolder =
          document.getElementById("genTabSubFolder")?.value?.trim() || null;
        const refLimit = _GenTab.getRefLimit();
        if (fileIds.length > refLimit) {
          sendLog(
            window.I18n?.t("gen.refExceedLimitLog", {
              count: fileIds.length,
              limit: refLimit,
            }) ||
              `Reference images exceed the limit (${fileIds.length}/${refLimit}); only the first ${refLimit} will be sent`,
            "warn",
          );
          fileIds = fileIds.slice(0, refLimit);
        }
        if (fileIds.length > 0) {
          const _flowAdapter = window.ProviderRegistry?.get?.("flow");
          if (_flowAdapter?.supportsRefImages) {
            const _gtInputTypeStrip =
              genType === "Video"
                ? _GenTab.videoInputTypeSelect?.value || "Ingredients"
                : void 0;
            const _gtDurationStrip =
              genType === "Video" ? flowVideoDuration || void 0 : void 0;
            if (
              !_flowAdapter.supportsRefImages(modelName, {
                inputType: _gtInputTypeStrip,
                duration: _gtDurationStrip,
              })
            ) {
              const _ctxStr = _gtInputTypeStrip
                ? ` (${_gtInputTypeStrip}${_gtDurationStrip ? ", " + _gtDurationStrip : ""})`
                : "";
              sendLog(
                window.I18n?.t("gen.modelNoRefSupport", {
                  model: modelName,
                  count: fileIds.length,
                }) ||
                  `[Model Constraint] Model "${modelName}"${_ctxStr} does not support reference images \u2014 skipping ${fileIds.length} images`,
                "warn",
              );
              fileIds = [];
            }
          }
        }
        let payloadFileIds = isVideoFrames ? [] : fileIds;
        let payloadPrompts = finalPrompts;
        if (refImageMode === "mention" && mentionProcessed) {
          payloadPrompts = mentionProcessed.map((p) => p.originalPrompt);
        } else if (refImageMode === "none") {
          payloadFileIds = [];
        }
        const inputTimeoutMs =
          window.storageSettings?.getSettings()?.inputTimeout || 1200;
        let voicePayload = null;
        try {
          const voiceSlug =
            document.getElementById("genVideoVoiceSelect")?.value || "";
          if (voiceSlug && genType === "Video" && !isVideoFrames) {
            const voiceObj = window.VoiceRegistry?.findBySlug?.(voiceSlug);
            if (voiceObj?.search_value) {
              voicePayload = {
                slug: voiceObj.slug,
                search_value: voiceObj.search_value,
              };
            }
          }
        } catch (_) {}
        let characterPayload = null;
        try {
          const charSlug =
            document.getElementById("genCharacterSelect")?.value || "";
          if (charSlug && !isVideoFrames) {
            characterPayload =
              window.CharacterRegistry?.payload?.(charSlug) || null;
          }
        } catch (_) {}
        const payload = {
          prompts: payloadPrompts,
          delayBetweenMs,
          inputTimeoutMs,
          fileIds: payloadFileIds,
          fileNameMap: _GenTab.fileNameCache || {},
          genType,
          aspectRatio,
          modelName,
          frameFileIds,
          isFrames: isVideoFrames,
          refPerPrompt,
          quantity,
          noTileWait: isParallelMode,
          autoDownload,
          downloadResolution,
          videoDownloadResolution,
          flowVideoDuration,
          skipFlowDurationControl:
            providerKey === "flow" &&
            genType === "Video" &&
            window.ModelRegistry?.findModel?.("flow", modelName)?.config
              ?.duration_tier === "default",
          flowVideoResolution,
          refImagesPerPrompt: window.RefImageAssignment.count(
            _GenTab.refImagesPerPrompt,
          ),
          refImageMode,
          mentionData: refImageMode === "mention" ? mentionProcessed : null,
          taskName: genSubFolder,
          voice: voicePayload,
          character: characterPayload,
          chain: chainPayload,
        };
        if (isMultiPromptEnabled) {
          if (isParallelMode) {
            sendLog(
              window.I18n?.t("gen.modeParallelLog") ||
                "Parallel mode: submit continuously, do not wait for results between prompts",
              "info",
            );
          } else {
            sendLog(
              "Ch\u1EBF \u0111\u1ED9 Tu\u1EA7n t\u1EF1: ch\u1EDD k\u1EBFt qu\u1EA3 t\u1EEBng prompt tr\u01B0\u1EDBc khi submit ti\u1EBFp",
              "info",
            );
          }
        }
        if (refImageMode === "all") {
          sendLog(
            window.I18n?.t("gen.modeAllLog") ||
              "All images mode: use all images for each prompt",
            "info",
          );
        } else if (refImageMode === "mention") {
          sendLog(
            window.I18n?.t("gen.modeMentionLog") ||
              "@Mention mode: each prompt uses @mentioned images",
            "info",
          );
        } else if (refImageMode === "sequential") {
          sendLog(
            window.I18n?.t("gen.modeSequentialLog") ||
              "Reference images: each prompt uses 1 image by index",
            "info",
          );
        } else if (refImageMode === "none") {
          sendLog(
            window.I18n?.t("gen.modeNoneLog") ||
              "No images mode: do not use reference images",
            "info",
          );
        }
        console.log("[GenTab] Pre-upload check: fileIds=", payload.fileIds);
        console.log(
          "[GenTab] pendingUploadFiles keys:",
          window.pendingUploadFiles
            ? [...window.pendingUploadFiles.keys()]
            : "NOT_INIT",
        );
        console.log(
          "[GenTab] MessageBridge:",
          !!window.MessageBridge,
          "uploadPendingFiles:",
          typeof window.uploadPendingFiles,
        );
        if (
          window.MessageBridge &&
          typeof window.uploadPendingFiles === "function"
        ) {
          const pendingIds = payload.fileIds.filter((id) =>
            id.startsWith("upload_"),
          );
          console.log("[GenTab] pendingIds to upload:", pendingIds);
          if (pendingIds.length > 0) {
            _GenTab._uploadingRefIds = _GenTab._uploadingRefIds || new Set();
            _GenTab._uploadingRefIds.clear();
            _GenTab.renderFileIdThumbnails();
            _GenTab._renderPerPromptFrames(_GenTab._getPromptCount());
            _GenTab._renderFramePreviews();
            const _btnLabelSpan =
              _GenTab.startBtn?.querySelector("span") || null;
            const _savedBtnLabel = _btnLabelSpan?.textContent;
            if (_btnLabelSpan) {
              _btnLabelSpan.textContent =
                window.I18n?.t("gen.uploadingImages") || "Uploading images...";
            }
            _GenTab._setRefModeUploadLock(true);
            const localUpload = _GenTab._beginLocalUpload();
            let localUploadReady = false;
            try {
              sendLog(
                window.I18n?.t("gen.uploadingRefImages", {
                  count: pendingIds.length,
                }) ||
                  `Uploading ${pendingIds.length} reference images to Flow...`,
                "info",
              );
              const originalFileIds = [...payload.fileIds];
              const uploaded = await window.uploadPendingFiles(
                payload.fileIds.join(", "),
                {
                  surface: "gen",
                  forceDom: !_apiIntended,
                  abortFn: localUpload.abortFn,
                  onProgress: (progress) => {
                    localUpload.onProgress(progress);
                    _GenTab._applyLocalUploadProgress(progress, payload);
                  },
                  onError: (error) =>
                    sendLog(
                      (window.I18n?.t("gen.uploadRefError") ||
                        "Reference image upload error") +
                        ": " +
                        (error.message || error),
                      "error",
                    ),
                },
              );
              const uploadedIds = uploaded
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              const hasRealTileId = uploadedIds.some(
                (id) => !id.startsWith("upload_"),
              );
              if (hasRealTileId) {
                try {
                  const _oldIds = originalFileIds || [];
                  const _uploadMapping = window._lastUploadKeyMapping || {};
                  for (const _o of _oldIds) {
                    const _n =
                      _uploadMapping[_o] ||
                      (uploadedIds.includes(_o) ? _o : null);
                    if (!_o || !_n || _o === _n) continue;
                    const _pendThumb =
                      window.pendingUploadFiles?.get(_o)?.thumbnail;
                    if (_GenTab.thumbnailCache[_o] || _pendThumb) {
                      _GenTab.thumbnailCache[_n] =
                        _GenTab.thumbnailCache[_o] || _pendThumb;
                      delete _GenTab.thumbnailCache[_o];
                    }
                    if (_GenTab.refImageNames[_o]) {
                      _GenTab.refImageNames[_n] = _GenTab.refImageNames[_o];
                      delete _GenTab.refImageNames[_o];
                    }
                    if (_GenTab.fileNameCache[_o]) {
                      _GenTab.fileNameCache[_n] = _GenTab.fileNameCache[_o];
                      delete _GenTab.fileNameCache[_o];
                    }
                    if (_GenTab.refMediaTypes?.[_o]) {
                      _GenTab.refMediaTypes[_n] = _GenTab.refMediaTypes[_o];
                      delete _GenTab.refMediaTypes[_o];
                    }
                    if (_GenTab.refVideoUrls?.[_o]) {
                      _GenTab.refVideoUrls[_n] = _GenTab.refVideoUrls[_o];
                      delete _GenTab.refVideoUrls[_o];
                    }
                    _GenTab._replacePerPromptFrameId(
                      _o,
                      _n,
                      _GenTab.thumbnailCache[_n] || "",
                    );
                    for (const frameNum of [1, 2]) {
                      const input = document.getElementById(
                        `genTabFrame${frameNum}FileId`,
                      );
                      if (input?.value === _o)
                        _GenTab._setFrameImage(
                          frameNum,
                          _n,
                          _GenTab.thumbnailCache[_n] || "",
                        );
                    }
                    if (Array.isArray(payload.frameFileIds)) {
                      payload.frameFileIds = payload.frameFileIds.map((fp) => ({
                        ...fp,
                        frame1: fp?.frame1 === _o ? _n : fp?.frame1,
                        frame2: fp?.frame2 === _o ? _n : fp?.frame2,
                      }));
                    } else if (payload.frameFileIds) {
                      if (payload.frameFileIds.frame1 === _o)
                        payload.frameFileIds.frame1 = _n;
                      if (payload.frameFileIds.frame2 === _o)
                        payload.frameFileIds.frame2 = _n;
                    }
                  }
                } catch (_) {}
                payload.fileIds = uploadedIds;
                if (_GenTab.fileIdsInput) {
                  _GenTab.fileIdsInput.value = payload.fileIds.join(", ");
                  _GenTab.renderFileIdThumbnails();
                }
              }
              const remainingPending = payload.fileIds.filter((id) =>
                id.startsWith("upload_"),
              );
              if (localUpload.abortFn()) {
                _GenTab.startBtn.disabled = false;
                return;
              }
              if (remainingPending.length > 0) {
                sendLog(
                  `${remainingPending.length} reference image(s) could not be verified on Flow. Generation stopped; retry the upload.`,
                  "error",
                );
                _GenTab.startBtn.disabled = false;
                return;
              }
              localUploadReady = true;
            } catch (err) {
              sendLog(
                (window.I18n?.t("gen.uploadRefError") ||
                  "Reference image upload error") +
                  ": " +
                  (err.message || err),
                "error",
              );
              _GenTab.startBtn.disabled = false;
              return;
            } finally {
              localUpload.finish(localUploadReady);
              _GenTab._setRefModeUploadLock(false);
              const uploadingEls = _GenTab.fileIdThumbnails?.querySelectorAll(
                ".ref-thumb-uploading",
              );
              if (uploadingEls)
                uploadingEls.forEach((el) =>
                  el.classList.remove("ref-thumb-uploading"),
                );
              pendingIds.forEach((id) => _GenTab._uploadingRefIds?.delete(id));
              _GenTab.renderFileIdThumbnails();
              if (_btnLabelSpan && typeof _savedBtnLabel === "string") {
                _btnLabelSpan.textContent = _savedBtnLabel;
              }
              if (!localUploadReady) _abortBeforeQueue();
            }
          }
        }
        if (
          window.MessageBridge &&
          typeof window.uploadPendingFiles === "function" &&
          payload.frameFileIds
        ) {
          const framePendingIds = [];
          if (Array.isArray(payload.frameFileIds)) {
            payload.frameFileIds.forEach((fp) => {
              if (fp?.frame1?.startsWith("upload_"))
                framePendingIds.push(fp.frame1);
              if (fp?.frame2?.startsWith("upload_"))
                framePendingIds.push(fp.frame2);
            });
          } else {
            if (payload.frameFileIds.frame1?.startsWith("upload_"))
              framePendingIds.push(payload.frameFileIds.frame1);
            if (payload.frameFileIds.frame2?.startsWith("upload_"))
              framePendingIds.push(payload.frameFileIds.frame2);
          }
          const uniqueFramePending = [...new Set(framePendingIds)];
          if (uniqueFramePending.length > 0) {
            _GenTab._uploadingRefIds = _GenTab._uploadingRefIds || new Set();
            _GenTab._uploadingRefIds.clear();
            _GenTab.renderFileIdThumbnails();
            _GenTab._renderPerPromptFrames(_GenTab._getPromptCount());
            _GenTab._renderFramePreviews();
            const localUpload = _GenTab._beginLocalUpload();
            let localUploadReady = false;
            try {
              sendLog(
                `\u0110ang upload ${uniqueFramePending.length} video frames l\xEAn Flow...`,
                "info",
              );
              const uploadedFrames = await window.uploadPendingFiles(
                uniqueFramePending.join(", "),
                {
                  surface: "gen",
                  forceDom: !_apiIntended,
                  abortFn: localUpload.abortFn,
                  onProgress: (progress) => {
                    localUpload.onProgress(progress);
                    _GenTab._applyLocalUploadProgress(progress, payload);
                  },
                },
              );
              const uploadedArr = uploadedFrames
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              const frameMapping = { ...(window._lastUploadKeyMapping || {}) };
              const unresolvedFrames = uniqueFramePending.filter(
                (id) => !frameMapping[id],
              );
              if (Object.keys(frameMapping).length > 0) {
                for (const [oldId, newId] of Object.entries(frameMapping)) {
                  const thumb =
                    _GenTab.thumbnailCache?.[newId] ||
                    _GenTab.thumbnailCache?.[oldId] ||
                    window.MediaRegistry?.getThumb?.(newId) ||
                    "";
                  if (_GenTab.fileIdsInput) {
                    const sourceIds = _GenTab
                      ._getFrameSourceIds()
                      .map((id) => (id === oldId ? newId : id));
                    _GenTab.fileIdsInput.value = [...new Set(sourceIds)].join(
                      ", ",
                    );
                  }
                  if (_GenTab.refMediaTypes?.[oldId]) {
                    _GenTab.refMediaTypes[newId] = _GenTab.refMediaTypes[oldId];
                    delete _GenTab.refMediaTypes[oldId];
                  }
                  if (_GenTab.refVideoUrls?.[oldId]) {
                    _GenTab.refVideoUrls[newId] = _GenTab.refVideoUrls[oldId];
                    delete _GenTab.refVideoUrls[oldId];
                  }
                  _GenTab._replacePerPromptFrameId(oldId, newId, thumb);
                  for (const frameNum of [1, 2]) {
                    const input = document.getElementById(
                      `genTabFrame${frameNum}FileId`,
                    );
                    if (input?.value === oldId)
                      _GenTab._setFrameImage(frameNum, newId, thumb);
                  }
                }
                if (Array.isArray(payload.frameFileIds)) {
                  payload.frameFileIds = payload.frameFileIds.map((fp) => ({
                    ...fp,
                    frame1: frameMapping[fp.frame1] || fp.frame1,
                    frame2: frameMapping[fp.frame2] || fp.frame2,
                  }));
                } else {
                  if (frameMapping[payload.frameFileIds.frame1]) {
                    payload.frameFileIds.frame1 =
                      frameMapping[payload.frameFileIds.frame1];
                  }
                  if (frameMapping[payload.frameFileIds.frame2]) {
                    payload.frameFileIds.frame2 =
                      frameMapping[payload.frameFileIds.frame2];
                  }
                }
                _GenTab._renderFrameSourcePanel();
                _GenTab.saveState?.();
              }
              if (localUpload.abortFn()) return;
              if (unresolvedFrames.length > 0) {
                throw new Error(
                  `Kh\xF4ng upload \u0111\u01B0\u1EE3c ${unresolvedFrames.length} video frame(s)`,
                );
              }
              localUploadReady = true;
            } catch (err) {
              sendLog(
                "L\u1ED7i upload video frames: " + (err.message || err),
                "error",
              );
              return;
            } finally {
              localUpload.finish(localUploadReady);
              uniqueFramePending.forEach((id) =>
                _GenTab._uploadingRefIds?.delete(id),
              );
              _GenTab.renderFileIdThumbnails();
              _GenTab._renderPerPromptFrames(_GenTab._getPromptCount());
              _GenTab._renderFramePreviews();
              _GenTab._renderFrameSourcePanel();
              if (!localUploadReady) _abortBeforeQueue();
            }
          }
        }
        if (payload.refImageMode === "sequential" && !payload.frameFileIds) {
          payload.refFileIdsPerPrompt = payload.prompts.map((_, index) =>
            window.RefImageAssignment.select(
              payload.fileIds,
              index,
              payload.refImagesPerPrompt,
            ),
          );
        }
        if (window.PromptQueue && PromptQueue.isEnabled()) {
          let pipelineRefFileIds = payload.fileIds || [];
          let refFileIdsPerPrompt = null;
          const isVideoFrames2 = !!payload.frameFileIds;
          if (isVideoFrames2) {
            if (Array.isArray(payload.frameFileIds)) {
              const frameIds = new Set();
              payload.frameFileIds.forEach((fp) => {
                if (fp?.frame1) frameIds.add(fp.frame1);
                if (fp?.frame2) frameIds.add(fp.frame2);
              });
              pipelineRefFileIds = [...frameIds];
              refFileIdsPerPrompt = payload.frameFileIds.map((fp) => {
                const ids = [];
                if (fp?.frame1) ids.push(fp.frame1);
                if (fp?.frame2) ids.push(fp.frame2);
                return ids;
              });
            } else {
              const frameIds = [];
              if (payload.frameFileIds.frame1)
                frameIds.push(payload.frameFileIds.frame1);
              if (payload.frameFileIds.frame2)
                frameIds.push(payload.frameFileIds.frame2);
              pipelineRefFileIds = frameIds;
            }
          }
          if (
            !refFileIdsPerPrompt &&
            payload.refImageMode === "sequential" &&
            payload.fileIds?.length > 0
          ) {
            refFileIdsPerPrompt = payload.prompts.map((_, i) =>
              window.RefImageAssignment.select(
                payload.fileIds,
                i,
                payload.refImagesPerPrompt,
              ),
            );
          } else if (
            !refFileIdsPerPrompt &&
            payload.refImageMode === "mention" &&
            payload.mentionData
          ) {
            refFileIdsPerPrompt = payload.mentionData.map((md) =>
              [
                ...new Set(
                  (md?.refImages || [])
                    .filter((ref) => ref.file_id)
                    .map((ref) => ref.file_id),
                ),
              ].slice(0, refLimit),
            );
          }
          const _refFileNamesForJob = {};
          for (const fid of pipelineRefFileIds || []) {
            const mediaUuid = _GenTab.mediaUuidCache?.[fid];
            if (mediaUuid || _GenTab.fileNameCache?.[fid]) {
              _refFileNamesForJob[fid] =
                mediaUuid || _GenTab.fileNameCache[fid];
            }
          }
          if (Array.isArray(refFileIdsPerPrompt)) {
            for (const arr of refFileIdsPerPrompt) {
              for (const fid of arr || []) {
                const mediaUuid = _GenTab.mediaUuidCache?.[fid];
                if (
                  (mediaUuid || _GenTab.fileNameCache?.[fid]) &&
                  !_refFileNamesForJob[fid]
                ) {
                  _refFileNamesForJob[fid] =
                    mediaUuid || _GenTab.fileNameCache[fid];
                }
              }
            }
          }
          const _refThumbnailsForJob = {};
          for (const fid of new Set([
            ...(pipelineRefFileIds || []),
            ...(refFileIdsPerPrompt || []).flat().filter(Boolean),
          ])) {
            const identity =
              window.MediaRegistry?.getRefIdentity?.(fid) || null;
            const thumbnail =
              _GenTab.thumbnailCache?.[fid] || identity?.thumbnail || null;
            if (identity || thumbnail)
              _refThumbnailsForJob[fid] = {
                ...(identity || {}),
                ...(thumbnail && { thumbnail }),
              };
          }
          const _pqInst = window.PromptQueue?.getInstance?.();
          const _hasManualWait = !!(
            _pqInst?._jobs &&
            Array.from(_pqInst._jobs.values()).some(
              (j) =>
                j.isActive &&
                j.items?.some((it) => it.state === "WAITING_USER"),
            )
          );
          const pipelineStartedAt = Date.now();
          PromptQueue.getInstance()
            .submitJob({
              owner: "prompts",
              label: "Auto Gen",
              prompts: payload.prompts,
              settings: {
                genType: payload.genType,
                ratio: payload.aspectRatio,
                model: payload.modelName,
                isFrames: isVideoFrames2,
                quantity: payload.quantity || 1,
                flowVideoDuration: payload.flowVideoDuration || null,
                flowVideoResolution: payload.flowVideoResolution || null,
                manualSubmitMode: _manualSubmitMode,
                ...(_confirmedFlowExecutionMode && {
                  flowExecutionMode: _confirmedFlowExecutionMode,
                }),
                refVideoIds: (pipelineRefFileIds || []).filter(
                  (id) => _GenTab.refMediaTypes?.[id] === "video",
                ),
              },
              refFileIds: pipelineRefFileIds,
              refFileNames: _refFileNamesForJob,
              refThumbnails: _refThumbnailsForJob,
              refImageMode: isVideoFrames2
                ? Array.isArray(payload.frameFileIds)
                  ? "sequential"
                  : "all"
                : payload.refImageMode || "all",
              refFileIdsPerPrompt,
              refImagesPerPrompt: payload.refImagesPerPrompt,
              mentionData: payload.mentionData || null,
              autoDownload: payload.autoDownload,
              downloadResolution: payload.downloadResolution || null,
              videoDownloadResolution: payload.videoDownloadResolution || null,
              taskName: payload.taskName || null,
              voice: payload.voice || null,
              character: payload.character || null,
              chain: payload.chain || null,
              projectId: window._currentProjectId || null,
              sequentialMode: (() => {
                const isMultiPromptEnabled2 = _GenTab.multiPromptCheck?.checked;
                const seq =
                  !!payload.chain ||
                  (isMultiPromptEnabled2 && _GenTab.runMode === "sequential");
                console.log(
                  "[GenTab] Pipeline submit: multiPrompt=",
                  isMultiPromptEnabled2,
                  "runMode=",
                  _GenTab.runMode,
                  "sequentialMode=",
                  seq,
                );
                return seq;
              })(),
              _executionToken,
            })
            .then((result) => {
              if (result.interrupted) {
                _GenTab._currentExecutionToken = null;
                window.eventBus?.emit("execution:tracker_update", {
                  owner: "prompts",
                  phase: "stopped",
                });
                if (
                  PromptQueue.getInstance().getJobsByOwner("prompts").length ===
                  0
                )
                  _GenTab._resetRunningControls();
                return;
              }
              const partialPrompts = Number(result.partial) || 0;
              const terminalErrorCount =
                (Number(result.failed) || 0) + partialPrompts;
              const completedOutputs = Number.isFinite(result.completedOutputs)
                ? result.completedOutputs
                : (result.resultTileIds || []).length;
              const failedOutputs = Number.isFinite(result.failedOutputs)
                ? result.failedOutputs
                : 0;
              const expectedOutputs = Math.max(
                1,
                (payload.prompts?.length || 1) *
                  (parseInt(payload.quantity) || 1),
              );
              sendLog(
                `Pipeline ho\xE0n t\u1EA5t: ${completedOutputs}/${expectedOutputs} output th\xE0nh c\xF4ng, ${failedOutputs} output th\u1EA5t b\u1EA1i${partialPrompts ? ` (${partialPrompts} prompt m\u1ED9t ph\u1EA7n)` : ""}${result.stopped ? " (\u0111\xE3 d\u1EEBng)" : ""}`,
                terminalErrorCount > 0 ? "warning" : "info",
              );
              window.UsageSync?.trackEvent("gen_complete", {
                success_count: completedOutputs,
                fail_count: failedOutputs,
              });
              _GenTab._currentExecutionToken = null;
              const pipelineThumbnails = result.resultThumbnails || {};
              const pipelineResultIds = [
                ...new Set((result.resultTileIds || []).filter(Boolean)),
              ];
              const expectedResultCount = expectedOutputs;
              const generationCompleteDespiteStop =
                result.stopped === true &&
                pipelineResultIds.length >= expectedResultCount;
              if (window.eventBus) {
                window.eventBus.emit("execution:tracker_update", {
                  owner: "prompts",
                  phase:
                    result.stopped && !generationCompleteDespiteStop
                      ? "stopped"
                      : terminalErrorCount > 0
                        ? "error"
                        : "completed",
                  current:
                    result.stopped && !generationCompleteDespiteStop
                      ? (result.completed || 0) + (result.failed || 0)
                      : payload.prompts?.length || 0,
                  total: payload.prompts?.length || 0,
                  errorCount: terminalErrorCount,
                });
                const historyThumbs = Object.values(pipelineThumbnails);
                const historyRefIds = Array.isArray(result.refFileIdsUsed)
                  ? result.refFileIdsUsed
                  : pipelineRefFileIds || [];
                window.eventBus.emit("prompt:completed", {
                  prompt: payload.prompts?.join("\n\n") || "",
                  media_type: payload.genType || "image",
                  model: payload.modelName || "",
                  ratio: payload.aspectRatio || "",
                  prompt_count: payload.prompts?.length || 1,
                  quantity: parseInt(payload.quantity) || 1,
                  ref_file_ids: historyRefIds.join(", "),
                  ref_thumbnails: _GenTab._historyRefThumbnails(historyRefIds),
                  result_file_ids: pipelineResultIds.join(", "),
                  result_flow_file_ids: Array.isArray(result.apiResultTileIds)
                    ? [...new Set(result.apiResultTileIds.filter(Boolean))]
                    : [],
                  result_thumbnails:
                    historyThumbs.length > 0 ? historyThumbs : [],
                  result_provider_urls: result.resultProviderUrls || {},
                  flow_api_versions: result.flowApiVersions || [],
                  historyRoute: result.historyRoute || null,
                  error_details: result.errorDetails || [],
                  result_file_names: Object.fromEntries(
                    Object.entries(pipelineThumbnails)
                      .filter(([, v]) => v?.file_name)
                      .map(([k, v]) => [k, v.file_name]),
                  ),
                  source: "gen",
                  submit_mode: _manualSubmitMode ? "manual" : "auto",
                  provider: "flow",
                  duration_ms: Number.isFinite(result.durationMs)
                    ? result.durationMs
                    : null,
                  stop_origin:
                    result.stopped && !generationCompleteDespiteStop
                      ? result.stopOrigin || null
                      : null,
                  status:
                    result.stopped && !generationCompleteDespiteStop
                      ? "stopped"
                      : pipelineResultIds.length === 0 &&
                          historyThumbs.length === 0
                        ? "failed"
                        : terminalErrorCount > 0
                          ? "partial"
                          : "success",
                  error_reason:
                    result.stopped && !generationCompleteDespiteStop
                      ? result.stopOrigin === "user" &&
                        (!result.stopReason ||
                          result.stopReason === "USER_CANCELLED")
                        ? `USER_CANCELLED${result.stopSource ? `:${result.stopSource}` : ""}`
                        : result.stopReason || "BATCH_STOPPED"
                      : pipelineResultIds.length === 0 &&
                          historyThumbs.length === 0
                        ? result.reason ||
                          [
                            ...new Set(
                              (result.failedPrompts || [])
                                .map((item) => item.error)
                                .filter(Boolean),
                            ),
                          ].join(" \xB7 ") ||
                          "NO_VERIFIED_MEDIA"
                        : terminalErrorCount > 0
                          ? result.reason ||
                            [
                              ...new Set(
                                (result.failedPrompts || [])
                                  .map((item) => item.error)
                                  .filter(Boolean),
                              ),
                            ].join(" \xB7 ") ||
                            `${terminalErrorCount} prompt(s) incomplete`
                          : null,
                  project_id: window._currentProjectId || null,
                  auto_download: !!payload.autoDownload,
                });
                if (!result.stopped || generationCompleteDespiteStop)
                  window.eventBus.emit("generation:complete", {
                    message:
                      terminalErrorCount > 0
                        ? window.I18n?.t?.(
                            "notification.browser.generationCompleteMediaFailed",
                            {
                              completed: completedOutputs,
                              failed: failedOutputs,
                            },
                          ) ||
                          `Completed ${completedOutputs} image(s)/video(s), ${failedOutputs} failed`
                        : window.I18n?.t?.(
                            "notification.browser.generationCompleteMedia",
                            { completed: completedOutputs },
                          ) ||
                          `Completed ${completedOutputs} image(s)/video(s)`,
                    prompt: payload.prompts?.[0] || "",
                    resultCount: completedOutputs,
                    failedCount: failedOutputs,
                  });
              }
              if (result.failedPrompts && result.failedPrompts.length > 0) {
                _GenTab._showFailedPrompts(result.failedPrompts);
                _GenTab._showFailedPromptsSummaryModal(
                  result.failedPrompts,
                  payload.prompts?.length || result.failedPrompts.length,
                  result.completed || 0,
                );
              }
              const remainingJobs =
                PromptQueue.getInstance().getJobsByOwner("prompts");
              if (remainingJobs.length === 0) {
                _GenTab._resetRunningControls();
              }
            })
            .catch((err) => {
              sendLog("Pipeline l\u1ED7i: " + (err.message || err), "error");
              if (
                err.beforeQueueAdmission &&
                window.ExecutionGate &&
                _executionToken
              ) {
                ExecutionGate.cancel(_executionToken);
              }
              _GenTab._currentExecutionToken = null;
              if (window.eventBus) {
                window.eventBus.emit("execution:tracker_update", {
                  owner: "prompts",
                  phase: "error",
                });
                window.eventBus.emit("prompt:completed", {
                  prompt: payload.prompts?.join("\n\n") || "",
                  media_type: payload.genType || "image",
                  model: payload.modelName || "",
                  ratio: payload.aspectRatio || "",
                  prompt_count: payload.prompts?.length || 1,
                  quantity: parseInt(payload.quantity) || 1,
                  ref_file_ids: (pipelineRefFileIds || []).join(", "),
                  ref_thumbnails:
                    _GenTab._historyRefThumbnails(pipelineRefFileIds),
                  result_file_ids: "",
                  source: "gen",
                  submit_mode: _manualSubmitMode ? "manual" : "auto",
                  provider: "flow",
                  status: "failed",
                  duration_ms: Math.max(0, Date.now() - pipelineStartedAt),
                  error_reason: String(
                    err?.message || err || "Pipeline error",
                  ).slice(0, 1e3),
                  project_id: window._currentProjectId || null,
                  auto_download: !!payload.autoDownload,
                });
              }
              const remainingJobs =
                PromptQueue.getInstance().getJobsByOwner("prompts");
              if (remainingJobs.length === 0) {
                _GenTab._resetRunningControls();
              }
            });
          _GenTab.startBtn.disabled = false;
          if (_hasManualWait) {
            const _n = payload.prompts?.length || 1;
            window.showNotification?.(
              window.I18n?.t?.("gen.addedToQueueManual", { count: _n }) ||
                `Added ${_n} prompt(s) to the queue \u2014 they will run after you press Enter for the current prompt.`,
              "info",
              4500,
            );
          }
          return;
        } else if (window.MessageBridge) {
          window.MessageBridge.runAutoPrompt(payload)
            .then((result) => {
              const legacyCompleted = Number(result?.completedCount) || 0;
              const legacyFailed = Number(result?.failedCount) || 0;
              const legacyOutcome =
                legacyCompleted === 0 || result?.success === false
                  ? "failed"
                  : legacyFailed > 0
                    ? "partial"
                    : "success";
              if (result?.blocked) {
                sendLog(
                  "Google Flow \u0111ang b\u1EADn x\u1EED l\xFD. H\xE3y th\u1EED d\u1EEBng v\xE0 ch\u1EA1y l\u1EA1i.",
                  "warn",
                );
                if (window.customDialog) {
                  const crowIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:4px;color:#a855f7;"><path d="M16 7h.01"/><path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20"/><path d="m20 7 2 .5-2 .5"/><path d="M10 18v3"/><path d="M14 17.75V21"/><path d="M7 18a6 6 0 0 0 3.84-10.61"/></svg>`;
                  window.customDialog.alert(
                    `<div style="line-height:1.6">${window.I18n?.t("gen.pipelineQueueHint", { icon: crowIcon }) || `Enable <strong>${crowIcon}Pipeline Queue</strong> mode to run multiple tasks at once.<br><br><span style="color:var(--muted-foreground);font-size:0.9em;">Guide: Settings \u2192 Advanced \u2192 Pipeline Queue</span>`}</div>`,
                    {
                      title:
                        window.I18n?.t("msg.flowBusy") || "Google Flow is busy",
                      type: "info",
                      html: true,
                      buttons: [
                        {
                          label: window.I18n?.t("common.close") || "Close",
                          primary: false,
                          action: () => {},
                        },
                        {
                          label:
                            window.I18n?.t("header.settings") || "Settings",
                          primary: true,
                          action: () => {
                            chrome.runtime.sendMessage({
                              action: "openSettings",
                            });
                          },
                        },
                      ],
                    },
                  );
                }
                if (window.ExecutionGate && _executionToken) {
                  ExecutionGate.cancel(_executionToken);
                  _GenTab._currentExecutionToken = null;
                }
                _GenTab._resetRunningControls();
                if (window.ExecutionLock) ExecutionLock.release("prompts");
                return;
              }
              if (window.ExecutionGate && _executionToken) {
                ExecutionGate.complete(_executionToken, legacyOutcome, {
                  successful_count: legacyCompleted,
                  failed_count: legacyFailed,
                });
                _GenTab._currentExecutionToken = null;
              }
              const flowPromptCount = payload.prompts?.length || 0;
              if (flowPromptCount > 0 && window.featureGate) {
                window.featureGate.recordGenRun();
                window.featureGate.recordPromptSubmit(flowPromptCount, "flow");
              }
              window.UsageSync?.trackEvent("gen_complete", {
                success_count: legacyCompleted,
                fail_count: legacyFailed,
              });
              if (window.eventBus) {
                window.eventBus.emit("execution:tracker_update", {
                  owner: "prompts",
                  phase: legacyOutcome === "failed" ? "error" : "completed",
                  current: legacyCompleted,
                  total: payload.prompts?.length || 0,
                });
                const legacyResultIds = result?.resultTileIds || [];
                const legacyThumbs = legacyResultIds
                  .map((tid) => ({
                    thumbnail: _GenTab.thumbnailCache?.[tid] || "",
                    type:
                      (payload.genType || "image").toLowerCase() === "video"
                        ? "video"
                        : "image",
                    file_name: _GenTab.fileNameCache?.[tid] || "",
                  }))
                  .filter((t2) => t2.thumbnail);
                window.eventBus.emit("prompt:completed", {
                  prompt: payload.prompts?.join("\n\n") || "",
                  media_type: payload.genType || "image",
                  model: payload.modelName || "",
                  ratio: payload.aspectRatio || "",
                  prompt_count: payload.prompts?.length || 1,
                  quantity: parseInt(payload.quantity) || 1,
                  ref_file_ids: (payload.fileIds || []).join(", "),
                  ref_thumbnails: _GenTab._historyRefThumbnails(
                    payload.fileIds,
                  ),
                  result_file_ids: legacyResultIds.join(", "),
                  result_thumbnails: legacyThumbs,
                  result_file_names: Object.fromEntries(
                    legacyResultIds
                      .filter((tid) => _GenTab.fileNameCache?.[tid])
                      .map((tid) => [tid, _GenTab.fileNameCache[tid]]),
                  ),
                  source: "gen",
                  submit_mode: "auto",
                  provider: "flow",
                  historyRoute: {
                    genMode: "web",
                    initialGenMode: "web",
                    fallbackReason: null,
                  },
                  status: legacyOutcome,
                  ...(legacyOutcome !== "success" && {
                    error_reason:
                      result?.error || `${legacyFailed} prompt(s) failed`,
                  }),
                  project_id: window._currentProjectId || null,
                  auto_download: !!payload.autoDownload,
                });
                if (legacyCompleted > 0) {
                  window.eventBus.emit("generation:complete", {
                    message:
                      window.I18n?.t?.(
                        "notification.browser.generationCompletePrompts",
                        { count: legacyCompleted },
                      ) || `Completed ${legacyCompleted} prompt(s)`,
                    prompt: payload.prompts?.[0] || "",
                    resultCount: legacyResultIds.length,
                  });
                }
              }
              _GenTab._resetRunningControls();
              if (window.ExecutionLock) ExecutionLock.release("prompts");
            })
            .catch((err) => {
              sendLog(
                "L\u1ED7i k\u1EBFt n\u1ED1i content script: " +
                  (err.message || err),
                "error",
              );
              if (window.ExecutionGate && _executionToken) {
                ExecutionGate.complete(_executionToken, "failed", {
                  error: err.message || String(err),
                });
                _GenTab._currentExecutionToken = null;
              }
              if (window.eventBus) {
                window.eventBus.emit("execution:tracker_update", {
                  owner: "prompts",
                  phase: "error",
                });
              }
              _GenTab._resetRunningControls();
              if (window.ExecutionLock) ExecutionLock.release("prompts");
            });
        } else if (typeof runAutoPrompt === "function") {
          runAutoPrompt(payload);
        } else {
          sendLog(
            "Kh\xF4ng th\u1EC3 k\u1EBFt n\u1ED1i Google Flow. H\xE3y m\u1EDF project tr\xEAn flow.google.com tr\u01B0\u1EDBc.",
            "error",
          );
          if (window.ExecutionGate && _executionToken) {
            ExecutionGate.cancel(_executionToken);
            _GenTab._currentExecutionToken = null;
          }
          _GenTab._resetRunningControls();
          if (window.ExecutionLock) ExecutionLock.release("prompts");
        }
      });
    if (document.getElementById("triggerUploadBtn")) {
      document
        .getElementById("triggerUploadBtn")
        .addEventListener("click", () => {
          document.getElementById("imageUploadInput").click();
        });
    }
    if (document.getElementById("imageUploadInput")) {
      document
        .getElementById("imageUploadInput")
        .addEventListener("change", async (e) => {
          const newFiles = Array.from(e.target.files);
          const existingNames = new Set(
            _GenTab.selectedFilesForUpload.map((f) => f.name),
          );
          const uniqueNewFiles = newFiles.filter(
            (f) => !existingNames.has(f.name),
          );
          _GenTab.selectedFilesForUpload = [
            ..._GenTab.selectedFilesForUpload,
            ...uniqueNewFiles,
          ];
          e.target.value = "";
          _GenTab.renderUploadPreview();
        });
    }
    if (document.getElementById("executeUploadBtn")) {
      document
        .getElementById("executeUploadBtn")
        .addEventListener("click", async () => {
          if (_GenTab.selectedFilesForUpload.length === 0) return;
          const previewContainer = document.getElementById(
            "imagePreviewContainer",
          );
          if (previewContainer) previewContainer.classList.add("uploading");
          const newIds = await _GenTab.performFlowImageUpload(
            _GenTab.selectedFilesForUpload,
            document.getElementById("executeUploadBtn"),
          );
          if (previewContainer) previewContainer.classList.remove("uploading");
          if (newIds && newIds.length > 0) {
            const currentIds = _GenTab.fileIdsInput.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            const merged = [...currentIds, ...newIds];
            if (_GenTab.fileIdsInput)
              _GenTab.fileIdsInput.value = merged.join(", ");
            _GenTab.saveState();
            const uploadInput = document.getElementById("imageUploadInput");
            if (uploadInput) uploadInput.value = "";
            _GenTab.selectedFilesForUpload = [];
            _GenTab.renderUploadPreview();
          }
        });
    }
    if (_GenTab.stopBtn)
      _GenTab.stopBtn.addEventListener("click", () => {
        shouldStop = true;
        _GenTab.stopProviderGeneration().catch(() => {});
        const isPipelineStop = window.PromptQueue && PromptQueue.isEnabled();
        if (
          !isPipelineStop &&
          window.ExecutionGate &&
          _GenTab._currentExecutionToken
        ) {
          ExecutionGate.cancel(_GenTab._currentExecutionToken);
        }
        _GenTab._currentExecutionToken = null;
        if (isPipelineStop) {
          const activeJobs =
            PromptQueue.getInstance().getJobsByOwner("prompts");
          for (const job of activeJobs) {
            PromptQueue.getInstance().stopJob(job.id, {
              stopOrigin: "user",
              stopReason: "USER_CANCELLED",
              stopSource: "GEN_TAB_STOP_BUTTON",
            });
          }
        }
        if (window.MessageBridge) {
          window.MessageBridge.stopExecution().catch(() => {});
        }
        if (window.eventBus) {
          window.eventBus.emit("execution:tracker_update", {
            owner: "prompts",
            phase: "completed",
          });
        }
        _GenTab._resetRunningControls();
        if (!isPipelineStop && window.ExecutionLock)
          ExecutionLock.release("prompts");
      });
    if (_GenTab.pauseBtn)
      _GenTab.pauseBtn.addEventListener("click", () => {
        const isPausedNow = _GenTab.pauseBtn.dataset.paused === "true";
        if (isPausedNow) {
          isPaused = false;
          if (window.PromptQueue && PromptQueue.isEnabled()) {
            const activeJobs =
              PromptQueue.getInstance().getJobsByOwner("prompts");
            for (const job of activeJobs) {
              PromptQueue.getInstance().resumeJob(job.id);
            }
          }
          if (typeof MessageBridge !== "undefined")
            MessageBridge.resumeExecution().catch(() => {});
          _GenTab.pauseBtn.classList.remove("paused");
          _GenTab.pauseBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <rect x="6" y="4" width="4" height="16"></rect>
            <rect x="14" y="4" width="4" height="16"></rect>
          </svg>`;
          _GenTab.pauseBtn.title =
            window.I18n?.t("genNotifyExtra.pauseTitle") || "Pause";
          _GenTab.pauseBtn.dataset.paused = "false";
          if (window.eventBus) {
            window.eventBus.emit("execution:tracker_update", {
              owner: "prompts",
              phase: "prompt_submitting",
            });
          }
        } else {
          isPaused = true;
          window.eventBus?.emit("execution:manual_pause", {});
          if (window.PromptQueue && PromptQueue.isEnabled()) {
            const activeJobs =
              PromptQueue.getInstance().getJobsByOwner("prompts");
            for (const job of activeJobs) {
              PromptQueue.getInstance().pauseJob(job.id);
            }
          }
          if (typeof MessageBridge !== "undefined")
            MessageBridge.pauseExecution().catch(() => {});
          _GenTab.pauseBtn.classList.add("paused");
          _GenTab.pauseBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>`;
          _GenTab.pauseBtn.title =
            window.I18n?.t("genNotifyExtra.resumeTitle") || "Resume";
          _GenTab.pauseBtn.dataset.paused = "true";
          if (window.eventBus) {
            window.eventBus.emit("execution:tracker_update", {
              owner: "prompts",
              phase: "paused",
            });
          }
        }
      });
    const clearFailedBtn = document.getElementById("clearFailedPromptsBtn");
    if (clearFailedBtn) {
      clearFailedBtn.addEventListener("click", () => {
        _GenTab._clearFailedPrompts();
      });
    }
    const retryFailedBtn = document.getElementById("retryFailedPromptsBtn");
    if (retryFailedBtn) {
      retryFailedBtn.addEventListener("click", () => {
        _GenTab._retryFailedPrompts();
      });
    }
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.action === "promptProgress") {
        if (window.eventBus) {
          window.eventBus.emit("execution:tracker_update", {
            owner: "prompts",
            label: "Auto Gen",
            phase: "prompt_submitting",
            current: msg.current,
            total: msg.total,
          });
        }
        if (msg.current >= msg.total && !_GenTab._providerSubmitRunning) {
          _GenTab._resetRunningControls();
        }
      }
      if (msg.action === "promptExecutionComplete") {
        if (window.eventBus) {
          window.eventBus.emit("execution:tracker_update", {
            owner: "prompts",
            phase: msg.failedCount > 0 ? "error" : "completed",
            current: msg.completedCount || 0,
            total: msg.totalCount || 0,
            errorCount: msg.failedCount || 0,
          });
        }
        if (!_GenTab._providerSubmitRunning) {
          _GenTab._resetRunningControls();
        }
        if (msg.failedPrompts && msg.failedPrompts.length > 0) {
          _GenTab._showFailedPrompts(msg.failedPrompts);
          _GenTab._showFailedPromptsSummaryModal(
            msg.failedPrompts,
            msg.totalCount || msg.failedPrompts.length,
            msg.completedCount || 0,
          );
        }
      }
    });
    window.performFlowImageUpload = _GenTab.performFlowImageUpload;
    window.renderFileIdThumbnails = _GenTab.renderFileIdThumbnails;
    try {
      _GenTab._initProviderSelector();
    } catch (err) {
      console.warn("[GenTab] _initProviderSelector failed:", err);
    }
    console.log("[TobyFlow] GenTab initialized");
  }
  static _initProviderSelector() {
    const tabsRoot = document.getElementById("genProviderTabs");
    const sel = document.getElementById("genProvider");
    if (!sel || !tabsRoot) return;
    _GenTab.providerSelect = sel;
    _GenTab.providerTabs = tabsRoot;
    window.ProviderTabScroll?.bind(tabsRoot);
    const setActive = (providerKey) => {
      sel.value = providerKey;
      const tabs = tabsRoot.querySelectorAll(".provider-tab");
      let activeCount = 0;
      tabs.forEach((btn) => {
        const isActive = btn.dataset.provider === providerKey;
        btn.classList.toggle("provider-tab--active", isActive);
        btn.setAttribute("aria-selected", isActive ? "true" : "false");
        if (isActive) activeCount++;
      });
      void tabsRoot.offsetHeight;
      requestAnimationFrame(() => {
        void tabsRoot.offsetHeight;
      });
      if (window.DEBUG) {
        console.log(
          `[DEBUG_SET_ACTIVE] setActive('${providerKey}') \u2192 sel.value=${sel.value}, tabs found=${tabs.length}, active count=${activeCount}, active provider=${[...tabs].find((t) => t.classList.contains("provider-tab--active"))?.dataset?.provider}`,
        );
      }
    };
    chrome.storage.local.get(["af_settings"], (res) => {
      const settings = res.af_settings || {};
      let initial = settings.defaultProvider || "flow";
      if (window.DEBUG)
        console.log(
          "[DEBUG_DEFAULT_PROVIDER] storage.defaultProvider =",
          settings.defaultProvider,
          "\u2192 initial =",
          initial,
        );
      try {
        if (
          window.ProviderRegistry &&
          typeof ProviderRegistry.get === "function"
        ) {
          const adapterExists = !!ProviderRegistry.get(initial);
          if (window.DEBUG)
            console.log(
              '[DEBUG_DEFAULT_PROVIDER] ProviderRegistry.get("' +
                initial +
                '") =',
              adapterExists ? "OK" : "MISSING",
            );
          if (!adapterExists) initial = "flow";
        } else if (window.DEBUG) {
          console.warn(
            "[DEBUG_DEFAULT_PROVIDER] ProviderRegistry not loaded yet \u2192 keep initial =",
            initial,
          );
        }
      } catch (e) {
        if (window.DEBUG)
          console.warn(
            "[DEBUG_DEFAULT_PROVIDER] ProviderRegistry check throw:",
            e?.message,
          );
        initial = "flow";
      }
      const initialGate = _GenTab._resolveProviderGate(initial, "gen");
      if (window.DEBUG)
        console.log(
          "[DEBUG_DEFAULT_PROVIDER] gate(" + initial + ") =",
          initialGate,
        );
      if (initialGate?.locked && initialGate.reason === "feature") {
        const providers = Array.from(
          document.querySelectorAll(
            "#genProviderTabs .provider-tab[data-provider]",
          ),
        )
          .map((btn) => btn.dataset.provider)
          .filter(Boolean);
        let foundUnlocked = null;
        for (const p of providers) {
          const gate = _GenTab._resolveProviderGate(p, "gen");
          if (!gate?.locked || gate.reason !== "feature") {
            foundUnlocked = p;
            break;
          }
        }
        if (foundUnlocked && foundUnlocked !== initial) {
          console.log(
            `[GenTab] Initial provider "${initial}" is locked, switching to "${foundUnlocked}"`,
          );
          initial = foundUnlocked;
        }
      }
      const grokDurEl = document.getElementById("grokDuration");
      if (grokDurEl && settings.grokDefaultDuration)
        grokDurEl.value = settings.grokDefaultDuration;
      const grokResEl = document.getElementById("grokResolution");
      if (grokResEl && settings.grokDefaultResolution)
        grokResEl.value = settings.grokDefaultResolution;
      const grokQualEl = document.getElementById("grokImageQuality");
      if (grokQualEl && settings.grokDefaultImageQuality)
        grokQualEl.value = settings.grokDefaultImageQuality;
      if (window.DEBUG)
        console.log(
          "[DEBUG_DEFAULT_PROVIDER] FINAL active provider \u2192",
          initial,
        );
      setActive(initial);
      _GenTab._renderByProvider(initial);
      _GenTab._updateRunModeVisibility();
      setTimeout(
        () =>
          _GenTab._checkDuplicateProviderTabs(initial, { interactive: false }),
        1e3,
      );
      if (!_GenTab._providerReEvalBound) {
        _GenTab._providerReEvalBound = true;
        _GenTab._providerReEvalDone = false;
        const reEvalProvider = (triggerName) => {
          if (_GenTab._providerReEvalDone) return;
          chrome.storage.local.get(["af_settings"], (res2) => {
            const desired = res2.af_settings?.defaultProvider;
            const current = sel.value;
            if (!desired || desired === current) {
              _GenTab._providerReEvalDone = true;
              return;
            }
            const gate = _GenTab._resolveProviderGate(desired, "gen");
            if (gate?.locked) return;
            console.log(
              `[GenTab] Provider re-eval (${triggerName}): ${current} \u2192 ${desired}`,
            );
            setActive(desired);
            _GenTab._renderByProvider(desired);
            _GenTab._updateRunModeVisibility();
            _GenTab._providerReEvalDone = true;
          });
        };
        window.eventBus?.on?.("featuregate:refreshed", () =>
          reEvalProvider("featuregate:refreshed"),
        );
        window.eventBus?.on?.("storageSettings:loaded", () =>
          reEvalProvider("storageSettings:loaded"),
        );
        window.eventBus?.on?.("storageSettings:loaded", () => {
          _GenTab.updateModelOptions();
        });
        try {
          chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== "local" || !changes.af_settings) return;
            const oldVal = changes.af_settings.oldValue?.defaultProvider;
            const newVal = changes.af_settings.newValue?.defaultProvider;
            if (!newVal || newVal === oldVal) return;
            if (newVal === sel.value) return;
            const gate = _GenTab._resolveProviderGate(newVal, "gen");
            if (gate?.locked) {
              console.log(
                `[GenTab] User save defaultProvider=${newVal} nh\u01B0ng \u0111ang locked \u2192 skip switch`,
              );
              return;
            }
            console.log(
              `[GenTab] User save defaultProvider: ${sel.value} \u2192 ${newVal} (force switch)`,
            );
            setActive(newVal);
            _GenTab._renderByProvider(newVal);
            _GenTab._updateRunModeVisibility();
          });
        } catch (_) {}
      }
    });
    try {
      const _mcpBtn = document.getElementById("genMcpSettingBtn");
      if (_mcpBtn && !_mcpBtn._wired) {
        _mcpBtn._wired = true;
        const _mcpCrown = _mcpBtn.querySelector(".settings-tab-crown");
        let _mcpPaintSequence = 0;
        const _mcpPaint = async () => {
          const sequence = ++_mcpPaintSequence;
          const entitlementReady = !!window.authManager?.isInitialized;
          const entitled =
            !window.featureGate?.canUse ||
            !entitlementReady ||
            window.featureGate.canUse("mcp_enabled");
          let configured = false;
          if (entitlementReady && entitled && window.authManager?._apiCall) {
            try {
              const response = await window.authManager._apiCall(
                "GET",
                "mcp/tokens",
              );
              const tokens = Array.isArray(response)
                ? response
                : Array.isArray(response?.data)
                  ? response.data
                  : [];
              const now = Date.now();
              configured = tokens.some(
                (token) =>
                  !token.expires_at || Date.parse(token.expires_at) > now,
              );
            } catch (error) {
              console.warn(
                "[GenTab] MCP status check failed:",
                error?.message || error,
              );
            }
          }
          if (sequence !== _mcpPaintSequence || !_mcpBtn.isConnected) return;
          const active = entitlementReady && entitled && configured;
          _mcpBtn.classList.toggle("is-on", active);
          _mcpBtn.setAttribute("aria-pressed", active ? "true" : "false");
          _mcpBtn.dataset.mcpStatus = active
            ? "configured"
            : entitled
              ? "not-configured"
              : "locked";
          _mcpCrown?.classList.toggle("hidden", !entitlementReady || entitled);
        };
        _mcpPaint();
        try {
          window.eventBus?.on?.("featuregate:refreshed", _mcpPaint);
        } catch (_) {}
        try {
          window.eventBus?.on?.("plan:changed", _mcpPaint);
        } catch (_) {}
        try {
          chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === "local" && changes.toby_mcp_token_revision)
              _mcpPaint();
          });
        } catch (_) {}
        _mcpBtn.addEventListener("click", () => {
          try {
            chrome.runtime.sendMessage({ action: "openSettings", tab: "mcp" });
          } catch (_) {}
        });
      }
      const _apiBtn = document.getElementById("genApiSettingBtn");
      if (_apiBtn && !_apiBtn._wired) {
        _apiBtn._wired = true;
        const _apiCrown = _apiBtn.querySelector(".settings-tab-crown");
        const _apiEntitledFlash = _apiBtn.querySelector(
          ".flow-api-entitled-flash",
        );
        const _apiUpdateIcon = _apiBtn.querySelector(".flow-api-update-icon");
        const _apiVersionBadge = _apiBtn.querySelector(".gen-api-version");
        const _apiRefreshBtn = document.getElementById("genFlowApiRefreshBtn");
        let _apiRefreshBusy = false;
        let _apiLastVerifiedReady = false;
        const _paintApiVersionBadge = (driver) => {
          if (!_apiVersionBadge) return;
          const version = ["v1", "v2"].includes(driver) ? driver : "v2";
          _apiVersionBadge.classList.remove("hidden");
          _apiVersionBadge.textContent = version.toUpperCase();
          _apiVersionBadge.dataset.driver = version;
        };
        const _compareBridgeVersions = (installed, minimum) => {
          const a = String(installed || "0")
            .split(".")
            .map(Number);
          const b = String(minimum || "0")
            .split(".")
            .map(Number);
          for (let i = 0; i < Math.max(a.length, b.length); i++) {
            const delta = (a[i] || 0) - (b[i] || 0);
            if (delta !== 0) return delta < 0 ? -1 : 1;
          }
          return 0;
        };
        let _apiPaintSequence = 0;
        const _apiPaint = async () => {
          const paintSequence = ++_apiPaintSequence;
          try {
            const quyenSanSang = !!window.authManager?.isInitialized;
            const coQuyen =
              !window.featureGate?.canUse ||
              !quyenSanSang ||
              window.featureGate.canUse("flow_api_enabled");
            const st = window.storageSettings?.getSettings?.() || {};
            const batApi =
              st.apiModeEnabled === true ||
              st.apiModeEnabled === "true" ||
              st.apiModeEnabled === 1;
            const che_do = st.defaultGenMode || st.gen_mode || "ui";
            const chonApi =
              coQuyen && batApi && (che_do === "api" || che_do === "auto");
            if (
              chonApi &&
              window.FlowApiV2Driver?.hasActiveMutation?.() === true
            ) {
              _apiLastVerifiedReady = true;
              _apiBtn.classList.add("is-on");
              _apiBtn.classList.remove("is-reconnecting");
              _apiBtn.setAttribute("aria-pressed", "true");
              _apiBtn.setAttribute("aria-busy", "true");
              _apiBtn.dataset.apiVersion = "v2";
              _paintApiVersionBadge("v2");
              if (_apiCrown) _apiCrown.classList.toggle("hidden", coQuyen);
              if (_apiEntitledFlash)
                _apiEntitledFlash.classList.toggle(
                  "hidden",
                  !quyenSanSang || !coQuyen,
                );
              return;
            }
            let cauNoiOk = false;
            let effectiveApiDriver = null;
            let apiConnecting = false;
            let bridgePing = null;
            if (chonApi) {
              try {
                const tt = await window.FlowApiSessionCoordinator?.check?.({
                  surface: "gen",
                  mediaType:
                    _GenTab.genTypeSelect?.value === "Video"
                      ? "video"
                      : "image",
                  passive: true,
                });
                cauNoiOk = tt?.ready === true;
                apiConnecting = tt?.connecting === true;
                effectiveApiDriver = tt?.driver || null;
              } catch (_) {
                cauNoiOk = false;
              }
            }
            try {
              bridgePing = await window.BridgeClient?.ping?.();
            } catch (_) {}
            if (paintSequence !== _apiPaintSequence || !_apiBtn.isConnected)
              return;
            const minimumBridgeVersion =
              window.SystemConfig?.get?.("bridge_min_version") || "";
            const bridgeOutdated =
              bridgePing?.installed === true &&
              !!bridgePing.version &&
              !!minimumBridgeVersion &&
              _compareBridgeVersions(bridgePing.version, minimumBridgeVersion) <
                0;
            if (cauNoiOk) _apiLastVerifiedReady = true;
            else if (!_apiRefreshBusy) _apiLastVerifiedReady = false;
            const reconnecting =
              chonApi &&
              (_apiRefreshBusy ||
                (!cauNoiOk &&
                  (apiConnecting ||
                    window.__flowReloadSyncInProgress === true)));
            const visualReady =
              cauNoiOk || (_apiRefreshBusy && _apiLastVerifiedReady);
            const dangBat = chonApi && visualReady;
            _apiBtn.classList.toggle("is-on", dangBat);
            _apiBtn.classList.toggle("is-reconnecting", reconnecting);
            _apiBtn.classList.toggle("is-bridge-outdated", bridgeOutdated);
            _apiBtn.setAttribute("aria-pressed", dangBat ? "true" : "false");
            _apiBtn.setAttribute("aria-busy", reconnecting ? "true" : "false");
            _apiBtn.dataset.apiVersion = chonApi
              ? effectiveApiDriver || "unknown"
              : "web";
            _paintApiVersionBadge(effectiveApiDriver);
            _apiUpdateIcon?.classList.toggle("hidden", !bridgeOutdated);
            if (bridgeOutdated) {
              _apiBtn.setAttribute(
                "data-tooltip",
                `${window.I18n?.t?.("settings.bridgeOutdated") || "TobyBridge"} (v${bridgePing.version} \u2192 v${minimumBridgeVersion})`,
              );
            } else {
              const versionLabel =
                chonApi && effectiveApiDriver
                  ? ` \u2014 ${effectiveApiDriver === "v2" ? "V2" : effectiveApiDriver === "v1" ? "V1" : "Web"}`
                  : "";
              _apiBtn.setAttribute(
                "data-tooltip",
                (window.I18n?.t?.("gen.apiSettingTooltip") ||
                  "Flow API settings") + versionLabel,
              );
            }
            if (_apiRefreshBtn) {
              _apiRefreshBtn.classList.toggle(
                "hidden",
                !chonApi || (cauNoiOk && !reconnecting),
              );
              _apiRefreshBtn.classList.toggle("is-busy", reconnecting);
              _apiRefreshBtn.disabled = _apiRefreshBusy;
              _apiRefreshBtn.setAttribute(
                "aria-busy",
                _apiRefreshBusy ? "true" : "false",
              );
            }
            if (_apiCrown) _apiCrown.classList.toggle("hidden", coQuyen);
            if (_apiEntitledFlash) {
              _apiEntitledFlash.classList.toggle(
                "hidden",
                !quyenSanSang || !coQuyen,
              );
            }
          } catch (_) {}
        };
        _apiPaint();
        try {
          window.eventBus?.on?.("featuregate:refreshed", _apiPaint);
        } catch (_) {}
        try {
          window.eventBus?.on?.("plan:changed", _apiPaint);
        } catch (_) {}
        try {
          window.eventBus?.on?.("flow_api:auth_invalid", _apiPaint);
        } catch (_) {}
        try {
          window.eventBus?.on?.("bridge:changed", _apiPaint);
        } catch (_) {}
        try {
          window.eventBus?.on?.("flow:reload_sync_state", _apiPaint);
        } catch (_) {}
        try {
          window.eventBus?.on?.("flow_api:mutation_activity", _apiPaint);
        } catch (_) {}
        try {
          chrome.storage.onChanged.addListener((thayDoi, vung) => {
            if (vung === "session" && thayDoi.flowReloadUiState) {
              window.__flowReloadSyncInProgress =
                thayDoi.flowReloadUiState.newValue?.active === true;
              _apiPaint();
            }
            if (
              vung === "local" &&
              (thayDoi.af_settings ||
                thayDoi.af_system_settings ||
                thayDoi.toby_flow_api_health_gen_image ||
                thayDoi.toby_flow_api_health_gen_video)
            )
              _apiPaint();
          });
        } catch (_) {}
        try {
          setInterval(_apiPaint, 5e3);
        } catch (_) {}
        _apiRefreshBtn?.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (_apiRefreshBusy) return;
          const restoreFocus = event.isTrusted === true;
          console.info(
            "[GenTab] Flow API reconnect clicked \u2014 token refresh only, no generation submit",
          );
          _apiRefreshBusy = true;
          _apiRefreshBtn.classList.add("is-busy");
          _apiRefreshBtn.disabled = true;
          _apiRefreshBtn.setAttribute("aria-busy", "true");
          let result = null;
          try {
            result = await window.FlowApiSessionCoordinator?.reconnect?.({
              surface: "gen",
              mediaType:
                _GenTab.genTypeSelect?.value === "Video" ? "video" : "image",
              userInitiated: true,
              force: true,
            });
            if (result?.ready) {
              ++_apiPaintSequence;
              _apiRefreshBusy = false;
              _apiLastVerifiedReady = true;
              _apiBtn.classList.add("is-on");
              _apiBtn.classList.remove("is-reconnecting");
              _apiBtn.setAttribute("aria-pressed", "true");
              _apiBtn.setAttribute("aria-busy", "false");
              _apiBtn.dataset.apiVersion = result.driver || "unknown";
              _paintApiVersionBadge(result.driver);
              _apiRefreshBtn.classList.add("hidden");
              console.info("[GenTab] Flow API reconnect ready");
              window.NotificationManager?.showToast?.(
                window.I18n?.t?.(
                  result.fallbackFrom === "v2" && result.driver === "v1"
                    ? "settings.flowApiV1Fallback"
                    : result.driver === "v2"
                      ? "settings.flowApiV2Connected"
                      : "settings.flowApiConnected",
                ) ||
                  (result.driver === "v2"
                    ? "Flow API V2 connected"
                    : "Flow API connected successfully"),
                "success",
              );
            } else {
              console.info(
                "[GenTab] Flow API manual reconnect failed:",
                result?.reason,
                result?.detail || "",
              );
              const _needsInstall =
                result?.reason === "not_installed" ||
                result?.reason === "no_client";
              window.NotificationManager?.showToast?.(
                result?.messageKey
                  ? window.I18n?.t?.(result.messageKey) || result.reason
                  : result?.reason === "login_required"
                    ? window.I18n?.t?.("settings.bridgeSignInRequired") ||
                      "Sign in to Google Flow to reconnect Flow API."
                    : window.I18n?.t?.(
                        _needsInstall
                          ? "settings.bridgeNeedInstall"
                          : "settings.bridgeCheckFailed",
                      ) ||
                      (_needsInstall
                        ? "Install TobyBridge to use Flow API"
                        : "Connection check failed. Open Google Flow, then try again."),
                "warning",
                5e3,
              );
              if (!result?.recoveryStarted) {
                try {
                  chrome.runtime.sendMessage({
                    action: "openSettings",
                    tab: "ai-platform",
                  });
                } catch (_) {}
              }
            }
          } catch (error) {
            console.info(
              "[GenTab] Flow API manual reconnect exception:",
              error?.message || error,
            );
            window.NotificationManager?.showToast?.(
              window.I18n?.t?.("settings.bridgeCheckFailed") ||
                "Connection check failed. Open Google Flow, then try again.",
              "warning",
              5e3,
            );
          } finally {
            _apiRefreshBusy = false;
            _apiRefreshBtn.classList.remove("is-busy");
            _apiRefreshBtn.disabled = false;
            _apiRefreshBtn.setAttribute("aria-busy", "false");
            window.BridgeClient?.invalidate?.();
            await _apiPaint();
            window.FlowBridgeStatusDot?.update?.();
            if (
              restoreFocus &&
              document.visibilityState === "visible" &&
              _apiRefreshBtn.isConnected
            ) {
              _apiRefreshBtn.focus({ preventScroll: true });
            }
          }
        });
        let _apiInviteTimer = null;
        let _apiInviteHideTimer = null;
        let _apiInviteDismissed = false;
        const _stopApiInvite = () => {
          _apiInviteDismissed = true;
          if (_apiInviteTimer) clearTimeout(_apiInviteTimer);
          if (_apiInviteHideTimer) clearTimeout(_apiInviteHideTimer);
          _apiInviteTimer = null;
          _apiInviteHideTimer = null;
          const tip = window.SmartTooltip?._tooltipEl;
          if (tip) tip.classList.remove("smart-tooltip--flow-api-invite");
          if (window.SmartTooltip?._currentTarget === _apiBtn)
            window.SmartTooltip._hideTooltip?.();
        };
        try {
          chrome.storage.local.get(["toby_flow_api_button_clicked"], (res) => {
            if (
              _apiInviteDismissed ||
              res?.toby_flow_api_button_clicked === true ||
              !_apiBtn.isConnected
            )
              return;
            _apiInviteTimer = setTimeout(() => {
              if (_apiInviteDismissed || !_apiBtn.isConnected) return;
              try {
                window.SmartTooltip?._showTooltip?.(_apiBtn);
                window.SmartTooltip?._tooltipEl?.classList.add(
                  "smart-tooltip--flow-api-invite",
                );
              } catch (_) {}
              _apiInviteHideTimer = setTimeout(_stopApiInvite, 6500);
            }, 900);
          });
        } catch (_) {}
        _apiBtn.addEventListener("click", () => {
          _stopApiInvite();
          try {
            chrome.storage.local.set({ toby_flow_api_button_clicked: true });
          } catch (_) {}
          try {
            chrome.runtime.sendMessage({
              action: "openSettings",
              tab: "ai-platform",
            });
          } catch (_) {}
        });
      }
    } catch (_) {}
    tabsRoot.querySelectorAll(".provider-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const providerKey = btn.dataset.provider || "flow";
        const gate = _GenTab._resolveProviderGate(providerKey, "gen");
        if (gate.locked) {
          const isLoggedIn = !!window.authManager?.isLoggedIn?.();
          if (gate.reason === "feature") {
            if (isLoggedIn && typeof window.openUpgradeModal === "function") {
              try {
                window.openUpgradeModal();
              } catch (_e) {}
            } else {
              try {
                window.featureGate?.showLoginPrompt?.(gate.tooltip);
              } catch (_e) {}
            }
          } else if (gate.reason === "quota") {
            if (typeof window.openUpgradeModal === "function") {
              try {
                window.openUpgradeModal();
              } catch (_e) {}
            } else if (window.featureGate?.showLoginPrompt) {
              try {
                window.featureGate.showLoginPrompt(gate.tooltip);
              } catch (_e) {}
            }
          }
          return;
        }
        if (sel.value === providerKey) {
          _GenTab._ensureProviderTab(providerKey);
          return;
        }
        _GenTab._providerReEvalDone = true;
        const currentProvider = sel.value;
        const currentRatio = _GenTab.aspectRatioSelect?.value;
        if (currentRatio) {
          _GenTab._rememberProviderRatioSelection(currentProvider);
          if (currentProvider === "gemini") {
            _GenTab._rememberGeminiRatioSelection();
          } else {
            chrome.storage.local.get(["af_settings"], (res) => {
              const settings = res.af_settings || {};
              if (currentProvider === "chatgpt")
                settings.chatgptDefaultRatio = currentRatio;
              else if (currentProvider === "grok")
                settings.grokDefaultRatio = currentRatio;
              else settings.aspectRatio = currentRatio;
              chrome.storage.local.set({ af_settings: settings });
            });
          }
        }
        setActive(providerKey);
        if (window.eventBus) {
          window.eventBus.emit("provider:changed", { provider: providerKey });
        }
        _GenTab._renderByProvider(providerKey);
        _GenTab._updateRunModeVisibility();
        try {
          _GenTab.renderFileIdThumbnails();
        } catch (_) {}
        _GenTab._ensureProviderTab(providerKey);
      });
    });
    _GenTab._refreshProviderPillsGate();
    if (window.eventBus && !_GenTab._providerGateBound) {
      _GenTab._providerGateBound = true;
      window.eventBus.on("featuregate:refreshed", () =>
        _GenTab._refreshProviderPillsGate(),
      );
      window.eventBus.on("auth:login", () =>
        _GenTab._refreshProviderPillsGate(),
      );
      window.eventBus.on("auth:logout", () =>
        _GenTab._refreshProviderPillsGate(),
      );
      window.eventBus.on("prompt:completed", () =>
        _GenTab._refreshProviderPillsGate(),
      );
      window.eventBus.on("featuregate:quota_warning", () =>
        _GenTab._refreshProviderPillsGate(),
      );
      window.eventBus.on("featuregate:quota_exhausted", () =>
        _GenTab._refreshProviderPillsGate(),
      );
      window.eventBus.on("i18n:changed", () => {
        const currentProvider =
          document.getElementById("genProvider")?.value || "flow";
        try {
          _GenTab._renderByProvider(currentProvider);
        } catch (_) {}
        try {
          _GenTab.renderFileIdThumbnails();
        } catch (_) {}
        if (_GenTab.promptsArea && _GenTab.promptCountSpan)
          _GenTab.updatePromptCount();
      });
      window.eventBus.on("provider:api_config_updated", ({ provider, key }) => {
        try {
          if (key === "max_ref_images") {
            _GenTab.renderFileIdThumbnails();
            return;
          }
          const current =
            document.getElementById("genProvider")?.value || "flow";
          if (provider !== current) return;
          if (provider === "flow") {
            if (key === "ratios") _GenTab.updateRatioOptions();
            else if (key === "download_resolutions")
              _GenTab.updateDownloadResolutionOptions();
            else if (key === "quantity_range") _GenTab.updateQuantityOptions();
            else if (key === "video_durations")
              _GenTab.updateFlowVideoDurationOptions();
            else if (key === "chain_config") _GenTab._updateChainUI();
            else if (key === "supports") _GenTab._renderByProvider(current);
          } else {
            setTimeout(() => {
              try {
                if (
                  (document.getElementById("genProvider")?.value || "flow") !==
                  current
                )
                  return;
                _GenTab._renderByProvider(current);
                if (current === "grok") {
                  _GenTab.updateGrokVideoDurationOptions();
                  _GenTab.updateGrokVideoResolutionOptions();
                }
              } catch (_) {}
            }, 0);
          }
        } catch (_) {}
      });
      window.eventBus.on("provider:models_updated", () => {
        try {
          _GenTab.updateModelOptions();
          _GenTab.updateGrokReferenceControls();
          _GenTab.renderFileIdThumbnails();
          _GenTab._updateRefModeUI();
        } catch (_) {}
        try {
          _GenTab._applyVoicePickerVisibility();
        } catch (_) {}
        try {
          _GenTab._applyCharacterPickerVisibility();
        } catch (_) {}
      });
      window.eventBus.on("provider:api_configs_loaded", () => {
        try {
          const current =
            document.getElementById("genProvider")?.value || "flow";
          if (current === "flow") {
            _GenTab._renderByProvider(current);
            _GenTab.updateRatioOptions();
            _GenTab.updateDownloadResolutionOptions();
            _GenTab.updateQuantityOptions();
            _GenTab.updateFlowVideoDurationOptions();
            _GenTab._updateChainUI();
          } else {
            setTimeout(() => {
              try {
                if (
                  (document.getElementById("genProvider")?.value || "flow") !==
                  current
                )
                  return;
                _GenTab._renderByProvider(current);
                if (current === "grok") {
                  _GenTab.updateGrokVideoDurationOptions();
                  _GenTab.updateGrokVideoResolutionOptions();
                }
              } catch (_) {}
            }, 0);
          }
        } catch (_) {}
      });
      window.eventBus.on(
        "prompt:single_completed",
        ({ index, total, provider }) => {
          if (provider === "flow" && typeof sendLog === "function") {
            sendLog(`Flow prompt ${index}/${total} \u2713`, "success");
          }
        },
      );
      window.eventBus.on("provider:updated", () => {
        _GenTab._updateProviderTabsFromMeta();
        _GenTab._syncConfirmProviderName();
      });
      window.eventBus.on("provider:meta_loaded", () => {
        console.log("[GenTab] provider:meta_loaded event received");
        _GenTab._updateProviderTabsFromMeta();
        _GenTab._syncConfirmProviderName();
      });
    }
    setTimeout(() => _GenTab._refreshProviderPillsGate(), 0);
    setTimeout(() => _GenTab._updateProviderTabsFromMeta(), 500);
    _GenTab._bindAllLockedOverlay();
  }
  static _bindAllLockedOverlay() {
    const overlay = document.getElementById("genAllLockedOverlay");
    if (!overlay || overlay._boundHandlers) return;
    overlay._boundHandlers = true;
    const loginBtn = overlay.querySelector("#genAllLockedLoginBtn");
    const upgradeBtn = overlay.querySelector("#genAllLockedUpgradeBtn");
    if (loginBtn) {
      loginBtn.addEventListener("click", () => {
        if (window.featureGate?.showLoginPrompt) {
          window.featureGate.showLoginPrompt();
        }
      });
    }
    if (upgradeBtn) {
      upgradeBtn.addEventListener("click", () => {
        if (typeof window.openUpgradeModal === "function") {
          window.openUpgradeModal();
        }
      });
    }
  }
  static _ensureProviderTab(providerKey) {
    try {
      _GenTab._checkDuplicateProviderTabs(providerKey);
      if (providerKey === "chatgpt" && window.ChatGPTSession?.prepareNewChat) {
        const activation = window.ChatGPTSession.prepareNewChat({
          createIfMissing: true,
        })
          .then((ready) => {
            if (!ready?.ready)
              throw new Error(ready?.error || "CHATGPT_NOT_READY");
            return ready;
          })
          .catch((err) => {
            console.warn(
              "[GenTab] ChatGPT activate failed:",
              err?.message || err,
            );
            throw err;
          });
        _GenTab._chatgptActivationPromise = activation;
        activation.then(
          () => {
            if (_GenTab._chatgptActivationPromise === activation)
              _GenTab._chatgptActivationPromise = null;
          },
          () => {
            if (_GenTab._chatgptActivationPromise === activation)
              _GenTab._chatgptActivationPromise = null;
          },
        );
      } else if (providerKey === "grok" && window.GrokSession?.ensureReady) {
        window.GrokSession.ensureReady({
          createIfMissing: true,
          activate: true,
        })
          .then(() => window.GrokSession.ensureTabActive?.())
          .catch((err) =>
            console.warn("[GenTab] Grok activate failed:", err?.message || err),
          );
      } else if (
        providerKey === "gemini" &&
        window.GeminiSession?.ensureReady
      ) {
        window.GeminiSession.ensureReady({
          createIfMissing: true,
          activate: true,
        })
          .then((ready) => {
            if (!ready?.ready)
              throw new Error(ready?.error || "GEMINI_NOT_READY");
            return window.GeminiSession.ensureTabActive?.();
          })
          .catch((err) =>
            console.warn(
              "[GenTab] Gemini activate failed:",
              err?.message || err,
            ),
          );
      } else if (providerKey === "muse" && window.MuseSession?.ensureReady) {
        window.MuseSession.ensureReady({
          createIfMissing: true,
          activate: true,
        })
          .then((ready) => {
            if (!ready?.ready)
              throw new Error(ready?.error || "MUSE_NOT_READY");
            return window.MuseSession.ensureTabActive?.();
          })
          .catch((err) =>
            console.warn("[GenTab] Muse activate failed:", err?.message || err),
          );
      } else if (providerKey === "flow") {
        const activation = chrome.runtime
          .sendMessage({ action: "ensureFlowTabActive", focusWindow: true })
          .catch((error) => ({
            ok: false,
            error: error?.message || "FLOW_TAB_ACTIVATION_FAILED",
          }));
        return activation;
      }
    } catch (err) {
      console.warn("[GenTab] _ensureProviderTab error:", err?.message || err);
    }
  }
  static _checkDuplicateProviderTabs(providerKey, options = {}) {
    if (!chrome?.runtime?.sendMessage) return;
    const { interactive = true } = options;
    _GenTab._dupCheckPending = _GenTab._dupCheckPending || {};
    if (_GenTab._dupCheckPending[providerKey]) return;
    try {
      chrome.runtime.sendMessage(
        { action: "queryProviderTabs", provider: providerKey },
        (resp) => {
          if (chrome.runtime.lastError) return;
          const count = resp?.count || 0;
          if (count <= 1) return;
          const providerName =
            providerKey === "chatgpt"
              ? "ChatGPT"
              : providerKey === "grok"
                ? "Grok"
                : providerKey === "gemini"
                  ? "Gemini"
                  : "Flow";
          const msg =
            window.I18n?.t?.("gen.duplicateProviderTabs", {
              provider: providerName,
              count,
            }) ||
            `Detected ${count} open ${providerName} tab(s). Please close some so the extension works reliably.`;
          if (interactive && window.customDialog?.confirm) {
            _GenTab._dupCheckPending[providerKey] = true;
            window.customDialog
              .confirm(msg, {
                title:
                  window.I18n?.t?.("gen.duplicateTabsTitle") ||
                  "Duplicate tabs detected",
                type: "warning",
                confirmText:
                  window.I18n?.t?.("gen.closeExtraTabs") || "Close extra tabs",
                cancelText: window.I18n?.t?.("common.ignore") || "Skip",
              })
              .then((shouldClose) => {
                setTimeout(() => {
                  delete _GenTab._dupCheckPending[providerKey];
                }, 3e4);
                if (shouldClose) {
                  chrome.runtime.sendMessage(
                    { action: "closeExtraProviderTabs", provider: providerKey },
                    (closeResp) => {
                      if (closeResp?.ok && closeResp.closed > 0) {
                        window.showNotification?.(
                          window.I18n?.t?.("gen.extraTabsClosed", {
                            count: closeResp.closed,
                          }) || `Closed ${closeResp.closed} extra tab(s).`,
                          "success",
                          3e3,
                        );
                      }
                    },
                  );
                }
              });
          } else if (typeof window.showNotification === "function") {
            window.showNotification(msg, "warning", 6e3);
          } else {
            console.warn(`[GenTab] ${msg}`);
          }
        },
      );
    } catch (_) {}
  }
  static _resolveProviderGate(provider, context = "gen") {
    const fg = window.featureGate;
    if (!fg) return { locked: false, reason: null, tooltip: "" };
    if (provider === "flow" && !fg.canUse?.("gen_enabled")) {
      return {
        locked: true,
        reason: "feature",
        tooltip:
          window.I18n?.t?.("gen.flowProviderLockedHint") ||
          "Google Flow requires a suitable plan.",
      };
    }
    if (provider === "chatgpt" && !fg.canUse?.("chatgpt_enabled")) {
      return {
        locked: true,
        reason: "feature",
        tooltip:
          window.I18n?.t?.("gen.providerLockedHint") ||
          "ChatGPT requires the Pro plan.",
      };
    }
    if (provider === "grok" && !fg.canUse?.("grok_enabled")) {
      return {
        locked: true,
        reason: "feature",
        tooltip:
          window.I18n?.t?.("gen.grokProviderLockedHint") ||
          "Grok requires the Pro plan.",
      };
    }
    if (provider === "gemini" && !fg.canUse?.("gemini_enabled")) {
      return {
        locked: true,
        reason: "feature",
        tooltip:
          window.I18n?.t?.("gen.geminiProviderLockedHint") ||
          "Gemini requires a suitable plan.",
      };
    }
    if (provider === "muse" && !fg.canUse?.("muse_enabled")) {
      return {
        locked: true,
        reason: "feature",
        tooltip: "Muse requires a suitable plan.",
      };
    }
    const quotaKey = (() => {
      if (context === "task") return "tasks_run_max";
      if (provider === "flow") return "gen_run_max";
      if (provider === "chatgpt") return "chatgpt_run_max";
      if (provider === "grok") return "grok_run_max";
      if (provider === "gemini") return "gemini_run_max";
      if (provider === "muse") return "muse_run_max";
      return null;
    })();
    if (!quotaKey) return { locked: false, reason: null, tooltip: "" };
    const q = fg.checkQuota?.(quotaKey);
    if (!q) return { locked: false, reason: null, tooltip: "" };
    if (q.allowed) return { locked: false, reason: null, tooltip: "" };
    const limitText = q.limit === "unlimited" ? "\u221E" : q.limit;
    const providerLabel =
      provider === "chatgpt"
        ? "ChatGPT"
        : provider === "grok"
          ? "Grok"
          : provider === "gemini"
            ? "Gemini"
            : provider === "muse"
              ? "Muse"
              : "Flow";
    const tooltip =
      window.I18n?.t?.("gen.providerQuotaExhausted", {
        provider: providerLabel,
        used: q.used,
        limit: limitText,
      }) ||
      `You have used all ${q.used}/${limitText} ${providerLabel} runs today.`;
    return {
      locked: true,
      reason: "quota",
      tooltip,
      used: q.used,
      limit: q.limit,
    };
  }
  static _refreshProviderPillsGate() {
    const tabs = document.querySelectorAll("#genProviderTabs .provider-tab");
    if (!tabs.length) return;
    const applyLock = (tab, gate) => {
      const locked = !!gate.locked;
      tab.classList.toggle("provider-tab-locked", locked);
      tab.disabled = false;
      if (locked) {
        tab.setAttribute("aria-disabled", "true");
        tab.setAttribute("data-tooltip", gate.tooltip);
        tab.title = gate.tooltip;
        tab.setAttribute("data-lock-reason", gate.reason || "");
      } else {
        tab.removeAttribute("aria-disabled");
        tab.removeAttribute("data-tooltip");
        tab.removeAttribute("data-lock-reason");
        tab.title = "";
      }
      let lockIcon = tab.querySelector(".provider-tab-lock");
      if (locked && !lockIcon) {
        lockIcon = document.createElement("span");
        lockIcon.className = "provider-tab-lock";
        lockIcon.innerHTML =
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="#eab308" style="margin-left:4px;vertical-align:-1px;"><path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z"/></svg>';
        tab.appendChild(lockIcon);
      } else if (!locked && lockIcon) {
        lockIcon.remove();
      }
    };
    const gates = {};
    tabs.forEach((tab) => {
      const provider = tab.dataset.provider;
      const gate = _GenTab._resolveProviderGate(provider, "gen");
      gates[provider] = gate;
      applyLock(tab, gate);
    });
    const allLocked =
      Object.keys(gates).length > 0 &&
      Object.keys(gates).every((p) => {
        const g = gates[p];
        return g?.locked && g.reason === "feature";
      });
    const overlay = document.getElementById("genAllLockedOverlay");
    if (overlay) {
      const isLoggedIn = !!window.authManager?.isLoggedIn?.();
      overlay.classList.toggle("hidden", !allLocked);
      const loginBtn = overlay.querySelector("#genAllLockedLoginBtn");
      const upgradeBtn = overlay.querySelector("#genAllLockedUpgradeBtn");
      if (loginBtn && upgradeBtn) {
        loginBtn.classList.toggle("hidden", isLoggedIn);
        upgradeBtn.classList.toggle("hidden", !isLoggedIn);
      }
    }
    if (!allLocked) {
      try {
        const sel = document.getElementById("genProvider");
        const currentProvider = sel?.value;
        const currentGate = gates[currentProvider];
        if (currentGate?.locked && currentGate.reason === "feature") {
          const providers = Object.keys(gates);
          let targetProvider = null;
          for (const p of providers) {
            if (p === currentProvider) continue;
            const gate = gates[p];
            if (!gate?.locked || gate.reason !== "feature") {
              targetProvider = p;
              break;
            }
          }
          if (targetProvider) {
            sel.value = targetProvider;
            document
              .querySelectorAll("#genProviderTabs .provider-tab")
              .forEach((t) => {
                const isTarget = t.dataset.provider === targetProvider;
                t.classList.toggle("provider-tab--active", isTarget);
                t.setAttribute("aria-selected", String(isTarget));
              });
            if (window.eventBus) {
              try {
                window.eventBus.emit("provider:changed", {
                  provider: targetProvider,
                });
              } catch (_) {}
            }
            if (typeof _GenTab._renderByProvider === "function") {
              try {
                _GenTab._renderByProvider(targetProvider);
              } catch (_) {}
            }
            if (typeof window.showNotification === "function") {
              try {
                const fromName =
                  window.ProviderMeta?.getName?.(currentProvider) ||
                  currentProvider;
                const toName =
                  window.ProviderMeta?.getName?.(targetProvider) ||
                  targetProvider;
                const msg =
                  window.I18n?.t?.("gen.autoSwitchProvider", {
                    from: fromName,
                    to: toName,
                  }) ||
                  window.I18n?.t?.(
                    "genNotifyExtra.autoSwitchProviderFallback",
                    { from: fromName, to: toName },
                  ) ||
                  `Switched to ${toName} because access to ${fromName} was lost`;
                window.showNotification(msg, "warning", 2500);
              } catch (_) {}
            }
          }
        }
      } catch (_) {}
    }
  }
  static _updateProviderTabsFromMeta() {
    const tabs = document.querySelectorAll("#genProviderTabs .provider-tab");
    if (!tabs.length) return;
    const PM = window.ProviderMeta;
    if (!PM) {
      console.log(
        "[GenTab] _updateProviderTabsFromMeta: ProviderMeta not available",
      );
      return;
    }
    const allProviders = PM.getAll();
    const signature = allProviders
      .map(
        (p) =>
          `${p.slug}:${p.name}:${PM.isActive(p.slug)}:${PM.hasServerIcon?.(p.slug) ? "1" : "0"}`,
      )
      .sort()
      .join("|");
    const domMatchesMeta = Array.from(tabs).every((tab) => {
      const slug = tab.dataset.provider;
      const provider = slug ? PM.getSync(slug) : null;
      const nameSpan = tab.querySelector("[data-provider-label]");
      return !provider?.name || nameSpan?.textContent === provider.name;
    });
    if (this._lastProvidersSignature === signature && domMatchesMeta) {
      return;
    }
    this._lastProvidersSignature = signature;
    console.log(
      "[GenTab] _updateProviderTabsFromMeta: providers=",
      allProviders.map((p) => `${p.slug}:${p.name}`),
    );
    tabs.forEach((tab) => {
      const slug = tab.dataset.provider;
      if (!slug) return;
      const isActive = PM.isActive(slug);
      const status = PM.getStatus(slug);
      console.log(
        `[GenTab] Tab ${slug}: status=${status}, isActive=${isActive}, display=${isActive ? "show" : "hide"}`,
      );
      tab.style.display = isActive ? "" : "none";
      const nameSpan = tab.querySelector("[data-provider-label]");
      if (nameSpan) {
        const provider = PM.getSync(slug);
        if (provider?.name) {
          console.log(
            `[GenTab] Updating tab ${slug} name: ${nameSpan.textContent} \u2192 ${provider.name}`,
          );
          nameSpan.textContent = provider.name;
          nameSpan.removeAttribute("data-i18n");
        }
      }
      const iconEl = tab.querySelector(".provider-tab-icon");
      if (iconEl && PM.hasServerIcon(slug)) {
        const newIcon = PM.getIcon(slug);
        if (newIcon && newIcon.trim().startsWith("<svg")) {
          const temp = document.createElement("div");
          temp.innerHTML = newIcon;
          const newSvg = temp.querySelector("svg");
          if (newSvg) {
            newSvg.classList.add("provider-tab-icon");
            if (slug === "muse")
              newSvg.classList.add("provider-tab-icon--muse");
            newSvg.setAttribute("width", "14");
            newSvg.setAttribute("height", "14");
            iconEl.replaceWith(newSvg);
          }
        }
      }
    });
    const sel = document.getElementById("genProvider");
    if (sel) {
      const currentSlug = sel.value;
      if (!PM.isActive(currentSlug)) {
        const visibleTab = Array.from(tabs).find((t) => {
          const s = t.dataset.provider;
          return s && PM.isActive(s);
        });
        if (visibleTab) {
          const newSlug = visibleTab.dataset.provider;
          sel.value = newSlug;
          tabs.forEach((t) => {
            const isTarget = t.dataset.provider === newSlug;
            t.classList.toggle("provider-tab--active", isTarget);
            t.setAttribute("aria-selected", String(isTarget));
          });
          window.eventBus?.emit("provider:changed", { provider: newSlug });
          _GenTab._renderByProvider(newSlug);
          const oldName = PM.getName(currentSlug);
          const newName = PM.getName(newSlug);
          window.showNotification?.(
            window.I18n?.t("taskNotify.providerSuspendedSwitch", {
              from: oldName,
              to: newName,
            }) ||
              `${oldName} t\u1EA1m ng\u01B0ng \u2014 \u0111\xE3 chuy\u1EC3n sang ${newName}`,
            "warning",
            2500,
          );
        }
      }
    }
  }
  static _renderByProvider(providerKey) {
    const compactBar = document.getElementById("genCompactBar");
    if (compactBar) {
      compactBar.dataset.provider = providerKey;
      compactBar.dataset.genMode =
        _GenTab.genTypeSelect?.value === "Video" ? "video" : "image";
    }
    if (
      !window.ProviderRegistry ||
      typeof ProviderRegistry.get !== "function"
    ) {
      console.warn(
        "[GenTab] ProviderRegistry ch\u01B0a s\u1EB5n s\xE0ng \u2014 skip _renderByProvider",
      );
      return;
    }
    const adapter = ProviderRegistry.get(providerKey);
    if (!adapter || !adapter.capabilities) {
      console.warn("[GenTab] Adapter kh\xF4ng t\u1ED3n t\u1EA1i:", providerKey);
      return;
    }
    const caps = adapter.capabilities;
    const configuredSupports =
      window.ProviderConfigManager?.safeGetSupportsSync?.(providerKey) || {};
    if (
      typeof configuredSupports.video !== "boolean" ||
      typeof configuredSupports.ref_image !== "boolean"
    ) {
      console.warn(
        "[GenTab] Provider supports not ready; preserving media/ref selections",
        {
          provider: providerKey,
          genType: _GenTab.genTypeSelect?.value,
          refMode: _GenTab.refImageMode,
        },
      );
    }
    const isChatGPT = providerKey === "chatgpt";
    const isGrok = providerKey === "grok";
    const isGemini = providerKey === "gemini";
    const isMuse = providerKey === "muse";
    queueMicrotask(() => _GenTab._updateChainUI());
    _GenTab._toggleEl("#genTypeTabs", true);
    const videoBtn = document.querySelector(
      '#genTypeToggle .gen-type-btn[data-value="Video"]',
    );
    const imageBtn = document.querySelector(
      '#genTypeToggle .gen-type-btn[data-value="Image"]',
    );
    const supportsVideo = caps.supportsVideo === true;
    if (videoBtn) {
      videoBtn.style.display = configuredSupports.video === false ? "none" : "";
      videoBtn.disabled = !supportsVideo;
    }
    if (!supportsVideo && configuredSupports.video === false) {
      if (imageBtn && !imageBtn.classList.contains("active")) {
        imageBtn.classList.add("active");
        if (videoBtn) videoBtn.classList.remove("active");
        const genTypeSel = document.getElementById("genType");
        if (genTypeSel && genTypeSel.value !== "Image") {
          genTypeSel.value = "Image";
          genTypeSel.dispatchEvent(new Event("change"));
        }
      }
    }
    const isFlowVideoMode =
      providerKey === "flow" &&
      document.getElementById("genType")?.value === "Video";
    const isFlowImageMode =
      providerKey === "flow" &&
      document.getElementById("genType")?.value !== "Video";
    _GenTab._toggleEl("#imageModelContainer", isFlowImageMode);
    _GenTab._toggleEl("#videoModelContainer", isFlowVideoMode);
    _GenTab._toggleEl("#videoInputTypeContainer", isFlowVideoMode);
    if (!isFlowVideoMode) _GenTab._toggleEl("#videoFramesSection", false);
    _GenTab._toggleEl("#chatgptModelContainer", isChatGPT);
    _GenTab._toggleEl("#geminiModelContainer", isGemini);
    _GenTab._toggleEl("#museModelContainer", isMuse);
    _GenTab._toggleEl("#grokModelContainer", isGrok);
    _GenTab._toggleEl(
      "#grokVideoInputTypeContainer",
      isGrok && document.getElementById("genType")?.value === "Video",
    );
    _GenTab._toggleEl("#grokFramesSection", false);
    if (isGrok) _GenTab.updateGrokReferenceControls();
    if (isGemini && _GenTab.geminiModelSelect) {
      const media =
        _GenTab.genTypeSelect?.value === "Video" ? "video" : "image";
      const previous = _GenTab.geminiModelSelect.value;
      const ready = _GenTab._updateModelSelect(
        _GenTab.geminiModelSelect,
        "gemini",
        media,
      );
      if (ready && previous && _GenTab.geminiModelSelect.value !== previous) {
        window.showNotification?.(
          window.I18n?.t?.("gen.geminiModelError") ||
            "The selected Gemini model is unavailable for this account.",
          "warning",
          3500,
        );
      }
      const selectedAfterRender = _GenTab.geminiModelSelect.value;
      if (ready)
        chrome.storage.local.get(["af_settings"], (res) => {
          const preferred = res.af_settings?.geminiModel;
          if (
            (document.getElementById("genProvider")?.value || "flow") !==
              "gemini" ||
            (_GenTab.genTypeSelect?.value === "Video" ? "video" : "image") !==
              media ||
            _GenTab.geminiModelSelect.value !== selectedAfterRender
          )
            return;
          if (
            preferred &&
            [..._GenTab.geminiModelSelect.options].some(
              (option) => option.value === preferred,
            )
          ) {
            _GenTab.geminiModelSelect.value = preferred;
          }
        });
    }
    if (isChatGPT && _GenTab.chatgptModelSelect) {
      chrome.storage.local.get(["af_settings"], (res) => {
        const def = res.af_settings?.chatgptModel;
        if (
          [..._GenTab.chatgptModelSelect.options].some((o) => o.value === def)
        ) {
          _GenTab.chatgptModelSelect.value = def;
        }
      });
    }
    if (isMuse) _GenTab.updateMuseModelOptions();
    const syncGrokModeFields = () => {
      const isGrokVideo =
        isGrok && document.getElementById("genType")?.value === "Video";
      const isGrokImage =
        isGrok && document.getElementById("genType")?.value !== "Video";
      _GenTab._toggleEl("#grokDurationContainer", isGrokVideo);
      _GenTab._toggleEl("#grokResolutionContainer", isGrokVideo);
      _GenTab._toggleEl("#grokImageQualityContainer", isGrokImage);
    };
    syncGrokModeFields();
    if (isGrok) {
      _GenTab.updateGrokVideoDurationOptions();
      _GenTab.updateGrokVideoResolutionOptions();
    }
    if (!_GenTab._grokVideoFieldsBound) {
      const genTypeSel = document.getElementById("genType");
      genTypeSel?.addEventListener("change", () => {
        const curProvider =
          document.getElementById("genProvider")?.value || "flow";
        const curIsGrok = curProvider === "grok";
        const curIsVideo =
          document.getElementById("genType")?.value === "Video";
        _GenTab._toggleEl("#grokDurationContainer", curIsGrok && curIsVideo);
        _GenTab._toggleEl("#grokResolutionContainer", curIsGrok && curIsVideo);
        _GenTab._toggleEl(
          "#grokImageQualityContainer",
          curIsGrok && !curIsVideo,
        );
        _GenTab._toggleEl(
          "#grokVideoInputTypeContainer",
          curIsGrok && curIsVideo,
        );
        if (curIsGrok) _GenTab.updateGrokReferenceControls();
      });
      _GenTab._grokVideoFieldsBound = true;
    }
    const syncFlowVideoFields = () => {
      const isFlowVideo =
        providerKey === "flow" &&
        document.getElementById("genType")?.value === "Video";
      _GenTab.updateFlowVideoDurationOptions();
      _GenTab.updateFlowVideoResolutionOptions();
      if (isFlowVideo) {
        _GenTab.updateFlowVideoDurationOptions();
        _GenTab._applyFramesSupport();
      }
    };
    syncFlowVideoFields();
    try {
      _GenTab._applyVoicePickerVisibility();
    } catch (_) {}
    try {
      _GenTab._applyCharacterPickerVisibility();
    } catch (_) {}
    if (!_GenTab._flowVideoFieldsBound) {
      const genTypeSel = document.getElementById("genType");
      genTypeSel?.addEventListener("change", () => {
        const curProvider =
          document.getElementById("genProvider")?.value || "flow";
        const curIsFlow = curProvider === "flow";
        const curIsVideo =
          document.getElementById("genType")?.value === "Video";
        _GenTab.updateFlowVideoDurationOptions();
        _GenTab.updateFlowVideoResolutionOptions();
        if (curIsFlow && curIsVideo) {
          _GenTab.updateFlowVideoDurationOptions();
        }
      });
      _GenTab.videoModelSelect?.addEventListener("change", () => {
        _GenTab.updateFlowVideoDurationOptions();
        _GenTab.updateFlowVideoResolutionOptions();
        _GenTab._validateRefSupportAfterChange("model");
        _GenTab._applyFramesSupport();
        _GenTab._applyVoicePickerVisibility();
        _GenTab._applyCharacterPickerVisibility();
        try {
          _GenTab.renderFileIdThumbnails();
        } catch (_) {}
      });
      _GenTab.flowVideoDurationSelect?.addEventListener("change", () => {
        _GenTab._validateRefSupportAfterChange("duration");
        try {
          _GenTab.renderFileIdThumbnails();
        } catch (_) {}
      });
      _GenTab.videoInputTypeSelect?.addEventListener("change", () => {
        _GenTab._validateRefSupportAfterChange("input_type");
      });
      _GenTab._flowVideoFieldsBound = true;
    }
    _GenTab._toggleEl("#quantitySection", providerKey === "flow");
    _GenTab._toggleEl("#chatgptDeleteAfterGenContainer", isChatGPT);
    _GenTab._toggleEl("#geminiDeleteAfterGenContainer", isGemini);
    _GenTab._toggleEl(
      "#museDeleteAfterGenContainer",
      isMuse && caps.supportsDeleteAfterGen === true,
    );
    if (isMuse && caps.supportsDeleteAfterGen === true) {
      const toggle = document.getElementById("genMuseDeleteAfterGen");
      if (toggle)
        chrome.storage.local.get(["af_settings"], (res) => {
          toggle.checked = !!res.af_settings?.museDeleteAfterGen;
        });
      if (toggle && !_GenTab._museDeleteToggleBound) {
        _GenTab._museDeleteToggleBound = true;
        toggle.addEventListener("change", () =>
          chrome.storage.local.get(["af_settings"], (res) => {
            const next = res.af_settings || {};
            next.museDeleteAfterGen = toggle.checked;
            chrome.storage.local.set({ af_settings: next });
          }),
        );
      }
    }
    if (isGemini) {
      const toggle = document.getElementById("genGeminiDeleteAfterGen");
      if (toggle)
        chrome.storage.local.get(["af_settings"], (res) => {
          toggle.checked = !!res.af_settings?.geminiDeleteAfterGen;
        });
      if (toggle && !_GenTab._geminiDeleteToggleBound) {
        _GenTab._geminiDeleteToggleBound = true;
        toggle.addEventListener("change", () =>
          chrome.storage.local.get(["af_settings"], (res) => {
            const next = res.af_settings || {};
            next.geminiDeleteAfterGen = toggle.checked;
            chrome.storage.local.set({ af_settings: next });
          }),
        );
      }
    }
    if (isChatGPT) {
      const deleteToggle = document.getElementById("genChatgptDeleteAfterGen");
      if (deleteToggle) {
        chrome.storage.local.get(["af_settings"], (res) => {
          deleteToggle.checked = !!res.af_settings?.chatgptDeleteAfterGen;
        });
        if (!_GenTab._chatgptDeleteToggleBound) {
          _GenTab._chatgptDeleteToggleBound = true;
          deleteToggle.addEventListener("change", () => {
            chrome.storage.local.get(["af_settings"], (res) => {
              const settings = res.af_settings || {};
              settings.chatgptDeleteAfterGen = deleteToggle.checked;
              chrome.storage.local.set({ af_settings: settings });
            });
          });
        }
      }
    }
    if (providerKey === "flow") {
      try {
        const qtySelect = document.getElementById("quantitySelect");
        if (qtySelect) {
          const supportedQty =
            Array.isArray(caps.supportedQuantities) &&
            caps.supportedQuantities.length > 0
              ? caps.supportedQuantities
              : [1, 2, 3, 4];
          Array.from(qtySelect.options).forEach((opt) => {
            const v = parseInt(opt.value, 10);
            opt.hidden = !supportedQty.includes(v);
          });
          if (!supportedQty.includes(parseInt(qtySelect.value, 10))) {
            qtySelect.value = String(supportedQty[0]);
          }
        }
      } catch (_e) {}
    }
    if (providerKey === "flow") {
      _GenTab._toggleEl("#ratioSection", true);
      _GenTab.updateRatioOptions();
    } else if (isGemini) {
      _GenTab._renderGeminiRatioOptions();
    } else if (isMuse) {
      _GenTab._renderMuseRatioOptions();
    } else if (
      caps.supportsRatio !== false &&
      Array.isArray(caps.supportedRatios) &&
      caps.supportedRatios.length > 0
    ) {
      _GenTab._toggleEl("#ratioSection", true);
      _GenTab._renderRatioPills(
        caps.supportedRatios,
        caps.ratioUiMap || {},
        providerKey,
      );
    } else {
      _GenTab._toggleEl("#ratioSection", true);
      if (_GenTab.aspectRatioSelect) {
        _GenTab.aspectRatioSelect.innerHTML = "";
        _GenTab.aspectRatioSelect.disabled = true;
      }
      console.info(
        `[GenTab] ${providerKey} ratios unavailable from provider config`,
      );
    }
    if (typeof caps.maxRefImages === "number") {
      _GenTab._chatgptMaxRefImages = caps.maxRefImages;
    } else {
      _GenTab._chatgptMaxRefImages = null;
    }
    if (caps.supportsRefImage === false) {
      if (configuredSupports.ref_image === false) {
        _GenTab.refImageMode = "none";
        if (_GenTab.refImageModeSelect)
          _GenTab.refImageModeSelect.value = "none";
      }
      _GenTab._toggleEl(_GenTab.refImagesSection, false);
      _GenTab._setRefPickerMode("none");
    } else {
      _GenTab._toggleEl(_GenTab.refImagesSection, true);
      _GenTab._setRefPickerMode("all");
    }
    if (typeof _GenTab._syncDownloadVisibility === "function") {
      _GenTab._syncDownloadVisibility();
    }
    if (providerKey === "flow") _GenTab.updateRefImagesVisibility();
    else if (isGrok) _GenTab.updateGrokFrameControls();
    if (_GenTab.startBtn) {
      const labelSpan =
        _GenTab.startBtn.querySelector("span") || _GenTab.startBtn;
      if (isGrok) {
        labelSpan.textContent =
          window.I18n?.t("gen.generateGrok") || "Generate via Grok";
      } else if (isChatGPT) {
        labelSpan.textContent =
          window.I18n?.t("gen.generateChatGPT") || "Generate via ChatGPT";
      } else {
        labelSpan.textContent = window.I18n?.t("gen.generate") || "Generate";
      }
    }
    const runModeRow = document.querySelector(".gen-run-mode-row");
    if (runModeRow) {
      if (isChatGPT || isGrok || isMuse) {
        runModeRow.classList.add("hidden");
        if (_GenTab._savedRunModeBeforeProvider === void 0) {
          _GenTab._savedRunModeBeforeProvider = _GenTab.runMode;
        }
        _GenTab.runMode = "sequential";
        _GenTab._updateRunModeUI();
      } else {
        if (_GenTab._savedRunModeBeforeProvider !== void 0) {
          _GenTab.runMode = _GenTab._savedRunModeBeforeProvider;
          _GenTab._savedRunModeBeforeProvider = void 0;
          _GenTab._updateRunModeUI();
        }
        const isMulti = _GenTab.multiPromptCheck?.checked;
        runModeRow.classList.toggle("hidden", !isMulti);
        if (isMulti) {
          _GenTab._updateRunModeUI();
        }
      }
    }
  }
  static _rememberProviderRatioSelection(providerOverride = null) {
    const provider =
      providerOverride ||
      document.getElementById("genProvider")?.value ||
      "flow";
    if (
      !_GenTab._providerRatioSelections[provider] ||
      !_GenTab.aspectRatioSelect?.value
    )
      return;
    const mode = _GenTab.genTypeSelect?.value === "Video" ? "video" : "image";
    _GenTab._providerRatioSelections[provider][mode] =
      _GenTab.aspectRatioSelect.value;
  }
  static _rememberGeminiRatioSelection() {
    if ((document.getElementById("genProvider")?.value || "flow") !== "gemini")
      return;
    _GenTab._rememberProviderRatioSelection("gemini");
  }
  static _configuredRatioValues(provider, mode) {
    const configured =
      window.ProviderConfigManager?.safeGetRatiosSync?.(provider, mode) || [];
    return configured
      .map((item) => {
        if (typeof item === "string") return item;
        return provider === "chatgpt" || provider === "grok"
          ? item?.ui_name
          : item?.value;
      })
      .filter(Boolean);
  }
  static _resolveFlowRatio(candidate = null) {
    const mode = _GenTab.genTypeSelect?.value === "Video" ? "video" : "image";
    const validValues = _GenTab._configuredRatioValues("flow", mode);
    if (validValues.length === 0) return null;
    const settings =
      _GenTab._settingsCache || window.storageSettings?.getSettings?.() || {};
    const configuredDefault =
      mode === "video"
        ? settings.defaultVideoRatio
        : settings.defaultImageRatio;
    const remembered = _GenTab._providerRatioSelections.flow[mode];
    const renderedOwner = _GenTab.aspectRatioSelect?.dataset?.cg5Provider;
    const flowOwnedCandidate =
      !renderedOwner || renderedOwner === "flow" ? candidate : null;
    return (
      [
        flowOwnedCandidate,
        remembered,
        configuredDefault,
        settings.aspectRatio,
        validValues[0],
      ].find((value) => validValues.includes(value)) || null
    );
  }
  static _renderGeminiRatioOptions() {
    const select = _GenTab.aspectRatioSelect;
    if (!select) return;
    const mode = _GenTab.genTypeSelect?.value === "Video" ? "video" : "image";
    const render = (configured) => {
      const currentProvider =
        document.getElementById("genProvider")?.value || "flow";
      const currentMode =
        _GenTab.genTypeSelect?.value === "Video" ? "video" : "image";
      if (currentProvider !== "gemini" || currentMode !== mode) return;
      if (!Array.isArray(configured) || configured.length === 0) {
        select.innerHTML = "";
        select.disabled = true;
        _GenTab._toggleEl("#ratioSection", true);
        console.info(
          `[GenTab] Gemini ${mode} ratios unavailable from provider config`,
        );
        return;
      }
      select.disabled = false;
      const values = configured.map((item) => item.value).filter(Boolean);
      const uiMap = configured.reduce((map, item) => {
        if (item.value) map[item.value] = item.label || item.value;
        return map;
      }, {});
      _GenTab._toggleEl("#ratioSection", true);
      _GenTab._renderRatioPills(values, uiMap, "gemini");
    };
    const cached =
      window.ProviderConfigManager?.safeGetRatiosSync?.("gemini", mode) || [];
    if (cached.length) {
      render(cached);
      return;
    }
    render([]);
    window.ProviderConfigManager?.getRatios?.("gemini", mode)
      .then(render)
      .catch((error) =>
        console.warn(
          `[GenTab] Gemini ${mode} ratio fetch failed:`,
          error?.message,
        ),
      );
  }
  static _renderMuseRatioOptions() {
    const select = _GenTab.aspectRatioSelect;
    if (!select) return;
    const mode = _GenTab.genTypeSelect?.value === "Video" ? "video" : "image";
    const render = (configured) => {
      var _a;
      const currentProvider =
        document.getElementById("genProvider")?.value || "flow";
      const currentMode =
        _GenTab.genTypeSelect?.value === "Video" ? "video" : "image";
      if (currentProvider !== "muse" || currentMode !== mode) return;
      const ratios = Array.isArray(configured) ? configured : [];
      const values = ratios.map((item) => item?.value || item).filter(Boolean);
      if (!values.length) {
        select.innerHTML = "";
        select.disabled = true;
        _GenTab._toggleEl("#ratioSection", true);
        console.info(
          `[GenTab] Muse ${mode} ratios unavailable from provider config`,
        );
        return;
      }
      const labels = ratios.reduce((map, item) => {
        const value = item?.value || item;
        if (value) map[value] = item?.label || value;
        return map;
      }, {});
      const configuredDefault =
        ratios.find((item) => item?.is_default === true)?.value || null;
      _GenTab._providerRatioConfigDefaults ??
        (_GenTab._providerRatioConfigDefaults = {});
      (_a = _GenTab._providerRatioConfigDefaults).muse ?? (_a.muse = {});
      _GenTab._providerRatioConfigDefaults.muse[mode] = configuredDefault;
      select.disabled = false;
      _GenTab._toggleEl("#ratioSection", true);
      _GenTab._renderRatioPills(values, labels, "muse");
    };
    const cached =
      window.ProviderConfigManager?.safeGetRatiosSync?.("muse", mode) || [];
    if (cached.length) {
      render(cached);
      return;
    }
    render([]);
    window.ProviderConfigManager?.getRatios?.("muse", mode)
      .then(render)
      .catch((error) =>
        console.warn(
          `[GenTab] Muse ${mode} ratio fetch failed:`,
          error?.message,
        ),
      );
  }
  static _renderRatioPills(supportedRatios, uiMap, providerKey) {
    const sel = _GenTab.aspectRatioSelect;
    if (!sel) return;
    sel.disabled = false;
    const currentValue = sel.value;
    const mediaModeAtRender =
      _GenTab.genTypeSelect?.value === "Video" ? "video" : "image";
    if (providerKey === "flow") {
      const lastProvider = sel.dataset.cg5Provider;
      if (
        lastProvider === "chatgpt" ||
        lastProvider === "grok" ||
        lastProvider === "gemini"
      ) {
        _GenTab.updateRatioOptions();
        sel.dataset.cg5Provider = "flow";
      }
      return;
    }
    const iconMap = {
      story: "\u25AE",
      portrait: "\u25AF",
      square: "\u25A1",
      landscape: "\u25AD",
      widescreen: "\u25AC",
      "9:16": "\u25AE",
      "3:4": "\u25AF",
      "2:3": "\u25AF",
      "1:1": "\u25A1",
      "4:3": "\u25AD",
      "3:2": "\u25AD",
      "16:9": "\u25AC",
    };
    sel.dataset.cg5Provider = providerKey;
    sel.innerHTML = "";
    for (const ratio of supportedRatios) {
      const display = uiMap[ratio] || ratio;
      const icon = iconMap[ratio] || "";
      const opt = document.createElement("option");
      opt.value = ratio;
      opt.textContent = icon ? `${icon} ${display}` : display;
      sel.appendChild(opt);
    }
    if (providerKey === "gemini") {
      const sessionRatio = _GenTab._geminiRatioSelections[mediaModeAtRender];
      const cachedDefault2 =
        mediaModeAtRender === "video"
          ? _GenTab._settingsCache?.geminiVideoRatio
          : null;
      const preferred =
        sessionRatio ||
        cachedDefault2 ||
        (supportedRatios.includes(currentValue)
          ? currentValue
          : supportedRatios[0]);
      if (supportedRatios.includes(preferred)) sel.value = preferred;
      const initialRenderedValue = sel.value;
      chrome.storage.local.get(["af_settings"], (res) => {
        const currentProvider =
          document.getElementById("genProvider")?.value || "flow";
        const currentMediaMode =
          _GenTab.genTypeSelect?.value === "Video" ? "video" : "image";
        if (
          currentProvider !== "gemini" ||
          currentMediaMode !== mediaModeAtRender
        )
          return;
        if (_GenTab._geminiRatioSelections[mediaModeAtRender]) return;
        if (sel.value !== initialRenderedValue) return;
        const configuredDefault2 =
          mediaModeAtRender === "video"
            ? res.af_settings?.geminiVideoRatio
            : null;
        if (supportedRatios.includes(configuredDefault2))
          sel.value = configuredDefault2;
      });
      return;
    }
    const remembered =
      _GenTab._providerRatioSelections[providerKey]?.[mediaModeAtRender];
    const settingKey =
      providerKey === "grok"
        ? "grokDefaultRatio"
        : providerKey === "muse"
          ? "museDefaultRatio"
          : "chatgptDefaultRatio";
    const cachedDefault = _GenTab._settingsCache?.[settingKey];
    const configuredDefault =
      _GenTab._providerRatioConfigDefaults?.[providerKey]?.[mediaModeAtRender];
    const syncPreferred = [
      remembered,
      cachedDefault,
      configuredDefault,
      supportedRatios[0],
    ].find((value) => supportedRatios.includes(value));
    if (syncPreferred) sel.value = syncPreferred;
    chrome.storage.local.get(["af_settings"], (res) => {
      const currentProvider =
        document.getElementById("genProvider")?.value || "flow";
      const currentMediaMode =
        _GenTab.genTypeSelect?.value === "Video" ? "video" : "image";
      if (
        currentProvider !== providerKey ||
        currentMediaMode !== mediaModeAtRender
      )
        return;
      const initialRenderedValue = syncPreferred || supportedRatios[0];
      if (sel.value !== initialRenderedValue) return;
      const settings = res.af_settings || {};
      const defaultRatio =
        settings[settingKey] || configuredDefault || supportedRatios[0];
      if (_GenTab._providerRatioSelections[providerKey]?.[mediaModeAtRender])
        return;
      if (supportedRatios.includes(defaultRatio)) {
        sel.value = defaultRatio;
      } else {
        sel.value = supportedRatios[0];
      }
    });
  }
  static _toggleEl(selector, visible) {
    const el =
      typeof selector === "string"
        ? document.querySelector(selector)
        : selector;
    if (!el) return;
    if (visible) {
      el.classList.remove("hidden");
      el.style.display = "";
    } else {
      el.classList.add("hidden");
    }
  }
  static _setRefPickerMode(mode) {
    _GenTab._refPickerMode = mode;
    _GenTab._imagePickerModalOptions =
      mode === "upload-only" ? { hideFlowTilePicker: true } : null;
  }
  static async _updateProviderStatus(providerKey) {
    const badge = _GenTab.providerStatusBadge;
    if (!badge) return;
    if (providerKey !== "chatgpt") {
      badge.classList.remove(
        "is-visible",
        "is-info",
        "is-warning",
        "is-success",
        "is-blocked",
      );
      badge.textContent = "";
      return;
    }
    badge.classList.add("is-visible");
    badge.classList.remove("is-success", "is-warning", "is-blocked", "is-info");
    badge.classList.add("is-info");
    badge.textContent = "...";
    if (!window.ChatGPTSession) {
      badge.classList.remove("is-info");
      badge.classList.add("is-warning");
      badge.textContent =
        window.I18n?.t("gen.providerStatusLogin") || "Not logged in";
      return;
    }
    try {
      const result = await window.ChatGPTSession.ensureReady({
        createIfMissing: false,
        activate: false,
      });
      badge.classList.remove(
        "is-info",
        "is-warning",
        "is-blocked",
        "is-success",
      );
      if (result?.ready) {
        badge.classList.add("is-success");
        badge.textContent =
          window.I18n?.t("gen.providerStatusReady") || "Ready";
      } else if (
        result?.error === "NOT_LOGGED_IN" ||
        result?.error === "NO_TAB"
      ) {
        badge.classList.add("is-warning");
        badge.textContent =
          window.I18n?.t("gen.providerStatusLogin") || "Not logged in";
      } else {
        badge.classList.add("is-blocked");
        badge.textContent =
          window.I18n?.t("gen.providerStatusBlocked") || "Blocked";
      }
    } catch (err) {
      console.warn("[GenTab] _updateProviderStatus error:", err);
      badge.classList.remove("is-info", "is-success");
      badge.classList.add("is-warning");
      badge.textContent =
        window.I18n?.t("gen.providerStatusLogin") || "Not logged in";
    }
  }
  static _buildChatGPTFilename(
    template,
    project,
    prompt2,
    promptIdx,
    urlIdx,
    subFolder,
    taskName,
    downloadFolder,
    outputIndex = null,
  ) {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const time = now.toTimeString().slice(0, 8).replace(/:/g, "-");
    const toAscii = (s) =>
      (s || "")
        .replace(/[đĐ]/g, (c) => (c === "\u0111" ? "d" : "D"))
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");
    const safeProject = toAscii(project || "flow")
      .substring(0, 30)
      .replace(/[^a-zA-Z0-9_-]/g, "_");
    const safePrompt = toAscii(prompt2 || "chatgpt")
      .substring(0, 40)
      .replace(/[^a-zA-Z0-9_-]/g, "_");
    const resolvedIndex =
      Number.isSafeInteger(outputIndex) && outputIndex > 0
        ? outputIndex
        : (promptIdx - 1) * 10 + urlIdx;
    const safeIndex = String(resolvedIndex).padStart(3, "0");
    let filename = (template || "[Date]_[Prompt]_[Index]")
      .replace(/\[Date\]/gi, date)
      .replace(/\[Time\]/gi, time)
      .replace(/\[Project\]/gi, safeProject)
      .replace(/\[Prompt\]/gi, safePrompt)
      .replace(/\[Index\]/gi, safeIndex);
    filename = filename.replace(/_+/g, "_").replace(/^_|_$/g, "");
    if (!filename) filename = "chatgpt_" + Date.now();
    const safeRootFolder =
      window.DownloadHelper.normalizeDownloadRootFolder(downloadFolder);
    let baseFolder = safeRootFolder;
    if (subFolder) {
      const safeSub =
        window.DownloadHelper.normalizeDownloadSubfolder(subFolder);
      if (safeSub && safeSub.toLowerCase() !== safeRootFolder.toLowerCase()) {
        baseFolder = `${safeRootFolder}/${safeSub}`;
      } else if (safeSub) {
        console.warn(
          "[GenTab] _buildChatGPTFilename: subFolder tr\xF9ng downloadFolder, skip duplicate layer:",
          safeRootFolder,
        );
      }
    }
    if (taskName) {
      const safeTaskName =
        window.DownloadHelper.normalizeDownloadSubfolder(taskName);
      if (!safeTaskName) return `${baseFolder}/${filename}.png`;
      const lastSeg = baseFolder.split("/").pop() || "";
      if (safeTaskName.toLowerCase() === lastSeg.toLowerCase()) {
        console.warn(
          "[GenTab] _buildChatGPTFilename: taskName tr\xF9ng last folder layer, skip duplicate:",
          lastSeg,
        );
        return `${baseFolder}/${filename}.png`;
      }
      return `${baseFolder}/${safeTaskName}/${filename}.png`;
    }
    return `${baseFolder}/${filename}.png`;
  }
  static _buildChatTrackerData(
    label,
    prompts,
    states,
    startedAt,
    isRunning,
    resultsByPrompt = [],
  ) {
    const completed = states.filter((s) => s === "COMPLETED").length;
    const failed = states.filter((s) => s === "FAILED").length;
    const total = prompts.length;
    const status = isRunning
      ? "running"
      : completed > 0
        ? "completed"
        : "stopped";
    const allItems = prompts.map((p, i) => {
      const results = Array.isArray(resultsByPrompt[i])
        ? resultsByPrompt[i]
        : [];
      return {
        id: "p" + i,
        promptIndex: i,
        promptText: p,
        state: states[i] || "PENDING",
        retryCount: 0,
        submittedAt: null,
        completedAt: null,
        ...(results.length ? { results } : {}),
      };
    });
    const activeStates = new Set([
      "SUBMITTING",
      "SUBMITTED",
      "MONITORING",
      "RETRY_SUBMIT",
    ]);
    const activeItems = allItems.filter((item) => activeStates.has(item.state));
    const activeIds = new Set(activeItems.map((item) => item.id));
    const remainingSlots = Math.max(0, 15 - activeItems.length);
    const tailItems =
      remainingSlots > 0
        ? allItems
            .filter((item) => !activeIds.has(item.id))
            .slice(-remainingSlots)
        : [];
    const visibleItems = [...activeItems, ...tailItems]
      .slice(0, 15)
      .sort((a, b) => a.promptIndex - b.promptIndex);
    return {
      isRunning,
      completed,
      total,
      elapsed: startedAt ? Date.now() - startedAt : 0,
      jobs: [
        {
          id: "chat-gen",
          owner: "prompts",
          label,
          status,
          completed,
          failed,
          total,
          startedAt,
          items: visibleItems,
        },
      ],
    };
  }
  static _broadcastChatTracker(provider, data) {
    if (!chrome?.tabs?.query) return;
    const providerData = { ...data, trackerProvider: provider };
    if (provider === "chatgpt" || provider === "grok") {
      const patterns2 =
        window.ProviderConfigManager?.getTabQueryPatterns?.(provider) || [];
      if (!patterns2.length) return Promise.resolve(false);
      return new Promise((resolve) =>
        chrome.tabs.query({ url: patterns2 }, (tabs) => {
          if (chrome.runtime.lastError || !tabs?.length) {
            resolve(false);
            return;
          }
          const tabIds = tabs.map((tab) => tab.id).filter(Number.isInteger);
          chrome.runtime.sendMessage(
            {
              action: `${provider}:broadcastTracker`,
              tabIds,
              data: providerData,
            },
            (response) => {
              const error = chrome.runtime.lastError;
              if (error)
                console.warn(
                  `[GenTab] ${provider} tracker snapshot failed:`,
                  error.message,
                );
              resolve(response?.success === true);
            },
          );
        }),
      );
    }
    if (provider === "muse") {
      return new Promise((resolve) =>
        chrome.runtime.sendMessage(
          { action: "muse:broadcastTracker", data: providerData },
          (response) => {
            const error = chrome.runtime.lastError;
            if (error)
              console.warn(
                "[GenTab] Muse tracker snapshot failed:",
                error.message,
              );
            resolve(response?.success === true);
          },
        ),
      );
    }
    const patterns =
      window.ProviderConfigManager?.getTabQueryPatterns?.(provider) || [];
    patterns.forEach((pat) => {
      try {
        chrome.tabs.query({ url: pat }, (tabs) => {
          if (chrome.runtime.lastError) {
            console.warn(
              "[GenTab] trackerBroadcast query l\u1ED7i:",
              pat,
              chrome.runtime.lastError.message,
            );
            return;
          }
          if (!tabs || tabs.length === 0) {
            return;
          }
          tabs.forEach((t) => {
            try {
              chrome.tabs.sendMessage(
                t.id,
                { action: "pq:trackerUpdate", data: providerData },
                () => {
                  if (chrome.runtime.lastError) {
                  }
                },
              );
            } catch (_) {}
          });
        });
      } catch (_) {}
    });
  }
  static async _resolveCrossProviderRefThumbnail(thumbnail) {
    if (typeof thumbnail !== "string" || !thumbnail) {
      return { success: false, error: "EMPTY_THUMBNAIL" };
    }
    const dataMatch = thumbnail.match(/^data:([^;,]+);base64,(.+)$/s);
    if (dataMatch) {
      return {
        success: true,
        base64: dataMatch[2],
        contentType: dataMatch[1],
        source: "data-url",
      };
    }
    let response = null;
    if (/^https?:/i.test(thumbnail)) {
      response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: "fetchBlob", url: thumbnail, expectImage: true },
          (result) => {
            const runtimeError = chrome.runtime.lastError?.message;
            resolve(
              result ||
                (runtimeError ? { success: false, error: runtimeError } : null),
            );
          },
        );
      });
    }
    if (
      !response?.success &&
      /^(?:https?:|blob:)/i.test(thumbnail) &&
      window.MessageBridge?.sendToContentScript
    ) {
      const primaryError = response?.error || null;
      const flowResponse = await window.MessageBridge.sendToContentScript(
        "fetchImageAsBase64",
        { url: thumbnail },
      );
      response = flowResponse?.success
        ? flowResponse
        : {
            success: false,
            error:
              [primaryError, flowResponse?.error]
                .filter(Boolean)
                .join(" -> ") || "REF_FETCH_FAILED",
          };
    }
    return response || { success: false, error: "UNSUPPORTED_THUMBNAIL_URL" };
  }
  static _applyGeminiMediaProgress(data) {
    const context = _GenTab._geminiTrackerContext;
    if (
      !context ||
      !Number.isInteger(data?.promptIndex) ||
      data.promptIndex !== context.activePromptIndex ||
      !context.runId ||
      typeof data.runId !== "string"
    )
      return false;
    const prefix = `${context.runId}-attempt-`;
    if (!data.runId.startsWith(prefix)) return false;
    const suffix = data.runId.slice(prefix.length);
    if (!/^[1-9][0-9]*$/.test(suffix)) return false;
    const attempt = Number(suffix);
    if (!Number.isSafeInteger(attempt) || attempt < (context.attempt || 0))
      return false;
    const phases = {
      preparing: "started",
      new_chat: "started",
      cleanup: "started",
      model: "prompt_submitting",
      model_skipped: "prompt_submitting",
      upload: "prompt_submitting",
      tool: "prompt_submitting",
      tool_prompt_fallback: "prompt_submitting",
      ratio: "prompt_submitting",
      ratio_prompt_fallback: "prompt_submitting",
      submitting: "prompt_submitting",
      generating: "waiting_tiles",
      conversation_ready: "waiting_tiles",
      materializing: "waiting_tiles",
      completed: "waiting_tiles",
      failed: "waiting_tiles",
    };
    if (!Object.hasOwn(phases, data.state)) return false;
    const phase = phases[data.state];
    context.attempt = attempt;
    context.states[data.promptIndex] =
      phase === "waiting_tiles" ? "MONITORING" : "SUBMITTING";
    context.tracker(true);
    window.eventBus?.emit?.("execution:tracker_update", {
      owner: "prompts",
      phase,
      current: data.promptIndex + 1,
      total: context.prompts.length,
      promptText: context.prompts[data.promptIndex],
      provider: "gemini",
      mediaType: data.mediaType,
    });
    return true;
  }
  static async _submitViaGemini({
    prompts = [],
    mentionPrompts = [],
    fileIds = [],
    settings = {},
    settingsObj = {},
  } = {}) {
    const adapter = window.ProviderRegistry?.get?.("gemini");
    if (!adapter) throw new Error("GEMINI_ADAPTER_NOT_READY");
    const mediaType = settings.genType === "Video" ? "video" : "image";
    const geminiModel =
      settings.model ||
      window.ModelRegistry?.safeGetDefault?.("gemini", mediaType);
    if (!geminiModel) throw new Error("GEMINI_MODEL_CONFIG_UNAVAILABLE");
    const refImageMode = ["all", "mention", "sequential", "none"].includes(
      settings.refImageMode,
    )
      ? settings.refImageMode
      : "all";
    const maxRef =
      window.ProviderConfigManager?.safeGetMaxRefImagesSync?.(
        "gemini",
        "image",
      ) ?? 0;
    if (refImageMode !== "none" && fileIds.length && maxRef <= 0) {
      throw new Error("GEMINI_REF_CONFIG_UNAVAILABLE");
    }
    const idsToResolve =
      refImageMode === "none"
        ? []
        : refImageMode === "all"
          ? fileIds.slice(0, maxRef)
          : fileIds;
    if (refImageMode === "all" && fileIds.length > maxRef) {
      sendLog(
        `Gemini: v\u01B0\u1EE3t gi\u1EDBi h\u1EA1n ${maxRef} \u1EA3nh ref \u2014 ch\u1EC9 g\u1EEDi ${maxRef} \u1EA3nh \u0111\u1EA7u`,
        "warn",
      );
    }
    const refAllowed =
      !!window.featureGate?.canUseProviderRefImages?.("gemini");
    if (idsToResolve.length && !refAllowed)
      throw new Error("GEMINI_REF_IMAGES_NOT_ALLOWED");
    const resolved = [];
    for (const fileId of idsToResolve) {
      const fileName = _GenTab.fileNameCache?.[fileId] || `${fileId}.png`;
      const mentionName = _GenTab.refImageNames?.[fileId] || "";
      const pending = window.pendingUploadFiles?.get?.(fileId)?.file;
      if (pending) {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(pending);
        });
        resolved.push({
          base64: String(dataUrl).split(",")[1],
          name: fileName,
          mentionName,
          type: pending.type || "image/png",
          _fileId: fileId,
        });
        continue;
      }
      const thumbnail = _GenTab.thumbnailCache?.[fileId];
      if (!thumbnail) throw new Error(`GEMINI_REF_NOT_RESOLVED:${fileId}`);
      const fetched =
        await _GenTab._resolveCrossProviderRefThumbnail(thumbnail);
      if (!fetched?.success || !fetched.base64)
        throw new Error(`GEMINI_REF_FETCH_FAILED:${fileId}`);
      const match = fetched.base64.match(/^data:(.+?);base64,(.+)$/);
      resolved.push({
        base64: match ? match[2] : fetched.base64,
        name: fileName,
        mentionName,
        type: match ? match[1] : "image/png",
        _fileId: fileId,
      });
    }
    const states = prompts.map(() => "PENDING");
    const startedAt = Date.now();
    const tracker = (running) =>
      _GenTab._broadcastChatTracker(
        "gemini",
        _GenTab._buildChatTrackerData(
          "Gemini Gen",
          prompts,
          states,
          startedAt,
          running,
        ),
      );
    _GenTab._geminiTrackerContext = {
      prompts,
      states,
      startedAt,
      tracker,
      activePromptIndex: null,
      runId: null,
      attempt: 0,
    };
    window.eventBus?.emit?.("execution:lock_changed", {
      locked: true,
      owner: "prompts",
      label: "Gemini Gen",
    });
    window.eventBus?.emit?.("execution:tracker_update", {
      owner: "prompts",
      label: "Gemini Gen",
      phase: "started",
      current: 0,
      total: prompts.length,
      promptText: prompts[0] || "",
      provider: "gemini",
      mediaType,
    });
    if (!_GenTab._geminiProgressBound) {
      _GenTab._geminiProgressBound = true;
      chrome.runtime.onMessage.addListener((message) => {
        if (message?.action !== "gemini:mediaProgress") return;
        _GenTab._applyGeminiMediaProgress(message.data);
      });
    }
    tracker(true);
    let completed = 0,
      failed = 0;
    const allResults = [];
    const failedPrompts = [];
    const downloadSettings = await window.DownloadHelper.getSettings();
    const downloadSubFolder = (
      document.getElementById("genTabSubFolder")?.value || ""
    ).trim();
    const downloadProject =
      downloadSettings.project || window._currentProjectName || "flow";
    let nextDownloadIndex = 1;
    for (let index = 0; index < prompts.length; index++) {
      if (_GenTab._geminiStopRequested) break;
      const runId = `gentab-gemini-${Date.now()}-${index}`;
      Object.assign(_GenTab._geminiTrackerContext, {
        activePromptIndex: index,
        runId,
        attempt: 0,
      });
      states[index] = "SUBMITTING";
      tracker(true);
      try {
        let refs = resolved;
        if (refImageMode === "none") refs = [];
        else if (refImageMode === "sequential" && resolved.length)
          refs = window.RefImageAssignment.select(
            resolved,
            index,
            settings.refImagesPerPrompt,
          );
        else if (refImageMode === "mention") {
          const mentionSource = mentionPrompts[index] ?? prompts[index] ?? "";
          const mentioned = new Set(
            (mentionSource.match(/@(\[[^\]]+\]|[\p{L}\p{N}_]+)/gu) || []).map(
              (value) =>
                value
                  .slice(1)
                  .replace(/^\[|\]$/g, "")
                  .toLowerCase(),
            ),
          );
          const matchedNames = new Set();
          refs = resolved.filter((ref) => {
            const full = String(ref.name || "").toLowerCase();
            const stem = full.replace(/\.[^.]+$/, "");
            const alias = String(ref.mentionName || "").toLowerCase();
            const matched = [alias, full, stem].find(
              (name) => name && mentioned.has(name),
            );
            if (matched) matchedNames.add(matched);
            return !!matched;
          });
          const unresolved = [...mentioned].filter(
            (name) => !matchedNames.has(name),
          );
          if (unresolved.length)
            sendLog(
              `Gemini prompt ${index + 1}: kh\xF4ng t\xECm th\u1EA5y ref ${unresolved.map((name) => `@${name}`).join(", ")}`,
              "warn",
            );
          if (refs.length > maxRef)
            throw new Error(
              `GEMINI_REF_LIMIT_EXCEEDED:${refs.length}/${maxRef}`,
            );
        }
        const result = await _GenTab._submitWithLocalRefProgress(
          adapter,
          "gemini",
          {
            prompt: prompts[index],
            mediaType,
            model: geminiModel,
            ratio: settings.ratio,
            shouldStop: () => _GenTab._geminiStopRequested === true,
            refs,
            runId,
            settings: {
              inputTimeoutMs:
                Number(settingsObj.inputTimeout) ||
                (await MessageBridge._getInputTimeout()),
              promptIndex: index,
            },
          },
        );
        _GenTab._geminiTrackerContext.activePromptIndex = null;
        completed++;
        states[index] = "COMPLETED";
        allResults.push(...result.results);
        const downloadStartIndex = nextDownloadIndex;
        nextDownloadIndex += result.results.length;
        window.eventBus?.emit?.("prompt:completed", {
          prompt: prompts[index],
          provider: "gemini",
          media_type: mediaType,
          model: result.model,
          ratio: settings.ratio,
          prompt_count: 1,
          quantity: result.resultCount,
          ref_file_ids: refs
            .map((ref) => ref._fileId)
            .filter(Boolean)
            .join(", "),
          result_file_ids: "",
          result_thumbnails: result.results.map((item) => ({
            thumbnail: item.url,
            type: mediaType,
            file_name: "",
          })),
          result_file_names: {},
          source: "gen",
          auto_download:
            !!document.getElementById("genTabAutoDownload")?.checked,
        });
        let downloadsOk = true;
        if (document.getElementById("genTabAutoDownload")?.checked) {
          states[index] = "MONITORING";
          tracker(true);
          window.eventBus?.emit?.("execution:tracker_update", {
            owner: "prompts",
            phase: "download",
            current: index + 1,
            total: prompts.length,
            provider: "gemini",
            mediaType,
            promptText: prompts[index],
          });
          try {
            const sharedDownload =
              await window.GeminiMediaDownloadHelper.downloadResults({
                items: result.results,
                tabId: result.tabId,
                mediaType,
                waitForComplete: !!(
                  settingsObj.geminiDeleteAfterGen ||
                  document.getElementById("genGeminiDeleteAfterGen")?.checked
                ),
                onLog: sendLog,
                filenameFor: (_item, mediaIndex) => {
                  let filename = _GenTab._buildChatGPTFilename(
                    downloadSettings.template,
                    downloadProject,
                    prompts[index],
                    index + 1,
                    mediaIndex + 1,
                    downloadSubFolder,
                    null,
                    downloadSettings.folder,
                    downloadStartIndex + mediaIndex,
                  );
                  return mediaType === "video"
                    ? filename.replace(/\.png$/i, ".mp4")
                    : filename;
                },
              });
            downloadsOk = sharedDownload.success;
          } catch (downloadError) {
            downloadsOk = false;
            sendLog(
              `Gemini download ${index + 1}: ${downloadError?.message || downloadError}`,
              "warn",
            );
          }
        }
        states[index] = "COMPLETED";
        if (
          !_GenTab._geminiStopRequested &&
          downloadsOk &&
          (settingsObj.geminiDeleteAfterGen ||
            document.getElementById("genGeminiDeleteAfterGen")?.checked)
        ) {
          try {
            const deleted =
              await window.GeminiSession?.deleteCurrentConversation?.();
            if (!deleted?.success)
              sendLog(
                `Gemini cleanup: ${deleted?.error || "DELETE_FAILED"}`,
                "warn",
              );
          } catch (cleanupError) {
            sendLog(
              `Gemini cleanup: ${cleanupError?.message || cleanupError}`,
              "warn",
            );
          }
        }
      } catch (error) {
        if (_GenTab._geminiStopRequested) {
          states[index] = "CANCELLED";
          break;
        }
        failed++;
        states[index] = "FAILED";
        const errorDetail =
          error.message || error.code || "GEMINI_MEDIA_FAILED";
        failedPrompts.push({
          index,
          prompt: prompts[index],
          error: errorDetail,
        });
        sendLog(`Gemini ${index + 1}: ${errorDetail}`, "error");
      }
      tracker(true);
      _GenTab._geminiTrackerContext.activePromptIndex = null;
      if (index < prompts.length - 1 && !_GenTab._geminiStopRequested) {
        const delayMs =
          (window.ExecutionConfig?.safeGetDelayBetweenPromptsSec?.() ?? 0) *
          1e3;
        if (delayMs > 0)
          await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    if (_GenTab._geminiStopRequested)
      states.forEach((state, index) => {
        if (["PENDING", "SUBMITTING", "MONITORING"].includes(state))
          states[index] = "CANCELLED";
      });
    tracker(false);
    _GenTab._geminiTrackerContext = null;
    const stopped = !!_GenTab._geminiStopRequested;
    window.eventBus?.emit?.("execution:tracker_update", {
      owner: "prompts",
      phase: stopped ? "stopped" : "completed",
      current: completed,
      total: prompts.length,
      provider: "gemini",
      mediaType,
      errorCount: failed,
    });
    window.eventBus?.emit?.("execution:lock_changed", {
      locked: false,
      owner: "prompts",
    });
    if (settingsObj.geminiAutoClose && completed > 0 && !stopped)
      await window.GeminiSession?.closeTab?.();
    return { completed, failed, stopped, results: allResults, failedPrompts };
  }
  static async _submitViaChatGPT(params) {
    const prompts = params.prompts || [];
    const fileIds = params.fileIds || [];
    const settings = params.settings || {};
    const settingsObj = params.settingsObj || {};
    if (!window.ProviderRegistry) {
      throw new Error("ProviderRegistry ch\u01B0a s\u1EB5n s\xE0ng");
    }
    const adapter = ProviderRegistry.get("chatgpt");
    if (!adapter) {
      throw new Error(
        "ChatGPT adapter ch\u01B0a \u0111\u01B0\u1EE3c \u0111\u0103ng k\xFD",
      );
    }
    if (_GenTab._chatgptActivationPromise) {
      await _GenTab._chatgptActivationPromise;
    }
    try {
      const ready = await adapter.ensureReady({
        forceCheck: true,
        waitForEditorMs: 12e3,
      });
      if (!ready?.ready) {
        if (window.eventBus) {
          window.eventBus.emit("chatgpt:login_required", {
            error: ready?.error || "NOT_LOGGED_IN",
          });
        }
        return {
          completed: 0,
          failed: prompts.length,
          stopped: false,
          urls: [],
          failedPrompts: prompts.map((prompt2, index) => ({
            index,
            prompt: prompt2,
            error: ready?.error || "NOT_LOGGED_IN",
          })),
        };
      }
    } catch (err) {
      console.error("[GenTab] ChatGPT ensureReady failed:", err);
      if (window.eventBus) {
        window.eventBus.emit("chatgpt:login_required", { error: err?.message });
      }
      return {
        completed: 0,
        failed: prompts.length,
        stopped: false,
        urls: [],
        failedPrompts: prompts.map((prompt2, index) => ({
          index,
          prompt: prompt2,
          error: err?.message || "CHATGPT_NOT_READY",
        })),
      };
    }
    const maxRef = adapter.capabilities?.maxRefImages || 4;
    const isMentionMode = _GenTab.refImageMode === "mention";
    const isSequentialMode = _GenTab.refImageMode === "sequential";
    const isNoneMode = _GenTab.refImageMode === "none";
    const fileIdsToResolve = isNoneMode
      ? []
      : isMentionMode || isSequentialMode
        ? fileIds
        : fileIds.slice(0, maxRef);
    if (
      !isMentionMode &&
      !isSequentialMode &&
      !isNoneMode &&
      fileIds.length > maxRef
    ) {
      sendLog(
        `ChatGPT: v\u01B0\u1EE3t gi\u1EDBi h\u1EA1n ${maxRef} \u1EA3nh ref \u2014 ch\u1EC9 g\u1EEDi ${maxRef} \u1EA3nh \u0111\u1EA7u`,
        "warn",
      );
    }
    const refImagesCapped = [];
    const fidByResolvedIndex = [];
    for (const fid of fileIdsToResolve) {
      const fileName = _GenTab.fileNameCache?.[fid] || `${fid}.png`;
      if (fid.startsWith("upload_") && window.pendingUploadFiles?.has(fid)) {
        const pendingData = window.pendingUploadFiles.get(fid);
        const file = pendingData?.file;
        if (file) {
          try {
            const base64 = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = reader.result;
                const base64Part = dataUrl.split(",")[1];
                resolve(base64Part);
              };
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(file);
            });
            refImagesCapped.push({
              base64,
              name: fileName,
              type: file.type || "image/png",
              _fileId: fid,
            });
            fidByResolvedIndex.push(fid);
            console.log(
              "[GenTab] ChatGPT: resolved ref t\u1EEB pendingUploadFiles:",
              fid,
            );
            continue;
          } catch (err) {
            console.warn(
              "[GenTab] ChatGPT: l\u1ED7i convert pending file \u2192 base64:",
              fid,
              err.message,
            );
          }
        }
      }
      const thumb = _GenTab.thumbnailCache?.[fid];
      if (!thumb) {
        console.warn(
          "[GenTab] ChatGPT: skip ref ID kh\xF4ng c\xF3 thumbnail:",
          fid,
        );
        continue;
      }
      try {
        const fetchResp =
          await _GenTab._resolveCrossProviderRefThumbnail(thumb);
        if (fetchResp?.success && fetchResp.base64) {
          const m = fetchResp.base64.match(/^data:(.+?);base64,(.+)$/);
          if (m) {
            refImagesCapped.push({
              base64: m[2],
              name: fileName,
              type: m[1],
              _fileId: fid,
            });
          } else {
            refImagesCapped.push({
              base64: fetchResp.base64,
              name: fileName,
              type: "image/png",
              _fileId: fid,
            });
          }
          fidByResolvedIndex.push(fid);
        } else {
          console.warn(
            "[GenTab] ChatGPT: fetch ref blob th\u1EA5t b\u1EA1i:",
            fid,
            fetchResp?.error,
          );
        }
      } catch (err) {
        console.warn(
          "[GenTab] ChatGPT: l\u1ED7i fetch ref blob:",
          fid,
          err.message,
        );
      }
    }
    if (
      fileIdsToResolve.length > 0 &&
      refImagesCapped.length < fileIdsToResolve.length
    ) {
      sendLog(
        `ChatGPT: ${refImagesCapped.length}/${fileIdsToResolve.length} ref s\u1EB5n s\xE0ng; ${refImagesCapped.length > 0 ? "ti\u1EBFp t\u1EE5c v\u1EDBi \u1EA3nh \u0111\xE3 t\u1EA3i \u0111\u01B0\u1EE3c" : "kh\xF4ng g\u1EEDi prompt thi\u1EBFu to\xE0n b\u1ED9 ref"}`,
        "warn",
      );
    }
    let mentionNameToFid = null;
    if (isMentionMode) {
      mentionNameToFid = {};
      for (const fid of fileIdsToResolve) {
        const slug = _GenTab.refImageNames?.[fid];
        if (slug) mentionNameToFid[String(slug).toLowerCase()] = fid;
      }
    }
    const delayBetweenMs =
      (window.ExecutionConfig?.safeGetDelayBetweenPromptsSec?.() ?? 5) * 1e3;
    const autoCloseTab = !!settingsObj.chatgptAutoClose;
    const deleteAfterGen = !!settingsObj.chatgptDeleteAfterGen;
    const autoDownloadToggle = document.getElementById("genTabAutoDownload");
    const autoDownloadEnabled =
      !!autoDownloadToggle?.checked &&
      !!window.featureGate?.canUse?.("auto_download");
    const downloadSubFolder = (
      document.getElementById("genTabSubFolder")?.value || ""
    ).trim();
    const downloadTemplate =
      settingsObj.fileNameTemplate || "[Date]_[Project]_[Prompt]_[Index]";
    const projectName = window._currentProjectName || "flow";
    let completed = 0;
    let failed = 0;
    let stopped = false;
    const allUrls = [];
    const failedPrompts = [];
    let nextDownloadIndex = 1;
    if (window.eventBus) {
      window.eventBus.emit("execution:lock_changed", {
        locked: true,
        owner: "prompts",
        label: "ChatGPT Gen",
      });
      window.eventBus.emit("execution:tracker_update", {
        owner: "prompts",
        label: "ChatGPT Gen",
        phase: "started",
        current: 0,
        total: prompts.length,
        promptText: prompts[0] || "",
      });
    }
    const _trkStates = prompts.map(() => "PENDING");
    const _trkResults = prompts.map(() => []);
    const _trkStart = Date.now();
    const _trk = (running) =>
      _GenTab._broadcastChatTracker(
        "chatgpt",
        _GenTab._buildChatTrackerData(
          "ChatGPT Gen",
          prompts,
          _trkStates,
          _trkStart,
          running,
          _trkResults,
        ),
      );
    await _trk(true);
    for (let i = 0; i < prompts.length; i++) {
      if (_GenTab._chatgptStopRequested) {
        stopped = true;
        break;
      }
      const prompt2 = prompts[i];
      if (window.eventBus) {
        window.eventBus.emit("execution:tracker_update", {
          owner: "prompts",
          phase: "prompt_submitting",
          current: i + 1,
          total: prompts.length,
          promptText: prompt2,
        });
      }
      _trkStates[i] = "SUBMITTING";
      await _trk(true);
      try {
        const _resolvedRatio =
          settings.ratio || settingsObj.chatgptDefaultRatio || "story";
        const _resolvedPrefix =
          settingsObj.chatgptFallbackPrefix || "Generate an image of: ";
        if (!settings.ratio && !settingsObj.chatgptDefaultRatio) {
          console.debug(
            '[Tier3] ChatGPT submit: ratio source empty, hardcoded fallback "story"',
          );
        }
        if (!settingsObj.chatgptFallbackPrefix) {
          console.debug(
            "[Tier3] ChatGPT submit: chatgptFallbackPrefix empty, hardcoded fallback",
          );
        }
        let refsForThisPrompt = refImagesCapped;
        let missingRequiredRef =
          fileIdsToResolve.length > 0 && refImagesCapped.length === 0;
        if (isMentionMode && mentionNameToFid) {
          const mentions =
            prompt2.match(/@(\[[^\]]+\]|[\p{L}\p{N}_]+)/gu) || [];
          const matchedFids = new Set();
          for (const m of mentions) {
            const name = m
              .substring(1)
              .replace(/^\[|\]$/g, "")
              .trim()
              .toLowerCase();
            const fid = mentionNameToFid[name];
            if (fid) matchedFids.add(fid);
          }
          missingRequiredRef ||
            (missingRequiredRef = [...matchedFids].some(
              (fid) => !fidByResolvedIndex.includes(fid),
            ));
          refsForThisPrompt = refImagesCapped.filter((_, idx) =>
            matchedFids.has(fidByResolvedIndex[idx]),
          );
          if (refsForThisPrompt.length > maxRef) {
            sendLog(
              `ChatGPT prompt ${i + 1}: ${refsForThisPrompt.length} mention v\u01B0\u1EE3t cap ${maxRef} \u2014 ch\u1EC9 g\u1EEDi ${maxRef} \u0111\u1EA7u`,
              "warn",
            );
            refsForThisPrompt = refsForThisPrompt.slice(0, maxRef);
          }
        } else if (isSequentialMode && fileIdsToResolve.length > 0) {
          const group = window.RefImageAssignment.select(
            fileIdsToResolve,
            i,
            _GenTab.refImagesPerPrompt,
          );
          missingRequiredRef ||
            (missingRequiredRef = group.some(
              (id) => !fidByResolvedIndex.includes(id),
            ));
          refsForThisPrompt = group
            .map((id) => refImagesCapped[fidByResolvedIndex.indexOf(id)])
            .filter(Boolean);
        }
        if (missingRequiredRef) {
          throw Object.assign(new Error("CHATGPT_REQUIRED_REF_MISSING"), {
            code: "REF_UPLOAD_FAILED",
          });
        }
        const result = await _GenTab._submitWithLocalRefProgress(
          adapter,
          "chatgpt",
          {
            prompt: prompt2,
            refFileIds: refsForThisPrompt,
            settings: {
              ratio: _resolvedRatio,
              imageMode: true,
              fallbackPrefix: _resolvedPrefix,
              model: settings.model || settingsObj.chatgptModel || null,
            },
            taskName: null,
            shouldStop: () => _GenTab._chatgptStopRequested === true,
          },
        );
        if (_GenTab._chatgptStopRequested && !result?.success) {
          stopped = true;
          _trkStates[i] = "CANCELLED";
          break;
        }
        if (
          result?.success &&
          Array.isArray(result.imageUrls) &&
          result.imageUrls.length > 0
        ) {
          completed += 1;
          allUrls.push(...result.imageUrls);
          const downloadStartIndex = nextDownloadIndex;
          nextDownloadIndex += result.imageUrls.length;
          if (!deleteAfterGen) {
            _trkResults[i] = result.imageUrls.map((url) => ({
              url,
              thumbnail: url,
              video: false,
            }));
          }
          _trkStates[i] = "COMPLETED";
          await _trk(true);
          if (autoDownloadEnabled && result.tabId) {
            for (let urlIdx = 0; urlIdx < result.imageUrls.length; urlIdx++) {
              const url = result.imageUrls[urlIdx];
              try {
                const fetchResp =
                  await window.MessageBridge?.chatGPTFetchImage?.(
                    url,
                    result.tabId,
                  );
                if (fetchResp?.success && fetchResp.base64) {
                  const blob = await (await fetch(fetchResp.base64)).blob();
                  const blobUrl = URL.createObjectURL(blob);
                  const filename = _GenTab._buildChatGPTFilename(
                    downloadTemplate,
                    projectName,
                    prompt2,
                    i + 1,
                    urlIdx + 1,
                    downloadSubFolder,
                    null,
                    settingsObj.downloadFolder,
                    downloadStartIndex + urlIdx,
                  );
                  const dlResp = await new Promise((resolve) => {
                    chrome.runtime.sendMessage(
                      {
                        action: "chromeDownload",
                        url: blobUrl,
                        filename,
                        waitForComplete: deleteAfterGen,
                      },
                      (r) => resolve(r),
                    );
                  });
                  setTimeout(
                    () => URL.revokeObjectURL(blobUrl),
                    deleteAfterGen ? 5e3 : 3e4,
                  );
                  if (!dlResp?.success) {
                    sendLog(
                      `ChatGPT download fail: ${dlResp?.error || "unknown"}`,
                      "warn",
                    );
                  }
                } else {
                  sendLog(
                    `ChatGPT fetchImage fail: ${fetchResp?.error || "unknown"}`,
                    "warn",
                  );
                }
              } catch (dlErr) {
                console.warn("[GenTab] ChatGPT auto-download error:", dlErr);
              }
            }
          }
          if (window.eventBus) {
            window.eventBus.emit("prompt:completed", {
              prompt: prompt2,
              media_type: "image",
              model:
                _GenTab.chatgptModelSelect?.value ||
                window.ModelRegistry?.safeGetDefault?.("chatgpt", "image") ||
                null,
              ratio: settings.ratio || "story",
              prompt_count: 1,
              quantity: result.imageUrls?.length || 1,
              ref_file_ids: fileIds.join(", "),
              result_file_ids: "",
              result_thumbnails: result.imageUrls.map((u) => ({
                thumbnail: u,
                type: "image",
                file_name: "",
              })),
              result_file_names: {},
              source: "gen",
              provider: "chatgpt",
              project_id: window._currentProjectId || null,
              auto_download: !!autoDownloadEnabled,
            });
          }
          sendLog(
            `ChatGPT prompt ${i + 1}/${prompts.length} \u2713`,
            "success",
          );
          if (deleteAfterGen && window.ChatGPTSession) {
            let cleanupSucceeded = false;
            try {
              const deleteResp =
                await window.ChatGPTSession.deleteLastMessage();
              cleanupSucceeded = deleteResp?.success === true;
              if (cleanupSucceeded) {
                sendLog(
                  `\u0110\xE3 x\xF3a tin nh\u1EAFn prompt ${i + 1}`,
                  "info",
                );
              } else {
                console.warn(
                  "[GenTab] ChatGPT: x\xF3a tin nh\u1EAFn th\u1EA5t b\u1EA1i:",
                  deleteResp?.error,
                );
              }
            } catch (delErr) {
              console.warn(
                "[GenTab] ChatGPT: l\u1ED7i khi x\xF3a tin nh\u1EAFn:",
                delErr.message,
              );
            }
            if (
              i < prompts.length - 1 &&
              typeof window.ChatGPTSession.ensureReady === "function"
            ) {
              let recovered = false;
              let recoveryError = "CHATGPT_NEW_CHAT_RECOVERY_FAILED";
              const recoveryAttempts = 2;
              for (
                let recoveryAttempt = 1;
                recoveryAttempt <= recoveryAttempts;
                recoveryAttempt++
              ) {
                if (_GenTab._chatgptStopRequested) break;
                try {
                  if (!cleanupSucceeded || recoveryAttempt > 1) {
                    if (!cleanupSucceeded) {
                      sendLog(
                        `ChatGPT: cleanup ch\u01B0a x\xE1c nh\u1EADn \u2014 t\u1EA1o chat m\u1EDBi s\u1EA1ch (${recoveryAttempt}/${recoveryAttempts})`,
                        "warn",
                      );
                    } else {
                      console.warn(
                        "[GenTab] ChatGPT post-cleanup composer recovery:",
                        recoveryError,
                      );
                    }
                    await window.ChatGPTSession.ensureTabActive({
                      forceRefresh: true,
                    });
                  }
                  if (_GenTab._chatgptStopRequested) break;
                  let newChatReady = await window.ChatGPTSession.ensureReady({
                    createIfMissing: false,
                    forceCheck: true,
                    waitForEditorMs: 3e4,
                  });
                  if (_GenTab._chatgptStopRequested) break;
                  if (!newChatReady?.ready) {
                    recoveryError =
                      newChatReady?.error || "CHATGPT_NEW_CHAT_RECOVERY_FAILED";
                    if (recoveryError !== "EDITOR_NOT_FOUND") break;
                    continue;
                  }
                  const chatMode = await window.ChatGPTSession.ensureChatMode?.(
                    { waitForEditorMs: 12e3 },
                  );
                  if (_GenTab._chatgptStopRequested) break;
                  if (chatMode?.success !== true) {
                    recoveryError = chatMode?.error || "CHAT_MODE_NOT_READY";
                    console.warn(
                      "[GenTab] ChatGPT Chat mode not ready after cleanup recovery:",
                      recoveryError,
                    );
                    if (
                      [
                        "NOT_LOGGED_IN",
                        "SELECTOR_CONFIG_UNAVAILABLE",
                        "NO_TAB",
                        "TAB_CLOSED",
                      ].includes(recoveryError)
                    )
                      break;
                    continue;
                  }
                  if (chatMode.editorPending === true) {
                    newChatReady = await window.ChatGPTSession.ensureReady({
                      createIfMissing: false,
                      forceCheck: true,
                      waitForEditorMs: 12e3,
                    });
                    if (_GenTab._chatgptStopRequested) break;
                    if (!newChatReady?.ready) {
                      recoveryError =
                        newChatReady?.error ||
                        "CHATGPT_NEW_CHAT_RECOVERY_FAILED";
                      if (recoveryError !== "EDITOR_NOT_FOUND") break;
                      continue;
                    }
                  }
                  recovered = true;
                  break;
                } catch (error) {
                  recoveryError =
                    error?.message || "CHATGPT_NEW_CHAT_RECOVERY_FAILED";
                  console.warn(
                    "[GenTab] ChatGPT cleanup recovery failed:",
                    recoveryError,
                  );
                  if (
                    [
                      "NOT_LOGGED_IN",
                      "SELECTOR_CONFIG_UNAVAILABLE",
                      "NO_TAB",
                      "TAB_CLOSED",
                    ].includes(recoveryError)
                  )
                    break;
                }
              }
              if (_GenTab._chatgptStopRequested) {
                stopped = true;
                break;
              }
              if (!recovered) {
                for (let j = i + 1; j < prompts.length; j++) {
                  _trkStates[j] = "FAILED";
                  failedPrompts.push({
                    index: j,
                    prompt: prompts[j],
                    error: recoveryError,
                  });
                  failed += 1;
                }
                sendLog(
                  `ChatGPT kh\xF4ng t\u1EA1o \u0111\u01B0\u1EE3c chat m\u1EDBi s\u1EA1ch (${recoveryError}) \u2014 d\u1EEBng prompt c\xF2n l\u1EA1i \u0111\u1EC3 tr\xE1nh gen sai`,
                  "error",
                );
                stopped = true;
                break;
              }
            }
          }
        } else {
          failed += 1;
          _trkStates[i] = "FAILED";
          await _trk(true);
          const errCode = result?.error || "UNKNOWN";
          sendLog(
            `ChatGPT prompt ${i + 1} th\u1EA5t b\u1EA1i: ${errCode} - ${result?.message || "unknown"}`,
            "warn",
          );
          failedPrompts.push({ index: i, prompt: prompt2, error: errCode });
          if (
            [
              "RATE_LIMIT",
              "CONTENT_BLOCKED",
              "IMAGE_GEN_FAILED",
              "TEXT_ONLY",
              "NETWORK",
              "TIMEOUT",
              "LIMIT_ALERT",
              "CHALLENGE_TIMEOUT",
            ].includes(errCode)
          ) {
            _GenTab._showProviderErrorNotification(
              "chatgpt",
              errCode,
              result?.message,
            );
          }
          if (errCode === "LIMIT_ALERT" || errCode === "RATE_LIMIT") {
            sendLog(
              "ChatGPT \u0111\xE3 h\u1EBFt l\u01B0\u1EE3t t\u1EA1o \u1EA3nh \u2014 d\u1EEBng c\xE1c prompt c\xF2n l\u1EA1i",
              "error",
            );
            stopped = true;
            for (let j = i + 1; j < prompts.length; j++) {
              failedPrompts.push({
                index: j,
                prompt: prompts[j],
                error: errCode,
              });
            }
            failed += prompts.length - i - 1;
            break;
          }
          if (errCode === "CONTENT_BLOCKED") {
            sendLog(
              "ChatGPT: N\u1ED9i dung b\u1ECB ch\u1EB7n \u2014 prompt n\xE0y b\u1ECB skip",
              "error",
            );
          }
        }
      } catch (err) {
        if (_GenTab._chatgptStopRequested) {
          stopped = true;
          _trkStates[i] = "CANCELLED";
          break;
        }
        failed += 1;
        _trkStates[i] = "FAILED";
        await _trk(true);
        console.error("[GenTab] ChatGPT submit error:", err);
        sendLog(
          `ChatGPT prompt ${i + 1} l\u1ED7i: ${err.message || err}`,
          "error",
        );
        failedPrompts.push({
          index: i,
          prompt: prompt2,
          error: err.message || "EXCEPTION",
        });
      }
      if (_GenTab._chatgptStopRequested) {
        stopped = true;
        break;
      }
      if (i < prompts.length - 1 && delayBetweenMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenMs));
      }
    }
    if (autoCloseTab && window.ChatGPTSession) {
      try {
        window.ChatGPTSession.closeTab();
      } catch (err) {
        console.warn("[GenTab] ChatGPT closeTab failed:", err);
      }
    }
    if (stopped) {
      for (let k = 0; k < _trkStates.length; k++)
        if (_trkStates[k] === "PENDING") _trkStates[k] = "CANCELLED";
    }
    await _trk(false);
    if (window.eventBus) {
      window.eventBus.emit("execution:tracker_update", {
        owner: "prompts",
        phase: stopped ? "stopped" : "completed",
        current: prompts.length,
        total: prompts.length,
      });
      window.eventBus.emit("execution:lock_changed", {
        locked: false,
        owner: "prompts",
      });
      if (!stopped)
        window.eventBus.emit("generation:complete", {
          message:
            window.I18n?.t?.(
              "notification.browser.generationCompleteProvider",
              { provider: "ChatGPT", completed, failed },
            ) || `ChatGPT completed: ${completed} succeeded, ${failed} failed`,
          prompt: prompts[0] || "",
          resultCount: completed,
          failedCount: failed,
        });
    }
    return { completed, failed, stopped, urls: allUrls, failedPrompts };
  }
  static async _downloadMuseImages({
    result,
    prompt: prompt2,
    downloadStartIndex,
    downloadSettings,
    downloadSubFolder,
    waitForComplete = false,
  }) {
    const images = Array.isArray(result?.fetchedMedia)
      ? result.fetchedMedia
      : [];
    const expectedCount = Array.isArray(result?.mediaUrls)
      ? result.mediaUrls.length
      : 0;
    if (!expectedCount)
      return { success: false, error: "MUSE_IMAGE_RESULT_UNAVAILABLE" };
    const project =
      downloadSettings.project || window._currentProjectName || "flow";
    for (let mediaIndex = 0; mediaIndex < expectedCount; mediaIndex++) {
      const url = result.mediaUrls[mediaIndex];
      const dataUrl = images.find((item) => item.url === url)?.base64;
      const filename = window.DownloadHelper.buildFilename({
        template: downloadSettings.template,
        project,
        prompt: prompt2,
        index: downloadStartIndex + mediaIndex,
        taskName: downloadSubFolder || null,
        folder: downloadSettings.folder,
        ext: "jpg",
      });
      const response = await window.MessageBridge?.museDownloadImageResult?.({
        tabId: result.tabId,
        url,
        base64: dataUrl,
        filename,
        waitForComplete,
      });
      if (!response?.success)
        return {
          success: false,
          error: response?.error || "MUSE_DOWNLOAD_FAILED",
        };
    }
    return { success: true };
  }
  static async _downloadMuseVideos({
    result,
    prompt: prompt2,
    downloadStartIndex,
    downloadSettings,
    downloadSubFolder,
    waitForComplete = false,
  }) {
    const videos = Array.isArray(result?.mediaUrls) ? result.mediaUrls : [];
    if (!videos.length || !Number.isInteger(result?.tabId))
      return { success: false, error: "MUSE_VIDEO_CONTEXT_UNAVAILABLE" };
    const project =
      downloadSettings.project || window._currentProjectName || "flow";
    for (let mediaIndex = 0; mediaIndex < videos.length; mediaIndex++) {
      const url = String(videos[mediaIndex] || "");
      const filename = window.DownloadHelper.buildFilename({
        template: downloadSettings.template,
        project,
        prompt: prompt2,
        index: downloadStartIndex + mediaIndex,
        taskName: downloadSubFolder || null,
        folder: downloadSettings.folder,
        ext: "mp4",
      });
      const response = await window.MessageBridge?.museDownloadNative?.(
        result.tabId,
        filename,
        url,
        waitForComplete ? 6e5 : 12e4,
      );
      if (!response?.success)
        return {
          success: false,
          error: response?.error || "MUSE_VIDEO_DOWNLOAD_FAILED",
        };
    }
    return { success: true };
  }
  static stopProviderGeneration({ requestedAt = Date.now() } = {}) {
    if (!Number.isFinite(requestedAt) || requestedAt <= 0)
      requestedAt = Date.now();
    if (_GenTab._lastProviderStopAt >= requestedAt) return Promise.resolve();
    _GenTab._lastProviderStopAt = requestedAt;
    _GenTab._providerStopRequested = true;
    _GenTab._grokStopRequested = true;
    _GenTab._chatgptStopRequested = true;
    _GenTab._geminiStopRequested = true;
    _GenTab._localUploadController?.abort();
    const aborts = [];
    for (const [session, method] of [
      [window.GrokSession, "grokAbort"],
      [window.ChatGPTSession, "chatgptAbort"],
      [window.GeminiSession, "geminiAbort"],
    ]) {
      if (!session || !window.MessageBridge?.[method]) continue;
      const send = (info) =>
        info?.tabId
          ? window.MessageBridge[method](info.tabId, { requestedAt })
          : null;
      aborts.push(
        Promise.resolve().then(() =>
          session._tabId
            ? send({ tabId: session._tabId })
            : Promise.resolve(session.getTabInfo?.()).then(send),
        ),
      );
    }
    if (window.MuseSession?.abort)
      aborts.push(
        Promise.resolve().then(() => window.MuseSession.abort({ requestedAt })),
      );
    return Promise.allSettled(aborts);
  }
  static async _submitViaMuse({
    prompts = [],
    mentionPrompts = [],
    fileIds = [],
    settings = {},
  } = {}) {
    const adapter = window.ProviderRegistry?.get?.("muse");
    if (!adapter || adapter.key !== "muse")
      throw new Error(
        "Muse adapter ch\u01B0a \u0111\u01B0\u1EE3c \u0111\u0103ng k\xFD",
      );
    const stored = await chrome.storage.local.get(["af_settings"]);
    const deleteAfterGen =
      stored.af_settings?.museDeleteAfterGen === true &&
      adapter.capabilities?.supportsDeleteAfterGen === true;
    const autoDownload =
      document.getElementById("genTabAutoDownload")?.checked === true &&
      window.featureGate?.canUse?.("auto_download") === true;
    const downloadSettings = autoDownload
      ? await window.DownloadHelper.getSettings()
      : null;
    const downloadSubFolder = autoDownload
      ? (document.getElementById("genTabSubFolder")?.value || "").trim()
      : "";
    let completed = 0;
    let failed = 0;
    const urls = [];
    const failedPrompts = [];
    let nextDownloadIndex = 1;
    const mode = settings.genType === "Video" ? "video" : "image";
    const refMode = ["all", "mention", "sequential", "none"].includes(
      settings.refImageMode,
    )
      ? settings.refImageMode
      : "all";
    const model = settings.model;
    if (!model) throw new Error("MUSE_MODEL_CONFIG_MISSING");
    const maxRefs = adapter.getMaxRefImages?.({ mode, modelValue: model }) ?? 0;
    if (refMode !== "none" && fileIds.length && maxRefs <= 0)
      throw new Error("MUSE_REF_CONFIG_UNAVAILABLE");
    const ids =
      refMode === "none"
        ? []
        : refMode === "all"
          ? fileIds.slice(0, maxRefs)
          : fileIds;
    if (ids.length && !window.featureGate?.canUseProviderRefImages?.("muse")) {
      throw new Error("MUSE_REF_IMAGES_NOT_ALLOWED");
    }
    const refs = [];
    for (const fileId of ids) {
      const pending = window.pendingUploadFiles?.get?.(fileId)?.file;
      const name = _GenTab.fileNameCache?.[fileId] || `${fileId}.png`;
      const mentionName = _GenTab.refImageNames?.[fileId] || "";
      if (pending) {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(pending);
        });
        refs.push({
          base64: String(dataUrl).replace(/^data:[^,]+,/, ""),
          name,
          mentionName,
          type: pending.type || "image/png",
          _fileId: fileId,
        });
        continue;
      }
      const thumbnail = _GenTab.thumbnailCache?.[fileId];
      if (!thumbnail) throw new Error(`MUSE_REF_NOT_RESOLVED:${fileId}`);
      const fetched =
        await _GenTab._resolveCrossProviderRefThumbnail(thumbnail);
      if (!fetched?.success || !fetched.base64)
        throw new Error(`MUSE_REF_FETCH_FAILED:${fileId}`);
      const match = String(fetched.base64).match(/^data:(.+?);base64,(.+)$/);
      refs.push({
        base64: match ? match[2] : fetched.base64,
        name,
        mentionName,
        type: match ? match[1] : "image/png",
        _fileId: fileId,
      });
    }
    const states = prompts.map(() => "PENDING");
    const trackerResults = prompts.map(() => []);
    const startedAt = Date.now();
    const tracker = (running) =>
      _GenTab._broadcastChatTracker(
        "muse",
        _GenTab._buildChatTrackerData(
          "Muse Gen",
          prompts,
          states,
          startedAt,
          running,
          trackerResults,
        ),
      );
    if (window.eventBus) {
      window.eventBus.emit("execution:lock_changed", {
        locked: true,
        owner: "prompts",
        label: "Muse Gen",
      });
      window.eventBus.emit("execution:tracker_update", {
        owner: "prompts",
        label: "Muse Gen",
        phase: "started",
        current: 0,
        total: prompts.length,
        promptText: prompts[0] || "",
        provider: "muse",
      });
    }
    await tracker(true);
    for (let index = 0; index < prompts.length; index++) {
      if (_GenTab._providerStopRequested) break;
      const prompt2 = prompts[index];
      states[index] = "SUBMITTING";
      await tracker(true);
      window.eventBus?.emit?.("execution:tracker_update", {
        owner: "prompts",
        label: "Muse Gen",
        phase: "prompt_submitting",
        current: index + 1,
        total: prompts.length,
        promptText: prompt2,
        provider: "muse",
      });
      let promptRefs = refs;
      if (refMode === "sequential")
        promptRefs = window.RefImageAssignment.select(
          refs,
          index,
          settings.refImagesPerPrompt,
        );
      else if (refMode === "mention") {
        const mentions = new Set(
          (
            String(mentionPrompts[index] || prompt2).match(
              /@(\[[^\]]+\]|[\p{L}\p{N}_]+)/gu,
            ) || []
          ).map((value) =>
            value
              .slice(1)
              .replace(/^\[|\]$/g, "")
              .toLowerCase(),
          ),
        );
        promptRefs = refs.filter((ref) =>
          [
            ref.mentionName,
            ref.name,
            String(ref.name).replace(/\.[^.]+$/, ""),
          ].some((name) => name && mentions.has(String(name).toLowerCase())),
        );
      }
      if (promptRefs.length > maxRefs) {
        failed++;
        states[index] = "FAILED";
        await tracker(true);
        failedPrompts.push({
          index,
          prompt: prompt2,
          error: `MUSE_REF_LIMIT_EXCEEDED:${promptRefs.length}/${maxRefs}`,
        });
        continue;
      }
      let result;
      try {
        result = await _GenTab._submitWithLocalRefProgress(adapter, "muse", {
          prompt: prompt2,
          refs: promptRefs,
          settings: {
            mode,
            ratio: settings.ratio,
            model,
            autoDownload:
              document.getElementById("genTabAutoDownload")?.checked === true,
          },
          shouldStop: () => _GenTab._providerStopRequested === true,
        });
      } catch (error) {
        if (_GenTab._providerStopRequested) {
          states[index] = "CANCELLED";
          break;
        }
        failed++;
        states[index] = "FAILED";
        await tracker(true);
        failedPrompts.push({
          index,
          prompt: prompt2,
          error: error?.message || "MUSE_GENERATION_FAILED",
        });
        console.warn("[GenTab] Muse submit failed:", error?.message || error);
        continue;
      }
      if (!result?.success || !result.mediaUrls?.length) {
        if (_GenTab._providerStopRequested) {
          states[index] = "CANCELLED";
          break;
        }
        failed++;
        states[index] = "FAILED";
        await tracker(true);
        const error = result?.error || "MUSE_GENERATION_FAILED";
        const providerMessage =
          typeof result?.message === "string" ? result.message.trim() : "";
        failedPrompts.push({
          index,
          prompt: prompt2,
          error: providerMessage || error,
        });
        console.warn("[GenTab] Muse submit rejected:", {
          error,
          providerMessage,
          diagnostic: result?.diagnostic || null,
        });
        continue;
      }
      const mediaType = result.mediaType || mode;
      const downloadStartIndex = nextDownloadIndex;
      nextDownloadIndex += result.mediaUrls.length;
      const materializedUrls = result.mediaUrls.map(
        (url) =>
          result.fetchedMedia?.find((item) => item.url === url)?.base64 || url,
      );
      if (!deleteAfterGen) {
        trackerResults[index] = result.mediaUrls
          .map((url) => {
            const fetched = result.fetchedMedia?.find(
              (item) => item.url === url,
            );
            const thumbnail =
              mediaType === "video" ? fetched?.poster : fetched?.base64 || url;
            return { url, thumbnail, video: mediaType === "video" };
          })
          .filter((item) => item.url || item.thumbnail);
      }
      completed++;
      states[index] = "COMPLETED";
      await tracker(true);
      urls.push(...materializedUrls);
      const historyRefIds = [
        ...new Set(promptRefs.map((ref) => ref._fileId).filter(Boolean)),
      ];
      const historyRefThumbnails = Object.fromEntries(
        Object.entries(_GenTab._historyRefThumbnails(historyRefIds)).filter(
          ([, entry]) => {
            const url = typeof entry === "string" ? entry : entry?.thumbnail;
            return (
              typeof url === "string" &&
              url.length <= 4096 &&
              (/^https:\/\/[^/]+(?:\/|$)/i.test(url) ||
                /^\/(?!\/)[^\x00-\x1F]*$/.test(url))
            );
          },
        ),
      );
      window.eventBus?.emit("prompt:completed", {
        prompt: prompt2,
        media_type: mediaType,
        model,
        ratio: settings.ratio,
        prompt_count: 1,
        quantity: materializedUrls.length,
        ref_file_ids: historyRefIds.join(", "),
        ref_thumbnails: historyRefThumbnails,
        result_file_ids: "",
        result_thumbnails: materializedUrls.map((thumbnail) => ({
          thumbnail,
          type: mediaType,
          file_name: "",
        })),
        result_file_names: {},
        source: "gen",
        provider: "muse",
        auto_download: autoDownload,
        project_id: window._currentProjectId || null,
      });
      let downloadsOk = true;
      if (autoDownload) {
        states[index] = "DOWNLOADING";
        await tracker(true);
        try {
          const downloaded =
            mediaType === "video"
              ? await _GenTab._downloadMuseVideos({
                  result,
                  prompt: prompt2,
                  downloadStartIndex,
                  downloadSettings,
                  downloadSubFolder,
                  waitForComplete: deleteAfterGen,
                })
              : await _GenTab._downloadMuseImages({
                  result,
                  prompt: prompt2,
                  downloadStartIndex,
                  downloadSettings,
                  downloadSubFolder,
                  waitForComplete: deleteAfterGen,
                });
          downloadsOk = downloaded.success === true;
          if (!downloadsOk)
            console.warn(
              "[GenTab] Muse auto-download failed:",
              downloaded.error || "unknown",
            );
        } catch (error) {
          downloadsOk = false;
          console.warn(
            "[GenTab] Muse auto-download error:",
            error?.message || error,
          );
        }
        states[index] = "COMPLETED";
        await tracker(true);
      }
      if (
        deleteAfterGen &&
        autoDownload &&
        downloadsOk &&
        !_GenTab._providerStopRequested
      ) {
        const deleted = await window.MuseSession?.deleteCurrentConversation?.();
        if (!deleted?.success)
          console.warn(
            "[GenTab] Muse cleanup failed:",
            deleted?.error || "unknown",
          );
      }
    }
    if (_GenTab._providerStopRequested)
      states.forEach((state, index) => {
        if (state === "PENDING" || state === "SUBMITTING")
          states[index] = "CANCELLED";
      });
    await tracker(false);
    if (window.eventBus) {
      window.eventBus.emit("execution:tracker_update", {
        owner: "prompts",
        phase: _GenTab._providerStopRequested ? "stopped" : "completed",
        current: prompts.length,
        total: prompts.length,
        provider: "muse",
      });
      window.eventBus.emit("execution:lock_changed", {
        locked: false,
        owner: "prompts",
      });
    }
    return {
      completed,
      failed,
      stopped: !!_GenTab._providerStopRequested,
      urls,
      failedPrompts,
    };
  }
  static async _submitViaGrok(params) {
    const prompts = params.prompts || [];
    const fileIds = params.fileIds || [];
    const settings = params.settings || {};
    const settingsObj = params.settingsObj || {};
    if (!window.ProviderRegistry) {
      throw new Error("ProviderRegistry ch\u01B0a s\u1EB5n s\xE0ng");
    }
    const adapter = ProviderRegistry.get("grok");
    if (!adapter) {
      throw new Error(
        "Grok adapter ch\u01B0a \u0111\u01B0\u1EE3c \u0111\u0103ng k\xFD",
      );
    }
    try {
      const ready = await adapter.ensureReady();
      if (!ready?.ready) {
        if (window.eventBus) {
          window.eventBus.emit("grok:login_required", {
            error: ready?.error || "NOT_LOGGED_IN",
          });
        }
        sendLog(
          `Grok: ${ready?.error || "kh\xF4ng s\u1EB5n s\xE0ng"}`,
          "error",
        );
        return {
          completed: 0,
          failed: prompts.length,
          stopped: false,
          urls: [],
        };
      }
    } catch (err) {
      console.error("[GenTab] Grok ensureReady failed:", err);
      if (window.eventBus) {
        window.eventBus.emit("grok:login_required", { error: err?.message });
      }
      return { completed: 0, failed: prompts.length, stopped: false, urls: [] };
    }
    const isFrames =
      settings.genType === "Video" && settings.videoInputType === "Frames";
    if (
      isFrames &&
      document.getElementById("grokFramesSection")?._grokFrameBusy
    )
      throw Object.assign(new Error("REF_UPLOAD_IN_PROGRESS"), {
        code: "REF_UPLOAD_IN_PROGRESS",
      });
    const framePairs =
      isFrames && settings.frames
        ? adapter.framePairs(settings.frames, prompts.length)
        : null;
    if (framePairs)
      for (const pair of framePairs) adapter.validateFrameSlots(pair);
    const frameFileIds = framePairs
      ? [
          ...new Set(
            framePairs.flatMap((pair) =>
              pair.ref_file_ids.split(",").filter(Boolean),
            ),
          ),
        ]
      : fileIds;
    const maxRef = adapter.getMaxRefImages({
      mode: settings.genType === "Video" ? "video" : "image",
      isFrames,
      modelValue: settings.model,
    });
    const isMentionMode = !isFrames && _GenTab.refImageMode === "mention";
    const isSequentialMode = !isFrames && _GenTab.refImageMode === "sequential";
    const isNoneMode = !isFrames && _GenTab.refImageMode === "none";
    const fileIdsToResolve = isNoneMode
      ? []
      : isMentionMode || isSequentialMode
        ? fileIds
        : isFrames
          ? frameFileIds
          : fileIds.slice(0, maxRef);
    if (
      !isFrames &&
      !isMentionMode &&
      !isSequentialMode &&
      !isNoneMode &&
      fileIds.length > maxRef
    ) {
      sendLog(
        `Grok: v\u01B0\u1EE3t gi\u1EDBi h\u1EA1n ${maxRef} \u1EA3nh ref \u2014 ch\u1EC9 g\u1EEDi ${maxRef} \u1EA3nh \u0111\u1EA7u`,
        "warn",
      );
    }
    const refImagesResolved = [];
    const fidByResolvedIndex = [];
    for (const fid of fileIdsToResolve) {
      if (!fid) continue;
      const fileName =
        settings.frames?.ref_file_names?.[fid] ||
        _GenTab.fileNameCache?.[fid] ||
        `${fid}.png`;
      if (fid.startsWith("upload_") && window.pendingUploadFiles?.has(fid)) {
        const pendingData = window.pendingUploadFiles.get(fid);
        const file = pendingData?.file;
        if (file) {
          try {
            const base64 = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = reader.result;
                const base64Part = dataUrl.split(",")[1];
                resolve(base64Part);
              };
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(file);
            });
            refImagesResolved.push({
              base64,
              name: fileName,
              type: file.type || "image/png",
              _fileId: fid,
            });
            fidByResolvedIndex.push(fid);
            console.log(
              "[GenTab] Grok: resolved ref t\u1EEB pendingUploadFiles:",
              fid,
            );
            continue;
          } catch (err) {
            console.warn(
              "[GenTab] Grok: l\u1ED7i convert pending file \u2192 base64:",
              fid,
              err.message,
            );
          }
        }
      }
      const frameRecord = settings.frames?.ref_thumbnails?.[fid];
      const thumb =
        (typeof frameRecord === "string"
          ? frameRecord
          : frameRecord?.source_thumbnail || frameRecord?.thumbnail) ||
        _GenTab.thumbnailCache?.[fid];
      if (!thumb) {
        console.warn(
          "[GenTab] Grok: skip ref ID kh\xF4ng c\xF3 thumbnail:",
          fid,
        );
        continue;
      }
      try {
        const fetchResp =
          await _GenTab._resolveCrossProviderRefThumbnail(thumb);
        if (fetchResp?.success && fetchResp.base64) {
          const m = fetchResp.base64.match(/^data:(.+?);base64,(.+)$/);
          if (m) {
            refImagesResolved.push({
              base64: m[2],
              name: fileName,
              type: m[1],
              _fileId: fid,
            });
          } else {
            refImagesResolved.push({
              base64: fetchResp.base64,
              name: fileName,
              type: "image/png",
              _fileId: fid,
            });
          }
          fidByResolvedIndex.push(fid);
        } else {
          console.warn(
            "[GenTab] Grok: fetch ref blob th\u1EA5t b\u1EA1i:",
            "fid=",
            fid,
            "urlKind=",
            String(thumb).split(":", 1)[0] || "unknown",
            "urlLength=",
            String(thumb).length,
            "error=",
            fetchResp?.error,
          );
        }
      } catch (err) {
        console.warn(
          "[GenTab] Grok: l\u1ED7i fetch ref blob:",
          fid,
          err.message,
        );
      }
    }
    if (
      fileIdsToResolve.length > 0 &&
      refImagesResolved.length < fileIdsToResolve.length
    ) {
      sendLog(
        `Grok: ${refImagesResolved.length}/${fileIdsToResolve.length} ref s\u1EB5n s\xE0ng; ${refImagesResolved.length > 0 ? "ti\u1EBFp t\u1EE5c v\u1EDBi \u1EA3nh \u0111\xE3 t\u1EA3i \u0111\u01B0\u1EE3c" : "kh\xF4ng g\u1EEDi prompt thi\u1EBFu to\xE0n b\u1ED9 ref"}`,
        "warn",
      );
    }
    let mentionNameToFid = null;
    if (isMentionMode) {
      mentionNameToFid = {};
      for (const fid of fileIdsToResolve) {
        const slug = _GenTab.refImageNames?.[fid];
        if (slug) mentionNameToFid[String(slug).toLowerCase()] = fid;
      }
    }
    const grokRatio =
      settings.ratio || settingsObj.grokDefaultRatio || "widescreen";
    const grokQuantity = settings.quantity || 1;
    const grokMode = settings.genType
      ? settings.genType === "Video"
        ? "video"
        : "image"
      : settingsObj.grokDefaultMode || "image";
    const grokDurationFormEl = document.getElementById("grokDuration");
    const grokResolutionFormEl = document.getElementById("grokResolution");
    const grokDuration =
      grokDurationFormEl?.value || settingsObj.grokDefaultDuration || "6s";
    const grokResolution =
      grokResolutionFormEl?.value ||
      settingsObj.grokDefaultResolution ||
      "720p";
    const grokImageQualityFormEl = document.getElementById("grokImageQuality");
    const grokImageQuality =
      grokImageQualityFormEl?.value ||
      settingsObj.grokDefaultImageQuality ||
      "speed";
    const delayBetweenMs =
      (window.ExecutionConfig?.safeGetDelayBetweenPromptsSec?.() ?? 5) * 1e3;
    const autoCloseTab = !!settingsObj.grokAutoClose;
    const autoDownloadToggle = document.getElementById("genTabAutoDownload");
    const autoDownloadEnabled =
      !!autoDownloadToggle?.checked &&
      !!window.featureGate?.canUse?.("auto_download");
    const downloadSubFolder = (
      document.getElementById("genTabSubFolder")?.value || ""
    ).trim();
    const downloadTemplate =
      settingsObj.fileNameTemplate || "[Date]_[Project]_[Prompt]_[Index]";
    const projectName = window._currentProjectName || "flow";
    let completed = 0;
    let failed = 0;
    let stopped = false;
    const allUrls = [];
    const failedPrompts = [];
    let nextDownloadIndex = 1;
    if (window.eventBus) {
      window.eventBus.emit("execution:lock_changed", {
        locked: true,
        owner: "prompts",
        label: "Grok Gen",
      });
      window.eventBus.emit("execution:tracker_update", {
        owner: "prompts",
        label: "Grok Gen",
        phase: "started",
        current: 0,
        total: prompts.length,
        promptText: prompts[0] || "",
      });
    }
    const _trkStates = prompts.map(() => "PENDING");
    const _trkResults = prompts.map(() => []);
    const _trkStart = Date.now();
    const _trk = (running) =>
      _GenTab._broadcastChatTracker(
        "grok",
        _GenTab._buildChatTrackerData(
          "Grok Gen",
          prompts,
          _trkStates,
          _trkStart,
          running,
          _trkResults,
        ),
      );
    await _trk(true);
    for (let i = 0; i < prompts.length; i++) {
      if (_GenTab._grokStopRequested) {
        stopped = true;
        break;
      }
      const prompt2 = prompts[i];
      if (window.eventBus) {
        window.eventBus.emit("execution:tracker_update", {
          owner: "prompts",
          phase: "prompt_submitting",
          current: i + 1,
          total: prompts.length,
          promptText: prompt2,
        });
      }
      _trkStates[i] = "SUBMITTING";
      await _trk(true);
      sendLog(
        `Grok ${i + 1}/${prompts.length}: ${prompt2.substring(0, 50)}...`,
        "info",
      );
      let refsForThisPrompt = refImagesResolved;
      let missingRequiredRef =
        fileIdsToResolve.length > 0 &&
        (isFrames && !isMentionMode && !isSequentialMode
          ? refImagesResolved.length !== fileIdsToResolve.length
          : refImagesResolved.length === 0);
      if (framePairs) {
        const pairIds = framePairs[i].ref_file_ids.split(",").filter(Boolean);
        missingRequiredRef = pairIds.some(
          (id) => !fidByResolvedIndex.includes(id),
        );
        refsForThisPrompt = pairIds
          .map((id) => refImagesResolved[fidByResolvedIndex.indexOf(id)])
          .filter(Boolean);
      } else if (isMentionMode && mentionNameToFid) {
        const mentions = prompt2.match(/@(\[[^\]]+\]|[\p{L}\p{N}_]+)/gu) || [];
        const matchedFids = new Set();
        for (const m of mentions) {
          const name = m
            .substring(1)
            .replace(/^\[|\]$/g, "")
            .trim()
            .toLowerCase();
          const fid = mentionNameToFid[name];
          if (fid) matchedFids.add(fid);
        }
        missingRequiredRef ||
          (missingRequiredRef = [...matchedFids].some(
            (fid) => !fidByResolvedIndex.includes(fid),
          ));
        refsForThisPrompt = refImagesResolved.filter((_, idx) =>
          matchedFids.has(fidByResolvedIndex[idx]),
        );
        if (!isFrames && refsForThisPrompt.length > maxRef) {
          sendLog(
            `Grok prompt ${i + 1}: ${refsForThisPrompt.length} mention v\u01B0\u1EE3t cap ${maxRef} \u2014 ch\u1EC9 g\u1EEDi ${maxRef} \u0111\u1EA7u`,
            "warn",
          );
          refsForThisPrompt = refsForThisPrompt.slice(0, maxRef);
        }
      } else if (isSequentialMode && fileIdsToResolve.length > 0) {
        const group = window.RefImageAssignment.select(
          fileIdsToResolve,
          i,
          _GenTab.refImagesPerPrompt,
        );
        missingRequiredRef ||
          (missingRequiredRef = group.some(
            (id) => !fidByResolvedIndex.includes(id),
          ));
        refsForThisPrompt = group
          .map((id) => refImagesResolved[fidByResolvedIndex.indexOf(id)])
          .filter(Boolean);
      }
      const promptStartedAt = Date.now();
      let historyRecorded = false;
      try {
        if (missingRequiredRef) {
          throw Object.assign(new Error("GROK_REQUIRED_REF_MISSING"), {
            code: "REF_UPLOAD_FAILED",
          });
        }
        const result = await _GenTab._submitWithLocalRefProgress(
          adapter,
          "grok",
          {
            prompt: prompt2,
            refFileIds: refsForThisPrompt,
            shouldStop: () => _GenTab._grokStopRequested === true,
            settings: {
              mode: grokMode,
              model: settings.model,
              videoInputType: settings.videoInputType,
              ratio: grokRatio,
              duration: grokDuration,
              resolution: grokResolution,
              imageQuality: grokImageQuality,
              timeout: window.SystemConfig?.getTimeout(
                grokMode === "video" ? "video_timeout_ms" : "image_timeout_ms",
              ),
            },
            taskName: null,
          },
        );
        if (_GenTab._grokStopRequested && !result?.success) {
          stopped = true;
          _trkStates[i] = "CANCELLED";
          break;
        }
        if (
          result?.success &&
          Array.isArray(result.mediaUrls) &&
          result.mediaUrls.length > 0
        ) {
          completed += 1;
          sendLog(`Grok prompt ${i + 1}/${prompts.length} \u2713`, "success");
          allUrls.push(...result.mediaUrls);
          const downloadStartIndex = nextDownloadIndex;
          nextDownloadIndex += result.mediaUrls.length;
          _trkResults[i] = result.mediaUrls.map((url, urlIdx) => ({
            url,
            thumbnail: result.mediaPosters?.[urlIdx] || url,
            video: result.mediaType === "video" || grokMode === "video",
          }));
          _trkStates[i] = "COMPLETED";
          await _trk(true);
          if (autoDownloadEnabled) {
            for (let urlIdx = 0; urlIdx < result.mediaUrls.length; urlIdx++) {
              const url = result.mediaUrls[urlIdx];
              try {
                const ext =
                  result.mediaType === "video" || grokMode === "video"
                    ? "mp4"
                    : "png";
                let filename = _GenTab._buildChatGPTFilename(
                  downloadTemplate,
                  projectName,
                  prompt2,
                  i + 1,
                  urlIdx + 1,
                  downloadSubFolder,
                  null,
                  settingsObj.downloadFolder,
                  downloadStartIndex + urlIdx,
                );
                if (ext !== "png") {
                  filename = filename.replace(/\.png$/i, `.${ext}`);
                }
                const _pre =
                  result.fetchedMedia?.find((f) => f.url === url)?.base64 ||
                  null;
                const dl = (await window.MessageBridge?.grokDownloadMedia?.(
                  url,
                  result.tabId,
                  filename,
                  _pre,
                  { nativeFirst: result.mediaUrls.length === 1 },
                )) || {
                  success: false,
                  tier: 0,
                  error: "MessageBridge unavailable",
                };
                if (!dl.success) {
                  sendLog(
                    `Grok download fail (Tier ${dl.tier}): ${dl.error || "unknown"}`,
                    "warn",
                  );
                } else if (dl.tier === 0)
                  sendLog("Grok native Download completed", "success");
                else if (dl.tier === 3)
                  sendLog("Grok download OK (Tier 3 direct URL)", "success");
              } catch (dlErr) {
                console.warn("[GenTab] Grok auto-download error:", dlErr);
              }
            }
          }
          if (window.eventBus) {
            window.eventBus.emit("prompt:completed", {
              prompt: prompt2,
              media_type:
                result.mediaType === "video" || grokMode === "video"
                  ? "video"
                  : "image",
              model: "grok",
              ratio: grokRatio,
              prompt_count: 1,
              quantity: result.mediaUrls?.length || 1,
              ref_file_ids: fileIds.join(", "),
              result_file_ids: "",
              result_thumbnails: result.mediaUrls.map((u) => ({
                thumbnail: u,
                type:
                  result.mediaType === "video" || grokMode === "video"
                    ? "video"
                    : "image",
                file_name: "",
              })),
              result_file_names: {},
              source: "gen",
              provider: "grok",
              project_id: window._currentProjectId || null,
              auto_download: !!autoDownloadEnabled,
              duration_ms: Math.max(0, Date.now() - promptStartedAt),
            });
            historyRecorded = true;
          }
        } else {
          failed += 1;
          _trkStates[i] = "FAILED";
          await _trk(true);
          const errCode = result?.error || "UNKNOWN";
          sendLog(
            `Grok prompt ${i + 1}: ${errCode} - ${result?.message || "failed"}`,
            "error",
          );
          failedPrompts.push({ index: i, prompt: prompt2, error: errCode });
          if (
            [
              "RATE_LIMIT",
              "CONTENT_BLOCKED",
              "IMAGE_GEN_FAILED",
              "TEXT_ONLY",
              "NETWORK",
              "TIMEOUT",
              "SUBSCRIPTION_REQUIRED",
              "CHALLENGE_TIMEOUT",
            ].includes(errCode)
          ) {
            _GenTab._showProviderErrorNotification(
              "grok",
              errCode,
              result?.message,
            );
          }
          if (errCode === "SUBSCRIPTION_REQUIRED") {
            if (window.eventBus) {
              window.eventBus.emit("grok:subscription_required", {
                error: errCode,
                message: result?.message,
              });
            }
            stopped = true;
            failed += prompts.length - i - 1;
            for (let j = i + 1; j < prompts.length; j++) {
              failedPrompts.push({
                index: j,
                prompt: prompts[j],
                error: "SUBSCRIPTION_REQUIRED",
              });
            }
            break;
          }
          if (errCode === "RATE_LIMIT") {
            sendLog(
              "Grok \u0111\xE3 h\u1EBFt l\u01B0\u1EE3t \u2014 d\u1EEBng c\xE1c prompt c\xF2n l\u1EA1i",
              "error",
            );
            stopped = true;
            failed += prompts.length - i - 1;
            for (let j = i + 1; j < prompts.length; j++) {
              failedPrompts.push({
                index: j,
                prompt: prompts[j],
                error: "RATE_LIMIT",
              });
            }
            break;
          }
        }
      } catch (err) {
        if (_GenTab._grokStopRequested) {
          stopped = true;
          _trkStates[i] = "CANCELLED";
          break;
        }
        failed += 1;
        _trkStates[i] = "FAILED";
        await _trk(true);
        console.error("[GenTab] Grok submit error:", err);
        sendLog(
          `Grok prompt ${i + 1} exception: ${err?.message || err}`,
          "error",
        );
        failedPrompts.push({
          index: i,
          prompt: prompt2,
          error: err?.message || "EXCEPTION",
        });
      } finally {
        if (!historyRecorded && window.eventBus) {
          const userStopped = _trkStates[i] === "CANCELLED";
          const failure = failedPrompts.find((item) => item.index === i);
          window.eventBus.emit("prompt:completed", {
            prompt: prompt2,
            media_type: grokMode,
            model: "grok",
            ratio: grokRatio,
            prompt_count: 1,
            quantity: 1,
            ref_file_ids: fileIds.join(", "),
            result_file_ids: "",
            result_thumbnails: [],
            result_file_names: {},
            source: "gen",
            provider: "grok",
            project_id: window._currentProjectId || null,
            auto_download: !!autoDownloadEnabled,
            status: userStopped ? "stopped" : "failed",
            stop_origin: userStopped ? "user" : null,
            error_reason: userStopped ? null : failure?.error || "UNKNOWN",
            duration_ms: Math.max(0, Date.now() - promptStartedAt),
          });
        }
      }
      if (_GenTab._grokStopRequested) {
        stopped = true;
        break;
      }
      if (i < prompts.length - 1 && delayBetweenMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenMs));
      }
    }
    if (autoCloseTab && window.GrokSession) {
      try {
        await window.GrokSession.closeTab();
      } catch (err) {
        console.warn("[GenTab] Grok closeTab failed:", err);
      }
    }
    if (stopped) {
      for (let k = 0; k < _trkStates.length; k++)
        if (_trkStates[k] === "PENDING") _trkStates[k] = "CANCELLED";
    }
    await _trk(false);
    if (window.eventBus) {
      window.eventBus.emit("execution:tracker_update", {
        owner: "prompts",
        phase: stopped ? "stopped" : "completed",
        current: prompts.length,
        total: prompts.length,
      });
      window.eventBus.emit("execution:lock_changed", {
        locked: false,
        owner: "prompts",
      });
      if (!stopped)
        window.eventBus.emit("generation:complete", {
          message:
            window.I18n?.t?.(
              "notification.browser.generationCompleteProvider",
              { provider: "Grok", completed, failed },
            ) || `Grok completed: ${completed} succeeded, ${failed} failed`,
          prompt: prompts[0] || "",
          resultCount: completed,
          failedCount: failed,
        });
    }
    return { completed, failed, stopped, urls: allUrls, failedPrompts };
  }
  static _destroyThumbObserver() {
    if (_GenTab._thumbObserver) {
      _GenTab._thumbObserver.disconnect();
      _GenTab._thumbObserver = null;
    }
  }
  static checkMissingThumbnails() {
    if (!_GenTab.fileIdThumbnails) return;
    const missingThumbs = _GenTab.fileIdThumbnails.querySelectorAll(
      "div[data-missing-id]",
    );
    if (missingThumbs.length === 0) return;
    let needSave = false;
    missingThumbs.forEach((container) => {
      const id = container.getAttribute("data-missing-id");
      const tileNode = document.querySelector(`div[data-tile-id="${id}"]`);
      if (tileNode) {
        let thumbSrc = "";
        const imgEl = tileNode.querySelector("img");
        thumbSrc = imgEl ? imgEl.src : "";
        if (!thumbSrc) {
          const vidEl = tileNode.querySelector("video");
          if (vidEl) thumbSrc = vidEl.poster || "";
        }
        if (thumbSrc) {
          _GenTab.thumbnailCache[id] = thumbSrc;
          needSave = true;
        }
      }
    });
    if (needSave) {
      _GenTab.saveState();
      _GenTab.renderFileIdThumbnails();
    }
  }
  static _recordPreSubmitDenial(prompt2, promptCount, provider, gate = {}) {
    const code = String(gate.reason || "EXECUTION_DENIED").toUpperCase();
    if (
      ![
        "BATCH_LIMIT_EXCEEDED",
        "QUOTA_EXCEEDED",
        "GLOBAL_QUOTA_EXCEEDED",
        "PROVIDER_QUOTA_EXCEEDED",
      ].includes(code)
    ) {
      return;
    }
    const isGlobal = code === "GLOBAL_QUOTA_EXCEEDED";
    const limit = isGlobal ? gate.global_limit : gate.limit;
    const used = isGlobal ? gate.global_used : gate.used;
    const remaining = isGlobal ? gate.global_remaining : gate.remaining;
    const planSlug =
      gate.plan_slug || window.featureGate?.getPlan?.()?.slug || null;
    const quotaKey = gate.quota_key || (isGlobal ? "prompt_submit_max" : null);
    const mediaType =
      _GenTab.genTypeSelect?.value === "Video" ? "video" : "image";
    const model =
      provider === "chatgpt"
        ? _GenTab.chatgptModelSelect?.value
        : provider === "gemini"
          ? _GenTab.geminiModelSelect?.value
          : mediaType === "video"
            ? _GenTab.videoModelSelect?.value
            : _GenTab.imageModelSelect?.value;
    const detail = {
      code,
      planSlug,
      quotaKey,
      limit: Number.isInteger(limit) ? limit : null,
      used: Number.isInteger(used) ? used : null,
      remaining: Number.isInteger(remaining) ? remaining : null,
      requestedCount: Math.max(1, Number(promptCount) || 1),
      dispatchStage: "pre_submit",
      provider,
    };
    console.warn("[GenTab] Generation blocked before provider submit", detail);
    window.eventBus?.emit?.("prompt:completed", {
      prompt: prompt2,
      media_type: mediaType,
      model: model || "",
      ratio: _GenTab.aspectRatioSelect?.value || "",
      prompt_count: detail.requestedCount,
      quantity: parseInt(_GenTab.quantitySelect?.value, 10) || 1,
      source: "gen",
      submit_mode: "auto",
      provider,
      gen_mode: null,
      status: "failed",
      duration_ms: 0,
      error_reason: code,
      error_details: [detail],
      project_id: window._currentProjectId || null,
      auto_download: !!document.getElementById("genTabAutoDownload")?.checked,
    });
  }
  static _resetRunningControls() {
    if (_GenTab.startBtn) {
      _GenTab.startBtn.disabled = false;
    }
    if (_GenTab.genBtnRow) {
      _GenTab.genBtnRow.classList.toggle(
        "is-running",
        !!_GenTab._providerSubmitRunning,
      );
    }
    if (_GenTab.genRunningControls) {
      _GenTab.genRunningControls.classList.add("hidden");
    }
    _GenTab._updateGenBtnUploadState();
  }
  static _updateGenBtnUploadState() {
    if (!_GenTab.startBtn) return;
    const hasUploading =
      window.ImmediateUploader?.hasAnyUploading?.() ||
      false ||
      (_GenTab.providerSelect?.value === "grok" &&
        document.getElementById("grokFramesSection")?._grokFrameBusy === true);
    const isProviderRunning = !!_GenTab._providerSubmitRunning;
    const btnLabelSpan = _GenTab.startBtn.querySelector("span");
    if (hasUploading || isProviderRunning) {
      _GenTab.startBtn.disabled = true;
      _GenTab.startBtn.title = isProviderRunning
        ? window.I18n?.t("gen.generating") || "Generating..."
        : window.I18n?.t("gen.uploadingRefTitle") || "Uploading ref images...";
      if (hasUploading && btnLabelSpan && !isProviderRunning) {
        if (!_GenTab._savedBtnLabel) {
          _GenTab._savedBtnLabel = btnLabelSpan.textContent;
        }
        btnLabelSpan.textContent =
          window.I18n?.t("gen.uploadingImages") || "Uploading...";
      }
    } else {
      const isLocked = window.ExecutionLock?.isBlockedBy?.("prompts");
      if (!isLocked) {
        _GenTab.startBtn.disabled = false;
        _GenTab.startBtn.title = "";
      }
      if (btnLabelSpan && _GenTab._savedBtnLabel) {
        btnLabelSpan.textContent = _GenTab._savedBtnLabel;
        _GenTab._savedBtnLabel = null;
      }
    }
    _GenTab._updateUploadBtnState(hasUploading);
  }
  static _updateUploadBtnState(isUploading) {
    const uploadBtn = document.getElementById("openImagePickerBtn");
    if (!uploadBtn) return;
    if (isUploading) {
      uploadBtn.classList.add("uploading");
    } else {
      uploadBtn.classList.remove("uploading");
    }
  }
  static _showFailedPrompts(failedList) {
    const section = document.getElementById("failedPromptsSection");
    const list = document.getElementById("failedPromptsList");
    const countEl = document.getElementById("failedPromptsCount");
    if (!section || !list) return;
    _GenTab._failedPromptsList = failedList;
    section.classList.remove("hidden");
    if (countEl) countEl.textContent = failedList.length;
    list.innerHTML = failedList
      .map(
        (item, i) => `
      <div class="failed-prompt-item">
        <div class="failed-prompt-info">
          <span class="failed-prompt-index">#${item.index + 1}</span>
          <span class="failed-prompt-error">${item.state === "CANCELLED" ? _GenTab._escapeHtml(window.I18n?.t("gen.quotaCancelledPrompt") || "") + " \xB7 " : ""}${_GenTab._escapeHtml(item.error)}</span>
        </div>
        <div class="failed-prompt-text">${_GenTab._escapeHtml(item.prompt)}</div>
        <button class="btn btn-secondary btn-sm failed-prompt-copy" data-prompt="${_GenTab._escapeAttr(item.prompt)}" data-tooltip="Sao ch\xE9p prompt" aria-label="Sao ch\xE9p prompt">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </button>
      </div>
    `,
      )
      .join("");
    list.querySelectorAll(".failed-prompt-copy").forEach((btn) => {
      btn.addEventListener("click", () => {
        const prompt2 = btn.dataset.prompt;
        navigator.clipboard
          .writeText(prompt2)
          .then(() => {
            btn.innerHTML =
              '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            setTimeout(() => {
              btn.innerHTML =
                '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
            }, 1500);
          })
          .catch(() => {});
      });
    });
  }
  static _clearFailedPrompts() {
    const section = document.getElementById("failedPromptsSection");
    const list = document.getElementById("failedPromptsList");
    if (section) section.classList.add("hidden");
    if (list) list.innerHTML = "";
    _GenTab._failedPromptsList = [];
    if (typeof MessageBridge !== "undefined")
      MessageBridge.clearFailedPrompts().catch(() => {});
  }
  static _retryFailedPrompts() {
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    const failedList = _GenTab._failedPromptsList || [];
    if (failedList.length === 0) {
      window.showNotification?.(
        t("gen.noFailedPrompts", "No failed prompts to retry"),
        "info",
      );
      return;
    }
    const _addonContents = [];
    const _sel = _GenTab._getSelectedAddonPrompt();
    if (_sel?.content) _addonContents.push(_sel.content);
    for (const a of _GenTab.addonPrompts || []) {
      if (a?.content && !_addonContents.includes(a.content))
        _addonContents.push(a.content);
    }
    const _stripAddon = (p) => {
      if (typeof p !== "string") return p;
      for (const c of _addonContents) {
        const suffix = `

${c}`;
        if (p.endsWith(suffix)) return p.slice(0, -suffix.length);
      }
      return p;
    };
    const seen = new Set();
    const uniquePrompts = failedList
      .filter((item) => {
        const key = JSON.stringify([item.index, item.prompt]);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((item) => _stripAddon(item.prompt));
    const textarea =
      _GenTab.promptsArea || document.getElementById("promptsArea");
    if (!textarea) {
      console.error("[GenTab] Prompt textarea not found");
      return;
    }
    if (uniquePrompts.length > 1) {
      const multiPromptCheck = document.getElementById("multiPromptCheck");
      if (multiPromptCheck && !multiPromptCheck.checked) {
        multiPromptCheck.checked = true;
        multiPromptCheck.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const multiPromptHint = document.getElementById("multiPromptHint");
      if (multiPromptHint) {
        multiPromptHint.classList.remove("hidden");
      }
    }
    const promptText = uniquePrompts.join("\n\n");
    textarea.value = promptText;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 300) + "px";
    _GenTab._clearFailedPrompts();
    textarea.scrollIntoView({ behavior: "smooth", block: "center" });
    textarea.focus();
    const msg =
      window.I18n?.t("gen.retryableInserted", {
        count: uniquePrompts.length,
      }) || "";
    window.showNotification?.(msg, "success");
  }
  static async _showFailedPromptsSummaryModal(
    failedList,
    totalCount,
    completedCount,
  ) {
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    if (!failedList || failedList.length === 0) return;
    if (!window.customDialog) return;
    const failedCount = failedList.length;
    const uniquePrompts = [...new Set(failedList.map((item) => item.prompt))];
    const cancelledCount = failedList.filter(
      (item) => item.state === "CANCELLED",
    ).length;
    const message =
      cancelledCount > 0
        ? window.I18n?.t("gen.retryableSummary", {
            completed: completedCount,
            total: totalCount,
            failed: failedCount - cancelledCount,
            cancelled: cancelledCount,
          }) || ""
        : t(
            "gen.executionSummary",
            `Ho\xE0n th\xE0nh: ${completedCount}/${totalCount}
Th\u1EA5t b\u1EA1i: ${failedCount} prompt`,
          )
            .replace("${completed}", completedCount)
            .replace("${total}", totalCount)
            .replace("${failed}", failedCount);
    const confirmed = await window.customDialog.confirm(
      message +
        "\n\n" +
        (cancelledCount > 0
          ? window.I18n?.t("gen.retryableQuestion") || ""
          : t(
              "gen.retryFailedQuestion",
              "Would you like to retry the failed prompts?",
            )),
      {
        title: t("gen.executionComplete", "Completed"),
        type: failedCount > 0 ? "warning" : "success",
        confirmText: t("gen.retryFailed", "Retry"),
        cancelText: t("common.close", "Close"),
      },
    );
    if (confirmed) {
      _GenTab._retryFailedPrompts();
    }
  }
  static async _showRetryUpsell(failCount) {
    if (!failCount || failCount <= 0) return;
    const fg = window.featureGate;
    if (!fg) return;
    const canRetry = fg.canUse("retry_on_fail");
    if (canRetry) return;
    const planName = fg.plan?.name || "Free";
    if (!window.customDialog) return;
    const confirmed = await window.customDialog.confirm(
      window.I18n?.t("genNotifyExtra.retryUpsellMsg", {
        count: failCount,
        plan: planName,
      }) ||
        `${failCount} prompt b\u1ECB l\u1ED7i trong l\u1EA7n ch\u1EA1y v\u1EEBa r\u1ED3i.

G\xF3i "${planName}" hi\u1EC7n t\u1EA1i ch\u01B0a bao g\u1ED3m t\xEDnh n\u0103ng Auto Retry.
N\xE2ng c\u1EA5p \u0111\u1EC3 t\u1EF1 \u0111\u1ED9ng th\u1EED l\u1EA1i c\xE1c prompt b\u1ECB l\u1ED7i.`,
      {
        title:
          window.I18n?.t("genNotifyExtra.retryUpsellTitle") || "Auto Retry",
        type: "info",
        confirmText: window.I18n?.t("common.upgrade") || "Upgrade",
        cancelText:
          window.I18n?.t("genNotifyExtra.retryUpsellLater") || "Later",
      },
    );
    if (confirmed) {
      if (window.authManager?.isLoggedIn()) {
        chrome.runtime.sendMessage({ action: "openSettings" });
      } else {
        const loginOverlay = document.getElementById("loginOverlay");
        if (loginOverlay) {
          loginOverlay.classList.remove("hidden");
        } else {
          chrome.runtime.sendMessage({ action: "openSettings" });
        }
      }
    }
  }
  static _escapeAttr(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/</g, "&lt;");
  }
  static _syncUploadKeyToTileId(data) {
    const { key, tile_id, file_name, thumbnail_url } = data;
    if (!key || !tile_id) return;
    if (!window._lastUploadKeyMapping) window._lastUploadKeyMapping = {};
    window._lastUploadKeyMapping[key] = tile_id;
    if (_GenTab.fileIdsInput) {
      const ids = _GenTab.fileIdsInput.value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const idx = ids.indexOf(key);
      if (idx !== -1) {
        ids[idx] = tile_id;
        _GenTab.fileIdsInput.value = ids.join(", ");
      }
    }
    if (_GenTab.thumbnailCache[key]) {
      _GenTab.thumbnailCache[tile_id] = _GenTab.thumbnailCache[key];
      delete _GenTab.thumbnailCache[key];
    }
    if (thumbnail_url) {
      _GenTab.thumbnailCache[tile_id] = thumbnail_url;
    }
    if (file_name) {
      _GenTab.fileNameCache[tile_id] = file_name;
    }
    delete _GenTab.fileNameCache[key];
    if (_GenTab.refImageNames[key]) {
      _GenTab.refImageNames[tile_id] = _GenTab.refImageNames[key];
      delete _GenTab.refImageNames[key];
    }
    if (_GenTab.refMediaTypes?.[key]) {
      _GenTab.refMediaTypes[tile_id] = _GenTab.refMediaTypes[key];
      delete _GenTab.refMediaTypes[key];
    }
    if (_GenTab.refVideoUrls?.[key]) {
      _GenTab.refVideoUrls[tile_id] = _GenTab.refVideoUrls[key];
      delete _GenTab.refVideoUrls[key];
    }
    _GenTab.mediaUuidCache || (_GenTab.mediaUuidCache = {});
    if (data.media_uuid || _GenTab.mediaUuidCache[key])
      _GenTab.mediaUuidCache[tile_id] =
        data.media_uuid || _GenTab.mediaUuidCache[key];
    delete _GenTab.mediaUuidCache[key];
    if (data.persistent_media_id)
      _GenTab.fileNameCache[tile_id] = data.persistent_media_id;
    if (data.type) {
      _GenTab.refMediaTypes || (_GenTab.refMediaTypes = {});
      _GenTab.refMediaTypes[tile_id] = data.type;
    }
    if (data.video_url) {
      _GenTab.refVideoUrls || (_GenTab.refVideoUrls = {});
      _GenTab.refVideoUrls[tile_id] = data.video_url;
    }
    window.MediaRegistry?.auditRefIdentity?.(
      "gen:upload-cached",
      [
        {
          id: tile_id,
          media_uuid: _GenTab.mediaUuidCache[tile_id],
          file_name: _GenTab.fileNameCache[tile_id],
          thumbnail: _GenTab.thumbnailCache[tile_id],
          type: _GenTab.refMediaTypes?.[tile_id],
          video_url: _GenTab.refVideoUrls?.[tile_id],
        },
      ],
      { surface: "gen" },
    );
    _GenTab._replacePerPromptFrameId?.(
      key,
      tile_id,
      _GenTab.thumbnailCache?.[tile_id] || thumbnail_url || "",
    );
    for (const frameNum of [1, 2]) {
      const input = document.getElementById(`genTabFrame${frameNum}FileId`);
      if (input?.value === key)
        _GenTab._setFrameImage(
          frameNum,
          tile_id,
          _GenTab.thumbnailCache?.[tile_id] || thumbnail_url || "",
        );
    }
    window.pendingUploadFiles?.delete(key);
    if (window.ImmediateUploader) {
      ImmediateUploader._results.delete(key);
      ImmediateUploader._fileRefs.delete(key);
    }
    if (window.TileCache) {
      if (file_name) window.TileCache.set(file_name, tile_id);
      if (thumbnail_url) window.TileCache.set(thumbnail_url, tile_id);
    }
    console.log("[GenTab] upload key synced to durable Flow ID", {
      key,
      tile_id,
      mediaType: _GenTab.refMediaTypes?.[tile_id] || null,
    });
    _GenTab.renderFileIdThumbnails();
    _GenTab._renderFrameSourcePanel?.();
    _GenTab._renderPerPromptFrames?.(_GenTab._getPromptCount());
    _GenTab._renderFramePreviews?.();
    _GenTab.saveState();
    console.log(
      `[GenTab] Synced upload key \u2192 tile_id: ${key.substring(0, 15)}... \u2192 ${tile_id.substring(0, 15)}...`,
    );
  }
  static async addTrackerReferences(items, projectId) {
    var _a;
    if (!_GenTab.fileIdsInput || _GenTab.providerSelect?.value !== "flow")
      throw new Error("GEN_FLOW_NOT_READY");
    const context = await window.MessageBridge?.getLiveTargetContext?.();
    if (!projectId || context?.projectId !== projectId)
      throw new Error("PROJECT_MISMATCH");
    if (!_GenTab.fileIdsInput || _GenTab.providerSelect?.value !== "flow")
      throw new Error("GEN_FLOW_NOT_READY");
    if (!Array.isArray(items)) throw new Error("INVALID_REFERENCES");
    const previews = new Map();
    for (let offset = 0; offset < items.length; offset += 3) {
      await Promise.all(
        items.slice(offset, offset + 3).map(async (item) => {
          const source = item?.thumbnail;
          if (typeof source !== "string" || !source) return;
          let needsProxy = source.startsWith("blob:");
          try {
            const url = new URL(source);
            needsProxy ||
              (needsProxy =
                ["flow.google.com", "labs.google"].includes(url.hostname) &&
                url.pathname.startsWith("/asb/"));
          } catch (_) {}
          if (!needsProxy) return;
          previews.set(item, null);
          try {
            const result =
              await _GenTab._resolveCrossProviderRefThumbnail(source);
            if (
              result?.success &&
              result.base64 &&
              result.contentType?.startsWith("image/")
            ) {
              previews.set(
                item,
                `data:${result.contentType};base64,${result.base64}`,
              );
            } else {
              console.warn("[GenTab] Tracker reference preview unavailable", {
                fileId: item.fileId,
                error: result?.error || "INVALID_IMAGE_PREVIEW",
              });
            }
          } catch (error) {
            console.warn("[GenTab] Tracker reference preview unavailable", {
              fileId: item.fileId,
              error: error?.message,
            });
          }
        }),
      );
    }
    const liveContext = await window.MessageBridge?.getLiveTargetContext?.();
    if (liveContext?.projectId !== projectId)
      throw new Error("PROJECT_MISMATCH");
    if (!_GenTab.fileIdsInput || _GenTab.providerSelect?.value !== "flow")
      throw new Error("GEN_FLOW_NOT_READY");
    const ids = _GenTab.fileIdsInput.value
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const seen = new Set(ids);
    let added = 0;
    let previewUpdated = false;
    _GenTab.fileNameCache || (_GenTab.fileNameCache = {});
    _GenTab.mediaUuidCache || (_GenTab.mediaUuidCache = {});
    _GenTab.thumbnailCache || (_GenTab.thumbnailCache = {});
    _GenTab.refMediaTypes || (_GenTab.refMediaTypes = {});
    _GenTab.refVideoUrls || (_GenTab.refVideoUrls = {});
    _GenTab.refImageNames || (_GenTab.refImageNames = {});
    for (const item of items) {
      if (typeof item?.fileId !== "string" || !item.fileId.trim()) continue;
      const id = item.fileId.trim();
      const existingId = seen.has(id)
        ? id
        : ids.find(
            (old) =>
              (item.file_name &&
                _GenTab.fileNameCache?.[old] === item.file_name) ||
              (item.media_uuid &&
                _GenTab.mediaUuidCache?.[old] === item.media_uuid),
          );
      if (existingId) {
        const thumbnail = previews.has(item)
          ? previews.get(item)
          : item.thumbnail;
        if (thumbnail && _GenTab.thumbnailCache[existingId] !== thumbnail) {
          _GenTab.thumbnailCache[existingId] = thumbnail;
          previewUpdated = true;
        }
        continue;
      }
      seen.add(id);
      ids.push(id);
      added++;
      if (item.file_name) _GenTab.fileNameCache[id] = item.file_name;
      if (item.media_uuid) _GenTab.mediaUuidCache[id] = item.media_uuid;
      if (item.thumbnail)
        _GenTab.thumbnailCache[id] = previews.get(item) || item.thumbnail;
      _GenTab.refMediaTypes[id] = item.type === "video" ? "video" : "image";
      if (item.video_url) _GenTab.refVideoUrls[id] = item.video_url;
      (_a = _GenTab.refImageNames)[id] ||
        (_a[id] = `image_${Object.keys(_GenTab.refImageNames).length + 1}`);
    }
    if (added || previewUpdated) {
      _GenTab.fileIdsInput.value = ids.join(", ");
      _GenTab.fileIdsInput.dispatchEvent(new Event("input", { bubbles: true }));
      _GenTab.renderFileIdThumbnails();
      if (_GenTab.refImageMode === "mention") _GenTab._refreshMentionHelper();
      _GenTab.saveState();
    }
    return added;
  }
  static addUploadRefImages(items) {
    if (!_GenTab.fileIdsInput || !Array.isArray(items) || !items.length)
      return 0;
    if (!window.pendingUploadFiles) window.pendingUploadFiles = new Map();
    const existingIds = _GenTab.fileIdsInput.value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const newIds = [];
    for (const it of items) {
      if (!it || !it.file) continue;
      const key = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      window.pendingUploadFiles.set(key, {
        file: it.file,
        thumbnail: it.thumbnail,
      });
      newIds.push(key);
      _GenTab.refMediaTypes = _GenTab.refMediaTypes || {};
      _GenTab.refMediaTypes[key] =
        it.type && String(it.type).startsWith("video") ? "video" : "image";
    }
    if (!newIds.length) return 0;
    const merged = [...new Set([...existingIds, ...newIds])];
    _GenTab.fileIdsInput.value = merged.join(", ");
    _GenTab.fileIdsInput.dispatchEvent(new Event("input", { bubbles: true }));
    const existingCount = Object.keys(_GenTab.refImageNames || {}).length;
    let idx = 0;
    _GenTab.refImageNames = _GenTab.refImageNames || {};
    newIds.forEach((id) => {
      if (!_GenTab.refImageNames[id]) {
        idx++;
        _GenTab.refImageNames[id] = `image_${existingCount + idx}`;
      }
    });
    try {
      _GenTab.renderFileIdThumbnails();
    } catch (_) {}
    return newIds.length;
  }
  static _buildThumbPlaceholder(pending) {
    const box = document.createElement("div");
    box.className = "ref-thumb-skel" + (pending ? " is-pending" : "");
    box.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
    return box;
  }
  static renderFileIdThumbnails() {
    if (!_GenTab.fileIdsInput || !_GenTab.fileIdThumbnails) return;
    const currentIds = _GenTab.fileIdsInput.value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const clearAllRefs = document.getElementById("clearAllGenRefsBtn");
    if (clearAllRefs) {
      clearAllRefs.classList.toggle("hidden", currentIds.length === 0);
      clearAllRefs.disabled = !!(
        _GenTab._localRefsUploadRunning || _GenTab._providerSubmitRunning
      );
      const label = window.I18n?.t("common.deleteAll");
      if (label) {
        clearAllRefs.title = label;
        clearAllRefs.setAttribute("aria-label", label);
      }
    }
    const countEl = document.getElementById("refImagesCount");
    if (currentIds.length === 0) {
      _GenTab.fileIdThumbnails.innerHTML = "";
      _GenTab._renderApiRefValidation();
      document.getElementById("refImagesDragHint")?.classList.add("hidden");
      const ratioCount = document.getElementById("refRatioCount");
      if (ratioCount) ratioCount.textContent = "";
      const t = (key, params) =>
        window.I18n ? window.I18n.t(key, params) : key;
      if (countEl) {
        countEl.textContent = t("gen.refCountZero");
        countEl.classList.add("hidden");
      }
      const albumBtn = document.getElementById("saveToAlbumBtn");
      if (albumBtn) albumBtn.classList.add("hidden");
      return;
    }
    const needsRemote = currentIds.some((id) => {
      if (id.startsWith("upload_")) return false;
      if (_GenTab.thumbnailCache[id]) return false;
      return document.querySelectorAll(`[data-tile-id="${id}"]`).length === 0;
    });
    if (needsRemote && typeof MessageBridge !== "undefined") {
      const missingIds = currentIds.filter(
        (id) => !id.startsWith("upload_") && !_GenTab.thumbnailCache[id],
      );
      const fileNamesById = Object.fromEntries(
        missingIds
          .filter((id) => _GenTab.fileNameCache[id])
          .map((id) => [id, _GenTab.fileNameCache[id]]),
      );
      const lookup =
        typeof MessageBridge.getThumbnailsByIds === "function"
          ? MessageBridge.getThumbnailsByIds(missingIds, {
              deep: true,
              fileNamesById,
            })
          : MessageBridge.scanFlowImages();
      lookup
        .then((result) => {
          const images = result?.results
            ? Object.entries(result.results).map(([fileId, media]) => ({
                fileId,
                ...media,
              }))
            : result?.images || result || [];
          for (const img of images) {
            if (
              img.fileId &&
              img.thumbnail &&
              !_GenTab.thumbnailCache[img.fileId]
            ) {
              _GenTab.thumbnailCache[img.fileId] = img.thumbnail;
            }
            if (
              img.fileId &&
              img.file_name &&
              !_GenTab.fileNameCache[img.fileId]
            ) {
              _GenTab.fileNameCache[img.fileId] = img.file_name;
            }
          }
          const latestIds =
            _GenTab.fileIdsInput?.value
              .split(",")
              .map((id) => id.trim())
              .filter(Boolean) || [];
          if (latestIds.join(",") !== currentIds.join(","))
            _GenTab.renderFileIdThumbnails();
          else _GenTab._renderFileIdThumbnailsInner(currentIds, countEl);
        })
        .catch(() => {
          const latestIds =
            _GenTab.fileIdsInput?.value
              .split(",")
              .map((id) => id.trim())
              .filter(Boolean) || [];
          if (latestIds.join(",") !== currentIds.join(","))
            _GenTab.renderFileIdThumbnails();
          else _GenTab._renderFileIdThumbnailsInner(currentIds, countEl);
        });
      return;
    }
    _GenTab._renderFileIdThumbnailsInner(currentIds, countEl);
  }
  static _renderFileIdThumbnailsInner(currentIds, countEl) {
    _GenTab.fileIdThumbnails.innerHTML = "";
    _GenTab.fileIdThumbnails.className = "ref-grid";
    let uiChangedCache = false;
    const currentIdSet = new Set(currentIds);
    Object.keys(_GenTab.refImageNames).forEach((fileId) => {
      if (!currentIdSet.has(fileId)) {
        delete _GenTab.refImageNames[fileId];
      }
    });
    const isMentionMode = _GenTab.refImageMode === "mention";
    const isSequentialMode = _GenTab.refImageMode === "sequential";
    const refLimit = _GenTab.getRefLimit();
    currentIds.forEach((id, index) => {
      const isExceeded = index >= refLimit;
      let thumbSrc = _GenTab.thumbnailCache[id] || "";
      const isPending = id.startsWith("upload_");
      if (!thumbSrc && isPending) {
        const pending = window.pendingUploadFiles?.get(id);
        if (pending?.thumbnail) thumbSrc = pending.thumbnail;
      }
      if (!thumbSrc && !isPending) {
        const tileNodes = document.querySelectorAll(`[data-tile-id="${id}"]`);
        for (const tileNode of tileNodes) {
          const imgEl = tileNode.querySelector("img");
          if (imgEl?.src) {
            thumbSrc = imgEl.src;
            break;
          }
          const vidEl = tileNode.querySelector("video");
          if (vidEl?.poster) {
            thumbSrc = vidEl.poster;
            break;
          }
        }
        if (thumbSrc) {
          _GenTab.thumbnailCache[id] = thumbSrc;
          uiChangedCache = true;
        }
      }
      let name = _GenTab.refImageNames[id];
      if (!name && isPending) {
        const pending = window.pendingUploadFiles?.get(id);
        if (pending?.name) {
          name = pending.name;
        }
      }
      if (!name) {
        name = `img_${index + 1}`;
      }
      _GenTab.refImageNames[id] = name;
      let itemEl;
      if (isMentionMode) {
        itemEl = document.createElement("div");
        itemEl.className = "ref-item";
        itemEl.dataset.refId = id;
      }
      const isUploading = _GenTab._isRefUploading(id);
      const thumbContainer = document.createElement("div");
      const isProviderLocal =
        isPending &&
        ["chatgpt", "grok", "muse", "gemini"].includes(
          _GenTab.providerSelect?.value,
        );
      thumbContainer.className = `ref-thumb ${isPending ? "ref-thumb-pending" : ""} ${isProviderLocal ? "ref-thumb-provider-local" : ""} ${isUploading ? "ref-thumb-uploading" : ""} ${isExceeded ? "ref-thumb-exceeded" : ""}`;
      thumbContainer.dataset.refId = id;
      thumbContainer.dataset.index = String(index + 1);
      if (isExceeded) {
        thumbContainer.title = `Over limit (max ${refLimit} images) \u2014 will not be sent with the prompt`;
      } else if (isMentionMode) {
        thumbContainer.title = `Click to edit name`;
        thumbContainer.style.cursor = "pointer";
        thumbContainer.addEventListener("click", (e) => {
          if (e.target.classList.contains("ref-thumb-remove")) return;
          _GenTab._editRefImageName(id, _GenTab.refImageNames[id] || name);
        });
      } else {
        thumbContainer.title = isPending
          ? `Local: ${id}`
          : `Image ${index + 1}`;
      }
      const innerWrap = document.createElement("div");
      innerWrap.className = "ref-thumb-inner";
      thumbContainer.appendChild(innerWrap);
      const isVideoRef = _GenTab.refMediaTypes?.[id] === "video";
      let refVideoUrl = _GenTab.refVideoUrls?.[id] || "";
      if (isVideoRef && !refVideoUrl) {
        const _pend = window.pendingUploadFiles?.get(id);
        if (_pend?.file instanceof Blob) {
          try {
            refVideoUrl = URL.createObjectURL(_pend.file);
            _GenTab._refVideoObjectUrls =
              _GenTab._refVideoObjectUrls || new Map();
            const _prev = _GenTab._refVideoObjectUrls.get(id);
            if (_prev && _prev !== refVideoUrl) {
              try {
                URL.revokeObjectURL(_prev);
              } catch (_) {}
            }
            _GenTab._refVideoObjectUrls.set(id, refVideoUrl);
          } catch (_) {
            refVideoUrl = "";
          }
        }
      }
      if (isVideoRef && refVideoUrl) {
        const video = document.createElement("video");
        video.src = refVideoUrl;
        video.muted = true;
        video.preload = "metadata";
        video.playsInline = true;
        video.style.cssText =
          "width:100%;height:100%;object-fit:cover;display:block;background:#0c1320;";
        video.addEventListener(
          "loadedmetadata",
          () => {
            try {
              video.currentTime = 0.1;
            } catch (_) {}
          },
          { once: true },
        );
        innerWrap.appendChild(video);
      } else if (thumbSrc) {
        const skel = _GenTab._buildThumbPlaceholder(isPending);
        skel.classList.add("is-underlay");
        innerWrap.appendChild(skel);
        const img = document.createElement("img");
        img.src = thumbSrc;
        img.alt = "";
        img.addEventListener(
          "load",
          () => {
            try {
              skel.remove();
            } catch (_) {}
          },
          { once: true },
        );
        img.addEventListener(
          "error",
          () => {
            try {
              img.remove();
              skel.classList.remove("is-underlay", "is-pending");
            } catch (_) {}
          },
          { once: true },
        );
        innerWrap.appendChild(img);
      } else {
        thumbContainer.setAttribute("data-missing-id", id);
        innerWrap.appendChild(_GenTab._buildThumbPlaceholder(isPending));
      }
      if (isVideoRef && _GenTab.providerSelect?.value === "flow") {
        const playIcon = document.createElement("span");
        playIcon.className = "ref-thumb-video-play";
        playIcon.setAttribute("aria-hidden", "true");
        playIcon.innerHTML =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="m8 5 11 7-11 7z"/></svg>';
        innerWrap.appendChild(playIcon);
      }
      if (isPending) {
        const badge = document.createElement("div");
        badge.className = "ref-thumb-badge";
        badge.textContent = isProviderLocal
          ? "Local"
          : window.I18n?.t("gen.uploadQueued") || "Waiting";
        innerWrap.appendChild(badge);
      }
      if (isUploading && !isProviderLocal) {
        const status = document.createElement("span");
        status.className = "ref-upload-status";
        status.textContent = _GenTab._uploadStageLabel(
          _GenTab._uploadStages.get(id) || "uploading",
        );
        innerWrap.appendChild(status);
      }
      const removeBtn = document.createElement("div");
      removeBtn.className = "ref-thumb-remove";
      removeBtn.title =
        window.I18n?.t("workflow.mediaModal.removeImage") || "Remove image";
      removeBtn.textContent = "\xD7";
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        _GenTab._removeRefImage(id);
      });
      thumbContainer.appendChild(removeBtn);
      if (!isPending) {
        const saveBtn = document.createElement("div");
        saveBtn.className = "ref-thumb-save";
        saveBtn.title =
          window.I18n?.t("imagePicker.saveToAlbum") || "Save to album";
        saveBtn.innerHTML = `<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>`;
        saveBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          _GenTab._saveRefImageToAlbum(id, thumbSrc);
        });
        thumbContainer.appendChild(saveBtn);
      }
      if (isMentionMode) {
        itemEl.appendChild(thumbContainer);
        const nameLabel = document.createElement("div");
        nameLabel.className = "ref-item-name";
        nameLabel.dataset.fileId = id;
        nameLabel.textContent = name;
        nameLabel.title = "Click to edit";
        nameLabel.addEventListener("click", () => {
          _GenTab._editRefImageName(id, _GenTab.refImageNames[id] || name);
        });
        itemEl.appendChild(nameLabel);
        _GenTab.fileIdThumbnails.appendChild(itemEl);
      } else {
        _GenTab.fileIdThumbnails.appendChild(thumbContainer);
      }
    });
    if (
      document.getElementById("genProvider")?.value === "flow" &&
      currentIds.some((id) => id.startsWith("upload_"))
    ) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ref-upload-tile";
      button.disabled =
        _GenTab._localRefsUploadRunning === true ||
        _GenTab._localRefsUploadConfirming === true;
      const uploadTitle = window.I18n?.t("gen.uploadLocalRefs");
      button.setAttribute(
        "aria-label",
        uploadTitle && uploadTitle !== "gen.uploadLocalRefs"
          ? uploadTitle
          : "Upload local references",
      );
      button.innerHTML =
        '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4m0 0-4 4m4-4 4 4"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>';
      const label = document.createElement("span");
      const uploadLabel = window.I18n?.t(
        _GenTab._localRefsUploadRunning
          ? "gen.uploadingImages"
          : "gen.uploadLocalRefsShort",
      );
      label.textContent =
        uploadLabel && !uploadLabel.startsWith("gen.")
          ? uploadLabel
          : _GenTab._localRefsUploadRunning
            ? "Uploading..."
            : "Upload";
      button.appendChild(label);
      button.addEventListener("click", () => _GenTab._uploadLocalRefsOnly());
      _GenTab.fileIdThumbnails.appendChild(button);
    }
    const t = (key, params) => (window.I18n ? window.I18n.t(key, params) : key);
    if (countEl) {
      if (currentIds.length > refLimit) {
        countEl.textContent = t("gen.refCountMax", {
          count: currentIds.length,
          max: refLimit,
        });
        countEl.classList.remove("hidden");
        countEl.classList.add("ref-count-exceeded");
      } else {
        countEl.textContent = t("gen.refCountImages", {
          count: currentIds.length,
        });
        countEl.classList.toggle("hidden", currentIds.length === 0);
        countEl.classList.remove("ref-count-exceeded");
      }
    }
    const dragHint = document.getElementById("refImagesDragHint");
    const ratioCount = document.getElementById("refRatioCount");
    if (dragHint) {
      const mode = _GenTab.refImageMode;
      const showDragHint =
        (mode === "sequential" || mode === "all") && currentIds.length >= 2;
      dragHint.classList.toggle("hidden", !showDragHint);
      if (
        ratioCount &&
        mode === "sequential" &&
        _GenTab.multiPromptCheck?.checked
      ) {
        const prompts =
          _GenTab.promptsArea?.value
            ?.split(/\n\s*\n/)
            .filter((p) => p.trim()) || [];
        const promptCount = prompts.length;
        const imageCount = currentIds.length;
        ratioCount.textContent = t("gen.refRatio", {
          images: imageCount,
          prompts: promptCount,
        });
        ratioCount.classList.remove("match", "mismatch");
        ratioCount.classList.add(
          imageCount ===
            promptCount *
              window.RefImageAssignment.count(_GenTab.refImagesPerPrompt)
            ? "match"
            : "mismatch",
        );
      } else if (ratioCount) {
        ratioCount.textContent = "";
      }
    }
    _GenTab._enableThumbnailDragDrop();
    const albumBtn = document.getElementById("saveToAlbumBtn");
    if (albumBtn) {
      albumBtn.classList.toggle("hidden", currentIds.length === 0);
    }
    if (_GenTab.videoInputTypeSelect?.value === "Frames") {
      _GenTab._renderFrameSourcePanel();
    }
    _GenTab._renderApiRefValidation();
    if (uiChangedCache) _GenTab.saveState();
  }
  static async _uploadLocalRefsOnly() {
    if (
      _GenTab._localRefsUploadRunning ||
      _GenTab._localRefsUploadConfirming ||
      _GenTab._providerSubmitRunning ||
      _GenTab._localUploadController
    )
      return;
    if (document.getElementById("genProvider")?.value !== "flow") return;
    const originalIds =
      _GenTab.fileIdsInput?.value
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean) || [];
    const pendingIds = originalIds.filter((id) => id.startsWith("upload_"));
    if (!pendingIds.length) return;
    const t = (key, params) => {
      const value = window.I18n?.t?.(key, params);
      return value && value !== key ? value : null;
    };
    if (!window.customDialog?.confirm) return;
    _GenTab._localRefsUploadConfirming = true;
    _GenTab.renderFileIdThumbnails();
    let confirmed = false;
    try {
      confirmed = await window.customDialog.confirm(
        t("gen.confirmUploadRefsMessage", { count: pendingIds.length }) ||
          `Upload ${pendingIds.length} local reference image(s) to Flow now? Generation will not start.`,
        {
          title: t("gen.confirmUploadRefsTitle") || "Upload references",
          type: "upload",
          confirmText: t("gen.uploadLocalRefsShort") || "Upload",
          confirmIcon: "upload",
          cancelText: t("common.cancel") || "Cancel",
        },
      );
    } finally {
      _GenTab._localRefsUploadConfirming = false;
      _GenTab.renderFileIdThumbnails();
    }
    if (!confirmed) return;
    if (
      !window.MessageBridge ||
      typeof window.uploadPendingFiles !== "function"
    ) {
      window.showNotification?.(
        t("gen.uploadRefError") || "Reference image upload unavailable",
        "error",
      );
      return;
    }
    _GenTab._localRefsUploadRunning = true;
    const startBtn = _GenTab.startBtn;
    const wasDisabled = startBtn?.disabled;
    if (startBtn) startBtn.disabled = true;
    _GenTab.renderFileIdThumbnails();
    _GenTab._setRefModeUploadLock(true);
    const controller = new AbortController();
    try {
      const payload = { fileIds: [...originalIds] };
      const uploaded = await window.uploadPendingFiles(originalIds.join(", "), {
        surface: "gen",
        manualUpload: true,
        forceDom: window.FlowApiAdapter?.isApiModeIntended?.() !== true,
        abortFn: () => controller.signal.aborted,
        onProgress: (progress) =>
          _GenTab._applyLocalUploadProgress(progress, payload),
      });
      const returnedIds = String(uploaded || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      const mapping = window._lastUploadKeyMapping || {};
      for (const oldId of pendingIds) {
        const newId = mapping[oldId];
        if (newId && newId !== oldId && returnedIds.includes(newId)) {
          _GenTab._applyLocalUploadProgress(
            { state: "completed", key: oldId, newId, detail: {} },
            payload,
          );
        }
      }
      const remaining =
        _GenTab.fileIdsInput?.value
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id.startsWith("upload_")) || [];
      _GenTab.saveState();
      window.showNotification?.(
        remaining.length
          ? t("gen.uploadRefsPartial", { count: remaining.length }) ||
              `${remaining.length} reference image(s) still need upload.`
          : t("gen.uploadRefsDone") ||
              "Reference images uploaded. Ready to generate.",
        remaining.length ? "warning" : "success",
      );
    } catch (error) {
      window.showNotification?.(
        `${t("gen.uploadRefError") || "Reference image upload error"}: ${error?.message || error}`,
        "error",
      );
    } finally {
      _GenTab._localRefsUploadRunning = false;
      _GenTab._uploadingRefIds?.clear();
      _GenTab._setRefModeUploadLock(false);
      if (startBtn) startBtn.disabled = wasDisabled;
      _GenTab.renderFileIdThumbnails();
    }
  }
  static _enableThumbnailDragDrop() {
    const items = _GenTab.fileIdThumbnails?.querySelectorAll(
      ".ref-item, .ref-grid > .ref-thumb",
    );
    if (!items?.length) return;
    items.forEach((item) => {
      const refId =
        item.dataset.refId || item.querySelector(".ref-thumb")?.dataset.refId;
      if (!refId) return;
      item.draggable = true;
      item.style.cursor = "grab";
      item.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", refId);
        item.classList.add("dragging");
      });
      item.addEventListener("dragend", () => {
        item.classList.remove("dragging");
      });
      item.addEventListener("dragover", (e) => {
        e.preventDefault();
        const dragging = _GenTab.fileIdThumbnails.querySelector(".dragging");
        if (dragging && item !== dragging) {
          item.classList.add("drag-over");
        }
      });
      item.addEventListener("dragleave", () => {
        item.classList.remove("drag-over");
      });
      item.addEventListener("drop", (e) => {
        e.preventDefault();
        item.classList.remove("drag-over");
        const draggedId = e.dataTransfer.getData("text/plain");
        const targetId = refId;
        if (draggedId && targetId && draggedId !== targetId) {
          _GenTab._reorderFileIds(draggedId, targetId);
        }
      });
    });
  }
  static _reorderFileIds(draggedId, targetId) {
    const ids = _GenTab.fileIdsInput.value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const draggedIdx = ids.indexOf(draggedId);
    const targetIdx = ids.indexOf(targetId);
    if (draggedIdx === -1 || targetIdx === -1) return;
    ids.splice(draggedIdx, 1);
    ids.splice(targetIdx, 0, draggedId);
    _GenTab.fileIdsInput.value = ids.join(", ");
    _GenTab.renderFileIdThumbnails();
    _GenTab._refreshMentionHelper();
    _GenTab.saveState();
  }
  static async _handleDroppedFiles(files) {
    if (!_GenTab.fileIdsInput) return [];
    if (!window.pendingUploadFiles) window.pendingUploadFiles = new Map();
    const existingIds = _GenTab.fileIdsInput.value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const newIds = [];
    for (const file of files) {
      const key = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const thumbnail = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve("");
        reader.readAsDataURL(file);
      });
      const _baseName = file.name.replace(/\.[^/.]+$/, "");
      window.pendingUploadFiles.set(key, { file, thumbnail, name: _baseName });
      _GenTab.refImageNames[key] = _baseName;
      newIds.push(key);
    }
    const mergedIds = [...existingIds, ...newIds];
    _GenTab.fileIdsInput.value = mergedIds.join(", ");
    _GenTab.fileIdsInput.dispatchEvent(new Event("input", { bubbles: true }));
    _GenTab.renderFileIdThumbnails();
    return newIds;
  }
  static bindFramePicker(frameNum) {
    const pickBtn = document.getElementById(`genTabFrame${frameNum}PickBtn`);
    const fileIdInput = document.getElementById(`genTabFrame${frameNum}FileId`);
    const previewEl = document.getElementById(`genTabFrame${frameNum}Preview`);
    if (!pickBtn) return;
    pickBtn.addEventListener("click", () => {
      const existingIds = (fileIdInput?.value || "").split(",").filter(Boolean);
      if (window.imagePickerModal) {
        window.imagePickerModal.open({
          existingFileIds: existingIds,
          mediaFilter: "image",
          singleSelect: true,
          onConfirm: (images) => {
            if (images.length > 0) {
              const img = images[0];
              if (img.source === "upload" && img.file) {
                const key =
                  img.fileId ||
                  `upload_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                if (!window.pendingUploadFiles)
                  window.pendingUploadFiles = new Map();
                window.pendingUploadFiles.set(key, {
                  file: img.file,
                  thumbnail: img.thumbnail,
                });
                img.fileId = key;
              }
              if (img.source === "flow" && img.fileId) {
                if (img.file_name)
                  _GenTab.fileNameCache[img.fileId] = img.file_name;
                if (img.thumbnail)
                  _GenTab.thumbnailCache[img.fileId] = img.thumbnail;
              }
              if (fileIdInput) fileIdInput.value = img.fileId || "";
              if (previewEl) {
                const thumbSrc =
                  img.thumbnail ||
                  window.pendingUploadFiles?.get(img.fileId)?.thumbnail ||
                  "";
                previewEl.innerHTML = `<div class="ref-thumb">${thumbSrc ? `<img src="${thumbSrc}" alt="frame ${frameNum}" />` : `<span>${(img.fileId || "").substring(0, 12)}</span>`}</div>`;
              }
            }
            _GenTab.saveState();
          },
        });
      }
    });
  }
  static _applyFramesSupport() {
    const sel = _GenTab.videoInputTypeSelect;
    if (!sel) return;
    const flowAdapter = window.ProviderRegistry?.get?.("flow");
    const modelValue = _GenTab.videoModelSelect?.value || "";
    const supports =
      typeof flowAdapter?.supportsFrames === "function"
        ? flowAdapter.supportsFrames(modelValue)
        : true;
    const framesOpt = sel.querySelector('option[value="Frames"]');
    if (framesOpt) {
      framesOpt.hidden = !supports;
      framesOpt.disabled = !supports;
    }
    if (!supports && sel.value === "Frames") {
      sel.value = "Ingredients";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
  static _applyVoicePickerVisibility() {
    const container = document.getElementById("genVideoVoiceContainer");
    if (!container) return;
    const providerKey = document.getElementById("genProvider")?.value || "flow";
    const genType = _GenTab.genTypeSelect?.value;
    const isFrames =
      genType === "Video" && _GenTab.videoInputTypeSelect?.value === "Frames";
    if (providerKey !== "flow" || genType !== "Video" || isFrames) {
      container.classList.add("hidden");
      if (isFrames) {
        const hiddenSel = document.getElementById("genVideoVoiceSelect");
        if (hiddenSel?.value) {
          hiddenSel.value = "";
          _GenTab._voicePicker?._updateTrigger();
          _GenTab.saveState?.();
        }
      }
      return;
    }
    const modelValue = _GenTab.videoModelSelect?.value || "";
    const modelObj = window.ModelRegistry?.findModel?.("flow", modelValue);
    const supportsVoice = !!(modelObj?.config?.supports_voice === true);
    if (supportsVoice) {
      container.classList.remove("hidden");
      _GenTab._initVoicePickerIfNeeded();
      _GenTab._voicePicker?._updateTrigger();
    } else {
      container.classList.add("hidden");
      const definitelyUnsupported =
        !!modelObj &&
        !!modelObj.config &&
        modelObj.config.supports_voice !== true;
      if (definitelyUnsupported) {
        const hiddenSel = document.getElementById("genVideoVoiceSelect");
        if (hiddenSel && hiddenSel.value) {
          hiddenSel.value = "";
          _GenTab._voicePicker?._updateTrigger();
          _GenTab.saveState?.();
        }
      }
    }
  }
  static _initVoicePickerIfNeeded() {
    if (_GenTab._voicePicker || !window.VoicePicker) return;
    const triggerEl = document.getElementById("genVideoVoiceTrigger");
    const thumbEl = document.getElementById("genVideoVoiceTriggerThumb");
    const labelEl = document.getElementById("genVideoVoiceLabel");
    const hiddenSelectEl = document.getElementById("genVideoVoiceSelect");
    if (!triggerEl) return;
    _GenTab._voicePicker = new window.VoicePicker({
      triggerEl,
      thumbEl,
      labelEl,
      hiddenSelectEl,
      providerSlug: "flow",
      getSelected: () => hiddenSelectEl?.value || "",
      onChange: () => {
        _GenTab.saveState?.();
      },
    });
    _GenTab._voicePicker.init();
    chrome.storage.local.get(["toby_gentab_state"], (res) => {
      const savedSlug = res?.toby_gentab_state?.selectedVoiceSlug;
      if (
        savedSlug &&
        hiddenSelectEl &&
        !_GenTab._voicePicker?._clearedByMention
      ) {
        hiddenSelectEl.value = savedSlug;
        _GenTab._voicePicker._updateTrigger();
      }
      _GenTab._syncPickerMentionState();
    });
  }
  static _applyCharacterPickerVisibility() {
    const container = document.getElementById("genCharacterContainer");
    if (!container) return;
    const providerKey = document.getElementById("genProvider")?.value || "flow";
    const isFrames =
      _GenTab.genTypeSelect?.value === "Video" &&
      _GenTab.videoInputTypeSelect?.value === "Frames";
    if (providerKey !== "flow" || isFrames) {
      container.classList.add("hidden");
      if (isFrames) {
        const hiddenSel = document.getElementById("genCharacterSelect");
        if (hiddenSel?.value) {
          hiddenSel.value = "";
          _GenTab._characterPicker?._updateTrigger();
          _GenTab.saveState?.();
        }
      }
      return;
    }
    const genType = _GenTab.genTypeSelect?.value;
    const modelValue =
      genType === "Image"
        ? _GenTab.imageModelSelect?.value || ""
        : _GenTab.videoModelSelect?.value || "";
    const modelObj = window.ModelRegistry?.findModel?.("flow", modelValue);
    const supportsChar = !!(modelObj?.config?.supports_character === true);
    if (supportsChar) {
      container.classList.remove("hidden");
      _GenTab._initCharacterPickerIfNeeded();
      _GenTab._characterPicker?._updateTrigger();
    } else {
      container.classList.add("hidden");
      const definitelyUnsupported =
        !!modelObj &&
        !!modelObj.config &&
        modelObj.config.supports_character !== true;
      if (definitelyUnsupported) {
        const hiddenSel = document.getElementById("genCharacterSelect");
        if (hiddenSel && hiddenSel.value) {
          hiddenSel.value = "";
          _GenTab._characterPicker?._updateTrigger();
          _GenTab.saveState?.();
        }
      }
    }
  }
  static _initCharacterPickerIfNeeded() {
    if (_GenTab._characterPicker || !window.CharacterPicker) return;
    const triggerEl = document.getElementById("genCharacterTrigger");
    const thumbEl = document.getElementById("genCharacterTriggerThumb");
    const labelEl = document.getElementById("genCharacterLabel");
    const hiddenSelectEl = document.getElementById("genCharacterSelect");
    if (!triggerEl) return;
    _GenTab._characterPicker = new window.CharacterPicker({
      triggerEl,
      thumbEl,
      labelEl,
      hiddenSelectEl,
      getSelected: () => hiddenSelectEl?.value || "",
      onChange: () => {
        _GenTab.saveState?.();
      },
    });
    _GenTab._characterPicker.init();
    chrome.storage.local.get(["toby_gentab_state"], (res) => {
      const savedSlug = res?.toby_gentab_state?.selectedCharacterSlug;
      if (
        savedSlug &&
        hiddenSelectEl &&
        !hiddenSelectEl.value &&
        !_GenTab._characterPicker?._clearedByMention
      ) {
        hiddenSelectEl.value = savedSlug;
        _GenTab._characterPicker._updateTrigger();
      }
      _GenTab._syncPickerMentionState();
    });
  }
  static updateGenTypeUI() {
    const providerKey = document.getElementById("genProvider")?.value || "flow";
    if (providerKey !== "flow") {
      try {
        _GenTab._renderByProvider(providerKey);
      } catch (_e) {}
      _GenTab.updateRefImagesVisibility();
      _GenTab.renderFileIdThumbnails();
      return;
    }
    const isVideo = _GenTab.genTypeSelect.value === "Video";
    if (isVideo) {
      _GenTab.imageModelContainer.classList.add("hidden");
      _GenTab.videoModelContainer.classList.remove("hidden");
      if (_GenTab.videoInputTypeContainer)
        _GenTab.videoInputTypeContainer.classList.remove("hidden");
      _GenTab._applyFramesSupport();
      _GenTab._applyVoicePickerVisibility();
    } else {
      _GenTab.imageModelContainer.classList.remove("hidden");
      _GenTab.videoModelContainer.classList.add("hidden");
      if (_GenTab.videoInputTypeContainer)
        _GenTab.videoInputTypeContainer.classList.add("hidden");
      const vcEl = document.getElementById("genVideoVoiceContainer");
      if (vcEl) vcEl.classList.add("hidden");
    }
    try {
      _GenTab._applyCharacterPickerVisibility();
    } catch (_) {}
    const compactBar = document.getElementById("genCompactBar");
    if (compactBar) compactBar.dataset.genMode = isVideo ? "video" : "image";
    _GenTab.updateRefImagesVisibility();
    const activeProvider =
      document.getElementById("genProvider")?.value || "flow";
    if (activeProvider === "muse") _GenTab._renderMuseRatioOptions();
    else if (activeProvider === "gemini") _GenTab._renderGeminiRatioOptions();
    else _GenTab.updateRatioOptions();
    _GenTab.renderFileIdThumbnails();
  }
  static _ratioIcon(value) {
    const v = String(value || "").trim();
    if (v === "16:9") return "\u25AC";
    if (v === "4:3" || v === "3:2") return "\u25AD";
    if (v === "1:1") return "\u25A1";
    if (v === "3:4" || v === "2:3") return "\u25AF";
    if (v === "9:16") return "\u25AE";
    return "\u25C7";
  }
  static updateRatioOptions() {
    if (!_GenTab.aspectRatioSelect) return;
    const providerAtRender =
      document.getElementById("genProvider")?.value || "flow";
    if (providerAtRender !== "flow") return;
    const isVideo = _GenTab.genTypeSelect?.value === "Video";
    const currentValue = _GenTab.aspectRatioSelect.value;
    const mode = isVideo ? "video" : "image";
    const ratios =
      window.ProviderConfigManager?.safeGetRatiosSync?.("flow", mode) || [];
    if (ratios.length === 0) {
      _GenTab.aspectRatioSelect.innerHTML = "";
      _GenTab.aspectRatioSelect.disabled = true;
      console.info(
        `[GenTab] Flow ${mode} ratios unavailable from provider config`,
      );
      return;
    }
    _GenTab.aspectRatioSelect.disabled = false;
    const options = ratios.map((r) => {
      const val = typeof r === "string" ? r : r.value || r;
      return { value: val, label: `${_GenTab._ratioIcon(val)} ${val}` };
    });
    _GenTab.aspectRatioSelect.innerHTML = options
      .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
      .join("");
    const confirmRatio = document.getElementById("confirmAspectRatio");
    if (confirmRatio) {
      confirmRatio.innerHTML = _GenTab.aspectRatioSelect.innerHTML;
    }
    const syncValue = _GenTab._resolveFlowRatio(currentValue);
    if (syncValue) {
      _GenTab.aspectRatioSelect.value = syncValue;
      if (confirmRatio) confirmRatio.value = syncValue;
    }
    _GenTab.aspectRatioSelect.dataset.cg5Provider = "flow";
  }
  static _updateModelSelect(selectEl, provider, mediaType, preferredValue) {
    if (!selectEl) return false;
    const requested =
      preferredValue || selectEl._tobyPendingModelValue || selectEl.value || "";
    let models;
    try {
      models = window.ModelRegistry?.getModelsSync?.(provider, mediaType);
    } catch (error) {
      console.warn(
        "[GenTab] Model catalog not ready:",
        provider,
        mediaType,
        error?.message,
      );
    }
    models = Array.isArray(models)
      ? models.filter((model) => model?.value)
      : [];
    if (!models.length) {
      selectEl._tobyPendingModelValue = requested;
      selectEl.disabled = true;
      return false;
    }
    const previousOrder =
      selectEl._tobyModelValues ||
      [...selectEl.options].map((option) => option.value);
    const selected = window.ModelRegistry.resolveModelSelection(
      provider,
      models,
      requested,
      previousOrder,
    );
    selectEl.innerHTML = "";
    for (const model of models) {
      const option = document.createElement("option");
      option.value = model.value;
      option.textContent = model.name || model.label || model.value;
      selectEl.appendChild(option);
    }
    selectEl.value = selected;
    selectEl.disabled = false;
    selectEl._tobyModelValues = models.map((model) => model.value);
    delete selectEl._tobyPendingModelValue;
    return true;
  }
  static updateModelOptions() {
    const settings = window.storageSettings?.getSettings?.() || {};
    _GenTab._updateModelSelect(
      _GenTab.imageModelSelect,
      "flow",
      "image",
      _GenTab.imageModelSelect?._tobyPendingModelValue ||
        _GenTab.imageModelSelect?.value ||
        settings.defaultImageModel,
    );
    _GenTab._updateModelSelect(
      _GenTab.videoModelSelect,
      "flow",
      "video",
      _GenTab.videoModelSelect?._tobyPendingModelValue ||
        _GenTab.videoModelSelect?.value ||
        settings.defaultVideoModel,
    );
    _GenTab._updateModelSelect(_GenTab.chatgptModelSelect, "chatgpt", "image");
    _GenTab._updateModelSelect(
      _GenTab.geminiModelSelect,
      "gemini",
      _GenTab.genTypeSelect?.value === "Video" ? "video" : "image",
    );
    _GenTab.updateMuseModelOptions();
    _GenTab.updateFlowVideoDurationOptions();
    try {
      _GenTab._applyVoicePickerVisibility();
    } catch (_) {}
    try {
      _GenTab._applyCharacterPickerVisibility();
    } catch (_) {}
    try {
      _GenTab.updateFlowVideoResolutionOptions();
    } catch (_) {}
  }
  static updateMuseModelOptions() {
    const selectEl =
      _GenTab.museModelSelect || document.getElementById("museModel");
    if (!selectEl || !window.ModelRegistry?.safeGetModelsSync) return;
    const mode =
      document.getElementById("genType")?.value === "Video" ? "video" : "image";
    const models = window.ModelRegistry.safeGetModelsSync("muse", mode) || [];
    const previous = selectEl.value;
    selectEl.innerHTML = "";
    for (const model of models) {
      const value = model?.value || model?.name;
      if (!value) continue;
      const option = document.createElement("option");
      option.value = value;
      option.textContent = model.name || model.label || value;
      selectEl.appendChild(option);
    }
    const available = [...selectEl.options].map((option) => option.value);
    const defaultValue =
      models.find((model) => model?.is_default)?.value ||
      models[0]?.value ||
      models[0]?.name ||
      "";
    selectEl.value = available.includes(previous)
      ? previous
      : available.includes(defaultValue)
        ? defaultValue
        : "";
    selectEl.disabled = available.length === 0;
  }
  static updateFlowVideoDurationOptions() {
    const selectEl = _GenTab.flowVideoDurationSelect;
    if (!selectEl) return;
    const currentModel = _GenTab.videoModelSelect?.value || "";
    let tier = "default";
    try {
      const models =
        window.ModelRegistry?.safeGetModelsSync?.("flow", "video") || [];
      const modelObj = models.find(
        (m) => m.value === currentModel || m.name === currentModel,
      );
      if (modelObj?.config?.duration_tier) {
        tier = modelObj.config.duration_tier;
      }
    } catch (_) {}
    const durations =
      window.ProviderConfigManager?.safeGetVideoDurationsSync?.("flow", tier) ||
      [];
    const visible =
      tier !== "default" &&
      durations.length > 0 &&
      document.getElementById("genProvider")?.value === "flow" &&
      document.getElementById("genType")?.value === "Video";
    _GenTab.flowVideoDurationContainer?.classList.toggle("hidden", !visible);
    if (durations.length === 0) return;
    const prevValue = selectEl.value;
    selectEl.innerHTML = "";
    for (const d of durations) {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = d;
      selectEl.appendChild(opt);
    }
    if (prevValue && durations.includes(prevValue)) {
      selectEl.value = prevValue;
    } else if (durations.length > 0) {
      const defaultIdx = durations.indexOf("6s");
      selectEl.value = defaultIdx >= 0 ? durations[defaultIdx] : durations[0];
    }
  }
  static updateFlowVideoResolutionOptions() {
    const selectEl = _GenTab.flowVideoResolutionSelect;
    const container = _GenTab.flowVideoResolutionContainer;
    if (!selectEl || !container) return;
    const model = _GenTab.videoModelSelect?.value || "";
    const cfg = window.ModelRegistry?.getGenerationResolutionConfig?.(
      "flow",
      model,
    );
    const isFlowVideo =
      (document.getElementById("genProvider")?.value || "flow") === "flow" &&
      _GenTab.genTypeSelect?.value === "Video";
    if (!isFlowVideo || !cfg) {
      container.classList.add("hidden");
      selectEl.innerHTML = "";
      return;
    }
    const previous = selectEl.value;
    selectEl.innerHTML = cfg.options
      .map(
        (o) =>
          `<option value="${_GenTab._escapeAttr(o.value)}">${_GenTab._escapeHtml(o.label)}</option>`,
      )
      .join("");
    selectEl.value = cfg.options.some((o) => o.value === previous)
      ? previous
      : cfg.default;
    container.classList.remove("hidden");
  }
  static updateGrokVideoDurationOptions() {
    const selectEl = document.getElementById("grokDuration");
    if (!selectEl) return;
    let durations = [];
    try {
      durations =
        window.ProviderConfigManager?.getSupportedDurationsSync?.("grok") || [];
    } catch (_) {
      return;
    }
    if (durations.length === 0) return;
    const prevValue = selectEl.value;
    selectEl.innerHTML = "";
    for (const d of durations) {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = d;
      selectEl.appendChild(opt);
    }
    if (prevValue && durations.includes(prevValue)) {
      selectEl.value = prevValue;
    } else {
      chrome.storage.local.get(["af_settings"], (res) => {
        const def = res.af_settings?.grokDefaultDuration || durations[0];
        selectEl.value = durations.includes(def) ? def : durations[0];
      });
    }
  }
  static updateGrokVideoResolutionOptions() {
    const selectEl = document.getElementById("grokResolution");
    if (!selectEl) return;
    let resolutions = [];
    try {
      resolutions =
        window.ProviderConfigManager?.getSupportedResolutionsSync?.("grok") ||
        [];
    } catch (_) {
      return;
    }
    if (resolutions.length === 0) return;
    const prevValue = selectEl.value;
    selectEl.innerHTML = resolutions
      .map(
        (value) =>
          `<option value="${_GenTab._escapeAttr(value)}">${_GenTab._escapeHtml(value)}</option>`,
      )
      .join("");
    if (prevValue && resolutions.includes(prevValue)) {
      selectEl.value = prevValue;
      return;
    }
    chrome.storage.local.get(["af_settings"], (res) => {
      const configured = res.af_settings?.grokDefaultResolution;
      selectEl.value = resolutions.includes(configured)
        ? configured
        : resolutions[0];
    });
  }
  static updateDownloadResolutionOptions() {
    const fillSelect = (selectEl, mode) => {
      if (!selectEl) return;
      const options =
        window.ProviderConfigManager?.getDownloadResolutionsSync?.(
          "flow",
          mode,
        );
      const list = Array.isArray(options) ? options : [];
      selectEl.disabled = list.length === 0;
      const prevValue = selectEl.value;
      selectEl.innerHTML = "";
      for (const r of list) {
        const opt = document.createElement("option");
        opt.value = r.value;
        opt.textContent = r.label || r.menu_label || r.value;
        selectEl.appendChild(opt);
      }
      if (
        prevValue &&
        [...selectEl.options].some((o) => o.value === prevValue)
      ) {
        selectEl.value = prevValue;
      }
    };
    fillSelect(document.getElementById("genTabDownloadResolution"), "image");
    fillSelect(
      document.getElementById("genTabVideoDownloadResolution"),
      "video",
    );
    const overlay = document.getElementById("confirmRunOverlay");
    if (overlay && !overlay.classList.contains("hidden"))
      _GenTab._syncConfirmDownloadResolution(true);
  }
  static _syncConfirmDownloadResolution(preserveSelection = false) {
    const select = document.getElementById("confirmDownloadRes");
    if (!select || document.getElementById("genProvider")?.value !== "flow")
      return;
    const source = document.getElementById(
      _GenTab.genTypeSelect?.value === "Video"
        ? "genTabVideoDownloadResolution"
        : "genTabDownloadResolution",
    );
    const previous =
      preserveSelection && !select.disabled && select.selectedIndex >= 0
        ? select.value
        : null;
    const enabled = !!document.getElementById("genTabAutoDownload")?.checked;
    const options = [...(source?.options || [])].filter(
      (option) => option.value,
    );
    select.replaceChildren();
    const no = document.createElement("option");
    no.value = "";
    no.textContent = window.I18n?.t("common.no") || "";
    select.appendChild(no);
    for (const option of options) select.appendChild(option.cloneNode(true));
    select.disabled = !options.length || source.disabled;
    if (previous === "" || (previous === null && !enabled)) select.value = "";
    else
      select.value = options.some((option) => option.value === previous)
        ? previous
        : options.some((option) => option.value === source?.value)
          ? source.value
          : options[0]?.value || "";
  }
  static updateQuantityOptions() {
    const inputEl =
      _GenTab.quantitySelect || document.getElementById("quantitySelect");
    if (!inputEl) return;
    const range =
      window.ProviderConfigManager?.safeGetQuantityRangeSync?.("flow");
    const min = range?.min ?? 1;
    const max = range?.max ?? 4;
    inputEl.min = String(min);
    inputEl.max = String(max);
    const inRange = (v) => {
      const n = parseInt(v, 10);
      return Number.isInteger(n) && n >= min && n <= max;
    };
    const currentVal = parseInt(inputEl.value, 10);
    if (inRange(currentVal)) {
    } else {
      inputEl.value = String(min);
    }
    try {
      chrome.storage.local.get(["af_settings"], (res) => {
        const saved = res?.af_settings?.defaultFlowQuantity;
        if (saved && inRange(saved)) {
          inputEl.value = String(saved);
        }
      });
    } catch (_) {}
  }
  static _bindQuantityButtons() {
    const inputEl =
      _GenTab.quantitySelect || document.getElementById("quantitySelect");
    if (!inputEl) return;
    const getMinMax = () => {
      const range =
        window.ProviderConfigManager?.safeGetQuantityRangeSync?.("flow");
      return { min: range?.min ?? 1, max: range?.max ?? 4 };
    };
    const minusBtn = document.getElementById("genQtyMinus");
    const plusBtn = document.getElementById("genQtyPlus");
    minusBtn?.addEventListener("click", () => {
      const { min } = getMinMax();
      const val = parseInt(inputEl.value, 10) || min;
      if (val > min) {
        inputEl.value = String(val - 1);
        inputEl.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    plusBtn?.addEventListener("click", () => {
      const { max, min } = getMinMax();
      const val = parseInt(inputEl.value, 10) || min;
      if (val < max) {
        inputEl.value = String(val + 1);
        inputEl.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  }
  static _validateRefSupportAfterChange(reason) {
    const isVideo = _GenTab.genTypeSelect?.value === "Video";
    if (!isVideo) return;
    const provider = (_GenTab.providerSelect?.value || "flow").toLowerCase();
    if (provider !== "flow") return;
    const fileIdsRaw = _GenTab.fileIdsInput?.value || "";
    const currentIds = fileIdsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (currentIds.length === 0) return;
    const adapter = window.ProviderRegistry?.get?.("flow");
    if (!adapter?.supportsRefImages) return;
    const modelValue = _GenTab.videoModelSelect?.value || "";
    const inputType = _GenTab.videoInputTypeSelect?.value || "Ingredients";
    const duration = _GenTab.flowVideoDurationSelect?.value || void 0;
    const supported = adapter.supportsRefImages(modelValue, {
      inputType,
      duration,
    });
    if (supported) return;
    _GenTab.fileIdsInput.value = "";
    _GenTab.fileIdsInput.dispatchEvent(new Event("input", { bubbles: true }));
    const msg =
      window.I18n?.t?.("gen.refStrippedAfterChange", {
        model: modelValue,
        count: currentIds.length,
        reason,
      }) ||
      `Changed ${reason} \u2192 model "${modelValue}" (${inputType}${duration ? ", " + duration : ""}) does not support ref \u2192 removed ${currentIds.length} ref image(s).`;
    if (window.TobyNotify?.warning) window.TobyNotify.warning(msg);
    else if (window.showNotification) window.showNotification(msg, "warning");
    console.warn("[GenTab][Model Constraint]", msg);
  }
  static updateGrokReferenceControls(preferences = null) {
    if (preferences) _GenTab._pendingGrokReferenceSelection = preferences;
    const pending = _GenTab._pendingGrokReferenceSelection || {};
    const modelSelect = document.getElementById("grokModel");
    const inputSelect = document.getElementById("grokVideoInputType");
    window.ProviderRegistry?.get?.("grok")?.populateReferenceControls?.(
      modelSelect,
      inputSelect,
      {
        mode: _GenTab.genTypeSelect?.value === "Video" ? "video" : "image",
        ...pending,
        onChange: () => {
          _GenTab._pendingGrokReferenceSelection = null;
          _GenTab.updateGrokFrameControls();
          _GenTab.saveState();
          _GenTab.renderFileIdThumbnails();
          _GenTab._updateRefModeUI();
        },
      },
    );
    if (
      modelSelect &&
      [...modelSelect.options].some((o) => o.value === pending.modelValue)
    ) {
      modelSelect.value = pending.modelValue;
      window.ProviderRegistry?.get?.("grok")?.populateReferenceControls?.(
        modelSelect,
        inputSelect,
        modelSelect._grokReferenceOptions,
      );
    }
    if (
      inputSelect &&
      [...inputSelect.options].some((o) => o.value === pending.inputType)
    )
      inputSelect.value = pending.inputType;
    if (modelSelect?.value && inputSelect?.value)
      _GenTab._pendingGrokReferenceSelection = null;
    _GenTab.updateGrokFrameControls();
  }
  static updateGrokFrameControls() {
    const adapter = window.ProviderRegistry?.get?.("grok");
    const active = () =>
      _GenTab.providerSelect?.value === "grok" &&
      _GenTab.genTypeSelect?.value === "Video" &&
      document.getElementById("grokVideoInputType")?.value === "Frames";
    const container = document.getElementById("grokFramesSection");
    container?.classList.toggle("hidden", !active());
    if (!active() || !adapter) {
      if (_GenTab.providerSelect?.value === "grok")
        _GenTab._toggleEl("#refImagesSection", true);
      return;
    }
    _GenTab._toggleEl("#refImagesSection", false);
    if (!_GenTab._grokFrameData) {
      const ids = String(_GenTab.fileIdsInput?.value || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      _GenTab._grokFrameData = {
        ref_file_ids: ids.join(","),
        ref_thumbnails: Object.fromEntries(
          ids.map((id) => [id, _GenTab.thumbnailCache?.[id] || null]),
        ),
        ref_file_names: Object.fromEntries(
          ids.map((id) => [id, _GenTab.fileNameCache?.[id] || null]),
        ),
      };
    }
    const sourceIds = String(_GenTab.fileIdsInput?.value || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    for (const id of sourceIds) {
      if (_GenTab.thumbnailCache?.[id]) {
        const previous = _GenTab._grokFrameData.ref_thumbnails[id];
        const cached = _GenTab.thumbnailCache[id];
        _GenTab._grokFrameData.ref_thumbnails[id] = {
          ...(typeof previous === "object" ? previous : {}),
          ...(typeof cached === "object" ? cached : { thumbnail: cached }),
        };
      }
      if (_GenTab.fileNameCache?.[id])
        _GenTab._grokFrameData.ref_file_names[id] = _GenTab.fileNameCache[id];
    }
    container._grokFrameRefresh = () => _GenTab.updateGrokFrameControls();
    adapter.renderFrameControls(container, {
      data: _GenTab._grokFrameData,
      surface: "gen",
      active,
      sourceFileIds: sourceIds.join(","),
      promptCount: _GenTab._getPromptCount(),
      promptPreviews: _GenTab._getPromptPreviews(),
      onBusy: () => {
        if (_GenTab.providerSelect?.value === "grok")
          _GenTab._updateGenBtnUploadState();
      },
      onChange: (refs, sources) => {
        for (const [id, thumbnail] of Object.entries(sources.ref_thumbnails))
          _GenTab.thumbnailCache[id] =
            typeof thumbnail === "string"
              ? thumbnail
              : thumbnail?.source_thumbnail || thumbnail?.thumbnail || null;
        for (const [id, name] of Object.entries(sources.ref_file_names))
          _GenTab.fileNameCache[id] = name;
        if (_GenTab.fileIdsInput)
          _GenTab.fileIdsInput.value = sources.ref_file_ids;
        _GenTab._grokFrameData.ref_file_ids = sources.ref_file_ids;
        _GenTab.renderFileIdThumbnails?.();
        _GenTab.saveState();
      },
    });
  }
  static getRefLimit(scaleSequential = true) {
    const refMode = _GenTab.refImageMode;
    if (refMode === "mention") return Infinity;
    const isVideo = _GenTab.genTypeSelect?.value === "Video";
    const isFrames =
      (_GenTab.providerSelect?.value === "grok"
        ? document.getElementById("grokVideoInputType")?.value
        : _GenTab.videoInputTypeSelect?.value) === "Frames";
    const provider = (_GenTab.providerSelect?.value || "flow").toLowerCase();
    const mode = isVideo ? "video" : "image";
    const modelValueForRef =
      provider === "grok"
        ? document.getElementById("grokModel")?.value
        : provider === "muse"
          ? _GenTab.museModelSelect?.value || ""
          : isVideo
            ? _GenTab.videoModelSelect?.value || ""
            : _GenTab.imageModelSelect?.value || "";
    const durationForRef = isVideo
      ? _GenTab.flowVideoDurationSelect?.value || void 0
      : void 0;
    const resolved =
      typeof ImagePickerModal !== "undefined" &&
      ImagePickerModal.resolveMaxSelections
        ? ImagePickerModal.resolveMaxSelections({
            provider,
            mode,
            isFrames,
            modelValue: modelValueForRef,
            duration: durationForRef,
          })
        : null;
    if (provider === "grok" && !Number.isInteger(resolved)) return 0;
    if (resolved === 0) return 0;
    let perPromptPolicy;
    if (typeof resolved === "number" && resolved > 0) {
      perPromptPolicy = resolved;
    } else if (
      provider === "chatgpt" ||
      provider === "grok" ||
      provider === "gemini"
    ) {
      perPromptPolicy = 4;
    } else {
      perPromptPolicy =
        isVideo && !isFrames
          ? _GenTab.REF_LIMIT_VIDEO
          : _GenTab.REF_LIMIT_IMAGE;
    }
    if (provider === "flow") {
      const total =
        window.ProviderRegistry?.get?.("flow")?.getMaxRefImagesTotal?.(
          modelValueForRef,
        );
      if (Number.isInteger(total) && total >= 0)
        perPromptPolicy = Math.min(perPromptPolicy, total);
    }
    const isMulti = _GenTab.multiPromptCheck?.checked;
    if (scaleSequential && refMode === "sequential") {
      return (
        (isMulti ? _GenTab._countPrompts?.() || 1 : 1) *
        Math.min(
          perPromptPolicy,
          window.RefImageAssignment.count(_GenTab.refImagesPerPrompt),
        )
      );
    }
    return perPromptPolicy;
  }
  static _countPrompts() {
    const txt = _GenTab.promptsArea?.value || "";
    if (!txt.trim()) return 1;
    const blocks = txt
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter((b) => b.length > 0);
    return Math.max(1, blocks.length);
  }
  static updateRefImagesVisibility() {
    const providerKey = document.getElementById("genProvider")?.value || "flow";
    if (providerKey !== "flow") {
      if (_GenTab.refImagesSection)
        _GenTab.refImagesSection.classList.remove("hidden");
      if (_GenTab.videoFramesSection)
        _GenTab.videoFramesSection.classList.add("hidden");
      _GenTab.updateGrokFrameControls();
      return;
    }
    const isVideo = _GenTab.genTypeSelect?.value === "Video";
    const isFrames = _GenTab.videoInputTypeSelect?.value === "Frames";
    if (isVideo && isFrames) {
      if (_GenTab.refImagesSection)
        _GenTab.refImagesSection.classList.add("hidden");
      if (_GenTab.videoFramesSection)
        _GenTab.videoFramesSection.classList.remove("hidden");
      _GenTab._updateFrameMode();
    } else if (isVideo) {
      if (_GenTab.refImagesSection)
        _GenTab.refImagesSection.classList.remove("hidden");
      if (_GenTab.videoFramesSection)
        _GenTab.videoFramesSection.classList.add("hidden");
    } else {
      if (_GenTab.refImagesSection)
        _GenTab.refImagesSection.classList.remove("hidden");
      if (_GenTab.videoFramesSection)
        _GenTab.videoFramesSection.classList.add("hidden");
    }
  }
  static _updateFrameMode() {
    if (_GenTab.providerSelect?.value === "grok") {
      _GenTab.updateGrokFrameControls();
      return;
    }
    const globalConfig = document.getElementById("globalFrameConfig");
    const perPromptContainer = document.getElementById(
      "perPromptFramesContainer",
    );
    if (!globalConfig || !perPromptContainer) return;
    _GenTab._renderFrameSourcePanel();
    _GenTab._bindFrameSlotFileDrop(globalConfig);
    const isMultiPrompt = _GenTab.multiPromptCheck?.checked;
    const promptCount = _GenTab._getPromptCount();
    if (isMultiPrompt && promptCount > 1) {
      globalConfig.classList.add("hidden");
      perPromptContainer.classList.remove("hidden");
      _GenTab._renderPerPromptFrames(promptCount);
    } else {
      globalConfig.classList.remove("hidden");
      perPromptContainer.classList.add("hidden");
    }
  }
  static _getPromptCount() {
    const text = _GenTab.promptsArea?.value?.trim() || "";
    if (!text) return 0;
    if (!_GenTab.multiPromptCheck?.checked) return 1;
    return text.split(/\n\s*\n/).filter((p) => p.trim()).length;
  }
  static _getPromptPreviews() {
    const text = _GenTab.promptsArea?.value?.trim() || "";
    if (!text) return [];
    const prompts = _GenTab.multiPromptCheck?.checked
      ? text.split(/\n\s*\n/).filter((p) => p.trim())
      : [text];
    return prompts.map((p) => p.trim().substring(0, 40).replace(/\n/g, " "));
  }
  static _renderPerPromptFrames(promptCount) {
    const container = document.getElementById("perPromptFramesContainer");
    if (!container) return;
    const previews = _GenTab._getPromptPreviews();
    while (_GenTab._perPromptFrameData.length < promptCount) {
      _GenTab._perPromptFrameData.push({
        frame1: "",
        frame2: "",
        frame1Thumb: "",
        frame2Thumb: "",
      });
    }
    const startIconSvg =
      '<svg class="frame-slot-icon" viewBox="0 0 11 10" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7.5L8.9 7.5C9.46005 7.5 9.74008 7.5 9.95399 7.39101C10.1422 7.29513 10.2951 7.14215 10.391 6.95399C10.5 6.74008 10.5 6.46005 10.5 5.9V4.1C10.5 3.53995 10.5 3.25992 10.391 3.04601C10.2951 2.85785 10.1422 2.70487 9.95399 2.60899C9.74008 2.5 9.46005 2.5 8.9 2.5L5 2.5M3 7.5H2.1C1.53995 7.5 1.25992 7.5 1.04601 7.39101C0.857847 7.29513 0.704867 7.14215 0.608994 6.95399C0.5 6.74008 0.5 6.46005 0.5 5.9V4.1C0.5 3.53995 0.5 3.25992 0.608994 3.04601C0.704867 2.85785 0.857847 2.70487 1.04601 2.60899C1.25992 2.5 1.53995 2.5 2.1 2.5H3M3 0.5L3 9.5M1.75 9.5L4.25 9.5M1.75 0.499996L4.25 0.5"/></svg>';
    const endIconSvg =
      '<svg class="frame-slot-icon" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 3.5H2.6C2.03995 3.5 1.75992 3.5 1.54601 3.60899C1.35785 3.70487 1.20487 3.85785 1.10899 4.04601C1 4.25992 1 4.53995 1 5.1V6.9C1 7.46005 1 7.74008 1.10899 7.95399C1.20487 8.14215 1.35785 8.29513 1.54601 8.39101C1.75992 8.5 2.03995 8.5 2.6 8.5H6.5M8.5 3.5H9.4C9.96005 3.5 10.2401 3.5 10.454 3.60899C10.6422 3.70487 10.7951 3.85785 10.891 4.04601C11 4.25992 11 4.53995 11 5.1V6.9C11 7.46005 11 7.74008 10.891 7.95399C10.7951 8.14215 10.6422 8.29513 10.454 8.39101C10.2401 8.5 9.96005 8.5 9.4 8.5H8.5M8.5 10.5L8.5 1.5M9.75 1.5L7.25 1.5M9.75 10.5L7.25 10.5"/></svg>';
    const dropzoneSvg =
      '<svg class="frame-dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>';
    let html = "";
    for (let idx = 0; idx < promptCount; idx++) {
      const data = _GenTab._perPromptFrameData[idx];
      const preview = previews[idx] || "";
      html += `
        <div class="per-prompt-frame-pair" data-prompt-index="${idx}">
          <div class="per-prompt-frame-header">
            <span class="per-prompt-frame-index">${idx + 1}</span>
            <span class="per-prompt-frame-prompt-preview" title="${this._escapeHtml(preview)}">${this._escapeHtml(preview)}</span>
          </div>
          <div class="per-prompt-frame-slots">
            <div class="frame-slot" data-prompt-idx="${idx}" data-frame-num="1">
              <div class="frame-slot-header">${startIconSvg}<span class="frame-slot-label">${window.I18n?.t("gen.frameStart") || "Start"}</span></div>
              <div class="frame-slot-body" id="ppFrame_${idx}_1_body">
                ${data.frame1 ? _GenTab._buildFrameThumbHtml(idx, 1, data.frame1, data.frame1Thumb) : `<div class="frame-dropzone" data-pp-pick="${idx}_1">${dropzoneSvg}<span class="frame-dropzone-text">${window.I18n?.t("gen.addFrame") || "Add"}</span></div>`}
              </div>
            </div>
            <div class="frame-slot" data-prompt-idx="${idx}" data-frame-num="2">
              <div class="frame-slot-header">${endIconSvg}<span class="frame-slot-label">${window.I18n?.t("gen.frameEnd") || "End"}</span></div>
              <div class="frame-slot-body" id="ppFrame_${idx}_2_body">
                ${data.frame2 ? _GenTab._buildFrameThumbHtml(idx, 2, data.frame2, data.frame2Thumb) : `<div class="frame-dropzone" data-pp-pick="${idx}_2">${dropzoneSvg}<span class="frame-dropzone-text">${window.I18n?.t("gen.addFrame") || "Add"}</span></div>`}
              </div>
            </div>
          </div>
        </div>`;
    }
    container.innerHTML = html;
    container.removeEventListener("click", _GenTab._handlePerPromptFrameClick);
    container.addEventListener("click", _GenTab._handlePerPromptFrameClick);
    container.removeEventListener(
      "dragstart",
      _GenTab._handlePerPromptFrameDragStart,
    );
    container.addEventListener(
      "dragstart",
      _GenTab._handlePerPromptFrameDragStart,
    );
    container.removeEventListener(
      "dragover",
      _GenTab._handlePerPromptFrameDragOver,
    );
    container.addEventListener(
      "dragover",
      _GenTab._handlePerPromptFrameDragOver,
    );
    container.removeEventListener(
      "dragleave",
      _GenTab._handlePerPromptFrameDragLeave,
    );
    container.addEventListener(
      "dragleave",
      _GenTab._handlePerPromptFrameDragLeave,
    );
    container.removeEventListener("drop", _GenTab._handlePerPromptFrameDrop);
    container.addEventListener("drop", _GenTab._handlePerPromptFrameDrop);
    _GenTab._bindFrameSlotFileDrop(container);
  }
  static _renderFrameSourcePanel() {
    const container = document.getElementById("frameSourcePanelContainer");
    if (!container) return;
    const sourceIds = _GenTab._getFrameSourceIds();
    const removeImageLabel = _GenTab._escapeHtml(
      window.I18n?.t("workflow.mediaModal.removeImage") || "Remove image",
    );
    const sourceItems = sourceIds
      .map((fileId, idx) => {
        const thumbnail =
          _GenTab.thumbnailCache?.[fileId] ||
          window.pendingUploadFiles?.get(fileId)?.thumbnail ||
          "";
        const isLocal = String(fileId).startsWith("upload_");
        const isUploading = _GenTab._isRefUploading(fileId);
        const sourceLabel = isLocal
          ? window.I18n?.t("gen.uploadQueued") || "Waiting"
          : "Flow";
        return `<div class="ref-thumb frame-source-thumb ${isLocal ? "ref-thumb-pending is-local" : "is-flow"} ${isUploading ? "ref-thumb-uploading" : ""}" draggable="true" data-frame-source-id="${_GenTab._escapeHtml(fileId)}" data-index="${idx + 1}" title="${sourceLabel} \xB7 #${idx + 1}">
        <div class="ref-thumb-inner frame-source-thumb-inner">${thumbnail ? `<img src="${_GenTab._escapeHtml(thumbnail)}" alt="Source ${idx + 1}" loading="lazy" />` : `<span>${_GenTab._escapeHtml(fileId.substring(0, 8))}</span>`}
          <span class="ref-thumb-badge ${isLocal ? "" : "frame-source-flow-badge"}">${sourceLabel}</span>
        </div>
        <button type="button" class="frame-source-remove" data-frame-source-remove="${_GenTab._escapeHtml(fileId)}" data-tooltip="${removeImageLabel}" aria-label="${removeImageLabel}">\xD7</button>
      </div>`;
      })
      .join("");
    container.innerHTML = `<div class="frame-source-panel">
      <div class="frame-source-head">
        <span>${window.I18n?.t("gen.refImages") || "Source images"} (${sourceIds.length})</span>
      </div>
      <button type="button" class="ref-btn-upload ref-btn-upload--wide frame-source-dropzone" data-frame-source-pick data-frame-source-drop>
        <svg class="ref-btn-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 8h.01"></path><path d="M12.5 21h-6.5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v6.5"></path>
          <path d="M3 16l5-5c.928-.893 2.072-.893 3 0l3.5 3.5"></path><path d="M19 22v-6"></path><path d="M22 19l-3-3-3 3"></path>
        </svg>
        <span class="ref-btn-text">${window.I18n?.t("gen.selectUploadImage") || "Select image / Drag here"}</span>
      </button>
      ${
        sourceIds.length >= 2
          ? `<div class="frame-source-sort-hint ref-drag-hint">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="5 9 2 12 5 15"></polyline><polyline points="9 5 12 2 15 5"></polyline>
          <polyline points="15 19 12 22 9 19"></polyline><polyline points="19 9 22 12 19 15"></polyline>
          <line x1="2" y1="12" x2="22" y2="12"></line><line x1="12" y1="2" x2="12" y2="22"></line>
        </svg>
        <span>${window.I18n?.t("gen.dragToSort") || "Drag to reorder"}</span>
      </div>`
          : ""
      }
      ${sourceIds.length > 0 ? `<div class="frame-source-list">${sourceItems}</div>` : ""}
      ${
        sourceIds.length > 0
          ? `<div class="frame-source-actions">
        <button type="button" data-frame-bulk="start">
          <svg class="frame-slot-icon" viewBox="0 0 11 10" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7.5L8.9 7.5C9.46005 7.5 9.74008 7.5 9.95399 7.39101C10.1422 7.29513 10.2951 7.14215 10.391 6.95399C10.5 6.74008 10.5 6.46005 10.5 5.9V4.1C10.5 3.53995 10.5 3.25992 10.391 3.04601C10.2951 2.85785 10.1422 2.70487 9.95399 2.60899C9.74008 2.5 9.46005 2.5 8.9 2.5L5 2.5M3 7.5H2.1C1.53995 7.5 1.25992 7.5 1.04601 7.39101C0.857847 7.29513 0.704867 7.14215 0.608994 6.95399C0.5 6.74008 0.5 6.46005 0.5 5.9V4.1C0.5 3.53995 0.5 3.25992 0.608994 3.04601C0.704867 2.85785 0.857847 2.70487 1.04601 2.60899C1.25992 2.5 1.53995 2.5 2.1 2.5H3M3 0.5L3 9.5M1.75 9.5L4.25 9.5M1.75 0.499996L4.25 0.5"></path></svg>
          <span>${window.I18n?.t("gen.frameAssignStart") || "Assign to Start"}</span>
        </button>
        <button type="button" data-frame-bulk="pairs">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="5" width="7" height="6" rx="1"></rect><rect x="14.5" y="5" width="7" height="6" rx="1"></rect><path d="M9.5 8h5"></path><rect x="2.5" y="15" width="7" height="6" rx="1"></rect><rect x="14.5" y="15" width="7" height="6" rx="1"></rect><path d="M9.5 18h5"></path></svg>
          <span>${window.I18n?.t("gen.frameAssignPairs") || "Assign pairs"}</span>
        </button>
        <button type="button" data-frame-bulk="chain">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="6" height="6" rx="1"></rect><rect x="15" y="13" width="6" height="6" rx="1"></rect><path d="M9 8h4a4 4 0 0 1 4 4v1"></path><path d="m14 11 3 3 3-3"></path></svg>
          <span>${window.I18n?.t("gen.frameBuildChain") || "Build A \u2192 B chain"}</span>
        </button>
        <button type="button" data-frame-bulk="clear">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16"></path><path d="m9 7 1-2h4l1 2"></path><path d="m6 7 1 13h10l1-13"></path><path d="M10 11v5M14 11v5"></path></svg>
          <span>${window.I18n?.t("common.clear") || "Clear frames"}</span>
        </button>
      </div>`
          : ""
      }
    </div>`;
    container.removeEventListener("click", _GenTab._handlePerPromptFrameClick);
    container.addEventListener("click", _GenTab._handlePerPromptFrameClick);
    container.removeEventListener(
      "dragstart",
      _GenTab._handlePerPromptFrameDragStart,
    );
    container.addEventListener(
      "dragstart",
      _GenTab._handlePerPromptFrameDragStart,
    );
    container.removeEventListener(
      "dragend",
      _GenTab._handlePerPromptFrameDragEnd,
    );
    container.addEventListener("dragend", _GenTab._handlePerPromptFrameDragEnd);
    container.removeEventListener(
      "dragover",
      _GenTab._handlePerPromptFrameDragOver,
    );
    container.addEventListener(
      "dragover",
      _GenTab._handlePerPromptFrameDragOver,
    );
    container.removeEventListener(
      "dragleave",
      _GenTab._handlePerPromptFrameDragLeave,
    );
    container.addEventListener(
      "dragleave",
      _GenTab._handlePerPromptFrameDragLeave,
    );
    container.removeEventListener("drop", _GenTab._handlePerPromptFrameDrop);
    container.addEventListener("drop", _GenTab._handlePerPromptFrameDrop);
    container.removeEventListener(
      "dragover",
      _GenTab._handleFrameSourceFileDragOver,
    );
    container.addEventListener(
      "dragover",
      _GenTab._handleFrameSourceFileDragOver,
    );
    container.removeEventListener(
      "dragleave",
      _GenTab._handleFrameSourceFileDragLeave,
    );
    container.addEventListener(
      "dragleave",
      _GenTab._handleFrameSourceFileDragLeave,
    );
    container.removeEventListener("drop", _GenTab._handleFrameSourceFileDrop);
    container.addEventListener("drop", _GenTab._handleFrameSourceFileDrop);
  }
  static _handleFrameSourceFileDragOver(e) {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    const dropzone =
      e.target.closest("[data-frame-source-drop]") ||
      e.currentTarget.querySelector("[data-frame-source-drop]");
    if (!dropzone) return;
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add("drag-over");
  }
  static _handleFrameSourceFileDragLeave(e) {
    if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return;
    e.currentTarget
      .querySelector("[data-frame-source-drop]")
      ?.classList.remove("drag-over");
  }
  static _handleFrameSourceFileDrop(e) {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget
      .querySelector("[data-frame-source-drop]")
      ?.classList.remove("drag-over");
    const images = Array.from(e.dataTransfer.files).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (images.length === 0) return;
    _GenTab._handleDroppedFiles(images);
  }
  static _bindFrameSlotFileDrop(container) {
    if (!container) return;
    container.removeEventListener(
      "dragover",
      _GenTab._handleFrameSlotFileDragOver,
    );
    container.addEventListener(
      "dragover",
      _GenTab._handleFrameSlotFileDragOver,
    );
    container.removeEventListener(
      "dragleave",
      _GenTab._handleFrameSlotFileDragLeave,
    );
    container.addEventListener(
      "dragleave",
      _GenTab._handleFrameSlotFileDragLeave,
    );
    container.removeEventListener("drop", _GenTab._handleFrameSlotFileDrop);
    container.addEventListener("drop", _GenTab._handleFrameSlotFileDrop);
  }
  static _isEmptyFrameSlot(slot) {
    if (!slot) return false;
    if (slot.id === "genTabFrame1Slot")
      return !document.getElementById("genTabFrame1FileId")?.value;
    if (slot.id === "genTabFrame2Slot")
      return !document.getElementById("genTabFrame2FileId")?.value;
    const promptIdx = Number(slot.dataset.promptIdx);
    const frameNum = Number(slot.dataset.frameNum);
    if (!Number.isInteger(promptIdx) || (frameNum !== 1 && frameNum !== 2))
      return false;
    const data = _GenTab._perPromptFrameData[promptIdx];
    return frameNum === 1 ? !data?.frame1 : !data?.frame2;
  }
  static _handleFrameSlotFileDragOver(e) {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    const slot = e.target.closest(".frame-slot");
    if (!_GenTab._isEmptyFrameSlot(slot)) return;
    e.preventDefault();
    slot.classList.add("frame-drag-over");
  }
  static _handleFrameSlotFileDragLeave(e) {
    const slot = e.target.closest(".frame-slot");
    if (slot && (!e.relatedTarget || !slot.contains(e.relatedTarget)))
      slot.classList.remove("frame-drag-over");
  }
  static async _handleFrameSlotFileDrop(e) {
    if (!e.dataTransfer?.files?.length) return;
    const slot = e.target.closest(".frame-slot");
    if (!_GenTab._isEmptyFrameSlot(slot)) return;
    const file = Array.from(e.dataTransfer.files).find((item) =>
      item.type.startsWith("image/"),
    );
    if (!file) return;
    e.preventDefault();
    e.stopPropagation();
    slot.classList.remove("frame-drag-over");
    const addedIds = await _GenTab._handleDroppedFiles([file]);
    const fileId = addedIds?.[0];
    if (!fileId) return;
    const thumbnail =
      _GenTab.thumbnailCache?.[fileId] ||
      window.pendingUploadFiles?.get(fileId)?.thumbnail ||
      "";
    if (slot.id === "genTabFrame1Slot" || slot.id === "genTabFrame2Slot") {
      const frameNum2 = slot.id === "genTabFrame1Slot" ? 1 : 2;
      if (!_GenTab._frameUploadKeys) _GenTab._frameUploadKeys = new Map();
      _GenTab._frameUploadKeys.set(fileId, frameNum2);
      _GenTab._setFrameImage(frameNum2, fileId, thumbnail);
      return;
    }
    const promptIdx = Number(slot.dataset.promptIdx);
    const frameNum = Number(slot.dataset.frameNum);
    _GenTab._trackPerPromptFrameUpload(fileId);
    _GenTab._setPerPromptFrame(promptIdx, frameNum, fileId, thumbnail);
  }
  static _getFrameSourceIds() {
    return (_GenTab.fileIdsInput?.value || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  static _registerFrameSource(fileId, image = {}) {
    if (!fileId || !_GenTab.fileIdsInput) return;
    const thumbnail =
      image.thumbnail ||
      image.thumbnail_url ||
      _GenTab.thumbnailCache?.[fileId] ||
      "";
    if (thumbnail) _GenTab.thumbnailCache[fileId] = thumbnail;
    if (image.file_name) _GenTab.fileNameCache[fileId] = image.file_name;
    const displayName = String(
      image.name || image.file_name || image.file?.name || "",
    ).replace(/\.[^/.]+$/, "");
    if (displayName && !_GenTab.refImageNames[fileId])
      _GenTab.refImageNames[fileId] = displayName;
    _GenTab.refMediaTypes = _GenTab.refMediaTypes || {};
    _GenTab.refMediaTypes[fileId] = "image";
    const ids = _GenTab._getFrameSourceIds();
    if (!ids.includes(fileId)) {
      ids.push(fileId);
      _GenTab.fileIdsInput.value = ids.join(", ");
      _GenTab.fileIdsInput.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      _GenTab._renderFrameSourcePanel();
    }
  }
  static _removeFrameSource(fileId) {
    if (!fileId) return;
    for (let i = 0; i < _GenTab._perPromptFrameData.length; i++) {
      const data = _GenTab._perPromptFrameData[i];
      if (data?.frame1 === fileId) _GenTab._setPerPromptFrame(i, 1, "", "");
      if (data?.frame2 === fileId) _GenTab._setPerPromptFrame(i, 2, "", "");
    }
    if (document.getElementById("genTabFrame1FileId")?.value === fileId)
      _GenTab._setFrameImage(1, "", "");
    if (document.getElementById("genTabFrame2FileId")?.value === fileId)
      _GenTab._setFrameImage(2, "", "");
    _GenTab._removeRefImage(fileId);
  }
  static _assignFrameSources(mode) {
    const ids = _GenTab._getFrameSourceIds();
    const promptCount = _GenTab._getPromptCount();
    const isMulti = _GenTab.multiPromptCheck?.checked && promptCount > 1;
    if (!isMulti) {
      if (mode === "clear") {
        _GenTab._setFrameImage(1, "", "");
        _GenTab._setFrameImage(2, "", "");
      } else if (mode === "start" && ids[0]) {
        const thumb =
          _GenTab.thumbnailCache?.[ids[0]] ||
          window.pendingUploadFiles?.get(ids[0])?.thumbnail ||
          "";
        _GenTab._setFrameImage(1, ids[0], thumb);
        if (ids[0].startsWith("upload_")) {
          if (!_GenTab._frameUploadKeys) _GenTab._frameUploadKeys = new Map();
          _GenTab._frameUploadKeys.set(ids[0], 1);
        }
      } else if ((mode === "chain" || mode === "pairs") && ids[0]) {
        const endId = ids[1] || "";
        _GenTab._setFrameImage(
          1,
          ids[0],
          _GenTab.thumbnailCache?.[ids[0]] ||
            window.pendingUploadFiles?.get(ids[0])?.thumbnail ||
            "",
        );
        _GenTab._setFrameImage(
          2,
          endId,
          _GenTab.thumbnailCache?.[endId] ||
            window.pendingUploadFiles?.get(endId)?.thumbnail ||
            "",
        );
        if (!_GenTab._frameUploadKeys) _GenTab._frameUploadKeys = new Map();
        if (ids[0].startsWith("upload_"))
          _GenTab._frameUploadKeys.set(ids[0], 1);
        if (endId.startsWith("upload_")) _GenTab._frameUploadKeys.set(endId, 2);
      }
      _GenTab.saveState?.();
      return;
    }
    while (_GenTab._perPromptFrameData.length < promptCount) {
      _GenTab._perPromptFrameData.push({
        frame1: "",
        frame2: "",
        frame1Thumb: "",
        frame2Thumb: "",
      });
    }
    if (mode === "clear") {
      for (let i = 0; i < promptCount; i++) {
        _GenTab._perPromptFrameData[i] = {
          frame1: "",
          frame2: "",
          frame1Thumb: "",
          frame2Thumb: "",
        };
      }
    } else if (mode === "start") {
      for (let i = 0; i < promptCount && i < ids.length; i++) {
        const data = _GenTab._perPromptFrameData[i];
        if (!data.frame1) {
          data.frame1 = ids[i];
          data.frame1Thumb =
            _GenTab.thumbnailCache?.[ids[i]] ||
            window.pendingUploadFiles?.get(ids[i])?.thumbnail ||
            "";
          _GenTab._trackPerPromptFrameUpload(ids[i]);
        }
      }
    } else if (mode === "chain") {
      for (let i = 0; i < promptCount && i + 1 < ids.length; i++) {
        const data = _GenTab._perPromptFrameData[i];
        if (!data.frame1) {
          data.frame1 = ids[i];
          data.frame1Thumb =
            _GenTab.thumbnailCache?.[ids[i]] ||
            window.pendingUploadFiles?.get(ids[i])?.thumbnail ||
            "";
        }
        if (!data.frame2) {
          data.frame2 = ids[i + 1];
          data.frame2Thumb =
            _GenTab.thumbnailCache?.[ids[i + 1]] ||
            window.pendingUploadFiles?.get(ids[i + 1])?.thumbnail ||
            "";
        }
        _GenTab._trackPerPromptFrameUpload(data.frame1);
        _GenTab._trackPerPromptFrameUpload(data.frame2);
      }
    } else if (mode === "pairs") {
      for (let i = 0; i < promptCount && i * 2 < ids.length; i++) {
        const data = _GenTab._perPromptFrameData[i];
        const startId = ids[i * 2];
        const endId = ids[i * 2 + 1] || "";
        if (!data.frame1) {
          data.frame1 = startId;
          data.frame1Thumb =
            _GenTab.thumbnailCache?.[startId] ||
            window.pendingUploadFiles?.get(startId)?.thumbnail ||
            "";
        }
        if (!data.frame2 && endId) {
          data.frame2 = endId;
          data.frame2Thumb =
            _GenTab.thumbnailCache?.[endId] ||
            window.pendingUploadFiles?.get(endId)?.thumbnail ||
            "";
        }
        _GenTab._trackPerPromptFrameUpload(data.frame1);
        _GenTab._trackPerPromptFrameUpload(data.frame2);
      }
    }
    _GenTab._renderPerPromptFrames(promptCount);
    _GenTab.saveState?.();
  }
  static _trackPerPromptFrameUpload(fileId) {
    if (String(fileId || "").startsWith("upload_"))
      _GenTab._perPromptFrameUploadKeys.set(fileId, true);
  }
  static _replacePerPromptFrameId(oldId, newId, thumbnail = "") {
    if (!oldId || !newId || oldId === newId) return;
    for (const frameData of _GenTab._perPromptFrameData) {
      if (frameData.frame1 === oldId) {
        frameData.frame1 = newId;
        if (thumbnail) frameData.frame1Thumb = thumbnail;
      }
      if (frameData.frame2 === oldId) {
        frameData.frame2 = newId;
        if (thumbnail) frameData.frame2Thumb = thumbnail;
      }
    }
    _GenTab._perPromptFrameUploadKeys.delete(oldId);
  }
  static _getMissingStartFrameIndexes(promptCount, genType) {
    if (genType !== "Video" || _GenTab.videoInputTypeSelect?.value !== "Frames")
      return [];
    if (_GenTab.multiPromptCheck?.checked && promptCount > 1) {
      const missing = [];
      for (let i = 0; i < promptCount; i++) {
        if (!_GenTab._perPromptFrameData[i]?.frame1) missing.push(i);
      }
      return missing;
    }
    return document.getElementById("genTabFrame1FileId")?.value?.trim()
      ? []
      : [0];
  }
  static _markMissingStartFrames(indexes) {
    const wanted = new Set(indexes);
    document.querySelectorAll(".per-prompt-frame-pair").forEach((el) => {
      el.classList.toggle(
        "frame-pair-missing",
        wanted.has(Number(el.dataset.promptIndex)),
      );
    });
    document
      .getElementById("genTabFrame1Slot")
      ?.classList.toggle("frame-pair-missing", wanted.has(0));
  }
  static _escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  static _buildFrameThumbHtml(promptIdx, frameNum, fileId, thumbnail) {
    const isPending = fileId.startsWith("upload_");
    const isUploading = _GenTab._isRefUploading(fileId);
    const thumbSrc =
      thumbnail ||
      _GenTab.thumbnailCache?.[fileId] ||
      window.pendingUploadFiles?.get(fileId)?.thumbnail ||
      "";
    const removeImageLabel = _GenTab._escapeHtml(
      window.I18n?.t("workflow.mediaModal.removeImage") || "Remove image",
    );
    const queuedLabel = _GenTab._escapeHtml(
      window.I18n?.t("gen.uploadQueued") || "Waiting",
    );
    return `
      <div class="frame-thumb-wrap ${isUploading ? "uploading" : ""}" draggable="true" data-file-id="${fileId}" data-pp-pick="${promptIdx}_${frameNum}">
        ${thumbSrc ? `<img src="${thumbSrc}" alt="Frame ${frameNum}" />` : `<div class="frame-thumb-fallback">${fileId.substring(0, 12)}</div>`}
        ${isPending && !isUploading ? `<span class="frame-upload-status">${queuedLabel}</span>` : ""}
        <div class="ref-thumb-remove" data-pp-remove="${promptIdx}_${frameNum}" data-tooltip="${removeImageLabel}" aria-label="${removeImageLabel}">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </div>
      </div>`;
  }
  static _handlePerPromptFrameClick(e) {
    const sourceRemove = e.target.closest("[data-frame-source-remove]");
    if (sourceRemove) {
      e.stopPropagation();
      _GenTab._removeFrameSource(sourceRemove.dataset.frameSourceRemove);
      return;
    }
    const bulkBtn = e.target.closest("[data-frame-bulk]");
    if (bulkBtn) {
      _GenTab._assignFrameSources(bulkBtn.dataset.frameBulk);
      return;
    }
    if (e.target.closest("[data-frame-source-pick]")) {
      _GenTab._frameSourcePickerRequested = true;
      document.getElementById("openImagePickerBtn")?.click();
      return;
    }
    const removeBtn = e.target.closest("[data-pp-remove]");
    if (removeBtn) {
      e.stopPropagation();
      const [idx, fnum] = removeBtn.dataset.ppRemove.split("_").map(Number);
      _GenTab._setPerPromptFrame(idx, fnum, "", "");
      return;
    }
    const pickEl = e.target.closest("[data-pp-pick]");
    if (pickEl) {
      const [idx, fnum] = pickEl.dataset.ppPick.split("_").map(Number);
      _GenTab._openPerPromptFramePicker(idx, fnum);
    }
  }
  static _handlePerPromptFrameDragStart(e) {
    const source = e.target.closest(
      "[data-frame-source-id], .frame-thumb-wrap[data-file-id]",
    );
    if (!source) return;
    const fileId = source.dataset.frameSourceId || source.dataset.fileId;
    if (!fileId) return;
    e.dataTransfer.effectAllowed = "copyMove";
    e.dataTransfer.setData("application/x-toby-frame-id", fileId);
    e.dataTransfer.setData("text/plain", fileId);
    source.classList.add("dragging");
  }
  static _handlePerPromptFrameDragEnd(e) {
    e.target
      .closest("[data-frame-source-id], .frame-thumb-wrap[data-file-id]")
      ?.classList.remove("dragging");
    document
      .querySelectorAll(".frame-drag-over")
      .forEach((el) => el.classList.remove("frame-drag-over"));
  }
  static _handlePerPromptFrameDragOver(e) {
    const target = e.target.closest(".frame-slot, .frame-source-thumb");
    if (!target) return;
    e.preventDefault();
    target.classList.add("frame-drag-over");
  }
  static _handlePerPromptFrameDragLeave(e) {
    e.target
      .closest(".frame-slot, .frame-source-thumb")
      ?.classList.remove("frame-drag-over");
  }
  static _handlePerPromptFrameDrop(e) {
    const target = e.target.closest(".frame-slot, .frame-source-thumb");
    if (!target) return;
    e.preventDefault();
    target.classList.remove("frame-drag-over");
    const fileId =
      e.dataTransfer.getData("application/x-toby-frame-id") ||
      e.dataTransfer.getData("text/plain");
    if (!fileId) return;
    if (target.classList.contains("frame-source-thumb")) {
      const targetId = target.dataset.frameSourceId;
      if (
        targetId &&
        targetId !== fileId &&
        _GenTab._getFrameSourceIds().includes(fileId)
      ) {
        _GenTab._reorderFileIds(fileId, targetId);
        _GenTab._renderFrameSourcePanel();
        _GenTab._renderPerPromptFrames(_GenTab._getPromptCount());
      }
      return;
    }
    const promptIdx = Number(target.dataset.promptIdx);
    const frameNum = Number(target.dataset.frameNum);
    if (!Number.isInteger(promptIdx) || (frameNum !== 1 && frameNum !== 2))
      return;
    const thumb =
      _GenTab.thumbnailCache?.[fileId] ||
      window.pendingUploadFiles?.get(fileId)?.thumbnail ||
      "";
    _GenTab._trackPerPromptFrameUpload(fileId);
    _GenTab._setPerPromptFrame(promptIdx, frameNum, fileId, thumb);
  }
  static _openPerPromptFramePicker(promptIdx, frameNum) {
    if (!window.imagePickerModal) return;
    const data = _GenTab._perPromptFrameData[promptIdx];
    if (!data) return;
    const existingId = frameNum === 1 ? data.frame1 : data.frame2;
    window.imagePickerModal.open({
      existingFileIds: existingId ? [existingId] : [],
      singleSelect: true,
      mediaFilter: "image",
      onConfirm: async (images) => {
        if (images.length > 0) {
          const img = images[0];
          if (img.source === "upload" && img.file) {
            const key =
              img.fileId ||
              `upload_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            if (!window.pendingUploadFiles)
              window.pendingUploadFiles = new Map();
            window.pendingUploadFiles.set(key, {
              file: img.file,
              thumbnail: img.thumbnail,
            });
            _GenTab._trackPerPromptFrameUpload(key);
            img.fileId = key;
          } else if (
            img.source === "album" &&
            window.ImagePickerModal?.prepareAlbumImageForRef
          ) {
            try {
              const prepared =
                await window.ImagePickerModal.prepareAlbumImageForRef(img);
              if (prepared) {
                const key = prepared.key;
                if (!_GenTab.thumbnailCache) _GenTab.thumbnailCache = {};
                if (img.thumbnail_url) {
                  _GenTab.thumbnailCache[key] = img.thumbnail_url;
                } else if (img.album_image_id && window.ImageStore) {
                  try {
                    const blobUrl = await window.ImageStore.getThumbnail(
                      img.album_image_id,
                    );
                    if (blobUrl) _GenTab.thumbnailCache[key] = blobUrl;
                  } catch (e) {}
                } else if (img.thumbnail) {
                  _GenTab.thumbnailCache[key] = img.thumbnail;
                }
                if (prepared.file_name) {
                  if (!_GenTab.fileNameCache) _GenTab.fileNameCache = {};
                  _GenTab.fileNameCache[key] = prepared.file_name;
                }
                if (key.startsWith("upload_")) {
                  _GenTab._trackPerPromptFrameUpload(key);
                }
                img.fileId = key;
                img.thumbnail = _GenTab.thumbnailCache[key] || img.thumbnail;
              }
            } catch (err) {
              console.error(
                "[GenTab] L\u1ED7i chu\u1EA9n b\u1ECB \u1EA3nh album cho per-prompt frame:",
                err,
              );
            }
          } else {
            if (img.fileId && img.file_name) {
              if (!_GenTab.fileNameCache) _GenTab.fileNameCache = {};
              _GenTab.fileNameCache[img.fileId] = img.file_name;
            }
            if (img.fileId && img.thumbnail) {
              if (!_GenTab.thumbnailCache) _GenTab.thumbnailCache = {};
              _GenTab.thumbnailCache[img.fileId] = img.thumbnail;
            }
          }
          _GenTab._registerFrameSource(img.fileId, img);
          _GenTab._setPerPromptFrame(
            promptIdx,
            frameNum,
            img.fileId,
            img.thumbnail,
          );
        }
      },
    });
  }
  static _setPerPromptFrame(promptIdx, frameNum, fileId, thumbnail) {
    while (_GenTab._perPromptFrameData.length <= promptIdx) {
      _GenTab._perPromptFrameData.push({
        frame1: "",
        frame2: "",
        frame1Thumb: "",
        frame2Thumb: "",
      });
    }
    const data = _GenTab._perPromptFrameData[promptIdx];
    if (frameNum === 1) {
      data.frame1 = fileId || "";
      data.frame1Thumb = thumbnail || "";
    } else {
      data.frame2 = fileId || "";
      data.frame2Thumb = thumbnail || "";
    }
    if (fileId && thumbnail) {
      if (!_GenTab.thumbnailCache) _GenTab.thumbnailCache = {};
      _GenTab.thumbnailCache[fileId] = thumbnail;
    }
    const body = document.getElementById(
      `ppFrame_${promptIdx}_${frameNum}_body`,
    );
    const slot = body?.closest(".frame-slot");
    if (body) {
      if (fileId) {
        slot?.classList.add("has-image");
        body.innerHTML = _GenTab._buildFrameThumbHtml(
          promptIdx,
          frameNum,
          fileId,
          thumbnail,
        );
      } else {
        slot?.classList.remove("has-image");
        const dropzoneSvg =
          '<svg class="frame-dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>';
        body.innerHTML = `<div class="frame-dropzone" data-pp-pick="${promptIdx}_${frameNum}">${dropzoneSvg}<span class="frame-dropzone-text">${window.I18n?.t("gen.addFrame") || "Add"}</span></div>`;
      }
    }
    _GenTab.saveState?.();
  }
  static _handlePerPromptFrameUploadCompleted(data) {
    if (!data?.key || !data?.tile_id) return;
    if (!_GenTab._perPromptFrameUploadKeys.has(data.key)) return;
    _GenTab._perPromptFrameUploadKeys.delete(data.key);
    _GenTab._replacePerPromptFrameId(
      data.key,
      data.tile_id,
      data.thumbnail_url || "",
    );
    if (_GenTab.thumbnailCache?.[data.key]) {
      _GenTab.thumbnailCache[data.tile_id] = _GenTab.thumbnailCache[data.key];
      delete _GenTab.thumbnailCache[data.key];
    }
    if (data.thumbnail_url) {
      if (!_GenTab.thumbnailCache) _GenTab.thumbnailCache = {};
      _GenTab.thumbnailCache[data.tile_id] = data.thumbnail_url;
    }
    if (data.file_name) {
      if (!_GenTab.fileNameCache) _GenTab.fileNameCache = {};
      _GenTab.fileNameCache[data.tile_id] = data.file_name;
    }
    window.pendingUploadFiles?.delete(data.key);
    if (window.ImmediateUploader) ImmediateUploader.clearResult?.(data.key);
    _GenTab._renderPerPromptFrames(_GenTab._getPromptCount());
    _GenTab._renderFrameSourcePanel();
  }
  static _handlePerPromptFrameUploadFailed(data) {
    if (!data?.key) return;
    if (!_GenTab._perPromptFrameUploadKeys.has(data.key)) return;
    _GenTab._perPromptFrameUploadKeys.delete(data.key);
    _GenTab._renderPerPromptFrames(_GenTab._getPromptCount());
    _GenTab._renderFrameSourcePanel();
  }
  static _initFramePickButtons() {
    const frame1PickBtn = document.getElementById("genTabFrame1PickBtn");
    const frame2PickBtn = document.getElementById("genTabFrame2PickBtn");
    if (frame1PickBtn) {
      frame1PickBtn.addEventListener("click", () => {
        _GenTab._openFramePicker(1);
      });
    }
    if (frame2PickBtn) {
      frame2PickBtn.addEventListener("click", () => {
        _GenTab._openFramePicker(2);
      });
    }
  }
  static _openFramePicker(frameNum) {
    if (!window.imagePickerModal) return;
    const existingId =
      document.getElementById(`genTabFrame${frameNum}FileId`)?.value?.trim() ||
      "";
    window.imagePickerModal.open({
      existingFileIds: existingId ? [existingId] : [],
      singleSelect: true,
      mediaFilter: "image",
      onConfirm: async (images) => {
        if (images.length > 0) {
          const img = images[0];
          if (img.source === "upload" && img.file) {
            const key =
              img.fileId ||
              `upload_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            if (!window.pendingUploadFiles)
              window.pendingUploadFiles = new Map();
            window.pendingUploadFiles.set(key, {
              file: img.file,
              thumbnail: img.thumbnail,
            });
            if (!_GenTab._frameUploadKeys) _GenTab._frameUploadKeys = new Map();
            _GenTab._frameUploadKeys.set(key, frameNum);
            img.fileId = key;
          } else if (
            img.source === "album" &&
            window.ImagePickerModal?.prepareAlbumImageForRef
          ) {
            try {
              const prepared =
                await window.ImagePickerModal.prepareAlbumImageForRef(img);
              if (prepared) {
                const key = prepared.key;
                if (!_GenTab.thumbnailCache) _GenTab.thumbnailCache = {};
                if (img.thumbnail_url) {
                  _GenTab.thumbnailCache[key] = img.thumbnail_url;
                } else if (img.album_image_id && window.ImageStore) {
                  try {
                    const blobUrl = await window.ImageStore.getThumbnail(
                      img.album_image_id,
                    );
                    if (blobUrl) _GenTab.thumbnailCache[key] = blobUrl;
                  } catch (e) {}
                } else if (img.thumbnail) {
                  _GenTab.thumbnailCache[key] = img.thumbnail;
                }
                if (prepared.file_name) {
                  if (!_GenTab.fileNameCache) _GenTab.fileNameCache = {};
                  _GenTab.fileNameCache[key] = prepared.file_name;
                }
                if (key.startsWith("upload_")) {
                  if (!_GenTab._frameUploadKeys)
                    _GenTab._frameUploadKeys = new Map();
                  _GenTab._frameUploadKeys.set(key, frameNum);
                }
                img.fileId = key;
                img.thumbnail = _GenTab.thumbnailCache[key] || img.thumbnail;
              }
            } catch (err) {
              console.error(
                "[GenTab] L\u1ED7i chu\u1EA9n b\u1ECB \u1EA3nh album cho frame:",
                err,
              );
            }
          } else {
            if (img.fileId && img.file_name) {
              if (!_GenTab.fileNameCache) _GenTab.fileNameCache = {};
              _GenTab.fileNameCache[img.fileId] = img.file_name;
            }
            if (img.fileId && img.thumbnail) {
              if (!_GenTab.thumbnailCache) _GenTab.thumbnailCache = {};
              _GenTab.thumbnailCache[img.fileId] = img.thumbnail;
            }
          }
          _GenTab._registerFrameSource(img.fileId, img);
          _GenTab._setFrameImage(frameNum, img.fileId, img.thumbnail);
        }
      },
    });
  }
  static _handleFrameUploadCompleted(data) {
    if (!data?.key || !data?.tile_id) return;
    if (!_GenTab._frameUploadKeys?.has(data.key)) return;
    const frameNum = _GenTab._frameUploadKeys.get(data.key);
    _GenTab._frameUploadKeys.delete(data.key);
    const input = document.getElementById(`genTabFrame${frameNum}FileId`);
    if (input && input.value === data.key) {
      input.value = data.tile_id;
    }
    if (_GenTab.thumbnailCache?.[data.key]) {
      _GenTab.thumbnailCache[data.tile_id] = _GenTab.thumbnailCache[data.key];
      delete _GenTab.thumbnailCache[data.key];
    }
    if (data.thumbnail_url) {
      if (!_GenTab.thumbnailCache) _GenTab.thumbnailCache = {};
      _GenTab.thumbnailCache[data.tile_id] = data.thumbnail_url;
    }
    if (data.file_name) {
      if (!_GenTab.fileNameCache) _GenTab.fileNameCache = {};
      _GenTab.fileNameCache[data.tile_id] = data.file_name;
    }
    window.pendingUploadFiles?.delete(data.key);
    if (window.ImmediateUploader) ImmediateUploader.clearResult?.(data.key);
    const thumb =
      _GenTab.thumbnailCache?.[data.tile_id] || data.thumbnail_url || "";
    _GenTab._setFrameImage(frameNum, data.tile_id, thumb);
  }
  static _handleFrameUploadFailed(data) {
    if (!data?.key) return;
    if (!_GenTab._frameUploadKeys?.has(data.key)) return;
    const frameNum = _GenTab._frameUploadKeys.get(data.key);
    _GenTab._frameUploadKeys.delete(data.key);
    const fileId =
      document.getElementById(`genTabFrame${frameNum}FileId`)?.value?.trim() ||
      "";
    if (fileId) {
      _GenTab._setFrameImage(
        frameNum,
        fileId,
        _GenTab.thumbnailCache?.[fileId] || "",
      );
    }
  }
  static _setFrameImage(frameNum, fileId, thumbnail) {
    const input = document.getElementById(`genTabFrame${frameNum}FileId`);
    const body = document.getElementById(`genTabFrame${frameNum}Body`);
    const slot = document.getElementById(`genTabFrame${frameNum}Slot`);
    if (input) input.value = fileId || "";
    if (fileId && thumbnail) {
      if (!_GenTab.thumbnailCache) _GenTab.thumbnailCache = {};
      _GenTab.thumbnailCache[fileId] = thumbnail;
    }
    if (body) {
      if (fileId) {
        const isPending = fileId.startsWith("upload_");
        const isUploading = _GenTab._isRefUploading(fileId);
        const thumbSrc =
          thumbnail ||
          _GenTab.thumbnailCache?.[fileId] ||
          window.pendingUploadFiles?.get(fileId)?.thumbnail ||
          "";
        slot?.classList.add("has-image");
        const removeImageLabel = _GenTab._escapeHtml(
          window.I18n?.t("workflow.mediaModal.removeImage") || "Remove image",
        );
        const queuedLabel = _GenTab._escapeHtml(
          window.I18n?.t("gen.uploadQueued") || "Waiting",
        );
        body.innerHTML = `
          <div class="frame-thumb-wrap ${isUploading ? "uploading" : ""}" data-file-id="${fileId}">
            ${thumbSrc ? `<img src="${thumbSrc}" alt="Frame ${frameNum}" />` : `<div class="frame-thumb-fallback">${fileId.substring(0, 12)}</div>`}
            ${isPending && !isUploading ? `<span class="frame-upload-status">${queuedLabel}</span>` : ""}
            <div class="ref-thumb-remove" data-tooltip="${removeImageLabel}" aria-label="${removeImageLabel}">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </div>
          </div>`;
        body
          .querySelector(".ref-thumb-remove")
          ?.addEventListener("click", (e) => {
            e.stopPropagation();
            if (isPending && window.ImmediateUploader)
              ImmediateUploader.cancel(fileId);
            _GenTab._frameUploadKeys?.delete(fileId);
            _GenTab._setFrameImage(frameNum, "", "");
          });
        body
          .querySelector(".frame-thumb-wrap")
          ?.addEventListener("click", (e) => {
            if (e.target.closest(".ref-thumb-remove")) return;
            _GenTab._openFramePicker(frameNum);
          });
      } else {
        slot?.classList.remove("has-image");
        body.innerHTML = `
          <div class="frame-dropzone" id="genTabFrame${frameNum}PickBtn">
            <svg class="frame-dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
            <span class="frame-dropzone-text">${window.I18n?.t("gen.selectImage") || "Select image"}</span>
          </div>`;
        body.querySelector(".frame-dropzone")?.addEventListener("click", () => {
          _GenTab._openFramePicker(frameNum);
        });
      }
    }
    _GenTab.saveState();
  }
  static _renderFramePreviews() {
    const frame1Id =
      document.getElementById("genTabFrame1FileId")?.value?.trim() || "";
    const frame2Id =
      document.getElementById("genTabFrame2FileId")?.value?.trim() || "";
    const thumb1 = _GenTab.thumbnailCache?.[frame1Id] || null;
    const thumb2 = _GenTab.thumbnailCache?.[frame2Id] || null;
    if (frame1Id) {
      _GenTab._setFrameImage(1, frame1Id, thumb1);
    }
    if (frame2Id) {
      _GenTab._setFrameImage(2, frame2Id, thumb2);
    }
  }
  static _updatePromptBatchCount() {
    const badge = document.getElementById("promptBatchCount");
    if (!badge) return;
    const gate = window.featureGate;
    const value =
      gate?._serverFetched === true
        ? gate.entitlements?.prompts_per_batch?.value
        : null;
    const limit =
      typeof value === "string" && value.trim() !== "" ? Number(value) : value;
    const visible =
      _GenTab.multiPromptCheck?.checked === true &&
      Number.isInteger(limit) &&
      (limit >= 0 || limit === -1);
    badge.classList.toggle("hidden", !visible);
    const count = _GenTab._getPromptCount();
    badge.textContent = visible
      ? `${count} / ${limit === -1 ? "\u221E" : limit}`
      : "";
    badge.classList.toggle(
      "is-over-limit",
      visible && limit !== -1 && count > limit,
    );
  }
  static _updatePromptCharacterCount() {
    const badge = document.getElementById("promptCharCount");
    if (!badge) return;
    const isSingle = _GenTab.multiPromptCheck?.checked !== true;
    badge.classList.toggle("hidden", !isSingle);
    if (!isSingle) return;
    const count = Array.from(_GenTab.promptsArea?.value || "").length;
    const formattedCount =
      window.I18n?.formatNumber?.(count) || count.toLocaleString();
    const translated = window.I18n?.t("gen.promptCharacters", {
      count: formattedCount,
    });
    badge.textContent =
      translated && translated !== "gen.promptCharacters"
        ? translated
        : `${formattedCount} characters`;
  }
  static updatePromptCount() {
    _GenTab._updatePromptBatchCount();
    _GenTab._updatePromptCharacterCount();
    const text = _GenTab.promptsArea.value.trim();
    if (!text) {
      _GenTab.promptCountSpan.textContent = "0";
      _GenTab._updateRefModeUI();
      return;
    }
    let baseLinesCount = 1;
    if (_GenTab.multiPromptCheck && _GenTab.multiPromptCheck.checked) {
      baseLinesCount = text
        .split(/\n\s*\n/)
        .map((b) => b.trim())
        .filter((b) => b.length > 0).length;
    }
    const quantity = parseInt(_GenTab.quantitySelect?.value) || 1;
    const totalImages = baseLinesCount * quantity;
    const promptsHtml = `<span class="gen-count-num">${baseLinesCount}</span>`;
    const imagesHtml = `<span class="gen-count-num">${totalImages}</span>`;
    const countSummary = window.I18n?.t("gen.countSummary", {
      prompts: promptsHtml,
      images: imagesHtml,
    });
    _GenTab.promptCountSpan.innerHTML =
      countSummary && !countSummary.includes("gen.countSummary")
        ? countSummary
        : `${promptsHtml} prompt \u2192 ${imagesHtml} output(s)`;
    _GenTab._updateRefModeUI();
  }
  static _updateRefImagesCount() {
    const countEl = document.getElementById("refImagesCount");
    if (countEl) {
      countEl.classList.add("hidden");
    }
  }
  static importTxtFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      const lines = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"));
      if (lines.length === 0) {
        console.log(
          "[TobyFlow] File tr\u1ED1ng ho\u1EB7c ch\u1EC9 ch\u1EE9a comment",
        );
        if (window.customDialog) {
          window.customDialog.alert(
            window.I18n?.t("genNotify.uploadEmptyFile") ||
              "File is empty or contains only comment lines (#).",
            {
              title:
                window.I18n?.t("genNotify.uploadEmptyTitle") || "No prompts",
              type: "warning",
            },
          );
        }
        return;
      }
      const importedText = lines.join("\n\n");
      const currentText = _GenTab.promptsArea.value.trim();
      if (currentText.length > 0) {
        _GenTab.promptsArea.value = currentText + "\n\n" + importedText;
      } else {
        _GenTab.promptsArea.value = importedText;
      }
      if (
        lines.length > 1 &&
        _GenTab.multiPromptCheck &&
        !_GenTab.multiPromptCheck.checked
      ) {
        _GenTab.multiPromptCheck.checked = true;
        _GenTab.multiPromptCheck.dispatchEvent(new Event("change"));
      }
      _GenTab.updatePromptCount();
      _GenTab.saveState();
      console.log(
        `[TobyFlow] \u0110\xE3 import ${lines.length} prompt(s) t\u1EEB file "${file.name}"`,
      );
      sendLog(
        `\u0110\xE3 import ${lines.length} prompt(s) t\u1EEB file "${file.name}"`,
        "success",
      );
      window.showNotification?.(
        window.I18n?.t("genNotifyExtra.promptsImported", {
          count: lines.length,
        }) || `Imported ${lines.length} prompt(s)`,
        "success",
      );
    };
    reader.onerror = () => {
      console.error("[TobyFlow] L\u1ED7i \u0111\u1ECDc file:", reader.error);
      if (window.customDialog) {
        window.customDialog.alert(
          window.I18n?.t("genNotify.fileReadFailed") ||
            "Failed to read file. Please try again.",
          {
            title:
              window.I18n?.t("genNotify.fileReadFailedTitle") ||
              "File read error",
            type: "error",
          },
        );
      }
    };
    reader.readAsText(file, "UTF-8");
  }
  static loadState(state) {
    if (state.prompts && _GenTab.promptsArea)
      _GenTab.promptsArea.value = state.prompts;
    _GenTab.updateGrokReferenceControls({
      modelValue: state.grokModel,
      inputType: state.grokVideoInputType,
    });
    if (_GenTab.videoInputTypeSelect) {
      const _vitDefault = window.storageSettings?.get?.(
        "defaultVideoInputType",
      );
      _GenTab._videoInputTypeExplicit = state.videoInputTypeExplicit === true;
      const _savedExplicit =
        _GenTab._videoInputTypeExplicit &&
        (state.videoInputType === "Ingredients" ||
          state.videoInputType === "Frames");
      const _vitEffective = _savedExplicit
        ? state.videoInputType
        : _vitDefault === "Ingredients" || _vitDefault === "Frames"
          ? _vitDefault
          : "Ingredients";
      _GenTab.videoInputTypeSelect.value = _vitEffective;
    }
    const _afSettings = window.storageSettings?.getSettings() || {};
    const _ratioVnToNumeric = {
      Ngang: "16:9",
      "D\u1ECDc": "9:16",
      "Vu\xF4ng": "1:1",
    };
    const _legacyRatioNumeric =
      _ratioVnToNumeric[_afSettings.defaultRatio] || _afSettings.defaultRatio;
    const _effectiveGenType =
      _GenTab._genTypeExplicit === true
        ? _GenTab.genTypeSelect.value
        : _afSettings.defaultGenType || state.genType;
    if (_effectiveGenType && _GenTab.genTypeSelect) {
      _GenTab.genTypeSelect.value = _effectiveGenType;
      _GenTab.genTypeSelect.dispatchEvent(new Event("change"));
      const genTypeToggle = document.getElementById("genTypeToggle");
      if (genTypeToggle) {
        genTypeToggle.querySelectorAll(".gen-type-btn").forEach((btn) => {
          btn.classList.toggle(
            "active",
            btn.dataset.value === _effectiveGenType,
          );
        });
      }
    }
    const _isVideoGen = _effectiveGenType === "Video";
    const _afEffectiveRatio = _isVideoGen
      ? _afSettings.defaultVideoRatio || _legacyRatioNumeric
      : _afSettings.defaultImageRatio || _legacyRatioNumeric;
    const _effectiveRatio = _afEffectiveRatio || state.aspectRatio;
    const _providerAtLoad =
      document.getElementById("genProvider")?.value || "flow";
    if (
      _providerAtLoad === "flow" &&
      _effectiveRatio &&
      _GenTab.aspectRatioSelect
    ) {
      _GenTab.aspectRatioSelect.value = _effectiveRatio;
    }
    const _storedImageModel = _afSettings.defaultImageModel || state.imageModel;
    const _effectiveImageModel =
      window.ModelRegistry?.getCanonicalValue?.("flow", _storedImageModel) ||
      _storedImageModel;
    if (_effectiveImageModel)
      _GenTab._updateModelSelect(
        _GenTab.imageModelSelect,
        "flow",
        "image",
        _effectiveImageModel,
      );
    const _effectiveVideoModel =
      _afSettings.defaultVideoModel || state.videoModel;
    if (_effectiveVideoModel)
      _GenTab._updateModelSelect(
        _GenTab.videoModelSelect,
        "flow",
        "video",
        _effectiveVideoModel,
      );
    if (_GenTab.multiPromptCheck) _GenTab.multiPromptCheck.checked = false;
    const runModeRow = document.querySelector(".gen-run-mode-row");
    if (runModeRow) runModeRow.classList.add("hidden");
    const multiPromptHint = document.getElementById("multiPromptHint");
    if (multiPromptHint) multiPromptHint.classList.add("hidden");
    _GenTab.runMode = "parallel";
    _GenTab._updateRunModeUI();
    const currentFileIds = (_GenTab.fileIdsInput?.value || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const currentFileIdSet = new Set(currentFileIds);
    let hasOrphans = false;
    Object.keys(_GenTab.refImageNames).forEach((fileId) => {
      if (!currentFileIdSet.has(fileId)) {
        console.log(
          "[GenTab] Removing orphan name:",
          fileId,
          _GenTab.refImageNames[fileId],
        );
        delete _GenTab.refImageNames[fileId];
        hasOrphans = true;
      }
    });
    if (hasOrphans) {
      _GenTab.saveState();
    }
    _GenTab.refImagesPerPrompt = window.RefImageAssignment.count(
      state.refImagesPerPrompt,
    );
    if (_GenTab.refImageModeSelect?.dataset.userSet !== "true")
      _GenTab.refImageMode = state.refImageMode || "all";
    if (_GenTab.refImageModeSelect) {
      _GenTab.refImageModeSelect.value = _GenTab.refImageMode;
    }
    _GenTab._updateRefModeUI();
    if (state.selectedVoiceSlug) {
      const hiddenSel = document.getElementById("genVideoVoiceSelect");
      if (hiddenSel) hiddenSel.value = state.selectedVoiceSlug;
    }
    if (
      state.selectedCharacterSlug &&
      !_GenTab._characterPicker?._clearedByMention
    ) {
      const hiddenSelC = document.getElementById("genCharacterSelect");
      if (hiddenSelC) hiddenSelC.value = state.selectedCharacterSlug;
    }
    try {
      _GenTab._applyVoicePickerVisibility();
    } catch (_) {}
    try {
      _GenTab._applyCharacterPickerVisibility();
    } catch (_) {}
    _GenTab._syncPickerMentionState();
    const frame1Input = document.getElementById("genTabFrame1FileId");
    const frame2Input = document.getElementById("genTabFrame2FileId");
    if (state.frame1FileId && frame1Input) {
      frame1Input.value = state.frame1FileId;
    }
    if (state.frame2FileId && frame2Input) {
      frame2Input.value = state.frame2FileId;
    }
    _GenTab._renderFramePreviews();
    if (state.perPromptFrameData && Array.isArray(state.perPromptFrameData)) {
      _GenTab._perPromptFrameData = state.perPromptFrameData;
    }
    _GenTab._updateFrameMode();
    const autoDownloadToggle = document.getElementById("genTabAutoDownload");
    if (autoDownloadToggle) {
      const effectiveAutoDownload =
        state.autoDownload !== void 0
          ? state.autoDownload
          : _afSettings.autoDownload || false;
      autoDownloadToggle.checked = effectiveAutoDownload;
    }
    const genTabDownloadRes = document.getElementById(
      "genTabDownloadResolution",
    );
    if (genTabDownloadRes) {
      const effectiveDownloadRes =
        state.downloadResolution || _afSettings.downloadResolution || "1k";
      genTabDownloadRes.value = effectiveDownloadRes;
      if (state.downloadResolution) {
        genTabDownloadRes.dataset.userSet = "1";
      }
    }
    const genTabVideoDownloadRes = document.getElementById(
      "genTabVideoDownloadResolution",
    );
    if (genTabVideoDownloadRes) {
      const effectiveVideoDownloadRes =
        state.videoDownloadResolution ||
        _afSettings.videoDownloadResolution ||
        "720p";
      genTabVideoDownloadRes.value = effectiveVideoDownloadRes;
      if (state.videoDownloadResolution) {
        genTabVideoDownloadRes.dataset.userSet = "1";
      }
    }
    const genTabSubFolder = document.getElementById("genTabSubFolder");
    if (genTabSubFolder && state.genSubFolder) {
      genTabSubFolder.value = state.genSubFolder;
    }
    if (_GenTab._syncDownloadVisibility) {
      _GenTab._syncDownloadVisibility();
    }
    const genTabDownloadResWrap2 = document.getElementById(
      "genTabDownloadResWrap",
    );
    const genTabVideoDownloadResWrap2 = document.getElementById(
      "genTabVideoDownloadResWrap",
    );
    if (!_GenTab._syncDownloadVisibility) {
      const isVideo = _GenTab.genTypeSelect?.value === "Video";
      const providerKey =
        document.getElementById("genProvider")?.value || "flow";
      const hasSelectableDownloadResolution = providerKey === "flow";
      const genTabSubFolder2 = document.getElementById("genTabSubFolder");
      if (autoDownloadToggle?.checked) {
        if (genTabSubFolder2) genTabSubFolder2.classList.remove("hidden");
        if (genTabDownloadResWrap2)
          genTabDownloadResWrap2.classList.toggle(
            "hidden",
            !hasSelectableDownloadResolution || isVideo,
          );
        if (genTabVideoDownloadResWrap2)
          genTabVideoDownloadResWrap2.classList.toggle(
            "hidden",
            !hasSelectableDownloadResolution || !isVideo,
          );
      } else {
        if (genTabSubFolder2) genTabSubFolder2.classList.add("hidden");
        if (genTabDownloadResWrap2)
          genTabDownloadResWrap2.classList.add("hidden");
        if (genTabVideoDownloadResWrap2)
          genTabVideoDownloadResWrap2.classList.add("hidden");
      }
    }
    if (state.selectedAddonPromptId && _GenTab.addonPromptSelect) {
      _GenTab.addonPromptSelect.value = state.selectedAddonPromptId;
      _GenTab._updateAddonPromptTrigger?.();
    }
    if (typeof _GenTab.renderFileIdThumbnails === "function")
      setTimeout(_GenTab.renderFileIdThumbnails, 200);
  }
  static _updateLockBanner(state) {
    const bannerId = "executionLockBanner";
    let banner = document.getElementById(bannerId);
    const isPipelineOn = window.PromptQueue && PromptQueue.isEnabled();
    if (
      !state.locked ||
      state.owner === "prompts" ||
      state.owner === "queue" ||
      isPipelineOn
    ) {
      if (banner) banner.remove();
      if (_GenTab.startBtn) _GenTab.startBtn.disabled = false;
      return;
    }
    if (_GenTab.startBtn) _GenTab.startBtn.disabled = true;
    if (!banner) {
      banner = document.createElement("div");
      banner.id = bannerId;
      banner.className = "execution-lock-banner";
      const startBtnParent = _GenTab.startBtn?.parentElement;
      if (startBtnParent) {
        startBtnParent.insertBefore(banner, _GenTab.startBtn);
      }
    }
    banner.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <span>\u0110ang ch\u1EA1y: ${state.label || state.owner}</span>
    `;
  }
  static async _loadAddonPrompts() {
    const cached = await _GenTab._getAddonPromptsFromCache();
    if (cached) {
      _GenTab.addonPrompts = cached;
      _GenTab._renderAddonPromptSelect();
      _GenTab
        ._fetchAddonPromptsFromApi()
        .then((fresh) => {
          if (fresh && Array.isArray(fresh)) {
            const changed =
              JSON.stringify(fresh) !== JSON.stringify(_GenTab.addonPrompts);
            if (changed) {
              _GenTab.addonPrompts = fresh;
              _GenTab._renderAddonPromptSelect();
            }
          }
        })
        .catch(() => {});
      return;
    }
    const fetched = await _GenTab._fetchAddonPromptsFromApi();
    if (fetched) {
      _GenTab.addonPrompts = fetched;
    } else {
      console.debug(
        "[Tier3] Addon prompts API fail v\xE0 cache empty \u2014 render empty list",
      );
      _GenTab.addonPrompts = [];
    }
    _GenTab._renderAddonPromptSelect();
  }
  static async _getAddonPromptsFromCache() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["af_addon_prompts"], (result) => {
        const cached = result.af_addon_prompts;
        if (!cached || !cached.data || !cached.timestamp) {
          resolve(null);
          return;
        }
        const age = Date.now() - cached.timestamp;
        if (age > _GenTab._ADDON_CACHE_TTL) {
          resolve(null);
          return;
        }
        resolve(cached.data);
      });
    });
  }
  static async _fetchAddonPromptsFromApi() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["af_auth"], (authResult) => {
        const token = authResult.af_auth?.token || null;
        chrome.runtime.sendMessage(
          {
            action: "apiRequest",
            method: "GET",
            endpoint: "addon-prompts",
            token,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              console.warn(
                "[TobyFlow] Addon prompts API error:",
                chrome.runtime.lastError.message,
              );
              resolve(null);
              return;
            }
            if (response?.success && Array.isArray(response.data)) {
              chrome.storage.local.set({
                af_addon_prompts: {
                  data: response.data,
                  timestamp: Date.now(),
                },
              });
              resolve(response.data);
            } else {
              console.warn(
                "[TobyFlow] Addon prompts API failed:",
                response?.error?.message,
              );
              resolve(null);
            }
          },
        );
      });
    });
  }
  static _renderAddonPromptSelect() {
    if (!_GenTab.addonPromptSelect) return;
    const prevValue = _GenTab.addonPromptSelect.value || "";
    let html = '<option value="">Phong c\xE1ch</option>';
    for (const addon of _GenTab.addonPrompts) {
      const id = addon.id;
      const name = addon.name || "Untitled";
      html += `<option value="${id}">${name}</option>`;
    }
    _GenTab.addonPromptSelect.innerHTML = html;
    if (prevValue) _GenTab.addonPromptSelect.value = prevValue;
    _GenTab._renderAddonPromptList();
    _GenTab._updateAddonPromptTrigger();
    chrome.storage.local.get(["toby_gentab_state"], (res) => {
      const savedId = res.toby_gentab_state?.selectedAddonPromptId;
      if (
        savedId &&
        _GenTab.addonPromptSelect &&
        _GenTab.addonPromptSelect.value !== String(savedId)
      ) {
        _GenTab.addonPromptSelect.value = savedId;
        _GenTab._updateAddonPromptTrigger();
      }
    });
  }
  static _renderAddonPromptList(filter = "") {
    const listEl = document.getElementById("addonPromptList");
    if (!listEl) return;
    const searchTerm = filter.toLowerCase().trim();
    const selectedId = _GenTab.addonPromptSelect?.value || "";
    let html = `
      <div class="addon-prompt-item none-option${!selectedId ? " selected" : ""}" data-id="">
        <span class="addon-prompt-name">Kh\xF4ng ch\u1ECDn phong c\xE1ch</span>
      </div>
    `;
    const filtered = searchTerm
      ? _GenTab.addonPrompts.filter((a) =>
          (a.name || "").toLowerCase().includes(searchTerm),
        )
      : _GenTab.addonPrompts;
    if (filtered.length === 0 && searchTerm) {
      html +=
        '<div class="addon-prompt-empty">Kh\xF4ng t\xECm th\u1EA5y phong c\xE1ch</div>';
    } else {
      for (const addon of filtered) {
        const id = addon.id;
        const name = addon.name || "Untitled";
        const image = addon.thumbnail_url || "";
        const isSelected = String(id) === String(selectedId);
        const thumbHtml = image
          ? `<img class="addon-prompt-thumb" src="${image}" alt="${name}" loading="lazy" />`
          : `<div class="addon-prompt-thumb-placeholder">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z"></path>
              </svg>
            </div>`;
        html += `
          <div class="addon-prompt-item${isSelected ? " selected" : ""}" data-id="${id}">
            ${thumbHtml}
            <div class="addon-prompt-info">
              <div class="addon-prompt-name">${name}</div>
            </div>
          </div>
        `;
      }
    }
    listEl.innerHTML = html;
    listEl.querySelectorAll(".addon-prompt-item").forEach((item) => {
      item.addEventListener("click", () => {
        const id = item.dataset.id;
        _GenTab._selectAddonPrompt(id);
      });
    });
  }
  static _selectAddonPrompt(id) {
    if (_GenTab.addonPromptSelect) {
      _GenTab.addonPromptSelect.value = id;
    }
    _GenTab._updateAddonPromptTrigger();
    _GenTab._closeAddonPromptPopup();
    _GenTab._renderAddonPromptList();
    _GenTab.saveState();
  }
  static _updateAddonPromptTrigger() {
    const trigger = document.getElementById("addonPromptTrigger");
    const label = trigger?.querySelector(".addon-prompt-label");
    if (!trigger || !label) return;
    const selectedId = _GenTab.addonPromptSelect?.value || "";
    const addon = selectedId
      ? _GenTab.addonPrompts.find((a) => String(a.id) === String(selectedId))
      : null;
    if (addon) {
      label.removeAttribute("data-i18n");
      label.textContent = addon.name || "";
      trigger.classList.add("has-value");
    } else {
      label.setAttribute("data-i18n", "gen.style");
      label.textContent =
        window.I18n?.t("gen.style") ||
        window.I18n?.t("genNotify.styleLabel") ||
        "Style";
      trigger.classList.remove("has-value");
    }
  }
  static _closeAddonPromptPopup() {
    const dropdown = document.getElementById("addonPromptDropdown");
    const popup = document.getElementById("addonPromptPopup");
    const searchInput = document.getElementById("addonPromptSearch");
    if (dropdown) dropdown.classList.remove("open");
    if (popup) popup.classList.add("hidden");
    if (searchInput) searchInput.value = "";
  }
  static _initAddonPromptDropdown() {
    const trigger = document.getElementById("addonPromptTrigger");
    if (!trigger) return;
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      _GenTab._openStyleSelectModal();
    });
  }
  static _openStyleSelectModal() {
    if (!window.StyleSelectModal) {
      console.warn("[GenTab] StyleSelectModal not loaded");
      return;
    }
    window.StyleSelectModal.show({
      addons: _GenTab.addonPrompts,
      selectedId: _GenTab.addonPromptSelect?.value || null,
      onSelect: (addon) => {
        _GenTab._selectAddonPrompt(addon?.id || "");
      },
      canCreate: _GenTab._canCreateCustomAddon(),
      onDataChange: async () => {
        const fresh = await _GenTab._fetchAddonPromptsFromApi();
        if (fresh && Array.isArray(fresh)) {
          _GenTab.addonPrompts = fresh;
          _GenTab._renderAddonPromptSelect();
        }
        _GenTab._openStyleSelectModal();
      },
    });
  }
  static _canCreateCustomAddon() {
    try {
      if (!window.featureGate?.canUse?.("addon_prompt_enabled")) return false;
      const quota = window.featureGate.checkQuota?.("addon_prompt_max");
      const limit = quota?.limit;
      if (
        limit === void 0 ||
        limit === null ||
        limit === "unlimited" ||
        String(limit) === "-1"
      )
        return true;
      const currentCustom = (_GenTab.addonPrompts || []).filter(
        (a) => a.is_custom,
      ).length;
      return currentCustom < Number(limit);
    } catch (e) {
      return false;
    }
  }
  static _endZoomSession() {
    try {
      window.MessageBridge?.sendToContentScript?.(
        "endFlowZoomSession",
        {},
      )?.catch?.(() => {});
    } catch (_) {}
  }
  static _getSelectedAddonPrompt() {
    if (!_GenTab.addonPromptSelect) return null;
    const selectedId = _GenTab.addonPromptSelect.value;
    if (!selectedId) return null;
    return (
      _GenTab.addonPrompts.find((a) => String(a.id) === String(selectedId)) ||
      null
    );
  }
  static _toggleRunMode() {
    if (_GenTab.chainToggle?.checked) {
      _GenTab.runMode = "sequential";
      _GenTab._updateRunModeUI();
      return;
    }
    const isParallel = _GenTab.runMode === "parallel";
    _GenTab.runMode = isParallel ? "sequential" : "parallel";
    console.log(
      "[GenTab] Toggle runMode:",
      isParallel ? "parallel\u2192sequential" : "sequential\u2192parallel",
      "new value:",
      _GenTab.runMode,
    );
    _GenTab._updateRunModeUI();
    _GenTab.saveState();
  }
  static _updateRunModeUI() {
    const btn = _GenTab.genRunModeBtn;
    if (!btn) {
      console.log("[GenTab] _updateRunModeUI: btn not found");
      return;
    }
    const isParallel = _GenTab.runMode === "parallel";
    console.log(
      "[GenTab] _updateRunModeUI: runMode=",
      _GenTab.runMode,
      "isParallel=",
      isParallel,
    );
    const label = btn.querySelector(".gen-run-mode-label");
    const svg = btn.querySelector("svg");
    if (label) {
      label.textContent = isParallel
        ? window.I18n?.t("gen.parallelLabel") || "Song song"
        : window.I18n?.t("gen.sequentialLabel") || "Sequential";
    }
    btn.title = isParallel
      ? window.I18n?.t("gen.parallelTitle") ||
        "Run mode: Parallel (no waiting between prompts)"
      : window.I18n?.t("gen.sequentialTitle") ||
        "Run mode: Sequential (wait for each prompt result)";
    if (svg) {
      if (isParallel) {
        svg.innerHTML = `
          <line x1="4" y1="6" x2="20" y2="6"></line>
          <line x1="4" y1="12" x2="20" y2="12"></line>
          <line x1="4" y1="18" x2="20" y2="18"></line>
        `;
      } else {
        svg.innerHTML = `
          <line x1="10" y1="6" x2="21" y2="6"></line>
          <line x1="10" y1="12" x2="21" y2="12"></line>
          <line x1="10" y1="18" x2="21" y2="18"></line>
          <polyline points="3 6 4 7 6 5"></polyline>
          <polyline points="3 12 4 13 6 11"></polyline>
          <polyline points="3 18 4 19 6 17"></polyline>
        `;
      }
    }
    btn.classList.toggle("active", isParallel);
  }
  static _updateRunModeVisibility() {
    const runModeRow = document.querySelector(".gen-run-mode-row");
    if (!runModeRow) return;
    const isMulti = _GenTab.multiPromptCheck?.checked;
    const provider = _GenTab.providerSelect?.value || "flow";
    const isFlow = provider === "flow";
    const showRunMode = isMulti && isFlow;
    runModeRow.classList.toggle("hidden", !showRunMode);
    if (showRunMode) {
      _GenTab._updateRunModeUI();
    }
  }
  static cleanupUnavailableUploads() {
    if (!_GenTab.fileIdsInput) return;
    const currentIds = _GenTab.fileIdsInput.value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (currentIds.length === 0) return;
    const validIds = currentIds.filter((id) => {
      if (!id.startsWith("upload_")) return true;
      const exists = window.pendingUploadFiles?.has(id);
      if (!exists) {
        console.log("[GenTab] Removing unavailable upload ref:", id);
      }
      return exists;
    });
    if (validIds.length !== currentIds.length) {
      const removed = currentIds.length - validIds.length;
      _GenTab.fileIdsInput.value = validIds.join(", ");
      _GenTab.saveState();
      _GenTab.renderFileIdThumbnails();
      console.log(`[GenTab] Removed ${removed} unavailable upload ref(s)`);
    }
  }
  static _applyStorageSettings() {
    const s = window.storageSettings?.getSettings?.();
    if (!s) return;
    if (
      s.defaultGenType &&
      _GenTab.genTypeSelect &&
      _GenTab._genTypeExplicit !== true
    ) {
      _GenTab.genTypeSelect.value = s.defaultGenType;
      _GenTab.genTypeSelect.dispatchEvent(new Event("change"));
      const genTypeToggle = document.getElementById("genTypeToggle");
      if (genTypeToggle) {
        genTypeToggle.querySelectorAll(".gen-type-btn").forEach((btn) => {
          btn.classList.toggle(
            "active",
            btn.dataset.value === s.defaultGenType,
          );
        });
      }
    }
    const provider = document.getElementById("genProvider")?.value || "flow";
    if (provider === "flow") {
      const isVideo = _GenTab.genTypeSelect?.value === "Video";
      const effectiveRatio = isVideo
        ? s.defaultVideoRatio
        : s.defaultImageRatio;
      if (effectiveRatio && _GenTab.aspectRatioSelect)
        _GenTab.aspectRatioSelect.value = effectiveRatio;
    } else if (provider === "gemini") {
      _GenTab._renderGeminiRatioOptions();
    } else if (provider === "muse") {
      _GenTab._renderMuseRatioOptions();
    }
    if (s.defaultImageModel && _GenTab.imageModelSelect) {
      _GenTab._updateModelSelect(
        _GenTab.imageModelSelect,
        "flow",
        "image",
        s.defaultImageModel,
      );
    }
    if (s.defaultVideoModel && _GenTab.videoModelSelect) {
      _GenTab._updateModelSelect(
        _GenTab.videoModelSelect,
        "flow",
        "video",
        s.defaultVideoModel,
      );
    }
    if (
      !_GenTab._videoInputTypeExplicit &&
      _GenTab.videoInputTypeSelect &&
      (s.defaultVideoInputType === "Ingredients" ||
        s.defaultVideoInputType === "Frames")
    ) {
      _GenTab.videoInputTypeSelect.value = s.defaultVideoInputType;
    }
    const autoDownloadToggle = document.getElementById("genTabAutoDownload");
    if (autoDownloadToggle && s.autoDownload !== void 0) {
      autoDownloadToggle.checked = s.autoDownload || false;
    }
    if (_GenTab._syncDownloadVisibility) _GenTab._syncDownloadVisibility();
  }
  static _saveStateImmediate() {
    const state = {
      prompts: _GenTab.promptsArea.value,
      genType: _GenTab.genTypeSelect.value,
      aspectRatio: _GenTab.aspectRatioSelect
        ? _GenTab.aspectRatioSelect.value
        : "16:9",
      imageModel: _GenTab.imageModelSelect
        ? _GenTab.imageModelSelect.value
        : "",
      videoModel: _GenTab.videoModelSelect
        ? _GenTab.videoModelSelect.value
        : "",
      videoInputType: _GenTab.videoInputTypeSelect
        ? _GenTab.videoInputTypeSelect.value
        : "Ingredients",
      videoInputTypeExplicit: _GenTab._videoInputTypeExplicit === true,
      grokModel: document.getElementById("grokModel")?.value || null,
      grokVideoInputType:
        document.getElementById("grokVideoInputType")?.value || null,
      runMode: _GenTab.runMode || "parallel",
      refImageMode: _GenTab.refImageMode || "all",
      refImagesPerPrompt: window.RefImageAssignment.count(
        _GenTab.refImagesPerPrompt,
      ),
      selectedAddonPromptId: _GenTab.addonPromptSelect
        ? _GenTab.addonPromptSelect.value
        : "",
      selectedVoiceSlug:
        document.getElementById("genVideoVoiceSelect")?.value || "",
      selectedCharacterSlug:
        document.getElementById("genCharacterSelect")?.value || "",
      genSubFolder:
        document.getElementById("genTabSubFolder")?.value || "tobyflow-01",
    };
    chrome.storage.local.set({ toby_gentab_state: state });
  }
  static renderUploadPreview() {
    const previewContainer = document.getElementById("imagePreviewContainer");
    const executeBtn = document.getElementById("executeUploadBtn");
    if (!previewContainer || !executeBtn) return;
    _GenTab._previewBlobUrls.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {}
    });
    _GenTab._previewBlobUrls = [];
    previewContainer.innerHTML = "";
    if (_GenTab.selectedFilesForUpload.length === 0) {
      executeBtn.classList.add("hidden");
      return;
    }
    executeBtn.classList.remove("hidden");
    _GenTab.selectedFilesForUpload.forEach((file, index) => {
      const wrapper = document.createElement("div");
      wrapper.style.cssText =
        "position: relative; display: inline-block; margin-right: 5px; margin-bottom: 5px; overflow: hidden; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2);";
      const img = document.createElement("img");
      const blobUrl = URL.createObjectURL(file);
      _GenTab._previewBlobUrls.push(blobUrl);
      img.src = blobUrl;
      img.style.width = "40px";
      img.style.height = "40px";
      img.style.objectFit = "cover";
      img.style.display = "block";
      img.title = file.name;
      const removeBtn = document.createElement("div");
      removeBtn.innerHTML = "\xD7";
      removeBtn.className = "img-remove-btn";
      removeBtn.style.cssText = `
                position: absolute; top: 0; right: 0; background: rgba(0,0,0,0.6); color: white;
                width: 14px; height: 14px; display: flex; align-items: center; justify-content: center;
                font-size: 10px; cursor: pointer; border-bottom-left-radius: 4px; font-weight: bold;
            `;
      removeBtn.addEventListener("click", () => {
        _GenTab.selectedFilesForUpload.splice(index, 1);
        _GenTab.renderUploadPreview();
      });
      wrapper.appendChild(img);
      wrapper.appendChild(removeBtn);
      previewContainer.appendChild(wrapper);
    });
  }
  static isTileError(tileEl) {
    if (!tileEl) return false;
    const hasVisibleDeleteBtn = Array.from(
      tileEl.querySelectorAll("button"),
    ).some((btn) => {
      const icon = btn.querySelector("i");
      if (!icon || icon.textContent.trim() !== "delete_forever") return false;
      const isHidden = !!btn.closest('[style*="opacity: 0"]');
      return !isHidden;
    });
    if (hasVisibleDeleteBtn) return true;
    const tileText = tileEl.textContent || "";
    if (tileText.includes("Kh\xF4ng th\xE0nh c\xF4ng")) {
      const errorNodes = Array.from(
        tileEl.querySelectorAll("div, span"),
      ).filter((el) => el.textContent.trim() === "Kh\xF4ng th\xE0nh c\xF4ng");
      for (let node of errorNodes) {
        const closestStateSpan = node.closest("span[data-state]");
        const isStateOpen =
          closestStateSpan &&
          closestStateSpan.getAttribute("data-state") === "open";
        const isHiddenOpacity = !!node.closest('[style*="opacity: 0"]');
        if (isStateOpen && !isHiddenOpacity) {
          return true;
        }
      }
    }
    const warningIcons = Array.from(tileEl.querySelectorAll("i")).filter(
      (i) => i.textContent.trim() === "warning",
    );
    for (let icon of warningIcons) {
      const isHidden = !!icon.closest('[style*="opacity: 0"]');
      if (!isHidden) {
        const hasMedia = tileEl.querySelector('img[src*="media"], video');
        if (!hasMedia) return true;
      }
    }
    return false;
  }
  static async deleteFailedTile(tileId) {
    try {
      const tileEl = document.querySelector(`div[data-tile-id="${tileId}"]`);
      if (!tileEl) return;
      const deleteBtn = Array.from(tileEl.querySelectorAll("button")).find(
        (btn) => {
          const icon = btn.querySelector("i");
          return icon && icon.textContent.trim() === "delete_forever";
        },
      );
      if (deleteBtn) {
        deleteBtn.click();
        sendLog(`\u0110\xE3 b\u1EA5m Xo\xE1 tile l\u1ED7i ${tileId}`, "info");
        await sleep(1e3);
      } else {
        sendLog(
          `Kh\xF4ng t\xECm th\u1EA5y n\xFAt Xo\xE1 tr\xEAn tile ${tileId}`,
          "warn",
        );
      }
    } catch (e) {
      sendLog(`L\u1ED7i khi xo\xE1 tile: ${e.message}`, "warn");
    }
  }
  static async performFlowImageUpload(filesArray, executeBtnElement) {
    sendLog(
      `\u0110ang gi\u1EA3 l\u1EADp t\u1EA3i l\xEAn ${filesArray.length} \u1EA3nh...`,
      "info",
    );
    const originalButtonHtml = executeBtnElement.innerHTML;
    executeBtnElement.innerHTML = "<span>...</span> Loading...";
    executeBtnElement.disabled = true;
    const _tileSel = window._getTileSelectorString?.();
    if (!_tileSel) {
      sendLog("FLOW_TILE_SELECTOR_MISSING", "warn");
      executeBtnElement.innerHTML = originalButtonHtml;
      executeBtnElement.disabled = false;
      return null;
    }
    const tileRuntimeId = (el) => window._getTileRuntimeId?.(el) || null;
    const existingTiles = Array.from(document.querySelectorAll(_tileSel))
      .map(tileRuntimeId)
      .filter(Boolean);
    try {
      const dataTransfer = new DataTransfer();
      filesArray.forEach((file) => dataTransfer.items.add(file));
      const flowInputs = Array.from(
        document.querySelectorAll('input[type="file"]'),
      );
      if (flowInputs.length === 0) {
        if (window.customDialog)
          window.customDialog.alert(
            window.I18n?.t("genNotify.uploadButtonNotFound") ||
              "Flow's internal Upload button not found. The UI may have changed.",
            {
              title:
                window.I18n?.t("genNotify.uploadFailedTitle") || "Upload error",
              type: "error",
            },
          );
        executeBtnElement.innerHTML = `<span>Upload</span> ${window.I18n?.t("genNotify.uploadFlow") || "Upload to Flow"}`;
        executeBtnElement.disabled = false;
        return null;
      }
      let injected = false;
      for (let input of flowInputs) {
        try {
          input.files = dataTransfer.files;
          input.dispatchEvent(new Event("change", { bubbles: true }));
          injected = true;
        } catch (e) {}
      }
      if (!injected)
        throw new Error(
          "Kh\xF4ng th\u1EC3 ghi \u0111\xE8 file v\xE0o h\u1EC7 th\u1ED1ng Input",
        );
      sendLog(
        "Bypass ho\xE0n t\u1EA5t. \u0110ang ra l\u1EC7nh React Upload Component ch\u1EA1y...",
        "info",
      );
    } catch (err) {
      if (window.customDialog)
        window.customDialog.alert(
          window.I18n?.t("genNotifyExtra.uploadDragFailed", {
            error: err.message,
          }) || `Error while simulating file drag-and-drop: ${err.message}.`,
          {
            title:
              window.I18n?.t("genNotify.uploadFailedTitle") || "Upload error",
            type: "error",
          },
        );
      executeBtnElement.innerHTML = `<span>Upload</span> ${window.I18n?.t("genNotifyExtra.uploadFlowLabel") || "Upload to Flow"}`;
      executeBtnElement.disabled = false;
      return null;
    }
    let newlyAddedIds = [];
    let waitTime = 0;
    const maxWait = 12e4;
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    while (waitTime < maxWait) {
      await sleep(2e3);
      waitTime += 2e3;
      const currentTiles = Array.from(document.querySelectorAll(_tileSel));
      const newTilesElements = currentTiles.filter((t) => {
        const id = tileRuntimeId(t);
        return id && !existingTiles.includes(id);
      });
      if (newTilesElements.length > 0) {
        let allUploaded = true;
        for (let t of newTilesElements) {
          const hasMedia = t.querySelector("img, video");
          const hasError = _GenTab.isTileError(t);
          const isProcessing =
            t.textContent.includes("%") ||
            t.textContent.toLowerCase().includes("\u0111ang");
          if (!hasError && (!hasMedia || isProcessing)) {
            allUploaded = false;
            break;
          }
        }
        if (allUploaded) {
          newlyAddedIds = newTilesElements.map(tileRuntimeId).filter(Boolean);
          break;
        }
      }
    }
    newlyAddedIds = [...new Set(newlyAddedIds)];
    if (newlyAddedIds.length > filesArray.length) {
      newlyAddedIds = newlyAddedIds.slice(0, filesArray.length);
    }
    if (newlyAddedIds.length > 0) {
      sendLog(
        `L\u1EA5y th\xE0nh c\xF4ng ${newlyAddedIds.length} file ID(s) m\u1EDBi!`,
        "success",
      );
    } else {
      sendLog(
        "Kh\xF4ng t\xECm th\u1EA5y file ID m\u1EDBi n\xE0o. Vui l\xF2ng th\u1EED l\u1EA1i.",
        "warn",
      );
    }
    executeBtnElement.innerHTML = "<span>Upload</span> Upload to Flow";
    executeBtnElement.disabled = false;
    executeBtnElement.classList.add("hidden");
    if (typeof _GenTab.renderFileIdThumbnails === "function") {
      _GenTab.renderFileIdThumbnails();
    }
    return newlyAddedIds;
  }
  static _setRefModeUploadLock(locked) {
    _GenTab._refModeLocked = !!locked;
    const sel = _GenTab.refImageModeSelect;
    if (!sel) return;
    sel.disabled = !!locked;
    document
      .getElementById("refImagesPerPromptControl")
      ?.querySelectorAll("input, button")
      .forEach((control) => {
        control.disabled = !!locked;
      });
    const wrap = sel.closest(".ref-mode-select");
    if (wrap) {
      wrap.classList.toggle("ref-mode-locked", !!locked);
      wrap.title = locked
        ? window.I18n?.t("gen.refModeLockedUploading") ||
          "Uploading images \u2014 mode locked"
        : window.I18n?.t("gen.refModeTitle") || "How to use reference images";
    }
  }
  static _updateRefModeUI() {
    const mode = _GenTab.refImageMode;
    const countInput = document.getElementById("refImagesPerPrompt");
    if (countInput) {
      document
        .getElementById("refImagesPerPromptControl")
        ?.classList.toggle("hidden", mode !== "sequential");
      countInput.disabled = _GenTab._refModeLocked;
      _GenTab.refImagesPerPrompt = window.RefImageAssignment.count(
        _GenTab.refImagesPerPrompt,
      );
      const capacity = _GenTab.getRefLimit(false);
      if (Number.isFinite(capacity) && capacity > 0) {
        countInput.max = String(capacity);
        _GenTab.refImagesPerPrompt = Math.min(
          _GenTab.refImagesPerPrompt,
          capacity,
        );
      }
      countInput.value = _GenTab.refImagesPerPrompt;
    }
    const mentionHelper = _GenTab.mentionHelper;
    const dragHint = document.getElementById("refImagesDragHint");
    const dragHintText = document.getElementById("refDragHintText");
    const ratioCount = document.getElementById("refRatioCount");
    const refSection = document.getElementById("refImagesSection");
    if (refSection) {
      refSection.classList.toggle("ref-mode-disabled", mode === "none");
    }
    if (mentionHelper) {
      if (mode !== "mention") {
        mentionHelper.classList.add("hidden");
      } else {
        _GenTab._refreshMentionHelper();
        _GenTab._initAutocomplete();
      }
    }
    const refLimitHint = document.getElementById("refLimitHint");
    const refLimitHintText = document.getElementById("refLimitHintText");
    if (refLimitHint && refLimitHintText) {
      if (mode === "mention") {
        const provider = (
          _GenTab.providerSelect?.value || "flow"
        ).toLowerCase();
        const isVideo = _GenTab.genTypeSelect?.value === "Video";
        const isFrames =
          (provider === "grok"
            ? document.getElementById("grokVideoInputType")?.value
            : _GenTab.videoInputTypeSelect?.value) === "Frames";
        const resolvedMode = isVideo ? "video" : "image";
        const modelValue =
          provider === "grok"
            ? document.getElementById("grokModel")?.value
            : isVideo
              ? _GenTab.videoModelSelect?.value
              : _GenTab.imageModelSelect?.value;
        const imageCap =
          typeof ImagePickerModal !== "undefined" &&
          ImagePickerModal.resolveMaxSelections
            ? ImagePickerModal.resolveMaxSelections({
                provider,
                mode: resolvedMode,
                isFrames,
                modelValue,
              })
            : null;
        const totalCap =
          provider === "flow"
            ? window.ProviderRegistry?.get?.("flow")?.getMaxRefImagesTotal?.(
                modelValue,
              )
            : null;
        const maxRef =
          Number.isInteger(totalCap) && totalCap >= 0
            ? Math.min(imageCap ?? totalCap, totalCap)
            : imageCap;
        const limitText = maxRef ? maxRef : "?";
        refLimitHintText.textContent =
          window.I18n?.t?.("gen.refLimitHint", { max: limitText }) ||
          `Max ${limitText} ref images per prompt. Use @image_name in prompt.`;
        refLimitHint.classList.remove("hidden");
      } else {
        refLimitHint.classList.add("hidden");
      }
    }
    const currentIds =
      _GenTab.fileIdsInput?.value
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) || [];
    const hasImages = currentIds.length > 0;
    if (dragHint) {
      const showDragHint =
        (mode === "sequential" || mode === "all") &&
        hasImages &&
        currentIds.length >= 2;
      dragHint.classList.toggle("hidden", !showDragHint);
      if (dragHintText) {
        dragHintText.textContent =
          window.I18n?.t("gen.dragToSort") || "Drag to sort";
      }
    }
    if (ratioCount) {
      if (
        mode === "sequential" &&
        _GenTab.multiPromptCheck?.checked &&
        hasImages
      ) {
        const prompts =
          _GenTab.promptsArea?.value
            ?.split(/\n\s*\n/)
            .filter((p) => p.trim()) || [];
        const promptCount = prompts.length;
        const imageCount = currentIds.length;
        const diff =
          imageCount -
          promptCount *
            window.RefImageAssignment.count(_GenTab.refImagesPerPrompt);
        ratioCount.classList.remove(
          "match",
          "mismatch",
          "excess-images",
          "excess-prompts",
        );
        if (diff === 0) {
          ratioCount.innerHTML = `<span class="count-images">${imageCount} images</span> / <span class="count-prompts">${promptCount} prompt</span>`;
          ratioCount.classList.add("match");
        } else if (diff > 0) {
          ratioCount.innerHTML = `<span class="count-images">${imageCount} images</span> / <span class="count-prompts">${promptCount} prompt</span> <span class="count-excess">(${diff} excess images)</span>`;
          ratioCount.classList.add("excess-images");
        } else {
          ratioCount.innerHTML = `<span class="count-images">${imageCount} images</span> / <span class="count-prompts">${promptCount} prompt</span> <span class="count-shortage">(${-diff} missing images)</span>`;
          ratioCount.classList.add("excess-prompts");
        }
      } else {
        ratioCount.innerHTML = "";
      }
    }
    _GenTab.renderFileIdThumbnails();
  }
  static _bindRefQuickTabs() {
    const quickTabs = document.getElementById("refQuickTabs");
    if (!quickTabs) return;
    quickTabs.querySelectorAll(".ref-quick-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        const target = pill.dataset.target;
        if (!target) return;
        const photosTabBtn = document.querySelector(
          '.tobyflow-tab[data-tab="tab-photos"]',
        );
        if (photosTabBtn) {
          photosTabBtn.click();
        }
        setTimeout(() => {
          if (window.PhotosTab) {
            window.PhotosTab._activateSubtab(target);
          }
        }, 50);
      });
    });
  }
  static _refreshMentionHelper() {
    if (!_GenTab.mentionHelperTags) return;
    if (_GenTab.refImageMode !== "mention") {
      _GenTab.mentionHelperTags.innerHTML = "";
      _GenTab.mentionHelper?.classList.add("hidden");
      return;
    }
    const currentIds = _GenTab.fileIdsInput?.value
      ? _GenTab.fileIdsInput.value
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const items = currentIds
      .map((id) => ({
        id,
        name: _GenTab.refImageNames[id],
        thumbnail: _GenTab.thumbnailCache?.[id] || "",
      }))
      .filter((item) => item.name);
    if (currentIds.length === 0) {
      _GenTab.mentionHelperTags.innerHTML = "";
      _GenTab.mentionHelper?.classList.add("hidden");
      return;
    }
    _GenTab.mentionHelper?.classList.remove("hidden");
    if (items.length === 0) {
      _GenTab.mentionHelperTags.innerHTML =
        '<span style="color: var(--muted-foreground); font-size: 11px;">No image names yet. Click the edit button to set names.</span>';
      return;
    }
    const escapeAttr = (s) =>
      String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    _GenTab.mentionHelperTags.innerHTML = items
      .map(({ name, thumbnail }) => {
        const thumbHtml = thumbnail
          ? `<img class="mention-tag-thumb" src="${escapeAttr(thumbnail)}" alt="" />`
          : "";
        return `<button class="mention-tag" data-name="${escapeAttr(name)}">${thumbHtml}<span>@${name}</span></button>`;
      })
      .join("");
    window.ProviderTabScroll?.bindDrag?.(_GenTab.mentionHelperTags);
    _GenTab.mentionHelperTags
      .querySelectorAll(".mention-tag")
      .forEach((tag) => {
        tag.addEventListener("click", () => {
          _GenTab._insertMentionAtCursor(tag.dataset.name);
        });
      });
  }
  static _insertMentionAtCursor(name) {
    const textarea = _GenTab.promptsArea;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const mention = `@${name} `;
    textarea.value = text.slice(0, start) + mention + text.slice(end);
    textarea.selectionStart = textarea.selectionEnd = start + mention.length;
    textarea.focus();
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    _GenTab._hideAutocomplete();
  }
  static _mentionRefEntries() {
    const ids = _GenTab.fileIdsInput?.value
      ? _GenTab.fileIdsInput.value
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const seen = new Set();
    const out = [];
    for (const id of ids) {
      const name = _GenTab.refImageNames[id];
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push({
        label: name,
        thumbnail: _GenTab.thumbnailCache?.[id] || null,
        iconSvg: window.MentionMenu?.ICONS?.ref || "",
        value: name,
      });
    }
    return out;
  }
  static _initMentionMenu() {
    const textarea = _GenTab.promptsArea;
    if (!textarea || _GenTab._mentionMenu || !window.MentionMenu) return;
    _GenTab._mentionMenu = new window.MentionMenu(textarea, {
      getTabs: () => {
        const tabs = [];
        if (
          _GenTab.refImageMode === "mention" &&
          _GenTab._mentionRefEntries().length > 0
        ) {
          tabs.push({
            id: "ref",
            label: window.I18n?.t?.("mention.tabRef") || "Ref image",
            iconSvg: window.MentionMenu.ICONS.ref,
            getItems: () => _GenTab._mentionRefEntries(),
            buildInsert: (item) => window.MentionMenu.wrapName(item.value, ""),
          });
        }
        const providerKey =
          document.getElementById("genProvider")?.value || "flow";
        const isFrames =
          _GenTab.genTypeSelect?.value === "Video" &&
          _GenTab.videoInputTypeSelect?.value === "Frames";
        if (providerKey === "flow" && !isFrames) {
          const genType = _GenTab.genTypeSelect?.value;
          if (genType === "Video") {
            const vModel = window.ModelRegistry?.findModel?.(
              "flow",
              _GenTab.videoModelSelect?.value || "",
            );
            if (vModel?.config?.supports_voice === true)
              tabs.push(window.MentionMenu.voiceTab());
          }
          const mv =
            genType === "Image"
              ? _GenTab.imageModelSelect?.value
              : _GenTab.videoModelSelect?.value;
          const mObj = window.ModelRegistry?.findModel?.("flow", mv || "");
          if (mObj?.config?.supports_character === true)
            tabs.push(window.MentionMenu.charTab());
        }
        return tabs;
      },
      defaultTabId: () =>
        _GenTab.refImageMode === "mention" &&
        _GenTab._mentionRefEntries().length > 0
          ? "ref"
          : "char",
    });
    if (window.MentionChips) {
      _GenTab._mentionChips = new window.MentionChips(textarea, {
        includeComponents: () =>
          !(
            _GenTab.genTypeSelect?.value === "Video" &&
            _GenTab.videoInputTypeSelect?.value === "Frames"
          ),
        includeRefs: () => _GenTab.refImageMode === "mention",
        resolveRef: (name) => {
          const ids = _GenTab.fileIdsInput?.value
            ? _GenTab.fileIdsInput.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : [];
          for (const id of ids) {
            if (_GenTab.refImageNames[id] === name) {
              return {
                found: true,
                thumbnail: _GenTab.thumbnailCache?.[id] || null,
              };
            }
          }
          return { found: false };
        },
      });
    }
    textarea.addEventListener("input", () => _GenTab._syncPickerMentionState());
    _GenTab._syncPickerMentionState();
  }
  static _syncPickerMentionState() {
    const isFrames =
      _GenTab.genTypeSelect?.value === "Video" &&
      _GenTab.videoInputTypeSelect?.value === "Frames";
    const comps = isFrames
      ? []
      : window.MentionParser?.parseComponents?.(
          _GenTab.promptsArea?.value || "",
        ) || [];
    const lock = (triggerId, locked, text, type) => {
      const trigger = document.getElementById(triggerId);
      if (!trigger) return;
      if (locked)
        (type === "voice"
          ? _GenTab._voicePicker
          : _GenTab._characterPicker
        )?.clearForMention();
      window.WorkflowEditor?._applyPickerMentionLock?.(
        trigger,
        locked,
        text,
        type,
      );
    };
    lock(
      "genVideoVoiceTrigger",
      comps.some((c) => c.type === "voice"),
      window.I18n?.t?.("voice.mentionOverride") ||
        "Using voice from prompt mention",
      "voice",
    );
    lock(
      "genCharacterTrigger",
      comps.some((c) => c.type === "char"),
      window.I18n?.t?.("character.mentionOverride") ||
        "Using character from prompt mention",
      "char",
    );
  }
  static _initAutocomplete() {
    const textarea = _GenTab.promptsArea;
    if (!textarea || textarea._autocompleteInit) return;
    textarea._autocompleteInit = true;
    let dropdown = document.getElementById("mentionAutocompleteDropdown");
    if (!dropdown) {
      dropdown = document.createElement("div");
      dropdown.id = "mentionAutocompleteDropdown";
      dropdown.className = "mention-autocomplete-dropdown";
      dropdown.style.display = "none";
      document.body.appendChild(dropdown);
    }
    _GenTab._autocompleteDropdown = dropdown;
    _GenTab._autocompleteIndex = -1;
    textarea.addEventListener("input", () =>
      _GenTab._handleAutocompleteInput(),
    );
    textarea.addEventListener("keydown", (e) =>
      _GenTab._handleAutocompleteKeydown(e),
    );
    textarea.addEventListener("blur", () => {
      setTimeout(() => _GenTab._hideAutocomplete(), 150);
    });
  }
  static _handleAutocompleteInput() {
    if (_GenTab.refImageMode !== "mention") {
      _GenTab._hideAutocomplete();
      return;
    }
    if (_GenTab._autocompleteDebounceTimer) {
      clearTimeout(_GenTab._autocompleteDebounceTimer);
    }
    _GenTab._autocompleteDebounceTimer = setTimeout(() => {
      _GenTab._autocompleteDebounceTimer = null;
      _GenTab._doAutocompleteFilter();
    }, 150);
  }
  static _doAutocompleteFilter() {
    const textarea = _GenTab.promptsArea;
    if (!textarea) return;
    if (_GenTab._mentionMenu) {
      _GenTab._hideAutocomplete();
      return;
    }
    if (_GenTab.refImageMode !== "mention") {
      _GenTab._hideAutocomplete();
      _GenTab._lastFilterKey = null;
      return;
    }
    const cursorPos = textarea.selectionStart;
    const text = textarea.value.slice(0, cursorPos);
    const atMatch = text.match(/@(\[[^\]]*|[a-zA-Z0-9_]*)$/);
    if (!atMatch) {
      _GenTab._hideAutocomplete();
      _GenTab._lastFilterKey = null;
      return;
    }
    const query = atMatch[1].toLowerCase();
    const atPos = cursorPos - atMatch[0].length;
    const currentIds = _GenTab.fileIdsInput?.value
      ? _GenTab.fileIdsInput.value
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const seenNames = new Set();
    const entries = [];
    for (const id of currentIds) {
      const name = _GenTab.refImageNames[id];
      if (!name || seenNames.has(name)) continue;
      if (!name.toLowerCase().includes(query)) continue;
      seenNames.add(name);
      const thumb = _GenTab.thumbnailCache?.[id] || null;
      entries.push({ name, fileId: id, thumb });
    }
    if (entries.length === 0) {
      _GenTab._hideAutocomplete();
      _GenTab._lastFilterKey = null;
      return;
    }
    const filterKey = query + "|" + entries.map((e) => e.name).join(",");
    if (filterKey === _GenTab._lastFilterKey) return;
    _GenTab._lastFilterKey = filterKey;
    _GenTab._showAutocomplete(entries, atPos, query.length + 1);
  }
  static _getTextareaCaretCoords(textarea) {
    const rect = textarea.getBoundingClientRect();
    const style = window.getComputedStyle(textarea);
    const lineHeight =
      parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2 || 16;
    const mirror = document.createElement("div");
    const props = [
      "boxSizing",
      "width",
      "height",
      "overflowX",
      "overflowY",
      "borderTopWidth",
      "borderRightWidth",
      "borderBottomWidth",
      "borderLeftWidth",
      "borderStyle",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "fontStyle",
      "fontVariant",
      "fontWeight",
      "fontStretch",
      "fontSize",
      "fontSizeAdjust",
      "lineHeight",
      "fontFamily",
      "textAlign",
      "textTransform",
      "textIndent",
      "textDecoration",
      "letterSpacing",
      "wordSpacing",
      "tabSize",
      "MozTabSize",
    ];
    for (const p of props) mirror.style[p] = style[p];
    mirror.style.position = "absolute";
    mirror.style.visibility = "hidden";
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.wordWrap = "break-word";
    mirror.style.top = "0";
    mirror.style.left = "-9999px";
    const caretIdx = textarea.selectionStart;
    const before = textarea.value.substring(0, caretIdx);
    mirror.textContent = before;
    const marker = document.createElement("span");
    marker.textContent = "\u200B";
    mirror.appendChild(marker);
    document.body.appendChild(mirror);
    const markerRect = marker.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    const offsetTop = markerRect.top - mirrorRect.top;
    const offsetLeft = markerRect.left - mirrorRect.left;
    document.body.removeChild(mirror);
    const left = rect.left + offsetLeft - textarea.scrollLeft;
    const top = rect.top + offsetTop - textarea.scrollTop;
    return { left, top, bottom: top + lineHeight, lineHeight };
  }
  static _showAutocomplete(entries, atPos, replaceLength) {
    const dropdown = _GenTab._autocompleteDropdown;
    if (!dropdown) return;
    _GenTab._autocompleteAtPos = atPos;
    _GenTab._autocompleteReplaceLength = replaceLength;
    _GenTab._autocompleteIndex = 0;
    const escapeAttr = (s) =>
      String(s).replace(/"/g, "&quot;").replace(/&/g, "&amp;");
    const escapeHtml = (s) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    dropdown.innerHTML = entries
      .slice(0, 8)
      .map((entry, i) => {
        const item =
          typeof entry === "string" ? { name: entry, thumb: null } : entry;
        const thumbHtml = item.thumb
          ? `<img class="mention-autocomplete-thumb" src="${escapeAttr(item.thumb)}" alt="" />`
          : '<span class="mention-autocomplete-thumb mention-autocomplete-thumb-placeholder"></span>';
        return `<div class="mention-autocomplete-item ${i === 0 ? "selected" : ""}" data-name="${escapeAttr(item.name)}">${thumbHtml}<span class="mention-autocomplete-name">@${escapeHtml(item.name)}</span></div>`;
      })
      .join("");
    const textarea = _GenTab.promptsArea;
    const rect = textarea.getBoundingClientRect();
    const caret = _GenTab._getTextareaCaretCoords(textarea);
    const dropdownMaxHeight = 200;
    const spaceBelow = window.innerHeight - caret.bottom;
    const placeAbove =
      spaceBelow < dropdownMaxHeight && caret.top > dropdownMaxHeight;
    const dropdownWidth = 240;
    const left = Math.max(
      rect.left,
      Math.min(caret.left, rect.right - dropdownWidth),
    );
    dropdown.style.display = "block";
    dropdown.style.position = "fixed";
    dropdown.style.left = `${left}px`;
    dropdown.style.top = placeAbove
      ? `${caret.top - dropdownMaxHeight - 4}px`
      : `${caret.bottom + 2}px`;
    dropdown.style.width = `${dropdownWidth}px`;
    dropdown.style.minWidth = `${dropdownWidth}px`;
    dropdown.style.zIndex = "10000010";
    dropdown.querySelectorAll(".mention-autocomplete-item").forEach((item) => {
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        _GenTab._selectAutocompleteItem(item.dataset.name);
      });
    });
  }
  static _hideAutocomplete() {
    const dropdown = _GenTab._autocompleteDropdown;
    if (dropdown) {
      dropdown.style.display = "none";
    }
    _GenTab._autocompleteIndex = -1;
    _GenTab._lastFilterKey = null;
  }
  static _handleAutocompleteKeydown(e) {
    const dropdown = _GenTab._autocompleteDropdown;
    if (!dropdown || dropdown.style.display === "none") return;
    const items = dropdown.querySelectorAll(".mention-autocomplete-item");
    if (items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      _GenTab._autocompleteIndex = Math.min(
        _GenTab._autocompleteIndex + 1,
        items.length - 1,
      );
      _GenTab._updateAutocompleteSelection(items);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      _GenTab._autocompleteIndex = Math.max(_GenTab._autocompleteIndex - 1, 0);
      _GenTab._updateAutocompleteSelection(items);
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (_GenTab._autocompleteIndex >= 0) {
        e.preventDefault();
        const selectedItem = items[_GenTab._autocompleteIndex];
        if (selectedItem) {
          _GenTab._selectAutocompleteItem(selectedItem.dataset.name);
        }
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      _GenTab._hideAutocomplete();
    }
  }
  static _updateAutocompleteSelection(items) {
    items.forEach((item, i) => {
      item.classList.toggle("selected", i === _GenTab._autocompleteIndex);
    });
  }
  static _selectAutocompleteItem(name) {
    const textarea = _GenTab.promptsArea;
    if (!textarea) return;
    const atPos = _GenTab._autocompleteAtPos;
    const replaceLen = _GenTab._autocompleteReplaceLength;
    const text = textarea.value;
    const newText =
      text.slice(0, atPos) + `@${name} ` + text.slice(atPos + replaceLen);
    textarea.value = newText;
    const newCursorPos = atPos + name.length + 2;
    textarea.selectionStart = textarea.selectionEnd = newCursorPos;
    textarea.focus();
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    _GenTab._hideAutocomplete();
  }
  static _getCurrentRefImagesWithNames() {
    const ids = (_GenTab.fileIdsInput?.value || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return ids.map((id, index) => {
      const name = _GenTab.refImageNames[id] || `image_${index + 1}`;
      return {
        file_id: id,
        name,
        thumbnail_url: _GenTab.thumbnailCache[id] || null,
        file_name: _GenTab.fileNameCache[id] || null,
        type: id.startsWith("upload_") ? "upload" : "flow",
      };
    });
  }
  static _clearAllReferences() {
    if (
      !_GenTab.fileIdsInput ||
      _GenTab._localRefsUploadRunning ||
      _GenTab._providerSubmitRunning
    )
      return;
    const ids = new Set(
      _GenTab.fileIdsInput.value
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    );
    if (!ids.size) return;
    _GenTab.fileIdsInput.value = "";
    for (const id of ids) {
      for (const key of [
        "thumbnailCache",
        "fileNameCache",
        "mediaUuidCache",
        "refImageNames",
        "refMediaTypes",
        "refVideoUrls",
      ]) {
        if (_GenTab[key]) delete _GenTab[key][id];
      }
      if (id.startsWith("upload_")) {
        window.ImmediateUploader?.cancel?.(id);
        window.pendingUploadFiles?.delete(id);
        window.PendingUploadStore?.remove?.(id)?.catch?.(() => {});
      }
    }
    for (let i = 0; i < (_GenTab._perPromptFrameData?.length || 0); i++) {
      for (const frame of [1, 2])
        if (ids.has(_GenTab._perPromptFrameData[i]?.["frame" + frame])) {
          _GenTab._setPerPromptFrame(i, frame, "", "");
        }
    }
    for (const frame of [1, 2])
      if (
        ids.has(document.getElementById(`genTabFrame${frame}FileId`)?.value)
      ) {
        _GenTab._setFrameImage(frame, "", "");
      }
    _GenTab.fileIdsInput.dispatchEvent(new Event("input", { bubbles: true }));
  }
  static _removeRefImage(id) {
    let newIds = _GenTab.fileIdsInput.value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    newIds = newIds.filter((v) => v !== id);
    _GenTab.fileIdsInput.value = newIds.join(", ");
    delete _GenTab.thumbnailCache[id];
    delete _GenTab.fileNameCache[id];
    delete _GenTab.refImageNames[id];
    if (id.startsWith("upload_")) {
      if (window.ImmediateUploader) ImmediateUploader.cancel(id);
      else window.pendingUploadFiles?.delete(id);
    }
    _GenTab.renderFileIdThumbnails();
    _GenTab._refreshMentionHelper();
    try {
      _GenTab.fileIdsInput.dispatchEvent(new Event("input", { bubbles: true }));
      _GenTab.saveState();
    } catch (e) {}
  }
  static async _saveRefImageToAlbum(fileId, thumbnailUrl) {
    if (!window.AlbumStore || !window.ImageStore) {
      window.customDialog?.alert(
        window.I18n?.t("albumNotify.notReady") || "Album not ready.",
        { type: "warning" },
      );
      return;
    }
    try {
      const albums = await window.AlbumStore.getAlbums();
      if (!albums || albums.length === 0) {
        const shouldCreate = await window.customDialog?.confirm(
          window.I18n?.t("imagePicker.noAlbumCreatePrompt") ||
            "No albums yet. Would you like to create a new album?",
          {
            title: window.I18n?.t("imagePicker.saveToAlbum") || "Save to album",
            type: "info",
          },
        );
        if (shouldCreate && window.AlbumCreateModal) {
          window.AlbumCreateModal.show(() => {
            _GenTab._saveRefImageToAlbum(fileId, thumbnailUrl);
          });
        }
        return;
      }
      const overlay = document.createElement("div");
      overlay.className = "album-modal-overlay";
      const saveToAlbumTitle =
        window.I18n?.t("imagePicker.saveToAlbum") || "Save to album";
      overlay.innerHTML = `
        <div class="album-modal" style="max-width: 360px;">
          <div class="album-modal-header">
            <div class="album-modal-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
              </svg>
              ${saveToAlbumTitle}
            </div>
            <button class="album-modal-close" id="saveAlbumModalClose">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div class="album-modal-body" style="max-height: 300px; overflow-y: auto;">
            <div class="album-save-list">
              ${albums
                .map(
                  (a) => `
                <div class="album-save-item" data-album-id="${a.id}" data-album-name="${a.name}">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>
                  <span>${a.name}</span>
                  <span class="album-save-item-count">${(a.image_ids || []).length} \u1EA3nh</span>
                </div>
              `,
                )
                .join("")}
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const closeModal = () => {
        overlay.remove();
        document.removeEventListener("keydown", escHandler);
      };
      const escHandler = (e) => {
        if (e.key === "Escape") closeModal();
      };
      document.addEventListener("keydown", escHandler);
      overlay
        .querySelector("#saveAlbumModalClose")
        ?.addEventListener("click", closeModal);
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeModal();
      });
      ["mousedown", "mouseup", "pointerdown", "pointerup"].forEach((evt) => {
        overlay.addEventListener(evt, (e) => e.stopPropagation());
      });
      overlay.querySelectorAll(".album-save-item").forEach((item) => {
        item.addEventListener("click", async () => {
          const albumId = item.dataset.albumId;
          const albumName = item.dataset.albumName;
          closeModal();
          try {
            const existingImages =
              await window.ImageStore.getAlbumImages(albumId);
            const isDuplicate = existingImages.some(
              (img) => img.file_id === fileId,
            );
            if (isDuplicate) {
              window.customDialog?.alert(
                window.I18n?.t("albumNotify.duplicateImage", {
                  album: albumName,
                }) || `This image is already in the album "${albumName}".`,
                {
                  title:
                    window.I18n?.t("albumNotify.duplicateImageTitle") ||
                    "Duplicate image",
                  type: "info",
                },
              );
              return;
            }
            const usedNames = new Set(
              existingImages.map((i) => i.name).filter(Boolean),
            );
            let baseName = (_GenTab.refImageNames[fileId] || "image")
              .toLowerCase()
              .replace(/[^a-z0-9_]/g, "_");
            let finalName = baseName;
            let counter = 1;
            while (usedNames.has(finalName)) {
              finalName = `${baseName}_${counter}`;
              counter++;
            }
            const fileName = _GenTab.fileNameCache[fileId] || null;
            const imageData = {
              name: finalName,
              type: "flow",
              file_id: fileId,
              file_name: fileName,
              thumbnail_url: thumbnailUrl || null,
            };
            let thumbnailBlob = null;
            if (thumbnailUrl) {
              try {
                const fetchResult = await new Promise((resolve) => {
                  chrome.runtime.sendMessage(
                    {
                      action: "fetchBlob",
                      url: thumbnailUrl.split("=")[0],
                      expectImage: true,
                    },
                    (r) => resolve(r),
                  );
                });
                if (fetchResult?.success && fetchResult.base64) {
                  const binary = atob(fetchResult.base64);
                  const bytes = new Uint8Array(binary.length);
                  for (let i = 0; i < binary.length; i++)
                    bytes[i] = binary.charCodeAt(i);
                  thumbnailBlob = new Blob([bytes], {
                    type: fetchResult.contentType || "image/jpeg",
                  });
                }
              } catch (e) {
                console.warn(
                  "[GenTab] Failed to fetch thumbnail blob for album save:",
                  e,
                );
              }
            }
            if (thumbnailBlob && window.WatermarkClient) {
              try {
                thumbnailBlob = await window.WatermarkClient.cleanBlob(
                  thumbnailBlob,
                  "image",
                );
              } catch (e) {
                console.warn(
                  "[GenTab] album: b\u1ECF qua xo\xE1 watermark:",
                  e?.message,
                );
              }
            }
            await window.ImageStore.addImage(
              albumId,
              imageData,
              thumbnailBlob,
              null,
            );
            window.customDialog?.alert(
              window.I18n?.t("albumNotify.saveImageSuccess", {
                album: albumName,
              }) || `Saved image to the album "${albumName}".`,
              {
                title:
                  window.I18n?.t("albumNotify.saveImageSuccessTitle") ||
                  "Success",
                type: "success",
              },
            );
          } catch (err) {
            console.error(
              "[GenTab] L\u1ED7i l\u01B0u \u1EA3nh v\xE0o album:",
              err,
            );
            window.customDialog?.alert(
              window.I18n?.t("albumNotify.saveImageFailed") ||
                "Failed to save image. Please try again.",
              { type: "error" },
            );
          }
        });
      });
    } catch (err) {
      console.error("[GenTab] L\u1ED7i m\u1EDF modal l\u01B0u album:", err);
    }
  }
  static async _removeFailedAlbumImage(fileId) {
    if (!window.AlbumStore || !window.ImageStore) return;
    try {
      const albums = await window.AlbumStore.getAlbums();
      for (const album of albums) {
        const images = await window.ImageStore.getAlbumImages(album.id);
        const found = images.find((img) => img.file_id === fileId);
        if (found) {
          await window.ImageStore.deleteImage(found.id);
          console.log(
            "[GenTab] Removed failed album image:",
            found.id,
            "file_id:",
            fileId,
          );
          window.eventBus?.emit("album:refresh");
          return;
        }
      }
    } catch (err) {
      console.warn("[GenTab] Failed to remove album image:", err.message);
    }
  }
  static _editRefImageName(fileId, currentName) {
    const thumbEl = document.querySelector(
      `.ref-thumb[data-ref-id="${fileId}"]`,
    );
    if (!thumbEl) return;
    const existingPopup = document.querySelector(".ref-image-name-popup");
    const existingBackdrop = document.querySelector(
      ".ref-image-name-popup-backdrop",
    );
    if (existingPopup) existingPopup.remove();
    if (existingBackdrop) existingBackdrop.remove();
    const rect = thumbEl.getBoundingClientRect();
    const backdrop = document.createElement("div");
    backdrop.className = "ref-image-name-popup-backdrop";
    const popup = document.createElement("div");
    popup.className = "ref-image-name-popup";
    popup.style.left = `${Math.max(8, rect.left)}px`;
    popup.style.top = `${rect.bottom + 8}px`;
    const title = document.createElement("div");
    title.className = "ref-image-name-popup-title";
    title.textContent =
      window.I18n?.t("gen.imageNameMention") || "Image name (for @mention)";
    popup.appendChild(title);
    const inputWrap = document.createElement("div");
    inputWrap.className = "ref-image-name-input-wrap";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "ref-image-name-input";
    input.value = currentName;
    input.placeholder = "a-z, 0-9, _";
    inputWrap.appendChild(input);
    const saveBtn = document.createElement("button");
    saveBtn.className = "ref-image-name-save";
    saveBtn.title = "Save";
    saveBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    inputWrap.appendChild(saveBtn);
    popup.appendChild(inputWrap);
    document.body.appendChild(backdrop);
    document.body.appendChild(popup);
    setTimeout(() => {
      input.focus();
      input.select();
    }, 10);
    const close = () => {
      popup.remove();
      backdrop.remove();
    };
    const save = () => {
      let newName = input.value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_");
      if (!newName) newName = `image_${Date.now() % 1e4}`;
      if (_GenTab._validateUniqueName(newName, fileId)) {
        _GenTab.refImageNames[fileId] = newName;
        if (window.imageNameRegistry) {
          window.imageNameRegistry.register(newName, {
            file_id: fileId,
            thumbnail_url: _GenTab.thumbnailCache[fileId],
            type: fileId.startsWith("upload_") ? "upload" : "flow",
          });
        }
        thumbEl.dataset.name = newName;
        thumbEl.title = `@${newName} - Click to edit name`;
        const itemEl = thumbEl.closest(".ref-item");
        if (itemEl) {
          const nameLabel = itemEl.querySelector(".ref-item-name");
          if (nameLabel) {
            nameLabel.textContent = newName;
          }
        }
        _GenTab._refreshMentionHelper();
        _GenTab.saveState();
        close();
      } else {
        input.style.borderColor = "var(--destructive)";
        input.focus();
      }
    };
    backdrop.addEventListener("click", close);
    saveBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      save();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        save();
      }
      if (e.key === "Escape") {
        close();
      }
    });
  }
  static _validateUniqueName(name, excludeFileId) {
    for (const [fid, n] of Object.entries(_GenTab.refImageNames)) {
      if (fid !== excludeFileId && n === name) {
        return false;
      }
    }
    return true;
  }
  static async _saveRefImagesToAlbum() {
    const refImages = _GenTab._getCurrentRefImagesWithNames();
    if (refImages.length === 0) {
      if (window.customDialog) {
        window.customDialog.alert(
          window.I18n?.t("gen.noRefImagesToSave") ||
            "No reference images to save.",
          { type: "warning" },
        );
      }
      return;
    }
    let albumName;
    if (window.customDialog) {
      albumName = await window.customDialog.prompt(
        window.I18n?.t("gen.enterAlbumName") || "Enter album name:",
        {
          title: window.I18n?.t("albums.createAlbum") || "Create new album",
          placeholder:
            window.I18n?.t("gen.albumNamePlaceholder") ||
            "e.g.: Main character",
          confirmText: window.I18n?.t("common.create") || "Create",
          cancelText: window.I18n?.t("common.cancel") || "Cancel",
        },
      );
    } else {
      albumName = prompt(
        window.I18n?.t("gen.enterAlbumName") || "Enter album name:",
      );
    }
    if (!albumName || !albumName.trim()) return;
    albumName = albumName.trim();
    try {
      if (!window.AlbumStore) {
        throw new Error("AlbumStore ch\u01B0a s\u1EB5n s\xE0ng");
      }
      const album = await window.AlbumStore.createAlbum(albumName);
      for (const img of refImages) {
        if (window.ImageStore) {
          let thumbBlob = null;
          let fullBlob = null;
          if (img.file_id.startsWith("upload_") && window.pendingUploadFiles) {
            const pending = window.pendingUploadFiles.get(img.file_id);
            if (pending?.file) {
              fullBlob = pending.file;
              try {
                thumbBlob = await ImageStore.compressThumbnail(pending.file);
              } catch (e) {
                console.warn(
                  "[GenTab] Kh\xF4ng th\u1EC3 t\u1EA1o thumbnail:",
                  e,
                );
              }
            }
          }
          if (!thumbBlob && img.thumbnail_url) {
            try {
              const fetchResult = await new Promise((resolve) => {
                chrome.runtime.sendMessage(
                  {
                    action: "fetchBlob",
                    url: img.thumbnail_url.split("=")[0],
                    expectImage: true,
                  },
                  (r) => resolve(r),
                );
              });
              if (fetchResult?.success && fetchResult.base64) {
                const binary = atob(fetchResult.base64);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++)
                  bytes[i] = binary.charCodeAt(i);
                thumbBlob = new Blob([bytes], {
                  type: fetchResult.contentType || "image/jpeg",
                });
              }
            } catch (e) {
              console.warn(
                "[GenTab] Failed to fetch thumbnail blob for batch album save:",
                e,
              );
            }
          }
          if (thumbBlob && window.WatermarkClient) {
            try {
              thumbBlob = await window.WatermarkClient.cleanBlob(
                thumbBlob,
                "image",
              );
            } catch (e) {
              console.warn(
                "[GenTab] album l\xF4: b\u1ECF qua xo\xE1 watermark:",
                e?.message,
              );
            }
          }
          await window.ImageStore.addImage(
            album.id,
            {
              name: img.name,
              type: img.type,
              file_id: img.file_id,
              file_name: img.file_name,
              thumbnail_url: img.thumbnail_url,
            },
            thumbBlob,
            fullBlob,
          );
        }
      }
      if (window.customDialog) {
        window.customDialog.alert(
          window.I18n?.t("albumNotify.createAlbumSuccess", {
            album: albumName,
            count: refImages.length,
          }) ||
            `\u0110\xE3 t\u1EA1o album "${albumName}" v\u1EDBi ${refImages.length} \u1EA3nh.`,
          {
            title:
              window.I18n?.t("albumNotify.saveImageSuccessTitle") || "Success",
            type: "success",
          },
        );
      }
      if (window.eventBus) {
        window.eventBus.emit("album:created", {
          album,
          imageCount: refImages.length,
        });
      }
    } catch (err) {
      console.error("[GenTab] L\u1ED7i t\u1EA1o album:", err);
      if (window.customDialog) {
        window.customDialog.alert(
          window.I18n?.t("albumNotify.createAlbumFailed", {
            error: err.message,
          }) || `Unable to create album: ${err.message}`,
          {
            title:
              window.I18n?.t("albumNotify.createAlbumFailedTitle") || "Error",
            type: "error",
          },
        );
      }
    }
  }
  static _getConfirmPromptCount() {
    const text = _GenTab.promptsArea?.value?.trim() || "";
    if (!text) return 0;
    return _GenTab.multiPromptCheck?.checked
      ? text.split(/\n\s*\n/).filter((block) => block.trim()).length
      : 1;
  }
  static _syncConfirmPromptMode() {
    const isMulti = _GenTab.multiPromptCheck?.checked === true;
    document
      .querySelectorAll("#confirmPromptModeToggle .confirm-prompt-toggle-btn")
      .forEach((button) => {
        const active = (button.dataset.mode === "multi") === isMulti;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
    const count = _GenTab._getConfirmPromptCount();
    const countEl = document.getElementById("confirmPromptCount");
    if (countEl) countEl.textContent = String(count);
    const runModeRow = document.getElementById("confirmRunModeRow");
    if (runModeRow)
      runModeRow.classList.toggle(
        "hidden",
        !(
          isMulti &&
          count > 1 &&
          document.getElementById("genProvider")?.value === "flow"
        ),
      );
  }
  static _initConfirmModal() {
    const overlay = document.getElementById("confirmRunOverlay");
    const cancelBtn = document.getElementById("confirmRunCancel");
    const closeBtn = document.getElementById("confirmRunClose");
    if (!overlay) return;
    const hide = () => {
      overlay.classList.add("hidden");
      if (_GenTab._confirmStatusPollTimer) {
        clearInterval(_GenTab._confirmStatusPollTimer);
        _GenTab._confirmStatusPollTimer = null;
      }
      if (_GenTab._confirmReject) _GenTab._confirmReject();
      _GenTab._confirmResolve = null;
      _GenTab._confirmReject = null;
    };
    cancelBtn?.addEventListener("click", hide);
    closeBtn?.addEventListener("click", hide);
    document
      .querySelectorAll("#confirmPromptModeToggle .confirm-prompt-toggle-btn")
      .forEach((button) => {
        button.addEventListener("click", () => {
          if (!_GenTab.multiPromptCheck) return;
          const isMulti = button.dataset.mode === "multi";
          if (_GenTab.multiPromptCheck.checked !== isMulti) {
            _GenTab.multiPromptCheck.checked = isMulti;
            _GenTab.multiPromptCheck.dispatchEvent(
              new Event("change", { bubbles: true }),
            );
          }
          _GenTab._syncConfirmPromptMode();
        });
      });
    const confirmQtyInput = document.getElementById("confirmQuantity");
    const _confGetRange = () => {
      const r =
        window.ProviderConfigManager?.safeGetQuantityRangeSync?.("flow");
      return { min: r?.min ?? 1, max: r?.max ?? 4 };
    };
    document
      .getElementById("confirmQtyMinus")
      ?.addEventListener("click", () => {
        const { min } = _confGetRange();
        const val = parseInt(confirmQtyInput?.value, 10) || min;
        if (val > min && confirmQtyInput)
          confirmQtyInput.value = String(val - 1);
      });
    document.getElementById("confirmQtyPlus")?.addEventListener("click", () => {
      const { max, min } = _confGetRange();
      const val = parseInt(confirmQtyInput?.value, 10) || min;
      if (val < max && confirmQtyInput) confirmQtyInput.value = String(val + 1);
    });
    document
      .getElementById("confirmRunSubmit")
      ?.addEventListener("click", () => {
        const confirmRatio = document.getElementById("confirmAspectRatio");
        const confirmQty = document.getElementById("confirmQuantity");
        const confirmRes = document.getElementById("confirmDownloadRes");
        const _curProvider =
          document.getElementById("genProvider")?.value || "flow";
        const isFlowProvider = _curProvider === "flow";
        if (confirmRatio && _GenTab.aspectRatioSelect) {
          _GenTab.aspectRatioSelect.value = confirmRatio.value;
          if (_curProvider === "gemini")
            _GenTab._rememberGeminiRatioSelection();
        }
        if (isFlowProvider && confirmQty && _GenTab.quantitySelect) {
          _GenTab.quantitySelect.value = confirmQty.value;
        }
        if (
          isFlowProvider &&
          confirmRes &&
          !confirmRes.disabled &&
          confirmRes.selectedIndex >= 0
        ) {
          const autoDownloadToggle =
            document.getElementById("genTabAutoDownload");
          const isVideo = _GenTab.genTypeSelect?.value === "Video";
          const genTabDownloadRes = document.getElementById(
            "genTabDownloadResolution",
          );
          const genTabVideoDownloadRes = document.getElementById(
            "genTabVideoDownloadResolution",
          );
          if (confirmRes.value) {
            if (autoDownloadToggle) autoDownloadToggle.checked = true;
            if (isVideo) {
              if (genTabVideoDownloadRes)
                genTabVideoDownloadRes.value = confirmRes.value;
            } else {
              if (genTabDownloadRes) genTabDownloadRes.value = confirmRes.value;
            }
          } else {
            if (autoDownloadToggle) autoDownloadToggle.checked = false;
          }
          if (_GenTab._syncDownloadVisibility)
            _GenTab._syncDownloadVisibility();
        }
        overlay.classList.add("hidden");
        if (_GenTab._confirmResolve) _GenTab._confirmResolve(true);
        _GenTab._confirmResolve = null;
        _GenTab._confirmReject = null;
      });
  }
  static _syncConfirmProviderName(providerKey, mode) {
    const label = document.getElementById("confirmProviderLabel");
    if (!label) return;
    if (providerKey !== void 0) label.dataset.provider = providerKey;
    if (mode !== void 0) label.dataset.providerMode = mode;
    const name = window.ProviderMeta?.getSync?.(label.dataset.provider)?.name;
    label.textContent =
      typeof name === "string" && name.trim()
        ? name +
          (label.dataset.providerMode
            ? " \xB7 " + label.dataset.providerMode
            : "")
        : "";
  }
  static _showConfirmModal(promptCount) {
    return new Promise((resolve) => {
      const overlay = document.getElementById("confirmRunOverlay");
      if (!overlay) {
        resolve(true);
        return;
      }
      const confirmRatio = document.getElementById("confirmAspectRatio");
      const confirmQty = document.getElementById("confirmQuantity");
      const confirmRes = document.getElementById("confirmDownloadRes");
      _GenTab._syncConfirmPromptMode();
      const providerKey =
        document.getElementById("genProvider")?.value || "flow";
      const isChatGPT = providerKey === "chatgpt";
      const isGrok = providerKey === "grok";
      const isGemini = providerKey === "gemini";
      const isMuse = providerKey === "muse";
      const isFlow = providerKey === "flow";
      const flowTabsWarning = document.getElementById("confirmFlowTabsWarning");
      if (flowTabsWarning) {
        flowTabsWarning.classList.add("hidden");
        flowTabsWarning.replaceChildren();
      }
      const confirmRunButton = document.getElementById("confirmRunSubmit");
      const currentGenType =
        document.getElementById("genType")?.value || "Image";
      const flowComponentState = isFlow
        ? _GenTab._flowWebOnlyComponentState(
            [_GenTab.promptsArea?.value || ""],
            currentGenType,
          )
        : { hasWebOnlyComponents: false, checks: {} };
      const flowApiConfigured =
        isFlow && window.FlowApiAdapter?.isApiModeIntended?.() === true;
      const flowApiIntended =
        flowApiConfigured && !flowComponentState.hasWebOnlyComponents;
      const flowApiRequired =
        flowApiIntended &&
        window.FlowApiAdapter?.isApiModeRequired?.() === true;
      let flowRouteAtConfirm = isFlow ? (flowApiIntended ? null : "web") : null;
      if (isFlow) {
        console.info(
          "[GenTab] Confirm Flow route",
          JSON.stringify({
            apiConfigured: flowApiConfigured,
            effectiveRoute: flowApiIntended ? "api" : "web",
            reason: flowComponentState.hasWebOnlyComponents
              ? "component_web_only"
              : flowApiConfigured
                ? "api_intended"
                : "api_not_intended",
            componentChecks: flowComponentState.checks,
          }),
        );
      }
      const requiresProviderReady =
        isFlow || isChatGPT || isGrok || isGemini || isMuse || flowApiRequired;
      let flowAdmissionPending = isFlow;
      const setConfirmRunReady = (ready) => {
        if (!confirmRunButton) return;
        const enabled =
          (!requiresProviderReady || ready === true) && !flowAdmissionPending;
        confirmRunButton.disabled = !enabled;
        confirmRunButton.setAttribute("aria-disabled", String(!enabled));
      };
      setConfirmRunReady(!requiresProviderReady);
      const providerStatusRow = document.getElementById(
        "confirmProviderStatus",
      );
      const providerBadge = document.getElementById("confirmProviderBadge");
      if (_GenTab._confirmStatusPollTimer) {
        clearInterval(_GenTab._confirmStatusPollTimer);
        _GenTab._confirmStatusPollTimer = null;
      }
      const providerLogoEl = document.getElementById("confirmProviderLogo");
      if (providerLogoEl)
        providerLogoEl.innerHTML =
          window.ProviderBrandIcons?.get?.(providerKey) || "";
      _GenTab._syncConfirmProviderName(
        providerKey,
        isFlow && flowComponentState.hasWebOnlyComponents ? "Web" : "",
      );
      if (providerStatusRow) {
        const iconCheckF = `<svg class="badge-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
        const iconWarningF = `<svg class="badge-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
        const iconSpinnerF = `<svg class="badge-icon badge-icon-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
        providerStatusRow.classList.remove("hidden");
        if (isFlow) {
          if (providerBadge) {
            providerBadge.className = "confirm-run-provider-badge is-checking";
            providerBadge.innerHTML = `${iconSpinnerF}<span class="badge-text">${window.I18n?.t("gen.providerStatusChecking") || "Checking..."}</span>`;
          }
          const flowActivationPromise =
            _GenTab._flowActivationPromise ||
            chrome.runtime.sendMessage({
              action: "ensureFlowTabActive",
              focusWindow: true,
            });
          const waitForFlowActivation = async () => {
            try {
              return await flowActivationPromise;
            } finally {
              if (_GenTab._flowActivationPromise === flowActivationPromise) {
                _GenTab._flowActivationPromise = null;
              }
            }
          };
          let lastFlowStatusDiagnostic = null;
          const checkFlow = async () => {
            if (overlay.classList.contains("hidden")) {
              if (_GenTab._confirmStatusPollTimer) {
                clearInterval(_GenTab._confirmStatusPollTimer);
                _GenTab._confirmStatusPollTimer = null;
              }
              return false;
            }
            try {
              const activation = await waitForFlowActivation();
              window.MessageBridge?.renderFlowProjectTabsAdvisory?.(
                document.getElementById("confirmFlowTabsWarning"),
              ).catch?.(() => {});
              const resp =
                activation?.ok === true && !!activation.projectId
                  ? await chrome.runtime.sendMessage({
                      action: "checkFlowTabOpen",
                      passive: true,
                      readOnly: true,
                      readinessScope: "project",
                      targetTabId: activation.tabId,
                    })
                  : {
                      ready: false,
                      isOpen: activation?.ok === true,
                      error:
                        activation?.ok === true
                          ? "NO_PROJECT_OPEN"
                          : activation?.error || "NO_TAB",
                    };
              if (!providerBadge || overlay.classList.contains("hidden"))
                return false;
              flowAdmissionPending = false;
              if (resp?.ready ?? resp?.isOpen) {
                setConfirmRunReady(true);
                providerBadge.className = "confirm-run-provider-badge is-ready";
                providerBadge.innerHTML = `${iconCheckF}<span class="badge-text">${window.I18n?.t("gen.providerStatusReady") || "Ready"}</span>`;
                if (!flowApiIntended && _GenTab._confirmStatusPollTimer) {
                  clearInterval(_GenTab._confirmStatusPollTimer);
                  _GenTab._confirmStatusPollTimer = null;
                }
              } else {
                setConfirmRunReady(false);
                providerBadge.className =
                  "confirm-run-provider-badge is-warning";
                const statusText =
                  resp?.error === "CONTENT_REVISION_MISMATCH" ||
                  (resp?.projectId && resp?.contentReady === false)
                    ? window.I18n?.t("app.refreshFlowTab") ||
                      "Refresh the Google Flow tab and try again."
                    : resp?.isOpen === false || resp?.error === "NO_TAB"
                      ? window.I18n?.t("workflow.providerNoTab") ||
                        "Tab not opened"
                      : window.I18n?.t("workflow.projectNotReady") ||
                        "Flow project not ready";
                providerBadge.innerHTML = `${iconWarningF}<span class="badge-text">${statusText}</span>`;
                const diagnostic = JSON.stringify({
                  tabId: resp?.tabId || activation?.tabId || null,
                  driverKey: resp?.driverKey || null,
                  projectId: resp?.projectId || null,
                  isProjectEditor: resp?.isProjectEditor === true,
                  contentReady: resp?.contentReady === true,
                  preflightState: resp?.preflightState || null,
                  error: resp?.error || null,
                });
                if (diagnostic !== lastFlowStatusDiagnostic) {
                  lastFlowStatusDiagnostic = diagnostic;
                  console.warn(
                    "[GenTab] Flow confirm readiness rejected",
                    diagnostic,
                  );
                }
              }
              return resp?.ready ?? resp?.isOpen ?? false;
            } catch (_) {
              flowAdmissionPending = false;
              setConfirmRunReady(false);
              return false;
            }
          };
          let firstApiCheck = true;
          let flowStatusInFlight = false;
          const pollFlowStatus = async () => {
            if (overlay.classList.contains("hidden")) {
              if (_GenTab._confirmStatusPollTimer)
                clearInterval(_GenTab._confirmStatusPollTimer);
              _GenTab._confirmStatusPollTimer = null;
              return;
            }
            if (flowStatusInFlight) return;
            flowStatusInFlight = true;
            try {
              if (!flowApiIntended) {
                await checkFlow();
                return;
              }
              const activation = await waitForFlowActivation();
              if (activation?.ok !== true || !activation.projectId) {
                flowAdmissionPending = false;
                setConfirmRunReady(false);
                if (providerBadge) {
                  providerBadge.className =
                    "confirm-run-provider-badge is-warning";
                  const activationText =
                    activation?.ok === true
                      ? window.I18n?.t("workflow.projectNotReady") ||
                        "Flow project not ready"
                      : window.I18n?.t("workflow.providerNoTab") ||
                        "Tab not opened";
                  providerBadge.innerHTML = `${iconWarningF}<span class="badge-text">${activationText}</span>`;
                }
                return;
              }
              const options = {
                surface: "gen",
                mediaType:
                  document.getElementById("genType")?.value === "Video"
                    ? "video"
                    : "image",
                force: false,
                passive: true,
              };
              const br = await window.FlowApiSessionCoordinator?.check?.({
                ...options,
                force: firstApiCheck,
              });
              firstApiCheck = false;
              if (!providerBadge || overlay.classList.contains("hidden"))
                return;
              flowAdmissionPending = false;
              const submitModeRow2 = document.getElementById(
                "confirmSubmitModeRow",
              );
              if (br?.ready === true) {
                flowRouteAtConfirm = "api";
                _GenTab._syncConfirmProviderName(providerKey, "API");
                if (submitModeRow2) submitModeRow2.classList.add("hidden");
                setConfirmRunReady(true);
                providerBadge.className = "confirm-run-provider-badge is-ready";
                providerBadge.innerHTML = `${iconCheckF}<span class="badge-text">${window.I18n?.t("gen.providerStatusReady") || "Ready"}</span>`;
              } else if (flowApiRequired) {
                flowRouteAtConfirm = null;
                _GenTab._syncConfirmProviderName(providerKey, "API");
                if (submitModeRow2) submitModeRow2.classList.add("hidden");
                setConfirmRunReady(false);
                providerBadge.className =
                  "confirm-run-provider-badge is-warning";
                providerBadge.innerHTML = `${iconWarningF}<span class="badge-text">${window.I18n?.t("gen.bridgeNotReady") || "Bridge not ready"}</span>`;
              } else {
                flowRouteAtConfirm = "web";
                _GenTab._syncConfirmProviderName(providerKey, "Web");
                if (submitModeRow2) submitModeRow2.classList.remove("hidden");
                flowAdmissionPending = true;
                setConfirmRunReady(false);
                await checkFlow();
              }
            } catch (_) {
              firstApiCheck = false;
              flowAdmissionPending = true;
              setConfirmRunReady(false);
              if (!flowApiRequired) {
                flowRouteAtConfirm = "web";
                _GenTab._syncConfirmProviderName(providerKey, "Web");
                document
                  .getElementById("confirmSubmitModeRow")
                  ?.classList.remove("hidden");
                await checkFlow();
              }
            } finally {
              flowStatusInFlight = false;
            }
          };
          Promise.resolve().then(pollFlowStatus);
          _GenTab._confirmStatusPollTimer = setInterval(pollFlowStatus, 3e3);
        } else if (isChatGPT || isGrok || isGemini || isMuse) {
          const iconSpinner = `<svg class="badge-icon badge-icon-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
          const iconCheck = `<svg class="badge-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
          const iconWarning = `<svg class="badge-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
          const Session = isChatGPT
            ? window.ChatGPTSession
            : isGrok
              ? window.GrokSession
              : isGemini
                ? window.GeminiSession
                : window.MuseSession;
          let lastStatus = null;
          let statusCheckInFlight = false;
          const iconCloudflare = `<svg class="badge-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
          const checkAndUpdateStatus = async () => {
            if (!providerBadge || statusCheckInFlight) return;
            if (overlay.classList.contains("hidden")) {
              if (_GenTab._confirmStatusPollTimer) {
                clearInterval(_GenTab._confirmStatusPollTimer);
                _GenTab._confirmStatusPollTimer = null;
              }
              return;
            }
            statusCheckInFlight = true;
            try {
              let newStatus = "checking";
              let statusText =
                window.I18n?.t("gen.providerStatusChecking") || "Checking...";
              let statusIcon = iconSpinner;
              if (isGrok && Session?.checkStatus) {
                const status = await Session.checkStatus();
                if (status.loggedIn && !status.cloudflareChallenge) {
                  newStatus = "ready";
                } else if (status.cloudflareChallenge) {
                  newStatus = "cloudflare";
                  statusText =
                    window.I18n?.t("gen.providerStatusCloudflare") ||
                    "Waiting Cloudflare...";
                  statusIcon = iconCloudflare;
                } else {
                  newStatus = "login";
                  statusText =
                    window.I18n?.t("gen.providerStatusLogin") ||
                    "Not logged in";
                  statusIcon = iconWarning;
                }
              } else if (Session?.ensureReady) {
                if (isChatGPT && _GenTab._chatgptActivationPromise) {
                  await _GenTab._chatgptActivationPromise;
                }
                const result = await Session.ensureReady({
                  createIfMissing: false,
                  activate: false,
                  silent: true,
                  forceCheck: isChatGPT,
                  waitForEditorMs: isChatGPT ? 12e3 : 0,
                });
                if (result?.ready) {
                  newStatus = "ready";
                } else if (result?.error === "NO_TAB") {
                  newStatus = "no-tab";
                  statusText =
                    window.I18n?.t("workflow.providerNoTab") ||
                    "Tab not opened";
                  statusIcon = iconWarning;
                } else if (
                  result?.error === "NOT_LOGGED_IN" ||
                  result?.error === "NOT_CHATGPT_URL"
                ) {
                  newStatus = "login";
                  statusText =
                    window.I18n?.t("gen.providerStatusLogin") ||
                    "Not logged in";
                  statusIcon = iconWarning;
                } else if (isChatGPT) {
                  newStatus = "not-ready";
                  const code = String(result?.error || "CHATGPT_NOT_READY");
                  statusText = /^[A-Z0-9_:-]{1,120}$/.test(code)
                    ? code
                    : "CHATGPT_NOT_READY";
                  statusIcon = iconWarning;
                } else if (isMuse) {
                  const code = String(result?.error || "MUSE_NOT_READY");
                  statusText = /^[A-Z0-9_:-]{1,120}$/.test(code)
                    ? code
                    : "MUSE_NOT_READY";
                  newStatus = `not-ready:${statusText}`;
                  statusIcon = iconWarning;
                } else if (!isChatGPT) {
                  newStatus = "login";
                  statusText =
                    window.I18n?.t("gen.providerStatusLogin") ||
                    "Not logged in";
                  statusIcon = iconWarning;
                }
              }
              if (newStatus === lastStatus) return;
              lastStatus = newStatus;
              if (newStatus === "ready") {
                setConfirmRunReady(true);
                providerBadge.className = "confirm-run-provider-badge is-ready";
                providerBadge.innerHTML = `${iconCheck}<span class="badge-text">${window.I18n?.t("gen.providerStatusReady") || "Ready"}</span>`;
                if (_GenTab._confirmStatusPollTimer) {
                  clearInterval(_GenTab._confirmStatusPollTimer);
                  _GenTab._confirmStatusPollTimer = null;
                }
              } else if (newStatus === "cloudflare") {
                setConfirmRunReady(false);
                providerBadge.className =
                  "confirm-run-provider-badge is-warning";
                providerBadge.innerHTML = `${statusIcon}<span class="badge-text">${statusText}</span>`;
              } else if (newStatus === "checking") {
                setConfirmRunReady(false);
                providerBadge.className =
                  "confirm-run-provider-badge is-checking";
                providerBadge.innerHTML = `${statusIcon}<span class="badge-text">${statusText}</span>`;
              } else {
                setConfirmRunReady(false);
                providerBadge.className =
                  "confirm-run-provider-badge is-warning";
                providerBadge.innerHTML = `${statusIcon}<span class="badge-text">${statusText}</span>`;
              }
            } catch (error) {
              setConfirmRunReady(false);
              if (isChatGPT) {
                const code = String(error?.message || "CHATGPT_NOT_READY");
                const safeCode = /^[A-Z0-9_:-]{1,120}$/.test(code)
                  ? code
                  : "CHATGPT_NOT_READY";
                if (lastStatus !== `not-ready:${safeCode}`) {
                  lastStatus = `not-ready:${safeCode}`;
                  providerBadge.className =
                    "confirm-run-provider-badge is-warning";
                  providerBadge.innerHTML = `${iconWarning}<span class="badge-text">${safeCode}</span>`;
                }
              } else if (lastStatus !== "checking") {
                lastStatus = "checking";
                providerBadge.className =
                  "confirm-run-provider-badge is-checking";
                providerBadge.innerHTML = `${iconSpinner}<span class="badge-text">${window.I18n?.t("gen.providerStatusChecking") || "Checking..."}</span>`;
              }
            } finally {
              statusCheckInFlight = false;
            }
          };
          if (providerBadge) {
            providerBadge.className = "confirm-run-provider-badge is-checking";
            providerBadge.innerHTML = `${iconSpinner}<span class="badge-text">${window.I18n?.t("gen.providerStatusChecking") || "Checking..."}</span>`;
          }
          checkAndUpdateStatus();
          _GenTab._confirmStatusPollTimer = setInterval(
            checkAndUpdateStatus,
            3e3,
          );
        } else {
          providerStatusRow.classList.add("hidden");
        }
      }
      const genTypeChip = document.getElementById("confirmGenTypeBadge");
      if (genTypeChip) {
        if (isFlow || isGrok || isGemini || isMuse) {
          const isVideoGen =
            document.getElementById("genType")?.value === "Video";
          const iconVideo = `<svg class="badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>`;
          const iconImage = `<svg class="badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>`;
          genTypeChip.innerHTML = isVideoGen
            ? `${iconVideo}<span>${window.I18n?.t("workflow.genTypeVideo") || "Video"}</span>`
            : `${iconImage}<span>${window.I18n?.t("workflow.genTypeImage") || "Image"}</span>`;
          genTypeChip.classList.remove("hidden");
        } else {
          genTypeChip.classList.add("hidden");
        }
      }
      const qtyField = confirmQty?.closest(".confirm-run-field");
      const resField = confirmRes?.closest(".confirm-run-field");
      const hideQtyRes = isChatGPT || isGrok || isGemini || isMuse;
      if (qtyField) qtyField.style.display = hideQtyRes ? "none" : "";
      if (resField) resField.style.display = hideQtyRes ? "none" : "";
      if (confirmRatio) {
        if (isGemini || isMuse) {
          if (_GenTab.aspectRatioSelect) {
            confirmRatio.innerHTML = _GenTab.aspectRatioSelect.innerHTML;
            confirmRatio.value = _GenTab.aspectRatioSelect.value;
          } else {
            confirmRatio.innerHTML = "";
          }
        } else if (isChatGPT || isGrok) {
          const adapter = window.ProviderRegistry?.get?.(providerKey);
          const fallbackRatios = [
            "story",
            "portrait",
            "square",
            "landscape",
            "widescreen",
          ];
          const fallbackUiMap = isGrok
            ? {
                story: "9:16",
                portrait: "2:3",
                square: "1:1",
                landscape: "3:2",
                widescreen: "16:9",
              }
            : {
                story: "9:16",
                portrait: "3:4",
                square: "1:1",
                landscape: "4:3",
                widescreen: "16:9",
              };
          const supportedRatios =
            adapter?.capabilities?.supportedRatios ||
            (isMuse ? [] : fallbackRatios);
          const ratioUiMap =
            adapter?.capabilities?.ratioUiMap || (isMuse ? {} : fallbackUiMap);
          const iconMap = {
            story: "\u25AE",
            portrait: "\u25AF",
            square: "\u25A1",
            landscape: "\u25AD",
            widescreen: "\u25AC",
          };
          confirmRatio.innerHTML = supportedRatios
            .map(
              (k) =>
                `<option value="${k}">${iconMap[k] || ""} ${ratioUiMap[k] || k}</option>`,
            )
            .join("");
          if (
            _GenTab.aspectRatioSelect &&
            supportedRatios.includes(_GenTab.aspectRatioSelect.value)
          ) {
            confirmRatio.value = _GenTab.aspectRatioSelect.value;
          } else {
            confirmRatio.value = isMuse
              ? supportedRatios[0] || ""
              : isGrok
                ? "widescreen"
                : "story";
          }
        } else {
          if (_GenTab.aspectRatioSelect) {
            confirmRatio.innerHTML = _GenTab.aspectRatioSelect.innerHTML;
            confirmRatio.value = _GenTab.aspectRatioSelect.value;
          } else {
            confirmRatio.innerHTML = `
              <option value="16:9">\u25AC 16:9</option>
              <option value="4:3">\u25AD 4:3</option>
              <option value="1:1">\u25A1 1:1</option>
              <option value="3:4">\u25AF 3:4</option>
              <option value="9:16">\u25AE 9:16</option>
            `;
          }
        }
      }
      if (isFlow) {
        if (confirmQty && _GenTab.quantitySelect) {
          const _confQRange =
            window.ProviderConfigManager?.safeGetQuantityRangeSync?.("flow");
          confirmQty.min = String(_confQRange?.min ?? 1);
          confirmQty.max = String(_confQRange?.max ?? 4);
          confirmQty.value =
            _GenTab.quantitySelect.value || String(_confQRange?.min ?? 1);
        }
        _GenTab._syncConfirmDownloadResolution();
      }
      const reloadRow = document.getElementById("confirmReloadRow");
      const reloadCheckbox = document.getElementById("confirmReloadFlow");
      if (reloadRow) reloadRow.classList.add("hidden");
      if (reloadCheckbox) reloadCheckbox.checked = false;
      const submitModeRow = document.getElementById("confirmSubmitModeRow");
      const submitModeSwitch = document.getElementById(
        "confirmSubmitModeSwitch",
      );
      const submitModeHint = document.getElementById("confirmSubmitModeHint");
      if (submitModeRow) {
        submitModeRow.classList.toggle("hidden", !isFlow);
        if (isFlow && submitModeSwitch) {
          const t = (k) => window.I18n?.t?.(k);
          const defaultManual =
            !!window.storageSettings?.getSettings?.().manualSubmitMode;
          const btns = submitModeSwitch.querySelectorAll(
            ".confirm-submitmode-btn",
          );
          btns.forEach((b) => {
            const tip = t(
              b.dataset.value === "manual"
                ? "dialog.runSubmitModeManualTooltip"
                : "dialog.runSubmitModeAutoTooltip",
            );
            if (tip) b.setAttribute("data-tooltip", tip);
          });
          const applyMode = (mode) => {
            btns.forEach((b) => {
              const on = b.dataset.value === mode;
              b.classList.toggle("is-active", on);
              b.setAttribute("aria-selected", on ? "true" : "false");
            });
            if (submitModeHint) {
              if (mode === "manual") {
                submitModeHint.textContent =
                  t("dialog.runSubmitModeManualHint") ||
                  "You press Enter or click Submit for each prompt \u2014 real interaction helps avoid Google Flow bot detection.";
                submitModeHint.classList.add("is-manual");
              } else {
                submitModeHint.textContent =
                  t("dialog.runSubmitModeAutoHint") ||
                  "TobyFlow submits automatically after filling prompt + refs.";
                submitModeHint.classList.remove("is-manual");
              }
            }
          };
          btns.forEach((b) => {
            b.onclick = () => {
              applyMode(b.dataset.value);
              try {
                window.storageSettings?.set?.(
                  "manualSubmitMode",
                  b.dataset.value === "manual",
                );
              } catch (_) {}
            };
          });
          applyMode(defaultManual ? "manual" : "auto");
        }
      }
      const runModeRow = document.getElementById("confirmRunModeRow");
      const runModeSelect = document.getElementById("confirmRunMode");
      const isMultiPrompt = promptCount > 1;
      const showRunMode = isMultiPrompt && isFlow;
      if (runModeRow) {
        runModeRow.classList.toggle("hidden", !showRunMode);
      }
      if (runModeSelect) {
        runModeSelect.value = _GenTab.runMode || "parallel";
        runModeSelect.onchange = () => {
          _GenTab.runMode = runModeSelect.value;
          _GenTab._updateRunModeUI();
        };
      }
      _GenTab._confirmResolve = (val) => {
        const submitMode =
          isFlow &&
          submitModeSwitch &&
          !submitModeRow?.classList.contains("hidden")
            ? submitModeSwitch.querySelector(
                ".confirm-submitmode-btn.is-active",
              )?.dataset.value || "auto"
            : "auto";
        const manualSubmitMode = submitMode === "manual";
        const reloadRowVisible =
          reloadRow && !reloadRow.classList.contains("hidden");
        const wantReload =
          !manualSubmitMode &&
          !!(
            reloadRowVisible &&
            reloadCheckbox &&
            !reloadCheckbox.disabled &&
            reloadCheckbox.checked
          );
        if (runModeSelect && !runModeRow?.classList.contains("hidden")) {
          _GenTab.runMode = runModeSelect.value;
          _GenTab._updateRunModeUI();
        }
        if (wantReload || manualSubmitMode || flowRouteAtConfirm === "web") {
          resolve({
            confirmed: true,
            reloadFlow: wantReload,
            manualSubmitMode,
            ...(flowRouteAtConfirm === "web" && { flowExecutionMode: "web" }),
          });
        } else {
          resolve(val);
        }
      };
      _GenTab._confirmReject = () => resolve(false);
      overlay.classList.remove("hidden");
    });
  }
  static _initPromptSearchRow() {
    _GenTab._updatePromptBatchCount();
    window.eventBus?.on?.(
      "featuregate:refreshed",
      _GenTab._updatePromptBatchCount,
    );
    window.eventBus?.on?.("plan:changed", _GenTab._updatePromptBatchCount);
    const searchBtn = document.getElementById("promptSearchBtn");
    const saveBtn = document.getElementById("promptSaveBtn");
    if (searchBtn) {
      searchBtn.addEventListener("click", () =>
        _GenTab._openPromptSearchModal(),
      );
    }
    if (saveBtn) {
      saveBtn.addEventListener("click", async () => {
        if (window.featureGate) {
          const canCreate = await window.featureGate.canCreateSnippetAsync();
          if (!canCreate) {
            const isLoggedIn = window.authManager?.isLoggedIn();
            if (!isLoggedIn) {
              window.featureGate.showLoginPrompt(
                window.I18n?.t("templates.requireLoginToSave") ||
                  "Login required to save prompts",
              );
            } else {
              const snippetsMax =
                window.featureGate.entitlements?.snippets_max ?? 3;
              await window.customDialog?.confirm(
                window.I18n?.t("snippets.quotaReachedDetail", {
                  max: snippetsMax,
                }) ||
                  `B\u1EA1n \u0111\xE3 \u0111\u1EA1t gi\u1EDBi h\u1EA1n ${snippetsMax} prompt cho g\xF3i hi\u1EC7n t\u1EA1i. N\xE2ng c\u1EA5p \u0111\u1EC3 l\u01B0u kh\xF4ng gi\u1EDBi h\u1EA1n.`,
                {
                  title:
                    window.I18n?.t("featuregate.featureLockedTitle") ||
                    "Feature Locked",
                  type: "warning",
                  confirmText: window.I18n?.t("common.upgrade") || "Upgrade",
                  cancelText: window.I18n?.t("common.close") || "Close",
                  onConfirm: () => {
                    window.eventBus?.emit("open:upgrade_modal");
                  },
                },
              );
            }
            return;
          }
        }
        const content = _GenTab.promptsArea?.value?.trim() || "";
        if (window.MyPromptsTab) {
          window.MyPromptsTab._showSaveDialog(
            content ? { title: "", content, category: "" } : null,
          );
        }
      });
    }
  }
  static _openPromptSearchModal() {
    const s = _GenTab._psmState;
    s.activeTab = "my";
    s.myQuery = "";
    s.myDisplayCount = 15;
    s.tplQuery = "";
    s.tplPage = 1;
    s.tplTotalPages = 1;
    s.tplDisplayCount = 15;
    s.templates = [];
    const overlay = document.createElement("div");
    overlay.className = "prompt-search-overlay";
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    overlay.innerHTML = `
      <div class="prompt-search-modal">
        <div class="psm-header">
          <button class="psm-tab active" data-psm-tab="my">${t("templates.myPrompts", "My Prompts")}</button>
          <button class="psm-tab" data-psm-tab="template">${t("templates.template", "Template")}</button>
          <button class="psm-close" data-tooltip="${t("common.close", "Close")}" aria-label="${t("common.close", "Close")}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div class="psm-search-wrap">
          <svg class="psm-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input class="psm-search-input" id="psmSearchInput" type="text" placeholder="${t("templates.searchPrompt", "Search prompts...")}" autocomplete="off" />
        </div>
        <div class="psm-list" id="psmList"></div>
      </div>
    `;
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) _GenTab._closePromptSearchModal();
    });
    overlay
      .querySelector(".psm-close")
      .addEventListener("click", () => _GenTab._closePromptSearchModal());
    overlay.querySelectorAll(".psm-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        overlay
          .querySelectorAll(".psm-tab")
          .forEach((t2) => t2.classList.remove("active"));
        tab.classList.add("active");
        s.activeTab = tab.dataset.psmTab;
        const input = overlay.querySelector("#psmSearchInput");
        if (input) {
          input.value = s.activeTab === "my" ? s.myQuery : s.tplQuery;
          input.placeholder =
            s.activeTab === "my"
              ? window.I18n?.t("templates.searchMyPrompts") ||
                "Search my prompts..."
              : window.I18n?.t("templates.searchTemplate") ||
                "Search template...";
        }
        if (
          s.activeTab === "template" &&
          s.templates.length === 0 &&
          !s.tplLoading
        ) {
          _GenTab._psmLoadTemplates();
        } else {
          _GenTab._psmRenderList();
        }
      });
    });
    let searchTimer = null;
    const searchInput = overlay.querySelector("#psmSearchInput");
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          if (s.activeTab === "my") {
            s.myQuery = searchInput.value.trim().toLowerCase();
            s.myDisplayCount = 15;
            _GenTab._psmFilterMyPrompts();
          } else {
            s.tplQuery = searchInput.value.trim();
            s.tplPage = 1;
            s.tplDisplayCount = 15;
            s.templates = [];
            _GenTab._psmLoadTemplates();
          }
        }, 300);
      });
    }
    const listEl = overlay.querySelector("#psmList");
    if (listEl) {
      listEl.addEventListener("scroll", () => {
        const threshold = 60;
        if (
          listEl.scrollTop + listEl.clientHeight >=
          listEl.scrollHeight - threshold
        ) {
          if (s.activeTab === "my") {
            if (s.myDisplayCount < s.myFiltered.length) {
              s.myDisplayCount += 15;
              _GenTab._psmRenderList();
            }
          } else {
            if (s.tplDisplayCount < s.templates.length) {
              s.tplDisplayCount += 15;
              _GenTab._psmRenderList();
            } else if (s.tplPage < s.tplTotalPages && !s.tplLoading) {
              s.tplPage++;
              _GenTab._psmLoadTemplates(true);
            }
          }
        }
      });
    }
    const escHandler = (e) => {
      if (e.key === "Escape") _GenTab._closePromptSearchModal();
    };
    document.addEventListener("keydown", escHandler);
    overlay._escHandler = escHandler;
    ["mousedown", "mouseup", "pointerdown", "pointerup"].forEach((evt) => {
      overlay.addEventListener(evt, (e) => e.stopPropagation());
    });
    document.body.appendChild(overlay);
    _GenTab._psmOverlay = overlay;
    _GenTab._psmLoadMyPrompts();
    searchInput?.focus();
  }
  static _closePromptSearchModal() {
    const overlay = _GenTab._psmOverlay;
    if (!overlay) return;
    if (overlay._escHandler) {
      document.removeEventListener("keydown", overlay._escHandler);
    }
    overlay.remove();
    _GenTab._psmOverlay = null;
  }
  static async _psmLoadMyPrompts() {
    const s = _GenTab._psmState;
    try {
      if (window.userPromptsManager) {
        await window.userPromptsManager.loadPrompts();
        const result = window.userPromptsManager.getPrompts();
        s.myPrompts = Array.isArray(result) ? result : [];
      } else {
        s.myPrompts = [];
      }
    } catch (err) {
      console.warn("[GenTab] PSM: Loi tai my prompts:", err.message);
      s.myPrompts = [];
    }
    _GenTab._psmFilterMyPrompts();
  }
  static _psmFilterMyPrompts() {
    const s = _GenTab._psmState;
    if (!s.myQuery) {
      s.myFiltered = s.myPrompts.slice();
    } else {
      const q = s.myQuery;
      s.myFiltered = s.myPrompts.filter((p) => {
        const title = (p.title || "").toLowerCase();
        const content = (p.content || "").toLowerCase();
        const cat = (p.category || "").toLowerCase();
        return title.includes(q) || content.includes(q) || cat.includes(q);
      });
    }
    _GenTab._psmRenderList();
  }
  static async _psmLoadTemplates(append = false) {
    const s = _GenTab._psmState;
    if (s.tplLoading) return;
    s.tplLoading = true;
    if (!append) {
      _GenTab._psmRenderLoading();
    }
    try {
      const params = new URLSearchParams();
      params.append("page", s.tplPage);
      params.append("per_page", "15");
      if (s.tplQuery) params.append("search", s.tplQuery);
      const endpoint = "templates?" + params.toString();
      const response = await _GenTab._psmApiCall("GET", endpoint);
      const newItems = Array.isArray(response) ? response : response.data || [];
      s.tplTotalPages = response.meta?.last_page || 1;
      if (append) {
        s.templates = s.templates.concat(newItems);
      } else {
        s.templates = newItems;
      }
    } catch (err) {
      console.warn("[GenTab] PSM: Loi tai templates:", err.message);
      if (!append) s.templates = [];
    }
    s.tplLoading = false;
    _GenTab._psmRenderList();
  }
  static async _psmApiCall(method, endpoint, data = null) {
    if (window.authManager && window.authManager.isLoggedIn()) {
      return window.authManager._apiCall(method, endpoint, data);
    }
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: "apiRequest", method, endpoint, data },
        (resp) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (resp?.success) {
            if (resp.meta) {
              resolve({ data: resp.data, meta: resp.meta });
            } else {
              resolve(resp.data);
            }
          } else {
            reject(new Error(resp?.error?.message || "Loi API"));
          }
        },
      );
    });
  }
  static _psmRenderLoading() {
    const list = _GenTab._psmOverlay?.querySelector("#psmList");
    if (!list) return;
    list.innerHTML = `
      <div class="psm-loading">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
        <span>\u0110ang t\u1EA3i...</span>
      </div>
    `;
  }
  static _psmRenderList() {
    const list = _GenTab._psmOverlay?.querySelector("#psmList");
    if (!list) return;
    const s = _GenTab._psmState;
    if (s.activeTab === "my") {
      _GenTab._psmRenderMyList(list);
    } else {
      _GenTab._psmRenderTplList(list);
    }
  }
  static _psmRenderMyList(list) {
    const s = _GenTab._psmState;
    const items = s.myFiltered.slice(0, s.myDisplayCount);
    if (items.length === 0) {
      list.innerHTML = `
        <div class="psm-empty">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>
          </svg>
          <span>${s.myQuery ? window.I18n?.t("templates.noMatchingPrompts") || "No matching prompts found." : window.I18n?.t("templates.noPromptsYet") || 'No prompts yet. Click "Add" to get started.'}</span>
        </div>
      `;
      return;
    }
    let html = items
      .map((p) => {
        const title = _GenTab._psmEsc(p.title || "Khong co tieu de");
        const content = _GenTab._psmEsc(p.content || "");
        const preview =
          content.length > 80 ? content.substring(0, 80) + "..." : content;
        const catBadge = p.category
          ? `<span class="psm-item-badge">${_GenTab._psmEsc(p.category)}</span>`
          : "";
        const hasVars = (p.content || "").match(/\{\{(\w+)\}\}/);
        const varBadge = hasVars
          ? '<span class="psm-item-badge">{{var}}</span>'
          : "";
        return `<div class="psm-item" data-psm-id="${_GenTab._psmEscAttr(p.id)}">
        <div class="psm-item-info">
          <div class="psm-item-title">${title}</div>
          <div class="psm-item-content">${preview}</div>
          ${catBadge || varBadge ? `<div class="psm-item-meta">${catBadge}${varBadge}</div>` : ""}
        </div>
        <button class="psm-item-use" data-psm-action="use-my" data-psm-id="${_GenTab._psmEscAttr(p.id)}" data-tooltip="D\xF9ng prompt n\xE0y" aria-label="D\xF9ng prompt n\xE0y">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
        </button>
      </div>`;
      })
      .join("");
    if (s.myDisplayCount < s.myFiltered.length) {
      html +=
        '<div class="psm-load-more"><span class="psm-load-more-text">' +
        (window.I18n?.t("templates.scrollToLoadMore") ||
          "Scroll down to load more...") +
        "</span></div>";
    }
    list.innerHTML = html;
    list.querySelectorAll('button[data-psm-action="use-my"]').forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.psmId;
        _GenTab._psmUseMyPrompt(id);
      });
    });
  }
  static _psmRenderTplList(list) {
    const s = _GenTab._psmState;
    const items = s.templates.slice(0, s.tplDisplayCount);
    if (s.tplLoading && items.length === 0) return;
    if (items.length === 0) {
      list.innerHTML = `
        <div class="psm-empty">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="m9 12 2 2 4-4"/>
          </svg>
          <span>${s.tplQuery ? "Kh\xF4ng t\xECm th\u1EA5y template ph\xF9 h\u1EE3p." : "Kh\xF4ng c\xF3 template n\xE0o."}</span>
        </div>
      `;
      return;
    }
    let html = items
      .map((t) => {
        const title = _GenTab._psmEsc(t.title || t.name || "Template");
        const content = _GenTab._psmEsc(t.content || t.prompt_content || "");
        const preview =
          content.length > 80 ? content.substring(0, 80) + "..." : content;
        const catName = t.category?.name || "";
        const catBadge = catName
          ? `<span class="psm-item-badge">${_GenTab._psmEsc(catName)}</span>`
          : "";
        const mediaType =
          t.media_type === "video"
            ? '<span class="psm-item-badge">Video</span>'
            : "";
        return `<div class="psm-item" data-psm-id="${_GenTab._psmEscAttr(t.id)}">
        <div class="psm-item-info">
          <div class="psm-item-title">${title}</div>
          <div class="psm-item-content">${preview}</div>
          ${catBadge || mediaType ? `<div class="psm-item-meta">${catBadge}${mediaType}</div>` : ""}
        </div>
        <button class="psm-item-use" data-psm-action="use-tpl" data-psm-id="${_GenTab._psmEscAttr(t.id)}" data-tooltip="D\xF9ng template n\xE0y" aria-label="D\xF9ng template n\xE0y">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
        </button>
      </div>`;
      })
      .join("");
    const hasMore =
      s.tplDisplayCount < s.templates.length || s.tplPage < s.tplTotalPages;
    if (hasMore) {
      html +=
        '<div class="psm-load-more"><span class="psm-load-more-text">' +
        (window.I18n?.t("templates.scrollToLoadMore") ||
          "Scroll down to load more...") +
        "</span></div>";
    }
    list.innerHTML = html;
    list
      .querySelectorAll('button[data-psm-action="use-tpl"]')
      .forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = btn.dataset.psmId;
          _GenTab._psmUseTemplate(id);
        });
      });
  }
  static _psmUseMyPrompt(id) {
    const s = _GenTab._psmState;
    const prompt2 = s.myPrompts.find((p) => String(p.id) === String(id));
    if (!prompt2) return;
    const content = prompt2.content || "";
    const variables = content.match(/\{\{(\w+)\}\}/g);
    _GenTab._closePromptSearchModal();
    if (variables && variables.length > 0) {
      if (window.MyPromptsTab) {
        window.MyPromptsTab._showVariableDialog(prompt2);
      }
      return;
    }
    _GenTab._psmFillPrompt(content);
  }
  static async _psmUseTemplate(templateId) {
    _GenTab._closePromptSearchModal();
    try {
      const response = await _GenTab._psmApiCall(
        "POST",
        `templates/${templateId}/use`,
      );
      const template = response.data || response;
      const promptContent = template.content || template.prompt_content || "";
      if (promptContent) {
        _GenTab._psmFillPrompt(promptContent);
      }
      if (template.settings) {
        const settings =
          typeof template.settings === "string"
            ? JSON.parse(template.settings)
            : template.settings;
        if (settings.gen_type && _GenTab.genTypeSelect) {
          _GenTab.genTypeSelect.value = settings.gen_type;
          _GenTab.genTypeSelect.dispatchEvent(
            new Event("change", { bubbles: true }),
          );
        }
        if (settings.aspect_ratio && _GenTab.aspectRatioSelect) {
          _GenTab.aspectRatioSelect.value = settings.aspect_ratio;
          _GenTab._rememberGeminiRatioSelection();
        }
        if (settings.model) {
          const modelSelect =
            settings.gen_type === "video"
              ? _GenTab.videoModelSelect
              : _GenTab.imageModelSelect;
          if (modelSelect) modelSelect.value = settings.model;
        }
      }
    } catch (err) {
      console.warn("[GenTab] PSM: Loi su dung template:", err.message);
      const s = _GenTab._psmState;
      const tpl = s.templates.find((t) => String(t.id) === String(templateId));
      if (tpl) {
        const content = tpl.content || tpl.prompt_content || "";
        if (content) _GenTab._psmFillPrompt(content);
      }
    }
  }
  static _psmFillPrompt(content) {
    if (!_GenTab.promptsArea) return;
    _GenTab.promptsArea.value = content;
    _GenTab.promptsArea.dispatchEvent(new Event("input", { bubbles: true }));
    _GenTab.promptsArea.focus();
    window.showNotification?.(
      window.I18n?.t("genNotifyExtra.promptInserted") || "Prompt inserted",
      "success",
      1500,
    );
  }
  static _psmEsc(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  static _psmEscAttr(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  static _showCaptureNotification(message) {
    const existing = document.getElementById("captureToast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.id = "captureToast";
    toast.className = "capture-toast";
    toast.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
        <circle cx="12" cy="13" r="4"></circle>
      </svg>
      <span>${message}</span>
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("capture-toast--hide");
      setTimeout(() => toast.remove(), 300);
    }, 3e3);
  }
};
__publicField(_GenTab, "selectedFilesForUpload", []);
__publicField(_GenTab, "_previewBlobUrls", []);
__publicField(_GenTab, "addonPrompts", []);
__publicField(_GenTab, "runMode", "parallel");
__publicField(_GenTab, "refImagesPerPrompt", 1);
__publicField(_GenTab, "refImageMode", "all");
__publicField(_GenTab, "_genTypeExplicit", false);
__publicField(_GenTab, "_refModeLocked", false);
__publicField(_GenTab, "REF_LIMIT_VIDEO", 3);
__publicField(_GenTab, "REF_LIMIT_IMAGE", 10);
__publicField(_GenTab, "refImageNames", {});
__publicField(_GenTab, "_settingsCache", null);
__publicField(_GenTab, "_videoInputTypeExplicit", false);
__publicField(_GenTab, "_providerRatioSelections", {
  flow: { image: null, video: null },
  chatgpt: { image: null, video: null },
  grok: { image: null, video: null },
  gemini: { image: null, video: null },
  muse: { image: null, video: null },
});
__publicField(
  _GenTab,
  "_geminiRatioSelections",
  _GenTab._providerRatioSelections.gemini,
);
__publicField(_GenTab, "_perPromptFrameData", []);
__publicField(_GenTab, "_perPromptFrameUploadKeys", new Map());
__publicField(_GenTab, "promptsArea", null);
__publicField(_GenTab, "multiPromptCheck", null);
__publicField(_GenTab, "quantitySelect", null);
__publicField(_GenTab, "delayBetweenInput", null);
__publicField(_GenTab, "promptCountSpan", null);
__publicField(_GenTab, "fileIdsInput", null);
__publicField(_GenTab, "genTypeSelect", null);
__publicField(_GenTab, "aspectRatioSelect", null);
__publicField(_GenTab, "imageModelContainer", null);
__publicField(_GenTab, "videoModelContainer", null);
__publicField(_GenTab, "imageModelSelect", null);
__publicField(_GenTab, "videoModelSelect", null);
__publicField(_GenTab, "chatgptModelSelect", null);
__publicField(_GenTab, "geminiModelSelect", null);
__publicField(_GenTab, "museModelSelect", null);
__publicField(_GenTab, "videoInputTypeContainer", null);
__publicField(_GenTab, "videoInputTypeSelect", null);
__publicField(_GenTab, "flowVideoDurationContainer", null);
__publicField(_GenTab, "flowVideoDurationSelect", null);
__publicField(_GenTab, "flowVideoResolutionContainer", null);
__publicField(_GenTab, "flowVideoResolutionSelect", null);
__publicField(_GenTab, "_voicePicker", null);
__publicField(_GenTab, "_characterPicker", null);
__publicField(_GenTab, "refImagesSection", null);
__publicField(_GenTab, "startBtn", null);
__publicField(_GenTab, "_savedBtnLabel", null);
__publicField(_GenTab, "stopBtn", null);
__publicField(_GenTab, "_localUploadController", null);
__publicField(_GenTab, "_uploadStages", new Map());
__publicField(_GenTab, "pauseBtn", null);
__publicField(_GenTab, "genRunningControls", null);
__publicField(_GenTab, "genBtnRow", null);
__publicField(_GenTab, "inputTimeoutInput", null);
__publicField(_GenTab, "fileIdThumbnails", null);
__publicField(_GenTab, "videoFramesSection", null);
__publicField(_GenTab, "chainSection", null);
__publicField(_GenTab, "chainToggle", null);
__publicField(_GenTab, "chainPolicy", null);
__publicField(_GenTab, "_runModeBeforeChain", null);
__publicField(_GenTab, "_chainRunModeOverrideActive", false);
__publicField(_GenTab, "genRunModeBtn", null);
__publicField(_GenTab, "refImageModeSelect", null);
__publicField(_GenTab, "mentionHelper", null);
__publicField(_GenTab, "mentionHelperTags", null);
__publicField(_GenTab, "saveToAlbumBtn", null);
__publicField(_GenTab, "saveState", null);
__publicField(_GenTab, "_apiRefValidation", new Map());
__publicField(_GenTab, "_failedPromptsList", []);
__publicField(_GenTab, "_ADDON_CACHE_TTL", 24 * 60 * 60 * 1e3);
__publicField(_GenTab, "_mentionMenu", null);
__publicField(_GenTab, "_mentionChips", null);
__publicField(_GenTab, "_autocompleteDebounceTimer", null);
__publicField(_GenTab, "_lastFilterKey", null);
__publicField(_GenTab, "_psmState", {
  activeTab: "my",
  myPrompts: [],
  myFiltered: [],
  myQuery: "",
  myDisplayCount: 15,
  templates: [],
  tplQuery: "",
  tplPage: 1,
  tplTotalPages: 1,
  tplLoading: false,
  tplDisplayCount: 15,
});
let GenTab = _GenTab;
window.GenTab = GenTab;
