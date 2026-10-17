(function () {
  "use strict";
  function isPortableUploadId(id) {
    return (
      typeof id === "string" &&
      /^upload_(?:import|admin_clone|shared_clone)_/.test(id)
    );
  }
  const DEBUG_FILE_UPLOADER = false;
  function log(...args) {
    if (DEBUG_FILE_UPLOADER) console.log("[TobyFlow:FileUploader]", ...args);
  }
  function safeIdentity(value) {
    return (
      window.MediaRegistry?.describeIdentity?.(value) || {
        kind: value ? "redacted" : "missing",
      }
    );
  }
  function arrayBufferToBase64(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    if (typeof bytes.toBase64 === "function") {
      try {
        return bytes.toBase64();
      } catch (_) {}
    }
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(
        null,
        bytes.subarray(i, i + chunkSize),
      );
    }
    return btoa(binary);
  }
  function base64ToBytes(base64) {
    if (typeof Uint8Array.fromBase64 === "function") {
      try {
        return Uint8Array.fromBase64(base64);
      } catch (_) {}
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  async function _sha256HexBuf(arrayBuffer) {
    const buf = await crypto.subtle.digest("SHA-256", arrayBuffer);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  async function uploadPendingFiles(fileIdsStr, options = {}) {
    const executor = window.workflowExecutor;
    const workflowRun = executor?.isRunning === true;
    const abortFn = () =>
      options.abortFn?.() === true ||
      (workflowRun && executor.shouldStop === true);
    const ownControl = !options.control;
    const control =
      options.control ||
      window.MessageBridge?.createUploadControl?.(
        String(fileIdsStr || "")
          .split(",")
          .filter((id) => id.trim().startsWith("upload_")).length,
        abortFn,
      );
    try {
      return await uploadPendingFilesImpl(fileIdsStr, {
        ...options,
        control,
        abortFn: control?.abortFn || abortFn,
        surface: options.surface || (workflowRun ? "workflow" : "gen"),
      });
    } finally {
      if (ownControl) control?.finish();
    }
  }
  async function uploadPendingFilesImpl(fileIdsStr, options = {}) {
    window._lastUploadKeyMapping = {};
    const reportProgress = (progress) => {
      try {
        options.onProgress?.(progress);
      } catch (error) {
        log("Upload UI progress update failed:", error.message || error);
      }
    };
    if (!fileIdsStr) return fileIdsStr;
    let ids = fileIdsStr
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length !== new Set(ids).size) {
      const _seen = new Set();
      ids = ids.filter((id) => (_seen.has(id) ? false : (_seen.add(id), true)));
    }
    if (window.ImmediateUploader) {
      let changed = false;
      for (let i = 0; i < ids.length; i++) {
        if (ids[i].startsWith("upload_")) {
          const result = ImmediateUploader.getResult(ids[i]);
          if (result?.tile_id) {
            const oldKey = ids[i];
            window.MediaRegistry?.setRefIdentity?.(result.tile_id, result);
            log(
              `\u0110\xE3 upload tr\u01B0\u1EDBc \u0111\xF3: ${oldKey.substring(0, 20)}... \u2192 ${result.tile_id.substring(0, 20)}...`,
            );
            ids[i] = result.tile_id;
            changed = true;
            window._lastUploadKeyMapping[oldKey] = result.tile_id;
            const cachedEntry = window.pendingUploadFiles?.get(oldKey);
            if (cachedEntry?.thumbnail) {
              if (!window._uploadedThumbnailCache)
                window._uploadedThumbnailCache = new Map();
              window._uploadedThumbnailCache.set(
                result.tile_id,
                cachedEntry.thumbnail,
              );
            }
            if (window.GenTab?.refImageNames?.[oldKey]) {
              const oldName = window.GenTab.refImageNames[oldKey];
              window.GenTab.refImageNames[result.tile_id] = oldName;
              delete window.GenTab.refImageNames[oldKey];
            }
            if (result.thumbnail_url) {
              MediaRegistry.setThumb(result.tile_id, result.thumbnail_url);
              if (window.GenTab?.thumbnailCache) {
                window.GenTab.thumbnailCache[result.tile_id] =
                  result.thumbnail_url;
                delete window.GenTab.thumbnailCache[oldKey];
              }
            } else if (cachedEntry?.thumbnail) {
              MediaRegistry.setThumb(result.tile_id, cachedEntry.thumbnail);
              if (window.GenTab?.thumbnailCache) {
                window.GenTab.thumbnailCache[result.tile_id] =
                  cachedEntry.thumbnail;
                delete window.GenTab.thumbnailCache[oldKey];
              }
            } else if (MediaRegistry.getThumb(oldKey)) {
              MediaRegistry.setThumb(
                result.tile_id,
                MediaRegistry.getThumb(oldKey),
              );
              if (window.GenTab?.thumbnailCache) {
                window.GenTab.thumbnailCache[result.tile_id] =
                  MediaRegistry.getThumb(oldKey);
                delete window.GenTab.thumbnailCache[oldKey];
              }
            }
            MediaRegistry.deleteThumb(oldKey);
            if (result.file_name) {
              MediaRegistry.setFileName(result.tile_id, result.file_name);
            }
            MediaRegistry.deleteFileName(oldKey);
            window.pendingUploadFiles?.delete(oldKey);
            ImmediateUploader._results.delete(oldKey);
          }
        }
      }
      if (changed) {
        if (window.GenTab?.saveState) {
          window.GenTab.saveState();
        }
        const stillPending = ids.filter(
          (id) =>
            id.startsWith("upload_") && window.pendingUploadFiles?.has(id),
        );
        if (stillPending.length === 0) {
          log(
            "T\u1EA5t c\u1EA3 upload_xxx \u0111\xE3 \u0111\u01B0\u1EE3c ImmediateUploader x\u1EED l\xFD",
          );
          return ids.filter(Boolean).join(", ");
        }
      }
    }
    let pendingIds = ids.filter(
      (id) => id.startsWith("upload_") && window.pendingUploadFiles?.has(id),
    );
    if (window.ImmediateUploader) {
      for (let i = pendingIds.length - 1; i >= 0; i--) {
        const pid = pendingIds[i];
        if (ImmediateUploader.isUploading(pid)) {
          log(`Cho ImmediateUploader hoan thanh: ${pid.substring(0, 20)}...`);
          try {
            let settled = false;
            const existing = Promise.resolve(
              ImmediateUploader._uploading.get(pid),
            ).then((value) => {
              settled = true;
              return value;
            });
            while (!settled) {
              if (options.abortFn?.()) return ids.filter(Boolean).join(", ");
              await Promise.race([
                existing,
                new Promise((resolve) => setTimeout(resolve, 200)),
              ]);
            }
            const result = await existing;
            if (result?.tile_id) {
              const idx = ids.indexOf(pid);
              if (idx !== -1) ids[idx] = result.tile_id;
              window._lastUploadKeyMapping[pid] = result.tile_id;
              window.MediaRegistry?.setRefIdentity?.(result.tile_id, result);
              window.pendingUploadFiles?.delete(pid);
              pendingIds.splice(i, 1);
              log(
                `ImmediateUploader hoan thanh: ${pid.substring(0, 20)}... -> ${result.tile_id.substring(0, 20)}...`,
              );
            }
          } catch (e) {
            log(
              `ImmediateUploader that bai: ${pid.substring(0, 20)}..., se upload lai`,
            );
          }
        }
      }
      if (pendingIds.length === 0) {
        log("Tat ca uploads da hoan thanh qua ImmediateUploader");
        return ids.filter(Boolean).join(", ");
      }
    }
    const orphanUploadIds = ids.filter(
      (id) => id.startsWith("upload_") && !window.pendingUploadFiles?.has(id),
    );
    if (orphanUploadIds.length > 0 && window.PendingUploadStore) {
      if (!window.pendingUploadFiles) window.pendingUploadFiles = new Map();
      for (const oid of orphanUploadIds) {
        try {
          const file = await window.PendingUploadStore.getCachedFile(oid);
          if (file) {
            let thumbnail = null;
            try {
              const lw = await window.PendingUploadStore.getLightweight?.(oid);
              if (lw?.thumbnail) thumbnail = lw.thumbnail;
            } catch (_) {}
            window.pendingUploadFiles.set(oid, { file, thumbnail });
            log(
              `[uploadPendingFiles] Restored orphan ${oid.substring(0, 20)}... from IndexedDB`,
            );
          }
        } catch (e) {
          log(
            `[uploadPendingFiles] Restore orphan ${oid.substring(0, 20)}... failed:`,
            e?.message,
          );
        }
      }
      pendingIds = ids.filter(
        (id) => id.startsWith("upload_") && window.pendingUploadFiles?.has(id),
      );
    }
    if (pendingIds.length === 0) {
      log(
        "Kh\xF4ng c\xF3 pending file n\xE0o trong memory ho\u1EB7c IndexedDB",
      );
      return ids.filter(Boolean).join(", ");
    }
    const filesToUpload = [];
    for (const pid of pendingIds) {
      const cached = window.pendingUploadFiles.get(pid);
      if (cached?.file) filesToUpload.push({ key: pid, file: cached.file });
    }
    if (filesToUpload.length === 0) {
      log("Pending IDs c\xF3 nh\u01B0ng kh\xF4ng t\xECm th\u1EA5y file data");
      return fileIdsStr;
    }
    log(
      `\u0110ang upload ${filesToUpload.length} \u1EA3nh l\xEAn Google Flow...`,
    );
    log(
      `Upload order: ${filesToUpload.map((f) => f.key + " (" + f.file.name + ")").join(", ")}`,
    );
    let flowActivation = null;
    if (window.ImmediateUploader) {
      try {
        flowActivation = await ImmediateUploader._ensureFlowTabReady();
        const flowReady =
          flowActivation?.ready === true ||
          (flowActivation?.ready == null && flowActivation?.isOpen === true);
        if (!flowReady) {
          log(
            "Flow tab kh\xF4ng m\u1EDF, kh\xF4ng th\u1EC3 upload pending files",
          );
          return ids.filter(Boolean).join(", ");
        }
      } catch (e) {
        log("Kh\xF4ng th\u1EC3 ki\u1EC3m tra Flow tab:", e.message);
      }
    }
    try {
      let uploadedIds = null;
      let tileDetails = null;
      let keyMapping = null;
      if (window.MessageBridge) {
        const result = {
          orderedTileIds: [],
          tileIds: [],
          tileDetails: [],
          keyMapping: {},
        };
        let completed = 0;
        if (options.control) {
          options.control.total = filesToUpload.length;
          options.control.progress(0);
        }
        for (const f of filesToUpload) {
          if (options.abortFn?.()) break;
          try {
            await options.control?.checkpoint();
            reportProgress({
              completed,
              total: filesToUpload.length,
              key: f.key,
              state: "uploading",
            });
            const perfNow = () => globalThis.performance?.now?.() ?? Date.now();
            const prepareStartedAt = perfNow();
            let arrayBuffer = await f.file.arrayBuffer();
            if (options.abortFn?.()) break;
            let base64 = arrayBufferToBase64(arrayBuffer);
            const sourceByteLength = arrayBuffer.byteLength;
            const preparedAt = perfNow();
            console.info(
              "[FlowUploadPerf] sidebar payload prepared",
              JSON.stringify({
                bytes: arrayBuffer.byteLength,
                prepareMs: Math.round(preparedAt - prepareStartedAt),
                nativeBase64: typeof new Uint8Array(0).toBase64 === "function",
              }),
            );
            const uploadPayload = [
              { name: f.file.name, type: f.file.type, base64, key: f.key },
            ];
            const receiptPromise = window.MessageBridge.uploadFilesToFlow(
              uploadPayload,
              {
                abortFn: options.abortFn,
                surface: options.surface || "gen",
                manualUpload: options.manualUpload === true,
                forceDom: options.forceDom === true,
                control: options.control,
                reportProgress: false,
              },
            );
            uploadPayload[0].base64 = "";
            base64 = null;
            arrayBuffer = null;
            const receipt = await receiptPromise;
            console.info(
              "[FlowUploadPerf] sidebar receipt received",
              JSON.stringify({
                bytes: sourceByteLength,
                bridgeMs: Math.round(perfNow() - preparedAt),
                totalMs: Math.round(perfNow() - prepareStartedAt),
              }),
            );
            if (receipt?.error || receipt?.success === false)
              throw new Error(
                receipt.errorMessage || receipt.error || "UPLOAD_FAILED",
              );
            const uploaded = receipt?.orderedTileIds || receipt?.tileIds || [];
            if (!uploaded.length) throw new Error("UPLOAD_RESPONSE_EMPTY");
            result.orderedTileIds.push(...uploaded);
            result.tileIds.push(...(receipt.tileIds || uploaded));
            result.tileDetails.push(...(receipt.tileDetails || []));
            Object.assign(result.keyMapping, receipt.keyMapping || {}, {
              [f.key]: receipt.keyMapping?.[f.key] || uploaded[0],
            });
            window._lastUploadKeyMapping[f.key] = result.keyMapping[f.key];
            completed++;
            options.control?.progress(completed);
            reportProgress({
              completed,
              total: filesToUpload.length,
              key: f.key,
              state: "completed",
              newId: result.keyMapping[f.key],
              detail:
                receipt.tileDetails?.find(
                  (info) => info.tile_id === result.keyMapping[f.key],
                ) ||
                receipt.tileDetails?.[0] ||
                null,
            });
          } catch (error) {
            log("Local upload stopped at file:", f.key, error.message);
            result.warning = error.message || "UPLOAD_FAILED";
            options.onError?.(error);
            break;
          }
        }
        uploadedIds = result?.orderedTileIds || result?.tileIds;
        tileDetails = result?.tileDetails || null;
        keyMapping = result?.keyMapping || null;
        log(`Upload returned: ${JSON.stringify(uploadedIds)}`);
        if (keyMapping) log(`Upload keyMapping: ${JSON.stringify(keyMapping)}`);
        if (tileDetails)
          log(`Upload tileDetails: ${JSON.stringify(tileDetails)}`);
        if (result?.warning) log(`Upload warning: ${result.warning}`);
      } else {
        const uploadFn =
          typeof performFlowImageUpload === "function"
            ? performFlowImageUpload
            : window.performFlowImageUpload;
        if (uploadFn) {
          const files = filesToUpload.map((f) => f.file);
          const dummyBtn = document.createElement("button");
          dummyBtn.style.display = "none";
          document.body.appendChild(dummyBtn);
          uploadedIds = await uploadFn(files, dummyBtn);
          dummyBtn.remove();
        } else {
          log(
            "Kh\xF4ng c\xF3 ph\u01B0\u01A1ng th\u1EE9c upload n\xE0o kh\u1EA3 d\u1EE5ng",
          );
          return ids.filter(Boolean).join(", ");
        }
      }
      if (uploadedIds && uploadedIds.length > 0) {
        const resultIds = [...ids];
        log(
          `Mapping: ids=${JSON.stringify(ids)}, pendingIds=${JSON.stringify(pendingIds)}, uploadedIds=${JSON.stringify(uploadedIds)}, keyMapping=${JSON.stringify(keyMapping)}`,
        );
        const useKeyMapping = keyMapping && Object.keys(keyMapping).length > 0;
        let uploadIdx = 0;
        for (let i = 0; i < resultIds.length; i++) {
          const oldKey = resultIds[i];
          if (!pendingIds.includes(oldKey)) continue;
          let newId = null;
          if (useKeyMapping) {
            if (keyMapping[oldKey]) {
              newId = keyMapping[oldKey];
              log(`Mapping via keyMapping: ${oldKey} \u2192 ${newId}`);
            } else {
              log(`No keyMapping for ${oldKey}, upload may have failed`);
              continue;
            }
          } else {
            if (uploadIdx < uploadedIds.length) {
              newId = uploadedIds[uploadIdx];
              log(
                `Mapping via sequential [${uploadIdx}]: ${oldKey} \u2192 ${newId}`,
              );
              uploadIdx++;
            } else {
              log(`No more uploadedIds for ${oldKey}`);
              continue;
            }
          }
          window._lastUploadKeyMapping[oldKey] = newId;
          const cachedEntry = window.pendingUploadFiles.get(oldKey);
          log(`Mapping [${i}]: ${oldKey} \u2192 ${newId}`);
          resultIds[i] = newId;
          if (cachedEntry?.thumbnail) {
            if (!window._uploadedThumbnailCache)
              window._uploadedThumbnailCache = new Map();
            window._uploadedThumbnailCache.set(newId, cachedEntry.thumbnail);
          }
          if (window.GenTab?.refImageNames?.[oldKey]) {
            const oldName = window.GenTab.refImageNames[oldKey];
            window.GenTab.refImageNames[newId] = oldName;
            delete window.GenTab.refImageNames[oldKey];
            log(
              `Transferred name "${oldName}" from ${oldKey.substring(0, 15)}... to ${newId.substring(0, 15)}...`,
            );
          }
          const detail = tileDetails?.find((d) => d.id === newId);
          window.MediaRegistry?.setRefIdentity?.(newId, {
            ...(detail || {}),
            ...(cachedEntry?.file?.type?.startsWith("video/") && {
              type: "video",
            }),
          });
          if (detail?.thumbnailUrl) {
            MediaRegistry.setThumb(newId, detail.thumbnailUrl);
            if (window.GenTab?.thumbnailCache) {
              window.GenTab.thumbnailCache[newId] = detail.thumbnailUrl;
              delete window.GenTab.thumbnailCache[oldKey];
            }
            log(
              `Updated thumbnailCache with new URL for ${newId.substring(0, 15)}...`,
            );
          } else if (cachedEntry?.thumbnail) {
            MediaRegistry.setThumb(newId, cachedEntry.thumbnail);
            if (window.GenTab?.thumbnailCache) {
              window.GenTab.thumbnailCache[newId] = cachedEntry.thumbnail;
              delete window.GenTab.thumbnailCache[oldKey];
            }
          } else if (MediaRegistry.getThumb(oldKey)) {
            MediaRegistry.setThumb(newId, MediaRegistry.getThumb(oldKey));
            if (window.GenTab?.thumbnailCache) {
              window.GenTab.thumbnailCache[newId] =
                MediaRegistry.getThumb(oldKey);
              delete window.GenTab.thumbnailCache[oldKey];
            }
          }
          MediaRegistry.deleteThumb(oldKey);
          if (detail?.file_name) {
            MediaRegistry.setFileName(newId, detail.file_name);
            log(
              `Set fileNameCache[${newId.substring(0, 15)}...] = ${detail.file_name.substring(0, 15)}...`,
            );
          }
          MediaRegistry.deleteFileName(oldKey);
          if (cachedEntry?.file) {
            if (window.PendingUploadStore) {
              await PendingUploadStore.cacheUploaded(newId, cachedEntry.file);
              await Promise.all([
                PendingUploadStore.remove(oldKey),
                PendingUploadStore.removeLightweight(oldKey),
                PendingUploadStore._removeCache(oldKey),
              ]);
            } else {
              window.uploadedFileCache.set(newId, { file: cachedEntry.file });
              window.pendingUploadFiles.delete(oldKey);
            }
          }
        }
        if (window.GenTab?.saveState) {
          window.GenTab.saveState();
        }
        log(
          `Upload th\xE0nh c\xF4ng: ${resultIds.filter(Boolean).length} files`,
        );
        return resultIds.filter(Boolean).join(", ");
      } else {
        log("Upload kh\xF4ng tr\u1EA3 v\u1EC1 tile ID n\xE0o");
      }
    } catch (err) {
      log("L\u1ED7i upload \u1EA3nh:", err.message || err);
    }
    return ids.filter(Boolean).join(", ");
  }
  async function correctFileIds(
    fileIdsStr,
    thumbnailMap,
    fileNameMap,
    fileIdMap,
  ) {
    if (!fileIdsStr) return { correctedIds: fileIdsStr, changed: false };
    const hasThumbs = thumbnailMap && Object.keys(thumbnailMap).length > 0;
    const hasFileNames = fileNameMap && Object.keys(fileNameMap).length > 0;
    const hasFileIds = fileIdMap && Object.keys(fileIdMap).length > 0;
    if (!hasThumbs && !hasFileNames && !hasFileIds) {
      return { correctedIds: fileIdsStr, changed: false };
    }
    const ids = fileIdsStr
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) return { correctedIds: fileIdsStr, changed: false };
    const idToUrlMap = {};
    const fnMap = {};
    const fiMap = {};
    for (const id of ids) {
      if (id.startsWith("upload_")) continue;
      const saved = thumbnailMap?.[id];
      if (saved)
        idToUrlMap[id] =
          typeof saved === "object"
            ? saved.thumbnail || saved.video_url || ""
            : saved;
      if (fileNameMap?.[id]) fnMap[id] = fileNameMap[id];
      const knownUuid =
        saved?.media_uuid ||
        fileIdMap?.[id] ||
        window.MediaRegistry?.getRefIdentity?.(id)?.media_uuid;
      if (knownUuid) fiMap[id] = knownUuid;
    }
    if (
      Object.keys(idToUrlMap).length === 0 &&
      Object.keys(fnMap).length === 0 &&
      Object.keys(fiMap).length === 0
    ) {
      log(
        "correctFileIds: kh\xF4ng c\xF3 thumbnail URL, file_name ho\u1EB7c file_id n\xE0o \u0111\u1EC3 match",
      );
      return { correctedIds: fileIdsStr, changed: false };
    }
    if (
      window.workflowExecutor?.isRunning === true &&
      window._workflowRefPreflightCache?.size > 0
    ) {
      const correctedFromPreflight = [];
      let fullyResolved = true;
      for (const id of ids) {
        if (id.startsWith("upload_")) {
          correctedFromPreflight.push(id);
          continue;
        }
        const fn = fnMap[id];
        const tileId = fn ? window._workflowRefPreflightCache.get(fn) : null;
        if (!fn || !tileId) {
          fullyResolved = false;
          break;
        }
        correctedFromPreflight.push(tileId);
      }
      if (fullyResolved && correctedFromPreflight.length === ids.length) {
        const correctedIds = correctedFromPreflight.join(", ");
        const changed = correctedFromPreflight.some(
          (id, index) => id !== ids[index],
        );
        console.log(
          `[REUPLOAD_AUDIT] correctFileIds preflight fast-path: ${ids.length} ID(s), changed=${changed}`,
        );
        return { correctedIds, changed };
      }
    }
    try {
      let result;
      window.MediaRegistry?.auditRefIdentity?.(
        "correction:request",
        ids.map((id) => ({
          id,
          media_uuid: fiMap[id],
          file_name: fnMap[id],
          thumbnail: idToUrlMap[id],
          type: thumbnailMap?.[id]?.type,
        })),
        { surface: "shared-preflight" },
      );
      if (window.MessageBridge) {
        log(
          "correctFileIds: g\u1EEDi",
          Object.keys(idToUrlMap).length,
          "URLs +",
          Object.keys(fnMap).length,
          "file_names +",
          Object.keys(fiMap).length,
          "file_ids t\u1EDBi content script",
        );
        result = await window.MessageBridge.correctStaleFileIds(
          idToUrlMap,
          fnMap,
          fiMap,
        );
      } else {
        return { correctedIds: fileIdsStr, changed: false };
      }
      console.log(
        "[RefCorrectionAudit] bridge response",
        JSON.stringify({
          requested: ids.map(safeIdentity),
          responseReceived: !!result,
          error: result?.error || null,
          diagnostics: result?.diagnostics
            ? {
                elapsedMs: result.diagnostics.elapsedMs ?? null,
                resolvedCount: result.diagnostics.resolvedIds?.length || 0,
                missingCount: result.diagnostics.missingIds?.length || 0,
                correctedCount: result.diagnostics.correctedCount || 0,
                targetedScan: result.diagnostics.targetedScan || null,
              }
            : null,
        }),
      );
      const corrections = result?.corrections || {};
      window.MediaRegistry?.auditRefIdentity?.(
        "correction:native-result",
        Object.entries(result?.mediaMetadata || {}).map(([oldId, info]) => ({
          ...info,
          id: corrections[oldId] || oldId,
        })),
        { surface: "shared-preflight" },
      );
      for (const [oldId, info] of Object.entries(result?.mediaMetadata || {})) {
        const key = corrections[oldId] || oldId;
        window.MediaRegistry?.setRefIdentity?.(key, info);
        if (info.file_name) MediaRegistry.setFileName(key, info.file_name);
        if (info.thumbnail)
          MediaRegistry.setThumb(
            key,
            info.type === "video" ? { ...info } : info.thumbnail,
          );
      }
      if (Object.keys(corrections).length === 0) {
        log(
          "correctFileIds: t\u1EA5t c\u1EA3 IDs h\u1EE3p l\u1EC7 ho\u1EB7c kh\xF4ng match \u0111\u01B0\u1EE3c",
        );
        return {
          correctedIds: fileIdsStr,
          changed: false,
          mediaMetadata: result?.mediaMetadata || {},
        };
      }
      const correctedIds = ids.map((id) => corrections[id] || id);
      for (const [oldId, newId] of Object.entries(corrections)) {
        log(
          `correctFileIds: ${oldId.substring(0, 25)}... \u2192 ${newId.substring(0, 25)}...`,
        );
      }
      return {
        correctedIds: correctedIds.join(", "),
        changed: true,
        mediaMetadata: result?.mediaMetadata || {},
      };
    } catch (err) {
      console.warn(
        "[RefCorrectionAudit] bridge failed",
        JSON.stringify({
          requested: ids.map(safeIdentity),
          error: err?.message || "unknown",
        }),
      );
      log("correctFileIds failed:", err.message);
      return { correctedIds: fileIdsStr, changed: false };
    }
  }
  async function reuploadMissingFiles(
    fileIdsStr,
    thumbnailMap,
    originalIdsStr,
    fileNamesMap,
    options = {},
  ) {
    if (!fileIdsStr) return fileIdsStr;
    const forcedIds = new Set((options.forceReuploadIds || []).filter(Boolean));
    const assertRecoveryActive = () => {
      if (options.abortFn?.())
        throw Object.assign(new Error("UPLOAD_STOPPED"), {
          code: "ABORTED",
          noRetry: true,
        });
    };
    assertRecoveryActive();
    window._lastReuploadResolvedFileNames = new Set();
    const ids = fileIdsStr
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) return fileIdsStr;
    log("[reuploadMissingFiles] Input IDs:", ids);
    console.log(
      "[REUPLOAD_AUDIT] reuploadMissingFiles ENTRY",
      JSON.stringify({
        count: ids.length,
        identities: ids.map(safeIdentity),
        fileNameCount: Object.keys(fileNamesMap || {}).length,
        hasOriginalIds: !!originalIdsStr,
        forcedCount: forcedIds.size,
        recoveryReason: forcedIds.size ? "scan_deadline" : null,
        surface: options.surface || null,
      }),
    );
    const resolvedIds = {};
    let catalogPolicy = false;
    let missingIds = [];
    if (forcedIds.size === 0) {
      if (window.MessageBridge?.lookupFlowMediaCatalog) {
        try {
          const keys = [
            ...new Set([
              ...ids.filter((id) => !id.startsWith("upload_")),
              ...Object.values(fileNamesMap || {}).filter(Boolean),
            ]),
          ];
          const catalog =
            await window.MessageBridge.lookupFlowMediaCatalog(keys);
          catalogPolicy = catalog?.supported === true;
          if (catalogPolicy) {
            for (const id of ids) {
              if (id.startsWith("upload_")) continue;
              const info =
                catalog.known?.[id] || catalog.known?.[fileNamesMap?.[id]];
              if (info) window.MediaRegistry?.setRefIdentity?.(id, info);
              resolvedIds[id] = id;
            }
            console.info(
              "[FlowMediaCatalog] ref preflight",
              JSON.stringify({
                requested: ids.length,
                known: Object.keys(catalog.known || {}).length,
                unknown: catalog.unknown?.length || 0,
                networkValidation: false,
                domScan: false,
                autoReupload: false,
              }),
            );
            if (!ids.some(isPortableUploadId)) return ids.join(", ");
          }
        } catch (error) {
          console.warn(
            "[FlowMediaCatalog] lookup unavailable:",
            error?.message,
          );
          return fileIdsStr;
        }
      }
      if (fileNamesMap && window.MessageBridge && !catalogPolicy) {
        const fileNamesToCheck = [];
        const fnToOldIds = new Map();
        for (const id of ids) {
          if (id.startsWith("upload_")) continue;
          const fn = fileNamesMap[id];
          if (fn) {
            if (!fnToOldIds.has(fn)) {
              fnToOldIds.set(fn, []);
              fileNamesToCheck.push(fn);
            }
            fnToOldIds.get(fn).push(id);
          }
        }
        console.log(
          "[REUPLOAD_AUDIT] fileNamesToCheck",
          JSON.stringify({
            count: fileNamesToCheck.length,
            identities: fileNamesToCheck.map(safeIdentity),
          }),
        );
        if (fileNamesToCheck.length > 0) {
          try {
            const cachedFileNames = [];
            for (const fn of fileNamesToCheck) {
              const cachedTileId =
                window.workflowExecutor?.isRunning === true
                  ? window._workflowRefPreflightCache?.get?.(fn)
                  : null;
              if (!cachedTileId) continue;
              cachedFileNames.push(fn);
              for (const oldId of fnToOldIds.get(fn) || [])
                resolvedIds[oldId] = cachedTileId;
              console.log(
                "[REUPLOAD_AUDIT] preflight cache resolve",
                JSON.stringify({
                  fileIdentity: safeIdentity(fn),
                  tileIdentity: safeIdentity(cachedTileId),
                  skipDomScan: true,
                }),
              );
            }
            const uncachedFileNames = fileNamesToCheck.filter(
              (fn) => !cachedFileNames.includes(fn),
            );
            let fnCheck =
              uncachedFileNames.length > 0
                ? (await window.MessageBridge.checkFilesExist(
                    uncachedFileNames,
                  )) || { existing: [], missing: uncachedFileNames, found: {} }
                : { existing: [], missing: [], found: {} };
            if (cachedFileNames.length > 0) {
              fnCheck.existing = [
                ...cachedFileNames,
                ...(fnCheck.existing || []),
              ];
            }
            log(
              "[reuploadMissingFiles] checkFilesExist result:",
              JSON.stringify(fnCheck),
            );
            console.log(
              "[REUPLOAD_AUDIT] checkFilesExist RESULT",
              JSON.stringify({
                existingCount: fnCheck?.existing?.length || 0,
                missingCount: fnCheck?.missing?.length || 0,
              }),
            );
            for (const [fn, tileId] of Object.entries(fnCheck?.found || {})) {
              const oldIds = fnToOldIds.get(fn) || [];
              if (oldIds.length > 0 && tileId) {
                window._lastReuploadResolvedFileNames.add(fn);
                for (const oldId of oldIds) resolvedIds[oldId] = tileId;
                console.log(
                  "[REUPLOAD_AUDIT] atomic resolve",
                  JSON.stringify({
                    fileIdentity: safeIdentity(fn),
                    tileIdentity: safeIdentity(tileId),
                    aliasCount: oldIds.length,
                    skipReupload: true,
                  }),
                );
              }
            }
            if (
              fnCheck?.missing?.length > 0 &&
              window.MessageBridge?.sendToContentScript
            ) {
              console.log(
                `[REUPLOAD_AUDIT] ${fnCheck.missing.length} file_name(s) missing \u2192 force ensureFlowTilesLoaded(targets) + capture`,
              );
              try {
                const ftl = await window.MessageBridge.sendToContentScript(
                  "ensureFlowTilesLoaded",
                  { force: true, targetFileNames: fnCheck.missing },
                );
                console.log(
                  "[REUPLOAD_AUDIT] force ensureFlowTilesLoaded DONE",
                  JSON.stringify({
                    success: ftl?.success !== false,
                    tileCount: ftl?.tileCount ?? null,
                    resolvedCount: Object.keys(ftl?.found || {}).length,
                  }),
                );
                const foundMap = ftl?.found || {};
                for (const fn of Object.keys(foundMap)) {
                  const oldIds = fnToOldIds.get(fn) || [];
                  if (oldIds.length > 0 && foundMap[fn]) {
                    window._lastReuploadResolvedFileNames.add(fn);
                    for (const oldId of oldIds)
                      resolvedIds[oldId] = foundMap[fn];
                    console.log(
                      "[REUPLOAD_AUDIT] capture resolve",
                      JSON.stringify({
                        fileIdentity: safeIdentity(fn),
                        tileIdentity: safeIdentity(foundMap[fn]),
                        skipReupload: true,
                      }),
                    );
                  }
                }
                const remaining = (fnCheck?.missing || []).filter(
                  (fn) => !(fn in foundMap),
                );
                if (remaining.length > 0) {
                  const rc =
                    await window.MessageBridge.checkFilesExist(remaining);
                  fnCheck = {
                    existing: [
                      ...(fnCheck?.existing || []),
                      ...(rc?.existing || []),
                    ],
                    missing: rc?.missing || [],
                    found: { ...(fnCheck?.found || {}), ...(rc?.found || {}) },
                  };
                  for (const [fn, tileId] of Object.entries(rc?.found || {})) {
                    const oldIds = fnToOldIds.get(fn) || [];
                    if (tileId) {
                      window._lastReuploadResolvedFileNames.add(fn);
                      for (const oldId of oldIds) resolvedIds[oldId] = tileId;
                    }
                  }
                } else {
                  fnCheck = {
                    existing: Object.keys(foundMap),
                    missing: [],
                    found: foundMap,
                  };
                }
                console.log(
                  "[REUPLOAD_AUDIT] post-capture",
                  JSON.stringify({
                    existingCount: fnCheck?.existing?.length || 0,
                    missingCount: fnCheck?.missing?.length || 0,
                  }),
                );
              } catch (e) {
                log(
                  "[reuploadMissingFiles] force ensureFlowTilesLoaded + capture failed:",
                  e.message,
                );
              }
            }
            for (const fn of fnCheck?.existing || []) {
              const oldIds = fnToOldIds.get(fn) || [];
              if (
                oldIds.length === 0 ||
                oldIds.every((oldId) => resolvedIds[oldId])
              )
                continue;
              try {
                const found = await window.MessageBridge.findTileByFileName(fn);
                if (found?.tileId) {
                  for (const oldId of oldIds) resolvedIds[oldId] = found.tileId;
                  log(
                    `[reuploadMissingFiles] Resolved via file_name: ${oldIds.join(",")} \u2192 ${found.tileId}`,
                  );
                }
              } catch (e) {
                log(
                  `[reuploadMissingFiles] findTileByFileName failed for ${fn}:`,
                  e.message,
                );
              }
            }
          } catch (e) {
            log("[reuploadMissingFiles] checkFilesExist failed:", e.message);
          }
        }
      }
      const unresolvedIds = ids.filter(
        (id) => !id.startsWith("upload_") && !resolvedIds[id],
      );
      if (unresolvedIds.length > 0 && window.MessageBridge) {
        try {
          const check =
            await window.MessageBridge.checkTilesExist(unresolvedIds);
          missingIds = check?.missing || [];
          log(
            "[reuploadMissingFiles] checkTilesExist result:",
            JSON.stringify(check),
          );
        } catch (e) {
          log("[reuploadMissingFiles] checkTilesExist failed:", e.message);
          missingIds = [];
        }
      } else if (unresolvedIds.length > 0) {
        missingIds = unresolvedIds.filter((id) => {
          return (
            document.querySelectorAll(`[data-tile-id="${id}"]`).length === 0
          );
        });
      }
    }
    assertRecoveryActive();
    if (forcedIds.size > 0) missingIds = ids.filter((id) => forcedIds.has(id));
    const importKeys = ids.filter((id) => isPortableUploadId(id));
    if (importKeys.length > 0) {
      log(
        "[reuploadMissingFiles] Found import keys (force add to missing):",
        importKeys,
      );
      for (const ik of importKeys) {
        if (!missingIds.includes(ik)) missingIds.push(ik);
      }
    }
    log("[reuploadMissingFiles] Missing IDs:", missingIds);
    const applyResolvedIds = () => {
      if (Object.keys(resolvedIds).length === 0) return ids.join(", ");
      const updated = ids.map((id) => resolvedIds[id] || id);
      log("[reuploadMissingFiles] Applied resolvedIds:", resolvedIds);
      return updated.join(", ");
    };
    if (missingIds.length === 0) {
      console.log(
        `[REUPLOAD_AUDIT] EXIT no-missing \u2014 ${ids.length} IDs valid (file_name resolved=${Object.keys(resolvedIds).length}, tile_exists check pass)`,
      );
      return applyResolvedIds();
    }
    const originalIds = originalIdsStr
      ? originalIdsStr
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const correctedToOriginal = {};
    if (originalIds.length === ids.length) {
      for (let i = 0; i < ids.length; i++) {
        if (ids[i] !== originalIds[i])
          correctedToOriginal[ids[i]] = originalIds[i];
      }
    }
    if (!window.uploadedFileCache) window.uploadedFileCache = new Map();
    let reuploadable = missingIds.filter((id) =>
      window.uploadedFileCache.has(id),
    );
    if (reuploadable.length < missingIds.length && window.PendingUploadStore) {
      const stillMissing = missingIds.filter(
        (id) => !reuploadable.includes(id),
      );
      for (const id of stillMissing) {
        assertRecoveryActive();
        let file = await PendingUploadStore.getCachedFile(id);
        if (!file && correctedToOriginal[id]) {
          file = await PendingUploadStore.getCachedFile(
            correctedToOriginal[id],
          );
          if (file)
            log(
              `[T\u1EA7ng 2] T\xECm th\u1EA5y cache b\u1EB1ng original ID ${correctedToOriginal[id].substring(0, 20)}...`,
            );
        }
        if (file) {
          window.uploadedFileCache.set(id, { file });
          reuploadable.push(id);
        }
      }
    }
    if (reuploadable.length < missingIds.length && window.ImageStore) {
      const stillMissing = missingIds.filter(
        (id) => !reuploadable.includes(id),
      );
      try {
        const allImages = await window.ImageStore.getAllImages();
        for (const id of stillMissing) {
          if (forcedIds.has(id) && options.mediaTypeMap?.[id] === "video")
            continue;
          assertRecoveryActive();
          const uuid = id.startsWith("fe_id_") ? id.replace("fe_id_", "") : id;
          let mediaUuid = null;
          const _rawRefThumb = thumbnailMap?.[id];
          const refThumbUrl =
            typeof _rawRefThumb === "string"
              ? _rawRefThumb
              : _rawRefThumb?.thumbnail;
          if (refThumbUrl && typeof refThumbUrl === "string") {
            const nameMatch = refThumbUrl.match(/[?&]name=([a-f0-9-]+)/i);
            if (nameMatch) mediaUuid = nameMatch[1];
          }
          const albumImg = allImages.find((img) => {
            if (img.file_id === id || img.file_id === uuid) return true;
            if (img.file_name === uuid || img.file_name === id) return true;
            if (img.id === uuid || img.id === id) return true;
            if (mediaUuid && img.file_name === mediaUuid) return true;
            if (mediaUuid && img.thumbnail_url) {
              const imgNameMatch = img.thumbnail_url.match(
                /[?&]name=([a-f0-9-]+)/i,
              );
              if (imgNameMatch && imgNameMatch[1] === mediaUuid) return true;
            }
            return false;
          });
          log(
            `[T\u1EA7ng 2.5] ID ${id} \u2192 uuid ${uuid} \u2192 albumImg: ${albumImg ? albumImg.id : "NOT FOUND"}, ${albumImg ? "file_id=" + albumImg.file_id + " file_name=" + albumImg.file_name : ""}`,
          );
          if (albumImg) {
            let blob = await window.ImageStore.getFullBlob(albumImg.id);
            if (blob && window.WatermarkClient) {
              try {
                const cleaned = await window.WatermarkClient.cleanBlob(
                  blob,
                  "image",
                  { scope: "input" },
                );
                if (cleaned && cleaned !== blob) {
                  blob = cleaned;
                  log(
                    `[T\u1EA7ng 2.5] \u0110\xE3 xo\xE1 watermark cho ref ${id}`,
                  );
                }
              } catch (e) {
                log(
                  `[T\u1EA7ng 2.5] b\u1ECF qua xo\xE1 watermark: ${e?.message}`,
                );
              }
            }
            if (blob) {
              const file = new File(
                [blob],
                `album_${uuid.substring(0, 8)}.png`,
                { type: blob.type || "image/png" },
              );
              window.uploadedFileCache.set(id, {
                file,
                thumbnail: albumImg.thumbnail_url,
              });
              reuploadable.push(id);
              log(
                `[T\u1EA7ng 2.5] T\xECm th\u1EA5y blob trong Album cho ${id}`,
              );
            }
          }
        }
      } catch (e) {
        log("[T\u1EA7ng 2.5] L\u1ED7i t\xECm album blob:", e.message);
      }
    }
    if (reuploadable.length < missingIds.length) {
      const stillMissing = missingIds.filter(
        (id) => !reuploadable.includes(id),
      );
      for (const id of stillMissing) {
        assertRecoveryActive();
        const _rawThumb = thumbnailMap?.[id] || MediaRegistry.getThumb(id);
        const isTemplateMedia =
          forcedIds.has(id) ||
          id.startsWith("template_ref_") ||
          isPortableUploadId(id);
        const portableUrl =
          typeof _rawThumb === "string"
            ? _rawThumb
            : _rawThumb?.video_url || _rawThumb?.thumbnail || "";
        const isVideo =
          (forcedIds.has(id) && options.mediaTypeMap?.[id] === "video") ||
          (isTemplateMedia &&
            ((typeof _rawThumb === "object" &&
              (_rawThumb.type === "video" || !!_rawThumb.video_url)) ||
              /\.(mp4|webm|mov)(?:[?#]|$)/i.test(portableUrl)));
        const thumbUrl =
          forcedIds.has(id) && isVideo
            ? typeof _rawThumb === "object"
              ? _rawThumb.video_url
              : null
            : typeof _rawThumb === "string"
              ? _rawThumb
              : isTemplateMedia
                ? _rawThumb?.video_url || _rawThumb?.thumbnail || null
                : null;
        if (
          !thumbUrl ||
          typeof thumbUrl !== "string" ||
          !thumbUrl.startsWith("http")
        )
          continue;
        try {
          const fetchUrl =
            thumbUrl.includes("lh3.") ||
            thumbUrl.includes("googleusercontent.com") ||
            thumbUrl.includes("flow.google.com/asb/")
              ? thumbUrl.split("=")[0]
              : thumbUrl;
          let resp;
          const _pat = window._getMediaUrlPattern?.() || "getMediaUrlRedirect";
          if (fetchUrl.includes(_pat) && !isVideo) {
            log(`[T\u1EA7ng 3] Fetching via content script for ${id}`);
            resp = await window.MessageBridge.sendToContentScript(
              "fetchImageAsBase64",
              { url: fetchUrl },
            );
            if (!resp?.success) {
              log(
                `[T\u1EA7ng 3] Content script failed (${resp?.error || "unknown"}), trying background.js fetchBlob for ${id}`,
              );
              try {
                resp = await new Promise((resolve, reject) => {
                  chrome.runtime.sendMessage(
                    {
                      action: "fetchBlob",
                      url: fetchUrl,
                      expectImage: !isVideo,
                    },
                    (r) => {
                      if (chrome.runtime.lastError)
                        return reject(
                          new Error(chrome.runtime.lastError.message),
                        );
                      resolve(r);
                    },
                  );
                });
              } catch (bgErr) {
                log(
                  `[T\u1EA7ng 3] background.js fetchBlob also failed for ${id}: ${bgErr.message}`,
                );
              }
            }
          } else {
            resp = await new Promise((resolve, reject) => {
              chrome.runtime.sendMessage(
                { action: "fetchBlob", url: fetchUrl, expectImage: !isVideo },
                (r) => {
                  if (chrome.runtime.lastError)
                    return reject(new Error(chrome.runtime.lastError.message));
                  resolve(r);
                },
              );
            });
          }
          if (resp?.success && resp.base64) {
            assertRecoveryActive();
            if (forcedIds.has(id)) {
              const expected = isVideo ? "video/" : "image/";
              if (!(resp.mime || resp.contentType || "").startsWith(expected))
                throw new Error("FLOW_REF_RECOVERY_TYPE_MISMATCH");
            }
            let _b64 = resp.base64;
            if (!isVideo && window.WatermarkClient) {
              const cl = await window.WatermarkClient.cleanBase64(
                _b64,
                "image/png",
                "image",
                { scope: "input" },
              );
              if (cl.cleaned) {
                _b64 = cl.base64;
                log(`[T\u1EA7ng 3] \u0110\xE3 xo\xE1 watermark cho ref ${id}`);
              }
            }
            let bytes = base64ToBytes(_b64);
            const mime = isVideo
              ? resp.mime ||
                resp.contentType ||
                (/\.webm(?:[?#]|$)/i.test(fetchUrl)
                  ? "video/webm"
                  : "video/mp4")
              : "image/png";
            const ext =
              mime === "video/webm"
                ? "webm"
                : mime === "video/quicktime"
                  ? "mov"
                  : isVideo
                    ? "mp4"
                    : "png";
            let blob = new Blob([bytes], { type: mime });
            const file = new File(
              [blob],
              `reupload_${encodeURIComponent(id)}.${ext}`,
              { type: mime },
            );
            if (resp && typeof resp === "object") resp.base64 = "";
            _b64 = null;
            bytes = null;
            blob = null;
            window.uploadedFileCache.set(id, { file });
            reuploadable.push(id);
            log(`[T\u1EA7ng 3] Fetched image from thumbnail URL for ${id}`);
          } else {
            log(
              `[T\u1EA7ng 3] fetchBlob/content failed for ${id}: ${resp?.error || "unknown"}`,
            );
          }
        } catch (err) {
          log(
            `[T\u1EA7ng 3] Fetch thumbnail URL failed for ${id}:`,
            err.message,
          );
        }
      }
    }
    assertRecoveryActive();
    if (!window._reuploadHashIndex) window._reuploadHashIndex = new Map();
    if (forcedIds.size === 0 && reuploadable.length > 0) {
      try {
        const hashCandidates = [];
        for (const id of reuploadable) {
          const cached = window.uploadedFileCache.get(id);
          assertRecoveryActive();
          if (!cached?.file) continue;
          const hash = await _sha256HexBuf(await cached.file.arrayBuffer());
          cached._hash = hash;
          const known = window._reuploadHashIndex.get(hash);
          if (known) hashCandidates.push({ id, tileId: known });
        }
        if (
          hashCandidates.length > 0 &&
          window.MessageBridge?.checkTilesExist
        ) {
          const tileIds = [...new Set(hashCandidates.map((c) => c.tileId))];
          let aliveSet = new Set();
          try {
            const chk = await window.MessageBridge.checkTilesExist(tileIds);
            const miss = new Set(chk?.missing || []);
            aliveSet = new Set(tileIds.filter((t) => !miss.has(t)));
          } catch (_) {}
          for (const c of hashCandidates) {
            if (aliveSet.has(c.tileId)) {
              resolvedIds[c.id] = c.tileId;
              log(
                `[anti-dup] hash reuse ${c.id.substring(0, 18)} \u2192 ${c.tileId.substring(0, 18)} (skip reupload)`,
              );
            }
          }
          reuploadable = reuploadable.filter((id) => !resolvedIds[id]);
          missingIds = missingIds.filter((id) => !resolvedIds[id]);
        }
      } catch (e) {
        log("[anti-dup] hash dedup skipped:", e.message);
      }
    }
    if (reuploadable.length === 0) {
      log(`${missingIds.length} ref image(s) missing, no cache to re-upload`);
      console.log(
        `[REUPLOAD_AUDIT] EXIT no-cache \u2014 ${missingIds.length} missing, no reuploadable cache (resolved=${Object.keys(resolvedIds).length})`,
      );
      const base2 = ids.map((id) => resolvedIds[id] || id);
      return base2.filter((id) => !missingIds.includes(id)).join(", ");
    }
    log(`Re-uploading ${reuploadable.length} missing ref images...`);
    console.log(
      "[REUPLOAD_AUDIT] WILL UPLOAD",
      JSON.stringify({
        count: reuploadable.length,
        identities: reuploadable.map(safeIdentity),
      }),
    );
    let reuploadFlowActivation = null;
    if (window.ImmediateUploader) {
      try {
        reuploadFlowActivation = await ImmediateUploader._ensureFlowTabReady();
        const flowReady =
          reuploadFlowActivation?.ready === true ||
          (reuploadFlowActivation?.ready == null &&
            reuploadFlowActivation?.isOpen === true);
        if (!flowReady) {
          log(
            "[reuploadMissingFiles] Flow tab kh\xF4ng m\u1EDF, skip re-upload",
          );
          const base2 = ids.map((id) => resolvedIds[id] || id);
          return base2.filter((id) => !missingIds.includes(id)).join(", ");
        }
      } catch (e) {
        log(
          "[reuploadMissingFiles] Kh\xF4ng th\u1EC3 ki\u1EC3m tra Flow tab:",
          e.message,
        );
      }
    }
    try {
      let newIds = null;
      let reuploadTileDetails = null;
      let reuploadKeyMapping = null;
      if (window.MessageBridge) {
        const filesData = [];
        for (const id of reuploadable) {
          const cached = window.uploadedFileCache.get(id);
          if (!cached?.file) continue;
          assertRecoveryActive();
          if (forcedIds.has(id)) {
            const expected =
              options.mediaTypeMap?.[id] === "video" ? "video/" : "image/";
            if (!cached.file.type?.startsWith(expected))
              throw new Error("FLOW_REF_RECOVERY_TYPE_MISMATCH");
          }
          const arrayBuffer = await cached.file.arrayBuffer();
          const base64 = arrayBufferToBase64(arrayBuffer);
          filesData.push({
            key: id,
            name: cached.file.name,
            type: cached.file.type,
            base64,
          });
        }
        if (filesData.length > 0) {
          log(
            `[T\u1EA7ng 3] Uploading ${filesData.length} files to Flow via MessageBridge...`,
          );
          const uploadPromise = window.MessageBridge.uploadFilesToFlow(
            filesData,
            {
              surface: options.surface || "gen",
              forceDom: options.forceDom === true,
              abortFn: options.abortFn,
            },
          );
          for (const fileData of filesData) fileData.base64 = "";
          const result = await uploadPromise;
          assertRecoveryActive();
          newIds = result?.orderedTileIds || result?.tileIds;
          reuploadKeyMapping = result?.keyMapping || null;
          if (forcedIds.size > 0 && !reuploadKeyMapping)
            throw new Error("FLOW_REF_RECOVERY_RECEIPT_MISSING");
          reuploadTileDetails = result?.tileDetails || null;
          log(
            `[T\u1EA7ng 3] uploadFilesToFlow result: tileIds=${JSON.stringify(newIds)}`,
          );
          if (reuploadTileDetails)
            log(
              `[T\u1EA7ng 3] tileDetails: ${JSON.stringify(reuploadTileDetails)}`,
            );
        }
      } else {
        const uploadFn =
          typeof performFlowImageUpload === "function"
            ? performFlowImageUpload
            : window.performFlowImageUpload;
        if (uploadFn) {
          const files = reuploadable
            .map((id) => window.uploadedFileCache.get(id)?.file)
            .filter(Boolean);
          const dummyBtn = document.createElement("button");
          dummyBtn.style.display = "none";
          document.body.appendChild(dummyBtn);
          newIds = await uploadFn(files, dummyBtn);
          dummyBtn.remove();
        }
      }
      if (newIds && newIds.length > 0) {
        const resultIds = ids.map((id) => resolvedIds[id] || id);
        const reuploadDetailsMap = {};
        let idx = 0;
        const hasKeyMapping =
          reuploadKeyMapping && typeof reuploadKeyMapping === "object";
        for (let i = 0; i < resultIds.length; i++) {
          if (reuploadable.includes(resultIds[i])) {
            const oldId = resultIds[i];
            const newId = hasKeyMapping
              ? reuploadKeyMapping[oldId]
              : newIds[idx];
            if (!newId) {
              log(
                `[T\u1EA7ng 3] Kh\xF4ng c\xF3 verified mapping cho ${oldId.substring(0, 18)} \u2014 gi\u1EEF missing thay v\xEC gh\xE9p nh\u1EA7m file`,
              );
              continue;
            }
            if (!hasKeyMapping) idx++;
            const reupDetail = reuploadTileDetails?.find(
              (d) => d.id === newId || d.tile_id === newId,
            );
            if (forcedIds.has(oldId)) {
              const verifiedUuid = [
                reupDetail?.media_uuid,
                reupDetail?.file_id,
                reupDetail?.file_name,
                newId,
              ].find((value) =>
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                  String(value || ""),
                ),
              );
              if (!verifiedUuid || newId === oldId)
                throw new Error("FLOW_REF_RECOVERY_UUID_MISSING");
            }
            resultIds[i] = newId;
            const cached = window.uploadedFileCache.get(oldId);
            if (cached) {
              window.uploadedFileCache.delete(oldId);
              if (window.PendingUploadStore && cached.file) {
                await window.PendingUploadStore.cacheUploaded(
                  newId,
                  cached.file,
                );
                if (newId !== oldId)
                  await window.PendingUploadStore._removeCache(oldId);
              } else {
                window.uploadedFileCache.set(newId, cached);
              }
              if (cached._hash)
                window._reuploadHashIndex.set(cached._hash, newId);
            }
            if (window.GenTab?.refImageNames?.[oldId]) {
              window.GenTab.refImageNames[newId] =
                window.GenTab.refImageNames[oldId];
              delete window.GenTab.refImageNames[oldId];
            }
            window.MediaRegistry?.setRefIdentity?.(newId, {
              ...(reupDetail || {}),
              ...(cached?.file?.type?.startsWith("video/") && {
                type: "video",
              }),
            });
            const isFlowThumbnailUrl = (url) =>
              url &&
              (url.includes("googleusercontent.com") ||
                url.includes("labs.google") ||
                url.includes("flow.google.com/asb/") ||
                url.includes("flow-content.google/"));
            if (
              reupDetail?.thumbnailUrl &&
              isFlowThumbnailUrl(reupDetail.thumbnailUrl)
            ) {
              MediaRegistry.setThumb(newId, reupDetail.thumbnailUrl);
            } else {
              const oldThumb = MediaRegistry.getThumb(oldId);
              if (oldThumb && isFlowThumbnailUrl(oldThumb)) {
                MediaRegistry.setThumb(newId, oldThumb);
              }
            }
            MediaRegistry.deleteThumb(oldId);
            if (reupDetail?.file_name) {
              MediaRegistry.setFileName(newId, reupDetail.file_name);
            } else if (MediaRegistry.getFileName(oldId)) {
              MediaRegistry.setFileName(
                newId,
                MediaRegistry.getFileName(oldId),
              );
            }
            MediaRegistry.deleteFileName(oldId);
            const validThumbUrl =
              reupDetail?.thumbnailUrl &&
              isFlowThumbnailUrl(reupDetail.thumbnailUrl)
                ? reupDetail.thumbnailUrl
                : null;
            reuploadDetailsMap[newId] = {
              thumbnailUrl: validThumbUrl,
              ...(reupDetail?.display_name || reupDetail?.uploadName
                ? {
                    display_name:
                      reupDetail.display_name || reupDetail.uploadName,
                  }
                : {}),
              file_name: reupDetail?.file_name || null,
              media_uuid: reupDetail?.media_uuid || reupDetail?.file_id || null,
              persistent_media_id:
                reupDetail?.persistent_media_id ||
                reupDetail?.file_name ||
                null,
              type: cached?.file?.type?.startsWith("video/")
                ? "video"
                : reupDetail?.type || "image",
              ...(reupDetail?.video_url && { video_url: reupDetail.video_url }),
            };
          }
        }
        window._lastReuploadTileDetails = reuploadDetailsMap;
        return resultIds.filter(Boolean).join(", ");
      }
    } catch (err) {
      if (forcedIds.size > 0 || options.abortFn?.()) {
        err.noRetry = true;
        err.code || (err.code = err.message);
        throw err;
      }
      log("Re-upload missing files failed:", err);
    }
    const base = ids.map((id) => resolvedIds[id] || id);
    return base.filter((id) => !missingIds.includes(id)).join(", ");
  }
  async function batchResolveRefImages(images) {
    if (!images || images.length === 0) {
      return new Map();
    }
    if (window.MessageBridge?.lookupFlowMediaCatalog) {
      try {
        const catalog = await window.MessageBridge.lookupFlowMediaCatalog(
          images
            .flatMap((image) => [image.id, image.file_name])
            .filter(Boolean),
        );
        if (catalog?.supported === true) {
          for (const image of images) {
            const info =
              catalog.known?.[image.id] || catalog.known?.[image.file_name];
            if (info) window.MediaRegistry?.setRefIdentity?.(image.id, info);
          }
          return new Map(images.map((image) => [image.id, image.id]));
        }
      } catch (error) {
        console.warn(
          "[FlowMediaCatalog] batch identity lookup unavailable:",
          error?.message,
        );
        return new Map();
      }
    }
    if (window.TileResolver) {
      log("Using TileResolver.batchResolve for", images.length, "images");
      const { results: results2, unresolved } =
        window.TileResolver.batchResolve(images);
      if (unresolved.length > 0) {
        log(unresolved.length, "images unresolved, trying lazy load...");
        if (window.MessageBridge?.sendToContentScript) {
          try {
            await window.MessageBridge.sendToContentScript(
              "ensureFlowTilesLoaded",
              {
                purpose: "identity",
                targetFileNames: unresolved
                  .map((image) => image.file_name || image.id)
                  .filter(Boolean),
              },
            );
          } catch (e) {
            log("ensureFlowTilesLoaded failed:", e.message);
          }
        }
        window.TileCache?.clearFailed();
        const retry = window.TileResolver.batchResolve(unresolved);
        for (const [id, tileId] of retry.results) {
          results2.set(id, tileId);
        }
        log("After retry:", retry.results.size, "more resolved");
      }
      return results2;
    }
    log("TileResolver not available, using legacy correctFileIds");
    const idToUrlMap = {};
    const fileNameMap = {};
    for (const img of images) {
      if (img.thumbnail_url) idToUrlMap[img.id] = img.thumbnail_url;
      if (img.file_name) fileNameMap[img.id] = img.file_name;
    }
    const { correctedIds, changed } = await correctFileIds(
      images.map((i) => i.id).join(", "),
      idToUrlMap,
      fileNameMap,
    );
    if (!changed) {
      return new Map();
    }
    const correctedList = correctedIds
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const results = new Map();
    for (let i = 0; i < images.length && i < correctedList.length; i++) {
      if (images[i].id !== correctedList[i]) {
        results.set(images[i].id, correctedList[i]);
      }
    }
    return results;
  }
  async function resolveFileIdsString(fileIdsStr, thumbnailMap, fileNameMap) {
    if (!fileIdsStr) return fileIdsStr;
    const ids = fileIdsStr
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) return fileIdsStr;
    const images = ids
      .filter((id) => !id.startsWith("upload_"))
      .map((id) => ({
        id,
        file_name: fileNameMap?.[id] || null,
        thumbnail_url: thumbnailMap?.[id] || null,
      }))
      .filter((img) => img.file_name || img.thumbnail_url);
    if (images.length === 0) {
      return fileIdsStr;
    }
    const results = await batchResolveRefImages(images);
    if (results.size === 0) {
      return fileIdsStr;
    }
    const correctedIds = ids.map((id) => results.get(id) || id);
    return correctedIds.join(", ");
  }
  window.uploadPendingFiles = uploadPendingFiles;
  window.correctFileIds = correctFileIds;
  window.reuploadMissingFiles = reuploadMissingFiles;
  window.batchResolveRefImages = batchResolveRefImages;
  window.resolveFileIdsString = resolveFileIdsString;
})();
