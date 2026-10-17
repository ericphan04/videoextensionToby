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
const _QueueItem = class _QueueItem {
  constructor({
    id,
    jobId,
    prompt,
    promptIndex,
    settings,
    refFileIds,
    refFileNames,
    refThumbnails,
    refImageMode,
    mentionData,
    priority,
  }) {
    this.id = id || crypto.randomUUID();
    this.attemptId = this.id;
    this.flowOperationId = null;
    this.flowApiAccepted = false;
    this.flowApiDriver = null;
    this.flowApiAttemptedDrivers = [];
    this.flowApiMode = null;
    this.flowApiProtocolRevision = null;
    this.flowApiProtocolFingerprint = null;
    this.flowApiLineage = [];
    this.flowApiCandidateDriver = null;
    this.flowApiCandidateMode = null;
    this.flowApiCandidateProtocolRevision = null;
    this.jobId = jobId;
    this.state = _QueueItem.STATE.PENDING;
    this.prompt = prompt;
    this.promptIndex = promptIndex || 0;
    this.promptText = prompt?.substring(0, 80) || "";
    this.settings = settings;
    this.refFileIds = refFileIds || [];
    this.refFileNames = refFileNames || {};
    this.refThumbnails = refThumbnails || {};
    this.refImageMode = refImageMode || "none";
    this.mentionData = mentionData || null;
    this.priority = priority || 0;
    this.preTileIds = null;
    this.preFileNames = null;
    this._ownTileIds = null;
    this.pendingOwners = [];
    this.outputs = [];
    this.resultTileIds = [];
    this.resultThumbnails = {};
    this.retrySubmitCount = 0;
    this.recoveryLabel = null;
    this.recoveryPhase = null;
    this.recoveryCode = null;
    this.recoveryAttempt = 0;
    this.recoveryMaxAttempts = 0;
    this.error = null;
    this.tileId = null;
    this._taskIdx = null;
    this._taskId = null;
    this.createdAt = Date.now();
    this.submittedAt = null;
    this.flowApiDispatchedAt = null;
    this.flowApiOperationDeadlineAt = null;
    this.providerPausedAt = null;
    this.completedAt = null;
    this._attemptAuditSignatures = Object.create(null);
  }
  _outputIdentityKind(resultId, mediaId) {
    const value = String(mediaId || resultId || "");
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value,
      )
    )
      return "uuid";
    if (/^AB-[A-Za-z0-9_-]{37,}$/.test(value)) return "flow_v2_asb";
    if (mediaId && mediaId !== resultId) return "provider_filename";
    return value ? "runtime_result" : "none";
  }
  auditLifecycle(event, extra = {}) {
    const diagnosticEvents = [
      "presubmit_stage",
      "presubmit_failed",
      "flow_v2_gate_failed",
      "flow_command_ack_timeout",
      "correlation_result_unverified",
      "submit_acceptance_unverified",
      "queue_recovery_decision",
      "api_poll_exhausted",
      "api_recovery_required",
      "api_ambiguous_deadline_exhausted",
      "api_ambiguous_local_settled",
      "api_waiting_user_resume",
      "api_captcha_normal_retry",
      "api_normal_error_retry_queued",
      "web_retry_queued",
      "history_recovery_timeout",
      "history_api_receipt",
      "history_api_dispatch",
    ];
    if (diagnosticEvents.includes(event)) {
      const holder = this._phaseRRecord || this;
      if (!holder._historyDebugStages)
        Object.defineProperty(holder, "_historyDebugStages", {
          value: [],
          configurable: true,
        });
      const entry = {
        event,
        sinceItemMs: Math.max(
          0,
          Date.now() - (Number(this.createdAt) || Date.now()),
        ),
      };
      const attempt = String(this.attemptId || this.id || "").slice(0, 8);
      if (/^[A-Za-z0-9_-]{1,8}$/.test(attempt)) entry.attempt = attempt;
      const booleanKeys = [
        "strong",
        "verifiedPartial",
        "success",
        "focused",
        "operationIdAvailable",
        "snapshotPresent",
        "snapshotKeyPresent",
        "refreshAttempted",
        "refreshSucceeded",
        "refreshKeyPresent",
      ];
      const labelKeys = [
        "stage",
        "correlationState",
        "receiptError",
        "visibility",
        "recoveryStage",
        "action",
        "waitKind",
        "accessCode",
        "refreshErrorCode",
      ];
      for (const key of [
        "stage",
        "elapsedMs",
        "strong",
        "verifiedPartial",
        "expectedChildren",
        "actualChildren",
        "correlationState",
        "receiptError",
        "expectedImages",
        "actualImages",
        "expectedVideos",
        "actualVideos",
        "success",
        "visibility",
        "focused",
        "recoveryStage",
        "action",
        "accessCode",
        "refreshErrorCode",
        "snapshotPresent",
        "snapshotKeyPresent",
        "refreshAttempted",
        "refreshSucceeded",
        "refreshKeyPresent",
        "recoveryAttempt",
        "recoveryMaxAttempts",
        "maxRetries",
        "retrySubmitCount",
        "operationIdAvailable",
        "remainingMs",
        "missingOperationCount",
        "missingMediaCount",
        "waitKind",
        "idleMs",
        "pendingRetries",
        "activeMonitors",
      ]) {
        const value = extra[key];
        const valid = booleanKeys.includes(key)
          ? typeof value === "boolean"
          : labelKeys.includes(key)
            ? typeof value === "string" && /^[A-Za-z0-9_:-]{1,120}$/.test(value)
            : Number.isSafeInteger(value) && value >= 0 && value <= 4294967295;
        if (valid) entry[key] = value;
      }
      holder._historyDebugStages.push(entry);
      if (holder._historyDebugStages.length > 8)
        holder._historyDebugStages.shift();
    }
    if (event.startsWith("history_")) return;
    const outputs = Array.isArray(this.outputs) ? this.outputs : [];
    const payload = {
      event,
      attempt: String(this.attemptId || this.id || "").slice(0, 8),
      owner: this._owner || null,
      promptIndex: Number(this.promptIndex) || 0,
      driver: this.genMode === "api" ? this.flowApiDriver || null : null,
      pageDriver: this._flowDriverKey || null,
      mode: this.genMode || null,
      expected: Math.max(1, parseInt(this.settings?.quantity, 10) || 1),
      pendingOwners: Array.isArray(this.pendingOwners)
        ? this.pendingOwners.length
        : 0,
      completed: outputs.filter((output) => output.status === "completed")
        .length,
      failed: outputs.filter((output) => output.status === "failed").length,
      downloaded: outputs.filter(
        (output) => output.downloadStatus === "downloaded",
      ).length,
      identityKinds: [
        ...new Set(
          outputs.map((output) => output.identityKind).filter(Boolean),
        ),
      ],
      correlation: this.flowOperationId
        ? "provider_operation"
        : "dom_observation",
      ...extra,
    };
    const signature = JSON.stringify(payload);
    if (this._attemptAuditSignatures[event] === signature) return;
    this._attemptAuditSignatures[event] = signature;
    if (window.FlowApiTelemetry?.emit) {
      window.FlowApiTelemetry.emit(event, payload, {
        dedupeKey: `item:${this.id}:${event}:${signature}`,
      });
    } else {
      console.log("[FlowAttemptAudit]", JSON.stringify(payload));
    }
  }
  setPendingOwners(ownerIds, status = "processing") {
    const previous = new Map(
      (this.pendingOwners || []).map((owner) => [owner.runtimeId, owner]),
    );
    this.pendingOwners = [...new Set((ownerIds || []).filter(Boolean))].map(
      (runtimeId) => ({
        ...(previous.get(runtimeId) || {}),
        runtimeId,
        status,
        observedAt: previous.get(runtimeId)?.observedAt || Date.now(),
      }),
    );
    this.auditLifecycle("pending_owners_observed", { ownerStatus: status });
  }
  syncCompletedOutputs(resultIds, thumbnails = {}) {
    if (!Array.isArray(this.outputs)) this.outputs = [];
    for (const resultId of [...new Set((resultIds || []).filter(Boolean))]) {
      const info = thumbnails?.[resultId] || {};
      const mediaType =
        info.type || (this.settings?.genType || "").toLowerCase() || null;
      const isFlowV2Video =
        mediaType === "video" &&
        (info.driver_key === "flow_v2" || this._flowDriverKey === "flow_v2");
      const inferredDurableId =
        /^[A-Za-z0-9_-]{32,1024}$/.test(resultId) ||
        (!isFlowV2Video && /^[0-9a-f-]{36}$/i.test(resultId))
          ? resultId
          : null;
      const mediaUuid = info.media_uuid || null;
      const mediaId =
        info.persistent_media_id || info.file_name || inferredDurableId;
      let output = this.outputs.find(
        (entry) =>
          entry.resultId === resultId || (mediaId && entry.mediaId === mediaId),
      );
      let replacesFailedSlot = false;
      if (!output) {
        output =
          this.outputs.find(
            (entry) => entry.status === "failed" && !entry.mediaId,
          ) || null;
        replacesFailedSlot = !!output;
      }
      if (!output) {
        output = { outputIndex: this.outputs.length };
        this.outputs.push(output);
      }
      Object.assign(output, {
        resultId,
        mediaId,
        mediaUuid,
        identityKind:
          info.identity_kind || this._outputIdentityKind(resultId, mediaId),
        correlationConfidence:
          replacesFailedSlot && !this.flowOperationId
            ? "serial_retry_heuristic"
            : "direct_result",
        mediaType,
        apiDriver: info.api_driver || this.flowApiDriver || null,
        protocolRevision:
          info.protocol_revision || this.flowApiProtocolRevision || null,
        protocolFingerprint:
          info.protocol_fingerprint || this.flowApiProtocolFingerprint || null,
        operationId:
          info.operation_uuid ||
          this.flowOperationId ||
          this.operationId ||
          null,
        identityDurability:
          info.identity_durability ||
          (/^[A-Za-z0-9_-]{32,1024}$/.test(String(mediaId || ""))
            ? "durable"
            : isFlowV2Video
              ? "session"
              : null),
        identityAliases: [
          ...new Set(
            [
              ...(Array.isArray(info.identity_aliases)
                ? info.identity_aliases
                : []),
              resultId,
              mediaId,
            ].filter(Boolean),
          ),
        ],
        status: "completed",
        downloadStatus:
          output.status === "failed"
            ? "not_requested"
            : output.downloadStatus || "not_requested",
        thumbnail: info.thumbnail || output.thumbnail || null,
        videoUrl: info.video_url || output.videoUrl || null,
        completedAt: output.completedAt || Date.now(),
      });
    }
    this.auditLifecycle("outputs_completed");
  }
  syncFailedOutputs(ownerIds, error = null) {
    if (!Array.isArray(this.outputs)) this.outputs = [];
    const expectedQuantity = Math.max(
      1,
      parseInt(this.settings?.quantity, 10) || 1,
    );
    for (const runtimeId of [...new Set((ownerIds || []).filter(Boolean))]) {
      if (this.outputs.some((entry) => entry.runtimeOwnerId === runtimeId))
        continue;
      if (this.outputs.length >= expectedQuantity) break;
      this.outputs.push({
        outputIndex: this.outputs.length,
        runtimeOwnerId: runtimeId,
        mediaId: null,
        resultId: null,
        identityKind: "none",
        correlationConfidence: "runtime_owner_only",
        mediaType: (this.settings?.genType || "").toLowerCase() || null,
        status: "failed",
        error,
        downloadStatus: "not_applicable",
        completedAt: Date.now(),
      });
    }
    while (this.outputs.length < expectedQuantity) {
      this.outputs.push({
        outputIndex: this.outputs.length,
        runtimeOwnerId: null,
        mediaId: null,
        resultId: null,
        identityKind: "none",
        correlationConfidence: "synthetic_missing_output",
        mediaType: (this.settings?.genType || "").toLowerCase() || null,
        status: "failed",
        error,
        downloadStatus: "not_applicable",
        completedAt: Date.now(),
      });
    }
    this.auditLifecycle("outputs_failed");
  }
  markOutputDownload(resultId, status, error = null) {
    const output = (this.outputs || []).find(
      (entry) => entry.resultId === resultId || entry.mediaId === resultId,
    );
    if (!output) return false;
    output.downloadStatus = status;
    output.downloadError = error || null;
    output.downloadedAt = status === "downloaded" ? Date.now() : null;
    this.auditLifecycle("download_transition", {
      outputIndex: output.outputIndex,
      downloadStatus: status,
      hasError: !!error,
    });
    return true;
  }
  get isTerminal() {
    return [
      _QueueItem.STATE.COMPLETED,
      _QueueItem.STATE.PARTIAL_FAIL,
      _QueueItem.STATE.FAILED,
      _QueueItem.STATE.CANCELLED,
      _QueueItem.STATE.BLOCKED,
    ].includes(this.state);
  }
  get isActive() {
    return [
      _QueueItem.STATE.SUBMITTING,
      _QueueItem.STATE.SUBMITTED,
      _QueueItem.STATE.MONITORING,
      _QueueItem.STATE.RETRY_SUBMIT,
      _QueueItem.STATE.WAITING_PROVIDER,
      _QueueItem.STATE.RECOVERY_REQUIRED,
    ].includes(this.state);
  }
};
__publicField(_QueueItem, "STATE", {
  PENDING: "PENDING",
  WAITING_DEPENDENCY: "WAITING_DEPENDENCY",
  BLOCKED: "BLOCKED",
  SUBMITTING: "SUBMITTING",
  WAITING_USER: "WAITING_USER",
  WAITING_PROVIDER: "WAITING_PROVIDER",
  RECOVERY_REQUIRED: "RECOVERY_REQUIRED",
  SUBMITTED: "SUBMITTED",
  MONITORING: "MONITORING",
  RETRY_SUBMIT: "RETRY_SUBMIT",
  COMPLETED: "COMPLETED",
  PARTIAL_FAIL: "PARTIAL_FAIL",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
});
let QueueItem = _QueueItem;
if (typeof window !== "undefined") window.QueueItem = QueueItem;
