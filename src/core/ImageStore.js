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
class ImageStore {
  static async _getDB() {
    if (window.AlbumStore?._db) {
      this._db = window.AlbumStore._db;
      return this._db;
    }
    if (this._db) return this._db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains("pending_uploads")) {
          db.createObjectStore("pending_uploads", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("uploaded_cache")) {
          db.createObjectStore("uploaded_cache", { keyPath: "key" });
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
        if (!db.objectStoreNames.contains("lightweight_pending")) {
          const lwStore = db.createObjectStore("lightweight_pending", {
            keyPath: "key",
          });
          lwStore.createIndex("createdAt", "createdAt", { unique: false });
        }
        if (!db.objectStoreNames.contains("workflow_paste_blobs")) {
          const pasteStore = db.createObjectStore("workflow_paste_blobs", {
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
        if (!db.objectStoreNames.contains("flow_ref_previews")) {
          const previews = db.createObjectStore("flow_ref_previews", {
            keyPath: "key",
          });
          previews.createIndex("createdAt", "createdAt", { unique: false });
        }
      };
      request.onsuccess = (event) => {
        this._db = event.target.result;
        resolve(this._db);
      };
      request.onerror = (event) => {
        console.error("[ImageStore] IndexedDB open error:", event.target.error);
        reject(event.target.error);
      };
    });
  }
  static async compressThumbnail(blob, maxSize = this.MAX_THUMBNAIL_SIZE) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const scale = Math.min(200 / img.width, 200 / img.height, 1);
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (compressedBlob) => {
            if (compressedBlob) {
              resolve(compressedBlob);
            } else {
              reject(new Error("Kh\xF4ng th\u1EC3 n\xE9n thumbnail"));
            }
          },
          "image/webp",
          0.7,
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Kh\xF4ng th\u1EC3 load \u1EA3nh"));
      };
      img.src = url;
    });
  }
  static async compressMedium(blob) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const maxDim = this.MEDIUM_MAX_SIZE;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          const scale = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (compressedBlob) => {
            if (compressedBlob) {
              console.log(
                `[ImageStore] Medium: ${img.width}x${img.height} \u2192 ${width}x${height}, ${(compressedBlob.size / 1024).toFixed(1)}KB`,
              );
              resolve(compressedBlob);
            } else {
              reject(new Error("Kh\xF4ng th\u1EC3 n\xE9n medium"));
            }
          },
          "image/webp",
          this.MEDIUM_QUALITY,
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Kh\xF4ng th\u1EC3 load \u1EA3nh"));
      };
      img.src = url;
    });
  }
  static async addImage(albumId, imageData, thumbnailBlob, fullBlob = null) {
    const db = await this._getDB();
    const imageId = crypto.randomUUID();
    const blobKey = `blob_${imageId}`;
    let compressedThumb = thumbnailBlob;
    try {
      if (thumbnailBlob && thumbnailBlob.size > this.MAX_THUMBNAIL_SIZE) {
        compressedThumb = await this.compressThumbnail(thumbnailBlob);
      }
    } catch (err) {
      console.warn(
        "[ImageStore] Thumbnail compression failed (tier 1):",
        err.message,
      );
      compressedThumb = null;
    }
    const isLocalUpload =
      imageData.type === "upload" || imageData.type === "capture";
    let mediumBlob = null;
    if (isLocalUpload && fullBlob && fullBlob instanceof Blob) {
      try {
        mediumBlob = await this.compressMedium(fullBlob);
      } catch (err) {
        console.warn("[ImageStore] Medium compression failed:", err.message);
      }
    }
    if (!compressedThumb && mediumBlob) {
      try {
        compressedThumb = await this.compressThumbnail(mediumBlob);
      } catch (err) {
        console.warn(
          "[ImageStore] Thumbnail compression failed (tier 2 from medium):",
          err.message,
        );
      }
    }
    if (!compressedThumb && mediumBlob) {
      compressedThumb = mediumBlob;
    }
    if (!compressedThumb && fullBlob instanceof Blob) {
      compressedThumb = fullBlob;
    }
    const image = {
      id: imageId,
      album_id: albumId,
      name: imageData.name || "Untitled",
      type: imageData.type || "image",
      file_id: imageData.file_id || null,
      file_name: imageData.file_name || null,
      thumbnail_url: imageData.thumbnail_url || null,
      original_name: imageData.original_name || null,
      pending_upload_key: imageData.pending_upload_key || null,
      blob_key: blobKey,
      thumbnail_blob_key: `thumb_${blobKey}`,
      has_medium_blob: !!mediumBlob,
      created_at: Date.now(),
    };
    const blobEntry = {
      id: blobKey,
      thumbnail_blob: compressedThumb,
      medium_blob: mediumBlob,
      created_at: Date.now(),
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(
        [this.STORE_IMAGES, this.STORE_BLOBS],
        "readwrite",
      );
      const imageStore = tx.objectStore(this.STORE_IMAGES);
      const blobStore = tx.objectStore(this.STORE_BLOBS);
      imageStore.put(image);
      blobStore.put(blobEntry);
      const self = this;
      tx.oncomplete = async () => {
        try {
          await window.AlbumStore?.addImageToAlbum(albumId, imageId);
        } catch (e) {
          console.error(
            "[ImageStore] Failed to add image to album, rolling back:",
            e,
          );
          try {
            const rollbackTx = db.transaction(
              [self.STORE_IMAGES, self.STORE_BLOBS],
              "readwrite",
            );
            rollbackTx.objectStore(self.STORE_IMAGES).delete(imageId);
            if (blobKey)
              rollbackTx.objectStore(self.STORE_BLOBS).delete(blobKey);
          } catch (rollbackErr) {
            console.error("[ImageStore] Rollback failed:", rollbackErr);
          }
        }
        console.log("[ImageStore] Image added:", imageId);
        resolve(image);
      };
      tx.onerror = () => reject(tx.error);
    });
  }
  static async getImage(imageId) {
    const db = await this._getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_IMAGES, "readonly");
      const store = tx.objectStore(this.STORE_IMAGES);
      const request = store.get(imageId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }
  static async getAlbumImages(albumId) {
    const db = await this._getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_IMAGES, "readonly");
      const store = tx.objectStore(this.STORE_IMAGES);
      const index = store.index("album_id");
      const request = index.getAll(albumId);
      request.onsuccess = () => {
        const images = request.result || [];
        images.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
        resolve(images);
      };
      request.onerror = () => reject(request.error);
    });
  }
  static async updateImageName(imageId, name) {
    const image = await this.getImage(imageId);
    if (!image) return null;
    const db = await this._getDB();
    image.name = name;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_IMAGES, "readwrite");
      const store = tx.objectStore(this.STORE_IMAGES);
      store.put(image);
      tx.oncomplete = () => resolve(image);
      tx.onerror = () => reject(tx.error);
    });
  }
  static async deleteImage(imageId) {
    const image = await this.getImage(imageId);
    if (!image) return false;
    const db = await this._getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(
        [this.STORE_IMAGES, this.STORE_BLOBS],
        "readwrite",
      );
      const imageStore = tx.objectStore(this.STORE_IMAGES);
      const blobStore = tx.objectStore(this.STORE_BLOBS);
      imageStore.delete(imageId);
      if (image.blob_key) {
        blobStore.delete(image.blob_key);
      }
      tx.oncomplete = async () => {
        try {
          await window.AlbumStore?.removeImageFromAlbum(
            image.album_id,
            imageId,
          );
        } catch (e) {
          console.error(
            "[ImageStore] Failed to remove image from album, rolling back:",
            e,
          );
          try {
            const rollbackTx = db.transaction(
              [this.STORE_IMAGES, this.STORE_BLOBS],
              "readwrite",
            );
            rollbackTx.objectStore(this.STORE_IMAGES).put(image);
          } catch (rollbackErr) {
            console.error("[ImageStore] Rollback failed:", rollbackErr);
          }
        }
        window.ThumbnailCache?.delete(imageId);
        console.log("[ImageStore] Image deleted:", imageId);
        resolve(true);
      };
      tx.onerror = () => reject(tx.error);
    });
  }
  static async getThumbnail(imageId) {
    const cached = window.ThumbnailCache?.get(imageId);
    if (cached) return cached;
    const image = await this.getImage(imageId);
    if (!image || !image.blob_key) return null;
    const db = await this._getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_BLOBS, "readonly");
      const store = tx.objectStore(this.STORE_BLOBS);
      const request = store.get(image.blob_key);
      request.onsuccess = () => {
        const blobEntry = request.result;
        const sourceBlob = blobEntry?.thumbnail_blob || blobEntry?.medium_blob;
        if (sourceBlob) {
          let url;
          if (typeof sourceBlob === "string") {
            url = sourceBlob;
          } else {
            url =
              window.BlobUrlManager?.create(sourceBlob, imageId) ||
              URL.createObjectURL(sourceBlob);
          }
          window.ThumbnailCache?.set(imageId, url);
          resolve(url);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }
  static async getFullImage(imageId) {
    const image = await this.getImage(imageId);
    if (!image || !image.blob_key) return null;
    const db = await this._getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_BLOBS, "readonly");
      const store = tx.objectStore(this.STORE_BLOBS);
      const request = store.get(image.blob_key);
      request.onsuccess = () => {
        const blobEntry = request.result;
        const blob = blobEntry?.medium_blob || blobEntry?.thumbnail_blob;
        if (blob) {
          let url;
          if (typeof blob === "string") {
            url = blob;
          } else {
            url =
              window.BlobUrlManager?.create(blob, imageId) ||
              URL.createObjectURL(blob);
          }
          resolve(url);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }
  static async getFullBlob(imageId) {
    const image = await this.getImage(imageId);
    if (!image || !image.blob_key) return null;
    const db = await this._getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_BLOBS, "readonly");
      const store = tx.objectStore(this.STORE_BLOBS);
      const request = store.get(image.blob_key);
      request.onsuccess = () => {
        const blobEntry = request.result;
        let blob = blobEntry?.medium_blob || null;
        if (!blob && blobEntry?.thumbnail_blob) {
          if (typeof blobEntry.thumbnail_blob !== "string") {
            blob = blobEntry.thumbnail_blob;
          }
        }
        resolve(blob);
      };
      request.onerror = () => reject(request.error);
    });
  }
  static async hasBlob(imageId) {
    const image = await this.getImage(imageId);
    if (!image || !image.blob_key) return false;
    const db = await this._getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(this.STORE_BLOBS, "readonly");
      const store = tx.objectStore(this.STORE_BLOBS);
      const request = store.get(image.blob_key);
      request.onsuccess = () => {
        const entry = request.result;
        resolve(!!(entry?.thumbnail_blob || entry?.medium_blob));
      };
      request.onerror = () => resolve(false);
    });
  }
  static async cleanupOldBlobs(maxAgeDays = this.BLOB_DEFAULT_MAX_AGE_DAYS) {
    const db = await this._getDB();
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1e3;
    const referencedBlobKeys = new Set();
    try {
      const imgTx = db.transaction(this.STORE_IMAGES, "readonly");
      const imgStore = imgTx.objectStore(this.STORE_IMAGES);
      const allImages = await new Promise((resolve, reject) => {
        const req = imgStore.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
      for (const img of allImages) {
        if (img.blob_key) referencedBlobKeys.add(img.blob_key);
      }
    } catch (err) {
      console.warn(
        "[ImageStore] Failed to collect referenced blob keys, skipping cleanup:",
        err.message,
      );
      return 0;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_BLOBS, "readwrite");
      const store = tx.objectStore(this.STORE_BLOBS);
      const request = store.openCursor();
      let cleaned = 0;
      let skippedReferenced = 0;
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const entry = cursor.value;
          if (entry.created_at && entry.created_at < cutoff) {
            if (referencedBlobKeys.has(entry.id)) {
              skippedReferenced++;
            } else {
              cursor.delete();
              cleaned++;
            }
          }
          cursor.continue();
        }
      };
      tx.oncomplete = () => {
        if (cleaned > 0 || skippedReferenced > 0) {
          console.log(
            `[ImageStore] Cleaned ${cleaned} old blobs, skipped ${skippedReferenced} referenced`,
          );
        }
        resolve(cleaned);
      };
      tx.onerror = () => reject(tx.error);
    });
  }
  static async count() {
    const db = await this._getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_IMAGES, "readonly");
      const store = tx.objectStore(this.STORE_IMAGES);
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  static async getTotalBlobSize() {
    const db = await this._getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_BLOBS, "readonly");
      const store = tx.objectStore(this.STORE_BLOBS);
      const request = store.openCursor();
      let totalSize = 0;
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const entry = cursor.value;
          if (entry.thumbnail_blob?.size)
            totalSize += entry.thumbnail_blob.size;
          if (entry.medium_blob?.size) totalSize += entry.medium_blob.size;
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve(totalSize);
      tx.onerror = () => reject(tx.error);
    });
  }
  static async updateImage(imageId, updates) {
    const image = await this.getImage(imageId);
    if (!image) return null;
    const db = await this._getDB();
    if (updates.file_name !== void 0) image.file_name = updates.file_name;
    if (updates.thumbnail_url !== void 0)
      image.thumbnail_url = updates.thumbnail_url;
    if (updates.file_id !== void 0) image.file_id = updates.file_id;
    if (updates.pending_upload_key !== void 0)
      image.pending_upload_key = updates.pending_upload_key;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_IMAGES, "readwrite");
      const store = tx.objectStore(this.STORE_IMAGES);
      store.put(image);
      tx.oncomplete = () => {
        console.log("[ImageStore] Image updated:", imageId, updates);
        resolve(image);
      };
      tx.onerror = () => reject(tx.error);
    });
  }
  static async migrateToLightweight() {
    const db = await this._getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_BLOBS, "readwrite");
      const store = tx.objectStore(this.STORE_BLOBS);
      const request = store.openCursor();
      let cleaned = 0;
      let freedBytes = 0;
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const entry = cursor.value;
          if (entry.full_blob) {
            freedBytes += entry.full_blob.size || 0;
            entry.full_blob = null;
            cursor.update(entry);
            cleaned++;
          }
          cursor.continue();
        }
      };
      tx.oncomplete = () => {
        if (cleaned > 0) {
          console.log(
            `[ImageStore] Migration: cleaned ${cleaned} full_blobs, freed ${(freedBytes / 1024 / 1024).toFixed(2)} MB`,
          );
        }
        resolve({ cleaned, freedBytes });
      };
      tx.onerror = () => reject(tx.error);
    });
  }
  static async getAllImages() {
    const db = await this._getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_IMAGES, "readonly");
      const store = tx.objectStore(this.STORE_IMAGES);
      const request = store.getAll();
      request.onsuccess = () => {
        resolve(request.result || []);
      };
      request.onerror = () => reject(request.error);
    });
  }
  static async getImagesNeedingResolution() {
    const db = await this._getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_IMAGES, "readonly");
      const store = tx.objectStore(this.STORE_IMAGES);
      const request = store.getAll();
      request.onsuccess = () => {
        const images = request.result || [];
        const needResolution = images.filter(
          (img) =>
            (!img.file_name && img.thumbnail_url) || img.pending_upload_key,
        );
        resolve(needResolution);
      };
      request.onerror = () => reject(request.error);
    });
  }
}
__publicField(ImageStore, "DB_NAME", "autoflow_pro");
__publicField(ImageStore, "STORE_IMAGES", "album_images");
__publicField(ImageStore, "STORE_BLOBS", "image_blobs");
__publicField(ImageStore, "DB_VERSION", 5);
__publicField(ImageStore, "MAX_THUMBNAIL_SIZE", 50 * 1024);
__publicField(ImageStore, "MEDIUM_MAX_SIZE", 1200);
__publicField(ImageStore, "MEDIUM_QUALITY", 0.85);
__publicField(ImageStore, "BLOB_DEFAULT_MAX_AGE_DAYS", 7);
__publicField(ImageStore, "_db", null);
window.ImageStore = ImageStore;
