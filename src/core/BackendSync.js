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
const _BackendSync = class _BackendSync {
  static init() {
    if (!window.eventBus) return;
    window.eventBus.on("node:completed", (data) => {
      if (_BackendSync._disabled) return;
      const node = data?.node;
      const result = data?.result;
      if (node?.node_id && result?.fileIds?.length > 0) {
        _BackendSync._syncNodeResult({
          nodeId: node.node_id,
          wfId: node.wf_id,
          nodeName: node.node_name,
          mediaType: node.media_type,
          result,
        });
      }
    });
    window.eventBus.on("task:status_changed", (data) => {
      if (_BackendSync._disabled) return;
      if (data?.status === "completed" && data?.resultFileIds) {
        _BackendSync._syncTaskResult(data);
      }
    });
    console.log("[BackendSync] Initialized");
  }
  static async _syncNodeResult(data) {
    if (!window.authManager?.isLoggedIn()) return;
    try {
      const fileIds = data.result.fileIds || [];
      if (fileIds.length === 0) return;
      const imageUrls = await _BackendSync._resolveFileUrls(fileIds);
      await _BackendSync._apiCall("POST", "results/sync", {
        type: "workflow_node",
        node_id: data.nodeId,
        wf_id: data.wfId || null,
        file_ids: fileIds,
        image_urls: imageUrls,
        node_name: data.nodeName || "",
        media_type: data.mediaType || "Image",
      });
    } catch (e) {
      console.debug("[BackendSync] Node sync failed:", e.message);
      _BackendSync._disabled = true;
    }
  }
  static async _syncTaskResult(data) {
    if (!window.authManager?.isLoggedIn()) return;
    try {
      const ids = (data.resultFileIds || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (ids.length === 0) return;
      const imageUrls = await _BackendSync._resolveFileUrls(ids);
      await _BackendSync._apiCall("POST", "results/sync", {
        type: "task",
        task_id: data.taskId,
        task_name: data.taskName || "",
        file_ids: ids,
        image_urls: imageUrls,
        media_type: data.mediaType || "Image",
      });
    } catch (e) {
      console.debug("[BackendSync] Task sync failed:", e.message);
      _BackendSync._disabled = true;
    }
  }
  static async _resolveFileUrls(fileIds) {
    if (!window.MessageBridge) return [];
    try {
      const result = await window.MessageBridge.scanFlowImages();
      const images = result?.images || result || [];
      return fileIds
        .map((id) => {
          const img = images.find((i) => i.fileId === id);
          return img?.thumbnail || img?.url || null;
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  }
  static async _apiCall(method, endpoint, data) {
    if (window.authManager?._apiCall) {
      return window.authManager._apiCall(method, endpoint, data);
    }
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: "apiRequest", method, endpoint: `api/v1/${endpoint}`, data },
        (response) => {
          if (response?.success) resolve(response.data);
          else reject(new Error(response?.error || "API call failed"));
        },
      );
    });
  }
};
__publicField(_BackendSync, "_disabled", false);
let BackendSync = _BackendSync;
window.BackendSync = BackendSync;
if (window.eventBus) {
  BackendSync.init();
} else {
  document.addEventListener("DOMContentLoaded", () => BackendSync.init());
}
