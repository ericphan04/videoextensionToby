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
class PendingUploadStore {
  static _getDB() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(this.CACHE_STORE)) {
          db.createObjectStore(this.CACHE_STORE, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("albums")) {
          const albumStore = db.createObjectStore("albums", { keyPath: "id" });
          albumStore.createIndex("name", "name", { unique: false });
          albumStore.createIndex("updated_at", "updated_at", { unique: false });
        }
        if (!db.objectStoreNames.contains("album_images")) {
          const imageStore = db.createObjectStore("album_images", {
            keyPath: "id",
          });
          imageStore.createIndex("album_id", "album_id", { unique: false });
          imageStore.createIndex("name", "name", { unique: false });
        }
        if (!db.objectStoreNames.contains("image_blobs")) {
          db.createObjectStore("image_blobs", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(this.LIGHTWEIGHT_STORE)) {
          const lwStore = db.createObjectStore(this.LIGHTWEIGHT_STORE, {
            keyPath: "key",
          });
          lwStore.createIndex("createdAt", "createdAt", { unique: false });
        }
        if (!db.objectStoreNames.contains(this.WORKFLOW_PASTE_STORE)) {
          const pasteStore = db.createObjectStore(this.WORKFLOW_PASTE_STORE, {
            keyPath: "id",
          });
          pasteStore.createIndex("workflow_id", "workflow_id", {
            unique: false,
          });
          pasteStore.createIndex("upload_status", "upload_status", {
            unique: false,
          });
          pasteStore.createIndex("created_at", "created_at", { unique: false });
        }
        if (!db.objectStoreNames.contains(this.REF_PREVIEW_STORE)) {
          const previews = db.createObjectStore(this.REF_PREVIEW_STORE, {
            keyPath: "key",
          });
          previews.createIndex("createdAt", "createdAt", { unique: false });
        }
        console.log(
          "[PendingUploadStore] IndexedDB upgraded to version",
          this.DB_VERSION,
        );
      };
      request.onsuccess = (event) => {
        this._db = event.target.result;
        resolve(this._db);
      };
      request.onerror = (event) => {
        console.error(
          "[PendingUploadStore] IndexedDB open error:",
          event.target.error,
        );
        reject(event.target.error);
      };
    });
  }
  static async _tx(storeName, mode, callback) {
    const db = await this._getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const result = callback(store);
      tx.oncomplete = () => resolve(result._result);
      tx.onerror = () => reject(tx.error);
      if (result instanceof IDBRequest) {
        result._result = void 0;
        result.onsuccess = () => {
          result._result = result.result;
        };
      }
    });
  }
  static async save(key, file, thumbnail) {
    try {
      const db = await this._getDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE_NAME, "readwrite");
        const store = tx.objectStore(this.STORE_NAME);
        store.put({
          key,
          file,
          thumbnail,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          createdAt: Date.now(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      if (!window.pendingUploadFiles) window.pendingUploadFiles = new Map();
      window.pendingUploadFiles.set(key, { file, thumbnail });
      console.log("[PendingUploadStore] Saved:", key, file.name);
    } catch (err) {
      console.warn("[PendingUploadStore] Save failed:", key, err.message);
      if (!window.pendingUploadFiles) window.pendingUploadFiles = new Map();
      window.pendingUploadFiles.set(key, { file, thumbnail });
    }
  }
  static async restore() {
    try {
      const db = await this._getDB();
      const entries = await new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE_NAME, "readonly");
        const store = tx.objectStore(this.STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
      if (!window.pendingUploadFiles) window.pendingUploadFiles = new Map();
      let restored = 0;
      let cleaned = 0;
      for (const entry of entries) {
        if (Date.now() - entry.createdAt > this.MAX_AGE_MS) {
          await this.remove(entry.key);
          cleaned++;
          continue;
        }
        if (entry.file) {
          window.pendingUploadFiles.set(entry.key, {
            file: entry.file,
            thumbnail: entry.thumbnail,
          });
          restored++;
        }
      }
      if (restored > 0 || cleaned > 0) {
        console.log(
          `[PendingUploadStore] Restored: ${restored}, cleaned: ${cleaned}`,
        );
      }
    } catch (err) {
      console.warn("[PendingUploadStore] Restore failed:", err.message);
    }
  }
  static async remove(key) {
    try {
      const db = await this._getDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE_NAME, "readwrite");
        const store = tx.objectStore(this.STORE_NAME);
        store.delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn("[PendingUploadStore] Remove failed:", key, err.message);
    }
    window.pendingUploadFiles?.delete(key);
  }
  static async cacheUploaded(realTileId, file) {
    try {
      const db = await this._getDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(this.CACHE_STORE, "readwrite");
        const store = tx.objectStore(this.CACHE_STORE);
        store.put({
          key: realTileId,
          file,
          fileName: file.name,
          fileType: file.type,
          createdAt: Date.now(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      this._uploadedCacheKeys.add(realTileId);
      window.uploadedFileCache?.delete(realTileId);
    } catch (err) {
      console.warn(
        "[PendingUploadStore] Cache uploaded failed:",
        realTileId,
        err.message,
      );
      if (!window.uploadedFileCache) window.uploadedFileCache = new Map();
      window.uploadedFileCache.set(realTileId, { file });
    }
  }
  static async restoreCache() {
    try {
      const db = await this._getDB();
      const summary = await new Promise((resolve, reject) => {
        const tx = db.transaction(this.CACHE_STORE, "readwrite");
        const store = tx.objectStore(this.CACHE_STORE);
        const request = store.openCursor();
        let available = 0;
        let cleaned = 0;
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          const entry = cursor.value;
          if (
            !entry?.file ||
            Date.now() - Number(entry.createdAt || 0) > this.CACHE_MAX_AGE_MS
          ) {
            this._uploadedCacheKeys.delete(cursor.key);
            cursor.delete();
            cleaned++;
          } else {
            this._uploadedCacheKeys.add(entry.key);
            available++;
          }
          cursor.continue();
        };
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => resolve({ available, cleaned });
        tx.onerror = () => reject(tx.error);
      });
      if (!window.uploadedFileCache) window.uploadedFileCache = new Map();
      if (summary.available > 0 || summary.cleaned > 0) {
        console.log(
          `[PendingUploadStore] Indexed uploaded cache: ${summary.available}, cleaned: ${summary.cleaned}`,
        );
      }
    } catch (err) {
      console.warn("[PendingUploadStore] Restore cache failed:", err.message);
    }
  }
  static async _removeCache(key) {
    try {
      const db = await this._getDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(this.CACHE_STORE, "readwrite");
        const store = tx.objectStore(this.CACHE_STORE);
        store.delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {}
    this._uploadedCacheKeys.delete(key);
    window.uploadedFileCache?.delete(key);
  }
  static async hasCachedFile(realTileId) {
    if (!realTileId) return false;
    if (
      window.uploadedFileCache?.has(realTileId) ||
      this._uploadedCacheKeys.has(realTileId)
    )
      return true;
    try {
      const db = await this._getDB();
      const storedKey = await new Promise((resolve, reject) => {
        const tx = db.transaction(this.CACHE_STORE, "readonly");
        const request = tx.objectStore(this.CACHE_STORE).getKey(realTileId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (storedKey === void 0) return false;
      this._uploadedCacheKeys.add(realTileId);
      return true;
    } catch (_) {
      return false;
    }
  }
  static async getCachedFile(realTileId) {
    if (window.uploadedFileCache?.has(realTileId)) {
      return window.uploadedFileCache.get(realTileId).file;
    }
    try {
      const db = await this._getDB();
      const entry = await new Promise((resolve, reject) => {
        const tx = db.transaction(this.CACHE_STORE, "readonly");
        const store = tx.objectStore(this.CACHE_STORE);
        const request = store.get(realTileId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (entry?.file) {
        if (Date.now() - Number(entry.createdAt || 0) > this.CACHE_MAX_AGE_MS) {
          await this._removeCache(realTileId);
          return null;
        }
        this._uploadedCacheKeys.add(realTileId);
        return entry.file;
      }
    } catch (err) {}
    return null;
  }
  static async saveRefPreview(realTileId, dataUrl) {
    if (
      !realTileId ||
      typeof dataUrl !== "string" ||
      !/^data:image\/(?:jpeg|png|webp);base64,/i.test(dataUrl) ||
      dataUrl.length > 128e3
    )
      return false;
    try {
      const comma = dataUrl.indexOf(",");
      const mime = dataUrl.slice(5, dataUrl.indexOf(";", 5)).toLowerCase();
      const binary = atob(dataUrl.slice(comma + 1));
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const blob = new Blob([bytes], { type: mime });
      if (!blob.type.startsWith("image/") || blob.size > 96e3) return false;
      const db = await this._getDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(this.REF_PREVIEW_STORE, "readwrite");
        tx.objectStore(this.REF_PREVIEW_STORE).put({
          key: realTileId,
          blob,
          createdAt: Date.now(),
        });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      return true;
    } catch (error) {
      console.warn(
        "[PendingUploadStore] saveRefPreview failed:",
        error?.message,
      );
      return false;
    }
  }
  static async getRefPreview(realTileId) {
    try {
      const db = await this._getDB();
      const entry = await new Promise((resolve, reject) => {
        const tx = db.transaction(this.REF_PREVIEW_STORE, "readonly");
        const request = tx.objectStore(this.REF_PREVIEW_STORE).get(realTileId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return entry?.blob instanceof Blob && entry.blob.type.startsWith("image/")
        ? entry.blob
        : null;
    } catch (error) {
      console.warn(
        "[PendingUploadStore] getRefPreview failed:",
        error?.message,
      );
      return null;
    }
  }
  static async cleanupRefPreviews() {
    try {
      const db = await this._getDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(this.REF_PREVIEW_STORE, "readwrite");
        const store = tx.objectStore(this.REF_PREVIEW_STORE);
        const keys = [];
        let removed = 0;
        const cutoff = Date.now() - this.REF_PREVIEW_MAX_AGE_MS;
        const request = store.index("createdAt").openKeyCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            for (const key of keys.slice(
              0,
              Math.max(0, keys.length - this.REF_PREVIEW_MAX_ENTRIES),
            )) {
              store.delete(key);
              removed++;
            }
            return;
          }
          if (!Number.isFinite(cursor.key) || cursor.key < cutoff) {
            store.delete(cursor.primaryKey);
            removed++;
          } else {
            keys.push(cursor.primaryKey);
          }
          cursor.continue();
        };
        tx.oncomplete = () => resolve(removed);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch (error) {
      console.warn(
        "[PendingUploadStore] Ref preview cleanup failed:",
        error?.message,
      );
      return 0;
    }
  }
  static async saveLightweight(key, data) {
    try {
      const db = await this._getDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(this.LIGHTWEIGHT_STORE, "readwrite");
        const store = tx.objectStore(this.LIGHTWEIGHT_STORE);
        store.put({
          key,
          thumbnail: data.thumbnail,
          fileName: data.fileName,
          fileType: data.fileType,
          fileSize: data.fileSize,
          name: data.name || null,
          albumId: data.albumId || null,
          createdAt: Date.now(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      console.log("[PendingUploadStore] Saved lightweight:", key);
    } catch (err) {
      console.warn(
        "[PendingUploadStore] Save lightweight failed:",
        key,
        err.message,
      );
      throw err;
    }
  }
  static async getLightweight(key) {
    try {
      const db = await this._getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.LIGHTWEIGHT_STORE, "readonly");
        const store = tx.objectStore(this.LIGHTWEIGHT_STORE);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      console.warn(
        "[PendingUploadStore] Get lightweight failed:",
        key,
        err.message,
      );
      return null;
    }
  }
  static async getAllLightweightKeys() {
    try {
      const db = await this._getDB();
      const entries = await new Promise((resolve, reject) => {
        const tx = db.transaction(this.LIGHTWEIGHT_STORE, "readonly");
        const store = tx.objectStore(this.LIGHTWEIGHT_STORE);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
      const validKeys = [];
      for (const entry of entries) {
        if (Date.now() - entry.createdAt <= this.MAX_AGE_MS) {
          validKeys.push(entry.key);
        } else {
          await this.removeLightweight(entry.key);
        }
      }
      return validKeys;
    } catch (err) {
      console.warn(
        "[PendingUploadStore] Get all lightweight keys failed:",
        err.message,
      );
      return [];
    }
  }
  static async removeLightweight(key) {
    try {
      const db = await this._getDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(this.LIGHTWEIGHT_STORE, "readwrite");
        const store = tx.objectStore(this.LIGHTWEIGHT_STORE);
        store.delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn(
        "[PendingUploadStore] Remove lightweight failed:",
        key,
        err.message,
      );
    }
  }
  static async restoreLightweight() {
    try {
      const db = await this._getDB();
      const entries = await new Promise((resolve, reject) => {
        const tx = db.transaction(this.LIGHTWEIGHT_STORE, "readonly");
        const store = tx.objectStore(this.LIGHTWEIGHT_STORE);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
      if (!window.pendingUploadFiles) window.pendingUploadFiles = new Map();
      let restored = 0;
      let cleaned = 0;
      for (const entry of entries) {
        if (Date.now() - entry.createdAt > this.MAX_AGE_MS) {
          await this.removeLightweight(entry.key);
          cleaned++;
          continue;
        }
        if (entry.thumbnail && !window.pendingUploadFiles.has(entry.key)) {
          window.pendingUploadFiles.set(entry.key, {
            file: null,
            thumbnail: entry.thumbnail,
            fileName: entry.fileName,
            fileType: entry.fileType,
            fileSize: entry.fileSize,
            _isLightweight: true,
          });
          restored++;
        }
      }
      if (restored > 0 || cleaned > 0) {
        console.log(
          `[PendingUploadStore] Restored lightweight: ${restored}, cleaned: ${cleaned}`,
        );
      }
      return restored;
    } catch (err) {
      console.warn(
        "[PendingUploadStore] Restore lightweight failed:",
        err.message,
      );
      return 0;
    }
  }
  static async cleanupOldEntries(maxAgeMs = this.MAX_AGE_MS) {
    const cleaned = { pending: 0, lightweight: 0, cache: 0 };
    try {
      const db = await this._getDB();
      const pendingEntries = await new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE_NAME, "readonly");
        const store = tx.objectStore(this.STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
      for (const entry of pendingEntries) {
        if (Date.now() - entry.createdAt > maxAgeMs) {
          await this.remove(entry.key);
          cleaned.pending++;
        }
      }
      const lwEntries = await new Promise((resolve, reject) => {
        const tx = db.transaction(this.LIGHTWEIGHT_STORE, "readonly");
        const store = tx.objectStore(this.LIGHTWEIGHT_STORE);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
      for (const entry of lwEntries) {
        if (Date.now() - entry.createdAt > maxAgeMs) {
          await this.removeLightweight(entry.key);
          cleaned.lightweight++;
        }
      }
      if (cleaned.pending > 0 || cleaned.lightweight > 0) {
        console.log(
          `[PendingUploadStore] Cleaned: ${cleaned.pending} pending, ${cleaned.lightweight} lightweight`,
        );
      }
    } catch (err) {
      console.warn("[PendingUploadStore] Cleanup failed:", err.message);
    }
    return cleaned;
  }
  static async cleanupOldCache(maxAgeMs = this.CACHE_MAX_AGE_MS) {
    let cleaned = 0;
    try {
      const db = await this._getDB();
      const entries = await new Promise((resolve, reject) => {
        const tx = db.transaction(this.CACHE_STORE, "readonly");
        const store = tx.objectStore(this.CACHE_STORE);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
      for (const entry of entries) {
        if (Date.now() - entry.createdAt > maxAgeMs) {
          await this._removeCache(entry.key);
          cleaned++;
        }
      }
      if (cleaned > 0) {
        console.log(`[PendingUploadStore] Cleaned cache: ${cleaned} entries`);
      }
    } catch (err) {
      console.warn("[PendingUploadStore] Cache cleanup failed:", err.message);
    }
    return cleaned;
  }
  static async savePasteBlob(entry) {
    if (!entry?.id || !entry?.blob) {
      console.warn("[PendingUploadStore] savePasteBlob missing id/blob");
      return false;
    }
    try {
      const db = await this._getDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(this.WORKFLOW_PASTE_STORE, "readwrite");
        const store = tx.objectStore(this.WORKFLOW_PASTE_STORE);
        store.put({
          id: entry.id,
          blob: entry.blob,
          fileName: entry.fileName || "pasted-image.png",
          mimeType: entry.mimeType || entry.blob?.type || "image/png",
          size_bytes: entry.size_bytes ?? entry.blob?.size ?? 0,
          workflow_id: entry.workflow_id || null,
          upload_status: entry.upload_status || "pending",
          real_file_id: entry.real_file_id || null,
          created_at: entry.created_at || Date.now(),
          upload_attempts: entry.upload_attempts || 0,
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn("[PendingUploadStore] savePasteBlob failed:", err?.message);
      return false;
    }
  }
  static async getPasteBlob(tempId) {
    if (!tempId) return null;
    try {
      const db = await this._getDB();
      return await new Promise((resolve) => {
        const tx = db.transaction(this.WORKFLOW_PASTE_STORE, "readonly");
        const store = tx.objectStore(this.WORKFLOW_PASTE_STORE);
        const req = store.get(tempId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (err) {
      console.warn("[PendingUploadStore] getPasteBlob failed:", err?.message);
      return null;
    }
  }
  static async markPasteBlobUploaded(tempId, realFileId) {
    if (!tempId) return false;
    try {
      const existing = await this.getPasteBlob(tempId);
      if (!existing) return false;
      const db = await this._getDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(this.WORKFLOW_PASTE_STORE, "readwrite");
        const store = tx.objectStore(this.WORKFLOW_PASTE_STORE);
        store.put({
          ...existing,
          upload_status: "success",
          real_file_id: realFileId || existing.real_file_id || null,
          uploaded_at: Date.now(),
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
      return true;
    } catch (err) {
      console.warn(
        "[PendingUploadStore] markPasteBlobUploaded failed:",
        err?.message,
      );
      return false;
    }
  }
  static async cleanupUploadedPasteBlobs() {
    const db = await this._getDB();
    const cutoff = Date.now() - this.PASTE_BLOB_GRACE_MS;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.WORKFLOW_PASTE_STORE, "readwrite");
      const request = tx.objectStore(this.WORKFLOW_PASTE_STORE).openCursor();
      let removed = 0;
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const entry = cursor.value;
        if (
          entry.upload_status === "success" &&
          entry.real_file_id &&
          Number.isFinite(entry.uploaded_at) &&
          entry.uploaded_at > 0 &&
          entry.uploaded_at <= cutoff
        ) {
          cursor.delete();
          removed++;
        }
        cursor.continue();
      };
      tx.oncomplete = () => resolve(removed);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
  static async markPasteBlobFailed(tempId, errorMessage) {
    if (!tempId) return false;
    try {
      const existing = await this.getPasteBlob(tempId);
      if (!existing) return false;
      const db = await this._getDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(this.WORKFLOW_PASTE_STORE, "readwrite");
        const store = tx.objectStore(this.WORKFLOW_PASTE_STORE);
        store.put({
          ...existing,
          upload_status: "failed",
          upload_attempts: (existing.upload_attempts || 0) + 1,
          last_error: errorMessage || "unknown",
          last_attempt_at: Date.now(),
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
      return true;
    } catch (err) {
      console.warn(
        "[PendingUploadStore] markPasteBlobFailed failed:",
        err?.message,
      );
      return false;
    }
  }
  static async deletePasteBlob(tempId) {
    if (!tempId) return false;
    try {
      const db = await this._getDB();
      return await new Promise((resolve) => {
        const tx = db.transaction(this.WORKFLOW_PASTE_STORE, "readwrite");
        const store = tx.objectStore(this.WORKFLOW_PASTE_STORE);
        store.delete(tempId);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (err) {
      console.warn(
        "[PendingUploadStore] deletePasteBlob failed:",
        err?.message,
      );
      return false;
    }
  }
  static async deletePasteBlobsForWorkflow(workflowId) {
    if (!workflowId) return 0;
    try {
      const db = await this._getDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(this.WORKFLOW_PASTE_STORE, "readwrite");
        const store = tx.objectStore(this.WORKFLOW_PASTE_STORE);
        const index = store.index("workflow_id");
        const req = index.openCursor(IDBKeyRange.only(workflowId));
        let deleted = 0;
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            cursor.delete();
            deleted++;
            cursor.continue();
          } else {
          }
        };
        tx.oncomplete = () => {
          if (deleted > 0) {
            console.log(
              `[PendingUploadStore] Cascade deleted ${deleted} paste blobs for workflow ${workflowId}`,
            );
          }
          resolve(deleted);
        };
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn(
        "[PendingUploadStore] deletePasteBlobsForWorkflow failed:",
        err?.message,
      );
      return 0;
    }
  }
  static async getPendingPasteBlobs(workflowId) {
    if (!workflowId) return [];
    try {
      const db = await this._getDB();
      return await new Promise((resolve) => {
        const tx = db.transaction(this.WORKFLOW_PASTE_STORE, "readonly");
        const store = tx.objectStore(this.WORKFLOW_PASTE_STORE);
        const index = store.index("workflow_id");
        const req = index.getAll(workflowId);
        req.onsuccess = () => {
          const all = req.result || [];
          resolve(
            all.filter(
              (r) =>
                r.upload_status === "pending" || r.upload_status === "failed",
            ),
          );
        };
        req.onerror = () => resolve([]);
      });
    } catch (err) {
      console.warn(
        "[PendingUploadStore] getPendingPasteBlobs failed:",
        err?.message,
      );
      return [];
    }
  }
}
__publicField(PendingUploadStore, "DB_NAME", "autoflow_pro");
__publicField(PendingUploadStore, "STORE_NAME", "pending_uploads");
__publicField(PendingUploadStore, "CACHE_STORE", "uploaded_cache");
__publicField(PendingUploadStore, "LIGHTWEIGHT_STORE", "lightweight_pending");
__publicField(
  PendingUploadStore,
  "WORKFLOW_PASTE_STORE",
  "workflow_paste_blobs",
);
__publicField(PendingUploadStore, "REF_PREVIEW_STORE", "flow_ref_previews");
__publicField(PendingUploadStore, "DB_VERSION", 5);
__publicField(PendingUploadStore, "MAX_AGE_MS", 2 * 60 * 60 * 1e3);
__publicField(PendingUploadStore, "CACHE_MAX_AGE_MS", 24 * 60 * 60 * 1e3);
__publicField(
  PendingUploadStore,
  "REF_PREVIEW_MAX_AGE_MS",
  30 * 24 * 60 * 60 * 1e3,
);
__publicField(PendingUploadStore, "REF_PREVIEW_MAX_ENTRIES", 500);
__publicField(
  PendingUploadStore,
  "PASTE_BLOB_GRACE_MS",
  3 * 24 * 60 * 60 * 1e3,
);
__publicField(PendingUploadStore, "_db", null);
__publicField(PendingUploadStore, "_uploadedCacheKeys", new Set());
PendingUploadStore._scheduleCleanup = function () {
  if (this._cleanupScheduled) return;
  this._cleanupScheduled = true;
  async function _runCleanup() {
    const tasks = [
      () => PendingUploadStore.cleanupOldEntries(),
      () => PendingUploadStore.cleanupOldCache(),
      () => PendingUploadStore.cleanupRefPreviews(),
      () => PendingUploadStore.cleanupUploadedPasteBlobs(),
      () =>
        window.ImageStore?.cleanupOldBlobs(
          window.storageSettings?.getSettings?.()?.blobMaxAgeDays || 7,
        ),
    ];
    for (const task of tasks) {
      try {
        await task();
      } catch (error) {
        console.warn(
          "[PendingUploadStore] Cleanup step failed:",
          error?.message,
        );
      }
    }
  }
  setTimeout(async () => {
    await _runCleanup();
    console.log("[PendingUploadStore] Initial cleanup done");
  }, 3e4);
  setInterval(_runCleanup, 2 * 60 * 60 * 1e3);
};
window.PendingUploadStore = PendingUploadStore;
