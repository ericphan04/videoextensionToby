class FlowAdapter extends AIProviderAdapter {
  constructor() {
    super();
    this.key = "flow";
    this.displayName = "Google Flow";
    this.featureKey = "gen_enabled";
    this.executionAction = "generate";
  }
  get capabilities() {
    const pcm =
      typeof ProviderConfigManager !== "undefined"
        ? ProviderConfigManager
        : null;
    const supports = pcm?.safeGetSupportsSync?.("flow") || {};
    const maxImg = pcm?.safeGetMaxRefImagesSync?.("flow", "image") ?? 0;
    const maxVidIng =
      pcm?.safeGetMaxRefImagesSync?.("flow", "video_ingredients") ?? 0;
    return {
      supportsRatio: supports.ratio ?? false,
      supportsQuantity: supports.quantity ?? false,
      supportsVideo: supports.video ?? false,
      supportsRefImage: supports.ref_image ?? false,
      supportsAutoDownload: supports.auto_download ?? false,
      supportsHumanized: supports.humanized ?? false,
      maxRefImagesImage: maxImg,
      maxRefImagesVideoIngredients: maxVidIng,
      maxRefImages: Math.max(maxImg, maxVidIng),
    };
  }
  async ensureReady() {
    return { ready: true };
  }
  getMaxRefImages({ mode = "image", isFrames = false, modelValue } = {}) {
    if (modelValue) {
      const Registry =
        typeof ModelRegistry !== "undefined" ? ModelRegistry : null;
      const cap = Registry?.findModel?.("flow", modelValue)?.config
        ?.max_ref_images?.image;
      if (typeof cap === "number") return Math.max(0, cap);
    }
    const pcm =
      typeof ProviderConfigManager !== "undefined"
        ? ProviderConfigManager
        : null;
    const isVideo = String(mode || "").toLowerCase() === "video";
    if (isVideo && !isFrames) {
      return pcm?.safeGetMaxRefImagesSync?.("flow", "video_ingredients") ?? 0;
    }
    return pcm?.safeGetMaxRefImagesSync?.("flow", "image") ?? 0;
  }
  getMaxRefVideos(modelValue) {
    if (!modelValue) return 0;
    const Registry =
      typeof ModelRegistry !== "undefined" ? ModelRegistry : null;
    const cap = Registry?.findModel?.("flow", modelValue)?.config
      ?.max_ref_images?.video;
    if (typeof cap === "number") return Math.max(0, cap);
    return this.supportsRefVideo(modelValue)
      ? this.getMaxRefImages({ modelValue })
      : 0;
  }
  getMaxRefImagesTotal(modelValue) {
    if (!modelValue) return null;
    const Registry =
      typeof ModelRegistry !== "undefined" ? ModelRegistry : null;
    const total = Registry?.findModel?.("flow", modelValue)?.config
      ?.max_ref_images?.total;
    return typeof total === "number" ? Math.max(0, total) : null;
  }
  getMaxVoices(modelValue) {
    if (!modelValue) return null;
    const Registry =
      typeof ModelRegistry !== "undefined" ? ModelRegistry : null;
    const cap = Registry?.findModel?.("flow", modelValue)?.config?.max_voices;
    return typeof cap === "number" ? Math.max(0, cap) : null;
  }
  getMaxCharacters(modelValue) {
    if (!modelValue) return null;
    const Registry =
      typeof ModelRegistry !== "undefined" ? ModelRegistry : null;
    const cap = Registry?.findModel?.("flow", modelValue)?.config
      ?.max_characters;
    return typeof cap === "number" ? Math.max(0, cap) : null;
  }
  getDurationOverride({
    modelValue,
    hasRef = false,
    hasRefVideo = false,
    inputType = "Ingredients",
  } = {}) {
    if (!modelValue) return null;
    const Registry =
      typeof ModelRegistry !== "undefined" ? ModelRegistry : null;
    const model = Registry?.findModel?.("flow", modelValue);
    const overrides = model?.config?.duration_overrides;
    if (!Array.isArray(overrides) || overrides.length === 0) return null;
    for (const rule of overrides) {
      const when = rule?.when || {};
      if (when.has_ref !== void 0 && when.has_ref !== hasRef) continue;
      if (when.has_ref_video !== void 0 && when.has_ref_video !== hasRefVideo)
        continue;
      if (when.input_type !== void 0 && when.input_type !== inputType) continue;
      return rule.force_duration || null;
    }
    return null;
  }
  supportsRefVideo(modelValue) {
    if (!modelValue) return false;
    const Registry =
      typeof ModelRegistry !== "undefined" ? ModelRegistry : null;
    const model = Registry?.findModel?.("flow", modelValue);
    return model?.config?.supports_ref_video === true;
  }
  supportsRefImages(modelValue, { inputType, duration } = {}) {
    if (!modelValue) return true;
    const Registry =
      typeof ModelRegistry !== "undefined" ? ModelRegistry : null;
    const model = Registry?.findModel?.("flow", modelValue);
    const cfg = model?.config || {};
    const evaluateRefSupport = (probeDuration) => {
      const list = cfg.ref_support_overrides;
      if (Array.isArray(list) && list.length > 0) {
        for (const rule of list) {
          const when = rule?.when || {};
          if (when.input_type !== void 0 && when.input_type !== inputType)
            continue;
          if (when.duration !== void 0 && when.duration !== probeDuration)
            continue;
          if (
            Array.isArray(when.duration_in) &&
            when.duration_in.length > 0 &&
            (probeDuration === void 0 ||
              !when.duration_in.includes(probeDuration))
          )
            continue;
          return rule.supported !== false;
        }
      }
      return cfg.supports_ref_images !== false;
    };
    if (evaluateRefSupport(duration)) return true;
    const durationOverrides = cfg.duration_overrides;
    if (Array.isArray(durationOverrides) && durationOverrides.length > 0) {
      const hasAutoBumpForCtx = durationOverrides.some((rule) => {
        const when = rule?.when || {};
        if (when.has_ref !== true) return false;
        if (when.input_type !== void 0 && when.input_type !== inputType)
          return false;
        return !!rule.force_duration;
      });
      if (hasAutoBumpForCtx) return true;
    }
    return false;
  }
  supportsFrames(modelValue) {
    if (!modelValue) return true;
    const Registry =
      typeof ModelRegistry !== "undefined" ? ModelRegistry : null;
    const model = Registry?.findModel?.("flow", modelValue);
    return model?.config?.supports_frames !== false;
  }
  async submit(params) {
    const p = params || {};
    if (
      typeof PromptQueue !== "undefined" &&
      typeof PromptQueue.isEnabled === "function" &&
      PromptQueue.isEnabled()
    ) {
      const inst = PromptQueue.getInstance();
      const promptsArr =
        Array.isArray(p.prompts) && p.prompts.length > 0
          ? p.prompts
          : p.prompt
            ? [p.prompt]
            : [];
      let _adapterRefFileNames = p.refFileNames;
      if (
        !_adapterRefFileNames ||
        Object.keys(_adapterRefFileNames).length === 0
      ) {
        _adapterRefFileNames = {};
        for (const fid of p.refFileIds || []) {
          const fn =
            window.MediaRegistry?.getFileName?.(fid) ||
            window.GenTab?.fileNameCache?.[fid];
          if (fn) _adapterRefFileNames[fid] = fn;
        }
      }
      return await inst.submitJob({
        owner: p.owner || "prompts",
        label: p.label || "Flow generate",
        prompts: promptsArr,
        settings: p.settings || {},
        refFileIds: p.refFileIds || [],
        refFileNames: _adapterRefFileNames,
        refThumbnails: p.refThumbnails || {},
        refImageMode: p.refImageMode || "all",
        autoDownload: p.autoDownload,
        taskName: p.taskName || null,
      });
    }
    if (
      !window.MessageBridge ||
      typeof window.MessageBridge.runAutoPrompt !== "function"
    ) {
      return { success: false, error: "BRIDGE_NOT_LOADED" };
    }
    const settings = window.storageSettings?.getSettings?.() || {};
    const delayBetweenSec =
      window.ExecutionConfig?.safeGetDelayBetweenPromptsSec?.() ?? 5;
    const payload = {
      ...p,
      delayBetweenMs: p.delayBetweenMs ?? delayBetweenSec * 1e3,
      inputTimeoutMs: p.inputTimeoutMs ?? (settings.inputTimeout || 1200),
    };
    return await window.MessageBridge.runAutoPrompt(payload);
  }
  async uploadRef(file, thumbnail, options) {
    if (
      !window.ImmediateUploader ||
      typeof window.ImmediateUploader.upload !== "function"
    ) {
      throw new Error("ImmediateUploader not loaded");
    }
    return await window.ImmediateUploader.upload(
      file,
      thumbnail,
      options || {},
    );
  }
}
window.FlowAdapter = FlowAdapter;
