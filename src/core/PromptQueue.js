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
const _PromptQueue = class _PromptQueue {
  _recordHistoryDiagnostic(
    job,
    event,
    item = null,
    reason = null,
    recoveryMode = null,
  ) {
    if (!job) return;
    const token = (value) =>
      typeof value === "string" && /^[A-Za-z0-9_:-]{1,120}$/.test(value)
        ? value
        : null;
    const items = job.items || [];
    const entry = {
      event: token(event),
      elapsedMs: Math.max(
        0,
        Date.now() - (Number(job.createdAt) || Date.now()),
      ),
      stateBefore: token(job.state),
      reason: token(reason),
      promptIndex: Number.isInteger(item?.promptIndex)
        ? item.promptIndex
        : null,
      mode: ["web", "api"].includes(item?.genMode) ? item.genMode : null,
      recoveryMode: ["normal_error", "pause_resume", "stop_batch"].includes(
        recoveryMode,
      )
        ? recoveryMode
        : null,
      total: items.length,
      terminal: items.filter((value) => value.isTerminal).length,
      apiDispatchStarted: items.filter(
        (value) => value._apiDispatchStarted === true,
      ).length,
      apiAccepted: items.filter(
        (value) =>
          value.flowApiAccepted === true &&
          !!(
            value.operationId ||
            value.flowOperationId ||
            value.flowApiLineage?.some((edge) => edge?.operationId)
          ),
      ).length,
    };
    if (item?.id)
      Object.defineProperty(entry, "_itemId", {
        value: item._phaseR?.originalId || item.id,
      });
    if (
      item &&
      !job._historyFirstError &&
      [
        "web_rejection",
        "item_failed",
        "api_bot_gate",
        "api_bot_settle",
        "quota_gate",
      ].includes(event)
    ) {
      job._historyFirstError = entry;
    }
    if (
      !job._historyFirstDecision &&
      ["pause", "quota_gate", "dispatch_blocked", "stop"].includes(event)
    ) {
      job._historyFirstDecision = entry;
    }
    job._historyDiagnosticEvents || (job._historyDiagnosticEvents = []);
    job._historyDiagnosticEvents.push(entry);
    if (job._historyDiagnosticEvents.length > 40) {
      job._historyDiagnosticEvents.shift();
      job._historyDiagnosticDropped = (job._historyDiagnosticDropped || 0) + 1;
    }
  }
  _historyErrorDetails(items = []) {
    const current = items
      .filter((item) => {
        if (!item.error || item.error === "FLOW_RECOVERY_QUEUED") return false;
        if (
          item.state === QueueItem.STATE.CANCELLED &&
          item._quotaCancellationOnly &&
          !item.errorPolicy &&
          !item.flowApiFailureDetail
        )
          return false;
        const policy = item.errorPolicy || item.flowApiFailureDetail || {};
        return (policy.code || item.error) !== "ABORTED";
      })
      .slice(0, 100)
      .map((item) => {
        const policy = item.errorPolicy || item.flowApiFailureDetail || {};
        const driver = policy.driver || item.flowApiDriver;
        const isApiFailure = ["v1", "v2"].includes(driver);
        const lineageCheck = isApiFailure
          ? window.FlowApiDriverError?.safeLineageCheck?.({
              diagnostic: policy,
            })
          : null;
        return {
          promptIndex: Number.isInteger(item.promptIndex)
            ? item.promptIndex
            : null,
          code: String(policy.code || item.error).slice(0, 255),
          recoveryCause:
            typeof policy.recoveryCause === "string"
              ? policy.recoveryCause.slice(0, 120)
              : typeof item._phaseRRecord?.recoveryTimeoutCause === "string"
                ? item._phaseRRecord.recoveryTimeoutCause.slice(0, 120)
                : null,
          grpcCode: Number.isInteger(policy.grpcCode) ? policy.grpcCode : null,
          grpcReason:
            typeof policy.grpcReason === "string"
              ? policy.grpcReason.slice(0, 120)
              : null,
          providerErrorCodes: (Array.isArray(policy.providerErrorCodes)
            ? policy.providerErrorCodes
            : []
          )
            .filter(
              (value) =>
                typeof value === "string" &&
                /^PUBLIC_ERROR_[A-Z0-9_]{1,107}$/.test(value),
            )
            .slice(0, 8),
          driver: isApiFailure ? driver : null,
          ...(isApiFailure
            ? {
                ...(lineageCheck ? { lineageCheck } : {}),
                ...window.FlowApiDriverError?.safeLineageReference?.({
                  diagnostic: policy,
                }),
                ...([
                  "pre_dispatch",
                  "receipt",
                  "ambiguous",
                  "accepted_poll",
                  "terminal",
                ].includes(policy.stage)
                  ? { apiStage: policy.stage }
                  : {}),
              }
            : {}),
          ...(policy.failureDetails?.length
            ? {
                failureDetails:
                  window.FlowApiDriverError.sanitizeFailureDetails(
                    policy.failureDetails,
                  ),
              }
            : {}),
        };
      });
    const held = items
      .flatMap((item) =>
        Array.isArray(item._apiHeldHistoryErrorDetails)
          ? item._apiHeldHistoryErrorDetails.slice(0, 100)
          : [],
      )
      .filter((detail) => detail?.code !== "ABORTED");
    const retried = items
      .filter((item) => item.state !== QueueItem.STATE.COMPLETED)
      .flatMap((item) =>
        Array.isArray(item._apiNormalRetryErrorDetails)
          ? item._apiNormalRetryErrorDetails.slice(0, 100)
          : [],
      );
    return [
      ...new Map(
        [...held, ...retried, ...current].map((detail) => [
          JSON.stringify(detail),
          detail,
        ]),
      ).values(),
    ].slice(0, 100);
  }
  _historyApiVersions(items = []) {
    return [
      ...new Set(
        items
          .filter((item) => item.genMode !== "web")
          .flatMap((item) => {
            const confirmed = [
              item.flowApiDriver,
              item.errorPolicy?.driver,
              ...Object.values(item.resultProviderUrls || {}).map(
                (value) => value?.api_driver,
              ),
            ].filter((value) => value === "v1" || value === "v2");
            return confirmed.length > 0
              ? confirmed
              : (Array.isArray(item.flowApiAttemptedDrivers)
                  ? item.flowApiAttemptedDrivers
                  : []
                ).filter((value) => value === "v1" || value === "v2");
          }),
      ),
    ];
  }
  _historyRefFileIds(items = []) {
    return [
      ...new Set(
        items
          .flatMap((item) =>
            Array.isArray(item?.refFileIds) ? item.refFileIds : [],
          )
          .map((value) => String(value || "").trim())
          .filter(Boolean),
      ),
    ];
  }
  _historyDurationMs(items = []) {
    const starts = items
      .map((item) => Number(item.createdAt))
      .filter((value) => Number.isFinite(value) && value > 0);
    const ends = items
      .map((item) => Number(item.completedAt))
      .filter((value) => Number.isFinite(value) && value > 0);
    return starts.length && ends.length
      ? Math.max(0, Math.max(...ends) - Math.min(...starts))
      : null;
  }
  _historyTaskResults(items = []) {
    const ids = [
      ...new Set(
        items
          .flatMap((item) =>
            Array.isArray(item?.resultTileIds) ? item.resultTileIds : [],
          )
          .map((value) => String(value || "").trim())
          .filter(Boolean),
      ),
    ];
    const idSet = new Set(ids);
    const thumbnails = {};
    const fileNames = {};
    const providerUrls = {};
    for (const item of items) {
      for (const id of ids) {
        if (!item?.resultTileIds?.includes(id)) continue;
        if (item.resultThumbnails?.[id] != null)
          thumbnails[id] = item.resultThumbnails[id];
        if (item.resultFileNames?.[id] != null)
          fileNames[id] = item.resultFileNames[id];
        if (item.resultProviderUrls?.[id] != null)
          providerUrls[id] = item.resultProviderUrls[id];
      }
      for (const [key, value] of Object.entries(
        item?.resultProviderUrls || {},
      )) {
        const belongsToCurrentRun =
          idSet.has(key) ||
          ids.some((id) => item?.resultFileNames?.[id] === key);
        if (belongsToCurrentRun) providerUrls[key] = value;
      }
    }
    return { ids, thumbnails, fileNames, providerUrls };
  }
  _historyDiagnostics(job, items) {
    const states = {
      total: items.length,
      completed: 0,
      failed: 0,
      partial: 0,
      cancelled: 0,
      blocked: 0,
      unfinished: 0,
    };
    const failures = [];
    let failedPromptCount = 0;
    for (const item of items) {
      const stateKey = {
        COMPLETED: "completed",
        FAILED: "failed",
        PARTIAL_FAIL: "partial",
        CANCELLED: "cancelled",
        BLOCKED: "blocked",
      }[item.state];
      states[stateKey || "unfinished"]++;
      const hasError =
        [
          item.error,
          item.errorPolicy?.code,
          item.flowApiFailureDetail?.code,
        ].some(
          (code) => code && !["ABORTED", "FLOW_RECOVERY_QUEUED"].includes(code),
        ) ||
        item._apiHeldHistoryErrorDetails?.length ||
        item._apiNormalRetryErrorDetails?.length;
      const failed =
        ["FAILED", "PARTIAL_FAIL"].includes(item.state) ||
        (item.state !== "COMPLETED" &&
          hasError &&
          (!item._quotaCancellationOnly ||
            item._apiHeldHistoryErrorDetails?.length ||
            item._apiNormalRetryErrorDetails?.length));
      if (!failed) continue;
      failedPromptCount++;
      if (failures.length >= 20) continue;
      const stages = [
        ...(item._historyDebugStages || []),
        ...(item._phaseRRecord?._historyDebugStages || []),
      ].slice(-8);
      failures.push({
        promptIndex: Number.isInteger(item.promptIndex)
          ? item.promptIndex
          : null,
        state: item.state,
        mode: ["web", "api"].includes(item.genMode) ? item.genMode : null,
        retrySubmitCount: Math.max(
          item.retrySubmitCount || 0,
          (item._phaseRRecord?.attempts?.length || 1) - 1,
        ),
        operationIdAvailable: !!(item.operationId || item.flowOperationId),
        stages: stages.map((stage) => ({ ...stage })),
      });
    }
    const itemIds = new Set(items.map((item) => item.id));
    const relevant = (event) => !event._itemId || itemIds.has(event._itemId);
    const first = job._historyFirstError;
    const decision = job._historyFirstDecision;
    return {
      version: 2,
      summary: states,
      failedPromptCount,
      omittedFailedPrompts: Math.max(0, failedPromptCount - failures.length),
      firstDecision: decision && relevant(decision) ? { ...decision } : null,
      failures,
      firstError: first && relevant(first) ? { ...first } : null,
      droppedEvents: job._historyDiagnosticDropped || 0,
      events: (job._historyDiagnosticEvents || [])
        .filter(relevant)
        .map((event) => ({ ...event })),
    };
  }
  _historyRoute(items = []) {
    const modes = new Set(
      items
        .map((item) => item.genMode)
        .filter((mode) => mode === "api" || mode === "web"),
    );
    const initialModes = new Set(
      items
        .map((item) => item._historyInitialGenMode)
        .filter((mode) => mode === "api" || mode === "web"),
    );
    const fallback = items.find(
      (item) => item.genMode === "web" && item._historyInitialGenMode === "api",
    );
    const jobIds = [
      ...new Set(items.map((item) => item.jobId).filter(Boolean)),
    ];
    const job = jobIds.length === 1 ? this._jobs?.get(jobIds[0]) : null;
    return {
      ...(job ? { diagnostics: this._historyDiagnostics(job, items) } : {}),
      genMode: modes.size === 1 ? [...modes][0] : null,
      initialGenMode: initialModes.size === 1 ? [...initialModes][0] : null,
      fallbackReason: fallback?._flowApiPreflightReason || null,
    };
  }
  _commitFlowJobRoute(job, mode, reason = null) {
    if (!job || !["api", "web"].includes(mode)) return false;
    if (job._flowApiEngineLock && job._flowApiEngineLock !== mode) {
      console.error(
        "[FlowApiRouting/BatchModeConflict]",
        JSON.stringify({
          jobId: job.id || null,
          locked: job._flowApiEngineLock,
          requested: mode,
          reason: reason || null,
        }),
      );
      return false;
    }
    const newlyCommitted = !job._flowApiEngineLock;
    job._flowApiEngineLock = mode;
    job._flowApiRouteReason ||
      (job._flowApiRouteReason =
        reason ||
        (mode === "api" ? "API_DISPATCH_COMMITTED" : "WEB_ROUTE_COMMITTED"));
    job._flowApiRouteCommittedAt || (job._flowApiRouteCommittedAt = Date.now());
    if (mode === "web") {
      job._flowApiWebReason ||
        (job._flowApiWebReason = reason || "WEB_ROUTE_COMMITTED");
      for (const item of job.items || []) {
        item._requireFlowApiChain = false;
        item._forceWebChain = true;
        item._flowApiPreflightReason ||
          (item._flowApiPreflightReason = job._flowApiWebReason);
      }
    }
    if (newlyCommitted) {
      window.FlowApiTelemetry?.emit?.(
        "batch_route_committed",
        {
          jobId: job.id || null,
          owner: job.owner || null,
          mode,
          reason: job._flowApiRouteReason,
          prompts: job.items?.length || 0,
        },
        { dedupeKey: `batch_route_committed:${job.id || "unknown"}` },
      );
    }
    return true;
  }
  _jobExecutionMode(job) {
    if (["api", "web"].includes(job?._flowApiEngineLock))
      return job._flowApiEngineLock;
    const modes = new Set(
      (job?.items || [])
        .map((item) => item.genMode || item._historyInitialGenMode)
        .filter((mode) => mode === "api" || mode === "web"),
    );
    return modes.has("api") && modes.has("web")
      ? "mixed"
      : modes.has("api")
        ? "api"
        : "web";
  }
  _itemExecutionMode(job, item) {
    return (
      item?.genMode ||
      (["api", "web"].includes(job?._flowApiEngineLock)
        ? job._flowApiEngineLock
        : item?._historyInitialGenMode) ||
      null
    );
  }
  _lockDeterministicWebComponents(job, candidates = job?.items || []) {
    if (!job || job._flowApiEngineLock === "api" || job.chain) return false;
    const hasWebComponent = (candidates || []).some(
      (candidate) =>
        candidate?.settings?.isFrames !== true &&
        (candidate?.settings?.voice?.search_value ||
          candidate?.settings?.character?.search_value ||
          window.MentionParser?.hasComponents?.(candidate?.prompt || "")),
    );
    if (!hasWebComponent) return false;
    this._commitFlowJobRoute(job, "web", "FLOW_API_COMPONENT_WEB_ONLY");
    for (const item of job.items || []) {
      item._historyInitialGenMode = "web";
    }
    return true;
  }
  static getInstance() {
    if (!this._instance) {
      this._instance = new _PromptQueue();
    }
    return this._instance;
  }
  static isEnabled() {
    if (
      window.featureGate &&
      !window.featureGate.canUse("pipeline_queue_enabled")
    ) {
      return false;
    }
    const settings = window.storageSettings?.getSettings?.();
    return (
      settings?.queueEnabled === true ||
      settings?.queueEnabled === "1" ||
      settings?.queueEnabled === 1
    );
  }
  constructor() {
    this._jobs = new Map();
    this._itemQueue = [];
    this._apiDeferredQueueSequence = 0;
    this._webRetryMaxRetries = 2;
    this._isRunning = false;
    this._startedAt = null;
    this._persistQueues = new Map();
    this._downloadQueue = [];
    this._downloadedTileIds = new Set();
    this._downloadCompletedCount = 0;
    this._downloadHistory = [];
    this._currentDownloadItem = null;
    this._lastDownloadSettledAt = 0;
    this._editorExecutor = new EditorExecutor();
    this._tileMonitor = new TileMonitor();
    this._editorExecutor.setup({
      queue: this,
      onItemSubmitted: (item) => this._onItemSubmitted(item),
      onItemCompleted: (item) => this._onItemCompleted(item),
      onRunLoopFinished: () => this._onRunLoopFinished(),
      hasActiveMonitoring: () =>
        this._tileMonitor.activeCount > 0 ||
        window.FlowApiAdapter?.hasInFlight?.() === true ||
        this._hasPendingAmbiguousApiRecovery(),
    });
    this._webRecovery = new window.FlowWebRecovery(this);
    this._tileMonitor.setup({
      queue: this,
      onItemCompleted: (item) => this._onItemCompleted(item),
      onTilesReady: (item, tileIds) => this._onTilesReady(item, tileIds),
    });
    window.eventBus?.on("queue:stop_all", (data = {}) =>
      this.stopAll({
        stopOrigin: data.stopOrigin || null,
        stopReason: data.stopReason || null,
        stopSource: data.stopSource || null,
      }),
    );
    window.eventBus?.on("i18n:changed", () => this._emitStateChanged());
    window.eventBus?.on("queue:stop_job", (data = {}) =>
      this.stopJob(data.jobId, {
        stopOrigin: data.stopOrigin || null,
        stopReason: data.stopReason || null,
        stopSource: data.stopSource || null,
      }),
    );
    window.eventBus?.on("queue:pause_job", (data) => this.pauseJob(data.jobId));
    window.eventBus?.on("queue:resume_job", (data) =>
      this.resumeJob(data.jobId),
    );
    window.eventBus?.on("queue:regen_item", (data) =>
      this.regenItem(data || {}),
    );
    window.eventBus?.on("flow:error_classified", (data) =>
      this._handleFlowError(data),
    );
    window.eventBus?.on("captcha:userAction", (data) =>
      this._onCaptchaUserAction(data),
    );
    this._reloadPromptCounter = 0;
    this._reloadPromptTabId = null;
    this._reloadSuppressCount = 0;
    setTimeout(() => {
      window.FlowApiAdapter?.recoverCheckpoints?.().catch?.((e) =>
        console.warn(
          "[PromptQueue] V1 checkpoint recovery failed:",
          e?.message,
        ),
      );
      window.FlowApiV2CheckpointStore?.recoverCheckpoints?.().catch?.((e) =>
        console.warn(
          "[PromptQueue] V2 checkpoint recovery failed:",
          e?.message,
        ),
      );
    }, 2e3);
    this._pendingApiRefresh = false;
    this._apiRefreshDeferCount = 0;
    this._forceReloadPromise = null;
    this._webRetryBatchTailSequence = 0;
    this._stagnationWatchdog = null;
    this._chunkDraining = false;
    this._completedChunks = 0;
    this._lastEmitTime = 0;
    this._emitScheduled = false;
    this._broadcastThrottleTimer = null;
    this._pendingSnapshot = null;
    this._trackerSessionId = crypto.randomUUID();
    this._blockerRunId = crypto.randomUUID();
    this._releasedFlowBlockerRunIds = new Set();
    chrome.tabs?.onUpdated?.addListener((tabId, change, tab) => {
      if (change.status === "loading")
        this._resetFlowChunkCounterForTabReload(tabId);
      if (change.status === "loading")
        this._webRecovery
          ?.handleTabReload(tabId, change, tab)
          .catch((error) => {
            console.error("[FlowRecovery] reload interruption failed", error);
          });
    });
  }
  async submitJob(request) {
    const admissionControl = {
      stopEpoch: this._stopEpoch || 0,
      signal:
        request.abortSignal ||
        (request.owner === "workflow"
          ? window.workflowExecutor?._flowAdmissionAbortController?.signal
          : null),
    };
    await this._waitForAdmissionReload(admissionControl);
    await this._webRecovery?.assertCanAdmit?.();
    const prunedRecoveryRecords =
      (await this._webRecovery?.pruneSettled?.()) || 0;
    console.info(
      "[FlowRecoveryJournal] before_submit " +
        JSON.stringify({
          owner: request.owner || null,
          regen: request.isRegen === true,
          removed: prunedRecoveryRecords,
          retained: this._webRecovery?.records?.size ?? 0,
        }),
    );
    const {
      owner,
      label,
      prompts,
      settings,
      refFileIds,
      refFileNames,
      refThumbnails,
      refImageMode,
      mentionData,
      refFileIdsPerPrompt,
      refImagesPerPrompt,
      autoDownload,
      taskId,
      downloadResolution,
      videoDownloadResolution,
      sequentialMode,
      voice,
      character,
      keepCompleted,
      regenOf,
      regenOfPerPrompt,
      promptIndexBase,
      promptIndices,
      itemIds,
      chain,
      projectId,
      resolvedRefFileIdsPerPrompt,
      refImageModesPerPrompt,
    } = request;
    const jobSequentialMode =
      sequentialMode !== void 0 ? !!sequentialMode : false;
    const ownerActionMap = {
      prompts: "generate",
      task: "task_run",
      workflow: "workflow_run",
      angles: "angles_run",
      effects: "effects_run",
    };
    if (
      !window.ExecutionGate?.request ||
      !window.ExecutionGate?.claimQueueAdmission
    ) {
      throw new Error("EXECUTION_AUTHORIZATION_UNAVAILABLE");
    }
    let executionToken = request._executionToken || null;
    if (
      owner === "workflow" &&
      request._executionTokenManagedByCaller === true &&
      !executionToken
    ) {
      throw new Error("WORKFLOW_EXECUTION_TOKEN_MISSING");
    }
    if (!executionToken && window.ExecutionGate) {
      try {
        const action = ownerActionMap[owner] || "generate";
        const gate = await ExecutionGate.request(action, prompts.length, {
          owner,
          label,
          provider: "flow",
        });
        if (!gate.allowed || !gate.token) {
          if (owner !== "telegram" && owner !== "mcp") {
            const moduleNames = {
              prompts: "Generate",
              task: "Task",
              workflow: "Workflow",
              angles: "Angles",
              effects: "Effects",
            };
            ExecutionGate.showDeniedDialog(gate, moduleNames[owner] || "");
          }
          return {
            completed: 0,
            failed: prompts.length,
            stopped: false,
            reason: gate.reason,
          };
        }
        executionToken = gate.token;
      } catch (e) {
        if (window.QuotaErrorHandler?.isQuotaError(e)) {
          console.warn(
            "[PromptQueue] ExecutionGate denied:",
            e.code || e.reason,
          );
          if (owner !== "telegram" && owner !== "mcp") {
            const moduleNames = {
              prompts: "Generate",
              task: "Task",
              workflow: "Workflow",
              angles: "Angles",
              effects: "Effects",
            };
            window.QuotaErrorHandler.showDialog(e, moduleNames[owner] || "");
          }
          return {
            completed: 0,
            failed: prompts.length,
            stopped: false,
            reason: e.code || e.reason,
          };
        }
        console.warn(
          "[PromptQueue] ExecutionGate request failed, blocking:",
          e.message,
        );
        throw e;
      }
    }
    ExecutionGate.claimQueueAdmission(
      executionToken,
      ownerActionMap[owner] || "generate",
      prompts.length,
    );
    if (!keepCompleted && !this._isRunning)
      this._trackerSessionId = crypto.randomUUID();
    if (!keepCompleted) this._clearCompletedJobs();
    MessageBridge.sendToContentScript("pq:clearRetryTracking").catch(() => {});
    const job = new Job({ owner, label });
    if (!this._hasGenerationWork()) this._blockerRunId = crypto.randomUUID();
    const completion = new Promise((resolve) => {
      job._resolve = resolve;
    });
    job._admissionPending = true;
    let targetFlowContext = null;
    try {
      targetFlowContext = await window.MessageBridge?.getLiveTargetContext?.();
    } catch (_) {}
    job._executionToken = executionToken;
    job._executionTokenManagedByCaller =
      !!request._executionToken &&
      request._executionTokenManagedByCaller === true;
    job._trackerSessionId = this._trackerSessionId;
    job._blockerRunId = this._blockerRunId;
    job.settings = settings ? { ...settings } : null;
    job.projectId =
      projectId ||
      targetFlowContext?.projectId ||
      window._currentProjectId ||
      null;
    job.chain =
      (owner === "prompts" || owner === "mcp") && chain?.enabled === true
        ? {
            enabled: true,
            kind: chain.kind,
            engine: chain.engine === "web" ? "web" : "api",
            allowWebFallback: chain.allowWebFallback === true,
            refPolicy:
              chain.refPolicy === "generated_plus_mapped"
                ? "generated_plus_mapped"
                : "generated_only",
            onFailure: "stop",
            currentItemId: null,
          }
        : null;
    job.totalExpected = prompts.length;
    job.flowDriverKey = targetFlowContext?.driverKey || null;
    job.flowTabId = targetFlowContext?.tabId || null;
    job.flowCompactLayout = targetFlowContext?.compactLayout ?? null;
    job.requestedSequentialMode = jobSequentialMode;
    job.workflowId = request.workflowId || null;
    job.workflowNodeId =
      owner === "workflow" ? request.phaseRNodeId || null : null;
    job.workflowNodeName =
      owner === "workflow" ? request.phaseRContext?.nodeName || null : null;
    job.workflowRunId = request.workflowRunId || null;
    job.singleNodeSession = request.singleNodeSession === true;
    job.regenDisplay =
      request.regenDisplay && typeof request.regenDisplay === "object"
        ? {
            jobId: String(request.regenDisplay.jobId || ""),
            sessionId: String(request.regenDisplay.sessionId || ""),
            label: String(request.regenDisplay.label || ""),
            owner: String(request.regenDisplay.owner || ""),
            startedAt: Number(request.regenDisplay.startedAt) || null,
          }
        : null;
    job._onRefReuploaded =
      typeof request.onRefReuploaded === "function"
        ? request.onRefReuploaded
        : null;
    job._onBeforeWorkflowItemStart =
      owner === "workflow" &&
      typeof request.onBeforeWorkflowItemStart === "function"
        ? request.onBeforeWorkflowItemStart
        : null;
    job._onResultsReady =
      typeof request.onResultsReady === "function"
        ? request.onResultsReady
        : null;
    job._onGenerationComplete =
      typeof request.onGenerationComplete === "function"
        ? request.onGenerationComplete
        : null;
    if (owner === "workflow" && request.webRecoveryPolicy)
      job._webRecoveryPolicy = { ...request.webRecoveryPolicy };
    job.forcedV2WebSequential = false;
    job.sequentialMode = job.chain ? true : jobSequentialMode;
    job._autoDownload =
      autoDownload !== void 0 ? autoDownload : this._readAutoDownload();
    try {
      await this._waitForAdmissionReload(admissionControl);
    } catch (error) {
      if (executionToken && !job._executionTokenManagedByCaller) {
        window.ExecutionGate?.cancel?.(executionToken)?.catch?.(() => {});
      }
      throw error;
    }
    this._jobs.set(job.id, job);
    for (let i = 0; i < prompts.length; i++) {
      const itemSettings = settings ? { ...settings } : {};
      if (request.phaseRContext)
        itemSettings.workflowContext = { ...request.phaseRContext };
      if (voice && voice.search_value) {
        itemSettings.voice = voice;
      }
      if (character && character.search_value) {
        itemSettings.character = character;
      }
      const item = new QueueItem({
        id: Array.isArray(itemIds) ? itemIds[i] : null,
        jobId: job.id,
        prompt: prompts[i],
        promptIndex:
          Array.isArray(promptIndices) &&
          Number.isFinite(Number(promptIndices[i]))
            ? Number(promptIndices[i])
            : (promptIndexBase ?? 0) + i,
        settings: Object.keys(itemSettings).length ? itemSettings : null,
        refFileIds: Array.isArray(resolvedRefFileIdsPerPrompt?.[i])
          ? [...new Set(resolvedRefFileIdsPerPrompt[i].filter(Boolean))]
          : this._resolveRefForIndex(
              refFileIds,
              refFileIdsPerPrompt,
              refImageMode,
              i,
              refImagesPerPrompt,
            ),
        refFileNames: refFileNames || {},
        refThumbnails: refThumbnails || {},
        refImageMode: refImageModesPerPrompt?.[i] || refImageMode || "none",
        mentionData: mentionData?.[i] || null,
      });
      item.projectId = job.projectId;
      item._owner = owner;
      item._flowDriverKey = job.flowDriverKey;
      item._flowCompactLayout = job.flowCompactLayout;
      if (job.chain) {
        item._requireFlowApiChain = job.chain.engine === "api";
        item._forceWebChain = job.chain.engine === "web";
        item._mappedRefFileIds = [...item.refFileIds];
        item._mappedRefFileNames = { ...item.refFileNames };
        item._mappedRefThumbnails = { ...item.refThumbnails };
        item.dependency = {
          previousItemId: i > 0 ? job.items[i - 1]?.id || null : null,
          state: i === 0 ? "ready" : "waiting",
          resolvedRefFileIds: [],
          errorCode: null,
        };
        if (i > 0) item.state = QueueItem.STATE.WAITING_DEPENDENCY;
        if (chain.kind === "video_last_frame" && i < prompts.length - 1)
          item._wantsLastFrame = true;
      }
      item._historyInitialGenMode = this._editorExecutor?._isFlowApiMode
        ? this._editorExecutor._isFlowApiMode(item)
          ? "api"
          : "web"
        : null;
      if (taskId) {
        item._taskId = taskId;
        item._autoDownload = autoDownload;
      }
      if (downloadResolution !== void 0) {
        item._downloadResolution = downloadResolution || null;
      }
      if (videoDownloadResolution !== void 0) {
        item._videoDownloadResolution = videoDownloadResolution || null;
      }
      if (request.taskName) {
        item._taskName = request.taskName;
      }
      const itemRegenOf = regenOfPerPrompt?.[i] || regenOf;
      if (itemRegenOf) {
        item._regenOf = itemRegenOf;
      }
      if (request.isRegen === true) item._isRegen = true;
      job.items.push(item);
      if (job.chain && i === 0) job.chain.currentItemId = item.id;
      this._itemQueue.push(item);
    }
    this._lockDeterministicWebComponents(job);
    if (
      job.flowDriverKey === "flow_v2" &&
      job.items.some((item) => !this._editorExecutor?._isFlowApiMode?.(item))
    ) {
      try {
        await window.flowV2CorrelationBroker?.refreshRunGate?.();
      } catch (_) {}
    }
    if (
      !job.chain &&
      !job.sequentialMode &&
      job.flowDriverKey === "flow_v2" &&
      prompts.length > 1
    ) {
      const hasWebItem = job.items.some(
        (item) => !this._editorExecutor?._isFlowApiMode?.(item),
      );
      const allWebParallelEligible =
        hasWebItem &&
        job.items
          .filter((item) => !this._editorExecutor?._isFlowApiMode?.(item))
          .every(
            (item) =>
              window.flowV2CorrelationBroker?.itemCapability?.(item)
                ?.parallel === true,
          );
      job.sequentialMode = hasWebItem && !allWebParallelEligible;
      job.forcedV2WebSequential = job.sequentialMode;
      console.log(
        `[PromptQueue] Flow V2 batch mode: ${job.sequentialMode ? "sequential (correlation fail-closed)" : hasWebItem ? "parallel (strong-correlation rollout)" : "parallel (API-only)"}`,
      );
      if (job.sequentialMode) {
        try {
          if (typeof sendLog === "function") {
            sendLog(
              "Flow V2 Web: chuy\u1EC3n batch sang tu\u1EA7n t\u1EF1 \u0111\u1EC3 gh\xE9p \u0111\xFAng t\u1EEBng prompt v\u1EDBi k\u1EBFt qu\u1EA3 (Flow V2 kh\xF4ng cung c\u1EA5p request ID trong DOM).",
              "warn",
            );
          }
        } catch (_) {}
      }
    }
    window.FlowApiTelemetry?.emit?.(
      "job_admitted",
      {
        jobId: job.id || null,
        owner,
        prompts: job.items.length,
        expectedOutputs: job.items.reduce(
          (sum, item) =>
            sum + Math.max(1, parseInt(item.settings?.quantity, 10) || 1),
          0,
        ),
        driver: job.items.some((item) =>
          this._editorExecutor?._isFlowApiMode?.(item),
        )
          ? job.flowDriverKey || null
          : null,
        pageDriver: job.flowDriverKey || null,
        mode: this._jobExecutionMode(job),
        compactLayout: job.flowCompactLayout,
        effectiveRunMode: job.sequentialMode ? "sequential" : "parallel",
        forcedV2WebSequential: job.forcedV2WebSequential === true,
        apiItems: job.items.filter((item) =>
          this._editorExecutor?._isFlowApiMode?.(item),
        ).length,
        webItems: job.items.filter(
          (item) => !this._editorExecutor?._isFlowApiMode?.(item),
        ).length,
        autoDownload: job._autoDownload === true,
      },
      { dedupeKey: `job_admitted:${job.id}` },
    );
    this._sortQueue();
    try {
      request.onWorkflowItemAdmitted?.({
        jobId: job.id,
        itemIds: job.items.map((item) => item.id),
      });
    } catch (error) {
      console.warn(
        "[PromptQueue] workflow admission callback failed:",
        error?.message || error,
      );
    }
    let apiSubmitDelayMs = null;
    let queueMaxMonitor = null;
    try {
      await window.ExecutionConfig?.getConfig?.();
      const delaySec = Number(
        window.ExecutionConfig?.getDelayBetweenPromptsSec?.(),
      );
      if (Number.isFinite(delaySec) && delaySec >= 0)
        apiSubmitDelayMs = delaySec * 1e3;
      const maxMonitor = Number(window.ExecutionConfig?.getQueueMaxMonitor?.());
      if (Number.isFinite(maxMonitor) && maxMonitor > 0)
        queueMaxMonitor = maxMonitor;
    } catch (_) {}
    if (apiSubmitDelayMs !== null) {
      for (const item of job.items) {
        item.settings = { ...(item.settings || {}), apiSubmitDelayMs };
      }
    }
    console.info(
      "[PromptQueue] Flow submit policy " +
        JSON.stringify({
          jobId: job.id || null,
          owner,
          promptCount: job.items.length,
          apiSubmitDelayMs,
          queueMaxMonitor,
        }),
    );
    this._readSettings();
    await this._webRecovery?.admitJob(job);
    this._joinSingleNodeWebWindow(job);
    job._admissionPending = false;
    if (request?.phaseRNodeId != null) {
      if (
        this._phaseRWorkflowAdmitting?.has(request.phaseRNodeId) &&
        this._webRecovery?.windowMembers
      ) {
        for (const item of job.items)
          this._webRecovery.windowMembers.add(item.id);
      }
      this._phaseRWorkflowAdmitting?.delete(request.phaseRNodeId);
    }
    this._ensureRunning();
    this._emitStateChanged();
    request.onQueueAdmitted?.({
      ok: true,
      jobId: job.id,
      itemIds: job.items.map((item) => item.id),
    });
    return completion;
  }
  async submitTaskBatch(tasks, mode, settingsPerTask, options = {}) {
    const admissionControl = {
      stopEpoch: this._stopEpoch || 0,
      signal:
        options.abortSignal ||
        (options.owner === "workflow"
          ? window.workflowExecutor?._flowAdmissionAbortController?.signal
          : null),
    };
    await this._waitForAdmissionReload(admissionControl);
    await this._webRecovery?.assertCanAdmit?.();
    if (
      !window.ExecutionGate?.request ||
      !window.ExecutionGate?.claimQueueAdmission
    ) {
      throw new Error("EXECUTION_AUTHORIZATION_UNAVAILABLE");
    }
    const totalAdmissionPrompts = tasks.reduce(
      (sum, task) =>
        sum +
        (task.multi_prompt && task.prompts?.length > 1
          ? task.prompts.length
          : 1),
      0,
    );
    let executionToken = options._executionToken || null;
    if (!executionToken && window.ExecutionGate) {
      try {
        const totalPrompts = tasks.reduce(
          (sum, t) =>
            sum +
            (t.multi_prompt && t.prompts?.length > 1 ? t.prompts.length : 1),
          0,
        );
        const _uniqProviders = new Set(tasks.map((t) => t.provider || "flow"));
        const _batchProvider =
          _uniqProviders.size === 1 ? [..._uniqProviders][0] : null;
        const _batchRefCount = tasks.reduce(
          (sum, task) =>
            sum +
            String(task.ref_file_ids || "")
              .split(",")
              .map((id) => id.trim())
              .filter(Boolean).length,
          0,
        );
        const gate = await ExecutionGate.request("task_run", totalPrompts, {
          owner: "task",
          label: "Task batch",
          provider: _batchProvider,
          has_ref: _batchRefCount > 0,
          ref_count: _batchRefCount,
        });
        if (!gate.allowed || !gate.token) {
          ExecutionGate.showDeniedDialog(gate, "Task");
          return {
            completed: 0,
            failed: totalPrompts,
            stopped: false,
            reason: gate.reason,
          };
        }
        executionToken = gate.token;
      } catch (e) {
        if (window.QuotaErrorHandler?.handleIfQuotaError(e, "Task")) {
          console.warn(
            "[PromptQueue] ExecutionGate batch denied:",
            e.code || e.reason,
          );
          const totalPrompts = tasks.reduce(
            (sum, t) =>
              sum +
              (t.multi_prompt && t.prompts?.length > 1 ? t.prompts.length : 1),
            0,
          );
          return {
            completed: 0,
            failed: totalPrompts,
            stopped: false,
            reason: e.code || e.reason,
          };
        }
        console.warn(
          "[PromptQueue] ExecutionGate batch request failed, blocking:",
          e.message,
        );
        throw e;
      }
    }
    ExecutionGate.claimQueueAdmission(
      executionToken,
      "task_run",
      totalAdmissionPrompts,
    );
    if (!this._isRunning) this._trackerSessionId = crypto.randomUUID();
    this._clearCompletedJobs();
    for (const task of tasks) {
      await window.storageManager?.resetTaskResults?.(task);
    }
    MessageBridge.sendToContentScript("pq:clearRetryTracking").catch(() => {});
    const job = new Job({ owner: "task", label: "Run All Tasks" });
    if (!this._hasGenerationWork()) this._blockerRunId = crypto.randomUUID();
    const completion = new Promise((resolve) => {
      job._resolve = resolve;
    });
    job._admissionPending = true;
    let targetFlowContext = null;
    try {
      targetFlowContext = await window.MessageBridge?.getLiveTargetContext?.();
    } catch (_) {}
    job._executionToken = executionToken;
    job._trackerSessionId = this._trackerSessionId;
    job._blockerRunId = this._blockerRunId;
    job.projectId =
      targetFlowContext?.projectId || window._currentProjectId || null;
    job.taskBatch = { tasks, currentIdx: 0, mode, settingsPerTask };
    job.totalExpected = tasks.reduce(
      (sum, t) =>
        sum + (t.multi_prompt && t.prompts?.length > 1 ? t.prompts.length : 1),
      0,
    );
    job.flowDriverKey = targetFlowContext?.driverKey || null;
    job.flowTabId = targetFlowContext?.tabId || null;
    job.flowCompactLayout = targetFlowContext?.compactLayout ?? null;
    job.forcedV2WebSequential = false;
    job.sequentialMode = mode === "sequential";
    job.requestedSequentialMode = mode === "sequential";
    const _batchHasMultiPromptDownload = tasks.some(
      (t) =>
        !!t.auto_download &&
        !!t.multi_prompt &&
        Array.isArray(t.prompts) &&
        t.prompts.length > 1,
    );
    if (_batchHasMultiPromptDownload && !job.sequentialMode) {
      console.warn(
        "[PromptQueue] submitTaskBatch: parallel + auto-download cho task multi-prompt \u2014 n\u1EBFu c\xF3 prompt silent fail, filename mapping c\xF3 th\u1EC3 shift.",
      );
    }
    job._autoDownload = this._readAutoDownload();
    try {
      await this._waitForAdmissionReload(admissionControl);
    } catch (error) {
      if (executionToken && !job._executionTokenManagedByCaller) {
        window.ExecutionGate?.cancel?.(executionToken)?.catch?.(() => {});
      }
      throw error;
    }
    this._jobs.set(job.id, job);
    const taskRouteCandidates = tasks.flatMap((task, taskIdx) => {
      const candidateSettings =
        settingsPerTask?.[taskIdx] || job.settings || null;
      const candidatePrompts =
        task.multi_prompt && task.prompts?.length > 1
          ? task.prompts
          : [task.prompt];
      return candidatePrompts.map((prompt) => ({
        settings: candidateSettings,
        prompt,
      }));
    });
    this._lockDeterministicWebComponents(job, taskRouteCandidates);
    if (mode === "sequential") {
      this._enqueueTaskItems(job, 0);
    } else {
      for (let i = 0; i < tasks.length; i++) {
        this._enqueueTaskItems(job, i);
      }
    }
    if (
      job.flowDriverKey === "flow_v2" &&
      job.items.some((item) => !this._editorExecutor?._isFlowApiMode?.(item))
    ) {
      try {
        await window.flowV2CorrelationBroker?.refreshRunGate?.();
      } catch (_) {}
    }
    if (
      !job.sequentialMode &&
      job.flowDriverKey === "flow_v2" &&
      job.totalExpected > 1
    ) {
      const hasWebItem = job.items.some(
        (item) => !this._editorExecutor?._isFlowApiMode?.(item),
      );
      const allWebParallelEligible =
        hasWebItem &&
        job.items
          .filter((item) => !this._editorExecutor?._isFlowApiMode?.(item))
          .every(
            (item) =>
              window.flowV2CorrelationBroker?.itemCapability?.(item)
                ?.parallel === true,
          );
      job.sequentialMode = hasWebItem && !allWebParallelEligible;
      job.forcedV2WebSequential = job.sequentialMode;
      console.log(
        `[PromptQueue] Flow V2 task batch mode: ${job.sequentialMode ? "sequential (correlation fail-closed)" : hasWebItem ? "parallel (strong-correlation rollout)" : "parallel (API-only)"}`,
      );
    }
    window.FlowApiTelemetry?.emit?.(
      "task_job_admitted",
      {
        jobId: job.id || null,
        owner: "task",
        tasks: tasks.length,
        promptsExpected: job.totalExpected,
        itemsCurrentlyEnqueued: job.items.length,
        lazyTaskAdmission: mode === "sequential",
        driver: job.items.some((item) =>
          this._editorExecutor?._isFlowApiMode?.(item),
        )
          ? job.flowDriverKey || null
          : null,
        pageDriver: job.flowDriverKey || null,
        mode: this._jobExecutionMode(job),
        effectiveRunMode: job.sequentialMode ? "sequential" : "parallel",
        forcedV2WebSequential: job.forcedV2WebSequential === true,
      },
      { dedupeKey: `task_job_admitted:${job.id}` },
    );
    this._sortQueue();
    this._readSettings();
    await this._webRecovery?.admitJob(job);
    job._admissionPending = false;
    this._ensureRunning();
    this._emitStateChanged();
    return completion;
  }
  _resolveRegenSettings(original, override, refIds) {
    const settings = { ...(original || {}) };
    if (!override) return settings;
    if (override.flowExecutionMode !== void 0) {
      if (!["api", "web", "auto"].includes(override.flowExecutionMode))
        throw new Error("REGEN_MODE_INVALID");
      settings.flowExecutionMode = override.flowExecutionMode;
    }
    if (!override.model || override.model === settings.model) return settings;
    const mediaType = String(settings.genType || "")
      .toLowerCase()
      .includes("video")
      ? "video"
      : "image";
    const model = window.ModelRegistry?.safeGetModelsSync?.(
      "flow",
      mediaType,
    )?.find((entry) => entry.value === override.model);
    if (
      !model ||
      (model.required_feature_key &&
        !window.featureGate?.canUse?.(model.required_feature_key))
    ) {
      throw new Error("REGEN_MODEL_UNAVAILABLE");
    }
    settings.model = model.value;
    const adapter = window.ProviderRegistry?.get?.("flow");
    if (mediaType === "video") {
      const inputType = settings.isFrames ? "Frames" : "Ingredients";
      const videoIds = settings.refVideoIds || [];
      const imageCount = (refIds || []).filter(
        (id) => !videoIds.includes(id),
      ).length;
      const forced = adapter?.getDurationOverride?.({
        modelValue: model.value,
        hasRef: imageCount > 0,
        hasRefVideo: videoIds.length > 0,
        inputType,
      });
      if (forced) settings.flowVideoDuration = forced;
      else {
        const durations =
          window.ProviderConfigManager?.safeGetVideoDurationsSync?.(
            "flow",
            model.config?.duration_tier || "default",
          ) || [];
        if (durations.length && !durations.includes(settings.flowVideoDuration))
          settings.flowVideoDuration = durations[0];
      }
      settings.skipFlowDurationControl =
        model.config?.duration_tier === "default";
      if (
        imageCount &&
        adapter?.supportsRefImages?.(model.value, {
          inputType,
          duration: settings.flowVideoDuration,
        }) === false
      )
        throw new Error("REGEN_MODEL_REF_UNSUPPORTED");
      if (
        videoIds.length &&
        videoIds.length > (adapter?.getMaxRefVideos?.(model.value) ?? 0)
      )
        throw new Error("REGEN_MODEL_REF_UNSUPPORTED");
      const resolution = window.ModelRegistry?.getGenerationResolutionConfig?.(
        "flow",
        model.value,
      );
      settings.flowVideoResolution = resolution
        ? resolution.options.some(
            (option) => option.value === settings.flowVideoResolution,
          )
          ? settings.flowVideoResolution
          : resolution.default
        : null;
    }
    if (adapter && (refIds || []).length) {
      const imageCount = refIds.filter(
        (id) => !(settings.refVideoIds || []).includes(id),
      ).length;
      const max = adapter.getMaxRefImages?.({
        mode: mediaType,
        isFrames: settings.isFrames,
        modelValue: model.value,
      });
      const total = adapter.getMaxRefImagesTotal?.(model.value);
      if (
        (Number.isFinite(max) && imageCount > max) ||
        (Number.isFinite(total) && refIds.length > total)
      ) {
        throw new Error("REGEN_MODEL_REF_LIMIT");
      }
    }
    return settings;
  }
  _submitRegenJob(request, onAdmission) {
    let reported = false;
    const report = (result) => {
      if (reported) return;
      reported = true;
      console.info(
        "[FlowRegenAudit] admission " +
          JSON.stringify({
            ok: result.ok === true,
            itemIds: request.itemIds || [],
            jobId: result.jobId || null,
            error: result.error || null,
          }),
      );
      onAdmission?.(result);
    };
    const promise = this.submitJob({ ...request, onQueueAdmitted: report });
    Promise.resolve(promise).then(
      (result) => {
        if (!reported)
          report({ ok: false, error: result?.reason || "REGEN_NOT_ADMITTED" });
      },
      (error) =>
        report({
          ok: false,
          error: error?.code || error?.message || "REGEN_NOT_ADMITTED",
        }),
    );
    return promise;
  }
  regenItem({
    jobId,
    itemId,
    prompt,
    payload,
    settingsOverride,
    onAdmission,
    onSettled,
  } = {}) {
    try {
      this._lastRegenError = null;
      let found = null;
      let regenSource = "live_job";
      for (const job of this._jobs.values()) {
        const it = (job.items || []).find((i) => i.id === itemId);
        if (it) {
          found = it;
          break;
        }
      }
      if (!found) {
        let latest = null;
        for (const job of this._jobs.values()) {
          for (const it of job.items || []) {
            if (
              it._regenOf === itemId &&
              (!latest || (it.createdAt || 0) >= (latest.createdAt || 0))
            )
              latest = it;
          }
        }
        found = latest;
        if (found) regenSource = "live_regen";
      }
      if (!found && payload) {
        if (payload.state === QueueItem.STATE.PENDING) {
          this._lastRegenError = "REGEN_LIVE_QUEUE_REQUIRED";
          return false;
        }
        regenSource = "tracker_cache";
        found = {
          _regenOf: payload.regenOf || null,
          jobId: null,
          _autoDownload: payload.autoDownload === true,
          prompt: payload.prompt || "",
          projectId: payload.projectId || null,
          settings: payload.settings || {},
          refFileIds: Array.isArray(payload.refFileIds)
            ? payload.refFileIds
            : [],
          refFileNames: payload.refFileNames || {},
          refThumbnails: payload.refThumbnails || {},
          refImageMode: payload.refImageMode || "none",
          mentionData: payload.mentionData || null,
          _downloadResolution: payload.downloadResolution || null,
          _videoDownloadResolution: payload.videoDownloadResolution || null,
          _taskName: payload.taskName || null,
          promptIndex: Number.isFinite(payload.promptIndex)
            ? payload.promptIndex
            : 0,
        };
      }
      if (!found) {
        console.warn(
          "[PromptQueue] regenItem: item kh\xF4ng t\xECm th\u1EA5y",
          itemId,
        );
        return false;
      }
      const sourceJob = found.jobId ? this._jobs.get(found.jobId) : null;
      let pausedBatch =
        sourceJob?.owner === "prompts" &&
        sourceJob.state === "paused" &&
        !sourceJob.chain &&
        !sourceJob._admissionPending
          ? sourceJob
          : null;
      if (!pausedBatch && found._regenOf) {
        pausedBatch =
          [...this._jobs.values()].find(
            (job) =>
              job.owner === "prompts" &&
              job.state === "paused" &&
              !job.chain &&
              !job._admissionPending &&
              (!found.projectId || job.projectId === found.projectId) &&
              job.items?.some((item) => item.id === found._regenOf),
          ) || null;
      }
      if (
        this._isRunning &&
        (!pausedBatch ||
          pausedBatch._manualRegenInFlight ||
          pausedBatch.items.some(
            (item) =>
              !item.isTerminal && item.state !== QueueItem.STATE.PENDING,
          ) ||
          [...this._jobs.values()].some(
            (job) =>
              job !== pausedBatch &&
              job.state === "running" &&
              job.items.some((item) => !item.isTerminal),
          ))
      ) {
        this._lastRegenError = "REGEN_BUSY_OR_MISSING";
        return false;
      }
      const queuedSource =
        pausedBatch &&
        found.state === QueueItem.STATE.PENDING &&
        this._canRemoveLiveTrackerItem(pausedBatch, found);
      const sourceRecoveryRecord = queuedSource
        ? this._webRecovery?.records?.get(found.id)
        : null;
      if (
        sourceRecoveryRecord?.attempts?.length ||
        sourceRecoveryRecord?.outputs?.some(
          (output) => output.state !== "pending",
        )
      ) {
        this._lastRegenError = "REGEN_ITEM_IN_FLIGHT";
        return false;
      }
      if (pausedBatch && !found.isTerminal && !queuedSource) {
        this._lastRegenError = "REGEN_ITEM_IN_FLIGHT";
        return false;
      }
      const newPrompt =
        typeof prompt === "string" && prompt.trim()
          ? prompt.trim()
          : found.prompt;
      let regenRefFileIds = [...(found.refFileIds || [])];
      let regenRefFileNames = { ...(found.refFileNames || {}) };
      const regenRefThumbnails = { ...(found.refThumbnails || {}) };
      let regenMentionData = found.mentionData || null;
      if (found.refImageMode === "mention") {
        const candidates = [
          ...(Array.isArray(payload?.mentionCandidates)
            ? payload.mentionCandidates
            : []),
          ...(Array.isArray(found.mentionData?.refImages)
            ? found.mentionData.refImages
            : []),
        ];
        if (window.imageNameRegistry) {
          for (const ref of candidates) {
            if (ref?.name && ref?.file_id)
              window.imageNameRegistry.register(ref.name, {
                type: ref.type || "flow",
                source: ref.source || "tracker_history",
                file_id: ref.file_id,
                file_name:
                  ref.file_name || regenRefFileNames[ref.file_id] || null,
                thumbnail_url: ref.thumbnail_url || null,
              });
          }
        }
        if (!window.MentionParser?.processPrompt) {
          this._lastRegenError = "MENTION_PARSER_UNAVAILABLE";
          return false;
        }
        regenMentionData = window.MentionParser.processPrompt(newPrompt);
        if (regenMentionData.hasUnresolvedMentions) {
          const names = (regenMentionData.mentions || [])
            .filter((entry) => !entry.found)
            .map((entry) => entry.mention?.imageName)
            .filter(Boolean);
          this._lastRegenError = "MENTION_UNRESOLVED:" + names.join(",");
          return false;
        }
        regenRefFileIds = (regenMentionData.refImages || [])
          .map((ref) => ref.file_id)
          .filter(Boolean);
        regenRefFileNames = Object.fromEntries(
          regenRefFileIds.map((id) => {
            const ref = (regenMentionData.refImages || []).find(
              (candidate) => candidate.file_id === id,
            );
            return [id, ref?.file_name || found.refFileNames?.[id] || id];
          }),
        );
      }
      const autoDl =
        found._autoDownload ??
        this._jobs.get(found.jobId)?._autoDownload ??
        false;
      let genSubFolder = null;
      if (found._taskName) genSubFolder = found._taskName;
      else
        try {
          genSubFolder =
            (typeof document !== "undefined" &&
              document.getElementById("genTabSubFolder")?.value?.trim()) ||
            null;
        } catch (_) {}
      console.log(
        "[PromptQueue] regenItem \u2192",
        itemId,
        prompt ? "(prompt edited)" : "(same prompt)",
        "folder:",
        genSubFolder || "(base)",
      );
      console.info(
        "[FlowRegenAudit] source_resolved " +
          JSON.stringify({
            source: regenSource,
            itemId,
            edited: typeof prompt === "string" && !!prompt.trim(),
            refCount: regenRefFileIds.length,
            hasSettings: !!found.settings,
            originalMode:
              found.settings?.flowExecutionMode || found.genMode || null,
            requestedMode: settingsOverride?.flowExecutionMode || null,
          }),
      );
      const regenItemId = crypto.randomUUID();
      if (pausedBatch) pausedBatch._manualRegenInFlight = regenItemId;
      let admitted = false;
      let sourceRecordBefore = null;
      let admissionActivation = Promise.resolve();
      let admissionReported = false;
      let settlementReported = false;
      const reportSettlement = (result) => {
        if (settlementReported) return;
        settlementReported = true;
        try {
          onSettled?.(result);
        } catch (error) {
          console.warn(
            "[PromptQueue] Regen settlement callback failed:",
            error?.message || error,
          );
        }
      };
      const sendAdmission = (result) => {
        if (admissionReported) return;
        admissionReported = true;
        try {
          onAdmission?.(result);
        } catch (error) {
          console.warn(
            "[PromptQueue] Regen admission callback failed:",
            error?.message || error,
          );
        }
      };
      const reportAdmission = (result) => {
        const activate = async () => {
          if (result.ok && pausedBatch) {
            const manualJob = this._jobs.get(result.jobId);
            if (!manualJob?.items?.some((item) => item.id === regenItemId)) {
              if (result.jobId) this.stopJob(result.jobId);
              sendAdmission({ ok: false, error: "REGEN_JOB_NOT_FOUND" });
              return;
            }
            const recovery = this._webRecovery;
            const sourceRecord = queuedSource
              ? recovery?.records?.get(found.id)
              : null;
            const previousRecord = sourceRecord
              ? {
                  terminal: sourceRecord.terminal,
                  stopped: sourceRecord.stopped,
                  finishedAt: sourceRecord.finishedAt,
                }
              : null;
            sourceRecordBefore = previousRecord;
            const previousMembers = recovery?.windowMembers
              ? new Set(recovery.windowMembers)
              : null;
            const previousClosed = recovery?.closed;
            const webItems = manualJob.items.filter((item) =>
              recovery?.eligible(item),
            );
            if (recovery && webItems.length && !recovery.windowMembers) {
              recovery.windowMembers = new Set(
                this._itemQueue
                  .filter(
                    (item) =>
                      item.jobId === pausedBatch.id &&
                      !item.isTerminal &&
                      recovery.eligible(item),
                  )
                  .map((item) => item.id),
              );
            }
            if (sourceRecord) {
              sourceRecord.terminal = true;
              sourceRecord.stopped = true;
              sourceRecord.finishedAt = Date.now();
              recovery.windowMembers?.delete(found.id);
            }
            if (recovery?.windowMembers && webItems.length) {
              for (const item of webItems) recovery.windowMembers.add(item.id);
              recovery.closed = false;
            }
            if (
              recovery &&
              (sourceRecord || (recovery.windowMembers && webItems.length))
            ) {
              try {
                await recovery.persist();
              } catch (error) {
                if (sourceRecord) Object.assign(sourceRecord, previousRecord);
                recovery.windowMembers = previousMembers;
                recovery.closed = previousClosed;
                this.stopJob(result.jobId);
                sendAdmission({
                  ok: false,
                  error: error?.message || "FLOW_RECOVERY_STORAGE_UNAVAILABLE",
                });
                return;
              }
            }
            if (pausedBatch.state !== "paused") {
              this.stopJob(result.jobId);
              sendAdmission({ ok: false, error: "JOB_STATE_CHANGED" });
              return;
            }
            admitted = true;
            if (queuedSource && found.state === QueueItem.STATE.PENDING) {
              this._itemQueue = this._itemQueue.filter(
                (item) => item !== found,
              );
              found._trackerRemovedBeforeSubmit = true;
              found.state = QueueItem.STATE.CANCELLED;
              found.completedAt = Date.now();
            }
            this._editorExecutor.resume();
            window.MessageBridge?.sendToContentScript?.("pq:pauseExecution", {
              paused: false,
            })?.catch?.(() => {});
            this._ensureRunning();
            this._emitStateChanged();
          }
          sendAdmission(result);
        };
        admissionActivation = activate().catch((error) => {
          if (result.jobId) this.stopJob(result.jobId);
          sendAdmission({
            ok: false,
            error: error?.message || "REGEN_ADMISSION_FAILED",
          });
        });
      };
      const submitPromise = this._submitRegenJob(
        {
          owner: "prompts",
          label: "Regen",
          prompts: [newPrompt],
          settings: this._resolveRegenSettings(
            found.settings,
            settingsOverride,
            regenRefFileIds,
          ),
          projectId: found.projectId || null,
          refFileIds: regenRefFileIds,
          refFileNames: regenRefFileNames,
          refThumbnails: regenRefThumbnails,
          refImageMode:
            found.refFileIds?.length > 0 &&
            (!found.refImageMode || found.refImageMode === "none")
              ? "all"
              : found.refImageMode || "none",
          mentionData: regenMentionData ? [regenMentionData] : null,
          taskName: genSubFolder,
          autoDownload: autoDl,
          downloadResolution: found._downloadResolution || null,
          videoDownloadResolution: found._videoDownloadResolution || null,
          keepCompleted: true,
          isRegen: true,
          ...(pausedBatch
            ? {
                onGenerationComplete: (result) => {
                  if (
                    !result?.fileIds?.length ||
                    pausedBatch._manualRegenInFlight !== regenItemId
                  )
                    return;
                  pausedBatch._manualRegenInFlight = null;
                  if (pausedBatch.state === "paused")
                    this._checkJobDone(pausedBatch);
                  this._emitStateChanged();
                  reportSettlement({ ok: true, itemId: regenItemId });
                },
              }
            : {}),
          regenOf: found._regenOf || itemId,
          regenDisplay: pausedBatch
            ? {
                jobId: pausedBatch.id,
                sessionId:
                  pausedBatch._trackerSessionId || this._trackerSessionId,
                label: pausedBatch.label,
                owner: pausedBatch.owner,
                startedAt: pausedBatch.createdAt,
              }
            : payload?.regenDisplay && typeof payload.regenDisplay === "object"
              ? { ...payload.regenDisplay }
              : null,
          itemIds: [regenItemId],
          promptIndexBase: found.promptIndex ?? 0,
        },
        reportAdmission,
      );
      Promise.resolve(submitPromise)
        .then((result) => {
          console.info(
            "[FlowRegenAudit] terminal " +
              JSON.stringify({
                source: regenSource,
                itemId: regenItemId,
                completed: result?.completed ?? null,
                failed: result?.failed ?? null,
                stopped: result?.stopped === true,
              }),
          );
          return result;
        })
        .catch((e) => {
          console.warn(
            "[FlowRegenAudit] submit_error " +
              JSON.stringify({
                source: regenSource,
                itemId: regenItemId,
                error: e?.message || "UNKNOWN",
              }),
          );
          return null;
        })
        .then(async (result) => {
          await admissionActivation;
          if (
            !pausedBatch ||
            (pausedBatch._manualRegenInFlight !== regenItemId &&
              pausedBatch._manualRegenInFlight !== null)
          )
            return;
          const manualJob = [...this._jobs.values()].find(
            (job) =>
              job !== pausedBatch &&
              job.items?.some((item) => item.id === regenItemId),
          );
          const manualItem = manualJob?.items?.find(
            (item) => item.id === regenItemId,
          );
          const hasResult =
            !!manualItem?.resultTileIds?.length ||
            manualItem?.outputs?.some(
              (output) => output.status === "completed",
            );
          const definitiveFailure =
            ["FAILED", "BLOCKED"].includes(manualItem?.state) &&
            manualItem?.errorPolicy?.ambiguous !== true &&
            result?.stopped !== true;
          const sourceRoute =
            found.genMode || found.settings?.flowExecutionMode || null;
          const sameRoute =
            !settingsOverride?.flowExecutionMode ||
            settingsOverride.flowExecutionMode === sourceRoute;
          const sameModel =
            !settingsOverride?.model ||
            settingsOverride.model === found.settings?.model;
          if (
            admitted &&
            queuedSource &&
            pausedBatch.state === "paused" &&
            !hasResult &&
            definitiveFailure
          ) {
            const recovery = this._webRecovery;
            const record = recovery?.records?.get(found.id);
            if (record && sourceRecordBefore) {
              const retiredState = {
                terminal: record.terminal,
                stopped: record.stopped,
                finishedAt: record.finishedAt,
                snapshot: record.snapshot,
                filenames:
                  record.outputs?.map((output) => output.filename) || [],
              };
              const previousMembers = recovery.windowMembers
                ? new Set(recovery.windowMembers)
                : null;
              const previousClosed = recovery.closed;
              Object.assign(record, sourceRecordBefore);
              if (sameRoute && sameModel) {
                const manualRecord = recovery.records?.get(regenItemId);
                const replacementSnapshot = manualRecord?.snapshot || {
                  prompt: newPrompt,
                  settings: manualItem.settings,
                  refFileIds: manualItem.refFileIds,
                  refFileNames: manualItem.refFileNames,
                  refThumbnails: manualItem.refThumbnails,
                  refImageMode: manualItem.refImageMode,
                  mentionData: manualItem.mentionData,
                };
                const fields = [
                  "prompt",
                  "settings",
                  "refFileIds",
                  "refFileNames",
                  "refThumbnails",
                  "refImageMode",
                  "mentionData",
                ];
                record.snapshot = { ...record.snapshot };
                for (const key of fields) {
                  if (replacementSnapshot[key] !== void 0)
                    record.snapshot[key] = replacementSnapshot[key];
                }
                if (manualRecord?.outputs) {
                  for (let index = 0; index < record.outputs.length; index++) {
                    if (manualRecord.outputs?.[index]?.filename) {
                      record.outputs[index].filename =
                        manualRecord.outputs[index].filename;
                    }
                  }
                }
              }
              recovery.windowMembers?.add(found.id);
              recovery.closed = false;
              try {
                await recovery.persist();
              } catch (error) {
                Object.assign(record, {
                  terminal: retiredState.terminal,
                  stopped: retiredState.stopped,
                  finishedAt: retiredState.finishedAt,
                  snapshot: retiredState.snapshot,
                });
                record.outputs?.forEach((output, index) => {
                  output.filename = retiredState.filenames[index];
                });
                recovery.windowMembers = previousMembers;
                recovery.closed = previousClosed;
                console.warn(
                  "[PromptQueue] Manual Regen source restore failed:",
                  error?.message || error,
                );
              }
            }
            if (!record || record.terminal !== true) {
              if (sameRoute && sameModel) {
                found.prompt = newPrompt;
                found.promptText = newPrompt;
                found.settings = {
                  ...(manualItem.settings || found.settings || {}),
                };
                found.refFileIds = [
                  ...(manualItem.refFileIds || regenRefFileIds),
                ];
                found.refFileNames = {
                  ...(manualItem.refFileNames || regenRefFileNames),
                };
                found.refThumbnails = {
                  ...(manualItem.refThumbnails || regenRefThumbnails),
                };
                found.refImageMode =
                  manualItem.refImageMode || found.refImageMode;
                found.mentionData = manualItem.mentionData || regenMentionData;
              }
              found._trackerRemovedBeforeSubmit = false;
              found.completedAt = null;
              found.createdAt = Math.max(
                Date.now(),
                Number(manualItem.createdAt || 0) + 1,
              );
              found.state = QueueItem.STATE.PENDING;
              if (!this._itemQueue.includes(found)) this.enqueue(found);
            }
          }
          if (pausedBatch._manualRegenInFlight === regenItemId)
            pausedBatch._manualRegenInFlight = null;
          if (admitted && pausedBatch.state === "paused")
            this._checkJobDone(pausedBatch);
          if (
            admitted &&
            pausedBatch.state === "paused" &&
            !pausedBatch._manualRegenInFlight &&
            [...this._jobs.values()].some((job) => job.state === "paused")
          ) {
            this._editorExecutor.pause();
            window.MessageBridge?.sendToContentScript?.("pq:pauseExecution", {
              paused: true,
            })?.catch?.(() => {});
          }
          this._emitStateChanged();
          reportSettlement({ ok: admitted, itemId: regenItemId, result });
        })
        .catch((error) => {
          console.warn(
            "[PromptQueue] Regen cleanup failed:",
            error?.message || error,
          );
          reportSettlement({
            ok: false,
            itemId: regenItemId,
            error: error?.message || "REGEN_CLEANUP_FAILED",
          });
        });
      return regenItemId;
    } catch (e) {
      this._lastRegenError = e?.message || "REGEN_FAILED";
      console.warn("[PromptQueue] regenItem error:", e && e.message);
      return false;
    }
  }
  requestTrackerRegenItem(request = {}) {
    const ownerId = request.payload?.regenDisplay?.jobId || request.jobId;
    const owner = this._jobs.get(ownerId);
    const pending = owner?._manualRegenRequests || [];
    if (
      owner?.state === "paused" &&
      (owner._manualRegenInFlight || pending.length)
    ) {
      const rootId = request.payload?.regenOf || request.itemId;
      const source = owner.items.find((item) => item.id === rootId);
      const live = [...this._jobs.values()]
        .flatMap((job) => (job.items || []).map((item) => ({ job, item })))
        .find((entry) => entry.item.id === request.itemId);
      const activeAttempt = [...this._jobs.values()]
        .flatMap((job) => job.items || [])
        .find((item) => item.id === owner._manualRegenInFlight);
      if (
        !source ||
        owner.owner !== "prompts" ||
        owner.chain ||
        owner._admissionPending ||
        owner._manualRegenBatchPending ||
        !live ||
        (live.job !== owner && live.job.regenDisplay?.jobId !== owner.id) ||
        (live.item.projectId || live.job.projectId) !== owner.projectId ||
        (!live.item.isTerminal &&
          !(
            live.job === owner &&
            live.item.state === QueueItem.STATE.PENDING &&
            this._canRemoveLiveTrackerItem(owner, live.item)
          ))
      ) {
        this._lastRegenError = "REGEN_ITEM_IN_FLIGHT";
        return false;
      }
      if (
        pending.some((entry) => entry.rootId === rootId) ||
        activeAttempt?._regenOf === rootId ||
        owner._manualRegenInFlight === request.itemId ||
        owner._manualRegenInFlight === rootId
      ) {
        this._lastRegenError = "REGEN_ALREADY_QUEUED";
        return false;
      }
      owner._manualRegenRequests = [
        ...pending,
        { request: { ...request }, rootId },
      ];
      this._emitStateChanged();
      request.onAdmission?.({
        ok: true,
        queued: true,
        itemId: request.itemId,
        position: owner._manualRegenRequests.length,
      });
      return true;
    }
    return this.regenItem({
      ...request,
      onSettled: (result) => {
        request.onSettled?.(result);
        if (owner?.state === "paused") this._drainTrackerRegenRequests(owner);
      },
    });
  }
  _drainTrackerRegenRequests(owner) {
    if (!owner || owner.state !== "paused" || owner._manualRegenInFlight)
      return;
    const next = owner._manualRegenRequests?.shift();
    if (!next) {
      this._emitStateChanged();
      if (owner.state === "paused") this._checkJobDone(owner);
      return;
    }
    const accepted = this.regenItem({
      ...next.request,
      onAdmission: (result) => {
        if (!result?.ok)
          console.warn(
            "[PromptQueue] Queued tracker Regen rejected:",
            result?.error || "REGEN_NOT_ACCEPTED",
          );
      },
      onSettled: () => this._drainTrackerRegenRequests(owner),
    });
    if (!accepted) {
      console.warn(
        "[PromptQueue] Queued tracker Regen could not start:",
        this._lastRegenError,
      );
      this._drainTrackerRegenRequests(owner);
    }
  }
  _regenPausedBatch(items, onAdmission) {
    const ownerId = items[0]?.payload?.regenDisplay?.jobId || items[0]?.jobId;
    const owner = this._jobs.get(ownerId);
    if (
      !owner ||
      owner.owner !== "prompts" ||
      owner.state !== "paused" ||
      owner.chain ||
      owner._admissionPending ||
      owner._manualRegenInFlight ||
      owner._manualRegenBatchPending ||
      owner.items.some(
        (item) => !item.isTerminal && item.state !== QueueItem.STATE.PENDING,
      ) ||
      [...this._jobs.values()].some(
        (job) =>
          job !== owner &&
          job.state === "running" &&
          job.items?.some((item) => !item.isTerminal),
      )
    ) {
      this._lastRegenError = "REGEN_BUSY_OR_MISSING";
      return false;
    }
    const roots = new Set();
    for (const request of items) {
      const live = [...this._jobs.values()]
        .flatMap((job) => (job.items || []).map((item) => ({ job, item })))
        .find((entry) => entry.item.id === request?.itemId);
      const rootId =
        live?.item?._regenOf || request?.payload?.regenOf || request?.itemId;
      const source = owner.items.find((item) => item.id === rootId);
      if (
        !source ||
        roots.has(rootId) ||
        request?.payload?.regenDisplay?.jobId !== owner.id ||
        (live &&
          live.job !== owner &&
          live.job.regenDisplay?.jobId !== owner.id) ||
        (!live && request?.payload?.state === QueueItem.STATE.PENDING) ||
        (live &&
          !live.item.isTerminal &&
          !(
            live.job === owner &&
            live.item.state === QueueItem.STATE.PENDING &&
            this._canRemoveLiveTrackerItem(owner, live.item)
          ))
      ) {
        this._lastRegenError = "REGEN_ITEM_IN_FLIGHT";
        return false;
      }
      roots.add(rootId);
    }
    owner._manualRegenBatchPending = items.length;
    let reported = false;
    const report = (result) => {
      if (reported) return;
      reported = true;
      onAdmission?.(result);
    };
    const finish = () => {
      owner._manualRegenBatchPending = 0;
      if (owner.state === "paused") this._checkJobDone(owner);
      this._emitStateChanged();
    };
    const run = (index) => {
      if (owner.state !== "paused" || index >= items.length) {
        if (!reported) report({ ok: false, error: "JOB_STATE_CHANGED" });
        finish();
        return;
      }
      const request = items[index];
      let accepted = false;
      const id = this.regenItem({
        ...request,
        onAdmission: (result) => {
          accepted = result?.ok === true;
          if (index === 0) report(result);
          if (!accepted && index > 0) {
            console.warn(
              "[PromptQueue] Paused bulk Regen stopped:",
              result?.error || "REGEN_NOT_ACCEPTED",
            );
            this._notifyFlowError?.(
              `Regen stopped after ${index}/${items.length} prompts: ${result?.error || "REGEN_NOT_ACCEPTED"}`,
              "warning",
            );
          }
        },
        onSettled: (result) => {
          owner._manualRegenBatchPending = Math.max(
            0,
            items.length - index - 1,
          );
          if (!accepted || result?.ok !== true) {
            finish();
            return;
          }
          run(index + 1);
        },
      });
      if (!id) {
        if (!reported)
          report({
            ok: false,
            error: this._lastRegenError || "REGEN_NOT_ACCEPTED",
          });
        finish();
      }
    };
    run(0);
    return true;
  }
  regenBatch({ items, onAdmission } = {}) {
    try {
      this._lastRegenError = null;
      if (!Array.isArray(items) || items.length === 0) {
        this._lastRegenError = "REGEN_BUSY_OR_MISSING";
        return false;
      }
      const displayOwner = this._jobs.get(
        items[0]?.payload?.regenDisplay?.jobId,
      );
      if (displayOwner?.state === "paused" || this._isRunning) {
        return this._regenPausedBatch(items, onAdmission);
      }
      const stable = (value) => {
        if (Array.isArray(value)) return value.map(stable);
        if (!value || typeof value !== "object") return value;
        return Object.keys(value)
          .sort()
          .reduce((out, key) => {
            if (value[key] !== void 0) out[key] = stable(value[key]);
            return out;
          }, {});
      };
      const findLive = (itemId) => {
        let latest = null;
        for (const job of this._jobs.values()) {
          for (const item of job.items || []) {
            if (item.id === itemId || item._regenOf === itemId) {
              if (
                !latest ||
                (item.createdAt || 0) >= (latest.item.createdAt || 0)
              )
                latest = { item, job };
            }
          }
        }
        return latest;
      };
      const prepared = [];
      for (const request of items) {
        const live = findLive(request?.itemId);
        const payload = request?.payload || {};
        const source = live?.item || {
          id: request?.itemId,
          prompt: payload.prompt || "",
          projectId: payload.projectId || null,
          settings: payload.settings || {},
          refFileIds: payload.refFileIds || [],
          refFileNames: payload.refFileNames || {},
          refThumbnails: payload.refThumbnails || {},
          refImageMode: payload.refImageMode || "none",
          mentionData: payload.mentionData || null,
          promptIndex: payload.promptIndex || 0,
          _regenOf: payload.regenOf || null,
        };
        if (!source?.id) {
          this._lastRegenError = "REGEN_ITEM_NOT_FOUND";
          return false;
        }
        const newPrompt =
          typeof request.prompt === "string" && request.prompt.trim()
            ? request.prompt.trim()
            : source.prompt || payload.prompt || "";
        let refFileIds = [...(source.refFileIds || payload.refFileIds || [])];
        let refFileNames = {
          ...(source.refFileNames || payload.refFileNames || {}),
        };
        const refThumbnails = {
          ...(source.refThumbnails || payload.refThumbnails || {}),
        };
        let mentionData = source.mentionData || payload.mentionData || null;
        const sourceMode =
          source.refImageMode || payload.refImageMode || "none";
        if (sourceMode === "mention") {
          for (const ref of payload.mentionCandidates || []) {
            if (ref?.name && ref?.file_id)
              window.imageNameRegistry?.register?.(ref.name, ref);
          }
          if (!window.MentionParser?.processPrompt) {
            this._lastRegenError = "MENTION_PARSER_UNAVAILABLE";
            return false;
          }
          mentionData = window.MentionParser.processPrompt(newPrompt);
          if (mentionData.hasUnresolvedMentions) {
            const names = (mentionData.mentions || [])
              .filter((entry) => !entry.found)
              .map((entry) => entry.mention?.imageName)
              .filter(Boolean);
            this._lastRegenError = "MENTION_UNRESOLVED:" + names.join(",");
            return false;
          }
          refFileIds = (mentionData.refImages || [])
            .map((ref) => ref.file_id)
            .filter(Boolean);
          refFileNames = Object.fromEntries(
            refFileIds.map((id) => {
              const ref = (mentionData.refImages || []).find(
                (candidate) => candidate.file_id === id,
              );
              return [id, ref?.file_name || source.refFileNames?.[id] || id];
            }),
          );
        }
        prepared.push({
          source,
          liveJob: live?.job || null,
          prompt: newPrompt,
          settings: this._resolveRegenSettings(
            { ...(payload.settings || {}), ...(source.settings || {}) },
            request.settingsOverride,
            refFileIds,
          ),
          projectId:
            source.projectId ||
            payload.projectId ||
            live?.job?.projectId ||
            null,
          refFileIds,
          refFileNames,
          refThumbnails,
          mentionData,
          refImageMode:
            refFileIds.length > 0 && (!sourceMode || sourceMode === "none")
              ? "all"
              : sourceMode,
          promptIndex: Number.isFinite(Number(source.promptIndex))
            ? Number(source.promptIndex)
            : Number(payload.promptIndex) || 0,
          regenOf: source._regenOf || payload.regenOf || source.id,
          autoDownload:
            source._autoDownload ??
            payload.autoDownload ??
            live?.job?._autoDownload ??
            false,
          downloadResolution:
            source._downloadResolution || payload.downloadResolution || null,
          videoDownloadResolution:
            source._videoDownloadResolution ||
            payload.videoDownloadResolution ||
            null,
          taskName: source._taskName || payload.taskName || null,
          sequentialMode:
            live?.job?.sequentialMode === true ||
            payload.sequentialMode === true,
          regenDisplay:
            payload.regenDisplay && typeof payload.regenDisplay === "object"
              ? { ...payload.regenDisplay }
              : null,
        });
      }
      const projectId = prepared[0].projectId;
      if (
        prepared.some(
          (entry) =>
            entry.projectId && projectId && entry.projectId !== projectId,
        )
      ) {
        this._lastRegenError = "PROJECT_MISMATCH";
        return false;
      }
      const itemIds = prepared.map(() => crypto.randomUUID());
      const groups = new Map();
      prepared.forEach((entry, index) => {
        const signature = JSON.stringify(
          stable({
            settings: entry.settings,
            autoDownload: entry.autoDownload,
            downloadResolution: entry.downloadResolution,
            videoDownloadResolution: entry.videoDownloadResolution,
            taskName: entry.taskName,
            sequentialMode: entry.sequentialMode,
          }),
        );
        if (!groups.has(signature)) groups.set(signature, []);
        groups.get(signature).push({ entry, itemId: itemIds[index] });
      });
      const admissions = [];
      const submitPromises = Array.from(groups.values()).map((group) => {
        const first = group[0].entry;
        let report;
        admissions.push(
          new Promise((resolve) => {
            report = resolve;
          }),
        );
        try {
          return Promise.resolve(
            this._submitRegenJob(
              {
                owner: "prompts",
                label: "Regen selected",
                prompts: group.map((value) => value.entry.prompt),
                settings: first.settings,
                projectId,
                resolvedRefFileIdsPerPrompt: group.map(
                  (value) => value.entry.refFileIds,
                ),
                refFileNames: Object.assign(
                  {},
                  ...group.map((value) => value.entry.refFileNames),
                ),
                refThumbnails: Object.assign(
                  {},
                  ...group.map((value) => value.entry.refThumbnails),
                ),
                refImageModesPerPrompt: group.map(
                  (value) => value.entry.refImageMode,
                ),
                mentionData: group.map((value) => value.entry.mentionData),
                autoDownload: first.autoDownload,
                downloadResolution: first.downloadResolution,
                videoDownloadResolution: first.videoDownloadResolution,
                taskName: first.taskName,
                sequentialMode: first.sequentialMode,
                regenDisplay: first.regenDisplay,
                keepCompleted: true,
                isRegen: true,
                itemIds: group.map((value) => value.itemId),
                promptIndices: group.map((value) => value.entry.promptIndex),
                regenOfPerPrompt: group.map((value) => value.entry.regenOf),
              },
              report,
            ),
          );
        } catch (error) {
          report({ ok: false, error: error?.message || "REGEN_NOT_ADMITTED" });
          return Promise.reject(error);
        }
      });
      Promise.all(admissions).then((results) => {
        const admittedIds = results
          .filter((result) => result.ok)
          .flatMap((result) => result.itemIds || []);
        onAdmission?.({
          ok: admittedIds.length > 0,
          itemIds: admittedIds,
          error: results.find((result) => !result.ok)?.error || null,
        });
      });
      Promise.allSettled(submitPromises)
        .then((results) =>
          console.info(
            "[FlowRegenAudit] batch_terminal " +
              JSON.stringify({
                count: itemIds.length,
                groups: groups.size,
                completed: results.reduce(
                  (sum, result) =>
                    sum +
                    (result.status === "fulfilled"
                      ? Number(result.value?.completed || 0)
                      : 0),
                  0,
                ),
                failed: results.reduce(
                  (sum, result) =>
                    sum +
                    (result.status === "fulfilled"
                      ? Number(result.value?.failed || 0)
                      : 1),
                  0,
                ),
              }),
          ),
        )
        .catch((error) =>
          console.warn(
            "[FlowRegenAudit] batch_submit_error",
            error?.message || error,
          ),
        );
      console.info(
        "[FlowRegenAudit] batch_requested " +
          JSON.stringify({
            count: itemIds.length,
            groups: groups.size,
            projectId,
          }),
      );
      return itemIds;
    } catch (error) {
      this._lastRegenError = error?.message || "REGEN_BATCH_FAILED";
      console.warn("[PromptQueue] regenBatch error:", this._lastRegenError);
      return false;
    }
  }
  enrichJobResults(
    jobId,
    { thumbnails = {}, fileNames = {}, providerUrls = {} } = {},
  ) {
    const job = this._jobs.get(jobId);
    if (!job) {
      console.warn(
        "[PromptQueue] Tracker enrichment skipped: job no longer available",
        jobId,
      );
      return false;
    }
    let updated = 0;
    for (const item of job.items || []) {
      for (const resultId of item.resultTileIds || []) {
        const thumbnail = thumbnails[resultId];
        const fileName = fileNames[resultId];
        const providerUrl = providerUrls[resultId];
        if (!thumbnail && !fileName && !providerUrl) continue;
        if (thumbnail) {
          const previousThumbnail = (item.resultThumbnails || {})[resultId];
          item.resultThumbnails = {
            ...(item.resultThumbnails || {}),
            [resultId]: {
              ...(previousThumbnail && typeof previousThumbnail === "object"
                ? previousThumbnail
                : typeof previousThumbnail === "string"
                  ? { thumbnail: previousThumbnail }
                  : {}),
              ...(thumbnail && typeof thumbnail === "object"
                ? thumbnail
                : typeof thumbnail === "string"
                  ? { thumbnail }
                  : {}),
            },
          };
        }
        if (fileName) {
          item.resultFileNames = {
            ...(item.resultFileNames || {}),
            [resultId]: fileName,
          };
        }
        if (providerUrl) {
          item.resultProviderUrls = {
            ...(item.resultProviderUrls || {}),
            [resultId]: providerUrl,
          };
        }
        updated++;
      }
      item.syncCompletedOutputs?.(
        item.resultTileIds || [],
        item.resultThumbnails || {},
      );
    }
    if (updated > 0) {
      console.log(
        "[WorkflowTrackerAudit] enriched completed queue job",
        JSON.stringify({
          jobId: String(jobId).slice(0, 8),
          updated,
          thumbnails: Object.values(thumbnails).filter(
            (entry) => !!entry?.thumbnail,
          ).length,
          playableVideos: Object.values(thumbnails).filter(
            (entry) => !!entry?.video_url,
          ).length,
          durableMediaIds: Object.values(thumbnails).filter(
            (entry) =>
              entry?.identity_durability === "durable" ||
              /^[A-Za-z0-9_-]{32,1024}$/.test(
                String(entry?.persistent_media_id || ""),
              ),
          ).length,
          downloadSources: Object.keys(providerUrls).length,
        }),
      );
      this._emitStateChanged();
    }
    return updated > 0;
  }
  enrichResultsById(results = {}) {
    const entries = Object.entries(results || {}).filter(
      ([, info]) => info && typeof info === "object",
    );
    if (entries.length === 0) return 0;
    let updated = 0;
    for (const job of this._jobs.values()) {
      for (const item of job?.items || []) {
        for (const [resultId, info] of entries) {
          if (!(item.resultTileIds || []).includes(resultId)) continue;
          const previous = item.resultThumbnails?.[resultId];
          item.resultThumbnails = {
            ...(item.resultThumbnails || {}),
            [resultId]: {
              ...(previous && typeof previous === "object"
                ? previous
                : typeof previous === "string"
                  ? { thumbnail: previous }
                  : {}),
              ...info,
            },
          };
          const durableId = info.persistent_media_id || info.file_name;
          if (durableId) {
            item.resultFileNames = {
              ...(item.resultFileNames || {}),
              [resultId]: durableId,
            };
          }
          item.syncCompletedOutputs?.(
            item.resultTileIds || [],
            item.resultThumbnails || {},
          );
          updated++;
        }
      }
    }
    if (updated > 0) {
      console.log(
        "[WorkflowTrackerAudit] post-reload identity promotion",
        JSON.stringify({
          requested: entries.length,
          updated,
          durableAsb: entries.filter(([, info]) =>
            /^[A-Za-z0-9_-]{32,1024}$/.test(
              String(info.persistent_media_id || ""),
            ),
          ).length,
        }),
      );
      this._emitStateChanged();
    }
    return updated;
  }
  stopJob(
    jobId,
    {
      pageReloaded = false,
      stopOrigin = null,
      stopReason = null,
      stopSource = null,
    } = {},
  ) {
    const job = this._jobs.get(jobId);
    if (job?._manualRegenRequests?.length) job._manualRegenRequests = [];
    if (job?._manualRegenInFlight) {
      const manualJob = [...this._jobs.values()].find(
        (candidate) =>
          candidate !== job &&
          candidate.items?.some((item) => item.id === job._manualRegenInFlight),
      );
      if (manualJob && !manualJob.isDone)
        this.stopJob(manualJob.id, {
          pageReloaded,
          stopOrigin,
          stopReason,
          stopSource,
        });
    }
    if (
      !job &&
      window.workflowExecutor?._singleNodeSession?.stopJob(jobId, stopSource)
    )
      return true;
    if (this._pendingCorrelationReset?.jobId === jobId)
      this._pendingCorrelationReset = null;
    if (job && !pageReloaded) {
      for (const item of job.items || []) {
        window.flowV2CorrelationBroker?.disarm?.(item, "superseded", {
          discardOnStop: true,
        });
      }
    }
    this._webRecovery?.stop(jobId);
    if (!job) return false;
    if (job.isDone) return true;
    this._recordHistoryDiagnostic(job, "stop", null, stopSource || stopReason);
    const wasPaused = job.state === "paused";
    job.state = "stopped";
    job.completedAt = Date.now();
    job.stopOrigin = stopOrigin === "user" ? "user" : null;
    const normalizedStopReason =
      typeof stopReason === "string" ? stopReason.trim() : "";
    if (normalizedStopReason)
      job.stopReason = normalizedStopReason.slice(0, 1e3);
    const normalizedStopSource =
      typeof stopSource === "string" ? stopSource.trim() : "";
    if (normalizedStopSource)
      job.stopSource = normalizedStopSource.slice(0, 100);
    console.warn(
      "[PromptQueue] job stopped",
      JSON.stringify({
        jobId: job.id,
        owner: job.owner || null,
        stopOrigin: job.stopOrigin,
        stopReason: job.stopReason || null,
        stopSource: job.stopSource || null,
        pageReloaded: pageReloaded === true,
        historyRoute: this._historyRoute(job.items),
        flowApiVersions: this._historyApiVersions(job.items),
        durationMs: Math.max(
          0,
          Number(job.completedAt) - Number(job.createdAt || job.completedAt),
        ),
        completed: Number(job.completedCount) || 0,
        failed: Number(job.failedCount) || 0,
        unfinished: (job.items || []).filter((item) => !item.isTerminal).length,
      }),
    );
    window.FlowApiAdapter?.removeCheckpointsForJob?.(jobId).catch?.(() => {});
    window.FlowApiV2CheckpointStore?.removeForJob?.(jobId).catch?.(() => {});
    if (
      wasPaused &&
      ![...this._jobs.values()].some((other) => other.state === "paused")
    ) {
      this._editorExecutor.resume();
      if (!pageReloaded && window.MessageBridge) {
        MessageBridge.sendToContentScript("pq:pauseExecution", {
          paused: false,
        }).catch(() => {});
      }
      console.log(
        "[PromptQueue] stopped job released editor pause",
        JSON.stringify({ jobId }),
      );
    }
    if (
      window.ExecutionGate &&
      job._executionToken &&
      !job._executionTokenManagedByCaller
    ) {
      ExecutionGate.cancel(job._executionToken);
      job._executionToken = null;
    }
    this._itemQueue = this._itemQueue.filter((i) => i.jobId !== jobId);
    job.items.forEach((item) => {
      if (
        item.isTerminal ||
        (job.chain &&
          (item === this._editorExecutor.currentItem ||
            ["SUBMITTED", "MONITORING"].includes(item.state)))
      )
        return;
      if (job.chain) {
        item.state = QueueItem.STATE.BLOCKED;
        item.errorType = "blocked_by_previous";
        item.error = "CHAIN_STOPPED_BY_USER";
        item.dependency = {
          ...(item.dependency || {}),
          state: "blocked",
          errorCode: "chain_stopped",
          resolvedRefFileIds: [],
        };
        job.failedCount++;
      } else {
        item.state = QueueItem.STATE.CANCELLED;
        if (item.error === "FLOW_RECOVERY_QUEUED") item.error = null;
      }
      item.completedAt = Date.now();
    });
    if (!pageReloaded) {
      for (const item of job.items) {
        window.flowV2CorrelationBroker?.disarm?.(
          item,
          window.FlowV2CorrelationProtocol?.STATES?.SUPERSEDED,
        );
      }
    }
    const currentItem = this._editorExecutor.currentItem;
    if (currentItem && currentItem.jobId === jobId) {
      if (!currentItem.isTerminal)
        currentItem.state = QueueItem.STATE.CANCELLED;
      this._editorExecutor.interruptCurrentItem();
    }
    this._tileMonitor.abortJob(jobId);
    this._downloadQueue = this._downloadQueue.filter((d) => d.jobId !== jobId);
    if (!job._resolved) {
      job._resolved = true;
      const allResultTileIds = [];
      const allResultThumbnails = {};
      const allResultFileNames = {};
      const allResultProviderUrls = {};
      const allResultFrameFileIds = [];
      const allResultFrameFileNames = {};
      const allResultFrameThumbnails = {};
      const allResultFrameProviderUrls = {};
      const apiResultTileIds = [];
      const failedPrompts = [];
      let _apiCount = 0,
        _domCount = 0;
      for (const item of job.items) {
        if (item.resultTileIds?.length > 0) {
          allResultTileIds.push(...item.resultTileIds);
          Object.assign(allResultThumbnails, item.resultThumbnails || {});
          Object.assign(allResultFileNames, item.resultFileNames || {});
          Object.assign(allResultProviderUrls, item.resultProviderUrls || {});
          if (item.genMode === "api") {
            _apiCount++;
            apiResultTileIds.push(...item.resultTileIds);
          } else _domCount++;
        }
        if (item.resultFrameFileIds?.length > 0) {
          allResultFrameFileIds.push(...item.resultFrameFileIds);
          Object.assign(
            allResultFrameFileNames,
            item.resultFrameFileNames || {},
          );
          Object.assign(
            allResultFrameThumbnails,
            item.resultFrameThumbnails || {},
          );
          Object.assign(
            allResultFrameProviderUrls,
            item.resultFrameProviderUrls || {},
          );
        }
        if (
          (item.state !== QueueItem.STATE.CANCELLED ||
            (!item._apiDispatchStarted &&
              !item.flowApiAccepted &&
              ["quota_exceeded", "per_model_daily", "tier_restricted"].includes(
                item.errorType,
              ))) &&
          (item.error ||
            (item.isTerminal &&
              (!item.resultTileIds || item.resultTileIds.length === 0)))
        ) {
          failedPrompts.push({
            index: item.promptIndex,
            prompt: item.prompt,
            genMode: item.genMode || null,
            state: item.state,
            errorType: item.errorType || null,
            error: item.error || "Stopped by user",
            timestamp: item.completedAt || Date.now(),
          });
        }
      }
      job._resolve?.({
        jobId: job.id,
        completed: job.completedCount,
        failed: job.failedCount,
        stopped: true,
        stopOrigin: job.stopOrigin,
        stopReason: job.stopReason || null,
        stopSource: job.stopSource || null,
        durationMs: Math.max(
          0,
          Number(job.completedAt) - Number(job.createdAt || job.completedAt),
        ),
        interrupted: job.interrupted === true,
        resultTileIds: allResultTileIds,
        resultThumbnails: allResultThumbnails,
        resultFileNames: allResultFileNames,
        resultProviderUrls: allResultProviderUrls,
        refFileIdsUsed: this._historyRefFileIds(job.items),
        flowApiVersions: this._historyApiVersions(job.items),
        historyRoute: this._historyRoute(job.items),
        errorDetails: this._historyErrorDetails(job.items),
        frameFileIds: allResultFrameFileIds,
        frameFileNames: allResultFrameFileNames,
        frameThumbnails: allResultFrameThumbnails,
        frameProviderUrls: allResultFrameProviderUrls,
        attempts: job.items.map((item) => ({
          attemptId: item.attemptId || item.id,
          flowOperationId: item.flowOperationId || null,
          correlationState: item.correlationState || null,
          correlationReceipt: item.flowCorrelationReceipt
            ? {
                schemaVersion: item.flowCorrelationReceipt.schemaVersion,
                strong: item.flowCorrelationReceipt.strong === true,
                operationIds: [
                  ...(item.flowCorrelationReceipt.operationIds || []),
                ],
                mediaIds: [...(item.flowCorrelationReceipt.mediaIds || [])],
                children: (item.flowCorrelationReceipt.children || []).map(
                  (child) => ({ ...child }),
                ),
                errorCodes: [...(item.flowCorrelationReceipt.errorCodes || [])],
              }
            : null,
          expectedQuantity: Math.max(
            1,
            parseInt(item.settings?.quantity, 10) || 1,
          ),
          outputs: Array.isArray(item.outputs)
            ? item.outputs.map((output) => ({ ...output }))
            : [],
        })),
        apiResultTileIds,
        genMode: _apiCount > 0 ? (_domCount > 0 ? "mixed" : "api") : "web",
        flowDriverKey: job.items.every(
          (item) => item._flowDriverKey === "flow_v2",
        )
          ? "flow_v2"
          : null,
        failedPrompts: failedPrompts.length > 0 ? failedPrompts : [],
        noRetry: job.items.some((item) => item.noRetry === true),
        downloadedTileIds: this._downloadHistory
          .filter(
            (entry) => entry.jobId === job.id && entry.state === "COMPLETED",
          )
          .map((entry) => entry.tileId),
        failedDownloadTileIds: this._downloadHistory
          .filter((entry) => entry.jobId === job.id && entry.state === "FAILED")
          .map((entry) => entry.tileId),
      });
      job._resolve = null;
    }
    if (job.owner === "task" && window.eventBus) {
      const taskIds = [
        ...new Set(job.items.map((item) => item._taskId).filter(Boolean)),
      ];
      for (const taskId of taskIds) {
        const taskItems = job.items.filter((item) => item._taskId === taskId);
        const first = taskItems[0];
        const results = this._historyTaskResults(taskItems);
        window.eventBus.emit("task:status_changed", {
          taskId,
          task_id: taskId,
          status: "stopped",
          stop_origin: job.stopOrigin,
          source: "task",
          provider: "flow",
          prompt: taskItems
            .map((item) => item.prompt)
            .filter(Boolean)
            .join("\n\n"),
          prompt_count: taskItems.length,
          quantity: first.settings?.quantity || 1,
          media_type: first.settings?.genType || null,
          model: first.settings?.model || "",
          ratio: first.settings?.ratio || "",
          ref_file_ids: this._historyRefFileIds(taskItems).join(", "),
          result_file_ids: results.ids.join(", "),
          result_thumbnails: results.thumbnails,
          result_file_names: results.fileNames,
          result_provider_urls: results.providerUrls,
          error_reason:
            job.stopOrigin === "user"
              ? job.stopSource
                ? `USER_CANCELLED:${job.stopSource}`
                : "USER_CANCELLED"
              : job.stopReason || "BATCH_STOPPED",
          error_details: this._historyErrorDetails(taskItems),
          duration_ms: Math.max(
            0,
            job.completedAt - (job.createdAt || job.completedAt),
          ),
          flow_api_versions: this._historyApiVersions(taskItems),
          historyRoute: this._historyRoute(taskItems),
        });
      }
    }
    this._emitStateChanged();
    this._checkAllDone();
    this._releaseFlowBlocker?.({
      blockerRunId: job._blockerRunId || this._blockerRunId,
    });
    return true;
  }
  async stopJobAndPersist(
    jobId,
    {
      pageReloaded = false,
      stopOrigin = null,
      stopReason = null,
      stopSource = null,
    } = {},
  ) {
    await this._webRecovery?.ready;
    const projectId =
      this._jobs?.get?.(jobId)?.projectId ||
      window._currentProjectId ||
      window._flowProjectId ||
      null;
    const stopped = this.stopJob(jobId, {
      pageReloaded,
      stopOrigin,
      stopReason,
      stopSource,
    });
    await Promise.all([
      this._webRecovery?.writeTail,
      window.FlowApiAdapter?._checkpointWriteTail,
      window.FlowApiV2CheckpointStore?._writeTail,
    ]);
    if (
      stopped &&
      pageReloaded &&
      projectId &&
      globalThis.chrome?.runtime?.sendMessage
    ) {
      try {
        const cacheSync = await chrome.runtime.sendMessage({
          action: "ft:stopCachedJob",
          key: "toby_flow_tracker_snapshots",
          projectId,
          jobId,
          durableCleanupCommitted: true,
        });
        if (
          cacheSync?.ok === false &&
          cacheSync.error !== "CACHED_JOB_NOT_FOUND"
        ) {
          console.warn(
            "[FlowRecovery] interrupted tracker cache sync rejected",
            cacheSync.error,
          );
        }
      } catch (error) {
        console.warn(
          "[FlowRecovery] interrupted tracker cache sync failed",
          error?.message || error,
        );
      }
    }
    if (stopped)
      console.log(
        "[FlowRecovery] stop committed " + JSON.stringify({ job: jobId }),
      );
    return stopped;
  }
  pauseJob(jobId, reason = "manual") {
    const job = this._jobs.get(jobId);
    if (!job || !["running", "paused"].includes(job.state)) return;
    if (job.owner !== "prompts" && reason !== "api_unusual_activity") return;
    const pauseReason = reason || "manual";
    if (job.state === "paused") {
      const reasonPriority = {
        manual: 0,
        captcha: 1,
        provider_auth: 1,
        api_unusual_activity: 2,
      };
      const currentPriority = reasonPriority[job.pauseReason] ?? 0;
      const nextPriority = reasonPriority[pauseReason] ?? 0;
      if (!job.pauseReason || nextPriority > currentPriority)
        job.pauseReason = pauseReason;
      this._emitStateChanged();
      return;
    }
    this._recordHistoryDiagnostic(job, "pause", null, pauseReason);
    job.pauseReason = pauseReason;
    job.state = "paused";
    if (job.pauseReason === "manual")
      window.eventBus?.emit("execution:manual_pause", { jobId });
    this._editorExecutor.pause();
    if (window.MessageBridge) {
      MessageBridge.sendToContentScript("pq:pauseExecution", {
        paused: true,
      }).catch(() => {});
    }
    this._emitStateChanged();
  }
  _apiGenerationRetryLimit(
    item,
    driver = item.flowApiDriver || item.errorPolicy?.driver,
  ) {
    if (driver !== "v2")
      return Math.max(
        0,
        Number(window.FlowApiAdapter?._rl?.()?.max_retries) || 0,
      );
    if (window.featureGate?.canUseRetryOnFail?.() === false) return 0;
    try {
      const n = window.ExecutionConfig?.getMaxRetries?.();
      return Number.isInteger(n) && n >= 0 && n <= 10 ? n : 0;
    } catch (_) {
      return 0;
    }
  }
  _captchaRecoveryMode() {
    try {
      return window.ExecutionConfig?.getFlowCaptchaRecoveryMode?.() || null;
    } catch (error) {
      console.warn(
        "[PromptQueue] captcha recovery policy unavailable; fail closed:",
        error?.message || error,
      );
      return null;
    }
  }
  _isApiUnusualActivity(value) {
    const policy = value?.errorPolicy || {};
    const detail = value?.flowApiFailureDetail || {};
    return [value?.errorType, policy.errorType, detail.errorType].some(
      (errorType) => errorType === "bot_detected",
    );
  }
  _notifyApiUnusualModeAdvice(job, item, recoveryMode) {
    if (
      !job ||
      job.owner !== "prompts" ||
      recoveryMode !== "pause_resume" ||
      (item?.retrySubmitCount || 0) >=
        this._apiGenerationRetryLimit(item, "v2") ||
      job._apiUnusualModeAdviceEmitted === true
    )
      return;
    job._apiUnusualModeAdviceEmitted = true;
    this._broadcastFlowError("execution:api_unusual_activity", {
      code:
        item?.flowApiFailureDetail?.code ||
        item?.errorPolicy?.code ||
        item?.error ||
        null,
      errorType:
        item?.errorType ||
        item?.flowApiFailureDetail?.errorType ||
        "bot_detected",
      jobId: job.id || null,
      itemId: item?.id || null,
      owner: job.owner || null,
      recoveryMode,
    });
  }
  _blockApiUnusualActivityJob(job, culprit) {
    if (!job || !culprit) return false;
    const reason = culprit.error || "PUBLIC_ERROR_UNUSUAL_ACTIVITY";
    culprit.auditLifecycle?.("queue_recovery_decision", {
      action: "block_new_submissions",
      retrySubmitCount: culprit.retrySubmitCount || 0,
    });
    this._recordHistoryDiagnostic(
      job,
      "dispatch_blocked",
      culprit,
      culprit.errorPolicy?.code || reason,
    );
    job._apiUnusualBlocked = reason;
    job.stopReason = reason;
    this._itemQueue = this._itemQueue.filter(
      (candidate) =>
        candidate.jobId !== job.id ||
        candidate._apiDispatchStarted === true ||
        candidate.flowApiAccepted === true ||
        !!candidate.operationId ||
        !!candidate.flowOperationId,
    );
    for (const candidate of job.items || []) {
      if (candidate === culprit) continue;
      const accepted =
        candidate._apiDispatchStarted === true ||
        candidate.flowApiAccepted === true ||
        !!candidate.operationId ||
        !!candidate.flowOperationId;
      if (accepted) {
        candidate._apiStopFurtherMutations = true;
        continue;
      }
      if (candidate.isTerminal) continue;
      candidate._apiDispatchRevoked = true;
      candidate._apiWaitingSlot = false;
      candidate.state = QueueItem.STATE.CANCELLED;
      candidate.completedAt = Date.now();
    }
    this._emitStateChanged();
    return true;
  }
  _pauseApiUnusualActivityJob(item, failure) {
    const job = item?.jobId ? this._jobs.get(item.jobId) : null;
    const driver =
      failure?.driver || item?.flowApiDriver || item?.errorPolicy?.driver;
    if (!job || driver !== "v2" || !this._isApiUnusualActivity(failure))
      return false;
    item._apiUnusualActivityDetected = true;
    item._apiConfirmedRejected = true;
    const recoveryMode = this._captchaRecoveryMode();
    this._recordHistoryDiagnostic(
      job,
      "api_bot_gate",
      item,
      failure?.code,
      recoveryMode,
    );
    const resumeExhausted =
      recoveryMode === "pause_resume" &&
      (item.retrySubmitCount || 0) >= this._apiGenerationRetryLimit(item, "v2");
    this._notifyApiUnusualModeAdvice(job, item, recoveryMode);
    if (
      recoveryMode === "stop_batch" ||
      recoveryMode == null ||
      resumeExhausted
    ) {
      this._blockApiUnusualActivityJob(job, item);
    } else if (recoveryMode === "pause_resume" && job.state === "running") {
      this.pauseJob(job.id, "api_unusual_activity");
    }
    return true;
  }
  _settleConfirmedApiUnusualActivity(item, failure) {
    const job = item?.jobId ? this._jobs.get(item.jobId) : null;
    const driver =
      failure?.driver ||
      item?.errorPolicy?.driver ||
      item?.flowApiDriver ||
      item?.flowApiCandidateDriver;
    const stage = failure?.stage || item?.errorPolicy?.stage || "receipt";
    if (
      !job ||
      driver !== "v2" ||
      !this._isApiUnusualActivity(failure) ||
      failure?.ambiguous === true ||
      ["ambiguous", "accepted_poll"].includes(stage)
    )
      return false;
    const hasOperationIdentity = !!item.operationId || !!item.flowOperationId;
    if (stage === "receipt" && !hasOperationIdentity) {
      item.flowApiAccepted = false;
      item._apiDispatchStarted = false;
    }
    const acceptedOperation =
      hasOperationIdentity ||
      (item.flowApiAccepted === true && stage !== "receipt");
    if (acceptedOperation && stage !== "terminal") return false;
    item._apiUnusualActivityDetected = true;
    item._apiConfirmedRejected = true;
    const recoveryMode = this._captchaRecoveryMode();
    this._recordHistoryDiagnostic(
      job,
      "api_bot_settle",
      item,
      failure?.code,
      recoveryMode,
    );
    const resumeExhausted =
      recoveryMode === "pause_resume" &&
      (item.retrySubmitCount || 0) >= this._apiGenerationRetryLimit(item, "v2");
    this._notifyApiUnusualModeAdvice(job, item, recoveryMode);
    item.flowApiFailureDetail = {
      ...(item.flowApiFailureDetail || {}),
      code: failure.code || "PUBLIC_ERROR_UNUSUAL_ACTIVITY",
      grpcCode: failure.grpcCode ?? null,
      grpcReason: failure.grpcReason || null,
      providerErrorCodes: failure.providerErrorCodes || [],
      errorType: failure.errorType || item.errorType || null,
      driver: "v2",
      stage,
      ambiguous: false,
    };
    if (
      recoveryMode === "stop_batch" ||
      recoveryMode == null ||
      resumeExhausted
    ) {
      item.noRetry = true;
      item.state = QueueItem.STATE.FAILED;
      item.completedAt = Date.now();
      item._apiManualResumeExhausted = true;
      this._blockApiUnusualActivityJob(job, item);
      if (!item._failureAccounted) {
        item._failureAccounted = true;
        job.failedCount++;
      }
      this._notifyFlowError(
        `${item.error || "PUBLIC_ERROR_UNUSUAL_ACTIVITY"} \u2014 batch \u0111\xE3 d\u1EEBng.`,
        "error",
      );
      this._broadcastFlowError("execution:captcha_detected", {
        category: "captcha",
        text: item.error || "PUBLIC_ERROR_UNUSUAL_ACTIVITY",
        jobId: job.id,
        itemId: item.id,
        recoveryMode: recoveryMode || "missing",
        action: "stop_batch",
        resumeExhausted,
      });
      this._onItemCompleted(item);
      this._broadcastToFlowTabs("pq:recoveryTrace", {
        event: "unusual_settled",
        jobId: job.id,
        itemId: item.id,
        stage,
        recoveryMode: recoveryMode || "missing",
        pauseReason: job.pauseReason || null,
        state: item.state,
        genMode: item.genMode,
        manualPending: false,
      });
      this._emitStateChanged();
      return true;
    }
    if (acceptedOperation) {
      window.flowV2CorrelationBroker?.disarm?.(item, "superseded");
      item.flowApiAccepted = false;
      item.operationId = null;
      item.flowOperationId = null;
      item._apiDispatchStarted = false;
    }
    item.genMode = "api";
    if (!job._flowApiEngineLock) job._flowApiEngineLock = "api";
    if (recoveryMode === "normal_error") {
      if (!this._retryApiCaptchaAsNormal(item)) return false;
    } else {
      this.pauseJob(job.id, "api_unusual_activity");
      if (!this._holdApiItemForManualResume(item)) return false;
    }
    console.info(
      "[PromptQueue/UnusualSettled]",
      JSON.stringify({
        jobId: job.id,
        itemId: item.id,
        stage,
        recoveryMode,
        pauseReason: job.pauseReason || null,
        state: item.state,
        genMode: item.genMode,
        manualPending: item._apiManualResumePending === true,
      }),
    );
    this._broadcastToFlowTabs("pq:recoveryTrace", {
      event: "unusual_settled",
      jobId: job.id,
      itemId: item.id,
      stage,
      recoveryMode,
      pauseReason: job.pauseReason || null,
      state: item.state,
      genMode: item.genMode,
      manualPending: item._apiManualResumePending === true,
    });
    this._emitStateChanged();
    return true;
  }
  _recoverApiUnusualActivityItem(item, failure = null) {
    const job = item?.jobId ? this._jobs.get(item.jobId) : null;
    const policy = item?.errorPolicy || failure || {};
    const driver = policy.driver || failure?.driver || item?.flowApiDriver;
    if (
      !job ||
      item?.genMode !== "api" ||
      driver !== "v2" ||
      item.resultTileIds?.length > 0 ||
      (!this._isApiUnusualActivity(item) &&
        !this._isApiUnusualActivity(failure))
    )
      return false;
    if (
      policy.ambiguous === true ||
      ["ambiguous", "accepted_poll"].includes(policy.stage) ||
      ((item.operationId || item.flowOperationId) &&
        policy.stage !== "terminal")
    )
      return false;
    const recoveryMode = this._captchaRecoveryMode();
    if (
      recoveryMode !== "stop_batch" &&
      recoveryMode != null &&
      policy.stage === "terminal" &&
      (item.operationId || item.flowOperationId)
    ) {
      window.flowV2CorrelationBroker?.disarm?.(item, "superseded");
      item.flowApiAccepted = false;
      item.operationId = null;
      item.flowOperationId = null;
      item._apiDispatchStarted = false;
    }
    if (recoveryMode === "normal_error") {
      return this._retryApiCaptchaAsNormal(item);
    }
    if (recoveryMode === "pause_resume") {
      return this._holdApiItemForManualResume(item);
    }
    item.noRetry = true;
    item.state = QueueItem.STATE.FAILED;
    item.completedAt = Date.now();
    item._apiManualResumeExhausted = true;
    item.auditLifecycle?.("api_unusual_activity_recovery", {
      action: "stop_batch",
      recoveryMode: recoveryMode || "missing",
    });
    this._blockApiUnusualActivityJob(job, item);
    if (!item._failureAccounted) {
      item._failureAccounted = true;
      job.failedCount++;
    }
    this._notifyFlowError(
      `${item.error || "PUBLIC_ERROR_UNUSUAL_ACTIVITY"} \u2014 batch \u0111\xE3 d\u1EEBng.`,
      "error",
    );
    this._broadcastFlowError("execution:captcha_detected", {
      category: "captcha",
      text: item.error || "PUBLIC_ERROR_UNUSUAL_ACTIVITY",
      jobId: job.id,
      itemId: item.id,
      recoveryMode: recoveryMode || "missing",
      action: "stop_batch",
    });
    this._onItemCompleted(item);
    this._emitStateChanged();
    return true;
  }
  _resetApiAttemptForRetry(item) {
    if (!item) return;
    const retryReason =
      item.error ||
      item.flowApiFailureDetail?.code ||
      item.errorPolicy?.code ||
      item.flowApiFailureDetail?.grpcReason ||
      item.errorPolicy?.grpcReason ||
      null;
    if (retryReason) {
      item.retryReason = String(retryReason);
      item.retryReasonType = item.errorType || null;
    }
    window.flowV2CorrelationBroker?.disarm?.(item, "superseded");
    item.flowOperationId = null;
    item.operationId = null;
    item.mediaId = null;
    item.flowApiAccepted = false;
    item.flowApiLineage = [];
    item._apiDispatchStarted = false;
    item.flowApiDispatchedAt = null;
    item.flowApiOperationDeadlineAt = null;
    item.submittedAt = null;
    item.providerCompletedAt = null;
    item.providerPausedAt = null;
  }
  _retryApiNormalFailureAtBatchTail(item, failure) {
    const job = item?.jobId ? this._jobs.get(item.jobId) : null;
    const timeoutWithoutReceipt =
      failure?.code === "REQUEST_TIMEOUT" &&
      failure.stage === "ambiguous" &&
      !failure.operationId &&
      !item?.operationId &&
      !item?.flowOperationId &&
      !(item?.flowApiLineage || []).some((entry) => entry?.operationId) &&
      !(item?.outputs || []).some(
        (output) => output.operationId || output.mediaId || output.resultId,
      );
    if (
      !job ||
      job.state !== "running" ||
      item.genMode !== "api" ||
      failure?.driver !== "v2" ||
      item.state === QueueItem.STATE.CANCELLED ||
      item.state === QueueItem.STATE.PARTIAL_FAIL ||
      item.noRetry === true ||
      item._failureAccounted === true ||
      (failure.ambiguous === true && !timeoutWithoutReceipt) ||
      item.resultTileIds?.length > 0 ||
      item.outputs?.some((output) => output.status === "completed") ||
      !["unknown", "content_blocked", "server_unavailable"].includes(
        item.errorType || failure.errorType || "unknown",
      )
    )
      return false;
    const lineage = item.flowApiLineage || [];
    const ownedIds = [
      item.operationId,
      item.flowOperationId,
      failure.operationId,
      ...lineage.map((entry) => entry.operationId),
    ].filter(Boolean);
    const rejectedReceipt =
      failure.stage === "receipt" &&
      ownedIds.length === 0 &&
      item.flowApiAccepted !== true &&
      ((Number.isInteger(failure.grpcCode) && failure.grpcCode > 0) ||
        failure.providerErrorCodes?.length > 0);
    const failedOutputs = failure.diagnostic?.outputs;
    const isFailedState = (state) =>
      state === "failed" ||
      window.FlowApiV2CheckpointStore?._terminalKind?.(state) === "failed";
    const failedOperations =
      failure.stage === "terminal" &&
      Array.isArray(failedOutputs) &&
      failedOutputs.length > 0 &&
      failedOutputs.every(
        (output) => output.operationId && isFailedState(output.state),
      ) &&
      lineage.every(
        (entry) => entry.operationId && isFailedState(entry.state),
      ) &&
      ownedIds.every((id) =>
        failedOutputs.some((output) => output.operationId === id),
      );
    if (!rejectedReceipt && !failedOperations && !timeoutWithoutReceipt)
      return false;
    const maxRetries = this._apiGenerationRetryLimit(item, "v2");
    if ((item.retrySubmitCount || 0) >= maxRetries) {
      item.noRetry = true;
      if (item.errorPolicy) item.errorPolicy.retryable = false;
      item.auditLifecycle?.("api_normal_retry_exhausted", {
        maxRetries,
        retrySubmitCount: item.retrySubmitCount || 0,
      });
      return false;
    }
    const code = failure.code || item.errorPolicy?.code || item.error;
    item._apiNormalRetryErrorDetails = this._historyErrorDetails([item]);
    this._resetApiAttemptForRetry(item);
    item.retrySubmitCount = (item.retrySubmitCount || 0) + 1;
    item.attemptId = crypto.randomUUID();
    item.error = null;
    item.errorType = null;
    item.errorPolicy = null;
    item.flowApiFailureDetail = null;
    item.noRetry = false;
    item.completedAt = null;
    item.outputs = [];
    item._apiWaitingSlot = false;
    item.state = QueueItem.STATE.RETRY_SUBMIT;
    item._apiNormalRetryTail = true;
    item._apiDeferredQueueOrder = this._apiDeferredQueueSequence =
      (this._apiDeferredQueueSequence || 0) + 1;
    this.enqueue(item);
    const diagnostic = {
      jobId: item.jobId,
      itemId: item.id,
      code,
      stage: failure.stage,
      grpcCode: failure.grpcCode ?? null,
      retrySubmitCount: item.retrySubmitCount,
      maxRetries,
      retiredOperations: [...new Set(ownedIds)].length,
      queuePosition: "batch_tail",
      uncertainSubmitReplay: timeoutWithoutReceipt,
    };
    item.auditLifecycle?.("api_normal_error_retry_queued", diagnostic);
    console.info("[FlowApiRouting/NormalRetry]", JSON.stringify(diagnostic));
    this._emitStateChanged();
    return true;
  }
  _retryApiCaptchaAsNormal(item) {
    if (
      !item ||
      item.noRetry === true ||
      this._captchaRecoveryMode() !== "normal_error"
    )
      return false;
    const job = item.jobId ? this._jobs.get(item.jobId) : null;
    if (!job || job.state !== "running" || item.resultTileIds?.length > 0)
      return false;
    const stage = item.errorPolicy?.stage;
    if (
      ["ambiguous", "accepted_poll"].includes(stage) ||
      item.errorPolicy?.ambiguous === true
    )
      return false;
    const maxRetries = this._apiGenerationRetryLimit(item);
    if ((item.retrySubmitCount || 0) >= maxRetries) return false;
    item.retrySubmitCount = (item.retrySubmitCount || 0) + 1;
    item.attemptId = crypto.randomUUID();
    this._resetApiAttemptForRetry(item);
    item.error = null;
    item.errorType = null;
    item.errorPolicy = null;
    item.flowApiFailureDetail = null;
    item._apiUnusualActivityDetected = false;
    item._apiConfirmedRejected = false;
    item.noRetry = false;
    item.completedAt = null;
    item.outputs = [];
    item.state = QueueItem.STATE.RETRY_SUBMIT;
    this.enqueue(item);
    item.auditLifecycle?.("api_captcha_normal_retry", {
      retrySubmitCount: item.retrySubmitCount,
      maxRetries,
    });
    this._emitStateChanged();
    return true;
  }
  _holdApiItemForManualResume(item) {
    const job = item?.jobId ? this._jobs.get(item.jobId) : null;
    const unusualActivity =
      item?._apiUnusualActivityDetected === true ||
      this._isApiUnusualActivity(item);
    if (
      !job ||
      item.genMode !== "api" ||
      (job.owner !== "prompts" && !unusualActivity)
    )
      return false;
    const isAuthRecovery = item.errorType === "auth_expired";
    if (
      !isAuthRecovery &&
      !["bot_detected", "captcha_failed"].includes(item.errorType)
    )
      return false;
    if (!isAuthRecovery && this._captchaRecoveryMode() !== "pause_resume")
      return false;
    const confirmedTerminal = item.errorPolicy?.stage === "terminal";
    if (
      item.errorPolicy?.ambiguous ||
      ["ambiguous", "accepted_poll"].includes(item.errorPolicy?.stage) ||
      ((item.operationId || item.flowOperationId) && !confirmedTerminal)
    )
      return false;
    const maxRetries = this._apiGenerationRetryLimit(item);
    if ((item.retrySubmitCount || 0) >= maxRetries) {
      item._apiManualResumeExhausted = true;
      console.info(
        `[PromptQueue] Flow API manual resume exhausted (${item.retrySubmitCount || 0}/${maxRetries})`,
      );
      return false;
    }
    item._apiManualResumeExhausted = false;
    if (confirmedTerminal) {
      window.flowV2CorrelationBroker?.disarm?.(item, "failed");
      item.operationId = null;
      item.flowOperationId = null;
      item.flowApiAccepted = false;
    }
    if (job.owner === "workflow" && unusualActivity) {
      item._apiHeldHistoryErrorDetails = this._historyErrorDetails([item]);
    }
    item.providerPausedAt = Date.now();
    item.state = QueueItem.STATE.WAITING_PROVIDER;
    item.completedAt = null;
    item._apiWaitingSlot = false;
    item._apiManualResumePending = true;
    item.outputs = [];
    item.resultTileIds = [];
    item.resultThumbnails = {};
    item.resultFileNames = {};
    item.resultProviderUrls = {};
    this.pauseJob(
      job.id,
      isAuthRecovery
        ? "provider_auth"
        : unusualActivity
          ? "api_unusual_activity"
          : "captcha",
    );
    if (isAuthRecovery) {
      this._notifyFlowError(
        window.I18n?.t?.("gen.flowApiAuthRecovering") ||
          "Flow API needs to reconnect. TobyFlow paused the batch and is restoring access\u2026",
        "warning",
      );
      MessageBridge.sendToContentScript("pq:apiAuthStatus", {
        state: "paused",
      }).catch(() => {});
      this._startApiAuthRecovery(job).catch((error) => {
        console.info(
          "[PromptQueue] Flow API auto auth recovery failed:",
          error?.message || error,
        );
      });
    } else {
      this._handleFlowError({
        category: "captcha",
        text: item.error || null,
        jobId: job.id,
        itemId: item.id,
        source: "api",
      });
    }
    item.auditLifecycle?.("api_waiting_user_resume", {
      errorType: item.errorType,
      retrySubmitCount: item.retrySubmitCount || 0,
      maxRetries,
    });
    this._emitStateChanged();
    return true;
  }
  _failApiPreDispatchRecovery(item, reason) {
    const job = item?.jobId ? this._jobs.get(item.jobId) : null;
    if (!job || job.state === "stopped" || item.isTerminal) return;
    item.state = QueueItem.STATE.FAILED;
    item.completedAt = Date.now();
    item._apiPreDispatchRecovery = false;
    item._apiWaitingSlot = false;
    item.noRetry = true;
    item.error = reason || "FLOW_API_V2_SESSION_RECOVERY_FAILED";
    item.errorType = "auth_expired";
    item.auditLifecycle?.("api_pre_dispatch_recovery_failed", {
      reason: item.error,
    });
    this._onItemCompleted(item);
  }
  _deferSafeApiPreDispatchItem(item, failure) {
    const job = item?.jobId ? this._jobs.get(item.jobId) : null;
    const detail =
      typeof failure === "string"
        ? {
            code: failure,
            driver: "v2",
            stage: "pre_dispatch",
            dispatchStarted: false,
          }
        : failure || {};
    const code = String(detail.code || detail.reason || detail.error || "");
    const safeLocalCodes = new Set([
      "BRIDGE_REQUEST_TIMEOUT",
      "BRIDGE_CHANNEL_CLOSED",
      "EMPTY_RESPONSE",
      "V2_PAGE_RELAY_UNAVAILABLE",
      "V2_PAGE_COMMAND_TIMEOUT",
      "V2_PAGE_RELOADING",
      "V2_CONTENT_SCRIPT_RECOVERING",
      "V2_PAGE_SESSION_NOT_READY",
      "page_reloading",
      "content_script_recovering",
      "fresh_page_session_required",
      "session_refresh_timeout",
      "web_dom_dispatch_active",
      "REQUEST_TIMEOUT",
      "TRANSPORT_FAILED",
    ]);
    if (
      !job ||
      job.state !== "running" ||
      detail.driver !== "v2" ||
      detail.stage !== "pre_dispatch" ||
      detail.dispatchStarted === true ||
      detail.ambiguous === true ||
      detail.operationId ||
      item.flowApiAccepted === true ||
      item._apiDispatchStarted === true ||
      item.operationId ||
      item.flowOperationId ||
      !safeLocalCodes.has(code)
    )
      return false;
    if (code !== "web_dom_dispatch_active")
      window.FlowApiDriverResolver?.invalidate?.();
    const maxRetries = this._apiGenerationRetryLimit(item, "v2");
    if ((item.retrySubmitCount || 0) >= maxRetries) return false;
    item.retrySubmitCount = (item.retrySubmitCount || 0) + 1;
    item.attemptId = crypto.randomUUID();
    this._resetApiAttemptForRetry(item);
    item.error = null;
    item.errorType = null;
    item.errorPolicy = null;
    item.noRetry = false;
    item.completedAt = null;
    item.state = QueueItem.STATE.RETRY_SUBMIT;
    item._apiDeferredQueueOrder = ++this._apiDeferredQueueSequence;
    this.enqueue(item);
    item.auditLifecycle?.("api_pre_dispatch_page_transition_deferred", {
      reason: code,
      retrySubmitCount: item.retrySubmitCount,
      maxRetries,
      queuePosition: "batch_tail",
    });
    console.info(
      "[FlowApiRouting/PreDispatchDeferred]",
      JSON.stringify({
        itemId: item.id,
        jobId: item.jobId,
        reason: code,
        retrySubmitCount: item.retrySubmitCount,
        maxRetries,
        queuePosition: "batch_tail",
      }),
    );
    this._emitStateChanged();
    return true;
  }
  _deferApiPreDispatchPageTransition(item, reason) {
    return this._deferSafeApiPreDispatchItem(item, {
      code: reason,
      driver: "v2",
      stage: "pre_dispatch",
      dispatchStarted: false,
    });
  }
  _recoverApiPreDispatchItem(item, normalized) {
    const job = item?.jobId ? this._jobs.get(item.jobId) : null;
    if (
      !job ||
      job.owner === "prompts" ||
      normalized?.driver !== "v2" ||
      normalized?.stage !== "pre_dispatch" ||
      normalized?.dispatchStarted === true
    )
      return false;
    if (
      [
        "bot_detected",
        "captcha_failed",
        "quota_exceeded",
        "per_model_daily",
        "tier_restricted",
        "policy_blocked",
      ].includes(normalized?.errorType)
    )
      return false;
    const maxAttempts = this._apiGenerationRetryLimit(item, "v2");
    if ((item.retrySubmitCount || 0) >= maxAttempts) {
      this._failApiPreDispatchRecovery(
        item,
        "FLOW_API_V2_SESSION_RECOVERY_EXHAUSTED",
      );
      return true;
    }
    item.state = QueueItem.STATE.WAITING_PROVIDER;
    item.completedAt = null;
    item._apiWaitingSlot = false;
    item._apiPreDispatchRecovery = true;
    this._emitStateChanged();
    if (job._apiPreDispatchRecoveryPromise) return true;
    job._apiPreDispatchRecoveryPromise = (async () => {
      const readiness = await window.FlowApiSessionCoordinator?.reconnect?.({
        driver: "v2",
        surface: job.owner === "workflow" ? "workflow" : "task",
        item,
        projectId: item.projectId || null,
        userInitiated: false,
        recoveryAuthorized: true,
        force: true,
      });
      if (this._jobs.get(job.id) !== job || job.state === "stopped")
        return false;
      const waiting = job.items.filter(
        (candidate) =>
          candidate.state === QueueItem.STATE.WAITING_PROVIDER &&
          candidate._apiPreDispatchRecovery === true,
      );
      if (readiness?.ready !== true) {
        for (const candidate of waiting) {
          this._failApiPreDispatchRecovery(
            candidate,
            readiness?.reason || "FLOW_API_V2_SESSION_RECOVERY_FAILED",
          );
        }
        this._emitStateChanged();
        return false;
      }
      for (const candidate of waiting) {
        if (
          this._jobs.get(job.id) !== job ||
          job.state === "stopped" ||
          candidate.state === QueueItem.STATE.CANCELLED
        )
          continue;
        if (
          (candidate.retrySubmitCount || 0) >=
          this._apiGenerationRetryLimit(candidate, "v2")
        ) {
          this._failApiPreDispatchRecovery(
            candidate,
            "FLOW_API_V2_SESSION_RECOVERY_EXHAUSTED",
          );
          continue;
        }
        candidate.retrySubmitCount = (candidate.retrySubmitCount || 0) + 1;
        candidate.attemptId = crypto.randomUUID();
        this._resetApiAttemptForRetry(candidate);
        candidate.error = null;
        candidate.errorType = null;
        candidate.errorPolicy = null;
        candidate._apiPreDispatchRecovery = false;
        candidate.state = QueueItem.STATE.RETRY_SUBMIT;
        this.enqueue(candidate);
      }
      this._emitStateChanged();
      return true;
    })()
      .catch((error) => {
        console.info(
          "[PromptQueue] V2 pre-dispatch recovery failed:",
          error?.message || error,
        );
        if (this._jobs.get(job.id) === job && job.state !== "stopped") {
          for (const candidate of job.items.filter(
            (entry) =>
              entry.state === QueueItem.STATE.WAITING_PROVIDER &&
              entry._apiPreDispatchRecovery === true,
          )) {
            this._failApiPreDispatchRecovery(
              candidate,
              "FLOW_API_V2_SESSION_RECOVERY_FAILED",
            );
          }
          this._emitStateChanged();
        }
        return false;
      })
      .finally(() => {
        job._apiPreDispatchRecoveryPromise = null;
      });
    return true;
  }
  async _startApiAuthRecovery(job) {
    if (!job || job.owner !== "prompts" || job._apiAuthRecoveryPromise)
      return job?._apiAuthRecoveryPromise || false;
    job._apiAuthRecoveryPromise = (async () => {
      if (await this.resumeJob(job.id)) return true;
      while (this._jobs.get(job.id) === job && job.state === "paused") {
        await new Promise((resolve) => setTimeout(resolve, 3e3));
        if (this._jobs.get(job.id) !== job || job.state !== "paused")
          return false;
        let ready = null;
        const held = job.items.find(
          (item) =>
            item.state === QueueItem.STATE.WAITING_PROVIDER &&
            item._apiManualResumePending === true,
        );
        try {
          ready = await window.FlowApiSessionCoordinator?.check?.({
            driver: held?.flowApiDriver || held?.errorPolicy?.driver || null,
            surface: "gen",
            item: held || null,
            force: true,
            passive: true,
          });
        } catch (_) {}
        if (ready?.ready !== true) continue;
        const resumed = await this.resumeJob(job.id);
        if (resumed) {
          this._notifyFlowError(
            window.I18n?.t?.("gen.flowApiAuthRecovered") ||
              "Flow API reconnected \u2014 the batch is continuing.",
            "success",
          );
          MessageBridge.sendToContentScript("pq:apiAuthStatus", {
            state: "resumed",
          }).catch(() => {});
          return true;
        }
      }
      return false;
    })().finally(() => {
      job._apiAuthRecoveryPromise = null;
    });
    return job._apiAuthRecoveryPromise;
  }
  async resumeJob(jobId, options = {}) {
    this._lastResumeError = null;
    const job = this._jobs.get(jobId);
    if (job)
      this._broadcastToFlowTabs("pq:recoveryTrace", {
        event: "resume_enter",
        jobId: job.id,
        pauseReason: job.pauseReason || null,
        state: job.state,
        engineLock: job._flowApiEngineLock || null,
        items: job.items.map((item) => ({
          id: item.id,
          state: item.state,
          genMode: item.genMode,
          unusual: item._apiUnusualActivityDetected === true,
          manualPending: item._apiManualResumePending === true,
        })),
      });
    if (!job || job.state !== "paused") {
      this._lastResumeError = !job ? "JOB_NOT_FOUND" : "JOB_NOT_PAUSED";
      return false;
    }
    if (
      job._manualRegenInFlight ||
      job._manualRegenBatchPending ||
      job._manualRegenRequests?.length
    ) {
      this._lastResumeError = "MANUAL_REGEN_IN_PROGRESS";
      return false;
    }
    const hasJobDownloads =
      this._downloadQueue?.some((download) => download.jobId === job.id) ||
      this._currentDownloadItem?.jobId === job.id;
    if (job.items.every((item) => item.isTerminal) && !hasJobDownloads) {
      this._checkJobDone(job);
      this._lastResumeError = "JOB_ALREADY_GENERATED";
      return false;
    }
    if (this._flowCookieRecoveryJobId || job._flowCookieRecoveryInProgress) {
      this._lastResumeError = "COOKIE_RECOVERY_IN_PROGRESS";
      return false;
    }
    if (
      job.items.some(
        (item) =>
          item.state === QueueItem.STATE.RECOVERY_REQUIRED &&
          item.errorPolicy?.stage === "ambiguous",
      )
    ) {
      this._lastResumeError = "FLOW_RECOVERY_RESULT_UNVERIFIED";
      return false;
    }
    const heldApiItems = job.items.filter(
      (item) =>
        item.state === QueueItem.STATE.WAITING_PROVIDER &&
        item._apiManualResumePending === true,
    );
    const apiRecovery =
      heldApiItems.length > 0 ||
      job._flowApiEngineLock === "api" ||
      job.pauseReason === "api_unusual_activity";
    if (
      !apiRecovery &&
      this._webRecovery &&
      !(await this._webRecovery.resume(jobId))
    ) {
      this._lastResumeError = "FLOW_RECOVERY_RESUME_BLOCKED";
      return false;
    }
    if (this._jobs.get(jobId) !== job || job.state !== "paused") {
      this._lastResumeError = "JOB_STATE_CHANGED";
      return false;
    }
    if (heldApiItems.length > 0) {
      if (
        heldApiItems.some(
          (item) =>
            (item.retrySubmitCount || 0) >=
              this._apiGenerationRetryLimit(item) ||
            item.operationId ||
            item.flowOperationId ||
            item.errorPolicy?.ambiguous,
        )
      ) {
        this._lastResumeError = "FLOW_API_RETRY_NOT_AVAILABLE";
        return false;
      }
      if (job._apiResumeInProgress) {
        this._lastResumeError = "FLOW_API_RESUME_IN_PROGRESS";
        return false;
      }
      job._apiResumeInProgress = true;
      this._emitStateChanged();
      try {
        const representative = heldApiItems[0];
        const surface =
          job.owner === "workflow"
            ? "workflow"
            : job.owner === "task"
              ? "task"
              : "gen";
        const terminalStates = [
          QueueItem.STATE.COMPLETED,
          QueueItem.STATE.PARTIAL_FAIL,
          QueueItem.STATE.FAILED,
          QueueItem.STATE.CANCELLED,
          QueueItem.STATE.BLOCKED,
        ];
        const acceptedSiblingInFlight = job.items.some(
          (candidate) =>
            !heldApiItems.includes(candidate) &&
            !terminalStates.includes(candidate.state) &&
            (candidate._apiDispatchStarted === true ||
              candidate.flowApiAccepted === true ||
              !!candidate.operationId ||
              !!candidate.flowOperationId),
        );
        const readiness = await window.FlowApiSessionCoordinator?.reconnect?.({
          driver:
            representative?.flowApiDriver ||
            representative?.errorPolicy?.driver ||
            null,
          surface,
          item: representative || null,
          projectId: representative?.projectId || null,
          userInitiated: options.automatic !== true,
          recoveryAuthorized: options.automatic === true,
          preservePage: acceptedSiblingInFlight,
          force: true,
          forcePageReload: options.forcePageReload === true,
          recoveryReason: options.recoveryReason || null,
        });
        if (this._jobs.get(jobId) !== job || job.state !== "paused") {
          this._lastResumeError = "JOB_STATE_CHANGED";
          return false;
        }
        if (!readiness?.ready) {
          const detail =
            readiness?.detail || readiness?.reason || "FLOW_API_NOT_READY";
          this._lastResumeError = detail;
          console.info("[PromptQueue] Flow API resume blocked:", detail);
          this._notifyFlowError(
            `Flow API ch\u01B0a s\u1EB5n s\xE0ng (${detail}). M\u1EDF Google Flow r\u1ED3i b\u1EA5m Ti\u1EBFp t\u1EE5c l\u1EA1i.`,
            "warning",
          );
          this._emitStateChanged();
          return false;
        }
        if (
          heldApiItems.some(
            (item) =>
              (item.retrySubmitCount || 0) >=
                this._apiGenerationRetryLimit(item) ||
              item.state !== QueueItem.STATE.WAITING_PROVIDER ||
              item.operationId ||
              item.flowOperationId,
          )
        ) {
          this._lastResumeError = "FLOW_API_RETRY_NOT_AVAILABLE";
          return false;
        }
        for (const item of heldApiItems) {
          const captchaResume = ["bot_detected", "captcha_failed"].includes(
            item.errorType,
          );
          item.retrySubmitCount = (item.retrySubmitCount || 0) + 1;
          item.attemptId = crypto.randomUUID();
          this._resetApiAttemptForRetry(item);
          item.error = null;
          item.errorType = null;
          item.errorPolicy = null;
          item.flowApiFailureDetail = null;
          item._apiUnusualActivityDetected = false;
          item._apiConfirmedRejected = false;
          item.noRetry = false;
          item.completedAt = null;
          item._apiManualResumePending = false;
          item.state = QueueItem.STATE.RETRY_SUBMIT;
          if (captchaResume) {
            item._apiNormalRetryTail = true;
            item._apiDeferredQueueOrder = this._apiDeferredQueueSequence =
              (this._apiDeferredQueueSequence || 0) + 1;
          }
          this.enqueue(item);
          item.auditLifecycle?.("api_user_resume_requeued", {
            retrySubmitCount: item.retrySubmitCount,
          });
        }
      } finally {
        job._apiResumeInProgress = false;
      }
    }
    this._recordHistoryDiagnostic(job, "resume", null, job.pauseReason);
    job.state = "running";
    job.completedAt = null;
    job.pauseReason = null;
    if (this._tileMonitor) this._tileMonitor._lastClaimAt = Date.now();
    this._editorExecutor.resume();
    if (window.MessageBridge) {
      MessageBridge.sendToContentScript("pq:pauseExecution", {
        paused: false,
      }).catch(() => {});
    }
    this._ensureRunning();
    this._broadcastToFlowTabs("pq:recoveryTrace", {
      event: "resume_accepted",
      jobId: job.id,
      state: job.state,
      engineLock: job._flowApiEngineLock || null,
      queuedWeb: job.items.filter(
        (item) =>
          item.genMode === "web" && item.state === QueueItem.STATE.RETRY_SUBMIT,
      ).length,
    });
    this._emitStateChanged();
    return true;
  }
  _handleFlowError(data) {
    if (!data || !data.category) return;
    const { category, text, jobId } = data;
    const job = jobId ? this._jobs.get(jobId) : null;
    try {
      if (category === "captcha") {
        const culprit = data.itemId
          ? (job?.items || []).find((item) => item.id === data.itemId)
          : null;
        const resumeExhausted =
          culprit?._apiManualResumeExhausted === true ||
          culprit?._captchaResumeExhausted === true;
        const canResume = !!(
          job &&
          job.owner === "prompts" &&
          !resumeExhausted
        );
        const recoveryMode = this._captchaRecoveryMode();
        if (recoveryMode === "normal_error" && !resumeExhausted) {
          this._broadcastFlowError("execution:captcha_detected", {
            category,
            text,
            jobId,
            itemId: data.itemId || null,
            recoveryMode,
            action: "normal_error",
          });
          return;
        }
        const stopBatch =
          recoveryMode === "stop_batch" ||
          recoveryMode == null ||
          (job?.owner === "prompts" && resumeExhausted);
        const _pauseMsg =
          canResume && !stopBatch
            ? "Google t\u1EA1m ch\u1EB7n do ho\u1EA1t \u0111\u1ED9ng b\u1EA5t th\u01B0\u1EDDng. \u0110\xE3 T\u1EA0M D\u1EEANG \u2014 ch\u1EDD ~2 ph\xFAt r\u1ED3i b\u1EA5m \u25B6 Ti\u1EBFp t\u1EE5c \u0111\u1EC3 ch\u1EA1y ti\u1EBFp."
            : "Google t\u1EA1m ch\u1EB7n do ho\u1EA1t \u0111\u1ED9ng b\u1EA5t th\u01B0\u1EDDng. \u0110\xE3 d\u1EEBng \u2014 ch\u1EDD v\xE0i ph\xFAt r\u1ED3i ch\u1EA1y l\u1EA1i.";
        const displayed = text
          ? stopBatch
            ? `${text} \u2014 batch \u0111\xE3 d\u1EEBng.`
            : `${text} \u2014 ch\u1EDD v\xE0i ph\xFAt r\u1ED3i b\u1EA5m \u25B6 Ti\u1EBFp t\u1EE5c.`
          : _pauseMsg;
        this._notifyFlowError(displayed, stopBatch ? "error" : "warning");
        if (stopBatch && job && !job.isDone) {
          if (culprit && !culprit.isTerminal) {
            culprit.state = QueueItem.STATE.FAILED;
            culprit.noRetry = true;
            culprit.errorType = culprit.errorType || "captcha_failed";
            culprit.error =
              text || culprit.error || "PUBLIC_ERROR_UNUSUAL_ACTIVITY";
            culprit.completedAt = Date.now();
          }
          if (culprit && !culprit._failureAccounted) {
            culprit._failureAccounted = true;
            job.failedCount++;
          }
          job.stopReason =
            text || culprit?.error || "PUBLIC_ERROR_UNUSUAL_ACTIVITY";
          console.warn(
            "[PromptQueue] Captcha policy stop_batch \u2192 stopping affected job.",
          );
          this.stopJob(jobId, { stopReason: job.stopReason });
        } else if (canResume) {
          this.pauseJob(jobId, "captcha");
        } else if (job && job.owner === "task") {
          console.warn(
            "[PromptQueue] Task + captcha \u2192 stop job (tr\xE1nh spam 403).",
          );
          const culprit2 = data.itemId
            ? (job.items || []).find((item) => item.id === data.itemId)
            : null;
          if (culprit2 && !culprit2.isTerminal) {
            culprit2.state = QueueItem.STATE.FAILED;
            culprit2.noRetry = true;
            culprit2.errorType = culprit2.errorType || "captcha_failed";
            culprit2.error =
              text || culprit2.error || "PUBLIC_ERROR_UNUSUAL_ACTIVITY";
            culprit2.completedAt = Date.now();
          }
          if (culprit2 && !culprit2._failureAccounted) {
            culprit2._failureAccounted = true;
            job.failedCount++;
          }
          job.stopReason =
            text || culprit2?.error || "PUBLIC_ERROR_UNUSUAL_ACTIVITY";
          this.stopJob(jobId, { stopReason: job.stopReason });
        }
        this._broadcastFlowError("execution:captcha_detected", {
          category,
          text,
          jobId,
          itemId: data.itemId || null,
          recoveryMode,
          action: stopBatch ? "stop_batch" : "pause_resume",
        });
      } else if (category === "quota") {
        this._notifyFlowError(
          text ||
            "You have reached your Google Flow generation limit. Try again later or upgrade.",
          "error",
        );
        this._broadcastFlowError("execution:quota_exceeded", {
          category,
          text,
          jobId,
        });
      } else if (category === "policy") {
        this._notifyFlowError(
          text || "The prompt may violate Flow policy \u2014 please change it.",
          "error",
        );
        this._broadcastFlowError("node:policy_blocked", {
          category,
          text,
          jobId,
        });
      } else if (category === "rate_limit") {
        this._notifyFlowError(
          text || "Flow is asking to slow down \u2014 pausing then continuing.",
          "warning",
        );
        this._broadcastFlowError("execution:rate_limited", {
          category,
          text,
          jobId,
        });
      }
    } catch (e) {
      console.warn("[PromptQueue] _handleFlowError error:", e.message);
    }
  }
  async _onCaptchaUserAction(data) {
    const decision = data?.decision;
    let pausedJobId = null;
    for (const [id, job] of this._jobs) {
      if (job.state === "paused" && job.owner === "prompts") {
        pausedJobId = id;
        break;
      }
    }
    if (decision === "resume") {
      const resumed = pausedJobId ? await this.resumeJob(pausedJobId) : false;
      window.eventBus?.emit("execution:captcha_resolved", {
        resumed: resumed === true,
      });
    } else if (decision === "abort") {
      if (pausedJobId)
        this.stopJob(pausedJobId, {
          stopOrigin: "user",
          stopReason: "USER_CANCELLED",
        });
      window.eventBus?.emit("execution:captcha_aborted", {});
    }
  }
  _flowCookieRecoveryQuiet({ allowOwnReload = false } = {}) {
    return (
      (!this._forceReloadPromise || allowOwnReload) &&
      !this._editorExecutor?.currentItem &&
      !this._editorExecutor?.isDownloading &&
      !this._currentDownloadItem &&
      !this._downloadQueue?.length &&
      !this._tileMonitor?.activeCount &&
      this._webRecovery?.unsafeToReload !== true &&
      !Array.from(this._jobs.values()).some(
        (job) =>
          job._apiResumeInProgress === true ||
          (job.isActive && job.state !== "paused") ||
          (job.items || []).some(
            (item) =>
              ![
                "COMPLETED",
                "PARTIAL_FAIL",
                "FAILED",
                "CANCELLED",
                "BLOCKED",
              ].includes(item.state) &&
              (item.flowApiAccepted === true ||
                item._apiDispatchStarted === true ||
                !!item.operationId ||
                !!item.flowOperationId),
          ),
      )
    );
  }
  _offerFlowCookieRecovery(job) {
    if (
      !job ||
      job.state !== "paused" ||
      job.pauseReason !== "api_unusual_activity" ||
      !["prompts", "workflow"].includes(job.owner) ||
      job._flowCookieRecoveryOffered ||
      !this._flowCookieRecoveryQuiet()
    )
      return;
    const item = job.items?.find(
      (candidate) =>
        candidate.genMode === "api" && this._isApiUnusualActivity(candidate),
    );
    if (!item) return;
    job._flowCookieRecoveryOffered = true;
    this._broadcastFlowError("execution:flow_cookie_recovery", {
      jobId: job.id,
      owner: job.owner,
      workflowId: job.workflowId || null,
      workflowRunId: job.workflowRunId || null,
      errorType: "bot_detected",
      genMode: "api",
      paused: true,
      projectId: item.projectId || job.projectId || null,
    });
  }
  async clearFlowCookiesAndReloadPausedJob(jobId, expectedFlowTarget = null) {
    const job = this._jobs.get(jobId);
    if (
      !job ||
      job.state !== "paused" ||
      job.pauseReason !== "api_unusual_activity" ||
      !["prompts", "workflow"].includes(job.owner) ||
      !job.items?.some(
        (item) => item.genMode === "api" && this._isApiUnusualActivity(item),
      )
    ) {
      return { ok: false, error: "COOKIE_RECOVERY_JOB_NOT_PAUSED" };
    }
    if (this._flowCookieRecoveryJobId || job._flowCookieRecoveryInProgress)
      return { ok: false, error: "COOKIE_RECOVERY_IN_PROGRESS" };
    if (!this._flowCookieRecoveryQuiet())
      return { ok: false, error: "COOKIE_RECOVERY_GENERATION_ACTIVE" };
    job._flowCookieRecoveryInProgress = true;
    this._flowCookieRecoveryJobId = job.id;
    try {
      const target = await MessageBridge.getTargetContext();
      const projectId =
        job.projectId || job.items.find((item) => item.projectId)?.projectId;
      if (
        !target?.tabId ||
        target.driverKey !== "flow_v2" ||
        !projectId ||
        String(target.projectId).toLowerCase() !==
          String(projectId).toLowerCase() ||
        (job.flowTabId && job.flowTabId !== target.tabId) ||
        (expectedFlowTarget &&
          (target.tabId !== expectedFlowTarget.tabId ||
            target.driverKey !== expectedFlowTarget.driverKey ||
            target.projectId !== expectedFlowTarget.projectId))
      ) {
        return { ok: false, error: "COOKIE_RECOVERY_PROJECT_MISMATCH" };
      }
      let recoveryError = null;
      const ok = await this.forceReloadAndStabilize(
        "user-flow-cookie-recovery",
        {
          onCookieRecoveryFailure: (error) => {
            recoveryError = error;
          },
          flowCookieRecoveryJobId: job.id,
          expectedFlowTarget: target,
          scope: job.owner,
          workflowId: job.workflowId || null,
        },
      );
      return {
        ok: ok === true,
        error: ok ? null : recoveryError || "COOKIE_RECOVERY_RELOAD_FAILED",
      };
    } catch (error) {
      return { ok: false, error: error?.message || "COOKIE_RECOVERY_FAILED" };
    } finally {
      job._flowCookieRecoveryInProgress = false;
      this._flowCookieRecoveryJobId = null;
    }
  }
  async clearFlowCookiesForTest(expectedFlowTarget = null) {
    if (window.FlowApiAdapter?.isApiModeIntended?.() !== true)
      return { ok: false, error: "FLOW_API_NOT_ACTIVE" };
    const paused = Array.from(this._jobs.values()).find(
      (job) =>
        job.state === "paused" &&
        job.pauseReason === "api_unusual_activity" &&
        ["prompts", "workflow"].includes(job.owner),
    );
    if (paused)
      return this.clearFlowCookiesAndReloadPausedJob(
        paused.id,
        expectedFlowTarget,
      );
    if (
      !this._flowCookieRecoveryQuiet() ||
      window.FlowApiAdapter?.hasInFlight?.() === true ||
      Array.from(this._jobs.values()).some((job) => job.isActive)
    ) {
      return { ok: false, error: "COOKIE_RECOVERY_GENERATION_ACTIVE" };
    }
    if (this._flowCookieRecoveryJobId)
      return { ok: false, error: "COOKIE_RECOVERY_IN_PROGRESS" };
    this._flowCookieRecoveryJobId = "manual";
    try {
      const target = await MessageBridge.getTargetContext();
      if (
        !target?.tabId ||
        target.driverKey !== "flow_v2" ||
        !target.projectId ||
        (expectedFlowTarget &&
          (target.tabId !== expectedFlowTarget.tabId ||
            target.driverKey !== expectedFlowTarget.driverKey ||
            target.projectId !== expectedFlowTarget.projectId))
      )
        return { ok: false, error: "COOKIE_RECOVERY_PROJECT_MISMATCH" };
      let recoveryError = null;
      const ok = await this.forceReloadAndStabilize(
        "user-flow-cookie-recovery",
        {
          manualFlowCookieRecovery: true,
          expectedFlowTarget: target,
          scope: "prompts",
          onCookieRecoveryFailure: (error) => {
            recoveryError = error;
          },
        },
      );
      return {
        ok: ok === true,
        error: ok ? null : recoveryError || "COOKIE_RECOVERY_RELOAD_FAILED",
      };
    } catch (error) {
      return { ok: false, error: error?.message || "COOKIE_RECOVERY_FAILED" };
    } finally {
      this._flowCookieRecoveryJobId = null;
    }
  }
  _broadcastFlowError(event, payload) {
    window.eventBus?.emit(event, payload);
    try {
      chrome.runtime
        .sendMessage({
          action: "workflowExecutionEvent",
          event,
          data: payload || {},
        })
        .catch(() => {});
    } catch (_) {}
  }
  _notifyFlowError(reason, type) {
    try {
      const displayReason =
        window.FlowApiAdapter?.formatError?.(reason) || reason;
      if (typeof window.showNotification === "function") {
        window.showNotification(displayReason, type || "error", 6e3);
      } else if (typeof window.showToast === "function") {
        window.showToast(displayReason);
      } else if (
        window.customDialog &&
        typeof window.customDialog.alert === "function"
      ) {
        window.customDialog.alert(displayReason, {
          type: type || "error",
          title: "Google Flow",
        });
      }
    } catch (_) {}
  }
  stopAll({
    stopOrigin = null,
    stopReason = null,
    stopSource = null,
    requestedAt = Date.now(),
  } = {}) {
    console.log("[PromptQueue] stopAll called, stopping all jobs...");
    this._stopEpoch = (this._stopEpoch || 0) + 1;
    this._queueControlAbortController?.abort();
    this._queueControlAbortController = null;
    for (const cancel of this._controlWaiters || []) cancel();
    const providerStop = window.GenTab?.stopProviderGeneration;
    if (providerStop)
      providerStop.call(window.GenTab, { requestedAt }).catch(() => {});
    for (const [id] of this._jobs) {
      this.stopJob(id, { stopOrigin, stopReason, stopSource });
    }
    this._editorExecutor.stop();
    this._tileMonitor.stopAll();
    this._downloadQueue = [];
    this._isRunning = false;
    this._reloadPromptCounter = 0;
    this._reloadPromptTabId = null;
    this._reloadSuppressCount = 0;
    this._chunkDraining = false;
    this._completedChunks = 0;
    this._stopStagnationWatchdog();
    ExecutionLock.release("queue");
    if (window.MessageBridge) {
      MessageBridge.sendToContentScript("endFlowZoomSession", {
        force: true,
      }).catch(() => {});
    }
    window._taskShouldStop = true;
    window._taskBatchStopped = true;
    if (
      window.workflowExecutor?.isRunning ||
      window.workflowExecutor?._executionTask
    ) {
      window.workflowExecutor.stop(true, true, stopSource || "QUEUE_STOP_ALL");
    }
    if (!providerStop && window.GrokSession?.getTabInfo) {
      window.GrokSession.getTabInfo()
        .then((grokInfo) => {
          if (grokInfo?.tabId && window.MessageBridge) {
            window.MessageBridge.grokAbort(grokInfo.tabId, {
              requestedAt,
            }).catch(() => {});
          }
        })
        .catch(() => {});
    }
    if (!providerStop && window.ChatGPTSession?.getTabInfo) {
      window.ChatGPTSession.getTabInfo()
        .then((chatgptInfo) => {
          if (chatgptInfo?.tabId && window.MessageBridge) {
            window.MessageBridge.chatgptAbort(chatgptInfo.tabId, {
              requestedAt,
            }).catch(() => {});
          }
        })
        .catch(() => {});
    }
    if (!providerStop && window.GeminiSession?.getTabInfo) {
      window.GeminiSession.getTabInfo()
        .then((geminiInfo) => {
          if (geminiInfo?.tabId && window.MessageBridge) {
            window.MessageBridge.geminiAbort(geminiInfo.tabId, {
              requestedAt,
            }).catch(() => {});
          }
        })
        .catch(() => {});
    }
    if (!providerStop)
      window.MuseSession?.abort?.({ requestedAt }).catch(() => {});
    if (window.MessageBridge) {
      this._releaseFlowBlocker({ force: true, stopRelease: true });
      MessageBridge.stopExecution().catch(() => {});
    }
    this._emitStateChanged();
    window.eventBus?.emit("execution:force_stopped");
  }
  async waitForDownloadsEmpty(timeoutMs = 6e4, { activeOnly = false } = {}) {
    const startTime = Date.now();
    let loggedOnce = false;
    while (Date.now() - startTime < timeoutMs) {
      const isDownloadQueueEmpty =
        activeOnly || this._downloadQueue.length === 0;
      const isNotDownloading = !this._editorExecutor?.isDownloading;
      if (!loggedOnce) {
        console.log("[PromptQueue] waitForDownloadsEmpty check:", {
          queueLength: this._downloadQueue.length,
          isDownloading: this._editorExecutor?.isDownloading,
          editorExecutorExists: !!this._editorExecutor,
        });
        loggedOnce = true;
      }
      if (isDownloadQueueEmpty && isNotDownloading) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    console.warn(
      "[PromptQueue] waitForDownloadsEmpty timeout after",
      timeoutMs,
      "ms",
      {
        queueLength: this._downloadQueue.length,
        isDownloading: this._editorExecutor?.isDownloading,
      },
    );
    return false;
  }
  noteDownloadSettled() {
    this._lastDownloadSettledAt = Date.now();
  }
  async _waitForDownloadQuietBoundary(quietMs = 5e3) {
    const startedAt = Date.now();
    while (true) {
      if (
        this._downloadQueue.length > 0 ||
        this._currentDownloadItem ||
        this._editorExecutor?.isDownloading
      )
        return false;
      const settledAt = Number(this._lastDownloadSettledAt || 0);
      const quietFor = settledAt > 0 ? Date.now() - settledAt : quietMs;
      if (quietFor >= quietMs) return true;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(250, quietMs - quietFor)),
      );
      if (Date.now() - startedAt > quietMs * 2) return false;
    }
  }
  getActiveReloadPromise() {
    return this._forceReloadPromise || null;
  }
  async _awaitControlWork(work, { signal, stopEpoch, timeoutMs } = {}) {
    const aborted = () =>
      Object.assign(new Error("QUEUE_CONTROL_STOPPED"), {
        name: "AbortError",
        code: "ABORTED",
        noRetry: true,
        beforeQueueAdmission: true,
      });
    const observed = Promise.resolve(work);
    observed.catch(() => {});
    if (
      signal?.aborted ||
      (stopEpoch != null && stopEpoch !== (this._stopEpoch || 0))
    )
      throw aborted();
    this._controlWaiters || (this._controlWaiters = new Set());
    let timer, cancel;
    try {
      return await Promise.race([
        observed,
        new Promise((_, reject) => {
          cancel = () => reject(aborted());
          this._controlWaiters.add(cancel);
          signal?.addEventListener("abort", cancel, { once: true });
          if (signal?.aborted) cancel();
          if (Number.isFinite(timeoutMs))
            timer = setTimeout(
              () =>
                reject(
                  Object.assign(new Error("QUEUE_CONTROL_TIMEOUT"), {
                    code: "QUEUE_CONTROL_TIMEOUT",
                    noRetry: true,
                  }),
                ),
              Math.max(0, timeoutMs),
            );
        }),
      ]);
    } finally {
      clearTimeout(timer);
      this._controlWaiters.delete(cancel);
      signal?.removeEventListener("abort", cancel);
    }
  }
  async _waitForAdmissionReload(control = {}) {
    if (
      control.signal?.aborted ||
      (control.stopEpoch != null &&
        control.stopEpoch !== (this._stopEpoch || 0))
    ) {
      throw Object.assign(new Error("QUEUE_CONTROL_STOPPED"), {
        code: "ABORTED",
        noRetry: true,
        beforeQueueAdmission: true,
      });
    }
    while (this._forceReloadPromise) {
      console.info("[PromptQueue] admission waiting for Flow page refresh");
      await this._awaitControlWork(this._forceReloadPromise, control);
    }
  }
  suppressReload() {
    this._reloadSuppressCount++;
  }
  unsuppressReload() {
    this._reloadSuppressCount = Math.max(0, this._reloadSuppressCount - 1);
    this.flushPendingCorrelationReset().catch(() => {});
  }
  deferApiRefresh() {
    this._apiRefreshDeferCount++;
  }
  releaseApiRefresh() {
    this._apiRefreshDeferCount = Math.max(0, this._apiRefreshDeferCount - 1);
    this.flushPendingCorrelationReset().catch(() => {});
  }
  requestCorrelationReset(context, options = {}) {
    if (
      !context?.tabId ||
      !context.projectId ||
      context.driverKey !== "flow_v2"
    )
      return;
    this._pendingCorrelationReset = {
      ...context,
      jobId: options.jobId || null,
      stoppedJob: options.stoppedJob === true,
    };
    console.warn("[FlowRecovery] ambiguous observer reset scheduled", {
      tabId: context.tabId,
      projectId: context.projectId,
    });
  }
  _correlationResetIdle() {
    return !(
      this._reloadSuppressCount > 0 ||
      this._apiRefreshDeferCount > 0 ||
      this._editorExecutor?.currentItem ||
      this._editorExecutor?.isDownloading ||
      this._tileMonitor?.activeCount > 0 ||
      this._currentDownloadItem ||
      this._itemQueue?.length > 0 ||
      this._downloadQueue?.length > 0 ||
      [...this._jobs.values()].some(
        (job) => job.isActive || job.state === "paused",
      ) ||
      this._webRecovery?.unsafeToReload
    );
  }
  async flushPendingCorrelationReset() {
    const pending = this._pendingCorrelationReset;
    if (
      !pending ||
      this._correlationResetPromise ||
      !this._correlationResetIdle()
    )
      return false;
    this._correlationResetPromise = (async () => {
      const live = await window.MessageBridge?.getTargetContext?.();
      if (
        !live ||
        live.tabId !== pending.tabId ||
        live.projectId !== pending.projectId ||
        live.driverKey !== pending.driverKey ||
        live.origin !== pending.origin
      ) {
        if (this._pendingCorrelationReset === pending)
          this._pendingCorrelationReset = null;
        console.warn("[FlowRecovery] observer reset cancelled: target changed");
        return false;
      }
      if (!this._correlationResetIdle()) return false;
      const ok = await this.forceReloadAndStabilize(
        "correlation-observer-reset",
        {
          bypassSuppress: true,
          expectedFlowTarget: pending,
          ...(pending.stoppedJob ? { settledIdentityRefresh: true } : {}),
        },
      );
      if (ok && this._pendingCorrelationReset === pending) {
        this._pendingCorrelationReset = null;
        for (const job of this._jobs.values())
          for (const item of job.items || []) {
            const target = item._flowCorrelationTarget;
            if (
              target?.tabId === pending.tabId &&
              target.projectId === pending.projectId
            ) {
              item._flowCorrelationNeedsReset = false;
            }
          }
      }
      console.info("[FlowRecovery] observer reset finished", {
        success: ok === true,
        tabId: pending.tabId,
      });
      return ok === true;
    })();
    try {
      return await this._correlationResetPromise;
    } finally {
      this._correlationResetPromise = null;
    }
  }
  flushPendingApiRefresh(reason = "api-results-refresh", opts = {}) {
    if (
      !this._pendingApiRefresh ||
      this._reloadSuppressCount > 0 ||
      this._apiRefreshDeferCount > 0
    ) {
      return Promise.resolve(false);
    }
    return this.forceReloadAndStabilize(reason, {
      bypassSuppress: true,
      settledIdentityRefresh: true,
      ...opts,
    })
      .then((ok) => {
        if (ok) {
          this._pendingApiRefresh = false;
        }
        return !!ok;
      })
      .catch(() => false);
  }
  scheduleWebRetryAtBatchTail(
    item,
    failureReason = "WEB_RETRY_REQUIRED",
    options = {},
  ) {
    if (!item || item.noRetry === true || item.isTerminal) return false;
    const job = item.jobId ? this._jobs.get(item.jobId) : null;
    if (!job || !["running", "paused"].includes(job.state)) return false;
    if (Number.isInteger(item._webRetryReservedAttempt)) return true;
    const maxRetries = Math.max(0, Number(this._webRetryMaxRetries) || 0);
    const used = Math.max(
      Number(item.retrySubmitCount) || 0,
      Number(item._webRetryReservedAttempt) || 0,
    );
    if (used >= maxRetries) return false;
    item._webRetryReservedAttempt = used + 1;
    item._webRetryFailureReason = failureReason;
    item.retryReason = failureReason;
    item._webRetryBatchTailOrder = ++this._webRetryBatchTailSequence;
    item.state = QueueItem.STATE.RETRY_SUBMIT;
    item.priority = 100;
    item.completedAt = null;
    item.error = null;
    this.enqueue(item);
    item.auditLifecycle?.("web_retry_queued", {
      source: options.source || "unknown",
      reason: failureReason,
      reservedAttempt: item._webRetryReservedAttempt,
      maxRetries,
      queuePosition: "batch_tail",
    });
    window.eventBus?.emit("retry:status", {
      text: "Queued retry at batch tail",
    });
    return true;
  }
  _commitWebRetryAttempt(item) {
    if (!Number.isInteger(item?._webRetryReservedAttempt)) return;
    item.retrySubmitCount = Math.max(
      Number(item.retrySubmitCount) || 0,
      item._webRetryReservedAttempt,
    );
    delete item._webRetryReservedAttempt;
    delete item._webRetryBatchTailOrder;
    item.auditLifecycle?.("web_retry_started", {
      retrySubmitCount: item.retrySubmitCount,
      maxRetries: Math.max(0, Number(this._webRetryMaxRetries) || 0),
    });
  }
  dequeueNext() {
    const recovery = this._webRecovery;
    const manualOwner = [...this._jobs.values()].find(
      (job) => job.state === "paused" && job._manualRegenInFlight,
    );
    const manualJobId = manualOwner
      ? [...this._jobs.values()].find(
          (job) =>
            job !== manualOwner &&
            job.items?.some(
              (item) => item.id === manualOwner._manualRegenInFlight,
            ),
        )?.id || "__manual_regen_admitting__"
      : null;
    if ((recovery && !recovery.loaded) || recovery?.blocked) return null;
    if (
      recovery?.closed &&
      recovery.pending?.some(
        (entry) =>
          entry.userResume &&
          this._itemQueue.some(
            (item) =>
              item.jobId === recovery.records.get(entry.recordId)?.jobId &&
              !item.isTerminal &&
              item.state !== QueueItem.STATE.WAITING_DEPENDENCY &&
              this.getJob(item.jobId)?.state === "running" &&
              (!recovery.windowMembers || recovery.windowMembers.has(item.id)),
          ),
      )
    )
      recovery.closed = false;
    if (recovery?.closed || this._itemQueue.length === 0) {
      if (recovery?.windowMembers && !this._phaseRWorkflowAdmitting?.size)
        recovery.closed = true;
      return recovery?.take(manualJobId) || null;
    }
    for (let i = 0; i < this._itemQueue.length; i++) {
      const item = this._itemQueue[i];
      const job = this._jobs.get(item.jobId);
      if (!job || job.state === "stopped") {
        item.state = QueueItem.STATE.CANCELLED;
        this._itemQueue.splice(i, 1);
        i--;
        continue;
      }
      if (item.isTerminal) {
        this._itemQueue.splice(i--, 1);
        continue;
      }
      if (job.state === "paused" || job._admissionPending) continue;
      if (manualJobId && job.id !== manualJobId) continue;
      if (
        item._apiNormalRetryTail === true &&
        job.items.some(
          (candidate) =>
            candidate !== item &&
            !candidate.isTerminal &&
            candidate._apiNormalRetryTail !== true &&
            candidate.state !== QueueItem.STATE.WAITING_DEPENDENCY,
        )
      )
        continue;
      if (
        item.state === QueueItem.STATE.WAITING_DEPENDENCY ||
        item.dependency?.state === "waiting"
      )
        continue;
      if (Number.isInteger(item._webRetryBatchTailOrder)) {
        const ordinaryQueued = this._itemQueue.some(
          (candidate, index) =>
            index !== i &&
            !Number.isInteger(candidate._webRetryBatchTailOrder) &&
            !candidate.isTerminal &&
            candidate.state !== QueueItem.STATE.WAITING_DEPENDENCY &&
            candidate.dependency?.state !== "waiting" &&
            this._jobs.get(candidate.jobId)?.state === "running" &&
            (!manualJobId || candidate.jobId === manualJobId),
        );
        if (ordinaryQueued || (this._tileMonitor?.activeCount || 0) > 0)
          continue;
      }
      if (
        !this._editorExecutor._isFlowApiMode(item) &&
        this._shouldWaitForPendingDrain(item)
      )
        continue;
      if (recovery?.eligible(item)) {
        if (!recovery.windowMembers)
          recovery.windowMembers = new Set(
            this._itemQueue
              .filter(
                (entry) =>
                  recovery.eligible(entry) &&
                  this.getJob(entry.jobId)?.state === "running" &&
                  (!manualJobId || entry.jobId === manualJobId),
              )
              .map((entry) => entry.id),
          );
        if (!recovery.windowMembers.has(item.id)) continue;
      }
      this._itemQueue.splice(i, 1);
      delete item._apiNormalRetryTail;
      this._commitWebRetryAttempt?.(item);
      if (recovery?.eligible(item)) {
        this._reloadPromptTabId = job.flowTabId || this._reloadPromptTabId;
        recovery.windowCount++;
        const chunk = window.ExecutionConfig.safeGetFlowChunkConfig();
        if (
          chunk?.enabled &&
          job.owner !== "workflow" &&
          recovery.windowCount >= chunk.size
        )
          recovery.closed = true;
      }
      return item;
    }
    if (
      recovery?.windowMembers &&
      !this._phaseRWorkflowAdmitting?.size &&
      !this._itemQueue.some(
        (item) =>
          recovery.windowMembers.has(item.id) &&
          !item.isTerminal &&
          this.getJob(item.jobId)?.state === "paused",
      )
    )
      recovery.closed = true;
    return recovery?.take(manualJobId) || null;
  }
  _joinSingleNodeWebWindow(job) {
    const recovery = this._webRecovery;
    if (
      job?.owner !== "workflow" ||
      job.singleNodeSession !== true ||
      !job.workflowRunId ||
      !job.workflowId ||
      !recovery?.windowMembers?.size ||
      recovery.blocked ||
      recovery.storageError ||
      recovery.pending?.length ||
      this._forceReloadPromise ||
      this._plannedFlowRecoveryReload
    )
      return false;
    for (const memberId of recovery.windowMembers) {
      const memberJob = [...this._jobs.values()].find((candidate) =>
        candidate.items?.some((item) => item.id === memberId),
      );
      if (
        memberJob?.owner !== "workflow" ||
        memberJob.singleNodeSession !== true ||
        memberJob.workflowRunId !== job.workflowRunId ||
        memberJob.workflowId !== job.workflowId ||
        memberJob.state === "stopped"
      )
        return false;
    }
    const items = job.items.filter(
      (item) =>
        !item.isTerminal &&
        recovery.eligible(item) &&
        !this._editorExecutor._isFlowApiMode(item),
    );
    if (!items.length) return false;
    for (const item of items) recovery.windowMembers.add(item.id);
    recovery.closed = false;
    console.info(
      "[PromptQueue] Single-node Web joined existing workflow window",
      {
        workflowId: job.workflowId,
        runId: job.workflowRunId,
        jobId: job.id,
        items: items.length,
      },
    );
    return true;
  }
  enqueue(item) {
    const job = item?.jobId ? this._jobs.get(item.jobId) : null;
    if (
      this._isApiQuotaBlockedForItem(job, item) &&
      !item._apiDispatchStarted &&
      !item.flowApiAccepted
    ) {
      this._cancelUndispatchedQuotaItem(job, item);
      this._checkJobDone(job);
      this._emitStateChanged();
      return;
    }
    this._itemQueue.push(item);
    this._sortQueue();
    this._ensureRunning();
  }
  hasItems() {
    if (this._webRecovery?.unfinished) return true;
    const hasSubmitItems = this._itemQueue.some((item) => {
      const job = this._jobs.get(item.jobId);
      return job && (job.state === "running" || job.state === "paused");
    });
    if (hasSubmitItems) return true;
    return this._downloadQueue.some((d) => {
      const job = this._jobs.get(d.jobId);
      return job && (job.state === "running" || job.state === "paused");
    });
  }
  getJob(jobId) {
    return this._jobs.get(jobId) || null;
  }
  hasAcceptedV2Operation({ projectId = null, flowTabId = null } = {}) {
    const terminalStates = new Set([
      QueueItem.STATE.COMPLETED,
      QueueItem.STATE.PARTIAL_FAIL,
      QueueItem.STATE.FAILED,
      QueueItem.STATE.CANCELLED,
      QueueItem.STATE.BLOCKED,
    ]);
    return [...this._jobs.values()].some((job) =>
      (job.items || []).some((item) => {
        if (terminalStates.has(item?.state) || item?.flowApiDriver !== "v2")
          return false;
        const accepted =
          item.flowApiAccepted === true ||
          item._apiDispatchStarted === true ||
          !!item.operationId ||
          !!item.flowOperationId;
        if (!accepted) return false;
        if (projectId && item.projectId && item.projectId !== projectId)
          return false;
        if (
          Number.isInteger(flowTabId) &&
          Number.isInteger(item.flowApiTabId) &&
          item.flowApiTabId !== flowTabId
        )
          return false;
        const lineage = item.flowApiLineage || [];
        if (
          item.errorPolicy?.stage !== "ambiguous" &&
          lineage.length > 0 &&
          lineage.every(
            (entry) =>
              entry.operationId &&
              ["completed", "failed"].includes(entry.state),
          )
        )
          return false;
        return true;
      }),
    );
  }
  _hasPendingAmbiguousApiRecovery() {
    return [...this._jobs.values()].some(
      (job) =>
        !job.isDone &&
        job.state !== "stopped" &&
        job.items.some(
          (item) =>
            item.state === QueueItem.STATE.RECOVERY_REQUIRED &&
            item.errorPolicy?.stage === "ambiguous" &&
            (item.flowApiDriver || item.errorPolicy.driver) === "v2",
        ),
    );
  }
  async _expireAmbiguousApiRecovery() {
    for (const job of this._jobs.values()) {
      if (job.isDone || job.state === "stopped") continue;
      for (const item of job.items) {
        if (
          item.state !== QueueItem.STATE.RECOVERY_REQUIRED ||
          item.errorPolicy?.stage !== "ambiguous" ||
          (item.flowApiDriver || item.errorPolicy.driver) !== "v2"
        )
          continue;
        const deadline = Number(item.flowApiOperationDeadlineAt);
        if (!(deadline > 0) || Date.now() < deadline) continue;
        item.state = item.resultTileIds?.length
          ? QueueItem.STATE.PARTIAL_FAIL
          : QueueItem.STATE.FAILED;
        item.completedAt = Date.now();
        item.noRetry = true;
        item.recoveryExhausted = true;
        item.errorPolicy.retryable = false;
        item.recoveryLabel =
          window.I18n?.t?.("flowRecovery.unverified") || item.error;
        if (item.recoveryLabel && item.recoveryLabel !== item.error) {
          item.error = [item.error, item.recoveryLabel]
            .filter(Boolean)
            .join(" \u2014 ");
        }
        item.auditLifecycle?.("api_ambiguous_deadline_exhausted", {
          action: "settle_local_unverified_no_resubmit",
          reason: item.errorPolicy.code || item.error,
        });
        const operations = new Set(
          [
            item.operationId,
            item.flowOperationId,
            ...(item.flowApiLineage || []).map((entry) => entry.operationId),
          ].filter(Boolean),
        );
        this._onItemCompleted(item);
        await Promise.allSettled(
          [...operations].map((id) =>
            window.FlowApiV2CheckpointStore?.remove?.(id),
          ),
        );
      }
    }
  }
  canStartAutoDownload() {
    const recovery = this._webRecovery;
    if (
      this._tileMonitor?.activeCount ||
      this._editorExecutor?.isDownloading ||
      window.FlowApiAdapter?.hasInFlight?.() === true ||
      this._phaseRWorkflowAdmitting?.size ||
      (recovery && (!recovery.loaded || recovery.unfinished))
    )
      return false;
    const boundary = this._chunkDraining || recovery?.closed;
    const future = boundary
      ? new Set(this._itemQueue.map((item) => item.id))
      : new Set();
    for (const record of recovery?.records.values() || []) {
      if (!record.terminal && !future.has(record.id)) return false;
    }
    for (const job of this._jobs.values()) {
      if (job.state === "stopped") continue;
      if (job._admissionPending) return false;
      for (const item of job.items || []) {
        if (!item.isTerminal && !future.has(item.id)) return false;
      }
    }
    return true;
  }
  dequeueNextDownload() {
    if (!this.canStartAutoDownload()) return null;
    while (this._downloadQueue.length > 0) {
      const dlItem = this._downloadQueue.shift();
      const job = this._jobs.get(dlItem.jobId);
      if (!job || job.state === "stopped") continue;
      if (this._downloadedTileIds.has(dlItem.tileId)) continue;
      return dlItem;
    }
    return null;
  }
  _findDownloadOwner(tileId) {
    const matches = [];
    for (const job of this._jobs.values()) {
      for (const item of job.items || []) {
        const output = item.outputs?.find(
          (entry) => entry.resultId === tileId || entry.mediaId === tileId,
        );
        if (output || item.resultTileIds?.includes(tileId))
          matches.push({ job, item, output });
      }
    }
    matches.sort((a, b) => {
      const rank = (entry) =>
        ["downloading", "queued", "retrying"].includes(
          entry.output?.downloadStatus,
        )
          ? 2
          : entry.job.isActive
            ? 1
            : 0;
      return (
        rank(b) - rank(a) ||
        Number(b.item.createdAt || 0) - Number(a.item.createdAt || 0)
      );
    });
    return matches[0] || null;
  }
  markDownloadCompleted(tileId) {
    this._webRecovery?.markDownload(tileId, "downloaded");
    this._downloadedTileIds.add(tileId);
    this._downloadCompletedCount++;
    const dlItem = this._currentDownloadItem;
    const completedJob =
      dlItem?.tileId === tileId ? this._jobs.get(dlItem.jobId) : null;
    if (completedJob?.owner === "workflow")
      window.eventBus?.emit?.("workflow:download", {
        workflowId: completedJob.workflowId,
        nodeId: completedJob.workflowNodeId,
        nodeName: completedJob.workflowNodeName,
        key: tileId,
        stage: "completed",
        index: dlItem.index,
      });
    let jobToCheck = null;
    if (dlItem && dlItem.tileId === tileId) {
      this._jobs
        .get(dlItem.jobId)
        ?.items?.find(
          (item) => item.id === (dlItem.originalItemId || dlItem.attemptId),
        )
        ?.markOutputDownload?.(tileId, "downloaded");
      this._downloadHistory.push({
        ...dlItem,
        state: "COMPLETED",
        completedAt: Date.now(),
      });
      this._currentDownloadItem = null;
      jobToCheck = this._jobs.get(dlItem.jobId);
    } else {
      console.warn(
        `[PromptQueue] markDownloadCompleted: _currentDownloadItem mismatch for tile ${tileId?.substring(0, 8)}`,
      );
      const recovered = this._findDownloadOwner(tileId);
      if (recovered) {
        recovered.item.markOutputDownload?.(tileId, "downloaded");
        jobToCheck = recovered.job;
      }
    }
    if (jobToCheck) this._checkJobDone(jobToCheck);
    this._emitStateChanged();
  }
  markDownloadFailed(tileId, error, options = {}) {
    this._webRecovery?.markDownload(tileId, "failed");
    const dlItem = this._currentDownloadItem;
    let jobToCheck = null;
    if (dlItem && dlItem.tileId === tileId) {
      this._currentDownloadItem = null;
      const job = this._jobs.get(dlItem.jobId);
      dlItem._dlRetry = (dlItem._dlRetry || 0) + 1;
      if (
        options.retryable !== false &&
        dlItem._dlRetry <= 2 &&
        job &&
        job.state !== "stopped"
      ) {
        if (job.owner === "workflow")
          window.eventBus?.emit?.("workflow:download", {
            workflowId: job.workflowId,
            nodeId: job.workflowNodeId,
            nodeName: job.workflowNodeName,
            key: tileId,
            stage: "retrying",
            index: dlItem.index,
          });
        job.items
          ?.find(
            (item) => item.id === (dlItem.originalItemId || dlItem.attemptId),
          )
          ?.markOutputDownload?.(tileId, "retrying", error);
        console.warn(
          `[PromptQueue] Download retry ${dlItem._dlRetry}/2 cho tile ${tileId?.substring(0, 8)}: ${error}`,
        );
        this._downloadQueue.unshift(dlItem);
        this._emitStateChanged();
        return;
      }
      job?.items
        ?.find(
          (item) => item.id === (dlItem.originalItemId || dlItem.attemptId),
        )
        ?.markOutputDownload?.(tileId, "failed", error);
      this._downloadHistory.push({
        ...dlItem,
        state: "FAILED",
        error,
        noReplay: options.retryable === false,
        completedAt: Date.now(),
      });
      if (job?.owner === "workflow")
        window.eventBus?.emit?.("workflow:download", {
          workflowId: job.workflowId,
          nodeId: job.workflowNodeId,
          nodeName: job.workflowNodeName,
          key: tileId,
          stage: "failed",
          index: dlItem.index,
        });
      jobToCheck = job;
    } else {
      console.warn(
        `[PromptQueue] markDownloadFailed: _currentDownloadItem mismatch for tile ${tileId?.substring(0, 8)}`,
      );
      const recovered = this._findDownloadOwner(tileId);
      if (recovered) {
        recovered.item.markOutputDownload?.(tileId, "failed", error);
        jobToCheck = recovered.job;
      }
    }
    if (jobToCheck) this._checkJobDone(jobToCheck);
    this._emitStateChanged();
  }
  setCurrentDownload(dlItem) {
    this._currentDownloadItem = dlItem || null;
    const downloadJob = dlItem?.jobId ? this._jobs.get(dlItem.jobId) : null;
    if (downloadJob?.owner === "workflow" && dlItem?.state === "DOWNLOADING") {
      window.eventBus?.emit?.("workflow:download", {
        workflowId: downloadJob.workflowId,
        nodeId: downloadJob.workflowNodeId,
        nodeName: downloadJob.workflowNodeName,
        key: dlItem.tileId,
        stage: "started",
        index: dlItem.index,
      });
    }
    if (dlItem?.tileId && dlItem?.jobId && dlItem?.attemptId) {
      this._jobs
        .get(dlItem.jobId)
        ?.items?.find(
          (item) => item.id === (dlItem.originalItemId || dlItem.attemptId),
        )
        ?.markOutputDownload?.(dlItem.tileId, "downloading");
    }
    this._emitStateChanged();
  }
  _onItemSubmitted(item) {
    if (
      item.genMode !== "api" &&
      !item._phaseR?.retry &&
      (item.retrySubmitCount || 0) === 0
    ) {
      this._reloadPromptTabId =
        this.getJob(item.jobId)?.flowTabId || this._reloadPromptTabId;
      this._reloadPromptCounter++;
    }
    window.flowV2CorrelationBroker?.markMonitoring?.(item);
    this._tileMonitor.monitor(item);
    this._emitStateChanged();
  }
  _isApiQuotaBlockedForItem(job, item) {
    if (!job || !item) return false;
    if (job._apiQuotaBlocked) return true;
    const model = String(item.settings?.model || "").trim();
    if (!model && job._apiBlockedModels?.size) return true;
    return !!model && job._apiBlockedModels?.has(model) === true;
  }
  _cancelUndispatchedQuotaItem(job, item) {
    const model = String(item.settings?.model || "").trim();
    const cause =
      job._apiQuotaCauses?.get(job._apiQuotaBlocked ? "" : model) ||
      job._apiQuotaCauses?.values().next().value;
    item._quotaCancellationOnly =
      !item.error && !item.errorPolicy && !item.flowApiFailureDetail;
    item.state = QueueItem.STATE.CANCELLED;
    item.completedAt = Date.now();
    item._apiWaitingSlot = false;
    item.errorType = cause?.errorType || null;
    item.error = cause?.error || job.stopReason || null;
  }
  _blockVerifiedFlowQuotaJob(job, culprit) {
    if (!job || job._apiQuotaBlocked) return;
    if (
      !["quota_exceeded", "per_model_daily", "tier_restricted"].includes(
        culprit.errorType,
      )
    )
      return;
    const blockedModel = ["per_model_daily", "tier_restricted"].includes(
      culprit.errorType,
    )
      ? String(culprit.settings?.model || "").trim()
      : "";
    if (blockedModel && job._apiBlockedModels?.has(blockedModel)) return;
    const codes = [
      ...(culprit?.errorPolicy?.providerErrorCodes || []),
      ...(culprit?.flowApiFailureDetail?.providerErrorCodes || []),
      culprit?.errorPolicy?.grpcReason,
      culprit?.errorPolicy?.code,
      culprit?.flowApiFailureDetail?.code,
    ];
    const quotaCode =
      codes.find(
        (code) => typeof code === "string" && code.startsWith("PUBLIC_ERROR_"),
      ) ||
      codes.find((code) => typeof code === "string") ||
      culprit.errorType;
    culprit.auditLifecycle?.("queue_recovery_decision", {
      action: blockedModel
        ? "block_model_submissions"
        : "block_batch_submissions",
    });
    this._recordHistoryDiagnostic(job, "quota_gate", culprit, quotaCode);
    if (blockedModel) {
      if (!job._apiBlockedModels) job._apiBlockedModels = new Set();
      job._apiBlockedModels.add(blockedModel);
    } else {
      job._apiQuotaBlocked = quotaCode;
    }
    job.stopReason = culprit.error || quotaCode;
    if (!job._apiQuotaCauses) job._apiQuotaCauses = new Map();
    job._apiQuotaCauses.set(blockedModel, {
      errorType: culprit.errorType,
      error: job.stopReason,
    });
    this._itemQueue = this._itemQueue.filter(
      (item) =>
        item.jobId !== job.id || !this._isApiQuotaBlockedForItem(job, item),
    );
    if (job._apiQuotaBlocked && job.taskBatch?.mode === "sequential") {
      job.taskBatch.currentIdx = job.taskBatch.tasks.length - 1;
    }
    let cancelled = 0;
    const cancelledTaskIds = new Set();
    for (const item of job.items) {
      if (
        item === culprit ||
        item.isTerminal ||
        !this._isApiQuotaBlockedForItem(job, item)
      )
        continue;
      if (item._apiDispatchStarted || item.flowApiAccepted) {
        item._apiStopFurtherMutations = true;
        item._apiFurtherMutationStopReason = quotaCode;
        continue;
      }
      if (
        !item._apiWaitingSlot &&
        item.genMode !== "api" &&
        [
          QueueItem.STATE.SUBMITTING,
          QueueItem.STATE.SUBMITTED,
          QueueItem.STATE.MONITORING,
        ].includes(item.state)
      )
        continue;
      this._cancelUndispatchedQuotaItem(job, item);
      if (item._taskId) cancelledTaskIds.add(item._taskId);
      cancelled++;
    }
    for (const taskId of cancelledTaskIds) {
      const taskItems = job.items.filter((item) => item._taskId === taskId);
      if (
        !taskItems.every((item) => item.isTerminal) ||
        taskItems.some((item) => item.resultTileIds?.length)
      )
        continue;
      window.storageManager
        ?.updateTaskStatus?.(taskId, "failed")
        ?.catch?.(() => {});
      window.eventBus?.emit?.("task:status_changed", {
        taskId,
        task_id: taskId,
        status: "failed",
        error_reason: job.stopReason,
      });
    }
    console.info(
      "[PromptQueue] Verified Flow quota blocked new submissions",
      JSON.stringify({
        jobId: job.id,
        code: quotaCode,
        model: blockedModel || null,
        cancelled,
        acceptedRemaining: job.items.filter(
          (item) =>
            !item.isTerminal &&
            (item._apiDispatchStarted ||
              item.flowApiAccepted ||
              (item.genMode !== "api" &&
                [
                  QueueItem.STATE.SUBMITTING,
                  QueueItem.STATE.SUBMITTED,
                  QueueItem.STATE.MONITORING,
                ].includes(item.state))),
        ).length,
      }),
    );
    this._notifyFlowError(job.stopReason, "error");
    this._broadcastFlowError("execution:quota_exceeded", {
      category: "quota",
      text: job.stopReason,
      jobId: job.id,
      itemId: culprit.id,
    });
  }
  _onItemCompleted(item) {
    if (item._phaseR && !item._phaseRRecord?.terminal) return;
    const job = this._jobs.get(item.jobId);
    if (!job) return;
    if (item.state === QueueItem.STATE.COMPLETED)
      delete item._apiNormalRetryErrorDetails;
    if (
      [QueueItem.STATE.FAILED, QueueItem.STATE.PARTIAL_FAIL].includes(
        item.state,
      )
    ) {
      this._recordHistoryDiagnostic(
        job,
        "item_failed",
        item,
        item.errorPolicy?.code || item.error,
      );
      this._blockVerifiedFlowQuotaJob(job, item);
    }
    const chainIndex = job.items.indexOf(item);
    const needsWebVideoHandoff =
      job.chain?.kind === "video_last_frame" &&
      !(item.resultFrameFileIds || []).some(Boolean) &&
      chainIndex >= 0 &&
      chainIndex < job.items.length - 1 &&
      item.state === QueueItem.STATE.COMPLETED &&
      item._chainCompletionReady !== true;
    if (needsWebVideoHandoff) {
      if (item._chainHandoffPending) return;
      item._chainHandoffPending = true;
      const next = job.items[chainIndex + 1];
      if (next?.dependency) next.dependency.state = "resolving";
      this._emitStateChanged();
      this._prepareWebVideoChainHandoff(item, job)
        .catch((e) => {
          item.chainHandoffError =
            job.state === "stopped"
              ? "CHAIN_STOPPED_BY_USER"
              : "LAST_FRAME_HANDOFF_FAILED";
          const causeCode = String(e?.code || e?.message || "");
          item.chainHandoffCause =
            "last_frame:" +
            (item._chainHandoffStage || "unknown") +
            (/^[A-Z][A-Z0-9_]{0,70}$/.test(causeCode) ? ":" + causeCode : "");
          console.warn(
            "[PromptQueue] Video last-frame handoff failed:",
            JSON.stringify({
              itemId: item.id,
              jobId: job.id,
              genMode: item.genMode,
              stage: item._chainHandoffStage || null,
              cause: item.chainHandoffCause,
            }),
            e?.message || e,
          );
        })
        .finally(() => {
          item._chainHandoffPending = false;
          item._chainCompletionReady = true;
          if (job.state === "stopped") {
            this._emitStateChanged();
            return;
          }
          this._onItemCompleted(item);
        });
      return;
    }
    if (
      !item._phaseR &&
      !item._phaseRPreparationFailed &&
      item.state === QueueItem.STATE.FAILED
    ) {
      item.syncFailedOutputs?.([], item.error || "GENERATION_FAILED");
    } else if (
      !item._phaseR &&
      (item.state === QueueItem.STATE.COMPLETED ||
        item.state === QueueItem.STATE.PARTIAL_FAIL)
    ) {
      item.syncCompletedOutputs?.(
        item.resultTileIds || [],
        item.resultThumbnails || {},
      );
      if (item.state === QueueItem.STATE.PARTIAL_FAIL) {
        item.syncFailedOutputs?.([], item.error || "PARTIAL_GENERATION_FAILED");
      }
    }
    if (item.state === QueueItem.STATE.COMPLETED) {
      delete item._historyDebugStages;
      if (item._phaseRRecord) delete item._phaseRRecord._historyDebugStages;
    }
    const _expectedOutputs = Math.max(
      1,
      parseInt(item.settings?.quantity, 10) || 1,
    );
    const _accountedOutputs = Array.isArray(item.outputs)
      ? item.outputs.length
      : 0;
    item.auditLifecycle?.("item_terminal", {
      terminalState: item.state,
      reason: item.errorPolicy?.code || item.error || null,
      errorType: item.errorType || null,
      recoveryStage: item.errorPolicy?.stage || null,
      promptIndex: Number(item.promptIndex) || 0,
      accountedOutputs: _accountedOutputs,
      durationMs: Math.max(
        0,
        Number(item.completedAt || Date.now()) -
          Number(item.submittedAt || item.createdAt || Date.now()),
      ),
      quantityMismatch:
        item.state !== QueueItem.STATE.CANCELLED &&
        _accountedOutputs !== _expectedOutputs,
      retrySubmitCount: item.retrySubmitCount || 0,
    });
    if (
      item.state === QueueItem.STATE.COMPLETED ||
      item.state === QueueItem.STATE.PARTIAL_FAIL
    ) {
      job.completedCount++;
      if (item.state === QueueItem.STATE.PARTIAL_FAIL) job.partialCount++;
      if (window.eventBus) {
        window.eventBus.emit(
          item.state === QueueItem.STATE.PARTIAL_FAIL
            ? "prompt:single_partial"
            : "prompt:single_completed",
          {
            index: job.completedCount,
            total: job.items.length,
            prompt: item.prompt || "",
            provider: "flow",
            completedOutputs: (item.outputs || []).filter(
              (output) => output.status === "completed",
            ).length,
            failedOutputs: (item.outputs || []).filter(
              (output) => output.status === "failed",
            ).length,
          },
        );
      }
      if (item.genMode !== "api") this._consecutiveFailCount = 0;
    } else if (item.state === QueueItem.STATE.FAILED) {
      if (!item._failureAccounted) {
        job.failedCount++;
        item._failureAccounted = true;
      }
      try {
        if (typeof sendLog === "function") {
          const _idx = job.items.indexOf(item);
          const _no = _idx >= 0 ? `#${_idx + 1}` : "";
          const _mode = item.genMode === "api" ? " [API]" : "";
          const _reason = item.error
            ? window.FlowApiAdapter?.formatError?.(
                item.error,
                item.errorType,
              ) || item.error
            : window.I18n?.t?.("gen.flowErr_unknown") ||
              "kh\xF4ng r\xF5 nguy\xEAn nh\xE2n";
          sendLog(
            `Prompt ${_no} th\u1EA5t b\u1EA1i${_mode}: ${_reason}`,
            "error",
          );
        }
      } catch (_) {}
      const _modelError = String(item.error || "").match(
        /^(?:V2_MODEL_[^:]*|MODEL_OPTION_(?:NOT_FOUND|NOT_APPLIED)):\s*(.+)$/,
      );
      if (_modelError) {
        const _model = _modelError[1].trim().slice(0, 160);
        const _promptIndex = Math.max(1, job.items.indexOf(item) + 1);
        const _key = "gen.flowModelUnavailablePrompt";
        const _translated = window.I18n?.t?.(_key, {
          model: _model,
          index: _promptIndex,
        });
        const _message =
          _translated && _translated !== _key
            ? _translated
            : `Model "${_model}" is unavailable for this Google Flow account. Prompt #${_promptIndex} was skipped.`;
        this._notifyFlowError(_message, "error");
      }
      EditorExecutor._incrementDailyStat("flow_fail");
      const SKIP_RETRY_CATEGORIES = ["captcha", "quota", "policy"];
      if (item.genMode === "api") {
        console.log(
          `[PromptQueue] FAR-2: item API fail (${item.error || "unknown"}) \u2192 kh\xF4ng t\xEDnh consecutive-fail counter (DOM reload v\xF4 \xEDch), gi\u1EEF counter=${this._consecutiveFailCount || 0}`,
        );
      } else if (
        item._phaseR ||
        item._phaseRPreparationFailed ||
        item.noRetry === true
      ) {
      } else if (SKIP_RETRY_CATEGORIES.includes(item.flowErrorCategory)) {
        console.log(
          `[PromptQueue] FAR-2: fail category='${item.flowErrorCategory}' (skip-retry, provider-side) \u2192 KH\xD4NG t\xEDnh consecutive-fail counter (reload v\xF4 \xEDch), gi\u1EEF counter=${this._consecutiveFailCount || 0}`,
        );
      } else {
        this._consecutiveFailCount = (this._consecutiveFailCount || 0) + 1;
        console.log(
          `[PromptQueue] FAR-2: consecutive Web failures=${this._consecutiveFailCount}; reload disabled during generation`,
        );
      }
    }
    if (item._taskId && item.resultTileIds?.length > 0) {
      this._persistTaskResult(item).catch((e) =>
        console.warn("[PromptQueue] Persist task result failed:", e.message),
      );
    }
    if (item._taskId && window.eventBus) {
      const taskItems = job.items.filter((i) => i._taskId === item._taskId);
      const completedCount = taskItems.filter((i) => i.isTerminal).length;
      const totalCount = taskItems.length;
      window.eventBus.emit("task:progress", {
        taskId: item._taskId,
        completed: completedCount,
        total: totalCount,
      });
      const allDone = completedCount === totalCount;
      const hasAnyResult = taskItems.some((i) => i.resultTileIds?.length > 0);
      if (allDone && !hasAnyResult) {
        if (window.storageManager) {
          window.storageManager
            .updateTaskStatus(item._taskId, "failed")
            .catch(() => {});
        }
        const _failedItems = taskItems.filter(
          (i) =>
            i.error ||
            (i.isTerminal &&
              (!i.resultTileIds || i.resultTileIds.length === 0)),
        );
        const _prompts = _failedItems.map((i) => i.prompt).filter(Boolean);
        const _st = item.settings || {};
        window.eventBus.emit("task:status_changed", {
          taskId: item._taskId,
          task_id: item._taskId,
          status: "failed",
          prompt: _prompts.join("\n\n") || item.prompt || "",
          media_type: _st.genType || null,
          model: _st.model || "",
          ratio: _st.ratio || "",
          quantity: _st.quantity || 1,
          ref_file_ids: this._historyRefFileIds(_failedItems).join(", "),
          ref_thumbnails: item.refThumbnails || {},
          provider: "flow",
          source: "task",
          prompt_count: _failedItems.length || 1,
          error_reason:
            _failedItems.find((i) => i.error)?.error ||
            "Generation failed (no result)",
          duration_ms: this._historyDurationMs(_failedItems),
          flow_api_versions: this._historyApiVersions(_failedItems),
          historyRoute: this._historyRoute(_failedItems),
          error_details: this._historyErrorDetails(_failedItems),
        });
      }
    }
    if (job.taskBatch && job.taskBatch.mode === "sequential") {
      this._checkTaskBoundary(job, item);
    }
    if (job.chain) this._advanceChain(job, item);
    const correlationAudit =
      window.flowV2CorrelationBroker?.auditTerminal?.(item);
    if (correlationAudit?.safe === false) {
      job.sequentialMode = true;
      job.forcedV2WebSequential = true;
    }
    const correlationTerminalState =
      item.state === QueueItem.STATE.COMPLETED
        ? window.FlowV2CorrelationProtocol?.STATES?.COMPLETED
        : item.state === QueueItem.STATE.CANCELLED
          ? window.FlowV2CorrelationProtocol?.STATES?.SUPERSEDED
          : window.FlowV2CorrelationProtocol?.STATES?.FAILED;
    window.flowV2CorrelationBroker?.disarm?.(item, correlationTerminalState);
    this._checkJobDone(job);
    this._emitStateChanged();
  }
  _advanceChain(job, item) {
    const index = job.items.indexOf(item);
    if (index < 0 || index >= job.items.length - 1) return;
    const downstream = job.items.slice(index + 1);
    const next = downstream[0];
    const usable =
      item.state === QueueItem.STATE.COMPLETED &&
      item.resultTileIds?.length > 0;
    let generatedRefs = [];
    if (usable && job.chain.kind === "image_result")
      generatedRefs = item.resultTileIds.filter(Boolean).slice(0, 1);
    if (usable && job.chain.kind === "video_last_frame")
      generatedRefs = (item.resultFrameFileIds || [])
        .filter(Boolean)
        .slice(0, 1);
    if (!usable || !generatedRefs.length || item.chainHandoffError) {
      const root =
        item.chainHandoffError || item.error || "CHAIN_RESULT_UNAVAILABLE";
      if (downstream.some((blocked) => !blocked.isTerminal)) {
        this._recordHistoryDiagnostic(
          job,
          "dispatch_blocked",
          item,
          item.chainHandoffError
            ? "CHAIN_LAST_FRAME_HANDOFF_FAILED"
            : !usable
              ? "CHAIN_UPSTREAM_FAILED"
              : "CHAIN_RESULT_UNAVAILABLE",
        );
      }
      downstream.forEach((blocked) => {
        if (blocked.isTerminal) return;
        blocked.state = QueueItem.STATE.BLOCKED;
        blocked.errorType = "blocked_by_previous";
        blocked.error = root;
        if (item.chainHandoffCause)
          blocked.errorPolicy = {
            ...(blocked.errorPolicy || {}),
            code: root,
            recoveryCause: item.chainHandoffCause,
          };
        blocked.completedAt = Date.now();
        blocked.dependency = {
          ...(blocked.dependency || {}),
          state: "blocked",
          errorCode: "blocked_by_previous",
          rootItemId: item.id,
          resolvedRefFileIds: [],
        };
        job.failedCount++;
      });
      this._itemQueue = this._itemQueue.filter(
        (queued) => !downstream.includes(queued),
      );
      return;
    }
    const generatedNames =
      job.chain.kind === "video_last_frame"
        ? item.resultFrameFileNames || {}
        : item.resultFileNames || {};
    const generatedThumbs =
      job.chain.kind === "video_last_frame"
        ? item.resultFrameThumbnails || {}
        : item.resultThumbnails || {};
    let refs = [...generatedRefs];
    let names = Object.fromEntries(
      generatedRefs.map((id) => [
        id,
        generatedNames[id] || generatedThumbs[id]?.file_name || id,
      ]),
    );
    let thumbs = Object.fromEntries(
      generatedRefs
        .filter(
          (id) =>
            generatedThumbs[id] && typeof generatedThumbs[id] === "object",
        )
        .map((id) => [id, generatedThumbs[id]]),
    );
    if (job.chain.refPolicy === "generated_plus_mapped") {
      refs.push(...(next._mappedRefFileIds || []));
      names = { ...(next._mappedRefFileNames || {}), ...names };
      thumbs = { ...(next._mappedRefThumbnails || {}), ...thumbs };
    }
    refs = [...new Set(refs.filter(Boolean))];
    const adapter = window.ProviderRegistry?.get?.("flow");
    const isVideo = job.chain.kind === "video_last_frame";
    const cap = adapter?.getMaxRefImages?.({
      mode: isVideo ? "video" : "image",
      isFrames: isVideo,
      modelValue: next.settings?.model,
    });
    if (Number.isFinite(cap)) refs = refs.slice(0, Math.max(0, cap));
    if (!refs.length) {
      if (downstream.some((blocked) => !blocked.isTerminal)) {
        this._recordHistoryDiagnostic(
          job,
          "dispatch_blocked",
          item,
          "CHAIN_REF_LIMIT_ZERO",
        );
      }
      downstream.forEach((blocked) => {
        if (blocked.isTerminal) return;
        blocked.state = QueueItem.STATE.BLOCKED;
        blocked.errorType = "blocked_by_previous";
        blocked.error = "CHAIN_REF_LIMIT_ZERO";
        blocked.completedAt = Date.now();
        blocked.dependency = {
          ...(blocked.dependency || {}),
          state: "blocked",
          errorCode: "blocked_by_previous",
          rootItemId: item.id,
          resolvedRefFileIds: [],
        };
        job.failedCount++;
      });
      this._itemQueue = this._itemQueue.filter(
        (queued) => !downstream.includes(queued),
      );
      return;
    }
    next.refFileIds = refs;
    next.refFileNames = Object.fromEntries(
      refs.map((id) => [id, names[id] || id]),
    );
    next.refThumbnails = Object.fromEntries(
      refs
        .filter((id) => thumbs[id] && typeof thumbs[id] === "object")
        .map((id) => [id, thumbs[id]]),
    );
    if (isVideo) next.settings = { ...(next.settings || {}), isFrames: true };
    next.dependency = {
      ...(next.dependency || {}),
      state: "resolved",
      resolvedRefFileIds: [...refs],
      errorCode: null,
    };
    next.state = QueueItem.STATE.PENDING;
    job.chain.currentItemId = next.id;
    this._sortQueue();
    this._ensureRunning();
  }
  async _prepareWebVideoChainHandoff(item, job) {
    item._chainHandoffStage = "tools";
    if (
      !window.VideoFrameExtractor?.extractLastFrame ||
      !window.MessageBridge?.uploadFilesToFlow
    ) {
      throw new Error("WEB_CHAIN_FRAME_TOOLS_UNAVAILABLE");
    }
    const selectVideo = (map) => {
      for (const id of item.resultTileIds || []) {
        const media = map?.[id];
        const url =
          media?.video_url ||
          (media?.type === "video" && media?.thumb_is_poster !== true
            ? media?.thumbnail
            : null);
        if (media?.type === "video" || url)
          return { id, media: media || {}, url: url || null };
      }
      return null;
    };
    let selected = selectVideo(item.resultThumbnails);
    const resolveSelectedPlayback = async (candidate) => {
      if (!candidate || !window.MessageBridge?.resolveVideoPlaybackUrl)
        return candidate;
      if (item.genMode === "api" && candidate.url) return candidate;
      const media = candidate.media || {};
      const persistentId = media.persistent_media_id || media.result_id || "";
      try {
        const resolved = await window.MessageBridge.resolveVideoPlaybackUrl(
          persistentId || candidate.id,
          {
            fileName:
              media.file_name || item.resultFileNames?.[candidate.id] || "",
            sourceUrl:
              media.source_thumbnail || media.thumbnail || candidate.url || "",
            persistentMediaId: persistentId,
            forceDomResolve: false,
          },
        );
        if (resolved?.success && resolved.video_url) {
          const resolvedIdentityIsAsb = /^[A-Za-z0-9_-]{32,1024}$/.test(
            String(resolved.persistent_media_id || ""),
          );
          const merged = {
            ...media,
            type: "video",
            video_url: resolved.video_url,
            ...(resolved.thumbnail && {
              thumbnail: media.thumbnail || resolved.thumbnail,
            }),
            ...(resolved.persistent_media_id && {
              result_id: resolved.persistent_media_id,
              file_name: resolved.persistent_media_id,
              persistent_media_id: resolved.persistent_media_id,
              identity_durability: resolvedIdentityIsAsb
                ? "durable"
                : media.identity_durability ||
                  (item.genMode === "api" ? "durable-resolver" : "session"),
            }),
          };
          item.resultThumbnails = {
            ...(item.resultThumbnails || {}),
            [candidate.id]: merged,
          };
          console.log(
            "[GenTabLastFrame] playback resolved before extraction",
            JSON.stringify({
              attempt: String(item.id || "").substring(0, 8),
              identity_kind: /^[A-Za-z0-9_-]{32,1024}$/.test(
                String(merged.persistent_media_id || ""),
              )
                ? "flow_v2_asb"
                : "other_or_missing",
              rebuilt_from_media_id: resolved.rebuilt_from_media_id === true,
            }),
          );
          return { id: candidate.id, media: merged, url: resolved.video_url };
        }
      } catch (error) {
        console.warn(
          "[GenTabLastFrame] media-id playback resolution failed; using DOM fallback",
          error?.message || error,
        );
      }
      return candidate;
    };
    item._chainHandoffStage = "playback";
    selected = await resolveSelectedPlayback(selected);
    if (!selected?.url && item.resultTileIds?.length) {
      item._chainHandoffStage = "thumbnail_lookup";
      const refreshed = await window.MessageBridge.getThumbnailsByIds(
        item.resultTileIds,
        {
          deep: false,
          exactIdentityOnly: true,
          waitMountedMs: 3e3,
          fileNamesById: item.resultFileNames || {},
        },
      );
      const results = refreshed?.results || refreshed?.thumbnails || {};
      item.resultThumbnails = { ...(item.resultThumbnails || {}), ...results };
      selected = await resolveSelectedPlayback(
        selectVideo(item.resultThumbnails),
      );
    }
    const videoUrl = selected?.url || null;
    if (!videoUrl) throw new Error("WEB_CHAIN_VIDEO_URL_MISSING");
    if (job.state === "stopped") throw new Error("CHAIN_STOPPED_BY_USER");
    item._chainHandoffStage = "extract";
    const frame = await window.VideoFrameExtractor.extractLastFrame(videoUrl, {
      provider: "flow",
    });
    if (!frame?.base64) throw new Error("WEB_CHAIN_LAST_FRAME_EMPTY");
    if (job.state === "stopped") throw new Error("CHAIN_STOPPED_BY_USER");
    const frameBase64 = String(frame.base64).replace(
      /^data:image\/[a-z0-9.+-]+;base64,/i,
      "",
    );
    if (!frameBase64) throw new Error("WEB_CHAIN_LAST_FRAME_EMPTY");
    const frameName = `chain-last-frame-${item.id}.jpg`;
    const domUpload = () =>
      window.MessageBridge.uploadFilesToFlow(
        [{ name: frameName, type: "image/jpeg", base64: frameBase64 }],
        { forceDom: true },
      );
    item._chainHandoffStage = "upload";
    const routedUpload = window.FlowApiV2Driver?.uploadReference
      ? await window.FlowApiV2Driver.uploadReference({
          base64: frameBase64,
          fileName: frameName,
          mimeType: "image/jpeg",
          projectId: item.projectId || job.projectId || null,
          surface: "gen",
          abortFn: () => job.state === "stopped",
          domUpload,
        })
      : await domUpload();
    const upload = routedUpload?.file_id
      ? {
          tileDetails: [
            {
              id: routedUpload.file_id,
              file_name: routedUpload.file_name,
              thumbnail: routedUpload.thumbnail,
              thumbnailUrl: routedUpload.thumbnailUrl,
              media_uuid: routedUpload.media_uuid,
              persistent_media_id: routedUpload.persistent_media_id,
              identity_kind: routedUpload.identity_kind,
              identity_durability: routedUpload.identity_durability,
              identity_aliases: routedUpload.identity_aliases,
              api_driver: routedUpload.api_driver,
              project_id: routedUpload.project_id,
              protocol_revision: routedUpload.protocol_revision,
              protocol_fingerprint: routedUpload.protocol_fingerprint,
            },
          ],
        }
      : routedUpload;
    const detail = upload?.tileDetails?.[0] || {};
    const frameId =
      detail.id || upload?.orderedTileIds?.[0] || upload?.tileIds?.[0];
    if (!frameId)
      throw new Error(upload?.error || "WEB_CHAIN_LAST_FRAME_UPLOAD_FAILED");
    if (job.state === "stopped") throw new Error("CHAIN_STOPPED_BY_USER");
    const fileName = detail.file_name || frameId;
    item.resultFrameFileIds = [frameId];
    item.resultFrameFileNames = { [frameId]: fileName };
    item.resultFrameThumbnails = {
      [frameId]: {
        thumbnail: detail.thumbnailUrl || detail.thumbnail || null,
        type: "image",
        file_name: fileName,
        ...(detail.media_uuid && { media_uuid: detail.media_uuid }),
        ...(detail.persistent_media_id && {
          persistent_media_id: detail.persistent_media_id,
        }),
        ...(detail.identity_kind && { identity_kind: detail.identity_kind }),
        ...(detail.identity_durability && {
          identity_durability: detail.identity_durability,
        }),
        ...(detail.identity_aliases && {
          identity_aliases: detail.identity_aliases,
        }),
        ...(detail.api_driver && { api_driver: detail.api_driver }),
        ...(detail.project_id && { project_id: detail.project_id }),
        ...(detail.protocol_revision && {
          protocol_revision: detail.protocol_revision,
        }),
        ...(detail.protocol_fingerprint && {
          protocol_fingerprint: detail.protocol_fingerprint,
        }),
      },
    };
    item.resultFrameProviderUrls = {
      [frameId]: {
        provider: "flow",
        media_type: "image",
        project_id: item.projectId || job.projectId || null,
        captured_at: Date.now(),
      },
    };
    delete item.chainHandoffError;
    delete item.chainHandoffCause;
    delete item._chainHandoffStage;
    console.log(
      "[GenChainHandoff]",
      JSON.stringify({
        engine: job.chain?.engine,
        sourceItemId: item.id,
        sourceVideoId: selected.id,
        frameId,
        ready: true,
      }),
    );
  }
  _onRunLoopFinished() {
    this._webRecovery?.releaseIfIdle();
    if (this.hasItems() && !this._webRecovery?.blocked) {
      this._ensureRunning();
    }
    this._checkAllDone();
    this._emitStateChanged();
  }
  _onTilesReady(item, tileIds) {
    const resultJob = this._jobs.get(item.jobId);
    if (resultJob?._onResultsReady && tileIds?.length) {
      const fileIds = [
        ...new Set(
          resultJob.items.flatMap((entry) => entry.resultTileIds || []),
        ),
      ];
      const thumbnails = {},
        fileNames = {},
        providerUrls = {};
      for (const entry of resultJob.items) {
        Object.assign(thumbnails, entry.resultThumbnails || {});
        Object.assign(fileNames, entry.resultFileNames || {});
        Object.assign(providerUrls, entry.resultProviderUrls || {});
      }
      try {
        resultJob._onResultsReady({
          fileIds,
          thumbnails,
          fileNames,
          providerUrls,
          genMode: item.genMode || null,
        });
      } catch (error) {
        console.warn(
          "[PromptQueue] Result preview callback failed:",
          error.message,
        );
      }
    }
    const canUseAutoDownload =
      window.featureGate?.canUse("auto_download") ?? false;
    if (!canUseAutoDownload) {
      if (resultJob?.owner === "workflow")
        console.info("[WorkflowWatermark] download skipped", {
          nodeId: resultJob.workflowNodeId || null,
          reason: "auto_download_entitlement",
        });
      return;
    }
    const job = this._jobs.get(item.jobId);
    const autoDownload = item._autoDownload ?? job?._autoDownload ?? false;
    if (!autoDownload) {
      if (job?.owner === "workflow")
        console.info("[WorkflowWatermark] download skipped", {
          nodeId: job.workflowNodeId || null,
          reason: "node_auto_download_off",
        });
      return;
    }
    const providerDataFor = (tid) =>
      item.resultProviderUrls?.[tid] ||
      (item.resultFileNames?.[tid]
        ? item.resultProviderUrls?.[item.resultFileNames[tid]]
        : null) ||
      null;
    const firstProviderData =
      tileIds.map(providerDataFor).find(Boolean) || null;
    const isVideo =
      firstProviderData?.media_type === "video" ||
      item._isVideo === true ||
      item.settings?.genType === "Video";
    let resolution;
    if (isVideo) {
      const videoResEl = document.getElementById(
        "genTabVideoDownloadResolution",
      );
      resolution = item._videoDownloadResolution || videoResEl?.value || "720p";
    } else {
      const resEl = document.getElementById("genTabDownloadResolution");
      resolution = item._downloadResolution || resEl?.value || "1k";
    }
    const existingInQueue = new Set(this._downloadQueue.map((d) => d.tileId));
    if (this._currentDownloadItem?.tileId)
      existingInQueue.add(this._currentDownloadItem.tileId);
    let enqueued = 0;
    let skippedDownloaded = 0;
    let skippedInQueue = 0;
    const _base = String((item.promptIndex ?? 0) + 1).padStart(3, "0");
    const _qty = item.settings?.quantity || 1;
    for (const tid of tileIds) {
      if (this._downloadedTileIds.has(tid)) {
        skippedDownloaded++;
        continue;
      }
      if (existingInQueue.has(tid)) {
        skippedInQueue++;
        continue;
      }
      item._dlSeq = (item._dlSeq || 0) + 1;
      const _pu = item.genMode === "api" ? providerDataFor(tid) : null;
      const _apiMediaId =
        _pu?.provider === "flow"
          ? [_pu.media_uuid, tid, item.resultFileNames?.[tid]].find(
              (value) =>
                typeof value === "string" &&
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                  value,
                ),
            ) || tid
          : tid;
      this._downloadQueue.push({
        tileId: tid,
        originalItemId: item.id,
        plannedFilename:
          item._phaseRRecord?.outputs.find((output) => output.mediaId === tid)
            ?.filename || null,
        attemptId: item.attemptId || item.id,
        outputIndex:
          item.outputs?.find(
            (output) => output.resultId === tid || output.mediaId === tid,
          )?.outputIndex ?? null,
        apiMediaId: _apiMediaId,
        fileName:
          item.resultFileNames?.[tid] ||
          item.resultThumbnails?.[tid]?.persistent_media_id ||
          item.resultThumbnails?.[tid]?.file_name ||
          null,
        promptText: item.prompt,
        taskName: item._taskName || null,
        jobId: item.jobId,
        flowFileId: null,
        resolution,
        watermarkMode: item.settings?.watermarkMode || null,
        isVideo,
        index:
          item._phaseRRecord?.outputs.find((output) => output.mediaId === tid)
            ?.nameIndex || (_qty > 1 ? `${_base}_${item._dlSeq}` : _base),
        providerUrl: _pu?.url || null,
        durableUrl: _pu?.durable_url || null,
        providerData: _pu ? { ..._pu } : null,
        apiProvider: _pu?.provider === "flow",
        genMode: item.genMode || null,
        projectId: _pu?.project_id || null,
        ratio: _pu ? item.settings?.ratio || null : null,
        forWorkflow: job?.owner === "workflow",
      });
      existingInQueue.add(tid);
      item.markOutputDownload?.(tid, "queued");
      enqueued++;
    }
    console.log(
      `[PromptQueue] _onTilesReady: ${tileIds.length} tiles \u2192 ${enqueued} enqueued, ${skippedDownloaded} already downloaded, ${skippedInQueue} already in queue. Queue size: ${this._downloadQueue.length}`,
    );
    if (job?.owner === "workflow")
      console.info("[WorkflowWatermark] auto-download queued", {
        nodeId: job.workflowNodeId || null,
        mediaType: isVideo ? "video" : "image",
        watermarkMode: item.settings?.watermarkMode || "inherit",
        enqueued,
        globalEnabled:
          window.WatermarkClient?.enabled?.(isVideo ? "video" : "image") ===
          true,
      });
    this._ensureRunning();
  }
  _enqueueTaskItems(job, taskIdx) {
    const task = job.taskBatch.tasks[taskIdx];
    const settings = job.taskBatch.settingsPerTask?.[taskIdx] || job.settings;
    const rawPrompts =
      task.multi_prompt && task.prompts?.length > 1
        ? task.prompts
        : [task.prompt];
    const rawRefIds = task.ref_file_ids || [];
    const _rawTaskRefIds =
      typeof rawRefIds === "string"
        ? rawRefIds
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : rawRefIds;
    const _refFileIds = this._uniqueTaskRefIds(task, _rawTaskRefIds);
    const _refImageMode = task.ref_image_mode || "all";
    const prompts = rawPrompts;
    let refFileIds = _refFileIds;
    let refImageMode = _refImageMode;
    let framePerPrompt = null;
    const _isVideoFrames =
      task.media_type === "Video" && task.video_input_type === "Frames";
    if (_isVideoFrames) {
      if (Array.isArray(task.frame_pairs) && task.frame_pairs.length > 0) {
        const set = new Set();
        task.frame_pairs.forEach((fp) => {
          if (fp?.frame1) set.add(fp.frame1);
          if (fp?.frame2) set.add(fp.frame2);
        });
        refFileIds = [...set];
        refImageMode = "sequential";
        framePerPrompt = task.frame_pairs.map((fp) => {
          const ids = [];
          if (fp?.frame1) ids.push(fp.frame1);
          if (fp?.frame2) ids.push(fp.frame2);
          return ids;
        });
      } else if (task.frame_1_file_id || task.frame_2_file_id) {
        const ids = [];
        if (task.frame_1_file_id) ids.push(task.frame_1_file_id);
        if (task.frame_2_file_id) ids.push(task.frame_2_file_id);
        refFileIds = ids;
      }
    }
    let refFileIdsPerPrompt = framePerPrompt;
    let taskMentionData = null;
    if (refFileIdsPerPrompt) {
    } else if (refImageMode === "sequential" && refFileIds.length > 0) {
      refFileIdsPerPrompt = rawPrompts.map((_, idx) =>
        window.RefImageAssignment.select(
          refFileIds,
          idx,
          task.ref_images_per_prompt,
        ),
      );
    } else if (
      refImageMode === "mention" &&
      refFileIds.length > 0 &&
      task.ref_image_names
    ) {
      const nameToFileId = {};
      for (const [fid, representative] of this._taskRefAliasMap(
        task,
        refFileIds,
        _rawTaskRefIds,
      )) {
        const name = task.ref_image_names[fid];
        if (name) nameToFileId[name.toLowerCase()] = representative;
      }
      refFileIdsPerPrompt = rawPrompts.map((prompt) => {
        const mentions = prompt.match(/@(\[[^\]]+\]|[\p{L}\p{N}_]+)/gu) || [];
        const ids = [];
        for (const m of mentions) {
          const name = m
            .substring(1)
            .replace(/^\[|\]$/g, "")
            .toLowerCase();
          if (nameToFileId[name] && !ids.includes(nameToFileId[name])) {
            ids.push(nameToFileId[name]);
          }
        }
        return ids;
      });
      const fileNameMap = task.ref_file_names || {};
      taskMentionData = rawPrompts.map((_, i) => ({
        refImages: (refFileIdsPerPrompt[i] || []).map((fid) => ({
          file_id: fid,
          file_name: fileNameMap[fid] || null,
        })),
      }));
    }
    for (let i = 0; i < prompts.length; i++) {
      const item = new QueueItem({
        jobId: job.id,
        prompt: prompts[i],
        promptIndex: i,
        settings: settings ? { ...settings } : null,
        refFileIds: this._resolveRefForIndex(
          refFileIds,
          refFileIdsPerPrompt,
          refImageMode,
          i,
        ),
        refFileNames: task.ref_file_names || {},
        refImageMode,
        mentionData: taskMentionData?.[i] || null,
      });
      item._taskIdx = taskIdx;
      item.refThumbnails = task.ref_thumbnails || {};
      item.refFileNames = { ...item.refFileNames };
      for (const id of item.refFileIds || []) {
        const mediaUuid = item.refThumbnails[id]?.media_uuid;
        if (
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            String(mediaUuid || ""),
          )
        ) {
          item.refFileNames[id] = mediaUuid;
        }
      }
      item._owner = "task";
      item.projectId = job.projectId || null;
      item._flowDriverKey = job.flowDriverKey;
      item._flowCompactLayout = job.flowCompactLayout;
      item._taskId = task.task_id || task.id;
      item._taskName = task.task_name || null;
      item._autoDownload =
        task.auto_download === true ||
        task.auto_download === "1" ||
        task.auto_download === 1;
      item._downloadResolution = task.download_resolution || null;
      item._videoDownloadResolution = task.video_download_resolution || null;
      item._isVideo = task.media_type === "Video";
      if (job._flowApiEngineLock === "web") {
        item._forceWebChain = true;
        item._flowApiPreflightReason =
          job._flowApiWebReason || "JOB_LOCKED_WEB";
        item._historyInitialGenMode = "web";
      } else {
        item._historyInitialGenMode = this._editorExecutor?._isFlowApiMode?.(
          item,
        )
          ? "api"
          : "web";
      }
      job.items.push(item);
      if (this._isApiQuotaBlockedForItem(job, item)) {
        this._cancelUndispatchedQuotaItem(job, item);
      } else {
        this._itemQueue.push(item);
      }
    }
    job.taskBatch.currentIdx = taskIdx;
    const taskId = task.task_id || task.id;
    const skippedForQuota = job.items
      .filter((item) => item._taskIdx === taskIdx)
      .every((item) => item.state === QueueItem.STATE.CANCELLED);
    const taskStatus = skippedForQuota ? "failed" : "running";
    if (taskId && window.storageManager) {
      window.storageManager
        .updateTaskStatus(taskId, taskStatus)
        .catch(() => {});
    }
    if (taskId && window.eventBus) {
      window.eventBus.emit("task:status_changed", {
        taskId,
        status: taskStatus,
        ...(skippedForQuota
          ? { error_reason: job.stopReason || "FLOW_MODEL_DAILY_QUOTA_REACHED" }
          : {}),
      });
    }
  }
  _checkTaskBoundary(job, completedItem) {
    if (job._apiQuotaBlocked || job._apiUnusualBlocked) return;
    const taskIdx = completedItem._taskIdx;
    if (taskIdx === null || taskIdx === void 0) return;
    const taskItems = job.items.filter((i) => i._taskIdx === taskIdx);
    const allDone = taskItems.every((i) => i.isTerminal);
    if (allDone && job.state === "running") {
      for (
        let nextIdx = taskIdx + 1;
        nextIdx < job.taskBatch.tasks.length;
        nextIdx++
      ) {
        this._enqueueTaskItems(job, nextIdx);
        const nextItems = job.items.filter((item) => item._taskIdx === nextIdx);
        if (nextItems.some((item) => !item.isTerminal)) {
          this._sortQueue();
          this._ensureRunning();
          break;
        }
      }
    }
  }
  _holdAmbiguousApiWorkflow(item) {
    const job = this._jobs.get(item.jobId);
    if (
      !job ||
      job.owner !== "workflow" ||
      job.isDone ||
      item.state !== QueueItem.STATE.RECOVERY_REQUIRED ||
      item.errorPolicy?.stage !== "ambiguous"
    )
      return false;
    job.state = "paused";
    job.recoveryRequired = item.error || "REQUEST_TIMEOUT";
    job.recoveryLabel =
      window.I18n?.t?.("flowRecovery.unverified") || job.recoveryRequired;
    job.recoveryHint = window.I18n?.t?.("flowRecovery.unverifiedHint") || null;
    this._itemQueue = (this._itemQueue || []).filter(
      (candidate) =>
        candidate.jobId !== job.id ||
        candidate._apiDispatchStarted ||
        candidate.flowApiAccepted ||
        candidate.operationId ||
        candidate.flowOperationId,
    );
    for (const candidate of job.items) {
      if (
        candidate === item ||
        candidate.isTerminal ||
        candidate._apiDispatchStarted ||
        candidate.flowApiAccepted ||
        candidate.operationId ||
        candidate.flowOperationId
      )
        continue;
      candidate.state = QueueItem.STATE.CANCELLED;
      candidate.completedAt = Date.now();
      candidate._apiWaitingSlot = false;
    }
    if (!job._apiRecoveryCallerReleased) {
      job._apiRecoveryCallerReleased = true;
      job._resolve?.({
        recoveryRequired: true,
        reason: job.recoveryRequired,
        recoveryLabel: job.recoveryLabel,
        recoveryHint: job.recoveryHint,
        completed: job.completedCount,
        failed: job.failedCount,
        stopped: false,
      });
      job._resolve = null;
    }
    this._emitStateChanged();
    return true;
  }
  _checkJobDone(job) {
    if (job.isDone || job._resolved) return;
    if (
      job._manualRegenInFlight ||
      job._manualRegenBatchPending ||
      job._manualRegenRequests?.length
    )
      return;
    const allTerminal = job.items.every((i) => i.isTerminal);
    if (!allTerminal) return;
    if (
      job.taskBatch &&
      job.taskBatch.mode === "sequential" &&
      !job._apiUnusualBlocked
    ) {
      const lastIdx = job.taskBatch.currentIdx;
      if (lastIdx + 1 < job.taskBatch.tasks.length) return;
    }
    this._releaseFlowBlocker({
      blockerRunId: job._blockerRunId || this._blockerRunId,
    });
    if (!job._generationNotified) {
      job._generationNotified = true;
      const historyItems = job.items || [];
      const historyResultIds = [
        ...new Set(
          historyItems
            .flatMap((item) => item.resultTileIds || [])
            .filter(Boolean),
        ),
      ];
      console.info(
        "[GenHistoryAudit]",
        JSON.stringify({
          jobId: job.id,
          owner: job.owner,
          phase: "generation_terminal",
          prompts: historyItems.length,
          expectedOutputs: historyItems.reduce(
            (sum, item) =>
              sum + Math.max(1, parseInt(item.settings?.quantity, 10) || 1),
            0,
          ),
          verifiedResultIds: historyResultIds.length,
          terminalStates: historyItems.reduce((counts, item) => {
            counts[item.state] = (counts[item.state] || 0) + 1;
            return counts;
          }, {}),
          recordedErrors: this._historyErrorDetails(historyItems).length,
          missingResults: historyItems
            .filter(
              (item) =>
                (item.resultTileIds || []).length <
                Math.max(1, parseInt(item.settings?.quantity, 10) || 1),
            )
            .slice(0, 100)
            .map((item) => ({
              promptIndex: item.promptIndex,
              state: item.state,
              resultCount: (item.resultTileIds || []).length,
              reason: item.errorPolicy?.code || item.error || null,
            })),
          chunkCounter: this._reloadPromptCounter || 0,
          completedChunks: this._completedChunks || 0,
        }),
      );
      try {
        job._onGenerationComplete?.({
          fileIds: [
            ...new Set(job.items.flatMap((item) => item.resultTileIds || [])),
          ],
          completed: job.completedCount,
          failed: job.failedCount,
        });
      } catch (error) {
        console.warn(
          "[PromptQueue] Generation completion callback failed:",
          error?.message || error,
        );
      }
    }
    if (
      window.ExecutionGate &&
      job._executionToken &&
      !job._executionTokenManagedByCaller
    ) {
      let gateStatus,
        extraData = {};
      const hasUnsubmittedRemoval = job.items.some(
        (item) => item._trackerRemovedBeforeSubmit === true,
      );
      if (
        (job.failedCount === 0 && !hasUnsubmittedRemoval) ||
        job.completedCount === 0
      ) {
        gateStatus = job.completedCount === 0 ? "failed" : "success";
      } else {
        gateStatus = "partial";
        extraData = {
          successful_count: job.completedCount,
          failed_count: job.failedCount,
        };
      }
      ExecutionGate.complete(job._executionToken, gateStatus, extraData);
      job._executionToken = null;
    }
    const hasPendingDownloads =
      this._downloadQueue.some((d) => d.jobId === job.id) ||
      this._currentDownloadItem?.jobId === job.id;
    if (hasPendingDownloads) {
      return;
    }
    job.state = "completed";
    job.completedAt = Date.now();
    const _jobExpectedOutputs = job.items.reduce(
      (sum, item) =>
        sum + Math.max(1, parseInt(item.settings?.quantity, 10) || 1),
      0,
    );
    const _jobOutputs = job.items.flatMap((item) =>
      Array.isArray(item.outputs) ? item.outputs : [],
    );
    window.FlowApiTelemetry?.emit?.(
      "job_terminal",
      {
        jobId: job.id || null,
        owner: job.owner || null,
        prompts: job.items.length,
        completedPrompts: job.completedCount,
        failedPrompts: job.failedCount,
        partialPrompts: job.partialCount || 0,
        expectedOutputs: _jobExpectedOutputs,
        accountedOutputs: _jobOutputs.length,
        completedOutputs: _jobOutputs.filter(
          (output) => output.status === "completed",
        ).length,
        failedOutputs: _jobOutputs.filter(
          (output) => output.status === "failed",
        ).length,
        downloadedOutputs: _jobOutputs.filter(
          (output) => output.downloadStatus === "downloaded",
        ).length,
        durationMs: Math.max(
          0,
          Number(job.completedAt) - Number(job.createdAt || job.completedAt),
        ),
        quantityMismatch: _jobOutputs.length !== _jobExpectedOutputs,
        mode: job.items.some((item) => item.genMode === "api")
          ? job.items.some((item) => item.genMode === "web")
            ? "mixed"
            : "api"
          : "web",
        effectiveRunMode: job.sequentialMode ? "sequential" : "parallel",
        forcedV2WebSequential: job.forcedV2WebSequential === true,
      },
      { dedupeKey: `job_terminal:${job.id}` },
    );
    const hasApiResults = job.items.some(
      (item) =>
        item.genMode === "api" &&
        ((item.outputs || []).some(
          (output) =>
            output.status === "completed" &&
            (output.mediaId || output.resultId),
        ) ||
          (item.resultTileIds || []).length > 0),
    );
    if (hasApiResults) this._pendingApiRefresh = true;
    else if (job.items.some((item) => item.genMode === "api")) {
      console.log(
        "[PromptQueue] API refresh skipped: no successful output",
        JSON.stringify({ jobId: job.id, owner: job.owner }),
      );
    }
    if (!job._resolved) {
      job._resolved = true;
      const allResultTileIds = [];
      const allResultThumbnails = {};
      const allResultFileNames = {};
      const allResultProviderUrls = {};
      const allResultFrameFileIds = [];
      const allResultFrameFileNames = {};
      const allResultFrameThumbnails = {};
      const allResultFrameProviderUrls = {};
      const apiResultTileIds = [];
      const failedPrompts = [];
      let completedOutputs = 0;
      let failedOutputs = 0;
      let _apiCount = 0,
        _domCount = 0;
      for (const item of job.items) {
        completedOutputs += (item.outputs || []).filter(
          (output) => output.status === "completed",
        ).length;
        failedOutputs += (item.outputs || []).filter(
          (output) => output.status === "failed",
        ).length;
        if (item.resultTileIds?.length > 0) {
          allResultTileIds.push(...item.resultTileIds);
          Object.assign(allResultThumbnails, item.resultThumbnails || {});
          Object.assign(allResultFileNames, item.resultFileNames || {});
          Object.assign(allResultProviderUrls, item.resultProviderUrls || {});
          if (item.genMode === "api") {
            _apiCount++;
            apiResultTileIds.push(...item.resultTileIds);
          } else _domCount++;
        }
        if (item.resultFrameFileIds?.length > 0) {
          allResultFrameFileIds.push(...item.resultFrameFileIds);
          Object.assign(
            allResultFrameFileNames,
            item.resultFrameFileNames || {},
          );
          Object.assign(
            allResultFrameThumbnails,
            item.resultFrameThumbnails || {},
          );
          Object.assign(
            allResultFrameProviderUrls,
            item.resultFrameProviderUrls || {},
          );
        }
        if (
          (item.state !== QueueItem.STATE.CANCELLED ||
            (!item._apiDispatchStarted &&
              !item.flowApiAccepted &&
              ["quota_exceeded", "per_model_daily", "tier_restricted"].includes(
                item.errorType,
              ))) &&
          (item.error ||
            (item.isTerminal &&
              (!item.resultTileIds || item.resultTileIds.length === 0)))
        ) {
          failedPrompts.push({
            index: item.promptIndex,
            prompt: item.prompt,
            genMode: item.genMode || null,
            state: item.state,
            errorType: item.errorType || null,
            error: item.error || "No results generated",
            timestamp: item.completedAt || Date.now(),
          });
        }
      }
      const cancelledCount = job.items.filter(
        (i) => i.state === QueueItem.STATE.CANCELLED,
      ).length;
      job._resolve?.({
        jobId: job.id,
        completed: job.completedCount,
        failed: job.failedCount,
        partial: job.partialCount || 0,
        completedOutputs,
        failedOutputs,
        cancelledCount,
        stopped: false,
        durationMs: Math.max(
          0,
          Number(job.completedAt) - Number(job.createdAt || job.completedAt),
        ),
        resultTileIds: allResultTileIds,
        resultThumbnails: allResultThumbnails,
        resultFileNames: allResultFileNames,
        resultProviderUrls: allResultProviderUrls,
        refFileIdsUsed: this._historyRefFileIds(job.items),
        flowApiVersions: this._historyApiVersions(job.items),
        historyRoute: this._historyRoute(job.items),
        errorDetails: this._historyErrorDetails(job.items),
        frameFileIds: allResultFrameFileIds,
        frameFileNames: allResultFrameFileNames,
        frameThumbnails: allResultFrameThumbnails,
        frameProviderUrls: allResultFrameProviderUrls,
        attempts: job.items.map((item) => ({
          attemptId: item.attemptId || item.id,
          flowOperationId: item.flowOperationId || null,
          correlationState: item.correlationState || null,
          correlationReceipt: item.flowCorrelationReceipt
            ? {
                schemaVersion: item.flowCorrelationReceipt.schemaVersion,
                strong: item.flowCorrelationReceipt.strong === true,
                operationIds: [
                  ...(item.flowCorrelationReceipt.operationIds || []),
                ],
                mediaIds: [...(item.flowCorrelationReceipt.mediaIds || [])],
                children: (item.flowCorrelationReceipt.children || []).map(
                  (child) => ({ ...child }),
                ),
                errorCodes: [...(item.flowCorrelationReceipt.errorCodes || [])],
              }
            : null,
          expectedQuantity: Math.max(
            1,
            parseInt(item.settings?.quantity, 10) || 1,
          ),
          outputs: Array.isArray(item.outputs)
            ? item.outputs.map((output) => ({ ...output }))
            : [],
        })),
        apiResultTileIds,
        genMode: _apiCount > 0 ? (_domCount > 0 ? "mixed" : "api") : "web",
        flowDriverKey: job.items.every(
          (item) => item._flowDriverKey === "flow_v2",
        )
          ? "flow_v2"
          : null,
        failedPrompts: failedPrompts.length > 0 ? failedPrompts : [],
        noRetry: job.items.some((item) => item.noRetry === true),
        downloadedTileIds: this._downloadHistory
          .filter(
            (entry) => entry.jobId === job.id && entry.state === "COMPLETED",
          )
          .map((entry) => entry.tileId),
        failedDownloadTileIds: this._downloadHistory
          .filter((entry) => entry.jobId === job.id && entry.state === "FAILED")
          .map((entry) => entry.tileId),
        blockedDownloadTileIds: this._downloadHistory
          .filter(
            (entry) =>
              entry.jobId === job.id &&
              entry.state === "FAILED" &&
              entry.noReplay === true,
          )
          .map((entry) => entry.tileId),
      });
      job._resolve = null;
    }
    this._checkAllDone();
  }
  _hasGenerationWork() {
    if (
      this._tileMonitor?.activeCount > 0 ||
      window.FlowApiAdapter?.hasInFlight?.() === true ||
      this._phaseRWorkflowAdmitting?.size > 0
    )
      return true;
    const current = this._editorExecutor?.currentItem;
    if (current && !current.isTerminal) return true;
    for (const job of this._jobs.values()) {
      if (!job.isActive) continue;
      if (
        job._admissionPending ||
        (job.items || []).some((item) => !item.isTerminal)
      )
        return true;
      if (
        job.taskBatch?.mode === "sequential" &&
        job.taskBatch.currentIdx + 1 < job.taskBatch.tasks.length
      )
        return true;
    }
    return false;
  }
  async _releaseFlowBlocker({
    force = false,
    stopRelease = false,
    blockerRunId = this._blockerRunId,
  } = {}) {
    if (!window.MessageBridge) {
      console.warn(
        "[ExecutionBlockerAudit] release skipped: MessageBridge unavailable",
      );
      return { success: false, released: false, reason: "bridge_unavailable" };
    }
    this._releasedFlowBlockerRunIds ||
      (this._releasedFlowBlockerRunIds = new Set());
    if (
      !stopRelease &&
      blockerRunId &&
      this._releasedFlowBlockerRunIds.has(blockerRunId)
    ) {
      return { success: true, released: true, deduplicated: true };
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!force && this._hasGenerationWork()) {
        if (attempt < 2)
          await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
      console.info(
        "[ExecutionBlockerAudit] release dispatch",
        JSON.stringify({ blockerRunId, stopRelease, attempt: attempt + 1 }),
      );
      const ack = await MessageBridge.releaseFlowBlocker({
        blockerRunId,
        stopRelease,
      });
      console.info(
        "[ExecutionBlockerAudit] release result",
        JSON.stringify({
          blockerRunId,
          stopRelease,
          released: ack?.released === true,
          stale: ack?.stale === true,
        }),
      );
      if (
        !stopRelease &&
        blockerRunId &&
        (ack?.released === true || ack?.stale === true)
      ) {
        this._releasedFlowBlockerRunIds.add(blockerRunId);
        while (this._releasedFlowBlockerRunIds.size > 32) {
          this._releasedFlowBlockerRunIds.delete(
            this._releasedFlowBlockerRunIds.values().next().value,
          );
        }
      }
      return ack;
    }
    console.info(
      "[ExecutionBlockerAudit] release deferred: generation still active",
      JSON.stringify({
        blockerRunId,
        tileMonitors: this._tileMonitor?.activeCount || 0,
        apiInFlight: window.FlowApiAdapter?.hasInFlight?.() === true,
        admissionPending: this._phaseRWorkflowAdmitting?.size || 0,
        currentItem: this._editorExecutor?.currentItem?.id || null,
      }),
    );
    return { success: false, released: false, reason: "generation_active" };
  }
  _checkAllDone() {
    const hasActive = Array.from(this._jobs.values()).some((j) => j.isActive);
    if (hasActive) return;
    if (this._itemQueue.length > 0) return;
    if (this._downloadQueue.length > 0) return;
    if (this._currentDownloadItem) return;
    if (this._tileMonitor.activeCount > 0) return;
    this._isRunning = false;
    this._reloadPromptCounter = 0;
    this._reloadPromptTabId = null;
    this._chunkDraining = false;
    this._completedChunks = 0;
    this._stopStagnationWatchdog();
    ExecutionLock.release("queue");
    if (window.MessageBridge) {
      this._releaseFlowBlocker({ force: true });
      MessageBridge.sendToContentScript("endFlowZoomSession", {}).catch(
        () => {},
      );
    }
    this.cleanup();
    this._tileMonitor.reset();
    this._downloadedTileIds.clear();
    if (this._pendingApiRefresh) {
      this.flushPendingApiRefresh("api-results-refresh").catch(() => {});
    }
    this.flushPendingCorrelationReset().catch(() => {});
    this._currentDownloadItem = null;
    this._emitStateChanged();
  }
  async _ensureFlowTabActive() {
    let targetTabId = window._targetFlowTabId || null;
    if (!targetTabId) {
      try {
        const res = await chrome.storage?.session?.get("targetFlowTabId");
        targetTabId = res?.targetFlowTabId || null;
      } catch (e) {}
    }
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: "ensureFlowTabReady", targetTabId },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({ isOpen: false });
            return;
          }
          resolve(response || { isOpen: false });
        },
      );
    });
  }
  _resetFlowChunkCounterForTabReload(tabId) {
    const ownerTabId =
      this._reloadPromptTabId || this._plannedFlowRecoveryReload?.tabId;
    if (!ownerTabId || ownerTabId !== tabId) return false;
    const previousCount = this._reloadPromptCounter;
    const previousWindowCount = this._webRecovery?.windowCount || 0;
    this._reloadPromptCounter = 0;
    if (this._webRecovery) {
      this._webRecovery.windowCount = 0;
      if (previousWindowCount)
        this._webRecovery.persist().catch((error) => {
          console.warn(
            "[PromptQueue] Cannot persist chunk counter reset:",
            error.message,
          );
        });
    }
    if (previousCount || previousWindowCount) {
      console.info("[PromptQueue] Flow reload reset chunk counters", {
        tabId,
        previousCount,
        previousWindowCount,
      });
    }
    return true;
  }
  async _checkAndPerformReload() {
    if (this._webRecovery?.pending.length || this._webRecovery?.blocked)
      return false;
    const phaseRActive = [...(this._webRecovery?.records.values() || [])].some(
      (record) => !record.terminal,
    );
    if (phaseRActive && !this._webRecovery.closed) return false;
    if (this._webRecovery?.closed) {
      if (
        this._tileMonitor.activeCount ||
        this._downloadQueue.length ||
        this._editorExecutor?.isDownloading
      )
        return false;
      const config = window.ExecutionConfig.safeGetFlowChunkConfig();
      const recoveryReachedChunk =
        config?.enabled === true &&
        config.size > 0 &&
        this._webRecovery.windowCount >= config.size;
      this._webRecovery.closed = false;
      this._webRecovery.windowCount = 0;
      this._webRecovery.windowMembers = null;
      await this._webRecovery.persist();
      if (!this._itemQueue.length) return false;
      if (!recoveryReachedChunk) return false;
      this._reloadPromptCounter = Math.max(
        this._reloadPromptCounter,
        config.size,
      );
    }
    try {
      const chunkConfig =
        window.ExecutionConfig?.safeGetFlowChunkConfig?.() || null;
      if (!chunkConfig) return false;
      const enabled = chunkConfig.enabled;
      const threshold = chunkConfig.size;
      if (!enabled || threshold <= 0) return false;
      if (this._reloadPromptCounter < threshold) return false;
      if (this._chunkDraining) return false;
      if (this._reloadSuppressCount > 0) {
        console.log(
          "[PromptQueue] Chunk reload deferred: multi-step caller active (suppress count:",
          this._reloadSuppressCount,
          ")",
        );
        return false;
      }
      const RELOAD_COOLDOWN_MS = 9e4;
      const sinceLast = this._lastAutoReloadAt
        ? Date.now() - this._lastAutoReloadAt
        : Infinity;
      if (sinceLast < RELOAD_COOLDOWN_MS) {
        if (
          !this._lastChunkCooldownLog ||
          Date.now() - this._lastChunkCooldownLog > 3e4
        ) {
          console.log(
            `[PromptQueue] Chunk reload waiting cooldown: ${Math.round(sinceLast / 1e3)}s/${RELOAD_COOLDOWN_MS / 1e3}s`,
          );
          this._lastChunkCooldownLog = Date.now();
        }
        return false;
      }
      console.log(
        `[PromptQueue] Chunk boundary reached (${this._reloadPromptCounter}/${threshold}), waiting drain...`,
      );
      this._chunkDraining = true;
      this._emitChunkStatus("draining", { chunkSize: threshold });
      try {
        const DRAIN_TIMEOUT_MS = 6 * 60 * 1e3;
        const drainStart = Date.now();
        let lastEmit = 0;
        while (
          (this._tileMonitor.activeCount > 0 ||
            this._downloadQueue.length > 0 ||
            this._editorExecutor?.isDownloading) &&
          Date.now() - drainStart < DRAIN_TIMEOUT_MS
        ) {
          if (this._webRecovery?.pending.length || this._webRecovery?.blocked) {
            console.log(
              "[PromptQueue] Chunk drain deferred: recovery needs the submit loop",
            );
            this._emitChunkStatus("cancelled", { chunkSize: threshold });
            return false;
          }
          if (
            this._downloadQueue.length > 0 &&
            !this._editorExecutor?.isDownloading
          ) {
            const dl = this.dequeueNextDownload();
            if (dl) {
              try {
                await this._editorExecutor._processDownload(dl);
              } catch (e) {
                console.warn(
                  "[PromptQueue] Chunk drain download error:",
                  e.message,
                );
              }
              continue;
            }
          }
          await new Promise((r) => setTimeout(r, 500));
          if (Date.now() - lastEmit > 2e3) {
            this._emitChunkStatus("draining", {
              chunkSize: threshold,
              remaining: this._tileMonitor.activeCount,
              dlPending: this._downloadQueue.length,
            });
            lastEmit = Date.now();
          }
        }
        if (
          this._tileMonitor.activeCount > 0 ||
          this._downloadQueue.length > 0 ||
          this._editorExecutor?.isDownloading
        ) {
          console.warn(
            "[PromptQueue] Chunk drain timeout \u2014 cancel reload and preserve pending work:",
            `monitors=${this._tileMonitor.activeCount}, downloads=${this._downloadQueue.length}, downloading=${!!this._editorExecutor?.isDownloading}`,
          );
          this._emitChunkStatus("cancelled", { chunkSize: threshold });
          return false;
        }
        if (this._webRecovery?.pending.length || this._webRecovery?.blocked)
          return false;
        this._emitChunkStatus("reloading", { chunkSize: threshold });
        const ok = await this.forceReloadAndStabilize("chunk-checkpoint");
        if (ok) {
          this._completedChunks++;
          this._emitChunkStatus("resumed", {
            chunkSize: threshold,
            completedChunks: this._completedChunks,
          });
          console.log(
            `[PromptQueue] Chunk ${this._completedChunks} reload OK, resuming next chunk`,
          );
        } else {
          this._emitChunkStatus("cancelled", { chunkSize: threshold });
          console.warn(
            "[PromptQueue] Chunk reload skipped/failed (cooldown or error), will retry next check",
          );
        }
        return ok;
      } finally {
        this._chunkDraining = false;
      }
    } catch (err) {
      console.warn("[PromptQueue] Chunk reload failed:", err.message);
      this._chunkDraining = false;
      return false;
    }
  }
  _emitChunkStatus(phase, extra = {}) {
    const payload = {
      phase,
      completedChunks: this._completedChunks,
      projectId: window._currentProjectId || window._flowProjectId || null,
      ...extra,
    };
    if (window.eventBus) {
      window.eventBus.emit("pipeline:chunk_status", payload);
    }
    this._broadcastToFlowTabs("pq:chunkStatus", payload);
  }
  async _waitContentScriptReady(timeoutMs = 2e4) {
    const startTime = Date.now();
    this._queueControlAbortController ||
      (this._queueControlAbortController = new AbortController());
    const control = {
      stopEpoch: this._stopEpoch || 0,
      signal: window.workflowExecutor?._executionTask
        ? window.workflowExecutor._flowAdmissionAbortController?.signal ||
          this._queueControlAbortController.signal
        : this._queueControlAbortController.signal,
    };
    const pollInterval = 1e3;
    while (Date.now() - startTime < timeoutMs) {
      if (
        control.signal?.aborted ||
        control.stopEpoch !== (this._stopEpoch || 0)
      )
        return false;
      try {
        const response = await this._awaitControlWork(
          MessageBridge.sendToContentScript(
            "checkContentScriptAlive",
            {},
            {
              signal: control.signal,
              timeoutMs: Math.max(1, timeoutMs - (Date.now() - startTime)),
            },
          ),
          { ...control, timeoutMs: timeoutMs - (Date.now() - startTime) },
        );
        if (response?.alive) {
          console.log(
            "[PromptQueue] Content script ready after reload (hasEditor:",
            response.hasEditor,
            ")",
          );
          return true;
        }
      } catch (e) {}
      if (
        control.signal?.aborted ||
        control.stopEpoch !== (this._stopEpoch || 0) ||
        Date.now() - startTime >= timeoutMs
      )
        return false;
      await new Promise((r) =>
        setTimeout(
          r,
          Math.min(pollInterval, timeoutMs - (Date.now() - startTime)),
        ),
      );
    }
    return false;
  }
  async _waitFlowEditorReady(
    timeoutMs = 3e4,
    previousDocumentEpoch = null,
    expectedFlowTarget = null,
  ) {
    const startTime = Date.now();
    this._queueControlAbortController ||
      (this._queueControlAbortController = new AbortController());
    const control = {
      stopEpoch: this._stopEpoch || 0,
      signal: window.workflowExecutor?._executionTask
        ? window.workflowExecutor._flowAdmissionAbortController?.signal ||
          this._queueControlAbortController.signal
        : this._queueControlAbortController.signal,
    };
    const pollInterval = 1e3;
    let lastEditorCheck = false;
    let consentAcceptAttempts = 0;
    const maxConsentAcceptAttempts = 5;
    const readTarget = expectedFlowTarget ? { expectedFlowTarget } : {};
    let lastDocumentDiagnostic = null;
    console.log(
      "[PromptQueue] _waitFlowEditorReady started, timeout:",
      timeoutMs,
    );
    while (Date.now() - startTime < timeoutMs) {
      if (
        control.signal?.aborted ||
        control.stopEpoch !== (this._stopEpoch || 0)
      )
        return false;
      try {
        const response = await this._awaitControlWork(
          MessageBridge.sendToContentScript(
            "checkContentScriptAlive",
            readTarget,
            {
              signal: control.signal,
              timeoutMs: Math.max(1, timeoutMs - (Date.now() - startTime)),
            },
          ),
          { ...control, timeoutMs: timeoutMs - (Date.now() - startTime) },
        );
        const isNewDocument =
          !previousDocumentEpoch ||
          (!!response?.documentEpoch &&
            response.documentEpoch !== previousDocumentEpoch);
        console.log(
          "[PromptQueue] checkContentScriptAlive:",
          response?.alive,
          "hasEditor:",
          response?.hasEditor,
          "newDocument:",
          isNewDocument,
        );
        if (expectedFlowTarget) {
          const tab = await chrome.tabs
            .get(expectedFlowTarget.tabId)
            .catch(() => null);
          const diagnostic = JSON.stringify({
            tabId: expectedFlowTarget.tabId,
            previousDocumentEpoch,
            documentEpoch: response?.documentEpoch || null,
            newDocument: isNewDocument,
            alive: response?.alive === true,
            hasEditor: response?.hasEditor === true,
            tabStatus: tab?.status || null,
            pendingNavigation: !!tab?.pendingUrl,
          });
          if (diagnostic !== lastDocumentDiagnostic) {
            lastDocumentDiagnostic = diagnostic;
            console.info("[FlowCookieRecovery] document check", diagnostic);
          }
        }
        if (response?.alive && response?.hasEditor && isNewDocument) {
          if (consentAcceptAttempts < maxConsentAcceptAttempts) {
            try {
              const consent = await this._awaitControlWork(
                MessageBridge.sendToContentScript(
                  "acceptUploadConsent",
                  readTarget,
                  {
                    signal: control.signal,
                    timeoutMs: Math.max(
                      1,
                      timeoutMs - (Date.now() - startTime),
                    ),
                  },
                ),
                { ...control, timeoutMs: timeoutMs - (Date.now() - startTime) },
              );
              if (consent?.accepted) {
                console.log(
                  "[PromptQueue] Accepted configured upload consent, attempt:",
                  consentAcceptAttempts + 1,
                );
                consentAcceptAttempts++;
                await new Promise((r) => setTimeout(r, 1e3));
                continue;
              }
            } catch (e) {}
          }
          try {
            const editorState = await this._awaitControlWork(
              MessageBridge.sendToContentScript("getEditor", readTarget, {
                signal: control.signal,
                timeoutMs: Math.max(1, timeoutMs - (Date.now() - startTime)),
              }),
              { ...control, timeoutMs: timeoutMs - (Date.now() - startTime) },
            );
            console.log(
              "[PromptQueue] getEditor:",
              editorState?.exists,
              "hasSlateState:",
              editorState?.hasSlateState,
            );
            if (editorState?.exists && editorState?.hasSlateState) {
              console.log("[PromptQueue] Flow editor + Slate ready!");
              return true;
            }
            if (!lastEditorCheck) {
              console.log(
                "[PromptQueue] Editor exists but Slate not ready, waiting...",
              );
              lastEditorCheck = true;
            }
          } catch (slateErr) {
            console.log("[PromptQueue] getEditor failed:", slateErr.message);
          }
        }
      } catch (e) {
        console.log("[PromptQueue] Poll error:", e.message);
      }
      if (
        control.signal?.aborted ||
        control.stopEpoch !== (this._stopEpoch || 0) ||
        Date.now() - startTime >= timeoutMs
      )
        return false;
      await new Promise((r) =>
        setTimeout(
          r,
          Math.min(pollInterval, timeoutMs - (Date.now() - startTime)),
        ),
      );
    }
    console.warn(
      "[PromptQueue] _waitFlowEditorReady TIMEOUT after",
      timeoutMs,
      "ms",
    );
    return false;
  }
  async forceReloadAndStabilize(reason = "retry-recovery", opts = {}) {
    if (
      [
        "retry-recovery",
        "tier2-fallback",
        "stagnation-recovery",
        "consecutive-fail-recovery",
      ].includes(reason)
    ) {
      console.log(
        `[PromptQueue] forceReload disabled for generation recovery (reason=${reason})`,
      );
      return false;
    }
    const cookieJob = opts.flowCookieRecoveryJobId
      ? this._jobs.get(opts.flowCookieRecoveryJobId)
      : null;
    const cookieRecovery =
      reason === "user-flow-cookie-recovery" &&
      ((cookieJob?.state === "paused" &&
        cookieJob.pauseReason === "api_unusual_activity" &&
        cookieJob._flowCookieRecoveryInProgress === true) ||
        (opts.manualFlowCookieRecovery === true &&
          this._flowCookieRecoveryJobId === "manual"));
    if (
      reason === "user-flow-cookie-recovery" &&
      (!cookieRecovery || !this._flowCookieRecoveryQuiet())
    )
      return false;
    const currentRefSyncItem = this._editorExecutor?.currentItem;
    const recoveryHasDispatched = [
      ...(this._webRecovery?.records?.values?.() || []),
    ].some(
      (record) =>
        !record.terminal &&
        record.outputs?.some((output) =>
          ["dispatched", "retry_queued", "captcha_held"].includes(output.state),
        ),
    );
    const safePreDispatchRefSync =
      (opts.preDispatchRefSync === true ||
        opts.preDispatchReferenceAttachRecovery === true) &&
      currentRefSyncItem?.id === opts.expectedEditorItemId &&
      currentRefSyncItem?.flowApiAccepted !== true &&
      currentRefSyncItem?._apiDispatchStarted !== true &&
      currentRefSyncItem?._phaseR?.dispatched !== true &&
      [
        QueueItem.STATE.PENDING,
        QueueItem.STATE.RETRY_SUBMIT,
        QueueItem.STATE.SUBMITTING,
      ].includes(currentRefSyncItem?.state) &&
      this._webRecovery?.blocked !== true &&
      !recoveryHasDispatched &&
      window.FlowApiAdapter?.hasInFlight?.() !== true;
    if (this._webRecovery?.unsafeToReload && !safePreDispatchRefSync) {
      console.warn("[FlowRecovery] reload blocked by unsettled recovery", {
        requestedPreDispatchRefSync: opts.preDispatchRefSync === true,
        currentItemMatches:
          currentRefSyncItem?.id === opts.expectedEditorItemId,
        currentState: currentRefSyncItem?.state || null,
        apiAccepted: currentRefSyncItem?.flowApiAccepted === true,
        apiDispatchStarted: currentRefSyncItem?._apiDispatchStarted === true,
        recoveryDispatched: recoveryHasDispatched,
        recoveryBlocked: this._webRecovery?.blocked === true,
        apiInFlight: window.FlowApiAdapter?.hasInFlight?.() === true,
      });
      return false;
    }
    if (this._forceReloadPromise) {
      console.log(
        `[PromptQueue] forceReload \u0111ang trong progress, await... (${reason})`,
      );
      return await this._forceReloadPromise;
    }
    const activeMonitors = this._tileMonitor?.activeCount ?? 0;
    const editorBusy = !!this._editorExecutor?.currentItem;
    const editorDownloading = !!this._editorExecutor?.isDownloading;
    const queueLen = this._itemQueue?.length || 0;
    const dlLen = this._downloadQueue?.length || 0;
    const suppressed = this._reloadSuppressCount > 0;
    if (suppressed && !opts.bypassSuppress && !cookieRecovery) {
      console.log(
        `[PromptQueue] forceReload skipped (reloadSuppress active, reason=${reason})`,
      );
      return false;
    }
    const failThreshold =
      parseInt(this._readFarSetting("flowConsecutiveFailThreshold", 2), 10) ||
      2;
    const failurePressure = (this._consecutiveFailCount || 0) >= failThreshold;
    const isUserInitiated =
      typeof reason === "string" && reason.startsWith("user-");
    const isChunkCheckpoint = reason === "chunk-checkpoint";
    const generationInFlight =
      activeMonitors > 0 ||
      (window.FlowApiAdapter?.hasInFlight?.() === true && !cookieRecovery) ||
      recoveryHasDispatched ||
      (editorBusy && !safePreDispatchRefSync);
    if (generationInFlight && !isChunkCheckpoint) {
      console.log(
        `[PromptQueue] forceReload blocked while generation is active (reason=${reason})`,
      );
      return false;
    }
    if (
      !isUserInitiated &&
      activeMonitors > 0 &&
      this._tileMonitor?.hasOwnedInFlightOutput
    ) {
      console.log(
        `[PromptQueue] forceReload deferred (owned output still generating, reason=${reason})`,
      );
      return false;
    }
    if (
      !isUserInitiated &&
      failurePressure &&
      activeMonitors > 0 &&
      (await this._getPendingTileCount()) > 0
    ) {
      console.log(
        `[PromptQueue] forceReload deferred (Flow still has processing tiles, reason=${reason})`,
      );
      return false;
    }
    if (!isUserInitiated) {
      for (const [, job] of this._jobs) {
        if (job.state === "paused") {
          console.log(
            `[PromptQueue] forceReload skipped (job paused \u2014 ch\u1EDD user resume, reason=${reason})`,
          );
          return false;
        }
      }
    }
    if (!isUserInitiated && !opts.bypassSuppress) {
      const RELOAD_COOLDOWN_MS = 9e4;
      const sinceLast = this._lastAutoReloadAt
        ? Date.now() - this._lastAutoReloadAt
        : Infinity;
      if (sinceLast < RELOAD_COOLDOWN_MS) {
        console.log(
          `[PromptQueue] forceReload rate-limited (auto-recovery cooldown, reason=${reason}): ${Math.round(sinceLast / 1e3)}s/${RELOAD_COOLDOWN_MS / 1e3}s`,
        );
        return false;
      }
    }
    if (opts.bypassSuppress) {
      if (
        activeMonitors > 0 ||
        (editorBusy && !safePreDispatchRefSync) ||
        editorDownloading ||
        (queueLen > 0 && !safePreDispatchRefSync) ||
        dlLen > 0
      ) {
        console.log(
          `[PromptQueue] forceReload skipped (reason=${reason}: pipeline ch\u01B0a \u1EDF pre-dispatch an to\xE0n): activeMonitors=${activeMonitors}, editorBusy=${editorBusy}, editorDownloading=${editorDownloading}, queueLen=${queueLen}, dlLen=${dlLen}`,
        );
        return false;
      }
    } else if (isChunkCheckpoint) {
      console.warn(
        `[PromptQueue] forceReload PROCEED bypass busy gate (reason=${reason}): consecutiveFails=${this._consecutiveFailCount}/${failThreshold}, activeMonitors=${activeMonitors}, queueLen=${queueLen}, dlLen=${dlLen}`,
      );
    } else if (
      activeMonitors > 1 ||
      editorBusy ||
      editorDownloading ||
      (queueLen > 0 && !cookieRecovery) ||
      dlLen > 0
    ) {
      console.log(
        `[PromptQueue] forceReload skipped (pipeline busy, reason=${reason}): activeMonitors=${activeMonitors}, editorBusy=${editorBusy}, editorDownloading=${editorDownloading}, queueLen=${queueLen}, dlLen=${dlLen}`,
      );
      return false;
    }
    const activeOwners = [
      ...new Set(
        Array.from(this._jobs.values())
          .filter((job) => job?.isActive)
          .map((job) => job.owner)
          .filter(Boolean),
      ),
    ];
    const inferredScope =
      opts.scope ||
      (String(reason).startsWith("workflow-") ? "workflow" : null) ||
      (reason === "user-pre-submit" ? "prompts" : null) ||
      (reason === "user-pre-task-batch" ? "task" : null) ||
      (activeOwners.length === 1
        ? activeOwners[0]
        : activeOwners.length > 1
          ? "mixed"
          : "system");
    const reloadWorkflowId =
      opts.workflowId ||
      (inferredScope === "workflow"
        ? window.workflowExecutor?.currentWorkflow?.wf_id
        : null) ||
      null;
    this._queueControlAbortController ||
      (this._queueControlAbortController = new AbortController());
    const ipcTimeout = Number(
      window.SystemConfig?.safeGetTimeout?.("api_timeout_ms"),
    );
    if (!Number.isFinite(ipcTimeout) || ipcTimeout <= 0) return false;
    const reloadControl = {
      timeoutMs: ipcTimeout,
      stopEpoch: this._stopEpoch || 0,
      signal: window.workflowExecutor?._executionTask
        ? window.workflowExecutor._flowAdmissionAbortController?.signal ||
          this._queueControlAbortController.signal
        : this._queueControlAbortController.signal,
    };
    this._forceReloadPromise = (async () => {
      let reloadSyncTerminal = false;
      const reloadStartedAt = Date.now();
      let reloadUiWrite = Promise.resolve();
      const emitReloadSync = (stage, extra = {}) => {
        try {
          const reloadTerminal = ["complete", "failed"].includes(stage);
          window.__flowReloadSyncInProgress = !reloadTerminal;
          reloadUiWrite = reloadUiWrite
            .catch(() => {})
            .then(() =>
              chrome.storage.session.set({
                flowReloadUiState: {
                  active: !reloadTerminal,
                  stage,
                  startedAt: reloadStartedAt,
                  at: Date.now(),
                },
              }),
            )
            .catch(() => {});
          if (reloadTerminal) window.BridgeClient?.invalidate?.();
          window.eventBus?.emit?.("flow:reload_sync_state", {
            stage,
            reason,
            scope: inferredScope,
            workflowId: reloadWorkflowId,
            activeOwners,
            flushId: opts.flushId || null,
            at: Date.now(),
            ...extra,
          });
        } catch (_) {}
      };
      try {
        emitReloadSync("preparing");
        await this._awaitControlWork(reloadUiWrite, reloadControl);
        console.log(
          `[PromptQueue] Force reload Flow tab (reason: ${reason})...`,
        );
        if (this._editorExecutor?.currentItem && !safePreDispatchRefSync) {
          console.warn(
            "[PromptQueue] forceReload: editor \u0111ang gen \u2192 ch\u1EDD item xong (bounded 20s) tr\u01B0\u1EDBc reload",
          );
          const _editorIdleDeadline = Date.now() + 2e4;
          while (
            Date.now() < _editorIdleDeadline &&
            this._editorExecutor?.currentItem
          ) {
            await this._awaitControlWork(
              new Promise((r) => setTimeout(r, 300)),
              reloadControl,
            );
          }
        }
        if (
          this._downloadQueue.length > 0 ||
          this._editorExecutor?.isDownloading
        ) {
          console.warn(
            `[PromptQueue] forceReload: c\xF2n ${this._downloadQueue.length} download pending${this._editorExecutor?.isDownloading ? " + 1 \u0111ang ch\u1EA1y" : ""} \u2192 active-drain TR\u01AF\u1EDAC reload (c\u1EE9u file gen OK)`,
          );
          const _drainDeadline = Date.now() + 45e3;
          while (
            (this._downloadQueue.length > 0 ||
              this._editorExecutor?.isDownloading) &&
            Date.now() < _drainDeadline
          ) {
            if (!this._editorExecutor?.isDownloading) {
              const dl = this.dequeueNextDownload();
              if (dl) {
                try {
                  await this._editorExecutor._processDownload(dl);
                } catch (e) {
                  console.warn(
                    "[PromptQueue] forceReload drain download error:",
                    e.message,
                  );
                }
                continue;
              }
            }
            await this._awaitControlWork(
              new Promise((r) => setTimeout(r, 300)),
              reloadControl,
            );
          }
        }
        if (this._downloadQueue.length || this._editorExecutor?.isDownloading) {
          console.warn(
            "[PromptQueue] forceReload deferred: downloads have not reached a safe completed boundary",
          );
          return false;
        }
        if (
          ["api-results-refresh", "workflow-api-results-refresh"].includes(
            reason,
          ) &&
          !(await this._awaitControlWork(
            this._waitForDownloadQuietBoundary(),
            reloadControl,
          ))
        ) {
          console.warn(
            "[PromptQueue] API results refresh deferred: download pipeline is not quiet",
          );
          return false;
        }
        let previousDocumentEpoch = null;
        try {
          const beforeReload = await this._awaitControlWork(
            MessageBridge.sendToContentScript(
              "checkContentScriptAlive",
              cookieRecovery
                ? { expectedFlowTarget: opts.expectedFlowTarget }
                : {},
              { signal: reloadControl.signal },
            ),
            reloadControl,
          );
          previousDocumentEpoch = beforeReload?.documentEpoch || null;
        } catch (_) {}
        const reloadTarget = await this._awaitControlWork(
          MessageBridge.getTargetContext(),
          reloadControl,
        );
        if (
          cookieRecovery &&
          (reloadTarget?.tabId !== opts.expectedFlowTarget?.tabId ||
            reloadTarget?.projectId !== opts.expectedFlowTarget?.projectId ||
            (cookieJob && cookieJob.state !== "paused"))
        )
          return false;
        if (!Number.isInteger(reloadTarget?.tabId)) {
          console.warn(
            `[PromptQueue] forceReload skipped: controlled target unavailable (reason=${reason})`,
          );
          reloadSyncTerminal = true;
          emitReloadSync("failed", {
            errorCode: "FLOW_RELOAD_TARGET_UNAVAILABLE",
          });
          return false;
        }
        if (
          ["api-results-refresh", "workflow-api-results-refresh"].includes(
            reason,
          )
        ) {
          const trackerPersisted = await this._awaitControlWork(
            this._flushFlowTrackerBeforeReload(reloadTarget.tabId),
            reloadControl,
          );
          console.info("[PromptQueue] API terminal tracker snapshot flushed", {
            reason,
            persisted: trackerPersisted,
          });
        }
        const gridSettings = await this._awaitControlWork(
          chrome.storage.local.get(["af_settings"]),
          reloadControl,
        );
        const gridSetting =
          gridSettings?.af_settings?.flowApiAutoOpenTrackerGrid;
        const shouldAutoOpenApiGrid =
          ![false, 0, "0"].includes(gridSetting) &&
          !!previousDocumentEpoch &&
          ["api-results-refresh", "workflow-api-results-refresh"].includes(
            reason,
          ) &&
          Array.from(this._jobs.values()).some(
            (job) =>
              ["prompts", "mcp", "task", "workflow"].includes(job.owner) &&
              (job.items || []).some((item) => item.genMode === "api"),
          );
        const autoOpenJobIds = shouldAutoOpenApiGrid
          ? Array.from(this._jobs.values())
              .filter(
                (job) =>
                  ["prompts", "mcp", "task", "workflow"].includes(job.owner) &&
                  (job.items || []).some((item) => item.genMode === "api"),
              )
              .map((job) => job.id)
          : [];
        const autoOpenMarkerKey = "af_flow_api_auto_open_tracker_grid";
        if (shouldAutoOpenApiGrid) {
          try {
            await chrome.storage.local.set({
              [autoOpenMarkerKey]: {
                sessionId: this._trackerSessionId,
                projectId: reloadTarget?.projectId || null,
                jobIds: autoOpenJobIds,
                previousDocumentEpoch,
                createdAt: Date.now(),
                reason,
              },
            });
            console.info("[PromptQueue] API reload grid marker saved", {
              reason,
              jobs: autoOpenJobIds.length,
              hasProject: !!reloadTarget?.projectId,
            });
          } catch (e) {
            console.warn(
              "[PromptQueue] Cannot persist Flow API grid marker:",
              e?.message || e,
            );
          }
        }
        try {
          if (
            reason === "correlation-observer-reset" &&
            !this._correlationResetIdle()
          )
            return false;
          this._plannedFlowRecoveryReload = reloadTarget
            ? { tabId: reloadTarget.tabId }
            : null;
          emitReloadSync("reloading");
          const reloadRequest = {
            settledIdentityRefresh: opts.settledIdentityRefresh === true,
            expectedFlowTarget: opts.expectedFlowTarget || reloadTarget,
          };
          const pendingWaitMs =
            reason === "workflow-api-upload-ref-refresh"
              ? Math.max(
                  0,
                  Math.min(Number(opts.waitForPendingTilesMs) || 6e4, 12e4),
                )
              : 0;
          const pendingDeadline = Date.now() + pendingWaitMs;
          let pendingWaitLogged = false;
          if (!isUserInitiated) this._lastAutoReloadAt = Date.now();
          for (;;) {
            try {
              if (cookieRecovery) {
                await this._awaitControlWork(
                  Promise.all([...this._persistQueues.values()]),
                  reloadControl,
                );
                if (this._webRecovery)
                  await this._awaitControlWork(
                    this._webRecovery.persist(),
                    reloadControl,
                  );
                if (
                  (cookieJob && cookieJob.state !== "paused") ||
                  reloadControl.signal.aborted
                )
                  throw new Error("COOKIE_RECOVERY_ABORTED");
                if (!this._flowCookieRecoveryQuiet({ allowOwnReload: true }))
                  throw new Error("COOKIE_RECOVERY_GENERATION_ACTIVE");
                const recovered = await this._awaitControlWork(
                  window.BridgeClient.clearFlowCookiesAndReload({
                    tabId: reloadTarget.tabId,
                    projectId: reloadTarget.projectId,
                  }),
                  reloadControl,
                );
                if (!recovered?.ok || recovered.reloaded !== true)
                  throw new Error(recovered?.error || "COOKIE_RECOVERY_FAILED");
                console.info(
                  "[FlowCookieRecovery] reload dispatched",
                  JSON.stringify({
                    tabId: reloadTarget.tabId,
                    tabActivated: recovered.tabActivated === true,
                    previouslyActive: recovered.previouslyActive === true,
                    focusWindow: false,
                    removedCookies: Number.isInteger(recovered.removed)
                      ? recovered.removed
                      : null,
                    cacheCleared: recovered.cacheCleared === true,
                  }),
                );
              } else {
                await this._awaitControlWork(
                  MessageBridge.sendToContentScript(
                    "autoReloadFlow",
                    reloadRequest,
                    { signal: reloadControl.signal },
                  ),
                  reloadControl,
                );
              }
              break;
            } catch (error) {
              if (
                error?.code !== "V2_PENDING_TILES_ACTIVE" &&
                error?.message !== "V2_PENDING_TILES_ACTIVE"
              )
                throw error;
              if (!pendingWaitMs || Date.now() >= pendingDeadline) throw error;
              if (!pendingWaitLogged) {
                console.info(
                  "[PromptQueue] Flow has pending tiles; waiting before workflow API-ref reload",
                );
                emitReloadSync("waiting_pending");
                pendingWaitLogged = true;
              }
              do {
                await this._awaitControlWork(
                  new Promise((resolve) =>
                    setTimeout(
                      resolve,
                      Math.min(1500, pendingDeadline - Date.now()),
                    ),
                  ),
                  reloadControl,
                );
                if (Date.now() >= pendingDeadline) throw error;
                const pending = await this._awaitControlWork(
                  MessageBridge.sendToContentScript(
                    "getFlowReloadPendingCount",
                    {},
                    { signal: reloadControl.signal },
                  ),
                  reloadControl,
                );
                if (pending?.count === 0) break;
              } while (Date.now() < pendingDeadline);
            }
          }
        } catch (e) {
          if (shouldAutoOpenApiGrid) {
            try {
              await chrome.storage.local.remove(autoOpenMarkerKey);
            } catch (_) {}
          }
          if (cookieRecovery)
            opts.onCookieRecoveryFailure?.(
              e?.message || "COOKIE_RECOVERY_FAILED",
            );
          console.warn(
            "[PromptQueue] forceReload: send message failed:",
            e.message,
          );
          reloadSyncTerminal = true;
          emitReloadSync("failed", {
            errorCode: e?.code || e?.message || "RELOAD_MESSAGE_FAILED",
          });
          return false;
        }
        console.log("[PromptQueue] Waiting for page to start reloading...");
        await this._awaitControlWork(
          new Promise((r) => setTimeout(r, 1500)),
          reloadControl,
        );
        console.log("[PromptQueue] Polling for editor ready...");
        emitReloadSync("waiting_editor");
        const editorReady = await this._waitFlowEditorReady(
          3e4,
          previousDocumentEpoch,
          cookieRecovery ? reloadTarget : null,
        );
        if (!editorReady) {
          if (cookieRecovery)
            opts.onCookieRecoveryFailure?.("EDITOR_NOT_READY");
          console.warn(
            "[PromptQueue] forceReload: editor not ready after 30s, degrading",
          );
          reloadSyncTerminal = true;
          emitReloadSync("failed", { errorCode: "EDITOR_NOT_READY" });
          return false;
        }
        this._tileMonitor?.resetEphemeralClaims?.(reason);
        this._reloadPromptCounter = 0;
        this._consecutiveFailCount = 0;
        if (this._editorExecutor) {
          this._editorExecutor._lastSettings = null;
        }
        await new Promise((r) => setTimeout(r, 1e3));
        emitReloadSync("restoring");
        try {
          this._emitStateChanged();
        } catch (e) {}
        if (this._isRunning) {
          try {
            MessageBridge.sendToContentScript("pq:showBlocker", {
              blockerRunId: this._blockerRunId,
            }).catch(() => {});
          } catch (e) {}
        }
        let workflowReconciliation = null;
        if (typeof opts.onReconciliation === "function") {
          try {
            opts.onReconciliation(workflowReconciliation);
          } catch (_) {}
        }
        if (
          inferredScope === "workflow" &&
          opts.settledIdentityRefresh === true
        ) {
          console.log("[WorkflowVideoPersistence] reload settled", {
            flushId: opts.flushId || null,
            workflowId: String(reloadWorkflowId || "").slice(0, 12),
            durationMs: Date.now() - reloadStartedAt,
            editorReady: true,
          });
        }
        console.log(`[PromptQueue] Force reload complete (${reason})`);
        this._emitStateChanged();
        reloadSyncTerminal = true;
        emitReloadSync("complete", {
          reconciliationHandled: workflowReconciliation !== null,
          reconciliation: workflowReconciliation,
        });
        return true;
      } finally {
        if (!reloadSyncTerminal) {
          emitReloadSync("failed", { errorCode: "RELOAD_INTERRUPTED" });
        }
        this._plannedFlowRecoveryReload = null;
        this._forceReloadPromise = null;
      }
    })();
    return await this._forceReloadPromise;
  }
  _ensureRunning() {
    const hasPendingWork =
      this._itemQueue.length > 0 || this._downloadQueue.length > 0;
    if (!this._isRunning && hasPendingWork) {
      this._isRunning = true;
      this._startedAt = Date.now();
      this._readSettings();
      ExecutionLock.acquire("queue", "Pipeline Queue");
      if (window.MessageBridge) {
        const needsDomInteraction = this._needsDomZoom();
        if (needsDomInteraction) {
          MessageBridge.sendToContentScript("pq:showBlocker", {
            blockerRunId: this._blockerRunId,
          }).catch(() => {});
        } else {
          console.log(
            "[PromptQueue] To\xE0n b\u1ED9 items ch\u1EA1y Flow API \u2192 kh\xF4ng hi\u1EC7n ExecutionBlocker",
          );
        }
        if (needsDomInteraction) {
          MessageBridge.sendToContentScript("beginFlowZoomSession", {
            factor: 0.3,
          }).catch(() => {});
        } else {
          console.log(
            "[PromptQueue] To\xE0n b\u1ED9 items ch\u1EA1y Flow API \u2192 skip zoom session (kh\xF4ng c\u1EA7n DOM tile)",
          );
        }
      }
      this._editorExecutor.start();
      this._startStagnationWatchdog();
    } else if (
      this._isRunning &&
      !this._editorExecutor.isRunning &&
      this.hasItems()
    ) {
      this._editorExecutor.start();
    }
  }
  _needsDomZoom() {
    try {
      const ee = this._editorExecutor;
      if (!ee || typeof ee._isFlowApiMode !== "function") return true;
      const pending = this._itemQueue || [];
      if (pending.length === 0) return true;
      return pending.some((it) => !ee._isFlowApiMode(it));
    } catch (_) {
      return true;
    }
  }
  _startStagnationWatchdog() {
    if (this._stagnationWatchdog) return;
    const STAGNATION_THRESHOLD_MS = 6e4;
    const POLL_INTERVAL_MS = 15e3;
    this._stagnationWatchdog = setInterval(async () => {
      if (!this._isRunning) {
        this._stopStagnationWatchdog();
        return;
      }
      this._emitStateChanged();
      let hasPaused = false;
      for (const [, job] of this._jobs) {
        if (job.state === "paused") {
          hasPaused = true;
          break;
        }
      }
      if (hasPaused) return;
      if (!this._tileMonitor?.isStagnant?.(STAGNATION_THRESHOLD_MS)) return;
      const recoveryEnabled =
        this._readFarSetting("flowAutoRecoveryEnabled", true) !== false;
      if (!recoveryEnabled) return;
      if (this._tileMonitor?.hasOwnedInFlightOutput) {
        this._tileMonitor._lastClaimAt = Date.now();
        console.log(
          "[PromptQueue] Stagnation: output \u0111\xE3 c\xF3 processing owner \u2192 SKIP reload/zoom, heartbeat _lastClaimAt",
        );
        return;
      }
      try {
        const r = await window.MessageBridge?.sendToContentScript?.(
          "getPendingTileCount",
          {},
        );
        const pending = r?.count ?? -1;
        if (pending > 0) {
          if (this._tileMonitor) this._tileMonitor._lastClaimAt = Date.now();
          console.log(
            `[PromptQueue] Stagnation: Flow \u0110ANG gen (pending=${pending}) \u2192 SKIP reload, heartbeat _lastClaimAt`,
          );
          return;
        }
      } catch (_) {}
      if (this._tileMonitor) this._tileMonitor._lastClaimAt = Date.now();
      console.warn(
        "[PromptQueue] Stagnation detected \u2014 reload disabled during generation; monitor will resolve/retry",
      );
    }, POLL_INTERVAL_MS);
  }
  _stopStagnationWatchdog() {
    if (this._stagnationWatchdog) {
      clearInterval(this._stagnationWatchdog);
      this._stagnationWatchdog = null;
    }
  }
  _persistTaskResult(item) {
    if (!item._taskId || !window.storageManager) return Promise.resolve();
    const taskId = item._taskId;
    const prev = this._persistQueues.get(taskId) || Promise.resolve();
    const next = prev.then(() => this._doPersistTaskResult(item));
    this._persistQueues.set(
      taskId,
      next.catch(() => {}),
    );
    return next;
  }
  async _doPersistTaskResult(item) {
    if (!item._taskId || !window.storageManager) return;
    const tileIds = item.resultTileIds || [];
    if (tileIds.length === 0) return;
    const thumbs = {};
    const fileNames = {};
    const providerUrls = {};
    for (const tid of tileIds) {
      const info = item.resultThumbnails?.[tid];
      if (info?.thumbnail) {
        thumbs[tid] =
          info && typeof info === "object"
            ? {
                thumbnail: info.thumbnail,
                ...(info.source_thumbnail && {
                  source_thumbnail: info.source_thumbnail,
                }),
                type:
                  info.type === "video" || info.video_url
                    ? "video"
                    : info.type || "image",
                file_name: info.file_name || "",
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
                ...(info.api_driver && { api_driver: info.api_driver }),
                ...(info.protocol_revision && {
                  protocol_revision: info.protocol_revision,
                }),
                ...(info.protocol_fingerprint && {
                  protocol_fingerprint: info.protocol_fingerprint,
                }),
                ...(info.operation_uuid && {
                  operation_uuid: info.operation_uuid,
                }),
                ...(Array.isArray(info.identity_aliases) &&
                  info.identity_aliases.length > 0 && {
                    identity_aliases: [
                      ...new Set(info.identity_aliases.filter(Boolean)),
                    ],
                  }),
                ...(info.display_name && { display_name: info.display_name }),
                ...(info.thumb_is_poster === true && { thumb_is_poster: true }),
              }
            : info.thumbnail;
      }
      if (info?.file_name) fileNames[tid] = info.file_name;
      const providerData =
        item.resultProviderUrls?.[tid] ||
        (item.resultFileNames?.[tid]
          ? item.resultProviderUrls?.[item.resultFileNames[tid]]
          : null);
      if (providerData?.provider === "flow") {
        providerUrls[tid] = { ...providerData };
        const persistentId =
          item.resultFileNames?.[tid] || info?.file_name || null;
        if (persistentId) providerUrls[persistentId] = { ...providerData };
        if (!thumbs[tid]) {
          const apiPreview =
            providerData.durable_url || providerData.url || null;
          if (
            typeof apiPreview === "string" &&
            /^https?:\/\//.test(apiPreview)
          ) {
            thumbs[tid] = {
              thumbnail: apiPreview,
              ...(providerData.media_type === "video" && {
                video_url: apiPreview,
              }),
              type: providerData.media_type === "video" ? "video" : "image",
              file_name: persistentId || tid,
              ...(providerData.media_uuid && {
                media_uuid: providerData.media_uuid,
              }),
              ...(providerData.persistent_media_id && {
                persistent_media_id: providerData.persistent_media_id,
              }),
              ...(providerData.identity_kind && {
                identity_kind: providerData.identity_kind,
              }),
              ...(providerData.identity_durability && {
                identity_durability: providerData.identity_durability,
              }),
              ...(providerData.api_driver && {
                api_driver: providerData.api_driver,
              }),
              ...(providerData.protocol_revision && {
                protocol_revision: providerData.protocol_revision,
              }),
              ...(providerData.protocol_fingerprint && {
                protocol_fingerprint: providerData.protocol_fingerprint,
              }),
              ...(providerData.operation_uuid && {
                operation_uuid: providerData.operation_uuid,
              }),
            };
          }
        }
      }
    }
    const missingTiles = tileIds.filter((id) => !thumbs[id]);
    if (missingTiles.length > 0 && window.MessageBridge) {
      try {
        const scanResult = await MessageBridge.getThumbnailsByIds(
          missingTiles,
          { deep: false },
        );
        const results = scanResult?.results || {};
        for (const tid of missingTiles) {
          if (results[tid]?.thumbnail) {
            const recovered = results[tid];
            thumbs[tid] =
              recovered && typeof recovered === "object"
                ? {
                    thumbnail: recovered.thumbnail,
                    ...(recovered.source_thumbnail && {
                      source_thumbnail: recovered.source_thumbnail,
                    }),
                    type:
                      recovered.type === "video" || recovered.video_url
                        ? "video"
                        : recovered.type || "image",
                    ...(recovered.video_url && {
                      video_url: recovered.video_url,
                    }),
                    ...(recovered.media_uuid && {
                      media_uuid: recovered.media_uuid,
                    }),
                    ...(recovered.persistent_media_id && {
                      persistent_media_id: recovered.persistent_media_id,
                    }),
                    ...(recovered.identity_kind && {
                      identity_kind: recovered.identity_kind,
                    }),
                    ...(recovered.identity_durability && {
                      identity_durability: recovered.identity_durability,
                    }),
                    ...(Array.isArray(recovered.identity_aliases) &&
                      recovered.identity_aliases.length > 0 && {
                        identity_aliases: [
                          ...new Set(
                            recovered.identity_aliases.filter(Boolean),
                          ),
                        ],
                      }),
                    ...(recovered.thumb_is_poster === true && {
                      thumb_is_poster: true,
                    }),
                    file_name: recovered.file_name || "",
                  }
                : recovered.thumbnail;
          }
          if (results[tid]?.file_name) fileNames[tid] = results[tid].file_name;
        }
      } catch (e) {
        console.warn("[PromptQueue] Scan thumbnails failed:", e.message);
      }
    }
    try {
      const freshTask = await window.storageManager.getTask(item._taskId);
      if (!freshTask) return;
      const existingIds = (freshTask.result_file_ids || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const newIds = tileIds.filter((id) => !existingIds.includes(id));
      if (newIds.length > 0) {
        freshTask.result_file_ids = [...existingIds, ...newIds].join(",");
      }
      if (Object.keys(thumbs).length > 0) {
        freshTask.result_thumbnails = {
          ...(freshTask.result_thumbnails || {}),
          ...thumbs,
        };
      }
      if (Object.keys(fileNames).length > 0) {
        freshTask.result_file_names = {
          ...(freshTask.result_file_names || {}),
          ...fileNames,
        };
      }
      if (Object.keys(providerUrls).length > 0) {
        freshTask.result_provider_urls = {
          ...(freshTask.result_provider_urls || {}),
          ...providerUrls,
        };
      }
      const job = this._jobs.get(item.jobId);
      const taskItems = job
        ? job.items.filter((i) => i._taskId === item._taskId)
        : [];
      const allTaskItemsDone =
        taskItems.length > 0 && taskItems.every((i) => i.isTerminal);
      if (allTaskItemsDone) {
        freshTask.status = "completed";
      }
      await window.storageManager.saveTask(freshTask);
      console.log(
        `[PromptQueue] Persisted ${tileIds.length} result tiles for task ${item._taskId}`,
      );
      if (allTaskItemsDone && window.eventBus) {
        const historyResults = this._historyTaskResults(taskItems);
        window.eventBus.emit("task:status_changed", {
          taskId: item._taskId,
          task_id: item._taskId,
          status: "completed",
          prompt: freshTask.prompt || "",
          media_type: freshTask.media_type || "image",
          model: freshTask.model || item.settings?.model || "",
          ratio: freshTask.ratio || "",
          ref_file_ids:
            this._historyRefFileIds(taskItems).join(", ") ||
            freshTask.ref_file_ids ||
            "",
          ref_thumbnails: freshTask.ref_thumbnails || {},
          prompt_count:
            freshTask.multi_prompt && freshTask.prompts?.length
              ? freshTask.prompts.length
              : 1,
          quantity: freshTask.quantity || 1,
          result_thumbnails: historyResults.thumbnails,
          result_file_ids: historyResults.ids.join(", "),
          result_file_names: historyResults.fileNames,
          result_provider_urls: historyResults.providerUrls,
          flow_api_versions: this._historyApiVersions(taskItems),
          historyRoute: this._historyRoute(taskItems),
          error_details: this._historyErrorDetails(taskItems),
          duration_ms: this._historyDurationMs(taskItems),
          error_reason: taskItems.some((item2) => item2.error)
            ? [
                ...new Set(
                  taskItems.map((item2) => item2.error).filter(Boolean),
                ),
              ]
                .join(" \xB7 ")
                .slice(0, 1e3)
            : null,
          project_id: freshTask.project_id || window._currentProjectId || null,
          auto_download: !!freshTask.auto_download,
        });
      }
    } catch (e) {
      console.warn("[PromptQueue] Save task result failed:", e.message);
    }
  }
  _readSettings() {
    const queueConfig = window.ExecutionConfig?.safeGetQueueConfig() || {};
    const wfConfig = window.ExecutionConfig?.safeGetWorkflowConfig() || {};
    const batchSize = queueConfig.batch_size ?? 4;
    const maxMonitor = queueConfig.max_monitor ?? 4;
    const restMin = queueConfig.rest_min_sec ?? 5;
    const restMax = queueConfig.rest_max_sec ?? 15;
    const execTimeout = wfConfig.timeout_sec ?? 180;
    let maxRetries = wfConfig.max_retries ?? 2;
    const canUseRetry = window.featureGate?.canUseRetryOnFail?.() ?? true;
    if (!canUseRetry) {
      maxRetries = 0;
    }
    this._webRetryMaxRetries = Math.max(0, Number(maxRetries) || 0);
    this._editorExecutor.updateSettings({ batchSize, restMin, restMax });
    this._tileMonitor.updateSettings({
      maxMonitor,
      timeout: execTimeout,
      maxRetries,
    });
  }
  _readAutoDownload() {
    return !!(
      document.getElementById("genTabAutoDownload")?.checked ||
      document.getElementById("autoDownloadToggle")?.checked
    );
  }
  _sortQueue() {
    this._itemQueue.sort((a, b) => {
      const aWebRetryTail = Number.isInteger(a._webRetryBatchTailOrder);
      const bWebRetryTail = Number.isInteger(b._webRetryBatchTailOrder);
      if (aWebRetryTail !== bWebRetryTail) return aWebRetryTail ? 1 : -1;
      if (
        aWebRetryTail &&
        a._webRetryBatchTailOrder !== b._webRetryBatchTailOrder
      ) {
        return a._webRetryBatchTailOrder - b._webRetryBatchTailOrder;
      }
      if (b.priority !== a.priority) return b.priority - a.priority;
      const aDeferred = Number.isInteger(a._apiDeferredQueueOrder);
      const bDeferred = Number.isInteger(b._apiDeferredQueueOrder);
      if (aDeferred !== bDeferred) return aDeferred ? 1 : -1;
      if (
        aDeferred &&
        bDeferred &&
        a._apiDeferredQueueOrder !== b._apiDeferredQueueOrder
      ) {
        return a._apiDeferredQueueOrder - b._apiDeferredQueueOrder;
      }
      return a.createdAt - b.createdAt;
    });
  }
  _taskRefIdentity(task, refId) {
    const media = task?.ref_thumbnails?.[refId];
    const persistentId =
      (media && typeof media === "object"
        ? media.media_uuid || media.file_name
        : null) ||
      task?.ref_file_names?.[refId] ||
      refId;
    const value = String(persistentId || refId || "").trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
      ? value.toLowerCase()
      : value;
  }
  _uniqueTaskRefIds(task, rawIds) {
    const result = [];
    const seen = new Set();
    for (const rawValue of Array.isArray(rawIds) ? rawIds : []) {
      const refId = String(rawValue || "").trim();
      if (!refId) continue;
      const identity = this._taskRefIdentity(task, refId);
      if (seen.has(identity)) continue;
      seen.add(identity);
      result.push(refId);
    }
    return result;
  }
  _taskRefAliasMap(task, retainedIds, rawIds) {
    const representativeByIdentity = new Map(
      (retainedIds || []).map((refId) => [
        this._taskRefIdentity(task, refId),
        refId,
      ]),
    );
    const aliases = new Map();
    for (const rawValue of Array.isArray(rawIds) ? rawIds : []) {
      const refId = String(rawValue || "").trim();
      if (!refId || aliases.has(refId)) continue;
      const representative = representativeByIdentity.get(
        this._taskRefIdentity(task, refId),
      );
      if (representative) aliases.set(refId, representative);
    }
    return aliases;
  }
  _resolveRefForIndex(
    refFileIds,
    refFileIdsPerPrompt,
    refImageMode,
    index,
    perPrompt = 1,
  ) {
    const uniqueRefs = (ids) => [
      ...new Set((Array.isArray(ids) ? ids : []).filter(Boolean)),
    ];
    if (refImageMode === "none") return [];
    if (refImageMode === "sequential") {
      return Array.isArray(refFileIdsPerPrompt)
        ? uniqueRefs(refFileIdsPerPrompt[index])
        : window.RefImageAssignment.select(refFileIds, index, perPrompt);
    }
    if (refImageMode === "mention") {
      if (Array.isArray(refFileIdsPerPrompt))
        return uniqueRefs(refFileIdsPerPrompt[index]);
      return uniqueRefs(refFileIds);
    }
    return uniqueRefs(refFileIds);
  }
  _readFarSetting(key, fallback) {
    const farConfig =
      window.ExecutionConfig?.safeGetFlowRecoveryConfig?.() || {};
    const keyMap = {
      flowAutoRecoveryEnabled: farConfig.auto_recovery_enabled,
      flowConsecutiveFailThreshold: farConfig.consecutive_fail_threshold,
      flowSessionRefreshEnabled: farConfig.session_refresh_enabled,
      flowSessionRefreshIntervalMin: farConfig.session_refresh_interval_min,
      flowBackoffBaseSec: farConfig.backoff_base_sec,
      flowBackoffMaxSec: farConfig.backoff_max_sec,
      flowBackoffJitterPercent: farConfig.backoff_jitter_percent,
    };
    if (keyMap[key] !== void 0) return keyMap[key];
    return fallback;
  }
  async _getPendingTileCount() {
    const now = Date.now();
    if (
      this._pendingTileCountCache &&
      now - this._pendingTileCountCache.at < 1e3
    ) {
      return this._pendingTileCountCache.count;
    }
    try {
      const resp = await MessageBridge.sendToContentScript(
        "getPendingTileCount",
      );
      const count = parseInt(resp?.count, 10);
      const safeCount = Number.isFinite(count) ? count : 0;
      this._pendingTileCountCache = { count: safeCount, at: now };
      return safeCount;
    } catch (e) {
      return 0;
    }
  }
  _shouldWaitForPendingDrain(item) {
    return !!item && !this._tileMonitor.hasCapacityFor(item);
  }
  _emitStateChanged() {
    const now = Date.now();
    if (now - this._lastEmitTime < 500) {
      if (!this._emitScheduled) {
        this._emitScheduled = true;
        setTimeout(
          () => {
            this._emitScheduled = false;
            this._lastEmitTime = Date.now();
            this._doEmit();
          },
          500 - (now - this._lastEmitTime),
        );
      }
      return;
    }
    this._lastEmitTime = now;
    this._doEmit();
  }
  _doEmit() {
    if (!window.eventBus) return;
    const snapshot = this._buildSnapshot();
    if (
      this._isRunning &&
      snapshot.jobs.length > 0 &&
      snapshot.jobs.every(
        (job) =>
          job.items.length > 0 &&
          job.items.every((item) =>
            [
              "COMPLETED",
              "PARTIAL_FAIL",
              "FAILED",
              "CANCELLED",
              "BLOCKED",
            ].includes(item.state),
          ),
      )
    ) {
      try {
        const wait = {
          activeJobs: Array.from(this._jobs.values()).filter(
            (job) => job.isActive,
          ).length,
          submitQueue: this._itemQueue.length,
          downloadQueue: this._downloadQueue.length,
          downloading: !!this._currentDownloadItem,
          tileMonitors: this._tileMonitor.activeCount,
          apiInFlight: window.FlowApiAdapter?.hasInFlight?.() === true,
          admissionPending: this._phaseRWorkflowAdmitting?.size || 0,
          jobAdmissionPending: Array.from(this._jobs.values()).filter(
            (job) => job._admissionPending,
          ).length,
          editorState: snapshot.pipeline?.editor?.state || null,
          editorHasCurrentItem: !!this._editorExecutor.currentItem,
          webRecoveryUnfinished: this._webRecovery?.unfinished === true,
        };
        window.FlowApiTelemetry?.emit?.("terminal_pipeline_wait", wait, {
          dedupeKey: `terminal_pipeline_wait:${this._blockerRunId}:${JSON.stringify(wait)}`,
        });
      } catch (_) {}
    }
    window.eventBus.emit("queue:state_changed", snapshot);
    for (const job of this._jobs.values()) this._offerFlowCookieRecovery(job);
    this._throttledBroadcast(snapshot);
  }
  _itemThumb(item) {
    try {
      const cands = [];
      const t = item.resultThumbnails || {};
      for (const k of Object.keys(t)) {
        const e = t[k];
        const u = e && typeof e === "object" ? e.thumbnail : e;
        const vurl =
          e &&
          typeof e === "object" &&
          typeof e.video_url === "string" &&
          /^https?:\/\//.test(e.video_url)
            ? e.video_url
            : null;
        const sourceThumbnail =
          e &&
          typeof e === "object" &&
          typeof e.source_thumbnail === "string" &&
          /^https?:\/\//.test(e.source_thumbnail)
            ? e.source_thumbnail
            : null;
        const displayUrl =
          typeof u === "string" && /^https?:\/\//.test(u) ? u : vurl;
        if (displayUrl) {
          const isVid = !!(
            e &&
            typeof e === "object" &&
            (e.type === "video" || vurl)
          );
          const isPoster = isVid && e.thumb_is_poster === true;
          cands.push({
            url: displayUrl,
            video: isVid,
            poster: isPoster,
            playUrl: (isVid && vurl) || null,
            sourceThumbnail,
          });
        }
      }
      const pu = item.resultProviderUrls || {};
      for (const k of Object.keys(pu)) {
        const isVid = pu[k]?.media_type === "video";
        const d = pu[k]?.durable_url;
        const u2 = pu[k]?.url;
        if (typeof d === "string" && /^https?:\/\//.test(d))
          cands.push({ url: d, video: isVid });
        if (typeof u2 === "string" && /^https?:\/\//.test(u2))
          cands.push({ url: u2, video: isVid });
      }
      if (cands.length) {
        return (
          cands.find(
            (c) =>
              c.video &&
              c.playUrl &&
              !c.playUrl.startsWith("https://flow.google.com/asb/"),
          ) ||
          cands.find((c) => c.url.startsWith("https://flow.google.com/asb/")) ||
          cands.find(
            (c) => !c.video && !c.url.startsWith("https://labs.google/"),
          ) ||
          cands.find((c) => c.url.startsWith("https://labs.google/")) ||
          cands[0]
        );
      }
    } catch (_) {}
    return null;
  }
  _itemResults(item) {
    try {
      const out = [];
      const t = item.resultThumbnails || {};
      const pu = item.resultProviderUrls || {};
      const tids = new Set([...Object.keys(t), ...Object.keys(pu)]);
      for (const tid of tids) {
        const e = t[tid];
        const p = pu[tid];
        const thumbUrl = e && typeof e === "object" ? e.thumbnail : e;
        const videoUrl =
          e &&
          typeof e === "object" &&
          typeof e.video_url === "string" &&
          /^https?:\/\//.test(e.video_url)
            ? e.video_url
            : null;
        const sourceThumbnail =
          e &&
          typeof e === "object" &&
          typeof e.source_thumbnail === "string" &&
          /^https?:\/\//.test(e.source_thumbnail)
            ? e.source_thumbnail
            : null;
        const durable = p && p.durable_url;
        const provUrl = p && p.url;
        const url =
          typeof durable === "string" && /^https?:\/\//.test(durable)
            ? durable
            : typeof thumbUrl === "string" && /^https?:\/\//.test(thumbUrl)
              ? thumbUrl
              : typeof provUrl === "string" && /^https?:\/\//.test(provUrl)
                ? provUrl
                : videoUrl;
        if (!url) continue;
        const video = !!(
          (e && typeof e === "object" && (e.type === "video" || e.video_url)) ||
          (p && p.media_type === "video")
        );
        const output = Array.isArray(item.outputs)
          ? item.outputs.find((entry) => entry?.resultId === tid)
          : null;
        const persistedTileAsb = video
          ? [item.resultFileNames?.[tid], output?.mediaId].find((value) =>
              /^[A-Za-z0-9_-]{32,1024}$/.test(String(value || "")),
            )
          : null;
        const persistentMediaId = video
          ? persistedTileAsb ||
            (e && typeof e === "object" ? e.persistent_media_id : null) ||
            output?.mediaId ||
            null
          : null;
        const flowV2Uuid =
          e &&
          typeof e === "object" &&
          (e.driver_key === "flow_v2" ||
            e.identity_kind === "flow-content-uuid") &&
          /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(tid || ""))
            ? tid
            : null;
        const mediaUuid =
          (e && typeof e === "object" ? e.media_uuid : null) ||
          output?.mediaUuid ||
          p?.media_uuid ||
          flowV2Uuid ||
          null;
        const imageUuid =
          !video &&
          /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(mediaUuid || tid || ""))
            ? mediaUuid || tid
            : null;
        const fileName =
          persistentMediaId ||
          imageUuid ||
          (e && typeof e === "object" ? e.file_name : null) ||
          null;
        const usedThumb = typeof thumbUrl === "string" && url === thumbUrl;
        const poster = !!(
          video &&
          usedThumb &&
          e &&
          typeof e === "object" &&
          e.thumb_is_poster === true
        );
        const vurl = videoUrl;
        out.push({
          url,
          downloadUrl:
            typeof durable === "string" && /^https?:\/\//.test(durable)
              ? durable
              : null,
          apiProvider: p?.provider === "flow",
          apiDriver:
            p?.api_driver || e?.api_driver || output?.apiDriver || null,
          identityKind:
            p?.identity_kind ||
            e?.identity_kind ||
            output?.identityKind ||
            null,
          operationId:
            p?.operation_uuid ||
            e?.operation_uuid ||
            output?.operationId ||
            null,
          protocolRevision:
            p?.protocol_revision ||
            e?.protocol_revision ||
            output?.protocolRevision ||
            null,
          protocolFingerprint:
            p?.protocol_fingerprint ||
            e?.protocol_fingerprint ||
            output?.protocolFingerprint ||
            null,
          projectId: p?.project_id || e?.project_id || item.projectId || null,
          thumbnail:
            typeof thumbUrl === "string" && /^https?:\/\//.test(thumbUrl)
              ? thumbUrl
              : null,
          video,
          poster,
          playUrl: (video && vurl) || null,
          plannedFilename:
            e?.phaseRDownloadName ||
            item._phaseRRecord?.outputs.find(
              (output2) => output2.mediaId === tid,
            )?.filename ||
            null,
          sourceThumbnail,
          fileName,
          mediaId: persistentMediaId,
          mediaUuid,
          tileId: tid,
        });
      }
      return out;
    } catch (_) {
      return [];
    }
  }
  _itemDlState(item) {
    try {
      const tids = item.resultTileIds || [];
      if (!tids.length) return null;
      const cur = this._currentDownloadItem;
      if (cur && tids.includes(cur.tileId))
        return { state: "downloading", res: cur.resolution || null };
      const q = this._downloadQueue.find((d) => tids.includes(d.tileId));
      if (q) return { state: "queued", res: q.resolution || null };
      const outputs = (item.outputs || []).filter(
        (output) =>
          tids.includes(output.resultId) || tids.includes(output.mediaId),
      );
      const completed = tids.filter((id) =>
        this._downloadedTileIds.has(id),
      ).length;
      const failedDownloads = outputs.filter(
        (output) => output.downloadStatus === "failed",
      );
      if (failedDownloads.length) {
        const error =
          failedDownloads
            .map((output) => output.downloadError)
            .filter((error2) => typeof error2 === "string" && error2)
            .join(" \xB7 ") || null;
        return {
          state: "failed",
          res: null,
          completed,
          total: tids.length,
          failed: failedDownloads.length,
          error,
          errorDisplay: error
            ? window.FlowApiAdapter?.formatError?.(error) || error
            : null,
        };
      }
      const autoDl =
        item._autoDownload ??
        this._jobs.get(item.jobId)?._autoDownload ??
        false;
      if (autoDl && tids.every((t) => this._downloadedTileIds.has(t)))
        return { state: "done", res: null };
      if (autoDl && tids.some((t) => this._downloadedTileIds.has(t)))
        return { state: "partial", res: null, completed, total: tids.length };
    } catch (_) {}
    return null;
  }
  _safeOutputLedger(item) {
    return (Array.isArray(item?.outputs) ? item.outputs : []).map((output) => ({
      outputIndex: Number.isFinite(Number(output?.outputIndex))
        ? Number(output.outputIndex)
        : null,
      status: typeof output?.status === "string" ? output.status : null,
      downloadStatus:
        typeof output?.downloadStatus === "string"
          ? output.downloadStatus
          : null,
      identityKind:
        typeof output?.identityKind === "string" ? output.identityKind : null,
      correlationConfidence:
        typeof output?.correlationConfidence === "string"
          ? output.correlationConfidence
          : null,
      hasMediaIdentity: !!(output?.mediaId || output?.resultId),
      completedAt: Number(output?.completedAt) || null,
      downloadedAt: Number(output?.downloadedAt) || null,
      hasError: !!(output?.error || output?.downloadError),
    }));
  }
  _itemStatusPresentation(job, item, state, error, retryError) {
    const t = (key, params) => {
      const value = window.I18n?.t?.(key, params);
      return value && value !== key ? value : null;
    };
    let kind = null,
      label = null,
      reason = null,
      hint = null;
    const recoveryLabel =
      item.recoveryLabel || this._webRecovery?.label?.(item) || null;
    const terminal = [
      "COMPLETED",
      "FAILED",
      "PARTIAL_FAIL",
      "CANCELLED",
      "BLOCKED",
    ].includes(state);
    const record = item._phaseRRecord;
    const recoveryBlocked = record?.recoveryRequired;
    const unverifiedWeb = recoveryBlocked
      ? this._webRecovery?._isAmbiguousRecovery?.(recoveryBlocked) === true
      : record?.terminal &&
        ["FAILED", "PARTIAL_FAIL"].includes(state) &&
        record.attempts?.some((attempt) => attempt.state === "unverified") &&
        record.outputs?.some((output) => output.state === "failed");
    const acceptedPollExpired =
      item.errorPolicy?.stage === "accepted_poll" &&
      item.errorPolicy?.code === "V2_OPERATION_TIMEOUT" &&
      ["FAILED", "PARTIAL_FAIL"].includes(state);
    if (
      state === "RECOVERY_REQUIRED" ||
      unverifiedWeb ||
      acceptedPollExpired ||
      (item.errorPolicy?.stage === "ambiguous" && state === "FAILED")
    ) {
      kind = "unverified";
      label = t("flowStatus.unverified") || t("flowRecovery.unverified");
      reason = error;
      hint =
        terminal || job._apiRecoveryCallerReleased
          ? t("flowStatus.checkFlowHint")
          : t("flowRecovery.unverifiedHint");
    } else if (recoveryBlocked && !terminal) {
      kind = "recovery";
      label = recoveryLabel || t("flowRecovery.configBlocked");
      reason = error || retryError;
      hint = t("flowRecovery.configHint");
    } else if (
      !terminal &&
      (state === "WAITING_PROVIDER" ||
        (item._apiWaitingSlot && job.state === "paused"))
    ) {
      const webRetryQueued =
        !record?.captchaHeld &&
        job.state !== "paused" &&
        record?.outputs?.some((output) => output.state === "retry_queued");
      kind = webRetryQueued ? "retry_queued" : "paused";
      label =
        recoveryLabel ||
        (webRetryQueued
          ? t("flowStatus.retryQueued")
          : t("flowStatus.paused") || t("exec.paused"));
      reason =
        item._apiWaitingSlot || webRetryQueued
          ? retryError || error
          : error || retryError;
      if (job.pauseReason === "provider_auth")
        hint = t("gen.flowApiAuthRecovering");
      else if (
        !webRetryQueued &&
        (record?.captchaHeld ||
          item._apiManualResumePending ||
          ["manual", "captcha", "api_unusual_activity"].includes(
            job.pauseReason,
          ))
      )
        hint = t("flowStatus.resumeHint");
    } else if (
      !terminal &&
      (state === "RETRY_SUBMIT" || (item._apiWaitingSlot && retryError))
    ) {
      kind = "retry_queued";
      label = t("flowStatus.retryQueued") || t("flowRecovery.queued");
      reason = retryError || error;
    } else if (!terminal && recoveryLabel) {
      kind = "recovery";
      label = recoveryLabel;
      reason = error || retryError;
    } else if (
      !terminal &&
      retryError &&
      Number(item.retrySubmitCount) > 0 &&
      ["SUBMITTING", "SUBMITTED", "MONITORING"].includes(state)
    ) {
      kind = "retrying";
      label = t("flowStatus.retrying") || t("exec.retrying");
      reason =
        t("flowStatus.previousReason", { reason: retryError }) || retryError;
    } else if (state === "BLOCKED") {
      kind = "blocked";
      label = t("flowStatus.blocked");
      reason = error;
    } else if (["FAILED", "PARTIAL_FAIL"].includes(state)) {
      kind = "failed";
      reason = error;
    }
    if (
      ["paused", "failed", "blocked"].includes(kind) &&
      (this._isApiUnusualActivity(item) || record?.captchaHeld === true)
    ) {
      hint = [hint, t("flowStatus.botCookieHint")].filter(Boolean).join(" ");
    }
    return {
      statusKind: kind,
      statusLabel: label,
      statusReason: reason,
      statusHint: hint,
    };
  }
  _buildSnapshot() {
    const snapshot = {
      schemaVersion: 1,
      sessionId: this._trackerSessionId,
      projectId: window._currentProjectId || window._flowProjectId || null,
      jobs: Array.from(this._jobs.values())
        .map((job) => ({
          id: job.id,
          sessionId: job._trackerSessionId || this._trackerSessionId,
          owner: job.owner,
          singleNodeSession: job.singleNodeSession === true,
          label: job.label,
          workflowId: job.workflowId || null,
          workflowNodeId: job.workflowNodeId || null,
          workflowRunId: job.workflowRunId || null,
          status: job._apiRecoveryCallerReleased ? "stopped" : job.state,
          manualRegenItemId: job._manualRegenInFlight || null,
          manualRegenBatchPending: job._manualRegenBatchPending || 0,
          manualRegenQueuedIds: (job._manualRegenRequests || []).map(
            (entry) => entry.rootId,
          ),
          pauseReason: job.pauseReason || null,
          ...this._webRecovery?.jobStatus?.(job),
          ...(job.recoveryRequired
            ? {
                recoveryRequired: job.recoveryRequired,
                recoveryLabel: job.recoveryLabel,
                recoveryHint: job.recoveryHint,
              }
            : {}),
          modeType: this._jobExecutionMode(job),
          modeReason: job._flowApiRouteReason || job._flowApiWebReason || null,
          effectiveRunMode: job.sequentialMode ? "sequential" : "parallel",
          forcedV2WebSequential: job.forcedV2WebSequential === true,
          startedAt: job.createdAt,
          completedAt: job.completedAt || null,
          completedCount: job.items.filter(
            (item) =>
              !item._trackerRemoved && item.state === QueueItem.STATE.COMPLETED,
          ).length,
          failedCount: job.items.filter(
            (item) =>
              !item._trackerRemoved &&
              [
                QueueItem.STATE.FAILED,
                QueueItem.STATE.PARTIAL_FAIL,
                QueueItem.STATE.BLOCKED,
              ].includes(item.state),
          ).length,
          totalExpected: job.items.filter((item) => !item._trackerRemoved)
            .length,
          projectId: job.projectId || window._currentProjectId || null,
          chain: job.chain ? { ...job.chain } : null,
          regenDisplay: job.regenDisplay ? { ...job.regenDisplay } : null,
          settings: job.settings,
          taskBatch: job.taskBatch
            ? {
                currentIdx: job.taskBatch.currentIdx,
                totalTasks: job.taskBatch.tasks.length,
                currentTaskName:
                  job.taskBatch.tasks[job.taskBatch.currentIdx]?.name || "",
              }
            : null,
          items: job.items
            .filter((item) => !item._trackerRemoved)
            .map((item) => {
              const th = this._itemThumb(item);
              const rawError =
                job._apiRecoveryCallerReleased &&
                item.state === QueueItem.STATE.RECOVERY_REQUIRED
                  ? [item.error, job.recoveryLabel, job.recoveryHint]
                      .filter(Boolean)
                      .join(" \u2014 ")
                  : item.error;
              const formattedError =
                typeof rawError === "string" && rawError
                  ? window.FlowApiAdapter?.formatError?.(
                      rawError,
                      item.errorType,
                    )
                  : null;
              const rawRetryError =
                typeof item.retryReason === "string" && item.retryReason
                  ? item.retryReason
                  : item._phaseRRecord?.error || null;
              const formattedRetryError = rawRetryError
                ? window.FlowApiAdapter?.formatError?.(
                    rawRetryError,
                    item.retryReasonType,
                  )
                : null;
              const acceptedOperationId =
                item.operationId ||
                item.flowOperationId ||
                item.flowApiLineage?.find((entry) => entry?.operationId)
                  ?.operationId ||
                null;
              const runtimeDisplayState =
                this._webRecovery?.displayState?.(item) || item.state;
              const operationAwareState =
                this._itemExecutionMode(job, item) === "api" &&
                (acceptedOperationId || item._apiDispatchStarted === true) &&
                [
                  QueueItem.STATE.SUBMITTING,
                  QueueItem.STATE.SUBMITTED,
                ].includes(runtimeDisplayState)
                  ? QueueItem.STATE.MONITORING
                  : runtimeDisplayState;
              return {
                ...this._itemStatusPresentation(
                  job,
                  item,
                  runtimeDisplayState,
                  formattedError || rawError || null,
                  formattedRetryError || rawRetryError || null,
                ),
                id: item.id,
                trackerRemovable: this._canRemoveLiveTrackerItem(job, item),
                attemptId: item.attemptId || item.id,
                flowOperationId: item.flowOperationId || null,
                promptIndex: item.promptIndex,
                recoveryLabel:
                  item.recoveryLabel || this._webRecovery?.label(item) || null,
                recoveryPhase: item.recoveryPhase || null,
                recoveryCode: item.recoveryCode || null,
                recoveryAttempt: Number(item.recoveryAttempt) || 0,
                recoveryMaxAttempts: Number(item.recoveryMaxAttempts) || 0,
                promptText: item.promptText,
                prompt: item.prompt,
                state:
                  job._apiRecoveryCallerReleased &&
                  item.state === QueueItem.STATE.RECOVERY_REQUIRED
                    ? "FAILED"
                    : item._apiWaitingSlot
                      ? job.state === "paused"
                        ? "WAITING_PROVIDER"
                        : "PENDING"
                      : operationAwareState,
                providerGenerationState:
                  job._apiRecoveryCallerReleased &&
                  item.state === QueueItem.STATE.RECOVERY_REQUIRED
                    ? "FAILED"
                    : item.providerGenerationState || null,
                providerCompletedAt: item.providerCompletedAt || null,
                tileId: item.tileId,
                retryCount: item.retrySubmitCount,
                error: rawError,
                errorDisplay:
                  formattedError && formattedError !== rawError
                    ? formattedError
                    : null,
                retryErrorDisplay: formattedRetryError || rawRetryError || null,
                errorType: item.errorType || null,
                errorPolicy: item.errorPolicy || null,
                projectId:
                  item.projectId ||
                  job.projectId ||
                  window._currentProjectId ||
                  null,
                operationId: acceptedOperationId,
                mediaId: item.mediaId || null,
                mediaUuid: item.mediaUuid || null,
                flowApiAccepted: item.flowApiAccepted === true,
                flowApiDriver: item.flowApiDriver || null,
                flowApiAttemptedDrivers: item.flowApiAttemptedDrivers || [],
                flowApiMode: item.flowApiMode || null,
                flowApiProtocolRevision: item.flowApiProtocolRevision || null,
                flowApiProtocolFingerprint:
                  item.flowApiProtocolFingerprint || null,
                flowApiLineage: (Array.isArray(item.flowApiLineage)
                  ? item.flowApiLineage
                  : []
                )
                  .map((entry) => ({
                    attemptId: entry?.attemptId || null,
                    operationId: entry?.operationId || null,
                    mediaId: entry?.mediaId || null,
                  }))
                  .filter((entry) => entry.operationId)
                  .slice(0, 8),
                dependency: item.dependency
                  ? {
                      ...item.dependency,
                      resolvedRefFileIds: [
                        ...(item.dependency.resolvedRefFileIds || []),
                      ],
                    }
                  : null,
                _taskIdx: item._taskIdx,
                submittedAt: item.submittedAt,
                flowApiDispatchedAt: item.flowApiDispatchedAt,
                flowApiOperationDeadlineAt: item.flowApiOperationDeadlineAt,
                providerPausedAt: item.providerPausedAt,
                completedAt: item.completedAt,
                createdAt: item.createdAt,
                thumb: th ? th.url : null,
                thumbVideo: !!(th && th.video),
                thumbPoster: !!(th && th.poster),
                thumbPlayUrl: (th && th.playUrl) || null,
                thumbSourceThumbnail: (th && th.sourceThumbnail) || null,
                taskName: item._taskName || null,
                autoDownload: item._autoDownload ?? job._autoDownload ?? false,
                downloadResolution: item._downloadResolution || null,
                videoDownloadResolution: item._videoDownloadResolution || null,
                dl: this._itemDlState(item),
                genMode: this._itemExecutionMode(job, item),
                apiWaiting: item._apiWaitingSlot === true,
                preTileIds:
                  item.state === "MONITORING" && item.preTileIds
                    ? Array.from(item.preTileIds)
                    : null,
                progressTileIds:
                  item.state === "MONITORING" && item.genMode !== "api"
                    ? [
                        ...new Set([
                          ...(item._ownTileIds || []),
                          ...(item._ownTileAliases || []),
                        ]),
                      ].filter((id) => !/^dom-tile:/i.test(String(id)))
                    : [],
                results: this._itemResults(item),
                outputs: this._safeOutputLedger(item),
                model: (item.settings && item.settings.model) || null,
                ratio: (item.settings && item.settings.ratio) || null,
                genType: (item.settings && item.settings.genType) || null,
                quantity: (item.settings && item.settings.quantity) || null,
                regenOf: item._regenOf || null,
                isRegen: item._isRegen === true,
                refFileIds: Array.isArray(item.refFileIds)
                  ? item.refFileIds
                  : [],
                refFileNames: item.refFileNames || {},
                refThumbnails:
                  window.FlowWebRecovery?.snapshotRefIdentityMap?.(
                    item.refThumbnails,
                    item.refFileIds,
                    item.refFileNames,
                  ) || {},
                settings: item.settings ? { ...item.settings } : null,
                refImageMode: item.refImageMode || "none",
                mentionData: item.mentionData || null,
              };
            }),
        }))
        .filter((job) => job.items.length > 0 || job.owner === "workflow"),
      pipeline: {
        editor: {
          state: this._editorExecutor.state,
          currentItemId: this._editorExecutor.currentItem?.id || null,
          processedCount: this._editorExecutor.processedCount,
        },
        tileMonitor: {
          activeCount: this._tileMonitor.activeCount,
          claimingCount: this._tileMonitor.claimingCount,
          waitingCount: this._tileMonitor.waitingCount,
          stagnant: this._tileMonitor.isStagnant(6e4),
          completedCount: this._tileMonitor.completedCount,
          failedCount: this._tileMonitor.failedCount,
        },
        download: {
          state: this._currentDownloadItem
            ? "downloading"
            : this._downloadQueue.length > 0
              ? "queued"
              : "idle",
          queueLength: this._downloadQueue.length,
          completedCount: this._downloadCompletedCount,
          items: [
            ...this._downloadQueue
              .slice(0, 10)
              .map((d) => ({
                tileId: d.tileId,
                promptText: d.promptText,
                state: "PENDING",
                jobId: d.jobId,
              })),
            ...(this._currentDownloadItem ? [this._currentDownloadItem] : []),
            ...this._downloadHistory.slice(-10),
          ],
        },
      },
      elapsed: this._startedAt ? Date.now() - this._startedAt : 0,
    };
    snapshot.jobs.push(
      ...(window.workflowExecutor?._singleNodeSession?.trackerJobs() || []),
    );
    return snapshot;
  }
  _throttledBroadcast(snapshot) {
    this._pendingSnapshot = snapshot;
    if (this._broadcastThrottleTimer) return;
    this._broadcastThrottleTimer = setTimeout(() => {
      this._broadcastThrottleTimer = null;
      if (this._pendingSnapshot) {
        const snap = this._pendingSnapshot;
        this._pendingSnapshot = null;
        try {
          chrome.runtime
            .sendMessage({ action: "pq:state_broadcast", snapshot: snap })
            .catch(() => {});
        } catch (_) {}
        this._sendToFlowTracker(snap);
      }
    }, 500);
  }
  _sendToFlowTracker(snapshot, options = {}) {
    const sourceJobs = snapshot.jobs || [];
    const jobs = sourceJobs.filter((job) => job.owner !== "workflow");
    const workflowJobs = sourceJobs.filter((job) => job.owner === "workflow");
    const workflowOnly = jobs.length === 0 && workflowJobs.length > 0;
    let trackerPipeline = workflowOnly ? null : snapshot.pipeline;
    if (trackerPipeline && workflowJobs.length) {
      const workflowJobIds = new Set(workflowJobs.map((job) => job.id));
      const workflowItemIds = new Set(
        workflowJobs.flatMap((job) => (job.items || []).map((item) => item.id)),
      );
      trackerPipeline = {
        ...trackerPipeline,
        editor: trackerPipeline.editor
          ? {
              ...trackerPipeline.editor,
              currentItemId: workflowItemIds.has(
                trackerPipeline.editor.currentItemId,
              )
                ? null
                : trackerPipeline.editor.currentItemId,
            }
          : null,
        download: trackerPipeline.download
          ? {
              ...trackerPipeline.download,
              items: (trackerPipeline.download.items || []).filter(
                (item) => !workflowJobIds.has(item.jobId),
              ),
            }
          : null,
      };
    }
    const completed = jobs.reduce((sum, j) => sum + (j.completedCount || 0), 0);
    const total = jobs.reduce((sum, j) => sum + (j.totalExpected || 0), 0);
    const noticeKey = "flowRecovery.webProcessNotice";
    const webProcessNotice = window.I18n?.t?.(noticeKey);
    const trackerData = {
      trackerProvider: "flow",
      webProcessNotice:
        webProcessNotice && webProcessNotice !== noticeKey
          ? webProcessNotice
          : null,
      schemaVersion: snapshot.schemaVersion || 1,
      sessionId: this._trackerSessionId,
      blockerRunId: this._blockerRunId,
      projectId: snapshot.projectId || null,
      trackerWorkflowExcluded: workflowOnly,
      isRunning: workflowJobs.length
        ? this._isRunning &&
          jobs.some((job) =>
            ["running", "paused", "pending", "queued", "preparing"].includes(
              job.status,
            ),
          )
        : this._isRunning,
      completed,
      total,
      elapsed: snapshot.elapsed || 0,
      pipeline: trackerPipeline,
      jobs: jobs.map((j) => ({
        id: j.id,
        sessionId: j.sessionId || this._trackerSessionId,
        owner: j.owner,
        manualRegenItemId: j.manualRegenItemId || null,
        manualRegenBatchPending: j.manualRegenBatchPending || 0,
        manualRegenQueuedIds: j.manualRegenQueuedIds || [],
        singleNodeSession: j.singleNodeSession === true,
        label: j.label,
        status: j.status,
        pauseReason: j.pauseReason || null,
        recoveryRequired: j.recoveryRequired || null,
        recoveryLabel: j.recoveryLabel || null,
        recoveryHint: j.recoveryHint || null,
        interrupted: j.interrupted === true,
        modeType: j.modeType || "web",
        modeReason: j.modeReason || null,
        effectiveRunMode: j.effectiveRunMode || "parallel",
        forcedV2WebSequential: j.forcedV2WebSequential === true,
        completed: j.completedCount || 0,
        failed: j.failedCount || 0,
        total: j.totalExpected || 0,
        projectId: j.projectId || snapshot.projectId || null,
        chain: j.chain || null,
        regenDisplay: j.regenDisplay || null,
        startedAt: j.startedAt,
        completedAt: j.completedAt || null,
        settings: j.settings
          ? { manualSubmitMode: !!j.settings.manualSubmitMode }
          : null,
        items: (j.items || []).map((it) => ({
          id: it.id,
          trackerRemovable: it.trackerRemovable === true,
          attemptId: it.attemptId || it.id,
          hasFlowOperationId: !!it.flowOperationId,
          promptIndex: it.promptIndex,
          promptText: it.promptText,
          prompt: it.prompt,
          state: it.state,
          providerGenerationState: it.providerGenerationState || null,
          providerCompletedAt: it.providerCompletedAt || null,
          retryCount: it.retryCount || 0,
          recoveryLabel: it.recoveryLabel || null,
          recoveryPhase: it.recoveryPhase || null,
          recoveryCode: it.recoveryCode || null,
          recoveryAttempt: Number(it.recoveryAttempt) || 0,
          recoveryMaxAttempts: Number(it.recoveryMaxAttempts) || 0,
          error: it.error,
          errorDisplay: it.errorDisplay || null,
          retryErrorDisplay: it.retryErrorDisplay || null,
          statusKind: it.statusKind || null,
          statusLabel: it.statusLabel || null,
          statusReason: it.statusReason || null,
          statusHint: it.statusHint || null,
          errorType: it.errorType || null,
          errorPolicy: it.errorPolicy || null,
          projectId: it.projectId || j.projectId || snapshot.projectId || null,
          operationId: it.operationId || null,
          mediaId: it.mediaId || null,
          flowApiAccepted: it.flowApiAccepted === true,
          flowApiDriver: it.flowApiDriver || null,
          flowApiAttemptedDrivers: it.flowApiAttemptedDrivers || [],
          flowApiMode: it.flowApiMode || null,
          flowApiProtocolRevision: it.flowApiProtocolRevision || null,
          flowApiProtocolFingerprint: it.flowApiProtocolFingerprint || null,
          flowApiLineage: Array.isArray(it.flowApiLineage)
            ? it.flowApiLineage
            : [],
          dependency: it.dependency || null,
          submittedAt: it.submittedAt,
          flowApiDispatchedAt: it.flowApiDispatchedAt || null,
          flowApiOperationDeadlineAt: it.flowApiOperationDeadlineAt || null,
          providerPausedAt: it.providerPausedAt || null,
          completedAt: it.completedAt,
          createdAt: it.createdAt,
          thumb: it.thumb || null,
          thumbVideo: it.thumbVideo === true,
          thumbPoster: it.thumbPoster === true,
          thumbPlayUrl: it.thumbPlayUrl || null,
          thumbSourceThumbnail: it.thumbSourceThumbnail || null,
          taskName: it.taskName || null,
          autoDownload: it.autoDownload === true,
          downloadResolution: it.downloadResolution || null,
          videoDownloadResolution: it.videoDownloadResolution || null,
          dl: it.dl || null,
          genMode: it.genMode || null,
          apiWaiting: it.apiWaiting === true,
          results: Array.isArray(it.results) ? it.results : [],
          outputs: Array.isArray(it.outputs) ? it.outputs : [],
          model: it.model || null,
          ratio: it.ratio || null,
          genType: it.genType || null,
          quantity: it.quantity || null,
          regenOf: it.regenOf || null,
          isRegen: it.isRegen === true,
          refFileIds: Array.isArray(it.refFileIds) ? it.refFileIds : [],
          refFileNames: it.refFileNames || {},
          refThumbnails: it.refThumbnails || {},
          settings: it.settings ? { ...it.settings } : null,
          refImageMode: it.refImageMode || "none",
          mentionData: it.mentionData || null,
          preTileIds:
            it.state === "MONITORING" && it.preTileIds
              ? Array.from(it.preTileIds)
              : null,
          progressTileIds: Array.isArray(it.progressTileIds)
            ? it.progressTileIds
            : [],
        })),
      })),
    };
    if (Number.isInteger(options.targetTabId)) {
      return new Promise((resolve) => {
        try {
          chrome.tabs.sendMessage(
            options.targetTabId,
            {
              action: "pq:trackerUpdate",
              data: trackerData,
              persistBeforeReply: options.persistBeforeReply === true,
            },
            (response) => {
              if (chrome.runtime.lastError) {
                resolve(false);
                return;
              }
              resolve(
                response?.success === true &&
                  response?.trackerPersisted !== false,
              );
            },
          );
        } catch (_) {
          resolve(false);
        }
      });
    }
    this._broadcastToFlowTabs("pq:trackerUpdate", trackerData);
    this._broadcastTrackerToProviderTabs(trackerData);
    return Promise.resolve(true);
  }
  async _flushFlowTrackerBeforeReload(tabId) {
    if (!Number.isInteger(tabId)) return false;
    if (this._broadcastThrottleTimer) {
      clearTimeout(this._broadcastThrottleTimer);
      this._broadcastThrottleTimer = null;
    }
    this._pendingSnapshot = null;
    return this._sendToFlowTracker(this._buildSnapshot(), {
      targetTabId: tabId,
      persistBeforeReply: true,
    });
  }
  _broadcastToFlowTabs(action, data) {
    const flowPatterns =
      window.ProviderConfigManager?.getTabQueryPatterns?.("flow") || [];
    if (
      typeof chrome === "undefined" ||
      !chrome.tabs?.query ||
      !flowPatterns.length
    )
      return;
    chrome.tabs.query({ url: flowPatterns }, (tabs) => {
      if (chrome.runtime.lastError || !tabs) return;
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, { action, data }, () => {
          if (chrome.runtime.lastError) {
          }
        });
      });
    });
  }
  _broadcastTrackerToProviderTabs(trackerData) {
    if (!chrome?.tabs?.query) return;
    const urlPatterns = ["chatgpt", "grok", "gemini", "muse"].flatMap(
      (provider) =>
        window.ProviderConfigManager?.getTabQueryPatterns?.(provider) || [],
    );
    urlPatterns.forEach((pattern) => {
      try {
        chrome.tabs.query({ url: pattern }, (tabs) => {
          if (chrome.runtime.lastError || !tabs) return;
          tabs.forEach((tab) => {
            try {
              chrome.tabs.sendMessage(
                tab.id,
                { action: "pq:trackerUpdate", data: trackerData },
                () => {
                  if (chrome.runtime.lastError) {
                  }
                },
              );
            } catch (_) {}
          });
        });
      } catch (_) {}
    });
  }
  get activeJobCount() {
    return Array.from(this._jobs.values()).filter((j) => j.isActive).length;
  }
  get pendingCount() {
    return this._itemQueue.length;
  }
  get isRunning() {
    return this._isRunning;
  }
  get allJobs() {
    return Array.from(this._jobs.values());
  }
  getJobsByOwner(owner) {
    return Array.from(this._jobs.values()).filter(
      (j) => j.owner === owner && j.isActive,
    );
  }
  _retirePromptResultBlobs(job, items = job?.items || []) {
    if (
      job?.owner !== "prompts" ||
      job._resolved ||
      job._onResultsReady ||
      job._onGenerationComplete ||
      this._currentDownloadItem?.jobId === job.id ||
      this._downloadQueue?.some((download) => download.jobId === job.id)
    )
      return;
    const removed = new Set(items);
    const retained = new Set();
    for (const liveJob of this._jobs.values()) {
      for (const item of liveJob.items || []) {
        if (removed.has(item)) continue;
        for (const map of [
          item.resultThumbnails,
          item.refThumbnails,
          item._mappedRefThumbnails,
        ]) {
          for (const info of Object.values(map || {})) {
            if (!info || typeof info !== "object") continue;
            if (info.video_url) retained.add(info.video_url);
            if (info.thumbnail) retained.add(info.thumbnail);
          }
        }
      }
    }
    window.FlowApiAdapter?.releaseResultBlobUrls?.(items, retained);
  }
  _clearCompletedJobs() {
    for (const [id, job] of this._jobs) {
      if (job.isDone) {
        this._retirePromptResultBlobs(job);
        this._jobs.delete(id);
      }
    }
    if (this._persistQueues.size > 0 && this._jobs.size === 0) {
      this._persistQueues.clear();
    }
    this._downloadHistory = [];
    this._downloadCompletedCount = 0;
    this._tileMonitor.resetCounters?.();
  }
  async clearTrackerHistory(projectId, { force = false } = {}) {
    if (!projectId) return false;
    if (force && this._isRunning)
      this.stopAll({ stopOrigin: "user", stopReason: "USER_CANCELLED" });
    if (this._isRunning) return false;
    const removedRecoveryRecords =
      (await this._webRecovery?.clearProject?.(projectId)) || 0;
    const [removedApiV1, removedApiV2] = await Promise.all([
      window.FlowApiAdapter?.removeCheckpointsForProject?.(projectId) || 0,
      window.FlowApiV2CheckpointStore?.removeForProject?.(projectId) || 0,
    ]);
    console.info(
      "[FlowRecoveryJournal] tracker_clear " +
        JSON.stringify({
          projectId,
          removed: removedRecoveryRecords,
          retained: this._webRecovery?.records?.size ?? 0,
          apiV1CheckpointsRemoved: removedApiV1,
          apiV2CheckpointsRemoved: removedApiV2,
        }),
    );
    for (const [id, job] of this._jobs) {
      const ownerProject =
        job.projectId ||
        (job.items || []).find((item) => item.projectId)?.projectId ||
        null;
      if (ownerProject === projectId) {
        this._retirePromptResultBlobs(job);
        this._jobs.delete(id);
      }
    }
    for (const jobId of this._persistQueues.keys()) {
      if (!this._jobs.has(jobId)) this._persistQueues.delete(jobId);
    }
    if (this._jobs.size === 0) {
      this._downloadHistory = [];
      this._downloadCompletedCount = 0;
      this._trackerSessionId = crypto.randomUUID();
    }
    this._emitStateChanged();
    return true;
  }
  _canRemoveLiveTrackerItem(job, item) {
    if (
      !job ||
      !item ||
      item._trackerRemoved ||
      job.owner !== "prompts" ||
      job.chain ||
      job._admissionPending
    )
      return false;
    if (item.isTerminal) return true;
    return (
      ["running", "paused"].includes(job.state) &&
      item.state === QueueItem.STATE.PENDING &&
      this._itemQueue.includes(item) &&
      item !== this._editorExecutor.currentItem &&
      item._apiDispatchStarted !== true &&
      item.flowApiAccepted !== true &&
      !item.operationId &&
      !item.flowOperationId
    );
  }
  async updateTrackerPrompt(projectId, jobId, itemId, prompt) {
    const next = typeof prompt === "string" ? prompt.trim() : "";
    if (!projectId || !jobId || !itemId || !next)
      return { ok: false, error: "INVALID_PROMPT" };
    const job = this._jobs.get(jobId);
    if (!job) return { ok: true, cachedOnly: true };
    const ownerProject =
      job.projectId || job.items.find((item2) => item2.projectId)?.projectId;
    const item = job.items.find((entry) => entry.id === itemId);
    if (
      ownerProject !== projectId ||
      !item ||
      item._trackerRemoved ||
      job.owner !== "prompts"
    )
      return { ok: false, error: "PROMPT_ITEM_NOT_FOUND" };
    if (!item.isTerminal && !this._canRemoveLiveTrackerItem(job, item))
      return { ok: false, error: "PROMPT_ITEM_IN_FLIGHT" };
    const record = !item.isTerminal
      ? this._webRecovery?.records?.get(item.id)
      : null;
    if (
      record?.attempts?.length ||
      record?.outputs?.some((output) => output.state !== "pending")
    )
      return { ok: false, error: "PROMPT_ITEM_IN_FLIGHT" };
    const previous = {
      prompt: item.prompt,
      promptText: item.promptText,
      snapshotPrompt: record?.snapshot?.prompt,
    };
    item.prompt = next;
    item.promptText = next.substring(0, 80);
    if (record?.snapshot) record.snapshot.prompt = next;
    try {
      if (record) await this._webRecovery.persist();
    } catch (error) {
      item.prompt = previous.prompt;
      item.promptText = previous.promptText;
      if (record?.snapshot) record.snapshot.prompt = previous.snapshotPrompt;
      return { ok: false, error: error?.message || "PROMPT_SAVE_FAILED" };
    }
    for (const owner of this._jobs.values()) {
      for (const entry of owner._manualRegenRequests || []) {
        if (entry.request.itemId === itemId) entry.request.prompt = next;
      }
    }
    this._emitStateChanged();
    return { ok: true };
  }
  removeTrackerItem(projectId, jobId, itemId) {
    if (!projectId || !jobId || !itemId) return false;
    const job = this._jobs.get(jobId);
    if (!job) return true;
    const ownerProject =
      job.projectId ||
      (job.items || []).find((item) => item.projectId)?.projectId ||
      null;
    if (ownerProject !== projectId) return false;
    const target = job.items.find((item) => item.id === itemId);
    const rootId = target?._regenOf || itemId;
    const dropQueuedRegen = () => {
      for (const owner of this._jobs.values()) {
        if (
          owner.projectId !== projectId ||
          !owner._manualRegenRequests?.length
        )
          continue;
        owner._manualRegenRequests = owner._manualRegenRequests.filter(
          (entry) => entry.rootId !== rootId && entry.request.itemId !== itemId,
        );
      }
    };
    if (this._isRunning) {
      if (!this._canRemoveLiveTrackerItem(job, target)) return false;
      dropQueuedRegen();
      if (!target.isTerminal) {
        this._itemQueue = this._itemQueue.filter((item) => item !== target);
        target._trackerRemovedBeforeSubmit = true;
        target.state = QueueItem.STATE.CANCELLED;
        target.completedAt = Date.now();
      }
      target._trackerRemoved = true;
      this._recordHistoryDiagnostic(
        job,
        "tracker_item_removed",
        target,
        "USER_REMOVED",
      );
      if (
        job.state === "paused" &&
        !job._manualRegenInFlight &&
        !job._manualRegenRequests?.length &&
        job.items.every((item) => item.isTerminal) &&
        ![...this._jobs.values()].some(
          (other) => other !== job && other.state === "paused",
        )
      ) {
        this._editorExecutor.resume();
        window.MessageBridge?.sendToContentScript?.("pq:pauseExecution", {
          paused: false,
        })?.catch?.(() => {});
      }
      this._checkJobDone(job);
      this._emitStateChanged();
      return true;
    }
    if (target?._regenOf) {
      dropQueuedRegen();
      const ids = new Set([itemId, target._regenOf]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const entry of this._jobs.values()) {
          if (
            (entry.projectId ||
              entry.items?.find((item) => item.projectId)?.projectId) !==
            projectId
          )
            continue;
          for (const item of entry.items || []) {
            if (!ids.has(item.id) && ids.has(item._regenOf)) {
              ids.add(item.id);
              changed = true;
            }
          }
        }
      }
      for (const entry of Array.from(this._jobs.values())) {
        if (
          (entry.projectId ||
            entry.items?.find((item) => item.projectId)?.projectId) !==
          projectId
        )
          continue;
        this._retirePromptResultBlobs(
          entry,
          entry.items.filter((item) => ids.has(item.id)),
        );
        entry.items = entry.items.filter((item) => !ids.has(item.id));
        if (!entry.items.length) {
          this._jobs.delete(entry.id);
          this._persistQueues.delete(entry.id);
        } else {
          entry.totalExpected = entry.items.length;
          entry.completedCount = entry.items.filter(
            (item) => item.state === QueueItem.STATE.COMPLETED,
          ).length;
          entry.failedCount = entry.items.filter((item) =>
            [
              QueueItem.STATE.FAILED,
              QueueItem.STATE.PARTIAL_FAIL,
              QueueItem.STATE.BLOCKED,
            ].includes(item.state),
          ).length;
        }
      }
      this._emitStateChanged();
      return true;
    }
    const before = job.items.length;
    dropQueuedRegen();
    this._retirePromptResultBlobs(
      job,
      job.items.filter((item) => item.id === itemId),
    );
    job.items = job.items.filter((item) => item.id !== itemId);
    if (job.items.length === before) return true;
    if (!job.items.length) {
      this._jobs.delete(jobId);
      this._persistQueues.delete(jobId);
    } else {
      job.totalExpected = job.items.length;
      job.completedCount = job.items.filter(
        (item) => item.state === QueueItem.STATE.COMPLETED,
      ).length;
      job.failedCount = job.items.filter((item) =>
        [
          QueueItem.STATE.FAILED,
          QueueItem.STATE.PARTIAL_FAIL,
          QueueItem.STATE.BLOCKED,
        ].includes(item.state),
      ).length;
    }
    this._emitStateChanged();
    return true;
  }
  cleanup() {
    const completedJobs = Array.from(this._jobs.values())
      .filter((j) => j.isDone)
      .sort((a, b) => a.createdAt - b.createdAt);
    while (completedJobs.length > 10) {
      const oldest = completedJobs.shift();
      this._retirePromptResultBlobs(oldest);
      this._jobs.delete(oldest.id);
    }
  }
};
__publicField(_PromptQueue, "_instance", null);
let PromptQueue = _PromptQueue;
window.PromptQueue = PromptQueue;
