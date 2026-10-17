(function () {
  const $ = (id) => document.getElementById(id);
  const MAX_LOG_LINES = 400;
  function setStatus(text, cls) {
    const el = $("rwStatus");
    if (!el) return;
    el.textContent = text;
    el.className = "rw-status" + (cls ? ` rw-status--${cls}` : "");
  }
  function setTitle(text) {
    const el = $("rwTitle");
    if (el) el.textContent = text;
  }
  function setProgress(html) {
    const el = $("rwProgress");
    if (el) el.innerHTML = html;
  }
  function addLog(msg, level) {
    const box = $("rwLog");
    if (!box) return;
    if (level === "error") $("rwLogWrap")?.classList.add("rw-log-wrap--open");
    const line = document.createElement("div");
    line.className = "rw-log-line" + (level ? ` rw-log-line--${level}` : "");
    line.textContent = `[${new Date().toLocaleTimeString(window.I18n?.getLocale?.() || navigator.language)}] ${msg}`;
    box.appendChild(line);
    while (box.childNodes.length > MAX_LOG_LINES)
      box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
  }
  let _running = false;
  let _currentWfId = null;
  let _totalNodes = 0;
  let _doneNodes = 0;
  const NODE_BADGE_LABEL = {
    pending: "Pending",
    running: "Running",
    completed: "Done",
    failed: "Failed",
    skipped: "Skipped",
  };
  function renderNodeList(nodes, onlyNodeId = null) {
    const box = $("rwNodes");
    if (!box) return;
    box.innerHTML = "";
    const list = (nodes || []).filter((n) => n.node_type !== "note");
    _totalNodes = 0;
    _doneNodes = 0;
    list.forEach((n, i) => {
      const runnable =
        n.enabled !== false && (!onlyNodeId || n.node_id === onlyNodeId);
      if (runnable) _totalNodes++;
      const row = document.createElement("div");
      row.className = "rw-node" + (runnable ? "" : " rw-node--disabled");
      row.id = `rw-node-${n.node_id}`;
      const idx = document.createElement("span");
      idx.className = "rw-node-idx";
      idx.textContent = String(i + 1);
      const name = document.createElement("span");
      name.className = "rw-node-name";
      name.textContent = n.node_name || n.node_type;
      const type = document.createElement("span");
      type.className = "rw-node-type";
      type.textContent = n.node_type;
      const badge = document.createElement("span");
      badge.className = "rw-node-badge";
      badge.dataset.badge = "1";
      badge.textContent = runnable ? NODE_BADGE_LABEL.pending : "Off";
      row.append(idx, name, type, badge);
      box.appendChild(row);
    });
    updateBar();
  }
  function setNodeBadge(nodeId, status) {
    const row = document.getElementById(`rw-node-${nodeId}`);
    if (!row) return;
    row.className = "rw-node rw-node--" + status;
    const badge = row.querySelector("[data-badge]");
    if (badge) {
      badge.className = `rw-node-badge rw-node-badge--${status}`;
      badge.textContent = NODE_BADGE_LABEL[status] || status;
    }
    if (status === "running") {
      try {
        row.scrollIntoView({ block: "nearest", behavior: "smooth" });
      } catch (_) {}
    }
  }
  function updateBar(error = false) {
    const fill = $("rwBarFill");
    if (!fill) return;
    const pct =
      _totalNodes > 0 ? Math.round((_doneNodes / _totalNodes) * 100) : 0;
    fill.style.width = `${Math.min(100, pct)}%`;
    fill.className = "rw-bar-fill" + (error ? " rw-bar-fill--error" : "");
  }
  async function bootstrap() {
    document.body.classList.add("rw-popup");
    if (window.I18n) {
      try {
        await window.I18n.init();
      } catch (_) {}
    }
    if (window.storageSettings) {
      try {
        await window.storageSettings.loadAndApply();
      } catch (_) {}
    }
    try {
      window.ChatGPTConfig?.fetchInBackground?.();
    } catch (_) {}
    try {
      window.GrokConfig?.fetchInBackground?.();
    } catch (_) {}
    if (window.authManager) await window.authManager.init();
    if (!window.authManager?.isLoggedIn()) {
      setStatus("Not signed in", "failed");
      setProgress("Sign in to the extension from the sidebar, then try again.");
      addLog("Not signed in \u2014 workflow cannot run.", "error");
      return false;
    }
    if (window.SseClient && window.authManager?.isLoggedIn()) {
      try {
        await window.SseClient.connect();
      } catch (_) {}
    }
    if (window.RequestCoalescer) {
      try {
        window.RequestCoalescer.init();
      } catch (_) {}
    }
    if (window.storageManager) await window.storageManager.init();
    if (window.featureGate) {
      await window.featureGate.init();
      try {
        if (!window.featureGate._isCacheValid?.() && window.featureGate.refresh)
          await window.featureGate.refresh();
      } catch (_) {}
    }
    if (window.SystemConfig) {
      try {
        await SystemConfig.restoreFromStorage();
      } catch (_) {}
    }
    try {
      if (window.PendingUploadStore) {
        await PendingUploadStore.restore();
        await PendingUploadStore.restoreCache();
        await PendingUploadStore.restoreLightweight();
      }
    } catch (_) {}
    try {
      await window.ProviderConfigManager?._fetchApiConfigs?.();
    } catch (_) {}
    try {
      window.CharacterRegistry?.initCrossContextSync?.();
      window.CharacterRegistry?.getScrapedList?.().catch(() => {});
      if (window.VoiceRegistry) {
        window.VoiceRegistry.initCrossContextSync?.();
        await Promise.all([
          window.VoiceRegistry.getBaseCatalog?.("flow").catch(() => null),
          window.VoiceRegistry.getScrapedList?.().catch(() => null),
        ]);
      }
    } catch (_) {}
    try {
      await window.ProviderMeta?.fetch?.();
      window.ProviderMeta?.init?.();
    } catch (_) {}
    if (window.WorkflowExecutor && !window.workflowExecutor) {
      window.workflowExecutor = new WorkflowExecutor();
    }
    try {
      window.generationHistory?.init();
    } catch (_) {}
    try {
      window.NodeTemplates?.clearServerCache?.();
      await window.NodeTemplates?.fetchFromServer?.().catch(() => {});
    } catch (_) {}
    return true;
  }
  function bindProgressUI() {
    const eb = window.eventBus;
    if (!eb) return;
    let done = 0;
    eb.on("execution:started", (d) => {
      done = 0;
      _running = true;
      setStatus("Running", "running");
      $("rwStop").disabled = false;
      if (d?.workflow?.wf_name) setTitle(d.workflow.wf_name);
      addLog(`Started workflow "${d?.workflow?.wf_name || _currentWfId}"`);
    });
    eb.on("execution:single_node_state", (data) => {
      if (String(data?.workflowId) !== String(_currentWfId)) return;
      const states = data.nodes || [];
      _totalNodes = Math.max(_totalNodes, done + states.length);
      for (const state of states)
        setNodeBadge(
          state.nodeId,
          state.status === "queued" ? "pending" : "running",
        );
      updateBar();
    });
    eb.on("node:cancelled", (data) => {
      if (data?.node?.node_id) setNodeBadge(data.node.node_id, "pending");
      addLog(`Stopped node: ${data?.node?.node_id || ""}`, "warn");
    });
    eb.on("node:started", (d) => {
      setProgress(
        `Running node: <b>${d?.node?.node_name || d?.node?.node_id || ""}</b>`,
      );
      if (d?.node?.node_id) setNodeBadge(d.node.node_id, "running");
      addLog(`\u25B6 Node "${d?.node?.node_name || d?.node?.node_id}" started`);
    });
    eb.on("node:phase", (d) => {
      if (d?.phase) setProgress(`Current node: <b>${d.phase}</b>`);
    });
    eb.on("node:completed", (d) => {
      done++;
      _doneNodes = done;
      if (d?.node?.node_id) setNodeBadge(d.node.node_id, "completed");
      updateBar();
      addLog(
        `\u2714 Node "${d?.node?.node_name || d?.node?.node_id}" completed (${d?.result?.fileIds?.length || 0} results)`,
        "ok",
      );
      setProgress(`Progress: <b>${done}/${_totalNodes || "?"}</b> nodes`);
    });
    eb.on("node:failed", (d) => {
      if (d?.node?.node_id) setNodeBadge(d.node.node_id, "failed");
      updateBar(true);
      addLog(
        `\u2716 Node "${d?.node?.node_name || d?.node?.node_id}" failed: ${d?.error?.message || ""}`,
        "error",
      );
    });
    eb.on("node:warning", (d) => {
      if (d?.node?.node_id) setNodeBadge(d.node.node_id, "skipped");
      addLog(`\u26A0 ${d?.message || ""}`, "warn");
    });
    eb.on("execution:log", (d) => {
      const msg = typeof d === "string" ? d : d?.message || "";
      if (msg)
        addLog(
          msg,
          d?.level === "warn"
            ? "warn"
            : d?.level === "error"
              ? "error"
              : void 0,
        );
    });
    eb.on("execution:completed", (d) => {
      _running = false;
      $("rwStop").disabled = true;
      if (d?.error) {
        setStatus("Failed", "failed");
        setProgress(`Finished with an error: ${d.error.message || ""}`);
      } else if (d?.stopped) {
        setStatus("Stopped", "failed");
        setProgress("The workflow was stopped.");
      } else {
        setStatus("Completed", "completed");
        setProgress("Workflow completed. You can close this window.");
        _doneNodes = _totalNodes;
        updateBar();
      }
    });
    eb.on("execution:captcha_detected", (d) => {
      setStatus("Paused", "failed");
      setProgress(
        "\u{1F6E1}\uFE0F Google temporarily blocked the request (reCAPTCHA 403). Wait a few minutes, then run the workflow again.",
      );
      addLog(
        "reCAPTCHA 403: " +
          (d?.text || "unusual activity") +
          " \u2014 workflow paused.",
        "warn",
      );
    });
    eb.on("execution:captcha_resolved", () => {
      addLog("Verified \u2014 continuing.", "ok");
      setStatus("Running", "running");
    });
    eb.on("execution:quota_exceeded", (d) => {
      setStatus("Quota exceeded", "failed");
      addLog("Quota: " + (d?.text || "Flow quota reached"), "error");
    });
    eb.on("node:policy_blocked", (d) => {
      addLog(
        "Policy: " +
          (d?.text || "policy violation") +
          " \u2014 change the prompt.",
        "error",
      );
    });
    eb.on("execution:rate_limited", (d) => {
      addLog(
        "Rate limit: " +
          (d?.text || "slow down") +
          " \u2014 wait before retrying.",
        "warn",
      );
    });
  }
  function bindRemoteStop() {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.action === "sseRelay:entitlements_changed") {
        if (msg.data?.features && msg.data?.plan)
          window.featureGate?.handleSseEntitlementsChanged?.(msg.data);
        window.ProviderConfigManager?.fetchPrivateConfigs?.(true).catch(
          () => {},
        );
      }
      if (msg?.action === "sseRelay:system_settings_changed" && msg.data) {
        window.SystemConfig?.handleSseUpdate?.(msg.data);
      }
      if (msg?.action === "captcha:userAction") {
        window.eventBus?.emit("captcha:userAction", { decision: msg.decision });
      }
      if (
        msg?.action === "workflowExecutionEvent" &&
        ["execution:stop", "execution:force_stop"].includes(msg.event)
      ) {
        const stopWfId = msg.data?.wf_id;
        if (!stopWfId || stopWfId === _currentWfId) {
          const exec = window.workflowExecutor;
          if (exec?.handleRemoteStop?.(stopWfId, msg.data?.run_id) === false)
            return;
          addLog("Received a remote stop request...", "warn");
          setStatus("Stopping...", "running");
          const stopBtn = $("rwStop");
          if (stopBtn) stopBtn.disabled = true;
        }
      }
      if (msg?.action === "loadRunWorkflow") {
        consumePendingAndRun();
      }
    });
    $("rwStop")?.addEventListener("click", () => {
      if (window.workflowExecutor?.isRunning) {
        addLog("Stopping workflow...", "warn");
        try {
          window.workflowExecutor.stop(true);
        } catch (_) {}
      }
    });
  }
  async function fillProjectIdIfMissing(wf) {
    try {
      if (!wf || wf.project_id) return;
      const ctx = await window.MessageBridge?.sendToContentScript?.(
        "getProjectContext",
      ).catch(() => null);
      if (ctx?.projectId && !ctx.projectError) {
        await window.storageManager.saveWorkflow({
          ...wf,
          nodes: void 0,
          edges: void 0,
          project_id: ctx.projectId,
          project_name: ctx.projectName || void 0,
        });
        addLog(
          `Assigned workflow to the open Flow project: ${ctx.projectName || ctx.projectId}`,
        );
      }
    } catch (e) {
      addLog(`Could not assign the project (skipped): ${e.message}`, "warn");
    }
  }
  const PROVIDER_LABEL = {
    flow: "Google Flow (flow.google.com)",
    chatgpt: "ChatGPT (chatgpt.com)",
    grok: "Grok (grok.com)",
    gemini: "Gemini (gemini.google.com)",
  };
  function providersOfWorkflow(nodes, onlyNodeId = null) {
    const set = new Set();
    for (const n of nodes || []) {
      if (n.enabled === false) continue;
      if (onlyNodeId && n.node_id !== onlyNodeId) continue;
      if (n.node_type === "generate") set.add("flow");
      else if (n.node_type === "chatgpt") set.add("chatgpt");
      else if (n.node_type === "grok") set.add("grok");
      else if (n.node_type === "prompt" && n.use_ai === true)
        set.add(n.provider === "gemini" ? "gemini" : "chatgpt");
    }
    return [...set];
  }
  async function checkProvidersQuiet(providers) {
    const notReady = [];
    for (const p of providers) {
      let ready = false,
        reason = "";
      try {
        if (p === "chatgpt") {
          const r = await window.ChatGPTSession?.ensureReady?.({
            createIfMissing: false,
            activate: false,
          });
          ready = !!r?.ready;
          reason =
            r?.error === "NOT_LOGGED_IN"
              ? "not logged in"
              : r?.error || "tab not open";
        } else if (p === "gemini") {
          const r = await window.GeminiSession?.ensureReady?.({
            createIfMissing: false,
            activate: false,
          });
          ready = !!r?.ready;
          reason =
            r?.error === "NOT_LOGGED_IN"
              ? "not logged in"
              : r?.error || "tab not open";
        } else if (p === "grok") {
          const r = await window.GrokSession?.ensureReady?.({
            createIfMissing: false,
            activate: false,
          });
          ready = !!r?.ready;
          reason =
            r?.error === "NOT_LOGGED_IN"
              ? "not logged in"
              : r?.error || "tab not open";
        } else if (p === "flow") {
          ready = (await window.ProjectHelper?.isFlowProjectReady?.()) === true;
          reason = "Flow is not open or no project is selected";
        }
      } catch (e) {
        reason = e?.message || "check failed";
      }
      if (!ready) notReady.push({ provider: p, reason });
    }
    return notReady;
  }
  function showProviderPanel(notReady, onRetry, onForce) {
    const panel = $("rwProviders");
    if (!panel) return;
    panel.hidden = false;
    panel.innerHTML = "";
    const h = document.createElement("h4");
    h.textContent = `${notReady.length} provider(s) not ready`;
    const ul = document.createElement("ul");
    notReady.forEach((x) => {
      const li = document.createElement("li");
      li.textContent = `${PROVIDER_LABEL[x.provider] || x.provider}: ${x.reason}`;
      ul.appendChild(li);
    });
    const hint = document.createElement("div");
    hint.style.cssText = "color:#a8a8ae;margin-bottom:10px;";
    hint.textContent =
      "Open the provider tab and sign in (Flow needs an open project), then click Re-check.";
    const actions = document.createElement("div");
    actions.className = "rw-pv-actions";
    const btnRetry = document.createElement("button");
    btnRetry.type = "button";
    btnRetry.className = "rw-pv-btn rw-pv-btn--primary";
    btnRetry.textContent = "Re-check";
    btnRetry.addEventListener("click", onRetry);
    const btnForce = document.createElement("button");
    btnForce.type = "button";
    btnForce.className = "rw-pv-btn";
    btnForce.textContent = "Run anyway";
    btnForce.addEventListener("click", onForce);
    actions.append(btnRetry, btnForce);
    panel.append(h, ul, hint, actions);
  }
  function hideProviderPanel() {
    const p = $("rwProviders");
    if (p) {
      p.hidden = true;
      p.innerHTML = "";
    }
  }
  function preflightGate(providers) {
    return new Promise((resolve) => {
      const attempt = async () => {
        setProgress("Checking providers...");
        const notReady = await checkProvidersQuiet(providers);
        if (!notReady.length) {
          hideProviderPanel();
          resolve(true);
          return;
        }
        setStatus("Waiting for provider", "failed");
        setProgress("Provider is not ready \u2014 see the instructions below.");
        addLog(
          `Providers not ready: ${notReady.map((x) => x.provider).join(", ")}`,
          "warn",
        );
        showProviderPanel(notReady, attempt, () => {
          hideProviderPanel();
          addLog("Provider check skipped \u2014 running anyway.", "warn");
          resolve(true);
        });
      };
      attempt();
    });
  }
  let _consuming = false;
  async function consumePendingAndRun() {
    if (_consuming) return;
    if (_running || window.workflowExecutor?.isRunning) {
      addLog(
        "A workflow is already running \u2014 ignoring the new request.",
        "warn",
      );
      return;
    }
    _consuming = true;
    try {
      const stored = await chrome.storage.local.get(["_pendingRunWorkflow"]);
      const pending = stored?._pendingRunWorkflow;
      if (!pending?.wfId) {
        setProgress("No workflow is waiting to run.");
        return;
      }
      await chrome.storage.local.remove("_pendingRunWorkflow");
      if (Date.now() - (pending.timestamp || 0) > 2 * 60 * 1e3) {
        setProgress("The run request expired \u2014 click Run again.");
        return;
      }
      _currentWfId = pending.wfId;
      setTitle(`Workflow ${pending.wfId}`);
      setStatus("Preparing", "running");
      setProgress("Loading workflow...");
      hideProviderPanel();
      let wfMeta = null;
      try {
        wfMeta = await window.storageManager?.getWorkflow?.(pending.wfId);
      } catch (e) {
        addLog(`Could not load workflow: ${e.message}`, "error");
        setStatus("Failed", "failed");
        setProgress(`Could not load workflow: ${e.message}`);
        return;
      }
      if (wfMeta?.wf_name) setTitle(wfMeta.wf_name);
      const _allNodes = wfMeta?.nodes || [];
      const _scopeIds =
        Array.isArray(pending.onlyNodeIds) && pending.onlyNodeIds.length
          ? new Set(pending.onlyNodeIds.map(String))
          : null;
      const _scopedNodes = _scopeIds
        ? _allNodes.filter((n) => _scopeIds.has(String(n.node_id)))
        : _allNodes;
      renderNodeList(_scopedNodes, pending.nodeId || null);
      await fillProjectIdIfMissing(wfMeta);
      const provs = providersOfWorkflow(_scopedNodes, pending.nodeId || null);
      if (provs.length) await preflightGate(provs);
      setStatus("Preparing", "running");
      const runOpts = { manualSubmitMode: pending.manualSubmitMode === true };
      if (Array.isArray(pending.onlyNodeIds) && pending.onlyNodeIds.length)
        runOpts.onlyNodeIds = pending.onlyNodeIds;
      let ok = false;
      try {
        if (pending.nodeId) {
          addLog(`Running one node: ${pending.nodeId}`);
          ok = await window.workflowExecutor.executeSingleNode(
            pending.wfId,
            pending.nodeId,
            runOpts,
          );
        } else {
          if (runOpts.onlyNodeIds)
            addLog(`Running a group of ${runOpts.onlyNodeIds.length} nodes`);
          ok = await window.workflowExecutor.execute(pending.wfId, runOpts);
        }
      } catch (e) {
        addLog(`Workflow execution failed: ${e.message}`, "error");
        setStatus("Failed", "failed");
        setProgress(`Error: ${e.message}`);
        return;
      }
      if (!ok && !window.workflowExecutor?.isRunning) {
        if ($("rwStatus")?.textContent === "Preparing") {
          setStatus("Could not start", "failed");
          setProgress(
            "Workflow did not start (quota, busy state, or configuration error). See the log below.",
          );
        }
      }
    } finally {
      _consuming = false;
    }
  }
  document.addEventListener("DOMContentLoaded", async () => {
    if (window.EventBus && !window.eventBus) window.eventBus = new EventBus();
    $("rwLogToggle")?.addEventListener("click", () =>
      $("rwLogWrap")?.classList.toggle("rw-log-wrap--open"),
    );
    bindProgressUI();
    bindRemoteStop();
    const ready = await bootstrap().catch((e) => {
      setStatus("Startup failed", "failed");
      setProgress(`Bootstrap error: ${e.message}`);
      addLog(`Bootstrap error: ${e.message}`, "error");
      return false;
    });
    if (!ready) return;
    addLog("Execution environment is ready.");
    await consumePendingAndRun();
  });
})();
