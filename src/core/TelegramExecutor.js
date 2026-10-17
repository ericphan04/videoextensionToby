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
class TelegramExecutor {
  static init() {
    if (this._initialized) return;
    this._initialized = true;
    window.eventBus?.on("sse:telegram_command", (data) => {
      const command = data.command || "";
      const provider = data.args?.provider || data.target || "flow";
      console.log(
        `[TelegramExecutor] SSE command received: ${command}, provider: ${provider}`,
      );
      this._execute(data);
    });
    window.eventBus?.on("sse:telegram_cancel", (data) =>
      this._handleCancel(data),
    );
    window.eventBus?.on("sse:telegram_stop", (data) => this._handleStop(data));
    this._pingExecutorHeartbeat("ready");
    this._executorHeartbeatTimer = setInterval(
      () => this._pingExecutorHeartbeat("ready"),
      45e3,
    );
    console.log("[TelegramExecutor] \u0110\xE3 kh\u1EDFi t\u1EA1o");
  }
  static async _pingExecutorHeartbeat(stage = "ready", queueId = null) {
    try {
      if (!window.authManager?._apiCall || !window.authManager?.isLoggedIn?.())
        return;
      await window.authManager._apiCall("POST", "telegram/executor-heartbeat", {
        queue_id: queueId,
        stage,
        context: window.location?.pathname || "unknown",
      });
    } catch (e) {
      console.info("[TelegramExecutor] Heartbeat deferred:", e?.message || e);
    }
  }
  static _startActiveHeartbeat(queueId) {
    this._stopActiveHeartbeat();
    this._pingExecutorHeartbeat("event_received", queueId);
    this._activeHeartbeatTimer = setInterval(() => {
      this._pingExecutorHeartbeat("running", queueId);
    }, 3e4);
  }
  static _stopActiveHeartbeat() {
    if (this._activeHeartbeatTimer) clearInterval(this._activeHeartbeatTimer);
    this._activeHeartbeatTimer = null;
  }
  static async _execute(data) {
    if (this._isExecuting) {
      const { queue_id: queue_id2 } = data;
      if (queue_id2 && queue_id2 === this._currentQueueId) {
        console.log(
          "[TelegramExecutor] Duplicate active command ignored:",
          queue_id2,
        );
        await this._pingExecutorHeartbeat("duplicate_ignored", queue_id2);
        return;
      }
      await this._sendResult(
        queue_id2,
        "failed",
        null,
        window.I18n?.t("telegram.busyProcessing") ||
          "Extension is busy processing another command",
      );
      return;
    }
    console.log("=== [TelegramExecutor] RECEIVED SSE EVENT ===");
    console.log("[TelegramExecutor] Full data:", JSON.stringify(data, null, 2));
    const { command, args, queue_id } = data;
    console.log("[TelegramExecutor] command:", command);
    console.log("[TelegramExecutor] args:", JSON.stringify(args, null, 2));
    console.log(
      "[TelegramExecutor] args.frames:",
      args?.frames,
      "(type:",
      typeof args?.frames,
      ")",
    );
    console.log("=== END SSE EVENT DATA ===");
    this._currentQueueId = queue_id;
    this._isExecuting = true;
    this._startActiveHeartbeat(queue_id);
    const isWorkflowCommand = command === "/workflow" || command === "workflow";
    let ownsTelegramLock = false;
    try {
      const requestedLockOwner = isWorkflowCommand ? "workflow" : "telegram";
      if (window.ExecutionLock?.isBlockedBy(requestedLockOwner)) {
        await this._sendResult(
          queue_id,
          "failed",
          null,
          window.I18n?.t("telegram.busyOtherTask") ||
            "Extension is busy with another task",
        );
        return;
      }
      if (!isWorkflowCommand) {
        ownsTelegramLock = !!window.ExecutionLock?.acquire(
          "telegram",
          `Telegram: ${command}`,
        );
      }
      try {
        await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: "ensureFlowTabActive" }, () =>
            resolve(),
          );
        });
        await new Promise((r) => setTimeout(r, 500));
      } catch (e) {
        console.warn(
          "[TelegramExecutor] ensureFlowTabActive failed:",
          e.message,
        );
      }
      if (typeof window.sidebarLog === "function") {
        window.sidebarLog(`[Telegram] Processing: ${command}`, "info");
      }
      const provider = args?.provider || data.target || "flow";
      const execAction = this._mapCommandToAction(command, provider);
      this._currentExecutionToken = null;
      if (execAction && !isWorkflowCommand && window.ExecutionGate) {
        try {
          const promptCount = Math.min(args?.count || 1, 4);
          const gate = await ExecutionGate.request(execAction, promptCount, {
            owner: "telegram",
            label: `Telegram: ${command}`,
            provider,
          });
          if (!gate.allowed) {
            const limit = gate.limit ?? "?";
            const used = gate.used ?? "?";
            const msg =
              gate.reason === "QUOTA_EXCEEDED"
                ? window.I18n?.t("telegram.quotaExhaustedUpsale", {
                    limit,
                    used,
                  }) ||
                  `\u{1F4CA} You've used all your quota today.
Limit: ${limit} runs/day | Used: ${used} runs

\u{1F4A1} Upgrade to Premium to increase your limit!
Type /quota for details.`
                : window.I18n?.t("telegram.featureLockedUpsale") ||
                  "\u{1F512} Feature is locked for the current plan.\n\n\u{1F4A1} Upgrade to Premium to unlock!\nType /plan for info.";
            await this._sendResult(queue_id, "failed", null, msg);
            return;
          }
          this._currentExecutionToken = gate.token;
        } catch (e) {
          if (window.QuotaErrorHandler?.isQuotaError(e)) {
            console.warn(
              "[TelegramExecutor] ExecutionGate denied:",
              e.code || e.reason,
            );
            const limit =
              e.serverData?.limit ?? e.serverData?.global?.limit ?? "?";
            const used =
              e.serverData?.used ?? e.serverData?.global?.used ?? "?";
            const isQuota =
              e.code === "QUOTA_EXCEEDED" || e.code === "GLOBAL_QUOTA_EXCEEDED";
            const msg = isQuota
              ? window.I18n?.t("telegram.quotaExhaustedUpsale", {
                  limit,
                  used,
                }) ||
                `\u{1F4CA} You've used all your quota today.
Limit: ${limit} runs/day | Used: ${used} runs

\u{1F4A1} Upgrade to Premium to increase your limit!
Type /quota for details.`
              : window.I18n?.t("telegram.featureLockedUpsale") ||
                "\u{1F512} Feature is locked for the current plan.\n\n\u{1F4A1} Upgrade to Premium to unlock!\nType /plan for info.";
            await this._sendResult(queue_id, "failed", null, msg);
            return;
          }
          console.warn(
            "[TelegramExecutor] ExecutionGate request failed, blocking:",
            e.message,
          );
          await this._sendResult(
            queue_id,
            "failed",
            null,
            "EXECUTION_AUTHORIZATION_UNAVAILABLE",
          );
          return;
        }
      }
      let result;
      switch (command) {
        case "/image":
        case "image":
          result = await this._executeGenerate(args);
          break;
        case "/video":
        case "video":
          result = await this._executeVideo(args);
          break;
        case "/workflow":
        case "workflow":
          result = await this._executeWorkflow(args);
          break;
        case "/stop":
        case "stop":
          result = await this._executeStop();
          break;
        default:
          await this._sendResult(
            queue_id,
            "failed",
            null,
            window.I18n?.t("telegram.unsupportedCommand", { command }) ||
              `Unsupported command: ${command}`,
          );
          return;
      }
      await this._sendResult(queue_id, "completed", result?.thumbnails || []);
      await this._pingExecutorHeartbeat("completed", queue_id);
      if (window.ExecutionGate && this._currentExecutionToken) {
        ExecutionGate.complete(this._currentExecutionToken, "success");
        this._currentExecutionToken = null;
      }
      if (typeof window.sidebarLog === "function") {
        window.sidebarLog(`[Telegram] Completed: ${command}`, "success");
      }
    } catch (err) {
      console.error("[TelegramExecutor] L\u1ED7i:", err.message);
      await this._pingExecutorHeartbeat("failed", queue_id);
      await this._sendResult(queue_id, "failed", null, err.message);
      if (window.ExecutionGate && this._currentExecutionToken) {
        ExecutionGate.complete(this._currentExecutionToken, "failed", {
          error: err.message,
        });
        this._currentExecutionToken = null;
      }
      if (typeof window.sidebarLog === "function") {
        window.sidebarLog(`[Telegram] Error: ${err.message}`, "error");
      }
    } finally {
      if (ownsTelegramLock) window.ExecutionLock?.release("telegram");
      this._stopActiveHeartbeat();
      this._currentQueueId = null;
      this._isExecuting = false;
    }
  }
  static async _getDefaultProvider() {
    const settings = await window.storageSettings?.getSettings();
    return settings?.telegramDefaultProvider || "flow";
  }
  static async _getProviderSettings(provider) {
    const settings = await window.storageSettings?.getSettings();
    switch (provider) {
      case "flow":
        return {
          ratio: settings?.telegramFlowRatio || "16:9",
          model:
            settings?.telegramFlowModel ||
            window.ModelRegistry?.safeGetDefault("flow", "image") ||
            null,
          videoModel:
            settings?.telegramFlowVideoModel ||
            window.ModelRegistry?.safeGetDefault("flow", "video") ||
            null,
          videoDuration: settings?.telegramFlowVideoDuration || "6s",
          videoInputType: settings?.telegramFlowVideoInputType || "Ingredients",
        };
      case "chatgpt":
        return {
          ratio: settings?.telegramChatgptRatio || "square",
          model:
            settings?.chatgptModel ||
            window.ModelRegistry?.safeGetDefault?.("chatgpt", "image") ||
            null,
        };
      case "gemini":
        return {
          ratio:
            settings?.telegramGeminiRatio ||
            window.ProviderConfigManager?.safeGetRatiosSync?.(
              "gemini",
              "image",
            )?.[0]?.value ||
            null,
          model:
            settings?.telegramGeminiModel ||
            window.ModelRegistry?.safeGetDefault?.("gemini", "image") ||
            null,
        };
      case "grok":
        return {
          ratio: settings?.telegramGrokRatio || "widescreen",
          duration: settings?.telegramGrokDuration || "6s",
          resolution: settings?.telegramGrokResolution || "720p",
          imageQuality: settings?.telegramGrokImageQuality || "speed",
        };
      default:
        return {};
    }
  }
  static async _executeGenerate(args) {
    console.log(
      "[TelegramExecutor] _executeGenerate called with args:",
      JSON.stringify(args),
    );
    console.log(
      "[TelegramExecutor] args.frames =",
      args.frames,
      ", typeof =",
      typeof args.frames,
    );
    const provider = args.provider || (await this._getDefaultProvider());
    console.log("[TelegramExecutor] Using provider:", provider);
    switch (provider) {
      case "chatgpt":
        return this._executeChatGPTGenerate(args);
      case "grok":
        return this._executeGrokGenerate(args);
      case "gemini":
        return this._executeGeminiGenerate(args);
      case "flow":
        return this._executeFlowGenerate(args);
      default:
        throw new Error(`UNSUPPORTED_PROVIDER: ${provider}`);
    }
  }
  static async _executeFlowGenerate(args) {
    console.log("[TelegramExecutor] _executeFlowGenerate (Flow provider)");
    const {
      prompt,
      ratio,
      model,
      count,
      ref_image_url,
      ref_image_base64,
      ref_images_base64,
      genType = "Image",
      video_duration,
    } = args;
    let refFileIds = [];
    if (
      ref_images_base64 &&
      Array.isArray(ref_images_base64) &&
      ref_images_base64.length > 0
    ) {
      console.log(
        `[TelegramExecutor] Uploading ${ref_images_base64.length} ref images...`,
      );
      for (const base64 of ref_images_base64) {
        const tileId = await this._uploadRefFromBase64(base64);
        if (tileId) {
          refFileIds.push(tileId);
        }
      }
      if (refFileIds.length !== ref_images_base64.length) {
        throw Object.assign(
          new Error(
            `REF_UPLOAD_FAILED:${ref_images_base64.length - refFileIds.length}`,
          ),
          { code: "REF_UPLOAD_FAILED" },
        );
      }
      console.log(
        `[TelegramExecutor] Uploaded ${refFileIds.length} ref images successfully`,
      );
    } else if (ref_image_base64) {
      const tileId = await this._uploadRefFromBase64(ref_image_base64);
      if (!tileId)
        throw Object.assign(new Error("REF_UPLOAD_FAILED"), {
          code: "REF_UPLOAD_FAILED",
        });
      refFileIds.push(tileId);
    } else if (ref_image_url) {
      const tileId = await this._uploadRefFromUrl(ref_image_url);
      if (!tileId)
        throw Object.assign(new Error("REF_UPLOAD_FAILED"), {
          code: "REF_UPLOAD_FAILED",
        });
      refFileIds.push(tileId);
    }
    if (window.PromptQueue && PromptQueue.isEnabled()) {
      const isVideo2 = genType === "Video";
      const quantity2 = isVideo2 ? 1 : Math.min(count || 1, 4);
      const flowSettings = await this._getProviderSettings("flow");
      const effectiveRatio = ratio || flowSettings.ratio;
      const aspectRatio = this._mapRatio(
        isVideo2 ? this._clampFlowVideoRatio(effectiveRatio) : effectiveRatio,
      );
      const isFrames =
        isVideo2 &&
        (args.frames === true || flowSettings.videoInputType === "Frames");
      const effectiveModel = isVideo2
        ? model || flowSettings.videoModel
        : model || flowSettings.model;
      const effectiveDuration = isVideo2
        ? video_duration || flowSettings.videoDuration || null
        : null;
      console.log(
        `[TelegramExecutor] Pipeline video settings: isVideo=${isVideo2}, isFrames=${isFrames}, model=${effectiveModel}, duration=${effectiveDuration}, args.frames=${args.frames}`,
      );
      const downloadSettings = await this._getDownloadSettings();
      const canAutoDownload = window.featureGate
        ? window.featureGate.canUse("auto_download")
        : true;
      const autoDownloadOverride = args.autoDownload;
      const autoDownload =
        autoDownloadOverride !== void 0
          ? (autoDownloadOverride === true ||
              autoDownloadOverride === "true") &&
            canAutoDownload
          : downloadSettings.autoDownload && canAutoDownload;
      console.log(
        `[TelegramExecutor] Download settings: autoDownload=${autoDownload}, override=${autoDownloadOverride}, canAutoDownload=${canAutoDownload}, image=${downloadSettings.downloadResolution}, video=${downloadSettings.videoDownloadResolution}`,
      );
      const _telegramRefFileNames = {};
      for (const fid of refFileIds) {
        const fn =
          window.MediaRegistry?.getFileName?.(fid) ||
          window.GenTab?.fileNameCache?.[fid];
        if (fn) _telegramRefFileNames[fid] = fn;
      }
      const result = await PromptQueue.getInstance().submitJob({
        owner: "telegram",
        label: isVideo2 ? "Telegram Video" : "Telegram Generate",
        _executionToken: this._currentExecutionToken,
        prompts: [prompt],
        settings: {
          genType,
          ratio: aspectRatio || "D\u1ECDc",
          model: effectiveModel || null,
          quantity: quantity2,
          isFrames,
          flowVideoDuration: effectiveDuration,
        },
        refFileIds,
        refFileNames: _telegramRefFileNames,
        refImageMode: refFileIds && refFileIds.length > 0 ? "all" : "none",
        autoDownload,
        downloadResolution: downloadSettings.downloadResolution || null,
        videoDownloadResolution:
          downloadSettings.videoDownloadResolution || null,
        taskName: downloadSettings.downloadFolder,
      });
      console.log(
        `[TelegramExecutor] Pipeline ho\xE0n t\u1EA5t: ${result.completed} th\xE0nh c\xF4ng, ${result.failed} th\u1EA5t b\u1EA1i`,
      );
      console.log(
        "[TelegramExecutor] Pipeline result:",
        JSON.stringify(result, null, 2),
      );
      const thumbnails = [];
      if (result.resultThumbnails) {
        for (const [tileId, info] of Object.entries(result.resultThumbnails)) {
          if (info.thumbnail || info.video_url) {
            thumbnails.push({
              url: info.thumbnail || "",
              file_name: info.file_name || "",
              type: info.type || "image",
              video_url: info.video_url || "",
            });
          }
        }
      }
      console.log(
        "[TelegramExecutor] Thumbnails to send:",
        JSON.stringify(thumbnails),
      );
      return { thumbnails };
    }
    const isVideo = genType === "Video";
    const quantity = isVideo ? 1 : Math.min(count || 1, 4);
    if (typeof applySettings === "function") {
      const flowSettingsLegacy = await this._getProviderSettings("flow");
      const effectiveRatioL = ratio || flowSettingsLegacy.ratio;
      const aspectRatio = this._mapRatio(
        isVideo ? this._clampFlowVideoRatio(effectiveRatioL) : effectiveRatioL,
      );
      const isFrames =
        isVideo &&
        (args.frames === true ||
          flowSettingsLegacy.videoInputType === "Frames");
      const legacyModel = isVideo
        ? model || flowSettingsLegacy.videoModel
        : model || flowSettingsLegacy.model;
      await applySettings(
        genType,
        aspectRatio,
        legacyModel || null,
        isFrames,
        quantity,
      );
    }
    const clearEditorDelay =
      typeof getClearEditorDelay === "function" ? getClearEditorDelay() : 480;
    const submitDelay =
      typeof getSubmitDelay === "function" ? getSubmitDelay() : 600;
    const afterSubmitDelay =
      typeof getAfterSubmitDelay === "function" ? getAfterSubmitDelay() : 960;
    let editor = typeof getEditor === "function" ? getEditor() : null;
    if (!editor)
      throw new Error(
        window.I18n?.t("telegram.editorNotFound") ||
          "Editor not found on Google Flow",
      );
    if (typeof removeExistingRefImages === "function") {
      await removeExistingRefImages();
    }
    if (typeof clearEditor === "function") {
      await clearEditor(editor);
    }
    await new Promise((r) => setTimeout(r, clearEditorDelay));
    if (refFileIds.length > 0 && typeof addFileToPrompt === "function") {
      for (const refId of refFileIds) {
        const _fn =
          window.MediaRegistry?.getFileName?.(refId) ||
          window.GenTab?.fileNameCache?.[refId] ||
          null;
        const attached = await addFileToPrompt(refId, _fn);
        if (!attached) {
          throw Object.assign(new Error(`REF_ATTACH_FAILED:${refId}`), {
            code: "REF_ATTACH_FAILED",
          });
        }
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    editor = typeof getEditor === "function" ? getEditor() : editor;
    if (typeof insertText === "function") await insertText(editor, prompt);
    await new Promise((r) => setTimeout(r, submitDelay));
    const hasPlaceholder = () => {
      const ed = typeof getEditor === "function" ? getEditor() : null;
      return (
        ed &&
        ed.querySelector &&
        ed.querySelector("[data-slate-placeholder]") !== null
      );
    };
    if (hasPlaceholder()) {
      console.log(
        "[TelegramExecutor] Slate placeholder v\u1EABn c\xF2n, ch\u1EDD...",
      );
      let waitSlate = 0;
      while (hasPlaceholder() && waitSlate < 2e3) {
        await new Promise((r) => setTimeout(r, 200));
        waitSlate += 200;
      }
    }
    const preTileIds =
      typeof getUniqueTileIds === "function" ? getUniqueTileIds() : [];
    const preFileNames =
      typeof getExistingFileNames === "function"
        ? getExistingFileNames()
        : null;
    let submitBtn =
      typeof getSubmitButton === "function" ? getSubmitButton() : null;
    if (!submitBtn)
      throw new Error(
        window.I18n?.t("telegram.submitNotFound") || "Submit button not found",
      );
    let waitSubmit = 0;
    while (submitBtn.disabled && waitSubmit < 15e3) {
      await new Promise((r) => setTimeout(r, 300));
      waitSubmit += 300;
      submitBtn =
        (typeof getSubmitButton === "function" ? getSubmitButton() : null) ||
        submitBtn;
    }
    if (typeof _slateBridgeCall === "function") {
      const submitResult = await _slateBridgeCall("submit", {});
      if (!submitResult.success) {
        console.log(
          "[TelegramExecutor] Bridge submit failed, fallback simulateClick",
        );
        if (typeof simulateClick === "function") {
          simulateClick(submitBtn);
        } else {
          submitBtn.click();
        }
      }
    } else if (typeof simulateClick === "function") {
      simulateClick(submitBtn);
    } else {
      submitBtn.click();
    }
    await new Promise((r) => setTimeout(r, afterSubmitDelay));
    const results = [];
    const successTileIds = [];
    if (typeof waitForNewTiles === "function") {
      const tileResult = await waitForNewTiles(preTileIds, 12e4, preFileNames);
      if (tileResult?.thumbnails) {
        for (const [tileId, info] of Object.entries(tileResult.thumbnails)) {
          if (info.thumbnail || info.video_url) {
            results.push({
              url: info.thumbnail || "",
              file_name: info.file_name || "",
              type: info.type || "image",
              video_url: info.video_url || "",
            });
            successTileIds.push({ tileId, info });
          }
        }
      }
    }
    if (successTileIds.length > 0) {
      const downloadSettings = await this._getDownloadSettings();
      const canAutoDownload = window.featureGate
        ? window.featureGate.canUse("auto_download")
        : true;
      const autoDownloadOverride = args.autoDownload;
      const shouldAutoDownload =
        autoDownloadOverride !== void 0
          ? (autoDownloadOverride === true ||
              autoDownloadOverride === "true") &&
            canAutoDownload
          : downloadSettings.autoDownload && canAutoDownload;
      if (shouldAutoDownload) {
        console.log(
          `[TelegramExecutor] Legacy path: Auto-downloading ${successTileIds.length} files...`,
        );
        const downloadResolution = isVideo
          ? downloadSettings.videoDownloadResolution || "720p"
          : downloadSettings.downloadResolution || "1k";
        const downloadFolder =
          downloadSettings.downloadFolder || "tobyflow_bot";
        let downloadedCount = 0;
        for (const { tileId, info } of successTileIds) {
          try {
            const _vResTg = isVideo ? downloadResolution : null;
            let response = false;
            if (typeof downloadTileMedia === "function") {
              response = await downloadTileMedia(
                tileId,
                prompt,
                downloadFolder,
                info.file_name || null,
                downloadResolution,
                null,
                null,
                _vResTg,
              );
            } else if (window.MessageBridge?.downloadTileMedia) {
              response = await window.MessageBridge.downloadTileMedia(
                tileId,
                prompt,
                downloadFolder,
                info.file_name || null,
                downloadResolution,
                null,
                null,
                _vResTg,
              );
            }
            if (!(response === true || response?.success === true))
              throw new Error(response?.error || "DOWNLOAD_FAILED");
            downloadedCount++;
            await new Promise((r) => setTimeout(r, 200));
          } catch (dlErr) {
            console.warn(
              "[TelegramExecutor] Download failed:",
              tileId,
              dlErr.message,
            );
          }
        }
        console.log(
          `[TelegramExecutor] Auto-download completed ${downloadedCount}/${successTileIds.length}`,
        );
      }
    }
    return { thumbnails: results };
  }
  static async _executeChatGPTGenerate(args) {
    console.log(
      "[TelegramExecutor] _executeChatGPTGenerate (ChatGPT provider)",
    );
    const { prompt, ratio, ref_images_base64, genType } = args;
    if (genType === "Video") {
      throw new Error(
        window.I18n?.t("telegram.chatgptNoVideo") ||
          "ChatGPT does not support video generation. Please use Flow or Grok.",
      );
    }
    if (!window.ChatGPTSession) {
      throw new Error(
        "ChatGPT session unavailable. Please open the ChatGPT tab and sign in.",
      );
    }
    const readyResult = await window.ChatGPTSession.ensureReady({
      createIfMissing: true,
      activate: true,
    });
    if (!readyResult.ready) {
      const errorMsg =
        readyResult.error === "NOT_LOGGED_IN"
          ? "Vui l\xF2ng \u0111\u0103ng nh\u1EADp v\xE0o ChatGPT tr\u01B0\u1EDBc khi s\u1EED d\u1EE5ng."
          : `ChatGPT kh\xF4ng s\u1EB5n s\xE0ng: ${readyResult.error}`;
      throw new Error(errorMsg);
    }
    const providerSettings = await this._getProviderSettings("chatgpt");
    const chatgptRatio = this._mapRatioToChatGPT(
      ratio || providerSettings.ratio,
    );
    let images = [];
    if (
      ref_images_base64 &&
      Array.isArray(ref_images_base64) &&
      ref_images_base64.length > 0
    ) {
      images = ref_images_base64
        .slice(0, 4)
        .map((base64, i) => ({
          base64,
          name: `telegram_ref_${i}.jpg`,
          type: "image/jpeg",
        }));
    }
    if (
      !window.MessageBridge ||
      typeof window.MessageBridge.chatGPTSubmitAndWait !== "function"
    ) {
      throw new Error("MessageBridge.chatGPTSubmitAndWait unavailable.");
    }
    const settings = await window.storageSettings?.getSettings();
    const fallbackPrefix =
      settings?.chatgptFallbackPrefix || "Generate an image of: ";
    console.log("[TelegramExecutor] Submitting to ChatGPT...");
    const result = await window.MessageBridge.chatGPTSubmitAndWait({
      text: prompt,
      images,
      settings: {
        imageMode: true,
        ratio: chatgptRatio,
        model: providerSettings.model,
        fallbackPrefix,
      },
      timeout: window.SystemConfig?.getTimeout("chatgpt_timeout_ms") || 12e4,
      tabId: readyResult.tabId,
      taskName: "Telegram ChatGPT",
    });
    if (!result || !result.success) {
      try {
        if (window.EditorExecutor?._incrementDailyStat) {
          window.EditorExecutor._incrementDailyStat("chatgpt_fail");
        }
      } catch (_) {}
      throw new Error(
        result?.message || result?.error || "ChatGPT did not return a result.",
      );
    }
    const thumbnails = [];
    if (result.imageUrls && result.imageUrls.length > 0) {
      for (const url of result.imageUrls) {
        try {
          const base64 = await this._fetchImageAsBase64(url, readyResult.tabId);
          if (base64) {
            thumbnails.push({
              url,
              type: "image",
              file_name: `chatgpt_${Date.now()}.png`,
              base64,
            });
          }
        } catch (err) {
          console.warn(
            "[TelegramExecutor] Failed to fetch ChatGPT image:",
            err.message,
          );
        }
      }
    }
    try {
      if (window.EditorExecutor?._incrementDailyStat) {
        window.EditorExecutor._incrementDailyStat("chatgpt_prompt_total");
      }
    } catch (_) {}
    await this._autoDownloadThumbnails(thumbnails, args);
    console.log(
      `[TelegramExecutor] ChatGPT generate ho\xE0n t\u1EA5t: ${thumbnails.length} \u1EA3nh`,
    );
    return { thumbnails };
  }
  static async _executeGrokGenerate(args) {
    console.log("[TelegramExecutor] _executeGrokGenerate (Grok provider)");
    const {
      prompt,
      ratio,
      genType = "Image",
      ref_images_base64,
      duration,
      resolution,
      imageQuality,
    } = args;
    if (!window.GrokSession) {
      throw new Error(
        "Grok session unavailable. Please open the Grok tab and sign in.",
      );
    }
    const readyResult = await window.GrokSession.ensureReady({
      createIfMissing: true,
      activate: true,
    });
    if (!readyResult.ready) {
      const errorMsg =
        readyResult.error === "NOT_LOGGED_IN"
          ? "Vui l\xF2ng \u0111\u0103ng nh\u1EADp v\xE0o Grok tr\u01B0\u1EDBc khi s\u1EED d\u1EE5ng."
          : `Grok kh\xF4ng s\u1EB5n s\xE0ng: ${readyResult.error}`;
      throw new Error(errorMsg);
    }
    const providerSettings = await this._getProviderSettings("grok");
    const isVideo = genType === "Video";
    const mode = isVideo ? "video" : "image";
    const grokRatio = this._mapRatioToGrok(ratio || providerSettings.ratio);
    const grokDuration = duration || providerSettings.duration || "6s";
    const grokResolution = resolution || providerSettings.resolution || "720p";
    const grokImageQuality =
      imageQuality || providerSettings.imageQuality || "speed";
    const modeResult = await window.GrokSession.setMode(mode);
    if (!modeResult.success) {
      console.warn(
        "[TelegramExecutor] Grok setMode probe failed:",
        modeResult.error,
      );
    }
    let images = [];
    if (
      ref_images_base64 &&
      Array.isArray(ref_images_base64) &&
      ref_images_base64.length > 0
    ) {
      images = ref_images_base64
        .slice(0, 4)
        .map((base64, i) => ({
          base64,
          name: `telegram_ref_${i}.jpg`,
          type: "image/jpeg",
        }));
    }
    if (
      !window.MessageBridge ||
      typeof window.MessageBridge.grokSubmitAndWait !== "function"
    ) {
      throw new Error("MessageBridge.grokSubmitAndWait unavailable.");
    }
    console.log(
      "[TelegramExecutor] Submitting to Grok, mode:",
      mode,
      "duration:",
      grokDuration,
      "resolution:",
      grokResolution,
      "imageQuality:",
      grokImageQuality,
    );
    const result = await window.MessageBridge.grokSubmitAndWait({
      text: prompt,
      images,
      settings: {
        mode,
        ratio: grokRatio,
        duration: grokDuration,
        resolution: grokResolution,
        imageQuality: grokImageQuality,
      },
      timeout:
        mode === "video"
          ? window.SystemConfig?.getTimeout("video_timeout_ms") || 6e5
          : window.SystemConfig?.getTimeout("image_timeout_ms") || 3e5,
      tabId: readyResult.tabId,
      taskName: "Telegram Grok",
    });
    if (!result || !result.success) {
      try {
        if (window.EditorExecutor?._incrementDailyStat) {
          window.EditorExecutor._incrementDailyStat("grok_fail");
        }
      } catch (_) {}
      throw new Error(
        result?.message || result?.error || "Grok did not return a result.",
      );
    }
    const thumbnails = [];
    const mediaUrls = result.mediaUrls || result.imageUrls || [];
    const mediaType =
      result.mediaType || (mode === "video" ? "video" : "image");
    for (const url of mediaUrls) {
      try {
        let base64Data = null;
        const fetched = result.fetchedMedia?.find((f) => f.url === url);
        if (fetched?.base64) {
          base64Data = fetched.base64;
        }
        if (!base64Data && window.MessageBridge?.grokFetchImage) {
          const fetchResult = await window.MessageBridge.grokFetchImage(
            url,
            readyResult.tabId,
          );
          if (fetchResult?.success && fetchResult?.base64) {
            base64Data = fetchResult.base64;
          }
        }
        if (!base64Data) {
          base64Data = await this._fetchImageAsBase64(url, readyResult.tabId);
        }
        if (base64Data) {
          thumbnails.push({
            url,
            type: mediaType,
            file_name: `grok_${Date.now()}.${mediaType === "video" ? "mp4" : "png"}`,
            base64: base64Data,
            video_url: mediaType === "video" ? url : "",
          });
        }
      } catch (err) {
        console.warn(
          "[TelegramExecutor] Failed to fetch Grok media:",
          err.message,
        );
      }
    }
    try {
      if (window.EditorExecutor?._incrementDailyStat) {
        window.EditorExecutor._incrementDailyStat("grok_prompt_total");
      }
    } catch (_) {}
    await this._autoDownloadThumbnails(thumbnails, args);
    console.log(
      `[TelegramExecutor] Grok generate ho\xE0n t\u1EA5t: ${thumbnails.length} ${mediaType}(s)`,
    );
    return { thumbnails };
  }
  static async _executeGeminiGenerate(args) {
    const { prompt, ratio, genType = "Image", ref_images_base64 } = args;
    const adapter = window.ProviderRegistry?.get?.("gemini");
    if (!adapter) throw new Error("Gemini adapter unavailable.");
    const isVideo = genType === "Video";
    const providerSettings = await this._getProviderSettings("gemini");
    const model =
      args.model ||
      providerSettings.model ||
      window.ModelRegistry?.safeGetDefault?.(
        "gemini",
        isVideo ? "video" : "image",
      );
    if (!model)
      throw new Error(
        "CONFIG_UNAVAILABLE: Gemini model config ch\u01B0a t\u1EA3i t\u1EEB server.",
      );
    const maxRefs =
      window.ProviderConfigManager?.safeGetMaxRefImagesSync?.(
        "gemini",
        isVideo ? "video" : "image",
      ) ?? 0;
    if (
      Array.isArray(ref_images_base64) &&
      ref_images_base64.length &&
      !window.featureGate?.canUseProviderRefImages?.("gemini")
    ) {
      throw new Error("GEMINI_REF_IMAGES_NOT_ALLOWED");
    }
    const refs = (Array.isArray(ref_images_base64) ? ref_images_base64 : [])
      .slice(0, maxRefs)
      .map((base64, i) => ({
        base64,
        name: `telegram_ref_${i}.jpg`,
        type: "image/jpeg",
      }));
    const result = await adapter.submit({
      prompt,
      mediaType: isVideo ? "video" : "image",
      model,
      ratio: isVideo ? null : ratio || providerSettings.ratio,
      refs,
      runId: `telegram-gemini-${Date.now()}`,
      settings: { promptIndex: 0 },
    });
    const thumbnails = [];
    for (const item of result.results || []) {
      let base64 =
        !isVideo && String(item.url || "").startsWith("data:")
          ? String(item.url).split(",")[1]
          : null;
      if (!base64 && window.MessageBridge?.geminiFetchMedia && result.tabId) {
        const maxBytes = window.ProviderConfigManager?.getApiConfigValueSync?.(
          "gemini",
          "generation_monitor",
        )?.[isVideo ? "video" : "image"]?.max_materialized_bytes;
        if (Number.isFinite(Number(maxBytes))) {
          const fetched = await window.MessageBridge.geminiFetchMedia(
            item.url,
            result.tabId,
            Number(maxBytes),
          );
          if (fetched?.success)
            base64 = String(fetched.base64 || "").replace(/^data:[^,]+,/, "");
        }
      }
      if (!base64) {
        throw new Error(
          `GEMINI_MEDIA_FETCH_FAILED:${isVideo ? "video" : "image"}`,
        );
      }
      thumbnails.push({
        url: item.url,
        type: isVideo ? "video" : "image",
        base64,
        file_name: `gemini_${Date.now()}_${thumbnails.length + 1}.${isVideo ? "mp4" : "png"}`,
        video_url: isVideo ? item.url : "",
        provider: "gemini",
        fingerprint: item.fingerprint || null,
        tab_id: result.tabId || null,
      });
    }
    if (!thumbnails.length) throw new Error("Gemini did not return a result.");
    await this._autoDownloadThumbnails(thumbnails, args);
    return { thumbnails };
  }
  static async _autoDownloadThumbnails(thumbnails, args) {
    try {
      if (!Array.isArray(thumbnails) || thumbnails.length === 0) return;
      const downloadSettings = await this._getDownloadSettings();
      const canAutoDownload = window.featureGate
        ? window.featureGate.canUse("auto_download")
        : true;
      const override = args?.autoDownload;
      const shouldAutoDownload =
        override !== void 0
          ? (override === true || override === "true") && canAutoDownload
          : downloadSettings.autoDownload && canAutoDownload;
      if (!shouldAutoDownload) return;
      const folder = downloadSettings.downloadFolder || "tobyflow_bot";
      for (const thumb of thumbnails) {
        try {
          const filename = `${folder}/${thumb.file_name}`;
          if (
            thumb?.provider === "gemini" &&
            thumb.type !== "video" &&
            thumb.fingerprint &&
            thumb.tab_id &&
            window.MessageBridge?.geminiDownloadImageNative
          ) {
            const nativeResult =
              await window.MessageBridge.geminiDownloadImageNative({
                tabId: thumb.tab_id,
                fingerprint: thumb.fingerprint,
                filename,
                removeWatermark:
                  window.WatermarkClient?.enabled?.("image") === true,
              });
            if (nativeResult?.success) {
              await new Promise((r) => setTimeout(r, 200));
              continue;
            }
            console.warn(
              "[TelegramExecutor] Gemini full-size download failed; falling back to materialized result:",
              nativeResult?.error || "GEMINI_NATIVE_DOWNLOAD_FAILED",
            );
          }
          if (
            thumb?.provider === "gemini" &&
            thumb.type === "video" &&
            thumb.fingerprint &&
            thumb.tab_id &&
            window.MessageBridge?.geminiDownloadVideoNative
          ) {
            const nativeResult =
              await window.MessageBridge.geminiDownloadVideoNative({
                tabId: thumb.tab_id,
                fingerprint: thumb.fingerprint,
                filename,
                removeWatermark:
                  window.WatermarkClient?.enabled?.("video") === true,
              });
            if (nativeResult?.success) {
              await new Promise((r) => setTimeout(r, 200));
              continue;
            }
            console.warn(
              "[TelegramExecutor] Gemini native video download failed; falling back to materialized result:",
              nativeResult?.error || "GEMINI_NATIVE_VIDEO_DOWNLOAD_FAILED",
            );
          }
          if (!thumb?.base64) continue;
          const mime = thumb.type === "video" ? "video/mp4" : "image/png";
          await window.DownloadHelper.downloadExternalMedia({
            base64: thumb.base64,
            mime,
            filename,
            mediaType: thumb.type === "video" ? "video" : "image",
          });
          await new Promise((r) => setTimeout(r, 200));
        } catch (e) {
          console.warn(
            "[TelegramExecutor] auto-download thumbnail failed:",
            e.message,
          );
        }
      }
      console.log("[TelegramExecutor] Telegram auto-download completed");
    } catch (e) {
      console.warn(
        "[TelegramExecutor] _autoDownloadThumbnails error:",
        e.message,
      );
    }
  }
  static async _fetchImageAsBase64(url, tabId) {
    try {
      if (window.MessageBridge?.chatGPTFetchImage && tabId) {
        const result = await window.MessageBridge.chatGPTFetchImage(url, tabId);
        if (result?.success && result?.base64) {
          return result.base64;
        }
      }
      const response = await fetch(url);
      if (!response.ok) {
        console.warn("[TelegramExecutor] Fetch failed:", url, response.status);
        return null;
      }
      const blob = await response.blob();
      return await this._blobToBase64(blob);
    } catch (err) {
      console.warn(
        "[TelegramExecutor] _fetchImageAsBase64 error:",
        err.message,
      );
      return null;
    }
  }
  static _reverseRatioMap(uiMap) {
    if (!uiMap || typeof uiMap !== "object") return {};
    const reversed = {};
    for (const [uiName, value] of Object.entries(uiMap)) {
      reversed[value] = uiName;
    }
    return reversed;
  }
  static _mapRatioToChatGPT(ratio) {
    if (!ratio) return "widescreen";
    const r = String(ratio).toLowerCase().trim();
    const uiMap =
      window.ProviderConfigManager?.getRatioUiMapSync?.("chatgpt") || {};
    const reversed = this._reverseRatioMap(uiMap);
    const fallback = {
      "16:9": "widescreen",
      "9:16": "story",
      "1:1": "square",
      "4:3": "landscape",
      "3:4": "portrait",
    };
    const valueToUi = { ...fallback, ...reversed };
    const vnAliases = {
      ngang: "widescreen",
      "d\u1ECDc": "story",
      doc: "story",
      "vu\xF4ng": "square",
      vuong: "square",
    };
    if (vnAliases[r]) return vnAliases[r];
    if (valueToUi[r]) return valueToUi[r];
    if (uiMap[r]) return r;
    return "widescreen";
  }
  static _mapRatioToGrok(ratio) {
    if (!ratio) return "widescreen";
    const r = String(ratio).toLowerCase().trim();
    const uiMap =
      window.ProviderConfigManager?.getRatioUiMapSync?.("grok") || {};
    const reversed = this._reverseRatioMap(uiMap);
    const fallback = {
      "16:9": "widescreen",
      "9:16": "story",
      "1:1": "square",
      "3:2": "landscape",
      "2:3": "portrait",
      "4:3": "landscape",
      "3:4": "portrait",
    };
    const valueToUi = { ...fallback, ...reversed };
    const vnAliases = {
      ngang: "widescreen",
      "d\u1ECDc": "story",
      doc: "story",
      "vu\xF4ng": "square",
      vuong: "square",
    };
    if (vnAliases[r]) return vnAliases[r];
    if (valueToUi[r]) return valueToUi[r];
    if (uiMap[r]) return r;
    return "widescreen";
  }
  static async _executeVideo(args) {
    return await this._executeGenerate({ ...args, count: 1, genType: "Video" });
  }
  static async _executeWorkflow(args) {
    const workflow_name = args.workflow_name || args.prompt;
    if (!workflow_name)
      throw new Error(
        window.I18n?.t("telegram.missingWorkflowName") ||
          "Missing workflow name",
      );
    let wf = args.workflow_id
      ? await window.storageManager?.getWorkflow?.(args.workflow_id)
      : null;
    if (!wf) {
      const workflows = (await window.storageManager?.getWorkflows()) || [];
      const query = workflow_name.toLowerCase();
      wf =
        workflows.find((w) => w.wf_name?.toLowerCase() === query) ||
        workflows.find((w) => w.wf_name?.toLowerCase().includes(query));
    }
    if (!wf)
      throw new Error(
        window.I18n?.t("telegram.workflowNotFound", { name: workflow_name }) ||
          `Workflow not found: ${workflow_name}`,
      );
    await this._pingExecutorHeartbeat(
      "workflow_resolved",
      this._currentQueueId,
    );
    if (!window.workflowExecutor) {
      throw new Error("WorkflowExecutor not initialized");
    }
    const collectedThumbnails = [];
    const nodeCompletedHandler = (data) => {
      if (data.result?.thumbnails) {
        for (const [tileId, info] of Object.entries(data.result.thumbnails)) {
          if (info.thumbnail || info.thumbnailUrl) {
            collectedThumbnails.push({
              url: info.thumbnail || info.thumbnailUrl,
              type: info.type || "image",
              file_name: info.file_name || "",
              video_url: info.video_url || "",
            });
          }
        }
      }
    };
    window.eventBus?.on("node:completed", nodeCompletedHandler);
    try {
      console.log(
        `[TelegramExecutor] Ch\u1EA1y workflow: ${wf.wf_name} (${wf.wf_id})`,
      );
      await this._pingExecutorHeartbeat(
        "execution_started",
        this._currentQueueId,
      );
      const success = await window.workflowExecutor.execute(wf.wf_id);
      if (!success) {
        throw new Error("Workflow execution failed");
      }
      console.log(
        `[TelegramExecutor] Workflow ho\xE0n th\xE0nh, thu th\u1EADp \u0111\u01B0\u1EE3c ${collectedThumbnails.length} thumbnails`,
      );
      if (collectedThumbnails.length === 0) {
        console.log(
          "[TelegramExecutor] Kh\xF4ng c\xF3 thumbnails t\u1EEB events, thu th\u1EADp t\u1EEB cached results...",
        );
        const fullWorkflow = await window.storageManager?.getWorkflow(wf.wf_id);
        if (fullWorkflow?.nodes) {
          for (const node of fullWorkflow.nodes) {
            if (!["generate"].includes(node.node_type)) continue;
            if (!node.result_thumbnails) continue;
            for (const [tileId, info] of Object.entries(
              node.result_thumbnails,
            )) {
              const thumbUrl =
                typeof info === "string"
                  ? info
                  : info.thumbnail || info.thumbnailUrl || info;
              if (
                thumbUrl &&
                typeof thumbUrl === "string" &&
                thumbUrl.startsWith("http")
              ) {
                collectedThumbnails.push({
                  url: thumbUrl,
                  type: info?.type || "image",
                  file_name:
                    node.result_file_names?.[tileId] || info?.file_name || "",
                  video_url: info?.video_url || "",
                });
              }
            }
          }
          console.log(
            `[TelegramExecutor] Thu th\u1EADp \u0111\u01B0\u1EE3c ${collectedThumbnails.length} thumbnails t\u1EEB cached results`,
          );
        }
      }
      if (collectedThumbnails.length === 0) {
        collectedThumbnails.push({
          type: "text_only",
          message:
            window.I18n?.t("telegram.workflowCompletedNoMedia", {
              name: wf.wf_name,
            }) ||
            `Workflow \u201C${wf.wf_name}\u201D completed successfully without media output.`,
        });
      }
      return { thumbnails: collectedThumbnails };
    } finally {
      window.eventBus?.off("node:completed", nodeCompletedHandler);
    }
  }
  static async _executeStop() {
    if (window.ExecutionGate && this._currentExecutionToken) {
      ExecutionGate.cancel(this._currentExecutionToken);
      this._currentExecutionToken = null;
    }
    if (window.ExecutionLock?.stopCurrent) {
      window.ExecutionLock.stopCurrent();
    }
    return { thumbnails: [] };
  }
  static _handleCancel(data) {
    const { queue_id } = data;
    if (this._currentQueueId === queue_id) {
      this._executeStop();
    }
  }
  static _handleStop(data) {
    console.log(
      "[TelegramExecutor] Nh\u1EADn l\u1EC7nh /stop t\u1EEB Telegram",
      data,
    );
    const { queue_id } = data;
    if (this._currentQueueId === queue_id || this._isExecuting) {
      this._executeStop();
      if (typeof window.sidebarLog === "function") {
        window.sidebarLog("[Telegram] Command stopped as requested", "info");
      }
    }
  }
  static async _uploadRefFromBase64(base64Data) {
    if (!base64Data) return null;
    if (!window.MessageBridge?.uploadFilesToFlow) {
      console.warn(
        "[TelegramExecutor] MessageBridge ch\u01B0a s\u1EB5n s\xE0ng",
      );
      return null;
    }
    if (window.ImmediateUploader) {
      try {
        const activation = await window.ImmediateUploader._ensureFlowTabReady();
        if (!activation?.isOpen) {
          console.warn(
            "[TelegramExecutor] Flow tab kh\xF4ng m\u1EDF, kh\xF4ng th\u1EC3 upload ref image",
          );
          return null;
        }
      } catch (e) {
        console.warn(
          "[TelegramExecutor] Kh\xF4ng th\u1EC3 ki\u1EC3m tra Flow tab:",
          e.message,
        );
      }
    }
    try {
      const result = await window.MessageBridge.uploadFilesToFlow([
        { name: "telegram_ref.jpg", type: "image/jpeg", base64: base64Data },
      ]);
      const tileId =
        result?.orderedTileIds?.[0] || result?.tileIds?.[0] || null;
      if (tileId) {
        console.log(
          "[TelegramExecutor] Upload ref image (base64) th\xE0nh c\xF4ng, tileId:",
          tileId,
        );
      }
      return tileId;
    } catch (err) {
      console.error(
        "[TelegramExecutor] Upload ref image (base64) l\u1ED7i:",
        err.message,
      );
      return null;
    }
  }
  static async _uploadRefFromUrl(imageUrl) {
    const fetchResp = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: "fetchBlob", url: imageUrl },
        (resp) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(resp);
        },
      );
    });
    if (!fetchResp?.success || !fetchResp.base64) {
      console.warn(
        "[TelegramExecutor] Kh\xF4ng t\u1EA3i \u0111\u01B0\u1EE3c \u1EA3nh ref t\u1EEB Telegram",
      );
      return null;
    }
    if (!window.MessageBridge?.uploadFilesToFlow) {
      console.warn(
        "[TelegramExecutor] MessageBridge ch\u01B0a s\u1EB5n s\xE0ng",
      );
      return null;
    }
    let telegramFlowActivation = null;
    if (window.ImmediateUploader) {
      try {
        telegramFlowActivation =
          await window.ImmediateUploader._ensureFlowTabReady();
        if (!telegramFlowActivation?.isOpen) {
          console.warn(
            "[TelegramExecutor] Flow tab kh\xF4ng m\u1EDF, kh\xF4ng th\u1EC3 upload ref image",
          );
          return null;
        }
      } catch (e) {
        console.warn(
          "[TelegramExecutor] Kh\xF4ng th\u1EC3 ki\u1EC3m tra Flow tab:",
          e.message,
        );
      }
    }
    try {
      const result = await window.MessageBridge.uploadFilesToFlow([
        {
          name: "telegram_ref.jpg",
          type: "image/jpeg",
          base64: fetchResp.base64,
        },
      ]);
      const tileId =
        result?.orderedTileIds?.[0] || result?.tileIds?.[0] || null;
      if (tileId) {
        console.log(
          "[TelegramExecutor] Upload ref image th\xE0nh c\xF4ng, tileId:",
          tileId,
        );
      } else {
        console.warn(
          "[TelegramExecutor] Upload xong nh\u01B0ng kh\xF4ng nh\u1EADn \u0111\u01B0\u1EE3c tileId",
        );
      }
      return tileId;
    } catch (err) {
      console.error(
        "[TelegramExecutor] Upload ref image l\u1ED7i:",
        err.message,
      );
      return null;
    }
  }
  static _mapCommandToAction(command, provider = "flow") {
    const cmd = command?.replace("/", "") || "";
    if (cmd === "image" || cmd === "video") {
      return provider === "grok"
        ? "grok_run"
        : provider === "chatgpt"
          ? "chatgpt_run"
          : provider === "gemini"
            ? "gemini_run"
            : provider === "flow"
              ? "generate"
              : null;
    }
    if (cmd === "workflow") return "workflow_run";
    return null;
  }
  static _clampFlowVideoRatio(ratio) {
    if (!ratio) return "16:9";
    const r = String(ratio).toLowerCase().trim();
    const portrait = [
      "9:16",
      "doc",
      "d\u1ECDc",
      "portrait",
      "tall",
      "p",
      "story",
    ];
    return portrait.includes(r) ? "9:16" : "16:9";
  }
  static _mapRatio(ratio) {
    if (!ratio) return null;
    const r = ratio.toLowerCase().trim();
    const map = {
      "16:9": "Ngang",
      "4:3": "4:3",
      "1:1": "Vu\xF4ng",
      "3:4": "3:4",
      "9:16": "D\u1ECDc",
      ngang: "Ngang",
      doc: "D\u1ECDc",
      "d\u1ECDc": "D\u1ECDc",
      vuong: "Vu\xF4ng",
      "vu\xF4ng": "Vu\xF4ng",
      landscape: "Ngang",
      portrait: "D\u1ECDc",
      square: "Vu\xF4ng",
      wide: "Ngang",
      tall: "D\u1ECDc",
      l: "Ngang",
      p: "D\u1ECDc",
      s: "Vu\xF4ng",
      w: "Ngang",
      t: "D\u1ECDc",
    };
    return map[r] || null;
  }
  static async _getDownloadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["af_settings"], (res) => {
        const settings = res.af_settings || {};
        const telegramAutoDownload = settings.telegramAutoDownload;
        resolve({
          autoDownload:
            telegramAutoDownload === void 0
              ? true
              : telegramAutoDownload === true ||
                telegramAutoDownload === "1" ||
                telegramAutoDownload === 1,
          downloadResolution: settings.telegramDownloadResolution || "1k",
          videoDownloadResolution:
            settings.telegramVideoDownloadResolution || "720p",
          downloadFolder: settings.telegramDownloadFolder || "tobyflow_bot",
        });
      });
    });
  }
  static async _sendResult(queueId, status, thumbnails, errorMessage = null) {
    console.log("[TelegramExecutor] _sendResult:", {
      queueId,
      status,
      thumbnails,
      errorMessage,
    });
    try {
      let processedThumbnails = [];
      if (thumbnails && thumbnails.length > 0) {
        processedThumbnails = await this._convertThumbnailsToBase64(thumbnails);
      }
      const response = await window.authManager?._apiCall(
        "POST",
        "telegram/result",
        {
          queue_id: queueId,
          status,
          thumbnails: processedThumbnails,
          error_message: errorMessage,
        },
      );
      console.log("[TelegramExecutor] _sendResult response:", response);
    } catch (err) {
      console.error(
        "[TelegramExecutor] L\u1ED7i g\u1EEDi k\u1EBFt qu\u1EA3:",
        err.message,
      );
    }
  }
  static async _convertThumbnailsToBase64(thumbnails) {
    const results = [];
    for (const thumb of thumbnails) {
      try {
        const mediaType = thumb.type || "image";
        if (mediaType === "text_only" && thumb.message) {
          results.push({ type: "text_only", message: String(thumb.message) });
          continue;
        }
        if (mediaType === "video" && thumb.video_url) {
          console.log(
            "[TelegramExecutor] Downloading video for Telegram:",
            thumb.video_url,
          );
          try {
            const response2 = await fetch(thumb.video_url);
            if (!response2.ok) {
              console.warn(
                "[TelegramExecutor] Failed to fetch video:",
                thumb.video_url,
                response2.status,
              );
              continue;
            }
            const blob2 = await response2.blob();
            console.log(
              "[TelegramExecutor] Video downloaded, size:",
              blob2.size,
              "type:",
              blob2.type,
            );
            if (blob2.size > 5 * 1024 * 1024) {
              console.warn(
                "[TelegramExecutor] Video too large to send via API (>5MB):",
                blob2.size,
              );
              results.push({
                type: "text_only",
                message: `Video generated successfully (${(blob2.size / 1024 / 1024).toFixed(1)}MB) but too large to send via Telegram. Please check on Google Flow.`,
              });
              continue;
            }
            const base642 = await this._blobToBase64(blob2);
            results.push({
              type: "video",
              base64: base642,
              file_name: thumb.file_name || "",
              mime_type: blob2.type || "video/mp4",
            });
          } catch (videoErr) {
            console.error(
              "[TelegramExecutor] Error downloading video:",
              videoErr.message,
            );
          }
          continue;
        }
        if (!thumb.url) continue;
        const response = await fetch(thumb.url);
        if (!response.ok) {
          console.warn(
            "[TelegramExecutor] Failed to fetch thumbnail:",
            thumb.url,
            response.status,
          );
          continue;
        }
        const blob = await response.blob();
        let base64 = await this._blobToBase64(blob);
        let mime = blob.type || "image/png";
        if (window.WatermarkClient) {
          const cl = await window.WatermarkClient.cleanBase64(
            base64,
            mime,
            "image",
          );
          if (cl.cleaned) {
            base64 = cl.base64;
            mime = cl.mime;
          }
        }
        results.push({
          type: "image",
          base64,
          file_name: thumb.file_name || "",
          mime_type: mime,
        });
      } catch (err) {
        console.warn(
          "[TelegramExecutor] Error converting thumbnail:",
          thumb.url,
          err.message,
        );
      }
    }
    return results;
  }
  static _blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}
__publicField(TelegramExecutor, "_currentQueueId", null);
__publicField(TelegramExecutor, "_isExecuting", false);
__publicField(TelegramExecutor, "_initialized", false);
__publicField(TelegramExecutor, "_executorHeartbeatTimer", null);
__publicField(TelegramExecutor, "_activeHeartbeatTimer", null);
window.TelegramExecutor = TelegramExecutor;
