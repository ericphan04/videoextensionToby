const t = (key, params) => window.I18n?.t(key, params) || key;
class TaskModal {
  constructor() {
    this.mode = "create";
    this.task = null;
    this.overlay = null;
    this.uploadedImages = [];
    this._lastMentionSelectTime = 0;
    this.bindGlobalEvents();
  }
  bindGlobalEvents() {
    if (window.eventBus) {
      window.eventBus.on("task:open_modal", (data) => {
        console.log(
          "[TaskModal] Received task:open_modal event, mode:",
          data.mode,
          "task:",
          data.task?.task_id || "null",
        );
        this.open(data.mode, data.task);
      });
      window.eventBus.on("provider:updated", () => {
        this._updateProviderVisibility();
      });
      window.eventBus.on("provider:meta_loaded", () => {
        this._updateProviderVisibility();
      });
    }
  }
  _updateProviderVisibility() {
    if (!this.overlay) return;
    const providerTabs = this.overlay.querySelector("#taskProviderTabs");
    if (!providerTabs) return;
    const PM = window.ProviderMeta;
    if (!PM) return;
    const tabs = providerTabs.querySelectorAll(".provider-tab[data-provider]");
    tabs.forEach((tab) => {
      const slug = tab.dataset.provider;
      if (!slug) return;
      const isActive = PM.isActive(slug);
      const status = PM.getStatus(slug);
      console.log(
        `[TaskModal] Tab ${slug}: status=${status}, isActive=${isActive}`,
      );
      tab.style.display = isActive ? "" : "none";
      const nameSpan = tab.querySelector("span");
      if (nameSpan) {
        const name = PM.getName(slug);
        if (name && nameSpan.textContent !== name) {
          nameSpan.textContent = name;
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
    const providerHidden = this.overlay.querySelector("#taskProvider");
    if (providerHidden) {
      const currentSlug = providerHidden.value;
      if (!PM.isActive(currentSlug)) {
        const visibleTab = Array.from(tabs).find((t2) => {
          const s = t2.dataset.provider;
          return s && PM.isActive(s);
        });
        if (visibleTab) {
          const newSlug = visibleTab.dataset.provider;
          providerHidden.value = newSlug;
          tabs.forEach((t2) => {
            const isTarget = t2.dataset.provider === newSlug;
            t2.classList.toggle("provider-tab--active", isTarget);
            t2.setAttribute("aria-selected", String(isTarget));
          });
          this._renderTaskFormByProvider(newSlug);
          this._ensureProviderTab(newSlug);
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
  async open(mode = "create", task = null) {
    console.log(
      "[TaskModal] open() called, mode:",
      mode,
      "task:",
      task?.task_id || "null",
      mode === "edit"
        ? {
            multi_prompt: task?.multi_prompt,
            ref_image_mode: task?.ref_image_mode,
            ref_image_names: task?.ref_image_names,
            addon_prompt_id: task?.addon_prompt_id,
          }
        : "",
    );
    this.mode = mode;
    this.task = task;
    this._grokFrameData = null;
    this.uploadedImages = [];
    this._missingRefWarned = false;
    this._crossProjectWarned = false;
    this._crossProjectRefIds = [];
    this._taskTileCache = {};
    this._taskRefScanSequence = (this._taskRefScanSequence || 0) + 1;
    this._taskRefVideoHydrations = new Map();
    this._providerRatioSelections = {
      flow: { image: null, video: null },
      chatgpt: { image: null, video: null },
      grok: { image: null, video: null },
      gemini: { image: null, video: null },
      muse: { image: null, video: null },
    };
    if (
      mode === "edit" &&
      task?.ratio &&
      this._providerRatioSelections[task.provider || "flow"]
    ) {
      const ratioMode =
        task.media_type === "Video" || task.grok_mode === "video"
          ? "video"
          : "image";
      this._providerRatioSelections[task.provider || "flow"][ratioMode] =
        task.ratio;
    }
    this._modalUploadKeys = new Set();
    this._selectedAddonPromptId =
      mode === "edit" && task?.addon_prompt_id ? task.addon_prompt_id : null;
    this._addonPrompts = [];
    this._templates = [];
    this._mentionDropdown = null;
    this._mentionNames = [];
    this._mentionIndex = -1;
    this._mentionStart = 0;
    this._multiPromptEnabled = (mode === "edit" && task?.multi_prompt) || false;
    this._refImageNames =
      mode === "edit" && task?.ref_image_names
        ? { ...task.ref_image_names }
        : {};
    this._taskPerPromptFrameData = [];
    this._taskPerPromptFrameUploadKeys = new Map();
    if (
      mode === "edit" &&
      task?.frame_pairs &&
      Array.isArray(task.frame_pairs)
    ) {
      this._taskPerPromptFrameData = task.frame_pairs.map((fp) => ({
        frame1: fp.frame1 || "",
        frame2: fp.frame2 || "",
        frame1Thumb: fp.frame1Thumb || "",
        frame2Thumb: fp.frame2Thumb || "",
      }));
    }
    if (mode === "edit" && !task) {
      console.error("[TaskModal] Edit mode but no task data provided");
      return;
    }
    try {
      this._afSettings = await new Promise((resolve) => {
        try {
          chrome.storage.local.get(["af_settings"], (r) =>
            resolve(r?.af_settings || {}),
          );
        } catch (e) {
          resolve({});
        }
      });
    } catch (e) {
      this._afSettings = {};
    }
    try {
      await window.ModelRegistry.fetch();
      console.log("[TaskModal] Calling render()...");
      this.render();
      console.log("[TaskModal] Calling bindEvents()...");
      this.bindEvents();
      this._formSnapshot = this._captureFormSnapshot();
      console.log(
        "[TaskModal] Modal opened successfully, overlay in DOM:",
        !!document.body.contains(this.overlay),
      );
    } catch (error) {
      console.error("[TaskModal] Failed to open modal:", error, error.stack);
      if (window.ConfigRequiredError?.is?.(error))
        window.ConfigErrorHandler?.handle(error, "TaskModal.open");
      return;
    }
    this._uploadStartedHandler = () => {
      this._renderTaskRefPreview();
      this._renderTaskFrameSourcePanel();
      this._reRenderFrameUploading();
      this._updateButtonState();
    };
    this._uploadCompletedHandler = (data) => {
      console.log(
        "[TaskModal] upload:completed received:",
        data?.key?.substring(0, 15),
        "tile_id:",
        data?.tile_id?.substring(0, 15),
        "tracked:",
        this._modalUploadKeys?.has(data?.key),
      );
      this._handleTaskPerPromptFrameUploadCompleted(data);
      if (!data?.key || !data?.tile_id) {
        this._renderTaskRefPreview();
        this._updateButtonState();
        return;
      }
      if (!this._modalUploadKeys?.has(data.key)) {
        this._renderTaskRefPreview();
        this._updateButtonState();
        return;
      }
      try {
        this._syncUploadKeyToTileId(data);
      } catch (err) {
        console.error("[TaskModal] _syncUploadKeyToTileId error:", err);
        this._renderTaskRefPreview();
      }
      this._updateButtonState();
    };
    this._uploadFailedHandler = (data) => {
      console.log(
        "[TaskModal] upload:failed received:",
        data?.key?.substring(0, 15),
        "tracked:",
        this._modalUploadKeys?.has(data?.key),
      );
      this._renderTaskRefPreview();
      this._reRenderFrameUploading();
      this._handleTaskPerPromptFrameUploadFailed(data);
      this._updateButtonState();
      this._renderTaskFrameSourcePanel();
    };
    window.eventBus?.on("upload:started", this._uploadStartedHandler);
    window.eventBus?.on("upload:completed", this._uploadCompletedHandler);
    window.eventBus?.on("upload:failed", this._uploadFailedHandler);
    if (mode === "edit" && (task?.provider || "flow") === "flow") {
      void this._hydrateTaskVideoRefsOnOpen();
    }
    this._ratiosUpdatedHandler = ({ provider, key }) => {
      if (!this.overlay) return;
      const currentProvider =
        this.overlay.querySelector("#taskProvider")?.value;
      try {
        if (key === "ratios") {
          if (provider === "flow") {
            this._updateRatioOptions();
          } else if (
            (provider === "chatgpt" ||
              provider === "grok" ||
              provider === "gemini" ||
              provider === "muse") &&
            provider === currentProvider
          ) {
            this._renderTaskFormByProvider(currentProvider);
          }
        } else if (
          key === "supported_resolutions" &&
          provider === "grok" &&
          provider === currentProvider
        ) {
          this._renderTaskFormByProvider(currentProvider);
        } else if (key === "download_resolutions" && provider === "flow") {
          this._updateDownloadResolutionOptions();
        }
      } catch (_) {}
    };
    window.eventBus?.on(
      "provider:api_config_updated",
      this._ratiosUpdatedHandler,
    );
    this._modelsUpdatedHandler = () => {
      if (!this.overlay) return;
      const currentProvider =
        this.overlay.querySelector("#taskProvider")?.value || "flow";
      try {
        this._refreshFlowModelOptions();
        this._refreshProviderModelOptions();
        this._renderTaskFormByProvider(currentProvider);
      } catch (error) {
        console.warn("[TaskModal] Model refresh failed:", error);
      }
    };
    window.eventBus?.on("provider:models_updated", this._modelsUpdatedHandler);
    this._apiConfigsLoadedHandler = () => {
      if (!this.overlay) return;
      try {
        const provider =
          this.overlay.querySelector("#taskProvider")?.value || "flow";
        if (provider === "flow") this._updateRatioOptions();
        else this._renderTaskFormByProvider(provider);
        this._updateDownloadResolutionOptions();
      } catch (_) {}
    };
    window.eventBus?.on(
      "provider:api_configs_loaded",
      this._apiConfigsLoadedHandler,
    );
  }
  _captureFormSnapshot() {
    if (!this.overlay) return "";
    const fields = [
      "#taskName",
      "#taskPrompt",
      "#taskModel",
      "#taskRatio",
      "#taskQuantity",
      "#taskFileIds",
      "#taskMediaType",
      "#taskRefImageMode",
      "#taskProvider",
      "#taskRefImagesPerPrompt",
      "#taskVideoModel",
      "#taskVideoInputType",
      "#taskFrame1FileId",
      "#taskFrame2FileId",
      "#taskDownloadResolution",
      "#taskVideoDownloadResolution",
      "#taskGrokModel",
      "#taskGrokVideoInputType",
      "#taskGrokMode",
      "#taskGrokDuration",
      "#taskGrokResolution",
      "#taskGrokImageQuality",
      "#taskChatgptDeleteAfterGen",
      "#taskGeminiDeleteAfterGen",
      "#taskMuseDeleteAfterGen",
    ];
    const multiPrompt = this.overlay.querySelector("#taskMultiPromptCheck")
      ?.checked
      ? "1"
      : "0";
    const enabled = this.overlay.querySelector("#taskEnabled")?.checked
      ? "1"
      : "0";
    const autoDownload = this.overlay.querySelector("#taskAutoDownload")
      ?.checked
      ? "1"
      : "0";
    const refNamesJson = JSON.stringify(this._refImageNames || {});
    const perPromptFramesJson = JSON.stringify(
      this._taskPerPromptFrameData || {},
    );
    return (
      fields
        .map((sel) => {
          const field = this.overlay.querySelector(sel);
          return field?.type === "checkbox"
            ? field.checked
              ? "1"
              : "0"
            : field?.value || "";
        })
        .join("|") +
      "|" +
      multiPrompt +
      "|" +
      enabled +
      "|" +
      autoDownload +
      "|" +
      refNamesJson +
      "|" +
      perPromptFramesJson +
      "|" +
      JSON.stringify(this._grokFrameData || {})
    );
  }
  _isFormDirty() {
    if (!this._formSnapshot) return false;
    const current = this._captureFormSnapshot();
    if (current !== this._formSnapshot) {
      const snapFields = this._formSnapshot.split("|");
      const curFields = current.split("|");
      const labels = [
        "taskName",
        "taskPrompt",
        "taskModel",
        "taskRatio",
        "taskQuantity",
        "taskFileIds",
        "taskMediaType",
        "taskRefImageMode",
        "taskProvider",
        "taskRefImagesPerPrompt",
        "taskVideoModel",
        "taskVideoInputType",
        "taskFrame1FileId",
        "taskFrame2FileId",
        "taskDownloadResolution",
        "taskVideoDownloadResolution",
        "taskGrokMode",
        "taskGrokDuration",
        "taskGrokResolution",
        "taskGrokImageQuality",
        "taskChatgptDeleteAfterGen",
        "taskGeminiDeleteAfterGen",
        "taskMuseDeleteAfterGen",
        "multiPrompt",
        "enabled",
        "autoDownload",
        "refImageNames",
        "perPromptFrames",
      ];
      const diffs = [];
      for (let i = 0; i < labels.length; i++) {
        if (snapFields[i] !== curFields[i]) {
          diffs.push(
            `${labels[i]}: "${(snapFields[i] || "").substring(0, 30)}" \u2192 "${(curFields[i] || "").substring(0, 30)}"`,
          );
        }
      }
      console.log(
        "[TaskModal] _isFormDirty: TRUE \u2014 changed fields:",
        diffs.join(", "),
      );
      return true;
    }
    return false;
  }
  _countActiveUploads() {
    const framePending = this.overlay?.querySelector("#taskGrokFramesGroup")
      ?._grokFrameBusy
      ? 1
      : 0;
    if (!this._modalUploadKeys?.size || !window.ImmediateUploader)
      return framePending;
    let count = framePending;
    for (const key of this._modalUploadKeys) {
      if (ImmediateUploader.isUploading(key)) count++;
    }
    return count;
  }
  _updateButtonState() {
    const isUploading = this._countActiveUploads() > 0;
    const saveBtn = this.overlay?.querySelector("#saveTaskBtn");
    const cancelBtn = this.overlay?.querySelector("#cancelModalBtn");
    if (saveBtn) {
      saveBtn.disabled = isUploading;
      if (!saveBtn.dataset.originalText) {
        saveBtn.dataset.originalText = saveBtn.textContent.trim();
      }
      const I = window.I18n;
      if (isUploading) {
        saveBtn.textContent = I?.t("tasks.uploadingBtn") || "Uploading...";
      } else {
        saveBtn.textContent = saveBtn.dataset.originalText;
      }
    }
    if (cancelBtn) cancelBtn.disabled = isUploading;
  }
  async close() {
    if (this._isSaving) {
      const I = window.I18n;
      window.customDialog?.alert(
        I?.t("tasks.savingInProgress") || "Saving task, please wait...",
        { title: I?.t("tasks.saving") || "Saving", type: "info" },
      );
      return;
    }
    const activeCount = this._countActiveUploads();
    if (activeCount > 0) {
      const confirmed = await window.customDialog?.confirm(
        t("tasks.uploadingWarning", { count: activeCount }),
        {
          title: t("tasks.uploadingTitle"),
          type: "warning",
          confirmText: t("tasks.closeAndCancel"),
          cancelText: t("tasks.continueUpload"),
        },
      );
      if (!confirmed) return;
    } else if (this._isFormDirty()) {
      const confirmed = await window.customDialog?.confirm(
        t("tasks.unsavedMsg"),
        {
          title: t("tasks.unsavedTitle"),
          type: "warning",
          confirmText: t("tasks.discardChanges"),
          cancelText: t("tasks.goBack"),
        },
      );
      if (!confirmed) return;
    }
    this._forceClose();
  }
  _forceClose() {
    try {
      this._mentionMenu?.destroy();
    } catch (_) {}
    this._mentionMenu = null;
    try {
      this._mentionChips?.destroy();
    } catch (_) {}
    this._mentionChips = null;
    try {
      this._taskVoicePicker?.destroy?.();
    } catch (_) {}
    this._taskVoicePicker = null;
    try {
      this._taskCharacterPicker?.destroy?.();
    } catch (_) {}
    this._taskCharacterPicker = null;
    if (this._escHandler) {
      document.removeEventListener("keydown", this._escHandler);
      this._escHandler = null;
    }
    if (this._uploadStartedHandler) {
      window.eventBus?.off("upload:started", this._uploadStartedHandler);
      this._uploadStartedHandler = null;
    }
    if (this._uploadCompletedHandler) {
      window.eventBus?.off("upload:completed", this._uploadCompletedHandler);
      this._uploadCompletedHandler = null;
    }
    if (this._uploadFailedHandler) {
      window.eventBus?.off("upload:failed", this._uploadFailedHandler);
      this._uploadFailedHandler = null;
    }
    if (this._ratiosUpdatedHandler) {
      window.eventBus?.off(
        "provider:api_config_updated",
        this._ratiosUpdatedHandler,
      );
      this._ratiosUpdatedHandler = null;
    }
    if (this._modelsUpdatedHandler) {
      window.eventBus?.off(
        "provider:models_updated",
        this._modelsUpdatedHandler,
      );
      this._modelsUpdatedHandler = null;
    }
    if (this._modalUploadKeys?.size > 0) {
      if (window.ImmediateUploader) {
        ImmediateUploader.cancelAll(this._modalUploadKeys);
      } else {
        for (const key of this._modalUploadKeys) {
          window.pendingUploadFiles?.delete(key);
        }
      }
      this._modalUploadKeys.clear();
    }
    if (this._mentionDropdown) {
      this._mentionDropdown.style.display = "none";
    }
    if (this._featuregateHandler) {
      window.eventBus?.off("featuregate:refreshed", this._featuregateHandler);
      window.eventBus?.off("prompt:completed", this._featuregateHandler);
      window.eventBus?.off(
        "featuregate:quota_warning",
        this._featuregateHandler,
      );
      window.eventBus?.off(
        "featuregate:quota_exhausted",
        this._featuregateHandler,
      );
      this._featuregateHandler = null;
    }
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }
  _refreshFlowModelOptions({ restore = false } = {}) {
    for (const [id, media, settingKey] of [
      ["taskModel", "image", "defaultImageModel"],
      ["taskVideoModel", "video", "defaultVideoModel"],
    ]) {
      const select = this.overlay?.querySelector(`#${id}`);
      if (!select) continue;
      const previous = select.value;
      const editingFlow =
        this.mode === "edit" &&
        this.task &&
        (!this.task.provider || this.task.provider === "flow") &&
        (this.task.media_type === "Video" ? "video" : "image") === media;
      const preferred = restore
        ? editingFlow
          ? this.task.model
          : this._afSettings?.[settingKey]
        : null;
      const requested =
        preferred ||
        select._tobyPendingModelValue ||
        previous ||
        this._afSettings?.[settingKey];
      const models = window.ModelRegistry.safeGetModelsSync(
        "flow",
        media,
      ).filter((model) => model?.value);
      if (!models.length) {
        select._tobyPendingModelValue = requested;
        select.disabled = true;
        continue;
      }
      const previousOrder =
        select._tobyModelValues ||
        [...(select.options || [])].map((option) => option.value);
      const selected = window.ModelRegistry.resolveModelSelection(
        "flow",
        models,
        requested,
        previousOrder,
      );
      select.innerHTML = models
        .map(
          (model) =>
            `<option value="${this.escapeAttr(model.value)}">${this.escapeHtml(model.name || model.label || model.value)}</option>`,
        )
        .join("");
      select.value = selected;
      select.disabled = false;
      select._tobyModelValues = models.map((model) => model.value);
      delete select._tobyPendingModelValue;
      if (select.value !== previous)
        select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
  _refreshProviderModelOptions(providerFilter = null) {
    for (const provider of ["chatgpt", "gemini"]) {
      if (providerFilter && providerFilter !== provider) continue;
      const select = this.overlay?.querySelector(
        provider === "gemini" ? "#taskGeminiModel" : "#taskChatgptModel",
      );
      if (!select || !window.ModelRegistry?.safeGetModelsSync) continue;
      const media =
        provider === "gemini" &&
        this.overlay?.querySelector("#taskMediaType")?.value === "Video"
          ? "video"
          : "image";
      const previous = select.value;
      const requested =
        select._tobyPendingModelValue ||
        previous ||
        (this.mode === "edit" && this.task?.provider === provider
          ? this.task.model
          : null) ||
        this._afSettings?.[
          provider === "gemini" ? "geminiModel" : "chatgptModel"
        ];
      const models = window.ModelRegistry.safeGetModelsSync(
        provider,
        media,
      ).filter((model) => model?.value);
      if (!models.length) {
        select._tobyPendingModelValue = requested;
        select.disabled = true;
        continue;
      }
      const previousOrder =
        select._tobyModelValues ||
        [...select.options].map((option) => option.value);
      const selected = window.ModelRegistry.resolveModelSelection(
        provider,
        models,
        requested,
        previousOrder,
      );
      select.innerHTML = models
        .map(
          (model) =>
            `<option value="${this.escapeAttr(model.value)}">${this.escapeHtml(model.name || model.label || model.value)}</option>`,
        )
        .join("");
      select.value = selected;
      select.disabled = false;
      select._tobyModelValues = models.map((model) => model.value);
      delete select._tobyPendingModelValue;
      if (select.value !== previous)
        select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
  _bindPromptResizer() {
    const textarea = this.overlay?.querySelector("#taskPrompt");
    const handle = this.overlay?.querySelector("#taskPromptResizer");
    if (!textarea || !handle) return;
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
  }
  _refreshMuseModelOptions() {
    const select = this.overlay?.querySelector("#taskMuseModel");
    const mediaType =
      this.overlay?.querySelector("#taskMediaType")?.value === "Video"
        ? "video"
        : "image";
    if (!select || !window.ModelRegistry?.safeGetModelsSync) return;
    const previous = select.value;
    const models =
      window.ModelRegistry.safeGetModelsSync("muse", mediaType) || [];
    select.innerHTML = models
      .map((model) => {
        const value = model?.value || model?.name;
        return value
          ? `<option value="${this.escapeAttr(value)}">${this.escapeHtml(model.name || model.label || value)}</option>`
          : "";
      })
      .join("");
    const values = [...select.options].map((option) => option.value);
    const taskModel = this.task?.provider === "muse" ? this.task?.model : null;
    const defaultModel =
      models.find((model) => model?.is_default)?.value ||
      models[0]?.value ||
      models[0]?.name ||
      "";
    const selected = [previous, taskModel, defaultModel].find(
      (value) => value && values.includes(value),
    );
    select.value = selected || "";
    select.disabled = values.length === 0;
  }
  render() {
    this._forceClose();
    const isEdit = this.mode === "edit" && this.task;
    const _afs = this._afSettings || {};
    const effectiveMediaType = isEdit
      ? this.task.media_type || "Image"
      : _afs.defaultGenType || "Image";
    const _defaultImageModel =
      (isEdit ? this.task.model : _afs.defaultImageModel) ||
      window.ModelRegistry?.safeGetDefault("flow", "image") ||
      null;
    const _defaultVideoModel =
      (isEdit ? this.task.model : _afs.defaultVideoModel) ||
      window.ModelRegistry?.safeGetDefault("flow", "video") ||
      null;
    if (!_defaultImageModel)
      console.debug(
        "[Tier3] TaskModal render: flow.image default model cache miss",
      );
    if (!_defaultVideoModel)
      console.debug(
        "[Tier3] TaskModal render: flow.video default model cache miss",
      );
    const effectiveImageModel = window.ModelRegistry.resolveModelSelection(
      "flow",
      window.ModelRegistry.safeGetModelsSync("flow", "image"),
      isEdit
        ? this.task.model || _defaultImageModel
        : _afs.defaultImageModel || _defaultImageModel,
    );
    const effectiveVideoModel = window.ModelRegistry.resolveModelSelection(
      "flow",
      window.ModelRegistry.safeGetModelsSync("flow", "video"),
      isEdit
        ? this.task.model || _defaultVideoModel
        : _afs.defaultVideoModel || _defaultVideoModel,
    );
    const effectiveChatgptModel =
      isEdit && this.task.provider === "chatgpt" && this.task.model
        ? this.task.model
        : _afs.chatgptModel ||
          window.ModelRegistry?.safeGetDefault?.("chatgpt", "image") ||
          null;
    const geminiMedia = effectiveMediaType === "Video" ? "video" : "image";
    const effectiveGeminiModel = window.ModelRegistry.resolveModelSelection(
      "gemini",
      window.ModelRegistry.safeGetModelsSync("gemini", geminiMedia),
      isEdit && this.task.provider === "gemini" && this.task.model
        ? this.task.model
        : _afs.geminiModel,
    );
    const effectiveMuseModel =
      isEdit && this.task.provider === "muse" && this.task.model
        ? this.task.model
        : window.ModelRegistry?.safeGetDefault?.(
            "muse",
            effectiveMediaType === "Video" ? "video" : "image",
          ) || null;
    const _ratioVnToNumeric = {
      Ngang: "16:9",
      "D\u1ECDc": "9:16",
      "Vu\xF4ng": "1:1",
    };
    const _legacyNumeric =
      _ratioVnToNumeric[_afs.defaultRatio] || _afs.defaultRatio;
    const isVideoMode = effectiveMediaType === "Video";
    const _userDefaultRatioNumeric = isVideoMode
      ? _afs.defaultVideoRatio || _legacyNumeric || "16:9"
      : _afs.defaultImageRatio || _legacyNumeric || "16:9";
    const _validVideoRatiosNumeric = ["16:9", "9:16"];
    const effectiveRatioRaw = isEdit
      ? this.task.ratio || "16:9"
      : isVideoMode &&
          !_validVideoRatiosNumeric.includes(_userDefaultRatioNumeric)
        ? "16:9"
        : _userDefaultRatioNumeric;
    const effectiveRatio =
      _ratioVnToNumeric[effectiveRatioRaw] || effectiveRatioRaw;
    const effectiveQuantity = isEdit ? this.task.quantity || 1 : 1;
    const _vitDefault = window.storageSettings?.get?.("defaultVideoInputType");
    const _vitSafeDefault =
      _vitDefault === "Ingredients" || _vitDefault === "Frames"
        ? _vitDefault
        : "Ingredients";
    const effectiveVideoInputType = isEdit
      ? this.task.video_input_type || _vitSafeDefault
      : _vitSafeDefault;
    let effectiveVideoDurationTier = "default";
    try {
      const models =
        window.ModelRegistry?.safeGetModelsSync?.("flow", "video") || [];
      const modelObj = models.find(
        (m) =>
          m.value === effectiveVideoModel || m.name === effectiveVideoModel,
      );
      if (modelObj?.config?.duration_tier)
        effectiveVideoDurationTier = modelObj.config.duration_tier;
    } catch (_) {}
    const videoDurations =
      window.ProviderConfigManager?.safeGetVideoDurationsSync?.(
        "flow",
        effectiveVideoDurationTier,
      ) || [];
    const effectiveVideoDuration = isEdit
      ? this.task.video_duration || "6s"
      : "6s";
    const initialResolutionCfg =
      window.ModelRegistry?.getGenerationResolutionConfig?.(
        "flow",
        effectiveVideoModel,
      );
    const effectiveVideoResolution = isEdit
      ? this.task.video_resolution || initialResolutionCfg?.default || ""
      : initialResolutionCfg?.default || "";
    let grokDurations = ["6s", "10s"];
    try {
      const g =
        window.ProviderConfigManager?.getSupportedDurationsSync?.("grok");
      if (Array.isArray(g) && g.length) grokDurations = g;
    } catch (_) {}
    const effectiveGrokDuration = isEdit
      ? this.task.grok_duration || grokDurations[0]
      : grokDurations[0];
    let grokResolutions = [];
    try {
      grokResolutions =
        window.ProviderConfigManager?.getSupportedResolutionsSync?.("grok") ||
        [];
    } catch (_) {}
    const savedGrokResolution = isEdit ? this.task.grok_resolution : null;
    const effectiveGrokResolution = grokResolutions.includes(
      savedGrokResolution,
    )
      ? savedGrokResolution
      : grokResolutions.includes("720p")
        ? "720p"
        : grokResolutions[0];
    const _providerAvailable = (provider) => {
      const featureKey =
        provider === "flow" ? "gen_enabled" : `${provider}_enabled`;
      const entitled = window.featureGate?.canUse?.(featureKey) === true;
      const active = window.ProviderMeta?.isActive?.(provider) ?? true;
      return entitled && active;
    };
    let initialProvider = isEdit
      ? this.task?.provider || "flow"
      : this._afSettings?.defaultProvider || "flow";
    if (!isEdit && !_providerAvailable(initialProvider)) {
      initialProvider =
        ["flow", "chatgpt", "grok", "gemini"].find(_providerAvailable) ||
        "flow";
    }
    this.overlay = document.createElement("div");
    this.overlay.className = "task-modal-overlay";
    this.overlay.innerHTML = `
      <div class="task-modal">
        <div class="task-modal-header">
          <h3 class="task-modal-title">${isEdit ? t("tasks.editTitle") : t("tasks.createTitle")}</h3>
          <div class="task-modal-header-right">
            <label class="toolbar-toggle compact" for="taskEnabled" title="${t("tasks.enabledTooltip")}">
              <input type="checkbox" id="taskEnabled" ${!isEdit || this.task.enabled !== false ? "checked" : ""} />
              <span class="toggle-track"><span class="toggle-thumb"></span></span>
            </label>
            <button class="task-modal-close" id="closeModalBtn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
        <div class="task-modal-body">
          ${(() => {
            const _canFlow = !!window.featureGate?.canUse("gen_enabled");
            const _canChatGPT = !!window.featureGate?.canUse("chatgpt_enabled");
            const _canGrok = !!window.featureGate?.canUse("grok_enabled");
            const _allProvidersLocked =
              !isEdit && !_canFlow && !_canChatGPT && !_canGrok;
            if (_allProvidersLocked) {
              const _isLoggedIn = !!window.authManager?.isLoggedIn?.();
              const _showUpgrade =
                window.SystemConfig?.getBool("show_upgrade_ui") !== false;
              const _contactUrl = window.SystemConfig?.get(
                "upgrade_contact_url",
                "",
              );
              let _actionBtn = "";
              if (!_isLoggedIn) {
                _actionBtn = `<button class="module-blocked-btn" id="taskAllLockedLoginBtn">${t("auth.login") || "Login"}</button>`;
              } else if (_showUpgrade) {
                _actionBtn = `<button class="module-blocked-btn module-blocked-btn-upgrade" id="taskAllLockedUpgradeBtn">${t("common.upgrade") || "Upgrade"}</button>`;
              } else if (_contactUrl) {
                _actionBtn = `<button class="module-blocked-btn" id="taskAllLockedContactBtn">${t("overlay.contact") || "Contact Support"}</button>`;
              }
              return `
              <div class="module-blocked-overlay task-all-locked-overlay">
                <div class="module-blocked-content">
                  <div class="module-blocked-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                  </div>
                  <h3 class="module-blocked-title">${_isLoggedIn ? t("tasks.allProvidersLocked") || "All providers are locked" : t("overlay.requiresLogin") || "Login Required"}</h3>
                  <p class="module-blocked-desc">${_isLoggedIn ? t("tasks.allProvidersLockedDesc") || "Your current plan does not include access to any provider. Upgrade to create tasks." : t("tasks.loginToCreateTask") || "Log in to create and manage tasks."}</p>
                  <div class="module-blocked-actions">${_actionBtn}</div>
                </div>
              </div>`;
            }
            return "";
          })()}
          ${
            isEdit
              ? `
          <div class="task-modal-tabs">
            <button class="task-modal-tab active" data-tab="config">${t("tasks.configTab")}</button>
            <button class="task-modal-tab" data-tab="results">${t("tasks.resultsTab")}</button>
          </div>
          `
              : ""
          }
          <div class="task-modal-tab-content${(() => {
            const _canFlow = !!window.featureGate?.canUse("gen_enabled");
            const _canChatGPT = !!window.featureGate?.canUse("chatgpt_enabled");
            const _canGrok = !!window.featureGate?.canUse("grok_enabled");
            return !isEdit && !_canFlow && !_canChatGPT && !_canGrok
              ? " hidden"
              : "";
          })()}" id="taskConfigTab">
          <div class="form-group">
            <label for="taskName">${t("tasks.taskNameLabel")}</label>
            <div class="input-group">
              <input type="text" id="taskName" placeholder="${t("tasks.namePlaceholder")}" value="${isEdit ? this.escapeAttr(this.task.task_name) : ""}" />
            </div>
          </div>

          <div class="form-group">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
              <div style="display:flex;align-items:center;gap:6px;">
                <label for="taskPrompt" style="margin:0;">
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: -2px; margin-right: 4px;">
                    <path d="M15.0573 10.2551C16.0467 9.31818 17.602 9.33956 18.5656 10.3031C19.5478 11.2856 19.5479 12.8779 18.5656 13.8603L15.0028 17.4239C14.2995 18.1271 13.3674 18.5561 12.3758 18.6324L9.92708 18.8204L10.1118 16.4237C10.1911 15.3933 10.6506 14.4286 11.4009 13.7178L15.0573 10.2551ZM12.4987 2.08211C13.6008 2.08211 14.3368 2.07279 14.958 2.26114C16.2896 2.66509 17.3323 3.70786 17.7363 5.03946C17.9247 5.66064 17.9153 6.39669 17.9153 7.49877H16.2487C16.2487 6.27529 16.2399 5.8479 16.1413 5.52286C15.8988 4.72402 15.2735 4.09857 14.4746 3.8562C14.1495 3.7576 13.7222 3.74877 12.4987 3.74877H8.24902C7.302 3.74877 6.64144 3.74911 6.12744 3.79109C5.62318 3.83229 5.3329 3.90959 5.11344 4.0214C4.6433 4.26102 4.26097 4.64339 4.02132 5.11352C3.90951 5.33296 3.83222 5.6233 3.79101 6.12752C3.74904 6.64149 3.7487 7.30215 3.7487 8.2491V12.0821C3.7487 12.8698 3.74951 13.419 3.77881 13.8489C3.80762 14.2712 3.86136 14.518 3.93913 14.7058C4.19285 15.3181 4.67938 15.8046 5.29166 16.0583C5.47948 16.1361 5.72618 16.1898 6.1486 16.2187C6.57846 16.248 7.1276 16.2488 7.91536 16.2488V17.9154C7.15019 17.9154 6.53446 17.9162 6.03466 17.8821C5.52749 17.8475 5.07913 17.7739 4.65446 17.5981C3.63354 17.1752 2.8223 16.3639 2.39941 15.343C2.22358 14.9184 2.15 14.4699 2.1154 13.9628C2.08131 13.463 2.08203 12.8472 2.08203 12.0821V8.2491C2.08203 7.32952 2.08122 6.58922 2.13005 5.99161C2.17967 5.38442 2.28477 4.85095 2.53613 4.3575C2.93561 3.57354 3.57345 2.93566 4.35742 2.53621C4.8509 2.28485 5.3843 2.17973 5.99153 2.13012C6.58917 2.0813 7.32937 2.08211 8.24902 2.08211H12.4987ZM17.3872 11.4815C17.062 11.1563 16.537 11.149 16.2031 11.4652L12.5467 14.928C12.0966 15.3544 11.8212 15.9333 11.7736 16.5515L11.7378 17.0089L12.248 16.9706C12.8428 16.9248 13.4017 16.6673 13.8236 16.2455L17.3872 12.6819C17.7186 12.3504 17.7186 11.8131 17.3872 11.4815ZM13.332 8.33211H10.832V11.9617L10.2542 12.5094C9.98741 12.7621 9.74707 13.0379 9.53482 13.3321H9.16536V8.33211H6.66536V6.66544H13.332V8.33211Z" fill="currentColor"></path>
                  </svg>
                  ${t("tasks.promptLabel")}
                </label>
                <button class="prompt-icon-btn" id="taskPromptSaveBtn" title="${t("tasks.savePromptTitle")}">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path fill-rule="evenodd" clip-rule="evenodd" d="M21 11.0975V16.0909C21 19.1875 21 20.7358 20.2659 21.4123C19.9158 21.735 19.4739 21.9377 19.0031 21.9915C18.016 22.1045 16.8633 21.0849 14.5578 19.0458C13.5388 18.1445 13.0292 17.6938 12.4397 17.5751C12.1494 17.5166 11.8506 17.5166 11.5603 17.5751C10.9708 17.6938 10.4612 18.1445 9.44216 19.0458C7.13673 21.0849 5.98402 22.1045 4.99692 21.9915C4.52615 21.9377 4.08421 21.735 3.73411 21.4123C3 20.7358 3 19.1875 3 16.0909V11.0975C3 6.80891 3 4.6646 4.31802 3.3323C5.63604 2 7.75736 2 12 2C16.2426 2 18.364 2 19.682 3.3323C21 4.6646 21 6.80891 21 11.0975ZM8.25 6C8.25 5.58579 8.58579 5.25 9 5.25H15C15.4142 5.25 15.75 5.58579 15.75 6C15.75 6.41421 15.4142 6.75 15 6.75H9C8.58579 6.75 8.25 6.41421 8.25 6Z" fill="currentColor"/>
                  </svg>
                </button>
              </div>
              <label class="toolbar-toggle" for="taskMultiPromptCheck" style="margin:0;">
                <input type="checkbox" id="taskMultiPromptCheck" ${isEdit && this.task.multi_prompt ? "checked" : ""} />
                <span class="toggle-track"><span class="toggle-thumb"></span></span>
                <span class="toggle-label">${t("tasks.multiPromptLabel")}</span>
              </label>
            </div>
            <div class="prompt-editor-wrapper">
              <textarea id="taskPrompt" placeholder="${t("tasks.promptPlaceholder")}" style="height: 180px;">${isEdit ? this.escapeHtml(this.task.prompt) : ""}</textarea>
              <div id="taskPromptResizer" class="gen-prompt-resizer" tabindex="0" role="separator" aria-orientation="horizontal" aria-label="Resize prompt" aria-valuemin="180" aria-valuemax="600"></div>
              ${this._renderTaskPromptCharCount(isEdit ? this.task.prompt || "" : "")}
              <button class="prompt-search-icon-btn" id="taskPromptSearchBtn" title="${t("tasks.searchPromptTitle")}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              </button>
              <div class="multi-prompt-hint hidden" id="taskMultiPromptHint">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <span>${t("tasks.multiPromptHint")}</span>
              </div>
            </div>
            <div class="prompt-count-row">
              <div class="section-header" style="margin:0;"><label style="margin:0;font-size:11px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;">
                  <line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line>
                  <line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line>
                  <line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line>
                  <line x1="17" y1="16" x2="23" y2="16"></line>
                </svg>
                ${t("tasks.settingsLabel")}
              </label></div>
              <div class="prompt-count" style="margin-left:auto;">
                <span id="taskPromptCount">0</span>
              </div>
            </div>
          </div>

          <!-- Provider selector \u2014 row ri\xEAng (t\xE1ch kh\u1ECFi gen-compact-bar) \u0111\u1EC3 pills hi\u1EC3n th\u1ECB r\xF5 r\xE0ng -->
          <div class="task-provider-row">
            ${(() => {
              const canUseFlow = !!window.featureGate?.canUse("gen_enabled");
              const canUseChatGPT =
                !!window.featureGate?.canUse("chatgpt_enabled");
              const canUseGrok = !!window.featureGate?.canUse("grok_enabled");
              const canUseGemini =
                !!window.featureGate?.canUse("gemini_enabled");
              const canUseMuse = !!window.featureGate?.canUse("muse_enabled");
              const PM = window.ProviderMeta;
              const flowActive = PM?.isActive?.("flow") ?? true;
              const chatgptActive = PM?.isActive?.("chatgpt") ?? true;
              const grokActive = PM?.isActive?.("grok") ?? true;
              const geminiActive = PM?.isActive?.("gemini") ?? true;
              const museActive = PM?.isActive?.("muse") ?? true;
              const currentProvider = initialProvider;
              const flowTooltipText =
                t("tasks.flowProviderLockedHint") ||
                "Google Flow requires a suitable plan.";
              const tooltipText =
                t("tasks.providerLockedHint") || "ChatGPT requires a Pro plan.";
              const grokTooltipText =
                t("tasks.grokProviderLockedHint") ||
                "Grok requires a Pro plan.";
              const geminiTooltipText =
                t("tasks.geminiProviderLockedHint") ||
                "Gemini requires a suitable plan.";
              const museTooltipText = "Muse requires a suitable plan.";
              const flowIcon = `<svg class="provider-tab-icon" width="14" height="14" viewBox="0 0 24 24"><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="#3186FF"/><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#ttab-flow-0)"/><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#ttab-flow-1)"/><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#ttab-flow-2)"/><defs><linearGradient gradientUnits="userSpaceOnUse" id="ttab-flow-0" x1="7" x2="11" y1="15.5" y2="12"><stop stop-color="#08B962"/><stop offset="1" stop-color="#08B962" stop-opacity="0"/></linearGradient><linearGradient gradientUnits="userSpaceOnUse" id="ttab-flow-1" x1="8" x2="11.5" y1="5.5" y2="11"><stop stop-color="#F94543"/><stop offset="1" stop-color="#F94543" stop-opacity="0"/></linearGradient><linearGradient gradientUnits="userSpaceOnUse" id="ttab-flow-2" x1="3.5" x2="17.5" y1="13.5" y2="12"><stop stop-color="#FABC12"/><stop offset=".46" stop-color="#FABC12" stop-opacity="0"/></linearGradient></defs></svg>`;
              const chatgptIcon = `<svg class="provider-tab-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg>`;
              const grokIcon = `<svg class="provider-tab-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd"><path d="M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815"/></svg>`;
              const flowCrownIcon = !canUseFlow
                ? `<span class="provider-tab-lock"><svg width="12" height="12" viewBox="0 0 24 24" fill="#eab308" style="margin-left:4px;vertical-align:-1px;"><path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z"/></svg></span>`
                : "";
              const crownIcon = !canUseChatGPT
                ? `<span class="provider-tab-lock"><svg width="12" height="12" viewBox="0 0 24 24" fill="#eab308" style="margin-left:4px;vertical-align:-1px;"><path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z"/></svg></span>`
                : "";
              const grokCrownIcon = !canUseGrok
                ? `<span class="provider-tab-lock"><svg width="12" height="12" viewBox="0 0 24 24" fill="#eab308" style="margin-left:4px;vertical-align:-1px;"><path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z"/></svg></span>`
                : "";
              const flowName =
                PM?.getName?.("flow") || t("gen.providerFlow") || "Google Flow";
              const chatgptName =
                PM?.getName?.("chatgpt") ||
                t("gen.providerChatGPT") ||
                "ChatGPT";
              const grokName =
                PM?.getName?.("grok") || t("gen.providerGrok") || "Grok";
              const geminiName =
                PM?.getName?.("gemini") || t("gen.providerGemini") || "Gemini";
              const museName = PM?.getName?.("muse") || "Muse";
              return `
            <div class="provider-tabs" id="taskProviderTabs" role="tablist">
              <button type="button" class="provider-tab ${currentProvider === "flow" ? "provider-tab--active" : ""}${!canUseFlow ? " provider-tab-locked" : ""}" data-provider="flow" role="tab" aria-selected="${currentProvider === "flow" ? "true" : "false"}" ${!canUseFlow ? `aria-disabled="true" data-tooltip="${flowTooltipText}" title="${flowTooltipText}"` : ""} ${!flowActive ? 'style="display:none"' : ""}>
                ${flowIcon}<span>${flowName}</span>${flowCrownIcon}
              </button>
              <button type="button" class="provider-tab ${currentProvider === "chatgpt" ? "provider-tab--active" : ""}${!canUseChatGPT ? " provider-tab-locked" : ""}" data-provider="chatgpt" role="tab" aria-selected="${currentProvider === "chatgpt" ? "true" : "false"}" ${!canUseChatGPT ? `aria-disabled="true" data-tooltip="${tooltipText}" title="${tooltipText}"` : ""} ${!chatgptActive ? 'style="display:none"' : ""}>
                ${chatgptIcon}<span>${chatgptName}</span>${crownIcon}
              </button>
              <button type="button" class="provider-tab ${currentProvider === "grok" ? "provider-tab--active" : ""}${!canUseGrok ? " provider-tab-locked" : ""}" data-provider="grok" role="tab" aria-selected="${currentProvider === "grok" ? "true" : "false"}" ${!canUseGrok ? `aria-disabled="true" data-tooltip="${grokTooltipText}" title="${grokTooltipText}"` : ""} ${!grokActive ? 'style="display:none"' : ""}>
                ${grokIcon}<span>${grokName}</span>${grokCrownIcon}
              </button>
              <button type="button" class="provider-tab ${currentProvider === "muse" ? "provider-tab--active" : ""}${!canUseMuse ? " provider-tab-locked" : ""}" data-provider="muse" role="tab" aria-selected="${currentProvider === "muse" ? "true" : "false"}" ${!canUseMuse ? `aria-disabled="true" data-tooltip="${museTooltipText}" title="${museTooltipText}"` : ""} ${!museActive ? 'style="display:none"' : ""}>
                <img class="provider-tab-icon provider-tab-icon--muse" src="icons/muse.svg" width="14" height="14" alt="" /><span>${museName}</span>
              </button>
              <button type="button" class="provider-tab ${currentProvider === "gemini" ? "provider-tab--active" : ""}${!canUseGemini ? " provider-tab-locked" : ""}" data-provider="gemini" role="tab" aria-selected="${currentProvider === "gemini" ? "true" : "false"}" ${!canUseGemini ? `aria-disabled="true" data-tooltip="${geminiTooltipText}" title="${geminiTooltipText}"` : ""} ${!geminiActive ? 'style="display:none"' : ""}>
                <svg class="provider-tab-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1.2 5.7 4.3 8.8 10 10-5.7 1.2-8.8 4.3-10 10-1.2-5.7-4.3-8.8-10-10 5.7-1.2 8.8-4.3 10-10Z"/></svg><span>${geminiName}</span>
              </button>
              <input type="hidden" id="taskProvider" value="${currentProvider}" />
            </div>
              `;
            })()}
          </div>

          ${(() => {
            const isGrokEdit = isEdit && this.task.provider === "grok";
            const tmt = isGrokEdit
              ? this.task.grok_mode === "video"
                ? "Video"
                : "Image"
              : isEdit
                ? this.task.media_type === "Video"
                  ? "Video"
                  : "Image"
                : effectiveMediaType === "Video"
                  ? "Video"
                  : "Image";
            return `
          <div class="gen-compact-bar" id="taskGenCompactBar" data-gen-mode="${tmt === "Video" ? "video" : "image"}">
            <div class="gen-compact-item" id="taskMediaTypeGroup">
              <div class="task-media-toggle" id="taskMediaTypeToggle" role="tablist" aria-label="${t("tasks.modeLabel") || "Mode"}">
                <button type="button" class="task-media-btn${tmt === "Image" ? " active" : ""}" data-mode="Image" data-tooltip="${t("tasks.imageType")}" aria-label="${t("tasks.imageType")}" role="tab">
                  <svg width="14" height="14" viewBox="0 0 13 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.25 1.5H3.9C3.05992 1.5 2.63988 1.5 2.31901 1.66349C2.03677 1.8073 1.8073 2.03677 1.66349 2.31901C1.5 2.63988 1.5 3.05992 1.5 3.9V8.1C1.5 8.94008 1.5 9.36012 1.66349 9.68099C1.8073 9.96323 2.03677 10.1927 2.31901 10.3365C2.63988 10.5 3.05992 10.5 3.9 10.5H8.5C8.96499 10.5 9.19748 10.5 9.38823 10.4489C9.90587 10.3102 10.3102 9.90587 10.4489 9.38823C10.5 9.19748 10.5 8.96499 10.5 8.5M5.25 4.25C5.25 4.80228 4.80228 5.25 4.25 5.25C3.69772 5.25 3.25 4.80228 3.25 4.25C3.25 3.69772 3.69772 3.25 4.25 3.25C4.80228 3.25 5.25 3.69772 5.25 4.25ZM7.49502 5.95907L3.26557 9.80402C3.02768 10.0203 2.90873 10.1284 2.89821 10.2221C2.88909 10.3033 2.92023 10.3838 2.98159 10.4378C3.05239 10.5 3.21314 10.5 3.53464 10.5H8.22799C8.94757 10.5 9.30736 10.5 9.58996 10.3791C9.94472 10.2274 10.2274 9.94472 10.3791 9.58996C10.5 9.30736 10.5 8.94757 10.5 8.22799C10.5 7.98587 10.5 7.86482 10.4735 7.75208C10.4403 7.61039 10.3765 7.47768 10.2866 7.3632C10.2151 7.2721 10.1206 7.19647 9.93154 7.04523L8.53291 5.92633C8.34369 5.77495 8.24908 5.69927 8.1449 5.67256C8.05307 5.64901 7.95643 5.65206 7.86627 5.68135C7.76397 5.71457 7.67432 5.79607 7.49502 5.95907Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path><g fill="currentColor"><path d="M9.25 0.55C9.34 0.55 9.42 0.61 9.45 0.70L9.78 1.72C9.88 2.04 10.13 2.29 10.45 2.39L11.47 2.72C11.56 2.75 11.62 2.83 11.62 2.92C11.62 3.01 11.56 3.09 11.47 3.12L10.45 3.45C10.13 3.55 9.88 3.80 9.78 4.12L9.45 5.14C9.42 5.23 9.34 5.29 9.25 5.29C9.16 5.29 9.08 5.23 9.05 5.14L8.72 4.12C8.62 3.80 8.37 3.55 8.05 3.45L7.03 3.12C6.94 3.09 6.88 3.01 6.88 2.92C6.88 2.83 6.94 2.75 7.03 2.72L8.05 2.39C8.37 2.29 8.62 2.04 8.72 1.72L9.05 0.70C9.08 0.61 9.16 0.55 9.25 0.55Z"></path><path d="M11.35 4.55C11.42 4.55 11.48 4.60 11.50 4.67L11.62 5.03C11.66 5.16 11.76 5.26 11.89 5.30L12.25 5.42C12.32 5.44 12.37 5.50 12.37 5.57C12.37 5.64 12.32 5.70 12.25 5.72L11.89 5.84C11.76 5.88 11.66 5.98 11.62 6.11L11.50 6.47C11.48 6.54 11.42 6.59 11.35 6.59C11.28 6.59 11.22 6.54 11.20 6.47L11.08 6.11C11.04 5.98 10.94 5.88 10.81 5.84L10.45 5.72C10.38 5.70 10.33 5.64 10.33 5.57C10.33 5.50 10.38 5.44 10.45 5.42L10.81 5.30C10.94 5.26 11.04 5.16 11.08 5.03L11.20 4.67C11.22 4.60 11.28 4.55 11.35 4.55Z"></path></g></svg>
                </button>
                <button type="button" class="task-media-btn${tmt === "Video" ? " active" : ""}" data-mode="Video" data-tooltip="${t("tasks.videoType")}" aria-label="${t("tasks.videoType")}" role="tab">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2" ry="2"/></svg>
                </button>
                <input type="hidden" id="taskMediaType" value="${tmt}" />
              </div>
            </div>
            <div class="gen-compact-item" id="taskImageModelGroup">`;
          })()}
              <div class="input-group select-group compact-select">
                <select id="taskModel">
                  ${(window.ModelRegistry?.safeGetModelsSync("flow", "image") || []).map((m) => `<option value="${this.escapeAttr(m.value)}" ${effectiveImageModel === m.value ? "selected" : ""}>${this.escapeHtml(m.name)}</option>`).join("")}
                </select>
                <svg class="select-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </div>
            </div>
            <div class="gen-compact-item hidden" id="taskVideoModelGroup">
              <div class="input-group select-group compact-select">
                <select id="taskVideoModel">
                  ${(window.ModelRegistry?.safeGetModelsSync("flow", "video") || []).map((m) => `<option value="${this.escapeAttr(m.value)}" ${effectiveVideoModel === m.value ? "selected" : ""}>${this.escapeHtml(m.name.replace(/^Veo 3\.1 - /, "Veo 3.1 "))}</option>`).join("")}
                </select>
                <svg class="select-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </div>
            </div>
            <!-- Voice + Character moved xu\u1ED1ng sau qty (line ri\xEAng) \u2014 xem #taskQuantityGroup. -->
            <!-- ChatGPT model (Instant/Thinking \u2014 GPT-5.5) \u2014 ch\u1EC9 hi\u1EC7n khi provider='chatgpt' -->
            <div class="gen-compact-item hidden" id="taskChatgptModelGroup">
              <div class="input-group select-group compact-select">
                <select id="taskChatgptModel">
                  ${(window.ModelRegistry?.safeGetModelsSync("chatgpt", "image") || []).map((m) => `<option value="${this.escapeAttr(m.value || m.name)}" ${effectiveChatgptModel === (m.value || m.name) ? "selected" : ""}>${this.escapeHtml(m.name || m.value)}</option>`).join("")}
                </select>
                <svg class="select-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </div>
            </div>
            <div class="gen-compact-item hidden" id="taskGeminiModelGroup">
              <div class="input-group select-group compact-select">
                <select id="taskGeminiModel">
                  ${(window.ModelRegistry?.safeGetModelsSync("gemini", geminiMedia) || []).map((m) => `<option value="${this.escapeAttr(m.value)}" ${effectiveGeminiModel === m.value ? "selected" : ""}>${this.escapeHtml(m.name)}</option>`).join("")}
                </select>
                <svg class="select-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </div>
            </div>
            <div class="gen-compact-item hidden" id="taskGrokModelGroup"><div class="input-group select-group compact-select"><select id="taskGrokModel" aria-label="Model"></select>
                  <svg class="select-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg></div></div>
            <div class="gen-compact-item hidden" id="taskGrokVideoInputTypeGroup"><div class="input-group select-group compact-select"><select id="taskGrokVideoInputType" aria-label="Video input type"></select>
                  <svg class="select-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg></div></div>
            <div class="gen-compact-item hidden" id="taskMuseModelGroup">
              <div class="input-group select-group compact-select">
                <select id="taskMuseModel">
                  ${(window.ModelRegistry?.safeGetModelsSync("muse", effectiveMediaType === "Video" ? "video" : "image") || []).map((m) => `<option value="${this.escapeAttr(m.value || m.name)}" ${effectiveMuseModel === (m.value || m.name) ? "selected" : ""}>${this.escapeHtml(m.name || m.label || m.value)}</option>`).join("")}
                </select>
                <svg class="select-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </div>
            </div>
            <!-- Wrap break \u2014 active khi data-gen-mode="video": t\u1EA5t c\u1EA3 setting SAU Model xu\u1ED1ng d\xF2ng. -->
            <div class="gen-compact-break gen-compact-break--video" aria-hidden="true"></div>
            <div class="gen-compact-item hidden" id="taskVideoInputTypeRow">
              <div class="input-group select-group compact-select">
                <select id="taskVideoInputType">
                  <option value="Ingredients" ${effectiveVideoInputType === "Ingredients" ? "selected" : ""}>Ingredients</option>
                  <option value="Frames" ${effectiveVideoInputType === "Frames" ? "selected" : ""}>Frames</option>
                </select>
                <svg class="select-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </div>
            </div>
            <div class="gen-compact-item hidden" id="taskVideoDurationGroup">
              <div class="input-group select-group compact-select">
                <select id="taskVideoDuration" title="${window.I18n?.t("tasks.videoDuration") || "Video duration"}">
                  ${videoDurations.map((d) => `<option value="${this.escapeAttr(d)}" ${effectiveVideoDuration === d ? "selected" : ""}>${this.escapeHtml(d)}</option>`).join("")}
                </select>
                <svg class="select-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </div>
            </div>
            <div class="gen-compact-item ${effectiveMediaType === "Video" && initialResolutionCfg ? "" : "hidden"}" id="taskVideoResolutionGroup">
              <div class="input-group select-group compact-select">
                <select id="taskVideoResolution" title="Generation resolution">
                  ${(initialResolutionCfg?.options || []).map((o) => `<option value="${this.escapeAttr(o.value)}" ${effectiveVideoResolution === o.value ? "selected" : ""}>${this.escapeHtml(o.label)}</option>`).join("")}
                </select>
                <svg class="select-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </div>
            </div>
            <div class="gen-compact-item" id="taskRatioGroup">
              <div class="input-group select-group compact-select">
                <select id="taskRatio">
                  <option value="16:9" ${effectiveRatio === "16:9" ? "selected" : ""}>\u25AC 16:9</option>
                  <option value="4:3" ${effectiveRatio === "4:3" ? "selected" : ""}>\u25AD 4:3</option>
                  <option value="1:1" ${effectiveRatio === "1:1" ? "selected" : ""}>\u25A1 1:1</option>
                  <option value="3:4" ${effectiveRatio === "3:4" ? "selected" : ""}>\u25AF 3:4</option>
                  <option value="9:16" ${effectiveRatio === "9:16" ? "selected" : ""}>\u25AE 9:16</option>
                </select>
                <svg class="select-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </div>
            </div>
            <!-- Gemini: \u0111\u1EB7t ngay sau Ratio \u0111\u1EC3 n\u1EB1m chung h\xE0ng compact; icon \u0111\u1ED3ng b\u1ED9 ChatGPT. -->
            <div class="gen-compact-item hidden" id="taskGeminiDeleteAfterGenGroup">
              <label class="gen-compact-toggle" title="${window.I18n?.t("settings.geminiDeleteAfterGen") || "Delete Gemini conversation after generation"}">
                <input type="checkbox" id="taskGeminiDeleteAfterGen" ${isEdit && this.task.gemini_delete_after_gen ? "checked" : ""} />
                <span class="gen-compact-toggle-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </span>
                <span class="gen-compact-toggle-label">${window.I18n?.t("gen.deleteAfterGen") || "Delete after gen"}</span>
              </label>
            </div>
            <div class="gen-compact-item hidden" id="taskMuseDeleteAfterGenGroup">
              <label class="gen-compact-toggle">
                <input type="checkbox" id="taskMuseDeleteAfterGen" ${isEdit && this.task.muse_delete_after_gen ? "checked" : ""} />
                <span class="gen-compact-toggle-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </span>
                <span class="gen-compact-toggle-label">${window.I18n?.t("gen.deleteAfterGen") || "Delete after gen"}</span>
              </label>
            </div>
            <div class="gen-compact-item" id="taskQuantityGroup">
              <div class="input-group compact-qty">
                <button class="compact-qty-btn" id="taskQtyMinus" type="button">-</button>
                <input type="number" id="taskQuantity" min="${window.ProviderConfigManager?.safeGetQuantityRangeSync?.("flow")?.min ?? 1}" max="${window.ProviderConfigManager?.safeGetQuantityRangeSync?.("flow")?.max ?? 4}" value="${effectiveQuantity}" />
                <button class="compact-qty-btn" id="taskQtyPlus" type="button">+</button>
              </div>
            </div>
            <!-- Break LU\xD4N active \u2192 Character/Voice xu\u1ED1ng 1 line ri\xEAng (\u0111\u1ED3ng b\u1ED9 GenTab) -->
            <div class="gen-compact-break gen-compact-break--always" aria-hidden="true"></div>
            <!-- Flow Character Selector \u2014 line ri\xEAng (provider=flow, c\u1EA3 image+video) -->
            <div class="gen-compact-item hidden" id="taskCharacterPickerGroup">
              <button type="button" class="voice-picker-trigger" id="taskCharacterTrigger" data-i18n-title="character.pickerTitle" title="Select character">
                <span class="voice-picker-trigger-thumb-svg" id="taskCharacterTriggerThumb">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="8" r="4"></circle>
                    <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"></path>
                  </svg>
                </span>
                <span class="voice-picker-label" id="taskCharacterLabel" data-i18n="character.none">Character</span>
                <svg class="voice-picker-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </button>
              <input type="hidden" id="taskCharacterSlug" value="${this.escapeAttr(window.CharacterRegistry.selectionValue(this.task))}" />
              <input type="hidden" id="taskCharacterSearchValue" value="${this.escapeAttr(this.task?.character_search_value || "")}" />
            </div>
            <!-- Flow Voice Selector \u2014 line ri\xEAng (provider=flow + Video + supports_voice) -->
            <div class="gen-compact-item hidden" id="taskVoicePickerGroup">
              <button type="button" class="voice-picker-trigger" id="taskVoiceTrigger" data-i18n-title="voice.pickerTitle" title="Choose voice">
                <span class="voice-picker-trigger-thumb-svg" id="taskVoiceTriggerThumb">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 5L1.5 7M3.75 5.5V6.5M6 3V9M8.25 1.5V10.5M10.5 5V7"></path></svg>
                </span>
                <span class="voice-picker-label" id="taskVoiceLabel" data-i18n="voice.random">Random voice</span>
                <svg class="voice-picker-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </button>
              <input type="hidden" id="taskVoiceSlug" value="${this.escapeAttr(this.task?.voice_slug || "")}" />
              <input type="hidden" id="taskVoiceSearchValue" value="${this.escapeAttr(this.task?.voice_search_value || "")}" />
            </div>
            <!-- G-5.3: Grok mode select (image/video) \u2014 ch\u1EC9 hi\u1EC3n th\u1ECB khi provider='grok' -->
            <div class="gen-compact-item hidden" id="taskGrokModeGroup">
              <div class="input-group select-group compact-select">
                <select id="taskGrokMode" title="Grok mode">
                  <option value="image" ${isEdit && this.task.grok_mode === "image" ? "selected" : !isEdit ? "selected" : ""}>Image</option>
                  <option value="video" ${isEdit && this.task.grok_mode === "video" ? "selected" : ""}>Video</option>
                </select>
                <svg class="select-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </div>
            </div>
            <!-- ChatGPT: toggle x\xF3a tin nh\u1EAFn sau khi gen th\xE0nh c\xF4ng \u2014 ch\u1EC9 hi\u1EC3n th\u1ECB khi provider='chatgpt' -->
            <div class="gen-compact-item hidden" id="taskChatgptDeleteAfterGenGroup">
              <label class="gen-compact-toggle" title="${window.I18n?.t("settings.chatgptDeleteAfterGen") || "Delete message after successful generation"}">
                <input type="checkbox" id="taskChatgptDeleteAfterGen" ${isEdit && this.task.chatgpt_delete_after_gen ? "checked" : ""} />
                <span class="gen-compact-toggle-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </span>
                <span class="gen-compact-toggle-label">${window.I18n?.t("gen.deleteAfterGen") || "Delete after gen"}</span>
              </label>
            </div>
            <!-- G-5.3: Grok video duration \u2014 ch\u1EC9 hi\u1EC3n th\u1ECB khi provider='grok' && mode='video' -->
            <div class="gen-compact-item hidden" id="taskGrokDurationGroup">
              <div class="input-group select-group compact-select">
                <select id="taskGrokDuration" title="Video duration">
                  ${grokDurations.map((d) => `<option value="${d}" ${effectiveGrokDuration === d ? "selected" : ""}>${d}</option>`).join("")}
                </select>
                <svg class="select-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </div>
            </div>
            <!-- G-5.3: Grok video resolution \u2014 ch\u1EC9 hi\u1EC3n th\u1ECB khi provider='grok' && mode='video' -->
            <div class="gen-compact-item hidden" id="taskGrokResolutionGroup">
              <div class="input-group select-group compact-select">
                <select id="taskGrokResolution" title="Video resolution">
                  ${grokResolutions.map((value) => `<option value="${value}" ${effectiveGrokResolution === value ? "selected" : ""}>${value}</option>`).join("")}
                </select>
                <svg class="select-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </div>
            </div>
            <!-- Grok image quality (Grok update 2026-04) \u2014 ch\u1EC9 hi\u1EC3n th\u1ECB khi provider='grok' && mode='image' -->
            <div class="gen-compact-item hidden" id="taskGrokImageQualityGroup">
              <div class="input-group select-group compact-select">
                <select id="taskGrokImageQuality" data-i18n-title="grok.imageQualityHint" title="${this.escapeAttr(t("grok.imageQualityHint"))}">
                  <option value="speed" ${isEdit && this.task.grok_image_quality === "speed" ? "selected" : !isEdit ? "selected" : ""} data-i18n="grok.imageQualitySpeed">${this.escapeHtml(t("grok.imageQualitySpeed"))}</option>
                  <option value="quality" ${isEdit && this.task.grok_image_quality === "quality" ? "selected" : ""} data-i18n="grok.imageQualityQuality">${this.escapeHtml(t("grok.imageQualityQuality"))}</option>
                </select>
                <svg class="select-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </div>
            </div>
            <!-- Fix 3: \u0110\xE3 b\u1ECF addon_prompt UI kh\u1ECFi TaskModal.
                 L\xFD do: User y\xEAu c\u1EA7u \u0111\u01A1n gi\u1EA3n ho\xE1 form Task \u2014 phong c\xE1ch (addon prompt) ch\u1EC9
                 d\xF9ng \u1EDF GenTab. KH\xD4NG x\xF3a backend endpoint /api/v1/addon-prompts v\xEC GenTab
                 v\u1EABn d\xF9ng. Field addon_prompt_id/text trong taskData v\u1EABn \u0111\u01B0\u1EE3c preserve n\u1EBFu
                 task c\u0169 \u0111\xE3 c\xF3 (xem save()) \u0111\u1EC3 backward-compat. -->
          </div>

          <div class="form-group" id="taskRefImagesGroup">
            <!-- Section header \u2014 \u0111\u1ED3ng b\u1ED9 gen_tab: label + ref_mode select -->
            <div class="section-header section-header--with-select" style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px;">
              <label style="margin:0;font-size:11px;display:flex;align-items:center;">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style="vertical-align: -4px; margin-right: 4px;"><path d="M8.958 8.501a1.5 1.5 0 1 1 0 2.999 1.5 1.5 0 0 1 0-2.999"></path><path fill-rule="evenodd" d="M6.974 3.95a3.065 3.065 0 0 1 3.461-2.608l5.975.84a3.065 3.065 0 0 1 2.608 3.462l-.84 5.975a3.064 3.064 0 0 1-3.46 2.607l-.938-.132.03.206a3.065 3.065 0 0 1-2.608 3.462l-5.975.839a3.065 3.065 0 0 1-3.461-2.607l-.84-5.975a3.065 3.065 0 0 1 2.608-3.462l3.134-.441zm-.517 9.528a1.337 1.337 0 0 0-1.871.263l-1.513 2.007.009.06a1.736 1.736 0 0 0 1.96 1.477l5.45-.767zm3.237-6.443-5.974.838a1.736 1.736 0 0 0-1.477 1.96l.568 4.051.713-.944a2.666 2.666 0 0 1 3.733-.524l4.72 3.557a1.73 1.73 0 0 0 .516-1.487l-.84-5.975a1.735 1.735 0 0 0-1.959-1.476m.557-4.375a1.735 1.735 0 0 0-1.96 1.476l-.252 1.787 1.47-.206a3.066 3.066 0 0 1 3.462 2.61l.617 4.397 1.314.186a1.735 1.735 0 0 0 1.96-1.477l.84-5.975a1.736 1.736 0 0 0-1.478-1.96z" clip-rule="evenodd"></path></svg>
                ${t("tasks.refImages")}
              </label>
              <div id="taskRefImagesPerPromptControl" class="input-group compact-qty ref-per-prompt-control hidden">
                <button id="taskRefImagesPerPromptMinus" class="compact-qty-btn" type="button" title="${this.escapeAttr(t("gen.refsPerPrompt"))}">-</button>
                <input id="taskRefImagesPerPrompt" type="number" min="1" step="1" value="${window.RefImageAssignment.count(isEdit ? this.task.ref_images_per_prompt : 1)}" title="${this.escapeAttr(t("gen.refsPerPrompt"))}" aria-label="${this.escapeAttr(t("gen.refsPerPrompt"))}" />
                <button id="taskRefImagesPerPromptPlus" class="compact-qty-btn" type="button" title="${this.escapeAttr(t("gen.refsPerPrompt"))}">+</button>
              </div>
              <div class="input-group select-group compact-select ref-mode-select" title="${t("tasks.refModeTitle")}">
                <svg class="ref-mode-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
                <select id="taskRefImageMode" title="${t("tasks.refModeTitle")}">
                  <option value="all"${isEdit && this.task.ref_image_mode === "all" ? " selected" : ""}>${t("tasks.refModeAll")}</option>
                  <option value="mention"${isEdit && this.task.ref_image_mode === "mention" ? " selected" : ""}>${t("tasks.refModeMention")}</option>
                  <option value="sequential"${isEdit && this.task.ref_image_mode === "sequential" ? " selected" : ""}>${t("tasks.refModeSequential")}</option>
                  <option value="none"${isEdit && this.task.ref_image_mode === "none" ? " selected" : ""}>${t("tasks.refModeNone")}</option>
                </select>
                <svg class="select-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </div>
            </div>

            <!-- Ref toolbar Actions \u2014 full-width upload + screen capture (\u0111\u1ED3ng b\u1ED9 gen_tab) -->
            <div class="ref-toolbar" id="taskRefToolbarActions">
              <div class="ref-toolbar-actions ref-toolbar-actions--full">
                <button type="button" class="ref-btn-upload ref-btn-upload--wide" id="taskOpenImagePickerBtn">
                  <svg class="ref-btn-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M15 8h.01"></path>
                    <path d="M12.5 21h-6.5a3 3 0 0 1 -3 -3v-12a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v6.5"></path>
                    <path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l3.5 3.5"></path>
                    <path d="M14 14l1 -1c.679 -.653 1.473 -.829 2.214 -.526"></path>
                    <path d="M19 22v-6"></path>
                    <path d="M22 19l-3 -3l-3 3"></path>
                  </svg>
                  <span class="ref-btn-text">${t("gen.selectUploadImage")}</span>
                </button>
                <button type="button" class="ref-btn-capture ref-tooltip-right" id="taskScreenCaptureBtn" title="${t("tasks.screenCapture")}">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="4" stroke="#fff" fill="#fff" stroke-width="1.5"></circle>
                    <path d="M22 12C22 16.714 22 19.0711 20.5355 20.5355C19.0711 22 16.714 22 12 22C7.28595 22 4.92893 22 3.46447 20.5355C2 19.0711 2 16.714 2 12C2 7.28595 2 4.92893 3.46447 3.46447C4.92893 2 7.28595 2 12 2C16.714 2 19.0711 2 20.5355 3.46447C21.5093 4.43821 21.8356 5.80655 21.9449 8" stroke="#fff" stroke-width="1.5" stroke-linecap="round"></path>
                  </svg>
                </button>
              </div>
            </div>

            <div id="taskRefImagesPreview" class="ref-grid"></div>
            <div class="ref-drag-hint hidden" id="taskRefDragHint">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="5 9 2 12 5 15"></polyline>
                <polyline points="9 5 12 2 15 5"></polyline>
                <polyline points="15 19 12 22 9 19"></polyline>
                <polyline points="19 9 22 12 19 15"></polyline>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <line x1="12" y1="2" x2="12" y2="22"></line>
              </svg>
              <span>${t("tasks.dragToReorder")}</span>
            </div>
            <input type="hidden" id="taskFileIds" value="${isEdit ? this.escapeAttr(this.task.ref_file_ids) : ""}" />
          </div>

          <div class="ref-mention-bar hidden" id="taskMentionHelper">
            <span class="ref-mention-label">${t("tasks.imageName")}:</span>
            <div class="ref-mention-tags" id="taskMentionHelperTags"></div>
          </div>

          <!-- Hint: max ref images per prompt (visible in mention mode) -->
          <div class="ref-limit-hint hidden" id="taskRefLimitHint">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span id="taskRefLimitHintText"></span>
          </div>

          <div class="form-group hidden" id="taskGrokFramesGroup"></div>

          <div class="form-group hidden" id="taskFramesGroup">
            <label style="margin:0 0 6px 0;font-size:11px;display:flex;align-items:center;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 4px;">
                <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
                <line x1="7" y1="2" x2="7" y2="22"></line>
                <line x1="17" y1="2" x2="17" y2="22"></line>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <line x1="2" y1="7" x2="7" y2="7"></line>
                <line x1="2" y1="17" x2="7" y2="17"></line>
                <line x1="17" y1="7" x2="22" y2="7"></line>
                <line x1="17" y1="17" x2="22" y2="17"></line>
              </svg>
              ${t("tasks.videoFrames")}
            </label>
            <div id="taskFrameSourcePanelContainer"></div>
            <!-- Single-prompt: global frame pair -->
            <div id="taskGlobalFrameConfig" class="frame-config">
              <div class="frame-slot" id="taskFrame1Slot">
                <div class="frame-slot-header">
                  <svg class="frame-slot-icon" viewBox="0 0 11 10" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7.5L8.9 7.5C9.46005 7.5 9.74008 7.5 9.95399 7.39101C10.1422 7.29513 10.2951 7.14215 10.391 6.95399C10.5 6.74008 10.5 6.46005 10.5 5.9V4.1C10.5 3.53995 10.5 3.25992 10.391 3.04601C10.2951 2.85785 10.1422 2.70487 9.95399 2.60899C9.74008 2.5 9.46005 2.5 8.9 2.5L5 2.5M3 7.5H2.1C1.53995 7.5 1.25992 7.5 1.04601 7.39101C0.857847 7.29513 0.704867 7.14215 0.608994 6.95399C0.5 6.74008 0.5 6.46005 0.5 5.9V4.1C0.5 3.53995 0.5 3.25992 0.608994 3.04601C0.704867 2.85785 0.857847 2.70487 1.04601 2.60899C1.25992 2.5 1.53995 2.5 2.1 2.5H3M3 0.5L3 9.5M1.75 9.5L4.25 9.5M1.75 0.499996L4.25 0.5"/></svg>
                  <span class="frame-slot-label">${t("tasks.frameStart")}</span>
                </div>
                <div class="frame-slot-body" id="taskFrame1Body">
                  <div class="frame-dropzone" id="taskFrame1PickBtn">
                    <svg class="frame-dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
                    <span class="frame-dropzone-text">${window.I18n?.t("gen.addFrame") || "Add"}</span>
                  </div>
                </div>
                <input type="hidden" id="taskFrame1FileId" value="${isEdit ? this.escapeAttr(this.task.frame_1_file_id || "") : ""}" />
              </div>
              <div class="frame-slot" id="taskFrame2Slot">
                <div class="frame-slot-header">
                  <svg class="frame-slot-icon" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 3.5H2.6C2.03995 3.5 1.75992 3.5 1.54601 3.60899C1.35785 3.70487 1.20487 3.85785 1.10899 4.04601C1 4.25992 1 4.53995 1 5.1V6.9C1 7.46005 1 7.74008 1.10899 7.95399C1.20487 8.14215 1.35785 8.29513 1.54601 8.39101C1.75992 8.5 2.03995 8.5 2.6 8.5H6.5M8.5 3.5H9.4C9.96005 3.5 10.2401 3.5 10.454 3.60899C10.6422 3.70487 10.7951 3.85785 10.891 4.04601C11 4.25992 11 4.53995 11 5.1V6.9C11 7.46005 11 7.74008 10.891 7.95399C10.7951 8.14215 10.6422 8.29513 10.454 8.39101C10.2401 8.5 9.96005 8.5 9.4 8.5H8.5M8.5 10.5L8.5 1.5M9.75 1.5L7.25 1.5M9.75 10.5L7.25 10.5"/></svg>
                  <span class="frame-slot-label">${t("tasks.frameEnd")}</span>
                </div>
                <div class="frame-slot-body" id="taskFrame2Body">
                  <div class="frame-dropzone" id="taskFrame2PickBtn">
                    <svg class="frame-dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
                    <span class="frame-dropzone-text">${window.I18n?.t("gen.addFrame") || "Add"}</span>
                  </div>
                </div>
                <input type="hidden" id="taskFrame2FileId" value="${isEdit ? this.escapeAttr(this.task.frame_2_file_id || "") : ""}" />
              </div>
            </div>
            <!-- Multi-prompt: per-prompt frame pairs (rendered dynamically) -->
            <div id="taskPerPromptFramesContainer" class="hidden"></div>
          </div>


          <div class="form-group">
            <div class="auto-download-row">
              ${(() => {
                const autoDownloadOn = isEdit
                  ? this.task.auto_download
                  : this._afSettings?.autoDownload || false;
                const dlRes = isEdit
                  ? this.task.download_resolution || "1k"
                  : this._afSettings?.downloadResolution || "1k";
                const videoDlRes = isEdit
                  ? this.task.video_download_resolution || "720p"
                  : this._afSettings?.videoDownloadResolution || "720p";
                const mediaType = isEdit ? this.task.media_type : "Image";
                const hasDownloadResolution = initialProvider === "flow";
                const canUseAutoDownload =
                  window.featureGate?.canUse("auto_download");
                return `
              <label class="toolbar-toggle wm-toggle${!canUseAutoDownload ? " feature-disabled" : ""}" for="taskAutoDownload" ${!canUseAutoDownload ? `title="${t("tasks.premiumRequired")}"` : ""}>
                <input type="checkbox" id="taskAutoDownload" ${autoDownloadOn ? "checked" : ""} ${!canUseAutoDownload ? "disabled" : ""} />
                <span class="toggle-track"><span class="toggle-thumb"></span></span>
                <span class="toggle-label">${t("tasks.autoDownloadLabel")}</span>
              </label>
              ${!canUseAutoDownload ? window.featureGate.renderCrownSpan("auto_download") : ""}
              <span class="input-group select-group compact-select dl-res-select-wrap${!hasDownloadResolution || !autoDownloadOn || mediaType === "Video" ? " hidden" : ""}" id="taskDownloadResWrap">
                <select id="taskDownloadResolution" title="${t("tasks.downloadQuality")}">
                  ${(
                    window.ProviderConfigManager?.getDownloadResolutionsSync?.(
                      "flow",
                      "image",
                    ) || [
                      { value: "1k", label: "1K" },
                      { value: "2k", label: "2K (Pro)" },
                      { value: "4k", label: "4K (Ultra)" },
                    ]
                  )
                    .map(
                      (r) =>
                        `<option value="${r.value}"${dlRes === r.value ? " selected" : ""}>${r.label || r.value}</option>`,
                    )
                    .join("")}
                </select>
                <svg class="select-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </span>
              <span class="input-group select-group compact-select dl-res-select-wrap${!hasDownloadResolution || !autoDownloadOn || mediaType !== "Video" ? " hidden" : ""}" id="taskVideoDownloadResWrap">
                <select id="taskVideoDownloadResolution" title="${t("tasks.downloadVideoQuality")}">
                  ${(
                    window.ProviderConfigManager?.getDownloadResolutionsSync?.(
                      "flow",
                      "video",
                    ) || [
                      { value: "720p", label: "720p" },
                      { value: "1080p", label: "1080p" },
                      { value: "4k", label: "4K (Ultra)" },
                    ]
                  )
                    .map(
                      (r) =>
                        `<option value="${r.value}"${videoDlRes === r.value ? " selected" : ""}>${r.label || r.value}</option>`,
                    )
                    .join("")}
                </select>
                <svg class="select-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </span>
                `;
              })()}
            </div>
          </div>
        </div>
        ${
          isEdit
            ? `
          <div class="task-modal-tab-content hidden" id="taskResultsTab">
            ${this._renderResultsTab()}
          </div>
        `
            : ""
        }
        </div>
        <div class="task-modal-footer">
          <button class="btn btn-secondary" id="cancelModalBtn">${t("tasks.cancelBtn")}</button>
          <button class="btn btn-primary" id="saveTaskBtn">${isEdit ? t("tasks.updateBtn") : t("tasks.createBtn")}</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.overlay);
    this._refreshFlowModelOptions({ restore: true });
  }
  bindEvents() {
    if (!this.overlay) return;
    const allLockedLoginBtn = this.overlay.querySelector(
      "#taskAllLockedLoginBtn",
    );
    const allLockedUpgradeBtn = this.overlay.querySelector(
      "#taskAllLockedUpgradeBtn",
    );
    const allLockedContactBtn = this.overlay.querySelector(
      "#taskAllLockedContactBtn",
    );
    allLockedLoginBtn?.addEventListener("click", () => {
      this.close();
      const loginOverlay = document.getElementById("loginOverlay");
      if (loginOverlay) {
        loginOverlay.classList.remove("hidden");
      } else {
        chrome.runtime.sendMessage({ action: "openSettings" });
      }
    });
    allLockedUpgradeBtn?.addEventListener("click", () => {
      if (typeof window.openUpgradeModal === "function") {
        window.openUpgradeModal();
      }
    });
    allLockedContactBtn?.addEventListener("click", () => {
      const contactUrl = window.SystemConfig?.get("upgrade_contact_url", "");
      if (contactUrl) window.open(contactUrl, "_blank");
    });
    const closeBtn = this.overlay.querySelector("#closeModalBtn");
    const cancelBtn = this.overlay.querySelector("#cancelModalBtn");
    closeBtn?.addEventListener("click", () => this.close());
    cancelBtn?.addEventListener("click", () => this.close());
    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) {
        if (Date.now() - (this._lastMentionSelectTime || 0) < 300) return;
        this.close();
      }
    });
    const saveBtn = this.overlay.querySelector("#saveTaskBtn");
    saveBtn?.addEventListener("click", () => this.save());
    const mediaTypeSelect = this.overlay.querySelector("#taskMediaType");
    const imageModelGroup = this.overlay.querySelector("#taskImageModelGroup");
    const videoModelGroup = this.overlay.querySelector("#taskVideoModelGroup");
    const videoInputTypeRow = this.overlay.querySelector(
      "#taskVideoInputTypeRow",
    );
    const videoDurationGroup = this.overlay.querySelector(
      "#taskVideoDurationGroup",
    );
    const videoResolutionGroup = this.overlay.querySelector(
      "#taskVideoResolutionGroup",
    );
    const refImagesGroup = this.overlay.querySelector("#taskRefImagesGroup");
    const videoInputTypeSelect = this.overlay.querySelector(
      "#taskVideoInputType",
    );
    const videoModelSelect = this.overlay.querySelector("#taskVideoModel");
    const videoDurationSelect =
      this.overlay.querySelector("#taskVideoDuration");
    const videoResolutionSelect = this.overlay.querySelector(
      "#taskVideoResolution",
    );
    const framesGroup = this.overlay.querySelector("#taskFramesGroup");
    const updateTaskVideoDurationOptions = () => {
      if (!videoDurationSelect) return;
      const currentModel = videoModelSelect?.value || "";
      let tier = "default";
      try {
        const models =
          window.ModelRegistry?.safeGetModelsSync?.("flow", "video") || [];
        const modelObj = models.find(
          (m) => m.value === currentModel || m.name === currentModel,
        );
        if (modelObj?.config?.duration_tier)
          tier = modelObj.config.duration_tier;
      } catch (_) {}
      const durations =
        window.ProviderConfigManager?.safeGetVideoDurationsSync?.(
          "flow",
          tier,
        ) || [];
      videoDurationGroup?.classList.toggle(
        "hidden",
        tier === "default" ||
          mediaTypeSelect?.value !== "Video" ||
          this.overlay?.querySelector("#taskProvider")?.value !== "flow" ||
          durations.length === 0,
      );
      if (durations.length === 0) return;
      const prevValue = videoDurationSelect.value;
      videoDurationSelect.innerHTML = durations
        .map(
          (d) =>
            `<option value="${this.escapeAttr(d)}">${this.escapeHtml(d)}</option>`,
        )
        .join("");
      if (prevValue && durations.includes(prevValue)) {
        videoDurationSelect.value = prevValue;
      } else {
        const defaultIdx = durations.indexOf("6s");
        videoDurationSelect.value =
          defaultIdx >= 0 ? durations[defaultIdx] : durations[0];
      }
    };
    const updateTaskVideoResolutionOptions = () => {
      if (!videoResolutionSelect || !videoResolutionGroup) return;
      const cfg = window.ModelRegistry?.getGenerationResolutionConfig?.(
        "flow",
        videoModelSelect?.value || "",
      );
      if (
        !cfg ||
        mediaTypeSelect?.value !== "Video" ||
        this.overlay?.querySelector("#taskProvider")?.value !== "flow"
      ) {
        videoResolutionGroup.classList.add("hidden");
        videoResolutionSelect.innerHTML = "";
        return;
      }
      const previous = videoResolutionSelect.value;
      videoResolutionSelect.innerHTML = cfg.options
        .map(
          (o) =>
            `<option value="${this.escapeAttr(o.value)}">${this.escapeHtml(o.label)}</option>`,
        )
        .join("");
      videoResolutionSelect.value = cfg.options.some(
        (o) => o.value === previous,
      )
        ? previous
        : cfg.default;
      videoResolutionGroup.classList.remove("hidden");
    };
    videoModelSelect?.addEventListener("change", () => {
      updateTaskVideoDurationOptions();
      updateTaskVideoResolutionOptions();
      this._applyTaskFramesSupport();
      try {
        this._applyTaskVoicePickerVisibility();
      } catch (_) {}
      try {
        this._applyTaskCharacterPickerVisibility();
      } catch (_) {}
      try {
        this._renderTaskRefPreview();
      } catch (_) {}
    });
    videoDurationSelect?.addEventListener("change", () => {
      try {
        this._renderTaskRefPreview();
      } catch (_) {}
    });
    const updateTaskMediaUI = () => {
      const isVideo = mediaTypeSelect?.value === "Video";
      imageModelGroup?.classList.toggle("hidden", isVideo);
      videoModelGroup?.classList.toggle("hidden", !isVideo);
      videoInputTypeRow?.classList.toggle("hidden", !isVideo);
      updateTaskVideoDurationOptions();
      updateTaskVideoResolutionOptions();
      try {
        this._applyTaskVoicePickerVisibility();
      } catch (_) {}
      try {
        this._applyTaskCharacterPickerVisibility();
      } catch (_) {}
      if (isVideo) this._applyTaskFramesSupport();
      const isFrames = isVideo && videoInputTypeSelect?.value === "Frames";
      const compactBar = this.overlay?.querySelector("#taskGenCompactBar");
      if (compactBar) compactBar.dataset.genMode = isVideo ? "video" : "image";
      if (isFrames) {
        refImagesGroup?.classList.add("hidden");
        framesGroup?.classList.remove("hidden");
      } else if (isVideo) {
        refImagesGroup?.classList.remove("hidden");
        framesGroup?.classList.add("hidden");
      } else {
        refImagesGroup?.classList.remove("hidden");
        framesGroup?.classList.add("hidden");
      }
    };
    const taskMediaTypeToggle = this.overlay.querySelector(
      "#taskMediaTypeToggle",
    );
    const syncMediaTypeToggleUI = () => {
      if (!taskMediaTypeToggle) return;
      const val = mediaTypeSelect?.value || "Image";
      taskMediaTypeToggle.querySelectorAll(".task-media-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.mode === val);
      });
    };
    mediaTypeSelect?.addEventListener("change", () => {
      syncMediaTypeToggleUI();
      updateTaskMediaUI();
      this._updateRatioOptions();
      this._renderTaskRefPreview();
      const currentProvider =
        this.overlay?.querySelector("#taskProvider")?.value;
      if (
        currentProvider === "grok" ||
        currentProvider === "chatgpt" ||
        currentProvider === "gemini" ||
        currentProvider === "muse"
      ) {
        this._renderTaskFormByProvider(currentProvider);
      }
    });
    if (taskMediaTypeToggle && mediaTypeSelect) {
      taskMediaTypeToggle.querySelectorAll(".task-media-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          const mode = btn.dataset.mode;
          if (!mode || mediaTypeSelect.value === mode) return;
          const activeProvider =
            this.overlay?.querySelector("#taskProvider")?.value || "flow";
          const previousMode =
            mediaTypeSelect.value === "Video" ? "video" : "image";
          const currentRatio = this.overlay?.querySelector("#taskRatio")?.value;
          if (currentRatio && this._providerRatioSelections?.[activeProvider]) {
            this._providerRatioSelections[activeProvider][previousMode] =
              currentRatio;
          }
          mediaTypeSelect.value = mode;
          mediaTypeSelect.dispatchEvent(new Event("change", { bubbles: true }));
        });
      });
    }
    const providerHidden = this.overlay.querySelector("#taskProvider");
    const providerTabs = this.overlay.querySelector("#taskProviderTabs");
    if (providerTabs && providerHidden) {
      window.ProviderTabScroll?.bind(providerTabs);
      const setActiveProvider = (providerKey) => {
        providerHidden.value = providerKey;
        providerTabs.querySelectorAll(".provider-tab").forEach((btn) => {
          const isActive = btn.dataset.provider === providerKey;
          btn.classList.toggle("provider-tab--active", isActive);
          btn.setAttribute("aria-selected", isActive ? "true" : "false");
        });
      };
      providerTabs.querySelectorAll(".provider-tab").forEach((btn) => {
        btn.addEventListener("click", () => {
          const providerKey = btn.dataset.provider || "flow";
          if (providerHidden.value === providerKey) return;
          const gate = this._resolveTaskProviderGate?.(providerKey) || {
            locked: false,
          };
          if (gate.locked) {
            const isLoggedIn = !!window.authManager?.isLoggedIn?.();
            if (gate.reason === "feature") {
              if (isLoggedIn && typeof window.openUpgradeModal === "function") {
                try {
                  window.openUpgradeModal();
                } catch (_) {}
              } else {
                window.featureGate?.showLoginPrompt(gate.tooltip);
              }
            } else if (gate.reason === "quota") {
              if (typeof window.openUpgradeModal === "function") {
                try {
                  window.openUpgradeModal();
                } catch (_) {}
              } else if (window.featureGate?.showLoginPrompt) {
                window.featureGate.showLoginPrompt(gate.tooltip);
              }
            }
            return;
          }
          const currentProvider = providerHidden.value;
          const ratioSel = this.overlay.querySelector("#taskRatio");
          const mediaSel = this.overlay.querySelector("#taskMediaType");
          if (ratioSel?.value) {
            const currentMode = mediaSel?.value === "Video" ? "video" : "image";
            if (this._providerRatioSelections[currentProvider]) {
              this._providerRatioSelections[currentProvider][currentMode] =
                ratioSel.value;
            }
          }
          if (mediaSel?.value) {
            if (currentProvider === "grok") {
              this._grokMediaTypeCache = mediaSel.value;
            } else if (currentProvider === "flow") {
              this._flowMediaTypeCache = mediaSel.value;
            }
          }
          setActiveProvider(providerKey);
          this._renderTaskFormByProvider(providerKey);
          if (ratioSel && this._providerRatioSelections[providerKey]) {
            const targetMode = mediaSel?.value === "Video" ? "video" : "image";
            const rememberedRatio =
              this._providerRatioSelections[providerKey][targetMode];
            const opt = Array.from(ratioSel.options || []).find(
              (o) => o.value === rememberedRatio,
            );
            if (opt) ratioSel.value = rememberedRatio;
          }
          if (providerKey === "grok" && mediaSel) {
            const desiredMode =
              this._grokMediaTypeCache ||
              (this.mode === "edit" &&
              this.task?.provider === "grok" &&
              this.task?.grok_mode === "video"
                ? "Video"
                : null) ||
              (this.mode === "edit" &&
              this.task?.provider === "grok" &&
              this.task?.grok_mode === "image"
                ? "Image"
                : null);
            if (desiredMode && mediaSel.value !== desiredMode) {
              mediaSel.value = desiredMode;
              mediaSel.dispatchEvent(new Event("change", { bubbles: true }));
            }
          } else if (
            providerKey === "flow" &&
            mediaSel &&
            this._flowMediaTypeCache
          ) {
            if (mediaSel.value !== this._flowMediaTypeCache) {
              mediaSel.value = this._flowMediaTypeCache;
              mediaSel.dispatchEvent(new Event("change", { bubbles: true }));
            }
          }
          try {
            this._renderTaskRefPreview();
          } catch (_) {}
          this._ensureProviderTab(providerKey);
        });
      });
      this._renderTaskFormByProvider(providerHidden.value || "flow");
    }
    const taskRatioSelect = this.overlay.querySelector("#taskRatio");
    taskRatioSelect?.addEventListener("change", () => {
      const provider = providerHidden?.value || "flow";
      const mode = mediaTypeSelect?.value === "Video" ? "video" : "image";
      if (taskRatioSelect.value && this._providerRatioSelections?.[provider]) {
        this._providerRatioSelections[provider][mode] = taskRatioSelect.value;
      }
    });
    const taskAutoDownload = this.overlay.querySelector("#taskAutoDownload");
    const taskDownloadResWrap = this.overlay.querySelector(
      "#taskDownloadResWrap",
    );
    const taskVideoDownloadResWrap = this.overlay.querySelector(
      "#taskVideoDownloadResWrap",
    );
    const updateDownloadResolutionVisibility = () => {
      const isAutoDownload = taskAutoDownload?.checked;
      const isVideo = mediaTypeSelect?.value === "Video";
      const providerVal =
        this.overlay?.querySelector("#taskProvider")?.value || "flow";
      const isChatGPT = providerVal === "chatgpt";
      const isGrok = providerVal === "grok";
      const isGemini = providerVal === "gemini";
      const isMuse = providerVal === "muse";
      if (taskDownloadResWrap) {
        taskDownloadResWrap.classList.toggle(
          "hidden",
          !isAutoDownload ||
            isVideo ||
            isChatGPT ||
            isGrok ||
            isGemini ||
            isMuse,
        );
      }
      if (taskVideoDownloadResWrap) {
        taskVideoDownloadResWrap.classList.toggle(
          "hidden",
          !isAutoDownload ||
            !isVideo ||
            isChatGPT ||
            isGrok ||
            isGemini ||
            isMuse,
        );
      }
    };
    taskAutoDownload?.addEventListener(
      "change",
      updateDownloadResolutionVisibility,
    );
    mediaTypeSelect?.addEventListener(
      "change",
      updateDownloadResolutionVisibility,
    );
    videoInputTypeSelect?.addEventListener("change", () => {
      updateTaskMediaUI();
      this._updateTaskFrameMode();
      this._renderTaskRefPreview();
      this._mentionMenu?.hide?.();
      this.overlay
        ?.querySelector("#taskPrompt")
        ?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    updateTaskMediaUI();
    this._updateRatioOptions();
    const initialProvider = providerHidden?.value;
    if (
      initialProvider === "grok" ||
      initialProvider === "chatgpt" ||
      initialProvider === "gemini" ||
      initialProvider === "muse"
    ) {
      this._renderTaskFormByProvider(initialProvider);
    }
    this._updateTaskRefGroupInput();
    this.overlay
      .querySelector("#taskRefImagesPerPrompt")
      ?.addEventListener("change", () => {
        this._updateTaskRefGroupInput();
        this._renderTaskRefPreview();
        this._updatePromptCount();
      });
    for (const [suffix, step] of [
      ["Minus", -1],
      ["Plus", 1],
    ]) {
      this.overlay
        .querySelector("#taskRefImagesPerPrompt" + suffix)
        ?.addEventListener("click", () => {
          const input = this.overlay.querySelector("#taskRefImagesPerPrompt");
          input.value = Math.max(1, this._getTaskRefsPerPrompt() + step);
          input.dispatchEvent(new Event("change"));
        });
    }
    const openPickerBtn = this.overlay.querySelector("#taskOpenImagePickerBtn");
    openPickerBtn?.addEventListener("click", () => {
      const existingIds = (
        this.overlay?.querySelector("#taskFileIds")?.value || ""
      )
        .split(",")
        .filter(Boolean);
      if (window.imagePickerModal) {
        const frameSourcePick = this._taskFrameSourcePickerRequested === true;
        this._taskFrameSourcePickerRequested = false;
        const refMode =
          this.overlay?.querySelector("#taskRefImageMode")?.value || "all";
        if (!frameSourcePick && refMode === "none") {
          console.log("[TaskModal] ref_mode=none, picker disabled");
          return;
        }
        const refLimit = frameSourcePick ? Infinity : this._getTaskRefLimit();
        const _tmProvider = (
          this.overlay?.querySelector("#taskProvider")?.value ||
          this.task?.provider ||
          "flow"
        ).toLowerCase();
        const _tmMediaTypeRaw =
          this.overlay?.querySelector("#taskMediaType")?.value || "Image";
        const _tmIsVideo = _tmMediaTypeRaw === "Video";
        const _tmVideoInput =
          this.overlay?.querySelector("#taskVideoInputType")?.value ||
          "Ingredients";
        const _tmModelValue =
          this.task?.model ||
          this.overlay?.querySelector("#taskVideoModel")?.value ||
          this.overlay?.querySelector("#taskImageModel")?.value ||
          "";
        const _tmDuration =
          this.task?.video_duration ||
          this.overlay?.querySelector("#taskVideoDuration")?.value ||
          void 0;
        const _tmCaps =
          _tmProvider === "flow" &&
          typeof ImagePickerModal !== "undefined" &&
          ImagePickerModal.resolveCapsMulti
            ? ImagePickerModal.resolveCapsMulti({
                provider: "flow",
                mode: _tmIsVideo ? "video" : "image",
                isFrames: _tmIsVideo && _tmVideoInput === "Frames",
                modelValue: _tmModelValue,
                duration: _tmDuration,
              })
            : { image: null, video: 0, total: null };
        const _tmExistingTypes = {};
        const _tmExistingMedia = {};
        for (const id of existingIds) {
          const cache = this._taskTileCache?.[id];
          const sv = this.task?.ref_thumbnails?.[id];
          const saved = sv && typeof sv === "object" ? sv : {};
          const cached = cache && typeof cache === "object" ? cache : {};
          const type = cached.type || saved.type || "image";
          if (type === "video") _tmExistingTypes[id] = "video";
          _tmExistingMedia[id] = {
            thumbnail:
              cached.thumbnail ||
              (typeof sv === "string" ? sv : saved.thumbnail) ||
              "",
            source_thumbnail:
              cached.source_thumbnail || saved.source_thumbnail || "",
            video_url: cached.video_url || saved.video_url || "",
            file_name:
              cached.file_name ||
              this.task?.ref_file_names?.[id] ||
              saved.file_name ||
              "",
            media_uuid: cached.media_uuid || saved.media_uuid || "",
            persistent_media_id:
              cached.persistent_media_id || saved.persistent_media_id || "",
            identity_durability:
              cached.identity_durability || saved.identity_durability || "",
            identity_kind: cached.identity_kind || saved.identity_kind || "",
            identity_aliases:
              cached.identity_aliases || saved.identity_aliases || [],
            api_driver: cached.api_driver || saved.api_driver || "",
            project_id: cached.project_id || saved.project_id || "",
            protocol_revision:
              cached.protocol_revision || saved.protocol_revision || null,
            protocol_fingerprint:
              cached.protocol_fingerprint || saved.protocol_fingerprint || "",
            type,
          };
        }
        window.imagePickerModal.open({
          refAuditContext: { surface: "task" },
          refImagesPerPrompt:
            !frameSourcePick && refMode === "sequential"
              ? this._getTaskRefsPerPrompt()
              : null,
          existingFileIds: existingIds,
          existingFileTypes: _tmExistingTypes,
          existingMedia: _tmExistingMedia,
          mediaFilter: "image",
          allowVideo:
            !frameSourcePick &&
            _tmProvider === "flow" &&
            window.ProviderRegistry?.get?.("flow")?.supportsRefVideo?.(
              _tmModelValue,
            ) === true,
          maxSelections: refLimit === Infinity ? null : refLimit,
          maxImageSelections: refLimit === Infinity ? null : refLimit,
          maxVideoSelections: frameSourcePick ? 0 : _tmCaps.video || 0,
          maxTotalSelections: frameSourcePick
            ? null
            : refMode === "sequential"
              ? refLimit
              : _tmCaps.total,
          noRefSupportContext:
            refLimit === 0
              ? {
                  provider: _tmProvider,
                  modelValue: _tmModelValue,
                  mediaType: _tmIsVideo ? "video" : "image",
                  inputType: _tmIsVideo ? _tmVideoInput : void 0,
                  duration: _tmDuration,
                }
              : null,
          onConfirm: (images) => this.handleImagePickerConfirm(images),
        });
      }
    });
    if (openPickerBtn) {
      openPickerBtn.addEventListener("dragover", (e) => {
        e.preventDefault();
        openPickerBtn.classList.add("drag-over");
      });
      openPickerBtn.addEventListener("dragleave", () => {
        openPickerBtn.classList.remove("drag-over");
      });
      openPickerBtn.addEventListener("drop", (e) => {
        e.preventDefault();
        openPickerBtn.classList.remove("drag-over");
        const files = Array.from(e.dataTransfer.files).filter((f) =>
          f.type.startsWith("image/"),
        );
        if (files.length > 0) {
          this._handleDroppedFiles(files);
        }
      });
    }
    const qtyInput = this.overlay.querySelector("#taskQuantity");
    const _qRange =
      window.ProviderConfigManager?.safeGetQuantityRangeSync?.("flow");
    const _qMin = _qRange?.min ?? 1;
    const _qMax = _qRange?.max ?? 4;
    this.overlay
      .querySelector("#taskQtyMinus")
      ?.addEventListener("click", () => {
        const val = parseInt(qtyInput.value) || _qMin;
        if (val > _qMin) qtyInput.value = val - 1;
      });
    this.overlay
      .querySelector("#taskQtyPlus")
      ?.addEventListener("click", () => {
        const val = parseInt(qtyInput.value) || _qMin;
        if (val < _qMax) qtyInput.value = val + 1;
      });
    const isEdit = this.mode === "edit" && this.task;
    const refModeSelect = this.overlay.querySelector("#taskRefImageMode");
    if (refModeSelect) {
      if (isEdit && this.task.ref_image_mode) {
        refModeSelect.value = this.task.ref_image_mode;
      }
      refModeSelect.addEventListener("change", () => {
        this._updateTaskRefGroupInput();
        this._updateRefModeUI();
        this._updatePromptCount();
        if (refModeSelect.value !== "mention") {
          this._hideMentionDropdown();
        }
      });
      this._updateRefModeUI();
    }
    const captureBtn = this.overlay.querySelector("#taskScreenCaptureBtn");
    if (captureBtn) {
      captureBtn.addEventListener("click", async () => {
        if (!window.ScreenCapture) {
          window.customDialog?.alert(t("tasks.captureNotReady"), {
            type: "warning",
          });
          return;
        }
        captureBtn.disabled = true;
        captureBtn.classList.add("btn-loading");
        try {
          const result = await window.ScreenCapture.startCapture();
          if (result?.success && result.uploadId) {
            const uploadKey = result.uploadId;
            const fileIdsInput = this.overlay?.querySelector("#taskFileIds");
            if (fileIdsInput) {
              const existingIds = fileIdsInput.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              existingIds.push(uploadKey);
              fileIdsInput.value = existingIds.join(", ");
            }
            this._modalUploadKeys?.add(uploadKey);
            const pending = window.pendingUploadFiles?.get(uploadKey);
            if (pending?.thumbnail) {
              if (!this._taskTileCache) this._taskTileCache = {};
              this._taskTileCache[uploadKey] = {
                thumbnail: pending.thumbnail,
                file_name: "",
              };
            }
            if (result.captureName && uploadKey) {
              this._refImageNames[uploadKey] = result.captureName;
            }
            this._renderTaskRefPreview();
            this._refreshMentionHelper();
            this._updateDragHint();
            this._updateButtonState();
          } else if (result?.error) {
            console.warn("[TaskModal] ScreenCapture failed:", result.error);
          }
        } catch (err) {
          console.warn("[TaskModal] ScreenCapture error:", err.message);
          window.customDialog?.alert(
            t("tasks.captureFailed") + (err.message || t("common.error")),
            { type: "warning" },
          );
        } finally {
          captureBtn.disabled = false;
          captureBtn.classList.remove("btn-loading");
        }
      });
    }
    const multiPromptCheck = this.overlay.querySelector(
      "#taskMultiPromptCheck",
    );
    const multiPromptHint = this.overlay.querySelector("#taskMultiPromptHint");
    if (multiPromptCheck) {
      this._multiPromptEnabled = multiPromptCheck.checked;
      if (this._multiPromptEnabled && multiPromptHint)
        multiPromptHint.classList.remove("hidden");
      multiPromptCheck.addEventListener("change", () => {
        this._multiPromptEnabled = multiPromptCheck.checked;
        if (multiPromptHint)
          multiPromptHint.classList.toggle("hidden", !this._multiPromptEnabled);
        this._updatePromptCount();
        this._renderTaskRefPreview();
        this._updateTaskFrameMode();
      });
    }
    const taskPromptArea = this.overlay.querySelector("#taskPrompt");
    if (taskPromptArea) {
      this._bindPromptResizer();
      const updatePromptHandler = () => {
        this._updatePromptCount();
        this._updateTaskPromptCharCount(taskPromptArea);
        const isMulti = !!this.overlay?.querySelector("#taskMultiPromptCheck")
          ?.checked;
        const refMode =
          this.overlay?.querySelector("#taskRefImageMode")?.value || "all";
        if (isMulti && refMode === "sequential") {
          try {
            this._renderTaskRefPreview();
          } catch (e) {}
        }
      };
      taskPromptArea.addEventListener("input", updatePromptHandler);
      taskPromptArea.addEventListener("paste", () => {
        setTimeout(updatePromptHandler, 10);
      });
      let _frameDebounceTimer = null;
      const frameUpdateHandler = () => {
        clearTimeout(_frameDebounceTimer);
        _frameDebounceTimer = setTimeout(
          () => this._updateTaskFrameMode(),
          500,
        );
      };
      taskPromptArea.addEventListener("input", frameUpdateHandler);
      taskPromptArea.addEventListener("paste", () =>
        setTimeout(frameUpdateHandler, 10),
      );
      this._updatePromptCount();
      this._updateTaskPromptCharCount(taskPromptArea);
    }
    const promptSearchBtn = this.overlay.querySelector("#taskPromptSearchBtn");
    const promptSaveBtn = this.overlay.querySelector("#taskPromptSaveBtn");
    if (promptSearchBtn) {
      promptSearchBtn.addEventListener("click", () => {
        if (window.GenTab?._openPromptSearchModal) {
          const taskArea = this.overlay?.querySelector("#taskPrompt");
          const origFill = GenTab._psmFillPrompt;
          GenTab._psmFillPrompt = function (content) {
            if (taskArea && taskArea.isConnected) {
              taskArea.value = content;
              taskArea.dispatchEvent(new Event("input", { bubbles: true }));
              taskArea.focus();
              window.showNotification?.(
                t("tasks.promptInserted"),
                "success",
                1500,
              );
            } else {
              origFill(content);
            }
            GenTab._psmFillPrompt = origFill;
          };
          GenTab._openPromptSearchModal();
        }
      });
    }
    if (promptSaveBtn) {
      promptSaveBtn.addEventListener("click", () => {
        const content =
          this.overlay?.querySelector("#taskPrompt")?.value?.trim() || "";
        if (window.MyPromptsTab) {
          window.MyPromptsTab._showSaveDialog(
            content ? { title: "", content, category: "" } : null,
          );
        }
      });
    }
    const quantityInput = this.overlay.querySelector("#taskQuantity");
    if (quantityInput) {
      quantityInput.addEventListener("input", () => this._updatePromptCount());
    }
    this._initMentionAutocomplete();
    this._bindTaskFramePicker(1);
    this._bindTaskFramePicker(2);
    this._updateTaskFrameMode();
    this._renderTaskFrameSourcePanel();
    if (this.mode === "edit" && this.task?.ref_file_ids) {
      this._renderExistingRefPreview(this.task.ref_file_ids);
    }
    if (this.mode === "edit") {
      this._bindResultsTab();
    }
    this._escHandler = (e) => {
      if (e.key === "Escape") {
        const voicePickerOpen = document
          .getElementById("voiceSelectModalOverlay")
          ?.classList.contains("visible");
        const characterPickerOpen = document
          .getElementById("characterSelectModalOverlay")
          ?.classList.contains("visible");
        if (voicePickerOpen || characterPickerOpen) return;
        this.close();
      }
    };
    document.addEventListener("keydown", this._escHandler);
    this._featuregateHandler = () => {
      this._updateAutoDownloadToggle();
      this._refreshProviderSelectGate();
    };
    window.eventBus?.on("featuregate:refreshed", this._featuregateHandler);
    window.eventBus?.on("prompt:completed", this._featuregateHandler);
    window.eventBus?.on("featuregate:quota_warning", this._featuregateHandler);
    window.eventBus?.on(
      "featuregate:quota_exhausted",
      this._featuregateHandler,
    );
  }
  _resolveTaskProviderGate(provider) {
    const fg = window.featureGate;
    if (!fg) return { locked: false, reason: null, tooltip: "" };
    if (provider === "flow" && !fg.canUse?.("gen_enabled")) {
      return {
        locked: true,
        reason: "feature",
        tooltip:
          t("tasks.flowProviderLockedHint") ||
          "Google Flow requires a suitable plan.",
      };
    }
    if (provider === "chatgpt" && !fg.canUse?.("chatgpt_enabled")) {
      return {
        locked: true,
        reason: "feature",
        tooltip:
          t("tasks.providerLockedHint") || "ChatGPT requires a Pro plan.",
      };
    }
    if (provider === "grok" && !fg.canUse?.("grok_enabled")) {
      return {
        locked: true,
        reason: "feature",
        tooltip:
          t("tasks.grokProviderLockedHint") || "Grok requires a Pro plan.",
      };
    }
    if (provider === "gemini" && !fg.canUse?.("gemini_enabled")) {
      return {
        locked: true,
        reason: "feature",
        tooltip:
          t("tasks.geminiProviderLockedHint") ||
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
    const q = fg.checkQuota?.("tasks_run_max");
    if (q && !q.allowed) {
      const limitText = q.limit === "unlimited" ? "\u221E" : q.limit;
      const tooltip =
        window.I18n?.t?.("tasks.quotaExhaustedHint", {
          used: q.used,
          limit: limitText,
        }) ||
        window.I18n?.t?.("taskNotify.quotaExhaustedTooltip", {
          used: q.used,
          limit: limitText,
        }) ||
        `You've used ${q.used}/${limitText} task runs today. Upgrade to increase your quota.`;
      return { locked: true, reason: "quota", tooltip };
    }
    return { locked: false, reason: null, tooltip: "" };
  }
  _refreshProviderSelectGate() {
    if (!this.overlay) return;
    const providerTabs = this.overlay.querySelector("#taskProviderTabs");
    const providerHidden = this.overlay.querySelector("#taskProvider");
    if (!providerTabs || !providerHidden) return;
    const lockedHint = this.overlay.querySelector(".task-provider-locked-hint");
    if (lockedHint) lockedHint.remove();
    const allProviders = Array.from(
      providerTabs.querySelectorAll(".provider-tab[data-provider]"),
    )
      .map((btn) => btn.dataset.provider)
      .filter(Boolean);
    const gates = {};
    allProviders.forEach((provider) => {
      const btn = providerTabs.querySelector(
        `.provider-tab[data-provider="${provider}"]`,
      );
      if (!btn) return;
      const gate = this._resolveTaskProviderGate(provider);
      gates[provider] = gate;
      const span = btn.querySelector(":scope > span:not(.provider-tab-lock)");
      const labelKeys = {
        flow: ["gen.providerFlow", "Flow"],
        chatgpt: ["gen.providerChatGPT", "ChatGPT"],
        grok: ["gen.providerGrok", "Grok"],
        gemini: ["gen.providerGemini", "Gemini"],
      };
      const [labelKey, fallbackLabel] = labelKeys[provider] || [null, provider];
      const baseLabel =
        window.ProviderMeta?.getName?.(provider) ||
        (labelKey ? t(labelKey) : null) ||
        fallbackLabel;
      if (span) span.textContent = baseLabel;
      let lockIcon = btn.querySelector(".provider-tab-lock");
      if (gate.locked) {
        btn.classList.add("provider-tab-locked");
        btn.setAttribute("aria-disabled", "true");
        btn.setAttribute("title", gate.tooltip);
        btn.setAttribute("data-tooltip", gate.tooltip);
        btn.setAttribute("data-lock-reason", gate.reason || "");
        if (!lockIcon) {
          lockIcon = document.createElement("span");
          lockIcon.className = "provider-tab-lock";
          lockIcon.innerHTML =
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="#eab308" style="margin-left:4px;vertical-align:-1px;"><path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z"/></svg>';
          btn.appendChild(lockIcon);
        }
      } else {
        btn.classList.remove("provider-tab-locked");
        btn.removeAttribute("aria-disabled");
        btn.removeAttribute("title");
        btn.removeAttribute("data-tooltip");
        btn.removeAttribute("data-lock-reason");
        if (lockIcon) lockIcon.remove();
      }
    });
    const currentProvider = providerHidden.value;
    const currentGate = gates[currentProvider];
    if (
      currentGate?.locked &&
      currentGate.reason === "feature" &&
      currentProvider !== "flow"
    ) {
      providerHidden.value = "flow";
      providerTabs.querySelectorAll(".provider-tab").forEach((b) => {
        const isActive = b.dataset.provider === "flow";
        b.classList.toggle("provider-tab--active", isActive);
        b.setAttribute("aria-selected", isActive ? "true" : "false");
      });
      if (typeof this._renderTaskFormByProvider === "function") {
        this._renderTaskFormByProvider("flow");
      }
    }
  }
  _updateAutoDownloadToggle() {
    const toggle = this.overlay?.querySelector("#taskAutoDownload");
    const label = toggle?.closest(".toolbar-toggle");
    const resWrap = this.overlay?.querySelector("#taskDownloadResWrap");
    const videoResWrap = this.overlay?.querySelector(
      "#taskVideoDownloadResWrap",
    );
    if (!toggle || !label) return;
    const canUse = window.featureGate?.canUse("auto_download") ?? false;
    if (canUse) {
      toggle.disabled = false;
      label.classList.remove("feature-disabled");
      label.removeAttribute("title");
      (
        label.querySelector(".premium-crown") ||
        label.parentElement?.querySelector(".premium-crown")
      )?.remove();
    } else {
      toggle.disabled = true;
      toggle.checked = false;
      label.classList.add("feature-disabled");
      label.setAttribute("title", t("tasks.premiumRequired"));
      if (typeof window._ensurePremiumCrown === "function") {
        window._ensurePremiumCrown(label);
      }
      resWrap?.classList.add("hidden");
      videoResWrap?.classList.add("hidden");
    }
  }
  _renderExistingRefPreview(refFileIds) {
    if (!refFileIds) return;
    this._renderTaskRefPreview();
  }
  _bindTaskFramePicker(frameNum) {
    const dropzone = this.overlay?.querySelector(
      `#taskFrame${frameNum}PickBtn`,
    );
    if (!dropzone) return;
    dropzone.addEventListener("click", () =>
      this._openTaskFramePicker(frameNum),
    );
    if (this.mode === "edit" && this.task) {
      const fieldName = frameNum === 1 ? "frame_1_file_id" : "frame_2_file_id";
      const fieldThumb =
        frameNum === 1 ? "frame_1_thumbnail" : "frame_2_thumbnail";
      const fileId = this.task[fieldName];
      const thumbnail =
        this.task[fieldThumb] ||
        this._taskTileCache?.[fileId]?.thumbnail ||
        null;
      if (fileId) {
        this._setTaskFrameImage(frameNum, fileId, thumbnail);
      }
    }
  }
  _openTaskFramePicker(frameNum) {
    const fileIdInput = this.overlay?.querySelector(
      `#taskFrame${frameNum}FileId`,
    );
    const existingId = (fileIdInput?.value || "").trim();
    if (window.imagePickerModal) {
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
                name: img.file.name,
              });
              if (!this._taskTileCache) this._taskTileCache = {};
              this._taskTileCache[key] = {
                thumbnail: img.thumbnail,
                file_name: "",
              };
              if (window.ImmediateUploader) {
                ImmediateUploader.upload(img.file, img.thumbnail, {
                  key,
                }).catch(() => {});
              } else if (window.PendingUploadStore) {
                PendingUploadStore.saveLightweight(key, {
                  thumbnail: img.thumbnail,
                  fileName: img.file.name,
                  fileSize: img.file.size,
                  fileType: img.file.type,
                });
              }
              img.fileId = key;
              this._modalUploadKeys?.add(key);
            } else if (
              img.source === "album" &&
              window.ImagePickerModal?.prepareAlbumImageForRef
            ) {
              try {
                const prepared =
                  await window.ImagePickerModal.prepareAlbumImageForRef(img);
                if (prepared) {
                  const key = prepared.key;
                  if (!this._taskTileCache) this._taskTileCache = {};
                  let thumb = img.thumbnail;
                  if (img.thumbnail_url) {
                    thumb = img.thumbnail_url;
                  } else if (img.album_image_id && window.ImageStore) {
                    try {
                      const blobUrl = await window.ImageStore.getThumbnail(
                        img.album_image_id,
                      );
                      if (blobUrl) thumb = blobUrl;
                    } catch (e) {}
                  }
                  this._taskTileCache[key] = {
                    thumbnail: thumb,
                    file_name: prepared.file_name || "",
                  };
                  if (key.startsWith("upload_")) {
                    const pendingFile =
                      window.pendingUploadFiles?.get(key)?.file;
                    if (pendingFile && window.ImmediateUploader) {
                      ImmediateUploader.upload(pendingFile, img.thumbnail, {
                        key,
                      }).catch(() => {});
                    }
                    this._modalUploadKeys?.add(key);
                  }
                  img.fileId = key;
                  img.thumbnail = thumb;
                }
              } catch (err) {
                console.error(
                  "[TaskModal] L\u1ED7i chu\u1EA9n b\u1ECB \u1EA3nh album cho frame:",
                  err,
                );
              }
            } else {
              if (!this._taskTileCache) this._taskTileCache = {};
              if (img.fileId && img.thumbnail) {
                this._taskTileCache[img.fileId] = {
                  thumbnail: img.thumbnail,
                  file_name: img.file_name || "",
                };
              }
            }
            this._registerTaskFrameSource(img.fileId, img);
            this._setTaskFrameImage(frameNum, img.fileId, img.thumbnail);
          }
        },
      });
    }
  }
  _setTaskFrameImage(frameNum, fileId, thumbnail) {
    const input = this.overlay?.querySelector(`#taskFrame${frameNum}FileId`);
    const body = this.overlay?.querySelector(`#taskFrame${frameNum}Body`);
    const slot = this.overlay?.querySelector(`#taskFrame${frameNum}Slot`);
    if (input) input.value = fileId || "";
    if (body) {
      if (fileId) {
        const isPending = fileId.startsWith("upload_");
        const isUploading =
          isPending && window.ImmediateUploader?.isUploading(fileId);
        const thumbSrc =
          thumbnail ||
          window.pendingUploadFiles?.get(fileId)?.thumbnail ||
          this._taskTileCache?.[fileId]?.thumbnail ||
          "";
        slot?.classList.add("has-image");
        body.innerHTML = `
          <div class="frame-thumb-wrap ${isUploading ? "uploading" : ""}" data-file-id="${this.escapeAttr(fileId)}">
            ${thumbSrc ? `<img src="${thumbSrc}" alt="Frame ${frameNum}" />` : `<div class="frame-thumb-fallback">${(fileId || "").substring(0, 12)}</div>`}
            <div class="ref-thumb-remove" title="${t("tasks.removeTitle")}">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </div>
          </div>
        `;
        const removeBtn = body.querySelector(".ref-thumb-remove");
        if (removeBtn) {
          removeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (isPending && window.ImmediateUploader) {
              ImmediateUploader.cancel(fileId);
            }
            this._modalUploadKeys?.delete(fileId);
            this._setTaskFrameImage(frameNum, "", "");
          });
        }
        const thumbWrap = body.querySelector(".frame-thumb-wrap");
        if (thumbWrap && !isUploading) {
          thumbWrap.addEventListener("click", (e) => {
            if (e.target.closest(".ref-thumb-remove")) return;
            this._openTaskFramePicker(frameNum);
          });
        }
      } else {
        slot?.classList.remove("has-image");
        body.innerHTML = `
          <div class="frame-dropzone" id="taskFrame${frameNum}PickBtn">
            <svg class="frame-dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
            <span class="frame-dropzone-text">${window.I18n?.t("gen.addFrame") || "Add"}</span>
          </div>
        `;
        const dropzone = body.querySelector(".frame-dropzone");
        if (dropzone) {
          dropzone.addEventListener("click", () =>
            this._openTaskFramePicker(frameNum),
          );
        }
      }
    }
  }
  _reRenderFrameUploading() {
    for (const fNum of [1, 2]) {
      const frameInput = this.overlay?.querySelector(`#taskFrame${fNum}FileId`);
      const fid = frameInput?.value?.trim();
      if (fid && fid.startsWith("upload_")) {
        const thumb =
          this._taskTileCache?.[fid]?.thumbnail ||
          window.pendingUploadFiles?.get(fid)?.thumbnail ||
          "";
        this._setTaskFrameImage(fNum, fid, thumb);
      }
    }
  }
  _updateTaskFrameMode() {
    if (this.overlay?.querySelector("#taskProvider")?.value === "grok") {
      this._updateGrokFrameControls();
      return;
    }
    const globalConfig = this.overlay?.querySelector("#taskGlobalFrameConfig");
    const perPromptContainer = this.overlay?.querySelector(
      "#taskPerPromptFramesContainer",
    );
    if (!globalConfig || !perPromptContainer) return;
    this._ensureTaskFrameSourcesFromAssignments();
    this._renderTaskFrameSourcePanel();
    this._bindTaskFrameSlotDrop(globalConfig);
    const isMultiPrompt = this._multiPromptEnabled;
    const mediaType = this.overlay?.querySelector("#taskMediaType")?.value;
    const videoInputType = this.overlay?.querySelector(
      "#taskVideoInputType",
    )?.value;
    const isVideoFrames = mediaType === "Video" && videoInputType === "Frames";
    if (!isVideoFrames) {
      globalConfig.classList.remove("hidden");
      perPromptContainer.classList.add("hidden");
      return;
    }
    const promptCount = this._getTaskPromptCount();
    if (isMultiPrompt && promptCount > 1) {
      globalConfig.classList.add("hidden");
      perPromptContainer.classList.remove("hidden");
      this._renderTaskPerPromptFrames(promptCount);
    } else {
      globalConfig.classList.remove("hidden");
      perPromptContainer.classList.add("hidden");
    }
  }
  _getTaskPromptCount() {
    const promptArea = this.overlay?.querySelector("#taskPrompt");
    const text = promptArea?.value?.trim() || "";
    if (!text) return 0;
    if (!this._multiPromptEnabled) return 1;
    return TaskModal._splitMultiPrompt(text).length;
  }
  _getTaskFrameSourceIds() {
    return (this.overlay?.querySelector("#taskFileIds")?.value || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  _ensureTaskFrameSourcesFromAssignments() {
    const input = this.overlay?.querySelector("#taskFileIds");
    if (!input) return;
    const ids = this._getTaskFrameSourceIds();
    for (const n of [1, 2]) {
      const id = this.overlay
        ?.querySelector(`#taskFrame${n}FileId`)
        ?.value?.trim();
      if (id && !ids.includes(id)) ids.push(id);
    }
    for (const frame of this._taskPerPromptFrameData || []) {
      if (frame?.frame1 && !ids.includes(frame.frame1)) ids.push(frame.frame1);
      if (frame?.frame2 && !ids.includes(frame.frame2)) ids.push(frame.frame2);
    }
    input.value = ids.join(", ");
  }
  _registerTaskFrameSource(fileId, img = {}) {
    if (!fileId) return;
    const input = this.overlay?.querySelector("#taskFileIds");
    if (!input) return;
    if (!this._taskTileCache) this._taskTileCache = {};
    const old = this._taskTileCache[fileId];
    const base = old && typeof old === "object" ? old : {};
    this._taskTileCache[fileId] = {
      ...base,
      thumbnail: img.thumbnail || img.thumbnail_url || base.thumbnail || "",
      file_name: img.file_name || base.file_name || "",
      type: "image",
    };
    const ids = this._getTaskFrameSourceIds();
    if (!ids.includes(fileId)) {
      ids.push(fileId);
      input.value = ids.join(", ");
    }
    this._renderTaskRefPreview();
    this._renderTaskFrameSourcePanel();
  }
  _renderTaskFrameSourcePanel() {
    const container = this.overlay?.querySelector(
      "#taskFrameSourcePanelContainer",
    );
    if (!container) return;
    const ids = this._getTaskFrameSourceIds();
    const removeLabel = this.escapeAttr(
      window.I18n?.t("workflow.mediaModal.removeImage") || "Remove image",
    );
    const items = ids
      .map((id, index) => {
        const pending = String(id).startsWith("upload_");
        const uploading = pending && window.ImmediateUploader?.isUploading(id);
        const cached = this._taskTileCache?.[id];
        const thumb =
          window.pendingUploadFiles?.get(id)?.thumbnail ||
          (typeof cached === "string" ? cached : cached?.thumbnail) ||
          (typeof this.task?.ref_thumbnails?.[id] === "string"
            ? this.task.ref_thumbnails[id]
            : this.task?.ref_thumbnails?.[id]?.thumbnail) ||
          "";
        return `<div class="ref-thumb frame-source-thumb ${pending ? "ref-thumb-pending is-local" : "is-flow"} ${uploading ? "ref-thumb-uploading" : ""}"
          draggable="true" data-task-frame-source-id="${this.escapeAttr(id)}" data-index="${index + 1}">
        <div class="ref-thumb-inner frame-source-thumb-inner">
          ${thumb ? `<img src="${this.escapeAttr(thumb)}" alt="" />` : `<span>${this.escapeHtml(id.substring(0, 8))}</span>`}
          <span class="ref-thumb-badge ${pending ? "" : "frame-source-flow-badge"}">${pending ? "Local" : "Flow"}</span>
        </div>
        <button type="button" class="frame-source-remove" data-task-frame-source-remove="${this.escapeAttr(id)}" data-tooltip="${removeLabel}" aria-label="${removeLabel}">\xD7</button>
      </div>`;
      })
      .join("");
    container.innerHTML = `<div class="frame-source-panel">
      <div class="frame-source-head"><span>${t("gen.refImages")} (${ids.length})</span></div>
      <button type="button" class="ref-btn-upload ref-btn-upload--wide frame-source-dropzone" data-task-frame-source-pick>
        <svg class="ref-btn-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15 8h.01"></path><path d="M12.5 21h-6.5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v6.5"></path><path d="M3 16l5-5c.928-.893 2.072-.893 3 0l3.5 3.5"></path><path d="M19 22v-6M22 19l-3-3-3 3"></path></svg>
        <span class="ref-btn-text">${t("gen.selectUploadImage")}</span>
      </button>
      ${ids.length >= 2 ? `<div class="frame-source-sort-hint ref-drag-hint"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12h20M12 2v20"></path><path d="m5 9-3 3 3 3M19 9l3 3-3 3M9 5l3-3 3 3M9 19l3 3 3-3"></path></svg><span>${t("gen.dragToSort")}</span></div>` : ""}
      ${
        ids.length
          ? `<div class="frame-source-list">${items}</div><div class="frame-source-actions">
        <button type="button" data-task-frame-bulk="start"><svg class="frame-slot-icon" viewBox="0 0 11 10" fill="none" stroke="currentColor" stroke-width="1"><path d="M3 .5v9M1.75.5h2.5M1.75 9.5h2.5M5 2.5h4c1 0 1.5.5 1.5 1.6v1.8c0 1.1-.5 1.6-1.6 1.6H5"></path></svg><span>${t("gen.frameAssignStart")}</span></button>
        <button type="button" data-task-frame-bulk="pairs"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="5" width="7" height="6" rx="1"></rect><rect x="14.5" y="5" width="7" height="6" rx="1"></rect><path d="M9.5 8h5"></path><rect x="2.5" y="15" width="7" height="6" rx="1"></rect><rect x="14.5" y="15" width="7" height="6" rx="1"></rect><path d="M9.5 18h5"></path></svg><span>${t("gen.frameAssignPairs")}</span></button>
        <button type="button" data-task-frame-bulk="chain"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="6" height="6" rx="1"></rect><rect x="15" y="13" width="6" height="6" rx="1"></rect><path d="M9 8h4a4 4 0 0 1 4 4v1M14 11l3 3 3-3"></path></svg><span>${t("gen.frameBuildChain")}</span></button>
        <button type="button" data-task-frame-bulk="clear"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7l1-2h4l1 2M6 7l1 13h10l1-13M10 11v5M14 11v5"></path></svg><span>${t("common.clear")}</span></button>
      </div>`
          : ""
      }
    </div>`;
    container.onclick = (e) => this._handleTaskFrameSourceClick(e);
    container.ondragstart = (e) => this._handleTaskFrameSourceDragStart(e);
    container.ondragover = (e) => this._handleTaskFrameSourceDragOver(e);
    container.ondrop = (e) => this._handleTaskFrameSourceDrop(e);
  }
  _handleTaskFrameSourceClick(e) {
    const remove = e.target.closest("[data-task-frame-source-remove]");
    if (remove) {
      const id = remove.dataset.taskFrameSourceRemove;
      const input = this.overlay?.querySelector("#taskFileIds");
      if (input)
        input.value = this._getTaskFrameSourceIds()
          .filter((item) => item !== id)
          .join(", ");
      for (let i = 0; i < this._taskPerPromptFrameData.length; i++) {
        if (this._taskPerPromptFrameData[i]?.frame1 === id)
          this._setTaskPerPromptFrame(i, 1, "", "");
        if (this._taskPerPromptFrameData[i]?.frame2 === id)
          this._setTaskPerPromptFrame(i, 2, "", "");
      }
      for (const n of [1, 2]) {
        if (this.overlay?.querySelector(`#taskFrame${n}FileId`)?.value === id)
          this._setTaskFrameImage(n, "", "");
      }
      if (id.startsWith("upload_")) window.ImmediateUploader?.cancel(id);
      this._renderTaskRefPreview();
      this._renderTaskFrameSourcePanel();
      return;
    }
    if (e.target.closest("[data-task-frame-source-pick]")) {
      this._taskFrameSourcePickerRequested = true;
      this.overlay?.querySelector("#taskOpenImagePickerBtn")?.click();
      return;
    }
    const bulk = e.target.closest("[data-task-frame-bulk]");
    if (bulk) this._assignTaskFrameSources(bulk.dataset.taskFrameBulk);
  }
  _assignTaskFrameSources(mode) {
    const ids = this._getTaskFrameSourceIds();
    const count = this._getTaskPromptCount();
    const multi = this._multiPromptEnabled && count > 1;
    if (!multi) {
      if (mode === "clear") {
        this._setTaskFrameImage(1, "", "");
        this._setTaskFrameImage(2, "", "");
      }
      if (mode === "start" && ids[0])
        this._setTaskFrameImage(
          1,
          ids[0],
          this._taskTileCache?.[ids[0]]?.thumbnail || "",
        );
      if ((mode === "chain" || mode === "pairs") && ids[0]) {
        this._setTaskFrameImage(
          1,
          ids[0],
          this._taskTileCache?.[ids[0]]?.thumbnail || "",
        );
        this._setTaskFrameImage(
          2,
          ids[1] || "",
          this._taskTileCache?.[ids[1]]?.thumbnail || "",
        );
      }
      return;
    }
    while (this._taskPerPromptFrameData.length < count)
      this._taskPerPromptFrameData.push({
        frame1: "",
        frame2: "",
        frame1Thumb: "",
        frame2Thumb: "",
      });
    for (let i = 0; i < count; i++) {
      if (mode === "clear") {
        this._setTaskPerPromptFrame(i, 1, "", "");
        this._setTaskPerPromptFrame(i, 2, "", "");
        continue;
      }
      if (mode === "start" && ids[i] && !this._taskPerPromptFrameData[i].frame1)
        this._setTaskPerPromptFrame(
          i,
          1,
          ids[i],
          this._taskTileCache?.[ids[i]]?.thumbnail || "",
        );
      if (mode === "chain") {
        if (ids[i] && !this._taskPerPromptFrameData[i].frame1)
          this._setTaskPerPromptFrame(
            i,
            1,
            ids[i],
            this._taskTileCache?.[ids[i]]?.thumbnail || "",
          );
        if (ids[i + 1] && !this._taskPerPromptFrameData[i].frame2)
          this._setTaskPerPromptFrame(
            i,
            2,
            ids[i + 1],
            this._taskTileCache?.[ids[i + 1]]?.thumbnail || "",
          );
      }
      if (mode === "pairs") {
        const startId = ids[i * 2];
        const endId = ids[i * 2 + 1];
        if (startId && !this._taskPerPromptFrameData[i].frame1)
          this._setTaskPerPromptFrame(
            i,
            1,
            startId,
            this._taskTileCache?.[startId]?.thumbnail || "",
          );
        if (endId && !this._taskPerPromptFrameData[i].frame2)
          this._setTaskPerPromptFrame(
            i,
            2,
            endId,
            this._taskTileCache?.[endId]?.thumbnail || "",
          );
      }
    }
    this._renderTaskPerPromptFrames(count);
  }
  _handleTaskFrameSourceDragStart(e) {
    const item = e.target.closest("[data-task-frame-source-id]");
    if (!item) return;
    e.dataTransfer.setData(
      "application/x-toby-task-frame-id",
      item.dataset.taskFrameSourceId,
    );
    e.dataTransfer.setData("text/plain", item.dataset.taskFrameSourceId);
    item.classList.add("dragging");
  }
  _handleTaskFrameSourceDragOver(e) {
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault();
      e.currentTarget
        .querySelector("[data-task-frame-source-pick]")
        ?.classList.add("drag-over");
      return;
    }
    if (e.target.closest("[data-task-frame-source-id]")) e.preventDefault();
  }
  async _handleTaskFrameSourceDrop(e) {
    e.preventDefault();
    e.currentTarget
      .querySelector("[data-task-frame-source-pick]")
      ?.classList.remove("drag-over");
    const files = Array.from(e.dataTransfer?.files || []).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (files.length) {
      await this._handleDroppedFiles(files);
      this._renderTaskFrameSourcePanel();
      return;
    }
    const dragged =
      e.dataTransfer.getData("application/x-toby-task-frame-id") ||
      e.dataTransfer.getData("text/plain");
    const target = e.target.closest("[data-task-frame-source-id]")?.dataset
      .taskFrameSourceId;
    if (dragged && target && dragged !== target) {
      this._reorderRefIds(dragged, target);
      this._renderTaskFrameSourcePanel();
    }
  }
  static _splitMultiPrompt(text) {
    if (!text) return [];
    return text
      .split(/\n\s*\n/)
      .map((b) => b.trim().replace(/\\n/g, "\n"))
      .filter((b) => b.length > 0);
  }
  _getTaskPromptPreviews() {
    const promptArea = this.overlay?.querySelector("#taskPrompt");
    const text = promptArea?.value?.trim() || "";
    if (!text) return [];
    const prompts = this._multiPromptEnabled
      ? TaskModal._splitMultiPrompt(text)
      : [text];
    return prompts.map((p) => p.trim().substring(0, 40).replace(/\n/g, " "));
  }
  _renderTaskPerPromptFrames(promptCount) {
    const container = this.overlay?.querySelector(
      "#taskPerPromptFramesContainer",
    );
    if (!container) return;
    const previews = this._getTaskPromptPreviews();
    while (this._taskPerPromptFrameData.length < promptCount) {
      this._taskPerPromptFrameData.push({
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
      const data = this._taskPerPromptFrameData[idx];
      const preview = previews[idx] || "";
      html += `
        <div class="per-prompt-frame-pair" data-prompt-index="${idx}">
          <div class="per-prompt-frame-header">
            <span class="per-prompt-frame-index">${idx + 1}</span>
            <span class="per-prompt-frame-prompt-preview" title="${this.escapeAttr(preview)}">${this.escapeAttr(preview)}</span>
          </div>
          <div class="per-prompt-frame-slots">
            <div class="frame-slot" data-prompt-idx="${idx}" data-frame-num="1">
              <div class="frame-slot-header">${startIconSvg}<span class="frame-slot-label">${t("tasks.frameStart")}</span></div>
              <div class="frame-slot-body" id="taskPpFrame_${idx}_1_body">
                ${data.frame1 ? this._buildTaskFrameThumbHtml(idx, 1, data.frame1, data.frame1Thumb) : `<div class="frame-dropzone" data-tpp-pick="${idx}_1">${dropzoneSvg}<span class="frame-dropzone-text">${window.I18n?.t("gen.addFrame") || "Add"}</span></div>`}
              </div>
            </div>
            <div class="frame-slot" data-prompt-idx="${idx}" data-frame-num="2">
              <div class="frame-slot-header">${endIconSvg}<span class="frame-slot-label">${t("tasks.frameEnd")}</span></div>
              <div class="frame-slot-body" id="taskPpFrame_${idx}_2_body">
                ${data.frame2 ? this._buildTaskFrameThumbHtml(idx, 2, data.frame2, data.frame2Thumb) : `<div class="frame-dropzone" data-tpp-pick="${idx}_2">${dropzoneSvg}<span class="frame-dropzone-text">${window.I18n?.t("gen.addFrame") || "Add"}</span></div>`}
              </div>
            </div>
          </div>
        </div>`;
    }
    container.innerHTML = html;
    container.removeEventListener(
      "click",
      this._taskPerPromptFrameClickHandler,
    );
    this._taskPerPromptFrameClickHandler = (e) =>
      this._handleTaskPerPromptFrameClick(e);
    container.addEventListener("click", this._taskPerPromptFrameClickHandler);
    this._bindTaskFrameSlotDrop(container);
  }
  _bindTaskFrameSlotDrop(container) {
    if (!container) return;
    container.ondragover = (e) => {
      const slot = e.target.closest(".frame-slot");
      if (!slot) return;
      e.preventDefault();
      slot.classList.add("frame-drag-over");
    };
    container.ondragleave = (e) =>
      e.target.closest(".frame-slot")?.classList.remove("frame-drag-over");
    container.ondrop = async (e) => {
      const slot = e.target.closest(".frame-slot");
      if (!slot) return;
      e.preventDefault();
      slot.classList.remove("frame-drag-over");
      let fileId =
        e.dataTransfer.getData("application/x-toby-task-frame-id") ||
        e.dataTransfer.getData("text/plain");
      if (!fileId && e.dataTransfer.files?.length) {
        const file = Array.from(e.dataTransfer.files).find((item) =>
          item.type.startsWith("image/"),
        );
        if (!file) return;
        const added = await this._handleDroppedFiles([file]);
        fileId = added?.[0] || "";
      }
      if (!fileId) return;
      const thumb =
        window.pendingUploadFiles?.get(fileId)?.thumbnail ||
        this._taskTileCache?.[fileId]?.thumbnail ||
        "";
      const globalMatch = slot.id?.match(/^taskFrame([12])Slot$/);
      if (globalMatch)
        this._setTaskFrameImage(Number(globalMatch[1]), fileId, thumb);
      else
        this._setTaskPerPromptFrame(
          Number(slot.dataset.promptIdx),
          Number(slot.dataset.frameNum),
          fileId,
          thumb,
        );
      this._registerTaskFrameSource(fileId, { thumbnail: thumb });
    };
  }
  _buildTaskFrameThumbHtml(promptIdx, frameNum, fileId, thumbnail) {
    const isPending = fileId.startsWith("upload_");
    const isUploading =
      isPending && window.ImmediateUploader?.isUploading(fileId);
    const thumbSrc =
      thumbnail ||
      this._taskTileCache?.[fileId]?.thumbnail ||
      window.pendingUploadFiles?.get(fileId)?.thumbnail ||
      "";
    return `
      <div class="frame-thumb-wrap ${isUploading ? "uploading" : ""}" data-file-id="${this.escapeAttr(fileId)}" data-tpp-pick="${promptIdx}_${frameNum}">
        ${thumbSrc ? `<img src="${thumbSrc}" alt="Frame ${frameNum}" />` : `<div class="frame-thumb-fallback">${(fileId || "").substring(0, 12)}</div>`}
        <div class="ref-thumb-remove" data-tpp-remove="${promptIdx}_${frameNum}" title="${t("tasks.removeTitle")}">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </div>
      </div>`;
  }
  _handleTaskPerPromptFrameClick(e) {
    const removeBtn = e.target.closest("[data-tpp-remove]");
    if (removeBtn) {
      e.stopPropagation();
      const [idx, fnum] = removeBtn.dataset.tppRemove.split("_").map(Number);
      this._setTaskPerPromptFrame(idx, fnum, "", "");
      return;
    }
    const pickEl = e.target.closest("[data-tpp-pick]");
    if (pickEl) {
      const [idx, fnum] = pickEl.dataset.tppPick.split("_").map(Number);
      this._openTaskPerPromptFramePicker(idx, fnum);
    }
  }
  _openTaskPerPromptFramePicker(promptIdx, frameNum) {
    if (!window.imagePickerModal) return;
    const data = this._taskPerPromptFrameData[promptIdx];
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
              name: img.file.name,
            });
            if (!this._taskTileCache) this._taskTileCache = {};
            this._taskTileCache[key] = {
              thumbnail: img.thumbnail,
              file_name: "",
            };
            if (window.ImmediateUploader) {
              ImmediateUploader.upload(img.file, img.thumbnail, { key }).catch(
                () => {},
              );
            }
            this._taskPerPromptFrameUploadKeys.set(key, {
              promptIndex: promptIdx,
              frameNum,
            });
            this._modalUploadKeys?.add(key);
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
                if (!this._taskTileCache) this._taskTileCache = {};
                let thumb = img.thumbnail;
                if (img.thumbnail_url) {
                  thumb = img.thumbnail_url;
                } else if (img.album_image_id && window.ImageStore) {
                  try {
                    const blobUrl = await window.ImageStore.getThumbnail(
                      img.album_image_id,
                    );
                    if (blobUrl) thumb = blobUrl;
                  } catch (e) {}
                }
                this._taskTileCache[key] = {
                  thumbnail: thumb,
                  file_name: prepared.file_name || "",
                };
                if (key.startsWith("upload_")) {
                  const pendingFile = window.pendingUploadFiles?.get(key)?.file;
                  if (pendingFile && window.ImmediateUploader) {
                    ImmediateUploader.upload(pendingFile, img.thumbnail, {
                      key,
                    }).catch(() => {});
                  }
                  this._taskPerPromptFrameUploadKeys.set(key, {
                    promptIndex: promptIdx,
                    frameNum,
                  });
                  this._modalUploadKeys?.add(key);
                }
                img.fileId = key;
                img.thumbnail = thumb;
              }
            } catch (err) {
              console.error(
                "[TaskModal] L\u1ED7i chu\u1EA9n b\u1ECB \u1EA3nh album cho per-prompt frame:",
                err,
              );
            }
          } else {
            if (!this._taskTileCache) this._taskTileCache = {};
            if (img.fileId && img.thumbnail) {
              this._taskTileCache[img.fileId] = {
                thumbnail: img.thumbnail,
                file_name: img.file_name || "",
              };
            }
          }
          this._registerTaskFrameSource(img.fileId, img);
          this._setTaskPerPromptFrame(
            promptIdx,
            frameNum,
            img.fileId,
            img.thumbnail,
          );
        }
      },
    });
  }
  _setTaskPerPromptFrame(promptIdx, frameNum, fileId, thumbnail) {
    while (this._taskPerPromptFrameData.length <= promptIdx) {
      this._taskPerPromptFrameData.push({
        frame1: "",
        frame2: "",
        frame1Thumb: "",
        frame2Thumb: "",
      });
    }
    const data = this._taskPerPromptFrameData[promptIdx];
    if (frameNum === 1) {
      data.frame1 = fileId || "";
      data.frame1Thumb = thumbnail || "";
    } else {
      data.frame2 = fileId || "";
      data.frame2Thumb = thumbnail || "";
    }
    if (fileId && thumbnail) {
      if (!this._taskTileCache) this._taskTileCache = {};
      this._taskTileCache[fileId] = {
        ...(this._taskTileCache[fileId] || {}),
        thumbnail,
      };
    }
    const body = this.overlay?.querySelector(
      `#taskPpFrame_${promptIdx}_${frameNum}_body`,
    );
    if (body) {
      if (fileId) {
        body.innerHTML = this._buildTaskFrameThumbHtml(
          promptIdx,
          frameNum,
          fileId,
          thumbnail,
        );
      } else {
        const dropzoneSvg =
          '<svg class="frame-dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>';
        body.innerHTML = `<div class="frame-dropzone" data-tpp-pick="${promptIdx}_${frameNum}">${dropzoneSvg}<span class="frame-dropzone-text">${window.I18n?.t("gen.addFrame") || "Add"}</span></div>`;
      }
    }
  }
  _handleTaskPerPromptFrameUploadCompleted(data) {
    if (!data?.key || !data?.tile_id) return;
    if (!this._taskPerPromptFrameUploadKeys.has(data.key)) return;
    const { promptIndex, frameNum } = this._taskPerPromptFrameUploadKeys.get(
      data.key,
    );
    this._taskPerPromptFrameUploadKeys.delete(data.key);
    const frameData = this._taskPerPromptFrameData[promptIndex];
    if (!frameData) return;
    const prop = frameNum === 1 ? "frame1" : "frame2";
    const thumbProp = frameNum === 1 ? "frame1Thumb" : "frame2Thumb";
    if (frameData[prop] === data.key) frameData[prop] = data.tile_id;
    if (!this._taskTileCache) this._taskTileCache = {};
    if (this._taskTileCache[data.key]) {
      this._taskTileCache[data.tile_id] = this._taskTileCache[data.key];
      delete this._taskTileCache[data.key];
    }
    if (data.thumbnail_url) {
      this._taskTileCache[data.tile_id] = {
        ...(this._taskTileCache[data.tile_id] || {}),
        thumbnail: data.thumbnail_url,
      };
      frameData[thumbProp] = data.thumbnail_url;
    }
    if (data.file_name) {
      this._taskTileCache[data.tile_id] = {
        ...(this._taskTileCache[data.tile_id] || {}),
        file_name: data.file_name,
      };
    }
    const thumb =
      this._taskTileCache[data.tile_id]?.thumbnail ||
      data.thumbnail_url ||
      frameData[thumbProp] ||
      "";
    const sourceInput = this.overlay?.querySelector("#taskFileIds");
    if (sourceInput) {
      const sourceIds = this._getTaskFrameSourceIds().map((id) =>
        id === data.key ? data.tile_id : id,
      );
      sourceInput.value = [...new Set(sourceIds)].join(", ");
    }
    for (let i = 0; i < this._taskPerPromptFrameData.length; i++) {
      const pair = this._taskPerPromptFrameData[i];
      if (pair?.frame1 === data.key)
        this._setTaskPerPromptFrame(
          i,
          1,
          data.tile_id,
          thumb || pair.frame1Thumb,
        );
      if (pair?.frame2 === data.key)
        this._setTaskPerPromptFrame(
          i,
          2,
          data.tile_id,
          thumb || pair.frame2Thumb,
        );
    }
    for (const frameNumber of [1, 2]) {
      const input = this.overlay?.querySelector(
        `#taskFrame${frameNumber}FileId`,
      );
      if (input?.value === data.key)
        this._setTaskFrameImage(frameNumber, data.tile_id, thumb);
    }
    window.pendingUploadFiles?.delete(data.key);
    if (window.ImmediateUploader) ImmediateUploader.clearResult?.(data.key);
    this._setTaskPerPromptFrame(promptIndex, frameNum, data.tile_id, thumb);
    this._renderTaskFrameSourcePanel();
  }
  _handleTaskPerPromptFrameUploadFailed(data) {
    if (!data?.key) return;
    if (!this._taskPerPromptFrameUploadKeys.has(data.key)) return;
    const { promptIndex, frameNum } = this._taskPerPromptFrameUploadKeys.get(
      data.key,
    );
    this._taskPerPromptFrameUploadKeys.delete(data.key);
    const frameData = this._taskPerPromptFrameData[promptIndex];
    if (frameData) {
      const prop = frameNum === 1 ? "frame1" : "frame2";
      const thumbProp = frameNum === 1 ? "frame1Thumb" : "frame2Thumb";
      this._setTaskPerPromptFrame(
        promptIndex,
        frameNum,
        frameData[prop],
        frameData[thumbProp],
      );
    }
  }
  _buildFramePairsForSave(mediaType, videoInputType, isMultiPrompt, prompts) {
    const isVideoFrames = mediaType === "Video" && videoInputType === "Frames";
    if (!isVideoFrames || !isMultiPrompt || !prompts || prompts.length <= 1)
      return null;
    if (this._taskPerPromptFrameData.length === 0) return null;
    const pairs = [];
    for (let i = 0; i < prompts.length; i++) {
      const data = this._taskPerPromptFrameData[i] || {
        frame1: "",
        frame2: "",
        frame1Thumb: "",
        frame2Thumb: "",
      };
      const getInfo = (fid) => {
        if (!fid) return { thumbnail: "", file_name: "" };
        const cached = this._taskTileCache?.[fid];
        return {
          thumbnail:
            data[fid === data.frame1 ? "frame1Thumb" : "frame2Thumb"] ||
            cached?.thumbnail ||
            "",
          file_name: cached?.file_name || "",
        };
      };
      const f1Info = getInfo(data.frame1);
      const f2Info = getInfo(data.frame2);
      pairs.push({
        frame1: data.frame1 || "",
        frame2: data.frame2 || "",
        frame1Thumb: f1Info.thumbnail,
        frame2Thumb: f2Info.thumbnail,
        frame1FileName: f1Info.file_name,
        frame2FileName: f2Info.file_name,
      });
    }
    return pairs;
  }
  async handleImagePickerConfirm(images) {
    const fileIdsInput = this.overlay?.querySelector("#taskFileIds");
    if (!fileIdsInput) return;
    const existingIds = fileIdsInput.value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const flowImages = images.filter(
      (img) => img.source === "flow" || img.source === "existing",
    );
    const uploadImages = images.filter(
      (img) => img.source === "upload" && img.file,
    );
    const newIds = flowImages.map((img) => img.fileId).filter(Boolean);
    const resolvedSelection = new Map(
      flowImages.map((img) => [img, img.fileId]),
    );
    if (!this._taskTileCache) this._taskTileCache = {};
    for (const img of flowImages) {
      if (!img.fileId) continue;
      if (img.thumbnail || img.video_url) {
        this._taskTileCache[img.fileId] = {
          thumbnail: img.thumbnail || "",
          ...(img.source_thumbnail && {
            source_thumbnail: img.source_thumbnail,
          }),
          file_name: img.file_name || "",
          type: img.type || "image",
          ...(img.video_url && { video_url: img.video_url }),
          ...(img.media_uuid && { media_uuid: img.media_uuid }),
          ...(img.persistent_media_id && {
            persistent_media_id: img.persistent_media_id,
          }),
          ...(img.identity_durability && {
            identity_durability: img.identity_durability,
          }),
          ...(img.identity_kind && { identity_kind: img.identity_kind }),
          ...(Array.isArray(img.identity_aliases) && {
            identity_aliases: img.identity_aliases,
          }),
          ...(img.api_driver && { api_driver: img.api_driver }),
          ...(img.project_id && { project_id: img.project_id }),
          ...(img.protocol_revision && {
            protocol_revision: img.protocol_revision,
          }),
          ...(img.protocol_fingerprint && {
            protocol_fingerprint: img.protocol_fingerprint,
          }),
          ...(img.display_name && { display_name: img.display_name }),
        };
      }
    }
    const albumImages = images.filter((img) => img.source === "album");
    if (albumImages.length > 0) {
      for (const img of albumImages) {
        try {
          const prepared = await ImagePickerModal.prepareAlbumImageForRef(img);
          if (!prepared) continue;
          const key = prepared.key;
          this._taskTileCache[key] = {
            thumbnail: img.thumbnail,
            file_name: prepared.file_name || "",
            type: img.type || "image",
          };
          if (img.name) {
            this._refImageNames[key] = img.name;
          }
          newIds.push(key);
          resolvedSelection.set(img, key);
          if (key.startsWith("upload_")) {
            const pendingFile = window.pendingUploadFiles?.get(key)?.file;
            if (pendingFile && window.ImmediateUploader) {
              ImmediateUploader.upload(pendingFile, img.thumbnail, {
                key,
              }).catch(() => {});
            }
            this._modalUploadKeys?.add(key);
          }
        } catch (err) {
          console.error(
            "[TaskModal] L\u1ED7i chu\u1EA9n b\u1ECB \u1EA3nh album:",
            err,
          );
        }
      }
    }
    if (uploadImages.length > 0) {
      if (!window.pendingUploadFiles) window.pendingUploadFiles = new Map();
      for (const img of uploadImages) {
        const key =
          img.fileId ||
          `upload_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        window.pendingUploadFiles.set(key, {
          file: img.file,
          thumbnail: img.thumbnail,
          name: img.file.name,
        });
        this._taskTileCache[key] = {
          thumbnail: img.thumbnail,
          file_name: "",
          type: img.type || "image",
        };
        if (window.ImmediateUploader) {
          ImmediateUploader.upload(img.file, img.thumbnail, { key }).catch(
            () => {},
          );
        } else if (window.PendingUploadStore) {
          PendingUploadStore.saveLightweight(key, {
            thumbnail: img.thumbnail,
            fileName: img.file.name,
            fileSize: img.file.size,
            fileType: img.file.type,
          });
        }
        newIds.push(key);
        resolvedSelection.set(img, key);
        this._modalUploadKeys?.add(key);
      }
    }
    if (this.overlay?.querySelector("#taskProvider")?.value === "grok") {
      const orderedIds = images
        .map((img) => resolvedSelection.get(img))
        .filter(Boolean);
      if (
        this.overlay?.querySelector("#taskGrokVideoInputType")?.value ===
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
    const removedIds = existingIds.filter((id) => !selectedIdSet.has(id));
    fileIdsInput.value = mergedIds.join(", ");
    for (const id of removedIds) {
      delete this._taskTileCache?.[id];
      delete this._refImageNames?.[id];
      if (this.task?.ref_image_names) delete this.task.ref_image_names[id];
      window.MediaRegistry?.delete?.(id);
      if (id.startsWith("upload_")) {
        window.ImmediateUploader?.cancel?.(id);
        window.pendingUploadFiles?.delete(id);
        window.PendingUploadStore?.remove?.(id).catch?.(() => {});
        this._modalUploadKeys?.delete(id);
        this._taskPerPromptFrameUploadKeys?.delete(id);
      }
      for (
        let promptIndex = 0;
        promptIndex < (this._taskPerPromptFrameData?.length || 0);
        promptIndex++
      ) {
        const pair = this._taskPerPromptFrameData[promptIndex];
        if (pair?.frame1 === id)
          this._setTaskPerPromptFrame(promptIndex, 1, "", "");
        if (pair?.frame2 === id)
          this._setTaskPerPromptFrame(promptIndex, 2, "", "");
      }
      for (const frameNum of [1, 2]) {
        if (
          this.overlay?.querySelector(`#taskFrame${frameNum}FileId`)?.value ===
          id
        ) {
          this._setTaskFrameImage(frameNum, "", "");
        }
      }
    }
    for (let i = 0; i < newIds.length; i++) {
      const id = newIds[i];
      if (!this._refImageNames[id] && !this.task?.ref_image_names?.[id]) {
        const _bn = String(
          window.pendingUploadFiles?.get(id)?.name || "",
        ).replace(/\.[^/.]+$/, "");
        const idx = mergedIds.indexOf(id) + 1;
        this._refImageNames[id] = _bn || `img_${idx}`;
      }
    }
    this._renderTaskRefPreview();
    this._renderTaskFrameSourcePanel();
    this._refreshMentionHelper();
    this._updateDragHint();
    this._updateButtonState();
  }
  async _handleDroppedFiles(files) {
    const fileIdsInput = this.overlay?.querySelector("#taskFileIds");
    if (!fileIdsInput) return [];
    if (!window.pendingUploadFiles) window.pendingUploadFiles = new Map();
    if (!this._taskTileCache) this._taskTileCache = {};
    const existingIds = fileIdsInput.value
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
      window.pendingUploadFiles.set(key, { file, thumbnail, name: file.name });
      this._taskTileCache[key] = { thumbnail, file_name: "" };
      if (window.ImmediateUploader) {
        ImmediateUploader.upload(file, thumbnail, { key }).catch(() => {});
      } else if (window.PendingUploadStore) {
        PendingUploadStore.saveLightweight(key, {
          thumbnail,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
        });
      }
      newIds.push(key);
      this._modalUploadKeys?.add(key);
    }
    const mergedIds = [...new Set([...existingIds, ...newIds])];
    fileIdsInput.value = mergedIds.join(", ");
    for (const id of newIds) {
      if (!this._refImageNames[id]) {
        const _bn = String(
          window.pendingUploadFiles?.get(id)?.name || "",
        ).replace(/\.[^/.]+$/, "");
        const idx = mergedIds.indexOf(id) + 1;
        this._refImageNames[id] = _bn || `img_${idx}`;
      }
    }
    this._renderTaskRefPreview();
    this._renderTaskFrameSourcePanel();
    this._refreshMentionHelper();
    this._updateDragHint();
    this._updateButtonState();
    return newIds;
  }
  _syncUploadKeyToTileId(data) {
    const {
      key,
      tile_id,
      file_name,
      thumbnail_url,
      media_uuid,
      persistent_media_id,
      type,
      video_url,
    } = data;
    const fileIdsInput = this.overlay?.querySelector("#taskFileIds");
    if (fileIdsInput) {
      const ids = fileIdsInput.value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const idx = ids.indexOf(key);
      if (idx !== -1) {
        ids[idx] = tile_id;
        fileIdsInput.value = ids.join(", ");
      }
    }
    this._modalUploadKeys.delete(key);
    if (!this._taskTileCache) this._taskTileCache = {};
    if (this._taskTileCache[key]) {
      this._taskTileCache[tile_id] = this._taskTileCache[key];
      delete this._taskTileCache[key];
    }
    if (thumbnail_url) {
      this._taskTileCache[tile_id] = {
        ...(this._taskTileCache[tile_id] || {}),
        thumbnail: thumbnail_url,
        file_name: file_name || "",
        ...(media_uuid && { media_uuid }),
        ...(persistent_media_id && { persistent_media_id }),
      };
    }
    if (file_name && this._taskTileCache[tile_id]) {
      this._taskTileCache[tile_id].file_name = file_name;
    }
    const uploadedRecord = this._taskTileCache[tile_id] || {};
    const resolvedUuid = [media_uuid, uploadedRecord.media_uuid, tile_id].find(
      (value) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          String(value || ""),
        ),
    );
    this._taskTileCache[tile_id] = {
      ...uploadedRecord,
      ...(resolvedUuid && { media_uuid: resolvedUuid }),
      ...(persistent_media_id && { persistent_media_id }),
      ...(type === "video" || uploadedRecord.type === "video"
        ? { type: "video" }
        : {}),
      ...(video_url && !String(video_url).startsWith("blob:") && { video_url }),
      ...(data.api_driver && { api_driver: data.api_driver }),
      ...(data.project_id && { project_id: data.project_id }),
      ...(data.identity_kind && { identity_kind: data.identity_kind }),
      ...(data.identity_durability && {
        identity_durability: data.identity_durability,
      }),
      ...(Array.isArray(data.identity_aliases) && {
        identity_aliases: data.identity_aliases,
      }),
      ...(data.protocol_revision && {
        protocol_revision: data.protocol_revision,
      }),
      ...(data.protocol_fingerprint && {
        protocol_fingerprint: data.protocol_fingerprint,
      }),
      ...(data.display_name && { display_name: data.display_name }),
    };
    window.MediaRegistry?.auditRefIdentity?.(
      "task:upload-cached",
      [{ ...this._taskTileCache[tile_id], id: tile_id }],
      { surface: "task" },
    );
    window.pendingUploadFiles?.delete(key);
    if (window.ImmediateUploader) {
      ImmediateUploader._results.delete(key);
      ImmediateUploader._fileRefs.delete(key);
    }
    if (window.TileCache) {
      if (file_name) window.TileCache.set(file_name, tile_id);
      if (thumbnail_url) window.TileCache.set(thumbnail_url, tile_id);
    }
    if (window.MediaRegistry) {
      if (thumbnail_url) MediaRegistry.setThumb(tile_id, thumbnail_url);
      MediaRegistry.setRefIdentity?.(tile_id, this._taskTileCache[tile_id]);
      if (file_name) MediaRegistry.setFileName(tile_id, file_name);
      MediaRegistry.deleteThumb?.(key);
      MediaRegistry.deleteFileName?.(key);
    }
    if (this._refImageNames[key]) {
      this._refImageNames[tile_id] = this._refImageNames[key];
      delete this._refImageNames[key];
    }
    for (const fNum of [1, 2]) {
      const frameInput = this.overlay?.querySelector(`#taskFrame${fNum}FileId`);
      if (frameInput && frameInput.value === key) {
        frameInput.value = tile_id;
        const thumb =
          thumbnail_url || this._taskTileCache?.[tile_id]?.thumbnail || "";
        this._setTaskFrameImage(fNum, tile_id, thumb);
      }
    }
    for (let i = 0; i < this._taskPerPromptFrameData.length; i++) {
      const frame = this._taskPerPromptFrameData[i];
      if (frame?.frame1 === key)
        this._setTaskPerPromptFrame(
          i,
          1,
          tile_id,
          thumbnail_url ||
            this._taskTileCache?.[tile_id]?.thumbnail ||
            frame.frame1Thumb,
        );
      if (frame?.frame2 === key)
        this._setTaskPerPromptFrame(
          i,
          2,
          tile_id,
          thumbnail_url ||
            this._taskTileCache?.[tile_id]?.thumbnail ||
            frame.frame2Thumb,
        );
    }
    this._renderTaskRefPreview();
    this._renderTaskFrameSourcePanel();
    this._formSnapshot = this._captureFormSnapshot();
    console.log(
      `[TaskModal] Synced upload key \u2192 tile_id: ${key.substring(0, 15)}... \u2192 ${tile_id.substring(0, 15)}...`,
    );
  }
  _isTaskImageResourceUrl(value) {
    try {
      const url = new URL(value);
      return (
        url.hostname === "flow-content.google" &&
        /^\/image\/[^/]+\/?$/.test(url.pathname)
      );
    } catch (_) {
      return false;
    }
  }
  _isFreshTaskVideoUrl(value) {
    if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return false;
    try {
      const expires = Number(new URL(value).searchParams.get("Expires"));
      return (
        !Number.isFinite(expires) ||
        expires <= 0 ||
        expires > Date.now() / 1e3 + 30
      );
    } catch (_) {
      return false;
    }
  }
  async _hydrateTaskVideoRefsOnOpen() {
    if (
      !this.overlay ||
      !this.task?.task_id ||
      !window.FlowApiFacade?.resolveMedia
    )
      return 0;
    const taskId = this.task.task_id;
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const ids = String(this.task.ref_file_ids || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const candidates = ids.filter((id) => {
      const saved = this.task.ref_thumbnails?.[id];
      const media = saved && typeof saved === "object" ? saved : {};
      const uuid = [media.media_uuid, id].find((value) =>
        uuidPattern.test(String(value || "")),
      );
      return (
        !!uuid &&
        (media.type === "video" || !!media.video_url) &&
        !this._isTaskImageResourceUrl(media.video_url) &&
        !this._isFreshTaskVideoUrl(media.video_url)
      );
    });
    if (!candidates.length) return 0;
    console.info(
      "[TaskRefVideoHydration]",
      JSON.stringify({ state: "open", taskId, candidates: candidates.length }),
    );
    const results = await Promise.allSettled(
      candidates.map((fileId) => {
        const existing = this._taskRefVideoHydrations?.get(fileId);
        if (existing) return existing;
        const promise = this._hydrateTaskVideoRef(fileId, taskId).finally(() =>
          this._taskRefVideoHydrations?.delete(fileId),
        );
        this._taskRefVideoHydrations?.set(fileId, promise);
        return promise;
      }),
    );
    return results.filter(
      (result) => result.status === "fulfilled" && result.value === true,
    ).length;
  }
  async _hydrateTaskVideoRef(fileId, taskId) {
    const originalOverlay = this.overlay;
    const delays = [0, 1500, 5e3];
    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (delays[attempt])
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      if (
        !this.overlay ||
        this.overlay !== originalOverlay ||
        this.task?.task_id !== taskId
      )
        return false;
      const saved = this.task.ref_thumbnails?.[fileId];
      const previous = saved && typeof saved === "object" ? saved : {};
      const mediaUuid = previous.media_uuid || fileId;
      const providerData = previous.api_driver
        ? {
            provider: "flow",
            api_driver: previous.api_driver,
            uuidLookup: true,
            ...(previous.project_id && { project_id: previous.project_id }),
            ...(previous.protocol_revision && {
              protocol_revision: previous.protocol_revision,
            }),
            ...(previous.protocol_fingerprint && {
              protocol_fingerprint: previous.protocol_fingerprint,
            }),
          }
        : null;
      const resolved = await window.FlowApiFacade.resolveMedia({
        mediaId: mediaUuid,
        mediaType: "video",
        providerData,
        thumbnail: previous,
      }).catch(() => null);
      if (
        !this.overlay ||
        this.overlay !== originalOverlay ||
        this.task?.task_id !== taskId
      )
        return false;
      if (!resolved?.url || this._isTaskImageResourceUrl(resolved.url)) {
        console.info(
          "[TaskRefVideoHydration]",
          JSON.stringify({
            state: "retry",
            taskId,
            mediaId: String(fileId).slice(0, 8),
            attempt: attempt + 1,
          }),
        );
        continue;
      }
      const portablePoster =
        [
          resolved.posterUrl,
          previous.source_thumbnail,
          previous.thumbnail,
        ].find((url) => typeof url === "string" && /^https?:\/\//i.test(url)) ||
        resolved.url;
      const portableSourcePoster =
        [resolved.posterUrl, previous.source_thumbnail].find(
          (url) => typeof url === "string" && /^https?:\/\//i.test(url),
        ) || "";
      const hydrated = {
        ...previous,
        thumbnail: portablePoster,
        source_thumbnail: portableSourcePoster,
        ...(portableSourcePoster && { thumb_is_poster: true }),
        type: "video",
        video_url: resolved.url,
        media_uuid: mediaUuid,
        persistent_media_id: previous.persistent_media_id || mediaUuid,
        identity_kind: previous.identity_kind || "flow-api-uuid",
        identity_durability: previous.identity_durability || "durable-resolver",
      };
      this.task.ref_thumbnails = {
        ...(this.task.ref_thumbnails || {}),
        [fileId]: hydrated,
      };
      if (!this._taskTileCache) this._taskTileCache = {};
      this._taskTileCache[fileId] = {
        ...(this._taskTileCache[fileId] || {}),
        ...hydrated,
      };
      this._renderTaskRefPreview();
      const freshTask = await window.storageManager?.getTask?.(taskId);
      if (freshTask) {
        freshTask.ref_thumbnails = {
          ...(freshTask.ref_thumbnails || {}),
          [fileId]: hydrated,
        };
        await window.storageManager.saveTask(freshTask);
      }
      console.info(
        "[TaskRefVideoHydration]",
        JSON.stringify({
          state: "persisted",
          taskId,
          mediaId: String(fileId).slice(0, 8),
          hasPoster: portablePoster !== resolved.url,
        }),
      );
      return true;
    }
    return false;
  }
  _applyTaskFramesSupport() {
    const sel = this.overlay?.querySelector("#taskVideoInputType");
    if (!sel) return;
    const flowAdapter = window.ProviderRegistry?.get?.("flow");
    const modelValue =
      this.overlay?.querySelector("#taskVideoModel")?.value || "";
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
  _applyTaskVoicePickerVisibility() {
    const group = this.overlay?.querySelector("#taskVoicePickerGroup");
    if (!group) return;
    const provider =
      this.overlay?.querySelector("#taskProvider")?.value || "flow";
    const mediaType =
      this.overlay?.querySelector("#taskMediaType")?.value || "Image";
    const isFrames =
      mediaType === "Video" &&
      this.overlay?.querySelector("#taskVideoInputType")?.value === "Frames";
    if (provider !== "flow" || mediaType !== "Video" || isFrames) {
      group.classList.add("hidden");
      if (isFrames) {
        const slugInput = this.overlay?.querySelector("#taskVoiceSlug");
        const searchInput = this.overlay?.querySelector(
          "#taskVoiceSearchValue",
        );
        if (slugInput) slugInput.value = "";
        if (searchInput) searchInput.value = "";
        this._taskVoicePicker?._updateTrigger();
      }
      return;
    }
    const modelValue =
      this.overlay?.querySelector("#taskVideoModel")?.value || "";
    const modelObj = window.ModelRegistry?.findModel?.("flow", modelValue);
    const supportsVoice = !!(modelObj?.config?.supports_voice === true);
    if (supportsVoice) {
      group.classList.remove("hidden");
      this._initTaskVoicePickerIfNeeded();
    } else {
      group.classList.add("hidden");
      const slugInput = this.overlay?.querySelector("#taskVoiceSlug");
      const searchInput = this.overlay?.querySelector("#taskVoiceSearchValue");
      if (slugInput?.value || searchInput?.value) {
        if (slugInput) slugInput.value = "";
        if (searchInput) searchInput.value = "";
        if (this._taskVoicePicker) this._taskVoicePicker._updateTrigger();
      }
    }
  }
  _initTaskVoicePickerIfNeeded() {
    if (this._taskVoicePicker || !window.VoicePicker) return;
    const triggerEl = this.overlay?.querySelector("#taskVoiceTrigger");
    if (!triggerEl) return;
    this._taskVoicePicker = new window.VoicePicker({
      triggerEl,
      thumbEl: this.overlay?.querySelector("#taskVoiceTriggerThumb"),
      labelEl: this.overlay?.querySelector("#taskVoiceLabel"),
      hiddenSelectEl: this.overlay?.querySelector("#taskVoiceSlug"),
      providerSlug: "flow",
      getSelected: () =>
        this.overlay?.querySelector("#taskVoiceSlug")?.value || "",
      onChange: (slug, voiceObj) => {
        const slugInput = this.overlay?.querySelector("#taskVoiceSlug");
        const searchInput = this.overlay?.querySelector(
          "#taskVoiceSearchValue",
        );
        if (slugInput) slugInput.value = slug || "";
        if (searchInput) searchInput.value = voiceObj?.search_value || "";
      },
    });
    this._taskVoicePicker.init();
  }
  _applyTaskCharacterPickerVisibility() {
    const group = this.overlay?.querySelector("#taskCharacterPickerGroup");
    if (!group) return;
    const provider =
      this.overlay?.querySelector("#taskProvider")?.value || "flow";
    const mediaType =
      this.overlay?.querySelector("#taskMediaType")?.value || "Image";
    const isFrames =
      mediaType === "Video" &&
      this.overlay?.querySelector("#taskVideoInputType")?.value === "Frames";
    if (provider !== "flow" || isFrames) {
      group.classList.add("hidden");
      if (isFrames) {
        const slugInput = this.overlay?.querySelector("#taskCharacterSlug");
        const searchInput = this.overlay?.querySelector(
          "#taskCharacterSearchValue",
        );
        if (slugInput) slugInput.value = "";
        if (searchInput) searchInput.value = "";
        this._taskCharacterPicker?._updateTrigger();
      }
      return;
    }
    const modelValue =
      mediaType === "Video"
        ? this.overlay?.querySelector("#taskVideoModel")?.value || ""
        : this.overlay?.querySelector("#taskModel")?.value || "";
    const modelObj = window.ModelRegistry?.findModel?.("flow", modelValue);
    const supportsChar = !!(modelObj?.config?.supports_character === true);
    if (supportsChar) {
      group.classList.remove("hidden");
      this._initTaskCharacterPickerIfNeeded();
    } else {
      group.classList.add("hidden");
      const definitelyUnsupported =
        !!modelObj &&
        !!modelObj.config &&
        modelObj.config.supports_character !== true;
      if (definitelyUnsupported) {
        const slugInput = this.overlay?.querySelector("#taskCharacterSlug");
        const searchInput = this.overlay?.querySelector(
          "#taskCharacterSearchValue",
        );
        if (slugInput?.value || searchInput?.value) {
          if (slugInput) slugInput.value = "";
          if (searchInput) searchInput.value = "";
          if (this._taskCharacterPicker)
            this._taskCharacterPicker._updateTrigger();
        }
      }
    }
  }
  _initTaskCharacterPickerIfNeeded() {
    if (this._taskCharacterPicker || !window.CharacterPicker) return;
    const triggerEl = this.overlay?.querySelector("#taskCharacterTrigger");
    if (!triggerEl) return;
    this._taskCharacterPicker = new window.CharacterPicker({
      triggerEl,
      thumbEl: this.overlay?.querySelector("#taskCharacterTriggerThumb"),
      labelEl: this.overlay?.querySelector("#taskCharacterLabel"),
      hiddenSelectEl: this.overlay?.querySelector("#taskCharacterSlug"),
      getSelected: () =>
        this.overlay?.querySelector("#taskCharacterSlug")?.value || "",
      onChange: (slug, charObj, selected = []) => {
        const slugInput = this.overlay?.querySelector("#taskCharacterSlug");
        const searchInput = this.overlay?.querySelector(
          "#taskCharacterSearchValue",
        );
        if (slugInput)
          slugInput.value = window.CharacterRegistry.selectionValue(selected);
        if (searchInput) searchInput.value = charObj?.search_value || "";
      },
    });
    this._taskCharacterPicker.init();
  }
  async _scanTaskRefThumbnails(
    ids,
    baselines,
    projectId,
    { refreshPreview = false } = {},
  ) {
    const results = {};
    if (typeof MessageBridge.lookupFlowMediaCatalog === "function") {
      const keysById = new Map(
        ids.map((id) => {
          const record = baselines[id] || {};
          return [
            id,
            [
              ...new Set(
                [
                  record.media_uuid,
                  record.file_name,
                  id,
                  record.persistent_media_id,
                  ...(Array.isArray(record.identity_aliases)
                    ? record.identity_aliases
                    : []),
                ].filter((value) => typeof value === "string" && value),
              ),
            ],
          ];
        }),
      );
      try {
        const catalog = await MessageBridge.lookupFlowMediaCatalog([
          ...new Set([...keysById.values()].flat()),
        ]);
        const sameProject =
          !!catalog?.projectId &&
          (!projectId ||
            String(projectId).toLowerCase() ===
              String(catalog.projectId).toLowerCase());
        if (catalog?.supported === true && sameProject) {
          for (const id of ids) {
            const baseline = baselines[id] || {};
            const keys = keysById.get(id);
            const expectedUuid = keys.find(
              (key) =>
                window.MediaRegistry.describeIdentity(key).kind === "uuid",
            );
            const info = keys
              .map((key) => catalog.known?.[key])
              .find(
                (record) =>
                  record &&
                  ["image", "video"].includes(record.type) &&
                  window.MediaRegistry.describeIdentity(record.media_uuid)
                    .kind === "uuid" &&
                  window.MediaRegistry.describeIdentity(
                    record.persistent_media_id,
                  ).kind === "asb" &&
                  (!expectedUuid ||
                    record.media_uuid.toLowerCase() ===
                      expectedUuid.toLowerCase()) &&
                  (!baseline.type ||
                    record.type === baseline.type ||
                    !!expectedUuid),
              );
            if (info) results[id] = { ...info, project_id: catalog.projectId };
          }
        }
        console.info(
          "[TaskRefScan] catalog",
          JSON.stringify({
            requested: ids.length,
            known: Object.keys(results).length,
            supported: catalog?.supported === true,
            sameProject,
            reason: catalog?.reason || null,
          }),
        );
      } catch (error) {
        console.warn("[TaskRefScan] Catalog lookup failed:", error);
      }
    }
    const unresolved = ids.filter((id) => refreshPreview || !results[id]);
    if (unresolved.length) {
      const scan = await MessageBridge.getThumbnailsByIds(unresolved, {
        deep: false,
      });
      for (const id of unresolved) {
        if (scan?.results?.[id]) {
          const observed = scan.results[id];
          if (!results[id]) results[id] = observed;
          else if (observed.file_name) {
            const known = results[id];
            results[id] = window.MediaRegistry.refFileNamesMatch(
              known.file_name,
              observed.file_name,
              id,
              known,
              observed,
            )
              ? {
                  ...known,
                  ...Object.fromEntries(
                    Object.entries(observed).filter(
                      ([, value]) =>
                        value !== void 0 && value !== null && value !== "",
                    ),
                  ),
                }
              : observed;
          }
        }
      }
    }
    return { results };
  }
  _mergeTaskRefScanRecord(id, previous, info) {
    const baseline =
      typeof previous === "string" ? { thumbnail: previous } : previous || {};
    const expected = baseline.file_name;
    const observed = info?.file_name;
    if (
      expected &&
      observed &&
      !window.MediaRegistry.refFileNamesMatch(
        expected,
        observed,
        id,
        baseline,
        info,
      )
    ) {
      window.MediaRegistry.auditRefIdentity(
        "task:scan-mismatch",
        [
          { ...baseline, id },
          { ...info, id },
        ],
        { surface: "task" },
      );
      return { ...baseline, _crossProject: true };
    }
    if (!info || (expected && !observed)) return { ...baseline };
    const present = Object.fromEntries(
      Object.entries(info).filter(
        ([, value]) => value !== void 0 && value !== null && value !== "",
      ),
    );
    const merged = { ...baseline, ...present, _crossProject: false };
    if (present.type === "image") delete merged.video_url;
    if (merged.media_uuid) {
      merged.identity_aliases = [
        ...new Set(
          [
            ...(Array.isArray(baseline.identity_aliases)
              ? baseline.identity_aliases
              : []),
            ...(Array.isArray(info.identity_aliases)
              ? info.identity_aliases
              : []),
            baseline.persistent_media_id,
            info.persistent_media_id,
            expected,
            observed,
            merged.media_uuid,
          ].filter(Boolean),
        ),
      ].slice(-16);
    }
    return merged;
  }
  _renderTaskRefPreview() {
    this._updateTaskRefGroupInput();
    const fileIdsInput = this.overlay?.querySelector("#taskFileIds");
    const previewEl = this.overlay?.querySelector("#taskRefImagesPreview");
    if (!fileIdsInput || !previewEl) return;
    const scanSequence = (this._taskRefScanSequence =
      (this._taskRefScanSequence || 0) + 1);
    const overlay = this.overlay;
    const task = this.task;
    const selection = fileIdsInput.value;
    const isCurrent = () =>
      this.overlay === overlay &&
      this.task === task &&
      this._taskRefScanSequence === scanSequence &&
      fileIdsInput.value === selection;
    const ids = selection
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    this._crossProjectRefIds = (this._crossProjectRefIds || []).filter((id) =>
      ids.includes(id),
    );
    if (ids.length === 0) {
      previewEl.innerHTML = "";
      return;
    }
    const savedFileNames = task?.ref_file_names || {};
    const savedThumbs = task?.ref_thumbnails || {};
    const needsRemoteScan = ids.some((id) => {
      if (id.startsWith("upload_")) return false;
      const cached = this._taskTileCache?.[id];
      return (
        !cached?.file_name ||
        cached._crossProject ||
        this._crossProjectRefIds.includes(id) ||
        Object.keys(savedFileNames).length === 0 ||
        (savedFileNames[id] &&
          !window.MediaRegistry.refFileNamesMatch(
            savedFileNames[id],
            cached.file_name,
            id,
            savedThumbs[id],
            cached,
          ))
      );
    });
    if (needsRemoteScan && typeof MessageBridge !== "undefined") {
      if (!this._taskTileCache) this._taskTileCache = {};
      const remoteIds = ids.filter((id) => !id.startsWith("upload_"));
      const oldCacheState = {};
      for (const id of remoteIds) {
        const cached = this._taskTileCache[id];
        const saved = savedThumbs[id];
        const savedObj = saved && typeof saved === "object" ? saved : {};
        oldCacheState[id] = {
          ...(typeof cached === "string"
            ? { thumbnail: cached }
            : cached || {}),
          ...savedObj,
          file_name:
            savedFileNames[id] || savedObj.file_name || cached?.file_name || "",
          thumbnail:
            typeof saved === "string"
              ? saved
              : savedObj.thumbnail || cached?.thumbnail || "",
        };
      }
      this._renderTaskRefPreviewInner(ids, fileIdsInput, previewEl);
      this._scanTaskRefThumbnails(
        remoteIds,
        oldCacheState,
        task?.project_id || window._currentProjectId,
      )
        .then((result) => {
          if (!isCurrent()) return;
          for (const id of remoteIds) {
            this._taskTileCache[id] = this._mergeTaskRefScanRecord(
              id,
              oldCacheState[id],
              result?.results?.[id],
            );
          }
          this._crossProjectRefIds = ids.filter(
            (id) => this._taskTileCache[id]?._crossProject,
          );
          this._renderTaskRefPreviewInner(ids, fileIdsInput, previewEl);
        })
        .catch((error) => {
          if (!isCurrent()) return;
          console.warn("[TaskModal] Reference preview scan failed:", error);
          this._renderTaskRefPreviewInner(ids, fileIdsInput, previewEl);
        });
      return;
    }
    this._renderTaskRefPreviewInner(ids, fileIdsInput, previewEl);
  }
  async _refreshFailedTaskRefPreview(id, failedUrl) {
    if (id.startsWith("upload_") || typeof MessageBridge === "undefined")
      return;
    const overlay = this.overlay;
    const task = this.task;
    const input = overlay?.querySelector("#taskFileIds");
    const selection = input?.value;
    if (
      !input ||
      !selection
        .split(",")
        .map((value) => value.trim())
        .includes(id)
    )
      return;
    if (this._taskFailedPreviewOverlay !== overlay) {
      this._taskFailedPreviewOverlay = overlay;
      this._taskFailedPreviewUrls = new Set();
    }
    const key = JSON.stringify([id, failedUrl]);
    if (this._taskFailedPreviewUrls.has(key)) return;
    this._taskFailedPreviewUrls.add(key);
    const cached = this._taskTileCache?.[id] || task?.ref_thumbnails?.[id];
    const baseline =
      typeof cached === "string" ? { thumbnail: cached } : cached || {};
    const sequence = this._taskRefScanSequence;
    try {
      const scan = await this._scanTaskRefThumbnails(
        [id],
        { [id]: baseline },
        task?.project_id || window._currentProjectId,
        { refreshPreview: true },
      );
      if (
        this.overlay !== overlay ||
        this.task !== task ||
        input.value !== selection ||
        this._taskRefScanSequence !== sequence
      )
        return;
      const merged = this._mergeTaskRefScanRecord(
        id,
        baseline,
        scan?.results?.[id],
      );
      this._taskTileCache = this._taskTileCache || {};
      this._taskTileCache[id] = merged;
      const playable =
        merged.type === "video" &&
        merged.video_url &&
        !this._isTaskImageResourceUrl(merged.video_url);
      if ((merged.thumbnail && merged.thumbnail !== failedUrl) || playable) {
        const preview = overlay.querySelector("#taskRefImagesPreview");
        if (preview)
          this._renderTaskRefPreviewInner(
            selection
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
            input,
            preview,
          );
      }
    } catch (error) {
      console.warn("[TaskModal] Failed reference preview refresh:", error);
    }
  }
  _getTaskRefsPerPrompt() {
    return window.RefImageAssignment.count(
      this.overlay?.querySelector("#taskRefImagesPerPrompt")?.value,
    );
  }
  _updateTaskRefGroupInput() {
    const input = this.overlay?.querySelector("#taskRefImagesPerPrompt");
    if (!input) return;
    const mode = this.overlay?.querySelector("#taskRefImageMode")?.value;
    this.overlay
      .querySelector("#taskRefImagesPerPromptControl")
      ?.classList.toggle("hidden", mode !== "sequential");
    const capacity = this._getTaskRefLimit(false);
    const count = this._getTaskRefsPerPrompt();
    if (Number.isFinite(capacity) && capacity > 0) {
      input.max = String(capacity);
      input.value = Math.min(count, capacity);
    } else input.value = count;
  }
  _getTaskRefLimit(scaleSequential = true) {
    const refMode =
      this.overlay?.querySelector("#taskRefImageMode")?.value || "all";
    if (refMode === "mention") return Infinity;
    const mediaType =
      this.overlay?.querySelector("#taskMediaType")?.value || "Image";
    const videoInputType =
      this.overlay?.querySelector(
        this.overlay?.querySelector("#taskProvider")?.value === "grok"
          ? "#taskGrokVideoInputType"
          : "#taskVideoInputType",
      )?.value || "Ingredients";
    const isVideo = mediaType === "Video";
    const isFrames = isVideo && videoInputType === "Frames";
    const provider = (
      this.overlay?.querySelector("#taskProvider")?.value ||
      this.task?.provider ||
      "flow"
    ).toLowerCase();
    if (
      (provider === "chatgpt" ||
        provider === "gemini" ||
        provider === "muse") &&
      !window.featureGate?.canUseProviderRefImages?.(provider)
    )
      return 0;
    const grokMode = mediaType.toLowerCase();
    const resolvedMode =
      provider === "grok" ? grokMode : isVideo ? "video" : "image";
    const modelValue =
      provider === "grok"
        ? this.overlay?.querySelector("#taskGrokModel")?.value
        : this.overlay?.querySelector("#taskMuseModel")?.value ||
          this.overlay?.querySelector("#taskVideoModel")?.value ||
          this.overlay?.querySelector("#taskImageModel")?.value ||
          this.task?.model ||
          "";
    const taskDuration =
      this.task?.video_duration ||
      this.overlay?.querySelector("#taskVideoDuration")?.value ||
      void 0;
    const resolved =
      typeof ImagePickerModal !== "undefined" &&
      ImagePickerModal.resolveMaxSelections
        ? ImagePickerModal.resolveMaxSelections({
            provider,
            mode: resolvedMode,
            isFrames,
            modelValue,
            duration: taskDuration,
          })
        : null;
    if (resolved === 0) return 0;
    if (
      (provider === "muse" || provider === "grok") &&
      !(typeof resolved === "number" && resolved > 0)
    )
      return 0;
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
        isVideo && !isFrames ? GenTab.REF_LIMIT_VIDEO : GenTab.REF_LIMIT_IMAGE;
    }
    if (provider === "flow") {
      const total =
        window.ProviderRegistry?.get?.("flow")?.getMaxRefImagesTotal?.(
          modelValue,
        );
      if (Number.isInteger(total) && total >= 0)
        perPromptPolicy = Math.min(perPromptPolicy, total);
    }
    const isMulti = !!this.overlay?.querySelector("#taskMultiPromptCheck")
      ?.checked;
    if (scaleSequential && refMode === "sequential") {
      return (
        (isMulti ? this._countTaskPrompts() : 1) *
        Math.min(perPromptPolicy, this._getTaskRefsPerPrompt())
      );
    }
    return perPromptPolicy;
  }
  _countTaskPrompts() {
    const txt = this.overlay?.querySelector("#taskPrompt")?.value || "";
    if (!txt.trim()) return 1;
    const blocks = TaskModal._splitMultiPrompt(txt);
    return Math.max(1, blocks.length);
  }
  _renderTaskRefPreviewInner(ids, fileIdsInput, previewEl) {
    const missingIds = [];
    const crossProjectIds = this._crossProjectRefIds || [];
    const refMode =
      this.overlay?.querySelector("#taskRefImageMode")?.value || "all";
    const isMentionMode = refMode === "mention";
    const refLimit = this._getTaskRefLimit();
    previewEl.innerHTML = ids
      .map((id, idx) => {
        let thumbSrc = "";
        let cachedType = "";
        let cachedVideoUrl = "";
        let cachedThumbIsPoster = false;
        const isPending = id.startsWith("upload_");
        const isCrossProject = crossProjectIds.includes(id);
        const pending = window.pendingUploadFiles?.get(id);
        if (pending?.thumbnail) {
          thumbSrc = pending.thumbnail;
        } else if (this._taskTileCache?.[id]) {
          const cached = this._taskTileCache[id];
          if (typeof cached === "string") {
            thumbSrc = cached;
          } else {
            thumbSrc = cached.thumbnail || "";
            cachedType = cached.type || "";
            cachedVideoUrl = cached.video_url || "";
            cachedThumbIsPoster = cached.thumb_is_poster === true;
          }
        } else {
          const savedThumbs = this.task?.ref_thumbnails || {};
          if (savedThumbs[id]) {
            const sv = savedThumbs[id];
            if (typeof sv === "string") {
              thumbSrc = sv;
            } else {
              thumbSrc = sv.thumbnail || "";
              cachedType = sv.type || "";
              cachedVideoUrl = sv.video_url || "";
              cachedThumbIsPoster = sv.thumb_is_poster === true;
            }
          }
        }
        if (!thumbSrc && !cachedVideoUrl && !isPending) missingIds.push(id);
        const isUploading =
          isPending && window.ImmediateUploader?.isUploading(id);
        const isExceeded = idx >= refLimit;
        const thumbClasses = ["ref-thumb"];
        if (isPending) thumbClasses.push("ref-thumb-pending");
        if (isUploading) thumbClasses.push("ref-thumb-uploading");
        if (isCrossProject) thumbClasses.push("ref-thumb-cross-project");
        if (isExceeded) thumbClasses.push("ref-thumb-exceeded");
        const crossProjectIcon = isCrossProject
          ? `
        <svg class="cross-project-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>`
          : "";
        const exceededTitle = isExceeded
          ? ` title="${t("tasks.refExceeded", { max: refLimit })}"`
          : "";
        const playbackUrl =
          cachedVideoUrl ||
          (cachedType === "video" &&
          !cachedThumbIsPoster &&
          !this._isTaskImageResourceUrl(thumbSrc) &&
          !/^data:image\//i.test(thumbSrc)
            ? thumbSrc
            : "");
        const isVideoTile =
          cachedType === "video" && !this._isTaskImageResourceUrl(playbackUrl);
        if (!thumbSrc && this._isTaskImageResourceUrl(cachedVideoUrl))
          thumbSrc = cachedVideoUrl;
        const mediaHtml =
          isVideoTile && playbackUrl
            ? `<video src="${playbackUrl}" class="ref-video-preview" muted playsinline preload="metadata" style="width:100%;height:100%;object-fit:cover;display:block;background:#0c1320;"></video>`
            : thumbSrc
              ? `<img src="${thumbSrc}" alt="ref" />`
              : `<span>${id.substring(0, 12)}</span>`;
        const thumbHtml = `
        <div class="${thumbClasses.join(" ")}" data-ref-id="${this.escapeAttr(id)}"${exceededTitle}>
          <div class="ref-thumb-inner">
            ${mediaHtml}
            ${crossProjectIcon}
            ${isPending ? '<div class="ref-thumb-badge">Local</div>' : ""}
            ${isCrossProject ? `<div class="ref-thumb-badge ref-thumb-badge-warning">${t("tasks.wrongProject")}</div>` : ""}
          </div>
          <div class="ref-thumb-remove" title="${t("common.delete")}">\xD7</div>
        </div>`;
        if (isMentionMode) {
          let name =
            this._refImageNames[id] || this.task?.ref_image_names?.[id] || "";
          if (!name) {
            name = `img_${idx + 1}`;
            this._refImageNames[id] = name;
          }
          return `
          <div class="ref-item" data-ref-id="${this.escapeAttr(id)}" draggable="true">
            <div class="ref-item-drag-handle" title="${t("tasks.dragHandle")}">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="4" r="2"/><circle cx="16" cy="4" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="20" r="2"/><circle cx="16" cy="20" r="2"/></svg>
            </div>
            ${thumbHtml}
            <div class="ref-item-name" data-ref-id="${this.escapeAttr(id)}" title="${t("tasks.clickToRename")}">@${this.escapeHtml(name)}</div>
          </div>`;
        }
        return thumbHtml;
      })
      .join("");
    previewEl.querySelectorAll(".ref-video-preview").forEach((video) => {
      if (video._loadBound) return;
      video._loadBound = true;
      video.addEventListener(
        "loadedmetadata",
        () => {
          try {
            video.currentTime = 0.1;
          } catch (_) {}
        },
        { once: true },
      );
    });
    previewEl.querySelectorAll(".ref-thumb img").forEach((img) => {
      img.addEventListener(
        "error",
        () => {
          const tileId = img.closest("[data-ref-id]")?.dataset.refId;
          if (tileId && img.src)
            void this._refreshFailedTaskRefPreview(tileId, img.src);
        },
        { once: true },
      );
    });
    if (crossProjectIds.length > 0 && !this._crossProjectWarned) {
      this._crossProjectWarned = true;
      window.customDialog?.alert(
        t("tasks.crossProjectMsg", { count: crossProjectIds.length }),
        { title: t("tasks.crossProjectTitle"), type: "warning" },
      );
    }
    if (missingIds.length > 0 && !this._missingRefWarned) {
      this._missingRefWarned = true;
      window.customDialog?.alert(
        t("tasks.missingRefMsg", { count: missingIds.length }),
        { title: t("tasks.missingRefTitle"), type: "info" },
      );
    }
    previewEl.querySelectorAll(".ref-thumb-remove").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const thumb = btn.closest(".ref-thumb");
        const removeId =
          thumb?.dataset.refId || btn.closest(".ref-item")?.dataset.refId;
        if (removeId && fileIdsInput) {
          const currentIds = fileIdsInput.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          fileIdsInput.value = currentIds
            .filter((id) => id !== removeId)
            .join(", ");
          if (removeId.startsWith("upload_")) {
            if (window.ImmediateUploader) ImmediateUploader.cancel(removeId);
            else window.pendingUploadFiles?.delete(removeId);
            this._modalUploadKeys?.delete(removeId);
          }
          delete this._refImageNames[removeId];
          this._renderTaskRefPreview();
          this._refreshMentionHelper();
          this._updateDragHint();
        }
      });
    });
    if (isMentionMode) {
      previewEl.querySelectorAll(".ref-item-name").forEach((nameEl) => {
        nameEl.addEventListener("click", (e) => {
          e.stopPropagation();
          const fileId = nameEl.dataset.refId;
          const domName = nameEl.textContent?.replace(/^@/, "").trim() || "";
          const currentName =
            this._refImageNames[fileId] ||
            this.task?.ref_image_names?.[fileId] ||
            domName;
          this._editRefImageName(fileId, currentName);
        });
      });
      previewEl.querySelectorAll(".ref-item .ref-thumb").forEach((thumbEl) => {
        thumbEl.addEventListener("click", (e) => {
          if (e.target.closest(".ref-thumb-remove")) return;
          e.stopPropagation();
          const fileId = thumbEl.dataset.refId;
          const nameEl = thumbEl
            .closest(".ref-item")
            ?.querySelector(".ref-item-name");
          const domName = nameEl?.textContent?.replace(/^@/, "").trim() || "";
          const currentName =
            this._refImageNames[fileId] ||
            this.task?.ref_image_names?.[fileId] ||
            domName;
          this._editRefImageName(fileId, currentName);
        });
      });
    }
    this._enableRefDragDrop();
    this._updateDragHint();
    this._updatePromptCount();
  }
  _renderTaskPromptCharCount(text) {
    const len = String(text || "").length;
    const max =
      window.ValidationRules?.safeGetInt?.("prompt_max_length", 0) || 0;
    const fmt = (n) =>
      String(Math.max(0, Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const value = max > 0 ? `${fmt(len)}/${fmt(max)}` : `${fmt(len)}/\u2014`;
    return `<span class="task-prompt-char-count${max > 0 && len > max ? " is-over-limit" : ""}" id="taskPromptCharCount">${value}</span>`;
  }
  _updateTaskPromptCharCount(textarea) {
    const counter = this.overlay?.querySelector("#taskPromptCharCount");
    if (!textarea || !counter) return;
    const len = String(textarea.value || "").length;
    const max =
      window.ValidationRules?.safeGetInt?.("prompt_max_length", 0) || 0;
    const fmt = (n) =>
      String(Math.max(0, Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    counter.textContent =
      max > 0 ? `${fmt(len)}/${fmt(max)}` : `${fmt(len)}/\u2014`;
    counter.classList.toggle("is-over-limit", max > 0 && len > max);
  }
  _updatePromptCount() {
    const countEl = this.overlay?.querySelector("#taskPromptCount");
    const promptArea = this.overlay?.querySelector("#taskPrompt");
    if (!countEl || !promptArea) return;
    const text = promptArea.value.trim();
    if (!text) {
      countEl.textContent = "0";
      countEl.classList.remove("prompt-count-warning");
      return;
    }
    const quantity =
      parseInt(this.overlay?.querySelector("#taskQuantity")?.value) || 1;
    const refFileIds = (
      this.overlay?.querySelector("#taskFileIds")?.value || ""
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const refCount = refFileIds.length;
    const refMode =
      this.overlay?.querySelector("#taskRefImageMode")?.value || "all";
    const refLimit = this._getTaskRefLimit();
    const isRefExceeded = refCount > refLimit;
    if (this._multiPromptEnabled) {
      const promptCount = TaskModal._splitMultiPrompt(text).length;
      const totalImages = promptCount * quantity;
      const isSequential = refMode === "sequential";
      const hasMismatch =
        isSequential &&
        refCount > 0 &&
        promptCount * this._getTaskRefsPerPrompt() !== refCount;
      if (hasMismatch) {
        const promptClass =
          promptCount * this._getTaskRefsPerPrompt() < refCount
            ? "prompt-count-short"
            : "";
        const refClass =
          refCount < promptCount * this._getTaskRefsPerPrompt()
            ? "prompt-count-short"
            : "";
        countEl.innerHTML = `<span class="${promptClass}"><span class="gen-count-num">${promptCount}</span> prompt</span> | <span class="${refClass}"><span class="gen-count-num">${refCount}</span> ${t("gen.refLabel")}</span> \u2192 <span class="gen-count-num">${totalImages}</span> ${t("gen.imageUnit")}`;
        countEl.classList.add("prompt-count-warning");
      } else if (isRefExceeded) {
        countEl.innerHTML = `<span class="gen-count-num">${promptCount}</span> prompt | <span class="gen-count-num">${refCount}</span> ${t("gen.refLabel")} (${t("gen.maxLabel")} ${refLimit}) \u2192 <span class="gen-count-num">${totalImages}</span> ${t("gen.imageUnit")}`;
        countEl.classList.add("ref-count-exceeded");
        countEl.classList.remove("prompt-count-warning");
      } else {
        countEl.innerHTML =
          refCount > 0
            ? `<span class="gen-count-num">${promptCount}</span> prompt | <span class="gen-count-num">${refCount}</span> ${t("gen.refLabel")} \u2192 <span class="gen-count-num">${totalImages}</span> ${t("gen.imageUnit")}`
            : `<span class="gen-count-num">${promptCount}</span> prompt \u2192 <span class="gen-count-num">${totalImages}</span> ${t("gen.imageUnit")}`;
        countEl.classList.remove("prompt-count-warning");
        countEl.classList.remove("ref-count-exceeded");
      }
    } else {
      if (isRefExceeded) {
        countEl.innerHTML = `<span class="gen-count-num">${refCount}</span> ${t("gen.refLabel")} (${t("gen.maxLabel")} ${refLimit}) \u2192 <span class="gen-count-num">${quantity}</span> ${t("gen.imageUnit")}`;
        countEl.classList.add("ref-count-exceeded");
      } else {
        countEl.innerHTML =
          refCount > 0
            ? `<span class="gen-count-num">${refCount}</span> ${t("gen.refLabel")} \u2192 <span class="gen-count-num">${quantity}</span> ${t("gen.imageUnit")}`
            : `<span class="gen-count-num">${quantity}</span> ${t("gen.imageUnit")}`;
        countEl.classList.remove("ref-count-exceeded");
      }
      countEl.classList.remove("prompt-count-warning");
    }
  }
  _editRefImageName(fileId, currentName) {
    const thumbEl = this.overlay?.querySelector(
      `.ref-thumb[data-ref-id="${fileId}"]`,
    );
    if (!thumbEl) return;
    document
      .querySelectorAll(".ref-image-name-popup, .ref-image-name-popup-backdrop")
      .forEach((el) => el.remove());
    const rect = thumbEl.getBoundingClientRect();
    const overlayRect = this.overlay.getBoundingClientRect();
    const backdrop = document.createElement("div");
    backdrop.className = "ref-image-name-popup-backdrop";
    backdrop.style.zIndex = "10000010";
    const popup = document.createElement("div");
    popup.className = "ref-image-name-popup";
    popup.style.zIndex = "10000011";
    popup.style.left = `${Math.max(8, rect.left)}px`;
    popup.style.top = `${rect.bottom + 8}px`;
    const title = document.createElement("div");
    title.className = "ref-image-name-popup-title";
    title.textContent = t("tasks.imageNameMention");
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
    saveBtn.title = t("common.save");
    saveBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    inputWrap.appendChild(saveBtn);
    popup.appendChild(inputWrap);
    document.body.appendChild(backdrop);
    document.body.appendChild(popup);
    input.focus();
    input.select();
    const doSave = () => {
      const newName = input.value.trim().substring(0, 50);
      if (newName) {
        this._refImageNames[fileId] = newName;
        const nameEl = this.overlay?.querySelector(
          `.ref-item-name[data-ref-id="${fileId}"]`,
        );
        if (nameEl) nameEl.textContent = `@${newName}`;
        this._refreshMentionHelper();
      }
      cleanup();
    };
    const cleanup = () => {
      popup.remove();
      backdrop.remove();
    };
    saveBtn.addEventListener("click", doSave);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doSave();
      if (e.key === "Escape") {
        e.stopPropagation();
        cleanup();
      }
    });
    backdrop.addEventListener("click", cleanup);
  }
  _enableRefDragDrop() {
    const previewEl = this.overlay?.querySelector("#taskRefImagesPreview");
    if (!previewEl) return;
    const items = previewEl.querySelectorAll(
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
        const dragging = previewEl.querySelector(".dragging");
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
          this._reorderRefIds(draggedId, targetId);
        }
      });
    });
  }
  _reorderRefIds(draggedId, targetId) {
    const fileIdsInput = this.overlay?.querySelector("#taskFileIds");
    if (!fileIdsInput) return;
    const ids = fileIdsInput.value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const draggedIdx = ids.indexOf(draggedId);
    const targetIdx = ids.indexOf(targetId);
    if (draggedIdx === -1 || targetIdx === -1) return;
    ids.splice(draggedIdx, 1);
    ids.splice(targetIdx, 0, draggedId);
    fileIdsInput.value = ids.join(", ");
    this._renderTaskRefPreview();
    this._refreshMentionHelper();
  }
  _updateDragHint() {
    const hintEl = this.overlay?.querySelector("#taskRefDragHint");
    if (!hintEl) return;
    const fileIdsInput = this.overlay?.querySelector("#taskFileIds");
    const ids = (fileIdsInput?.value || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const refMode =
      this.overlay?.querySelector("#taskRefImageMode")?.value || "all";
    const showHint = ids.length >= 2 && refMode === "sequential";
    hintEl.classList.toggle("hidden", !showHint);
  }
  async save() {
    if (this.overlay?.querySelector("#taskGrokFramesGroup")?._grokFrameBusy)
      return;
    if (this._isSaving) {
      console.log("[TaskModal] save() ignored \u2014 already saving");
      return;
    }
    this._isSaving = true;
    const saveBtn = this.overlay?.querySelector("#saveTaskBtn");
    if (saveBtn) saveBtn.disabled = true;
    try {
      return await this._doSave();
    } finally {
      this._isSaving = false;
      if (saveBtn) saveBtn.disabled = false;
    }
  }
  async _doSave() {
    if (this.mode === "edit" && this.task?.status === "running") {
      const I = window.I18n;
      window.customDialog?.alert(
        I?.t("tasks.cannotEditRunning") ||
          "Cannot save a running task. Please stop it first.",
        {
          title: I?.t("tasks.taskRunning") || "Task is running",
          type: "warning",
        },
      );
      return;
    }
    if (this.mode === "create" && window.featureGate) {
      const canCreate = await window.featureGate.canCreateTaskAsync();
      if (!canCreate) {
        const isLoggedIn = window.authManager?.isLoggedIn();
        if (!isLoggedIn) {
          window.featureGate.showLoginPrompt(
            t("tasks.requireLoginToCreate") || "Login required to create tasks",
          );
        } else {
          const quota = window.featureGate.checkQuota("tasks_max");
          const dialog = window.customDialog || window.CustomDialog;
          if (dialog) {
            dialog.alert(
              t("tasks.quotaLimitMsg", {
                limit: quota.limit,
                used: quota.used,
              }),
              { title: t("tasks.quotaLimitTitle"), type: "warning" },
            );
          }
        }
        return;
      }
    }
    const taskName = this.overlay?.querySelector("#taskName")?.value?.trim();
    const prompt = this.overlay?.querySelector("#taskPrompt")?.value?.trim();
    const providerRaw = this.overlay?.querySelector("#taskProvider")?.value;
    const provider =
      providerRaw === "chatgpt" ||
      providerRaw === "grok" ||
      providerRaw === "gemini" ||
      providerRaw === "muse" ||
      providerRaw === "flow"
        ? providerRaw
        : "flow";
    if (provider === "flow") {
      const canFlow = !!window.featureGate?.canUse("gen_enabled");
      if (!canFlow) {
        const isLoggedIn = !!window.authManager?.isLoggedIn?.();
        if (isLoggedIn && typeof window.openUpgradeModal === "function") {
          try {
            window.openUpgradeModal();
          } catch (_) {}
        } else {
          window.featureGate?.showLoginPrompt(
            t("tasks.flowProviderLockedMsg") ||
              "Google Flow requires a suitable plan for this task.",
          );
        }
        return;
      }
    }
    if (provider === "chatgpt") {
      const canChatGPT = !!window.featureGate?.canUse("chatgpt_enabled");
      if (!canChatGPT) {
        const isLoggedIn = !!window.authManager?.isLoggedIn?.();
        if (isLoggedIn && typeof window.openUpgradeModal === "function") {
          try {
            window.openUpgradeModal();
          } catch (_) {}
        } else {
          window.featureGate?.showLoginPrompt(
            t("tasks.providerLockedMsg") ||
              "ChatGPT requires a Pro plan for this task.",
          );
        }
        return;
      }
    }
    if (provider === "grok") {
      const canGrok = !!window.featureGate?.canUse("grok_enabled");
      if (!canGrok) {
        const isLoggedIn = !!window.authManager?.isLoggedIn?.();
        if (isLoggedIn && typeof window.openUpgradeModal === "function") {
          try {
            window.openUpgradeModal();
          } catch (_) {}
        } else {
          window.featureGate?.showLoginPrompt(
            t("tasks.grokProviderLockedMsg") ||
              "Grok requires a Pro plan for this task.",
          );
        }
        return;
      }
    }
    if (
      provider === "gemini" &&
      !window.featureGate?.canUse("gemini_enabled")
    ) {
      window.openUpgradeModal?.();
      return;
    }
    if (provider === "muse" && !window.featureGate?.canUse("muse_enabled")) {
      window.openUpgradeModal?.();
      return;
    }
    const mediaType = this.overlay?.querySelector("#taskMediaType")?.value;
    let ratio = this.overlay?.querySelector("#taskRatio")?.value;
    if (provider === "flow") {
      const ratioMode = mediaType === "Video" ? "video" : "image";
      const configured =
        window.ProviderConfigManager?.safeGetRatiosSync?.("flow", ratioMode) ||
        [];
      const validRatios = configured
        .map((item) => (typeof item === "string" ? item : item?.value))
        .filter(Boolean);
      const remembered = this._providerRatioSelections?.flow?.[ratioMode];
      const configuredDefault =
        ratioMode === "video"
          ? this._afSettings?.defaultVideoRatio
          : this._afSettings?.defaultImageRatio;
      const flowOwnedRatio =
        this.overlay?.querySelector("#taskRatio")?.dataset?.providerOwner ===
        "flow"
          ? ratio
          : null;
      ratio =
        [
          flowOwnedRatio,
          remembered,
          configuredDefault,
          this._afSettings?.aspectRatio,
          validRatios[0],
        ].find((value) => validRatios.includes(value)) || null;
      if (!ratio) {
        window.showNotification?.(
          window.I18n?.t?.("config.ratiosUnavailable") ||
            "Generation ratios are unavailable. Please try again.",
          "error",
          4e3,
        );
        return;
      }
    }
    let model = null;
    if (provider === "flow") {
      model =
        this.overlay?.querySelector(
          mediaType === "Video" ? "#taskVideoModel" : "#taskModel",
        )?.value || null;
      if (!model) {
        try {
          model = await window.ModelRegistry.getDefaultAsync(
            "flow",
            mediaType === "Video" ? "video" : "image",
          );
          if (!model)
            throw new window.ConfigRequiredError("models_flow", "data_missing");
        } catch (error) {
          if (window.ConfigRequiredError?.is?.(error))
            window.ConfigErrorHandler?.handle(error, "TaskModal.save");
          return;
        }
      }
    }
    const videoInputType =
      this.overlay?.querySelector(
        provider === "grok" ? "#taskGrokVideoInputType" : "#taskVideoInputType",
      )?.value || "Ingredients";
    const quantity =
      parseInt(this.overlay?.querySelector("#taskQuantity")?.value) || 1;
    let fileIds = this.overlay?.querySelector("#taskFileIds")?.value?.trim();
    let grokFrameSelection = null;
    if (
      provider === "grok" &&
      mediaType === "Video" &&
      videoInputType === "Frames"
    ) {
      const adapter = window.ProviderRegistry.get("grok");
      try {
        grokFrameSelection = adapter.frameSelectionData(
          this._grokFrameData || {},
          this._getTaskPromptCount(),
          { requireStart: true },
        );
      } catch (error) {
        const positions = error.positions?.join(", ") || "1";
        window.showNotification?.(
          window.I18n?.t?.("gen.framesMissingStart", { positions }) ||
            `Missing Start frame for prompt(s): ${positions}`,
          "warning",
        );
        return;
      }
      const pairs = adapter.framePairs(
        this._grokFrameData || {},
        this._getTaskPromptCount(),
      );
      if (
        pairs.some(
          (pair) =>
            pair.ref_file_ids.split(",").filter(Boolean).length >
            this._getTaskRefLimit(),
        )
      ) {
        window.showNotification?.(
          window.I18n?.t?.("gen.refExceedLimit", {
            max: this._getTaskRefLimit(),
          }) || `Frames: maximum ${this._getTaskRefLimit()} reference images.`,
          "warning",
        );
        return;
      }
    }
    if (fileIds && !(mediaType === "Video" && videoInputType === "Frames")) {
      const refLimit = this._getTaskRefLimit();
      const fileIdArr = fileIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (fileIdArr.length > refLimit) {
        console.log(
          `[TaskModal] Ref images v\u01B0\u1EE3t gi\u1EDBi h\u1EA1n (${fileIdArr.length}/${refLimit}), ch\u1EC9 l\u01B0u ${refLimit} \u1EA3nh \u0111\u1EA7u ti\xEAn`,
        );
        fileIds = fileIdArr.slice(0, refLimit).join(", ");
      }
    }
    const taskEnabled =
      this.overlay?.querySelector("#taskEnabled")?.checked !== false;
    const autoDownload =
      this.overlay?.querySelector("#taskAutoDownload")?.checked;
    const downloadResolution =
      this.overlay?.querySelector("#taskDownloadResolution")?.value || "1k";
    const videoDownloadResolution =
      this.overlay?.querySelector("#taskVideoDownloadResolution")?.value ||
      "720p";
    if (!prompt) {
      window.customDialog.alert(t("tasks.promptRequired"), { type: "warning" });
      return;
    }
    const frame1FileId =
      this.overlay?.querySelector("#taskFrame1FileId")?.value?.trim() || "";
    const frame2FileId =
      this.overlay?.querySelector("#taskFrame2FileId")?.value?.trim() || "";
    const isMultiPrompt =
      this.overlay?.querySelector("#taskMultiPromptCheck")?.checked || false;
    let prompts = null;
    if (isMultiPrompt) {
      prompts = TaskModal._splitMultiPrompt(prompt);
      if (prompts.length > 1 && window.featureGate) {
        const _batch = window.featureGate.checkPromptBatchLimit?.(
          prompts.length,
        );
        if (_batch && !_batch.allowed) {
          const _lim = _batch.limit === -1 ? "\u221E" : _batch.limit;
          window.showNotification?.(
            window.I18n?.t?.("gen.batchLimitExceeded", {
              count: prompts.length,
              limit: _lim,
            }) ||
              `G\xF3i c\u1EE7a b\u1EA1n gi\u1EDBi h\u1EA1n ${_lim} prompt/batch. Task n\xE0y c\xF3 ${prompts.length} prompt. N\xE2ng c\u1EA5p \u0111\u1EC3 t\u0103ng gi\u1EDBi h\u1EA1n.`,
            "warning",
          );
          return;
        }
      }
    }
    if (
      provider === "flow" &&
      mediaType === "Video" &&
      videoInputType === "Frames"
    ) {
      const missing = [];
      if (isMultiPrompt && prompts?.length > 1) {
        for (let i = 0; i < prompts.length; i++) {
          if (!this._taskPerPromptFrameData[i]?.frame1) missing.push(i + 1);
        }
      } else if (!frame1FileId) {
        missing.push(1);
      }
      if (missing.length) {
        window.showNotification?.(
          window.I18n?.t("gen.framesMissingStart", {
            positions: missing.join(", "),
          }) || `Missing Start frame for prompt(s): ${missing.join(", ")}`,
          "warning",
        );
        return;
      }
    }
    const refImageNames =
      Object.keys(this._refImageNames).length > 0
        ? { ...(this.task?.ref_image_names || {}), ...this._refImageNames }
        : this.mode === "edit"
          ? this.task?.ref_image_names || null
          : null;
    const grokModeFromToggle = mediaType === "Video" ? "video" : "image";
    const grokDuration =
      this.overlay?.querySelector("#taskGrokDuration")?.value || "6s";
    const grokResolution =
      this.overlay?.querySelector("#taskGrokResolution")?.value || "720p";
    const grokImageQuality =
      this.overlay?.querySelector("#taskGrokImageQuality")?.value || "speed";
    const chatgptDeleteAfterGen =
      this.overlay?.querySelector("#taskChatgptDeleteAfterGen")?.checked ||
      false;
    const geminiDeleteAfterGen =
      this.overlay?.querySelector("#taskGeminiDeleteAfterGen")?.checked ||
      false;
    const museDeleteAfterGen =
      this.overlay?.querySelector("#taskMuseDeleteAfterGen")?.checked || false;
    const preservedProjectId =
      this.mode === "edit" && this.task?.project_id !== void 0
        ? this.task.project_id
        : window._currentProjectId || null;
    const isLegacyShared = preservedProjectId === null;
    const computedProjectId = isLegacyShared
      ? window._currentProjectId || null
      : preservedProjectId;
    const persistedModel =
      provider === "chatgpt"
        ? this.overlay?.querySelector("#taskChatgptModel")?.value ||
          window.ModelRegistry?.safeGetDefault?.("chatgpt", "image") ||
          null
        : provider === "gemini"
          ? this.overlay?.querySelector("#taskGeminiModel")?.value || null
          : provider === "grok"
            ? this.overlay?.querySelector("#taskGrokModel")?.value || null
            : provider === "muse"
              ? this.overlay?.querySelector("#taskMuseModel")?.value || null
              : model;
    if (
      provider === "grok" &&
      (!persistedModel ||
        (mediaType === "Video" &&
          !window.ProviderRegistry?.get?.("grok")
            ?.getVideoInputTypes?.(persistedModel)
            .some((o) => o.value === videoInputType)))
    ) {
      window.showNotification?.(
        "Grok model/mode configuration is unavailable.",
        "error",
      );
      return;
    }
    if (provider === "muse" && !persistedModel) {
      window.showNotification?.(
        "Muse model configuration is unavailable. Please retry after the server configuration loads.",
        "error",
      );
      return;
    }
    const taskData = {
      _isNew: this.mode === "create",
      task_id:
        this.mode === "edit"
          ? this.task.task_id
          : window.IdGenerator
            ? window.IdGenerator.next("task")
            : `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      task_name:
        taskName ||
        `Task ${window.I18n?.formatDateTime?.(new Date()) || new Date().toLocaleString()}`,
      provider,
      prompt,
      multi_prompt: isMultiPrompt,
      prompts,
      media_type: mediaType,
      ratio,
      model: persistedModel,
      quantity:
        provider === "grok" || provider === "gemini" || provider === "muse"
          ? 1
          : quantity,
      video_input_type: mediaType === "Video" ? videoInputType : null,
      video_duration:
        mediaType === "Video"
          ? this.overlay.querySelector("#taskVideoDuration")?.value || "6s"
          : null,
      video_resolution:
        provider === "flow" && mediaType === "Video"
          ? this.overlay.querySelector("#taskVideoResolution")?.value || null
          : null,
      voice_slug:
        provider === "flow" &&
        mediaType === "Video" &&
        videoInputType !== "Frames"
          ? this.overlay.querySelector("#taskVoiceSlug")?.value || null
          : null,
      voice_search_value:
        provider === "flow" &&
        mediaType === "Video" &&
        videoInputType !== "Frames"
          ? this.overlay.querySelector("#taskVoiceSearchValue")?.value || null
          : null,
      character_selections:
        provider === "flow" &&
        !(mediaType === "Video" && videoInputType === "Frames")
          ? window.CharacterRegistry.selections(
              this.overlay.querySelector("#taskCharacterSlug")?.value || "",
            ).map(({ slug, search_value }) => ({ slug, search_value }))
          : [],
      character_slug:
        provider === "flow" &&
        !(mediaType === "Video" && videoInputType === "Frames")
          ? window.CharacterRegistry.selections(
              this.overlay.querySelector("#taskCharacterSlug")?.value || "",
            )[0]?.slug || null
          : null,
      character_search_value:
        provider === "flow" &&
        !(mediaType === "Video" && videoInputType === "Frames")
          ? this.overlay.querySelector("#taskCharacterSearchValue")?.value ||
            null
          : null,
      ref_file_ids: fileIds,
      frame_1_file_id:
        mediaType === "Video" && videoInputType === "Frames"
          ? frame1FileId
          : null,
      frame_2_file_id:
        mediaType === "Video" && videoInputType === "Frames"
          ? frame2FileId
          : null,
      frame_pairs: this._buildFramePairsForSave(
        mediaType,
        videoInputType,
        isMultiPrompt,
        prompts,
      ),
      auto_download: autoDownload,
      download_resolution: downloadResolution,
      video_download_resolution: videoDownloadResolution,
      ref_image_mode:
        this.overlay.querySelector("#taskRefImageMode")?.value || "all",
      ref_images_per_prompt: this._getTaskRefsPerPrompt(),
      ref_image_names: refImageNames,
      addon_prompt_id:
        this.mode === "edit" && this.task?.addon_prompt_id
          ? this.task.addon_prompt_id
          : null,
      addon_prompt_text:
        this.mode === "edit" && this.task?.addon_prompt_text
          ? this.task.addon_prompt_text
          : null,
      enabled: taskEnabled,
      status: this.mode === "edit" ? this.task.status : "pending",
      result_file_ids: this.mode === "edit" ? this.task.result_file_ids : "",
      result_thumbnails:
        this.mode === "edit" ? this.task.result_thumbnails || {} : {},
      result_file_names:
        this.mode === "edit" ? this.task.result_file_names || {} : {},
      result_provider_urls:
        this.mode === "edit" ? this.task.result_provider_urls || {} : {},
      error_message: this.mode === "edit" ? this.task.error_message : "",
      project_id: computedProjectId,
      platform: "flow",
    };
    if (provider === "grok") {
      taskData.grok_mode = grokModeFromToggle;
      taskData.grok_duration = grokDuration;
      taskData.grok_resolution = grokResolution;
      taskData.grok_image_quality = grokImageQuality;
    }
    if (provider === "chatgpt") {
      taskData.chatgpt_delete_after_gen = chatgptDeleteAfterGen;
    }
    if (provider === "gemini")
      taskData.gemini_delete_after_gen = geminiDeleteAfterGen;
    if (provider === "muse")
      taskData.muse_delete_after_gen = museDeleteAfterGen;
    if (fileIds) {
      const refThumbs = {};
      const refIds = fileIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const id of refIds) {
        const pending = window.pendingUploadFiles?.get(id);
        if (
          pending?.thumbnail &&
          !/^(?:data:|blob:)/i.test(String(pending.thumbnail))
        ) {
          refThumbs[id] = pending.thumbnail;
          continue;
        }
        const cached = this._taskTileCache?.[id];
        if (cached) {
          const rawThumbUrl =
            typeof cached === "string" ? cached : cached.thumbnail;
          const thumbUrl =
            rawThumbUrl && !/^(?:data:|blob:)/i.test(String(rawThumbUrl))
              ? rawThumbUrl
              : "";
          const isPlayableVideo =
            typeof cached === "object" &&
            cached.type === "video" &&
            !!cached.video_url;
          const isVideoRecord =
            typeof cached === "object" && cached.type === "video";
          if (thumbUrl || isPlayableVideo || isVideoRecord) {
            const hasIdentity =
              typeof cached === "object" &&
              !!(
                cached.media_uuid ||
                cached.persistent_media_id ||
                cached.identity_durability ||
                cached.api_driver
              );
            refThumbs[id] =
              typeof cached === "object" &&
              (cached.type === "video" || hasIdentity)
                ? {
                    thumbnail: thumbUrl || "",
                    ...(cached.source_thumbnail &&
                      !/^(?:data:|blob:)/i.test(
                        String(cached.source_thumbnail),
                      ) && { source_thumbnail: cached.source_thumbnail }),
                    type: cached.type || "image",
                    ...(cached.video_url &&
                      !/^(?:data:|blob:)/i.test(String(cached.video_url)) && {
                        video_url: cached.video_url,
                      }),
                    ...(cached.media_uuid && { media_uuid: cached.media_uuid }),
                    ...(cached.persistent_media_id && {
                      persistent_media_id: cached.persistent_media_id,
                    }),
                    ...(cached.identity_kind && {
                      identity_kind: cached.identity_kind,
                    }),
                    ...(cached.identity_durability && {
                      identity_durability: cached.identity_durability,
                    }),
                    ...(Array.isArray(cached.identity_aliases) && {
                      identity_aliases: cached.identity_aliases,
                    }),
                    ...(cached.api_driver && { api_driver: cached.api_driver }),
                    ...(cached.project_id && { project_id: cached.project_id }),
                    ...(cached.protocol_revision && {
                      protocol_revision: cached.protocol_revision,
                    }),
                    ...(cached.protocol_fingerprint && {
                      protocol_fingerprint: cached.protocol_fingerprint,
                    }),
                    ...(cached.display_name && {
                      display_name: cached.display_name,
                    }),
                  }
                : thumbUrl;
            continue;
          }
        }
      }
      if (Object.keys(refThumbs).length > 0) {
        taskData.ref_thumbnails = {
          ...(this.mode === "edit" ? this.task.ref_thumbnails || {} : {}),
          ...refThumbs,
        };
      } else if (this.mode === "edit") {
        taskData.ref_thumbnails = this.task.ref_thumbnails || {};
      }
      const refFileNames = {};
      for (const id of refIds) {
        const cached = this._taskTileCache?.[id];
        if (cached?.media_uuid || cached?.file_name) {
          refFileNames[id] = cached.media_uuid || cached.file_name;
        }
      }
      if (Object.keys(refFileNames).length > 0) {
        taskData.ref_file_names = {
          ...(this.mode === "edit" ? this.task.ref_file_names || {} : {}),
          ...refFileNames,
        };
      } else if (this.mode === "edit" && this.task.ref_file_names) {
        taskData.ref_file_names = this.task.ref_file_names;
      }
    }
    if (
      provider === "grok" &&
      mediaType === "Video" &&
      videoInputType === "Frames"
    ) {
      Object.assign(taskData, grokFrameSelection, {
        ref_file_ids: fileIds,
        ref_image_mode: "all",
      });
    }
    const frame1Id = taskData.frame_1_file_id;
    const frame2Id = taskData.frame_2_file_id;
    if (provider !== "grok" && (frame1Id || frame2Id)) {
      const getFrameInfo = (fid) => {
        if (!fid) return { thumbnail: null, file_name: null };
        const pending = window.pendingUploadFiles?.get(fid);
        const cached = this._taskTileCache?.[fid];
        const cachedObj = cached
          ? typeof cached === "string"
            ? { thumbnail: cached }
            : cached
          : {};
        return {
          thumbnail: pending?.thumbnail || cachedObj.thumbnail || null,
          file_name: cachedObj.file_name || null,
        };
      };
      if (frame1Id) {
        const info = getFrameInfo(frame1Id);
        taskData.frame_1_thumbnail =
          info.thumbnail ||
          (this.mode === "edit" ? this.task.frame_1_thumbnail : null) ||
          null;
        taskData.frame_1_file_name =
          info.file_name ||
          (this.mode === "edit" ? this.task.frame_1_file_name : null) ||
          null;
      }
      if (frame2Id) {
        const info = getFrameInfo(frame2Id);
        taskData.frame_2_thumbnail =
          info.thumbnail ||
          (this.mode === "edit" ? this.task.frame_2_thumbnail : null) ||
          null;
        taskData.frame_2_file_name =
          info.file_name ||
          (this.mode === "edit" ? this.task.frame_2_file_name : null) ||
          null;
      }
    }
    console.log("[TaskModal] save() taskData:", {
      task_id: taskData.task_id,
      provider: taskData.provider,
      auto_download: taskData.auto_download,
      muse_delete_after_gen: taskData.muse_delete_after_gen,
      multi_prompt: taskData.multi_prompt,
      ref_image_mode: taskData.ref_image_mode,
      ref_images_per_prompt: taskData.ref_images_per_prompt,
      ref_image_names: taskData.ref_image_names,
      addon_prompt_id: taskData.addon_prompt_id,
    });
    try {
      if (window.storageManager) {
        await window.storageManager.saveTask(taskData);
        window.eventBus?.emit("storage:task_saved", {
          taskId: taskData.task_id,
          task_id: taskData.task_id,
        });
      }
      if (this.mode === "create") {
        if (window.featureGate && !window.authManager?.isLoggedIn()) {
          await window.featureGate.recordTaskCreated();
        }
        if (window.featureGate) {
          window.featureGate
            .refresh({ force: true })
            .catch((e) =>
              console.warn("[TaskModal] FeatureGate refresh failed:", e),
            );
        }
      }
      this._scanRefFileNames(taskData.task_id, fileIds);
      this._cacheRefImageBlobs(taskData).catch((e) =>
        console.warn("[TaskModal] Proactive blob caching failed:", e.message),
      );
      this._modalUploadKeys?.clear();
      this._forceClose();
      window.showNotification?.(
        this.mode === "edit" ? t("tasks.taskUpdated") : t("tasks.taskCreated"),
        "success",
      );
    } catch (error) {
      console.error("[TaskModal] Save failed:", error);
      if (error.code === "TASK_REF_GROUP_NOT_SAVED") {
        window.customDialog.alert(t("tasks.saveFailed") + error.message, {
          type: "error",
        });
        return;
      }
      if (
        error.code === "QUOTA_EXCEEDED" ||
        error.message?.includes("gi\u1EDBi h\u1EA1n")
      ) {
        return;
      }
      if (error.message === "REQUIRES_LOGIN") {
        window.featureGate?.showLoginPrompt(
          t("tasks.requireLoginToCreate") || "Login required to create tasks",
        );
        return;
      }
      window.customDialog.alert(t("tasks.saveFailed") + error.message, {
        type: "error",
      });
    }
  }
  _ensureProviderTab(providerKey) {
    try {
      this._checkDuplicateProviderTabs(providerKey);
      if (providerKey === "chatgpt" && window.ChatGPTSession?.ensureReady) {
        window.ChatGPTSession.ensureReady({
          createIfMissing: true,
          activate: true,
          forceCheck: true,
          waitForEditorMs: 12e3,
        })
          .then((ready) => {
            if (!ready?.ready)
              throw new Error(ready?.error || "CHATGPT_NOT_READY");
            return window.ChatGPTSession.ensureTabActive?.();
          })
          .then(async () => {
            const mode = await window.ChatGPTSession.ensureChatMode?.();
            if (mode && !mode.success)
              throw new Error(mode.error || "CHAT_MODE_NOT_READY");
            return mode;
          })
          .catch((err) =>
            console.warn(
              "[TaskModal] ChatGPT activate failed:",
              err?.message || err,
            ),
          );
      } else if (providerKey === "grok" && window.GrokSession?.ensureReady) {
        window.GrokSession.ensureReady({
          createIfMissing: true,
          activate: true,
        })
          .then(() => window.GrokSession.ensureTabActive?.())
          .catch((err) =>
            console.warn(
              "[TaskModal] Grok activate failed:",
              err?.message || err,
            ),
          );
      } else if (
        providerKey === "gemini" &&
        window.GeminiSession?.ensureReady
      ) {
        window.GeminiSession.ensureReady({
          createIfMissing: true,
          activate: true,
        })
          .then(() => window.GeminiSession.ensureTabActive?.())
          .catch((err) =>
            console.warn(
              "[TaskModal] Gemini activate failed:",
              err?.message || err,
            ),
          );
      } else if (providerKey === "muse" && window.MuseSession?.ensureReady) {
        window.MuseSession.ensureReady({
          createIfMissing: true,
          activate: true,
        })
          .then(() => window.MuseSession.ensureTabActive?.())
          .catch((err) =>
            console.warn(
              "[TaskModal] Muse activate failed:",
              err?.message || err,
            ),
          );
      } else if (providerKey === "flow") {
        try {
          chrome.runtime
            .sendMessage({ action: "activateFlowTabForExecution" })
            .catch(() => {});
        } catch (_) {}
      }
    } catch (err) {
      console.warn(
        "[TaskModal] _ensureProviderTab error:",
        err?.message || err,
      );
    }
  }
  _checkDuplicateProviderTabs(providerKey, options = {}) {
    if (!chrome?.runtime?.sendMessage) return;
    const { interactive = true } = options;
    TaskModal._dupCheckPending = TaskModal._dupCheckPending || {};
    if (TaskModal._dupCheckPending[providerKey]) return;
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
            `Detected ${count} ${providerName} tabs open. Please close some so the extension runs reliably.`;
          if (interactive && window.customDialog?.confirm) {
            TaskModal._dupCheckPending[providerKey] = true;
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
                  delete TaskModal._dupCheckPending[providerKey];
                }, 3e4);
                if (shouldClose) {
                  chrome.runtime.sendMessage(
                    { action: "closeExtraProviderTabs", provider: providerKey },
                    (closeResp) => {
                      if (closeResp?.ok && closeResp.closed > 0) {
                        window.showNotification?.(
                          window.I18n?.t?.("gen.extraTabsClosed", {
                            count: closeResp.closed,
                          }) || `Closed ${closeResp.closed} extra tabs.`,
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
            console.warn(`[TaskModal] ${msg}`);
          }
        },
      );
    } catch (_) {}
  }
  _updateGrokFrameControls() {
    const adapter = window.ProviderRegistry?.get?.("grok");
    const active = () =>
      this.overlay?.querySelector("#taskProvider")?.value === "grok" &&
      this.overlay?.querySelector("#taskMediaType")?.value === "Video" &&
      this.overlay?.querySelector("#taskGrokVideoInputType")?.value ===
        "Frames";
    const container = this.overlay?.querySelector("#taskGrokFramesGroup");
    const isFrames = active();
    container?.classList.toggle("hidden", !isFrames);
    if (this.overlay?.querySelector("#taskProvider")?.value === "grok") {
      this.overlay
        ?.querySelector("#taskRefImagesGroup")
        ?.classList.toggle("hidden", isFrames);
    }
    if (!isFrames || !adapter || !container) return;
    if (!this._grokFrameData) {
      const initial = { ...(this.task?.provider === "grok" ? this.task : {}) };
      const ids = String(
        this.overlay?.querySelector("#taskFileIds")?.value ??
          initial.ref_file_ids ??
          "",
      )
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      initial.ref_file_ids = ids.join(",");
      initial.ref_thumbnails = { ...(initial.ref_thumbnails || {}) };
      initial.ref_file_names = { ...(initial.ref_file_names || {}) };
      for (const id of ids) {
        const record =
          this._taskTileCache?.[id] || window.pendingUploadFiles?.get(id);
        if (record) {
          initial.ref_thumbnails[id] =
            typeof record === "string" ? record : { ...record };
          initial.ref_file_names[id] =
            record.file_name || initial.ref_file_names[id] || null;
        }
      }
      this._grokFrameData = adapter.normalizeNodeData({
        ...initial,
        grok_mode: "video",
        video_input_type: "Frames",
        model: this.overlay?.querySelector("#taskGrokModel")?.value,
      });
    }
    const sourceIds = String(
      this.overlay?.querySelector("#taskFileIds")?.value || "",
    )
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    for (const id of sourceIds) {
      const record =
        this._taskTileCache?.[id] || window.pendingUploadFiles?.get(id);
      if (record) {
        this._grokFrameData.ref_thumbnails[id] =
          typeof record === "string" ? record : { ...record };
        if (record.file_name)
          this._grokFrameData.ref_file_names[id] = record.file_name;
      }
    }
    container._grokFrameRefresh = () => this._updateGrokFrameControls();
    adapter.renderFrameControls(container, {
      data: this._grokFrameData,
      surface: "task",
      active,
      sourceFileIds: sourceIds.join(","),
      promptCount: this._getTaskPromptCount(),
      promptPreviews: this._getTaskPromptPreviews(),
      onBusy: () => this._updateButtonState(),
      onChange: (refs, sources) => {
        this._taskTileCache || (this._taskTileCache = {});
        for (const id of sources.ref_file_ids.split(",").filter(Boolean)) {
          const thumbnail = sources.ref_thumbnails[id];
          this._taskTileCache[id] = {
            ...(this._taskTileCache[id] || {}),
            ...(typeof thumbnail === "object" ? thumbnail : { thumbnail }),
            file_name: sources.ref_file_names[id],
            type: "image",
          };
        }
        const input = this.overlay?.querySelector("#taskFileIds");
        if (input) input.value = sources.ref_file_ids;
        this._grokFrameData.ref_file_ids = sources.ref_file_ids;
        this._renderTaskRefPreview();
      },
    });
  }
  _renderTaskFormByProvider(providerKey) {
    const isChatGPT = providerKey === "chatgpt";
    const isGrok = providerKey === "grok";
    const grokIsVideo =
      this.overlay?.querySelector("#taskMediaType")?.value === "Video";
    this.overlay
      ?.querySelector("#taskGrokModelGroup")
      ?.classList.toggle("hidden", !isGrok);
    this.overlay
      ?.querySelector("#taskGrokVideoInputTypeGroup")
      ?.classList.toggle("hidden", !isGrok || !grokIsVideo);
    if (isGrok)
      window.ProviderRegistry?.get?.("grok")?.populateReferenceControls?.(
        this.overlay?.querySelector("#taskGrokModel"),
        this.overlay?.querySelector("#taskGrokVideoInputType"),
        {
          mode: grokIsVideo ? "video" : "image",
          modelValue: this.task?.provider === "grok" ? this.task.model : void 0,
          inputType:
            this.task?.provider === "grok"
              ? this.task.video_input_type
              : void 0,
          onChange: () => {
            this._updateRefModeUI();
            this._updateGrokFrameControls();
          },
        },
      );
    this._updateGrokFrameControls();
    const isGemini = providerKey === "gemini";
    const isMuse = providerKey === "muse";
    const _bar = this.overlay?.querySelector("#taskGenCompactBar");
    if (_bar) _bar.dataset.provider = providerKey;
    const mediaTypeGroup = this.overlay?.querySelector("#taskMediaTypeGroup");
    const imageModelGroup = this.overlay?.querySelector("#taskImageModelGroup");
    const videoModelGroup = this.overlay?.querySelector("#taskVideoModelGroup");
    const videoInputTypeRow = this.overlay?.querySelector(
      "#taskVideoInputTypeRow",
    );
    const videoDurationGroup = this.overlay?.querySelector(
      "#taskVideoDurationGroup",
    );
    const quantityGroup = this.overlay?.querySelector("#taskQuantityGroup");
    const ratioSelect = this.overlay?.querySelector("#taskRatio");
    const ratioGroup = this.overlay?.querySelector("#taskRatioGroup");
    const framesGroup = this.overlay?.querySelector("#taskFramesGroup");
    const grokModeGroup = this.overlay?.querySelector("#taskGrokModeGroup");
    const grokDurationGroup = this.overlay?.querySelector(
      "#taskGrokDurationGroup",
    );
    const grokResolutionGroup = this.overlay?.querySelector(
      "#taskGrokResolutionGroup",
    );
    const grokImageQualityGroup = this.overlay?.querySelector(
      "#taskGrokImageQualityGroup",
    );
    const grokModeSelect = this.overlay?.querySelector("#taskGrokMode");
    const mediaTypeSelect = this.overlay?.querySelector("#taskMediaType");
    const syncDownloadResVisibility = () => {
      const autoDownload =
        this.overlay?.querySelector("#taskAutoDownload")?.checked;
      const isVideo =
        this.overlay?.querySelector("#taskMediaType")?.value === "Video";
      const resWrap = this.overlay?.querySelector("#taskDownloadResWrap");
      const videoResWrap = this.overlay?.querySelector(
        "#taskVideoDownloadResWrap",
      );
      if (!autoDownload || isChatGPT || isGrok || isGemini || isMuse) {
        resWrap?.classList.add("hidden");
        videoResWrap?.classList.add("hidden");
      } else if (isVideo) {
        resWrap?.classList.add("hidden");
        videoResWrap?.classList.remove("hidden");
      } else {
        resWrap?.classList.remove("hidden");
        videoResWrap?.classList.add("hidden");
      }
    };
    const mediaToggleVideoBtn = this.overlay?.querySelector(
      '#taskMediaTypeToggle .task-media-btn[data-mode="Video"]',
    );
    const mediaToggleImageBtn = this.overlay?.querySelector(
      '#taskMediaTypeToggle .task-media-btn[data-mode="Image"]',
    );
    const chatgptDeleteGroup = this.overlay?.querySelector(
      "#taskChatgptDeleteAfterGenGroup",
    );
    const geminiDeleteGroup = this.overlay?.querySelector(
      "#taskGeminiDeleteAfterGenGroup",
    );
    const museDeleteGroup = this.overlay?.querySelector(
      "#taskMuseDeleteAfterGenGroup",
    );
    museDeleteGroup?.classList.add("hidden");
    if (isChatGPT) {
      mediaTypeGroup?.classList.remove("hidden");
      if (mediaToggleVideoBtn) mediaToggleVideoBtn.style.display = "none";
      if (mediaToggleImageBtn) mediaToggleImageBtn.style.display = "";
      imageModelGroup?.classList.add("hidden");
      videoModelGroup?.classList.add("hidden");
      this.overlay
        ?.querySelector("#taskChatgptModelGroup")
        ?.classList.remove("hidden");
      this.overlay
        ?.querySelector("#taskGeminiModelGroup")
        ?.classList.add("hidden");
      this.overlay
        ?.querySelector("#taskMuseModelGroup")
        ?.classList.add("hidden");
      geminiDeleteGroup?.classList.add("hidden");
      videoInputTypeRow?.classList.add("hidden");
      videoDurationGroup?.classList.add("hidden");
      quantityGroup?.classList.add("hidden");
      framesGroup?.classList.add("hidden");
      grokModeGroup?.classList.add("hidden");
      grokDurationGroup?.classList.add("hidden");
      grokResolutionGroup?.classList.add("hidden");
      grokImageQualityGroup?.classList.add("hidden");
      chatgptDeleteGroup?.classList.remove("hidden");
      if (this.mode !== "edit" && !this.overlay._chatgptDeleteDefaultLoaded) {
        this.overlay._chatgptDeleteDefaultLoaded = true;
        const deleteToggle = this.overlay.querySelector(
          "#taskChatgptDeleteAfterGen",
        );
        if (deleteToggle) {
          chrome.storage.local.get(["af_settings"], (res) => {
            deleteToggle.checked = !!res.af_settings?.chatgptDeleteAfterGen;
          });
        }
      }
      const mediaTypeSelect2 = this.overlay?.querySelector("#taskMediaType");
      if (mediaTypeSelect2 && mediaTypeSelect2.value !== "Image") {
        mediaTypeSelect2.value = "Image";
        mediaTypeSelect2.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (ratioSelect && ratioGroup) {
        ratioGroup.classList.remove("hidden");
        const adapter = window.ProviderRegistry?.get?.("chatgpt");
        const supportedRatios = adapter?.capabilities?.supportedRatios || [];
        const ratioUiMap = adapter?.capabilities?.ratioUiMap || {};
        const iconMap = {
          story: "\u25AE",
          portrait: "\u25AF",
          square: "\u25A1",
          landscape: "\u25AD",
          widescreen: "\u25AC",
        };
        ratioSelect.innerHTML = supportedRatios
          .map((key) => {
            const label =
              `${iconMap[key] || ""} ${ratioUiMap[key] || key}`.trim();
            return `<option value="${key}">${label}</option>`;
          })
          .join("");
        ratioSelect.disabled = supportedRatios.length === 0;
        ratioSelect.dataset.providerOwner = "chatgpt";
        const remembered = this._providerRatioSelections?.chatgpt?.image;
        const editValue =
          this.mode === "edit" && this.task?.provider === "chatgpt"
            ? this.task?.ratio
            : null;
        const selected = [
          remembered,
          editValue,
          this._afSettings?.chatgptDefaultRatio,
          supportedRatios[0],
        ].find((value) => supportedRatios.includes(value));
        if (selected) ratioSelect.value = selected;
      }
    } else if (isGrok) {
      mediaTypeGroup?.classList.remove("hidden");
      if (mediaToggleVideoBtn) mediaToggleVideoBtn.style.display = "";
      if (mediaToggleImageBtn) mediaToggleImageBtn.style.display = "";
      imageModelGroup?.classList.add("hidden");
      videoModelGroup?.classList.add("hidden");
      videoInputTypeRow?.classList.add("hidden");
      videoDurationGroup?.classList.add("hidden");
      framesGroup?.classList.add("hidden");
      const refImagesGroupGrok = this.overlay?.querySelector(
        "#taskRefImagesGroup",
      );
      refImagesGroupGrok?.classList.remove("hidden");
      quantityGroup?.classList.add("hidden");
      grokModeGroup?.classList.add("hidden");
      chatgptDeleteGroup?.classList.add("hidden");
      this.overlay
        ?.querySelector("#taskChatgptModelGroup")
        ?.classList.add("hidden");
      this.overlay
        ?.querySelector("#taskGeminiModelGroup")
        ?.classList.add("hidden");
      this.overlay
        ?.querySelector("#taskMuseModelGroup")
        ?.classList.add("hidden");
      geminiDeleteGroup?.classList.add("hidden");
      const mediaTypeSelect2 = this.overlay?.querySelector("#taskMediaType");
      if (
        mediaTypeSelect2 &&
        this.mode === "edit" &&
        this.task?.provider === "grok" &&
        !this.overlay._grokInitialSyncDone
      ) {
        this.overlay._grokInitialSyncDone = true;
        const desiredMode = this.task.grok_mode === "video" ? "Video" : "Image";
        if (mediaTypeSelect2.value !== desiredMode) {
          mediaTypeSelect2.value = desiredMode;
          mediaTypeSelect2.dispatchEvent(
            new Event("change", { bubbles: true }),
          );
        }
      }
      const grokModeHidden = this.overlay?.querySelector("#taskGrokMode");
      if (grokModeHidden && mediaTypeSelect2) {
        grokModeHidden.value =
          mediaTypeSelect2.value === "Video" ? "video" : "image";
      }
      const qtyInput = this.overlay?.querySelector("#taskQuantity");
      if (qtyInput) qtyInput.value = "1";
      if (ratioSelect && ratioGroup) {
        ratioGroup.classList.remove("hidden");
        const adapter = window.ProviderRegistry?.get?.("grok");
        const supportedRatios = adapter?.capabilities?.supportedRatios || [];
        const ratioUiMap = adapter?.capabilities?.ratioUiMap || {};
        const iconMap = {
          story: "\u25AE",
          portrait: "\u25AF",
          square: "\u25A1",
          landscape: "\u25AD",
          widescreen: "\u25AC",
        };
        ratioSelect.innerHTML = supportedRatios
          .map((key) => {
            const label =
              `${iconMap[key] || ""} ${ratioUiMap[key] || key}`.trim();
            return `<option value="${key}">${label}</option>`;
          })
          .join("");
        ratioSelect.disabled = supportedRatios.length === 0;
        ratioSelect.dataset.providerOwner = "grok";
        const grokMode =
          mediaTypeSelect2?.value === "Video" ? "video" : "image";
        const remembered = this._providerRatioSelections?.grok?.[grokMode];
        const editValue =
          this.mode === "edit" && this.task?.provider === "grok"
            ? this.task?.ratio
            : null;
        const selected = [
          remembered,
          editValue,
          this._afSettings?.grokDefaultRatio,
          supportedRatios[0],
        ].find((value) => supportedRatios.includes(value));
        if (selected) ratioSelect.value = selected;
      }
      const syncGrokVideoVisibility = () => {
        const provider = this.overlay?.querySelector("#taskProvider")?.value;
        if (provider !== "grok") return;
        const mtSel = this.overlay?.querySelector("#taskMediaType");
        const isVideoMode = mtSel?.value === "Video";
        if (isVideoMode) {
          grokDurationGroup?.classList.remove("hidden");
          grokResolutionGroup?.classList.remove("hidden");
          grokImageQualityGroup?.classList.add("hidden");
        } else {
          grokDurationGroup?.classList.add("hidden");
          grokResolutionGroup?.classList.add("hidden");
          grokImageQualityGroup?.classList.remove("hidden");
        }
        const grokModeHidden2 = this.overlay?.querySelector("#taskGrokMode");
        if (grokModeHidden2 && mtSel) {
          grokModeHidden2.value = isVideoMode ? "video" : "image";
        }
      };
      syncGrokVideoVisibility();
      const mtSelBind = this.overlay?.querySelector("#taskMediaType");
      if (mtSelBind && !this.overlay._grokVideoToggleBound) {
        mtSelBind.addEventListener("change", syncGrokVideoVisibility);
        this.overlay._grokVideoToggleBound = true;
      }
    } else if (isGemini) {
      this._refreshProviderModelOptions("gemini");
      mediaTypeGroup?.classList.remove("hidden");
      if (mediaToggleVideoBtn) mediaToggleVideoBtn.style.display = "";
      if (mediaToggleImageBtn) mediaToggleImageBtn.style.display = "";
      imageModelGroup?.classList.add("hidden");
      videoModelGroup?.classList.add("hidden");
      this.overlay
        ?.querySelector("#taskChatgptModelGroup")
        ?.classList.add("hidden");
      this.overlay
        ?.querySelector("#taskGeminiModelGroup")
        ?.classList.remove("hidden");
      this.overlay
        ?.querySelector("#taskMuseModelGroup")
        ?.classList.add("hidden");
      videoInputTypeRow?.classList.add("hidden");
      videoDurationGroup?.classList.add("hidden");
      framesGroup?.classList.add("hidden");
      quantityGroup?.classList.add("hidden");
      chatgptDeleteGroup?.classList.add("hidden");
      geminiDeleteGroup?.classList.remove("hidden");
      grokModeGroup?.classList.add("hidden");
      grokDurationGroup?.classList.add("hidden");
      grokResolutionGroup?.classList.add("hidden");
      grokImageQualityGroup?.classList.add("hidden");
      const mediaTypeSelect2 = this.overlay?.querySelector("#taskMediaType");
      const renderRatio = () => {
        if (this.overlay?.querySelector("#taskProvider")?.value !== "gemini")
          return;
        ratioGroup?.classList.remove("hidden");
        const media = mediaTypeSelect2?.value === "Video" ? "video" : "image";
        const configured =
          window.ProviderConfigManager?.safeGetRatiosSync?.("gemini", media) ||
          [];
        const ratios = configured.map((item) => item.value).filter(Boolean);
        const map = configured.reduce((result, item) => {
          if (item.value) result[item.value] = item.label || item.value;
          return result;
        }, {});
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
        if (ratioSelect) {
          ratioSelect.innerHTML = ratios
            .map((key) => {
              const label = `${iconMap[key] || ""} ${map[key] || key}`.trim();
              return `<option value="${key}">${label}</option>`;
            })
            .join("");
          ratioSelect.disabled = ratios.length === 0;
          ratioSelect.dataset.providerOwner = "gemini";
          const editValue = this.mode === "edit" ? this.task?.ratio : null;
          const remembered = this._providerRatioSelections?.gemini?.[media];
          const configuredDefault =
            media === "video" ? this._afSettings?.geminiVideoRatio : null;
          const selected = [
            remembered,
            editValue,
            configuredDefault,
            ratios[0],
          ].find((value) => ratios.includes(value));
          if (selected) ratioSelect.value = selected;
        }
      };
      renderRatio();
      if (mediaTypeSelect2 && !this.overlay._geminiMediaBound) {
        mediaTypeSelect2.addEventListener("change", renderRatio);
        this.overlay._geminiMediaBound = true;
      }
      if (this.mode !== "edit" && !this.overlay._geminiDeleteDefaultLoaded) {
        this.overlay._geminiDeleteDefaultLoaded = true;
        chrome.storage.local.get(["af_settings"], (res) => {
          const toggle = this.overlay?.querySelector(
            "#taskGeminiDeleteAfterGen",
          );
          if (toggle) toggle.checked = !!res.af_settings?.geminiDeleteAfterGen;
        });
      }
      const qty = this.overlay?.querySelector("#taskQuantity");
      if (qty) qty.value = "1";
    } else if (isMuse) {
      const museSupports =
        window.ProviderConfigManager?.safeGetSupportsSync?.("muse") || {};
      const museSupportsVideo = museSupports.video === true;
      const museSupportsDeleteAfterGen = museSupports.delete_after_gen === true;
      if (mediaToggleVideoBtn)
        mediaToggleVideoBtn.style.display = museSupportsVideo ? "" : "none";
      if (mediaToggleImageBtn) mediaToggleImageBtn.style.display = "";
      if (!museSupportsVideo && mediaTypeSelect?.value === "Video") {
        mediaTypeSelect.value = "Image";
        mediaTypeSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
      videoInputTypeRow?.classList.add("hidden");
      videoDurationGroup?.classList.add("hidden");
      framesGroup?.classList.add("hidden");
      imageModelGroup?.classList.add("hidden");
      videoModelGroup?.classList.add("hidden");
      quantityGroup?.classList.add("hidden");
      this.overlay
        ?.querySelector("#taskChatgptModelGroup")
        ?.classList.add("hidden");
      this.overlay
        ?.querySelector("#taskGeminiModelGroup")
        ?.classList.add("hidden");
      this.overlay
        ?.querySelector("#taskMuseModelGroup")
        ?.classList.remove("hidden");
      this._refreshMuseModelOptions();
      grokModeGroup?.classList.add("hidden");
      grokDurationGroup?.classList.add("hidden");
      grokResolutionGroup?.classList.add("hidden");
      grokImageQualityGroup?.classList.add("hidden");
      chatgptDeleteGroup?.classList.add("hidden");
      geminiDeleteGroup?.classList.add("hidden");
      museDeleteGroup?.classList.toggle("hidden", !museSupportsDeleteAfterGen);
      if (this.mode !== "edit" && !this.overlay._museDeleteDefaultLoaded) {
        this.overlay._museDeleteDefaultLoaded = true;
        const toggle = this.overlay?.querySelector("#taskMuseDeleteAfterGen");
        if (toggle)
          toggle.checked = this._afSettings?.museDeleteAfterGen === true;
      }
      this.overlay
        ?.querySelector("#taskRefImagesGroup")
        ?.classList.toggle("hidden", museSupports.ref_image !== true);
      const museMedia = mediaTypeSelect?.value === "Video" ? "video" : "image";
      const configured =
        window.ProviderConfigManager?.safeGetRatiosSync?.("muse", museMedia) ||
        [];
      const ratios = configured
        .map((item) => item?.value || item)
        .filter(Boolean);
      const labels = configured.reduce((map, item) => {
        const value = item?.value || item;
        if (value) map[value] = item?.label || value;
        return map;
      }, {});
      if (ratioSelect && ratioGroup) {
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
        ratioGroup.classList.remove("hidden");
        ratioSelect.innerHTML = ratios
          .map((value) => {
            const label = labels[value] || value;
            return `<option value="${this.escapeAttr(value)}">${this.escapeHtml(iconMap[value] ? `${iconMap[value]} ${label}` : label)}</option>`;
          })
          .join("");
        ratioSelect.disabled = ratios.length === 0;
        ratioSelect.dataset.providerOwner = "muse";
        const selected = [
          this.task?.provider === "muse" ? this.task?.ratio : null,
          this.mode !== "edit" ? this._afSettings?.museDefaultRatio : null,
          configured.find((item) => item?.is_default === true)?.value,
          ratios[0],
        ].find((value) => ratios.includes(value));
        if (selected) ratioSelect.value = selected;
      }
      const qty = this.overlay?.querySelector("#taskQuantity");
      if (qty) qty.value = "1";
    } else {
      mediaTypeGroup?.classList.remove("hidden");
      if (mediaToggleVideoBtn) mediaToggleVideoBtn.style.display = "";
      if (mediaToggleImageBtn) mediaToggleImageBtn.style.display = "";
      quantityGroup?.classList.remove("hidden");
      ratioGroup?.classList.remove("hidden");
      grokModeGroup?.classList.add("hidden");
      grokDurationGroup?.classList.add("hidden");
      grokResolutionGroup?.classList.add("hidden");
      grokImageQualityGroup?.classList.add("hidden");
      chatgptDeleteGroup?.classList.add("hidden");
      this.overlay
        ?.querySelector("#taskChatgptModelGroup")
        ?.classList.add("hidden");
      this.overlay
        ?.querySelector("#taskGeminiModelGroup")
        ?.classList.add("hidden");
      this.overlay
        ?.querySelector("#taskMuseModelGroup")
        ?.classList.add("hidden");
      geminiDeleteGroup?.classList.add("hidden");
      const mediaTypeSelect2 = this.overlay?.querySelector("#taskMediaType");
      if (mediaTypeSelect2) mediaTypeSelect2.dispatchEvent(new Event("change"));
      this._updateRatioOptions();
    }
    syncDownloadResVisibility();
    try {
      this._applyTaskVoicePickerVisibility();
    } catch (_) {}
    try {
      this._applyTaskCharacterPickerVisibility();
    } catch (_) {}
    this._updateGrokFrameControls();
  }
  _updateRatioOptions() {
    const ratioSelect = this.overlay?.querySelector("#taskRatio");
    const mediaTypeSelect = this.overlay?.querySelector("#taskMediaType");
    if (!ratioSelect) return;
    const provider = this.overlay?.querySelector("#taskProvider")?.value;
    if (
      provider === "chatgpt" ||
      provider === "grok" ||
      provider === "gemini" ||
      provider === "muse"
    )
      return;
    const isVideo = mediaTypeSelect?.value === "Video";
    const mode = isVideo ? "video" : "image";
    const ratios =
      window.ProviderConfigManager?.safeGetRatiosSync?.("flow", mode) || [];
    if (ratios.length === 0) {
      ratioSelect.innerHTML = "";
      ratioSelect.disabled = true;
      console.info(
        `[TaskModal] Flow ${mode} ratios unavailable from provider config`,
      );
      return;
    }
    ratioSelect.disabled = false;
    const _icon = (v) => {
      const s = String(v || "").trim();
      if (s === "16:9") return "\u25AC";
      if (s === "4:3" || s === "3:2") return "\u25AD";
      if (s === "1:1") return "\u25A1";
      if (s === "3:4" || s === "2:3") return "\u25AF";
      if (s === "9:16") return "\u25AE";
      return "\u25C7";
    };
    const options = ratios.map((r) => {
      const value = typeof r === "string" ? r : r.value || r;
      return { value, label: `${_icon(value)} ${value}` };
    });
    ratioSelect.innerHTML = options
      .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
      .join("");
    ratioSelect.dataset.providerOwner = "flow";
    const validValues = options.map((o) => o.value);
    const remembered = this._providerRatioSelections?.flow?.[mode];
    const configuredDefault = isVideo
      ? this._afSettings?.defaultVideoRatio
      : this._afSettings?.defaultImageRatio;
    const selected = [
      remembered,
      configuredDefault,
      this._afSettings?.aspectRatio,
      validValues[0],
    ].find((value) => validValues.includes(value));
    if (selected) ratioSelect.value = selected;
  }
  _updateDownloadResolutionOptions() {
    if (!this.overlay) return;
    const fillSelect = (selectEl, mode) => {
      if (!selectEl) return;
      const fallback =
        mode === "video"
          ? [
              { value: "720p", label: "720p" },
              { value: "1080p", label: "1080p" },
              { value: "4k", label: "4K (Ultra)" },
            ]
          : [
              { value: "1k", label: "1K" },
              { value: "2k", label: "2K (Pro)" },
              { value: "4k", label: "4K (Ultra)" },
            ];
      const options =
        window.ProviderConfigManager?.getDownloadResolutionsSync?.(
          "flow",
          mode,
        );
      const list =
        Array.isArray(options) && options.length > 0 ? options : fallback;
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
    fillSelect(this.overlay.querySelector("#taskDownloadResolution"), "image");
    fillSelect(
      this.overlay.querySelector("#taskVideoDownloadResolution"),
      "video",
    );
  }
  async _scanRefFileNames(taskId, fileIdsStr) {
    if (!fileIdsStr || !taskId || typeof MessageBridge === "undefined") return;
    const idsToScan = fileIdsStr
      .split(",")
      .map((s) => s.trim())
      .filter((id) => id && !id.startsWith("upload_"));
    if (!idsToScan.length) return;
    try {
      const owner = await window.storageManager?.getTask(taskId);
      if (!owner) return;
      const baselines = Object.fromEntries(
        idsToScan.map((id) => {
          const saved = owner.ref_thumbnails?.[id];
          return [
            id,
            {
              ...(typeof saved === "string"
                ? { thumbnail: saved }
                : saved || {}),
              file_name: owner.ref_file_names?.[id] || saved?.file_name || "",
            },
          ];
        }),
      );
      const scanResult = await this._scanTaskRefThumbnails(
        idsToScan,
        baselines,
        owner.project_id,
      );
      const task = await window.storageManager?.getTask(taskId);
      if (!task) return;
      const currentIds = new Set(
        String(task.ref_file_ids || "")
          .split(",")
          .map((id) => id.trim()),
      );
      const fileNameMap = {};
      const thumbMap = {};
      for (const id of idsToScan) {
        const info = scanResult?.results?.[id];
        if (!currentIds.has(id) || !info?.file_name) continue;
        const saved = task.ref_thumbnails?.[id];
        const previous = {
          ...(typeof saved === "string" ? { thumbnail: saved } : saved || {}),
          file_name: task.ref_file_names?.[id] || saved?.file_name || "",
        };
        const merged = this._mergeTaskRefScanRecord(id, previous, info);
        if (merged._crossProject) continue;
        delete merged._crossProject;
        fileNameMap[id] = merged.media_uuid || merged.file_name;
        if (merged.thumbnail || (merged.type === "video" && merged.video_url))
          thumbMap[id] = merged;
      }
      if (Object.keys(fileNameMap).length || Object.keys(thumbMap).length) {
        task.ref_file_names = {
          ...(task.ref_file_names || {}),
          ...fileNameMap,
        };
        task.ref_thumbnails = { ...(task.ref_thumbnails || {}), ...thumbMap };
        await window.storageManager.saveTask(task);
        console.log(
          "[TaskModal] Scanned ref_file_names:",
          Object.keys(fileNameMap).length,
          "identities",
        );
      }
    } catch (error) {
      console.warn("[TaskModal] _scanRefFileNames error:", error);
    }
  }
  async _cacheRefImageBlobs(taskData) {
    if (!window.PendingUploadStore || !taskData.ref_file_ids) return;
    const refIds = (taskData.ref_file_ids || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (refIds.length === 0) return;
    const thumbs = taskData.ref_thumbnails || {};
    for (const id of refIds) {
      if (await window.PendingUploadStore.hasCachedFile?.(id)) continue;
      if (id.startsWith("upload_")) continue;
      const thumbUrl = thumbs[id] || MediaRegistry?.getThumb(id);
      if (
        !thumbUrl ||
        typeof thumbUrl !== "string" ||
        !thumbUrl.startsWith("http")
      )
        continue;
      try {
        const fetchUrl =
          thumbUrl.includes("lh3.") ||
          thumbUrl.includes("googleusercontent.com")
            ? thumbUrl.split("=")[0]
            : thumbUrl;
        let resp;
        const _mp = window._getMediaUrlPattern?.() || "getMediaUrlRedirect";
        if (fetchUrl.includes(_mp)) {
          resp = await window.MessageBridge?.sendToContentScript(
            "fetchImageAsBase64",
            { url: fetchUrl },
          );
          if (!resp?.success) {
            resp = await new Promise((resolve, reject) => {
              chrome.runtime.sendMessage(
                { action: "fetchBlob", url: fetchUrl, expectImage: true },
                (r) => {
                  if (chrome.runtime.lastError)
                    return reject(new Error(chrome.runtime.lastError.message));
                  resolve(r);
                },
              );
            });
          }
        } else {
          resp = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
              { action: "fetchBlob", url: fetchUrl, expectImage: true },
              (r) => {
                if (chrome.runtime.lastError)
                  return reject(new Error(chrome.runtime.lastError.message));
                resolve(r);
              },
            );
          });
        }
        if (resp?.success && resp.base64) {
          const binary = atob(resp.base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++)
            bytes[i] = binary.charCodeAt(i);
          const contentType = resp.contentType || "image/png";
          const blob = new Blob([bytes], { type: contentType });
          const file = new File([blob], `ref_${id.substring(0, 8)}.png`, {
            type: contentType,
          });
          await PendingUploadStore.cacheUploaded(id, file);
          console.log(
            `[TaskModal] Proactive cached blob for ref ${id.substring(0, 8)}`,
          );
        }
      } catch (e) {
        console.warn(
          `[TaskModal] Failed to cache blob for ref ${id.substring(0, 8)}:`,
          e.message,
        );
      }
    }
  }
  _renderResultsTab() {
    if (!this.task)
      return `<p style="color: var(--muted-foreground); font-size: 12px;">${t("tasks.noData")}</p>`;
    const fileIds = (this.task.result_file_ids || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const hasResults = fileIds.length > 0;
    const isPortrait = ["9:16", "3:4", "D\u1ECDc"].includes(this.task.ratio);
    const isLandscape = ["16:9", "4:3", "Ngang"].includes(this.task.ratio);
    const ratioClass = isPortrait
      ? "ratio-portrait"
      : isLandscape
        ? "ratio-landscape"
        : "";
    const statusText =
      this.task.status === "completed"
        ? t("tasks.statusCompleted")
        : this.task.status === "failed"
          ? t("tasks.statusFailed")
          : this.task.status === "running"
            ? t("tasks.statusRunning")
            : t("tasks.statusPending");
    const statusClass = this.task.status || "pending";
    const isExternal = this._isExternalProvider();
    const downloadAllLabel = isExternal
      ? `${t("tasks.downloadAll")} <span class="task-result-quality-hint">(${t("tasks.originalQuality") || "Original"})</span>`
      : t("tasks.downloadAll");
    let resultsHtml = "";
    if (hasResults) {
      resultsHtml = `
        <div class="task-result-header">
          <span class="task-result-status ${statusClass}">${statusText}</span>
          <button class="btn btn-secondary btn-sm" id="downloadAllResultsBtn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            ${downloadAllLabel}
          </button>
        </div>
        <div class="task-result-grid">
          ${fileIds
            .map(
              (id) => `
            <div class="task-result-item ${ratioClass}" data-file-id="${this.escapeAttr(id)}">
              <div class="task-result-thumb" data-result-id="${this.escapeAttr(id)}">
                <div class="task-result-placeholder">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                </div>
              </div>
              <button class="task-result-download-btn" data-file-id="${this.escapeAttr(id)}" title="${t("tasks.downloadTitle")}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              </button>
            </div>
          `,
            )
            .join("")}
        </div>`;
    } else {
      resultsHtml = `
        <div class="task-result-header">
          <span class="task-result-status ${statusClass}">${statusText}</span>
        </div>
        <div class="task-result-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          <p>${t("tasks.noResults")}</p>
        </div>`;
    }
    const errorLog = this.task.error_message || "";
    const logsHtml = `
      <div class="task-result-logs">
        <div class="task-result-logs-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
          ${t("tasks.logsLabel")}
        </div>
        <div class="task-result-logs-body">
          ${errorLog ? `<div class="task-log-entry task-log-error">${this.escapeHtml(errorLog)}</div>` : `<div class="task-log-empty">${t("tasks.noLogs")}</div>`}
        </div>
      </div>`;
    return resultsHtml + logsHtml;
  }
  _bindResultsTab() {
    if (!this.overlay || !this.task) return;
    this.overlay.querySelectorAll(".task-modal-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        this.overlay
          .querySelectorAll(".task-modal-tab")
          .forEach((t2) => t2.classList.remove("active"));
        tab.classList.add("active");
        const tabName = tab.dataset.tab;
        const configTab = this.overlay.querySelector("#taskConfigTab");
        const resultsTab = this.overlay.querySelector("#taskResultsTab");
        if (tabName === "config") {
          configTab?.classList.remove("hidden");
          resultsTab?.classList.add("hidden");
        } else {
          configTab?.classList.add("hidden");
          resultsTab?.classList.remove("hidden");
          this._loadResultThumbnails();
        }
      });
    });
    const isVideoTask =
      this.task?.media_type === "Video" || this.task?.gen_type === "Video";
    const dlMediaType = isVideoTask ? "video" : "image";
    const downloadAllBtn = this.overlay.querySelector("#downloadAllResultsBtn");
    downloadAllBtn?.addEventListener("click", async () => {
      const fileIds = (this.task.result_file_ids || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (fileIds.length === 0) return;
      const fileNames = this.task.result_file_names || {};
      const resolvedFileNames = { ...fileNames };
      if (isVideoTask && !this._isExternalProvider() && window.MessageBridge) {
        const savedThumbs = this.task.result_thumbnails || {};
        for (const fileId of fileIds) {
          const media = savedThumbs[fileId];
          const sourceUrl =
            typeof media === "string"
              ? media
              : media?.video_url ||
                media?.source_thumbnail ||
                media?.thumbnail ||
                "";
          if (!sourceUrl) continue;
          const identity = await window.MessageBridge.resolveVideoPlaybackUrl(
            fileId,
            {
              fileName: resolvedFileNames[fileId] || "",
              sourceUrl,
              forceDomResolve: false,
              skipMediaApiResolve: true,
              activationTimeoutMs: 0,
            },
          ).catch(() => null);
          if (
            /^[A-Za-z0-9_-]{32,1024}$/.test(
              String(identity?.persistent_media_id || ""),
            )
          ) {
            resolvedFileNames[fileId] = identity.persistent_media_id;
          }
        }
      }
      if (this._isExternalProvider()) {
        const savedThumbs = this.task.result_thumbnails || {};
        let okCount = 0,
          failCount = 0;
        for (let idx = 0; idx < fileIds.length; idx++) {
          const id = fileIds[idx];
          const thumbObj = savedThumbs[id];
          const url =
            typeof thumbObj === "object" && thumbObj?.thumbnail
              ? thumbObj.thumbnail
              : typeof thumbObj === "string"
                ? thumbObj
                : "";
          if (!url) {
            failCount++;
            continue;
          }
          const isVid =
            (typeof thumbObj === "object" && thumbObj?.type === "video") ||
            isVideoTask;
          const ext = isVid ? "mp4" : "png";
          const filename = await this._buildExternalFilename(
            this.task.prompt,
            idx + 1,
            ext,
          );
          const providerMeta = this.task.result_provider_urls?.[id] || {};
          const ok = await this._downloadExternalUrl(url, filename, {
            ...providerMeta,
            isVideo: isVid,
          });
          if (ok) okCount++;
          else failCount++;
        }
        const I = window.I18n;
        if (okCount > 0 && failCount === 0) {
          window.showNotification?.(
            I?.t("download.batchSuccess", { count: okCount }) ||
              `Downloaded ${okCount} files`,
            "success",
            2e3,
          );
        } else if (okCount > 0 && failCount > 0) {
          window.showNotification?.(
            I?.t("download.batchPartial", { ok: okCount, fail: failCount }) ||
              `Downloaded ${okCount} files, ${failCount} failed`,
            "warning",
            4e3,
          );
        } else if (failCount > 0) {
          window.showNotification?.(
            I?.t("tasks.downloadExpiredAll") ||
              "No files downloaded \u2014 CDN URL may have expired. Re-run the task to get fresh URLs.",
            "error",
            5e3,
          );
        }
        return;
      }
      if (window.DownloadHelper) {
        if (fileIds.length === 1) {
          DownloadHelper.showModal({
            tileId: fileIds[0],
            fileName: resolvedFileNames[fileIds[0]] || null,
            promptText: this.task.prompt || this.task.task_name || "task",
            taskName: this.task.task_name || null,
            index: 1,
            mediaType: dlMediaType,
            apiDownload: async ({
              tileId,
              resolution,
              watermarkMode,
              plannedFilename,
            }) => {
              const result =
                await DownloadHelper.downloadPersistedFlowTaskResult({
                  task: this.task,
                  tileId,
                  index: 1,
                  resolution,
                  mediaType: dlMediaType,
                  watermarkMode,
                  plannedFilename,
                });
              if (result?.api && !result.ok)
                console.warn(
                  "[TaskModal] Flow API download failed; DOM fallback blocked:",
                  result.error || "unknown",
                );
              return result?.api === true && result.ok === true;
            },
            apiOnly: true,
          });
        } else {
          DownloadHelper.showBatchModal({
            tileIds: fileIds,
            fileNames: resolvedFileNames,
            promptText: this.task.prompt || this.task.task_name || "task",
            taskName: this.task.task_name || null,
            mediaType: dlMediaType,
            apiDownload: async ({
              tileId,
              resolution,
              watermarkMode,
              plannedFilename,
            }) => {
              const result =
                await DownloadHelper.downloadPersistedFlowTaskResult({
                  task: this.task,
                  tileId,
                  index: fileIds.indexOf(tileId) + 1,
                  resolution,
                  mediaType: dlMediaType,
                  watermarkMode,
                  plannedFilename,
                });
              if (result?.api && !result.ok)
                console.warn(
                  "[TaskModal] Flow API batch item failed; DOM fallback blocked:",
                  result.error || "unknown",
                );
              return result?.api === true && result.ok === true;
            },
            apiOnly: true,
          });
        }
      }
    });
    this.overlay
      .querySelectorAll(".task-result-download-btn")
      .forEach((btn, idx) => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const fileId = btn.dataset.fileId;
          if (!fileId) return;
          if (this._isExternalProvider()) {
            const savedThumbs = this.task.result_thumbnails || {};
            const thumbObj = savedThumbs[fileId];
            const url =
              typeof thumbObj === "object" && thumbObj?.thumbnail
                ? thumbObj.thumbnail
                : typeof thumbObj === "string"
                  ? thumbObj
                  : "";
            if (!url) {
              window.showNotification?.(
                window.I18n?.t("tasks.downloadExpiredMsg") ||
                  "Could not download the file. The URL may have expired \u2014 rerun the task to refresh.",
                "error",
              );
              return;
            }
            const isVid =
              (typeof thumbObj === "object" && thumbObj?.type === "video") ||
              isVideoTask;
            const ext = isVid ? "mp4" : "png";
            const filename = await this._buildExternalFilename(
              this.task.prompt,
              idx + 1,
              ext,
            );
            const providerMeta = this.task.result_provider_urls?.[fileId] || {};
            const ok = await this._downloadExternalUrl(url, filename, {
              ...providerMeta,
              isVideo: isVid,
            });
            const I = window.I18n;
            if (ok) {
              window.showNotification?.(
                I?.t("download.downloading") || "Downloading...",
                "success",
                1500,
              );
            }
            return;
          }
          const fileNames = this.task.result_file_names || {};
          let fileName = fileNames[fileId] || null;
          if (isVideoTask && window.MessageBridge) {
            const media = this.task.result_thumbnails?.[fileId];
            const sourceUrl =
              typeof media === "string"
                ? media
                : media?.video_url ||
                  media?.source_thumbnail ||
                  media?.thumbnail ||
                  "";
            if (sourceUrl) {
              const identity =
                await window.MessageBridge.resolveVideoPlaybackUrl(fileId, {
                  fileName: fileName || "",
                  sourceUrl,
                  forceDomResolve: false,
                  skipMediaApiResolve: true,
                  activationTimeoutMs: 0,
                }).catch(() => null);
              if (
                /^[A-Za-z0-9_-]{32,1024}$/.test(
                  String(identity?.persistent_media_id || ""),
                )
              ) {
                fileName = identity.persistent_media_id;
              }
            }
          }
          if (window.DownloadHelper) {
            DownloadHelper.showModal({
              tileId: fileId,
              fileName,
              promptText: this.task.prompt || this.task.task_name || "task",
              taskName: this.task.task_name || null,
              index: idx + 1,
              mediaType: dlMediaType,
              apiDownload: async ({
                tileId,
                resolution,
                watermarkMode,
                plannedFilename,
              }) => {
                const result =
                  await DownloadHelper.downloadPersistedFlowTaskResult({
                    task: this.task,
                    tileId,
                    index: idx + 1,
                    resolution,
                    mediaType: dlMediaType,
                    watermarkMode,
                    plannedFilename,
                  });
                if (result?.api && !result.ok)
                  console.warn(
                    "[TaskModal] Flow API single download failed; DOM fallback blocked:",
                    result.error || "unknown",
                  );
                return result?.api === true && result.ok === true;
              },
              apiOnly: true,
            });
          } else if (window.MessageBridge) {
            const resolution = isVideoTask
              ? this.task.video_download_resolution || "720p"
              : this.task.download_resolution || "1k";
            window.MessageBridge.downloadTileMedia(
              fileId,
              null,
              this.task.task_name || "task",
              fileName,
              resolution,
              null,
              null,
              isVideoTask ? resolution : null,
            ).catch(() => {});
          }
        });
      });
  }
  _isExternalProvider() {
    const p = this.task?.provider;
    return p === "chatgpt" || p === "grok" || p === "gemini";
  }
  async _downloadExternalUrl(url, filename, providerMeta = {}) {
    if (!url || !filename) return false;
    const provider = this.task?.provider;
    let resp = null;
    if (
      provider === "gemini" &&
      providerMeta.isVideo &&
      providerMeta.fingerprint &&
      providerMeta.tab_id &&
      window.MessageBridge?.geminiDownloadVideoNative
    ) {
      const nativeResult = await window.MessageBridge.geminiDownloadVideoNative(
        {
          tabId: providerMeta.tab_id,
          fingerprint: providerMeta.fingerprint,
          filename,
          removeWatermark: window.WatermarkClient?.enabled?.("video") === true,
        },
      ).catch(() => null);
      if (nativeResult?.success) return true;
      console.warn(
        "[TaskModal] Gemini native video download failed; falling back to fetch:",
        nativeResult?.error || "GEMINI_NATIVE_VIDEO_DOWNLOAD_FAILED",
      );
    }
    try {
      if (
        provider === "grok" &&
        window.GrokSession?.getTabInfo &&
        window.MessageBridge?.grokFetchImage
      ) {
        const info = await window.GrokSession.getTabInfo();
        if (info?.tabId)
          resp = await window.MessageBridge.grokFetchImage(
            url,
            info.tabId,
          ).catch(() => null);
      } else if (
        provider === "chatgpt" &&
        window.ChatGPTSession?.getTabInfo &&
        window.MessageBridge?.chatGPTFetchImage
      ) {
        const info = await window.ChatGPTSession.getTabInfo();
        if (info?.tabId)
          resp = await window.MessageBridge.chatGPTFetchImage(
            url,
            info.tabId,
          ).catch(() => null);
      } else if (
        provider === "gemini" &&
        window.GeminiSession?.getTabInfo &&
        window.MessageBridge?.geminiFetchMedia
      ) {
        const info = await window.GeminiSession.getTabInfo();
        const isVideo =
          this.task?.media_type === "Video" || this.task?.gen_type === "Video";
        const monitor = window.ProviderConfigManager?.getApiConfigValueSync?.(
          "gemini",
          "generation_monitor",
        )?.[isVideo ? "video" : "image"];
        if (
          info?.tabId &&
          Number.isFinite(Number(monitor?.max_materialized_bytes))
        ) {
          resp = await window.MessageBridge.geminiFetchMedia(
            url,
            info.tabId,
            Number(monitor.max_materialized_bytes),
          ).catch(() => null);
        }
      }
    } catch (_) {
      resp = null;
    }
    if (!resp?.success || !resp.base64) {
      resp = await new Promise((r) => {
        chrome.runtime.sendMessage({ action: "fetchBlob", url }, r);
      }).catch(() => null);
    }
    if (!resp?.success || !resp.base64) {
      const _t3 = await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage(
            { action: "chromeDownload", url, filename },
            (r) => resolve(r),
          );
        } catch (e) {
          resolve({ success: false, error: e.message });
        }
      });
      if (_t3?.success) return true;
      window.showNotification?.(
        window.I18n?.t("tasks.downloadExpiredMsg") ||
          "Could not download the file. The URL may have expired \u2014 rerun the task to refresh.",
        "error",
      );
      return false;
    }
    if (provider === "gemini") {
      const isVideo =
        this.task?.media_type === "Video" || this.task?.gen_type === "Video";
      const downloaded = await window.DownloadHelper.downloadExternalMedia({
        base64: resp.base64,
        mime: resp.mimeType || resp.mime,
        filename,
        mediaType: isVideo ? "video" : "image",
      });
      return downloaded?.success === true;
    }
    try {
      const blob = await (await fetch(resp.base64)).blob();
      const blobUrl = URL.createObjectURL(blob);
      await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: "chromeDownload", url: blobUrl, filename },
          () => resolve(),
        );
      });
      setTimeout(() => URL.revokeObjectURL(blobUrl), 3e4);
      return true;
    } catch (err) {
      console.warn("[TaskModal] _downloadExternalUrl convert error:", err);
      return false;
    }
  }
  async _buildExternalFilename(prompt, urlIdx, ext) {
    const _dlSet = await window.DownloadHelper.getSettings();
    const folder = _dlSet.folder;
    const template = _dlSet.template;
    const taskName = this.task?.task_name || null;
    return window.DownloadHelper.buildFilename({
      template,
      project: _dlSet.project || window._currentProjectName,
      prompt: prompt || this.task?.prompt || this.task?.task_name,
      index: urlIdx,
      taskName,
      folder,
      ext,
    });
  }
  _renderResolvedTaskMedia(el, info, fallbackVideo = false) {
    if (!el || !info?.thumbnail) return;
    el.innerHTML = "";
    const isVideo = info.type === "video" || !!info.video_url || fallbackVideo;
    if (isVideo && info.video_url) {
      const video = document.createElement("video");
      video.src = info.video_url;
      if (info.thumbnail !== info.video_url) video.poster = info.thumbnail;
      video.muted = true;
      video.loop = true;
      video.autoplay = true;
      video.playsInline = true;
      el.appendChild(video);
      return;
    }
    const img = document.createElement("img");
    img.src = info.thumbnail;
    img.alt = "result";
    el.appendChild(img);
  }
  _loadResultThumbnails() {
    if (!this.overlay) return;
    const thumbs = this.overlay.querySelectorAll(
      ".task-result-thumb[data-result-id]",
    );
    if (thumbs.length === 0) return;
    const savedThumbs = this.task?.result_thumbnails || {};
    const missingIds = [];
    const expiredFileIds = [];
    const isExternal = this._isExternalProvider();
    const isVideoTask =
      this.task?.media_type === "Video" || this.task?.gen_type === "Video";
    thumbs.forEach((el) => {
      const fileId = el.dataset.resultId;
      const thumbRaw = savedThumbs[fileId];
      const thumbUrl =
        typeof thumbRaw === "object" && thumbRaw?.thumbnail
          ? thumbRaw.thumbnail
          : typeof thumbRaw === "string"
            ? thumbRaw
            : "";
      const isVideo =
        (typeof thumbRaw === "object" && thumbRaw?.type === "video") ||
        isVideoTask;
      if (thumbUrl) {
        el.innerHTML = "";
        if (isVideo) {
          const video = document.createElement("video");
          video.src = thumbUrl;
          video.muted = true;
          video.loop = true;
          video.autoplay = true;
          video.playsInline = true;
          video.onerror = () => {
            if (isExternal) {
              this._renderExpiredPlaceholder(el);
              return;
            }
            expiredFileIds.push(fileId);
            el.dataset.expired = "true";
            this._refreshExpiredThumbnails(expiredFileIds);
          };
          el.appendChild(video);
        } else {
          const img = document.createElement("img");
          img.alt = "result";
          img.src = thumbUrl;
          img.onerror = () => {
            if (isExternal) {
              this._renderExpiredPlaceholder(el);
              return;
            }
            expiredFileIds.push(fileId);
            el.dataset.expired = "true";
            this._refreshExpiredThumbnails(expiredFileIds);
          };
          el.appendChild(img);
        }
      } else {
        missingIds.push(fileId);
        el.innerHTML = '<div class="task-result-shimmer"></div>';
      }
    });
    if (isExternal && missingIds.length > 0) {
      thumbs.forEach((el) => {
        if (missingIds.includes(el.dataset.resultId)) {
          this._renderExpiredPlaceholder(el);
        }
      });
      return;
    }
    if (missingIds.length > 0 && typeof MessageBridge !== "undefined") {
      this._resolveTaskMediaUrlsByUuid(missingIds)
        .catch(() => ({}))
        .then(async (apiResults) => {
          const unresolvedIds = missingIds.filter((id) => !apiResults[id]);
          const domResult = unresolvedIds.length
            ? await MessageBridge.getThumbnailsByIds(unresolvedIds, {
                deep: false,
              }).catch(() => null)
            : null;
          return { results: { ...(domResult?.results || {}), ...apiResults } };
        })
        .then((result) => {
          const results = result?.results || {};
          const newThumbs = { ...savedThumbs };
          let changed = false;
          thumbs.forEach((el) => {
            const fileId = el.dataset.resultId;
            if (!missingIds.includes(fileId)) return;
            const info = results[fileId];
            if (info?.thumbnail) {
              this._renderResolvedTaskMedia(el, info, isVideoTask);
              const previous = newThumbs[fileId];
              const previousObj =
                previous && typeof previous === "object" ? previous : {};
              newThumbs[fileId] = {
                ...previousObj,
                thumbnail: info.thumbnail,
                type:
                  info.type ||
                  previousObj.type ||
                  (isVideoTask ? "video" : "image"),
                file_name: info.file_name || previousObj.file_name || "",
                ...(info.video_url && { video_url: info.video_url }),
                ...(info.media_uuid && { media_uuid: info.media_uuid }),
                ...(info.persistent_media_id && {
                  persistent_media_id: info.persistent_media_id,
                }),
                ...(info.identity_kind && {
                  identity_kind: info.identity_kind,
                }),
                ...(info.identity_durability && {
                  identity_durability: info.identity_durability,
                }),
              };
              changed = true;
            } else {
              el.innerHTML =
                '<div class="task-result-placeholder"><span style="font-size:10px;opacity:.5">N/A</span></div>';
            }
          });
          if (changed && this.task) {
            this.task.result_thumbnails = newThumbs;
            if (window.storageManager) {
              window.storageManager.saveTask(this.task).catch(() => {});
            }
          }
        })
        .catch(() => {
          thumbs.forEach((el) => {
            if (el.querySelector(".task-result-shimmer")) {
              el.innerHTML =
                '<div class="task-result-placeholder"><span style="font-size:10px;opacity:.5">N/A</span></div>';
            }
          });
        });
    }
  }
  _renderExpiredPlaceholder(el) {
    if (!el) return;
    el.innerHTML = `
      <div class="task-result-placeholder" style="display:flex;flex-direction:column;align-items:center;gap:4px;font-size:10px;opacity:.6;text-align:center;padding:8px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span>URL h\u1EBFt h\u1EA1n</span>
        <span style="opacity:.5;font-size:9px;">Ch\u1EA1y l\u1EA1i task \u0111\u1EC3 t\u1EA3i</span>
      </div>`;
  }
  async _resolveTaskMediaUrlsByUuid(fileIds) {
    const resolved = {};
    if (!window.FlowApiFacade?.resolveMedia) return resolved;
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const savedThumbs = this.task?.result_thumbnails || {};
    await Promise.allSettled(
      (fileIds || []).map(async (fileId) => {
        const previous = savedThumbs[fileId];
        const previousObj =
          previous && typeof previous === "object" ? previous : {};
        const providerData = this.task?.result_provider_urls?.[fileId] || null;
        const mediaUuid = [
          previousObj.media_uuid,
          providerData?.media_uuid,
          fileId,
        ]
          .map((value) => String(value || ""))
          .find((value) => uuidPattern.test(value));
        if (!mediaUuid) return;
        const isVideo =
          previousObj.type === "video" ||
          !!previousObj.video_url ||
          this.task?.media_type === "Video" ||
          this.task?.gen_type === "Video";
        const media = await window.FlowApiFacade.resolveMedia({
          mediaId: mediaUuid,
          mediaType: isVideo ? "video" : "image",
          providerData,
          thumbnail: previousObj,
        }).catch(() => null);
        if (!media?.url) return;
        resolved[fileId] = {
          ...previousObj,
          thumbnail: media.url,
          ...(isVideo && { video_url: media.url }),
          type: isVideo ? "video" : "image",
          media_uuid: mediaUuid,
          persistent_media_id: previousObj.persistent_media_id || mediaUuid,
          identity_kind: previousObj.identity_kind || "flow-api-uuid",
          identity_durability:
            previousObj.identity_durability || "durable-resolver",
        };
      }),
    );
    if (Object.keys(resolved).length) {
      console.log("[TaskMediaIdentity] refreshed task media through Flow API", {
        taskId: this.task?.task_id || null,
        requested: (fileIds || []).length,
        resolved: Object.keys(resolved).length,
      });
    }
    return resolved;
  }
  _refreshExpiredThumbnails(expiredFileIds) {
    if (this._isExternalProvider()) return;
    if (this._refreshTimer) clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(async () => {
      if (!this.overlay || typeof MessageBridge === "undefined") return;
      const fileIdsToRefresh = [...new Set(expiredFileIds)];
      expiredFileIds.length = 0;
      this.overlay
        .querySelectorAll('.task-result-thumb[data-expired="true"]')
        .forEach((el) => {
          el.innerHTML = '<div class="task-result-shimmer"></div>';
        });
      const apiResults = await this._resolveTaskMediaUrlsByUuid(
        fileIdsToRefresh,
      ).catch(() => ({}));
      const unresolvedIds = fileIdsToRefresh.filter((id) => !apiResults[id]);
      const domResult = unresolvedIds.length
        ? await MessageBridge.getThumbnailsByIds(unresolvedIds, {
            deep: false,
          }).catch(() => null)
        : null;
      Promise.resolve({
        results: { ...(domResult?.results || {}), ...apiResults },
      })
        .then((result) => {
          const results = result.results || {};
          const newThumbs = { ...(this.task?.result_thumbnails || {}) };
          let changed = false;
          this.overlay
            .querySelectorAll('.task-result-thumb[data-expired="true"]')
            .forEach((el) => {
              const fileId = el.dataset.resultId;
              const info = results[fileId];
              if (info?.thumbnail) {
                const previous = newThumbs[fileId];
                const previousObj =
                  previous && typeof previous === "object" ? previous : {};
                const isVideo =
                  info.type === "video" ||
                  previousObj.type === "video" ||
                  this.task?.media_type === "Video" ||
                  this.task?.gen_type === "Video";
                this._renderResolvedTaskMedia(el, info, isVideo);
                el.removeAttribute("data-expired");
                newThumbs[fileId] = {
                  ...previousObj,
                  thumbnail: info.thumbnail,
                  type: isVideo
                    ? "video"
                    : info.type || previousObj.type || "image",
                  file_name: info.file_name || previousObj.file_name || "",
                  ...(info.video_url && { video_url: info.video_url }),
                  ...(info.media_uuid && { media_uuid: info.media_uuid }),
                  ...(info.persistent_media_id && {
                    persistent_media_id: info.persistent_media_id,
                  }),
                  ...(info.identity_kind && {
                    identity_kind: info.identity_kind,
                  }),
                  ...(info.identity_durability && {
                    identity_durability: info.identity_durability,
                  }),
                };
                changed = true;
              } else {
                el.innerHTML =
                  '<div class="task-result-placeholder"><span style="font-size:10px;opacity:.5">N/A</span></div>';
                el.removeAttribute("data-expired");
              }
            });
          if (changed && this.task) {
            this.task.result_thumbnails = newThumbs;
            if (window.storageManager) {
              window.storageManager.saveTask(this.task).catch(() => {});
            }
          }
        })
        .catch(() => {
          this.overlay
            ?.querySelectorAll('.task-result-thumb[data-expired="true"]')
            .forEach((el) => {
              el.innerHTML =
                '<div class="task-result-placeholder"><span style="font-size:10px;opacity:.5">N/A</span></div>';
              el.removeAttribute("data-expired");
            });
        });
    }, 500);
  }
  async _initTaskAddonPrompts() {
    const TTL_MS = 60 * 60 * 1e3;
    let addons = [];
    try {
      const cached = await new Promise((resolve) => {
        chrome.storage.local.get(["af_addon_prompts"], (r) =>
          resolve(r.af_addon_prompts),
        );
      });
      const isFresh =
        cached?.data &&
        cached?.timestamp &&
        Date.now() - cached.timestamp < TTL_MS;
      if (isFresh) {
        addons = cached.data;
      } else {
        const resp = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { action: "apiRequest", method: "GET", endpoint: "addon-prompts" },
            resolve,
          );
        });
        if (resp?.success && Array.isArray(resp.data)) {
          addons = resp.data;
          chrome.storage.local.set({
            af_addon_prompts: { data: addons, timestamp: Date.now() },
          });
        } else if (cached?.data) {
          addons = cached.data;
        }
      }
    } catch (e) {
      console.warn("[TaskModal] Load addon prompts failed:", e);
    }
    this._addonPrompts = addons;
    this._renderAddonPromptList();
    if (this.task?.addon_prompt_id) {
      this._selectedAddonPromptId = this.task.addon_prompt_id;
      this._updateAddonTriggerLabel();
    }
    const trigger = this.overlay?.querySelector("#taskAddonPromptTrigger");
    if (trigger) {
      trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        this._openTaskStyleSelectModal();
      });
    }
  }
  _openTaskStyleSelectModal() {
    if (!window.StyleSelectModal) {
      console.warn("[TaskModal] StyleSelectModal not loaded");
      return;
    }
    window.StyleSelectModal.show({
      addons: this._addonPrompts || [],
      selectedId: this._selectedAddonPromptId || null,
      onSelect: (addon) => {
        this._selectedAddonPromptId = addon?.id ? String(addon.id) : null;
        this._updateAddonTriggerLabel();
      },
    });
  }
  _renderAddonPromptList(filter = "") {
    const list = this.overlay?.querySelector("#taskAddonPromptList");
    if (!list) return;
    const filterLower = filter.toLowerCase();
    let html = `<div class="addon-prompt-item none-option ${!this._selectedAddonPromptId ? "selected" : ""}" data-id="">
      <span class="addon-prompt-name">${t("tasks.noStyleSelected")}</span>
    </div>`;
    for (const addon of this._addonPrompts || []) {
      if (
        filterLower &&
        !(addon.name || "").toLowerCase().includes(filterLower)
      )
        continue;
      const isSelected = this._selectedAddonPromptId === String(addon.id);
      const thumb = addon.thumbnail_url
        ? `<img class="addon-prompt-thumb" src="${this.escapeAttr(addon.thumbnail_url)}" alt="${this.escapeAttr(addon.name)}" loading="lazy" />`
        : `<div class="addon-prompt-thumb-placeholder"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z"></path></svg></div>`;
      html += `<div class="addon-prompt-item ${isSelected ? "selected" : ""}" data-id="${addon.id}">
        ${thumb}
        <div class="addon-prompt-info"><div class="addon-prompt-name">${this.escapeHtml(addon.name || t("tasks.noStyleName"))}</div></div>
      </div>`;
    }
    list.innerHTML = html;
    list.querySelectorAll(".addon-prompt-item").forEach((item) => {
      item.addEventListener("click", () => {
        this._selectedAddonPromptId = item.dataset.id || null;
        this._updateAddonTriggerLabel();
        list
          .querySelectorAll(".addon-prompt-item")
          .forEach((i) => i.classList.remove("selected"));
        item.classList.add("selected");
        this.overlay
          ?.querySelector("#taskAddonPromptPopup")
          ?.classList.add("hidden");
      });
    });
  }
  _updateAddonTriggerLabel() {
    const label = this.overlay?.querySelector(
      "#taskAddonPromptTrigger .addon-prompt-label",
    );
    if (!label) return;
    if (this._selectedAddonPromptId) {
      const addon = (this._addonPrompts || []).find(
        (a) => String(a.id) === String(this._selectedAddonPromptId),
      );
      label.textContent = addon?.name || t("tasks.styleLabel");
    } else {
      label.textContent = t("tasks.styleLabel");
    }
  }
  _getSelectedAddonPrompt() {
    if (!this._selectedAddonPromptId) return null;
    return (
      (this._addonPrompts || []).find(
        (a) => String(a.id) === String(this._selectedAddonPromptId),
      ) || null
    );
  }
  _initMentionAutocomplete() {
    const textarea = this.overlay?.querySelector("#taskPrompt");
    if (!textarea) return;
    if (window.MentionMenu && !this._mentionMenu) {
      const refEntries = () => {
        const fileIdsInput = this.overlay?.querySelector("#taskFileIds");
        const ids = fileIdsInput?.value
          ? fileIdsInput.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
        const savedNames = this.task?.ref_image_names || {};
        const seen = new Set();
        const out = [];
        for (const fid of ids) {
          const name = this._refImageNames?.[fid] || savedNames[fid];
          if (!name || seen.has(name)) continue;
          seen.add(name);
          const cached = this._taskTileCache?.[fid];
          const cachedThumb =
            cached && typeof cached === "object"
              ? cached.thumbnail
              : typeof cached === "string"
                ? cached
                : null;
          const saved = this.task?.ref_thumbnails?.[fid];
          const savedThumb =
            typeof saved === "string" ? saved : saved?.thumbnail;
          out.push({
            label: name,
            thumbnail: cachedThumb || savedThumb || null,
            iconSvg: window.MentionMenu.ICONS.ref,
            value: name,
          });
        }
        return out;
      };
      const refTabVisible = () => {
        const refMode =
          this.overlay?.querySelector("#taskRefImageMode")?.value || "all";
        return refMode === "mention" && refEntries().length > 0;
      };
      const groupVisible = (id) => {
        const g = this.overlay?.querySelector(id);
        return !!g && !g.classList.contains("hidden");
      };
      this._mentionMenu = new window.MentionMenu(textarea, {
        getTabs: () => {
          const tabs = [];
          if (refTabVisible()) {
            tabs.push({
              id: "ref",
              label: window.I18n?.t?.("mention.tabRef") || "Ref image",
              iconSvg: window.MentionMenu.ICONS.ref,
              getItems: refEntries,
              buildInsert: (item) =>
                window.MentionMenu.wrapName(item.value, ""),
            });
          }
          if (groupVisible("#taskVoicePickerGroup"))
            tabs.push(window.MentionMenu.voiceTab());
          if (groupVisible("#taskCharacterPickerGroup"))
            tabs.push(window.MentionMenu.charTab());
          return tabs;
        },
        defaultTabId: () => (refTabVisible() ? "ref" : "char"),
      });
      if (window.MentionChips) {
        this._mentionChips = new window.MentionChips(textarea, {
          includeComponents: () =>
            !(
              this.overlay?.querySelector("#taskMediaType")?.value ===
                "Video" &&
              this.overlay?.querySelector("#taskVideoInputType")?.value ===
                "Frames"
            ),
          includeRefs: () =>
            (this.overlay?.querySelector("#taskRefImageMode")?.value ||
              "all") === "mention",
          resolveRef: (name) => {
            const hit = refEntries().find((e) => e.value === name);
            return hit
              ? { found: true, thumbnail: hit.thumbnail }
              : { found: false };
          },
        });
      }
      const syncPickerLock = () => {
        const isFrames =
          this.overlay?.querySelector("#taskMediaType")?.value === "Video" &&
          this.overlay?.querySelector("#taskVideoInputType")?.value ===
            "Frames";
        const comps = isFrames
          ? []
          : window.MentionParser?.parseComponents?.(textarea.value || "") || [];
        const lock = (triggerId, locked, text, type) => {
          const trigger = this.overlay?.querySelector(triggerId);
          if (!trigger) return;
          if (locked) {
            (type === "voice"
              ? this._taskVoicePicker
              : this._taskCharacterPicker
            )?.clearForMention();
            const slug = this.overlay?.querySelector(
              type === "voice" ? "#taskVoiceSlug" : "#taskCharacterSlug",
            );
            if (slug) slug.value = "";
            const field = this.overlay?.querySelector(
              type === "voice"
                ? "#taskVoiceSearchValue"
                : "#taskCharacterSearchValue",
            );
            if (field) field.value = "";
          }
          window.WorkflowEditor?._applyPickerMentionLock?.(
            trigger,
            locked,
            text,
            type,
          );
        };
        lock(
          "#taskVoiceTrigger",
          comps.some((c) => c.type === "voice"),
          window.I18n?.t?.("voice.mentionOverride") ||
            "Using voice from prompt mention",
          "voice",
        );
        lock(
          "#taskCharacterTrigger",
          comps.some((c) => c.type === "char"),
          window.I18n?.t?.("character.mentionOverride") ||
            "Using character from prompt mention",
          "char",
        );
      };
      textarea.addEventListener("input", syncPickerLock);
      syncPickerLock();
    }
    let dropdown = this.overlay?.querySelector("#taskMentionAutocomplete");
    if (!dropdown) {
      dropdown = document.createElement("div");
      dropdown.id = "taskMentionAutocomplete";
      dropdown.className = "mention-autocomplete-dropdown";
      dropdown.style.display = "none";
      this.overlay.appendChild(dropdown);
    }
    ["mousedown", "mouseup", "click", "pointerdown", "pointerup"].forEach(
      (evt) => {
        dropdown.addEventListener(evt, (e) => e.stopPropagation());
      },
    );
    this._mentionDropdown = dropdown;
    this._mentionIndex = -1;
    textarea.addEventListener("input", () =>
      this._handleMentionInput(textarea),
    );
    textarea.addEventListener("keydown", (e) =>
      this._handleMentionKeydown(e, textarea),
    );
    this.overlay
      .querySelector(".task-modal-body")
      ?.addEventListener("scroll", () => this._hideMentionDropdown());
    textarea.addEventListener("blur", () => {
      setTimeout(() => this._hideMentionDropdown(), 150);
    });
  }
  _handleMentionInput(textarea) {
    if (this._mentionMenu) {
      this._hideMentionDropdown();
      return;
    }
    const refMode =
      this.overlay?.querySelector("#taskRefImageMode")?.value || "all";
    if (refMode !== "mention") {
      this._hideMentionDropdown();
      return;
    }
    const text = textarea.value;
    const pos = textarea.selectionStart;
    const beforeCursor = text.substring(0, pos);
    const match = beforeCursor.match(/@(\[[^\]]*|[a-zA-Z0-9_]*)$/);
    if (!match) {
      this._hideMentionDropdown();
      return;
    }
    const query = match[1].toLowerCase();
    const fileIdsInput = this.overlay?.querySelector("#taskFileIds");
    const currentIds = fileIdsInput?.value
      ? fileIdsInput.value
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const savedNames = this.task?.ref_image_names || {};
    const seenNames = new Set();
    const entries = [];
    for (const fid of currentIds) {
      const name = this._refImageNames?.[fid] || savedNames[fid];
      if (!name || seenNames.has(name)) continue;
      if (!name.toLowerCase().includes(query)) continue;
      seenNames.add(name);
      const cached = this._taskTileCache?.[fid];
      const cachedThumb =
        cached && typeof cached === "object"
          ? cached.thumbnail
          : typeof cached === "string"
            ? cached
            : null;
      const savedThumb = this.task?.ref_thumbnails?.[fid];
      const normalizedSavedThumb =
        typeof savedThumb === "string" ? savedThumb : savedThumb?.thumbnail;
      const thumb = cachedThumb || normalizedSavedThumb || null;
      entries.push({ name, fileId: fid, thumb });
      if (entries.length >= 8) break;
    }
    if (entries.length === 0) {
      this._hideMentionDropdown();
      return;
    }
    this._mentionIndex = 0;
    this._mentionNames = entries.map((e) => e.name);
    this._mentionStart = pos - match[1].length - 1;
    const dropdown = this._mentionDropdown;
    if (!dropdown) return;
    dropdown.innerHTML = entries
      .map((entry, i) => {
        const thumbHtml = entry.thumb
          ? `<img class="mention-autocomplete-thumb" src="${this.escapeAttr(entry.thumb)}" alt="" />`
          : '<span class="mention-autocomplete-thumb mention-autocomplete-thumb-placeholder"></span>';
        return `<div class="mention-autocomplete-item ${i === 0 ? "selected" : ""}" data-name="${this.escapeAttr(entry.name)}">${thumbHtml}<span class="mention-autocomplete-name">@${this.escapeHtml(entry.name)}</span></div>`;
      })
      .join("");
    dropdown.style.display = "block";
    const caret = TaskModal._getTextareaCaretCoords(textarea);
    const taRect = textarea.getBoundingClientRect();
    const dropdownMaxHeight = 200;
    const spaceBelow = window.innerHeight - caret.bottom;
    const placeAbove =
      spaceBelow < dropdownMaxHeight && caret.top > dropdownMaxHeight;
    const dropdownWidth = 240;
    let left = Math.max(
      taRect.left,
      Math.min(caret.left, taRect.right - dropdownWidth),
    );
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
        this._selectMention(textarea, item.dataset.name);
      });
    });
  }
  _handleMentionKeydown(e, textarea) {
    const dropdown = this._mentionDropdown;
    if (!dropdown || dropdown.style.display === "none") return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      this._mentionIndex = Math.min(
        this._mentionIndex + 1,
        (this._mentionNames?.length || 1) - 1,
      );
      this._updateMentionSelection();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this._mentionIndex = Math.max(this._mentionIndex - 1, 0);
      this._updateMentionSelection();
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (this._mentionNames?.length > 0) {
        e.preventDefault();
        this._selectMention(textarea, this._mentionNames[this._mentionIndex]);
      }
    } else if (e.key === "Escape") {
      e.stopPropagation();
      this._hideMentionDropdown();
    }
  }
  _updateMentionSelection() {
    this._mentionDropdown
      ?.querySelectorAll(".mention-autocomplete-item")
      .forEach((item, i) => {
        item.classList.toggle("selected", i === this._mentionIndex);
      });
  }
  _selectMention(textarea, name) {
    const text = textarea.value;
    const before = text.substring(0, this._mentionStart);
    const after = text.substring(textarea.selectionStart);
    textarea.value = `${before}@${name} ${after}`;
    textarea.selectionStart = textarea.selectionEnd =
      this._mentionStart + name.length + 2;
    textarea.focus();
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    this._formSnapshot = this._captureFormSnapshot();
    this._lastMentionSelectTime = Date.now();
    setTimeout(() => this._hideMentionDropdown(), 50);
  }
  _hideMentionDropdown() {
    if (this._mentionDropdown) this._mentionDropdown.style.display = "none";
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
  _updateRefModeUI() {
    const modeSelect = this.overlay?.querySelector("#taskRefImageMode");
    const mentionHelper = this.overlay?.querySelector("#taskMentionHelper");
    if (!modeSelect) return;
    const mode = modeSelect.value;
    const refImagesGroup = this.overlay?.querySelector("#taskRefImagesGroup");
    if (refImagesGroup) {
      refImagesGroup.classList.toggle(
        "task-ref-mode-disabled",
        mode === "none",
      );
    }
    if (mentionHelper) {
      mentionHelper.classList.toggle(
        "hidden",
        mode !== "mention" || mode === "none",
      );
    }
    if (mode === "mention") {
      this._refreshMentionHelper();
    }
    const refLimitHint = this.overlay?.querySelector("#taskRefLimitHint");
    const refLimitHintText = this.overlay?.querySelector(
      "#taskRefLimitHintText",
    );
    if (refLimitHint && refLimitHintText) {
      if (mode === "mention") {
        const provider = (
          this.overlay?.querySelector("#taskProvider")?.value ||
          this.task?.provider ||
          "flow"
        ).toLowerCase();
        const mediaType =
          this.overlay?.querySelector("#taskMediaType")?.value || "Image";
        const grokMode = mediaType.toLowerCase();
        const resolvedMode =
          provider === "grok" ? grokMode : mediaType.toLowerCase();
        const isFrames =
          resolvedMode === "video" &&
          this.overlay?.querySelector(
            provider === "grok"
              ? "#taskGrokVideoInputType"
              : "#taskVideoInputType",
          )?.value === "Frames";
        const _hintModel =
          provider === "grok"
            ? this.overlay?.querySelector("#taskGrokModel")?.value
            : this.overlay?.querySelector("#taskMuseModel")?.value ||
              this.overlay?.querySelector("#taskVideoModel")?.value ||
              this.overlay?.querySelector("#taskImageModel")?.value ||
              this.task?.model ||
              "";
        const imageCap =
          typeof ImagePickerModal !== "undefined" &&
          ImagePickerModal.resolveMaxSelections
            ? ImagePickerModal.resolveMaxSelections({
                provider,
                mode: resolvedMode,
                isFrames,
                modelValue: _hintModel,
              })
            : null;
        const totalCap =
          provider === "flow"
            ? window.ProviderRegistry?.get?.("flow")?.getMaxRefImagesTotal?.(
                _hintModel,
              )
            : null;
        const maxRef =
          Number.isInteger(totalCap) && totalCap >= 0
            ? Math.min(imageCap ?? totalCap, totalCap)
            : imageCap;
        const limitText = maxRef === 0 ? "0" : maxRef || "?";
        refLimitHintText.textContent =
          window.I18n?.t?.("gen.refLimitHint", { max: limitText }) ||
          `Max ${limitText} ref images per prompt. Use @image_name in prompt.`;
        refLimitHint.classList.remove("hidden");
      } else {
        refLimitHint.classList.add("hidden");
      }
    }
    this._renderTaskRefPreview();
    this._updateDragHint();
  }
  _refreshMentionHelper() {
    const tagsContainer = this.overlay?.querySelector("#taskMentionHelperTags");
    if (!tagsContainer) return;
    const fileIdsInput = this.overlay?.querySelector("#taskFileIds");
    const ids = (fileIdsInput?.value || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    let html = "";
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const pending = window.pendingUploadFiles?.get(id);
      const name =
        this._refImageNames[id] ||
        this.task?.ref_image_names?.[id] ||
        pending?.mentionName ||
        this._taskTileCache?.[id]?.mentionName ||
        `img_${i + 1}`;
      const thumbnail =
        pending?.thumbnail ||
        this._taskTileCache?.[id]?.thumbnail ||
        window.GenTab?.thumbnailCache?.[id] ||
        "";
      const thumbHtml = thumbnail
        ? `<img class="ref-mention-tag-thumb" src="${this.escapeAttr(thumbnail)}" alt="" />`
        : "";
      html += `<span class="ref-mention-tag" data-name="${this.escapeAttr(name)}">${thumbHtml}<span>@${this.escapeHtml(name)}</span></span>`;
    }
    tagsContainer.innerHTML =
      html ||
      `<span style="opacity:0.5;font-size:11px;">${t("tasks.noImages")}</span>`;
    window.ProviderTabScroll?.bindDrag?.(tagsContainer);
    tagsContainer.querySelectorAll(".ref-mention-tag").forEach((tag) => {
      tag.style.cursor = "pointer";
      tag.addEventListener("click", () => {
        const name = tag.dataset.name;
        if (!name) return;
        const textarea = this.overlay?.querySelector("#taskPrompt");
        if (!textarea) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const mention = `@${name} `;
        textarea.value =
          text.substring(0, start) + mention + text.substring(end);
        textarea.selectionStart = textarea.selectionEnd =
          start + mention.length;
        textarea.focus();
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });
  }
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text || "";
    return div.innerHTML;
  }
  escapeAttr(text) {
    return String(text || "")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}
window.TaskModal = TaskModal;
