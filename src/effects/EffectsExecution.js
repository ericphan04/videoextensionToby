class EffectsExecution {
  constructor(editor) {
    this.editor = editor;
    this._onSubmittedCallback = null;
    this._shouldStop = false;
  }
  stop() {
    this._shouldStop = true;
  }
  _ratioToFlow(ratio) {
    const map = {
      "9:16": "D\u1ECDc",
      "16:9": "Ngang",
      "1:1": "Vu\xF4ng",
      "D\u1ECDc": "D\u1ECDc",
      Ngang: "Ngang",
      "Vu\xF4ng": "Vu\xF4ng",
    };
    return map[ratio] || ratio;
  }
  async runGeneration(params) {
    let { refImageId, refFileName, prompt, model, ratio, effectName } = params;
    console.log("[EffectsExecution] Starting generation:", {
      effectName,
      model,
      ratio,
    });
    if (window.featureGate) {
      const quotaCheck = window.featureGate.checkGlobalQuotaWarning("Effects");
      if (quotaCheck.exhausted) {
        throw new Error(
          window.I18n?.t("effects.errorQuotaExhausted") ||
            "Daily prompt quota exhausted",
        );
      }
    }
    window.UsageSync?.trackEvent("effects_start", {
      effect_id: params.effectName || null,
    });
    if (window.ExecutionLock) {
      if (ExecutionLock.isBlockedBy("effects")) {
        const shouldStop = await ExecutionLock.showBlockedDialog("effects");
        if (!shouldStop) return null;
        await ExecutionLock.stopCurrent();
      }
      const acquired = ExecutionLock.acquire(
        "effects",
        effectName || "Image Effect",
      );
      if (!acquired) {
        throw new Error(
          window.I18n?.t("effects.errorFlowBusy") ||
            "Cannot start, Google Flow is busy",
        );
      }
    }
    try {
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "ensureFlowTabActive" }, () =>
          resolve(),
        );
      });
    } catch (e) {
      console.warn("[EffectsExecution] ensureFlowTabActive failed:", e.message);
    }
    this._currentExecutionToken = null;
    if (window.ExecutionGate) {
      try {
        const gate = await ExecutionGate.request("effects_run", 1, {
          owner: "effects",
          label: effectName || "Image Effect",
        });
        if (!gate.allowed) {
          if (window.ExecutionLock) ExecutionLock.release("effects");
          ExecutionGate.showDeniedDialog(gate, "Effects");
          const errMsg =
            gate.reason === "QUOTA_EXCEEDED"
              ? window.I18n?.t("effects.errorQuotaExceededModule") ||
                "Daily Effects quota exhausted"
              : gate.reason === "MODULE_DISABLED" ||
                  gate.reason === "FEATURE_LOCKED"
                ? window.I18n?.t("effects.errorFeatureLocked") ||
                  "Effects feature is locked for current plan"
                : window.I18n?.t("effects.errorNotAllowed") ||
                  "Not allowed to run Effects";
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
            window.QuotaErrorHandler?.showDialog(e, "Effects");
          }
          if (window.ExecutionLock) ExecutionLock.release("effects");
          throw e;
        }
        console.error(
          "[EffectsExecution] ExecutionGate request failed, blocking:",
          e.message,
        );
        window.ExecutionLock?.release("effects");
        throw e;
      }
    }
    if (window.ExecutionLock) {
      ExecutionLock.broadcastTracker({
        owner: "effects",
        label: effectName || "Image Effect",
        phase: "started",
        current: 0,
        total: 1,
        promptText: prompt?.substring(0, 60) || "",
      });
    }
    try {
      if (
        refImageId &&
        refImageId.startsWith("upload_") &&
        typeof window.uploadPendingFiles === "function"
      ) {
        console.log("[EffectsExecution] Resolving upload_ key:", refImageId);
        const uploaded = await window.uploadPendingFiles(refImageId);
        if (uploaded && uploaded !== refImageId) {
          refImageId =
            uploaded
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)[0] || refImageId;
          if (window.GenTab?.fileNameCache?.[refImageId]) {
            refFileName = window.GenTab.fileNameCache[refImageId];
          }
        }
        if (refImageId.startsWith("upload_")) {
          throw new Error(
            window.I18n?.t("effects.errorUploadRef") ||
              "Failed to upload reference image to Flow. Please try again.",
          );
        }
      }
      if (
        refImageId &&
        !refImageId.startsWith("upload_") &&
        typeof window.reuploadMissingFiles === "function"
      ) {
        if (refFileName && window.MessageBridge) {
          try {
            const fnCheck = await window.MessageBridge.checkFilesExist([
              refFileName,
            ]);
            if (fnCheck?.existing?.includes(refFileName)) {
              const found =
                await window.MessageBridge.findTileByFileName(refFileName);
              if (found?.tileId) {
                console.log(
                  "[EffectsExecution] Found tile by file_name:",
                  refFileName,
                  "\u2192",
                  found.tileId,
                );
                refImageId = found.tileId;
              }
            } else {
              console.log(
                "[EffectsExecution] file_name not found on page, will reupload:",
                refFileName,
              );
              const refThumbnail = this.editor?.state?.refThumbnail;
              const thumbnailMap = refThumbnail
                ? { [refImageId]: refThumbnail }
                : {};
              const fileNamesMap = refFileName
                ? { [refImageId]: refFileName }
                : {};
              const updated = await window.reuploadMissingFiles(
                refImageId,
                thumbnailMap,
                null,
                fileNamesMap,
              );
              if (updated && updated !== refImageId) {
                refImageId =
                  updated
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)[0] || refImageId;
              }
              const afterId = (updated || "").trim();
              if (!afterId) {
                throw new Error(
                  window.I18n?.t("effects.errorRefNotFound") ||
                    "Reference image not found and cannot be recovered. Please select another image.",
                );
              }
            }
          } catch (err) {
            console.warn(
              "[EffectsExecution] file_name check failed, fallback to tile check:",
              err.message,
            );
            const refThumbnail = this.editor?.state?.refThumbnail;
            const thumbnailMap = refThumbnail
              ? { [refImageId]: refThumbnail }
              : {};
            const fileNamesMap = refFileName
              ? { [refImageId]: refFileName }
              : {};
            const updated = await window.reuploadMissingFiles(
              refImageId,
              thumbnailMap,
              null,
              fileNamesMap,
            );
            if (updated && updated !== refImageId) {
              refImageId =
                updated
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)[0] || refImageId;
            }
            if (!(updated || "").trim()) {
              throw new Error(
                window.I18n?.t("effects.errorRefNotFound") ||
                  "Reference image not found and cannot be recovered. Please select another image.",
              );
            }
          }
        } else {
          const refThumbnail = this.editor?.state?.refThumbnail;
          const thumbnailMap = refThumbnail
            ? { [refImageId]: refThumbnail }
            : {};
          const updated = await window.reuploadMissingFiles(
            refImageId,
            thumbnailMap,
            null,
            null,
          );
          if (updated && updated !== refImageId) {
            refImageId =
              updated
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)[0] || refImageId;
          }
          const afterId = (updated || "").trim();
          if (!afterId) {
            throw new Error(
              window.I18n?.t("effects.errorRefNotFound") ||
                "Reference image not found and cannot be recovered. Please select another image.",
            );
          }
        }
      }
      params = { ...params, refImageId, refFileName };
      let result;
      const isPipeline = window.PromptQueue?.isEnabled?.();
      if (isPipeline) {
        result = await this._runViaPipeline(params);
        this._currentExecutionToken = null;
      } else {
        result = await this._runDirect(params);
        if (window.ExecutionGate && this._currentExecutionToken) {
          ExecutionGate.complete(this._currentExecutionToken, "success");
          this._currentExecutionToken = null;
        }
      }
      if (window.ExecutionLock) {
        ExecutionLock.broadcastTracker({
          owner: "effects",
          phase: "completed",
          current: 1,
          total: 1,
        });
      }
      return result;
    } catch (err) {
      console.error("[EffectsExecution] Generation failed:", err);
      if (window.ExecutionGate && this._currentExecutionToken) {
        ExecutionGate.complete(this._currentExecutionToken, "failed", {
          error: err.message || String(err),
        });
        this._currentExecutionToken = null;
      }
      if (window.ExecutionLock) {
        ExecutionLock.broadcastTracker({ owner: "effects", phase: "error" });
      }
      throw err;
    } finally {
      if (window.ExecutionLock) {
        ExecutionLock.release("effects");
      }
    }
  }
  async _runViaPipeline(params) {
    const { refImageId, refFileName, prompt, model, ratio, effectName } =
      params;
    const queue = window.PromptQueue.getInstance();
    if (this._onSubmittedCallback) {
      setTimeout(() => this._onSubmittedCallback(), 100);
    }
    const result = await queue.submitJob({
      owner: "effects",
      label: `Effect: ${effectName}`,
      prompts: [prompt],
      settings: {
        genType: "Image",
        ratio: ratio === "Gi\u1EEF nguy\xEAn" ? null : this._ratioToFlow(ratio),
        model,
        quantity: 1,
      },
      refFileIds: refImageId ? [refImageId] : [],
      taskName: "effects",
      _executionToken: this._currentExecutionToken,
      refFileNames: refFileName ? { [refImageId]: refFileName } : {},
      refImageMode: "all",
    });
    const thumbnails = [];
    if (
      result.completed > 0 &&
      result.resultThumbnails &&
      Object.keys(result.resultThumbnails).length > 0
    ) {
      for (const [tileId, info] of Object.entries(result.resultThumbnails)) {
        thumbnails.push({
          thumbnail: info.thumbnail || info,
          tileId,
          file_name: info.file_name,
        });
      }
    } else if (result.completed > 0 && result.resultTileIds?.length > 0) {
      console.log(
        "[EffectsExecution] Fallback: fetching thumbnails from resultTileIds",
      );
      const thumbResult = await window.MessageBridge?.getThumbnailsByIds(
        result.resultTileIds,
      );
      if (thumbResult?.results) {
        for (const [tileId, info] of Object.entries(thumbResult.results)) {
          thumbnails.push({
            thumbnail: info.thumbnail || "",
            tileId,
            file_name: info.file_name,
          });
        }
      }
    }
    return { thumbnails };
  }
  async _runDirect(params) {
    const { refImageId, refFileName, prompt, model, ratio, effectName } =
      params;
    const settings = window.storageSettings?.getSettings?.() || {};
    const payload = {
      prompts: [prompt],
      genType: "Image",
      aspectRatio:
        ratio === "Gi\u1EEF nguy\xEAn" ? null : this._ratioToFlow(ratio),
      modelName: model,
      quantity: 1,
      fileIds: refImageId ? [refImageId] : [],
      fileIdMap: refFileName ? { [refImageId]: refFileName } : {},
      refImageMode: "all",
      delayBetweenMs:
        (window.ExecutionConfig?.safeGetDelayBetweenPromptsSec?.() ?? 5) * 1e3,
      inputTimeoutMs: settings.inputTimeout || 1200,
      _owner: "effects",
      _label: `Effect: ${effectName}`,
    };
    if (this._onSubmittedCallback) {
      setTimeout(() => this._onSubmittedCallback(), 100);
    }
    const result = await window.MessageBridge?.runAutoPrompt(payload);
    if (
      !result?.success ||
      !Array.isArray(result.resultTileIds) ||
      result.resultTileIds.length === 0
    ) {
      throw new Error(
        result?.error ||
          result?.failedPrompts?.[0]?.error ||
          "FLOW_EFFECT_NO_RESULT",
      );
    }
    const thumbnails = [];
    if (result?.resultTileIds?.length > 0) {
      const thumbResult = await window.MessageBridge?.getThumbnailsByIds(
        result.resultTileIds,
      );
      if (thumbResult?.results) {
        for (const [tileId, info] of Object.entries(thumbResult.results)) {
          thumbnails.push({
            thumbnail: info.thumbnail || "",
            tileId,
            file_name: info.file_name,
          });
        }
      }
    }
    return { thumbnails };
  }
  async downloadImage(tileId, fileName) {
    if (!tileId) return;
    try {
      if (window.DownloadHelper) {
        DownloadHelper.showModal({
          tileId,
          fileName: fileName || null,
          promptText: "effects",
          taskName: "effects",
        });
      } else if (window.MessageBridge) {
        const resolution =
          window.ProviderConfigManager?.getDownloadResolutionsSync?.(
            "flow",
            "image",
          )?.[0]?.value;
        if (!resolution) throw new Error("DOWNLOAD_CONFIG_REQUIRED");
        const response = await window.MessageBridge.sendToContentScript(
          "downloadTileMedia",
          {
            tileId,
            promptText: "effects",
            taskName: "effects",
            fileName,
            resolution,
          },
        );
        if (response?.success !== true)
          throw new Error(response?.error || "DOWNLOAD_FAILED");
      }
    } catch (err) {
      console.error("[EffectsExecution] Download failed:", err);
    }
  }
  async addFileToPrompt(fileId, fileName) {
    if (!fileId) return false;
    try {
      const result = await window.MessageBridge?.sendToContentScript(
        "addFileToPrompt",
        { fileId, fileName },
      );
      return result?.success;
    } catch (err) {
      console.error("[EffectsExecution] Add file failed:", err);
      return false;
    }
  }
}
window.EffectsExecution = EffectsExecution;
