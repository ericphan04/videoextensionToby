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
class MentionParser {
  static parseMentions(prompt) {
    if (!prompt || typeof prompt !== "string") return [];
    const mentions = [];
    let match;
    const regex = new RegExp(this.MENTION_REGEX.source, "g");
    while ((match = regex.exec(prompt)) !== null) {
      mentions.push({
        fullMatch: match[0],
        imageName: match[1],
        index: match.index,
      });
    }
    return mentions;
  }
  static parseComponents(prompt) {
    if (!prompt || typeof prompt !== "string") return [];
    const out = [];
    const regex = new RegExp(this.COMPONENT_REGEX.source, "g");
    let m;
    while ((m = regex.exec(prompt)) !== null) {
      let raw = m[2];
      let fullMatch = m[0];
      let name;
      if (raw.startsWith("[") && raw.endsWith("]")) {
        name = raw.slice(1, -1).trim();
      } else {
        const trimmed = raw.replace(/[.,;!?"')\]]+$/, "");
        fullMatch = fullMatch.slice(
          0,
          fullMatch.length - (raw.length - trimmed.length),
        );
        name = trimmed;
      }
      if (!name) continue;
      out.push({ type: m[1], name, index: m.index, fullMatch });
    }
    return out;
  }
  static hasComponents(prompt) {
    return this.parseComponents(prompt).length > 0;
  }
  static stripComponents(prompt, types = null) {
    let comps = this.parseComponents(prompt);
    if (Array.isArray(types))
      comps = comps.filter((c) => types.includes(c.type));
    if (comps.length === 0) return prompt || "";
    let out = "";
    let cursor = 0;
    for (const c of comps) {
      out += prompt.slice(cursor, c.index);
      cursor = c.index + c.fullMatch.length;
    }
    out += prompt.slice(cursor);
    return out.replace(/[ \t]{2,}/g, " ").trim();
  }
  static splitByComponents(prompt) {
    if (!prompt || typeof prompt !== "string") return [];
    const comps = this.parseComponents(prompt);
    if (comps.length === 0) return [{ text: prompt }];
    const segments = [];
    let cursor = 0;
    for (const c of comps) {
      if (c.index > cursor) {
        const text = prompt.slice(cursor, c.index);
        if (text.trim()) segments.push({ text });
      }
      segments.push(
        c.type === "voice"
          ? { voice: c.name, literal: c.fullMatch }
          : { char: c.name, literal: c.fullMatch },
      );
      cursor = c.index + c.fullMatch.length;
    }
    const tail = prompt.slice(cursor);
    if (tail.trim()) segments.push({ text: tail });
    return segments;
  }
  static cleanPrompt(prompt) {
    if (!prompt || typeof prompt !== "string") return "";
    return prompt.replace(this.MENTION_REGEX, "").trim().replace(/\s+/g, " ");
  }
  static resolveMentions(mentions) {
    if (!window.imageNameRegistry) {
      console.warn(
        "[MentionParser] ImageNameRegistry ch\u01B0a kh\u1EDFi t\u1EA1o",
      );
      return mentions.map((m) => ({
        mention: m,
        imageData: null,
        found: false,
      }));
    }
    return mentions.map((mention) => {
      const imageData = this.lookupImageMention(mention.imageName);
      return { mention, imageData, found: !!imageData };
    });
  }
  static lookupImageMention(name) {
    const registry = window.imageNameRegistry;
    if (!registry || typeof name !== "string") return null;
    const exact = registry.lookup(name);
    if (exact) return exact;
    return name.startsWith("[") && name.endsWith("]")
      ? registry.lookup(name.slice(1, -1))
      : null;
  }
  static processMultiPrompts(prompts) {
    if (!prompts || !Array.isArray(prompts)) return [];
    return prompts.map((prompt) => {
      const mentions = this.parseMentions(prompt);
      const resolved = this.resolveMentions(mentions);
      const cleanedPrompt = this.cleanPrompt(prompt);
      const refImages = resolved.filter((r) => r.found).map((r) => r.imageData);
      return {
        originalPrompt: prompt,
        cleanedPrompt,
        mentions: resolved,
        refImages,
        hasUnresolvedMentions: resolved.some((r) => !r.found),
      };
    });
  }
  static processPrompt(prompt) {
    const results = this.processMultiPrompts([prompt]);
    return (
      results[0] || {
        originalPrompt: prompt || "",
        cleanedPrompt: "",
        mentions: [],
        refImages: [],
        hasUnresolvedMentions: false,
      }
    );
  }
  static async uploadPendingImages(processedPrompts, options = {}) {
    if (!processedPrompts || !Array.isArray(processedPrompts)) {
      return processedPrompts;
    }
    const imagesToUpload = new Map();
    const pendingRefs = [];
    for (const pp of processedPrompts) {
      if (!pp.refImages || !Array.isArray(pp.refImages)) continue;
      for (const ref of pp.refImages) {
        if (
          (ref.type === "upload" ||
            ref.type === "capture" ||
            ref.source === "album") &&
          ref.blob_key &&
          (!ref.file_id || ref.file_id.startsWith("upload_"))
        ) {
          if (!imagesToUpload.has(ref.blob_key)) {
            imagesToUpload.set(ref.blob_key, { ref, imageData: ref });
          }
        } else if (
          ref.file_id &&
          ref.file_id.startsWith("upload_") &&
          !ref.blob_key
        ) {
          if (!ref._pendingUploadKey) {
            ref._pendingUploadKey = ref.file_id;
          }
          pendingRefs.push(ref);
        }
      }
    }
    if (imagesToUpload.size === 0 && pendingRefs.length === 0) {
      console.log("[MentionParser] uploadPendingImages: No images to upload");
      return processedPrompts;
    }
    const uploadResults = new Map();
    const uploadPromises = [];
    let mentionFlowActivation = null;
    if (imagesToUpload.size > 0) {
      console.log(
        `[MentionParser] Chu\u1EA9n b\u1ECB upload ${imagesToUpload.size} \u1EA3nh t\u1EEB album...`,
      );
      if (window.ImmediateUploader) {
        try {
          mentionFlowActivation =
            await window.ImmediateUploader._ensureFlowTabReady();
          if (!mentionFlowActivation?.isOpen) {
            console.warn(
              "[MentionParser] Flow tab kh\xF4ng m\u1EDF, skip album image upload",
            );
            imagesToUpload.clear();
          }
        } catch (e) {
          console.warn(
            "[MentionParser] Kh\xF4ng th\u1EC3 ki\u1EC3m tra Flow tab:",
            e.message,
          );
        }
      }
    }
    for (const [blobKey, { ref, imageData }] of imagesToUpload) {
      uploadPromises.push(
        this._uploadImage(imageData)
          .then((fileId) => {
            if (fileId) {
              uploadResults.set(blobKey, {
                tileId: fileId,
                file_name: imageData._uploadedFileName || null,
                thumbnail_url: imageData._uploadedThumbnailUrl || null,
                media_uuid: imageData._uploadedMediaUuid || null,
                persistent_media_id:
                  imageData._uploadedPersistentMediaId || null,
                video_url: imageData._uploadedVideoUrl || null,
                type: imageData._uploadedMediaType || null,
              });
              console.log(
                `[MentionParser] \u0110\xE3 upload: ${imageData.name} \u2192 ${fileId}` +
                  (imageData._uploadedFileName
                    ? ` (file_name: ${imageData._uploadedFileName.substring(0, 12)}...)`
                    : ""),
              );
            }
          })
          .catch((err) => {
            console.error(
              `[MentionParser] L\u1ED7i upload ${imageData.name}:`,
              err.message || err,
            );
          }),
      );
    }
    await Promise.all(uploadPromises);
    if (uploadResults.size > 0) {
      for (const pp of processedPrompts) {
        if (!pp.refImages) continue;
        for (const ref of pp.refImages) {
          if (ref.blob_key && uploadResults.has(ref.blob_key)) {
            const uploadResult = uploadResults.get(ref.blob_key);
            ref.file_id = uploadResult.tileId;
            if (uploadResult.file_name) ref.file_name = uploadResult.file_name;
            if (uploadResult.thumbnail_url)
              ref.thumbnail_url = uploadResult.thumbnail_url;
            if (uploadResult.media_uuid)
              ref.media_uuid = uploadResult.media_uuid;
            if (uploadResult.persistent_media_id)
              ref.persistent_media_id = uploadResult.persistent_media_id;
            if (uploadResult.video_url) ref.video_url = uploadResult.video_url;
            if (uploadResult.type) ref.media_type = uploadResult.type;
          }
        }
      }
      if (window.imageNameRegistry) {
        for (const pp of processedPrompts) {
          if (!pp.refImages) continue;
          for (const ref of pp.refImages) {
            if (
              ref.name &&
              ref.file_id &&
              window.imageNameRegistry.has(ref.name)
            ) {
              const existing = window.imageNameRegistry.lookup(ref.name);
              if (existing) {
                if (!existing.file_id) existing.file_id = ref.file_id;
                if (ref.file_name && !existing.file_name)
                  existing.file_name = ref.file_name;
              }
            }
          }
        }
      }
      console.log(
        `[MentionParser] Upload ho\xE0n t\u1EA5t: ${uploadResults.size}/${imagesToUpload.size} th\xE0nh c\xF4ng`,
      );
    }
    const pendingRefsToUpload = pendingRefs.filter((ref) =>
      ref.file_id?.startsWith("upload_"),
    );
    if (
      pendingRefsToUpload.length > 0 &&
      typeof window.uploadPendingFiles === "function"
    ) {
      console.log(
        `[MentionParser] Uploading ${pendingRefsToUpload.length} pending files...`,
      );
      const pendingKeys = [];
      const seenKeys = new Set();
      for (const ref of pendingRefsToUpload) {
        if (!seenKeys.has(ref._pendingUploadKey)) {
          pendingKeys.push(ref._pendingUploadKey);
          seenKeys.add(ref._pendingUploadKey);
        }
      }
      const pendingIdsStr = pendingKeys.join(", ");
      try {
        const uploadedStr = await window.uploadPendingFiles(pendingIdsStr, {
          surface: options.surface || "gen",
          abortFn: options.abortFn,
          onProgress: options.onProgress,
          onError: options.onError,
        });
        console.log(
          `[MentionParser] uploadPendingFiles returned: "${uploadedStr}"`,
        );
        const uploadedIds = uploadedStr
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const keyToNewId = new Map();
        const uploadMapping = window._lastUploadKeyMapping || {};
        for (const pendingKey of pendingKeys) {
          const newId =
            uploadMapping[pendingKey] ||
            (uploadedIds.includes(pendingKey) ? pendingKey : null);
          if (newId && !newId.startsWith("upload_")) {
            keyToNewId.set(pendingKey, newId);
            console.log(
              `[MentionParser] Mapped: ${pendingKey} \u2192 ${newId.substring(0, 25)}...`,
            );
          }
        }
        for (const ref of pendingRefsToUpload) {
          const newId = keyToNewId.get(ref._pendingUploadKey);
          if (newId) {
            ref.file_id = newId;
            console.log(
              `[MentionParser] Updated ref "${ref.name}": file_id = ${newId.substring(0, 25)}...`,
            );
          } else {
            console.warn(
              `[MentionParser] No mapping found for ref "${ref.name}" (${ref._pendingUploadKey})`,
            );
          }
        }
      } catch (err) {
        console.error(
          "[MentionParser] Pending upload failed:",
          err.message || err,
        );
      }
    }
    return processedPrompts;
  }
  static async _uploadImage(imageData, maxRetries = 2) {
    if (!imageData.blob_key) {
      console.warn("[MentionParser] Kh\xF4ng c\xF3 blob_key:", imageData.name);
      return null;
    }
    let blob = null;
    if (window.ImageStore) {
      blob = await window.ImageStore.getFullBlob(imageData.blob_key);
    }
    if (!blob) {
      console.warn(
        "[MentionParser] Kh\xF4ng t\xECm th\u1EA5y blob:",
        imageData.blob_key,
      );
      return null;
    }
    const fileName =
      imageData.original_name || imageData.name || "album_image.png";
    const file = new File([blob], fileName, { type: blob.type || "image/png" });
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const tileId = await this._doUpload(file, imageData);
        if (tileId) return tileId;
        return null;
      } catch (err) {
        lastError = err;
        const isNetworkError =
          !err.httpStatus &&
          (err.message?.includes("network") ||
            err.message?.includes("Failed to fetch") ||
            err.message?.includes("Network") ||
            err.message?.includes("timeout") ||
            err.name === "TypeError");
        if (!isNetworkError || attempt >= maxRetries) {
          console.error(
            `[MentionParser] L\u1ED7i upload \u1EA3nh (attempt ${attempt + 1}/${maxRetries + 1}):`,
            err.message || err,
          );
          return null;
        }
        const delay = Math.min(500 * Math.pow(2, attempt), 2e3);
        console.warn(
          `[MentionParser] Upload failed, retry ${attempt + 1}/${maxRetries} in ${delay}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    return null;
  }
  static async _doUpload(file, imageData) {
    if (window.MessageBridge) {
      let arrayBuffer = await file.arrayBuffer();
      let base64 = this._arrayBufferToBase64(arrayBuffer);
      const payload = [{ name: file.name, type: file.type, base64 }];
      const uploadPromise = window.MessageBridge.uploadFilesToFlow(payload);
      payload[0].base64 = "";
      base64 = null;
      arrayBuffer = null;
      const result = await uploadPromise;
      if (result?.tileIds?.length > 0) {
        const tileId = result.tileIds[0];
        const detail = result.tileDetails?.[0];
        if (detail) {
          if (detail.file_name) imageData._uploadedFileName = detail.file_name;
          if (detail.thumbnailUrl)
            imageData._uploadedThumbnailUrl = detail.thumbnailUrl;
        }
        imageData._uploadedMediaUuid =
          [detail?.media_uuid, detail?.file_id, detail?.file_name, tileId].find(
            (value) =>
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                String(value || ""),
              ),
          ) || null;
        imageData._uploadedPersistentMediaId =
          detail?.persistent_media_id || null;
        imageData._uploadedVideoUrl =
          detail?.video_url && !detail.video_url.startsWith("blob:")
            ? detail.video_url
            : null;
        imageData._uploadedMediaType = file.type?.startsWith("video/")
          ? "video"
          : detail?.type || "image";
        window.MediaRegistry?.auditRefIdentity?.(
          "upload:completed",
          [
            {
              tile_id: tileId,
              media_uuid: imageData._uploadedMediaUuid,
              file_name: imageData._uploadedFileName,
              persistent_media_id: imageData._uploadedPersistentMediaId,
              type: imageData._uploadedMediaType,
              thumbnail: imageData._uploadedThumbnailUrl,
              video_url: imageData._uploadedVideoUrl,
            },
          ],
          { surface: "mention-upload" },
        );
        if (window.PendingUploadStore) {
          await window.PendingUploadStore.cacheUploaded(tileId, file);
        } else if (window.uploadedFileCache) {
          window.uploadedFileCache.set(tileId, { file });
        }
        if (window.ImageStore && imageData.id) {
          try {
            const image = await window.ImageStore.getImage(imageData.id);
            if (image) {
              image.file_id = tileId;
              const db = await window.ImageStore._getDB();
              await new Promise((resolve, reject) => {
                const tx = db.transaction("album_images", "readwrite");
                tx.objectStore("album_images").put(image);
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
              });
            }
          } catch (e) {
            console.warn(
              "[MentionParser] Kh\xF4ng th\u1EC3 c\u1EADp nh\u1EADt ImageStore:",
              e.message,
            );
          }
        }
        return tileId;
      }
      if (result?.warning) {
        console.warn("[MentionParser] Upload warning:", result.warning);
      }
      return null;
    }
    const uploadFn =
      typeof performFlowImageUpload === "function"
        ? performFlowImageUpload
        : window.performFlowImageUpload;
    if (uploadFn) {
      const dummyBtn = document.createElement("button");
      dummyBtn.style.display = "none";
      document.body.appendChild(dummyBtn);
      try {
        const uploadedIds = await uploadFn([file], dummyBtn);
        if (uploadedIds?.length > 0) {
          return uploadedIds[0];
        }
      } finally {
        dummyBtn.remove();
      }
    } else {
      console.warn(
        "[MentionParser] Kh\xF4ng c\xF3 ph\u01B0\u01A1ng th\u1EE9c upload kh\u1EA3 d\u1EE5ng",
      );
    }
    return null;
  }
  static _arrayBufferToBase64(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
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
  static hasMentions(prompt) {
    if (!prompt || typeof prompt !== "string") return false;
    const regex = new RegExp(this.MENTION_REGEX.source, "g");
    return regex.test(prompt);
  }
  static getUnresolvedMentions(prompt) {
    const mentions = this.parseMentions(prompt);
    const resolved = this.resolveMentions(mentions);
    return resolved.filter((r) => !r.found).map((r) => r.mention.imageName);
  }
  static getResolvedImages(prompt) {
    const mentions = this.parseMentions(prompt);
    const resolved = this.resolveMentions(mentions);
    return resolved.filter((r) => r.found).map((r) => r.imageData);
  }
  static highlightMentions(prompt) {
    if (!prompt || typeof prompt !== "string") return "";
    return prompt.replace(this.MENTION_REGEX, (match, name) => {
      const found = !!this.lookupImageMention(name);
      const className = found
        ? "mention mention-found"
        : "mention mention-not-found";
      return `<span class="${className}">${match}</span>`;
    });
  }
  static extractUniqueNames(prompt) {
    const mentions = this.parseMentions(prompt);
    const names = mentions.map((m) => m.imageName.toLowerCase());
    return [...new Set(names)];
  }
  static countMentions(prompt) {
    const mentions = this.parseMentions(prompt);
    return mentions.length;
  }
  static async batchResolveFileIds(processedPrompts) {
    if (!processedPrompts || !Array.isArray(processedPrompts)) {
      return { resolved: 0, unresolved: [] };
    }
    const imagesToResolve = [];
    const seenIds = new Set();
    for (const pp of processedPrompts) {
      if (!pp.refImages) continue;
      for (const ref of pp.refImages) {
        if (ref.file_id) continue;
        if (!ref.file_name && !ref.thumbnail_url) continue;
        const key =
          ref.id || ref.blob_key || `${ref.file_name}_${ref.thumbnail_url}`;
        if (seenIds.has(key)) continue;
        seenIds.add(key);
        imagesToResolve.push({
          id: key,
          file_name: ref.file_name,
          thumbnail_url: ref.thumbnail_url,
          _ref: ref,
        });
      }
    }
    if (imagesToResolve.length === 0) {
      return { resolved: 0, unresolved: [] };
    }
    console.log(
      `[MentionParser] Batch resolving ${imagesToResolve.length} images...`,
    );
    if (!window.TileResolver) {
      console.warn("[MentionParser] TileResolver not available");
      return { resolved: 0, unresolved: imagesToResolve.map((i) => i._ref) };
    }
    const { results, unresolved } =
      window.TileResolver.batchResolve(imagesToResolve);
    for (const img of imagesToResolve) {
      const tileId = results.get(img.id);
      if (tileId && img._ref) {
        img._ref.file_id = tileId;
      }
    }
    if (unresolved.length > 0) {
      console.log(
        `[MentionParser] ${unresolved.length} images unresolved, trying lazy load...`,
      );
      let scanFound = {};
      const namedUnresolved = unresolved.filter((image) => !!image.file_name);
      if (
        namedUnresolved.length > 0 &&
        window.MessageBridge?.sendToContentScript
      ) {
        try {
          const scan = await window.MessageBridge.sendToContentScript(
            "ensureFlowTilesLoaded",
            {
              force: true,
              targetFileNames: [
                ...new Set(namedUnresolved.map((image) => image.file_name)),
              ],
            },
          );
          scanFound = scan?.found || {};
          for (const image of namedUnresolved) {
            const tileId = scanFound[image.file_name];
            if (!tileId) continue;
            results.set(image.id, tileId);
            if (image._ref) image._ref.file_id = tileId;
          }
        } catch (error) {
          console.warn(
            "[MentionParser] Targeted Flow scan failed:",
            error?.message || error,
          );
        }
      }
      window.TileCache?.clearFailed();
      const remaining = unresolved.filter((image) => !results.has(image.id));
      const retry = window.TileResolver.batchResolve(remaining);
      for (const img of unresolved) {
        const tileId = retry.results.get(img.id);
        if (tileId && img._ref) {
          img._ref.file_id = tileId;
        }
      }
      const finalUnresolved = retry.unresolved.map((i) => i._ref);
      console.log(
        `[MentionParser] After retry: ${retry.results.size} more resolved, ${finalUnresolved.length} still unresolved`,
      );
      return {
        resolved: results.size + retry.results.size,
        unresolved: finalUnresolved,
      };
    }
    console.log(
      `[MentionParser] Batch resolved: ${results.size}/${imagesToResolve.length}`,
    );
    return { resolved: results.size, unresolved: [] };
  }
  static async uploadPendingImagesBatch(processedPrompts, options = {}) {
    if (!processedPrompts || !Array.isArray(processedPrompts)) {
      return processedPrompts;
    }
    try {
      await this.batchResolveFileIds(processedPrompts);
    } catch (err) {
      console.warn("[MentionParser] batchResolveFileIds failed:", err.message);
    }
    let hasLocalUploads = false;
    for (const pp of processedPrompts) {
      if (!pp.refImages) continue;
      for (const ref of pp.refImages) {
        if (ref.file_id?.startsWith("upload_")) {
          hasLocalUploads = true;
          break;
        }
      }
      if (hasLocalUploads) break;
    }
    if (!hasLocalUploads) {
      console.log(
        "[MentionParser] uploadPendingImagesBatch: No local uploads need processing",
      );
      return processedPrompts;
    }
    console.log(
      "[MentionParser] uploadPendingImagesBatch: Using uploadPendingImages for local uploads",
    );
    return this.uploadPendingImages(processedPrompts, options);
  }
}
__publicField(
  MentionParser,
  "MENTION_REGEX",
  /@(\[[^\]]+\]|[a-zA-Z0-9_]+)(?![a-zA-Z0-9_:])/g,
);
__publicField(
  MentionParser,
  "COMPONENT_REGEX",
  /@(voice|char):(\[[^\]]+\]|[^\s]+)/g,
);
window.MentionParser = MentionParser;
