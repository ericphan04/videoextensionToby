class TaskList {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.tasks = [];
    this.selectedTasks = new Set();
    this.searchQuery = "";
    this.runMode = "parallel";
    this.isRunningAll = false;
    this.shouldStopAll = false;
    this._filterProjectId = null;
    this._projectNames = {};
    this._pageSize = 20;
    this._currentPage = 1;
    this._lastPage = 1;
    this._total = 0;
    this._loading = false;
    this._lastUpdatedTaskId = null;
    this._executionCooldown = false;
    this.init();
  }
  init() {
    this.render();
    this.bindEvents();
    this._setupEventDelegation();
    this._initialLoad = true;
    this.loadTasks();
    if (window.eventBus) {
      window.eventBus.on("task:status_changed", async (data) => {
        if (data.status === "completed" && window.featureGate) {
          await window.featureGate.recordPendingTaskRun();
        }
        if (data.taskId && Array.isArray(this.tasks)) {
          this._lastUpdatedTaskId = data.taskId;
          const taskIdx = this.tasks.findIndex(
            (t) => t.task_id === data.taskId,
          );
          if (taskIdx >= 0) {
            const cached = this.tasks[taskIdx];
            if (data.status) {
              cached.status = data.status;
            }
            if (data.result_file_ids) {
              cached.result_file_ids = data.result_file_ids;
            }
            if (
              data.result_provider_urls &&
              typeof data.result_provider_urls === "object"
            ) {
              cached.result_provider_urls = { ...data.result_provider_urls };
            }
            if (
              Array.isArray(data.result_thumbnails) &&
              data.result_thumbnails.length > 0
            ) {
              const thumbsMap = {};
              const ids = (data.result_file_ids || "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              ids.forEach((id, idx) => {
                if (data.result_thumbnails[idx]) {
                  thumbsMap[id] = data.result_thumbnails[idx];
                }
              });
              if (Object.keys(thumbsMap).length > 0) {
                cached.result_thumbnails = thumbsMap;
              }
            }
            this._updateCardRunningState(
              data.taskId,
              data.status === "running",
              data.status,
            );
            this._debouncedUpdateSingleTask(data.taskId);
          } else {
            this._debouncedLoadTasks();
          }
        } else {
          this._debouncedLoadTasks();
        }
      });
      window.eventBus.on("task:progress", (data) => {
        if (data.taskId) this._lastUpdatedTaskId = data.taskId;
        this._updateTaskProgress(data.taskId, data.completed, data.total);
      });
      window.eventBus.on("tasks:batch_complete", () => {
        if (!this._isRunningAllInFlight) this._resetRunAllButton();
        this._executionCooldown = true;
        setTimeout(() => {
          this._executionCooldown = false;
        }, 5e3);
        setTimeout(() => {
          this._lastUpdatedTaskId = null;
        }, 2e3);
      });
      window.eventBus.on("tasks:all_submitted", () => {
        if (!this._isRunningAllInFlight) this._resetRunAllButton();
      });
      window.eventBus.on("execution:lock_changed", (state) => {
        this._updateLockState(state);
      });
      window.eventBus.on("project:changed", () => {
        this.loadTasks();
      });
      window.eventBus.on("auth:login", () => {
        this.loadTasks();
      });
      window.eventBus.on("auth:logout", () => {
        this.tasks = [];
        this._currentPage = 1;
        this.render();
        this.bindEvents();
        this._setupEventDelegation();
        this.renderTaskList();
      });
      window.eventBus.on("storage:mode_changed", (data) => {
        if (data?.mode === "api") this.loadTasks();
      });
      window.eventBus.on("i18n:changed", () => {
        this.render();
        this.bindEvents();
        this._setupEventDelegation();
        this.renderTaskList();
      });
      window.eventBus.on("storage:task_saved", (data) => {
        const taskId = data?.taskId || data?.task_id;
        if (taskId) {
          this._debouncedUpdateSingleTask(taskId);
        } else {
          this._debouncedLoadTasks();
        }
      });
      window.eventBus.on("storage:task_deleted", () =>
        this._debouncedLoadTasks(),
      );
      window.eventBus.on("flow:video_identities_updated", () =>
        this._syncNativeMediaIdentities().catch((error) =>
          console.warn(
            "[TaskMediaIdentity] native sync failed:",
            error?.message,
          ),
        ),
      );
    }
  }
  async loadTasks(append = false) {
    if (
      (this.isRunningAll || this._executionCooldown) &&
      this._lastUpdatedTaskId &&
      !append
    ) {
      console.log("[TaskList] BLOCKED loadTasks - running or cooldown");
      return;
    }
    if (this._loading) return;
    this._loading = true;
    try {
      if (!append) {
        this.showLoading();
        this._currentPage = 1;
      }
      if (
        window.authManager?.isLoggedIn() &&
        window.storageManager?.getMode?.() === "local"
      ) {
        try {
          await window.storageManager.switchToApi();
        } catch (e) {
          console.warn("[TaskList] switchToApi failed:", e.message);
        }
      }
      if (window.storageManager) {
        const page = append ? this._currentPage + 1 : 1;
        const result = await window.storageManager.getTasks({
          page,
          per_page: this._pageSize,
        });
        const newTasks = (result.data || []).filter(
          (t) => !t.platform || t.platform === "flow",
        );
        if (append) {
          this.tasks = [...this.tasks, ...newTasks];
        } else {
          this.tasks = newTasks;
        }
        this._currentPage = result.meta?.current_page || page;
        this._lastPage = result.meta?.last_page || 1;
        this._total = result.meta?.total || this.tasks.length;
        console.log(
          "[TaskList] Loaded page",
          this._currentPage,
          "/",
          this._lastPage,
          "- total:",
          this._total,
        );
        await this._cacheProjectNames();
        if (this._initialLoad && !append) {
          this._initialLoad = false;
          const STUCK_THRESHOLD_MS = 15 * 60 * 1e3;
          const now = Date.now();
          for (const task of this.tasks) {
            if (task.status !== "running") continue;
            const updatedAt = task.updated_at
              ? new Date(task.updated_at).getTime()
              : 0;
            const ageMs = updatedAt > 0 ? now - updatedAt : Infinity;
            if (ageMs >= STUCK_THRESHOLD_MS) {
              console.log(
                "[TaskList] Reset stuck task",
                task.task_id,
                `(running for ${Math.round(ageMs / 6e4)} min)`,
              );
              task.status = "pending";
              await window.storageManager
                .updateTaskStatus(task.task_id, "pending")
                .catch(() => {});
            } else {
              console.log(
                "[TaskList] Skip reset task",
                task.task_id,
                `(running ${Math.round(ageMs / 6e4)} min < 15 min threshold)`,
              );
            }
          }
        }
      }
      await this.renderTaskList();
      this._checkBatchComplete();
      this._syncNativeMediaIdentities().catch((error) =>
        console.warn("[TaskMediaIdentity] load sync failed:", error?.message),
      );
    } catch (error) {
      console.error("[TaskList] Load failed:", error);
      console.warn("[TaskList] Load context:", {
        code: error?.code || null,
        httpStatus: error?.httpStatus || null,
        storageMode: window.storageManager?.getMode?.() || null,
        loadedTasks: this.tasks.length,
        page: this._currentPage,
      });
      this.showError(
        window.I18n?.t("tasks.loadFailed") || "Failed to load task list",
      );
    } finally {
      this._loading = false;
    }
  }
  _debouncedLoadTasks() {
    if (
      (this.isRunningAll || this._executionCooldown) &&
      this._lastUpdatedTaskId
    ) {
      console.log(
        "[TaskList] Skip loadTasks - running or cooldown, use single update instead",
      );
      if (this._loadCoalesceTimer) {
        clearTimeout(this._loadCoalesceTimer);
        this._loadCoalesceTimer = null;
      }
      this._debouncedUpdateSingleTask(this._lastUpdatedTaskId);
      return;
    }
    if (this._loadCoalesceTimer) clearTimeout(this._loadCoalesceTimer);
    this._loadCoalesceTimer = setTimeout(() => {
      this._loadCoalesceTimer = null;
      if (
        (this.isRunningAll || this._executionCooldown) &&
        this._lastUpdatedTaskId
      ) {
        console.log("[TaskList] Skip loadTasks in timer - running or cooldown");
        return;
      }
      this.loadTasks();
    }, 1e3);
  }
  _debouncedUpdateSingleTask(taskId) {
    if (!taskId) return;
    console.log("[TaskList] _debouncedUpdateSingleTask called:", taskId);
    this._lastUpdatedTaskId = taskId;
    const key = `_updateTimer_${taskId}`;
    if (this[key]) clearTimeout(this[key]);
    this[key] = setTimeout(() => {
      this[key] = null;
      this._updateSingleTaskInList(taskId);
    }, 500);
  }
  async _updateSingleTaskInList(taskId) {
    if (!taskId) return;
    try {
      let task = null;
      if (window.storageManager) {
        try {
          task = await window.storageManager.getTask(taskId);
          if (task) {
            const existingIdx = this.tasks.findIndex(
              (t) => t.task_id === taskId,
            );
            if (existingIdx >= 0) {
              this.tasks[existingIdx] = task;
            } else {
              this.tasks.unshift(task);
            }
          }
        } catch (e) {
          console.warn("[TaskList] Fetch single task failed:", e.message);
          task = this.tasks.find((t) => t.task_id === taskId);
        }
      }
      if (!task) return;
      const cardEl = this._listContainer?.querySelector(
        `.task-card[data-task-id="${taskId}"]`,
      );
      if (cardEl) {
        this._updateCard(cardEl, task);
      } else {
        this.renderTaskList();
      }
    } catch (error) {
      console.warn("[TaskList] _updateSingleTaskInList failed:", error.message);
    }
  }
  _updateCardRunningState(taskId, isRunning, finalStatus = null) {
    const cardEl = this._listContainer?.querySelector(
      `.task-card[data-task-id="${taskId}"]`,
    );
    if (!cardEl) {
      console.warn("[TaskList] Card not found for taskId:", taskId);
      return;
    }
    cardEl.classList.remove(
      "pending",
      "running",
      "completed",
      "failed",
      "skipped",
    );
    const newStatus = isRunning ? "running" : finalStatus || "pending";
    cardEl.classList.add(newStatus);
    const checkbox = cardEl.querySelector(".task-card-checkbox input");
    if (checkbox) {
      checkbox.disabled = isRunning;
    }
    const statusDot = cardEl.querySelector(".task-card-status");
    if (statusDot) {
      const lbl = TaskList._renderStatusLabel(newStatus);
      statusDot.className = `task-card-status ${newStatus}`;
      statusDot.innerHTML = TaskList._renderStatusIcon(newStatus);
      statusDot.setAttribute("title", lbl);
      statusDot.setAttribute("aria-label", lbl);
    }
    const nameRow = cardEl.querySelector(".task-card-name-row");
    const existingProgress = cardEl.querySelector(".task-card-inline-progress");
    if (isRunning && !existingProgress && nameRow) {
      const progressEl = document.createElement("span");
      progressEl.className = "task-card-inline-progress indeterminate";
      progressEl.innerHTML =
        '<span class="task-card-inline-progress-bar"></span>';
      nameRow.appendChild(progressEl);
    } else if (!isRunning && existingProgress) {
      existingProgress.remove();
    }
    const actionsEl = cardEl.querySelector(".task-card-actions");
    if (actionsEl) {
      const hadRunning = !!actionsEl.querySelector(".run-btn.btn-warning");
      if (hadRunning !== isRunning) {
        const task = this.tasks.find((t) => t.task_id === taskId);
        if (task) {
          task.status = newStatus;
          const newHtml = this.renderTaskCard(task);
          const temp = document.createElement("div");
          temp.innerHTML = newHtml;
          const newCard = temp.firstElementChild;
          if (newCard) {
            const newActions = newCard.querySelector(".task-card-actions");
            if (newActions) actionsEl.innerHTML = newActions.innerHTML;
          }
        }
      }
    }
  }
  render() {
    const authGate = this.container.querySelector(".auth-gate-overlay");
    this.container.innerHTML = `
      <div class="task-toolbar">
        <div class="task-toolbar-left">
          <button class="btn btn-secondary btn-sm btn-toolbar-icon" id="taskSearchToggle" title="${I18n.t("common.search")}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
          </button>
          <button class="btn btn-secondary btn-sm btn-toolbar-icon" id="refreshTasksBtn" title="${I18n.t("common.reload")}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
          </button>
        </div>
        <div class="task-toolbar-right">
          <select class="task-project-select-inline hidden" id="taskProjectSelectInline" title="${I18n.t("workflow.filterByProject")}"></select>
          <button class="btn btn-secondary btn-sm task-run-mode-btn" id="taskRunModeBtn" title="${I18n.t("tasks.runMode")}: ${I18n.t("tasks.parallel")}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="4" y1="6" x2="20" y2="6"></line>
              <line x1="4" y1="12" x2="20" y2="12"></line>
              <line x1="4" y1="18" x2="20" y2="18"></line>
            </svg>
            <span class="task-run-mode-label">${I18n.t("tasks.parallel")}</span>
          </button>
          <button class="btn btn-secondary btn-sm" id="runAllTasksBtn" title="${I18n.t("tasks.runAll")}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            ${I18n.t("tasks.runAll")}
          </button>
          <button class="btn btn-primary btn-sm btn-icon-text btn-add-short" id="addTaskBtn" title="${I18n.t("tasks.addTask")}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            ${I18n.t("tasks.add")}
          </button>
        </div>
      </div>
      <div class="task-batch-progress hidden" id="taskBatchProgress">
        <div class="batch-progress-info">
          <span class="batch-progress-label" id="taskBatchProgressLabel">${I18n.t("tasks.runningTasks")}</span>
          <span class="batch-progress-count" id="taskBatchProgressCount">0/0</span>
        </div>
        <div class="batch-progress-bar">
          <div class="batch-progress-fill" id="taskBatchProgressFill"></div>
        </div>
      </div>
      <div class="task-search-row ${this.searchQuery ? "" : "hidden"}" id="taskSearchRow">
        <div class="task-search-input-wrapper">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
          <input type="text" placeholder="${I18n.t("tasks.search")}" id="taskSearchInput" />
          <button class="task-search-close" id="taskSearchClose" title="${I18n.t("common.close")}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
      <div class="batch-actions hidden" id="batchActions">
        <span class="batch-actions-count"><span id="selectedCount">0</span> ${I18n.t("tasks.selected")}</span>
        <button class="btn btn-secondary btn-sm" id="runSelectedBtn">${I18n.t("common.run")}</button>
        <button class="btn btn-secondary btn-sm btn-danger" id="deleteSelectedBtn">${I18n.t("common.delete")}</button>
      </div>
      <div class="task-list" id="taskListContainer">
        <div class="task-empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"></path>
            <rect x="9" y="3" width="6" height="4" rx="2"></rect>
          </svg>
          <p>${I18n.t("tasks.noTasks")}</p>
          <button class="btn btn-primary btn-sm" id="addFirstTaskBtn">${I18n.t("tasks.addFirstTask")}</button>
        </div>
      </div>
    `;
    this.container.querySelector("#taskSearchInput").value =
      this.searchQuery || "";
    if (authGate) this.container.prepend(authGate);
  }
  async _checkAndOpenTaskModal() {
    if (this._openingTaskModal) return;
    this._openingTaskModal = true;
    const addButtons = this.container.querySelectorAll(
      "#addTaskBtn, #addFirstTaskBtn",
    );
    addButtons.forEach((button) => {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    });
    try {
      if (window.featureGate) {
        const canCreate = await window.featureGate.canCreateTaskAsync();
        if (!canCreate) {
          const isLoggedIn = window.authManager?.isLoggedIn();
          if (!isLoggedIn) {
            window.featureGate.showLoginPrompt(
              window.I18n?.t("tasks.requireLoginToCreate") ||
                "Login required to create tasks",
            );
          } else {
            const quota = window.featureGate.checkQuota("tasks_max");
            console.log("[TaskList] Task quota exceeded:", quota);
            if (window.customDialog?.confirm) {
              const shouldUpgrade = await window.customDialog.confirm(
                window.I18n?.t("tasks.quotaLimitMsg", {
                  limit: quota.limit,
                  used: quota.used,
                }) ||
                  `Your plan allows up to ${quota.limit} tasks. You already have ${quota.used} tasks. Upgrade to Premium for unlimited creation.`,
                {
                  title:
                    window.I18n?.t("tasks.quotaLimitTitle") || "Limit Reached",
                  type: "warning",
                  confirmText: window.I18n?.t("common.upgrade") || "Upgrade",
                  cancelText: window.I18n?.t("common.later") || "Later",
                },
              );
              if (
                shouldUpgrade &&
                typeof window.openUpgradeModal === "function"
              )
                window.openUpgradeModal();
            } else {
              window.featureGate.showModuleBlockedDialog?.("tasks");
            }
          }
          return;
        }
      }
      if (!window.taskModal && window.TaskModal)
        window.taskModal = new window.TaskModal();
      if (window.taskModal?.open) {
        await window.taskModal.open("create");
      } else if (window.eventBus) {
        window.eventBus.emit("task:open_modal", { mode: "create" });
      } else {
        throw new Error("TASK_MODAL_UNAVAILABLE");
      }
    } catch (error) {
      console.error("[TaskList] Cannot open create task modal:", error);
      window.showNotification?.(
        window.I18n?.t("common.connectionError") ||
          "Kh\xF4ng th\u1EC3 m\u1EDF form t\u1EA1o task. Vui l\xF2ng th\u1EED l\u1EA1i.",
        "error",
      );
    } finally {
      this._openingTaskModal = false;
      addButtons.forEach((button) => {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      });
    }
  }
  bindEvents() {
    const searchToggle = this.container.querySelector("#taskSearchToggle");
    const searchRow = this.container.querySelector("#taskSearchRow");
    const searchInput = this.container.querySelector("#taskSearchInput");
    const searchClose = this.container.querySelector("#taskSearchClose");
    if (searchToggle && searchRow) {
      searchToggle.addEventListener("click", () => {
        const isHidden = searchRow.classList.contains("hidden");
        searchRow.classList.toggle("hidden");
        if (isHidden && searchInput) {
          searchInput.focus();
        }
      });
    }
    if (searchClose && searchRow) {
      searchClose.addEventListener("click", () => {
        searchRow.classList.add("hidden");
        if (searchInput) {
          searchInput.value = "";
        }
        this.searchQuery = "";
        this._currentPage = 1;
        this.renderTaskList();
      });
    }
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.searchQuery = e.target.value.toLowerCase();
        this._currentPage = 1;
        this.renderTaskList();
      });
    }
    const refreshBtn = this.container.querySelector("#refreshTasksBtn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => this.loadTasks());
    }
    const addTaskBtn = this.container.querySelector("#addTaskBtn");
    const addFirstTaskBtn = this.container.querySelector("#addFirstTaskBtn");
    if (addTaskBtn)
      addTaskBtn.addEventListener("click", () => {
        void this._checkAndOpenTaskModal();
      });
    if (addFirstTaskBtn)
      addFirstTaskBtn.addEventListener("click", () => {
        void this._checkAndOpenTaskModal();
      });
    const runModeBtn = this.container.querySelector("#taskRunModeBtn");
    if (runModeBtn) {
      runModeBtn.addEventListener("click", () => this.toggleRunMode());
    }
    const runAllBtn = this.container.querySelector("#runAllTasksBtn");
    if (runAllBtn) {
      runAllBtn.addEventListener("click", () => {
        if (this.isRunningAll) {
          this.stopAllTasks();
        } else {
          this.runAllTasks();
        }
      });
    }
    const runSelectedBtn = this.container.querySelector("#runSelectedBtn");
    const deleteSelectedBtn =
      this.container.querySelector("#deleteSelectedBtn");
    if (runSelectedBtn) {
      runSelectedBtn.addEventListener("click", () => this.runSelected());
    }
    if (deleteSelectedBtn) {
      deleteSelectedBtn.addEventListener("click", () => this.deleteSelected());
    }
  }
  async renderTaskList() {
    const container = this.container.querySelector("#taskListContainer");
    if (!container) return;
    const runAllBtn = this.container.querySelector("#runAllTasksBtn");
    const runModeBtn = this.container.querySelector("#taskRunModeBtn");
    if (runAllBtn) {
      runAllBtn.classList.toggle("hidden", this.tasks.length === 0);
    }
    if (runModeBtn) {
      runModeBtn.classList.toggle("hidden", this.tasks.length === 0);
      const enabled = this.tasks.filter((t) => t.enabled);
      const hasChatGPT = enabled.some(
        (t) => (t.provider || "flow") === "chatgpt",
      );
      const hasGrok = enabled.some((t) => (t.provider || "flow") === "grok");
      const hasMuse = enabled.some((t) => (t.provider || "flow") === "muse");
      const providerSet = new Set(enabled.map((t) => t.provider || "flow"));
      const hasMixed = providerSet.size > 1;
      const hasMultiPrompt = enabled.some(
        (t) => t.multi_prompt && t.prompts?.length > 1,
      );
      const forceSeq =
        hasChatGPT || hasGrok || hasMuse || hasMixed || hasMultiPrompt;
      if (forceSeq) {
        if (this.runMode !== "sequential") {
          this._savedRunModeBeforeForce = this.runMode;
          this.runMode = "sequential";
          this.updateRunModeButton?.();
        }
        runModeBtn.disabled = true;
        runModeBtn.classList.add("disabled");
        const reasonKey = hasChatGPT
          ? "tasks.forceSeqChatGPT"
          : hasGrok
            ? "tasks.forceSeqGrok"
            : hasMuse
              ? "tasks.forceSeqMuse"
              : hasMixed
                ? "tasks.forceSeqMixed"
                : "tasks.forceSeqMultiPrompt";
        const reasonText = hasChatGPT
          ? window.I18n?.t(reasonKey) ||
            "ChatGPT only runs sequentially (1 tab / 1 editor)"
          : hasGrok
            ? window.I18n?.t(reasonKey) ||
              "Grok only runs sequentially (1 tab / 1 editor + redirect flow)"
            : hasMuse
              ? window.I18n?.t(reasonKey) ||
                "Muse only runs sequentially (1 tab / 1 composer)"
              : hasMixed
                ? window.I18n?.t(reasonKey) ||
                  "Mixed providers \u2014 sequential to avoid tab conflicts"
                : window.I18n?.t(reasonKey) ||
                  "Multi-prompt task present \u2014 automatically sequential";
        runModeBtn.title = reasonText;
        runModeBtn.setAttribute("data-tooltip", reasonText);
      } else {
        runModeBtn.disabled = false;
        runModeBtn.classList.remove("disabled");
        if (this._savedRunModeBeforeForce !== void 0) {
          this.runMode = this._savedRunModeBeforeForce;
          this._savedRunModeBeforeForce = void 0;
          this.updateRunModeButton?.();
        }
      }
    }
    if (this.isRunningAll && runAllBtn) {
      this._setRunAllButtonRunning();
    }
    await this._renderProjectFilter();
    let filteredTasks = this.tasks;
    if (this._filterProjectId) {
      if (this._filterProjectId === "__legacy__") {
        filteredTasks = this.tasks.filter((t) => !t.project_id);
      } else {
        filteredTasks = this.tasks.filter(
          (t) => t.project_id === this._filterProjectId,
        );
      }
    }
    if (this.searchQuery) {
      filteredTasks = filteredTasks.filter(
        (t) =>
          t.task_name?.toLowerCase().includes(this.searchQuery) ||
          t.prompt?.toLowerCase().includes(this.searchQuery),
      );
    }
    if (filteredTasks.length === 0) {
      container.innerHTML = `
        <div class="task-empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"></path>
            <rect x="9" y="3" width="6" height="4" rx="2"></rect>
          </svg>
          <p>${this.searchQuery ? window.I18n?.t("tasks.noSearchResult") || "No tasks found" : I18n.t("tasks.noTasks")}</p>
          ${!this.searchQuery ? `<button class="btn btn-primary btn-sm" id="addFirstTaskBtn">${I18n.t("tasks.addFirstTask")}</button>` : ""}
        </div>
      `;
      container
        .querySelector("#addFirstTaskBtn")
        ?.addEventListener("click", () => this._checkAndOpenTaskModal());
      return;
    }
    const currentUserId = window.authManager?.user?.id;
    const legacyTasks = this.tasks.filter((t) => {
      if (t.project_id) return false;
      if (t.user?.id && currentUserId) return t.user.id === currentUserId;
      return true;
    });
    const migrationBanner =
      window.ProjectHelper?.renderMigrationBanner?.(
        legacyTasks.length,
        "task",
      ) || "";
    const visibleTasks = filteredTasks;
    const hasMore = this._currentPage < this._lastPage;
    const remaining = this._total - this.tasks.length;
    let renderItems = [];
    if (migrationBanner) {
      renderItems.push({
        type: "header",
        html: migrationBanner,
        key: "__migrate_banner__",
      });
    }
    if (!this._filterProjectId && window.ProjectHelper) {
      const grouped = await window.ProjectHelper.sortByProjectGroup(
        visibleTasks,
        window._currentProjectId,
      );
      for (const entry of grouped) {
        if (entry.type === "header") {
          renderItems.push({
            type: "header",
            html: window.ProjectHelper.renderGroupHeader(
              entry.projectName,
              entry.count,
              entry.isCurrent,
            ),
            key: `header_${entry.projectName}`,
          });
        } else {
          renderItems.push({
            type: "task",
            task: entry.item,
            key: entry.item.task_id,
          });
        }
      }
    } else {
      visibleTasks.sort((a, b) => {
        if (a.sort_order !== void 0 && b.sort_order !== void 0)
          return a.sort_order - b.sort_order;
        if (a.sort_order !== void 0) return -1;
        if (b.sort_order !== void 0) return 1;
        return (b.created_at || 0) - (a.created_at || 0);
      });
      for (const task of visibleTasks) {
        renderItems.push({ type: "task", task, key: task.task_id });
      }
    }
    if (hasMore) {
      const loadMoreLabel = window.I18n?.t("common.loadMore") || "Load more";
      const loadMoreHtml = `
        <div class="tobyflow-load-more-row">
          <button class="tobyflow-load-more-btn" id="taskLoadMoreBtn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            ${loadMoreLabel}
            <span class="tobyflow-load-more-count">${this.tasks.length} / ${this._total}</span>
          </button>
        </div>`;
      renderItems.push({
        type: "header",
        html: loadMoreHtml,
        key: `__loadmore_${this._currentPage}_${this._lastPage}`,
      });
    }
    this._renderIncremental(container, renderItems);
    container
      .querySelector("#taskLoadMoreBtn")
      ?.addEventListener("click", () => {
        if (!this._loading) {
          this.loadTasks(true);
        }
      });
    container
      .querySelector('.legacy-migrate-banner[data-type="task"]')
      ?.addEventListener("click", async (e) => {
        const btn = e.target.closest(".legacy-migrate-btn");
        if (!btn) return;
        const action = btn.dataset.action;
        if (action === "skip") {
          sessionStorage.setItem("legacy_migrate_task_dismissed", "1");
          this.renderTaskList();
        } else if (action === "assign") {
          const count = await window.ProjectHelper.migrateLegacyItems(
            legacyTasks,
            "task",
          );
          if (count > 0) {
            window.showNotification?.(
              window.I18n?.t("project.migrateSuccess", { count }) ||
                `Assigned ${count} item(s) to the current project`,
              "success",
              2500,
            );
            await this.loadTasks();
          }
        }
      });
    this._loadRefThumbnails(container);
    this._handleExpiredResultThumbnails(container);
  }
  async _renderProjectFilter() {
    const select = this.container.querySelector("#taskProjectSelectInline");
    if (!select) return;
    if (this.tasks.length === 0) {
      select.classList.add("hidden");
      return;
    }
    const counts = {};
    for (const t2 of this.tasks) {
      const pid = t2.project_id || "__legacy__";
      counts[pid] = (counts[pid] || 0) + 1;
    }
    const projectIds = new Set(Object.keys(counts));
    if (this._filterProjectId && !projectIds.has(this._filterProjectId)) {
      console.info("[TaskList] Reset unavailable project filter", {
        projectId: this._filterProjectId,
        loadedTasks: this.tasks.length,
      });
      this._filterProjectId = null;
    }
    select.classList.remove("hidden");
    const projects = (await window.ProjectHelper?.getProjectList()) || {};
    const t = (key, params) => (window.I18n ? window.I18n.t(key, params) : key);
    let options = `<option value="" ${!this._filterProjectId ? "selected" : ""}>${t("project.filterAll", { count: this.tasks.length })}</option>`;
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
    if (!select._taskListBound) {
      select._taskListBound = true;
      select.addEventListener("change", (e) => {
        this._filterProjectId = e.target.value || null;
        this._currentPage = 1;
        this.renderTaskList();
      });
    }
  }
  _renderIncremental(container, renderItems) {
    const desiredKeys = renderItems.map((item) => item.key);
    const existingEls = {};
    for (const child of [...container.children]) {
      const key = child.dataset?.taskId || child.dataset?.headerKey;
      if (key) existingEls[key] = child;
    }
    const existingKeys = Object.keys(existingEls);
    const keysMatch =
      existingKeys.length === desiredKeys.length &&
      existingKeys.every((k, i) => k === desiredKeys[i]);
    if (keysMatch) {
      for (const item of renderItems) {
        if (item.type === "task") {
          this._updateCard(existingEls[item.key], item.task);
        }
      }
      return;
    }
    const desiredSet = new Set(desiredKeys);
    for (const [key, el] of Object.entries(existingEls)) {
      if (!desiredSet.has(key)) el.remove();
    }
    const fragment = document.createDocumentFragment();
    const reusable = {};
    for (const child of [...container.children]) {
      const key = child.dataset?.taskId || child.dataset?.headerKey;
      if (key) reusable[key] = child;
    }
    container.innerHTML = "";
    for (const item of renderItems) {
      if (item.type === "task" && reusable[item.key]) {
        this._updateCard(reusable[item.key], item.task);
        fragment.appendChild(reusable[item.key]);
      } else if (item.type === "header" && reusable[item.key]) {
        fragment.appendChild(reusable[item.key]);
      } else {
        const temp = document.createElement("div");
        if (item.type === "task") {
          temp.innerHTML = this.renderTaskCard(item.task);
        } else {
          temp.innerHTML = item.html;
          const headerEl = temp.firstElementChild;
          if (headerEl) headerEl.dataset.headerKey = item.key;
        }
        while (temp.firstChild) fragment.appendChild(temp.firstChild);
      }
    }
    container.appendChild(fragment);
  }
  _updateCard(cardEl, task) {
    if (!cardEl || !task) return;
    const isSelected = this.selectedTasks.has(task.task_id);
    const statusClass = task.status || "pending";
    const isRunning = task.status === "running";
    const isEnabled = task.enabled !== false;
    const isCurrent = window.ProjectHelper
      ? window.ProjectHelper.isCurrentProject(task)
      : true;
    cardEl.className = `task-card ${statusClass} ${isSelected ? "selected" : ""} ${!isEnabled ? "task-disabled" : ""} ${!isCurrent ? "cross-project" : ""}`;
    const checkbox = cardEl.querySelector(".task-card-checkbox input");
    if (checkbox) {
      checkbox.checked = isSelected;
      checkbox.disabled = isRunning;
    }
    const statusDot = cardEl.querySelector(".task-card-status");
    if (statusDot) {
      const lbl = TaskList._renderStatusLabel(statusClass);
      statusDot.className = `task-card-status ${statusClass}`;
      statusDot.innerHTML = TaskList._renderStatusIcon(statusClass);
      statusDot.setAttribute("title", lbl);
      statusDot.setAttribute("aria-label", lbl);
    }
    const nameEl = cardEl.querySelector(".task-card-name");
    if (nameEl) {
      nameEl.textContent =
        task.task_name || window.I18n?.t("tasks.noName") || "No name";
    }
    const nameRow = cardEl.querySelector(".task-card-name-row");
    const existingProgress = cardEl.querySelector(".task-card-inline-progress");
    if (isRunning && !existingProgress && nameRow) {
      const progressEl = document.createElement("span");
      progressEl.className = "task-card-inline-progress indeterminate";
      progressEl.innerHTML =
        '<span class="task-card-inline-progress-bar"></span>';
      nameRow.appendChild(progressEl);
    } else if (!isRunning && existingProgress) {
      existingProgress.remove();
    }
    const toggleBtn = cardEl.querySelector(".task-toggle-btn");
    if (toggleBtn) {
      toggleBtn.className = `task-toggle-btn ${isEnabled ? "on" : "off"}`;
      toggleBtn.title = isEnabled
        ? window.I18n?.t("tasks.disableTask") || "Disable task"
        : window.I18n?.t("tasks.enableTask") || "Enable task";
    }
    const promptEl = cardEl.querySelector(".task-card-prompt");
    if (promptEl) promptEl.textContent = task.prompt || "";
    const newHtml = this.renderTaskCard(task);
    const temp = document.createElement("div");
    temp.innerHTML = newHtml;
    const newCard = temp.firstElementChild;
    if (newCard) {
      const oldMeta = cardEl.querySelector(".task-card-meta");
      const newMeta = newCard.querySelector(".task-card-meta");
      if (oldMeta && newMeta) {
        oldMeta.innerHTML = newMeta.innerHTML;
      }
      const oldNameRow = cardEl.querySelector(".task-card-name-row");
      const newNameRow = newCard.querySelector(".task-card-name-row");
      if (oldNameRow && newNameRow) {
        const oldProviderBadge = oldNameRow.querySelector(
          ".task-provider-badge",
        );
        const newProviderBadge = newNameRow.querySelector(
          ".task-provider-badge",
        );
        if (oldProviderBadge && newProviderBadge) {
          oldProviderBadge.outerHTML = newProviderBadge.outerHTML;
        } else if (!oldProviderBadge && newProviderBadge) {
          oldNameRow
            .querySelector(".task-card-name")
            ?.insertAdjacentElement(
              "afterend",
              newProviderBadge.cloneNode(true),
            );
        } else if (oldProviderBadge && !newProviderBadge) {
          oldProviderBadge.remove();
        }
        const oldMediaBadge = oldNameRow.querySelector(".task-media-badge");
        const newMediaBadge = newNameRow.querySelector(".task-media-badge");
        if (oldMediaBadge && newMediaBadge) {
          oldMediaBadge.outerHTML = newMediaBadge.outerHTML;
        } else if (!oldMediaBadge && newMediaBadge) {
          const afterEl =
            oldNameRow.querySelector(".task-provider-badge") ||
            oldNameRow.querySelector(".task-card-name");
          afterEl?.insertAdjacentElement(
            "afterend",
            newMediaBadge.cloneNode(true),
          );
        } else if (oldMediaBadge && !newMediaBadge) {
          oldMediaBadge.remove();
        }
      }
      const oldRefs = cardEl.querySelector(".task-card-refs");
      const newRefs = newCard.querySelector(".task-card-refs");
      if (oldRefs && newRefs) {
        oldRefs.innerHTML = newRefs.innerHTML;
      } else if (oldRefs && !newRefs) {
        oldRefs.remove();
      } else if (!oldRefs && newRefs) {
        const metaEl = cardEl.querySelector(".task-card-meta");
        if (metaEl)
          metaEl.insertAdjacentElement("afterend", newRefs.cloneNode(true));
      }
      const oldArrow = cardEl.querySelector(".task-card-arrow");
      const newArrow = newCard.querySelector(".task-card-arrow");
      const oldResults = cardEl.querySelector(".task-card-results");
      const newResults = newCard.querySelector(".task-card-results");
      if (!oldArrow && newArrow) {
        const refsEl = cardEl.querySelector(".task-card-refs");
        if (refsEl)
          refsEl.insertAdjacentElement("afterend", newArrow.cloneNode(true));
      } else if (oldArrow && !newArrow) {
        oldArrow.remove();
      }
      if (oldResults && newResults) {
        oldResults.innerHTML = newResults.innerHTML;
      } else if (oldResults && !newResults) {
        oldResults.remove();
      } else if (!oldResults && newResults) {
        const arrowEl = cardEl.querySelector(".task-card-arrow");
        const refsEl = cardEl.querySelector(".task-card-refs");
        const insertAfter =
          arrowEl || refsEl || cardEl.querySelector(".task-card-meta");
        if (insertAfter)
          insertAfter.insertAdjacentElement(
            "afterend",
            newResults.cloneNode(true),
          );
      }
      const actionsEl = cardEl.querySelector(".task-card-actions");
      const newActions = newCard.querySelector(".task-card-actions");
      if (actionsEl && newActions) {
        const hadRunning = !!actionsEl.querySelector(".run-btn.btn-warning");
        if (hadRunning !== isRunning) {
          actionsEl.innerHTML = newActions.innerHTML;
        }
      }
    }
  }
  _updateTaskProgress(taskId, completed, total) {
    const cardEl = this._listContainer?.querySelector(
      `.task-card[data-task-id="${taskId}"]`,
    );
    if (!cardEl) return;
    const progressEl = cardEl.querySelector(".task-card-inline-progress");
    const fillEl = cardEl.querySelector(".task-card-inline-progress-bar");
    if (!fillEl) return;
    if (progressEl) progressEl.classList.remove("indeterminate");
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    fillEl.style.width = `${pct}%`;
  }
  _setupEventDelegation() {
    const listContainer = this.container.querySelector("#taskListContainer");
    if (!listContainer) return;
    this._listContainer = listContainer;
    listContainer.addEventListener("click", (e) => {
      const target = e.target;
      const card = target.closest(".task-card");
      if (!card) {
        const addFirstBtn = target.closest("#addFirstTaskBtn");
        if (addFirstBtn) {
          this._checkAndOpenTaskModal();
        }
        return;
      }
      const taskId = card.dataset.taskId;
      if (!taskId) return;
      if (
        target.closest(".task-card-checkbox") &&
        !target.matches('input[type="checkbox"]')
      ) {
        const checkbox = card.querySelector(".task-card-checkbox input");
        if (checkbox) {
          checkbox.checked = !checkbox.checked;
          e.stopPropagation();
          this.toggleSelect(taskId, checkbox.checked);
        }
        return;
      }
      if (target.closest(".task-toggle-btn")) {
        e.stopPropagation();
        this.toggleTaskEnabled(taskId);
        return;
      }
      if (target.closest(".tobyflow-dot-menu-btn")) {
        e.stopPropagation();
        const dotMenu = target.closest(".tobyflow-dot-menu");
        const dropdown = dotMenu?.querySelector(".tobyflow-dropdown-menu");
        const menuBtn = dotMenu?.querySelector(".tobyflow-dot-menu-btn");
        if (!dropdown || !menuBtn) return;
        const wasHidden = dropdown.classList.contains("hidden");
        this._closeAllDropdowns(listContainer);
        if (wasHidden) {
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
        return;
      }
      if (target.closest(".edit-btn") || target.closest(".task-card-name")) {
        e.stopPropagation();
        this._closeAllDropdowns(listContainer);
        this._handleEditClick(taskId);
        return;
      }
      if (target.closest(".copy-btn")) {
        e.stopPropagation();
        this._closeAllDropdowns(listContainer);
        this.cloneTask(taskId);
        return;
      }
      if (target.closest(".download-wm-alt-btn")) {
        e.stopPropagation();
        this._closeAllDropdowns(listContainer);
        this.downloadTaskFiles(taskId, this._wmAltMode());
        return;
      }
      if (target.closest(".download-btn")) {
        e.stopPropagation();
        this._closeAllDropdowns(listContainer);
        this.downloadTaskFiles(taskId);
        return;
      }
      if (target.closest(".run-btn")) {
        e.stopPropagation();
        this._closeAllDropdowns(listContainer);
        this.runTask(taskId);
        return;
      }
      if (target.closest(".reset-btn")) {
        e.stopPropagation();
        this._closeAllDropdowns(listContainer);
        this.resetTask(taskId);
        return;
      }
      if (target.closest(".delete-btn")) {
        e.stopPropagation();
        this._closeAllDropdowns(listContainer);
        this.deleteTask(taskId);
        return;
      }
    });
    listContainer.addEventListener("change", (e) => {
      const checkbox = e.target.closest(".task-card-checkbox input");
      if (!checkbox) return;
      const card = checkbox.closest(".task-card");
      if (!card) return;
      const taskId = card.dataset.taskId;
      if (taskId) {
        e.stopPropagation();
        this.toggleSelect(taskId, checkbox.checked);
      }
    });
    listContainer.addEventListener("mousedown", (e) => {
      const handle = e.target.closest(".drag-handle");
      if (!handle) return;
      const card = handle.closest(".task-card");
      if (card) card.setAttribute("draggable", "true");
    });
    listContainer.addEventListener(
      "touchstart",
      (e) => {
        const handle = e.target.closest(".drag-handle");
        if (!handle) return;
        const card = handle.closest(".task-card");
        if (card) card.setAttribute("draggable", "true");
      },
      { passive: true },
    );
    listContainer.addEventListener("dragstart", (e) => {
      const card = e.target.closest(".task-card");
      if (!card) return;
      card.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", card.dataset.taskId);
    });
    listContainer.addEventListener("dragend", (e) => {
      const card = e.target.closest(".task-card");
      if (!card) return;
      card.setAttribute("draggable", "false");
      card.classList.remove("dragging");
      listContainer
        .querySelectorAll(".task-card")
        .forEach((c) => c.classList.remove("drag-over"));
    });
    listContainer.addEventListener("dragover", (e) => {
      const card = e.target.closest(".task-card");
      if (!card) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const dragging = listContainer.querySelector(".dragging");
      if (dragging && dragging !== card) {
        card.classList.add("drag-over");
      }
    });
    listContainer.addEventListener("dragleave", (e) => {
      const card = e.target.closest(".task-card");
      if (card) card.classList.remove("drag-over");
    });
    listContainer.addEventListener("drop", (e) => {
      const card = e.target.closest(".task-card");
      if (!card) return;
      e.preventDefault();
      card.classList.remove("drag-over");
      const fromId = e.dataTransfer.getData("text/plain");
      const toId = card.dataset.taskId;
      if (fromId && fromId !== toId) {
        this._reorderTasks(fromId, toId, listContainer);
      }
    });
  }
  async _handleEditClick(taskId) {
    const task = this.tasks.find((t) => t.task_id === taskId);
    if (!task) return;
    if (
      task &&
      window.ProjectHelper &&
      !window.ProjectHelper.isCurrentProject(task)
    ) {
      const action = await window.ProjectHelper.showCrossProjectWarning(
        task,
        "task",
      );
      if (action === "switch") {
        window.ProjectHelper.navigateToProject(task.project_id);
      }
      return;
    }
    if (window.eventBus)
      window.eventBus.emit("task:open_modal", { mode: "edit", task });
  }
  async _cacheProjectNames() {
    if (!window.ProjectHelper) return;
    try {
      const projects =
        (await window.ProjectHelper.fetchProjectNamesFromApi?.()) ||
        (await window.ProjectHelper.getProjectList());
      this._projectNames = {};
      for (const [pid, info] of Object.entries(projects)) {
        this._projectNames[pid] = info.name;
      }
    } catch (e) {
      console.warn("[TaskList] Cache project names failed:", e);
    }
  }
  async _reorderTasks(fromId, toId, container) {
    const cards = [...container.querySelectorAll(".task-card")];
    const orderedIds = cards.map((c) => c.dataset.taskId);
    const fromIdx = orderedIds.indexOf(fromId);
    const toIdx = orderedIds.indexOf(toId);
    if (fromIdx === -1 || toIdx === -1) return;
    orderedIds.splice(fromIdx, 1);
    orderedIds.splice(toIdx, 0, fromId);
    for (let i = 0; i < orderedIds.length; i++) {
      const task = this.tasks.find((t) => t.task_id === orderedIds[i]);
      if (task) task.sort_order = i;
    }
    if (window.storageManager) {
      try {
        for (const task of this.tasks) {
          await window.storageManager.saveTask(task);
        }
      } catch (e) {
        console.error("[TaskList] Reorder save failed:", e);
      }
    }
    this.renderTaskList();
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
  async cloneTask(taskId) {
    if (this._isCloning) return;
    this._isCloning = true;
    try {
      await this._doCloneTask(taskId);
    } finally {
      this._isCloning = false;
    }
  }
  async _doCloneTask(taskId) {
    const task = this.tasks.find((t) => t.task_id === taskId);
    if (!task) return;
    if (window.featureGate) {
      const canCreate = await window.featureGate.canCreateTaskAsync();
      if (!canCreate) {
        const isLoggedIn = window.authManager?.isLoggedIn();
        if (!isLoggedIn) {
          window.featureGate.showLoginPrompt(
            window.I18n?.t("tasks.requireLoginToClone") ||
              "Login required to clone tasks",
          );
        } else {
          const quota = window.featureGate.checkQuota("tasks_max");
          const shouldUpgrade = await window.customDialog?.confirm(
            window.I18n?.t("tasks.quotaCloneMsg", {
              limit: quota.limit,
              used: quota.used,
            }) ||
              `Your plan allows up to ${quota.limit} tasks. You already have ${quota.used} tasks. Upgrade to Premium for unlimited cloning.`,
            {
              title: window.I18n?.t("tasks.quotaLimitTitle") || "Limit Reached",
              type: "warning",
              confirmText: window.I18n?.t("common.upgrade") || "Upgrade",
              cancelText: window.I18n?.t("common.later") || "Later",
            },
          );
          if (shouldUpgrade && typeof window.openUpgradeModal === "function") {
            window.openUpgradeModal();
          }
        }
        return;
      }
    }
    const isCurrent = window.ProjectHelper
      ? window.ProjectHelper.isCurrentProject(task)
      : true;
    let newTask;
    if (!isCurrent && window.ProjectHelper) {
      const confirmed =
        await window.ProjectHelper.showCloneConfirmation("task");
      if (!confirmed) return;
      newTask = window.ProjectHelper.cloneTaskCrossProject(task);
      newTask.task_name = window.ProjectHelper.uniquifyName(
        newTask.task_name,
        this.tasks.map((t) => t.task_name),
      );
    } else {
      const baseName =
        (task.task_name || "Task") +
        " " +
        (window.I18n?.t("project.copySuffix") || "(copy)");
      const uniqueName =
        window.ProjectHelper?.uniquifyName(
          baseName,
          this.tasks.map((t) => t.task_name),
        ) || baseName;
      newTask = {
        ...JSON.parse(JSON.stringify(task)),
        task_id: window.IdGenerator
          ? window.IdGenerator.next("task")
          : `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        task_name: uniqueName,
        status: "pending",
        result_file_ids: "",
        result_thumbnails: {},
        result_file_names: {},
        result_provider_urls: {},
        error_message: "",
      };
    }
    try {
      if (window.storageManager) {
        await window.storageManager.saveTask(newTask);
      }
      if (window.featureGate && !window.authManager?.isLoggedIn()) {
        await window.featureGate.recordTaskCreated();
      }
      if (window.featureGate) {
        window.featureGate
          .refresh({ force: true })
          .catch((e) =>
            console.warn("[TaskList] FeatureGate refresh failed:", e),
          );
      }
      await this.loadTasks();
      window.showNotification?.(
        window.I18n?.t("tasks.cloned") || "Task duplicated",
        "success",
      );
    } catch (e) {
      console.error("[TaskList] Clone failed:", e);
      if (
        e.code === "QUOTA_EXCEEDED" ||
        e.message?.includes("gi\u1EDBi h\u1EA1n")
      ) {
        return;
      }
      window.customDialog?.alert(
        (window.I18n?.t("tasks.cloneFailed") || "Failed to duplicate task: ") +
          e.message,
        { type: "error" },
      );
    }
  }
  _wmAltMode() {
    const st = window.storageSettings?.getSettings?.() || {};
    const v = st.autoRemoveWatermark;
    return v === true || v === "1" || v === 1 ? "original" : "clean";
  }
  _wmAltItem() {
    try {
      if (window.SystemConfig?.getBool?.("remove_watermark_enabled") !== true)
        return "";
      if (!(
        window.featureGate?.canUse?.("image_remove_watermark_enabled") ?? false
      ))
        return "";
      const alt = this._wmAltMode();
      const label =
        alt === "original"
          ? window.I18n?.t?.("download.wmOriginal") || "Original"
          : window.I18n?.t?.("download.wmClean") || "Watermark removed";
      return `
                <button class="tobyflow-dropdown-item download-wm-alt-btn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" role="img" aria-label="Scan"><g fill="currentColor"><path d="M2 14.25c.41 0 .75.34.75.75v2.5c0 2.07 1.68 3.75 3.75 3.75H9c.41 0 .75.34.75.75s-.34.75-.75.75H6.5c-2.89 0-5.25-2.35-5.25-5.25V15c0-.41.34-.75.75-.75m20 1c.41 0 .75.34.75.75v1.5c0 2.9-2.36 5.25-5.25 5.25H16c-.41 0-.75-.34-.75-.75s.34-.75.75-.75h1.5c2.07 0 3.75-1.68 3.75-3.75V16c0-.41.34-.75.75-.75"></path><path fill-rule="evenodd" d="M14 5.75c2.42 0 3.75 1.33 3.75 3.75v1.75H19c.41 0 .75.34.75.75s-.34.75-.75.75h-1.25v1.75c0 2.42-1.33 3.75-3.75 3.75h-4c-2.42 0-3.75-1.33-3.75-3.75v-1.75H5c-.41 0-.75-.34-.75-.75s.34-.75.75-.75h1.25V9.5c0-2.42 1.33-3.75 3.75-3.75zm-6.25 7v1.75c0 1.58.67 2.25 2.25 2.25h4c1.58 0 2.25-.67 2.25-2.25v-1.75zM10 7.25c-1.58 0-2.25.67-2.25 2.25v1.75h8.5V9.5c0-1.58-.67-2.25-2.25-2.25z" clip-rule="evenodd"></path><path d="M9 1.25c.41 0 .75.34.75.75s-.34.75-.75.75H6.5c-2.07 0-3.75 1.68-3.75 3.75V9c0 .41-.34.75-.75.75s-.75-.34-.75-.75V6.5c0-2.9 2.36-5.25 5.25-5.25zm8.5 0c2.89 0 5.25 2.35 5.25 5.25V9c0 .41-.34.75-.75.75s-.75-.34-.75-.75V6.5c0-2.07-1.68-3.75-3.75-3.75H15c-.41 0-.75-.34-.75-.75s.34-.75.75-.75z"></path></g></svg>
                  ${label}
                </button>`;
    } catch (_) {
      return "";
    }
  }
  async downloadTaskFiles(taskId, watermarkMode = null) {
    await this._syncNativeMediaIdentities().catch(() => null);
    const task = this.tasks.find((t) => t.task_id === taskId);
    if (!task?.result_file_ids) return;
    const fileIds = (task.result_file_ids || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (fileIds.length === 0) return;
    const fileNames = task.result_file_names || {};
    const isVideoTask =
      task.media_type === "Video" || task.gen_type === "Video";
    const provider = task.provider || "flow";
    const isExternal =
      provider === "chatgpt" ||
      provider === "grok" ||
      provider === "gemini" ||
      provider === "muse";
    if (isExternal) {
      const savedThumbs = task.result_thumbnails || {};
      const _dlSet = await window.DownloadHelper.getSettings();
      const folder = _dlSet.folder;
      const template = _dlSet.template;
      let successCount = 0;
      let failCount = 0;
      for (let idx = 0; idx < fileIds.length; idx++) {
        const fid = fileIds[idx];
        const thumbObj = savedThumbs[fid];
        const url =
          typeof thumbObj === "object" && thumbObj?.thumbnail
            ? thumbObj.thumbnail
            : typeof thumbObj === "string"
              ? thumbObj
              : "";
        if (!url) {
          failCount++;
          console.warn("[TaskList] External download: missing URL for", fid);
          continue;
        }
        const isVid =
          (typeof thumbObj === "object" && thumbObj?.type === "video") ||
          isVideoTask;
        const providerMeta = task.result_provider_urls?.[fid] || {};
        const ext = isVid ? "mp4" : provider === "muse" ? "jpg" : "png";
        let filename =
          provider === "muse"
            ? window.DownloadHelper.buildFilename({
                template,
                project: _dlSet.project || window._currentProjectName || "flow",
                prompt: task.prompt || task.task_name || "task",
                index: idx + 1,
                taskName: task.task_name || null,
                folder,
                ext,
              })
            : window.GenTab?._buildChatGPTFilename?.(
                template,
                window._currentProjectName || "flow",
                task.prompt || task.task_name || "task",
                1,
                idx + 1,
                "",
                task.task_name,
                folder,
              ) ||
              `${folder}/${task.task_name || "task"}/result_${Date.now()}_${idx}.${ext}`;
        if (isVid && filename.endsWith(".png"))
          filename = filename.replace(/\.png$/i, ".mp4");
        try {
          if (provider === "muse") {
            const downloaded = isVid
              ? await window.MessageBridge?.museDownloadNative?.(
                  providerMeta.tab_id,
                  filename,
                  providerMeta.url || url,
                  6e5,
                )
              : await window.MessageBridge?.museDownloadImageResult?.({
                  tabId: providerMeta.tab_id,
                  url: providerMeta.url || url,
                  base64: url.startsWith("data:image/") ? url : null,
                  filename,
                  waitForComplete: true,
                });
            if (!downloaded?.success)
              throw new Error(downloaded?.error || "MUSE_DOWNLOAD_FAILED");
            successCount++;
            continue;
          }
          let resp = null;
          if (
            provider === "gemini" &&
            isVid &&
            providerMeta.fingerprint &&
            providerMeta.tab_id &&
            window.MessageBridge?.geminiDownloadVideoNative
          ) {
            const nativeResult =
              await window.MessageBridge.geminiDownloadVideoNative({
                tabId: providerMeta.tab_id,
                fingerprint: providerMeta.fingerprint,
                filename,
                removeWatermark:
                  window.WatermarkClient?.enabled?.("video") === true,
              }).catch(() => null);
            if (nativeResult?.success) {
              successCount++;
              continue;
            }
            console.warn(
              "[TaskList] Gemini native video download failed; falling back to fetch:",
              nativeResult?.error || "GEMINI_NATIVE_VIDEO_DOWNLOAD_FAILED",
            );
          }
          if (
            provider === "grok" &&
            window.GrokSession?.getTabInfo &&
            window.MessageBridge?.grokFetchImage
          ) {
            const info = await window.GrokSession.getTabInfo();
            if (info?.tabId)
              resp = await window.MessageBridge.grokFetchImage(
                url,
                info.tabId,
              ).catch(() => null);
          } else if (
            provider === "chatgpt" &&
            window.ChatGPTSession?.getTabInfo &&
            window.MessageBridge?.chatGPTFetchImage
          ) {
            const info = await window.ChatGPTSession.getTabInfo();
            if (info?.tabId)
              resp = await window.MessageBridge.chatGPTFetchImage(
                url,
                info.tabId,
              ).catch(() => null);
          } else if (
            provider === "gemini" &&
            window.GeminiSession?.getTabInfo &&
            window.MessageBridge?.geminiFetchMedia
          ) {
            const info = await window.GeminiSession.getTabInfo();
            const monitor =
              window.ProviderConfigManager?.getApiConfigValueSync?.(
                "gemini",
                "generation_monitor",
              )?.[isVid ? "video" : "image"];
            if (
              info?.tabId &&
              Number.isFinite(Number(monitor?.max_materialized_bytes))
            ) {
              resp = await window.MessageBridge.geminiFetchMedia(
                url,
                info.tabId,
                Number(monitor.max_materialized_bytes),
              ).catch(() => null);
            }
          }
          if (!resp?.success || !resp.base64) {
            resp = await new Promise((r) =>
              chrome.runtime.sendMessage({ action: "fetchBlob", url }, r),
            ).catch(() => null);
          }
          if (!resp?.success || !resp.base64) {
            const _t3 = await new Promise((resolve) => {
              try {
                chrome.runtime.sendMessage(
                  { action: "chromeDownload", url, filename },
                  (r) => resolve(r),
                );
              } catch (e) {
                resolve({ success: false, error: e.message });
              }
            });
            if (_t3?.success) {
              successCount++;
              continue;
            }
            failCount++;
            console.warn(
              "[TaskList] External download fetch failed:",
              fid,
              "\u2014 URL c\xF3 th\u1EC3 h\u1EBFt h\u1EA1n (CDN signature TTL)",
            );
            continue;
          }
          if (provider === "gemini") {
            const downloaded =
              await window.DownloadHelper.downloadExternalMedia({
                base64: resp.base64,
                mime: resp.mimeType || resp.mime,
                filename,
                mediaType: isVid ? "video" : "image",
              });
            if (!downloaded?.success)
              throw new Error(downloaded?.error || "GEMINI_DOWNLOAD_FAILED");
          } else {
            const blob = await (await fetch(resp.base64)).blob();
            const blobUrl = URL.createObjectURL(blob);
            await new Promise((resolve) => {
              chrome.runtime.sendMessage(
                { action: "chromeDownload", url: blobUrl, filename },
                () => resolve(),
              );
            });
            setTimeout(() => URL.revokeObjectURL(blobUrl), 3e4);
          }
          successCount++;
        } catch (e) {
          failCount++;
          console.error("[TaskList] External download error:", fid, e);
        }
      }
      if (successCount > 0 && failCount === 0) {
        window.showNotification?.(
          window.I18n?.t("tasks.downloadStarted", { count: successCount }) ||
            `Downloaded ${successCount} file(s)`,
          "success",
          2e3,
        );
      } else if (successCount > 0 && failCount > 0) {
        window.showNotification?.(
          window.I18n?.t("taskNotify.downloadPartial", {
            ok: successCount,
            fail: failCount,
          }) ||
            `T\u1EA3i \u0111\u01B0\u1EE3c ${successCount} file, ${failCount} file l\u1ED7i (URL c\xF3 th\u1EC3 h\u1EBFt h\u1EA1n \u2014 ch\u1EA1y l\u1EA1i task \u0111\u1EC3 c\u1EADp nh\u1EADt)`,
          "warning",
          4e3,
        );
      } else {
        window.showNotification?.(
          window.I18n?.t("tasks.downloadExpiredMsg") ||
            "Could not download the file. The URL may have expired \u2014 rerun the task to refresh.",
          "error",
          4e3,
        );
      }
      return;
    }
    const resolution = isVideoTask
      ? task.video_download_resolution || "720p"
      : task.download_resolution || "1k";
    const _savedThumbs = task.result_thumbnails || {};
    for (let _i = 0; _i < fileIds.length; _i++) {
      const fileId = fileIds[_i];
      let _ok = false;
      const _providerName = fileNames[fileId] || null;
      let _apiMedia =
        task.result_provider_urls?.[fileId]?.provider === "flow" ||
        (_providerName &&
          task.result_provider_urls?.[_providerName]?.provider === "flow");
      try {
        const apiResult =
          await window.DownloadHelper?.downloadPersistedFlowTaskResult?.({
            task,
            tileId: fileId,
            index: _i + 1,
            resolution,
            mediaType: isVideoTask ? "video" : "image",
            watermarkMode: watermarkMode || "inherit",
          });
        if (apiResult?.api && apiResult.ok) {
          console.log(
            "[TaskList] Flow API manual download OK:",
            fileId,
            resolution,
          );
          continue;
        }
        _apiMedia = apiResult?.api === true;
        if (apiResult?.api) {
          console.warn(
            "[TaskList] Flow API manual download failed; DOM fallback blocked:",
            apiResult.error || "unknown",
          );
        }
      } catch (e) {
        console.warn(
          "[TaskList] Flow API manual download exception; DOM fallback blocked:",
          e?.message,
        );
      }
      if (_apiMedia) continue;
      try {
        if (window.MessageBridge) {
          let fileName = fileNames[fileId] || null;
          if (isVideoTask) {
            const saved = _savedThumbs[fileId];
            const sourceUrl =
              typeof saved === "string"
                ? saved
                : saved?.video_url ||
                  saved?.source_thumbnail ||
                  saved?.thumbnail ||
                  "";
            if (sourceUrl) {
              const identity =
                await window.MessageBridge.resolveVideoPlaybackUrl(fileId, {
                  fileName: fileName || "",
                  sourceUrl,
                  forceDomResolve: false,
                  skipMediaApiResolve: true,
                  activationTimeoutMs: 0,
                }).catch(() => null);
              if (
                /^[A-Za-z0-9_-]{32,1024}$/.test(
                  String(identity?.persistent_media_id || ""),
                )
              ) {
                fileName = identity.persistent_media_id;
              }
            }
          }
          const response = await window.MessageBridge.downloadTileMedia(
            fileId,
            null,
            task.task_name || "task",
            fileName,
            resolution,
            null,
            null,
            isVideoTask ? resolution : null,
            watermarkMode || null,
          );
          _ok = response === true || response?.success === true;
        }
      } catch (e) {
        console.error("[TaskList] Download failed:", fileId, e);
      }
      if (_ok) continue;
      const _downloadRoute =
        window.ProviderConfigManager?.getDownloadResolutionRouteSync?.(
          "flow",
          isVideoTask ? "video" : "image",
          resolution,
        ) || null;
      const _requestedUpscale = _downloadRoute === "upscale";
      if (_apiMedia && _requestedUpscale) {
        console.warn(
          "[TaskList] Requested upscale failed; native URL fallback suppressed:",
          fileId,
          resolution,
        );
        continue;
      }
      console.warn(
        "[TaskList] Flow resolution download failed; preview URL fallback suppressed:",
        fileId,
        resolution,
      );
    }
  }
  renderTaskCard(task) {
    const isSelected = this.selectedTasks.has(task.task_id);
    const statusClass = task.status || "pending";
    const isRunning = task.status === "running";
    const isEnabled = task.enabled !== false;
    const runBtnIcon = isRunning
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
           <rect x="6" y="6" width="12" height="12"></rect>
         </svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
           <polygon points="5 3 19 12 5 21 5 3"></polygon>
         </svg>`;
    const inlineProgressHtml = isRunning
      ? '<span class="task-card-inline-progress indeterminate"><span class="task-card-inline-progress-bar"></span></span>'
      : "";
    let refPreviewHtml = "";
    if (task.ref_file_ids) {
      const refIds = (task.ref_file_ids || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (refIds.length > 0) {
        const savedRefThumbs = task.ref_thumbnails || {};
        const savedFileNames = task.ref_file_names || {};
        const thumbs = refIds
          .slice(0, 3)
          .map((id) => {
            let thumbSrc = "";
            let isCrossProject = false;
            const pending = window.pendingUploadFiles?.get(id);
            if (pending?.thumbnail) {
              thumbSrc = pending.thumbnail;
            } else if (savedRefThumbs[id]) {
              thumbSrc =
                typeof savedRefThumbs[id] === "string"
                  ? savedRefThumbs[id]
                  : savedRefThumbs[id]?.thumbnail || "";
            } else if (this._refTileCache?.[id]) {
              const cached = this._refTileCache[id];
              thumbSrc = typeof cached === "string" ? cached : cached.thumbnail;
              if (
                savedFileNames[id] &&
                cached.file_name &&
                savedFileNames[id] !== cached.file_name
              ) {
                isCrossProject = true;
              }
            }
            if (isCrossProject) {
              return `<div class="task-ref-thumb task-ref-thumb-cross-project" title="${window.I18n?.t("tasks.crossProjectWarning") || "Wrong project - images belong to another project"}">
              <svg class="cross-project-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </div>`;
            }
            return thumbSrc
              ? `<img class="task-ref-thumb" src="${thumbSrc}" alt="ref" />`
              : `<div class="task-ref-thumb task-ref-thumb-placeholder" data-file-id="${this.escapeAttr(id)}" data-project-id="${this.escapeAttr(task.project_id || "")}"><div class="task-thumb-shimmer"></div></div>`;
          })
          .join("");
        const moreCount =
          refIds.length > 3
            ? `<div class="task-ref-thumb task-ref-thumb-more">+${refIds.length - 3}</div>`
            : "";
        refPreviewHtml = `<div class="task-card-refs">${thumbs}${moreCount}</div>`;
      }
    }
    let resultPreviewHtml = "";
    if (task.status === "completed" && task.result_file_ids) {
      const resultIds = task.result_file_ids
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const savedThumbs = task.result_thumbnails || {};
      const savedFileNames = task.result_file_names || {};
      if (resultIds.length > 0) {
        const thumbs = resultIds
          .slice(0, 3)
          .map((id) => {
            const thumbRaw = savedThumbs[id] || "";
            const thumbSrc =
              typeof thumbRaw === "object" && thumbRaw?.thumbnail
                ? thumbRaw.thumbnail
                : typeof thumbRaw === "string"
                  ? thumbRaw
                  : "";
            let isCrossProject = false;
            if (this._resultTileCache?.[id] && savedFileNames[id]) {
              const cached = this._resultTileCache[id];
              if (cached.file_name && savedFileNames[id] !== cached.file_name) {
                isCrossProject = true;
              }
            }
            if (isCrossProject) {
              return `<div class="task-ref-thumb task-result-thumb-card task-ref-thumb-cross-project" title="${window.I18n?.t("tasks.crossProjectWarning") || "Wrong project - images belong to another project"}">
              <svg class="cross-project-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </div>`;
            }
            const thumbInfo = savedThumbs[id];
            const isVideoResult =
              (typeof thumbInfo === "object" && thumbInfo?.type === "video") ||
              task.media_type === "Video" ||
              task.gen_type === "Video";
            return thumbSrc
              ? isVideoResult
                ? `<video class="task-ref-thumb task-result-thumb-card" src="${thumbSrc}" muted loop autoplay playsinline></video>`
                : `<img class="task-ref-thumb task-result-thumb-card" src="${thumbSrc}" alt="result" />`
              : `<div class="task-ref-thumb task-ref-thumb-placeholder" data-file-id="${id}"><div class="task-thumb-shimmer"></div></div>`;
          })
          .join("");
        const moreCount =
          resultIds.length > 3
            ? `<div class="task-ref-thumb task-ref-thumb-more">+${resultIds.length - 3}</div>`
            : "";
        resultPreviewHtml = `<div class="task-card-refs task-card-results">${thumbs}${moreCount}</div>`;
      }
    }
    const isCurrent = window.ProjectHelper
      ? window.ProjectHelper.isCurrentProject(task)
      : true;
    const projectName = task.project_id
      ? this._projectNames?.[task.project_id] || ""
      : "";
    const projectLabel =
      task.project_id && !this._filterProjectId && window.ProjectHelper
        ? window.ProjectHelper.renderProjectLabel(
            task.project_id,
            projectName,
            isCurrent,
          )
        : "";
    const crossProjectClass = !isCurrent ? "cross-project" : "";
    const statusIcon = TaskList._renderStatusIcon(statusClass);
    const statusLabel = TaskList._renderStatusLabel(statusClass);
    const lastRunHtml = task.executed_at
      ? `<div class="task-card-last-run" title="${window.I18n?.t("tasks.lastRun") || "Last run"}"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>${this._formatRelativeTime(task.executed_at)}</div>`
      : "";
    const lastEditHtml = task.updated_at
      ? `<div class="task-card-last-edit" title="${window.I18n?.t("tasks.lastEdit") || "Last edited"}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g fill="currentColor"><path d="M9.624 2.34a10.5 10.5 0 0 1 7.195.518A10.46 10.46 0 0 1 21.982 7.9a10.5 10.5 0 0 1 .697 7.172c-.62 2.402-2.08 4.5-4.1 5.935a10.48 10.48 0 0 1-6.963 1.891 10.52 10.52 0 0 1-6.533-3.039 1 1 0 0 1 1.414-1.414 8.52 8.52 0 0 0 5.288 2.46 8.48 8.48 0 0 0 5.636-1.528 8.52 8.52 0 0 0 3.321-4.805 8.5 8.5 0 0 0-.564-5.807v-.002A8.46 8.46 0 0 0 16 4.684a8.5 8.5 0 0 0-5.825-.422A8.53 8.53 0 0 0 5.45 7.699h-.001a8.6 8.6 0 0 0-1.377 3.66l.51-.61a1 1 0 0 1 1.535 1.282l-2.18 2.61a1 1 0 0 1-1.536-.001l-2.17-2.61a1 1 0 0 1 1.537-1.28l.318.383a10.6 10.6 0 0 1 1.703-4.548v-.002A10.53 10.53 0 0 1 9.625 2.34"></path><path d="M12 8.401a1 1 0 0 1 1 1v3.55l2.535 1.606a1 1 0 0 1-1.07 1.689l-3-1.9a1 1 0 0 1-.465-.845V9.4a1 1 0 0 1 1-1"></path></g></svg>${this._formatRelativeTime(task.updated_at)}</div>`
      : "";
    const mediaTypeBadgeHtml = (() => {
      const provider = task.provider || "flow";
      let mode = "image";
      if (provider === "grok") {
        mode = task.grok_mode === "video" ? "video" : "image";
      } else if (provider === "chatgpt") {
        mode = "image";
      } else {
        mode = task.media_type === "Video" ? "video" : "image";
      }
      const mediaIcon =
        mode === "video"
          ? '<svg class="task-media-badge-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>'
          : '<svg class="task-media-badge-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
      return `<span class="task-media-badge task-media-badge-${mode}">${mediaIcon}${mode}</span>`;
    })();
    const providerBadgeHtml = (() => {
      const provider = task.provider || "flow";
      if (provider === "chatgpt") {
        const cgIcon =
          '<svg class="task-provider-badge-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg>';
        return `<span class="task-provider-badge task-provider-badge-chatgpt" title="ChatGPT">${cgIcon}ChatGPT</span>`;
      }
      if (provider === "grok") {
        const grokIcon =
          '<svg class="task-provider-badge-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd"><path d="M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815"/></svg>';
        return `<span class="task-provider-badge task-provider-badge-grok" title="Grok">${grokIcon}Grok</span>`;
      }
      if (provider === "gemini") {
        return '<span class="task-provider-badge task-provider-badge-gemini" title="Gemini">\u2726 Gemini</span>';
      }
      if (provider === "muse") {
        return '<span class="task-provider-badge task-provider-badge-muse" title="Muse"><img class="task-provider-badge-icon" src="icons/muse.svg" alt="" />Muse</span>';
      }
      const flowIcon =
        '<svg class="task-provider-badge-icon" width="12" height="12" viewBox="0 0 24 24"><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="#3186FF"/></svg>';
      return `<span class="task-provider-badge task-provider-badge-flow" title="Google Flow">${flowIcon}Flow</span>`;
    })();
    return `
      <div class="task-card ${statusClass} ${isSelected ? "selected" : ""} ${!isEnabled ? "task-disabled" : ""} ${crossProjectClass}" data-task-id="${task.task_id}">
        <div class="drag-handle" title="${window.I18n?.t("tasks.dragHandle") || "Drag to reorder"}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="4" r="2"/><circle cx="16" cy="4" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="20" r="2"/><circle cx="16" cy="20" r="2"/></svg>
        </div>
        <div class="task-card-checkbox">
          <input type="checkbox" ${isSelected ? "checked" : ""} ${task.status === "running" ? "disabled" : ""} />
        </div>
        <span class="task-card-status ${statusClass}" data-tooltip="${statusLabel}" aria-label="${statusLabel}">${statusIcon}</span>
        <div class="task-card-info">
          <div class="task-card-name-row">
            <span class="task-card-name">${this.escapeHtml(task.task_name || window.I18n?.t("tasks.noName") || "No name")}</span>
            ${providerBadgeHtml}
            ${mediaTypeBadgeHtml}
            ${inlineProgressHtml}
          </div>
          <div class="task-card-prompt">${this.escapeHtml(task.prompt || "")}</div>
          <div class="task-card-meta">
            ${(() => {
              const _p = task.provider || "flow";
              const ratioMap = {
                story: "9:16",
                portrait: "3:4",
                square: "1:1",
                landscape: "4:3",
                widescreen: "16:9",
              };
              const _fmtRatio = (k) => ratioMap[k] || k || "";
              const _ratioIcon = (ratio) => {
                const numeric = ratioMap[ratio] || ratio;
                if (numeric === "16:9") return "\u25AC";
                if (numeric === "4:3") return "\u25AD";
                if (numeric === "1:1") return "\u25A1";
                if (numeric === "3:4") return "\u25AF";
                if (numeric === "9:16") return "\u25AE";
                return "";
              };
              if (_p === "grok") {
                const isVideo = task.grok_mode === "video";
                const ratio = task.ratio || "widescreen";
                const ratioLabel = _fmtRatio(ratio);
                const ratioIcon = _ratioIcon(ratio);
                const extras = [];
                if (isVideo) {
                  if (task.grok_duration) extras.push(task.grok_duration);
                  if (task.grok_resolution) extras.push(task.grok_resolution);
                } else {
                  if (task.grok_image_quality)
                    extras.push(task.grok_image_quality);
                }
                const qtyHtml =
                  task.quantity && task.quantity > 1
                    ? `<span>x${task.quantity}</span>`
                    : "";
                const extrasHtml = extras.length
                  ? `<span>${extras.join(" \xB7 ")}</span>`
                  : "";
                return `<span>${ratioIcon} ${ratioLabel}</span>${extrasHtml}${qtyHtml}`;
              }
              if (_p === "chatgpt") {
                const ratio = task.ratio || "story";
                const ratioLabel = _fmtRatio(ratio);
                const ratioIcon = _ratioIcon(ratio);
                return `<span>${ratioIcon} ${ratioLabel}</span>`;
              }
              if (_p === "muse") {
                const ratio = task.ratio || "";
                const ratioLabel = _fmtRatio(ratio);
                const ratioIcon = _ratioIcon(ratio);
                return ratioLabel
                  ? `<span>${ratioIcon} ${ratioLabel}</span>`
                  : "";
              }
              const flowRatio = task.ratio || "16:9";
              const flowRatioIcon = _ratioIcon(flowRatio);
              return `<span>${task.model || window.ModelRegistry?.safeGetDefault("flow", "image") || ""}</span><span>${flowRatioIcon} ${flowRatio}</span><span>x${task.quantity || 1}</span>`;
            })()}
            ${refPreviewHtml}
            ${refPreviewHtml && resultPreviewHtml ? '<span class="task-card-arrow"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg></span>' : ""}
            ${resultPreviewHtml}
          </div>
          ${lastRunHtml || lastEditHtml}
        </div>
        <div class="task-card-actions">
          <button class="task-toggle-btn ${isEnabled ? "on" : "off"}" title="${isEnabled ? window.I18n?.t("tasks.disableTask") || "Disable task" : window.I18n?.t("tasks.enableTask") || "Enable task"}">
            <span class="task-toggle-track"><span class="task-toggle-thumb"></span></span>
          </button>
          ${
            isRunning
              ? `
            <button class="btn btn-secondary btn-sm btn-warning run-btn" title="${window.I18n?.t("common.stop") || "Stop"}">
              ${runBtnIcon}
            </button>
          `
              : `
            <div class="tobyflow-dot-menu" data-task-id="${task.task_id}">
              <button class="btn btn-secondary btn-sm tobyflow-dot-menu-btn" title="Menu">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="5" r="1"></circle>
                  <circle cx="12" cy="12" r="1"></circle>
                  <circle cx="12" cy="19" r="1"></circle>
                </svg>
              </button>
              <div class="tobyflow-dropdown-menu hidden">
                <button class="tobyflow-dropdown-item edit-btn">
                  <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.75 15.7502H9.75002M1.875 16.1252L6.03695 14.5245C6.30316 14.4221 6.43626 14.3709 6.56079 14.3041C6.6714 14.2447 6.77685 14.1761 6.87603 14.0992C6.98769 14.0125 7.08853 13.9117 7.29021 13.71L15.75 5.25023C16.5784 4.4218 16.5784 3.07865 15.75 2.25023C14.9216 1.4218 13.5784 1.4218 12.75 2.25022L4.29021 10.71C4.08853 10.9117 3.98769 11.0125 3.90104 11.1242C3.82408 11.2234 3.75555 11.3288 3.69618 11.4394C3.62933 11.564 3.57814 11.6971 3.47575 11.9633L1.875 16.1252ZM1.875 16.1252L3.41859 12.1119C3.52905 11.8248 3.58428 11.6812 3.67901 11.6154C3.76179 11.5579 3.86423 11.5362 3.96322 11.5551C4.0765 11.5767 4.18529 11.6855 4.40286 11.9031L6.09718 13.5974C6.31475 13.815 6.42354 13.9237 6.44517 14.037C6.46408 14.136 6.44234 14.2385 6.38486 14.3212C6.31908 14.416 6.17549 14.4712 5.8883 14.5817L1.875 16.1252Z"/></svg>
                  ${I18n.t("common.edit") || "Edit"}
                </button>
                <button class="tobyflow-dropdown-item run-btn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                  ${task.status === "completed" ? I18n.t("tasks.rerun") : I18n.t("common.run")}
                </button>
                <button class="tobyflow-dropdown-item reset-btn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                  ${I18n.t("tasks.reset") || "Reset"}
                </button>
                ${
                  task.result_file_ids
                    ? `
                <button class="tobyflow-dropdown-item download-btn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  ${I18n.t("common.download") || "Download"}
                </button>
                ${this._wmAltItem()}
                `
                    : ""
                }
                <button class="tobyflow-dropdown-item copy-btn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  ${I18n.t("tasks.duplicate") || "Duplicate"}
                </button>
                <button class="tobyflow-dropdown-item delete-btn tobyflow-dropdown-danger" ${isRunning ? "disabled" : ""}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                  ${I18n.t("common.delete") || "Delete"}
                </button>
              </div>
            </div>
          `
          }
        </div>
      </div>
    `;
  }
  toggleSelect(taskId, selected) {
    if (selected) {
      this.selectedTasks.add(taskId);
    } else {
      this.selectedTasks.delete(taskId);
    }
    this.updateBatchActions();
  }
  updateBatchActions() {
    const batchActions = this.container.querySelector("#batchActions");
    const selectedCount = this.container.querySelector("#selectedCount");
    if (this.selectedTasks.size > 0) {
      batchActions?.classList.remove("hidden");
      if (selectedCount) selectedCount.textContent = this.selectedTasks.size;
    } else {
      batchActions?.classList.add("hidden");
    }
  }
  async runTask(taskId) {
    const task = this.tasks.find((t) => t.task_id === taskId);
    if (!task) return;
    if (!this._pendingRunIds) this._pendingRunIds = new Set();
    if (task.status !== "running" && this._pendingRunIds.has(taskId)) {
      console.log(
        "[TaskList] runTask ignored \u2014 already pending for",
        taskId,
      );
      return;
    }
    if (task.status !== "running") {
      this._pendingRunIds.add(taskId);
      setTimeout(() => this._pendingRunIds?.delete(taskId), 5e3);
    }
    if (window.ProjectHelper && !window.ProjectHelper.isCurrentProject(task)) {
      const action = await window.ProjectHelper.showCrossProjectWarning(
        task,
        "task",
      );
      if (action === "switch") {
        window.ProjectHelper.navigateToProject(task.project_id);
      }
      return;
    }
    if (task.status === "running") {
      window._taskShouldStop = true;
      const _isPipelineStop = !!(window.PromptQueue && PromptQueue.isEnabled());
      if (_isPipelineStop) {
        try {
          const _q = PromptQueue.getInstance();
          const _tid = task.task_id || task.id;
          for (const job of _q.getJobsByOwner("task") || []) {
            if ((job.items || []).some((i) => i._taskId === _tid))
              _q.stopJob(job.id, {
                stopOrigin: "user",
                stopReason: "USER_CANCELLED",
              });
          }
        } catch (e) {
          console.warn("[TaskList] stopJob failed:", e && e.message);
        }
      }
      if (
        !_isPipelineStop &&
        window.ExecutionGate &&
        window._currentTaskExecutionToken
      ) {
        window.ExecutionGate.cancel(window._currentTaskExecutionToken);
        window._currentTaskExecutionToken = null;
      } else if (_isPipelineStop) {
        window._currentTaskExecutionToken = null;
      }
      if (window.MessageBridge) {
        const provider2 = task.provider || "flow";
        if (provider2 === "grok" && window.GrokSession?.getTabInfo) {
          window.GrokSession.getTabInfo()
            .then((info) => {
              if (info?.tabId)
                MessageBridge.grokAbort(info.tabId).catch(() => {});
            })
            .catch(() => {});
        } else if (provider2 === "gemini" && window.GeminiSession?.getTabInfo) {
          window.GeminiSession.getTabInfo()
            .then((info) => {
              if (info?.tabId)
                chrome.tabs.sendMessage(info.tabId, { action: "gemini:abort" });
            })
            .catch(() => {});
        } else if (provider2 === "muse") {
          window.MuseSession?.abort?.().catch(() => {});
        } else {
          MessageBridge.stopExecution().catch(() => {});
        }
      }
      setTimeout(async () => {
        const currentTask = this.tasks.find((t) => t.task_id === taskId);
        if (currentTask && currentTask.status === "running") {
          console.log("[TaskList] Force reset stuck task:", taskId);
          currentTask.status = "pending";
          try {
            await window.storageManager?.updateTaskStatus(taskId, "pending");
          } catch (e) {
            console.warn("[TaskList] Failed to reset task status:", e.message);
          }
          this._updateCardRunningState(taskId, false, "pending");
        }
      }, 1e3);
      return;
    }
    if (window.featureGate) {
      const quota = await window.featureGate.checkQuotaAsync("tasks_run_max");
      if (!quota.allowed) {
        const isLoggedIn = window.authManager?.isLoggedIn();
        if (isLoggedIn) {
          const limitText =
            quota.limit === "unlimited"
              ? window.I18n?.t("tasks.runQuotaUnlimited") || "Unlimited"
              : `${quota.limit} runs/day`;
          window.customDialog?.alert(
            window.I18n?.t("tasks.runQuotaMsg", {
              limit: limitText,
              used: quota.used,
            }) ||
              `You've run out of Task runs for today.

Limit: ${limitText}
Used: ${quota.used} runs

Upgrade your plan to increase the limit.`,
            {
              title:
                window.I18n?.t("tasks.runQuotaTitle") || "Task Quota Exhausted",
            },
          );
        } else {
          window.featureGate.showLoginPrompt(
            window.I18n?.t("tasks.trialExhaustedRun") ||
              "You have used all trial task run credits.",
          );
        }
        return;
      }
      const quotaCheck = window.featureGate.checkGlobalQuotaWarning("Task");
      if (quotaCheck.exhausted) {
        return;
      }
      window.featureGate.setPendingTaskRun();
    }
    const provider = task.provider || "flow";
    const providerLabel =
      {
        flow: "Flow",
        chatgpt: "ChatGPT",
        grok: "Grok",
        gemini: "Gemini",
        muse: "Muse",
      }[provider] || provider;
    const I = window.I18n;
    try {
      if (provider === "chatgpt" && window.ChatGPTSession) {
        const activation = window.ChatGPTSession.ensureReady({
          createIfMissing: true,
          activate: true,
          forceCheck: true,
          waitForEditorMs: 12e3,
        }).catch(() => ({ ready: false }));
        TaskList._chatgptActivationPromise = activation;
        activation.finally(() => {
          if (TaskList._chatgptActivationPromise === activation)
            TaskList._chatgptActivationPromise = null;
        });
      } else if (provider === "grok" && window.GrokSession) {
        window.GrokSession.ensureReady({
          createIfMissing: true,
          activate: true,
        }).catch(() => {});
      } else if (provider === "gemini" && window.GeminiSession) {
        window.GeminiSession.ensureReady({
          createIfMissing: true,
          activate: true,
        }).catch(() => {});
      } else if (provider === "muse" && window.MuseSession) {
        window.MuseSession.ensureReady({
          createIfMissing: true,
          activate: true,
        }).catch(() => {});
      } else if (provider === "flow") {
        const activation = chrome.runtime
          .sendMessage({ action: "ensureFlowTabActive", focusWindow: true })
          .catch((error) => ({
            ok: false,
            error: error?.message || "FLOW_TAB_ACTIVATION_FAILED",
          }));
        TaskList._flowActivationPromise = activation;
      }
    } catch (_) {}
    if (window.GenTab?._checkDuplicateProviderTabs) {
      try {
        window.GenTab._checkDuplicateProviderTabs(provider, {
          interactive: true,
        });
      } catch (e) {
        console.warn("[TaskList] duplicate tab check failed:", e?.message || e);
      }
    }
    const confirmed = await TaskList._showTaskConfirmModal(
      task,
      provider,
      providerLabel,
    );
    if (!confirmed) {
      this._pendingRunIds?.delete(taskId);
      return;
    }
    try {
      if (provider === "chatgpt" && window.ChatGPTSession) {
        const result = await window.ChatGPTSession.ensureReady({
          createIfMissing: true,
          activate: true,
          forceCheck: true,
          waitForEditorMs: 12e3,
        });
        if (!result?.ready) {
          window.showNotification?.(
            I?.t("tasks.providerNotReady", { provider: "ChatGPT" }) ||
              "ChatGPT is not ready. Please sign in.",
            "warning",
            3e3,
          );
          this._pendingRunIds?.delete(taskId);
          return;
        }
        if (result?.tabId) {
          chrome.tabs.update(result.tabId, { active: true });
        }
      } else if (provider === "grok" && window.GrokSession) {
        const result = await window.GrokSession.ensureReady({
          createIfMissing: true,
          activate: true,
        });
        if (!result?.ready) {
          window.showNotification?.(
            I?.t("tasks.providerNotReady", { provider: "Grok" }) ||
              "Grok is not ready. Please sign in.",
            "warning",
            3e3,
          );
          this._pendingRunIds?.delete(taskId);
          return;
        }
        if (result?.tabId) {
          chrome.tabs.update(result.tabId, { active: true });
        }
      } else if (provider === "gemini" && window.GeminiSession) {
        const result = await window.GeminiSession.ensureReady({
          createIfMissing: true,
          activate: true,
        });
        if (!result?.ready) {
          window.showNotification?.(
            I?.t("tasks.providerNotReady", { provider: "Gemini" }) ||
              "Gemini is not ready. Please sign in.",
            "warning",
            3e3,
          );
          this._pendingRunIds?.delete(taskId);
          return;
        }
      } else if (provider === "muse" && window.MuseSession) {
        const result = await window.MuseSession.ensureReady({
          createIfMissing: true,
          activate: true,
        });
        if (!result?.ready) {
          window.showNotification?.(
            I?.t("tasks.providerNotReady", { provider: "Muse" }) ||
              "Muse is not ready. Please sign in.",
            "warning",
            3e3,
          );
          this._pendingRunIds?.delete(taskId);
          return;
        }
      } else if (provider === "flow") {
        const activation = await chrome.runtime.sendMessage({
          action: "ensureFlowTabActive",
          focusWindow: true,
        });
        if (activation?.ok !== true)
          throw new Error(activation?.error || "FLOW_TAB_ACTIVATION_FAILED");
      }
    } catch (tabErr) {
      console.warn("[TaskList] Activate provider tab failed:", tabErr.message);
      window.showNotification?.(
        I?.t("tasks.providerActivateFailed") ||
          "Could not activate provider tab",
        "error",
        3e3,
      );
      this._pendingRunIds?.delete(taskId);
      return;
    }
    if (task.status === "completed") {
      task.status = "pending";
      task.result_file_ids = "";
      task.result_thumbnails = {};
      task.result_file_names = {};
      task.result_provider_urls = {};
      task.error_message = "";
      if (window.storageManager) {
        try {
          await window.storageManager.saveTask(task);
          await new Promise((r) => setTimeout(r, 100));
        } catch (e) {
          console.warn(
            "[TaskList] Reset task before re-run failed:",
            e.message,
          );
        }
      }
    }
    window.showNotification?.(
      I?.t("tasks.running", { name: task.task_name || "Task" }) ||
        `Running: ${task.task_name || "Task"}`,
      "success",
      2e3,
    );
    if (window.eventBus) {
      window.eventBus.emit("task:run", { task });
    }
  }
  async resetTask(taskId) {
    const task = this.tasks.find((t) => t.task_id === taskId);
    if (!task) return;
    task.status = "pending";
    task.result_file_ids = "";
    task.result_thumbnails = {};
    task.result_file_names = {};
    task.result_provider_urls = {};
    task.error_message = "";
    try {
      if (window.storageManager) {
        await window.storageManager.saveTask(task);
      }
      this.renderTaskList();
      window.showNotification?.(
        window.I18n?.t("tasks.taskReset") || "Task has been reset",
        "success",
        1500,
      );
    } catch (e) {
      console.error("[TaskList] Reset failed:", e);
    }
  }
  async toggleTaskEnabled(taskId) {
    const task = this.tasks.find((t) => t.task_id === taskId);
    if (!task) return;
    task.enabled = task.enabled === false ? true : false;
    const cardEl = this._listContainer?.querySelector(
      `.task-card[data-task-id="${taskId}"]`,
    );
    if (cardEl) {
      this._updateCard(cardEl, task);
    } else {
      this.renderTaskList();
    }
    try {
      if (window.storageManager) await window.storageManager.saveTask(task);
    } catch (e) {
      console.error("[TaskList] Toggle enabled failed:", e);
    }
  }
  toggleRunMode() {
    this.runMode = this.runMode === "parallel" ? "sequential" : "parallel";
    const btn = this.container.querySelector("#taskRunModeBtn");
    if (!btn) return;
    const label = btn.querySelector(".task-run-mode-label");
    const isSequential = this.runMode === "sequential";
    btn.classList.toggle("active", isSequential);
    btn.title = isSequential
      ? window.I18n?.t("tasks.runModeSequentialTitle") || "Run mode: Sequential"
      : window.I18n?.t("tasks.runModeParallelTitle") || "Run mode: Parallel";
    if (label) {
      label.textContent = isSequential
        ? window.I18n?.t("tasks.sequential") || "Sequential"
        : window.I18n?.t("tasks.parallel") || "Song song";
    }
    const svg = btn.querySelector("svg");
    if (svg) {
      if (isSequential) {
        svg.innerHTML =
          '<line x1="10" y1="6" x2="21" y2="6"></line><line x1="10" y1="12" x2="21" y2="12"></line><line x1="10" y1="18" x2="21" y2="18"></line><polyline points="3 6 4 7 6 5"></polyline><polyline points="3 12 4 13 6 11"></polyline><polyline points="3 18 4 19 6 17"></polyline>';
      } else {
        svg.innerHTML =
          '<line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="18" x2="20" y2="18"></line>';
      }
    }
  }
  _setRunAllButtonRunning() {
    this.isRunningAll = true;
    const modeBtn = this.container.querySelector("#taskRunModeBtn");
    if (modeBtn) modeBtn.disabled = true;
    const btn = this.container.querySelector("#runAllTasksBtn");
    if (!btn) return;
    btn.classList.add("btn-stop");
    btn.title = window.I18n?.t("tasks.stopAll") || "Stop All";
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="6" y="6" width="12" height="12"></rect>
      </svg>
      ${window.I18n?.t("tasks.stop") || "Stop"}
    `;
  }
  _resetRunAllButton() {
    this.isRunningAll = false;
    this.shouldStopAll = false;
    this._hideBatchProgress();
    const btn = this.container.querySelector("#runAllTasksBtn");
    if (!btn) {
      this._updateLockState(
        window.ExecutionLock?.getState?.() || { locked: false },
      );
      return;
    }
    btn.classList.remove("btn-stop");
    btn.disabled = false;
    btn.title = window.I18n?.t("tasks.runAll") || "Run All";
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
      ${window.I18n?.t("tasks.runAll") || "Run All"}
    `;
    this._updateLockState(
      window.ExecutionLock?.getState?.() || { locked: false },
    );
  }
  _showBatchProgress(total) {
    const progressEl = this.container.querySelector("#taskBatchProgress");
    if (!progressEl) return;
    progressEl.classList.remove("hidden");
    this._batchTotal = total;
    this._batchCurrent = 0;
    this._updateBatchProgress(0, total);
  }
  _updateBatchProgress(current, total) {
    const labelEl = this.container.querySelector("#taskBatchProgressLabel");
    const countEl = this.container.querySelector("#taskBatchProgressCount");
    const fillEl = this.container.querySelector("#taskBatchProgressFill");
    if (labelEl) {
      labelEl.textContent =
        window.I18n?.t("tasks.runningTasks") || "Running tasks...";
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
    const progressEl = this.container.querySelector("#taskBatchProgress");
    if (progressEl) {
      progressEl.classList.add("hidden");
    }
  }
  _checkBatchComplete() {
    if (!this.isRunningAll || this._isRunningAllInFlight) return;
    const hasRunning = this.tasks.some((t) => t.status === "running");
    if (!hasRunning) {
      this._resetRunAllButton();
    }
  }
  stopAllTasks() {
    this.shouldStopAll = true;
    this._runAllAbortController?.abort();
    window._taskBatchStopped = true;
    window._taskShouldStop = true;
    if (window.ExecutionGate && window._currentTaskExecutionToken) {
      window.ExecutionGate.cancel(window._currentTaskExecutionToken);
      window._currentTaskExecutionToken = null;
    }
    if (window.PromptQueue && PromptQueue.isEnabled()) {
      const queue = PromptQueue.getInstance();
      const taskJobs = queue.getJobsByOwner("task") || [];
      for (const job of taskJobs) {
        queue.stopJob(job.id, {
          stopOrigin: "user",
          stopReason: "USER_CANCELLED",
        });
      }
    }
    if (window.MessageBridge) {
      MessageBridge.stopExecution().catch(() => {});
      if (window.GrokSession?.getTabInfo) {
        window.GrokSession.getTabInfo()
          .then((info) => {
            if (info?.tabId)
              MessageBridge.grokAbort(info.tabId).catch(() => {});
          })
          .catch(() => {});
      }
    }
    if (window.eventBus) {
      window.eventBus.emit("tasks:stop_all");
    }
    const btn = this.container.querySelector("#runAllTasksBtn");
    if (btn) {
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="6" y="6" width="12" height="12"></rect>
        </svg>
        ${window.I18n?.t("tasks.stoppingAll") || "Stopping..."}
      `;
      btn.disabled = true;
    }
  }
  async runAllTasks() {
    if (this.tasks.length === 0) return;
    if (this._isRunningAllInFlight || this.isRunningAll) {
      console.log("[TaskList] runAllTasks ignored \u2014 already in-flight");
      return;
    }
    this._isRunningAllInFlight = true;
    try {
      return await this._runAllTasksImpl();
    } catch (error) {
      console.error("[TaskList] Run all failed:", error);
      window.showNotification?.(
        error?.message || "Could not run tasks.",
        "error",
      );
    } finally {
      this._isRunningAllInFlight = false;
      this._runAllAbortController = null;
      if (this.isRunningAll) {
        window._taskBatchStopped = false;
        this._resetRunAllButton();
        try {
          await this.renderTaskList();
        } catch (error) {
          console.warn("[TaskList] Run all final render failed:", error);
        }
      }
    }
  }
  async _runAllTasksImpl() {
    if (window.featureGate) {
      const quota = await window.featureGate.checkQuotaAsync("tasks_run_max");
      if (!quota.allowed) {
        const isLoggedIn = window.authManager?.isLoggedIn();
        if (isLoggedIn) {
          const limitText =
            quota.limit === "unlimited"
              ? window.I18n?.t("tasks.runQuotaUnlimited") || "Unlimited"
              : `${quota.limit} runs/day`;
          window.customDialog?.alert(
            window.I18n?.t("tasks.runQuotaMsg", {
              limit: limitText,
              used: quota.used,
            }) ||
              `You've run out of Task runs for today.

Limit: ${limitText}
Used: ${quota.used} runs

Upgrade your plan to increase the limit.`,
            {
              title:
                window.I18n?.t("tasks.runQuotaTitle") || "Task Quota Exhausted",
            },
          );
        } else {
          window.featureGate.showLoginPrompt(
            window.I18n?.t("tasks.trialExhaustedRun") ||
              "You have used all trial task run credits.",
          );
        }
        return;
      }
      const quotaCheck = window.featureGate.checkGlobalQuotaWarning("Task");
      if (quotaCheck.exhausted) {
        return;
      }
    }
    if (
      !window.ProjectHelper?.getRunAllProjectContext ||
      !window.ProjectHelper?.assertRunAllProject
    ) {
      throw new Error("RUN_ALL_PROJECT_UNAVAILABLE");
    }
    const runAllContext = await window.ProjectHelper.getRunAllProjectContext();
    const available = new Map(this.tasks.map((task) => [task.task_id, task]));
    const lastPage = this._lastPage || 1;
    for (let page = (this._currentPage || 1) + 1; page <= lastPage; page++) {
      const result = await window.storageManager.getTasks({
        page,
        per_page: this._pageSize,
      });
      for (const task of result.data || []) {
        if (
          (!task.platform || task.platform === "flow") &&
          !available.has(task.task_id)
        )
          available.set(task.task_id, task);
      }
    }
    const allTasks = [...available.values()];
    const currentProjectTasks = allTasks.filter(
      (t) =>
        t.project_id &&
        String(t.project_id).toLowerCase() ===
          String(runAllContext.projectId).toLowerCase(),
    );
    const enabledTasks = currentProjectTasks.filter(
      (t) =>
        t.enabled !== false &&
        t.status !== "completed" &&
        t.status !== "running",
    );
    const totalPrompts = enabledTasks.reduce((sum, t) => {
      return (
        sum + (t.multi_prompt && t.prompts?.length > 1 ? t.prompts.length : 1)
      );
    }, 0);
    if (window.featureGate) {
      const globalRemaining =
        window.featureGate.getGlobalRemaining?.() ?? Infinity;
      if (globalRemaining !== Infinity && totalPrompts > globalRemaining) {
        await window.customDialog?.alert(
          window.I18n?.t("taskNotify.quotaInsufficient", {
            need: totalPrompts,
            remaining: globalRemaining,
          }) ||
            `C\u1EA7n ${totalPrompts} l\u01B0\u1EE3t prompt nh\u01B0ng ch\u1EC9 c\xF2n ${globalRemaining} l\u01B0\u1EE3t. Vui l\xF2ng gi\u1EA3m s\u1ED1 task ho\u1EB7c n\xE2ng c\u1EA5p.`,
          {
            type: "warning",
            title:
              window.I18n?.t("taskNotify.quotaInsufficientTitle") ||
              "Insufficient quota",
          },
        );
        return;
      }
      const batchLimit = window.featureGate.getPromptBatchLimit?.() ?? 4;
      if (batchLimit !== -1) {
        const overLimitTasks = enabledTasks.filter(
          (t) => t.multi_prompt && t.prompts?.length > batchLimit,
        );
        if (overLimitTasks.length > 0) {
          const taskNames = overLimitTasks
            .map((t) => `"${t.name}"`)
            .slice(0, 3)
            .join(", ");
          const moreCount = overLimitTasks.length - 3;
          const moreText =
            moreCount > 0
              ? window.I18n?.t?.("tasks.batchLimitMoreTasks", {
                  count: moreCount,
                }) || ` (and ${moreCount} more task(s))`
              : "";
          await window.customDialog?.alert(
            window.I18n?.t?.("tasks.batchLimitExceeded", {
              limit: batchLimit,
              tasks: taskNames + moreText,
            }) ||
              window.I18n?.t?.("taskNotify.batchLimitExceededFallback", {
                limit: batchLimit,
                tasks: taskNames + moreText,
              }) ||
              `G\xF3i c\u1EE7a b\u1EA1n gi\u1EDBi h\u1EA1n ${batchLimit} prompt/batch.

C\xE1c task v\u01B0\u1EE3t gi\u1EDBi h\u1EA1n:
${taskNames}${moreText}

Gi\u1EA3m s\u1ED1 prompt ho\u1EB7c n\xE2ng c\u1EA5p \u0111\u1EC3 t\u0103ng gi\u1EDBi h\u1EA1n.`,
            {
              type: "warning",
              title:
                window.I18n?.t?.("tasks.batchLimitTitle") ||
                "Plan limit exceeded",
            },
          );
          return;
        }
      }
    }
    const disabledCount = currentProjectTasks.filter(
      (t) => t.enabled === false,
    ).length;
    const doneCount = currentProjectTasks.filter(
      (t) => t.enabled !== false && t.status === "completed",
    ).length;
    if (enabledTasks.length === 0) {
      await window.customDialog.alert(
        window.I18n?.t("tasks.noTasksToRun") ||
          "No tasks to run. Check enabled/disabled and completed status.",
        {
          title: window.I18n?.t("tasks.noTasksToRunTitle") || "No tasks to run",
        },
      );
      return;
    }
    const hasMultiPrompt = enabledTasks.some(
      (t) => t.multi_prompt && t.prompts && t.prompts.length > 1,
    );
    const providerSet = new Set(enabledTasks.map((t) => t.provider || "flow"));
    const hasMixedProvider = providerSet.size > 1;
    const hasChatGPT = providerSet.has("chatgpt");
    const hasGrok = providerSet.has("grok");
    const hasMuse = providerSet.has("muse");
    const forceSequential =
      hasMultiPrompt || hasMixedProvider || hasChatGPT || hasGrok || hasMuse;
    const effectiveMode =
      forceSequential && this.runMode === "parallel"
        ? "sequential"
        : this.runMode;
    if (forceSequential && this.runMode === "parallel") {
      console.log("[TaskList] Forcing sequential mode:", {
        hasMultiPrompt,
        hasMixedProvider,
        hasChatGPT,
        hasGrok,
        hasMuse,
      });
    }
    const modeLabel =
      effectiveMode === "sequential"
        ? window.I18n?.t("tasks.modeSequential") || "sequential"
        : window.I18n?.t("tasks.modeParallel") || "song song";
    let message =
      window.I18n?.t("tasks.runConfirmMsg", {
        mode: modeLabel,
        count: enabledTasks.length,
      }) || `Run ${modeLabel} ${enabledTasks.length} tasks?`;
    message += `

${window.I18n?.t("project.currentProject") || "Current project"}: ${runAllContext.projectName || runAllContext.projectId}`;
    const skippedProjects = allTasks.length - currentProjectTasks.length;
    message += `
${window.I18n?.t("project.runAllScopeNote", { count: skippedProjects }) || `Only this project will run. ${skippedProjects} items from other projects or without a project will be skipped.`}`;
    const notes = [];
    if (hasMultiPrompt && this.runMode === "parallel") {
      notes.push(
        window.I18n?.t("tasks.hasMultiPromptNote") ||
          "Has multi-prompt task, auto-switching to sequential",
      );
    }
    if (
      hasGrok &&
      this.runMode === "parallel" &&
      !hasMultiPrompt &&
      !hasMixedProvider &&
      !hasChatGPT
    ) {
      notes.push(
        window.I18n?.t("tasks.hasGrokNote") ||
          "Has Grok task, auto-switching to sequential",
      );
    }
    if (
      hasMuse &&
      this.runMode === "parallel" &&
      !hasMultiPrompt &&
      !hasMixedProvider &&
      !hasChatGPT &&
      !hasGrok
    ) {
      notes.push(
        window.I18n?.t("tasks.hasMuseNote") ||
          "Has Muse task, auto-switching to sequential",
      );
    }
    if (
      (hasMixedProvider || hasChatGPT) &&
      this.runMode === "parallel" &&
      !hasMultiPrompt
    ) {
      notes.push(
        window.I18n?.t("tasks.hasChatGPTNote") ||
          "Has a ChatGPT task (or mixed providers), automatically switched to sequential",
      );
    }
    if (disabledCount > 0)
      notes.push(
        window.I18n?.t("tasks.disabledSkipNote", { count: disabledCount }) ||
          `${disabledCount} disabled task(s) will be skipped`,
      );
    if (doneCount > 0)
      notes.push(
        window.I18n?.t("tasks.doneSkipNote", { count: doneCount }) ||
          `${doneCount} completed task(s) will be skipped`,
      );
    if (notes.length > 0) message += "\n\n" + notes.join(". ") + ".";
    const allFlow = providerSet.size === 1 && providerSet.has("flow");
    const pq = window.PromptQueue?.getInstance?.();
    const activeJobs = pq?._jobs
      ? Array.from(pq._jobs.values()).filter((j) => j.isActive).length
      : 0;
    const pipelineEmpty = activeJobs === 0;
    const showReloadOption = allFlow && pipelineEmpty;
    let userAction = "cancel";
    if (showReloadOption) {
      await new Promise((resolve) => {
        window.customDialog.alert(message, {
          title: window.I18n?.t("tasks.runConfirmTitle") || "Run All",
          type: "warning",
          buttons: [
            {
              label: window.I18n?.t("common.cancel") || "Cancel",
              primary: false,
              action: () => {
                userAction = "cancel";
                resolve();
              },
            },
            {
              label:
                window.I18n?.t("tasks.reloadThenRun") || "Reload Flow + Run",
              primary: false,
              action: () => {
                userAction = "reload-then-run";
                resolve();
              },
            },
            {
              label: window.I18n?.t("common.run") || "Run",
              primary: true,
              action: () => {
                userAction = "run";
                resolve();
              },
            },
          ],
        });
      });
    } else {
      const ok = await window.customDialog.confirm(message, {
        title: window.I18n?.t("tasks.runConfirmTitle") || "Run All",
      });
      userAction = ok ? "run" : "cancel";
    }
    if (userAction === "cancel") return;
    if (userAction === "reload-then-run") {
      try {
        if (window.PromptQueue?.getInstance?.()?.forceReloadAndStabilize) {
          await window.PromptQueue.getInstance().forceReloadAndStabilize(
            "user-pre-task-batch",
          );
        } else if (window.MessageBridge) {
          await window.MessageBridge.sendToContentScript("autoReloadFlow", {});
          await new Promise((r) => setTimeout(r, 3e3));
        }
        console.log(
          "[TaskList] \u0110\xE3 reload Flow page tr\u01B0\u1EDBc khi ch\u1EA1y task batch",
        );
      } catch (e) {
        console.warn(
          "[TaskList] Reload Flow tr\u01B0\u1EDBc task batch fail (degrade):",
          e.message,
        );
      }
    }
    if (window.featureGate) {
      window.featureGate.setPendingTaskRun();
    }
    this.shouldStopAll = false;
    this._runAllAbortController = new AbortController();
    window._taskBatchStopped = false;
    this._setRunAllButtonRunning();
    this._showBatchProgress(enabledTasks.length);
    await this.renderTaskList();
    if (effectiveMode === "sequential") {
      let current = 0;
      for (const task of enabledTasks) {
        if (this.shouldStopAll || window._taskBatchStopped) break;
        current++;
        this._updateBatchProgress(current, enabledTasks.length);
        const completed = await this._runSingleTaskAndWait(
          task,
          runAllContext.projectId,
        );
        if (completed !== true) break;
      }
    } else {
      if (typeof window.runTaskBatchAndWait !== "function")
        throw new Error("TASK_BATCH_RUNNER_UNAVAILABLE");
      await window.runTaskBatchAndWait({
        tasks: enabledTasks,
        mode: "parallel",
        beforeDispatch: (items) =>
          window.ProjectHelper.assertRunAllProject(
            items,
            runAllContext.projectId,
          ),
        shouldStop: () => this.shouldStopAll,
        abortSignal: this._runAllAbortController?.signal,
      });
    }
  }
  async _runSingleTaskAndWait(task, runAllProjectId) {
    if (typeof window.runTaskAndWait !== "function")
      throw new Error("TASK_RUNNER_UNAVAILABLE");
    return await window.runTaskAndWait({
      task,
      ...(runAllProjectId
        ? {
            beforeDispatch: (items) =>
              window.ProjectHelper.assertRunAllProject(items, runAllProjectId),
          }
        : {}),
      shouldStop: () => this.shouldStopAll,
      abortSignal: this._runAllAbortController?.signal,
    });
  }
  async runSelected() {
    const tasksToRun = this.tasks.filter((t) =>
      this.selectedTasks.has(t.task_id),
    );
    if (window.eventBus) {
      window.eventBus.emit("tasks:run_batch", { tasks: tasksToRun });
    }
  }
  async deleteTask(taskId) {
    const task = this.tasks.find((t) => t.task_id === taskId);
    const taskName = task?.name || task?.prompt?.substring(0, 50) || "Task";
    if (task?.status === "running") {
      const I = window.I18n;
      window.customDialog?.alert(
        I?.t("tasks.cannotDeleteRunning") ||
          "Cannot delete a running task. Please stop it first.",
        {
          title: I?.t("tasks.taskRunning") || "Task is running",
          type: "warning",
        },
      );
      return;
    }
    const ok = await window.customDialog.confirmDangerous(
      window.I18n?.t("tasks.deleteConfirmShort") ||
        "Permanently delete this task?",
      {
        title: window.I18n?.t("tasks.deleteConfirmTitle") || "Delete Task",
        itemName: taskName,
      },
    );
    if (!ok) return;
    try {
      if (window.storageManager) {
        await window.storageManager.deleteTask(taskId);
      }
      await this.loadTasks();
      window.showNotification?.(
        window.I18n?.t("tasks.deleted") || "Task deleted",
        "success",
      );
      if (window.featureGate) {
        window.featureGate
          .refresh({ force: true })
          .catch((e) =>
            console.warn("[TaskList] FeatureGate refresh failed:", e),
          );
      }
    } catch (error) {
      console.error("[TaskList] Delete failed:", error);
      window.showNotification?.(
        window.I18n?.t("tasks.deleteFailed") || "Failed to delete task",
        "error",
      );
    }
  }
  async deleteSelected() {
    const runningTaskIds = [...this.selectedTasks].filter((id) => {
      const task = this.tasks.find((t) => t.task_id === id);
      return task?.status === "running";
    });
    const deletableIds = [...this.selectedTasks].filter(
      (id) => !runningTaskIds.includes(id),
    );
    const count = deletableIds.length;
    const I = window.I18n;
    if (deletableIds.length === 0) {
      window.customDialog?.alert(
        I?.t("tasks.allSelectedRunning") ||
          "All selected tasks are running \u2014 cannot delete.",
        {
          title: I?.t("tasks.taskRunning") || "Task is running",
          type: "warning",
        },
      );
      return;
    }
    let confirmMsg =
      I?.t("tasks.deleteSelectedShort") ||
      `Permanently delete ${count} selected task(s)?`;
    if (runningTaskIds.length > 0) {
      const skipNote =
        I?.t("tasks.skipRunningNote", { count: runningTaskIds.length }) ||
        `(${runningTaskIds.length} running task(s) will be skipped)`;
      confirmMsg = `${confirmMsg}

${skipNote}`;
    }
    const ok = await window.customDialog.confirmDangerous(confirmMsg, {
      title: I?.t("tasks.deleteSelectedTitle") || "Delete Tasks",
      itemName: `${count} tasks`,
    });
    if (!ok) return;
    try {
      for (const taskId of deletableIds) {
        if (window.storageManager) {
          await window.storageManager.deleteTask(taskId);
        }
      }
      for (const id of deletableIds) this.selectedTasks.delete(id);
      await this.loadTasks();
      window.showNotification?.(
        window.I18n?.t("tasks.deletedCount", { count }) ||
          `Deleted ${count} task(s)`,
        "success",
      );
      if (window.featureGate) {
        window.featureGate
          .refresh({ force: true })
          .catch((e) =>
            console.warn("[TaskList] FeatureGate refresh failed:", e),
          );
      }
    } catch (error) {
      console.error("[TaskList] Batch delete failed:", error);
      window.showNotification?.(
        window.I18n?.t("tasks.deleteSelectedFailed") ||
          "Failed to delete tasks",
        "error",
      );
    }
  }
  showLoading() {
    const container = this.container.querySelector("#taskListContainer");
    if (container) {
      container.innerHTML = this._renderSkeletons(5);
    }
  }
  _renderSkeletons(count = 5) {
    const skeletons = [];
    for (let i = 0; i < count; i++) {
      const promptLine2Width = 60 + Math.random() * 25;
      skeletons.push(`
        <div class="task-card skeleton">
          <div class="skeleton-base" style="width: 6px; height: 24px; border-radius: 2px; flex-shrink: 0; opacity: 0.4;"></div>
          <div class="skeleton-checkbox skeleton-base" style="width: 14px; height: 14px; border-radius: 3px; flex-shrink: 0;"></div>
          <span class="skeleton-status skeleton-circle skeleton-base" style="width: 14px; height: 14px; flex-shrink: 0;"></span>
          <div class="skeleton-info" style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <div class="skeleton-name skeleton-base" style="width: ${30 + Math.random() * 25}%; height: 13px;"></div>
              <div class="skeleton-base" style="width: 36px; height: 14px; border-radius: 8px;"></div>
              <div class="skeleton-base" style="width: 42px; height: 14px; border-radius: 8px;"></div>
            </div>
            <div class="skeleton-prompt skeleton-base" style="width: ${78 + Math.random() * 20}%; height: 11px;"></div>
            <div class="skeleton-prompt skeleton-base" style="width: ${promptLine2Width}%; height: 11px;"></div>
            <div style="display: flex; align-items: center; gap: 6px; margin-top: 2px;">
              <div class="skeleton-base" style="width: 50px; height: 10px;"></div>
              <div class="skeleton-base" style="width: 22px; height: 10px;"></div>
              <div class="skeleton-base" style="width: 14px; height: 10px;"></div>
              <div class="skeleton-base" style="width: 18px; height: 18px; border-radius: 3px; margin-left: 4px;"></div>
              <div class="skeleton-base" style="width: 18px; height: 18px; border-radius: 3px;"></div>
              <div class="skeleton-base" style="width: 18px; height: 18px; border-radius: 3px;"></div>
            </div>
            <div class="skeleton-base" style="width: ${28 + Math.random() * 12}%; height: 9px; margin-top: 1px;"></div>
          </div>
          <div class="skeleton-actions" style="display: flex; gap: 4px; align-items: center; flex-shrink: 0;">
            <div class="skeleton-btn skeleton-base" style="width: 32px; height: 18px; border-radius: 10px;"></div>
            <div class="skeleton-btn skeleton-base" style="width: 18px; height: 18px;"></div>
          </div>
        </div>
      `);
    }
    return skeletons.join("");
  }
  showError(message) {
    const container = this.container.querySelector("#taskListContainer");
    if (container) {
      container.innerHTML = `
        <div class="task-empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <p style="color: var(--destructive);">${message}</p>
          <button class="btn btn-secondary btn-sm" data-task-load-retry>${window.I18n?.t("common.retry") || "Retry"}</button>
        </div>
      `;
      container
        .querySelector("[data-task-load-retry]")
        ?.addEventListener("click", () => this.loadTasks());
    }
  }
  _loadRefThumbnails(container) {
    if (!this._refTileCache) this._refTileCache = {};
    const placeholders = container.querySelectorAll(
      ".task-ref-thumb-placeholder",
    );
    if (placeholders.length === 0) return;
    const missingIds = [];
    const currentProjectId = String(window._currentProjectId || "");
    placeholders.forEach((el) => {
      const fileId = el.dataset?.fileId;
      if (!fileId) return;
      const taskProjectId = String(el.dataset?.projectId || "");
      if (!currentProjectId || taskProjectId !== currentProjectId) {
        el.classList.add("task-ref-thumb-cross-project");
        el.title =
          window.I18n?.t("tasks.crossProjectWarning") ||
          "Reference belongs to another project";
        return;
      }
      if (this._refTileCache[fileId]) {
        el.outerHTML = `<img class="task-ref-thumb" src="${this._refTileCache[fileId]}" alt="ref" />`;
      } else {
        missingIds.push(fileId);
      }
    });
    if (missingIds.length === 0 || typeof MessageBridge === "undefined") return;
    const uniqueIds = [...new Set(missingIds)];
    MessageBridge.getThumbnailsByIds(uniqueIds, { deep: false })
      .then((scanResult) => {
        const results = scanResult?.results || {};
        for (const [fid, info] of Object.entries(results)) {
          if (info?.thumbnail) {
            this._refTileCache[fid] = info.thumbnail;
          }
        }
        container
          .querySelectorAll(".task-ref-thumb-placeholder")
          .forEach((el) => {
            const fileId = el.dataset?.fileId;
            if (fileId && this._refTileCache[fileId]) {
              el.outerHTML = `<img class="task-ref-thumb" src="${this._refTileCache[fileId]}" alt="ref" />`;
            }
          });
      })
      .catch(() => {});
  }
  _updateLockState(state) {
    const runAllBtn = this.container.querySelector("#runAllTasksBtn");
    const isPipelineOn = window.PromptQueue && PromptQueue.isEnabled();
    const isBlocked =
      state.locked &&
      state.owner !== "task" &&
      state.owner !== "queue" &&
      !isPipelineOn;
    if (runAllBtn && !this.isRunningAll) {
      runAllBtn.disabled = isBlocked;
      runAllBtn.title = isBlocked
        ? window.I18n?.t("tasks.running", {
            name: state.label || state.owner,
          }) || `Running: ${state.label || state.owner}`
        : window.I18n?.t("tasks.runAll") || "Run All";
    }
    const runModeBtn = this.container?.querySelector("#taskRunModeBtn");
    if (runModeBtn) {
      runModeBtn.disabled = isBlocked || this.isRunningAll;
    }
    const bannerId = "taskLockBanner";
    let banner = this.container.querySelector(`#${bannerId}`);
    if (!isBlocked) {
      if (banner) banner.remove();
      return;
    }
    if (!banner) {
      banner = document.createElement("div");
      banner.id = bannerId;
      banner.className = "execution-lock-banner";
      const listContainer = this.container.querySelector("#taskListContainer");
      if (listContainer) {
        listContainer.parentElement.insertBefore(banner, listContainer);
      }
    }
    banner.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <span>${window.I18n?.t("tasks.running", { name: state.label || state.owner }) || `Running: ${state.label || state.owner}`}</span>
    `;
  }
  _handleExpiredResultThumbnails(container) {
    const resultImgs = container.querySelectorAll(".task-result-thumb-card");
    if (resultImgs.length === 0) return;
    const expiredTaskIds = new Set();
    resultImgs.forEach((img) => {
      img.onerror = () => {
        const card = img.closest(".task-card");
        if (card?.dataset.taskId) expiredTaskIds.add(card.dataset.taskId);
        img.style.display = "none";
        if (this._expiredTimer) clearTimeout(this._expiredTimer);
        this._expiredTimer = setTimeout(() => {
          this._rescanExpiredResults([...expiredTaskIds]);
          expiredTaskIds.clear();
        }, 500);
      };
    });
  }
  async _syncNativeMediaIdentities() {
    if (this._nativeMediaSync) {
      this._nativeMediaSyncPending = true;
      return this._nativeMediaSync;
    }
    if (typeof MessageBridge === "undefined" || !this.tasks.length) return {};
    const taskList = this.tasks;
    const fileNamesById = {},
      ownerRecords = [],
      ids = new Set();
    for (const task of taskList) {
      if (
        (task.provider || "flow") !== "flow" ||
        ["running", "processing"].includes(task.status)
      )
        continue;
      for (const kind of ["result", "ref"])
        for (const id of String(task[kind + "_file_ids"] || "")
          .split(",")
          .map((id2) => id2.trim())
          .filter(Boolean)) {
          if (id.startsWith("upload_")) continue;
          ids.add(id);
          fileNamesById[id] = task[kind + "_file_names"]?.[id];
          ownerRecords.push({
            resultId: id,
            mediaUuid: task[kind + "_thumbnails"]?.[id]?.media_uuid || null,
          });
        }
    }
    if (!ids.size) return {};
    this._nativeMediaSync = (async () => {
      const response = await MessageBridge.getThumbnailsByIds([...ids], {
        nativeMediaIdentitiesOnly: true,
        fileNamesById,
        ownerRecords,
      });
      if (this.tasks !== taskList) return {};
      const results = response?.results || {};
      const eligibleResults = {};
      let anyChanged = false;
      for (const task of taskList) {
        if (this.tasks !== taskList) return {};
        if (
          (task.provider || "flow") !== "flow" ||
          ["running", "processing"].includes(task.status) ||
          (task.project_id &&
            response.projectId &&
            task.project_id.toLowerCase() !== response.projectId.toLowerCase())
        )
          continue;
        let changed = false;
        for (const kind of ["result", "ref"]) {
          let kindChanged = false;
          const thumbs = { ...(task[kind + "_thumbnails"] || {}) },
            names = { ...(task[kind + "_file_names"] || {}) };
          for (const id of String(task[kind + "_file_ids"] || "")
            .split(",")
            .map((id2) => id2.trim())
            .filter(Boolean)) {
            const info = results[id];
            if (!info?.thumbnail) continue;
            const old = thumbs[id],
              previous =
                old && typeof old === "object" ? old : { thumbnail: old || "" };
            if (
              previous.media_uuid &&
              previous.media_uuid.toLowerCase() !==
                info.media_uuid?.toLowerCase()
            )
              continue;
            if (previous.type && previous.type !== info.type) continue;
            eligibleResults[id] =
              info.type === "video" && info.video_url
                ? {
                    ...info,
                    thumbnail: info.video_url,
                    source_thumbnail: info.thumbnail,
                  }
                : info;
            const next = {
              ...previous,
              ...info,
              ...(kind === "result" &&
                info.type === "video" &&
                info.video_url && {
                  thumbnail: info.video_url,
                  source_thumbnail: info.thumbnail,
                }),
            };
            if (
              JSON.stringify(previous) !== JSON.stringify(next) ||
              names[id] !== info.file_name
            ) {
              thumbs[id] = next;
              names[id] = info.file_name;
              changed = true;
              kindChanged = true;
            }
          }
          if (kindChanged) {
            task[kind + "_thumbnails"] = thumbs;
            task[kind + "_file_names"] = names;
          }
        }
        if (changed) {
          anyChanged = true;
          await window.storageManager?.saveTask?.(task);
        }
      }
      if (anyChanged && this.tasks === taskList) this.renderTaskList();
      return eligibleResults;
    })().finally(() => {
      this._nativeMediaSync = null;
      if (this._nativeMediaSyncPending) {
        this._nativeMediaSyncPending = false;
        this._syncNativeMediaIdentities().catch(() => {});
      }
    });
    return this._nativeMediaSync;
  }
  async _rescanExpiredResults(taskIds) {
    if (typeof MessageBridge === "undefined" || taskIds.length === 0) return;
    const taskList = this.tasks;
    const nativeResults = await this._syncNativeMediaIdentities().catch(
      () => ({}),
    );
    const allFileIds = new Set();
    for (const taskId of taskIds) {
      const task = this.tasks.find((t) => t.task_id === taskId);
      if (!task?.result_file_ids) continue;
      const resultIds = task.result_file_ids
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const id of resultIds) {
        if (!id.startsWith("upload_")) allFileIds.add(id);
      }
    }
    if (allFileIds.size === 0) return;
    const apiResults = { ...nativeResults };
    if (window.FlowApiFacade?.resolveMedia) {
      const uuidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      await Promise.allSettled(
        [...allFileIds].map(async (fileId) => {
          if (apiResults[fileId]) return;
          const owner = this.tasks.find((task) =>
            String(task.result_file_ids || "")
              .split(",")
              .map((v) => v.trim())
              .includes(fileId),
          );
          const saved = owner?.result_thumbnails?.[fileId];
          const savedObj = saved && typeof saved === "object" ? saved : {};
          const providerData = owner?.result_provider_urls?.[fileId] || null;
          const mediaUuid = [
            savedObj.media_uuid,
            providerData?.media_uuid,
            fileId,
          ]
            .map((value) => String(value || ""))
            .find((value) => uuidPattern.test(value));
          if (!mediaUuid) return;
          const isVideo =
            savedObj.type === "video" ||
            !!savedObj.video_url ||
            owner?.media_type === "Video" ||
            owner?.gen_type === "Video";
          const media = await window.FlowApiFacade.resolveMedia({
            mediaId: mediaUuid,
            mediaType: isVideo ? "video" : "image",
            providerData,
            thumbnail: savedObj,
          }).catch(() => null);
          if (!media?.url) return;
          apiResults[fileId] = {
            ...savedObj,
            thumbnail: media.url,
            ...(isVideo && { video_url: media.url }),
            type: isVideo ? "video" : "image",
            media_uuid: mediaUuid,
            persistent_media_id: savedObj.persistent_media_id || mediaUuid,
            identity_kind: savedObj.identity_kind || "flow-api-uuid",
            identity_durability:
              savedObj.identity_durability || "durable-resolver",
          };
        }),
      );
    }
    const unresolvedIds = [...allFileIds].filter((id) => !apiResults[id]);
    const domResult = unresolvedIds.length
      ? await MessageBridge.getThumbnailsByIds(unresolvedIds, {
          deep: false,
        }).catch(() => null)
      : null;
    Promise.resolve({
      results: { ...(domResult?.results || {}), ...apiResults },
    })
      .then((result) => {
        if (this.tasks !== taskList) return;
        const results = result.results || {};
        if (Object.keys(results).length === 0) return;
        for (const taskId of taskIds) {
          const task = this.tasks.find((t) => t.task_id === taskId);
          if (
            !task?.result_file_ids ||
            ["running", "processing"].includes(task.status)
          )
            continue;
          const resultIds = task.result_file_ids
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          const newThumbs = { ...(task.result_thumbnails || {}) };
          const taskIsVideo =
            task.media_type === "Video" || task.gen_type === "Video";
          let changed = false;
          for (const fileId of resultIds) {
            const rawInfo = results[fileId];
            const info =
              rawInfo?.type === "video" && rawInfo.video_url
                ? {
                    ...rawInfo,
                    thumbnail: rawInfo.video_url,
                    source_thumbnail:
                      rawInfo.source_thumbnail || rawInfo.thumbnail,
                  }
                : rawInfo;
            if (info?.thumbnail) {
              const previous = newThumbs[fileId];
              const previousObj =
                previous && typeof previous === "object" ? previous : {};
              const existingThumb =
                previousObj.thumbnail ||
                (typeof previous === "string" ? previous : "");
              if (
                existingThumb !== info.thumbnail ||
                (!previousObj.media_uuid && info.media_uuid) ||
                (!previousObj.persistent_media_id &&
                  info.persistent_media_id) ||
                (!previousObj.video_url && info.video_url)
              ) {
                newThumbs[fileId] = {
                  ...previousObj,
                  ...info,
                  thumbnail: info.thumbnail,
                  type:
                    info.type ||
                    previousObj.type ||
                    (taskIsVideo ? "video" : "image"),
                  file_name: info.file_name || previousObj.file_name || "",
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
                changed = true;
              }
            }
          }
          if (changed) {
            task.result_thumbnails = newThumbs;
            if (window.storageManager) {
              window.storageManager.saveTask(task).catch(() => {});
            }
          }
        }
        this.renderTaskList();
      })
      .catch(() => {});
  }
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text || "";
    return div.innerHTML;
  }
  escapeAttr(text) {
    return this.escapeHtml(text).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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
    if (s === "running") return I?.t("tasks.statusRunning") || "Running...";
    if (s === "completed") return I?.t("tasks.statusCompleted") || "Completed";
    if (s === "error" || s === "failed")
      return I?.t("tasks.statusFailed") || "Failed";
    return I?.t("tasks.statusPending") || "Pending";
  }
  static _showTaskConfirmModal(task, provider, providerLabel) {
    return new Promise((resolve) => {
      const overlay = document.getElementById("taskConfirmRunOverlay");
      if (!overlay) {
        resolve(true);
        return;
      }
      const I = window.I18n;
      const isChatGPT = provider === "chatgpt";
      const isGrok = provider === "grok";
      const isGemini = provider === "gemini";
      const isMuse = provider === "muse";
      const isFlow = provider === "flow";
      const flowTabsWarning = document.getElementById(
        "taskConfirmFlowTabsWarning",
      );
      if (flowTabsWarning) {
        flowTabsWarning.classList.add("hidden");
        flowTabsWarning.replaceChildren();
      }
      const flowApiIntended =
        isFlow && window.FlowApiAdapter?.isApiModeIntended?.() === true;
      const flowApiRequired =
        flowApiIntended &&
        window.FlowApiAdapter?.isApiModeRequired?.() === true;
      const submitBtn = document.getElementById("taskConfirmSubmit");
      if (submitBtn) submitBtn.disabled = isFlow;
      const taskName = task.task_name || "Task";
      const nameEl = document.getElementById("taskConfirmName");
      if (nameEl) nameEl.textContent = taskName;
      const ratioEl = document.getElementById("taskConfirmRatio");
      const qtyEl = document.getElementById("taskConfirmQuantity");
      const downloadResEl = document.getElementById("taskConfirmDownloadRes");
      const ratioRow = document.getElementById("taskConfirmRatioRow");
      const qtyRow = document.getElementById("taskConfirmQuantityRow");
      const downloadRow = document.getElementById("taskConfirmDownloadRow");
      const ratioMap = {
        story: "9:16",
        portrait: "3:4",
        square: "1:1",
        landscape: "4:3",
        widescreen: "16:9",
      };
      const grokRatioMap = {
        story: "9:16",
        portrait: "2:3",
        square: "1:1",
        landscape: "3:2",
        widescreen: "16:9",
      };
      const iconMap = {
        "16:9": "\u25AC",
        "4:3": "\u25AD",
        "1:1": "\u25A1",
        "3:4": "\u25AF",
        "9:16": "\u25AE",
        "2:3": "\u25AF",
        "3:2": "\u25AD",
      };
      const getIcon = (r) =>
        iconMap[r] || iconMap[ratioMap[r]] || iconMap[grokRatioMap[r]] || "";
      const hideQtyRes = isChatGPT || isGrok || isGemini || isMuse;
      if (qtyRow) qtyRow.classList.toggle("hidden", hideQtyRes);
      if (downloadRow) downloadRow.classList.add("hidden");
      if (ratioEl) {
        const ratio = task.ratio || "16:9";
        const displayRatio = isGrok
          ? grokRatioMap[ratio] || ratio
          : ratioMap[ratio] || ratio;
        ratioEl.textContent = `${getIcon(displayRatio)} ${displayRatio}`;
      }
      if (qtyEl && isFlow) {
        qtyEl.textContent = `x${task.quantity || 1}`;
      }
      const providerStatusRow = document.getElementById(
        "taskConfirmProviderStatus",
      );
      const providerLabelEl = document.getElementById(
        "taskConfirmProviderLabel",
      );
      const providerBadge = document.getElementById("taskConfirmProviderBadge");
      if (TaskList._taskConfirmStatusPollTimer) {
        clearInterval(TaskList._taskConfirmStatusPollTimer);
        TaskList._taskConfirmStatusPollTimer = null;
      }
      const iconSpinner = `<svg class="badge-icon badge-icon-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
      const iconCheck = `<svg class="badge-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
      const iconWarning = `<svg class="badge-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
      const iconCloudflare = `<svg class="badge-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
      const providerNameMapT = {
        flow: "Google Flow",
        chatgpt: "ChatGPT",
        grok: "Grok",
        gemini: "Gemini",
        muse: "Muse",
      };
      const providerLogoEl = document.getElementById("taskConfirmProviderLogo");
      if (providerLogoEl)
        providerLogoEl.innerHTML =
          window.ProviderBrandIcons?.get?.(provider) || "";
      if (providerLabelEl)
        providerLabelEl.textContent =
          providerNameMapT[provider] || providerLabel;
      const genTypeChip = document.getElementById("taskConfirmGenTypeChip");
      if (genTypeChip) {
        if (isFlow || isGrok || isGemini || isMuse) {
          const isVideoTask =
            task.media_type === "Video" || task.gen_type === "Video";
          const iconVideo = `<svg class="badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>`;
          const iconImage = `<svg class="badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>`;
          genTypeChip.innerHTML = isVideoTask
            ? `${iconVideo}<span>${I?.t("workflow.genTypeVideo") || "Video"}</span>`
            : `${iconImage}<span>${I?.t("workflow.genTypeImage") || "Image"}</span>`;
          genTypeChip.classList.remove("hidden");
        } else {
          genTypeChip.classList.add("hidden");
        }
      }
      if (providerStatusRow) {
        providerStatusRow.classList.remove("hidden");
        if (isFlow) {
          if (providerBadge) {
            providerBadge.className = "confirm-run-provider-badge is-checking";
            providerBadge.innerHTML = `${iconSpinner}<span class="badge-text">${I?.t("gen.providerStatusChecking") || "Checking..."}</span>`;
          }
          const flowActivationPromise =
            TaskList._flowActivationPromise ||
            chrome.runtime.sendMessage({
              action: "ensureFlowTabActive",
              focusWindow: true,
            });
          const waitForFlowActivation = async () => {
            try {
              return await flowActivationPromise;
            } finally {
              if (TaskList._flowActivationPromise === flowActivationPromise) {
                TaskList._flowActivationPromise = null;
              }
            }
          };
          let flowContentRepairAttempted = false;
          let lastFlowStatusDiagnostic = null;
          const checkFlow = async () => {
            if (overlay.classList.contains("hidden")) {
              if (TaskList._taskConfirmStatusPollTimer) {
                clearInterval(TaskList._taskConfirmStatusPollTimer);
                TaskList._taskConfirmStatusPollTimer = null;
              }
              return false;
            }
            try {
              const activation = await waitForFlowActivation();
              window.MessageBridge?.renderFlowProjectTabsAdvisory?.(
                document.getElementById("taskConfirmFlowTabsWarning"),
              ).catch?.(() => {});
              const shouldRepair = !flowContentRepairAttempted;
              flowContentRepairAttempted = true;
              const resp =
                activation?.ok === true && !!activation.projectId
                  ? await chrome.runtime.sendMessage({
                      action: "checkFlowTabOpen",
                      passive: !shouldRepair,
                      readinessScope: "project",
                      targetTabId: activation.tabId,
                    })
                  : {
                      ready: false,
                      isOpen: activation?.ok === true,
                      error:
                        activation?.ok === true
                          ? "NO_PROJECT_OPEN"
                          : activation?.error || "NO_TAB",
                    };
              if (!providerBadge || overlay.classList.contains("hidden"))
                return false;
              if (resp?.ready ?? resp?.isOpen) {
                if (submitBtn) submitBtn.disabled = false;
                providerBadge.className = "confirm-run-provider-badge is-ready";
                providerBadge.innerHTML = `${iconCheck}<span class="badge-text">${I?.t("gen.providerStatusReady") || "Ready"}</span>`;
                if (!flowApiIntended && TaskList._taskConfirmStatusPollTimer) {
                  clearInterval(TaskList._taskConfirmStatusPollTimer);
                  TaskList._taskConfirmStatusPollTimer = null;
                }
              } else {
                if (submitBtn) submitBtn.disabled = true;
                providerBadge.className =
                  "confirm-run-provider-badge is-warning";
                const statusText =
                  resp?.error === "CONTENT_REVISION_MISMATCH" ||
                  (resp?.projectId && resp?.contentReady === false)
                    ? I?.t("app.refreshFlowTab") ||
                      "Refresh the Google Flow tab and try again."
                    : resp?.isOpen === false || resp?.error === "NO_TAB"
                      ? I?.t("workflow.providerNoTab") || "Tab not opened"
                      : I?.t("workflow.projectNotReady") ||
                        "Flow project not ready";
                providerBadge.innerHTML = `${iconWarning}<span class="badge-text">${statusText}</span>`;
                const diagnostic = JSON.stringify({
                  tabId: resp?.tabId || activation?.tabId || null,
                  driverKey: resp?.driverKey || null,
                  projectId: resp?.projectId || null,
                  isProjectEditor: resp?.isProjectEditor === true,
                  contentReady: resp?.contentReady === true,
                  preflightState: resp?.preflightState || null,
                  error: resp?.error || null,
                });
                if (diagnostic !== lastFlowStatusDiagnostic) {
                  lastFlowStatusDiagnostic = diagnostic;
                  console.warn(
                    "[TaskList] Flow confirm readiness rejected",
                    diagnostic,
                  );
                }
              }
              return resp?.ready ?? resp?.isOpen ?? false;
            } catch (_) {
              if (submitBtn) submitBtn.disabled = true;
              return false;
            }
          };
          let reconnectAttempted = false;
          let flowStatusInFlight = false;
          const pollFlowStatus = async () => {
            if (overlay.classList.contains("hidden")) {
              if (TaskList._taskConfirmStatusPollTimer)
                clearInterval(TaskList._taskConfirmStatusPollTimer);
              TaskList._taskConfirmStatusPollTimer = null;
              return;
            }
            if (flowStatusInFlight) return;
            flowStatusInFlight = true;
            try {
              if (!flowApiIntended) {
                await checkFlow();
                return;
              }
              const activation = await waitForFlowActivation();
              if (activation?.ok !== true || !activation.projectId) {
                if (submitBtn) submitBtn.disabled = true;
                if (providerBadge) {
                  providerBadge.className =
                    "confirm-run-provider-badge is-warning";
                  const activationText =
                    activation?.ok === true
                      ? I?.t("workflow.projectNotReady") ||
                        "Flow project not ready"
                      : I?.t("workflow.providerNoTab") || "Tab not opened";
                  providerBadge.innerHTML = `${iconWarning}<span class="badge-text">${activationText}</span>`;
                }
                return;
              }
              const options = {
                surface: "task",
                mediaType:
                  task?.gen_type === "Video" || task?.genType === "Video"
                    ? "video"
                    : "image",
                force: false,
                passive: true,
              };
              const br = !reconnectAttempted
                ? await window.FlowApiSessionCoordinator?.checkWithReconnect?.({
                    ...options,
                    trigger: "task_confirm",
                  })
                : await window.FlowApiSessionCoordinator?.check?.(options);
              reconnectAttempted = true;
              if (!providerBadge || overlay.classList.contains("hidden"))
                return;
              if (br?.ready === true) {
                if (providerLabelEl) providerLabelEl.textContent = "Flow API";
                if (submitBtn) submitBtn.disabled = false;
                providerBadge.className = "confirm-run-provider-badge is-ready";
                providerBadge.innerHTML = `${iconCheck}<span class="badge-text">${I?.t("gen.providerStatusReady") || "Ready"}</span>`;
              } else if (flowApiRequired) {
                if (providerLabelEl) providerLabelEl.textContent = "Flow API";
                if (submitBtn) submitBtn.disabled = true;
                providerBadge.className =
                  "confirm-run-provider-badge is-warning";
                providerBadge.innerHTML = `${iconWarning}<span class="badge-text">${I?.t("gen.bridgeNotReady") || "Bridge not ready"}</span>`;
              } else {
                if (providerLabelEl)
                  providerLabelEl.textContent = providerNameMapT.flow;
                if (submitBtn) submitBtn.disabled = false;
                await checkFlow();
              }
            } catch (_) {
              reconnectAttempted = true;
              if (flowApiRequired && submitBtn) submitBtn.disabled = true;
              else {
                await checkFlow();
              }
            } finally {
              flowStatusInFlight = false;
            }
          };
          Promise.resolve().then(pollFlowStatus);
          TaskList._taskConfirmStatusPollTimer = setInterval(
            pollFlowStatus,
            3e3,
          );
        } else if (isChatGPT || isGrok || isGemini || isMuse) {
          const Session = isChatGPT
            ? window.ChatGPTSession
            : isGrok
              ? window.GrokSession
              : isGemini
                ? window.GeminiSession
                : window.MuseSession;
          let lastStatus = null;
          let statusCheckInFlight = false;
          const checkAndUpdateStatus = async () => {
            if (!providerBadge || statusCheckInFlight) return;
            if (overlay.classList.contains("hidden")) {
              if (TaskList._taskConfirmStatusPollTimer) {
                clearInterval(TaskList._taskConfirmStatusPollTimer);
                TaskList._taskConfirmStatusPollTimer = null;
              }
              return;
            }
            statusCheckInFlight = true;
            try {
              let newStatus = "checking";
              let statusText =
                I?.t("gen.providerStatusChecking") || "Checking...";
              let statusIcon = iconSpinner;
              if (isGrok && Session?.checkStatus) {
                const status = await Session.checkStatus();
                if (status.loggedIn && !status.cloudflareChallenge) {
                  newStatus = "ready";
                } else if (status.cloudflareChallenge) {
                  newStatus = "cloudflare";
                  statusText =
                    I?.t("gen.providerStatusCloudflare") ||
                    "Waiting Cloudflare...";
                  statusIcon = iconCloudflare;
                } else {
                  newStatus = "login";
                  statusText =
                    I?.t("gen.providerStatusLogin") || "Not logged in";
                  statusIcon = iconWarning;
                }
              } else if (Session?.ensureReady) {
                if (isChatGPT && TaskList._chatgptActivationPromise) {
                  await TaskList._chatgptActivationPromise;
                }
                const result = await Session.ensureReady({
                  createIfMissing: false,
                  activate: false,
                  silent: true,
                  forceCheck: isChatGPT,
                  waitForEditorMs: isChatGPT ? 12e3 : 0,
                });
                if (result?.ready) {
                  newStatus = "ready";
                } else if (result?.error === "NO_TAB") {
                  newStatus = "no-tab";
                  statusText =
                    I?.t("workflow.providerNoTab") || "Tab not opened";
                  statusIcon = iconWarning;
                } else if (
                  result?.error === "NOT_LOGGED_IN" ||
                  result?.error === "NOT_CHATGPT_URL"
                ) {
                  newStatus = "login";
                  statusText =
                    I?.t("gen.providerStatusLogin") || "Not logged in";
                  statusIcon = iconWarning;
                } else if (isMuse) {
                  const code = String(result?.error || "MUSE_NOT_READY");
                  statusText = /^[A-Z0-9_:-]{1,120}$/.test(code)
                    ? code
                    : "MUSE_NOT_READY";
                  newStatus = `not-ready:${statusText}`;
                  statusIcon = iconWarning;
                } else if (!isChatGPT) {
                  newStatus = "login";
                  statusText =
                    I?.t("gen.providerStatusLogin") || "Not logged in";
                  statusIcon = iconWarning;
                }
              }
              if (newStatus === lastStatus) return;
              lastStatus = newStatus;
              if (newStatus === "ready") {
                providerBadge.className = "confirm-run-provider-badge is-ready";
                providerBadge.innerHTML = `${iconCheck}<span class="badge-text">${I?.t("gen.providerStatusReady") || "Ready"}</span>`;
                if (TaskList._taskConfirmStatusPollTimer) {
                  clearInterval(TaskList._taskConfirmStatusPollTimer);
                  TaskList._taskConfirmStatusPollTimer = null;
                }
              } else if (newStatus === "cloudflare") {
                providerBadge.className =
                  "confirm-run-provider-badge is-warning";
                providerBadge.innerHTML = `${statusIcon}<span class="badge-text">${statusText}</span>`;
              } else if (newStatus === "checking") {
                providerBadge.className =
                  "confirm-run-provider-badge is-checking";
                providerBadge.innerHTML = `${statusIcon}<span class="badge-text">${statusText}</span>`;
              } else {
                providerBadge.className =
                  "confirm-run-provider-badge is-warning";
                providerBadge.innerHTML = `${statusIcon}<span class="badge-text">${statusText}</span>`;
              }
            } catch {
              if (lastStatus !== "checking") {
                lastStatus = "checking";
                providerBadge.className =
                  "confirm-run-provider-badge is-checking";
                providerBadge.innerHTML = `${iconSpinner}<span class="badge-text">${I?.t("gen.providerStatusChecking") || "Checking..."}</span>`;
              }
            } finally {
              statusCheckInFlight = false;
            }
          };
          if (providerBadge) {
            providerBadge.className = "confirm-run-provider-badge is-checking";
            providerBadge.innerHTML = `${iconSpinner}<span class="badge-text">${I?.t("gen.providerStatusChecking") || "Checking..."}</span>`;
          }
          checkAndUpdateStatus();
          TaskList._taskConfirmStatusPollTimer = setInterval(
            checkAndUpdateStatus,
            3e3,
          );
        } else {
          providerStatusRow.classList.add("hidden");
        }
      }
      overlay.classList.remove("hidden");
      const cleanup = () => {
        overlay.classList.add("hidden");
        if (TaskList._taskConfirmStatusPollTimer) {
          clearInterval(TaskList._taskConfirmStatusPollTimer);
          TaskList._taskConfirmStatusPollTimer = null;
        }
        submitBtn?.removeEventListener("click", onSubmit);
        cancelBtn?.removeEventListener("click", onCancel);
        closeBtn?.removeEventListener("click", onCancel);
        document.removeEventListener("keydown", onKeydown);
      };
      const onSubmit = () => {
        if (submitBtn?.disabled) return;
        cleanup();
        resolve(true);
      };
      const onCancel = () => {
        cleanup();
        resolve(false);
      };
      const onKeydown = (e) => {
        if (e.key === "Escape") onCancel();
        else if (e.key === "Enter") onSubmit();
      };
      const cancelBtn = document.getElementById("taskConfirmCancel");
      const closeBtn = document.getElementById("taskConfirmClose");
      submitBtn?.addEventListener("click", onSubmit);
      cancelBtn?.addEventListener("click", onCancel);
      closeBtn?.addEventListener("click", onCancel);
      document.addEventListener("keydown", onKeydown);
      submitBtn?.focus();
    });
  }
}
window.TaskList = TaskList;
