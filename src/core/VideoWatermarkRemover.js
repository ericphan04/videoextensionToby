(function () {
  "use strict";
  const LOG = "[VideoWM]";
  const SAMPLE_FRAMES = 12;
  const REDETECT_WARN_RATIO = 0.25;
  const MAX_INPUT_BYTES = 300 * 1024 * 1024;
  const MB = () => self.Mediabunny;
  const WR = () => self.WatermarkRemover;
  class VideoWmError extends Error {
    constructor(code, message) {
      super(message || code);
      this.code = code;
    }
  }
  function _mkCanvas(w, h) {
    if (typeof OffscreenCanvas === "undefined")
      throw new VideoWmError("NO_OFFSCREEN_CANVAS");
    return new OffscreenCanvas(w, h);
  }
  async function _findAnchor(samples, cfg, maskCache) {
    let best = null;
    for (const { imageData } of samples) {
      const found = await WR().classifyLogo(imageData, cfg, maskCache, "video");
      if (found && (!best || found.pos.ncc > best.pos.ncc))
        best = { ...found, imageData };
    }
    return best;
  }
  function _threshold(cfg) {
    const vt = cfg?.video?.detect?.ncc_threshold;
    return Number.isFinite(vt) ? vt : cfg?.detect?.ncc_threshold;
  }
  async function process(blob, cfg, opt = {}) {
    const t0 = Date.now();
    const onProgress =
      typeof opt.onProgress === "function" ? opt.onProgress : () => {};
    const cancelled =
      typeof opt.isCancelled === "function" ? opt.isCancelled : () => false;
    const stats = {
      frames: 0,
      redetects: 0,
      sampled: 0,
      denoisedFrames: 0,
      denoisedPixels: 0,
      ms: 0,
    };
    if (!MB())
      throw new VideoWmError(
        "NO_MEDIABUNNY",
        "vendor/mediabunny.js ch\u01B0a \u0111\u01B0\u1EE3c n\u1EA1p",
      );
    if (!WR())
      throw new VideoWmError(
        "NO_CORE",
        "WatermarkRemover.js ch\u01B0a \u0111\u01B0\u1EE3c n\u1EA1p",
      );
    if (!cfg?.video?.logo_types?.length) {
      return { blob, applied: false, reason: "no_config", stats };
    }
    if (blob.size > MAX_INPUT_BYTES) {
      throw new VideoWmError(
        "TOO_LARGE",
        `clip ${(blob.size / 1048576).toFixed(0)} MB v\u01B0\u1EE3t tr\u1EA7n ${(MAX_INPUT_BYTES / 1048576) | 0} MB`,
      );
    }
    const {
      Input,
      BlobSource,
      ALL_FORMATS,
      Output,
      Mp4OutputFormat,
      BufferTarget,
      VideoSampleSource,
      EncodedAudioPacketSource,
      EncodedPacketSink,
      VideoSampleSink,
      VideoSample,
    } = MB();
    const input = new Input({
      source: new BlobSource(blob),
      formats: ALL_FORMATS,
    });
    let output = null;
    try {
      const vTrack = await input.getPrimaryVideoTrack();
      if (!vTrack)
        return { blob, applied: false, reason: "no_video_track", stats };
      if (!(await vTrack.canDecode()))
        throw new VideoWmError(
          "CANNOT_DECODE",
          "codec kh\xF4ng gi\u1EA3i m\xE3 \u0111\u01B0\u1EE3c",
        );
      const W = vTrack.displayWidth ?? vTrack.codedWidth;
      const H = vTrack.displayHeight ?? vTrack.codedHeight;
      const duration = await input.computeDuration();
      onProgress({ phase: "sampling" });
      const sink = new VideoSampleSink(vTrack);
      const stamps = [];
      for (let i = 0; i < SAMPLE_FRAMES; i++) {
        stamps.push((duration * (i + 0.5)) / SAMPLE_FRAMES);
      }
      const cv = _mkCanvas(W, H);
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      const samples = [];
      for await (const s of sink.samplesAtTimestamps(stamps)) {
        if (!s) continue;
        s.draw(ctx, 0, 0, W, H);
        samples.push({ imageData: ctx.getImageData(0, 0, W, H) });
        s.close();
        if (cancelled()) throw new VideoWmError("CANCELLED");
      }
      stats.sampled = samples.length;
      if (!samples.length)
        throw new VideoWmError(
          "NO_FRAMES",
          "kh\xF4ng \u0111\u1ECDc \u0111\u01B0\u1EE3c frame n\xE0o",
        );
      const maskCache = new Map();
      const anchor = await _findAnchor(samples, cfg, maskCache);
      const thr = _threshold(cfg);
      if (!anchor || !Number.isFinite(thr) || anchor.pos.ncc < thr) {
        stats.ms = Date.now() - t0;
        return {
          blob,
          applied: false,
          reason: anchor ? "below_threshold" : "not_found",
          ncc: anchor?.pos.ncc,
          stats,
        };
      }
      let gain =
        WR().estimateGain(anchor.imageData, anchor.mask, anchor.pos, cfg) ?? 1;
      const _edgeCfg = cfg.video?.edge_cleanup || null;
      if (!_edgeCfg)
        console.warn(
          `${LOG} ch\u01B0a c\xF3 video.edge_cleanup \u2192 b\u1ECF b\u01B0\u1EDBc l\xE0m m\u01B0\u1EE3t bi\xEAn`,
        );
      const _darkDenoiseCfg = cfg.video?.postprocess?.dark_denoise || null;
      if (!_darkDenoiseCfg)
        console.warn(
          `${LOG} ch\u01B0a c\xF3 video.postprocess.dark_denoise \u2192 b\u1ECF l\u1ECDc n\u1EC1n t\u1ED1i`,
        );
      const _sp = cfg.detect?.subpixel;
      if (!_sp || _sp.enabled !== false) {
        const span = Math.max(0.5, ((Number(_sp?.window) || 3) - 1) / 2);
        const r = WR()._refineByRoughness(
          anchor.imageData,
          anchor.mask,
          anchor.pos,
          gain,
          span,
        );
        if (r && (r.dx || r.dy)) {
          anchor.mask = WR()._shiftMask(anchor.mask, r.dx, r.dy);
          gain =
            WR().estimateGain(anchor.imageData, anchor.mask, anchor.pos, cfg) ??
            gain;
          stats.subpixel = { dx: r.dx, dy: r.dy };
          console.log(
            `${LOG} tinh ch\u1EC9nh d\u01B0\u1EDBi-pixel: dx=${r.dx} dy=${r.dy} \xB7 gain\u2192${gain.toFixed(3)}`,
          );
        }
      }
      {
        const gB = WR().estimateGainBySurround(
          anchor.imageData,
          anchor.mask,
          anchor.pos,
          cfg,
        );
        if (gB != null && gB !== gain) {
          const score = (g) =>
            WR()._roughness(
              WR()._applyToPatch(anchor.imageData, anchor.mask, anchor.pos, g),
            );
          if (score(gB) < score(gain)) {
            console.log(
              `${LOG} gain theo n\u1EC1n xung quanh th\u1EAFng: ${gain.toFixed(3)} \u2192 ${gB.toFixed(3)}`,
            );
            gain = gB;
          }
        }
      }
      const codec = await vTrack.getCodec();
      let srcBitrate = null;
      try {
        srcBitrate =
          (await vTrack.computePacketStats(100))?.averageBitrate ?? null;
      } catch (e) {
        console.warn(
          `${LOG} kh\xF4ng \u0111o \u0111\u01B0\u1EE3c bitrate ngu\u1ED3n:`,
          e?.message,
        );
      }
      const _bpsRaw = [opt.bitrate, srcBitrate, W * H * 0.1 * 30]
        .map(Number)
        .find((v) => Number.isFinite(v) && v > 0);
      const bitrate = Math.max(1, Math.round(_bpsRaw ?? W * H * 3));
      output = new Output({
        format: new Mp4OutputFormat(),
        target: new BufferTarget(),
      });
      const vSource = new VideoSampleSource({
        codec: codec === "hevc" ? "hevc" : "avc",
        bitrate,
      });
      output.addVideoTrack(vSource);
      const aTrack = await input.getPrimaryAudioTrack();
      let aSource = null,
        aPackets = null;
      if (aTrack) {
        const aCodec = await aTrack.getCodec();
        if (aCodec) {
          aSource = new EncodedAudioPacketSource(aCodec);
          output.addAudioTrack(aSource);
          aPackets = new EncodedPacketSink(aTrack);
        } else {
          console.warn(
            `${LOG} kh\xF4ng nh\u1EADn ra codec audio \u2192 clip ra s\u1EBD KH\xD4NG c\xF3 ti\u1EBFng`,
          );
        }
      }
      await output.start();
      onProgress({ phase: "processing", frame: 0, total: null });
      let anchorPos = anchor.pos,
        anchorMask = anchor.mask;
      let n = 0;
      const _firstShift = async (track) => {
        try {
          const f = await track?.getFirstTimestamp?.();
          return Number.isFinite(f) && f < 0 ? -f : 0;
        } catch (e) {
          console.warn(
            `${LOG} kh\xF4ng \u0111\u1ECDc \u0111\u01B0\u1EE3c m\u1ED1c \u0111\u1EA7u:`,
            e?.message,
          );
          return 0;
        }
      };
      let _tsShift = await _firstShift(vTrack);
      const _aShift = await _firstShift(aTrack);
      const runSink = new VideoSampleSink(vTrack);
      for await (const s of runSink.samples()) {
        if (cancelled()) throw new VideoWmError("CANCELLED");
        s.draw(ctx, 0, 0, W, H);
        const img = ctx.getImageData(0, 0, W, H);
        const at = WR().verify(img, anchorMask, anchorPos);
        if (Number.isFinite(at) && at < thr) {
          stats.redetects++;
          const again = await WR().classifyLogo(img, cfg, maskCache, "video");
          if (again && again.pos.ncc >= thr) {
            anchorPos = again.pos;
            anchorMask = again.mask;
            const r2 =
              !_sp || _sp.enabled !== false
                ? WR()._refineByRoughness(
                    img,
                    anchorMask,
                    anchorPos,
                    gain,
                    Math.max(0.5, ((Number(_sp?.window) || 3) - 1) / 2),
                  )
                : null;
            if (r2 && (r2.dx || r2.dy))
              anchorMask = WR()._shiftMask(anchorMask, r2.dx, r2.dy);
          }
        }
        WR().apply(img, anchorMask, anchorPos, gain);
        if (_darkDenoiseCfg) {
          const denoise = WR().adaptiveDarkDenoise(
            img,
            anchorMask,
            anchorPos,
            _darkDenoiseCfg,
          );
          if (denoise?.applied) {
            stats.denoisedFrames++;
            stats.denoisedPixels += Number(denoise.touched) || 0;
          }
        }
        if (_edgeCfg) WR().smoothEdges(img, anchorMask, anchorPos, _edgeCfg);
        ctx.putImageData(img, 0, 0);
        if (s.timestamp + _tsShift < 0) _tsShift = -s.timestamp;
        const outSample = new VideoSample(cv, {
          timestamp: s.timestamp + _tsShift,
          duration: s.duration,
        });
        await vSource.add(outSample);
        outSample.close();
        s.close();
        n++;
        if (n % 5 === 0)
          onProgress({ phase: "processing", frame: n, total: null });
      }
      stats.frames = n;
      if (!n)
        throw new VideoWmError(
          "NO_FRAMES",
          "kh\xF4ng encode \u0111\u01B0\u1EE3c frame n\xE0o",
        );
      if (aSource && aPackets) {
        onProgress({ phase: "audio" });
        let first = true;
        for await (const p of aPackets.packets()) {
          if (cancelled()) throw new VideoWmError("CANCELLED");
          const _p2 =
            _aShift && p.timestamp != null && p.clone
              ? p.clone({ timestamp: p.timestamp + _aShift })
              : p;
          await aSource.add(
            _p2,
            first ? { decoderConfig: await aTrack.getDecoderConfig() } : void 0,
          );
          first = false;
        }
      }
      onProgress({ phase: "finalizing" });
      await output.finalize();
      const buf = output.target.buffer;
      if (!buf)
        throw new VideoWmError(
          "NO_OUTPUT",
          "mux xong nh\u01B0ng kh\xF4ng c\xF3 buffer",
        );
      stats.ms = Date.now() - t0;
      const ratio = stats.frames ? stats.redetects / stats.frames : 0;
      if (ratio > REDETECT_WARN_RATIO) {
        console.warn(
          `${LOG} ph\u1EA3i d\xF2 l\u1EA1i ${(ratio * 100).toFixed(1)}% frame \u2014 Flow c\xF3 th\u1EC3 \u0111\xE3 \u0111\u1ED5i c\xE1ch \u0111\u1EB7t watermark`,
        );
      }
      if (_darkDenoiseCfg) {
        console.log(
          `${LOG} l\u1ECDc n\u1EC1n t\u1ED1i ${stats.denoisedFrames}/${stats.frames} frame \xB7 ${stats.denoisedPixels} pixel`,
        );
      }
      return {
        blob: new Blob([buf], { type: "video/mp4" }),
        applied: true,
        variantId: anchor.variant.id,
        ncc: anchor.pos.ncc,
        gain,
        stats: { ...stats, redetectRatio: ratio },
      };
    } finally {
      try {
        if (output && output.state !== "finalized") await output.cancel();
      } catch (_) {}
      try {
        await input.dispose?.();
      } catch (_) {}
    }
  }
  self.VideoWatermarkRemover = { process, VideoWmError, SAMPLE_FRAMES };
})();
