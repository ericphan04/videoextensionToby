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
const _StorageManager = class _StorageManager {
  constructor() {
    this.storage = null;
    this.mode = "local";
    this.listeners = [];
    this._migrationInProgress = false;
    this._syncInProgress = false;
  }
  async init() {
    if (window.authManager?.isLoggedIn() && window.ApiStorage) {
      this.mode = "api";
      this.storage = new ApiStorage();
      this._syncPendingWorkflows().catch((e) => {
        console.warn(
          "[StorageManager] Background workflow sync failed:",
          e.message,
        );
      });
      this._syncPendingTasks().catch((e) => {
        console.warn(
          "[StorageManager] Background task sync failed:",
          e.message,
        );
      });
    } else {
      this.mode = "local";
      this.storage = new LocalStorage();
    }
    console.log(
      "[StorageManager] Kh\u1EDFi t\u1EA1o v\u1EDBi mode:",
      this.mode,
    );
    return this;
  }
  async switchToApi() {
    if (!window.authManager?.isLoggedIn()) {
      throw new Error(
        "B\u1EA1n c\u1EA7n \u0111\u0103ng nh\u1EADp \u0111\u1EC3 s\u1EED d\u1EE5ng ch\u1EBF \u0111\u1ED9 \u0111\u1ED3ng b\u1ED9 API",
      );
    }
    if (!window.ApiStorage) {
      throw new Error(
        "Module ApiStorage ch\u01B0a \u0111\u01B0\u1EE3c t\u1EA3i",
      );
    }
    this.mode = "api";
    this.storage = new ApiStorage();
    this.notify("mode_changed", { mode: "api" });
    this._pendingMigrationCheck = false;
    this._migrationChecked = {};
    try {
      const wfResult = await this._syncPendingWorkflows();
      const taskResult = await this._syncPendingTasks();
      if (wfResult.synced > 0 || taskResult.synced > 0) {
        console.log(
          "[StorageManager] Synced",
          wfResult.synced,
          "workflows and",
          taskResult.synced,
          "tasks before clearing local",
        );
      }
    } catch (e) {
      console.warn(
        "[StorageManager] Pending sync failed (will retry later):",
        e.message,
      );
    }
    try {
      const local = new LocalStorage();
      await local.clearTasks();
      await local.clearWorkflows();
      console.log(
        "[StorageManager] Privacy: cleared local tasks + workflows after switchToApi",
      );
    } catch (e) {
      console.warn(
        "[StorageManager] Clear local cache failed (non-fatal):",
        e.message,
      );
    }
    return { success: true, mode: "api" };
  }
  switchToLocal() {
    this.mode = "local";
    this.storage = new LocalStorage();
    this._pendingMigrationCheck = false;
    this.notify("mode_changed", { mode: "local" });
    return { success: true, mode: "local" };
  }
  async checkAndPromptMigration(dataType) {
    return;
    if (!this._pendingMigrationCheck || this.mode !== "api") return;
    if (this._migrationChecked?.[dataType]) return;
    if (this._migrationInProgress) return;
    this._migrationInProgress = true;
    this._migrationChecked = this._migrationChecked || {};
    this._migrationChecked[dataType] = true;
    const localStorage = new LocalStorage();
    const apiStorage = this.storage;
    try {
      if (dataType === "tasks") {
        const localResult = await localStorage.getTasks();
        const localTasks = localResult.data || [];
        if (localTasks.length === 0) return;
        const serverResult = await apiStorage.getTasks();
        const serverTasks = serverResult.data || [];
        if (serverTasks.length > 0) {
          console.log(
            "[StorageManager] Server has tasks, clearing local cache",
          );
          await localStorage.clearTasks();
          return;
        }
        const confirmed = await this._askMigration("tasks", localTasks.length);
        if (confirmed) {
          for (const task of localTasks) {
            try {
              await apiStorage.saveTask(task);
            } catch (e) {
              console.warn(
                "[StorageManager] Migrate task failed:",
                task.task_id,
                e.message,
              );
            }
          }
          console.log(
            "[StorageManager] Migrated",
            localTasks.length,
            "tasks to server",
          );
          this.notify("task_saved", {});
        }
        await localStorage.clearTasks();
      } else if (dataType === "workflows") {
        const localResult = await localStorage.getWorkflows();
        const localWorkflows = localResult.data || [];
        if (localWorkflows.length === 0) return;
        const serverResult = await apiStorage.getWorkflows();
        const serverWorkflows = serverResult.data || [];
        if (serverWorkflows.length > 0) {
          console.log(
            "[StorageManager] Server has workflows, clearing local cache",
          );
          await localStorage.clearWorkflows();
          return;
        }
        const confirmed = await this._askMigration(
          "workflows",
          localWorkflows.length,
        );
        if (confirmed) {
          for (const wf of localWorkflows) {
            try {
              const fullWf = await localStorage.getWorkflow(wf.wf_id);
              await apiStorage.saveWorkflowFull(
                fullWf,
                fullWf.nodes || [],
                fullWf.edges || [],
              );
            } catch (e) {
              console.warn(
                "[StorageManager] Migrate workflow failed:",
                wf.wf_id,
                e.message,
              );
            }
          }
          console.log(
            "[StorageManager] Migrated",
            localWorkflows.length,
            "workflows to server",
          );
          this.notify("workflow_full_saved", {});
        }
        await localStorage.clearWorkflows();
      }
    } catch (e) {
      console.error("[StorageManager] Migration check error:", e);
    } finally {
      this._migrationInProgress = false;
    }
  }
  async _askMigration(type, count) {
    const typeLabel = type === "tasks" ? "Task" : "Workflow";
    const dialog = window.customDialog || window.CustomDialog;
    if (!dialog) return false;
    return dialog.confirm(
      `Ph\xE1t hi\u1EC7n ${count} ${typeLabel} trong b\u1ED9 nh\u1EDB c\u1EE5c b\u1ED9 ch\u01B0a \u0111\u01B0\u1EE3c \u0111\u1ED3ng b\u1ED9 l\xEAn server. B\u1EA1n c\xF3 mu\u1ED1n \u0111\u1ED3ng b\u1ED9 kh\xF4ng?`,
      {
        title: "Sync data",
        type: "info",
        confirmText: "Sync",
        cancelText: "Skip",
      },
    );
  }
  async _ensureInit() {
    if (this._ready) return;
    if (this._initPromise) return this._initPromise;
    this._initPromise = this.init();
    await this._initPromise;
    this._ready = true;
    this._initPromise = null;
  }
  async getTasks(options = {}) {
    await this._ensureInit();
    return this.storage.getTasks(options);
  }
  async getTask(taskId) {
    await this._ensureInit();
    return this.storage.getTask(taskId);
  }
  async saveTask(task) {
    await this._ensureInit();
    if (this.mode === "local") {
      throw new Error("REQUIRES_LOGIN");
    }
    let result;
    try {
      result = await this.storage.saveTask(task);
    } catch (err) {
      console.log("[StorageManager] saveTask error:", {
        code: err.code,
        message: err.message,
        httpStatus: err.httpStatus,
      });
      const isQuotaError =
        err.code === "QUOTA_EXCEEDED" ||
        err.code === "FEATURE_DISABLED" ||
        err.httpStatus === 403 ||
        err.message?.includes("gi\u1EDBi h\u1EA1n") ||
        err.message?.includes("QUOTA");
      if (isQuotaError) {
        console.log("[StorageManager] Quota/feature error, re-throwing");
        throw err;
      }
      const isNetworkError =
        !err.httpStatus ||
        err.httpStatus >= 500 ||
        err.message?.includes("network") ||
        err.message?.includes("Failed to fetch") ||
        err.message?.includes("timeout") ||
        err._isConnectionError;
      if (isNetworkError && this.mode === "api") {
        console.warn(
          "[StorageManager] API saveTask failed (network), saving to local:",
          err.message,
        );
        const local = new LocalStorage();
        result = await local.saveTask(task);
        await this._trackPendingSyncTask(
          task.task_id,
          task.updated_at || Date.now(),
        );
        this._notifyLocalFallback(err.message);
      } else {
        throw err;
      }
    }
    this.notify("task_saved", result);
    return result;
  }
  async deleteTask(taskId) {
    await this._ensureInit();
    const result = await this.storage.deleteTask(taskId);
    await this._clearPendingSyncTask(taskId);
    this.notify("task_deleted", { taskId });
    return result;
  }
  async updateTaskStatus(taskId, status, fileIds, extra = null) {
    await this._ensureInit();
    const result = await this.storage.updateTaskStatus(
      taskId,
      status,
      fileIds,
      extra,
    );
    this.notify("task_status_updated", { taskId, status, fileIds });
    return result;
  }
  async resetTaskResults(taskOrId) {
    await this._ensureInit();
    const suppliedTask =
      taskOrId && typeof taskOrId === "object" ? taskOrId : null;
    const taskId = suppliedTask?.task_id || taskOrId;
    const storedTask = await this.storage.getTask(taskId);
    const task = suppliedTask
      ? { ...(storedTask || {}), ...suppliedTask }
      : storedTask;
    if (!task) throw new Error(`TASK_NOT_FOUND:${taskId}`);
    const cleared = {
      ...task,
      result_file_ids: "",
      result_flow_file_ids: [],
      result_thumbnails: {},
      result_file_names: {},
      result_provider_urls: {},
      error_message: null,
      executed_at: null,
    };
    const result = await this.saveTask(cleared);
    if (suppliedTask) Object.assign(suppliedTask, cleared);
    this.notify("task_results_reset", { taskId });
    return result || cleared;
  }
  async getWorkflows(options = {}) {
    await this._ensureInit();
    return this.storage.getWorkflows(options);
  }
  async getWorkflowDefinitionFresh(wfId) {
    await this._ensureInit();
    if (this.mode !== "api" || !this.storage.getWorkflowDefinitionFresh) {
      throw Object.assign(new Error("CONNECTION_ERROR"), {
        code: "CONNECTION_ERROR",
      });
    }
    return this.storage.getWorkflowDefinitionFresh(wfId);
  }
  async getWorkflow(wfId) {
    if (!this._inflightGetWorkflow) this._inflightGetWorkflow = new Map();
    const pending = this._inflightGetWorkflow.get(wfId);
    if (pending) return pending;
    const p = this._getWorkflowFresh(wfId).finally(() =>
      this._inflightGetWorkflow.delete(wfId),
    );
    this._inflightGetWorkflow.set(wfId, p);
    return p;
  }
  async _getWorkflowFresh(wfId) {
    await this._ensureInit();
    let result = null;
    let apiError = null;
    try {
      result = await this.storage.getWorkflow(wfId);
    } catch (err) {
      apiError = err;
      console.warn("[StorageManager] API getWorkflow error:", err.message);
    }
    if (!result && this.mode === "api") {
      console.warn(
        "[StorageManager] Fallback to local storage for workflow:",
        wfId,
      );
      const local = new LocalStorage();
      const localResult = await local.getWorkflow(wfId);
      if (localResult) {
        if (apiError?._isConnectionError) {
          console.warn(
            "[StorageManager] Using cached local data due to connection error",
          );
        }
        return localResult;
      }
      if (apiError?._isConnectionError) {
        const friendlyError = new Error(
          "Kh\xF4ng th\u1EC3 t\u1EA3i workflow do l\u1ED7i k\u1EBFt n\u1ED1i. Vui l\xF2ng ki\u1EC3m tra m\u1EA1ng v\xE0 th\u1EED l\u1EA1i.",
        );
        friendlyError.code = "CONNECTION_ERROR";
        throw friendlyError;
      }
      return null;
    }
    return result;
  }
  async saveWorkflow(workflow) {
    await this._ensureInit();
    if (this.mode === "local") {
      throw new Error("REQUIRES_LOGIN");
    }
    let result;
    try {
      result = await this.storage.saveWorkflow(workflow);
      await this._clearPendingSync(workflow.wf_id);
    } catch (err) {
      console.log("[StorageManager] saveWorkflow error:", {
        code: err.code,
        message: err.message,
        httpStatus: err.httpStatus,
      });
      const isQuotaError =
        err.code === "QUOTA_EXCEEDED" ||
        err.code === "FEATURE_DISABLED" ||
        err.httpStatus === 403 ||
        err.message?.includes("gi\u1EDBi h\u1EA1n") ||
        err.message?.includes("QUOTA");
      if (isQuotaError) {
        console.log("[StorageManager] Quota/feature error, re-throwing");
        throw err;
      }
      const isNetworkError =
        !err.httpStatus ||
        err.httpStatus >= 500 ||
        err.message?.includes("network") ||
        err.message?.includes("Failed to fetch") ||
        err.message?.includes("timeout") ||
        err._isConnectionError;
      if (isNetworkError && this.mode === "api") {
        console.warn(
          "[StorageManager] API saveWorkflow failed (network), saving to local:",
          err.message,
        );
        const local = new LocalStorage();
        result = await local.saveWorkflow(workflow);
        const statusOnly = Object.keys(workflow).every((key) =>
          ["wf_id", "status", "updated_at", "last_run_at"].includes(key),
        );
        const terminalStatus =
          statusOnly &&
          ["paused", "completed", "error"].includes(workflow.status)
            ? workflow.status
            : null;
        await this._trackPendingSync(
          workflow.wf_id,
          workflow.updated_at || Date.now(),
          terminalStatus,
          statusOnly,
        );
        this._notifyLocalFallback(err.message);
      } else {
        throw err;
      }
    }
    this.notify("workflow_saved", result);
    return result;
  }
  async deleteWorkflow(wfId) {
    await this._ensureInit();
    const result = await this.storage.deleteWorkflow(wfId);
    if (result === false) return false;
    await this._clearDeletedWorkflowCache(wfId);
    this.notify("workflow_deleted", { wfId });
    try {
      await chrome.runtime.sendMessage({ action: "workflowDeleted", wfId });
    } catch (_) {}
    return result;
  }
  async _clearDeletedWorkflowCache(wfId) {
    const cleanup = async () => {
      const data = await chrome.storage.local.get([
        "af_running_workflow",
        "_pendingWorkflow",
        _StorageManager.PENDING_SYNC_KEY,
      ]);
      const remove = [`af_workflow_buffer_${wfId}`];
      if (data.af_running_workflow?.wf_id === wfId)
        remove.push("af_running_workflow");
      if (data._pendingWorkflow?.workflow?.wf_id === wfId)
        remove.push("_pendingWorkflow");
      const pending = data[_StorageManager.PENDING_SYNC_KEY];
      if (Array.isArray(pending?.workflows)) {
        await chrome.storage.local.set({
          [_StorageManager.PENDING_SYNC_KEY]: {
            ...pending,
            workflows: pending.workflows.filter((w) => w.wf_id !== wfId),
          },
        });
      }
      await chrome.storage.local.remove(remove);
      if (
        typeof LocalStorage !== "undefined" &&
        !(this.storage instanceof LocalStorage)
      ) {
        await new LocalStorage().deleteWorkflow(wfId);
      }
      await window.PendingUploadStore?.deletePasteBlobsForWorkflow?.(wfId);
      window.RequestCoalescer?.invalidate?.("workflows");
      const executor = window.workflowExecutor;
      if (executor?._runningOtherWfId === wfId && !executor._heartbeatTimer) {
        executor.isRunning = false;
        executor._runningOtherWfId = null;
        executor.currentWorkflow = null;
      }
      console.log(
        "[WorkflowCache] Deleted workflow cache cleared:",
        wfId,
        remove,
      );
    };
    if (globalThis.navigator?.locks?.request) {
      await navigator.locks.request("af_running_workflow_claim", cleanup);
    } else await cleanup();
  }
  async getNodes(wfId) {
    await this._ensureInit();
    return this.storage.getNodes(wfId);
  }
  async saveNode(wfId, node) {
    await this._ensureInit();
    const result = await this.storage.saveNode(wfId, node);
    this.notify("node_saved", { wfId, node: result });
    return result;
  }
  async deleteNode(wfId, nodeId) {
    await this._ensureInit();
    const result = await this.storage.deleteNode(wfId, nodeId);
    this.notify("node_deleted", { wfId, nodeId });
    return result;
  }
  async updateNodeStatus(wfId, nodeId, data) {
    await this._ensureInit();
    const result = await this.storage.updateNodeStatus(wfId, nodeId, data);
    this.notify("node_status_updated", { wfId, nodeId, data });
    return result;
  }
  async getEdges(wfId) {
    await this._ensureInit();
    return this.storage.getEdges(wfId);
  }
  async saveEdge(wfId, edge) {
    await this._ensureInit();
    const result = await this.storage.saveEdge(wfId, edge);
    this.notify("edge_saved", { wfId, edge: result });
    return result;
  }
  async deleteEdge(wfId, edgeId) {
    await this._ensureInit();
    const result = await this.storage.deleteEdge(wfId, edgeId);
    this.notify("edge_deleted", { wfId, edgeId });
    return result;
  }
  async saveWorkflowFull(workflow, nodes, edges) {
    await this._ensureInit();
    if (this.mode === "local") {
      throw new Error("REQUIRES_LOGIN");
    }
    const sanitizedNodes = (nodes || []).map((n) => ({
      ...n,
      node_name: n.node_name || n.label || n.node_type || "Node",
    }));
    let result;
    try {
      result = await this.storage.saveWorkflowFull(
        workflow,
        sanitizedNodes,
        edges,
      );
      const pending = (await this._getPendingSyncData()).workflows.find(
        (w) => w.wf_id === workflow.wf_id,
      );
      if (pending?.terminal_status) {
        await this._markPendingWorkflowFullSynced(pending.wf_id);
        await this._syncPendingWorkflowStatus(pending);
      } else {
        await this._clearPendingSync(workflow.wf_id);
      }
    } catch (err) {
      console.log("[StorageManager] saveWorkflowFull error:", {
        code: err.code,
        message: err.message,
        httpStatus: err.httpStatus,
      });
      const isQuotaError =
        err.code === "QUOTA_EXCEEDED" ||
        err.httpStatus === 403 ||
        err.message?.includes("gi\u1EDBi h\u1EA1n") ||
        err.message?.includes("QUOTA");
      if (isQuotaError) {
        console.log("[StorageManager] Quota error detected, re-throwing");
        throw err;
      }
      const isNetworkError =
        err.code === "NETWORK_ERROR" ||
        err.message?.includes("network") ||
        err.message?.includes("Failed to fetch") ||
        err.message?.includes("timeout") ||
        err._isConnectionError;
      if (isNetworkError && this.mode === "api") {
        console.warn(
          "[StorageManager] API saveWorkflowFull failed (network), saving to local:",
          err.message,
        );
        const local = new LocalStorage();
        result = await local.saveWorkflowFull(workflow, nodes, edges);
        await this._trackPendingSync(
          workflow.wf_id,
          workflow.updated_at || Date.now(),
        );
        this._notifyLocalFallback(err.message);
      } else {
        throw err;
      }
    }
    this.notify("workflow_full_saved", result);
    return result;
  }
  async resetWorkflow(wfId) {
    await this._ensureInit();
    const result = await this.storage.resetWorkflow(wfId);
    this.notify("workflow_reset", { wfId });
    return result;
  }
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }
  notify(event, data) {
    this.listeners.forEach((cb) => cb(event, data));
    if (window.eventBus) {
      window.eventBus.emit(`storage:${event}`, data);
    }
  }
  _notifyLocalFallback(errorMsg) {
    console.warn("[StorageManager] Local fallback notification:", errorMsg);
    const t = (key) => window.I18n?.t?.(key) || window.t?.(key) || null;
    const dialog = window.customDialog || window.CustomDialog;
    if (dialog) {
      dialog.alert(
        t("storage.savedLocallyWarning") ||
          "Saved to local storage due to a server connection error. Data will sync once reconnected.",
        { title: t("common.warning") || "Warning", type: "warning" },
      );
    }
    if (window.eventBus) {
      window.eventBus.emit("storage:local_fallback", { errorMsg });
    }
  }
  async _trackPendingSync(
    wfId,
    updatedAt,
    terminalStatus = null,
    statusOnly = false,
  ) {
    try {
      const userId =
        window.authManager?.getUserId?.() ||
        window.authManager?.user?.id ||
        "unknown";
      const data = await this._getPendingSyncData();
      const existingIdx = data.workflows.findIndex((w) => w.wf_id === wfId);
      const item = {
        wf_id: wfId,
        updated_at: updatedAt,
        user_id: userId,
        created_at: Date.now(),
        terminal_status: terminalStatus,
        needs_full_sync: !statusOnly || !terminalStatus,
      };
      if (existingIdx >= 0) {
        if (updatedAt > data.workflows[existingIdx].updated_at) {
          item.needs_full_sync ||
            (item.needs_full_sync =
              data.workflows[existingIdx].needs_full_sync !== false);
          if (!statusOnly || terminalStatus) {
            item.terminal_status ||
              (item.terminal_status =
                data.workflows[existingIdx].terminal_status || null);
          }
          data.workflows[existingIdx] = item;
        } else if (terminalStatus) {
          data.workflows[existingIdx].terminal_status = terminalStatus;
        } else if (statusOnly) {
          data.workflows[existingIdx].terminal_status = null;
        } else {
          data.workflows[existingIdx].needs_full_sync = true;
        }
      } else {
        data.workflows.push(item);
      }
      await chrome.storage.local.set({
        [_StorageManager.PENDING_SYNC_KEY]: data,
      });
      console.log("[StorageManager] Tracked pending sync for workflow:", wfId);
      if (window.eventBus) {
        window.eventBus.emit("storage:pending_sync_changed", {
          count: data.workflows.length,
        });
      }
    } catch (e) {
      console.error(
        "[StorageManager] Failed to track pending sync:",
        e.message,
      );
    }
  }
  async _markPendingWorkflowFullSynced(wfId) {
    const data = await this._getPendingSyncData();
    const pending = data.workflows.find((w) => w.wf_id === wfId);
    if (!pending) return;
    pending.needs_full_sync = false;
    await chrome.storage.local.set({
      [_StorageManager.PENDING_SYNC_KEY]: data,
    });
  }
  async _syncPendingWorkflowStatus(pending) {
    if (!pending?.terminal_status || !pending.wf_id) return false;
    const userId =
      window.authManager?.getUserId?.() ||
      window.authManager?.user?.id ||
      "unknown";
    if (pending.user_id !== userId && pending.user_id !== "unknown")
      return false;
    try {
      const current = (await this._getPendingSyncData()).workflows.find(
        (w) => w.wf_id === pending.wf_id,
      );
      if (
        !current ||
        current.terminal_status !== pending.terminal_status ||
        current.created_at !== pending.created_at
      )
        return false;
      const active = (await chrome.storage.local.get("af_running_workflow"))
        .af_running_workflow;
      if (active?.wf_id === pending.wf_id) return false;
      await this.storage.saveWorkflow({
        wf_id: pending.wf_id,
        status: pending.terminal_status,
      });
      await this._clearPendingSync(pending.wf_id);
      console.info(
        "[StorageManager] Synced pending workflow terminal status:",
        pending.wf_id,
        pending.terminal_status,
      );
      return true;
    } catch (error) {
      console.warn(
        "[StorageManager] Pending workflow terminal status sync deferred:",
        pending.wf_id,
        error?.message,
      );
      return false;
    }
  }
  async _getPendingSyncData() {
    return new Promise((resolve) => {
      chrome.storage.local.get([_StorageManager.PENDING_SYNC_KEY], (result) => {
        const data = result[_StorageManager.PENDING_SYNC_KEY] || {};
        resolve({ workflows: data.workflows || [], tasks: data.tasks || [] });
      });
    });
  }
  async _clearPendingSync(wfId) {
    try {
      const data = await this._getPendingSyncData();
      data.workflows = data.workflows.filter((w) => w.wf_id !== wfId);
      await chrome.storage.local.set({
        [_StorageManager.PENDING_SYNC_KEY]: data,
      });
      console.log("[StorageManager] Cleared pending sync for workflow:", wfId);
      this._emitPendingSyncChanged(data);
    } catch (e) {
      console.error(
        "[StorageManager] Failed to clear pending sync:",
        e.message,
      );
    }
  }
  async _trackPendingSyncTask(taskId, updatedAt) {
    try {
      const userId =
        window.authManager?.getUserId?.() ||
        window.authManager?.user?.id ||
        "unknown";
      const data = await this._getPendingSyncData();
      const existingIdx = data.tasks.findIndex((t) => t.task_id === taskId);
      const item = {
        task_id: taskId,
        updated_at: updatedAt,
        user_id: userId,
        created_at: Date.now(),
      };
      if (existingIdx >= 0) {
        if (updatedAt > data.tasks[existingIdx].updated_at) {
          data.tasks[existingIdx] = item;
        }
      } else {
        data.tasks.push(item);
      }
      await chrome.storage.local.set({
        [_StorageManager.PENDING_SYNC_KEY]: data,
      });
      console.log("[StorageManager] Tracked pending sync for task:", taskId);
      this._emitPendingSyncChanged(data);
    } catch (e) {
      console.error(
        "[StorageManager] Failed to track pending sync for task:",
        e.message,
      );
    }
  }
  async _clearPendingSyncTask(taskId) {
    try {
      const data = await this._getPendingSyncData();
      data.tasks = data.tasks.filter((t) => t.task_id !== taskId);
      await chrome.storage.local.set({
        [_StorageManager.PENDING_SYNC_KEY]: data,
      });
      console.log("[StorageManager] Cleared pending sync for task:", taskId);
      this._emitPendingSyncChanged(data);
    } catch (e) {
      console.error(
        "[StorageManager] Failed to clear pending sync for task:",
        e.message,
      );
    }
  }
  _emitPendingSyncChanged(data) {
    if (window.eventBus) {
      window.eventBus.emit("storage:pending_sync_changed", {
        workflowCount: data.workflows.length,
        taskCount: data.tasks.length,
        count: data.workflows.length + data.tasks.length,
      });
    }
  }
  async getPendingSyncCount() {
    const data = await this._getPendingSyncData();
    return {
      workflows: data.workflows.length,
      tasks: data.tasks.length,
      total: data.workflows.length + data.tasks.length,
    };
  }
  async syncPendingNow() {
    if (this.mode !== "api") {
      console.warn("[StorageManager] Cannot sync: not in API mode");
      return { synced: 0, failed: 0, skipped: 0, error: "NOT_API_MODE" };
    }
    const workflowResult = await this._syncPendingWorkflows();
    const taskResult = await this._syncPendingTasks();
    return {
      synced: workflowResult.synced + taskResult.synced,
      failed: workflowResult.failed + taskResult.failed,
      skipped: workflowResult.skipped + taskResult.skipped,
    };
  }
  async _syncPendingTasks() {
    const result = { synced: 0, failed: 0, skipped: 0 };
    try {
      if (this.mode !== "api" || !this.storage) {
        return result;
      }
      const currentUserId =
        window.authManager?.getUserId?.() || window.authManager?.user?.id;
      if (!currentUserId) {
        return result;
      }
      const data = await this._getPendingSyncData();
      const pendingTasks = data.tasks.filter(
        (t) => t.user_id === currentUserId || t.user_id === "unknown",
      );
      if (pendingTasks.length === 0) {
        return result;
      }
      console.log(
        "[StorageManager] Syncing",
        pendingTasks.length,
        "pending tasks",
      );
      const local = new LocalStorage();
      for (const pending of pendingTasks) {
        try {
          const localTask = await local.getTask(pending.task_id);
          if (!localTask) {
            await this._clearPendingSyncTask(pending.task_id);
            result.skipped++;
            continue;
          }
          await this.storage.saveTask(localTask);
          console.log("[StorageManager] Synced task:", pending.task_id);
          await this._clearPendingSyncTask(pending.task_id);
          await local.deleteTask(pending.task_id);
          result.synced++;
        } catch (err) {
          console.error(
            "[StorageManager] Failed to sync task:",
            pending.task_id,
            err.message,
          );
          if (err.code === "QUOTA_EXCEEDED" || err.httpStatus === 403) {
            await this._clearPendingSyncTask(pending.task_id);
            await local.deleteTask(pending.task_id);
            result.skipped++;
          } else {
            result.failed++;
          }
        }
      }
      console.log("[StorageManager] Task sync complete:", result);
    } catch (e) {
      console.error("[StorageManager] Task sync error:", e.message);
    }
    return result;
  }
  async _syncPendingWorkflows() {
    if (this._syncInProgress) {
      console.log("[StorageManager] Sync already in progress, skipping");
      return { synced: 0, failed: 0, skipped: 0 };
    }
    this._syncInProgress = true;
    const result = { synced: 0, failed: 0, skipped: 0 };
    try {
      if (this.mode !== "api" || !this.storage) {
        console.log("[StorageManager] Not in API mode, skipping sync");
        return result;
      }
      const currentUserId =
        window.authManager?.getUserId?.() || window.authManager?.user?.id;
      if (!currentUserId) {
        console.log("[StorageManager] No current user, skipping sync");
        return result;
      }
      const pendingData = await this._getPendingSyncData();
      const pendingWorkflows = pendingData.workflows || [];
      if (pendingWorkflows.length === 0) {
        return result;
      }
      console.log(
        "[StorageManager] Found",
        pendingWorkflows.length,
        "pending workflows to sync",
      );
      const local = new LocalStorage();
      for (const pending of pendingWorkflows) {
        if (
          pending.user_id !== currentUserId &&
          pending.user_id !== "unknown"
        ) {
          console.log(
            "[StorageManager] Skipping pending sync for different user:",
            pending.wf_id,
          );
          result.skipped++;
          await this._clearPendingSync(pending.wf_id);
          continue;
        }
        if (pending.terminal_status && pending.needs_full_sync === false) {
          if (await this._syncPendingWorkflowStatus(pending)) result.synced++;
          else result.failed++;
          continue;
        }
        try {
          const localWorkflow = await local.getWorkflow(pending.wf_id);
          if (!localWorkflow) {
            console.warn(
              "[StorageManager] Pending workflow not found in local:",
              pending.wf_id,
            );
            await this._clearPendingSync(pending.wf_id);
            result.skipped++;
            continue;
          }
          let serverWorkflow = null;
          try {
            serverWorkflow = await this.storage.getWorkflow(pending.wf_id);
          } catch (e) {
            if (e._isConnectionError) {
              console.warn(
                "[StorageManager] Connection error during sync, will retry later",
              );
              result.failed++;
              continue;
            }
          }
          const localUpdatedAt =
            localWorkflow.updated_at || pending.updated_at || 0;
          const serverUpdatedAt = serverWorkflow?.updated_at || 0;
          if (serverWorkflow && serverUpdatedAt >= localUpdatedAt) {
            console.log(
              "[StorageManager] Server has newer version, skipping:",
              pending.wf_id,
              "server:",
              serverUpdatedAt,
              "local:",
              localUpdatedAt,
            );
            if (pending.terminal_status) {
              await this._markPendingWorkflowFullSynced(pending.wf_id);
              if (await this._syncPendingWorkflowStatus(pending))
                result.synced++;
              else result.failed++;
            } else {
              await this._clearPendingSync(pending.wf_id);
              result.skipped++;
            }
            continue;
          }
          console.log(
            "[StorageManager] Syncing workflow to server:",
            pending.wf_id,
            "local:",
            localUpdatedAt,
            "server:",
            serverUpdatedAt || "N/A",
          );
          const nodes = localWorkflow.nodes || [];
          const edges = localWorkflow.edges || [];
          if (nodes.length === 0 && serverWorkflow?.nodes?.length > 0) {
            console.warn(
              "[StorageManager] Local workflow has 0 nodes but server has",
              serverWorkflow.nodes.length,
              "- skipping to prevent data loss",
            );
            await this._clearPendingSync(pending.wf_id);
            result.skipped++;
            continue;
          }
          await this.storage.saveWorkflowFull(localWorkflow, nodes, edges);
          if (pending.terminal_status) {
            await this._markPendingWorkflowFullSynced(pending.wf_id);
            if (!(await this._syncPendingWorkflowStatus(pending))) {
              result.failed++;
              continue;
            }
          }
          if (!pending.terminal_status)
            await this._clearPendingSync(pending.wf_id);
          result.synced++;
          console.log(
            "[StorageManager] Successfully synced workflow:",
            pending.wf_id,
          );
        } catch (e) {
          console.error(
            "[StorageManager] Failed to sync workflow:",
            pending.wf_id,
            e.message,
          );
          result.failed++;
        }
      }
      if (result.synced > 0) {
        this.notify("pending_sync_completed", result);
        if (window.eventBus) {
          window.eventBus.emit("storage:pending_sync_completed", result);
        }
      }
      console.log("[StorageManager] Sync completed:", result);
      return result;
    } finally {
      this._syncInProgress = false;
    }
  }
  getMode() {
    return this.mode;
  }
};
__publicField(_StorageManager, "PENDING_SYNC_KEY", "af_pending_sync");
let StorageManager = _StorageManager;
window.storageManager = new StorageManager();
