importScripts(
  "../../vendor/mediabunny.js",
  "WatermarkRemover.js",
  "VideoWatermarkRemover.js",
);
const cancelled = new Set();
self.onmessage = async (e) => {
  const msg = e.data || {};
  if (msg.type === "cancel") {
    cancelled.add(msg.id);
    return;
  }
  if (msg.type !== "process") return;
  const { id, blob, cfg, opt } = msg;
  try {
    const r = await self.VideoWatermarkRemover.process(blob, cfg, {
      ...(opt || {}),
      onProgress: (p) => self.postMessage({ type: "progress", id, ...p }),
      isCancelled: () => cancelled.has(id),
    });
    self.postMessage({ type: "done", id, ...r });
  } catch (err) {
    self.postMessage({
      type: "error",
      id,
      code: err?.code || "EXCEPTION",
      message: err?.message || String(err),
    });
  } finally {
    cancelled.delete(id);
  }
};
