class AngleExecution {
  constructor(editor) {
    this.editor = editor;
    this._tileCache = editor._tileCache || new Map();
    this._isRunning = false;
    this._shouldStop = false;
  }
  _log(...args) {
    console.log("[AngleEditor]", ...args);
  }
  async _getGenDefaults() {
    if (this._genDefaults) return this._genDefaults;
    try {
      const result = await new Promise((resolve) => {
        chrome.storage.local.get(["af_settings"], (r) =>
          resolve(r.af_settings || {}),
        );
      });
      this._genDefaults = {
        genType: result.defaultGenType || "Image",
        ratio: result.defaultRatio || "9:16",
        imageModel:
          result.defaultImageModel ||
          window.ModelRegistry?.getDefault("flow", "image") ||
          null,
        videoModel:
          result.defaultVideoModel ||
          window.ModelRegistry?.getDefault("flow", "video") ||
          null,
      };
    } catch (e) {
      this._genDefaults = {
        genType: "Image",
        ratio: "9:16",
        imageModel: window.ModelRegistry?.getDefault("flow", "image") || null,
        videoModel: window.ModelRegistry?.getDefault("flow", "video") || null,
      };
    }
    if (!this._genDefaults.imageModel)
      console.debug(
        "[Tier3] AngleExecution._getGenDefaults: flow.image default model cache miss",
      );
    if (!this._genDefaults.videoModel)
      console.debug(
        "[Tier3] AngleExecution._getGenDefaults: flow.video default model cache miss",
      );
    return this._genDefaults;
  }
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  _getSettingMs(key, fallback) {
    const s = window.storageSettings?.getSettings() || {};
    return s[key] || fallback;
  }
  _getDownloadResolution() {
    const el = document.getElementById("genTabDownloadResolution");
    if (el?.value) return el.value;
    const s = window.storageSettings?.getSettings?.() || {};
    return s.downloadResolution || "1k";
  }
  async runGeneration(state) {
    const t = (key, params) => (window.I18n ? window.I18n.t(key, params) : key);
    if (!state.refImageId) {
      throw new Error(t("angles.errorNoRefImage"));
    }
    if (!state.preset || !state.preset.base_prompt) {
      throw new Error(t("angles.errorNoPreset"));
    }
    if (this._isRunning) {
      throw new Error(t("angles.errorRunning"));
    }
    if (window.featureGate) {
      const quotaCheck = window.featureGate.checkGlobalQuotaWarning("Angles");
      if (quotaCheck.exhausted) {
        throw new Error(t("angles.errorQuotaExhausted"));
      }
    }
    window.UsageSync?.trackEvent("angles_start", {
      preset_id: state.preset?.id,
    });
    if (window.ExecutionLock) {
      if (ExecutionLock.isBlockedBy("angles")) {
        const shouldStop = await ExecutionLock.showBlockedDialog("angles");
        if (!shouldStop) return null;
        await ExecutionLock.stopCurrent();
      }
      const acquired = ExecutionLock.acquire("angles", "Angles generation");
      if (!acquired) {
        throw new Error(t("angles.errorFlowBusy"));
      }
    }
    try {
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "ensureFlowTabActive" }, () =>
          resolve(),
        );
      });
    } catch (e) {
      console.warn("[AngleExecution] ensureFlowTabActive failed:", e.message);
    }
    this._isRunning = true;
    this._shouldStop = false;
    this._currentExecutionToken = null;
    const startTime = Date.now();
    if (window.ExecutionGate) {
      try {
        const gate = await ExecutionGate.request("angles_run", 1, {
          owner: "angles",
          label: "Angles",
        });
        if (!gate.allowed) {
          this._isRunning = false;
          if (window.ExecutionLock) ExecutionLock.release("angles");
          ExecutionGate.showDeniedDialog(gate, "Angles");
          const errMsg =
            gate.reason === "QUOTA_EXCEEDED"
              ? t("angles.errorQuotaExceededModule")
              : gate.reason === "MODULE_DISABLED" ||
                  gate.reason === "FEATURE_LOCKED"
                ? t("angles.errorFeatureLocked")
                : t("angles.errorNotAllowed");
          throw new Error(errMsg);
        }
        this._currentExecutionToken = gate.token;
      } catch (e) {
        const isQuotaByCode = window.QuotaErrorHandler?.isQuotaError(e);
        const isQuotaByMessage =
          e.message?.includes("h\u1EBFt l\u01B0\u1EE3t") ||
          e.message?.includes("b\u1ECB kh\xF3a") ||
          e.message?.includes("Kh\xF4ng \u0111\u01B0\u1EE3c ph\xE9p");
        if (isQuotaByCode || isQuotaByMessage) {
          if (isQuotaByCode && !isQuotaByMessage) {
            window.QuotaErrorHandler?.showDialog(e, "Angles");
          }
          this._isRunning = false;
          if (window.ExecutionLock) ExecutionLock.release("angles");
          throw e;
        }
        console.error(
          "[AngleExecution] ExecutionGate request failed, blocking:",
          e.message,
        );
        this._isRunning = false;
        window.ExecutionLock?.release("angles");
        throw e;
      }
    }
    if (window.PromptQueue && PromptQueue.isEnabled()) {
      try {
        const builtPrompt = this._buildPrompt(state);
        if (!builtPrompt) {
          throw new Error(
            window.I18n?.t("angles.errorBuildPrompt") ||
              "Failed to build prompt from preset and angle parameters",
          );
        }
        const genDefaults = await this._getGenDefaults();
        const submitPromise = PromptQueue.getInstance().submitJob({
          owner: "angles",
          label: "Angles",
          prompts: [builtPrompt],
          settings: {
            genType: state.preset.media_type || genDefaults.genType,
            ratio: state.ratio || state.preset.ratio || genDefaults.ratio,
            model: state.model || state.preset.model || genDefaults.imageModel,
            quantity: 1,
          },
          refFileIds: state.refImageId ? [state.refImageId] : [],
          refFileNames: state.refFileName
            ? { [state.refImageId]: state.refFileName }
            : {},
          refImageMode: state.refImageId ? "all" : "none",
          taskName: "angles",
          _executionToken: this._currentExecutionToken,
        });
        if (typeof this._onSubmittedCallback === "function") {
          try {
            this._onSubmittedCallback();
          } catch (e) {}
        }
        this._isRunning = false;
        const result = await submitPromise;
        this._log(
          `Pipeline Angles ho\xE0n t\u1EA5t: ${result.completed} th\xE0nh c\xF4ng, ${result.failed} th\u1EA5t b\u1EA1i`,
        );
        const resultTileIds = result.resultTileIds || [];
        const resultThumbnails = {};
        if (result.resultThumbnails) {
          for (const [tid, info] of Object.entries(result.resultThumbnails)) {
            if (info?.thumbnail) resultThumbnails[tid] = info.thumbnail;
          }
        }
        if (resultTileIds.length > 0 && window.MessageBridge) {
          const missingTiles = resultTileIds.filter(
            (id) => !resultThumbnails[id],
          );
          if (missingTiles.length > 0) {
            try {
              const scanResult =
                await MessageBridge.getThumbnailsByIds(missingTiles);
              const results = scanResult?.results || {};
              for (const tid of missingTiles) {
                if (results[tid]?.thumbnail)
                  resultThumbnails[tid] = results[tid].thumbnail;
              }
            } catch (e) {
              console.warn(
                "[AngleExecution] Scan thumbnails failed:",
                e.message,
              );
            }
          }
        }
        this._currentExecutionToken = null;
        return {
          fileIds: resultTileIds,
          duration: Date.now() - startTime,
          thumbnails: resultThumbnails,
        };
      } catch (err) {
        this._log("Pipeline Angles l\u1ED7i:", err.message || err);
        this._currentExecutionToken = null;
        throw err;
      } finally {
        this._isRunning = false;
        if (window.ExecutionLock) {
          ExecutionLock.release("angles");
        }
      }
    }
    if (window.ExecutionLock) {
      ExecutionLock.broadcastTracker({
        owner: "angles",
        label: "Angles",
        phase: "started",
        current: 0,
        total: 1,
        promptText: state.preset?.base_prompt?.substring(0, 60) || "",
      });
    }
    try {
      let refImageId = state.refImageId;
      if (
        refImageId.startsWith("upload_") &&
        typeof window.uploadPendingFiles === "function"
      ) {
        this._log(
          "\u1EA2nh ch\u01B0a upload xong, th\u1EED upload l\u1EA1i...",
        );
        const uploaded = await window.uploadPendingFiles(refImageId);
        if (uploaded && uploaded !== refImageId) {
          refImageId =
            uploaded
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)[0] || refImageId;
          if (this.editor) this.editor.state.refImageId = refImageId;
        }
        if (refImageId.startsWith("upload_")) {
          throw new Error(
            window.I18n?.t("angles.errorUploadRef") ||
              "Failed to upload reference image to Flow. Please try again.",
          );
        }
      }
      if (
        refImageId &&
        !refImageId.startsWith("upload_") &&
        typeof window.reuploadMissingFiles === "function"
      ) {
        const refFileName2 = this.editor?.state?.refFileName || null;
        if (refFileName2 && window.MessageBridge) {
          try {
            const fnCheck = await window.MessageBridge.checkFilesExist([
              refFileName2,
            ]);
            if (fnCheck?.existing?.includes(refFileName2)) {
              const found =
                await window.MessageBridge.findTileByFileName(refFileName2);
              if (found?.tileId) {
                console.log(
                  "[AngleExecution] Found tile by file_name:",
                  refFileName2,
                  "\u2192",
                  found.tileId,
                );
                refImageId = found.tileId;
                if (this.editor) this.editor.state.refImageId = refImageId;
              }
            } else {
              console.log(
                "[AngleExecution] file_name not found on page, will reupload:",
                refFileName2,
              );
              const thumbMap = {};
              if (this.editor?.state?.refThumbnail)
                thumbMap[refImageId] = this.editor.state.refThumbnail;
              const fileNamesMap = refFileName2
                ? { [refImageId]: refFileName2 }
                : {};
              const updated = await window.reuploadMissingFiles(
                refImageId,
                thumbMap,
                null,
                fileNamesMap,
              );
              if (updated && updated !== refImageId) {
                refImageId =
                  updated
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)[0] || refImageId;
                if (this.editor) this.editor.state.refImageId = refImageId;
              }
              const afterId = (updated || "").trim();
              if (!afterId) {
                throw new Error(
                  window.I18n?.t("angles.errorRefNotFound") ||
                    "Reference image not found and cannot be recovered. Please select another image.",
                );
              }
            }
          } catch (err) {
            console.warn(
              "[AngleExecution] file_name check failed, fallback to tile check:",
              err.message,
            );
            const thumbMap = {};
            if (this.editor?.state?.refThumbnail)
              thumbMap[refImageId] = this.editor.state.refThumbnail;
            const fileNamesMap = refFileName2
              ? { [refImageId]: refFileName2 }
              : {};
            const updated = await window.reuploadMissingFiles(
              refImageId,
              thumbMap,
              null,
              fileNamesMap,
            );
            if (updated && updated !== refImageId) {
              refImageId =
                updated
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)[0] || refImageId;
              if (this.editor) this.editor.state.refImageId = refImageId;
            }
            if (!(updated || "").trim()) {
              throw new Error(
                window.I18n?.t("angles.errorRefNotFound") ||
                  "Reference image not found and cannot be recovered. Please select another image.",
              );
            }
          }
        } else {
          const thumbMap = {};
          if (this.editor?.state?.refThumbnail)
            thumbMap[refImageId] = this.editor.state.refThumbnail;
          const updated = await window.reuploadMissingFiles(
            refImageId,
            thumbMap,
            null,
            null,
          );
          if (updated && updated !== refImageId) {
            refImageId =
              updated
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)[0] || refImageId;
            if (this.editor) this.editor.state.refImageId = refImageId;
          }
          const afterId = (updated || "").trim();
          if (!afterId) {
            throw new Error(
              window.I18n?.t("angles.errorRefNotFound") ||
                "Reference image not found and cannot be recovered. Please select another image.",
            );
          }
        }
      }
      const prompt = this._buildPrompt(state);
      if (!prompt) {
        throw new Error(
          window.I18n?.t("angles.errorBuildPrompt") ||
            "Failed to build prompt from preset and angle parameters",
        );
      }
      this._log("Built prompt:", prompt.substring(0, 80) + "...");
      const genDefaults = await this._getGenDefaults();
      const settings = {
        media_type: state.preset.media_type || genDefaults.genType,
        ratio: state.ratio || state.preset.ratio || genDefaults.ratio,
        model: state.model || state.preset.model || genDefaults.imageModel,
      };
      const refFileName = this.editor?.state?.refFileName || null;
      const result = await this._executeOnFlow(
        prompt,
        refImageId,
        settings,
        null,
        refFileName,
      );
      if (typeof this._onSubmittedCallback === "function") {
        try {
          this._onSubmittedCallback();
        } catch (_) {}
      }
      const duration = Date.now() - startTime;
      const fileIds = result?.tiles || result?.fileIds || [];
      const thumbnails = result?.thumbnails || {};
      this._log(
        `Generation ho\xE0n th\xE0nh: ${fileIds.length} file, ${Math.round(duration / 1e3)}s`,
      );
      if (window.ExecutionLock) {
        ExecutionLock.broadcastTracker({
          owner: "angles",
          phase: "completed",
          current: 1,
          total: 1,
        });
      }
      if (window.ExecutionGate && this._currentExecutionToken) {
        ExecutionGate.complete(this._currentExecutionToken, "success");
        this._currentExecutionToken = null;
      }
      return { fileIds, duration, thumbnails };
    } catch (err) {
      this._log("Generation th\u1EA5t b\u1EA1i:", err.message || err);
      if (typeof this._onSubmittedCallback === "function") {
        try {
          this._onSubmittedCallback();
        } catch (_) {}
      }
      if (window.ExecutionGate && this._currentExecutionToken) {
        ExecutionGate.complete(this._currentExecutionToken, "failed", {
          error: err.message || String(err),
        });
        this._currentExecutionToken = null;
      }
      if (window.ExecutionLock) {
        ExecutionLock.broadcastTracker({ owner: "angles", phase: "error" });
      }
      throw err;
    } finally {
      this._isRunning = false;
      if (window.ExecutionLock) {
        ExecutionLock.release("angles");
      }
    }
  }
  stop() {
    this._shouldStop = true;
    const isPipeline = window.PromptQueue && PromptQueue.isEnabled();
    if (!isPipeline && window.ExecutionGate && this._currentExecutionToken) {
      ExecutionGate.cancel(this._currentExecutionToken);
    }
    this._currentExecutionToken = null;
    if (window.MessageBridge) {
      window.MessageBridge.stopExecution().catch(() => {});
    }
  }
  get isRunning() {
    return this._isRunning;
  }
  _buildPrompt(state) {
    const preset = state.preset;
    if (!preset?.base_prompt) return "";
    const modifiers = preset.angle_modifiers || {};
    const rotationMod = this._findNearestKey(
      state.rotation,
      modifiers.rotation_keywords || {},
    );
    const tiltMod = this._findNearestKey(
      state.tilt,
      modifiers.tilt_keywords || {},
    );
    const zoomMod = this._findNearestKey(
      state.zoom,
      modifiers.zoom_keywords || {},
    );
    let prompt = preset.base_prompt;
    prompt = prompt.replace("{angle_modifier}", rotationMod);
    prompt = prompt.replace("{tilt_modifier}", tiltMod);
    prompt = prompt.replace("{zoom_modifier}", zoomMod);
    prompt = prompt.replace(/\{angle_modifier\}/g, "");
    prompt = prompt.replace(/\{tilt_modifier\}/g, "");
    prompt = prompt.replace(/\{zoom_modifier\}/g, "");
    return prompt.trim();
  }
  _findNearestKey(value, keysMap) {
    if (!keysMap || Object.keys(keysMap).length === 0) return "";
    const keys = Object.keys(keysMap).map(Number);
    let nearest = keys[0];
    let minDiff = Math.abs(value - nearest);
    for (const key of keys) {
      const diff = Math.abs(value - key);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = key;
      }
    }
    return keysMap[String(nearest)] || "";
  }
  async _executeOnFlow(prompt, refImageId, settings, onSubmitted, refFileName) {
    if (!window.MessageBridge) {
      throw new Error(
        window.I18n?.t("angles.errorNoBridge") ||
          "MessageBridge not ready, please open Google Flow tab",
      );
    }
    const inputTimeout = this._getSettingMs("inputTimeout", 1200);
    const clearEditorDelay = Math.round(inputTimeout * 0.4);
    const submitDelay = Math.round(inputTimeout * 0.5);
    const afterSubmitDelay = Math.round(inputTimeout * 0.8);
    if (this._shouldStop)
      throw new Error(
        window.I18n?.t("angles.stoppedByUser") || "Stopped by user",
      );
    if (window.MessageBridge?.prepareFlowForGen) {
      try {
        this._log(
          "Step 0: prepareFlowForGen (close chat panel + Agent OFF + wait editor)",
        );
        const prep = await window.MessageBridge.prepareFlowForGen();
        if (prep?.success === false) {
          throw new Error(prep.error || "FLOW_PREPARE_FAILED");
        }
        if (prep?.actioned) {
          this._log(
            `Step 0 actioned (editor ready in ${prep.editorReadyMs || 0}ms)`,
          );
        }
      } catch (e) {
        this._log("Step 0 prepareFlowForGen failed: " + e.message);
        throw e;
      }
    }
    if (this._shouldStop)
      throw new Error(
        window.I18n?.t("angles.stoppedByUser") || "Stopped by user",
      );
    this._log("Removing existing ref images...");
    await window.MessageBridge.removeExistingRefImages();
    await this._sleep(200);
    await window.MessageBridge.clearEditor();
    await this._sleep(clearEditorDelay);
    if (refImageId) {
      this._log("Adding ref image:", refImageId);
      await window.MessageBridge.addFileToPrompt(
        refImageId,
        refFileName || null,
      );
      await this._sleep(inputTimeout);
    }
    if (this._shouldStop)
      throw new Error(
        window.I18n?.t("angles.stoppedByUser") || "Stopped by user",
      );
    this._log("Applying settings:", settings);
    await window.MessageBridge.applySettings(
      settings.media_type,
      settings.ratio,
      settings.model,
      false,
      1,
      null,
    );
    await this._sleep(inputTimeout);
    if (this._shouldStop)
      throw new Error(
        window.I18n?.t("angles.stoppedByUser") || "Stopped by user",
      );
    this._log("Inserting prompt...");
    await window.MessageBridge.insertText(prompt);
    await this._sleep(submitDelay);
    if (this._shouldStop)
      throw new Error(
        window.I18n?.t("angles.stoppedByUser") || "Stopped by user",
      );
    await window.MessageBridge.stabilizeFlowResultViewport();
    const preTileResult = await window.MessageBridge.getCurrentTileIds();
    const preTileIds = preTileResult?.tileIds || [];
    const preFileNames = preTileResult?.fileNames || [];
    this._log(`Tile hi\u1EC7n t\u1EA1i: ${preTileIds.length}`);
    this._lastBaselineTileIds = new Set(preTileIds);
    const maxSubmitWait = 1e4;
    const submitStart = Date.now();
    let submitted = false;
    while (Date.now() - submitStart < maxSubmitWait) {
      const result = await window.MessageBridge.clickSubmit();
      if (result?.success) {
        submitted = true;
        this._log("Submit clicked");
        break;
      }
      this._log("Submit ch\u01B0a s\u1EB5n s\xE0ng, th\u1EED l\u1EA1i...");
      await this._sleep(500);
    }
    if (!submitted) {
      throw new Error(
        window.I18n?.t("angles.errorSubmitNotFound") ||
          "Submit button not found or disabled after 10s",
      );
    }
    await this._sleep(afterSubmitDelay);
    this._log("\u0110\xE3 submit, ch\u1EDD k\u1EBFt qu\u1EA3...");
    let newTiles = [];
    let thumbnails = {};
    const maxTileRetries = 2;
    for (let attempt = 0; attempt <= maxTileRetries; attempt++) {
      const tileResult = await window.MessageBridge.waitForNewTiles(
        preTileIds,
        attempt === 0 ? 12e4 : 15e3,
        { preFileNames, expectedMediaType: "image" },
      );
      if (tileResult?.failed) {
        const err = new Error(
          window.I18n?.t("angles.errorFlowFailed") ||
            "Flow reported failure. Prompt may violate content policy or system is overloaded.",
        );
        err.isFlowFailure = true;
        throw err;
      }
      newTiles = tileResult?.tiles || [];
      thumbnails = tileResult?.thumbnails || {};
      if (newTiles.length > 0) break;
      if (attempt < maxTileRetries) {
        this._log(
          `Kh\xF4ng ph\xE1t hi\u1EC7n tile m\u1EDBi, th\u1EED l\u1EA1i (${attempt + 1}/${maxTileRetries})...`,
        );
        await this._sleep(2e3);
      }
    }
    this._log(`Nh\u1EADn ${newTiles.length} tile m\u1EDBi`);
    return { tiles: newTiles, thumbnails };
  }
  async saveResult(result, angleState) {
    const fileIds = result?.fileIds || [];
    if (fileIds.length === 0) return [];
    let thumbnails = {};
    let fileNameMap = {};
    const capturedThumbs = result?.thumbnails || {};
    for (const id of fileIds) {
      const info = capturedThumbs[id];
      if (info?.thumbnail) thumbnails[id] = info.thumbnail;
      if (info?.file_name) fileNameMap[id] = info.file_name;
    }
    const missingIds = fileIds.filter(
      (id) => !thumbnails[id] && !fileNameMap[id],
    );
    if (missingIds.length > 0) {
      try {
        if (window.MessageBridge) {
          const scan = await window.MessageBridge.scanFlowImages();
          for (const img of scan?.images || []) {
            if (missingIds.includes(img.fileId)) {
              if (!thumbnails[img.fileId])
                thumbnails[img.fileId] = img.thumbnail;
              if (img.file_name && !fileNameMap[img.fileId])
                fileNameMap[img.fileId] = img.file_name;
            }
          }
        }
      } catch (e) {
        this._log("Scan thumbnails failed:", e.message);
      }
    }
    const entries = fileIds.map((id) => ({
      file_id: id,
      rotation: angleState.rotation,
      tilt: angleState.tilt,
      zoom: angleState.zoom,
      angle_label: this._buildAngleLabel(angleState),
      thumbnail_url: thumbnails[id] || "",
      file_name: fileNameMap[id] || "",
      ratio: result.ratio || "",
      preset_id: angleState.preset?.id || 0,
      preset_name: angleState.preset?.name || "",
      project_id: window._currentProjectId || null,
      created_at: new Date().toISOString(),
    }));
    const stored = await this._loadStoredResults();
    const merged = [...stored, ...entries];
    await new Promise((resolve) => {
      chrome.storage.local.set({ af_angles_results: merged }, resolve);
    });
    this._log(
      `\u0110\xE3 l\u01B0u ${entries.length} k\u1EBFt qu\u1EA3 (t\u1ED5ng: ${merged.length})`,
    );
    return entries;
  }
  _buildAngleLabel(state) {
    const rotLabel =
      state.rotation === 0
        ? window.I18n?.t("angles.labelFront") || "Front"
        : state.rotation > 0
          ? window.I18n?.t("angles.labelRight", { degree: state.rotation }) ||
            `Right ${state.rotation}\xB0`
          : window.I18n?.t("angles.labelLeft", {
              degree: Math.abs(state.rotation),
            }) || `Left ${Math.abs(state.rotation)}\xB0`;
    const tiltLabel =
      state.tilt === 0
        ? window.I18n?.t("angles.labelEyeLevel") || "Eye level"
        : state.tilt > 0
          ? window.I18n?.t("angles.labelAbove", { degree: state.tilt }) ||
            `Above ${state.tilt}\xB0`
          : window.I18n?.t("angles.labelBelow", {
              degree: Math.abs(state.tilt),
            }) || `Below ${Math.abs(state.tilt)}\xB0`;
    let label = `${rotLabel}, ${tiltLabel}`;
    if (state.zoom !== void 0 && state.zoom !== 0) {
      label += `, ${window.I18n?.t("angles.labelZoom", { level: state.zoom }) || `Zoom ${state.zoom}x`}`;
    }
    return label;
  }
  async loadSavedResults() {
    const results = await this._loadStoredResults();
    if (results.length === 0) return [];
    try {
      if (window.MessageBridge?.getThumbnailsByIds) {
        const ids = results.map((result) => result.file_id).filter(Boolean);
        const fileNamesById = Object.fromEntries(
          results
            .filter((result) => result.file_id && result.file_name)
            .map((result) => [result.file_id, result.file_name]),
        );
        const lookup = await window.MessageBridge.getThumbnailsByIds(ids, {
          deep: true,
          fileNamesById,
        });
        let changed = false;
        for (const result of results) {
          const media = lookup?.results?.[result.file_id];
          if (!media?.thumbnail || media.thumbnail === result.thumbnail_url)
            continue;
          result.thumbnail_url = media.thumbnail;
          if (media.file_name) result.file_name = media.file_name;
          changed = true;
        }
        if (changed)
          await new Promise((resolve) => {
            chrome.storage.local.set({ af_angles_results: results }, resolve);
          });
      }
    } catch (e) {
      this._log("Refresh saved result metadata failed:", e.message);
    }
    return results;
  }
  async _loadStoredResults() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["af_angles_results"], (result) => {
        resolve(result.af_angles_results || []);
      });
    });
  }
  renderResultsGrid(results, container) {
    const t = (key, params) => (window.I18n ? window.I18n.t(key, params) : key);
    if (!container) return;
    if (results.length === 0) {
      container.innerHTML = `
        <div class="angles-results-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          <span>${t("angles.noResults")}</span>
        </div>
      `;
      return;
    }
    container.innerHTML = results
      .map((r, i) => {
        const cssRatio = this._ratioToCss(r.ratio);
        const thumbStyle =
          cssRatio !== "1" ? ` style="aspect-ratio: ${cssRatio}"` : "";
        return `
      <div class="angles-result-card" data-file-id="${this._escapeAttr(r.file_id)}" data-index="${i}">
        <div class="angles-result-thumb"${thumbStyle}>
          ${
            r.thumbnail_url
              ? `<img src="${this._escapeAttr(r.thumbnail_url)}" alt="${this._escapeAttr(r.angle_label)}" loading="lazy" />`
              : `<div class="angles-result-placeholder">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
              </div>`
          }
        </div>
        <div class="angles-result-overlay">
          <span class="angles-result-label">${this._escapeHtml(r.angle_label || "")}</span>
          <div class="angles-result-actions">
            <button class="angles-result-download" data-file-id="${this._escapeAttr(r.file_id)}" title="${t("common.download")}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
            <button class="angles-result-delete" data-file-id="${this._escapeAttr(r.file_id)}" data-index="${i}" title="${t("common.delete")}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </div>
      </div>`;
      })
      .join("");
    this._bindResultEvents(container);
  }
  _bindResultEvents(container) {
    const downloadBtns = container.querySelectorAll(".angles-result-download");
    for (const btn of downloadBtns) {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const fileId = btn.dataset.fileId;
        const card = btn.closest(".angles-result-card");
        const index = card ? parseInt(card.dataset.index, 10) : 0;
        const results = this.editor?._currentResults || [];
        const label = results[index]?.angle_label || `angle_${index}`;
        const fileName = results[index]?.file_name || null;
        await this.downloadImage(fileId, label, fileName);
      });
    }
    const deleteBtns = container.querySelectorAll(".angles-result-delete");
    for (const btn of deleteBtns) {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index, 10);
        await this.deleteResult(index);
      });
    }
    const images = container.querySelectorAll(".angles-result-thumb img");
    for (const img of images) {
      img.addEventListener("error", () => {
        if (img.dataset.retried) return;
        img.dataset.retried = "true";
        const parent = img.parentElement;
        if (parent) {
          parent.innerHTML = `
            <div class="angles-result-placeholder">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            </div>
          `;
        }
      });
    }
  }
  async deleteResult(index) {
    const results = this.editor?._currentResults || [];
    if (index < 0 || index >= results.length) return;
    results.splice(index, 1);
    this.editor._currentResults = results;
    await new Promise((resolve) => {
      chrome.storage.local.set({ af_angles_results: results }, resolve);
    });
    const container = document.querySelector(".angles-results-grid");
    if (container) {
      this.renderResultsGrid(container, results);
    }
    this._log("\u0110\xE3 x\xF3a result t\u1EA1i index:", index);
  }
  async downloadImage(fileId, label, fileName) {
    try {
      if (window.DownloadHelper) {
        DownloadHelper.showModal({
          tileId: fileId,
          fileName: fileName || null,
          promptText: label || "angles",
          taskName: "angles",
        });
        this._log("Download modal opened:", fileId);
      } else if (window.MessageBridge) {
        const safeName = (
          window.DownloadHelper?.toAscii?.(label) ||
          label ||
          "angles"
        ).replace(/[^a-zA-Z0-9_\-]/g, "_");
        const resolution = this._getDownloadResolution();
        const response = await window.MessageBridge.downloadTileMedia(
          fileId,
          `angles_${safeName}`,
          "angles",
          fileName,
          resolution,
        );
        if (!(response === true || response?.success === true))
          throw new Error(response?.error || "DOWNLOAD_FAILED");
        this._log("Downloaded:", fileId);
      } else {
        this._log(
          "MessageBridge kh\xF4ng kh\u1EA3 d\u1EE5ng, kh\xF4ng th\u1EC3 t\u1EA3i xu\u1ED1ng",
        );
      }
    } catch (e) {
      this._log("Download failed:", e.message || e);
    }
  }
  async downloadAll(results) {
    if (!results || results.length === 0) return;
    this._log(`B\u1EAFt \u0111\u1EA7u t\u1EA3i ${results.length} file...`);
    let downloaded = 0;
    for (const r of results) {
      try {
        if (window.MessageBridge) {
          const safeName = (
            window.DownloadHelper?.toAscii?.(r.angle_label) ||
            r.angle_label ||
            `angle_${downloaded}`
          ).replace(/[^a-zA-Z0-9_\-]/g, "_");
          const resolution = this._getDownloadResolution();
          const response = await window.MessageBridge.downloadTileMedia(
            r.file_id,
            `angles_${safeName}`,
            "angles",
            r.file_name || null,
            resolution,
          );
          if (!(response === true || response?.success === true))
            throw new Error(response?.error || "DOWNLOAD_FAILED");
          this._log("Downloaded:", r.file_id);
          downloaded++;
        } else {
          throw new Error("MessageBridge unavailable");
        }
        if (downloaded < results.length) {
          await this._sleep(500);
        }
      } catch (e) {
        this._log(`Download th\u1EA5t b\u1EA1i cho ${r.file_id}:`, e.message);
      }
    }
    this._log(`\u0110\xE3 t\u1EA3i ${downloaded}/${results.length} file`);
  }
  async clearResults() {
    if (window.customDialog) {
      const confirmed = await window.customDialog.confirm(
        window.I18n?.t("angles.clearConfirmMsg") ||
          "Are you sure you want to clear all Angles results? This action cannot be undone.",
        {
          title:
            window.I18n?.t("angles.clearConfirmTitle") ||
            "Clear Angles Results",
          confirmText: window.I18n?.t("common.deleteAll") || "Delete All",
          cancelText: window.I18n?.t("common.cancel") || "Cancel",
        },
      );
      if (!confirmed) return false;
    }
    await new Promise((resolve) => {
      chrome.storage.local.remove(["af_angles_results"], resolve);
    });
    this._log("\u0110\xE3 x\xF3a t\u1EA5t c\u1EA3 k\u1EBFt qu\u1EA3 Angles");
    return true;
  }
  _escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  _escapeAttr(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  _ratioToCss(ratio) {
    const map = {
      "16:9": "16/9",
      "4:3": "4/3",
      "1:1": "1",
      "3:4": "3/4",
      "9:16": "9/16",
      Ngang: "16/9",
      "D\u1ECDc": "9/16",
      "Vu\xF4ng": "1",
    };
    return map[ratio] || "1";
  }
}
window.AngleExecution = AngleExecution;
