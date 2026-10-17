class ThumbnailCache {
  constructor(maxSize = 50) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }
  get(imageId) {
    const item = this.cache.get(imageId);
    if (item) {
      item.lastAccess = Date.now();
      return item.blobUrl;
    }
    return null;
  }
  has(imageId) {
    return this.cache.has(imageId);
  }
  set(imageId, blobUrl) {
    if (this.cache.size >= this.maxSize && !this.cache.has(imageId)) {
      this._evictOldest();
    }
    this.cache.set(imageId, { blobUrl, lastAccess: Date.now() });
  }
  delete(imageId) {
    const item = this.cache.get(imageId);
    if (item) {
      window.BlobUrlManager?.revoke(item.blobUrl);
      this.cache.delete(imageId);
    }
  }
  _evictOldest() {
    let oldest = { key: null, time: Infinity };
    for (const [key, value] of this.cache) {
      if (value.lastAccess < oldest.time) {
        oldest = { key, time: value.lastAccess };
      }
    }
    if (oldest.key) {
      const item = this.cache.get(oldest.key);
      if (item) {
        window.BlobUrlManager?.revoke(item.blobUrl);
      }
      this.cache.delete(oldest.key);
    }
  }
  clear() {
    for (const [, value] of this.cache) {
      window.BlobUrlManager?.revoke(value.blobUrl);
    }
    this.cache.clear();
    console.log("[ThumbnailCache] Cache cleared");
  }
  get size() {
    return this.cache.size;
  }
  keys() {
    return Array.from(this.cache.keys());
  }
}
window.ThumbnailCache = new ThumbnailCache(50);
