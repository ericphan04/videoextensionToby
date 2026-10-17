(function () {
  "use strict";
  const DEBUG = false;
  const log = (...a) => {
    if (DEBUG) console.log("[WatermarkRemover]", ...a);
  };
  const REQUIRED_DETECT = [
    "ncc_threshold",
    "search_margin_min",
    "search_margin_max",
  ];
  function missingFields(cfg) {
    const miss = [];
    const d = cfg?.detect || {};
    for (const k of REQUIRED_DETECT)
      if (!Number.isFinite(d[k])) miss.push(`detect.${k}`);
    if (!Number.isFinite(cfg?.validate?.min_ncc_after))
      miss.push("validate.min_ncc_after");
    const gs = d.gain_search;
    if (gs && gs.enabled !== false) {
      for (const k of ["min", "max", "steps"])
        if (!Number.isFinite(gs[k])) miss.push(`detect.gain_search.${k}`);
    }
    return miss;
  }
  class WatermarkRemover {
    static async loadAlphaMap(b64) {
      if (!b64 || typeof b64 !== "string") return null;
      try {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const bmp = await createImageBitmap(
          new Blob([bytes], { type: "image/png" }),
        );
        const w = bmp.width,
          h = bmp.height;
        if (!w || !h) {
          bmp.close?.();
          return null;
        }
        const oc = new OffscreenCanvas(w, h);
        const ctx = oc.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(bmp, 0, 0);
        bmp.close?.();
        const px = ctx.getImageData(0, 0, w, h).data;
        const alpha = new Float32Array(w * h);
        for (let i = 0, p = 0; i < alpha.length; i++, p += 4) {
          alpha[i] = Math.max(px[p], px[p + 1], px[p + 2]) / 255;
        }
        return {
          data: alpha,
          w,
          h,
          mean: WatermarkRemover._mean(alpha),
          std: WatermarkRemover._std(alpha),
        };
      } catch (e) {
        console.warn(
          "[WatermarkRemover] alpha map h\u1ECFng, b\u1ECF qua variant:",
          e?.message,
        );
        return null;
      }
    }
    static _mean(arr) {
      let s = 0;
      for (let i = 0; i < arr.length; i++) s += arr[i];
      return s / arr.length;
    }
    static _std(arr) {
      const m = WatermarkRemover._mean(arr);
      let v = 0;
      for (let i = 0; i < arr.length; i++) {
        const d = arr[i] - m;
        v += d * d;
      }
      return Math.sqrt(v);
    }
    static _nccAt(lum, W, mask, x, y) {
      const { data: a, w: mw, h: mh, mean: aMean, std: aStd } = mask;
      if (aStd < 1e-9) return -1;
      let s = 0,
        s2 = 0;
      for (let j = 0; j < mh; j++) {
        const row = (y + j) * W + x;
        for (let i = 0; i < mw; i++) {
          const v = lum[row + i];
          s += v;
          s2 += v * v;
        }
      }
      const n = mw * mh;
      const mean = s / n;
      const std = Math.sqrt(Math.max(1e-9, s2 - s * mean));
      let cov = 0;
      for (let j = 0; j < mh; j++) {
        const row = (y + j) * W + x;
        const mrow = j * mw;
        for (let i = 0; i < mw; i++)
          cov += (lum[row + i] - mean) * (a[mrow + i] - aMean);
      }
      return cov / (std * aStd);
    }
    static _luma(imageData) {
      const { data, width: W, height: H } = imageData;
      const lum = new Float32Array(W * H);
      for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
        lum[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
      }
      return lum;
    }
    static _locateByTable(imageData, mask, cfg) {
      const table = cfg?.detect?.margin_by_short_side;
      if (!table || typeof table !== "object") return null;
      const W = imageData.width,
        H = imageData.height;
      const m = Number(table[String(Math.min(W, H))]);
      if (!Number.isFinite(m)) return null;
      if (mask.w > W || mask.h > H) return null;
      const SLACK = Number.isFinite(cfg?.detect?.table_slack)
        ? cfg.detect.table_slack
        : 8;
      const lum =
        imageData._lumaCache ||
        (imageData._lumaCache = WatermarkRemover._luma(imageData));
      let best = { ncc: -2, x: 0, y: 0, anchor: "table" };
      for (let dy = -SLACK; dy <= SLACK; dy++) {
        for (let dx = -SLACK; dx <= SLACK; dx++) {
          const x = W - mask.w - m + dx,
            y = H - mask.h - m + dy;
          if (x < 0 || y < 0 || x + mask.w > W || y + mask.h > H) continue;
          const ncc = WatermarkRemover._nccAt(lum, W, mask, x, y);
          if (ncc > best.ncc) best = { ncc, x, y, anchor: "table" };
        }
      }
      return best.ncc > -2 ? best : null;
    }
    static locate(imageData, mask, cfg, mediaType = "image", logoType = null) {
      const W = imageData.width,
        H = imageData.height;
      const d = cfg?.detect || {};
      let marginMin = d.search_margin_min;
      let marginMax = d.search_margin_max;
      let byFormula = false;
      if (mask.w > W || mask.h > H) return null;
      if (mediaType !== "video" && !logoType?.margin_formula) {
        const byTable = WatermarkRemover._locateByTable(imageData, mask, cfg);
        const thr = d.ncc_threshold;
        if (byTable && Number.isFinite(thr) && byTable.ncc >= thr) {
          console.log(
            `[WM] v\u1ECB tr\xED t\u1EEB B\u1EA2NG TRA (c\u1EA1nh ng\u1EAFn ${Math.min(W, H)}) ncc=${byTable.ncc.toFixed(3)}`,
          );
          return byTable;
        }
        if (byTable) {
          console.log(
            `[WM] b\u1EA3ng tra ncc=${byTable.ncc.toFixed(3)} < ${thr} \u2192 B\u1ECE QUA (kh\xF4ng qu\xE9t: d\u1EC5 d\u01B0\u01A1ng gi\u1EA3)`,
          );
          return byTable;
        }
        if (cfg?.detect?.margin_by_short_side) {
          console.log(
            `[WM] c\u1EA1nh ng\u1EAFn ${Math.min(W, H)} kh\xF4ng c\xF3 trong b\u1EA3ng tra \u2192 QU\xC9T`,
          );
        }
      }
      if (logoType && (mediaType === "video" || logoType.margin_formula)) {
        const shortSide = Math.min(W, H);
        const size = Math.max(mask.w, mask.h);
        let m = null;
        const f = String(logoType.margin_formula || "");
        if (/2\s*\*\s*size/.test(f)) m = 2 * size;
        else {
          const div = f.match(/short_side\s*\/\s*(\d+(?:\.\d+)?)/);
          if (div) m = shortSide / parseFloat(div[1]);
        }
        if (m == null || !Number.isFinite(m)) {
          console.warn(
            "[WatermarkRemover] video: kh\xF4ng \u0111\u1ECDc \u0111\u01B0\u1EE3c margin_formula:",
            f || "(tr\u1ED1ng)",
          );
          return null;
        }
        const SLACK = 8;
        marginMin = Math.max(0, Math.round(m) - SLACK);
        marginMax = Math.round(m) + SLACK;
        byFormula = true;
      }
      const marginMinY = byFormula
        ? marginMin
        : Number.isFinite(d.search_margin_min_y)
          ? d.search_margin_min_y
          : marginMin;
      const marginMaxY = byFormula
        ? marginMax
        : Number.isFinite(d.search_margin_max_y)
          ? d.search_margin_max_y
          : marginMax;
      const x0 = Math.max(0, W - mask.w - marginMax);
      const x1 = Math.min(W - mask.w, W - mask.w - marginMin);
      const y0 = Math.max(0, H - mask.h - marginMaxY);
      const y1 = Math.min(H - mask.h, H - mask.h - marginMinY);
      if (x1 < x0 || y1 < y0) return null;
      const lum =
        imageData._lumaCache ||
        (imageData._lumaCache = WatermarkRemover._luma(imageData));
      let best = { ncc: -2, x: 0, y: 0 };
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const ncc = WatermarkRemover._nccAt(lum, W, mask, x, y);
          if (ncc > best.ncc) best = { ncc, x, y };
        }
      }
      if (best.ncc <= -2) return null;
      return { x: best.x, y: best.y, ncc: best.ncc };
    }
    static _resizeMask(mask, outW, outH) {
      const w = Math.max(1, Math.round(outW)),
        h = Math.max(1, Math.round(outH));
      if (w === mask.w && h === mask.h) return mask;
      const { data: a, w: mw, h: mh } = mask;
      const out = new Float32Array(w * h);
      const rx = mw / w,
        ry = mh / h;
      for (let j = 0; j < h; j++) {
        const sy = Math.min(mh - 1, Math.max(0, (j + 0.5) * ry - 0.5));
        const y0 = Math.floor(sy),
          fy = sy - y0,
          y1 = Math.min(mh - 1, y0 + 1);
        for (let i = 0; i < w; i++) {
          const sx = Math.min(mw - 1, Math.max(0, (i + 0.5) * rx - 0.5));
          const x0 = Math.floor(sx),
            fx = sx - x0,
            x1 = Math.min(mw - 1, x0 + 1);
          out[j * w + i] =
            a[y0 * mw + x0] * (1 - fx) * (1 - fy) +
            a[y0 * mw + x1] * fx * (1 - fy) +
            a[y1 * mw + x0] * (1 - fx) * fy +
            a[y1 * mw + x1] * fx * fy;
        }
      }
      return {
        data: out,
        w,
        h,
        mean: WatermarkRemover._mean(out),
        std: WatermarkRemover._std(out),
      };
    }
    static _shiftMask(mask, dx, dy) {
      if (!dx && !dy) return mask;
      const { data: a, w, h } = mask;
      const out = new Float32Array(w * h);
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const sx = i - dx,
            sy = j - dy;
          const x0 = Math.floor(sx),
            y0 = Math.floor(sy);
          const fx = sx - x0,
            fy = sy - y0;
          const get = (px, py) =>
            px < 0 || py < 0 || px >= w || py >= h ? 0 : a[py * w + px];
          out[j * w + i] =
            get(x0, y0) * (1 - fx) * (1 - fy) +
            get(x0 + 1, y0) * fx * (1 - fy) +
            get(x0, y0 + 1) * (1 - fx) * fy +
            get(x0 + 1, y0 + 1) * fx * fy;
        }
      }
      return {
        data: out,
        w,
        h,
        mean: WatermarkRemover._mean(out),
        std: WatermarkRemover._std(out),
      };
    }
    static estimateGain(imageData, mask, pos, cfg) {
      const gs = cfg?.detect?.gain_search;
      if (!gs || gs.enabled === false) return 1;
      const gMin = gs.min;
      const gMax = gs.max;
      const steps = Math.max(2, Math.min(30, gs.steps));
      const probe = (gain) =>
        Math.abs(
          WatermarkRemover._nccOnPatch(
            WatermarkRemover._applyToPatch(imageData, mask, pos, gain),
            mask,
          ),
        );
      let bestGain = 1,
        bestAbs = Infinity;
      let lo = gMin,
        hi = gMax;
      for (let pass = 0; pass < 3; pass++) {
        const step = (hi - lo) / (steps - 1);
        for (let k = 0; k < steps; k++) {
          const gain = lo + step * k;
          const abs = probe(gain);
          if (abs < bestAbs) {
            bestAbs = abs;
            bestGain = gain;
          }
        }
        lo = Math.max(gMin, bestGain - step);
        hi = Math.min(gMax, bestGain + step);
        if (hi - lo < 1e-4) break;
      }
      log(
        "estimateGain \u2192",
        bestGain.toFixed(4),
        "residual |ncc|",
        bestAbs.toFixed(3),
      );
      return bestGain;
    }
    static estimateGainBySurround(imageData, mask, pos, cfg) {
      const gs = cfg?.detect?.gain_search;
      if (!gs || gs.enabled === false) return null;
      const gMin = gs.min,
        gMax = gs.max;
      const steps = Math.max(2, Math.min(30, gs.steps));
      if (![gMin, gMax, steps].every(Number.isFinite)) return null;
      const { data, width: W, height: H } = imageData;
      const { w: mw, h: mh } = mask;
      const pad = Math.max(8, Math.round(0.25 * mw));
      let sum = 0,
        n = 0;
      for (let y = pos.y - pad; y < pos.y + mh + pad; y++) {
        if (y < 0 || y >= H) continue;
        for (let x = pos.x - pad; x < pos.x + mw + pad; x++) {
          if (x < 0 || x >= W) continue;
          if (x >= pos.x && x < pos.x + mw && y >= pos.y && y < pos.y + mh)
            continue;
          const p = (y * W + x) * 4;
          sum += 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
          n++;
        }
      }
      if (n < 16) return null;
      const target = sum / n;
      const a = mask.data;
      let bestGain = null,
        bestErr = Infinity;
      for (let k = 0; k < steps; k++) {
        const gain = gMin + (gMax - gMin) * (k / (steps - 1));
        const patch = WatermarkRemover._applyToPatch(
          imageData,
          mask,
          pos,
          gain,
        );
        let err = 0,
          wsum = 0;
        for (let i = 0; i < a.length; i++) {
          const wgt = a[i];
          if (wgt <= 0.04) continue;
          const d = patch.lum[i] - target;
          err += wgt * d * d;
          wsum += wgt;
        }
        if (!wsum) continue;
        const e = err / wsum;
        if (e < bestErr) {
          bestErr = e;
          bestGain = gain;
        }
      }
      return bestGain;
    }
    static _applyToPatch(imageData, mask, pos, gain) {
      const { data, width: W } = imageData;
      const { data: a, w: mw, h: mh } = mask;
      const out = new Float32Array(mw * mh);
      for (let j = 0; j < mh; j++) {
        const row = (pos.y + j) * W + pos.x;
        for (let i = 0; i < mw; i++) {
          const al = Math.min(0.97, a[j * mw + i] * gain);
          const p = (row + i) * 4;
          let r = data[p],
            g = data[p + 1],
            b = data[p + 2];
          if (al > 0.002) {
            const inv = 1 - al,
              off = al * 255;
            r = (r - off) / inv;
            g = (g - off) / inv;
            b = (b - off) / inv;
          }
          out[j * mw + i] =
            0.299 * WatermarkRemover._clamp(r) +
            0.587 * WatermarkRemover._clamp(g) +
            0.114 * WatermarkRemover._clamp(b);
        }
      }
      return { lum: out, w: mw, h: mh };
    }
    static _nccOnPatch(patch, mask) {
      const { lum, w, h } = patch;
      const { data: a, mean: aMean, std: aStd } = mask;
      if (aStd < 1e-9) return 0;
      const n = w * h;
      let s = 0,
        s2 = 0;
      for (let i = 0; i < n; i++) {
        s += lum[i];
        s2 += lum[i] * lum[i];
      }
      const mean = s / n;
      const std = Math.sqrt(Math.max(1e-9, s2 - s * mean));
      let cov = 0;
      for (let i = 0; i < n; i++) cov += (lum[i] - mean) * (a[i] - aMean);
      return cov / (std * aStd);
    }
    static _clamp(v) {
      return v < 0 ? 0 : v > 255 ? 255 : v;
    }
    static smoothEdges(imageData, mask, pos, opts) {
      const radius = Math.max(1, Math.round(Number(opts?.radius)));
      const strength = Number(opts?.strength);
      const maxPasses = Math.max(1, Math.round(Number(opts?.passes)));
      const floor = Number(opts?.alpha_floor);
      if (
        ![radius, strength, maxPasses, floor].every(Number.isFinite) ||
        strength <= 0
      ) {
        console.warn(
          "[WatermarkRemover] smoothEdges: thi\u1EBFu tham s\u1ED1 \u2192 b\u1ECF qua",
        );
        return 0;
      }
      const { data, width: W, height: H } = imageData;
      const { data: a, w: mw, h: mh } = mask;
      const act = new Uint8Array(mw * mh);
      for (let j = 0; j < mh; j++) {
        for (let i = 0; i < mw; i++) {
          if (a[j * mw + i] <= floor) continue;
          for (let dj = -radius; dj <= radius; dj++) {
            for (let di = -radius; di <= radius; di++) {
              const r = j + dj,
                c = i + di;
              if (r >= 0 && r < mh && c >= 0 && c < mw) act[r * mw + c] = 1;
            }
          }
        }
      }
      let touched = 0;
      for (let pass = 0; pass < maxPasses; pass++) {
        const next = act.slice();
        let changed = 0;
        for (let j = 0; j < mh; j++) {
          for (let i = 0; i < mw; i++) {
            if (!act[j * mw + i]) continue;
            const gx = pos.x + i,
              gy = pos.y + j;
            if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
            let n = 0;
            const sum = [0, 0, 0];
            for (let dj = -1; dj <= 1; dj++) {
              for (let di = -1; di <= 1; di++) {
                if (!di && !dj) continue;
                const r = j + dj,
                  c = i + di;
                if (r < 0 || r >= mh || c < 0 || c >= mw || act[r * mw + c])
                  continue;
                const ny = pos.y + r,
                  nx = pos.x + c;
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                const ni = (ny * W + nx) * 4;
                sum[0] += data[ni];
                sum[1] += data[ni + 1];
                sum[2] += data[ni + 2];
                n++;
              }
            }
            if (!n) continue;
            const idx = (gy * W + gx) * 4;
            for (let ch = 0; ch < 3; ch++) {
              data[idx + ch] = Math.round(
                data[idx + ch] * (1 - strength) + (sum[ch] / n) * strength,
              );
            }
            next[j * mw + i] = 0;
            changed++;
            touched++;
          }
        }
        act.set(next);
        if (!changed) break;
      }
      return touched;
    }
    static adaptiveDarkDenoise(imageData, mask, pos, opts) {
      if (opts?.enabled !== true) return { applied: false, reason: "disabled" };
      const threshold = Number(opts.luma_threshold);
      const radius = Math.round(Number(opts.radius));
      const sigmaSpace = Number(opts.sigma_space);
      const sigmaRange = Number(opts.sigma_range);
      const maxBlend = Number(opts.max_blend);
      const alphaFloor = Number(opts.alpha_floor);
      const backgroundAlphaMax = Number(opts.background_alpha_max);
      if (
        ![
          threshold,
          radius,
          sigmaSpace,
          sigmaRange,
          maxBlend,
          alphaFloor,
          backgroundAlphaMax,
        ].every(Number.isFinite) ||
        threshold <= 0 ||
        radius < 1 ||
        sigmaSpace <= 0 ||
        sigmaRange <= 0 ||
        maxBlend <= 0 ||
        maxBlend > 1 ||
        alphaFloor < 0 ||
        backgroundAlphaMax < 0
      ) {
        console.warn(
          "[WatermarkRemover] adaptiveDarkDenoise: config thi\u1EBFu/sai \u2192 b\u1ECF qua",
        );
        return { applied: false, reason: "config_invalid" };
      }
      const { data, width: W, height: H } = imageData;
      const { data: alpha, w: mw, h: mh } = mask;
      let backgroundLuma = 0,
        backgroundCount = 0;
      for (let j = 0; j < mh; j++) {
        for (let i = 0; i < mw; i++) {
          if (alpha[j * mw + i] > backgroundAlphaMax) continue;
          const x = pos.x + i,
            y = pos.y + j;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const p = (y * W + x) * 4;
          backgroundLuma +=
            0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
          backgroundCount++;
        }
      }
      const meanLuma = backgroundCount ? backgroundLuma / backgroundCount : 255;
      if (meanLuma >= threshold)
        return {
          applied: false,
          reason: "background_not_dark",
          backgroundLuma: meanLuma,
        };
      const strength = Math.min(
        maxBlend,
        maxBlend * (1 - meanLuma / threshold),
      );
      const pad = radius;
      const x0 = Math.max(0, pos.x - pad),
        y0 = Math.max(0, pos.y - pad);
      const x1 = Math.min(W, pos.x + mw + pad),
        y1 = Math.min(H, pos.y + mh + pad);
      const rw = x1 - x0,
        rh = y1 - y0;
      const source = new Uint8ClampedArray(rw * rh * 3);
      for (let y = 0; y < rh; y++)
        for (let x = 0; x < rw; x++) {
          const src = ((y0 + y) * W + x0 + x) * 4,
            dst = (y * rw + x) * 3;
          source[dst] = data[src];
          source[dst + 1] = data[src + 1];
          source[dst + 2] = data[src + 2];
        }
      let touched = 0;
      for (let j = 0; j < mh; j++)
        for (let i = 0; i < mw; i++) {
          const al = alpha[j * mw + i];
          if (al <= alphaFloor) continue;
          const gx = pos.x + i,
            gy = pos.y + j,
            rx = gx - x0,
            ry = gy - y0;
          if (
            rx < radius ||
            ry < radius ||
            rx >= rw - radius ||
            ry >= rh - radius
          )
            continue;
          const center = (ry * rw + rx) * 3;
          const sums = [0, 0, 0],
            weights = [0, 0, 0];
          for (let dy = -radius; dy <= radius; dy++)
            for (let dx = -radius; dx <= radius; dx++) {
              const sample = ((ry + dy) * rw + rx + dx) * 3;
              const spatial = Math.exp(-(dx * dx + dy * dy) / sigmaSpace);
              for (let c = 0; c < 3; c++) {
                const delta = source[sample + c] - source[center + c];
                const weight =
                  spatial * Math.exp(-(delta * delta) / sigmaRange);
                sums[c] += source[sample + c] * weight;
                weights[c] += weight;
              }
            }
          const blend = Math.min(maxBlend, Math.pow(al, 0.8) * strength);
          const out = (gy * W + gx) * 4;
          for (let c = 0; c < 3; c++) {
            const filtered =
              weights[c] > 1e-9 ? sums[c] / weights[c] : data[out + c];
            data[out + c] = Math.round(
              data[out + c] * (1 - blend) + filtered * blend,
            );
          }
          touched++;
        }
      return {
        applied: touched > 0,
        touched,
        strength,
        backgroundLuma: meanLuma,
      };
    }
    static apply(imageData, mask, pos, gain) {
      const { data, width: W } = imageData;
      const { data: a, w: mw, h: mh } = mask;
      const g = Number.isFinite(gain) ? gain : 1;
      let touched = 0;
      for (let j = 0; j < mh; j++) {
        const row = (pos.y + j) * W + pos.x;
        for (let i = 0; i < mw; i++) {
          const al = Math.min(0.97, a[j * mw + i] * g);
          if (al <= 0.002) continue;
          const p = (row + i) * 4;
          const inv = 1 - al,
            off = al * 255;
          data[p] = WatermarkRemover._clamp((data[p] - off) / inv);
          data[p + 1] = WatermarkRemover._clamp((data[p + 1] - off) / inv);
          data[p + 2] = WatermarkRemover._clamp((data[p + 2] - off) / inv);
          touched++;
        }
      }
      return touched;
    }
    static _roughness(patch) {
      const { lum, w, h } = patch;
      let sum = 0;
      for (let j = 1; j < h - 1; j++) {
        for (let i = 1; i < w - 1; i++) {
          const k = j * w + i;
          sum +=
            Math.abs(lum[k + 1] - lum[k - 1]) +
            Math.abs(lum[k + w] - lum[k - w]);
        }
      }
      return sum / ((w - 2) * (h - 2));
    }
    static _refineByRoughness(imageData, mask, pos, gain, span) {
      const step = 0.25;
      let best = { dx: 0, dy: 0, score: Infinity };
      for (let dy = -span; dy <= span + 1e-9; dy += step) {
        for (let dx = -span; dx <= span + 1e-9; dx += step) {
          const m = dx || dy ? WatermarkRemover._shiftMask(mask, dx, dy) : mask;
          const score = WatermarkRemover._roughness(
            WatermarkRemover._applyToPatch(imageData, m, pos, gain),
          );
          if (score < best.score) best = { dx, dy, score };
        }
      }
      return best;
    }
    static _snapshot(imageData, mask, pos) {
      const { data, width: W } = imageData;
      const { w: mw, h: mh } = mask;
      const buf = new Uint8ClampedArray(mw * mh * 4);
      for (let j = 0; j < mh; j++) {
        const src = ((pos.y + j) * W + pos.x) * 4;
        buf.set(data.subarray(src, src + mw * 4), j * mw * 4);
      }
      return buf;
    }
    static _restore(imageData, buf, mask, pos) {
      const { data, width: W } = imageData;
      const { w: mw, h: mh } = mask;
      for (let j = 0; j < mh; j++) {
        data.set(
          buf.subarray(j * mw * 4, (j + 1) * mw * 4),
          ((pos.y + j) * W + pos.x) * 4,
        );
      }
    }
    static verify(imageData, mask, pos) {
      const patch = WatermarkRemover._applyToPatch(imageData, mask, pos, 0);
      return WatermarkRemover._nccOnPatch(patch, mask);
    }
    static async classifyLogo(imageData, cfg, maskCache, mediaType = "image") {
      const list =
        mediaType === "video"
          ? Array.isArray(cfg?.video?.logo_types)
            ? cfg.video.logo_types
            : []
          : Array.isArray(cfg?.variants)
            ? cfg.variants
            : [];
      if (!list.length) return null;
      const shortSide = Math.min(imageData.width, imageData.height);
      const sorted = [...list].sort(
        (a, b) => (a.priority || 99) - (b.priority || 99),
      );
      let best = null;
      for (const v of sorted) {
        if (!v?.alpha_png_b64) continue;
        const _ck = `${mediaType}:${v.id}`;
        let mask = maskCache?.get(_ck);
        if (!mask) {
          mask = await WatermarkRemover.loadAlphaMap(v.alpha_png_b64);
          if (!mask) continue;
          maskCache?.set(_ck, mask);
        }
        const _base =
          mediaType === "video"
            ? Number(v.base_short_side) || 720
            : Number(v.base_short_side) || 0;
        if (_base > 0) {
          const k = shortSide / _base;
          if (Math.abs(k - 1) > 0.01)
            mask = WatermarkRemover._resizeMask(mask, mask.w * k, mask.h * k);
        }
        const pos = WatermarkRemover.locate(imageData, mask, cfg, mediaType, v);
        if (!pos) continue;
        const eps = Number.isFinite(cfg?.detect?.variant_priority_eps)
          ? cfg.detect.variant_priority_eps
          : 0;
        const bias =
          best && (v.priority || 99) > (best.variant.priority || 99) ? eps : 0;
        if (!best || pos.ncc > best.pos.ncc + bias)
          best = { variant: v, mask, pos };
      }
      return best;
    }
    static async process(imageData, cfg, maskCache, mediaType = "image") {
      const t = {};
      const mark = (k, t02) => {
        t[k] = Math.round((performance.now() - t02) * 100) / 100;
      };
      const hasList =
        mediaType === "video"
          ? !!(
              cfg?.video?.apply_to?.includes("video") &&
              cfg.video.logo_types?.length
            )
          : !!(Array.isArray(cfg?.variants) && cfg.variants.length);
      if (!hasList) {
        console.warn(
          `[WatermarkRemover] config thi\u1EBFu nh\xE1nh ${mediaType} \u2192 b\u1ECF qua`,
        );
        return { applied: false, reason: "no_config", timings: t };
      }
      const miss = missingFields(cfg);
      if (miss.length) {
        console.warn(
          "[WatermarkRemover] config thi\u1EBFu field \u2192 b\u1ECF qua:",
          miss.join(", "),
        );
        return {
          applied: false,
          reason: "config_incomplete",
          missing: miss,
          timings: t,
        };
      }
      let t0 = performance.now();
      const found = await WatermarkRemover.classifyLogo(
        imageData,
        cfg,
        maskCache,
        mediaType,
      );
      mark("locate", t0);
      if (!found) return { applied: false, reason: "not_found", timings: t };
      let threshold = cfg.detect.ncc_threshold;
      if (mediaType === "video") {
        const vt = cfg.video?.detect?.ncc_threshold;
        if (Number.isFinite(vt)) threshold = vt;
        else
          console.warn(
            "[WatermarkRemover] video ch\u01B0a c\xF3 ng\u01B0\u1EE1ng ri\xEAng \u2192 t\u1EA1m d\xF9ng ng\u01B0\u1EE1ng \u1EA3nh",
            threshold,
          );
      } else if (found.pos.anchor === "table") {
        const exactThreshold = cfg.detect?.exact_anchor_ncc_threshold;
        const exactVariants = cfg.detect?.exact_anchor_variant_ids;
        if (
          Number.isFinite(exactThreshold) &&
          Array.isArray(exactVariants) &&
          exactVariants.includes(found.variant.id)
        ) {
          threshold = exactThreshold;
        } else if (Number.isFinite(exactThreshold)) {
          console.log(
            `[WM] kh\xF4ng h\u1EA1 threshold cho variant ${found.variant.id} t\u1EA1i b\u1EA3ng neo`,
          );
        }
      }
      console.log(
        `[WM] threshold route=${found.pos.anchor || "scan"} ncc=${found.pos.ncc.toFixed(3)} threshold=${threshold}`,
      );
      if (found.pos.ncc < threshold) {
        return {
          applied: false,
          reason: "below_threshold",
          ncc: found.pos.ncc,
          variantId: found.variant.id,
          timings: t,
        };
      }
      let mask = found.mask;
      const sp = cfg.detect?.subpixel;
      const doSub = !sp || sp.enabled !== false;
      t0 = performance.now();
      let gain = WatermarkRemover.estimateGain(imageData, mask, found.pos, cfg);
      mark("gain", t0);
      t0 = performance.now();
      if (doSub) {
        const span = Math.max(0.5, ((Number(sp?.window) || 3) - 1) / 2);
        const r = WatermarkRemover._refineByRoughness(
          imageData,
          mask,
          found.pos,
          gain,
          span,
        );
        if (r.dx || r.dy) {
          mask = WatermarkRemover._shiftMask(mask, r.dx, r.dy);
          t.subpixel_dx = r.dx;
          t.subpixel_dy = r.dy;
          gain = WatermarkRemover.estimateGain(imageData, mask, found.pos, cfg);
        }
      }
      mark("subpixel", t0);
      t0 = performance.now();
      const backup = WatermarkRemover._snapshot(imageData, mask, found.pos);
      const touched = WatermarkRemover.apply(imageData, mask, found.pos, gain);
      const denoise =
        mediaType === "image"
          ? WatermarkRemover.adaptiveDarkDenoise(
              imageData,
              mask,
              found.pos,
              cfg.postprocess?.dark_denoise,
            )
          : { applied: false, reason: "image_only" };
      mark("blend", t0);
      delete imageData._lumaCache;
      const nccAfter = WatermarkRemover.verify(imageData, mask, found.pos);
      const minAfter = cfg.validate.min_ncc_after;
      if (!(Math.abs(nccAfter) <= minAfter)) {
        WatermarkRemover._restore(imageData, backup, mask, found.pos);
        delete imageData._lumaCache;
        console.warn(
          `[WatermarkRemover] ki\u1EC3m ch\u1EE9ng tr\u01B0\u1EE3t (c\xF2n ${nccAfter.toFixed(3)}) \u2192 ho\xE0n t\xE1c, gi\u1EEF \u1EA3nh g\u1ED1c`,
        );
        return {
          applied: false,
          reason: "verify_failed",
          ncc: found.pos.ncc,
          nccAfter,
          variantId: found.variant.id,
          timings: t,
        };
      }
      return {
        applied: true,
        variantId: found.variant.id,
        ncc: found.pos.ncc,
        nccAfter,
        gain,
        touched,
        denoise,
        pos: { x: found.pos.x, y: found.pos.y, w: mask.w, h: mask.h },
        clean: true,
        timings: t,
      };
    }
  }
  if (typeof window !== "undefined") window.WatermarkRemover = WatermarkRemover;
  if (typeof self !== "undefined" && typeof window === "undefined")
    self.WatermarkRemover = WatermarkRemover;
})();
