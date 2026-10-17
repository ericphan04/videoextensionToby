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
class ImmediateUploader {
  static _emitStage(key, stage, extra = {}) {
    if (
      !key ||
      !["queued", "preparing", "uploading", "resolving", "ready"].includes(
        stage,
      )
    )
      return;
    window.eventBus?.emit("upload:stage", { key, stage, ...extra });
  }
  static async _pingServiceWorker(timeoutMs = 500) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      try {
        chrome.runtime.sendMessage({ action: "ping" }, (response) => {
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            console.warn(
              "[ImmediateUploader] SW ping failed:",
              chrome.runtime.lastError.message,
            );
            resolve(false);
            return;
          }
          resolve(!!response?.ok);
        });
      } catch (e) {
        clearTimeout(timer);
        console.warn("[ImmediateUploader] SW ping exception:", e?.message || e);
        resolve(false);
      }
    });
  }
  static async _ensureFlowTabReady() {
    let targetTabId = window._targetFlowTabId || null;
    if (!targetTabId) {
      try {
        const res = await chrome.storage?.session?.get("targetFlowTabId");
        targetTabId = res?.targetFlowTabId || null;
      } catch (e) {}
    }
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          action: "ensureFlowTabReady",
          targetTabId,
          readinessScope: "project",
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn(
              "[ImmediateUploader] _ensureFlowTabReady chrome.runtime.lastError:",
              chrome.runtime.lastError.message,
            );
            resolve({ isOpen: false });
            return;
          }
          console.log(
            "[ImmediateUploader] _ensureFlowTabReady response:",
            response,
          );
          resolve(response || { isOpen: false });
        },
      );
    });
  }
  static _restorePreviousTab(previousTabId) {
    if (!previousTabId) return;
    chrome.runtime
      .sendMessage({ action: "restorePreviousTab", previousTabId })
      .catch(() => {});
  }
  static async upload(file, thumbnail, options = {}) {
    const key =
      options.key ||
      "upload_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    if (!file || typeof file.size !== "number" || file.size === 0) {
      const errMsg = `File is empty or invalid (size=${file?.size}). C\xF3 th\u1EC3 do Chrome profile data corrupt \u2014 vui l\xF2ng th\u1EED l\u1EA1i ho\u1EB7c reload extension.`;
      console.error("[ImmediateUploader] upload rejected \u2014 empty file", {
        key,
        name: file?.name,
        size: file?.size,
      });
      window.eventBus?.emit("upload:failed", {
        key,
        error: errMsg,
        code: "FILE_EMPTY",
      });
      return { success: false, key, error: errMsg, code: "FILE_EMPTY" };
    }
    const SW_PING_CACHE_MS = 3e4;
    const lastCheck = this._lastSwHealthCheckAt || 0;
    if (Date.now() - lastCheck > SW_PING_CACHE_MS) {
      const swAlive = await this._pingServiceWorker(500);
      if (!swAlive) {
        const errMsg =
          "Extension service worker is not responding. Vui l\xF2ng t\u1EAFt/b\u1EADt l\u1EA1i extension trong chrome://extensions/ r\u1ED3i th\u1EED l\u1EA1i.";
        console.error("[ImmediateUploader] upload rejected \u2014 SW dead", {
          key,
        });
        window.eventBus?.emit("upload:failed", {
          key,
          error: errMsg,
          code: "SW_NOT_RESPONDING",
        });
        return {
          success: false,
          key,
          error: errMsg,
          code: "SW_NOT_RESPONDING",
        };
      }
      this._lastSwHealthCheckAt = Date.now();
    }
    const existing = this._uploading.get(key);
    if (existing) {
      console.log(`[ImmediateUploader] Skip duplicate upload: ${key}`);
      if (existing !== true) {
        return existing;
      }
      return { success: true, key, pending: true, duplicate: true };
    }
    this._fileRefs.set(key, new WeakRef(file));
    this._uploading.set(key, true);
    this._emitStage(key, "queued");
    this._pendingCount++;
    const flowState = await this._ensureFlowTabReady();
    const flowReady =
      flowState?.ready === true ||
      (flowState?.ready == null && flowState?.isOpen === true);
    if (flowReady) {
      if (flowState.wasActivated && !this._activationState) {
        this._activationState = { previousTabId: flowState.previousTabId };
      }
      const control = window.MessageBridge?.createUploadControl?.(1, () =>
        this._cancelled.has(key),
      );
      if (control) this._uploadControlsByKey.set(key, control);
      const uploadTask = this._queue.then(async () => {
        try {
          await control?.checkpoint();
          return await this._uploadImmediate(key, file, thumbnail, {
            ...options,
            control,
            _queuedTask: uploadTask,
          });
        } catch (error) {
          const pending = await this._saveLightweightPending(
            key,
            file,
            thumbnail,
            options,
          );
          this._uploading.delete(key);
          window.eventBus?.emit("upload:failed", {
            key,
            error: error.message,
            cancelled: control?.abortFn() === true,
          });
          return pending;
        } finally {
          control?.finish();
          if (this._uploadControlsByKey.get(key) === control)
            this._uploadControlsByKey.delete(key);
          if (
            this._uploading.get(key) === true ||
            this._uploading.get(key) === uploadTask
          )
            this._uploading.delete(key);
          this._pendingCount--;
          if (this._pendingCount <= 0) {
            this._activationState = null;
            this._pendingCount = 0;
          }
        }
      });
      this._queue = uploadTask.catch(() => {});
      this._uploading.set(key, uploadTask);
      return uploadTask;
    } else {
      console.warn(
        "[ImmediateUploader] Flow tab NOT ready \u2192 fallback pending. flowState:",
        flowState,
      );
      this._pendingCount--;
      this._uploading.delete(key);
      return this._saveLightweightPending(key, file, thumbnail, options, {
        reason: flowState?.error || "FLOW_NOT_READY",
      });
    }
  }
  static async _uploadImmediate(key, file, thumbnail, options) {
    console.log(`[ImmediateUploader] Uploading: ${file.name}`);
    const existing = this._uploading.get(key);
    if (existing && existing !== true && existing !== options._queuedTask) {
      return existing;
    }
    this._uploading.set(key, true);
    const uploadPromise = (async () => {
      let emitEvent = null;
      let emitData = null;
      let returnResult = null;
      try {
        this._activeUploads.add(key);
        window.eventBus?.emit("upload:started", { key, fileName: file.name });
        this._emitStage(key, "preparing");
        const perfNow = () => globalThis.performance?.now?.() ?? Date.now();
        const uploadPerfStartedAt = perfNow();
        const isInputImage = String(file.type || "").startsWith("image/");
        if (
          window.WatermarkClient &&
          isInputImage &&
          options.inputWatermarkProcessed !== true
        ) {
          try {
            const cleaned = await window.WatermarkClient.cleanBlob(
              file,
              "image",
              { scope: "input" },
            );
            if (cleaned && cleaned !== file) {
              file = new File([cleaned], file.name, {
                type: cleaned.type || file.type,
              });
              console.log(
                `[ImmediateUploader] \u0111\xE3 xo\xE1 watermark tr\u01B0\u1EDBc khi upload: ${file.name}`,
              );
            }
          } catch (e) {
            console.warn(
              "[ImmediateUploader] b\u1ECF qua xo\xE1 watermark:",
              e?.message,
            );
          }
        }
        const encodeStartedAt = perfNow();
        let arrayBuffer = await file.arrayBuffer();
        let bytes = new Uint8Array(arrayBuffer);
        const sourceByteLength = arrayBuffer.byteLength;
        let base64 = null;
        if (typeof bytes.toBase64 === "function") {
          try {
            base64 = bytes.toBase64();
          } catch (_) {}
        }
        if (base64 === null) {
          let binary = "";
          const chunkSize = 8192;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode.apply(
              null,
              bytes.subarray(i, i + chunkSize),
            );
          }
          base64 = btoa(binary);
        }
        const encodedAt = perfNow();
        console.info(
          "[FlowUploadPerf] immediate payload prepared",
          JSON.stringify({
            bytes: arrayBuffer.byteLength,
            preEncodeMs: Math.round(encodeStartedAt - uploadPerfStartedAt),
            encodeMs: Math.round(encodedAt - encodeStartedAt),
            nativeBase64: typeof bytes.toBase64 === "function",
          }),
        );
        if (!window.MessageBridge) {
          console.error("[ImmediateUploader] MessageBridge not available!");
          throw new Error("MessageBridge not available");
        }
        let result = null;
        if (!result) {
          console.log(
            `[ImmediateUploader] Calling MessageBridge.uploadFilesToFlow for ${file.name}`,
          );
          const workflowSurface = options.surface === "workflow";
          const forceDom =
            options.forceDom === true ||
            window.FlowApiAdapter?.isApiModeIntended?.({
              forWorkflow: workflowSurface,
            }) !== true;
          const uploadPayload = [
            { name: file.name, type: file.type, base64, key },
          ];
          const uploadPromise2 = window.MessageBridge.uploadFilesToFlow(
            uploadPayload,
            {
              manualUpload: true,
              surface: options.surface || "gen",
              control: options.control,
              forceDom,
              abortFn: () => this._cancelled.has(key),
            },
          );
          this._emitStage(key, "uploading");
          uploadPayload[0].base64 = "";
          base64 = null;
          bytes = null;
          arrayBuffer = null;
          result = await uploadPromise2;
          this._emitStage(key, "resolving");
        }
        console.info(
          "[FlowUploadPerf] immediate receipt received",
          JSON.stringify({
            bytes: sourceByteLength,
            bridgeMs: Math.round(perfNow() - encodedAt),
            totalMs: Math.round(perfNow() - uploadPerfStartedAt),
          }),
        );
        console.log(
          "[ImmediateUploader] uploadFilesToFlow result",
          JSON.stringify({
            success: result?.success !== false,
            error: result?.error || null,
            tileCount: result?.tileIds?.length || 0,
            detailCount: result?.tileDetails?.length || 0,
            warning: result?.warning || null,
          }),
        );
        if (result?.error === "UPLOAD_BLOCKED") {
          const reason =
            result.errorMessage ||
            window.I18n?.t("workflow.uploadBlockedReason") ||
            "Flow rejected the image (content policy violation).";
          console.warn(
            `[ImmediateUploader] Flow blocked upload "${file.name}": ${reason}`,
          );
          const err = new Error(`UPLOAD_BLOCKED: ${reason}`);
          err.code = "UPLOAD_BLOCKED";
          throw err;
        }
        if (!result?.orderedTileIds?.[0] && !result?.tileIds?.[0]) {
          throw new Error("Upload failed - no tile ID returned");
        }
        const tileId = result.orderedTileIds?.[0] || result.tileIds[0];
        const tileDetail = result.tileDetails?.[0];
        let fileName = tileDetail?.file_name || null;
        const sourceIsVideo = file.type?.startsWith("video/");
        const localVideoPoster =
          sourceIsVideo &&
          typeof thumbnail === "string" &&
          thumbnail &&
          !thumbnail.startsWith("blob:")
            ? thumbnail
            : null;
        let thumbnailUrl = tileDetail?.thumbnailUrl || localVideoPoster || null;
        if (tileDetail?.api_driver && !thumbnailUrl && !sourceIsVideo) {
          thumbnailUrl = await this._portableImageThumbnail(file, thumbnail);
        }
        const mediaType = sourceIsVideo ? "video" : tileDetail?.type || "image";
        let videoUrl =
          tileDetail?.video_url && !tileDetail.video_url.startsWith("blob:")
            ? tileDetail.video_url
            : null;
        const settledCleanupWarning =
          result.editorReady === false ||
          [
            "V2_ADD_MENU_CLOSE_FAILED",
            "V2_EDITOR_NOT_READY_AFTER_ADD_MENU_CLOSE",
          ].includes(result.warning);
        if (
          !tileDetail?.api_driver &&
          !settledCleanupWarning &&
          tileDetail?.preview_pending !== true &&
          (!thumbnailUrl ||
            thumbnailUrl.startsWith("blob:") ||
            thumbnailUrl.includes("placeholder"))
        ) {
          console.log(
            `[ImmediateUploader] tileDetails thumbnail invalid, falling back to DOM poll`,
          );
          const identifiers = await this._extractIdentifiersFromTile(tileId);
          fileName = fileName || identifiers?.fileName || null;
          thumbnailUrl = identifiers?.thumbnailUrl || thumbnailUrl || null;
          if (
            sourceIsVideo &&
            identifiers?.videoUrl &&
            !identifiers.videoUrl.startsWith("blob:")
          ) {
            videoUrl = videoUrl || identifiers.videoUrl;
          }
        }
        const mediaUuid =
          [tileDetail?.media_uuid, tileDetail?.file_id, fileName, tileId]
            .map((value) => String(value || "").trim())
            .find((value) =>
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                value,
              ),
            ) || null;
        const uploadResult = {
          success: true,
          key,
          tile_id: tileId,
          file_name: fileName,
          thumbnail_url: thumbnailUrl,
          type: mediaType,
          ...(mediaUuid && { media_uuid: mediaUuid }),
          ...(tileDetail?.api_driver && {
            api_driver: tileDetail.api_driver,
            project_id: tileDetail.project_id,
          }),
          ...(tileDetail?.persistent_media_id && {
            persistent_media_id: tileDetail.persistent_media_id,
            identity_kind: tileDetail.identity_kind,
            identity_durability: tileDetail.identity_durability,
            identity_aliases: tileDetail.identity_aliases,
          }),
          ...(tileDetail?.protocol_revision && {
            protocol_revision: tileDetail.protocol_revision,
          }),
          ...(tileDetail?.protocol_fingerprint && {
            protocol_fingerprint: tileDetail.protocol_fingerprint,
          }),
          ...(videoUrl && { video_url: videoUrl }),
          display_name:
            tileDetail?.display_name || tileDetail?.uploadName || file.name,
          pending: false,
        };
        window.MediaRegistry?.setRefIdentity?.(tileId, uploadResult);
        if (tileDetail?.api_driver)
          console.info(
            "[FlowUploadRefResult]",
            JSON.stringify({
              mediaIdentity: window.MediaRegistry?.describeIdentity?.(
                tileId,
              ) || { kind: "redacted" },
              driver: tileDetail.api_driver,
              projectBound: !!tileDetail.project_id,
              previewSource: tileDetail.thumbnailUrl
                ? "resolve_media"
                : thumbnailUrl
                  ? "local_cache"
                  : "none",
            }),
          );
        if (this._cancelled.has(key)) {
          console.log(
            `[ImmediateUploader] Upload completed but cancelled, skipping: ${key}`,
          );
          this._cancelled.delete(key);
          returnResult = { success: false, key, cancelled: true };
          return returnResult;
        }
        window.MediaRegistry?.auditRefIdentity?.(
          "upload:completed",
          [uploadResult],
          { surface: "immediate-upload" },
        );
        this._results.set(key, uploadResult);
        if (fileName) {
          window.TileCache?.set(fileName, tileId);
        }
        if (thumbnailUrl) {
          window.TileCache?.set(thumbnailUrl, tileId);
        }
        if (window.PendingUploadStore) {
          try {
            await window.PendingUploadStore.cacheUploaded(tileId, file);
            if (tileDetail?.api_driver) {
              if (sourceIsVideo) {
                void this._portableVideoThumbnail(file).then((preview) =>
                  preview
                    ? window.PendingUploadStore.saveRefPreview?.(
                        tileId,
                        preview,
                      )
                    : false,
                );
              } else {
                const preview = await this._portableImageThumbnail(
                  file,
                  thumbnail,
                );
                if (preview)
                  await window.PendingUploadStore.saveRefPreview?.(
                    tileId,
                    preview,
                  );
              }
            }
          } catch (cacheErr) {
            console.warn(
              "[ImmediateUploader] cacheUploaded failed:",
              cacheErr?.message,
            );
          }
        }
        console.log(`[ImmediateUploader] Upload success: ${key}`, uploadResult);
        this._emitStage(key, "ready");
        emitEvent = "upload:completed";
        emitData = uploadResult;
        returnResult = uploadResult;
        return returnResult;
      } catch (err) {
        console.warn(
          `[ImmediateUploader] Upload deferred to pending: ${key}`,
          err.message,
        );
        if (this._cancelled.delete(key)) {
          returnResult = { success: false, key, cancelled: true };
          return returnResult;
        }
        emitEvent = "upload:failed";
        emitData = {
          key,
          error: err.message,
          cancelled: options.control?.abortFn?.() === true,
        };
        returnResult = await this._saveLightweightPending(
          key,
          file,
          thumbnail,
          options,
        );
        return returnResult;
      } finally {
        this._activeUploads.delete(key);
        this._uploading.delete(key);
        if (emitEvent) {
          window.eventBus?.emit(emitEvent, emitData);
        }
      }
    })();
    this._uploading.set(key, uploadPromise);
    return uploadPromise;
  }
  static async _portableImageThumbnail(file, candidate) {
    if (
      typeof candidate === "string" &&
      /^data:image\/(?:jpeg|png|webp);base64,/i.test(candidate) &&
      candidate.length <= 128e3
    )
      return candidate;
    if (!file?.type?.startsWith("image/")) return null;
    let objectUrl = null;
    let image = null;
    let canvas = null;
    try {
      objectUrl = URL.createObjectURL(file);
      image = new Image();
      const loaded = new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("THUMBNAIL_TIMEOUT")),
          1e4,
        );
        image.onload = () => {
          clearTimeout(timer);
          resolve();
        };
        image.onerror = () => {
          clearTimeout(timer);
          reject(new Error("THUMBNAIL_DECODE_FAILED"));
        };
      });
      image.src = objectUrl;
      await loaded;
      const scale = Math.min(
        200 / image.naturalWidth,
        200 / image.naturalHeight,
        1,
      );
      if (!Number.isFinite(scale) || scale <= 0) return null;
      canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas
        .getContext("2d")
        ?.drawImage(image, 0, 0, canvas.width, canvas.height);
      const portable = canvas.toDataURL("image/jpeg", 0.7);
      return portable.length <= 128e3 ? portable : null;
    } catch (error) {
      console.warn(
        "[ImmediateUploader] Portable thumbnail unavailable:",
        error?.message,
      );
      return null;
    } finally {
      if (image) {
        try {
          image.onload = null;
          image.onerror = null;
          image.src = "";
        } catch (_) {}
      }
      if (canvas) {
        try {
          canvas.width = 1;
          canvas.height = 1;
        } catch (_) {}
      }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }
  static async _portableVideoThumbnail(file, maxSize = 200) {
    if (!file?.type?.startsWith("video/")) return null;
    let objectUrl = null;
    let video = null;
    let canvas = null;
    try {
      objectUrl = URL.createObjectURL(file);
      video = document.createElement("video");
      video.muted = true;
      video.preload = "metadata";
      video.playsInline = true;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("VIDEO_THUMBNAIL_TIMEOUT")),
          1e4,
        );
        const finish = (callback) => {
          clearTimeout(timer);
          callback();
        };
        video.onloadeddata = () => finish(resolve);
        video.onerror = () =>
          finish(() => reject(new Error("VIDEO_THUMBNAIL_DECODE_FAILED")));
        video.src = objectUrl;
      });
      const width = video.videoWidth,
        height = video.videoHeight;
      if (!width || !height) return null;
      const scale = Math.min(maxSize / width, maxSize / height, 1);
      canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      canvas
        .getContext("2d")
        ?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const portable = canvas.toDataURL("image/jpeg", 0.7);
      return portable.length <= 128e3 ? portable : null;
    } catch (error) {
      console.warn(
        "[ImmediateUploader] Portable video thumbnail unavailable:",
        error?.message,
      );
      return null;
    } finally {
      if (video) {
        try {
          video.onloadeddata = null;
          video.onerror = null;
          video.removeAttribute("src");
          video.load();
        } catch (_) {}
      }
      if (canvas) {
        try {
          canvas.width = 1;
          canvas.height = 1;
        } catch (_) {}
      }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }
  static async _extractIdentifiersFromTile(tileId) {
    const maxAttempts = 12;
    const intervalMs = 1e3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, intervalMs));
      try {
        const result = await window.MessageBridge?.sendToContentScript(
          "extractTileIdentifiers",
          { tileId },
        );
        if (result?.fileName) {
          return {
            fileName: result.fileName,
            thumbnailUrl: result.thumbnailUrl,
            videoUrl: result.video_url || result.videoUrl || null,
          };
        }
        if (result?.thumbnailUrl && attempt >= 4) {
          return { fileName: null, thumbnailUrl: result.thumbnailUrl };
        }
      } catch (e) {
        console.warn(
          `[ImmediateUploader] extractTileIdentifiers attempt ${attempt} failed:`,
          e.message,
        );
      }
    }
    console.warn(
      `[ImmediateUploader] extractTileIdentifiers exhausted for ${tileId}, continuing with null identifiers`,
    );
    return null;
  }
  static async _saveLightweightPending(
    key,
    file,
    thumbnail,
    options,
    meta = {},
  ) {
    console.log(
      `[ImmediateUploader] Saving lightweight pending: ${key}`,
      meta.reason ? `(reason: ${meta.reason})` : "",
    );
    try {
      await window.PendingUploadStore?.saveLightweight(key, {
        thumbnail,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        name: options.name,
        albumId: options.albumId,
      });
      if (window.PendingUploadStore) {
        try {
          await window.PendingUploadStore.cacheUploaded(key, file);
        } catch (cacheErr) {
          console.warn(
            "[ImmediateUploader] saveLightweightPending cacheUploaded failed:",
            cacheErr?.message,
          );
        }
      }
      this._fileRefs.set(key, new WeakRef(file));
      window.eventBus?.emit("upload:pending", {
        key,
        fileName: file.name,
        reason: meta.reason || null,
      });
      return {
        success: true,
        key,
        pending: true,
        file_name: null,
        thumbnail_url: null,
      };
    } catch (err) {
      console.error(
        `[ImmediateUploader] Save pending failed: ${key}`,
        err.message,
      );
      return { success: false, key, error: err.message };
    }
  }
  static async uploadPending(key) {
    const ref = this._fileRefs.get(key);
    let file = ref?.deref?.();
    let thumbnail = null;
    let pendingData = null;
    if (!file && window.pendingUploadFiles?.has(key)) {
      const cached = window.pendingUploadFiles.get(key);
      file = cached?.file;
      thumbnail = cached?.thumbnail;
      console.log(
        `[ImmediateUploader] Found file in pendingUploadFiles: ${key}`,
      );
    }
    if (!file) {
      console.log(
        `[ImmediateUploader] File GC'd, removing stale pending: ${key}`,
      );
      await window.PendingUploadStore?.removeLightweight(key).catch(() => {});
      this._fileRefs.delete(key);
      return {
        success: false,
        key,
        needReselect: true,
        error: "File no longer available",
      };
    }
    if (!thumbnail) {
      pendingData = await window.PendingUploadStore?.getLightweight(key);
      thumbnail = pendingData?.thumbnail;
    }
    const result = await this._uploadImmediate(key, file, thumbnail, {
      name: pendingData?.name || window.GenTab?.refImageNames?.[key],
      albumId: pendingData?.albumId,
    });
    if (result.success && !result.pending) {
      await window.PendingUploadStore?.removeLightweight(key);
      window.pendingUploadFiles?.delete(key);
      if (window.GenTab?.refImageNames?.[key]) {
        const oldName = window.GenTab.refImageNames[key];
        window.GenTab.refImageNames[result.tile_id] = oldName;
        delete window.GenTab.refImageNames[key];
        console.log(
          `[ImmediateUploader] Transferred name "${oldName}" to ${result.tile_id?.substring(0, 20)}...`,
        );
      }
    }
    return result;
  }
  static async uploadAllPending() {
    const pendingKeys =
      (await window.PendingUploadStore?.getAllLightweightKeys()) || [];
    if (pendingKeys.length === 0) {
      return { uploaded: 0, failed: 0, needReselect: [] };
    }
    const flowState = await this._ensureFlowTabReady();
    const flowReady =
      flowState?.ready === true ||
      (flowState?.ready == null && flowState?.isOpen === true);
    if (!flowReady) {
      console.log(
        "[ImmediateUploader] Flow tab not open, skipping batch upload",
      );
      return { uploaded: 0, failed: 0, needReselect: [] };
    }
    let uploaded = 0;
    let failed = 0;
    const needReselect = [];
    try {
      for (const key of pendingKeys) {
        const result = await this.uploadPending(key);
        if (result.success && !result.pending) {
          uploaded++;
        } else if (result.needReselect) {
          needReselect.push(key);
        } else {
          failed++;
        }
      }
    } finally {
      this._activationState = null;
      this._pendingCount = 0;
    }
    console.log(
      `[ImmediateUploader] Batch upload: ${uploaded} success, ${failed} failed, ${needReselect.length} need re-select`,
    );
    return { uploaded, failed, needReselect };
  }
  static getResult(key) {
    return this._results.get(key) || null;
  }
  static isFileAvailable(key) {
    const ref = this._fileRefs.get(key);
    return ref?.deref?.() !== void 0;
  }
  static cancel(key) {
    if (!key) return;
    if (this._uploading.has(key)) {
      this._cancelled.add(key);
      this._uploadControlsByKey.get(key)?.cancel?.();
      console.log(`[ImmediateUploader] Cancelled in-flight upload: ${key}`);
    }
    this._activeUploads.delete(key);
    this._fileRefs.delete(key);
    this._results.delete(key);
    window.pendingUploadFiles?.delete(key);
    window.PendingUploadStore?.removeLightweight(key).catch(() => {});
    window.eventBus?.emit("upload:cancelled", { key });
  }
  static cancelAll(keys) {
    for (const key of keys) {
      this.cancel(key);
    }
  }
  static isUploading(key) {
    return this._uploading.has(key);
  }
  static isActivelyUploading(key) {
    return this._activeUploads.has(key);
  }
  static hasAnyUploading() {
    return this._uploading.size > 0;
  }
  static cleanup(maxAgeMs = 2 * 60 * 60 * 1e3) {
    for (const [key, ref] of this._fileRefs) {
      if (!ref.deref()) {
        this._fileRefs.delete(key);
      }
    }
  }
}
__publicField(ImmediateUploader, "_uploading", new Map());
__publicField(ImmediateUploader, "_activeUploads", new Set());
__publicField(ImmediateUploader, "_uploadControlsByKey", new Map());
__publicField(ImmediateUploader, "_results", new Map());
__publicField(ImmediateUploader, "_fileRefs", new Map());
__publicField(ImmediateUploader, "_cancelled", new Set());
__publicField(ImmediateUploader, "_queue", Promise.resolve());
__publicField(ImmediateUploader, "_pendingCount", 0);
__publicField(ImmediateUploader, "_activationState", null);
__publicField(ImmediateUploader, "_lastSwHealthCheckAt", 0);
window.ImmediateUploader = ImmediateUploader;
