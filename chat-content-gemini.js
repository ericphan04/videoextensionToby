(function () {
  if (
    window._tobyflowGeminiInjected &&
    window._tobyflowGeminiRuntimeId === chrome.runtime.id &&
    window._tobyflowGeminiListenerReady === true
  )
    return;
  window._tobyflowGeminiInjected = true;
  window._tobyflowGeminiRuntimeId = chrome.runtime.id;
  window._tobyflowGeminiListenerReady = false;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let __geminiAbort = false;
  let __geminiAbortAt = 0;
  let __geminiCallStartAt = 0;
  let __geminiSelectedMediaTool = null;
  function isGeminiAbort() {
    return __geminiAbort && __geminiAbortAt >= __geminiCallStartAt;
  }
  let FloatingTracker = null;
  function ensureGeminiFloatingTracker() {
    if (FloatingTracker?.updateFromQueue) return FloatingTracker;
    if (typeof window.createFloatingTrackerRich !== "function") return null;
    FloatingTracker = window.createFloatingTrackerRich({
      id: "tobyflow-gemini-tracker",
      title: "Gemini",
      onSkipBlocker: () => {
        try {
          ExecutionBlocker.hide();
        } catch (_) {}
      },
    });
    return FloatingTracker;
  }
  ensureGeminiFloatingTracker();
  let _ftRichActive = false;
  let workflowTrackerData = { jobs: [] };
  let queueTrackerData = { jobs: [] };
  function renderGeminiTracker() {
    const jobs = [
      ...(queueTrackerData.jobs || []),
      ...(workflowTrackerData.jobs || []),
    ];
    const isRunning = jobs.some((job) =>
      ["running", "paused"].includes(job.status),
    );
    _ftRichActive = isRunning;
    ensureGeminiFloatingTracker()?.updateFromQueue({
      jobs,
      isRunning,
      total: jobs.reduce((n, job) => n + (job.total || 0), 0),
      completed: jobs.reduce((n, job) => n + (job.completed || 0), 0),
    });
  }
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
      style.id = "tobyflow-gemini-blocker-styles";
      style.textContent =
        "@keyframes tobyflow-glow-pulse{0%,100%{opacity:0.4}50%{opacity:0.7}}#tobyflow-gemini-blocker{position:fixed;inset:0;z-index:2147483646;pointer-events:none;background:transparent;}#tobyflow-gemini-blocker::before{content:'';position:absolute;inset:0;border:5px solid #cdff01;box-shadow:inset 0 0 0 2px rgba(205,255,1,0.5),inset 0 0 15px rgba(205,255,1,0.3),0 0 15px rgba(205,255,1,0.5),0 0 35px rgba(205,255,1,0.35),0 0 60px rgba(205,255,1,0.2),0 0 100px rgba(205,255,1,0.1);animation:tobyflow-glow-pulse 1.8s ease-in-out infinite;will-change:opacity;pointer-events:none;}";
      document.head.appendChild(style);
      this._styleEl = style;
    },
    _blockEvent(e) {
      if (!ExecutionBlocker._blocking) return;
      if (!e.isTrusted) return;
      if (e.target?.closest?.("#tobyflow-gemini-tracker")) return;
      if (e.type === "keydown" && e.key === "Escape") {
        ExecutionBlocker._escapeCount++;
        clearTimeout(ExecutionBlocker._escapeTimer);
        ExecutionBlocker._escapeTimer = setTimeout(() => {
          ExecutionBlocker._escapeCount = 0;
        }, 2e3);
        if (ExecutionBlocker._escapeCount >= 3) {
          console.warn("[Gemini-ExecutionBlocker] Force hide via Escape x3");
          ExecutionBlocker._escapeCount = 0;
          ExecutionBlocker.hide();
          __geminiAbort = true;
          __geminiAbortAt = Date.now();
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
      [
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
      ].forEach((evt) =>
        document.addEventListener(evt, this._blockEvent, {
          capture: true,
          passive: false,
        }),
      );
    },
    _detachBlockers() {
      if (!this._blocking) return;
      this._blocking = false;
      [
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
      ].forEach((evt) =>
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
      el.id = "tobyflow-gemini-blocker";
      document.body.appendChild(el);
      this._el = el;
    },
    _startTimeout() {
      this._stopTimeout();
      this._timeoutId = setTimeout(() => {
        console.warn("[Gemini-ExecutionBlocker] Auto-timeout, force hiding");
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
  const PROVIDER = "gemini";
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
  let _overlayLocale = "vi";
  ConfigSnapshotAccess.read(["af_locale", "af_settings"], (r) => {
    _overlayLocale =
      r.af_locale || (r.af_settings && r.af_settings.language) || "vi";
  });
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
    const lang = _overlayLocale || "vi";
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
    const _lang = _overlayLocale || "vi";
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
  function _queryWithFallback(key, defaultSelectors = null) {
    const config = _getDynamicSelector(key);
    const hardcoded = defaultSelectors || [];
    const isDynamic = config?.selectors?.length > 0;
    const selectors = isDynamic ? config.selectors : hardcoded;
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
    console.log(`[Selector:${PROVIDER}:${key}] \u274C No match`);
    return null;
  }
  function _queryAllWithFallback(key, defaultSelectors = null) {
    const config = _getDynamicSelector(key);
    const hardcoded = defaultSelectors || [];
    const selectors =
      config?.selectors?.length > 0 ? config.selectors : hardcoded;
    for (let i = 0; i < selectors.length; i++) {
      try {
        const els = document.querySelectorAll(selectors[i]);
        if (els.length > 0) return els;
      } catch (e) {}
    }
    return [];
  }
  function getGeminiComposerUploadedImages() {
    const composer = _queryWithFallback("composer");
    const primaryUploaded = Array.from(_queryAllWithFallback("uploaded_image"));
    const uploaded =
      primaryUploaded.length > 0
        ? primaryUploaded
        : Array.from(_queryAllWithFallback("image_preview"));
    if (!composer || uploaded.length === 0) return uploaded;
    const scopes = Array.from(_queryAllWithFallback("input_area_container"));
    const scope = scopes.find(
      (candidate) => candidate === composer || candidate.contains(composer),
    );
    return scope ? uploaded.filter((image) => scope.contains(image)) : [];
  }
  function resolveGeminiTextEditor(candidate) {
    if (!candidate) return null;
    if (candidate.tagName === "TEXTAREA" || candidate.isContentEditable)
      return candidate;
    return (
      Array.from(candidate.getElementsByTagName("*")).find(
        (child) => child.tagName === "TEXTAREA" || child.isContentEditable,
      ) || null
    );
  }
  async function clearGeminiComposerDraft() {
    const clearStartedAt = Date.now();
    const editor = resolveGeminiTextEditor(_queryWithFallback("composer"));
    if (!editor) return { success: false, error: "COMPOSER_NOT_FOUND" };
    const before = (
      editor.tagName === "TEXTAREA" ? editor.value : editor.textContent || ""
    ).trim();
    if (!before) return { success: true, cleared: false };
    editor.focus();
    if (editor.tagName === "TEXTAREA") {
      editor.value = "";
    } else {
      const paragraph = document.createElement("p");
      paragraph.appendChild(document.createElement("br"));
      editor.replaceChildren(paragraph);
    }
    editor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "deleteContentBackward",
        data: null,
      }),
    );
    await sleep(250);
    const after = (
      editor.tagName === "TEXTAREA" ? editor.value : editor.textContent || ""
    ).trim();
    console.info(
      "[GeminiComposerClearAudit]",
      JSON.stringify({
        beforeChars: before.length,
        afterChars: after.length,
        elapsedMs: Date.now() - clearStartedAt,
      }),
    );
    return after
      ? {
          success: false,
          error: "COMPOSER_CLEAR_NOT_CONFIRMED",
          beforeLength: before.length,
          afterLength: after.length,
        }
      : { success: true, cleared: true, beforeLength: before.length };
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
        result?.toby_provider_api_configs?.data?.gemini?.configs
          ?.ai_agent_prefix;
      if (!prefixMap || typeof prefixMap !== "object") {
        console.warn(
          "[AI Agent] ai_agent_prefix config missing for gemini \u2014 skip prefix wrap (raw prompt)",
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
  function detectGeminiChallenge() {
    return !!_queryWithFallback("cloudflare_iframe");
  }
  async function waitForGeminiChallengeResolved(timeoutMs = 12e4) {
    if (!detectGeminiChallenge()) return true;
    console.warn(
      "[Gemini] Challenge detected \u2014 request tab activate + ch\u1EDD user verify",
    );
    try {
      await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            action: "gemini:ensureActive",
            focusWindow: true,
            reason: "challenge",
          },
          () => resolve(),
        );
      });
    } catch (_) {}
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (!detectGeminiChallenge()) {
        await sleep(800);
        return true;
      }
      await sleep(800);
    }
    return false;
  }
  function simulateClick(el) {
    const rect = el.getBoundingClientRect();
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
  async function waitProviderReady(timeoutMs = 12e3) {
    const dl = Date.now() + timeoutMs;
    while (Date.now() < dl) {
      if (isGeminiAbort()) return false;
      if (document.readyState === "complete") {
        const composer = _queryWithFallback("composer");
        if (
          composer &&
          composer.getAttribute("aria-disabled") !== "true" &&
          !composer.closest('[aria-busy="true"]')
        ) {
          await sleep(250);
          return true;
        }
      }
      await sleep(250);
    }
    return false;
  }
  async function tryGeminiNewChat(timeoutMs = 6e3) {
    const btn = _queryWithFallback("new_chat_button");
    if (!btn) {
      console.warn(
        "[Gemini-newchat] new_chat_button ch\u01B0a seed \u2014 submit v\xE0o chat hi\u1EC7n t\u1EA1i",
      );
      return false;
    }
    const previousResponses = new Set(
      _queryAllWithFallback("media_response_container"),
    );
    const previousPath = `${location.origin}${location.pathname}`;
    try {
      simulateClick(btn);
    } catch (_) {
      return false;
    }
    const start = Date.now();
    let lastState = null;
    let draftClearAttempted = false;
    while (Date.now() - start < timeoutMs) {
      if (isGeminiAbort()) return false;
      await sleep(250);
      const composer = _queryWithFallback("composer");
      const cleanRefs = getGeminiComposerUploadedImages().length === 0;
      const cleanDraft = !(
        composer?.textContent ||
        composer?.value ||
        ""
      ).trim();
      const currentResponses = Array.from(
        _queryAllWithFallback("media_response_container"),
      );
      const isolated =
        `${location.origin}${location.pathname}` !== previousPath ||
        currentResponses.every((response) => !previousResponses.has(response));
      lastState = {
        elapsedMs: Date.now() - start,
        hasComposer: !!composer,
        cleanRefs,
        cleanDraft,
        pathChanged: `${location.origin}${location.pathname}` !== previousPath,
        previousResponseCount: previousResponses.size,
        currentResponseCount: currentResponses.length,
        retainedResponseCount: currentResponses.filter((response) =>
          previousResponses.has(response),
        ).length,
      };
      if (composer && cleanRefs && cleanDraft && isolated) {
        const stablePath = `${location.origin}${location.pathname}`;
        await sleep(500);
        if (`${location.origin}${location.pathname}` === stablePath)
          return true;
      }
      if (composer && !cleanDraft && !draftClearAttempted) {
        draftClearAttempted = true;
        const cleared = await clearGeminiComposerDraft();
        console.warn("[Gemini-newchat] retained draft clear attempt", cleared);
      }
    }
    console.warn("[Gemini-newchat] isolation timeout", lastState);
    return false;
  }
  function findGeminiDeleteConfirmation() {
    const candidates = [];
    for (const dialog of _queryAllWithFallback("delete_confirm_dialog")) {
      if (queryAllIn(dialog, "delete_confirm_identity").length !== 1) continue;
      const buttons = queryAllIn(dialog, "delete_confirm_action");
      if (
        buttons.length !== 1 ||
        buttons[0].disabled ||
        buttons[0].getAttribute("aria-disabled") === "true"
      )
        continue;
      candidates.push(buttons[0]);
    }
    return candidates.length === 1 ? candidates[0] : null;
  }
  async function deleteCurrentConversation(options = {}) {
    const expectedUrl = options.expectedConversationUrl || location.href;
    const deadline = Number.isFinite(options.cleanupDeadline)
      ? options.cleanupDeadline
      : Date.now() + 1e4;
    const callStartedAt = __geminiCallStartAt;
    const assertCurrent = () => {
      if (Date.now() >= deadline) throw new Error("CLEANUP_DEADLINE_EXCEEDED");
      if (location.href !== expectedUrl)
        throw new Error("CONVERSATION_CHANGED");
      if (callStartedAt !== __geminiCallStartAt || isGeminiAbort())
        throw new Error("CLEANUP_CANCELLED");
    };
    try {
      assertCurrent();
      console.log("[Gemini-delete] started", {
        budgetMs: deadline - Date.now(),
        visibility: document.visibilityState,
      });
      const actionsBtn = _queryWithFallback("conversation_actions_menu");
      if (!actionsBtn) {
        console.warn(
          "[Gemini-delete] conversation_actions_menu selector kh\xF4ng match \u2014 sidebar collapsed ho\u1EB7c DOM changed",
        );
        return false;
      }
      console.log("[Gemini-delete] Clicking actions menu button...");
      assertCurrent();
      simulateClick(actionsBtn);
      await sleep(500);
      let deleteItem = null;
      const menuTimeout = Date.now() + 3e3;
      while (Date.now() < menuTimeout) {
        assertCurrent();
        deleteItem = _queryWithFallback("delete_menu_item");
        if (deleteItem) break;
        await sleep(200);
      }
      if (!deleteItem) {
        console.warn(
          "[Gemini-delete] delete_menu_item selector kh\xF4ng match",
        );
        document.body.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
        return false;
      }
      console.log("[Gemini-delete] Clicking Delete menu item...");
      assertCurrent();
      simulateClick(deleteItem);
      await sleep(500);
      const confirmTimeout = Date.now() + 3e3;
      let confirmBtn = null;
      while (Date.now() < confirmTimeout) {
        assertCurrent();
        confirmBtn = findGeminiDeleteConfirmation();
        if (confirmBtn) break;
        await sleep(200);
      }
      if (!confirmBtn) {
        console.warn(
          "[Gemini-delete] delete dialog identity/action missing or ambiguous",
        );
        document.body.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
        return false;
      }
      console.log("[Gemini-delete] Clicking confirm button...");
      assertCurrent();
      simulateClick(confirmBtn);
      await sleep(500);
      while (Date.now() < deadline) {
        if (location.href !== expectedUrl) {
          console.log("[Gemini-delete] deletion navigation observed");
          return true;
        }
        if (callStartedAt !== __geminiCallStartAt || isGeminiAbort())
          return false;
        await sleep(200);
      }
      console.warn(
        "[Gemini-delete] confirmation clicked but deletion not confirmed before deadline",
      );
      return false;
    } catch (err) {
      console.error("[Gemini-delete] L\u1ED7i khi x\xF3a conversation:", err);
      return false;
    }
  }
  async function waitGeminiUploadDone(timeoutMs = 2e4) {
    const cfg = _getDynamicSelector("upload_in_progress");
    if (!cfg?.selectors?.length) {
      console.warn(
        "[Gemini-upload] upload_in_progress config miss \u2192 fallback wait 2s",
      );
      await sleep(2e3);
      return true;
    }
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (isGeminiAbort()) return false;
      const loading = _queryWithFallback("upload_in_progress", null, {
        silent: true,
      });
      if (!loading) {
        await sleep(200);
        const recheck = _queryWithFallback("upload_in_progress", null, {
          silent: true,
        });
        if (!recheck) {
          console.log(
            "[Gemini-upload] \u2705 done sau",
            Date.now() - start,
            "ms",
          );
          return true;
        }
      }
      await sleep(300);
    }
    console.warn(
      "[Gemini-upload] waitGeminiUploadDone timeout sau",
      timeoutMs,
      "ms (chip v\u1EABn .loading) \u2192 submit anyway",
    );
    return false;
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
  async function uploadImages(images) {
    reportGenLocalRefUpload(images, true);
    try {
      if (!images || images.length === 0) return true;
      const files = images.map((img) => {
        const binary = atob(img.base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new File([bytes], img.name || "image.png", {
          type: img.type || "image/png",
        });
      });
      console.log(
        "[ChatAI] Gemini: B\u1EAFt \u0111\u1EA7u upload",
        files.length,
        "\u1EA3nh",
      );
      const previewCountBefore = getGeminiComposerUploadedImages().length;
      const waitPreview = async (ms) => {
        const n = Math.max(1, Math.ceil(ms / 300));
        for (let i = 0; i < n; i++) {
          await sleep(300);
          if (isGeminiAbort()) return false;
          if (
            getGeminiComposerUploadedImages().length - previewCountBefore >=
            files.length
          )
            return true;
        }
        return false;
      };
      const setFileInput = (inp) => {
        const dt = new DataTransfer();
        files.forEach((f) => dt.items.add(f));
        inp.files = dt.files;
        inp.dispatchEvent(new Event("change", { bubbles: true }));
        inp.dispatchEvent(new Event("input", { bubbles: true }));
      };
      let fileInput = _queryWithFallback("file_input");
      const attachBtn = _queryWithFallback("add_button");
      if (!fileInput && attachBtn) {
        console.log("[ChatAI] Gemini: Click add_button t\xECm file input");
        simulateClick(attachBtn);
        await sleep(500);
        fileInput = _queryWithFallback("file_input");
        document.activeElement?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
        await sleep(200);
      }
      if (fileInput) {
        console.log("[ChatAI] Gemini: Upload qua file input");
        setFileInput(fileInput);
        if (await waitPreview(7e3)) {
          console.log(
            "[ChatAI] Gemini: Upload th\xE0nh c\xF4ng via file input",
          );
          return await waitGeminiUploadDone(2e4);
        }
      }
      console.log("[ChatAI] Gemini: Th\u1EED paste qua clipboard");
      const editor = _queryWithFallback("composer") || document.activeElement;
      if (editor) {
        editor.focus();
        await sleep(200);
        const dt = new DataTransfer();
        files.forEach((f) => dt.items.add(f));
        const pasteEvent = new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: dt,
        });
        editor.dispatchEvent(pasteEvent);
        if (await waitPreview(9e3)) {
          console.log("[ChatAI] Gemini: Upload th\xE0nh c\xF4ng via paste");
          return await waitGeminiUploadDone(2e4);
        }
      }
      console.log("[ChatAI] Gemini: Th\u1EED drag & drop");
      const dropTarget =
        _queryWithFallback("composer") ||
        _queryWithFallback("input_area_container");
      if (dropTarget) {
        const dt = new DataTransfer();
        files.forEach((f) => dt.items.add(f));
        dropTarget.dispatchEvent(
          new DragEvent("dragenter", { bubbles: true, dataTransfer: dt }),
        );
        await sleep(100);
        dropTarget.dispatchEvent(
          new DragEvent("dragover", {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
          }),
        );
        await sleep(100);
        dropTarget.dispatchEvent(
          new DragEvent("drop", {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
          }),
        );
        if (await waitPreview(9e3)) {
          console.log(
            "[ChatAI] Gemini: Upload th\xE0nh c\xF4ng via drag & drop",
          );
          return await waitGeminiUploadDone(2e4);
        }
      }
      console.error(
        "[ChatAI] Kh\xF4ng th\u1EC3 upload \u1EA3nh l\xEAn Gemini - vui l\xF2ng upload th\u1EE7 c\xF4ng",
      );
      return false;
    } finally {
      reportGenLocalRefUpload(images, false);
    }
  }
  function readGeminiComposerText(editor) {
    const paragraphs = Array.from(editor?.children || []);
    const readNode = (node) =>
      node.nodeType === 3
        ? node.nodeValue || ""
        : node.tagName === "BR"
          ? "\n"
          : Array.from(node.childNodes || [])
              .map(readNode)
              .join("");
    const value =
      editor?.tagName === "TEXTAREA"
        ? editor.value
        : paragraphs.length && paragraphs.every((node) => node.tagName === "P")
          ? paragraphs
              .map((node) => {
                const text = readNode(node);
                return text === "\n" ? "" : text;
              })
              .join("\n")
          : typeof editor?.innerText === "string"
            ? editor.innerText
            : editor?.textContent;
    return String(value || "")
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0/g, " ")
      .replace(/\n+$/, "");
  }
  let lastGeminiInsertAudit = null;
  async function insertText(text) {
    const insertStartedAt = Date.now();
    lastGeminiInsertAudit = {
      stage: "find_editor",
      expectedChars: String(text || "").length,
    };
    console.log("[ChatAI] Gemini: Nh\u1EADp text");
    let editor = resolveGeminiTextEditor(_queryWithFallback("composer"));
    if (!editor) {
      lastGeminiInsertAudit.stage = "editor_not_found";
      await sleep(500);
      editor = resolveGeminiTextEditor(_queryWithFallback("composer"));
    }
    if (!editor) {
      console.error(
        "[ChatAI] Kh\xF4ng t\xECm th\u1EA5y \xF4 nh\u1EADp text tr\xEAn Gemini",
      );
      return false;
    }
    editor.focus();
    await sleep(200);
    if (isGeminiAbort()) return false;
    if (editor.tagName === "TEXTAREA") {
      editor.value = text;
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
      const before = readGeminiComposerText(editor);
      const escaped = String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\r\n?/g, "\n");
      const html = `<p style="white-space:pre-wrap">${escaped}</p>`;
      const editStartedAt = Date.now();
      const commandAccepted = document.execCommand("insertHTML", false, html);
      lastGeminiInsertAudit = {
        stage: "browser_edit",
        commandAccepted,
        beforeChars: before.length,
        expectedChars: text.length,
        elapsedMs: Date.now() - editStartedAt,
      };
      if (!commandAccepted) return false;
      console.info("[GeminiComposerAudit] Browser fragment inserted", {
        chars: text.length,
        elapsedMs: Date.now() - editStartedAt,
      });
      editor.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertFromPaste",
          data: null,
        }),
      );
      await sleep(200);
      const actual = readGeminiComposerText(editor);
      const expected = String(text || "")
        .replace(/\r\n?/g, "\n")
        .replace(/\u00a0/g, " ")
        .replace(/\n+$/, "");
      const complete = actual === expected || actual === before + expected;
      const intended =
        before && actual !== expected ? before + expected : expected;
      let firstMismatch = 0;
      while (
        firstMismatch < Math.min(actual.length, intended.length) &&
        actual[firstMismatch] === intended[firstMismatch]
      )
        firstMismatch++;
      lastGeminiInsertAudit = {
        stage: "verify",
        beforeChars: before.length,
        inputType: "insertHTML",
        expectedChars: expected.length,
        renderedChars: actual.length,
        textContentChars: (editor.textContent || "").length,
        complete,
        expectedLineBreaks: (intended.match(/\n/g) || []).length,
        renderedLineBreaks: (actual.match(/\n/g) || []).length,
        firstMismatch: complete ? null : firstMismatch,
        expectedCharCode: complete ? null : intended.charCodeAt(firstMismatch),
        renderedCharCode: complete ? null : actual.charCodeAt(firstMismatch),
        elapsedMs: Date.now() - insertStartedAt,
      };
      console.info(
        "[GeminiComposerAudit]",
        JSON.stringify(lastGeminiInsertAudit),
      );
      if (!complete || isGeminiAbort()) return false;
    }
    await sleep(300);
    const currentText = readGeminiComposerText(editor);
    console.log(
      "[ChatAI] Gemini: Text \u0111\xE3 nh\u1EADp:",
      (currentText || "").substring(0, 50),
    );
    return true;
  }
  async function clickSubmit(retryConversationPath = null) {
    function checkConversation() {
      if (
        retryConversationPath &&
        retryConversationPath !== `${location.origin}${location.pathname}`
      )
        throw Object.assign(new Error("CONVERSATION_CHANGED"), {
          noRetry: true,
        });
    }
    console.log("[ChatAI] Gemini: T\xECm n\xFAt g\u1EEDi");
    await sleep(500);
    let sendBtn = null;
    const start = Date.now();
    while (Date.now() - start < 8e3) {
      checkConversation();
      if (isGeminiAbort()) return false;
      sendBtn = _queryWithFallback("submit_button");
      if (sendBtn && !sendBtn.disabled) {
        console.log("[ChatAI] Gemini: T\xECm th\u1EA5y n\xFAt g\u1EEDi");
        break;
      }
      sendBtn = null;
      await sleep(300);
    }
    if (!sendBtn) {
      console.error(
        "[ChatAI] Kh\xF4ng t\xECm th\u1EA5y n\xFAt g\u1EEDi tr\xEAn Gemini",
      );
      return false;
    }
    checkConversation();
    if (isGeminiAbort()) return false;
    console.log("[ChatAI] Gemini: Click n\xFAt g\u1EEDi");
    simulateClick(sendBtn);
    await sleep(500);
    checkConversation();
    if (isGeminiAbort()) return false;
    const reactKey = Object.keys(sendBtn).find((k) =>
      k.startsWith("__reactProps$"),
    );
    if (reactKey && sendBtn[reactKey]?.onClick) {
      sendBtn[reactKey].onClick({
        preventDefault: () => {},
        stopPropagation: () => {},
      });
    }
    return true;
  }
  function snapshotGeminiState() {
    const responses = _queryAllWithFallback("response_container");
    return {
      turnCount: responses.length,
      lastIds: Array.from(responses)
        .slice(-5)
        .map((r, i) => r.dataset?.turnId || r.id || `idx-${i}`),
      timestamp: Date.now(),
    };
  }
  function isGeminiGenerating() {
    const stopBtn = _queryWithFallback("stop_button");
    if (stopBtn) return true;
    return !!_queryWithFallback("generation_busy_indicator");
  }
  function extractGeminiResponseText(response) {
    const content = queryAllIn(response, "response_text")[0];
    if (content && typeof content.innerText === "string")
      return content.innerText.trim();
    const copy = response?.cloneNode?.(true);
    if (!copy) return "";
    for (const label of queryAllIn(copy, "screen_reader_label")) label.remove();
    return String(copy.innerText || copy.textContent || "").trim();
  }
  function isImageGenerationResponse(response) {
    return queryAllIn(response, "image_result_container").length > 0;
  }
  let _gemScrollEl = null;
  let _gemScrollElFoundAt = 0;
  let _gemLastScrollAt = 0;
  function _scrollGeminiToBottom(
    refreshMs = 5e3,
    throttleMs = 0,
    candidate = null,
  ) {
    try {
      if (Date.now() - _gemLastScrollAt < throttleMs) return;
      _gemLastScrollAt = Date.now();
      if (
        !_gemScrollEl ||
        !_gemScrollEl.isConnected ||
        Date.now() - _gemScrollElFoundAt > refreshMs
      ) {
        const root = _queryWithFallback("conversation_scroll_root");
        if (!root) return;
        let best = null,
          bestH = 0;
        root.querySelectorAll("*").forEach((e) => {
          const oy = getComputedStyle(e).overflowY;
          if (
            (oy === "auto" || oy === "scroll") &&
            e.scrollHeight > e.clientHeight + 80 &&
            e.scrollHeight > bestH
          ) {
            best = e;
            bestH = e.scrollHeight;
          }
        });
        _gemScrollEl = best;
        _gemScrollElFoundAt = Date.now();
      }
      if (_gemScrollEl) _gemScrollEl.scrollTop = _gemScrollEl.scrollHeight;
      const _resps = _queryAllWithFallback("response_container");
      const _last = candidate || (_resps && _resps[_resps.length - 1]);
      if (_last) _last.scrollIntoView({ block: "end" });
    } catch (_) {}
  }
  async function waitForGeminiTextResult(baseline, timeout = 6e4) {
    if (
      !_getDynamicSelector("response_text")?.selectors?.length ||
      !_getDynamicSelector("screen_reader_label")?.selectors?.length
    ) {
      return { success: false, error: "GEMINI_TEXT_SELECTOR_CONFIG_MISSING" };
    }
    const startTime = Date.now();
    const pollInterval = 500;
    const STREAM_GRACE_MAX = 3e5;
    const hardCap = startTime + timeout + STREAM_GRACE_MAX;
    let deadline = startTime + timeout;
    let graceLogged = false;
    let lastDiag = 0;
    let lastTextLength = 0;
    let stableCount = 0;
    const STABLE_THRESHOLD = 8;
    while (Date.now() < deadline) {
      _scrollGeminiToBottom();
      if (isGeminiAbort()) {
        console.log("[Gemini-text] Aborted by user");
        return { success: false, error: "ABORTED" };
      }
      const responses = _queryAllWithFallback("response_container");
      if (responses.length <= baseline.turnCount) {
        if (Date.now() - lastDiag > 5e3) {
          console.log(
            "[Gemini-text] Ch\u01B0a c\xF3 response m\u1EDBi \u2014 current:",
            responses.length,
            "baseline:",
            baseline.turnCount,
          );
          lastDiag = Date.now();
        }
        await sleep(pollInterval);
        continue;
      }
      const lastResponse = responses[responses.length - 1];
      if (!lastResponse) {
        await sleep(pollInterval);
        continue;
      }
      const signalGenerating = isGeminiGenerating();
      let currentText = extractGeminiResponseText(lastResponse);
      const MIN_TEXT_LENGTH = 20;
      const currentTextLength = currentText.length;
      if (
        currentTextLength === lastTextLength &&
        currentTextLength >= MIN_TEXT_LENGTH
      ) {
        stableCount++;
      } else {
        stableCount = 0;
        lastTextLength = currentTextLength;
      }
      const isTextStable = stableCount >= STABLE_THRESHOLD;
      const stillGenerating =
        signalGenerating ||
        currentTextLength < MIN_TEXT_LENGTH ||
        (!isTextStable && currentTextLength > 0);
      if (stillGenerating) {
        if (signalGenerating && deadline - Date.now() < 6e4) {
          const next = Math.min(Date.now() + 6e4, hardCap);
          if (next > deadline) {
            deadline = next;
            if (!graceLogged) {
              console.warn(
                "[Gemini-text] Qu\xE1 timeout g\u1ED1c nh\u01B0ng stream c\xF2n s\u1ED1ng \u2192 gia h\u1EA1n (cap +",
                STREAM_GRACE_MAX / 1e3,
                "s)",
              );
              graceLogged = true;
            }
          }
        }
        if (Date.now() - lastDiag > 5e3) {
          console.log(
            "[Gemini-text] \u0110ang generate \u2014 signal:",
            signalGenerating,
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
      console.log(
        "[Gemini-text] Extracted response text | text length:",
        currentText.length,
      );
      if (!currentText || currentText.length < MIN_TEXT_LENGTH) {
        const fallbackText = extractGeminiResponseText(lastResponse);
        if (fallbackText && fallbackText.length >= MIN_TEXT_LENGTH) {
          console.log(
            "[Gemini-text] Fallback extract from model-response (stripped prefix) | text length:",
            fallbackText.length,
          );
          currentText = fallbackText;
        } else {
          if (Date.now() - startTime < 8e3) {
            await sleep(pollInterval);
            continue;
          }
          return {
            success: false,
            error: "TEXT_EMPTY_OR_TOO_SHORT",
            text: fallbackText,
          };
        }
      }
      const turnId = lastResponse.dataset?.turnId || lastResponse.id || null;
      console.log(
        "[Gemini-text] DONE \u2014 text length:",
        currentText.length,
        "stableCount:",
        stableCount,
      );
      if (isImageGenerationResponse(lastResponse)) {
        console.warn(
          "[Gemini-text] Gemini \u0111ang t\u1EA1o \u1EA3nh thay v\xEC tr\u1EA3 prompt \u2014 trigger fallback",
        );
        return {
          success: false,
          error: "IMAGE_GENERATION_DETECTED",
          text: currentText,
        };
      }
      return { success: true, text: currentText, turnId };
    }
    console.warn(
      "[Gemini-text] TIMEOUT sau",
      Date.now() - startTime,
      "ms (timeout g\u1ED1c",
      timeout,
      "ms)",
    );
    return { success: false, error: "TIMEOUT" };
  }
  let __geminiMediaRun = null;
  const __geminiResponseIds = new WeakMap();
  let __geminiResponseSeq = 0;
  function logGeminiMedia(runId, message, state, detail = {}) {
    const payload = {
      runId,
      promptIndex: message?.settings?.promptIndex ?? null,
      mediaType: message?.expect || null,
      model: message?.model?.value || null,
      state,
      ...detail,
    };
    console.info("[Gemini-media]", payload);
    try {
      chrome.runtime.sendMessage({
        action: "gemini:mediaProgress",
        data: payload,
      });
    } catch (_) {}
  }
  function responseIdentity(response) {
    if (!response) return "";
    const semantic =
      response.getAttribute?.("data-message-id") ||
      response.getAttribute?.("data-turn-id") ||
      response.id;
    if (semantic) return semantic;
    if (!__geminiResponseIds.has(response))
      __geminiResponseIds.set(response, `response-${++__geminiResponseSeq}`);
    return __geminiResponseIds.get(response);
  }
  async function getGeminiApiConfig() {
    const stored = await new Promise((resolve) =>
      ConfigSnapshotAccess.read(["toby_provider_api_configs"], resolve),
    );
    const provider = stored?.toby_provider_api_configs?.data?.gemini;
    if (!provider?.configs) return null;
    return {
      ...provider.configs,
      __configVersion: provider.config_version ?? provider.version ?? null,
    };
  }
  function queryAllIn(root, key) {
    const cfg = _getDynamicSelector(key);
    if (!root || !cfg?.selectors?.length) return [];
    for (const selector of cfg.selectors) {
      try {
        const matches = Array.from(root.querySelectorAll(selector));
        if (matches.length) return matches;
      } catch (_) {}
    }
    return [];
  }
  function mediaFingerprint(el) {
    if (!el) return "";
    const raw = el.currentSrc || el.src || el.getAttribute?.("src") || "";
    try {
      const u = new URL(raw, location.href);
      const identity = `${u.href}:${el.naturalWidth || el.videoWidth || 0}x${el.naturalHeight || el.videoHeight || 0}`;
      let hash = 2166136261;
      for (let i = 0; i < identity.length; i++) {
        hash ^= identity.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return `${el.tagName}:${(hash >>> 0).toString(16)}`;
    } catch (_) {
      let hash = 2166136261;
      for (let i = 0; i < raw.length; i++) {
        hash ^= raw.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return `${el.tagName}:${(hash >>> 0).toString(16)}`;
    }
  }
  function safeMediaSource(el) {
    const raw = el?.currentSrc || el?.src || el?.getAttribute?.("src") || "";
    try {
      const url = new URL(raw, location.href);
      return `${url.origin}${url.pathname}`;
    } catch (_) {
      return "";
    }
  }
  function hasValidGeminiVideoSource(video) {
    const raw = video?.currentSrc || video?.src || "";
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
        return false;
      const mime = video.getAttribute?.("type") || "";
      return (
        /video\//i.test(mime) ||
        /\.mp4(?:$|[?#])/i.test(parsed.href) ||
        /filename=[^&]*\.mp4/i.test(parsed.search)
      );
    } catch (_) {
      return false;
    }
  }
  function snapshotGeminiMediaState(mediaType) {
    const responses = Array.from(
      _queryAllWithFallback("media_response_container"),
    );
    const mediaKey = mediaType === "video" ? "video_result" : "image_result";
    const refs = Array.from(_queryAllWithFallback("uploaded_image"))
      .map(mediaFingerprint)
      .filter(Boolean);
    return {
      path: `${location.origin}${location.pathname}`,
      responseCount: responses.length,
      responseNodes: new Set(responses),
      responseIds: new Set(responses.map(responseIdentity)),
      fingerprints: new Set(
        responses
          .flatMap((r) => queryAllIn(r, mediaKey))
          .map(mediaFingerprint)
          .filter(Boolean),
      ),
      refFingerprints: new Set(refs),
      capturedAt: Date.now(),
    };
  }
  async function closeGeminiVideoRatioMenu(timeoutMs) {
    let trigger = _queryWithFallback("video_ratio_trigger");
    const sendEscape = (target) => {
      if (!target) return;
      target.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
      target.dispatchEvent(
        new KeyboardEvent("keyup", {
          key: "Escape",
          code: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
    };
    sendEscape(document.activeElement);
    sendEscape(document);
    await sleep(100);
    trigger = _queryWithFallback("video_ratio_trigger") || trigger;
    const mountedOption =
      _queryWithFallback("video_ratio_option_landscape") ||
      _queryWithFallback("video_ratio_option_portrait");
    const expandedState = trigger?.getAttribute("aria-expanded");
    if (
      trigger &&
      (expandedState === "true" || (expandedState === null && mountedOption))
    )
      simulateClick(trigger);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (isGeminiAbort()) return false;
      trigger = _queryWithFallback("video_ratio_trigger") || trigger;
      const expanded = trigger?.getAttribute("aria-expanded") === "true";
      const anyRatioOption =
        _queryWithFallback("video_ratio_option_landscape") ||
        _queryWithFallback("video_ratio_option_portrait");
      if (!expanded && !anyRatioOption) return true;
      await sleep(100);
    }
    return false;
  }
  async function selectGeminiVideoRatio(requestedRatio, api, timeoutMs) {
    const ratios = api?.ratios?.video;
    const selected = Array.isArray(ratios)
      ? ratios.find(
          (item) =>
            item?.value === requestedRatio || item?.ui_name === requestedRatio,
        )
      : null;
    if (!selected?.selector_key)
      return { success: false, error: "VIDEO_RATIO_CONFIG_MISSING" };
    console.info("[Gemini-media] video ratio selection requested", {
      requestedRatio,
      selectorKey: selected.selector_key,
    });
    let option = _queryWithFallback(selected.selector_key);
    if (!option) {
      let trigger2 = _queryWithFallback("video_ratio_trigger");
      const triggerDeadline = Date.now() + timeoutMs;
      while (!trigger2 && Date.now() < triggerDeadline) {
        if (isGeminiAbort()) return { success: false, error: "ABORTED" };
        await sleep(100);
        trigger2 = _queryWithFallback("video_ratio_trigger");
      }
      if (!trigger2)
        return { success: false, error: "VIDEO_RATIO_TRIGGER_NOT_FOUND" };
      simulateClick(trigger2);
      const optionDeadline = Date.now() + timeoutMs;
      while (!option && Date.now() < optionDeadline) {
        if (isGeminiAbort()) return { success: false, error: "ABORTED" };
        await sleep(100);
        option = _queryWithFallback(selected.selector_key);
      }
    }
    if (!option)
      return { success: false, error: "VIDEO_RATIO_OPTION_NOT_FOUND" };
    if (option.getAttribute("aria-checked") === "true") {
      const closed2 = await closeGeminiVideoRatioMenu(timeoutMs);
      if (closed2) {
        console.info("[Gemini-media] video ratio selection verified", {
          requestedRatio,
          selectorKey: selected.selector_key,
          alreadySelected: true,
        });
      }
      return closed2
        ? { success: true }
        : { success: false, error: "VIDEO_RATIO_MENU_CLOSE_FAILED" };
    }
    simulateClick(option);
    await sleep(150);
    let trigger = _queryWithFallback("video_ratio_trigger");
    const reopenDeadline = Date.now() + timeoutMs;
    while (!trigger && Date.now() < reopenDeadline) {
      if (isGeminiAbort()) return { success: false, error: "ABORTED" };
      await sleep(100);
      trigger = _queryWithFallback("video_ratio_trigger");
    }
    if (!trigger)
      return { success: false, error: "VIDEO_RATIO_TRIGGER_NOT_FOUND" };
    simulateClick(trigger);
    option = null;
    const verifyDeadline = Date.now() + timeoutMs;
    while (!option && Date.now() < verifyDeadline) {
      if (isGeminiAbort()) return { success: false, error: "ABORTED" };
      await sleep(100);
      option = _queryWithFallback(selected.selector_key);
    }
    const verified = option?.getAttribute("aria-checked") === "true";
    if (!verified)
      return { success: false, error: "VIDEO_RATIO_VERIFY_FAILED" };
    const closed = await closeGeminiVideoRatioMenu(timeoutMs);
    if (closed) {
      console.info("[Gemini-media] video ratio selection verified", {
        requestedRatio,
        selectorKey: selected.selector_key,
        alreadySelected: false,
      });
    }
    return closed
      ? { success: true }
      : { success: false, error: "VIDEO_RATIO_MENU_CLOSE_FAILED" };
  }
  async function closeGeminiImageRatioMenu(timeoutMs, optionSelectorKey) {
    let trigger = _queryWithFallback("image_ratio_trigger");
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        bubbles: true,
      }),
    );
    await sleep(100);
    trigger = _queryWithFallback("image_ratio_trigger") || trigger;
    let mountedOption = optionSelectorKey
      ? _queryWithFallback(optionSelectorKey)
      : null;
    if (
      trigger &&
      (trigger.getAttribute("aria-expanded") === "true" ||
        (trigger.getAttribute("aria-expanded") === null && mountedOption))
    ) {
      simulateClick(trigger);
    }
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (isGeminiAbort()) return false;
      trigger = _queryWithFallback("image_ratio_trigger") || trigger;
      mountedOption = optionSelectorKey
        ? _queryWithFallback(optionSelectorKey)
        : null;
      if (trigger?.getAttribute("aria-expanded") !== "true" && !mountedOption)
        return true;
      await sleep(100);
    }
    return false;
  }
  async function selectGeminiImageRatio(requestedRatio, api, timeoutMs) {
    const ratios = api?.ratios?.image;
    const selected = Array.isArray(ratios)
      ? ratios.find(
          (item) =>
            item?.value === requestedRatio || item?.ui_name === requestedRatio,
        )
      : null;
    if (!selected?.selector_key)
      return { success: false, error: "IMAGE_RATIO_CONFIG_MISSING" };
    let trigger = _queryWithFallback("image_ratio_trigger");
    const triggerDeadline = Date.now() + timeoutMs;
    while (!trigger && Date.now() < triggerDeadline) {
      if (isGeminiAbort()) return { success: false, error: "ABORTED" };
      await sleep(100);
      trigger = _queryWithFallback("image_ratio_trigger");
    }
    if (!trigger)
      return { success: false, error: "IMAGE_RATIO_TRIGGER_NOT_FOUND" };
    simulateClick(trigger);
    let option = null;
    const optionDeadline = Date.now() + timeoutMs;
    while (!option && Date.now() < optionDeadline) {
      if (isGeminiAbort()) return { success: false, error: "ABORTED" };
      await sleep(100);
      option = _queryWithFallback(selected.selector_key);
    }
    if (!option)
      return { success: false, error: "IMAGE_RATIO_OPTION_NOT_FOUND" };
    const alreadySelected = option.getAttribute("aria-checked") === "true";
    if (!alreadySelected) simulateClick(option);
    if (!alreadySelected) {
      await sleep(150);
      if (isGeminiAbort()) return { success: false, error: "ABORTED" };
      trigger = _queryWithFallback("image_ratio_trigger");
      const reopenDeadline = Date.now() + timeoutMs;
      while (!trigger && Date.now() < reopenDeadline) {
        if (isGeminiAbort()) return { success: false, error: "ABORTED" };
        await sleep(100);
        trigger = _queryWithFallback("image_ratio_trigger");
      }
      if (!trigger)
        return { success: false, error: "IMAGE_RATIO_TRIGGER_NOT_FOUND" };
      simulateClick(trigger);
      option = null;
      const verifyDeadline = Date.now() + timeoutMs;
      while (!option && Date.now() < verifyDeadline) {
        if (isGeminiAbort()) return { success: false, error: "ABORTED" };
        await sleep(100);
        option = _queryWithFallback(selected.selector_key);
      }
      if (option?.getAttribute("aria-checked") !== "true")
        return { success: false, error: "IMAGE_RATIO_VERIFY_FAILED" };
    }
    return (await closeGeminiImageRatioMenu(timeoutMs, selected.selector_key))
      ? { success: true }
      : { success: false, error: "IMAGE_RATIO_MENU_CLOSE_FAILED" };
  }
  function getGeminiModelTriggers() {
    return Array.from(_queryAllWithFallback("model_switcher_button"));
  }
  function getVisibleGeminiModelTrigger() {
    const triggers = getGeminiModelTriggers();
    return (
      triggers.find((el) => {
        const rect = el.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          getComputedStyle(el).visibility !== "hidden"
        );
      }) || null
    );
  }
  function hasHiddenGeminiModelTrigger() {
    return (
      getGeminiModelTriggers().length > 0 && !getVisibleGeminiModelTrigger()
    );
  }
  function geminiReadinessFailure(code, timeoutMs) {
    const composer = _queryAllWithFallback("composer")[0] || null;
    const diagnostics = {
      readyState: document.readyState || null,
      visibility: document.visibilityState || null,
      timeoutMs,
      composerPresent: !!composer,
      composerDisabled: composer?.getAttribute("aria-disabled") === "true",
      composerBusy: !!composer?.closest?.('[aria-busy="true"]'),
      composerSelectorCount:
        _getDynamicSelector("composer")?.selectors?.length || 0,
      modelSwitcherSelectorCount:
        _getDynamicSelector("model_switcher_button")?.selectors?.length || 0,
      modelSwitcherMatches: getGeminiModelTriggers().length,
      modelSwitcherVisible: !!getVisibleGeminiModelTrigger(),
    };
    const message = `${code}: ${JSON.stringify(diagnostics)}`;
    console.warn("[Gemini-media] readiness failed", message);
    return { success: false, error: code, message, diagnostics };
  }
  function geminiModelOptionMatches(
    option,
    model,
    labelKey = "model_option_label",
  ) {
    const pattern = model?.domIdentity?.name_pattern;
    if (typeof pattern !== "string" || !pattern || pattern.length > 128)
      return false;
    const label = queryAllIn(option, labelKey)[0];
    if (!label) return false;
    const name = (label.textContent || "").trim().replace(/\s+/g, " ");
    if (name.length > 160) return false;
    try {
      return new RegExp(pattern, "u").test(name);
    } catch (_) {
      return false;
    }
  }
  function getGeminiModelOptions() {
    const trigger = getVisibleGeminiModelTrigger();
    const menuId = trigger?.getAttribute("aria-controls");
    const menu = menuId ? document.getElementById(menuId) : null;
    return menu
      ? queryAllIn(menu, "model_option_button")
      : Array.from(_queryAllWithFallback("model_option_button"));
  }
  function isGeminiModelSelected(model) {
    const options = getGeminiModelOptions();
    if (options.length)
      return options.some(
        (option) =>
          geminiModelOptionMatches(option, model) &&
          queryAllIn(option, "model_option_selected").length > 0,
      );
    const trigger = getVisibleGeminiModelTrigger();
    return (
      !!trigger &&
      geminiModelOptionMatches(trigger, model, "model_trigger_label")
    );
  }
  async function closeGeminiModelMenu(timeoutMs) {
    if (!getGeminiModelOptions().length) return true;
    const trigger = getVisibleGeminiModelTrigger();
    if (!trigger) return false;
    simulateClick(trigger);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (isGeminiAbort()) return false;
      if (!getGeminiModelOptions().length) return true;
      await sleep(100);
    }
    return false;
  }
  async function selectGeminiModel(
    model,
    interactionTimeoutMs,
    readinessTimeoutMs = interactionTimeoutMs,
  ) {
    const pattern = model?.domIdentity?.name_pattern;
    const cfg = _getDynamicSelector("model_option_button");
    if (
      !model?.value ||
      typeof pattern !== "string" ||
      !pattern ||
      !cfg?.selectors?.length ||
      !_getDynamicSelector("model_option_label")?.selectors?.length ||
      !_getDynamicSelector("model_option_selected")?.selectors?.length ||
      !_getDynamicSelector("model_trigger_label")?.selectors?.length
    )
      return { success: false, error: "MODEL_CONFIG_MISSING" };
    try {
      new RegExp(pattern, "u");
    } catch (_) {
      return { success: false, error: "MODEL_CONFIG_MISSING" };
    }
    const timeoutMs = Number(interactionTimeoutMs);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
      return { success: false, error: "INTERACTION_CONFIG_MISSING" };
    const readyTimeoutMs = Number(readinessTimeoutMs);
    if (!Number.isFinite(readyTimeoutMs) || readyTimeoutMs <= 0)
      return { success: false, error: "MONITOR_CONFIG_INVALID" };
    let trigger = null;
    const triggerDeadline = Date.now() + readyTimeoutMs;
    while (Date.now() < triggerDeadline && !trigger) {
      if (isGeminiAbort()) return { success: false, error: "ABORTED" };
      trigger = getVisibleGeminiModelTrigger();
      if (!trigger && hasHiddenGeminiModelTrigger())
        return { success: false, error: "MODEL_SWITCHER_HIDDEN" };
      if (!trigger) await sleep(150);
    }
    if (!trigger)
      return geminiReadinessFailure("MODEL_SWITCHER_NOT_FOUND", readyTimeoutMs);
    if (!getGeminiModelOptions().length) simulateClick(trigger);
    const discoveryDeadline = Date.now() + timeoutMs;
    let target = null;
    while (Date.now() < discoveryDeadline && !target) {
      if (isGeminiAbort()) return { success: false, error: "ABORTED" };
      const candidates = getGeminiModelOptions().filter((option) =>
        geminiModelOptionMatches(option, model),
      );
      if (candidates.length > 1)
        return { success: false, error: "MODEL_IDENTITY_AMBIGUOUS" };
      target = candidates[0] || null;
      if (!target) await sleep(150);
    }
    if (!target) return { success: false, error: "MODEL_NOT_AVAILABLE" };
    if (queryAllIn(target, "model_option_selected").length) {
      return (await closeGeminiModelMenu(timeoutMs))
        ? { success: true }
        : { success: false, error: "MODEL_MENU_CLOSE_FAILED" };
    }
    if (target.getAttribute("aria-disabled") === "true")
      return { success: false, error: "MODEL_NOT_AVAILABLE" };
    const selectedName = queryAllIn(target, "model_option_label")[0]
      .textContent.trim()
      .replace(/\s+/g, " ");
    __geminiSelectedMediaTool = null;
    simulateClick(target);
    await sleep(150);
    if (isGeminiAbort()) return { success: false, error: "ABORTED" };
    if (!getGeminiModelOptions().length) {
      trigger = getVisibleGeminiModelTrigger();
      if (!trigger) return { success: false, error: "MODEL_UNAVAILABLE" };
      simulateClick(trigger);
    }
    const verifyDeadline = Date.now() + timeoutMs;
    while (Date.now() < verifyDeadline) {
      if (isGeminiAbort()) return { success: false, error: "ABORTED" };
      const selected = getGeminiModelOptions().filter(
        (option) =>
          geminiModelOptionMatches(option, model) &&
          queryAllIn(option, "model_option_label")[0]
            .textContent.trim()
            .replace(/\s+/g, " ") === selectedName &&
          queryAllIn(option, "model_option_selected").length,
      );
      if (selected.length === 1) {
        return (await closeGeminiModelMenu(timeoutMs))
          ? { success: true }
          : { success: false, error: "MODEL_MENU_CLOSE_FAILED" };
      }
      await sleep(150);
    }
    return { success: false, error: "MODEL_UNAVAILABLE" };
  }
  async function selectGeminiModelBestEffort(
    model,
    interactionTimeoutMs,
    runId,
    readinessTimeoutMs = interactionTimeoutMs,
  ) {
    try {
      const result = await selectGeminiModel(
        model,
        interactionTimeoutMs,
        readinessTimeoutMs,
      );
      if (!result.success && result.error !== "ABORTED") {
        console.warn("[Gemini-media] MODEL_SELECTION_FAILED", {
          runId,
          requestedModel: model?.value || null,
          error: result.error,
          message: result.message,
        });
      }
      return result;
    } catch (error) {
      console.warn("[Gemini-media] MODEL_SELECTION_EXCEPTION", {
        runId,
        requestedModel: model?.value || null,
        error: error?.message || String(error),
      });
      return { success: false, error: "MODEL_SELECTION_EXCEPTION" };
    }
  }
  function isGeminiToolSelected(mediaType) {
    const key =
      mediaType === "video" ? "tools_video_gen_item" : "tools_image_gen_item";
    const selectedChipKey =
      mediaType === "video"
        ? "tools_video_selected_chip"
        : "tools_image_selected_chip";
    if (_queryWithFallback(selectedChipKey)) {
      __geminiSelectedMediaTool = mediaType;
      return true;
    }
    const menuRoot = _queryWithFallback("tools_menu_scope");
    const item =
      (menuRoot ? queryAllIn(menuRoot, key)[0] : null) ||
      _queryWithFallback(key);
    if (!item) return __geminiSelectedMediaTool === mediaType;
    const selected =
      item.getAttribute("aria-checked") === "true" ||
      item.getAttribute("aria-selected") === "true";
    if (selected) __geminiSelectedMediaTool = mediaType;
    return selected;
  }
  async function activateGeminiTool(
    mediaType,
    interactionTimeoutMs,
    readinessTimeoutMs = interactionTimeoutMs,
  ) {
    if (isGeminiAbort()) return { success: false, error: "ABORTED" };
    const readyTimeoutMs = Number(readinessTimeoutMs);
    if (!Number.isFinite(readyTimeoutMs) || readyTimeoutMs <= 0)
      return { success: false, error: "MONITOR_CONFIG_INVALID" };
    const key =
      mediaType === "video" ? "tools_video_gen_item" : "tools_image_gen_item";
    const toolCfg = _getDynamicSelector(key);
    if (!toolCfg?.selectors?.length)
      return { success: false, error: "TOOL_CONFIG_MISSING" };
    const menu = _queryWithFallback("tools_menu_button");
    let menuRoot = _queryWithFallback("tools_menu_scope");
    let item =
      (menuRoot ? queryAllIn(menuRoot, key)[0] : null) ||
      _queryWithFallback(key);
    if (!item) {
      if (!menu) return { success: false, error: "TOOLS_MENU_NOT_FOUND" };
      if (menu.getAttribute("aria-expanded") !== "true") simulateClick(menu);
      const toolDeadline = Date.now() + readyTimeoutMs;
      while (Date.now() < toolDeadline && !item) {
        if (isGeminiAbort()) return { success: false, error: "ABORTED" };
        await sleep(150);
        menuRoot = _queryWithFallback("tools_menu_scope");
        item =
          (menuRoot ? queryAllIn(menuRoot, key)[0] : null) ||
          _queryWithFallback(key);
      }
    }
    if (!item) {
      const configuredSelectors = toolCfg.selectors || [];
      console.warn(
        "[Gemini-media] tool discovery unavailable",
        JSON.stringify({
          mediaType,
          configuredSelectors,
          menuFound: !!menu,
          menuExpanded: menu?.getAttribute("aria-expanded") || null,
          visibility: document.visibilityState || null,
          interactionTimeoutMs,
          readinessTimeoutMs: readyTimeoutMs,
        }),
      );
      return {
        success: false,
        error: "TOOL_NOT_AVAILABLE",
        message: `TOOL_NOT_AVAILABLE: mediaType=${mediaType}, configuredSelectors=${configuredSelectors.length}, menuFound=${!!menu}`,
      };
    }
    if (!isGeminiToolSelected(mediaType)) {
      simulateClick(item);
      const deadline = Date.now() + readyTimeoutMs;
      let verificationReopened = false;
      while (Date.now() < deadline && !isGeminiToolSelected(mediaType)) {
        if (isGeminiAbort()) return { success: false, error: "ABORTED" };
        const currentMenuRoot = _queryWithFallback("tools_menu_scope");
        const currentItem =
          (currentMenuRoot ? queryAllIn(currentMenuRoot, key)[0] : null) ||
          _queryWithFallback(key);
        if (!currentItem && !verificationReopened) {
          const currentMenu = _queryWithFallback("tools_menu_button");
          if (currentMenu) {
            if (currentMenu.getAttribute("aria-expanded") !== "true")
              simulateClick(currentMenu);
            verificationReopened = true;
            await sleep(150);
          }
        }
        await sleep(200);
      }
    }
    const selected = isGeminiToolSelected(mediaType);
    if (selected) {
      __geminiSelectedMediaTool = mediaType;
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    }
    return selected
      ? { success: true }
      : { success: false, error: "TOOL_ACTIVATION_FAILED" };
  }
  async function closeGeminiToolsMenu(timeoutMs) {
    let menu = _queryWithFallback("tools_menu_button");
    if (menu?.getAttribute("aria-expanded") !== "true") return true;
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        bubbles: true,
      }),
    );
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        bubbles: true,
      }),
    );
    await sleep(150);
    if (isGeminiAbort()) return false;
    menu = _queryWithFallback("tools_menu_button");
    if (menu?.getAttribute("aria-expanded") === "true") simulateClick(menu);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (isGeminiAbort()) return false;
      menu = _queryWithFallback("tools_menu_button");
      if (menu?.getAttribute("aria-expanded") !== "true") return true;
      await sleep(150);
    }
    return false;
  }
  async function materializeGeminiImage(img, maxBytes) {
    const src = img?.currentSrc || img?.src || "";
    if (!src) throw new Error("IMAGE_SOURCE_EMPTY");
    const baseResult = {
      url: src,
      sourceUrl: safeMediaSource(img),
      mimeType: "image/png",
      fingerprint: mediaFingerprint(img),
    };
    try {
      const response = await fetch(src, { credentials: "include" });
      if (!response.ok) throw new Error(`IMAGE_FETCH_${response.status}`);
      const blob = await response.blob();
      if (!Number.isFinite(maxBytes) || maxBytes <= 0)
        throw new Error("MONITOR_CONFIG_INVALID");
      if (blob.size > maxBytes) throw new Error("MEDIA_PAYLOAD_TOO_LARGE");
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("IMAGE_READ_FAILED"));
        reader.readAsDataURL(blob);
      });
      return {
        ...baseResult,
        url: dataUrl,
        mimeType: blob.type || "image/png",
        size: blob.size,
      };
    } catch (error) {
      console.warn(
        "[Gemini-media] image materialization unavailable; preserving native result:",
        error?.message || error,
      );
      return {
        ...baseResult,
        materializeError: error?.message || "IMAGE_MATERIALIZE_FAILED",
      };
    }
  }
  async function downloadGeminiImageNative(fingerprint) {
    if (!fingerprint)
      return { success: false, error: "IMAGE_FINGERPRINT_REQUIRED" };
    const responses = Array.from(
      _queryAllWithFallback("media_response_container"),
    );
    let targetImage = null;
    let targetResponse = null;
    for (
      let responseIndex = responses.length - 1;
      responseIndex >= 0;
      responseIndex--
    ) {
      const image = queryAllIn(responses[responseIndex], "image_result").find(
        (candidate) => mediaFingerprint(candidate) === fingerprint,
      );
      if (image) {
        targetImage = image;
        targetResponse = responses[responseIndex];
        break;
      }
    }
    if (!targetImage || !targetResponse)
      return { success: false, error: "IMAGE_RESULT_NOT_FOUND" };
    const menuButton =
      queryAllIn(targetResponse, "image_more_menu_button").at(-1) || null;
    if (menuButton) {
      simulateClick(menuButton);
      const menuDeadline = Date.now() + 3e3;
      while (Date.now() < menuDeadline) {
        const controlledId =
          menuButton.getAttribute("aria-controls") ||
          menuButton
            .querySelector?.("[aria-controls]")
            ?.getAttribute("aria-controls");
        const controlledMenu = controlledId
          ? document.getElementById(controlledId)
          : null;
        const menuItem =
          (controlledMenu
            ? queryAllIn(controlledMenu, "image_menu_download_item")[0]
            : null) ||
          _queryAllWithFallback("image_menu_download_item").find(
            (item) => item.getAttribute("aria-disabled") !== "true",
          );
        if (menuItem) {
          simulateClick(menuItem);
          return { success: true, method: "response_menu" };
        }
        await sleep(100);
      }
    }
    const imageContainers = Array.from(
      _queryAllWithFallback("image_result_container"),
    );
    const targetContainer = imageContainers.find((container) =>
      container.contains(targetImage),
    );
    const directButton = targetContainer
      ? queryAllIn(targetContainer, "image_download_button")[0]
      : null;
    if (!directButton)
      return { success: false, error: "FULL_SIZE_DOWNLOAD_CONTROL_NOT_FOUND" };
    simulateClick(directButton);
    return { success: true, method: "full_size_button" };
  }
  async function downloadGeminiVideoNative(fingerprint) {
    if (!fingerprint)
      return { success: false, error: "VIDEO_FINGERPRINT_REQUIRED" };
    const responses = Array.from(
      _queryAllWithFallback("media_response_container"),
    );
    let targetVideo = null;
    let targetResponse = null;
    for (
      let responseIndex = responses.length - 1;
      responseIndex >= 0;
      responseIndex--
    ) {
      const video = queryAllIn(responses[responseIndex], "video_result").find(
        (candidate) => mediaFingerprint(candidate) === fingerprint,
      );
      if (video) {
        targetVideo = video;
        targetResponse = responses[responseIndex];
        break;
      }
    }
    if (!targetVideo || !targetResponse)
      return { success: false, error: "VIDEO_RESULT_NOT_FOUND" };
    const menuButton =
      queryAllIn(targetResponse, "video_more_menu_button").at(-1) || null;
    if (menuButton) {
      simulateClick(menuButton);
      const menuDeadline = Date.now() + 3e3;
      while (Date.now() < menuDeadline) {
        const controlledId =
          menuButton.getAttribute("aria-controls") ||
          menuButton
            .querySelector?.("[aria-controls]")
            ?.getAttribute("aria-controls");
        const controlledMenu = controlledId
          ? document.getElementById(controlledId)
          : null;
        const menuItem =
          (controlledMenu
            ? queryAllIn(controlledMenu, "video_menu_download_item")[0]
            : null) ||
          _queryAllWithFallback("video_menu_download_item").find(
            (item) => item.getAttribute("aria-disabled") !== "true",
          );
        if (menuItem) {
          simulateClick(menuItem);
          return { success: true, method: "response_menu" };
        }
        await sleep(100);
      }
    }
    const targetContainer = targetVideo.closest?.("generated-video") || null;
    const directButton = targetContainer
      ? queryAllIn(targetContainer, "video_download_button")[0]
      : null;
    if (!directButton)
      return {
        success: false,
        error: "NATIVE_VIDEO_DOWNLOAD_CONTROL_NOT_FOUND",
      };
    simulateClick(directButton);
    return { success: true, method: "video_player_button" };
  }
  function matchesGeminiErrorPattern(value, text) {
    const list = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value.split("|")
        : [];
    const lowered = String(text || "").toLowerCase();
    return list.some(
      (pattern) =>
        typeof pattern === "string" &&
        pattern.trim() &&
        lowered.includes(pattern.trim().toLowerCase()),
    );
  }
  function detectGeminiMediaError(api, root) {
    const patterns = api?.error_patterns;
    if (!patterns || typeof patterns !== "object") return null;
    const text = root?.innerText || "";
    if (
      matchesGeminiErrorPattern(
        patterns.rate_limit_text || patterns.rateLimit,
        text,
      )
    )
      return "RATE_LIMIT";
    if (
      matchesGeminiErrorPattern(
        patterns.content_blocked_text || patterns.contentBlocked,
        text,
      )
    )
      return "CONTENT_BLOCKED";
    if (
      matchesGeminiErrorPattern(
        patterns.not_logged_in_text || patterns.notLoggedIn,
        text,
      )
    )
      return "NOT_LOGGED_IN";
    if (matchesGeminiErrorPattern(patterns.image_gen_failed_text, text))
      return "IMAGE_GEN_FAILED";
    if (matchesGeminiErrorPattern(patterns.network_error_text, text))
      return "NETWORK";
    return null;
  }
  async function waitForGeminiMediaResult(
    mediaType,
    baseline,
    monitor,
    scrollDuringGen,
    api,
    runId,
    runMessage,
  ) {
    const mediaKey = mediaType === "video" ? "video_result" : "image_result";
    const absoluteMax = Number(monitor.absolute_max_wait_ms);
    const startupTimeout = Number(monitor.startup_timeout_ms);
    const staleMs = Number(monitor.heartbeat_stale_ms);
    const pollMs = Number(monitor.poll_interval_ms);
    const stableRequired = Number(monitor.stable_cycles);
    if (
      ![absoluteMax, startupTimeout, staleMs, pollMs, stableRequired].every(
        Number.isFinite,
      ) ||
      stableRequired < 2
    ) {
      return { success: false, error: "MONITOR_CONFIG_INVALID" };
    }
    const started = Date.now();
    let lastProgressAt = started;
    let textSignature = null,
      textStableAt = null,
      textStableCycles = 0;
    let sawGeneration = false;
    let lastOrdered = "";
    let stableCycles = 0;
    let acceptedConversationTransition = Number(
      baseline.acceptedConversationTransitions || 0,
    );
    let lastDiagnostic = {
      candidateIdentity: null,
      generating: false,
      mediaCount: 0,
      readyStates: [],
    };
    let mutationEpoch = 0;
    const observer = new MutationObserver(() => {
      mutationEpoch++;
      lastProgressAt = Date.now();
    });
    const observerRoot = _queryWithFallback("conversation_scroll_root");
    if (!observerRoot)
      return { success: false, error: "SCROLL_ROOT_CONFIG_MISMATCH" };
    observer.observe(observerRoot, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "class", "aria-busy"],
    });
    let observedEpoch = mutationEpoch;
    try {
      while (Date.now() - started < absoluteMax) {
        if (isGeminiAbort()) return { success: false, error: "ABORTED" };
        const currentPath = `${location.origin}${location.pathname}`;
        if (currentPath !== baseline.path) {
          if (
            acceptedConversationTransition === 0 &&
            Date.now() - started < startupTimeout
          ) {
            await sleep(pollMs);
            if (`${location.origin}${location.pathname}` !== currentPath) {
              return { success: false, error: "CONVERSATION_CHANGED" };
            }
            baseline.path = currentPath;
            acceptedConversationTransition++;
            lastProgressAt = Date.now();
            logGeminiMedia(runId, runMessage, "conversation_ready", {
              pathTransition: acceptedConversationTransition,
            });
          } else {
            return { success: false, error: "CONVERSATION_CHANGED" };
          }
        }
        if (detectGeminiChallenge()) {
          const resolved = await waitForGeminiChallengeResolved(
            Number(monitor.challenge_wait_ms),
          );
          if (!resolved) return { success: false, error: "CHALLENGE_TIMEOUT" };
          lastProgressAt = Date.now();
        }
        const loadingKey =
          mediaType === "video"
            ? "video_loading_overlay"
            : "image_loading_overlay";
        const generating =
          isGeminiGenerating() ||
          (!!_getDynamicSelector(loadingKey)?.selectors?.length &&
            !!_queryWithFallback(loadingKey));
        if (generating) {
          sawGeneration = true;
          lastProgressAt = Date.now();
        }
        const responses = Array.from(
          _queryAllWithFallback("media_response_container"),
        );
        const candidates = responses.filter(
          (r) =>
            !baseline.responseIds.has(responseIdentity(r)) ||
            queryAllIn(r, mediaKey).some(
              (el) => !baseline.fingerprints.has(mediaFingerprint(el)),
            ),
        );
        const candidate = candidates.at(-1) || null;
        const providerError =
          candidates
            .map((response) => detectGeminiMediaError(api, response))
            .find(Boolean) || null;
        if (providerError) return { success: false, error: providerError };
        const seenMedia = new Set();
        const media = candidates
          .flatMap((response) => queryAllIn(response, mediaKey))
          .filter((el) => {
            const fp = mediaFingerprint(el);
            if (
              !fp ||
              baseline.fingerprints.has(fp) ||
              baseline.refFingerprints.has(fp) ||
              seenMedia.has(fp)
            )
              return false;
            seenMedia.add(fp);
            return true;
          });
        const ready = media.filter((el) =>
          mediaType === "video"
            ? hasValidGeminiVideoSource(el)
            : !!(el.currentSrc || el.src) && el.complete && el.naturalWidth > 0,
        );
        lastDiagnostic = {
          candidateIdentity: responseIdentity(candidate),
          generating,
          mediaCount: media.length,
          fingerprintCount: media.map(mediaFingerprint).filter(Boolean).length,
          readyStates: media.map((el) =>
            mediaType === "video" ? el.readyState : el.complete ? 1 : 0,
          ),
        };
        const ordered = ready.map(mediaFingerprint).join("|");
        if (ordered && ordered !== lastOrdered) {
          lastOrdered = ordered;
          stableCycles = 0;
          lastProgressAt = Date.now();
        } else if (ordered && !generating) stableCycles++;
        if (scrollDuringGen || document.hidden) {
          _scrollGeminiToBottom(
            Number(monitor.scroller_refresh_ms),
            Number(monitor.scroll_throttle_ms),
            candidate,
          );
        }
        const completionGuardMs = Number(monitor.min_completion_guard_ms);
        if (!Number.isFinite(completionGuardMs) || completionGuardMs < 0)
          return { success: false, error: "MONITOR_CONFIG_INVALID" };
        if (
          ready.length &&
          !generating &&
          stableCycles >= stableRequired &&
          Date.now() - lastProgressAt >= completionGuardMs
        ) {
          if (mediaType === "image") {
            logGeminiMedia(runId, runMessage, "materializing", {
              resultCount: ready.length,
            });
            const results2 = [];
            for (const img of ready)
              results2.push(
                await materializeGeminiImage(
                  img,
                  Number(monitor.max_materialized_bytes),
                ),
              );
            return {
              success: true,
              mediaType,
              results: results2,
              resultCount: results2.length,
            };
          }
          const results = ready.map((video) => ({
            url: video.currentSrc || video.src,
            sourceUrl: safeMediaSource(video),
            mimeType: video.getAttribute("type") || "video/mp4",
            fingerprint: mediaFingerprint(video),
          }));
          return {
            success: true,
            mediaType,
            results,
            resultCount: results.length,
          };
        }
        const freshResponses = responses.filter(
          (response) => !baseline.responseIds.has(responseIdentity(response)),
        );
        const freshText = freshResponses.map((response) =>
          extractGeminiResponseText(response).trim(),
        );
        const hasFreshMedia = freshResponses.some(
          (response) =>
            ["image_result", "image_result_container", "video_result"].some(
              (key) => queryAllIn(response, key).length,
            ) || response.getAttribute?.("aria-busy") === "true",
        );
        const text = freshText.join("\n").trim();
        if (
          responses.length <= baseline.responseCount ||
          generating ||
          hasFreshMedia ||
          media.length ||
          !matchesGeminiErrorPattern(
            api?.error_patterns?.text_only_pattern,
            text,
          )
        ) {
          textSignature = null;
          textStableAt = null;
          textStableCycles = 0;
        } else {
          const signature = JSON.stringify([
            baseline.path,
            freshResponses.map(responseIdentity),
            freshText,
          ]);
          if (signature !== textSignature) {
            textSignature = signature;
            textStableAt = Date.now();
            textStableCycles = 0;
          } else textStableCycles++;
          if (
            textStableCycles >= stableRequired &&
            Date.now() - textStableAt >= completionGuardMs
          ) {
            return {
              success: false,
              error: "GEMINI_TEXT_ONLY_RESULT",
              text: text.slice(0, 500),
              textOnlyConfirmed: true,
              conversationPath: baseline.path,
            };
          }
        }
        if (mutationEpoch !== observedEpoch) observedEpoch = mutationEpoch;
        const age = Date.now() - lastProgressAt;
        if (
          !sawGeneration &&
          !ready.length &&
          Date.now() - started > startupTimeout
        )
          return { success: false, error: "STARTUP_TIMEOUT" };
        if (sawGeneration && !ready.length && age > staleMs) {
          console.warn("[Gemini-media]", {
            runId,
            state: "stalled",
            responseCount: responses.length,
            candidateCount: candidates.length,
            lastProgressAgeMs: age,
            ...lastDiagnostic,
          });
          return { success: false, error: "GENERATION_STALLED" };
        }
        await sleep(pollMs);
      }
    } finally {
      observer.disconnect();
    }
    console.warn("[Gemini-media]", {
      runId,
      state: "timeout",
      responseCount: baseline.responseCount,
      currentResponseCount: _queryAllWithFallback("media_response_container")
        .length,
      lastProgressAgeMs: Date.now() - lastProgressAt,
      ...lastDiagnostic,
      timings: { absoluteMax, startupTimeout, staleMs, pollMs, stableRequired },
    });
    return { success: false, error: "ABSOLUTE_TIMEOUT" };
  }
  async function runGeminiMedia(message) {
    const runId = message.runId || `gemini-${Date.now()}`;
    if (__geminiMediaRun && __geminiMediaRun !== runId)
      return { success: false, error: "PROVIDER_BUSY" };
    __geminiMediaRun = runId;
    __geminiCallStartAt = Date.now();
    __geminiAbort = false;
    __geminiAbortAt = 0;
    ExecutionBlocker.show();
    try {
      const retryConversationPath = message.settings?.retryConversationPath;
      if (
        retryConversationPath &&
        retryConversationPath !== `${location.origin}${location.pathname}`
      )
        return { success: false, error: "CONVERSATION_CHANGED", noRetry: true };
      const mediaType = message.expect;
      __geminiSelectedMediaTool = null;
      if (mediaType !== "image" && mediaType !== "video")
        return { success: false, error: "INVALID_EXPECT" };
      const api = await getGeminiApiConfig();
      const monitor = api?.generation_monitor?.[mediaType];
      if (!monitor) return { success: false, error: "MONITOR_CONFIG_MISSING" };
      const interactionTimeout = Number(message.settings?.inputTimeoutMs);
      if (!Number.isFinite(interactionTimeout) || interactionTimeout <= 0)
        return { success: false, error: "INTERACTION_CONFIG_MISSING" };
      logGeminiMedia(runId, message, "preparing", {
        configVersion: api.__configVersion,
        timings: monitor,
      });
      if (
        detectGeminiChallenge() &&
        !(await waitForGeminiChallengeResolved(
          Number(monitor.challenge_wait_ms),
        ))
      )
        return { success: false, error: "CHALLENGE_TIMEOUT" };
      if (
        !(await waitProviderReady(Number(monitor.composer_ready_timeout_ms)))
      ) {
        if (isGeminiAbort()) return { success: false, error: "ABORTED" };
        return geminiReadinessFailure(
          "COMPOSER_NOT_READY",
          Number(monitor.composer_ready_timeout_ms),
        );
      }
      const previousDeadline =
        Date.now() + Number(monitor.previous_run_wait_ms || 0);
      while (isGeminiGenerating() && Date.now() < previousDeadline) {
        if (isGeminiAbort()) return { success: false, error: "ABORTED" };
        await sleep(Number(monitor.poll_interval_ms));
      }
      if (isGeminiGenerating())
        return { success: false, error: "PROVIDER_BUSY" };
      await sleep(
        Number(monitor.minimum_settle_ms || monitor.poll_interval_ms),
      );
      logGeminiMedia(runId, message, "new_chat");
      if (
        message.newChat !== false &&
        !(await tryGeminiNewChat(Number(monitor.new_chat_timeout_ms)))
      ) {
        return {
          success: false,
          error: isGeminiAbort() ? "ABORTED" : "NEW_CHAT_FAILED",
        };
      }
      logGeminiMedia(runId, message, "cleanup");
      const cleanComposer = _queryWithFallback("composer");
      const staleDraft = (
        cleanComposer?.value ||
        cleanComposer?.textContent ||
        ""
      ).trim();
      const stalePreviews = getGeminiComposerUploadedImages().length;
      if (staleDraft || stalePreviews > 0)
        return { success: false, error: "COMPOSER_DIRTY" };
      const modelResult = await selectGeminiModelBestEffort(
        message.model,
        interactionTimeout,
        runId,
        Number(monitor.composer_ready_timeout_ms),
      );
      if (modelResult.error === "ABORTED") return modelResult;
      if (!modelResult.success && modelResult.error !== "MODEL_SWITCHER_HIDDEN")
        return modelResult;
      logGeminiMedia(
        runId,
        message,
        modelResult.success ? "model" : "model_skipped",
        {
          requestedModel: message.model?.value || null,
          reason: modelResult.success ? null : modelResult.error,
        },
      );
      if (Array.isArray(message.images) && message.images.length) {
        logGeminiMedia(runId, message, "upload", {
          refCount: message.images.length,
        });
        const before = getGeminiComposerUploadedImages().length;
        if (!(await uploadImages(message.images)))
          return { success: false, error: "REF_UPLOAD_FAILED" };
        const after = getGeminiComposerUploadedImages().length;
        if (after - before < message.images.length)
          return { success: false, error: "REF_UPLOAD_COUNT_MISMATCH" };
      }
      let toolResult = await activateGeminiTool(
        mediaType,
        interactionTimeout,
        Number(monitor.composer_ready_timeout_ms),
      );
      if (toolResult.error === "ABORTED" || isGeminiAbort())
        return { success: false, error: "ABORTED" };
      if (
        toolResult.success &&
        (!isGeminiToolSelected(mediaType) ||
          (modelResult.success && !isGeminiModelSelected(message.model)))
      ) {
        let modelRetry = modelResult;
        if (modelResult.success && !isGeminiModelSelected(message.model)) {
          modelRetry = await selectGeminiModelBestEffort(
            message.model,
            interactionTimeout,
            runId,
            Number(monitor.composer_ready_timeout_ms),
          );
          if (modelRetry.error === "ABORTED") return modelRetry;
        }
        toolResult = await activateGeminiTool(
          mediaType,
          interactionTimeout,
          Number(monitor.composer_ready_timeout_ms),
        );
        if (toolResult.error === "ABORTED" || isGeminiAbort())
          return { success: false, error: "ABORTED" };
        if (toolResult.success && !isGeminiToolSelected(mediaType))
          toolResult = { success: false, error: "TOOL_VERIFY_FAILED" };
        if (modelResult.success && !modelRetry.success) {
          return modelRetry;
        }
      }
      let modePromptPrefix = "";
      if (!toolResult.success) {
        const fallbackErrors = [
          "TOOL_CONFIG_MISSING",
          "TOOLS_MENU_NOT_FOUND",
          "TOOL_NOT_AVAILABLE",
          "TOOL_ACTIVATION_FAILED",
          "TOOL_VERIFY_FAILED",
        ];
        if (!fallbackErrors.includes(toolResult.error)) return toolResult;
        const configuredPrefix = api?.media_mode_prompt_prefixes?.[mediaType];
        if (typeof configuredPrefix !== "string" || !configuredPrefix.trim()) {
          return {
            success: false,
            error: "TOOL_PROMPT_PREFIX_MISSING",
            diagnostic: { mediaType, toolError: toolResult.error },
          };
        }
        modePromptPrefix = configuredPrefix.trim();
        logGeminiMedia(runId, message, "tool_prompt_fallback", {
          error: toolResult.error,
        });
      } else {
        logGeminiMedia(runId, message, "tool");
      }
      if (!(await closeGeminiToolsMenu(interactionTimeout))) {
        return {
          success: false,
          error: isGeminiAbort() ? "ABORTED" : "TOOLS_MENU_CLOSE_FAILED",
        };
      }
      let ratioPromptSuffix = message.ratioPromptSuffix || "";
      if (modePromptPrefix) {
        if (message.ratio && !ratioPromptSuffix)
          return {
            success: false,
            error:
              mediaType === "video"
                ? "VIDEO_RATIO_FALLBACK_MISSING"
                : "IMAGE_RATIO_FALLBACK_MISSING",
          };
        if (ratioPromptSuffix)
          logGeminiMedia(runId, message, "ratio_prompt_fallback", {
            ratio: message.ratio,
            error: toolResult.error,
          });
      } else if (mediaType === "video") {
        await sleep(Number(monitor.poll_interval_ms));
        const ratioResult = await selectGeminiVideoRatio(
          message.ratio,
          api,
          interactionTimeout,
        );
        if (ratioResult.error === "ABORTED") return ratioResult;
        if (ratioResult.success) {
          ratioPromptSuffix = "";
          logGeminiMedia(runId, message, "ratio", {
            ratio: message.ratio,
            fallback: false,
          });
        } else {
          if (!ratioPromptSuffix)
            return { success: false, error: "VIDEO_RATIO_FALLBACK_MISSING" };
          console.warn(
            "[Gemini-media] video ratio UI unavailable \u2014 using prompt suffix fallback",
            { ratio: message.ratio, error: ratioResult.error },
          );
          logGeminiMedia(runId, message, "ratio_prompt_fallback", {
            ratio: message.ratio,
            error: ratioResult.error,
          });
        }
      } else {
        const ratioResult = await selectGeminiImageRatio(
          message.ratio,
          api,
          interactionTimeout,
        );
        if (ratioResult.error === "ABORTED") return ratioResult;
        if (ratioResult.success) {
          ratioPromptSuffix = "";
          logGeminiMedia(runId, message, "ratio", {
            ratio: message.ratio,
            fallback: false,
          });
        } else {
          if (!ratioPromptSuffix) {
            return { success: false, error: "IMAGE_RATIO_FALLBACK_MISSING" };
          }
          console.warn(
            "[Gemini-media] image ratio UI unavailable \u2014 using prompt suffix fallback",
            { ratio: message.ratio, error: ratioResult.error },
          );
          logGeminiMedia(runId, message, "ratio_prompt_fallback", {
            ratio: message.ratio,
            error: ratioResult.error,
          });
        }
      }
      if (isGeminiAbort()) return { success: false, error: "ABORTED" };
      if (
        retryConversationPath &&
        retryConversationPath !== `${location.origin}${location.pathname}`
      )
        return { success: false, error: "CONVERSATION_CHANGED", noRetry: true };
      const baseline = snapshotGeminiMediaState(mediaType);
      if (retryConversationPath) baseline.acceptedConversationTransitions = 1;
      const prompt = `${
        modePromptPrefix
          ? `${modePromptPrefix}

`
          : ""
      }${message.text || ""}${ratioPromptSuffix}`;
      if (!(await insertText(prompt)))
        return { success: false, error: "INSERT_FAILED" };
      if (`${location.origin}${location.pathname}` !== baseline.path)
        return { success: false, error: "CONVERSATION_CHANGED" };
      logGeminiMedia(runId, message, "submitting");
      if (!(await clickSubmit(retryConversationPath)))
        return { success: false, error: "SEND_BUTTON_NOT_FOUND" };
      logGeminiMedia(runId, message, "generating");
      const transitionWindowMs = Number(monitor.minimum_settle_ms);
      const transitionPollMs = Number(monitor.poll_interval_ms);
      if (
        !Number.isFinite(transitionWindowMs) ||
        transitionWindowMs <= 0 ||
        !Number.isFinite(transitionPollMs) ||
        transitionPollMs <= 0
      ) {
        return { success: false, error: "MONITOR_CONFIG_INVALID" };
      }
      const pathDeadline = Date.now() + transitionWindowMs;
      const submittedPath = baseline.path;
      while (Date.now() < pathDeadline) {
        if (isGeminiAbort()) return { success: false, error: "ABORTED" };
        await sleep(
          Math.min(transitionPollMs, Math.max(1, pathDeadline - Date.now())),
        );
        const nextPath = `${location.origin}${location.pathname}`;
        if (nextPath !== submittedPath) {
          if (retryConversationPath)
            return {
              success: false,
              error: "CONVERSATION_CHANGED",
              noRetry: true,
            };
          const observedPath = nextPath;
          await sleep(transitionPollMs);
          if (`${location.origin}${location.pathname}` === observedPath) {
            baseline.path = observedPath;
            baseline.acceptedConversationTransitions = 1;
          } else return { success: false, error: "CONVERSATION_CHANGED" };
          break;
        }
      }
      const requestedTimeoutMs = Number(message.timeout);
      if (!Number.isFinite(requestedTimeoutMs) || requestedTimeoutMs <= 0)
        return { success: false, error: "TIMEOUT_CONFIG_UNAVAILABLE" };
      const effectiveMonitor = Object.freeze({
        ...monitor,
        absolute_max_wait_ms: Math.min(
          Number(monitor.absolute_max_wait_ms),
          requestedTimeoutMs,
        ),
      });
      const result = await waitForGeminiMediaResult(
        mediaType,
        baseline,
        effectiveMonitor,
        !!message.settings?.scrollDuringGen,
        api,
        runId,
        message,
      );
      logGeminiMedia(runId, message, result.success ? "completed" : "failed", {
        error: result.error || null,
        resultCount: result.resultCount || 0,
      });
      return result;
    } catch (error) {
      return {
        success: false,
        error: error?.message || "EXCEPTION",
        noRetry: error?.noRetry === true,
      };
    } finally {
      ExecutionBlocker.hide();
      if (__geminiMediaRun === runId) __geminiMediaRun = null;
    }
  }
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "gemini:ping") {
      sendResponse({ success: true, provider: PROVIDER, listenerReady: true });
      return false;
    }
    if (message.action === "workflow:geminiTrackerUpdate") {
      if ((message.data?.revision || 0) < (workflowTrackerData.revision || 0)) {
        sendResponse({ ok: true });
        return false;
      }
      workflowTrackerData = message.data || { jobs: [] };
      renderGeminiTracker();
      sendResponse({ ok: true });
      return false;
    }
    if (message.action === "pq:trackerUpdate") {
      const data = message.data;
      const incomingProvider = data?.trackerProvider || "flow";
      const currentProvider = queueTrackerData?.trackerProvider || null;
      const currentActive = !!(
        queueTrackerData?.jobs?.length && queueTrackerData.isRunning !== false
      );
      if (
        currentActive &&
        currentProvider === "gemini" &&
        incomingProvider !== "gemini"
      ) {
        sendResponse({ ok: true, ignored: true });
        return false;
      }
      _ftRichActive = !!(data?.jobs?.length && data.isRunning !== false);
      try {
        const tracker = ensureGeminiFloatingTracker();
        if (!tracker) {
          sendResponse({ ok: false, error: "TRACKER_HELPER_NOT_LOADED" });
          return false;
        }
        queueTrackerData = data || { jobs: [] };
        renderGeminiTracker();
      } catch (error) {
        console.warn(
          "[Gemini] tracker update failed:",
          error?.message || error,
        );
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
            `[Gemini] Provider config updated via SSE \u2014 reloaded ${keyCount} selectors`,
          );
        } else {
          _selectorConfig = null;
          _selectorConfigTime = 0;
          console.warn(
            "[Gemini] Provider config updated via SSE \u2014 storage empty, cache cleared",
          );
        }
        sendResponse({ success: true });
      });
      return true;
    }
    if (message.action === "gemini:submitAndWait") {
      console.log(
        "[Gemini-listener] gemini:submitAndWait nh\u1EADn, text len:",
        (message.text || "").length,
        "images:",
        (message.images || []).length,
      );
      if (message.expect === "image" || message.expect === "video") {
        runGeminiMedia(message).then(sendResponse);
        return true;
      }
      __geminiCallStartAt = Date.now();
      __geminiAbort = false;
      __geminiAbortAt = 0;
      (async () => {
        try {
          if (detectGeminiChallenge()) {
            console.info(
              "[Gemini-text] Submit waiting for challenge verification",
            );
            const resolved = await waitForGeminiChallengeResolved(12e4);
            if (!resolved) {
              sendResponse({
                success: false,
                error: "CHALLENGE_TIMEOUT",
                message:
                  "Gemini requires verification. Please open the Gemini tab, complete verification, then run again.",
              });
              return;
            }
          }
          const baseline = snapshotGeminiState();
          console.info("[Gemini-text] Submit baseline captured", {
            turnCount: baseline.turnCount,
          });
          if (Array.isArray(message.images) && message.images.length > 0) {
            const uploaded = await uploadImages(message.images);
            if (!uploaded) {
              sendResponse({
                success: false,
                error: "REF_UPLOAD_FAILED",
                message: "Cannot upload ref image to Gemini",
              });
              return;
            }
            await sleep(500);
          }
          console.info("[Gemini-text] Reading enhance prefix from storage");
          const enhancePrefix = await getEnhancePrefix();
          const promptText = enhancePrefix + (message.text || "");
          console.info("[Gemini-text] Inserting prompt", {
            chars: promptText.length,
          });
          const textInserted = await insertText(promptText);
          if (!textInserted) {
            sendResponse({
              success: false,
              error: "INSERT_FAILED",
              diagnostics: lastGeminiInsertAudit,
            });
            return;
          }
          await sleep(500);
          const submitted = await clickSubmit();
          if (!submitted) {
            sendResponse({ success: false, error: "SEND_BUTTON_NOT_FOUND" });
            return;
          }
          const timeout = Number(message.timeout);
          if (!Number.isFinite(timeout) || timeout <= 0) {
            sendResponse({
              success: false,
              error: "TIMEOUT_CONFIG_UNAVAILABLE",
            });
            return;
          }
          const result = await waitForGeminiTextResult(baseline, timeout);
          sendResponse(result);
        } catch (err) {
          sendResponse({
            success: false,
            error: "EXCEPTION",
            message: err.message || "Unknown error",
          });
        }
      })();
      return true;
    }
    if (message.action === "gemini:fetchMedia") {
      (async () => {
        try {
          const source = new URL(message.url, location.href);
          const api = await getGeminiApiConfig();
          const allowedHosts = Array.isArray(api?.media_allowed_hosts)
            ? api.media_allowed_hosts
            : [];
          const hostAllowed = allowedHosts.some(
            (host) =>
              source.hostname === host || source.hostname.endsWith(`.${host}`),
          );
          if (source.protocol !== "https:" || !hostAllowed) {
            sendResponse({ success: false, error: "INVALID_MEDIA_URL" });
            return;
          }
          const response = await fetch(source.href, { credentials: "include" });
          if (!response.ok) throw new Error(`MEDIA_FETCH_${response.status}`);
          const blob = await response.blob();
          const maxBytes = Number(message.maxBytes);
          if (
            !Number.isFinite(maxBytes) ||
            maxBytes <= 0 ||
            blob.size > maxBytes
          ) {
            sendResponse({
              success: false,
              error: "MEDIA_PAYLOAD_TOO_LARGE",
              size: blob.size,
            });
            return;
          }
          const reader = new FileReader();
          reader.onload = () =>
            sendResponse({
              success: true,
              base64: reader.result,
              mimeType: blob.type,
              size: blob.size,
            });
          reader.onerror = () =>
            sendResponse({ success: false, error: "MEDIA_READ_FAILED" });
          reader.readAsDataURL(blob);
        } catch (error) {
          sendResponse({
            success: false,
            error: error.message || "MEDIA_FETCH_FAILED",
          });
        }
      })();
      return true;
    }
    if (message.action === "gemini:downloadImageNative") {
      downloadGeminiImageNative(message.fingerprint)
        .then(sendResponse)
        .catch((error) => {
          sendResponse({
            success: false,
            error: error?.message || "GEMINI_NATIVE_DOWNLOAD_FAILED",
          });
        });
      return true;
    }
    if (message.action === "gemini:downloadVideoNative") {
      downloadGeminiVideoNative(message.fingerprint)
        .then(sendResponse)
        .catch((error) => {
          sendResponse({
            success: false,
            error: error?.message || "GEMINI_NATIVE_VIDEO_DOWNLOAD_FAILED",
          });
        });
      return true;
    }
    if (message.action === "gemini:abort") {
      if (
        Number.isFinite(message.requestedAt) &&
        __geminiCallStartAt > message.requestedAt
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
      __geminiAbort = true;
      __geminiAbortAt = Date.now();
      const stopBtn = _queryWithFallback("stop_button");
      if (stopBtn) {
        try {
          simulateClick(stopBtn);
        } catch (_) {}
      }
      console.log(
        "[Gemini-listener] gemini:abort received at",
        __geminiAbortAt,
      );
      ExecutionBlocker.hide();
      const callStart = __geminiCallStartAt;
      (async () => {
        for (
          let i = 0;
          i < 10 && __geminiCallStartAt === callStart && isGeminiGenerating();
          i++
        )
          await sleep(200);
        const superseded = __geminiCallStartAt !== callStart;
        const selectorsReady =
          !!_getDynamicSelector("stop_button")?.selectors?.length &&
          !!_getDynamicSelector("generation_busy_indicator")?.selectors?.length;
        const providerStopped =
          selectorsReady && !superseded && !isGeminiGenerating();
        console.log("[Gemini] abort confirmation", {
          providerStopped,
          stopClicked: !!stopBtn,
          superseded,
        });
        sendResponse({
          success: true,
          abortReceived: true,
          providerStopped,
          stopClicked: !!stopBtn,
          superseded,
        });
      })().catch(() =>
        sendResponse({
          success: true,
          abortReceived: true,
          providerStopped: false,
        }),
      );
      return true;
    }
    if (message.action === "provider:textTask") {
      console.info(
        "[GeminiPATextTaskAudit]",
        JSON.stringify({
          stage: "received",
          chars: (message.text || "").length,
          images: message.images?.length || 0,
        }),
      );
      __geminiCallStartAt = Date.now();
      __geminiAbort = false;
      __geminiAbortAt = 0;
      ExecutionBlocker.show();
      (async () => {
        try {
          if (
            typeof detectGeminiChallenge === "function" &&
            detectGeminiChallenge()
          ) {
            const resolved = await waitForGeminiChallengeResolved(12e4);
            if (!resolved) {
              sendResponse({ success: false, error: "CHALLENGE_TIMEOUT" });
              return;
            }
          }
          if (isGeminiAbort()) {
            sendResponse({ success: false, error: "ABORTED" });
            return;
          }
          if (!(await waitProviderReady())) {
            sendResponse({ success: false, error: "PROVIDER_NOT_READY" });
            return;
          }
          let isolated = !!message.tabFreshlyCreated;
          if (message.newChat && !isolated) {
            try {
              isolated = await tryGeminiNewChat();
            } catch (_) {}
          }
          const baseline = snapshotGeminiState();
          if (isGeminiAbort()) {
            sendResponse({ success: false, error: "ABORTED" });
            return;
          }
          if (Array.isArray(message.images) && message.images.length > 0) {
            await uploadImages(message.images);
            if (isGeminiAbort()) {
              sendResponse({ success: false, error: "ABORTED" });
              return;
            }
            if (!_queryWithFallback("image_preview")) {
              sendResponse({ success: false, error: "IMAGE_UPLOAD_FAILED" });
              return;
            }
            await sleep(350);
          }
          console.info(
            "[GeminiPATextTaskAudit]",
            JSON.stringify({
              stage: "inserting",
              isolated,
              chars: (message.text || "").length,
            }),
          );
          const inserted = await insertText(message.text || "");
          if (!inserted) {
            sendResponse({
              success: false,
              error: "INSERT_FAILED",
              diagnostics: lastGeminiInsertAudit,
            });
            return;
          }
          if (isGeminiAbort()) {
            sendResponse({ success: false, error: "ABORTED" });
            return;
          }
          await sleep(300);
          const submitted = await clickSubmit();
          if (!submitted) {
            sendResponse({ success: false, error: "SEND_BUTTON_NOT_FOUND" });
            return;
          }
          const result = await waitForGeminiTextResult(
            baseline,
            message.timeout || 9e4,
          );
          if (message.deleteAfter && result?.success && isolated) {
            try {
              await deleteCurrentConversation();
            } catch (e) {
              console.warn("[Gemini-i2p] delete after failed:", e.message);
            }
          } else if (message.deleteAfter && result?.success && !isolated) {
            console.warn(
              "[Gemini-i2p] skip deleteAfter \u2014 kh\xF4ng bi\u1EC7t l\u1EADp \u0111\u01B0\u1EE3c h\u1ED9i tho\u1EA1i (tr\xE1nh x\xF3a nh\u1EA7m chat user)",
            );
          }
          sendResponse(result);
        } catch (err) {
          sendResponse({
            success: false,
            error: "EXCEPTION",
            message: err.message || String(err),
          });
        } finally {
          ExecutionBlocker.hide();
        }
      })();
      return true;
    }
    if (message.action === "gemini:deleteCurrentConversation") {
      if (
        message.expectedConversationUrl &&
        location.href !== message.expectedConversationUrl
      ) {
        sendResponse({ success: false, error: "CONVERSATION_CHANGED" });
        return false;
      }
      (async () => {
        try {
          const success = await deleteCurrentConversation(message);
          sendResponse({
            success,
            error: success ? void 0 : "CLEANUP_NOT_CONFIRMED",
          });
        } catch (err) {
          console.error(
            "[Gemini-listener] deleteCurrentConversation error:",
            err,
          );
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }
    return false;
  });
  window._tobyflowGeminiListenerReady = true;
  console.log(
    "[ChatAI] Content script Gemini \u0111\xE3 \u0111\u01B0\u1EE3c inject (Phase X + CG-8)",
  );
})();
