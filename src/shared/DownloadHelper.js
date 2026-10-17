function _toAscii(str) {
  if (!str) return str;
  return str
    .replace(/[đĐ]/g, (c) => (c === "\u0111" ? "d" : "D"))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
class DownloadHelper {
  static async convertImageDataUrlToJpeg(dataUrl) {
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
      throw new Error("IMAGE_BYTES_UNAVAILABLE");
    }
    const source = await fetch(dataUrl);
    if (!source.ok) throw new Error(`IMAGE_FETCH_${source.status}`);
    const image = await createImageBitmap(await source.blob());
    try {
      if (!image.width || !image.height)
        throw new Error("IMAGE_DIMENSIONS_INVALID");
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("JPEG_CANVAS_UNAVAILABLE");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      return await new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) =>
            blob ? resolve(blob) : reject(new Error("JPEG_ENCODE_FAILED")),
          "image/jpeg",
          0.92,
        );
      });
    } finally {
      image.close?.();
    }
  }
  static async downloadImageAsJpeg({
    dataUrl,
    filename,
    waitForComplete = false,
  }) {
    const jpeg = await this.convertImageDataUrlToJpeg(dataUrl);
    const blobUrl = URL.createObjectURL(jpeg);
    try {
      const response = await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage(
            {
              action: "chromeDownload",
              url: blobUrl,
              filename,
              waitForComplete,
            },
            (value) => {
              resolve(
                chrome.runtime.lastError
                  ? { success: false, error: chrome.runtime.lastError.message }
                  : value,
              );
            },
          );
        } catch (error) {
          resolve({
            success: false,
            error: error?.message || "DOWNLOAD_DISPATCH_FAILED",
          });
        }
      });
      return response?.success
        ? { success: true }
        : { success: false, error: response?.error || "DOWNLOAD_FAILED" };
    } finally {
      setTimeout(
        () => URL.revokeObjectURL(blobUrl),
        waitForComplete ? 5e3 : 3e4,
      );
    }
  }
  static normalizeDownloadRootFolder(value) {
    const raw = String(value || "").trim();
    const segments = raw.split(/[\/\\]/).filter(Boolean);
    if (
      !raw ||
      /^[\/\\]|^[a-z]:/i.test(raw) ||
      segments.some((segment) => [".", ".."].includes(segment.trim()))
    ) {
      console.warn(
        "[DownloadHelper] Invalid root download folder; using configured default",
      );
      return "tobyflow_output";
    }
    return segments
      .map((segment) =>
        segment.trim().replace(/[\u0000-\u001f\u007f:*?"<>|]/g, "_"),
      )
      .join("/");
  }
  static normalizeDownloadSubfolder(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^[\/\\]|^[a-z]:/i.test(raw)) {
      console.warn(
        "[DownloadHelper] Invalid download subfolder; saving in root folder",
      );
      return "";
    }
    const segments = raw.split(/[\/\\]/).filter(Boolean);
    if (segments.some((segment) => [".", ".."].includes(segment.trim()))) {
      console.warn(
        "[DownloadHelper] Invalid download subfolder; saving in root folder",
      );
      return "";
    }
    return segments
      .map((segment) =>
        _toAscii(segment)
          .substring(0, 30)
          .replace(/[^a-zA-Z0-9_-]/g, "_"),
      )
      .join("/");
  }
  static async downloadFlowGalleryMedia({
    tile,
    index,
    promptText,
    taskName,
    ratio,
    resolution,
    watermarkMode,
    generationMode,
    plannedFilename,
    abortFn,
    signal,
  }) {
    if (abortFn?.()) throw new Error("DOWNLOAD_STOPPED");
    const methods = window.WorkflowExecutor?.prototype;
    if (!methods?._downloadNodeResult)
      throw new Error("FLOW_DOWNLOAD_ROUTER_UNAVAILABLE");
    const context =
      await window.MessageBridge?.sendToContentScript?.("getProjectContext");
    const projectId =
      tile.projectId || tile.project_id || context?.projectId || null;
    if (
      projectId &&
      String(projectId).toLowerCase() !==
        String(context?.projectId || "").toLowerCase()
    ) {
      throw new Error("PROJECT_MISMATCH");
    }
    const isVideo = tile.type === "video";
    const mediaType = isVideo ? "video" : "image";
    if (!plannedFilename) {
      const settings2 = await this.getSettings();
      plannedFilename = this.buildFilename({
        template: settings2.template,
        project: settings2.project,
        folder: settings2.folder,
        prompt: promptText,
        index,
        taskName,
        ext: isVideo ? "mp4" : "png",
      });
    }
    const fileName =
      tile.fileName ||
      tile.persistentMediaId ||
      tile.persistent_media_id ||
      null;
    const media = {
      media_uuid: tile.mediaUuid || tile.media_uuid || null,
      persistent_media_id:
        tile.persistentMediaId || tile.persistent_media_id || fileName,
      project_id: projectId,
    };
    const resolutionConfig =
      window.ProviderConfigManager?.getApiConfigValueSync?.(
        "flow",
        "download_resolutions",
      );
    const list = resolutionConfig?.[mediaType];
    const selected = Array.isArray(list)
      ? list.find((entry) => entry.value === resolution)
      : null;
    const route =
      window.ProviderConfigManager?.getDownloadResolutionRouteSync?.(
        "flow",
        mediaType,
        resolution,
      ) ||
      (selected?.route === "native" || selected?.route === "upscale"
        ? selected.route
        : null);
    const wantsUpscale = route ? route === "upscale" : null;
    let providerData = null;
    const settings = window.storageSettings?.getSettings?.() || {};
    const apiConfigured = [true, "true", 1].includes(settings.apiModeEnabled);
    const apiEnabled = apiConfigured && generationMode !== "web";
    if (apiEnabled) {
      providerData = tile.providerData || null;
      if (
        !providerData ||
        (providerData.provider === "flow" && wantsUpscale === false)
      ) {
        const catalog = await window.MessageBridge?.lookupFlowMediaCatalog?.(
          [media.media_uuid, tile.id, fileName].filter(Boolean),
        ).catch(() => null);
        if (
          catalog?.projectId &&
          String(catalog.projectId).toLowerCase() !==
            String(projectId || "").toLowerCase()
        ) {
          throw new Error("PROJECT_MISMATCH");
        }
        const entry = [media.media_uuid, tile.id, fileName]
          .map((key) => catalog?.known?.[key])
          .find((value) => value?.type === mediaType);
        const uuid = (value) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            String(value || ""),
          );
        const mediaId = [
          providerData?.media_uuid,
          media.media_uuid,
          entry?.media_uuid,
          tile.id,
          fileName,
        ].find(uuid);
        let health = null;
        try {
          health = await window.FlowApiSessionCoordinator?.check?.({
            surface: "gen",
            mediaType,
            projectId,
            passive: true,
          });
        } catch (_) {}
        if (
          mediaId &&
          projectId &&
          health?.ready === true &&
          ["v1", "v2"].includes(health.driver)
        ) {
          let config = null;
          if (health.driver === "v2") {
            try {
              config =
                await window.ProviderConfigManager?.fetchFlowApiV2Configs?.();
            } catch (_) {}
          }
          const fingerprint =
            config && window.FlowApiV2CheckpointStore?.fingerprint?.(config);
          if (health.driver === "v1" || (config && fingerprint))
            providerData = {
              provider: "flow",
              api_driver: health.driver,
              media_uuid: mediaId,
              project_id: projectId,
              media_type: mediaType,
              ...(health.driver === "v2"
                ? {
                    uuidLookup: true,
                    protocol_revision: Number(
                      config.protocol?.schema_version || 0,
                    ),
                    protocol_fingerprint: fingerprint,
                  }
                : { identity_kind: "flow-api-uuid" }),
            };
        }
      }
    }
    if (wantsUpscale === null) providerData = null;
    if (providerData)
      providerData = { ...providerData, download_for_workflow: false };
    console.info(
      "[FlowDownloadRoute]",
      JSON.stringify({
        source: taskName ? "task" : "gallery",
        apiEnabled,
        generationMode: generationMode || null,
        mediaType,
        resolution,
        driver: providerData?.api_driver || "web",
        uuidLookup: providerData?.uuidLookup === true,
        savedDriver: tile.providerData?.api_driver || null,
      }),
    );
    const router = {
      get shouldStop() {
        return abortFn?.() === true;
      },
      currentWorkflow: { project_id: projectId },
      _isContentScriptContext: () => false,
      _resolveDownloadWebIdentity: methods._resolveDownloadWebIdentity,
      _downloadProviderTileDirect: methods._downloadProviderTileDirect,
      async _downloadSingleTile(
        fileId,
        prompt,
        imageResolution,
        webFileName,
        flowFileId,
        folderName,
        videoResolution,
        webWatermarkMode,
        filename,
      ) {
        await window.DownloadHelper._activateFlowTabForDomDownload();
        if (abortFn?.()) throw new Error("DOWNLOAD_STOPPED");
        const requestId = `manual_dl_${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
        const onAbort = () =>
          window.MessageBridge?.sendToContentScript?.(
            "cancelTileMediaDownload",
            { requestId },
          ).catch(() => {});
        signal?.addEventListener("abort", onAbort, { once: true });
        try {
          const response = await window.MessageBridge.downloadTileMedia(
            fileId,
            prompt,
            folderName,
            webFileName || null,
            imageResolution,
            flowFileId || null,
            null,
            videoResolution || null,
            webWatermarkMode || null,
            filename,
            requestId,
          );
          if (abortFn?.()) throw new Error("DOWNLOAD_STOPPED");
          return response === true || response?.success === true;
        } finally {
          signal?.removeEventListener("abort", onAbort);
        }
      },
    };
    return methods._downloadNodeResult.call(router, {
      fileId: tile.id,
      fileName,
      providerData,
      savedProviderData: tile.providerData,
      media,
      workflow: router.currentWorkflow,
      isVideo,
      wantsUpscale,
      promptText,
      index,
      subfolder: taskName,
      ratio,
      resolution,
      watermarkMode,
      plannedFilename,
      generationMode,
      forWorkflow: false,
    });
  }
  static async cleanMediaBlob(
    blob,
    mediaType = "image",
    { force = false } = {},
  ) {
    const kind = mediaType === "video" ? "video" : "image";
    if (!blob)
      return { blob, cleaned: false, original: true, reason: "EMPTY_BLOB" };
    if (!force && window.WatermarkClient?.enabled?.(kind) !== true) {
      return { blob, cleaned: false, original: true, reason: "DISABLED" };
    }
    try {
      if (kind === "video") {
        const cfg = await chrome.runtime.sendMessage({
          action: "getWatermarkConfig",
          mediaType: "video",
        });
        if (!cfg?.success || !self.VideoWmClient) {
          return {
            blob,
            cleaned: false,
            reason: cfg?.error || "VIDEO_WM_UNAVAILABLE",
          };
        }
        const result = await self.VideoWmClient.process(blob, cfg.cfg, {});
        if (!result?.applied || !result.blob) {
          const reason = result?.reason || "VIDEO_WM_NOT_APPLIED";
          return {
            blob,
            cleaned: false,
            original: true,
            reason,
            noWatermark:
              window.WatermarkClient?.isNoWatermarkReason?.(reason) === true,
          };
        }
        return { blob: result.blob, cleaned: true, original: false };
      }
      if (!window.WatermarkClient)
        return { blob, cleaned: false, reason: "IMAGE_WM_UNAVAILABLE" };
      if (typeof window.WatermarkClient.cleanBlobResult === "function") {
        return window.WatermarkClient.cleanBlobResult(blob, "image", {
          ignoreUserSetting: force,
        });
      }
      const cleanedBlob = await window.WatermarkClient.cleanBlob(
        blob,
        "image",
        { ignoreUserSetting: force },
      );
      return {
        blob: cleanedBlob || blob,
        cleaned: cleanedBlob !== blob,
        original: cleanedBlob === blob,
        reason: cleanedBlob === blob ? "not_applied" : null,
      };
    } catch (error) {
      return {
        blob,
        cleaned: false,
        original: true,
        reason: error?.message || "WM_CLEAN_FAILED",
      };
    }
  }
  static async downloadExternalMedia({
    url,
    base64,
    mime,
    filename,
    mediaType = "image",
    waitForComplete = false,
  } = {}) {
    const kind = mediaType === "video" ? "video" : "image";
    const clean = window.WatermarkClient?.enabled?.(kind) === true;
    let raw = base64 ? String(base64).replace(/^data:[^,]+,/, "") : null;
    let resolvedMime = mime || (kind === "video" ? "video/mp4" : "image/png");
    if (!raw && url) {
      const response = await fetch(url, { cache: "no-store" }).catch(() =>
        fetch(url, { credentials: "include", cache: "no-store" }),
      );
      if (!response?.ok)
        return {
          success: false,
          error: `MEDIA_FETCH_${response?.status || 0}`,
        };
      const blob = await response.blob();
      resolvedMime = blob.type || resolvedMime;
      raw = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(new Error("MEDIA_READ_FAILED"));
        reader.readAsDataURL(blob);
      });
    }
    if (!raw) return { success: false, error: "MEDIA_BYTES_MISSING" };
    if (clean && kind === "video") {
      try {
        const cfg = await chrome.runtime.sendMessage({
          action: "getWatermarkConfig",
          mediaType: "video",
        });
        if (!cfg?.success || !self.VideoWmClient)
          throw new Error(cfg?.error || "VIDEO_WM_UNAVAILABLE");
        const source = await (
          await fetch(`data:${resolvedMime};base64,${raw}`)
        ).blob();
        const result = await self.VideoWmClient.process(source, cfg.cfg, {});
        if (!result?.applied || !result.blob) {
          const reason = result?.reason || "VIDEO_WM_NOT_APPLIED";
          if (window.WatermarkClient?.isNoWatermarkReason?.(reason)) {
            console.info(
              "[DownloadHelper] video has no detected watermark; preserving original:",
              reason,
            );
          } else {
            throw new Error(reason);
          }
        } else {
          resolvedMime = result.blob.type || "video/mp4";
          raw = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(",")[1]);
            reader.onerror = () => reject(new Error("CLEAN_VIDEO_READ_FAILED"));
            reader.readAsDataURL(result.blob);
          });
        }
      } catch (error) {
        console.warn(
          "[DownloadHelper] video watermark cleanup failed; preserving original:",
          error?.message || error,
        );
      }
    } else if (clean && kind === "image" && window.WatermarkClient) {
      try {
        const result = await window.WatermarkClient.cleanBase64(
          raw,
          resolvedMime,
          "image",
        );
        if (result?.cleaned && result.base64) raw = result.base64;
        else if (result?.noWatermark) {
          console.info(
            "[DownloadHelper] image has no detected watermark; preserving original:",
            result.reason,
          );
        }
      } catch (error) {
        console.warn(
          "[DownloadHelper] image watermark cleanup failed; preserving original:",
          error?.message || error,
        );
      }
    }
    return chrome.runtime.sendMessage({
      action: "removeWatermarkAndDownload",
      base64: raw,
      mime: resolvedMime,
      filename,
      mediaType: kind,
      alreadyClean: true,
      waitForComplete,
      waitTimeoutMs: kind === "video" ? 6e5 : 12e4,
    });
  }
  static async downloadPersistedFlowWebMedia({
    url,
    filename,
    mediaType = "image",
    watermarkMode = "inherit",
  } = {}) {
    const kind = mediaType === "video" ? "video" : "image";
    let parsed;
    try {
      parsed = new URL(String(url || ""));
    } catch (_) {
      return { success: false, error: "FLOW_WEB_MEDIA_URL_INVALID" };
    }
    const isFlowContent =
      parsed.hostname === "flow-content.google" &&
      new RegExp(`^/${kind}/[0-9a-f-]{36}(?:/|$)`, "i").test(parsed.pathname);
    if (parsed.protocol !== "https:" || !isFlowContent) {
      return { success: false, error: "FLOW_WEB_MEDIA_URL_REJECTED" };
    }
    if (!filename)
      return { success: false, error: "FLOW_WEB_DOWNLOAD_FILENAME_MISSING" };
    const mode =
      watermarkMode === "clean" || watermarkMode === "original"
        ? watermarkMode
        : "inherit";
    const clean =
      mode === "clean" ||
      (mode === "inherit" && window.WatermarkClient?.enabled?.(kind) === true);
    if (clean) {
      try {
        const response = await fetch(parsed.href, { cache: "no-store" });
        if (!response.ok) throw new Error(`MEDIA_FETCH_${response.status}`);
        const contentType = String(
          response.headers.get("content-type") || "",
        ).toLowerCase();
        if (!contentType.startsWith(`${kind}/`))
          throw new Error(
            `INVALID_MEDIA_CONTENT_TYPE:${contentType || "missing"}`,
          );
        const cleaned = await this.cleanMediaBlob(await response.blob(), kind, {
          force: mode === "clean",
        });
        const noWatermark =
          cleaned?.noWatermark === true ||
          window.WatermarkClient?.isNoWatermarkReason?.(cleaned?.reason) ===
            true;
        if (mode === "clean" && !cleaned?.cleaned && !noWatermark) {
          return {
            success: false,
            error: cleaned?.reason || "FLOW_WEB_CLEAN_FAILED",
          };
        }
        if (cleaned?.blob) {
          const raw = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(",")[1]);
            reader.onerror = () =>
              reject(new Error("FLOW_WEB_MEDIA_READ_FAILED"));
            reader.readAsDataURL(cleaned.blob);
          });
          return chrome.runtime.sendMessage({
            action: "removeWatermarkAndDownload",
            base64: raw,
            mime:
              cleaned.blob.type ||
              (kind === "video" ? "video/mp4" : "image/png"),
            filename,
            mediaType: kind,
            alreadyClean: true,
            waitForComplete: true,
            waitTimeoutMs: kind === "video" ? 6e5 : 12e4,
          });
        }
      } catch (error) {
        if (mode === "clean")
          return {
            success: false,
            error: error?.message || "FLOW_WEB_CLEAN_FAILED",
          };
        console.warn(
          "[DownloadHelper] Flow Web persisted cleanup unavailable; preserving original:",
          error?.message || error,
        );
      }
    }
    return chrome.runtime.sendMessage({
      action: "chromeDownload",
      url: parsed.href,
      filename,
      waitForComplete: true,
      waitTimeoutMs: kind === "video" ? 6e5 : 12e4,
    });
  }
  static async _activateFlowTabForDomDownload() {
    try {
      await new Promise((resolve) =>
        chrome.runtime.sendMessage(
          { action: "activateFlowTabForExecution" },
          () => {
            void chrome.runtime.lastError;
            resolve();
          },
        ),
      );
    } catch (_) {}
  }
  static toAscii(str) {
    return _toAscii(str);
  }
  static buildFilename({
    template,
    project,
    prompt,
    index,
    taskName,
    folder,
    ext,
    timestamp,
  }) {
    const now = timestamp === void 0 ? new Date() : new Date(timestamp);
    const date = now.toISOString().slice(0, 10);
    const time = now.toTimeString().slice(0, 8).replace(/:/g, "-");
    const safeProject = _toAscii(project || "")
      .substring(0, 30)
      .replace(/[^a-zA-Z0-9_-]/g, "_");
    const safePrompt = _toAscii(prompt || "flow")
      .substring(0, 40)
      .replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeIndex = index ? String(index).padStart(3, "0") : "";
    let filename = (template || "[Date]_[Prompt]")
      .replace(/\[Date\]/gi, date)
      .replace(/\[Time\]/gi, time)
      .replace(/\[Project\]/gi, safeProject)
      .replace(/\[Prompt\]/gi, safePrompt)
      .replace(/\[Index\]/gi, safeIndex);
    filename = filename.replace(/_+/g, "_").replace(/^_|_$/g, "");
    if (!filename) filename = "flow_" + Date.now();
    const baseFolder = this.normalizeDownloadRootFolder(folder);
    const extension = ext || "png";
    if (taskName) {
      const safeTaskName = this.normalizeDownloadSubfolder(taskName);
      if (!safeTaskName) return `${baseFolder}/${filename}.${extension}`;
      if (safeTaskName.toLowerCase() === baseFolder.toLowerCase()) {
        console.warn(
          "[DownloadHelper] taskName tr\xF9ng baseFolder, skip duplicate layer:",
          baseFolder,
        );
        return `${baseFolder}/${filename}.${extension}`;
      }
      return `${baseFolder}/${safeTaskName}/${filename}.${extension}`;
    }
    return `${baseFolder}/${filename}.${extension}`;
  }
  static async getSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["af_settings"], (res) => {
        const s = res.af_settings || {};
        resolve({
          folder: this.normalizeDownloadRootFolder(s.downloadFolder),
          template: s.fileNameTemplate || "[Date]_[Project]_[Prompt]_[Index]",
          project: s.fileNameProject || "",
          resolution: s.downloadResolution || "1k",
          videoResolution: s.videoDownloadResolution || "720p",
          legacyFormat: s.fileNameFormat || null,
        });
      });
    });
  }
  static async downloadFlowApiResult(options = {}) {
    let transientVideoUrl = null;
    let transientHandoffPending = false;
    try {
      const providerData = options.providerData || null;
      if (providerData?.provider !== "flow")
        return { ok: false, fallback: true, error: "NOT_FLOW_API_MEDIA" };
      const isVideo =
        options.mediaType === "video" || providerData.media_type === "video";
      const resolution = String(
        options.resolution || (isVideo ? "720p" : "1k"),
      ).toLowerCase();
      const route =
        window.ProviderConfigManager?.getDownloadResolutionRouteSync?.(
          "flow",
          isVideo ? "video" : "image",
          resolution,
        ) || null;
      if (!route)
        return {
          ok: false,
          fallback: false,
          error: "FLOW_DOWNLOAD_CONFIG_MISSING",
        };
      const wantsUpscale = route === "upscale";
      const mediaId = providerData.media_uuid || options.mediaId || null;
      const projectId = providerData.project_id || options.projectId || null;
      if (!mediaId || !options.filename || (wantsUpscale && !projectId)) {
        return {
          ok: false,
          fallback: true,
          error: "FLOW_API_DOWNLOAD_CONTEXT_MISSING",
        };
      }
      const gate = await window.FlowApiFacade?.checkDownloadReady?.({
        mediaId,
        mediaType: isVideo ? "video" : "image",
        providerData,
        requireUpscale: wantsUpscale,
      });
      if (!gate?.ready)
        return {
          ok: false,
          fallback: true,
          error: gate?.reason || "FLOW_API_UNAVAILABLE",
        };
      let base64 = null;
      let mime = isVideo ? "video/mp4" : "image/png";
      let url = null;
      if (wantsUpscale) {
        const up = isVideo
          ? await window.FlowApiFacade?.upscaleVideo?.({
              mediaId,
              projectId,
              mediaType: "video",
              resolution,
              ratio: options.ratio || providerData.ratio || null,
              providerData,
            })
          : await window.FlowApiFacade?.upscaleImage?.({
              mediaId,
              projectId,
              mediaType: "image",
              resolution,
              providerData,
            });
        if (!up?.ok)
          return {
            ok: false,
            fallback: true,
            error: up?.error || "FLOW_API_UPSCALE_FAILED",
          };
        base64 = up.base64 || null;
        mime = up.mime || mime;
        url = up.videoUrl || null;
        if (up.revoke === true) transientVideoUrl = url;
        if (!base64 && !url)
          return {
            ok: false,
            fallback: true,
            error: "FLOW_API_UPSCALE_MEDIA_MISSING",
          };
      } else {
        url = providerData.url || providerData.durable_url || null;
        const hasProviderUuid =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            String(mediaId),
          );
        if (
          hasProviderUuid ||
          !url ||
          url.includes("media.getMediaUrlRedirect")
        ) {
          const resolved = await window.FlowApiFacade?.resolveDownload?.({
            mediaId,
            mediaType: isVideo ? "video" : "image",
            providerData,
          });
          url = resolved?.url || null;
          base64 = resolved?.base64 || null;
          mime = resolved?.mime || mime;
          console.log("[DownloadHelper] Flow API native locator resolved", {
            mediaType: isVideo ? "video" : "image",
            hasServingUrl: !!url,
            hasBase64: !!base64,
          });
        }
        if (!url && !base64) {
          return {
            ok: false,
            fallback: false,
            error: "FLOW_API_MEDIA_RESOLVE_FAILED",
          };
        }
      }
      const mode =
        options.watermarkMode === "clean" ||
        options.watermarkMode === "original"
          ? options.watermarkMode
          : "inherit";
      let clean = mode === "clean";
      if (mode === "inherit") {
        const kind = isVideo ? "video" : "image";
        clean = window.WatermarkClient?.enabled?.(kind) === true;
      }
      if (base64) {
        const imageExt =
          mime === "image/webp"
            ? "webp"
            : /jpe?g/i.test(mime)
              ? "jpg"
              : mime === "image/png"
                ? "png"
                : null;
        const byteFilename =
          !isVideo && imageExt
            ? options.filename.replace(/\.[^.\/]+$/, `.${imageExt}`)
            : options.filename;
        if (clean && !isVideo && window.WatermarkClient) {
          try {
            const cleaned = await window.WatermarkClient.cleanBase64(
              base64,
              mime,
              "image",
              { ignoreUserSetting: mode === "clean" },
            );
            if (cleaned?.cleaned && cleaned.base64) base64 = cleaned.base64;
          } catch (_) {}
        }
        const downloaded = await chrome.runtime.sendMessage({
          action: "removeWatermarkAndDownload",
          base64,
          mime,
          filename: byteFilename,
          mediaType: isVideo ? "video" : "image",
          alreadyClean: true,
          waitForComplete: true,
          waitTimeoutMs: isVideo ? 6e5 : 12e4,
        });
        return {
          ok: downloaded?.success === true,
          fallback: downloaded?.success !== true,
          error: downloaded?.reason || downloaded?.error,
        };
      }
      if (clean && !isVideo && window.WatermarkClient) {
        try {
          let response;
          try {
            response = await fetch(url, { cache: "no-store" });
          } catch (_) {
            response = await fetch(url, {
              credentials: "include",
              cache: "no-store",
            });
          }
          if (!response.ok) throw new Error(`HTTP_${response.status}`);
          const contentType = String(
            response.headers.get("content-type") || "",
          ).toLowerCase();
          if (!contentType.startsWith("image/"))
            throw new Error(
              `INVALID_MEDIA_CONTENT_TYPE:${contentType || "missing"}`,
            );
          const blob = await response.blob();
          const raw = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(",")[1]);
            reader.onerror = () =>
              reject(new Error("FLOW_API_BYTES_READ_FAILED"));
            reader.readAsDataURL(blob);
          });
          const cleaned = await window.WatermarkClient.cleanBase64(
            raw,
            blob.type || mime,
            "image",
            { ignoreUserSetting: mode === "clean" },
          );
          const bytes =
            cleaned?.cleaned && cleaned.base64 ? cleaned.base64 : raw;
          const downloaded = await chrome.runtime.sendMessage({
            action: "removeWatermarkAndDownload",
            base64: bytes,
            mime: blob.type || mime,
            filename: options.filename,
            mediaType: "image",
            alreadyClean: true,
            waitForComplete: true,
            waitTimeoutMs: 12e4,
          });
          if (downloaded?.success) return { ok: true, fallback: false };
        } catch (_) {}
      }
      transientHandoffPending = !!transientVideoUrl;
      const direct = await chrome.runtime.sendMessage({
        action: "chromeDownload",
        url,
        filename: options.filename,
        waitForComplete: true,
        waitTimeoutMs: isVideo ? 6e5 : 12e4,
      });
      transientHandoffPending = !!transientVideoUrl && direct?.success !== true;
      return {
        ok: direct?.success === true,
        fallback: direct?.success !== true,
        error: direct?.error,
      };
    } finally {
      if (transientVideoUrl) {
        const revoke = () => {
          if (
            window.FlowApiAdapter?.revokeOwnedBlobUrl?.(transientVideoUrl) !==
            true
          )
            URL.revokeObjectURL(transientVideoUrl);
        };
        if (transientHandoffPending) setTimeout(revoke, 6e4);
        else revoke();
      }
    }
  }
  static async downloadPersistedFlowTaskResult(options = {}) {
    const task = options.task || null;
    const tileId = options.tileId || null;
    if (!task || !tileId) return { api: false, ok: false, fallback: true };
    const fileName = task.result_file_names?.[tileId] || null;
    const providerData =
      task.result_provider_urls?.[tileId] ||
      (fileName ? task.result_provider_urls?.[fileName] : null) ||
      null;
    const isVideo =
      options.mediaType === "video" ||
      providerData?.media_type === "video" ||
      task.media_type === "Video" ||
      task.gen_type === "Video";
    const resolution = String(
      options.resolution || (isVideo ? "720p" : "1k"),
    ).toLowerCase();
    const route =
      window.ProviderConfigManager?.getDownloadResolutionRouteSync?.(
        "flow",
        isVideo ? "video" : "image",
        resolution,
      ) || null;
    if (!route)
      return {
        api: true,
        ok: false,
        fallback: false,
        error: "FLOW_DOWNLOAD_CONFIG_MISSING",
      };
    const upscale = route === "upscale";
    const settings = await this.getSettings();
    let filename =
      options.plannedFilename ||
      this.buildFilename({
        template: settings.template,
        project: settings.project,
        prompt: task.prompt || task.task_name || "task",
        index: options.index || 1,
        taskName: task.task_name || null,
        folder: settings.folder,
        ext: isVideo ? "mp4" : "png",
      });
    if (upscale && !options.plannedFilename) {
      const ext = isVideo ? "mp4" : "png";
      filename = filename.replace(
        new RegExp(`\\.${ext}$`, "i"),
        `_${resolution}.${ext}`,
      );
    }
    const saved = task.result_thumbnails?.[tileId];
    const media = saved && typeof saved === "object" ? saved : {};
    const ok = await this.downloadFlowGalleryMedia({
      tile: {
        id: tileId,
        fileName,
        type: isVideo ? "video" : "image",
        mediaUuid: providerData?.media_uuid || media.media_uuid,
        persistentMediaId: media.persistent_media_id || fileName,
        projectId:
          providerData?.project_id || media.project_id || task.project_id,
        providerData: providerData?.provider === "flow" ? providerData : null,
      },
      index: options.index || 1,
      promptText: task.prompt || task.task_name || "task",
      taskName: task.task_name || null,
      ratio: task.ratio || providerData?.ratio || null,
      resolution,
      watermarkMode: options.watermarkMode || "inherit",
      generationMode: task.result_gen_mode || task.gen_mode || null,
      plannedFilename: filename,
    });
    return { api: true, ok: ok === true };
  }
  static _wmField(isVideo) {
    const sysOn =
      window.SystemConfig?.getBool?.("remove_watermark_enabled") === true;
    const kind = isVideo ? "video" : "image";
    const can =
      window.featureGate?.canUse?.(`${kind}_remove_watermark_enabled`) ?? false;
    if (!sysOn || !can) return { html: "", defaultMode: "original" };
    const st = window.storageSettings?.getSettings?.() || {};
    const key = isVideo ? "autoRemoveWatermarkVideo" : "autoRemoveWatermark";
    const v = st[key];
    const defaultMode =
      v === true || v === "1" || v === 1 ? "clean" : "original";
    const t = (k, d) => window.I18n?.t?.(k) || d;
    const note = "";
    const ICO_ORIGINAL =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
    const ICO_CLEAN =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><g fill="currentColor"><path d="M2 14.25c.41 0 .75.34.75.75v2.5c0 2.07 1.68 3.75 3.75 3.75H9c.41 0 .75.34.75.75s-.34.75-.75.75H6.5c-2.89 0-5.25-2.35-5.25-5.25V15c0-.41.34-.75.75-.75m20 1c.41 0 .75.34.75.75v1.5c0 2.9-2.36 5.25-5.25 5.25H16c-.41 0-.75-.34-.75-.75s.34-.75.75-.75h1.5c2.07 0 3.75-1.68 3.75-3.75V16c0-.41.34-.75.75-.75"></path><path fill-rule="evenodd" d="M14 5.75c2.42 0 3.75 1.33 3.75 3.75v1.75H19c.41 0 .75.34.75.75s-.34.75-.75.75h-1.25v1.75c0 2.42-1.33 3.75-3.75 3.75h-4c-2.42 0-3.75-1.33-3.75-3.75v-1.75H5c-.41 0-.75-.34-.75-.75s.34-.75.75-.75h1.25V9.5c0-2.42 1.33-3.75 3.75-3.75zm-6.25 7v1.75c0 1.58.67 2.25 2.25 2.25h4c1.58 0 2.25-.67 2.25-2.25v-1.75zM10 7.25c-1.58 0-2.25.67-2.25 2.25v1.75h8.5V9.5c0-1.58-.67-2.25-2.25-2.25z" clip-rule="evenodd"></path><path d="M9 1.25c.41 0 .75.34.75.75s-.34.75-.75.75H6.5c-2.07 0-3.75 1.68-3.75 3.75V9c0 .41-.34.75-.75.75s-.75-.34-.75-.75V6.5c0-2.9 2.36-5.25 5.25-5.25zm8.5 0c2.89 0 5.25 2.35 5.25 5.25V9c0 .41-.34.75-.75.75s-.75-.34-.75-.75V6.5c0-2.07-1.68-3.75-3.75-3.75H15c-.41 0-.75-.34-.75-.75s.34-.75.75-.75z"></path></g></svg>';
    return {
      defaultMode,
      html: `
          <div class="download-res-field">
            <label>${t("download.wmLabel", "Version")}</label>
            <div class="download-res-options" id="downloadWmOptions">
              <button class="download-res-option download-wm-option ${defaultMode === "original" ? "active" : ""}" data-wm="original">${ICO_ORIGINAL}<span>${t("download.wmOriginal", "Original")}</span></button>
              <button class="download-res-option download-wm-option ${defaultMode === "clean" ? "active" : ""}" data-wm="clean">${ICO_CLEAN}<span>${t("download.wmClean", "Watermark removed")}</span></button>
            </div>
            ${note}
          </div>`,
    };
  }
  static async createFilenamePlan({
    tileIds,
    promptText,
    taskName,
    mediaType,
  }) {
    const settings = await this.getSettings();
    const timestamp = Date.now();
    return Object.fromEntries(
      tileIds.map((id, index) => [
        id,
        this.buildFilename({
          ...settings,
          prompt: promptText,
          taskName,
          index: index + 1,
          ext: mediaType === "video" ? "mp4" : "png",
          timestamp,
        }),
      ]),
    );
  }
  static async showModal(options = {}) {
    const {
      tileId,
      fileName,
      flowFileId,
      promptText,
      taskName,
      index,
      onDownload,
      mediaType,
      apiDownload,
      apiOnly,
      fallbackDownload,
      nativeOnly,
    } = options;
    const isVideo = mediaType === "video";
    let resolutionOptions =
      window.ProviderConfigManager?.getDownloadResolutionsSync?.(
        "flow",
        isVideo ? "video" : "image",
      ) || [];
    if (nativeOnly === true && resolutionOptions.length > 1)
      resolutionOptions = resolutionOptions.slice(0, 1);
    if (!tileId && !flowFileId) {
      console.warn(
        "[DownloadHelper] showModal: no tileId or flowFileId provided",
      );
      return;
    }
    if (!resolutionOptions.length) {
      console.warn(
        "[DownloadHelper] showModal blocked: Flow download resolution config missing",
      );
      window.showNotification?.(
        window.I18n?.t("errors.configRequired") ||
          "Download configuration is unavailable. Please retry after reconnecting.",
        "error",
        4e3,
      );
      return;
    }
    let defaultRes = resolutionOptions[0].value;
    try {
      const settings = await this.getSettings();
      const saved = isVideo ? settings.videoResolution : settings.resolution;
      if (resolutionOptions.some((option) => option.value === saved))
        defaultRes = saved;
    } catch (e) {
      console.warn("[DownloadHelper] Failed to load settings:", e.message);
    }
    const existing = document.getElementById("downloadResModal");
    if (existing) {
      existing._cancelDownload?.();
      existing.remove();
    }
    const overlay = document.createElement("div");
    overlay.id = "downloadResModal";
    overlay.className = "download-res-overlay";
    const _wmF = this._wmField(isVideo);
    let selectedWm = _wmF.defaultMode;
    overlay.innerHTML = `
      <div class="download-res-modal">
        <div class="download-res-header">
          <span>${window.I18n?.t("common.download") || "Download"}</span>
          <button class="download-res-close" id="downloadResClose" title="${window.I18n?.t("common.close") || "Close"}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div class="download-res-body">
          <div class="download-res-field">
            <label>${window.I18n?.t("download.resolution") || "Resolution"}</label>
            <div class="download-res-options">
              ${(() => {
                return resolutionOptions
                  .map(
                    (r) =>
                      `<button class="download-res-option ${defaultRes === r.value ? "active" : ""}" data-res="${r.value}">${r.label}</button>`,
                  )
                  .join("");
              })()}
            </div>
          </div>
          ${_wmF.html}
          <div class="download-res-info" id="downloadResInfo"></div>
        </div>
        <div class="download-res-footer">
          <button class="download-res-btn download-res-cancel" id="downloadResCancel" type="button" hidden>${window.I18n?.t("common.cancel") || "Cancel"}</button>
          <button class="download-res-btn" id="downloadResSubmit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            ${window.I18n?.t("common.download") || "Download"}
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    let selectedRes = defaultRes;
    overlay
      .querySelectorAll(".download-res-option:not(.download-wm-option)")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          overlay
            .querySelectorAll(".download-res-option:not(.download-wm-option)")
            .forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          selectedRes = btn.dataset.res;
        });
      });
    let activeAbort = null;
    const close = () => {
      activeAbort?.();
      overlay.remove();
    };
    overlay._cancelDownload = close;
    overlay.querySelector("#downloadResClose").addEventListener("click", close);
    overlay
      .querySelector("#downloadResCancel")
      .addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    const _DEF = resolutionOptions[0].value;
    const _syncResLock = () => {
      const _resField = overlay.querySelector(".download-res-field");
      if (_resField) _resField.style.display = "";
      overlay
        .querySelectorAll(".download-res-option:not(.download-wm-option)")
        .forEach((rb) => {
          rb.disabled = false;
          rb.style.opacity = "";
          rb.style.cursor = "";
          rb.title = "";
        });
    };
    overlay.querySelectorAll(".download-wm-option").forEach((b) => {
      b.addEventListener("click", () => {
        overlay
          .querySelectorAll(".download-wm-option")
          .forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        selectedWm = b.dataset.wm === "clean" ? "clean" : "original";
        _syncResLock();
      });
    });
    if (_wmF.html) _syncResLock();
    overlay
      .querySelector("#downloadResSubmit")
      .addEventListener("click", async () => {
        if (activeAbort) return;
        const controller = new AbortController();
        const requestId = `manual_dl_${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
        activeAbort = () => {
          if (controller.signal.aborted) return;
          controller.abort();
          this._sendToContentScript({
            action: "cancelTileMediaDownload",
            requestId,
          }).catch(() => {});
        };
        const aborted = () => controller.signal.aborted;
        const cancellable = (promise) =>
          Promise.race([
            promise,
            new Promise((_, reject) => {
              if (aborted()) reject(new Error("DOWNLOAD_STOPPED"));
              else
                controller.signal.addEventListener(
                  "abort",
                  () => reject(new Error("DOWNLOAD_STOPPED")),
                  { once: true },
                );
            }),
          ]);
        const submitBtn = overlay.querySelector("#downloadResSubmit");
        const cancelBtn = overlay.querySelector("#downloadResCancel");
        const infoEl = overlay.querySelector("#downloadResInfo");
        cancelBtn.hidden = false;
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>
        ${window.I18n?.t("download.downloading") || "Downloading..."}
      `;
        infoEl.textContent = "";
        const _btnLabel = (txt) => {
          submitBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>
        ${txt}
      `;
        };
        const _pt = (k, d) => window.I18n?.t?.(k) || d;
        const _saving = () => _pt("download.phaseSaving", "Saving file\u2026");
        const _phaseText = {
          downloading: () =>
            _pt(
              "download.phaseFetching",
              "Fetching image from Google Flow\u2026",
            ),
          cleaning: () =>
            _pt("download.phaseCleaning", "Removing watermark\u2026"),
          done: _saving,
          no_watermark: _saving,
          original: _saving,
        };
        const _onPhase = (msg) => {
          if (msg?.action !== "wm:downloadPhase") return;
          const f = _phaseText[msg.phase];
          if (f) _btnLabel(f());
        };
        try {
          chrome.runtime.onMessage.addListener(_onPhase);
        } catch (_) {}
        const _offPhase = () => {
          try {
            chrome.runtime.onMessage.removeListener(_onPhase);
          } catch (_) {}
        };
        try {
          window.UsageSync?.trackEvent("download", {
            resolution: selectedRes,
            module: taskName || "gen",
          });
          if (typeof apiDownload === "function") {
            const apiOk = await cancellable(
              apiDownload({
                tileId,
                fileName,
                resolution: selectedRes,
                plannedFilename: options.plannedFilename || null,
                watermarkMode: _wmF.html ? selectedWm : "inherit",
                abortFn: aborted,
                signal: controller.signal,
              }),
            );
            if (aborted()) throw new Error("DOWNLOAD_STOPPED");
            if (apiOk === true) {
              infoEl.textContent =
                window.I18n?.t("download.success") ||
                "Downloaded successfully!";
              infoEl.className = "download-res-info download-res-info--success";
              if (typeof onDownload === "function")
                onDownload({
                  tileId,
                  resolution: selectedRes,
                  fileName,
                  flowFileId,
                });
              setTimeout(close, 800);
              return;
            }
            throw new Error("FLOW_API_DOWNLOAD_FAILED");
          }
          const _apiModeNow =
            window.SystemConfig?.getBool?.("api_mode_enabled") === true;
          if (
            typeof apiDownload !== "function" &&
            _apiModeNow &&
            selectedWm === "clean" &&
            selectedRes !== _DEF &&
            !isVideo &&
            window.FlowApiFacade?.upscaleImage &&
            tileId &&
            options.providerData?.provider === "flow"
          ) {
            try {
              const up = await window.FlowApiFacade.upscaleImage({
                mediaId: tileId,
                resolution: selectedRes,
                abortFn: aborted,
                projectId: options.projectId || null,
                mediaType: "image",
                providerData: options.providerData,
              });
              if (aborted()) throw new Error("DOWNLOAD_STOPPED");
              if (up?.ok && up.base64) {
                let b64 = up.base64;
                if (window.WatermarkClient) {
                  const cl = await window.WatermarkClient.cleanBase64(
                    b64,
                    up.mime || "image/png",
                    "image",
                    { ignoreUserSetting: true },
                  );
                  if (cl.cleaned) b64 = cl.base64;
                }
                if (aborted()) throw new Error("DOWNLOAD_STOPPED");
                await cancellable(
                  this._sendToContentScript({
                    action: "removeWatermarkAndDownload",
                    base64: b64,
                    mime: up.mime || "image/png",
                    filename: `${(fileName || promptText || "flow").replace(/\.[^.]+$/, "")}_${selectedRes}.${up.mime === "image/webp" ? "webp" : up.mime === "image/jpeg" ? "jpg" : "png"}`,
                    mediaType: "image",
                    alreadyClean: true,
                  }),
                );
                if (aborted()) throw new Error("DOWNLOAD_STOPPED");
                overlay.remove();
                return;
              }
              console.warn(
                "[DownloadHelper] upscale kh\xF4ng tr\u1EA3 base64 \u2192 lui v\u1EC1 \u0111\u01B0\u1EDDng th\u01B0\u1EDDng",
              );
            } catch (e) {
              if (aborted()) throw e;
              console.warn(
                "[DownloadHelper] upscale l\u1ED7i \u2192 lui v\u1EC1 \u0111\u01B0\u1EDDng th\u01B0\u1EDDng:",
                e?.message,
              );
            }
          }
          const fallbackArgs = {
            tileId,
            fileName,
            resolution: selectedRes,
            nativeResolution: _DEF,
            plannedFilename: options.plannedFilename || null,
            watermarkMode: _wmF.html ? selectedWm : "inherit",
          };
          let persistedAttempted = false;
          let _dlRes = null;
          if (typeof fallbackDownload === "function" && selectedRes === _DEF) {
            persistedAttempted = true;
            const directOk = await cancellable(
              fallbackDownload({ ...fallbackArgs, abortFn: aborted }),
            );
            if (directOk === true) _dlRes = { success: true };
          }
          if (!_dlRes) {
            await cancellable(this._activateFlowTabForDomDownload());
            if (aborted()) throw new Error("DOWNLOAD_STOPPED");
            _dlRes = await cancellable(
              this._sendToContentScript({
                action: "downloadTileMedia",
                requestId,
                tileId: tileId || null,
                promptText: promptText || "flow",
                taskName: taskName || null,
                fileName: fileName || null,
                resolution: selectedRes,
                flowFileId: flowFileId || null,
                index: index || null,
                plannedFilename: options.plannedFilename || null,
                videoResolution: isVideo ? selectedRes : null,
                watermarkMode: _wmF.html ? selectedWm : "inherit",
              }),
            );
          }
          if (aborted()) throw new Error("DOWNLOAD_STOPPED");
          if (_dlRes?.success !== true) {
            if (typeof fallbackDownload === "function" && !persistedAttempted) {
              const fallbackOk = await cancellable(
                fallbackDownload({ ...fallbackArgs, abortFn: aborted }),
              );
              if (aborted()) throw new Error("DOWNLOAD_STOPPED");
              if (fallbackOk === true) {
                console.log(
                  "[DownloadHelper] Flow DOM download failed; persisted media fallback succeeded",
                );
              } else {
                throw new Error(
                  _dlRes?.error ||
                    window.I18n?.t("download.tileGone") ||
                    "Image not found on Google Flow \u2014 it may have been removed from the project.",
                );
              }
            } else {
              throw new Error(
                _dlRes?.error ||
                  window.I18n?.t("download.tileGone") ||
                  "Image not found on Google Flow \u2014 it may have been removed from the project.",
              );
            }
          }
          infoEl.textContent =
            window.I18n?.t("download.success") || "Downloaded successfully!";
          infoEl.className = "download-res-info download-res-info--success";
          if (typeof onDownload === "function") {
            onDownload({
              tileId,
              resolution: selectedRes,
              fileName,
              flowFileId,
            });
          }
          setTimeout(close, 800);
        } catch (e) {
          if (aborted()) return;
          infoEl.textContent =
            (window.I18n?.t("download.errorPrefix") || "Error:") +
            " " +
            (e.message ||
              window.I18n?.t("download.failed") ||
              "Download failed");
          infoEl.className = "download-res-info download-res-info--error";
          submitBtn.disabled = false;
          submitBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          ${window.I18n?.t("common.download") || "Download"}
        `;
        } finally {
          activeAbort = null;
          cancelBtn.hidden = true;
          _offPhase();
        }
      });
  }
  static pickResolution({ options, defaultValue, title } = {}) {
    return new Promise((resolve) => {
      if (!Array.isArray(options) || options.length === 0) return resolve(null);
      const existing = document.getElementById("downloadResModal");
      if (existing) {
        existing._cancelDownload?.();
        existing.remove();
      }
      const overlay = document.createElement("div");
      overlay.id = "downloadResModal";
      overlay.className = "download-res-overlay";
      const active = options.some((o) => o.value === defaultValue)
        ? defaultValue
        : options[0].value;
      overlay.innerHTML = `
        <div class="download-res-modal">
          <div class="download-res-header">
            <span>${title || window.I18n?.t("common.download") || "Download"}</span>
            <button class="download-res-close" id="downloadResClose" title="${window.I18n?.t("common.close") || "Close"}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          <div class="download-res-body">
            <div class="download-res-field">
              <label>${window.I18n?.t("download.resolution") || "Resolution"}</label>
              <div class="download-res-options">
                ${options.map((o) => `<button class="download-res-option ${active === o.value ? "active" : ""}" data-res="${o.value}">${o.label}</button>`).join("")}
              </div>
            </div>
          </div>
          <div class="download-res-footer">
            <button class="download-res-btn" id="downloadResSubmit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              ${window.I18n?.t("common.download") || "Download"}
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      let selectedRes = active;
      overlay
        .querySelectorAll(".download-res-option:not(.download-wm-option)")
        .forEach((btn) => {
          btn.addEventListener("click", () => {
            overlay
              .querySelectorAll(".download-res-option:not(.download-wm-option)")
              .forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            selectedRes = btn.dataset.res;
          });
        });
      const finish = (val) => {
        overlay.remove();
        resolve(val);
      };
      overlay
        .querySelector("#downloadResClose")
        .addEventListener("click", () => finish(null));
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) finish(null);
      });
      overlay
        .querySelector("#downloadResSubmit")
        .addEventListener("click", () => finish(selectedRes));
    });
  }
  static async _sendToContentScript(msg) {
    if (window.MessageBridge) {
      return await window.MessageBridge.sendToContentScript(msg.action, msg);
    }
    throw new Error("FLOW_TARGET_UNAVAILABLE");
  }
  static async showBatchModal(options = {}) {
    const {
      tileIds,
      fileNames = {},
      promptText,
      taskName,
      mediaType,
      apiDownload,
      apiOnly,
    } = options;
    const isVideo = mediaType === "video";
    const I = window.I18n;
    const resolutionOptions =
      window.ProviderConfigManager?.getDownloadResolutionsSync?.(
        "flow",
        isVideo ? "video" : "image",
      ) || [];
    if (!Array.isArray(tileIds) || tileIds.length === 0) {
      console.warn("[DownloadHelper] showBatchModal: empty tileIds");
      return;
    }
    if (!resolutionOptions.length) {
      console.warn(
        "[DownloadHelper] showBatchModal blocked: Flow download resolution config missing",
      );
      window.showNotification?.(
        I?.t("errors.configRequired") ||
          "Download configuration is unavailable. Please retry after reconnecting.",
        "error",
        4e3,
      );
      return;
    }
    let defaultRes = resolutionOptions[0].value;
    try {
      const settings = await this.getSettings();
      const saved = isVideo ? settings.videoResolution : settings.resolution;
      if (resolutionOptions.some((option) => option.value === saved))
        defaultRes = saved;
    } catch (_) {}
    const existing = document.getElementById("downloadResModal");
    if (existing) {
      existing._cancelDownload?.();
      existing.remove();
    }
    const overlay = document.createElement("div");
    overlay.id = "downloadResModal";
    overlay.className = "download-res-overlay";
    const titleText =
      I?.t("download.batchTitle", { count: tileIds.length }) ||
      `Download ${tileIds.length} file(s)`;
    const _wmFB = this._wmField(isVideo);
    let selectedWmB = _wmFB.defaultMode;
    overlay.innerHTML = `
      <div class="download-res-modal">
        <div class="download-res-header">
          <span>${titleText}</span>
          <button class="download-res-close" id="downloadResClose" title="${I?.t("common.close") || "Close"}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div class="download-res-body">
          <div class="download-res-field">
            <label>${I?.t("download.resolution") || "Resolution"}</label>
            <div class="download-res-options">
              ${(() => {
                return resolutionOptions
                  .map(
                    (r) =>
                      `<button class="download-res-option ${defaultRes === r.value ? "active" : ""}" data-res="${r.value}">${r.label}</button>`,
                  )
                  .join("");
              })()}
            </div>
          </div>
          ${_wmFB.html}
          <div class="download-res-info" id="downloadResInfo"></div>
        </div>
        <div class="download-res-footer">
          <button class="download-res-btn download-res-cancel" id="downloadResCancel" type="button" hidden>${I?.t("common.cancel") || "Cancel"}</button>
          <button class="download-res-btn" id="downloadResSubmit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            ${I?.t("common.download") || "Download"}
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    let selectedRes = defaultRes;
    overlay
      .querySelectorAll(".download-res-option:not(.download-wm-option)")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          overlay
            .querySelectorAll(".download-res-option:not(.download-wm-option)")
            .forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          selectedRes = btn.dataset.res;
        });
      });
    let batchAbort = null;
    const close = () => {
      batchAbort?.();
      overlay.remove();
    };
    overlay._cancelDownload = close;
    overlay.querySelector("#downloadResClose").addEventListener("click", close);
    overlay
      .querySelector("#downloadResCancel")
      .addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    const _DEFB = resolutionOptions[0].value;
    const _syncResLockB = () => {
      const f = overlay.querySelector(".download-res-field");
      if (f) f.style.display = "";
    };
    overlay.querySelectorAll(".download-wm-option").forEach((b) => {
      b.addEventListener("click", () => {
        overlay
          .querySelectorAll(".download-wm-option")
          .forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        selectedWmB = b.dataset.wm === "clean" ? "clean" : "original";
        _syncResLockB();
      });
    });
    if (_wmFB.html) _syncResLockB();
    const completedSelections = new Set();
    overlay
      .querySelector("#downloadResSubmit")
      .addEventListener("click", async () => {
        if (batchAbort) return;
        const controller = new AbortController();
        let currentRequestId = null;
        batchAbort = () => {
          if (controller.signal.aborted) return;
          controller.abort();
          if (currentRequestId)
            this._sendToContentScript({
              action: "cancelTileMediaDownload",
              requestId: currentRequestId,
            }).catch(() => {});
        };
        const aborted = () => controller.signal.aborted;
        const cancellable = (promise) =>
          Promise.race([
            promise,
            new Promise((_, reject) => {
              if (aborted()) reject(new Error("DOWNLOAD_STOPPED"));
              else
                controller.signal.addEventListener(
                  "abort",
                  () => reject(new Error("DOWNLOAD_STOPPED")),
                  { once: true },
                );
            }),
          ]);
        const submitBtn = overlay.querySelector("#downloadResSubmit");
        const cancelBtn = overlay.querySelector("#downloadResCancel");
        const infoEl = overlay.querySelector("#downloadResInfo");
        cancelBtn.hidden = false;
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg> ${I?.t("download.downloading") || "Downloading..."}`;
        infoEl.textContent = "";
        window.UsageSync?.trackEvent("download", {
          resolution: selectedRes,
          module: taskName || "gen",
          batch: tileIds.length,
        });
        let okCount = 0,
          failCount = 0;
        for (const tileId of tileIds) {
          if (aborted()) break;
          const selectionKey = JSON.stringify([
            tileId,
            selectedRes,
            _wmFB.html ? selectedWmB : "inherit",
          ]);
          if (completedSelections.has(selectionKey)) {
            okCount++;
            continue;
          }
          try {
            if (typeof apiDownload === "function") {
              const apiOk = await cancellable(
                apiDownload({
                  tileId,
                  plannedFilename: options.plannedFilenames?.[tileId] || null,
                  fileName: fileNames[tileId] || null,
                  resolution: selectedRes,
                  watermarkMode: _wmFB.html ? selectedWmB : "inherit",
                  abortFn: aborted,
                  signal: controller.signal,
                }),
              );
              if (aborted()) break;
              if (apiOk === true) {
                completedSelections.add(selectionKey);
                okCount++;
                continue;
              }
              throw new Error("FLOW_API_DOWNLOAD_FAILED");
              console.warn(
                "[DownloadHelper] Batch API-first download failed \u2192 DOM fallback:",
                tileId,
              );
            }
            await cancellable(this._activateFlowTabForDomDownload());
            if (aborted()) break;
            currentRequestId = `manual_dl_${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
            const _r = await cancellable(
              this._sendToContentScript({
                action: "downloadTileMedia",
                requestId: currentRequestId,
                tileId,
                promptText: promptText || "flow",
                taskName: taskName || null,
                fileName: fileNames[tileId] || null,
                resolution: selectedRes,
                index: tileIds.indexOf(tileId) + 1,
                plannedFilename: options.plannedFilenames?.[tileId] || null,
                videoResolution: isVideo ? selectedRes : null,
                watermarkMode: _wmFB.html ? selectedWmB : "inherit",
              }),
            );
            currentRequestId = null;
            if (aborted()) break;
            if (_r?.success !== true)
              throw new Error(_r?.error || "DOWNLOAD_FAILED");
            completedSelections.add(selectionKey);
            okCount++;
          } catch (e) {
            if (aborted()) break;
            console.warn(
              "[DownloadHelper] Batch download fail:",
              tileId,
              e.message,
            );
            failCount++;
          }
        }
        batchAbort = null;
        cancelBtn.hidden = true;
        if (aborted()) return;
        if (failCount === 0) {
          infoEl.textContent =
            I?.t("download.batchSuccess", { count: okCount }) ||
            `Downloaded ${okCount} file(s) successfully!`;
          infoEl.className = "download-res-info download-res-info--success";
        } else {
          infoEl.textContent =
            I?.t("download.batchPartial", { ok: okCount, fail: failCount }) ||
            `Downloaded ${okCount}, failed ${failCount} file(s)`;
          infoEl.className = "download-res-info download-res-info--error";
        }
        if (failCount === 0) setTimeout(close, 1500);
        else {
          submitBtn.disabled = false;
          submitBtn.textContent = I?.t("download.download") || "Download";
        }
      });
  }
}
class GeminiMediaDownloadHelper {
  static async downloadResults({
    items = [],
    tabId,
    mediaType = "image",
    filenameFor,
    waitForComplete = false,
    onLog,
  } = {}) {
    const kind = mediaType === "video" ? "video" : "image";
    let downloaded = 0;
    const failures = [];
    for (let index = 0; index < items.length; index++) {
      const item = items[index] || {};
      try {
        const filename = await filenameFor(item, index);
        const nativeFn =
          kind === "video"
            ? window.MessageBridge?.geminiDownloadVideoNative
            : window.MessageBridge?.geminiDownloadImageNative;
        if (tabId && item.fingerprint && nativeFn) {
          const native = await nativeFn.call(window.MessageBridge, {
            tabId,
            fingerprint: item.fingerprint,
            filename,
            removeWatermark: window.WatermarkClient?.enabled?.(kind) === true,
          });
          if (native?.success) {
            downloaded++;
            continue;
          }
          onLog?.(
            `Gemini native download ${index + 1}: ${native?.error || "failed"}; fallback`,
            "warn",
          );
        }
        let url = item.url;
        if (tabId && window.MessageBridge?.geminiFetchMedia) {
          const monitor = window.ProviderConfigManager?.getApiConfigValueSync?.(
            "gemini",
            "generation_monitor",
          )?.[kind];
          const maxBytes = Number(monitor?.max_materialized_bytes);
          if (Number.isFinite(maxBytes) && maxBytes > 0) {
            const fetched = await window.MessageBridge.geminiFetchMedia(
              item.url,
              tabId,
              maxBytes,
            );
            if (fetched?.success && fetched.base64) url = fetched.base64;
          }
        }
        const result = await window.DownloadHelper.downloadExternalMedia({
          url,
          filename,
          mediaType: kind,
          waitForComplete,
        });
        if (!result?.success)
          throw new Error(result?.error || "GEMINI_DOWNLOAD_FAILED");
        downloaded++;
      } catch (error) {
        failures.push({
          index,
          error: error?.message || "GEMINI_DOWNLOAD_FAILED",
        });
        onLog?.(
          `Gemini download ${index + 1}: ${error?.message || "failed"}`,
          "warn",
        );
      }
    }
    return { success: failures.length === 0, downloaded, failures };
  }
}
window.DownloadHelper = DownloadHelper;
window.GeminiMediaDownloadHelper = GeminiMediaDownloadHelper;
