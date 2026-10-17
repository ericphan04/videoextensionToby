(function () {
  window.__tobyflowChatGPTLoaded__ = true;
  if (window._tobyflowChatGPTInjected) return;
  window._tobyflowChatGPTInjected = true;
  let __chatgptAbort = false;
  let __chatgptAbortAt = 0;
  let __chatgptCallStartAt = 0;
  function isAbortActive() {
    return __chatgptAbort && __chatgptAbortAt >= __chatgptCallStartAt;
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function interruptibleSleep(totalMs, stage = "sleep") {
    const POLL = 200;
    const start = Date.now();
    while (Date.now() - start < totalMs) {
      if (isAbortActive()) {
        console.log(
          "[ChatGPT-abort] Interruptible sleep aborted at stage:",
          stage,
        );
        throw new Error("ABORTED:" + stage);
      }
      const remaining = totalMs - (Date.now() - start);
      await sleep(Math.min(POLL, remaining));
    }
  }
  const _i18n = {
    _lang: "vi",
    _strings: {
      vi: {
        preparing: "\u0110ang chu\u1EA9n b\u1ECB",
        waitingVerification: "Ch\u1EDD x\xE1c minh...",
        waitingResult: "\u0110ang ch\u1EDD k\u1EBFt qu\u1EA3...",
      },
      en: {
        preparing: "Preparing",
        waitingVerification: "Waiting for verification...",
        waitingResult: "Waiting for result...",
      },
      ja: {
        preparing: "\u6E96\u5099\u4E2D",
        waitingVerification: "\u8A8D\u8A3C\u5F85\u3061...",
        waitingResult:
          "\u7D50\u679C\u3092\u5F85\u3063\u3066\u3044\u307E\u3059...",
      },
      th: {
        preparing:
          "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E40\u0E15\u0E23\u0E35\u0E22\u0E21",
        waitingVerification:
          "\u0E23\u0E2D\u0E01\u0E32\u0E23\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19...",
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
    console.log(`[ChatGPT-i18n] Language loaded: ${_i18n._lang}`);
  });
  const PROVIDER = "chatgpt";
  ConfigSnapshotAccess.start(PROVIDER);
  let _selectorConfig = null;
  let _selectorConfigTime = 0;
  ConfigSnapshotAccess.onInvalidated(() => {
    _selectorConfig = null;
    _selectorConfigTime = 0;
  });
  const _selectorListLogSignatures = new Map();
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
  function _isChatGPTElementRendered(el) {
    if (!el?.isConnected) return false;
    try {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) !== 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    } catch (_) {
      return false;
    }
  }
  function _isChatGPTComposerInteractive(el) {
    if (
      !_isChatGPTElementRendered(el) ||
      el.getAttribute("contenteditable") !== "true" ||
      el.getAttribute("aria-disabled") === "true" ||
      el.closest('[aria-busy="true"]')
    )
      return false;
    const rect = el.getBoundingClientRect();
    return (
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth
    );
  }
  function _queryWithFallback(key, defaultSelectors = null, options = {}) {
    const config = _getDynamicSelector(key);
    const hardcoded = defaultSelectors || [];
    const isDynamic = config?.selectors?.length > 0;
    const selectors = isDynamic ? config.selectors : hardcoded;
    const silent = options.silent || false;
    const scope = options.scope || document;
    if (!silent)
      console.log(
        `[Selector:${PROVIDER}:${key}] ${isDynamic ? "\u{1F310} DYNAMIC" : "\u{1F4E6} HARDCODED"} | Trying ${selectors.length} selectors`,
      );
    const excludeAria = (config?.exclude_if_aria_contains || []).map((s) =>
      String(s).toLowerCase(),
    );
    const _isExcluded = (el) => {
      if (!excludeAria.length || !el) return false;
      const al = (el.getAttribute("aria-label") || "").toLowerCase();
      return excludeAria.some((x) => x && al.includes(x));
    };
    const renderedControl = [
      "composer",
      "model_switcher_button",
      "plus_button",
      "submit_button",
      "stop_button",
      "ratio_button",
    ].includes(key);
    const accepts = (el) =>
      !_isExcluded(el) &&
      (!renderedControl ||
        (key === "composer"
          ? _isChatGPTComposerInteractive(el)
          : _isChatGPTElementRendered(el)));
    for (let i = 0; i < selectors.length; i++) {
      try {
        if (excludeAria.length || renderedControl) {
          const els = scope.querySelectorAll(selectors[i]);
          for (const el of els) {
            if (el && accepts(el)) {
              if (!silent)
                console.log(
                  `[Selector:${PROVIDER}:${key}] \u2705 Match #${i + 1}: ${selectors[i]}`,
                );
              return el;
            }
          }
        } else {
          const el = scope.querySelector(selectors[i]);
          if (el) {
            if (!silent)
              console.log(
                `[Selector:${PROVIDER}:${key}] \u2705 Match #${i + 1}: ${selectors[i]}`,
              );
            return el;
          }
        }
      } catch (e) {}
    }
    if (!silent) console.log(`[Selector:${PROVIDER}:${key}] \u274C No match`);
    return null;
  }
  function _queryAllWithFallback(key, defaultSelectors = null, scope = null) {
    const config = _getDynamicSelector(key);
    const hardcoded = defaultSelectors || [];
    const selectors =
      config?.selectors?.length > 0 ? config.selectors : hardcoded;
    const root = scope || document;
    for (let i = 0; i < selectors.length; i++) {
      try {
        const els = root.querySelectorAll(selectors[i]);
        if (els.length > 0) return els;
      } catch (e) {}
    }
    return [];
  }
  function _getSelectorsForKey(key) {
    const config = _getDynamicSelector(key);
    const isDynamic = config?.selectors?.length > 0;
    const selectors = isDynamic ? config.selectors : [];
    const signature = `${isDynamic ? "dynamic" : "empty"}:${selectors.join("")}`;
    if (_selectorListLogSignatures.get(key) !== signature) {
      _selectorListLogSignatures.set(key, signature);
      console.log(
        `[Selector:${PROVIDER}:${key}] ${isDynamic ? "\u{1F310} DYNAMIC" : "\u26A0\uFE0F EMPTY"} | ${selectors.length} selectors`,
      );
    }
    return selectors;
  }
  function _getConversationTurnIdentity(turn) {
    if (!turn) return null;
    const config = _getDynamicSelector("conversation_turn");
    const attributes = Array.from(
      new Set([
        ...(Array.isArray(config?.identity_attributes)
          ? config.identity_attributes
          : []),
        ...(config?.attribute ? [config.attribute] : []),
      ]),
    );
    for (const attribute of attributes) {
      const value = turn.getAttribute?.(attribute);
      if (value) return value;
    }
    return null;
  }
  function _getConversationTurnRole(turn) {
    if (!turn) return null;
    const turnConfig = _getDynamicSelector("conversation_turn");
    const authorConfig = _getDynamicSelector("message_author");
    const attributes = Array.from(
      new Set([
        ...(Array.isArray(turnConfig?.role_attributes)
          ? turnConfig.role_attributes
          : []),
        ...(authorConfig?.attribute ? [authorConfig.attribute] : []),
      ]),
    );
    const author = _queryWithFallback("message_author", null, {
      scope: turn,
      silent: true,
    });
    for (const node of [turn, author]) {
      if (!node) continue;
      for (const attribute of attributes) {
        const value = String(node.getAttribute?.(attribute) || "")
          .trim()
          .toLowerCase();
        if (value === "user" || value.endsWith(":user")) return "user";
        if (value === "assistant" || value.endsWith(":assistant"))
          return "assistant";
      }
    }
    return null;
  }
  function _hasGeneratingIndicator(el = document) {
    const selectors = _getSelectorsForKey("generating_indicator");
    for (const sel of selectors) {
      try {
        if (el.querySelector(sel)) return true;
      } catch (e) {}
    }
    return false;
  }
  function _readImageGenerationUiProgress() {
    const config = _getDynamicSelector("image_generation_progress");
    const el = _queryWithFallback("image_generation_progress", null, {
      silent: true,
    });
    if (!el) return null;
    const attribute = config?.attribute;
    const attributeValue = attribute ? el.getAttribute(attribute) : null;
    const rawValue =
      attributeValue ??
      (config?.text_fallback === true ? el.textContent : null);
    const numericMatch = String(rawValue ?? "").match(/\d+(?:\.\d+)?/);
    const value = numericMatch ? Number(numericMatch[0]) : NaN;
    return Number.isFinite(value) && value >= 0 && value <= 100
      ? Math.round(value)
      : null;
  }
  function _queryAllConfigured(key, scope = document) {
    const selectors = _getSelectorsForKey(key);
    if (selectors.length === 0) return [];
    const combined = selectors.join(", ");
    try {
      return scope.querySelectorAll(combined);
    } catch (e) {
      const results = [];
      for (const sel of selectors) {
        try {
          results.push(...scope.querySelectorAll(sel));
        } catch (_) {}
      }
      return results;
    }
  }
  function _queryCdnImages(scope = document) {
    return _queryAllConfigured("cdn_image", scope);
  }
  function _queryGeneratedImages(scope = document) {
    return _queryAllConfigured("generated_image", scope);
  }
  function _queryResultImages(scope = document) {
    const configuredResults = Array.from(_queryGeneratedImages(scope));
    const cdnImages = Array.from(_queryCdnImages(scope));
    return Array.from(new Set([...configuredResults, ...cdnImages]));
  }
  function _isRefUploading(scope = document) {
    return !!_queryWithFallback("ref_upload_pending", null, {
      silent: true,
      scope,
    });
  }
  let __chatgptInputTimeoutMs = 1200;
  let __chatgptMacroDelayMs = Math.round(1200 * 0.7);
  function getMacroDelay() {
    return __chatgptMacroDelayMs;
  }
  function checkAbort(stage) {
    if (isAbortActive()) {
      console.log("[ChatGPT-abort] Aborted at stage:", stage);
      throw new Error("ABORTED:" + stage);
    }
  }
  async function clickChatGPTStopButton() {
    const stopKey = `${__chatgptCallStartAt}:${__chatgptAbortAt}`;
    if (clickChatGPTStopButton.lastStopKey === stopKey) return false;
    const stopBtn = _queryWithFallback("stop_button");
    if (stopBtn && !stopBtn.disabled) {
      console.log(
        "[ChatGPT-abort] Clicking ChatGPT Stop button to halt backend gen",
      );
      clickChatGPTStopButton.lastStopKey = stopKey;
      try {
        simulateClick(stopBtn);
      } catch (e) {
        return false;
      }
      await sleep(300);
      return true;
    }
    console.log("[ChatGPT-abort] Stop button not found or disabled");
    return false;
  }
  async function deleteLastAssistantMessage(turnEl = null, options = {}) {
    const expectedUrl = options.expectedConversationUrl || location.href;
    const deadline = Number.isFinite(options.cleanupDeadline)
      ? options.cleanupDeadline
      : Date.now() + 1e4;
    const callStartedAt = __chatgptCallStartAt;
    const assertCurrent = () => {
      if (Date.now() >= deadline) throw new Error("CLEANUP_DEADLINE_EXCEEDED");
      if (location.href !== expectedUrl)
        throw new Error("CONVERSATION_CHANGED");
      if (callStartedAt !== __chatgptCallStartAt || isAbortActive())
        throw new Error("CLEANUP_CANCELLED");
    };
    try {
      assertCurrent();
      console.log("[ChatGPT-delete] started", {
        budgetMs: deadline - Date.now(),
        visibility: document.visibilityState,
      });
      let headerSelectors = _getSelectorsForKey("conversation_options_button");
      let optionsBtn = null;
      let selectorRefreshAttempted = false;
      const optionsTimeout = Math.min(
        deadline,
        Date.now() + (Number(options.domWaitMs) || 3e3),
      );
      while (!optionsBtn && Date.now() < optionsTimeout) {
        assertCurrent();
        for (const sel of headerSelectors) {
          try {
            optionsBtn =
              Array.from(document.querySelectorAll(sel)).find(
                (button) =>
                  !button.disabled && _isChatGPTElementRendered(button),
              ) || null;
          } catch (_) {
            continue;
          }
          if (optionsBtn) break;
        }
        if (!optionsBtn && !selectorRefreshAttempted) {
          selectorRefreshAttempted = true;
          await _refreshChatGPTSelectorConfig();
          headerSelectors = _getSelectorsForKey("conversation_options_button");
        }
        if (!optionsBtn) await sleep(200);
      }
      if (!optionsBtn) {
        const diagnostics = {
          pagePath: new URL(location.href).pathname,
          visibility: document.visibilityState,
          triggerSelectors: headerSelectors,
          triggerMatches: headerSelectors.map((selector) => {
            try {
              const matches = Array.from(document.querySelectorAll(selector));
              return {
                total: matches.length,
                rendered: matches.filter(_isChatGPTElementRendered).length,
              };
            } catch (_) {
              return { invalid: true };
            }
          }),
        };
        console.warn(
          "[ChatGPT-delete] Kh\xF4ng t\xECm th\u1EA5y n\xFAt conversation options trong header",
          diagnostics,
        );
        return {
          success: false,
          error: "DELETE_TRIGGER_NOT_FOUND",
          reloadSafe: true,
          diagnostics,
        };
      }
      assertCurrent();
      const menuAlreadyOpen =
        optionsBtn.getAttribute("aria-expanded") === "true" ||
        optionsBtn.getAttribute("data-state") === "open";
      if (!menuAlreadyOpen) {
        console.log("[ChatGPT-delete] Clicking conversation options button...");
        simulateClick(optionsBtn);
        await sleep(500);
      } else {
        console.log(
          "[ChatGPT-delete] Conversation options already open \u2014 reuse menu",
        );
      }
      let openMenu = null;
      let deleteMenuItem = null;
      const menuTimeout = Date.now() + 3e3;
      while (Date.now() < menuTimeout) {
        assertCurrent();
        const menuKeys = ["conversation_options_menu", "open_menu"];
        for (const key of menuKeys) {
          for (const sel of _getSelectorsForKey(key)) {
            let candidates = [];
            try {
              candidates = document.querySelectorAll(sel);
            } catch (_) {
              continue;
            }
            for (const candidate of candidates) {
              const controlledMenuId =
                optionsBtn.getAttribute("aria-controls") ||
                optionsBtn.parentElement?.getAttribute("aria-controls");
              if (
                controlledMenuId &&
                candidate.getAttribute("role") === "menu" &&
                candidate.id !== controlledMenuId
              )
                continue;
              const item = _queryWithFallback("delete_chat_menu_item", null, {
                scope: candidate,
                silent: true,
              });
              if (!item) continue;
              openMenu = candidate;
              deleteMenuItem = item;
              break;
            }
            if (openMenu) break;
          }
          if (openMenu) break;
        }
        if (openMenu) break;
        await sleep(200);
      }
      if (!openMenu) {
        console.warn("[ChatGPT-delete] Menu kh\xF4ng m\u1EDF");
        return {
          success: false,
          error: "DELETE_MENU_NOT_FOUND",
          reloadSafe: true,
        };
      }
      console.log('[ChatGPT-delete] Clicking "Delete" menu item...');
      assertCurrent();
      simulateClick(deleteMenuItem);
      await sleep(500);
      const confirmTimeout = Date.now() + 3e3;
      const confirmSelectors = _getSelectorsForKey("delete_confirm_button");
      let confirmBtn = null;
      while (Date.now() < confirmTimeout) {
        assertCurrent();
        const dialogs = new Set();
        for (const sel of _getSelectorsForKey("challenge_overlay")) {
          try {
            for (const dialog of document.querySelectorAll(sel))
              dialogs.add(dialog);
          } catch (_) {}
        }
        for (const dialog of dialogs) {
          for (const sel of confirmSelectors) {
            try {
              confirmBtn = dialog.querySelector(sel);
              if (confirmBtn) break;
            } catch (_) {}
          }
          if (!confirmBtn) {
            const buttons = dialog.querySelectorAll("button");
            for (const btn of buttons) {
              const text = btn.textContent?.trim().toLowerCase();
              if (text === "delete" || text === "x\xF3a") {
                confirmBtn = btn;
                break;
              }
            }
          }
          if (confirmBtn) break;
        }
        if (confirmBtn) break;
        await sleep(200);
      }
      if (!confirmBtn) {
        console.warn(
          "[ChatGPT-delete] Kh\xF4ng t\xECm th\u1EA5y n\xFAt x\xE1c nh\u1EADn trong modal",
          {
            deleteMenuStillConnected: deleteMenuItem.isConnected,
            deleteMenuState: openMenu.getAttribute("data-state"),
            dialogSelectors: _getSelectorsForKey("challenge_overlay"),
            confirmSelectors,
          },
        );
        document.body.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
        return {
          success: false,
          error: "DELETE_CONFIRM_NOT_FOUND",
          reloadSafe: false,
        };
      }
      console.log("[ChatGPT-delete] Clicking confirm button...");
      assertCurrent();
      simulateClick(confirmBtn);
      await sleep(500);
      while (Date.now() < deadline) {
        if (location.href !== expectedUrl) {
          console.log("[ChatGPT-delete] deletion navigation observed");
          return { success: true };
        }
        if (callStartedAt !== __chatgptCallStartAt || isAbortActive()) {
          return {
            success: false,
            error: "CLEANUP_CANCELLED",
            reloadSafe: false,
          };
        }
        await sleep(200);
      }
      console.warn(
        "[ChatGPT-delete] confirmation clicked but deletion not confirmed before deadline",
      );
      return {
        success: false,
        error: "CLEANUP_NOT_CONFIRMED",
        reloadSafe: false,
      };
    } catch (err) {
      console.error("[ChatGPT-delete] L\u1ED7i khi x\xF3a conversation:", err);
      return {
        success: false,
        error: err?.message || "DELETE_FAILED",
        reloadSafe: false,
      };
    }
  }
  function simulateClick(el) {
    if (!el || !(el instanceof Element)) {
      console.warn("[ChatGPT] simulateClick: invalid element type", el);
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      console.warn(
        "[ChatGPT] simulateClick: element zero-size (hidden/detached), skip",
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
    };
    el.dispatchEvent(new PointerEvent("pointerdown", opts));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new PointerEvent("pointerup", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.dispatchEvent(new MouseEvent("click", opts));
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
          id: "tobyflow-chatgpt-tracker",
          title: "ChatGPT",
          rightOffset: 31,
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
      { action: "chatgpt:getTrackerSnapshot" },
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
    _MAX_BLOCK_TIME: 7 * 60 * 1e3,
    _injectStyles() {
      if (this._styleEl) return;
      const style = document.createElement("style");
      style.id = "tobyflow-chatgpt-blocker-styles";
      style.textContent = `
        @keyframes tobyflow-glow-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.7; }
        }
        #tobyflow-chatgpt-blocker {
          position: fixed; inset: 0; z-index: 2147483646;
          /* Ch\u1EC9 HI\u1EC2N TH\u1ECA glow, KH\xD4NG ch\u1EB7n click (ChatGPT/Grok kh\xF4ng c\u1EA7n ch\u1EB7n t\u01B0\u01A1ng t\xE1c \u2014 kh\xE1c Flow). */
          pointer-events: none; background: transparent;
        }
        #tobyflow-chatgpt-blocker::before {
          content: ''; position: absolute; inset: 0;
          border: 5px solid #cdff01;
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
      if (e.target?.closest?.("#tobyflow-chatgpt-tracker")) return;
      if (e.type === "keydown" && e.key === "Escape") {
        ExecutionBlocker._escapeCount++;
        clearTimeout(ExecutionBlocker._escapeTimer);
        ExecutionBlocker._escapeTimer = setTimeout(() => {
          ExecutionBlocker._escapeCount = 0;
        }, 2e3);
        if (ExecutionBlocker._escapeCount >= 3) {
          console.warn("[ChatGPT-ExecutionBlocker] Force hide via Escape x3");
          ExecutionBlocker._escapeCount = 0;
          ExecutionBlocker.hide();
          __chatgptAbort = true;
          __chatgptAbortAt = Date.now();
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
      el.id = "tobyflow-chatgpt-blocker";
      document.body.appendChild(el);
      this._el = el;
    },
    _startTimeout() {
      this._stopTimeout();
      this._timeoutId = setTimeout(() => {
        console.warn(
          "[ChatGPT-ExecutionBlocker] Auto-timeout, force hiding (KH\xD4NG abort \u2014 detection t\u1EF1 x\u1EED l\xFD)",
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
  async function removeExistingChatGPTRefImages() {
    const removeBtns = _queryAllWithFallback("remove_ref_image_button");
    let removedCount = 0;
    for (const btn of removeBtns) {
      const propsKey = Object.keys(btn).find((k) =>
        k.startsWith("__reactProps$"),
      );
      if (propsKey && btn[propsKey]?.onClick) {
        try {
          btn[propsKey].onClick({
            preventDefault: function () {},
            stopPropagation: function () {},
            nativeEvent: new MouseEvent("click", { bubbles: true }),
            type: "click",
            target: btn,
            currentTarget: btn,
          });
        } catch (_) {
          simulateClick(btn);
        }
      } else {
        simulateClick(btn);
      }
      removedCount++;
      await sleep(250);
    }
    if (removedCount > 0) {
      console.log(
        `[ChatGPT] removeExistingRefImages: \u0111\xE3 x\xF3a ${removedCount} ref image(s) c\u0169`,
      );
    }
    return removedCount;
  }
  function _countComposerRefImages() {
    const composer = _queryWithFallback("composer", null, { silent: true });
    const form = composer?.closest("form");
    if (!form) return 0;
    return _queryCdnImages(form).length;
  }
  function detectChatGPTChallenge() {
    if (_queryWithFallback("cloudflare_iframe", null, { silent: true }))
      return true;
    const overlays = _queryAllWithFallback("challenge_overlay", null, {
      silent: true,
    });
    const selectorConfig = _getDynamicSelector("challenge_overlay") || {};
    const textMatches = (
      !selectorConfig.text_match
        ? []
        : Array.isArray(selectorConfig.text_match)
          ? selectorConfig.text_match
          : String(selectorConfig.text_match).split("|")
    )
      .map((s) => String(s).trim())
      .filter(Boolean);
    for (const el of overlays) {
      const txt = (el.innerText || "").toLowerCase();
      const matchesServerPattern = textMatches.some((pattern) =>
        txt.includes(pattern.toLowerCase()),
      );
      const matchesCloudflare =
        txt.includes("verifying") && txt.includes("cloudflare");
      if (matchesServerPattern || matchesCloudflare) {
        const style = window.getComputedStyle(el);
        if (style.display !== "none" && style.visibility !== "hidden")
          return true;
      }
    }
    return false;
  }
  async function waitForChatGPTChallengeResolved(timeoutMs = 12e4) {
    if (!detectChatGPTChallenge()) return true;
    console.warn(
      "[ChatGPT] Challenge detected \u2014 request tab activate + ch\u1EDD user verify",
    );
    try {
      await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            action: "chatgpt:ensureActive",
            focusWindow: true,
            reason: "challenge",
          },
          () => resolve(),
        );
      });
    } catch (_) {}
    const start = Date.now();
    let lastLog = 0;
    while (Date.now() - start < timeoutMs) {
      if (isAbortActive()) {
        console.log("[ChatGPT] Challenge wait aborted by user");
        return false;
      }
      if (!detectChatGPTChallenge()) {
        console.log(
          "[ChatGPT] Challenge resolved sau",
          Math.round((Date.now() - start) / 1e3),
          "s",
        );
        await sleep(800);
        return true;
      }
      const elapsed = Date.now() - start;
      if (elapsed - lastLog >= 1e4) {
        console.log(
          "[ChatGPT] V\u1EABn ch\u1EDD challenge resolved...",
          Math.round(elapsed / 1e3),
          "s",
        );
        lastLog = elapsed;
      }
      await sleep(800);
    }
    console.error("[ChatGPT] Challenge timeout sau", timeoutMs / 1e3, "s");
    return false;
  }
  async function _waitComposerStable(timeoutMs = 6e3) {
    const REQUIRED = 5,
      STEP = 200;
    let prev = null,
      prevTop = -1,
      streak = 0;
    const dl = Date.now() + timeoutMs;
    while (Date.now() < dl) {
      const _path = window.location.pathname;
      if (_path !== "/" && _path !== "") {
        streak = 0;
        prev = null;
        prevTop = -1;
        await sleep(STEP);
        continue;
      }
      const el = _queryWithFallback("composer", null, { silent: true });
      if (el && el.isConnected && el === prev) {
        const top = Math.round(el.getBoundingClientRect().top);
        streak = Math.abs(top - prevTop) <= 2 ? streak + 1 : 0;
        prevTop = top;
      } else {
        streak = 0;
        prev = el;
        prevTop = el ? Math.round(el.getBoundingClientRect().top) : -1;
      }
      if (streak >= REQUIRED) return true;
      await sleep(STEP);
    }
    console.warn(
      "[ChatGPT-newchat] Composer KH\xD4NG \u1ED5n \u0111\u1ECBnh sau",
      timeoutMs,
      "ms (c\xF2n transition)",
    );
    return false;
  }
  let _chatgptSelectorRefreshAt = 0;
  async function _refreshChatGPTSelectorConfig() {
    const now = Date.now();
    if (now - _chatgptSelectorRefreshAt < 3e4) return false;
    _chatgptSelectorRefreshAt = now;
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: "getProviderConfigs", provider: PROVIDER, force: true },
          (result) => {
            if (chrome.runtime.lastError) {
              resolve({
                success: false,
                error: chrome.runtime.lastError.message,
              });
              return;
            }
            resolve(result || { success: false, error: "NO_RESPONSE" });
          },
        );
      });
      if (!response?.success || !response?.data) {
        console.warn(
          "[ChatGPT] Refresh selector config failed:",
          response?.error || "NO_DATA",
        );
        return false;
      }
      _selectorConfig = {
        ...(_selectorConfig || {}),
        [PROVIDER]: response.data,
      };
      _selectorConfigTime = Date.now();
      console.log("[ChatGPT] Refreshed selector config from server");
      return true;
    } catch (error) {
      console.warn(
        "[ChatGPT] Refresh selector config error:",
        error?.message || error,
      );
      return false;
    }
  }
  async function _ensureChatTabSelected() {
    try {
      let radios = _queryAllWithFallback("composer_mode_radio") || [];
      if (radios.length < 2 && (await _refreshChatGPTSelectorConfig())) {
        radios = _queryAllWithFallback("composer_mode_radio") || [];
      }
      if (radios.length < 2) return true;
      const chatRadio = radios[0];
      const isSelected = (el) =>
        el?.getAttribute("aria-checked") === "true" ||
        el?.getAttribute("aria-pressed") === "true";
      if (isSelected(chatRadio)) return true;
      console.log(
        "[ChatGPT-newchat] Tab \u0111ang \u1EDF Work \u2192 \xE9p ch\u1ECDn Chat",
      );
      simulateClick(chatRadio);
      const dl = Date.now() + 1500;
      while (Date.now() < dl) {
        const currentChat =
          (_queryAllWithFallback("composer_mode_radio") || [])[0] || chatRadio;
        if (isSelected(currentChat)) return true;
        await sleep(100);
      }
      console.warn(
        "[ChatGPT-newchat] Click Chat tab nh\u01B0ng selected state ch\u01B0a =true sau 1.5s",
      );
      return false;
    } catch (e) {
      console.warn(
        "[ChatGPT-newchat] _ensureChatTabSelected l\u1ED7i:",
        e.message,
      );
      return false;
    }
  }
  async function _readyWithChatTab(timeoutMs = 6e3) {
    const stable = await _waitComposerStable(timeoutMs);
    if (!stable) return false;
    return await _ensureChatTabSelected();
  }
  async function clickNewChatAndWaitReady(timeoutMs = 1e4) {
    const log = (...args) => console.log("[ChatGPT-newchat]", ...args);
    const isAtEmptyHome = () => {
      const path = window.location.pathname;
      if (path !== "/" && path !== "") return false;
      const _maCfg = _getDynamicSelector("message_author");
      const _maSelectors = _maCfg?.selectors || [];
      const messages =
        _maSelectors.length > 0
          ? document.querySelectorAll(_maSelectors.join(", "))
          : [];
      return messages.length === 0;
    };
    const isConvCleared = () =>
      (_queryAllWithFallback("conversation_turn") || []).length === 0;
    if (isAtEmptyHome()) {
      log(
        "\u0110\xE3 \u1EDF homepage v\u1EDBi empty conversation \u2014 skip click (tier 0), ch\u1EDD composer \u1ED5n \u0111\u1ECBnh",
      );
      return await _readyWithChatTab(6e3);
    }
    let newChatBtn = _queryWithFallback("new_chat_button");
    if (!newChatBtn) {
      const cfg = _getDynamicSelector("chat_history_home_link");
      const selectors = cfg?.selectors || [];
      if (selectors.length > 0) {
        newChatBtn = document.querySelector(selectors.join(", "));
        if (newChatBtn)
          log("Tier 2 fallback: home link via chat_history_home_link");
      }
    }
    if (!newChatBtn) {
      log('Tier 3 fallback: synthetic anchor click "/"');
      try {
        const a = document.createElement("a");
        a.href = "/";
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (e) {
        log("WARN: synthetic anchor navigate fail:", e.message);
        return false;
      }
      const dl3 = Date.now() + timeoutMs;
      while (Date.now() < dl3) {
        const path3 = window.location.pathname;
        if (path3 === "/" || path3 === "") {
          const editor3 = _queryWithFallback("composer");
          if (
            editor3 &&
            isConvCleared() &&
            editor3.getAttribute("aria-disabled") !== "true" &&
            !editor3.closest('[aria-busy="true"]')
          ) {
            log(
              "Homepage ready (tier 3) sau",
              timeoutMs - (dl3 - Date.now()),
              "ms \u2014 ch\u1EDD composer \u1ED5n \u0111\u1ECBnh",
            );
            return await _readyWithChatTab(6e3);
          }
        }
        await sleep(200);
      }
      log(
        "WARN: Tier 3 timeout \u2014 kh\xF4ng v\u1EC1 \u0111\u01B0\u1EE3c homepage",
      );
      return false;
    }
    if (isAtEmptyHome()) {
      log(
        "Tier 1/2 found button NH\u01AFNG \u0111\xE3 \u1EDF empty home \u2014 skip click, ch\u1EDD composer \u1ED5n \u0111\u1ECBnh",
      );
      return await _readyWithChatTab(6e3);
    }
    log("Click New chat button...");
    simulateClick(newChatBtn);
    const startTime = Date.now();
    let editorReady = false;
    while (Date.now() - startTime < timeoutMs) {
      const path = window.location.pathname;
      if (path !== "/" && path !== "") {
        await sleep(200);
        continue;
      }
      const editor = _queryWithFallback("composer");
      if (editor) {
        const isDisabled =
          editor.getAttribute("aria-disabled") === "true" ||
          editor.closest('[aria-busy="true"]');
        if (!isDisabled && isConvCleared()) {
          editorReady = true;
          break;
        }
      }
      await sleep(200);
    }
    if (editorReady) {
      log(
        "Editor found sau",
        Date.now() - startTime,
        "ms \u2014 ch\u1EDD composer \u1ED5n \u0111\u1ECBnh (nav nh\u1ECBp 2)",
      );
      const stable = await _readyWithChatTab(6e3);
      if (stable)
        log(
          "New chat ready (composer \u1ED5n \u0111\u1ECBnh) sau",
          Date.now() - startTime,
          "ms",
        );
      return stable;
    }
    log("WARN: Editor kh\xF4ng ready sau", timeoutMs, "ms");
    return false;
  }
  async function waitProviderReady(
    timeoutMs = 12e3,
    { requireHydrationControl = true } = {},
  ) {
    const dl = Date.now() + timeoutMs;
    let refreshAttempted = false;
    while (Date.now() < dl) {
      if (document.readyState === "complete") {
        const composer = _queryWithFallback("composer", null, { silent: true });
        const modelSwitcher = _queryWithFallback(
          "model_switcher_button",
          null,
          { silent: true },
        );
        const modeButtons = _queryAllWithFallback("composer_mode_radio") || [];
        const workModeHydrated =
          modeButtons.length >= 2 &&
          (modeButtons[1].getAttribute("aria-checked") === "true" ||
            modeButtons[1].getAttribute("aria-pressed") === "true");
        const composerForm = composer?.closest("form");
        const addControl = composerForm
          ? _queryWithFallback("plus_button", null, {
              silent: true,
              scope: composerForm,
            })
          : null;
        if (
          composer &&
          !modelSwitcher &&
          !workModeHydrated &&
          !addControl &&
          !refreshAttempted
        ) {
          refreshAttempted = true;
          await _refreshChatGPTSelectorConfig();
          continue;
        }
        const hydrationControl =
          modelSwitcher ||
          (workModeHydrated ? modeButtons[1] : null) ||
          addControl;
        const requiredControl = requireHydrationControl
          ? hydrationControl
          : composer;
        if (
          composer &&
          requiredControl &&
          composer.getAttribute("aria-disabled") !== "true" &&
          requiredControl.getAttribute("aria-disabled") !== "true" &&
          requiredControl.disabled !== true &&
          !requiredControl.closest('[aria-busy="true"]') &&
          !composer.closest('[aria-busy="true"]')
        ) {
          await sleep(250);
          const settledComposer = _queryWithFallback("composer", null, {
            silent: true,
          });
          const settledSwitcher = _queryWithFallback(
            "model_switcher_button",
            null,
            { silent: true },
          );
          const settledModes =
            _queryAllWithFallback("composer_mode_radio") || [];
          const settledForm = settledComposer?.closest("form");
          const settledAdd = settledForm
            ? _queryWithFallback("plus_button", null, {
                silent: true,
                scope: settledForm,
              })
            : null;
          const settledHydrationControl =
            settledSwitcher ||
            (workModeHydrated && settledModes.length >= 2
              ? settledModes[1]
              : null) ||
            settledAdd;
          const settledRequiredControl = requireHydrationControl
            ? settledHydrationControl
            : settledComposer;
          if (
            settledComposer === composer &&
            settledRequiredControl === requiredControl &&
            composer.isConnected &&
            requiredControl.isConnected &&
            _isChatGPTComposerInteractive(composer) &&
            requiredControl.getAttribute("aria-disabled") !== "true" &&
            requiredControl.disabled !== true &&
            !requiredControl.closest('[aria-busy="true"]')
          )
            return true;
        }
      }
      await sleep(250);
    }
    return false;
  }
  async function deactivateImageModeIfActive() {
    const active =
      _queryWithFallback("image_mode_pill") ||
      _queryWithFallback("ratio_button");
    if (!active) return false;
    console.log(
      "[ChatGPT] Image mode \u0111ang active \u2014 deactivate tr\u01B0\u1EDBc khi submit text",
    );
    const clickEl = (el) => {
      if (!el) return;
      try {
        simulateClick(el);
      } catch (_) {}
      const propsKey = Object.keys(el).find((k) =>
        k.startsWith("__reactProps$"),
      );
      const props = propsKey ? el[propsKey] : null;
      try {
        if (props && typeof props.onSelect === "function") {
          props.onSelect({ preventDefault() {}, stopPropagation() {} });
        } else if (props && typeof props.onClick === "function") {
          props.onClick({
            preventDefault() {},
            stopPropagation() {},
            nativeEvent: new MouseEvent("click"),
            type: "click",
            target: el,
            currentTarget: el,
          });
        }
      } catch (_) {}
    };
    try {
      const openMenu = _queryWithFallback("open_menu");
      if (openMenu) {
        document.activeElement?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
        await sleep(80);
      }
    } catch (_) {}
    const plusBtn = _queryWithFallback("plus_button");
    if (!plusBtn) {
      console.warn(
        "[ChatGPT] deactivateImageMode: composer plus button kh\xF4ng t\xECm th\u1EA5y",
      );
      return false;
    }
    clickEl(plusBtn);
    let menu = null;
    for (let i = 0; i < 6; i++) {
      await sleep(80);
      menu = _queryWithFallback("open_menu", null, { silent: true });
      if (menu) break;
    }
    if (!menu) {
      console.warn("[ChatGPT] deactivateImageMode: menu kh\xF4ng render");
      return false;
    }
    const createImgPatterns = await _getCreateImagePatterns();
    const items = _queryAllWithFallback("menu_items", null, menu);
    for (const item of items) {
      const text = (item.innerText || "").trim().toLowerCase();
      if (_matchesCreateImage(text, createImgPatterns)) {
        const checked =
          item.getAttribute("aria-checked") === "true" ||
          item.getAttribute("data-state") === "checked";
        if (checked) {
          clickEl(item);
          console.log(
            "[ChatGPT] deactivateImageMode: \u0111\xE3 click toggle off",
          );
        }
        break;
      }
    }
    await sleep(150);
    try {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    } catch (_) {}
    await sleep(150);
    const stillActive =
      !!_queryWithFallback("image_mode_pill") ||
      !!_queryWithFallback("ratio_button");
    return !stillActive;
  }
  async function _getChatGPTApiConfig(key) {
    try {
      const result = await new Promise((r) =>
        ConfigSnapshotAccess.read(["toby_provider_api_configs"], r),
      );
      return (
        result?.toby_provider_api_configs?.data?.chatgpt?.configs?.[key] ?? null
      );
    } catch (_) {
      return null;
    }
  }
  async function _getCreateImagePatterns() {
    const cfg = await _getChatGPTApiConfig("ui_text_patterns");
    const raw = cfg?.create_image_menu_text || "create image|create an image";
    return raw
      .split("|")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
  function _matchesCreateImage(text, patterns) {
    const t = (text || "").trim().toLowerCase();
    return (patterns || []).some((p) => t === p || t.startsWith(p));
  }
  async function selectChatGPTModel(modelValue) {
    if (!modelValue) return false;
    const labelCfg = await _getChatGPTApiConfig("chatgpt_model_labels");
    const rawLabels = labelCfg?.[modelValue] ?? modelValue;
    const targetTexts = String(rawLabels)
      .split("|")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (targetTexts.length === 0) return false;
    const clickEl = (el) => {
      if (!el) return;
      try {
        simulateClick(el);
      } catch (_) {}
      const propsKey = Object.keys(el).find((k) =>
        k.startsWith("__reactProps$"),
      );
      const props = propsKey ? el[propsKey] : null;
      try {
        if (props && typeof props.onSelect === "function") {
          props.onSelect({ preventDefault() {}, stopPropagation() {} });
        } else if (props && typeof props.onClick === "function") {
          props.onClick({
            preventDefault() {},
            stopPropagation() {},
            nativeEvent: new MouseEvent("click"),
            type: "click",
            target: el,
            currentTarget: el,
          });
        }
      } catch (_) {}
    };
    const closeMenu = () => {
      try {
        document.activeElement?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
      } catch (_) {}
    };
    const switcherBtn = _queryWithFallback("model_switcher_button", null, {
      silent: true,
    });
    if (!switcherBtn) {
      console.warn(
        "[ChatGPT] selectChatGPTModel: model_switcher_button kh\xF4ng th\u1EA5y",
      );
      return false;
    }
    const curText = (switcherBtn.innerText || switcherBtn.textContent || "")
      .trim()
      .toLowerCase();
    if (targetTexts.some((t) => curText === t || curText.includes(t))) {
      console.log(
        `[ChatGPT] selectChatGPTModel: "${modelValue}" \u0111\xE3 active`,
      );
      return true;
    }
    if (switcherBtn.getAttribute("aria-haspopup") !== "menu") {
      console.warn(
        "[ChatGPT] selectChatGPTModel: composer pill hi\u1EC7n t\u1EA1i kh\xF4ng c\xF4ng b\u1ED1 menu model \u2014 skip interaction",
      );
      return false;
    }
    clickEl(switcherBtn);
    const sliderValues = await _getChatGPTApiConfig(
      "chatgpt_model_slider_values",
    );
    const configuredValue = sliderValues?.[modelValue];
    if (configuredValue !== void 0 && configuredValue !== null) {
      let slider = null;
      for (let i = 0; i < 10; i++) {
        await sleep(100);
        slider = _queryWithFallback("model_effort_slider", null, {
          silent: true,
        });
        if (slider) break;
      }
      if (slider) {
        const min = Number(slider.getAttribute("aria-valuemin"));
        const max = Number(slider.getAttribute("aria-valuemax"));
        const target = Number(configuredValue);
        if (
          Number.isFinite(min) &&
          Number.isFinite(max) &&
          Number.isFinite(target) &&
          target >= min &&
          target <= max
        ) {
          const control =
            _queryWithFallback("model_effort_slider_control", null, {
              silent: true,
            }) || slider;
          try {
            control.focus?.();
            for (let step = min; step <= max; step++) {
              control.dispatchEvent(
                new KeyboardEvent("keydown", {
                  key: "ArrowLeft",
                  code: "ArrowLeft",
                  bubbles: true,
                }),
              );
              control.dispatchEvent(
                new KeyboardEvent("keyup", {
                  key: "ArrowLeft",
                  code: "ArrowLeft",
                  bubbles: true,
                }),
              );
              await sleep(40);
            }
            for (let step = min; step < target; step++) {
              control.dispatchEvent(
                new KeyboardEvent("keydown", {
                  key: "ArrowRight",
                  code: "ArrowRight",
                  bubbles: true,
                }),
              );
              control.dispatchEvent(
                new KeyboardEvent("keyup", {
                  key: "ArrowRight",
                  code: "ArrowRight",
                  bubbles: true,
                }),
              );
              await sleep(40);
            }
            await sleep(250);
            const selected = Number(slider.getAttribute("aria-valuenow"));
            if (selected === target) {
              console.log(
                `[ChatGPT] selectChatGPTModel: slider ${selected}/${max} cho "${modelValue}"`,
              );
              closeMenu();
              return true;
            }
          } catch (err) {
            console.warn(
              "[ChatGPT] selectChatGPTModel: slider interaction failed:",
              err?.message || err,
            );
          }
        }
      }
    }
    let items = [];
    for (let i = 0; i < 10; i++) {
      await sleep(100);
      items = Array.from(_queryAllWithFallback("mode_menu_item"));
      if (items.length > 0) break;
    }
    if (items.length === 0) {
      console.warn("[ChatGPT] selectChatGPTModel: menu model kh\xF4ng render");
      closeMenu();
      return false;
    }
    for (const item of items) {
      const txt = (item.innerText || item.textContent || "")
        .trim()
        .toLowerCase();
      if (targetTexts.some((t) => txt === t || txt.includes(t))) {
        clickEl(item);
        console.log(
          `[ChatGPT] selectChatGPTModel: clicked "${(item.innerText || "").trim()}" cho "${modelValue}"`,
        );
        await sleep(200);
        closeMenu();
        return true;
      }
    }
    console.warn(
      `[ChatGPT] selectChatGPTModel: KH\xD4NG match "${modelValue}". Items: [${items.map((i) => (i.innerText || "").trim()).join(" | ")}]`,
    );
    closeMenu();
    return false;
  }
  async function dismissChatGPTModelPickerBestEffort() {
    const targets = [document.activeElement, document.body, document].filter(
      Boolean,
    );
    for (const target of targets) {
      try {
        target.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Escape",
            code: "Escape",
            bubbles: true,
          }),
        );
        target.dispatchEvent(
          new KeyboardEvent("keyup", {
            key: "Escape",
            code: "Escape",
            bubbles: true,
          }),
        );
      } catch (_) {}
    }
    await sleep(80);
    try {
      const switcher = _queryWithFallback("model_switcher_button", null, {
        silent: true,
      });
      if (
        switcher?.getAttribute("aria-haspopup") === "menu" &&
        switcher.getAttribute("aria-expanded") === "true"
      ) {
        simulateClick(switcher);
        await sleep(80);
      }
    } catch (_) {}
  }
  async function selectChatGPTModelBestEffort(modelValue, scope = "ChatGPT") {
    if (!modelValue) return true;
    let selected = false;
    try {
      selected = await selectChatGPTModel(modelValue);
      if (!selected) {
        console.warn(
          `[${scope}] MODEL_SELECTION_SKIPPED: kh\xF4ng th\u1EC3 ch\u1ECDn "${modelValue}" tr\xEAn DOM/account hi\u1EC7n t\u1EA1i \u2014 ti\u1EBFp t\u1EE5c v\u1EDBi model \u0111ang active`,
        );
      }
      return selected;
    } catch (error) {
      console.warn(
        `[${scope}] MODEL_SELECTION_SKIPPED: l\u1ED7i khi ch\u1ECDn "${modelValue}" (${error?.message || error}) \u2014 ti\u1EBFp t\u1EE5c v\u1EDBi model \u0111ang active`,
      );
      return false;
    } finally {
      if (!selected) await dismissChatGPTModelPickerBestEffort();
    }
  }
  function ratioToPromptSuffix(ratio) {
    const map = {
      story: "9:16 (portrait)",
      "9:16": "9:16 (portrait)",
      portrait: "3:4 (portrait)",
      "3:4": "3:4 (portrait)",
      square: "1:1 (square)",
      "1:1": "1:1 (square)",
      landscape: "4:3 (landscape)",
      "4:3": "4:3 (landscape)",
      widescreen: "16:9 (widescreen)",
      "16:9": "16:9 (widescreen)",
    };
    const label = map[ratio];
    return label
      ? `

Generate the image in ${label} aspect ratio.`
      : "";
  }
  async function activateImageMode(ratio = "1:1") {
    const ratioBtn = _queryWithFallback("ratio_button");
    const modeActive = !!_queryWithFallback("image_mode_pill") || !!ratioBtn;
    let modeToggled = modeActive;
    const clickEl = (el) => {
      if (!el) return;
      try {
        simulateClick(el);
      } catch (_) {}
      const propsKey = Object.keys(el).find((k) =>
        k.startsWith("__reactProps$"),
      );
      const props = propsKey ? el[propsKey] : null;
      try {
        if (props && typeof props.onSelect === "function") {
          props.onSelect({ preventDefault() {}, stopPropagation() {} });
        } else if (props && typeof props.onClick === "function") {
          props.onClick({
            preventDefault() {},
            stopPropagation() {},
            nativeEvent: new MouseEvent("click"),
            type: "click",
            target: el,
            currentTarget: el,
          });
        }
      } catch (_) {}
    };
    const _activateViaMention = async () => {
      if (!_getDynamicSelector("mention_menu")?.selectors?.length) return false;
      const editor = _queryWithFallback("composer", null, { silent: true });
      if (!editor) return false;
      try {
        editor.focus();
        await sleep(120);
        document.execCommand("insertText", false, "@");
        let menuEl = null;
        for (let i = 0; i < 15; i++) {
          await sleep(150);
          menuEl = _queryWithFallback("mention_menu", null, { silent: true });
          if (menuEl) break;
        }
        if (!menuEl) throw new Error("mention menu kh\xF4ng m\u1EDF");
        const patterns = await _getCreateImagePatterns();
        const items = _queryAllWithFallback("menu_items", null, menuEl);
        let target = _queryWithFallback("create_image_menu_item", null, {
          scope: menuEl,
          silent: true,
        });
        if (!target) {
          for (const it of items) {
            if (
              _matchesCreateImage(
                (it.innerText || "").trim().toLowerCase(),
                patterns,
              )
            ) {
              target = it;
              break;
            }
          }
        }
        if (!target) {
          const visibleItems = Array.from(items)
            .slice(0, 12)
            .map((it) =>
              (it.innerText || it.textContent || "")
                .trim()
                .replace(/\s+/g, " ")
                .slice(0, 100),
            );
          console.warn(
            "[ChatGPT] Create image mention item miss \u2014 patterns:",
            patterns,
            "items:",
            visibleItems,
          );
          throw new Error(
            "kh\xF4ng th\u1EA5y item Create image trong mention menu",
          );
        }
        clickEl(target);
        for (let i = 0; i < 15; i++) {
          await sleep(150);
          if (_queryWithFallback("image_mode_pill", null, { silent: true })) {
            console.log(
              '[ChatGPT] activateImageMode: Tier 1 mention "@" OK \u2014 pill active',
            );
            return true;
          }
        }
        throw new Error("pill kh\xF4ng xu\u1EA5t hi\u1EC7n sau khi ch\u1ECDn");
      } catch (e) {
        console.info(
          "[ChatGPT] activateImageMode Tier 1 mention fail:",
          e.message,
          '\u2014 d\u1ECDn "@" + fallback plus menu',
        );
        try {
          document.activeElement?.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
          );
          await sleep(100);
          if (
            !_queryWithFallback("image_mode_pill", null, {
              silent: true,
              scope: editor,
            }) &&
            (editor.textContent || "").trim().length > 0
          ) {
            editor.focus();
            document.execCommand("selectAll", false, null);
            await sleep(50);
            document.execCommand("delete", false, null);
            await sleep(100);
          }
        } catch (_) {}
        return false;
      }
    };
    if (!modeActive) {
      console.log(
        "[ChatGPT] Image mode ch\u01B0a active \u2014 \u0111ang activate...",
      );
      if (await _activateViaMention()) {
        modeToggled = true;
      } else {
        try {
          const openMenu = _queryWithFallback("open_menu");
          if (openMenu) {
            document.activeElement?.dispatchEvent(
              new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
            );
            await sleep(80);
          }
        } catch (_) {}
        let plusBtn = _queryWithFallback("plus_button");
        if (!plusBtn && (await _refreshChatGPTSelectorConfig())) {
          plusBtn = _queryWithFallback("plus_button");
        }
        if (!plusBtn) {
          console.warn(
            "[ChatGPT] activateImageMode: composer plus button kh\xF4ng t\xECm th\u1EA5y",
          );
          return false;
        }
        clickEl(plusBtn);
        let menu = null;
        let configuredCreateImageItem = null;
        const isVisibleMenuItem = (item) => {
          if (!item?.isConnected) return false;
          const rect = item.getBoundingClientRect();
          const style = getComputedStyle(item);
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden"
          );
        };
        for (let i = 0; i < 15; i++) {
          await sleep(80);
          configuredCreateImageItem =
            Array.from(
              _queryAllWithFallback("create_image_menu_item", null, document),
            ).find(
              (item) =>
                isVisibleMenuItem(item) &&
                !item.closest('nav, aside, [class*="sidebar"], a[href*="/c/"]'),
            ) || null;
          if (configuredCreateImageItem) break;
          menu = _queryWithFallback("open_menu", null, { silent: true });
          if (menu) {
            const visibleItems = Array.from(
              _queryAllWithFallback("menu_items", null, menu),
            ).filter(isVisibleMenuItem);
            if (visibleItems.length > 0) break;
          }
        }
        if (!menu) {
          console.warn(
            '[ChatGPT] activateImageMode: open_menu kh\xF4ng match \u2014 fallback qu\xE9t to\xE0n document t\xECm "Create image"',
          );
          menu = document;
        }
        const createImgPatterns = await _getCreateImagePatterns();
        let items = Array.from(
          _queryAllWithFallback("menu_items", null, menu),
        ).filter(isVisibleMenuItem);
        if (!configuredCreateImageItem) {
          const globalItems = Array.from(
            _queryAllWithFallback("menu_items", null, document),
          ).filter(isVisibleMenuItem);
          items = Array.from(new Set([...items, ...globalItems]));
        }
        let found = false;
        const candidateItems = configuredCreateImageItem
          ? [configuredCreateImageItem]
          : items;
        for (const item of candidateItems) {
          if (item.closest('nav, aside, [class*="sidebar"], a[href*="/c/"]'))
            continue;
          const text = (item.innerText || "").trim().toLowerCase();
          if (
            item === configuredCreateImageItem ||
            _matchesCreateImage(text, createImgPatterns)
          ) {
            const checked =
              item.getAttribute("aria-checked") === "true" ||
              item.getAttribute("data-state") === "checked";
            if (!checked) {
              clickEl(item);
              console.log(
                '[ChatGPT] activateImageMode: \u0111\xE3 click toggle on "Create image"',
              );
            }
            found = true;
            modeToggled = true;
            break;
          }
        }
        if (!found) {
          const visibleItems = Array.from(items)
            .slice(0, 12)
            .map((it) =>
              (it.innerText || it.textContent || "")
                .trim()
                .replace(/\s+/g, " ")
                .slice(0, 100),
            );
          console.warn(
            "[ChatGPT] Create image plus-menu miss \u2014 patterns:",
            createImgPatterns,
            "items:",
            visibleItems,
          );
          console.warn(
            '[ChatGPT] activateImageMode: kh\xF4ng t\xECm th\u1EA5y "Create image" item',
          );
          try {
            document.activeElement?.dispatchEvent(
              new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
            );
          } catch (_) {}
          return false;
        }
        let newRatioBtn = null;
        for (let i = 0; i < 8; i++) {
          await sleep(100);
          newRatioBtn = _queryWithFallback("ratio_button", null, {
            silent: true,
          });
          if (
            newRatioBtn ||
            _queryWithFallback("image_mode_pill", null, { silent: true })
          )
            break;
        }
        if (!newRatioBtn) {
          console.log(
            "[ChatGPT] activateImageMode: kh\xF4ng c\xF3 ratio button (UI m\u1EDBi) \u2014 b\u1ECF qua ch\u1ECDn ratio, ratio \u0111i qua prompt",
          );
        }
        await sleep(getMacroDelay());
      }
    }
    let ratioSelected = false;
    const _ratioBtnNow = _queryWithFallback("ratio_button", null, {
      silent: true,
    });
    if (ratio && _ratioBtnNow) {
      let newRatioBtn = null;
      for (let i = 0; i < 5; i++) {
        newRatioBtn = _queryWithFallback("ratio_button", null, {
          silent: i > 0,
        });
        if (newRatioBtn) break;
        await sleep(100);
      }
      if (newRatioBtn) {
        const RATIO_ARIA_MAP = {
          story: "Story 9:16",
          portrait: "Portrait 3:4",
          square: "Square 1:1",
          landscape: "Landscape 4:3",
          widescreen: "Widescreen 16:9",
          "9:16": "Story 9:16",
          "3:4": "Portrait 3:4",
          "1:1": "Square 1:1",
          "4:3": "Landscape 4:3",
          "16:9": "Widescreen 16:9",
        };
        const targetAriaLabel = RATIO_ARIA_MAP[ratio] || null;
        await sleep(300);
        clickEl(newRatioBtn);
        console.log(
          "[ChatGPT] activateImageMode: \u0111\xE3 click ratio button, waiting for dropdown...",
        );
        let ratioMenu = null;
        for (let i = 0; i < 10; i++) {
          await sleep(120);
          ratioMenu = _queryWithFallback("open_menu", null, { silent: true });
          if (!ratioMenu) {
            ratioMenu = document.querySelector('[role="listbox"]');
          }
          if (ratioMenu) break;
        }
        let ratioItems = [];
        if (ratioMenu) {
          console.log(
            "[ChatGPT] activateImageMode: dropdown found, tagName:",
            ratioMenu.tagName,
            "role:",
            ratioMenu.getAttribute("role"),
          );
          ratioItems = _queryAllWithFallback("menu_items", null, ratioMenu);
          if (ratioItems.length === 0) {
            ratioItems = ratioMenu.querySelectorAll(
              '[role="option"], [role="menuitemradio"], [role="menuitem"]',
            );
          }
          console.log(
            "[ChatGPT] activateImageMode: found",
            ratioItems.length,
            "items in dropdown",
          );
          if (ratioItems.length > 0) {
            const labels = Array.from(ratioItems)
              .map(
                (it) =>
                  it.getAttribute("aria-label") ||
                  it.innerText?.substring(0, 30),
              )
              .join(", ");
            console.log("[ChatGPT] activateImageMode: item labels:", labels);
          }
        } else {
          console.log(
            "[ChatGPT] activateImageMode: dropdown NOT found after retries",
          );
        }
        if (ratioItems.length === 0 && targetAriaLabel) {
          const directMatch = document.querySelector(
            `[aria-label="${targetAriaLabel}"]`,
          );
          if (directMatch) {
            ratioItems = [directMatch];
            console.log(
              "[ChatGPT] activateImageMode: found ratio via direct aria-label query",
            );
          } else {
            console.log(
              "[ChatGPT] activateImageMode: direct aria-label query failed for:",
              targetAriaLabel,
            );
          }
        }
        let found = false;
        for (const item of ratioItems) {
          if (
            targetAriaLabel &&
            item.getAttribute("aria-label") === targetAriaLabel
          ) {
            clickEl(item);
            console.log(
              "[ChatGPT] activateImageMode: \u0111\xE3 ch\u1ECDn ratio via aria-label",
              ratio,
              targetAriaLabel,
            );
            found = true;
            break;
          }
        }
        if (!found) {
          const ratioLower = ratio.toLowerCase();
          for (const item of ratioItems) {
            const text = (item.innerText || "").trim().toLowerCase();
            if (
              text === ratioLower ||
              text.includes(ratioLower) ||
              text.includes(ratio)
            ) {
              clickEl(item);
              console.log(
                "[ChatGPT] activateImageMode: \u0111\xE3 ch\u1ECDn ratio via text fallback",
                ratio,
              );
              found = true;
              break;
            }
          }
        }
        await sleep(150);
        try {
          document.activeElement?.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
          );
        } catch (_) {}
        ratioSelected = found;
      }
    }
    await sleep(200);
    const verified =
      !!_queryWithFallback("image_mode_pill") ||
      !!_queryWithFallback("ratio_button");
    console.log(
      "[ChatGPT] activateImageMode: modeToggled =",
      modeToggled,
      "verified =",
      verified,
      "ratioSelected =",
      ratioSelected,
    );
    console.log(
      "[IMG_VERIFY] activateImageMode DONE: pill=" +
        !!_queryWithFallback("image_mode_pill", null, { silent: true }) +
        " | ratioBtn=" +
        !!_queryWithFallback("ratio_button", null, { silent: true }) +
        " | result=" +
        (modeToggled || ratioSelected || verified) +
        ' | ratio="' +
        ratio +
        '"',
    );
    return modeToggled || ratioSelected || verified;
  }
  function _promptTextAudit(text) {
    const value = String(text || "");
    return {
      chars: value.length,
      delimiters: Object.fromEntries(
        ["[", "]", "<", ">"].map((symbol) => [
          symbol,
          value.split(symbol).length - 1,
        ]),
      ),
    };
  }
  async function getEnhancePrefix() {
    try {
      const result = await new Promise((resolve) => {
        ConfigSnapshotAccess.read(
          ["toby_provider_api_configs", "af_locale"],
          (r) => resolve(r),
        );
      });
      const locale = result?.af_locale || "en";
      const prefixMap =
        result?.toby_provider_api_configs?.data?.chatgpt?.configs
          ?.ai_agent_prefix;
      if (!prefixMap || typeof prefixMap !== "object") {
        console.warn(
          "[AI Agent] ai_agent_prefix config missing for chatgpt \u2014 skip prefix wrap (raw prompt)",
        );
        return "";
      }
      return prefixMap[locale] || prefixMap.en || "";
    } catch (e) {
      console.warn(
        "[AI Agent] getEnhancePrefix error:",
        e.message,
        "\u2014 skip prefix wrap",
      );
      return "";
    }
  }
  let _chatgptRefUploadFailure = null;
  function _findChatGPTRefFileInput() {
    const form = _queryWithFallback("composer", null, {
      silent: true,
    })?.closest("form");
    if (!form) return null;
    const local = _queryWithFallback("file_input", null, {
      silent: true,
      scope: form,
    });
    if (local && !local.disabled) return local;
    for (const selector of _getSelectorsForKey("file_input")) {
      try {
        for (const input of document.querySelectorAll(selector)) {
          if (!input.disabled && !input.closest("form")) return input;
        }
      } catch (_) {}
    }
    return null;
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
  async function injectRefImages(images) {
    reportGenLocalRefUpload(images, true);
    try {
      _chatgptRefUploadFailure = null;
      if (!images || images.length === 0) return true;
      const fail = (reason, details = {}) => {
        _chatgptRefUploadFailure = reason;
        console.warn("[ChatGPT-ref-upload]", {
          stage: reason,
          requested: images.length,
          ...details,
        });
        return false;
      };
      await removeExistingChatGPTRefImages();
      await sleep(300);
      const files = images.map((img) => {
        const binary = atob(img.base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new File([bytes], img.name || "image.png", {
          type: img.type || "image/png",
        });
      });
      let fileInput = null;
      for (let retry = 0; retry < 15; retry++) {
        fileInput = _findChatGPTRefFileInput();
        if (fileInput) break;
        await sleep(400);
      }
      if (!fileInput) {
        console.warn(
          "[ChatGPT] #upload-photos kh\xF4ng t\xECm th\u1EA5y, fallback click plus button",
        );
        const plusBtn = _queryWithFallback("plus_button");
        if (plusBtn) {
          simulateClick(plusBtn);
          await sleep(300);
          fileInput = _findChatGPTRefFileInput();
          try {
            document.activeElement?.dispatchEvent(
              new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
            );
          } catch (_) {}
          await sleep(100);
        }
      }
      if (!fileInput) {
        console.error(
          "[ChatGPT] Kh\xF4ng t\xECm th\u1EA5y input file \u0111\u1EC3 upload ref image",
        );
        return fail("FILE_INPUT_NOT_FOUND");
      }
      const dt = new DataTransfer();
      const _composerEl = _queryWithFallback("composer");
      let _scope = _composerEl?.closest("form");
      if (!_scope) return fail("COMPOSER_FORM_NOT_FOUND");
      const _beforeImgs = _scope.querySelectorAll("img").length;
      const attachmentCount = () => {
        _scope = _queryWithFallback("composer", null, {
          silent: true,
        })?.closest("form");
        return Math.max(
          0,
          (_scope?.querySelectorAll("img").length || 0) - _beforeImgs,
        );
      };
      console.log("[ChatGPT-ref-upload]", {
        stage: "dispatch",
        requested: files.length,
        inputId: fileInput.id,
        inputInComposer: _scope.contains(fileInput),
        before: _beforeImgs,
      });
      files.forEach((f) => dt.items.add(f));
      try {
        fileInput.value = "";
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (err) {
        return fail("FILE_DISPATCH_FAILED", {
          errorName: err?.name || "Error",
        });
      }
      let _attached = false;
      for (let i = 0; i < 30; i++) {
        await interruptibleSleep(300, "await-upload-preview");
        if (__chatgptAbort) break;
        if (attachmentCount() > 0) {
          _attached = true;
          break;
        }
      }
      await sleep(_attached ? 400 : 600);
      for (let i = 0; i < 50; i++) {
        if (__chatgptAbort) break;
        attachmentCount();
        if (!_scope || !_isRefUploading(_scope)) break;
        await interruptibleSleep(300, "await-ref-upload-complete");
      }
      if (__chatgptAbort) return fail("UPLOAD_ABORTED");
      const attachedCount = attachmentCount();
      if (!attachedCount) {
        console.warn(
          `[ChatGPT] Ref upload attached 0/${files.length} images; aborting submit`,
        );
        return fail("UPLOAD_PREVIEW_NOT_FOUND", {
          composerConnected: !!_scope?.isConnected,
        });
      }
      if (_scope && _isRefUploading(_scope))
        return fail("UPLOAD_STILL_PENDING", { attached: attachedCount });
      if (attachedCount < files.length) {
        console.warn(
          `[ChatGPT] Ref upload attached ${attachedCount}/${files.length} images; continuing with attached refs`,
        );
      }
      await sleep(getMacroDelay());
      console.log("[ChatGPT-ref-upload]", {
        stage: "complete",
        requested: files.length,
        attached: attachedCount,
      });
      return true;
    } finally {
      reportGenLocalRefUpload(images, false);
    }
  }
  let _scrollDuringGen = true;
  function _scrollChatToBottom() {
    if (!_scrollDuringGen) return;
    try {
      const turns = Array.from(_queryAllConfigured("conversation_turn")).filter(
        _isChatGPTElementRendered,
      );
      const last = turns.at(-1);
      if (!last) return;
      for (
        let parent = last.parentElement;
        parent && parent !== document.body;
        parent = parent.parentElement
      ) {
        const style = getComputedStyle(parent);
        if (
          (style.overflowY === "auto" || style.overflowY === "scroll") &&
          parent.scrollHeight > parent.clientHeight
        ) {
          parent.scrollTop =
            style.flexDirection === "column-reverse" ? 0 : parent.scrollHeight;
          return;
        }
      }
      const pageScroller =
        document.scrollingElement || document.documentElement;
      if (
        pageScroller?.contains(last) &&
        pageScroller.scrollHeight > pageScroller.clientHeight
      ) {
        const style = getComputedStyle(pageScroller);
        pageScroller.scrollTop =
          style.flexDirection === "column-reverse"
            ? 0
            : pageScroller.scrollHeight;
      }
    } catch (_) {}
  }
  async function injectTextAndSubmit(text, baseline) {
    const retryConversationPath = baseline?.retryConversationPath || null;
    function checkSubmitAbort(stage) {
      checkAbort(stage);
      if (
        retryConversationPath &&
        retryConversationPath !==
          `${window.location.origin}${window.location.pathname}`
      )
        throw Object.assign(new Error("CONVERSATION_CHANGED"), {
          code: "CONVERSATION_CHANGED",
          noRetry: true,
        });
    }
    checkSubmitAbort("before-inject");
    const log = (...args) => console.log("[ChatGPT-submit]", ...args);
    let editor = null;
    const editorTimeout = Date.now() + 1e4;
    while (Date.now() < editorTimeout) {
      checkSubmitAbort("wait-inject-editor");
      editor = _queryWithFallback("composer", null, { silent: true });
      if (editor) break;
      await sleep(200);
    }
    if (!editor) {
      log("FAIL: EDITOR_NOT_FOUND");
      throw new Error("EDITOR_NOT_FOUND");
    }
    log("Step 1: Editor found", editor.id || editor.className);
    editor.focus();
    await sleep(150);
    const clearForce =
      document.documentElement.dataset.tobyChatgptClearForce || null;
    if (clearForce) log("Step 1b [FORCE=" + clearForce + "]");
    const _findPillInEditor = (root) =>
      _queryWithFallback("image_mode_pill", null, {
        scope: root || editor,
        silent: true,
      }) || (root || editor).querySelector("[data-inline-selection-pill]");
    const _readPromptText = () => {
      const copy = editor.cloneNode(true);
      for (
        let pill = _findPillInEditor(copy);
        pill;
        pill = _findPillInEditor(copy)
      )
        pill.remove();
      return (copy.textContent || "").replace(/\s+/g, "");
    };
    const modePill = _findPillInEditor();
    if (modePill) {
      log(
        "Step 1b: image mode pill present (" +
          (modePill.getAttribute("data-id") ||
            modePill.getAttribute("data-system-hint-type") ||
            "") +
          ") \u2014 SKIP full clear \u0111\u1EC3 gi\u1EEF mode, s\u1EBD append text sau pill",
      );
      try {
        const _clone = editor.cloneNode(true);
        for (
          let _p = _findPillInEditor(_clone);
          _p;
          _p = _findPillInEditor(_clone)
        )
          _p.remove();
        const _stale = (_clone.textContent || "").trim();
        if (_stale.length > 0) {
          log(
            "Step 1b: stale text ngo\xE0i pill (len=" +
              _stale.length +
              ', head="' +
              _stale.slice(0, 30) +
              '") \u2014 selective clear gi\u1EEF pill',
          );
          const _delRange = (setup) => {
            const r = document.createRange();
            r.selectNodeContents(editor);
            setup(r);
            if (r.collapsed) return;
            const s = window.getSelection();
            s.removeAllRanges();
            s.addRange(r);
            document.execCommand("delete", false, null);
          };
          let _pill = modePill;
          _delRange((r) => r.setEndBefore(_pill));
          _pill = _findPillInEditor() || _pill;
          _delRange((r) => r.setStartAfter(_pill));
          _pill = _findPillInEditor();
          if (!_pill) {
            log(
              "Step 1b WARN: pill bi\u1EBFn m\u1EA5t sau selective clear \u2014 image mode c\xF3 th\u1EC3 \u0111\xE3 m\u1EA5t",
            );
          } else {
            try {
              const rc = document.createRange();
              rc.setStartAfter(_pill);
              rc.collapse(true);
              const sc = window.getSelection();
              sc.removeAllRanges();
              sc.addRange(rc);
            } catch (_) {}
            log(
              "Step 1b: selective clear xong, editor len=" +
                (editor.textContent || "").length,
            );
          }
          await sleep(200);
        }
      } catch (e) {
        log("Step 1b selective clear failed (non-fatal):", e.message);
      }
      try {
        const r = document.createRange();
        r.selectNodeContents(editor);
        r.collapse(false);
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
      } catch (_) {}
    }
    const editorTextBeforeClear = (editor.textContent || "").trim();
    if (!modePill && (editorTextBeforeClear.length > 0 || clearForce)) {
      log(
        "Step 1b: Clearing editor (length=" +
          editorTextBeforeClear.length +
          ")",
      );
      try {
        if (!clearForce || clearForce === "selectAllDelete") {
          log("Step 1b[selectAllDelete]: execCommand selectAll+delete");
          document.execCommand("selectAll", false, null);
          await sleep(50);
          document.execCommand("delete", false, null);
          await sleep(100);
        }
        const stillHasText = (editor.textContent || "").trim().length > 0;
        if (clearForce === "innerHTMLReset" || (!clearForce && stillHasText)) {
          log("Step 1b[innerHTMLReset]: editor.innerHTML reset");
          editor.innerHTML = '<p><br class="ProseMirror-trailingBreak"></p>';
          editor.dispatchEvent(
            new InputEvent("input", {
              bubbles: true,
              inputType: "deleteContent",
            }),
          );
          await sleep(80);
        }
        log(
          "Step 1b OK: editor cleared, current length=",
          editor.textContent.length,
        );
      } catch (clearErr) {
        log("Step 1b clear failed (non-fatal):", clearErr.message);
      }
      editor.focus();
      await sleep(80);
    } else {
      log(
        "Step 1b: " +
          (modePill
            ? "pill mode \u2014 full clear \u0111\xE3 skip (stale text x\u1EED l\xFD \u1EDF selective clear tr\xEAn)"
            : "Editor \u0111\xE3 empty, skip clear (tr\xE1nh ph\xE1 ProseMirror state)"),
      );
    }
    const remainingDraftLength = _readPromptText().length;
    log("[ChatGPTComposerAudit] clear verified", {
      remainingDraftLength,
      hasModePill: !!_findPillInEditor(),
    });
    if (remainingDraftLength > 0) throw new Error("COMPOSER_DIRTY");
    const insertForce =
      document.documentElement.dataset.tobyChatgptInsertForce || null;
    if (insertForce) log("Step 2 [FORCE=" + insertForce + "]");
    const _fileTileCount = () => {
      try {
        return _queryAllWithFallback("text_file_tile", null).length;
      } catch (_) {
        return 0;
      }
    };
    const _fileTileBaseline = _fileTileCount();
    const inserted = () => {
      if (_fileTileCount() > _fileTileBaseline)
        return _readPromptText().length === 0;
      if (text.length === 0) return true;
      const norm = (s) => String(s || "").replace(/\s+/g, "");
      const txt = _readPromptText();
      const san = norm(text);
      const expected = san.length;
      if (expected === 0) return true;
      return txt === san;
    };
    if (!insertForce || insertForce === "pasteEvent") {
      log("Step 2[pasteEvent]: ClipboardEvent paste, length=", text.length);
      try {
        const dt = new DataTransfer();
        dt.setData("text/plain", text);
        editor.dispatchEvent(
          new ClipboardEvent("paste", {
            clipboardData: dt,
            bubbles: true,
            cancelable: true,
          }),
        );
        await sleep(300);
        if (!insertForce) {
          for (let i = 0; i < 8 && !inserted(); i++) {
            await sleep(150);
          }
        }
      } catch (e) {
        log("Step 2[pasteEvent] fail:", e.message);
      }
    }
    if (insertForce === "execCommand" || (!insertForce && !inserted())) {
      log(
        "Step 2[execCommand]: clear editor + document.execCommand insertText",
      );
      log(
        "[IMG_VERIFY] execCommand tier RAN (paste !inserted) | modePill=" +
          (modePill ? "yes" : "no"),
      );
      if (modePill) {
        try {
          const range = document.createRange();
          range.setStartAfter(modePill);
          range.setEnd(editor, editor.childNodes.length);
          range.deleteContents();
          editor.dispatchEvent(
            new InputEvent("input", {
              bubbles: true,
              inputType: "deleteContent",
            }),
          );
        } catch (_) {}
        try {
          const r = document.createRange();
          r.selectNodeContents(editor);
          r.collapse(false);
          const s = window.getSelection();
          s.removeAllRanges();
          s.addRange(r);
        } catch (_) {}
      } else {
        editor.innerHTML = "";
        editor.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            inputType: "deleteContentBackward",
          }),
        );
      }
      editor.focus();
      await sleep(100);
      document.execCommand("insertText", false, text);
      await sleep(200);
    }
    if (
      !modePill &&
      (insertForce === "innerHTMLReplace" || (!insertForce && !inserted()))
    ) {
      log(
        "Step 2[innerHTMLReplace]: editor.innerHTML + InputEvent (last resort)",
      );
      editor.innerHTML = `<p>${text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`;
      editor.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: text,
        }),
      );
      await sleep(200);
    }
    if (insertForce && !inserted()) {
      log(
        "Step 2 [FORCE=" +
          insertForce +
          "] FAILED: tier kh\xF4ng insert \u0111\u01B0\u1EE3c text. Editor length=" +
          editor.textContent.length,
      );
      throw new Error("FORCE_INSERT_TIER_FAILED:" + insertForce);
    }
    editor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        inputType: "insertFromPaste",
        data: text,
      }),
    );
    await sleep(150);
    log("Step 2 OK: editor.textContent length=", editor.textContent.length);
    let imageModePillLost = false;
    try {
      const _ec = editor.textContent || "";
      const _ecNoWs = _ec.replace(/\s+/g, "").length;
      const _txNoWs = (text || "").replace(/\s+/g, "").length;
      const _pillNow = _findPillInEditor(editor);
      imageModePillLost = !!modePill && !_pillNow;
      log(
        "[IMG_VERIFY] FINAL editor len=" +
          _ec.length +
          " | modePill=" +
          (_pillNow
            ? _pillNow.getAttribute("data-id") ||
              _pillNow.getAttribute("data-system-hint-type") ||
              "yes"
            : "no") +
          " | inserted=" +
          inserted() +
          ' | head="' +
          _ec.slice(0, 70).replace(/\s+/g, "\xB7") +
          '" | tail="' +
          _ec.slice(-70).replace(/\s+/g, "\xB7") +
          '"',
      );
      if (_txNoWs > 15 && _ecNoWs > Math.floor(_txNoWs * 1.7)) {
        log(
          "[IMG_VERIFY] \u26A0\uFE0F NGHI DOUBLE INSERT: editor(no-ws)=" +
            _ecNoWs +
            " >> text(no-ws)=" +
            _txNoWs,
        );
      }
    } catch (_) {}
    if (imageModePillLost) {
      log(
        "[IMG_VERIFY] FAIL: Create image pill disappeared after prompt insertion \u2014 abort before submit",
      );
      return false;
    }
    if (!editor.isConnected) {
      log("Editor DETACHED kh\u1ECFi DOM (SPA re-render) \u2014 abort submit");
      return false;
    }
    log(
      "[PromptTextAudit]",
      JSON.stringify({
        stage: "chatgpt_composer",
        expected: _promptTextAudit(text),
        actual: _promptTextAudit(_readPromptText()),
        fileBacked: _fileTileCount() > _fileTileBaseline,
      }),
    );
    if (!inserted()) {
      log("[ChatGPTComposerAudit] submit blocked", {
        reason: "EDITOR_TEXT_MISMATCH",
        expectedLength: String(text || "").replace(/\s+/g, "").length,
        actualLength: _readPromptText().length,
      });
      throw new Error("EDITOR_TEXT_MISMATCH");
    }
    const submitForce =
      document.documentElement.dataset.tobyChatgptSubmitForce || null;
    if (submitForce) log("Step 3-7 [FORCE=" + submitForce + "]");
    const fileBackedPrompt =
      _fileTileCount() > _fileTileBaseline ||
      (text.length > 0 && (editor.textContent || "").trim().length === 0);
    const submitted = () =>
      isChatGptSubmitConfirmed(editor, baseline, fileBackedPrompt);
    const waitForSubmitted = async (timeoutMs) => {
      const until = Date.now() + timeoutMs;
      while (Date.now() < until) {
        checkSubmitAbort("wait-submit-receipt");
        if (submitted()) return true;
        await interruptibleSleep(200, "wait-submit-receipt");
      }
      checkSubmitAbort("after-submit-receipt");
      return submitted();
    };
    if (fileBackedPrompt)
      log("Submit receipt requires a new user turn (prompt converted to file)");
    if (!submitForce) {
      const gateStart = Date.now();
      let gateBtnSeen = false;
      while (Date.now() - gateStart < 3e4) {
        checkSubmitAbort("wait-submit-enabled");
        if (_isRefUploading()) {
          await sleep(200);
          continue;
        }
        const b = _queryWithFallback("submit_button", null, { silent: true });
        if (b) {
          gateBtnSeen = true;
          if (!b.disabled) {
            log("Step 2c: submit button enabled (upload xong) \u2192 submit");
            break;
          }
        } else if (gateBtnSeen) break;
        await sleep(200);
      }
      await sleep(300);
    }
    checkSubmitAbort("before-submit");
    if (!submitForce || submitForce === "enterKey") {
      log("Step 3[enterKey]: KeyboardEvent keydown+keypress+keyup");
      editor.focus();
      await sleep(80);
      checkSubmitAbort("before-submit-enter");
      const enterOpts = {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
        composed: true,
      };
      try {
        editor.dispatchEvent(new KeyboardEvent("keydown", enterOpts));
        editor.dispatchEvent(new KeyboardEvent("keypress", enterOpts));
        editor.dispatchEvent(new KeyboardEvent("keyup", enterOpts));
      } catch (e) {
        log("Step 3[enterKey] dispatch fail:", e.message);
      }
      if (await waitForSubmitted(fileBackedPrompt ? 3e3 : 1500)) {
        log("Step 4 OK: submit confirmed via enterKey");
        return true;
      }
      if (submitForce === "enterKey") {
        log("Step 4 [FORCE=enterKey] DONE: editor still has text");
        return true;
      }
    }
    let sendBtn = null;
    if (
      submitForce === "simulateClick" ||
      submitForce === "reactOnClick" ||
      (!submitForce && !submitted())
    ) {
      log(
        "Step 5: t\xECm submit button cho simulateClick/reactOnClick fallback",
      );
      const start = Date.now();
      const POLL_TIMEOUT = 3e4;
      let lastDiag = 0;
      while (Date.now() - start < POLL_TIMEOUT) {
        checkSubmitAbort("wait-submit-fallback");
        if (submitted()) return true;
        const candidate = _queryWithFallback("submit_button");
        if (candidate && !candidate.disabled) {
          sendBtn = candidate;
          break;
        }
        if (Date.now() - lastDiag > 3e3) {
          const fileTile = _queryWithFallback("text_file_tile", null, {
            silent: true,
          });
          const fileSpinner = document.querySelector(
            '.composer-attach .animate-spin, [name="expand-file-tile"] ~ * .animate-spin',
          );
          log(
            `Step 5 polling: btn=${!!candidate} disabled=${candidate?.disabled} fileTile=${!!fileTile} spinner=${!!fileSpinner}`,
          );
          lastDiag = Date.now();
        }
        await sleep(200);
      }
      if (!sendBtn) {
        if (submitted()) return true;
        log(
          "FAIL: SEND_BUTTON_NOT_FOUND_OR_DISABLED. Editor content:",
          editor.textContent.substring(0, 50),
        );
        if (submitForce) return true;
        throw new Error("SEND_BUTTON_NOT_FOUND");
      }
      if (!submitForce || submitForce === "simulateClick") {
        checkSubmitAbort("before-submit-click");
        log("Step 5[simulateClick]: PointerEvent + MouseEvent chain");
        const rect = sendBtn.getBoundingClientRect();
        const opts = {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        };
        try {
          sendBtn.dispatchEvent(new PointerEvent("pointerdown", opts));
          sendBtn.dispatchEvent(new MouseEvent("mousedown", opts));
          sendBtn.dispatchEvent(new PointerEvent("pointerup", opts));
          sendBtn.dispatchEvent(new MouseEvent("mouseup", opts));
          sendBtn.dispatchEvent(new MouseEvent("click", opts));
        } catch (e) {
          log("Step 5[simulateClick] fail:", e.message);
        }
        if (
          !submitForce &&
          (await waitForSubmitted(fileBackedPrompt ? 3e3 : 1500))
        ) {
          log("Step 6 OK: submit confirmed via simulateClick");
          return true;
        }
      }
      if (submitForce === "reactOnClick" || !submitForce) {
        checkSubmitAbort("before-submit-react");
        const propsKey = Object.keys(sendBtn).find((k) =>
          k.startsWith("__reactProps$"),
        );
        const props = propsKey ? sendBtn[propsKey] : null;
        if (props && typeof props.onClick === "function") {
          log(
            "Step 5[reactOnClick]: React props onClick (plain object, no isTrusted)",
          );
          try {
            props.onClick({
              preventDefault() {},
              stopPropagation() {},
              nativeEvent: new MouseEvent("click"),
              type: "click",
              target: sendBtn,
              currentTarget: sendBtn,
            });
          } catch (e) {
            log("Step 5[reactOnClick] fail:", e.message);
          }
        } else if (submitForce === "reactOnClick") {
          log("Step 5[reactOnClick] skip: __reactProps.onClick not found");
        }
      }
      if (!submitForce) {
        if (await waitForSubmitted(fileBackedPrompt ? 3e3 : 1500)) {
          log("Step 6 OK: submit confirmed after click");
          return true;
        }
      } else if (
        submitForce === "simulateClick" ||
        submitForce === "reactOnClick"
      ) {
        log("Step 6 [FORCE=" + submitForce + "] DONE");
        return true;
      }
    }
    if (submitForce === "formRequestSubmit" || (!submitForce && !submitted())) {
      checkSubmitAbort("before-submit-form");
      log("Step 7[formRequestSubmit]: form.requestSubmit() native HTML");
      try {
        const formBtn =
          sendBtn ||
          _queryWithFallback("submit_button") ||
          _queryWithFallback("submit_button");
        const form =
          (formBtn && formBtn.closest("form")) || editor.closest("form");
        if (form && typeof form.requestSubmit === "function") {
          form.requestSubmit(formBtn);
          if (await waitForSubmitted(fileBackedPrompt ? 3e3 : 1e3)) {
            log("Step 7[formRequestSubmit] OK: submit confirmed");
            return true;
          }
          log("Step 7[formRequestSubmit] kh\xF4ng clear editor");
        } else {
          log(
            "Step 7[formRequestSubmit] skip: form kh\xF4ng t\u1ED3n t\u1EA1i ho\u1EB7c kh\xF4ng h\u1ED7 tr\u1EE3 requestSubmit",
          );
        }
      } catch (e) {
        if (e?.noRetry || e?.message?.startsWith("ABORTED")) throw e;
        log("Step 7[formRequestSubmit] fail:", e.message);
      }
    }
    const _finalSubmitted = submitted();
    log(
      "Step 7 DONE: All submit strategies \u0111\xE3 th\u1EED \u2014 submitted=" +
        _finalSubmitted,
    );
    return _finalSubmitted;
  }
  function checkImageLimitAlert() {
    const normalize = (s) =>
      (s || "").replace(/[’‘]/g, "'").replace(/[  ]/g, " ").toLowerCase();
    const bodyText = normalize(document.body?.innerText || "");
    const limitPhrase = "reached your image creation limit";
    if (!bodyText.includes(limitPhrase)) return null;
    const fullText = document.body?.innerText || "";
    const sentences = fullText.split(/[\n]+/);
    let matchSentence = "";
    for (const sent of sentences) {
      if (normalize(sent).includes(limitPhrase)) {
        matchSentence = sent.trim();
        break;
      }
    }
    return {
      detected: true,
      message:
        matchSentence ||
        "You've reached your image creation limit on the free plan.",
    };
  }
  function snapshotConversationState() {
    const turns = _queryAllWithFallback("conversation_turn");
    const existingImageFileIds = new Set();
    const existingImageSources = new Set();
    const allResultImgs = _queryResultImages(document);
    for (const img of allResultImgs) {
      if (!img.src) continue;
      existingImageSources.add(img.src);
      const m = img.src.match(/[?&]id=(file_[a-z0-9]+)/i);
      if (m) existingImageFileIds.add(m[1]);
    }
    const turnIds = new Set();
    for (const t of turns) {
      const id = _getConversationTurnIdentity(t);
      if (id) turnIds.add(id);
    }
    console.log(
      "[ChatGPT-snapshot] \u{1F4F8} Baseline:",
      turns.length,
      "turns,",
      existingImageSources.size,
      "existing image sources,",
      existingImageFileIds.size,
      "file_ids",
    );
    return {
      turnCount: turns.length,
      turnIds,
      generationErrorBaseline: _snapshotGenerationErrorState(),
      existingImageFileIds,
      existingImageSources,
      lastTurnIds: Array.from(turns)
        .slice(-5)
        .map((t) => _getConversationTurnIdentity(t)),
      timestamp: Date.now(),
    };
  }
  function hasNewUserTurnSince(baseline) {
    if (!baseline) return false;
    const turns = _queryAllWithFallback("conversation_turn");
    const ids = baseline.turnIds || new Set();
    return Array.from(turns).some((turn, index) => {
      if (_getConversationTurnRole(turn) !== "user") return false;
      const id = _getConversationTurnIdentity(turn);
      return ids.size > 0 ? !!id && !ids.has(id) : index >= baseline.turnCount;
    });
  }
  function isChatGptSubmitConfirmed(editor, baseline, requiresTurnReceipt) {
    return (
      hasNewUserTurnSince(baseline) ||
      (!requiresTurnReceipt && (editor.textContent || "").trim().length < 5)
    );
  }
  function isStreaming(turnEl) {
    if (_hasGeneratingIndicator(turnEl)) return true;
    if (_hasGeneratingIndicator()) return true;
    if (_queryWithFallback("stop_button")) return true;
    const sendBtn = _queryWithFallback("submit_button");
    if (sendBtn?.disabled) return true;
    const hasSkeleton = turnEl.querySelector(
      '[class*="skeleton"], [class*="shimmer"], [class*="animate-pulse"]',
    );
    const hasImg = !!_findGeneratedImg(turnEl);
    if (hasSkeleton && !hasImg) return true;
    return false;
  }
  function _findGeneratedImg(turnEl) {
    const altMatch = Array.from(_queryGeneratedImages(turnEl)).find(
      (img) => !img.classList.contains("blur-2xl") && img.src,
    );
    if (altMatch && !altMatch.classList.contains("blur-2xl") && altMatch.src)
      return altMatch;
    const candidates = _queryCdnImages(turnEl);
    for (const img of candidates) {
      if (img.classList.contains("blur-2xl")) continue;
      const alt = img.getAttribute("alt") || "";
      const isGenerated = _isGeneratedImageAlt(alt);
      const isSibling = alt === "";
      if (!isGenerated && !isSibling) continue;
      if (img.src) return img;
    }
    if (
      !_findGeneratedImg._lastDebug ||
      Date.now() - _findGeneratedImg._lastDebug > 5e3
    ) {
      const allImgs = turnEl.querySelectorAll("img");
      if (allImgs.length > 0) {
        console.log(
          "[ChatGPT-find] \u{1F50D} No generated img found, turn has",
          allImgs.length,
          "imgs",
        );
        for (let i = 0; i < Math.min(allImgs.length, 3); i++) {
          const img = allImgs[i];
          console.log(
            "  [" + i + "] src:",
            (img.src || "").slice(0, 80),
            "| alt:",
            (img.alt || "").slice(0, 40),
          );
        }
        _findGeneratedImg._lastDebug = Date.now();
      }
    }
    return null;
  }
  let _activePatterns = {
    rateLimit: [],
    contentBlocked: [],
    imageGenFailed: [],
    network: [],
    textOnly: [],
    cloudflare: [],
    generatedImageAlt: [],
  };
  ConfigSnapshotAccess.onInvalidated(() => {
    for (const key of Object.keys(_activePatterns)) _activePatterns[key] = [];
  });
  function _parsePatternString(str) {
    if (!str || typeof str !== "string") return [];
    return str
      .split("|")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
  async function _loadPatternsFromStorage() {
    try {
      const result = await new Promise((r) =>
        ConfigSnapshotAccess.read(["af_chatgpt_config"], r),
      );
      const cfg = result?.af_chatgpt_config?.data;
      if (!cfg) return false;
      _activePatterns.rateLimit = _parsePatternString(
        cfg.rate_limit_error_text,
      );
      _activePatterns.contentBlocked = _parsePatternString(
        cfg.content_blocked_text,
      );
      _activePatterns.imageGenFailed = _parsePatternString(
        cfg.image_gen_failed_text,
      );
      _activePatterns.network = _parsePatternString(cfg.network_error_text);
      _activePatterns.textOnly = _parsePatternString(cfg.text_only_pattern);
      _activePatterns.cloudflare = _parsePatternString(
        cfg.cloudflare_challenge_text,
      );
      _activePatterns.generatedImageAlt = _parsePatternString(
        cfg.generated_image_alt_text,
      );
      const errorPatternKeys = [
        "rateLimit",
        "contentBlocked",
        "imageGenFailed",
        "network",
        "textOnly",
        "cloudflare",
      ];
      return errorPatternKeys.some((key) => _activePatterns[key].length > 0);
    } catch (e) {
      return false;
    }
  }
  const _PATTERNS_WAIT_MAX_MS = 1e4;
  const _PATTERNS_WAIT_INTERVAL_MS = 500;
  (async function _ensurePatternsConfig() {
    const startTime = Date.now();
    let attempts = 0;
    let lastLogElapsed = 0;
    console.log(
      `[ChatGPT:patterns:ensure] \u23F3 Waiting for error patterns in chrome.storage.local.af_chatgpt_config (timeout ${_PATTERNS_WAIT_MAX_MS}ms)...`,
    );
    while (Date.now() - startTime < _PATTERNS_WAIT_MAX_MS) {
      attempts++;
      const ok = await _loadPatternsFromStorage();
      if (ok) {
        const total = Object.values(_activePatterns).reduce(
          (s, a) => s + a.length,
          0,
        );
        console.log(
          `[ChatGPT:patterns:ensure] \u2705 Loaded ${total} patterns across ${Object.keys(_activePatterns).length} categories after ${attempts} attempts (${Date.now() - startTime}ms)`,
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
      if (elapsed - lastLogElapsed >= 2e3) {
        lastLogElapsed = elapsed;
        console.log(
          `[ChatGPT:patterns:ensure] \u23F3 Still waiting (${(elapsed / 1e3).toFixed(1)}s/${_PATTERNS_WAIT_MAX_MS / 1e3}s, attempt #${attempts})...`,
        );
      }
      await new Promise((r) => setTimeout(r, _PATTERNS_WAIT_INTERVAL_MS));
    }
    console.warn(
      `[ChatGPT:patterns:ensure] \u26A0\uFE0F Timeout after ${attempts} attempts \u2014 error detection degraded. User v\u1EABn submit \u0111\u01B0\u1EE3c, ch\u1EC9 l\xE0 tracker hi\u1EC3n th\u1ECB TIMEOUT thay v\xEC error code ch\xEDnh x\xE1c.`,
    );
  })();
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.af_chatgpt_config) {
        _loadPatternsFromStorage();
      }
    });
  } catch (e) {}
  function detectError(turnEl) {
    const text = (turnEl.innerText || "").toLowerCase();
    if (_activePatterns.rateLimit.some((p) => text.includes(p)))
      return "RATE_LIMIT";
    if (_activePatterns.contentBlocked.some((p) => text.includes(p)))
      return "CONTENT_BLOCKED";
    if (_activePatterns.imageGenFailed.some((p) => text.includes(p)))
      return "IMAGE_GEN_FAILED";
    if (_activePatterns.network.some((p) => text.includes(p))) return "NETWORK";
    return null;
  }
  function _snapshotGenerationErrorState() {
    const turnIds = new Set();
    const turns = new Set();
    for (const selector of _getSelectorsForKey("conversation_turn")) {
      try {
        for (const turn of document.querySelectorAll(selector)) {
          turns.add(turn);
          const id = _getConversationTurnIdentity(turn);
          if (id) turnIds.add(id);
        }
      } catch (_) {}
    }
    return {
      turnIds,
      turns,
      alerts: new Set(_queryAllWithFallback("generation_error_alert")),
    };
  }
  function _detectGenerationErrorAlert(baseline) {
    const before = baseline.generationErrorBaseline;
    if (!before) return null;
    const selectors = _getSelectorsForKey("conversation_turn");
    for (const alert of _queryAllWithFallback("generation_error_alert")) {
      if (before.alerts.has(alert) || !_isChatGPTElementRendered(alert))
        continue;
      let owner = alert.parentElement;
      while (owner) {
        if (
          selectors.some((selector) => {
            try {
              return owner.matches(selector);
            } catch (_) {
              return false;
            }
          })
        )
          break;
        owner = owner.parentElement;
      }
      if (!owner) continue;
      const id = _getConversationTurnIdentity(owner);
      if (before.turns.has(owner) || (id && before.turnIds.has(id))) continue;
      const message = (alert.innerText || alert.textContent || "").trim();
      const error = detectError({ innerText: message });
      if (!error) continue;
      console.warn(
        "[ChatGPT-error-alert]",
        JSON.stringify({ error, turnId: id || null }),
      );
      return { success: false, error, message: message.slice(0, 500) };
    }
    return null;
  }
  function _isGeneratedImageAlt(alt) {
    const normalized = String(alt || "")
      .trim()
      .toLowerCase();
    return (
      !!normalized &&
      _activePatterns.generatedImageAlt.some((prefix) =>
        normalized.startsWith(prefix),
      )
    );
  }
  function _stripGeneratedImageAltPrefix(alt) {
    const value = String(alt || "").trim();
    const normalized = value.toLowerCase();
    const prefix = _activePatterns.generatedImageAlt.find((candidate) =>
      normalized.startsWith(candidate),
    );
    return prefix ? value.slice(prefix.length).replace(/^\s*:\s*/, "") : value;
  }
  function detectTextTurnError(responseText) {
    const text = String(responseText || "").trim();
    if (!text || text.length > 500 || /^(?:```(?:json)?\s*)?[{[]/i.test(text))
      return null;
    return detectError({ innerText: text });
  }
  function extractImageUrls(turnEl) {
    const configuredResults = new Set(
      Array.from(_queryGeneratedImages(turnEl)),
    );
    const images = _queryResultImages(turnEl);
    const allImgs = turnEl.querySelectorAll("img");
    if (allImgs.length > 0 && images.length === 0) {
      console.log(
        "[ChatGPT-extract] \u{1F50D} DEBUG: CDN selector miss, dumping all",
        allImgs.length,
        "imgs:",
      );
      for (let i = 0; i < Math.min(allImgs.length, 5); i++) {
        const img = allImgs[i];
        console.log(
          "  [" + i + "] src:",
          (img.src || "").slice(0, 100),
          "| alt:",
          (img.alt || "").slice(0, 50),
        );
      }
    }
    const urlByFileId = new Map();
    const candidates = [];
    let debugInfo = {
      total: images.length,
      skippedBlur: 0,
      skippedRef: 0,
      skippedEmpty: 0,
    };
    for (const img of images) {
      if (img.classList.contains("blur-2xl")) {
        debugInfo.skippedBlur++;
        continue;
      }
      const src = img.src;
      if (!src) {
        debugInfo.skippedEmpty++;
        continue;
      }
      const alt = img.getAttribute("alt") || "";
      const isGenerated =
        configuredResults.has(img) || _isGeneratedImageAlt(alt);
      const isSibling = alt === "";
      if (!isGenerated && !isSibling) {
        console.log(
          "[ChatGPT-extract] \u23ED\uFE0F Skip non-generated:",
          alt.slice(0, 50),
          "| file_id:",
          src.match(/[?&]id=(file_[a-z0-9]+)/i)?.[1],
        );
        debugInfo.skippedRef++;
        continue;
      }
      candidates.push({ src, alt });
    }
    console.log(
      "[ChatGPT-extract] \u{1F4CA} Images in turn:",
      JSON.stringify(debugInfo),
      "| Candidates after filter:",
      candidates.length,
    );
    candidates.sort((a, b) => {
      const aGen = _isGeneratedImageAlt(a.alt) ? 0 : 1;
      const bGen = _isGeneratedImageAlt(b.alt) ? 0 : 1;
      return aGen - bGen;
    });
    for (const c of candidates) {
      const fileIdMatch = c.src.match(/[?&]id=(file_[a-z0-9]+)/i);
      const key = fileIdMatch ? fileIdMatch[1] : c.src;
      if (!urlByFileId.has(key)) {
        urlByFileId.set(key, c.src);
      }
    }
    return Array.from(urlByFileId.values());
  }
  async function waitForTextResult(baseline, timeout = 6e4) {
    const startTime = Date.now();
    const pollInterval = 500;
    const STREAM_GRACE_MAX = 3e5;
    const hardCap = startTime + timeout + STREAM_GRACE_MAX;
    let deadline = startTime + timeout;
    let graceLogged = false;
    let lastDiag = 0;
    let stableCount = 0;
    let lastObservedText = "";
    let lastObservedStableCount = 0;
    let assistantObserved = false;
    let assistantMissingSince = 0;
    let genericTurnFallbackLogged = false;
    const sourceFileNames = new Set();
    const STABLE_THRESHOLD = 8;
    while (Date.now() < deadline) {
      _scrollChatToBottom();
      if (isAbortActive()) {
        console.log(
          "[ChatGPT-text] Aborted by user \u2192 clicking Stop button",
        );
        await clickChatGPTStopButton();
        return {
          success: false,
          error: "ABORTED",
          message: "User stopped execution",
        };
      }
      const alertError = _detectGenerationErrorAlert(baseline);
      if (alertError) return alertError;
      const allAssistantTurns = _queryAllWithFallback("assistant_turn");
      const allTurns = _queryAllWithFallback("conversation_turn");
      const baselineIds = baseline.turnIds || new Set();
      const newTurns =
        baselineIds.size > 0
          ? Array.from(allTurns).filter((t) => {
              const id = _getConversationTurnIdentity(t);
              return id && !baselineIds.has(id);
            })
          : Array.from(allTurns).slice(baseline.turnCount);
      for (const turn of newTurns) {
        if (_getConversationTurnRole(turn) !== "user") continue;
        for (const tile of _queryAllWithFallback(
          "pa_source_text_file",
          null,
          turn,
        )) {
          const name = tile.getAttribute("aria-label") || "";
          if (name.trim()) sourceFileNames.add(name.trim());
        }
      }
      const hasNewTurn = newTurns.length > 0;
      if (!hasNewTurn) {
        if (Date.now() - startTime > 3e4) {
          console.warn(
            "[ChatGPT-text] SUBMIT_LOST \u2014 kh\xF4ng c\xF3 turn m\u1EDBi sau 30s (prompt c\xF3 th\u1EC3 b\u1ECB wipe tr\u01B0\u1EDBc khi g\u1EEDi)",
          );
          return {
            success: false,
            error: "SUBMIT_LOST",
            message:
              "Prompt was not sent to ChatGPT (no new message after 30s).",
          };
        }
        if (Date.now() - lastDiag > 5e3) {
          console.log(
            "[ChatGPT-text] Ch\u01B0a c\xF3 turn m\u1EDBi \u2014 turnCount:",
            allTurns.length,
            "baseline:",
            baseline.turnCount,
            "baselineIds:",
            baselineIds.size,
          );
          lastDiag = Date.now();
        }
        await sleep(pollInterval);
        continue;
      }
      let lastAssistantTurn = null;
      for (let i = newTurns.length - 1; i >= 0; i--) {
        const t = newTurns[i];
        if (_getConversationTurnRole(t) === "assistant") {
          lastAssistantTurn = t;
          break;
        }
      }
      if (!lastAssistantTurn)
        lastAssistantTurn = allAssistantTurns[allAssistantTurns.length - 1];
      if (!lastAssistantTurn && newTurns.length >= 2) {
        lastAssistantTurn = newTurns[newTurns.length - 1];
        if (!genericTurnFallbackLogged) {
          genericTurnFallbackLogged = true;
          console.warn(
            "[ChatGPT-text] assistant_turn selector miss \u2014 using newest ordered conversation_turn",
          );
        }
      }
      if (!lastAssistantTurn) {
        if (assistantObserved) {
          if (!assistantMissingSince) assistantMissingSince = Date.now();
          if (Date.now() - assistantMissingSince >= 3e3) {
            if (lastObservedText && lastObservedStableCount >= 2) {
              console.warn(
                "[ChatGPT-text] Assistant turn retracted after stable text \u2014 returning cached response",
              );
              return {
                success: true,
                text: lastObservedText,
                turnId: null,
                sourceFileNames: Array.from(sourceFileNames),
                recoveredFromRetraction: true,
              };
            }
            console.warn(
              "[ChatGPT-text] RESPONSE_RETRACTED \u2014 assistant turn disappeared before text stabilized",
            );
            return {
              success: false,
              error: "RESPONSE_RETRACTED",
              partialText: lastObservedText,
              message: "ChatGPT removed the response before it stabilized.",
            };
          }
        }
        await sleep(pollInterval);
        continue;
      }
      assistantObserved = true;
      assistantMissingSince = 0;
      const stopGenBtn = _queryWithFallback("stop_button", null, {
        silent: true,
      });
      const stillGeneratingImg = _hasGeneratingIndicator(lastAssistantTurn);
      const hasThinkingIndicator = _queryWithFallback(
        "thinking_indicator",
        null,
        { scope: lastAssistantTurn, silent: true },
      );
      const signalStreaming =
        !!stopGenBtn || !!stillGeneratingImg || !!hasThinkingIndicator;
      let currentText = "";
      const roleWrapper = _queryWithFallback("message_author", null, {
        scope: lastAssistantTurn,
        silent: true,
      });
      const markdownEl = _queryWithFallback("response_text_content", null, {
        scope: roleWrapper || lastAssistantTurn,
        silent: true,
      });
      if (markdownEl && typeof markdownEl.innerText === "string") {
        currentText = markdownEl.innerText.trim();
      } else if (roleWrapper && typeof roleWrapper.innerText === "string") {
        currentText = roleWrapper.innerText.trim();
      }
      if (!currentText) {
        currentText = (lastAssistantTurn.innerText || "").trim();
      }
      const currentTextLength = currentText.length;
      if (currentTextLength > 0 && currentText === lastObservedText) {
        stableCount++;
      } else {
        stableCount = 0;
      }
      if (currentTextLength > 0) {
        lastObservedText = currentText;
        lastObservedStableCount = stableCount;
      }
      const isTextStable = stableCount >= STABLE_THRESHOLD;
      const stillStreaming =
        signalStreaming || (!isTextStable && currentTextLength > 0);
      if (stillStreaming) {
        if (signalStreaming && deadline - Date.now() < 6e4) {
          const next = Math.min(Date.now() + 6e4, hardCap);
          if (next > deadline) {
            deadline = next;
            if (!graceLogged) {
              console.warn(
                "[ChatGPT-text] Qu\xE1 timeout g\u1ED1c nh\u01B0ng stream c\xF2n s\u1ED1ng \u2192 gia h\u1EA1n (cap +",
                STREAM_GRACE_MAX / 1e3,
                "s)",
              );
              graceLogged = true;
            }
          }
        }
        if (Date.now() - lastDiag > 5e3) {
          console.log(
            "[ChatGPT-text] Streaming \u2014 signals:",
            {
              stop: !!stopGenBtn,
              image: !!stillGeneratingImg,
              thinking: !!hasThinkingIndicator,
            },
            "textLen:",
            currentTextLength,
            "stable:",
            stableCount,
          );
          lastDiag = Date.now();
        }
        await sleep(pollInterval);
        continue;
      }
      if (!currentText || currentText.length < 1) {
        if (Date.now() - startTime < 5e3) {
          await sleep(pollInterval);
          continue;
        }
        return { success: false, error: "TEXT_EMPTY" };
      }
      const error = detectTextTurnError(currentText);
      if (error) {
        console.log("[ChatGPT-text] Error:", error);
        return { success: false, error, message: currentText.slice(0, 500) };
      }
      const turnId = _getConversationTurnIdentity(lastAssistantTurn);
      console.log(
        "[ChatGPT-text] DONE \u2014 text length:",
        currentText.length,
        "stableCount:",
        stableCount,
      );
      return {
        success: true,
        text: currentText,
        turnId,
        sourceFileNames: Array.from(sourceFileNames),
      };
    }
    console.warn(
      "[ChatGPT-text] TIMEOUT sau",
      Date.now() - startTime,
      "ms (timeout g\u1ED1c",
      timeout,
      "ms)",
    );
    try {
      const _turns = _queryAllWithFallback("conversation_turn");
      const _aTurns = _queryAllWithFallback("assistant_turn");
      const _last = _aTurns[_aTurns.length - 1];
      const _mdEl = _last
        ? _queryWithFallback("response_text_content", null, {
            scope: _last,
            silent: true,
          })
        : null;
      const _txtLen = (
        (_mdEl && _mdEl.innerText) ||
        (_last && _last.innerText) ||
        ""
      ).trim().length;
      console.warn(
        "[ChatGPT-text] TIMEOUT diag \u2192",
        JSON.stringify({
          turnCount: _turns.length,
          baselineTurnCount: baseline.turnCount,
          assistantTurns: _aTurns.length,
          stopButton: !!_queryWithFallback("stop_button", null, {
            silent: true,
          }),
          generatingImg: _last ? !!_hasGeneratingIndicator(_last) : false,
          thinkingIndicator: _last
            ? !!_queryWithFallback("thinking_indicator", null, {
                scope: _last,
                silent: true,
              })
            : false,
          lastTextLen: _txtLen,
          lastStableCount: stableCount,
        }),
      );
    } catch (e) {
      console.warn("[ChatGPT-text] TIMEOUT diag failed:", e.message);
    }
    return { success: false, error: "TIMEOUT" };
  }
  async function waitForImageResult(baseline, timeout = 12e4) {
    const startTime = Date.now();
    const pollInterval = 1e3;
    let lastDiag = 0;
    let textOnlySignature = null;
    let postCompleteTextOnlyStart = null;
    const POST_COMPLETE_GRACE_MS = 5e3;
    const MIN_WAIT_BEFORE_PATTERN_CHECK_MS = 5e3;
    const MIN_WAIT_WITH_POSITIVE_MS = 1e4;
    const MIN_TEXT_FOR_ERROR_CHECK = 80;
    const POSITIVE_INDICATORS = [
      "i'll create",
      "i'll generate",
      "i'll make",
      "let me create",
      "let me generate",
      "creating",
      "generating",
      "here's",
      "here is",
      "sure",
      "absolutely",
      "of course",
    ];
    function hasPositiveIndicator(text) {
      if (!text) return false;
      const lower = text.toLowerCase();
      return POSITIVE_INDICATORS.some((p) => lower.includes(p));
    }
    function matchesAnyErrorPattern(text) {
      if (!text || text.length < MIN_TEXT_FOR_ERROR_CHECK) return null;
      const lower = text.toLowerCase();
      const checks = [
        { key: "rateLimit", error: "RATE_LIMIT" },
        { key: "contentBlocked", error: "CONTENT_BLOCKED" },
        { key: "imageGenFailed", error: "IMAGE_GEN_FAILED" },
      ];
      for (const { key, error } of checks) {
        const patterns = _activePatterns[key] || [];
        if (patterns.some((p) => lower.includes(p))) {
          return { error, text: text.slice(0, 500) };
        }
      }
      return null;
    }
    function textOnlyFailure(turn, text, phase) {
      const rawImages = Array.from(turn.querySelectorAll("img"));
      const matchedImages = _queryResultImages(turn);
      const diagnostic = {
        phase,
        elapsedMs: Date.now() - startTime,
        assistantRendered: _isChatGPTElementRendered(turn),
        assistantImageCount: rawImages.length,
        renderedAssistantImageCount: rawImages.filter(_isChatGPTElementRendered)
          .length,
        matchedImageCount: matchedImages.length,
        generatedAltImageCount: rawImages.filter((img) =>
          _isGeneratedImageAlt(img.alt),
        ).length,
        resultSelectorCount: _getSelectorsForKey("generated_image").length,
        cdnSelectorCount: _getSelectorsForKey("cdn_image").length,
        generatedAltPatternCount:
          _activePatterns.generatedImageAlt?.length || 0,
        baselineSourceCount: baseline.existingImageSources?.size || 0,
      };
      console.warn("[ChatGPT-result-diagnostic]", JSON.stringify(diagnostic));
      return {
        success: false,
        error: "TEXT_ONLY",
        text: text.slice(0, 500),
        diagnostic,
        textOnlyConfirmed: true,
        conversationPath: `${window.location.origin}${window.location.pathname}`,
      };
    }
    function findNewAssistantTurn() {
      const allAssistantTurns = Array.from(
        _queryAllConfigured("assistant_turn"),
      ).filter((turn) => {
        if (!_isChatGPTElementRendered(turn)) return false;
        const identity = _getConversationTurnIdentity(turn);
        return !identity || !baseline.turnIds?.has(identity);
      });
      if (!allAssistantTurns.length) return null;
      const actionBtnSelectors = _getSelectorsForKey("image_action_buttons");
      for (let i = allAssistantTurns.length - 1; i >= 0; i--) {
        const turn = allAssistantTurns[i];
        if (_hasGeneratingIndicator(turn)) return turn;
        for (const sel of actionBtnSelectors) {
          if (turn.querySelector(sel)) return turn;
        }
        if (
          _queryWithFallback("generated_image", null, {
            scope: turn,
            silent: true,
          })
        )
          return turn;
      }
      const newTurns = Array.from(allAssistantTurns).filter((turn) => {
        const testid = _getConversationTurnIdentity(turn) || "";
        const m = testid.match(/conversation-turn-(\d+)/);
        if (!m) return false;
        return parseInt(m[1], 10) > baseline.turnCount;
      });
      if (newTurns.length > 0) return newTurns[newTurns.length - 1];
      return allAssistantTurns[allAssistantTurns.length - 1];
    }
    const MAX_WAIT = Math.max(timeout, 6e5);
    const HEARTBEAT_MS = 9e4;
    let genSeenOnce = false;
    let lastGenActive = Date.now();
    while (Date.now() - startTime < MAX_WAIT) {
      if (
        baseline.retryConversationPath &&
        baseline.retryConversationPath !==
          `${window.location.origin}${window.location.pathname}`
      )
        return { success: false, error: "CONVERSATION_CHANGED", noRetry: true };
      _scrollChatToBottom();
      FloatingTracker.setProviderProgress?.(_readImageGenerationUiProgress());
      if (isAbortActive()) {
        console.log(
          "[ChatGPT-image] Aborted by user \u2192 clicking Stop button",
        );
        await clickChatGPTStopButton();
        return {
          success: false,
          error: "ABORTED",
          message: "User stopped execution",
        };
      }
      const alertError = _detectGenerationErrorAlert(baseline);
      if (alertError) return alertError;
      if (detectChatGPTChallenge()) {
        console.warn(
          "[ChatGPT-image] Challenge re-emerged mid-stream \u2192 abort",
        );
        return {
          success: false,
          error: "CHALLENGE_TIMEOUT",
          message:
            "ChatGPT requires verification during generation \u2014 please verify manually and run again.",
        };
      }
      const allTurns = _queryAllWithFallback("conversation_turn");
      const baselineFileIds = baseline.existingImageFileIds || new Set();
      const baselineSources = baseline.existingImageSources || new Set();
      const _hasRealNewImage = () => {
        const configuredResults2 = new Set(Array.from(_queryGeneratedImages()));
        for (const img of _queryResultImages(document)) {
          if (img.closest("form")) continue;
          if (
            img.classList.contains("blur-2xl") ||
            !img.src ||
            baselineSources.has(img.src)
          )
            continue;
          const a = img.getAttribute("alt") || "";
          if (!(
            configuredResults2.has(img) ||
            _isGeneratedImageAlt(a) ||
            a === ""
          ))
            continue;
          const m = img.src.match(/[?&]id=(file_[a-z0-9]+)/i);
          if (m && baselineFileIds.has(m[1])) continue;
          return true;
        }
        return false;
      };
      const configuredResults = new Set(Array.from(_queryGeneratedImages()));
      const allGenImgs = _queryResultImages(document);
      const urlByFileId = new Map();
      for (const img of allGenImgs) {
        if (img.closest("form")) continue;
        if (img.classList.contains("blur-2xl") || !img.src) continue;
        const alt = img.getAttribute("alt") || "";
        const isGenerated =
          configuredResults.has(img) || _isGeneratedImageAlt(alt);
        const isSibling = alt === "";
        if (!isGenerated && !isSibling) continue;
        if (baselineSources.has(img.src)) continue;
        const m = img.src.match(/[?&]id=(file_[a-z0-9]+)/i);
        const imageKey = m ? m[1] : img.src;
        if (m && baselineFileIds.has(m[1])) continue;
        if (!urlByFileId.has(imageKey)) urlByFileId.set(imageKey, img.src);
      }
      const newImageUrls = Array.from(urlByFileId.values());
      const globalGenerating = _hasGeneratingIndicator();
      if (globalGenerating) {
        genSeenOnce = true;
        lastGenActive = Date.now();
      } else if (newImageUrls.length === 0) {
        if (genSeenOnce) {
          if (Date.now() - lastGenActive > HEARTBEAT_MS) {
            console.warn(
              `[ChatGPT-detect] Heartbeat: indicator gen t\u1EAFt > ${HEARTBEAT_MS / 1e3}s + ch\u01B0a c\xF3 \u1EA3nh \u2192 stuck, d\u1EEBng ch\u1EDD`,
            );
            break;
          }
        } else if (Date.now() - startTime > timeout) {
          console.warn(
            "[ChatGPT-detect] Heartbeat: ch\u01B0a t\u1EEBng th\u1EA5y indicator gen sau",
            timeout,
            "ms \u2192 d\u1EEBng ch\u1EDD",
          );
          break;
        }
      }
      if (
        newImageUrls.length > 0 &&
        !globalGenerating &&
        (genSeenOnce || Date.now() - startTime > 1e4)
      ) {
        let altText = "";
        for (const img of allGenImgs) {
          if (img.classList.contains("blur-2xl") || !img.src) continue;
          const alt = img.getAttribute("alt") || "";
          if (!_isGeneratedImageAlt(alt)) continue;
          const m = img.src.match(/[?&]id=(file_[a-z0-9]+)/i);
          if (
            !baselineSources.has(img.src) &&
            (!m || !baselineFileIds.has(m[1]))
          ) {
            altText = alt;
            break;
          }
        }
        console.log(
          "[ChatGPT-detect] DONE (global fallback) \u2014 NEW urls:",
          newImageUrls.length,
          "baseline c\u0169:",
          baselineFileIds.size,
          "alt:",
          altText.slice(0, 60),
        );
        return {
          success: true,
          imageUrls: newImageUrls,
          altPrompt: _stripGeneratedImageAltPrefix(altText),
          turnId: null,
        };
      }
      if (allTurns.length <= baseline.turnCount) {
        postCompleteTextOnlyStart = null;
        textOnlySignature = null;
        if (Date.now() - lastDiag > 3e3) {
          const genState = globalGenerating ? "GENERATING (global)" : "idle";
          const url = window.location.pathname;
          console.log(
            "[ChatGPT-detect] Ch\u01B0a c\xF3 turn m\u1EDBi \u2014 turnCount:",
            allTurns.length,
            "baseline:",
            baseline.turnCount,
            "state:",
            genState,
            "url:",
            url,
          );
          lastDiag = Date.now();
        }
        await sleep(pollInterval);
        continue;
      }
      const lastAssistantTurn = findNewAssistantTurn();
      if (!lastAssistantTurn) {
        postCompleteTextOnlyStart = null;
        textOnlySignature = null;
        await sleep(pollInterval);
        continue;
      }
      const error = detectError(lastAssistantTurn);
      if (error) {
        console.log("[ChatGPT-detect] Error:", error);
        return {
          success: false,
          error,
          message: (lastAssistantTurn.innerText || "").slice(0, 500),
        };
      }
      const paragenContainer =
        _queryWithFallback("paragen_container", null, {
          scope: lastAssistantTurn,
          silent: true,
        }) || _queryWithFallback("paragen_container", null, { silent: true });
      if (paragenContainer) {
        const paragenImgs = Array.from(
          _queryGeneratedImages(paragenContainer),
        ).filter(
          (img) =>
            !img.classList.contains("blur-2xl") &&
            img.src &&
            !baselineSources.has(img.src),
        );
        const stillLoadingInParagen = !!_queryWithFallback(
          "generating_indicator",
          null,
          { scope: paragenContainer, silent: true },
        );
        if (paragenImgs.length >= 2 && !stillLoadingInParagen) {
          const paragenUrls = paragenImgs.map((img) => img.src);
          const seen = new Set();
          const dedupedUrls = paragenUrls.filter((url) => {
            const m = url.match(/[?&]id=(file_[a-z0-9]+)/i);
            const key = m ? m[1] : url;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          console.log(
            "[ChatGPT-detect] DONE (paragen-multigen) \u2014",
            dedupedUrls.length,
            "\u1EA3nh s\u1EB5n s\xE0ng",
          );
          return {
            success: true,
            imageUrls: dedupedUrls,
            altPrompt: _stripGeneratedImageAltPrefix(paragenImgs[0]?.alt),
            turnId: _getConversationTurnIdentity(lastAssistantTurn),
          };
        }
      }
      const generatedImg = _findGeneratedImg(lastAssistantTurn);
      let imageUrls = extractImageUrls(lastAssistantTurn);
      const preFilterCount = imageUrls.length;
      if (baselineFileIds.size > 0) {
        imageUrls = imageUrls.filter((url) => {
          if (baselineSources.has(url)) return false;
          const m = url.match(/[?&]id=(file_[a-z0-9]+)/i);
          if (!m) return true;
          const isOld = baselineFileIds.has(m[1]);
          if (isOld)
            console.log(
              "[ChatGPT-detect] \u23ED\uFE0F Filter old/ref image:",
              m[1],
            );
          return !isOld;
        });
      } else if (baselineSources.size > 0) {
        imageUrls = imageUrls.filter((url) => !baselineSources.has(url));
      }
      if (preFilterCount !== imageUrls.length) {
        console.log(
          "[ChatGPT-detect] \u{1F50D} Baseline filter:",
          preFilterCount,
          "\u2192",
          imageUrls.length,
          "| baselineIds:",
          baselineFileIds.size,
        );
      }
      const postActionDone = !!_queryWithFallback(
        "image_action_buttons",
        null,
        { scope: lastAssistantTurn, silent: true },
      );
      if (generatedImg && imageUrls.length > 0) {
        const altText = generatedImg.getAttribute("alt") || "";
        const isGeneratedAlt = _isGeneratedImageAlt(altText);
        if (
          postActionDone ||
          isGeneratedAlt ||
          !isStreaming(lastAssistantTurn)
        ) {
          const turnId = _getConversationTurnIdentity(lastAssistantTurn);
          console.log(
            "[ChatGPT-detect] DONE \u2014 urls:",
            imageUrls.length,
            "alt:",
            altText.slice(0, 60),
            "postAction:",
            postActionDone,
          );
          return {
            success: true,
            imageUrls,
            altPrompt: isGeneratedAlt
              ? _stripGeneratedImageAltPrefix(altText)
              : altText,
            turnId,
          };
        }
      }
      if (isStreaming(lastAssistantTurn)) {
        postCompleteTextOnlyStart = null;
        textOnlySignature = null;
        const currentText = (lastAssistantTurn.innerText || "").trim();
        const threshold = hasPositiveIndicator(currentText)
          ? MIN_WAIT_WITH_POSITIVE_MS
          : MIN_WAIT_BEFORE_PATTERN_CHECK_MS;
        if (Date.now() - startTime > threshold) {
          const errorMatch = matchesAnyErrorPattern(currentText);
          if (errorMatch)
            return {
              success: false,
              error: errorMatch.error,
              text: errorMatch.text,
            };
        }
        await sleep(pollInterval);
        continue;
      }
      const pendingGenImg =
        _queryWithFallback("generated_image", null, {
          scope: lastAssistantTurn,
          silent: true,
        }) || _queryWithFallback("generated_image", null, { silent: true });
      const imgPending =
        pendingGenImg &&
        (!pendingGenImg.src || pendingGenImg.classList.contains("blur-2xl"));
      if (imgPending) {
        postCompleteTextOnlyStart = null;
        if (Date.now() - lastDiag > 3e3) {
          const reason = !pendingGenImg.src
            ? "src loading"
            : "blur-2xl transition";
          console.log(
            "[ChatGPT-detect] Pending img (" + reason + "):",
            pendingGenImg.alt?.slice(0, 40),
          );
          lastDiag = Date.now();
        }
        await sleep(pollInterval);
        continue;
      }
      const text = (lastAssistantTurn.innerText || "").trim();
      if (text.length > 20) {
        const errorMatch = matchesAnyErrorPattern(text);
        if (errorMatch) {
          console.log(
            "[ChatGPT-detect]",
            errorMatch.error,
            "(post-complete):",
            text.slice(0, 100),
          );
          return {
            success: false,
            error: errorMatch.error,
            text: errorMatch.text,
          };
        }
        const globalGenImg = _queryWithFallback("generated_image", null, {
          silent: true,
        });
        if (
          globalGenImg &&
          globalGenImg.src &&
          !globalGenImg.classList.contains("blur-2xl")
        ) {
          const fileIdMatch = globalGenImg.src.match(
            /[?&]id=(file_[a-z0-9]+)/i,
          );
          const fileId = fileIdMatch?.[1];
          const isNewImage =
            !baselineSources.has(globalGenImg.src) &&
            (!fileId || !baselineFileIds.has(fileId));
          if (isNewImage) {
            console.log(
              "[ChatGPT-detect] TEXT_ONLY avoided via global fallback \u2014 found new image:",
              globalGenImg.alt?.slice(0, 50),
            );
            postCompleteTextOnlyStart = null;
            await sleep(pollInterval);
            continue;
          }
        }
        if (_hasGeneratingIndicator()) {
          console.log(
            "[ChatGPT-detect] TEXT_ONLY avoided \u2014 global generating indicator present",
          );
          postCompleteTextOnlyStart = null;
          await sleep(pollInterval);
          continue;
        }
        const identity = _getConversationTurnIdentity(lastAssistantTurn);
        const path = `${window.location.origin}${window.location.pathname}`;
        const matchesConfiguredTextOnly = (_activePatterns.textOnly || []).some(
          (pattern) => pattern && text.toLowerCase().includes(pattern),
        );
        if (
          !matchesConfiguredTextOnly ||
          !identity ||
          !baseline.turnIds ||
          baseline.turnIds.has(identity) ||
          _queryResultImages(lastAssistantTurn).length ||
          _hasRealNewImage()
        ) {
          postCompleteTextOnlyStart = null;
          textOnlySignature = null;
          await sleep(pollInterval);
          continue;
        }
        const signature = JSON.stringify([identity, path, text]);
        if (
          postCompleteTextOnlyStart === null ||
          signature !== textOnlySignature
        ) {
          textOnlySignature = signature;
          postCompleteTextOnlyStart = Date.now();
        }
        if (Date.now() - postCompleteTextOnlyStart < POST_COMPLETE_GRACE_MS) {
          await sleep(pollInterval);
          continue;
        }
        if (
          isStreaming(lastAssistantTurn) ||
          _queryResultImages(lastAssistantTurn).length ||
          _hasRealNewImage()
        ) {
          postCompleteTextOnlyStart = null;
          textOnlySignature = null;
          await sleep(pollInterval);
          continue;
        }
        return textOnlyFailure(lastAssistantTurn, text, "configured_pattern");
      }
      postCompleteTextOnlyStart = null;
      textOnlySignature = null;
      await sleep(pollInterval);
    }
    const finalImg = _queryResultImages(document).length > 0;
    const finalLoadingIndicator = _hasGeneratingIndicator();
    const hasPendingImage = !!(finalImg || finalLoadingIndicator);
    if (hasPendingImage) {
      console.warn(
        "[ChatGPT-detect] TIMEOUT sau",
        timeout,
        "ms \u2014 c\xF3 image marker \u2192 extend grace \u0111\u1ED9ng (cap 240s, gen \u1EA3nh ch\u1EADm)",
      );
      const graceMaxDeadline = Date.now() + 24e4;
      let postGenGraceStart = null;
      while (Date.now() < graceMaxDeadline) {
        if (isAbortActive()) {
          await clickChatGPTStopButton();
          return {
            success: false,
            error: "ABORTED",
            message: "User stopped during grace",
          };
        }
        const alertError = _detectGenerationErrorAlert(baseline);
        if (alertError) return alertError;
        const baseIds = baseline.existingImageFileIds || new Set();
        const baseSources = baseline.existingImageSources || new Set();
        const configuredResults = new Set(Array.from(_queryGeneratedImages()));
        const isRealGen = (img) => {
          if (
            img.classList.contains("blur-2xl") ||
            !img.src ||
            baseSources.has(img.src)
          )
            return false;
          const a = img.getAttribute("alt") || "";
          if (!(
            configuredResults.has(img) ||
            _isGeneratedImageAlt(a) ||
            a === ""
          ))
            return false;
          const m = img.src.match(/[?&]id=(file_[a-z0-9]+)/i);
          if (m && baseIds.has(m[1])) return false;
          return true;
        };
        const genImgs = _queryResultImages(document).filter(isRealGen);
        if (genImgs.length > 0) {
          console.log(
            "[ChatGPT-detect] Image rendered trong grace period:",
            genImgs[0].src.slice(0, 80),
          );
          const dedup = [
            ...new Map(
              genImgs.map((img) => {
                const m = img.src.match(/[?&]id=(file_[a-z0-9]+)/i);
                return [m ? m[1] : img.src, img.src];
              }),
            ).values(),
          ];
          return {
            success: true,
            imageUrls: dedup,
            altPrompt: _stripGeneratedImageAltPrefix(genImgs[0].alt),
            turnId: null,
          };
        }
        if (!_hasGeneratingIndicator()) {
          if (!postGenGraceStart) {
            postGenGraceStart = Date.now();
          } else if (Date.now() - postGenGraceStart > 1e4) {
            console.warn(
              "[ChatGPT-detect] Grace: indicator t\u1EAFt + kh\xF4ng c\xF3 \u1EA3nh sau 10s \u2192 k\u1EBFt th\xFAc",
            );
            return { success: false, error: "TIMEOUT", hasPendingImage: false };
          }
        } else {
          postGenGraceStart = null;
        }
        await sleep(2e3);
      }
      console.warn(
        "[ChatGPT-detect] TIMEOUT sau grace 240s \u2014 image v\u1EABn pending, return v\u1EDBi hasPendingImage hint",
      );
      return { success: false, error: "TIMEOUT", hasPendingImage: true };
    }
    console.warn(
      "[ChatGPT-detect] TIMEOUT sau",
      timeout,
      "ms \u2014 kh\xF4ng c\xF3 image marker",
    );
    return { success: false, error: "TIMEOUT", hasPendingImage: false };
  }
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
      _selectorConfig = null;
      _selectorConfigTime = 0;
      console.log(
        "[ChatGPT] Provider config updated via SSE \u2014 selector cache invalidated",
      );
      sendResponse({ success: true });
      return false;
    }
    if (message.action === "chatgpt:ensureChatMode") {
      (async () => {
        try {
          if (
            !(await waitProviderReady(2e3, { requireHydrationControl: false }))
          ) {
            sendResponse({ success: true, editorPending: true });
            return;
          }
          const selected = await _ensureChatTabSelected();
          if (
            !selected ||
            !(await waitProviderReady(2e3, { requireHydrationControl: false }))
          ) {
            sendResponse({ success: true, editorPending: true });
            return;
          }
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({
            success: false,
            error: error?.message || "CHAT_MODE_NOT_READY",
          });
        }
      })();
      return true;
    }
    if (message.action === "chatgpt:submitAndWait") {
      __chatgptCallStartAt = Date.now();
      if (__chatgptAbort && __chatgptAbortAt < __chatgptCallStartAt - 5e3) {
        __chatgptAbort = false;
        __chatgptAbortAt = 0;
      }
      if (typeof message.settings?.scrollDuringGen === "boolean")
        _scrollDuringGen = message.settings.scrollDuringGen;
      __chatgptInputTimeoutMs = Number(message.inputTimeoutMs) || 1200;
      __chatgptMacroDelayMs = Math.round(__chatgptInputTimeoutMs * 0.7);
      console.log(
        "[ChatGPT] Timing \u2014 inputTimeout:",
        __chatgptInputTimeoutMs,
        "ms | macroDelay:",
        __chatgptMacroDelayMs,
        "ms (70%)",
      );
      const isTextMode =
        message.expectText === true || message.settings?.imageMode === false;
      console.log(
        "[ChatGPT-listener] chatgpt:submitAndWait nh\u1EADn, mode:",
        isTextMode ? "text" : "image",
        "text len:",
        (message.text || "").length,
        "images:",
        (message.images || []).length,
      );
      (async () => {
        try {
          await restoreTrackerSnapshot;
          const promptPreview = (message.text || "").substring(0, 50);
          FloatingTracker.show({
            current: 0,
            total: 1,
            phase: _i18n.t("preparing"),
            prompt: promptPreview,
            genMode: isTextMode ? "text" : "image",
          });
          ExecutionBlocker.show();
          if (detectChatGPTChallenge()) {
            FloatingTracker.update({ phase: _i18n.t("waitingVerification") });
            const resolved = await waitForChatGPTChallengeResolved(12e4);
            if (!resolved) {
              FloatingTracker.hide();
              ExecutionBlocker.hide();
              sendResponse({
                success: false,
                error: "CHALLENGE_TIMEOUT",
                message:
                  "ChatGPT requires verification. Please open the ChatGPT tab, complete verification, then run again.",
              });
              return;
            }
          }
          checkAbort("after-challenge-check");
          const providerReady = await waitProviderReady(12e3);
          if (!providerReady) {
            FloatingTracker.hide();
            ExecutionBlocker.hide();
            sendResponse({
              success: false,
              error: "EDITOR_NOT_FOUND",
              retryable: true,
              message: "ChatGPT composer is not interactive yet.",
            });
            return;
          }
          const retryConversationPath = message.settings?.retryConversationPath;
          if (
            retryConversationPath &&
            retryConversationPath !==
              `${window.location.origin}${window.location.pathname}`
          ) {
            sendResponse({
              success: false,
              error: "CONVERSATION_CHANGED",
              noRetry: true,
            });
            return;
          }
          const shouldNewChat = message.settings?.newChat !== false;
          let prevConvPath = null;
          if (shouldNewChat) {
            const currentPath = window.location.pathname;
            if (currentPath === "/" || currentPath === "") {
              console.log(
                "[ChatGPT] Already at homepage (new chat) \u2014 ch\u1EDD composer \u1ED5n \u0111\u1ECBnh tr\u01B0\u1EDBc upload ref/submit",
              );
              const _stable = await _waitComposerStable(6e3);
              if (!_stable) {
                FloatingTracker.hide();
                ExecutionBlocker.hide();
                sendResponse({
                  success: false,
                  error: "NEW_CHAT_NOT_READY",
                  retryable: true,
                  message: "ChatGPT new chat composer is not ready.",
                });
                return;
              }
            } else {
              prevConvPath = currentPath;
              console.log(
                "[ChatGPT] Not at homepage, trying clickNewChatAndWaitReady...",
              );
              const newChatReady = await clickNewChatAndWaitReady(8e3);
              if (!newChatReady) {
                FloatingTracker.hide();
                ExecutionBlocker.hide();
                sendResponse({
                  success: false,
                  error: "NEW_CHAT_NOT_READY",
                  retryable: true,
                  message: "ChatGPT could not open a new chat.",
                });
                return;
              }
            }
            checkAbort("after-new-chat");
            await sleep(getMacroDelay());
          }
          const newChatComposerReady = await waitProviderReady(12e3);
          if (!newChatComposerReady) {
            FloatingTracker.hide();
            ExecutionBlocker.hide();
            sendResponse({
              success: false,
              error: "EDITOR_NOT_FOUND",
              retryable: true,
              message: "ChatGPT new chat composer is not interactive yet.",
            });
            return;
          }
          const chatSelected = await _ensureChatTabSelected();
          if (!chatSelected || !(await waitProviderReady(12e3))) {
            FloatingTracker.hide();
            ExecutionBlocker.hide();
            sendResponse({
              success: false,
              error: "CHAT_MODE_NOT_READY",
              retryable: true,
              message: "ChatGPT could not switch to Chat mode.",
            });
            return;
          }
          if (!isTextMode) {
            const limitAlert = checkImageLimitAlert();
            if (limitAlert?.detected) {
              console.warn(
                "[ChatGPT-listener] LIMIT_ALERT detected \u2014 b\u1ECF qua submit:",
                limitAlert.message,
              );
              FloatingTracker.hide();
              ExecutionBlocker.hide();
              sendResponse({
                success: false,
                error: "LIMIT_ALERT",
                message: limitAlert.message,
              });
              return;
            }
          }
          const existingGenIndicator = _hasGeneratingIndicator();
          if (existingGenIndicator) {
            console.log(
              "[ChatGPT] \u0110ang c\xF3 image generation t\u1EEB task tr\u01B0\u1EDBc \u2014 ch\u1EDD ho\xE0n t\u1EA5t...",
            );
            const maxWaitGen = 12e4;
            const startWaitGen = Date.now();
            while (Date.now() - startWaitGen < maxWaitGen) {
              if (isAbortActive()) {
                FloatingTracker.hide();
                ExecutionBlocker.hide();
                sendResponse({
                  success: false,
                  error: "ABORTED",
                  message: "User stopped",
                });
                return;
              }
              const stillGen = _hasGeneratingIndicator();
              if (!stillGen) {
                console.log(
                  "[ChatGPT] Generation tr\u01B0\u1EDBc \u0111\xE3 ho\xE0n t\u1EA5t \u2014 ti\u1EBFp t\u1EE5c submit task m\u1EDBi",
                );
                break;
              }
              await sleep(1e3);
            }
            await sleep(500);
          }
          const baseline = snapshotConversationState();
          baseline.retryConversationPath =
            message.settings?.retryConversationPath || null;
          const expectedSubmitPath = window.location.pathname;
          let textToSubmit = message.text || "";
          if (isTextMode)
            console.log(
              "[PromptTextAudit]",
              JSON.stringify({
                stage: "chatgpt_received",
                ..._promptTextAudit(textToSubmit),
              }),
            );
          if (isTextMode) {
            try {
              await deactivateImageModeIfActive();
            } catch (e) {
              console.warn("[ChatGPT] deactivateImageMode error:", e?.message);
            }
            const enhancePrefix = await getEnhancePrefix();
            textToSubmit = enhancePrefix + textToSubmit;
            console.log(
              "[PromptTextAudit]",
              JSON.stringify({
                stage: "chatgpt_with_prefix",
                prefixChars: enhancePrefix.length,
                ..._promptTextAudit(textToSubmit),
              }),
            );
          }
          await removeExistingChatGPTRefImages();
          await sleep(200);
          let staleRefs = _countComposerRefImages();
          if (staleRefs > 0) {
            for (let i = 0; i < 3 && staleRefs > 0; i++) {
              await sleep(300);
              staleRefs = _countComposerRefImages();
            }
            if (staleRefs > 0) {
              console.warn(
                "[ChatGPT] Composer c\xF2n",
                staleRefs,
                "ref c\u0169 sau remove \u2014 retry remove",
              );
              await removeExistingChatGPTRefImages();
              await sleep(500);
              staleRefs = _countComposerRefImages();
            }
          }
          if (staleRefs > 0) {
            console.error(
              "[ChatGPT] COMPOSER_DIRTY \u2014 kh\xF4ng g\u1EE1 \u0111\u01B0\u1EE3c",
              staleRefs,
              "ref c\u0169 (selector remove_ref_image_button drift?)",
            );
            FloatingTracker.hide();
            ExecutionBlocker.hide();
            sendResponse({
              success: false,
              error: "COMPOSER_DIRTY",
              retryable: true,
              message: `Composer still has ${staleRefs} old ref(s) that cannot be removed \u2014 please reload the ChatGPT page.`,
            });
            return;
          }
          checkAbort("after-remove-refs");
          const draftEditor = _queryWithFallback("composer", null, {
            silent: true,
          });
          const draftText = (draftEditor?.textContent || "").trim();
          const draftPill = draftEditor
            ? _queryWithFallback("image_mode_pill", null, {
                scope: draftEditor,
                silent: true,
              }) || draftEditor.querySelector("[data-inline-selection-pill]")
            : null;
          console.log("[ChatGPTComposerAudit] draft preflight", {
            hasEditor: !!draftEditor,
            hasModePill: !!draftPill,
            draftLength: draftText.length,
          });
          if (draftEditor && draftText.length > 0 && !draftPill) {
            console.log(
              "[ChatGPT] Draft c\u0169 trong composer (len=" +
                draftText.length +
                ', head="' +
                draftText.slice(0, 30) +
                '") \u2014 clear tr\u01B0\u1EDBc activate image mode',
            );
            try {
              draftEditor.focus();
              await sleep(100);
              document.execCommand("selectAll", false, null);
              await sleep(50);
              document.execCommand("delete", false, null);
              await sleep(100);
              if ((draftEditor.textContent || "").trim().length > 0) {
                draftEditor.innerHTML =
                  '<p><br class="ProseMirror-trailingBreak"></p>';
                draftEditor.dispatchEvent(
                  new InputEvent("input", {
                    bubbles: true,
                    inputType: "deleteContent",
                  }),
                );
                await sleep(80);
              }
              console.log(
                "[ChatGPT] Draft clear xong, editor len=" +
                  (draftEditor.textContent || "").trim().length,
              );
            } catch (e) {
              console.warn(
                "[ChatGPT] Draft clear l\u1ED7i (non-fatal):",
                e.message,
              );
            }
          }
          if (message.settings?.model) {
            const modelSelected = await selectChatGPTModelBestEffort(
              message.settings.model,
              "ChatGPT",
            );
            checkAbort("after-select-model");
            if (modelSelected) await sleep(getMacroDelay());
          }
          if (Array.isArray(message.images) && message.images.length > 0) {
            const uploaded = await injectRefImages(message.images);
            if (!uploaded) {
              sendResponse({
                success: false,
                error: "REF_UPLOAD_FAILED",
                message: `Cannot upload ref image to ChatGPT (${_chatgptRefUploadFailure || "UNKNOWN"})`,
              });
              return;
            }
            checkAbort("after-upload-refs");
            await sleep(150);
          }
          if (!isTextMode && message.settings?.imageMode) {
            const ratio = message.settings?.ratio || "1:1";
            let activated = false;
            if (message.settings?.skipImageToggle) {
              console.log(
                "[ChatGPT] skipImageToggle \u2014 b\u1ECF qua toggle Create image, d\xF9ng fallback prefix",
              );
            } else {
              console.log(
                "[ChatGPT] Activating image mode v\u1EDBi ratio:",
                ratio,
              );
              activated = await activateImageMode(ratio);
            }
            if (!activated) {
              if (!message.settings?.skipImageToggle)
                console.warn(
                  "[ChatGPT] Kh\xF4ng th\u1EC3 activate image mode \u2014 s\u1EBD d\xF9ng fallback prefix",
                );
              if (message.settings?.fallbackPrefix) {
                textToSubmit = message.settings.fallbackPrefix + textToSubmit;
              }
            }
            const _ratioSuffix = ratioToPromptSuffix(ratio);
            if (_ratioSuffix) {
              textToSubmit = textToSubmit + _ratioSuffix;
              console.log(
                "[ChatGPT] Ratio nh\xFAng v\xE0o prompt:",
                _ratioSuffix.trim(),
              );
            }
            checkAbort("after-activate-image-mode");
            await sleep(getMacroDelay());
          }
          const _pathNow = window.location.pathname;
          const _yankedBack =
            (prevConvPath && _pathNow === prevConvPath) ||
            (shouldNewChat && _pathNow !== expectedSubmitPath);
          if (_yankedBack) {
            console.error(
              "[ChatGPT] SPA nh\u1EA3y v\u1EC1 conversation kh\xE1c (" +
                _pathNow +
                ", expected " +
                expectedSubmitPath +
                ") \u2014 ch\u1EDD stream c\u0169 (magnet) k\u1EBFt th\xFAc r\u1ED3i y\xEAu c\u1EA7u reload",
            );
            const _t0 = Date.now();
            while (Date.now() - _t0 < 12e4 && _hasGeneratingIndicator()) {
              if (isAbortActive()) {
                FloatingTracker.hide();
                ExecutionBlocker.hide();
                sendResponse({
                  success: false,
                  error: "ABORTED",
                  message: "User stopped",
                });
                return;
              }
              await sleep(1e3);
            }
            FloatingTracker.hide();
            ExecutionBlocker.hide();
            sendResponse({
              success: false,
              error: "SUBMIT_FAILED_NEED_RELOAD",
              reason: "YANKED",
              retryable: true,
              message:
                "ChatGPT jumped back to an old chat (stream running) \u2014 waited for stream to finish, please reload and retry.",
            });
            return;
          }
          const submitOk = await injectTextAndSubmit(textToSubmit, baseline);
          if (submitOk === false) {
            console.error(
              "[ChatGPT] Submit fail to\xE0n b\u1ED9 tier \u2014 y\xEAu c\u1EA7u reload trang \u0111\u1EC3 retry",
            );
            FloatingTracker.hide();
            ExecutionBlocker.hide();
            sendResponse({
              success: false,
              error: "SUBMIT_FAILED_NEED_RELOAD",
              retryable: true,
              message:
                "Could not send prompt (ChatGPT page in a bad state) \u2014 please reload the page.",
            });
            return;
          }
          checkAbort("before-wait-result");
          FloatingTracker.update({
            current: 0,
            total: 1,
            phase: _i18n.t("waitingResult"),
            prompt: promptPreview,
          });
          const timeout = message.timeout || (isTextMode ? 6e4 : 3e5);
          FloatingTracker.setProviderProgress?.(null);
          const result = isTextMode
            ? await waitForTextResult(baseline, timeout)
            : await waitForImageResult(baseline, timeout);
          FloatingTracker.setProviderProgress?.(null);
          FloatingTracker.hide();
          ExecutionBlocker.hide();
          sendResponse(result);
        } catch (err) {
          FloatingTracker.hide();
          ExecutionBlocker.hide();
          if (err.message && err.message.startsWith("ABORTED")) {
            const stage = err.message.replace("ABORTED:", "");
            console.log(
              "[ChatGPT] Caught ABORT at stage:",
              stage,
              "\u2192 clicking Stop button",
            );
            await clickChatGPTStopButton();
            sendResponse({
              success: false,
              error: "ABORTED",
              message: "User stopped at " + stage,
            });
            return;
          }
          sendResponse({
            success: false,
            noRetry: err.noRetry === true,
            error:
              err.code ||
              (["COMPOSER_DIRTY", "EDITOR_TEXT_MISMATCH"].includes(err.message)
                ? "COMPOSER_DIRTY"
                : "EXCEPTION"),
            message: err.message || "Unknown error",
          });
        } finally {
          FloatingTracker.hide();
          ExecutionBlocker.hide();
        }
      })();
      return true;
    }
    if (message.action === "provider:textTask") {
      __chatgptCallStartAt = Date.now();
      __chatgptAbort = false;
      __chatgptAbortAt = 0;
      ExecutionBlocker.show();
      (async () => {
        try {
          const readinessTimeout = message.tabFreshlyCreated ? 3e4 : 12e3;
          if (
            typeof detectChatGPTChallenge === "function" &&
            detectChatGPTChallenge()
          ) {
            const resolved = await waitForChatGPTChallengeResolved(12e4);
            if (!resolved) {
              sendResponse({ success: false, error: "CHALLENGE_TIMEOUT" });
              return;
            }
          }
          if (!(await waitProviderReady(readinessTimeout))) {
            console.warn(
              "[ChatGPT-i2p] Composer ch\u01B0a interactive sau readiness window",
              {
                timeoutMs: readinessTimeout,
                freshTab: !!message.tabFreshlyCreated,
                path: window.location.pathname,
                readyState: document.readyState,
              },
            );
            sendResponse({
              success: false,
              error: "EDITOR_NOT_FOUND",
              retryable: true,
              message: "ChatGPT composer is not interactive yet.",
            });
            return;
          }
          let isolated = !message.newChat;
          if (message.newChat) {
            try {
              isolated = await clickNewChatAndWaitReady(8e3);
            } catch (_) {
              isolated = false;
            }
            if (!isolated) {
              console.warn(
                "[ChatGPT-i2p] New chat ch\u01B0a settle sau 8s \u2192 ch\u1EDD th\xEAm 1 nh\u1ECBp",
              );
              try {
                isolated = await clickNewChatAndWaitReady(8e3);
              } catch (_) {
                isolated = false;
              }
              if (!isolated) {
                sendResponse({
                  success: false,
                  error: "NEW_CHAT_NOT_READY",
                  retryable: true,
                  message:
                    "ChatGPT page has not finished opening the new chat \u2014 please retry.",
                });
                return;
              }
            }
          }
          if (!(await waitProviderReady(readinessTimeout))) {
            sendResponse({
              success: false,
              error: "EDITOR_NOT_FOUND",
              retryable: true,
              message: "ChatGPT new chat composer is not interactive yet.",
            });
            return;
          }
          const chatSelected = await _ensureChatTabSelected();
          if (!chatSelected || !(await waitProviderReady(readinessTimeout))) {
            sendResponse({
              success: false,
              error: "CHAT_MODE_NOT_READY",
              retryable: true,
              message: "ChatGPT could not switch to Chat mode.",
            });
            return;
          }
          const baseline = snapshotConversationState();
          try {
            await deactivateImageModeIfActive();
          } catch (_) {}
          await removeExistingChatGPTRefImages();
          await sleep(200);
          if (message.model) {
            await selectChatGPTModelBestEffort(message.model, "ChatGPT-i2p");
          }
          if (Array.isArray(message.images) && message.images.length > 0) {
            const up = await injectRefImages(message.images);
            if (!up) {
              sendResponse({
                success: false,
                error: "IMAGE_UPLOAD_FAILED",
                message: `Cannot upload ref image to ChatGPT (${_chatgptRefUploadFailure || "UNKNOWN"})`,
              });
              return;
            }
            await sleep(250);
          }
          const submitOk = await injectTextAndSubmit(
            message.text || "",
            baseline,
          );
          if (submitOk === false) {
            sendResponse({
              success: false,
              error: "SUBMIT_FAILED",
              retryable: true,
              message:
                "ChatGPT editor re-rendered mid-way \u2014 prompt not sent, please retry.",
            });
            return;
          }
          const result = await waitForTextResult(
            baseline,
            message.timeout || 9e4,
          );
          if (message.deleteAfter && result?.success && isolated) {
            result.cleanupEligible = true;
            result.cleanupConversationUrl = location.href;
          } else if (message.deleteAfter && result?.success && !isolated) {
            console.warn(
              "[ChatGPT-i2p] skip deleteAfter \u2014 ch\u01B0a m\u1EDF \u0111\u01B0\u1EE3c chat m\u1EDBi (tr\xE1nh \u0111\u1EE5ng chat user)",
            );
          }
          sendResponse(result);
        } catch (err) {
          sendResponse({
            success: false,
            error: ["COMPOSER_DIRTY", "EDITOR_TEXT_MISMATCH"].includes(
              err.message,
            )
              ? "COMPOSER_DIRTY"
              : "EXCEPTION",
            message: err.message || String(err),
          });
        } finally {
          ExecutionBlocker.hide();
        }
      })();
      return true;
    }
    if (message.action === "chatgpt:abort") {
      if (
        Number.isFinite(message.requestedAt) &&
        __chatgptCallStartAt > message.requestedAt
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
      __chatgptAbort = true;
      __chatgptAbortAt = Date.now();
      console.log(
        "[ChatGPT-listener] chatgpt:abort received \u2192 set abort flag at",
        __chatgptAbortAt,
      );
      FloatingTracker.hide();
      ExecutionBlocker.hide();
      const callStart = __chatgptCallStartAt;
      (async () => {
        const stopClicked = await clickChatGPTStopButton();
        const superseded = __chatgptCallStartAt !== callStart;
        const providerStopped =
          !!_getDynamicSelector("stop_button")?.selectors?.length &&
          !superseded &&
          stopClicked &&
          !_queryWithFallback("stop_button");
        console.log("[ChatGPT] abort confirmation", {
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
    if (message.action === "chatgpt:deleteLastMessage") {
      if (
        message.expectedConversationUrl &&
        location.href !== message.expectedConversationUrl
      ) {
        sendResponse({ success: false, error: "CONVERSATION_CHANGED" });
        return false;
      }
      (async () => {
        try {
          const result = await deleteLastAssistantMessage(null, message);
          sendResponse(result);
        } catch (err) {
          console.error("[ChatGPT-listener] deleteLastMessage error:", err);
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }
    return false;
  });
  let _lastUrl = location.href;
  const _notifyNavigate = () => {
    if (location.href !== _lastUrl) {
      _lastUrl = location.href;
      try {
        chrome.runtime
          .sendMessage({ action: "chatgpt:navigated", url: location.href })
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
    "[ChatAI] Content script ChatGPT \u0111\xE3 \u0111\u01B0\u1EE3c inject (Phase X + CG-2 + CG-3)",
  );
})();
