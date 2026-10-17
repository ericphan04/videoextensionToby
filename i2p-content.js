(function () {
  "use strict";
  if (window.__tobyflowI2pLoaded__) return;
  window.__tobyflowI2pLoaded__ = true;
  const ROOT_ID = "tobyflow-i2p-root";
  const GREEN = "#1fbd53";
  const HIST_KEY = "i2p_history";
  const HIST_MAX = 20;
  let _locale = "vi";
  try {
    chrome.storage?.local?.get(["af_locale"], (r) => {
      if (r?.af_locale) _locale = r.af_locale;
    });
  } catch (_) {}
  const _T = {
    vi: {
      title: "Prompt t\u1EEB \u1EA3nh",
      analyzeBy: "Ph\xE2n t\xEDch b\u1EB1ng:",
      analyze: "Ph\xE2n t\xEDch",
      analyzing: "AI \u0111ang \u0111\u1ECDc \u1EA3nh",
      note: "c\xF3 th\u1EC3 m\u1EA5t 10\u201330 gi\xE2y",
      capturing: "\u0110ang l\u1EA5y \u1EA3nh...",
      openTab: "M\u1EDF tab \u0111\u0103ng nh\u1EADp",
      copy: "Copy",
      copied: "\u0110\xE3 copy",
      genFlow: "\u0110\u01B0a v\xE0o TobyFlow",
      sending: "\u0110ang g\u1EEDi...",
      sentFlow: "\u0110\xE3 \u0111\u01B0a v\xE0o TobyFlow",
      cancel: "H\u1EE7y",
      reanalyze: "Ph\xE2n t\xEDch l\u1EA1i",
      history: "L\u1ECBch s\u1EED",
      noHistory: "Ch\u01B0a c\xF3 l\u1ECBch s\u1EED",
      back: "Quay l\u1EA1i",
      clearAll: "Xo\xE1 t\u1EA5t c\u1EA3",
      deleteOne: "Xo\xE1",
      tabVi: "Ti\u1EBFng Vi\u1EC7t",
      tabEn: "English",
      tabJson: "JSON",
      notLogged: "ch\u01B0a \u0111\u0103ng nh\u1EADp",
      noTab: "ch\u01B0a m\u1EDF tab",
      waitingLogin: "\u2014 \u0111ang ch\u1EDD \u0111\u0103ng nh\u1EADp...",
      viReadHint:
        "B\u1EA3n ti\u1EBFng Vi\u1EC7t chi ti\u1EBFt \u0111\u1EC3 \u0111\u1ECDc hi\u1EC3u \u2014 ti\u1EBFng Vi\u1EC7t gen \u1EA3nh k\xE9m, n\xEAn gen b\u1EB1ng tab JSON ho\u1EB7c English.",
      errCapture:
        "Kh\xF4ng l\u1EA5y \u0111\u01B0\u1EE3c \u1EA3nh (CORS). Th\u1EED \u1EA3nh kh\xE1c.",
      errConfig:
        "Ch\u01B0a t\u1EA3i \u0111\u01B0\u1EE3c c\u1EA5u h\xECnh t\u1EEB server.",
      errProvider:
        "Provider ch\u01B0a s\u1EB5n s\xE0ng / ch\u01B0a \u0111\u0103ng nh\u1EADp.",
      retry: "Th\u1EED l\u1EA1i",
      regionHint:
        "K\xE9o ch\u1ECDn v\xF9ng \u0111\u1EC3 ph\xE2n t\xEDch \xB7 Esc \u0111\u1EC3 h\u1EE7y",
      gateLogin:
        "\u0110\u0103ng nh\u1EADp TobyFlow \u0111\u1EC3 d\xF9ng Prompt t\u1EEB \u1EA3nh.",
      gateUpgrade:
        "N\xE2ng c\u1EA5p g\xF3i \u0111\u1EC3 d\xF9ng Prompt t\u1EEB \u1EA3nh.",
      login: "\u0110\u0103ng nh\u1EADp",
      upgrade: "N\xE2ng c\u1EA5p",
      sendGen: "G\u1EEDi \u1EA3nh sang tab T\u1EA1o",
      refAdded: "\u0110\xE3 th\xEAm \u1EA3nh tham chi\u1EBFu",
    },
    en: {
      title: "Prompt from image",
      analyzeBy: "Analyze with:",
      analyze: "Analyze",
      analyzing: "AI is reading image",
      note: "may take 10\u201330s",
      capturing: "Capturing image...",
      openTab: "Open login tab",
      copy: "Copy",
      copied: "Copied",
      genFlow: "Send to TobyFlow",
      sending: "Sending...",
      sentFlow: "Sent to TobyFlow",
      cancel: "Cancel",
      reanalyze: "Re-analyze",
      history: "History",
      noHistory: "No history yet",
      back: "Back",
      clearAll: "Clear all",
      deleteOne: "Delete",
      tabVi: "Vietnamese",
      tabEn: "English",
      tabJson: "JSON",
      notLogged: "not signed in",
      noTab: "no tab open",
      waitingLogin: "\u2014 waiting for sign-in...",
      viReadHint:
        "Detailed Vietnamese for reading \u2014 Vietnamese generates poorly, use the JSON or English tab to generate.",
      errCapture: "Could not read image (CORS). Try another.",
      errConfig: "Could not load server config.",
      errProvider: "Provider not ready / not signed in.",
      retry: "Retry",
      regionHint: "Drag to select an area \xB7 Esc to cancel",
      gateLogin: "Sign in to TobyFlow to use Image to Prompt.",
      gateUpgrade: "Upgrade your plan to use Image to Prompt.",
      login: "Sign in",
      upgrade: "Upgrade",
      sendGen: "Send image to Generate tab",
      refAdded: "Reference image added",
    },
    ja: {
      title: "\u753B\u50CF\u304B\u3089\u30D7\u30ED\u30F3\u30D7\u30C8",
      analyzeBy: "\u5206\u6790\u306B\u4F7F\u7528:",
      analyze: "\u5206\u6790",
      analyzing: "AI\u304C\u753B\u50CF\u3092\u89E3\u6790\u4E2D",
      note: "10\u301C30\u79D2\u304B\u304B\u308B\u5834\u5408\u304C\u3042\u308A\u307E\u3059",
      capturing: "\u753B\u50CF\u3092\u53D6\u5F97\u4E2D...",
      openTab: "\u30ED\u30B0\u30A4\u30F3\u30BF\u30D6\u3092\u958B\u304F",
      copy: "\u30B3\u30D4\u30FC",
      copied: "\u30B3\u30D4\u30FC\u6E08\u307F",
      genFlow: "TobyFlow\u3078\u9001\u308B",
      sending: "\u9001\u4FE1\u4E2D...",
      sentFlow: "TobyFlow\u3078\u9001\u4FE1\u6E08\u307F",
      cancel: "\u30AD\u30E3\u30F3\u30BB\u30EB",
      reanalyze: "\u518D\u5206\u6790",
      history: "\u5C65\u6B74",
      noHistory: "\u5C65\u6B74\u306A\u3057",
      back: "\u623B\u308B",
      clearAll: "\u3059\u3079\u3066\u524A\u9664",
      deleteOne: "\u524A\u9664",
      tabVi: "\u30D9\u30C8\u30CA\u30E0\u8A9E",
      tabEn: "\u82F1\u8A9E",
      tabJson: "JSON",
      notLogged: "\u672A\u30ED\u30B0\u30A4\u30F3",
      noTab: "\u30BF\u30D6\u672A\u958B",
      waitingLogin: "\u2014 \u30ED\u30B0\u30A4\u30F3\u5F85\u3061...",
      viReadHint:
        "\u95B2\u89A7\u7528\u306E\u8A73\u7D30\u306A\u30D9\u30C8\u30CA\u30E0\u8A9E \u2014 \u751F\u6210\u7CBE\u5EA6\u304C\u4F4E\u3044\u305F\u3081\u3001JSON \u307E\u305F\u306F English \u30BF\u30D6\u3067\u751F\u6210\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      errCapture:
        "\u753B\u50CF\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093 (CORS)\u3002\u5225\u306E\u753B\u50CF\u3067\u3002",
      errConfig:
        "\u30B5\u30FC\u30D0\u30FC\u8A2D\u5B9A\u3092\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3002",
      errProvider:
        "\u30D7\u30ED\u30D0\u30A4\u30C0\u30FC\u672A\u6E96\u5099 / \u672A\u30ED\u30B0\u30A4\u30F3\u3002",
      retry: "\u518D\u8A66\u884C",
      regionHint:
        "\u30C9\u30E9\u30C3\u30B0\u3067\u7BC4\u56F2\u9078\u629E \xB7 Esc\u3067\u30AD\u30E3\u30F3\u30BB\u30EB",
      gateLogin:
        "Image to Prompt \u3092\u4F7F\u3046\u306B\u306F TobyFlow \u306B\u30ED\u30B0\u30A4\u30F3\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      gateUpgrade:
        "Image to Prompt \u3092\u4F7F\u3046\u306B\u306F\u30D7\u30E9\u30F3\u3092\u30A2\u30C3\u30D7\u30B0\u30EC\u30FC\u30C9\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      login: "\u30ED\u30B0\u30A4\u30F3",
      upgrade: "\u30A2\u30C3\u30D7\u30B0\u30EC\u30FC\u30C9",
      sendGen: "\u753B\u50CF\u3092\u751F\u6210\u30BF\u30D6\u3078\u9001\u308B",
      refAdded:
        "\u53C2\u7167\u753B\u50CF\u3092\u8FFD\u52A0\u3057\u307E\u3057\u305F",
    },
    th: {
      title:
        "\u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C\u0E08\u0E32\u0E01\u0E23\u0E39\u0E1B",
      analyzeBy:
        "\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C\u0E14\u0E49\u0E27\u0E22:",
      analyze: "\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C",
      analyzing:
        "AI \u0E01\u0E33\u0E25\u0E31\u0E07\u0E2D\u0E48\u0E32\u0E19\u0E23\u0E39\u0E1B",
      note: "\u0E2D\u0E32\u0E08\u0E43\u0E0A\u0E49\u0E40\u0E27\u0E25\u0E32 10\u201330 \u0E27\u0E34\u0E19\u0E32\u0E17\u0E35",
      capturing:
        "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E14\u0E36\u0E07\u0E23\u0E39\u0E1B...",
      openTab:
        "\u0E40\u0E1B\u0E34\u0E14\u0E41\u0E17\u0E47\u0E1A\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E23\u0E30\u0E1A\u0E1A",
      copy: "\u0E04\u0E31\u0E14\u0E25\u0E2D\u0E01",
      copied: "\u0E04\u0E31\u0E14\u0E25\u0E2D\u0E01\u0E41\u0E25\u0E49\u0E27",
      genFlow: "\u0E2A\u0E48\u0E07\u0E44\u0E1B TobyFlow",
      sending: "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E2A\u0E48\u0E07...",
      sentFlow:
        "\u0E2A\u0E48\u0E07\u0E44\u0E1B TobyFlow \u0E41\u0E25\u0E49\u0E27",
      cancel: "\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01",
      reanalyze:
        "\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C\u0E43\u0E2B\u0E21\u0E48",
      history: "\u0E1B\u0E23\u0E30\u0E27\u0E31\u0E15\u0E34",
      noHistory:
        "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E1B\u0E23\u0E30\u0E27\u0E31\u0E15\u0E34",
      back: "\u0E01\u0E25\u0E31\u0E1A",
      clearAll:
        "\u0E25\u0E49\u0E32\u0E07\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14",
      deleteOne: "\u0E25\u0E1A",
      tabVi: "\u0E40\u0E27\u0E35\u0E22\u0E14\u0E19\u0E32\u0E21",
      tabEn: "\u0E2D\u0E31\u0E07\u0E01\u0E24\u0E29",
      tabJson: "JSON",
      notLogged:
        "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E23\u0E30\u0E1A\u0E1A",
      noTab:
        "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E40\u0E1B\u0E34\u0E14\u0E41\u0E17\u0E47\u0E1A",
      waitingLogin:
        "\u2014 \u0E23\u0E2D\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E23\u0E30\u0E1A\u0E1A...",
      viReadHint:
        "\u0E20\u0E32\u0E29\u0E32\u0E40\u0E27\u0E35\u0E22\u0E14\u0E19\u0E32\u0E21\u0E41\u0E1A\u0E1A\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E2D\u0E48\u0E32\u0E19 \u2014 \u0E2A\u0E23\u0E49\u0E32\u0E07\u0E20\u0E32\u0E1E\u0E44\u0E14\u0E49\u0E44\u0E21\u0E48\u0E14\u0E35 \u0E43\u0E0A\u0E49\u0E41\u0E17\u0E47\u0E1A JSON \u0E2B\u0E23\u0E37\u0E2D English \u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E2A\u0E23\u0E49\u0E32\u0E07",
      errCapture:
        "\u0E2D\u0E48\u0E32\u0E19\u0E23\u0E39\u0E1B\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49 (CORS) \u0E25\u0E2D\u0E07\u0E23\u0E39\u0E1B\u0E2D\u0E37\u0E48\u0E19",
      errConfig:
        "\u0E42\u0E2B\u0E25\u0E14\u0E04\u0E48\u0E32\u0E08\u0E32\u0E01\u0E40\u0E0B\u0E34\u0E23\u0E4C\u0E1F\u0E40\u0E27\u0E2D\u0E23\u0E4C\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49",
      errProvider:
        "\u0E1C\u0E39\u0E49\u0E43\u0E2B\u0E49\u0E1A\u0E23\u0E34\u0E01\u0E32\u0E23\u0E44\u0E21\u0E48\u0E1E\u0E23\u0E49\u0E2D\u0E21 / \u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E23\u0E30\u0E1A\u0E1A",
      retry: "\u0E25\u0E2D\u0E07\u0E43\u0E2B\u0E21\u0E48",
      regionHint:
        "\u0E25\u0E32\u0E01\u0E40\u0E25\u0E37\u0E2D\u0E01\u0E1E\u0E37\u0E49\u0E19\u0E17\u0E35\u0E48 \xB7 Esc \u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01",
      gateLogin:
        "\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E23\u0E30\u0E1A\u0E1A TobyFlow \u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E43\u0E0A\u0E49 Image to Prompt",
      gateUpgrade:
        "\u0E2D\u0E31\u0E1B\u0E40\u0E01\u0E23\u0E14\u0E41\u0E1E\u0E47\u0E01\u0E40\u0E01\u0E08\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E43\u0E0A\u0E49 Image to Prompt",
      login:
        "\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E23\u0E30\u0E1A\u0E1A",
      upgrade: "\u0E2D\u0E31\u0E1B\u0E40\u0E01\u0E23\u0E14",
      sendGen:
        "\u0E2A\u0E48\u0E07\u0E23\u0E39\u0E1B\u0E44\u0E1B\u0E22\u0E31\u0E07\u0E41\u0E17\u0E47\u0E1A\u0E2A\u0E23\u0E49\u0E32\u0E07",
      refAdded:
        "\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E23\u0E39\u0E1B\u0E20\u0E32\u0E1E\u0E2D\u0E49\u0E32\u0E07\u0E2D\u0E34\u0E07\u0E41\u0E25\u0E49\u0E27",
    },
  };
  function t(k) {
    return (_T[_locale] && _T[_locale][k]) || _T.vi[k] || _T.en[k] || k;
  }
  function bg(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (r) => {
          resolve(chrome.runtime.lastError ? null : r);
        });
      } catch (_) {
        resolve(null);
      }
    });
  }
  function stripFences(s) {
    return (s || "")
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
  }
  function salvageParse(raw) {
    if (!raw) return null;
    const out = {};
    const grab = (key) => {
      const m = raw.match(
        new RegExp('"' + key + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)'),
      );
      if (!m) return;
      let v = m[1].replace(/\\?"?$/, "");
      try {
        v = JSON.parse('"' + v + '"');
      } catch (_) {
        v = v.replace(/\\n/g, "\n").replace(/\\"/g, '"');
      }
      out[key] = v;
    };
    ["recreation_prompt_en", "recreation_prompt_vi", "subject"].forEach(grab);
    return out.recreation_prompt_en || out.recreation_prompt_vi ? out : null;
  }
  let _lastCtx = null;
  document.addEventListener(
    "contextmenu",
    (e) => {
      _lastCtx = { x: e.clientX, y: e.clientY };
    },
    true,
  );
  async function captureImage(srcUrl, maxPx) {
    const draw = (imgLike) => {
      const w = imgLike.naturalWidth || imgLike.width,
        h = imgLike.naturalHeight || imgLike.height;
      if (!w || !h) return null;
      const scale = Math.min(1, maxPx / Math.max(w, h));
      const cv = document.createElement("canvas");
      cv.width = Math.max(1, Math.round(w * scale));
      cv.height = Math.max(1, Math.round(h * scale));
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(imgLike, 0, 0, cv.width, cv.height);
      return cv.toDataURL("image/jpeg", 0.85).split(",")[1];
    };
    let b64 = await new Promise((resolve) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => {
        try {
          resolve(draw(im));
        } catch (_) {
          resolve(null);
        }
      };
      im.onerror = () => resolve(null);
      im.src = srcUrl;
      setTimeout(() => resolve(null), 8e3);
    });
    if (!b64) {
      const el = Array.from(document.images).find(
        (i) => i.currentSrc === srcUrl || i.src === srcUrl,
      );
      if (el && el.complete) {
        try {
          b64 = draw(el);
        } catch (_) {}
      }
    }
    if (!b64) {
      try {
        const resp = await fetch(srcUrl, { mode: "cors" });
        if (resp.ok) {
          const blob = await resp.blob();
          const url = URL.createObjectURL(blob);
          const im = await new Promise((res) => {
            const x = new Image();
            x.onload = () => res(x);
            x.onerror = () => res(null);
            x.src = url;
          });
          if (im) {
            try {
              b64 = draw(im);
            } catch (_) {}
          }
          URL.revokeObjectURL(url);
        }
      } catch (_) {}
    }
    if (b64) return { base64: b64, name: "i2p.jpg", type: "image/jpeg" };
    const bgR = await bg({ action: "i2p:fetchImage", srcUrl, maxPx });
    return bgR?.ok && bgR.image?.base64 ? bgR.image : null;
  }
  function makeThumb(base64, type) {
    return new Promise((resolve) => {
      try {
        const im = new Image();
        im.onload = () => {
          try {
            const sz = 96,
              scale = Math.min(1, sz / Math.max(im.width, im.height));
            const cv = document.createElement("canvas");
            cv.width = Math.max(1, Math.round(im.width * scale));
            cv.height = Math.max(1, Math.round(im.height * scale));
            cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height);
            resolve(cv.toDataURL("image/jpeg", 0.7));
          } catch (_) {
            resolve("");
          }
        };
        im.onerror = () => resolve("");
        im.src = "data:" + (type || "image/jpeg") + ";base64," + base64;
      } catch (_) {
        resolve("");
      }
    });
  }
  async function histLoad() {
    try {
      const r = await chrome.storage.local.get([HIST_KEY]);
      return Array.isArray(r[HIST_KEY]) ? r[HIST_KEY] : [];
    } catch (_) {
      return [];
    }
  }
  async function histAdd(entry) {
    try {
      const list = await histLoad();
      list.unshift(entry);
      if (list.length > HIST_MAX) list.length = HIST_MAX;
      await chrome.storage.local.set({ [HIST_KEY]: list });
    } catch (_) {}
  }
  async function histClear() {
    try {
      await chrome.storage.local.set({ [HIST_KEY]: [] });
    } catch (_) {}
  }
  async function histRemove(ts) {
    try {
      const list = await histLoad();
      await chrome.storage.local.set({
        [HIST_KEY]: list.filter((x) => x.ts !== ts),
      });
    } catch (_) {}
  }
  let _shadow = null,
    _state = null,
    _token = 0,
    _statusPoll = null;
  function stopStatusPoll() {
    if (_statusPoll) {
      clearInterval(_statusPoll);
      _statusPoll = null;
    }
  }
  function ensureRoot() {
    let host = document.getElementById(ROOT_ID);
    if (host && host.shadowRoot) {
      _shadow = host.shadowRoot;
      return _shadow;
    }
    if (host) host.remove();
    host = document.createElement("div");
    host.id = ROOT_ID;
    document.documentElement.appendChild(host);
    _shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      .card { position: fixed; top: 72px; left: 50%; transform: translateX(-50%); width: 384px; max-width: 92vw; max-height: 86vh; overflow: hidden; color:#fff; border-radius:18px;
        border:1px solid rgba(239,246,255,0.38);
        background: linear-gradient(180deg, rgba(18,22,30,0.38), rgba(4,7,12,0.47)), linear-gradient(180deg, rgba(255,255,255,0.136), rgba(255,255,255,0.036));
        box-shadow:0 26px 62px rgba(0,0,0,0.21), 0 11px 26px rgba(0,0,0,0.13), inset 0 1px 0 rgba(255,255,255,0.43), inset 0 -1px 0 rgba(255,255,255,0.07);
        -webkit-backdrop-filter: blur(22px) saturate(1.2) contrast(1.04); backdrop-filter: blur(22px) saturate(1.2) contrast(1.04);
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; display:flex; flex-direction:column; z-index:2147483647; }
      .hd { display:flex; align-items:flex-start; gap:10px; padding:14px 16px 8px; cursor:grab; user-select:none; }
      .hd:active { cursor:grabbing; }
      .hd .thumb { width:38px; height:38px; object-fit:cover; border-radius:8px; flex-shrink:0; border:1px solid rgba(255,255,255,0.2); }
      .hd .tt { flex:1; min-width:0; }
      .hd .lbl { font-size:10px; letter-spacing:0.09em; text-transform:uppercase; color:rgba(255,255,255,0.45); font-weight:600; }
      .hd .title { font-size:17px; font-weight:700; margin-top:2px; line-height:1.2; }
      .hd .acts { display:flex; gap:6px; flex-shrink:0; }
      .ic { cursor:pointer; width:26px; height:26px; border:none; background:rgba(255,255,255,0.1); color:#fff; border-radius:8px; font-size:14px; line-height:1; display:flex; align-items:center; justify-content:center; transition:background 0.12s; }
      .ic:hover { background:rgba(255,255,255,0.22); }
      .body { padding:6px 16px 16px; overflow:auto; font-size:13px; }
      .row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:12px; }
      .pv { display:flex; align-items:center; gap:6px; padding:6px 10px; border:1px solid rgba(255,255,255,0.15); border-radius:9px; cursor:pointer; background:rgba(255,255,255,0.06); transition:background 0.12s, border-color 0.12s; }
      .pv:hover { border-color:rgba(255,255,255,0.32); background:rgba(255,255,255,0.11); }
      .pv.sel { border-color:${GREEN}; background:rgba(31,189,83,0.16); color:#fff; }
      .dot { width:8px; height:8px; border-radius:50%; background:#888; flex-shrink:0; }
      .dot.on { background:${GREEN}; box-shadow:0 0 6px rgba(31,189,83,0.85); }
      .dot.warn { background:#f59e0b; box-shadow:0 0 6px rgba(245,158,11,0.7); }
      .muted { color:rgba(255,255,255,0.5); font-size:11px; }
      /* Base primary button \u2014 share b\u1EDFi primary-btn + 2 n\xFAt action chuy\xEAn bi\u1EC7t (gen-prompt / send-flow). */
      .primary-btn, .gen-prompt-btn, .send-flow-btn { padding:6px 14px; border:none; border-radius:9px; background: linear-gradient(90deg, #ccff00 0%, #daff46 100%) !important; color: #292929; font-weight:600; cursor:pointer; font-size:13px; display:inline-flex; align-items:center; gap:6px; transition:filter 0.12s, box-shadow 0.12s; }
      .primary-btn:hover:not(:disabled), .gen-prompt-btn:hover:not(:disabled), .send-flow-btn:hover:not(:disabled) { filter:brightness(1.08); box-shadow:0 4px 14px rgba(204,255,0,0.35); }
      .primary-btn:active:not(:disabled), .gen-prompt-btn:active:not(:disabled), .send-flow-btn:active:not(:disabled) { filter:brightness(0.96); }
      .primary-btn:disabled, .gen-prompt-btn:disabled, .send-flow-btn:disabled { opacity:0.5; cursor:not-allowed; }
      /* Hook ri\xEAng \u0111\u1EC3 custom \u0111\u1ED9c l\u1EADp (override base \u1EDF \u0111\xE2y n\u1EBFu c\u1EA7n). */
      .gen-prompt-btn {}
      .send-flow-btn {}
      /* Login button (glass) \u2014 fallback --panel-ui-scale=1 v\xEC bi\u1EBFn n\xE0y ch\u1EC9 c\xF3 \u1EDF sidebar, ko c\xF3 trong Shadow DOM i2p card. */
      .login-btn { width:100%; min-width:0; min-height:calc(48px * var(--panel-ui-scale, 1)); padding-inline:calc(28px * var(--panel-ui-scale, 1)); color:rgba(14,18,24,0.94); background:linear-gradient(180deg, rgba(255,255,255,0.96), rgba(241,244,248,0.92)); border:1px solid rgba(255,255,255,0.68); box-shadow:inset 0 1px 0 rgba(255,255,255,0.78), inset 0 -1px 0 rgba(198,206,216,0.42), 0 8px 18px rgba(0,0,0,0.1); backdrop-filter:blur(18px) saturate(1.02); -webkit-backdrop-filter:blur(18px) saturate(1.02); flex-shrink:0; position:relative; overflow:hidden; font-weight:600; border-radius:30px; cursor:pointer; font-size:14px; display:inline-flex; align-items:center; justify-content:center; gap:6px; }
      .login-btn:hover:not(:disabled) { filter:brightness(1.03); }
      .login-btn:active:not(:disabled) { filter:brightness(0.97); }
      .login-btn:disabled { opacity:0.5; cursor:not-allowed; }
      .secondary-btn { padding:6px 12px; border:1px solid rgba(255,255,255,0.22); border-radius:9px; background:rgba(255,255,255,0.04); color:#fff; cursor:pointer; font-size:12px; transition:background 0.12s, border-color 0.12s; }
      .secondary-btn:hover { background:rgba(255,255,255,0.13); border-color:rgba(255,255,255,0.34); }
      .tabs { display:flex; gap:6px; margin:10px 0 8px; }
      .tab { padding:5px 10px; border-radius:8px; cursor:pointer; font-size:12px; background:rgba(255,255,255,0.08); transition:background 0.12s; }
      .tab:hover { background:rgba(255,255,255,0.15); }
      .tab.sel { background:#ccff00; color:#1d1d1d; }
      .out { white-space:pre-wrap; word-break:break-word; background:rgba(0,0,0,0.28); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:11px; max-height:38vh; overflow:auto; font-size:12.5px; line-height:1.55; }
      .foot { display:flex; gap:8px; align-items:center; margin-top:12px; flex-wrap:wrap; }
      .err { color:#fca5a5; }
      .spin { width:16px; height:16px; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation:i2pspin 0.8s linear infinite; display:inline-block; vertical-align:middle; }
      @keyframes i2pspin { to { transform: rotate(360deg); } }
      .hist-list { max-height:52vh; overflow-y:auto; overflow-x:hidden; margin:0 -4px; padding:0 4px; }
      .hist-item { display:flex; gap:8px; align-items:center; padding:8px; border-radius:9px; cursor:pointer; background:rgba(255,255,255,0.04); margin-bottom:6px; transition:background 0.12s; }
      .hist-item:hover { background:rgba(255,255,255,0.1); }
      .hist-item img { width:34px; height:34px; object-fit:cover; border-radius:6px; flex-shrink:0; }
      .hist-item .ht { flex:1; min-width:0; font-size:12px; }
      .hist-item .ht .h1 { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .hist-item .ht .h2 { color:rgba(255,255,255,0.45); font-size:10px; }
      .i2p-logo { position:absolute; right:12px; bottom:10px; width:20px; height:20px; border-radius:5px; opacity:0.45; pointer-events:none; z-index:0; }
      .hist-del { flex-shrink:0; width:22px; height:22px; border:none; background:rgba(255,255,255,0.08); color:rgba(255,255,255,0.6); border-radius:6px; font-size:14px; line-height:1; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:background 0.12s, color 0.12s; }
      .hist-del:hover { background:#ea4335; color:#fff; }
    `;
    _shadow.appendChild(style);
    return _shadow;
  }
  function close() {
    stopStatusPoll();
    const host = document.getElementById(ROOT_ID);
    if (host) host.remove();
    _shadow = null;
    _state = null;
    _token++;
  }
  function positionCard(card) {
    if (!_lastCtx) return;
    const cw = card.offsetWidth || 384,
      ch = card.offsetHeight || 240,
      margin = 12;
    let x = _lastCtx.x + margin;
    if (x + cw > window.innerWidth - 8)
      x = Math.max(8, _lastCtx.x - cw - margin);
    const y = Math.max(
      8,
      Math.min(_lastCtx.y - 10, window.innerHeight - ch - 8),
    );
    card.style.transform = "none";
    card.style.right = "auto";
    card.style.left = x + "px";
    card.style.top = y + "px";
  }
  function makeDraggable(card, handle) {
    handle.addEventListener("mousedown", (e) => {
      if (e.target.closest(".ic") || e.target.closest("button")) return;
      const r = card.getBoundingClientRect();
      card.style.left = r.left + "px";
      card.style.top = r.top + "px";
      card.style.transform = "none";
      card.style.right = "auto";
      const sx = e.clientX,
        sy = e.clientY,
        ox = r.left,
        oy = r.top;
      e.preventDefault();
      const move = (ev) => {
        let nx = Math.max(
          0,
          Math.min(
            ox + (ev.clientX - sx),
            window.innerWidth - card.offsetWidth,
          ),
        );
        let ny = Math.max(
          0,
          Math.min(
            oy + (ev.clientY - sy),
            window.innerHeight - card.offsetHeight,
          ),
        );
        card.style.left = nx + "px";
        card.style.top = ny + "px";
      };
      const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
      };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });
  }
  function render() {
    const sh = ensureRoot();
    const old = sh.querySelector(".card");
    const prevPos =
      old && old.style.left
        ? {
            left: old.style.left,
            top: old.style.top,
            right: old.style.right,
            transform: old.style.transform,
          }
        : null;
    old?.remove();
    const card = document.createElement("div");
    card.className = "card";
    const hd = document.createElement("div");
    hd.className = "hd";
    const thumb = _state?.image
      ? `data:${_state.image.type || "image/jpeg"};base64,${_state.image.base64}`
      : _state?.thumb || "";
    hd.innerHTML = `${thumb ? `<img class="thumb" src="${thumb}">` : ""}<div class="tt"><div class="lbl">TobyFlow \xB7 Image \u2192 Prompt</div><div class="title">${t("title")}</div></div>`;
    const acts = document.createElement("div");
    acts.className = "acts";
    if (_state?.image?.base64 && _state?.phase !== "gate") {
      const sgBtn = document.createElement("button");
      sgBtn.className = "ic";
      sgBtn.title = t("sendGen");
      const _sgIcon =
        '<svg width="16" height="16" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M6.25 1.5H3.9C3.05992 1.5 2.63988 1.5 2.31901 1.66349C2.03677 1.8073 1.8073 2.03677 1.66349 2.31901C1.5 2.63988 1.5 3.05992 1.5 3.9V8.1C1.5 8.94008 1.5 9.36012 1.66349 9.68099C1.8073 9.96323 2.03677 10.1927 2.31901 10.3365C2.63988 10.5 3.05992 10.5 3.9 10.5H8.5C8.96499 10.5 9.19748 10.5 9.38823 10.4489C9.90587 10.3102 10.3102 9.90587 10.4489 9.38823C10.5 9.19748 10.5 8.96499 10.5 8.5M9.5 4V1M8 2.5H11M5.25 4.25C5.25 4.80228 4.80228 5.25 4.25 5.25C3.69772 5.25 3.25 4.80228 3.25 4.25C3.25 3.69772 3.69772 3.25 4.25 3.25C4.80228 3.25 5.25 3.69772 5.25 4.25ZM7.49502 5.95907L3.26557 9.80402C3.02768 10.0203 2.90873 10.1284 2.89821 10.2221C2.88909 10.3033 2.92023 10.3838 2.98159 10.4378C3.05239 10.5 3.21314 10.5 3.53464 10.5H8.22799C8.94757 10.5 9.30736 10.5 9.58996 10.3791C9.94472 10.2274 10.2274 9.94472 10.3791 9.58996C10.5 9.30736 10.5 8.94757 10.5 8.22799C10.5 7.98587 10.5 7.86482 10.4735 7.75208C10.4403 7.61039 10.3765 7.47768 10.2866 7.3632C10.2151 7.2721 10.1206 7.19647 9.93154 7.04523L8.53291 5.92633C8.34369 5.77495 8.24908 5.69927 8.1449 5.67256C8.05307 5.64901 7.95643 5.65206 7.86627 5.68135C7.76397 5.71457 7.67432 5.79607 7.49502 5.95907Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
      sgBtn.innerHTML = _sgIcon;
      sgBtn.addEventListener("click", async () => {
        if (sgBtn.disabled) return;
        sgBtn.disabled = true;
        const img = _state?.image;
        const isPng = (img?.type || "").includes("png");
        const r = await bg({
          action: "i2p:sendImageToGen",
          base64: img?.base64,
          type: img?.type || "image/jpeg",
          name: `gen_ref_${Date.now()}.${isPng ? "png" : "jpg"}`,
        });
        sgBtn.innerHTML = r?.ok
          ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>'
          : _sgIcon;
        setTimeout(() => {
          try {
            sgBtn.innerHTML = _sgIcon;
            sgBtn.disabled = false;
          } catch (_) {}
        }, 1500);
      });
      acts.appendChild(sgBtn);
    }
    if (_state?.phase !== "gate") {
      const histBtn = document.createElement("button");
      histBtn.className = "ic";
      histBtn.title = t("history");
      histBtn.innerHTML =
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"></path><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"></path><path d="M12 7v5l3 2"></path></svg>';
      histBtn.addEventListener("click", () => showHistory());
      acts.appendChild(histBtn);
    }
    const xb = document.createElement("button");
    xb.className = "ic";
    xb.textContent = "\xD7";
    xb.title = t("close");
    xb.addEventListener("click", close);
    acts.appendChild(xb);
    hd.appendChild(acts);
    card.appendChild(hd);
    const body = document.createElement("div");
    body.className = "body";
    card.appendChild(body);
    try {
      const logo = document.createElement("img");
      logo.className = "i2p-logo";
      logo.alt = "TobyFlow";
      logo.src = chrome.runtime.getURL("icons/icon-48.png");
      card.appendChild(logo);
    } catch (_) {}
    sh.appendChild(card);
    makeDraggable(card, hd);
    paintBody(body);
    if (prevPos) {
      card.style.left = prevPos.left;
      card.style.top = prevPos.top;
      card.style.right = prevPos.right;
      card.style.transform = prevPos.transform;
    } else {
      requestAnimationFrame(() => positionCard(card));
    }
  }
  const bodyEl = () => _shadow?.querySelector(".body");
  function paintBody(body) {
    body.innerHTML = "";
    const s = _state;
    if (s.view === "history") {
      paintHistory(body);
      return;
    }
    if (s.phase === "gate") {
      const wrap = document.createElement("div");
      wrap.style.cssText = "text-align:center;padding:10px 6px";
      const ic = document.createElement("div");
      ic.style.cssText =
        "margin-bottom:8px;display:flex;justify-content:center";
      ic.innerHTML =
        s.gateMode === "login"
          ? '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>'
          : '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#ccff00" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';
      const m = document.createElement("div");
      m.className = "muted";
      m.style.marginBottom = "12px";
      m.textContent =
        s.gateMode === "login" ? t("gateLogin") : t("gateUpgrade");
      const b = document.createElement("button");
      b.className = s.gateMode === "login" ? "login-btn" : "primary-btn";
      b.textContent = s.gateMode === "login" ? t("login") : t("upgrade");
      b.addEventListener("click", () => {
        bg({ action: "i2p:openApp", mode: s.gateMode });
        close();
      });
      wrap.appendChild(ic);
      wrap.appendChild(m);
      wrap.appendChild(b);
      body.appendChild(wrap);
      return;
    }
    const row = document.createElement("div");
    row.className = "row";
    const lbl = document.createElement("span");
    lbl.textContent = t("analyzeBy");
    row.appendChild(lbl);
    ["chatgpt", "gemini"].forEach((p) => {
      const st = s.status?.[p];
      const ready = st?.ready;
      const pv = document.createElement("div");
      pv.className = "pv" + (s.provider === p ? " sel" : "");
      pv.innerHTML = `<span class="dot ${ready ? "on" : st?.tabOpen ? "warn" : ""}"></span><span>${p === "gemini" ? "Gemini" : "ChatGPT"}</span>`;
      pv.addEventListener("click", () => {
        s.provider = p;
        stopStatusPoll();
        paintBody(body);
        refreshStatus(true);
      });
      row.appendChild(pv);
    });
    body.appendChild(row);
    const cur = s.status?.[s.provider];
    if (s.status && !cur?.ready && s.phase !== "analyzing") {
      const name = s.provider === "gemini" ? "Gemini" : "ChatGPT";
      const hint = document.createElement("div");
      hint.className = "row";
      const m = document.createElement("span");
      m.className = "muted";
      m.textContent = `${name} ${cur?.tabOpen ? t("notLogged") : t("noTab")}`;
      const ob = document.createElement("button");
      ob.className = "secondary-btn";
      ob.textContent = t("openTab");
      ob.addEventListener("click", async () => {
        await bg({ action: "i2p:openProviderLogin", provider: s.provider });
        s.autoAnalyzeOnReady = true;
        m.textContent = `${name} ${t("waitingLogin")}`;
        startStatusPoll();
      });
      hint.appendChild(m);
      hint.appendChild(ob);
      body.appendChild(hint);
    }
    if (s.phase === "capturing" || s.phase === "analyzing") {
      const p = document.createElement("div");
      p.innerHTML =
        s.phase === "analyzing"
          ? `<span class="spin"></span> ${t("analyzing")} \xB7 ${s.provider === "gemini" ? "Gemini" : "ChatGPT"} <div class="muted" style="margin-top:4px">${t("note")}</div>`
          : `<span class="spin"></span> ${t("capturing")}`;
      body.appendChild(p);
      if (s.phase === "analyzing") {
        const cb = document.createElement("button");
        cb.className = "secondary-btn";
        cb.textContent = t("cancel");
        cb.style.marginTop = "10px";
        cb.addEventListener("click", () => {
          bg({ action: "i2p:cancel", provider: s.provider });
          close();
        });
        body.appendChild(cb);
      }
    } else if (s.phase === "error") {
      const e = document.createElement("div");
      e.className = "err";
      e.textContent = s.error || "Error";
      body.appendChild(e);
      if (s.image) {
        const rb = document.createElement("button");
        rb.className = "primary-btn";
        rb.textContent = t("retry");
        rb.style.marginTop = "10px";
        rb.addEventListener("click", () => doAnalyze());
        body.appendChild(rb);
      }
    } else if (s.phase === "idle" && s.image) {
      const ab = document.createElement("button");
      ab.className = "gen-prompt-btn";
      ab.innerHTML =
        '<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path d="M11.8525 4.21651L11.7221 3.2387C11.6906 3.00226 11.4889 2.82568 11.2504 2.82568C11.0118 2.82568 10.8102 3.00226 10.7786 3.23869L10.6483 4.21651C10.2658 7.0847 8.00939 9.34115 5.14119 9.72358L4.16338 9.85396C3.92694 9.88549 3.75037 10.0872 3.75037 10.3257C3.75037 10.5642 3.92694 10.7659 4.16338 10.7974L5.14119 10.9278C8.00938 11.3102 10.2658 13.5667 10.6483 16.4349L10.7786 17.4127C10.8102 17.6491 11.0118 17.8257 11.2504 17.8257C11.4889 17.8257 11.6906 17.6491 11.7221 17.4127L11.8525 16.4349C12.2349 13.5667 14.4913 11.3102 17.3595 10.9278L18.3374 10.7974C18.5738 10.7659 18.7504 10.5642 18.7504 10.3257C18.7504 10.0872 18.5738 9.88549 18.3374 9.85396L17.3595 9.72358C14.4913 9.34115 12.2349 7.0847 11.8525 4.21651Z"></path><path d="M4.6519 14.7568L4.82063 14.2084C4.84491 14.1295 4.91781 14.0757 5.00037 14.0757C5.08292 14.0757 5.15582 14.1295 5.1801 14.2084L5.34883 14.7568C5.56525 15.4602 6.11587 16.0108 6.81925 16.2272L7.36762 16.3959C7.44652 16.4202 7.50037 16.4931 7.50037 16.5757C7.50037 16.6582 7.44652 16.7311 7.36762 16.7554L6.81926 16.9241C6.11587 17.1406 5.56525 17.6912 5.34883 18.3946L5.1801 18.9429C5.15582 19.0218 5.08292 19.0757 5.00037 19.0757C4.91781 19.0757 4.84491 19.0218 4.82063 18.9429L4.65191 18.3946C4.43548 17.6912 3.88486 17.1406 3.18147 16.9241L2.63311 16.7554C2.55421 16.7311 2.50037 16.6582 2.50037 16.5757C2.50037 16.4931 2.55421 16.4202 2.63311 16.3959L3.18148 16.2272C3.88486 16.0108 4.43548 15.4602 4.6519 14.7568Z"></path></svg><span>' +
        t("analyze") +
        "</span>";
      ab.addEventListener("click", () => doAnalyze());
      body.appendChild(ab);
    } else if (s.phase === "result") {
      renderResult(body);
    }
  }
  function renderResult(body) {
    const s = s2();
    const tabs = document.createElement("div");
    tabs.className = "tabs";
    [
      ["json", t("tabJson")],
      ["en", t("tabEn")],
      ["vi", t("tabVi")],
    ].forEach(([k, label]) => {
      const tb = document.createElement("div");
      tb.className = "tab" + (s.tab === k ? " sel" : "");
      tb.textContent = label;
      tb.addEventListener("click", () => {
        s.tab = k;
        renderResult(body);
      });
      tabs.appendChild(tb);
    });
    body
      .querySelectorAll(".tabs,.out,.foot,.vi-hint")
      .forEach((n) => n.remove());
    body.appendChild(tabs);
    if (s.tab === "vi") {
      const h = document.createElement("div");
      h.className = "vi-hint muted";
      h.textContent = t("viReadHint");
      h.style.margin = "6px 0";
      body.appendChild(h);
    }
    const out = document.createElement("div");
    out.className = "out";
    out.textContent = currentText();
    body.appendChild(out);
    const foot = document.createElement("div");
    foot.className = "foot";
    const cp = document.createElement("button");
    cp.className = "secondary-btn";
    cp.textContent = t("copy");
    cp.addEventListener("click", () => {
      try {
        navigator.clipboard.writeText(currentText());
      } catch (_) {}
      cp.textContent = t("copied");
      setTimeout(() => {
        if (cp.isConnected) cp.textContent = t("copy");
      }, 1500);
    });
    const gf = document.createElement("button");
    gf.className = "send-flow-btn";
    gf.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path d="M11.8525 4.21651L11.7221 3.2387C11.6906 3.00226 11.4889 2.82568 11.2504 2.82568C11.0118 2.82568 10.8102 3.00226 10.7786 3.23869L10.6483 4.21651C10.2658 7.0847 8.00939 9.34115 5.14119 9.72358L4.16338 9.85396C3.92694 9.88549 3.75037 10.0872 3.75037 10.3257C3.75037 10.5642 3.92694 10.7659 4.16338 10.7974L5.14119 10.9278C8.00938 11.3102 10.2658 13.5667 10.6483 16.4349L10.7786 17.4127C10.8102 17.6491 11.0118 17.8257 11.2504 17.8257C11.4889 17.8257 11.6906 17.6491 11.7221 17.4127L11.8525 16.4349C12.2349 13.5667 14.4913 11.3102 17.3595 10.9278L18.3374 10.7974C18.5738 10.7659 18.7504 10.5642 18.7504 10.3257C18.7504 10.0872 18.5738 9.88549 18.3374 9.85396L17.3595 9.72358C14.4913 9.34115 12.2349 7.0847 11.8525 4.21651Z"></path><path d="M4.6519 14.7568L4.82063 14.2084C4.84491 14.1295 4.91781 14.0757 5.00037 14.0757C5.08292 14.0757 5.15582 14.1295 5.1801 14.2084L5.34883 14.7568C5.56525 15.4602 6.11587 16.0108 6.81925 16.2272L7.36762 16.3959C7.44652 16.4202 7.50037 16.4931 7.50037 16.5757C7.50037 16.6582 7.44652 16.7311 7.36762 16.7554L6.81926 16.9241C6.11587 17.1406 5.56525 17.6912 5.34883 18.3946L5.1801 18.9429C5.15582 19.0218 5.08292 19.0757 5.00037 19.0757C4.91781 19.0757 4.84491 19.0218 4.82063 18.9429L4.65191 18.3946C4.43548 17.6912 3.88486 17.1406 3.18147 16.9241L2.63311 16.7554C2.55421 16.7311 2.50037 16.6582 2.50037 16.5757C2.50037 16.4931 2.55421 16.4202 2.63311 16.3959L3.18148 16.2272C3.88486 16.0108 4.43548 15.4602 4.6519 14.7568Z"></path></svg><span class="sf-label">' +
      t("genFlow") +
      "</span>";
    const gfLabel = gf.querySelector(".sf-label");
    gf.addEventListener("click", async () => {
      gf.disabled = true;
      gfLabel.textContent = t("sending");
      const r = await bg({ action: "i2p:genOnFlow", prompt: currentText() });
      gfLabel.textContent = r?.ok ? t("sentFlow") : t("genFlow");
      setTimeout(() => {
        if (gf.isConnected) gfLabel.textContent = t("genFlow");
      }, 2e3);
      gf.disabled = false;
    });
    const ra = document.createElement("button");
    ra.className = "secondary-btn";
    ra.textContent = t("reanalyze");
    ra.addEventListener("click", () => doAnalyze());
    foot.appendChild(cp);
    foot.appendChild(gf);
    foot.appendChild(ra);
    body.appendChild(foot);
  }
  function s2() {
    return _state;
  }
  function currentText() {
    const s = _state;
    if (s.tab === "json")
      return JSON.stringify(s.parsed || { raw: s.raw }, null, 2);
    if (s.tab === "en") return s.parsed?.recreation_prompt_en || s.raw || "";
    return (
      s.parsed?.recreation_prompt_vi ||
      s.parsed?.recreation_prompt_en ||
      s.raw ||
      ""
    );
  }
  async function showHistory() {
    _state.view = "history";
    _state.histList = await histLoad();
    const b = bodyEl();
    if (b) paintBody(b);
  }
  function paintHistory(body) {
    const head = document.createElement("div");
    head.className = "row";
    head.style.justifyContent = "space-between";
    head.style.marginBottom = "10px";
    const back = document.createElement("button");
    back.className = "secondary-btn";
    back.textContent = "\u2039 " + t("back");
    back.addEventListener("click", () => {
      _state.view = null;
      const b = bodyEl();
      if (b) paintBody(b);
    });
    head.appendChild(back);
    const list = _state.histList || [];
    if (list.length) {
      const clr = document.createElement("button");
      clr.className = "secondary-btn";
      clr.textContent = t("clearAll");
      clr.addEventListener("click", async () => {
        await histClear();
        _state.histList = [];
        const b = bodyEl();
        if (b) paintBody(b);
      });
      head.appendChild(clr);
    }
    body.appendChild(head);
    if (!list.length) {
      const m = document.createElement("div");
      m.className = "muted";
      m.textContent = t("noHistory");
      body.appendChild(m);
      return;
    }
    const listWrap = document.createElement("div");
    listWrap.className = "hist-list";
    list.forEach((h) => {
      const it = document.createElement("div");
      it.className = "hist-item";
      const preview = (h.parsed?.recreation_prompt_en || h.raw || "").slice(
        0,
        80,
      );
      it.innerHTML = `${h.thumb ? `<img src="${h.thumb}">` : ""}<div class="ht"><div class="h1">${preview || "\u2014"}</div><div class="h2">${(h.provider || "").toUpperCase()}</div></div><button class="hist-del" title="${t("deleteOne")}">\xD7</button>`;
      it.addEventListener("click", () => {
        _state.view = null;
        _state.image = null;
        _state.raw = h.raw;
        _state.parsed = h.parsed;
        _state.thumb = h.thumb;
        _state.phase = "result";
        _state.tab = "json";
        render();
      });
      it.querySelector(".hist-del")?.addEventListener("click", async (e) => {
        e.stopPropagation();
        await histRemove(h.ts);
        _state.histList = (_state.histList || []).filter((x) => x.ts !== h.ts);
        const b = bodyEl();
        if (b) paintBody(b);
      });
      listWrap.appendChild(it);
    });
    body.appendChild(listWrap);
  }
  async function refreshStatus(repaint) {
    const tok = _token;
    const stR = await bg({ action: "i2p:checkProviders" });
    if (tok !== _token || !_state) return;
    if (stR?.ok) _state.status = stR.providers;
    if (repaint) {
      const b = bodyEl();
      if (b) paintBody(b);
    }
  }
  function startStatusPoll() {
    stopStatusPoll();
    let n = 0;
    _statusPoll = setInterval(async () => {
      n++;
      await refreshStatus(true);
      const cur = _state?.status?.[_state?.provider];
      if (!_state || cur?.ready || n >= 12) {
        stopStatusPoll();
        if (
          _state &&
          cur?.ready &&
          _state.autoAnalyzeOnReady &&
          _state.phase === "idle" &&
          _state.image
        ) {
          _state.autoAnalyzeOnReady = false;
          doAnalyze();
        }
      }
    }, 3e3);
  }
  async function doAnalyze() {
    const s = _state;
    const tok = _token;
    s.phase = "analyzing";
    {
      const b2 = bodyEl();
      if (b2) paintBody(b2);
    }
    const resp = await bg({
      action: "i2p:analyze",
      provider: s.provider,
      image: s.image,
    });
    if (tok !== _token || !_state) return;
    if (resp && resp.error === "FEATURE_LOCKED") {
      const acc = await bg({ action: "i2p:checkAccess" });
      s.phase = "gate";
      s.gateMode = acc && acc.loggedIn ? "upgrade" : "login";
      const b2 = bodyEl();
      if (b2) paintBody(b2);
      return;
    }
    if (!resp || !resp.success) {
      s.phase = "error";
      s.error = `${t("errProvider")}${resp?.error ? ` (${resp.error})` : ""}`;
      const b2 = bodyEl();
      if (b2) paintBody(b2);
      return;
    }
    const raw = stripFences(resp.text || "");
    s.raw = raw;
    try {
      s.parsed = JSON.parse(raw);
    } catch (_) {
      s.parsed = salvageParse(raw);
    }
    s.phase = "result";
    s.tab = "json";
    const b = bodyEl();
    if (b) paintBody(b);
    const thumb = s.image ? await makeThumb(s.image.base64, s.image.type) : "";
    await histAdd({
      ts: Date.now(),
      provider: s.provider,
      raw,
      parsed: s.parsed,
      thumb,
    });
    if (s.parsed && resp.cleanupReceipt?.provider === "chatgpt") {
      bg({
        action: "chatgpt:completeDeferredCleanup",
        tabId: resp.cleanupReceipt.tabId,
        expectedConversationUrl: resp.cleanupReceipt.expectedConversationUrl,
      })
        .then((cleanup) => {
          if (!cleanup?.success)
            console.warn(
              "[I2P] deferred ChatGPT cleanup warning:",
              cleanup?.error || "DELETE_FAILED",
            );
        })
        .catch((error) =>
          console.warn(
            "[I2P] deferred ChatGPT cleanup error:",
            error?.message || error,
          ),
        );
    }
  }
  async function openCard({ srcUrl, image }) {
    const tok = ++_token;
    _state = {
      provider: "chatgpt",
      status: null,
      image: image || null,
      phase: "capturing",
      raw: "",
      parsed: null,
      tab: "json",
      error: "",
      view: null,
      autoAnalyzeOnReady: false,
      gateMode: null,
    };
    render();
    const acc = await bg({ action: "i2p:checkAccess" });
    if (tok !== _token || !_state) return;
    if (acc && acc.ok && !acc.allowed) {
      _state.phase = "gate";
      _state.gateMode = acc.loggedIn ? "upgrade" : "login";
      render();
      return;
    }
    const [cfgR, stR] = await Promise.all([
      bg({ action: "i2p:getConfig" }),
      bg({ action: "i2p:checkProviders" }),
    ]);
    if (tok !== _token || !_state) return;
    if (cfgR?.ok && cfgR.config?.defaultProvider)
      _state.provider = cfgR.config.defaultProvider;
    _state.status = stR?.ok
      ? stR.providers
      : { gemini: { tabOpen: false }, chatgpt: { tabOpen: false } };
    const maxPx = cfgR?.config?.maxImagePx || 1536;
    if (!_state.image) {
      _state.image = await captureImage(srcUrl, maxPx);
    }
    if (tok !== _token || !_state) return;
    if (!_state.image) {
      _state.phase = "error";
      _state.error = t("errCapture");
      const b = bodyEl();
      if (b) {
        render();
      }
      return;
    }
    if (cfgR?.ok && !cfgR.config?.promptTemplate) {
      _state.phase = "error";
      _state.error = t("errConfig");
      render();
      return;
    }
    _state.phase = "idle";
    render();
  }
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.action === "i2p:showCard") {
      openCard({ srcUrl: message.srcUrl });
      return;
    }
    if (message?.action === "i2p:regionMode") {
      startRegionSelect();
      return;
    }
  });
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") {
        if (_regionLayer) cancelRegion();
        else if (_state) close();
      }
    },
    true,
  );
  let _regionLayer = null;
  function cancelRegion() {
    if (_regionLayer) {
      _regionLayer.remove();
      _regionLayer = null;
    }
  }
  function startRegionSelect() {
    cancelRegion();
    const layer = document.createElement("div");
    _regionLayer = layer;
    layer.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(0,0,0,0.18);";
    const hint = document.createElement("div");
    hint.style.cssText =
      "position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#1fbd53;color:#fff;padding:8px 14px;border-radius:9px;font:600 13px -apple-system,sans-serif;";
    hint.textContent = t("regionHint");
    layer.appendChild(hint);
    const sel = document.createElement("div");
    sel.style.cssText =
      "position:fixed;border:2px solid #76ADFF;background:rgba(118,173,255,0.18);display:none;";
    layer.appendChild(sel);
    document.documentElement.appendChild(layer);
    let sx = 0,
      sy = 0,
      drag = false;
    layer.addEventListener("mousedown", (e) => {
      drag = true;
      sx = e.clientX;
      sy = e.clientY;
      sel.style.display = "block";
      sel.style.left = sx + "px";
      sel.style.top = sy + "px";
      sel.style.width = "0";
      sel.style.height = "0";
    });
    layer.addEventListener("mousemove", (e) => {
      if (!drag) return;
      const x = Math.min(sx, e.clientX),
        y = Math.min(sy, e.clientY),
        w = Math.abs(e.clientX - sx),
        h = Math.abs(e.clientY - sy);
      sel.style.left = x + "px";
      sel.style.top = y + "px";
      sel.style.width = w + "px";
      sel.style.height = h + "px";
    });
    layer.addEventListener("mouseup", async (e) => {
      if (!drag) return;
      drag = false;
      const x = Math.min(sx, e.clientX),
        y = Math.min(sy, e.clientY),
        w = Math.abs(e.clientX - sx),
        h = Math.abs(e.clientY - sy);
      if (w < 8 || h < 8) {
        cancelRegion();
        return;
      }
      layer.style.display = "none";
      await new Promise((res) =>
        requestAnimationFrame(() => requestAnimationFrame(res)),
      );
      cancelRegion();
      _lastCtx = { x: x + w, y };
      const r = await bg({
        action: "i2p:captureRegion",
        rect: { x, y, w, h, dpr: window.devicePixelRatio || 1 },
      });
      if (r?.ok && r.image?.base64) openCard({ image: r.image });
    });
  }
})();
