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
class TileCache {
  static get(key) {
    if (!key) return null;
    if (this._failedKeys.has(key)) return null;
    return this._cache.get(key) || null;
  }
  static getByFileId(fileId) {
    if (!fileId) return null;
    if (this._failedKeys.has(fileId)) return null;
    return this._fileIdMap.get(fileId) || null;
  }
  static set(key, tileId) {
    if (!key || !tileId) return;
    this._cache.set(key, tileId);
    this._failedKeys.delete(key);
  }
  static setByFileId(fileId, tileId) {
    if (!fileId || !tileId) return;
    this._fileIdMap.set(fileId, tileId);
    this._failedKeys.delete(fileId);
  }
  static markFailed(key) {
    if (!key) return;
    this._cache.delete(key);
    this._failedKeys.add(key);
  }
  static clearFailed() {
    this._failedKeys.clear();
  }
  static clear() {
    this._cache.clear();
    this._fileIdMap.clear();
    this._failedKeys.clear();
    this._lastScanTime = 0;
  }
  static shouldScan() {
    const now = Date.now();
    if (now - this._lastScanTime < this.MIN_SCAN_INTERVAL) {
      return false;
    }
    return true;
  }
  static markScanned() {
    this._lastScanTime = Date.now();
  }
  static bulkSet(mappings) {
    for (const [key, tileId] of mappings) {
      this.set(key, tileId);
    }
  }
  static getStats() {
    return {
      cached: this._cache.size,
      cachedByFileId: this._fileIdMap.size,
      failed: this._failedKeys.size,
      lastScan: this._lastScanTime,
    };
  }
  static has(key) {
    return this._cache.has(key) && !this._failedKeys.has(key);
  }
}
__publicField(TileCache, "_cache", new Map());
__publicField(TileCache, "_fileIdMap", new Map());
__publicField(TileCache, "_failedKeys", new Set());
__publicField(TileCache, "_lastScanTime", 0);
__publicField(TileCache, "MIN_SCAN_INTERVAL", 1e3);
window.TileCache = TileCache;
(function () {
  if (window.tileCache instanceof Map) return;
  const MAX = 100;
  const m = new Map();
  const rawSet = Map.prototype.set.bind(m);
  m.set = function (k, v) {
    if (m.has(k)) m.delete(k);
    rawSet(k, v);
    if (m.size > MAX) m.delete(m.keys().next().value);
    return m;
  };
  window.tileCache = m;
})();
