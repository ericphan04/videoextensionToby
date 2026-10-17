class GrokAdapter extends AIProviderAdapter {
  constructor() {
    super();
    this.key = "grok";
    this.displayName = "Grok";
    this.featureKey = "grok_enabled";
    this.executionAction = "grok_run";
  }
  get capabilities() {
    if (this.constructor._capabilitiesCache)
      return this.constructor._capabilitiesCache;
    const pcm =
      typeof ProviderConfigManager !== "undefined"
        ? ProviderConfigManager
        : null;
    const supports = pcm?.safeGetSupportsSync?.("grok") || {};
    const maxRef = pcm?.safeGetMaxRefImagesSync?.("grok", "image") ?? 0;
    const ratioUiMap = pcm?.safeGetRatioUiMapSync?.("grok") || {};
    const durations = pcm?.getSupportedDurationsSync?.("grok") || [];
    const resolutions = pcm?.getSupportedResolutionsSync?.("grok") || [];
    const imageQualities = pcm?.getSupportedImageQualitiesSync?.("grok") || [];
    const ratios = pcm?.safeGetRatiosSync?.("grok", "image") || [];
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
      supportedDurations: durations,
      supportedResolutions: resolutions,
      supportedImageQualities: imageQualities,
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
      if (!data?.provider || data.provider === "grok") {
        this._capabilitiesCache = null;
      }
    };
    window.eventBus.on("sse:provider_config_updated", invalidate);
    window.eventBus.on("provider:api_config_updated", invalidate);
    window.eventBus.on("provider:dom_selector_updated", invalidate);
    window.eventBus.on("provider:models_updated", invalidate);
    window.eventBus.on("provider:api_configs_loaded", invalidate);
    window.eventBus.on("provider:updated", invalidate);
  }
  async ensureReady(options = {}) {
    if (!window.GrokSession) {
      return { ready: false, error: "GROKSESSION_NOT_LOADED" };
    }
    try {
      return await window.GrokSession.ensureReady({
        createIfMissing: true,
        activate: true,
        ...options,
      });
    } catch (e) {
      return { ready: false, error: e?.message || "SESSION_ERROR" };
    }
  }
  getModels(mode = "image") {
    return window.ModelRegistry?.safeGetModelsSync?.("grok", mode) || [];
  }
  getModel(modelValue, mode = "image") {
    const value =
      modelValue || window.ModelRegistry?.safeGetDefault?.("grok", mode);
    return value ? window.ModelRegistry?.findModel?.("grok", value) : null;
  }
  getVideoInputTypes(modelValue) {
    const options = this.getModel(modelValue, "video")?.config
      ?.video_input_types;
    return Array.isArray(options)
      ? options.filter(
          (option) =>
            ["Ingredients", "Frames"].includes(option?.value) &&
            typeof option.label === "string" &&
            Number.isInteger(option.max_ref_images) &&
            option.max_ref_images >= 0 &&
            Array.isArray(option.role_selectors) &&
            option.role_selectors.length > 0 &&
            option.role_selectors.every(
              (key) => typeof key === "string" && key.length > 0,
            ),
        )
      : [];
  }
  normalizeNodeData(data) {
    data.grok_mode =
      String(data.grok_mode || data.media_type || "image").toLowerCase() ===
      "video"
        ? "video"
        : "image";
    const models = this.getModels(data.grok_mode);
    const legacyModel =
      models.length && !models.some((model) => model.value === data.model);
    if (legacyModel) {
      data.model =
        window.ModelRegistry?.safeGetDefault?.("grok", data.grok_mode) || null;
    }
    if (data.grok_mode !== "video") return data;
    data.video_input_type =
      !legacyModel &&
      String(data.video_input_type || "").toLowerCase() === "frames"
        ? "Frames"
        : "Ingredients";
    data.max_ref_images = this.getMaxRefImages({
      mode: "video",
      isFrames: data.video_input_type === "Frames",
      modelValue: data.model,
    });
    if (
      data.video_input_type === "Frames" &&
      !data.frame_1_file_id &&
      !data.frame_2_file_id &&
      !data.frame_1_source &&
      !data.frame_2_source
    ) {
      const ids = String(data.ref_file_ids || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      (ids.length <= 2 ? ids : []).forEach((id, i) => {
        const prefix = `frame_${i + 1}`;
        data[`${prefix}_source`] = "manual";
        data[`${prefix}_file_id`] = id;
        const ref = data.ref_thumbnails?.[id];
        data[`${prefix}_thumbnail`] =
          typeof ref === "string"
            ? ref
            : ref?.source_thumbnail || ref?.thumbnail || null;
        data[`${prefix}_file_name`] = data.ref_file_names?.[id] || null;
      });
    }
    return data;
  }
  frameReferenceData(data) {
    if (
      !data.frame_1_file_id &&
      !data.frame_2_file_id &&
      !data.frame_1_source &&
      !data.frame_2_source &&
      String(data.ref_file_ids || "")
        .split(",")
        .filter((id) => id.trim()).length > 2
    ) {
      throw Object.assign(new Error("GROK_REF_LIMIT_EXCEEDED"), {
        code: "GROK_REF_LIMIT_EXCEEDED",
      });
    }
    const out = { ref_file_ids: "", ref_thumbnails: {}, ref_file_names: {} };
    const ids = [];
    for (const slot of [1, 2]) {
      const prefix = `frame_${slot}`;
      for (const field of ["source", "file_id", "thumbnail", "file_name"])
        out[`${prefix}_${field}`] = data[`${prefix}_${field}`] || null;
      const id = out[`${prefix}_file_id`];
      if (!id) continue;
      ids.push(id);
      const record = data.ref_thumbnails?.[id];
      out.ref_thumbnails[id] =
        record && typeof record === "object"
          ? {
              ...record,
              thumbnail: out[`${prefix}_thumbnail`] || record.thumbnail || null,
            }
          : out[`${prefix}_thumbnail`] || record || null;
      out.ref_file_names[id] =
        out[`${prefix}_file_name`] || data.ref_file_names?.[id] || null;
    }
    out.ref_file_ids = ids.join(",");
    return out;
  }
  validateFrameSlots(data) {
    if (data.frame_2_file_id && !data.frame_1_file_id) {
      throw Object.assign(new Error("GROK_FIRST_FRAME_MISSING"), {
        code: "GROK_FIRST_FRAME_MISSING",
      });
    }
  }
  _frameIcons() {
    return {
      start: [
        "0 0 11 10",
        '<path d="M5 7.5L8.9 7.5C9.46005 7.5 9.74008 7.5 9.95399 7.39101C10.1422 7.29513 10.2951 7.14215 10.391 6.95399C10.5 6.74008 10.5 6.46005 10.5 5.9V4.1C10.5 3.53995 10.5 3.25992 10.391 3.04601C10.2951 2.85785 10.1422 2.70487 9.95399 2.60899C9.74008 2.5 9.46005 2.5 8.9 2.5L5 2.5M3 7.5H2.1C1.53995 7.5 1.25992 7.5 1.04601 7.39101C0.857847 7.29513 0.704867 7.14215 0.608994 6.95399C0.5 6.74008 0.5 6.46005 0.5 5.9V4.1C0.5 3.53995 0.5 3.25992 0.608994 3.04601C0.704867 2.85785 0.857847 2.70487 1.04601 2.60899C1.25992 2.5 1.53995 2.5 2.1 2.5H3M3 0.5L3 9.5M1.75 9.5L4.25 9.5M1.75 0.499996L4.25 0.5"></path>',
      ],
      end: [
        "0 0 12 12",
        '<path d="M6.5 3.5H2.6C2.03995 3.5 1.75992 3.5 1.54601 3.60899C1.35785 3.70487 1.20487 3.85785 1.10899 4.04601C1 4.25992 1 4.53995 1 5.1V6.9C1 7.46005 1 7.74008 1.10899 7.95399C1.20487 8.14215 1.35785 8.29513 1.54601 8.39101C1.75992 8.5 2.03995 8.5 2.6 8.5H6.5M8.5 3.5H9.4C9.96005 3.5 10.2401 3.5 10.454 3.60899C10.6422 3.70487 10.7951 3.85785 10.891 4.04601C11 4.25992 11 4.53995 11 5.1V6.9C11 7.46005 11 7.74008 10.891 7.95399C10.7951 8.14215 10.6422 8.29513 10.454 8.39101C10.2401 8.5 9.96005 8.5 9.4 8.5H8.5M8.5 10.5L8.5 1.5M9.75 1.5L7.25 1.5M9.75 10.5L7.25 10.5"></path>',
      ],
      add: [
        "0 0 24 24",
        '<rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line>',
      ],
      upload: [
        "0 0 24 24",
        '<path d="M15 8h.01"></path><path d="M12.5 21h-6.5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v6.5"></path><path d="M3 16l5-5c.928-.893 2.072-.893 3 0l3.5 3.5"></path><path d="M19 22v-6"></path><path d="M22 19l-3-3-3 3"></path>',
      ],
      pairs: [
        "0 0 24 24",
        '<rect x="2.5" y="5" width="7" height="6" rx="1"></rect><rect x="14.5" y="5" width="7" height="6" rx="1"></rect><path d="M9.5 8h5"></path><rect x="2.5" y="15" width="7" height="6" rx="1"></rect><rect x="14.5" y="15" width="7" height="6" rx="1"></rect><path d="M9.5 18h5"></path>',
      ],
      chain: [
        "0 0 24 24",
        '<rect x="3" y="5" width="6" height="6" rx="1"></rect><rect x="15" y="13" width="6" height="6" rx="1"></rect><path d="M9 8h4a4 4 0 0 1 4 4v1"></path><path d="m14 11 3 3 3-3"></path>',
      ],
      clear: [
        "0 0 24 24",
        '<path d="M4 7h16"></path><path d="m9 7 1-2h4l1 2"></path><path d="m6 7 1 13h10l1-13"></path><path d="M10 11v5M14 11v5"></path>',
      ],
    };
  }
  framePairs(data, promptCount = 1) {
    return Array.from({ length: Math.max(1, promptCount) }, (_, index) => {
      if (promptCount <= 1)
        return this.frameReferenceData({ ...data, ref_file_ids: "" });
      if (!Array.isArray(data.frame_pairs))
        return this.frameReferenceData(
          index === 0 ? { ...data, ref_file_ids: "" } : {},
        );
      const pair = data.frame_pairs[index] || {};
      return this.frameReferenceData({
        ref_thumbnails: data.ref_thumbnails,
        ref_file_names: data.ref_file_names,
        frame_1_source: "manual",
        frame_2_source: "manual",
        frame_1_file_id: pair.frame1,
        frame_1_thumbnail: pair.frame1Thumb,
        frame_1_file_name: pair.frame1FileName,
        frame_2_file_id: pair.frame2,
        frame_2_thumbnail: pair.frame2Thumb,
        frame_2_file_name: pair.frame2FileName,
      });
    });
  }
  frameSelectionData(data, promptCount = 1, { requireStart = false } = {}) {
    const pairs = this.framePairs(data, promptCount);
    const missing = pairs.flatMap((pair, index) =>
      !pair.frame_1_file_id && (requireStart || pair.frame_2_file_id)
        ? [index + 1]
        : [],
    );
    if (missing.length)
      throw Object.assign(new Error("GROK_FIRST_FRAME_MISSING"), {
        code: "GROK_FIRST_FRAME_MISSING",
        positions: missing,
      });
    const refs = this.frameReferenceData({ ...data, ref_file_ids: "" });
    const ids = new Set();
    refs.ref_thumbnails = { ...(data.ref_thumbnails || {}) };
    refs.ref_file_names = { ...(data.ref_file_names || {}) };
    for (const pair of pairs) {
      for (const id of pair.ref_file_ids.split(",").filter(Boolean))
        ids.add(id);
      Object.assign(refs.ref_thumbnails, pair.ref_thumbnails);
      Object.assign(refs.ref_file_names, pair.ref_file_names);
    }
    refs.ref_file_ids = [...ids].join(",");
    refs.frame_pairs =
      promptCount > 1
        ? pairs.map((pair) => ({
            frame1: pair.frame_1_file_id || "",
            frame2: pair.frame_2_file_id || "",
            frame1Thumb: pair.frame_1_thumbnail || "",
            frame2Thumb: pair.frame_2_thumbnail || "",
            frame1FileName: pair.frame_1_file_name || "",
            frame2FileName: pair.frame_2_file_name || "",
          }))
        : null;
    return refs;
  }
  renderFrameControls(container, options) {
    if (!container || container._grokFrameBusy) return;
    const {
      data,
      surface,
      active,
      onChange,
      onBusy,
      promptCount = 1,
      promptPreviews = [],
    } = options;
    const count = Math.max(1, promptCount);
    const make = (tag, className = "", text) => {
      const el = document.createElement(tag);
      el.className = className;
      if (text !== void 0) el.textContent = text;
      return el;
    };
    const icon = (kind) => {
      const [viewBox, markup] = this._frameIcons()[kind];
      const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      el.setAttribute("viewBox", viewBox);
      el.setAttribute(
        "class",
        kind === "start" || kind === "end"
          ? "frame-slot-icon"
          : kind === "add"
            ? "frame-dropzone-icon"
            : "ref-btn-icon",
      );
      if (kind === "upload") {
        el.setAttribute("width", "18");
        el.setAttribute("height", "18");
      }
      const strokeWidth =
        kind === "start" || kind === "end"
          ? "1"
          : ["pairs", "chain", "clear"].includes(kind)
            ? "1.8"
            : "1.5";
      for (const [key, value] of Object.entries({
        fill: "none",
        stroke: "currentColor",
        "stroke-width": strokeWidth,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }))
        el.setAttribute(key, value);
      el.innerHTML = markup;
      return el;
    };
    const t = (key, fallback) => window.I18n?.t?.(key) || fallback;
    if (container._grokFrameOwner !== data) {
      container._grokFrameOwner = data;
      data.ref_thumbnails = { ...(data.ref_thumbnails || {}) };
      data.ref_file_names = { ...(data.ref_file_names || {}) };
      container._grokFrameSources = [
        ...new Set([
          ...String(data.ref_file_ids || "")
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean),
          ...Object.keys(data.ref_thumbnails || {}),
          ...this.framePairs(data, count).flatMap((pair) =>
            pair.ref_file_ids.split(",").filter(Boolean),
          ),
        ]),
      ];
    }
    const sources = container._grokFrameSources;
    if (options.sourceFileIds !== void 0) {
      const sharedIds = [
        ...new Set(
          String(options.sourceFileIds || "")
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean),
        ),
      ];
      sources.splice(0, sources.length, ...sharedIds);
      for (const slot of [1, 2])
        if (
          data[`frame_${slot}_file_id`] &&
          !sources.includes(data[`frame_${slot}_file_id`])
        ) {
          for (const field of ["file_id", "thumbnail", "file_name"])
            data[`frame_${slot}_${field}`] = null;
        }
      data.frame_pairs = data.frame_pairs?.map((pair) => ({
        ...pair,
        ...(pair.frame1 && !sources.includes(pair.frame1)
          ? { frame1: "", frame1Thumb: "", frame1FileName: "" }
          : {}),
        ...(pair.frame2 && !sources.includes(pair.frame2)
          ? { frame2: "", frame2Thumb: "", frame2FileName: "" }
          : {}),
      }));
    }
    const alive = () => container.isConnected && active?.() !== false;
    const editable = () => alive() && !container._grokFrameBusy;
    const rerender = () => {
      if (alive()) this.renderFrameControls(container, options);
    };
    const pairs = this.framePairs(data, count);
    const thumbnailFor = (id) => {
      const record = data.ref_thumbnails?.[id];
      return (
        (typeof record === "string"
          ? record
          : record?.source_thumbnail || record?.thumbnail) ||
        window.pendingUploadFiles?.get(id)?.thumbnail ||
        ""
      );
    };
    const setSlot = (index, slot, id = "") => {
      const prefix = `frame_${slot}`;
      const pair = pairs[index];
      pair[`${prefix}_source`] = "manual";
      pair[`${prefix}_file_id`] = id || null;
      pair[`${prefix}_thumbnail`] = id ? thumbnailFor(id) || null : null;
      pair[`${prefix}_file_name`] = id
        ? data.ref_file_names?.[id] ||
          data.ref_thumbnails?.[id]?.file_name ||
          null
        : null;
    };
    const clearGlobalSource = (id) => {
      for (const slot of [1, 2])
        if (data[`frame_${slot}_file_id`] === id) {
          for (const field of ["file_id", "thumbnail", "file_name"])
            data[`frame_${slot}_${field}`] = null;
        }
    };
    const commit = () => {
      if (count > 1)
        data.frame_pairs = pairs
          .map((pair) => ({
            frame1: pair.frame_1_file_id || "",
            frame2: pair.frame_2_file_id || "",
            frame1Thumb: pair.frame_1_thumbnail || "",
            frame2Thumb: pair.frame_2_thumbnail || "",
            frame1FileName: pair.frame_1_file_name || "",
            frame2FileName: pair.frame_2_file_name || "",
          }))
          .concat((data.frame_pairs || []).slice(count));
      else {
        for (const slot of [1, 2])
          for (const field of ["source", "file_id", "thumbnail", "file_name"]) {
            const key = `frame_${slot}_${field}`;
            data[key] = pairs[0][key];
          }
      }
      const selection = {
        ...this.frameReferenceData({ ...data, ref_file_ids: "" }),
        ref_thumbnails: data.ref_thumbnails || {},
        ref_file_names: data.ref_file_names || {},
      };
      selection.frame_pairs = data.frame_pairs || null;
      selection.ref_file_ids = [
        ...new Set(
          pairs.flatMap((pair) =>
            [pair.frame_1_file_id, pair.frame_2_file_id].filter(Boolean),
          ),
        ),
      ].join(",");
      onChange?.(selection, {
        ref_file_ids: sources.join(","),
        ref_thumbnails: data.ref_thumbnails || {},
        ref_file_names: data.ref_file_names || {},
      });
      if (options.sourceFileIds !== void 0)
        options.sourceFileIds = sources.join(",");
      rerender();
    };
    const prepare = async (image) => {
      let refId = image.fileId;
      let thumbnail =
        image.source_thumbnail || image.thumbnail_url || image.thumbnail;
      let identity = image;
      let fileName = image.file_name || image.name || image.file?.name || null;
      if (image.source === "album") {
        const prepared =
          await window.ImagePickerModal.prepareAlbumImageForRef(image);
        if (!prepared?.key) throw new Error("REF_PREPARE_FAILED");
        refId = prepared.key;
        fileName = prepared.file_name || fileName;
        thumbnail =
          image.thumbnail_url ||
          (await window.ImageStore?.getThumbnail?.(image.album_image_id)) ||
          window.pendingUploadFiles?.get(refId)?.thumbnail ||
          thumbnail;
      } else if (image.file) {
        if (!thumbnail)
          thumbnail = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("REF_PREPARE_FAILED"));
            reader.readAsDataURL(image.file);
          });
        refId ||
          (refId = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
        window.pendingUploadFiles || (window.pendingUploadFiles = new Map());
        window.pendingUploadFiles.set(refId, {
          file: image.file,
          thumbnail,
          name: fileName,
        });
      }
      if (!refId) throw new Error("REF_PREPARE_FAILED");
      if (surface !== "gen" && refId.startsWith("upload_")) {
        const file = window.pendingUploadFiles?.get(refId)?.file;
        if (!file || !window.ImmediateUploader)
          throw new Error("REF_UPLOAD_FAILED");
        const uploaded = await window.ImmediateUploader.upload(
          file,
          thumbnail,
          { key: refId, surface },
        );
        if (!uploaded?.success || !uploaded.tile_id)
          throw new Error("REF_UPLOAD_FAILED");
        refId = uploaded.tile_id;
        identity = { ...image, ...uploaded };
        fileName = uploaded.file_name || fileName;
        thumbnail = uploaded.thumbnail_url || uploaded.thumbnail || thumbnail;
      }
      const record = {
        thumbnail: thumbnail || null,
        file_name: fileName,
        type: "image",
      };
      for (const field of [
        "source_thumbnail",
        "media_uuid",
        "persistent_media_id",
        "identity_kind",
        "identity_durability",
        "identity_aliases",
        "api_driver",
        "project_id",
        "protocol_revision",
        "protocol_fingerprint",
        "display_name",
      ]) {
        if (identity[field]) record[field] = identity[field];
      }
      return { id: refId, record, fileName };
    };
    const receive = async (images, index, slot, replaceSources = false) => {
      if (!editable() || (!images.length && !replaceSources)) return;
      container._grokFrameBusy = true;
      onBusy?.(true);
      try {
        const prepared = [];
        for (const image of slot ? images.slice(0, 1) : images)
          prepared.push(await prepare(image));
        if (!alive()) return;
        data.ref_thumbnails || (data.ref_thumbnails = {});
        data.ref_file_names || (data.ref_file_names = {});
        for (const image of prepared) {
          data.ref_thumbnails[image.id] = image.record;
          data.ref_file_names[image.id] = image.fileName;
          if (!sources.includes(image.id)) sources.push(image.id);
        }
        if (replaceSources) {
          const kept = new Set(prepared.map((image) => image.id));
          for (const id of sources) {
            if (kept.has(id)) continue;
            clearGlobalSource(id);
            for (let i = 0; i < pairs.length; i++)
              for (const n of [1, 2])
                if (pairs[i][`frame_${n}_file_id`] === id) setSlot(i, n);
            delete data.ref_thumbnails[id];
            delete data.ref_file_names[id];
          }
          data.frame_pairs = data.frame_pairs?.map((pair) => ({
            ...pair,
            ...(!kept.has(pair.frame1)
              ? { frame1: "", frame1Thumb: "", frame1FileName: "" }
              : {}),
            ...(!kept.has(pair.frame2)
              ? { frame2: "", frame2Thumb: "", frame2FileName: "" }
              : {}),
          }));
          sources.splice(0, sources.length, ...kept);
        }
        if (slot) setSlot(index, slot, prepared[0].id);
        commit();
      } catch (error) {
        console.warn("[Grok] Frame selection failed:", error.message);
        if (alive())
          window.showNotification?.(
            t(
              "albums.uploadFailedAll",
              "Unable to prepare the frame. Please select it again.",
            ),
            "error",
          );
      } finally {
        container._grokFrameBusy = false;
        onBusy?.(false);
        if (container._grokFrameRefresh) container._grokFrameRefresh();
        else rerender();
      }
    };
    const pick = (index, slot) => {
      if (!editable() || !window.ImagePickerModal) return;
      window.imagePickerModal ||
        (window.imagePickerModal = new window.ImagePickerModal());
      const id = slot ? pairs[index][`frame_${slot}_file_id`] : null;
      const existingIds = slot ? (id ? [id] : []) : sources;
      const existingMedia = Object.fromEntries(
        existingIds.map((id2) => [
          id2,
          {
            ...(typeof data.ref_thumbnails?.[id2] === "object"
              ? data.ref_thumbnails[id2]
              : {}),
            thumbnail: thumbnailFor(id2),
            file_name: data.ref_file_names?.[id2],
            type: "image",
          },
        ]),
      );
      window.imagePickerModal.open({
        refAuditContext: { surface },
        mediaFilter: "image",
        allowVideo: false,
        maxSelections: slot ? 1 : null,
        maxImageSelections: slot ? 1 : null,
        maxVideoSelections: 0,
        maxTotalSelections: slot ? 1 : null,
        existingFileIds: existingIds,
        existingMedia,
        onConfirm: (images) => receive(images, index, slot, !slot),
      });
    };
    const dragType = "application/x-toby-grok-frame-id";
    const bindDrag = (element, id) => {
      element.draggable = true;
      element.addEventListener("dragstart", (event) => {
        if (!editable()) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.setData(dragType, id);
        event.dataTransfer.setData("text/plain", id);
        element.classList.add("dragging");
      });
      element.addEventListener("dragend", () =>
        element.classList.remove("dragging"),
      );
    };
    const bindDrop = (element, index, slot, targetId) => {
      element.addEventListener("dragover", (event) => {
        if (!editable()) return;
        event.preventDefault();
        event.stopPropagation();
        element.classList.add(slot ? "frame-drag-over" : "drag-over");
      });
      element.addEventListener("dragleave", (event) => {
        if (!element.contains(event.relatedTarget))
          element.classList.remove("frame-drag-over", "drag-over");
      });
      element.addEventListener("drop", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        element.classList.remove("frame-drag-over", "drag-over");
        if (!editable()) return;
        const files = Array.from(event.dataTransfer?.files || []).filter(
          (file) => file.type.startsWith("image/"),
        );
        if (files.length) {
          await receive(
            files.map((file) => ({ file, source: "upload", name: file.name })),
            index,
            slot,
          );
          return;
        }
        const id =
          event.dataTransfer?.getData(dragType) ||
          event.dataTransfer?.getData("text/plain");
        if (!sources.includes(id)) return;
        if (slot) {
          setSlot(index, slot, id);
          commit();
        } else if (targetId && id !== targetId) {
          sources.splice(sources.indexOf(id), 1);
          sources.splice(sources.indexOf(targetId), 0, id);
          commit();
        }
      });
    };
    container.replaceChildren();
    const panel = make("div", "frame-source-panel");
    const head = make("div", "frame-source-head");
    const sourceLabel = make("span", "frame-source-label");
    const sourceIcon = make("span", "frame-source-label-icon");
    sourceIcon.setAttribute("aria-hidden", "true");
    sourceIcon.innerHTML = `<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M8.958 8.501a1.5 1.5 0 1 1 0 2.999 1.5 1.5 0 0 1 0-2.999"></path><path fill-rule="evenodd" d="M6.974 3.95a3.065 3.065 0 0 1 3.461-2.608l5.975.84a3.065 3.065 0 0 1 2.608 3.462l-.84 5.975a3.064 3.064 0 0 1-3.46 2.607l-.938-.132.03.206a3.065 3.065 0 0 1-2.608 3.462l-5.975.839a3.065 3.065 0 0 1-3.461-2.607l-.84-5.975a3.065 3.065 0 0 1 2.608-3.462l3.134-.441zm-.517 9.528a1.337 1.337 0 0 0-1.871.263l-1.513 2.007.009.06a1.736 1.736 0 0 0 1.96 1.477l5.45-.767zm3.237-6.443-5.974.838a1.736 1.736 0 0 0-1.477 1.96l.568 4.051.713-.944a2.666 2.666 0 0 1 3.733-.524l4.72 3.557a1.73 1.73 0 0 0 .516-1.487l-.84-5.975a1.735 1.735 0 0 0-1.959-1.476m.557-4.375a1.735 1.735 0 0 0-1.96 1.476l-.252 1.787 1.47-.206a3.066 3.066 0 0 1 3.462 2.61l.617 4.397 1.314.186a1.735 1.735 0 0 0 1.96-1.477l.84-5.975a1.736 1.736 0 0 0-1.478-1.96z" clip-rule="evenodd"></path></svg>`;
    sourceLabel.appendChild(sourceIcon);
    sourceLabel.appendChild(
      make(
        "span",
        "",
        `${t("gen.refImages", "Source images")} (${sources.length})`,
      ),
    );
    head.appendChild(sourceLabel);
    panel.appendChild(head);
    const add = make(
      "button",
      "ref-btn-upload ref-btn-upload--wide frame-source-dropzone",
    );
    add.type = "button";
    add.appendChild(icon("upload"));
    add.appendChild(
      make(
        "span",
        "ref-btn-text",
        t("gen.selectUploadImage", "Select image / Drag here"),
      ),
    );
    add.addEventListener("click", () => pick());
    bindDrop(add);
    panel.appendChild(add);
    if (sources.length) {
      const list = make("div", "frame-source-list");
      for (const [index, id] of sources.entries()) {
        const item = make(
          "div",
          `ref-thumb frame-source-thumb ${id.startsWith("upload_") ? "ref-thumb-pending is-local" : "is-flow"}`,
        );
        item.dataset.index = String(index + 1);
        const inner = make("div", "ref-thumb-inner frame-source-thumb-inner");
        const thumbnail = thumbnailFor(id);
        if (thumbnail) {
          const img = make("img");
          img.src = thumbnail;
          img.alt = data.ref_file_names?.[id] || "";
          img.loading = "lazy";
          inner.appendChild(img);
        } else inner.appendChild(make("span", "", id.substring(0, 8)));
        const isLocal = id.startsWith("upload_");
        const sourceLabel2 = isLocal
          ? t("gen.uploadQueued", "Waiting")
          : "Flow";
        item.title = `${sourceLabel2} \xB7 #${index + 1}`;
        inner.appendChild(
          make(
            "span",
            `ref-thumb-badge${isLocal ? "" : " frame-source-flow-badge"}`,
            sourceLabel2,
          ),
        );
        item.appendChild(inner);
        bindDrag(item, id);
        bindDrop(item, null, null, id);
        const remove = make("button", "frame-source-remove", "\xD7");
        remove.type = "button";
        remove.title = t("tasks.removeTitle", "Remove");
        remove.addEventListener("click", () => {
          if (!editable()) return;
          sources.splice(sources.indexOf(id), 1);
          clearGlobalSource(id);
          for (let i = 0; i < pairs.length; i++)
            for (const slot of [1, 2])
              if (pairs[i][`frame_${slot}_file_id`] === id) setSlot(i, slot);
          data.frame_pairs = data.frame_pairs?.map((pair) => ({
            ...pair,
            ...(pair.frame1 === id
              ? { frame1: "", frame1Thumb: "", frame1FileName: "" }
              : {}),
            ...(pair.frame2 === id
              ? { frame2: "", frame2Thumb: "", frame2FileName: "" }
              : {}),
          }));
          delete data.ref_thumbnails?.[id];
          delete data.ref_file_names?.[id];
          commit();
        });
        item.appendChild(remove);
        list.appendChild(item);
      }
      panel.appendChild(list);
    }
    const actions = make("div", "frame-source-actions");
    for (const [mode, label, fallback] of [
      ["start", "gen.frameAssignStart", "Assign to Start"],
      ["pairs", "gen.frameAssignPairs", "Assign pairs"],
      ["chain", "gen.frameBuildChain", "Build A \u2192 B chain"],
      ["clear", "common.clear", "Clear frames"],
    ]) {
      const button = make("button");
      button.type = "button";
      button.dataset.frameBulk = mode;
      button.appendChild(icon(mode));
      button.appendChild(make("span", "", t(label, fallback)));
      button.disabled = !sources.length && mode !== "clear";
      button.addEventListener("click", () => {
        if (!editable()) return;
        for (let i = 0; i < count; i++) {
          if (mode === "clear") {
            setSlot(i, 1);
            setSlot(i, 2);
            continue;
          }
          const first = mode === "pairs" ? sources[i * 2] : sources[i];
          const last = mode === "pairs" ? sources[i * 2 + 1] : sources[i + 1];
          if (count > 1 && mode === "chain" && !last) continue;
          if (first && (count === 1 || !pairs[i].frame_1_file_id))
            setSlot(i, 1, first);
          if (
            mode !== "start" &&
            first &&
            (count === 1 || !pairs[i].frame_2_file_id)
          )
            setSlot(i, 2, last);
        }
        commit();
      });
      actions.appendChild(button);
    }
    if (sources.length) panel.appendChild(actions);
    container.appendChild(panel);
    for (let index = 0; index < count; index++) {
      const pair = pairs[index];
      const wrapper = make("div", count > 1 ? "per-prompt-frame-pair" : "");
      if (count > 1) {
        const header = make("div", "per-prompt-frame-header");
        header.appendChild(make("span", "per-prompt-frame-index", index + 1));
        const preview = make(
          "span",
          "per-prompt-frame-prompt-preview",
          promptPreviews[index] || "",
        );
        preview.title = promptPreviews[index] || "";
        header.appendChild(preview);
        wrapper.appendChild(header);
      }
      const row = make(
        "div",
        count > 1 ? "per-prompt-frame-slots" : "frame-config",
      );
      wrapper.appendChild(row);
      for (const slot of [1, 2]) {
        const prefix = `frame_${slot}`;
        const title = t(
          slot === 1 ? "gen.frameStart" : "gen.frameEnd",
          slot === 1 ? "Start" : "End",
        );
        const element = make("div", "frame-slot");
        const header = make("div", "frame-slot-header");
        header.appendChild(icon(slot === 1 ? "start" : "end"));
        header.appendChild(make("span", "frame-slot-label", title));
        element.appendChild(header);
        const body = make("div", "frame-slot-body");
        element.appendChild(body);
        const input = make("input");
        input.type = "hidden";
        input.name = `${prefix}_file_id`;
        input.value = pair[`${prefix}_file_id`] || "";
        element.appendChild(input);
        const id = pair[`${prefix}_file_id`];
        const pickButton = make(
          "div",
          id ? "frame-thumb-wrap" : "frame-dropzone",
        );
        pickButton.setAttribute("role", "button");
        pickButton.tabIndex = 0;
        pickButton.title = title;
        pickButton.addEventListener("keydown", (event) => {
          if (
            event.target === pickButton &&
            ["Enter", " "].includes(event.key)
          ) {
            event.preventDefault();
            pickButton.click();
          }
        });
        pickButton.addEventListener("click", () => pick(index, slot));
        if (id) {
          const thumbnail = pair[`${prefix}_thumbnail`] || thumbnailFor(id);
          if (thumbnail) {
            const img = make("img");
            img.src = thumbnail;
            img.alt = title;
            pickButton.appendChild(img);
          } else
            pickButton.appendChild(make("span", "frame-thumb-fallback", id));
          bindDrag(pickButton, id);
          const remove = make("button", "ref-thumb-remove", "\xD7");
          remove.type = "button";
          remove.title = t("tasks.removeTitle", "Remove");
          remove.addEventListener("click", (event) => {
            event.stopPropagation();
            if (editable()) {
              setSlot(index, slot);
              commit();
            }
          });
          pickButton.appendChild(remove);
        } else {
          pickButton.appendChild(icon("add"));
          pickButton.appendChild(
            make("span", "frame-dropzone-text", t("gen.addFrame", "Add")),
          );
        }
        body.appendChild(pickButton);
        bindDrop(element, index, slot);
        row.appendChild(element);
      }
      container.appendChild(wrapper);
    }
  }
  populateReferenceControls(modelSelect, inputSelect, options = {}) {
    if (!modelSelect || !inputSelect) return;
    const mode = options.mode || "image";
    const fill = (select, items, selected) => {
      select.replaceChildren();
      for (const item of items) {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.name || item.label;
        select.appendChild(option);
      }
      if (items.some((item) => item.value === selected))
        select.value = selected;
      select.disabled = items.length === 0;
    };
    const models = this.getModels(mode);
    const modelValue =
      modelSelect.value ||
      options.modelValue ||
      window.ModelRegistry?.safeGetDefault?.("grok", mode);
    const inputType = inputSelect.value || options.inputType || "Ingredients";
    fill(
      modelSelect,
      models,
      models.some((model) => model.value === modelValue)
        ? modelValue
        : models.find((model) => model.is_default)?.value || null,
    );
    fill(inputSelect, this.getVideoInputTypes(modelSelect.value), inputType);
    modelSelect._grokReferenceOptions = options;
    if (!modelSelect._grokReferenceBound) {
      modelSelect.addEventListener("change", () => {
        this.populateReferenceControls(
          modelSelect,
          inputSelect,
          modelSelect._grokReferenceOptions,
        );
        modelSelect._grokReferenceOptions?.onChange?.();
      });
      inputSelect.addEventListener("change", () =>
        modelSelect._grokReferenceOptions?.onChange?.(),
      );
      modelSelect._grokReferenceBound = true;
    }
  }
  getMaxRefImages({ mode = "image", isFrames = false, modelValue } = {}) {
    const model = this.getModel(modelValue, mode);
    if (mode === "video") {
      const option = this.getVideoInputTypes(modelValue).find(
        (item) => item.value === (isFrames ? "Frames" : "Ingredients"),
      );
      if (!option) return 0;
      const cap2 = Number(option.max_ref_images);
      if (!Number.isInteger(cap2) || cap2 < 0) return 0;
      return isFrames
        ? Math.min(2, cap2, option.role_selectors?.length || 0)
        : cap2;
    }
    const cap = model?.config?.max_ref_images?.image;
    return Number.isInteger(cap) && cap >= 0
      ? cap
      : (window.ProviderConfigManager?.safeGetMaxRefImagesSync?.(
          "grok",
          mode,
        ) ?? 0);
  }
  async submit(params = {}) {
    const stopped = () => params.shouldStop?.() === true;
    const cancelled = () => ({ success: false, error: "ABORTED" });
    if (stopped()) return cancelled();
    let ready = await this.ensureReady();
    if (stopped()) return cancelled();
    if (!ready || !ready.ready) {
      return { success: false, error: ready?.error || "NOT_READY" };
    }
    let tabId =
      ready.tabId || (await window.GrokSession?.getTabInfo?.())?.tabId;
    if (stopped()) return cancelled();
    if (!tabId) {
      return { success: false, error: "NO_TAB" };
    }
    const settings = params.settings || {};
    const mode = settings.mode || "image";
    const model = this.getModel(settings.model, mode);
    if (settings.model && !model)
      return { success: false, error: "GROK_MODEL_CONFIG_MISSING" };
    const videoInputType = settings.videoInputType || "Ingredients";
    const refMode =
      mode === "video"
        ? this.getVideoInputTypes(model?.value).find(
            (option) => option.value === videoInputType,
          )
        : null;
    if (mode === "video" && !refMode)
      return { success: false, error: "GROK_INPUT_TYPE_CONFIG_MISSING" };
    const maxRefs = this.getMaxRefImages({
      mode,
      isFrames: videoInputType === "Frames",
      modelValue: model?.value,
    });
    const requestedRefs = Array.isArray(params.refFileIds)
      ? params.refFileIds
      : [];
    if (requestedRefs.length > maxRefs)
      return { success: false, error: "GROK_REF_LIMIT_EXCEEDED" };
    const ratio = this._normalizeRatio(settings.ratio);
    const duration = settings.duration || "6s";
    const resolution = settings.resolution || "720p";
    const imageQuality = String(settings.imageQuality || "speed").toLowerCase();
    const timeout =
      settings.timeout ||
      (mode === "video"
        ? window.SystemConfig?.getTimeout("video_timeout_ms") || 6e5
        : window.SystemConfig?.getTimeout("image_timeout_ms") || 3e5);
    const isDisconnectError = (errMsg) => {
      const m = String(errMsg || "").toLowerCase();
      return (
        m.includes("receiving end does not exist") ||
        m.includes("could not establish connection") ||
        m.includes("message port closed") ||
        m.includes("message channel closed") ||
        m.includes("message channel is closed") ||
        m.includes("back/forward cache") ||
        m.includes("extension port")
      );
    };
    const reinjectIfNeeded = async (sameTab = false) => {
      if (stopped()) return false;
      console.warn(
        "[GrokAdapter] Content script disconnect detected \u2192 force re-inject",
      );
      if (window.GrokSession) {
        window.GrokSession._ready = false;
        window.GrokSession._lastCheck = 0;
      }
      if (sameTab) {
        const injected = await window.GrokSession._sendToBackground(
          "grok:injectScript",
          { tabId },
        );
        return injected?.success === true;
      }
      ready = await this.ensureReady();
      if (stopped()) return false;
      if (!ready?.ready) {
        return false;
      }
      tabId = ready.tabId || (await window.GrokSession?.getTabInfo?.())?.tabId;
      return !!tabId;
    };
    if (mode) {
      try {
        let status = await window.GrokSession.checkStatus();
        if (stopped()) return cancelled();
        if (isDisconnectError(status?.error)) {
          const reinjected = await reinjectIfNeeded();
          if (stopped()) return cancelled();
          if (reinjected) {
            status = await window.GrokSession.checkStatus();
            if (stopped()) return cancelled();
          }
        }
        if (isDisconnectError(status?.error)) {
          console.warn(
            "[GrokAdapter] Status probe disconnected after reinject",
          );
          return { success: false, error: "SET_MODE_FAILED" };
        }
      } catch (e) {
        console.warn("[GrokAdapter] Status probe exception:", e?.message || e);
      }
    }
    const refImagesResolved = await this._resolveRefImages(
      params.refFileIds || [],
    );
    if (stopped()) return cancelled();
    if (
      mode === "video" &&
      videoInputType === "Frames" &&
      refImagesResolved.length !== requestedRefs.length
    ) {
      return { success: false, error: "REF_UPLOAD_FAILED" };
    }
    console.log(
      "[GrokAdapter] refImages resolved:",
      refImagesResolved.length,
      "/ tabId:",
      tabId,
    );
    if (
      !window.MessageBridge ||
      typeof window.MessageBridge.grokSubmitAndWait !== "function"
    ) {
      console.error(
        "[GrokAdapter] MessageBridge.grokSubmitAndWait KH\xD4NG T\u1ED2N T\u1EA0I",
      );
      return { success: false, error: "BRIDGE_NOT_LOADED" };
    }
    console.log(
      "[GrokAdapter] B\u1EAFt \u0111\u1EA7u grokSubmitAndWait, mode:",
      mode,
      "prompt len:",
      (params.prompt || "").length,
    );
    const inputTimeoutMs =
      window.storageSettings?.getSettings()?.inputTimeout || 1200;
    const requestId =
      globalThis.crypto?.randomUUID?.() ||
      `grok-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const submitPayload = () => ({
      text: params.prompt || "",
      images: refImagesResolved,
      settings: {
        mode,
        ratio,
        duration,
        resolution,
        imageQuality,
        timeout,
        model: model?.value || null,
        videoInputType,
        refRoleSelectors: refMode?.role_selectors || null,
      },
      inputTimeoutMs,
      requestId,
      timeout,
      tabId,
      taskName: params.taskName || null,
      prefetchMedia: mode !== "video",
    });
    let result = await window.MessageBridge.grokSubmitAndWait(submitPayload());
    if (stopped() && !result?.success) return { ...cancelled(), tabId };
    for (
      let attempt = 0;
      attempt < 3 &&
      !result?.success &&
      isDisconnectError(result?.message || result?.error);
      attempt++
    ) {
      console.warn(
        "[GrokAdapter] disconnect \u2192 wait for document + recover operation",
        { requestId, tabId, attempt: attempt + 1 },
      );
      let reinjected = false;
      try {
        reinjected = await reinjectIfNeeded(true);
      } catch (err) {
        console.warn("[GrokAdapter] recovery injection failed:", err.message);
      }
      if (stopped()) return { ...cancelled(), tabId };
      if (reinjected) {
        result = await window.MessageBridge.grokSubmitAndWait({
          ...submitPayload(),
          recover: true,
        });
      } else break;
    }
    if (!result?.success)
      console.warn(
        "[GrokAdapter] operation failed",
        JSON.stringify({
          requestId,
          tabId,
          error: result?.error,
          message: result?.message,
          details: result?.details,
        }),
      );
    try {
      if (window.EditorExecutor?._incrementDailyStat) {
        if (result?.success) {
          window.EditorExecutor._incrementDailyStat("grok_prompt_total");
        } else {
          window.EditorExecutor._incrementDailyStat("grok_fail");
        }
      }
    } catch (_) {}
    return { ...(result || { success: false, error: "NO_RESPONSE" }), tabId };
  }
  _normalizeRatio(input) {
    if (!input) return "widescreen";
    const s = String(input).trim().toLowerCase();
    const map = {
      "9:16": "story",
      "d\u1ECDc": "story",
      doc: "story",
      story: "story",
      "3:4": "portrait",
      "2:3": "portrait",
      portrait: "portrait",
      "1:1": "square",
      "vu\xF4ng": "square",
      vuong: "square",
      square: "square",
      "4:3": "landscape",
      "3:2": "landscape",
      landscape: "landscape",
      "16:9": "widescreen",
      ngang: "widescreen",
      widescreen: "widescreen",
    };
    return map[s] || "widescreen";
  }
  async _resolveRefImages(refIds) {
    if (!Array.isArray(refIds) || refIds.length === 0) return [];
    if (
      typeof refIds[0] === "object" &&
      refIds[0] !== null &&
      refIds[0].base64
    ) {
      return refIds.filter((x) => x?.base64);
    }
    console.warn(
      "[GrokAdapter] _resolveRefImages: b\u1ECF qua",
      refIds.length,
      "tile ID(s) \u2014 ch\u01B0a wire resolution sang base64 (defer G-6).",
    );
    return [];
  }
  async uploadRef(file, thumbnail, options) {
    if (typeof window.ImmediateUploader?.upload === "function") {
      return window.ImmediateUploader.upload(file, thumbnail, options);
    }
    throw new Error("IMMEDIATE_UPLOADER_NOT_LOADED");
  }
  isEnabled() {
    if (!window.featureGate) return true;
    try {
      return !!window.featureGate.canUse(this.featureKey);
    } catch (e) {
      console.warn("[GrokAdapter] isEnabled error:", e?.message || e);
      return false;
    }
  }
}
window.GrokAdapter = GrokAdapter;
