(function () {
  "use strict";
  const LOG = "[WatermarkClient]";
  function _allowed(mediaType, opt) {
    try {
      return (
        window.featureGate?.shouldRemoveWatermark?.(mediaType, opt) === true
      );
    } catch (_) {
      return false;
    }
  }
  async function _ask(payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(payload, (resp) => {
          resolve(chrome.runtime.lastError ? null : resp);
        });
      } catch (_) {
        resolve(null);
      }
    });
  }
  class WatermarkClient {
    static isNoWatermarkReason(reason) {
      return ["not_found", "below_threshold", "already_clean_output"].includes(
        reason,
      );
    }
    static isNoWatermarkResult(result) {
      return WatermarkClient.isNoWatermarkReason(
        result?.reason || result?.error,
      );
    }
    static fullSizeUrl(url) {
      if (typeof url !== "string" || !url) return url;
      if (
        !/googleusercontent\.com|storage\.googleapis\.com|lh\d+\.google/.test(
          url,
        )
      )
        return url;
      const qi = url.indexOf("?");
      const path = qi < 0 ? url : url.slice(0, qi);
      if (!/=[^/?]*$/.test(path)) return url;
      return path.replace(/=[^/]*$/, "") + (qi < 0 ? "" : url.slice(qi));
    }
    static async fullSizeInputUrl(url) {
      const standard = WatermarkClient.fullSizeUrl(url);
      if (standard !== url || typeof url !== "string" || !url) return standard;
      try {
        const parsed = new URL(url);
        if (
          parsed.origin !== "https://flow.google.com" ||
          !parsed.pathname.startsWith("/asb/")
        ) {
          return url;
        }
        const config = await window.ProviderConfigManager?.getForPage?.(
          "flow",
          "tile_video",
          "https://flow.google.com/",
        );
        const pattern =
          typeof config?.poster_transform_pattern === "string"
            ? config.poster_transform_pattern
            : "";
        if (!pattern || pattern.length > 120) return url;
        const nextPath = parsed.pathname.replace(new RegExp(pattern, "i"), "");
        if (nextPath === parsed.pathname) return url;
        parsed.pathname = nextPath;
        return parsed.toString();
      } catch (_) {
        return url;
      }
    }
    static async cleanBase64(
      base64,
      mime = "image/png",
      mediaType = "image",
      opt = {},
    ) {
      const asIs = { base64, mime, cleaned: false, original: true };
      if (!base64 || !_allowed(mediaType, opt)) return asIs;
      const sourceMediaType = /^image\//i.test(String(mime || ""))
        ? "image"
        : mediaType;
      const r = await _ask({
        action: "removeWatermark",
        base64,
        mime,
        mediaType,
        sourceMediaType,
      });
      if (!r?.success) {
        if (r?.error) console.warn(`${LOG} b\u1ECF qua:`, r.error);
        return { ...asIs, reason: r?.error || "WM_CLEAN_FAILED" };
      }
      if (!r.applied)
        return {
          ...asIs,
          reason: r.reason || "not_applied",
          noWatermark: WatermarkClient.isNoWatermarkResult(r),
        };
      return {
        base64: r.base64,
        mime: r.mime || mime,
        cleaned: true,
        original: false,
      };
    }
    static async cleanUrl(url, mediaType = "image", opt = {}) {
      if (!url || !_allowed(mediaType, opt)) return null;
      const r = await _ask({ action: "removeWatermark", url, mediaType });
      if (!r?.success || !r.applied) {
        if (r?.error) console.warn(`${LOG} b\u1ECF qua URL:`, r.error);
        return null;
      }
      return { base64: r.base64, mime: r.mime || "image/png" };
    }
    static async cleanDataUrl(dataUrl, mediaType = "image", opt = {}) {
      if (!dataUrl || !dataUrl.startsWith("data:") || !_allowed(mediaType, opt))
        return dataUrl;
      const m = /^data:([^;,]+)?(?:;base64)?,(.*)$/s.exec(dataUrl);
      if (!m || !m[2]) return dataUrl;
      const r = await WatermarkClient.cleanBase64(
        m[2],
        m[1] || "image/png",
        mediaType,
        opt,
      );
      return r.cleaned ? `data:${r.mime};base64,${r.base64}` : dataUrl;
    }
    static async cleanBlobResult(blob, mediaType = "image", opt = {}) {
      if (!blob)
        return { blob, cleaned: false, original: true, reason: "EMPTY_BLOB" };
      if (!_allowed(mediaType, opt)) {
        return { blob, cleaned: false, original: true, reason: "DISABLED" };
      }
      try {
        const b64 = await new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result).split(",")[1]);
          fr.onerror = () => reject(new Error("READ_FAILED"));
          fr.readAsDataURL(blob);
        });
        const r = await WatermarkClient.cleanBase64(
          b64,
          blob.type || "image/png",
          mediaType,
          opt,
        );
        if (!r.cleaned)
          return {
            blob,
            cleaned: false,
            original: true,
            reason: r.reason || "not_applied",
            noWatermark: r.noWatermark === true,
          };
        let bytes = null;
        if (typeof Uint8Array.fromBase64 === "function") {
          try {
            bytes = Uint8Array.fromBase64(r.base64);
          } catch (_) {}
        }
        if (!bytes) {
          const bin = atob(r.base64);
          bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        }
        const output = blob.name
          ? new File([bytes], blob.name, { type: r.mime })
          : new Blob([bytes], { type: r.mime });
        return { blob: output, cleaned: true, original: false };
      } catch (e) {
        console.warn(`${LOG} cleanBlob l\u1ED7i:`, e?.message);
        return {
          blob,
          cleaned: false,
          original: true,
          reason: e?.message || "WM_CLEAN_FAILED",
        };
      }
    }
    static async cleanBlob(blob, mediaType = "image", opt = {}) {
      return (await WatermarkClient.cleanBlobResult(blob, mediaType, opt)).blob;
    }
    static enabled(mediaType = "image", opt = {}) {
      return _allowed(mediaType, opt);
    }
  }
  window.WatermarkClient = WatermarkClient;
})();
