class WorkflowList {
  constructor(container) {
    this.container = container;
    this.workflows = [];
    this._opening = false;
    this._editingWfId = null;
    this._filterProjectId = null;
    this._projectNames = {};
    this._searchQuery = "";
    this.isRunningAll = false;
    this.shouldStopAll = false;
    this._pendingWfIds = new Set();
    this._stoppedWfIds = new Set();
    this._stoppedWfExpires = new Map();
    this._resetPendingWfIds = new Set();
    this._runningWfIds = new Set();
    this._pageSize = 20;
    this._currentPage = 1;
    this._lastPage = 1;
    this._total = 0;
    this._loading = false;
    this._loadPending = false;
    this._loadDebounceTimer = null;
    this._sharedWorkflows = [];
    this._isCloningWorkflow = false;
    this._isDuplicatingShared = false;
    this.init();
  }
  async init() {
    try {
      const stored = await chrome.storage.local.get("af_stopped_wfids");
      const raw = stored.af_stopped_wfids;
      const now = Date.now();
      if (raw && !Array.isArray(raw) && typeof raw === "object") {
        for (const [wfId, expiresAt] of Object.entries(raw)) {
          if (Number(expiresAt) > now) {
            this._stoppedWfIds.add(wfId);
            this._stoppedWfExpires.set(wfId, Number(expiresAt));
            setTimeout(
              () => this._clearStoppedWorkflow(wfId),
              Number(expiresAt) - now,
            );
          }
        }
        console.log(
          "[WorkflowList] Restored _stoppedWfIds from storage:",
          this._stoppedWfIds.size,
        );
      }
      this._persistStoppedWorkflows();
    } catch (e) {}
    await this.loadWorkflows();
    await this.loadSharedWorkflows();
    this.bindGlobalEvents();
    this._bindToolbarEvents();
    this._replayQueuedExecutionEvents();
  }
  async _replayQueuedExecutionEvents() {
    try {
      const sessionStore = chrome.storage?.session;
      if (!sessionStore) return;
      const res = await new Promise((resolve) =>
        sessionStore.get(["af_execution_event_queue"], resolve),
      );
      const queue = Array.isArray(res?.af_execution_event_queue)
        ? res.af_execution_event_queue
        : [];
      if (queue.length === 0) return;
      console.log(
        `[WorkflowList] Replaying ${queue.length} queued execution events`,
      );
      for (const msg of queue) {
        if (msg?.event && window.eventBus) {
          try {
            window.eventBus.emit(msg.event, msg.data || {});
          } catch (_) {}
        }
      }
      await new Promise((resolve) =>
        sessionStore.remove(["af_execution_event_queue"], resolve),
      );
    } catch (e) {
      console.warn("[WorkflowList] Replay queue failed:", e.message);
    }
  }
  _isWfRunning(wfId, serverStatus) {
    if (
      !wfId ||
      this._stoppedWfIds?.has(wfId) ||
      this._resetPendingWfIds?.has(wfId)
    )
      return false;
    return serverStatus === "running" || this._runningWfIds?.has(wfId) === true;
  }
  _persistStoppedWorkflows() {
    try {
      const now = Date.now();
      const active = {};
      for (const [wfId, expiresAt] of this._stoppedWfExpires || []) {
        if (expiresAt > now && this._stoppedWfIds?.has(wfId))
          active[wfId] = expiresAt;
      }
      chrome.storage.local.set({ af_stopped_wfids: active }).catch?.(() => {});
    } catch (_) {}
  }
  _clearStoppedWorkflow(wfId) {
    if (!wfId) return;
    this._stoppedWfIds?.delete(wfId);
    this._stoppedWfExpires?.delete(wfId);
    this._persistStoppedWorkflows();
  }
  _markWorkflowStopped(wfId, ttlMs = 3e4) {
    if (!wfId) return;
    const expiresAt = Date.now() + ttlMs;
    this._stoppedWfIds.add(wfId);
    this._stoppedWfExpires.set(wfId, expiresAt);
    this._persistStoppedWorkflows();
    setTimeout(() => {
      if (this._stoppedWfExpires.get(wfId) === expiresAt)
        this._clearStoppedWorkflow(wfId);
    }, ttlMs);
  }
  _applyWorkflowStatusEvent(wfId, data = {}) {
    if (!wfId) return;
    const status = data.status || "pending";
    const isReset = data.reset === true;
    if (isReset) {
      this._runningWfIds?.delete(wfId);
      this._clearStoppedWorkflow(wfId);
      this._resetPendingWfIds?.add(wfId);
    }
    const workflow = this.workflows.find((w) => w.wf_id === wfId);
    if (workflow) {
      workflow.status = status;
      if (Number.isFinite(data.progress_completed))
        workflow.progress_completed = data.progress_completed;
      if (Number.isFinite(data.progress_total))
        workflow.progress_total = data.progress_total;
      if (data.fullReset === true) {
        workflow.progress_completed = 0;
        workflow.progress = 0;
        workflow.current_node_id = null;
      }
      this._rerenderSingleWorkflowCard(wfId);
    } else {
      this._updateCardRunningState(wfId, status === "running", status);
    }
  }
  bindGlobalEvents() {
    if (window.eventBus) {
      window.eventBus.on("storage:workflow_saved", (data) => {
        const wfId = data?.wfId || data?.wf_id || data?.workflow?.wf_id;
        this._lastSaveTime = Date.now();
        if (wfId) {
          this._debouncedUpdateSingleWorkflow(wfId);
        } else {
          this._debouncedLoadWorkflows();
        }
      });
      window.eventBus.on("storage:workflow_full_saved", (data) => {
        const wfId = data?.wfId || data?.wf_id || data?.workflow?.wf_id;
        this._lastSaveTime = Date.now();
        if (wfId) {
          this._debouncedUpdateSingleWorkflow(wfId);
        } else {
          this._debouncedLoadWorkflows();
        }
      });
      window.eventBus.on("storage:workflow_deleted", (data) => {
        const wfId = data?.wfId;
        if (wfId && Array.isArray(this.workflows)) {
          this.workflows = this.workflows.filter((w) => w.wf_id !== wfId);
          if (this._lastUpdatedWfId === wfId) this._lastUpdatedWfId = null;
          this._clearStoppedWorkflow(wfId);
          this._resetPendingWfIds?.delete(wfId);
          try {
            this.render();
          } catch (e) {}
        }
        this._debouncedLoadWorkflows();
      });
      window.eventBus.on("workflow:status_updated", (data) => {
        const wfId = data?.wfId || data?.wf_id || data?.workflow?.wf_id;
        if (wfId) {
          if (data?.status) this._applyWorkflowStatusEvent(wfId, data);
          this._debouncedUpdateSingleWorkflow(wfId);
        } else {
          this._debouncedLoadWorkflows();
        }
      });
      window.eventBus.on("workflow:reset", (data) => {
        const wfId = data?.workflowId || data?.wfId || data?.wf_id;
        if (!wfId) return;
        this._applyWorkflowStatusEvent(wfId, {
          status: "pending",
          reset: true,
          fullReset: true,
        });
        this._debouncedUpdateSingleWorkflow(wfId);
      });
      window.eventBus.on("execution:started", (data) => {
        const wfId = data?.workflow?.wf_id || data?.wfId;
        console.log("[WorkflowList] execution:started received:", wfId, data);
        if (wfId) {
          this._lastUpdatedWfId = wfId;
          this._clearStoppedWorkflow(wfId);
          this._resetPendingWfIds?.delete(wfId);
          this._runningWfIds.add(wfId);
          this._updateCardRunningState(wfId, true);
        }
      });
      window.eventBus.on("execution:completed", (data) => {
        const wfId =
          data?.workflow?.wf_id || data?.wfId || this._lastUpdatedWfId;
        console.log("[WorkflowList] execution:completed received:", wfId);
        if (wfId) {
          this._runningWfIds.delete(wfId);
          this._resetPendingWfIds?.delete(wfId);
          this._updateCardRunningState(
            wfId,
            false,
            data?.stopped ? "pending" : data?.error ? "failed" : "completed",
          );
          this._debouncedUpdateSingleWorkflow(wfId);
        }
        this._executionCooldown = true;
        setTimeout(() => {
          this._executionCooldown = false;
          if (this._pendingLoadAfterCooldown) {
            this._pendingLoadAfterCooldown = false;
            console.log(
              "[WorkflowList] Cooldown ended, executing pending loadWorkflows",
            );
            this.loadWorkflows();
          }
        }, 5e3);
        setTimeout(() => {
          this._lastUpdatedWfId = null;
        }, 2e3);
      });
      window.eventBus.on("execution:progress", (data) => {
        if (!this._lastUpdatedWfId) return;
        const { total, completed } = data;
        console.log(
          "[WorkflowList] execution:progress:",
          completed,
          "/",
          total,
        );
        if (total > 0) {
          const percent = Math.round((completed / total) * 100);
          this._updateCardProgress(this._lastUpdatedWfId, percent);
        }
      });
      window.eventBus.on("workflow:share_accepted", () =>
        this.loadSharedWorkflows(),
      );
      window.eventBus.on("workflow:share_rejected", () => {
        try {
          this.loadSharedWorkflows();
        } catch (_) {}
        if (window.TobyNotify?.info) {
          window.TobyNotify.info(
            window.I18n?.t("workflow.shareRejected") ||
              "The recipient rejected the share",
          );
        }
      });
      window.eventBus.on("workflow:share_revoked", () => {
        try {
          this.loadSharedWorkflows();
        } catch (_) {}
        if (window.TobyNotify?.warning) {
          window.TobyNotify.warning(
            window.I18n?.t("workflow.shareRevoked") ||
              "Share permission has been revoked",
          );
        }
      });
      window.eventBus.on("workflow:shared_accepted", async (data) => {
        if (data?.copied && data?.workflow?.wf_id) {
          await this.loadWorkflows();
          const workflowsTab = document.querySelector(
            '[data-subtab="workflows"]',
          );
          if (workflowsTab) workflowsTab.click();
          setTimeout(() => {
            if (this._openWorkflow) {
              this._openWorkflow(data.workflow.wf_id);
            }
          }, 300);
        } else {
          this.loadSharedWorkflows();
        }
      });
    }
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local" && (changes.af_workflows || changes.af_nodes)) {
        if (this._lastUpdatedWfId && window.workflowExecutor?.isRunning) {
          this._debouncedUpdateSingleWorkflow(this._lastUpdatedWfId);
        } else {
          this._debouncedLoadWorkflows();
        }
      }
    });
    if (window.eventBus) {
      window.eventBus.on("project:changed", (data) => {
        if (data && data.projectId !== void 0) {
          this._filterProjectId = data.projectId || null;
          try {
            this.renderWorkflowList();
          } catch (_) {}
        }
        this.loadWorkflows();
        const pending = this._pendingOpenAfterSwitch;
        if (pending && data?.projectId === pending.projectId) {
          this._pendingOpenAfterSwitch = null;
          console.log(
            "[WorkflowList] Auto-open workflow after project switch:",
            pending.wfId,
          );
          setTimeout(() => this._openWorkflow(pending.wfId, null), 500);
        }
      });
      window.eventBus.on("auth:login", () => this.loadWorkflows());
      window.eventBus.on("storage:mode_changed", (data) => {
        if (data?.mode === "api") this.loadWorkflows();
      });
      window.eventBus.on("i18n:changed", () => {
        this.renderWorkflowList();
        const sharedTabContent = document.querySelector(
          '[data-content="shared"]',
        );
        if (
          sharedTabContent &&
          !sharedTabContent.classList.contains("hidden")
        ) {
          this.renderSharedTab(sharedTabContent);
        }
      });
      window.eventBus.on("auth:login", () => this.loadSharedWorkflows());
      window.eventBus.on("auth:logout", () => {
        this._sharedWorkflows = [];
        this._updateSharedTabBadge();
        const sharedTabContent = document.querySelector(
          '[data-content="shared"]',
        );
        if (sharedTabContent) this.renderSharedTab(sharedTabContent);
      });
    }
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.action === "executionStatusUpdate") {
        const wfId = msg.wfId || msg.workflowId;
        if (wfId) {
          this._debouncedUpdateSingleWorkflow(wfId);
        } else {
          this._debouncedLoadWorkflows();
        }
      }
      if (msg.action === "workflowSaved") {
        const wfId = msg.wfId || msg.workflowId;
        this._lastSaveTime = Date.now();
        if (wfId) {
          this._debouncedUpdateSingleWorkflow(wfId);
        } else {
          this._debouncedLoadWorkflows();
        }
      }
      if (msg.action === "workflowEditorClosed") {
        const wfIdToUpdate =
          msg.wfId || this._editingWfId || this._lastUpdatedWfId;
        if (msg.wfId && this._editingWfId && msg.wfId !== this._editingWfId)
          return;
        this._editorStateRevision = (this._editorStateRevision || 0) + 1;
        this._editingWfId = null;
        this._refreshCardEditingState(wfIdToUpdate);
        this._rerenderSingleWorkflowCard(wfIdToUpdate);
        const recentSave =
          this._lastSaveTime && Date.now() - this._lastSaveTime < 2e3;
        if (recentSave) {
          console.log(
            "[WorkflowList] Skip editor close refresh \u2014 recent save already handled",
          );
          return;
        }
        if (wfIdToUpdate) {
          this._debouncedUpdateSingleWorkflow(wfIdToUpdate);
        }
        if (this._executionCooldown) {
          console.log(
            "[WorkflowList] workflowEditorClosed during cooldown, scheduling load after cooldown",
          );
          this._pendingLoadAfterCooldown = true;
        }
      }
      if (msg.action === "workflowExecutionEvent") {
        const { event, data } = msg;
        if (msg._originSidebar) {
          return;
        }
        if (msg._bg_relayed) {
          return;
        }
        if (
          event === "execution:stop" &&
          window.workflowExecutor?.handleRemoteStop?.(
            data?.wf_id || data?.workflow?.wf_id,
            data?.run_id,
          ) === false
        )
          return;
        if (window.eventBus) {
          window.eventBus.emit(event, data);
        }
        if (event === "execution:stop") {
          console.log("[WorkflowList] Remote stop received, data:", data);
          const stopWfId =
            data?.wf_id || data?.workflow?.wf_id || this._lastUpdatedWfId;
          if (stopWfId) {
            this._markWorkflowStopped(stopWfId);
            this._runningWfIds?.delete(stopWfId);
            this._updateCardRunningState(stopWfId, false, "pending");
          }
        }
        if (
          [
            "execution:started",
            "execution:completed",
            "workflow:reset",
            "node:completed",
            "execution:stop",
          ].includes(event)
        ) {
          const wfId =
            data?.wf_id ||
            data?.workflow?.wf_id ||
            data?.workflowId ||
            data?.wfId;
          if (wfId) {
            this._debouncedUpdateSingleWorkflow(wfId);
          } else if (this._lastUpdatedWfId) {
            this._debouncedUpdateSingleWorkflow(this._lastUpdatedWfId);
          } else {
            this._debouncedLoadWorkflows();
          }
        }
      }
    });
  }
  _debouncedLoadWorkflows() {
    if (
      (window.workflowExecutor?.isRunning || this._executionCooldown) &&
      this._lastUpdatedWfId
    ) {
      console.log(
        "[WorkflowList] Skip loadWorkflows - executor running or cooldown, use single update instead",
      );
      if (this._loadCoalesceTimer) {
        clearTimeout(this._loadCoalesceTimer);
        this._loadCoalesceTimer = null;
      }
      this._debouncedUpdateSingleWorkflow(this._lastUpdatedWfId);
      return;
    }
    if (this._loadCoalesceTimer) clearTimeout(this._loadCoalesceTimer);
    this._loadCoalesceTimer = setTimeout(() => {
      this._loadCoalesceTimer = null;
      if (
        (window.workflowExecutor?.isRunning || this._executionCooldown) &&
        this._lastUpdatedWfId
      ) {
        console.log(
          "[WorkflowList] Skip loadWorkflows in timer - executor running or cooldown",
        );
        return;
      }
      this.loadWorkflows();
    }, 1e3);
  }
  async _updateSingleWorkflowInList(wfId, partialData = null) {
    if (!wfId) return;
    try {
      let updatedWorkflow = partialData;
      if (
        window.workflowExecutor?.currentWorkflow?.wf_id === wfId &&
        window.workflowExecutor.isRunning &&
        !window.workflowExecutor.shouldStop
      ) {
        const execWf = window.workflowExecutor.currentWorkflow;
        updatedWorkflow = { wf_id: wfId, status: execWf.status || "running" };
      }
      if (!updatedWorkflow) {
        updatedWorkflow = await window.storageManager?.getWorkflow(wfId);
      }
      if (!updatedWorkflow) return;
      if (this._resetPendingWfIds?.has(wfId)) {
        if (["pending", "idle", "draft"].includes(updatedWorkflow.status)) {
          this._resetPendingWfIds.delete(wfId);
        } else if (!this._runningWfIds?.has(wfId)) {
          const optimistic = this.workflows.find((w) => w.wf_id === wfId);
          updatedWorkflow = {
            ...updatedWorkflow,
            status: "pending",
            progress: optimistic?.progress ?? 0,
            progress_completed: optimistic?.progress_completed ?? 0,
            current_node_id: optimistic?.current_node_id ?? null,
          };
        }
      }
      if (
        window.workflowExecutor?.shouldStop &&
        window.workflowExecutor?.currentWorkflow?.wf_id === wfId &&
        updatedWorkflow.status === "running"
      ) {
        updatedWorkflow.status = "pending";
      }
      const index = this.workflows.findIndex((w) => w.wf_id === wfId);
      if (index >= 0) {
        const previousProjectId = this.workflows[index].project_id;
        const previousProjectName = this.workflows[index].project_name;
        this.workflows[index] = {
          ...this.workflows[index],
          ...updatedWorkflow,
        };
        if (
          previousProjectId !== this.workflows[index].project_id ||
          previousProjectName !== this.workflows[index].project_name
        ) {
          await this._cacheProjectNames();
          await this.renderWorkflowList();
          return;
        }
        this._rerenderSingleWorkflowCard(wfId);
      } else if (updatedWorkflow.wf_id) {
        this.workflows.unshift(updatedWorkflow);
        this.renderWorkflowList();
      }
    } catch (e) {
      console.warn(
        "[WorkflowList] _updateSingleWorkflowInList failed:",
        wfId,
        e.message,
      );
    }
  }
  _refreshCardEditingState(wfId) {
    if (!wfId) return;
    const card = this.container?.querySelector(
      `.workflow-card[data-wf-id="${wfId}"]`,
    );
    if (!card) return;
    const wf = this.workflows.find((w) => w.wf_id === wfId);
    const isRunning = this._isWfRunning(wfId, wf?.status);
    const isEditing = this._editingWfId === wfId;
    const canDelete = !isRunning && !isEditing;
    const deleteBtn = card.querySelector(".delete-btn");
    if (deleteBtn) deleteBtn.disabled = !canDelete;
  }
  _rerenderSingleWorkflowCard(wfId) {
    const workflow = this.workflows.find((w) => w.wf_id === wfId);
    if (!workflow) return;
    const card = this.container.querySelector(
      `.workflow-card[data-wf-id="${wfId}"]`,
    );
    if (!card) return;
    const isRunning = this._isWfRunning(wfId, workflow.status);
    const hasPendingOverride =
      this._stoppedWfIds?.has(wfId) || this._resetPendingWfIds?.has(wfId);
    const statusClass = hasPendingOverride
      ? "pending"
      : workflow.status || "idle";
    const displayStatus = isRunning ? "running" : statusClass;
    if (!isRunning) this._restoreIdleCardActions(card, wfId, displayStatus);
    card.classList.remove(
      "pending",
      "running",
      "completed",
      "failed",
      "paused",
      "idle",
    );
    card.classList.add(displayStatus);
    const isEditing = this._editingWfId === wfId;
    card.classList.toggle("editing", isEditing);
    const metaEl = card.querySelector(".workflow-card-meta");
    if (metaEl) {
      const nodeCount = workflow.progress_total || 0;
      const completedCount = workflow.progress_completed || 0;
      const progress =
        nodeCount > 0 ? Math.round((completedCount / nodeCount) * 100) : 0;
      const svg = metaEl.querySelector("svg");
      let inlineProgress = metaEl.querySelector(
        ".workflow-card-inline-progress",
      );
      const metaText = `${nodeCount} nodes${isRunning ? ` - ${progress}%` : ""}${isEditing ? " - Editing" : ""}`;
      metaEl.innerHTML = "";
      if (svg) metaEl.appendChild(svg);
      metaEl.appendChild(document.createTextNode(metaText));
      if (isRunning) {
        if (!inlineProgress) {
          inlineProgress = document.createElement("span");
          inlineProgress.className = `workflow-card-inline-progress${progress > 0 ? "" : " indeterminate"}`;
          inlineProgress.setAttribute("role", "progressbar");
          inlineProgress.innerHTML = `<span class="workflow-card-inline-progress-bar" style="width: ${progress}%"></span>`;
        }
        inlineProgress.style.display = "";
        metaEl.appendChild(inlineProgress);
      }
    }
    const statusBadge = card.querySelector(".workflow-card-status");
    if (statusBadge) {
      const statusLabel = WorkflowList._renderStatusLabel(displayStatus);
      statusBadge.setAttribute("data-tooltip", statusLabel);
      statusBadge.setAttribute("aria-label", statusLabel);
      statusBadge.innerHTML = WorkflowList._renderStatusIcon(displayStatus);
      statusBadge.className = `workflow-card-status ${displayStatus}`;
    }
    const progressBarFill =
      card.querySelector(".workflow-card-progress-bar-fill") ||
      card.querySelector(".workflow-card-inline-progress-bar");
    const progressBarContainer =
      card.querySelector(".workflow-card-progress-bar") ||
      card.querySelector(".workflow-card-inline-progress");
    if (isRunning) {
      if (progressBarFill && workflow.progress !== void 0) {
        progressBarFill.style.width = `${workflow.progress}%`;
      }
      if (progressBarContainer) {
        progressBarContainer.classList.remove("hidden");
        progressBarContainer.style.display = "";
      }
    } else {
      if (progressBarContainer) progressBarContainer.classList.add("hidden");
    }
    const runBtn = card.querySelector(".run-btn");
    const stopBtn = card.querySelector(".stop-btn");
    const runningBtns = card.querySelector(".wf-running-buttons");
    const dropdownMenu = card.querySelector(".tobyflow-dot-menu");
    const toggleBtn = card.querySelector(".wf-toggle-btn");
    if (isRunning) {
      runBtn?.classList.add("hidden");
      stopBtn?.classList.remove("hidden");
      if (runningBtns) runningBtns.style.display = "flex";
      if (dropdownMenu) dropdownMenu.style.display = "none";
      if (toggleBtn) toggleBtn.style.display = "none";
    } else {
      runBtn?.classList.remove("hidden");
      stopBtn?.classList.add("hidden");
      if (runningBtns) runningBtns.style.display = "none";
      if (dropdownMenu) dropdownMenu.style.display = "";
      if (toggleBtn) toggleBtn.style.display = "";
    }
    const nameEl = card.querySelector(".workflow-card-name");
    if (nameEl) {
      const displayName =
        workflow.wf_name ||
        window.I18n?.t("workflow.unnamed") ||
        "Unnamed workflow";
      if (nameEl.textContent !== displayName) {
        nameEl.textContent = displayName;
      }
    }
    const isEnabled = workflow.enabled !== false;
    if (toggleBtn) {
      const wantClass = isEnabled ? "on" : "off";
      const dropClass = isEnabled ? "off" : "on";
      if (!toggleBtn.classList.contains(wantClass)) {
        toggleBtn.classList.remove(dropClass);
        toggleBtn.classList.add(wantClass);
        toggleBtn.title = isEnabled
          ? window.I18n?.t("workflow.disableWorkflow") || "Disable workflow"
          : window.I18n?.t("workflow.enableWorkflow") || "Enable workflow";
      }
    }
    card.classList.toggle("wf-disabled", !isEnabled);
    const lastEditEl = card.querySelector(".workflow-card-last-edit");
    if (lastEditEl && workflow.updated_at) {
      const timeText = this._formatRelativeTime(workflow.updated_at);
      const lastNode = lastEditEl.lastChild;
      if (
        lastNode &&
        lastNode.nodeType === Node.TEXT_NODE &&
        lastNode.textContent !== timeText
      ) {
        lastNode.textContent = timeText;
      }
    }
  }
  _bindSingleCardEvents(card) {
    if (!card) return;
    const wfId = card.dataset.wfId;
    if (!wfId) return;
    const listContainer = this.container.querySelector(".workflow-list");
    const toggleBtn = card.querySelector(".wf-toggle-btn");
    if (toggleBtn && !toggleBtn._bound) {
      toggleBtn._bound = true;
      toggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const wf = this.workflows.find((w) => w.wf_id === wfId);
        const isAdminView =
          wf?._is_admin_view ||
          (wf?.user?.id && wf.user.id !== window.authManager?.user?.id);
        if (isAdminView) return;
        this.toggleWorkflowEnabled(wfId);
      });
    }
    const dotMenu = card.querySelector(".tobyflow-dot-menu");
    if (dotMenu) {
      const menuBtn = dotMenu.querySelector(".tobyflow-dot-menu-btn");
      const dropdown = dotMenu.querySelector(".tobyflow-dropdown-menu");
      if (menuBtn && !menuBtn._bound) {
        menuBtn._bound = true;
        menuBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          console.log(
            "[WorkflowList] Menu button clicked:",
            wfId,
            "dropdown:",
            dropdown,
            "wasHidden:",
            dropdown?.classList.contains("hidden"),
          );
          const wasHidden = dropdown?.classList.contains("hidden");
          this._closeAllDropdowns(listContainer);
          if (dropdown && wasHidden) {
            dropdown.classList.remove("hidden");
            this._positionDropdown(menuBtn, dropdown);
            setTimeout(() => {
              document.addEventListener(
                "click",
                () => this._closeAllDropdowns(listContainer),
                { once: true },
              );
            }, 0);
          }
        });
      }
    }
    const editBtn = card.querySelector(".edit-btn");
    if (editBtn && !editBtn._bound) {
      editBtn._bound = true;
      editBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        this._closeAllDropdowns(listContainer);
        if (await window.SystemConfig?.getBoolReady?.("workflow_web_mode")) {
          chrome.runtime.sendMessage(
            { action: "openWebSpaces", wfId },
            (resp) => {
              void chrome.runtime.lastError;
              if (!resp?.ok)
                window.showNotification?.(
                  window.I18n?.t("workflow.openWebFailed") ||
                    "Could not open web editor",
                  "error",
                );
            },
          );
          return;
        }
        const wf = this.workflows.find((w) => w.wf_id === wfId);
        const isAdminView =
          wf?._is_admin_view ||
          (wf?.user?.id && wf.user.id !== window.authManager?.user?.id);
        if (
          wf &&
          !isAdminView &&
          window.ProjectHelper &&
          !(await window.ProjectHelper.isCurrentProjectLive(wf))
        ) {
          const action = await window.ProjectHelper.showCrossProjectWarning(
            wf,
            "workflow",
            {
              confirmTextKey: "project.openProject",
              confirmTextFallback: "Open project",
            },
          );
          if (action === "switch") {
            const pending = { wfId, projectId: wf.project_id, ts: Date.now() };
            this._pendingOpenAfterSwitch = pending;
            setTimeout(() => {
              if (this._pendingOpenAfterSwitch === pending) {
                console.log(
                  "[WorkflowList] Pending auto-open expired (30s):",
                  wfId,
                );
                this._pendingOpenAfterSwitch = null;
              }
            }, 3e4);
            window.ProjectHelper.navigateToProject(wf.project_id);
          }
          return;
        }
        this._openWorkflow(wfId, card);
      });
    }
    const nameEl = card.querySelector(".workflow-card-name");
    if (nameEl && editBtn && !nameEl._openBound) {
      nameEl._openBound = true;
      nameEl.setAttribute("role", "button");
      nameEl.setAttribute("tabindex", "0");
      const openFromName = (event) => {
        event.preventDefault();
        event.stopPropagation();
        card.querySelector(".edit-btn")?.click();
      };
      nameEl.addEventListener("click", openFromName);
      nameEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") openFromName(event);
      });
    }
    const copyBtn = card.querySelector(".copy-btn");
    if (copyBtn && !copyBtn._bound) {
      copyBtn._bound = true;
      copyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._closeAllDropdowns(listContainer);
        this.cloneWorkflow(wfId);
      });
    }
    const runBtn = card.querySelector(".run-btn");
    if (runBtn && !runBtn._bound) {
      runBtn._bound = true;
      runBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        this._closeAllDropdowns(listContainer);
        const wf = this.workflows.find((w) => w.wf_id === wfId);
        const isAdminView =
          wf?._is_admin_view ||
          (wf?.user?.id && wf.user.id !== window.authManager?.user?.id);
        if (
          wf &&
          !isAdminView &&
          window.ProjectHelper &&
          !(await window.ProjectHelper.isCurrentProjectLive(wf))
        ) {
          const action = await window.ProjectHelper.showCrossProjectWarning(
            wf,
            "workflow",
          );
          if (action === "switch")
            window.ProjectHelper.navigateToProject(wf.project_id);
          return;
        }
        this.runWorkflow(wfId);
      });
    }
    const stopBtn = card.querySelector(".stop-btn");
    if (stopBtn && !stopBtn._bound) {
      stopBtn._bound = true;
      stopBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const wf = this.workflows.find((w) => w.wf_id === wfId);
        const isAdminView =
          wf?._is_admin_view ||
          (wf?.user?.id && wf.user.id !== window.authManager?.user?.id);
        if (isAdminView) return;
        this.stopWorkflow(wfId);
      });
    }
    const resetBtn = card.querySelector(".reset-btn");
    if (resetBtn && !resetBtn._bound) {
      resetBtn._bound = true;
      resetBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._closeAllDropdowns(listContainer);
        const wf = this.workflows.find((w) => w.wf_id === wfId);
        const isAdminView =
          wf?._is_admin_view ||
          (wf?.user?.id && wf.user.id !== window.authManager?.user?.id);
        if (isAdminView) return;
        this.resetWorkflow(wfId);
      });
    }
    const exportBtn = card.querySelector(".export-btn");
    if (exportBtn && !exportBtn._bound) {
      exportBtn._bound = true;
      exportBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._closeAllDropdowns(listContainer);
        this.exportWorkflow(wfId);
      });
    }
    const deleteBtn = card.querySelector(".delete-btn");
    if (deleteBtn && !deleteBtn._bound) {
      deleteBtn._bound = true;
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._closeAllDropdowns(listContainer);
        this.deleteWorkflow(wfId);
      });
    }
    const publishBtn = card.querySelector(".publish-template-btn");
    if (publishBtn && !publishBtn._bound) {
      publishBtn._bound = true;
      publishBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._closeAllDropdowns(listContainer);
        this.publishAsTemplate(wfId);
      });
      if (window.CreatorTemplatePublish?.isEligible) {
        window.CreatorTemplatePublish.isEligible()
          .then((ok) => {
            if (ok) publishBtn.classList.remove("hidden");
          })
          .catch(() => {});
      }
    }
    const shareBtn = card.querySelector(".share-btn");
    if (shareBtn && !shareBtn._bound) {
      shareBtn._bound = true;
      shareBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._closeAllDropdowns(listContainer);
        this.handleShare(wfId);
      });
    }
  }
  async publishAsTemplate(wfId) {
    if (!window.CreatorTemplatePublish) {
      window.showNotification?.(
        window.I18n?.t("creator.publish.moduleNotReady") ||
          "Publish module not ready",
        "error",
      );
      return;
    }
    try {
      const workflow = await window.storageManager?.getWorkflow(wfId);
      if (!workflow || !(workflow.nodes || []).length) {
        window.showNotification?.(
          window.I18n?.t("workflow.noWorkflowData") || "No workflow data",
          "error",
        );
        return;
      }
      if (workflow._is_shared_view || workflow._is_admin_view) {
        window.showNotification?.(
          window.I18n?.t("creator.publish.ownOnly") ||
            "You can only publish your own workflow.",
          "error",
        );
        return;
      }
      await window.CreatorTemplatePublish.show({
        wf_name: workflow.wf_name || "Workflow Template",
        description: workflow.description || "",
        nodes: workflow.nodes || [],
        edges: workflow.edges || [],
        settings: workflow.settings || {},
      });
    } catch (e) {
      console.error("[WorkflowList] publishAsTemplate error:", e);
      window.showNotification?.(
        (window.I18n?.t("creator.publish.error") ||
          "Could not submit the template") +
          ": " +
          e.message,
        "error",
      );
    }
  }
  _getStatusText(status) {
    const statusMap = {
      pending: window.I18n?.t("workflow.statusPending") || "Pending",
      running: window.I18n?.t("workflow.statusRunning") || "Running",
      completed: window.I18n?.t("workflow.statusCompleted") || "Completed",
      failed: window.I18n?.t("workflow.statusFailed") || "Failed",
      paused: window.I18n?.t("workflow.statusPaused") || "Paused",
    };
    return statusMap[status] || status;
  }
  _updateCardProgress(wfId, percent) {
    console.log("[WorkflowList] _updateCardProgress:", wfId, percent + "%");
    const card = this.container.querySelector(
      `.workflow-card[data-wf-id="${wfId}"]`,
    );
    if (!card) {
      console.warn("[WorkflowList] Card not found for progress update:", wfId);
      return;
    }
    let progressContainer = card.querySelector(".workflow-card-progress");
    if (!progressContainer) {
      progressContainer = document.createElement("div");
      progressContainer.className = "workflow-card-progress";
      progressContainer.innerHTML = `
        <div class="workflow-card-progress-bar">
          <div class="workflow-card-progress-bar-fill" style="width: 0%"></div>
        </div>
      `;
      card.appendChild(progressContainer);
    }
    const progressBarFill = progressContainer.querySelector(
      ".workflow-card-progress-bar-fill",
    );
    if (progressBarFill) {
      progressBarFill.style.width = `${percent}%`;
    }
    progressContainer.classList.remove("hidden");
    const metaEl = card.querySelector(".workflow-card-meta");
    if (metaEl) {
      const currentText = metaEl.textContent || "";
      const nodeMatch = currentText.match(/^(\d+)\s*nodes?/);
      if (nodeMatch) {
        const nodeCount = nodeMatch[1];
        metaEl.innerHTML = `<svg class="workflow-card-node-icon" width="12" height="12" viewBox="0 0 16 16" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M6.17 3.646a.5.5 0 0 1 .707 0l5.477 5.477a.5.5 0 0 1 0 .707l-1.366 1.366a4.373 4.373 0 1 1-6.184-6.184L6.17 3.646Zm.353 1.061L5.508 5.723 5.5 5.73a3.373 3.373 0 1 0 4.77 4.77l.006-.008 1.016-1.015-4.77-4.77Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M5.354 10.646a.5.5 0 0 1 0 .707L3.02 13.688a.5.5 0 1 1-.707-.707l2.334-2.334a.5.5 0 0 1 .707 0ZM10.354 2.313a.5.5 0 0 1 0 .707L8.02 5.354a.5.5 0 0 1-.707-.708l2.334-2.333a.5.5 0 0 1 .707 0ZM13.687 5.646a.5.5 0 0 1 0 .708l-2.333 2.333a.5.5 0 1 1-.707-.707l2.333-2.334a.5.5 0 0 1 .707 0Z" fill="currentColor"/></svg>${nodeCount} nodes - ${percent}%`;
      }
    }
    let inlineProgress = card.querySelector(".workflow-card-inline-progress");
    if (!inlineProgress && metaEl) {
      inlineProgress = document.createElement("span");
      inlineProgress.className = "workflow-card-inline-progress indeterminate";
      inlineProgress.setAttribute("role", "progressbar");
      inlineProgress.innerHTML = `<span class="workflow-card-inline-progress-bar" style="width: 0%"></span>`;
    }
    if (inlineProgress && metaEl && inlineProgress.parentElement !== metaEl) {
      metaEl.appendChild(inlineProgress);
    }
    const inlineProgressBar = inlineProgress?.querySelector(
      ".workflow-card-inline-progress-bar",
    );
    if (inlineProgressBar) {
      inlineProgressBar.style.width = `${percent}%`;
    }
    if (inlineProgress && percent > 0) {
      inlineProgress.classList.remove("indeterminate");
    }
    if (inlineProgress) inlineProgress.style.display = "";
  }
  _restoreIdleCardActions(card, wfId, status = "pending") {
    if (card.querySelector(".tobyflow-dot-menu")) return;
    const workflow = this.workflows.find((w) => w.wf_id === wfId);
    const actions = card.querySelector(".workflow-card-actions");
    if (!workflow || !actions) return;
    const template = document.createElement("template");
    template.innerHTML = this.renderWorkflowCard(
      { ...workflow, status },
      false,
    );
    const replacement = template.content.querySelector(
      ".workflow-card-actions",
    );
    if (!replacement) return;
    actions.replaceWith(replacement);
    this._bindSingleCardEvents(card);
  }
  _updateCardRunningState(wfId, isRunning, finalStatus = null) {
    const card = this.container.querySelector(
      `.workflow-card[data-wf-id="${wfId}"]`,
    );
    if (!card) {
      if (this._verboseLog)
        console.debug(
          "[WorkflowList] Card not in DOM (likely off-page), defer update:",
          wfId,
        );
      this._debouncedUpdateSingleWorkflow?.(wfId);
      return;
    }
    if (this._verboseLog)
      console.debug(
        "[WorkflowList] _updateCardRunningState:",
        wfId,
        isRunning,
        finalStatus,
      );
    card.classList.remove(
      "pending",
      "running",
      "completed",
      "failed",
      "paused",
      "idle",
    );
    const newStatus = isRunning ? "running" : finalStatus || "pending";
    if (!isRunning) this._restoreIdleCardActions(card, wfId, newStatus);
    card.classList.add(newStatus);
    const statusBadge = card.querySelector(".workflow-card-status");
    if (statusBadge) {
      const statusLabel = WorkflowList._renderStatusLabel(newStatus);
      statusBadge.setAttribute("data-tooltip", statusLabel);
      statusBadge.setAttribute("aria-label", statusLabel);
      statusBadge.innerHTML = WorkflowList._renderStatusIcon(newStatus);
      statusBadge.className = `workflow-card-status ${newStatus}`;
    }
    const dropdownMenu = card.querySelector(".tobyflow-dot-menu");
    const runBtn = card.querySelector(".run-btn");
    const stopBtn = card.querySelector(".stop-btn");
    const actionsDiv = card.querySelector(".workflow-card-actions");
    if (isRunning) {
      if (dropdownMenu) dropdownMenu.style.display = "none";
      runBtn?.classList.add("hidden");
      let runningBtns = card.querySelector(".wf-running-buttons");
      console.log(
        "[WorkflowList] _updateCardRunningState runningBtns exists:",
        !!runningBtns,
        "actionsDiv:",
        !!actionsDiv,
      );
      if (!runningBtns && actionsDiv) {
        console.log(
          "[WorkflowList] Creating new .wf-running-buttons for",
          wfId,
        );
        runningBtns = document.createElement("div");
        runningBtns.className = "wf-running-buttons";
        runningBtns.style.display = "flex";
        runningBtns.style.gap = "4px";
        runningBtns.innerHTML = `
          <button class="btn btn-secondary btn-sm edit-btn" title="${window.I18n?.t("workflow.viewStatus") || "View status"}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
          <button class="btn btn-secondary btn-sm btn-warning stop-btn" title="${window.I18n?.t("common.stop") || "Stop"}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="6" y="6" width="12" height="12"></rect>
            </svg>
          </button>
          <button class="btn btn-secondary btn-sm reset-btn" title="Force Reset" style="color: var(--destructive, #ef4444);">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path>
            </svg>
          </button>
        `;
        actionsDiv.appendChild(runningBtns);
        const newEditBtn = runningBtns.querySelector(".edit-btn");
        newEditBtn?.addEventListener("click", async (e) => {
          e.stopPropagation();
          console.log("[WorkflowList] Running edit-btn clicked:", wfId);
          const wf = this.workflows.find((w) => w.wf_id === wfId);
          const isAdminView =
            wf?._is_admin_view ||
            (wf?.user?.id && wf.user.id !== window.authManager?.user?.id);
          if (
            wf &&
            !isAdminView &&
            window.ProjectHelper &&
            !(await window.ProjectHelper.isCurrentProjectLive(wf))
          ) {
            const action = await window.ProjectHelper.showCrossProjectWarning(
              wf,
              "workflow",
              {
                confirmTextKey: "project.openProject",
                confirmTextFallback: "Open project",
              },
            );
            if (action === "switch") {
              const pending = {
                wfId,
                projectId: wf.project_id,
                ts: Date.now(),
              };
              this._pendingOpenAfterSwitch = pending;
              setTimeout(() => {
                if (this._pendingOpenAfterSwitch === pending)
                  this._pendingOpenAfterSwitch = null;
              }, 3e4);
              window.ProjectHelper.navigateToProject(wf.project_id);
            }
            return;
          }
          this._openWorkflow(wfId, card);
        });
        const newStopBtn = runningBtns.querySelector(".stop-btn");
        newStopBtn?.addEventListener("click", (e) => {
          e.stopPropagation();
          const wf = this.workflows.find((w) => w.wf_id === wfId);
          const isAdminView =
            wf?._is_admin_view ||
            (wf?.user?.id && wf.user.id !== window.authManager?.user?.id);
          if (isAdminView) return;
          this.stopWorkflow(wfId);
        });
        const newResetBtn = runningBtns.querySelector(".reset-btn");
        newResetBtn?.addEventListener("click", (e) => {
          e.stopPropagation();
          const wf = this.workflows.find((w) => w.wf_id === wfId);
          const isAdminView =
            wf?._is_admin_view ||
            (wf?.user?.id && wf.user.id !== window.authManager?.user?.id);
          if (isAdminView) return;
          this.resetWorkflow(wfId);
        });
      } else if (runningBtns) {
        console.log(
          "[WorkflowList] Rebinding events for existing .wf-running-buttons",
          wfId,
        );
        const existingEditBtn = runningBtns.querySelector(".edit-btn");
        if (existingEditBtn && !existingEditBtn._bound) {
          existingEditBtn._bound = true;
          existingEditBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            console.log(
              "[WorkflowList] Running edit-btn clicked (rebound):",
              wfId,
            );
            const wf = this.workflows.find((w) => w.wf_id === wfId);
            const isAdminView =
              wf?._is_admin_view ||
              (wf?.user?.id && wf.user.id !== window.authManager?.user?.id);
            if (
              wf &&
              !isAdminView &&
              window.ProjectHelper &&
              !(await window.ProjectHelper.isCurrentProjectLive(wf))
            ) {
              const action = await window.ProjectHelper.showCrossProjectWarning(
                wf,
                "workflow",
                {
                  confirmTextKey: "project.openProject",
                  confirmTextFallback: "Open project",
                },
              );
              if (action === "switch") {
                const pending = {
                  wfId,
                  projectId: wf.project_id,
                  ts: Date.now(),
                };
                this._pendingOpenAfterSwitch = pending;
                setTimeout(() => {
                  if (this._pendingOpenAfterSwitch === pending)
                    this._pendingOpenAfterSwitch = null;
                }, 3e4);
                window.ProjectHelper.navigateToProject(wf.project_id);
              }
              return;
            }
            this._openWorkflow(wfId, card);
          });
        }
        const existingStopBtn = runningBtns.querySelector(".stop-btn");
        if (existingStopBtn && !existingStopBtn._bound) {
          existingStopBtn._bound = true;
          existingStopBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const wf = this.workflows.find((w) => w.wf_id === wfId);
            const isAdminView =
              wf?._is_admin_view ||
              (wf?.user?.id && wf.user.id !== window.authManager?.user?.id);
            if (isAdminView) return;
            this.stopWorkflow(wfId);
          });
        }
        const existingResetBtn = runningBtns.querySelector(".reset-btn");
        if (existingResetBtn && !existingResetBtn._bound) {
          existingResetBtn._bound = true;
          existingResetBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const wf = this.workflows.find((w) => w.wf_id === wfId);
            const isAdminView =
              wf?._is_admin_view ||
              (wf?.user?.id && wf.user.id !== window.authManager?.user?.id);
            if (isAdminView) return;
            this.resetWorkflow(wfId);
          });
        }
      }
      if (runningBtns) runningBtns.style.display = "flex";
      const toggleBtn = card.querySelector(".wf-toggle-btn");
      if (toggleBtn) toggleBtn.style.display = "none";
      if (stopBtn && !stopBtn.closest(".wf-running-buttons")) {
        stopBtn.classList.add("hidden");
      }
      let progressContainer = card.querySelector(".workflow-card-progress");
      if (!progressContainer) {
        progressContainer = document.createElement("div");
        progressContainer.className = "workflow-card-progress";
        progressContainer.innerHTML = `
          <div class="workflow-card-progress-bar">
            <div class="workflow-card-progress-bar-fill" style="width: 0%"></div>
          </div>
        `;
        card.appendChild(progressContainer);
      }
      progressContainer.classList.remove("hidden");
      let inlineProgress = card.querySelector(".workflow-card-inline-progress");
      if (!inlineProgress) {
        const metaRow = card.querySelector(".workflow-card-meta");
        if (metaRow) {
          inlineProgress = document.createElement("span");
          inlineProgress.className =
            "workflow-card-inline-progress indeterminate";
          inlineProgress.setAttribute("role", "progressbar");
          inlineProgress.innerHTML = `<span class="workflow-card-inline-progress-bar" style="width: 0%"></span>`;
          metaRow.appendChild(inlineProgress);
        }
      } else {
        inlineProgress.classList.add("indeterminate");
      }
      if (inlineProgress) inlineProgress.style.display = "";
    } else {
      const runningBtns = card.querySelector(".wf-running-buttons");
      if (runningBtns) runningBtns.style.display = "none";
      if (dropdownMenu) dropdownMenu.style.display = "";
      runBtn?.classList.remove("hidden");
      if (stopBtn && !stopBtn.closest(".wf-running-buttons")) {
        stopBtn.classList.add("hidden");
      }
      const toggleBtn = card.querySelector(".wf-toggle-btn");
      if (toggleBtn) toggleBtn.style.display = "";
      const progressContainer = card.querySelector(".workflow-card-progress");
      if (progressContainer) progressContainer.classList.add("hidden");
      const inlineProgress = card.querySelector(
        ".workflow-card-inline-progress",
      );
      if (inlineProgress) inlineProgress.style.display = "none";
      const metaEl = card.querySelector(".workflow-card-meta");
      if (metaEl) {
        const currentText = metaEl.textContent || "";
        const nodeMatch = currentText.match(/^(\d+)\s*nodes?/);
        if (nodeMatch) {
          const nodeCount = nodeMatch[1];
          metaEl.innerHTML = `<svg class="workflow-card-node-icon" width="12" height="12" viewBox="0 0 16 16" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M6.17 3.646a.5.5 0 0 1 .707 0l5.477 5.477a.5.5 0 0 1 0 .707l-1.366 1.366a4.373 4.373 0 1 1-6.184-6.184L6.17 3.646Zm.353 1.061L5.508 5.723 5.5 5.73a3.373 3.373 0 1 0 4.77 4.77l.006-.008 1.016-1.015-4.77-4.77Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M5.354 10.646a.5.5 0 0 1 0 .707L3.02 13.688a.5.5 0 1 1-.707-.707l2.334-2.334a.5.5 0 0 1 .707 0ZM10.354 2.313a.5.5 0 0 1 0 .707L8.02 5.354a.5.5 0 0 1-.707-.708l2.334-2.333a.5.5 0 0 1 .707 0ZM13.687 5.646a.5.5 0 0 1 0 .708l-2.333 2.333a.5.5 0 1 1-.707-.707l2.333-2.334a.5.5 0 0 1 .707 0Z" fill="currentColor"/></svg>${nodeCount} nodes`;
        }
      }
    }
  }
  _debouncedUpdateSingleWorkflow(wfId) {
    if (!wfId) return;
    console.log("[WorkflowList] _debouncedUpdateSingleWorkflow called:", wfId);
    this._lastUpdatedWfId = wfId;
    const key = `_updateTimer_${wfId}`;
    if (this[key]) clearTimeout(this[key]);
    this[key] = setTimeout(() => {
      this[key] = null;
      this._updateSingleWorkflowInList(wfId);
    }, 500);
  }
  _bindToolbarEvents() {
    const searchToggle = this.container.querySelector("#wfSearchToggle");
    const searchRow = this.container.querySelector("#wfSearchRow");
    const searchInput = this.container.querySelector("#wfSearchInput");
    const searchClose = this.container.querySelector("#wfSearchClose");
    const closeSearch = () => {
      searchRow?.classList.add("hidden");
      if (searchInput) searchInput.value = "";
      this._searchQuery = "";
      this._currentPage = 1;
      this.render();
    };
    if (searchToggle && searchRow) {
      searchToggle.addEventListener("click", () => {
        const isHidden = searchRow.classList.contains("hidden");
        if (isHidden) {
          searchRow.classList.remove("hidden");
          searchInput?.focus();
        } else closeSearch();
      });
    }
    if (searchClose && searchRow) {
      searchClose.addEventListener("click", closeSearch);
    }
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this._searchQuery = e.target.value.toLowerCase();
        this._currentPage = 1;
        this.render();
      });
    }
    const handleCreate = async () => {
      if (await window.SystemConfig?.getBoolReady?.("workflow_web_mode")) {
        chrome.runtime.sendMessage(
          { action: "openWebSpaces", createNew: true },
          (resp) => {
            void chrome.runtime.lastError;
            if (!resp?.ok)
              window.showNotification?.(
                window.I18n?.t("workflow.openWebFailed") ||
                  "Could not open web editor",
                "error",
              );
          },
        );
        return;
      }
      if (window.featureGate) {
        const canCreate = await window.featureGate.canCreateWorkflowAsync();
        if (!canCreate) {
          const isLoggedIn = window.authManager?.isLoggedIn();
          if (!isLoggedIn) {
            window.featureGate.showLoginPrompt(
              window.I18n?.t("workflow.requireLoginToCreate") ||
                "Login required to create workflows",
            );
          } else {
            const quota = window.featureGate.checkQuota("workflows_max");
            console.log("[WorkflowList] Workflow quota exceeded:", quota);
            const shouldUpgrade = await window.customDialog?.confirm(
              window.I18n?.t("workflow.quotaLimitReached", {
                limit: quota.limit,
                used: quota.used,
              }) ||
                `Your plan allows a maximum of ${quota.limit} workflows. You already have ${quota.used} workflows. Upgrade to Premium to create unlimited workflows.`,
              {
                title:
                  window.I18n?.t("workflow.quotaLimitTitle") || "Limit reached",
                type: "warning",
                confirmText: window.I18n?.t("common.upgrade") || "Upgrade",
                cancelText: window.I18n?.t("common.later") || "Later",
              },
            );
            if (
              shouldUpgrade &&
              typeof window.openUpgradeModal === "function"
            ) {
              window.openUpgradeModal();
            }
          }
          return;
        }
      }
      if (window.eventBus)
        window.eventBus.emit("workflow:open_editor", { mode: "create" });
    };
    const createBtn = this.container.querySelector("#createWorkflowBtn");
    const createFirstBtn = this.container.querySelector(
      "#createFirstWorkflowBtn",
    );
    createBtn?.addEventListener("click", handleCreate);
    createFirstBtn?.addEventListener("click", handleCreate);
    const refreshBtn = this.container.querySelector("#refreshWorkflowsBtn");
    refreshBtn?.addEventListener("click", () => {
      this.loadWorkflows(false, { forceShowLoading: true, forceRender: true });
    });
    const runAllBtn = this.container.querySelector("#runAllWorkflowsBtn");
    runAllBtn?.addEventListener("click", () => {
      if (this.isRunningAll) {
        this.stopAllWorkflows();
      } else {
        this.runAllWorkflows();
      }
    });
    const importBtn = this.container.querySelector("#importWorkflowBtn");
    importBtn?.addEventListener("click", () => this._handleImportClick());
  }
  async loadWorkflows(append = false, options = {}) {
    const { forceShowLoading = false, forceRender = false } = options;
    if (
      (window.workflowExecutor?.isRunning || this._executionCooldown) &&
      this._lastUpdatedWfId &&
      !append
    ) {
      console.log(
        "[WorkflowList] BLOCKED loadWorkflows - executor running or cooldown",
      );
      return;
    }
    if (this._loading) {
      this._loadPending = true;
      return;
    }
    if (this._loadDebounceTimer) {
      clearTimeout(this._loadDebounceTimer);
    }
    this._loadDebounceTimer = setTimeout(() => {
      this._loadDebounceTimer = null;
    }, 100);
    this._loading = true;
    this._loadPending = false;
    try {
      if (!append) {
        if (!this._lastRenderSignature || forceShowLoading) this.showLoading();
        this._currentPage = 1;
      }
      if (
        window.authManager?.isLoggedIn() &&
        window.storageManager?.getMode?.() === "local"
      ) {
        try {
          await window.storageManager.switchToApi();
        } catch (e) {
          console.warn("[WorkflowList] switchToApi failed:", e.message);
        }
      }
      if (window.storageManager) {
        const page = append ? this._currentPage + 1 : 1;
        const result = await window.storageManager.getWorkflows({
          page,
          per_page: this._pageSize,
          platform: "flow",
        });
        const newWorkflows = (result.data || []).filter(
          (w) => !w.platform || w.platform === "flow",
        );
        if (append) {
          this.workflows = [...this.workflows, ...newWorkflows];
        } else {
          this.workflows = newWorkflows;
        }
        this._currentPage = result.meta?.current_page || page;
        this._lastPage = result.meta?.last_page || 1;
        this._total = result.meta?.total || this.workflows.length;
        const newSignature =
          `${this._total}:${this._currentPage}/${this._lastPage}:` +
          this.workflows
            .map(
              (w) =>
                `${w.wf_id}|${w.name || w.wf_name}|${w.updated_at || ""}|${w.status || ""}|${w.project_id || ""}|${w.project_name || ""}`,
            )
            .join(",");
        if (
          !append &&
          !forceRender &&
          this._lastRenderSignature === newSignature
        ) {
          this._lastLoadTime = Date.now();
        } else {
          this._lastRenderSignature = newSignature;
          console.log(
            "[WorkflowList] Loaded page",
            this._currentPage,
            "/",
            this._lastPage,
            "- total:",
            this._total,
          );
          await this._cacheProjectNames();
          try {
            const editorRevision = this._editorStateRevision || 0;
            const resp = await chrome.runtime.sendMessage({
              action: "getEditingWorkflowId",
            });
            if (editorRevision === (this._editorStateRevision || 0)) {
              this._editingWfId = resp?.editingWorkflowId || null;
            }
          } catch (e) {
            this._editingWfId = null;
          }
          this.renderWorkflowList();
        }
      }
    } catch (error) {
      if (error?.code === "RATE_LIMITED" || error?.httpStatus === 429) {
        const retryAfter = Number(error.retryAfter) || 60;
        console.warn(
          "[WorkflowList] Rate limited, gi\u1EEF data c\u0169, retry sau",
          retryAfter,
          "s",
        );
        this._showRateLimitBanner(retryAfter);
        this.renderWorkflowList();
      } else {
        console.error("[WorkflowList] Load failed:", error);
        this.showError(
          window.I18n?.t("workflow.loadFailed") ||
            "Failed to load workflow list",
        );
      }
    } finally {
      this._loading = false;
      if (this._loadPending) {
        this._loadPending = false;
        setTimeout(() => this.loadWorkflows(), 50);
      }
    }
  }
  _showRateLimitBanner(retryAfter) {
    let banner = this.container.querySelector(".wf-rate-limit-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "wf-rate-limit-banner";
      const listSection =
        this.container.querySelector("#workflowListSection") || this.container;
      listSection.prepend(banner);
    }
    banner.style.display = "flex";
    const clockIcon = `<svg class="wf-rate-limit-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    const tBase =
      window.I18n?.t?.("workflow.rateLimitedBanner") ||
      "Your plan is currently rate limited. Retrying automatically in {seconds}s...";
    let remaining = retryAfter;
    const update = () => {
      const text = tBase.replace(
        "{seconds}",
        `<span class="wf-rate-limit-countdown">${remaining}</span>`,
      );
      banner.innerHTML = `${clockIcon}<span class="wf-rate-limit-text">${text}</span>`;
    };
    update();
    if (this._rateLimitTimer) clearInterval(this._rateLimitTimer);
    if (this._rateLimitRetryTimer) clearTimeout(this._rateLimitRetryTimer);
    this._rateLimitTimer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(this._rateLimitTimer);
        this._rateLimitTimer = null;
        banner.style.display = "none";
      } else {
        update();
      }
    }, 1e3);
    this._rateLimitRetryTimer = setTimeout(() => {
      this._rateLimitRetryTimer = null;
      this.loadWorkflows();
    }, retryAfter * 1e3);
  }
  async loadSharedWorkflows() {
    if (!window.authManager?.isLoggedIn()) {
      this._sharedWorkflows = [];
      return;
    }
    try {
      const baseUrl = window.ApiBaseConfig.get();
      const token = await window.authManager.getToken();
      const response = await fetch(`${baseUrl}/workflows/shared-with-me`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Extension-Id": chrome.runtime.id,
        },
      });
      if (!response.ok) {
        this._sharedWorkflows = [];
        return;
      }
      const json = await response.json();
      let items = [];
      if (Array.isArray(json)) {
        items = json;
      } else if (Array.isArray(json?.data?.workflows)) {
        items = json.data.workflows;
      } else if (Array.isArray(json?.workflows)) {
        items = json.workflows;
      } else if (Array.isArray(json?.data)) {
        items = json.data;
      }
      this._sharedWorkflows = items.map((item) => {
        const wf = item.workflow || item;
        return {
          ...wf,
          _is_shared_view: true,
          _share_id: item._share_id || item.id,
          sharer_name:
            item._sharer_name || item.sharer?.name || item.sharer_name,
          sharer_email: item._sharer_email || item.sharer?.email,
          shared_at: item._shared_at || item.accepted_at || item.shared_at,
        };
      });
      if (this._sharedWorkflows.length > 0) {
        console.log(
          "[WorkflowList] Loaded",
          this._sharedWorkflows.length,
          "shared workflows",
        );
      }
      this._updateSharedTabBadge();
      const rootContainer = this.container.closest("#tab-workflow") || document;
      const sharedContent = rootContainer.querySelector(
        '[data-content="shared"]',
      );
      if (sharedContent && sharedContent.style.display !== "none") {
        this.renderSharedTab(sharedContent);
      }
    } catch (error) {
      console.warn("[WorkflowList] loadSharedWorkflows failed:", error.message);
      this._sharedWorkflows = [];
      this._updateSharedTabBadge();
    }
  }
  async render() {
    const listContainer = this.container.querySelector("#workflowList");
    const emptyState = this.container.querySelector("#workflowEmptyState");
    const runAllBtn = this.container.querySelector("#runAllWorkflowsBtn");
    if (runAllBtn) {
      runAllBtn.classList.toggle("hidden", this.workflows.length === 0);
    }
    if (!listContainer) return;
    const inlineSelect = this.container.querySelector("#wfProjectSelectInline");
    await this._renderProjectFilter();
    if (this._searchQuery) {
      this.container.querySelector("#wfSearchRow")?.classList.remove("hidden");
      const input = this.container.querySelector("#wfSearchInput");
      if (input && input.value.toLowerCase() !== this._searchQuery)
        input.value = this._searchQuery;
    }
    let displayWorkflows = this.workflows;
    if (this._filterProjectId) {
      if (this._filterProjectId === "__legacy__") {
        displayWorkflows = this.workflows.filter((w) => !w.project_id);
      } else {
        displayWorkflows = this.workflows.filter(
          (w) => w.project_id === this._filterProjectId,
        );
      }
    }
    if (this._searchQuery) {
      displayWorkflows = displayWorkflows.filter(
        (w) =>
          w.wf_name?.toLowerCase().includes(this._searchQuery) ||
          w.wf_id?.toLowerCase().includes(this._searchQuery),
      );
    }
    if (this.workflows.length === 0) {
      listContainer.innerHTML = "";
      listContainer.classList.add("hidden");
      if (inlineSelect) inlineSelect.classList.add("hidden");
      emptyState?.classList.remove("hidden");
      return;
    }
    if (displayWorkflows.length === 0) {
      listContainer.innerHTML = this._searchQuery
        ? `<div class="workflow-empty-state"><p>${window.I18n?.t("workflow.notFound") || "No workflows found"}</p></div>`
        : "";
      listContainer.classList.toggle("hidden", !this._searchQuery);
      if (!this._searchQuery) emptyState?.classList.remove("hidden");
      return;
    }
    emptyState?.classList.add("hidden");
    listContainer.classList.remove("hidden");
    const currentUserId = window.authManager?.user?.id;
    const legacyWorkflows = this.workflows.filter((w) => {
      if (w.project_id) return false;
      if (w.user?.id && currentUserId) return w.user.id === currentUserId;
      return true;
    });
    const migrationBanner =
      window.ProjectHelper?.renderMigrationBanner?.(
        legacyWorkflows.length,
        "workflow",
      ) || "";
    const visibleWorkflows = displayWorkflows;
    const hasMore = this._currentPage < this._lastPage;
    const remaining = this._total - this.workflows.length;
    if (!this._filterProjectId && window.ProjectHelper) {
      const grouped = await window.ProjectHelper.sortByProjectGroup(
        visibleWorkflows,
        window._currentProjectId,
      );
      let html = migrationBanner;
      for (const entry of grouped) {
        if (entry.type === "header") {
          html += window.ProjectHelper.renderGroupHeader(
            entry.projectName,
            entry.count,
            entry.isCurrent,
          );
        } else {
          html += this.renderWorkflowCard(entry.item);
        }
      }
      listContainer.innerHTML = html;
    } else {
      const sorted = [...visibleWorkflows].sort((a, b) => {
        if (a.sort_order !== void 0 && b.sort_order !== void 0) {
          return a.sort_order - b.sort_order;
        }
        const tsA = parseInt((a.wf_id || "").replace("wf_", "")) || 0;
        const tsB = parseInt((b.wf_id || "").replace("wf_", "")) || 0;
        return tsA - tsB;
      });
      listContainer.innerHTML =
        migrationBanner +
        sorted.map((wf) => this.renderWorkflowCard(wf)).join("");
    }
    listContainer
      .querySelector('.legacy-migrate-banner[data-type="workflow"]')
      ?.addEventListener("click", async (e) => {
        const btn = e.target.closest(".legacy-migrate-btn");
        if (!btn) return;
        const action = btn.dataset.action;
        if (action === "skip") {
          sessionStorage.setItem("legacy_migrate_workflow_dismissed", "1");
          this.render();
        } else if (action === "assign") {
          const count = await window.ProjectHelper.migrateLegacyItems(
            legacyWorkflows,
            "workflow",
          );
          if (count > 0) {
            window.showNotification?.(
              window.I18n?.t("project.migrateSuccess", { count }) ||
                `Assigned ${count} items to the current project`,
              "success",
              2500,
            );
            await this.loadWorkflows();
          }
        }
      });
    if (hasMore) {
      const loadMoreLabel = window.I18n?.t("common.loadMore") || "Load more";
      listContainer.insertAdjacentHTML(
        "beforeend",
        `
        <div class="tobyflow-load-more-row">
          <button class="tobyflow-load-more-btn" id="wfLoadMoreBtn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            ${loadMoreLabel}
            <span class="tobyflow-load-more-count">${this.workflows.length} / ${this._total}</span>
          </button>
        </div>
      `,
      );
      listContainer
        .querySelector("#wfLoadMoreBtn")
        ?.addEventListener("click", () => {
          if (!this._loading) {
            this.loadWorkflows(true);
          }
        });
    }
    listContainer.querySelectorAll(".workflow-card").forEach((card) => {
      const wfId = card.dataset.wfId;
      const toggleBtn = card.querySelector(".wf-toggle-btn");
      if (toggleBtn) {
        toggleBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const wf = this.workflows.find((w) => w.wf_id === wfId);
          const isAdminView =
            wf?._is_admin_view ||
            (wf?.user?.id && wf.user.id !== window.authManager?.user?.id);
          if (isAdminView) return;
          this.toggleWorkflowEnabled(wfId);
        });
      }
      const dotMenu = card.querySelector(".tobyflow-dot-menu");
      if (dotMenu) {
        const menuBtn = dotMenu.querySelector(".tobyflow-dot-menu-btn");
        const dropdown = dotMenu.querySelector(".tobyflow-dropdown-menu");
        menuBtn?.addEventListener("click", (e) => {
          e.stopPropagation();
          console.log(
            "[WorkflowList] Menu button clicked:",
            wfId,
            "dropdown:",
            dropdown,
            "wasHidden:",
            dropdown?.classList.contains("hidden"),
          );
          const wasHidden = dropdown?.classList.contains("hidden");
          this._closeAllDropdowns(listContainer);
          if (dropdown && wasHidden) {
            dropdown.classList.remove("hidden");
            this._positionDropdown(menuBtn, dropdown);
            setTimeout(() => {
              document.addEventListener(
                "click",
                () => this._closeAllDropdowns(listContainer),
                { once: true },
              );
            }, 0);
          }
        });
      }
      const editBtn = card.querySelector(".edit-btn");
      editBtn?.addEventListener("click", async (e) => {
        e.stopPropagation();
        this._closeAllDropdowns(listContainer);
        const wf = this.workflows.find((w) => w.wf_id === wfId);
        const isAdminView =
          wf?._is_admin_view ||
          (wf?.user?.id && wf.user.id !== window.authManager?.user?.id);
        if (
          wf &&
          !isAdminView &&
          window.ProjectHelper &&
          !(await window.ProjectHelper.isCurrentProjectLive(wf))
        ) {
          const action = await window.ProjectHelper.showCrossProjectWarning(
            wf,
            "workflow",
            {
              confirmTextKey: "project.openProject",
              confirmTextFallback: "Open project",
            },
          );
          if (action === "switch") {
            const pending = { wfId, projectId: wf.project_id, ts: Date.now() };
            this._pendingOpenAfterSwitch = pending;
            setTimeout(() => {
              if (this._pendingOpenAfterSwitch === pending) {
                console.log(
                  "[WorkflowList] Pending auto-open expired (30s):",
                  wfId,
                );
                this._pendingOpenAfterSwitch = null;
              }
            }, 3e4);
            window.ProjectHelper.navigateToProject(wf.project_id);
          }
          return;
        }
        this._openWorkflow(wfId, card);
      });
      const nameEl = card.querySelector(".workflow-card-name");
      if (nameEl && editBtn) {
        nameEl.setAttribute("role", "button");
        nameEl.setAttribute("tabindex", "0");
        const openFromName = (event) => {
          event.preventDefault();
          event.stopPropagation();
          card.querySelector(".edit-btn")?.click();
        };
        nameEl.addEventListener("click", openFromName);
        nameEl.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") openFromName(event);
        });
      }
      const copyBtn = card.querySelector(".copy-btn");
      copyBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        this._closeAllDropdowns(listContainer);
        this.cloneWorkflow(wfId);
      });
      const runBtn = card.querySelector(".run-btn");
      runBtn?.addEventListener("click", async (e) => {
        e.stopPropagation();
        this._closeAllDropdowns(listContainer);
        const wf = this.workflows.find((w) => w.wf_id === wfId);
        const isAdminView =
          wf?._is_admin_view ||
          (wf?.user?.id && wf.user.id !== window.authManager?.user?.id);
        if (
          wf &&
          !isAdminView &&
          window.ProjectHelper &&
          !(await window.ProjectHelper.isCurrentProjectLive(wf))
        ) {
          const action = await window.ProjectHelper.showCrossProjectWarning(
            wf,
            "workflow",
          );
          if (action === "switch")
            window.ProjectHelper.navigateToProject(wf.project_id);
          return;
        }
        this.runWorkflow(wfId);
      });
      const stopBtn = card.querySelector(".stop-btn");
      stopBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        const wf = this.workflows.find((w) => w.wf_id === wfId);
        const isAdminView =
          wf?._is_admin_view ||
          (wf?.user?.id && wf.user.id !== window.authManager?.user?.id);
        if (isAdminView) return;
        this.stopWorkflow(wfId);
      });
      const resetBtn = card.querySelector(".reset-btn");
      resetBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        this._closeAllDropdowns(listContainer);
        const wf = this.workflows.find((w) => w.wf_id === wfId);
        const isAdminView =
          wf?._is_admin_view ||
          (wf?.user?.id && wf.user.id !== window.authManager?.user?.id);
        if (isAdminView) return;
        this.resetWorkflow(wfId);
      });
      const exportBtn = card.querySelector(".export-btn");
      exportBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        this._closeAllDropdowns(listContainer);
        this.exportWorkflow(wfId);
      });
      const deleteBtn = card.querySelector(".delete-btn");
      deleteBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        this._closeAllDropdowns(listContainer);
        this.deleteWorkflow(wfId);
      });
    });
    listContainer.querySelectorAll(".share-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const wfId = btn.closest(".workflow-card")?.dataset.wfId;
        if (wfId) {
          this._closeAllDropdowns(listContainer);
          this.handleShare(wfId);
        }
      });
    });
    listContainer.querySelectorAll(".publish-template-btn").forEach((btn) => {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const wfId = btn.closest(".workflow-card")?.dataset.wfId;
        if (wfId) {
          this._closeAllDropdowns(listContainer);
          this.publishAsTemplate(wfId);
        }
      });
    });
    if (window.CreatorTemplatePublish?.isEligible) {
      window.CreatorTemplatePublish.isEligible()
        .then((ok) => {
          if (ok)
            listContainer
              .querySelectorAll(".publish-template-btn")
              .forEach((b) => b.classList.remove("hidden"));
        })
        .catch(() => {});
    }
  }
  renderWorkflowList() {
    this.render();
    this._updateSharedTabBadge();
  }
  _updateSharedTabBadge() {
    const rootContainer = this.container.closest("#tab-workflow") || document;
    const badge = rootContainer.querySelector("[data-shared-count]");
    if (!badge) return;
    const count = this._sharedWorkflows?.length || 0;
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = "";
    } else {
      badge.style.display = "none";
    }
  }
  renderSharedTab(container) {
    if (!container) return;
    const t = (key, params) => window.I18n?.t(key, params) || key;
    this._updateSharedTabBadge();
    if (!this._sharedWorkflows || this._sharedWorkflows.length === 0) {
      container.innerHTML = `
        <div class="workflow-empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
            <polyline points="16 6 12 2 8 6"/>
            <line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
          <p>${t("workflow.sharedEmpty", "No workflows have been shared with you yet")}</p>
        </div>
      `;
      return;
    }
    const cards = this._sharedWorkflows
      .map((wf) => this._renderSharedWorkflowCard(wf))
      .join("");
    container.innerHTML = `
      <div class="workflow-list-container" style="overflow-y: auto; flex: 1; padding: 8px;">
        <div class="workflow-list">${cards}</div>
      </div>
    `;
    const listEl = container.querySelector(".workflow-list");
    if (listEl) this._bindSharedCardEvents(listEl);
  }
  _renderSharedSection() {
    this._updateSharedTabBadge();
    return;
    const listContainer = this.container.querySelector("#workflowList");
    if (!listContainer) return;
    const existingSection = listContainer.querySelector(
      ".shared-workflows-section",
    );
    if (existingSection) existingSection.remove();
    if (!this._sharedWorkflows || this._sharedWorkflows.length === 0) return;
    const t = (key, params) => window.I18n?.t(key, params) || key;
    const sectionHtml = `
      <div class="shared-workflows-section">
        <div class="shared-workflows-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline>
            <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
          </svg>
          <span>${t("workflow.sharedWithMe") || "Shared with me"}</span>
          <span class="shared-workflows-count">(${this._sharedWorkflows.length})</span>
        </div>
        <div class="shared-workflows-list">
          ${this._sharedWorkflows.map((wf) => this._renderSharedWorkflowCard(wf)).join("")}
        </div>
      </div>
    `;
    listContainer.insertAdjacentHTML("beforeend", sectionHtml);
    this._bindSharedCardEvents(listContainer);
  }
  _renderSharedWorkflowCard(workflow) {
    const statusClass = "completed";
    const nodeCount = workflow.nodes?.length ?? workflow.nodes_count ?? 0;
    const sharerName =
      workflow.sharer_name || workflow.shared_by_name || "User";
    const sharedTime = this._formatSharedTime(workflow.shared_at);
    return `
      <div class="workflow-card" data-wf-id="${workflow.wf_id}" data-shared="true">
        <div style="display: flex; align-items: center; flex: 1; min-width: 0; gap: 10px;">
          <span class="workflow-card-status ${statusClass}" data-tooltip="${WorkflowList._renderStatusLabel(statusClass)}">${WorkflowList._renderStatusIcon(statusClass)}</span>
          <div class="workflow-card-info">
            <div class="workflow-card-name-row">
              <span class="workflow-card-name">${this.escapeHtml(workflow.wf_name || window.I18n?.t("workflow.unnamed") || "Unnamed workflow")}</span>
            </div>
            <div class="workflow-card-meta">
              ${nodeCount} nodes \xB7 ${window.I18n?.t("workflow.fromSharer", { name: this.escapeHtml(sharerName) }) || `From ${this.escapeHtml(sharerName)}`}
            </div>
            ${sharedTime ? `<div class="workflow-card-meta" style="opacity: 0.7; font-size: 11px;">${window.I18n?.t("workflow.acceptedAt", "Accepted")} ${sharedTime}</div>` : ""}
          </div>
        </div>
        <div class="workflow-card-actions">
          <button class="btn btn-secondary btn-sm view-shared-quick-btn" title="${window.I18n?.t("workflow.view") || "Xem"}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
          <div class="tobyflow-dot-menu" data-wf-id="${workflow.wf_id}">
            <button class="btn btn-secondary btn-sm tobyflow-dot-menu-btn" title="Menu">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="5" r="1"></circle>
                <circle cx="12" cy="12" r="1"></circle>
                <circle cx="12" cy="19" r="1"></circle>
              </svg>
            </button>
            <div class="tobyflow-dropdown-menu hidden">
              <button class="tobyflow-dropdown-item view-shared-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
                ${window.I18n?.t("workflow.view") || "Xem"}
              </button>
              <button class="tobyflow-dropdown-item duplicate-shared-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                ${window.I18n?.t("workflow.useWorkflow") || "Use Workflow"}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  _bindSharedCardEvents(listContainer) {
    const sharedCards = listContainer.querySelectorAll(
      '.workflow-card[data-shared="true"]',
    );
    sharedCards.forEach((card) => {
      const wfId = card.dataset.wfId;
      const dotMenu = card.querySelector(".tobyflow-dot-menu");
      if (dotMenu) {
        const menuBtn = dotMenu.querySelector(".tobyflow-dot-menu-btn");
        const dropdown = dotMenu.querySelector(".tobyflow-dropdown-menu");
        menuBtn?.addEventListener("click", (e) => {
          e.stopPropagation();
          const wasHidden = dropdown?.classList.contains("hidden");
          this._closeAllDropdowns(listContainer);
          if (dropdown && wasHidden) {
            dropdown.classList.remove("hidden");
            this._positionDropdown(menuBtn, dropdown);
            setTimeout(() => {
              document.addEventListener(
                "click",
                () => this._closeAllDropdowns(listContainer),
                { once: true },
              );
            }, 0);
          }
        });
      }
      const viewBtn = card.querySelector(".view-shared-btn");
      viewBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        this._closeAllDropdowns(listContainer);
        this._viewSharedWorkflow(wfId);
      });
      const viewQuickBtn = card.querySelector(".view-shared-quick-btn");
      viewQuickBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        this._closeAllDropdowns(listContainer);
        this._viewSharedWorkflow(wfId);
      });
      const duplicateBtn = card.querySelector(".duplicate-shared-btn");
      duplicateBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        this._closeAllDropdowns(listContainer);
        this.handleDuplicateFromShared(wfId);
      });
    });
  }
  async _viewSharedWorkflow(wfId) {
    const workflow = this._sharedWorkflows.find((w) => w.wf_id === wfId);
    if (!workflow) return;
    try {
      chrome.runtime.sendMessage(
        {
          action: "openWorkflowTemplatePreview",
          template: workflow,
          kind: "shared",
        },
        () => void chrome.runtime.lastError,
      );
    } catch (e) {
      console.error(
        "[WorkflowList] open lite shared preview failed:",
        e?.message,
      );
    }
  }
  async _reorderWorkflows(fromId, toId, listContainer) {
    const cards = [...listContainer.querySelectorAll(".workflow-card")];
    const orderedIds = cards.map((c) => c.dataset.wfId);
    const fromIdx = orderedIds.indexOf(fromId);
    const toIdx = orderedIds.indexOf(toId);
    if (fromIdx === -1 || toIdx === -1) return;
    orderedIds.splice(fromIdx, 1);
    orderedIds.splice(toIdx, 0, fromId);
    for (let i = 0; i < orderedIds.length; i++) {
      const wf = this.workflows.find((w) => w.wf_id === orderedIds[i]);
      if (wf) wf.sort_order = i;
    }
    if (window.storageManager) {
      try {
        for (const wf of this.workflows) {
          await window.storageManager.saveWorkflow(wf);
        }
      } catch (e) {
        console.error("[WorkflowList] Reorder save failed:", e);
      }
    }
    this.render();
  }
  renderWorkflowCard(workflow, runningOverride = null) {
    const hasPendingOverride =
      this._stoppedWfIds?.has(workflow.wf_id) ||
      this._resetPendingWfIds?.has(workflow.wf_id);
    if (hasPendingOverride) {
      console.log(
        "[WorkflowList] renderWorkflowCard: forcing pending after stop/reset:",
        workflow.wf_id,
      );
    }
    const statusClass = hasPendingOverride
      ? "pending"
      : workflow.status || "idle";
    const nodeCount = workflow.progress_total || 0;
    const completedCount = workflow.progress_completed || 0;
    const progress =
      nodeCount > 0 ? Math.round((completedCount / nodeCount) * 100) : 0;
    const isEditing = this._editingWfId === workflow.wf_id;
    const isRunning =
      runningOverride ?? this._isWfRunning(workflow.wf_id, workflow.status);
    const isEnabled = workflow.enabled !== false;
    const canDelete = !isRunning && !isEditing;
    const isCurrent =
      window.ProjectHelper?.isCurrentProject(workflow) !== false;
    const projectLabel =
      workflow.project_id && !this._filterProjectId
        ? window.ProjectHelper?.renderProjectLabel(
            workflow.project_id,
            this._projectNames[workflow.project_id] || "",
            isCurrent,
          ) || ""
        : "";
    const crossProjectClass = !isCurrent ? "cross-project" : "";
    const currentUserId = window.authManager?.user?.id;
    const workflowOwnerId = workflow.user_id || workflow.user?.id;
    const isAdminViewing = !!(
      workflowOwnerId &&
      currentUserId &&
      workflowOwnerId !== currentUserId
    );
    const ownerHtml =
      isAdminViewing && workflow.user
        ? `<div class="workflow-card-owner" title="${window.I18n?.t("workflow.owner") || "Owner"}: ${this.escapeHtml(workflow.user.email || "")}"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>${this.escapeHtml(workflow.user.name || workflow.user.email || "User " + workflow.user.id)}</div>`
        : isAdminViewing
          ? `<div class="workflow-card-owner"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>User #${workflowOwnerId}</div>`
          : "";
    const lastRunHtml = workflow.last_run_at
      ? `<div class="workflow-card-last-run" title="${window.I18n?.t("workflow.lastRun") || "Last run"}"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>${this._formatRelativeTime(workflow.last_run_at)}</div>`
      : "";
    const lastEditHtml = workflow.updated_at
      ? `<div class="workflow-card-last-edit" title="${window.I18n?.t("workflow.lastEdit") || "Last edited"}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g fill="currentColor"><path d="M9.624 2.34a10.5 10.5 0 0 1 7.195.518A10.46 10.46 0 0 1 21.982 7.9a10.5 10.5 0 0 1 .697 7.172c-.62 2.402-2.08 4.5-4.1 5.935a10.48 10.48 0 0 1-6.963 1.891 10.52 10.52 0 0 1-6.533-3.039 1 1 0 0 1 1.414-1.414 8.52 8.52 0 0 0 5.288 2.46 8.48 8.48 0 0 0 5.636-1.528 8.52 8.52 0 0 0 3.321-4.805 8.5 8.5 0 0 0-.564-5.807v-.002A8.46 8.46 0 0 0 16 4.684a8.5 8.5 0 0 0-5.825-.422A8.53 8.53 0 0 0 5.45 7.699h-.001a8.6 8.6 0 0 0-1.377 3.66l.51-.61a1 1 0 0 1 1.535 1.282l-2.18 2.61a1 1 0 0 1-1.536-.001l-2.17-2.61a1 1 0 0 1 1.537-1.28l.318.383a10.6 10.6 0 0 1 1.703-4.548v-.002A10.53 10.53 0 0 1 9.625 2.34"></path><path d="M12 8.401a1 1 0 0 1 1 1v3.55l2.535 1.606a1 1 0 0 1-1.07 1.689l-3-1.9a1 1 0 0 1-.465-.845V9.4a1 1 0 0 1 1-1"></path></g></svg>${this._formatRelativeTime(workflow.updated_at)}</div>`
      : "";
    const isPending = this._pendingWfIds?.has(workflow.wf_id) && !isRunning;
    const runningClass = isRunning ? "running" : isPending ? "pending" : "";
    const displayStatus = isRunning ? "running" : statusClass;
    const sharesHtml = this._renderSharedUsersAvatars(workflow.shares || []);
    return `
      <div class="workflow-card ${displayStatus} ${runningClass} ${isEditing ? "editing" : ""} ${!isEnabled ? "wf-disabled" : ""} ${crossProjectClass}" data-wf-id="${workflow.wf_id}">
        <span class="workflow-card-status ${displayStatus}" data-tooltip="${WorkflowList._renderStatusLabel(displayStatus)}" aria-label="${WorkflowList._renderStatusLabel(displayStatus)}">${WorkflowList._renderStatusIcon(displayStatus)}</span>
        <div style="display: flex; align-items: center; flex: 1; min-width: 0;">
          <div class="workflow-card-info">
            <div class="workflow-card-name-row">
              <span class="workflow-card-name">${this.escapeHtml(workflow.wf_name || window.I18n?.t("workflow.unnamed") || "Unnamed workflow")}</span>
            </div>
            <div class="workflow-card-meta">
              <svg class="workflow-card-node-icon" width="12" height="12" viewBox="0 0 16 16" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M6.17 3.646a.5.5 0 0 1 .707 0l5.477 5.477a.5.5 0 0 1 0 .707l-1.366 1.366a4.373 4.373 0 1 1-6.184-6.184L6.17 3.646Zm.353 1.061L5.508 5.723 5.5 5.73a3.373 3.373 0 1 0 4.77 4.77l.006-.008 1.016-1.015-4.77-4.77Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M5.354 10.646a.5.5 0 0 1 0 .707L3.02 13.688a.5.5 0 1 1-.707-.707l2.334-2.334a.5.5 0 0 1 .707 0ZM10.354 2.313a.5.5 0 0 1 0 .707L8.02 5.354a.5.5 0 0 1-.707-.708l2.334-2.333a.5.5 0 0 1 .707 0ZM13.687 5.646a.5.5 0 0 1 0 .708l-2.333 2.333a.5.5 0 1 1-.707-.707l2.333-2.334a.5.5 0 0 1 .707 0Z" fill="currentColor"/></svg>
              ${nodeCount} nodes${isRunning ? ` - ${progress}%` : ""}${isEditing ? " - Editing" : ""}
              ${isRunning ? `<span class="workflow-card-inline-progress${progress > 0 ? "" : " indeterminate"}" role="progressbar"><span class="workflow-card-inline-progress-bar" style="width: ${progress}%"></span></span>` : ""}
            </div>
            ${ownerHtml}
            <div class="workflow-card-time-row">
              ${lastRunHtml || lastEditHtml}
              ${sharesHtml}
            </div>
          </div>
        </div>
        <div class="workflow-card-actions">
          ${
            !isAdminViewing
              ? `
          <button class="wf-toggle-btn ${isEnabled ? "on" : "off"}" title="${isEnabled ? window.I18n?.t("workflow.disableWorkflow") || "Disable workflow" : window.I18n?.t("workflow.enableWorkflow") || "Enable workflow"}">
            <span class="wf-toggle-track"><span class="wf-toggle-thumb"></span></span>
          </button>
          `
              : ""
          }
          ${
            isRunning
              ? `
            <button class="btn btn-secondary btn-sm edit-btn" title="${window.I18n?.t("workflow.viewStatus") || "View status"}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
            ${
              !isAdminViewing
                ? `
            <button class="btn btn-secondary btn-sm btn-warning stop-btn" title="${window.I18n?.t("common.stop") || "Stop"}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="6" y="6" width="12" height="12"></rect>
              </svg>
            </button>
            <button class="btn btn-secondary btn-sm reset-btn" title="Force Reset" style="color: var(--destructive, #ef4444);">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path>
              </svg>
            </button>
            `
                : ""
            }
          `
              : `
            <div class="tobyflow-dot-menu" data-wf-id="${workflow.wf_id}">
              <button class="btn btn-secondary btn-sm tobyflow-dot-menu-btn" title="Menu">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="5" r="1"></circle>
                  <circle cx="12" cy="12" r="1"></circle>
                  <circle cx="12" cy="19" r="1"></circle>
                </svg>
              </button>
              <div class="tobyflow-dropdown-menu hidden">
                <!-- 2026-06-05: B\u1ECE conditional hide Edit/Run/Reset cho cross-project.
                     Tr\u01B0\u1EDBc: cross-project \u2192 CH\u1EC8 hi\u1EC7n "M\u1EDF project" direct button \u2192 user feedback
                     "menu edit workflow kh\xE1c project hi\u1EC7n \u0111ang \u1EA9n".
                     Sau: lu\xF4n hi\u1EC7n Edit/Run/Reset. Edit handler t\u1EF1 detect cross-project \u2192
                     show modal "M\u1EDF project" / "\u0110\xF3ng" \u2192 confirm \u2192 navigate + auto-open editor
                     (xem WorkflowList.js:631 + project:changed listener). -->
                <button class="tobyflow-dropdown-item edit-btn">
                  ${
                    isAdminViewing
                      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                       ${window.I18n?.t("common.view") || "View"}`
                      : `<svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.75 15.7502H9.75002M1.875 16.1252L6.03695 14.5245C6.30316 14.4221 6.43626 14.3709 6.56079 14.3041C6.6714 14.2447 6.77685 14.1761 6.87603 14.0992C6.98769 14.0125 7.08853 13.9117 7.29021 13.71L15.75 5.25023C16.5784 4.4218 16.5784 3.07865 15.75 2.25023C14.9216 1.4218 13.5784 1.4218 12.75 2.25022L4.29021 10.71C4.08853 10.9117 3.98769 11.0125 3.90104 11.1242C3.82408 11.2234 3.75555 11.3288 3.69618 11.4394C3.62933 11.564 3.57814 11.6971 3.47575 11.9633L1.875 16.1252ZM1.875 16.1252L3.41859 12.1119C3.52905 11.8248 3.58428 11.6812 3.67901 11.6154C3.76179 11.5579 3.86423 11.5362 3.96322 11.5551C4.0765 11.5767 4.18529 11.6855 4.40286 11.9031L6.09718 13.5974C6.31475 13.815 6.42354 13.9237 6.44517 14.037C6.46408 14.136 6.44234 14.2385 6.38486 14.3212C6.31908 14.416 6.17549 14.4712 5.8883 14.5817L1.875 16.1252Z"/></svg>
                       ${window.I18n?.t("common.edit") || "Edit"}`
                  }
                </button>
                ${
                  !isAdminViewing && nodeCount > 0 && isEnabled
                    ? `
                <button class="tobyflow-dropdown-item run-btn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                  ${window.I18n?.t("common.run") || "Run"}
                </button>
                `
                    : ""
                }
                ${
                  !isAdminViewing
                    ? `
                <button class="tobyflow-dropdown-item reset-btn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>
                  ${window.I18n?.t("common.reset") || "Reset"}
                </button>
                `
                    : ""
                }
                ${
                  !isAdminViewing &&
                  window.authManager?.isLoggedIn() &&
                  !workflow._is_shared_view
                    ? `
                <button class="tobyflow-dropdown-item share-btn ${!window.featureGate?.canUse("workflow_share_enabled") ? "tobyflow-dropdown-item--locked" : ""}">
                  <span class="wf-dropdown-icon-wrap">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                    ${!window.featureGate?.canUse("workflow_share_enabled") ? `<svg class="wf-dropdown-lock-badge" width="9" height="9" viewBox="0 0 24 24" fill="var(--warning, #f59e0b)" stroke="var(--warning, #f59e0b)" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4" fill="none"></path></svg>` : ""}
                  </span>
                  ${window.I18n?.t("common.share") || "Share"}
                </button>
                `
                    : ""
                }
                ${
                  !isAdminViewing
                    ? `
                <button class="tobyflow-dropdown-item copy-btn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  ${window.I18n?.t("workflow.duplicate") || "Duplicate"}
                </button>
                `
                    : ""
                }
                <button class="tobyflow-dropdown-item export-btn ${!window.featureGate?.canUse("workflow_export") ? "tobyflow-dropdown-item--locked" : ""}">
                  <span class="wf-dropdown-icon-wrap">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                    ${!window.featureGate?.canUse("workflow_export") ? `<svg class="wf-dropdown-lock-badge" width="9" height="9" viewBox="0 0 24 24" fill="var(--warning, #f59e0b)" stroke="var(--warning, #f59e0b)" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4" fill="none"></path></svg>` : ""}
                  </span>
                  ${window.I18n?.t("common.export") || "Export"}
                </button>
                ${
                  !isAdminViewing
                    ? `
                <button class="tobyflow-dropdown-item publish-template-btn hidden">
                  <svg fill="currentColor" width="16" height="16" viewBox="0 -1.5 35 35" version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M29.426 15.535c0 0 0.649-8.743-7.361-9.74-6.865-0.701-8.955 5.679-8.955 5.679s-2.067-1.988-4.872-0.364c-2.511 1.55-2.067 4.388-2.067 4.388s-5.576 1.084-5.576 6.768c0.124 5.677 6.054 5.734 6.054 5.734h9.351v-6h-3l5-5 5 5h-3v6h8.467c0 0 5.52 0.006 6.295-5.395 0.369-5.906-5.336-7.070-5.336-7.070z"></path></svg>
                  ${window.I18n?.t("creator.publish.menuItem") || "Publish as Template"}
                </button>
                `
                    : ""
                }
                ${
                  !isAdminViewing
                    ? `
                <button class="tobyflow-dropdown-item delete-btn tobyflow-dropdown-danger" ${!canDelete ? "disabled" : ""}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                  ${window.I18n?.t("common.delete") || "Delete"}
                </button>
                `
                    : ""
                }
              </div>
            </div>
          `
          }
        </div>
        ${
          isRunning
            ? `
          <div class="workflow-card-progress">
            <div class="workflow-card-progress-bar">
              <div class="workflow-card-progress-bar-fill" style="width: ${progress}%"></div>
            </div>
          </div>
        `
            : ""
        }
      </div>
    `;
  }
  async _gateNodeQuota(nodeCount, name) {
    if (!window.featureGate || !(nodeCount > 0)) return true;
    const q = window.featureGate.checkQuota("workflows_nodes_max");
    const limit = q?.limit;
    if (
      limit === "unlimited" ||
      limit === "-1" ||
      !(limit > 0) ||
      nodeCount <= limit
    )
      return true;
    const t = (k, p) => window.I18n?.t?.(k, p);
    const dialog = window.customDialog || window.CustomDialog;
    const shouldUpgrade = await dialog?.confirm(
      t("workflow.workflowNodeQuotaExceeded", { count: nodeCount, limit }) ||
        `This workflow has ${nodeCount} nodes but your current plan allows up to ${limit} nodes per workflow. Upgrade to continue.`,
      {
        title: t("workflow.limitReached") || "Workflow limit reached",
        type: "warning",
        confirmText: t("common.upgrade") || "Upgrade",
        cancelText: t("common.later") || "Later",
      },
    );
    if (shouldUpgrade) {
      if (typeof window.openUpgradeModal === "function")
        window.openUpgradeModal();
      else {
        try {
          chrome.runtime.sendMessage({ action: "showUpgradeModal" });
        } catch (_) {}
      }
    }
    return false;
  }
  async _openWorkflow(wfId, cardEl) {
    console.log(
      "[WorkflowList] _openWorkflow called:",
      wfId,
      "already opening:",
      this._opening,
    );
    if (this._opening) {
      console.log("[WorkflowList] _openWorkflow BLOCKED - already opening");
      return;
    }
    this._opening = true;
    if (cardEl) {
      cardEl.classList.add("opening");
      const actionsEl = cardEl.querySelector(".workflow-card-actions");
      if (actionsEl) {
        actionsEl.dataset.prevHtml = actionsEl.innerHTML;
        actionsEl.innerHTML = `<div class="tobyflow-loading-spinner" style="width:18px;height:18px;"></div>`;
      }
    }
    try {
      let workflow = this.workflows.find((w) => w.wf_id === wfId);
      const listWorkflow = workflow;
      console.log(
        "[WorkflowList] StorageManager mode:",
        window.storageManager?.getMode(),
      );
      const currentUserId = window.authManager?.user?.id;
      const workflowOwnerId = workflow?.user_id || workflow?.user?.id;
      const isAdminViewFromList = !!(
        workflowOwnerId &&
        currentUserId &&
        workflowOwnerId !== currentUserId
      );
      console.log("[WorkflowList] Admin view check from list:", {
        workflowOwnerId,
        currentUserId,
        isAdminViewFromList,
      });
      if (window.storageManager) {
        try {
          const freshWorkflow = await window.storageManager.getWorkflow(wfId);
          if (freshWorkflow) {
            workflow = freshWorkflow;
            console.log(
              "[WorkflowList] Got fresh workflow from API, nodes:",
              workflow?.nodes?.length,
              "_is_admin_view:",
              workflow?._is_admin_view,
            );
          }
        } catch (fetchErr) {
          console.warn(
            "[WorkflowList] Failed to fetch workflow:",
            fetchErr.message,
          );
        }
      }
      console.log(
        "[WorkflowList] Opening workflow:",
        workflow?.wf_name,
        "nodes:",
        workflow?.nodes?.map((n) => ({
          id: n.node_id,
          name: n.node_name,
          pos_x: n.pos_x,
          pos_y: n.pos_y,
        })),
      );
      const isAdminViewGate = workflow?._is_admin_view || isAdminViewFromList;
      if (!isAdminViewGate) {
        const nodeCount = workflow?.nodes?.length ?? 0;
        if (!(await this._gateNodeQuota(nodeCount, workflow?.wf_name))) {
          return;
        }
      }
      if (window.eventBus) {
        const isAdminView = workflow?._is_admin_view || isAdminViewFromList;
        const mode = isAdminView ? "admin_preview" : "edit";
        console.log(
          "[WorkflowList] Opening editor with mode:",
          mode,
          "isAdminView:",
          isAdminView,
        );
        window.eventBus.emit("workflow:open_editor", { mode, workflow });
      }
    } catch (e) {
      console.error("[WorkflowList] Failed to load workflow:", e);
    } finally {
      setTimeout(() => {
        console.log(
          "[WorkflowList] _openWorkflow finally block executing for",
          wfId,
        );
        this._opening = false;
        if (cardEl) {
          cardEl.classList.remove("opening");
          const actionsEl = cardEl.querySelector(".workflow-card-actions");
          console.log(
            "[WorkflowList] Finally: actionsEl exists:",
            !!actionsEl,
            "prevHtml exists:",
            !!actionsEl?.dataset.prevHtml,
          );
          if (actionsEl?.dataset.prevHtml) {
            actionsEl.innerHTML = actionsEl.dataset.prevHtml;
            delete actionsEl.dataset.prevHtml;
            this._bindSingleCardEvents(cardEl);
            const isWorkflowRunning =
              window.workflowExecutor?.isRunning &&
              window.workflowExecutor?.currentWorkflow?.wf_id === wfId;
            console.log(
              "[WorkflowList] Finally: isWorkflowRunning:",
              isWorkflowRunning,
              "executor.isRunning:",
              window.workflowExecutor?.isRunning,
              "currentWorkflow.wf_id:",
              window.workflowExecutor?.currentWorkflow?.wf_id,
              "target wfId:",
              wfId,
            );
            if (isWorkflowRunning) {
              this._updateCardRunningState(wfId, true);
            }
          }
        } else {
          console.log("[WorkflowList] Finally: cardEl is null/undefined");
        }
        this.loadWorkflows();
      }, 1500);
    }
  }
  async toggleWorkflowEnabled(wfId) {
    const wf = this.workflows.find((w) => w.wf_id === wfId);
    if (!wf) return;
    wf.enabled = wf.enabled === false ? true : false;
    this.render();
    try {
      if (window.storageManager) await window.storageManager.saveWorkflow(wf);
    } catch (e) {
      console.error("[WorkflowList] Toggle enabled failed:", e);
    }
  }
  async _preflightCheck(workflow) {
    const I = window.I18n;
    const nodes = workflow.nodes || [];
    const PM = window.ProviderMeta;
    const providerLabels = {
      flow: PM?.getName?.("flow") || "Flow",
      chatgpt: PM?.getName?.("chatgpt") || "ChatGPT",
      grok: PM?.getName?.("grok") || "Grok",
      gemini: PM?.getName?.("gemini") || "Gemini",
      muse: PM?.getName?.("muse") || "Muse",
    };
    const providersUsed = new Set();
    for (const node of nodes) {
      if (node.enabled === false) continue;
      const nodeType = node.node_type || node.class;
      if (nodeType === "image" || nodeType === "generate") {
        providersUsed.add("flow");
      } else if (nodeType === "chatgpt") {
        providersUsed.add(node.provider || "chatgpt");
      } else if (nodeType === "grok") {
        providersUsed.add("grok");
      } else if (nodeType === "gemini") {
        providersUsed.add("gemini");
      } else if (nodeType === "muse") {
        providersUsed.add("muse");
      } else if (nodeType === "prompt" && node.use_ai === true) {
        providersUsed.add(node.provider || "chatgpt");
      }
    }
    console.log("[WorkflowList] _preflightCheck: providers used:", [
      ...providersUsed,
    ]);
    if (providersUsed.size === 0) {
      console.log(
        "[WorkflowList] _preflightCheck: no providers, returning ready",
      );
      return { ready: true, providers: {} };
    }
    let flowApiUiActive = false;
    const flowWebLabel = providerLabels.flow;
    const flowHasWebOnlyComponents = nodes.some(
      (node) =>
        node.enabled !== false &&
        ["image", "generate"].includes(node.node_type || node.class) &&
        (((node.node_type || node.class) === "generate" &&
          /video/i.test(node.media_type || "") &&
          node.voice_search_value) ||
          node.character_search_value ||
          window.MentionParser?.hasComponents?.(node.prompt || "")),
    );
    let flowApiIntended =
      !flowHasWebOnlyComponents &&
      window.FlowApiAdapter?.isApiModeIntended?.({ forWorkflow: true }) ===
        true;
    let flowApiRequired =
      flowApiIntended &&
      window.FlowApiAdapter?.isApiModeRequired?.({ forWorkflow: true }) ===
        true;
    let flowReconnectAttempted = false;
    let flowHealthPrimed = false;
    const flowMediaTypes = [
      ...new Set(
        nodes
          .filter(
            (n) =>
              n.enabled !== false &&
              ["image", "generate"].includes(n.node_type || n.class),
          )
          .map((n) =>
            (n.node_type || n.class) === "generate" &&
            /video/i.test(n.media_type || "")
              ? "video"
              : "image",
          ),
      ),
    ];
    const refreshFlowApiStatus = async () => {
      flowApiUiActive = false;
      flowApiIntended =
        !flowHasWebOnlyComponents &&
        window.FlowApiAdapter?.isApiModeIntended?.({ forWorkflow: true }) ===
          true;
      flowApiRequired =
        flowApiIntended &&
        window.FlowApiAdapter?.isApiModeRequired?.({ forWorkflow: true }) ===
          true;
      if (flowApiIntended && flowMediaTypes.length > 0) {
        try {
          let scoped = await window.FlowApiSessionCoordinator?.checkScopes?.({
            surfaces: ["workflow"],
            mediaTypes: flowMediaTypes,
            force: !flowHealthPrimed,
            passive: true,
          });
          flowHealthPrimed = true;
          let checks = scoped?.scopes?.map((entry) => entry.health) || [];
          if (
            !checks.every((check) => check?.ready === true) &&
            !flowReconnectAttempted &&
            flowMediaTypes.length > 0
          ) {
            flowReconnectAttempted = true;
            const failedMediaType =
              flowMediaTypes[
                Math.max(
                  0,
                  checks.findIndex((check) => check?.ready !== true),
                )
              ];
            await window.FlowApiSessionCoordinator?.checkWithReconnect?.({
              surface: "workflow",
              mediaType: failedMediaType,
              force: false,
              passive: true,
              trigger: "workflow_list_confirm",
            });
            scoped = await window.FlowApiSessionCoordinator?.checkScopes?.({
              surfaces: ["workflow"],
              mediaTypes: flowMediaTypes,
              force: false,
              passive: true,
            });
            checks = scoped?.scopes?.map((entry) => entry.health) || [];
          }
          flowApiUiActive =
            checks.length > 0 && checks.every((check) => check?.ready === true);
        } catch (_) {}
      }
      providerLabels.flow =
        flowApiUiActive || flowApiRequired ? "Flow API" : flowWebLabel;
      return flowApiUiActive;
    };
    const checkProviderStatus = async (
      provider,
      { primeChatGPT = false } = {},
    ) => {
      try {
        if (provider === "flow") {
          if (await refreshFlowApiStatus()) {
            return { ready: true };
          }
          if (flowApiRequired) {
            return { ready: false, error: "FLOW_API_NOT_READY", apiMode: true };
          }
          const resp = await new Promise((resolve) => {
            chrome.runtime.sendMessage(
              { action: "checkFlowTabOpen", readinessScope: "project" },
              (r) => resolve(r),
            );
          });
          return {
            ready: !!(resp?.ready ?? resp?.isOpen),
            isOpen: resp?.isOpen === true,
            tabId: resp?.tabId,
            error: resp?.error,
            contentReady: resp?.contentReady === true,
            projectId: resp?.projectId || null,
            preflightState: resp?.preflightState || null,
          };
        } else if (provider === "chatgpt") {
          if (!window.ChatGPTSession?.ensureReady) return { ready: false };
          if (primeChatGPT && window.ChatGPTSession.prepareNewChat) {
            const prepared = await window.ChatGPTSession.prepareNewChat({
              createIfMissing: true,
            }).catch((error) => ({
              ready: false,
              error: error?.message || "PRECHECK_FAILED",
            }));
            return {
              ready: prepared?.ready === true,
              tabId: prepared?.tabId,
              error: prepared?.error,
            };
          }
          const result = await window.ChatGPTSession.ensureReady({
            createIfMissing: false,
            activate: primeChatGPT,
            silent: true,
            forceCheck: true,
            waitForEditorMs: primeChatGPT ? 12e3 : 0,
          }).catch((error) => ({
            ready: false,
            error: error?.message || "PRECHECK_FAILED",
          }));
          return {
            ready: result?.ready === true,
            tabId: result?.tabId,
            error: result?.error,
          };
        } else if (provider === "grok") {
          if (!window.GrokSession?.ensureReady) return { ready: false };
          const result = await window.GrokSession.ensureReady({
            createIfMissing: false,
            activate: false,
            silent: true,
          }).catch(() => ({ ready: false }));
          return {
            ready: result?.ready === true,
            tabId: result?.tabId,
            error: result?.error,
          };
        } else if (provider === "gemini") {
          if (!window.GeminiSession?.ensureReady) return { ready: false };
          const monitor = window.ProviderConfigManager?.getApiConfigValueSync?.(
            "gemini",
            "generation_monitor",
          );
          const statusTimeoutMs = Math.max(
            Number(monitor?.image?.composer_ready_timeout_ms) || 0,
            Number(monitor?.video?.composer_ready_timeout_ms) || 0,
          );
          if (!Number.isFinite(statusTimeoutMs) || statusTimeoutMs <= 0) {
            return { ready: false, error: "MONITOR_CONFIG_MISSING" };
          }
          const startedAt = Date.now();
          const result = await Promise.race([
            window.GeminiSession.ensureReady({
              createIfMissing: false,
              activate: false,
              silent: true,
              forceCheck: true,
            }),
            new Promise((resolve) =>
              setTimeout(
                () => resolve({ ready: false, error: "PRECHECK_TIMEOUT" }),
                statusTimeoutMs,
              ),
            ),
          ]).catch((error) => ({
            ready: false,
            error: error?.message || "PRECHECK_FAILED",
          }));
          console.log("[WorkflowList] Gemini preflight resolved:", {
            ready: result?.ready === true,
            error: result?.error || null,
            elapsedMs: Date.now() - startedAt,
          });
          return {
            ready: result?.ready === true,
            tabId: result?.tabId,
            error: result?.error,
          };
        } else if (provider === "muse") {
          if (!window.MuseSession?.ensureReady) return { ready: false };
          const result = await window.MuseSession.ensureReady({
            createIfMissing: false,
            activate: false,
            silent: true,
          }).catch(() => ({ ready: false }));
          return {
            ready: result?.ready === true,
            tabId: result?.tabId,
            error: result?.error,
          };
        }
        return { ready: false };
      } catch (err) {
        return { ready: false, error: err.message };
      }
    };
    const providerStatus = {};
    console.log(
      "[WorkflowList] _preflightCheck: showing provider status modal",
    );
    const hasFlow = nodes.some(
      (n) => n.enabled !== false && (n.node_type || n.class) === "generate",
    );
    let _submitModeManual =
      hasFlow && !!window.storageSettings?.getSettings?.().manualSubmitMode;
    const _t = (k, fb) => I?.t?.(k) || fb;
    const submitModeHtml = hasFlow
      ? `
            <div class="confirm-run-submitmode-row" id="wfListPreflightSubmitModeRow" style="margin-top:12px; display:flex; flex-direction:column; gap:6px;">
              <span class="confirm-run-submitmode-title" style="font-size:11px; font-weight:600; color:var(--muted-foreground,#8b8b92);">${_t("dialog.runSubmitModeLabel", "Submit mode")}</span>
              <div class="confirm-submitmode-switch" id="wfListPreflightSubmitModeSwitch" role="tablist">
                <button type="button" class="confirm-submitmode-btn" data-value="auto" role="tab" data-tooltip="${_t("dialog.runSubmitModeAutoTooltip", "TobyFlow auto-clicks submit after filling prompt + refs (fast, but Flow may flag automated behavior on continuous runs).")}" data-tooltip-placement="top" data-tooltip-align="auto">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  <span>${_t("dialog.runSubmitModeAuto", "Auto submit")}</span>
                </button>
                <button type="button" class="confirm-submitmode-btn" data-value="manual" role="tab" data-tooltip="${_t("dialog.runSubmitModeManualTooltip", "TobyFlow fills the prompt + images; you press Enter/click Submit yourself for each prompt. This helps reduce Google Flow abnormal-behavior warnings.")}" data-tooltip-placement="top" data-tooltip-align="auto">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11V6a2 2 0 0 1 4 0v5"/><path d="M13 7a2 2 0 0 1 4 0v6"/><path d="M17 9a2 2 0 0 1 4 0v5a7 7 0 0 1-7 7h-2a7 7 0 0 1-6.3-3.9L3 17a2 2 0 0 1 3.4-2l1.6 2"/></svg>
                  <span>${_t("dialog.runSubmitModeManual", "Manual Submit")}</span>
                </button>
              </div>
              <span class="confirm-run-submitmode-hint" id="wfListPreflightSubmitModeHint"></span>
            </div>`
      : "";
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "confirm-run-overlay";
      overlay.innerHTML = `
        <div class="confirm-run-modal" style="min-width: 320px;">
          <div class="confirm-run-header">
            <span class="confirm-run-title">${I?.t("workflow.preflightTitle") || "AI Provider Status"}</span>
          </div>
          <div class="confirm-run-body">
            <div class="confirm-run-provider-list" id="wfListPreflightStatus"></div>
            <div class="confirm-flow-tabs-warning hidden" id="wfListPreflightFlowTabsWarning" role="status"></div>
            <p id="wfListPreflightFlowHint" role="alert" style="display:none;white-space:pre-wrap;margin:10px 0;color:var(--warning,#f59e0b);"></p>${submitModeHtml}
          </div>
          <div class="confirm-run-footer">
            <button class="btn btn-secondary" id="wfListPreflightCancel">${I?.t("common.cancel") || "Cancel"}</button>
            <button class="btn btn-primary" id="wfListPreflightRun">${I?.t("workflow.preflightContinue") || "Run Anyway"}</button>
          </div>
        </div>
      `;
      const container =
        this.container?.closest(".tobyflow-sidebar") || document.body;
      container.appendChild(overlay);
      setTimeout(() => overlay.classList.add("visible"), 10);
      if (hasFlow) {
        const smSwitch = overlay.querySelector(
          "#wfListPreflightSubmitModeSwitch",
        );
        const smHint = overlay.querySelector("#wfListPreflightSubmitModeHint");
        const smBtns = smSwitch
          ? smSwitch.querySelectorAll(".confirm-submitmode-btn")
          : [];
        const applyMode = (mode) => {
          smBtns.forEach((b) => {
            const on = b.dataset.value === mode;
            b.classList.toggle("is-active", on);
            b.setAttribute("aria-selected", on ? "true" : "false");
          });
          if (smHint) {
            if (mode === "manual") {
              smHint.textContent = _t(
                "dialog.runSubmitModeManualHint",
                "You press Enter or click Submit for each prompt \u2014 real interaction helps avoid Google Flow bot detection.",
              );
              smHint.classList.add("is-manual");
            } else {
              smHint.textContent = _t(
                "dialog.runSubmitModeAutoHint",
                "TobyFlow submits automatically after filling prompt + refs.",
              );
              smHint.classList.remove("is-manual");
            }
          }
        };
        smBtns.forEach((b) => {
          b.onclick = () => {
            _submitModeManual = b.dataset.value === "manual";
            applyMode(b.dataset.value);
            try {
              window.storageSettings?.set?.(
                "manualSubmitMode",
                _submitModeManual,
              );
            } catch (_) {}
          };
        });
        applyMode(_submitModeManual ? "manual" : "auto");
      }
      const statusEl = overlay.querySelector("#wfListPreflightStatus");
      statusEl?.addEventListener("click", (e) => {
        const link = e.target.closest(".badge-open-link[data-open-provider]");
        if (!link) return;
        e.preventDefault();
        e.stopPropagation();
        const provider = link.dataset.openProvider;
        if (!provider) return;
        try {
          chrome.runtime.sendMessage(
            { action: "openProviderTab", provider, focusWindow: false },
            () => {
              void chrome.runtime.lastError;
            },
          );
        } catch (_) {}
      });
      let pollTimer = null;
      let pollInFlight = false;
      let allReady = false;
      let initialCheckComplete = false;
      let chatGptRecoveryAttempted = false;
      const renderStatus = () => {
        let html = "";
        const iconCheck =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        const iconSpin =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>';
        const iconWarn =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
        for (const provider of providersUsed) {
          const st = providerStatus[provider];
          const label = providerLabels[provider] || provider;
          let iconSvg = iconSpin;
          let statusText = I?.t("common.checking") || "Checking...";
          let badgeClass = "is-checking";
          if (st?.ready) {
            iconSvg = iconCheck;
            statusText = I?.t("common.ready") || "Ready";
            badgeClass = "is-ready";
          } else if (st && st.ready === false) {
            iconSvg = iconWarn;
            badgeClass = "is-warning";
            if (
              st.error === "BRIDGE_NOT_READY" ||
              st.error === "FLOW_API_NOT_READY"
            ) {
              statusText = I?.t("gen.bridgeNotReady") || "Bridge is not ready";
            } else if (st.error === "NOT_LOGGED_IN") {
              statusText = I?.t("gen.providerStatusLogin") || "Not logged in";
            } else if (provider === "muse") {
              const code = String(st.error || "MUSE_NOT_READY");
              statusText = /^[A-Z0-9_:-]{1,120}$/.test(code)
                ? code
                : "MUSE_NOT_READY";
            } else if (
              provider === "flow" &&
              st.error === "CONTENT_REVISION_MISMATCH"
            ) {
              statusText =
                I?.t("app.refreshFlowTab") ||
                "Refresh the Google Flow tab and try again.";
            } else if (provider === "flow" && st.isOpen === true) {
              statusText =
                I?.t("workflow.projectNotReady") || "Flow project not ready";
            } else if (st.error === "EDITOR_NOT_FOUND") {
              if (st.recoveryAttempted) {
                statusText =
                  "ChatGPT editor is not ready. Open the ChatGPT tab and finish loading.";
              } else {
                iconSvg = iconSpin;
                badgeClass = "is-checking";
                statusText = I?.t("common.checking") || "Checking...";
              }
            } else if (
              st.error === "NO_TAB" ||
              (provider === "flow" && st.isOpen === false)
            ) {
              statusText = I?.t("workflow.providerNoTab") || "Tab not opened";
            } else if (st.cloudflareChallenge || st.error === "CLOUDFLARE") {
              statusText =
                I?.t("gen.providerStatusCloudflare") || "Waiting Cloudflare...";
            } else {
              statusText = I?.t("gen.providerStatusLogin") || "Not logged in";
            }
          }
          const _extLink =
            '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
          const statusHtml =
            st &&
            st.ready === false &&
            (st.error !== "EDITOR_NOT_FOUND" || st.recoveryAttempted)
              ? `<a class="badge-open-link" data-open-provider="${provider}" title="${I?.t("workflow.openProviderTab") || "Open tab"}" style="cursor:pointer;text-decoration:underline;display:inline-flex;align-items:center;gap:3px;">${statusText}${_extLink}</a>`
              : statusText;
          const brandLogo = window.ProviderBrandIcons?.get?.(provider) || "";
          html += `<div class="confirm-run-provider-status">
            <span class="confirm-provider-info">
              <span class="confirm-provider-logo">${brandLogo}</span>
              <span class="confirm-run-provider-label">${label}</span>
            </span>
            <span class="confirm-run-provider-badge ${badgeClass}">${iconSvg}<span class="badge-text">${statusHtml}</span></span>
          </div>`;
        }
        statusEl.innerHTML = html;
        if (providersUsed.has("flow")) {
          window.MessageBridge?.renderFlowProjectTabsAdvisory?.(
            overlay.querySelector("#wfListPreflightFlowTabsWarning"),
          ).catch?.(() => {});
        }
        const submitRow = overlay.querySelector(
          "#wfListPreflightSubmitModeRow",
        );
        if (submitRow)
          submitRow.style.display =
            flowApiUiActive || flowApiRequired ? "none" : "flex";
        allReady = [...providersUsed].every((p) => providerStatus[p]?.ready);
        const flowNotReady =
          providersUsed.has("flow") && providerStatus.flow?.ready !== true;
        const flowHint = overlay.querySelector("#wfListPreflightFlowHint");
        if (flowHint) {
          flowHint.style.display = flowNotReady ? "" : "none";
          flowHint.textContent = flowNotReady
            ? I?.t("workflow.noProjectForWorkflow") || ""
            : "";
        }
        const runBtn = overlay.querySelector("#wfListPreflightRun");
        if (runBtn) {
          runBtn.disabled = !initialCheckComplete || flowNotReady;
          runBtn.textContent = !initialCheckComplete
            ? I?.t("gen.providerStatusChecking") || "Checking..."
            : allReady
              ? I?.t("common.run") || "Run"
              : I?.t("workflow.runAnyway") || "Run Anyway";
        }
      };
      let done = false;
      let confirmInFlight = false;
      const pollStatus = async () => {
        if (done || pollInFlight) return;
        pollInFlight = true;
        try {
          await Promise.all(
            [...providersUsed].map(async (provider) => {
              let status = await checkProviderStatus(provider);
              if (
                provider === "chatgpt" &&
                status?.error === "EDITOR_NOT_FOUND" &&
                !chatGptRecoveryAttempted
              ) {
                chatGptRecoveryAttempted = true;
                status = await checkProviderStatus(provider, {
                  primeChatGPT: true,
                });
                if (status?.error === "EDITOR_NOT_FOUND")
                  status.recoveryAttempted = true;
              } else if (
                provider === "chatgpt" &&
                status?.error === "EDITOR_NOT_FOUND" &&
                chatGptRecoveryAttempted
              ) {
                status.recoveryAttempted = true;
              }
              providerStatus[provider] = status;
              if (!done) renderStatus();
            }),
          );
        } finally {
          pollInFlight = false;
        }
      };
      renderStatus();
      const runInitialCheck = async () => {
        if (done || pollInFlight) return;
        pollInFlight = true;
        try {
          if (providersUsed.has("flow")) {
            try {
              const activation = await chrome.runtime.sendMessage({
                action: "ensureFlowTabActive",
                focusWindow: true,
              });
              console.log(
                "[WorkflowList] _preflightCheck: Flow tab activation",
                {
                  ok: activation?.ok === true,
                  tabId: activation?.tabId || null,
                  projectId: activation?.projectId || null,
                  wasActivated: activation?.wasActivated === true,
                },
              );
              window.MessageBridge?.renderFlowProjectTabsAdvisory?.(
                overlay.querySelector("#wfListPreflightFlowTabsWarning"),
              ).catch?.(() => {});
            } catch (error) {
              console.warn(
                "[WorkflowList] _preflightCheck: Flow tab activation failed:",
                error.message,
              );
            }
          }
          await Promise.all(
            [...providersUsed].map(async (provider) => {
              providerStatus[provider] = await checkProviderStatus(provider, {
                primeChatGPT: provider === "chatgpt",
              });
              if (!done) renderStatus();
            }),
          );
          console.log(
            "[WorkflowList] _preflightCheck: initial status:",
            JSON.stringify(providerStatus),
          );
          const notReady = Object.entries(providerStatus).filter(
            ([_, value]) => !value.ready,
          );
          console.log(
            "[WorkflowList] _preflightCheck: activating providers:",
            JSON.stringify(notReady.map(([provider]) => provider)),
          );
          for (const [provider] of notReady) {
            if (provider === "chatgpt" && window.ChatGPTSession?.ensureReady) {
              if (!window.ChatGPTSession.prepareNewChat) {
                window.ChatGPTSession.ensureReady({
                  createIfMissing: true,
                  activate: true,
                  forceCheck: true,
                  waitForEditorMs: 12e3,
                }).catch(() => {});
              }
            } else if (provider === "grok" && window.GrokSession?.ensureReady) {
              window.GrokSession.ensureReady().catch(() => {});
            } else if (
              provider === "gemini" &&
              window.GeminiSession?.ensureReady
            ) {
              window.GeminiSession.ensureReady().catch(() => {});
            } else if (provider === "muse" && window.MuseSession?.ensureReady) {
              window.MuseSession.ensureReady({
                createIfMissing: true,
                activate: true,
                silent: true,
              }).catch(() => {});
            }
          }
        } finally {
          initialCheckComplete = true;
          pollInFlight = false;
          if (!done) renderStatus();
        }
      };
      void runInitialCheck();
      pollTimer = setInterval(pollStatus, 2e3);
      const cleanup = () => {
        if (pollTimer) clearInterval(pollTimer);
        overlay.classList.remove("visible");
        overlay.style.display = "none";
        setTimeout(() => overlay.remove(), 200);
      };
      overlay
        .querySelector("#wfListPreflightCancel")
        .addEventListener("click", () => {
          if (done) return;
          done = true;
          console.log("[WorkflowList] _preflightCheck: user cancelled");
          cleanup();
          resolve({
            ready: false,
            providers: providerStatus,
            skipped: true,
            manualSubmitMode: false,
          });
        });
      overlay
        .querySelector("#wfListPreflightRun")
        .addEventListener("click", async (e) => {
          if (done || confirmInFlight) return;
          confirmInFlight = true;
          const runButton = e.currentTarget;
          runButton.disabled = true;
          if (providersUsed.has("flow")) {
            providerStatus.flow = await checkProviderStatus("flow");
            if (done || providerStatus.flow?.ready !== true) {
              confirmInFlight = false;
              if (!done) renderStatus();
              return;
            }
          }
          if (done) return;
          done = true;
          runButton.style.opacity = "0.5";
          console.log("[WorkflowList] _preflightCheck: user clicked Run");
          cleanup();
          resolve({
            ready: true,
            providers: providerStatus,
            manualSubmitMode:
              hasFlow && !flowApiUiActive ? _submitModeManual : false,
          });
        });
    });
  }
  async runWorkflow(
    wfId,
    { awaitCompletion = false, shouldStop, runAllProjectId } = {},
  ) {
    this._lastUpdatedWfId = wfId;
    const workflow = await window.storageManager?.getWorkflow(wfId);
    if (!workflow || shouldStop?.() === true) return false;
    if (runAllProjectId) {
      await window.ProjectHelper.assertRunAllProject(
        [workflow],
        runAllProjectId,
      );
    }
    try {
      const gate =
        await window.ProjectHelper?.checkWorkflowProjectGate?.(workflow);
      if (gate && !gate.ok) {
        const where = gate.expectedName
          ? `"${gate.expectedName}"`
          : window.I18n?.t("workflow.thisProject") || "the workflow's project";
        const msg =
          gate.code === "WRONG_PROJECT"
            ? window.I18n?.t("workflow.runWrongProject", { project: where }) ||
              `This workflow belongs to ${where}. Open that project in Google Flow, then run it again.`
            : window.I18n?.t("workflow.runProjectNotReady") ||
              "The workflow's project has an error or was deleted. Open/select a valid project, then try again.";
        await window.customDialog?.alert(msg, {
          title: window.I18n?.t("workflow.wrongProjectTitle") || "Sai project",
          type: "warning",
        });
        return false;
      }
    } catch (e) {
      if (runAllProjectId) throw e;
      console.warn(
        "[WorkflowList] checkWorkflowProjectGate failed, fail-open:",
        e?.message,
      );
    }
    if (shouldStop?.() === true) return false;
    console.log(
      "[WorkflowList] runWorkflow nodes enabled status:",
      workflow.nodes?.map((n) => ({
        node_id: n.node_id,
        node_name: n.node_name,
        node_type: n.node_type,
        enabled: n.enabled,
      })),
    );
    if (awaitCompletion) {
      if (typeof this._runWorkflowAndWait !== "function")
        throw new Error("WORKFLOW_RUNNER_UNAVAILABLE");
      return this._runWorkflowAndWait(workflow, {
        shouldStop,
        ...(runAllProjectId
          ? {
              beforeDispatch: (item) =>
                window.ProjectHelper.assertRunAllProject(
                  [item],
                  runAllProjectId,
                ),
            }
          : {}),
      });
    }
    if (window.eventBus) {
      window.eventBus.emit("workflow:run", { workflow });
    }
  }
  async runAllWorkflows() {
    if (
      this._runAllStarting ||
      this.isRunningAll ||
      this.workflows.length === 0
    )
      return;
    this._runAllStarting = true;
    try {
      if (window.featureGate) {
        const quota =
          await window.featureGate.checkQuotaAsync("workflows_run_max");
        if (!quota.allowed) {
          const isLoggedIn = window.authManager?.isLoggedIn();
          if (isLoggedIn) {
            const limitText =
              quota.limit === "unlimited"
                ? window.I18n?.t("common.unlimited") || "Unlimited"
                : `${quota.limit} ${window.I18n?.t("workflow.runsPerDay") || "runs/day"}`;
            const shouldUpgrade = await window.customDialog?.confirm(
              window.I18n?.t("workflow.runQuotaExhausted", {
                limitText,
                used: quota.used,
              }) ||
                `You have used up today's Workflow runs.

Limit: ${limitText}
Used: ${quota.used} runs

Upgrade your plan to increase the limit.`,
              {
                title:
                  window.I18n?.t("workflow.runQuotaTitle") ||
                  "Workflow runs exhausted",
                confirmText: window.I18n?.t("common.upgrade") || "Upgrade",
                cancelText: window.I18n?.t("common.later") || "Later",
              },
            );
            if (
              shouldUpgrade &&
              typeof window.openUpgradeModal === "function"
            ) {
              window.openUpgradeModal();
            }
          } else {
            window.featureGate.showLoginPrompt(
              window.I18n?.t("workflow.trialRunExhausted") ||
                "You have used all trial workflow runs. Log in to continue.",
            );
          }
          return;
        }
      }
      if (
        !window.ProjectHelper?.getRunAllProjectContext ||
        !window.ProjectHelper?.assertRunAllProject
      ) {
        throw new Error("RUN_ALL_PROJECT_UNAVAILABLE");
      }
      const runAllContext =
        await window.ProjectHelper.getRunAllProjectContext();
      const available = new Map(
        this.workflows.map((workflow) => [workflow.wf_id, workflow]),
      );
      const lastPage = this._lastPage || 1;
      for (let page = (this._currentPage || 1) + 1; page <= lastPage; page++) {
        const result = await window.storageManager.getWorkflows({
          page,
          per_page: this._pageSize,
          platform: "flow",
        });
        for (const workflow of result.data || []) {
          if (
            (!workflow.platform || workflow.platform === "flow") &&
            !available.has(workflow.wf_id)
          ) {
            available.set(workflow.wf_id, workflow);
          }
        }
      }
      const eligibleWorkflows = [...available.values()].filter(
        (wf) =>
          wf.project_id &&
          String(wf.project_id).toLowerCase() ===
            String(runAllContext.projectId).toLowerCase(),
      );
      const runnableWorkflows = eligibleWorkflows.filter(
        (wf) => wf.enabled !== false && wf.status !== "completed",
      );
      const disabledCount = eligibleWorkflows.filter(
        (wf) => wf.enabled === false,
      ).length;
      const doneCount = eligibleWorkflows.filter(
        (wf) => wf.enabled !== false && wf.status === "completed",
      ).length;
      if (runnableWorkflows.length === 0) {
        await window.customDialog.alert(
          window.I18n?.t("workflow.noRunnableWorkflows") ||
            "No workflows to run. Check enabled/disabled and completed status.",
          {
            title:
              window.I18n?.t("workflow.noRunnableTitle") ||
              "No workflows to run",
          },
        );
        return;
      }
      let message =
        window.I18n?.t("workflow.runAllConfirm", {
          count: runnableWorkflows.length,
        }) || `Run ${runnableWorkflows.length} workflows sequentially?`;
      message += `

${window.I18n?.t("project.currentProject") || "Current project"}: ${runAllContext.projectName || runAllContext.projectId}`;
      const skippedProjects = available.size - eligibleWorkflows.length;
      message += `
${window.I18n?.t("project.runAllScopeNote", { count: skippedProjects }) || `Only this project will run. ${skippedProjects} items from other projects or without a project will be skipped.`}`;
      const notes = [];
      if (disabledCount > 0)
        notes.push(
          window.I18n?.t("workflow.disabledSkipped", {
            count: disabledCount,
          }) || `${disabledCount} disabled workflows will be skipped`,
        );
      if (doneCount > 0)
        notes.push(
          window.I18n?.t("workflow.completedSkipped", { count: doneCount }) ||
            `${doneCount} completed workflows will be skipped. Reset them first if you want to run again`,
        );
      if (notes.length > 0) message += "\n\n" + notes.join(". ") + ".";
      const ok = await window.customDialog.confirm(message, {
        title: window.I18n?.t("workflow.runAll") || "Run All",
      });
      if (!ok) return;
      this.shouldStopAll = false;
      this._setRunAllButtonRunning();
      this._showBatchProgress(runnableWorkflows.length);
      this._pendingWfIds = new Set(runnableWorkflows.map((w) => w.wf_id));
      await this.render();
      let current = 0;
      for (const workflow of runnableWorkflows) {
        if (this.shouldStopAll) break;
        current++;
        this._pendingWfIds.delete(workflow.wf_id);
        this._updateBatchProgress(current, runnableWorkflows.length);
        try {
          const started = await this.runWorkflow(workflow.wf_id, {
            awaitCompletion: true,
            runAllProjectId: runAllContext.projectId,
            shouldStop: () => this.shouldStopAll,
          });
          if (
            started === false ||
            this.shouldStopAll ||
            window.workflowExecutor?.shouldStop
          )
            break;
        } catch (error) {
          console.error(
            "[WorkflowList] Run all - workflow failed:",
            workflow.wf_id,
            error,
          );
          window.showNotification?.(
            error?.message || window.I18n?.t("workflow.executionAborted"),
            "error",
          );
          break;
        }
      }
    } catch (error) {
      console.error("[WorkflowList] Run all setup failed:", error);
      window.showNotification?.(
        error?.message || window.I18n?.t("workflow.executionAborted"),
        "error",
      );
    } finally {
      this._runAllStarting = false;
      if (this.isRunningAll) {
        this._resetRunAllButton();
        try {
          await this.render();
        } catch (error) {
          console.warn("[WorkflowList] Run all final render failed:", error);
        }
      }
    }
  }
  async stopWorkflow(wfId) {
    console.log(
      "[WorkflowList] stopWorkflow called:",
      wfId,
      "isRunning:",
      window.workflowExecutor?.isRunning,
    );
    this._markWorkflowStopped(wfId);
    console.log(
      "[WorkflowList] Added to _stoppedWfIds:",
      wfId,
      "set size:",
      this._stoppedWfIds.size,
    );
    this._updateCardRunningState(wfId, false, "pending");
    if (window.workflowExecutor?.isRunning) {
      console.log("[WorkflowList] Stopping local executor");
      window.workflowExecutor.stop();
      setTimeout(() => {
        if (window.workflowExecutor?.isRunning) {
          console.warn("[WorkflowList] Force stopping stuck workflow");
          window.workflowExecutor.shouldStop = true;
          window.workflowExecutor.isRunning = false;
          window.MessageBridge?.stopExecution?.().catch(() => {});
          if (window.ExecutionLock) ExecutionLock.forceRelease();
          this.loadWorkflows();
        }
      }, 3e3);
    } else {
      console.log("[WorkflowList] Broadcasting stop to other contexts");
      try {
        chrome.runtime.sendMessage({
          action: "workflowExecutionEvent",
          event: "execution:stop",
          data: { wf_id: wfId },
        });
      } catch (e) {
        console.warn("[WorkflowList] Broadcast stop failed:", e.message);
      }
      window.MessageBridge?.stopExecution?.().catch(() => {});
      if (window.storageManager) {
        console.log(
          "[WorkflowList] Updating stale workflow status to pending:",
          wfId,
        );
        window.storageManager
          .saveWorkflow({
            wf_id: wfId,
            status: "pending",
            updated_at: new Date().toISOString(),
          })
          .catch((e) =>
            console.warn(
              "[WorkflowList] Failed to update workflow status:",
              e.message,
            ),
          );
      }
    }
  }
  _setRunAllButtonRunning() {
    this.isRunningAll = true;
    const btn = this.container.querySelector("#runAllWorkflowsBtn");
    if (!btn) return;
    btn.classList.add("btn-stop");
    btn.title = window.I18n?.t("workflow.stopAll") || "Stop All";
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="6" y="6" width="12" height="12"></rect>
      </svg>
      <span>${window.I18n?.t("workflow.stop") || "Stop workflow"}</span>
    `;
  }
  _resetRunAllButton() {
    this.isRunningAll = false;
    this.shouldStopAll = false;
    this._pendingWfIds.clear();
    this._hideBatchProgress();
    const btn = this.container.querySelector("#runAllWorkflowsBtn");
    if (!btn) return;
    btn.classList.remove("btn-stop");
    btn.disabled = false;
    btn.title = window.I18n?.t("workflow.runAll") || "Run All";
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
      <span>${window.I18n?.t("workflow.runAll") || "Run All"}</span>
    `;
  }
  stopAllWorkflows() {
    this.shouldStopAll = true;
    this._pendingWfIds.clear();
    if (window.workflowExecutor?.isRunning) {
      window.workflowExecutor.stop();
    }
    const btn = this.container.querySelector("#runAllWorkflowsBtn");
    if (btn) {
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="6" y="6" width="12" height="12"></rect>
        </svg>
        <span>${window.I18n?.t("workflow.stopping") || "Stopping..."}</span>
      `;
      btn.disabled = true;
    }
  }
  _showBatchProgress(total) {
    const progressEl = this.container.querySelector("#wfBatchProgress");
    if (!progressEl) return;
    progressEl.classList.remove("hidden");
    this._batchTotal = total;
    this._batchCurrent = 0;
    this._updateBatchProgress(0, total);
  }
  _updateBatchProgress(current, total) {
    const labelEl = this.container.querySelector("#wfBatchProgressLabel");
    const countEl = this.container.querySelector("#wfBatchProgressCount");
    const fillEl = this.container.querySelector("#wfBatchProgressFill");
    if (labelEl) {
      labelEl.textContent =
        window.I18n?.t("workflow.runningWorkflows") || "Running workflows...";
    }
    if (countEl) {
      countEl.textContent = `${current}/${total}`;
    }
    if (fillEl) {
      const percent = total > 0 ? (current / total) * 100 : 0;
      fillEl.style.width = `${percent}%`;
    }
  }
  _hideBatchProgress() {
    const progressEl = this.container.querySelector("#wfBatchProgress");
    if (progressEl) {
      progressEl.classList.add("hidden");
    }
  }
  _closeAllDropdowns(container) {
    container?.querySelectorAll(".tobyflow-dropdown-menu").forEach((d) => {
      d.classList.add("hidden");
    });
  }
  _positionDropdown(triggerEl, dropdown) {
    const rect = triggerEl.getBoundingClientRect();
    const dropdownHeight = dropdown.offsetHeight || 150;
    const dropdownWidth = dropdown.offsetWidth || 140;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const rightEdge = viewportWidth - rect.right;
    if (rect.right - dropdownWidth < 4) {
      dropdown.style.left = "4px";
      dropdown.style.right = "auto";
    } else {
      dropdown.style.right = Math.max(4, rightEdge) + "px";
      dropdown.style.left = "auto";
    }
    if (rect.top > dropdownHeight + 8) {
      dropdown.style.bottom = viewportHeight - rect.top + 4 + "px";
      dropdown.style.top = "auto";
    } else {
      dropdown.style.top = rect.bottom + 4 + "px";
      dropdown.style.bottom = "auto";
    }
  }
  async cloneWorkflow(wfId) {
    if (this._isCloningWorkflow) {
      console.log(
        "[WorkflowList] Clone already in progress, ignoring duplicate click",
      );
      return;
    }
    try {
      this._isCloningWorkflow = true;
      if (!window.storageManager) return;
      if (window.featureGate) {
        const canCreate = await window.featureGate.canCreateWorkflowAsync();
        if (!canCreate) {
          const isLoggedIn = window.authManager?.isLoggedIn();
          if (!isLoggedIn) {
            window.featureGate.showLoginPrompt(
              window.I18n?.t("workflow.requireLoginToClone") ||
                "Login required to clone workflows",
            );
          } else {
            const quota = window.featureGate.checkQuota("workflows_max");
            const shouldUpgrade = await window.customDialog?.confirm(
              window.I18n?.t("workflow.cloneQuotaExhausted", {
                limit: quota.limit,
                used: quota.used,
              }) ||
                `Your plan allows a maximum of ${quota.limit} workflows. You already have ${quota.used} workflows. Upgrade to Premium to clone unlimited workflows.`,
              {
                title:
                  window.I18n?.t("workflow.quotaReached") || "Limit reached",
                type: "warning",
                confirmText: window.I18n?.t("common.upgrade") || "Upgrade",
                cancelText: window.I18n?.t("common.later") || "Later",
              },
            );
            if (
              shouldUpgrade &&
              typeof window.openUpgradeModal === "function"
            ) {
              window.openUpgradeModal();
            }
          }
          return;
        }
      }
      if (
        window.ProjectHelper &&
        !(await window.ProjectHelper.ensureProjectOrGuide())
      ) {
        return;
      }
      window.showNotification?.(
        window.I18n?.t("workflow.duplicating") || "Duplicating workflow...",
        "success",
        1500,
      );
      const workflow = await window.storageManager.getWorkflow(wfId);
      if (!workflow) return;
      if (
        !(await this._gateNodeQuota(
          workflow?.nodes?.length ?? 0,
          workflow?.wf_name,
        ))
      )
        return;
      const isCurrent =
        window.ProjectHelper?.isCurrentProject(workflow) !== false;
      if (!isCurrent && window.ProjectHelper) {
        const confirmed =
          await window.ProjectHelper.showCloneConfirmation("workflow");
        if (!confirmed) return;
        const result = window.ProjectHelper.cloneWorkflowCrossProject(
          workflow,
          workflow.nodes || [],
          workflow.edges || [],
        );
        result.workflow.sort_order = this.workflows.length || 0;
        result.workflow.wf_name = window.ProjectHelper.uniquifyName(
          result.workflow.wf_name,
          this.workflows.map((w) => w.wf_name),
        );
        result.workflow.created_source = "extension";
        delete result.workflow.id;
        delete result.workflow.user_id;
        delete result.workflow.created_at;
        delete result.workflow.updated_at;
        await window.storageManager.saveWorkflowFull(
          result.workflow,
          result.nodes,
          result.edges,
        );
      } else {
        const newWfId = window.IdGenerator
          ? window.IdGenerator.next("wf")
          : `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const nodeIdMap = {};
        const newNodes = (workflow.nodes || []).map((node, i) => {
          const newNodeId = window.IdGenerator
            ? window.IdGenerator.next("node")
            : `node_${Date.now()}_${i}`;
          nodeIdMap[node.node_id] = newNodeId;
          return {
            ...node,
            node_id: newNodeId,
            wf_id: newWfId,
            status: "pending",
            result_file_ids: "",
            result_thumbnails: {},
            result_file_names: {},
            result_provider_urls: {},
            result_text: "",
            result_source: null,
            error_message: "",
            executed_at: null,
          };
        });
        for (const cloned of newNodes) {
          if (
            cloned.frame_1_source &&
            cloned.frame_1_source !== "manual" &&
            cloned.frame_1_source !== ""
          ) {
            cloned.frame_1_source =
              nodeIdMap[cloned.frame_1_source] || cloned.frame_1_source;
          }
          if (
            cloned.frame_2_source &&
            cloned.frame_2_source !== "manual" &&
            cloned.frame_2_source !== ""
          ) {
            cloned.frame_2_source =
              nodeIdMap[cloned.frame_2_source] || cloned.frame_2_source;
          }
        }
        const newEdges = (workflow.edges || []).map((edge) => ({
          ...edge,
          edge_id: window.IdGenerator
            ? window.IdGenerator.next("edge")
            : `edge_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          wf_id: newWfId,
          source_node_id: nodeIdMap[edge.source_node_id] || edge.source_node_id,
          target_node_id: nodeIdMap[edge.target_node_id] || edge.target_node_id,
        }));
        const baseName =
          (workflow.wf_name || "Workflow") +
          " " +
          (window.I18n?.t("project.copySuffix") || "(copy)");
        const uniqueName =
          window.ProjectHelper?.uniquifyName(
            baseName,
            this.workflows.map((w) => w.wf_name),
          ) || baseName;
        const newWorkflow = {
          ...workflow,
          wf_id: newWfId,
          wf_name: uniqueName,
          created_source: "extension",
          status: "idle",
          progress_completed: 0,
          progress_total: 0,
          current_node_id: null,
          sort_order: this.workflows.length || 0,
        };
        delete newWorkflow.nodes;
        delete newWorkflow.edges;
        delete newWorkflow.id;
        delete newWorkflow.user_id;
        delete newWorkflow.created_at;
        delete newWorkflow.updated_at;
        await window.storageManager.saveWorkflowFull(
          newWorkflow,
          newNodes,
          newEdges,
        );
      }
      if (window.featureGate && !window.authManager?.isLoggedIn()) {
        await window.featureGate.recordWorkflowCreated();
      }
      if (window.featureGate) {
        window.featureGate
          .refresh({ force: true })
          .catch((e) =>
            console.warn("[WorkflowList] FeatureGate refresh failed:", e),
          );
      }
      await this.loadWorkflows();
      window.showNotification?.(
        window.I18n?.t("workflow.duplicateSuccess") || "Workflow duplicated",
        "success",
      );
    } catch (e) {
      console.error("[WorkflowList] Clone failed:", e);
      if (
        e.code === "QUOTA_EXCEEDED" ||
        e.message?.includes("gi\u1EDBi h\u1EA1n")
      ) {
        return;
      }
      if (e.message === "REQUIRES_LOGIN") {
        window.featureGate?.showLoginPrompt(
          window.I18n?.t("workflow.requireLoginToClone") ||
            "Login required to clone workflows",
        );
        return;
      }
      window.customDialog?.alert(
        (window.I18n?.t("workflow.duplicateFailed") ||
          "Failed to duplicate workflow") +
          ": " +
          e.message,
        { type: "error" },
      );
    } finally {
      this._isCloningWorkflow = false;
    }
  }
  async _renderProjectFilter() {
    const select = this.container.querySelector("#wfProjectSelectInline");
    if (!select) return;
    const projectIds = new Set();
    const counts = {};
    for (const w of this.workflows) {
      const pid = w.project_id || "__legacy__";
      projectIds.add(pid);
      counts[pid] = (counts[pid] || 0) + 1;
    }
    if (this._filterProjectId && !projectIds.has(this._filterProjectId)) {
      console.log("[WorkflowList] Reset unavailable project filter", {
        projectId: this._filterProjectId,
        loadedWorkflows: this.workflows.length,
      });
      this._filterProjectId = null;
    }
    if (this.workflows.length === 0) {
      select.classList.add("hidden");
      return;
    }
    select.classList.remove("hidden");
    const projects = (await window.ProjectHelper?.getProjectList()) || {};
    const t = (key, params) => (window.I18n ? window.I18n.t(key, params) : key);
    let options = `<option value="" ${!this._filterProjectId ? "selected" : ""}>${t("project.filterAll", { count: this.workflows.length })}</option>`;
    if (window._currentProjectId && projectIds.has(window._currentProjectId)) {
      const name =
        projects[window._currentProjectId]?.name ||
        window._currentProjectName ||
        t("project.current");
      const count = counts[window._currentProjectId] || 0;
      options += `<option value="${window._currentProjectId}" ${this._filterProjectId === window._currentProjectId ? "selected" : ""}>${this.escapeHtml(name)} (${count})</option>`;
    }
    for (const pid of projectIds) {
      if (pid === window._currentProjectId || pid === "__legacy__") continue;
      const name = projects[pid]?.name || pid.substring(0, 8);
      const count = counts[pid] || 0;
      options += `<option value="${pid}" ${this._filterProjectId === pid ? "selected" : ""}>${this.escapeHtml(name)} (${count})</option>`;
    }
    if (counts["__legacy__"]) {
      options += `<option value="__legacy__" ${this._filterProjectId === "__legacy__" ? "selected" : ""}>${t("project.legacy")} (${counts["__legacy__"]})</option>`;
    }
    select.innerHTML = options;
    if (!select._wfListBound) {
      select._wfListBound = true;
      select.addEventListener("change", (e) => {
        this._filterProjectId = e.target.value || null;
        this._currentPage = 1;
        this.render();
      });
    }
  }
  async _cacheProjectNames() {
    const workflowProjectIds = this.workflows
      .map((w) => w.project_id)
      .filter((pid) => pid);
    const refreshed =
      workflowProjectIds.length > 0
        ? await window.ProjectHelper?.fetchProjectNamesFromApi?.()
        : null;
    const projects =
      refreshed || (await window.ProjectHelper?.getProjectList()) || {};
    this._projectNames = {};
    for (const [pid, info] of Object.entries(projects)) {
      this._projectNames[pid] = info.name;
    }
  }
  _formatRelativeTime(timestamp) {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1e3);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (seconds < 60) return window.I18n?.t("common.justNow") || "Just now";
    if (minutes < 60)
      return (
        window.I18n?.t("albums.minutesAgo", { count: minutes }) ||
        `${minutes} minutes ago`
      );
    if (hours < 24)
      return (
        window.I18n?.t("albums.hoursAgo", { count: hours }) ||
        `${hours} hours ago`
      );
    if (days < 7)
      return (
        window.I18n?.t("albums.daysAgo", { count: days }) || `${days} days ago`
      );
    const localeMap = { vi: "vi-VN", en: "en-US", th: "th-TH", ja: "ja-JP" };
    const locale = localeMap[window.I18n?.getLocale?.()] || "vi-VN";
    return date.toLocaleDateString(locale);
  }
  _showToast(message, duration = 2e3) {
    let toast = document.querySelector(".tobyflow-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "tobyflow-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove("show"), duration);
  }
  async deleteWorkflow(wfId) {
    const wf = this.workflows.find((w) => w.wf_id === wfId);
    const wfName = wf?.name || wf?.wf_name || "Workflow";
    const ok = await window.customDialog.confirmDangerous(
      window.I18n?.t("workflow.deleteConfirmShort") ||
        "Permanently delete this workflow?",
      {
        title: window.I18n?.t("workflow.delete") || "Delete workflow",
        itemName: wfName,
      },
    );
    if (!ok) return;
    try {
      if (window.storageManager) {
        await window.storageManager.deleteWorkflow(wfId);
      }
      window.showNotification?.(
        window.I18n?.t("workflow.deleteSuccess") || "Workflow deleted",
        "success",
      );
      if (window.featureGate) {
        window.featureGate
          .refresh({ force: true })
          .catch((e) =>
            console.warn("[WorkflowList] FeatureGate refresh failed:", e),
          );
      }
    } catch (error) {
      console.error("[WorkflowList] Delete failed:", error);
      window.showNotification?.(
        window.I18n?.t("workflow.deleteFailed") || "Failed to delete workflow",
        "error",
      );
    }
  }
  async resetWorkflow(wfId) {
    const wf = this.workflows.find((w) => w.wf_id === wfId);
    if (!wf) return;
    if (
      window.workflowExecutor?.isRunning ||
      window.workflowExecutor?._executionTask
    ) {
      const forceOk = await window.customDialog.confirm(
        window.I18n?.t("workflowNotify.forceStopConfirm") ||
          "Workflow is running. Force stop and reset?",
        {
          title: "Force Reset",
          type: "warning",
          confirmText: "Force Reset",
          cancelText: window.I18n?.t("common.cancel") || "Cancel",
        },
      );
      if (!forceOk) return;
      try {
        window.workflowExecutor.stop(true, true);
        await window.workflowExecutor.waitForExecutionStopped?.();
      } catch (error) {
        window.showNotification?.(error.message, "error");
        return;
      }
    } else {
      const ok = await window.customDialog.confirm(
        window.I18n?.t("workflow.resetConfirm") ||
          "Reset this workflow? Status and results will be cleared.",
        { title: window.I18n?.t("workflow.reset") || "Reset workflow" },
      );
      if (!ok) return;
    }
    try {
      const running = await window.WorkflowExecutor?.getCrossContextRunning?.();
      if (running?.wf_id === wfId)
        await window.WorkflowExecutor.requestCrossContextStop(running);
      if (window.storageManager) {
        await window.storageManager.resetWorkflow(wfId);
      }
      window.eventBus?.emit("workflow:reset", { workflowId: wfId });
      try {
        chrome.runtime.sendMessage({
          action: "workflowExecutionEvent",
          event: "workflow:reset",
          data: { workflowId: wfId },
          _originSidebar: true,
        });
      } catch (e) {}
      window.showNotification?.(
        window.I18n?.t("workflow.resetSuccess") || "Workflow has been reset",
        "success",
      );
    } catch (error) {
      console.error("[WorkflowList] Reset failed:", error);
      window.showNotification?.(
        window.I18n?.t("workflow.resetFailed") || "Failed to reset workflow",
        "error",
      );
    }
  }
  async exportWorkflow(wfId) {
    if (!window.featureGate?.canUse("workflow_export")) {
      const label =
        window.featureGate?.getCrownLabel?.("workflow_export") || "Premium";
      window.showNotification?.(
        window.I18n?.t("workflow.exportLocked") || `Export workflow: ${label}`,
        "warning",
      );
      return;
    }
    try {
      let workflow = this.workflows.find((w) => w.wf_id === wfId);
      if (window.storageManager) {
        workflow = (await window.storageManager.getWorkflow(wfId)) || workflow;
      }
      if (!workflow) {
        window.showNotification?.(
          window.I18n?.t("workflow.noWorkflowToExport") ||
            "No workflow to export",
          "error",
        );
        return;
      }
      const exportData = window.WorkflowExportHelper.buildExportData(
        workflow.wf_name,
        workflow.description,
        workflow,
        workflow.nodes || [],
        workflow.edges || [],
      );
      const filename = window.WorkflowExportHelper.buildExportFilename(
        workflow.wf_name,
      );
      window.WorkflowExportHelper.downloadJson(exportData, filename);
      window.showNotification?.(
        window.I18n?.t("workflow.exportSuccess") ||
          "Workflow exported successfully",
        "success",
      );
      console.log("[WorkflowList] Workflow exported:", filename);
    } catch (error) {
      console.error("[WorkflowList] Export failed:", error);
      window.showNotification?.(
        window.I18n?.t("workflow.exportFailed") || "Export workflow failed",
        "error",
      );
    }
  }
  showLoading() {
    const listContainer = this.container.querySelector("#workflowList");
    if (listContainer) {
      listContainer.innerHTML = this._renderSkeletons(4);
    }
  }
  _renderSkeletons(count = 4) {
    const skeletons = [];
    for (let i = 0; i < count; i++) {
      skeletons.push(`
        <div class="workflow-card skeleton">
          <span class="skeleton-status skeleton-circle skeleton-base"></span>
          <div class="skeleton-info">
            <div class="skeleton-text" style="width: ${55 + Math.random() * 30}%; height: 14px;"></div>
            <div class="skeleton-text short" style="width: ${22 + Math.random() * 12}%; height: 11px;"></div>
            <div class="skeleton-text xs" style="width: ${18 + Math.random() * 10}%; height: 10px;"></div>
          </div>
          <div class="skeleton-actions">
            <div class="skeleton-btn skeleton-base" style="width: 32px; height: 18px; border-radius: 10px;"></div>
            <div class="skeleton-btn skeleton-base" style="width: 18px; height: 18px;"></div>
          </div>
        </div>
      `);
    }
    return skeletons.join("");
  }
  showSharedLoadingSkeleton(container) {
    if (!container) return;
    container.innerHTML = `
      <div class="workflow-list-container" style="overflow-y: auto; flex: 1; padding: 8px;">
        <div class="workflow-list">${this._renderSkeletons(3)}</div>
      </div>
    `;
  }
  showError(message) {
    const listContainer = this.container.querySelector("#workflowList");
    if (listContainer) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <p style="color: var(--destructive);">${message}</p>
        </div>
      `;
    }
  }
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text || "";
    return div.innerHTML;
  }
  _handleImportClick() {
    if (!window.featureGate?.canUse("workflow_import")) {
      const label =
        window.featureGate?.getCrownLabel?.("workflow_import") || "Premium";
      window.showNotification?.(
        window.I18n?.t("workflow.importLocked") || `Import workflow: ${label}`,
        "warning",
      );
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (file) {
        this._processImportFile(file);
      }
    };
    input.click();
  }
  _validateImportData(data) {
    const errors = [];
    const t = (key, params) => window.I18n?.t(key, params) || key;
    if (data.version !== "1.0") {
      errors.push(
        t("workflow.importVersionNotSupported") || "File version not supported",
      );
    }
    if (data.type !== "workflow") {
      errors.push(t("workflow.importTypeInvalid") || "Invalid file type");
    }
    if (!data.workflow) {
      errors.push(t("workflow.importMissingData") || "Missing workflow data");
      return { valid: false, errors };
    }
    if (!data.workflow.name || data.workflow.name.length > 100) {
      errors.push(t("workflow.importNameInvalid") || "Invalid workflow name");
    }
    if (!Array.isArray(data.workflow.nodes)) {
      errors.push(t("workflow.importMissingNodes") || "Missing nodes list");
    } else {
      const validTypes = [
        "start",
        "generate",
        "download",
        "delay",
        "telegram",
        "note",
        "image",
        "text",
        "text_extract",
        "chatgpt",
        "grok",
        "gemini",
        "muse",
        "prompt",
        "transform",
        "condition",
        "merge",
        "output",
      ];
      data.workflow.nodes.forEach((node, i) => {
        if (!node.node_id || !node.node_type) {
          errors.push(
            t("workflow.importNodeMissingIdType", { index: i + 1 }) ||
              `Node ${i + 1} is missing id or type`,
          );
        }
        if (node.node_type && !validTypes.includes(node.node_type)) {
          errors.push(
            t("workflow.importNodeTypeInvalid", {
              index: i + 1,
              type: node.node_type,
            }) || `Node ${i + 1} has an invalid type: ${node.node_type}`,
          );
        }
      });
    }
    if (!Array.isArray(data.workflow.edges)) {
      errors.push(t("workflow.importMissingEdges") || "Missing edges list");
    } else if (Array.isArray(data.workflow.nodes)) {
      const nodeIds = new Set(
        data.workflow.nodes.map((n) => n.node_id).filter(Boolean),
      );
      data.workflow.edges.forEach((edge, i) => {
        const srcId = edge.source_node_id || edge.source_node;
        const tgtId = edge.target_node_id || edge.target_node;
        if (srcId && !nodeIds.has(srcId)) {
          errors.push(
            t("workflow.importEdgeOrphan", {
              index: i + 1,
              side: "source",
              id: srcId,
            }) ||
              `Edge ${i + 1}: source node "${srcId}" kh\xF4ng t\u1ED3n t\u1EA1i`,
          );
        }
        if (tgtId && !nodeIds.has(tgtId)) {
          errors.push(
            t("workflow.importEdgeOrphan", {
              index: i + 1,
              side: "target",
              id: tgtId,
            }) ||
              `Edge ${i + 1}: target node "${tgtId}" kh\xF4ng t\u1ED3n t\u1EA1i`,
          );
        }
      });
    }
    if (Array.isArray(data.workflow.nodes) && window.featureGate) {
      try {
        const quota = window.featureGate.checkQuota("workflows_nodes_max");
        const limit = quota?.limit;
        if (
          limit !== "unlimited" &&
          limit !== "-1" &&
          limit > 0 &&
          data.workflow.nodes.length > limit
        ) {
          errors.push(
            t("workflow.importNodeQuotaExceeded", {
              count: data.workflow.nodes.length,
              limit,
            }) ||
              `Your plan allows a maximum of ${limit} nodes/workflow.

Imported workflow: ${data.workflow.nodes.length} nodes
Plan limit: ${limit} nodes

Upgrade to Premium to import this workflow.`,
          );
        }
      } catch (e) {}
    }
    return { valid: errors.length === 0, errors };
  }
  _convertImportedNodes(nodes) {
    const nodeIdMap = {};
    const result = nodes
      .map((node) => {
        const converted = { ...node };
        if (
          converted.node_type === "chatgpt" &&
          converted.provider === "gemini"
        ) {
          converted.node_type = "gemini";
        }
        const newNodeId = window.IdGenerator
          ? window.IdGenerator.next("node")
          : "node_" +
            Date.now() +
            "_" +
            Math.random().toString(36).substr(2, 9);
        nodeIdMap[node.node_id] = newNodeId;
        converted.node_id = newNodeId;
        console.log(
          "[Import] Node:",
          node.node_id,
          "ref_images:",
          node.ref_images,
        );
        if (node.ref_images && node.ref_images.length > 0) {
          const importKeys = [];
          converted.ref_thumbnails = {};
          converted.ref_file_names = {};
          node.ref_images.forEach((img, idx) => {
            const key = `upload_import_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`;
            importKeys.push(key);
            const hasVideoMeta = img.type === "video" || img.video_url;
            if (hasVideoMeta) {
              converted.ref_thumbnails[key] = {
                thumbnail: img.thumbnail || img.url || "",
                type: img.type || "video",
                ...(img.source_thumbnail && {
                  source_thumbnail: img.source_thumbnail,
                }),
                ...(img.persistent_media_id && {
                  persistent_media_id: img.persistent_media_id,
                }),
                ...(img.video_url && { video_url: img.video_url }),
              };
            } else {
              converted.ref_thumbnails[key] = img.thumbnail || img.url;
            }
            if (img.file_name) {
              converted.ref_file_names[key] = img.file_name;
            }
            console.log(
              "[Import] Created key:",
              key,
              "thumbnail:",
              converted.ref_thumbnails[key],
            );
          });
          converted.ref_file_ids = importKeys.join(", ");
          console.log("[Import] Final ref_file_ids:", converted.ref_file_ids);
          console.log(
            "[Import] Final ref_thumbnails:",
            converted.ref_thumbnails,
          );
        }
        [1, 2].forEach((n) => {
          const flatFileName = node[`frame_${n}_file_name`];
          const flatThumbnail = node[`frame_${n}_thumbnail`];
          const nested = node[`frame_${n}`];
          if (flatFileName) converted[`frame_${n}_file_name`] = flatFileName;
          else if (nested?.file_name)
            converted[`frame_${n}_file_name`] = nested.file_name;
          if (flatThumbnail) converted[`frame_${n}_thumbnail`] = flatThumbnail;
          else if (nested?.thumbnail)
            converted[`frame_${n}_thumbnail`] = nested.thumbnail;
          const portableThumb = flatThumbnail || nested?.thumbnail;
          const frameSource = node[`frame_${n}_source`] || nested?.source || "";
          converted[`frame_${n}_file_id`] =
            portableThumb && (!frameSource || frameSource === "manual")
              ? `upload_import_${Date.now()}_frame${n}_${Math.random().toString(36).substr(2, 5)}`
              : "";
        });
        return { converted, nodeIdMap };
      })
      .reduce(
        (acc, { converted, nodeIdMap: map }) => {
          acc.nodes.push(converted);
          Object.assign(acc.nodeIdMap, map);
          return acc;
        },
        { nodes: [], nodeIdMap: {} },
      );
    for (const cloned of result.nodes) {
      if (
        cloned.frame_1_source &&
        cloned.frame_1_source !== "manual" &&
        cloned.frame_1_source !== ""
      ) {
        cloned.frame_1_source =
          result.nodeIdMap[cloned.frame_1_source] || cloned.frame_1_source;
      }
      if (
        cloned.frame_2_source &&
        cloned.frame_2_source !== "manual" &&
        cloned.frame_2_source !== ""
      ) {
        cloned.frame_2_source =
          result.nodeIdMap[cloned.frame_2_source] || cloned.frame_2_source;
      }
    }
    return result;
  }
  _getUniqueName(baseName) {
    const existing = this.workflows.map((w) => w.wf_name);
    let name = baseName;
    let counter = 1;
    while (existing.includes(name)) {
      name = `${baseName} (${counter})`;
      counter++;
    }
    return name;
  }
  async _saveImportedWorkflow(importData) {
    const t = (key, params) => window.I18n?.t(key, params) || key;
    const { nodes: convertedNodes, nodeIdMap } = this._convertImportedNodes(
      importData.workflow.nodes,
    );
    convertedNodes.forEach((n) => {
      try {
        window.NodeTemplates?.normalizeNodeData?.(n);
      } catch (_) {}
    });
    const convertedEdges = (importData.workflow.edges || []).map((e) => {
      const oldSourceId = e.source_node_id || e.source_node;
      const oldTargetId = e.target_node_id || e.target_node;
      let inferredDataType = e.data_type;
      if (!inferredDataType) {
        const srcNode = importData.workflow.nodes?.find(
          (n) => n.node_id === oldSourceId,
        );
        const srcType = srcNode?.node_type;
        inferredDataType = ["text", "text_extract", "prompt"].includes(srcType)
          ? "text"
          : "image";
      }
      return {
        edge_id: window.IdGenerator
          ? window.IdGenerator.next("edge")
          : "edge_" +
            Date.now() +
            "_" +
            Math.random().toString(36).substr(2, 5),
        source_node_id: nodeIdMap[oldSourceId] || oldSourceId,
        source_handle: e.source_handle || e.source_output || "output_1",
        source_port: e.source_port || null,
        target_node_id: nodeIdMap[oldTargetId] || oldTargetId,
        target_handle: e.target_handle || e.target_input || "input_1",
        target_port: e.target_port || null,
        data_type: inferredDataType,
      };
    });
    console.log(
      "[WorkflowList] Converted edges:",
      convertedEdges.length,
      convertedEdges.slice(0, 2),
    );
    const importedSettings = importData.workflow.settings || {};
    const mappedSettings = {};
    if ("parallel" in importedSettings)
      mappedSettings.parallel_execution = importedSettings.parallel;
    if ("parallel_execution" in importedSettings)
      mappedSettings.parallel_execution = importedSettings.parallel_execution;
    if ("quantity" in importedSettings)
      mappedSettings.quantity = importedSettings.quantity;
    if ("delay_between_nodes" in importedSettings)
      mappedSettings.delay_between_nodes = importedSettings.delay_between_nodes;
    if ("timeout_per_node" in importedSettings)
      mappedSettings.timeout = importedSettings.timeout_per_node;
    if ("retry_on_error" in importedSettings)
      mappedSettings.max_retries = importedSettings.retry_on_error;
    if ("stop_on_error" in importedSettings)
      mappedSettings.stop_on_error = importedSettings.stop_on_error;
    const workflow = {
      wf_id: window.IdGenerator
        ? window.IdGenerator.next("wf")
        : "wf_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      wf_name: this._getUniqueName(importData.workflow.name),
      description: importData.workflow.description || "",
      settings_json: mappedSettings,
      created_source: "extension",
      project_id: window._currentProjectId || null,
      status: "idle",
      enabled: true,
      progress_completed: 0,
      progress_total: convertedNodes.length,
      current_node_id: null,
      sort_order: this.workflows.length || 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const nodesWithWfId = convertedNodes.map((n) => ({
      ...n,
      wf_id: workflow.wf_id,
      status: "pending",
      result_file_ids: "",
      result_thumbnails: {},
      result_file_names: {},
      result_provider_urls: {},
      result_text: "",
      result_source: null,
      error_message: "",
      executed_at: null,
    }));
    const edgesWithWfId = convertedEdges.map((e) => ({
      ...e,
      wf_id: workflow.wf_id,
    }));
    if (window.storageManager) {
      await window.storageManager.saveWorkflowFull(
        workflow,
        nodesWithWfId,
        edgesWithWfId,
      );
    }
    return workflow;
  }
  async _processImportFile(file) {
    const t = (key, params) => window.I18n?.t(key, params) || key;
    const dialog = window.customDialog || window.CustomDialog;
    try {
      const text = await file.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        dialog?.alert(t("workflow.importFileError") || "File read error", {
          type: "error",
        });
        return;
      }
      const validation = this._validateImportData(data);
      if (!validation.valid) {
        const isQuotaError = validation.errors.some(
          (err) =>
            err.includes("node") &&
            (err.includes("gi\u1EDBi h\u1EA1n") ||
              err.includes("limit") ||
              err.includes("quota")),
        );
        if (isQuotaError) {
          const shouldUpgrade = await dialog?.confirm(
            validation.errors.join("\n"),
            {
              title: t("workflow.importQuotaTitle") || "Plan limit exceeded",
              type: "warning",
              confirmText: t("common.upgrade") || "Upgrade",
              cancelText: t("common.cancel") || "Cancel",
            },
          );
          if (shouldUpgrade && typeof window.openUpgradeModal === "function") {
            window.openUpgradeModal();
          }
        } else {
          dialog?.alert(validation.errors.join("\n"), {
            title: t("workflow.importErrorTitle") || "Cannot import",
            type: "error",
          });
        }
        return;
      }
      if (window.featureGate) {
        const canCreate = await window.featureGate.canCreateWorkflowAsync();
        if (!canCreate) {
          const isLoggedIn = window.authManager?.isLoggedIn();
          if (!isLoggedIn) {
            window.featureGate.showLoginPrompt(
              t("workflow.requireLoginToImport") ||
                "Login required to import workflows",
            );
          } else {
            const quota = window.featureGate.checkQuota("workflows_max");
            const shouldUpgrade = await dialog?.confirm(
              t("workflow.quotaLimitReached", {
                limit: quota.limit,
                used: quota.used,
              }) ||
                `G\xF3i c\u1EE7a b\u1EA1n gi\u1EDBi h\u1EA1n t\u1ED1i \u0111a ${quota.limit} workflow. B\u1EA1n \u0111\xE3 c\xF3 ${quota.used} workflow. N\xE2ng c\u1EA5p Premium \u0111\u1EC3 t\u1EA1o kh\xF4ng gi\u1EDBi h\u1EA1n.`,
              {
                title: t("workflow.quotaLimitTitle") || "Limit reached",
                type: "warning",
                confirmText: t("common.upgrade") || "Upgrade",
                cancelText: t("common.later") || "Later",
              },
            );
            if (
              shouldUpgrade &&
              typeof window.openUpgradeModal === "function"
            ) {
              window.openUpgradeModal();
            }
          }
          return;
        }
      }
      if (
        window.ProjectHelper &&
        !(await window.ProjectHelper.ensureProjectOrGuide())
      ) {
        return;
      }
      this._debugImportData(data);
      const workflow = await this._saveImportedWorkflow(data);
      if (!workflow || !workflow.wf_id) {
        throw new Error(
          window.I18n?.t("workflowNotify.importSaveFailed") ||
            "Cannot save workflow \u2014 invalid data",
        );
      }
      console.log(
        "[WorkflowList] Workflow saved:",
        workflow.wf_id,
        workflow.wf_name,
      );
      if (window.featureGate && !window.authManager?.isLoggedIn()) {
        await window.featureGate.recordWorkflowCreated();
      }
      if (window.featureGate) {
        window.featureGate
          .refresh({ force: true })
          .catch((e) =>
            console.warn("[WorkflowList] FeatureGate refresh failed:", e),
          );
      }
      await this.loadWorkflows();
      dialog?.alert(
        t("workflow.importSuccess", { name: workflow.wf_name }) ||
          `Imported workflow "${workflow.wf_name}"`,
        { type: "success" },
      );
      window.eventBus?.emit("workflow:imported", {
        workflowId: workflow.wf_id,
      });
    } catch (err) {
      console.error("[WorkflowList] Import error:", err);
      if (
        err.code === "QUOTA_EXCEEDED" ||
        err.message?.includes("gi\u1EDBi h\u1EA1n")
      ) {
        return;
      }
      if (err.message === "REQUIRES_LOGIN") {
        window.featureGate?.showLoginPrompt(
          t("workflow.requireLoginToImport") ||
            "Login required to import workflows",
        );
        return;
      }
      dialog?.alert(
        (t("workflow.importFileError") || "File read error") +
          ":\n" +
          (err.message || "Unknown error"),
        { type: "error", title: t("common.error") || "Error" },
      );
    }
  }
  _debugImportData(data) {
    console.log("[WorkflowList] Import data structure:", {
      version: data.version,
      type: data.type,
      hasWorkflow: !!data.workflow,
      workflowName: data.workflow?.name,
      nodesCount: data.workflow?.nodes?.length || 0,
      edgesCount: data.workflow?.edges?.length || 0,
      edgesSample: data.workflow?.edges?.slice(0, 2),
    });
  }
  static _renderStatusIcon(status) {
    const s = status || "idle";
    const stroke =
      'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"';
    if (s === "running") {
      return `<svg class="status-icon-spin" width="14" height="14" viewBox="0 0 24 24" ${stroke}><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>`;
    }
    if (s === "completed") {
      return `<svg width="14" height="14" viewBox="0 0 24 24" ${stroke}><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    }
    if (s === "error" || s === "failed") {
      return `<svg width="14" height="14" viewBox="0 0 24 24" ${stroke}><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
    }
    return `<svg width="14" height="14" viewBox="0 0 24 24" ${stroke}><circle cx="12" cy="12" r="9"></circle></svg>`;
  }
  static _renderStatusLabel(status) {
    const I = window.I18n;
    const s = status || "idle";
    if (s === "running") return I?.t("workflow.statusRunning") || "Running";
    if (s === "completed")
      return I?.t("workflow.statusCompleted") || "Completed";
    if (s === "error" || s === "failed")
      return I?.t("workflow.statusFailed") || "Failed";
    if (s === "pending") return I?.t("workflow.statusPending") || "Pending";
    return (
      I?.t("workflow.statusIdle") || I?.t("workflow.statusPending") || "Ready"
    );
  }
  _renderSharedUsersAvatars(shares) {
    if (!shares || shares.length === 0) return "";
    const acceptedShares = shares.filter(
      (s) => s.status === "accepted" && s.recipient,
    );
    if (acceptedShares.length === 0) return "";
    const maxShow = 3;
    const displayShares = acceptedShares.slice(0, maxShow);
    const extraCount = acceptedShares.length - maxShow;
    let avatarsHtml = displayShares
      .map((share) => {
        const name = share.recipient.name || share.recipient.email || "User";
        const initial = name.charAt(0).toUpperCase();
        const email = share.recipient.email || "";
        const tooltip = `${this.escapeHtml(name)}${email ? ` (${this.escapeHtml(email)})` : ""}`;
        return `<span class="wf-share-avatar" title="${tooltip}" data-tooltip="${tooltip}">${initial}</span>`;
      })
      .join("");
    if (extraCount > 0) {
      avatarsHtml += `<span class="wf-share-avatar wf-share-avatar-more" title="+${extraCount} others">+${extraCount}</span>`;
    }
    return `<div class="wf-share-avatars">${avatarsHtml}</div>`;
  }
  handleShare(wfId) {
    const workflow = this.workflows.find((w) => w.wf_id === wfId);
    if (!workflow) {
      console.error("[WorkflowList] Workflow not found for sharing:", wfId);
      return;
    }
    if (workflow._is_shared_view) {
      window.showNotification?.(
        window.I18n?.t("workflow.cannotShareShared") ||
          "You cannot share a workflow that was shared with you",
        "warning",
      );
      return;
    }
    if (
      window.featureGate &&
      !window.featureGate.canUse("workflow_share_enabled")
    ) {
      window.featureGate.showModuleBlockedDialog("workflow_share");
      return;
    }
    if (window.ShareWorkflowModal) {
      window.ShareWorkflowModal.show(wfId);
    } else {
      console.error("[WorkflowList] ShareWorkflowModal not available");
      window.showNotification?.(
        window.I18n?.t("workflow.shareModalNotAvailable") ||
          "Sharing is not available yet",
        "error",
      );
    }
  }
  _showSharedCloneConfirmation(workflow) {
    return new Promise((resolve) => {
      const t = (k, fb) => {
        const v = window.I18n?.t?.(k);
        return v && v !== k ? v : fb;
      };
      const esc = (s) =>
        String(s == null ? "" : s).replace(
          /[&<>"']/g,
          (c) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
              "'": "&#39;",
            })[c],
        );
      const name =
        workflow.wf_name || workflow.name || t("workflow.unnamed", "Workflow");
      const nodeCount = (workflow.nodes || []).length;
      const html = `
        <div class="wf-confirm-modal-overlay" id="useSharedConfirmModal">
          <div class="wf-confirm-modal">
            <div class="wf-confirm-header">
              <h3 class="wf-confirm-title">${t("workflow.useSharedTitle", "Use workflow")}</h3>
              <button class="wf-confirm-close-btn" data-action="cancel" title="${t("common.close", "Close")}">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div class="wf-confirm-body">
              <div class="wf-confirm-template-info">
                <div class="wf-confirm-details">
                  <h4 class="wf-confirm-name">${esc(name)}</h4>
                  <div class="wf-confirm-meta">
                    <span class="wf-confirm-nodes">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M9 6h6a3 3 0 0 1 3 3v6"/></svg>
                      ${nodeCount} ${t("workflow.nodes", "nodes")}
                    </span>
                  </div>
                </div>
              </div>
              <div class="wf-confirm-message">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                <span>${t("workflow.useSharedMessage", "The workflow will be saved as a new copy in your account. You can edit it freely.")}</span>
              </div>
            </div>
            <div class="wf-confirm-footer">
              <button class="wf-confirm-cancel-btn" data-action="cancel">${t("common.cancel", "Cancel")}</button>
              <button class="wf-confirm-use-btn" data-action="confirm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                ${t("workflow.useTemplate", "Use template")}
              </button>
            </div>
          </div>
        </div>`;
      document
        .querySelectorAll("#useSharedConfirmModal")
        .forEach((el) => el.remove());
      const container = document.createElement("div");
      container.innerHTML = html;
      document.body.appendChild(container);
      const modal = container.querySelector("#useSharedConfirmModal");
      const onKey = (e) => {
        if (e.key === "Escape") handle("cancel");
      };
      const handle = (action) => {
        document.removeEventListener("keydown", onKey);
        container.remove();
        resolve(action === "confirm");
      };
      if (!modal) {
        container.remove();
        resolve(false);
        return;
      }
      modal.addEventListener("click", (e) => {
        const action = e.target.closest("[data-action]")?.dataset?.action;
        if (action) handle(action);
        else if (e.target === modal) handle("cancel");
      });
      document.addEventListener("keydown", onKey);
    });
  }
  async handleDuplicateFromShared(wfId, workflowObj = null) {
    if (this._isDuplicatingShared) {
      console.log(
        "[WorkflowList] Duplicate from shared already in progress, ignoring duplicate click",
      );
      return;
    }
    const workflow =
      workflowObj || this._sharedWorkflows.find((w) => w.wf_id === wfId);
    if (!workflow) {
      console.error("[WorkflowList] Shared workflow not found:", wfId);
      window.showNotification?.(
        window.I18n?.t("workflow.sharedNotFound") ||
          "Shared workflow not found",
        "error",
      );
      return;
    }
    const confirmed = await this._showSharedCloneConfirmation(workflow);
    if (!confirmed) return;
    this._isDuplicatingShared = true;
    try {
      if (!window.authManager?.isLoggedIn()) {
        window.featureGate?.showLoginPrompt(
          window.I18n?.t("workflow.requireLoginToClone") ||
            "Login required to clone workflows",
        );
        return;
      }
      if (window.featureGate) {
        const canCreate = await window.featureGate.canCreateWorkflowAsync();
        if (!canCreate) {
          const quota = window.featureGate.checkQuota("workflows_max");
          const shouldUpgrade = await window.customDialog?.confirm(
            window.I18n?.t("workflow.cloneQuotaExhausted", {
              limit: quota.limit,
              used: quota.used,
            }) ||
              `G\xF3i c\u1EE7a b\u1EA1n gi\u1EDBi h\u1EA1n t\u1ED1i \u0111a ${quota.limit} workflow. B\u1EA1n \u0111\xE3 c\xF3 ${quota.used} workflow. N\xE2ng c\u1EA5p Premium \u0111\u1EC3 nh\xE2n b\u1EA3n kh\xF4ng gi\u1EDBi h\u1EA1n.`,
            {
              title: window.I18n?.t("workflow.quotaReached") || "Limit reached",
              type: "warning",
              confirmText: window.I18n?.t("common.upgrade") || "Upgrade",
              cancelText: window.I18n?.t("common.later") || "Later",
            },
          );
          if (shouldUpgrade) {
            if (typeof window.openUpgradeModal === "function") {
              window.openUpgradeModal();
            } else {
              try {
                chrome.runtime.sendMessage({ action: "showUpgradeModal" });
              } catch (e) {}
            }
          }
          return;
        }
      }
      if (
        window.ProjectHelper &&
        !(await window.ProjectHelper.ensureProjectOrGuide())
      ) {
        return;
      }
      window.showNotification?.(
        window.I18n?.t("workflow.duplicatingShared") || "Saving workflow...",
        "success",
        2e3,
      );
      const baseUrl = window.ApiBaseConfig.get();
      const token = await window.authManager.getToken();
      const response = await fetch(
        `${baseUrl}/shared-workflows/${wfId}/clone`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "X-Extension-Id": chrome.runtime.id,
          },
          body: JSON.stringify({
            project_id: window._currentProjectId || null,
          }),
        },
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errCode = json?.error?.code || json?.code;
        const errMsg =
          json?.error?.message || json?.message || `HTTP ${response.status}`;
        if (errCode === "QUOTA_EXCEEDED" || errCode === "FEATURE_DISABLED") {
          const shouldUpgrade = await window.customDialog?.confirm(errMsg, {
            title: window.I18n?.t("workflow.quotaReached") || "Limit reached",
            type: "warning",
            confirmText: window.I18n?.t("common.upgrade") || "Upgrade",
            cancelText: window.I18n?.t("common.later") || "Later",
          });
          if (shouldUpgrade && typeof window.openUpgradeModal === "function") {
            window.openUpgradeModal();
          }
          return;
        }
        window.showNotification?.(
          (window.I18n?.t("workflow.duplicateSharedFailed") ||
            "Could not use workflow") +
            ": " +
            errMsg,
          "error",
        );
        return;
      }
      const data = json.data || json;
      console.log("[WorkflowList] Duplicated shared workflow:", data);
      window.showNotification?.(
        window.I18n?.t("workflow.duplicateSharedSuccess") ||
          "Workflow duplicated successfully",
        "success",
      );
      await this.loadWorkflows();
      if (window.featureGate) {
        window.featureGate
          .refresh({ force: true })
          .catch((e) =>
            console.warn("[WorkflowList] FeatureGate refresh failed:", e),
          );
      }
      const workflowsTab = document.querySelector('[data-subtab="workflows"]');
      if (workflowsTab) {
        workflowsTab.click();
      }
      const newWorkflow = data.workflow || data;
      if (newWorkflow?.wf_id) {
        setTimeout(() => {
          if (this._openWorkflow) {
            this._openWorkflow(newWorkflow.wf_id);
          } else if (window.eventBus) {
            window.eventBus.emit("workflow:open_editor", {
              mode: "edit",
              workflow: newWorkflow,
            });
          }
        }, 300);
      }
    } catch (error) {
      console.error("[WorkflowList] Duplicate from shared failed:", error);
      window.showNotification?.(
        (window.I18n?.t("workflow.duplicateSharedFailed") ||
          "Could not use workflow") +
          ": " +
          error.message,
        "error",
      );
    } finally {
      this._isDuplicatingShared = false;
    }
  }
  _formatSharedTime(dateStr) {
    if (!dateStr) return "";
    const normalized =
      typeof dateStr === "string" && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(dateStr)
        ? dateStr.replace(" ", "T") + "Z"
        : dateStr;
    const date = new Date(normalized);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1e3);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    if (diffSec < 60) {
      return t("notification.time.justNow", "Just now");
    } else if (diffMin < 60) {
      return `${diffMin} ${t("notification.time.minutesAgo", "minutes ago")}`;
    } else if (diffHour < 24) {
      return `${diffHour} ${t("notification.time.hoursAgo", "hours ago")}`;
    } else if (diffDay < 7) {
      return `${diffDay} ${t("notification.time.daysAgo", "days ago")}`;
    } else {
      const day = date.getDate().toString().padStart(2, "0");
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    }
  }
}
window.WorkflowList = WorkflowList;
