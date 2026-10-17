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
const _ExecutionTracker = class _ExecutionTracker {
  static init() {
    if (!this._instance) {
      this._instance = new _ExecutionTracker();
    }
    return this._instance;
  }
  static getInstance() {
    return this._instance;
  }
  constructor() {
    this._state = "hidden";
    this._data = null;
    this._startTime = null;
    this._errorCount = 0;
    this._completionTimer = null;
    this._elapsedTimer = null;
    this._pipelineMode = false;
    this._createDOM();
    this._bindEvents();
  }
  _createDOM() {
    this._el = document.createElement("div");
    this._el.className = "tobyflow-exec-tracker tobyflow-exec-tracker--hidden";
    this._el.innerHTML = `
      <div class="tobyflow-exec-tracker__bar">
        <div class="tobyflow-exec-tracker__progress-fill"></div>
        <div class="tobyflow-exec-tracker__content">
          <span class="tobyflow-exec-tracker__icon">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </span>
          <span class="tobyflow-exec-tracker__label"></span>
          <span class="tobyflow-exec-tracker__phase"></span>
          <span class="tobyflow-exec-tracker__counter"></span>
          <span class="tobyflow-exec-tracker__elapsed"></span>
          <span class="tobyflow-exec-tracker__retry-status"></span>
          <span class="tobyflow-exec-tracker__error-badge tobyflow-exec-tracker__error-badge--hidden">0</span>
          <div class="tobyflow-exec-tracker__actions">
            <button class="tobyflow-exec-tracker__btn tobyflow-exec-tracker__btn--pause" title="${window.I18n?.t("common.pause") || "Pause"}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="7" y="6" width="3" height="12" rx="1"></rect>
                <rect x="14" y="6" width="3" height="12" rx="1"></rect>
              </svg>
            </button>
            <button class="tobyflow-exec-tracker__btn tobyflow-exec-tracker__btn--stop" title="${window.I18n?.t("common.stop") || "Stop"}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <rect x="5" y="5" width="14" height="14" rx="2"></rect>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
    const footer = document.getElementById("appFooter");
    if (footer && footer.parentNode) {
      footer.parentNode.insertBefore(this._el, footer);
    } else {
      document.body.appendChild(this._el);
    }
    this._progressFill = this._el.querySelector(
      ".tobyflow-exec-tracker__progress-fill",
    );
    this._labelEl = this._el.querySelector(".tobyflow-exec-tracker__label");
    this._phaseEl = this._el.querySelector(".tobyflow-exec-tracker__phase");
    this._counterEl = this._el.querySelector(".tobyflow-exec-tracker__counter");
    this._elapsedEl = this._el.querySelector(".tobyflow-exec-tracker__elapsed");
    this._errorBadge = this._el.querySelector(
      ".tobyflow-exec-tracker__error-badge",
    );
    this._iconEl = this._el.querySelector(".tobyflow-exec-tracker__icon");
    this._pauseBtn = this._el.querySelector(
      ".tobyflow-exec-tracker__btn--pause",
    );
    this._stopBtn = this._el.querySelector(".tobyflow-exec-tracker__btn--stop");
    this._actionsEl = this._el.querySelector(".tobyflow-exec-tracker__actions");
    this._retryStatusEl = this._el.querySelector(
      ".tobyflow-exec-tracker__retry-status",
    );
    this._retryTimer = null;
    this._pauseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._handlePause();
    });
    this._stopBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._handleStop();
    });
    this._el.addEventListener("click", () => {
      if (this._state === "completing") this._hide();
    });
  }
  _bindEvents() {
    if (!window.eventBus) return;
    window.eventBus.on("execution:lock_changed", (state) => {
      console.log(
        "[ExecutionTracker] lock_changed:",
        state,
        "pipelineMode:",
        this._pipelineMode,
        "state:",
        this._state,
      );
      if (state.owner && state.owner !== "queue") {
        this._pipelineMode = false;
      }
      if (state.locked && this._state === "hidden") {
        this._show(state);
      } else if (!state.locked && this._state !== "hidden") {
        if (this._state !== "completing") {
          this._showCompletion();
        }
      }
    });
    window.eventBus.on("execution:tracker_update", (data) => {
      console.log(
        "[ExecutionTracker] tracker_update:",
        data,
        "pipelineMode:",
        this._pipelineMode,
      );
      if (this._pipelineMode) return;
      this._onUpdate(data);
    });
    window.eventBus.on("execution:captcha_detected", () => {
      this._pauseReason = window.I18n?.t("exec.pausedCaptcha") || null;
    });
    window.eventBus.on("execution:manual_pause", () => {
      this._pauseReason = window.I18n?.t("exec.pausedManual") || null;
    });
    window.eventBus.on("queue:state_changed", (snapshot) => {
      if (!this._isPipelineEnabled()) return;
      this._pipelineMode = true;
      if (this._state !== "hidden") this._hide();
    });
    window.eventBus.on("queue:external_state", (snapshot) => {
      if (!this._isPipelineEnabled()) return;
      this._pipelineMode = true;
      if (this._state !== "hidden") this._hide();
    });
    window.eventBus.on("retry:status", (data) => {
      this._showRetryStatus(data?.text || data?.message);
    });
    window.eventBus.on("execution:force_stopped", () => {
      if (this._state !== "hidden") this._hide();
    });
    chrome.runtime.onMessage?.addListener((msg) => {
      if (msg?.action === "retry:status" && msg?.text) {
        this._showRetryStatus(msg.text);
      }
    });
  }
  _isPipelineEnabled() {
    return (
      window.PromptQueue &&
      typeof window.PromptQueue.isEnabled === "function" &&
      window.PromptQueue.isEnabled()
    );
  }
  _onPipelineUpdate(snapshot) {
    if (!snapshot) return;
    const jobs = snapshot.jobs || [];
    if (jobs.length === 0) {
      if (this._state !== "hidden") this._hide();
      return;
    }
    let totalItems = 0;
    let completedItems = 0;
    let failedItems = 0;
    let activeOwner = null;
    let activeLabel = null;
    for (const job of jobs) {
      if (!job.items) continue;
      for (const item of job.items) {
        totalItems++;
        if (item.state === "COMPLETED") completedItems++;
        if (item.state === "FAILED" || item.state === "PARTIAL_FAIL")
          failedItems++;
      }
      if (!activeOwner && job.state !== "completed") {
        activeOwner = job.owner;
        activeLabel = job.label;
      }
    }
    let phase = "prompt_submitting";
    const pipeline = snapshot.pipeline || {};
    if (pipeline.editor === "idle" && pipeline.tileMonitor > 0) {
      phase = "waiting_tiles";
    } else if (pipeline.download > 0) {
      phase = "download";
    }
    const allDone = jobs.every(
      (j) => j.state === "completed" || j.state === "stopped",
    );
    if (allDone) {
      this._data = {
        owner: activeOwner || "queue",
        label: activeLabel || "Pipeline",
        phase: jobs.some((j) => j.state === "stopped")
          ? "stopped"
          : failedItems > 0
            ? "error"
            : "completed",
        current: completedItems,
        total: totalItems,
      };
      this._errorCount = failedItems;
      if (this._state !== "completing") {
        this._showCompletion();
      }
      return;
    }
    this._data = {
      owner: activeOwner || "queue",
      label: activeLabel || "Pipeline",
      phase,
      current: completedItems,
      total: totalItems,
    };
    this._errorCount = failedItems;
    if (this._state === "hidden") {
      this._startTime = Date.now();
      this._startElapsedTimer();
      this._state = "visible";
      this._el.className = "tobyflow-exec-tracker";
      this._el.removeAttribute("data-state");
    }
    this._render();
  }
  _show(lockState) {
    console.log(
      "[ExecutionTracker] _show called:",
      lockState,
      "pipelineMode:",
      this._pipelineMode,
    );
    if (this._pipelineMode) return;
    this._data = {
      owner: lockState.owner,
      label: lockState.label || this._ownerLabel(lockState.owner),
      phase: "started",
      current: 0,
      total: 0,
    };
    this._startTime = Date.now();
    this._errorCount = 0;
    this._startElapsedTimer();
    this._state = "visible";
    this._el.className = "tobyflow-exec-tracker";
    this._el.removeAttribute("data-state");
    this._render();
  }
  _hide() {
    this._state = "hidden";
    this._el.className = "tobyflow-exec-tracker tobyflow-exec-tracker--hidden";
    this._el.removeAttribute("data-state");
    this._data = null;
    this._pipelineMode = false;
    this._stopElapsedTimer();
    if (this._completionTimer) {
      clearTimeout(this._completionTimer);
      this._completionTimer = null;
    }
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }
    if (this._retryStatusEl) {
      this._retryStatusEl.textContent = "";
      this._retryStatusEl.classList.remove(
        "tobyflow-exec-tracker__retry-status--visible",
      );
    }
  }
  _showRetryStatus(text) {
    if (!this._retryStatusEl || this._state === "hidden") return;
    this._retryStatusEl.textContent = text || "";
    this._retryStatusEl.classList.add(
      "tobyflow-exec-tracker__retry-status--visible",
    );
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
    }
    this._retryTimer = setTimeout(() => {
      this._retryStatusEl.classList.remove(
        "tobyflow-exec-tracker__retry-status--visible",
      );
      this._retryStatusEl.textContent = "";
    }, 3e3);
  }
  _showCompletion() {
    this._stopElapsedTimer();
    this._state = "completing";
    const elapsed = this._formatTime(
      Date.now() - (this._startTime || Date.now()),
    );
    const current = this._data?.current || 0;
    const total = this._data?.total || current;
    const isError = this._data?.phase === "error";
    const isStopped = this._data?.phase === "stopped";
    this._el.className = "tobyflow-exec-tracker";
    this._el.setAttribute("data-state", isError ? "error" : "done");
    this._progressFill.style.width = isStopped
      ? `${total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0}%`
      : "100%";
    this._iconEl.innerHTML = isError
      ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
      : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
    this._labelEl.textContent = isStopped
      ? window.I18n?.t("exec.stopped") || "Stopped"
      : isError
        ? window.I18n?.t("common.error") || "Error"
        : window.I18n?.t("exec.completed") || "Completed";
    this._phaseEl.textContent = "";
    this._counterEl.textContent = `${current}/${total}`;
    this._elapsedEl.textContent = elapsed;
    this._errorBadge.classList.add(
      "tobyflow-exec-tracker__error-badge--hidden",
    );
    this._actionsEl.style.display = "none";
    this._completionTimer = setTimeout(() => this._hide(), 3e3);
  }
  _onUpdate(data) {
    if (!this._data) {
      const lockState = window.ExecutionLock?.getState();
      if (lockState?.locked && this._state === "hidden") {
        this._show(lockState);
      }
      if (!this._data) return;
    }
    if (data.errorCount !== void 0) this._errorCount = data.errorCount;
    if (data.phase === "error") this._errorCount++;
    this._data = { ...this._data, ...data };
    if (
      data.phase === "completed" ||
      data.phase === "error" ||
      data.phase === "stopped"
    ) {
      this._data.genProgress = null;
      this._data.genElapsed = null;
      this._data.genMode = null;
      const lockState = window.ExecutionLock?.getState();
      if (!lockState?.locked) {
        this._showCompletion();
        return;
      }
      this._render();
      return;
    }
    if (this._state === "hidden") {
      const lockState = window.ExecutionLock?.getState();
      if (lockState?.locked) this._show(lockState);
    }
    this._render();
  }
  _render() {
    if (!this._data || this._state !== "visible") return;
    const d = this._data;
    const hasGenProgress =
      typeof d.genProgress === "number" && d.genProgress >= 0;
    const pct = hasGenProgress
      ? Math.min(100, Math.max(0, d.genProgress))
      : d.total > 0
        ? Math.round((d.current / d.total) * 100)
        : 0;
    this._el.setAttribute(
      "data-state",
      d.phase === "paused" ? "paused" : "running",
    );
    this._progressFill.style.width = `${pct}%`;
    this._iconEl.innerHTML =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
    const label = d.taskBatch
      ? `${d.label} \u2014 Task ${d.taskBatch.current}/${d.taskBatch.total}`
      : d.label || this._ownerLabel(d.owner);
    this._labelEl.textContent = label;
    let phaseText;
    if (hasGenProgress) {
      const elapsedTxt =
        typeof d.genElapsed === "number" ? ` (${d.genElapsed}s)` : "";
      const modeText =
        d.genMode === "video"
          ? " Grok Video"
          : d.genMode === "image"
            ? " Grok"
            : "";
      phaseText = `${window.I18n?.t("exec.generating") || "Generating"}${modeText} ${d.genProgress}%${elapsedTxt}`;
    } else {
      phaseText = this._phaseText(d.phase);
    }
    if (d.retryInfo)
      phaseText = `${window.I18n?.t("common.retry") || "Retry"} ${d.retryInfo.attempt}/${d.retryInfo.maxRetries}`;
    if (d.phase === "paused" && this._pauseReason)
      phaseText = this._pauseReason;
    else if (d.phase !== "paused") this._pauseReason = null;
    this._phaseEl.textContent = phaseText;
    this._counterEl.textContent = d.total > 0 ? `${d.current}/${d.total}` : "";
    if (this._errorCount > 0) {
      this._errorBadge.textContent = this._errorCount;
      this._errorBadge.classList.remove(
        "tobyflow-exec-tracker__error-badge--hidden",
      );
    } else {
      this._errorBadge.classList.add(
        "tobyflow-exec-tracker__error-badge--hidden",
      );
    }
    if (d.owner === "prompts") {
      this._pauseBtn.style.display = "";
      const isPaused = d.phase === "paused";
      this._pauseBtn.title = isPaused
        ? window.I18n?.t("common.resume") || "Resume"
        : window.I18n?.t("common.pause") || "Pause";
      this._pauseBtn.innerHTML = isPaused
        ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>'
        : '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="7" y="6" width="3" height="12" rx="1"></rect><rect x="14" y="6" width="3" height="12" rx="1"></rect></svg>';
    } else {
      this._pauseBtn.style.display = "none";
    }
    this._actionsEl.style.display = "";
  }
  _handlePause() {
    if (!this._data || this._data.owner !== "prompts") return;
    if (this._pipelineMode && window.PromptQueue) {
      const queue = window.PromptQueue.getInstance();
      if (queue) {
        const promptsJobs = queue.getJobsByOwner("prompts");
        if (promptsJobs && promptsJobs.length > 0) {
          const job = promptsJobs[0];
          if (job.state === "paused") {
            queue.resumeJob(job.id);
            this._data.phase = "prompt_submitting";
          } else {
            queue.pauseJob(job.id);
            this._data.phase = "paused";
          }
          this._render();
          return;
        }
      }
    }
    const pauseBtn = document.getElementById("pauseBtn");
    if (pauseBtn) {
      pauseBtn.click();
      const isPaused = pauseBtn.dataset.paused === "true";
      this._data.phase = isPaused ? "paused" : "prompt_submitting";
      this._render();
    }
  }
  _handleStop() {
    console.log("[ExecutionTracker] _handleStop called, forcing stop all...");
    const requestedAt = Date.now();
    const providerStop = window.GenTab?.stopProviderGeneration;
    if (providerStop)
      providerStop.call(window.GenTab, { requestedAt }).catch(() => {});
    window._taskShouldStop = true;
    window._taskBatchStopped = true;
    if (
      window.workflowExecutor?.isRunning ||
      window.workflowExecutor?._executionTask
    ) {
      window.workflowExecutor.stop?.(
        true,
        true,
        "SIDEBAR_EXECUTION_TRACKER_STOP",
      );
      window.workflowExecutor.shouldStop = true;
      if (!window.workflowExecutor._executionTask)
        window.workflowExecutor.isRunning = false;
    }
    try {
      const exec = window.workflowExecutor;
      if (!exec?._executionTask)
        window.WorkflowExecutor?.clearCrossContextRunning?.(
          exec?.currentWorkflow?.wf_id,
          exec?._flowRunId,
        );
    } catch (e) {}
    window._currentTaskExecutionToken = null;
    if (window.ExecutionGate?.cancelAll) {
      window.ExecutionGate.cancelAll().catch?.(() => {});
    }
    if (window.MessageBridge) {
      window.MessageBridge.stopExecution().catch(() => {});
    }
    if (!providerStop && window.GrokSession?.getTabInfo) {
      window.GrokSession.getTabInfo()
        .then((grokInfo) => {
          if (grokInfo?.tabId) {
            window.MessageBridge?.grokAbort(grokInfo.tabId, {
              requestedAt,
            }).catch(() => {});
          }
        })
        .catch(() => {});
    }
    if (!providerStop && window.ChatGPTSession?.getTabInfo) {
      window.ChatGPTSession.getTabInfo()
        .then((chatgptInfo) => {
          if (chatgptInfo?.tabId) {
            window.MessageBridge?.chatgptAbort(chatgptInfo.tabId, {
              requestedAt,
            }).catch(() => {});
          }
        })
        .catch(() => {});
    }
    if (!providerStop && window.GeminiSession?.getTabInfo) {
      window.GeminiSession.getTabInfo()
        .then((geminiInfo) => {
          if (geminiInfo?.tabId) {
            window.MessageBridge?.geminiAbort(geminiInfo.tabId, {
              requestedAt,
            }).catch(() => {});
          }
        })
        .catch(() => {});
    }
    if (!providerStop)
      window.MuseSession?.abort?.({ requestedAt }).catch(() => {});
    if (window.PromptQueue) {
      const queue = window.PromptQueue.getInstance();
      if (queue) {
        queue.stopAll({
          stopOrigin: "user",
          stopReason: "USER_CANCELLED",
          requestedAt,
          stopSource: "SIDEBAR_EXECUTION_TRACKER_STOP",
        });
      }
    }
    try {
      chrome.runtime
        .sendMessage({
          action: "pq:stopAll",
          requestedAt,
          stopSource: "SIDEBAR_EXECUTION_TRACKER_STOP",
        })
        .catch(() => {});
    } catch (_) {}
    if (window.ExecutionLock) {
      ExecutionLock.stopCurrent();
    }
    window.eventBus?.emit("execution:force_stopped");
    window.showNotification?.(
      window.I18n?.t("exec.forceStopped") || "All tasks stopped",
      "warning",
      2e3,
    );
    this._hide();
    console.log("[ExecutionTracker] Force stop completed");
  }
  _startElapsedTimer() {
    this._stopElapsedTimer();
    this._elapsedTimer = setInterval(() => {
      if (this._startTime && this._elapsedEl) {
        this._elapsedEl.textContent = this._formatTime(
          Date.now() - this._startTime,
        );
      }
    }, 1e3);
  }
  _stopElapsedTimer() {
    if (this._elapsedTimer) {
      clearInterval(this._elapsedTimer);
      this._elapsedTimer = null;
    }
  }
  _ownerLabel(owner) {
    const map = {
      prompts: "Auto Gen",
      task: "Task",
      workflow: "Workflow",
      angles: "Angles",
      telegram: "Telegram",
    };
    return map[owner] || owner || "";
  }
  _phaseText(phase) {
    const map = {
      started: window.I18n?.t("exec.starting") || "Starting...",
      prompt_submitting: window.I18n?.t("exec.submitting") || "Submitting...",
      prompt_enhancing:
        window.I18n?.t("exec.enhancingPrompt") || "Enhancing prompt...",
      chatgpt_generating:
        window.I18n?.t("exec.chatgptGenerating") || "ChatGPT generating...",
      grok_generating:
        window.I18n?.t("exec.grokGenerating") || "Grok generating...",
      waiting_tiles:
        window.I18n?.t("exec.waitingResults") || "Waiting for results...",
      retry: window.I18n?.t("exec.retrying") || "Retrying...",
      download: window.I18n?.t("common.download") || "Download",
      paused: window.I18n?.t("common.pause") || "Pause",
      completed: window.I18n?.t("exec.completed") || "Completed",
      error: window.I18n?.t("common.error") || "Error",
    };
    return map[phase] || phase || "";
  }
  _formatTime(ms) {
    const totalSec = Math.floor(ms / 1e3);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${String(sec).padStart(2, "0")}`;
  }
};
__publicField(_ExecutionTracker, "_instance", null);
let ExecutionTracker = _ExecutionTracker;
window.ExecutionTracker = ExecutionTracker;
