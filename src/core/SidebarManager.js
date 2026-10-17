var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) =>
  key in obj
    ? __defProp(obj, key, {
        enumerable: true,
        configurable: true,
        writable: true,
        value,
      })
    : (obj[key] = value);
var __publicField = (obj, key, value) =>
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
const _SidebarManager = class _SidebarManager {
  static _applySyncEntry(selector, entry, settings, respectUserSet) {
    const el = document.querySelector(selector);
    if (!el || settings[entry.key] === void 0) return;
    if (respectUserSet && el.dataset.userSet === "true") return;
    if (entry.type === "checkbox") el.checked = !!settings[entry.key];
    else el.value = String(settings[entry.key]);
  }
  static _syncDomFromSettings(settings) {
    for (const [sel, entry] of Object.entries(_SidebarManager.SYNC_MAP_LIVE)) {
      _SidebarManager._applySyncEntry(sel, entry, settings, false);
    }
    for (const [sel, entry] of Object.entries(
      _SidebarManager.SYNC_MAP_RESPECTFUL,
    )) {
      _SidebarManager._applySyncEntry(sel, entry, settings, true);
    }
    _SidebarManager._bindUserSetTracking();
  }
  static _bindUserSetTracking() {
    for (const sel of Object.keys(_SidebarManager.SYNC_MAP_RESPECTFUL)) {
      const el = document.querySelector(sel);
      if (!el || el.dataset._userSetBound === "true") continue;
      el.dataset._userSetBound = "true";
      const markUserSet = () => {
        el.dataset.userSet = "true";
      };
      el.addEventListener("change", markUserSet);
      if (
        el.tagName === "INPUT" &&
        (el.type === "text" || el.type === "number")
      ) {
        el.addEventListener("input", markUserSet);
      }
    }
  }
  static async init() {
    _SidebarManager._bindCoreEvents();
    setTimeout(() => _SidebarManager._bindUserSetTracking(), 500);
    if (window.GenTab) {
      window.GenTab.init();
    }
    if (window.TobyFlowApp) {
      window.TobyFlowApp.init();
    }
  }
  static _bindCoreEvents() {
    const tabBtns = document.querySelectorAll(".tobyflow-tab");
    const tabPanes = document.querySelectorAll(".tab-pane");
    tabBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        tabBtns.forEach((b) => b.classList.remove("active"));
        tabPanes.forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        btn.classList.remove("has-new");
        const targetPane = document.getElementById(btn.dataset.tab);
        if (targetPane) targetPane.classList.add("active");
        chrome.storage.local
          .set({ af_active_sidebar_tab: btn.dataset.tab })
          .catch(() => {});
      });
    });
    _SidebarManager._restoreActiveTab(tabBtns, tabPanes);
    const clearLogsBtn = document.getElementById("clearLogsBtn");
    if (clearLogsBtn) {
      clearLogsBtn.addEventListener("click", () => {
        const logContainer = document.getElementById("logContainer");
        if (logContainer) logContainer.innerHTML = "";
        window.showNotification?.(
          window.I18n?.t("logs.logsCleared") || "Logs cleared",
          "success",
        );
      });
    }
    const exportLogsBtn = document.getElementById("exportLogsBtn");
    if (exportLogsBtn) {
      exportLogsBtn.addEventListener("click", () => {
        const logContainer = document.getElementById("logContainer");
        if (!logContainer) return;
        const entries = logContainer.querySelectorAll(".log-entry");
        if (entries.length === 0) {
          console.log(
            "[TobyFlow] Kh\xF4ng c\xF3 log n\xE0o \u0111\u1EC3 xu\u1EA5t",
          );
          return;
        }
        const lines = [];
        let firstTime = "";
        let lastTime = "";
        entries.forEach((entry, i) => {
          const timeEl = entry.querySelector(".log-time");
          const msgEl = entry.querySelector(".log-msg") || entry;
          const time = timeEl ? timeEl.textContent.trim() : "";
          const msg = msgEl.textContent.replace(time, "").trim();
          if (i === 0) firstTime = time;
          lastTime = time;
          lines.push(`[${time}] ${msg}`);
        });
        const now = new Date();
        const dateStr =
          window.I18n?.formatDate?.(now) || now.toLocaleDateString();
        const header = [
          "=".repeat(60),
          `Toby Flow - Nh\u1EADt k\xFD ho\u1EA1t \u0111\u1ED9ng`,
          `Ng\xE0y xu\u1EA5t: ${dateStr}`,
          `T\u1ED5ng s\u1ED1 m\u1EE5c: ${entries.length}`,
          `Kho\u1EA3ng th\u1EDDi gian: ${firstTime} - ${lastTime}`,
          "=".repeat(60),
          "",
        ].join("\n");
        const content = header + lines.join("\n");
        const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `tobyflow-log-${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log(
          "[TobyFlow] \u0110\xE3 xu\u1EA5t",
          entries.length,
          "m\u1EE5c log",
        );
        window.showNotification?.(
          window.I18n?.t("logs.logsExported", { count: entries.length }) ||
            `Exported ${entries.length} log entries`,
          "success",
        );
      });
    }
    const settingsDropdown = document.getElementById("settingsDropdown");
    const settingsDropdownBtn = document.getElementById("settingsDropdownBtn");
    const settingsMenu = document.getElementById("settingsMenu");
    if (settingsDropdownBtn && settingsDropdown) {
      settingsDropdownBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        settingsDropdown.classList.toggle("open");
        if (settingsDropdown.classList.contains("open"))
          void window.FlowCookieRecovery?.updateMenuVisibility(
            document
              .getElementById("footerFlowApiBtn")
              ?.getAttribute("aria-pressed") === "true",
          );
      });
      document.addEventListener("click", (e) => {
        if (!settingsDropdown.contains(e.target)) {
          settingsDropdown.classList.remove("open");
        }
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          settingsDropdown.classList.remove("open");
        }
      });
    }
    const themeToggleBtn = document.getElementById("themeToggleBtn");
    if (themeToggleBtn) {
      let updateThemeIcon2 = function (theme) {
        const sunIcon = document.getElementById("themeIconSun");
        const moonIcon = document.getElementById("themeIconMoon");
        const themeLabel = document.getElementById("themeToggleLabel");
        if (!sunIcon || !moonIcon) return;
        const isDark =
          theme === "dark" ||
          (theme === "system" &&
            window.matchMedia("(prefers-color-scheme: dark)").matches);
        sunIcon.classList.toggle("hidden", isDark);
        moonIcon.classList.toggle("hidden", !isDark);
        if (themeLabel) {
          themeLabel.textContent = isDark
            ? window.I18n?.t("header.lightMode") || "Light Mode"
            : window.I18n?.t("header.darkMode") || "Dark Mode";
        }
      };
      var updateThemeIcon = updateThemeIcon2;
      chrome.storage.local.get(["af_settings"], (res) => {
        const theme = res.af_settings?.theme || "dark";
        updateThemeIcon2(theme);
      });
      themeToggleBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const root = document.getElementById("flow-auto-sidebar-root");
        const isCurrentlyLight = root?.classList.contains("theme-light");
        const newTheme = isCurrentlyLight ? "dark" : "light";
        if (root) {
          root.classList.remove("theme-light", "theme-dark");
          root.classList.add(`theme-${newTheme}`);
        }
        updateThemeIcon2(newTheme);
        const result = await new Promise((r) =>
          chrome.storage.local.get(["af_settings"], r),
        );
        const settings = { ...(result.af_settings || {}), theme: newTheme };
        await new Promise((r) =>
          chrome.storage.local.set({ af_settings: settings }, r),
        );
      });
    }
    const openSettingsBtn = document.getElementById("openSettingsBtn");
    if (openSettingsBtn) {
      openSettingsBtn.addEventListener("click", () => {
        settingsDropdown?.classList.remove("open");
        chrome.runtime.sendMessage({ action: "openSettings" });
      });
    }
    document
      .getElementById("clearFlowCookiesBtn")
      ?.addEventListener("click", () => {
        settingsDropdown?.classList.remove("open");
        void window.FlowCookieRecovery?.showManual();
      });
    _SidebarManager._initTabMonitor();
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.af_settings) {
        const settings = changes.af_settings.newValue || {};
        const root = document.getElementById("flow-auto-sidebar-root");
        if (root) {
          root.classList.remove("theme-light", "theme-dark");
          if (settings.theme === "light") root.classList.add("theme-light");
          else if (settings.theme === "system") {
            root.classList.add(
              window.matchMedia("(prefers-color-scheme: dark)").matches
                ? "theme-dark"
                : "theme-light",
            );
          }
        }
        if (window.workflowExecutor) {
          const wfConfig =
            window.ExecutionConfig?.safeGetWorkflowConfig() || {};
          window.workflowExecutor.settings = {
            delayBetweenNodes: (wfConfig.delay_nodes_sec ?? 3) * 1e3,
            retryOnFail: (wfConfig.max_retries ?? 0) > 0,
            maxRetries: wfConfig.max_retries ?? 2,
            timeout: (wfConfig.timeout_sec ?? 180) * 1e3,
            stopOnError: wfConfig.on_error === "stop",
          };
        }
        _SidebarManager._syncDomFromSettings(settings);
        console.log("[TobyFlow] Settings updated from settings window");
      }
    });
  }
  static _initTabMonitor() {
    const checkFlowTabExists = async () => {
      try {
        const flowTabs = await chrome.tabs.query({
          url: window.ProviderConfigManager?.getTabQueryPatterns("flow") || [],
        });
        const hasFlowTab = flowTabs.length > 0;
        _SidebarManager._toggleFlowOverlay(!hasFlowTab);
      } catch (e) {}
    };
    chrome.tabs.onRemoved.addListener(() => checkFlowTabExists());
    chrome.tabs.onCreated.addListener(() => checkFlowTabExists());
    chrome.tabs.onUpdated.addListener((tabId, info) => {
      if (info.url || info.status === "complete") checkFlowTabExists();
    });
    checkFlowTabExists();
  }
  static _toggleFlowOverlay(show) {
    let overlay = document.getElementById("flowTabOverlay");
    if (show && !overlay) {
      document
        .querySelectorAll(".project-select-overlay")
        .forEach((projectOverlay) => {
          projectOverlay.remove();
        });
      overlay = document.createElement("div");
      overlay.id = "flowTabOverlay";
      overlay.className = "flow-tab-overlay";
      const t = (key, fallback) => window.I18n?.t?.(key) || fallback;
      overlay.innerHTML = `
        <div class="flow-tab-overlay-content">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.4">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
          <p style="margin: 12px 0 4px; font-weight: 600;">${t("app.noFlowTabTitle", "Google Flow tab not open")}</p>
          <p style="font-size: 12px; color: var(--muted-foreground); margin-bottom: 16px;">${t("app.noFlowTabDesc", "Open a project on flow.google.com to use generation features")}</p>
          <button class="btn btn-primary btn-sm" id="goToFlowBtn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            ${t("app.openFlowTab", "Open Google Flow")}
          </button>
          <div class="flow-tab-overlay-auth-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-auth-mode="login">
              ${t("auth.login", "Login")}
            </button>
            <button type="button" class="btn btn-primary btn-sm" data-auth-mode="register">
              ${t("auth.register", "Register")}
            </button>
          </div>
        </div>
      `;
      (
        document.getElementById("flow-auto-sidebar-root") || document.body
      ).appendChild(overlay);
      overlay.querySelector("#goToFlowBtn")?.addEventListener("click", () => {
        chrome.runtime.sendMessage({
          action: "openOrActivateTab",
          urlPattern:
            window.ProviderConfigManager?.getTabQueryPatterns("flow") || [],
          createUrl: window.ProviderConfigManager?.getCreateUrl("flow"),
          activate: true,
        });
      });
      overlay.querySelectorAll("[data-auth-mode]").forEach((btn) => {
        btn.addEventListener("click", () =>
          window.openAuthModal?.(btn.dataset.authMode),
        );
      });
    } else if (!show && overlay) {
      overlay.remove();
    }
  }
  static async _restoreActiveTab(tabBtns, tabPanes) {
    try {
      const result = await new Promise((r) =>
        chrome.storage.local.get("af_active_sidebar_tab", r),
      );
      const savedTabId = result?.af_active_sidebar_tab;
      if (!savedTabId) return;
      const currentActive = document.querySelector(".tobyflow-tab.active");
      if (currentActive?.dataset.tab === savedTabId) return;
      const targetBtn = document.querySelector(
        `.tobyflow-tab[data-tab="${savedTabId}"]`,
      );
      if (!targetBtn) return;
      tabBtns.forEach((b) => b.classList.remove("active"));
      tabPanes.forEach((p) => p.classList.remove("active"));
      targetBtn.classList.add("active");
      targetBtn.classList.remove("has-new");
      const targetPane = document.getElementById(savedTabId);
      if (targetPane) targetPane.classList.add("active");
      console.log("[TobyFlow] Tab restored from storage:", savedTabId);
    } catch (err) {
      console.warn("[TobyFlow] Tab restore failed:", err.message);
    }
  }
};
__publicField(_SidebarManager, "SYNC_MAP_LIVE", {
  "#genTabAutoDownload": { key: "autoDownload", type: "checkbox" },
  "#genChatgptDeleteAfterGen": {
    key: "chatgptDeleteAfterGen",
    type: "checkbox",
  },
  "#genGeminiDeleteAfterGen": { key: "geminiDeleteAfterGen", type: "checkbox" },
  "#genMuseDeleteAfterGen": { key: "museDeleteAfterGen", type: "checkbox" },
});
__publicField(_SidebarManager, "SYNC_MAP_RESPECTFUL", {
  "#genType": { key: "defaultGenType", type: "value" },
  "#imageModel": { key: "defaultImageModel", type: "value" },
  "#videoModel": { key: "defaultVideoModel", type: "value" },
  "#flowVideoDuration": { key: "defaultVideoDuration", type: "value" },
  "#grokDuration": { key: "grokDefaultDuration", type: "value" },
  "#grokResolution": { key: "grokDefaultResolution", type: "value" },
  "#grokImageQuality": { key: "grokDefaultImageQuality", type: "value" },
  "#genTabDownloadResolution": { key: "downloadResolution", type: "value" },
  "#genTabVideoDownloadResolution": {
    key: "videoDownloadResolution",
    type: "value",
  },
});
let SidebarManager = _SidebarManager;
window.SidebarManager = SidebarManager;
