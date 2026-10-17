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
const _PipelineFooter = class _PipelineFooter {
  static init() {
    if (!this._instance) {
      this._instance = new _PipelineFooter();
    }
    return this._instance;
  }
  static getInstance() {
    return this._instance;
  }
  constructor() {
    this._state = "hidden";
    this._snapshot = null;
    this._externalSnapshot = null;
    this._completionTimer = null;
    this._elapsedTimer = null;
    this._createDOM();
    this._bindEvents();
  }
  _createDOM() {
    this._el = document.createElement("div");
    this._el.className =
      "tobyflow-pipeline-footer tobyflow-pipeline-footer--hidden";
    this._el.innerHTML = `
      <div class="tobyflow-pipeline-footer__bar">
        <div class="tobyflow-pipeline-footer__progress-fill"></div>
        <div class="tobyflow-pipeline-footer__content">
          <span class="tobyflow-pipeline-footer__icon">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </span>
          <span class="tobyflow-pipeline-footer__label">Pipeline</span>
          <span class="tobyflow-pipeline-footer__counter"></span>
          <span class="tobyflow-pipeline-footer__elapsed"></span>
          <span class="tobyflow-pipeline-footer__retry-status"></span>
          <div class="tobyflow-pipeline-footer__actions">
            <button class="tobyflow-pipeline-footer__btn tobyflow-pipeline-footer__btn--pause-resume" style="display:none;" title="${window.I18n?.t("pipeline.pause") || "Pause"}">
              <svg class="pf-pr-pause" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="6" width="3" height="12" rx="1"></rect><rect x="14" y="6" width="3" height="12" rx="1"></rect></svg>
              <svg class="pf-pr-resume" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="display:none;"><polygon points="8,6 18,12 8,18"></polygon></svg>
            </button>
            <button class="tobyflow-pipeline-footer__btn tobyflow-pipeline-footer__btn--stop-all" title="${window.I18n?.t("pipeline.stopAll") || "Stop all"}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <rect x="5" y="5" width="14" height="14" rx="2"></rect>
              </svg>
            </button>
          </div>
        </div>
      </div>
      <div class="tobyflow-pipeline-footer__jobs"></div>
    `;
    const footer = document.getElementById("appFooter");
    if (footer && footer.parentNode) {
      footer.parentNode.insertBefore(this._el, footer);
    } else {
      document.body.appendChild(this._el);
    }
    this._progressFill = this._el.querySelector(
      ".tobyflow-pipeline-footer__progress-fill",
    );
    this._labelEl = this._el.querySelector(".tobyflow-pipeline-footer__label");
    this._counterEl = this._el.querySelector(
      ".tobyflow-pipeline-footer__counter",
    );
    this._elapsedEl = this._el.querySelector(
      ".tobyflow-pipeline-footer__elapsed",
    );
    this._retryStatusEl = this._el.querySelector(
      ".tobyflow-pipeline-footer__retry-status",
    );
    this._jobsEl = this._el.querySelector(".tobyflow-pipeline-footer__jobs");
    this._stopAllBtn = this._el.querySelector(
      ".tobyflow-pipeline-footer__btn--stop-all",
    );
    this._pauseResumeBtn = this._el.querySelector(
      ".tobyflow-pipeline-footer__btn--pause-resume",
    );
    this._pausableJobId = null;
    this._pauseResumePaused = false;
    this._retryTimer = null;
    this._stopAllBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._sendAction("pq:stopAll");
    });
    this._pauseResumeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!this._pausableJobId) return;
      this._sendAction(
        this._pauseResumePaused ? "pq:resumeJob" : "pq:pauseJob",
        { jobId: this._pausableJobId },
      );
    });
    this._el
      .querySelector(".tobyflow-pipeline-footer__bar")
      .addEventListener("click", (e) => {
        if (e.target.closest(".tobyflow-pipeline-footer__btn")) return;
        if (this._state === "completing") {
          this._hide();
          return;
        }
        this._jobsEl.classList.toggle(
          "tobyflow-pipeline-footer__jobs--expanded",
        );
      });
  }
  _bindEvents() {
    if (!window.eventBus) return;
    window.eventBus.on("queue:state_changed", (snapshot) => {
      this._snapshot = snapshot;
      this._onStateChanged();
    });
    window.eventBus.on("execution:captcha_detected", () => {
      this._pauseReason = window.I18n?.t("pipeline.pausedCaptcha") || null;
    });
    window.eventBus.on("execution:manual_pause", () => {
      this._pauseReason = window.I18n?.t("pipeline.pausedManual") || null;
    });
    window.eventBus.on("queue:external_state", (snapshot) => {
      this._externalSnapshot = snapshot;
      this._externalTimestamp = Date.now();
      this._onStateChanged();
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
  _showRetryStatus(text) {
    if (!this._retryStatusEl || this._state === "hidden") return;
    this._retryStatusEl.textContent = text || "";
    this._retryStatusEl.classList.add(
      "tobyflow-pipeline-footer__retry-status--visible",
    );
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
    }
    this._retryTimer = setTimeout(() => {
      this._retryStatusEl.classList.remove(
        "tobyflow-pipeline-footer__retry-status--visible",
      );
      this._retryStatusEl.textContent = "";
    }, 3e3);
  }
  _onStateChanged() {
    const snap = this._getActiveSnapshot();
    if (!snap) {
      if (this._state === "visible") {
        this._showCompletion();
      }
      return;
    }
    const jobs =
      window.TrackerRegenProjection?.batchJobs(snap.jobs || []) ||
      snap.jobs ||
      [];
    const hasActive = jobs.some(
      (j) => j.status === "running" || j.status === "paused",
    );
    if (hasActive) {
      if (this._state === "hidden") {
        this._show();
      }
      this._render(snap);
    } else if (jobs.length > 0 && this._state === "visible") {
      this._render(snap);
      this._showCompletion();
    } else if (this._state !== "hidden") {
      this._hide();
    }
  }
  _getActiveSnapshot() {
    if (
      this._snapshot &&
      this._snapshot.jobs &&
      this._snapshot.jobs.length > 0
    ) {
      return this._snapshot;
    }
    if (
      this._externalSnapshot &&
      this._externalTimestamp > Date.now() - 3e4 &&
      this._externalSnapshot.jobs &&
      this._externalSnapshot.jobs.length > 0
    ) {
      return this._externalSnapshot;
    }
    return null;
  }
  _show() {
    this._state = "visible";
    this._el.className = "tobyflow-pipeline-footer";
    this._el.removeAttribute("data-state");
    this._startElapsedTimer();
    if (this._completionTimer) {
      clearTimeout(this._completionTimer);
      this._completionTimer = null;
    }
  }
  _hide() {
    this._state = "hidden";
    this._el.className =
      "tobyflow-pipeline-footer tobyflow-pipeline-footer--hidden";
    this._el.removeAttribute("data-state");
    this._jobsEl.classList.remove("tobyflow-pipeline-footer__jobs--expanded");
    this._jobsEl.innerHTML = "";
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
        "tobyflow-pipeline-footer__retry-status--visible",
      );
    }
  }
  _showCompletion() {
    this._state = "completing";
    this._stopElapsedTimer();
    this._el.setAttribute("data-state", "done");
    this._progressFill.style.width = "100%";
    this._labelEl.textContent =
      window.I18n?.t("pipeline.complete") || "Complete";
    this._stopAllBtn.style.display = "none";
    this._pauseResumeBtn.style.display = "none";
    this._pausableJobId = null;
    this._jobsEl.classList.remove("tobyflow-pipeline-footer__jobs--expanded");
    this._jobsEl.innerHTML = "";
    this._completionTimer = setTimeout(() => this._hide(), 3e3);
  }
  _render(snap) {
    if (!snap || this._state !== "visible") return;
    const jobs =
      window.TrackerRegenProjection?.batchJobs(snap.jobs || []) ||
      snap.jobs ||
      [];
    let completed = 0,
      total = 0,
      failed = 0;
    const activeJobs = [];
    for (const j of jobs) {
      completed += j.completedCount ?? j.completed ?? 0;
      total += j.totalExpected ?? j.total ?? 0;
      failed += j.failedCount ?? j.failed ?? 0;
      if (j.status === "running" || j.status === "paused") {
        activeJobs.push(j);
      }
    }
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const hasPaused = activeJobs.some((j) => j.status === "paused");
    this._el.setAttribute("data-state", hasPaused ? "paused" : "running");
    this._progressFill.style.width = `${pct}%`;
    const recoveryJob = activeJobs.find((j) => j.recoveryRequired);
    this._labelEl.title = recoveryJob?.recoveryHint || "";
    if (recoveryJob) {
      this._labelEl.textContent =
        recoveryJob.recoveryLabel ||
        window.I18n?.t("flowRecovery.required") ||
        "";
    } else if (hasPaused && this._pauseReason) {
      this._labelEl.textContent = this._pauseReason;
    } else if (activeJobs.length === 1) {
      this._labelEl.textContent =
        activeJobs[0].label || activeJobs[0].owner || "Pipeline";
    } else {
      this._labelEl.textContent = `Pipeline (${activeJobs.length} ${window.I18n?.t("pipeline.tasks") || "tasks"})`;
    }
    if (!hasPaused) this._pauseReason = null;
    let counterText = `${completed}/${total}`;
    if (failed > 0)
      counterText += ` \u2022 ${failed} ${window.I18n?.t("pipeline.errors") || "errors"}`;
    this._counterEl.textContent = counterText;
    const elapsed =
      snap.elapsed ||
      (snap.pipeline?.startedAt ? Date.now() - snap.pipeline.startedAt : 0);
    this._elapsedEl.textContent = this._formatTime(elapsed);
    this._stopAllBtn.style.display = "";
    const pausable = activeJobs.find(
      (j) =>
        j.owner === "prompts" &&
        (j.status === "paused" || j.status === "running"),
    );
    if (pausable && !recoveryJob) {
      this._pausableJobId = pausable.manualRegenActive
        ? pausable.manualRegenJobId
        : pausable.id;
      this._pauseResumePaused = pausable.manualRegenActive
        ? pausable.manualRegenStatus === "paused"
        : pausable.status === "paused";
      this._pauseResumeBtn.style.display = "";
      this._pauseResumeBtn.title = this._pauseResumePaused
        ? window.I18n?.t("pipeline.resume") || "Resume"
        : window.I18n?.t("pipeline.pause") || "Pause";
      this._pauseResumeBtn.querySelector(".pf-pr-pause").style.display = this
        ._pauseResumePaused
        ? "none"
        : "";
      this._pauseResumeBtn.querySelector(".pf-pr-resume").style.display = this
        ._pauseResumePaused
        ? ""
        : "none";
    } else {
      this._pausableJobId = null;
      this._pauseResumeBtn.style.display = "none";
    }
    this._renderJobs(activeJobs);
  }
  _renderJobs(jobs) {
    if (
      !this._jobsEl.classList.contains(
        "tobyflow-pipeline-footer__jobs--expanded",
      )
    )
      return;
    const ownerColors = {
      prompts: "#3b82f6",
      task: "#f97316",
      workflow: "#a855f7",
      angles: "#ec4899",
      telegram: "#06b6d4",
      effects: "#22d3ee",
    };
    let html = "";
    for (const j of jobs) {
      const color = ownerColors[j.owner] || "#6b7280";
      const _jc = j.completedCount ?? j.completed ?? 0;
      const _jt = j.totalExpected ?? j.total ?? 0;
      const jPct = _jt > 0 ? Math.round((_jc / _jt) * 100) : 0;
      const isPaused = j.status === "paused";
      const controlPaused = j.manualRegenActive
        ? j.manualRegenStatus === "paused"
        : isPaused;
      html += `<div class="tobyflow-pipeline-footer__job">`;
      html += `<span class="tobyflow-pipeline-footer__job-dot" style="background:${color};${!isPaused ? "box-shadow:0 0 4px " + color + ";" : ""}"></span>`;
      html += `<span class="tobyflow-pipeline-footer__job-label">${this._escHtml(j.recoveryLabel || j.label || j.owner)}</span>`;
      html += `<span class="tobyflow-pipeline-footer__job-pct">${jPct}%</span>`;
      if (j.owner === "prompts" && controlPaused && !j.recoveryRequired) {
        html += `<button class="tobyflow-pipeline-footer__job-btn tobyflow-pipeline-footer__job-btn--resume" data-action="resume" data-job-id="${j.manualRegenActive ? j.manualRegenJobId : j.id}" title="${window.I18n?.t("pipeline.resume") || "Resume"}">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="8,6 18,12 8,18"/></svg>
        </button>`;
      } else if (
        j.owner === "prompts" &&
        (j.status === "running" ||
          (j.manualRegenActive && j.manualRegenStatus === "running"))
      ) {
        html += `<button class="tobyflow-pipeline-footer__job-btn tobyflow-pipeline-footer__job-btn--pause" data-action="pause" data-job-id="${j.manualRegenActive ? j.manualRegenJobId : j.id}" title="${window.I18n?.t("pipeline.pause") || "Pause"}">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="6" width="3" height="12" rx="1"/><rect x="14" y="6" width="3" height="12" rx="1"/></svg>
        </button>`;
      }
      html += `<button class="tobyflow-pipeline-footer__job-btn tobyflow-pipeline-footer__job-btn--stop" data-action="stop" data-job-id="${j.id}" title="${window.I18n?.t("pipeline.stop") || "Stop"}">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="1"/></svg>
      </button>`;
      html += `</div>`;
    }
    this._jobsEl.innerHTML = html;
    this._jobsEl.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = btn.getAttribute("data-action");
        const jobId = btn.getAttribute("data-job-id");
        if (action === "stop") this._sendAction("pq:stopJob", { jobId });
        else if (action === "pause") this._sendAction("pq:pauseJob", { jobId });
        else if (action === "resume")
          this._sendAction("pq:resumeJob", { jobId });
      });
    });
  }
  _sendAction(action, data) {
    const pq = window.PromptQueue?.getInstance();
    if (action === "pq:stopAll") {
      if (pq)
        pq.stopAll({
          stopOrigin: "user",
          stopReason: "USER_CANCELLED",
          stopSource: "FLOW_PIPELINE_FOOTER_STOP",
        });
      chrome.runtime
        .sendMessage({
          action: "pq:stopAll",
          stopSource: "FLOW_PIPELINE_FOOTER_STOP",
        })
        .catch(() => {});
      return;
    }
    if (data?.jobId) {
      if (pq) {
        if (action === "pq:stopJob")
          pq.stopJob(data.jobId, {
            stopOrigin: "user",
            stopReason: "USER_CANCELLED",
            stopSource: "FLOW_PIPELINE_JOB_STOP",
          });
        else if (action === "pq:pauseJob") pq.pauseJob(data.jobId);
        else if (action === "pq:resumeJob") pq.resumeJob(data.jobId);
      }
      chrome.runtime
        .sendMessage(
          Object.assign(
            {
              action,
              stopSource:
                action === "pq:stopJob" ? "FLOW_PIPELINE_JOB_STOP" : null,
            },
            data,
          ),
        )
        .catch(() => {});
    }
  }
  _formatTime(ms) {
    if (!ms || ms < 0) return "";
    const s = Math.floor(ms / 1e3);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m < 10 ? "0" : ""}${m}:${sec < 10 ? "0" : ""}${sec}`;
  }
  _escHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  _startElapsedTimer() {
    this._stopElapsedTimer();
    this._elapsedTimer = setInterval(() => {
      if (this._state === "visible") {
        const snap = this._getActiveSnapshot();
        if (snap) {
          const elapsed = snap.elapsed || 0;
          this._elapsedEl.textContent = this._formatTime(elapsed);
        }
      }
    }, 1e3);
  }
  _stopElapsedTimer() {
    if (this._elapsedTimer) {
      clearInterval(this._elapsedTimer);
      this._elapsedTimer = null;
    }
  }
};
__publicField(_PipelineFooter, "_instance", null);
let PipelineFooter = _PipelineFooter;
window.PipelineFooter = PipelineFooter;
