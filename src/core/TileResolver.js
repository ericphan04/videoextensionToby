class TileResolver {
  static extractIdentifiers(tile) {
    const persistentMediaId = window._getPersistentMediaId?.(tile) || "";
    const nativeMedia =
      tile.getAttribute?.("data-media-id") ||
      tile.querySelector?.("[data-media-id]")?.getAttribute("data-media-id") ||
      "";
    const tileId =
      window._getTileRuntimeId?.(tile) || tile.dataset.tileId || nativeMedia;
    const link = tile.querySelector('a[href*="/project/"]');
    const linkMatch = link?.href?.match(
      /\/project\/[a-f0-9-]+\/edit\/([a-f0-9-]+)/,
    );
    const fileId = linkMatch?.[1] || null;
    const redirectUrl = tile.dataset.redirectUrl || "";
    const fileNameMatch = redirectUrl.match(/name=([a-f0-9-]{36})/i);
    const fileName =
      persistentMediaId || fileNameMatch?.[1] || nativeMedia || null;
    const rawThumbUrl = window.extractThumbnailUrl?.(tile) || "";
    const thumbnailUrl = this.normalizeUrl(rawThumbUrl);
    return { tileId, fileId, fileName, thumbnailUrl };
  }
  static normalizeUrl(url) {
    if (!url) return null;
    if (typeof url === "object") url = url.thumbnail || "";
    if (typeof url !== "string" || !url) return null;
    const baseUrl = url.split("=")[0];
    if (baseUrl.includes("googleusercontent.com") || baseUrl.includes("lh3.")) {
      return baseUrl;
    }
    return url;
  }
  static getPrimaryKey(imageData) {
    if (imageData.file_id) {
      return { type: "file_id", value: imageData.file_id };
    }
    if (imageData.file_name) {
      return { type: "file_name", value: imageData.file_name };
    }
    if (imageData.thumbnail_url) {
      return {
        type: "thumbnail_url",
        value: this.normalizeUrl(imageData.thumbnail_url),
      };
    }
    return null;
  }
  static batchResolve(images) {
    if (!images || images.length === 0) {
      return { results: new Map(), unresolved: [] };
    }
    const results = new Map();
    const needsResolve = [];
    for (const img of images) {
      const native =
        window._getObservedFlowMediaMetadata?.(
          img.media_uuid || img.file_id || img.id,
        ) || window._getObservedFlowMediaMetadata?.(img.file_name);
      if (native) {
        const tile =
          window._getTileById?.(native.media_uuid) ||
          window._getTileById?.(native.persistent_media_id);
        const runtimeId = tile && this.extractIdentifiers(tile).tileId;
        if (runtimeId) results.set(img.id, runtimeId);
        else needsResolve.push(img);
        continue;
      }
      if (img.file_id) {
        const cachedByFileId = window.TileCache?.getByFileId(img.file_id);
        if (cachedByFileId) {
          results.set(img.id, cachedByFileId);
          continue;
        }
      }
      const key = this.getPrimaryKey(img);
      if (!key) {
        needsResolve.push(img);
        continue;
      }
      const cachedTileId =
        key.type === "file_id"
          ? window.TileCache?.getByFileId(key.value)
          : window.TileCache?.get(key.value);
      if (cachedTileId) {
        results.set(img.id, cachedTileId);
      } else {
        needsResolve.push(img);
      }
    }
    if (needsResolve.length === 0) {
      return { results, unresolved: [] };
    }
    if (!window.TileCache?.shouldScan()) {
      console.log("[TileResolver] Skipping scan (rate limited)");
      return { results, unresolved: needsResolve };
    }
    const byFileId = new Map();
    const byFileName = new Map();
    const byThumbUrl = new Map();
    for (const img of needsResolve) {
      if (img.file_id) {
        byFileId.set(img.file_id, img);
      }
      if (img.file_name) {
        byFileName.set(img.file_name, img);
      }
      if (img.thumbnail_url) {
        const normalizedUrl = this.normalizeUrl(img.thumbnail_url);
        if (normalizedUrl) {
          byThumbUrl.set(normalizedUrl, img);
        }
      }
    }
    const tileSelector = window._getTileSelectorString?.();
    if (!tileSelector) {
      console.warn(
        "[TileResolver] tile_container profile missing \u2014 fail closed",
      );
      return { results, unresolved: needsResolve };
    }
    const tiles = document.querySelectorAll(tileSelector);
    for (const tile of tiles) {
      const { tileId, fileId, fileName, thumbnailUrl } =
        this.extractIdentifiers(tile);
      if (!tileId) continue;
      if (fileId && byFileId.has(fileId)) {
        const img = byFileId.get(fileId);
        results.set(img.id, tileId);
        window.TileCache?.setByFileId(fileId, tileId);
        if (fileName) window.TileCache?.set(fileName, tileId);
        if (thumbnailUrl) window.TileCache?.set(thumbnailUrl, tileId);
        byFileId.delete(fileId);
        if (img.file_name) byFileName.delete(img.file_name);
        if (img.thumbnail_url)
          byThumbUrl.delete(this.normalizeUrl(img.thumbnail_url));
      } else if (fileName && byFileName.has(fileName)) {
        const img = byFileName.get(fileName);
        results.set(img.id, tileId);
        window.TileCache?.set(fileName, tileId);
        if (fileId) window.TileCache?.setByFileId(fileId, tileId);
        byFileName.delete(fileName);
      } else if (thumbnailUrl && byThumbUrl.has(thumbnailUrl)) {
        const img = byThumbUrl.get(thumbnailUrl);
        if (!results.has(img.id)) {
          results.set(img.id, tileId);
          window.TileCache?.set(thumbnailUrl, tileId);
          if (fileId) window.TileCache?.setByFileId(fileId, tileId);
        }
        byThumbUrl.delete(thumbnailUrl);
      }
      if (fileId) {
        window.TileCache?.setByFileId(fileId, tileId);
      }
      if (
        byFileId.size === 0 &&
        byFileName.size === 0 &&
        byThumbUrl.size === 0
      ) {
        break;
      }
    }
    window.TileCache?.markScanned();
    const unresolved = needsResolve.filter((img) => !results.has(img.id));
    for (const img of unresolved) {
      const key = this.getPrimaryKey(img);
      if (key) {
        window.TileCache?.markFailed(key.value);
      }
    }
    console.log(
      `[TileResolver] Batch resolved: ${results.size}/${images.length}, unresolved: ${unresolved.length}`,
    );
    return { results, unresolved };
  }
  static resolveOne(imageData) {
    const { results } = this.batchResolve([imageData]);
    return results.get(imageData.id) || null;
  }
  static scanAll() {
    const tileSelector = window._getTileSelectorString?.();
    if (!tileSelector) {
      console.warn(
        "[TileResolver] tile_container profile missing \u2014 fail closed",
      );
      return [];
    }
    const tiles = document.querySelectorAll(tileSelector);
    const results = [];
    for (const tile of tiles) {
      const identifiers = this.extractIdentifiers(tile);
      if (identifiers.tileId) {
        results.push(identifiers);
      }
    }
    window.TileCache?.markScanned();
    console.log(`[TileResolver] Full scan: ${results.length} tiles`);
    return results;
  }
  static rebuildCache() {
    window.TileCache?.clear();
    const tiles = this.scanAll();
    for (const { tileId, fileId, fileName, thumbnailUrl } of tiles) {
      if (fileId) {
        window.TileCache?.setByFileId(fileId, tileId);
      }
      if (fileName) {
        window.TileCache?.set(fileName, tileId);
      }
      if (thumbnailUrl) {
        window.TileCache?.set(thumbnailUrl, tileId);
      }
    }
    console.log(
      `[TileResolver] Cache rebuilt: ${window.TileCache?.getStats().cached || 0} entries`,
    );
  }
  static extractFileName(redirectUrl) {
    if (!redirectUrl) return null;
    const match = redirectUrl.match(/name=([a-f0-9-]{36})/i);
    return match?.[1] || null;
  }
  static getTileElement(imageData) {
    const tileId = this.resolveOne({ id: "temp", ...imageData });
    if (!tileId) return null;
    const selector = window._getTileSelectorString?.();
    if (!selector) return null;
    for (const tile of document.querySelectorAll(selector)) {
      if ((window._getTileRuntimeId?.(tile) || tile.dataset?.tileId) === tileId)
        return tile;
    }
    return null;
  }
}
window.TileResolver = TileResolver;
