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
const _QueueMonitor = class _QueueMonitor {
  static init() {
    if (!this._instance) {
      this._instance = new _QueueMonitor();
    }
    return this._instance;
  }
  static getInstance() {
    return this._instance;
  }
  constructor() {
    this._container = document.getElementById("queueMonitorContent");
    this._isVisible = false;
    this._snapshot = null;
    this._rafId = null;
    this._dirty = false;
    this._jobElements = new Map();
    this._statusCardsEl = null;
    this._emptyStateEl = null;
    this._jobsContainerEl = null;
    this._downloadSectionEl = null;
    this._downloadItemEls = new Map();
    this._completedJobsCache = new Map();
    this._cachedDownloadHistory = [];
    this._externalSnapshot = null;
    this._externalTimestamp = 0;
    this._itemStatus = new Map();
    this._createDOM();
    this._bindEvents();
  }
  _createDOM() {
    if (!this._container) return;
    this._container.innerHTML = "";
    this._statusCardsEl = document.createElement("div");
    this._statusCardsEl.className = "tobyflow-queue-status-cards";
    this._statusCardsEl.innerHTML = `
      <div class="tobyflow-queue-status-card" data-executor="editor">
        <div class="tobyflow-queue-status-card__icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a3 3 0 0 0 -3 3v12a3 3 0 0 0 3 3"></path><path d="M6 3a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3"></path><path d="M13 7h7a1 1 0 0 1 1 1v8a1 1 0 0 1 -1 1h-7"></path><path d="M5 7h-1a1 1 0 0 0 -1 1v8a1 1 0 0 0 1 1h1"></path><path d="M17 12h.01"></path><path d="M13 12h.01"></path></svg>
        </div>
        <div class="tobyflow-queue-status-card__info">
          <span class="tobyflow-queue-status-card__label">Editor</span>
          <span class="tobyflow-queue-status-card__value" data-field="editor-state">-</span>
        </div>
      </div>
      <div class="tobyflow-queue-status-card" data-executor="tiles">
        <div class="tobyflow-queue-status-card__icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect></svg>
        </div>
        <div class="tobyflow-queue-status-card__info">
          <span class="tobyflow-queue-status-card__label">Tiles</span>
          <span class="tobyflow-queue-status-card__value" data-field="tiles-state">-</span>
        </div>
      </div>
      <div class="tobyflow-queue-status-card" data-executor="download">
        <div class="tobyflow-queue-status-card__icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        </div>
        <div class="tobyflow-queue-status-card__info">
          <span class="tobyflow-queue-status-card__label">Download</span>
          <span class="tobyflow-queue-status-card__value" data-field="download-state">-</span>
        </div>
      </div>
    `;
    this._container.appendChild(this._statusCardsEl);
    this._editorStateEl = this._statusCardsEl.querySelector(
      '[data-field="editor-state"]',
    );
    this._tilesStateEl = this._statusCardsEl.querySelector(
      '[data-field="tiles-state"]',
    );
    this._downloadStateEl = this._statusCardsEl.querySelector(
      '[data-field="download-state"]',
    );
    this._jobsContainerEl = document.createElement("div");
    this._jobsContainerEl.className = "tobyflow-queue-jobs";
    this._container.appendChild(this._jobsContainerEl);
    this._downloadSectionEl = document.createElement("div");
    this._downloadSectionEl.className =
      "tobyflow-queue-job tobyflow-queue-download-section";
    this._downloadSectionEl.style.display = "none";
    this._downloadSectionEl.innerHTML = `
      <div class="tobyflow-queue-job__header">
        <span class="tobyflow-queue-job__owner-dot" style="background:#06b6d4"></span>
        <span class="tobyflow-queue-job__label">Auto Download</span>
        <span class="tobyflow-queue-job__badge tobyflow-queue-job__badge--running"></span>
        <span class="tobyflow-queue-job__counter"></span>
        <span class="tobyflow-queue-job__elapsed"></span>
        <button class="tobyflow-queue-job__toggle" title="${window.I18n?.t("queue.expand") || "Expand"} / ${window.I18n?.t("queue.collapse") || "Collapse"}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      </div>
      <div class="tobyflow-queue-job__progress">
        <div class="tobyflow-queue-job__progress-fill" style="background:#06b6d4"></div>
      </div>
      <div class="tobyflow-queue-job__body">
        <div class="tobyflow-queue-items tobyflow-queue-download-items"></div>
      </div>
    `;
    const dlHeader = this._downloadSectionEl.querySelector(
      ".tobyflow-queue-job__header",
    );
    dlHeader.addEventListener("click", () => {
      this._downloadSectionEl.classList.toggle("tobyflow-queue-job--expanded");
    });
    this._container.appendChild(this._downloadSectionEl);
    this._dlBadgeEl = this._downloadSectionEl.querySelector(
      ".tobyflow-queue-job__badge",
    );
    this._dlCounterEl = this._downloadSectionEl.querySelector(
      ".tobyflow-queue-job__counter",
    );
    this._dlProgressFill = this._downloadSectionEl.querySelector(
      ".tobyflow-queue-job__progress-fill",
    );
    this._dlItemsEl = this._downloadSectionEl.querySelector(
      ".tobyflow-queue-download-items",
    );
    this._emptyStateEl = document.createElement("div");
    this._emptyStateEl.className = "tobyflow-queue-empty";
    this._emptyStateEl.innerHTML = `
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="3" y1="9" x2="21" y2="9"></line>
        <line x1="9" y1="21" x2="9" y2="9"></line>
      </svg>
      <span>${window.I18n?.t("queue.empty") || "No tasks in queue"}</span>
    `;
    this._container.appendChild(this._emptyStateEl);
  }
  _bindEvents() {
    if (!window.eventBus) return;
    window.eventBus.on("queue:state_changed", (snapshot) => {
      this._snapshot = snapshot;
      this._dirty = true;
      this._scheduleRender();
    });
    window.eventBus.on("queue:external_state", (snapshot) => {
      this._externalSnapshot = snapshot;
      this._externalTimestamp = Date.now();
      this._dirty = true;
      this._scheduleRender();
    });
    window.eventBus.on("item:status", (data) => {
      if (!data?.itemId) return;
      this._itemStatus.set(data.itemId, data);
      this._dirty = true;
      this._scheduleRender();
      if (["completed", "failed", "partial_fail"].includes(data.phase)) {
        setTimeout(() => {
          const cur = this._itemStatus.get(data.itemId);
          if (cur && cur.timestamp === data.timestamp) {
            this._itemStatus.delete(data.itemId);
          }
        }, 6e4);
      }
    });
  }
  setVisible(visible) {
    this._isVisible = visible;
    if (visible && this._dirty) {
      this._scheduleRender();
    }
    if (visible) {
      this._startElapsedTimer();
    } else {
      this._stopElapsedTimer();
    }
  }
  _startElapsedTimer() {
    if (this._elapsedInterval) return;
    this._elapsedInterval = setInterval(() => {
      const localJobs = this._snapshot?.jobs || [];
      const externalJobs =
        this._externalSnapshot && this._externalTimestamp > Date.now() - 3e4
          ? this._externalSnapshot.jobs || []
          : [];
      const jobs = localJobs.length > 0 ? localJobs : externalJobs;
      if (jobs.length === 0) return;
      for (const job of jobs) {
        const isActive = job.status === "running" || job.status === "paused";
        if (!isActive || !job.startedAt) continue;
        const refs = this._jobElements.get(job.id);
        if (refs && refs.elapsedEl) {
          refs.elapsedEl.textContent = this._formatTime(
            Date.now() - job.startedAt,
          );
        }
      }
    }, 1e3);
  }
  _stopElapsedTimer() {
    if (this._elapsedInterval) {
      clearInterval(this._elapsedInterval);
      this._elapsedInterval = null;
    }
  }
  _scheduleRender() {
    if (!this._isVisible || this._rafId) return;
    this._rafId = requestAnimationFrame(() => {
      this._rafId = null;
      this._render();
    });
  }
  _render() {
    const hasExternalJobs =
      this._externalSnapshot &&
      this._externalTimestamp > Date.now() - 3e4 &&
      this._externalSnapshot.jobs?.length > 0;
    if (!this._container || (!this._snapshot && !hasExternalJobs)) {
      this._showEmpty(true);
      return;
    }
    this._dirty = false;
    const localSnap = this._snapshot;
    const extSnap = hasExternalJobs ? this._externalSnapshot : null;
    const snap = localSnap || {
      jobs: [],
      pipeline: extSnap?.pipeline || {
        editor: {},
        tileMonitor: {},
        download: {},
      },
    };
    const pipelineInfo = localSnap?.pipeline?.editor?.state
      ? localSnap.pipeline
      : extSnap?.pipeline || {};
    this._updateStatusCards(pipelineInfo);
    let externalJobs = [];
    if (this._externalSnapshot && this._externalTimestamp > Date.now() - 3e4) {
      externalJobs = this._externalSnapshot.jobs || [];
    } else {
      this._externalSnapshot = null;
    }
    const localJobs = snap.jobs || [];
    const localJobIds = new Set(localJobs.map((j) => j.id));
    const mergedSnapshotJobs = [
      ...localJobs,
      ...externalJobs.filter((j) => !localJobIds.has(j.id)),
    ];
    const snapshotJobs =
      window.TrackerRegenProjection?.batchJobs(mergedSnapshotJobs) ||
      mergedSnapshotJobs;
    const snapshotJobIds = new Set(snapshotJobs.map((j) => j.id));
    if (snapshotJobs.length === 0 && this._completedJobsCache.size > 0) {
      this._completedJobsCache.clear();
      this._cachedDownloadHistory = [];
      this._itemStatus.clear();
    }
    for (const job of snapshotJobs) {
      if (job.status === "completed" || job.status === "stopped") {
        this._completedJobsCache.set(job.id, job);
      }
    }
    if (this._completedJobsCache.size > 20) {
      const entries = Array.from(this._completedJobsCache.entries());
      const toRemove = entries.slice(0, entries.length - 20);
      for (const [id] of toRemove) this._completedJobsCache.delete(id);
    }
    const jobs = [...snapshotJobs];
    for (const [cachedId, cachedJob] of this._completedJobsCache) {
      if (!snapshotJobIds.has(cachedId)) {
        jobs.push(cachedJob);
      }
    }
    if (jobs.length === 0) {
      this._showEmpty(true);
      this._jobsContainerEl.innerHTML = "";
      this._jobElements.clear();
      return;
    }
    this._showEmpty(false);
    const currentJobIds = new Set(jobs.map((j) => j.id));
    for (const [jobId, refs] of this._jobElements) {
      if (!currentJobIds.has(jobId)) {
        refs.el.remove();
        this._jobElements.delete(jobId);
      }
    }
    jobs.forEach((job, idx) => {
      let refs = this._jobElements.get(job.id);
      if (!refs) {
        refs = this._createJobElement(job);
        this._jobElements.set(job.id, refs);
        this._jobsContainerEl.appendChild(refs.el);
      }
      this._updateJobElement(refs, job);
    });
    const downloadData = this._buildMergedDownloadData(
      snap.pipeline?.download,
      extSnap?.pipeline?.download,
    );
    this._renderDownloadSection(downloadData);
  }
  _buildMergedDownloadData(localDl, extDl) {
    const primary =
      localDl?.queueLength > 0 || localDl?.completedCount > 0 ? localDl : extDl;
    if (!primary && this._cachedDownloadHistory.length === 0) return null;
    const allItems = [...(localDl?.items || []), ...(extDl?.items || [])];
    for (const item of allItems) {
      if (item.state === "COMPLETED" || item.state === "FAILED") {
        if (
          !this._cachedDownloadHistory.some((h) => h.tileId === item.tileId)
        ) {
          this._cachedDownloadHistory.push(item);
        }
      }
    }
    if (this._cachedDownloadHistory.length > 20) {
      this._cachedDownloadHistory = this._cachedDownloadHistory.slice(-20);
    }
    const pendingItems = allItems.filter(
      (i) => i.state === "PENDING" || !i.state,
    );
    const currentItem = allItems.find((i) => i.state === "DOWNLOADING");
    const mergedItems = [
      ...pendingItems.slice(0, 10),
      ...(currentItem ? [currentItem] : []),
      ...this._cachedDownloadHistory.slice(-10),
    ];
    return {
      state:
        primary?.state ||
        (this._cachedDownloadHistory.length > 0 ? "idle" : "idle"),
      queueLength: (localDl?.queueLength || 0) + (extDl?.queueLength || 0),
      completedCount: Math.max(
        localDl?.completedCount || 0,
        extDl?.completedCount || 0,
        this._cachedDownloadHistory.length,
      ),
      items: mergedItems,
    };
  }
  _updateStatusCards(pipeline) {
    if (!pipeline) return;
    const editorText = this._executorStateText(pipeline.editor.state);
    const editorExtra =
      pipeline.editor.processedCount > 0
        ? ` (${pipeline.editor.processedCount})`
        : "";
    this._editorStateEl.textContent = editorText + editorExtra;
    const active = pipeline.tileMonitor.activeCount || 0;
    const completed = pipeline.tileMonitor.completedCount || 0;
    const failed = pipeline.tileMonitor.failedCount || 0;
    this._tilesStateEl.textContent =
      window.I18n?.t("queue.activeCount", { active, completed, failed }) ||
      `${active} running / ${completed} done / ${failed} failed`;
    const dlText = this._executorStateText(pipeline.download.state);
    const dlExtra =
      pipeline.download.completedCount > 0
        ? ` (${pipeline.download.completedCount})`
        : "";
    this._downloadStateEl.textContent = dlText + dlExtra;
  }
  _executorStateText(state) {
    const map = {
      idle: window.I18n?.t("queue.executorIdle") || "Ready",
      running: window.I18n?.t("exec.running") || "Running",
      paused: window.I18n?.t("common.pause") || "Paused",
      stopped: window.I18n?.t("common.stop") || "Stopped",
      queued: window.I18n?.t("queue.downloadPending") || "Queued",
      downloading:
        window.I18n?.t("queue.executorDownloading") || "Downloading...",
    };
    return map[state] || state || "-";
  }
  _renderDownloadSection(downloadData) {
    if (!this._downloadSectionEl) return;
    const items = downloadData?.items || [];
    const queueLen = downloadData?.queueLength || 0;
    const completedCount = downloadData?.completedCount || 0;
    const hasContent = items.length > 0 || completedCount > 0;
    this._downloadSectionEl.style.display = hasContent ? "" : "none";
    if (!hasContent) return;
    const stateText = this._executorStateText(downloadData.state);
    if (this._dlBadgeEl.textContent !== stateText) {
      this._dlBadgeEl.textContent = stateText;
      this._dlBadgeEl.className =
        "tobyflow-queue-job__badge tobyflow-queue-job__badge--" +
        (downloadData.state === "downloading"
          ? "running"
          : downloadData.state === "idle"
            ? "completed"
            : "running");
    }
    const total = completedCount + queueLen;
    const counterText = total > 0 ? `${completedCount}/${total}` : "";
    if (this._dlCounterEl.textContent !== counterText) {
      this._dlCounterEl.textContent = counterText;
    }
    const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;
    this._dlProgressFill.style.width = `${pct}%`;
    if (
      !this._downloadSectionEl.classList.contains(
        "tobyflow-queue-job--expanded",
      )
    )
      return;
    const currentKeys = new Set(items.map((d) => d.tileId));
    for (const [tid, ref] of this._downloadItemEls) {
      if (!currentKeys.has(tid)) {
        ref.el.remove();
        this._downloadItemEls.delete(tid);
      }
    }
    for (const dlItem of items) {
      let ref = this._downloadItemEls.get(dlItem.tileId);
      if (!ref) {
        ref = this._createDownloadItemRow(dlItem);
        this._downloadItemEls.set(dlItem.tileId, ref);
        this._dlItemsEl.appendChild(ref.el);
      }
      this._updateDownloadItemRow(ref, dlItem);
    }
  }
  _createDownloadItemRow(dlItem) {
    const el = document.createElement("div");
    el.className = "tobyflow-queue-item";
    el.innerHTML = `
      <span class="tobyflow-queue-item__icon"></span>
      <span class="tobyflow-queue-item__prompt"></span>
      <span class="tobyflow-queue-item__state"></span>
    `;
    return {
      el,
      iconEl: el.querySelector(".tobyflow-queue-item__icon"),
      promptEl: el.querySelector(".tobyflow-queue-item__prompt"),
      stateEl: el.querySelector(".tobyflow-queue-item__state"),
      _lastState: null,
    };
  }
  _updateDownloadItemRow(ref, dlItem) {
    if (ref._lastState === dlItem.state) return;
    ref._lastState = dlItem.state;
    const stateInfo =
      _QueueMonitor.DOWNLOAD_STATES[dlItem.state] ||
      _QueueMonitor.DOWNLOAD_STATES.PENDING;
    ref.iconEl.textContent = stateInfo.icon;
    ref.iconEl.className = `tobyflow-queue-item__icon ${stateInfo.colorClass}`;
    const promptText = dlItem.promptText || dlItem.tileId || "";
    const truncated =
      promptText.length > 50 ? promptText.substring(0, 50) + "..." : promptText;
    ref.promptEl.textContent = truncated;
    ref.promptEl.title = promptText;
    ref.stateEl.textContent = stateInfo.label;
    ref.stateEl.className = `tobyflow-queue-item__state ${stateInfo.colorClass}`;
    const isActive = dlItem.state === "DOWNLOADING";
    ref.el.classList.toggle("tobyflow-queue-item--active", isActive);
  }
  _createJobElement(job) {
    const el = document.createElement("div");
    el.className = "tobyflow-queue-job";
    const ownerInfo = _QueueMonitor.OWNER_COLORS[job.owner] || {
      bg: "#6b7280",
      label: job.owner,
    };
    const headerEl = document.createElement("div");
    headerEl.className = "tobyflow-queue-job__header";
    headerEl.innerHTML = `
      <span class="tobyflow-queue-job__owner-dot" style="background:${ownerInfo.bg}"></span>
      <span class="tobyflow-queue-job__label"></span>
      <span class="tobyflow-queue-job__badge"></span>
      <span class="tobyflow-queue-job__counter"></span>
      <span class="tobyflow-queue-job__elapsed"></span>
      <button class="tobyflow-queue-job__pause" title="${window.I18n?.t("common.pause") || "Pause"}" style="display:none;">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="6" width="3" height="12" rx="1"/><rect x="14" y="6" width="3" height="12" rx="1"/></svg>
      </button>
      <button class="tobyflow-queue-job__stop" title="${window.I18n?.t("common.stop") || "Stop"}">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="1"/></svg>
      </button>
      <button class="tobyflow-queue-job__toggle" title="${window.I18n?.t("queue.expand") || "Expand"} / ${window.I18n?.t("queue.collapse") || "Collapse"}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
    `;
    el.appendChild(headerEl);
    const pauseBtn = headerEl.querySelector(".tobyflow-queue-job__pause");
    const stopBtn = headerEl.querySelector(".tobyflow-queue-job__stop");
    pauseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const queue = window.PromptQueue?.getInstance?.();
      if (!queue) return;
      if (refs._controlPaused) {
        queue.resumeJob(refs._manualRegenJobId || job.id);
      } else {
        queue.pauseJob(refs._manualRegenJobId || job.id);
      }
    });
    stopBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const queue = window.PromptQueue?.getInstance?.();
      if (queue)
        queue.stopJob(job.id, {
          stopOrigin: "user",
          stopReason: "USER_CANCELLED",
        });
    });
    const progressEl = document.createElement("div");
    progressEl.className = "tobyflow-queue-job__progress";
    progressEl.innerHTML =
      '<div class="tobyflow-queue-job__progress-fill"></div>';
    el.appendChild(progressEl);
    const bodyEl = document.createElement("div");
    bodyEl.className = "tobyflow-queue-job__body";
    el.appendChild(bodyEl);
    const itemsEl = document.createElement("div");
    itemsEl.className = "tobyflow-queue-items";
    bodyEl.appendChild(itemsEl);
    let expanded = false;
    headerEl.addEventListener("click", () => {
      expanded = !expanded;
      el.classList.toggle("tobyflow-queue-job--expanded", expanded);
    });
    const refs = {
      el,
      headerEl,
      bodyEl,
      progressEl,
      progressFill: progressEl.querySelector(
        ".tobyflow-queue-job__progress-fill",
      ),
      labelEl: headerEl.querySelector(".tobyflow-queue-job__label"),
      badgeEl: headerEl.querySelector(".tobyflow-queue-job__badge"),
      counterEl: headerEl.querySelector(".tobyflow-queue-job__counter"),
      elapsedEl: headerEl.querySelector(".tobyflow-queue-job__elapsed"),
      pauseBtn: headerEl.querySelector(".tobyflow-queue-job__pause"),
      stopBtn: headerEl.querySelector(".tobyflow-queue-job__stop"),
      itemsEl,
      itemEls: new Map(),
      _lastStatus: null,
      _manualRegenJobId: null,
      _controlPaused: false,
      _lastPct: -1,
    };
    return refs;
  }
  _updateJobElement(refs, job) {
    const ownerInfo = _QueueMonitor.OWNER_COLORS[job.owner] || {
      bg: "#6b7280",
      label: job.owner,
    };
    const isDone = job.status === "completed" || job.status === "stopped";
    const isActive = job.status === "running" || job.status === "paused";
    const hasRetrying =
      isActive && job.items?.some((it) => it.state === "RETRY_SUBMIT");
    const effectiveStatus = hasRetrying ? "retrying" : job.status;
    const controlPaused = job.manualRegenActive
      ? job.manualRegenStatus === "paused"
      : job.status === "paused";
    const label = job.label || ownerInfo.label;
    if (refs.labelEl.textContent !== label) {
      refs.labelEl.textContent = label;
    }
    if (
      refs._lastStatus !== effectiveStatus ||
      refs._manualRegenJobId !==
        (job.manualRegenActive ? job.manualRegenJobId : null) ||
      refs._controlPaused !== controlPaused
    ) {
      refs._lastStatus = effectiveStatus;
      refs._manualRegenJobId = job.manualRegenActive
        ? job.manualRegenJobId
        : null;
      refs._controlPaused = controlPaused;
      const statusText = this._jobStatusText(effectiveStatus);
      refs.badgeEl.textContent = statusText;
      refs.badgeEl.className =
        "tobyflow-queue-job__badge tobyflow-queue-job__badge--" +
        effectiveStatus;
      if (refs.pauseBtn) {
        refs.pauseBtn.style.display =
          isActive && job.owner === "prompts" ? "" : "none";
        if (controlPaused) {
          refs.pauseBtn.title = window.I18n?.t("common.resume") || "Resume";
          refs.pauseBtn.className =
            "tobyflow-queue-job__pause tobyflow-queue-job__pause--resume";
          refs.pauseBtn.innerHTML =
            '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="8,6 18,12 8,18"/></svg>';
        } else {
          refs.pauseBtn.title = window.I18n?.t("common.pause") || "Pause";
          refs.pauseBtn.className = "tobyflow-queue-job__pause";
          refs.pauseBtn.innerHTML =
            '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="6" width="3" height="12" rx="1"/><rect x="14" y="6" width="3" height="12" rx="1"/></svg>';
        }
      }
      if (refs.stopBtn) {
        refs.stopBtn.style.display = isActive ? "" : "none";
      }
    }
    const completed = job.completedCount || 0;
    const failed = job.failedCount || 0;
    const total = job.totalExpected || 0;
    let counterText = total > 0 ? `${completed}/${total}` : "";
    if (failed > 0)
      counterText += ` (${window.I18n?.t("queue.errorCount", { count: failed }) || failed + " errors"})`;
    if (refs.counterEl.textContent !== counterText) {
      refs.counterEl.textContent = counterText;
    }
    if (refs.elapsedEl && job.startedAt) {
      refs.elapsedEl.textContent = this._formatTime(Date.now() - job.startedAt);
    }
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    if (refs._lastPct !== pct) {
      refs._lastPct = pct;
      refs.progressFill.style.width = `${pct}%`;
      refs.progressFill.style.background = ownerInfo.bg;
    }
    if (refs.el.classList.contains("tobyflow-queue-job--expanded")) {
      this._updateJobItems(refs, job.items || []);
    }
  }
  _jobStatusText(status) {
    const map = {
      running: window.I18n?.t("exec.running") || "Running",
      retrying: window.I18n?.t("exec.retrying") || "Retrying...",
      paused: window.I18n?.t("exec.paused") || "Paused",
      stopped: window.I18n?.t("exec.stopped") || "Stopped",
      completed: window.I18n?.t("exec.completed") || "Completed",
    };
    return map[status] || status || "";
  }
  _updateJobItems(refs, items) {
    const currentIds = new Set(items.map((it) => it.id));
    for (const [itemId, itemRef] of refs.itemEls) {
      if (!currentIds.has(itemId)) {
        itemRef.el.remove();
        refs.itemEls.delete(itemId);
      }
    }
    items.forEach((item) => {
      let itemRef = refs.itemEls.get(item.id);
      if (!itemRef) {
        itemRef = this._createItemRow(item);
        refs.itemEls.set(item.id, itemRef);
        refs.itemsEl.appendChild(itemRef.el);
      }
      this._updateItemRow(itemRef, item);
    });
  }
  _createItemRow(item) {
    const el = document.createElement("div");
    el.className = "tobyflow-queue-item";
    el.innerHTML = `
      <span class="tobyflow-queue-item__icon"></span>
      <span class="tobyflow-queue-item__index"></span>
      <span class="tobyflow-queue-item__prompt"></span>
      <span class="tobyflow-queue-item__retry"></span>
      <span class="tobyflow-queue-item__time"></span>
      <span class="tobyflow-queue-item__state"></span>
    `;
    return {
      el,
      iconEl: el.querySelector(".tobyflow-queue-item__icon"),
      indexEl: el.querySelector(".tobyflow-queue-item__index"),
      promptEl: el.querySelector(".tobyflow-queue-item__prompt"),
      retryEl: el.querySelector(".tobyflow-queue-item__retry"),
      timeEl: el.querySelector(".tobyflow-queue-item__time"),
      stateEl: el.querySelector(".tobyflow-queue-item__state"),
      _lastState: null,
      _lastRetry: -1,
    };
  }
  _updateItemRow(ref, item) {
    const phaseStatus = this._itemStatus?.get(item.id);
    const phaseInfo = phaseStatus
      ? _QueueMonitor.PHASE_LABELS[phaseStatus.phase]
      : null;
    const isTerminalState = [
      "COMPLETED",
      "FAILED",
      "PARTIAL_FAIL",
      "CANCELLED",
    ].includes(item.state);
    const phaseKey = phaseStatus
      ? `${phaseStatus.phase}:${phaseStatus.attempt || 0}:${phaseStatus.successCount || 0}:${phaseStatus.failedCount || 0}`
      : `${item.recoveryPhase || ""}:${item.recoveryAttempt || 0}:${item.recoveryMaxAttempts || 0}:${item.recoveryLabel || ""}`;
    const stateChanged = ref._lastState !== item.state;
    const retryChanged = ref._lastRetry !== (item.retryCount || 0);
    const phaseChanged = ref._lastPhaseKey !== phaseKey;
    if (
      !stateChanged &&
      !retryChanged &&
      !phaseChanged &&
      ref._lastPrompt === item.promptText
    )
      return;
    ref._lastState = item.state;
    ref._lastPrompt = item.promptText;
    ref._lastRetry = item.retryCount || 0;
    ref._lastPhaseKey = phaseKey;
    const stateInfo =
      _QueueMonitor.ITEM_STATES[item.state] ||
      _QueueMonitor.ITEM_STATES.PENDING;
    const useDisplay =
      phaseInfo &&
      (!isTerminalState ||
        ["completed", "failed", "partial_fail"].includes(phaseStatus?.phase))
        ? phaseInfo
        : stateInfo;
    ref.iconEl.textContent = stateInfo.icon;
    ref.iconEl.className = `tobyflow-queue-item__icon ${useDisplay.colorClass}`;
    ref.indexEl.textContent = `#${(item.promptIndex ?? 0) + 1}`;
    const promptText = item.promptText || "";
    const truncated =
      promptText.length > 50 ? promptText.substring(0, 50) + "..." : promptText;
    ref.promptEl.textContent = truncated;
    ref.promptEl.title = promptText;
    if (
      phaseStatus &&
      ["click_retry", "wait_retry"].includes(phaseStatus.phase) &&
      phaseStatus.attempt > 0
    ) {
      ref.retryEl.textContent = `${phaseStatus.attempt}/${phaseStatus.maxRetries || 0}`;
      ref.retryEl.className =
        "tobyflow-queue-item__retry tobyflow-queue-state--orange";
      ref.retryEl.title = phaseStatus.text || "";
    } else if (item.retryCount > 0) {
      ref.retryEl.textContent = `x${item.retryCount}`;
      ref.retryEl.className =
        "tobyflow-queue-item__retry tobyflow-queue-state--orange";
      ref.retryEl.title = "";
    } else if (
      phaseStatus &&
      phaseStatus.failedCount > 0 &&
      phaseStatus.successCount > 0
    ) {
      ref.retryEl.textContent = `${phaseStatus.successCount}\u2713 ${phaseStatus.failedCount}\u2717`;
      ref.retryEl.className =
        "tobyflow-queue-item__retry tobyflow-queue-state--yellow";
      ref.retryEl.title = "";
    } else {
      ref.retryEl.textContent = "";
      ref.retryEl.className = "tobyflow-queue-item__retry";
      ref.retryEl.title = "";
    }
    if (item.completedAt && item.submittedAt) {
      ref.timeEl.textContent = this._formatTime(
        item.completedAt - item.submittedAt,
      );
    } else if (item.submittedAt) {
      ref.timeEl.textContent = this._formatTime(Date.now() - item.submittedAt);
    } else {
      ref.timeEl.textContent = "";
    }
    ref.stateEl.textContent = item.recoveryLabel || useDisplay.label;
    ref.stateEl.className = `tobyflow-queue-item__state ${item.recoveryLabel ? "tobyflow-queue-state--orange" : useDisplay.colorClass}`;
    const phaseActive =
      phaseStatus &&
      [
        "monitoring",
        "fail_detected",
        "click_retry",
        "wait_retry",
        "retry_skipped",
        "tier2_reload",
        "tier2_resubmit",
      ].includes(phaseStatus.phase);
    const isActive =
      item.state === "SUBMITTING" ||
      item.state === "MONITORING" ||
      item.state === "RETRY_SUBMIT" ||
      item.state === "WAITING_PROVIDER" ||
      item.state === "RECOVERY_REQUIRED" ||
      phaseActive;
    ref.el.classList.toggle("tobyflow-queue-item--active", isActive);
  }
  _formatTime(ms) {
    if (!ms || ms < 0) return "";
    const totalSec = Math.floor(ms / 1e3);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${String(sec).padStart(2, "0")}`;
  }
  _showEmpty(show) {
    if (this._emptyStateEl) {
      this._emptyStateEl.style.display = show ? "" : "none";
    }
    if (this._jobsContainerEl) {
      this._jobsContainerEl.style.display = show ? "none" : "";
    }
  }
};
__publicField(_QueueMonitor, "_instance", null);
__publicField(_QueueMonitor, "OWNER_COLORS", {
  prompts: { bg: "#3b82f6", label: "Gen" },
  task: { bg: "#f97316", label: "Task" },
  workflow: { bg: "#a855f7", label: "Flow" },
  angles: { bg: "#ec4899", label: "Angles" },
  telegram: { bg: "#06b6d4", label: "Telegram" },
  download: { bg: "#06b6d4", label: "Download" },
});
__publicField(_QueueMonitor, "DOWNLOAD_STATES", {
  PENDING: {
    icon: "\u25CB",
    colorClass: "tobyflow-queue-state--muted",
    get label() {
      return window.I18n?.t("queue.downloadPending") || "Pending";
    },
  },
  DOWNLOADING: {
    icon: "\u2B07",
    colorClass: "tobyflow-queue-state--blue",
    get label() {
      return window.I18n?.t("queue.downloadActive") || "Downloading";
    },
  },
  COMPLETED: {
    icon: "\u2713",
    colorClass: "tobyflow-queue-state--green",
    get label() {
      return window.I18n?.t("queue.downloadCompleted") || "Xong";
    },
  },
  FAILED: {
    icon: "\u2717",
    colorClass: "tobyflow-queue-state--red",
    get label() {
      return window.I18n?.t("queue.downloadFailed") || "Error";
    },
  },
});
__publicField(_QueueMonitor, "PHASE_LABELS", {
  monitoring: {
    colorClass: "tobyflow-queue-state--yellow",
    get label() {
      return window.I18n?.t("queue.phaseMonitoring") || "Awaiting result";
    },
  },
  fail_detected: {
    colorClass: "tobyflow-queue-state--red",
    get label() {
      return window.I18n?.t("queue.phaseFailDetected") || "Fail detected";
    },
  },
  click_retry: {
    colorClass: "tobyflow-queue-state--orange",
    get label() {
      return window.I18n?.t("queue.phaseClickRetry") || "Clicking retry";
    },
  },
  wait_retry: {
    colorClass: "tobyflow-queue-state--orange",
    get label() {
      return window.I18n?.t("queue.phaseWaitRetry") || "Clicked, awaiting tile";
    },
  },
  retry_skipped: {
    colorClass: "tobyflow-queue-state--muted",
    get label() {
      return (
        window.I18n?.t("queue.phaseRetrySkipped") || "Skipped (already clicked)"
      );
    },
  },
  tier2_reload: {
    colorClass: "tobyflow-queue-state--purple",
    get label() {
      return window.I18n?.t("queue.phaseTier2Reload") || "Reload Flow";
    },
  },
  tier2_resubmit: {
    colorClass: "tobyflow-queue-state--purple",
    get label() {
      return window.I18n?.t("queue.phaseTier2Resubmit") || "Resubmitting";
    },
  },
  prompt_enhancing: {
    colorClass: "tobyflow-queue-state--blue",
    get label() {
      return window.I18n?.t("exec.enhancingPrompt") || "Enhancing prompt...";
    },
  },
  chatgpt_generating: {
    colorClass: "tobyflow-queue-state--blue",
    get label() {
      return (
        window.I18n?.t("exec.chatgptGenerating") || "ChatGPT generating..."
      );
    },
  },
  grok_generating: {
    colorClass: "tobyflow-queue-state--blue",
    get label() {
      return window.I18n?.t("exec.grokGenerating") || "Grok generating...";
    },
  },
  completed: {
    colorClass: "tobyflow-queue-state--green",
    get label() {
      return window.I18n?.t("queue.itemCompleted") || "Completed";
    },
  },
  failed: {
    colorClass: "tobyflow-queue-state--red",
    get label() {
      return window.I18n?.t("queue.itemFailed") || "Failed";
    },
  },
  partial_fail: {
    colorClass: "tobyflow-queue-state--yellow",
    get label() {
      return window.I18n?.t("queue.itemPartialFail") || "Partial failure";
    },
  },
});
__publicField(_QueueMonitor, "ITEM_STATES", {
  PENDING: {
    icon: "\u25CB",
    colorClass: "tobyflow-queue-state--muted",
    get label() {
      return window.I18n?.t("queue.itemPending") || "Pending";
    },
  },
  SUBMITTING: {
    icon: "\u25B6",
    colorClass: "tobyflow-queue-state--blue",
    get label() {
      return window.I18n?.t("queue.itemSubmitting") || "Submitting";
    },
  },
  SUBMITTED: {
    icon: "\u25C9",
    colorClass: "tobyflow-queue-state--blue-l",
    get label() {
      return window.I18n?.t("queue.itemSubmitted") || "Submitted";
    },
  },
  MONITORING: {
    icon: "\u231B",
    colorClass: "tobyflow-queue-state--yellow",
    get label() {
      return window.I18n?.t("queue.itemMonitoring") || "Waiting for results";
    },
  },
  WAITING_PROVIDER: {
    icon: "\u23F8",
    colorClass: "tobyflow-queue-state--yellow",
    get label() {
      return window.I18n?.t("exec.paused") || "Paused";
    },
  },
  RECOVERY_REQUIRED: {
    icon: "\u26A0",
    colorClass: "tobyflow-queue-state--yellow",
    get label() {
      return window.I18n?.t("gen.flowRecoveryRequired") || "Recovery required";
    },
  },
  RETRY_SUBMIT: {
    icon: "\u21BB",
    colorClass: "tobyflow-queue-state--orange",
    get label() {
      return window.I18n?.t("queue.itemRetry") || "Retrying";
    },
  },
  COMPLETED: {
    icon: "\u2713",
    colorClass: "tobyflow-queue-state--green",
    get label() {
      return window.I18n?.t("queue.itemCompleted") || "Completed";
    },
  },
  PARTIAL_FAIL: {
    icon: "\u26A0",
    colorClass: "tobyflow-queue-state--yellow",
    get label() {
      return window.I18n?.t("queue.itemPartialFail") || "Partial failure";
    },
  },
  FAILED: {
    icon: "\u2717",
    colorClass: "tobyflow-queue-state--red",
    get label() {
      return window.I18n?.t("queue.itemFailed") || "Failed";
    },
  },
  CANCELLED: {
    icon: "\u2298",
    colorClass: "tobyflow-queue-state--muted",
    get label() {
      return window.I18n?.t("queue.itemCancelled") || "Cancelled";
    },
  },
});
let QueueMonitor = _QueueMonitor;
window.QueueMonitor = QueueMonitor;
