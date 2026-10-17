(function () {
  "use strict";
  const LOG = "[VideoWmClient]";
  let _worker = null;
  let _workerBroken = false;
  let _seq = 0;
  const _pending = new Map();
  function _spawn() {
    if (_worker || _workerBroken) return _worker;
    try {
      _worker = new Worker(
        chrome.runtime.getURL("src/core/video-wm-worker.js"),
      );
      _worker.onmessage = (e) => {
        const m = e.data || {};
        const job = _pending.get(m.id);
        if (!job) return;
        if (m.type === "progress") {
          job.onProgress(m);
          return;
        }
        _pending.delete(m.id);
        if (m.type === "done") job.resolve(m);
        else
          job.reject(
            Object.assign(new Error(m.message || m.code), { code: m.code }),
          );
      };
      _worker.onerror = (err) => {
        console.warn(
          `${LOG} Worker l\u1ED7i \u2192 chuy\u1EC3n sang ch\u1EA1y tr\xEAn trang:`,
          err?.message || err,
        );
        _workerBroken = true;
        try {
          _worker.terminate();
        } catch (_) {}
        _worker = null;
        for (const [, job] of _pending) job.fallback?.();
        _pending.clear();
      };
    } catch (e) {
      console.warn(
        `${LOG} kh\xF4ng t\u1EA1o \u0111\u01B0\u1EE3c Worker:`,
        e?.message,
      );
      _workerBroken = true;
      _worker = null;
    }
    return _worker;
  }
  async function _inPage(blob, cfg, opt) {
    if (!self.VideoWatermarkRemover) {
      throw Object.assign(
        new Error(
          "VideoWatermarkRemover.js ch\u01B0a \u0111\u01B0\u1EE3c n\u1EA1p",
        ),
        { code: "NO_MODULE" },
      );
    }
    return self.VideoWatermarkRemover.process(blob, cfg, opt);
  }
  async function process(blob, cfg, opt = {}) {
    const onProgress =
      typeof opt.onProgress === "function" ? opt.onProgress : () => {};
    const w = _spawn();
    if (!w) return _inPage(blob, cfg, opt);
    const id = ++_seq;
    let cancelSent = false;
    const pump = setInterval(() => {
      if (!cancelSent && opt.isCancelled?.()) {
        cancelSent = true;
        w.postMessage({ type: "cancel", id });
      }
    }, 250);
    try {
      return await new Promise((resolve, reject) => {
        _pending.set(id, {
          resolve,
          reject,
          onProgress,
          fallback: () => _inPage(blob, cfg, opt).then(resolve, reject),
        });
        w.postMessage({
          type: "process",
          id,
          blob,
          cfg,
          opt: { bitrate: opt.bitrate },
        });
      });
    } finally {
      clearInterval(pump);
      _pending.delete(id);
    }
  }
  self.VideoWmClient = { process };
})();
