(function () {
  "use strict";
  class WorkflowSingleNodeSession {
    constructor(owner, workflowId) {
      this.owner = owner;
      this.workflowId = workflowId;
      this.runId = null;
      this.records = new Map();
      this.ready = false;
      this.closed = false;
      this.stopping = false;
      this.browserRecord = null;
      this.previewRequests = new Map();
      this._waiters = new Set();
      this.done = new Promise((resolve) => {
        this._resolveDone = resolve;
      });
    }
    accepts(workflowId) {
      return (
        !this.closed &&
        !this.stopping &&
        String(workflowId) === String(this.workflowId)
      );
    }
    enqueue(nodeId, options = {}) {
      if (!this.accepts(this.workflowId))
        throw this._error("SINGLE_NODE_SESSION_STOPPING");
      nodeId = String(nodeId);
      if (this.records.has(nodeId)) throw this._error("NODE_ALREADY_RUNNING");
      const record = {
        nodeId,
        options,
        status: "queued",
        worker: null,
        overlapReady: false,
        api: false,
        web: false,
        createdAt: Date.now(),
        id: `single-node:${crypto.randomUUID()}`,
      };
      record.promise = new Promise((resolve, reject) => {
        record.resolve = resolve;
        record.reject = reject;
      });
      this.records.set(nodeId, record);
      this._changed(record);
      this._pump();
      return record.promise;
    }
    setReady(workflow) {
      this.workflow = workflow;
      this.ready = true;
      this._pump();
      this._finishIfEmpty();
    }
    _error(code) {
      return Object.assign(new Error(code), { code, noRetry: true });
    }
    static noticeKey(code) {
      const keys = {
        NODE_NOT_FOUND: "nodeNotFoundAfterSave",
        NODE_ALREADY_RUNNING: "singleNodeDuplicate",
        PREPARATION_BUSY: "singleNodePreparing",
        UNSAVED_CHANGES: "singleNodeUnsaved",
        SAVE_FAILED: "singleNodeSaveFailed",
        SINGLE_NODE_SESSION_STOPPING: "singleNodeStopping",
        WORKFLOW_EXECUTION_STILL_STOPPING: "singleNodeStopping",
        WORKFLOW_EXECUTION_BUSY: "singleNodeOtherRun",
        CROSS_CONTEXT_RUNNING: "singleNodeOtherRun",
        BUSY: "singleNodeOtherRun",
        SINGLE_NODE_OWNER_UNAVAILABLE: "singleNodeOwnerUnavailable",
        SINGLE_NODE_SESSION_NOT_FOUND: "singleNodeOwnerUnavailable",
        BROWSER_STOP_UNCONFIRMED: "singleNodeStopUnconfirmed",
        BROWSER_BUSY: "singleNodeWaitBrowser",
        FLOW_WEB_BUSY: "singleNodeWaitFlowWeb",
        FLOW_API_PREPARING: "singleNodeWaitApiDispatch",
        GENERATION_QUEUE: "singleNodeQueued",
        PREPARING_NODE: "singleNodePreparing",
      };
      return `workflow.${keys[code] || "singleNodeBlocked"}`;
    }
    waitingFor(record) {
      if (record.status === "running")
        return {
          waitReason: record.flow ? "GENERATION_QUEUE" : "PREPARING_NODE",
        };
      if (this.browserRecord) {
        const node = this.browserRecord.node;
        const provider =
          node?.node_type === "prompt" ? node.provider : node?.node_type;
        return {
          waitReason: "BROWSER_BUSY",
          waitProvider: provider === "generate" ? "flow" : provider,
        };
      }
      const flows = [...this.records.values()].filter(
        (r) => r.flow && ["running", "stopping"].includes(r.status),
      );
      if (flows.some((r) => !r.api || r.web))
        return { waitReason: "FLOW_WEB_BUSY" };
      if (flows.some((r) => !r.overlapReady))
        return { waitReason: "FLOW_API_PREPARING" };
      return { waitReason: "GENERATION_QUEUE" };
    }
    _pump() {
      if (!this.ready || this.closed || this.stopping) return;
      for (const record of this.records.values()) {
        if (record.status !== "queued") continue;
        const node = this.workflow.nodes?.find(
          (n) => String(n.node_id) === record.nodeId,
        );
        if (!node) {
          this._settle(record, null, this._error("NODE_NOT_FOUND"));
          continue;
        }
        record.node = node;
        const pipeline = window.PromptQueue?.isEnabled?.() === true;
        record.flow = node.node_type === "generate";
        record.api =
          record.flow &&
          pipeline &&
          record.options.manualSubmitMode !== true &&
          window.FlowApiAdapter?.isApiModeIntended?.({ forWorkflow: true }) ===
            true;
        const active = [...this.records.values()].filter(
          (r) => r.status === "running" || r.status === "stopping",
        );
        if (record.flow) {
          if (this.browserRecord) continue;
        } else {
          if (this.browserStopError) {
            const error = this._error("BROWSER_STOP_UNCONFIRMED");
            error.cause = this.browserStopError;
            this._settle(record, null, error);
            continue;
          }
          if (
            this.browserRecord ||
            active.some((r) => !r.flow || !r.api || r.web || !r.overlapReady)
          )
            continue;
        }
        record.status = "running";
        if (!record.flow) this.browserRecord = record;
        let worker;
        try {
          worker = this.owner._createSingleNodeWorker(this, record);
        } catch (error) {
          this._settle(record, null, error);
          continue;
        }
        record.worker = worker;
        this._changed(record);
        Promise.resolve()
          .then(() =>
            worker._executeSingleNodeOwned(
              this.workflowId,
              record.nodeId,
              record.options,
            ),
          )
          .then(
            (result) => this._settle(record, result),
            (error) => this._settle(record, null, error),
          );
      }
      this._finishIfEmpty();
    }
    admitted(nodeId) {
      const record = this.records.get(String(nodeId));
      if (!record) return;
      record.api = true;
      record.overlapReady = true;
      this._pump();
    }
    async enterApiPreparation(nodeId, cancelled) {
      const record = this.records.get(String(nodeId));
      if (!record) return;
      record.overlapReady = false;
      this._changed();
      while (this.browserRecord) {
        if (this.stopping || cancelled?.() || record.status === "stopping")
          throw this._error("ABORTED");
        await this._waitForChange();
      }
      if (this.stopping || cancelled?.() || record.status === "stopping")
        throw this._error("ABORTED");
    }
    async enterFlowWeb(nodeId, cancelled) {
      const record = this.records.get(String(nodeId));
      if (!record) return;
      record.web = true;
      record.api = false;
      this._changed();
      while (this.browserRecord) {
        if (this.stopping || cancelled?.() || record.status === "stopping")
          throw this._error("ABORTED");
        await this._waitForChange();
      }
      if (this.stopping || cancelled?.() || record.status === "stopping")
        throw this._error("ABORTED");
    }
    _waitForChange() {
      return new Promise((resolve) => {
        this._waiters.add(resolve);
      });
    }
    _changed(record = null) {
      for (const resolve of this._waiters) resolve();
      this._waiters.clear();
      const node =
        record?.node ||
        this.workflow?.nodes?.find((n) => String(n.node_id) === record?.nodeId);
      if (record?.status === "queued")
        window.eventBus?.emit("node:queued", {
          workflowId: this.workflowId,
          node: node || { node_id: record.nodeId },
          nodeId: record.nodeId,
        });
      try {
        this.owner._publishSingleNodeState?.(this);
      } catch (error) {
        console.warn(
          "[WorkflowSingleNode] tracker publication failed:",
          error.message,
        );
      }
    }
    _settle(record, result, error = null) {
      if (!this.records.has(record.nodeId)) return;
      const stopped = record.status === "stopping" || result?.stopped === true;
      if (record.liveNode) {
        const live = this.owner.currentWorkflow?.nodes?.find(
          (n) => String(n.node_id) === record.nodeId,
        );
        if (live) Object.assign(live, record.liveNode);
      }
      if (this.browserRecord === record) this.browserRecord = null;
      this.records.delete(record.nodeId);
      record.status = stopped ? "cancelled" : error ? "failed" : "completed";
      if (error && !stopped) {
        this.error || (this.error = error);
        if (!record.liveNode || error.preSubmitFailure)
          this.owner._publishSingleNodeRejected?.(
            record.nodeId,
            error,
            this.workflowId,
          );
        record.reject(error);
      } else record.resolve(stopped ? { stopped: true } : result);
      this._changed(record);
      this._pump();
      this._finishIfEmpty();
    }
    _finishIfEmpty() {
      if (!this.ready || this.records.size || this.closed) return;
      this.closed = true;
      this._changed();
      this._resolveDone();
    }
    fail(error) {
      this.closed = true;
      this.error || (this.error = error);
      for (const record of [...this.records.values()])
        this._settle(record, null, error);
      this._changed();
      this._resolveDone();
    }
    stopNode(nodeId, stopSource = "WORKFLOW_NODE_STOP") {
      const record = this.records.get(String(nodeId));
      if (!record) return false;
      if (record.status === "queued") {
        this.owner._publishQueuedNodeCancelled?.(
          record.node || { node_id: record.nodeId },
          this.workflowId,
        );
        this._settle(record, { stopped: true });
      } else if (record.status !== "stopping") {
        record.status = "stopping";
        this.owner._stopSingleNodeWorker(record, stopSource);
        this._changed(record);
      }
      return true;
    }
    stopJob(jobId, stopSource) {
      const job = window.PromptQueue?.getInstance?.()?.getJob?.(jobId);
      const record = [...this.records.values()].find(
        (r) =>
          r.id === jobId ||
          r.worker?._geminiTrackerJobs?.has(jobId) ||
          (job?.workflowRunId === this.owner._flowRunId &&
            String(job.workflowNodeId) === r.nodeId),
      );
      return record ? this.stopNode(record.nodeId, stopSource) : false;
    }
    stopAll(stopSource) {
      this.stopping = true;
      for (const record of [...this.records.values()])
        this.stopNode(record.nodeId, stopSource);
      this._changed();
      this._finishIfEmpty();
    }
    state() {
      return [...this.records.values()].map((r) => {
        const status =
          r.status === "running" && r.generationStarted !== true
            ? "queued"
            : r.status;
        return {
          nodeId: r.nodeId,
          jobId: r.id,
          status,
          provider:
            r.node?.node_type === "generate"
              ? "flow"
              : r.node?.node_type || null,
          ...(status === "queued" ? this.waitingFor(r) : {}),
        };
      });
    }
    trackerJobs() {
      const queue = window.PromptQueue?.getInstance?.();
      const liveFlowIds = new Set(
        (queue?.getJobsByOwner?.("workflow") || [])
          .filter(
            (j) =>
              j.workflowRunId === this.owner._flowRunId &&
              ["running", "paused", "pending", "queued", "preparing"].includes(
                j.state,
              ),
          )
          .map((j) => j.workflowNodeId),
      );
      return [...this.records.values()]
        .filter((r) => !liveFlowIds.has(r.nodeId))
        .map((r) => ({
          id: r.id,
          sessionId: this.owner._flowRunId,
          owner: "workflow",
          workflowId: this.workflowId,
          workflowNodeId: r.nodeId,
          label: r.node?.node_name || r.nodeId,
          provider: r.node?.node_type || "workflow",
          singleNodeSession: true,
          status: "running",
          totalExpected: 1,
          completedCount: 0,
          failedCount: 0,
          createdAt: r.createdAt,
          startedAt: r.createdAt,
          items: [
            {
              id: r.nodeId,
              promptIndex: 0,
              promptText: r.node?.prompt || "",
              state:
                r.status === "queued"
                  ? "PENDING"
                  : r.status === "stopping"
                    ? "CANCELLED"
                    : r.trackerState || "MONITORING",
            },
          ],
        }));
    }
  }
  window.WorkflowSingleNodeSession = WorkflowSingleNodeSession;
})();
