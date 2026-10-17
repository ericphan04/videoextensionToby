class BlobUrlManager {
  constructor() {
    this._urls = new Map();
    this._cleanupInterval = null;
    this._startCleanupInterval();
  }
  create(blob, imageId = null) {
    const url = URL.createObjectURL(blob);
    this._urls.set(url, { imageId, createdAt: Date.now() });
    return url;
  }
  revoke(url) {
    if (this._urls.has(url)) {
      URL.revokeObjectURL(url);
      this._urls.delete(url);
    }
  }
  revokeByImageId(imageId) {
    for (const [url, data] of this._urls) {
      if (data.imageId === imageId) {
        URL.revokeObjectURL(url);
        this._urls.delete(url);
      }
    }
  }
  cleanup(maxAgeMs = 5 * 60 * 1e3) {
    const now = Date.now();
    let cleaned = 0;
    for (const [url, data] of this._urls) {
      if (now - data.createdAt > maxAgeMs) {
        URL.revokeObjectURL(url);
        this._urls.delete(url);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`[BlobUrlManager] Cleaned ${cleaned} expired URLs`);
    }
  }
  _startCleanupInterval() {
    if (this._cleanupInterval) return;
    this._cleanupInterval = setInterval(
      () => {
        this.cleanup();
      },
      5 * 60 * 1e3,
    );
  }
  stopCleanup() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
  }
  revokeAll() {
    for (const url of this._urls.keys()) {
      URL.revokeObjectURL(url);
    }
    this._urls.clear();
    console.log("[BlobUrlManager] All URLs revoked");
  }
  get size() {
    return this._urls.size;
  }
}
window.BlobUrlManager = new BlobUrlManager();
window.addEventListener("unload", () => {
  window.BlobUrlManager.stopCleanup();
  window.BlobUrlManager.revokeAll();
});
