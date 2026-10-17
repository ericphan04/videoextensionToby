(function () {
  "use strict";
  if (window.__tobyMediaInterceptor) {
    if (typeof window.__tobyMediaInterceptorDispose === "function") {
      try {
        window.__tobyMediaInterceptorDispose();
      } catch (_) {}
    } else {
      return;
    }
  }
  window.__tobyMediaInterceptor = true;
  const LOG = "[MediaIntercept]";
  const CH_REQ = "TOBY_MEDIA_INTERCEPT";
  const CH_RES = "TOBY_MEDIA_INTERCEPT_RESULT";
  const CH_CFG = "TOBY_MEDIA_INTERCEPT_CONFIG";
  const CH_DL_CTX = "TOBY_MEDIA_DOWNLOAD_CONTEXT";
  const CH_DL_CTX_ACK = "TOBY_MEDIA_DOWNLOAD_CONTEXT_ACK";
  const CH_DONE = "TOBY_MEDIA_INTERCEPT_DONE";
  const CH_FALLBACK = "TOBY_MEDIA_INTERCEPT_FALLBACK";
  const CH_STATE = "TOBY_MEDIA_INTERCEPT_STATE";
  const say = (phase) => {
    try {
      window.postMessage({ channel: CH_STATE, phase }, "*");
    } catch (_) {}
  };
  const phaseFor = (reason) =>
    reason === "not_found" ||
    reason === "below_threshold" ||
    reason === "already_clean_output"
      ? "no_watermark"
      : "original";
  const sayResult = (phase) => say(phase);
  const NATIVE_FETCH = window.fetch.bind(window);
  const NATIVE_CLICK = HTMLElement.prototype.click;
  let cfg = null;
  let activeBid = null;
  const DONE_TTL_MS = 1e4;
  const done = new Map();
  const doneHas = (k) => {
    const at = done.get(k);
    if (at === void 0) return false;
    if (Date.now() - at > DONE_TTL_MS) {
      done.delete(k);
      return false;
    }
    return true;
  };
  const inflight = new Set();
  let seq = 0;
  const waiting = new Map();
  let activeDownloadContext = null;
  const DOWNLOAD_CONTEXT_TTL_MS = 95e3;
  const cleanedOutputs = new Map();
  const MAX_CLEANED_OUTPUTS = 32;
  const pruneCleanedOutputs = () => {
    for (const [key, at] of cleanedOutputs) {
      if (Date.now() - at > DOWNLOAD_CONTEXT_TTL_MS) cleanedOutputs.delete(key);
    }
  };
  async function outputFingerprint(base64, mime) {
    try {
      const digest = await window.crypto.subtle.digest(
        "SHA-256",
        fromB64(base64),
      );
      const hex = Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      return `${String(mime).split(";")[0].trim().toLowerCase()}:${hex}`;
    } catch (_) {
      return null;
    }
  }
  const SIG_PARAMS =
    /^(Expires|Signature|KeyName|Key-Pair-Id|Policy|token|authuser|alt|sz|_t|ts)$/i;
  function canon(u) {
    try {
      const s = String(u);
      const qi = s.indexOf("?");
      const path = qi < 0 ? s : s.slice(0, qi);
      if (/=[^/?]*$/.test(path)) return path.replace(/=[^/]*$/, "");
      if (qi < 0) return s;
      const keep = [];
      for (const kv of s.slice(qi + 1).split("&")) {
        if (!kv) continue;
        if (!SIG_PARAMS.test(kv.split("=")[0])) keep.push(kv);
      }
      keep.sort();
      return keep.length ? `${path}?${keep.join("&")}` : path;
    } catch (_) {
      return String(u);
    }
  }
  function urlOf(input) {
    if (typeof input === "string") return input;
    if (input && typeof input === "object") return input.url || "";
    return "";
  }
  function matches(url) {
    if (!cfg?.enabled || !cfg?.allowed || !url) return false;
    return (cfg.patterns || []).some((re) => {
      try {
        return re.test(url);
      } catch (_) {
        return false;
      }
    });
  }
  async function clean(base64, mime, url) {
    pruneCleanedOutputs();
    const inputKey = cleanedOutputs.size
      ? await outputFingerprint(base64, mime)
      : null;
    if (inputKey && cleanedOutputs.has(inputKey)) {
      console.log(
        `${LOG} gi\u1EEF byte \u0111\xE3 xo\xE1 watermark, kh\xF4ng x\u1EED l\xFD l\u1EA1i`,
      );
      return { b64: null, reason: "already_clean_output", cleaned: true };
    }
    const result = await new Promise((resolve) => {
      const id = `mi_${++seq}`;
      const isVideo = /^video\//i.test(mime || "");
      const budget =
        (!isVideo && cfg?.image_timeout_ms) || cfg?.timeout_ms || 12e4;
      const to = setTimeout(() => {
        waiting.delete(id);
        resolve({ b64: null, reason: "timeout" });
      }, budget);
      waiting.set(id, (r) => {
        clearTimeout(to);
        resolve(r);
      });
      window.postMessage({ channel: CH_REQ, id, base64, mime, url }, "*");
    });
    if (result.b64) {
      const outputKey = await outputFingerprint(result.b64, mime);
      if (outputKey) {
        cleanedOutputs.delete(outputKey);
        cleanedOutputs.set(outputKey, Date.now());
        while (cleanedOutputs.size > MAX_CLEANED_OUTPUTS)
          cleanedOutputs.delete(cleanedOutputs.keys().next().value);
      }
    }
    return result;
  }
  const toB64 = (buf) => {
    const b = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < b.length; i += 32768)
      s += String.fromCharCode.apply(null, b.subarray(i, i + 32768));
    return btoa(s);
  };
  const fromB64 = (s) => {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };
  window.fetch = function (input, init) {
    const url = urlOf(input);
    if (!matches(url)) return NATIVE_FETCH(input, init);
    return (async () => {
      const res = await NATIVE_FETCH(input, init);
      const key = canon(url);
      if (!res.ok || doneHas(key) || inflight.has(key)) return res;
      const hdr = String(res.headers.get("content-type") || "")
        .split(";")[0]
        .trim()
        .toLowerCase();
      if (
        hdr &&
        !/^(image|video)\//.test(hdr) &&
        hdr !== "application/octet-stream" &&
        hdr !== "binary/octet-stream"
      )
        return res;
      inflight.add(key);
      let _said = false;
      let _cleaned = false;
      let _reason = null;
      try {
        const buf = await res.clone().arrayBuffer();
        const ct = sniffType(buf, hdr);
        if (!/^(image|video)\//.test(ct)) return res;
        _said = true;
        const { b64, reason, cleaned } = await clean(toB64(buf), ct, url);
        _reason = reason;
        _cleaned = !!b64 || cleaned === true;
        if (!b64) return res;
        done.set(key, Date.now());
        console.log(
          `${LOG} \u0111\xE3 xo\xE1 watermark \u1EDF t\u1EA7ng m\u1EA1ng:`,
          key.slice(-40),
        );
        return new Response(fromB64(b64), {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
        });
      } catch (e) {
        console.warn(
          `${LOG} l\u1ED7i khi x\u1EED l\xFD, tr\u1EA3 b\u1EA3n g\u1ED1c:`,
          e?.message,
        );
        return res;
      } finally {
        inflight.delete(key);
        if (_said) sayResult(_cleaned ? "done" : phaseFor(_reason), _reason);
      }
    })();
  };
  function isTargetAnchor(a) {
    return (
      a instanceof HTMLAnchorElement &&
      a.hasAttribute("download") &&
      !a.hasAttribute("data-toby-passthrough") &&
      matches(a.href)
    );
  }
  function sniffType(buf, headerType) {
    const t = String(headerType || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (/^(image|video)\//.test(t)) return t;
    const b = new Uint8Array(buf, 0, Math.min(16, buf.byteLength));
    if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
    if (b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71)
      return "image/png";
    if (b[0] === 71 && b[1] === 73 && b[2] === 70) return "image/gif";
    if (
      b[0] === 82 &&
      b[1] === 73 &&
      b[2] === 70 &&
      b[3] === 70 &&
      b[8] === 87 &&
      b[9] === 69 &&
      b[10] === 66 &&
      b[11] === 80
    )
      return "image/webp";
    if (b[4] === 102 && b[5] === 116 && b[6] === 121 && b[7] === 112)
      return "video/mp4";
    return t || "application/octet-stream";
  }
  async function downloadCleaned(href, name, onFail) {
    const ctx =
      activeDownloadContext &&
      Date.now() - activeDownloadContext.at <= DOWNLOAD_CONTEXT_TTL_MS
        ? activeDownloadContext
        : null;
    const operationId = ctx?.operationId || null;
    say("downloading");
    try {
      let r = await NATIVE_FETCH(href, { cache: "no-store" }).catch(() => null);
      if (
        (!r || !r.ok) &&
        !/^blob:/i.test(href) &&
        !/\/\/[^/]*flow-content\.google/i.test(href)
      ) {
        r = await NATIVE_FETCH(href, {
          credentials: "include",
          cache: "no-store",
        });
      }
      if (!r || !r.ok)
        throw new Error(`HTTP ${r ? r.status : "kh\xF4ng ph\u1EA3n h\u1ED3i"}`);
      const buf = await r.arrayBuffer();
      const ct = sniffType(buf, r.headers.get("content-type"));
      const { b64, reason, cleaned } = await clean(toB64(buf), ct, href);
      const outputCleaned = !!b64 || cleaned === true;
      const bytes = b64 ? fromB64(b64) : new Uint8Array(buf);
      if (
        /^image\//i.test(ct) &&
        bytes.byteLength <= 20 * 1024 * 1024 &&
        crypto?.subtle
      ) {
        try {
          const digest = await crypto.subtle.digest("SHA-256", bytes);
          const shortHash = Array.from(new Uint8Array(digest).subarray(0, 8))
            .map((v) => v.toString(16).padStart(2, "0"))
            .join("");
          console.log(
            `${LOG} final-byte fp=${shortHash} size=${bytes.byteLength} op=${operationId || "manual"}`,
          );
        } catch (_) {}
      }
      console.log(
        `${LOG} t\u1EA3i h\u1ED9 ${outputCleaned ? "\u0110\xC3 XO\xC1" : phaseFor(reason) === "no_watermark" ? "kh\xF4ng ph\xE1t hi\u1EC7n watermark" : "b\u1EA3n g\u1ED1c"}:`,
        canon(href).slice(-40),
      );
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: ct }));
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = name || "download";
      a.setAttribute("data-toby-passthrough", "1");
      document.body.appendChild(a);
      NATIVE_CLICK.call(a);
      try {
        window.postMessage(
          {
            channel: CH_DONE,
            url: href,
            cleaned: outputCleaned,
            reason,
            operationId,
          },
          "*",
        );
      } catch (_) {}
      if (operationId && activeDownloadContext?.operationId === operationId)
        activeDownloadContext = null;
      sayResult(outputCleaned ? "done" : phaseFor(reason), reason);
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
        a.remove();
      }, 6e4);
    } catch (e) {
      sayResult("original");
      console.warn(
        `${LOG} kh\xF4ng t\u1EA3i h\u1ED9 \u0111\u01B0\u1EE3c, tr\u1EA3 v\u1EC1 \u0111\u01B0\u1EDDng g\u1ED1c:`,
        e?.message,
      );
      try {
        onFail?.();
      } catch (_) {}
      try {
        window.postMessage(
          {
            channel: CH_FALLBACK,
            url: href,
            operationId,
            error: e?.message || "INTERCEPT_FETCH_FAILED",
          },
          "*",
        );
      } catch (_) {}
    }
  }
  const onDocClick = (ev) => {
    try {
      const start = (ev.composedPath && ev.composedPath()[0]) || ev.target;
      const a = start?.closest?.("a[download]");
      if (!a || !isTargetAnchor(a)) return;
      ev.preventDefault();
      ev.stopPropagation();
      console.log(
        `${LOG} ch\u1EB7n c\xFA b\u1EA5m t\u1EA3i:`,
        canon(a.href).slice(-40),
      );
      downloadCleaned(a.href, a.getAttribute("download") || "", () => {
        a.setAttribute("data-toby-passthrough", "1");
        NATIVE_CLICK.call(a);
      });
    } catch (e) {
      console.warn(`${LOG} l\u1ED7i \u1EDF l\u1EDBp nghe click:`, e?.message);
    }
  };
  document.addEventListener("click", onDocClick, true);
  HTMLElement.prototype.click = function () {
    try {
      if (isTargetAnchor(this)) {
        const href = this.href,
          name = this.getAttribute("download") || "";
        console.log(
          `${LOG} ch\u1EB7n <a download> (JS g\u1ECDi):`,
          canon(href).slice(-40),
        );
        downloadCleaned(href, name, () => {
          this.setAttribute("data-toby-passthrough", "1");
          NATIVE_CLICK.call(this);
        });
        return;
      }
    } catch (e) {
      console.warn(`${LOG} l\u1ED7i \u1EDF l\u1EDBp v\xE1 click:`, e?.message);
    }
    return NATIVE_CLICK.apply(this, arguments);
  };
  const onBridgeMsg = (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || typeof d !== "object") return;
    if (d.channel === CH_DL_CTX) {
      const operationId =
        typeof d.operationId === "string" ? d.operationId : "";
      if (d.clear) {
        if (!operationId || activeDownloadContext?.operationId === operationId)
          activeDownloadContext = null;
      } else if (operationId) {
        activeDownloadContext = { operationId, at: Date.now() };
      }
      try {
        window.postMessage(
          { channel: CH_DL_CTX_ACK, operationId, active: !d.clear },
          "*",
        );
      } catch (_) {}
      return;
    }
    if (d.channel === CH_CFG) {
      if (!d.enabled || !d.allowed) {
        if (activeBid && d.bid && d.bid !== activeBid) {
          console.info(
            `${LOG} b\u1ECF qua l\u1EC7nh T\u1EAET t\u1EEB b\u1EA3n c\u1EA7u n\u1ED1i \u0111\xE3 h\u1EBFt nhi\u1EC7m v\u1EE5 (${String(d.bid).slice(0, 8)})`,
          );
          return;
        }
      } else if (d.bid) {
        if (activeBid && d.bid !== activeBid && waiting.size) {
          console.warn(
            `${LOG} c\u1EA7u n\u1ED1i \u0111\u1ED5i b\u1EA3n \u2192 b\u1ECF ${waiting.size} l\u01B0\u1EE3t \u0111ang ch\u1EDD, d\xF9ng b\u1EA3n g\u1ED1c`,
          );
          for (const fn of Array.from(waiting.values())) {
            try {
              fn({ b64: null, reason: "bridge_changed" });
            } catch (_) {}
          }
          waiting.clear();
        }
        activeBid = d.bid;
      }
      const pats = [];
      for (const s of d.patterns || []) {
        try {
          pats.push(new RegExp(s, "i"));
        } catch (e) {
          console.warn(
            `${LOG} m\u1EABu URL h\u1ECFng, b\u1ECF qua:`,
            s,
            e?.message,
          );
        }
      }
      cfg = {
        enabled: !!d.enabled && pats.length > 0,
        allowed: !!d.allowed,
        patterns: pats,
        timeout_ms: d.timeout_ms,
        image_timeout_ms: d.image_timeout_ms,
      };
      console.log(
        `${LOG} nh\u1EADn c\u1EA5u h\xECnh: ${cfg.enabled ? `b\u1EADt, ${pats.length} m\u1EABu` : "T\u1EAET"} \xB7 quy\u1EC1n: ${cfg.allowed ? "C\xD3" : "KH\xD4NG (b\u1ECF qua m\u1ECDi request)"}`,
      );
      return;
    }
    if (d.channel === CH_RES && waiting.has(d.id)) {
      const fn = waiting.get(d.id);
      waiting.delete(d.id);
      fn({ b64: d.base64 || null, reason: d.reason || null });
    }
  };
  window.addEventListener("message", onBridgeMsg);
  window.__tobyMediaInterceptorDispose = function () {
    try {
      window.fetch = NATIVE_FETCH;
    } catch (_) {}
    try {
      HTMLElement.prototype.click = NATIVE_CLICK;
    } catch (_) {}
    try {
      document.removeEventListener("click", onDocClick, true);
    } catch (_) {}
    try {
      window.removeEventListener("message", onBridgeMsg);
    } catch (_) {}
    activeDownloadContext = null;
    cleanedOutputs.clear();
    cfg = null;
    window.__tobyMediaInterceptor = false;
    console.log(
      `${LOG} \u0111\xE3 nh\u1EA3, nh\u01B0\u1EDDng b\u1EA3n m\u1EDBi`,
    );
  };
  console.log(`${LOG} \u0111\xE3 c\xE0i (ch\u1EDD c\u1EA5u h\xECnh)`);
})();
