(function () {
  "use strict";
  const DEBUG = true;
  const BANK_NAMES = {
    MB: "MB Bank",
    TCB: "Techcombank",
    VCB: "Vietcombank",
    ACB: "ACB",
    BIDV: "BIDV",
    VTB: "Vietinbank",
    TPB: "TPBank",
    STB: "Sacombank",
    SHB: "SHB",
    MSB: "MSB",
    VPB: "VPBank",
    SCB: "SCB",
    OCB: "OCB",
    EIB: "Eximbank",
  };
  function log(...args) {
    if (DEBUG) console.log("[TobyFlow]", ...args);
  }
  function sidebarLog(msg, level = "info") {
    console.log(`[TobyFlow] ${msg}`);
    const logContainer = document.getElementById("logContainer");
    if (logContainer) {
      const div = document.createElement("div");
      div.className = `log-entry ${level}`;
      div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
      logContainer.appendChild(div);
      logContainer.scrollTop = logContainer.scrollHeight;
    }
    const logTabBtn = document.querySelector(
      '.tobyflow-tab[data-tab="tab-logs"]',
    );
    if (logTabBtn && !logTabBtn.classList.contains("active")) {
      logTabBtn.classList.add("has-new");
    }
  }
  window.sidebarLog = sidebarLog;
  function ensureAuthModalTopLayer() {
    const loginOverlay2 = document.getElementById("loginOverlay");
    if (!loginOverlay2 || !document.body) return;
    if (loginOverlay2.parentElement !== document.body) {
      document.body.appendChild(loginOverlay2);
    }
    const sidebarRoot = document.getElementById("flow-auto-sidebar-root");
    document.body.classList.toggle(
      "theme-light",
      !!sidebarRoot?.classList.contains("theme-light"),
    );
  }
  window.openAuthModal = function (mode = "login") {
    const showRegister = mode === "register";
    const loginOverlay2 = document.getElementById("loginOverlay");
    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");
    const title = document.getElementById("loginModalTitle");
    if (!loginOverlay2 || !loginForm || !registerForm) return false;
    ensureAuthModalTopLayer();
    loginForm.classList.toggle("hidden", showRegister);
    registerForm.classList.toggle("hidden", !showRegister);
    if (title) {
      title.textContent = showRegister
        ? window.I18n?.t("auth.register") || "Register"
        : window.I18n?.t("auth.login") || "Login";
    }
    loginOverlay2.classList.remove("hidden");
    setTimeout(() => {
      document
        .getElementById(showRegister ? "registerName" : "loginEmail")
        ?.focus();
    }, 0);
    return true;
  };
  ensureAuthModalTopLayer();
  const _notifIcons = {
    success:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
    error:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
    info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
    warning:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
  };
  let _notifTimer = null;
  let _lastNotif = { key: "", timestamp: 0 };
  window.showNotification = function (message, type = "success", duration) {
    const ms =
      typeof duration === "number" ? duration : type === "error" ? 5e3 : 2500;
    const dedupKey = `${type}::${message}`;
    const now = Date.now();
    if (_lastNotif.key === dedupKey && now - _lastNotif.timestamp < 3e3) {
      return;
    }
    _lastNotif = { key: dedupKey, timestamp: now };
    const existing = document.querySelector(".tobyflow-notification");
    if (existing) {
      clearTimeout(_notifTimer);
      existing.remove();
    }
    const el = document.createElement("div");
    el.className = `tobyflow-notification ${type}`;
    el.innerHTML = `${_notifIcons[type] || _notifIcons.info}<span>${message}</span>`;
    document.body.appendChild(el);
    const RESUME_DURATION = 1500;
    const startDismissTimer = (delay) => {
      _notifTimer = setTimeout(() => {
        el.classList.add("tobyflow-notif-out");
        setTimeout(() => el.remove(), 300);
      }, delay);
    };
    startDismissTimer(ms);
    el.addEventListener("mouseenter", () => {
      if (_notifTimer) {
        clearTimeout(_notifTimer);
        _notifTimer = null;
      }
    });
    el.addEventListener("mouseleave", () => {
      if (!el.classList.contains("tobyflow-notif-out")) {
        startDismissTimer(RESUME_DURATION);
      }
    });
  };
  function _showCloudflareToast(msg) {
    const existing = document.getElementById("tobyflow-cloudflare-toast");
    const ELAPSED_URGENT_SEC = 30;
    const provider = msg.provider || "grok";
    const providerLabel =
      provider === "grok"
        ? "Grok"
        : provider.charAt(0).toUpperCase() + provider.slice(1);
    const _t = (key, params, fallback) => {
      const result = window.I18n?.t(key, params);
      return result && result !== key && !result.startsWith("cloudflare.")
        ? result
        : fallback;
    };
    if (msg.phase === "resolved") {
      if (existing) {
        existing.classList.add("tobyflow-notif-out");
        setTimeout(() => existing.remove(), 300);
      }
      window.showNotification?.(
        _t(
          "cloudflare.resolved",
          { provider: providerLabel, sec: msg.elapsedSec },
          `\u2713 Cloudflare ${providerLabel} \u0111\xE3 verify (${msg.elapsedSec}s)`,
        ),
        "success",
        3e3,
      );
      return;
    }
    if (msg.phase === "timeout") {
      if (existing) existing.remove();
      window.showNotification?.(
        _t(
          "cloudflare.timeout",
          { provider: providerLabel },
          `\u26A0\uFE0F Cloudflare ${providerLabel} verify timeout \u2014 vui l\xF2ng th\u1EED l\u1EA1i`,
        ),
        "error",
        5e3,
      );
      return;
    }
    const elapsed = msg.elapsedSec || 0;
    const isUrgent = elapsed >= ELAPSED_URGENT_SEC;
    const titleText = isUrgent
      ? _t(
          "cloudflare.urgent",
          { provider: providerLabel },
          `\u{1F6E1}\uFE0F Cloudflare ${providerLabel} \u2014 c\u1EA7n b\u1EA1n click verify!`,
        )
      : _t(
          "cloudflare.detected",
          { provider: providerLabel },
          `\u{1F6E1}\uFE0F Cloudflare ${providerLabel} challenge \u2014 \u0111ang ch\u1EDD verify\u2026`,
        );
    const subtitleText = _t(
      "cloudflare.subtitle",
      { sec: elapsed },
      `\u0110\xE3 ch\u1EDD ${elapsed}s. N\u1EBFu l\xE2u kh\xF4ng pass, h\xE3y click v\xE0o tab ${providerLabel} \u0111\u1EC3 verify th\u1EE7 c\xF4ng.`,
    );
    const openTabText = _t(
      "cloudflare.openTab",
      { provider: providerLabel },
      `M\u1EDF ${providerLabel}`,
    );
    let el = existing;
    if (!el) {
      el = document.createElement("div");
      el.id = "tobyflow-cloudflare-toast";
      el.className = "tobyflow-cloudflare-toast";
      document.body.appendChild(el);
    }
    el.classList.toggle("is-urgent", isUrgent);
    el.innerHTML = `
      <div class="tobyflow-cf-toast-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
      </div>
      <div class="tobyflow-cf-toast-body">
        <div class="tobyflow-cf-toast-title">${titleText}</div>
        <div class="tobyflow-cf-toast-subtitle">${subtitleText}</div>
      </div>
      <button type="button" class="tobyflow-cf-toast-btn" data-action="focus-tab">
        ${openTabText}
      </button>
    `;
    el.querySelector('[data-action="focus-tab"]')?.addEventListener(
      "click",
      () => {
        try {
          chrome.runtime.sendMessage({
            action: "grok:ensureActive",
            focusWindow: true,
            reason: "user_click_toast",
          });
        } catch (_) {}
      },
    );
  }
  try {
    chrome.runtime?.onMessage?.addListener((msg) => {
      if (msg?.action === "cloudflare:challenge") {
        try {
          _showCloudflareToast(msg);
        } catch (e) {
          console.warn("[CloudflareToast] error:", e?.message);
        }
      }
    });
  } catch (_) {}
  window._currentProjectId = null;
  window._currentProjectName = null;
  window._targetFlowTabId = null;
  let _projectNavigating = false;
  let _projectContextResolved = false;
  let _isInitialRetrying = false;
  function _showConnectingOverlay() {
    const overlay = document.getElementById("tobyflow-connecting-overlay");
    if (overlay) {
      overlay.classList.remove("hidden");
    }
  }
  function _hideConnectingOverlay() {
    const overlay = document.getElementById("tobyflow-connecting-overlay");
    if (overlay) {
      overlay.classList.add("hidden");
    }
  }
  const _loginPollingState = {
    chatgpt: { active: false, intervalId: null },
    grok: { active: false, intervalId: null },
  };
  async function _pollProviderLogin(provider, tabId) {
    if (!tabId || !provider) return;
    const state = _loginPollingState[provider];
    if (!state) return;
    if (state.active) {
      console.log(`[TobyFlow] Already polling ${provider} login`);
      return;
    }
    state.active = true;
    const POLL_INTERVAL = 3e3;
    const TIMEOUT = 18e4;
    const startTime = Date.now();
    const providerName = provider === "chatgpt" ? "ChatGPT" : "Grok";
    const checkAction = `${provider}:checkLogin`;
    console.log(
      `[TobyFlow] Start polling ${provider} login status, tabId=${tabId}`,
    );
    const poll = async () => {
      if (Date.now() - startTime > TIMEOUT) {
        console.log(`[TobyFlow] ${provider} login polling timeout`);
        _stopLoginPolling(provider);
        return;
      }
      try {
        const tab = await chrome.tabs.get(tabId).catch(() => null);
        if (!tab) {
          console.log(`[TobyFlow] ${provider} tab closed, stop polling`);
          _stopLoginPolling(provider);
          return;
        }
        const resp = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: checkAction, tabId }, resolve);
        });
        if (resp?.success && resp?.ready) {
          console.log(`[TobyFlow] ${provider} login detected!`);
          _stopLoginPolling(provider);
          window.showNotification?.(
            window.I18n?.t(`${provider}.loginSuccess`) ||
              `Signed in to ${providerName}. You can re-run the task.`,
            "success",
            4e3,
          );
          window.eventBus?.emit(`${provider}:login_success`, { tabId });
        }
      } catch (err) {
        console.warn(`[TobyFlow] ${provider} login poll error:`, err.message);
      }
    };
    state.intervalId = setInterval(poll, POLL_INTERVAL);
    poll();
  }
  function _stopLoginPolling(provider) {
    const state = _loginPollingState[provider];
    if (!state) return;
    if (state.intervalId) {
      clearInterval(state.intervalId);
      state.intervalId = null;
    }
    state.active = false;
  }
  function _extractProjectNameFromTitle(title) {
    if (!title) return null;
    const parts = title.split(/\s*[-–—|]\s*/);
    for (const part of parts) {
      const candidate = part.trim();
      if (!candidate || candidate.length === 0 || candidate.length >= 100)
        continue;
      const lower = candidate.toLowerCase();
      if (
        lower === "flow" ||
        lower === "labs" ||
        lower.includes("labs.google") ||
        lower.includes("google")
      )
        continue;
      return candidate;
    }
    return null;
  }
  async function _saveProjectToList(projectId, projectName) {
    if (!projectId) return;
    try {
      const result = await chrome.storage.local.get("af_projects");
      const projects = result.af_projects || {};
      projects[projectId] = {
        name:
          projectName || projects[projectId]?.name || projectId.substring(0, 8),
        last_accessed: Date.now(),
      };
      await chrome.storage.local.set({ af_projects: projects });
      if (window.ProjectHelper?.syncCurrentProject && projectName) {
        window.ProjectHelper.syncCurrentProject().catch(() => {});
      }
    } catch (e) {
      console.warn("[TobyFlow] _saveProjectToList error:", e.message);
    }
  }
  async function _removeProjectFromList(projectId) {
    if (!projectId) return;
    try {
      const result = await chrome.storage.local.get("af_projects");
      const projects = result.af_projects || {};
      delete projects[projectId];
      await chrome.storage.local.set({ af_projects: projects });
    } catch (e) {
      console.warn("[TobyFlow] _removeProjectFromList error:", e.message);
    }
  }
  async function _cleanupStaleProjects() {
    try {
      const result = await chrome.storage.local.get("af_projects");
      const projects = result.af_projects || {};
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1e3;
      let changed = false;
      for (const [id, data] of Object.entries(projects)) {
        if (
          data.last_accessed &&
          data.last_accessed < cutoff &&
          id !== window._currentProjectId
        ) {
          delete projects[id];
          changed = true;
        }
      }
      if (changed) {
        await chrome.storage.local.set({ af_projects: projects });
        console.log(
          "[TobyFlow] \u0110\xE3 d\u1ECDn projects c\u0169 (>30 ng\xE0y)",
        );
      }
    } catch (e) {
      console.warn("[TobyFlow] _cleanupStaleProjects error:", e.message);
    }
  }
  async function _syncProjectsFromFlow() {
    try {
      const tabs = await chrome.tabs.query({
        url: window.ProviderConfigManager?.getTabQueryPatterns("flow"),
      });
      if (tabs.length === 0) return;
      const projectTabs = tabs.filter(
        (t) => t.url && t.url.match(/\/project\/[a-f0-9-]+/),
      );
      if (projectTabs.length > 0) {
        const result0 = await chrome.storage.local.get("af_projects");
        const projects0 = result0.af_projects || {};
        let changed0 = false;
        for (const pt of projectTabs) {
          const pidMatch = pt.url.match(/\/project\/([a-f0-9-]+)/);
          if (!pidMatch) continue;
          const pid = pidMatch[1];
          let pName = null;
          try {
            const ctxResp = await new Promise((resolve) => {
              chrome.tabs.sendMessage(
                pt.id,
                { action: "getProjectContext" },
                (r) => {
                  if (chrome.runtime.lastError) resolve(null);
                  else resolve(r);
                },
              );
            });
            pName = ctxResp?.projectName || null;
          } catch (e) {}
          if (!pName && pt.title) {
            pName = _extractProjectNameFromTitle(pt.title);
          }
          if (pName && projects0[pid] && projects0[pid].name !== pName) {
            projects0[pid].name = pName;
            changed0 = true;
          }
          if (pName && !projects0[pid]) {
            projects0[pid] = { name: pName, last_accessed: 0 };
            changed0 = true;
          }
        }
        if (changed0) {
          await chrome.storage.local.set({ af_projects: projects0 });
        }
      }
      const homeTab = tabs.find(
        (t) => t.url && !t.url.match(/\/project\/[a-f0-9-]+/),
      );
      const targetTab = homeTab || tabs[0];
      const resp = await new Promise((resolve) => {
        chrome.tabs.sendMessage(
          targetTab.id,
          { action: "scanFlowProjects" },
          (r) => {
            if (chrome.runtime.lastError) resolve(null);
            else resolve(r);
          },
        );
      });
      if (!resp?.projects?.length) return;
      const result = await chrome.storage.local.get("af_projects");
      const projects = result.af_projects || {};
      let changed = false;
      const flowProjectIds = new Set(resp.projects.map((p) => p.id));
      for (const fp of resp.projects) {
        if (fp.name && projects[fp.id] && projects[fp.id].name !== fp.name) {
          projects[fp.id].name = fp.name;
          changed = true;
        }
        if (!projects[fp.id]) {
          projects[fp.id] = {
            name: fp.name || fp.id.substring(0, 8),
            last_accessed: 0,
          };
          changed = true;
        }
      }
      if (resp.isHomePage) {
        for (const [id, data] of Object.entries(projects)) {
          if (!flowProjectIds.has(id) && id !== window._currentProjectId) {
            if (!data._notOnFlow) {
              projects[id]._notOnFlow = Date.now();
              changed = true;
            } else if (Date.now() - data._notOnFlow > 7 * 24 * 60 * 60 * 1e3) {
              delete projects[id];
              changed = true;
            }
          } else if (data._notOnFlow && flowProjectIds.has(id)) {
            delete data._notOnFlow;
            changed = true;
          }
        }
      }
      if (changed) {
        await chrome.storage.local.set({ af_projects: projects });
      }
    } catch (e) {
      console.warn("[TobyFlow] _syncProjectsFromFlow error:", e.message);
    }
  }
  function _updateProjectIndicator() {
    const indicator = document.getElementById("project-indicator");
    const nameEl = document.getElementById("project-indicator-name");
    if (!indicator || !nameEl) return;
    if (window._currentProjectId && window._currentProjectName) {
      indicator.style.display = "";
      nameEl.textContent = window._currentProjectName;
    } else if (window._currentProjectId) {
      indicator.style.display = "";
      nameEl.textContent = window._currentProjectId.substring(0, 12) + "...";
    } else {
      indicator.style.display = "none";
    }
  }
  function _setProjectNavigating(active) {
    _projectNavigating = active;
    const indicator = document.getElementById("project-indicator");
    const overlay = document.querySelector(".project-select-overlay");
    if (indicator) {
      indicator.classList.toggle("project-navigating", active);
    }
    if (overlay) {
      overlay.classList.toggle("project-navigating", active);
    }
  }
  async function _toggleProjectDropdown() {
    if (_projectNavigating) return;
    const dropdown = document.getElementById("project-indicator-dropdown");
    if (!dropdown) return;
    if (dropdown.style.display !== "none") {
      dropdown.style.display = "none";
      return;
    }
    const result = await chrome.storage.local.get("af_projects");
    const projects = result.af_projects || {};
    const sorted = Object.entries(projects).sort(
      ([, a], [, b]) => (b.last_accessed || 0) - (a.last_accessed || 0),
    );
    if (sorted.length === 0) {
      dropdown.innerHTML = `<div class="project-indicator-item" style="color: rgba(255,255,255,0.4); cursor: default;">${window.I18n?.t("project.noProjects") || "No projects yet"}</div>`;
    } else {
      dropdown.innerHTML = sorted
        .map(([id, data]) => {
          const isActive = id === window._currentProjectId;
          const name = data.name || id.substring(0, 12);
          const date = data.last_accessed
            ? window.I18n?.formatDate?.(data.last_accessed) ||
              new Date(data.last_accessed).toLocaleDateString()
            : "";
          const staleClass = data._notOnFlow
            ? " project-indicator-item--stale"
            : "";
          return `<div class="project-indicator-item${isActive ? " active" : ""}${staleClass}" data-project-id="${id}">
          <div class="project-indicator-item-info">
            <span class="project-indicator-item-name">${name}</span>
            <span class="project-indicator-item-date">${date}</span>
          </div>
          ${
            !isActive
              ? `<button class="project-indicator-item-delete" data-delete-id="${id}" title="Remove from list">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>`
              : ""
          }
        </div>`;
        })
        .join("");
    }
    dropdown.style.display = "";
    dropdown
      .querySelectorAll(".project-indicator-item-delete")
      .forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const deleteId = btn.dataset.deleteId;
          await _removeProjectFromList(deleteId);
          btn.closest(".project-indicator-item").remove();
          if (
            !dropdown.querySelector(".project-indicator-item[data-project-id]")
          ) {
            dropdown.innerHTML = `<div class="project-indicator-item" style="color: rgba(255,255,255,0.4); cursor: default;">${window.I18n?.t("project.noProjects") || "No projects yet"}</div>`;
          }
        });
      });
    dropdown
      .querySelectorAll(".project-indicator-item[data-project-id]")
      .forEach((item) => {
        item.addEventListener("click", (e) => {
          if (e.target.closest(".project-indicator-item-delete")) return;
          if (_projectNavigating) return;
          const projectId = item.dataset.projectId;
          if (projectId === window._currentProjectId) {
            dropdown.style.display = "none";
            return;
          }
          _setProjectNavigating(true);
          const projectData = projects[projectId];
          const projectName = projectData?.name || projectId.substring(0, 12);
          const oldId = window._currentProjectId;
          window._currentProjectId = projectId;
          window._currentProjectName = projectName;
          _updateProjectIndicator();
          _saveProjectToList(projectId, projectName);
          if (oldId !== projectId) {
            window.eventBus?.emit("project:changed", {
              projectId,
              projectName,
            });
          }
          const _flowBase =
            window.ProviderConfigManager?.getBaseUrlSync("flow");
          chrome.runtime.sendMessage(
            {
              action: "navigateToProject",
              url: `${_flowBase}/project/${projectId}`,
              projectId,
            },
            (navigation) => {
              if (chrome.runtime.lastError || !navigation?.success) {
                console.warn(
                  "[TobyFlow] Project switch failed:",
                  chrome.runtime.lastError?.message || navigation?.error,
                );
                _setProjectNavigating(false);
                window.showNotification?.(
                  window.I18n?.t("project.switchFailed") ||
                    "Could not open the selected Google Flow project.",
                  "error",
                  4e3,
                );
                return;
              }
              _requestProjectContextWithRetry(3, 1500);
            },
          );
          dropdown.style.display = "none";
        });
      });
    const closeHandler = (e) => {
      if (
        !dropdown.contains(e.target) &&
        e.target.id !== "project-indicator-btn"
      ) {
        dropdown.style.display = "none";
        document.removeEventListener("click", closeHandler);
      }
    };
    setTimeout(() => document.addEventListener("click", closeHandler), 0);
  }
  const _isFlowHomepageTab = (tab) => {
    const route = globalThis.FlowDriverRegistry?.describeUrl(tab?.url);
    return route?.driverKey === "flow_v2" && !route.projectId;
  };
  async function _createNewProject() {
    if (_projectNavigating) return { ok: false, error: "BUSY" };
    _setProjectNavigating(true);
    let homepageTab = null;
    try {
      const tabs = await chrome.tabs.query({
        url: window.ProviderConfigManager?.getTabQueryPatterns("flow"),
      });
      homepageTab = tabs.find(_isFlowHomepageTab);
    } catch (e) {}
    if (homepageTab) {
      const ctx = await new Promise((r) => {
        try {
          chrome.tabs.sendMessage(
            homepageTab.id,
            { action: "getProjectContext" },
            (resp) => r(chrome.runtime.lastError ? null : resp),
          );
        } catch (_) {
          r(null);
        }
      });
      if (ctx?.signedOut === true) {
        console.log(
          "[TobyFlow] _createNewProject: Flow ch\u01B0a \u0111\u0103ng nh\u1EADp \u2192 d\u1EEBng, kh\xF4ng d\xF2 n\xFAt",
        );
        _setProjectNavigating(false);
        return { ok: false, error: "SIGNED_OUT" };
      }
    }
    let resolveResult;
    const resultPromise = new Promise((r) => {
      resolveResult = r;
    });
    const handleClickResp = (resp) => {
      if (resp?.success) {
        _requestProjectContextWithRetry(5, 2e3);
        resolveResult({ ok: true });
      } else {
        const err = resp?.result?.error || resp?.error || "CLICK_FAILED";
        console.warn(
          "[TobyFlow] Kh\xF4ng t\xECm th\u1EA5y n\xFAt t\u1EA1o d\u1EF1 \xE1n:",
          err,
        );
        _setProjectNavigating(false);
        resolveResult({ ok: false, error: String(err) });
      }
    };
    if (homepageTab) {
      try {
        await chrome.tabs.update(homepageTab.id, { active: true });
        await chrome.windows?.update?.(homepageTab.windowId, { focused: true });
      } catch (e) {}
      setTimeout(() => {
        chrome.runtime.sendMessage(
          { action: "clickCreateNewProject", targetTabId: homepageTab.id },
          handleClickResp,
        );
      }, 300);
    } else {
      const _flowHome = window.ProviderConfigManager?.getBaseUrlSync("flow");
      chrome.runtime.sendMessage(
        { action: "navigateToProject", url: _flowHome },
        (navigation) => {
          if (!navigation?.success) {
            handleClickResp(navigation);
            return;
          }
          setTimeout(() => {
            chrome.runtime.sendMessage(
              {
                action: "clickCreateNewProject",
                targetTabId: navigation.tabId,
              },
              handleClickResp,
            );
          }, 1e3);
        },
      );
    }
    let resultTimer;
    const timeoutPromise = new Promise((r) => {
      resultTimer = setTimeout(() => r({ ok: false, error: "TIMEOUT" }), 25e3);
    });
    const result = await Promise.race([resultPromise, timeoutPromise]);
    clearTimeout(resultTimer);
    if (!result.ok) _setProjectNavigating(false);
    return result;
  }
  window._createNewProject = _createNewProject;
  let _requestProjectContextTimer = null;
  let _requestProjectContextInflight = null;
  async function _requestProjectContext() {
    if (_requestProjectContextInflight) return _requestProjectContextInflight;
    if (_requestProjectContextTimer) return;
    _requestProjectContextTimer = setTimeout(() => {
      _requestProjectContextTimer = null;
    }, 500);
    _requestProjectContextInflight = (async () => {
      try {
        return await _requestProjectContextImpl();
      } finally {
        _requestProjectContextInflight = null;
      }
    })();
    return _requestProjectContextInflight;
  }
  async function _requestProjectContextImpl() {
    function _handleProjectResponse(resp, tabId = null, tabTitle = null) {
      _projectContextResolved = true;
      _hideConnectingOverlay();
      if (resp?.projectId && resp.projectError !== true) {
        window._currentProjectId = resp.projectId;
        let projectName = resp.projectName || null;
        if (!projectName) {
          projectName = _extractProjectNameFromTitle(
            resp.documentTitle || tabTitle,
          );
        }
        window._currentProjectName = projectName;
        if (tabId) {
          window._targetFlowTabId = tabId;
          window.MessageBridge?.setTargetTabId?.(
            tabId,
            "sidebar_project_context",
          );
          console.log(
            "[TobyFlow] Target Flow tab set:",
            tabId,
            "Project:",
            resp.projectId,
            "Name:",
            projectName,
          );
          window.MessageBridge?.sendToContentScript?.(
            "applyFlowPageSettings",
            {},
          ).catch(() => {});
        }
        _saveProjectToList(resp.projectId, projectName);
        _hideProjectSelectOverlay();
        _updateProjectIndicator();
        _setProjectNavigating(false);
      } else {
        window._currentProjectId = null;
        window._currentProjectName = null;
        if (tabId && resp?.driverKey === "flow_v2") {
          window._targetFlowTabId = tabId;
          window.MessageBridge?.setTargetTabId?.(tabId);
          window.MessageBridge?.sendToContentScript?.(
            "applyFlowPageSettings",
            {},
          ).catch(() => {});
        } else if (tabId && window._targetFlowTabId === tabId) {
          window._targetFlowTabId = null;
          chrome.storage?.session
            ?.remove?.(["targetFlowTabId", "targetFlowContext"])
            .catch?.(() => {});
        }
        _updateProjectIndicator();
        if (!_isInitialRetrying) {
          _showProjectSelectOverlay();
        }
      }
    }
    try {
      const tabs = await chrome.tabs.query({
        url: window.ProviderConfigManager?.getTabQueryPatterns("flow"),
      });
      if (tabs.length === 0) {
        window._targetFlowTabId = null;
        _handleProjectResponse(null);
        return;
      }
      const activeTab = tabs.find((t) => t.active) || tabs[0];
      const orderedTabs = [
        activeTab,
        ...tabs.filter((t) => t.id !== activeTab.id),
      ];
      let foundProject = false;
      let activeResponse = null;
      for (const tab of orderedTabs) {
        try {
          const resp = await new Promise((resolve) => {
            chrome.tabs.sendMessage(
              tab.id,
              { action: "getProjectContext" },
              (r) => {
                if (chrome.runtime.lastError) resolve(null);
                else resolve(r);
              },
            );
          });
          if (tab.id === activeTab.id) activeResponse = resp;
          if (resp?.projectId && !resp.projectError) {
            _handleProjectResponse(resp, tab.id, tab.title);
            foundProject = true;
            break;
          }
        } catch (e) {}
      }
      if (!foundProject) {
        _handleProjectResponse(activeResponse, activeTab.id);
      }
    } catch (e) {
      try {
        chrome.runtime.sendMessage(
          { action: "getFlowProjectContext" },
          (resp) => {
            if (chrome.runtime.lastError) {
              _handleProjectResponse(null);
              return;
            }
            _handleProjectResponse(
              resp,
              resp?.tabId || null,
              resp?.tabTitle || null,
            );
          },
        );
      } catch (e2) {
        _handleProjectResponse(null);
      }
    }
  }
  function _requestProjectContextWithRetry(
    maxRetries = 3,
    delayMs = 1500,
    firstCallImmediate = false,
    suppressOverlay = false,
  ) {
    let attempt = 0;
    if (suppressOverlay) {
      _isInitialRetrying = true;
    }
    const tryRequest = async () => {
      attempt++;
      await _requestProjectContext();
      if (!window._currentProjectId && attempt < maxRetries) {
        setTimeout(() => tryRequest(), delayMs);
      } else {
        if (suppressOverlay) {
          _isInitialRetrying = false;
          _hideConnectingOverlay();
          if (!window._currentProjectId) {
            _showProjectSelectOverlay();
          }
        }
        _setProjectNavigating(false);
      }
    };
    if (firstCallImmediate) {
      tryRequest();
    } else {
      setTimeout(() => tryRequest(), delayMs);
    }
  }
  async function _showProjectSelectOverlay(guideIfNoTab = false) {
    const container =
      document.getElementById("sidebar-content") || document.body;
    const existing = container.querySelector(".project-select-overlay");
    if (
      existing &&
      !existing.classList.contains("project-select-overlay--signin")
    )
      return;
    try {
      if (chrome.tabs?.query) {
        const tabs = await chrome.tabs.query({
          url: window.ProviderConfigManager?.getTabQueryPatterns("flow"),
        });
        if (tabs.length === 0) {
          if (guideIfNoTab) {
            console.log(
              "[TobyFlow] _showProjectSelectOverlay: no Flow tab \u2192 guide user to open Flow + create project",
            );
            window.ProjectHelper?.warnNoProjectForUpload?.(
              null,
              window.I18n?.t("workflow.noProjectForWorkflow") ||
                "You haven't opened Google Flow or entered a project yet. Workflows need an open Flow project to run \u2014 open Flow, then create/select a project.",
            );
          }
          return;
        }
        const ctxList = [];
        for (const tab of tabs) {
          const ctx = await new Promise((r) => {
            try {
              chrome.tabs.sendMessage(
                tab.id,
                { action: "getProjectContext" },
                (resp) => r(chrome.runtime.lastError ? null : resp),
              );
            } catch (_) {
              r(null);
            }
          });
          ctxList.push({ tab, ctx });
          if (ctx?.projectId && ctx.projectError !== true) {
            if (window._currentProjectId !== ctx.projectId) {
              console.log(
                "[TobyFlow] _showProjectSelectOverlay aborted: defensive guard found project",
                ctx.projectId,
              );
              window._currentProjectId = ctx.projectId;
              window._targetFlowTabId = tab.id;
              window.MessageBridge?.setTargetTabId?.(tab.id);
              _updateProjectIndicator();
            }
            _hideProjectSelectOverlay();
            return;
          }
        }
        const answered = ctxList.filter((x) => x.ctx);
        if (
          answered.length &&
          answered.every((x) => x.ctx.signedOut === true)
        ) {
          console.log(
            "[TobyFlow] _showProjectSelectOverlay: Flow ch\u01B0a \u0111\u0103ng nh\u1EADp \u2192 hi\u1EC7n overlay \u0111\u0103ng nh\u1EADp",
          );
          _showFlowSignInOverlay(answered[0].tab.id);
          return;
        }
      }
    } catch (e) {}
    const result = await chrome.storage.local.get("af_projects");
    let projects = result.af_projects || {};
    const _setSyncingUI = (overlayEl, isSyncing) => {
      if (!overlayEl || !overlayEl.isConnected) return;
      const indicator = overlayEl.querySelector(".project-select-syncing");
      if (indicator)
        indicator.style.display = isSyncing ? "inline-flex" : "none";
    };
    const _asyncScanFlowProjects = (window._asyncScanFlowProjects = async (
      overlayEl,
      force = false,
    ) => {
      if (window._modalScanInProgress) {
        console.log("[TobyFlow] scanFlowProjects SKIP: already in progress");
        _setSyncingUI(overlayEl, false);
        return;
      }
      const now = Date.now();
      const MODAL_SCAN_COOLDOWN_MS = 1e4;
      if (
        !force &&
        window._lastModalScanTime &&
        now - window._lastModalScanTime < MODAL_SCAN_COOLDOWN_MS
      ) {
        const remainSec = Math.ceil(
          (MODAL_SCAN_COOLDOWN_MS - (now - window._lastModalScanTime)) / 1e3,
        );
        console.log(
          "[TobyFlow] scanFlowProjects SKIP: cooldown",
          remainSec + "s remaining (use resync button to force)",
        );
        _setSyncingUI(overlayEl, false);
        return;
      }
      window._modalScanInProgress = true;
      window._lastModalScanTime = now;
      if (force)
        console.log("[TobyFlow] scanFlowProjects FORCE: resync button clicked");
      try {
        if (!chrome.tabs?.query) return;
        const flowTabs = await chrome.tabs.query({
          url: window.ProviderConfigManager?.getTabQueryPatterns("flow"),
        });
        if (flowTabs.length === 0) return;
        const homeTab = flowTabs.find(
          (t) => t.url && !t.url.match(/\/project\/[a-f0-9-]+/),
        );
        const scanTab = homeTab || flowTabs[0];
        _setSyncingUI(overlayEl, true);
        const scanResult = await Promise.race([
          new Promise((resolve) => {
            chrome.tabs.sendMessage(
              scanTab.id,
              { action: "scanFlowProjects", force },
              (r) => {
                if (chrome.runtime.lastError) resolve(null);
                else resolve(r);
              },
            );
          }),
          new Promise((resolve) => setTimeout(() => resolve(null), 12e3)),
        ]);
        if (!scanResult?.projects?.length) {
          _setSyncingUI(overlayEl, false);
          return;
        }
        const freshResult = await chrome.storage.local.get("af_projects");
        const freshProjects = freshResult.af_projects || {};
        const flowProjectIds = new Set(scanResult.projects.map((p) => p.id));
        let changed = false;
        if (scanResult.isHomePage) {
          for (const [id, data] of Object.entries(freshProjects)) {
            if (!flowProjectIds.has(id)) {
              if (!data._notOnFlow) {
                freshProjects[id] = { ...data, _notOnFlow: true };
                changed = true;
              }
            } else if (data._notOnFlow) {
              delete freshProjects[id]._notOnFlow;
              changed = true;
            }
          }
        }
        for (const proj of scanResult.projects) {
          if (!freshProjects[proj.id]) {
            freshProjects[proj.id] = {
              name: proj.name || proj.id.substring(0, 8),
              last_accessed: Date.now(),
              flowOrder: proj.flowOrder,
            };
            changed = true;
          } else {
            if (proj.name && freshProjects[proj.id].name !== proj.name) {
              freshProjects[proj.id].name = proj.name;
              changed = true;
            }
            if (
              typeof proj.flowOrder === "number" &&
              freshProjects[proj.id].flowOrder !== proj.flowOrder
            ) {
              freshProjects[proj.id].flowOrder = proj.flowOrder;
              changed = true;
            }
          }
        }
        if (!changed) {
          _setSyncingUI(overlayEl, false);
          return;
        }
        await chrome.storage.local.set({ af_projects: freshProjects });
        if (!overlayEl || !overlayEl.isConnected) {
          _setSyncingUI(overlayEl, false);
          return;
        }
        const listEl = overlayEl.querySelector(".project-select-list");
        const countEl = overlayEl.querySelector(".project-select-search-count");
        if (!listEl) {
          _setSyncingUI(overlayEl, false);
          return;
        }
        const updatedSorted = Object.entries(freshProjects).sort(
          ([, a], [, b]) => {
            const aHasOrder = typeof a.flowOrder === "number";
            const bHasOrder = typeof b.flowOrder === "number";
            if (aHasOrder && bHasOrder) return a.flowOrder - b.flowOrder;
            if (aHasOrder) return -1;
            if (bHasOrder) return 1;
            return (b.last_accessed || 0) - (a.last_accessed || 0);
          },
        );
        listEl.innerHTML = updatedSorted
          .map(([id, data]) => _buildProjectItemHTML(id, data))
          .join("");
        if (countEl) countEl.textContent = `${updatedSorted.length}`;
        const indicator = overlayEl.querySelector(".project-select-syncing");
        if (indicator) {
          indicator.innerHTML =
            '<span style="color: #10b981;">\u2713</span> ' +
            (window.I18n?.t("project.synced") || "Synced");
          setTimeout(() => _setSyncingUI(overlayEl, false), 1500);
        }
      } catch (err) {
        console.warn("[TobyFlow] async scanFlowProjects failed:", err.message);
        _setSyncingUI(overlayEl, false);
      } finally {
        window._modalScanInProgress = false;
      }
    });
    const sorted = Object.entries(projects).sort(([, a], [, b]) => {
      const aHasOrder = typeof a.flowOrder === "number";
      const bHasOrder = typeof b.flowOrder === "number";
      if (aHasOrder && bHasOrder) return a.flowOrder - b.flowOrder;
      if (aHasOrder) return -1;
      if (bHasOrder) return 1;
      return (b.last_accessed || 0) - (a.last_accessed || 0);
    });
    _hideProjectSelectOverlay();
    const overlay = document.createElement("div");
    overlay.className = "project-select-overlay";
    function _buildProjectItemHTML(id, data) {
      const date = data.last_accessed
        ? window.I18n?.formatDate?.(data.last_accessed) ||
          new Date(data.last_accessed).toLocaleDateString()
        : "";
      const name = data.name || id.substring(0, 8);
      const staleClass = data._notOnFlow ? " project-select-item--stale" : "";
      const staleSuffix = data._notOnFlow
        ? ` \xB7 ${I18n.t("project.maybeDeleted")}`
        : "";
      return `<div class="project-select-item${staleClass}" data-project-id="${id}" data-project-name="${(name || "").toLowerCase()}" title="${name}${date ? " \u2014 " + date : ""}">
        <div class="project-select-item-info">
          <span class="project-select-name">${name}</span>
          ${date ? `<span class="project-select-date">${date}${staleSuffix}</span>` : ""}
        </div>
        <button class="project-select-item-delete" data-delete-id="${id}" title="${I18n.t("common.delete")}">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>`;
    }
    const hasProjects = sorted.length > 0;
    const showAccountAuthActions = window.authManager?.isLoggedIn?.() !== true;
    overlay.innerHTML = `
      <div class="project-select-content">
        <div class="project-select-header" style="display: flex; align-items: flex-start; gap: 10px;">
          <svg class="project-select-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
          <div class="project-select-header-text" style="flex: 1; min-width: 0;">
            <div class="project-select-title">
              ${I18n.t("project.selectTitle")}
              <span class="project-select-syncing" style="display: none; margin-left: 8px; font-size: 11px; font-weight: 400; color: rgba(255,255,255,0.6); align-items: center; gap: 4px;">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation: spin 1s linear infinite;">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                ${I18n.t("project.syncing") || "Syncing..."}
              </span>
            </div>
            <div class="project-select-desc">${I18n.t("project.selectDesc")}</div>
          </div>
          <button class="project-select-resync" type="button"
                  title="${I18n.t("project.resync") || "Resync"}"
                  style="flex-shrink: 0; min-width: 28px; height: 28px; padding: 0 8px; gap: 5px; display: inline-flex; align-items: center; justify-content: center;
                         background: transparent; border: 1px solid rgba(255,255,255,0.12); border-radius: 6px;
                         color: rgba(255,255,255,0.65); cursor: pointer; transition: all 0.15s;">
            <svg class="project-select-resync-icon" width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>

            <span>${I18n.t("project.resync")}</span>
          </button>
        </div>
        <div class="project-select-search-wrap">
          <svg class="project-select-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input type="text" class="project-select-search" placeholder="${I18n.t("project.searchPlaceholder")}" autocomplete="off" spellcheck="false" />
          ${hasProjects ? `<span class="project-select-search-count">${sorted.length}</span>` : ""}
        </div>
        <div class="project-select-list">
          ${
            hasProjects
              ? sorted
                  .map(([id, data]) => _buildProjectItemHTML(id, data))
                  .join("")
              : `<div class="project-select-empty">
                <p>${I18n.t("project.emptyMsg")}</p>
              </div>`
          }
        </div>
        <div class="project-select-actions">
          <button class="project-select-create-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            ${I18n.t("project.createNew")}
          </button>
          ${
            showAccountAuthActions
              ? `
            <div class="project-select-account-actions">
              <button type="button" class="btn btn-secondary project-select-auth-btn" data-auth-mode="login">
                ${I18n.t("auth.login")}
              </button>
              <button type="button" class="btn btn-primary project-select-auth-btn" data-auth-mode="register">
                ${I18n.t("auth.register")}
              </button>
            </div>`
              : ""
          }
        </div>
      </div>`;
    {
      const searchInput = overlay.querySelector(".project-select-search");
      const countEl = overlay.querySelector(".project-select-search-count");
      const listEl = overlay.querySelector(".project-select-list");
      let _searchTimeout = null;
      const BATCH_SIZE = 30;
      let _renderedCount = Math.min(sorted.length, BATCH_SIZE);
      let _currentQuery = "";
      if (sorted.length > BATCH_SIZE) {
        const items = listEl.querySelectorAll(
          ".project-select-item[data-project-id]",
        );
        items.forEach((item, idx) => {
          if (idx >= BATCH_SIZE) item.style.display = "none";
        });
        listEl.addEventListener(
          "scroll",
          () => {
            if (_currentQuery) return;
            const { scrollTop, scrollHeight, clientHeight } = listEl;
            if (
              scrollTop + clientHeight >= scrollHeight - 40 &&
              _renderedCount < sorted.length
            ) {
              const items2 = listEl.querySelectorAll(
                ".project-select-item[data-project-id]",
              );
              const nextBatch = Math.min(
                _renderedCount + BATCH_SIZE,
                sorted.length,
              );
              for (let i = _renderedCount; i < nextBatch; i++) {
                if (items2[i]) items2[i].style.display = "";
              }
              _renderedCount = nextBatch;
            }
          },
          { passive: true },
        );
      }
      searchInput?.addEventListener("input", () => {
        clearTimeout(_searchTimeout);
        _searchTimeout = setTimeout(() => {
          const query = (searchInput.value || "").toLowerCase().trim();
          _currentQuery = query;
          const items = listEl.querySelectorAll(
            ".project-select-item[data-project-id]",
          );
          let visibleCount = 0;
          items.forEach((item) => {
            const name = item.dataset.projectName || "";
            const match = !query || name.includes(query);
            item.style.display = match ? "" : "none";
            if (match) visibleCount++;
          });
          if (countEl)
            countEl.textContent = query
              ? `${visibleCount}/${sorted.length}`
              : `${sorted.length}`;
          if (!query && sorted.length > BATCH_SIZE) {
            _renderedCount = BATCH_SIZE;
            items.forEach((item, idx) => {
              item.style.display = idx < BATCH_SIZE ? "" : "none";
            });
          }
          let emptyEl = listEl.querySelector(".project-select-empty");
          if (visibleCount === 0 && query) {
            if (!emptyEl) {
              emptyEl = document.createElement("div");
              emptyEl.className = "project-select-empty";
              emptyEl.innerHTML = `<p>${I18n.t("project.noMatch")}</p>`;
              listEl.appendChild(emptyEl);
            }
            emptyEl.style.display = "";
          } else if (emptyEl) {
            emptyEl.style.display = visibleCount > 0 ? "none" : "";
          }
        }, 150);
      });
    }
    const listContainer = overlay.querySelector(".project-select-list");
    listContainer?.addEventListener("click", async (e) => {
      const delBtn = e.target.closest(".project-select-item-delete");
      if (delBtn) {
        e.stopPropagation();
        const deleteId = delBtn.dataset.deleteId;
        await _removeProjectFromList(deleteId);
        delBtn.closest(".project-select-item").remove();
        const countEl = overlay.querySelector(".project-select-search-count");
        const remainingItems = listContainer.querySelectorAll(
          ".project-select-item[data-project-id]",
        );
        if (countEl) countEl.textContent = `${remainingItems.length}`;
        if (remainingItems.length === 0) {
          listContainer.innerHTML = `<div class="project-select-empty"><p>${I18n.t("project.emptyMsg")}</p></div>`;
        }
        return;
      }
      const item = e.target.closest(".project-select-item[data-project-id]");
      if (!item || _projectNavigating) return;
      _setProjectNavigating(true);
      const projectId = item.dataset.projectId;
      const projectData = projects[projectId];
      const projectName = projectData?.name || projectId.substring(0, 8);
      const oldId = window._currentProjectId;
      const _flowBase2 = window.ProviderConfigManager?.getBaseUrlSync("flow");
      chrome.runtime.sendMessage(
        {
          action: "navigateToProject",
          url: `${_flowBase2}/project/${projectId}`,
          projectId,
        },
        (navigation) => {
          if (chrome.runtime.lastError || !navigation?.success) {
            console.warn(
              "[TobyFlow] Project switch failed:",
              chrome.runtime.lastError?.message || navigation?.error,
            );
            _setProjectNavigating(false);
            window.showNotification?.(
              window.I18n?.t("project.switchFailed") ||
                "Could not open the selected Google Flow project.",
              "error",
              4e3,
            );
            return;
          }
          window._currentProjectId = projectId;
          window._currentProjectName = projectName;
          _updateProjectIndicator();
          _saveProjectToList(projectId, projectName);
          _hideProjectSelectOverlay();
          if (oldId !== projectId) {
            window.eventBus?.emit("project:changed", {
              projectId,
              projectName,
            });
          }
          _requestProjectContextWithRetry(3, 1500);
        },
      );
    });
    const createOverlayBtn = overlay.querySelector(
      ".project-select-create-btn",
    );
    if (createOverlayBtn) {
      createOverlayBtn.addEventListener("click", async () => {
        if (createOverlayBtn.dataset.running === "1") return;
        createOverlayBtn.dataset.running = "1";
        const oldLabel = createOverlayBtn.innerHTML;
        createOverlayBtn.disabled = true;
        createOverlayBtn.textContent =
          window.I18n?.t("project.creating") || "Creating\u2026";
        let result2;
        try {
          result2 = await _createNewProject();
        } catch (e) {
          result2 = { ok: false, error: e?.message || "ERROR" };
        }
        if (result2?.ok) {
          _hideProjectSelectOverlay();
          return;
        }
        createOverlayBtn.dataset.running = "";
        createOverlayBtn.disabled = false;
        createOverlayBtn.innerHTML = oldLabel;
        const msg =
          result2?.error === "SIGNED_OUT"
            ? window.I18n?.t("project.createFailedSignedOut") ||
              "You are not signed in to Google Flow. Open Flow and sign in first, then create a project."
            : window.I18n?.t("project.createFailed") ||
              "Could not create the project. Open the Google Flow tab and try again.";
        let errBox = overlay.querySelector(".project-select-create-error");
        if (!errBox) {
          errBox = document.createElement("div");
          errBox.className = "project-select-create-error";
          errBox.style.cssText =
            "margin:0 12px 10px;padding:8px 10px;border-radius:8px;font-size:11.5px;line-height:1.45;background:rgba(239,68,68,0.10);border:1px solid rgba(239,68,68,0.35);";
          const actions = overlay.querySelector(".project-select-actions");
          actions?.parentElement?.insertBefore(errBox, actions);
        }
        errBox.textContent = msg;
      });
    }
    overlay
      .querySelectorAll(".project-select-auth-btn[data-auth-mode]")
      .forEach((btn) => {
        btn.addEventListener("click", () =>
          window.openAuthModal?.(btn.dataset.authMode),
        );
      });
    const resyncBtn = overlay.querySelector(".project-select-resync");
    if (resyncBtn) {
      resyncBtn.addEventListener("mouseenter", () => {
        resyncBtn.style.background = "rgba(255,255,255,0.05)";
        resyncBtn.style.color = "rgba(255,255,255,0.9)";
      });
      resyncBtn.addEventListener("mouseleave", () => {
        resyncBtn.style.background = "transparent";
        resyncBtn.style.color = "rgba(255,255,255,0.65)";
      });
      resyncBtn.addEventListener("click", () => {
        const icon = resyncBtn.querySelector(".project-select-resync-icon");
        if (icon) icon.style.animation = "spin 0.8s linear infinite";
        resyncBtn.disabled = true;
        _asyncScanFlowProjects(overlay, true).finally(() => {
          if (icon) icon.style.animation = "";
          resyncBtn.disabled = false;
        });
      });
    }
    container.appendChild(overlay);
    setTimeout(
      () => overlay.querySelector(".project-select-search")?.focus(),
      100,
    );
    _asyncScanFlowProjects(overlay);
  }
  function _hideProjectSelectOverlay() {
    const overlay = document.querySelector(".project-select-overlay");
    if (overlay) overlay.remove();
  }
  function _showFlowSignInOverlay(tabId) {
    const container =
      document.getElementById("sidebar-content") || document.body;
    if (container.querySelector(".project-select-overlay--signin")) return;
    _hideProjectSelectOverlay();
    const t = (k, d) => window.I18n?.t?.(k) || d;
    const overlay = document.createElement("div");
    overlay.className = "project-select-overlay project-select-overlay--signin";
    overlay.innerHTML = `
      <div class="project-select-content" style="padding:22px 20px;text-align:center;">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
             style="margin:0 auto 12px;display:block;opacity:.85;">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
          <polyline points="10 17 15 12 10 7"></polyline>
          <line x1="15" y1="12" x2="3" y2="12"></line>
        </svg>
        <div style="font-weight:600;font-size:14px;margin-bottom:6px;">
          ${t("app.flowSignInTitle", "Sign in to Google Flow")}
        </div>
        <div style="font-size:12px;line-height:1.5;color:var(--muted-foreground);margin-bottom:16px;">
          ${t("app.flowSignInDesc", "You are not signed in to Google Flow yet, so there is no project to select or create. Sign in, then open or create a project \u2014 the extension will pick it up automatically.")}
        </div>
        <button class="btn btn-primary" id="flowSignInOpenBtn" style="width:100%;">
          ${t("app.flowSignInOpen", "Open Google Flow")}
        </button>
      </div>`;
    container.appendChild(overlay);
    overlay
      .querySelector("#flowSignInOpenBtn")
      ?.addEventListener("click", async () => {
        try {
          if (tabId) {
            await chrome.tabs.update(tabId, { active: true });
            const tb = await chrome.tabs.get(tabId);
            await chrome.windows?.update?.(tb.windowId, { focused: true });
          } else {
            const url = window.ProviderConfigManager?.getBaseUrlSync?.("flow");
            if (url)
              chrome.runtime.sendMessage({ action: "navigateToProject", url });
          }
        } catch (e) {
          console.warn(
            "[TobyFlow] m\u1EDF tab Flow th\u1EA5t b\u1EA1i:",
            e?.message,
          );
        }
        _requestProjectContextWithRetry(5, 3e3);
      });
    let ticks = 0;
    const timer = setInterval(() => {
      if (!overlay.isConnected || ++ticks > 100) {
        clearInterval(timer);
        return;
      }
      try {
        _showProjectSelectOverlay();
      } catch (_) {}
    }, 3e3);
  }
  window._showProjectSelectOverlay = _showProjectSelectOverlay;
  window._hideProjectSelectOverlay = _hideProjectSelectOverlay;
  window._requestProjectContext = _requestProjectContext;
  let _scanFlowProjectsCooldown = 0;
  const SCAN_FLOW_PROJECTS_COOLDOWN_MS = 3e4;
  async function _scanAndUpdateFlowProjects(scanTabId, force = false) {
    const now = Date.now();
    if (!force && now < _scanFlowProjectsCooldown) return false;
    _scanFlowProjectsCooldown = now + SCAN_FLOW_PROJECTS_COOLDOWN_MS;
    try {
      const scanResult = await Promise.race([
        new Promise((resolve) => {
          chrome.tabs.sendMessage(
            scanTabId,
            { action: "scanFlowProjects", force },
            (r) => {
              if (chrome.runtime.lastError) resolve(null);
              else resolve(r);
            },
          );
        }),
        new Promise((resolve) => setTimeout(() => resolve(null), 12e3)),
      ]);
      if (!scanResult?.projects) return false;
      const freshResult = await chrome.storage.local.get("af_projects");
      const freshProjects = freshResult.af_projects || {};
      const flowProjectIds = new Set(scanResult.projects.map((p) => p.id));
      let changed = false;
      if (scanResult.isHomePage) {
        for (const [id, data] of Object.entries(freshProjects)) {
          if (!flowProjectIds.has(id) && id !== window._currentProjectId) {
            if (!data._notOnFlow) {
              freshProjects[id] = { ...data, _notOnFlow: Date.now() };
              changed = true;
            }
          } else if (data._notOnFlow && flowProjectIds.has(id)) {
            delete freshProjects[id]._notOnFlow;
            changed = true;
          }
        }
      }
      for (const proj of scanResult.projects) {
        if (!freshProjects[proj.id]) {
          freshProjects[proj.id] = {
            name: proj.name || proj.id.substring(0, 8),
            last_accessed: Date.now(),
          };
          changed = true;
        } else if (proj.name && freshProjects[proj.id].name !== proj.name) {
          freshProjects[proj.id].name = proj.name;
          changed = true;
        }
      }
      if (changed) {
        await chrome.storage.local.set({ af_projects: freshProjects });
        console.log(
          "[TobyFlow] Auto-scan Flow projects: updated storage with",
          scanResult.projects.length,
          "projects",
        );
        _updateProjectIndicator();
      }
      return true;
    } catch (e) {
      console.warn("[TobyFlow] Auto-scan Flow projects failed:", e?.message);
      return false;
    }
  }
  window._scanAndUpdateFlowProjects = _scanAndUpdateFlowProjects;
  let _projectSyncCooldown = 0;
  const PROJECT_SYNC_INTERVAL_MS = 3e3;
  setInterval(async () => {
    if (!chrome.tabs?.query) return;
    const now = Date.now();
    if (now < _projectSyncCooldown) return;
    _projectSyncCooldown = now + 1e3;
    try {
      const tabs = await chrome.tabs.query({
        url: window.ProviderConfigManager?.getTabQueryPatterns("flow"),
      });
      const projectCandidates = tabs
        .map((tab) => ({
          tab,
          route: window.FlowDriverRegistry?.describeUrl?.(tab.url) || null,
        }))
        .filter((entry) => entry.route?.projectId)
        .sort((a, b) => {
          const editorDelta =
            Number(b.route.isProjectEditor === true) -
            Number(a.route.isProjectEditor === true);
          if (editorDelta) return editorDelta;
          const activeDelta =
            Number(b.tab.active === true) - Number(a.tab.active === true);
          if (activeDelta) return activeDelta;
          return (
            Number(b.tab.lastAccessed || 0) - Number(a.tab.lastAccessed || 0)
          );
        });
      let projectFound = null;
      const overlayVisible = !!document.querySelector(
        ".project-select-overlay",
      );
      let hadErrorProject = false;
      for (const candidate of projectCandidates) {
        const ctx = await new Promise((r) => {
          try {
            chrome.tabs.sendMessage(
              candidate.tab.id,
              { action: "getProjectContext" },
              (resp) => r(chrome.runtime.lastError ? null : resp),
            );
          } catch (_) {
            r(null);
          }
        });
        if (ctx?.projectError === true) {
          hadErrorProject = true;
          continue;
        }
        projectFound = { id: candidate.route.projectId, tab: candidate.tab };
        break;
      }
      if (projectFound && overlayVisible) {
        console.log(
          "[TobyFlow] Periodic re-sync: hide stale overlay, project=",
          projectFound.id,
        );
        if (
          window._currentProjectId !== projectFound.id ||
          window._targetFlowTabId !== projectFound.tab.id
        ) {
          window._currentProjectId = projectFound.id;
          window._targetFlowTabId = projectFound.tab.id;
          window.MessageBridge?.setTargetTabId?.(projectFound.tab.id);
        }
        _hideProjectSelectOverlay();
        _updateProjectIndicator();
      } else if (hadErrorProject) {
        if (window._currentProjectId) {
          window._currentProjectId = null;
          window._currentProjectName = null;
          _updateProjectIndicator();
        }
        if (!overlayVisible) _showProjectSelectOverlay();
      } else if (
        !projectFound &&
        tabs.length === 0 &&
        window._currentProjectId
      ) {
        console.log(
          "[TobyFlow] Periodic re-sync: no Flow tab, clear stale project state",
        );
        window._currentProjectId = null;
        window._currentProjectName = null;
        _updateProjectIndicator();
      } else if (
        projectFound &&
        (window._currentProjectId !== projectFound.id ||
          window._targetFlowTabId !== projectFound.tab.id)
      ) {
        console.log(
          "[TobyFlow] Periodic re-sync: state out of sync, update to",
          projectFound.id,
        );
        window._currentProjectId = projectFound.id;
        window._targetFlowTabId = projectFound.tab.id;
        window.MessageBridge?.setTargetTabId?.(projectFound.tab.id);
        _updateProjectIndicator();
      }
    } catch (e) {}
  }, PROJECT_SYNC_INTERVAL_MS);
  if (!window.pendingUploadFiles) window.pendingUploadFiles = new Map();
  if (!window.uploadedFileCache) window.uploadedFileCache = new Map();
  (function _installTargetFlowTabIdPersist() {
    let _val = null;
    const persist = (tabId) => {
      try {
        if (!chrome.storage?.session) return;
        if (tabId)
          chrome.storage.session
            .set({ targetFlowTabId: tabId })
            .catch(() => {});
        else chrome.storage.session.remove("targetFlowTabId").catch(() => {});
      } catch (_) {}
    };
    try {
      Object.defineProperty(window, "_targetFlowTabId", {
        configurable: true,
        get() {
          return _val;
        },
        set(v) {
          _val = v;
          persist(v);
        },
      });
    } catch (_) {}
  })();
  async function _detectBrowser() {
    const ua = navigator.userAgent || "";
    try {
      if (navigator.brave && (await navigator.brave.isBrave())) return "brave";
    } catch (_) {}
    if (/coc_coc_browser/i.test(ua)) return "coccoc";
    if (/\bEdg\//.test(ua)) return "edge";
    if (/\bOPR\//.test(ua)) return "opera";
    if (/\bVivaldi\//.test(ua)) return "vivaldi";
    if (/Chrome\//.test(ua)) return "chrome";
    return "unknown";
  }
  async function _checkBrowserCompat() {
    try {
      const browser = await _detectBrowser();
      if (browser === "chrome") return;
      const STORAGE_KEY = "tobyflow_browser_warning_dismissed_v1";
      const stored = await new Promise((r) =>
        chrome.storage.local.get([STORAGE_KEY], r),
      );
      if (stored?.[STORAGE_KEY] === browser) return;
      const I = window.I18n;
      const labels = {
        coccoc: "C\u1ED1c C\u1ED1c",
        edge: "Microsoft Edge",
        brave: "Brave",
        opera: "Opera",
        vivaldi: "Vivaldi",
        unknown: "browser c\u1EE7a b\u1EA1n",
      };
      const browserLabel = labels[browser] || browser;
      const title =
        I?.t("browserWarning.title") || "Browser not officially supported";
      const heading =
        I?.t("browserWarning.heading", { browser: browserLabel }) ||
        `B\u1EA1n \u0111ang d\xF9ng <strong>${browserLabel}</strong>`;
      const body =
        I?.t("browserWarning.body") ||
        "Toby Flow is fully tested and supported only on <strong>Google Chrome</strong>. Some features (local upload, sidePanel, service worker) may not work correctly on other browsers.";
      const recommend =
        I?.t("browserWarning.recommend") ||
        "For the best experience, please use Google Chrome.";
      const downloadBtn =
        I?.t("browserWarning.downloadChrome") || "Download Chrome";
      const continueBtn =
        I?.t("browserWarning.continueAnyway") || "Continue anyway";
      const html = `<div style="text-align:left;line-height:1.55;font-size:14px;">  <p style="margin:0 0 10px;font-size:15px;">${heading}</p>  <p style="margin:0 0 10px;color:rgba(255,255,255,0.75);">${body}</p>  <p style="margin:0;color:rgba(255,255,255,0.85);">${recommend}</p></div>`;
      await window.customDialog?.alert(html, {
        title,
        type: "warning",
        html: true,
        buttons: [
          {
            label: downloadBtn,
            primary: false,
            action: () => {
              try {
                chrome.tabs.create({ url: "https://www.google.com/chrome/" });
              } catch (_) {}
            },
          },
          {
            label: continueBtn,
            primary: true,
            action: () => {
              chrome.storage.local
                .set({ [STORAGE_KEY]: browser })
                .catch(() => {});
            },
          },
        ],
      });
    } catch (e) {
      console.warn("[BrowserCompat] check failed:", e?.message);
    }
  }
  async function init() {
    log("Initializing...");
    try {
      await window.StorageMigration?.run?.();
    } catch (e) {
      console.warn("[init] StorageMigration error:", e.message);
    }
    window.ProviderMeta?.fetch?.().catch(() => {});
    window.ModelPresentationRegistry?.fetch?.().catch(() => {});
    window.VoiceRegistry?.initCrossContextSync?.();
    window.CharacterRegistry?.initCrossContextSync?.();
    window.CharacterRegistry?.getScrapedList?.().catch(() => {});
    const loadProtectedConfig = async () => {
      if (!window.authManager?.isLoggedIn?.()) return;
      try {
        const claim = await window.ExtensionDeviceManager?.claim?.();
        if (claim?.registered !== true) return;
        await Promise.all([
          window.ProviderConfigManager?.fetch?.(),
          window.ProviderConfigManager?._fetchApiConfigs?.(),
          window.ProviderConfigManager?.fetchPrivateConfigs?.(),
          window.ModelRegistry?.fetch?.(),
          window.ExecutionConfig?.getConfig?.(),
        ]);
        window.eventBus?.emit?.("config:protected_ready");
      } catch (error) {
        if (window.ConfigRequiredError?.is?.(error))
          window.ConfigErrorHandler?.handle?.(error, "protected boot");
        else
          console.warn(
            "[ConfigAccess] Protected boot:",
            error.code || error.message,
          );
      }
    };
    const overlay = document.getElementById("tobyflow-loading-overlay");
    const loadingText = document.getElementById("tobyflow-loading-text");
    function setLoadingText(text) {
      if (loadingText) loadingText.textContent = text;
    }
    function hideLoadingOverlay() {
      if (overlay) {
        overlay.classList.add("tobyflow-loading-overlay--hidden");
        setTimeout(() => overlay.remove(), 300);
      }
    }
    const offlineOverlay = document.getElementById("tobyflow-offline-overlay");
    const offlineRetryBtn = document.getElementById(
      "tobyflow-offline-retry-btn",
    );
    let _offlineHealthPollInterval = null;
    let _offlineHealthPollFlight = false;
    let _serverConnectionOffline = false;
    const _OFFLINE_HEALTH_POLL_MS = 1e4;
    function showOfflineOverlay(networkFailure = true) {
      if (networkFailure) _serverConnectionOffline = true;
      if (offlineOverlay) {
        offlineOverlay.classList.remove("hidden");
      }
      if (_offlineHealthPollInterval) return;
      _offlineHealthPollInterval = setInterval(async () => {
        if (!navigator.onLine || _offlineHealthPollFlight) return;
        _offlineHealthPollFlight = true;
        try {
          window.ServerHealthCheck?.reset();
          const isHealthy = await checkServerConnection();
          if (isHealthy) {
            if (window.ConfigAccessUI?.serviceUnavailable?.())
              await window.ConfigAccessUI.retry("online");
            hideOfflineOverlay();
            if (!window.ConfigAccessUI?.serviceUnavailable?.()) {
              try {
                await window.featureGate?.refresh?.();
              } catch (_) {}
            }
          }
        } catch (_) {
        } finally {
          _offlineHealthPollFlight = false;
        }
      }, _OFFLINE_HEALTH_POLL_MS);
      console.log(
        "[App] Offline overlay shown \u2014 started health polling every",
        _OFFLINE_HEALTH_POLL_MS,
        "ms",
      );
    }
    function hideOfflineOverlay(networkRecovered = true) {
      if (networkRecovered) _serverConnectionOffline = false;
      if (
        _serverConnectionOffline ||
        window.ConfigAccessUI?.serviceUnavailable?.()
      )
        return;
      if (offlineOverlay) {
        offlineOverlay.classList.add("hidden");
      }
      if (_offlineHealthPollInterval) {
        clearInterval(_offlineHealthPollInterval);
        _offlineHealthPollInterval = null;
        console.log(
          "[App] Offline overlay hidden \u2014 stopped health polling",
        );
      }
    }
    window.eventBus?.on?.("config:service_unavailable", (state) => {
      if (state) showOfflineOverlay(false);
      else hideOfflineOverlay(false);
    });
    if (window.ConfigAccessUI?.serviceUnavailable?.())
      showOfflineOverlay(false);
    const cloneDetectedOverlay = document.getElementById(
      "tobyflow-clone-detected-overlay",
    );
    function _showCloneDetectedOverlay() {
      if (!cloneDetectedOverlay) return;
      cloneDetectedOverlay.classList.remove("hidden");
      const storeBtn = document.getElementById(
        "tobyflow-clone-detected-store-btn",
      );
      if (storeBtn && !storeBtn.href) {
        try {
          const cfg = window.SystemConfig?.getAppConfig?.() || {};
          storeBtn.href =
            cfg.extension_url || "https://chromewebstore.google.com/";
        } catch (_) {
          storeBtn.href = "https://chromewebstore.google.com/";
        }
      }
      console.error(
        "[App] \u{1F6E1}\uFE0F Clone-detected overlay shown \u2014 extension not authorized",
      );
    }
    function _hideCloneDetectedOverlay() {
      if (cloneDetectedOverlay) cloneDetectedOverlay.classList.add("hidden");
    }
    setTimeout(() => {
      try {
        chrome.storage.local.get(
          ["tobyflow_extension_not_authorized", "tobyflow_device_banned"],
          (res) => {
            if (
              res?.tobyflow_extension_not_authorized ||
              res?.tobyflow_device_banned
            )
              _showCloneDetectedOverlay();
          },
        );
      } catch (_) {}
    }, 800);
    try {
      const retryHandler = () => {
        chrome.runtime
          .sendMessage({ type: "EXTENSION_AUTH_RETRY" })
          .catch(() => {});
      };
      cloneDetectedOverlay?.addEventListener("click", retryHandler);
    } catch (_) {}
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        if (
          changes.tobyflow_extension_not_authorized ||
          changes.tobyflow_device_banned
        ) {
          chrome.storage.local.get(
            ["tobyflow_extension_not_authorized", "tobyflow_device_banned"],
            (res) => {
              if (
                res?.tobyflow_extension_not_authorized ||
                res?.tobyflow_device_banned
              )
                _showCloneDetectedOverlay();
              else _hideCloneDetectedOverlay();
            },
          );
        }
      });
    } catch (_) {}
    try {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg?.type === "API_NETWORK_STATE") {
          if (msg.online === false) showOfflineOverlay();
          else if (msg.online === true) hideOfflineOverlay();
        } else if (
          msg?.type === "EXTENSION_NOT_AUTHORIZED" ||
          msg?.type === "DEVICE_BANNED"
        )
          _showCloneDetectedOverlay();
        else if (
          msg?.type === "EXTENSION_AUTHORIZED" ||
          msg?.type === "DEVICE_UNBANNED"
        ) {
          _hideCloneDetectedOverlay();
          try {
            if (window.authManager) window.authManager._sessionInvalid = false;
          } catch (_) {}
          (async () => {
            try {
              await window.SystemConfig?.fetch?.(true);
              window.SystemConfig?.applyToUI?.();
            } catch (_) {}
            try {
              await window.featureGate?.refresh?.();
            } catch (_) {}
          })();
        }
      });
    } catch (_) {}
    async function checkServerConnection() {
      if (!navigator.onLine) return false;
      return (await window.ServerHealthCheck?.check(true)) ?? false;
    }
    async function checkServerConnectionWithRetry() {
      if (!navigator.onLine) return false;
      for (let i = 0; i < 2; i++) {
        if (await checkServerConnection()) return true;
        if (i < 1) await new Promise((r) => setTimeout(r, 1e3));
      }
      return false;
    }
    async function handleOnlineStatusChange() {
      if (!navigator.onLine) {
        showOfflineOverlay();
        return;
      }
      const isConnected = await checkServerConnectionWithRetry();
      if (!isConnected) {
        showOfflineOverlay();
      } else {
        hideOfflineOverlay();
      }
    }
    if (!navigator.onLine) {
      setLoadingText(
        window.I18n?.t("dialog.offline") || "Server Connection Lost",
      );
      showOfflineOverlay();
    } else {
      checkServerConnectionWithRetry().then((isHealthy) => {
        if (!isHealthy) {
          setLoadingText(
            window.I18n?.t("dialog.serverUnavailable") ||
              "Cannot connect to server",
          );
          showOfflineOverlay();
        }
      });
    }
    window.addEventListener("online", handleOnlineStatusChange);
    window.addEventListener("offline", handleOnlineStatusChange);
    window.eventBus?.on?.("config:offline", ({ source, error }) => {
      console.warn(
        `[App] config:offline received (source=${source}, error=${error}) \u2192 show overlay`,
      );
      showOfflineOverlay();
    });
    if (offlineRetryBtn) {
      offlineRetryBtn.addEventListener("click", async () => {
        if (offlineRetryBtn.disabled) return;
        const retryLabel = offlineRetryBtn.innerHTML;
        offlineRetryBtn.disabled = true;
        offlineRetryBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tobyflow-spin">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
          </svg>
          ${window.I18n?.t("app.checking") || "Checking..."}
        `;
        try {
          window.ServerHealthCheck?.reset();
          if (!(await checkServerConnectionWithRetry())) return;
          if (window.ConfigAccessUI?.serviceUnavailable?.()) {
            await window.ConfigAccessUI.retry("manual");
          } else {
            await window.ProviderConfigManager?.refresh?.();
          }
          hideOfflineOverlay();
          if (!window.ConfigAccessUI?.serviceUnavailable?.())
            await window.featureGate?.refresh?.();
        } catch (error) {
          if (window.ConfigRequiredError?.is?.(error))
            window.ConfigErrorHandler?.handle?.(error, "connection retry");
          else
            console.warn(
              "[App] Connection retry failed:",
              error.code || error.message,
            );
        } finally {
          offlineRetryBtn.disabled = false;
          offlineRetryBtn.innerHTML = retryLabel;
        }
      });
    }
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg?.action === "wm:cleanVideo") {
        (async () => {
          try {
            if (!self.VideoWmClient) {
              sendResponse({ ok: false, error: "NO_VIDEO_MODULE" });
              return;
            }
            const cfgResp = await chrome.runtime.sendMessage({
              action: "getWatermarkConfig",
              mediaType: "video",
            });
            if (!cfgResp?.success) {
              sendResponse({ ok: false, error: cfgResp?.error || "NO_CONFIG" });
              return;
            }
            const blob = await (
              await fetch(
                `data:${msg.mime || "video/mp4"};base64,${msg.base64}`,
              )
            ).blob();
            const r = await self.VideoWmClient.process(blob, cfgResp.cfg, {
              onProgress: (p) => {
                try {
                  chrome.runtime.sendMessage({
                    action: "wm:videoProgress",
                    phase: p.phase,
                    frame: p.frame,
                  });
                } catch (_) {}
              },
            });
            if (!r?.applied) {
              const reason = r?.reason || "not_applied";
              const noWatermark = [
                "not_found",
                "below_threshold",
                "already_clean_output",
              ].includes(reason);
              sendResponse(
                noWatermark
                  ? { ok: true, applied: false, reason, noWatermark: true }
                  : { ok: false, error: reason },
              );
              return;
            }
            const b64 = await new Promise((res, rej) => {
              const fr = new FileReader();
              fr.onload = () => res(String(fr.result).split(",")[1]);
              fr.onerror = () =>
                rej(new Error("\u0111\u1ECDc blob th\u1EA5t b\u1EA1i"));
              fr.readAsDataURL(r.blob);
            });
            sendResponse({
              ok: true,
              base64: b64,
              mime: "video/mp4",
              stats: r.stats,
            });
          } catch (e) {
            sendResponse({ ok: false, error: e?.message || "EXCEPTION" });
          }
        })();
        return true;
      }
      if (msg.action === "flowHomepageProjectsChanged") {
        const overlay2 = document.querySelector(".project-select-overlay");
        if (overlay2) {
          console.log(
            "[TobyFlow] Flow homepage projects changed (count=" +
              msg.count +
              ") \u2192 re-scan modal",
          );
          if (typeof window._asyncScanFlowProjects === "function") {
            window._asyncScanFlowProjects(overlay2, false);
          }
        }
        if (sendResponse) sendResponse({ ok: true });
        return;
      }
      if (msg.action === "projectContext") {
        _projectContextResolved = true;
        _hideConnectingOverlay();
        const contextTabId = sender?.tab?.id || msg.tabId || null;
        if (
          msg.invalidFlowRoute === true &&
          contextTabId &&
          window._targetFlowTabId &&
          window._targetFlowTabId !== contextTabId
        ) {
          if (sendResponse)
            sendResponse({
              ok: true,
              ignored: "NON_TARGET_INVALID_FLOW_ROUTE",
            });
          return;
        }
        const oldId = window._currentProjectId;
        const oldName = window._currentProjectName;
        const isErrorProject = msg.projectError === true;
        const isUnverified =
          msg.fromTabUpdate === true || msg.fromSPANavigate === true;
        const newId = msg.projectId && !isErrorProject ? msg.projectId : null;
        if (
          msg.invalidFlowRoute === true &&
          contextTabId &&
          window._targetFlowTabId === contextTabId
        ) {
          window._targetFlowTabId = null;
          chrome.storage?.session
            ?.remove?.(["targetFlowTabId", "targetFlowContext"])
            .catch?.(() => {});
        }
        if (newId) {
          if (sender?.tab?.id) {
            window._targetFlowTabId = sender.tab.id;
            window.MessageBridge?.setTargetTabId?.(sender.tab.id);
          } else if (msg.tabId) {
            window._targetFlowTabId = msg.tabId;
            window.MessageBridge?.setTargetTabId?.(msg.tabId);
          }
        } else if (!window._targetFlowTabId && msg.invalidFlowRoute !== true) {
          if (sender?.tab?.id) {
            window._targetFlowTabId = sender.tab.id;
            window.MessageBridge?.setTargetTabId?.(sender.tab.id);
          } else if (msg.tabId) {
            window._targetFlowTabId = msg.tabId;
            window.MessageBridge?.setTargetTabId?.(msg.tabId);
          }
        }
        if (
          msg.fromTabUpdate &&
          newId &&
          !msg.projectName &&
          window._currentProjectName
        ) {
          window._currentProjectId = newId;
        } else {
          window._currentProjectId = newId;
          window._currentProjectName = msg.projectName || null;
        }
        if (
          newId &&
          !isUnverified &&
          (oldId !== newId || (msg.projectName && msg.projectName !== oldName))
        ) {
          _saveProjectToList(newId, msg.projectName);
        }
        _updateProjectIndicator();
        if (newId && !isUnverified) {
          _hideProjectSelectOverlay();
        } else if (!newId) {
          _showProjectSelectOverlay();
        }
        if (oldId !== newId) {
          window.eventBus?.emit("project:changed", {
            projectId: newId,
            projectName: msg.projectName,
          });
        }
        if (sendResponse) sendResponse({ ok: true });
      }
    });
    if (chrome.tabs?.onActivated) {
      chrome.tabs.onActivated.addListener(async (activeInfo) => {
        try {
          const tab = await chrome.tabs.get(activeInfo.tabId);
          let flowOrigin = false;
          try {
            flowOrigin =
              new URL(tab?.url || "").origin === "https://flow.google.com";
          } catch (_) {}
          if (flowOrigin) {
            const isProjectTab =
              window.FlowDriverRegistry?.isProjectEditor?.(tab.url) === true;
            if (isProjectTab) {
              window._targetFlowTabId = activeInfo.tabId;
              window.MessageBridge?.setTargetTabId?.(
                activeInfo.tabId,
                "sidebar_tab_activated",
              );
              console.log(
                "[TobyFlow] Tab activated, target Flow tab updated:",
                activeInfo.tabId,
              );
              window.MessageBridge?.sendToContentScript?.(
                "applyFlowPageSettings",
                {},
              ).catch(() => {});
            } else {
              console.log(
                "[TobyFlow] Tab activated is Flow homepage, keeping existing target tab",
              );
            }
            _requestProjectContext();
          }
        } catch (e) {}
      });
    }
    _requestProjectContextWithRetry(3, 1e3, true, true);
    try {
      let _addImageToGenTabInternal = function (tileId, fileName, thumbnail) {
          if (!tileId) {
            return { success: false, error: "Missing tileId" };
          }
          if (!window.GenTab?.fileIdsInput) {
            return { success: false, error: "GenTab not ready" };
          }
          const existingIds = (window.GenTab.fileIdsInput.value || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          if (existingIds.includes(tileId)) {
            return { success: true, alreadyExists: true };
          }
          if (thumbnail) {
            window.GenTab.thumbnailCache = window.GenTab.thumbnailCache || {};
            window.GenTab.thumbnailCache[tileId] = thumbnail;
          }
          if (fileName) {
            window.GenTab.fileNameCache = window.GenTab.fileNameCache || {};
            window.GenTab.fileNameCache[tileId] = fileName;
          }
          const newIds = [...existingIds, tileId];
          window.GenTab.fileIdsInput.value = newIds.join(", ");
          window.GenTab.fileIdsInput.dispatchEvent(
            new Event("input", { bubbles: true }),
          );
          if (typeof window.GenTab.renderFileIdThumbnails === "function") {
            window.GenTab.renderFileIdThumbnails();
          }
          return { success: true, alreadyExists: false };
        },
        _addLocalImageToGenTabInternal = function ({
          base64,
          name,
          type,
        } = {}) {
          if (!base64 || !window.GenTab?.addUploadRefImages)
            return { success: false, error: "GenTab not ready" };
          try {
            const bin = atob(base64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const t = type || "image/jpeg";
            const file = new File(
              [bytes],
              name || `gen_ref_${Date.now()}.jpg`,
              { type: t },
            );
            const thumbnail = `data:${t};base64,${base64}`;
            const added = window.GenTab.addUploadRefImages([
              { file, thumbnail, type: t },
            ]);
            return { success: added > 0, added };
          } catch (e) {
            return { success: false, error: e.message };
          }
        },
        _i2pToastText = function () {
          const loc =
            (window.I18n &&
              (window.I18n.getLocale?.() || window.I18n._currentLocale)) ||
            "vi";
          const m = {
            vi: "\u0110\xE3 \u0111\u01B0a prompt v\xE0o TobyFlow",
            en: "Prompt added to TobyFlow",
            ja: "\u30D7\u30ED\u30F3\u30D7\u30C8\u3092TobyFlow\u306B\u8FFD\u52A0\u3057\u307E\u3057\u305F",
            th: "\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C\u0E25\u0E07\u0E43\u0E19 TobyFlow \u0E41\u0E25\u0E49\u0E27",
          };
          return m[loc] || m.en;
        },
        _setGenPromptInternal = function (text) {
          if (!text || !window.GenTab?.promptsArea)
            return { success: false, error: "GenTab not ready" };
          window.GenTab.promptsArea.value = text;
          window.GenTab.promptsArea.dispatchEvent(
            new Event("input", { bubbles: true }),
          );
          try {
            const blocks = String(text)
              .split(/\n\s*\n/)
              .map((b) => b.trim())
              .filter(Boolean);
            const mpc = document.getElementById("multiPromptCheck");
            if (mpc && blocks.length > 1 && !mpc.checked) {
              mpc.checked = true;
              mpc.dispatchEvent(new Event("change", { bubbles: true }));
            }
          } catch (_) {}
          try {
            document
              .querySelector('.tobyflow-tab[data-tab="tab-gen"]')
              ?.click?.();
          } catch (_) {}
          try {
            window.GenTab.promptsArea.focus();
          } catch (_) {}
          return { success: true };
        };
      if (!window.eventBus) {
        window.eventBus = new EventBus();
      }
      log("EventBus ready");
      try {
        window.ProviderMeta?.init?.();
      } catch (e) {}
      if (window.I18n) {
        let _showGlobalRateLimitBanner = function (seconds) {
          const banner = document.getElementById("rateLimitNotif");
          const textEl = document.getElementById("rateLimitNotifText");
          if (!banner || !textEl) return;
          let remaining = Math.max(1, Number(seconds) || 15);
          const tpl =
            window.I18n?.t?.("workflow.rateLimitedBanner") ||
            "Too many requests. Automatically retrying in {seconds}s...";
          const render = () => {
            textEl.textContent = tpl.replace("{seconds}", remaining);
          };
          render();
          banner.classList.remove("hidden");
          if (_rlBannerTimer) clearInterval(_rlBannerTimer);
          _rlBannerTimer = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
              clearInterval(_rlBannerTimer);
              _rlBannerTimer = null;
              banner.classList.add("hidden");
            } else {
              render();
            }
          }, 1e3);
        };
        await I18n.init();
        I18n.applyTranslations(document.body);
        log("I18n ready, locale:", I18n.getLocale());
        _checkBrowserCompat();
        window.eventBus.on("i18n:changed", ({ locale }) => {
          I18n.applyTranslations(document.body);
          void window.FlowCookieRecovery?.updateMenuVisibility(
            document
              .getElementById("footerFlowApiBtn")
              ?.getAttribute("aria-pressed") === "true",
          );
          log("I18n locale changed to:", locale);
        });
        window.eventBus.on("i18n:reloaded", ({ locale }) => {
          I18n.applyTranslations(document.body);
          void window.FlowCookieRecovery?.updateMenuVisibility(
            document
              .getElementById("footerFlowApiBtn")
              ?.getAttribute("aria-pressed") === "true",
          );
          log("I18n reloaded from server for locale:", locale);
        });
        let _rlBannerTimer = null;
        window.eventBus.on("api:rate_limited", ({ retryAfter } = {}) => {
          _showGlobalRateLimitBanner(Number(retryAfter) || 15);
        });
        window.eventBus.on("chatgpt:login_required", async () => {
          const dialog = window.customDialog || window.CustomDialog;
          if (!dialog?.confirm) return;
          const ok = await dialog.confirm(
            window.I18n?.t("chatgpt.loginRequiredMsg") ||
              "You are not logged in to ChatGPT. Open a tab to log in?",
            {
              title:
                window.I18n?.t("chatgpt.loginRequiredTitle") ||
                "ChatGPT login required",
              type: "warning",
              confirmText: window.I18n?.t("chatgpt.openTab") || "Open tab",
              cancelText: window.I18n?.t("common.cancel") || "Cancel",
            },
          );
          if (ok) {
            try {
              const response = await chrome.runtime.sendMessage({
                action: "openOrActivateTab",
                urlPattern:
                  window.ProviderConfigManager?.getTabQuery("chatgpt"),
                createUrl:
                  window.ProviderConfigManager?.getCreateUrl("chatgpt"),
                activate: true,
              });
              if (response?.tabId) {
                _pollProviderLogin("chatgpt", response.tabId);
              }
            } catch (err) {
              console.error(
                "[TobyFlow] Kh\xF4ng m\u1EDF \u0111\u01B0\u1EE3c tab ChatGPT:",
                err,
              );
            }
          }
        });
        window.eventBus.on("grok:login_required", async () => {
          const dialog = window.customDialog || window.CustomDialog;
          if (!dialog?.confirm) return;
          const ok = await dialog.confirm(
            window.I18n?.t("grok.loginRequiredMsg") ||
              "Please login at grok.com to use this feature",
            {
              title:
                window.I18n?.t("grok.loginRequiredTitle") ||
                "Grok login required",
              type: "warning",
              confirmText:
                window.I18n?.t("grok.openTab") ||
                window.I18n?.t("chatgpt.openTab") ||
                "Open tab",
              cancelText: window.I18n?.t("common.cancel") || "Cancel",
            },
          );
          if (ok) {
            try {
              const response = await chrome.runtime.sendMessage({
                action: "openOrActivateTab",
                urlPattern: window.ProviderConfigManager?.getTabQuery("grok"),
                createUrl:
                  window.ProviderConfigManager?.getProviderUrl(
                    "grok",
                    "imagine",
                  ) || window.ProviderConfigManager?.getCreateUrl("grok"),
                activate: true,
              });
              if (response?.tabId) {
                _pollProviderLogin("grok", response.tabId);
              }
            } catch (err) {
              console.error(
                "[TobyFlow] Kh\xF4ng m\u1EDF \u0111\u01B0\u1EE3c tab Grok:",
                err,
              );
            }
          }
        });
      }
      setLoadingText(
        window.I18n?.t("app.checkingLogin") || "Checking login...",
      );
      if (window.authManager) {
        await window.authManager.init();
        log("AuthManager ready, logged in:", window.authManager.isLoggedIn());
        window.ExtensionDeviceManager?.init?.();
        window.eventBus?.on?.("auth:login", loadProtectedConfig);
        window.eventBus?.on?.("extension-device:claimed", loadProtectedConfig);
        loadProtectedConfig().catch(() => {});
        if (window.LocationCache) {
          window.LocationCache.init().catch((e) =>
            console.warn("[App] LocationCache init failed:", e.message),
          );
        }
        if (window.RequestCoalescer) {
          window.RequestCoalescer.init();
          log(
            "RequestCoalescer ready, isLeader:",
            window.RequestCoalescer.isLeader(),
          );
        }
        setupAuthUI();
        setupUpgradeUI();
        fetchPlans()
          .then((plans) => {
            if (plans) {
              window._cachedPlans = plans;
              window.eventBus?.emit("featuregate:refreshed", {
                plan: window.featureGate?.plan,
                entitlements: window.featureGate?.entitlements,
              });
            }
          })
          .catch(() => {});
        setupTipCoffee();
        setupContactModal();
        setupExtensionLink();
        setupSettingsLogout();
        setupUsageStatsModal();
        setupNotificationBell();
        setupConversionTriggers();
        setupReferralUI();
        setupLanguageModal();
      }
      if (window.featureGate) {
        await window.featureGate.init();
        log(
          "FeatureGate ready, plan:",
          window.featureGate.getPlan()?.slug || "trial",
        );
      }
      if (window.SystemConfig) {
        setLoadingText(
          window.I18n?.t("app.loadingSystemConfig") ||
            "Loading system configuration...",
        );
        await window.SystemConfig.fetch();
        window.SystemConfig.applyToUI();
        log(
          "SystemConfig ready, maintenance_mode:",
          window.SystemConfig.getBool("maintenance_mode"),
        );
      }
      if (window.authManager?.isLoggedIn()) {
        setLoadingText(
          window.I18n?.t("app.loadingConfig") || "Loading configuration...",
        );
        await window.featureGate?.init?.();
        log("FeatureGate ready");
        if (window.SseClient) {
          console.log(
            "[SSE] \u0110\xE3 \u0111\u0103ng nh\u1EADp \u2192 k\u1EBFt n\u1ED1i SSE ban \u0111\u1EA7u",
          );
          window.SseClient.connect();
        }
      }
      if (window.AnnouncementManager) {
        window.AnnouncementManager.init();
        log("AnnouncementManager ready");
      }
      if (window.ConfigVersionPoller) {
        await window.ConfigVersionPoller.init();
        log("ConfigVersionPoller ready");
      }
      let _localDrainBusy = false;
      async function _processPendingLocalToGenTab() {
        if (_localDrainBusy) return;
        _localDrainBusy = true;
        try {
          const storage = await chrome.storage.local.get([
            "_pendingLocalToGenTab",
          ]);
          const pending = storage._pendingLocalToGenTab || [];
          if (pending.length === 0) return;
          await chrome.storage.local.remove("_pendingLocalToGenTab");
          let addedCount = 0;
          for (const item of pending) {
            const r = _addLocalImageToGenTabInternal(item);
            if (r.success) addedCount += r.added || 1;
          }
          if (addedCount > 0) {
            try {
              document
                .querySelector('.tobyflow-tab[data-tab="tab-gen"]')
                ?.click?.();
            } catch (_) {}
            const _msg =
              window.I18n?.t("gen.refImageAddedCount", { count: addedCount }) ||
              `${addedCount} reference image(s) added to Generate tab`;
            window.showNotification?.(_msg, "success", 2500);
          }
        } catch (e) {
          console.warn("[TobyFlow] Error processing pending localToGenTab:", e);
        } finally {
          _localDrainBusy = false;
        }
      }
      async function _processPendingAddToGenTab() {
        try {
          const storage = await chrome.storage.local.get([
            "_pendingAddToGenTab",
          ]);
          const pending = storage._pendingAddToGenTab || [];
          if (pending.length === 0) return;
          console.log(
            `[TobyFlow] Processing ${pending.length} pending addImageToGenTab`,
          );
          let addedCount = 0;
          for (const item of pending) {
            const result = _addImageToGenTabInternal(
              item.tileId,
              item.fileName,
              item.thumbnail,
            );
            if (result.success && !result.alreadyExists) {
              addedCount++;
            }
          }
          await chrome.storage.local.remove("_pendingAddToGenTab");
          if (addedCount > 0) {
            const _msg =
              window.I18n?.t("gen.refImageAddedCount", { count: addedCount }) ||
              `${addedCount} reference image(s) added to Generate tab`;
            window.showNotification?.(_msg, "success", 2500);
          }
        } catch (e) {
          console.warn("[TobyFlow] Error processing pending addToGenTab:", e);
        }
      }
      async function _processPendingI2pPrompt() {
        try {
          const st = await chrome.storage.local.get(["i2p_pending_prompt"]);
          const p = st.i2p_pending_prompt;
          if (p && p.text) {
            const r = _setGenPromptInternal(p.text);
            if (r.success) {
              await chrome.storage.local.remove("i2p_pending_prompt");
              window.showNotification?.(_i2pToastText(), "success", 3e3);
            }
          }
        } catch (e) {
          console.warn("[I2P] process pending prompt:", e);
        }
      }
      window._processPendingI2pPrompt = _processPendingI2pPrompt;
      window._setGenPromptInternal = _setGenPromptInternal;
      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.action === "contentLog") {
          sidebarLog(msg.msg, msg.level || "info");
        }
        if (msg.action === "promptExecutionComplete") {
          sidebarLog(
            window.I18n?.t("app.executionComplete", {
              completed: msg.completedCount,
              total: msg.totalCount,
            }) ||
              `Execution completed: ${msg.completedCount}/${msg.totalCount} successful`,
            msg.failedCount > 0 ? "warn" : "info",
          );
        }
        if (msg.action === "settingsSaved") {
          window.showNotification?.(
            msg.message ||
              window.I18n?.t("settings.saved") ||
              "Settings have been updated",
            "success",
            3e3,
          );
        }
        if (msg.action === "queue:add_batch_references") {
          Promise.resolve()
            .then(() =>
              window.GenTab.addTrackerReferences(msg.references, msg.projectId),
            )
            .then((added) => {
              window.showNotification?.(
                window.I18n?.t(
                  added > 0
                    ? "gen.refImageAddedCount"
                    : "gen.refImageAlreadyAdded",
                  { count: added },
                ),
                added > 0 ? "success" : "info",
              );
              sendResponse({ ok: true, added });
            })
            .catch((error) => {
              window.showNotification?.(error.message, "error");
              sendResponse({ ok: false, error: error.message });
            });
          return true;
        }
        if (msg.action === "queue:stop_all") {
          if (window.PromptQueue) {
            PromptQueue.getInstance()?.stopAll({
              stopOrigin: "user",
              stopReason: "USER_CANCELLED",
              requestedAt: msg.requestedAt || Date.now(),
              stopSource: msg.stopSource || "QUEUE_STOP_SOURCE_UNKNOWN",
            });
          }
          window.GenTab?.stopProviderGeneration?.({
            requestedAt: msg.requestedAt || Date.now(),
          }).catch(() => {});
          sendResponse({ ok: true });
          return true;
        }
        if (msg.action === "queue:stop_job" && msg.jobId) {
          const queue = window.PromptQueue?.getInstance?.();
          if (window.GenTab && msg.jobId === "chat-gen") {
            GenTab.stopProviderGeneration({
              requestedAt: msg.requestedAt || Date.now(),
            }).catch(() => {});
          }
          if (msg.jobId !== "chat-gen" && !queue?._jobs?.has(msg.jobId))
            return false;
          Promise.resolve(
            queue?.stopJobAndPersist?.(msg.jobId, {
              stopOrigin: "user",
              stopReason: "USER_CANCELLED",
              stopSource: msg.stopSource || "QUEUE_STOP_SOURCE_UNKNOWN",
            }),
          )
            .then((stopped) => {
              sendResponse(
                stopped || msg.jobId === "chat-gen"
                  ? { ok: true }
                  : {
                      ok: false,
                      error: queue ? "JOB_NOT_FOUND" : "PROMPT_QUEUE_NOT_READY",
                    },
              );
            })
            .catch(() =>
              sendResponse({
                ok: false,
                error: "RECOVERY_STOP_PERSIST_FAILED",
              }),
            );
          return true;
        }
        if (msg.action === "queue:pause_job" && msg.jobId) {
          const queue = window.PromptQueue?.getInstance?.();
          if (!queue?._jobs?.has(msg.jobId)) return false;
          queue.pauseJob(msg.jobId);
          sendResponse(
            queue.getJob?.(msg.jobId)?.state === "paused"
              ? { ok: true }
              : { ok: false, error: "PAUSE_NOT_ACCEPTED" },
          );
          return true;
        }
        if (msg.action === "queue:resume_job" && msg.jobId) {
          const queue = window.PromptQueue?.getInstance?.();
          if (!queue?._jobs?.has(msg.jobId)) return false;
          Promise.resolve(queue.resumeJob(msg.jobId))
            .then((resumed) => {
              sendResponse(
                resumed
                  ? { ok: true }
                  : {
                      ok: false,
                      error: queue._lastResumeError || "RESUME_NOT_ACCEPTED",
                    },
              );
            })
            .catch((error) =>
              sendResponse({
                ok: false,
                error: error?.message || "RESUME_FAILED",
              }),
            );
          return true;
        }
        if (msg.action === "queue:regen_item" && msg.itemId) {
          const queue = window.PromptQueue?.getInstance?.();
          if (!queue) {
            sendResponse({ ok: false, error: "PROMPT_QUEUE_NOT_READY" });
            return true;
          }
          const accepted = queue.requestTrackerRegenItem({
            jobId: msg.jobId,
            itemId: msg.itemId,
            prompt: msg.prompt,
            payload: msg.payload,
            settingsOverride: msg.settingsOverride,
            onAdmission: (result) =>
              sendResponse(
                result.ok
                  ? {
                      ok: true,
                      itemId: result.queued ? result.itemId : result.itemIds[0],
                      queued: result.queued === true,
                      position: result.position || 0,
                    }
                  : { ok: false, error: result.error || "REGEN_NOT_ACCEPTED" },
              ),
          });
          if (!accepted)
            sendResponse({
              ok: false,
              error: queue._lastRegenError || "REGEN_NOT_ACCEPTED",
            });
          return true;
        }
        if (msg.action === "queue:regen_batch" && Array.isArray(msg.items)) {
          const queue = window.PromptQueue?.getInstance?.();
          if (!queue) {
            sendResponse({ ok: false, error: "PROMPT_QUEUE_NOT_READY" });
            return true;
          }
          const accepted = queue.regenBatch({
            items: msg.items,
            onAdmission: (result) =>
              sendResponse(
                result.ok
                  ? { ok: true, itemIds: result.itemIds }
                  : {
                      ok: false,
                      error: result.error || "REGEN_BATCH_NOT_ACCEPTED",
                    },
              ),
          });
          if (!accepted)
            sendResponse({
              ok: false,
              error: queue._lastRegenError || "REGEN_BATCH_NOT_ACCEPTED",
            });
          return true;
        }
        if (msg.action === "queue:regen_options") {
          (async () => {
            const models = {};
            const mediaTypes = [
              ...new Set(
                (Array.isArray(msg.mediaTypes)
                  ? msg.mediaTypes
                  : ["image", "video"]
                ).filter((type) => ["image", "video"].includes(type)),
              ),
            ];
            for (const mediaType of mediaTypes) {
              const entries =
                (await window.ModelRegistry?.getModels?.("flow", mediaType)) ||
                [];
              models[mediaType] = entries
                .filter(
                  (model) =>
                    !model.required_feature_key ||
                    window.featureGate?.canUse?.(model.required_feature_key),
                )
                .map((model) => ({ value: model.value, name: model.name }));
            }
            sendResponse({
              ok: true,
              models,
              executionMode:
                window.storageSettings?.getSettings?.()?.defaultGenMode ||
                window.storageSettings?.getSettings?.()?.gen_mode ||
                null,
            });
          })().catch((error) =>
            sendResponse({
              ok: false,
              error: error?.message || "REGEN_CONFIG_UNAVAILABLE",
            }),
          );
          return true;
        }
        if (msg.action === "queue:regen_preflight") {
          (async () => {
            const mediaTypes = [
              ...new Set(
                (Array.isArray(msg.mediaTypes)
                  ? msg.mediaTypes
                  : ["image"]
                ).map((value) => (value === "video" ? "video" : "image")),
              ),
            ];
            const flowSettings = window.storageSettings?.getSettings?.() || {};
            const apiActive = [true, "true", 1].includes(
              flowSettings.apiModeEnabled,
            );
            const apiIntended =
              apiActive &&
              window.FlowApiAdapter?.isApiModeIntended?.({
                executionMode:
                  msg.executionMode === "auto" ? null : msg.executionMode,
              }) === true;
            if (apiIntended) {
              const scoped =
                await window.FlowApiSessionCoordinator?.checkScopes?.({
                  surfaces: ["gen"],
                  mediaTypes,
                  force: true,
                  passive: true,
                }).catch(() => null);
              const health = scoped?.scopes?.map((entry) => entry.health) || [];
              if (
                health.length > 0 &&
                health.every((entry) => entry?.ready === true)
              ) {
                sendResponse({
                  ready: true,
                  admit: true,
                  route: "api",
                  driver: health[0]?.driver || null,
                });
                return;
              }
            }
            const web = await chrome.runtime
              .sendMessage({
                action: "checkFlowTabOpen",
                readinessScope: "project",
              })
              .catch(() => null);
            sendResponse({
              ready: !!(web?.ready ?? web?.isOpen),
              admit: true,
              route: "web",
              required: false,
              reason: web?.error || null,
            });
          })().catch((error) =>
            sendResponse({
              ready: false,
              admit: false,
              error: error?.message || "REGEN_PREFLIGHT_FAILED",
            }),
          );
          return true;
        }
        if (msg.action === "queue:clear_tracker_history") {
          const queue = window.PromptQueue?.getInstance?.();
          if (!queue) {
            sendResponse({ ok: false, error: "PROMPT_QUEUE_NOT_READY" });
            return true;
          }
          if (
            !msg.projectId ||
            (window._currentProjectId &&
              window._currentProjectId !== msg.projectId)
          ) {
            sendResponse({ ok: false, error: "PROJECT_CONTEXT_MISMATCH" });
            return true;
          }
          queue
            .clearTrackerHistory(msg.projectId, { force: msg.force === true })
            .then((cleared) =>
              sendResponse(
                cleared ? { ok: true } : { ok: false, error: "PIPELINE_BUSY" },
              ),
            )
            .catch((error) =>
              sendResponse({
                ok: false,
                error: error?.message || "RECOVERY_CLEAR_FAILED",
              }),
            );
          return true;
        }
        if (msg.action === "queue:remove_tracker_item") {
          const queue = window.PromptQueue?.getInstance?.();
          if (!queue) {
            sendResponse({ ok: false, error: "PROMPT_QUEUE_NOT_READY" });
            return true;
          }
          if (
            !msg.projectId ||
            (window._currentProjectId &&
              window._currentProjectId !== msg.projectId)
          ) {
            sendResponse({ ok: false, error: "PROJECT_CONTEXT_MISMATCH" });
            return true;
          }
          sendResponse(
            queue.removeTrackerItem(msg.projectId, msg.jobId, msg.itemId)
              ? { ok: true }
              : {
                  ok: false,
                  error: queue.isRunning
                    ? "PIPELINE_BUSY"
                    : "REMOVE_NOT_ALLOWED",
                },
          );
          return true;
        }
        if (msg.action === "queue:update_tracker_prompt") {
          const queue = window.PromptQueue?.getInstance?.();
          if (!queue) {
            sendResponse({ ok: false, error: "PROMPT_QUEUE_NOT_READY" });
            return true;
          }
          if (
            !msg.projectId ||
            (window._currentProjectId &&
              window._currentProjectId !== msg.projectId)
          ) {
            sendResponse({ ok: false, error: "PROJECT_CONTEXT_MISMATCH" });
            return true;
          }
          queue
            .updateTrackerPrompt(
              msg.projectId,
              msg.jobId,
              msg.itemId,
              msg.prompt,
            )
            .then(sendResponse)
            .catch((error) =>
              sendResponse({
                ok: false,
                error: error?.message || "PROMPT_SAVE_FAILED",
              }),
            );
          return true;
        }
        if (msg.action === "captcha:userAction") {
          window.eventBus?.emit("captcha:userAction", {
            decision: msg.decision,
          });
        }
        if (msg.action === "flowTabActivated") {
          if (window.ImmediateUploader) {
            window.ImmediateUploader.uploadAllPending()
              .then((result) => {
                if (result.uploaded > 0) {
                  console.log(
                    `[TobyFlow] Auto-uploaded ${result.uploaded} pending file(s) khi Flow tab active`,
                  );
                }
              })
              .catch(() => {});
          }
          _requestProjectContext();
        }
        if (msg.action === "addImageToGenTab") {
          const result = _addImageToGenTabInternal(
            msg.tileId,
            msg.fileName,
            msg.thumbnail,
          );
          if (result?.success) {
            try {
              document
                .querySelector('.tobyflow-tab[data-tab="tab-gen"]')
                ?.click?.();
            } catch (_) {}
            try {
              if (result.alreadyExists) {
                window.showNotification?.(
                  window.I18n?.t("gen.refImageAlreadyAdded") ||
                    "Reference image already in the list",
                  "info",
                  2500,
                );
              } else {
                window.showNotification?.(
                  window.I18n?.t("gen.refImageAdded") ||
                    "Reference image added to Generate tab",
                  "success",
                  2500,
                );
              }
            } catch (_) {}
          }
          sendResponse(result);
          return true;
        }
        if (msg.action === "drainLocalToGenTab") {
          _processPendingLocalToGenTab();
          sendResponse({ ok: true });
          return true;
        }
        if (msg.action === "i2p:setGenPrompt") {
          const result = _setGenPromptInternal(msg.text);
          if (result.success) {
            try {
              chrome.storage.local.remove("i2p_pending_prompt");
            } catch (_) {}
            window.showNotification?.(_i2pToastText(), "success", 3e3);
          }
          sendResponse(result);
          return true;
        }
        return false;
      });
      window.eventBus.on("execution:log", (data) => {
        const nodeId = data.nodeId;
        let prefix = "";
        if (nodeId && window.workflowEditor) {
          const name = window.workflowEditor._getNodeNameById?.(nodeId);
          if (name) prefix = `[${name}] `;
        }
        const level = data.type === "success" ? "info" : data.type || "info";
        sidebarLog(`${prefix}${data.message}`, level);
      });
      if (window.PendingUploadStore) {
        await PendingUploadStore.restore();
        await PendingUploadStore.restoreCache();
        await PendingUploadStore.restoreLightweight();
        log("PendingUploadStore ready");
        if (window.GenTab?.cleanupUnavailableUploads) {
          window.GenTab.cleanupUnavailableUploads();
        }
        PendingUploadStore._scheduleCleanup();
        if (
          window.pendingUploadFiles?.size > 0 &&
          window.GenTab?.renderFileIdThumbnails
        ) {
          window.GenTab.renderFileIdThumbnails();
        }
        _processPendingAddToGenTab();
        _processPendingLocalToGenTab();
        _processPendingI2pPrompt();
      }
      setLoadingText(window.I18n?.t("msg.loadingData") || "Loading data...");
      if (!window.storageManager) {
        window.storageManager = new StorageManager();
      }
      await window.storageManager.init();
      log("StorageManager ready, mode:", window.storageManager.getMode());
      if (window.StorageSettings && !window.storageSettings) {
        window.storageSettings = new StorageSettings();
      }
      if (window.GenTab?._applyStorageSettings) {
        window.GenTab._applyStorageSettings();
      }
      try {
        window.ModelRegistry?.fetchInBackground?.();
        window.ValidationRules?.fetchInBackground?.();
      } catch (_) {}
      if (window.generationHistory) {
        await window.generationHistory.init();
        log("GenerationHistory ready");
      }
      if (window.userPromptsManager) {
        await window.userPromptsManager.init();
        log("UserPromptsManager ready");
      }
      if (window.NotificationManager) {
        await NotificationManager.init();
        log("NotificationManager ready");
      }
      if (window.ImagePickerModal && !window.imagePickerModal) {
        window.imagePickerModal = new ImagePickerModal();
        log("ImagePickerModal ready");
      }
      if (window.TaskModal && !window.taskModal) {
        window.taskModal = new TaskModal();
        log("TaskModal ready");
      }
      setupTaskExecutor();
      if (window.ExecutionTracker) {
        ExecutionTracker.init();
        log("ExecutionTracker ready");
      }
      if (window.PipelineFooter) {
        PipelineFooter.init();
        log("PipelineFooter ready");
      }
      if (window.eventBus && typeof MessageBridge !== "undefined") {
        let _trackerStartedAt = null;
        window.eventBus.on("execution:tracker_update", (data) => {
          if (window.PromptQueue && PromptQueue.isEnabled()) return;
          if (data.owner === "prompts") return;
          if (data.phase === "started") _trackerStartedAt = Date.now();
          const status =
            data.phase === "completed"
              ? "completed"
              : data.phase === "error"
                ? "stopped"
                : data.phase === "paused"
                  ? "paused"
                  : "running";
          MessageBridge.sendToContentScript("legacyTrackerUpdate", {
            data: {
              owner: data.owner,
              label: data.label || data.owner,
              status,
              current: data.current || 0,
              total: data.total || 0,
              failed: data.errorCount || 0,
              startedAt: _trackerStartedAt,
            },
          }).catch(() => {});
        });
      }
      if (window.QueueMonitor) {
        QueueMonitor.init();
        log("QueueMonitor ready");
      }
      document
        .querySelectorAll(
          ".tobyflow-tabs, .prompts-subtabs, .photos-subtabs, .tobyflow-logs-subtabs",
        )
        .forEach((tabs) => window.ProviderTabScroll?.bind(tabs));
      _setupLogsSubtabs();
      _setupPromptsSubtabs();
      setLoadingText(
        window.I18n?.t("app.initializingUI") || "Initializing interface...",
      );
      document.querySelectorAll(".tobyflow-tab").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const tabId = btn.dataset.tab;
          const pane = document.getElementById(tabId);
          if (tabId === "tab-gen" && window.featureGate && pane) {
            const fg = window.featureGate;
            const anyProviderEnabled =
              fg.canUse?.("gen_enabled") ||
              fg.canUse?.("chatgpt_enabled") ||
              fg.canUse?.("grok_enabled");
            if (!anyProviderEnabled) {
              showModuleBlockedOverlay(pane, "gen");
              return;
            }
          } else if (tabId === "tab-tasks" && window.featureGate && pane) {
            const syncAllowed =
              window.featureGate.isModuleEnabled?.("tasks") === true;
            if (!syncAllowed) {
              showModuleBlockedOverlay(pane, "tasks");
              return;
            }
          }
          initializeTab(tabId);
        });
      });
      const autoCapcutBtn = document.getElementById("autoCapcutToolbarBtn");
      window._gateAutoCapcutTool = function () {
        if (!autoCapcutBtn) return;
        const systemOn =
          window.SystemConfig?.getBool?.("auto_capcut_tool_enabled") === true;
        autoCapcutBtn.classList.toggle("hidden", !systemOn);
      };
      window._gateAutoCapcutTool();
      autoCapcutBtn?.addEventListener("click", async (e) => {
        e.stopPropagation();
        const systemOn = await window.SystemConfig?.getBoolReady?.(
          "auto_capcut_tool_enabled",
        );
        window._gateAutoCapcutTool();
        if (!systemOn) return;
        if (!(window.featureGate?.canUse?.("auto_capcut_enabled") ?? false)) {
          await window.featureGate?.showModuleBlockedDialog?.(
            "auto_capcut_enabled",
          );
          return;
        }
        chrome.runtime.sendMessage({ action: "openAutoCapcutBuilder" });
      });
      const anglesBtn = document.getElementById("anglesToolbarBtn");
      if (anglesBtn) {
        anglesBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (window.featureGate) {
            const isEnabled =
              await window.featureGate.isModuleEnabledAsync("angles");
            if (!isEnabled) {
              await window.featureGate.showModuleBlockedDialog("angles");
              return;
            }
          }
          chrome.runtime.sendMessage({
            action: "openAnglesEditor",
            projectId: window._currentProjectId || null,
            projectName: window._currentProjectName || null,
          });
        });
      }
      const effectsBtn = document.getElementById("effectsToolbarBtn");
      if (effectsBtn) {
        effectsBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (window.featureGate) {
            const isEnabled =
              await window.featureGate.isModuleEnabledAsync("effects");
            if (!isEnabled) {
              await window.featureGate.showModuleBlockedDialog("effects");
              return;
            }
          }
          chrome.runtime.sendMessage({
            action: "openEffectsEditor",
            projectId: window._currentProjectId || null,
            projectName: window._currentProjectName || null,
          });
        });
      }
      const watermarkBtn = document.getElementById("watermarkToolbarBtn");
      if (watermarkBtn) {
        watermarkBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          let sysOn = false;
          try {
            sysOn = window.SystemConfig
              ? await window.SystemConfig.getBoolReady(
                  "remove_watermark_enabled",
                )
              : false;
          } catch (_) {
            sysOn = false;
          }
          if (!sysOn) {
            console.warn(
              "[Watermark] t\u1EA7ng 1 t\u1EAFt \u2192 \u1EA9n n\xFAt",
            );
            window._gateWatermarkTool?.();
            await window.customDialog?.alert?.(
              window.I18n?.t("watermark.errDisabled") ||
                "Feature is currently turned off",
            );
            return;
          }
          if (
            window.featureGate &&
            !window.featureGate.canUse("image_remove_watermark_enabled")
          ) {
            await window.featureGate.showModuleBlockedDialog(
              "image_remove_watermark_enabled",
            );
            return;
          }
          window.watermarkToolModal?.open();
        });
      }
      const telegramBtn = document.getElementById("telegramToolbarBtn");
      if (telegramBtn) {
        telegramBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          chrome.runtime.sendMessage({
            action: "openSettings",
            tab: "telegram",
          });
        });
      }
      const aiAgentBtn = document.getElementById("aiAgentToolbarBtn");
      if (aiAgentBtn) {
        aiAgentBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          chrome.runtime.sendMessage({ action: "openSettings", tab: "mcp" });
        });
      }
      window._gateAgentBotTools = async function () {
        let off = false;
        try {
          const r = await chrome.storage.local.get(["af_entitlements"]);
          const ent = r.af_entitlements?.entitlements || {};
          const v = ent.agent_bot_enabled?.value ?? ent.agent_bot_enabled;
          off = v === "0" || v === 0 || v === false;
        } catch (_) {}
        ["telegramToolbarBtn", "aiAgentToolbarBtn"].forEach((id) => {
          document.getElementById(id)?.classList.toggle("hidden", off);
        });
      };
      window._gateAgentBotTools();
      window._syncFooterWm = function (freshSettings) {
        const row = document.getElementById("footerWm");
        if (!row) return;
        const sysRaw = window.SystemConfig?.get?.(
          "remove_watermark_enabled",
          void 0,
        );
        if (sysRaw === void 0) {
          row.classList.add("hidden");
          if (
            !window._footerWmSystemRefresh &&
            !window._footerWmSystemRefreshAttempted
          ) {
            window._footerWmSystemRefreshAttempted = true;
            window._footerWmSystemRefresh = Promise.resolve(
              window.SystemConfig?.fetch?.(true),
            )
              .then(() => window._syncFooterWm?.(freshSettings))
              .catch((e) =>
                console.warn(
                  "[Footer] kh\xF4ng t\u1EA3i \u0111\u01B0\u1EE3c gate watermark:",
                  e?.message,
                ),
              )
              .finally(() => {
                window._footerWmSystemRefresh = null;
              });
          }
          return;
        }
        const sysOn = sysRaw === true || sysRaw === "1" || sysRaw === 1;
        row.classList.toggle("hidden", !sysOn);
        if (!sysOn) return;
        try {
          const block = [
            "footerPremium",
            "footerPro",
            "footerFree",
            "footerGuest",
          ]
            .map((id) => document.getElementById(id))
            .find((el) => el && !el.classList.contains("hidden"));
          const host = block?.querySelector(".footer-free-row") || block;
          const support = host?.querySelector(".footer-support-btn");
          if (host && row.parentElement !== host) {
            if (support) host.insertBefore(row, support);
            else host.appendChild(row);
          } else if (host && support && row.nextElementSibling !== support) {
            host.insertBefore(row, support);
          }
        } catch (_) {}
        const st =
          freshSettings || window.storageSettings?.getSettings?.() || {};
        try {
          const canImage =
            window.featureGate?.canUse?.("image_remove_watermark_enabled") ??
            false;
          const entitlementReady =
            window.featureGate?.isInitialized?.() === true;
          row.classList.toggle("is-teaser", entitlementReady && !canImage);
          console.debug("[Footer][WatermarkGate]", {
            systemReady: true,
            systemEnabled: sysOn,
            featureGateReady: entitlementReady,
            plan: window.featureGate?.getPlan?.()?.slug || null,
            imageAllowed: canImage,
            videoAllowed:
              window.featureGate?.canUse?.("video_remove_watermark_enabled") ??
              false,
            autoRemoveWatermark:
              st.autoRemoveWatermark === true ||
              st.autoRemoveWatermark === "1" ||
              st.autoRemoveWatermark === 1,
          });
        } catch (_) {}
        [
          [
            "footerWmImageWrap",
            "footerWmImage",
            "autoRemoveWatermark",
            "image_remove_watermark_enabled",
          ],
          [
            "footerWmVideoWrap",
            "footerWmVideo",
            "autoRemoveWatermarkVideo",
            "video_remove_watermark_enabled",
          ],
        ].forEach(([wrapId, inputId, setKey, featKey]) => {
          const wrap = document.getElementById(wrapId);
          const input = document.getElementById(inputId);
          if (!wrap || !input) return;
          const can = window.featureGate?.canUse?.(featKey) ?? false;
          const v = st[setKey];
          wrap.classList.toggle("locked", !can);
          input.checked = can && (v === true || v === "1" || v === 1);
          input.dataset.wmKey = setKey;
          input.dataset.wmCan = can ? "1" : "0";
          if (input.dataset.wmBound === "1") return;
          input.dataset.wmBound = "1";
          input.addEventListener("click", (e) => {
            if (input.dataset.wmCan !== "1") {
              e.preventDefault();
              try {
                chrome.runtime.sendMessage({
                  action: "openSettings",
                  tab: "ai-platform",
                });
              } catch (_) {}
            }
          });
          input.addEventListener("change", () => {
            if (input.dataset.wmCan !== "1") {
              input.checked = false;
              return;
            }
            try {
              window.storageSettings?.set?.(input.dataset.wmKey, input.checked);
              const k = input.dataset.wmKey;
              chrome.storage.local.get(["af_settings_touched"], (r) => {
                const t = Array.isArray(r?.af_settings_touched)
                  ? r.af_settings_touched
                  : [];
                if (!t.includes(k))
                  chrome.storage.local.set({ af_settings_touched: [...t, k] });
              });
            } catch (err) {
              console.warn(
                "[Footer] kh\xF4ng l\u01B0u \u0111\u01B0\u1EE3c toggle watermark:",
                err?.message,
              );
            }
          });
        });
        const openBtn = document.getElementById("footerWmOpen");
        if (openBtn && !openBtn.dataset.wmBound) {
          openBtn.dataset.wmBound = "1";
          openBtn.addEventListener("click", () => {
            try {
              chrome.runtime.sendMessage({
                action: "openSettings",
                tab: "ai-platform",
              });
            } catch (_) {}
          });
        }
      };
      window._syncFooterWm();
      window._syncFooterFlowApi = async function () {
        const paintId = (window._footerFlowApiPaintId =
          (window._footerFlowApiPaintId || 0) + 1);
        const btn = document.getElementById("footerFlowApiBtn");
        if (!btn) return;
        const block = [
          "footerPremium",
          "footerPro",
          "footerFree",
          "footerGuest",
        ]
          .map((id) => document.getElementById(id))
          .find((el) => el && !el.classList.contains("hidden"));
        const host = block?.querySelector(".footer-free-row") || block;
        if (!host) {
          btn.classList.add("hidden");
          return;
        }
        const watermark = host.querySelector("#footerWm");
        const support = host.querySelector(".footer-support-btn");
        const anchor = watermark || support;
        if (
          btn.parentElement !== host ||
          (anchor && btn.nextElementSibling !== anchor)
        ) {
          if (anchor) host.insertBefore(btn, anchor);
          else host.appendChild(btn);
        }
        const entitlementReady = window.featureGate?.isInitialized?.() === true;
        const entitled =
          !window.featureGate?.canUse ||
          !entitlementReady ||
          window.featureGate.canUse("flow_api_enabled");
        const settings = window.storageSettings?.getSettings?.() || {};
        const enabled =
          settings.apiModeEnabled === true ||
          settings.apiModeEnabled === "true" ||
          settings.apiModeEnabled === 1;
        const mode = settings.defaultGenMode || settings.gen_mode || "ui";
        const selected =
          entitled && enabled && (mode === "api" || mode === "auto");
        let ready = false;
        let driver = null;
        let connecting = false;
        if (selected) {
          try {
            const bridge = await window.BridgeClient?.ping?.(true);
            if (bridge?.installed !== false || bridge?.uncertain === true) {
              const health = await window.FlowApiSessionCoordinator?.check?.({
                surface: "gen",
                mediaType: "image",
                passive: true,
              });
              ready = health?.ready === true;
              connecting = health?.connecting === true;
              driver = ["v1", "v2"].includes(health?.driver)
                ? health.driver
                : null;
            }
          } catch (_) {}
        }
        const version = btn.querySelector(".footer-flow-api-version");
        if (paintId !== window._footerFlowApiPaintId) return;
        connecting =
          selected &&
          !ready &&
          (connecting || window.__flowReloadSyncInProgress === true);
        if (version) {
          version.classList.toggle(
            "hidden",
            !selected || (!ready && !connecting) || !driver,
          );
          version.textContent = driver ? driver.toUpperCase() : "";
          if (driver) version.dataset.driver = driver;
          else delete version.dataset.driver;
        }
        btn.classList.remove("hidden");
        btn.classList.toggle("is-on", selected && ready);
        void window.FlowCookieRecovery?.updateMenuVisibility(selected && ready);
        btn.classList.toggle("is-reconnecting", connecting);
        btn.setAttribute("aria-busy", connecting ? "true" : "false");
        btn.classList.toggle("is-locked", entitlementReady && !entitled);
        btn.setAttribute("aria-pressed", selected && ready ? "true" : "false");
        btn
          .querySelector(".footer-flow-api-crown")
          ?.classList.toggle("hidden", !entitlementReady || entitled);
        btn
          .querySelector(".footer-flow-api-flash")
          ?.classList.toggle("hidden", !entitlementReady || !entitled);
        btn.title =
          entitlementReady && !entitled
            ? window.I18n?.t?.("settings.flowApiUpgradeDesc") ||
              "Upgrade your plan to use Flow API"
            : selected && ready
              ? window.I18n?.t?.("settings.bridgeReady") || "Flow API active"
              : window.I18n?.t?.("gen.apiSettingTooltip") ||
                "Flow API settings";
      };
      const footerFlowApiBtn = document.getElementById("footerFlowApiBtn");
      if (footerFlowApiBtn && !footerFlowApiBtn.dataset.bound) {
        footerFlowApiBtn.dataset.bound = "1";
        footerFlowApiBtn.addEventListener("click", () => {
          try {
            chrome.runtime.sendMessage({
              action: "openSettings",
              tab: "ai-platform",
            });
          } catch (_) {}
        });
      }
      window._syncFooterFlowApi();
      try {
        window.eventBus?.on?.(
          "featuregate:refreshed",
          window._syncFooterFlowApi,
        );
      } catch (_) {}
      try {
        window.eventBus?.on?.("plan:changed", window._syncFooterFlowApi);
      } catch (_) {}
      try {
        window.eventBus?.on?.(
          "flow_api:auth_invalid",
          window._syncFooterFlowApi,
        );
      } catch (_) {}
      try {
        window.eventBus?.on?.(
          "flow_api:driver_changed",
          window._syncFooterFlowApi,
        );
      } catch (_) {}
      for (const event of [
        "bridge:changed",
        "provider:api_config_updated",
        "provider:private_configs_loaded",
        "flow:reload_sync_state",
        "auth:login",
        "auth:logout",
      ]) {
        try {
          window.eventBus?.on?.(event, window._syncFooterFlowApi);
        } catch (_) {}
      }
      if (!window._footerFlowApiHealthTimer) {
        window._footerFlowApiHealthTimer = setInterval(() => {
          try {
            window._syncFooterFlowApi?.();
          } catch (_) {}
        }, 5e3);
      }
      if (!window._footerWmStorageBound) {
        window._footerWmStorageBound = true;
        try {
          chrome.storage.onChanged.addListener((ch, area) => {
            if (area === "session" && ch.flowReloadUiState) {
              window.__flowReloadSyncInProgress =
                ch.flowReloadUiState.newValue?.active === true;
              try {
                window._syncFooterFlowApi?.();
              } catch (_) {}
            }
            if (area !== "local") return;
            if (ch.af_settings || ch.af_system_settings || ch.af_entitlements) {
              try {
                window._syncFooterWm?.(ch.af_settings?.newValue || null);
              } catch (_) {}
              try {
                window._syncFooterFlowApi?.();
              } catch (_) {}
            }
            if (
              ch.toby_flow_api_health_gen_image ||
              ch.toby_flow_api_health_gen_video ||
              ch.toby_flow_api_v2_private_epoch ||
              ch.toby_flow_api_v2_private_configs
            ) {
              try {
                window._syncFooterFlowApi?.();
              } catch (_) {}
            }
          });
        } catch (_) {}
      }
      window._gateWatermarkTool = function () {
        const btn = document.getElementById("watermarkToolbarBtn");
        if (!btn) return;
        const sysOn =
          window.SystemConfig?.getBool?.("remove_watermark_enabled") === true;
        btn.classList.toggle("hidden", !sysOn);
        if (!sysOn) return;
        const allowed = window.featureGate?.canUse
          ? window.featureGate.canUse("image_remove_watermark_enabled")
          : false;
        btn.classList.toggle("is-locked", !allowed);
        btn.querySelector(".wmtool-crown")?.classList.toggle("hidden", allowed);
      };
      window._gateWatermarkTool();
      const projBtn = document.getElementById("project-indicator-btn");
      if (projBtn) {
        projBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          _toggleProjectDropdown();
        });
      }
      const createBtn = document.getElementById("project-create-btn");
      if (createBtn) {
        createBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          _createNewProject();
        });
      }
      let activeTabId = null;
      try {
        const localData = await chrome.storage.local.get(
          "af_active_sidebar_tab",
        );
        activeTabId = localData?.af_active_sidebar_tab || null;
      } catch (e) {}
      if (activeTabId && document.getElementById(activeTabId)) {
        const tabBtns = document.querySelectorAll(".tobyflow-tab");
        const tabPanes = document.querySelectorAll(".tab-pane");
        tabBtns.forEach((b) => {
          b.classList.toggle("active", b.dataset.tab === activeTabId);
        });
        tabPanes.forEach((p) => {
          p.classList.toggle("active", p.id === activeTabId);
        });
      }
      const activeTab = document.querySelector(".tab-pane.active");
      if (activeTab) {
        const moduleCheck = await checkModuleAccess(activeTab.id);
        activeTab.classList.remove("module-pending");
        if (!moduleCheck.allowed) {
          showModuleBlockedOverlay(activeTab, moduleCheck.module);
        } else {
          await initializeTab(activeTab.id);
        }
      }
      log("App initialized successfully");
      refreshAllThumbnails();
      _cleanupStaleProjects();
      setTimeout(() => _syncProjectsFromFlow(), 3e3);
    } catch (error) {
      console.error("[TobyFlow] Init failed:", error);
      setLoadingText(
        window.I18n?.t("app.loadError") || "Error loading data. Retrying...",
      );
      const loadingContent = overlay?.querySelector(
        ".tobyflow-loading-content",
      );
      if (
        loadingContent &&
        !loadingContent.querySelector(".tobyflow-loading-retry")
      ) {
        const retryBtn = document.createElement("button");
        retryBtn.className = "btn btn-primary tobyflow-loading-retry";
        retryBtn.textContent = window.I18n?.t("common.retry") || "Retry";
        retryBtn.style.marginTop = "12px";
        retryBtn.addEventListener("click", () => {
          retryBtn.remove();
          overlay?.classList.remove("tobyflow-loading-overlay--hidden");
          init();
        });
        loadingContent.appendChild(retryBtn);
      }
      return;
    }
    hideLoadingOverlay();
    if (!_projectContextResolved && _isInitialRetrying) {
      _showConnectingOverlay();
    }
    setTimeout(() => {
      if (
        !_projectContextResolved &&
        !window._currentProjectId &&
        !_isInitialRetrying
      ) {
        _hideConnectingOverlay();
        _showProjectSelectOverlay();
      }
    }, 3e3);
  }
  async function refreshAllThumbnails() {
    await new Promise((r) => setTimeout(r, 2e3));
    try {
      if (!window.MessageBridge) return;
      const scan = await MessageBridge.scanFlowImages();
      const images = scan?.images || [];
      if (images.length === 0) return;
      const flowThumbMap = {};
      const flowThumbByFileName = {};
      for (const img of images) {
        if (img.fileId && img.thumbnail) {
          flowThumbMap[img.fileId] = img.thumbnail;
        }
        if (img.file_name && img.thumbnail)
          flowThumbByFileName[img.file_name] = img.thumbnail;
      }
      const freshThumb = (id, names) =>
        flowThumbMap[id] || flowThumbByFileName[names?.[id]] || null;
      log("Thumbnail recovery: scanned", images.length, "tiles from Flow");
      let updatedCount = 0;
      try {
        const tasksRaw = await new Promise((resolve) => {
          chrome.storage.local.get(["af_tasks"], (r) =>
            resolve(r.af_tasks || []),
          );
        });
        let tasksChanged = false;
        for (const task of tasksRaw) {
          if (task.ref_thumbnails && task.ref_file_ids) {
            const refIds = task.ref_file_ids
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            for (const id of refIds) {
              const current = freshThumb(id, task.ref_file_names);
              if (current && task.ref_thumbnails[id] !== current) {
                task.ref_thumbnails[id] = current;
                tasksChanged = true;
                updatedCount++;
              }
            }
          }
          if (task.result_thumbnails && task.result_file_ids) {
            const resultIds = task.result_file_ids
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            for (const id of resultIds) {
              const current = freshThumb(id, task.result_file_names);
              if (current) {
                const existing = task.result_thumbnails[id];
                const existingThumb =
                  typeof existing === "object" ? existing?.thumbnail : existing;
                if (existingThumb !== current) {
                  if (
                    typeof existing === "object" &&
                    existing?.type === "video"
                  ) {
                    task.result_thumbnails[id] = {
                      ...existing,
                      thumbnail: current,
                    };
                  } else {
                    task.result_thumbnails[id] = current;
                  }
                  tasksChanged = true;
                  updatedCount++;
                }
              }
            }
          }
        }
        if (tasksChanged) {
          await new Promise((resolve) => {
            chrome.storage.local.set({ af_tasks: tasksRaw }, resolve);
          });
          const autoTab = document.getElementById("tab-tasks");
          if (autoTab?.__multiTaskTab?.taskList) {
            autoTab.__multiTaskTab.taskList.loadTasks();
          }
        }
      } catch (e) {
        console.warn("[ThumbnailRecovery] Tasks refresh failed:", e.message);
      }
      try {
        const anglesResults = await new Promise((resolve) => {
          chrome.storage.local.get(["af_angles_results"], (r) =>
            resolve(r.af_angles_results || []),
          );
        });
        let anglesChanged = false;
        for (const entry of anglesResults) {
          if (entry.file_id && flowThumbMap[entry.file_id]) {
            if (entry.thumbnail_url !== flowThumbMap[entry.file_id]) {
              entry.thumbnail_url = flowThumbMap[entry.file_id];
              anglesChanged = true;
              updatedCount++;
            }
          }
        }
        if (anglesChanged) {
          await new Promise((resolve) => {
            chrome.storage.local.set(
              { af_angles_results: anglesResults },
              resolve,
            );
          });
        }
      } catch (e) {
        console.warn("[ThumbnailRecovery] Angles refresh failed:", e.message);
      }
      try {
        const nodesRaw = await new Promise((resolve) => {
          chrome.storage.local.get(["af_nodes"], (r) =>
            resolve(r.af_nodes || []),
          );
        });
        let nodesChanged = false;
        for (const node of nodesRaw) {
          if (node.ref_thumbnails) {
            for (const [fileId, entry] of Object.entries(node.ref_thumbnails)) {
              const current = freshThumb(fileId, node.ref_file_names);
              const oldUrl =
                typeof entry === "object" ? entry.thumbnail : entry;
              if (current && oldUrl !== current) {
                node.ref_thumbnails[fileId] =
                  typeof entry === "object"
                    ? { ...entry, thumbnail: current }
                    : current;
                nodesChanged = true;
                updatedCount++;
              }
            }
          }
          if (node.result_thumbnails) {
            for (const [fileId, entry] of Object.entries(
              node.result_thumbnails,
            )) {
              const current = freshThumb(fileId, node.result_file_names);
              const oldUrl =
                typeof entry === "object" ? entry.thumbnail : entry;
              if (current && oldUrl !== current) {
                node.result_thumbnails[fileId] =
                  typeof entry === "object"
                    ? { ...entry, thumbnail: current }
                    : current;
                nodesChanged = true;
                updatedCount++;
              }
            }
          }
        }
        if (nodesChanged) {
          await new Promise((resolve) => {
            chrome.storage.local.set({ af_nodes: nodesRaw }, resolve);
          });
        }
      } catch (e) {
        console.warn("[ThumbnailRecovery] Nodes refresh failed:", e.message);
      }
      if (updatedCount > 0) {
        log("Thumbnail recovery: updated", updatedCount, "thumbnails");
      }
    } catch (e) {
      if (
        /Target tab is not a supported Flow page|Google Flow tab not found/.test(
          e?.message || "",
        )
      ) {
        console.info("[ThumbnailRecovery] Scan skipped:", e.message);
      } else {
        console.warn("[ThumbnailRecovery] Scan failed:", e.message);
      }
    }
  }
  function showModuleBlockedOverlay(pane, module) {
    hideModuleBlockedOverlay(pane);
    const moduleNames = {
      gen: "Generate",
      prompt_templates: "Prompt Templates",
      tasks: "Tasks",
      workflows: "Workflows",
      angles: "Angles",
    };
    const moduleName = moduleNames[module] || module;
    const isLoggedIn = window.authManager?.isLoggedIn();
    const showUpgrade =
      window.SystemConfig?.getBool("show_upgrade_ui") !== false;
    const contactUrl = window.SystemConfig?.get("upgrade_contact_url", "");
    let actionBtnLabel, actionBtnClass;
    if (!isLoggedIn) {
      actionBtnLabel = window.I18n?.t("auth.login") || "Login";
      actionBtnClass = "module-blocked-btn";
    } else if (showUpgrade) {
      actionBtnLabel = window.I18n?.t("common.upgrade") || "Upgrade";
      actionBtnClass = "module-blocked-btn module-blocked-btn-upgrade";
    } else if (contactUrl) {
      actionBtnLabel = window.I18n?.t("overlay.contact") || "Contact Support";
      actionBtnClass = "module-blocked-btn";
    } else {
      actionBtnLabel = "";
      actionBtnClass = "";
    }
    const overlay = document.createElement("div");
    overlay.className = "module-blocked-overlay";
    overlay.innerHTML = `
      <div class="module-blocked-content">
        <div class="module-blocked-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        <h3 class="module-blocked-title">${isLoggedIn ? window.I18n?.t("overlay.moduleBlocked") || "Feature Locked" : window.I18n?.t("overlay.requiresLogin") || "Login Required"}</h3>
        <p class="module-blocked-desc">${isLoggedIn ? `${window.I18n?.t("overlay.descriptionUpgrade", { module: moduleName }) || `Your current plan does not include the <strong>${moduleName}</strong> feature`}.<br>${showUpgrade ? window.I18n?.t("app.upgradeToUse") || "Upgrade to use." : window.I18n?.t("app.contactAdmin") || "Contact admin for support."}` : `${window.I18n?.t("overlay.description", { module: moduleName }) || `The <strong>${moduleName}</strong> feature requires sign-in`}.<br>${window.I18n?.t("app.loginToUse") || "Log in to use all features."}`}</p>
        ${actionBtnLabel ? `<button class="${actionBtnClass}">${actionBtnLabel}</button>` : ""}
      </div>
    `;
    const actionBtn = overlay.querySelector(".module-blocked-btn");
    if (actionBtn) {
      actionBtn.addEventListener("click", () => {
        if (!isLoggedIn) {
          const loginOverlay2 = document.getElementById("loginOverlay");
          if (loginOverlay2) {
            loginOverlay2.classList.remove("hidden");
          } else {
            chrome.runtime.sendMessage({ action: "openSettings" });
          }
        } else if (showUpgrade) {
          if (typeof window.openUpgradeModal === "function") {
            window.openUpgradeModal();
          }
        } else if (contactUrl) {
          window.open(contactUrl, "_blank");
        }
      });
    }
    pane.style.position = "relative";
    pane.appendChild(overlay);
  }
  function hideModuleBlockedOverlay(pane) {
    const existing = pane.querySelector(".module-blocked-overlay");
    if (existing) existing.remove();
  }
  function refreshModuleOverlays() {
    if (!window.featureGate) return;
    const tabModuleMap = { "tab-tasks": "tasks" };
    for (const [tabId, module] of Object.entries(tabModuleMap)) {
      const pane = document.getElementById(tabId);
      if (!pane) continue;
      pane.classList.remove("module-pending");
      const isEnabled = window.featureGate.isModuleEnabled(module);
      if (!isEnabled) {
        showModuleBlockedOverlay(pane, module);
      } else {
        hideModuleBlockedOverlay(pane);
      }
    }
    const genPane = document.getElementById("tab-gen");
    if (genPane) {
      genPane.classList.remove("module-pending");
      const fg = window.featureGate;
      const anyProviderEnabled =
        fg.canUse?.("gen_enabled") ||
        fg.canUse?.("chatgpt_enabled") ||
        fg.canUse?.("grok_enabled");
      if (!anyProviderEnabled) {
        showModuleBlockedOverlay(genPane, "gen");
      } else {
        hideModuleBlockedOverlay(genPane);
      }
    }
    const templatesPane = document.getElementById("tab-templates");
    if (templatesPane) {
      templatesPane.classList.remove("module-pending");
      hideModuleBlockedOverlay(templatesPane);
    }
    const workflowPane = document.getElementById("tab-workflow");
    if (workflowPane) {
      workflowPane.classList.remove("module-pending");
      hideModuleBlockedOverlay(workflowPane);
    }
    refreshSubtabOverlays();
  }
  window.refreshModuleOverlays = refreshModuleOverlays;
  async function checkModuleAccess(tabId) {
    if (!window.featureGate) {
      return { allowed: true, module: null };
    }
    if (tabId === "tab-templates" || tabId === "tab-workflow") {
      return { allowed: true, module: null };
    }
    if (tabId === "tab-gen") {
      const fg = window.featureGate;
      const anyProviderEnabled =
        fg.canUse?.("gen_enabled") ||
        fg.canUse?.("chatgpt_enabled") ||
        fg.canUse?.("grok_enabled");
      return {
        allowed: anyProviderEnabled,
        module: anyProviderEnabled ? null : "gen",
      };
    }
    const tabModuleMap = { "tab-tasks": "tasks" };
    const module = tabModuleMap[tabId];
    if (!module) {
      return { allowed: true, module: null };
    }
    const isEnabled = await window.featureGate.isModuleEnabledAsync(module);
    return { allowed: isEnabled, module };
  }
  function setupTabSwitching() {
    const tabButtons = document.querySelectorAll(".tobyflow-tab");
    const tabPanes = document.querySelectorAll(".tab-pane");
    tabButtons.forEach((btn) => {
      btn.addEventListener("click", async () => {
        const tabId = btn.dataset.tab;
        if (window.UsageSync) window.UsageSync.setActiveTab(tabId);
        tabButtons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        tabPanes.forEach((pane) => {
          pane.classList.remove("active");
          if (pane.id === tabId) {
            pane.classList.add("active");
          }
        });
        const activePane = document.getElementById(tabId);
        const tabModuleMap = { "tab-tasks": "tasks" };
        const module = tabModuleMap[tabId];
        if (tabId === "tab-templates") {
          if (activePane) activePane.classList.remove("module-pending");
          refreshSubtabOverlays();
        }
        if (tabId === "tab-workflow") {
          if (activePane) activePane.classList.remove("module-pending");
        }
        if (activePane) {
          activePane.classList.remove("module-pending");
        }
        let syncAllowed;
        if (tabId === "tab-gen") {
          const fg = window.featureGate;
          syncAllowed = !!(
            fg?.canUse?.("gen_enabled") ||
            fg?.canUse?.("chatgpt_enabled") ||
            fg?.canUse?.("grok_enabled")
          );
          if (!syncAllowed && activePane) {
            showModuleBlockedOverlay(activePane, "gen");
          }
        } else {
          syncAllowed =
            !module || window.featureGate?.isModuleEnabled?.(module) === true;
          if (!syncAllowed && activePane && module) {
            showModuleBlockedOverlay(activePane, module);
          }
        }
        if (tabId === "tab-gen" && window.featureGate) {
          window.featureGate
            .refresh?.()
            .then(() => {
              if (!activePane) return;
              const fg = window.featureGate;
              const freshAllowed = !!(
                fg?.canUse?.("gen_enabled") ||
                fg?.canUse?.("chatgpt_enabled") ||
                fg?.canUse?.("grok_enabled")
              );
              if (!freshAllowed && syncAllowed) {
                showModuleBlockedOverlay(activePane, "gen");
              } else if (freshAllowed && !syncAllowed) {
                hideModuleBlockedOverlay(activePane);
                initializeTab(tabId).catch((err) =>
                  console.warn("[TobyFlow] initializeTab error:", err),
                );
              }
            })
            .catch((err) =>
              console.warn("[TobyFlow] featureGate.refresh error:", err),
            );
        } else if (module && window.featureGate) {
          window.featureGate
            .isModuleEnabledAsync(module)
            .then((freshAllowed) => {
              if (!activePane) return;
              if (!freshAllowed && syncAllowed) {
                showModuleBlockedOverlay(activePane, module);
              } else if (freshAllowed && !syncAllowed) {
                hideModuleBlockedOverlay(activePane);
                initializeTab(tabId).catch((err) =>
                  console.warn("[TobyFlow] initializeTab error:", err),
                );
              }
            })
            .catch((err) =>
              console.warn("[TobyFlow] isModuleEnabledAsync error:", err),
            );
        }
        if (!syncAllowed && (tabId === "tab-gen" || module)) {
          return;
        }
        if (activePane) {
          hideModuleBlockedOverlay(activePane);
        }
        let tabSpinner = null;
        if (activePane) {
          tabSpinner = document.createElement("div");
          tabSpinner.className = "tobyflow-tab-loading";
          tabSpinner.innerHTML = '<div class="tobyflow-loading-spinner"></div>';
          activePane.appendChild(tabSpinner);
        }
        await initializeTab(tabId);
        if (tabSpinner) tabSpinner.remove();
      });
    });
  }
  async function initializeTab(tabId) {
    log("Initializing tab:", tabId);
    switch (tabId) {
      case "tab-templates":
        if (window.TemplatesTab) {
          const subtabContainer = document.getElementById("subtab-templates");
          if (subtabContainer && !subtabContainer.__templatesTab) {
            subtabContainer.__templatesTab = new TemplatesTab(subtabContainer);
            await subtabContainer.__templatesTab.init();
          } else if (subtabContainer?.__templatesTab) {
            subtabContainer.__templatesTab.reload();
          }
        }
        if (window.MyPromptsTab && !window.MyPromptsTab._initialized) {
          MyPromptsTab.init();
          window.MyPromptsTab._initialized = true;
        }
        break;
      case "tab-tasks":
        if (window.MultiTaskTab) {
          const container = document.getElementById("tab-tasks");
          if (container && !container.__multiTaskTab) {
            container.__multiTaskTab = new MultiTaskTab(container);
            await container.__multiTaskTab.init();
          } else if (container?.__multiTaskTab?.taskList) {
            container.__multiTaskTab.taskList.loadTasks();
          }
          if (window.storageManager?.mode === "api") {
            window.storageManager.checkAndPromptMigration("tasks");
          }
        }
        break;
      case "tab-workflow":
        if (window.WorkflowTab) {
          const container = document.getElementById("tab-workflow");
          if (container && !container.__tobyflowTab) {
            container.__tobyflowTab = new WorkflowTab(container);
            await container.__tobyflowTab.init();
          } else if (container?.__tobyflowTab?.workflowList) {
            container.__tobyflowTab.workflowList.loadWorkflows();
            container.__tobyflowTab.workflowList.loadSharedWorkflows();
          }
          if (window.storageManager?.mode === "api") {
            window.storageManager.checkAndPromptMigration("workflows");
          }
        }
        break;
      case "tab-history":
        if (window.HistoryTab) {
          const container = document.getElementById("tab-history");
          if (container && !container.__historyTab) {
            container.__historyTab = new HistoryTab(container);
            await container.__historyTab.init();
          } else if (container?.__historyTab) {
            container.__historyTab.reload();
          }
        }
        break;
      case "tab-photos":
        if (window.PhotosTab) {
          await window.PhotosTab.init();
        }
        break;
      default:
        break;
    }
  }
  function loadCSS(href) {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }
  function loadJS(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  function _setupLogsSubtabs() {
    const subtabs = document.querySelectorAll(".tobyflow-logs-subtab");
    const mainContent = document.getElementById("logsMainContent");
    const queueContent = document.getElementById("logsQueueContent");
    if (!subtabs.length || !mainContent || !queueContent) return;
    subtabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.subtab;
        subtabs.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        if (target === "logs-main") {
          mainContent.classList.remove("tobyflow-logs-subtab-content--hidden");
          queueContent.classList.add("tobyflow-logs-subtab-content--hidden");
          if (window.QueueMonitor) {
            QueueMonitor.getInstance()?.setVisible(false);
          }
        } else if (target === "logs-queue") {
          mainContent.classList.add("tobyflow-logs-subtab-content--hidden");
          queueContent.classList.remove("tobyflow-logs-subtab-content--hidden");
          if (window.QueueMonitor) {
            QueueMonitor.getInstance()?.setVisible(true);
          }
        }
      });
    });
  }
  function _setupPromptsSubtabs() {
    const subtabs = document.querySelectorAll(".prompts-subtab");
    const panes = {
      "subtab-templates": document.getElementById("subtab-templates"),
      "subtab-myprompts": document.getElementById("subtab-myprompts"),
    };
    if (!subtabs.length) return;
    subtabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.subtab;
        subtabs.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        Object.entries(panes).forEach(([id, pane]) => {
          if (!pane) return;
          if (id === target) {
            pane.classList.add("active");
          } else {
            pane.classList.remove("active");
          }
        });
        _checkSubtabPermission(target, panes[target]);
      });
    });
    const activeSubtab = document.querySelector(".prompts-subtab.active");
    if (activeSubtab) {
      const target = activeSubtab.dataset.subtab;
      _checkSubtabPermission(target, panes[target]);
    }
  }
  function _checkSubtabPermission(subtabId, pane) {
    if (!pane || !window.featureGate) return;
    const subtabFeatureMap = {
      "subtab-templates": {
        key: "prompt_templates_enabled",
        type: "boolean",
        name: "Prompt Templates",
      },
      "subtab-myprompts": {
        key: "snippets_max",
        type: "quota",
        name: "My Prompts",
      },
    };
    const featureConfig = subtabFeatureMap[subtabId];
    if (!featureConfig) return;
    const isLoggedIn = window.authManager?.isLoggedIn();
    let isAllowed = false;
    if (featureConfig.type === "boolean") {
      isAllowed = window.featureGate.canUse(featureConfig.key);
    } else if (featureConfig.type === "quota") {
      const quotaInfo = window.featureGate.checkQuota(featureConfig.key);
      isAllowed = quotaInfo.limit === "unlimited" || quotaInfo.limit > 0;
    }
    if (!isAllowed) {
      _showSubtabBlockedOverlay(pane, featureConfig.name, isLoggedIn);
    } else {
      _hideSubtabBlockedOverlay(pane);
    }
  }
  function _showSubtabBlockedOverlay(pane, featureName, isLoggedIn) {
    _hideSubtabBlockedOverlay(pane);
    const showUpgrade =
      window.SystemConfig?.getBool("show_upgrade_ui") !== false;
    const contactUrl = window.SystemConfig?.get("upgrade_contact_url", "");
    let actionBtnLabel, actionBtnClass;
    if (!isLoggedIn) {
      actionBtnLabel = window.I18n?.t("auth.login") || "Login";
      actionBtnClass = "subtab-blocked-btn";
    } else if (showUpgrade) {
      actionBtnLabel = window.I18n?.t("common.upgrade") || "Upgrade";
      actionBtnClass = "subtab-blocked-btn subtab-blocked-btn-upgrade";
    } else if (contactUrl) {
      actionBtnLabel = window.I18n?.t("overlay.contact") || "Contact Support";
      actionBtnClass = "subtab-blocked-btn";
    } else {
      actionBtnLabel = "";
      actionBtnClass = "";
    }
    const overlay = document.createElement("div");
    overlay.className = "subtab-blocked-overlay";
    overlay.innerHTML = `
      <div class="subtab-blocked-content">
        <div class="subtab-blocked-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        <h3 class="subtab-blocked-title">${isLoggedIn ? window.I18n?.t("overlay.moduleBlocked") || "Feature Locked" : window.I18n?.t("overlay.requiresLogin") || "Login Required"}</h3>
        <p class="subtab-blocked-desc">${isLoggedIn ? `${window.I18n?.t("overlay.descriptionUpgrade", { module: featureName }) || `Your current plan does not include the <strong>${featureName}</strong> feature`}.<br>${showUpgrade ? window.I18n?.t("app.upgradeToUse") || "Upgrade to use." : window.I18n?.t("app.contactAdmin") || "Contact admin for support."}` : `${window.I18n?.t("overlay.description", { module: featureName }) || `The <strong>${featureName}</strong> feature requires sign-in`}.<br>${window.I18n?.t("app.loginToUse") || "Log in to use all features."}`}</p>
        ${actionBtnLabel ? `<button class="${actionBtnClass}">${actionBtnLabel}</button>` : ""}
      </div>
    `;
    const actionBtn = overlay.querySelector(".subtab-blocked-btn");
    if (actionBtn) {
      actionBtn.addEventListener("click", () => {
        if (!isLoggedIn) {
          const loginOverlay2 = document.getElementById("loginOverlay");
          if (loginOverlay2) {
            loginOverlay2.classList.remove("hidden");
          } else {
            chrome.runtime.sendMessage({ action: "openSettings" });
          }
        } else if (showUpgrade) {
          if (typeof window.openUpgradeModal === "function") {
            window.openUpgradeModal();
          }
        } else if (contactUrl) {
          window.open(contactUrl, "_blank");
        }
      });
    }
    pane.style.position = "relative";
    pane.appendChild(overlay);
  }
  function _hideSubtabBlockedOverlay(pane) {
    const existing = pane.querySelector(".subtab-blocked-overlay");
    if (existing) existing.remove();
  }
  function refreshSubtabOverlays() {
    const promptsActiveSubtab = document.querySelector(
      ".prompts-subtab.active",
    );
    if (promptsActiveSubtab) {
      const target = promptsActiveSubtab.dataset.subtab;
      const pane = document.getElementById(target);
      if (pane) _checkSubtabPermission(target, pane);
    }
    const workflowTab = document.getElementById("tab-workflow");
    if (workflowTab?.__tobyflowTab?._applySubtabFeatureGate) {
      const currentSubtab =
        workflowTab.__tobyflowTab._currentSubtab || "templates";
      workflowTab.__tobyflowTab._applySubtabFeatureGate(currentSubtab);
    }
  }
  window.refreshSubtabOverlays = refreshSubtabOverlays;
  function setupTaskExecutor() {
    if (!window.eventBus) return;
    const verifyRunAllProject = async (data, items, token = null) => {
      if (!data.beforeDispatch) return true;
      const cancelReservation = async () => {
        if (!token) return;
        try {
          if (window.ExecutionGate) await ExecutionGate.cancel(token);
        } catch (error) {
          console.warn(
            "[Task] Run All reservation cancellation failed:",
            error?.message,
          );
        } finally {
          if (window._currentTaskExecutionToken === token)
            window._currentTaskExecutionToken = null;
        }
      };
      try {
        await data.beforeDispatch(items);
        if (
          data.shouldStop?.() === true ||
          data.abortSignal?.aborted === true
        ) {
          await cancelReservation();
          return false;
        }
        return true;
      } catch (error) {
        await cancelReservation();
        console.warn(
          "[Task] Run All project check blocked dispatch:",
          error?.message,
        );
        window.showNotification?.(
          error?.message || "RUN_ALL_PROJECT_UNAVAILABLE",
          "error",
        );
        return false;
      }
    };
    const runTaskAndWait = async (data) => {
      let ownsLock = false;
      const cancelled = () =>
        data.shouldStop?.() === true || data.abortSignal?.aborted === true;
      try {
        if (cancelled()) return false;
        const { task } = data;
        if (!(await verifyRunAllProject(data, [task])) || cancelled())
          return false;
        if (window.ExecutionLock && ExecutionLock.isBlockedBy("task")) {
          const shouldStop = await ExecutionLock.showBlockedDialog("task");
          if (!shouldStop) return;
          if (cancelled()) return false;
          await ExecutionLock.stopCurrent();
          if (cancelled()) return false;
        }
        if (window.ExecutionLock) {
          ExecutionLock.acquire(
            "task",
            `Task: ${task.task_name || task.task_id}`,
          );
          ownsLock = true;
        }
        const _taskProvider = task?.provider || "flow";
        const _savedRefCount = String(task.ref_file_ids || "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean).length;
        const _taskHasActiveRefs =
          task?.ref_image_mode !== "none" && _savedRefCount > 0;
        if (
          _taskHasActiveRefs &&
          (_taskProvider === "chatgpt" ||
            _taskProvider === "gemini" ||
            _taskProvider === "muse") &&
          !window.featureGate?.canUseProviderRefImages?.(_taskProvider)
        ) {
          window.openUpgradeModal?.();
          return;
        }
        try {
          if (
            _taskProvider === "chatgpt" &&
            window.ChatGPTSession?.ensureReady
          ) {
            window.ChatGPTSession.ensureReady({
              createIfMissing: true,
              activate: true,
            })
              .then(() => window.ChatGPTSession.ensureTabActive?.())
              .catch((err) =>
                console.warn(
                  "[Task] ChatGPT activate failed:",
                  err?.message || err,
                ),
              );
          } else if (
            _taskProvider === "grok" &&
            window.GrokSession?.ensureReady
          ) {
            window.GrokSession.ensureReady({
              createIfMissing: true,
              activate: true,
            })
              .then(() => window.GrokSession.ensureTabActive?.())
              .catch((err) =>
                console.warn(
                  "[Task] Grok activate failed:",
                  err?.message || err,
                ),
              );
          } else if (
            _taskProvider === "gemini" &&
            window.GeminiSession?.ensureReady
          ) {
            window.GeminiSession.ensureReady({
              createIfMissing: true,
              activate: true,
            })
              .then(() => window.GeminiSession.ensureTabActive?.())
              .catch((err) =>
                console.warn(
                  "[Task] Gemini activate failed:",
                  err?.message || err,
                ),
              );
          } else if (
            _taskProvider === "muse" &&
            window.MuseSession?.ensureReady
          ) {
            window.MuseSession.ensureReady({
              createIfMissing: true,
              activate: true,
            })
              .then(() => window.MuseSession.ensureTabActive?.())
              .catch((err) =>
                console.warn(
                  "[Task] Muse activate failed:",
                  err?.message || err,
                ),
              );
          } else {
            chrome.runtime
              .sendMessage({ action: "activateFlowTabForExecution" })
              .catch(() => {});
          }
        } catch (e) {
          console.warn("[executeSingleTask] Error activating provider tab:", e);
        }
        let _taskExecutionToken = null;
        const taskPrompts =
          task.multi_prompt && task.prompts?.length > 1
            ? task.prompts
            : [task.prompt];
        const taskPromptCount = taskPrompts.length;
        if (window.ExecutionGate) {
          try {
            const _taskRawRefCount = String(task.ref_file_ids || "")
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean).length;
            const _taskRefCount =
              task.ref_image_mode === "none" ? 0 : _taskRawRefCount;
            const gate = await ExecutionGate.request(
              "task_run",
              taskPromptCount,
              {
                owner: "task",
                label: task.task_name || task.task_id,
                provider: task.provider || "flow",
                has_ref: _taskRefCount > 0,
                ref_count: _taskRefCount,
              },
            );
            if (!gate.allowed) {
              ExecutionGate.showDeniedDialog(gate, "Task");
              return;
            }
            if (cancelled()) {
              if (gate.token) ExecutionGate.cancel(gate.token);
              return false;
            }
            _taskExecutionToken = gate.token;
            window._currentTaskExecutionToken = _taskExecutionToken;
          } catch (e) {
            if (window.QuotaErrorHandler?.handleIfQuotaError(e, "Task")) {
              console.warn("[Task] ExecutionGate denied:", e.code || e.reason);
              return;
            }
            console.error(
              "[Task] ExecutionGate request failed, blocking:",
              e.message,
            );
            return;
          }
        }
        if (
          !(await verifyRunAllProject(data, [task], _taskExecutionToken)) ||
          cancelled()
        )
          return false;
        log("Executing task:", task.task_id, task.task_name);
        if (window.eventBus) {
          window.eventBus.emit("execution:tracker_update", {
            owner: "task",
            label: `Task: ${task.task_name || task.task_id}`,
            phase: "started",
            current: 0,
            total: 1,
          });
        }
        let completed = false;
        const isPipeline =
          (task.provider || "flow") === "flow" &&
          window.PromptQueue &&
          PromptQueue.isEnabled();
        try {
          const taskResult = await executeSingleTask(task, {
            _executionToken: isPipeline ? _taskExecutionToken : null,
            abortSignal: data.abortSignal,
          });
          const actualSuccess =
            taskResult?.success ?? taskResult?.completed ?? taskPromptCount;
          const actualFailed = taskResult?.failed ?? 0;
          const wasStopped = taskResult?.stopped ?? false;
          completed = actualSuccess > 0 && actualFailed === 0 && !wasStopped;
          if (!isPipeline && window.ExecutionGate && _taskExecutionToken) {
            let status;
            if (wasStopped) {
              status = actualSuccess > 0 ? "partial" : "failed";
            } else if (actualSuccess === 0) {
              status = "failed";
            } else if (actualFailed > 0) {
              status = "partial";
            } else {
              status = "success";
            }
            const extraData =
              status === "partial" ? { successful_count: actualSuccess } : {};
            ExecutionGate.complete(_taskExecutionToken, status, extraData);
          }
          if (window.featureGate && actualSuccess > 0) {
            window.featureGate.recordTaskRun();
            window.featureGate.recordGenRun();
            window.featureGate.recordPromptSubmit(actualSuccess, "task");
          }
          window._currentTaskExecutionToken = null;
        } catch (err) {
          if (!isPipeline && window.ExecutionGate && _taskExecutionToken) {
            ExecutionGate.complete(_taskExecutionToken, "failed", {
              error: err.message || String(err),
            });
          }
          window._currentTaskExecutionToken = null;
        }
        if (window.eventBus) {
          window.eventBus.emit("execution:tracker_update", {
            owner: "task",
            phase: "completed",
            current: 1,
            total: 1,
          });
        }
        return completed;
      } catch (error) {
        console.error("[Task] Execution request failed:", error);
        return false;
      } finally {
        if (ownsLock) window.ExecutionLock?.release("task");
      }
    };
    window.runTaskAndWait = runTaskAndWait;
    window.eventBus.on("task:run", runTaskAndWait);
    const runTaskBatchAndWait = async (data) => {
      let ownsLock = false;
      let _batchExecutionToken = null;
      const cancelled = () =>
        data.shouldStop?.() === true || data.abortSignal?.aborted === true;
      try {
        if (cancelled()) return false;
        const { tasks, mode } = data;
        if (!(await verifyRunAllProject(data, tasks)) || cancelled())
          return false;
        const isParallel = mode === "parallel";
        if (window.ExecutionLock && ExecutionLock.isBlockedBy("task")) {
          const shouldStop = await ExecutionLock.showBlockedDialog("task");
          if (!shouldStop) return;
          if (cancelled()) return false;
          await ExecutionLock.stopCurrent();
          if (cancelled()) return false;
        }
        if (window.ExecutionLock) {
          ExecutionLock.acquire("task", `Task batch (${tasks.length})`);
          ownsLock = true;
        }
        const _firstTask = tasks[0] || {};
        const _firstProvider = _firstTask.provider || "flow";
        try {
          if (
            _firstProvider === "chatgpt" &&
            window.ChatGPTSession?.ensureReady
          ) {
            window.ChatGPTSession.ensureReady({
              createIfMissing: true,
              activate: true,
            })
              .then(() => window.ChatGPTSession.ensureTabActive?.())
              .catch((err) =>
                console.warn(
                  "[runAllTasks] ChatGPT activate failed:",
                  err?.message || err,
                ),
              );
          } else if (
            _firstProvider === "grok" &&
            window.GrokSession?.ensureReady
          ) {
            window.GrokSession.ensureReady({
              createIfMissing: true,
              activate: true,
            })
              .then(() => window.GrokSession.ensureTabActive?.())
              .catch((err) =>
                console.warn(
                  "[runAllTasks] Grok activate failed:",
                  err?.message || err,
                ),
              );
          } else if (
            _firstProvider === "gemini" &&
            window.GeminiSession?.ensureReady
          ) {
            window.GeminiSession.ensureReady({
              createIfMissing: true,
              activate: true,
            })
              .then(() => window.GeminiSession.ensureTabActive?.())
              .catch((err) =>
                console.warn(
                  "[runAllTasks] Gemini activate failed:",
                  err?.message || err,
                ),
              );
          } else if (
            _firstProvider === "muse" &&
            window.MuseSession?.ensureReady
          ) {
            window.MuseSession.ensureReady({
              createIfMissing: true,
              activate: true,
            })
              .then(() => window.MuseSession.ensureTabActive?.())
              .catch((err) =>
                console.warn(
                  "[runAllTasks] Muse activate failed:",
                  err?.message || err,
                ),
              );
          } else {
            chrome.runtime
              .sendMessage({ action: "activateFlowTabForExecution" })
              .catch(() => {});
          }
        } catch (e) {
          console.warn("[runAllTasks] Error activating provider tab:", e);
        }
        if (window.ExecutionGate) {
          try {
            const totalPrompts = tasks.reduce((sum, t) => {
              return (
                sum +
                (t.multi_prompt && t.prompts?.length > 1 ? t.prompts.length : 1)
              );
            }, 0);
            const _uniqueProviders = new Set(
              tasks.map((t) => t.provider || "flow"),
            );
            const _batchProvider =
              _uniqueProviders.size === 1 ? [..._uniqueProviders][0] : null;
            const _batchRefCount = tasks.reduce((sum, task) => {
              if (task?.ref_image_mode === "none") return sum;
              return (
                sum +
                String(task?.ref_file_ids || "")
                  .split(",")
                  .map((v) => v.trim())
                  .filter(Boolean).length
              );
            }, 0);
            const gate = await ExecutionGate.request("task_run", totalPrompts, {
              owner: "task",
              label: "Task batch",
              provider: _batchProvider,
              has_ref: _batchRefCount > 0,
              ref_count: _batchRefCount,
            });
            if (!gate.allowed) {
              ExecutionGate.showDeniedDialog(gate, "Task");
              return;
            }
            if (cancelled()) {
              if (gate.token) ExecutionGate.cancel(gate.token);
              return false;
            }
            _batchExecutionToken = gate.token;
            window._currentTaskExecutionToken = _batchExecutionToken;
          } catch (e) {
            if (window.QuotaErrorHandler?.handleIfQuotaError(e, "Task")) {
              console.warn(
                "[Task] ExecutionGate batch denied:",
                e.code || e.reason,
              );
              return;
            }
            console.error(
              "[Task] ExecutionGate batch request failed, blocking:",
              e.message,
            );
            return;
          }
        }
        if (
          !(await verifyRunAllProject(data, tasks, _batchExecutionToken)) ||
          cancelled()
        )
          return false;
        log(
          "Executing batch:",
          tasks.length,
          "tasks, mode:",
          mode || "sequential",
        );
        const _hasNonFlowProvider = tasks.some(
          (t) => t.provider && t.provider !== "flow",
        );
        if (
          window.PromptQueue &&
          PromptQueue.isEnabled() &&
          !_hasNonFlowProvider
        ) {
          const _rekeyByPosition = (t, oldIdsStr, newIdsStr) => {
            const oldIds = String(oldIdsStr || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            const newIds = String(newIdsStr || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            if (!oldIds.length || oldIds.join() === newIds.join()) return;
            if (oldIds.length !== newIds.length) {
              console.warn(
                "[runAllTasks] Ref id \u0111\u1ED5i s\u1ED1 l\u01B0\u1EE3ng",
                oldIds.length,
                "\u2192",
                newIds.length,
                "\u2014 b\u1ECF qua d\u1EDDi key ref_thumbnails/ref_file_names (tr\xE1nh g\xE1n nh\u1EA7m ref)",
              );
              return;
            }
            for (const field of ["ref_thumbnails", "ref_file_names"]) {
              const map = t[field];
              if (!map || typeof map !== "object") continue;
              const next = {};
              for (let i = 0; i < oldIds.length; i++) {
                const oldId = oldIds[i],
                  newId = newIds[i] || oldIds[i];
                if (map[oldId] !== void 0) next[newId] = map[oldId];
              }
              for (const [k, v] of Object.entries(map)) {
                if (next[k] === void 0 && !oldIds.includes(k)) next[k] = v;
              }
              t[field] = next;
            }
          };
          const refPrepErrors = [];
          for (const t of tasks) {
            try {
              if (
                typeof window.uploadPendingFiles === "function" &&
                String(t.ref_file_ids || "").includes("upload_")
              ) {
                const _before = t.ref_file_ids;
                t.ref_file_ids = await window.uploadPendingFiles(
                  t.ref_file_ids,
                );
                _rekeyByPosition(t, _before, t.ref_file_ids);
                window.MediaRegistry?.applyRefIdentityCorrection?.(
                  t,
                  t.ref_file_ids,
                  t.ref_file_ids,
                  void 0,
                  { surface: "task:batch-upload" },
                );
                if (String(t.ref_file_ids || "").includes("upload_")) {
                  throw new Error("REF_UPLOAD_FAILED");
                }
              }
              const _tm = t.ref_thumbnails || {};
              const _fm = t.ref_file_names || {};
              if (
                typeof window.correctFileIds === "function" &&
                t.ref_file_ids &&
                !String(t.ref_file_ids).includes("upload_") &&
                window.FlowApiAdapter?.isApiModeIntended?.() !== true &&
                (Object.keys(_tm).length > 0 || Object.keys(_fm).length > 0)
              ) {
                const { correctedIds, changed, mediaMetadata } =
                  await window.correctFileIds(t.ref_file_ids, _tm, _fm);
                window.MediaRegistry?.applyRefIdentityCorrection?.(
                  t,
                  t.ref_file_ids,
                  t.ref_file_ids,
                  mediaMetadata,
                  { surface: "task:batch" },
                );
                if (changed) {
                  console.log(
                    "[runAllTasks] Ref IDs corrected:",
                    t.task_id,
                    t.ref_file_ids,
                    "->",
                    correctedIds,
                  );
                  _rekeyByPosition(t, t.ref_file_ids, correctedIds);
                  t.ref_file_ids = correctedIds;
                }
              }
            } catch (e) {
              console.warn(
                "[runAllTasks] Ref prep failed cho task",
                t.task_id,
                e && e.message,
              );
              refPrepErrors.push({
                taskId: t.task_id,
                error: e?.message || String(e),
              });
            }
          }
          if (refPrepErrors.length > 0) {
            console.error(
              "[runAllTasks] Aborting batch because required refs were not prepared:",
              refPrepErrors,
            );
            if (window.ExecutionGate && _batchExecutionToken) {
              ExecutionGate.complete(_batchExecutionToken, "failed", {
                error: "REF_UPLOAD_FAILED",
              });
            }
            window._currentTaskExecutionToken = null;
            return;
          }
          const afS = window._afSettings || {};
          const resolvedModels = new Map();
          try {
            for (const task of tasks) {
              const video =
                (task.media_type || afS.defaultGenType || "Image") === "Video";
              const model =
                task.model ||
                (video ? afS.defaultVideoModel : afS.defaultImageModel) ||
                (await window.ModelRegistry.getDefaultAsync(
                  "flow",
                  video ? "video" : "image",
                ));
              if (!model)
                throw new window.ConfigRequiredError(
                  "models_flow",
                  "data_missing",
                );
              resolvedModels.set(task, model);
            }
          } catch (error) {
            if (window.ConfigRequiredError?.is?.(error))
              window.ConfigErrorHandler?.handle(error, "runAllTasks.models");
            console.warn("[runAllTasks] Model config unavailable:", error);
            if (window.ExecutionGate && _batchExecutionToken) {
              ExecutionGate.complete(_batchExecutionToken, "failed", {
                error: "CONFIG_REQUIRED",
              });
            }
            window._currentTaskExecutionToken = null;
            return;
          }
          if (window._taskBatchStopped || cancelled()) {
            if (window.ExecutionGate && _batchExecutionToken)
              ExecutionGate.cancel(_batchExecutionToken);
            window._currentTaskExecutionToken = null;
            return;
          }
          const settingsPerTask = tasks.map((t) => {
            const gt = t.media_type || afS.defaultGenType || "Image";
            const isVid = gt === "Video";
            const _model = resolvedModels.get(t);
            let _dur = isVid ? t.video_duration || null : null;
            const _rtAll = t.ref_thumbnails || {};
            const _refVideoIds = String(t.ref_file_ids || "")
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean)
              .filter((id) => {
                const e = _rtAll[id];
                return !!(
                  e &&
                  typeof e === "object" &&
                  (e.type === "video" || e.video_url)
                );
              });
            const _hasRefVideo = _refVideoIds.length > 0;
            if (isVid && _dur) {
              const _refIds = String(t.ref_file_ids || "")
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean);
              if (_refIds.length > 0) {
                const _forced = window.ProviderRegistry?.get?.(
                  "flow",
                )?.getDurationOverride?.({
                  modelValue: _model,
                  hasRef: true,
                  hasRefVideo: _hasRefVideo,
                  inputType: t.video_input_type || "Ingredients",
                });
                if (_forced) _dur = _forced;
              }
            }
            return {
              genType: gt,
              ratio: t.ratio || afS.defaultRatio || "9:16",
              model: _model,
              isFrames: isVid && t.video_input_type === "Frames",
              quantity: t.quantity || 1,
              flowVideoDuration: _dur,
              flowVideoResolution: isVid
                ? window.ModelRegistry?.getGenerationResolutionValue?.(
                    "flow",
                    _model,
                    t.video_resolution,
                  )
                : null,
              refVideoIds: _refVideoIds,
              voice:
                isVid &&
                t.video_input_type !== "Frames" &&
                t.voice_slug &&
                t.voice_search_value
                  ? { slug: t.voice_slug, search_value: t.voice_search_value }
                  : null,
              character:
                t.video_input_type !== "Frames" &&
                window.CharacterRegistry.payload(t)
                  ? window.CharacterRegistry.payload(t)
                  : null,
            };
          });
          const effectiveMode = isParallel ? "parallel" : "sequential";
          if (
            !(await verifyRunAllProject(data, tasks, _batchExecutionToken)) ||
            cancelled()
          )
            return false;
          const result = await PromptQueue.getInstance().submitTaskBatch(
            tasks,
            effectiveMode,
            settingsPerTask,
            {
              _executionToken: _batchExecutionToken,
              abortSignal: data.abortSignal,
            },
          );
          log(
            `Pipeline batch ho\xE0n t\u1EA5t: ${result.completed} th\xE0nh c\xF4ng, ${result.failed} th\u1EA5t b\u1EA1i`,
          );
          window._currentTaskExecutionToken = null;
          if (window.featureGate && result.completed > 0) {
            for (let i = 0; i < result.completed; i++) {
              window.featureGate.recordTaskRun();
            }
            window.featureGate.recordGenRun();
            const totalPlannedPrompts = tasks.reduce((sum, t) => {
              return (
                sum +
                (t.multi_prompt && t.prompts?.length > 1 ? t.prompts.length : 1)
              );
            }, 0);
            const completedPrompts = Math.round(
              totalPlannedPrompts * (result.completed / tasks.length),
            );
            window.featureGate.recordPromptSubmit(
              completedPrompts || 1,
              "task_pipeline",
            );
          }
          if (window.eventBus) {
            window.eventBus.emit("execution:tracker_update", {
              owner: "task",
              phase: "completed",
              current: tasks.length,
              total: tasks.length,
            });
          }
          return;
        }
        if (window.eventBus) {
          window.eventBus.emit("execution:tracker_update", {
            owner: "task",
            label: "Run All Tasks",
            phase: "started",
            current: 0,
            total: tasks.length,
            taskBatch: {
              current: 1,
              total: tasks.length,
              taskName: tasks[0]?.task_name || "",
            },
          });
        }
        const outcomes = [];
        const collectOutcome = (task, result) => {
          const planned =
            task.multi_prompt && task.prompts?.length > 1
              ? task.prompts.length
              : 1;
          const success = Math.max(
            0,
            Number(result?.success ?? result?.completed ?? planned) || 0,
          );
          const failed = Math.max(0, Number(result?.failed) || 0);
          outcomes.push({ success, failed, stopped: result?.stopped === true });
        };
        if (isParallel) {
          const delayMs =
            window.workflowExecutor?.settings?.delayBetweenNodes || 3e3;
          const taskPromises = [];
          for (let i = 0; i < tasks.length; i++) {
            if (window._taskBatchStopped) break;
            const task = tasks[i];
            if (window.eventBus) {
              window.eventBus.emit("execution:tracker_update", {
                owner: "task",
                label: "Run All Tasks",
                phase: "prompt_submitting",
                current: i + 1,
                total: tasks.length,
                taskBatch: {
                  current: i + 1,
                  total: tasks.length,
                  taskName: task.task_name || "",
                },
              });
            }
            let markSubmitted;
            const submittedPromise = new Promise((r) => {
              markSubmitted = r;
            });
            if (!(await verifyRunAllProject(data, [task])) || cancelled()) {
              window._taskBatchStopped = true;
              break;
            }
            const p = executeSingleTask(task, {
              isParallel: true,
              onSubmitted: markSubmitted,
            })
              .then(
                (result) => collectOutcome(task, result),
                () => collectOutcome(task, { success: 0, failed: 1 }),
              )
              .finally(markSubmitted);
            taskPromises.push(p);
            await submittedPromise;
            if (i < tasks.length - 1 && !window._taskBatchStopped) {
              await new Promise((r) => setTimeout(r, delayMs));
            }
          }
          if (window.eventBus) {
            window.eventBus.emit("tasks:all_submitted");
          }
          await Promise.allSettled(taskPromises);
        } else {
          for (let i = 0; i < tasks.length; i++) {
            if (window._taskBatchStopped) break;
            const task = tasks[i];
            if (window.eventBus) {
              window.eventBus.emit("execution:tracker_update", {
                owner: "task",
                label: "Run All Tasks",
                phase: "prompt_submitting",
                current: i + 1,
                total: tasks.length,
                taskBatch: {
                  current: i + 1,
                  total: tasks.length,
                  taskName: task.task_name || "",
                },
              });
            }
            try {
              if (!(await verifyRunAllProject(data, [task])) || cancelled()) {
                window._taskBatchStopped = true;
                break;
              }
              collectOutcome(task, await executeSingleTask(task));
            } catch (error) {
              console.error(
                "[Task] Sequential batch task failed:",
                task.task_id,
                error,
              );
              collectOutcome(task, { success: 0, failed: 1 });
              break;
            }
          }
        }
        const batchWasStopped = window._taskBatchStopped;
        if (window.eventBus) {
          window.eventBus.emit("execution:tracker_update", {
            owner: "task",
            phase: "completed",
            current: tasks.length,
            total: tasks.length,
          });
        }
        const successfulPrompts = outcomes.reduce(
          (sum, result) => sum + result.success,
          0,
        );
        const successfulTasks = outcomes.filter(
          (result) => result.success > 0,
        ).length;
        const partial =
          batchWasStopped ||
          outcomes.length < tasks.length ||
          outcomes.some((result) => result.failed > 0 || result.stopped);
        if (window.ExecutionGate && _batchExecutionToken) {
          const batchStatus =
            successfulPrompts === 0
              ? "failed"
              : partial
                ? "partial"
                : "success";
          const batchExtra =
            batchStatus === "partial"
              ? { successful_count: successfulPrompts }
              : {};
          ExecutionGate.complete(_batchExecutionToken, batchStatus, batchExtra);
          window._currentTaskExecutionToken = null;
        }
        if (window.featureGate && successfulPrompts > 0) {
          for (let i = 0; i < successfulTasks; i++)
            window.featureGate.recordTaskRun();
          window.featureGate.recordGenRun();
          window.featureGate.recordPromptSubmit(
            successfulPrompts,
            "task_batch",
          );
        }
        if (typeof notifyCompletion === "function") {
          notifyCompletion(
            "Toby Flow",
            window.I18n?.t("app.batchComplete", { count: outcomes.length }) ||
              `Finished batch of ${outcomes.length} tasks!`,
          );
        }
        return true;
      } catch (error) {
        console.error("[Task] Batch execution failed:", error);
        if (
          _batchExecutionToken &&
          window._currentTaskExecutionToken === _batchExecutionToken
        ) {
          window.ExecutionGate?.cancel(_batchExecutionToken);
          window._currentTaskExecutionToken = null;
        }
        return false;
      } finally {
        if (ownsLock) {
          window._taskBatchStopped = false;
          window.ExecutionLock?.release("task");
        }
        window.eventBus?.emit("tasks:batch_complete");
      }
    };
    window.runTaskBatchAndWait = runTaskBatchAndWait;
    window.eventBus.on("tasks:run_batch", runTaskBatchAndWait);
  }
  function _taskRefIdentity(task, refId) {
    const media = task?.ref_thumbnails?.[refId];
    const persistentId =
      (media && typeof media === "object"
        ? media.media_uuid || media.file_name
        : null) ||
      task?.ref_file_names?.[refId] ||
      refId;
    const value = String(persistentId || refId || "").trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
      ? value.toLowerCase()
      : value;
  }
  function _uniqueTaskRefIds(rawIds, task = null) {
    const values = Array.isArray(rawIds)
      ? rawIds
      : String(rawIds || "").split(",");
    const result = [];
    const seen = new Set();
    for (const rawValue of values) {
      const refId = String(rawValue || "").trim();
      if (!refId) continue;
      const identity = _taskRefIdentity(task, refId);
      if (seen.has(identity)) continue;
      seen.add(identity);
      result.push(refId);
    }
    return result;
  }
  function _taskRefAliasMap(task, retainedIds) {
    const representativeByIdentity = new Map(
      (retainedIds || []).map((refId) => [
        _taskRefIdentity(task, refId),
        refId,
      ]),
    );
    const aliases = new Map();
    for (const refId of _uniqueTaskRefIds(task?.ref_file_ids)) {
      const representative = representativeByIdentity.get(
        _taskRefIdentity(task, refId),
      );
      if (representative) aliases.set(refId, representative);
    }
    return aliases;
  }
  function _parseTaskMentionNames(prompt) {
    const matches =
      String(prompt || "").match(/@(\[[^\]]+\]|[\p{L}\p{N}_]+)/gu) || [];
    return [
      ...new Set(
        matches
          .map((match) =>
            match
              .substring(1)
              .replace(/^\[|\]$/g, "")
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      ),
    ];
  }
  async function _resolveChatGPTTaskRefs(
    task,
    adapter,
    { provider = "chatgpt", mediaType = "image", strictConfig = false } = {},
  ) {
    const idsRaw = task?.ref_file_ids || "";
    const ids = _uniqueTaskRefIds(idsRaw, task);
    if (ids.length === 0) return { resolved: [], fids: [], requestedFids: [] };
    if (task?.ref_image_mode === "none")
      return { resolved: [], fids: [], requestedFids: [] };
    const configuredMax =
      typeof adapter?.getMaxRefImages === "function"
        ? adapter.getMaxRefImages({ mode: mediaType })
        : adapter?.capabilities?.maxRefImages;
    const maxRef =
      Number.isInteger(configuredMax) && configuredMax > 0
        ? configuredMax
        : strictConfig
          ? 0
          : 4;
    if (maxRef === 0) {
      throw Object.assign(
        new Error(`${provider.toUpperCase()}_TASK_REF_CONFIG_UNAVAILABLE`),
        { code: "REF_UPLOAD_FAILED" },
      );
    }
    const isMentionMode = task?.ref_image_mode === "mention";
    const isSequentialMode = task?.ref_image_mode === "sequential";
    const isNoneMode = task?.ref_image_mode === "none";
    const idsToResolve = isNoneMode
      ? []
      : isMentionMode || isSequentialMode
        ? ids
        : ids.slice(0, maxRef);
    if (
      !isMentionMode &&
      !isSequentialMode &&
      !isNoneMode &&
      ids.length > maxRef
    ) {
      console.warn(
        `[executeTaskViaChatGPT] V\u01B0\u1EE3t gi\u1EDBi h\u1EA1n ref ${maxRef} \u2014 ch\u1EC9 g\u1EEDi ${maxRef} \u1EA3nh \u0111\u1EA7u`,
      );
    }
    const thumbMap = task?.ref_thumbnails || {};
    const fnMap = task?.ref_file_names || {};
    const resolved = [];
    const fids = [];
    for (const tid of idsToResolve) {
      let thumbUrl = null;
      if (typeof thumbMap === "object" && thumbMap[tid]) {
        const entry = thumbMap[tid];
        thumbUrl = typeof entry === "string" ? entry : entry?.thumbnail || null;
      }
      if (!thumbUrl && window.GenTab?.thumbnailCache?.[tid]) {
        thumbUrl = window.GenTab.thumbnailCache[tid];
      }
      const fileName =
        fnMap[tid] || window.GenTab?.fileNameCache?.[tid] || `${tid}.png`;
      if (!thumbUrl) {
        console.warn(
          "[executeTaskViaChatGPT] ref skipped \u2014 kh\xF4ng c\xF3 thumbnail URL:",
          tid,
        );
        continue;
      }
      try {
        const fetchResp =
          await window.GenTab?._resolveCrossProviderRefThumbnail?.(thumbUrl);
        if (fetchResp?.success && fetchResp.base64) {
          const m = fetchResp.base64.match(/^data:(.+?);base64,(.+)$/);
          if (m) {
            resolved.push({ base64: m[2], name: fileName, type: m[1] });
          } else {
            resolved.push({
              base64: fetchResp.base64,
              name: fileName,
              type: "image/png",
            });
          }
          fids.push(tid);
        }
      } catch (err) {
        console.warn(
          "[executeTaskViaChatGPT] fetch ref blob error:",
          tid,
          err.message,
        );
      }
    }
    return { resolved, fids, requestedFids: idsToResolve };
  }
  function _assertTaskRefsResolved(
    task,
    adapter,
    resolved,
    provider,
    maxRefOverride = null,
  ) {
    if (task?.ref_image_mode === "none") return;
    const requested = _uniqueTaskRefIds(task?.ref_file_ids, task).length;
    if (!requested) return;
    const maxRef = maxRefOverride ?? (adapter?.capabilities?.maxRefImages || 4);
    const expected =
      task?.ref_image_mode === "sequential" ||
      task?.ref_image_mode === "mention"
        ? requested
        : Math.min(requested, maxRef);
    console.info("[TASK_REF_AUDIT]", {
      provider,
      taskId: task?.task_id || null,
      mode: task?.ref_image_mode || "all",
      requested,
      expected,
      resolved: resolved.length,
    });
    if (resolved.length < expected) {
      if (["chatgpt", "grok"].includes(provider) && resolved.length > 0) {
        console.warn(
          `[executeTaskVia${provider === "grok" ? "Grok" : "ChatGPT"}] ${resolved.length}/${expected} ref s\u1EB5n s\xE0ng; ti\u1EBFp t\u1EE5c v\u1EDBi \u1EA3nh \u0111\xE3 t\u1EA3i \u0111\u01B0\u1EE3c`,
        );
        return;
      }
      throw Object.assign(
        new Error(
          `${provider.toUpperCase()}_TASK_REF_RESOLUTION_INCOMPLETE:${resolved.length}/${expected}`,
        ),
        { code: "REF_UPLOAD_FAILED" },
      );
    }
  }
  async function _executeTaskViaChatGPT(task, ctx = {}) {
    const { signalSubmitted } = ctx;
    if (!window.ProviderRegistry) {
      throw new Error("ProviderRegistry not loaded");
    }
    const adapter = window.ProviderRegistry.get("chatgpt");
    if (!adapter) {
      throw new Error("ChatGPT adapter not available");
    }
    if (window.storageManager) {
      try {
        await window.storageManager.updateTaskStatus(task.task_id, "running");
      } catch (_) {}
    }
    if (window.eventBus) {
      window.eventBus.emit("task:status_changed", {
        taskId: task.task_id,
        status: "running",
      });
    }
    const ready = await adapter.ensureReady();
    if (!ready || !ready.ready) {
      if (ready?.error === "NOT_LOGGED_IN") {
        window.eventBus?.emit("chatgpt:login_required");
      }
      throw new Error(ready?.error || "CHATGPT_NOT_READY");
    }
    const prompts =
      task.multi_prompt && task.prompts && task.prompts.length > 1
        ? task.prompts
        : [task.prompt];
    const promptCount = prompts.length;
    let gate = null;
    const results = [];
    let successCount = 0;
    let failedCount = 0;
    const collectedIds = [];
    const collectedThumbs = {};
    let thumbCounter = 0;
    let nextDownloadIndex = 1;
    try {
      try {
        signalSubmitted?.();
      } catch (_) {}
      const {
        resolved: refImagesResolved,
        fids: refResolvedFids,
        requestedFids: requestedRefFids,
      } = await _resolveChatGPTTaskRefs(task, adapter);
      _assertTaskRefsResolved(task, adapter, refImagesResolved, "chatgpt");
      const taskIsMentionMode = task?.ref_image_mode === "mention";
      const taskIsSequentialMode = task?.ref_image_mode === "sequential";
      const taskMaxRef = adapter?.capabilities?.maxRefImages || 4;
      let taskMentionNameToFid = null;
      if (taskIsMentionMode) {
        const slugMap = task?.ref_image_names || {};
        taskMentionNameToFid = {};
        for (const [fid, representative] of _taskRefAliasMap(
          task,
          requestedRefFids,
        )) {
          const slug = slugMap[fid];
          if (slug && representative)
            taskMentionNameToFid[String(slug).toLowerCase()] = representative;
        }
      }
      const taskAutoDownload =
        !!task.auto_download && !!window.featureGate?.canUse?.("auto_download");
      const deleteAfterGen = !!task.chatgpt_delete_after_gen;
      const _cgTaskDl = await window.DownloadHelper.getSettings();
      const _cgTaskDownloadFolder = _cgTaskDl.folder;
      const _cgTaskDownloadTemplate = _cgTaskDl.template;
      const _cgTaskSettings = await new Promise((resolve) =>
        chrome.storage.local.get(["af_settings"], (r) =>
          resolve(r.af_settings || {}),
        ),
      );
      for (let i = 0; i < prompts.length; i++) {
        if (window._taskShouldStop || window._taskBatchStopped) {
          console.log("[executeTaskViaChatGPT] Stopped by user");
          break;
        }
        const prompt = prompts[i];
        let refsForThisPrompt = refImagesResolved;
        let missingRequiredRef = false;
        if (taskIsMentionMode && taskMentionNameToFid) {
          const mentions = _parseTaskMentionNames(prompt);
          const matchedFids = new Set();
          for (const name of mentions) {
            const fid = taskMentionNameToFid[name];
            if (fid) matchedFids.add(fid);
          }
          missingRequiredRef = [...matchedFids].some(
            (fid) => !refResolvedFids.includes(fid),
          );
          refsForThisPrompt = refImagesResolved.filter((_, idx) =>
            matchedFids.has(refResolvedFids[idx]),
          );
          if (refsForThisPrompt.length > taskMaxRef) {
            console.warn(
              `[executeTaskViaChatGPT] prompt ${i + 1}: ${refsForThisPrompt.length} mention v\u01B0\u1EE3t cap ${taskMaxRef} \u2014 ch\u1EC9 g\u1EEDi ${taskMaxRef} \u0111\u1EA7u`,
            );
            refsForThisPrompt = refsForThisPrompt.slice(0, taskMaxRef);
          }
        } else if (taskIsSequentialMode && requestedRefFids.length > 0) {
          const group = window.RefImageAssignment.select(
            requestedRefFids,
            i,
            task.ref_images_per_prompt,
          );
          missingRequiredRef = group.some(
            (id) => !refResolvedFids.includes(id),
          );
          refsForThisPrompt = group
            .map((id) => refImagesResolved[refResolvedFids.indexOf(id)])
            .filter(Boolean);
        }
        try {
          if (missingRequiredRef) {
            throw Object.assign(
              new Error("CHATGPT_TASK_REQUIRED_REF_MISSING"),
              { code: "REF_UPLOAD_FAILED" },
            );
          }
          const result = await adapter.submit({
            prompt,
            refFileIds: refsForThisPrompt,
            settings: {
              ratio: task.ratio || "story",
              model: task.model || _cgTaskSettings.chatgptModel || null,
              fallbackPrefix:
                _cgTaskSettings.chatgptFallbackPrefix ||
                "Generate an image of: ",
            },
            taskName: task.task_name || null,
            shouldStop: () =>
              window._taskShouldStop || window._taskBatchStopped,
          });
          if (result && result.success) {
            successCount++;
            const downloadStartIndex = nextDownloadIndex;
            nextDownloadIndex += Array.isArray(result.imageUrls)
              ? result.imageUrls.length
              : 0;
            window._currentTaskSuccessCount = successCount;
            if (Array.isArray(result.imageUrls)) {
              results.push(...result.imageUrls);
              const _ts = Date.now();
              for (const url of result.imageUrls) {
                if (!url) continue;
                const synthId = `cg_${_ts}_${thumbCounter++}`;
                collectedIds.push(synthId);
                collectedThumbs[synthId] = {
                  thumbnail: url,
                  type: "image",
                  file_name: "",
                };
              }
            }
            if (
              taskAutoDownload &&
              result.tabId &&
              Array.isArray(result.imageUrls)
            ) {
              for (let urlIdx = 0; urlIdx < result.imageUrls.length; urlIdx++) {
                const url = result.imageUrls[urlIdx];
                try {
                  const fetchResp =
                    await window.MessageBridge?.chatGPTFetchImage?.(
                      url,
                      result.tabId,
                    );
                  if (fetchResp?.success && fetchResp.base64) {
                    const blob = await (await fetch(fetchResp.base64)).blob();
                    const blobUrl = URL.createObjectURL(blob);
                    const filename =
                      window.GenTab?._buildChatGPTFilename?.(
                        _cgTaskDownloadTemplate,
                        window._currentProjectName || "flow",
                        prompt,
                        i + 1,
                        urlIdx + 1,
                        "",
                        task.task_name,
                        _cgTaskDownloadFolder,
                        downloadStartIndex + urlIdx,
                      ) ||
                      `${_cgTaskDownloadFolder}/${task.task_name}/chatgpt_${Date.now()}.png`;
                    await new Promise((resolve) => {
                      chrome.runtime.sendMessage(
                        {
                          action: "chromeDownload",
                          url: blobUrl,
                          filename,
                          waitForComplete: deleteAfterGen,
                        },
                        () => resolve(),
                      );
                    });
                    setTimeout(
                      () => URL.revokeObjectURL(blobUrl),
                      deleteAfterGen ? 5e3 : 3e4,
                    );
                  }
                } catch (dlErr) {
                  console.warn(
                    "[executeTaskViaChatGPT] auto-download error:",
                    dlErr,
                  );
                }
              }
            }
            if (deleteAfterGen && window.ChatGPTSession) {
              try {
                const deleteResp =
                  await window.ChatGPTSession.deleteLastMessage();
                if (deleteResp?.success) {
                  console.log(
                    "[executeTaskViaChatGPT] deleteAfterGen: deleted message",
                  );
                } else {
                  console.warn(
                    "[executeTaskViaChatGPT] deleteAfterGen failed:",
                    deleteResp?.error,
                  );
                }
              } catch (delErr) {
                console.warn(
                  "[executeTaskViaChatGPT] deleteAfterGen error:",
                  delErr.message,
                );
              }
            }
            if (collectedIds.length > 0 && window.storageManager) {
              try {
                const partialTask = await window.storageManager.getTask(
                  task.task_id,
                );
                if (partialTask) {
                  const existingIds = (partialTask.result_file_ids || "")
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                  const mergedIds = [
                    ...new Set([...existingIds, ...collectedIds]),
                  ];
                  partialTask.result_file_ids = mergedIds.join(", ");
                  partialTask.result_thumbnails = {
                    ...(partialTask.result_thumbnails || {}),
                    ...collectedThumbs,
                  };
                  await window.storageManager.saveTask(partialTask);
                  console.log(
                    "[executeTaskViaChatGPT] Incremental save:",
                    collectedIds.length,
                    "results",
                  );
                }
              } catch (partialErr) {
                console.warn(
                  "[executeTaskViaChatGPT] Incremental save failed:",
                  partialErr.message,
                );
              }
            }
          } else {
            if (window._taskShouldStop || window._taskBatchStopped) break;
            failedCount++;
            console.warn(
              "[executeTaskViaChatGPT] Submit failed:",
              result?.error,
              result?.message,
            );
            if (result?.error === "LIMIT_ALERT") {
              console.warn(
                "[executeTaskViaChatGPT] LIMIT_ALERT \u2014 d\u1EEBng task",
              );
              failedCount += prompts.length - i - 1;
              if (window.customDialog?.alert) {
                const msg =
                  result.message ||
                  "ChatGPT has run out of image generations on the Free plan. Please upgrade to ChatGPT Plus or try again later.";
                window.customDialog.alert(msg, {
                  title: "ChatGPT \u2014 Out of image generations",
                  type: "warning",
                });
              }
              break;
            }
          }
        } catch (e) {
          if (window._taskShouldStop || window._taskBatchStopped) break;
          failedCount++;
          console.error(
            "[executeTaskViaChatGPT] Submit exception:",
            e?.message || e,
          );
        }
        if (
          i < prompts.length - 1 &&
          !window._taskShouldStop &&
          !window._taskBatchStopped
        ) {
          await new Promise((r) => setTimeout(r, 2e3));
        }
      }
      if (gate && gate.token && window.ExecutionGate) {
        await window.ExecutionGate.complete(
          gate.token,
          successCount > 0 ? "success" : "failed",
        );
      }
    } catch (err) {
      if (gate && gate.token && window.ExecutionGate) {
        try {
          await window.ExecutionGate.complete(gate.token, "failed");
        } catch (_) {}
      }
      if (window.storageManager) {
        try {
          await window.storageManager.updateTaskStatus(task.task_id, "failed");
        } catch (_) {}
      }
      if (window.eventBus) {
        window.eventBus.emit("task:status_changed", {
          taskId: task.task_id,
          task_id: task.task_id,
          status: "failed",
          prompt: task.prompt || "",
          media_type: task.media_type || null,
          model: task.model || "",
          ratio: task.ratio || "",
          prompt_count:
            task.multi_prompt && task.prompts?.length ? task.prompts.length : 1,
          quantity: task.quantity || 1,
          ref_file_ids: task.ref_file_ids || "",
          ref_thumbnails: task.ref_thumbnails || {},
          provider: "chatgpt",
          source: "task",
          error_reason: String(err?.message || err || "Task failed").slice(
            0,
            1e3,
          ),
          project_id: task.project_id || window._currentProjectId || null,
          auto_download: !!task.auto_download,
        });
      }
      throw err;
    }
    const wasStopped = window._taskShouldStop || window._taskBatchStopped;
    const finalStatus = wasStopped
      ? "pending"
      : successCount > 0
        ? "completed"
        : "failed";
    if (window.storageManager) {
      let persisted = false;
      try {
        const freshTask = await window.storageManager.getTask(task.task_id);
        if (freshTask) {
          if (collectedIds.length > 0) {
            const existingIds = (freshTask.result_file_ids || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            const mergedIds = [...new Set([...existingIds, ...collectedIds])];
            freshTask.result_file_ids = mergedIds.join(", ");
            freshTask.result_thumbnails = {
              ...(freshTask.result_thumbnails || {}),
              ...collectedThumbs,
            };
          }
          freshTask.status = finalStatus;
          if (finalStatus === "completed" || finalStatus === "failed") {
            freshTask.executed_at = Date.now();
          }
          await window.storageManager.saveTask(freshTask);
          task.result_file_ids = freshTask.result_file_ids;
          task.result_thumbnails = freshTask.result_thumbnails;
          task.status = freshTask.status;
          persisted = true;
        }
      } catch (e) {
        console.warn(
          "[executeTaskViaChatGPT] Persist final task failed:",
          e.message,
        );
      }
      if (!persisted) {
        const mergedResultIds =
          collectedIds.length > 0
            ? [
                ...(task.result_file_ids || "")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
                ...collectedIds,
              ].join(", ")
            : task.result_file_ids || "";
        const mergedThumbs =
          collectedIds.length > 0
            ? { ...(task.result_thumbnails || {}), ...collectedThumbs }
            : task.result_thumbnails || null;
        try {
          const freshTaskRetry = await window.storageManager.getTask(
            task.task_id,
          );
          if (freshTaskRetry) {
            const cleanedTask = { ...freshTaskRetry };
            delete cleanedTask.grok_mode;
            delete cleanedTask.grok_duration;
            delete cleanedTask.grok_resolution;
            delete cleanedTask.grok_image_quality;
            cleanedTask.result_file_ids = mergedResultIds;
            cleanedTask.result_thumbnails = mergedThumbs;
            cleanedTask.status = finalStatus;
            cleanedTask.executed_at = Date.now();
            await window.storageManager.saveTask(cleanedTask);
            task.result_file_ids = mergedResultIds;
            task.result_thumbnails = mergedThumbs;
            task.status = finalStatus;
            persisted = true;
            console.log("[executeTaskViaChatGPT] Tier 1.5 saveTask cleaned OK");
          }
        } catch (e) {
          console.warn(
            "[executeTaskViaChatGPT] Tier 1.5 saveTask cleaned failed:",
            e.message,
          );
        }
        if (!persisted) {
          try {
            await window.storageManager.updateTaskStatus(
              task.task_id,
              finalStatus,
              mergedResultIds,
              {
                result_thumbnails: mergedThumbs,
                executed_at: new Date().toISOString(),
              },
            );
            task.status = finalStatus;
            if (collectedIds.length > 0) {
              task.result_file_ids = mergedResultIds;
              task.result_thumbnails = mergedThumbs;
            }
            persisted = true;
          } catch (e) {
            console.warn(
              "[executeTaskViaChatGPT] Tier 2 PATCH v\u1EDBi result data failed:",
              e.message,
            );
          }
        }
        if (!persisted) {
          try {
            await window.storageManager.updateTaskStatus(
              task.task_id,
              finalStatus,
            );
            task.status = finalStatus;
            console.warn(
              "[executeTaskViaChatGPT] Tier 3 status-only OK (result data lost)",
            );
          } catch (e) {
            console.error(
              "[executeTaskViaChatGPT] Tier 3 updateTaskStatus failed:",
              e.message,
            );
            task.status = finalStatus;
          }
        }
      }
    }
    if (window.eventBus) {
      window.eventBus.emit("task:status_changed", {
        taskId: task.task_id,
        taskName: task.task_name,
        mediaType: task.media_type,
        status: finalStatus,
        prompt: task.prompt || "",
        media_type: task.media_type || "image",
        model: "",
        ratio: task.ratio || "",
        prompt_count:
          task.multi_prompt && task.prompts?.length ? task.prompts.length : 1,
        quantity: 1,
        ref_file_ids: task.ref_file_ids || "",
        ref_thumbnails: task.ref_thumbnails || {},
        result_file_ids: collectedIds.join(", "),
        result_thumbnails: Object.values(collectedThumbs),
        result_file_names: {},
        task_id: task.task_id,
        provider: "chatgpt",
        project_id: task.project_id || null,
        auto_download: !!task.auto_download,
      });
      if (finalStatus === "completed") {
        window.eventBus.emit("task:complete", {
          taskId: task.task_id,
          taskName: task.task_name,
          resultCount: collectedIds.length,
        });
      }
    }
    return {
      success: successCount,
      failed: failedCount,
      results,
      stopped: wasStopped,
    };
  }
  async function _resolveGrokTaskRefs(task, adapter) {
    adapter.normalizeNodeData?.(task);
    if (
      task.grok_mode === "video" &&
      task.video_input_type === "Frames" &&
      adapter.frameReferenceData
    ) {
      const promptCount =
        task.multi_prompt && Array.isArray(task.prompts)
          ? task.prompts.length
          : 1;
      Object.assign(task, adapter.frameSelectionData(task, promptCount), {
        ref_image_mode: "all",
      });
    }
    const idsRaw = task?.ref_file_ids || "";
    const isFrames =
      task.grok_mode === "video" && task.video_input_type === "Frames";
    const ids = isFrames
      ? String(idsRaw)
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
      : _uniqueTaskRefIds(idsRaw, task);
    if (ids.length === 0) return { resolved: [], fids: [], requestedFids: [] };
    const maxRef = adapter.getMaxRefImages({
      mode: task.grok_mode || "image",
      isFrames,
      modelValue: task.model,
    });
    const isMentionMode = task?.ref_image_mode === "mention";
    const isSequentialMode = task?.ref_image_mode === "sequential";
    const isNoneMode = task?.ref_image_mode === "none";
    const idsToResolve = isNoneMode
      ? []
      : isMentionMode || isSequentialMode
        ? ids
        : isFrames
          ? ids
          : ids.slice(0, maxRef);
    if (
      !isFrames &&
      !isMentionMode &&
      !isSequentialMode &&
      !isNoneMode &&
      ids.length > maxRef
    ) {
      console.warn(
        `[executeTaskViaGrok] V\u01B0\u1EE3t gi\u1EDBi h\u1EA1n ref ${maxRef} \u2014 ch\u1EC9 g\u1EEDi ${maxRef} \u1EA3nh \u0111\u1EA7u`,
      );
    }
    const thumbMap = task?.ref_thumbnails || {};
    const fnMap = task?.ref_file_names || {};
    const resolved = [];
    const fids = [];
    for (const tid of idsToResolve) {
      let thumbUrl = null;
      if (typeof thumbMap === "object" && thumbMap[tid]) {
        const entry = thumbMap[tid];
        thumbUrl =
          typeof entry === "string"
            ? entry
            : entry?.source_thumbnail || entry?.thumbnail || null;
      }
      if (!thumbUrl && window.GenTab?.thumbnailCache?.[tid]) {
        thumbUrl = window.GenTab.thumbnailCache[tid];
      }
      const fileName =
        fnMap[tid] || window.GenTab?.fileNameCache?.[tid] || `${tid}.png`;
      if (!thumbUrl) {
        console.warn(
          "[executeTaskViaGrok] ref skipped \u2014 kh\xF4ng c\xF3 thumbnail URL:",
          tid,
        );
        continue;
      }
      try {
        const fetchResp =
          await window.GenTab?._resolveCrossProviderRefThumbnail?.(thumbUrl);
        if (fetchResp?.success && fetchResp.base64) {
          const m = fetchResp.base64.match(/^data:(.+?);base64,(.+)$/);
          if (m) {
            resolved.push({ base64: m[2], name: fileName, type: m[1] });
          } else {
            resolved.push({
              base64: fetchResp.base64,
              name: fileName,
              type: "image/png",
            });
          }
          fids.push(tid);
        }
      } catch (err) {
        console.warn(
          "[executeTaskViaGrok] fetch ref blob error:",
          tid,
          err.message,
        );
      }
    }
    return { resolved, fids, requestedFids: idsToResolve };
  }
  async function _executeTaskViaGrok(task, ctx = {}) {
    const { signalSubmitted } = ctx;
    if (!window.ProviderRegistry) {
      throw new Error("ProviderRegistry not loaded");
    }
    const adapter = window.ProviderRegistry.get("grok");
    if (!adapter) {
      throw new Error("GROK_ADAPTER_NOT_LOADED");
    }
    if (window.storageManager) {
      try {
        await window.storageManager.updateTaskStatus(task.task_id, "running");
      } catch (_) {}
    }
    if (window.eventBus) {
      window.eventBus.emit("task:status_changed", {
        taskId: task.task_id,
        status: "running",
      });
    }
    const ready = await adapter.ensureReady();
    if (!ready || !ready.ready) {
      if (ready?.error === "NOT_LOGGED_IN") {
        window.eventBus?.emit("grok:login_required");
      }
      throw new Error(ready?.error || "GROK_NOT_READY");
    }
    const prompts =
      task.multi_prompt && task.prompts && task.prompts.length > 1
        ? task.prompts
        : [task.prompt];
    const promptCount = prompts.length;
    let gate = null;
    const results = [];
    let successCount = 0;
    let failedCount = 0;
    const collectedIds = [];
    const collectedThumbs = {};
    let thumbCounter = 0;
    let nextDownloadIndex = 1;
    try {
      try {
        signalSubmitted?.();
      } catch (_) {}
      const {
        resolved: refImagesResolved,
        fids: refResolvedFids,
        requestedFids: requestedRefFids,
      } = await _resolveGrokTaskRefs(task, adapter);
      const isFrames =
        task.grok_mode === "video" && task.video_input_type === "Frames";
      const grokFramePairs = isFrames
        ? adapter.framePairs(task, promptCount)
        : null;
      if (isFrames)
        adapter.frameSelectionData(task, promptCount, { requireStart: true });
      else
        _assertTaskRefsResolved(
          task,
          adapter,
          refImagesResolved,
          "grok",
          adapter.getMaxRefImages({
            mode: task.grok_mode || "image",
            isFrames,
            modelValue: task.model,
          }),
        );
      const taskIsMentionMode = task?.ref_image_mode === "mention";
      const taskIsSequentialMode = task?.ref_image_mode === "sequential";
      const taskMaxRef = adapter.getMaxRefImages({
        mode: task.grok_mode || "image",
        isFrames,
        modelValue: task.model,
      });
      let taskMentionNameToFid = null;
      if (taskIsMentionMode) {
        const slugMap = task?.ref_image_names || {};
        taskMentionNameToFid = {};
        for (const [fid, representative] of _taskRefAliasMap(
          task,
          requestedRefFids,
        )) {
          const slug = slugMap[fid];
          if (slug && representative)
            taskMentionNameToFid[String(slug).toLowerCase()] = representative;
        }
      }
      const taskAutoDownload =
        !!task.auto_download && !!window.featureGate?.canUse?.("auto_download");
      const _grokTaskDl = await window.DownloadHelper.getSettings();
      const _grokTaskDownloadFolder = _grokTaskDl.folder;
      const _grokTaskDownloadTemplate = _grokTaskDl.template;
      let _grokWatchdogTimer = null;
      const _startWatchdog = (tabIdToAbort) => {
        if (_grokWatchdogTimer) return;
        _grokWatchdogTimer = setInterval(() => {
          if (window._taskShouldStop || window._taskBatchStopped) {
            console.log(
              "[executeTaskViaGrok] Stop detected \u2192 abort content script",
            );
            if (tabIdToAbort && window.MessageBridge?.grokAbort) {
              window.MessageBridge.grokAbort(tabIdToAbort).catch(() => {});
            }
            clearInterval(_grokWatchdogTimer);
            _grokWatchdogTimer = null;
          }
        }, 500);
      };
      const _stopWatchdog2 = () => {
        if (_grokWatchdogTimer) {
          clearInterval(_grokWatchdogTimer);
          _grokWatchdogTimer = null;
        }
      };
      const _grokTabInfo = await window.GrokSession?.getTabInfo?.();
      const _grokTabId = _grokTabInfo?.tabId;
      for (let i = 0; i < prompts.length; i++) {
        if (window._taskShouldStop || window._taskBatchStopped) {
          console.log("[executeTaskViaGrok] Stopped by user");
          break;
        }
        const prompt = prompts[i];
        let refsForThisPrompt = refImagesResolved;
        let missingRequiredRef = false;
        if (grokFramePairs) {
          const pairIds = grokFramePairs[i].ref_file_ids
            .split(",")
            .filter(Boolean);
          missingRequiredRef = pairIds.some(
            (id) => !refResolvedFids.includes(id),
          );
          refsForThisPrompt = pairIds
            .map((id) => refImagesResolved[refResolvedFids.indexOf(id)])
            .filter(Boolean);
        } else if (taskIsMentionMode && taskMentionNameToFid) {
          const mentions = _parseTaskMentionNames(prompt);
          const matchedFids = new Set();
          for (const name of mentions) {
            const fid = taskMentionNameToFid[name];
            if (fid) matchedFids.add(fid);
          }
          missingRequiredRef = [...matchedFids].some(
            (fid) => !refResolvedFids.includes(fid),
          );
          refsForThisPrompt = refImagesResolved.filter((_, idx) =>
            matchedFids.has(refResolvedFids[idx]),
          );
          if (!isFrames && refsForThisPrompt.length > taskMaxRef) {
            console.warn(
              `[executeTaskViaGrok] prompt ${i + 1}: ${refsForThisPrompt.length} mention v\u01B0\u1EE3t cap ${taskMaxRef} \u2014 ch\u1EC9 g\u1EEDi ${taskMaxRef} \u0111\u1EA7u`,
            );
            refsForThisPrompt = refsForThisPrompt.slice(0, taskMaxRef);
          }
        } else if (taskIsSequentialMode && requestedRefFids.length > 0) {
          const group = window.RefImageAssignment.select(
            requestedRefFids,
            i,
            task.ref_images_per_prompt,
          );
          missingRequiredRef = group.some(
            (id) => !refResolvedFids.includes(id),
          );
          refsForThisPrompt = group
            .map((id) => refImagesResolved[refResolvedFids.indexOf(id)])
            .filter(Boolean);
        }
        try {
          if (missingRequiredRef) {
            throw Object.assign(new Error("GROK_TASK_REQUIRED_REF_MISSING"), {
              code: "REF_UPLOAD_FAILED",
            });
          }
          _startWatchdog(_grokTabId);
          const result = await adapter.submit({
            prompt,
            refFileIds: refsForThisPrompt,
            shouldStop: () =>
              window._taskShouldStop || window._taskBatchStopped,
            settings: {
              mode: task.grok_mode || "image",
              model: task.model,
              videoInputType: task.video_input_type || "Ingredients",
              ratio: task.ratio || "widescreen",
              quantity: task.quantity || 1,
              duration: task.grok_duration || "6s",
              resolution: task.grok_resolution || "720p",
              imageQuality: task.grok_image_quality || "speed",
              timeout: window.SystemConfig?.getTimeout(
                task.grok_mode === "video"
                  ? "video_timeout_ms"
                  : "image_timeout_ms",
              ),
            },
            taskName: task.task_name || null,
          });
          _stopWatchdog2();
          if (result?.error === "ABORTED") {
            console.log(
              "[executeTaskViaGrok] Adapter returned ABORTED \u2192 break loop",
            );
            break;
          }
          if (result && result.success) {
            successCount++;
            const downloadStartIndex = nextDownloadIndex;
            nextDownloadIndex += Array.isArray(result.mediaUrls)
              ? result.mediaUrls.length
              : 0;
            window._currentTaskSuccessCount = successCount;
            if (Array.isArray(result.mediaUrls)) {
              results.push(...result.mediaUrls);
              const _ts = Date.now();
              const isVideo =
                result.mediaType === "video" || task.grok_mode === "video";
              for (const url of result.mediaUrls) {
                if (!url) continue;
                const synthId = `grok_${_ts}_${thumbCounter++}`;
                collectedIds.push(synthId);
                collectedThumbs[synthId] = {
                  thumbnail: url,
                  type: isVideo ? "video" : "image",
                  file_name: "",
                };
              }
            }
            if (taskAutoDownload && Array.isArray(result.mediaUrls)) {
              for (let urlIdx = 0; urlIdx < result.mediaUrls.length; urlIdx++) {
                if (window._taskShouldStop || window._taskBatchStopped) {
                  console.log(
                    "[executeTaskViaGrok] Stop detected during auto-download \u2192 break",
                  );
                  break;
                }
                const url = result.mediaUrls[urlIdx];
                try {
                  const isVideo =
                    result.mediaType === "video" || task.grok_mode === "video";
                  const ext = isVideo ? "mp4" : "png";
                  let filename =
                    window.GenTab?._buildChatGPTFilename?.(
                      _grokTaskDownloadTemplate,
                      window._currentProjectName || "flow",
                      prompt,
                      i + 1,
                      urlIdx + 1,
                      "",
                      task.task_name,
                      _grokTaskDownloadFolder,
                      downloadStartIndex + urlIdx,
                    ) ||
                    `${_grokTaskDownloadFolder}/${task.task_name || "grok"}/grok_${Date.now()}.${ext}`;
                  if (isVideo && filename.endsWith(".png")) {
                    filename = filename.replace(/\.png$/i, ".mp4");
                  }
                  const _pre =
                    result.fetchedMedia?.find((f) => f.url === url)?.base64 ||
                    null;
                  const dl = (await window.MessageBridge?.grokDownloadMedia?.(
                    url,
                    result.tabId,
                    filename,
                    _pre,
                    { nativeFirst: result.mediaUrls.length === 1 },
                  )) || {
                    success: false,
                    tier: 0,
                    error: "MessageBridge unavailable",
                  };
                  if (!dl.success)
                    console.warn(
                      `[executeTaskViaGrok] download fail (Tier ${dl.tier}): ${dl.error || "unknown"} | URL: ${(url || "").substring(0, 80)}`,
                    );
                } catch (dlErr) {
                  console.warn(
                    "[executeTaskViaGrok] auto-download error:",
                    dlErr,
                  );
                }
              }
            }
            if (collectedIds.length > 0 && window.storageManager) {
              try {
                const partialTask = await window.storageManager.getTask(
                  task.task_id,
                );
                if (partialTask) {
                  const existingIds = (partialTask.result_file_ids || "")
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                  const mergedIds = [
                    ...new Set([...existingIds, ...collectedIds]),
                  ];
                  partialTask.result_file_ids = mergedIds.join(", ");
                  partialTask.result_thumbnails = {
                    ...(partialTask.result_thumbnails || {}),
                    ...collectedThumbs,
                  };
                  await window.storageManager.saveTask(partialTask);
                  console.log(
                    "[executeTaskViaGrok] Incremental save:",
                    collectedIds.length,
                    "results",
                  );
                }
              } catch (partialErr) {
                console.warn(
                  "[executeTaskViaGrok] Incremental save failed:",
                  partialErr.message,
                );
              }
            }
          } else {
            failedCount++;
            console.warn(
              "[executeTaskViaGrok] Submit failed:",
              result?.error,
              result?.message,
            );
            if (
              result?.error === "LIMIT_ALERT" ||
              result?.error === "RATE_LIMIT"
            ) {
              console.warn(
                "[executeTaskViaGrok] LIMIT_ALERT \u2014 d\u1EEBng task",
              );
              failedCount += prompts.length - i - 1;
              if (window.customDialog?.alert) {
                const msg =
                  result.message ||
                  "Grok has run out of generations. Please try again later or upgrade your plan.";
                window.customDialog.alert(msg, {
                  title: "Grok \u2014 Out of generations",
                  type: "warning",
                });
              }
              break;
            }
          }
        } catch (e) {
          _stopWatchdog2();
          failedCount++;
          console.error(
            "[executeTaskViaGrok] Submit exception:",
            e?.message || e,
          );
        }
        if (i < prompts.length - 1) {
          await new Promise((r) => setTimeout(r, 2e3));
        }
      }
      _stopWatchdog2();
      if (gate && gate.token && window.ExecutionGate) {
        await window.ExecutionGate.complete(
          gate.token,
          successCount > 0 ? "success" : "failed",
        );
      }
    } catch (err) {
      _stopWatchdog();
      if (gate && gate.token && window.ExecutionGate) {
        try {
          await window.ExecutionGate.complete(gate.token, "failed");
        } catch (_) {}
      }
      if (window.storageManager) {
        try {
          await window.storageManager.updateTaskStatus(task.task_id, "failed");
        } catch (_) {}
      }
      if (window.eventBus) {
        window.eventBus.emit("task:status_changed", {
          taskId: task.task_id,
          task_id: task.task_id,
          status: "failed",
          prompt: task.prompt || "",
          media_type: task.media_type || null,
          model: task.model || "",
          ratio: task.ratio || "",
          prompt_count:
            task.multi_prompt && task.prompts?.length ? task.prompts.length : 1,
          quantity: task.quantity || 1,
          ref_file_ids: task.ref_file_ids || "",
          ref_thumbnails: task.ref_thumbnails || {},
          provider: "grok",
          source: "task",
          error_reason: String(err?.message || err || "Task failed").slice(
            0,
            1e3,
          ),
          project_id: task.project_id || window._currentProjectId || null,
          auto_download: !!task.auto_download,
        });
      }
      throw err;
    }
    const wasStopped = window._taskShouldStop || window._taskBatchStopped;
    const finalStatus = wasStopped
      ? "pending"
      : successCount > 0
        ? "completed"
        : "failed";
    if (window.storageManager) {
      let persisted = false;
      try {
        const freshTask = await window.storageManager.getTask(task.task_id);
        if (freshTask) {
          if (collectedIds.length > 0) {
            const existingIds = (freshTask.result_file_ids || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            const mergedIds = [...new Set([...existingIds, ...collectedIds])];
            freshTask.result_file_ids = mergedIds.join(", ");
            freshTask.result_thumbnails = {
              ...(freshTask.result_thumbnails || {}),
              ...collectedThumbs,
            };
          }
          freshTask.status = finalStatus;
          if (finalStatus === "completed" || finalStatus === "failed") {
            freshTask.executed_at = Date.now();
          }
          await window.storageManager.saveTask(freshTask);
          task.result_file_ids = freshTask.result_file_ids;
          task.result_thumbnails = freshTask.result_thumbnails;
          task.status = freshTask.status;
          persisted = true;
        }
      } catch (e) {
        console.warn(
          "[executeTaskViaGrok] Persist final task failed:",
          e.message,
        );
      }
      if (!persisted) {
        const mergedResultIds =
          collectedIds.length > 0
            ? [
                ...(task.result_file_ids || "")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
                ...collectedIds,
              ].join(", ")
            : task.result_file_ids || "";
        const mergedThumbs =
          collectedIds.length > 0
            ? { ...(task.result_thumbnails || {}), ...collectedThumbs }
            : task.result_thumbnails || null;
        try {
          const freshTaskRetry = await window.storageManager.getTask(
            task.task_id,
          );
          if (freshTaskRetry) {
            const cleanedTask = { ...freshTaskRetry };
            delete cleanedTask.grok_mode;
            delete cleanedTask.grok_duration;
            delete cleanedTask.grok_resolution;
            delete cleanedTask.grok_image_quality;
            cleanedTask.result_file_ids = mergedResultIds;
            cleanedTask.result_thumbnails = mergedThumbs;
            cleanedTask.status = finalStatus;
            cleanedTask.executed_at = Date.now();
            await window.storageManager.saveTask(cleanedTask);
            task.result_file_ids = mergedResultIds;
            task.result_thumbnails = mergedThumbs;
            task.status = finalStatus;
            persisted = true;
            console.log(
              "[executeTaskViaGrok] Tier 1.5 saveTask cleaned payload OK",
            );
          }
        } catch (e) {
          console.warn(
            "[executeTaskViaGrok] Tier 1.5 saveTask cleaned failed:",
            e.message,
          );
        }
      }
      if (!persisted) {
        const mergedResultIds =
          collectedIds.length > 0
            ? [
                ...(task.result_file_ids || "")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
                ...collectedIds,
              ].join(", ")
            : task.result_file_ids || "";
        const mergedThumbs =
          collectedIds.length > 0
            ? { ...(task.result_thumbnails || {}), ...collectedThumbs }
            : task.result_thumbnails || null;
        try {
          await window.storageManager.updateTaskStatus(
            task.task_id,
            finalStatus,
            mergedResultIds,
            {
              result_thumbnails: mergedThumbs,
              executed_at: new Date().toISOString(),
            },
          );
          task.status = finalStatus;
          if (collectedIds.length > 0) {
            task.result_file_ids = mergedResultIds;
            task.result_thumbnails = mergedThumbs;
          }
          persisted = true;
        } catch (e) {
          console.warn(
            "[executeTaskViaGrok] Tier 2 PATCH v\u1EDBi result data failed:",
            e.message,
          );
        }
      }
      if (!persisted) {
        try {
          await window.storageManager.updateTaskStatus(
            task.task_id,
            finalStatus,
          );
          task.status = finalStatus;
          console.warn(
            "[executeTaskViaGrok] Tier 3 status-only update OK (result data lost)",
          );
        } catch (e) {
          console.error(
            "[executeTaskViaGrok] Tier 3 updateTaskStatus failed:",
            e.message,
          );
          task.status = finalStatus;
        }
      }
    }
    if (window.eventBus) {
      window.eventBus.emit("task:status_changed", {
        taskId: task.task_id,
        taskName: task.task_name,
        mediaType: task.media_type,
        status: finalStatus,
        prompt: task.prompt || "",
        media_type:
          task.grok_mode === "video" ? "Video" : task.media_type || "image",
        model: "",
        ratio: task.ratio || "",
        prompt_count:
          task.multi_prompt && task.prompts?.length ? task.prompts.length : 1,
        quantity: parseInt(task.quantity) || 1,
        ref_file_ids: task.ref_file_ids || "",
        ref_thumbnails: task.ref_thumbnails || {},
        result_file_ids: collectedIds.join(", "),
        result_thumbnails: Object.values(collectedThumbs),
        result_file_names: {},
        task_id: task.task_id,
        provider: "grok",
        project_id: task.project_id || null,
        auto_download: !!task.auto_download,
      });
      if (finalStatus === "completed") {
        window.eventBus.emit("task:complete", {
          taskId: task.task_id,
          taskName: task.task_name,
          resultCount: collectedIds.length,
        });
      }
    }
    return {
      success: successCount,
      failed: failedCount,
      results,
      stopped: wasStopped,
    };
  }
  async function _executeTaskViaGemini(task, ctx = {}) {
    const adapter = window.ProviderRegistry?.get?.("gemini");
    if (!adapter) throw new Error("GEMINI_ADAPTER_NOT_AVAILABLE");
    if (!window.featureGate?.canUse?.("gemini_enabled"))
      throw new Error("GEMINI_NOT_ALLOWED");
    const hasRefs = !!String(task.ref_file_ids || "").trim();
    if (hasRefs && !window.featureGate?.canUseProviderRefImages?.("gemini"))
      throw new Error("GEMINI_REF_IMAGES_NOT_ALLOWED");
    await window.storageManager?.updateTaskStatus?.(task.task_id, "running");
    window.eventBus?.emit?.("task:status_changed", {
      taskId: task.task_id,
      status: "running",
    });
    const prompts =
      task.multi_prompt && task.prompts?.length ? task.prompts : [task.prompt];
    const mediaType = task.media_type === "Video" ? "video" : "image";
    const taskModel =
      task.model || window.ModelRegistry?.safeGetDefault?.("gemini", mediaType);
    if (!taskModel) throw new Error("GEMINI_MODEL_CONFIG_UNAVAILABLE");
    const { resolved = [] } = await _resolveChatGPTTaskRefs(task, adapter, {
      provider: "gemini",
      mediaType: "image",
      strictConfig: true,
    });
    if (hasRefs) {
      const mediaRefCap = adapter.getMaxRefImages?.({ mode: "image" }) ?? 0;
      _assertTaskRefsResolved(task, adapter, resolved, "gemini", mediaRefCap);
    }
    const collectedIds = [],
      collectedThumbs = {},
      collectedUrls = {};
    const geminiDownloadSettings = await window.DownloadHelper.getSettings();
    const geminiDownloadProject =
      geminiDownloadSettings.project || window._currentProjectName || "flow";
    let success = 0,
      failed = 0;
    let nextDownloadIndex = 1;
    try {
      ctx.signalSubmitted?.();
    } catch (_) {}
    for (let index = 0; index < prompts.length; index++) {
      if (window._taskShouldStop || window._taskBatchStopped) break;
      let refs = resolved;
      if (task.ref_image_mode === "none") refs = [];
      else if (task.ref_image_mode === "sequential" && resolved.length)
        refs = window.RefImageAssignment.select(
          resolved,
          index,
          task.ref_images_per_prompt,
        );
      else if (task.ref_image_mode === "mention") {
        const mentioned = new Set(
          (
            String(prompts[index] || "").match(
              /@(\[[^\]]+\]|[\p{L}\p{N}_]+)/gu,
            ) || []
          ).map((value) =>
            value
              .slice(1)
              .replace(/^\[|\]$/g, "")
              .toLowerCase(),
          ),
        );
        refs = resolved.filter((ref) => {
          const full = String(ref.name || "").toLowerCase();
          return (
            mentioned.has(full) || mentioned.has(full.replace(/\.[^.]+$/, ""))
          );
        });
      }
      try {
        const result = await adapter.submit({
          prompt: prompts[index],
          mediaType,
          model: taskModel,
          shouldStop: () => window._taskShouldStop || window._taskBatchStopped,
          ratio: task.ratio,
          refs,
          runId: `task-gemini-${task.task_id}-${index}-${Date.now()}`,
          settings: { promptIndex: index },
        });
        const promptFilenames = [];
        const downloadStartIndex = nextDownloadIndex;
        nextDownloadIndex += result.results.length;
        result.results.forEach((item, mediaIndex) => {
          const id = `gemini_${task.task_id}_${index}_${mediaIndex}_${Date.now()}`;
          let downloadFilename = window.GenTab._buildChatGPTFilename(
            geminiDownloadSettings.template,
            geminiDownloadProject,
            prompts[index],
            index + 1,
            mediaIndex + 1,
            "",
            task.task_name || null,
            geminiDownloadSettings.folder,
            downloadStartIndex + mediaIndex,
          );
          if (mediaType === "video")
            downloadFilename = downloadFilename.replace(/\.png$/i, ".mp4");
          promptFilenames.push(downloadFilename);
          collectedIds.push(id);
          collectedThumbs[id] = {
            thumbnail: item.url,
            type: mediaType,
            file_name: downloadFilename.split("/").pop() || "",
            mime_type:
              item.mimeType ||
              (mediaType === "video" ? "video/mp4" : "image/png"),
          };
          collectedUrls[id] = {
            url: item.url,
            tab_id: result.tabId,
            fingerprint: item.fingerprint || null,
            provider: "gemini",
          };
        });
        success++;
        let checkpointSaved = false;
        try {
          const checkpoint =
            (await window.storageManager?.getTask?.(task.task_id)) || task;
          checkpoint.result_file_ids = collectedIds.join(", ");
          checkpoint.result_thumbnails = {
            ...(checkpoint.result_thumbnails || {}),
            ...collectedThumbs,
          };
          checkpoint.result_provider_urls = {
            ...(checkpoint.result_provider_urls || {}),
            ...collectedUrls,
          };
          await window.storageManager?.saveTask?.(checkpoint);
          checkpointSaved = true;
        } catch (persistError) {
          console.warn(
            "[executeTaskViaGemini] checkpoint persistence failed; final task save will retry:",
            persistError?.message,
          );
        }
        let promptDownloadsOk = true;
        if (task.auto_download) {
          try {
            const shared =
              await window.GeminiMediaDownloadHelper.downloadResults({
                items: result.results,
                tabId: result.tabId,
                mediaType,
                waitForComplete: !!task.gemini_delete_after_gen,
                filenameFor: (_item, mediaIndex) => promptFilenames[mediaIndex],
                onLog: (message) =>
                  console.warn("[executeTaskViaGemini]", message),
              });
            promptDownloadsOk = shared.success;
          } catch (downloadError) {
            promptDownloadsOk = false;
            console.warn(
              "[executeTaskViaGemini] auto-download failed:",
              downloadError?.message || downloadError,
            );
          }
        }
        if (
          !window._taskShouldStop &&
          !window._taskBatchStopped &&
          checkpointSaved &&
          task.gemini_delete_after_gen &&
          promptDownloadsOk
        ) {
          try {
            const deleted =
              await window.GeminiSession?.deleteCurrentConversation?.();
            if (!deleted?.success)
              console.warn(
                "[executeTaskViaGemini] result persisted but conversation cleanup failed:",
                deleted?.error || "unknown",
              );
          } catch (cleanupError) {
            console.warn(
              "[executeTaskViaGemini] result persisted but conversation cleanup failed:",
              cleanupError?.message || cleanupError,
            );
          }
        }
      } catch (error) {
        if (window._taskShouldStop || window._taskBatchStopped) break;
        failed++;
        console.error(
          "[executeTaskViaGemini] prompt failed:",
          error.code || error.message,
        );
      }
    }
    const stopped = !!(window._taskShouldStop || window._taskBatchStopped);
    const finalStatus = stopped
      ? "pending"
      : success > 0
        ? "completed"
        : "failed";
    const fresh =
      (await window.storageManager?.getTask?.(task.task_id)) || task;
    fresh.result_file_ids = collectedIds.join(", ");
    fresh.result_thumbnails = collectedThumbs;
    fresh.result_provider_urls = collectedUrls;
    fresh.status = finalStatus;
    if (!stopped) fresh.executed_at = Date.now();
    await window.storageManager?.saveTask?.(fresh);
    window.eventBus?.emit?.("task:status_changed", {
      ...fresh,
      taskId: task.task_id,
      task_id: task.task_id,
      provider: "gemini",
      source: "task",
      prompt_count: prompts.length,
      quantity: collectedIds.length,
      status: finalStatus,
    });
    return { success, failed, stopped, results: collectedIds };
  }
  async function _executeTaskViaMuse(task, ctx = {}) {
    const adapter = window.ProviderRegistry?.get?.("muse");
    if (!adapter || adapter.key !== "muse")
      throw new Error("MUSE_ADAPTER_NOT_LOADED");
    await window.storageManager
      ?.updateTaskStatus?.(task.task_id, "running")
      .catch?.(() => {});
    window.eventBus?.emit("task:status_changed", {
      taskId: task.task_id,
      status: "running",
    });
    const ready = await adapter.ensureReady();
    if (!ready?.ready) throw new Error(ready?.error || "MUSE_NOT_READY");
    ctx.signalSubmitted?.();
    const prompts =
      task.multi_prompt && Array.isArray(task.prompts) && task.prompts.length
        ? task.prompts
        : [task.prompt];
    const mediaType = task.media_type === "Video" ? "video" : "image";
    const {
      resolved: refImagesResolved,
      fids: refResolvedFids,
      requestedFids: requestedRefFids,
    } = await _resolveChatGPTTaskRefs(task, adapter, {
      provider: "muse",
      mediaType,
      strictConfig: true,
    });
    const taskMaxRef =
      adapter.getMaxRefImages?.({
        mode: mediaType,
        modelValue: task.model || null,
      }) ?? 0;
    _assertTaskRefsResolved(
      task,
      adapter,
      refImagesResolved,
      "muse",
      taskMaxRef,
    );
    const taskIsMentionMode = task?.ref_image_mode === "mention";
    const taskIsSequentialMode = task?.ref_image_mode === "sequential";
    let taskMentionNameToFid = null;
    if (taskIsMentionMode) {
      const slugMap = task?.ref_image_names || {};
      taskMentionNameToFid = {};
      for (const [fid, representative] of _taskRefAliasMap(
        task,
        requestedRefFids,
      )) {
        const slug = slugMap[fid];
        if (slug && representative)
          taskMentionNameToFid[String(slug).toLowerCase()] = representative;
      }
    }
    const userSettings = await chrome.storage.local.get(["af_settings"]);
    const taskDeleteAfterGen =
      typeof task.muse_delete_after_gen === "boolean"
        ? task.muse_delete_after_gen
        : userSettings.af_settings?.museDeleteAfterGen === true;
    const deleteAfterGen =
      taskDeleteAfterGen &&
      adapter.capabilities?.supportsDeleteAfterGen === true;
    const autoDownload =
      !!task.auto_download &&
      window.featureGate?.canUse?.("auto_download") === true;
    const downloadSettings = autoDownload
      ? await window.DownloadHelper.getSettings()
      : null;
    const results = [];
    const thumbnails = {};
    const providerUrls = {};
    const failureMessages = [];
    let failed = 0;
    let nextDownloadIndex = 1;
    for (let index = 0; index < prompts.length; index++) {
      if (window._taskShouldStop || window._taskBatchStopped) break;
      let result;
      try {
        let refsForThisPrompt = refImagesResolved;
        let missingRequiredRef = false;
        if (taskIsMentionMode && taskMentionNameToFid) {
          const matchedFids = new Set();
          for (const name of _parseTaskMentionNames(prompts[index])) {
            const fid = taskMentionNameToFid[name];
            if (fid) matchedFids.add(fid);
          }
          missingRequiredRef = [...matchedFids].some(
            (fid) => !refResolvedFids.includes(fid),
          );
          refsForThisPrompt = refImagesResolved.filter((_, refIndex) =>
            matchedFids.has(refResolvedFids[refIndex]),
          );
          refsForThisPrompt = refsForThisPrompt.slice(0, taskMaxRef);
        } else if (taskIsSequentialMode && requestedRefFids.length > 0) {
          const group = window.RefImageAssignment.select(
            requestedRefFids,
            index,
            task.ref_images_per_prompt,
          );
          missingRequiredRef = group.some(
            (id) => !refResolvedFids.includes(id),
          );
          refsForThisPrompt = group
            .map((id) => refImagesResolved[refResolvedFids.indexOf(id)])
            .filter(Boolean);
        }
        if (missingRequiredRef) {
          throw Object.assign(new Error("MUSE_TASK_REQUIRED_REF_MISSING"), {
            code: "REF_UPLOAD_FAILED",
          });
        }
        result = await adapter.submit({
          prompt: prompts[index],
          refs: refsForThisPrompt,
          shouldStop: () => window._taskShouldStop || window._taskBatchStopped,
          settings: {
            mode: mediaType,
            ratio: task.ratio,
            model: task.model || null,
          },
        });
      } catch (error) {
        if (window._taskShouldStop || window._taskBatchStopped) break;
        console.warn("[Task] Muse prompt failed:", error?.message || error);
        const message = String(
          error?.message || error?.code || "MUSE_GENERATION_FAILED",
        ).trim();
        if (message) failureMessages.push(message);
        failed++;
        continue;
      }
      if (!result?.success || !result.mediaUrls?.length) {
        if (window._taskShouldStop || window._taskBatchStopped) break;
        const message = String(
          result?.message || result?.error || "MUSE_GENERATION_FAILED",
        ).trim();
        if (message) failureMessages.push(message);
        failed++;
        continue;
      }
      const downloadStartIndex = nextDownloadIndex;
      nextDownloadIndex += result.mediaUrls.length;
      for (const url of result.mediaUrls) {
        const id = `muse_${Date.now()}_${results.length}`;
        const materialized =
          result.fetchedMedia?.find((item) => item.url === url)?.base64 || url;
        results.push(id);
        thumbnails[id] = {
          thumbnail: materialized,
          type: result.mediaType || mediaType,
          file_name: "",
        };
        providerUrls[id] = { url, tab_id: result.tabId, provider: "muse" };
      }
      window._currentTaskSuccessCount = results.length;
      let downloadsOk = true;
      if (autoDownload && mediaType === "video") {
        for (
          let mediaIndex = 0;
          mediaIndex < result.mediaUrls.length;
          mediaIndex++
        ) {
          const url = String(result.mediaUrls[mediaIndex] || "");
          const filename = window.DownloadHelper.buildFilename({
            template: downloadSettings.template,
            project:
              downloadSettings.project || window._currentProjectName || "flow",
            prompt: prompts[index],
            index: downloadStartIndex + mediaIndex,
            taskName: task.task_name || null,
            folder: downloadSettings.folder,
            ext: "mp4",
          });
          const downloaded = await window.MessageBridge?.museDownloadNative?.(
            result.tabId,
            filename,
            url,
            deleteAfterGen ? 6e5 : 12e4,
          );
          if (!downloaded?.success) {
            downloadsOk = false;
            console.warn(
              "[Task] Muse video auto-download failed:",
              downloaded?.error || "unknown",
            );
            break;
          }
        }
      } else if (autoDownload && mediaType === "image") {
        for (
          let mediaIndex = 0;
          mediaIndex < result.mediaUrls.length;
          mediaIndex++
        ) {
          const url = result.mediaUrls[mediaIndex];
          const filename = window.DownloadHelper.buildFilename({
            template: downloadSettings.template,
            project:
              downloadSettings.project || window._currentProjectName || "flow",
            prompt: prompts[index],
            index: downloadStartIndex + mediaIndex,
            taskName: task.task_name || null,
            folder: downloadSettings.folder,
            ext: "jpg",
          });
          const downloaded =
            await window.MessageBridge?.museDownloadImageResult?.({
              tabId: result.tabId,
              url,
              base64: result.fetchedMedia?.find((item) => item.url === url)
                ?.base64,
              filename,
              waitForComplete: deleteAfterGen,
            });
          if (!downloaded?.success) {
            downloadsOk = false;
            console.warn(
              "[Task] Muse image auto-download failed:",
              downloaded?.error || "unknown",
            );
            break;
          }
        }
      }
      if (
        deleteAfterGen &&
        autoDownload &&
        downloadsOk &&
        !(window._taskShouldStop || window._taskBatchStopped)
      ) {
        const deleted = await window.MuseSession?.deleteCurrentConversation?.();
        if (!deleted?.success)
          console.warn(
            "[Task] Muse cleanup failed:",
            deleted?.error || "unknown",
          );
      }
    }
    const stopped = !!(window._taskShouldStop || window._taskBatchStopped);
    const status = stopped
      ? "pending"
      : results.length
        ? "completed"
        : "failed";
    const failureMessage = [...new Set(failureMessages)]
      .join(" \xB7 ")
      .slice(0, 1e3);
    const saved = {
      ...task,
      status,
      result_file_ids: results.join(","),
      result_thumbnails: thumbnails,
      result_provider_urls: providerUrls,
      error_message: failureMessage,
    };
    if (!stopped) saved.executed_at = Date.now();
    await window.storageManager?.saveTask?.(saved);
    window.eventBus?.emit("task:status_changed", {
      ...saved,
      taskId: task.task_id,
      task_id: task.task_id,
      provider: "muse",
      source: "task",
      result_thumbnails: Object.values(thumbnails),
      prompt_count: prompts.length,
      quantity: results.length,
      status,
      error_reason: failureMessage || void 0,
    });
    if (!stopped && failureMessage) {
      const taskName = task.task_name || task.task_id || "Task";
      window.showNotification?.(
        `Muse \u2014 ${taskName}: ${failureMessage}`,
        "error",
        1e4,
      );
    }
    window.eventBus?.emit("task:completed", {
      task: saved,
      provider: "muse",
      results,
    });
    return {
      success: results.length > 0,
      failed,
      stopped,
      results,
      failureMessages,
    };
  }
  async function executeSingleTask(task, options = {}) {
    const { isParallel = false, onSubmitted } = options;
    let submittedSignaled = false;
    const signalSubmitted = () => {
      if (!submittedSignaled) {
        submittedSignaled = true;
        onSubmitted?.();
      }
    };
    if (!window._taskBatchStopped) {
      window._taskShouldStop = false;
    }
    window._currentTaskSuccessCount = 0;
    await window.storageManager?.resetTaskResults?.(task);
    const providerKey = task.provider || "flow";
    if (providerKey === "grok") {
      return await _executeTaskViaGrok(task, { signalSubmitted });
    }
    if (providerKey === "chatgpt") {
      return await _executeTaskViaChatGPT(task, { signalSubmitted });
    }
    if (providerKey === "gemini") {
      return await _executeTaskViaGemini(task, { signalSubmitted });
    }
    if (providerKey === "muse") {
      return await _executeTaskViaMuse(task, { signalSubmitted });
    }
    if (
      !task.ref_file_ids &&
      task.ref_file_names &&
      Object.keys(task.ref_file_names).length > 0
    ) {
      const reconstructedIds = Object.keys(task.ref_file_names);
      task.ref_file_ids = reconstructedIds.join(", ");
      log(
        "Smart Clone: reconstructed ref_file_ids from ref_file_names:",
        task.ref_file_ids,
      );
    } else if (
      !task.ref_file_ids &&
      task.ref_thumbnails &&
      Object.keys(task.ref_thumbnails).length > 0
    ) {
      const reconstructedIds = Object.keys(task.ref_thumbnails);
      task.ref_file_ids = reconstructedIds.join(", ");
      log(
        "Smart Clone: reconstructed ref_file_ids from ref_thumbnails:",
        task.ref_file_ids,
      );
    }
    log("Task ref_file_ids BEFORE upload:", task.ref_file_ids);
    if (task.ref_file_ids && task.ref_file_ids.includes("upload_")) {
      const beforeUpload = task.ref_file_ids;
      task.ref_file_ids = await window.uploadPendingFiles(task.ref_file_ids);
      log(
        "Task ref_file_ids AFTER upload:",
        beforeUpload,
        "->",
        task.ref_file_ids,
      );
      sidebarLog(`Ref IDs sau upload: ${task.ref_file_ids}`, "info");
      if (beforeUpload !== task.ref_file_ids) {
        const oldIds = (beforeUpload || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const newIds = (task.ref_file_ids || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const uploadMapping = window._lastUploadKeyMapping || {};
        if (task.ref_thumbnails) {
          const updatedThumbs = {};
          for (const oldId of oldIds) {
            const newId =
              uploadMapping[oldId] || (newIds.includes(oldId) ? oldId : null);
            if (!newId) continue;
            const thumb = task.ref_thumbnails[oldId];
            if (thumb) updatedThumbs[newId] = thumb;
          }
          for (const [id, thumb] of Object.entries(task.ref_thumbnails)) {
            if (!updatedThumbs[id] && !oldIds.includes(id))
              updatedThumbs[id] = thumb;
          }
          for (const newId of newIds) {
            const _fresh = MediaRegistry.getThumb(newId);
            if (!_fresh) continue;
            const _prev = updatedThumbs[newId];
            updatedThumbs[newId] =
              _prev && typeof _prev === "object"
                ? {
                    ..._prev,
                    ...(typeof _fresh === "object"
                      ? _fresh
                      : { thumbnail: _fresh }),
                  }
                : _fresh;
          }
          task.ref_thumbnails = updatedThumbs;
        }
        const updatedFileNames = { ...(task.ref_file_names || {}) };
        for (const oldId of oldIds) {
          const newId =
            uploadMapping[oldId] || (newIds.includes(oldId) ? oldId : null);
          if (!newId) {
            delete updatedFileNames[oldId];
            continue;
          }
          if (updatedFileNames[oldId] && oldId !== newId) {
            updatedFileNames[newId] = updatedFileNames[oldId];
            delete updatedFileNames[oldId];
          }
        }
        for (const newId of newIds) {
          if (MediaRegistry.getFileName(newId)) {
            updatedFileNames[newId] = MediaRegistry.getFileName(newId);
          }
        }
        if (Object.keys(updatedFileNames).length > 0) {
          task.ref_file_names = updatedFileNames;
        }
        if (task.ref_image_names) {
          const updatedImageNames = { ...task.ref_image_names };
          for (const oldId of oldIds) {
            const newId =
              uploadMapping[oldId] || (newIds.includes(oldId) ? oldId : null);
            if (!newId) {
              delete updatedImageNames[oldId];
              continue;
            }
            if (updatedImageNames[oldId] && oldId !== newId) {
              updatedImageNames[newId] = updatedImageNames[oldId];
              delete updatedImageNames[oldId];
            }
          }
          task.ref_image_names = updatedImageNames;
        }
      }
      const unresolvedTaskRefs = (task.ref_file_ids || "")
        .split(",")
        .map((s) => s.trim())
        .filter((id) => id.startsWith("upload_"));
      if (unresolvedTaskRefs.length > 0) {
        sidebarLog(
          `${unresolvedTaskRefs.length} ref ch\u01B0a \u0111\u01B0\u1EE3c Flow x\xE1c nh\u1EADn; d\u1EEBng task \u0111\u1EC3 gi\u1EEF \u0111\xFAng \u1EA3nh \u0111\xE3 ch\u1ECDn`,
          "error",
        );
        throw Object.assign(new Error("REF_UPLOAD_FAILED"), {
          code: "REF_UPLOAD_FAILED",
        });
      }
      if (window.storageManager) {
        await window.storageManager.saveTask(task);
        const saved = await window.storageManager.getTask(task.task_id);
        log("Task ref_file_ids IN STORAGE after save:", saved?.ref_file_ids);
        if (saved?.ref_file_ids !== task.ref_file_ids) {
          log(
            "WARNING: Storage mismatch! task:",
            task.ref_file_ids,
            "stored:",
            saved?.ref_file_ids,
          );
        }
      }
    }
    if (!task.frame_1_file_id && task.frame_1_file_name) {
      task.frame_1_file_id = task.frame_1_file_name;
      log(
        "Smart Clone: reconstructed frame_1_file_id from file_name:",
        task.frame_1_file_name,
      );
    }
    if (!task.frame_2_file_id && task.frame_2_file_name) {
      task.frame_2_file_id = task.frame_2_file_name;
      log(
        "Smart Clone: reconstructed frame_2_file_id from file_name:",
        task.frame_2_file_name,
      );
    }
    if (task.frame_1_file_id && task.frame_1_file_id.startsWith("upload_")) {
      try {
        const result = await window.uploadPendingFiles(task.frame_1_file_id);
        if (!result || result.includes("upload_")) {
          throw new Error("Frame 1 upload failed");
        }
        task.frame_1_file_id = result;
        if (MediaRegistry.getFileName(result)) {
          task.frame_1_file_name = MediaRegistry.getFileName(result);
        }
        if (window.storageManager) await window.storageManager.saveTask(task);
      } catch (e) {
        console.error("[executeSingleTask] Frame 1 upload error:", e.message);
        sidebarLog?.("Frame upload th\u1EA5t b\u1EA1i: " + e.message, "error");
        throw Object.assign(new Error("Frame 1 upload failed"), {
          code: "REF_UPLOAD_FAILED",
        });
      }
    }
    if (task.frame_2_file_id && task.frame_2_file_id.startsWith("upload_")) {
      try {
        const result = await window.uploadPendingFiles(task.frame_2_file_id);
        if (!result || result.includes("upload_")) {
          throw new Error("Frame 2 upload failed");
        }
        task.frame_2_file_id = result;
        if (MediaRegistry.getFileName(result)) {
          task.frame_2_file_name = MediaRegistry.getFileName(result);
        }
        if (window.storageManager) await window.storageManager.saveTask(task);
      } catch (e) {
        console.error("[executeSingleTask] Frame 2 upload error:", e.message);
        sidebarLog?.("Frame upload th\u1EA5t b\u1EA1i: " + e.message, "error");
        throw Object.assign(new Error("Frame 2 upload failed"), {
          code: "REF_UPLOAD_FAILED",
        });
      }
    }
    if (task.frame_pairs && Array.isArray(task.frame_pairs)) {
      let framePairsChanged = false;
      for (const fp of task.frame_pairs) {
        if (fp.frame1 && fp.frame1.startsWith("upload_")) {
          const result = await window.uploadPendingFiles(fp.frame1);
          if (!result || result.includes("upload_"))
            throw Object.assign(new Error("Frame 1 upload failed"), {
              code: "REF_UPLOAD_FAILED",
            });
          fp.frame1 = result;
          if (MediaRegistry.getFileName(result))
            fp.frame1FileName = MediaRegistry.getFileName(result);
          framePairsChanged = true;
        }
        if (fp.frame2 && fp.frame2.startsWith("upload_")) {
          const result = await window.uploadPendingFiles(fp.frame2);
          if (!result || result.includes("upload_"))
            throw Object.assign(new Error("Frame 2 upload failed"), {
              code: "REF_UPLOAD_FAILED",
            });
          fp.frame2 = result;
          if (MediaRegistry.getFileName(result))
            fp.frame2FileName = MediaRegistry.getFileName(result);
          framePairsChanged = true;
        }
      }
      if (framePairsChanged && window.storageManager) {
        await window.storageManager.saveTask(task);
      }
    }
    let _taskFlowApiReady = false;
    window.MediaRegistry?.applyRefIdentityCorrection?.(
      task,
      task.ref_file_ids,
      task.ref_file_ids,
      void 0,
      { surface: "task:upload-ready" },
    );
    if (window.FlowApiAdapter?.isApiModeIntended?.() === true) {
      const apiHealth =
        await window.FlowApiAdapter.checkGenerationReady?.().catch(() => null);
      const uuidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const refIds = String(task.ref_file_ids || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const allRefsApiResolvable = refIds.every((id) => {
        const resolved = window.FlowApiAdapter?._resolveRefUuid?.(
          {
            refFileNames: task.ref_file_names || {},
            refThumbnails: task.ref_thumbnails || {},
          },
          id,
        );
        return (
          uuidPattern.test(String(resolved || "")) ||
          window.FlowApiAdapter?._isAsbMediaId?.(resolved) === true
        );
      });
      _taskFlowApiReady = apiHealth?.ready === true && allRefsApiResolvable;
      console.log("[TaskMediaIdentity] Flow ref preflight mode", {
        taskId: task.task_id,
        apiReady: _taskFlowApiReady,
        allRefsApiResolvable,
        reason: apiHealth?.reason || null,
      });
    }
    let _zoomArmedHere = false;
    if (!_taskFlowApiReady && window.MessageBridge?.sendToContentScript) {
      try {
        await window.MessageBridge.sendToContentScript("beginFlowZoomSession", {
          factor: 0.3,
        });
        _zoomArmedHere = true;
      } catch (e) {}
    }
    const _endZoomIfArmed = () => {
      if (!_zoomArmedHere) return;
      _zoomArmedHere = false;
      try {
        window.MessageBridge?.sendToContentScript?.(
          "endFlowZoomSession",
          {},
        )?.catch?.(() => {});
      } catch (_) {}
    };
    if (
      task.ref_file_ids &&
      !task.ref_file_ids.includes("upload_") &&
      !_taskFlowApiReady
    ) {
      const originalRefFileIds = task.ref_file_ids;
      const thumbMap = task.ref_thumbnails || {};
      const fnMap = task.ref_file_names || {};
      if (
        typeof window.correctFileIds === "function" &&
        (Object.keys(thumbMap).length > 0 || Object.keys(fnMap).length > 0)
      ) {
        const beforeCorrectIds = (task.ref_file_ids || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const { correctedIds, changed, mediaMetadata } =
          await window.correctFileIds(task.ref_file_ids, thumbMap, fnMap);
        window.MediaRegistry?.applyRefIdentityCorrection?.(
          task,
          task.ref_file_ids,
          correctedIds,
          mediaMetadata,
          { surface: "task:single" },
        );
        if (changed) {
          log(
            "Ref IDs corrected via file_name/thumbnail matching:",
            task.ref_file_ids,
            "->",
            correctedIds,
          );
          const afterCorrectIds = correctedIds
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          if (task.ref_image_names) {
            const updatedNames = { ...task.ref_image_names };
            for (let ci = 0; ci < beforeCorrectIds.length; ci++) {
              const oldId = beforeCorrectIds[ci];
              const newId = afterCorrectIds[ci] || oldId;
              if (updatedNames[oldId] && oldId !== newId) {
                updatedNames[newId] = updatedNames[oldId];
                delete updatedNames[oldId];
              }
            }
            task.ref_image_names = updatedNames;
          }
          task.ref_file_ids = correctedIds;
        }
      }
      log("Checking tiles for ref_file_ids:", task.ref_file_ids);
      const beforeIds = (task.ref_file_ids || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const updated = await window.reuploadMissingFiles(
        task.ref_file_ids,
        task.ref_thumbnails || {},
        originalRefFileIds,
        task.ref_file_names || {},
        { surface: "task" },
      );
      if (updated !== task.ref_file_ids) {
        log(
          "Ref IDs changed after reupload:",
          task.ref_file_ids,
          "->",
          updated,
        );
        const beforeReupIds = beforeIds;
        const afterReupIds = (updated || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (task.ref_image_names) {
          const updatedNames = { ...task.ref_image_names };
          for (let ri = 0; ri < beforeReupIds.length; ri++) {
            const oldId = beforeReupIds[ri];
            const newId = afterReupIds[ri] || oldId;
            if (updatedNames[oldId] && oldId !== newId) {
              updatedNames[newId] = updatedNames[oldId];
              delete updatedNames[oldId];
            }
          }
          task.ref_image_names = updatedNames;
        }
        const updatedFileNames = { ...(task.ref_file_names || {}) };
        const updatedThumbs = { ...(task.ref_thumbnails || {}) };
        for (let ri = 0; ri < beforeReupIds.length; ri++) {
          const oldId = beforeReupIds[ri];
          const newId = afterReupIds[ri] || oldId;
          if (oldId !== newId) {
            if (updatedFileNames[oldId]) {
              updatedFileNames[newId] = updatedFileNames[oldId];
              delete updatedFileNames[oldId];
            }
            if (updatedThumbs[oldId]) {
              updatedThumbs[newId] = updatedThumbs[oldId];
              delete updatedThumbs[oldId];
            }
          }
        }
        for (const newId of afterReupIds) {
          if (MediaRegistry.getFileName(newId))
            updatedFileNames[newId] = MediaRegistry.getFileName(newId);
          if (MediaRegistry.getThumb(newId))
            updatedThumbs[newId] = MediaRegistry.getThumb(newId);
        }
        task.ref_file_names = updatedFileNames;
        task.ref_thumbnails = updatedThumbs;
        task.ref_file_ids = updated;
        if (window.storageManager) await window.storageManager.saveTask(task);
      }
      const afterIds = (updated || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const droppedCount = beforeIds.length - afterIds.length;
      if (droppedCount > 0) {
        const warnMsg =
          window.I18n?.t("app.refDropped", {
            dropped: droppedCount,
            remaining: afterIds.length,
          }) ||
          `${droppedCount} reference image(s) not found and were skipped. Task runs with ${afterIds.length} remaining image(s).`;
        if (typeof sendLog === "function") sendLog(warnMsg, "warn");
        log(warnMsg);
        if (afterIds.length === 0 && beforeIds.length > 0) {
          const shouldContinue = await window.customDialog?.confirm?.(
            window.I18n?.t("app.allRefsLost") ||
              "All reference images not found and cannot be recovered. Continue running the task without reference images?",
            {
              title:
                window.I18n?.t("app.missingRefs") || "Missing reference images",
              type: "warning",
            },
          );
          if (!shouldContinue) {
            if (typeof sendLog === "function")
              sendLog(
                window.I18n?.t("app.taskCancelledMissingRef") ||
                  "Task cancelled due to missing reference images.",
                "warn",
              );
            _endZoomIfArmed();
            return;
          }
        }
      }
    }
    if (window.storageManager) {
      await window.storageManager.updateTaskStatus(task.task_id, "running");
    }
    if (window.eventBus) {
      window.eventBus.emit("task:status_changed", {
        taskId: task.task_id,
        status: "running",
      });
    }
    const tileTimeout = window.RetryHelper?.getConfig()?.tileTimeout || 18e4;
    sidebarLog(
      window.I18n?.t("app.startingTask", { name: task.task_name }) ||
        `Starting task "${task.task_name}"...`,
      "info",
    );
    window.UsageSync?.trackEvent("task_start", {
      task_id: task.task_id,
      multi_prompt: !!task.multi_prompt,
    });
    try {
      if (window._taskShouldStop || window._taskBatchStopped) {
        if (window.storageManager) {
          await window.storageManager.updateTaskStatus(task.task_id, "pending");
        }
        if (window.eventBus) {
          window.eventBus.emit("task:status_changed", {
            taskId: task.task_id,
            status: "pending",
          });
        }
        signalSubmitted();
        throw new Error("TASK_STOPPED");
      }
      const afS = window._afSettings || {};
      const genType = task.media_type || afS.defaultGenType || "Image";
      const ratio = task.ratio || afS.defaultRatio || "9:16";
      const isVideo = genType === "Video";
      const model =
        task.model ||
        (isVideo ? afS.defaultVideoModel : afS.defaultImageModel) ||
        (await window.ModelRegistry.getDefaultAsync(
          "flow",
          isVideo ? "video" : "image",
        ));
      if (!model)
        throw new window.ConfigRequiredError("models_flow", "data_missing");
      if (window._taskShouldStop || window._taskBatchStopped)
        throw new Error("TASK_STOPPED");
      const isVideoFrames = isVideo && task.video_input_type === "Frames";
      const rawPrompts =
        task.multi_prompt && task.prompts?.length > 1
          ? task.prompts
          : [task.prompt];
      const quantity = task.quantity || 1;
      const refMode = task.ref_image_mode || "all";
      const prompts = rawPrompts;
      let fileIds = [];
      let frameFileIds = null;
      if (isVideoFrames) {
        if (
          task.frame_pairs &&
          Array.isArray(task.frame_pairs) &&
          task.frame_pairs.length > 0
        ) {
          frameFileIds = task.frame_pairs.map((fp) => ({
            frame1: fp.frame1 || "",
            frame2: fp.frame2 || "",
          }));
        } else {
          frameFileIds = {
            frame1: task.frame_1_file_id || "",
            frame2: task.frame_2_file_id || "",
          };
        }
      } else if (task.ref_file_ids) {
        fileIds = _uniqueTaskRefIds(task.ref_file_ids, task);
      }
      if (refMode === "none") {
        fileIds = [];
      }
      if (window.MediaRegistry && fileIds.length > 0) {
        if (!task.ref_file_names) task.ref_file_names = {};
        if (!task.ref_thumbnails) task.ref_thumbnails = {};
        for (const fid of fileIds) {
          if (!task.ref_file_names[fid]) {
            const fn = MediaRegistry.getFileName(fid);
            if (fn) task.ref_file_names[fid] = fn;
          }
          if (!task.ref_thumbnails[fid]) {
            const tu = MediaRegistry.getThumb(fid);
            if (tu) task.ref_thumbnails[fid] = tu;
          }
        }
      }
      log(`--- Task: "${task.task_name}" ---`);
      log(
        window.I18n?.t("app.taskSettings", { genType, ratio, model }) ||
          `Settings: ${genType}, ${ratio}, ${model}`,
      );
      if (prompts.length > 1) log(`Multi-prompt: ${prompts.length} prompts`);
      if (fileIds.length > 0) log(`Ref images: ${fileIds.length} file(s)`);
      if (window.PromptQueue && PromptQueue.isEnabled()) {
        signalSubmitted();
        let pipelineRefFileIds = fileIds;
        let refImageMode = refMode;
        if (isVideoFrames && frameFileIds) {
          if (Array.isArray(frameFileIds)) {
            const frameIdSet = new Set();
            frameFileIds.forEach((fp) => {
              if (fp?.frame1) frameIdSet.add(fp.frame1);
              if (fp?.frame2) frameIdSet.add(fp.frame2);
            });
            pipelineRefFileIds = [...frameIdSet];
            refImageMode = "sequential";
          } else {
            const frameIds = [];
            if (frameFileIds.frame1) frameIds.push(frameFileIds.frame1);
            if (frameFileIds.frame2) frameIds.push(frameFileIds.frame2);
            pipelineRefFileIds = frameIds;
          }
        }
        let refFileIdsPerPrompt = null;
        let taskMentionData = null;
        if (isVideoFrames && Array.isArray(frameFileIds)) {
          refFileIdsPerPrompt = frameFileIds.map((fp) => {
            const ids = [];
            if (fp?.frame1) ids.push(fp.frame1);
            if (fp?.frame2) ids.push(fp.frame2);
            return ids;
          });
        } else if (refMode === "sequential" && fileIds.length > 0) {
          refFileIdsPerPrompt = rawPrompts.map((_, idx) =>
            window.RefImageAssignment.select(
              fileIds,
              idx,
              task.ref_images_per_prompt,
            ),
          );
        } else if (
          refMode === "mention" &&
          fileIds.length > 0 &&
          task.ref_image_names
        ) {
          const nameToFileId = {};
          for (const [fid, representative] of _taskRefAliasMap(task, fileIds)) {
            const name = task.ref_image_names[fid];
            if (name) nameToFileId[name.toLowerCase()] = representative;
          }
          refFileIdsPerPrompt = rawPrompts.map((prompt) => {
            const mentions = _parseTaskMentionNames(prompt);
            const ids = [];
            for (const name of mentions) {
              if (nameToFileId[name] && !ids.includes(nameToFileId[name])) {
                ids.push(nameToFileId[name]);
              }
            }
            return ids;
          });
          const fileNameMap = task.ref_file_names || {};
          taskMentionData = rawPrompts.map((_, i) => ({
            refImages: (refFileIdsPerPrompt[i] || []).map((fid) => ({
              file_id: fid,
              file_name: fileNameMap[fid] || null,
            })),
          }));
        }
        let _taskFlowDuration = isVideo ? task.video_duration || null : null;
        const _taskRefThumbsAll = task.ref_thumbnails || {};
        const _taskRefVideoIds = (
          Array.isArray(pipelineRefFileIds) ? pipelineRefFileIds : []
        ).filter((id) => {
          const rt = _taskRefThumbsAll[id];
          return !!(
            rt &&
            typeof rt === "object" &&
            (rt.type === "video" || rt.video_url)
          );
        });
        const _taskHasRefVideo = _taskRefVideoIds.length > 0;
        if (
          isVideo &&
          _taskFlowDuration &&
          Array.isArray(pipelineRefFileIds) &&
          pipelineRefFileIds.length > 0
        ) {
          const _taskFlowAdapter = window.ProviderRegistry?.get?.("flow");
          const _taskForced = _taskFlowAdapter?.getDurationOverride?.({
            modelValue: model,
            hasRef: true,
            hasRefVideo: _taskHasRefVideo,
            inputType: task.video_input_type || "Ingredients",
          });
          if (_taskForced) _taskFlowDuration = _taskForced;
        }
        const _taskRefFileNames = { ...(task.ref_file_names || {}) };
        for (const [fid, media] of Object.entries(task.ref_thumbnails || {})) {
          if (media && typeof media === "object" && media.media_uuid) {
            _taskRefFileNames[fid] = media.media_uuid;
          }
        }
        for (const fid of pipelineRefFileIds || []) {
          if (!_taskRefFileNames[fid] && window.GenTab?.fileNameCache?.[fid]) {
            _taskRefFileNames[fid] = window.GenTab.fileNameCache[fid];
          }
        }
        if (Array.isArray(refFileIdsPerPrompt)) {
          for (const arr of refFileIdsPerPrompt) {
            for (const fid of arr || []) {
              if (
                !_taskRefFileNames[fid] &&
                window.GenTab?.fileNameCache?.[fid]
              ) {
                _taskRefFileNames[fid] = window.GenTab.fileNameCache[fid];
              }
            }
          }
        }
        const result = await PromptQueue.getInstance().submitJob({
          owner: "task",
          label: `Task: ${task.task_name || task.task_id}`,
          prompts,
          settings: {
            genType,
            ratio,
            model,
            isFrames: !!frameFileIds,
            quantity,
            flowVideoDuration: _taskFlowDuration,
            flowVideoResolution:
              genType === "Video"
                ? window.ModelRegistry?.getGenerationResolutionValue?.(
                    "flow",
                    model,
                    task.video_resolution,
                  )
                : null,
            refVideoIds: _taskRefVideoIds,
          },
          refFileIds: pipelineRefFileIds,
          refFileNames: _taskRefFileNames,
          refThumbnails: task.ref_thumbnails || {},
          refImageMode: isVideoFrames
            ? Array.isArray(frameFileIds)
              ? "sequential"
              : "all"
            : refMode,
          refFileIdsPerPrompt,
          mentionData: taskMentionData,
          autoDownload:
            (window.featureGate?.canUse("auto_download") ?? false) &&
            !!task.auto_download,
          downloadResolution: task.download_resolution || null,
          videoDownloadResolution: task.video_download_resolution || null,
          taskName: task.task_name || null,
          taskId: task.task_id || task.id,
          voice:
            !isVideoFrames && task.voice_slug && task.voice_search_value
              ? { slug: task.voice_slug, search_value: task.voice_search_value }
              : null,
          character:
            !isVideoFrames && window.CharacterRegistry.payload(task)
              ? window.CharacterRegistry.payload(task)
              : null,
          abortSignal: options.abortSignal,
          _executionToken: options._executionToken || null,
        });
        const pipelineStatus = result.stopped
          ? "pending"
          : (Number(result.completed) || 0) > 0
            ? "completed"
            : "failed";
        if (window.storageManager) {
          await window.storageManager.updateTaskStatus(
            task.task_id,
            pipelineStatus,
          );
        }
        if (window.eventBus) {
          window.eventBus.emit("task:status_changed", {
            taskId: task.task_id,
            status: pipelineStatus,
          });
        }
        return result;
      }
      let preTileIds = [];
      if (window.MessageBridge) {
        try {
          await window.MessageBridge.stabilizeFlowResultViewport();
          const resp = await window.MessageBridge.getCurrentTileIds();
          preTileIds = resp?.tileIds || [];
        } catch (e) {}
      }
      let runResult = null;
      if (window.MessageBridge) {
        try {
          const state = await window.MessageBridge.getRunningState();
          sidebarLog(
            `Content script state: isRunning=${state?.isRunning}, shouldStop=${state?.shouldStop}`,
            "info",
          );
          if (state?.isRunning) {
            sidebarLog("Content script stuck, forcing stop...", "warn");
            await window.MessageBridge.stopExecution();
            await new Promise((r) => setTimeout(r, 1e3));
          }
        } catch (e) {
          sidebarLog(
            window.I18n?.t("app.cannotConnectContent", {
              message: e.message,
            }) || `Could not connect to the content script: ${e.message}`,
            "error",
          );
          sidebarLog(
            window.I18n?.t("app.refreshFlowTab") ||
              "Try refreshing the Google Flow tab and run again.",
            "warn",
          );
          signalSubmitted();
          throw e;
        }
        sidebarLog(
          window.I18n?.t("app.sendingPrompts", {
            count: prompts.length,
            genType,
            ratio,
            model,
          }) ||
            `Sending ${prompts.length} prompt(s) to Google Flow... (${genType}, ${ratio}, ${model})`,
          "info",
        );
        let refPerPrompt = refMode === "sequential";
        let refFileIdsPerPrompt = null;
        let legacyMentionData = null;
        let legacyRefMode = refMode;
        if (isVideoFrames && Array.isArray(frameFileIds)) {
          refPerPrompt = true;
          legacyRefMode = "sequential";
          refFileIdsPerPrompt = frameFileIds.map((fp) => {
            const ids = [];
            if (fp?.frame1) ids.push(fp.frame1);
            if (fp?.frame2) ids.push(fp.frame2);
            return ids;
          });
        } else if (refMode === "sequential" && fileIds.length > 0) {
          refFileIdsPerPrompt = rawPrompts.map((_, idx) =>
            window.RefImageAssignment.select(
              fileIds,
              idx,
              task.ref_images_per_prompt,
            ),
          );
        } else if (
          refMode === "mention" &&
          fileIds.length > 0 &&
          task.ref_image_names
        ) {
          const nameToFileId = {};
          for (const [fid, representative] of _taskRefAliasMap(task, fileIds)) {
            const name = task.ref_image_names[fid];
            if (name) nameToFileId[name.toLowerCase()] = representative;
          }
          const fileNameMap2 = task.ref_file_names || {};
          legacyMentionData = rawPrompts.map((prompt) => {
            const mentions = _parseTaskMentionNames(prompt);
            const refImages = [];
            const seen = new Set();
            for (const name of mentions) {
              const fid = nameToFileId[name];
              if (fid && !seen.has(fid)) {
                seen.add(fid);
                refImages.push({
                  file_id: fid,
                  file_name: fileNameMap2[fid] || null,
                  name,
                });
              }
            }
            return { refImages };
          });
        }
        runResult = await window.MessageBridge.runAutoPrompt({
          prompts,
          delayBetweenMs:
            (window.ExecutionConfig?.safeGetDelayBetweenPromptsSec?.() ?? 5) *
            1e3,
          inputTimeoutMs:
            window.storageSettings?.getSettings()?.inputTimeout || 1200,
          fileIds,
          fileNameMap: task.ref_file_names || {},
          genType,
          aspectRatio: ratio,
          modelName: model,
          frameFileIds,
          isFrames: isVideoFrames,
          noTileWait: isParallel,
          quantity,
          autoDownload:
            (window.featureGate?.canUse("auto_download") ?? false) &&
            !!task.auto_download,
          downloadResolution: task.download_resolution || "1k",
          videoDownloadResolution: task.video_download_resolution || "720p",
          flowVideoDuration:
            genType === "Video" ? task.video_duration || null : null,
          flowVideoResolution:
            genType === "Video"
              ? window.ModelRegistry?.getGenerationResolutionValue?.(
                  "flow",
                  model,
                  task.video_resolution,
                )
              : null,
          refImageMode: legacyRefMode,
          refPerPrompt,
          refFileIdsPerPrompt,
          mentionData: legacyMentionData,
          taskName: task.task_name || null,
          voice:
            !isVideoFrames && task.voice_slug && task.voice_search_value
              ? { slug: task.voice_slug, search_value: task.voice_search_value }
              : null,
          character:
            !isVideoFrames && window.CharacterRegistry.payload(task)
              ? window.CharacterRegistry.payload(task)
              : null,
        });
        sidebarLog(
          `runAutoPrompt result: ${JSON.stringify(runResult || "undefined")}`,
          "info",
        );
        if (runResult?.blocked) {
          signalSubmitted();
          throw new Error(
            window.I18n?.t("app.flowBusyRetry") ||
              "Google Flow is busy processing. Try stopping and running again.",
          );
        }
      } else if (
        typeof applySettings === "function" &&
        typeof runAutoPrompt === "function"
      ) {
        let refFileIdsPerPrompt2 = null;
        let legacyMentionData2 = null;
        let legacyRefMode2 = refMode;
        let legacyRefPerPrompt2 = refMode === "sequential";
        if (isVideoFrames && Array.isArray(frameFileIds)) {
          legacyRefPerPrompt2 = true;
          legacyRefMode2 = "sequential";
          refFileIdsPerPrompt2 = frameFileIds.map((fp) => {
            const ids = [];
            if (fp?.frame1) ids.push(fp.frame1);
            if (fp?.frame2) ids.push(fp.frame2);
            return ids;
          });
        } else if (refMode === "sequential" && fileIds.length > 0) {
          refFileIdsPerPrompt2 = rawPrompts.map((_, idx) =>
            window.RefImageAssignment.select(
              fileIds,
              idx,
              task.ref_images_per_prompt,
            ),
          );
        } else if (
          refMode === "mention" &&
          fileIds.length > 0 &&
          task.ref_image_names
        ) {
          const nameToFid2 = {};
          for (const [fid, representative] of _taskRefAliasMap(task, fileIds)) {
            const name = task.ref_image_names[fid];
            if (name) nameToFid2[name.toLowerCase()] = representative;
          }
          const fnMap2 = task.ref_file_names || {};
          legacyMentionData2 = rawPrompts.map((prompt) => {
            const mentions = _parseTaskMentionNames(prompt);
            const refImages = [];
            const seen = new Set();
            for (const name of mentions) {
              const fid = nameToFid2[name];
              if (fid && !seen.has(fid)) {
                seen.add(fid);
                refImages.push({
                  file_id: fid,
                  file_name: fnMap2[fid] || null,
                  name,
                });
              }
            }
            return { refImages };
          });
        }
        runResult = await runAutoPrompt({
          prompts,
          delayBetweenMs:
            (window.ExecutionConfig?.safeGetDelayBetweenPromptsSec?.() ?? 5) *
            1e3,
          inputTimeoutMs:
            window.storageSettings?.getSettings()?.inputTimeout || 1200,
          fileIds,
          fileNameMap: task.ref_file_names || {},
          genType,
          aspectRatio: ratio,
          modelName: model,
          frameFileIds,
          isFrames: isVideoFrames,
          noTileWait: isParallel,
          quantity,
          autoDownload:
            (window.featureGate?.canUse("auto_download") ?? false) &&
            !!task.auto_download,
          downloadResolution: task.download_resolution || "1k",
          videoDownloadResolution: task.video_download_resolution || "720p",
          flowVideoDuration:
            genType === "Video" ? task.video_duration || null : null,
          flowVideoResolution:
            genType === "Video"
              ? window.ModelRegistry?.getGenerationResolutionValue?.(
                  "flow",
                  model,
                  task.video_resolution,
                )
              : null,
          refImageMode: legacyRefMode2,
          refPerPrompt: legacyRefPerPrompt2,
          refFileIdsPerPrompt: refFileIdsPerPrompt2,
          mentionData: legacyMentionData2,
          taskName: task.task_name || null,
          voice:
            !isVideoFrames && task.voice_slug && task.voice_search_value
              ? { slug: task.voice_slug, search_value: task.voice_search_value }
              : null,
          character:
            !isVideoFrames && window.CharacterRegistry.payload(task)
              ? window.CharacterRegistry.payload(task)
              : null,
        });
      } else {
        signalSubmitted();
        throw new Error(
          window.I18n?.t("app.cannotExecuteTask") ||
            "Cannot execute task: missing connection to Google Flow",
        );
      }
      log("runAutoPrompt ho\xE0n t\u1EA5t.");
      signalSubmitted();
      if (window._taskShouldStop || window._taskBatchStopped) {
        const partialTiles = runResult?.resultTileIds || [];
        if (partialTiles.length > 0 && window.storageManager) {
          try {
            const freshTask = await window.storageManager.getTask(task.task_id);
            if (freshTask) {
              const existingIds = (freshTask.result_file_ids || "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              const mergedIds = [...new Set([...existingIds, ...partialTiles])];
              freshTask.result_file_ids = mergedIds.join(", ");
              freshTask.status = "pending";
              await window.storageManager.saveTask(freshTask);
              console.log(
                "[executeSingleTask] Flow partial save:",
                partialTiles.length,
                "results",
              );
            }
          } catch (partialErr) {
            console.warn(
              "[executeSingleTask] Flow partial save failed:",
              partialErr.message,
            );
          }
        } else if (window.storageManager) {
          await window.storageManager.updateTaskStatus(task.task_id, "pending");
        }
        if (window.eventBus) {
          window.eventBus.emit("task:status_changed", {
            taskId: task.task_id,
            status: "pending",
          });
        }
        throw new Error("TASK_STOPPED");
      }
      let pureNewTiles = runResult?.resultTileIds || [];
      let capturedThumbnails = {};
      if (pureNewTiles.length === 0 && window.MessageBridge) {
        const baselineTileIds = runResult?.preTileIds || preTileIds;
        const baselineFileNames = runResult?.preFileNames || null;
        if (isParallel) {
          sidebarLog(
            `Task "${task.task_name}": waiting for tile results (baseline: ${baselineTileIds.length} tiles)...`,
            "info",
          );
          try {
            const tileResult = await window.MessageBridge.waitForNewTiles(
              baselineTileIds,
              tileTimeout,
              {
                captureFileNames: true,
                preFileNames: baselineFileNames,
                expectedMediaType: genType,
              },
            );
            const newTiles = tileResult?.tiles || [];
            capturedThumbnails = tileResult?.thumbnails || {};
            if (newTiles.length > 0) {
              const actualRefIds2 = runResult?.uploadedFileIds || fileIds;
              const refIdSet = new Set(actualRefIds2);
              let candidates = newTiles.filter((id) => !refIdSet.has(id));
              if (
                tileResult?.failed &&
                candidates.length > 0 &&
                window.MessageBridge
              ) {
                const successOnly = [];
                for (const tid of candidates) {
                  const info = capturedThumbnails[tid];
                  if (info?.thumbnail || info?.file_name) {
                    successOnly.push(tid);
                  }
                }
                if (successOnly.length < candidates.length) {
                  const failCount = candidates.length - successOnly.length;
                  sidebarLog(
                    window.I18n?.t("app.taskPartialFail", {
                      name: task.task_name,
                      failed: failCount,
                      success: successOnly.length,
                    }) ||
                      `Task "${task.task_name}": ${failCount} images failed, ${successOnly.length} succeeded`,
                    "warn",
                  );
                }
                candidates = successOnly;
              }
              pureNewTiles = candidates;
              if (pureNewTiles.length > 0) {
                sidebarLog(
                  window.I18n?.t("app.taskNewResults", {
                    name: task.task_name,
                    count: pureNewTiles.length,
                  }) ||
                    `Task "${task.task_name}": ${pureNewTiles.length} new results`,
                  "success",
                );
              }
            }
          } catch (e) {}
        } else {
          try {
            const tileResult = await window.MessageBridge.waitForNewTiles(
              baselineTileIds,
              1e4,
              {
                captureFileNames: true,
                preFileNames: baselineFileNames,
                expectedMediaType: genType,
              },
            );
            const newTiles = tileResult?.tiles || [];
            capturedThumbnails = tileResult?.thumbnails || {};
            if (newTiles.length > 0) {
              const actualRefIds2 = runResult?.uploadedFileIds || fileIds;
              const refIdSet = new Set(actualRefIds2);
              pureNewTiles = newTiles.filter((id) => !refIdSet.has(id));
            }
          } catch (e) {}
        }
      }
      if (window._taskShouldStop || window._taskBatchStopped) {
        if (pureNewTiles.length > 0 && window.storageManager) {
          try {
            const freshTask = await window.storageManager.getTask(task.task_id);
            if (freshTask) {
              const existingIds = (freshTask.result_file_ids || "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              const mergedIds = [...new Set([...existingIds, ...pureNewTiles])];
              freshTask.result_file_ids = mergedIds.join(", ");
              if (Object.keys(capturedThumbnails).length > 0) {
                const thumbs = {};
                for (const tileId of pureNewTiles) {
                  const info = capturedThumbnails[tileId];
                  if (info?.thumbnail) {
                    thumbs[tileId] = {
                      thumbnail: info.thumbnail,
                      type:
                        info.type || (genType === "Video" ? "video" : "image"),
                      file_name: info.file_name || "",
                      ...(info.video_url && { video_url: info.video_url }),
                      ...(info.media_uuid && { media_uuid: info.media_uuid }),
                      ...(info.persistent_media_id && {
                        persistent_media_id: info.persistent_media_id,
                      }),
                      ...(info.identity_kind && {
                        identity_kind: info.identity_kind,
                      }),
                      ...(info.identity_durability && {
                        identity_durability: info.identity_durability,
                      }),
                    };
                  }
                }
                if (Object.keys(thumbs).length > 0) {
                  freshTask.result_thumbnails = {
                    ...(freshTask.result_thumbnails || {}),
                    ...thumbs,
                  };
                }
              }
              freshTask.status = "pending";
              await window.storageManager.saveTask(freshTask);
              console.log(
                "[executeSingleTask] Flow partial save (post-wait):",
                pureNewTiles.length,
                "results",
              );
            }
          } catch (partialErr) {
            console.warn(
              "[executeSingleTask] Flow partial save failed:",
              partialErr.message,
            );
          }
        } else if (window.storageManager) {
          await window.storageManager.updateTaskStatus(task.task_id, "pending");
        }
        if (window.eventBus) {
          window.eventBus.emit("task:status_changed", {
            taskId: task.task_id,
            status: "pending",
          });
        }
        throw new Error("TASK_STOPPED");
      }
      const actualRefIds = runResult?.uploadedFileIds || fileIds;
      if (
        runResult?.uploadedFileIds &&
        actualRefIds.join(",") !== fileIds.join(",")
      ) {
        const oldRefIds = task.ref_file_ids;
        task.ref_file_ids = actualRefIds.join(", ");
        if (task.ref_thumbnails) {
          const oldArr = oldRefIds
            ? oldRefIds
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : fileIds;
          const newArr = actualRefIds;
          const migrated = {};
          for (let i = 0; i < oldArr.length; i++) {
            const thumb = task.ref_thumbnails[oldArr[i]];
            if (thumb && newArr[i]) migrated[newArr[i]] = thumb;
          }
          for (const [id, thumb] of Object.entries(task.ref_thumbnails)) {
            if (!migrated[id] && !oldArr.includes(id)) migrated[id] = thumb;
          }
          task.ref_thumbnails = migrated;
        }
        if (window.storageManager) {
          const freshTask = await window.storageManager.getTask(task.task_id);
          if (freshTask) {
            freshTask.ref_file_ids = task.ref_file_ids;
            freshTask.ref_thumbnails = task.ref_thumbnails;
            await window.storageManager.saveTask(freshTask);
          }
        }
      }
      if (pureNewTiles.length === 0 && !window._taskShouldStop) {
        sidebarLog(
          window.I18n?.t("app.taskFailedNoResults", { name: task.task_name }) ||
            `Task "${task.task_name}" failed: no new results`,
          "error",
        );
        throw new Error(
          window.I18n?.t("app.noNewResultsError") ||
            "No new results after submit - Google Flow may have encountered an error",
        );
      }
      const resultFileIds = pureNewTiles.join(", ");
      if (window.storageManager) {
        await window.storageManager.updateTaskStatus(
          task.task_id,
          "completed",
          resultFileIds,
        );
      }
      window.UsageSync?.trackEvent("task_complete", {
        task_id: task.task_id,
        success: true,
      });
      if (pureNewTiles.length > 0) {
        try {
          const thumbs = {};
          const fileNames = {};
          for (const tileId of pureNewTiles) {
            const info = capturedThumbnails[tileId];
            if (info?.thumbnail) {
              thumbs[tileId] = {
                thumbnail: info.thumbnail,
                type: info.type || (genType === "Video" ? "video" : "image"),
                file_name: info.file_name || "",
                ...(info.video_url && { video_url: info.video_url }),
                ...(info.media_uuid && { media_uuid: info.media_uuid }),
                ...(info.persistent_media_id && {
                  persistent_media_id: info.persistent_media_id,
                }),
                ...(info.identity_kind && {
                  identity_kind: info.identity_kind,
                }),
                ...(info.identity_durability && {
                  identity_durability: info.identity_durability,
                }),
              };
            }
            if (info?.file_name) fileNames[tileId] = info.file_name;
          }
          const missingTiles = pureNewTiles.filter(
            (id) => !thumbs[id] && !fileNames[id],
          );
          if (missingTiles.length > 0 && window.MessageBridge) {
            const scanResult = await MessageBridge.getThumbnailsByIds(
              missingTiles,
              { deep: false },
            );
            const results = scanResult?.results || {};
            for (const tileId of missingTiles) {
              const scanInfo = results[tileId];
              if (scanInfo?.thumbnail && !thumbs[tileId]) {
                thumbs[tileId] = {
                  thumbnail: scanInfo.thumbnail,
                  type:
                    scanInfo.type || (genType === "Video" ? "video" : "image"),
                  file_name: scanInfo.file_name || "",
                  ...(scanInfo.video_url && { video_url: scanInfo.video_url }),
                  ...(scanInfo.media_uuid && {
                    media_uuid: scanInfo.media_uuid,
                  }),
                  ...(scanInfo.persistent_media_id && {
                    persistent_media_id: scanInfo.persistent_media_id,
                  }),
                  ...(scanInfo.identity_kind && {
                    identity_kind: scanInfo.identity_kind,
                  }),
                  ...(scanInfo.identity_durability && {
                    identity_durability: scanInfo.identity_durability,
                  }),
                };
              }
              if (scanInfo?.file_name && !fileNames[tileId])
                fileNames[tileId] = scanInfo.file_name;
            }
          }
          if (
            (Object.keys(thumbs).length > 0 ||
              Object.keys(fileNames).length > 0) &&
            window.storageManager
          ) {
            const freshTask = await window.storageManager.getTask(task.task_id);
            if (freshTask) {
              freshTask.result_thumbnails = {
                ...(freshTask.result_thumbnails || {}),
                ...thumbs,
              };
              if (Object.keys(fileNames).length > 0) {
                freshTask.result_file_names = {
                  ...(freshTask.result_file_names || {}),
                  ...fileNames,
                };
              }
              await window.storageManager.saveTask(freshTask);
            }
          }
        } catch (e) {
          console.warn("[Task] Persist result thumbnails failed:", e.message);
        }
      }
      if (window.eventBus) {
        window.eventBus.emit("task:status_changed", {
          taskId: task.task_id,
          taskName: task.task_name,
          mediaType: task.media_type,
          status: "completed",
          resultFileIds,
          prompt: task.prompt || "",
          media_type: task.media_type || "image",
          model: model || "",
          ratio: ratio || "",
          prompt_count:
            task.multi_prompt && task.prompts?.length ? task.prompts.length : 1,
          quantity: parseInt(task.quantity) || 1,
          ref_file_ids: task.ref_file_ids || "",
          ref_thumbnails: task.ref_thumbnails || {},
          result_file_ids: resultFileIds || "",
          result_thumbnails: task.result_thumbnails
            ? Object.values(task.result_thumbnails)
            : [],
          result_file_names: task.result_file_names || {},
          task_id: task.task_id,
          provider: task.provider || "flow",
          project_id: task.project_id || window._currentProjectId || null,
          auto_download: !!task.auto_download,
        });
        window.eventBus.emit("task:complete", {
          taskId: task.task_id,
          taskName: task.task_name,
          resultCount: pureNewTiles.length,
        });
      }
    } catch (error) {
      signalSubmitted();
      _endZoomIfArmed();
      if (error.message === "TASK_STOPPED") {
        sidebarLog(
          window.I18n?.t("app.taskStopped", { name: task.task_name }) ||
            `Task "${task.task_name}" stopped.`,
          "warn",
        );
        return { success: 0, failed: 0, stopped: true };
      }
      console.error("[TaskExecutor] Task failed:", task.task_id, error);
      sidebarLog(
        window.I18n?.t("app.taskFailed", {
          name: task.task_name,
          error: error?.message,
        }) || `Task "${task.task_name}" failed: ${error?.message}`,
        "error",
      );
      window.UsageSync?.trackEvent("task_complete", {
        task_id: task.task_id,
        success: false,
      });
      if (window.storageManager) {
        await window.storageManager.updateTaskStatus(task.task_id, "failed");
      }
      if (window.eventBus) {
        window.eventBus.emit("task:status_changed", {
          taskId: task.task_id,
          status: "failed",
          error: error?.message,
        });
      }
      return { success: 0, failed: 1, stopped: false };
    }
  }
  function setupAuthUI() {
    const loginBtn = document.getElementById("loginBtn");
    const userMenu = document.getElementById("userMenu");
    const userMenuBtn = document.getElementById("userMenuBtn");
    const loginOverlay2 = document.getElementById("loginOverlay");
    const loginCloseBtn = document.getElementById("loginCloseBtn");
    const loginSubmitBtn = document.getElementById("loginSubmitBtn");
    const registerSubmitBtn = document.getElementById("registerSubmitBtn");
    const switchToRegister = document.getElementById("switchToRegister");
    const switchToLogin = document.getElementById("switchToLogin");
    const logoutBtn = document.getElementById("logoutBtn");
    const userDropdown = document.getElementById("userDropdown");
    function updateAuthUI() {
      const isLoggedIn = window.authManager?.isLoggedIn();
      if (loginBtn) loginBtn.classList.toggle("hidden", isLoggedIn);
      if (userMenu) userMenu.classList.toggle("hidden", !isLoggedIn);
      document
        .querySelectorAll(
          ".flow-tab-overlay-auth-actions, .project-select-account-actions",
        )
        .forEach((actions) => actions.classList.toggle("hidden", isLoggedIn));
      if (isLoggedIn) {
        const user = window.authManager.getUser();
        const nameEl = document.getElementById("userDisplayName");
        const planEl = document.getElementById("userDisplayPlan");
        if (nameEl) nameEl.textContent = user?.name || "User";
        if (planEl)
          planEl.textContent =
            window.featureGate?.plan?.name ||
            user?.plan_name ||
            user?.plan_slug ||
            "Free";
      }
      updateFooterUI();
      updatePremiumBadge();
      const settingsLogoutBtn = document.getElementById("settingsLogoutBtn");
      if (settingsLogoutBtn) {
        settingsLogoutBtn.classList.toggle("hidden", !isLoggedIn);
      }
      const settingsUpgradeBtn = document.getElementById("settingsUpgradeBtn");
      if (settingsUpgradeBtn) {
        const showUpgradeUI =
          window.SystemConfig?.getBool("show_upgrade_ui") !== false;
        settingsUpgradeBtn.classList.toggle(
          "hidden",
          !isLoggedIn || !showUpgradeUI,
        );
      }
    }
    function updateFooterUI() {
      const footerGuest = document.getElementById("footerGuest");
      const footerFree = document.getElementById("footerFree");
      const footerPremium = document.getElementById("footerPremium");
      const isLoggedIn = window.authManager?.isLoggedIn();
      const user = window.authManager?.getUser();
      const isPremium =
        user?.plan_slug === "unlimited" ||
        user?.plan_slug === "premium" ||
        user?.plan_slug === "autoflow-pro" ||
        user?.plan_slug === "autogrok-pro";
      footerGuest?.classList.add("hidden");
      footerFree?.classList.add("hidden");
      footerPremium?.classList.add("hidden");
      if (!isLoggedIn) {
        footerGuest?.classList.remove("hidden");
        updateTrialFooterBars();
      } else if (isPremium) {
        footerPremium?.classList.remove("hidden");
        updatePremiumFooterFeatures();
        const planNameEl = document.getElementById("footerProLabelText");
        const footerProLabel = document.getElementById("footerProLabel");
        if (planNameEl) {
          const planDisplayName =
            user?.plan_slug === "autoflow-pro" ||
            user?.plan_slug === "autogrok-pro"
              ? "Pro"
              : "Premium";
          planNameEl.innerHTML =
            planDisplayName === "Premium"
              ? '<span class="plan-label-full">Premium</span><span class="plan-label-compact">Pre</span>'
              : "Pro";
          planNameEl.setAttribute("aria-label", planDisplayName);
          if (footerProLabel) {
            footerProLabel.setAttribute(
              "title",
              `View ${planDisplayName} benefits`,
            );
          }
        }
      } else {
        footerFree?.classList.remove("hidden");
        updateFooterUsageBars();
      }
    }
    function updatePremiumFooterFeatures() {
      if (!window.featureGate) return;
      const genEl = document.getElementById("footerPremiumGen");
      if (genEl) {
        const globalQuota = window.featureGate.checkQuota("prompt_submit_max");
        const genQuota = window.featureGate.checkQuota("gen_run_max");
        const quota =
          globalQuota.limit && globalQuota.limit !== "unlimited"
            ? globalQuota
            : genQuota;
        const used = quota.used || 0;
        const limit =
          quota.limit === "unlimited" || quota.limit === -1
            ? "\u221E"
            : quota.limit || 500;
        const valueEl = genEl.querySelector(".footer-usage-value");
        if (valueEl) {
          if (limit === "\u221E") {
            valueEl.textContent = "\u221E";
            valueEl.classList.add("footer-usage-unlimited");
          } else {
            valueEl.textContent = `${used}/${limit}`;
            valueEl.classList.remove("footer-usage-unlimited");
          }
        }
        const tooltipText =
          window.I18n?.t("footer.promptTooltipDetail", { used, limit }) ||
          `${used}/${limit} ${window.I18n?.t("footer.promptTooltip") || "prompts today"}`;
        genEl.setAttribute("data-tooltip", tooltipText);
      }
      const tasksEl = document.getElementById("footerPremiumTasks");
      if (tasksEl) {
        const quota = window.featureGate.checkQuota("tasks_max");
        const used = quota.used || 0;
        const limit =
          quota.limit === "unlimited" ? "\u221E" : quota.limit || "\u221E";
        const valueEl = tasksEl.querySelector(".footer-usage-value");
        if (valueEl) {
          if (limit === "\u221E") {
            valueEl.textContent = "\u221E";
            valueEl.classList.add("footer-usage-unlimited");
          } else {
            valueEl.textContent = `${used}/${limit}`;
            valueEl.classList.remove("footer-usage-unlimited");
          }
        }
        const tooltipText =
          window.I18n?.t("footer.taskTooltipDetail", { used, limit }) ||
          `${used}/${limit} ${window.I18n?.t("footer.taskTooltip") || "tasks created"}`;
        tasksEl.setAttribute("data-tooltip", tooltipText);
      }
      const workflowsEl = document.getElementById("footerPremiumWorkflows");
      if (workflowsEl) {
        const quota = window.featureGate.checkQuota("workflows_max");
        const used = quota.used || 0;
        const limit =
          quota.limit === "unlimited" ? "\u221E" : quota.limit || "\u221E";
        const valueEl = workflowsEl.querySelector(".footer-usage-value");
        if (valueEl) {
          if (limit === "\u221E") {
            valueEl.textContent = "\u221E";
            valueEl.classList.add("footer-usage-unlimited");
          } else {
            valueEl.textContent = `${used}/${limit}`;
            valueEl.classList.remove("footer-usage-unlimited");
          }
        }
        const tooltipText =
          window.I18n?.t("footer.wfTooltipDetail", { used, limit }) ||
          `${used}/${limit} ${window.I18n?.t("footer.wfTooltip") || "workflows created"}`;
        workflowsEl.setAttribute("data-tooltip", tooltipText);
      }
      updateFooterFeatureStatus(
        "footerPremiumDownload",
        window.featureGate.canUse("auto_download"),
      );
      updateFooterFeatureStatus(
        "footerPremiumRetry",
        window.featureGate.canUse("retry_on_fail"),
      );
    }
    function updateFooterFeatureStatus(elementId, enabled) {
      const el = document.getElementById(elementId);
      if (!el) return;
      el.setAttribute("data-enabled", enabled);
      const statusEl = el.querySelector(".footer-feature-status");
      if (statusEl) {
        statusEl.className = `footer-feature-status footer-feature-status--${enabled ? "on" : "off"}`;
        statusEl.innerHTML = enabled
          ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>'
          : '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
      }
    }
    async function updateTrialFooterBars() {
      if (!window.featureGate) return;
      const config = window.featureGate.getConfig();
      const genEl = document.getElementById("footerTrialGen");
      if (genEl) {
        const globalQuota = window.featureGate.checkQuota("prompt_submit_max");
        const genQuota = window.featureGate.checkQuota("gen_run_max");
        const quota =
          globalQuota.limit && globalQuota.limit !== "unlimited"
            ? globalQuota
            : genQuota;
        const used = quota.used || 0;
        const limit =
          quota.limit === "unlimited" || quota.limit === -1
            ? "\u221E"
            : quota.limit || 20;
        const valueEl = genEl.querySelector(".footer-usage-value");
        if (valueEl) valueEl.textContent = `${used}/${limit}`;
        const tooltipText =
          window.I18n?.t("footer.promptTooltipDetail", { used, limit }) ||
          `${used}/${limit} ${window.I18n?.t("footer.promptTooltip") || "prompts today"}`;
        genEl.setAttribute("data-tooltip", tooltipText);
      }
      const tasksEl = document.getElementById("footerTrialTasks");
      if (tasksEl) {
        let used = 0;
        try {
          if (window.storageManager) {
            const tasks = await window.storageManager.getTasks();
            used = tasks?.length || 0;
          }
        } catch (e) {}
        const limit = config.tasks_max_create || 2;
        const valueEl = tasksEl.querySelector(".footer-usage-value");
        if (valueEl) valueEl.textContent = `${used}/${limit}`;
        const tooltipText =
          window.I18n?.t("footer.taskTooltipDetail", { used, limit }) ||
          `${used}/${limit} ${window.I18n?.t("footer.taskTooltip") || "tasks created"}`;
        tasksEl.setAttribute("data-tooltip", tooltipText);
      }
      const workflowsEl = document.getElementById("footerTrialWorkflows");
      if (workflowsEl) {
        let used = 0;
        try {
          if (window.storageManager) {
            const workflows = await window.storageManager.getWorkflows();
            used = workflows?.length || 0;
          }
        } catch (e) {}
        const limit = config.workflows_max_create || 1;
        const valueEl = workflowsEl.querySelector(".footer-usage-value");
        if (valueEl) valueEl.textContent = `${used}/${limit}`;
        const tooltipText =
          window.I18n?.t("footer.wfTooltipDetail", { used, limit }) ||
          `${used}/${limit} ${window.I18n?.t("footer.wfTooltip") || "workflows created"}`;
        workflowsEl.setAttribute("data-tooltip", tooltipText);
      }
      updateFooterFeatureStatus(
        "footerTrialAutoDownload",
        window.featureGate.canUse("auto_download"),
      );
      updateFooterFeatureStatus(
        "footerTrialRetryFail",
        window.featureGate.canUse("retry_on_fail"),
      );
      updateAutoDownloadToggles();
    }
    async function updateFooterUsageBars() {
      if (!window.featureGate) return;
      const today = new Date().toISOString().slice(0, 10);
      const currentUserId = window.authManager?.user?.id || null;
      const result = await new Promise((resolve) => {
        chrome.storage.local.get(["af_daily_stats"], (r) => resolve(r));
      });
      const stats = result.af_daily_stats || {};
      const isValidStats =
        stats._date === today && stats._user_id === currentUserId;
      const fg = window.featureGate;
      const config = fg?.getConfig?.() || {};
      const promptQuota = fg?.checkQuota?.("prompt_submit_max") || {};
      const localPromptTotal = isValidStats
        ? (stats.flow_prompt_total || 0) +
          (stats.chatgpt_prompt_total || 0) +
          (stats.gemini_prompt_total || 0) +
          (stats.grok_prompt_total || 0)
        : 0;
      const promptUsed =
        promptQuota.used !== void 0 && promptQuota.used > 0
          ? promptQuota.used
          : localPromptTotal;
      const taskUsed = isValidStats ? stats.task_run || 0 : 0;
      const wfUsed = isValidStats ? stats.workflow_run || 0 : 0;
      const promptsMax =
        promptQuota.limit === "unlimited"
          ? "\u221E"
          : (promptQuota.limit ?? 50);
      const tasksQuota = fg?.checkQuota?.("tasks_max") || {};
      const wfQuota = fg?.checkQuota?.("workflows_max") || {};
      const tasksMax =
        tasksQuota.limit === "unlimited"
          ? "\u221E"
          : (tasksQuota.limit ?? config.tasks_max_create ?? 10);
      const wfMax =
        wfQuota.limit === "unlimited"
          ? "\u221E"
          : (wfQuota.limit ?? config.workflows_max_create ?? 5);
      const tasksCreated = tasksQuota.used ?? 0;
      const wfCreated = wfQuota.used ?? 0;
      const updateQuotaEl = (elId, used, limit) => {
        const el = document.getElementById(elId);
        if (!el) return;
        const valueEl = el.querySelector(".footer-usage-value");
        if (valueEl) {
          const isUnlimited = limit === "\u221E";
          valueEl.textContent = isUnlimited ? "\u221E" : `${used}/${limit}`;
          valueEl.classList.toggle("footer-usage-unlimited", isUnlimited);
        }
        el.setAttribute("title", `${used}/${limit}`);
      };
      updateQuotaEl("footerUsageGen", promptUsed, promptsMax);
      updateQuotaEl("footerPremiumGen", promptUsed, promptsMax);
      updateQuotaEl("footerUsageTasks", tasksCreated, tasksMax);
      updateQuotaEl("footerPremiumTasks", tasksCreated, tasksMax);
      updateQuotaEl("footerUsageWorkflows", wfCreated, wfMax);
      updateQuotaEl("footerPremiumWorkflows", wfCreated, wfMax);
      updateFooterFeatureStatus(
        "footerAutoDownload",
        window.featureGate.canUse("auto_download"),
      );
      updateFooterFeatureStatus(
        "footerPremiumDownload",
        window.featureGate.canUse("auto_download"),
      );
      updateFooterFeatureStatus(
        "footerRetryFail",
        window.featureGate.canUse("retry_on_fail"),
      );
      updateFooterFeatureStatus(
        "footerPremiumRetry",
        window.featureGate.canUse("retry_on_fail"),
      );
      updateAutoDownloadToggles();
    }
    function updateAutoDownloadToggles() {
      const canUseAutoDownload =
        window.featureGate?.canUse("auto_download") ?? false;
      const genTabToggle = document.getElementById("genTabAutoDownload");
      if (genTabToggle) {
        _applyFeatureToggleState(
          genTabToggle,
          canUseAutoDownload,
          "auto_download",
        );
      }
      const toolbarToggle = document.getElementById("autoDownloadToggle");
      if (toolbarToggle) {
        _applyFeatureToggleState(
          toolbarToggle,
          canUseAutoDownload,
          "auto_download",
        );
      }
      if (window.GenTab?._syncDownloadVisibility) {
        window.GenTab._syncDownloadVisibility();
      }
    }
    function updateFeatureGatedToggles() {
      const canUseQueue =
        window.featureGate?.canUse("pipeline_queue_enabled") ?? false;
      const queueToggle = document.getElementById("queueEnabled");
      if (queueToggle) {
        _applyFeatureToggleState(
          queueToggle,
          canUseQueue,
          "pipeline_queue_enabled",
        );
      }
    }
    function _applyFeatureToggleState(toggle, canUse, featureKey) {
      const label =
        toggle.closest("label") || toggle.closest(".toolbar-toggle");
      if (!label) return;
      if (canUse) {
        toggle.disabled = false;
        label.classList.remove("feature-disabled");
        label.removeAttribute("title");
        (
          label.querySelector(".premium-crown") ||
          label.parentElement?.querySelector(".premium-crown")
        )?.remove();
      } else {
        toggle.disabled = true;
        toggle.checked = false;
        label.classList.add("feature-disabled");
        label.setAttribute(
          "title",
          window.I18n?.t("app.requiresPremium") ||
            "This feature requires a Premium plan",
        );
        _ensurePremiumCrown(label, featureKey);
      }
    }
    function _ensurePremiumCrown(label, featureKey) {
      const parent = label.parentElement || label;
      let crown = parent.querySelector(".premium-crown");
      const created = !crown;
      if (created) {
        crown = document.createElement("span");
        crown.className = "premium-crown";
      }
      crown.innerHTML =
        window.featureGate?.renderCrownHTML?.(featureKey) ||
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z"></path></svg> Premium';
      const lbl = window.featureGate?.getCrownLabel?.(featureKey);
      if (lbl) crown.title = lbl;
      if (!created) return;
      const toggleLabel = label.querySelector(".toggle-label");
      if (toggleLabel) {
        toggleLabel.insertAdjacentElement("afterend", crown);
      } else {
        label.insertAdjacentElement("afterend", crown);
      }
    }
    window.updateAutoDownloadToggles = updateAutoDownloadToggles;
    window.updateFeatureGatedToggles = updateFeatureGatedToggles;
    window._applyFeatureToggleState = _applyFeatureToggleState;
    window._ensurePremiumCrown = _ensurePremiumCrown;
    function updatePremiumBadge() {
      const crownEl = document.getElementById("headerPremiumCrown");
      const planBadge = document.getElementById("userPlanBadge");
      const isLoggedIn = window.authManager?.isLoggedIn();
      const user = window.authManager?.getUser();
      const isPremium =
        user?.plan_slug === "unlimited" ||
        user?.plan_slug === "premium" ||
        user?.plan_slug === "autoflow-pro" ||
        user?.plan_slug === "autogrok-pro";
      if (crownEl) {
        crownEl.classList.toggle("hidden", !isLoggedIn || !isPremium);
      }
      if (planBadge) {
        if (!isLoggedIn) {
          planBadge.classList.add("hidden");
        } else {
          planBadge.classList.remove("hidden");
          if (isPremium) {
            const planName =
              user?.plan_slug === "autoflow-pro" ||
              user?.plan_slug === "autogrok-pro"
                ? "Pro"
                : "Premium";
            planBadge.innerHTML =
              planName === "Premium"
                ? '<span class="plan-label-full">Premium</span><span class="plan-label-compact">Pre</span>'
                : "Pro";
            planBadge.insertAdjacentHTML(
              "afterbegin",
              `<svg class="tobyflow-user-plan-icon" aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z"/></svg>`,
            );
            planBadge.setAttribute("aria-label", planName);
            planBadge.setAttribute("data-plan", "pro");
          } else {
            planBadge.textContent = "Free";
            planBadge.setAttribute("aria-label", "Free");
            planBadge.setAttribute("data-plan", "free");
          }
        }
      }
    }
    if (loginBtn) {
      loginBtn.addEventListener("click", () => {
        if (loginOverlay2) loginOverlay2.classList.remove("hidden");
      });
    }
    if (loginCloseBtn) {
      loginCloseBtn.addEventListener("click", () => {
        if (loginOverlay2) loginOverlay2.classList.add("hidden");
      });
    }
    if (switchToRegister) {
      switchToRegister.addEventListener("click", (e) => {
        e.preventDefault();
        document.getElementById("loginForm")?.classList.add("hidden");
        document.getElementById("registerForm")?.classList.remove("hidden");
        document.getElementById("loginModalTitle").textContent =
          window.I18n?.t("auth.register") || "Register";
      });
    }
    if (switchToLogin) {
      switchToLogin.addEventListener("click", (e) => {
        e.preventDefault();
        document.getElementById("registerForm")?.classList.add("hidden");
        document.getElementById("loginForm")?.classList.remove("hidden");
        document.getElementById("loginModalTitle").textContent =
          window.I18n?.t("auth.login") || "Login";
      });
    }
    async function _showUnverifiedEmailDialog(email, password, errorEl) {
      const t = (key, fallback) => window.I18n?.t?.(key) || fallback;
      const ACTION = await new Promise((resolve) => {
        const buttons = [
          {
            label: t("common.cancel", "Cancel"),
            primary: false,
            action: () => resolve("cancel"),
          },
          {
            label: t("auth.deleteAccount", "Delete account"),
            primary: false,
            action: () => resolve("delete"),
          },
          {
            label: t("auth.changeEmail", "Change email"),
            primary: false,
            action: () => resolve("change"),
          },
          {
            label: t("auth.resendVerify", "Resend"),
            primary: true,
            action: () => resolve("resend"),
          },
        ];
        window.customDialog?.alert?.(
          t(
            "auth.emailNotVerifiedMsg",
            "Email not verified. Check your inbox (including spam) or choose an action below.",
          ),
          {
            title: t("auth.emailNotVerifiedTitle", "Email not verified"),
            type: "warning",
            buttons,
          },
        );
      });
      if (ACTION === "cancel") return;
      if (ACTION === "resend") {
        await window.authManager.resendVerificationByEmail(email);
        if (errorEl) {
          errorEl.textContent = t(
            "auth.verifyResent",
            "Verification email has been resent. Please check your inbox and login again.",
          );
          errorEl.classList.remove("hidden");
        }
        return;
      }
      if (ACTION === "change") {
        const newEmail = await window.customDialog?.prompt?.(
          t(
            "auth.changeEmailPrompt",
            "Enter new email (verification link will be sent to this address):",
          ),
          {
            title: t("auth.changeEmail", "Change email"),
            placeholder: t("auth.emailPlaceholder", "email@example.com"),
            confirmText: t("common.confirm", "Confirm"),
            cancelText: t("common.cancel", "Cancel"),
          },
        );
        if (!newEmail || !newEmail.trim()) return;
        await window.authManager.changeUnverifiedEmail(
          email,
          password,
          newEmail.trim(),
        );
        if (errorEl) {
          errorEl.textContent = t(
            "auth.changeEmailSuccess",
            "Email changed. Check the new inbox to verify.",
          );
          errorEl.classList.remove("hidden");
        }
        const loginEmailInput = document.getElementById("loginEmail");
        if (loginEmailInput) loginEmailInput.value = newEmail.trim();
        return;
      }
      if (ACTION === "delete") {
        const confirmed = await window.customDialog?.confirmDangerous?.(
          t(
            "auth.deleteAccountConfirm",
            "Permanently delete this account. The email will be released for re-registration. Cannot be undone.",
          ),
          {
            title: t("auth.deleteAccountTitle", "Delete account"),
            itemName: email,
            confirmText: t("auth.deleteAccount", "Delete account"),
            cancelText: t("common.cancel", "Cancel"),
          },
        );
        if (!confirmed) return;
        await window.authManager.deleteUnverifiedAccount(email, password);
        if (errorEl) {
          errorEl.textContent = t(
            "auth.deleteAccountSuccess",
            "Account deleted. You can register again with a different email.",
          );
          errorEl.classList.remove("hidden");
        }
        const loginEmailInput = document.getElementById("loginEmail");
        const loginPasswordInput = document.getElementById("loginPassword");
        if (loginEmailInput) loginEmailInput.value = "";
        if (loginPasswordInput) loginPasswordInput.value = "";
      }
    }
    async function _showRegisterVerifySentModal(email, mailSent) {
      const t = (key, fallback) => window.I18n?.t?.(key) || fallback;
      const messageKey = mailSent
        ? "auth.registerVerifySent"
        : "auth.registerVerifyMailDisabled";
      const messageFallback = mailSent
        ? `Email x\xE1c minh \u0111\xE3 g\u1EEDi t\u1EDBi ${email}. Vui l\xF2ng ki\u1EC3m tra h\u1ED9p th\u01B0 (c\u1EA3 spam) v\xE0 click link verify \u0111\u1EC3 k\xEDch ho\u1EA1t t\xE0i kho\u1EA3n.`
        : `T\xE0i kho\u1EA3n \u0111\xE3 t\u1EA1o nh\u01B0ng h\u1EC7 th\u1ED1ng g\u1EEDi mail \u0111ang t\u1EA1m t\u1EAFt. Li\xEAn h\u1EC7 admin \u0111\u1EC3 x\xE1c minh.`;
      const message = t(messageKey, messageFallback).replace("{email}", email);
      await window.customDialog?.alert?.(message, {
        title: t("auth.registerSuccess", "Registration successful"),
        type: mailSent ? "success" : "warning",
      });
    }
    function _switchToLoginTab(emailPrefill) {
      [
        "registerName",
        "registerEmail",
        "registerPassword",
        "registerPasswordConfirm",
      ].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });
      document.getElementById("registerForm")?.classList.add("hidden");
      document.getElementById("loginForm")?.classList.remove("hidden");
      const titleEl = document.getElementById("loginModalTitle");
      if (titleEl)
        titleEl.textContent = window.I18n?.t?.("auth.login") || "Sign in";
      const loginEmailInput = document.getElementById("loginEmail");
      const loginPassInput = document.getElementById("loginPassword");
      if (loginEmailInput) loginEmailInput.value = emailPrefill || "";
      if (loginPassInput) loginPassInput.value = "";
      setTimeout(() => loginPassInput?.focus(), 100);
    }
    if (loginSubmitBtn) {
      loginSubmitBtn.addEventListener("click", async () => {
        const email = document.getElementById("loginEmail")?.value?.trim();
        const password = document.getElementById("loginPassword")?.value;
        const errorEl = document.getElementById("loginError");
        if (!email || !password) {
          if (errorEl) {
            errorEl.textContent =
              window.I18n?.t("auth.enterEmailPassword") ||
              "Please enter email and password";
            errorEl.classList.remove("hidden");
          }
          return;
        }
        loginSubmitBtn.disabled = true;
        loginSubmitBtn.textContent =
          window.I18n?.t("msg.loggingIn") || "Logging in...";
        try {
          await window.authManager.login(email, password);
          if (loginOverlay2) loginOverlay2.classList.add("hidden");
          updateAuthUI();
          setupOnboarding();
          if (window.storageManager) {
            await window.storageManager.switchToApi();
          }
        } catch (e) {
          if (e.code === "EMAIL_NOT_VERIFIED") {
            const emailVerificationRequired =
              window.SystemConfig?.getBool("email_verification_required") !==
              false;
            if (!emailVerificationRequired) {
              if (errorEl) {
                errorEl.textContent =
                  window.I18n?.t("auth.emailVerifyDisabledButBlocked") ||
                  "Email not verified. Please contact admin or check your inbox to verify.";
                errorEl.classList.remove("hidden");
              }
            } else {
              try {
                await _showUnverifiedEmailDialog(email, password, errorEl);
              } catch (dialogErr) {
                if (errorEl) {
                  errorEl.textContent = dialogErr.message || "Action failed";
                  errorEl.classList.remove("hidden");
                }
              }
            }
          } else {
            if (errorEl) {
              errorEl.textContent =
                e.message ||
                window.I18n?.t("auth.loginFailed") ||
                "Login failed";
              errorEl.classList.remove("hidden");
            }
          }
        } finally {
          loginSubmitBtn.disabled = false;
          loginSubmitBtn.textContent = window.I18n?.t("auth.login") || "Login";
        }
      });
    }
    if (registerSubmitBtn) {
      registerSubmitBtn.addEventListener("click", async () => {
        const name = document.getElementById("registerName")?.value?.trim();
        const email = document.getElementById("registerEmail")?.value?.trim();
        const password = document.getElementById("registerPassword")?.value;
        const passwordConfirm = document.getElementById(
          "registerPasswordConfirm",
        )?.value;
        const errorEl = document.getElementById("registerError");
        if (!name || !email || !password || !passwordConfirm) {
          if (errorEl) {
            errorEl.textContent =
              window.I18n?.t("auth.fillAllFields") ||
              "Please fill in all fields";
            errorEl.classList.remove("hidden");
          }
          return;
        }
        if (password !== passwordConfirm) {
          if (errorEl) {
            errorEl.textContent =
              window.I18n?.t("auth.passwordMismatch") ||
              "Confirm password does not match";
            errorEl.classList.remove("hidden");
          }
          return;
        }
        registerSubmitBtn.disabled = true;
        registerSubmitBtn.textContent =
          window.I18n?.t("auth.registering") || "Registering...";
        try {
          const result = await window.authManager.register(
            name,
            email,
            password,
            passwordConfirm,
          );
          if (result?.verification_required) {
            await _showRegisterVerifySentModal(
              email,
              result.verification_sent === true,
            );
            _switchToLoginTab(email);
            return;
          }
          if (loginOverlay2) loginOverlay2.classList.add("hidden");
          updateAuthUI();
          setupOnboarding();
          if (window.storageManager) {
            await window.storageManager.switchToApi();
          }
        } catch (e) {
          if (errorEl) {
            errorEl.textContent =
              e.message ||
              window.I18n?.t("auth.registerFailed") ||
              "Registration failed";
            errorEl.classList.remove("hidden");
          }
        } finally {
          registerSubmitBtn.disabled = false;
          registerSubmitBtn.textContent =
            window.I18n?.t("auth.register") || "Register";
        }
      });
    }
    const forgotPasswordLink = document.getElementById("forgotPasswordLink");
    if (forgotPasswordLink) {
      forgotPasswordLink.addEventListener("click", async (e) => {
        e.preventDefault();
        const email = document.getElementById("loginEmail")?.value?.trim();
        if (!email) {
          if (window.customDialog) {
            window.customDialog.alert(
              window.I18n?.t("auth.enterEmailFirst") ||
                "Please enter your email before requesting password recovery.",
              { title: window.I18n?.t("auth.enterEmail") || "Enter email" },
            );
          }
          document.getElementById("loginEmail")?.focus();
          return;
        }
        forgotPasswordLink.style.pointerEvents = "none";
        forgotPasswordLink.textContent =
          window.I18n?.t("app.sending") || "Sending...";
        try {
          await window.authManager.forgotPassword(email);
          if (window.customDialog) {
            window.customDialog.alert(
              window.I18n?.t("auth.resetEmailSent") ||
                "Password recovery email sent. Please check your inbox.",
              {
                title: window.I18n?.t("common.success") || "Success",
                type: "success",
              },
            );
          }
        } catch (err) {
          if (window.customDialog) {
            window.customDialog.alert(
              err.message ||
                window.I18n?.t("auth.resetEmailFailed") ||
                "Unable to send recovery email. Please try again later.",
              {
                title: window.I18n?.t("common.error") || "Error",
                type: "error",
              },
            );
          }
        } finally {
          forgotPasswordLink.style.pointerEvents = "";
          forgotPasswordLink.textContent =
            window.I18n?.t("auth.forgotPassword") || "Forgot Password?";
        }
      });
    }
    const googleLoginBtn = document.getElementById("googleLoginBtn");
    const googleRegisterBtn = document.getElementById("googleRegisterBtn");
    let _googleAuthPending = false;
    async function handleGoogleAuth(e) {
      if (_googleAuthPending) return;
      _googleAuthPending = true;
      const btn = e?.currentTarget;
      const originalText = btn?.textContent;
      if (btn) {
        btn.disabled = true;
        btn.textContent = window.I18n?.t("auth.connecting") || "Connecting...";
      }
      try {
        await window.authManager.loginWithGoogle();
      } catch (err) {
        const isRateLimit =
          err?.code === "RATE_LIMITED" || err?.httpStatus === 429;
        if (isRateLimit) {
          const secs = Number(err?.retryAfter) || 30;
          const msg =
            window.I18n?.t?.("auth.rateLimitedToast", { seconds: secs }) ||
            `Too many requests, please try again in ${secs}s`;
          if (window.showNotification) {
            window.showNotification(msg, "warning", Math.min(secs * 1e3, 6e3));
          } else if (window.customDialog) {
            window.customDialog.alert(msg, {
              title: window.I18n?.t("common.notice") || "Notice",
              type: "warning",
            });
          }
        } else if (window.customDialog) {
          window.customDialog.alert(
            err.message ||
              window.I18n?.t("app.googleConnectError") ||
              "Cannot connect to Google. Please try again.",
            { title: window.I18n?.t("common.error") || "Error", type: "error" },
          );
        }
      } finally {
        setTimeout(() => {
          _googleAuthPending = false;
          if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
          }
        }, 3e3);
      }
    }
    if (googleLoginBtn) {
      googleLoginBtn.addEventListener("click", handleGoogleAuth);
    }
    if (googleRegisterBtn) {
      googleRegisterBtn.addEventListener("click", handleGoogleAuth);
    }
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.action !== "auth:oauthLogin" || !msg.token) return;
      (async () => {
        if (window.authManager?.token === msg.token) {
          console.log(
            "[TobyFlow] OAuth: Skip message handler, storage handler \u0111\xE3 x\u1EED l\xFD",
          );
          return;
        }
        window._oauthLoginProcessing = true;
        window.authManager.token = msg.token;
        window.authManager.user = msg.user || null;
        window.authManager._sessionInvalid = false;
        window.authManager._rateLimitedUntil = 0;
        if (loginOverlay2) loginOverlay2.classList.add("hidden");
        updateAuthUI();
        setupOnboarding();
        if (window.featureGate) {
          try {
            await window.featureGate.resetForLogin();
            console.log("[TobyFlow] OAuth: Entitlements refreshed");
          } catch (e) {
            console.warn(
              "[TobyFlow] OAuth: Kh\xF4ng th\u1EC3 refresh entitlements",
              e,
            );
          }
        }
        if (window.storageManager) {
          await window.storageManager.switchToApi();
        }
        window.authManager
          .fetchUser()
          .then(() => {
            updateAuthUI();
            checkEmailVerification();
          })
          .catch(() => {});
        if (window.eventBus) {
          window.eventBus.emit("auth:login", { user: msg.user });
        }
        window._oauthLoginProcessing = false;
      })();
    });
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.action === "payment:completed") {
        const upgradeOverlay = document.getElementById("upgradeOverlay");
        if (upgradeOverlay && !upgradeOverlay.classList.contains("hidden")) {
          upgradeOverlay.classList.add("hidden");
        }
        window._lastPermRefreshAt = 0;
        if (typeof refreshPermissions === "function") {
          refreshPermissions("plan_change").catch((e) => {
            console.warn(
              "[TobyFlow] refresh sau thanh to\xE1n th\u1EA5t b\u1EA1i:",
              e?.message,
            );
            window.featureGate?.refreshAsync?.();
          });
        } else if (window.featureGate) {
          window.featureGate.refreshAsync();
        }
        if (typeof showToast === "function") {
          showToast(
            window.I18n?.t("paymentNotify.successActivated") ||
              "Payment successful! Your plan has been activated.",
          );
        }
        if (typeof sendLog === "function") {
          sendLog(
            "[Payment] Thanh to\xE1n th\xE0nh c\xF4ng, order: " +
              (msg.orderId || ""),
            "info",
          );
        }
      }
      if (msg.action === "payment:cancelled") {
        if (typeof showToast === "function") {
          showToast(
            window.I18n?.t("paymentNotify.cancelled") || "Payment cancelled.",
          );
        }
      }
    });
    const emailVerifyBanner = document.getElementById("emailVerifyBanner");
    const emailVerifyResendBtn = document.getElementById(
      "emailVerifyResendBtn",
    );
    const emailVerifyCloseBtn = document.getElementById("emailVerifyCloseBtn");
    let _emailVerifyDismissed = false;
    function checkEmailVerification() {
      if (!emailVerifyBanner) return;
      const emailVerificationRequired =
        window.SystemConfig?.getBool("email_verification_required") !== false;
      if (!emailVerificationRequired) {
        emailVerifyBanner.classList.add("hidden");
        return;
      }
      const isLoggedIn = window.authManager?.isLoggedIn();
      const user = window.authManager?.getUser();
      if (
        isLoggedIn &&
        user &&
        user.email_verified === false &&
        !_emailVerifyDismissed
      ) {
        emailVerifyBanner.classList.remove("hidden");
      } else {
        emailVerifyBanner.classList.add("hidden");
      }
    }
    if (emailVerifyCloseBtn) {
      emailVerifyCloseBtn.addEventListener("click", () => {
        _emailVerifyDismissed = true;
        emailVerifyBanner?.classList.add("hidden");
      });
    }
    if (emailVerifyResendBtn) {
      emailVerifyResendBtn.addEventListener("click", async () => {
        emailVerifyResendBtn.disabled = true;
        emailVerifyResendBtn.textContent =
          window.I18n?.t("app.sending") || "Sending...";
        try {
          await window.authManager.resendVerification();
          emailVerifyResendBtn.textContent =
            window.I18n?.t("app.sent") || "Sent!";
          let countdown = 60;
          const interval = setInterval(() => {
            countdown--;
            if (countdown <= 0) {
              clearInterval(interval);
              emailVerifyResendBtn.textContent =
                window.I18n?.t("auth.resendEmail") || "Resend email";
              emailVerifyResendBtn.disabled = false;
            } else {
              emailVerifyResendBtn.textContent =
                window.I18n?.t("app.waitCountdown", { seconds: countdown }) ||
                `Wait ${countdown}s`;
            }
          }, 1e3);
        } catch (err) {
          emailVerifyResendBtn.textContent =
            window.I18n?.t("auth.resendEmail") || "Resend email";
          emailVerifyResendBtn.disabled = false;
          if (window.customDialog) {
            window.customDialog.alert(
              err.message ||
                window.I18n?.t("auth.resendEmailFailed") ||
                "Unable to send verification email. Please try again later.",
              {
                title: window.I18n?.t("common.error") || "Error",
                type: "error",
              },
            );
          }
        }
      });
    }
    if (window.eventBus) {
      window.eventBus.on("auth:login", () => {
        _emailVerifyDismissed = false;
        setTimeout(checkEmailVerification, 500);
        try {
          window.SystemConfig?.fetch?.(true)
            .then(() => window.SystemConfig?.applyToUI?.())
            .catch(() => {});
        } catch (_) {}
      });
      window.eventBus.on("auth:logout", () => {
        _emailVerifyDismissed = false;
        emailVerifyBanner?.classList.add("hidden");
        try {
          window.SystemConfig?.fetch?.(true)
            .then(() => window.SystemConfig?.applyToUI?.())
            .catch(() => {});
        } catch (_) {}
      });
    }
    checkEmailVerification();
    const multiTabBanner = document.getElementById("multiTabBanner");
    const multiTabCount = document.getElementById("multiTabCount");
    const multiTabCloseBtn = document.getElementById("multiTabCloseBtn");
    const multiTabDismissBtn = document.getElementById("multiTabDismissBtn");
    let _multiTabDismissed = false;
    let multiTabCheckSeq = 0;
    async function checkMultiFlowTabs() {
      if (!multiTabBanner || _multiTabDismissed) return;
      const seq = ++multiTabCheckSeq;
      try {
        const targetContext =
          (await window.MessageBridge?.getTargetContext?.().catch?.(
            () => null,
          )) || null;
        const result = await chrome.runtime.sendMessage({
          action: "queryProviderTabs",
          provider: "flow",
          targetContext,
        });
        if (seq !== multiTabCheckSeq || _multiTabDismissed) return;
        const count = Number(result?.projectCount) || 0;
        if (multiTabCount) multiTabCount.textContent = count;
        multiTabBanner.classList.toggle("hidden", count <= 1);
      } catch (_) {
        if (seq === multiTabCheckSeq) multiTabBanner.classList.add("hidden");
      }
    }
    if (multiTabCloseBtn) {
      multiTabCloseBtn.addEventListener("click", async () => {
        try {
          const targetContext =
            (await window.MessageBridge?.getTargetContext?.().catch?.(
              () => null,
            )) || null;
          const result = await chrome.runtime.sendMessage({
            action: "closeExtraProviderTabs",
            provider: "flow",
            scope: "all_projects",
            targetContext,
          });
          if (!result?.ok) {
            console.warn(
              "[TobyFlow] Failed to close other Flow project tabs:",
              result?.error || "FLOW_TAB_CLOSE_FAILED",
            );
          }
          await checkMultiFlowTabs();
        } catch (e) {
          console.warn("[TobyFlow] Failed to close other tabs:", e.message);
        }
      });
    }
    if (multiTabDismissBtn) {
      multiTabDismissBtn.addEventListener("click", () => {
        _multiTabDismissed = true;
        multiTabBanner?.classList.add("hidden");
      });
    }
    let multiTabTimer = null;
    const scheduleMultiFlowTabs = () => {
      multiTabCheckSeq++;
      clearTimeout(multiTabTimer);
      multiTabTimer = setTimeout(checkMultiFlowTabs, 250);
    };
    try {
      chrome.tabs.onCreated.addListener(() => {
        _multiTabDismissed = false;
        scheduleMultiFlowTabs();
      });
      chrome.tabs.onRemoved.addListener(scheduleMultiFlowTabs);
      chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
        if (changeInfo.url) {
          _multiTabDismissed = false;
          scheduleMultiFlowTabs();
        }
      });
    } catch (e) {}
    checkMultiFlowTabs();
    if (userMenuBtn) {
      userMenuBtn.addEventListener("click", () => {
        if (userDropdown) userDropdown.classList.toggle("hidden");
      });
      document.addEventListener("click", (e) => {
        if (
          userDropdown &&
          !userDropdown.classList.contains("hidden") &&
          !userMenuBtn.contains(e.target) &&
          !userDropdown.contains(e.target)
        ) {
          userDropdown.classList.add("hidden");
        }
      });
    }
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        if (userDropdown) userDropdown.classList.add("hidden");
        await window.authManager.logout();
        updateAuthUI();
        if (window.storageManager) {
          window.storageManager.switchToLocal();
        }
      });
    }
    if (window.eventBus) {
      let _setSseDotState = function (state, title) {
          const dot = document.querySelector("#sseStatusDot");
          if (!dot) return;
          for (const s of _sseStates) dot.classList.remove(s);
          dot.classList.add(state);
          dot.title = title;
        },
        _showSseNotif = function (message) {
          if (!sseNotif || _sseNotifDismissed) return;
          if (sseNotifText) sseNotifText.textContent = message;
          sseNotif.classList.remove("hidden");
        },
        _hideSseNotif = function () {
          if (sseNotif) sseNotif.classList.add("hidden");
        };
      window.eventBus.on("auth:login", updateAuthUI);
      window.eventBus.on("auth:logout", updateAuthUI);
      window.eventBus.on("auth:login", refreshModuleOverlays);
      window.eventBus.on("auth:login", refreshSubtabOverlays);
      window.eventBus.on("auth:login", async () => {
        const tasksPane = document.getElementById("tab-tasks");
        if (!tasksPane) return;
        await new Promise((r) => setTimeout(r, 500));
        const isAllowed =
          window.featureGate?.isModuleEnabled?.("tasks") === true;
        if (isAllowed) {
          hideModuleBlockedOverlay(tasksPane);
          if (tasksPane.__multiTaskTab?.taskList) {
            tasksPane.__multiTaskTab.taskList.loadTasks();
          } else {
            initializeTab("tab-tasks").catch((e) =>
              console.warn("[TobyFlow] tab-tasks init error:", e),
            );
          }
        }
      });
      window.eventBus.on("auth:login", () => {
        if (window.SseClient) {
          console.log("[SSE] Auth login \u2192 k\u1EBFt n\u1ED1i SSE");
          window.SseClient.connect();
        }
      });
      window.eventBus.on("auth:logout", () => {
        if (window.SseClient) {
          console.log(
            "[SSE] Auth logout \u2192 ng\u1EAFt k\u1EBFt n\u1ED1i SSE",
          );
          window.SseClient.disconnect();
        }
      });
      window.eventBus.on("auth:logout", () => {
        console.log(
          "[TobyFlow] Auth logout \u2192 reload UI lists (data cleared)",
        );
        window.eventBus.emit("storage:task_deleted");
        window.eventBus.emit("storage:workflow_deleted");
        if (window.userPromptsManager) {
          window.userPromptsManager.prompts = [];
          window.userPromptsManager.isInitialized = false;
        }
        refreshSubtabOverlays();
      });
      window.eventBus.on("api:auth_error", () => {
        console.info(
          "[TobyFlow] API auth session ended \u2192 clearing authenticated state",
        );
        if (window.storageManager?.mode === "api") {
          window.storageManager.switchToLocal();
        }
        if (window.authManager?.isLoggedIn()) {
          window.authManager
            ._clearAuth?.()
            .then(() => {
              window.eventBus.emit("auth:logout", { reason: "api_auth_error" });
            })
            .catch(() => {});
        }
      });
      window.eventBus.on("trialgate:usage_changed", () => {
        refreshModuleOverlays();
        refreshSubtabOverlays();
        updateTrialFooterBars();
      });
      window.eventBus.on("storage:task_saved", () => {
        updateFooterUI();
        refreshModuleOverlays();
      });
      window.eventBus.on("storage:task_deleted", () => {
        updateFooterUI();
        refreshModuleOverlays();
      });
      window.eventBus.on("storage:workflow_saved", () => {
        updateFooterUI();
        refreshModuleOverlays();
      });
      window.eventBus.on("storage:workflow_deleted", () => {
        updateFooterUI();
        refreshModuleOverlays();
      });
      window.eventBus.on("storage:workflow_full_saved", () => {
        updateFooterUI();
        refreshModuleOverlays();
      });
      window.eventBus.on("sse:entitlements_changed", async (data) => {
        console.log(
          "[SSE] Entitlements thay \u0111\u1ED5i, plan:",
          data?.plan?.slug,
        );
        try {
          chrome.runtime
            .sendMessage({ action: "sseRelay:entitlements_changed", data })
            .catch(() => {});
        } catch (e) {}
        if (data?.features && data?.plan) {
          if (window.featureGate?.handleSseEntitlementsChanged) {
            window.featureGate.handleSseEntitlementsChanged(data);
          }
          window.ProviderConfigManager?.fetchPrivateConfigs?.(true).catch(
            () => {},
          );
          if (typeof window._gateWatermarkTool === "function")
            window._gateWatermarkTool();
          window._gateAutoCapcutTool?.();
          if (typeof window._syncFooterWm === "function")
            window._syncFooterWm();
          if (window.authManager?.user && data.plan?.slug) {
            window.authManager.user.plan_slug = data.plan.slug;
            if (data.plan.name) {
              window.authManager.user.plan_name = data.plan.name;
            }
            const stored = await chrome.storage.local.get("af_auth");
            if (stored.af_auth) {
              stored.af_auth.user = window.authManager.user;
              await chrome.storage.local.set({ af_auth: stored.af_auth });
            }
          }
          if (typeof updateFooterUI === "function") updateFooterUI();
          if (typeof updateAuthUI === "function") updateAuthUI();
        }
      });
      window.eventBus.on("sse:plan_activated", async (data) => {
        console.log(
          "[SSE] Plan activated:",
          data?.plan_slug,
          data?.is_upgrade ? "(upgrade)" : "",
        );
        if (!data?.order_id) return;
        try {
          await window.authManager?.fetchUser?.();
        } catch (_) {}
        const storageKey = "af_shown_plan_activated";
        const stored = await chrome.storage.local.get(storageKey);
        const shownOrders = stored[storageKey] || [];
        if (shownOrders.includes(data.order_id)) {
          console.log(
            "[SSE] \u0110\xE3 show overlay cho order n\xE0y r\u1ED3i:",
            data.order_id,
          );
          return;
        }
        shownOrders.push(data.order_id);
        if (shownOrders.length > 50) shownOrders.shift();
        await chrome.storage.local.set({ [storageKey]: shownOrders });
        showPlanActivatedOverlay(data);
      });
      window.eventBus.on("sse:force_logout", (data) => {
        console.log("[SSE] Force logout:", data?.reason);
        try {
          chrome.runtime
            .sendMessage({ action: "sseRelay:force_logout", data })
            .catch(() => {});
        } catch (e) {}
        if (window.SseClient) window.SseClient.disconnect();
        window.authManager?.logout(data?.reason || "admin_revoked");
      });
      window.eventBus.on("sse:session_replaced", (data) => {
        console.log("[SSE] Phi\xEAn b\u1ECB thay th\u1EBF:", data?.device_info);
        if (window.SseClient) window.SseClient.disconnect();
      });
      window.eventBus.on("sse:announcement", (data) => {
        if (window.customDialog && data?.message) {
          window.customDialog.alert(data.message, {
            title:
              data?.title ||
              window.I18n?.t("app.systemNotification") ||
              "System Notification",
            type: data?.type || "info",
          });
        }
      });
      window.eventBus.on("sse:system_settings_changed", (data) => {
        console.log(
          "[SSE] System settings thay \u0111\u1ED5i",
          data?.section || "all",
        );
        if (window.SystemConfig) {
          window.SystemConfig.handleSseUpdate(data);
        }
        window._footerWmSystemRefreshAttempted = false;
        try {
          chrome.runtime
            .sendMessage({ action: "sseRelay:system_settings_changed", data })
            .catch(() => {});
        } catch (e) {}
        if (typeof checkEmailVerification === "function") {
          checkEmailVerification();
        }
        if (typeof window._gateWatermarkTool === "function")
          window._gateWatermarkTool();
        window._gateAutoCapcutTool?.();
        if (typeof window._syncFooterWm === "function") window._syncFooterWm();
        try {
          chrome.runtime?.sendMessage?.(
            { action: "i2p:invalidateConfig" },
            () => void chrome.runtime?.lastError,
          );
        } catch (_) {}
      });
      window.eventBus.on("provider:api_config_updated", ({ provider, key }) => {
        if (key === "error_patterns" || key === "ui_text_patterns") {
          if (provider === "chatgpt") {
            console.log(
              "[SSE] Provider API config updated \u2014 refresh ChatGPTConfig",
            );
            window.ChatGPTConfig?.refresh?.();
          } else if (provider === "grok") {
            console.log(
              "[SSE] Provider API config updated \u2014 refresh GrokConfig",
            );
            window.GrokConfig?.refresh?.();
          }
        }
      });
      if (window.TelegramExecutor) {
        window.TelegramExecutor.init();
      }
      if (window.McpExecutor) {
        window.McpExecutor.init();
      }
      if (window.UsageSync) {
        window.UsageSync.init();
      }
      const _sseStates = ["connected", "disconnected", "connecting"];
      const sseNotif = document.getElementById("sseNotif");
      const sseNotifText = document.getElementById("sseNotifText");
      const sseNotifClose = document.getElementById("sseNotifClose");
      let _sseDisconnectTimer = null;
      let _sseWasConnected = false;
      let _sseNotifDismissed = false;
      let _sseHasDisconnected = false;
      if (sseNotifClose) {
        sseNotifClose.addEventListener("click", () => {
          _hideSseNotif();
          _sseNotifDismissed = true;
        });
      }
      window.eventBus.on("sse:connected", () => {
        _setSseDotState(
          "connected",
          window.I18n?.t("app.sseConnected") || "Realtime: Connected",
        );
        _sseWasConnected = true;
        _sseNotifDismissed = false;
        _hideSseNotif();
        if (_sseDisconnectTimer) {
          clearTimeout(_sseDisconnectTimer);
          _sseDisconnectTimer = null;
        }
        if (_sseHasDisconnected && window.authManager?.isLoggedIn()) {
          console.log(
            "[TobyFlow] SSE reconnected \u2192 trigger refreshPermissions to catch missed events",
          );
          refreshPermissions("sse_reconnect").catch(() => {});
        }
        _sseHasDisconnected = false;
      });
      window.eventBus.on("sse:disconnected", () => {
        _sseHasDisconnected = true;
        if (!window.authManager?.isLoggedIn()) {
          _setSseDotState(
            "disconnected",
            window.I18n?.t("app.sseLoginRequired") || "Login for full features",
          );
          _showSseNotif(
            window.I18n?.t("app.sseLoginPrompt") ||
              "Login to access all free features",
          );
          return;
        }
        _setSseDotState(
          "disconnected",
          window.I18n?.t("app.sseDisconnected") || "Realtime: Disconnected",
        );
        if (_sseWasConnected && !_sseDisconnectTimer) {
          _sseDisconnectTimer = setTimeout(() => {
            _sseDisconnectTimer = null;
            if (!window.SseClient?.isConnected()) {
              _showSseNotif(
                window.I18n?.t("app.sseDisconnectShort") ||
                  "Lost realtime connection",
              );
            }
          }, 1e4);
        }
      });
      window.eventBus.on("sse:connecting", () => {
        _setSseDotState(
          "connecting",
          window.I18n?.t("app.sseConnecting") || "Realtime: Connecting...",
        );
      });
      window.eventBus.on("sse:gave_up", () => {
        if (!window.authManager?.isLoggedIn()) {
          _setSseDotState(
            "disconnected",
            window.I18n?.t("app.sseLoginRequired") || "Login for full features",
          );
          _showSseNotif(
            window.I18n?.t("app.sseLoginPrompt") ||
              "Login to access all free features",
          );
          return;
        }
        _setSseDotState(
          "disconnected",
          window.I18n?.t("app.sseGaveUp") ||
            "Realtime: Unable to connect to server. Will retry on focus.",
        );
        _showSseNotif(
          window.I18n?.t("app.sseGaveUpShort") || "Cannot connect to server",
        );
      });
      window.eventBus.on("sse:follower_mode", () => {
        _setSseDotState(
          "connected",
          window.I18n?.t("app.sseFollowerMode") ||
            "Realtime: Follower - qua BroadcastChannel",
        );
        _sseWasConnected = true;
        _sseNotifDismissed = false;
        _hideSseNotif();
        if (_sseDisconnectTimer) {
          clearTimeout(_sseDisconnectTimer);
          _sseDisconnectTimer = null;
        }
      });
      if (!window.authManager?.isLoggedIn()) {
        _setSseDotState(
          "disconnected",
          window.I18n?.t("app.sseLoginRequired") || "Login for full features",
        );
        _showSseNotif(
          window.I18n?.t("app.sseLoginPrompt") ||
            "Login to access all free features",
        );
      }
      window.eventBus.on("auth:login", () => {
        _hideSseNotif();
        _sseNotifDismissed = false;
      });
      window.eventBus.on("i18n:changed", () => {
        if (!sseNotif || sseNotif.classList.contains("hidden")) return;
        if (!window.authManager?.isLoggedIn()) {
          _setSseDotState(
            "disconnected",
            window.I18n?.t("app.sseLoginRequired") || "Login for full features",
          );
          if (sseNotifText)
            sseNotifText.textContent =
              window.I18n?.t("app.sseLoginPrompt") ||
              "Login to access all free features";
        } else if (!window.SseClient?.isConnected()) {
          _setSseDotState(
            "disconnected",
            window.I18n?.t("app.sseDisconnected") || "Realtime: Disconnected",
          );
          if (sseNotifText)
            sseNotifText.textContent =
              window.I18n?.t("app.sseDisconnectShort") ||
              "Lost realtime connection";
        }
      });
      window.eventBus.on("album:use", async (data) => {
        const { images } = data;
        if (!images || images.length === 0) return;
        if (window.GenTab && window.GenTab.fileIdsInput && window.AlbumList) {
          const existingIds = (window.GenTab.fileIdsInput.value || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          const newIds = [];
          for (const img of images) {
            const fileId = img.file_id || img.fileId;
            if (fileId && existingIds.includes(fileId)) continue;
            const status = await window.AlbumList._checkImageStatus(img);
            const useKey = await window.AlbumList._prepareImageForGenTab(
              img,
              status,
            );
            if (useKey && !existingIds.includes(useKey)) {
              newIds.push(useKey);
            }
          }
          if (newIds.length > 0) {
            const mergedIds = [...existingIds, ...newIds];
            window.GenTab.fileIdsInput.value = mergedIds.join(", ");
            window.GenTab.fileIdsInput.dispatchEvent(
              new Event("input", { bubbles: true }),
            );
            window.GenTab.renderFileIdThumbnails();
            window.GenTab._refreshMentionHelper();
            window.GenTab.saveState();
            const genTabBtn = document.querySelector(
              '.tobyflow-tab[data-tab="tab-gen"]',
            );
            if (genTabBtn) genTabBtn.click();
          }
        }
      });
      window.eventBus.on("capture:start", async (data) => {
        if (!window.ScreenCapture) {
          console.warn("[TobyFlow] ScreenCapture not available");
          return;
        }
        const result = await ScreenCapture.startCapture();
        if (!result.success || !result.uploadId) return;
        window.eventBus.emit("capture:complete", {
          uploadId: result.uploadId,
          captureName: result.captureName,
          thumbnail:
            window.pendingUploadFiles?.get(result.uploadId)?.thumbnail || null,
        });
        if (data?.targetAlbumId && window.ImageStore) {
          try {
            const pending = window.pendingUploadFiles?.get(result.uploadId);
            const thumbBlob = pending?.thumbnail || null;
            const imageData = {
              name: result.captureName || "capture_" + Date.now().toString(36),
              type: "capture",
              original_name: result.captureName,
              pending_upload_key: result.uploadId,
            };
            await window.ImageStore.addImage(
              data.targetAlbumId,
              imageData,
              thumbBlob,
              pending?.file || null,
            );
            console.log(
              "[TobyFlow] Capture added to album:",
              data.targetAlbumId,
            );
            window.eventBus.emit("album:refresh");
          } catch (e) {
            console.error("[TobyFlow] Failed to add capture to album:", e);
          }
        }
      });
      window.eventBus.on("upload:completed", async (data) => {
        if (!data?.key || !window.ImageStore) return;
        try {
          const images = await window.ImageStore.getImagesNeedingResolution();
          const matching = images.filter(
            (img) => img.pending_upload_key === data.key,
          );
          for (const img of matching) {
            await window.ImageStore.updateImage(img.id, {
              file_id: data.tile_id,
              file_name: data.file_name,
              thumbnail_url: data.thumbnail_url,
              pending_upload_key: null,
            });
            console.log(
              "[TobyFlow] Album image updated after upload:",
              img.id,
              data.tile_id,
            );
          }
          if (matching.length > 0) {
            window.eventBus.emit("album:refresh");
          }
        } catch (e) {
          console.warn(
            "[TobyFlow] Failed to update album image after upload:",
            e,
          );
        }
      });
      window.eventBus.on("plan:changed", (data) => {
        console.log(
          `[TobyFlow] Plan changed event: ${data.oldPlan} \u2192 ${data.newPlan}`,
        );
        updateAuthUI();
        refreshModuleOverlays();
        window._cachedPlans = null;
        window.SseClient?._scheduleTransportSwitch?.("plan_changed_local");
      });
    }
    updateAuthUI();
    refreshModuleOverlays();
    async function _runCopyTemplate(templateId, template) {
      console.log(
        "[CloneDebug] _runCopyTemplate id=",
        templateId,
        "hasTemplate=",
        !!template,
        "wtlReady=",
        !!window.workflowTemplateList?._copyTemplateToWorkflow,
      );
      if (!window.workflowTemplateList?._copyTemplateToWorkflow) {
        try {
          document
            .querySelector('.tobyflow-tab[data-tab="tab-workflow"]')
            ?.click();
        } catch (e) {}
        for (
          let i = 0;
          i < 20 &&
          !document.getElementById("tab-workflow")?.__tobyflowTab
            ?._loadWorkflowTemplateList;
          i++
        ) {
          await new Promise((r) => setTimeout(r, 150));
        }
        const wtab = document.getElementById("tab-workflow")?.__tobyflowTab;
        if (
          wtab?._loadWorkflowTemplateList &&
          !window.workflowTemplateList?._copyTemplateToWorkflow
        ) {
          console.log(
            "[CloneDebug] \xE9p _loadWorkflowTemplateList (user c\xF3 workflows \u2192 init m\u1EDF subtab workflows)",
          );
          try {
            wtab._loadWorkflowTemplateList();
          } catch (e) {
            console.warn(
              "[CloneDebug] _loadWorkflowTemplateList l\u1ED7i:",
              e?.message,
            );
          }
        }
        for (
          let i = 0;
          i < 30 && !window.workflowTemplateList?._copyTemplateToWorkflow;
          i++
        ) {
          await new Promise((r) => setTimeout(r, 150));
        }
      }
      if (window.workflowTemplateList?._copyTemplateToWorkflow) {
        console.log(
          "[CloneDebug] \u2192 g\u1ECDi _copyTemplateToWorkflow (modal s\u1EBD hi\u1EC7n)",
        );
        window.workflowTemplateList._copyTemplateToWorkflow(
          templateId,
          template || null,
        );
      } else {
        console.warn(
          "[CloneDebug] workflowTemplateList V\u1EAAN null sau khi \xE9p load \u2192 modal KH\xD4NG hi\u1EC7n",
        );
        window.showNotification?.(
          "Please open the Workflow tab and try again",
          "warning",
        );
      }
    }
    let _consumingPendingTemplateClone = false;
    async function _consumePendingTemplateClone() {
      if (_consumingPendingTemplateClone) return;
      let pending = null;
      try {
        pending = (await chrome.storage.local.get(["_pendingTemplateClone"]))
          ._pendingTemplateClone;
      } catch (e) {
        console.warn(
          "[CloneDebug] cannot read pending template clone:",
          e?.message,
        );
        return;
      }
      if (!pending) return;
      if (!pending.timestamp || Date.now() - pending.timestamp > 5 * 60 * 1e3) {
        await chrome.storage.local.remove("_pendingTemplateClone");
        return;
      }
      if (
        (pending.type !== "template" || !pending.templateId) &&
        (pending.type !== "shared" || !pending.wfId)
      ) {
        console.warn("[CloneDebug] invalid pending template clone");
        await chrome.storage.local.remove("_pendingTemplateClone");
        return;
      }
      _consumingPendingTemplateClone = true;
      await chrome.storage.local.remove("_pendingTemplateClone");
      try {
        if (pending.type === "shared") {
          chrome.runtime.sendMessage(
            {
              action: "cloneSharedWorkflow",
              wfId: pending.wfId,
              workflow: pending.workflow || null,
            },
            () => void chrome.runtime.lastError,
          );
        } else {
          await _runCopyTemplate(pending.templateId, pending.template || null);
        }
      } finally {
        _consumingPendingTemplateClone = false;
      }
    }
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local" && changes._pendingTemplateClone?.newValue) {
        _consumePendingTemplateClone();
      }
    });
    _consumePendingTemplateClone();
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (
        msg.action === "executionStatusUpdate" ||
        msg.action === "workflowEditorClosed"
      ) {
        updateTrialFooterBars();
        updateFooterUsageBars();
        refreshModuleOverlays();
      }
      if (msg.action === "settingsClosed") {
        try {
          window.featureGate?.refresh?.();
        } catch (e) {}
        updateTrialFooterBars();
        updateFooterUsageBars();
        refreshModuleOverlays();
        updateAuthUI?.();
      }
      if (
        msg.action === "showUpgradeModal" &&
        typeof window.openUpgradeModal === "function"
      ) {
        window.openUpgradeModal();
      }
      if (
        msg.action === "workflowExecutionEvent" &&
        msg.event === "execution:api_unusual_activity"
      ) {
        void routeFlowApiLimitAdvice(msg.data || {});
      }
      if (
        msg.action === "workflowExecutionEvent" &&
        msg.event === "execution:flow_cookie_recovery"
      ) {
        void window.FlowCookieRecovery?.show(msg.data || {});
      }
      if (msg.action === "cloneWorkflowTemplate" && msg.templateId) {
        console.log(
          "[CloneDebug] sidebar nh\u1EADn cloneWorkflowTemplate id=",
          msg.templateId,
          "hasTemplate=",
          !!msg.template,
        );
        _runCopyTemplate(msg.templateId, msg.template || null);
        sendResponse?.({ ok: true });
      }
      if (msg.action === "cloneSharedWorkflow" && msg.wfId) {
        (async () => {
          try {
            document
              .querySelector('.tobyflow-tab[data-tab="tab-workflow"]')
              ?.click();
          } catch (e) {}
          let wl = null;
          for (let i = 0; i < 30; i++) {
            wl =
              document.getElementById("tab-workflow")?.__tobyflowTab
                ?.workflowList;
            if (wl?.handleDuplicateFromShared) break;
            await new Promise((r) => setTimeout(r, 150));
          }
          if (wl?.handleDuplicateFromShared) {
            wl.handleDuplicateFromShared(msg.wfId, msg.workflow || null);
          } else {
            window.showNotification?.(
              window.I18n?.t("workflow.openWorkflowTabRetry") ||
                "Please open the Workflow tab and try again",
              "warning",
            );
          }
        })();
        sendResponse?.({ ok: true });
      }
      if (msg.action === "editWorkflowTemplate" && msg.templateId) {
        if (window.workflowTemplateList?._openTemplateForEdit) {
          window.workflowTemplateList._openTemplateForEdit(msg.templateId);
        }
        sendResponse?.({ ok: true });
      }
      if (msg.action === "templateCreated" && msg.templateId) {
        if (window.eventBus) {
          window.eventBus.emit("template:created", {
            templateId: msg.templateId,
          });
        }
      }
      if (msg.action === "templateUpdated" && msg.templateId) {
        if (window.eventBus) {
          window.eventBus.emit("template:updated", {
            templateId: msg.templateId,
          });
        }
      }
      if (msg.action === "workflowClonedFromShared" && msg.workflow) {
        (async () => {
          if (window.workflowList?.loadWorkflows) {
            await window.workflowList.loadWorkflows();
          }
          if (window.featureGate) {
            window.featureGate.refresh().catch(() => {});
          }
          const workflowsTab = document.querySelector(
            '[data-subtab="workflows"]',
          );
          if (workflowsTab) workflowsTab.click();
          setTimeout(() => {
            if (window.workflowList?._openWorkflow) {
              window.workflowList._openWorkflow(msg.workflow.wf_id);
            } else if (window.eventBus) {
              window.eventBus.emit("workflow:open_editor", {
                mode: "edit",
                workflow: msg.workflow,
              });
            }
          }, 300);
        })();
      }
      if (msg.action === "grok:gen_progress" && window.eventBus) {
        window.eventBus.emit("execution:tracker_update", {
          genProgress: msg.progress,
          genElapsed: msg.elapsed,
          genMode: msg.mode,
        });
      }
      if (msg.action === "showLoginOverlay") {
        const loginOverlay3 = document.getElementById("loginOverlay");
        if (loginOverlay3) {
          loginOverlay3.classList.remove("hidden");
        }
      }
      if (msg.action === "execution:lock_broadcast" && msg.state) {
        if (
          msg._originId &&
          msg._originId === window.ExecutionLock?._contextId
        ) {
          return;
        }
        console.log("[app.js] Received execution:lock_broadcast:", msg.state);
        if (window.ExecutionLock) {
          if (msg.state.locked) {
            ExecutionLock._owner = msg.state.owner;
            ExecutionLock._label = msg.state.label;
            ExecutionLock._lockedAt = msg.state.lockedAt;
          } else {
            ExecutionLock._owner = null;
            ExecutionLock._label = "";
            ExecutionLock._lockedAt = null;
          }
        }
        window.eventBus?.emit("execution:lock_changed", msg.state);
      }
      if (msg.action === "execution:tracker_broadcast" && msg.data) {
        if (
          msg._originId &&
          msg._originId === window.ExecutionLock?._contextId
        ) {
          return;
        }
        console.log("[app.js] Received execution:tracker_broadcast:", msg.data);
        window.eventBus?.emit("execution:tracker_update", msg.data);
      }
      if (msg.action === "pq:state_broadcast" && msg.snapshot) {
        window._externalQueueSnapshot = msg.snapshot;
        window._externalQueueTimestamp = Date.now();
        window.eventBus?.emit("queue:external_state", msg.snapshot);
      }
      if (
        msg.action === "workflowExecutionEvent" &&
        msg.event === "execution:stop"
      ) {
        const stoppedId = msg.data?.wf_id || msg.data?.workflow?.wf_id;
        const executor = window.workflowExecutor;
        const activeId =
          executor?.currentWorkflow?.wf_id || executor?._runningOtherWfId;
        if (
          msg.data?.run_id &&
          executor?._executionTask &&
          executor._flowRunId !== msg.data.run_id
        )
          return;
        if (stoppedId && activeId && String(stoppedId) !== String(activeId))
          return;
        window.eventBus?.emit("execution:force_stopped");
      }
    });
    if (window.eventBus) {
      window.eventBus.on("featuregate:refreshed", () => {
        updateFooterUI();
        refreshModuleOverlays();
        updateAutoDownloadToggles();
        updateFeatureGatedToggles();
        if (typeof window._gateWatermarkTool === "function")
          window._gateWatermarkTool();
        if (typeof window._syncFooterWm === "function") window._syncFooterWm();
      });
    }
    if (window.authManager?.isLoggedIn() && window.featureGate) {
      window.featureGate.refresh().then(() => {
        updateFooterUI();
      });
    }
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.af_auth) {
        const newVal = changes.af_auth.newValue;
        const wasLoggedIn = window.authManager?.isLoggedIn();
        if (!newVal && wasLoggedIn) {
          console.log(
            "[TobyFlow] Auth: Ph\xE1t hi\u1EC7n \u0111\u0103ng xu\u1EA5t t\u1EEB context kh\xE1c",
          );
          if (window.SseClient?.disconnect) {
            try {
              window.SseClient.disconnect();
            } catch (e) {
              console.warn(
                "[TobyFlow] Auth: L\u1ED7i disconnect SSE external logout",
                e.message,
              );
            }
          }
          const oldToken = changes.af_auth.oldValue?.token;
          if (oldToken) {
            console.log(
              "[TobyFlow] Auth: G\u1ECDi sse/end-session v\u1EDBi old token...",
            );
            chrome.runtime.sendMessage(
              {
                action: "apiRequest",
                method: "POST",
                endpoint: "sse/end-session",
                data: null,
                token: oldToken,
              },
              (response) => {
                if (chrome.runtime.lastError) {
                  console.warn(
                    "[TobyFlow] Auth: L\u1ED7i g\u1ECDi sse/end-session:",
                    chrome.runtime.lastError.message,
                  );
                } else if (response?.success) {
                  console.log(
                    "[TobyFlow] Auth: SSE session \u0111\xE3 \u0111\u01B0\u1EE3c x\xF3a th\xE0nh c\xF4ng",
                  );
                } else {
                  console.warn(
                    "[TobyFlow] Auth: sse/end-session th\u1EA5t b\u1EA1i (c\xF3 th\u1EC3 token \u0111\xE3 h\u1EBFt h\u1EA1n):",
                    response?.error?.message,
                  );
                }
              },
            );
          }
          window.authManager.token = null;
          window.authManager.user = null;
          if (window.storageManager) {
            window.storageManager.switchToLocal();
          }
          (async () => {
            if (window.featureGate) {
              try {
                await window.featureGate.resetForLogout();
                console.log(
                  "[TobyFlow] Auth: FeatureGate reset sau external logout",
                );
              } catch (err) {
                console.warn(
                  "[TobyFlow] Auth: L\u1ED7i reset FeatureGate:",
                  err.message,
                );
              }
            }
            updateAuthUI();
            refreshModuleOverlays();
            if (window.eventBus) {
              window.eventBus.emit("auth:logout", {
                reason: "external_logout",
              });
            }
          })();
        } else if (newVal?.token && !wasLoggedIn) {
          if (window._oauthLoginProcessing) {
            console.log(
              "[TobyFlow] Auth: Skip storage handler, message handler \u0111ang x\u1EED l\xFD",
            );
            return;
          }
          if (window.authManager?.token === newVal.token) {
            console.log(
              "[TobyFlow] Auth: Skip storage handler, token \u0111\xE3 \u0111\u01B0\u1EE3c set",
            );
            return;
          }
          console.log(
            "[TobyFlow] Auth: Ph\xE1t hi\u1EC7n \u0111\u0103ng nh\u1EADp t\u1EEB context kh\xE1c",
          );
          window.authManager.token = newVal.token;
          window.authManager.user = newVal.user;
          window.authManager._sessionInvalid = false;
          window.authManager._rateLimitedUntil = 0;
          if (loginOverlay2) loginOverlay2.classList.add("hidden");
          updateAuthUI();
          setupOnboarding();
          (async () => {
            if (window.storageManager) {
              await window.storageManager.switchToApi();
              console.log("[TobyFlow] Storage: Switched to API mode");
            }
            if (window.featureGate) {
              try {
                await window.featureGate.resetForLogin();
                console.log(
                  "[TobyFlow] Storage: Entitlements refreshed sau login",
                );
              } catch (e) {
                console.warn(
                  "[TobyFlow] Storage: Kh\xF4ng th\u1EC3 refresh entitlements",
                  e,
                );
              }
            }
            refreshModuleOverlays();
            window.authManager
              .fetchUser()
              .then(() => {
                updateAuthUI();
                checkEmailVerification();
              })
              .catch(() => {});
            if (window.eventBus) {
              window.eventBus.emit("auth:login", { user: newVal.user });
            }
          })();
        }
      }
      if (changes.af_tasks || changes.af_workflows) {
        updateTrialFooterBars();
        updateFooterUsageBars();
        refreshModuleOverlays();
      }
      if (changes.af_entitlements) {
        const newCache = changes.af_entitlements.newValue;
        if (!newCache) {
          console.log(
            "[TobyFlow] Entitlements removed (logout), skip UI update here",
          );
          return;
        }
        console.log(
          "[TobyFlow] Entitlements changed, reload memory + refresh overlays",
        );
        window._gateAgentBotTools?.();
        if (window.featureGate) {
          const currentUserId = window.authManager?.user?.id || null;
          const cacheUserId = newCache.user_id || null;
          const cachePlanSlug = newCache.plan?.slug;
          let isValidCache = false;
          if (currentUserId) {
            isValidCache = cacheUserId === currentUserId;
          } else {
            isValidCache = cacheUserId === null && cachePlanSlug === "trial";
          }
          if (!isValidCache) {
            console.log(
              "[TobyFlow] Entitlements: Skip reload, invalid cache",
              "cacheUserId:",
              cacheUserId,
              "currentUserId:",
              currentUserId,
              "cachePlan:",
              cachePlanSlug,
            );
          } else {
            if (newCache.entitlements)
              window.featureGate.entitlements = newCache.entitlements;
            if (newCache.plan !== void 0)
              window.featureGate.plan = newCache.plan;
            if (newCache.lastFetch)
              window.featureGate.lastFetch = newCache.lastFetch;
            if (window.eventBus) {
              window.eventBus.emit("featuregate:refreshed", {
                plan: newCache.plan,
                entitlements: newCache.entitlements,
                source: "background-fetch",
              });
            }
          }
        }
        refreshModuleOverlays();
        updateFooterUI();
      }
    });
    async function refreshPermissions(source = "unknown") {
      if (!window.authManager?.isLoggedIn()) return false;
      if (
        window.featureGate?._isLoggingOut ||
        window.featureGate?._refreshPending
      ) {
        console.log(
          `[TobyFlow] refreshPermissions skip (${source}) \u2014 \u0111ang logout ho\u1EB7c \u0111\xE3 c\xF3 refresh`,
        );
        return false;
      }
      console.log(
        `[TobyFlow] Refreshing permissions (${source}) \u2014 delegate ConfigVersionPoller for config/entitlements + fetchUser for profile`,
      );
      try {
        const isExplicitAction = [
          "plan_change",
          "manual",
          "login",
          "sse_reconnect",
        ].includes(source);
        const [, pollerResult] = await Promise.all([
          window.authManager.fetchUser(),
          window.ConfigVersionPoller?.checkAndRefresh?.({ trigger: source }) ??
            (isExplicitAction
              ? window.featureGate?.refresh?.({ force: true })
              : window.featureGate?.refresh?.()),
        ]);
        if (pollerResult?.skipped) {
          console.log(
            `[TobyFlow] ConfigVersionPoller b\u1ECF l\u01B0\u1EE3t (${pollerResult.skipped}) \u2192 t\u1EF1 refresh entitlements`,
          );
          await window.featureGate?.refresh?.({ force: true });
        }
        updateAuthUI();
        const plan = window.featureGate?.getPlan?.();
        console.log(
          `[TobyFlow] Permissions refreshed: plan=${plan?.slug || "unknown"}`,
        );
        return true;
      } catch (err) {
        console.warn("[TobyFlow] Refresh failed:", err.message);
        return false;
      }
    }
    if (typeof window._lastPermRefreshAt !== "number")
      window._lastPermRefreshAt = 0;
    const REFRESH_COOLDOWN = 6e4;
    document.addEventListener("visibilitychange", async () => {
      if (document.hidden) return;
      if (
        window.authManager?.isLoggedIn() &&
        window.SseClient &&
        !window.SseClient.isConnected()
      ) {
        window.SseClient.forceReconnect();
      } else if (window.authManager?.isLoggedIn()) {
        window.SseClient?.pollNow?.();
      }
      const now = Date.now();
      if (now - window._lastPermRefreshAt < REFRESH_COOLDOWN) return;
      window._lastPermRefreshAt = now;
      if (
        window.featureGate?._isLoggingOut ||
        window.featureGate?._refreshPending
      ) {
        console.log(
          "[TobyFlow] visibilitychange skip refresh \u2014 \u0111ang logout ho\u1EB7c \u0111\xE3 c\xF3 refresh",
        );
        return;
      }
      if (window.authManager?.isLoggedIn()) {
        await refreshPermissions("focus");
      } else {
        if (window.featureGate) {
          console.log(
            "[TobyFlow] Refreshing FeatureGate trial config (focus)...",
          );
          await window.featureGate.refresh();
          updateTrialFooterBars();
          refreshModuleOverlays();
        }
      }
    });
    window.addEventListener("focus", async () => {
      if (
        window.authManager?.isLoggedIn() &&
        window.SseClient &&
        !window.SseClient.isConnected()
      ) {
        console.log(
          "[SSE] Window focus + \u0111\xE3 \u0111\u0103ng nh\u1EADp \u2192 k\u1EBFt n\u1ED1i SSE",
        );
        window.SseClient.forceReconnect();
      } else if (window.authManager?.isLoggedIn()) {
        window.SseClient?.pollNow?.();
      }
      const now = Date.now();
      if (now - window._lastPermRefreshAt < REFRESH_COOLDOWN) return;
      window._lastPermRefreshAt = now;
      if (
        window.featureGate?._isLoggingOut ||
        window.featureGate?._refreshPending
      ) {
        console.log(
          "[TobyFlow] window-focus skip refresh \u2014 \u0111ang logout ho\u1EB7c \u0111\xE3 c\xF3 refresh",
        );
        return;
      }
      if (window.authManager?.isLoggedIn()) {
        await refreshPermissions("window-focus");
      } else {
        if (window.featureGate) {
          console.log(
            "[TobyFlow] Refreshing FeatureGate trial config (window-focus)...",
          );
          await window.featureGate.refresh();
          updateTrialFooterBars();
          refreshModuleOverlays();
        }
      }
    });
    setInterval(async () => {
      if (
        window.featureGate?._isLoggingOut ||
        window.featureGate?._refreshPending
      )
        return;
      if (
        !window.authManager?.isLoggedIn() &&
        window.featureGate &&
        !window.SseClient?.isConnected()
      ) {
        console.log(
          "[TobyFlow] Refreshing FeatureGate trial config (interval)...",
        );
        await window.featureGate.refresh();
        updateTrialFooterBars();
        refreshModuleOverlays();
      }
    }, 12e4);
  }
  async function updateUsageDashboard() {
    const container = document.getElementById("usageDashboardContent");
    if (!container || !window.featureGate || !window.authManager?.isLoggedIn())
      return;
    try {
      const promptsQuota = window.featureGate.checkQuota("gen_run_max");
      const tasksQuota = window.featureGate.checkQuota("tasks_max");
      const plan = window.featureGate.getPlan();
      container.innerHTML = `
        <div class="usage-item">
          <span class="usage-label">${window.I18n?.t("app.promptsToday") || "Prompts today"}</span>
          <span class="usage-value">${promptsQuota.used || 0}/${promptsQuota.limit === "unlimited" ? "\u221E" : promptsQuota.limit || "\u2014"}</span>
          ${promptsQuota.limit !== "unlimited" ? `<div class="usage-bar"><div class="usage-bar-fill" style="width: ${Math.min(100, ((promptsQuota.used || 0) / (promptsQuota.limit || 1)) * 100)}%"></div></div>` : ""}
        </div>
        <div class="usage-item">
          <span class="usage-label">Tasks</span>
          <span class="usage-value">${tasksQuota.used || 0}/${tasksQuota.limit === "unlimited" ? "\u221E" : tasksQuota.limit || "\u2014"}</span>
        </div>
        <div class="usage-plan">
          <span class="usage-plan-badge ${plan?.slug === "unlimited" || plan?.slug === "premium" || plan?.slug === "autoflow-pro" || plan?.slug === "autogrok-pro" ? "plan-unlimited" : "plan-free"}">${plan?.name || "Free"}</span>
        </div>
      `;
    } catch (e) {
      log("Usage dashboard update failed:", e.message);
    }
  }
  const EXTENSION_SCOPE = "flow";
  let _affiliateDiscount = { percent: 0, ref_code: null };
  let _couponApplied = null;
  let _codeMsg = null;
  function _couponReasonText(code) {
    const t2 = (k, d) => window.I18n?.t?.(k) || d;
    switch (code) {
      case "EXPIRED":
        return t2("coupon.errEXPIRED", "M\xE3 \u0111\xE3 h\u1EBFt h\u1EA1n.");
      case "NOT_STARTED":
        return t2(
          "coupon.errNOT_STARTED",
          "M\xE3 ch\u01B0a t\u1EDBi ng\xE0y \xE1p d\u1EE5ng.",
        );
      case "INACTIVE":
        return t2(
          "coupon.errINACTIVE",
          "M\xE3 \u0111\xE3 ng\u1EEBng ho\u1EA1t \u0111\u1ED9ng.",
        );
      case "USED_UP":
        return t2(
          "coupon.errUSED_UP",
          "M\xE3 \u0111\xE3 h\u1EBFt l\u01B0\u1EE3t s\u1EED d\u1EE5ng.",
        );
      case "USER_LIMIT":
        return t2(
          "coupon.errUSER_LIMIT",
          "B\u1EA1n \u0111\xE3 d\xF9ng m\xE3 n\xE0y r\u1ED3i.",
        );
      case "PLAN_MISMATCH":
        return t2(
          "coupon.errPLAN_MISMATCH",
          "M\xE3 kh\xF4ng \xE1p d\u1EE5ng cho g\xF3i n\xE0y.",
        );
      case "CYCLE_MISMATCH":
        return t2(
          "coupon.errCYCLE_MISMATCH",
          "M\xE3 kh\xF4ng \xE1p d\u1EE5ng cho chu k\u1EF3 n\xE0y.",
        );
      case "CURRENCY_MISMATCH":
        return t2(
          "coupon.errCURRENCY_MISMATCH",
          "M\xE3 ch\u1EC9 d\xF9ng \u0111\u01B0\u1EE3c cho \u0111\u01A1n kh\xE1c \u0111\u01A1n v\u1ECB ti\u1EC1n t\u1EC7.",
        );
      case "MIN_AMOUNT":
        return t2(
          "coupon.errMIN_AMOUNT",
          "\u0110\u01A1n ch\u01B0a \u0111\u1EA1t gi\xE1 tr\u1ECB t\u1ED1i thi\u1EC3u c\u1EE7a m\xE3.",
        );
      default:
        return t2(
          "coupon.errNOT_FOUND",
          "M\xE3 kh\xF4ng h\u1EE3p l\u1EC7 ho\u1EB7c \u0111\xE3 h\u1EBFt h\u1EA1n.",
        );
    }
  }
  async function _tryAutoApplyStoredRef() {
    if (_affiliateDiscount?.ref_code) return;
    let stored = null;
    try {
      stored = await new Promise((r) =>
        chrome.storage.local.get(["tf_ref"], (x) => r(x?.tf_ref)),
      );
    } catch (_) {}
    const code = stored?.code;
    if (!code || (stored.expires && stored.expires < Date.now())) return;
    try {
      const r = await window.authManager._apiCall(
        "POST",
        "affiliate/validate-ref",
        { code },
      );
      if (r?.ok) {
        _affiliateDiscount = {
          percent: Number(r.discount_percent) || 0,
          ref_code: code,
        };
      }
    } catch (_) {}
  }
  async function fetchPlans() {
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            action: "apiRequest",
            method: "GET",
            endpoint: `plans?extension=${EXTENSION_SCOPE}&include_internal=1`,
          },
          (resp) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (resp?.success && resp?.data) {
              try {
                if (resp.meta?.affiliate_discount)
                  _affiliateDiscount = resp.meta.affiliate_discount;
              } catch (_) {}
              resolve(resp.data);
            } else {
              reject(
                new Error(
                  resp?.error?.message ||
                    resp?.error ||
                    "Could not load plan list",
                ),
              );
            }
          },
        );
      });
      const currentSlug = window.authManager?.getUser?.()?.plan_slug;
      const allowedScopes = new Set([
        "all",
        "flow",
        "tobyflow",
        EXTENSION_SCOPE,
      ]);
      return Array.isArray(response)
        ? response.filter((plan) => {
            if (!plan || !allowedScopes.has(plan.extension_scope)) return false;
            return (
              plan.is_public === true ||
              ["free", "trial", currentSlug].includes(plan.slug)
            );
          })
        : [];
    } catch (e) {
      console.warn("[TobyFlow] Fetch plans failed:", e.message);
      return null;
    }
  }
  async function fetchActiveProviders() {
    try {
      return await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            action: "apiRequest",
            method: "GET",
            endpoint: "payment-settings/providers",
          },
          (resp) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (resp?.success && resp?.data) {
              resolve({
                providers: resp.data.providers || [],
                labels: resp.data.labels || {},
                behavior: resp.data.behavior || {},
              });
            } else {
              reject(
                new Error(
                  resp?.error?.message || "Could not load payment methods list",
                ),
              );
            }
          },
        );
      });
    } catch (e) {
      console.warn("[TobyFlow] Fetch active providers failed:", e.message);
      return null;
    }
  }
  let selectedPlanId = null;
  let selectedBillingCycle = "monthly";
  let _currentUpgradeQuote = null;
  let _lastQuoteKey = null;
  const _UPGRADE_ICONS = {
    package:
      '<svg class="upgrade-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>',
    credit:
      '<svg class="upgrade-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"></path><path d="M12 18V6"></path></svg>',
    card: '<svg class="upgrade-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>',
    sparkles:
      '<svg class="upgrade-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"></path><path d="M19 14l.5 1.5L21 16l-1.5.5L19 18l-.5-1.5L17 16l1.5-.5z"></path></svg>',
    warning:
      '<svg class="upgrade-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    info: '<svg class="upgrade-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
    spinner:
      '<svg class="upgrade-icon upgrade-icon-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>',
  };
  function _upgradeDateLocale() {
    const loc = (window.I18n?.getLocale?.() || "vi").toLowerCase();
    return (
      { vi: "vi-VN", en: "en-US", ja: "ja-JP", th: "th-TH" }[loc] || "en-US"
    );
  }
  async function fetchUpgradeQuote(planId, billingCycle, currency) {
    try {
      console.log("[Upgrade Quote] Request:", {
        planId,
        billingCycle,
        currency,
      });
      const resp = await window.authManager._apiCall(
        "POST",
        "orders/upgrade-quote",
        { plan_id: planId, billing_cycle: billingCycle, currency },
      );
      console.log("[Upgrade Quote] Response:", resp);
      const quote = resp?.from_plan !== void 0 ? resp : resp?.data || null;
      console.log("[Upgrade Quote] Parsed quote:", quote);
      return quote;
    } catch (e) {
      if (
        ["PRORATION_USE_RENEWAL_FLOW", "use_renewal_flow"].includes(
          e?.error?.code || e?.code,
        )
      ) {
        console.info(
          "[Upgrade Quote] Renewal flow:",
          e?.error?.code || e?.code,
          e.message,
        );
      } else {
        console.warn("[Upgrade Quote] Error:", e?.error?.code || e.message, e);
      }
      return {
        _error_code: e?.error?.code || e?.code || "QUOTE_FAILED",
        _error_message: e.message,
      };
    }
  }
  function renderUpgradeModal(plans) {
    const container = document.getElementById("upgradePlansContainer");
    if (!container || !plans) return;
    const user = window.authManager?.getUser();
    const userPlanSlug = user?.plan_slug;
    const userPlanCycle = user?.plan_billing_cycle;
    const userExpiresAtIso = user?.plan_expires_at;
    const userExpiresAt = userExpiresAtIso ? new Date(userExpiresAtIso) : null;
    const isPlanExpired = userExpiresAt && userExpiresAt.getTime() < Date.now();
    const isLifetime =
      userPlanCycle === "lifetime" ||
      (userPlanSlug &&
        !["trial", "free"].includes(userPlanSlug) &&
        !userExpiresAtIso);
    const isUpgradeMode = !!(
      userPlanSlug &&
      !["trial", "free"].includes(userPlanSlug) &&
      !isPlanExpired &&
      !isLifetime
    );
    const currentPlanInfo = isUpgradeMode
      ? plans.find((p) => p.slug === userPlanSlug)
      : null;
    let premiumPlans = plans.filter(
      (p) => p.slug !== "free" && p.slug !== "trial",
    );
    if (isUpgradeMode && currentPlanInfo) {
      const currentRank =
        currentPlanInfo.upgrade_rank ?? currentPlanInfo.display_order ?? 0;
      premiumPlans = premiumPlans.filter(
        (p) =>
          p.slug === currentPlanInfo.slug ||
          (p.upgrade_rank ?? p.display_order ?? 0) >= currentRank,
      );
    }
    if (!premiumPlans.length) return;
    if (!selectedPlanId) {
      selectedPlanId = premiumPlans[0].id;
    }
    const selectedPlan =
      premiumPlans.find((p) => p.id === selectedPlanId) || premiumPlans[0];
    selectedPlanId = selectedPlan.id;
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    const currency = window.LocationCache?.getCurrency?.() || "VND";
    const priceKey = (cycle) =>
      currency === "USD" ? `price_usd_${cycle}` : `price_${cycle}`;
    let availableCycles = [];
    const priceMonthly = selectedPlan[priceKey("monthly")];
    const priceYearly = selectedPlan[priceKey("yearly")];
    const priceLifetime = selectedPlan[priceKey("lifetime")];
    if (priceMonthly != null)
      availableCycles.push({
        key: "monthly",
        label: t("dialog.month", "Monthly"),
        price: priceMonthly,
      });
    if (priceYearly != null)
      availableCycles.push({
        key: "yearly",
        label: t("dialog.year", "Yearly"),
        price: priceYearly,
      });
    if (priceLifetime != null)
      availableCycles.push({
        key: "lifetime",
        label: t("dialog.upgradeLifetime", "Lifetime"),
        price: priceLifetime,
      });
    if (!availableCycles.find((c) => c.key === selectedBillingCycle)) {
      selectedBillingCycle = availableCycles[0]?.key || "monthly";
    }
    const currentCycle =
      availableCycles.find((c) => c.key === selectedBillingCycle) ||
      availableCycles[0];
    const currentPrice = currentCycle?.price || 0;
    const cycleNoteMap = {
      monthly: t("dialog.perMonth", "per month"),
      yearly: t("dialog.perYear", "per year"),
      lifetime: t("dialog.lifetimeDesc", "Pay once, use forever"),
    };
    const displayFeatures = (selectedPlan.features || [])
      .filter((f) => f.display)
      .slice(0, 6);
    let html = "";
    let currentPlanCardHtml = "";
    if (isUpgradeMode && currentPlanInfo) {
      const _msPerDay = 864e5;
      const remainingDays = userExpiresAt
        ? Math.max(
            0,
            Math.ceil((userExpiresAt.getTime() - Date.now()) / _msPerDay),
          )
        : 0;
      const cycleLabelMap = {
        monthly: t("upgrade.cycleMonthlyShort", "Monthly"),
        yearly: t("upgrade.cycleYearlyShort", "Yearly"),
        lifetime: t("upgrade.cycleLifetimeShort", "Lifetime"),
      };
      const cycleLabel = cycleLabelMap[userPlanCycle] || userPlanCycle || "";
      const expiresFmt = userExpiresAt
        ? userExpiresAt.toLocaleDateString(_upgradeDateLocale(), {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })
        : "\u2014";
      currentPlanCardHtml = `
        <div class="upgrade-current-plan-card">
          <div class="upgrade-current-plan-label">${_UPGRADE_ICONS.package}${t("upgrade.currentPlanLabel", "Current Plan")}</div>
          <div class="upgrade-current-plan-name">${currentPlanInfo.name}${cycleLabel ? ` <span class="upgrade-current-plan-cycle">(${cycleLabel})</span>` : ""}</div>
          <div class="upgrade-current-plan-expires">
            ${t("upgrade.expiresAtLabel", "Expires")}: <strong>${expiresFmt}</strong>
            \xB7 ${t("upgrade.remainingDays", "{{days}} days left").replace("{{days}}", String(remainingDays))}
          </div>
        </div>
      `;
    }
    if (premiumPlans.length > 1) {
      html += '<div class="upgrade-plan-selector">';
      premiumPlans.forEach((plan) => {
        const isActive = plan.id === selectedPlanId;
        const isCurrentPlan = plan.slug === userPlanSlug;
        const _curTitle = t("dialog.currentPlan", "Current Plan");
        html += `
          <button class="upgrade-plan-tab ${isActive ? "active" : ""} ${isCurrentPlan ? "current-plan" : ""}" data-plan-id="${plan.id}"
            ${isCurrentPlan ? `title="${_curTitle}" aria-label="${plan.name} \u2014 ${_curTitle}"` : ""}>
            <span class="upgrade-plan-tab-name">${plan.name}</span>${
              isCurrentPlan
                ? `
            <span class="current-badge" role="img" aria-hidden="true">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </span>`
                : ""
            }
          </button>`;
      });
      html += "</div>";
    }
    const isSelectedCurrentPlan = selectedPlan.slug === userPlanSlug;
    html += `
      <div class="upgrade-plan-card" data-plan-id="${selectedPlan.id}">
        <div class="upgrade-plan-name">
          ${selectedPlan.name}
          ${isSelectedCurrentPlan ? '<span class="current-plan-badge">' + t("dialog.currentPlan", "Current Plan") + "</span>" : ""}
        </div>`;
    if (availableCycles.length > 1) {
      html += '<div class="upgrade-cycle-pills">';
      availableCycles.forEach((cycle) => {
        const isActive = cycle.key === selectedBillingCycle;
        html += `<button class="cycle-pill ${isActive ? "active" : ""}" data-cycle="${cycle.key}">${cycle.label}</button>`;
      });
      html += "</div>";
    }
    const _isProratedUpgrade = !!(
      _currentUpgradeQuote &&
      _currentUpgradeQuote.credit > 0 &&
      !_currentUpgradeQuote._error_code &&
      _currentUpgradeQuote.to_plan?.billing_cycle === selectedBillingCycle &&
      _currentUpgradeQuote.currency === currency
    );
    const _roundCur = (v) =>
      currency === "USD" ? Math.round(v * 100) / 100 : Math.round(v);
    const _promoPct =
      !_isProratedUpgrade &&
      currency !== "USD" &&
      Number(selectedPlan.discount_percent) > 0
        ? Number(selectedPlan.discount_percent)
        : 0;
    const _promoDiscount =
      _promoPct > 0
        ? Math.max(
            0,
            currentPrice - Math.round((currentPrice * (100 - _promoPct)) / 100),
          )
        : 0;
    const _affPctRaw =
      !_isProratedUpgrade && Number(_affiliateDiscount?.percent) > 0
        ? Number(_affiliateDiscount.percent)
        : 0;
    const _affDiscount =
      _affPctRaw > 0
        ? Math.min(_roundCur((currentPrice * _affPctRaw) / 100), currentPrice)
        : 0;
    const _couponDiscount =
      !_isProratedUpgrade && _couponApplied
        ? Math.min(Number(_couponApplied.discount_amount) || 0, currentPrice)
        : 0;
    const _bestDiscount = Math.max(
      _promoDiscount,
      _affDiscount,
      _couponDiscount,
    );
    const _winner =
      _bestDiscount <= 0
        ? null
        : _couponDiscount >= _bestDiscount
          ? "coupon"
          : _affDiscount >= _bestDiscount
            ? "affiliate"
            : "promo";
    const _affPct = _winner === "affiliate" ? _affPctRaw : 0;
    const _affDiscountedPrice = Math.max(
      0,
      _roundCur(currentPrice - _bestDiscount),
    );
    const _fmtVnd = (v) =>
      (window.I18n?.formatNumber?.(v) || Number(v).toLocaleString()) +
      " \u0111";
    const _fmtMoney = (v) =>
      currency === "USD"
        ? "$" +
          Number(v).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        : _fmtVnd(v);
    const priceFormatted = _fmtMoney(_affDiscountedPrice);
    const _appliedChipPre = _couponApplied
      ? { code: _couponApplied.code, kind: "coupon" }
      : !_isProratedUpgrade && _affiliateDiscount?.ref_code && _affPctRaw > 0
        ? { code: _affiliateDiscount.ref_code, kind: "referral" }
        : null;
    const _chipInlineHtml = _appliedChipPre
      ? `
        <span style="display:inline-flex;align-items:center;gap:5px;background:rgba(204,255,0,0.10);border:1px solid rgba(204,255,0,0.30);border-radius:999px;padding:1px 4px 1px 9px;max-width:100%;">
          <span style="font-family:ui-monospace,monospace;font-size:11px;color:#e8e8e8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_appliedChipPre.code}</span>
          <button id="upgradeCodeClearBtn" type="button" title="${t("coupon.remove", "G\u1EE1 m\xE3")}"
            style="border:none;background:transparent;color:#9aa0a6;cursor:pointer;font-size:12px;line-height:1;padding:0 3px;">\u2715</button>
        </span>`
      : "";
    const _winnerLabel =
      _winner === "coupon"
        ? t("coupon.badgeCoupon", "M\xC3 GI\u1EA2M GI\xC1")
        : _winner === "affiliate"
          ? t("affiliate.referralShort", "gi\u1EDBi thi\u1EC7u")
          : t("coupon.badgePromo", "KHUY\u1EBEN M\xC3I");
    const _winnerPctText =
      _winner === "coupon"
        ? _couponApplied?.type === "percent"
          ? `-${Number(_couponApplied.value)}%`
          : `-${_fmtMoney(_couponDiscount)}`
        : _winner === "affiliate"
          ? `-${_affPctRaw}%`
          : `-${_promoPct}%`;
    let _multiNote = "";
    if (_winner) {
      const _others = [];
      if (_winner !== "coupon" && _couponDiscount > 0)
        _others.push(t("coupon.noteCoupon", "m\xE3 gi\u1EA3m gi\xE1"));
      if (_winner !== "affiliate" && _affDiscount > 0)
        _others.push(t("coupon.noteReferral", "m\xE3 gi\u1EDBi thi\u1EC7u"));
      if (_winner !== "promo" && _promoDiscount > 0)
        _others.push(t("coupon.notePromo", "khuy\u1EBFn m\xE3i"));
      if (_others.length) {
        _multiNote = `<div style="font-size:10.5px;color:#9aa0a6;margin-top:3px;text-align:center;">${t("coupon.noteBestApplied", "\u0110ang \xE1p m\u1EE9c gi\u1EA3m l\u1EDBn nh\u1EA5t.")} ${_affiliateDiscount?.ref_code ? t("coupon.noteRefStillCounted", "M\xE3 gi\u1EDBi thi\u1EC7u v\u1EABn \u0111\u01B0\u1EE3c ghi nh\u1EADn.") : ""}</div>`;
      }
    }
    const _badgeText = _appliedChipPre
      ? _winnerPctText
      : `${_winnerPctText} ${_winnerLabel}`;
    const affDiscountHtml =
      _bestDiscount > 0
        ? `
      <div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:3px;flex-wrap:wrap;">
        <span style="text-decoration:line-through;opacity:.45;font-size:12.5px;">${_fmtMoney(currentPrice)}</span>
        <span style="background:linear-gradient(90deg,#ccff00,#daff46);color:#1a1a1a;font-weight:700;font-size:10.5px;padding:1px 7px;border-radius:999px;white-space:nowrap;">${_badgeText}</span>
        ${_chipInlineHtml}
      </div>${_multiNote}`
        : "";
    const _refVal = (_affiliateDiscount?.ref_code || "").replace(
      /"/g,
      "&quot;",
    );
    const _msgColor =
      _codeMsg?.tone === "err"
        ? "#e0524d"
        : _codeMsg?.tone === "ok"
          ? "#8bc34a"
          : "#9aa0a6";
    const affInputHtml = _appliedChipPre
      ? _codeMsg?.text
        ? `<div id="upgradeRefMsg" style="font-size:11px;margin-top:6px;text-align:center;color:${_msgColor};">${_codeMsg.text}</div>`
        : ""
      : `
      <div style="display:flex;gap:6px;align-items:center;margin-top:10px;">
        <input id="upgradeRefInput" type="text" value="${_refVal}" placeholder="${t("coupon.inputPlaceholder", "M\xE3 gi\u1EA3m gi\xE1 / m\xE3 gi\u1EDBi thi\u1EC7u")}"
          style="flex:1;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:7px 10px;color:#fff;font-size:12.5px;outline:none;" />
        <button id="upgradeRefApplyBtn" type="button"
          style="padding:7px 14px;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:12.5px;background:linear-gradient(90deg,#ccff00,#daff46);color:#1a1a1a;">${t("affiliate.refApply", "\xC1p d\u1EE5ng")}</button>
      </div>
      <div id="upgradeRefMsg" style="font-size:11px;margin-top:4px;min-height:14px;text-align:center;color:${_msgColor};">${_codeMsg?.text || ""}</div>`;
    const toggleHtml = `
      <div class="upgrade-currency-toggle" title="${t("upgrade.currencyToggleHint", "\u0110\u1ED5i \u0111\u01A1n v\u1ECB ti\u1EC1n")}">
        <button class="currency-pill ${currency === "VND" ? "active" : ""}" data-currency="VND">VND</button>
        <button class="currency-pill ${currency === "USD" ? "active" : ""}" data-currency="USD">USD</button>
      </div>`;
    html += `
        <div class="upgrade-price-row">
          <div class="upgrade-price">${priceFormatted}</div>
          ${toggleHtml}
        </div>
        ${affDiscountHtml}
        <div class="upgrade-price-note">${cycleNoteMap[selectedBillingCycle] || ""}</div>
        ${affInputHtml}`;
    if (selectedPlan.content) {
      const renderedContent = window.PlanContentRenderer
        ? window.PlanContentRenderer.render(selectedPlan.content, {
            variant: "dark",
          })
        : selectedPlan.content;
      html += `
        <div class="upgrade-plan-content">${renderedContent}</div>
        <button class="upgrade-content-toggle" id="upgradeContentToggle" type="button" hidden
          aria-expanded="false" title="${t("upgrade.viewMore", "Xem th\xEAm")}">
          <span class="upgrade-content-toggle-label">${t("upgrade.viewMore", "Xem th\xEAm")}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </button>
      </div>
      `;
    } else {
      html += `
        <ul class="upgrade-feature-list">
          ${displayFeatures
            .map(
              (f) => `
            <li class="upgrade-feature-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
              ${f.name}: <strong>${f.display}</strong>
            </li>
          `,
            )
            .join("")}
        </ul>
      </div>
      `;
    }
    if (isUpgradeMode) {
      html +=
        '<div id="upgradeBreakdownContainer" class="upgrade-breakdown-container"></div>';
    }
    html += currentPlanCardHtml;
    container.innerHTML = html;
    container.querySelectorAll(".upgrade-plan-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedPlanId = parseInt(btn.dataset.planId, 10);
        _currentUpgradeQuote = null;
        _lastQuoteKey = null;
        _couponApplied = null;
        _codeMsg = null;
        renderUpgradeModal(plans);
      });
    });
    container.querySelectorAll(".cycle-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedBillingCycle = btn.dataset.cycle;
        _currentUpgradeQuote = null;
        _lastQuoteKey = null;
        _couponApplied = null;
        _codeMsg = null;
        renderUpgradeModal(plans);
      });
    });
    const _codeClearBtn = container.querySelector("#upgradeCodeClearBtn");
    if (_codeClearBtn) {
      _codeClearBtn.addEventListener("click", () => {
        if (_couponApplied) _couponApplied = null;
        else _affiliateDiscount = { percent: 0, ref_code: null };
        _codeMsg = null;
        renderUpgradeModal(plans);
      });
    }
    const _refApplyBtn = container.querySelector("#upgradeRefApplyBtn");
    if (_refApplyBtn) {
      const _applyCode = async () => {
        const input = container.querySelector("#upgradeRefInput");
        const msgEl = container.querySelector("#upgradeRefMsg");
        const code = (input?.value || "").trim();
        if (!code) return;
        _refApplyBtn.disabled = true;
        try {
          const r = await window.authManager._apiCall(
            "POST",
            "coupons/validate",
            {
              code,
              plan_slug: selectedPlan.slug,
              billing_cycle: selectedBillingCycle,
              currency,
              is_upgrade: _isProratedUpgrade,
            },
          );
          if (r?.ok && r.kind === "coupon") {
            _couponApplied = {
              code: r.code,
              discount_amount: Number(r.discount_amount) || 0,
              type: r.type,
              value: Number(r.value) || 0,
            };
            _codeMsg = null;
            renderUpgradeModal(plans);
          } else if (r?.ok && r.kind === "referral") {
            _affiliateDiscount = {
              percent: Number(r.value) || 0,
              ref_code: r.code || code,
            };
            _codeMsg =
              Number(r.value) > 0
                ? null
                : {
                    text: t(
                      "affiliate.refValidNoDiscount",
                      "M\xE3 h\u1EE3p l\u1EC7 (\u0111\u01A1n n\xE0y kh\xF4ng \u0111\u01B0\u1EE3c gi\u1EA3m th\xEAm).",
                    ),
                    tone: "muted",
                  };
            renderUpgradeModal(plans);
          } else {
            const reason = r?.reason_code || "NOT_FOUND";
            _codeMsg = { text: _couponReasonText(reason), tone: "err" };
            if (msgEl) {
              msgEl.textContent = _codeMsg.text;
              msgEl.style.color = "#e0524d";
            }
          }
        } catch (e) {
          const txt =
            e?.message ||
            t(
              "coupon.errNOT_FOUND",
              "M\xE3 kh\xF4ng h\u1EE3p l\u1EC7 ho\u1EB7c \u0111\xE3 h\u1EBFt h\u1EA1n.",
            );
          _codeMsg = { text: txt, tone: "err" };
          if (msgEl) {
            msgEl.textContent = txt;
            msgEl.style.color = "#e0524d";
          }
        } finally {
          _refApplyBtn.disabled = false;
        }
      };
      container
        .querySelector("#upgradeRefInput")
        ?.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") {
            ev.preventDefault();
            _applyCode();
          }
        });
      _refApplyBtn.addEventListener("click", async () => {
        await _applyCode();
      });
    }
    (() => {
      const _contentEl = container.querySelector(".upgrade-plan-content");
      const _toggleBtn = container.querySelector("#upgradeContentToggle");
      if (!_contentEl || !_toggleBtn) return;
      const _overflowing =
        _contentEl.scrollHeight > _contentEl.clientHeight + 8;
      if (!_overflowing) return;
      _toggleBtn.hidden = false;
      const _labelEl = _toggleBtn.querySelector(
        ".upgrade-content-toggle-label",
      );
      _toggleBtn.addEventListener("click", () => {
        const _open = _contentEl.classList.toggle("is-expanded");
        _toggleBtn.classList.toggle("is-expanded", _open);
        _toggleBtn.setAttribute("aria-expanded", String(_open));
        const _txt = _open
          ? t("upgrade.viewLess", "Thu g\u1ECDn")
          : t("upgrade.viewMore", "Xem th\xEAm");
        if (_labelEl) _labelEl.textContent = _txt;
        _toggleBtn.title = _txt;
      });
    })();
    container.querySelectorAll(".currency-pill").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const newCurrency = btn.dataset.currency;
        if (window.LocationCache?.setPreferredCurrency) {
          await window.LocationCache.setPreferredCurrency(newCurrency);
        }
        _currentUpgradeQuote = null;
        _lastQuoteKey = null;
        _couponApplied = null;
        _codeMsg = null;
        renderUpgradeModal(plans);
      });
    });
    if (!isUpgradeMode || availableCycles.length === 0) {
      _setPaymentSectionBlocked(false);
    }
    if (isUpgradeMode && availableCycles.length > 0) {
      const quoteKey = `${selectedPlanId}|${selectedBillingCycle}|${currency}`;
      const breakdownEl = container.querySelector("#upgradeBreakdownContainer");
      if (breakdownEl && _lastQuoteKey !== quoteKey) {
        breakdownEl.innerHTML = `<div class="upgrade-breakdown-loading">${_UPGRADE_ICONS.spinner}${t("upgrade.calculating", "Calculating credit...")}</div>`;
      }
      if (_lastQuoteKey === quoteKey) {
        if (_currentUpgradeQuote)
          _renderUpgradeBreakdown(_currentUpgradeQuote, currency);
        return;
      }
      const myKey = quoteKey;
      (async () => {
        const quote = await fetchUpgradeQuote(
          selectedPlanId,
          selectedBillingCycle,
          currency,
        );
        const currentCurrency = window.LocationCache?.getCurrency?.() || "VND";
        const currentKey = `${selectedPlanId}|${selectedBillingCycle}|${currentCurrency}`;
        if (currentKey !== myKey) {
          return;
        }
        if (_lastQuoteKey === myKey) {
          return;
        }
        _lastQuoteKey = myKey;
        _currentUpgradeQuote = quote;
        renderUpgradeModal(plans);
      })();
    }
  }
  function _setPaymentSectionBlocked(blocked) {
    const sec = document.getElementById("upgradePaymentMethods");
    if (!sec) return;
    const btns = sec.querySelector(".upgrade-payment-buttons");
    const label = sec.querySelector(".upgrade-payment-label");
    if (btns) btns.style.display = blocked ? "none" : "";
    if (label) label.style.display = blocked ? "none" : "";
  }
  function _renderUpgradeBreakdown(quote, currency) {
    const el = document.getElementById("upgradeBreakdownContainer");
    if (!el) return;
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    if (quote?._error_code) {
      const code = quote._error_code;
      const _blocked =
        code === "PRORATION_DOWNGRADE_NOT_SUPPORTED" ||
        code === "downgrade_not_supported" ||
        code === "PRORATION_LIFETIME_CANNOT_UPGRADE" ||
        code === "lifetime_cannot_upgrade";
      _setPaymentSectionBlocked(_blocked);
      if (
        code === "PRORATION_USE_RENEWAL_FLOW" ||
        code === "use_renewal_flow"
      ) {
        el.innerHTML = `
          <div class="upgrade-breakdown-info">
            ${_UPGRADE_ICONS.info}${t("upgrade.renewalNotice", "This is a renewal of the same plan. Click the payment button below to renew (time will be added).")}
          </div>`;
      } else if (
        code === "PRORATION_DOWNGRADE_NOT_SUPPORTED" ||
        code === "downgrade_not_supported"
      ) {
        el.innerHTML = `<div class="upgrade-breakdown-error">${_UPGRADE_ICONS.warning}${t("upgrade.errorDowngrade", "Downgrade is not supported")}</div>`;
      } else if (
        code === "PRORATION_LIFETIME_CANNOT_UPGRADE" ||
        code === "lifetime_cannot_upgrade"
      ) {
        el.innerHTML = `<div class="upgrade-breakdown-error">${_UPGRADE_ICONS.info}${t("upgrade.errorLifetimeCannot", "Lifetime plan cannot be upgraded")}</div>`;
      } else {
        el.innerHTML = "";
      }
      return;
    }
    _setPaymentSectionBlocked(false);
    if (!quote || !quote.credit || quote.credit <= 0) {
      el.innerHTML = "";
      return;
    }
    const fmt = (n) => {
      if (currency === "USD")
        return (
          "$" +
          Number(n).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        );
      return (
        (window.I18n?.formatNumber?.(n) || Number(n).toLocaleString()) +
        " \u0111"
      );
    };
    const fromName = quote.from_plan?.name || quote.from_plan?.slug || "";
    const newExpiresFmt = quote.new_expires_at
      ? new Date(quote.new_expires_at).toLocaleDateString(
          _upgradeDateLocale(),
          { day: "2-digit", month: "2-digit", year: "numeric" },
        )
      : "\u2014";
    const _cycleLabels = {
      monthly: t("upgrade.cycleMonthlyShort", "Monthly"),
      yearly: t("upgrade.cycleYearlyShort", "Yearly"),
      lifetime: t("upgrade.cycleLifetimeShort", "Lifetime"),
    };
    const toCycleLabel =
      _cycleLabels[quote.to_plan.billing_cycle] || quote.to_plan.billing_cycle;
    const _upgCouponDiscount = _couponApplied
      ? Math.min(
          Number(_couponApplied.discount_amount) || 0,
          Number(quote.final_amount) || 0,
        )
      : 0;
    const _upgFinalAmount = Math.max(
      0,
      (Number(quote.final_amount) || 0) - _upgCouponDiscount,
    );
    el.innerHTML = `
      <div class="upgrade-breakdown-card">
        <div class="upgrade-breakdown-row">
          <span>${quote.to_plan.name} <span class="upgrade-breakdown-cycle-tag">${toCycleLabel}</span></span>
          <span class="upgrade-breakdown-original-price">${fmt(quote.to_plan.price)}</span>
        </div>
        <div class="upgrade-breakdown-row upgrade-breakdown-credit-row">
          <span>${_UPGRADE_ICONS.credit}${t("upgrade.creditFromPlan", "Credit from {{plan}}").replace("{{plan}}", fromName)}</span>
          <span class="upgrade-breakdown-credit-amount">-${fmt(quote.credit)}</span>
        </div>
        ${
          _upgCouponDiscount > 0
            ? `
        <div class="upgrade-breakdown-row upgrade-breakdown-credit-row">
          <span>${_UPGRADE_ICONS.credit}${_couponApplied?.code || ""}</span>
          <span class="upgrade-breakdown-credit-amount">-${fmt(_upgCouponDiscount)}</span>
        </div>`
            : ""
        }
        <div class="upgrade-breakdown-divider"></div>
        <div class="upgrade-breakdown-row upgrade-breakdown-total-row">
          <span>${_UPGRADE_ICONS.card}${t("upgrade.youPay", "You Pay")}</span>
          <span class="upgrade-breakdown-final-amount">${fmt(_upgFinalAmount)}</span>
        </div>
        ${
          quote.savings_percent > 0
            ? `
          <div class="upgrade-breakdown-savings">${_UPGRADE_ICONS.sparkles}${t("upgrade.savingsPercent", "Save {{pct}}%").replace("{{pct}}", String(quote.savings_percent))}</div>
        `
            : ""
        }
      </div>
      <div class="upgrade-warning-box">
        ${_UPGRADE_ICONS.warning}${t(
          "upgrade.warningCreditConverted",
          "Your remaining {{oldPlan}} value ({{amount}}) has been converted to credit and applied to this invoice. Current {{oldPlan}} ends when you upgrade. New plan expires {{newExpiresAt}}.",
        )
          .replace(/\{\{oldPlan\}\}/g, fromName)
          .replace("{{amount}}", fmt(quote.credit))
          .replace("{{newExpiresAt}}", newExpiresFmt)}
      </div>
    `;
  }
  function showVietQRModal(data) {
    const existingModal = document.getElementById("vietqrPaymentOverlay");
    if (existingModal) existingModal.remove();
    const bankCode = data.bank_info?.bank || data.bank_code || "";
    const bankName = BANK_NAMES[bankCode] || bankCode;
    const overlay = document.createElement("div");
    overlay.id = "vietqrPaymentOverlay";
    overlay.className = "vietqr-payment-overlay";
    overlay.innerHTML = `
      <div class="vietqr-payment-modal">
        <div class="vietqr-payment-header">
          <h3>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M7 7h.01"/>
              <path d="M17 7h.01"/>
              <path d="M7 17h.01"/>
              <path d="M17 17h.01"/>
            </svg>
            ${window.I18n?.t("upgrade.bankTransfer") || "Bank Transfer Payment"}
          </h3>
          <button class="vietqr-close-btn" id="vietqrCloseBtn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="vietqr-payment-body">
          <div class="vietqr-qr-container">
            <img src="${data.qr_url}" alt="QR Code" class="vietqr-qr-image" />
          </div>
          <div class="vietqr-info-section">
            <div class="vietqr-info-row">
              <span class="vietqr-info-label">${window.I18n?.t("upgrade.bankName") || "Bank"}</span>
              <span class="vietqr-info-value">${bankName}</span>
            </div>
            <div class="vietqr-info-row">
              <span class="vietqr-info-label">${window.I18n?.t("upgrade.accountNo") || "Account No."}</span>
              <span class="vietqr-info-value vietqr-copyable" data-copy="${data.bank_info?.account_no || data.account_no}">
                ${data.bank_info?.account_no || data.account_no}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </span>
            </div>
            <div class="vietqr-info-row">
              <span class="vietqr-info-label">${window.I18n?.t("upgrade.accountName") || "Account Holder"}</span>
              <span class="vietqr-info-value">${data.bank_info?.account_name || data.account_name}</span>
            </div>
            <div class="vietqr-info-row vietqr-amount-row">
              <span class="vietqr-info-label">${window.I18n?.t("upgrade.amount") || "Amount"}</span>
              <span class="vietqr-info-value vietqr-amount">${window.I18n?.formatNumber?.(data.amount || 0) || (data.amount || 0).toLocaleString()}\u0111</span>
            </div>
            <div class="vietqr-info-row">
              <span class="vietqr-info-label">${window.I18n?.t("upgrade.transferContent") || "Transfer Note"}</span>
              <span class="vietqr-info-value vietqr-copyable vietqr-transfer-content" data-copy="${data.transfer_content}">
                ${data.transfer_content}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </span>
            </div>
          </div>
          <div class="vietqr-notice">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4"/>
              <path d="M12 8h.01"/>
            </svg>
            <span>${window.I18n?.t("upgrade.transferNotice") || "Please enter the exact transfer note so your order can be processed automatically."}</span>
          </div>
          <button class="btn vietqr-confirm-btn" id="vietqrConfirmBtn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            ${window.I18n?.t("upgrade.transferred") || "I have transferred"}
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelectorAll(".vietqr-copyable").forEach((el) => {
      el.addEventListener("click", async () => {
        const textToCopy = el.dataset.copy;
        try {
          await navigator.clipboard.writeText(textToCopy);
          el.classList.add("copied");
          setTimeout(() => el.classList.remove("copied"), 1500);
        } catch (e) {
          console.error("[TobyFlow] Copy failed:", e);
        }
      });
    });
    let pollingInterval = null;
    const POLL_INTERVAL_MS = 1e4;
    const POLL_TIMEOUT_MS = 3e5;
    const orderId = data.order_id;
    function stopPolling() {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    }
    function removeOverlay() {
      stopPolling();
      overlay.remove();
    }
    const closeBtn = overlay.querySelector("#vietqrCloseBtn");
    closeBtn?.addEventListener("click", () => {
      removeOverlay();
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        removeOverlay();
      }
    });
    const confirmBtn = overlay.querySelector("#vietqrConfirmBtn");
    confirmBtn?.addEventListener("click", () => {
      if (!window.authManager?.isLoggedIn() || !orderId) {
        removeOverlay();
        if (window.customDialog) {
          window.customDialog.alert(
            window.I18n?.t("upgrade.orderReceived") ||
              "Thank you! Your order will be processed within 24 hours after we confirm payment.",
            {
              title:
                window.I18n?.t("upgrade.orderReceivedTitle") ||
                "Order Received",
              type: "success",
            },
          );
        }
        return;
      }
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="vietqr-spinner">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
        ${window.I18n?.t("app.checking") || "Checking..."}
      `;
      confirmBtn.style.opacity = "0.7";
      confirmBtn.style.cursor = "not-allowed";
      const pollStartTime = Date.now();
      async function checkOrderStatus() {
        try {
          const response = await window.authManager._apiCall(
            "GET",
            `billing/orders/${orderId}/status`,
          );
          const status = response?.data?.status || response?.status;
          if (status === "paid") {
            stopPolling();
            removeOverlay();
            if (window.customDialog) {
              window.customDialog.alert(
                window.I18n?.t("upgrade.paymentSuccess") ||
                  "Payment successful! Your plan has been activated.",
                {
                  title:
                    window.I18n?.t("upgrade.paymentSuccessTitle") ||
                    "Payment Successful",
                  type: "success",
                },
              );
            }
            if (window.featureGate?.refreshAsync) {
              try {
                await window.featureGate.refreshAsync();
              } catch (e) {
                console.error(
                  "[TobyFlow] Failed to refresh entitlements after payment:",
                  e,
                );
              }
            }
            return;
          }
        } catch (err) {
          console.error("[TobyFlow] Payment status check failed:", err.message);
        }
        if (Date.now() - pollStartTime >= POLL_TIMEOUT_MS) {
          stopPolling();
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            ${window.I18n?.t("upgrade.transferred") || "I have transferred"}
          `;
          confirmBtn.style.opacity = "";
          confirmBtn.style.cursor = "";
          if (window.customDialog) {
            window.customDialog.alert(
              window.I18n?.t("upgrade.paymentPending") ||
                "Payment not received yet. Your order will be processed when admin confirms.",
              {
                title:
                  window.I18n?.t("upgrade.paymentPendingTitle") ||
                  "Awaiting Confirmation",
                type: "info",
              },
            );
          }
        }
      }
      checkOrderStatus();
      pollingInterval = setInterval(checkOrderStatus, POLL_INTERVAL_MS);
    });
  }
  function showPlanActivatedOverlay(data) {
    const existingOverlay = document.getElementById("planActivatedOverlay");
    if (existingOverlay) existingOverlay.remove();
    const planName = data.plan_name || data.plan_slug || "Premium";
    const billingCycleText =
      {
        monthly: window.I18n?.t("upgrade.monthly") || "Monthly",
        yearly: window.I18n?.t("upgrade.yearly") || "Yearly",
        lifetime: window.I18n?.t("upgrade.lifetime") || "Lifetime",
      }[data.billing_cycle] || data.billing_cycle;
    const overlay = document.createElement("div");
    overlay.id = "planActivatedOverlay";
    overlay.className = "plan-activated-overlay";
    overlay.innerHTML = `
      <div class="plan-activated-modal">
        <div class="plan-activated-confetti"></div>
        <div class="plan-activated-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <h2 class="plan-activated-title">
          ${window.I18n?.t("upgrade.activatedTitle") || "\u{1F389} Activation Successful!"}
        </h2>
        <p class="plan-activated-message">
          ${window.I18n?.t("upgrade.activatedMessage", { plan: planName }) || `Congratulations, you've upgraded to <strong>${planName}</strong>!`}
        </p>
        <div class="plan-activated-details">
          <div class="plan-activated-detail-row">
            <span class="plan-activated-detail-label">${window.I18n?.t("upgrade.plan") || "Plan"}</span>
            <span class="plan-activated-detail-value">${planName}</span>
          </div>
          <div class="plan-activated-detail-row">
            <span class="plan-activated-detail-label">${window.I18n?.t("upgrade.cycle") || "Billing"}</span>
            <span class="plan-activated-detail-value">${billingCycleText}</span>
          </div>
          ${
            data.order_invoice_number
              ? `
          <div class="plan-activated-detail-row">
            <span class="plan-activated-detail-label">${window.I18n?.t("upgrade.orderNo") || "Order"}</span>
            <span class="plan-activated-detail-value plan-activated-order-no">${data.order_invoice_number}</span>
          </div>
          `
              : ""
          }
        </div>
        <p class="plan-activated-thanks">
          ${window.I18n?.t("upgrade.thanksMessage") || "Thank you for trusting us! \u{1F49A}"}
        </p>
        <button class="btn plan-activated-btn" id="planActivatedCloseBtn">
          ${window.I18n?.t("upgrade.startUsing") || "Start using"}
        </button>
      </div>
    `;
    document.body.appendChild(overlay);
    const closeActivated = () => {
      clearTimeout(autoCloseTimer);
      if (!overlay.isConnected) return;
      overlay.remove();
      showUpgradeMaxSpeedIntro();
    };
    const autoCloseTimer = setTimeout(closeActivated, 15e3);
    const closeBtn = overlay.querySelector("#planActivatedCloseBtn");
    closeBtn?.addEventListener("click", () => {
      closeActivated();
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        closeActivated();
      }
    });
    setTimeout(() => {
      overlay
        .querySelector(".plan-activated-confetti")
        ?.classList.add("active");
    }, 100);
    console.log(
      "[TobyFlow] Plan activated overlay shown for order:",
      data.order_id,
    );
  }
  function showUpgradeMaxSpeedIntro() {
    const available = () =>
      window.featureGate?.isInitialized?.() === true &&
      window.featureGate?.canUse?.("flow_api_enabled") === true &&
      ["v1", "v2", "v2_canary", "auto"].includes(
        window.SystemConfig?.get?.("flow_api_driver", null),
      );
    if (!available() || document.getElementById("upgradeMaxSpeedIntro")) return;
    const t = (key, fallback) => {
      const text = window.I18n?.t("upgrade." + key);
      return text && text !== "upgrade." + key ? text : fallback;
    };
    const overlay = document.createElement("div");
    overlay.id = "upgradeMaxSpeedIntro";
    overlay.className = "max-speed-intro-overlay";
    overlay.innerHTML = `
      <div class="tobyflow-onboarding-tooltip max-speed-intro-modal" role="dialog" aria-modal="true" aria-labelledby="maxSpeedIntroTitle" aria-describedby="maxSpeedIntroCopy" tabindex="-1">
        <div class="tobyflow-onboarding-tooltip__content">
          <div class="max-speed-intro-heading">
            <svg class="max-speed-intro-bolt" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 3 14h8l-1 8 11-13h-8l1-7Z"/></svg>
            <h3 id="maxSpeedIntroTitle"></h3>
          </div>
          <p id="maxSpeedIntroCopy"></p>
          <div class="max-speed-intro-benefits"><p id="maxSpeedIntroBenefit1"></p><p id="maxSpeedIntroBenefit2"></p></div>
        </div>
        <div class="tobyflow-onboarding-tooltip__footer max-speed-intro-actions">
          <button type="button" class="btn btn-secondary btn-sm" id="maxSpeedIntroWeb"></button>
          <button type="button" class="btn btn-primary btn-sm" id="maxSpeedIntroStart"><svg class="max-speed-intro-bolt" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 3 14h8l-1 8 11-13h-8l1-7Z"/></svg><span></span></button>
        </div>
      </div>`;
    overlay.querySelector("#maxSpeedIntroTitle").textContent = t(
      "maxSpeedTitle",
      "Speed up Flow with Max Speed mode",
    );
    overlay.querySelector("#maxSpeedIntroCopy").textContent = t(
      "maxSpeedCopy",
      "Connect directly to Flow API, without clicking through the web interface",
    );
    overlay.querySelector("#maxSpeedIntroBenefit1").textContent =
      "\u2713 " + t("maxSpeedBenefit1", "Create images & videos faster");
    overlay.querySelector("#maxSpeedIntroBenefit2").textContent =
      "\u2713 " + t("maxSpeedBenefit2", "Workflows retain results long-term");
    const web = overlay.querySelector("#maxSpeedIntroWeb");
    web.textContent = t("maxSpeedWeb", "Use web mode");
    const start = overlay.querySelector("#maxSpeedIntroStart");
    start.querySelector("span").textContent = t(
      "maxSpeedStart",
      "Enable Max Speed",
    );
    const previousFocus = document.activeElement;
    const close = () => {
      document.removeEventListener("keydown", keydown);
      overlay.remove();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
    const keydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "Tab") {
        event.preventDefault();
        (document.activeElement === web ? start : web).focus();
      }
    };
    web.addEventListener("click", close);
    start.addEventListener("click", () => {
      if (!available()) {
        close();
        return;
      }
      chrome.runtime.sendMessage({
        action: "openSettings",
        tab: "ai-platform",
      });
      close();
    });
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    document.body.appendChild(overlay);
    document.addEventListener("keydown", keydown);
    web.focus();
  }
  window.showUpgradeMaxSpeedIntro = showUpgradeMaxSpeedIntro;
  const _flowApiLimitAdviceSeen = new Set();
  const _flowApiBotFailureAt = new Map();
  const FLOW_API_BOT_FAILURE_WINDOW_MS = 2 * 60 * 1e3;
  const FLOW_API_BOT_FAILURE_THRESHOLD = 2;
  function registerFlowApiBotFailure(data = {}) {
    const key = String(data.jobId || data.itemId || "");
    if (!key) return 0;
    const now = Date.now();
    for (const [candidate, at] of _flowApiBotFailureAt) {
      if (now - at > FLOW_API_BOT_FAILURE_WINDOW_MS)
        _flowApiBotFailureAt.delete(candidate);
    }
    if (!_flowApiBotFailureAt.has(key)) _flowApiBotFailureAt.set(key, now);
    return _flowApiBotFailureAt.size;
  }
  async function switchFutureFlowGenerationsToWeb() {
    const stored = await chrome.storage.local.get([
      "af_settings",
      "af_settings_touched",
    ]);
    const current =
      stored?.af_settings || window.storageSettings?.getSettings?.() || {};
    const settings = { ...current, defaultGenMode: "web" };
    const touched = new Set(
      Array.isArray(stored?.af_settings_touched)
        ? stored.af_settings_touched
        : [],
    );
    touched.add("defaultGenMode");
    await chrome.storage.local.set({
      af_settings: settings,
      af_settings_touched: [...touched],
    });
    return true;
  }
  function showFlowApiWebFallbackAdvice(failureCount) {
    if (document.getElementById("flowApiWebFallbackAdvice")) return;
    document
      .getElementById("flowApiLimitAdvice")
      ?.querySelector("#flowApiLimitAdviceLater")
      ?.click?.();
    const t = (key, fallback) => {
      const value = window.I18n?.t?.(`gen.${key}`);
      return value && value !== `gen.${key}` ? value : fallback;
    };
    const overlay = document.createElement("div");
    overlay.id = "flowApiWebFallbackAdvice";
    overlay.className = "max-speed-intro-overlay flow-api-limit-advice-overlay";
    overlay.innerHTML = `
      <div class="tobyflow-onboarding-tooltip max-speed-intro-modal flow-api-limit-advice-modal" role="dialog" aria-modal="true" aria-labelledby="flowApiWebFallbackAdviceTitle" aria-describedby="flowApiWebFallbackAdviceCopy" tabindex="-1">
        <button type="button" class="flow-api-limit-advice-close" id="flowApiWebFallbackAdviceLater"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
        <div class="tobyflow-onboarding-tooltip__content">
          <div class="max-speed-intro-heading">
            <span class="flow-api-limit-advice-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.5 2.7 17a2 2 0 0 0 1.74 3h15.12a2 2 0 0 0 1.74-3L13.7 3.5a2 2 0 0 0-3.4 0Z"/></svg></span>
            <h3 id="flowApiWebFallbackAdviceTitle"></h3>
          </div>
          <p id="flowApiWebFallbackAdviceCopy"></p>
        </div>
        <div class="tobyflow-onboarding-tooltip__footer max-speed-intro-actions">
          <button type="button" class="btn btn-secondary btn-sm" id="flowApiWebFallbackAdviceLaterFooter"></button>
          <button type="button" class="btn btn-primary btn-sm" id="flowApiWebFallbackAdviceSwitch"><span></span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg></button>
        </div>
      </div>`;
    overlay.querySelector("#flowApiWebFallbackAdviceTitle").textContent = t(
      "flowApiBotFallbackTitle",
      "Max Speed is being blocked repeatedly",
    );
    overlay.querySelector("#flowApiWebFallbackAdviceCopy").textContent = t(
      "flowApiBotFallbackDesc",
      `Google blocked ${failureCount} Max Speed requests in a short time. Switch future Flow generations to Web mode?`,
    );
    const later = overlay.querySelector("#flowApiWebFallbackAdviceLater");
    const laterFooter = overlay.querySelector(
      "#flowApiWebFallbackAdviceLaterFooter",
    );
    const switchMode = overlay.querySelector("#flowApiWebFallbackAdviceSwitch");
    const laterText = t("flowApiBotFallbackLater", "Keep Max Speed");
    later.title = laterText;
    later.setAttribute?.("aria-label", laterText);
    laterFooter.textContent = laterText;
    switchMode.querySelector("span").textContent = t(
      "flowApiBotFallbackSwitch",
      "Switch to Web mode",
    );
    const previousFocus = document.activeElement;
    const close = () => {
      document.removeEventListener("keydown", keydown);
      overlay.remove();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
    const keydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "Tab") {
        event.preventDefault();
        (document.activeElement === switchMode
          ? laterFooter
          : switchMode
        ).focus();
      }
    };
    later.addEventListener("click", close);
    laterFooter.addEventListener("click", close);
    switchMode.addEventListener("click", async () => {
      switchMode.disabled = true;
      try {
        await switchFutureFlowGenerationsToWeb();
        const message = t(
          "flowApiBotFallbackApplied",
          "Future Flow generations will use Web mode.",
        );
        window.showNotification?.(message, "success", 5e3);
        close();
      } catch (error) {
        switchMode.disabled = false;
        console.warn(
          "[Flow API] Could not switch future generations to Web mode:",
          error?.message || error,
        );
      }
    });
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    document.body.appendChild(overlay);
    document.addEventListener("keydown", keydown);
    switchMode.focus();
  }
  async function routeFlowApiLimitAdvice(data = {}) {
    try {
      if (
        window.FlowCookieRecovery &&
        (await window.BridgeClient?.supportsFlowCookieRecovery?.())
      )
        return;
    } catch (_) {}
    showFlowApiLimitAdvice(data);
  }
  function showFlowApiLimitAdvice(data = {}) {
    if (data.errorType !== "bot_detected") return;
    if (data.recoveryMode !== "pause_resume" || data.owner !== "prompts")
      return;
    const botFailureCount = registerFlowApiBotFailure(data);
    if (botFailureCount >= FLOW_API_BOT_FAILURE_THRESHOLD) {
      showFlowApiWebFallbackAdvice(botFailureCount);
      return;
    }
    const runtimeDriver = window.SystemConfig?.get?.("flow_api_driver", null);
    if (runtimeDriver === "v1" || runtimeDriver === "v2") return;
    const dedupeKey = String(data.jobId || data.itemId || "current");
    if (
      _flowApiLimitAdviceSeen.has(dedupeKey) ||
      document.getElementById("flowApiLimitAdvice")
    )
      return;
    _flowApiLimitAdviceSeen.add(dedupeKey);
    if (_flowApiLimitAdviceSeen.size > 100) {
      _flowApiLimitAdviceSeen.delete(
        _flowApiLimitAdviceSeen.values().next().value,
      );
    }
    const t = (key, fallback) => {
      const value = window.I18n?.t?.(`gen.${key}`);
      return value && value !== `gen.${key}` ? value : fallback;
    };
    const overlay = document.createElement("div");
    overlay.id = "flowApiLimitAdvice";
    overlay.className = "max-speed-intro-overlay flow-api-limit-advice-overlay";
    overlay.innerHTML = `
      <div class="tobyflow-onboarding-tooltip max-speed-intro-modal flow-api-limit-advice-modal" role="dialog" aria-modal="true" aria-labelledby="flowApiLimitAdviceTitle" aria-describedby="flowApiLimitAdviceCopy" tabindex="-1">
        <button type="button" class="flow-api-limit-advice-close" id="flowApiLimitAdviceLater"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
        <div class="tobyflow-onboarding-tooltip__content">
          <div class="max-speed-intro-heading">
            <span class="flow-api-limit-advice-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.5 2.7 17a2 2 0 0 0 1.74 3h15.12a2 2 0 0 0 1.74-3L13.7 3.5a2 2 0 0 0-3.4 0Z"/></svg></span>
            <h3 id="flowApiLimitAdviceTitle"></h3>
          </div>
          <p id="flowApiLimitAdviceCopy"></p>
        </div>
        <div class="tobyflow-onboarding-tooltip__footer max-speed-intro-actions">
          <button type="button" class="btn btn-primary btn-sm" id="flowApiLimitAdviceSwitch"><span></span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg></button>
        </div>
      </div>`;
    overlay.querySelector("#flowApiLimitAdviceTitle").textContent = t(
      "flowApiLimitTitle",
      "Google Flow API is temporarily limited",
    );
    overlay.querySelector("#flowApiLimitAdviceCopy").textContent = t(
      "flowApiLimitDesc",
      "Google temporarily blocked the Max Speed request due to unusual activity. TobyFlow keeps the current Max Speed API version; wait about 2 minutes, then click Resume.",
    );
    const later = overlay.querySelector("#flowApiLimitAdviceLater");
    const commonClose = window.I18n?.t?.("common.close");
    const laterLabel =
      commonClose && commonClose !== "common.close"
        ? commonClose
        : t("flowApiLimitLater", "Later");
    later.title = laterLabel;
    later.setAttribute?.("aria-label", laterLabel);
    const switchMode = overlay.querySelector("#flowApiLimitAdviceSwitch");
    switchMode.querySelector("span").textContent = t(
      "flowApiLimitSwitch",
      "Open Flow API settings",
    );
    const previousFocus = document.activeElement;
    const close = () => {
      document.removeEventListener("keydown", keydown);
      overlay.remove();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
    const keydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "Tab") {
        event.preventDefault();
        (document.activeElement === later ? switchMode : later).focus();
      }
    };
    later.addEventListener("click", close);
    switchMode.addEventListener("click", () => {
      try {
        chrome.runtime
          .sendMessage({ action: "openSettings", tab: "flow-api" })
          ?.catch?.(() => {});
      } catch (_) {}
      close();
    });
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    document.body.appendChild(overlay);
    document.addEventListener("keydown", keydown);
    switchMode.focus();
  }
  function setupUpgradeUI() {
    if (window.eventBus && !setupUpgradeUI._flowApiLimitAdviceBound) {
      setupUpgradeUI._flowApiLimitAdviceBound = true;
      window.eventBus.on("execution:api_unusual_activity", (data) => {
        void routeFlowApiLimitAdvice(data);
      });
      window.eventBus.on("execution:flow_cookie_recovery", (data) => {
        void window.FlowCookieRecovery?.show(data);
      });
    }
    const upgradeBtn = document.getElementById("upgradeBtn");
    const upgradeOverlay = document.getElementById("upgradeOverlay");
    const upgradeCloseBtn = document.getElementById("upgradeCloseBtn");
    async function openUpgradeModal() {
      if (window.SystemConfig?.getBool("show_upgrade_ui") === false) {
        const contactUrl = window.SystemConfig?.get("upgrade_contact_url", "");
        if (contactUrl) {
          window.open(contactUrl, "_blank");
        }
        return;
      }
      if (upgradeOverlay && upgradeOverlay.parentElement !== document.body) {
        document.body.appendChild(upgradeOverlay);
      }
      if (upgradeOverlay) upgradeOverlay.classList.remove("hidden");
      const _upgradeFooter = upgradeOverlay?.querySelector(
        ".upgrade-modal-footer",
      );
      if (_upgradeFooter) {
        _upgradeFooter.style.animation = "none";
        _upgradeFooter.offsetHeight;
        _upgradeFooter.style.animation = "";
      }
      const [plans, activeProviders] = await Promise.all([
        fetchPlans(),
        fetchActiveProviders(),
      ]);
      if (plans) {
        window._cachedPlans = plans;
        await _tryAutoApplyStoredRef();
        renderUpgradeModal(plans);
      }
      window._cachedActiveProviders = activeProviders;
      _applyActiveProviders(activeProviders);
    }
    function _applyActiveProviders(input) {
      const vietqrBtn = document.getElementById("payVietQR");
      const sepayBtn = document.getElementById("paySePay");
      const stripeBtn = document.getElementById("payStripe");
      const paypalBtn = document.getElementById("payPayPal");
      const polarBtn = document.getElementById("payPolar");
      const lemonsqueezyBtn = document.getElementById("payLemonsqueezy");
      const paymentSection = document.getElementById("upgradePaymentMethods");
      const paymentButtons = paymentSection?.querySelector(
        ".upgrade-payment-buttons",
      );
      let providers, labels;
      if (Array.isArray(input)) {
        providers = input;
        labels = {};
      } else if (input && typeof input === "object") {
        providers = input.providers || [];
        labels = input.labels || {};
      } else {
        return;
      }
      const currency = window.LocationCache?.getCurrency?.() || "VND";
      const isVND = currency === "VND";
      const hasVietQR = providers.includes("vietqr") && isVND;
      const hasSePay = providers.includes("sepay") && isVND;
      const hasStripe = providers.includes("stripe") && !isVND;
      const hasPayPal = providers.includes("paypal") && !isVND;
      const hasPolar = providers.includes("polar") && !isVND;
      const hasLemonsqueezy = providers.includes("lemonsqueezy") && !isVND;
      const activeCount =
        (hasVietQR ? 1 : 0) +
        (hasSePay ? 1 : 0) +
        (hasStripe ? 1 : 0) +
        (hasPayPal ? 1 : 0) +
        (hasPolar ? 1 : 0) +
        (hasLemonsqueezy ? 1 : 0);
      if (vietqrBtn) vietqrBtn.classList.toggle("hidden", !hasVietQR);
      if (sepayBtn) sepayBtn.classList.toggle("hidden", !hasSePay);
      if (stripeBtn) stripeBtn.classList.toggle("hidden", !hasStripe);
      if (paypalBtn) paypalBtn.classList.toggle("hidden", !hasPayPal);
      if (polarBtn) polarBtn.classList.toggle("hidden", !hasPolar);
      if (lemonsqueezyBtn)
        lemonsqueezyBtn.classList.toggle("hidden", !hasLemonsqueezy);
      const _applyLabel = (btn, providerKey) => {
        if (!btn) return;
        const span = btn.querySelector(":scope > span");
        if (!span) return;
        if (!span.dataset.defaultLabel)
          span.dataset.defaultLabel = span.textContent || "";
        const override = labels?.[providerKey];
        span.textContent =
          typeof override === "string" && override.trim() !== ""
            ? override.trim()
            : span.dataset.defaultLabel;
        const hint = btn.querySelector(":scope > small")?.textContent?.trim();
        btn.title = hint
          ? `${span.textContent} \u2014 ${hint}`
          : span.textContent;
      };
      _applyLabel(vietqrBtn, "vietqr");
      _applyLabel(sepayBtn, "sepay");
      _applyLabel(stripeBtn, "stripe");
      _applyLabel(paypalBtn, "paypal");
      _applyLabel(polarBtn, "polar");
      _applyLabel(lemonsqueezyBtn, "lemonsqueezy");
      if (paymentButtons) {
        paymentButtons.classList.toggle("single-provider", activeCount === 1);
        paymentButtons.classList.toggle("two-providers", activeCount === 2);
        paymentButtons.classList.toggle("four-providers", activeCount === 4);
      }
      if (paymentSection) {
        paymentSection.classList.toggle("hidden", activeCount === 0);
      }
    }
    if (window.eventBus) {
      window.eventBus.on("location:currency_changed", async () => {
        const cached = window._cachedActiveProviders;
        if (cached) {
          _applyActiveProviders(cached);
        } else {
          const providers = await fetchActiveProviders();
          if (providers) {
            window._cachedActiveProviders = providers;
            _applyActiveProviders(providers);
          }
        }
      });
    }
    window.openUpgradeModal = openUpgradeModal;
    if (upgradeBtn) {
      upgradeBtn.addEventListener("click", () => {
        const userDropdown = document.getElementById("userDropdown");
        if (userDropdown) userDropdown.classList.add("hidden");
        openUpgradeModal();
      });
    }
    const footerUpgradeBtn = document.getElementById("footerUpgradeBtn");
    if (footerUpgradeBtn) {
      footerUpgradeBtn.addEventListener("click", openUpgradeModal);
    }
    const footerRegisterBtn = document.getElementById("footerRegisterBtn");
    if (footerRegisterBtn) {
      footerRegisterBtn.addEventListener("click", () => {
        if (loginOverlay) loginOverlay.classList.remove("hidden");
      });
    }
    const footerPremiumBtn = document.getElementById("footerPremiumBtn");
    const premiumBenefitsOverlay = document.getElementById(
      "premiumBenefitsOverlay",
    );
    const premiumBenefitsCloseBtn = document.getElementById(
      "premiumBenefitsCloseBtn",
    );
    const premiumBenefitsContent = document.getElementById(
      "premiumBenefitsContent",
    );
    const premiumBenefitsTitle = document.getElementById(
      "premiumBenefitsTitle",
    );
    if (footerPremiumBtn && premiumBenefitsOverlay) {
      footerPremiumBtn.addEventListener("click", async () => {
        if (premiumBenefitsTitle) {
          const user = window.authManager?.getUser();
          const planDisplayName =
            user?.plan_slug === "autoflow-pro" ||
            user?.plan_slug === "autogrok-pro"
              ? "Pro"
              : "Premium";
          premiumBenefitsTitle.textContent = `${planDisplayName} benefits`;
        }
        premiumBenefitsOverlay.classList.remove("hidden");
        await renderPremiumBenefits();
      });
    }
    if (premiumBenefitsCloseBtn && premiumBenefitsOverlay) {
      premiumBenefitsCloseBtn.addEventListener("click", () => {
        premiumBenefitsOverlay.classList.add("hidden");
      });
    }
    if (premiumBenefitsOverlay) {
      premiumBenefitsOverlay.addEventListener("click", (e) => {
        if (e.target === premiumBenefitsOverlay) {
          premiumBenefitsOverlay.classList.add("hidden");
        }
      });
    }
    async function renderPremiumBenefits() {
      if (!premiumBenefitsContent) return;
      premiumBenefitsContent.innerHTML = `<div class="upgrade-loading">${window.I18n?.t("common.loading") || "Loading..."}</div>`;
      try {
        const plans = await fetchPlans();
        if (plans) window._cachedPlans = plans;
        const user = window.authManager?.getUser();
        const userPlanSlug = user?.plan_slug;
        let premiumPlan = userPlanSlug
          ? plans?.find((p) => p.slug === userPlanSlug)
          : null;
        if (!premiumPlan) {
          premiumPlan = plans?.find(
            (p) => p.slug !== "free" && p.slug !== "trial",
          );
        }
        if (!premiumPlan) {
          premiumBenefitsContent.innerHTML = `<p style="color: var(--text-secondary); text-align: center;">${window.I18n?.t("upgrade.noBenefits") || "No benefit information available."}</p>`;
          return;
        }
        if (premiumPlan.content) {
          const rendered = window.PlanContentRenderer
            ? window.PlanContentRenderer.render(premiumPlan.content, {
                variant: "dark",
              })
            : "";
          if (rendered) {
            premiumBenefitsContent.innerHTML = `<div class="premium-plan-content">${rendered}</div>`;
            return;
          }
        }
        if (!premiumPlan.features?.length) {
          premiumBenefitsContent.innerHTML = `<p style="color: var(--text-secondary); text-align: center;">${window.I18n?.t("upgrade.noBenefits") || "No benefit information available."}</p>`;
          return;
        }
        let html = '<ul class="premium-benefits-list">';
        premiumPlan.features.forEach((f) => {
          const value =
            f.value === "true" || f.value === "-1" || f.value === "unlimited"
              ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'
              : `<span class="benefit-value">${f.value === "-1" ? "\u221E" : f.value}</span>`;
          html += `
            <li class="premium-benefit-item">
              <span class="benefit-check">${value}</span>
              <span class="benefit-label">${f.name || f.key}</span>
            </li>`;
        });
        html += "</ul>";
        premiumBenefitsContent.innerHTML = html;
      } catch (e) {
        console.error("[TobyFlow] Failed to load premium benefits:", e);
        premiumBenefitsContent.innerHTML = `<p style="color: var(--text-error); text-align: center;">${window.I18n?.t("upgrade.loadBenefitsFailed") || "Unable to load benefits. Please try again."}</p>`;
      }
    }
    if (upgradeCloseBtn) {
      upgradeCloseBtn.addEventListener("click", () => {
        if (upgradeOverlay) upgradeOverlay.classList.add("hidden");
      });
    }
    let _paymentSpeedupCleanup = null;
    function _setupPaymentSpeedup(orderId) {
      if (_paymentSpeedupCleanup) {
        try {
          _paymentSpeedupCleanup();
        } catch (_) {}
        _paymentSpeedupCleanup = null;
      }
      const tryActivate = () => {
        const mode = window.SseClient?.getMode?.();
        if (mode !== "polling") {
          console.log(
            "[Payment Speedup] Mode is",
            mode,
            "\u2014 skip speedup (premium ho\u1EB7c not initialized)",
          );
          return false;
        }
        try {
          window.SseClient.setPollingInterval(3e3);
          console.log("[Payment Speedup] Polling boost 3s for order:", orderId);
        } catch (e) {}
        return true;
      };
      const restore = () => {
        try {
          window.SseClient?.setPollingInterval?.(3e4);
        } catch (_) {}
      };
      const handler = (data) => {
        if (!orderId || String(data?.order_id) === String(orderId)) {
          console.log(
            "[Payment Speedup] plan_activated received, restore polling 30s",
          );
          restore();
          cleanup();
        }
      };
      window.eventBus?.on?.("sse:plan_activated", handler);
      const safetyTimer = setTimeout(
        () => {
          console.log(
            "[Payment Speedup] 30min safety timeout, restore polling 30s",
          );
          restore();
          cleanup();
        },
        30 * 60 * 1e3,
      );
      const cleanup = () => {
        clearTimeout(safetyTimer);
        clearTimeout(deferTimer);
        try {
          window.eventBus?.off?.("sse:plan_activated", handler);
        } catch (_) {}
        try {
          window.eventBus?.off?.("sse:connected", deferHandler);
        } catch (_) {}
        _paymentSpeedupCleanup = null;
      };
      let deferTimer = null;
      const deferHandler = () => {
        if (tryActivate()) {
          if (deferTimer) clearTimeout(deferTimer);
        }
      };
      if (!tryActivate()) {
        console.log(
          "[Payment Speedup] Defer activate \u2014 ch\u1EDD sse:connected ho\u1EB7c 5s timeout",
        );
        window.eventBus?.on?.("sse:connected", deferHandler);
        deferTimer = setTimeout(() => {
          tryActivate();
          try {
            window.eventBus?.off?.("sse:connected", deferHandler);
          } catch (_) {}
        }, 5e3);
      }
      _paymentSpeedupCleanup = () => {
        restore();
        cleanup();
      };
    }
    async function handlePayment(provider) {
      const payBtnMap = {
        vietqr: "payVietQR",
        sepay: "paySePay",
        stripe: "payStripe",
        paypal: "payPayPal",
        polar: "payPolar",
        lemonsqueezy: "payLemonsqueezy",
      };
      const payBtn = document.getElementById(payBtnMap[provider]);
      if (payBtn) payBtn.disabled = true;
      try {
        if (!window.authManager) {
          throw new Error(
            window.I18n?.t("upgrade.loginRequired") ||
              "Please log in before making a payment",
          );
        }
        if (!selectedPlanId) {
          throw new Error(
            window.I18n?.t("upgrade.selectPlanFirst") ||
              "Please select a plan before making a payment",
          );
        }
        const _payCurrency = window.LocationCache?.getCurrency?.() || "VND";
        const isUpgradePayload = !!(
          _currentUpgradeQuote &&
          _currentUpgradeQuote.credit > 0 &&
          !_currentUpgradeQuote._error_code &&
          _currentUpgradeQuote.to_plan?.slug &&
          _currentUpgradeQuote.to_plan.billing_cycle === selectedBillingCycle &&
          _currentUpgradeQuote.currency === _payCurrency
        );
        const payload = {
          plan_id: selectedPlanId,
          provider,
          billing_cycle: selectedBillingCycle,
        };
        if (isUpgradePayload) {
          payload.is_upgrade = true;
        }
        if (_affiliateDiscount?.ref_code) {
          payload.ref_code = _affiliateDiscount.ref_code;
        }
        if (_couponApplied?.code) {
          payload.coupon_code = _couponApplied.code;
        }
        if (
          isUpgradePayload &&
          provider === "lemonsqueezy" &&
          window._cachedActiveProviders?.behavior?.lemonsqueezy
            ?.upgrade_in_place
        ) {
          const tien = _currentUpgradeQuote?.final_amount;
          const donVi = _currentUpgradeQuote?.currency;
          const soTien =
            tien === void 0 || tien === null
              ? ""
              : donVi === "USD"
                ? "$" +
                  Number(tien).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                : (window.I18n?.formatNumber?.(tien) ||
                    Number(tien).toLocaleString()) + " \u0111";
          const hoi =
            window.I18n?.t("upgrade.confirmChargeNow", { amount: soTien }) ||
            (soTien
              ? `N\xE2ng c\u1EA5p s\u1EBD tr\u1EEB ${soTien} ngay v\xE0o ph\u01B0\u01A1ng th\u1EE9c thanh to\xE1n \u0111ang d\xF9ng. Ti\u1EBFp t\u1EE5c?`
              : "N\xE2ng c\u1EA5p s\u1EBD tr\u1EEB ti\u1EC1n ngay v\xE0o ph\u01B0\u01A1ng th\u1EE9c thanh to\xE1n \u0111ang d\xF9ng. Ti\u1EBFp t\u1EE5c?");
          const dongY = window.customDialog?.confirm
            ? await window.customDialog.confirm(hoi)
            : confirm(hoi);
          if (!dongY) {
            if (payBtn) payBtn.disabled = false;
            return;
          }
        }
        const response = await window.authManager._apiCall(
          "POST",
          "orders",
          payload,
        );
        if (response?.activated) {
          if (upgradeOverlay) upgradeOverlay.classList.add("hidden");
          if (typeof sendLog === "function") {
            const _keyXong = response?.upgraded_in_place
              ? "upgrade.upgradedInPlace"
              : "upgrade.activatedFree";
            const _mdXong =
              window.I18n?.t(_keyXong) ||
              (response?.upgraded_in_place
                ? "\u0110\xE3 n\xE2ng c\u1EA5p g\xF3i \u2014 ph\u1EA7n ch\xEAnh l\u1EC7ch \u0111\xE3 \u0111\u01B0\u1EE3c tr\u1EEB."
                : "\u0110\xE3 k\xEDch ho\u1EA1t g\xF3i \u2014 kh\xF4ng c\u1EA7n thanh to\xE1n th\xEAm.");
            sendLog(_mdXong, "info");
          }
          try {
            await window.featureGate?.refresh?.({ force: true });
          } catch (_) {}
          try {
            await window.authManager?.fetchUser?.();
          } catch (_) {}
        } else if (response?.checkout_url) {
          chrome.tabs.create({ url: response.checkout_url });
          if (upgradeOverlay) upgradeOverlay.classList.add("hidden");
          _setupPaymentSpeedup(response.order_id);
          if (typeof sendLog === "function") {
            sendLog(
              window.I18n?.t("upgrade.openingCheckout") ||
                "Opening checkout...",
              "info",
            );
          }
        } else if (response?.qr_url) {
          if (upgradeOverlay) upgradeOverlay.classList.add("hidden");
          showVietQRModal(response);
          _setupPaymentSpeedup(response.order_id);
        } else {
          throw new Error(
            window.I18n?.t("upgrade.checkoutFailed") ||
              "Payment failed, please try again",
          );
        }
      } catch (e) {
        console.error("[Upgrade] Payment error:", e);
        const isAuthError =
          e.status === 401 ||
          e.code === "UNAUTHENTICATED" ||
          (e.message &&
            (e.message.includes("expired") ||
              e.message.includes("Unauthenticated") ||
              e.message.includes("\u0111\u0103ng nh\u1EADp")));
        const errMsg =
          e.message ||
          window.I18n?.t("upgrade.checkoutFailed") ||
          "Payment failed, please try again";
        window.showNotification?.(errMsg, "error", 5e3);
        if (isAuthError) {
          if (upgradeOverlay) upgradeOverlay.classList.add("hidden");
          if (window.authManager?.showLoginModal) {
            window.authManager.showLoginModal();
          } else {
            const loginOverlay2 = document.getElementById("loginOverlay");
            if (loginOverlay2) loginOverlay2.classList.remove("hidden");
          }
        }
        if (typeof sendLog === "function") {
          sendLog("L\u1ED7i thanh to\xE1n: " + (e.message || ""), "error");
        }
      } finally {
        if (payBtn) payBtn.disabled = false;
      }
    }
    const payVietQRBtn = document.getElementById("payVietQR");
    const paySePayBtn = document.getElementById("paySePay");
    const payStripeBtn = document.getElementById("payStripe");
    const payPayPalBtn = document.getElementById("payPayPal");
    const payPolarBtn = document.getElementById("payPolar");
    const payLemonsqueezyBtn = document.getElementById("payLemonsqueezy");
    if (payVietQRBtn) {
      payVietQRBtn.addEventListener("click", () => handlePayment("vietqr"));
    }
    if (paySePayBtn) {
      paySePayBtn.addEventListener("click", () => handlePayment("sepay"));
    }
    if (payStripeBtn) {
      payStripeBtn.addEventListener("click", () => handlePayment("stripe"));
    }
    if (payPayPalBtn) {
      payPayPalBtn.addEventListener("click", () => handlePayment("paypal"));
    }
    if (payPolarBtn) {
      payPolarBtn.addEventListener("click", () => handlePayment("polar"));
    }
    if (payLemonsqueezyBtn) {
      payLemonsqueezyBtn.addEventListener("click", () =>
        handlePayment("lemonsqueezy"),
      );
    }
    function checkPlanAndToggleUpgrade() {
      if (!window.authManager?.isLoggedIn()) return;
      const user = window.authManager.getUser();
      if (upgradeBtn) {
        const isTopTier =
          user?.plan_slug === "unlimited" || user?.plan_slug === "premium";
        const isLifetime = user?.plan_billing_cycle === "lifetime";
        const cannotUpgrade = isTopTier || isLifetime;
        upgradeBtn.classList.toggle("hidden", cannotUpgrade);
      }
    }
    if (window.eventBus) {
      window.eventBus.on("auth:login", checkPlanAndToggleUpgrade);
    }
    checkPlanAndToggleUpgrade();
  }
  function setupTipCoffee() {
    const tipCoffeeBtn = document.getElementById("tipCoffeeBtn");
    if (tipCoffeeBtn) {
      tipCoffeeBtn.addEventListener("click", () => {
        const apiBaseUrl = window.authManager?.apiBaseUrl;
        if (!apiBaseUrl) return;
        const baseUrl = apiBaseUrl.replace(/\/api\/v\d+$/, "");
        chrome.tabs.create({ url: baseUrl + "/tip" });
      });
    }
    const settingsUpgradeBtn = document.getElementById("settingsUpgradeBtn");
    if (settingsUpgradeBtn) {
      settingsUpgradeBtn.addEventListener("click", () => {
        document.getElementById("settingsDropdown")?.classList.remove("open");
        if (typeof window.openUpgradeModal === "function") {
          window.openUpgradeModal();
        }
      });
    }
  }
  function setupContactModal() {
    const contactBtn = document.getElementById("contactBtn");
    const contactOverlay = document.getElementById("contactOverlay");
    const contactCloseBtn = document.getElementById("contactCloseBtn");
    const contactGuideLink = document.getElementById("contactGuideLink");
    const contactZaloLink = document.getElementById("contactZaloLink");
    const contactTelegramLink = document.getElementById("contactTelegramLink");
    const contactFacebookLink = document.getElementById("contactFacebookLink");
    const contactZaloUrl = document.getElementById("contactZaloUrl");
    const contactTelegramUrl = document.getElementById("contactTelegramUrl");
    const contactFacebookUrl = document.getElementById("contactFacebookUrl");
    const contactNoLinks = document.getElementById("contactNoLinks");
    if (!contactBtn || !contactOverlay) return;
    document
      .getElementById("footerSupportBtn")
      ?.addEventListener("click", () => contactBtn.click());
    document
      .getElementById("upgradeHelpBtn")
      ?.addEventListener("click", () => contactBtn.click());
    if (contactGuideLink) {
      const apiBase = window.authManager?.apiBaseUrl;
      if (apiBase) {
        const siteBase = apiBase.replace(/\/api\/v\d+\/?$/, "");
        contactGuideLink.href = `${siteBase}/guide`;
      }
    }
    const replayOnboardingBtn = document.getElementById("replayOnboardingBtn");
    if (replayOnboardingBtn) {
      replayOnboardingBtn.addEventListener("click", () => {
        document.getElementById("settingsDropdown")?.classList.remove("open");
        const tabGenBtn = document.querySelector(
          '.tobyflow-tab[data-tab="tab-gen"]',
        );
        const tabGenPane = document.getElementById("tab-gen");
        const isAlreadyActive = tabGenPane?.classList.contains("active");
        if (tabGenBtn && !isAlreadyActive) {
          tabGenBtn.click();
        }
        const startTour = () => {
          if (typeof window.replayOnboarding === "function") {
            window.replayOnboarding();
          }
        };
        if (isAlreadyActive) startTour();
        else setTimeout(startTour, 50);
      });
    }
    contactBtn.addEventListener("click", async () => {
      document.getElementById("settingsDropdown")?.classList.remove("open");
      contactOverlay.classList.remove("hidden");
      if (contactZaloLink) contactZaloLink.classList.add("hidden");
      if (contactTelegramLink) contactTelegramLink.classList.add("hidden");
      if (contactFacebookLink) contactFacebookLink.classList.add("hidden");
      if (contactNoLinks) contactNoLinks.classList.add("hidden");
      let zaloUrl = "";
      let telegramUrl = "";
      let facebookUrl = "";
      try {
        const settings = await window.SystemConfig?.fetch(true);
        zaloUrl = settings?.zalo_contact_url || "";
        telegramUrl = settings?.telegram_contact_url || "";
        facebookUrl = settings?.facebook_contact_url || "";
      } catch (err) {
        console.warn("[ContactModal] Failed to fetch settings:", err);
      }
      let hasLinks = false;
      if (zaloUrl && contactZaloLink) {
        contactZaloLink.href = zaloUrl;
        contactZaloLink.classList.remove("hidden");
        if (contactZaloUrl) {
          try {
            const urlObj = new URL(zaloUrl);
            contactZaloUrl.textContent =
              urlObj.pathname.replace(/^\//, "") || urlObj.hostname;
          } catch {
            contactZaloUrl.textContent = zaloUrl;
          }
        }
        hasLinks = true;
      } else if (contactZaloLink) {
        contactZaloLink.classList.add("hidden");
      }
      if (telegramUrl && contactTelegramLink) {
        contactTelegramLink.href = telegramUrl;
        contactTelegramLink.classList.remove("hidden");
        if (contactTelegramUrl) {
          try {
            const urlObj = new URL(telegramUrl);
            contactTelegramUrl.textContent =
              urlObj.pathname.replace(/^\//, "") || urlObj.hostname;
          } catch {
            contactTelegramUrl.textContent = telegramUrl;
          }
        }
        hasLinks = true;
      } else if (contactTelegramLink) {
        contactTelegramLink.classList.add("hidden");
      }
      if (facebookUrl && contactFacebookLink) {
        contactFacebookLink.href = facebookUrl;
        contactFacebookLink.classList.remove("hidden");
        if (contactFacebookUrl) {
          try {
            const urlObj = new URL(facebookUrl);
            contactFacebookUrl.textContent =
              urlObj.pathname.replace(/^\//, "") || urlObj.hostname;
          } catch {
            contactFacebookUrl.textContent = facebookUrl;
          }
        }
        hasLinks = true;
      } else if (contactFacebookLink) {
        contactFacebookLink.classList.add("hidden");
      }
      if (contactNoLinks) {
        const hasAnyLink =
          hasLinks ||
          (contactGuideLink && !contactGuideLink.classList.contains("hidden"));
        contactNoLinks.classList.toggle("hidden", hasAnyLink);
      }
    });
    const closeModal = () => {
      contactOverlay.classList.add("hidden");
    };
    if (contactCloseBtn) {
      contactCloseBtn.addEventListener("click", closeModal);
    }
    contactOverlay.addEventListener("click", (e) => {
      if (e.target === contactOverlay) {
        closeModal();
      }
    });
  }
  function setupExtensionLink() {
    const extensionLinkBtn = document.getElementById("extensionLinkBtn");
    if (!extensionLinkBtn) return;
    window.ExtensionUpdateNotice?.init();
    extensionLinkBtn.addEventListener("click", () => {
      document.getElementById("settingsDropdown")?.classList.remove("open");
      window.ExtensionUpdateNotice?.showGuide();
    });
  }
  function setupSettingsLogout() {
    const settingsLogoutBtn = document.getElementById("settingsLogoutBtn");
    if (!settingsLogoutBtn) return;
    settingsLogoutBtn.addEventListener("click", async () => {
      document.getElementById("settingsDropdown")?.classList.remove("open");
      const t = (key, fallback) => window.I18n?.t(key) || fallback;
      const _logoutMsg = t(
        "auth.logoutConfirm",
        "Are you sure you want to logout?",
      );
      const confirmed = window.customDialog
        ? await window.customDialog.confirm(_logoutMsg, {
            title: t("header.logout", "Logout"),
            confirmText: t("header.logout", "Logout"),
            cancelText: t("common.cancel", "Cancel"),
          })
        : confirm(_logoutMsg);
      if (confirmed && window.authManager) {
        try {
          await window.authManager.logout();
        } catch (err) {
          console.error("[SettingsLogout] Logout failed:", err);
        }
      }
    });
  }
  function setupUsageStatsModal() {
    const overlay = document.getElementById("usageStatsOverlay");
    const closeBtn = document.getElementById("usageStatsCloseBtn");
    const upgradeBtn = document.getElementById("usageStatsUpgradeBtn");
    const planUpgradeBtn = document.getElementById("usageStatsPlanUpgradeBtn");
    const loginBtn = document.getElementById("usageStatsLoginBtn");
    const quotasElements = document.querySelectorAll(".footer-usage-quotas");
    const userPlanBadge = document.getElementById("userPlanBadge");
    if (!overlay) return;
    function openModal() {
      updateUsageStats();
      overlay.classList.remove("hidden");
    }
    function closeModal() {
      overlay.classList.add("hidden");
    }
    async function updateUsageStats() {
      const promptsEl = document.getElementById("usageStatsPrompts");
      const tasksEl = document.getElementById("usageStatsTasks");
      const workflowsEl = document.getElementById("usageStatsWorkflows");
      const planNameEl = document.getElementById("usageStatsPlanName");
      const premiumTeaser = document.getElementById("usageStatsPremiumTeaser");
      const expiryContainer = document.getElementById("usageStatsExpiry");
      const expiryDateEl = document.getElementById("usageStatsExpiryDate");
      const promptsBar = document.getElementById("usageStatsPromptsBar");
      const tasksBar = document.getElementById("usageStatsTasksBar");
      const workflowsBar = document.getElementById("usageStatsWorkflowsBar");
      const promptsItem = document.getElementById("usageStatsPromptsItem");
      const tasksItem = document.getElementById("usageStatsTasksItem");
      const workflowsItem = document.getElementById("usageStatsWorkflowsItem");
      const featurePipeline = document.getElementById(
        "usageStatsFeaturePipeline",
      );
      const featureAutoDownload = document.getElementById(
        "usageStatsFeatureAutoDownload",
      );
      const featureAutoRetry = document.getElementById(
        "usageStatsFeatureAutoRetry",
      );
      try {
        const fg = window.featureGate;
        const plan = fg?.getPlan?.();
        const planSlug = plan?.slug || "free";
        if (planNameEl) {
          planNameEl.textContent = plan?.name || "Free";
        }
        if (expiryContainer && expiryDateEl) {
          const expiresAt = plan?.expires_at;
          const isPaidPlan = planSlug !== "free" && planSlug !== "trial";
          console.log("[UsageStats] Plan expiry check:", {
            planSlug,
            isPaidPlan,
            expiresAt,
            plan,
          });
          if (isPaidPlan && expiresAt) {
            const expiryDate = new Date(expiresAt);
            const now = new Date();
            const daysUntilExpiry = Math.ceil(
              (expiryDate - now) / (1e3 * 60 * 60 * 24),
            );
            const dateStr =
              window.I18n?.formatDate?.(expiryDate) ||
              expiryDate.toLocaleDateString();
            expiryDateEl.textContent = dateStr;
            expiryContainer.classList.remove(
              "hidden",
              "expiring-soon",
              "expired",
            );
            if (daysUntilExpiry <= 0) {
              expiryContainer.classList.add("expired");
              expiryDateEl.textContent =
                window.I18n?.t("usageStats.expired") || "Expired";
            } else if (daysUntilExpiry <= 7) {
              expiryContainer.classList.add("expiring-soon");
              expiryDateEl.textContent = `${dateStr} (${daysUntilExpiry} days)`;
            }
          } else {
            expiryContainer.classList.add("hidden");
          }
        }
        const updateFeature = (el, featureKey) => {
          if (!el) return;
          const canUse = fg?.canUse?.(featureKey) ?? false;
          el.setAttribute("data-enabled", canUse ? "true" : "false");
          const statusEl = el.querySelector(".usage-stats-feature-status");
          if (statusEl) {
            statusEl.classList.remove(
              "usage-stats-feature-status--on",
              "usage-stats-feature-status--off",
            );
            statusEl.classList.add(
              canUse
                ? "usage-stats-feature-status--on"
                : "usage-stats-feature-status--off",
            );
            statusEl.innerHTML = canUse
              ? ""
              : '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
          }
        };
        updateFeature(featurePipeline, "pipeline_queue_enabled");
        updateFeature(featureAutoDownload, "auto_download");
        updateFeature(featureAutoRetry, "retry_on_fail");
        const updateProvider = (id, featureKey, quotaKey) => {
          const el = document.getElementById(id);
          if (!el) return;
          const canUse = fg?.canUse?.(featureKey) ?? false;
          el.setAttribute("data-enabled", canUse ? "true" : "false");
          const quotaEl = document.getElementById(id + "Quota");
          const quota = fg?.checkQuota?.(quotaKey) || {};
          const limit = quota.limit;
          const used = quota.used || 0;
          const isUnlimited =
            limit === -1 || limit === "unlimited" || limit === "\u221E";
          if (quotaEl) {
            const valueText = isUnlimited
              ? `${used}/\u221E`
              : `${used}/${limit || 0}`;
            quotaEl.innerHTML = "";
            const valueSpan = document.createElement("span");
            valueSpan.className = "usage-stats-provider-quota-value";
            valueSpan.textContent = valueText;
            const periodSpan = document.createElement("span");
            periodSpan.className = "usage-stats-provider-quota-period";
            periodSpan.textContent = "/day";
            quotaEl.appendChild(valueSpan);
            quotaEl.appendChild(periodSpan);
            quotaEl.classList.toggle("unlimited", isUnlimited);
          }
          const progressEl = document.getElementById(id + "Progress");
          if (progressEl) {
            const fillEl = progressEl.querySelector(
              ".usage-stats-provider-progress-fill",
            );
            if (fillEl) {
              if (isUnlimited || !limit) {
                fillEl.style.width = isUnlimited ? "100%" : "0%";
                progressEl.setAttribute(
                  "data-state",
                  isUnlimited ? "unlimited" : "empty",
                );
              } else {
                const ratio = Math.min(100, Math.max(0, (used / limit) * 100));
                fillEl.style.width = `${ratio}%`;
                let state = "normal";
                if (ratio >= 100) state = "danger";
                else if (ratio >= 80) state = "warning";
                progressEl.setAttribute("data-state", state);
              }
            }
          }
        };
        updateProvider("usageStatsProviderFlow", "gen_enabled", "gen_run_max");
        updateProvider(
          "usageStatsProviderChatGPT",
          "chatgpt_enabled",
          "chatgpt_run_max",
        );
        updateProvider(
          "usageStatsProviderGrok",
          "grok_enabled",
          "grok_run_max",
        );
        const loginTeaser = document.getElementById("usageStatsLoginTeaser");
        const isLoggedIn = window.authManager?.isLoggedIn();
        const showUpgrade =
          isLoggedIn && (planSlug === "free" || planSlug === "trial");
        const showLogin = !isLoggedIn;
        if (loginTeaser) {
          loginTeaser.classList.toggle("hidden", !showLogin);
        }
        if (premiumTeaser) {
          premiumTeaser.classList.toggle("hidden", !showUpgrade);
        }
        const today = new Date().toISOString().slice(0, 10);
        const currentUserId = window.authManager?.user?.id || null;
        const result = await new Promise((resolve) => {
          chrome.storage.local.get(["af_daily_stats"], (r) => resolve(r));
        });
        const stats = result.af_daily_stats || {};
        const config = fg?.getConfig?.() || {};
        const promptQuota = fg?.checkQuota?.("prompt_submit_max") || {};
        const promptsMax =
          promptQuota.limit === "unlimited" ? -1 : (promptQuota.limit ?? -1);
        const tasksQuota = fg?.checkQuota?.("tasks_max") || {};
        const wfQuota = fg?.checkQuota?.("workflows_max") || {};
        const tasksMax =
          tasksQuota.limit === "unlimited"
            ? -1
            : (tasksQuota.limit ?? config.tasks_max_create ?? -1);
        const workflowsMax =
          wfQuota.limit === "unlimited"
            ? -1
            : (wfQuota.limit ?? config.workflows_max_create ?? -1);
        const tasksCreated = tasksQuota.used ?? 0;
        const wfCreated = wfQuota.used ?? 0;
        const isValidStats =
          stats._date === today && stats._user_id === currentUserId;
        const updateStat = (el, bar, item, used, max) => {
          const isUnlimited =
            max === -1 || max === "\u221E" || max === "unlimited";
          const displayMax = isUnlimited ? "\u221E" : max;
          if (el) {
            el.textContent = `${used}/${displayMax}`;
            el.classList.toggle("usage-stats-unlimited", isUnlimited);
          }
          if (bar) {
            const percent = isUnlimited
              ? Math.min(used * 2, 100)
              : Math.min((used / max) * 100, 100);
            bar.style.width = `${percent}%`;
          }
          if (item && !isUnlimited) {
            const ratio = used / max;
            item.classList.remove("warning", "danger");
            if (ratio >= 1) {
              item.classList.add("danger");
            } else if (ratio >= 0.8) {
              item.classList.add("warning");
            }
          }
        };
        const localPromptTotal = isValidStats
          ? (stats.flow_prompt_total || 0) +
            (stats.chatgpt_prompt_total || 0) +
            (stats.gemini_prompt_total || 0) +
            (stats.grok_prompt_total || 0)
          : 0;
        const promptUsed =
          promptQuota.used !== void 0 && promptQuota.used > 0
            ? promptQuota.used
            : localPromptTotal;
        updateStat(promptsEl, promptsBar, promptsItem, promptUsed, promptsMax);
        updateStat(tasksEl, tasksBar, tasksItem, tasksCreated, tasksMax);
        updateStat(
          workflowsEl,
          workflowsBar,
          workflowsItem,
          wfCreated,
          workflowsMax,
        );
      } catch (err) {
        console.error("[UsageStats] Failed to update:", err);
      }
    }
    quotasElements.forEach((el) => {
      el.addEventListener("click", openModal);
    });
    if (userPlanBadge) {
      userPlanBadge.style.cursor = "pointer";
      userPlanBadge.addEventListener("click", openModal);
    }
    const proLabels = document.querySelectorAll(".footer-pro-label");
    proLabels.forEach((el) => {
      el.addEventListener("click", openModal);
    });
    const footerFeatures = document.querySelectorAll(".footer-feature");
    footerFeatures.forEach((el) => {
      el.style.cursor = "pointer";
      el.addEventListener("click", openModal);
    });
    if (closeBtn) {
      closeBtn.addEventListener("click", closeModal);
    }
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });
    const openUpgradeFromStats = () => {
      closeModal();
      if (typeof window.openUpgradeModal === "function") {
        window.openUpgradeModal();
      } else {
        try {
          chrome.runtime.sendMessage({ action: "showUpgradeModal" });
        } catch (e) {}
      }
    };
    if (upgradeBtn) upgradeBtn.addEventListener("click", openUpgradeFromStats);
    if (planUpgradeBtn)
      planUpgradeBtn.addEventListener("click", openUpgradeFromStats);
    if (loginBtn) {
      loginBtn.addEventListener("click", () => {
        closeModal();
        if (window.authManager?.showLoginModal) {
          window.authManager.showLoginModal();
        } else {
          const loginOverlay2 = document.getElementById("loginOverlay");
          if (loginOverlay2) loginOverlay2.classList.remove("hidden");
        }
      });
    }
  }
  function setupNotificationBell() {
    if (!window.NotificationBell) {
      console.warn(
        "[NotificationBell] Class ch\u01B0a \u0111\u01B0\u1EE3c load",
      );
      return;
    }
    if (document.getElementById("notificationBellWrapper")) {
      return;
    }
    const headerActions = document.querySelector(".tobyflow-header-actions");
    if (!headerActions) {
      console.warn(
        "[NotificationBell] Kh\xF4ng t\xECm th\u1EA5y .tobyflow-header-actions",
      );
      return;
    }
    const bellWrapper = document.createElement("div");
    bellWrapper.id = "notificationBellWrapper";
    bellWrapper.style.display = "inline-flex";
    const headerUser = headerActions.querySelector(".tobyflow-header-user");
    if (headerUser) {
      headerActions.insertBefore(bellWrapper, headerUser);
    } else {
      headerActions.appendChild(bellWrapper);
    }
    const bell = window.NotificationBell.getInstance();
    bell.init(bellWrapper);
    console.log(
      "[NotificationBell] \u0110\xE3 kh\u1EDFi t\u1EA1o trong header",
    );
  }
  function setupOnboarding(options = {}) {
    const force = options.force === true;
    const userId = window.authManager?.getUser?.()?.id || "anon";
    const flagKey = "af_onboarding_done_" + userId;
    chrome.storage.local.get(["af_onboarding_done", flagKey], (result) => {
      if (!force && (result.af_onboarding_done || result[flagKey])) return;
      document
        .querySelectorAll(".tobyflow-onboarding-highlight")
        .forEach((el) => {
          el.classList.remove("tobyflow-onboarding-highlight");
        });
      const overlay = document.getElementById("onboardingOverlay");
      const tooltip = document.getElementById("onboardingTooltip");
      const content = document.getElementById("onboardingContent");
      const stepIndicator = document.getElementById("onboardingStepIndicator");
      const nextBtn = document.getElementById("onboardingNextBtn");
      const skipBtn = document.getElementById("onboardingSkipBtn");
      if (!overlay || !tooltip || !content) return;
      const appName = window.SystemConfig?.get?.("app_name") || "Toby Flow";
      const userFullName = window.authManager?.getUser?.()?.name || "";
      const _locale = window.I18n?._currentLocale || "vi";
      const _useLastName = _locale === "vi" || _locale === "ja";
      const _nameParts = userFullName
        ? String(userFullName).trim().split(/\s+/)
        : [];
      const userFirstName =
        _nameParts.length > 0
          ? _useLastName
            ? _nameParts[_nameParts.length - 1]
            : _nameParts[0]
          : "";
      const warnIconSvg =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fb923c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
      const wrapWarnBox = (innerText) =>
        '<div class="tobyflow-onboarding-warn">' +
        warnIconSvg +
        "<span>" +
        innerText +
        "</span></div>";
      const welcomeTitle = userFirstName
        ? window.I18n?.t("onboarding.welcomeTitlePersonal", {
            name: userFirstName,
            app: appName,
          }) || `Hi ${userFirstName}! Welcome to ${appName}`
        : window.I18n?.t("onboarding.welcomeTitle", { app: appName }) ||
          `Welcome to ${appName}!`;
      const steps = [
        {
          target: null,
          title: welcomeTitle,
          description:
            (window.I18n?.t("onboarding.howItWorksMain", { app: appName }) ||
              `<strong>${appName} KH\xD4NG t\u1EF1 t\u1EA1o \u1EA3nh/video.</strong> \u0110\xE2y l\xE0 c\xF4ng c\u1EE5 <strong>t\u1EF1 \u0111\u1ED9ng h\xF3a thao t\xE1c</strong> tr\xEAn c\xE1c trang AI gen \u2014 nhanh h\u01A1n, h\xE0ng lo\u1EA1t, c\xF3 workflow.`) +
            wrapWarnBox(
              window.I18n?.t("onboarding.howItWorksWarn") ||
                "You need an <strong>account with available credit/quota</strong> on one of: Google Flow, ChatGPT, or Grok.",
            ),
          position: "center",
        },
        {
          target: '[data-tab="tab-gen"]',
          title: window.I18n?.t("onboarding.genTabTitle") || "Tab Gen",
          description:
            window.I18n?.t("onboarding.genTabDesc") ||
            "Enter prompts and generate images/videos. This is where you start every task.",
          position: "bottom",
        },
        {
          target: "#startBtn",
          title:
            window.I18n?.t("onboarding.generateBtnTitle") || "Generate Button",
          description:
            window.I18n?.t("onboarding.generateBtnDesc") ||
            "Click to start generating images/videos from your prompts.",
          position: "top",
        },
        {
          target: '[data-tab="tab-workflow"]',
          title:
            window.I18n?.t("onboarding.workflowTabTitle") || "Tab Workflow",
          description:
            window.I18n?.t("onboarding.workflowTabDesc") ||
            "Design multi-step automation flows (gen + download + Telegram + ...) as a flowchart.",
          position: "bottom",
        },
        {
          target: '[data-tab="tab-templates"]',
          title:
            window.I18n?.t("onboarding.templatesTabTitle") || "Tab Templates",
          description:
            window.I18n?.t("onboarding.templatesTabDesc") ||
            'A library of ready-to-use workflow + prompt templates. Click "Copy" to instantly get a runnable workflow.',
          position: "bottom",
        },
        {
          target: '[data-tab="tab-tasks"]',
          title: window.I18n?.t("onboarding.tasksTabTitle") || "Tab Multi Task",
          description:
            window.I18n?.t("onboarding.tasksTabDesc") ||
            "Batch run many prompts at once \u2014 each task runs independently, toggle on/off.",
          position: "bottom",
        },
        {
          target: null,
          title: window.I18n?.t("onboarding.readyTitle") || "You're Ready!",
          description:
            window.I18n?.t("onboarding.readyDesc") ||
            "Happy creating! You can replay this tour anytime from the Settings menu.",
          position: "center",
        },
      ];
      let currentStep = 0;
      let highlightedEl = null;
      function _cleanupAllHighlights() {
        document
          .querySelectorAll(".tobyflow-onboarding-highlight")
          .forEach((el) => {
            el.classList.remove("tobyflow-onboarding-highlight");
          });
        highlightedEl = null;
      }
      function finishOnboarding() {
        _cleanupAllHighlights();
        overlay.classList.add("hidden");
        chrome.storage.local.set({ af_onboarding_done: true, [flagKey]: true });
      }
      function showStep(index) {
        _cleanupAllHighlights();
        tooltip.style.transform = "";
        tooltip.style.top = "";
        tooltip.style.left = "";
        const step = steps[index];
        content.innerHTML = `<h3>${step.title}</h3><p>${step.description}</p>`;
        stepIndicator.textContent = `${index + 1} / ${steps.length}`;
        const isLast = index === steps.length - 1;
        nextBtn.textContent = isLast
          ? window.I18n?.t("onboarding.done") || "Done"
          : window.I18n?.t("onboarding.next") || "Next";
        if (step.target) {
          const targetEl = document.querySelector(step.target);
          if (targetEl) {
            highlightedEl = targetEl;
            targetEl.classList.add("tobyflow-onboarding-highlight");
            const rect = targetEl.getBoundingClientRect();
            const sidebarRoot = document.getElementById(
              "flow-auto-sidebar-root",
            );
            const sidebarRect = sidebarRoot
              ? sidebarRoot.getBoundingClientRect()
              : { left: 0, top: 0, width: 600, height: 800 };
            tooltip.style.position = "absolute";
            const relLeft = rect.left - sidebarRect.left;
            const relTop = rect.top - sidebarRect.top;
            const tooltipH = tooltip.offsetHeight;
            const margin = 12;
            let top;
            if (step.position === "bottom") {
              top = relTop + rect.height + margin;
            } else {
              top = relTop - tooltipH - margin;
            }
            if (top < 8) {
              top = relTop + rect.height + margin;
            }
            if (top + tooltipH > sidebarRect.height - 8) {
              top = Math.max(8, relTop - tooltipH - margin);
            }
            tooltip.style.top = top + "px";
            tooltip.style.left =
              Math.max(8, Math.min(relLeft, sidebarRect.width - 328)) + "px";
          } else {
            centerTooltip();
          }
        } else {
          centerTooltip();
        }
      }
      function centerTooltip() {
        tooltip.style.top = "50%";
        tooltip.style.left = "50%";
        tooltip.style.transform = "translate(-50%, -50%)";
      }
      nextBtn.onclick = () => {
        if (currentStep < steps.length - 1) {
          currentStep++;
          showStep(currentStep);
        } else {
          finishOnboarding();
        }
      };
      skipBtn.onclick = finishOnboarding;
      overlay.classList.remove("hidden");
      showStep(0);
    });
  }
  window.replayOnboarding = function () {
    const userId = window.authManager?.getUser?.()?.id || "anon";
    const flagKey = "af_onboarding_done_" + userId;
    chrome.storage.local.remove(["af_onboarding_done", flagKey], () => {
      setupOnboarding({ force: true });
    });
  };
  function setupLanguageModal() {
    const languageBtn = document.getElementById("languageBtn");
    const languageOverlay = document.getElementById("languageOverlay");
    const languageCloseBtn = document.getElementById("languageCloseBtn");
    const languageOptions = document.querySelectorAll(".language-option");
    if (languageBtn) {
      languageBtn.addEventListener("click", () => {
        if (languageOverlay) languageOverlay.classList.remove("hidden");
      });
    }
    if (languageCloseBtn) {
      languageCloseBtn.addEventListener("click", () => {
        if (languageOverlay) languageOverlay.classList.add("hidden");
      });
    }
    if (languageOverlay) {
      languageOverlay.addEventListener("click", (e) => {
        if (e.target === languageOverlay) {
          languageOverlay.classList.add("hidden");
        }
      });
    }
    languageOptions.forEach((option) => {
      option.addEventListener("click", () => {
        const lang = option.dataset.lang;
        languageOptions.forEach((opt) => opt.classList.remove("active"));
        option.classList.add("active");
        if (window.I18n) {
          I18n.setLocale(lang, true, true);
        }
        console.log("[TobyFlow] Language changed to:", lang);
        if (languageOverlay) languageOverlay.classList.add("hidden");
      });
    });
    const syncActiveLang = () => {
      const currentLang = window.I18n?.getLocale?.() || "vi";
      languageOptions.forEach((opt) => {
        opt.classList.toggle("active", opt.dataset.lang === currentLang);
      });
    };
    syncActiveLang();
    window.eventBus?.on("i18n:changed", syncActiveLang);
  }
  function setupReferralUI() {
    const referralSection = document.getElementById("referralSection");
    if (!referralSection) return;
    const affOverlay = document.getElementById("affiliateOverlay");
    const affOverlayBody = document.getElementById("affiliateOverlayBody");
    const affMenuBtn = document.getElementById("affiliateMenuBtn");
    const affHeaderBtn = document.getElementById("affiliateHeaderBtn");
    const affOverlayClose = document.getElementById("affiliateOverlayCloseBtn");
    if (affOverlayBody && referralSection.parentElement !== affOverlayBody) {
      affOverlayBody.appendChild(referralSection);
    }
    const openAffOverlay = () => {
      if (!affOverlay) return;
      document.getElementById("settingsDropdown")?.classList.remove("open");
      affOverlay.classList.remove("hidden");
      loadReferralData();
    };
    const closeAffOverlay = () => affOverlay?.classList.add("hidden");
    if (affMenuBtn) affMenuBtn.addEventListener("click", openAffOverlay);
    if (affHeaderBtn) affHeaderBtn.addEventListener("click", openAffOverlay);
    if (affOverlayClose)
      affOverlayClose.addEventListener("click", closeAffOverlay);
    if (affOverlay)
      affOverlay.addEventListener("click", (e) => {
        if (e.target === affOverlay) closeAffOverlay();
      });
    const _syncAffMenuVisibility = () => {
      const show = !!window.authManager?.isLoggedIn();
      if (affMenuBtn) affMenuBtn.classList.toggle("hidden", !show);
      if (affHeaderBtn) affHeaderBtn.classList.toggle("hidden", !show);
    };
    _syncAffMenuVisibility();
    if (window.eventBus) {
      window.eventBus.on("auth:login", _syncAffMenuVisibility);
      window.eventBus.on("auth:logout", () => {
        _syncAffMenuVisibility();
        closeAffOverlay();
      });
      window.eventBus.on("auth:restored", _syncAffMenuVisibility);
    }
    const codeValue = document.getElementById("referralCodeValue");
    const copyBtn = document.getElementById("referralCopyBtn");
    if (copyBtn)
      copyBtn.setAttribute(
        "data-tooltip",
        window.I18n?.t("app.copyLink") || "Copy link",
      );
    const registeredEl = document.getElementById("referralRegistered");
    const convertedEl = document.getElementById("referralConverted");
    const referralStatsEl = document.getElementById("referralStats");
    const affEarnEl = document.getElementById("affiliateEarn");
    const affEarnTextEl = document.getElementById("affiliateEarnText");
    const affWithdrawBtn = document.getElementById("affiliateWithdrawBtn");
    const affBecomeEl = document.getElementById("affiliateBecome");
    const affBecomeTextEl = document.getElementById("affiliateBecomeText");
    const affApplyBtn = document.getElementById("affiliateApplyBtn");
    const affStatusEl = document.getElementById("affiliateStatusMsg");
    const affStatusTextEl = document.getElementById("affiliateStatusText");
    const affReapplyBtn = document.getElementById("affiliateReapplyBtn");
    const affWdOverlay = document.getElementById("affiliateWithdrawOverlay");
    const affWdCloseBtn = document.getElementById("affiliateWithdrawCloseBtn");
    const affWdCancelBtn = document.getElementById(
      "affiliateWithdrawCancelBtn",
    );
    const affWdConfirmBtn = document.getElementById(
      "affiliateWithdrawConfirmBtn",
    );
    const affWdErrorEl = document.getElementById("affiliateWithdrawError");
    const affWdSummaryEl = document.getElementById("affiliateWithdrawSummary");
    const affWdMethodSel = document.getElementById("affWdMethod");
    const affWdBankFields = document.getElementById("affWdBankFields");
    const affWdPaypalFields = document.getElementById("affWdPaypalFields");
    const affWdBankName = document.getElementById("affWdBankName");
    const affWdAccountNo = document.getElementById("affWdAccountNo");
    const affWdHolder = document.getElementById("affWdHolder");
    const affWdPaypalEmail = document.getElementById("affWdPaypalEmail");
    const affWdPaypalHolder = document.getElementById("affWdPaypalHolder");
    const affProgressFill = document.getElementById("affiliateProgressFill");
    const affProgressHint = document.getElementById("affiliateProgressHint");
    const affProgressWrap = document.getElementById(
      "affiliateWithdrawProgress",
    );
    let _affLink = "";
    let _affDashboardCache = null;
    function _fmtEarn(map) {
      if (!map) return "";
      return Object.entries(map)
        .map(([cur, v]) => {
          const n = Number(v) || 0;
          if (cur === "VND")
            return Math.round(n).toLocaleString("vi-VN") + "\u20AB";
          if (cur === "USD")
            return (
              "$" +
              n.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            );
          return n.toLocaleString("en-US") + " " + cur;
        })
        .join(" + ");
    }
    function _fmtAmount(n, currency) {
      const v = Number(n) || 0;
      if (currency === "VND")
        return Math.round(v).toLocaleString("vi-VN") + "\u20AB";
      if (currency === "USD")
        return (
          "$" +
          v.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        );
      return v.toLocaleString("en-US") + " " + currency;
    }
    async function loadReferralData() {
      if (!window.authManager?.isLoggedIn()) return;
      try {
        const codeData = await window.authManager._apiCall(
          "GET",
          "referral/code",
        );
        if (codeData?.referral_code && codeValue) {
          codeValue.textContent = codeData.referral_code;
        }
        const statsData = await window.authManager._apiCall(
          "GET",
          "referral/stats",
        );
        if (statsData) {
          if (registeredEl)
            registeredEl.textContent =
              window.I18n?.t("user.referralStats", {
                count: statsData.total_registered || 0,
              }) || `${statsData.total_registered || 0} registered`;
          if (convertedEl)
            convertedEl.textContent =
              window.I18n?.t("user.referralConverted", {
                count: statsData.total_converted || 0,
              }) || `${statsData.total_converted || 0} converted`;
        }
        if (affBecomeEl) affBecomeEl.style.display = "none";
        if (affStatusEl) affStatusEl.style.display = "none";
        if (affEarnEl) affEarnEl.style.display = "none";
        if (affWithdrawBtn) affWithdrawBtn.style.display = "none";
        if (affProgressWrap) affProgressWrap.style.display = "none";
        if (referralStatsEl) referralStatsEl.style.display = "none";
        try {
          const aff = await window.authManager._apiCall(
            "GET",
            "affiliate/dashboard",
          );
          if (aff) {
            _affDashboardCache = aff;
            _affLink = aff.link || "";
            const status = aff.profile_status || "none";
            try {
              window.eventBus?.emit("affiliate:updated", {
                status,
                can_publish: !!aff.can_publish_templates,
              });
            } catch (_) {}
            const webLinkEl = document.getElementById("affiliateWebLink");
            if (webLinkEl) {
              try {
                if (status === "active" && aff.link) {
                  webLinkEl.href =
                    new URL(aff.link).origin + "/dashboard/affiliate";
                  webLinkEl.style.display = "flex";
                } else {
                  webLinkEl.style.display = "none";
                }
              } catch (_) {
                webLinkEl.style.display = "none";
              }
            }
            if (status === "active") {
              if (affEarnEl && affEarnTextEl) {
                const pending = _fmtEarn(aff.earnings?.pending);
                const approved = _fmtEarn(aff.earnings?.approved);
                const paid = _fmtEarn(aff.earnings?.paid);
                const pct = aff.commission_percent || 0;
                const _moneyIc =
                  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>';
                affEarnTextEl.innerHTML = `${_moneyIc}${window.I18n?.t("affiliate.commissionRate", { pct }) || `<b style="color:var(--primary)">${pct}%</b> commission per order`}<br>${window.I18n?.t("affiliate.pending") || "Pending"}: ${pending || 0} \xB7 ${window.I18n?.t("affiliate.approved") || "Withdrawable"}: ${approved || 0} \xB7 ${window.I18n?.t("affiliate.paid") || "Paid"}: ${paid || 0}`;
                affEarnEl.style.display = "block";
                const savedMethod = aff.payout_method || "bank_vn";
                const wdCurrency = savedMethod === "paypal" ? "USD" : "VND";
                const wdAmount = Number(aff.withdrawable?.[wdCurrency] || 0);
                const minThreshold =
                  wdCurrency === "VND"
                    ? Number(aff.min_payout_vnd || 5e5)
                    : Number(aff.min_payout_usd || 20);
                if (affWithdrawBtn) {
                  if (wdAmount > 0) {
                    affWithdrawBtn.style.display = "inline-block";
                    const reached = wdAmount >= minThreshold;
                    affWithdrawBtn.disabled = !reached;
                    affWithdrawBtn.title = reached
                      ? ""
                      : window.I18n?.t("affiliate.withdrawDisabledTip", {
                          min: _fmtAmount(minThreshold, wdCurrency),
                        }) ||
                        `Need at least ${_fmtAmount(minThreshold, wdCurrency)} to withdraw`;
                  } else {
                    affWithdrawBtn.style.display = "none";
                    affWithdrawBtn.disabled = false;
                    affWithdrawBtn.title = "";
                  }
                }
                const hasAnyEarning =
                  wdAmount > 0 ||
                  Number(aff.earnings?.pending?.[wdCurrency] || 0) > 0;
                if (affProgressWrap && affProgressFill && affProgressHint) {
                  if (hasAnyEarning && minThreshold > 0) {
                    const pctFill = Math.min(
                      100,
                      Math.round((wdAmount / minThreshold) * 100),
                    );
                    affProgressFill.style.width = pctFill + "%";
                    affProgressFill.classList.toggle(
                      "tobyflow-aff-progress__fill--full",
                      wdAmount >= minThreshold,
                    );
                    affProgressHint.innerHTML =
                      wdAmount >= minThreshold
                        ? window.I18n?.t("affiliate.canWithdrawNow", {
                            amount: _fmtAmount(wdAmount, wdCurrency),
                          }) ||
                          `Can withdraw <b style="color:var(--primary)">${_fmtAmount(wdAmount, wdCurrency)}</b>`
                        : window.I18n?.t("affiliate.progressHint", {
                            amount: _fmtAmount(wdAmount, wdCurrency),
                            min: _fmtAmount(minThreshold, wdCurrency),
                          }) ||
                          `${_fmtAmount(wdAmount, wdCurrency)} / ${_fmtAmount(minThreshold, wdCurrency)} withdrawal threshold`;
                    affProgressWrap.style.display = "flex";
                  } else {
                    affProgressWrap.style.display = "none";
                  }
                }
              }
              if (referralStatsEl) referralStatsEl.style.display = "";
            } else if (status === "pending") {
              if (affStatusEl && affStatusTextEl) {
                affStatusTextEl.innerHTML = `${window.I18n?.t("affiliate.status.pending") || "Your affiliate application is awaiting review."}`;
                affStatusTextEl.style.color = "#e0a800";
                if (affReapplyBtn) affReapplyBtn.style.display = "none";
                affStatusEl.style.display = "block";
              }
            } else if (status === "rejected") {
              if (affStatusEl && affStatusTextEl) {
                const reason = aff.reject_reason
                  ? `<br>${window.I18n?.t("affiliate.status.rejectedReason") || "Reason"}: ${aff.reject_reason}`
                  : "";
                affStatusTextEl.innerHTML = `${window.I18n?.t("affiliate.status.rejected") || "Your affiliate application was rejected."}${reason}`;
                affStatusTextEl.style.color = "#e0524d";
                if (affReapplyBtn) affReapplyBtn.style.display = "inline-block";
                affStatusEl.style.display = "block";
              }
            } else {
              if (affBecomeTextEl) {
                const pct = aff.commission_percent || 0;
                affBecomeTextEl.innerHTML =
                  window.I18n?.t("affiliate.becomeAffiliate", { pct }) ||
                  `Become an Affiliate to earn <b style="color:var(--primary)">${pct}%</b> cash commission on every order you refer.`;
              }
              if (affBecomeEl) affBecomeEl.style.display = "block";
            }
          }
        } catch (_) {}
      } catch (e) {
        console.warn("[TobyFlow] Failed to load referral data:", e);
      }
    }
    function _openWithdrawModal() {
      if (!affWdOverlay) return;
      const aff = _affDashboardCache || {};
      if (affWdErrorEl) affWdErrorEl.classList.add("hidden");
      const savedMethod = aff.payout_method === "paypal" ? "paypal" : "bank_vn";
      if (affWdMethodSel) affWdMethodSel.value = savedMethod;
      _toggleWithdrawFields(savedMethod);
      const acc = aff.payout_account || {};
      if (affWdBankName) affWdBankName.value = acc.bank || "";
      if (affWdAccountNo) affWdAccountNo.value = acc.account_no || "";
      if (affWdHolder)
        affWdHolder.value = (savedMethod === "bank_vn" ? acc.holder : "") || "";
      if (affWdPaypalEmail) affWdPaypalEmail.value = acc.paypal_email || "";
      if (affWdPaypalHolder)
        affWdPaypalHolder.value =
          (savedMethod === "paypal" ? acc.holder : "") || "";
      _renderWithdrawSummary(savedMethod);
      affWdOverlay.classList.remove("hidden");
    }
    function _closeWithdrawModal() {
      if (!affWdOverlay) return;
      affWdOverlay.classList.add("hidden");
      if (affWdErrorEl) affWdErrorEl.classList.add("hidden");
    }
    function _toggleWithdrawFields(method) {
      if (affWdBankFields)
        affWdBankFields.style.display = method === "bank_vn" ? "" : "none";
      if (affWdPaypalFields)
        affWdPaypalFields.style.display = method === "paypal" ? "" : "none";
    }
    function _renderWithdrawSummary(method) {
      if (!affWdSummaryEl) return;
      const aff = _affDashboardCache || {};
      const cur = method === "paypal" ? "USD" : "VND";
      const amount = Number(aff.withdrawable?.[cur] || 0);
      const min =
        cur === "VND"
          ? Number(aff.min_payout_vnd || 5e5)
          : Number(aff.min_payout_usd || 20);
      const reached = amount >= min;
      affWdSummaryEl.classList.toggle(
        "tobyflow-aff-wd-summary--warn",
        !reached,
      );
      const lblWithdrawable =
        window.I18n?.t("affiliate.approved") || "Withdrawable";
      const lblMin =
        window.I18n?.t("affiliate.withdrawModal.minLabel") ||
        "Minimum threshold";
      if (reached) {
        affWdSummaryEl.innerHTML = `${lblWithdrawable}: <b>${_fmtAmount(amount, cur)}</b><br>${lblMin}: ${_fmtAmount(min, cur)}`;
      } else {
        const need = Math.max(0, min - amount);
        const needLbl =
          window.I18n?.t("affiliate.withdrawModal.needMore", {
            amount: _fmtAmount(need, cur),
          }) ||
          `Need <b>${_fmtAmount(need, cur)}</b> more to reach the threshold`;
        affWdSummaryEl.innerHTML = `${lblWithdrawable}: <b>${_fmtAmount(amount, cur)}</b> / ${_fmtAmount(min, cur)}<br>${needLbl}`;
      }
    }
    function _validateWithdraw(method) {
      if (method === "paypal") {
        const email = (affWdPaypalEmail?.value || "").trim();
        const holder = (affWdPaypalHolder?.value || "").trim();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return (
            window.I18n?.t("affiliate.withdrawModal.errPaypalEmail") ||
            "Please enter a valid PayPal email."
          );
        }
        if (!holder)
          return (
            window.I18n?.t("affiliate.withdrawModal.errHolder") ||
            "Please enter the account holder name."
          );
        return null;
      }
      if (!(affWdBankName?.value || "").trim())
        return (
          window.I18n?.t("affiliate.withdrawModal.errBankName") ||
          "Please enter the bank name."
        );
      if (!(affWdAccountNo?.value || "").trim())
        return (
          window.I18n?.t("affiliate.withdrawModal.errAccountNo") ||
          "Please enter the account number."
        );
      if (!(affWdHolder?.value || "").trim())
        return (
          window.I18n?.t("affiliate.withdrawModal.errHolder") ||
          "Please enter the account holder name."
        );
      return null;
    }
    function _buildPayoutAccount(method) {
      if (method === "paypal") {
        const email = affWdPaypalEmail.value.trim();
        const holder2 = affWdPaypalHolder.value.trim();
        return {
          paypal_email: email,
          holder: holder2,
          detail: `${email}${holder2 ? " (" + holder2 + ")" : ""}`,
        };
      }
      const bank = affWdBankName.value.trim();
      const no = affWdAccountNo.value.trim();
      const holder = affWdHolder.value.trim();
      return {
        bank,
        account_no: no,
        holder,
        detail: `${no} - ${holder} - ${bank}`,
      };
    }
    async function _submitWithdraw() {
      if (!affWdConfirmBtn || !affWdMethodSel) return;
      const method = affWdMethodSel.value;
      const err = _validateWithdraw(method);
      if (err) {
        if (affWdErrorEl) {
          affWdErrorEl.textContent = err;
          affWdErrorEl.classList.remove("hidden");
        }
        return;
      }
      if (affWdErrorEl) affWdErrorEl.classList.add("hidden");
      const origLabel = affWdConfirmBtn.textContent;
      affWdConfirmBtn.disabled = true;
      affWdConfirmBtn.dataset.loading = "1";
      affWdConfirmBtn.textContent =
        window.I18n?.t("affiliate.withdrawModal.processing") || "Sending...";
      try {
        const acct = _buildPayoutAccount(method);
        const setRes = await window.authManager._apiCall(
          "POST",
          "affiliate/payout-method",
          { payout_method: method, payout_account: acct },
        );
        if (setRes && setRes.ok === false) {
          const msg =
            setRes.message ||
            window.I18n?.t("affiliate.payoutFailed") ||
            "Cannot withdraw right now.";
          if (affWdErrorEl) {
            affWdErrorEl.textContent = msg;
            affWdErrorEl.classList.remove("hidden");
          }
          return;
        }
        const r = await window.authManager._apiCall(
          "POST",
          "affiliate/payout-request",
          {},
        );
        if (r?.ok) {
          _closeWithdrawModal();
          const msg =
            window.I18n?.t("affiliate.payoutRequested") ||
            "Payout requested. Admin will transfer.";
          if (typeof window.showNotification === "function")
            window.showNotification(msg, "success");
          loadReferralData();
        } else {
          const msg =
            r?.message ||
            window.I18n?.t("affiliate.payoutFailed") ||
            "Cannot withdraw right now.";
          if (affWdErrorEl) {
            affWdErrorEl.textContent = msg;
            affWdErrorEl.classList.remove("hidden");
          }
        }
      } catch (e) {
        const msg =
          e?.message ||
          window.I18n?.t("affiliate.payoutFailed") ||
          "Cannot withdraw right now.";
        if (affWdErrorEl) {
          affWdErrorEl.textContent = msg;
          affWdErrorEl.classList.remove("hidden");
        }
      } finally {
        affWdConfirmBtn.disabled = false;
        delete affWdConfirmBtn.dataset.loading;
        affWdConfirmBtn.textContent = origLabel;
      }
    }
    if (affWithdrawBtn) {
      affWithdrawBtn.addEventListener("click", () => {
        if (affWithdrawBtn.disabled) return;
        _openWithdrawModal();
      });
    }
    if (affWdCloseBtn)
      affWdCloseBtn.addEventListener("click", _closeWithdrawModal);
    if (affWdCancelBtn)
      affWdCancelBtn.addEventListener("click", _closeWithdrawModal);
    if (affWdMethodSel) {
      affWdMethodSel.addEventListener("change", () => {
        const m = affWdMethodSel.value;
        _toggleWithdrawFields(m);
        _renderWithdrawSummary(m);
      });
    }
    if (affWdConfirmBtn)
      affWdConfirmBtn.addEventListener("click", _submitWithdraw);
    if (affWdOverlay) {
      affWdOverlay.addEventListener("click", (e) => {
        if (e.target === affWdOverlay) _closeWithdrawModal();
      });
    }
    const affApplyOverlay = document.getElementById("affiliateApplyOverlay");
    const affApplyClose = document.getElementById("affiliateApplyCloseBtn");
    const affApplySubmit = document.getElementById("affApplySubmitBtn");
    const affApplyError = document.getElementById("affApplyError");
    function openAffiliateApply() {
      if (!affApplyOverlay) return;
      if (affApplyError) affApplyError.classList.add("hidden");
      const nameInput = document.getElementById("affApplyName");
      const urlInput = document.getElementById("affApplyChannelUrl");
      const noteInput = document.getElementById("affApplyNote");
      const typeSel = document.getElementById("affApplyChannelType");
      const audSel = document.getElementById("affApplyAudience");
      if (urlInput) urlInput.value = "";
      if (noteInput) noteInput.value = "";
      if (typeSel) typeSel.selectedIndex = 0;
      if (audSel) audSel.selectedIndex = 0;
      if (nameInput) nameInput.value = window.authManager?.user?.name || "";
      const termsCb = document.getElementById("affApplyTerms");
      if (termsCb) termsCb.checked = false;
      affApplyOverlay.classList.remove("hidden");
    }
    function closeAffiliateApply() {
      affApplyOverlay?.classList.add("hidden");
    }
    if (affApplyBtn) affApplyBtn.addEventListener("click", openAffiliateApply);
    if (affReapplyBtn)
      affReapplyBtn.addEventListener("click", openAffiliateApply);
    if (affApplyClose)
      affApplyClose.addEventListener("click", closeAffiliateApply);
    if (affApplyOverlay)
      affApplyOverlay.addEventListener("click", (e) => {
        if (e.target === affApplyOverlay) closeAffiliateApply();
      });
    if (affApplySubmit) {
      affApplySubmit.addEventListener("click", async () => {
        const payload = {
          display_name: (
            document.getElementById("affApplyName")?.value || ""
          ).trim(),
          channel_type:
            document.getElementById("affApplyChannelType")?.value || "other",
          channel_url: (
            document.getElementById("affApplyChannelUrl")?.value || ""
          ).trim(),
          audience_size:
            document.getElementById("affApplyAudience")?.value || "",
          note: (document.getElementById("affApplyNote")?.value || "").trim(),
          accepted: !!document.getElementById("affApplyTerms")?.checked,
        };
        if (!payload.display_name) {
          if (affApplyError) {
            affApplyError.textContent =
              window.I18n?.t("affiliate.apply.errName") ||
              "Please enter a display name.";
            affApplyError.classList.remove("hidden");
          }
          return;
        }
        if (!payload.accepted) {
          if (affApplyError) {
            affApplyError.textContent =
              window.I18n?.t("affiliate.apply.termsRequired") ||
              "Please agree to the Affiliate Program Terms.";
            affApplyError.classList.remove("hidden");
          }
          return;
        }
        affApplySubmit.disabled = true;
        try {
          const r = await window.authManager._apiCall(
            "POST",
            "affiliate/apply",
            payload,
          );
          if (r?.ok) {
            closeAffiliateApply();
            const msg =
              r.profile_status === "active"
                ? window.I18n?.t("affiliate.apply.successActive") ||
                  "Application approved! You are now an affiliate."
                : window.I18n?.t("affiliate.apply.successPending") ||
                  "Application submitted. Awaiting admin review.";
            if (typeof window.showNotification === "function")
              window.showNotification(msg, "success");
            loadReferralData();
          } else {
            const m =
              r?.message ||
              window.I18n?.t("affiliate.apply.failed") ||
              "Cannot apply right now.";
            if (affApplyError) {
              affApplyError.textContent = m;
              affApplyError.classList.remove("hidden");
            }
          }
        } catch (e) {
          if (affApplyError) {
            affApplyError.textContent =
              e?.message ||
              window.I18n?.t("affiliate.apply.failed") ||
              "Cannot apply right now.";
            affApplyError.classList.remove("hidden");
          }
        } finally {
          affApplySubmit.disabled = false;
        }
      });
    }
    if (copyBtn) {
      copyBtn.addEventListener("click", async () => {
        const code = codeValue?.textContent;
        if (!code || code === "---") return;
        const toCopy = _affLink || code;
        try {
          await navigator.clipboard.writeText(toCopy);
          const copiedLabel =
            window.I18n?.t("app.linkCopied") || "Link copied!";
          copyBtn.title = copiedLabel;
          copyBtn.setAttribute("data-tooltip", copiedLabel);
          copyBtn.classList.add("copied");
          if (!copyBtn._origHtml) copyBtn._origHtml = copyBtn.innerHTML;
          copyBtn.innerHTML =
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
          clearTimeout(copyBtn._revertT);
          copyBtn._revertT = setTimeout(() => {
            copyBtn.classList.remove("copied");
            if (copyBtn._origHtml) copyBtn.innerHTML = copyBtn._origHtml;
            const back = window.I18n?.t("app.copyLink") || "Copy link";
            copyBtn.title = back;
            copyBtn.setAttribute("data-tooltip", back);
          }, 1800);
        } catch (e) {
          console.warn("[TobyFlow] Clipboard write failed:", e);
        }
      });
    }
    if (window.eventBus) {
      window.eventBus.on("auth:login", () => loadReferralData());
    }
    loadReferralData();
  }
  function setupConversionTriggers() {
    if (!window.eventBus) return;
    const toastEl = document.getElementById("conversionToast");
    const toastMsg = document.getElementById("conversionToastMsg");
    const toastUpgradeBtn = document.getElementById(
      "conversionToastUpgradeBtn",
    );
    const toastCloseBtn = document.getElementById("conversionToastCloseBtn");
    let toastTimer = null;
    function showUpgradeOverlay() {
      if (typeof window.openUpgradeModal === "function") {
        window.openUpgradeModal();
      }
    }
    function showToast2(message) {
      if (!toastEl || !toastMsg) return;
      if (toastTimer) clearTimeout(toastTimer);
      toastMsg.textContent = message;
      toastEl.classList.remove("hidden");
      toastTimer = setTimeout(() => {
        toastEl.classList.add("hidden");
      }, 8e3);
    }
    function hideToast() {
      if (toastEl) toastEl.classList.add("hidden");
      if (toastTimer) {
        clearTimeout(toastTimer);
        toastTimer = null;
      }
    }
    window.showToast = showToast2;
    window.eventBus.on("feature:locked", (data) => {
      const featureName = data?.feature || "";
      log("Feature locked:", featureName);
      if (data?.container && data.container instanceof HTMLElement) {
        const existing = data.container.querySelector(
          ".tobyflow-conversion-inline-nudge",
        );
        if (existing) return;
        const nudge = document.createElement("div");
        nudge.className = "tobyflow-conversion-inline-nudge";
        nudge.innerHTML = `
          <div class="tobyflow-conversion-inline-nudge__icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <span class="tobyflow-conversion-inline-nudge__text">${window.I18n?.t("upgrade.unlockFeature") || "Upgrade to unlock this feature"}</span>
          <button class="btn btn-primary btn-sm tobyflow-conversion-inline-nudge__btn">${window.I18n?.t("common.upgrade") || "Upgrade"}</button>
        `;
        nudge
          .querySelector(".tobyflow-conversion-inline-nudge__btn")
          .addEventListener("click", showUpgradeOverlay);
        data.container.prepend(nudge);
      } else {
        showToast2(
          window.I18n?.t("msg.upgradeRequired") ||
            "Upgrade required to use this feature",
        );
      }
    });
    window.eventBus.on("quota:exceeded", (data) => {
      log("Quota exceeded:", data?.quota);
      showToast2(window.I18n?.t("msg.quotaExhausted") || "Quota exhausted");
    });
    window.eventBus.on("quota:warning", (data) => {
      const remaining = data?.remaining ?? 0;
      const limit = data?.limit ?? 0;
      log("Quota warning:", remaining, "/", limit, "remaining");
      showToast2(
        window.I18n?.t("app.quotaWarning", { remaining, limit }) ||
          `${remaining}/${limit} prompts left today. Upgrade for unlimited`,
      );
    });
    window.eventBus.on("quota:exhausted", (data) => {
      const limit = data?.limit ?? 0;
      const module = data?.module || "Generate";
      log("Quota exhausted:", limit, "limit for", module);
      if (window.customDialog) {
        const showUpgrade =
          window.SystemConfig?.getBool("show_upgrade_ui") !== false;
        const contactUrl = window.SystemConfig?.get("upgrade_contact_url", "");
        const buttons = [
          {
            label: window.I18n?.t("common.close") || "Close",
            primary: false,
            action: () => {},
          },
        ];
        if (showUpgrade) {
          buttons.push({
            label: window.I18n?.t("upgrade.upgradeNow") || "Upgrade now",
            primary: true,
            action: () => {
              showUpgradeOverlay();
            },
          });
        } else if (contactUrl) {
          buttons.push({
            label: window.I18n?.t("overlay.contact") || "Contact Support",
            primary: true,
            action: () => {
              window.open(contactUrl, "_blank");
            },
          });
        }
        window.customDialog.alert(
          `<div style="line-height:1.6">
            <p>${window.I18n?.t("app.quotaExhaustedMsg", { limit }) || `You've used up all <strong>${limit} prompt runs</strong> today.`}</p>
            <p style="margin-top:12px;color:var(--muted-foreground)">${showUpgrade ? window.I18n?.t("app.upgradeForUnlimited") || "Upgrade to Premium for unlimited daily prompt runs and many more features." : window.I18n?.t("app.contactAdminUpgrade") || "Please contact admin to upgrade your plan."}</p>
          </div>`,
          {
            title:
              window.I18n?.t("msg.globalQuotaExhausted") ||
              "Daily prompt limit reached",
            type: "warning",
            html: true,
            buttons,
          },
        );
      }
    });
    if (toastUpgradeBtn) {
      toastUpgradeBtn.addEventListener("click", () => {
        hideToast();
        showUpgradeOverlay();
      });
    }
    if (toastCloseBtn) {
      toastCloseBtn.addEventListener("click", hideToast);
    }
    window.eventBus?.on("upload:failed", (data) => {
      const errorMsg = data?.error || "Unknown error";
      const shortKey = data?.key ? data.key.substring(0, 15) + "..." : "";
      if (typeof sendLog === "function") {
        sendLog(
          `[Upload] ${shortKey ? shortKey + " \u2014 " : ""}${errorMsg}`,
          "error",
        );
      }
      const maybeNoProject =
        /no tile id|tile id returned|no project|chưa có project/i.test(
          errorMsg,
        );
      if (maybeNoProject && window.ProjectHelper?.hasActiveProject) {
        window.ProjectHelper.hasActiveProject().then((has) => {
          if (has) {
            showToast2(
              window.I18n?.t("msg.uploadFailed", { error: errorMsg }) ||
                `Upload failed: ${errorMsg}`,
            );
          } else {
            window.ProjectHelper.warnNoProjectForUpload(
              window.workflowEditor?.workflow?.project_id || null,
            );
          }
        });
        return;
      }
      showToast2(
        window.I18n?.t("msg.uploadFailed", { error: errorMsg }) ||
          `Upload failed: ${errorMsg}`,
      );
    });
  }
  window.TobyFlowApp = { init, initializeTab, loadCSS, loadJS };
})();
