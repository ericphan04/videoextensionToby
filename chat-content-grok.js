(function () {
  window.__tobyflowGrokLoaded__ = true;
  if (window._grokInjected) return;
  window._grokInjected = true;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const _i18n = {
    _lang: "vi",
    _strings: {
      vi: {
        preparing: "\u0110ang chu\u1EA9n b\u1ECB",
        waitingVerification: "Ch\u1EDD x\xE1c minh Cloudflare...",
        waitingResult: "\u0110ang ch\u1EDD k\u1EBFt qu\u1EA3...",
      },
      en: {
        preparing: "Preparing",
        waitingVerification: "Waiting for Cloudflare...",
        waitingResult: "Waiting for result...",
      },
      ja: {
        preparing: "\u6E96\u5099\u4E2D",
        waitingVerification: "Cloudflare\u8A8D\u8A3C\u5F85\u3061...",
        waitingResult:
          "\u7D50\u679C\u3092\u5F85\u3063\u3066\u3044\u307E\u3059...",
      },
      th: {
        preparing:
          "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E40\u0E15\u0E23\u0E35\u0E22\u0E21",
        waitingVerification: "\u0E23\u0E2D Cloudflare...",
        waitingResult:
          "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E23\u0E2D\u0E1C\u0E25\u0E25\u0E31\u0E1E\u0E18\u0E4C...",
      },
    },
    t(key) {
      return this._strings[this._lang]?.[key] || this._strings.vi[key] || key;
    },
  };
  ConfigSnapshotAccess.read(["af_settings", "af_locale"], (res) => {
    _i18n._lang = res.af_locale || res.af_settings?.language || "vi";
    console.log(`[Grok-i18n] Language loaded: ${_i18n._lang}`);
  });
  const PROVIDER = "grok";
  ConfigSnapshotAccess.start(PROVIDER);
  let _selectorConfig = null;
  let _selectorConfigTime = 0;
  ConfigSnapshotAccess.onInvalidated(() => {
    _selectorConfig = null;
    _selectorConfigTime = 0;
  });
  const _SELECTOR_CACHE_TTL = 3e4;
  const _SELECTOR_WAIT_MAX_MS = 1e4;
  const _SELECTOR_WAIT_INTERVAL_MS = 200;
  const _OVERLAY_I18N = {
    vi: {
      title: "M\u1EA5t k\u1EBFt n\u1ED1i server",
      desc: "Kh\xF4ng th\u1EC3 k\u1EBFt n\u1ED1i t\u1EDBi m\xE1y ch\u1EE7 Toby. Vui l\xF2ng ki\u1EC3m tra l\u1EA1i sau.",
      retry: "Th\u1EED l\u1EA1i",
    },
    en: {
      title: "Server Connection Lost",
      desc: "Unable to connect to Toby server. Please try again later.",
      retry: "Retry",
    },
    ja: {
      title:
        "\u30B5\u30FC\u30D0\u30FC\u63A5\u7D9A\u304C\u5207\u308C\u307E\u3057\u305F",
      desc: "Toby\u30B5\u30FC\u30D0\u30FC\u306B\u63A5\u7D9A\u3067\u304D\u307E\u305B\u3093\u3002\u5F8C\u3067\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002",
      retry: "\u518D\u8A66\u884C",
    },
    th: {
      title:
        "\u0E02\u0E32\u0E14\u0E01\u0E32\u0E23\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D\u0E40\u0E0B\u0E34\u0E23\u0E4C\u0E1F\u0E40\u0E27\u0E2D\u0E23\u0E4C",
      desc: "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D\u0E01\u0E31\u0E1A\u0E40\u0E0B\u0E34\u0E23\u0E4C\u0E1F\u0E40\u0E27\u0E2D\u0E23\u0E4C Toby \u0E01\u0E23\u0E38\u0E13\u0E32\u0E25\u0E2D\u0E07\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07\u0E20\u0E32\u0E22\u0E2B\u0E25\u0E31\u0E07",
      retry:
        "\u0E25\u0E2D\u0E07\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07",
    },
  };
  (function _ensureSelectorConfig() {
    const startTime = Date.now();
    let attempts = 0;
    let lastLogElapsed = 0;
    console.log(
      `[Selector:${PROVIDER}:ensure] \u23F3 Waiting for server config in chrome.storage.local (timeout ${_SELECTOR_WAIT_MAX_MS}ms)...`,
    );
    function checkStorage() {
      attempts++;
      ConfigSnapshotAccess.read(["toby_provider_configs"], (res) => {
        if (res.toby_provider_configs?.data?.[PROVIDER]) {
          _selectorConfig = res.toby_provider_configs.data;
          _selectorConfigTime = Date.now();
          const keyCount = Object.keys(
            _selectorConfig[PROVIDER]?.selectors || {},
          ).length;
          console.log(
            `[Selector:${PROVIDER}:ensure] \u2705 Loaded ${keyCount} selectors after ${attempts} attempts (${Date.now() - startTime}ms)`,
          );
          return;
        }
        try {
          chrome.runtime.sendMessage(
            { action: "getProviderConfigs", provider: PROVIDER },
            () => {
              if (chrome.runtime.lastError) {
              }
            },
          );
        } catch (_) {}
        const elapsed = Date.now() - startTime;
        if (elapsed - lastLogElapsed >= 1e3) {
          lastLogElapsed = elapsed;
          console.log(
            `[Selector:${PROVIDER}:ensure] \u23F3 Still waiting (${(elapsed / 1e3).toFixed(1)}s/${_SELECTOR_WAIT_MAX_MS / 1e3}s, attempt #${attempts}) \u2014 re-triggering background fetch`,
          );
        }
        if (elapsed > _SELECTOR_WAIT_MAX_MS) {
          console.error(
            `[Selector:${PROVIDER}:ensure] \u274C Timeout after ${attempts} attempts (${elapsed}ms). Server unreachable \u2014 showing overlay.`,
          );
          _showConfigErrorOverlay();
          return;
        }
        setTimeout(checkStorage, _SELECTOR_WAIT_INTERVAL_MS);
      });
    }
    checkStorage();
  })();
  function _showConfigErrorOverlay() {
    if (document.getElementById("tobyflow-config-error-overlay")) {
      console.log(
        `[Selector:${PROVIDER}:overlay] \u21A9 Overlay already mounted \u2014 skip`,
      );
      return;
    }
    const lang = (_i18n && _i18n._lang) || "vi";
    const t = _OVERLAY_I18N[lang] || _OVERLAY_I18N.vi;
    const overlay = document.createElement("div");
    overlay.id = "tobyflow-config-error-overlay";
    queueMicrotask(() =>
      ConfigSnapshotAccess.updateOverlay(overlay).catch(() => {}),
    );
    overlay.className = "tobyflow-cfg-err-overlay";
    overlay.innerHTML = `
      <style>
        .tobyflow-cfg-err-overlay { position: fixed; inset: 0; z-index: 2147483647; background: rgba(10,10,14,0.95); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        .tobyflow-cfg-err-content { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 32px; max-width: 320px; }
        .tobyflow-cfg-err-icon { width: 80px; height: 80px; border-radius: 50%; background: rgba(239,68,68,0.15); display: flex; align-items: center; justify-content: center; margin-bottom: 20px; }
        .tobyflow-cfg-err-icon svg { color: #ef4444; }
        .tobyflow-cfg-err-title { font-size: 18px; font-weight: 600; color: #fff; margin: 0 0 8px 0; }
        .tobyflow-cfg-err-desc { font-size: 14px; color: rgba(255,255,255,0.6); margin: 0 0 24px 0; line-height: 1.5; }
        .tobyflow-cfg-err-retry-btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; background: #fff; color: #1a1a1e; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: opacity 0.2s; }
        .tobyflow-cfg-err-retry-btn:hover { opacity: 0.9; }
        .tobyflow-cfg-err-retry-btn:active { opacity: 0.8; }
        .tobyflow-cfg-err-retry-btn svg { color: #1a1a1e; }
      </style>
      <div class="tobyflow-cfg-err-content">
        <div class="tobyflow-cfg-err-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="2" y1="2" x2="22" y2="22"></line>
            <path d="M8.5 16.5a5 5 0 0 1 7 0"></path>
            <path d="M2 8.82a15 15 0 0 1 4.17-2.65"></path>
            <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76"></path>
            <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68"></path>
            <path d="M5 13a10 10 0 0 1 5.24-2.76"></path>
            <line x1="12" y1="20" x2="12.01" y2="20"></line>
          </svg>
        </div>
        <h3 class="tobyflow-cfg-err-title"></h3>
        <p class="tobyflow-cfg-err-desc"></p>
        <button class="tobyflow-cfg-err-retry-btn" type="button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 2v6h-6"></path>
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
            <path d="M3 22v-6h6"></path>
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
          </svg>
          <span></span>
        </button>
      </div>
    `;
    overlay.querySelector(".tobyflow-cfg-err-title").textContent = t.title;
    overlay.querySelector(".tobyflow-cfg-err-desc").textContent = t.desc;
    overlay.querySelector(".tobyflow-cfg-err-retry-btn span").textContent =
      t.retry;
    document.body.appendChild(overlay);
    overlay
      .querySelector(".tobyflow-cfg-err-retry-btn")
      .addEventListener("click", () => {
        console.log(
          `[Selector:${PROVIDER}:overlay] \u{1F504} User clicked retry \u2014 reloading page`,
        );
        overlay.remove();
        location.reload();
      });
    console.warn(
      `[Selector:${PROVIDER}:overlay] \u{1F6AB} Config error overlay shown (lang=${lang}) \u2014 server unreachable, user action required`,
    );
  }
  function _showCloneDetectedOverlay() {
    if (document.getElementById("tobyflow-clone-detected-overlay")) return;
    const _lang = (_i18n && _i18n._lang) || "vi";
    const titleMap = {
      vi: "Extension kh\xF4ng h\u1EE3p l\u1EC7",
      en: "Extension Not Authorized",
      ja: "\u62E1\u5F35\u6A5F\u80FD\u304C\u8A31\u53EF\u3055\u308C\u3066\u3044\u307E\u305B\u3093",
      th: "\u0E2A\u0E48\u0E27\u0E19\u0E02\u0E22\u0E32\u0E22\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E2D\u0E19\u0E38\u0E0D\u0E32\u0E15",
    };
    const descMap = {
      vi: "Phi\xEAn b\u1EA3n extension n\xE0y kh\xF4ng c\xF3 quy\u1EC1n truy c\u1EADp API Toby Flow. Vui l\xF2ng c\xE0i l\u1EA1i t\u1EEB Chrome Web Store \u0111\u1EC3 ti\u1EBFp t\u1EE5c s\u1EED d\u1EE5ng.",
      en: "This extension version is not authorized to access Toby Flow API. Please reinstall from the Chrome Web Store to continue.",
      ja: "\u3053\u306E\u62E1\u5F35\u6A5F\u80FD\u306E\u30D0\u30FC\u30B8\u30E7\u30F3\u306F Toby Flow API \u3078\u306E\u30A2\u30AF\u30BB\u30B9\u304C\u8A31\u53EF\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002Chrome \u30A6\u30A7\u30D6\u30B9\u30C8\u30A2\u304B\u3089\u518D\u30A4\u30F3\u30B9\u30C8\u30FC\u30EB\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      th: "\u0E2A\u0E48\u0E27\u0E19\u0E02\u0E22\u0E32\u0E22\u0E40\u0E27\u0E2D\u0E23\u0E4C\u0E0A\u0E31\u0E19\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E2D\u0E19\u0E38\u0E0D\u0E32\u0E15\u0E43\u0E2B\u0E49\u0E40\u0E02\u0E49\u0E32\u0E16\u0E36\u0E07 API \u0E02\u0E2D\u0E07 Toby Flow \u0E42\u0E1B\u0E23\u0E14\u0E15\u0E34\u0E14\u0E15\u0E31\u0E49\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E08\u0E32\u0E01 Chrome \u0E40\u0E27\u0E47\u0E1A\u0E2A\u0E42\u0E15\u0E23\u0E4C",
    };
    const btnMap = {
      vi: "M\u1EDF Chrome Web Store",
      en: "Open Chrome Web Store",
      ja: "Chrome \u30A6\u30A7\u30D6\u30B9\u30C8\u30A2\u3092\u958B\u304F",
      th: "\u0E40\u0E1B\u0E34\u0E14 Chrome \u0E40\u0E27\u0E47\u0E1A\u0E2A\u0E42\u0E15\u0E23\u0E4C",
    };
    const overlay = document.createElement("div");
    overlay.id = "tobyflow-clone-detected-overlay";
    overlay.innerHTML = `
      <style>
        #tobyflow-clone-detected-overlay { position: fixed; inset: 0; z-index: 2147483647; background: rgba(10,10,14,0.97); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        #tobyflow-clone-detected-overlay .cd-content { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 32px; max-width: 340px; }
        #tobyflow-clone-detected-overlay .cd-icon { width: 80px; height: 80px; border-radius: 50%; background: rgba(239,68,68,0.15); display: flex; align-items: center; justify-content: center; margin-bottom: 20px; color: #ef4444; }
        #tobyflow-clone-detected-overlay .cd-title { font-size: 18px; font-weight: 600; color: #fff; margin: 0 0 8px 0; }
        #tobyflow-clone-detected-overlay .cd-desc { font-size: 14px; color: rgba(255,255,255,0.65); margin: 0 0 24px 0; line-height: 1.55; }
        #tobyflow-clone-detected-overlay .cd-btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; background: #fff; color: #1a1a1e; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; text-decoration: none; }
        #tobyflow-clone-detected-overlay .cd-btn:hover { opacity: 0.9; }
      </style>
      <div class="cd-content">
        <div class="cd-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            <line x1="9" y1="9" x2="15" y2="15"></line>
            <line x1="15" y1="9" x2="9" y2="15"></line>
          </svg>
        </div>
        <h3 class="cd-title">${titleMap[_lang] || titleMap.vi}</h3>
        <p class="cd-desc">${descMap[_lang] || descMap.vi}</p>
        <a class="cd-btn" target="_blank" rel="noopener" href="https://chromewebstore.google.com/">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
          <span>${btnMap[_lang] || btnMap.vi}</span>
        </a>
      </div>
    `;
    document.body.appendChild(overlay);
    console.error(
      `[Auth:${PROVIDER}] \u{1F6E1}\uFE0F Clone-detected overlay shown \u2014 extension not authorized`,
    );
  }
  function _hideCloneDetectedOverlay() {
    const el = document.getElementById("tobyflow-clone-detected-overlay");
    if (el) el.remove();
  }
  (function _initCloneDetectedListener() {
    try {
      setTimeout(() => {
        ConfigSnapshotAccess.read(
          "tobyflow_extension_not_authorized",
          (res) => {
            if (res && res.tobyflow_extension_not_authorized)
              _showCloneDetectedOverlay();
          },
        );
      }, 800);
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        if (changes.tobyflow_extension_not_authorized) {
          if (changes.tobyflow_extension_not_authorized.newValue)
            _showCloneDetectedOverlay();
          else _hideCloneDetectedOverlay();
        }
      });
      if (chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((msg) => {
          if (msg && msg.type === "EXTENSION_NOT_AUTHORIZED")
            _showCloneDetectedOverlay();
          else if (msg && msg.type === "EXTENSION_AUTHORIZED")
            _hideCloneDetectedOverlay();
        });
      }
      document.addEventListener(
        "click",
        (e) => {
          if (e.target?.closest?.("#tobyflow-clone-detected-overlay")) {
            try {
              chrome.runtime.sendMessage({ type: "EXTENSION_AUTH_RETRY" });
            } catch (_) {}
          }
        },
        true,
      );
    } catch (_) {}
  })();
  function _getDynamicSelector(key) {
    if (!ConfigSnapshotAccess.active()) {
      ConfigSnapshotAccess.ensure().catch(() => {});
      return null;
    }
    const now = Date.now();
    if (_selectorConfig && now - _selectorConfigTime < _SELECTOR_CACHE_TTL) {
      return _selectorConfig?.[PROVIDER]?.selectors?.[key] || null;
    }
    ConfigSnapshotAccess.read(["toby_provider_configs"], (res) => {
      if (res.toby_provider_configs?.data) {
        _selectorConfig = res.toby_provider_configs.data;
        _selectorConfigTime = Date.now();
      }
    });
    return _selectorConfig?.[PROVIDER]?.selectors?.[key] || null;
  }
  function _selStr(key) {
    const cfg = _getDynamicSelector(key);
    return cfg?.selectors?.length ? cfg.selectors.join(", ") : null;
  }
  function _q(key, scope = document) {
    const s = _selStr(key);
    if (!s) {
      console.debug(`[Tier3] _q(${key}) miss`);
      return null;
    }
    return scope.querySelector(s);
  }
  function _qa(key, scope = document) {
    const s = _selStr(key);
    if (!s) {
      console.debug(`[Tier3] _qa(${key}) miss`);
      return [];
    }
    return scope.querySelectorAll(s);
  }
  function _queryWithFallback(key, defaultSelectors = null, options = {}) {
    const config = _getDynamicSelector(key);
    const hardcoded = defaultSelectors || [];
    const isDynamic = config?.selectors?.length > 0;
    const selectors = isDynamic ? config.selectors : hardcoded;
    const silent = options.silent || false;
    if (!silent)
      console.log(
        `[Selector:${PROVIDER}:${key}] ${isDynamic ? "\u{1F310} DYNAMIC" : "\u{1F4E6} HARDCODED"} | Trying ${selectors.length} selectors`,
      );
    for (let i = 0; i < selectors.length; i++) {
      try {
        const el = document.querySelector(selectors[i]);
        if (el) {
          console.log(
            `[Selector:${PROVIDER}:${key}] \u2705 Match #${i + 1}: ${selectors[i]}`,
          );
          return el;
        }
      } catch (e) {}
    }
    if (!silent) console.log(`[Selector:${PROVIDER}:${key}] \u274C No match`);
    return null;
  }
  function _queryAllWithFallback(key, defaultSelectors = null, audit = null) {
    const config = _getDynamicSelector(key);
    const hardcoded = defaultSelectors || [];
    const selectors =
      config?.selectors?.length > 0 ? config.selectors : hardcoded;
    const collectReferences =
      key === "ref_role_trigger" || key === "remove_image_button";
    const references = collectReferences ? new Set() : null;
    if (audit) {
      audit.configuredSelectors = [...selectors];
      audit.attempts = [];
    }
    for (let i = 0; i < selectors.length; i++) {
      try {
        const els = document.querySelectorAll(selectors[i]);
        if (audit) audit.attempts.push({ index: i, count: els.length });
        if (collectReferences)
          for (const element of els) references.add(element);
        else if (els.length > 0) return els;
      } catch (e) {
        if (audit)
          audit.attempts.push({ index: i, error: e.name, message: e.message });
      }
    }
    if (collectReferences)
      return Array.from(references).sort((a, b) =>
        a.compareDocumentPosition(b) & 4 ? -1 : 1,
      );
    return [];
  }
  let __grokInputTimeoutMs = 1200;
  let __grokMacroDelayMs = Math.round(1200 * 0.7);
  function getMacroDelay() {
    return __grokMacroDelayMs;
  }
  function simulateClick(el) {
    if (!el || !(el instanceof Element)) {
      console.warn("[Grok] simulateClick: invalid element type", el);
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      console.warn(
        "[Grok] simulateClick: element zero-size (hidden/detached), skip",
        el,
      );
      return;
    }
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const opts = {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0,
      pointerType: "mouse",
    };
    el.dispatchEvent(new PointerEvent("pointerdown", opts));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new PointerEvent("pointerup", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.dispatchEvent(new MouseEvent("click", opts));
  }
  function clickViaReact(el) {
    if (!el) return false;
    const propsKey = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
    if (
      propsKey &&
      el[propsKey] &&
      typeof el[propsKey].onClick === "function"
    ) {
      el[propsKey].onClick({
        preventDefault() {},
        stopPropagation() {},
        nativeEvent: new MouseEvent("click", { bubbles: true }),
        type: "click",
        target: el,
        currentTarget: el,
      });
      return true;
    }
    return false;
  }
  async function waitForElement(selector, timeout = 1e4) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = document.querySelector(selector);
      if (el) return el;
      await sleep(300);
    }
    return null;
  }
  const FloatingTracker =
    typeof window.createFloatingTrackerRich === "function"
      ? window.createFloatingTrackerRich({
          id: "tobyflow-grok-tracker",
          title: "Grok",
          onSkipBlocker: () => {
            try {
              ExecutionBlocker.hide();
            } catch (_) {}
          },
        })
      : { _el: null, show() {}, update() {}, hide() {}, updateFromQueue() {} };
  let _ftRichActive = false;
  let _ftRichProvider = null;
  if (
    FloatingTracker &&
    typeof FloatingTracker.show === "function" &&
    typeof window.createFloatingTrackerRich === "function"
  ) {
    const _s = FloatingTracker.show.bind(FloatingTracker);
    const _u = FloatingTracker.update.bind(FloatingTracker);
    const _h = FloatingTracker.hide.bind(FloatingTracker);
    FloatingTracker.show = (a) => {
      if (!_ftRichActive) _s(a);
    };
    FloatingTracker.update = (a) => {
      if (!_ftRichActive) _u(a);
    };
    FloatingTracker.hide = () => {
      if (!_ftRichActive) _h();
    };
  }
  function applyRichTrackerData(data) {
    const provider = data?.trackerProvider || "flow";
    const active = !!(data?.jobs?.length && data.isRunning !== false);
    if (_ftRichActive && _ftRichProvider === PROVIDER && provider !== PROVIDER)
      return false;
    _ftRichActive = active;
    _ftRichProvider = active ? provider : null;
    try {
      FloatingTracker.updateFromQueue(data);
    } catch (_) {}
    return true;
  }
  const restoreTrackerSnapshot = new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: "grok:getTrackerSnapshot" },
      (response) => {
        if (!chrome.runtime.lastError && response?.data)
          applyRichTrackerData(response.data);
        resolve();
      },
    );
  });
  const ExecutionBlocker = {
    _el: null,
    _styleEl: null,
    _blocking: false,
    _escapeCount: 0,
    _escapeTimer: null,
    _timeoutId: null,
    _MAX_BLOCK_TIME: 11 * 60 * 1e3,
    _injectStyles() {
      if (this._styleEl) return;
      const style = document.createElement("style");
      style.id = "tobyflow-grok-blocker-styles";
      style.textContent = `
        @keyframes tobyflow-glow-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.7; }
        }
        #tobyflow-grok-blocker {
          position: fixed; inset: 0; z-index: 2147483646;
          /* Ch\u1EC9 HI\u1EC2N TH\u1ECA glow, KH\xD4NG ch\u1EB7n click (Grok/ChatGPT kh\xF4ng c\u1EA7n ch\u1EB7n t\u01B0\u01A1ng t\xE1c \u2014 kh\xE1c Flow). */
          pointer-events: none; background: transparent;
        }
        #tobyflow-grok-blocker::before {
          content: ''; position: absolute; inset: 0;
          border: 5px solid #cdff01;
          border-radius: 12px;
          box-shadow:
            inset 0 0 0 2px rgba(205,255,1,0.5),
            inset 0 0 15px rgba(205,255,1,0.3),
            0 0 15px rgba(205,255,1,0.5),
            0 0 35px rgba(205,255,1,0.35),
            0 0 60px rgba(205,255,1,0.2),
            0 0 100px rgba(205,255,1,0.1);
          animation: tobyflow-glow-pulse 1.8s ease-in-out infinite;
          will-change: opacity;
          pointer-events: none;
        }
      `;
      document.head.appendChild(style);
      this._styleEl = style;
    },
    _blockEvent(e) {
      if (!ExecutionBlocker._blocking) return;
      if (!e.isTrusted) return;
      if (e.target?.closest?.("#tobyflow-grok-tracker")) return;
      if (e.type === "keydown" && e.key === "Escape") {
        ExecutionBlocker._escapeCount++;
        clearTimeout(ExecutionBlocker._escapeTimer);
        ExecutionBlocker._escapeTimer = setTimeout(() => {
          ExecutionBlocker._escapeCount = 0;
        }, 2e3);
        if (ExecutionBlocker._escapeCount >= 3) {
          console.warn("[Grok-ExecutionBlocker] Force hide via Escape x3");
          ExecutionBlocker._escapeCount = 0;
          ExecutionBlocker.hide();
          __grokAbort = true;
          __grokAbortAt = Date.now();
          return;
        }
      }
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
    },
    _attachBlockers() {
      if (this._blocking) return;
      this._blocking = true;
      const events = [
        "mousedown",
        "mouseup",
        "click",
        "dblclick",
        "contextmenu",
        "wheel",
        "touchstart",
        "touchend",
        "keydown",
        "keyup",
      ];
      events.forEach((evt) =>
        document.addEventListener(evt, this._blockEvent, {
          capture: true,
          passive: false,
        }),
      );
    },
    _detachBlockers() {
      if (!this._blocking) return;
      this._blocking = false;
      const events = [
        "mousedown",
        "mouseup",
        "click",
        "dblclick",
        "contextmenu",
        "wheel",
        "touchstart",
        "touchend",
        "keydown",
        "keyup",
      ];
      events.forEach((evt) =>
        document.removeEventListener(evt, this._blockEvent, { capture: true }),
      );
    },
    show() {
      this._injectStyles();
      this._startTimeout();
      if (this._el) {
        this._el.style.display = "block";
        return;
      }
      const el = document.createElement("div");
      el.id = "tobyflow-grok-blocker";
      document.body.appendChild(el);
      this._el = el;
    },
    _startTimeout() {
      this._stopTimeout();
      this._timeoutId = setTimeout(() => {
        console.warn(
          "[Grok-ExecutionBlocker] Auto-timeout, force hiding (KH\xD4NG abort \u2014 extract loop t\u1EF1 x\u1EED l\xFD)",
        );
        this.hide();
      }, this._MAX_BLOCK_TIME);
    },
    _stopTimeout() {
      if (this._timeoutId) {
        clearTimeout(this._timeoutId);
        this._timeoutId = null;
      }
    },
    hide() {
      this._detachBlockers();
      this._stopTimeout();
      this._escapeCount = 0;
      clearTimeout(this._escapeTimer);
      if (this._el) this._el.style.display = "none";
    },
  };
  function findGrokEditor() {
    return _queryWithFallback("composer");
  }
  let _grokPatterns = {
    rateLimit: [],
    contentBlocked: [],
    network: [],
    cloudflare: [],
    subscriptionRequired: [],
    notLoggedIn: [],
  };
  ConfigSnapshotAccess.onInvalidated(() => {
    for (const key of Object.keys(_grokPatterns)) _grokPatterns[key] = [];
  });
  function _parsePatternStr(str) {
    if (!str || typeof str !== "string") return [];
    return str
      .split("|")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
  async function _loadGrokPatternsFromStorage() {
    try {
      const result = await new Promise((r) =>
        ConfigSnapshotAccess.read(["af_grok_config"], r),
      );
      const cfg = result?.af_grok_config?.data;
      if (!cfg) return false;
      _grokPatterns.rateLimit = _parsePatternStr(cfg.rate_limit_text);
      _grokPatterns.contentBlocked = _parsePatternStr(cfg.content_blocked_text);
      _grokPatterns.network = _parsePatternStr(cfg.network_error_text);
      _grokPatterns.cloudflare = _parsePatternStr(
        cfg.cloudflare_challenge_text,
      );
      _grokPatterns.subscriptionRequired = _parsePatternStr(
        cfg.subscription_required_text,
      );
      _grokPatterns.notLoggedIn = _parsePatternStr(cfg.not_logged_in_text);
      const total = Object.values(_grokPatterns).reduce(
        (s, a) => s + a.length,
        0,
      );
      return total > 0;
    } catch (e) {
      return false;
    }
  }
  const _GROK_PATTERNS_WAIT_MAX_MS = 1e4;
  const _GROK_PATTERNS_WAIT_INTERVAL_MS = 500;
  (async function _ensureGrokPatternsConfig() {
    const startTime = Date.now();
    let attempts = 0;
    let lastLogElapsed = 0;
    console.log(
      `[Grok:patterns:ensure] \u23F3 Waiting for error patterns in chrome.storage.local.af_grok_config (timeout ${_GROK_PATTERNS_WAIT_MAX_MS}ms)...`,
    );
    while (Date.now() - startTime < _GROK_PATTERNS_WAIT_MAX_MS) {
      attempts++;
      const ok = await _loadGrokPatternsFromStorage();
      if (ok) {
        const total = Object.values(_grokPatterns).reduce(
          (s, a) => s + a.length,
          0,
        );
        console.log(
          `[Grok:patterns:ensure] \u2705 Loaded ${total} patterns across ${Object.keys(_grokPatterns).length} categories after ${attempts} attempts (${Date.now() - startTime}ms)`,
        );
        return;
      }
      try {
        chrome.runtime.sendMessage(
          { action: "getProviderConfigs", provider: "grok" },
          () => {
            if (chrome.runtime.lastError) {
            }
          },
        );
      } catch (_) {}
      const elapsed = Date.now() - startTime;
      if (elapsed - lastLogElapsed >= 2e3) {
        lastLogElapsed = elapsed;
        console.log(
          `[Grok:patterns:ensure] \u23F3 Still waiting (${(elapsed / 1e3).toFixed(1)}s/${_GROK_PATTERNS_WAIT_MAX_MS / 1e3}s, attempt #${attempts})...`,
        );
      }
      await new Promise((r) => setTimeout(r, _GROK_PATTERNS_WAIT_INTERVAL_MS));
    }
    console.warn(
      `[Grok:patterns:ensure] \u26A0\uFE0F Timeout after ${attempts} attempts \u2014 error/cloudflare detection degraded (cannot auto-detect CONTENT_BLOCKED/RATE_LIMIT/Cloudflare challenge). User v\u1EABn submit \u0111\u01B0\u1EE3c, ch\u1EC9 l\xE0 tracker hi\u1EC3n th\u1ECB TIMEOUT thay v\xEC error code ch\xEDnh x\xE1c.`,
    );
  })();
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.af_grok_config) {
        _loadGrokPatternsFromStorage();
      }
    });
  } catch (e) {}
  function _isVisiblyRendered(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(el);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0"
    );
  }
  function _visibleDynamicElements(key) {
    const config = _getDynamicSelector(key);
    if (!config?.selectors?.length) return [];
    const found = new Set();
    for (const selector of config.selectors) {
      try {
        document.querySelectorAll(selector).forEach((el) => {
          if (_isVisiblyRendered(el)) found.add(el);
        });
      } catch (_) {}
    }
    return [...found];
  }
  function detectCloudflareChallenge() {
    const visibleIframe = _visibleDynamicElements("cloudflare_iframe")[0];
    if (visibleIframe) {
      console.warn("[GrokCloudflare] visible iframe detected", {
        src: visibleIframe.getAttribute("src") || null,
      });
      return true;
    }
    const visibleTurnstile = _visibleDynamicElements("cloudflare_turnstile")[0];
    if (visibleTurnstile) {
      console.warn("[GrokCloudflare] visible turnstile container detected");
      return true;
    }
    const cloudflarePatterns = _grokPatterns.cloudflare;
    if (cloudflarePatterns.length === 0) return false;
    const overlays = _qa("cloudflare_overlay_dialog");
    for (const el of overlays) {
      const txt = (el.innerText || "").toLowerCase();
      const matchedPattern = cloudflarePatterns.find((pattern) =>
        txt.includes(pattern),
      );
      if (matchedPattern) {
        if (_isVisiblyRendered(el)) {
          console.warn("[GrokCloudflare] visible text overlay detected", {
            pattern: matchedPattern,
          });
          return true;
        }
      }
    }
    return false;
  }
  function attemptCloudflareClick() {
    console.log("[Grok] Attempting Cloudflare verification trigger...");
    if (window.turnstile) {
      try {
        const turnstileIframe2 = _queryWithFallback("cloudflare_iframe");
        const widgetId =
          turnstileIframe2?.id?.replace("cf-chl-widget-", "") || null;
        if (typeof window.turnstile.execute === "function") {
          console.log("[Grok] Calling turnstile.execute()...");
          window.turnstile.execute(widgetId);
        } else if (typeof window.turnstile.reset === "function") {
          console.log(
            "[Grok] Calling turnstile.reset() to retry verification...",
          );
          window.turnstile.reset(widgetId);
        }
      } catch (e) {
        console.warn("[Grok] Turnstile API call failed:", e.message);
      }
    }
    const turnstileIframe = _queryWithFallback("cloudflare_iframe");
    if (turnstileIframe) {
      try {
        turnstileIframe.scrollIntoView({
          behavior: "instant",
          block: "center",
        });
        turnstileIframe.focus();
        const rect = turnstileIframe.getBoundingClientRect();
        const checkboxX = rect.left + 25;
        const checkboxY = rect.top + rect.height / 2;
        const eventOptions = {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: checkboxX,
          clientY: checkboxY,
          button: 0,
          buttons: 1,
        };
        turnstileIframe.dispatchEvent(
          new MouseEvent("mouseover", eventOptions),
        );
        turnstileIframe.dispatchEvent(
          new MouseEvent("mousedown", eventOptions),
        );
        turnstileIframe.dispatchEvent(new MouseEvent("mouseup", eventOptions));
        turnstileIframe.dispatchEvent(new MouseEvent("click", eventOptions));
        console.log(
          "[Grok] Clicked turnstile iframe at checkbox position:",
          Math.round(checkboxX),
          Math.round(checkboxY),
        );
        turnstileIframe.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: " ",
            code: "Space",
            keyCode: 32,
            bubbles: true,
          }),
        );
        turnstileIframe.dispatchEvent(
          new KeyboardEvent("keyup", {
            key: " ",
            code: "Space",
            keyCode: 32,
            bubbles: true,
          }),
        );
        console.log("[Grok] Dispatched Space key on turnstile iframe");
      } catch (e) {
        console.warn("[Grok] Turnstile iframe interaction failed:", e.message);
      }
    }
    const turnstileContainer = _queryWithFallback("cloudflare_turnstile");
    if (turnstileContainer) {
      try {
        const rect = turnstileContainer.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const clickEvent = new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: centerX,
          clientY: centerY,
        });
        turnstileContainer.dispatchEvent(clickEvent);
        console.log(
          "[Grok] Clicked turnstile container at",
          Math.round(centerX),
          Math.round(centerY),
        );
      } catch (e) {
        console.warn("[Grok] Turnstile container click failed:", e.message);
      }
    }
    try {
      window.focus();
      document.body.focus();
      const bodyClickEvent = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: window.innerWidth / 2,
        clientY: window.innerHeight / 2,
      });
      document.body.dispatchEvent(bodyClickEvent);
      console.log("[Grok] Clicked page body center");
    } catch (e) {
      console.warn("[Grok] Body click failed:", e.message);
    }
    try {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      for (let i = 0; i <= 5; i++) {
        const x = (centerX * i) / 5;
        const y = (centerY * i) / 5;
        document.body.dispatchEvent(
          new MouseEvent("mousemove", {
            bubbles: true,
            view: window,
            clientX: x,
            clientY: y,
          }),
        );
      }
      document.body.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: centerX,
          clientY: centerY,
          button: 0,
          buttons: 1,
        }),
      );
      document.body.dispatchEvent(
        new MouseEvent("mouseup", {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: centerX,
          clientY: centerY,
          button: 0,
          buttons: 0,
        }),
      );
      console.log(
        "[Grok] Dispatched realistic mouse movement + click sequence",
      );
    } catch (e) {
      console.warn("[Grok] Mouse sequence failed:", e.message);
    }
  }
  async function waitForCloudflareResolved(timeoutMs = 12e4) {
    if (!detectCloudflareChallenge()) return true;
    console.warn(
      "[Grok] Cloudflare challenge detected \u2014 request tab activate + auto-click + ch\u1EDD verify",
    );
    const _wasBlocking = ExecutionBlocker._blocking;
    if (_wasBlocking) {
      console.log(
        "[Grok] \u1EA8n ExecutionBlocker \u0111\u1EC3 user click Cloudflare captcha",
      );
      ExecutionBlocker.hide();
    }
    const _restoreBlocker = () => {
      if (_wasBlocking && !isAbortActive()) ExecutionBlocker.show();
    };
    const _notifySidebar = (phase, elapsedSec = 0) => {
      try {
        chrome.runtime
          .sendMessage({
            action: "cloudflare:challenge",
            provider: "grok",
            phase,
            elapsedSec,
            timeoutSec: Math.round(timeoutMs / 1e3),
          })
          .catch(() => {});
      } catch (_) {}
    };
    _notifySidebar("detected", 0);
    try {
      await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            action: "grok:ensureActive",
            focusWindow: true,
            reason: "cloudflare_challenge",
          },
          () => resolve(),
        );
      });
    } catch (_) {}
    await sleep(500);
    attemptCloudflareClick();
    const start = Date.now();
    let lastLog = 0;
    let clickAttempts = 1;
    const MAX_CLICK_ATTEMPTS = 5;
    const CLICK_RETRY_INTERVAL = 1e4;
    while (Date.now() - start < timeoutMs) {
      if (isAbortActive()) return false;
      if (!detectCloudflareChallenge()) {
        const elapsedSec = Math.round((Date.now() - start) / 1e3);
        console.log(
          "[Grok] Cloudflare challenge resolved sau",
          elapsedSec,
          "s",
        );
        _notifySidebar("resolved", elapsedSec);
        await sleep(800);
        _restoreBlocker();
        try {
          chrome.runtime.sendMessage({ action: "grok:restoreFocus" }, () => {});
        } catch (_) {}
        return true;
      }
      const elapsed = Date.now() - start;
      if (elapsed - lastLog >= 1e4) {
        const elapsedSec = Math.round(elapsed / 1e3);
        console.log(
          "[Grok] V\u1EABn ch\u1EDD Cloudflare challenge resolved...",
          elapsedSec,
          "s",
        );
        lastLog = elapsed;
        _notifySidebar("waiting", elapsedSec);
        if (clickAttempts < MAX_CLICK_ATTEMPTS) {
          console.log("[Grok] Retry click attempt", clickAttempts + 1);
          attemptCloudflareClick();
          clickAttempts++;
        }
      }
      await sleep(800);
    }
    console.error(
      "[Grok] Cloudflare challenge timeout sau",
      timeoutMs / 1e3,
      "s",
    );
    _notifySidebar("timeout", Math.round(timeoutMs / 1e3));
    return false;
  }
  function detectAgeVerificationModal() {
    const modal = _queryWithFallback("age_verification_modal");
    return !!modal;
  }
  async function handleAgeVerificationModal(timeoutMs = 3e4) {
    const modal = _queryWithFallback("age_verification_modal");
    if (!modal) return true;
    console.log(
      "[Grok] Age verification modal detected \u2014 auto-selecting birth year",
    );
    try {
      const scrollContainer = _q("age_verification_scroll_container", modal);
      if (!scrollContainer) {
        console.warn(
          "[Grok] Age verification: kh\xF4ng t\xECm th\u1EA5y scroll container",
        );
        return false;
      }
      const yearButtons = _qa("age_verification_year_button", scrollContainer);
      if (yearButtons.length === 0) {
        console.warn(
          "[Grok] Age verification: kh\xF4ng t\xECm th\u1EA5y year buttons",
        );
        return false;
      }
      const currentYear = new Date().getFullYear();
      const targetYear = currentYear - 25;
      let targetButton = null;
      for (const btn of yearButtons) {
        const yearText = (btn.textContent || "").trim();
        const year = parseInt(yearText, 10);
        if (!isNaN(year) && year <= targetYear) {
          targetButton = btn;
          break;
        }
      }
      if (!targetButton) {
        for (const btn of yearButtons) {
          const yearText = (btn.textContent || "").trim();
          if (
            yearText === "2000" ||
            yearText === "1995" ||
            yearText === "1990"
          ) {
            targetButton = btn;
            break;
          }
        }
      }
      if (!targetButton) {
        console.warn(
          "[Grok] Age verification: kh\xF4ng t\xECm th\u1EA5y n\u0103m ph\xF9 h\u1EE3p",
        );
        return false;
      }
      if (isAbortActive()) return false;
      targetButton.scrollIntoView({ behavior: "smooth", block: "center" });
      await sleep(300);
      if (isAbortActive()) return false;
      if (!clickViaReact(targetButton)) {
        simulateClick(targetButton);
      }
      console.log(
        "[Grok] Age verification: \u0111\xE3 ch\u1ECDn n\u0103m",
        targetButton.textContent?.trim(),
      );
      await sleep(500);
      if (isAbortActive()) return false;
      const allBtns = _qa("age_verification_year_button", modal);
      let continueBtnFound = null;
      for (const btn of allBtns) {
        const txt = (btn.textContent || "").toLowerCase().trim();
        if (txt === "continue" && !btn.disabled) {
          continueBtnFound = btn;
          break;
        }
      }
      if (!continueBtnFound) {
        const footerBtns = _qa("age_verification_continue_button", modal);
        for (const btn of footerBtns) {
          if (!btn.disabled) {
            continueBtnFound = btn;
            break;
          }
        }
      }
      if (!continueBtnFound) {
        console.warn(
          "[Grok] Age verification: Continue button v\u1EABn disabled ho\u1EB7c kh\xF4ng t\xECm th\u1EA5y",
        );
        const start = Date.now();
        while (Date.now() - start < 5e3) {
          if (isAbortActive()) return false;
          await sleep(300);
          for (const btn of allBtns) {
            const txt = (btn.textContent || "").toLowerCase().trim();
            if (txt === "continue" && !btn.disabled) {
              continueBtnFound = btn;
              break;
            }
          }
          if (continueBtnFound) break;
        }
      }
      if (continueBtnFound) {
        if (isAbortActive()) return false;
        if (!clickViaReact(continueBtnFound)) {
          simulateClick(continueBtnFound);
        }
        console.log("[Grok] Age verification: \u0111\xE3 click Continue");
        await sleep(500);
        const closeStart = Date.now();
        while (Date.now() - closeStart < 5e3) {
          if (isAbortActive()) return false;
          if (!_queryWithFallback("age_verification_modal")) {
            console.log(
              "[Grok] Age verification: modal \u0111\xE3 \u0111\xF3ng",
            );
            return true;
          }
          await sleep(200);
        }
        console.warn(
          "[Grok] Age verification: modal ch\u01B0a \u0111\xF3ng sau 5s",
        );
        return !_queryWithFallback("age_verification_modal");
      }
      return false;
    } catch (err) {
      console.error("[Grok] Age verification error:", err.message);
      return false;
    }
  }
  async function clearEditor(editor) {
    if (!editor) editor = findGrokEditor();
    if (!editor) return false;
    editor.focus();
    await sleep(100);
    document.execCommand("selectAll", false, null);
    document.execCommand("delete", false, null);
    editor.dispatchEvent(
      new InputEvent("beforeinput", {
        inputType: "deleteContentBackward",
        bubbles: true,
        cancelable: true,
      }),
    );
    if (!editor.textContent.trim()) return true;
    editor.innerHTML = "<p><br></p>";
    editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await sleep(300);
    return !(findGrokEditor() || editor).textContent.trim();
  }
  async function insertText(editor, text, opts = {}) {
    if (!editor) editor = findGrokEditor();
    if (!editor) return false;
    const preserveBaseline = opts.preserveBaseline === true;
    const baselineHTML = preserveBaseline ? editor.innerHTML : "";
    const sanitized = String(text || "").replace(/@/g, "");
    const force =
      window.__GROK_INSERT_FORCE_TIER ||
      document.documentElement.dataset.tobyGrokInsertForce ||
      null;
    editor.focus();
    await sleep(200);
    function verifyInserted() {
      const norm = (s) => String(s || "").replace(/\s+/g, "");
      const txt = norm(editor.textContent);
      const san = norm(sanitized);
      const sanLen = san.length;
      if (sanLen === 0) return true;
      if (txt.length < Math.floor(sanLen * 0.95)) {
        console.warn(
          "[Grok] verifyInserted FAIL length:",
          txt.length,
          "<",
          Math.floor(sanLen * 0.95),
          "(target",
          sanLen,
          ")",
        );
        return false;
      }
      const headLen = Math.min(20, sanLen);
      const head = san.substring(0, headLen);
      if (!txt.includes(head)) {
        console.warn("[Grok] verifyInserted FAIL head:", JSON.stringify(head));
        return false;
      }
      if (sanLen > 40) {
        const tail = san.substring(sanLen - 20);
        if (!txt.includes(tail)) {
          console.warn(
            "[Grok] verifyInserted FAIL tail:",
            JSON.stringify(tail),
          );
          return false;
        }
      }
      return true;
    }
    const impls = {
      paste: function () {
        console.log("[Grok] Insert[paste] try");
        const dt = new DataTransfer();
        dt.setData("text/plain", sanitized);
        editor.dispatchEvent(
          new ClipboardEvent("paste", {
            clipboardData: dt,
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      execCommand: function () {
        console.log("[Grok] Insert[execCommand] try");
        document.execCommand("insertText", false, sanitized);
      },
      beforeInput: function () {
        console.log("[Grok] Insert[beforeInput] try");
        editor.dispatchEvent(
          new InputEvent("beforeinput", {
            inputType: "insertText",
            data: sanitized,
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      innerHTML: function () {
        console.log("[Grok] Insert[innerHTML] try (last resort)");
        const body = `<p>${sanitized.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`;
        editor.innerHTML =
          preserveBaseline && baselineHTML ? baselineHTML + body : body;
        editor.dispatchEvent(
          new InputEvent("input", { bubbles: true, data: sanitized }),
        );
      },
    };
    const order = ["paste", "execCommand", "beforeInput", "innerHTML"];
    if (force && impls[force]) {
      console.log("[Grok] Insert [FORCE=" + force + "]");
      try {
        impls[force]();
        return verifyInserted();
      } catch (e) {
        console.warn("[Grok] FORCE " + force + " failed:", e.message);
        return false;
      }
    }
    for (let i = 0; i < order.length; i++) {
      const tier = order[i];
      try {
        if (i > 0) {
          editor.innerHTML = preserveBaseline ? baselineHTML : "";
          editor.dispatchEvent(
            new InputEvent("input", {
              bubbles: true,
              inputType: "deleteContentBackward",
            }),
          );
          editor.focus();
          await sleep(100);
          if (preserveBaseline) {
            try {
              const sel = window.getSelection();
              const range = document.createRange();
              range.selectNodeContents(editor);
              range.collapse(false);
              sel.removeAllRanges();
              sel.addRange(range);
            } catch (_) {}
          }
          console.log(
            "[Grok] Reset editor before retry tier:",
            tier,
            preserveBaseline ? "(kept refs)" : "",
          );
        }
        impls[tier]();
        if (verifyInserted()) {
          console.log("[Grok] \u2705 Insert success via:", tier);
          return true;
        }
      } catch (e) {
        console.warn("[Grok] Insert " + tier + " error:", e.message);
      }
    }
    console.warn("[Grok] \u274C All insert tiers failed");
    return false;
  }
  async function getGrokAutomationTimings() {
    const cfg = await _getGrokApiConfig("automation_timings");
    for (const key of [
      "ui_ready_timeout_ms",
      "selection_timeout_ms",
      "submit_ack_timeout_ms",
      "poll_interval_ms",
    ]) {
      if (!Number.isFinite(Number(cfg?.[key])) || Number(cfg[key]) <= 0) {
        throw Object.assign(new Error("GROK_AUTOMATION_TIMINGS_MISSING"), {
          code: "GROK_AUTOMATION_TIMINGS_MISSING",
        });
      }
    }
    return Object.fromEntries(
      Object.entries(cfg).map(([key, value]) => [key, Number(value)]),
    );
  }
  async function pollGrokUi(resolve, budgetMs, timings, stage) {
    const deadline = Date.now() + budgetMs;
    while (Date.now() < deadline) {
      checkAbort(stage);
      const value = resolve();
      if (value) return value;
      await interruptibleSleep(
        Math.min(timings.poll_interval_ms, Math.max(1, deadline - Date.now())),
        stage,
      );
    }
    checkAbort(stage);
    return resolve() || null;
  }
  async function clickSubmit(editor, audit = {}, beforeDispatch = null) {
    const startedAt = Date.now();
    const timings = await getGrokAutomationTimings();
    Object.assign(audit, {
      dispatchAttempted: false,
      acknowledged: false,
      reason: null,
      method: null,
    });
    editor = editor || findGrokEditor();
    if (!editor || !(editor.textContent || "").trim()) {
      audit.reason = "EMPTY_OR_MISSING_EDITOR";
      return false;
    }
    const originalText = editor.textContent.trim();
    const initialUrl = window.location.href;
    const blocked = () =>
      detectSubscribeModal()
        ? "SUBSCRIPTION_REQUIRED"
        : detectAgeVerificationModal()
          ? "AGE_VERIFICATION_REQUIRED"
          : null;
    try {
      editor.focus();
      const ready = await pollGrokUi(
        () => {
          const reason = blocked();
          if (reason) return { reason };
          const button2 = _queryWithFallback("submit_button");
          return button2 &&
            !button2.disabled &&
            button2.getAttribute("aria-disabled") !== "true"
            ? { button: button2 }
            : null;
        },
        timings.ui_ready_timeout_ms,
        timings,
        "wait-submit-control",
      );
      if (ready?.reason) {
        audit.reason = ready.reason;
        return false;
      }
      if (!ready?.button && _queryWithFallback("submit_button")) {
        audit.reason = "SEND_CONTROL_NOT_READY";
        return false;
      }
      const liveEditor = findGrokEditor();
      if (liveEditor && liveEditor !== editor) {
        if ((liveEditor.textContent || "").trim() !== originalText) {
          audit.reason = "COMPOSER_CHANGED";
          return false;
        }
        editor = liveEditor;
      }
      if (editor.isConnected === false) {
        audit.reason = "COMPOSER_DETACHED";
        return false;
      }
      const button = ready?.button || null;
      audit.sendControlMissing = !button;
      const form = button?.closest("form") || editor.closest("form");
      if (form?.checkValidity && !form.checkValidity()) {
        audit.reason = "FORM_INVALID";
        return false;
      }
      const methods = {
        formRequestSubmit:
          form &&
          typeof form.requestSubmit === "function" &&
          button?.type === "submit"
            ? () => form.requestSubmit(button)
            : null,
        enterKey: () => {
          editor.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "Enter",
              code: "Enter",
              keyCode: 13,
              bubbles: true,
              cancelable: true,
            }),
          );
          editor.dispatchEvent(
            new KeyboardEvent("keyup", {
              key: "Enter",
              code: "Enter",
              keyCode: 13,
              bubbles: true,
            }),
          );
        },
        simulateClick: button ? () => simulateClick(button) : null,
        nativeClick: button ? () => button.click() : null,
      };
      const force =
        window.__GROK_SUBMIT_FORCE_METHOD ||
        document.documentElement.dataset.tobyGrokSubmitForce ||
        null;
      const method =
        force && Object.hasOwn(methods, force)
          ? force
          : [
              "formRequestSubmit",
              "enterKey",
              "simulateClick",
              "nativeClick",
            ].find((key) => methods[key]);
      if (!methods[method]) {
        audit.reason = "SUBMIT_TRANSPORT_UNAVAILABLE";
        return false;
      }
      if (beforeDispatch) await beforeDispatch();
      checkAbort("before-submit-transport");
      const liveButton = _queryWithFallback("submit_button");
      if (
        editor.isConnected === false ||
        button?.isConnected === false ||
        button?.disabled ||
        button?.getAttribute("aria-disabled") === "true" ||
        (!button &&
          liveButton &&
          (liveButton.disabled ||
            liveButton.getAttribute("aria-disabled") === "true")) ||
        (editor.textContent || "").trim() !== originalText
      ) {
        audit.reason = "COMPOSER_CHANGED_BEFORE_DISPATCH";
        return false;
      }
      audit.method = method;
      audit.dispatchAttempted = true;
      try {
        methods[method]();
      } catch (error) {
        audit.reason = "DISPATCH_THROWN";
        audit.dispatchErrorName = String(error?.name || "Error").slice(0, 64);
        return false;
      }
      const receipt = await pollGrokUi(
        () => {
          const reason = blocked();
          if (reason) return { reason };
          const current = findGrokEditor();
          if (current === editor && !(current.textContent || "").trim())
            return { accepted: "editor_cleared" };
          try {
            const before = new URL(initialUrl),
              after = new URL(window.location.href);
            if (
              after.origin === before.origin &&
              after.pathname !== before.pathname &&
              /^\/imagine\/post\/[^/]+\/?$/.test(after.pathname)
            )
              return { accepted: "result_navigation" };
          } catch (_) {}
          return null;
        },
        timings.submit_ack_timeout_ms,
        timings,
        "wait-submit-ack",
      );
      audit.reason = receipt?.accepted || receipt?.reason || "ACK_UNCONFIRMED";
      audit.acknowledged = !!receipt?.accepted;
      return audit.acknowledged;
    } finally {
      audit.elapsedMs = Date.now() - startedAt;
      const current = findGrokEditor();
      audit.editorPresent = !!current;
      audit.editorTextLength = (current?.textContent || "").trim().length;
      console.info("[GrokSubmit]", JSON.stringify(audit));
    }
  }
  async function selectMode(mode) {
    const labelCfg = await _getGrokApiConfig("mode_labels");
    const optionCfg = _getDynamicSelector("generation_mode_option");
    const paths = await _getGrokApiConfig("mode_toggle_svg_paths");
    const rawLabels = labelCfg?.[mode],
      pathPrefix = paths?.[mode];
    const audit = {
      mode,
      selectors: optionCfg?.selectors || [],
      labels: rawLabels || null,
      pathPrefix: pathPrefix || null,
      confirmed: false,
    };
    if (
      !optionCfg?.selectors?.length ||
      (!rawLabels && !pathPrefix) ||
      !optionCfg.label_attribute ||
      !optionCfg.selected_attribute
    ) {
      console.warn(
        "[GrokMode]",
        JSON.stringify({ ...audit, reason: "CONFIG_MISSING" }),
      );
      return false;
    }
    const texts = String(rawLabels || "")
      .split("|")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const find = () => {
      const radios = Array.from(
        _queryAllWithFallback("generation_mode_option"),
      );
      const options = radios.map((radio) => {
        const label = String(
          radio.getAttribute(optionCfg.label_attribute) ||
            radio.textContent ||
            "",
        )
          .trim()
          .toLowerCase();
        return {
          radio,
          exactLabel: texts.includes(label),
          labelMatch: texts.some((text) => label.includes(text)),
          iconMatch: !!(
            pathPrefix &&
            optionCfg.svg_path_selector &&
            Array.from(
              radio.querySelectorAll(optionCfg.svg_path_selector),
            ).some((path) =>
              String(path.getAttribute("d") || "").startsWith(pathPrefix),
            )
          ),
        };
      });
      const exact = options.filter((option) => option.exactLabel);
      const labelled = options.filter((option) => option.labelMatch);
      audit.matchMethod = exact.length
        ? "exact_label"
        : labelled.length
          ? "label"
          : "svg";
      const candidates = (
        exact.length
          ? exact
          : labelled.length
            ? labelled
            : options.filter((option) => option.iconMatch)
      ).map((option) => option.radio);
      audit.radioCount = radios.length;
      audit.candidateCount = candidates.length;
      audit.options = options
        .slice(0, 12)
        .map(({ radio, exactLabel, labelMatch, iconMatch }) => ({
          label: String(
            radio.getAttribute(optionCfg.label_attribute) ||
              radio.textContent ||
              "",
          )
            .trim()
            .slice(0, 80),
          selected: radio.getAttribute(optionCfg.selected_attribute),
          matches: candidates.includes(radio),
          exactLabel,
          labelMatch,
          iconMatch,
          visible: radio.getClientRects
            ? radio.getClientRects().length > 0
            : null,
        }));
      return candidates.length === 1 ? candidates[0] : null;
    };
    try {
      audit.confirmed = await confirmGrokSelection(
        find,
        optionCfg.selected_attribute,
        "mode",
      );
      return audit.confirmed;
    } finally {
      console.info("[GrokMode]", JSON.stringify(audit));
    }
  }
  async function confirmGrokSelection(find, selectedAttribute, stage) {
    const timings = await getGrokAutomationTimings();
    const target = await pollGrokUi(
      find,
      timings.ui_ready_timeout_ms,
      timings,
      `wait-${stage}`,
    );
    if (!target) return false;
    if (target.getAttribute(selectedAttribute) === "true") return true;
    checkAbort(`click-${stage}`);
    simulateClick(target);
    return !!(await pollGrokUi(
      () => find()?.getAttribute(selectedAttribute) === "true",
      timings.selection_timeout_ms,
      timings,
      `verify-${stage}`,
    ));
  }
  function grokControlOptions(groupKey) {
    const group = _queryWithFallback(groupKey);
    return group ? Array.from(_qa("control_radio_option", group)) : [];
  }
  function grokVideoMenuButton(key) {
    if (!_getDynamicSelector(key)?.selectors?.length) return null;
    const button = _queryWithFallback(key);
    return button?.getAttribute?.("aria-haspopup") === "menu" ? button : null;
  }
  async function selectGrokVideoDropdown(
    buttonKey,
    requested,
    supported,
    allowLower = false,
  ) {
    const timings = await getGrokAutomationTimings();
    const number = (value) => Number(String(value).replace(/[^0-9]/g, ""));
    const button = () => _queryWithFallback(buttonKey);
    const open = () => button()?.getAttribute("aria-expanded") === "true";
    const caption = () => number(button()?.textContent);
    const options = () => {
      const trigger = button();
      if (!trigger || !open()) return [];
      const menus = Array.from(_qa("open_menu")).filter(
        (menu) =>
          (trigger.getAttribute("aria-controls") &&
            menu.id === trigger.getAttribute("aria-controls")) ||
          (trigger.id && menu.getAttribute("aria-labelledby") === trigger.id),
      );
      return [
        ...new Set(
          menus.flatMap((menu) =>
            Array.from(_qa("video_control_menu_option", menu)),
          ),
        ),
      ];
    };
    if (!open() && caption() === number(requested)) {
      console.info(
        "[GrokVideoControl]",
        JSON.stringify({
          event: "already_selected",
          buttonKey,
          requested,
          applied: requested,
          confirmed: true,
          closed: true,
        }),
      );
      return true;
    }
    let applied = requested,
      confirmed = false,
      closed = false;
    try {
      checkAbort(`open-${buttonKey}`);
      if (!open()) simulateClick(button());
      const rows = await pollGrokUi(
        () => (options().length ? options() : null),
        timings.ui_ready_timeout_ms,
        timings,
        `wait-${buttonKey}-menu`,
      );
      if (!rows) return false;
      if (!rows.some((row) => number(row.textContent) === number(requested))) {
        const lower = allowLower
          ? supported
              .filter(
                (value) =>
                  number(value) < number(requested) &&
                  rows.some((row) => number(row.textContent) === number(value)),
              )
              .sort((a, b) => number(b) - number(a))
          : [];
        if (!lower.length) return false;
        applied = lower[0];
        console.log(
          `[Grok] selectVideoDuration: "${applied}" (fallback from "${requested}")`,
        );
      }
      const target = () =>
        options().find((row) => number(row.textContent) === number(applied));
      if (target()?.getAttribute("aria-checked") !== "true") {
        checkAbort(`select-${buttonKey}`);
        simulateClick(target());
      }
      confirmed = !!(await pollGrokUi(
        () =>
          caption() === number(applied) ||
          target()?.getAttribute("aria-checked") === "true",
        timings.selection_timeout_ms,
        timings,
        `verify-${buttonKey}`,
      ));
    } finally {
      if (open())
        document.activeElement?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
      closed = !!(await pollGrokUi(
        () => !button() || !open(),
        timings.ui_ready_timeout_ms,
        timings,
        `close-${buttonKey}`,
      ));
      console.info(
        "[GrokVideoControl]",
        JSON.stringify({ buttonKey, requested, applied, confirmed, closed }),
      );
    }
    return confirmed && closed;
  }
  async function _getGrokApiConfig(key) {
    try {
      const result = await new Promise((r) =>
        ConfigSnapshotAccess.read(["toby_provider_api_configs"], r),
      );
      const cfg = result?.toby_provider_api_configs?.data?.grok?.configs?.[key];
      return cfg ?? null;
    } catch (_) {
      return null;
    }
  }
  async function selectRatio(ratioKey) {
    const cfg = await _getGrokApiConfig("ratios");
    const list = cfg?.image || cfg?.video;
    if (!Array.isArray(list) || !list.length) return false;
    const target = list.find(
      (item) => item?.ui_name === ratioKey || item?.value === ratioKey,
    )?.value;
    if (!target) return false;
    const timings = await getGrokAutomationTimings();
    const ratioValue = (el) => {
      const label = String(el?.getAttribute?.("aria-label") || "");
      const value =
        label === target
          ? label
          : String(el?.textContent || "").match(
              /^\s*(\d+\s*:\s*\d+)(?!\d)/,
            )?.[1];
      return value?.replace(/\s/g, "") || null;
    };
    const caption = () => ratioValue(_queryWithFallback("ratio_button"));
    const button = await pollGrokUi(
      () => _queryWithFallback("ratio_button"),
      timings.ui_ready_timeout_ms,
      timings,
      "wait-ratio-button",
    );
    if (!button) return false;
    const open =
      button.getAttribute("data-state") === "open" ||
      button.getAttribute("aria-expanded") === "true" ||
      button.closest("[data-state]")?.dataset.state === "open";
    if (caption() === target && !open) {
      console.info(
        "[GrokRatio]",
        JSON.stringify({
          event: "already_selected",
          ratioKey,
          target,
          selectionConfirmed: true,
        }),
      );
      return true;
    }
    const startedAt = Date.now();
    const audit = {
      ratioKey,
      target,
      captionBefore: caption(),
      selectionConfirmed: false,
      buttonSelectors: _getDynamicSelector("ratio_button")?.selectors || [],
      menuSelectors: _getDynamicSelector("open_menu")?.selectors || [],
      itemSelectors: _getDynamicSelector("ratio_menu_item")?.selectors || [],
      expandedBefore: button.getAttribute("aria-expanded"),
      stateBefore: button.getAttribute("data-state"),
    };
    let lastProbe = null,
      probeLogs = 0;
    console.info("[GrokRatio]", JSON.stringify({ event: "start", ...audit }));
    const describe = (el, depth = 0) => ({
      tag: el.tagName || null,
      role: el.getAttribute?.("role") || null,
      state: el.getAttribute?.("data-state") || null,
      label: (
        String(el.getAttribute?.("aria-label") || "").match(/\d+\s*:\s*\d+/g) ||
        []
      ).slice(0, 3),
      ratios: (
        String(el.textContent || "").match(/\d+\s*:\s*\d+/g) || []
      ).slice(0, 5),
      children:
        depth < 2
          ? Array.from(el.children || [])
              .slice(0, 8)
              .map((child) => describe(child, depth + 1))
          : [],
    });
    if (!open) simulateClick(button);
    const find = () => {
      const rawMenus = Array.from(_queryAllWithFallback("open_menu"));
      const menus = rawMenus.filter((menu) => menu.getClientRects().length > 0);
      const items = [
        ...new Set(
          menus.flatMap((menu) => Array.from(_qa("ratio_menu_item", menu))),
        ),
      ];
      const matched = items.find((item) => ratioValue(item) === target) || null;
      audit.menuProbe = {
        rawMenus: rawMenus.length,
        visibleMenus: menus.length,
        itemCount: items.length,
        matched: !!matched,
        menus: menus.slice(0, 3).map((menu) => describe(menu)),
      };
      const fingerprint = JSON.stringify(audit.menuProbe);
      if (fingerprint !== lastProbe && probeLogs < 8) {
        lastProbe = fingerprint;
        probeLogs++;
        console.info(
          "[GrokRatio]",
          JSON.stringify({
            event: "menu_probe",
            target,
            elapsedMs: Date.now() - startedAt,
            ...audit.menuProbe,
          }),
        );
      }
      return matched;
    };
    let confirmed = false;
    try {
      let item = await pollGrokUi(
        find,
        timings.ui_ready_timeout_ms,
        timings,
        "wait-ratio-menu",
      );
      if (!item) {
        const currentButton = _queryWithFallback("ratio_button");
        if (
          currentButton &&
          currentButton.getAttribute("aria-expanded") !== "true" &&
          currentButton.getAttribute("data-state") !== "open" &&
          clickViaReact(currentButton)
        ) {
          item = await pollGrokUi(
            find,
            timings.ui_ready_timeout_ms,
            timings,
            "wait-ratio-menu-react",
          );
        }
      }
      if (!item) {
        audit.reason = "RATIO_ITEM_NOT_FOUND";
        return false;
      }
      let verifyReopened = false,
        selectionDispatched = false;
      const selected = () => {
        if (
          caption() === target ||
          find()?.getAttribute("aria-checked") === "true"
        )
          return true;
        const currentButton = _queryWithFallback("ratio_button");
        if (
          selectionDispatched &&
          !verifyReopened &&
          currentButton &&
          (currentButton.getAttribute("aria-expanded") === "false" ||
            currentButton.getAttribute("data-state") === "closed")
        ) {
          verifyReopened = true;
          audit.verifyReopened = true;
          checkAbort("reopen-ratio-verification");
          simulateClick(currentButton);
        }
        return find()?.getAttribute("aria-checked") === "true";
      };
      if (!selected()) {
        selectionDispatched = true;
        simulateClick(item);
      }
      confirmed = !!(await pollGrokUi(
        selected,
        timings.selection_timeout_ms,
        timings,
        "verify-ratio",
      ));
      if (!confirmed) {
        checkAbort("before-ratio-react-retry");
        const current = find();
        if (selected()) confirmed = true;
        else if (current && clickViaReact(current)) {
          confirmed = !!(await pollGrokUi(
            selected,
            timings.selection_timeout_ms,
            timings,
            "verify-ratio-react",
          ));
        }
      }
    } catch (error) {
      audit.reason = error.message?.startsWith("ABORTED")
        ? "ABORTED"
        : error.code || "EXCEPTION";
      throw error;
    } finally {
      audit.selectionConfirmed = confirmed;
      audit.elapsedMs = Date.now() - startedAt;
      console.info(
        "[GrokRatio]",
        JSON.stringify({ event: "selection_finished", ...audit }),
      );
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    }
    if (!confirmed) return false;
    return !!(await pollGrokUi(
      () => {
        const currentButton = _queryWithFallback("ratio_button");
        return (
          currentButton?.getAttribute("aria-expanded") === "false" ||
          currentButton?.getAttribute("data-state") === "closed" ||
          !find()
        );
      },
      timings.ui_ready_timeout_ms,
      timings,
      "close-ratio-menu",
    ));
  }
  async function selectVideoDuration(duration) {
    const supported = await _getGrokApiConfig("supported_durations");
    if (!Array.isArray(supported) || !supported.includes(duration))
      return false;
    const number = (value) => Number(String(value).replace(/[^0-9]/g, ""));
    const timings = await getGrokAutomationTimings();
    const rows = () => grokControlOptions("video_duration_picker");
    const ready = await pollGrokUi(
      () =>
        grokVideoMenuButton("video_duration_menu_button") ||
        rows().some((radio) =>
          supported.some(
            (value) =>
              number(value) > 0 && number(radio.textContent) === number(value),
          ),
        ),
      timings.ui_ready_timeout_ms,
      timings,
      "wait-duration-controls",
    );
    if (!ready) return false;
    if (grokVideoMenuButton("video_duration_menu_button")) {
      return selectGrokVideoDropdown(
        "video_duration_menu_button",
        duration,
        supported,
        true,
      );
    }
    let applied = duration;
    if (
      !rows().some((radio) => number(radio.textContent) === number(duration))
    ) {
      const candidates = supported
        .filter(
          (value) =>
            number(value) < number(duration) &&
            rows().some((radio) => number(radio.textContent) === number(value)),
        )
        .sort((a, b) => number(b) - number(a));
      if (!candidates.length) return false;
      applied = candidates[0];
      console.log(
        `[Grok] selectVideoDuration: "${applied}" (fallback from "${duration}")`,
      );
    }
    return confirmGrokSelection(
      () =>
        rows().find((radio) => number(radio.textContent) === number(applied)),
      "aria-checked",
      "duration",
    );
  }
  async function selectVideoResolution(resolution) {
    const supported = await _getGrokApiConfig("supported_resolutions");
    if (!Array.isArray(supported) || !supported.includes(resolution))
      return false;
    const timings = await getGrokAutomationTimings();
    const ready = await pollGrokUi(
      () =>
        grokVideoMenuButton("video_resolution_menu_button") ||
        grokControlOptions("video_resolution_picker").length,
      timings.ui_ready_timeout_ms,
      timings,
      "wait-resolution-controls",
    );
    if (!ready) return false;
    if (grokVideoMenuButton("video_resolution_menu_button")) {
      return selectGrokVideoDropdown(
        "video_resolution_menu_button",
        resolution,
        supported,
      );
    }
    const want = String(resolution).trim().toLowerCase(),
      wantNum = want.replace(/[^0-9]/g, "");
    return confirmGrokSelection(
      () =>
        grokControlOptions("video_resolution_picker").find((radio) => {
          const text = (radio.textContent || "").trim().toLowerCase();
          return (
            text === want ||
            (wantNum && text.replace(/[^0-9]/g, "") === wantNum)
          );
        }),
      "aria-checked",
      "resolution",
    );
  }
  async function selectImageQuality(quality) {
    const supported = await _getGrokApiConfig("supported_image_qualities");
    const target = String(quality || "").toLowerCase();
    const cfg = await _getGrokApiConfig("image_quality_labels");
    if (
      !Array.isArray(supported) ||
      !supported.includes(target) ||
      !cfg?.[target]
    )
      return false;
    const labels = String(cfg[target])
      .split("|")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    return confirmGrokSelection(
      () =>
        grokControlOptions("image_quality_picker").find((radio) => {
          const text = (radio.textContent || "").trim().toLowerCase();
          return labels.some((label) => text === label || text.includes(label));
        }),
      "aria-checked",
      "image-quality",
    );
  }
  async function applyGrokImageQualityOnly(settings) {
    const { mode, imageQuality } = settings || {};
    if (!imageQuality) return true;
    if (mode === "video") return true;
    if (mode === "image" && !(await selectMode("image"))) {
      console.warn(
        "[Grok] pre-upload Image mode not confirmed \u2014 skip image quality",
      );
      return false;
    }
    const qOk = await selectImageQuality(imageQuality);
    await sleep(200);
    if (!qOk) {
      console.warn(
        "[Grok] applyGrokImageQualityOnly (pre-upload) failed:",
        imageQuality,
      );
      return false;
    }
    console.log(
      "[Grok] applyGrokImageQualityOnly: applied",
      imageQuality,
      "(pre-upload)",
    );
    return true;
  }
  async function applyGrokSettings(settings, opts = {}) {
    const {
      skipImageQuality = false,
      skipMode = false,
      skipRatio = false,
      skipVideoControls = false,
    } = opts;
    const { mode, ratio, duration, resolution, imageQuality } = settings || {};
    let ok = true;
    if (mode && !skipMode) {
      const modeOk = await selectMode(mode);
      await sleep(300);
      if (!modeOk) ok = false;
    }
    if (ratio && !skipRatio) {
      const ratioOk = await selectRatio(ratio);
      await sleep(200);
      if (!ratioOk) ok = false;
    }
    if (!skipImageQuality && imageQuality && mode === "image") {
      const qOk = await selectImageQuality(imageQuality);
      await sleep(200);
      if (!qOk) console.warn("[Grok] selectImageQuality failed:", imageQuality);
    }
    if (mode !== "image" && duration && !skipVideoControls) {
      const durOk = await selectVideoDuration(duration);
      await sleep(200);
      if (!durOk) ok = false;
    }
    if (mode !== "image" && resolution && !skipVideoControls) {
      const resOk = await selectVideoResolution(resolution);
      await sleep(200);
      if (!resOk) ok = false;
    }
    return ok;
  }
  async function removeExistingRefImages() {
    const usePrimary = _queryAllWithFallback("remove_image_button").length > 0;
    const currentButtons = () => {
      const buttons = Array.from(_queryAllWithFallback("remove_image_button"));
      if (usePrimary) return buttons;
      const uploadContainerSel = _selStr("upload_container");
      const editorForm = findGrokEditor()?.closest("form");
      return Array.from(
        _queryAllWithFallback("remove_image_button_broad"),
      ).filter(
        (btn) =>
          (editorForm && editorForm.contains(btn)) ||
          (uploadContainerSel && btn.closest(uploadContainerSel)),
      );
    };
    let removedCount = 0;
    while (currentButtons().length) {
      checkAbort("remove-existing-refs");
      const before = currentButtons().length;
      let btn = currentButtons()[0];
      try {
        if (!clickViaReact(btn)) simulateClick(btn);
      } catch (_) {
        simulateClick(btn);
      }
      const waitForRemoval = async () => {
        const deadline = Date.now() + 1500;
        while (currentButtons().length >= before && Date.now() < deadline) {
          await interruptibleSleep(75, "verify-remove-ref");
        }
        return currentButtons().length < before;
      };
      if (!(await waitForRemoval())) {
        btn = currentButtons()[0];
        simulateClick(btn);
        if (!(await waitForRemoval()))
          throw Object.assign(new Error("GROK_REF_CLEAR_FAILED"), {
            code: "GROK_REF_CLEAR_FAILED",
            details: { removedCount, remainingCount: currentButtons().length },
          });
      }
      removedCount += before - currentButtons().length;
    }
    if (removedCount > 0) {
      console.log(
        `[Grok] removeExistingRefImages: \u0111\xE3 x\xF3a ${removedCount} ref image(s) c\u0169`,
      );
    }
    return removedCount;
  }
  function reportGenLocalRefUpload(images, uploading) {
    for (const image of Array.isArray(images) ? images : []) {
      const progress = image?.genLocalRef;
      if (!progress?.runId || !progress?.refId) continue;
      try {
        const sent = chrome.runtime.sendMessage({
          action: "gen:localRefUploadProgress",
          ...progress,
          uploading,
        });
        sent?.catch?.(() => {});
      } catch (_) {}
    }
  }
  async function uploadImages(images, onProgress = async () => {}) {
    if (!Array.isArray(images) || images.length === 0)
      return { success: true, count: 0 };
    let injectedCount = 0;
    let completedCount = 0;
    let pendingCount = 0;
    for (const data of images) {
      if (!data?.base64) continue;
      reportGenLocalRefUpload([data], true);
      await onProgress({
        stage: "upload_ref_start",
        index: injectedCount,
        requestedCount: images.length,
      });
      let uploadState = null;
      try {
        const binary = atob(data.base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const file = new File([bytes], data.name || "ref.png", {
          type: data.type || "image/png",
        });
        const fileInput = _queryWithFallback("file_input");
        if (!fileInput) {
          console.warn("[Grok] uploadImages: file input not found");
          continue;
        }
        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
        const propsKey = Object.keys(fileInput).find((k) =>
          k.startsWith("__reactProps$"),
        );
        if (propsKey && typeof fileInput[propsKey]?.onChange === "function") {
          fileInput[propsKey].onChange({
            target: fileInput,
            currentTarget: fileInput,
            preventDefault() {},
            stopPropagation() {},
            nativeEvent: new Event("change"),
            type: "change",
          });
        } else fileInput.dispatchEvent(new Event("change", { bubbles: true }));
        injectedCount++;
        console.log(
          `[Grok] uploadImages: injected file ${injectedCount}/${images.length} (${data.name || "ref.png"})`,
        );
        uploadState = await waitForUploadComplete(3e4);
        if (uploadState === "complete") completedCount++;
        else if (uploadState === "pending") pendingCount++;
        else if (uploadState === "aborted") break;
      } catch (err) {
        console.warn("[Grok] uploadImages error:", err.message);
      } finally {
        reportGenLocalRefUpload([data], false);
      }
      await onProgress({
        stage: "upload_ref_finished",
        index: injectedCount - 1,
        uploadState,
        injectedCount,
        completedCount,
        requestedCount: images.length,
      });
    }
    const usableCount = completedCount + pendingCount;
    return {
      success: usableCount > 0,
      count: usableCount,
      injected: injectedCount,
      completed: completedCount,
      total: images.length,
    };
  }
  async function setVideoRefRole(index, selectorKey, audit = {}) {
    const timings = await getGrokAutomationTimings();
    Object.assign(audit, {
      index,
      selectorKey,
      stage: "find-trigger",
      url: window.location.href,
    });
    checkAbort("before-ref-role");
    const currentTrigger = () =>
      Array.from(_queryAllWithFallback("ref_role_trigger"))[index];
    let trigger = currentTrigger();
    const optionConfig = _getDynamicSelector(selectorKey);
    audit.refCount = _queryAllWithFallback("ref_role_trigger").length;
    audit.roleSelectors = optionConfig?.selectors ?? null;
    audit.optionsSelectors =
      _getDynamicSelector("ref_role_options")?.selectors ?? null;
    console.info("[GrokRefRole] start", JSON.stringify(audit));
    if (
      !trigger ||
      !optionConfig?.selectors?.length ||
      !_getDynamicSelector("ref_role_options")?.selectors?.length
    ) {
      Object.assign(audit, {
        triggerSelectors:
          _getDynamicSelector("ref_role_trigger")?.selectors ?? null,
        roleSelectors: optionConfig?.selectors ?? null,
        optionsSelectors:
          _getDynamicSelector("ref_role_options")?.selectors ?? null,
        removeCount: _queryAllWithFallback("remove_image_button").length,
      });
      console.warn(
        "[GrokRefRole] selector config or uploaded-ref trigger missing",
        JSON.stringify(audit),
      );
      return false;
    }
    const optionsFor = (element) => {
      const rect = element.getBoundingClientRect();
      audit.triggerRect = {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      };
      return {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        pointerType: "mouse",
        relatedTarget: null,
      };
    };
    const hover = () => {
      trigger = currentTrigger();
      if (!trigger) return;
      const eventOptions = optionsFor(trigger);
      trigger.dispatchEvent(new PointerEvent("pointerover", eventOptions));
      trigger.dispatchEvent(new MouseEvent("mouseover", eventOptions));
      trigger.dispatchEvent(new PointerEvent("pointerenter", eventOptions));
      trigger.dispatchEvent(new MouseEvent("mouseenter", eventOptions));
    };
    const leave = () => {
      trigger = currentTrigger() || trigger;
      if (!trigger) return;
      const eventOptions = optionsFor(trigger);
      trigger.dispatchEvent(new PointerEvent("pointerout", eventOptions));
      trigger.dispatchEvent(new MouseEvent("mouseout", eventOptions));
      trigger.dispatchEvent(new PointerEvent("pointerleave", eventOptions));
      trigger.dispatchEvent(new MouseEvent("mouseleave", eventOptions));
    };
    let lastProbe = null;
    const findOption = (recordAudit = true) => {
      const rawOptions = Array.from(_queryAllWithFallback("ref_role_options"));
      const rawMatches = Array.from(_queryAllWithFallback(selectorKey));
      const options = rawOptions.filter((el) => el.getClientRects().length > 0);
      const matches = rawMatches.filter((el) => el.getClientRects().length > 0);
      const menuMatch = {
        rawOptionCount: rawOptions.length,
        visibleOptionCount: options.length,
        rawTargetCount: rawMatches.length,
        visibleTargetCount: matches.length,
        selectedCount: options.filter(
          (el) => el.getAttribute("aria-pressed") === "true",
        ).length,
      };
      const menuRejectReason = !rawOptions.length
        ? "OPTIONS_SELECTOR_NO_MATCH"
        : !options.length
          ? "OPTIONS_NOT_VISIBLE"
          : !rawMatches.length
            ? "TARGET_SELECTOR_NO_MATCH"
            : matches.length !== 1
              ? "TARGET_NOT_UNIQUE_OR_VISIBLE"
              : !options.includes(matches[0])
                ? "TARGET_OUTSIDE_OPTIONS"
                : options.some(
                      (el) => el.parentElement !== matches[0].parentElement,
                    )
                  ? "MULTIPLE_MENU_PARENTS"
                  : menuMatch.selectedCount !== 1
                    ? "SELECTED_ROLE_NOT_UNIQUE"
                    : null;
      if (recordAudit) Object.assign(audit, { menuMatch, menuRejectReason });
      if (recordAudit && menuRejectReason) {
        const describe = (el) => ({
          tag: el.tagName,
          state: el.getAttribute("data-state"),
          pressed: el.getAttribute("aria-pressed"),
          hasPopup: el.getAttribute("aria-haspopup"),
          hoverCard: String(el.getAttribute("style") || "").includes(
            "--radix-hover-card-content-transform-origin",
          ),
          childCount: el.children?.length ?? 0,
          label:
            el.tagName === "BUTTON"
              ? (el.textContent || "").trim().slice(0, 120)
              : null,
        });
        const openMenus = Array.from(_queryAllWithFallback("open_menu"))
          .filter((el) => el.getClientRects().length > 0)
          .slice(0, 3)
          .map((el) => ({
            ...describe(el),
            children: Array.from(el.children || [])
              .slice(0, 8)
              .map((child) => ({
                ...describe(child),
                children: Array.from(child.children || [])
                  .slice(0, 8)
                  .map(describe),
              })),
          }));
        const probe = JSON.stringify({
          index,
          selectorKey,
          menuMatch,
          menuRejectReason,
          openMenus,
        });
        if (probe !== lastProbe) {
          lastProbe = probe;
          console.info("[GrokRefRole] menu_probe", probe);
        }
      }
      if (menuRejectReason) return null;
      return matches[0];
    };
    const selectionState = () =>
      Array.from(_queryAllWithFallback("ref_role_options"))
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => el.getAttribute("aria-pressed"));
    try {
      audit.stage = "open-menu";
      hover();
      const deadline = Date.now() + timings.ui_ready_timeout_ms;
      let option = null;
      while (Date.now() < deadline) {
        checkAbort("wait-ref-role-menu");
        option = findOption();
        if (option) break;
        await interruptibleSleep(
          timings.poll_interval_ms,
          "wait-ref-role-menu",
        );
      }
      if (!option) {
        audit.options = Array.from(_queryAllWithFallback(selectorKey)).map(
          (el) => ({
            text: el.textContent?.trim().slice(0, 120),
            pressed: el.getAttribute("aria-pressed"),
          }),
        );
        console.warn("[GrokRefRole] menu item did not appear", {
          index,
          selectorKey,
          url: location.href,
          refCount: _queryAllWithFallback("ref_role_trigger").length,
          options: Array.from(_queryAllWithFallback(selectorKey)).map((el) => ({
            text: el.textContent?.trim(),
            pressed: el.getAttribute("aria-pressed"),
          })),
        });
        return false;
      }
      audit.beforeSelection = selectionState();
      if (option.getAttribute("aria-pressed") === "true") {
        audit.alreadySelected = true;
        return true;
      }
      audit.stage = "verify-selection";
      const usedReact = clickViaReact(option);
      audit.clickMethods = [usedReact ? "react" : "native"];
      if (!usedReact) simulateClick(option);
      const verifySelection = async () => {
        const verifyDeadline = Date.now() + timings.selection_timeout_ms;
        while (Date.now() < verifyDeadline) {
          checkAbort("verify-ref-role");
          hover();
          const currentOption2 = findOption();
          audit.afterSelection = selectionState();
          if (currentOption2?.getAttribute("aria-pressed") === "true")
            return true;
          if (
            !currentOption2 &&
            selectorKey === "ref_role_option" &&
            _queryWithFallback("ratio_button", null, { silent: true })
          ) {
            audit.ratioControlAvailable = true;
            audit.verificationFallback = "RATIO_CONTROL_AVAILABLE";
            return false;
          }
          await interruptibleSleep(timings.poll_interval_ms, "verify-ref-role");
        }
        return false;
      };
      if (await verifySelection()) return true;
      const currentOption = findOption();
      if (usedReact && currentOption) {
        if (currentOption.getAttribute("aria-pressed") === "true") return true;
        audit.clickMethods.push("native");
        simulateClick(currentOption);
        if (await verifySelection()) return true;
      }
      console.warn("[GrokRefRole] role click was not confirmed", {
        index,
        selectorKey,
        url: location.href,
        pressed: findOption()?.getAttribute("aria-pressed") ?? null,
      });
      audit.pressed = findOption()?.getAttribute("aria-pressed") ?? null;
      return false;
    } finally {
      leave();
      const closeDeadline = Date.now() + timings.ui_ready_timeout_ms;
      while (findOption(false) && Date.now() < closeDeadline)
        await interruptibleSleep(
          timings.poll_interval_ms,
          "close-ref-role-menu",
        );
      if (findOption(false))
        throw Object.assign(new Error("GROK_REF_ROLE_MENU_STUCK"), {
          code: "GROK_REF_ROLE_MENU_STUCK",
        });
    }
  }
  async function waitForUploadComplete(timeout = 3e4) {
    await interruptibleSleep(1e3, "upload-initial-wait");
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (isAbortActive()) return "aborted";
      const failed = _queryWithFallback("upload_error_icon");
      if (failed) {
        console.warn(
          "[Grok] Upload \u1EA3nh th\u1EA5t b\u1EA1i, x\xF3a upload l\u1ED7i...",
        );
        const removeBtn =
          failed.closest("button") ||
          _q("upload_error_close_button")?.closest("button");
        if (removeBtn) {
          simulateClick(removeBtn);
          await sleep(500);
        }
        return "failed";
      }
      const loading = _queryWithFallback("upload_loading_indicator");
      if (!loading) return "complete";
      await sleep(300);
    }
    console.warn("[Grok] waitForUploadComplete timeout");
    return "pending";
  }
  function inlineImageIdentity(src) {
    let hash = 2166136261;
    for (let i = 0; i < src.length; i++)
      hash = Math.imul(hash ^ src.charCodeAt(i), 16777619);
    return `${src.length}:${hash >>> 0}`;
  }
  function snapshotConversationState() {
    return {
      url: window.location.href,
      timestamp: Date.now(),
      inlineImageIdentities: _queryAllWithFallback(
        "result_lightbox_inline_image",
      ).map((img) => inlineImageIdentity(img.getAttribute("src") || "")),
    };
  }
  function findNewInlineImage(baseline, prompt) {
    if (!Array.isArray(baseline.inlineImageIdentities) || !prompt) return null;
    const images = _queryAllWithFallback("result_lightbox_inline_image");
    if (images.length !== 1) return null;
    const img = images[0];
    const src = img.getAttribute("src") || "";
    const normalize = (value) =>
      String(value || "")
        .trim()
        .replace(/\s+/g, " ");
    if (
      !/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(src) ||
      !img.complete ||
      img.naturalWidth <= 100 ||
      img.naturalHeight <= 100 ||
      normalize(img.alt) !== normalize(prompt) ||
      baseline.inlineImageIdentities.includes(inlineImageIdentity(src))
    )
      return null;
    return src;
  }
  function clickFeedCard(img) {
    const r = img.getBoundingClientRect();
    const cx = Math.max(1, Math.round(r.left + r.width / 2));
    const cy = Math.max(1, Math.round(r.top + r.height / 2));
    const pos = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: cx,
      clientY: cy,
      screenX: cx,
      screenY: cy,
      button: 0,
    };
    const pDown = {
      ...pos,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      buttons: 1,
      width: 1,
      height: 1,
      pressure: 0.5,
    };
    const pUp = {
      ...pos,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      buttons: 0,
      width: 1,
      height: 1,
      pressure: 0,
    };
    try {
      img.dispatchEvent(new PointerEvent("pointerover", pDown));
      img.dispatchEvent(new PointerEvent("pointerenter", pDown));
      img.dispatchEvent(new MouseEvent("mouseover", pos));
      img.dispatchEvent(new PointerEvent("pointerdown", pDown));
      img.dispatchEvent(new MouseEvent("mousedown", { ...pos, buttons: 1 }));
      img.dispatchEvent(new PointerEvent("pointerup", pUp));
      img.dispatchEvent(new MouseEvent("mouseup", pos));
      img.dispatchEvent(new MouseEvent("click", { ...pos, detail: 1 }));
    } catch (_) {}
    try {
      let el = img;
      for (let depth = 0; el && depth < 8; depth++, el = el.parentElement) {
        const rk = Object.keys(el).find((x) => x.startsWith("__reactProps$"));
        const p = rk && el[rk];
        if (
          p &&
          (typeof p.onClick === "function" ||
            typeof p.onPointerDown === "function" ||
            typeof p.onPointerUp === "function")
        ) {
          const synth = (type, extra) => ({
            preventDefault() {},
            stopPropagation() {},
            isPropagationStopped: () => false,
            persist() {},
            nativeEvent: new MouseEvent(type, pos),
            type,
            target: el,
            currentTarget: el,
            clientX: cx,
            clientY: cy,
            screenX: cx,
            screenY: cy,
            button: 0,
            detail: 1,
            ...extra,
          });
          try {
            p.onPointerDown &&
              p.onPointerDown(
                synth("pointerdown", {
                  buttons: 1,
                  pointerId: 1,
                  pointerType: "mouse",
                }),
              );
          } catch (_) {}
          try {
            p.onPointerUp &&
              p.onPointerUp(
                synth("pointerup", {
                  buttons: 0,
                  pointerId: 1,
                  pointerType: "mouse",
                }),
              );
          } catch (_) {}
          try {
            p.onClick && p.onClick(synth("click", {}));
          } catch (_) {}
          break;
        }
      }
    } catch (_) {}
  }
  async function waitForResultPage(baseline, timeout = 6e4, options = {}) {
    const startTime = Date.now();
    const POLL_INTERVAL = 500;
    const FEED_MIN_WAIT = 4e3;
    let feedSettleKey = null,
      feedSettleN = 0,
      lastFeedClickAt = 0;
    let clickedFeedMediaUrl = null;
    let inlineSettleKey = null;
    while (Date.now() - startTime < timeout) {
      if (isAbortActive()) {
        console.log("[Grok-wait] Aborted \u2192 clicking Stop button");
        await clickGrokStopButton();
        return { redirected: false, url: window.location.href, aborted: true };
      }
      if (detectSubscribeModal()) {
        return {
          redirected: false,
          url: window.location.href,
          subscriptionRequired: true,
        };
      }
      const currentUrl = window.location.href;
      if (
        currentUrl !== baseline.url &&
        currentUrl.includes("/imagine/post/")
      ) {
        return {
          redirected: true,
          url: currentUrl,
          feedMediaUrl: clickedFeedMediaUrl,
        };
      }
      if (options.noRefImage) {
        const inlineSrc = findNewInlineImage(baseline, options.prompt);
        const identity = inlineSrc ? inlineImageIdentity(inlineSrc) : null;
        if (identity && identity === inlineSettleKey) {
          return {
            redirected: false,
            resultReady: true,
            url: currentUrl,
            inlineImageUrl: inlineSrc,
            feedMediaUrl: clickedFeedMediaUrl,
          };
        }
        inlineSettleKey = identity;
      }
      if (
        currentUrl.includes("/imagine") &&
        !currentUrl.includes("/imagine/post/") &&
        Date.now() - startTime > FEED_MIN_WAIT
      ) {
        try {
          const section = _queryWithFallback("result_feed_section", null, {
            silent: true,
          });
          const cardImgSels =
            _getDynamicSelector("result_feed_card_image")?.selectors || [];
          let img = null;
          for (const sel of cardImgSels) {
            try {
              img = section?.querySelector(sel);
            } catch (_) {}
            if (img) break;
          }
          const src = img?.getAttribute("src") || "";
          if (img && src) {
            const key = src.length + ":" + src.slice(-48);
            if (key === feedSettleKey) {
              feedSettleN++;
              if (feedSettleN >= 2 && Date.now() - lastFeedClickAt > 3e3) {
                lastFeedClickAt = Date.now();
                clickedFeedMediaUrl = /^https?:\/\//i.test(src) ? src : null;
                clickFeedCard(img);
                console.log(
                  "[Grok-wait] Feed /imagine: click \u1EA3nh m\u1EDBi nh\u1EA5t (section-0) \u2192 m\u1EDF post (retry m\u1ED7i 3s)",
                );
              }
            } else {
              feedSettleKey = key;
              feedSettleN = 0;
            }
          }
        } catch (e) {}
      }
      await sleep(POLL_INTERVAL);
    }
    return { redirected: false, url: window.location.href };
  }
  function findGenerationProgress() {
    if (!window.location.href.includes("/imagine/post/")) return null;
    const allSpans = document.querySelectorAll("span");
    for (const span of allSpans) {
      const text = (span.textContent || "").trim();
      const match = text.match(/^(\d{1,3})%$/);
      if (!match) continue;
      const pct = parseInt(match[1], 10);
      if (pct < 0 || pct > 100) continue;
      const parent = span.parentElement;
      if (!parent) continue;
      const parentText = parent.textContent || "";
      if (/generating/i.test(parentText)) {
        return pct;
      }
    }
    return null;
  }
  function clickGeneratedVideoFilmstrip() {
    const itemSels = _getDynamicSelector("filmstrip_item")?.selectors || [
      "[data-filmstrip-item]",
    ];
    let items = [];
    for (const s of itemSels) {
      try {
        const f = document.querySelectorAll(s);
        if (f.length) {
          items = [...f];
          break;
        }
      } catch (_) {}
    }
    for (const item of items) {
      const src = item.querySelector("img")?.src || "";
      if (src.includes("/generated/") && /preview_image/i.test(src)) {
        simulateClick(item);
        console.log(
          "[Grok] Clicked generated-video filmstrip \u2192 load <video> v\xE0o main view",
        );
        return true;
      }
    }
    return false;
  }
  function extractImageUrls(excludeUrls = null, cdnHosts = null) {
    if (!window.location.href.includes("/imagine/post/"))
      return { mediaUrls: [], mediaType: "image", mediaPosters: [] };
    const hosts =
      Array.isArray(cdnHosts) && cdnHosts.length
        ? cdnHosts
        : ["assets.grok.com", "grok.x.ai", "imagine-public.x.ai"];
    const container = _queryWithFallback("result_container");
    if (!container) {
      console.debug("[Tier3] Grok extractImageUrls: result_container miss");
      return { mediaUrls: [], mediaType: "image", mediaPosters: [] };
    }
    const seenUrls = new Set();
    const mediaUrls = [];
    const mediaPosters = [];
    let mediaType = "image";
    const queryInContainer = (key, fallbackSel) => {
      const sels = _getDynamicSelector(key)?.selectors || fallbackSel;
      for (const s of sels) {
        try {
          const found = container.querySelectorAll(s);
          if (found.length) return [...found];
        } catch (_) {}
      }
      return [];
    };
    const videos = queryInContainer("result_video", ["video"]);
    for (const video of videos) {
      const src = video.src || video.querySelector("source")?.src;
      if (src && (src.startsWith("https://") || src.startsWith("http://"))) {
        const baseUrl = src.split("?")[0];
        if (seenUrls.has(baseUrl)) continue;
        seenUrls.add(baseUrl);
        mediaUrls.push(src);
        const poster = video.getAttribute("poster") || "";
        mediaPosters.push(
          /^https?:\/\//i.test(poster) &&
            hosts.some((host) => poster.includes(host))
            ? poster
            : "",
        );
        mediaType = "video";
      }
    }
    if (mediaUrls.length === 0) {
      const imgs = queryInContainer("result_image", ['img[src^="https://"]']);
      let nCand = 0,
        nReject = 0;
      for (const img of imgs) {
        if (img.alt === "Loading") continue;
        if (
          img.className &&
          (img.className.includes("blur-sm") ||
            img.className.includes("blur-md"))
        )
          continue;
        if (img.width <= 10 || img.height <= 10) continue;
        if (img.naturalWidth > 0 && img.naturalWidth <= 10) continue;
        if (img.alt && img.alt.startsWith("Thumbnail")) continue;
        if (img.alt === "Most recent favorite") continue;
        if (
          img.closest("nav") ||
          img.closest("aside") ||
          img.closest('[aria-label="Saved"]')
        )
          continue;
        const isFromGrokCdn = hosts.some((h) => img.src.includes(h));
        const isAvatar =
          img.src.includes("/avatar") || img.src.includes("/profile");
        const isLogo = img.src.includes("/logo") || img.src.includes("/icon");
        if (!isFromGrokCdn || isAvatar || isLogo) continue;
        nCand++;
        const baseUrl = img.src.split("?")[0];
        if (seenUrls.has(baseUrl)) continue;
        if (excludeUrls && excludeUrls.has(baseUrl)) {
          nReject++;
          continue;
        }
        if (baseUrl.endsWith("/content")) {
          nReject++;
          continue;
        }
        seenUrls.add(baseUrl);
        mediaUrls.push(img.src);
      }
      console.log(
        `[Grok-extract] container imgs=${imgs.length} candidates=${nCand} excluded=${nReject} \u2192 media=${mediaUrls.length} | hosts=${mediaUrls.map((u) => u.split("/")[2]).join(",")}`,
      );
    }
    return { mediaUrls, mediaType, mediaPosters };
  }
  async function navigateBack() {
    if (!window.location.href.includes("/imagine/post/")) return true;
    const backBtn = _queryWithFallback("back_button");
    if (backBtn) {
      const propsKey = Object.keys(backBtn).find((k) =>
        k.startsWith("__reactProps$"),
      );
      if (propsKey && backBtn[propsKey]?.onClick) {
        backBtn[propsKey].onClick({
          preventDefault() {},
          stopPropagation() {},
          nativeEvent: new MouseEvent("click", { bubbles: true }),
          type: "click",
          target: backBtn,
          currentTarget: backBtn,
        });
      } else {
        simulateClick(backBtn);
      }
      for (let i = 0; i < 10; i++) {
        await sleep(500);
        if (!window.location.href.includes("/imagine/post/")) return true;
      }
    }
    window.history.back();
    for (let i = 0; i < 10; i++) {
      await sleep(500);
      if (!window.location.href.includes("/imagine/post/")) return true;
    }
    return false;
  }
  function detectError() {
    const text = (document.body?.innerText || "").toLowerCase();
    if (_grokPatterns.rateLimit.some((p) => text.includes(p)))
      return "RATE_LIMIT";
    if (_grokPatterns.contentBlocked.some((p) => text.includes(p)))
      return "CONTENT_BLOCKED";
    if (_grokPatterns.network.some((p) => text.includes(p))) return "NETWORK";
    return null;
  }
  function detectSubscribeModal() {
    const subscribePatterns = _grokPatterns.subscriptionRequired;
    if (subscribePatterns.length === 0) return false;
    const dialogs = _visibleDynamicElements("modal_overlay_wrapper");
    for (const dialog of dialogs) {
      const text = (dialog.innerText || "").toLowerCase();
      const matchedPattern = subscribePatterns.find((pattern) =>
        text.includes(pattern),
      );
      if (matchedPattern) {
        console.warn("[GrokSubscribe] visible subscription dialog detected", {
          pattern: matchedPattern,
          hash: window.location.hash || null,
        });
        return true;
      }
    }
    return false;
  }
  let __grokAbort = false;
  let __grokAbortAt = 0;
  let __grokCallStartAt = 0;
  function isAbortActive() {
    return __grokAbort && __grokAbortAt >= __grokCallStartAt;
  }
  function checkAbort(stage) {
    if (isAbortActive()) {
      console.log("[Grok-abort] Aborted at stage:", stage);
      throw new Error("ABORTED:" + stage);
    }
  }
  async function interruptibleSleep(totalMs, stage = "sleep") {
    const POLL = 200;
    const start = Date.now();
    while (Date.now() - start < totalMs) {
      if (isAbortActive()) {
        console.log(
          "[Grok-abort] Interruptible sleep aborted at stage:",
          stage,
        );
        throw new Error("ABORTED:" + stage);
      }
      const remaining = totalMs - (Date.now() - start);
      await sleep(Math.min(POLL, remaining));
    }
  }
  async function clickGrokStopButton() {
    const stopKey = `${__grokCallStartAt}:${__grokAbortAt}`;
    if (clickGrokStopButton.lastStopKey === stopKey) return false;
    const stopBtn = _queryWithFallback("stop_button");
    if (stopBtn && !stopBtn.disabled) {
      console.log("[Grok-abort] Clicking Grok Stop button to halt backend gen");
      clickGrokStopButton.lastStopKey = stopKey;
      try {
        simulateClick(stopBtn);
      } catch (e) {
        return false;
      }
      await sleep(300);
      return true;
    }
    console.log("[Grok-abort] Stop button not found or disabled");
    return false;
  }
  function isLoggedIn() {
    const editor = findGrokEditor();
    if (!editor) return false;
    const loginLink = _queryWithFallback("auth_link");
    if (loginLink) {
      const editorReadable =
        editor && editor.getAttribute("contenteditable") === "true";
      if (!editorReadable) return false;
    }
    return true;
  }
  function checkLoginRequired() {
    return !isLoggedIn();
  }
  async function checkpointGrokOperation(payload, state) {
    if (!payload.requestId) return;
    const response = await chrome.runtime.sendMessage({
      action: "grok:operationCheckpoint",
      requestId: payload.requestId,
      state: { ...state, url: window.location.href },
    });
    if (!response?.success)
      throw new Error(response?.error || "GROK_CHECKPOINT_FAILED");
  }
  async function handleSubmitAndWait(payload, sendResponse) {
    const respond = sendResponse;
    sendResponse = (result) => {
      const savedResult = { ...result };
      if (savedResult.fetchedMedia) savedResult.fetchedMedia = [];
      checkpointGrokOperation(payload, {
        stage: "complete",
        result: savedResult,
      }).then(
        () => respond(result),
        (err) => {
          console.warn(
            "[GrokOperation] completion checkpoint failed:",
            err.message,
          );
          respond(result);
        },
      );
    };
    __grokCallStartAt = Date.now();
    if (__grokAbort && __grokAbortAt < __grokCallStartAt - 5e3) {
      __grokAbort = false;
      __grokAbortAt = 0;
    }
    await restoreTrackerSnapshot;
    const promptPreview = (payload.text || "").substring(0, 50);
    FloatingTracker.setProviderProgress?.(null);
    FloatingTracker.show({
      current: 0,
      total: 1,
      phase: _i18n.t("preparing"),
      prompt: promptPreview,
      genMode: payload.settings?.mode || "image",
    });
    ExecutionBlocker.show();
    try {
      const { text, images, settings, timeout, taskName } = payload;
      const timeoutMs = timeout || 12e4;
      const recovery = payload.recoveryState;
      if (
        payload.recover &&
        (!recovery || recovery.requestId !== payload.requestId)
      ) {
        sendResponse({ success: false, error: "GROK_RECOVERY_STATE_MISSING" });
        return;
      }
      if (recovery?.stage === "complete") {
        respond(recovery.result);
        return;
      }
      const resumeWait = ["submitting", "waiting_result"].includes(
        recovery?.stage,
      );
      if (resumeWait && !recovery.baseline) {
        sendResponse({ success: false, error: "GROK_RECOVERY_STATE_MISSING" });
        return;
      }
      let baseline = resumeWait ? recovery.baseline : null;
      let refUrlsToExclude = resumeWait
        ? new Set(recovery.refUrlsToExclude || [])
        : null;
      const configDeadline = Date.now() + _SELECTOR_WAIT_MAX_MS;
      while (!_selectorConfig?.[PROVIDER] && Date.now() < configDeadline) {
        checkAbort("wait-selector-config");
        await sleep(_SELECTOR_WAIT_INTERVAL_MS);
      }
      if (!_selectorConfig?.[PROVIDER]) {
        sendResponse({ success: false, error: "GROK_SELECTOR_CONFIG_MISSING" });
        return;
      }
      console.log("[GrokOperation] start", {
        requestId: payload.requestId,
        recover: !!payload.recover,
        stage: recovery?.stage || "preparing",
        url: window.location.href,
        resumeWait,
      });
      if (!resumeWait) {
        await checkpointGrokOperation(payload, { stage: "preparing" });
        if (settings?.mode === "video" && images?.length > 0) {
          if (settings.videoInputType === "Frames" && images.length > 2) {
            sendResponse({ success: false, error: "GROK_REF_LIMIT_EXCEEDED" });
            return;
          }
        }
        if (checkLoginRequired()) {
          FloatingTracker.hide();
          ExecutionBlocker.hide();
          sendResponse({ success: false, error: "NOT_LOGGED_IN" });
          return;
        }
        checkAbort("after-login-check");
        if (detectCloudflareChallenge()) {
          FloatingTracker.update({ phase: _i18n.t("waitingVerification") });
          const resolved = await waitForCloudflareResolved(12e4);
          if (!resolved) {
            FloatingTracker.hide();
            ExecutionBlocker.hide();
            sendResponse({
              success: false,
              error: "CLOUDFLARE_CHALLENGE_TIMEOUT",
              message:
                "Grok requires Cloudflare verification. Please open the Grok tab, complete verification, then run again.",
            });
            return;
          }
          checkAbort("after-cloudflare");
        }
        const _curUrl = window.location.href;
        if (_curUrl.includes("/imagine/post/")) {
          await checkpointGrokOperation(payload, {
            stage: "navigating_editor",
          });
          console.log(
            "[Grok] handleSubmitAndWait: \u0111ang \u1EDF result page, navigate back v\u1EC1 /imagine",
          );
          await navigateBack();
          await sleep(500);
        } else if (
          _curUrl.includes("/imagine/saved") ||
          _curUrl.match(/\/imagine\/projects/)
        ) {
          await checkpointGrokOperation(payload, {
            stage: "navigating_editor",
          });
          console.log(
            "[Grok] handleSubmitAndWait: \u0111ang \u1EDF /imagine/saved ho\u1EB7c /projects, navigate sang /imagine",
          );
          const imagineNavBtn = _queryWithFallback("imagine_link");
          if (imagineNavBtn) {
            const propsKey = Object.keys(imagineNavBtn).find((k) =>
              k.startsWith("__reactProps$"),
            );
            if (propsKey && imagineNavBtn[propsKey]?.onClick) {
              try {
                imagineNavBtn[propsKey].onClick({
                  preventDefault: function () {},
                  stopPropagation: function () {},
                  nativeEvent: new MouseEvent("click", { bubbles: true }),
                  type: "click",
                  target: imagineNavBtn,
                  currentTarget: imagineNavBtn,
                });
              } catch (_) {
                simulateClick(imagineNavBtn);
              }
            } else {
              simulateClick(imagineNavBtn);
            }
          } else {
            const urls = await _getGrokApiConfig("urls");
            const imagineUrl = urls?.imagine;
            if (imagineUrl) {
              window.location.href = imagineUrl;
            } else {
              console.debug(
                "[Tier3] Grok urls.imagine config miss \u2014 skip navigate",
              );
            }
          }
          const navStart = Date.now();
          while (Date.now() - navStart < 5e3) {
            if (
              findGrokEditor() &&
              window.location.href.includes("/imagine") &&
              !window.location.href.includes("/imagine/saved") &&
              !window.location.href.includes("/imagine/projects")
            ) {
              break;
            }
            await sleep(200);
          }
          await sleep(500);
        }
        checkAbort("after-navigate");
        console.log("[GrokOperation] editor navigation finished", {
          requestId: payload.requestId,
          url: window.location.href,
        });
        baseline = snapshotConversationState();
        const composerState = (auditSelectors = false) => {
          const selectorAudit = auditSelectors
            ? { ref_role_trigger: {}, remove_image_button: {} }
            : null;
          const state = {
            refCount: _queryAllWithFallback(
              "ref_role_trigger",
              null,
              selectorAudit?.ref_role_trigger,
            ).length,
            removeCount: _queryAllWithFallback(
              "remove_image_button",
              null,
              selectorAudit?.remove_image_button,
            ).length,
            editorTextLength:
              findGrokEditor()?.textContent?.trim().length ?? null,
          };
          if (selectorAudit) {
            state.selectorAudit = selectorAudit;
            if (!state.refCount && !state.removeCount) {
              let form = findGrokEditor();
              while (form && form.tagName !== "FORM") form = form.parentElement;
              const pending = form ? [form] : [];
              const thumbnails = [];
              let visited = 0;
              while (
                pending.length &&
                visited++ < 1e3 &&
                thumbnails.length < 8
              ) {
                const element = pending.pop();
                if (element.tagName === "IMG") {
                  const ancestors = [];
                  let parent = element.parentElement;
                  for (
                    let depth = 0;
                    parent && parent !== form && depth < 6;
                    depth++, parent = parent.parentElement
                  ) {
                    ancestors.push({
                      tag: parent.tagName,
                      attributes: Array.from(parent.attributes || []).map(
                        (attr) => attr.name,
                      ),
                      baseUiId: String(parent.id || "").startsWith("base-ui-"),
                      childTags: Array.from(parent.children || [])
                        .map((child) => child.tagName)
                        .slice(0, 8),
                    });
                  }
                  thumbnails.push({ ancestors });
                }
                pending.push(...Array.from(element.children || []));
              }
              state.thumbnailStructure = { formFound: !!form, thumbnails };
            }
          }
          return state;
        };
        const preparationCheckpoint = (state) =>
          checkpointGrokOperation(payload, {
            ...state,
            composer: composerState(),
          });
        const refRoleBypasses = [];
        const bypassRefRole = async (reason, details) => {
          const warning = { reason, ...details };
          refRoleBypasses.push(warning);
          console.warn(
            "[GrokRefRole] selection bypassed \u2014 continue with attached refs and current roles",
            JSON.stringify(warning),
          );
          await preparationCheckpoint({
            stage: "select_ref_role_bypassed",
            ...warning,
          });
        };
        await preparationCheckpoint({ stage: "clear_refs_start" });
        const removedCount = await removeExistingRefImages();
        await sleep(300);
        await preparationCheckpoint({
          stage: "clear_refs_finished",
          removedCount,
        });
        checkAbort("after-remove-refs");
        if (composerState().refCount || composerState().removeCount) {
          sendResponse({
            success: false,
            error: "GROK_REF_CLEAR_FAILED",
            details: composerState(),
          });
          return;
        }
        const editor = findGrokEditor();
        if (!editor) {
          FloatingTracker.hide();
          ExecutionBlocker.hide();
          sendResponse({ success: false, error: "EDITOR_NOT_FOUND" });
          return;
        }
        await preparationCheckpoint({ stage: "clear_editor_start" });
        const editorCleared = await clearEditor(editor);
        await sleep(300);
        await preparationCheckpoint({
          stage: "clear_editor_finished",
          editorCleared,
        });
        checkAbort("after-clear-editor");
        if (!editorCleared || composerState().editorTextLength !== 0) {
          sendResponse({
            success: false,
            error: "GROK_EDITOR_CLEAR_FAILED",
            details: composerState(),
          });
          return;
        }
        if (settings) {
          await applyGrokImageQualityOnly(settings);
          checkAbort("after-apply-image-quality");
        }
        await sleep(getMacroDelay());
        let uploadedCount = 0;
        if (Array.isArray(images) && images.length > 0) {
          const uploadResult = await uploadImages(
            images,
            preparationCheckpoint,
          );
          await preparationCheckpoint({
            stage: "upload_refs_finished",
            uploadResult,
            requestedCount: images.length,
          });
          if (!uploadResult.success) {
            FloatingTracker.hide();
            ExecutionBlocker.hide();
            sendResponse({
              success: false,
              error: "REF_UPLOAD_FAILED",
              message: "Cannot upload ref image",
            });
            return;
          }
          uploadedCount =
            settings?.mode === "video" && settings.videoInputType === "Frames"
              ? uploadResult.count || uploadResult.completed || 0
              : uploadResult.completed || uploadResult.count || 0;
          console.log(
            `[Grok] Upload result: injected=${uploadResult.injected}, usable=${uploadResult.count}, completed=${uploadResult.completed}, s\u1EBD @mention ${uploadedCount} images`,
          );
          refUrlsToExclude = new Set();
          const refImgs = _queryAllWithFallback("grok_cdn_image");
          for (const img of refImgs) {
            if (img.src) refUrlsToExclude.add(img.src.split("?")[0]);
          }
        }
        const needsReferenceBeforeVideoControls =
          settings?.mode === "video" && uploadedCount > 0;
        if (settings) {
          const applyWithRetry = async (value, options, stage) => {
            let ok = await applyGrokSettings(value, options);
            if (ok) return true;
            console.warn(
              `[GrokSettings] ${stage} apply failed \u2014 retry once after controls settle`,
              {
                mode: value.mode,
                ratio: value.ratio,
                duration: value.duration,
                resolution: value.resolution,
              },
            );
            await sleep(500);
            return applyGrokSettings(value, options);
          };
          let settingsOk;
          if (needsReferenceBeforeVideoControls) {
            settingsOk = await applyWithRetry(
              settings,
              {
                skipImageQuality: true,
                skipRatio: true,
                skipVideoControls: true,
              },
              "video-mode-before-reference",
            );
            checkAbort("after-apply-video-mode");
            if (!settingsOk) {
              sendResponse({
                success: false,
                error: "GROK_VIDEO_MODE_NOT_CONFIRMED",
              });
              return;
            }
            const uploadedComposer = composerState(true);
            const roles = settings.refRoleSelectors;
            const isFrames = settings.videoInputType === "Frames";
            const roleConfigReady =
              Array.isArray(roles) &&
              roles.length > 0 &&
              (!isFrames || roles.length >= uploadedCount) &&
              roles.every(
                (key) => _getDynamicSelector(key)?.selectors?.length,
              ) &&
              _getDynamicSelector("ref_role_trigger")?.selectors?.length &&
              _getDynamicSelector("ref_role_options")?.selectors?.length;
            const refCountMatches = uploadedComposer.refCount === uploadedCount;
            if (!uploadedComposer.refCount && !uploadedComposer.removeCount) {
              console.warn(
                "[GrokRefRole] reference detection failed before role selection",
                JSON.stringify({
                  ...uploadedComposer,
                  uploadedCount,
                  requestedCount: images.length,
                }),
              );
            }
            if (!refCountMatches || !roleConfigReady) {
              await bypassRefRole(
                !refCountMatches
                  ? "GROK_REF_COUNT_MISMATCH"
                  : "GROK_REF_ROLE_CONFIG_MISSING",
                {
                  ...uploadedComposer,
                  uploadedCount,
                  requestedCount: images.length,
                },
              );
            }
            for (
              let index = 0;
              refCountMatches && roleConfigReady && index < uploadedCount;
              index++
            ) {
              const selectorKey = isFrames ? roles[index] : roles[0];
              const roleAudit = {
                uploadedCount,
                requestedCount: images.length,
              };
              await preparationCheckpoint({
                stage: "select_ref_role_start",
                index,
                selectorKey,
              });
              let roleConfirmed = false;
              try {
                roleConfirmed = await setVideoRefRole(
                  index,
                  selectorKey,
                  roleAudit,
                );
              } catch (error) {
                checkAbort("ref-role-selection-failed");
                if (error.message?.startsWith("ABORTED")) throw error;
                roleAudit.error = error.code || error.message;
              }
              await preparationCheckpoint({
                stage: "select_ref_role_finished",
                roleConfirmed,
                roleAudit,
              });
              if (!roleConfirmed) {
                await bypassRefRole(
                  roleAudit.error || "GROK_REF_ROLE_NOT_CONFIRMED",
                  roleAudit,
                );
              }
            }
            checkAbort("after-ref-roles");
            const controlsOk = await applyWithRetry(
              settings,
              {
                skipImageQuality: true,
                skipMode: true,
                skipRatio: !_queryWithFallback("ratio_button", null, {
                  silent: true,
                }),
              },
              "video-controls-after-reference",
            );
            settingsOk = settingsOk && controlsOk;
          } else {
            settingsOk = await applyWithRetry(
              settings,
              { skipImageQuality: true },
              "settings",
            );
          }
          if (!settingsOk) {
            console.warn(
              "[GrokSettings] apply failed after retry \u2014 continue with current UI settings",
              {
                mode: settings.mode,
                ratio: settings.ratio,
                duration: settings.duration,
                resolution: settings.resolution,
                uploadedCount,
              },
            );
          }
          checkAbort("after-apply-settings");
          await sleep(getMacroDelay());
        }
        let mentionBypass = null;
        if (uploadedCount > 0) {
          let mentionIndex = null;
          try {
            console.log(
              `[Grok] @mention loop cho ${uploadedCount} ref image(s)`,
            );
            const mentionTimings = await getGrokAutomationTimings();
            const probeValue = Number(mentionTimings.mention_probe_timeout_ms);
            const mentionProbeMs =
              Number.isFinite(probeValue) && probeValue > 0 ? probeValue : 0;
            const waitForMentionDropdown = async () => {
              const start = Date.now();
              while (Date.now() - start < mentionProbeMs) {
                checkAbort("wait-mention-dropdown");
                const dropdown = document.querySelector(
                  '[role="listbox"], [role="menu"][data-state="open"], [data-radix-popper-content-wrapper] [role="option"], [role="option"][aria-selected], [cmdk-list], [cmdk-list-sizer], [data-cmdk-list], [data-radix-popper-content-wrapper], div[role="presentation"][data-state="open"]',
                );
                if (dropdown) return true;
                await interruptibleSleep(
                  mentionTimings.poll_interval_ms,
                  "wait-mention-dropdown",
                );
              }
              return false;
            };
            const getMentionOptions = () =>
              Array.from(
                document.querySelectorAll(
                  '[data-radix-popper-content-wrapper] [role="option"], [role="listbox"] [role="option"], [cmdk-item], [data-cmdk-item], [role="menuitem"], [role="option"]',
                ),
              ).filter((el) => el.offsetParent !== null);
            for (let imgIdx = 0; imgIdx < uploadedCount; imgIdx++) {
              mentionIndex = imgIdx;
              let curEditor = findGrokEditor();
              if (!curEditor) {
                throw Object.assign(
                  new Error("GROK_MENTION_EDITOR_NOT_READY"),
                  { code: "GROK_MENTION_EDITOR_NOT_READY" },
                );
              }
              curEditor.focus();
              await sleep(150);
              if (document.execCommand("insertText", false, "@") === false) {
                throw Object.assign(new Error("GROK_MENTION_INSERT_FAILED"), {
                  code: "GROK_MENTION_INSERT_FAILED",
                });
              }
              const dropdownOpen = await waitForMentionDropdown();
              if (!dropdownOpen) {
                console.info(
                  "[GrokMention] probe miss \u2014 continue legacy attachment selection",
                  JSON.stringify({ index: imgIdx, timeoutMs: mentionProbeMs }),
                );
              }
              checkAbort("before-mention-selection");
              await sleep(250);
              const options = getMentionOptions();
              if (options.length > 0) {
                const target = options[Math.min(imgIdx, options.length - 1)];
                simulateClick(target);
                console.log(
                  `[Grok] @mention iter ${imgIdx + 1}: clicked option "${(target.textContent || "").trim().slice(0, 30)}" (${options.length} options visible)`,
                );
                await sleep(400);
              } else {
                console.debug(
                  `[Grok] @mention iter ${imgIdx + 1}: dropdownOpen=${dropdownOpen}, kh\xF4ng th\u1EA5y option element \u2192 fallback ArrowDown+Enter`,
                );
                for (let arrowIdx = 0; arrowIdx < imgIdx; arrowIdx++) {
                  curEditor.dispatchEvent(
                    new KeyboardEvent("keydown", {
                      key: "ArrowDown",
                      code: "ArrowDown",
                      keyCode: 40,
                      bubbles: true,
                      cancelable: true,
                    }),
                  );
                  curEditor.dispatchEvent(
                    new KeyboardEvent("keyup", {
                      key: "ArrowDown",
                      code: "ArrowDown",
                      keyCode: 40,
                      bubbles: true,
                    }),
                  );
                  await sleep(120);
                }
                curEditor.dispatchEvent(
                  new KeyboardEvent("keydown", {
                    key: "Enter",
                    code: "Enter",
                    keyCode: 13,
                    bubbles: true,
                    cancelable: true,
                  }),
                );
                curEditor.dispatchEvent(
                  new KeyboardEvent("keyup", {
                    key: "Enter",
                    code: "Enter",
                    keyCode: 13,
                    bubbles: true,
                  }),
                );
                await sleep(400);
              }
              const vEditor = findGrokEditor();
              if (
                !vEditor ||
                String(vEditor.textContent || "")
                  .trimEnd()
                  .endsWith("@")
              ) {
                throw Object.assign(new Error("GROK_MENTION_NOT_SELECTED"), {
                  code: "GROK_MENTION_NOT_SELECTED",
                });
              }
              console.log(
                `[Grok] @mention iter ${imgIdx + 1}: editor tail="${(vEditor?.textContent || "").slice(-40)}"`,
              );
            }
          } catch (error) {
            checkAbort("mention-bypass");
            if (error.message?.startsWith("ABORTED")) throw error;
            mentionBypass = {
              index: mentionIndex,
              reason: error.code || error.message || "GROK_MENTION_FAILED",
            };
            try {
              const current = findGrokEditor();
              mentionBypass.editorCleared =
                !!current && (await clearEditor(current));
            } catch (cleanupError) {
              checkAbort("mention-bypass-cleanup");
              if (cleanupError.message?.startsWith("ABORTED"))
                throw cleanupError;
              mentionBypass.editorCleared = false;
            }
            await preparationCheckpoint({
              stage: "ref_mention_bypassed",
              uploadedCount,
              ...mentionBypass,
            });
            console.warn(
              "[GrokMention] bypass \u2014 continue prompt with native attachments",
              JSON.stringify(mentionBypass),
            );
          } finally {
            const finalEditor = findGrokEditor();
            if (finalEditor) {
              try {
                finalEditor.dispatchEvent(
                  new KeyboardEvent("keydown", {
                    key: "Escape",
                    code: "Escape",
                    keyCode: 27,
                    bubbles: true,
                    cancelable: true,
                  }),
                );
                finalEditor.dispatchEvent(
                  new KeyboardEvent("keyup", {
                    key: "Escape",
                    code: "Escape",
                    keyCode: 27,
                    bubbles: true,
                  }),
                );
              } catch (error) {
                checkAbort("close-mention-dropdown");
                if (error.message?.startsWith("ABORTED")) throw error;
                console.warn(
                  "[GrokMention] dropdown close failed (non-fatal)",
                  error.message,
                );
              }
            }
          }
          await sleep(200);
        }
        checkAbort("after-mention-loop");
        await sleep(getMacroDelay());
        let editorAfterMention = findGrokEditor() || editor;
        if (uploadedCount > 0) {
          try {
            editorAfterMention.focus();
            await sleep(80);
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(editorAfterMention);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
            console.log(
              "[Grok] Cursor moved to END before insertText (post-@mention)",
            );
            await sleep(100);
          } catch (cursorErr) {
            console.warn(
              "[Grok] Move cursor to end failed (non-fatal):",
              cursorErr.message,
            );
          }
        }
        await insertText(editorAfterMention, text || "", {
          preserveBaseline: uploadedCount > 0 && !mentionBypass,
        });
        await sleep(500);
        checkAbort("after-insert-prompt");
        await sleep(getMacroDelay());
        editorAfterMention = findGrokEditor() || editorAfterMention;
        editorAfterMention.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Escape",
            code: "Escape",
            keyCode: 27,
            bubbles: true,
            cancelable: true,
          }),
        );
        editorAfterMention.dispatchEvent(
          new KeyboardEvent("keyup", {
            key: "Escape",
            code: "Escape",
            keyCode: 27,
            bubbles: true,
          }),
        );
        await sleep(100);
        checkAbort("before-submit");
        if (refRoleBypasses.length) {
          const readyComposer = composerState();
          const bypassReady =
            uploadedCount > 0 &&
            !!text?.trim() &&
            readyComposer.editorTextLength > 0;
          await preparationCheckpoint({
            stage: "ref_role_bypass_submit_ready",
            bypassReady,
            refRoleBypasses,
          });
          if (!bypassReady) {
            sendResponse({
              success: false,
              error: "GROK_REF_ROLE_BYPASS_NOT_READY",
              details: readyComposer,
            });
            return;
          }
        }
        if (mentionBypass) {
          const readyComposer = composerState();
          const bypassReady =
            uploadedCount > 0 &&
            !!text?.trim() &&
            readyComposer.editorTextLength > 0;
          await preparationCheckpoint({
            stage: "ref_mention_bypass_submit_ready",
            bypassReady,
            mentionBypass,
          });
          if (!bypassReady) {
            sendResponse({
              success: false,
              error: "GROK_REF_MENTION_BYPASS_NOT_READY",
              details: readyComposer,
            });
            return;
          }
        }
        const beforeSubmitDispatch = () =>
          checkpointGrokOperation(payload, {
            stage: "submitting",
            baseline,
            refUrlsToExclude: Array.from(refUrlsToExclude || []),
          });
        checkAbort("before-submit-after-checkpoint");
        console.log("[GrokOperation] before submit", {
          requestId: payload.requestId,
          url: window.location.href,
        });
        const submitAudit = {};
        let submitOk = await clickSubmit(
          editorAfterMention,
          submitAudit,
          beforeSubmitDispatch,
        );
        console.log("[GrokOperation] after submit", {
          requestId: payload.requestId,
          url: window.location.href,
          submitOk,
        });
        if (!submitOk && submitAudit.reason !== "AGE_VERIFICATION_REQUIRED") {
          FloatingTracker.hide();
          ExecutionBlocker.hide();
          const subDeadline = Date.now() + 1500;
          let _subDetectedEarly = false;
          while (Date.now() < subDeadline) {
            checkAbort("submit-failure-reason");
            if (detectSubscribeModal()) {
              _subDetectedEarly = true;
              break;
            }
            await sleep(200);
          }
          if (_subDetectedEarly) {
            console.warn(
              "[Grok] Subscribe modal detected sau clickSubmit fail \u2192 user ch\u01B0a mua g\xF3i",
            );
            sendResponse({
              success: false,
              error: "SUBSCRIPTION_REQUIRED",
              message:
                "You are not subscribed to Grok Premium. Please subscribe at grok.com to use image/video generation.",
            });
            return;
          }
          sendResponse({
            success: false,
            error: "SUBMIT_FAILED",
            details: submitAudit,
            message: `SUBMIT_FAILED: ${JSON.stringify(submitAudit)}`,
          });
          return;
        }
        checkAbort("after-submit");
        await interruptibleSleep(800, "after-submit-grace");
        checkAbort("post-submit-grace");
        if (
          submitAudit.reason === "AGE_VERIFICATION_REQUIRED" ||
          detectAgeVerificationModal()
        ) {
          console.log(
            "[Grok] Age verification modal detected sau submit \u2014 handling...",
          );
          const ageOk = await handleAgeVerificationModal(3e4);
          checkAbort("after-age-verification");
          if (!ageOk) {
            FloatingTracker.hide();
            ExecutionBlocker.hide();
            sendResponse({
              success: false,
              error: "AGE_VERIFICATION_FAILED",
              message:
                "Could not verify age automatically. Please open the Grok tab, complete age verification manually, then run again.",
            });
            return;
          }
          await sleep(500);
          const editorRetry = findGrokEditor();
          if (!submitOk && editorRetry) {
            console.log(
              "[Grok] Re-submitting after explicit age-verification block",
            );
            const retryAudit = {};
            submitOk = await clickSubmit(
              editorRetry,
              retryAudit,
              beforeSubmitDispatch,
            );
            if (!submitOk) {
              FloatingTracker.hide();
              ExecutionBlocker.hide();
              sendResponse({
                success: false,
                error: "SUBMIT_FAILED_AFTER_AGE_VERIFY",
                details: retryAudit,
                message: `SUBMIT_FAILED_AFTER_AGE_VERIFY: ${JSON.stringify(retryAudit)}`,
              });
              return;
            }
          }
          if (!submitOk) {
            sendResponse({
              success: false,
              error: "SUBMIT_FAILED_AFTER_AGE_VERIFY",
              details: submitAudit,
            });
            return;
          }
          await sleep(500);
        }
        const subModalDeadline = Date.now() + 3e3;
        let _subDetected = false;
        while (Date.now() < subModalDeadline) {
          if (isAbortActive()) {
            FloatingTracker.hide();
            ExecutionBlocker.hide();
            sendResponse({
              success: false,
              error: "ABORTED",
              message: "User stopped task",
            });
            return;
          }
          if (detectSubscribeModal()) {
            _subDetected = true;
            break;
          }
          await sleep(250);
        }
        if (_subDetected) {
          console.warn("[Grok] Subscribe modal detected sau submit");
          FloatingTracker.hide();
          ExecutionBlocker.hide();
          sendResponse({
            success: false,
            error: "SUBSCRIPTION_REQUIRED",
            message:
              "You are not subscribed to Grok Premium. Please subscribe at grok.com to use image/video generation.",
          });
          return;
        }
      }
      await checkpointGrokOperation(payload, {
        stage: "waiting_result",
        baseline,
        refUrlsToExclude: Array.from(refUrlsToExclude || []),
      });
      FloatingTracker.update({
        current: 0,
        total: 1,
        phase: _i18n.t("waitingResult"),
        prompt: promptPreview,
      });
      const waitResult = await waitForResultPage(baseline, timeoutMs, {
        noRefImage: settings?.mode !== "video" && !images?.length,
        prompt: text,
      });
      console.log("[GrokOperation] result navigation", {
        requestId: payload.requestId,
        url: waitResult.url,
        redirected: waitResult.redirected,
        resultReady: !!waitResult.resultReady,
      });
      if (!waitResult.redirected && !waitResult.resultReady) {
        FloatingTracker.hide();
        ExecutionBlocker.hide();
        if (waitResult.aborted) {
          sendResponse({
            success: false,
            error: "ABORTED",
            message: "User stopped task",
          });
          return;
        }
        if (waitResult.subscriptionRequired) {
          sendResponse({
            success: false,
            error: "SUBSCRIPTION_REQUIRED",
            message:
              "You are not subscribed to Grok Premium. Please subscribe at grok.com to use image/video generation.",
          });
          return;
        }
        const err = detectError();
        if (err) {
          FloatingTracker.hide();
          ExecutionBlocker.hide();
          sendResponse({
            success: false,
            error: err,
            message: "Detected error while waiting for result",
          });
          return;
        }
        FloatingTracker.hide();
        ExecutionBlocker.hide();
        sendResponse({
          success: false,
          error: "TIMEOUT",
          message: "Redirect timed out",
        });
        return;
      }
      await interruptibleSleep(3e3, "pre-extract-grace");
      const isVideoMode = settings?.mode === "video";
      const extractBudget = isVideoMode
        ? Math.max(timeoutMs, 6e5)
        : Math.max(timeoutMs, 3e5);
      const HEARTBEAT_TIMEOUT = 9e4;
      const cdnHosts = (await _getGrokApiConfig("urls"))?.cdn_patterns;
      let mediaUrls = [];
      let mediaType = "image";
      let mediaPosters = [];
      let lastProgress = -1;
      let lastProgressChangeTime = Date.now();
      let progressDetectedOnce = false;
      const extractDeadline = Date.now() + extractBudget;
      const startExtract = Date.now();
      while (Date.now() < extractDeadline) {
        if (isAbortActive()) {
          console.log(
            "[Grok] Extract loop aborted by user \u2192 clicking Stop button",
          );
          await clickGrokStopButton();
          FloatingTracker.hide();
          ExecutionBlocker.hide();
          sendResponse({
            success: false,
            error: "ABORTED",
            message: "User stopped task",
          });
          return;
        }
        if (detectCloudflareChallenge()) {
          console.warn(
            "[Grok] Cloudflare challenge re-emerged trong extract loop \u2192 abort",
          );
          FloatingTracker.hide();
          ExecutionBlocker.hide();
          sendResponse({
            success: false,
            error: "CLOUDFLARE_CHALLENGE_TIMEOUT",
            message:
              "Cloudflare challenge reappeared during generation \u2014 the session may have expired. Please verify manually and run again.",
          });
          return;
        }
        const currentProgress = findGenerationProgress();
        FloatingTracker.setProviderProgress?.(currentProgress);
        if (currentProgress !== null) {
          progressDetectedOnce = true;
          if (currentProgress !== lastProgress) {
            const elapsedSec = Math.round((Date.now() - startExtract) / 1e3);
            console.log(
              `[Grok] Generating ${currentProgress}% (elapsed ${elapsedSec}s)`,
            );
            lastProgress = currentProgress;
            lastProgressChangeTime = Date.now();
            try {
              chrome.runtime
                .sendMessage({
                  action: "grok:gen_progress",
                  progress: currentProgress,
                  mode: isVideoMode ? "video" : "image",
                  elapsed: elapsedSec,
                })
                .catch(() => {});
            } catch (_) {}
          } else {
            const idleMs = Date.now() - lastProgressChangeTime;
            if (idleMs > HEARTBEAT_TIMEOUT) {
              console.warn(
                `[Grok] Progress stuck at ${currentProgress}% for ${Math.round(idleMs / 1e3)}s \u2192 timeout s\u1EDBm`,
              );
              break;
            }
          }
        } else if (progressDetectedOnce) {
        }
        if (isVideoMode) {
          const rc = _queryWithFallback("result_container");
          if (rc && !rc.querySelector("video")) clickGeneratedVideoFilmstrip();
        }
        if (!isVideoMode && !images?.length && !waitResult.inlineImageUrl) {
          waitResult.inlineImageUrl = findNewInlineImage(baseline, text);
        }
        const inlineMediaUrl =
          waitResult.inlineImageUrl &&
          (() => {
            try {
              const feedUrl = new URL(waitResult.feedMediaUrl);
              if (
                feedUrl.protocol === "https:" &&
                Array.isArray(cdnHosts) &&
                cdnHosts.includes(feedUrl.hostname)
              )
                return feedUrl.href;
            } catch (_) {}
            return waitResult.inlineImageUrl;
          })();
        const extracted =
          !isVideoMode && waitResult.inlineImageUrl
            ? {
                mediaUrls: [inlineMediaUrl],
                mediaType: "image",
                mediaPosters: [],
              }
            : extractImageUrls(refUrlsToExclude, cdnHosts);
        if (extracted.mediaUrls.length > 0) {
          mediaUrls = extracted.mediaUrls;
          mediaType = extracted.mediaType;
          mediaPosters = extracted.mediaPosters || [];
          FloatingTracker.setProviderProgress?.(100);
          try {
            const elapsedSec = Math.round((Date.now() - startExtract) / 1e3);
            chrome.runtime
              .sendMessage({
                action: "grok:gen_progress",
                progress: 100,
                mode: isVideoMode ? "video" : "image",
                elapsed: elapsedSec,
              })
              .catch(() => {});
          } catch (_) {}
          break;
        }
        if (!isVideoMode && waitResult.feedMediaUrl) {
          const feedUrl = waitResult.feedMediaUrl;
          const allowed =
            Array.isArray(cdnHosts) &&
            cdnHosts.some((host) => feedUrl.includes(host));
          if (allowed) {
            mediaUrls = [feedUrl];
            mediaType = "image";
            console.log(
              "[Grok-extract] post kh\xF4ng c\xF3 img \u2192 d\xF9ng URL card feed v\u1EEBa click:",
              feedUrl,
            );
            break;
          }
        }
        const err = detectError();
        if (err) {
          FloatingTracker.hide();
          ExecutionBlocker.hide();
          sendResponse({ success: false, error: err });
          return;
        }
        await sleep(700);
      }
      if (mediaUrls.length === 0) {
        FloatingTracker.hide();
        ExecutionBlocker.hide();
        sendResponse({
          success: false,
          error: "NO_MEDIA_FOUND",
          message: "Could not extract media URL from result page",
        });
        return;
      }
      const postIdMatch = waitResult.url.match(
        /\/imagine\/post\/([a-z0-9-]+)/i,
      );
      const postId = postIdMatch ? postIdMatch[1] : null;
      const fetchedMedia = [];
      if (mediaUrls.length > 0 && payload.prefetchMedia !== false) {
        FloatingTracker.update({
          current: 1,
          total: 1,
          phase: "\u0110ang t\u1EA3i media...",
          prompt: promptPreview,
        });
        const inlineCandidates =
          mediaType === "image" && mediaUrls.length === 1
            ? [
                ...new Set([
                  ..._queryAllWithFallback("result_inline_image"),
                  ..._queryAllWithFallback("result_lightbox_inline_image"),
                ]),
              ]
            : [];
        const inlineImg =
          inlineCandidates.length === 1 ? inlineCandidates[0] : null;
        const inlineSrc = inlineImg?.getAttribute("src") || "";
        const inlineMime =
          /^data:(image\/(?:jpeg|png|webp));base64,/i.exec(inlineSrc)?.[1] ||
          null;
        const inlineBase64 =
          inlineMime &&
          inlineImg.complete &&
          inlineImg.naturalWidth > 100 &&
          inlineImg.naturalHeight > 100
            ? inlineSrc
            : null;
        const useInlineImage = (url, reason) => {
          if (!inlineBase64) return false;
          fetchedMedia.push({
            url,
            base64: inlineBase64,
            mime: inlineMime,
            size: Math.floor(
              ((inlineBase64.length - inlineBase64.indexOf(",") - 1) * 3) / 4,
            ),
            source: "post_inline_image",
          });
          console.log(
            "[Grok] CDN pre-fetch failed; using inline post image:",
            reason,
          );
          return true;
        };
        for (let i = 0; i < mediaUrls.length; i++) {
          const mUrl = mediaUrls[i];
          if (isAbortActive()) {
            fetchedMedia.push({ url: mUrl, error: "ABORTED" });
            continue;
          }
          try {
            if (mUrl === waitResult.inlineImageUrl) {
              fetchedMedia.push({
                url: mUrl,
                base64: mUrl,
                mime: /^data:([^;]+);/.exec(mUrl)[1],
                size: Math.floor(
                  ((mUrl.length - mUrl.indexOf(",") - 1) * 3) / 4,
                ),
                source: "post_inline_image",
              });
              continue;
            }
            const resp = await fetch(mUrl, { credentials: "include" });
            if (!resp.ok) {
              if (!useInlineImage(mUrl, "HTTP_" + resp.status)) {
                fetchedMedia.push({
                  url: mUrl,
                  error: "HTTP_" + resp.status,
                  status: resp.status,
                });
              }
              console.warn(
                "[Grok] pre-fetch HTTP error",
                resp.status,
                mUrl.substring(0, 100),
              );
              continue;
            }
            const blob = await resp.blob();
            const base64 = await new Promise((resolveB64, rejectB64) => {
              const reader = new FileReader();
              reader.onload = () => resolveB64(reader.result);
              reader.onerror = () => rejectB64(reader.error);
              reader.readAsDataURL(blob);
            });
            fetchedMedia.push({
              url: mUrl,
              base64,
              mime:
                blob.type ||
                (mediaType === "video" ? "video/mp4" : "image/png"),
              size: blob.size,
            });
            console.log(
              "[Grok] pre-fetch ok:",
              (blob.size / 1024).toFixed(0) + "KB",
              mUrl.substring(0, 80),
            );
          } catch (e) {
            if (!useInlineImage(mUrl, e.message || "FETCH_EXCEPTION")) {
              fetchedMedia.push({
                url: mUrl,
                error: e.message || "FETCH_EXCEPTION",
              });
            }
            console.warn(
              "[Grok] pre-fetch exception:",
              e.message,
              mUrl.substring(0, 100),
            );
          }
        }
      }
      FloatingTracker.hide();
      ExecutionBlocker.hide();
      sendResponse({
        success: true,
        mediaUrls,
        mediaPosters,
        fetchedMedia,
        mediaType,
        postId,
        url: waitResult.url,
      });
    } catch (err) {
      FloatingTracker.hide();
      ExecutionBlocker.hide();
      if (err.message && err.message.startsWith("ABORTED")) {
        const stage = err.message.replace("ABORTED:", "");
        console.log(
          "[Grok] Caught ABORT at stage:",
          stage,
          "\u2192 clicking Stop button",
        );
        await clickGrokStopButton();
        sendResponse({
          success: false,
          error: "ABORTED",
          message: "User stopped at " + stage,
        });
        return;
      }
      console.error("[Grok] handleSubmitAndWait error:", err);
      sendResponse({
        success: false,
        error: err.code || "EXCEPTION",
        message: err.message || "Unknown error",
        ...(err.details ? { details: err.details } : {}),
      });
    } finally {
      FloatingTracker.hide();
      ExecutionBlocker.hide();
    }
  }
  let activeGrokOperation = null;
  let activeGrokSettingsOperation = false;
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.action !== "string") return false;
    if (message.action === "pq:trackerUpdate") {
      const _d = message.data;
      if (!applyRichTrackerData(_d)) {
        sendResponse({ ok: true, ignored: true });
        return false;
      }
      sendResponse({ ok: true });
      return false;
    }
    if (message.action === "providerConfigUpdated") {
      ConfigSnapshotAccess.read(["toby_provider_configs"], (res) => {
        if (res.toby_provider_configs?.data) {
          _selectorConfig = res.toby_provider_configs.data;
          _selectorConfigTime = Date.now();
          const keyCount = Object.keys(
            _selectorConfig[PROVIDER]?.selectors || {},
          ).length;
          console.log(
            `[Grok] Provider config updated via SSE \u2014 reloaded ${keyCount} selectors`,
          );
        } else {
          _selectorConfig = null;
          _selectorConfigTime = 0;
          console.warn(
            "[Grok] Provider config updated via SSE \u2014 storage empty, cache cleared",
          );
        }
        sendResponse({ success: true });
      });
      return true;
    }
    if (message.action === "grok:submitAndWait") {
      if (activeGrokSettingsOperation) {
        sendResponse({ success: false, error: "GROK_OPERATION_BUSY" });
        return false;
      }
      const innerPayload =
        message.payload && typeof message.payload === "object"
          ? message.payload
          : message;
      if (activeGrokOperation) {
        if (
          innerPayload.requestId &&
          activeGrokOperation.requestId === innerPayload.requestId
        ) {
          activeGrokOperation.promise.then(sendResponse);
        } else sendResponse({ success: false, error: "GROK_OPERATION_BUSY" });
        return true;
      }
      __grokInputTimeoutMs = Number(innerPayload.inputTimeoutMs) || 1200;
      __grokMacroDelayMs = Math.round(__grokInputTimeoutMs * 0.7);
      console.log(
        "[Grok-listener] grok:submitAndWait nh\u1EADn, text len:",
        (innerPayload.text || "").length,
        "images:",
        (innerPayload.images || []).length,
        "| Timing \u2014 inputTimeout:",
        __grokInputTimeoutMs,
        "ms | macroDelay:",
        __grokMacroDelayMs,
        "ms (70%)",
      );
      const operation = { requestId: innerPayload.requestId };
      activeGrokOperation = operation;
      operation.promise = new Promise((resolve) => {
        handleSubmitAndWait(innerPayload, resolve).catch((err) =>
          resolve({ success: false, error: "EXCEPTION", message: err.message }),
        );
      });
      operation.promise.then((result) => {
        if (activeGrokOperation === operation) activeGrokOperation = null;
        sendResponse(result);
      });
      return true;
    }
    if (message.action === "grok:downloadNative") {
      (async () => {
        if (message.expectedMediaUrl) {
          const current = extractImageUrls().mediaUrls;
          const sameAsset = (candidate) => {
            try {
              const expected = new URL(message.expectedMediaUrl);
              const actual = new URL(candidate);
              return (
                expected.origin === actual.origin &&
                expected.pathname === actual.pathname
              );
            } catch (_) {
              return false;
            }
          };
          if (!current.some(sameAsset)) {
            sendResponse({ success: false, error: "POST_MEDIA_MISMATCH" });
            return;
          }
        }
        const findVisibleButton = (key) => {
          const selectors = _getDynamicSelector(key)?.selectors || [];
          for (const selector of selectors) {
            let matches;
            try {
              matches = document.querySelectorAll(selector);
            } catch (_) {
              continue;
            }
            for (const button of matches) {
              if (button.tagName !== "BUTTON" || !button.isConnected) continue;
              if (button.closest('[inert], [aria-hidden="true"]')) continue;
              const rect = button.getBoundingClientRect();
              if (!rect.width || !rect.height) continue;
              const style = window.getComputedStyle(button);
              if (style.display === "none" || style.visibility === "hidden")
                continue;
              return button;
            }
          }
          return null;
        };
        let downloadBtn = findVisibleButton("result_download_button");
        if (!downloadBtn) {
          const actionsBtn =
            findVisibleButton("result_post_actions_button") ||
            findVisibleButton("result_lightbox_post_actions_button");
          if (!actionsBtn) {
            sendResponse({
              success: false,
              error: "DOWNLOAD_BUTTON_NOT_FOUND",
            });
            return;
          }
          if (
            actionsBtn.disabled ||
            actionsBtn.getAttribute("aria-disabled") === "true"
          ) {
            sendResponse({ success: false, error: "POST_ACTIONS_UNAVAILABLE" });
            return;
          }
          simulateClick(actionsBtn);
          for (let i = 0; i < 10; i++) {
            await sleep(150);
            downloadBtn = findVisibleButton("result_download_button");
            if (downloadBtn) break;
          }
        }
        if (!downloadBtn) {
          sendResponse({ success: false, error: "DOWNLOAD_BUTTON_NOT_FOUND" });
          return;
        }
        if (
          downloadBtn.disabled ||
          downloadBtn.getAttribute("aria-disabled") === "true"
        ) {
          sendResponse({
            success: false,
            error: "DOWNLOAD_BUTTON_UNAVAILABLE",
          });
          return;
        }
        simulateClick(downloadBtn);
        console.log("[Grok] Native result Download button clicked");
        sendResponse({ success: true, method: "native_button" });
      })().catch((error) =>
        sendResponse({
          success: false,
          error: error?.message || "NATIVE_DOWNLOAD_FAILED",
        }),
      );
      return true;
    }
    if (message.action === "grok:abort") {
      if (
        Number.isFinite(message.requestedAt) &&
        __grokCallStartAt > message.requestedAt
      ) {
        sendResponse({
          success: false,
          abortReceived: true,
          providerStopped: false,
          superseded: true,
          error: "ABORT_SUPERSEDED",
        });
        return false;
      }
      __grokAbort = true;
      __grokAbortAt = Date.now();
      console.log(
        "[Grok-listener] grok:abort received \u2192 set abort flag at",
        __grokAbortAt,
      );
      FloatingTracker.hide();
      ExecutionBlocker.hide();
      if (activeGrokSettingsOperation && !activeGrokOperation) {
        sendResponse({
          success: true,
          abortReceived: true,
          providerStopped: false,
          stopClicked: false,
          superseded: false,
        });
        return false;
      }
      const callStart = __grokCallStartAt;
      (async () => {
        const stopClicked = await clickGrokStopButton();
        const superseded = __grokCallStartAt !== callStart;
        const providerStopped =
          !!_getDynamicSelector("stop_button")?.selectors?.length &&
          !superseded &&
          stopClicked &&
          !_queryWithFallback("stop_button");
        console.log("[Grok] abort confirmation", {
          stopClicked,
          providerStopped,
          superseded,
        });
        sendResponse({
          success: true,
          abortReceived: true,
          providerStopped,
          stopClicked,
          superseded,
        });
      })().catch((error) =>
        sendResponse({
          success: false,
          abortReceived: true,
          providerStopped: false,
          error: error.message,
        }),
      );
      return true;
    }
    if (message.action === "grok:applySettingsInline") {
      if (activeGrokOperation || activeGrokSettingsOperation) {
        sendResponse({ success: false, error: "GROK_OPERATION_BUSY" });
        return false;
      }
      activeGrokSettingsOperation = true;
      __grokCallStartAt = Date.now();
      __grokAbort = false;
      __grokAbortAt = 0;
      (async () => {
        try {
          const ok = await applyGrokSettings(message.settings || {});
          sendResponse({ success: !!ok });
        } catch (err) {
          sendResponse({
            success: false,
            error: err.message || "APPLY_FAILED",
          });
        } finally {
          activeGrokSettingsOperation = false;
        }
      })();
      return true;
    }
    if (message.action === "grok:checkStatus") {
      const editor = _queryWithFallback("composer");
      const loginLink = _queryWithFallback("auth_link");
      let signInButton = null;
      try {
        const patterns = _grokPatterns.notLoggedIn;
        if (patterns && patterns.length > 0) {
          const buttons = document.querySelectorAll('button[type="button"]');
          for (const btn of buttons) {
            const text = (btn.textContent || "").trim().toLowerCase();
            if (patterns.some((p) => text === p || text.includes(p))) {
              signInButton = btn;
              break;
            }
          }
        } else {
          console.warn(
            "[Grok] checkStatus: _grokPatterns.notLoggedIn empty \u2014 admin c\u1EA7n config not_logged_in_text",
          );
        }
      } catch (_) {}
      const loggedIn = !!editor && !loginLink && !signInButton;
      const cloudflareChallenge = detectCloudflareChallenge();
      if (signInButton) {
        console.log(
          "[Grok] checkStatus: Sign in/up button detected \u2192 NOT logged in",
        );
      }
      sendResponse({ loggedIn, cloudflareChallenge });
      return false;
    }
    return false;
  });
  let _lastUrl = location.href;
  const _notifyNavigate = () => {
    if (location.href !== _lastUrl) {
      _lastUrl = location.href;
      try {
        chrome.runtime
          .sendMessage({ action: "grok:navigated", url: location.href })
          .catch(() => {});
      } catch (e) {}
    }
  };
  try {
    const _origPushState = history.pushState;
    const _origReplaceState = history.replaceState;
    history.pushState = function () {
      _origPushState.apply(this, arguments);
      _notifyNavigate();
    };
    history.replaceState = function () {
      _origReplaceState.apply(this, arguments);
      _notifyNavigate();
    };
    window.addEventListener("popstate", _notifyNavigate);
  } catch (e) {}
  console.log(
    "[Grok] Content script \u0111\xE3 \u0111\u01B0\u1EE3c inject (-2)",
  );
})();
