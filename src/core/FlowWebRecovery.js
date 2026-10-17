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
const _FlowWebRecovery = class _FlowWebRecovery {
  static snapshotRefIdentityMap(
    refThumbnails,
    refFileIds = [],
    refFileNames = {},
  ) {
    if (
      !refThumbnails ||
      typeof refThumbnails !== "object" ||
      Array.isArray(refThumbnails)
    )
      return {};
    const scalarKeys = [
      "media_uuid",
      "mediaUuid",
      "persistent_media_id",
      "persistentMediaId",
      "media_id",
      "mediaId",
      "file_name",
      "api_driver",
      "project_id",
      "type",
      "video_url",
      "videoUrl",
    ];
    const selected = new Set(
      (Array.isArray(refFileIds) ? refFileIds : []).filter(Boolean),
    );
    for (const id of [...selected])
      if (refFileNames?.[id]) selected.add(refFileNames[id]);
    const result = {};
    for (const [id, value] of Object.entries(refThumbnails)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const aliases = Array.isArray(value.identity_aliases)
        ? value.identity_aliases
        : [];
      const belongsToSelection =
        selected.has(id) ||
        scalarKeys.some((key) => selected.has(value[key])) ||
        aliases.some((alias) => selected.has(alias));
      if (selected.size > 0 && !belongsToSelection) continue;
      const identity = {};
      for (const key of scalarKeys) {
        if (typeof value[key] === "string" && value[key])
          identity[key] = value[key];
      }
      if (aliases.length) {
        const uniqueAliases = [
          ...new Set(
            aliases.filter((alias) => typeof alias === "string" && alias),
          ),
        ];
        if (uniqueAliases.length) identity.identity_aliases = uniqueAliases;
      }
      if (Object.keys(identity).length) result[id] = identity;
    }
    return result;
  }
  constructor(queue) {
    this.queue = queue;
    this.anonymousSessionId = crypto.randomUUID();
    this.records = new Map();
    this.retryItems = new Map();
    this.mediaOwners = new Map();
    this.pending = [];
    this.windowCount = 0;
    this.windowMembers = null;
    this.closed = false;
    this.writeTail = Promise.resolve();
    this.leaseReady = null;
    this.loaded = false;
    this.ready = this.restore()
      .then(() => {
        this.loaded = true;
        this.releaseIfIdle();
      })
      .catch((error) => {
        this.loaded = true;
        this.storageError = error;
        console.error("[FlowRecovery] journal unavailable");
      });
  }
  eligible(item) {
    return this.exclusionReason(item) === null;
  }
  exclusionReason(item) {
    if (item._phaseR) return null;
    const job = this.queue.getJob(item.jobId);
    if (!["prompts", "task", "workflow"].includes(job?.owner))
      return "unsupported_owner";
    if (job.chain) return "chain";
    if (item._flowDriverKey !== "flow_v2") return "not_flow_v2";
    if (item.settings?.manualSubmitMode) return "manual_submit";
    if (this.queue._editorExecutor._isFlowApiMode(item)) return "api_mode";
    return null;
  }
  async acquireLease() {
    if (this.leaseReady) return this.leaseReady;
    if (!globalThis.navigator?.locks) return true;
    this.leaseReady = new Promise((resolve, reject) => {
      navigator.locks
        .request("flow-web-recovery-owner", { ifAvailable: true }, (lock) => {
          if (!lock) {
            resolve(false);
            return;
          }
          return new Promise((release) => {
            this.releaseLease = release;
            resolve(true);
          });
        })
        .catch(reject);
    });
    const held = await this.leaseReady;
    if (!held) this.leaseReady = null;
    return held;
  }
  async restore() {
    if (!(await this.acquireLease())) {
      this.foreignOwner = true;
      return;
    }
    const stored = await chrome.storage.local.get([
      "flow_web_recovery_v1",
      "flow_web_recovery_meta_v1",
    ]);
    let changed = false;
    for (const record of stored.flow_web_recovery_v1 || []) {
      if (this.records.has(record.id)) continue;
      this.records.set(record.id, record);
      for (const output of record.outputs)
        if (output.mediaId) {
          this.mediaOwners.set(output.mediaId, `${record.id}:${output.index}`);
        }
      const pendingDownload =
        record.snapshot._autoDownload &&
        record.outputs.some(
          (output) =>
            output.mediaId &&
            !["downloaded", "failed", "skipped"].includes(
              output.downloadStatus,
            ),
        );
      if (record.stopped || (record.terminal && !pendingDownload)) continue;
      record.terminal = true;
      record.stopped = true;
      record.finishedAt = Date.now();
      this.retryItems.delete(record.id);
      record.interrupted = true;
      record.recoveryRequired = null;
      record.captchaHeld = false;
      record.activeRetry = false;
      for (const output of record.outputs) {
        if (!["completed", "failed"].includes(output.state))
          output.state = "interrupted";
        if (!["downloaded", "failed"].includes(output.downloadStatus))
          output.downloadStatus = "skipped";
      }
      changed = true;
      const accountMatches =
        record.snapshot.accountId != null &&
        String(record.snapshot.accountId) ===
          String(window.authManager?.user?.id);
      if (!accountMatches || typeof Job === "undefined") continue;
      let job = this.queue.getJob(record.jobId);
      if (!job) {
        job = new Job({
          owner: record.snapshot._owner,
          label: window.I18n?.t("flowRecovery.interrupted"),
        });
        job.id = record.jobId;
        job.state = "stopped";
        job.interrupted = true;
        job.projectId = record.projectId;
        this.queue._jobs.set(job.id, job);
      }
      if (job.items.some((item2) => item2.id === record.id)) continue;
      const item = new QueueItem({
        ...record.snapshot,
        id: record.id,
        jobId: record.jobId,
      });
      Object.assign(item, record.snapshot);
      item._phaseR = { originalId: record.id, slots: [], retry: false };
      item._phaseRRecord = record;
      item.noRetry = true;
      item.state = QueueItem.STATE.CANCELLED;
      item.error = "FLOW_RUN_INTERRUPTED";
      item.completedAt = Date.now();
      item.resultFileNames = {};
      for (const output of record.outputs)
        if (output.mediaId) {
          item.resultFileNames[output.mediaId] = output.mediaId;
          item.resultThumbnails[output.mediaId] = {
            ...(output.preview || {}),
            file_name: output.mediaId,
            media_uuid: output.mediaId,
            type: /video/i.test(record.snapshot.settings.genType)
              ? "video"
              : "image",
            phaseRDownloadName: output.filename,
            phaseROutputIndex: output.index,
          };
        }
      item.resultTileIds = record.outputs
        .filter((output) => output.mediaId)
        .map((output) => output.mediaId);
      item.outputs = record.outputs.map((output) => ({
        outputIndex: output.index,
        resultId: output.mediaId || null,
        mediaId: output.mediaId || null,
        operationId: output.operationId || null,
        status:
          output.state === "completed"
            ? "completed"
            : output.state === "failed"
              ? "failed"
              : "cancelled",
        downloadStatus: output.downloadStatus || "skipped",
      }));
      if (record.outputs.every((output) => output.state === "completed")) {
        item.state = QueueItem.STATE.COMPLETED;
        item.error = null;
        job.completedCount++;
      }
      job.items.push(item);
      job.totalExpected = job.items.length;
    }
    if (changed) {
      this.windowCount = 0;
      this.closed = false;
      this.windowMembers = null;
      await this.persist();
      console.log(
        "[FlowRecovery] previous run archived after ordinary restart",
      );
      this.queue._emitStateChanged();
    }
  }
  async handleTabReload(tabId, change = {}, tab = {}) {
    const planned = this.queue._plannedFlowRecoveryReload;
    const affected = [...this.records.values()].filter(
      (record) => !record.terminal && record.snapshot._flowTabId === tabId,
    );
    if (planned?.tabId === tabId || affected.length) {
      let route = null;
      try {
        const url = new URL(change.url || tab.pendingUrl || tab.url);
        route = {
          origin: url.origin,
          mediaViewer: /\/edit\//.test(url.pathname),
        };
      } catch (_) {}
      const diagnostic = {
        event: "tab_loading",
        tabId,
        planned: planned?.tabId === tabId,
        plannedTabId: planned?.tabId ?? null,
        reloadInProgress: !!this.queue._forceReloadPromise,
        tabStatus: change.status || tab.status || null,
        route,
        discarded: tab.discarded === true,
        affectedRecords: affected.length,
        jobs: [...new Set(affected.map((record) => record.jobId))].slice(0, 16),
        outputs: affected
          .slice(0, 16)
          .map((record) => ({
            itemId: record.id,
            states: (record.outputs || [])
              .slice(0, 16)
              .map((output) => output.state),
          })),
      };
      if (diagnostic.planned)
        console.info("[FlowReloadAudit]", JSON.stringify(diagnostic));
      else console.warn("[FlowReloadAudit]", JSON.stringify(diagnostic));
    }
    if (planned?.tabId === tabId) {
      return;
    }
    const jobs = new Set(affected.map((record) => record.jobId));
    await this.ready;
    for (const jobId of jobs) {
      const job = this.queue.getJob(jobId);
      if (job) {
        job.interrupted = true;
        job.label = window.I18n?.t("flowRecovery.interrupted") || job.label;
      }
      for (const record of this.records.values())
        if (record.jobId === jobId) {
          record.interrupted = true;
          record.recoveryRequired = null;
        }
      await this.queue.stopJobAndPersist(jobId, {
        pageReloaded: true,
        stopReason: "FLOW_PAGE_RELOADED",
      });
    }
  }
  persist() {
    const data = JSON.parse(JSON.stringify([...this.records.values()]));
    const meta = {
      windowCount: this.windowCount,
      closed: this.closed,
      members: this.windowMembers ? [...this.windowMembers] : null,
    };
    const next = this.writeTail
      .catch(() => {})
      .then(() =>
        chrome.storage.local.set({
          flow_web_recovery_v1: data,
          flow_web_recovery_meta_v1: meta,
        }),
      );
    this.writeTail = next;
    next.catch((error) => {
      this.storageError = error;
    });
    return next;
  }
  _downloadSettled(record) {
    return (
      record.stopped === true ||
      record.snapshot?._autoDownload !== true ||
      !(record.outputs || []).some(
        (output) =>
          output.mediaId &&
          !["downloaded", "failed", "skipped"].includes(output.downloadStatus),
      )
    );
  }
  async pruneSettled({ projectId = null, expiredOnly = false } = {}) {
    await this.ready;
    if (this.storageError) throw new Error("FLOW_RECOVERY_STORAGE_UNAVAILABLE");
    const hadLease = !!this.releaseLease || !globalThis.navigator?.locks;
    if (!(await this.acquireLease())) {
      console.warn(
        "[FlowRecoveryJournal] prune_skipped " +
          JSON.stringify({ reason: "other_window_owner" }),
      );
      return 0;
    }
    if (!hadLease) await this.restore();
    this.foreignOwner = false;
    const now = Date.now();
    const removed = [];
    for (const [id, record] of this.records) {
      if (projectId && record.projectId !== projectId) continue;
      if (!record.terminal || !this._downloadSettled(record)) continue;
      const job = this.queue.getJob(record.jobId);
      if (job && ["running", "paused"].includes(job.state)) continue;
      if (
        expiredOnly &&
        now - Number(record.finishedAt || now) <
          _FlowWebRecovery.TERMINAL_TTL_MS
      )
        continue;
      removed.push([id, record]);
      this.records.delete(id);
    }
    if (!removed.length) {
      this.releaseIfIdle();
      return 0;
    }
    try {
      await this.persist();
    } catch (error) {
      for (const [id, record] of removed) this.records.set(id, record);
      throw error;
    }
    for (const [id, record] of removed) {
      this.retryItems.delete(id);
      for (const output of record.outputs || []) {
        if (this.mediaOwners.get(output.mediaId)?.startsWith(`${id}:`))
          this.mediaOwners.delete(output.mediaId);
      }
    }
    this.releaseIfIdle();
    return removed.length;
  }
  async clearProject(projectId) {
    if (!projectId) throw new Error("PROJECT_CONTEXT_MISMATCH");
    await this.ready;
    await this.writeTail;
    const hadLease = !!this.releaseLease || !globalThis.navigator?.locks;
    if (!(await this.acquireLease()))
      throw new Error("FLOW_RECOVERY_OTHER_WINDOW_ACTIVE");
    if (!hadLease) await this.restore();
    this.foreignOwner = false;
    const projectRecords = [...this.records.values()].filter(
      (record) => record.projectId === projectId,
    );
    if (
      projectRecords.some(
        (record) => !record.terminal || !this._downloadSettled(record),
      )
    ) {
      throw new Error("PIPELINE_BUSY");
    }
    return this.pruneSettled({ projectId });
  }
  get blocked() {
    return (
      !!this.storageError ||
      [...this.records.values()].some(
        (record) => !record.terminal && record.recoveryRequired,
      )
    );
  }
  get unfinished() {
    return this.pending.length > 0 || this.blocked;
  }
  _isAmbiguousRecovery(reason) {
    return [
      "FLOW_RECOVERY_ACCEPTANCE_UNKNOWN",
      "FLOW_RECOVERY_RESULT_UNVERIFIED",
      "FLOW_RECOVERY_RETIRED_RESULT",
      "FLOW_RECOVERY_DUPLICATE_RESULT",
      "FLOW_RECOVERY_MEDIA_OWNER_CONFLICT",
    ].includes(reason);
  }
  async assertCanAdmit() {
    await this.ready;
    if (!this.blocked) return;
    const code = this.storageError
      ? "FLOW_RECOVERY_STORAGE_UNAVAILABLE"
      : "FLOW_RECOVERY_RESTORE_REQUIRED";
    console.warn(
      "[FlowRecovery] admission blocked " +
        JSON.stringify({
          reason: code,
          jobs: [
            ...new Set(
              [...this.records.values()]
                .filter((record) => !record.terminal && record.recoveryRequired)
                .map((record) => record.jobId),
            ),
          ],
        }),
    );
    this.queue._emitStateChanged();
    const error = new Error(window.I18n?.t("flowRecovery.required") || code);
    error.code = code;
    error.beforeQueueAdmission = true;
    throw error;
  }
  jobStatus(job) {
    if (job.interrupted)
      return {
        status: "stopped",
        interrupted: true,
        recoveryLabel: window.I18n?.t("flowRecovery.interrupted") || null,
      };
    if (!["running", "paused"].includes(job.state)) return {};
    if (this.storageError)
      return {
        status: "paused",
        recoveryRequired: "FLOW_RECOVERY_STORAGE_UNAVAILABLE",
        recoveryLabel: window.I18n?.t("flowRecovery.configBlocked") || null,
        recoveryHint: window.I18n?.t("flowRecovery.configHint") || null,
      };
    const record = [...this.records.values()].find(
      (entry) =>
        entry.jobId === job.id && !entry.terminal && entry.recoveryRequired,
    );
    if (!record) {
      const retrying =
        job.state === "running" &&
        job.items.some(
          (item) => this.displayState(item) === QueueItem.STATE.RETRY_SUBMIT,
        );
      return retrying
        ? { recoveryLabel: window.I18n?.t("flowRecovery.resubmitting") || null }
        : {};
    }
    const ambiguous = this._isAmbiguousRecovery(record.recoveryRequired);
    return {
      status: "paused",
      recoveryRequired: record.recoveryRequired,
      recoveryLabel: ambiguous
        ? window.I18n?.t("flowRecovery.unverifiedPrompt", {
            index: (record.snapshot.promptIndex || 0) + 1,
          }) || null
        : window.I18n?.t("flowRecovery.configBlocked") || null,
      recoveryHint: ambiguous
        ? window.I18n?.t("flowRecovery.unverifiedHint") || null
        : window.I18n?.t("flowRecovery.configHint") || null,
    };
  }
  releaseIfIdle() {
    if (
      [...this.records.values()].some(
        (record) =>
          !record.terminal ||
          (!record.stopped &&
            record.snapshot._autoDownload &&
            record.outputs.some(
              (output) =>
                output.mediaId &&
                !["downloaded", "failed", "skipped"].includes(
                  output.downloadStatus,
                ),
            )),
      ) ||
      this.queue._downloadQueue?.length ||
      this.queue._editorExecutor?.isDownloading
    )
      return;
    const tail = this.writeTail;
    const release = this.releaseLease;
    tail
      .then(() => {
        if (
          this.writeTail !== tail ||
          this.releaseLease !== release ||
          this.storageError
        )
          return;
        if (
          [...this.records.values()].some(
            (record) =>
              !record.terminal ||
              (!record.stopped &&
                record.snapshot._autoDownload &&
                record.outputs.some(
                  (output) =>
                    output.mediaId &&
                    !["downloaded", "failed", "skipped"].includes(
                      output.downloadStatus,
                    ),
                )),
          ) ||
          this.queue._downloadQueue?.length ||
          this.queue._editorExecutor?.isDownloading
        )
          return;
        release?.();
        this.releaseLease = null;
        this.leaseReady = null;
      })
      .catch(() => {});
  }
  markDownload(mediaId, status) {
    if (!this.mediaOwners.has(mediaId)) return;
    if (globalThis.navigator?.locks && !this.releaseLease) return;
    for (const record of this.records.values()) {
      const output = record.outputs.find((entry) => entry.mediaId === mediaId);
      if (output) output.downloadStatus = status;
    }
    this.persist()
      .then(() => this.releaseIfIdle())
      .catch(() => {
        this.storageError = true;
      });
  }
  async prepare(item, { deferPersist = false, downloadSettings = null } = {}) {
    await this.ready;
    if (!this.eligible(item)) return;
    if (this.storageError) throw new Error("FLOW_RECOVERY_STORAGE_UNAVAILABLE");
    if (this.foreignOwner) {
      if (!(await this.acquireLease()))
        throw new Error("FLOW_RECOVERY_OTHER_WINDOW_ACTIVE");
      this.foreignOwner = false;
      await this.restore();
      if (this.blocked) throw new Error("FLOW_RECOVERY_RESTORE_REQUIRED");
    }
    if (item._phaseR) return;
    const hadLease = !!this.releaseLease || !globalThis.navigator?.locks;
    if (!(await this.acquireLease()))
      throw new Error("FLOW_RECOVERY_OTHER_WINDOW_ACTIVE");
    if (!hadLease) await this.restore();
    if (this.blocked) throw new Error("FLOW_RECOVERY_RESTORE_REQUIRED");
    const job = this.queue.getJob(item.jobId);
    if (!Object.prototype.hasOwnProperty.call(job, "_webRecoveryPolicy"))
      this.snapshotPolicy(job);
    const policy = job._webRecoveryPolicy;
    if (typeof policy.enabled !== "boolean")
      throw new Error("CONFIG_REQUIRED:flow_web_resubmit_enabled");
    const configuredMax = policy.max;
    const max = policy.enabled ? configuredMax : 0;
    if (!Number.isSafeInteger(configuredMax) || configuredMax < 0)
      throw new Error("CONFIG_REQUIRED:exec_max_retries");
    if (!Number.isSafeInteger(max) || max < 0)
      throw new Error("CONFIG_REQUIRED:exec_max_retries");
    const accountId = window.authManager?.user?.id ?? null;
    const download =
      downloadSettings || (await window.DownloadHelper.getSettings());
    const snapshot = JSON.parse(
      JSON.stringify({
        accountId,
        anonymousSessionId: accountId == null ? this.anonymousSessionId : null,
        prompt: item.prompt,
        settings: item.settings,
        refFileIds: item.refFileIds,
        refFileNames: item.refFileNames,
        refThumbnails: _FlowWebRecovery.snapshotRefIdentityMap(
          item.refThumbnails,
          item.refFileIds,
          item.refFileNames,
        ),
        refImageMode: item.refImageMode,
        mentionData: item.mentionData,
        projectId: item.projectId,
        promptIndex: item.promptIndex,
        _owner: item._owner,
        _flowTabId: job.flowTabId || null,
        _flowDriverKey: item._flowDriverKey,
        _taskIdx: item._taskIdx,
        _taskId: item._taskId,
        _taskName: item._taskName,
        _isVideo: item._isVideo,
        _autoDownload:
          !!(item._autoDownload ?? job._autoDownload) &&
          window.featureGate?.canUse?.("auto_download") === true,
        _downloadResolution: item._downloadResolution || download.resolution,
        _videoDownloadResolution:
          item._videoDownloadResolution || download.videoResolution,
      }),
    );
    const quantity = Number(item.settings.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1)
      throw new Error("CONFIG_REQUIRED:quantity");
    const stamp = Date.now();
    const outputs = Array.from({ length: quantity }, (_, index) => {
      const nameIndex =
        String(item.promptIndex + 1).padStart(3, "0") +
        (quantity > 1 ? `_${index + 1}` : "");
      return {
        index,
        used: 0,
        state: "pending",
        nameIndex,
        filename: window.DownloadHelper.buildFilename({
          ...download,
          prompt: item.prompt,
          index: nameIndex,
          taskName: item._taskName,
          ext: /video/i.test(item.settings.genType) ? "mp4" : "png",
          timestamp: stamp,
        }),
      };
    });
    const record = {
      policyVersion: "R2",
      autoResubmit: policy.enabled,
      configuredMax,
      id: item.id,
      jobId: item.jobId,
      projectId: item.projectId,
      snapshot,
      executionToken: job._executionToken || null,
      outputs,
      max,
      attempts: [],
      terminal: false,
      createdAt: stamp,
    };
    this.records.set(item.id, record);
    Object.assign(item, JSON.parse(JSON.stringify(snapshot)));
    item._phaseR = {
      originalId: item.id,
      slots: outputs.map((output) => output.index),
      retry: false,
    };
    item._phaseRRecord = record;
    item._downloadResolution = snapshot._downloadResolution;
    item._videoDownloadResolution = snapshot._videoDownloadResolution;
    item._autoDownload = snapshot._autoDownload;
    item.noRetry = true;
    if (!deferPersist) await this.persist();
  }
  snapshotPolicy(job) {
    job._webRecoveryPolicy = {
      enabled: window.ExecutionConfig?._cache?.parallel?.web_resubmit_enabled,
      max: window.ExecutionConfig?.getWorkflowConfig?.().max_retries,
    };
  }
  async admitJob(job) {
    await this.ready;
    const decisions = {};
    const prepared = [];
    let downloadSettingsPromise = null;
    for (const item of job.items) {
      const reason = this.exclusionReason(item);
      const decision = reason || "eligible";
      decisions[decision] = (decisions[decision] || 0) + 1;
      if (reason) continue;
      try {
        downloadSettingsPromise ||
          (downloadSettingsPromise = window.DownloadHelper.getSettings());
        await this.prepare(item, {
          deferPersist: true,
          downloadSettings: await downloadSettingsPromise,
        });
        if (item._phaseR) prepared.push(item);
      } catch (error) {
        await this.error(item, error);
      }
    }
    if (prepared.length) {
      try {
        await this.persist();
      } catch (error) {
        this.storageError = error;
        for (const item of prepared) {
          item._phaseRPreparationFailed = true;
          item.noRetry = true;
          item.state = QueueItem.STATE.FAILED;
          item.error = "FLOW_RECOVERY_STORAGE_UNAVAILABLE";
          item.completedAt = Date.now();
          const record = this.records.get(item.id);
          if (record) {
            record.terminal = true;
            record.error = item.error;
            for (const output of record.outputs) output.state = "failed";
          }
          this.queue._onItemCompleted(item);
        }
      }
    }
    console.log(
      "[FlowRecovery] admission " +
        JSON.stringify({
          job: job.id,
          owner: job.owner,
          policyVersion: "R2",
          autoResubmit: job._webRecoveryPolicy?.enabled ?? null,
          effectiveBudget:
            job._webRecoveryPolicy?.enabled === false
              ? 0
              : job._webRecoveryPolicy?.max,
          requestedSequential: job.requestedSequentialMode === true,
          decisions,
          prepared: job.items.filter((item) => !!item._phaseR).length,
        }),
    );
  }
  get unsafeToReload() {
    return (
      !!this.queue._editorExecutor?._currentItem?._phaseR ||
      this.blocked ||
      this.pending.length > 0 ||
      [...this.records.values()].some(
        (record) =>
          !record.terminal &&
          record.outputs.some((output) =>
            ["dispatched", "retry_queued", "captcha_held"].includes(
              output.state,
            ),
          ),
      )
    );
  }
  async beforeDispatch(item, effectivePrompt) {
    if (!item._phaseR) return;
    const record = this.records.get(item._phaseR.originalId);
    const context = await window.MessageBridge.getTargetContext();
    if (
      !record ||
      context?.projectId !== record.projectId ||
      (record.snapshot._flowTabId != null &&
        context?.tabId !== record.snapshot._flowTabId)
    )
      throw new Error("FLOW_RECOVERY_PROJECT_CHANGED");
    const currentAccountId = window.authManager?.user?.id ?? null;
    const sameAccount =
      record.snapshot.accountId == null
        ? currentAccountId == null &&
          record.snapshot.anonymousSessionId === this.anonymousSessionId
        : currentAccountId != null &&
          String(record.snapshot.accountId) === String(currentAccountId);
    if (!sameAccount) throw new Error("FLOW_RECOVERY_ACCOUNT_CHANGED");
    if (record.recoveryRequired || record.terminal)
      throw new Error("FLOW_RECOVERY_REQUIRED");
    if (
      item._phaseR.retry &&
      !item._phaseR.userResume &&
      record.autoResubmit !== true
    ) {
      throw new Error("FLOW_RECOVERY_AUTO_RESUBMIT_DISABLED");
    }
    if (
      item._phaseR.retry &&
      !item._phaseR.userResume &&
      window.featureGate?.canUseRetryOnFail?.() !== true
    ) {
      throw new Error("FLOW_RECOVERY_PERMISSION_DENIED");
    }
    if (!item._phaseR.retry) {
      record.snapshot.refFileIds = JSON.parse(JSON.stringify(item.refFileIds));
      record.snapshot.refFileNames = JSON.parse(
        JSON.stringify(item.refFileNames),
      );
      record.snapshot.refThumbnails = _FlowWebRecovery.snapshotRefIdentityMap(
        item.refThumbnails,
        item.refFileIds,
        item.refFileNames,
      );
      record.effectivePrompt = effectivePrompt;
    } else if (record.effectivePrompt !== effectivePrompt) {
      throw new Error("FLOW_RECOVERY_PROMPT_CHANGED");
    }
    for (const index of item._phaseR.slots) {
      const output = record.outputs[index];
      if (!item._phaseR.retry && output.state !== "pending")
        throw new Error("FLOW_RECOVERY_DUPLICATE_DISPATCH");
      if (
        item._phaseR.retry &&
        (output.state !== "retry_queued" ||
          (!item._phaseR.userResume && output.used >= record.max))
      )
        throw new Error("FLOW_RECOVERY_BUDGET_EXHAUSTED");
    }
    for (const index of item._phaseR.slots) {
      const output = record.outputs[index];
      if (item._phaseR.retry && !item._phaseR.userResume) output.used++;
      output.state = "dispatched";
    }
    record.attempts.push({
      id: item.attemptId,
      slots: item._phaseR.slots,
      state: "dispatched",
    });
    item._phaseR.dispatched = true;
    record.activeRetry = item._phaseR.retry;
    const original = this.queue
      .getJob(record.jobId)
      ?.items.find((entry) => entry.id === record.id);
    if (original)
      original.retrySubmitCount = Math.max(
        ...record.outputs.map((output) => output.used),
      );
    await this.persist();
    this.queue._emitStateChanged();
  }
  async cancelBeforeSubmit(item, { requeue = true } = {}) {
    this.retryItems.delete(item._phaseR?.originalId);
    const record = this.records.get(item._phaseR?.originalId);
    if (!record || record.terminal || !item._phaseR.dispatched) return;
    for (const index of item._phaseR.slots) {
      const output = record.outputs[index];
      output.state = item._phaseR.retry ? "retry_queued" : "pending";
      if (item._phaseR.retry && !item._phaseR.userResume) output.used--;
      if (item._phaseR.retry && requeue)
        this.pending.push({
          recordId: record.id,
          index,
          userResume: item._phaseR.userResume,
        });
    }
    const attempt = record.attempts.find(
      (entry) => entry.id === item.attemptId,
    );
    if (attempt) attempt.state = "cancelled_before_submit";
    item._phaseR.dispatched = false;
    const original = this.queue
      .getJob(record.jobId)
      ?.items.find((entry) => entry.id === record.id);
    if (original)
      original.retrySubmitCount = Math.max(
        ...record.outputs.map((output) => output.used),
      );
    if (!item._phaseR.retry && requeue) {
      item.state = QueueItem.STATE.PENDING;
      this.queue._itemQueue.unshift(item);
      this.windowCount = Math.max(0, this.windowCount - 1);
      this.closed = false;
    }
    await window.flowV2CorrelationBroker?.disarm?.(item, "superseded");
    await this.persist();
  }
  async unknown(item, reason) {
    this.retryItems.delete(item._phaseR?.originalId);
    const record = this.records.get(item._phaseR?.originalId);
    if (!record || record.terminal) return;
    if (await this._applyExplicitRejection(item, record)) return;
    if (reason !== "FLOW_RECOVERY_ERROR_CONFIG_REQUIRED") {
      const attempt = record.attempts.find(
        (entry) => entry.id === item.attemptId,
      );
      const providerErrorCode =
        item._flowTerminalResponseError?.errorCodes?.find(
          (code) =>
            typeof code === "string" && /^[A-Z][A-Z0-9_]{2,119}$/.test(code),
        ) || null;
      if (attempt?.state === "unverified") return;
      if (attempt) {
        attempt.state = "unverified";
        attempt.error = providerErrorCode || reason;
      }
      const retired = await window.flowV2CorrelationBroker?.disarm?.(
        item,
        "acceptance_unknown",
      );
      if (record.stopped || record.terminal) return;
      const unboundRequestQuarantined =
        item._flowCorrelationNeedsReset === true;
      const verifiedFailedReceipt =
        [
          "FLOW_RECOVERY_RESULT_UNVERIFIED",
          "FLOW_RECOVERY_ACCEPTANCE_UNKNOWN",
        ].includes(reason) &&
        item.flowCorrelationReceipt?.strong === true &&
        item.flowCorrelationReceipt.children?.length ===
          item._phaseR.slots.length &&
        item.flowCorrelationReceipt.children.every(
          (child) => child?.operationId && child.status === "failed",
        );
      record.excludedOperationIds = [
        ...new Set([
          ...(record.excludedOperationIds || []),
          ...(retired?.operationIds || []),
          ...(item.flowCorrelationReceipt?.children || [])
            .map((child) => child?.operationId)
            .filter(Boolean),
        ]),
      ];
      record.excludedMediaIds = [
        ...new Set([
          ...(record.excludedMediaIds || []),
          ...(retired?.mediaIds || []),
          ...(item.flowCorrelationReceipt?.children || [])
            .map((child) => child?.mediaId)
            .filter(Boolean),
        ]),
      ];
      const unverifiedOutcome = !providerErrorCode && !verifiedFailedReceipt;
      if (attempt && !unverifiedOutcome) attempt.state = "terminal";
      if (unverifiedOutcome) {
        const original2 = this.queue
          .getJob(record.jobId)
          ?.items.find((entry) => entry.id === record.id);
        if (original2) original2.noRetry = true;
        this.pending = this.pending.filter(
          (entry) =>
            entry.recordId !== record.id ||
            !item._phaseR.slots.includes(entry.index),
        );
      }
      record.recoveryRequired = null;
      record.activeRetry = false;
      if (!this._isAmbiguousRecovery(record.error))
        record.error = providerErrorCode || reason;
      for (const index of item._phaseR.slots) {
        const output = record.outputs[index];
        if (output.state === "completed") continue;
        output.state =
          !unboundRequestQuarantined &&
          !unverifiedOutcome &&
          output.used < record.max &&
          window.featureGate?.canUseRetryOnFail?.() === true
            ? "retry_queued"
            : "failed";
        if (
          output.state === "retry_queued" &&
          !this.pending.some(
            (entry) => entry.recordId === record.id && entry.index === index,
          )
        ) {
          this.pending.push({ recordId: record.id, index });
        }
      }
      await this.persist();
      console.warn(
        "[FlowRecovery] unverified attempt retired; continuing queue " +
          JSON.stringify({
            jobId: record.jobId,
            promptIndex: record.snapshot.promptIndex,
            reason,
            jobState: this.queue.getJob(record.jobId)?.state || null,
            queuedSiblings: (this.queue._itemQueue || []).filter(
              (entry) => entry.jobId === record.jobId && !entry.isTerminal,
            ).length,
            executorStopped: this.queue._editorExecutor?._shouldStop === true,
            requestBound: retired?.requestBound === true,
            retrySuppressed: unboundRequestQuarantined || unverifiedOutcome,
            retryQueued: record.outputs.some(
              (output) => output.state === "retry_queued",
            ),
          }),
      );
      await this.finish(record);
      return;
    }
    await window.flowV2CorrelationBroker?.disarm?.(item, "acceptance_unknown");
    record.recoveryRequired = reason;
    const original = this.queue
      .getJob(record.jobId)
      ?.items.find((entry) => entry.id === record.id);
    if (original) {
      original.state = QueueItem.STATE.WAITING_PROVIDER;
      original.error = reason;
    }
    item.state = QueueItem.STATE.WAITING_PROVIDER;
    console.warn(
      "[FlowRecovery] blocked " +
        JSON.stringify({
          job: record.jobId,
          promptIndex: record.snapshot.promptIndex,
          reason,
          correlationState: item.correlationState || null,
        }),
    );
    await this.persist();
    this.queue._emitStateChanged();
  }
  async error(item, error) {
    this.retryItems.delete(item._phaseR?.originalId);
    const preSubmitQuota =
      error?.notDispatched === true &&
      error?.code === "PUBLIC_ERROR_USER_QUOTA_REACHED";
    const quotaType = preSubmitQuota
      ? this.classifyVerifiedRpcType([error.code])
      : null;
    if (preSubmitQuota) {
      item.errorPolicy = {
        code: error.code,
        providerErrorCodes: [error.code],
        stage: "pre_dispatch",
        dispatchStarted: false,
        ambiguous: false,
      };
      if (quotaType) item.errorType = quotaType;
      item.noRetry = true;
      error.noRetry = true;
    }
    if (!item._phaseR) {
      if (!this.eligible(item)) return false;
      if (item._phaseRPreparationFailed) return true;
      item._phaseRPreparationFailed = true;
      item.noRetry = true;
      item.state = QueueItem.STATE.FAILED;
      item.error = preSubmitQuota ? error.code : error.message;
      item.completedAt = Date.now();
      this.queue._onItemCompleted(item);
      return true;
    }
    if (item._phaseR.dispatched) {
      if (
        item.flowCorrelationReceipt?.strong === true ||
        item._flowTerminalResponseError ||
        item._flowCorrelationPromise ||
        item._flowResultEvidencePromise
      ) {
        try {
          await this.monitor(item);
          return true;
        } catch (receiptError) {
          console.warn(
            "[FlowRecovery] verified receipt recovery failed",
            JSON.stringify({
              promptIndex: item.promptIndex ?? null,
              error: String(
                receiptError?.code || receiptError?.message || "",
              ).slice(0, 240),
            }),
          );
        }
      }
      item.auditLifecycle?.("submit_acceptance_unverified", {
        error: String(error?.code || error?.message || "").slice(0, 240),
      });
      await this.unknown(item, "FLOW_RECOVERY_ACCEPTANCE_UNKNOWN");
    } else {
      await window.flowV2CorrelationBroker?.disarm?.(item, "failed");
      const record = this.records.get(item._phaseR.originalId);
      if (!record || record.terminal) return true;
      for (const i of item._phaseR.slots) {
        record.outputs[i].state = "failed";
        if (preSubmitQuota) {
          record.outputs[i].errorCodes = [error.code];
          record.outputs[i].errorType = quotaType;
          record.outputs[i].category =
            quotaType === "quota_exceeded" ? "quota" : null;
        }
      }
      this.pending = this.pending.filter(
        (entry) =>
          entry.recordId !== record.id ||
          !item._phaseR.slots.includes(entry.index),
      );
      record.error = preSubmitQuota
        ? error.code
        : error?.message || "FLOW_RECOVERY_PREPARATION_FAILED";
      if (preSubmitQuota) {
        const original = this.queue
          .getJob(record.jobId)
          ?.items.find((entry) => entry.id === record.id);
        if (original) {
          original.errorPolicy = item.errorPolicy;
          original.noRetry = true;
        }
      }
      await this.finish(record);
    }
    return true;
  }
  classifyCodes(codes) {
    if (!Array.isArray(codes)) return null;
    const mappedType = this.classifyVerifiedRpcType(codes);
    if (
      ["quota_exceeded", "per_model_daily", "tier_restricted"].includes(
        mappedType,
      )
    )
      return "quota";
    if (["bot_detected", "captcha_failed"].includes(mappedType))
      return "captcha";
    if (mappedType === "content_blocked") return "policy";
    const config = window.ProviderConfigManager?.getApiConfigValueSync?.(
      "flow",
      "error_patterns",
    );
    if (!config || typeof config !== "object") return "config_missing";
    const text = codes.join(" ").replace(/_/g, " ");
    for (const category of ["policy", "rate_limit"]) {
      const exact = config.recovery_codes?.[category];
      if (Array.isArray(exact) && codes.some((code) => exact.includes(code)))
        return category;
      const pattern = config[`${category}_text`];
      if (typeof pattern !== "string" || !pattern) continue;
      try {
        if (new RegExp(pattern, "i").test(text)) return category;
      } catch (_) {
        return "config_missing";
      }
    }
    return null;
  }
  classifyVerifiedRpcType(codes) {
    if (!Array.isArray(codes) || !codes.length) return null;
    const privateMapping =
      window.ProviderConfigManager?.getApiConfigValueSync?.(
        "flow",
        "flow_api_v2_error_mapping",
      );
    const mapping =
      privateMapping &&
      typeof privateMapping === "object" &&
      !Array.isArray(privateMapping)
        ? privateMapping
        : window.ProviderConfigManager?.getApiConfigValueSync?.(
            "flow",
            "api_error_codes",
          );
    if (!mapping || typeof mapping !== "object" || Array.isArray(mapping))
      return null;
    const allowed = new Set([
      "quota_exceeded",
      "per_model_daily",
      "tier_restricted",
      "bot_detected",
      "captcha_failed",
      "content_blocked",
    ]);
    const entries = Object.entries(mapping)
      .filter(
        ([prefix, type]) =>
          /^[A-Z][A-Z0-9_]{2,119}$/.test(prefix) && allowed.has(type),
      )
      .sort((a, b) => b[0].length - a[0].length);
    for (const raw of codes) {
      if (typeof raw !== "string" || !/^[A-Z][A-Z0-9_]{2,119}$/.test(raw))
        continue;
      const match = entries.find(
        ([prefix]) => raw === prefix || raw.startsWith(`${prefix}_`),
      );
      if (match) return match[1];
    }
    return null;
  }
  providerErrorText(codes) {
    if (!Array.isArray(codes)) return "";
    return [
      ...new Set(
        codes.filter(
          (code) =>
            typeof code === "string" && /^[A-Z][A-Z0-9_]{2,119}$/.test(code),
        ),
      ),
    ].join(", ");
  }
  _hasOtherDomAttempt(item, owner = null) {
    return [...this.records.values()].some((record) =>
      record.attempts.some(
        (attempt) =>
          attempt.id !== item.attemptId &&
          (owner
            ? !owner.attemptIds.includes(attempt.id)
            : !record.terminal &&
              !record.stopped &&
              attempt.state === "dispatched"),
      ),
    );
  }
  async captureDomFailureOwner(item, baseline, probe = null) {
    item._flowDomFailureOwner = null;
    item._flowDomFailureProbe = null;
    const unavailable = (reason) =>
      item.auditLifecycle?.("dom_failure_owner_unavailable", { reason });
    if (item._phaseR.slots.length !== 1)
      return unavailable("multiple_outputs_require_rpc_ownership");
    if (!baseline?.documentEpoch) return unavailable("document_epoch_missing");
    const activeItems = this.queue._tileMonitor.activeItems || [];
    const otherMonitor = probe
      ? this.queue._tileMonitor.activeCount > activeItems.length ||
        activeItems.some((entry) => entry !== item)
      : this.queue._tileMonitor.activeCount > 0;
    if (
      otherMonitor ||
      this._hasOtherDomAttempt(item, probe) ||
      Object.values(baseline.tileStatusById || {}).includes("processing")
    )
      return unavailable("other_generation_active");
    const lineage = probe || {
      attemptIds: [...this.records.values()].flatMap((record) =>
        record.attempts.map((attempt) => attempt.id),
      ),
    };
    const after = await window.MessageBridge.getPreTileSnapshot();
    if (
      after?.documentEpoch !== baseline.documentEpoch ||
      this._hasOtherDomAttempt(item, lineage)
    )
      return unavailable("document_or_dispatch_changed");
    const before = new Set(baseline.preTileIds || []);
    const type = /video/i.test(item.settings.genType) ? "video" : "image";
    const newTiles = (after.preTileIds || []).filter(
      (id) => !before.has(id) && after.tileMediaById?.[id] === type,
    );
    const pending = newTiles.filter(
      (id) => after.tileStatusById?.[id] === "processing",
    );
    if (pending.length !== 1) {
      if (newTiles.length === 0)
        item._flowDomFailureProbe = {
          baseline,
          attemptIds: lineage.attemptIds,
        };
      if (probe && newTiles.length === 0) return;
      return unavailable(
        pending.length
          ? "multiple_pending_owners"
          : "pending_owner_not_mounted",
      );
    }
    item._flowDomFailureOwner = {
      attemptId: item.attemptId,
      tileId: pending[0],
      documentEpoch: after.documentEpoch,
      attemptIds: lineage.attemptIds,
    };
    item.auditLifecycle?.("dom_failure_owner_observed", {
      tileId: pending[0],
      mediaType: type,
    });
  }
  async _readOwnedDomFailure(item) {
    if (
      item._phaseR.slots.length !== 1 ||
      !window.MessageBridge?.sendToContentScript
    )
      return null;
    const child =
      item.flowCorrelationReceipt?.strong === true
        ? item.flowCorrelationReceipt.children?.[0]
        : null;
    const canonicalId = child?.mediaId;
    if (
      !canonicalId &&
      !item._flowDomFailureOwner &&
      item._flowDomFailureProbe
    ) {
      const probe = item._flowDomFailureProbe;
      await this.captureDomFailureOwner(item, probe.baseline, probe);
    }
    let owner = item._flowDomFailureOwner;
    if (
      owner &&
      (owner.attemptId !== item.attemptId ||
        this._hasOtherDomAttempt(item, owner))
    ) {
      item._flowDomFailureOwner = owner = null;
    }
    const tileIds = [...new Set([canonicalId, owner?.tileId].filter(Boolean))];
    if (!tileIds.length) return null;
    const response = await window.MessageBridge.sendToContentScript(
      "getTileStatuses",
      { tileIds },
    );
    if (owner && this._hasOtherDomAttempt(item, owner)) {
      item._flowDomFailureOwner = null;
      return null;
    }
    if (owner && response?.documentEpoch !== owner.documentEpoch) {
      item._flowDomFailureOwner = null;
      return null;
    }
    const statuses = response?.success === true ? response.statuses || {} : {};
    const canonicalInfo = canonicalId ? statuses[canonicalId] : null;
    const ownerInfo = owner ? statuses[owner.tileId] : null;
    if (owner && ["not_found", "success"].includes(ownerInfo?.status))
      item._flowDomFailureOwner = null;
    const canonicalFailed =
      canonicalInfo?.status === "failed" &&
      canonicalInfo.failure_category === "generation_failed" &&
      [
        canonicalInfo.persistent_media_id,
        canonicalInfo.media_uuid,
        canonicalInfo.tile?.mediaUuid,
        canonicalInfo.tile?.persistentMediaId,
        ...(canonicalInfo.identity_aliases || []),
      ].includes(canonicalId);
    const useOwner =
      !canonicalFailed &&
      owner &&
      (!canonicalId || canonicalInfo?.status === "not_found");
    const info = canonicalFailed ? canonicalInfo : useOwner ? ownerInfo : null;
    if (
      info?.status !== "failed" ||
      info.failure_category !== "generation_failed"
    )
      return null;
    const tileId = canonicalFailed ? canonicalId : owner.tileId;
    const reason =
      typeof info.failure_reason === "string"
        ? info.failure_reason.trim().slice(0, 2e3)
        : "";
    return {
      tileId,
      reason,
      source: canonicalFailed ? "provider_media" : "isolated_pending_owner",
    };
  }
  async _monitorEvidence(item) {
    const rpc = (async () => {
      await item._flowCorrelationPromise;
      return { resultEvidence: await item._flowResultEvidencePromise };
    })();
    if (
      !window.MessageBridge?.sendToContentScript ||
      item._phaseR.slots.length !== 1 ||
      typeof setTimeout !== "function"
    )
      return rpc;
    let active = true,
      timer,
      wake;
    const dom = (async () => {
      while (active && this.queue.getJob(item.jobId)?.state !== "stopped") {
        try {
          const failure = await this._readOwnedDomFailure(item);
          if (active && failure) return { domFailure: failure };
        } catch (error) {
          item.auditLifecycle?.("dom_failure_read_error", {
            error: String(error?.message || error).slice(0, 240),
          });
        }
        if (!active) break;
        await new Promise((resolve) => {
          wake = resolve;
          timer = setTimeout(resolve, 500);
        });
      }
      return {};
    })();
    let evidence, rpcError;
    try {
      evidence = await Promise.race([rpc, dom]);
    } catch (error) {
      rpcError = error;
    } finally {
      active = false;
      clearTimeout(timer);
      wake?.();
    }
    if (!evidence?.domFailure) {
      try {
        const failure = await this._readOwnedDomFailure(item);
        if (failure) evidence = { ...evidence, domFailure: failure };
      } catch (error) {
        item.auditLifecycle?.("dom_failure_read_error", {
          error: String(error?.message || error).slice(0, 240),
        });
      }
    }
    if (rpcError && !evidence?.domFailure) throw rpcError;
    return evidence || {};
  }
  async _applyDomFailure(item, failure) {
    const record = this.records.get(item._phaseR.originalId);
    if (
      !record ||
      record.terminal ||
      record.stopped ||
      this.queue.getJob(record.jobId)?.state === "stopped"
    )
      return;
    const output = record.outputs[item._phaseR.slots[0]];
    const retry =
      record.autoResubmit === true &&
      output.used < record.max &&
      window.featureGate?.canUseRetryOnFail?.() === true;
    output.state = retry ? "retry_queued" : "failed";
    output.errorCodes = [];
    output.errorType = null;
    output.category = null;
    output.failureReason = failure.reason;
    output.attemptId = item.attemptId;
    record.error = failure.reason || "GENERATION_FAILED";
    record.recoveryRequired = null;
    record.activeRetry = false;
    const attempt = record.attempts.find(
      (entry) => entry.id === item.attemptId,
    );
    if (attempt) {
      attempt.state = "terminal";
      attempt.error = record.error;
      attempt.failureSource = failure.source;
    }
    if (
      retry &&
      !this.pending.some(
        (entry) => entry.recordId === record.id && entry.index === output.index,
      )
    ) {
      this.pending.push({ recordId: record.id, index: output.index });
    }
    item.auditLifecycle?.("dom_generation_failed", {
      ...failure,
      retryQueued: retry,
    });
    await window.flowV2CorrelationBroker?.disarm?.(item, "completed");
    await this.persist();
    await this.finish(record);
  }
  _holdCaptchaForResume(record) {
    const job = this.queue.getJob(record.jobId);
    if (
      record.terminal ||
      record.stopped ||
      !["running", "paused"].includes(job?.state) ||
      job.owner !== "prompts" ||
      this.queue?._captchaRecoveryMode?.() !== "pause_resume"
    )
      return false;
    const original = job.items.find((item) => item.id === record.id);
    const rejected = record.outputs.filter(
      (output) => output.state === "failed" && output.category === "captcha",
    );
    if (!original || !rejected.length) return false;
    record.captchaHeld = true;
    for (const output of rejected) output.state = "captcha_held";
    original.state = QueueItem.STATE.WAITING_PROVIDER;
    original.completedAt = null;
    return true;
  }
  async _applyExplicitRejection(item, record) {
    const explicitError = item._flowTerminalResponseError;
    if (explicitError && item._phaseR.slots.length > 0) {
      const category = this.classifyCodes(explicitError.errorCodes);
      const mappedType = this.classifyVerifiedRpcType(explicitError.errorCodes);
      const normalCaptcha =
        category === "captcha" &&
        this.queue?._captchaRecoveryMode?.() === "normal_error";
      if (
        category === null ||
        category === "policy" ||
        (mappedType && category === "quota") ||
        (mappedType && category === "captcha")
      ) {
        this.queue?._recordHistoryDiagnostic?.(
          this.queue.getJob(record.jobId),
          "web_rejection",
          item,
          explicitError.errorCodes[0],
          category === "captcha" ? this.queue?._captchaRecoveryMode?.() : null,
        );
        let retryQueued = 0;
        for (const index of item._phaseR.slots) {
          const output = record.outputs[index];
          const retryFailure =
            (category === null || category === "policy" || normalCaptcha) &&
            output.used < record.max &&
            record.autoResubmit === true &&
            window.featureGate?.canUseRetryOnFail?.() === true;
          output.errorCodes = explicitError.errorCodes;
          output.category = retryFailure || normalCaptcha ? null : category;
          output.errorType = mappedType;
          output.attemptId = item.attemptId;
          output.state = retryFailure ? "retry_queued" : "failed";
          if (
            retryFailure &&
            !this.pending.some(
              (entry) =>
                entry.recordId === record.id && entry.index === output.index,
            )
          ) {
            this.pending.push({ recordId: record.id, index: output.index });
            retryQueued++;
          }
        }
        if (!this._isAmbiguousRecovery(record.error))
          record.error = explicitError.errorCodes.join(",");
        const attempt = record.attempts.find(
          (entry) => entry.id === item.attemptId,
        );
        if (attempt) {
          attempt.state = "terminal";
          attempt.error = record.error;
        }
        await window.flowV2CorrelationBroker?.disarm?.(item, "completed");
        console.warn(
          "[FlowRecovery] explicit provider rejection " +
            JSON.stringify({
              jobId: record.jobId,
              promptIndex: record.snapshot.promptIndex,
              category,
              errorType: mappedType,
              recoveryMode:
                category === "captcha"
                  ? this.queue?._captchaRecoveryMode?.() || null
                  : null,
              slots: item._phaseR.slots.length,
              retryQueued,
              errorCodes: explicitError.errorCodes,
            }),
        );
        await this.persist();
        if (retryQueued > 0) {
          item.auditLifecycle?.("queue_recovery_decision", {
            action: "retry_queued",
            maxRetries: record.max,
          });
          await this.finish(record);
          return true;
        } else if (category === "captcha") {
          if (this._holdCaptchaForResume(record)) await this.persist();
          const recoveryMode = this.queue?._captchaRecoveryMode?.();
          if (recoveryMode !== "normal_error")
            this.queue._handleFlowError?.({
              category,
              text: this.providerErrorText(explicitError.errorCodes),
              jobId: record.jobId,
              itemId: record.id,
            });
        } else if (category && !(category === "quota" && mappedType)) {
          this.queue._handleFlowError?.({
            category,
            text: "",
            jobId: record.jobId,
            itemId: record.id,
          });
        }
        await this.finish(record);
        return true;
      }
    }
    return false;
  }
  async monitor(item) {
    const record = this.records.get(item._phaseR.originalId);
    if (!record || record.terminal) return;
    if (
      ["terminal", "unverified"].includes(
        record.attempts.find((attempt2) => attempt2.id === item.attemptId)
          ?.state,
      )
    )
      return;
    const { resultEvidence, domFailure } = await this._monitorEvidence(item);
    item._flowDomFailureProbe = null;
    item._flowResultEvidenceExpired = resultEvidence?.expired === true;
    if (this.queue.getJob(record.jobId)?.state === "stopped") return;
    if (
      record.recoveryRequired ||
      record.terminal ||
      record.attempts.find((attempt2) => attempt2.id === item.attemptId)
        ?.state === "unverified"
    )
      return;
    record.activeRetry = false;
    this.retryItems.delete(record.id);
    const explicitError = item._flowTerminalResponseError;
    const terminalReceipt =
      item.flowCorrelationReceipt?.strong === true &&
      item.flowCorrelationReceipt.children?.length ===
        item._phaseR.slots.length &&
      item.flowCorrelationReceipt.children?.every((child) =>
        ["completed", "failed"].includes(child.status),
      );
    if (domFailure && !explicitError?.errorCodes?.length && !terminalReceipt) {
      return this._applyDomFailure(item, domFailure);
    }
    if (await this._applyExplicitRejection(item, record)) return;
    const receipt = item.flowCorrelationReceipt;
    const children = receipt?.children || [];
    const partial =
      receipt?.verifiedPartial === true &&
      !/video/i.test(record.snapshot.settings.genType) &&
      children.some(Boolean);
    if (
      (receipt?.strong !== true && !partial) ||
      children.length !== item._phaseR.slots.length ||
      children.some((child) =>
        partial && child == null
          ? false
          : !child.operationId ||
            !["completed", "failed"].includes(child.status) ||
            (child.status === "completed" && !child.mediaId),
      )
    ) {
      item.auditLifecycle?.("correlation_result_unverified", {
        strong: receipt?.strong === true,
        verifiedPartial: partial,
        expectedChildren: item._phaseR.slots.length,
        actualChildren: children.length,
        missingOperationCount: children.filter(
          (child) => child && !child.operationId,
        ).length,
        missingMediaCount: children.filter(
          (child) => child?.status === "completed" && !child.mediaId,
        ).length,
        childStatuses: children.map((child) => child?.status || "missing"),
        correlationState: item.correlationState || null,
        receiptError: item._flowAcceptanceAmbiguous?.reason || null,
      });
      return this.unknown(item, "FLOW_RECOVERY_RESULT_UNVERIFIED");
    }
    const original = this.queue
      .getJob(record.jobId)
      ?.items.find((entry) => entry.id === record.id);
    if (!original) return;
    if (
      children
        .filter(Boolean)
        .some((child) =>
          [...this.records.values()].some(
            (entry) =>
              entry.excludedOperationIds?.includes(child.operationId) ||
              (child.mediaId &&
                entry.excludedMediaIds?.includes(child.mediaId)),
          ),
        )
    ) {
      return this.unknown(item, "FLOW_RECOVERY_RETIRED_RESULT");
    }
    const completedIds = [];
    const seenOperations = new Set(),
      seenMedia = new Set();
    const previousOperations = new Set(
      [...this.records.values()].flatMap((entry) =>
        entry.attempts
          .filter((attempt2) => attempt2.id !== item.attemptId)
          .flatMap((attempt2) =>
            (attempt2.children || []).map((child) => child.operationId),
          ),
      ),
    );
    for (const child of children.filter(Boolean)) {
      if (
        previousOperations.has(child.operationId) ||
        seenOperations.has(child.operationId) ||
        (child.mediaId && seenMedia.has(child.mediaId))
      ) {
        return this.unknown(item, "FLOW_RECOVERY_DUPLICATE_RESULT");
      }
      seenOperations.add(child.operationId);
      if (child.mediaId) seenMedia.add(child.mediaId);
    }
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const output = record.outputs[item._phaseR.slots[i]];
      const owner = `${record.id}:${output.index}`;
      if (
        child?.mediaId &&
        this.mediaOwners.has(child.mediaId) &&
        this.mediaOwners.get(child.mediaId) !== owner
      ) {
        return this.unknown(item, "FLOW_RECOVERY_MEDIA_OWNER_CONFLICT");
      }
    }
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const output = record.outputs[item._phaseR.slots[i]];
      if (!child && partial) {
        output.state = "failed";
        original.noRetry = true;
        record.error = "FLOW_RECOVERY_RESULT_UNVERIFIED";
        continue;
      }
      output.operationId = child.operationId;
      output.attemptId = item.attemptId;
      if (child.status === "completed") {
        output.state = "completed";
        output.mediaId = child.mediaId;
        output.category = null;
        output.errorCodes = [];
        output.errorType = null;
        if (
          !record.snapshot._autoDownload ||
          window.featureGate?.canUse?.("auto_download") !== true
        )
          output.downloadStatus = "skipped";
        this.mediaOwners.set(child.mediaId, `${record.id}:${output.index}`);
        original.resultFileNames = {
          ...original.resultFileNames,
          [child.mediaId]: child.mediaId,
        };
        original.resultThumbnails[child.mediaId] = {
          file_name: child.mediaId,
          media_uuid: child.mediaId,
          thumbnail: child.thumbnail || null,
          source_thumbnail: child.thumbnail || null,
          video_url: child.video_url || null,
          thumb_is_poster:
            !!child.thumbnail &&
            /video/i.test(record.snapshot.settings.genType),
          type: /video/i.test(record.snapshot.settings.genType)
            ? "video"
            : "image",
          phaseRDownloadName: output.filename,
          phaseROutputIndex: output.index,
        };
        output.preview = { ...original.resultThumbnails[child.mediaId] };
        completedIds.push(child.mediaId);
      } else {
        output.errorCodes = child.errorCodes || receipt.errorCodes || [];
        output.errorType = this.classifyVerifiedRpcType(output.errorCodes);
        const classifiedCategory = this.classifyCodes(output.errorCodes);
        const normalCaptcha =
          classifiedCategory === "captcha" &&
          this.queue?._captchaRecoveryMode?.() === "normal_error";
        const retryPolicyFailure =
          classifiedCategory === "policy" &&
          output.used < record.max &&
          record.autoResubmit === true &&
          window.featureGate?.canUseRetryOnFail?.() === true;
        output.category =
          normalCaptcha || retryPolicyFailure ? null : classifiedCategory;
        const blocked = output.category !== null;
        output.state =
          !blocked &&
          output.used < record.max &&
          window.featureGate?.canUseRetryOnFail?.() === true
            ? "retry_queued"
            : "failed";
        if (
          output.errorCodes.length &&
          !this._isAmbiguousRecovery(record.error)
        )
          record.error = output.errorCodes.join(",");
        if (output.state === "retry_queued")
          this.pending.push({ recordId: record.id, index: output.index });
      }
    }
    const attempt = record.attempts.find(
      (entry) => entry.id === item.attemptId,
    );
    if (attempt) {
      attempt.state =
        partial && children.some((child) => child == null)
          ? "unverified"
          : "terminal";
      attempt.children = children.filter(Boolean);
    }
    original.resultTileIds = record.outputs
      .filter((output) => output.state === "completed")
      .map((output) => output.mediaId);
    original.outputs = record.outputs.map((output) => ({
      outputIndex: output.index,
      resultId: output.mediaId || null,
      mediaId: output.mediaId || null,
      status: output.state === "completed" ? "completed" : "failed",
      operationId: output.operationId || null,
      downloadStatus: output.downloadStatus || "not_requested",
    }));
    if (completedIds.length && window.MessageBridge.sendToContentScript) {
      try {
        const response = await window.MessageBridge.sendToContentScript(
          "getTileStatuses",
          { tileIds: completedIds },
        );
        for (const mediaId of completedIds) {
          const info = response?.statuses?.[mediaId];
          if (
            !info ||
            ![
              info.media_uuid,
              info.file_name,
              info.persistent_media_id,
              ...(info.identity_aliases || []),
            ].includes(mediaId)
          )
            continue;
          const expectedType = /video/i.test(record.snapshot.settings.genType)
            ? "video"
            : "image";
          if (info.type && info.type !== expectedType) continue;
          original.resultThumbnails[mediaId] = {
            ...original.resultThumbnails[mediaId],
            thumbnail:
              info.thumbnail ||
              original.resultThumbnails[mediaId].thumbnail ||
              null,
            source_thumbnail:
              info.source_thumbnail ||
              info.thumbnail ||
              original.resultThumbnails[mediaId].source_thumbnail ||
              null,
            thumb_is_poster:
              info.thumb_is_poster === true ||
              original.resultThumbnails[mediaId].thumb_is_poster === true,
            video_url:
              info.video_url ||
              original.resultThumbnails[mediaId].video_url ||
              null,
          };
          const output = record.outputs.find(
            (entry) => entry.mediaId === mediaId,
          );
          if (output)
            output.preview = { ...original.resultThumbnails[mediaId] };
        }
      } catch (_) {}
    }
    original.retrySubmitCount = Math.max(
      ...record.outputs.map((output) => output.used),
    );
    await this.persist();
    if (completedIds.length) this.queue._onTilesReady(original, completedIds);
    await window.flowV2CorrelationBroker.disarm(item, "completed");
    if (record.outputs.some((output) => output.category === "config_missing"))
      return this.unknown(item, "FLOW_RECOVERY_ERROR_CONFIG_REQUIRED");
    for (const category of ["quota", "policy", "rate_limit"]) {
      if (!record.outputs.some((output) => output.category === category))
        continue;
      const hasVerifiedQuota =
        category === "quota" &&
        record.outputs.some((output) =>
          ["per_model_daily", "quota_exceeded", "tier_restricted"].includes(
            output.errorType,
          ),
        );
      if (!hasVerifiedQuota) {
        this.queue._handleFlowError?.({
          category,
          text: "",
          jobId: record.jobId,
          itemId: original.id,
        });
      }
      if (
        category === "rate_limit" ||
        (category === "quota" && !hasVerifiedQuota)
      ) {
        this.queue.pauseJob?.(record.jobId);
      }
    }
    if (record.outputs.some((output) => output.category === "captcha")) {
      const job = this.queue.getJob(record.jobId);
      const recoveryMode = this.queue?._captchaRecoveryMode?.();
      if (recoveryMode === "normal_error") {
        for (const output of record.outputs) {
          if (output.category !== "captcha") continue;
          output.category = null;
          if (
            output.state === "failed" &&
            output.used < record.max &&
            window.featureGate?.canUseRetryOnFail?.() === true
          ) {
            output.state = "retry_queued";
            if (
              !this.pending.some(
                (entry) =>
                  entry.recordId === record.id && entry.index === output.index,
              )
            ) {
              this.pending.push({ recordId: record.id, index: output.index });
            }
          }
        }
        await this.persist();
        await this.finish(record);
        return;
      }
      this._holdCaptchaForResume(record);
      const event = {
        category: "captcha",
        text: this.providerErrorText(
          record.outputs
            .filter((output) => output.category === "captcha")
            .flatMap((output) => output.errorCodes || []),
        ),
        jobId: record.jobId,
        itemId: original.id,
        recoveryMode,
        action: recoveryMode === "pause_resume" ? "pause_resume" : "stop_batch",
      };
      if (window.eventBus?.emit)
        window.eventBus.emit("flow:error_classified", event);
      else this.queue._handleFlowError(event);
      await this.persist();
      if (record.captchaHeld || job?.state === "stopped") return;
    }
    await this.finish(record);
  }
  stop(jobId) {
    if (![...this.records.values()].some((record) => record.jobId === jobId))
      return;
    this.pending = this.pending.filter(
      (entry) => this.records.get(entry.recordId)?.jobId !== jobId,
    );
    const job = this.queue.getJob(jobId);
    for (const item of job?.items || [])
      if (item._phaseR) {
        window.flowV2CorrelationBroker?.disarm?.(item, "superseded", {
          discardOnStop: true,
        });
      }
    for (const record of this.records.values()) {
      if (record.jobId !== jobId) continue;
      record.terminal = true;
      record.stopped = true;
      record.finishedAt = Date.now();
      this.retryItems.delete(record.id);
    }
    if ([...this.records.values()].every((record) => record.terminal)) {
      this.windowCount = 0;
      this.closed = false;
      this.windowMembers = null;
    }
    if (!globalThis.navigator?.locks || this.releaseLease) {
      this.persist()
        .then(() => this.releaseIfIdle())
        .catch(() => {
          this.storageError = true;
        });
    }
  }
  async resume(jobId) {
    if (
      ![...this.records.values()].some(
        (record) => record.jobId === jobId && !record.stopped,
      )
    )
      return true;
    const hadLease = !!this.releaseLease || !globalThis.navigator?.locks;
    if (!(await this.acquireLease())) return false;
    if (!hadLease) await this.restore();
    const records = [...this.records.values()].filter(
      (r) => r.jobId === jobId && !r.stopped,
    );
    if (records.some((r) => r.recoveryRequired)) return false;
    for (const record of records) {
      const original = this.queue
        .getJob(jobId)
        ?.items.find((item) => item.id === record.id);
      if (original && record.snapshot._autoDownload) {
        const ready = record.outputs.filter(
          (output) =>
            output.mediaId &&
            !["downloaded", "failed", "skipped"].includes(
              output.downloadStatus,
            ),
        );
        if (ready.length)
          this.queue._onTilesReady(
            original,
            ready.map((output) => output.mediaId),
          );
      }
      if (!record.captchaHeld) continue;
      record.captchaHeld = false;
      for (const output of record.outputs)
        if (output.state === "captcha_held" && output.category === "captcha") {
          output.state = "retry_queued";
          this.pending.push({
            recordId: record.id,
            index: output.index,
            userResume: true,
          });
        }
    }
    await this.persist();
    return true;
  }
  async finish(record) {
    const original = this.queue
      .getJob(record.jobId)
      ?.items.find((item) => item.id === record.id);
    if (!original || this.queue.getJob(record.jobId)?.state === "stopped")
      return;
    if (
      record.outputs.some((output) =>
        ["pending", "dispatched", "retry_queued", "captcha_held"].includes(
          output.state,
        ),
      )
    ) {
      original.state = QueueItem.STATE.WAITING_PROVIDER;
      original.error = "FLOW_RECOVERY_QUEUED";
      this.queue._emitStateChanged();
      return;
    }
    if (record.terminal) return;
    record.terminal = true;
    record.finishedAt = Date.now();
    original.outputs = record.outputs.map((output) => ({
      outputIndex: output.index,
      resultId: output.mediaId || null,
      mediaId: output.mediaId || null,
      operationId: output.operationId || null,
      status: output.state === "completed" ? "completed" : "failed",
      identityKind: output.mediaId ? "uuid" : "none",
      correlationConfidence: output.operationId ? "provider_operation" : "none",
      downloadStatus: output.downloadStatus || "not_requested",
    }));
    try {
      await this.persist();
    } catch (error) {
      this.storageError = error;
      original.noRetry = true;
      original.auditLifecycle?.("web_terminal_storage_failed", {
        code: "FLOW_RECOVERY_STORAGE_UNAVAILABLE",
        action: "settle_local_keep_dispatch_blocked",
      });
      console.warn(
        "[FlowRecovery] terminal journal write failed",
        JSON.stringify({
          jobId: record.jobId,
          itemId: record.id,
          code: "FLOW_RECOVERY_STORAGE_UNAVAILABLE",
        }),
      );
    }
    if (record.stopped || this.queue.getJob(record.jobId)?.state === "stopped")
      return;
    const success = record.outputs.filter(
      (output) => output.state === "completed",
    ).length;
    original.state =
      success === record.outputs.length
        ? QueueItem.STATE.COMPLETED
        : success > 0
          ? QueueItem.STATE.PARTIAL_FAIL
          : QueueItem.STATE.FAILED;
    original.completedAt = Date.now();
    original.error =
      success === record.outputs.length
        ? null
        : record.error || "FLOW_RECOVERY_EXHAUSTED";
    const verifiedType = record.outputs.find(
      (output) => output.errorType,
    )?.errorType;
    if (verifiedType && success !== record.outputs.length)
      original.errorType = verifiedType;
    this.queue._onItemCompleted(original);
    this.releaseIfIdle();
  }
  displayState(item) {
    const record = item._phaseRRecord;
    const retry = this.retryItems.get(record?.id);
    if (
      !retry ||
      record.terminal ||
      record.stopped ||
      record.recoveryRequired ||
      record.captchaHeld
    )
      return item.state;
    if (
      [
        QueueItem.STATE.PENDING,
        QueueItem.STATE.SUBMITTING,
        QueueItem.STATE.RETRY_SUBMIT,
      ].includes(retry.state)
    ) {
      return QueueItem.STATE.RETRY_SUBMIT;
    }
    return [
      QueueItem.STATE.SUBMITTED,
      QueueItem.STATE.MONITORING,
      QueueItem.STATE.WAITING_PROVIDER,
      QueueItem.STATE.WAITING_USER,
    ].includes(retry.state)
      ? retry.state
      : item.state;
  }
  label(item) {
    const record = item._phaseRRecord;
    if (record?.interrupted) return window.I18n?.t("flowRecovery.interrupted");
    if (!record) return null;
    const unverified = record.attempts?.some(
      (attempt) => attempt.state === "unverified",
    );
    if (record.terminal)
      return unverified &&
        record.outputs.some((output) => output.state === "failed")
        ? window.I18n?.t("flowRecovery.unverified")
        : null;
    if (record.recoveryRequired)
      return this._isAmbiguousRecovery(record.recoveryRequired)
        ? window.I18n?.t("flowRecovery.unverified")
        : window.I18n?.t("flowRecovery.configBlocked");
    if (this.retryItems.has(record.id)) {
      return this.displayState(item) === QueueItem.STATE.RETRY_SUBMIT
        ? window.I18n?.t("flowRecovery.resubmitting")
        : null;
    }
    if (record.outputs.some((output) => output.state === "retry_queued"))
      return window.I18n?.t("flowRecovery.failedQueued");
    return null;
  }
  async expireIdleRecovery() {
    const busy =
      this.queue._tileMonitor.activeCount > 0 ||
      this.queue._phaseRWorkflowAdmitting?.size ||
      window.FlowApiAdapter?.hasInFlight?.() === true ||
      !!this.queue._editorExecutor?.currentItem ||
      this.queue._editorExecutor?.isDownloading === true ||
      !!this.queue._currentDownloadItem;
    for (const record of this.records.values()) {
      const job = this.queue.getJob(record.jobId);
      if (
        !record.terminal &&
        !record.stopped &&
        this._isAmbiguousRecovery(record.recoveryRequired) &&
        ["running", "paused"].includes(job?.state)
      ) {
        record.error = record.recoveryRequired;
        record.recoveryRequired = null;
        record.activeRetry = false;
        this.pending = this.pending.filter(
          (entry) => entry.recordId !== record.id,
        );
        this.retryItems.delete(record.id);
        for (const output of record.outputs)
          if (output.state !== "completed") output.state = "failed";
        const original2 = job.items.find((entry) => entry.id === record.id);
        if (original2) original2.noRetry = true;
        await this.finish(record);
        continue;
      }
      const waiting =
        record.recoveryRequired ||
        record.outputs.some((output) => output.state === "retry_queued");
      const retryBehindQueue =
        !record.recoveryRequired &&
        this.queue._itemQueue?.some((item) => {
          const queuedJob = this.queue.getJob(item.jobId);
          return queuedJob?.state === "running" && !item.isTerminal;
        });
      const ambiguousWait = !!record.recoveryRequired;
      const runnable =
        job?.state === "running" || (ambiguousWait && job?.state === "paused");
      if (
        record.terminal ||
        record.stopped ||
        !waiting ||
        (!ambiguousWait && busy) ||
        retryBehindQueue ||
        !runnable ||
        record.captchaHeld
      ) {
        delete record._recoveryIdleSince;
        continue;
      }
      const key = /video/i.test(record.snapshot.settings?.genType || "")
        ? "video_timeout_ms"
        : "image_timeout_ms";
      const timeout = Number(window.SystemConfig?.safeGetTimeout?.(key));
      if (!(timeout > 0)) continue;
      record._recoveryIdleSince ?? (record._recoveryIdleSince = Date.now());
      if (Date.now() - record._recoveryIdleSince < timeout) continue;
      const cause = record.recoveryRequired || record.error || null;
      const waitAudit = {
        waitKind: record.recoveryRequired
          ? this._isAmbiguousRecovery(record.recoveryRequired)
            ? "unverified_acceptance"
            : "recovery_blocked"
          : "retry_queue",
        idleMs: Date.now() - record._recoveryIdleSince,
        mediaType: record.snapshot.settings?.genType || null,
        outputStates: record.outputs.slice(0, 8).map((output) => output.state),
        completedOutputs: record.outputs.filter(
          (output) => output.state === "completed",
        ).length,
        queuedPrompts: this.queue._itemQueue?.length || 0,
        pendingRetries: this.pending.length,
        activeMonitors: this.queue._tileMonitor.activeCount,
        windowClosed: this.closed === true,
        jobState: job.state,
        attempts: (record.attempts || [])
          .slice(-4)
          .map((attempt) => ({
            state: attempt.state,
            error: attempt.error || null,
          })),
      };
      const original = job.items.find((item) => item.id === record.id);
      original?.auditLifecycle?.("history_recovery_timeout", {
        waitKind: waitAudit.waitKind,
        idleMs: waitAudit.idleMs,
        pendingRetries: waitAudit.pendingRetries,
        activeMonitors: waitAudit.activeMonitors,
      });
      this.pending = this.pending.filter(
        (entry) => entry.recordId !== record.id,
      );
      this.retryItems.delete(record.id);
      record.recoveryRequired = null;
      record.activeRetry = false;
      record.recoveryTimeoutCause = cause;
      record.error = "FLOW_RECOVERY_QUEUE_TIMEOUT";
      for (const output of record.outputs)
        if (output.state !== "completed") output.state = "failed";
      console.warn(
        "[FlowRecovery] idle queue timeout",
        JSON.stringify({
          jobId: record.jobId,
          promptIndex: record.snapshot.promptIndex,
          timeoutMs: timeout,
          cause,
          ...waitAudit,
        }),
      );
      await this.finish(record);
    }
  }
  take(allowedJobId = null) {
    if (
      this.blocked ||
      this.queue._tileMonitor.activeCount > 0 ||
      this.queue._phaseRWorkflowAdmitting?.size
    )
      return null;
    this.pending.sort((a, b) => {
      const x = this.records.get(a.recordId),
        y = this.records.get(b.recordId);
      return (
        x.outputs[a.index].used - y.outputs[b.index].used ||
        x.createdAt - y.createdAt ||
        x.snapshot.promptIndex - y.snapshot.promptIndex ||
        a.index - b.index
      );
    });
    for (let n = 0; n < this.pending.length; n++) {
      const entry = this.pending[n],
        record = this.records.get(entry.recordId);
      const job = this.queue.getJob(record.jobId);
      if (!job || job.state === "stopped" || record.terminal) {
        this.pending.splice(n--, 1);
        continue;
      }
      if (allowedJobId && job.id !== allowedJobId) continue;
      if (
        this.queue._isApiQuotaBlockedForItem?.(job, {
          settings: record.snapshot.settings,
        })
      ) {
        this.pending.splice(n--, 1);
        record.outputs[entry.index].state = "failed";
        record.error || (record.error = job.stopReason || "FLOW_QUOTA_BLOCKED");
        void this.finish(record);
        continue;
      }
      if (
        !entry.userResume &&
        (record.autoResubmit === false ||
          record.outputs[entry.index].used >= record.max)
      ) {
        this.pending.splice(n--, 1);
        record.outputs[entry.index].state = "failed";
        void this.finish(record);
        continue;
      }
      if (job.state === "paused") continue;
      this.pending.splice(n, 1);
      delete record._recoveryIdleSince;
      const item = new QueueItem({
        ...JSON.parse(JSON.stringify(record.snapshot)),
        jobId: record.jobId,
      });
      Object.assign(item, JSON.parse(JSON.stringify(record.snapshot)));
      item.settings.quantity = 1;
      item._phaseR = {
        originalId: record.id,
        slots: [entry.index],
        retry: true,
        userResume: entry.userResume === true,
      };
      item._phaseRRecord = record;
      item.noRetry = true;
      this.retryItems.set(record.id, item);
      this.queue._emitStateChanged();
      return item;
    }
    return null;
  }
};
__publicField(_FlowWebRecovery, "TERMINAL_TTL_MS", 2 * 60 * 60 * 1e3);
let FlowWebRecovery = _FlowWebRecovery;
window.FlowWebRecovery = FlowWebRecovery;
