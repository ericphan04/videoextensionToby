(function () {
  "use strict";
  const DEFAULTS = {
    maxEdge: 1280,
    quality: 0.9,
    loadTimeoutMs: 2e4,
    seekEpsilon: 0.04,
  };
  class VideoFrameExtractor {
    static async extractLastFrame(videoUrl, opts = {}) {
      const cfg = { ...DEFAULTS, ...opts };
      if (!videoUrl || typeof videoUrl !== "string")
        throw new Error("VideoFrameExtractor: videoUrl r\u1ED7ng");
      const blob = await this._fetchVideoBlob(
        videoUrl,
        cfg.provider || "flow",
        cfg.tabId || null,
        cfg.loadTimeoutMs,
      );
      if (!blob)
        throw new Error(
          "VideoFrameExtractor: kh\xF4ng t\u1EA3i \u0111\u01B0\u1EE3c video (fetch page + SW \u0111\u1EC1u fail)",
        );
      if (!/^video\//.test(blob.type || ""))
        throw new Error(
          "VideoFrameExtractor: blob kh\xF4ng ph\u1EA3i video (" +
            (blob.type || "unknown") +
            ")",
        );
      cfg.blobSize = Number(blob.size) || 0;
      cfg.blobType = blob.type || "unknown";
      const objUrl = URL.createObjectURL(blob);
      try {
        return await this._grabLastFrame(objUrl, cfg);
      } finally {
        try {
          URL.revokeObjectURL(objUrl);
        } catch (_) {}
      }
    }
    static async _fetchVideoBlob(
      videoUrl,
      provider,
      tabId,
      timeoutMs = DEFAULTS.loadTimeoutMs,
    ) {
      if (provider !== "grok") {
        try {
          const resp = await fetch(videoUrl, {
            credentials: "include",
            cache: "no-store",
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (resp.ok) {
            const blob = await resp.blob();
            if (blob && /^video\//.test(blob.type || "")) return blob;
          }
        } catch (_) {}
      }
      const dataUrl = await this._fetchVideoDataUrl(
        videoUrl,
        provider,
        tabId,
        provider === "flow" ? timeoutMs : null,
      );
      if (!dataUrl || !dataUrl.startsWith("data:")) return null;
      try {
        return await (await fetch(dataUrl)).blob();
      } catch (_) {
        return null;
      }
    }
    static async _fetchVideoDataUrl(
      videoUrl,
      provider,
      tabId,
      timeoutMs = null,
    ) {
      const message =
        provider === "grok"
          ? { action: "grok:fetchMedia", url: videoUrl, tabId: tabId || null }
          : { type: "fetchMedia", urls: [videoUrl] };
      const resp = await new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value || null);
        };
        const timer =
          timeoutMs > 0 ? setTimeout(() => finish(null), timeoutMs) : null;
        try {
          chrome.runtime.sendMessage(message, (r) => {
            void chrome.runtime.lastError;
            finish(r);
          });
        } catch (_) {
          finish(null);
        }
      });
      if (!resp) return null;
      if (resp.results && typeof resp.results === "object")
        return resp.results[videoUrl] || null;
      if (resp.base64 && String(resp.base64).startsWith("data:"))
        return resp.base64;
      if (resp.dataUrl) return resp.dataUrl;
      return null;
    }
    static _grabLastFrame(objUrl, cfg) {
      return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        video.muted = true;
        video.defaultMuted = true;
        video.playsInline = true;
        video.preload = "auto";
        video.crossOrigin = "anonymous";
        video.style.cssText =
          "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;";
        let done = false;
        let phase = "element-created";
        let seekWatchTimer = null;
        const timer = setTimeout(
          () =>
            finish(
              new Error(
                "VideoFrameExtractor: timeout " +
                  cfg.loadTimeoutMs +
                  `ms (phase=${phase}, readyState=${video.readyState}, networkState=${video.networkState}, duration=${Number.isFinite(video.duration) ? video.duration : "unknown"}, blob=${cfg.blobType || "unknown"}/${cfg.blobSize || 0}B)`,
              ),
            ),
          cfg.loadTimeoutMs,
        );
        const cleanup = () => {
          clearTimeout(timer);
          if (seekWatchTimer) clearInterval(seekWatchTimer);
          try {
            video.removeAttribute("src");
            video.load();
          } catch (_) {}
          try {
            if (video.parentNode) video.parentNode.removeChild(video);
          } catch (_) {}
        };
        const finish = (err, out) => {
          if (done) return;
          done = true;
          cleanup();
          err ? reject(err) : resolve(out);
        };
        const _cleanFullFrame = async (vw, vh) => {
          if (!self.WatermarkClient?.enabled?.("video", { scope: "input" }))
            return null;
          let full = null;
          try {
            full = document.createElement("canvas");
            full.width = vw;
            full.height = vh;
            full.getContext("2d").drawImage(video, 0, 0, vw, vh);
            const dataUrl = full.toDataURL("image/png");
            phase = "watermark-cleanup";
            const cleanWaitMs = Math.max(
              750,
              Math.min(4e3, Math.floor(cfg.loadTimeoutMs / 4)),
            );
            let cleanTimer = null;
            let cleanTimedOut = false;
            const cleaned = await Promise.race([
              Promise.resolve(
                self.WatermarkClient.cleanDataUrl(dataUrl, "video", {
                  scope: "input",
                }),
              ).catch(() => dataUrl),
              new Promise((res) => {
                cleanTimer = setTimeout(() => {
                  cleanTimedOut = true;
                  res(dataUrl);
                }, cleanWaitMs);
              }),
            ]);
            if (cleanTimer) clearTimeout(cleanTimer);
            phase = "drawing";
            if (done) return null;
            if (cleanTimedOut) {
              console.warn(
                `[VideoFrameExtractor] E16 timeout ${cleanWaitMs}ms \u2192 d\xF9ng frame g\u1ED1c`,
              );
              return null;
            }
            if (cleaned === dataUrl) return null;
            const img = new Image();
            let decodeTimer = null;
            await new Promise((res, rej) => {
              img.onload = res;
              img.onerror = () =>
                rej(
                  new Error(
                    "decode frame \u0111\xE3 xo\xE1 th\u1EA5t b\u1EA1i",
                  ),
                );
              decodeTimer = setTimeout(
                () => rej(new Error("decode frame \u0111\xE3 xo\xE1 timeout")),
                2e3,
              );
              img.src = cleaned;
            }).finally(() => {
              if (decodeTimer) clearTimeout(decodeTimer);
            });
            return img;
          } catch (e) {
            console.warn("[VideoFrameExtractor] E16 b\u1ECF qua:", e?.message);
            return null;
          } finally {
            if (full) {
              try {
                full.width = 1;
                full.height = 1;
              } catch (_) {}
            }
          }
        };
        const draw = async () => {
          phase = "drawing";
          let cleanImg = null;
          let canvas = null;
          try {
            const vw = video.videoWidth,
              vh = video.videoHeight;
            if (!vw || !vh)
              return finish(
                new Error(
                  "VideoFrameExtractor: videoWidth/Height = 0 (decode fail)",
                ),
              );
            const scale = Math.min(1, cfg.maxEdge / Math.max(vw, vh));
            const w = Math.max(1, Math.round(vw * scale));
            const h = Math.max(1, Math.round(vh * scale));
            cleanImg = await _cleanFullFrame(vw, vh);
            if (done) return;
            canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(cleanImg || video, 0, 0, w, h);
            const base64 = canvas.toDataURL("image/jpeg", cfg.quality);
            if (!base64 || base64.length < 32)
              return finish(
                new Error("VideoFrameExtractor: toDataURL r\u1ED7ng"),
              );
            finish(null, {
              base64,
              width: w,
              height: h,
              watermarkRemoved: !!cleanImg,
            });
          } catch (e) {
            finish(
              new Error(
                "VideoFrameExtractor: draw/toDataURL fail \u2014 " +
                  ((e && e.message) || e),
              ),
            );
          } finally {
            if (cleanImg) {
              try {
                cleanImg.onload = null;
                cleanImg.onerror = null;
                cleanImg.src = "";
              } catch (_) {}
            }
            if (canvas) {
              try {
                canvas.width = 1;
                canvas.height = 1;
              } catch (_) {}
            }
          }
        };
        video.addEventListener(
          "error",
          () =>
            finish(
              new Error(
                "VideoFrameExtractor: <video> error (" +
                  (video.error?.code || "?") +
                  ")",
              ),
            ),
          { once: true },
        );
        let seeked = false;
        let drawStarted = false;
        let seekTarget = null;
        let seekAttempt = 0;
        let seekAttemptStartedAt = 0;
        let duration = null;
        const seekOffsets = [
          ...new Set([
            Math.max(0.04, Number(cfg.seekEpsilon) || 0.04),
            0.12,
            0.25,
          ]),
        ].sort((a, b) => a - b);
        const startSeek = () => {
          if (
            !Number.isFinite(duration) ||
            duration <= 0 ||
            seekAttempt >= seekOffsets.length
          )
            return;
          const offset = seekOffsets[seekAttempt++];
          seekTarget = Math.max(0, duration - offset);
          seekAttemptStartedAt = Date.now();
          phase = `seeking-${seekAttempt}@${seekTarget.toFixed(3)}`;
          try {
            video.currentTime = seekTarget;
          } catch (_) {
            phase = `seek-assign-failed-${seekAttempt}`;
          }
        };
        video.addEventListener(
          "loadedmetadata",
          () => {
            phase = "metadata-loaded";
            duration = Number(video.duration);
            if (!Number.isFinite(duration) || duration <= 0) {
              return;
            }
            startSeek();
          },
          { once: true },
        );
        const _draw = () => {
          if (drawStarted || done) return;
          drawStarted = true;
          draw().catch((e) =>
            finish(e instanceof Error ? e : new Error(String(e))),
          );
        };
        video.addEventListener(
          "seeked",
          () => {
            phase = "seeked";
            seeked = true;
            _draw();
          },
          { once: true },
        );
        const drawWhenReady = () => {
          if (
            drawStarted ||
            done ||
            video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
          )
            return;
          if (!Number.isFinite(duration) || duration <= 0) {
            phase = "ready-unknown-duration";
            _draw();
            return;
          }
          const tolerance = Math.max(
            0.08,
            (Number(cfg.seekEpsilon) || 0.04) * 3,
          );
          if (
            !video.seeking &&
            seekTarget !== null &&
            Math.abs(video.currentTime - seekTarget) <= tolerance
          ) {
            phase = "seek-ready-without-event";
            seeked = true;
            _draw();
          }
        };
        video.addEventListener("loadeddata", drawWhenReady);
        video.addEventListener("canplay", drawWhenReady);
        video.addEventListener("canplaythrough", drawWhenReady);
        seekWatchTimer = setInterval(() => {
          drawWhenReady();
          if (
            drawStarted ||
            done ||
            !Number.isFinite(duration) ||
            duration <= 0
          )
            return;
          if (
            seekAttempt < seekOffsets.length &&
            Date.now() - seekAttemptStartedAt >= 3500
          )
            startSeek();
        }, 250);
        try {
          (document.body || document.documentElement).appendChild(video);
        } catch (_) {}
        phase = "source-assigned";
        video.src = objUrl;
        try {
          video.load();
        } catch (_) {}
      });
    }
  }
  window.VideoFrameExtractor = VideoFrameExtractor;
})();
