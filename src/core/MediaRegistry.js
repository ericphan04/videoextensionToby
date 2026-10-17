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
class MediaRegistry {
  static refFileNamesMatch(expected, observed, tileId, ...records) {
    if (!expected || !observed || expected === observed) return true;
    const isUuid = (value) => this.describeIdentity(value).kind === "uuid";
    const isAsb = (value) => this.describeIdentity(value).kind === "asb";
    const normalize = (value) =>
      isUuid(value) ? String(value).toLowerCase() : value;
    if (isUuid(expected) && isUuid(observed))
      return normalize(expected) === normalize(observed);
    const aliasesByUuid = new Map();
    for (const record of records) {
      if (!record || typeof record !== "object" || !isUuid(record.media_uuid))
        continue;
      const uuid = normalize(record.media_uuid);
      const aliases = aliasesByUuid.get(uuid) || new Set([uuid]);
      for (const alias of [
        record.persistent_media_id,
        record.file_name,
        ...(Array.isArray(record.identity_aliases)
          ? record.identity_aliases
          : []),
      ]) {
        if (isAsb(alias) || (isUuid(alias) && normalize(alias) === uuid))
          aliases.add(normalize(alias));
      }
      aliasesByUuid.set(uuid, aliases);
    }
    if (aliasesByUuid.size > 1) return false;
    for (const [uuid, aliases] of aliasesByUuid) {
      if (isUuid(tileId) && normalize(tileId) !== uuid) continue;
      if (isAsb(tileId) && !aliases.has(tileId)) continue;
      if (aliases.has(normalize(expected)) && aliases.has(normalize(observed)))
        return true;
    }
    return false;
  }
  static describeIdentity(value) {
    const text = String(value || "");
    if (!text) return { kind: "missing" };
    let hash = 2166136261;
    for (const char of text) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    const fingerprint = (hash >>> 0).toString(16).padStart(8, "0");
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        text,
      );
    const asb = /^[A-Za-z0-9_-]{32,1024}$/.test(text) && !uuid;
    return {
      kind: uuid
        ? "uuid"
        : asb
          ? "asb"
          : text.startsWith("upload_")
            ? "pending_upload"
            : "other",
      length: text.length,
      fingerprint,
    };
  }
  static shouldKeepPlaybackUrl(record, info) {
    if (
      info?.playback_url_source !== "configured_transform" ||
      !record?.video_url ||
      (record.media_uuid &&
        info.media_uuid &&
        record.media_uuid.toLowerCase() !== info.media_uuid.toLowerCase())
    )
      return false;
    try {
      const url = new URL(record.video_url);
      return (
        url.origin === "https://flow.google.com" &&
        url.pathname.split("=")[0] === `/asb/${info.persistent_media_id}`
      );
    } catch (_) {
      return false;
    }
  }
  static auditRefIdentity(stage, records = [], context = {}) {
    const uuid = (value) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        String(value || ""),
      );
    const identity = (value) => this.describeIdentity(value);
    const items = records.slice(0, 32).map((record) => {
      const id =
        record?.fileId ||
        record?.file_id ||
        record?.tile_id ||
        record?.id ||
        "";
      const thumb = record?.thumbnail || record?.thumbnail_url || "";
      const source =
        typeof thumb === "object"
          ? thumb.thumbnail || thumb.video_url || ""
          : thumb;
      return {
        id: identity(id),
        mediaUuid: uuid(record?.media_uuid)
          ? identity(record.media_uuid)
          : null,
        persistent: identity(record?.persistent_media_id || record?.file_name),
        thumbnailIdentity: identity(source),
        type:
          record?.type === "video"
            ? "video"
            : record?.type === "image"
              ? "image"
              : null,
        source: ["flow", "existing", "upload", "album"].includes(record?.source)
          ? record.source
          : null,
        hasVideoUrl: !!record?.video_url,
      };
    });
    const report = {
      stage,
      surface: context.surface || null,
      nodeId: context.nodeId || null,
      count: records.length,
      omitted: Math.max(0, records.length - 32),
      items,
    };
    console.info("[FlowRefIdentityAudit]", JSON.stringify(report));
    return report;
  }
  static applyRefIdentityCorrection(
    owner,
    before,
    after,
    metadata = {},
    context = {},
  ) {
    const oldIds = String(before || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const newIds = String(after || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (!owner || oldIds.length !== newIds.length) return false;
    const fields = context.fields || ["ref_thumbnails", "ref_file_names"];
    const uuid = (value) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        String(value || ""),
      );
    for (const field of fields) {
      const current = owner[field];
      if (current && (typeof current !== "object" || Array.isArray(current)))
        continue;
      const next = { ...(current || {}) };
      for (let index = 0; index < oldIds.length; index++) {
        if (oldIds[index] !== newIds[index]) delete next[oldIds[index]];
      }
      for (let index = 0; index < oldIds.length; index++) {
        const oldId = oldIds[index],
          newId = newIds[index];
        const value = current?.[oldId];
        const info =
          metadata?.[oldId] ||
          this.getRefIdentity(oldId) ||
          this.getRefIdentity(newId);
        if (field.endsWith("file_names")) {
          if (value !== void 0) next[newId] = value;
          if (info?.file_name) next[newId] = info.file_name;
          continue;
        }
        if (value === void 0 && !info) continue;
        if (
          !info &&
          !(
            uuid(oldId) &&
            /^[A-Za-z0-9_-]{32,1024}$/.test(newId) &&
            !uuid(newId)
          )
        ) {
          next[newId] = value;
          continue;
        }
        const record =
          typeof value === "string"
            ? { thumbnail: value }
            : { ...(value || {}) };
        const mediaUuid = [info?.media_uuid, record.media_uuid, oldId].find(
          uuid,
        );
        const keepServingUrl = (value2) => {
          if (
            this.describeIdentity(info?.persistent_media_id).kind !== "asb" ||
            !mediaUuid
          )
            return false;
          try {
            const url = new URL(value2);
            return (
              url.hostname === "flow-content.google" &&
              ["/image/" + mediaUuid, "/video/" + mediaUuid].includes(
                url.pathname,
              ) &&
              Number(url.searchParams.get("Expires")) * 1e3 > Date.now()
            );
          } catch (_) {
            return false;
          }
        };
        const merged = {
          ...record,
          ...(info || {}),
          ...(mediaUuid && { media_uuid: mediaUuid }),
          ...(keepServingUrl(record.thumbnail) && {
            thumbnail: record.thumbnail,
          }),
          ...((keepServingUrl(record.video_url) ||
            this.shouldKeepPlaybackUrl(record, info)) && {
            video_url: record.video_url,
            ...(record.playback_url_source && {
              playback_url_source: record.playback_url_source,
            }),
          }),
          ...(record.type === "video" && { type: "video" }),
        };
        next[newId] = merged;
      }
      if (Object.keys(next).length) owner[field] = next;
    }
    this.auditRefIdentity(
      "consumer:identity-applied",
      newIds.map((id) => {
        const record =
          owner[fields.find((field) => field.endsWith("thumbnails"))]?.[id];
        return {
          ...(typeof record === "string"
            ? { thumbnail: record }
            : record || {}),
          id,
          file_name:
            owner[fields.find((field) => field.endsWith("file_names"))]?.[id],
        };
      }),
      context,
    );
    return true;
  }
  static setRefIdentity(id, info) {
    if (!id || !info) return;
    const mediaUuid = [info.media_uuid, info.file_id, info.file_name, id].find(
      (value) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          String(value || ""),
        ),
    );
    if (!mediaUuid) return;
    const record = {
      media_uuid: mediaUuid,
      ...(info.file_name && { file_name: info.file_name }),
      ...(info.persistent_media_id && {
        persistent_media_id: info.persistent_media_id,
      }),
      ...(info.identity_kind && { identity_kind: info.identity_kind }),
      ...(info.identity_durability && {
        identity_durability: info.identity_durability,
      }),
      ...(Array.isArray(info.identity_aliases) && {
        identity_aliases: [...new Set(info.identity_aliases.filter(Boolean))],
      }),
      ...(info.type && { type: info.type }),
      ...(info.api_driver && { api_driver: info.api_driver }),
      ...(info.project_id && { project_id: info.project_id }),
      ...(info.protocol_revision && {
        protocol_revision: info.protocol_revision,
      }),
      ...(info.protocol_fingerprint && {
        protocol_fingerprint: info.protocol_fingerprint,
      }),
      ...(info.thumbnail || info.thumbnailUrl || info.thumbnail_url
        ? {
            thumbnail:
              info.thumbnail || info.thumbnailUrl || info.thumbnail_url,
          }
        : {}),
      ...(info.video_url &&
        !String(info.video_url).startsWith("blob:") && {
          video_url: info.video_url,
        }),
    };
    this._refIdentities.delete(id);
    this._refIdentities.set(id, record);
    while (this._refIdentities.size > this._LRU_MAX)
      this._refIdentities.delete(this._refIdentities.keys().next().value);
  }
  static getRefIdentity(id) {
    return this._refIdentities.get(id) || null;
  }
  static _evictIfNeeded(cache, order) {
    if (order.length <= this._LRU_MAX) return order;
    var toRemove = order.splice(0, this._LRU_EVICT);
    for (var i = 0; i < toRemove.length; i++) {
      delete cache[toRemove[i]];
    }
    return order;
  }
  static _touchOrder(order, key) {
    var idx = order.indexOf(key);
    if (idx !== -1) order.splice(idx, 1);
    order.push(key);
    return order;
  }
  static getThumb(id) {
    return this._thumbnails[id];
  }
  static setThumb(id, url) {
    if (id && url) {
      this._thumbnails[id] = url;
      this._thumbOrder = this._touchOrder(this._thumbOrder, id);
      this._thumbOrder = this._evictIfNeeded(
        this._thumbnails,
        this._thumbOrder,
      );
    }
  }
  static deleteThumb(id) {
    delete this._thumbnails[id];
    var idx = this._thumbOrder.indexOf(id);
    if (idx !== -1) this._thumbOrder.splice(idx, 1);
  }
  static getFileName(id) {
    return this._fileNames[id];
  }
  static setFileName(id, fileName) {
    if (id && fileName) {
      this._fileNames[id] = fileName;
      this._fileNameOrder = this._touchOrder(this._fileNameOrder, id);
      this._fileNameOrder = this._evictIfNeeded(
        this._fileNames,
        this._fileNameOrder,
      );
    }
  }
  static deleteFileName(id) {
    delete this._fileNames[id];
    var idx = this._fileNameOrder.indexOf(id);
    if (idx !== -1) this._fileNameOrder.splice(idx, 1);
  }
  static set(id, thumbUrl, fileName) {
    if (thumbUrl) this.setThumb(id, thumbUrl);
    if (fileName) this.setFileName(id, fileName);
  }
  static delete(id) {
    this.deleteThumb(id);
    this.deleteFileName(id);
    this._refIdentities.delete(id);
  }
  static rename(oldId, newId, overrides) {
    if (overrides?.thumbUrl) {
      this.setThumb(newId, overrides.thumbUrl);
    } else if (this._thumbnails[oldId]) {
      this.setThumb(newId, this._thumbnails[oldId]);
    }
    this.deleteThumb(oldId);
    if (overrides?.fileName) {
      this.setFileName(newId, overrides.fileName);
    } else if (this._fileNames[oldId]) {
      this.setFileName(newId, this._fileNames[oldId]);
    }
    this.deleteFileName(oldId);
  }
  static hasThumbnails() {
    return Object.keys(this._thumbnails).length > 0;
  }
  static hasFileNames() {
    return Object.keys(this._fileNames).length > 0;
  }
  static getAllThumbnails() {
    return this._thumbnails;
  }
  static getAllFileNames() {
    return this._fileNames;
  }
  static restoreThumbnails(data) {
    if (data && typeof data === "object") {
      this._thumbnails = data;
      this._thumbOrder = Object.keys(data);
    }
  }
  static restoreFileNames(data) {
    if (data && typeof data === "object") {
      this._fileNames = data;
      this._fileNameOrder = Object.keys(data);
    }
  }
  static get thumbnailCache() {
    return this._thumbnails;
  }
  static set thumbnailCache(val) {
    if (val && typeof val === "object") {
      this._thumbnails = val;
      this._thumbOrder = Object.keys(val);
    }
  }
  static get fileNameCache() {
    return this._fileNames;
  }
  static set fileNameCache(val) {
    if (val && typeof val === "object") {
      this._fileNames = val;
      this._fileNameOrder = Object.keys(val);
    }
  }
}
__publicField(MediaRegistry, "_refIdentities", new Map());
__publicField(MediaRegistry, "_thumbnails", {});
__publicField(MediaRegistry, "_fileNames", {});
__publicField(MediaRegistry, "_LRU_MAX", 500);
__publicField(MediaRegistry, "_LRU_EVICT", 100);
__publicField(MediaRegistry, "_thumbOrder", []);
__publicField(MediaRegistry, "_fileNameOrder", []);
window.MediaRegistry = MediaRegistry;
