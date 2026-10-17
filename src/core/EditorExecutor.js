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
const _EditorExecutor = class _EditorExecutor {
  constructor() {
    this._queue = null;
    this._isRunning = false;
    this._shouldStop = false;
    this._isPaused = false;
    this._currentItem = null;
    this._processedCount = 0;
    this._lastSettings = null;
    this._onItemSubmitted = null;
    this._onItemCompleted = null;
    this._hasActiveMonitoring = null;
    this._onRunLoopFinished = null;
    this._isDownloading = false;
    this._batchSize = 4;
    this._restMin = 5e3;
    this._restMax = 15e3;
    this._lastVoiceKey = null;
    this._lastCharacterKey = null;
  }
  get isDownloading() {
    return this._isDownloading;
  }
  setup({
    queue,
    onItemSubmitted,
    onItemCompleted,
    hasActiveMonitoring,
    onRunLoopFinished,
  }) {
    this._queue = queue;
    this._onItemSubmitted = onItemSubmitted;
    this._onItemCompleted = onItemCompleted || null;
    this._hasActiveMonitoring = hasActiveMonitoring || null;
    this._onRunLoopFinished = onRunLoopFinished || null;
  }
  updateSettings({ batchSize, restMin, restMax }) {
    if (batchSize !== void 0) this._batchSize = batchSize;
    if (restMin !== void 0) this._restMin = restMin * 1e3;
    if (restMax !== void 0) this._restMax = restMax * 1e3;
  }
  start() {
    if (this._isRunning) return;
    this._shouldStop = false;
    this._runLoop();
  }
  async _runLoop() {
    this._isRunning = true;
    let batchCount = 0;
    try {
      await MessageBridge.sendToContentScript("resetStop", {});
    } catch (_) {}
    const settings = window.storageSettings?.getSettings() || {};
    this._cachedInputTimeout = settings.inputTimeout || 1200;
    this._cachedRandomDelayMin = (settings.randomDelayMin ?? 3) * 1e3;
    this._cachedRandomDelayMax = (settings.randomDelayMax ?? 10) * 1e3;
    let idleSince = 0;
    const MAX_IDLE_POLL_MS = 9e4;
    let lastRecoveryBlockedLogAt = 0;
    while (!this._shouldStop) {
      await this._queue?._expireAmbiguousApiRecovery?.();
      await this._queue?._webRecovery?.expireIdleRecovery?.();
      while (this._queue?._forceReloadPromise && !this._shouldStop) {
        await this._sleep(200);
      }
      if (this._shouldStop) break;
      if (this._isPaused) {
        const pausedDl = this._queue?.dequeueNextDownload?.();
        if (pausedDl) {
          idleSince = 0;
          await this._processDownload(pausedDl);
        } else {
          await this._sleep(200);
        }
        continue;
      }
      if (
        this._queue?._webRecovery?.blocked &&
        !this._queue._downloadQueue.length &&
        !this._queue._tileMonitor.activeCount
      ) {
        const recovery = this._queue._webRecovery;
        if (recovery.storageError) {
          console.warn(
            "[EditorExecutor] dispatch blocked by Web recovery storage failure",
            JSON.stringify({
              queued: this._queue._itemQueue?.length || 0,
              loaded: recovery.loaded,
            }),
          );
          break;
        }
        if (Date.now() - lastRecoveryBlockedLogAt >= 5e3) {
          console.warn(
            "[EditorExecutor] dispatch waiting for bounded Web recovery",
            JSON.stringify({
              queued: this._queue._itemQueue?.length || 0,
              loaded: recovery.loaded,
              apiInFlight: window.FlowApiAdapter?.inFlightCount?.() || 0,
            }),
          );
          lastRecoveryBlockedLogAt = Date.now();
        }
        await this._sleep(250);
        continue;
      }
      if (
        this._queue?._webRecovery?.closed &&
        !this._queue._webRecovery.unfinished &&
        !this._queue._tileMonitor.activeCount
      )
        await this._queue._checkAndPerformReload();
      const chunkDraining = !!this._queue?._chunkDraining;
      const item = chunkDraining ? null : this._queue?.dequeueNext();
      if (item) {
        idleSince = 0;
        if (item._flowDriverKey === "flow_v2" && !item._requireFlowApiChain) {
          let lastDrainLogAt = 0;
          while (
            (this._queue?._tileMonitor?.activeCount || 0) > 0 &&
            !this._shouldStop
          ) {
            const activeItems = this._queue?._tileMonitor?.activeItems || [];
            const nextCapability =
              window.flowV2CorrelationBroker?.itemCapability?.(item);
            const canAdmit =
              window.flowV2CorrelationBroker?.canAdmitWithActive?.(
                item,
                activeItems,
              ) === true;
            if (nextCapability?.parallel === true && canAdmit) {
              const activeOperations = activeItems.reduce(
                (total, activeItem) =>
                  total +
                  window.flowV2CorrelationBroker.operationCountFor(activeItem),
                0,
              );
              console.log(
                `[EditorExecutor] Flow V2 strong correlation: nh\u1EA3 editor mutex (${activeOperations}/${nextCapability.maxActiveOperations} operations active)`,
              );
              break;
            }
            const readyDownload = this._queue?.dequeueNextDownload?.();
            if (readyDownload) {
              await this._processDownload(readyDownload);
              continue;
            }
            if (Date.now() - lastDrainLogAt >= 5e3) {
              console.log(
                `[EditorExecutor] Flow V2 correlation gate: \u0111\u1EE3i ${this._queue._tileMonitor.activeCount} tile monitor`,
              );
              lastDrainLogAt = Date.now();
            }
            await this._sleep(250);
          }
          if (this._shouldStop) break;
        }
        await this._processItem(item);
        batchCount++;
        const itemJob = this._queue?.getJob(item.jobId);
        if (itemJob?.sequentialMode) {
          let waited = 0;
          const SEQ_WAIT_LOG_INTERVAL = 5e3;
          let lastLogAt = Date.now();
          const _seqBusy = () =>
            this._queue?._tileMonitor?.activeCount > 0 ||
            window.FlowApiAdapter?.hasInFlight?.() === true;
          while (_seqBusy() && !this._shouldStop) {
            await this._sleep(500);
            waited += 500;
            if (Date.now() - lastLogAt > SEQ_WAIT_LOG_INTERVAL) {
              const _n =
                (this._queue?._tileMonitor?.activeCount || 0) +
                (window.FlowApiAdapter?.inFlightCount?.() || 0);
              console.log(
                `[EditorExecutor] Sequential mode: \u0111\u1EE3i ${_n} active (TileMonitor+API) (${Math.round(waited / 1e3)}s)`,
              );
              lastLogAt = Date.now();
            }
          }
          let drainedDownloads = 0;
          let readySequentialDownload = this._queue?.dequeueNextDownload?.();
          while (readySequentialDownload && !this._shouldStop) {
            await this._processDownload(readySequentialDownload);
            drainedDownloads++;
            readySequentialDownload = this._queue?.dequeueNextDownload?.();
          }
          if (drainedDownloads > 0) {
            console.log(
              `[EditorExecutor] Sequential mode: drained ${drainedDownloads} download(s) before next prompt`,
            );
          }
        }
        if (this._queue?._checkAndPerformReload) {
          try {
            const didReload = await this._queue._checkAndPerformReload();
            if (didReload) {
              this._lastSettings = null;
              this._cachedInputTimeout = this._getInputTimeout();
              const reloadSettings =
                window.storageSettings?.getSettings() || {};
              this._cachedRandomDelayMin =
                (reloadSettings.randomDelayMin ?? 3) * 1e3;
              this._cachedRandomDelayMax =
                (reloadSettings.randomDelayMax ?? 10) * 1e3;
            }
          } catch (reloadErr) {
            console.warn(
              "[EditorExecutor] Auto-reload check failed:",
              reloadErr.message,
            );
          }
        }
        const needsRapidSubmitPacing = !itemJob?.sequentialMode;
        if (
          needsRapidSubmitPacing &&
          batchCount >= this._batchSize &&
          this._queue?.hasItems()
        ) {
          const rest = this._randomBetween(this._restMin, this._restMax);
          await this._sleep(rest);
          batchCount = 0;
        } else if (needsRapidSubmitPacing && this._queue?.hasItems()) {
          await this._sleep(this._getRandomDelay());
        } else if (!needsRapidSubmitPacing && this._queue?.hasItems()) {
          console.log(
            "[EditorExecutor] Sequential mode: result settled, skip redundant inter-prompt random delay",
          );
          batchCount = 0;
        }
        continue;
      }
      const dlItem = this._queue?.dequeueNextDownload?.();
      if (dlItem) {
        idleSince = 0;
        await this._processDownload(dlItem);
        continue;
      }
      if (this._hasActiveMonitoring?.()) {
        if (idleSince === 0) {
          idleSince = Date.now();
        } else if (Date.now() - idleSince > MAX_IDLE_POLL_MS) {
          const hasActiveMonitors =
            this._queue?._tileMonitor?.activeCount > 0 ||
            window.FlowApiAdapter?.hasInFlight?.() === true ||
            this._queue?._hasPendingAmbiguousApiRecovery?.() === true;
          if (!hasActiveMonitors) {
            const finalDlCheck = this._queue?.dequeueNextDownload?.();
            if (finalDlCheck) {
              idleSince = 0;
              await this._processDownload(finalDlCheck);
              continue;
            }
            break;
          }
          idleSince = Date.now();
        }
        await this._sleep(500);
        continue;
      }
      const lastDlCheck = this._queue?.dequeueNextDownload?.();
      if (lastDlCheck) {
        idleSince = 0;
        await this._processDownload(lastDlCheck);
        continue;
      }
      if (
        this._queue?._webRecovery?.unfinished &&
        !this._queue._webRecovery.storageError &&
        [...this._queue._jobs.values()].some((job) => job.state === "running")
      ) {
        await this._sleep(500);
        continue;
      }
      break;
    }
    this._isRunning = false;
    this._currentItem = null;
    if (this._onRunLoopFinished) this._onRunLoopFinished();
  }
  _isFlowApiMode(item, trace = false) {
    const decision = (eligible, reason) => {
      if (trace) {
        if (item) item._flowApiPreflightReason = reason;
        console.info(
          "[FlowApiRouting/Eligibility]",
          JSON.stringify({
            itemId: item?.id || null,
            jobId: item?.jobId || null,
            eligible,
            reason,
            requestedMode: item?.settings?.flowExecutionMode || null,
            apiToggle:
              window.storageSettings?.getSettings?.()?.apiModeEnabled ?? null,
            defaultMode:
              window.storageSettings?.getSettings?.()?.defaultGenMode ||
              window.storageSettings?.getSettings?.()?.gen_mode ||
              null,
          }),
        );
      }
      return eligible;
    };
    try {
      const _job = this._queue?.getJob?.(item?.jobId);
      if (_job?._flowApiEngineLock === "web")
        return decision(false, "JOB_LOCKED_WEB");
      if (
        _job?._flowApiEngineLock === "api" &&
        item?.flowApiAccepted === true
      ) {
        return decision(true, "JOB_LOCKED_API_ACCEPTED");
      }
      const runtimeDriver = window.SystemConfig?.get?.("flow_api_driver", null);
      if (!["v1", "v2", "v2_canary", "auto"].includes(runtimeDriver)) {
        return decision(
          false,
          runtimeDriver === "disabled"
            ? "SYSTEM_DRIVER_DISABLED"
            : "SYSTEM_CONFIG_MISSING",
        );
      }
      if (_job?._flowApiEngineLock === "api")
        return decision(true, "JOB_LOCKED_API");
      if (item?._forceWebChain === true)
        return decision(false, "FORCED_WEB_CHAIN");
      if (
        item?.settings?.isFrames !== true &&
        (item?.settings?.voice?.search_value ||
          item?.settings?.character?.search_value ||
          window.MentionParser?.hasComponents?.(item?.prompt || ""))
      ) {
        return decision(false, "FLOW_API_COMPONENT_WEB_ONLY");
      }
      if (!window.FlowApiFacade || !window.BridgeClient)
        return decision(false, "API_CLIENT_MISSING");
      if (
        _job?.owner === "workflow" &&
        window.ExecutionConfig?.getWorkflowFlowApiEnabled?.() !== true
      ) {
        console.log(
          "[EditorExecutor] Workflow + admin flag OFF \u2192 lu\xF4n DOM",
        );
        return decision(false, "WORKFLOW_API_ADMIN_DISABLED");
      }
      if (
        window.featureGate?.canUse &&
        !window.featureGate.canUse("flow_api_enabled")
      )
        return decision(false, "API_ENTITLEMENT_MISSING");
      const s = window.storageSettings?.getSettings?.() || {};
      const requestedMode = item?.settings?.flowExecutionMode;
      const enabled =
        (requestedMode === "api" && item?._isRegen !== true) ||
        s.apiModeEnabled === true ||
        s.apiModeEnabled === "true" ||
        s.apiModeEnabled === 1;
      if (!enabled) return decision(false, "USER_API_MODE_DISABLED");
      const mode =
        item?._isRegen === true && requestedMode === "auto"
          ? s.defaultGenMode || s.gen_mode || "web"
          : ["api", "web", "auto"].includes(requestedMode)
            ? requestedMode
            : s.defaultGenMode || s.gen_mode || "web";
      return decision(
        mode === "api" || mode === "auto",
        mode === "api" || mode === "auto"
          ? "API_ELIGIBLE"
          : "USER_GEN_MODE_WEB",
      );
    } catch (_) {
      return decision(false, "ELIGIBILITY_CHECK_EXCEPTION");
    }
  }
  _isUserForcedApiMode(item) {
    try {
      if (item?._isRegen === true) return false;
      const s = window.storageSettings?.getSettings?.() || {};
      return (
        (item?.settings?.flowExecutionMode ||
          s.defaultGenMode ||
          s.gen_mode ||
          "web") === "api"
      );
    } catch (_) {
      return false;
    }
  }
  async _tryFlowApiSubmit(item, driverReselectCount = 0) {
    const runtimeJob = this._queue?.getJob?.(item?.jobId);
    console.info(
      "[FlowApiRouting/Start]",
      JSON.stringify({
        itemId: item?.id || null,
        jobId: item?.jobId || null,
        owner: runtimeJob?.owner || item?._owner || null,
        mediaType: item.settings?.genType || null,
        model: item.settings?.model || null,
        ratio: item.settings?.ratio || null,
        resolution: item.settings?.flowVideoResolution || null,
        quantity: item.settings?.quantity || null,
        frames: item.settings?.isFrames === true,
        referenceCount: item.refFileIds?.length || 0,
        promptChars: item.prompt?.length || 0,
        engineLock: runtimeJob?._flowApiEngineLock || null,
      }),
    );
    const userForcedApi = this._isUserForcedApiMode(item);
    const lockJobToWeb = (code) => {
      const job = this._queue?.getJob?.(item?.jobId);
      if (!job || job._flowApiEngineLock === "api") return false;
      const committed =
        typeof this._queue?._commitFlowJobRoute === "function"
          ? this._queue._commitFlowJobRoute(job, "web", code)
          : (() => {
              job._flowApiEngineLock = "web";
              job._flowApiWebReason = code;
              job._flowApiRouteReason || (job._flowApiRouteReason = code);
              return true;
            })();
      if (!committed) return false;
      item._flowApiPreflightReason = code;
      if (job.chain) {
        job.chain.engine = "web";
        job.chain.allowWebFallback = false;
      }
      for (const jobItem of job.items || []) {
        jobItem._requireFlowApiChain = false;
        jobItem._forceWebChain = true;
      }
      try {
        this._queue?._emitStateChanged?.();
      } catch (_) {}
      console.info(
        `[FlowApiPreflight] ${code} \u2192 lock to\xE0n job sang Web`,
      );
      return true;
    };
    const failLockedApiItem = (code) => {
      if (runtimeJob?._flowApiEngineLock !== "api") return false;
      if (
        this._shouldStop ||
        runtimeJob?.state === "stopped" ||
        item.state === QueueItem.STATE.CANCELLED
      ) {
        item.state = QueueItem.STATE.CANCELLED;
        return true;
      }
      item.state = QueueItem.STATE.FAILED;
      item.errorType = "server_unavailable";
      item.error = code;
      item.completedAt = Date.now();
      this._queue?._onItemCompleted?.(item);
      console.warn(
        `[EditorExecutor] API-locked job kept on API; item failed without DOM fallback (${code})`,
      );
      return true;
    };
    const fallbackAutoChainToWeb = (code) => {
      const job = this._queue?.getJob?.(item?.jobId);
      if (
        !job?.chain?.allowWebFallback ||
        job.items?.[0] !== item ||
        job.completedCount > 0
      )
        return false;
      if (!lockJobToWeb(code)) return false;
      console.log(
        `[EditorExecutor] Auto chain API preflight failed (${code}) \u2192 lock entire batch to Web`,
      );
      return true;
    };
    const fallbackDisabledChainToWeb = () => {
      if (
        window.SystemConfig?.get?.("flow_api_driver", null) !== "disabled" ||
        !runtimeJob?.chain?.enabled ||
        runtimeJob._flowApiEngineLock === "api" ||
        (runtimeJob.items || []).some(
          (candidate) =>
            candidate.flowApiAccepted === true ||
            candidate._apiDispatchStarted === true,
        )
      )
        return false;
      const config = window.ProviderConfigManager?.getFlowChainConfigSync?.();
      const webCapability = /video/i.test(item.settings?.genType || "")
        ? config?.video_web_chain_enabled
        : config?.image_web_chain_enabled;
      if (config?.enabled !== true || webCapability !== true) return false;
      return lockJobToWeb("SYSTEM_DRIVER_DISABLED");
    };
    const rejectChain = (code) => {
      if (!item?._requireFlowApiChain) return false;
      if (
        this._shouldStop ||
        runtimeJob?.state === "stopped" ||
        item.state === QueueItem.STATE.CANCELLED
      ) {
        item.state = QueueItem.STATE.CANCELLED;
        return true;
      }
      item.state = QueueItem.STATE.FAILED;
      item.errorType = "server_unavailable";
      item.error = code;
      item.completedAt = Date.now();
      this._queue?._onItemCompleted?.(item);
      return true;
    };
    if (!this._isFlowApiMode(item, true)) {
      if (fallbackDisabledChainToWeb()) return false;
      if (fallbackAutoChainToWeb("CHAIN_FLOW_API_UNAVAILABLE")) return false;
      if (failLockedApiItem("FLOW_API_JOB_LOCKED")) return true;
      if (rejectChain("CHAIN_FLOW_API_UNAVAILABLE")) return true;
      lockJobToWeb(item._flowApiPreflightReason || "FLOW_API_NOT_ELIGIBLE");
      return false;
    }
    if (
      item._isRegen === true &&
      item.flowApiAccepted !== true &&
      runtimeJob?._flowApiEngineLock !== "api"
    ) {
      let health = null;
      try {
        health = await window.FlowApiSessionCoordinator?.checkScopes?.({
          surfaces: ["gen"],
          mediaTypes: [item.settings?.genType === "Video" ? "video" : "image"],
          projectId: item.projectId || runtimeJob?.projectId || null,
          force: true,
          passive: true,
        });
      } catch (_) {}
      if (health?.ready !== true) {
        lockJobToWeb("REGEN_API_NOT_CONNECTED");
        return false;
      }
    }
    if (runtimeJob?.singleNodeSession) {
      await window.workflowExecutor?._singleNodeSession?.enterApiPreparation(
        runtimeJob.workflowNodeId,
        () =>
          this._shouldStop ||
          runtimeJob.state === "stopped" ||
          item.state === QueueItem.STATE.CANCELLED,
      );
    }
    if (runtimeJob && !runtimeJob._flowApiActivationPromise) {
      runtimeJob._flowApiActivationPromise = new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage(
            {
              action: "activateFlowTabForExecution",
              tabId: runtimeJob.flowTabId || window._targetFlowTabId || null,
            },
            (response) => {
              void chrome.runtime.lastError;
              resolve(response || null);
            },
          );
        } catch (_) {
          resolve(null);
        }
      }).finally(() => {
        runtimeJob._flowApiActivationPromise = null;
      });
    }
    if (runtimeJob?._flowApiActivationPromise)
      await runtimeJob._flowApiActivationPromise;
    const owner = runtimeJob?.owner || item?._owner || "prompts";
    const hasWebComponents = (candidate) =>
      candidate?.settings?.isFrames !== true &&
      (candidate?.settings?.voice?.search_value ||
        candidate?.settings?.character?.search_value ||
        window.MentionParser?.hasComponents?.(candidate?.prompt || ""));
    const hasVideoRefs = (candidate) =>
      (
        window.FlowApiAdapter?._declaredRefVideoIds?.(candidate) ||
        (candidate?.settings?.refVideoIds || []).filter((id) =>
          candidate?.refFileIds?.includes(id),
        )
      ).length > 0;
    if (hasWebComponents(item) || runtimeJob?.items?.some(hasWebComponents)) {
      if (
        item.flowApiAccepted === true ||
        runtimeJob?._flowApiEngineLock === "api"
      ) {
        if (failLockedApiItem("FLOW_API_COMPONENT_REQUIRES_WEB_JOB"))
          return true;
        return rejectChain("FLOW_API_COMPONENT_REQUIRES_WEB_JOB");
      }
      lockJobToWeb("FLOW_API_COMPONENT_WEB_ONLY");
      return false;
    }
    let selection = await window.FlowApiFacade?.prepare?.(item, {
      owner,
      job: runtimeJob,
    });
    if (
      owner === "workflow" &&
      window.workflowExecutor?._apiBoardReloaded === true &&
      selection?.ok !== true &&
      ["fresh_page_session_required", "session_refresh_timeout"].includes(
        selection?.reason,
      ) &&
      item.flowApiAccepted !== true
    ) {
      const startedAt = Date.now();
      const deadline = Date.now() + 2e4;
      let checks = 1;
      while (
        !this._shouldStop &&
        runtimeJob?.state !== "stopped" &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(2e3, deadline - Date.now())),
        );
        if (this._shouldStop || runtimeJob?.state === "stopped") break;
        selection = await window.FlowApiFacade?.prepare?.(item, {
          owner,
          job: runtimeJob,
        });
        checks++;
        if (
          selection?.ok === true ||
          !["fresh_page_session_required", "session_refresh_timeout"].includes(
            selection?.reason,
          )
        )
          break;
      }
      console.info(
        "[FlowApiRouting/PostReloadSelection]",
        JSON.stringify({
          itemId: item.id,
          ok: selection?.ok === true,
          reason: selection?.reason || null,
          checks,
          elapsedMs: Date.now() - startedAt,
        }),
      );
    }
    if (
      selection?.ok !== true &&
      item.flowApiAccepted !== true &&
      window.FlowApiSessionCoordinator?.canAutoReconnectReason?.(
        selection?.reason,
      ) &&
      runtimeJob &&
      !runtimeJob._flowApiPreflightReconnectDone
    ) {
      runtimeJob._flowApiPreflightReconnectDone = true;
      runtimeJob._flowApiPreflightReconnectPromise =
        window.FlowApiSessionCoordinator.reconnect({
          surface:
            owner === "workflow"
              ? "workflow"
              : owner === "task"
                ? "task"
                : "gen",
          mediaType: /video/i.test(item.settings?.genType || "")
            ? "video"
            : "image",
          item,
          projectId: item.projectId || runtimeJob.projectId || null,
          force: true,
          passive: true,
          recoveryAuthorized: true,
          trigger: "execution_pre_dispatch",
        }).catch(() => null);
      const recovered = await runtimeJob._flowApiPreflightReconnectPromise;
      runtimeJob._flowApiPreflightReconnectPromise = null;
      if (recovered?.ready === true) {
        selection = await window.FlowApiFacade?.prepare?.(item, {
          owner,
          job: runtimeJob,
        });
      }
      console.info(
        "[FlowApiRouting/PreDispatchReconnect]",
        JSON.stringify({
          itemId: item.id,
          ready: recovered?.ready === true,
          reason: recovered?.reason || selection?.reason || null,
        }),
      );
    }
    if (selection?.ok !== true || selection?.driver === "web") {
      item._flowApiPreflightReason =
        selection?.reason || "DRIVER_SELECTION_MISSING";
    }
    console.info(
      "[FlowApiRouting/Selection]",
      JSON.stringify({
        itemId: item.id,
        jobId: item.jobId,
        ok: selection?.ok === true,
        driver: selection?.driver || null,
        mode: selection?.mode || null,
        reason: selection?.reason || null,
        noFallback: selection?.noFallback === true,
        fallbackFrom: selection?.fallbackFrom || null,
        requiresV1Connection: selection?.requiresV1Connection === true,
        healthReason: selection?.health?.reason || null,
        fallbackReason: selection?.fallbackReason || null,
        v1Reason: selection?.v1Reason || null,
        diagnostic: selection?.health?.diagnostic || null,
      }),
    );
    const connectionUnavailable =
      /^(?:V1_CONNECTION_REQUIRED|BRIDGE_NOT_INSTALLED|BRIDGE_REQUEST_TIMEOUT|V2_BRIDGE_VERSION_UNSUPPORTED|V2_PAGE_COMMAND_TIMEOUT|V2_PAGE_RELOADING|V2_CONTENT_SCRIPT_RECOVERING|page_reloading|content_script_recovering|V2_PAGE_RELAY_UNAVAILABLE|V2_PAGE_SESSION_NOT_READY|V2_PRIVATE_CONFIG_MISSING|captcha_not_ready|fresh_page_session_required|session_refresh_timeout|flow_project_tab_required|csrf_missing|login_required|no_token|token_expired)$/.test(
        selection?.reason || "",
      );
    if (
      selection?.ok !== true &&
      ["v1", "v2"].includes(selection?.mode) &&
      connectionUnavailable &&
      !userForcedApi &&
      item.flowApiAccepted !== true &&
      runtimeJob?._flowApiEngineLock !== "api" &&
      !this._shouldStop &&
      runtimeJob?.state !== "stopped" &&
      lockJobToWeb(selection.reason)
    ) {
      console.info(
        "[FlowApiRouting/WebFallback]",
        JSON.stringify({
          jobId: item.jobId,
          apiVersion: selection.mode,
          reason: selection.reason,
          stage: "pre_dispatch",
        }),
      );
      return false;
    }
    const v2Config =
      selection?.driver === "v2"
        ? await window.ProviderConfigManager?.fetchFlowApiV2Configs?.()
        : null;
    const hasWebResolution = (candidate) => {
      const mapping = window.FlowApiV2Driver?._modelConfig?.(
        v2Config?.models?.video,
        candidate?.settings?.model,
      );
      return (
        Array.isArray(mapping?.generation_resolutions) &&
        candidate?.settings?.flowVideoResolution &&
        !mapping.generation_resolutions.includes(
          candidate.settings.flowVideoResolution,
        )
      );
    };
    const needsWebVideoRefs = async (candidate) =>
      hasVideoRefs(candidate) &&
      (
        await window.FlowApiV2Driver?.checkInputSupported?.({
          item: candidate,
          mediaType: "video",
        })
      )?.ready !== true;
    const videoRefsNeedWeb =
      selection?.driver === "v2" &&
      ((await needsWebVideoRefs(item)) ||
        (
          await Promise.all((runtimeJob?.items || []).map(needsWebVideoRefs))
        ).some(Boolean));
    if (
      selection?.driver === "v2" &&
      (videoRefsNeedWeb ||
        hasWebResolution(item) ||
        runtimeJob?.items?.some(hasWebResolution))
    ) {
      const reason = videoRefsNeedWeb
        ? "FLOW_API_VIDEO_REFERENCE_WEB_ONLY"
        : "V2_GENERATION_RESOLUTION_UNSUPPORTED";
      if (
        item.flowApiAccepted === true ||
        runtimeJob?._flowApiEngineLock === "api"
      ) {
        if (failLockedApiItem(reason)) return true;
        return rejectChain(reason);
      }
      lockJobToWeb(reason);
      return false;
    }
    if (
      selection?.ok !== true &&
      this._queue?._deferSafeApiPreDispatchItem?.(item, {
        code: selection?.reason,
        driver: selection?.driver || "v2",
        stage: "pre_dispatch",
        dispatchStarted: false,
        ambiguous: false,
        operationId: null,
      })
    ) {
      return true;
    }
    if (selection?.noFallback === true && selection.ok !== true) {
      item.state = QueueItem.STATE.FAILED;
      item.noRetry = selection.noRetry === true;
      const rejection = window.FlowApiDriverError?.normalize?.({
        code: selection.reason || "FLOW_API_INPUT_UNSUPPORTED",
        stage: "pre_dispatch",
        driver: selection.driver,
        diagnostic: selection.health?.diagnostic || null,
        failureDetails: selection.failureDetails || [],
        grpcCode: selection.health?.grpcCode,
        grpcReason: selection.health?.grpcReason,
        providerErrorCodes: selection.health?.providerErrorCodes,
      });
      item.error =
        window.FlowApiDriverError?.displayMessage?.(rejection) ||
        selection.reason ||
        "FLOW_API_INPUT_UNSUPPORTED";
      item.errorPolicy = {
        code: selection.reason,
        driver: selection.driver,
        stage: "pre_dispatch",
        dispatchStarted: false,
        ambiguous: false,
        retryable: false,
        failureDetails: rejection?.failureDetails || [],
        grpcCode: rejection?.grpcCode ?? null,
        grpcReason: rejection?.grpcReason || null,
        providerErrorCodes: rejection?.providerErrorCodes || [],
      };
      item.errorType = "unknown";
      item.completedAt = Date.now();
      this._queue?._onItemCompleted?.(item);
      return true;
    }
    const needsV1WebQuantity = (candidate) =>
      Number(candidate?.settings?.quantity || 1) > 1 &&
      /video/i.test(candidate?.settings?.genType || "");
    if (
      selection?.driver === "v1" &&
      (needsV1WebQuantity(item) || runtimeJob?.items?.some(needsV1WebQuantity))
    ) {
      if (
        item.flowApiAccepted === true ||
        runtimeJob?._flowApiEngineLock === "api"
      ) {
        if (failLockedApiItem("FLOW_API_QUANTITY_REQUIRES_WEB_JOB"))
          return true;
        return rejectChain("FLOW_API_QUANTITY_REQUIRES_WEB_JOB");
      }
      lockJobToWeb("FLOW_API_QUANTITY_WEB_ONLY");
      return false;
    }
    if (!selection || selection.driver === "web") {
      if (fallbackDisabledChainToWeb()) return false;
      if (fallbackAutoChainToWeb(selection?.reason || "SYSTEM_DRIVER_DISABLED"))
        return false;
      if (failLockedApiItem(selection?.reason || "FLOW_API_DRIVER_DISABLED"))
        return true;
      if (rejectChain(selection?.reason || "FLOW_API_DRIVER_DISABLED"))
        return true;
      lockJobToWeb(selection?.reason || "FLOW_API_DRIVER_DISABLED");
      return false;
    }
    if (selection.ok !== true) {
      if (
        [
          "V2_GENERATION_RESOLUTION_UNSUPPORTED",
          "V2_REFERENCE_IDENTITY_UNRESOLVED",
        ].includes(selection.reason) &&
        item.flowApiAccepted !== true &&
        runtimeJob?._flowApiEngineLock !== "api"
      ) {
        lockJobToWeb(selection.reason);
        return false;
      }
      const preflightError = window.FlowApiDriverError?.normalize?.(
        Object.assign(
          new Error(selection.reason || "FLOW_API_DRIVER_NOT_READY"),
          {
            code: selection.reason || "FLOW_API_DRIVER_NOT_READY",
            stage: "pre_dispatch",
          },
        ),
        { driver: selection.driver || "v1", stage: "pre_dispatch" },
      );
      const captchaPreflight = ["bot_detected", "captcha_failed"].includes(
        preflightError?.errorType,
      );
      if (
        userForcedApi &&
        preflightError?.driver === "v2" &&
        preflightError.retryable === true
      ) {
        item.genMode = "api";
        item.error = preflightError.code;
        item.errorType = preflightError.errorType;
        item.errorPolicy = {
          driver: "v2",
          stage: "pre_dispatch",
          dispatchStarted: false,
          ambiguous: false,
          operationId: null,
          retryable: true,
        };
        if (this._queue?._holdApiItemForManualResume?.(item)) return true;
      }
      if (userForcedApi || selection.noFallback === true) {
        item.state = QueueItem.STATE.FAILED;
        if (selection.noRetry === true) item.noRetry = true;
        item.errorType = preflightError?.errorType || "server_unavailable";
        item.error =
          preflightError?.code ||
          selection.reason ||
          "FLOW_API_DRIVER_NOT_READY";
        item.completedAt = Date.now();
        if (captchaPreflight) {
          if (this._queue?._retryApiCaptchaAsNormal?.(item)) return true;
          if (this._queue?._captchaRecoveryMode?.() !== "normal_error") {
            this._queue?._handleFlowError?.({
              category: "captcha",
              text: item.error,
              jobId: item.jobId,
              itemId: item.id,
              source: "api_preflight",
            });
            if (this._queue?.getJob?.(item.jobId)?.state === "stopped")
              return true;
          }
        }
        this._queue?._onItemCompleted?.(item);
        return true;
      }
      if (
        fallbackAutoChainToWeb(selection.reason || "FLOW_API_DRIVER_NOT_READY")
      )
        return false;
      if (failLockedApiItem(selection.reason || "FLOW_API_DRIVER_NOT_READY"))
        return true;
      if (rejectChain(selection.reason || "FLOW_API_DRIVER_NOT_READY"))
        return true;
      lockJobToWeb(selection.reason || "FLOW_API_DRIVER_NOT_READY");
      return false;
    }
    const selectedDriver = selection.driver;
    item.flowApiCandidateDriver = selectedDriver;
    item.flowApiCandidateMode = selection.mode || null;
    item.flowApiCandidateProtocolRevision =
      selectedDriver === "v2" ? Number(selection.settings?.revision || 1) : 1;
    const failForcedDriverItem = (code) => {
      if (!userForcedApi && !runtimeJob?._flowApiDriverLock) return false;
      if (
        this._shouldStop ||
        runtimeJob?.state === "stopped" ||
        item.state === QueueItem.STATE.CANCELLED
      ) {
        item.state = QueueItem.STATE.CANCELLED;
        return true;
      }
      item.state = QueueItem.STATE.FAILED;
      item.errorType = "server_unavailable";
      item.error = code;
      item.completedAt = Date.now();
      this._queue?._onItemCompleted?.(item);
      console.info(
        `[FlowApiResolver] ${selection.mode} blocked without cross-driver/Web fallback (${code})`,
      );
      return true;
    };
    if (selection.fallbackFrom) {
      console.info("[FlowApiResolver] safe pre-submit fallback", {
        from: selection.fallbackFrom,
        to: selection.driver,
        reason: selection.reason || null,
        surface:
          owner === "workflow" ? "workflow" : owner === "task" ? "task" : "gen",
      });
    }
    if (selectedDriver === "v1" && runtimeJob) {
      if (!runtimeJob._flowApiCreditPreflightPromise) {
        runtimeJob._flowApiCreditPreflightPromise = Promise.resolve()
          .then(() => window.FlowApiAdapter?.checkGenerationReady?.())
          .then((result) => {
            runtimeJob._flowApiCreditPreflight = result || {
              ready: false,
              reason: "credit_check_unavailable",
            };
            return runtimeJob._flowApiCreditPreflight;
          })
          .catch((error) => {
            runtimeJob._flowApiCreditPreflight = {
              ready: false,
              reason: "credit_check_error",
              detail: error?.message || null,
            };
            return runtimeJob._flowApiCreditPreflight;
          });
      }
      const preflight = await runtimeJob._flowApiCreditPreflightPromise;
      console.log(
        "[FlowApiPreflight]",
        JSON.stringify({
          owner: runtimeJob.owner || item?._owner || null,
          jobId: String(runtimeJob.id || "").slice(0, 12),
          ready: preflight?.ready === true,
          reason: preflight?.reason || null,
          validation: preflight?.validation || null,
          flowTabOpen: preflight?.flowTabOpen === true,
        }),
      );
      if (preflight?.ready !== true) {
        if (runtimeJob._flowApiEngineLock === "api") {
          return failLockedApiItem(
            `FLOW_API_CREDIT_CHECK_FAILED_${preflight?.reason || "UNKNOWN"}`,
          );
        }
        if (
          failForcedDriverItem(
            `FLOW_API_CREDIT_CHECK_FAILED_${preflight?.reason || "UNKNOWN"}`,
          )
        )
          return true;
        lockJobToWeb(`credit check failed (${preflight?.reason || "unknown"})`);
        try {
          if (typeof sendLog === "function") {
            sendLog(
              "Flow API ch\u01B0a x\xE1c minh \u0111\u01B0\u1EE3c credit/session; job n\xE0y t\u1EF1 \u0111\u1ED9ng chuy\u1EC3n sang Web mode.",
              "warn",
            );
          }
        } catch (_) {}
        return false;
      }
    } else if (!runtimeJob) {
      if (failForcedDriverItem("FLOW_API_QUEUE_JOB_MISSING")) return true;
      console.info("[FlowApiPreflight] queue job missing \u2192 fallback Web");
      return false;
    }
    let available = false;
    try {
      available = await window.BridgeClient.isAvailable();
    } catch (_) {
      available = false;
    }
    console.info(
      "[FlowApiRouting/Bridge]",
      JSON.stringify({
        itemId: item.id,
        jobId: item.jobId,
        driver: selectedDriver,
        available,
      }),
    );
    if (!available) {
      if (runtimeJob?._flowApiEngineLock === "api") {
        try {
          const recovered = await window.FlowApiSessionCoordinator?.reconnect?.(
            {
              driver: selectedDriver,
              surface:
                owner === "workflow"
                  ? "workflow"
                  : owner === "task"
                    ? "task"
                    : "gen",
              item,
              projectId: item.projectId || null,
              userInitiated: false,
              recoveryAuthorized: true,
            },
          );
          available = recovered?.ready === true;
        } catch (_) {
          available = false;
        }
        if (!available)
          return failLockedApiItem("BRIDGE_UNAVAILABLE_DURING_API_JOB");
      }
    }
    if (!available) {
      console.log(
        "[EditorExecutor] API mode ON nh\u01B0ng TobyBridge v\u1EAFng \u2192 kh\xF3a job sang DOM",
      );
      if (failForcedDriverItem("BRIDGE_UNAVAILABLE")) return true;
      if (fallbackAutoChainToWeb("CHAIN_BRIDGE_UNAVAILABLE")) return false;
      if (rejectChain("CHAIN_BRIDGE_UNAVAILABLE")) return true;
      lockJobToWeb("BRIDGE_UNAVAILABLE");
      return false;
    }
    if (
      selectedDriver === "v1" &&
      (window.FlowApiAdapter?._declaredRefVideoIds?.(item)?.length || 0) > 0
    ) {
      let canEdit = false;
      try {
        canEdit = await window.BridgeClient.hasCapability("flow_video_edit");
      } catch (_) {}
      if (!canEdit) {
        console.log(
          "[EditorExecutor] Bridge ch\u01B0a h\u1ED7 tr\u1EE3 edit video (c\u1EA7n v1.1.2+) \u2192 fallback DOM",
        );
        if (failForcedDriverItem("BRIDGE_CAPABILITY_MISSING")) return true;
        if (fallbackAutoChainToWeb("CHAIN_BRIDGE_CAPABILITY_MISSING"))
          return false;
        if (failLockedApiItem("BRIDGE_CAPABILITY_MISSING_DURING_API_JOB"))
          return true;
        if (rejectChain("CHAIN_BRIDGE_CAPABILITY_MISSING")) return true;
        lockJobToWeb("BRIDGE_CAPABILITY_MISSING");
        return false;
      }
    }
    if (selectedDriver === "v1" && item?.settings?.flowVideoResolution) {
      let canSetGenerationResolution = false;
      try {
        canSetGenerationResolution = await window.BridgeClient.hasCapability(
          "flow_generation_resolution",
        );
      } catch (_) {}
      if (!canSetGenerationResolution) {
        console.log(
          "[EditorExecutor] Bridge ch\u01B0a h\u1ED7 tr\u1EE3 generation resolution \u2192 fallback DOM",
        );
        if (failForcedDriverItem("BRIDGE_GENERATION_RESOLUTION_MISSING"))
          return true;
        if (
          fallbackAutoChainToWeb("CHAIN_BRIDGE_GENERATION_RESOLUTION_MISSING")
        )
          return false;
        if (failLockedApiItem("GENERATION_RESOLUTION_MISSING_DURING_API_JOB"))
          return true;
        if (rejectChain("CHAIN_BRIDGE_GENERATION_RESOLUTION_MISSING"))
          return true;
        lockJobToWeb("BRIDGE_GENERATION_RESOLUTION_MISSING");
        return false;
      }
    }
    const PCM = window.ProviderConfigManager;
    if (
      selectedDriver === "v1" &&
      (!PCM?.getFlowApiEndpointsSync?.() ||
        !PCM?.getFlowApiKeySync?.() ||
        !PCM?.getFlowVerifyConfigSync?.()?.site_key)
    ) {
      console.log(
        "[EditorExecutor] Flow api_config ch\u01B0a s\u1EB5n s\xE0ng (endpoints/key/site_key) \u2192 fallback DOM",
      );
      if (failForcedDriverItem("API_CONFIG_MISSING")) return true;
      if (fallbackAutoChainToWeb("CHAIN_API_CONFIG_MISSING")) return false;
      if (failLockedApiItem("API_CONFIG_MISSING_DURING_API_JOB")) return true;
      if (rejectChain("CHAIN_API_CONFIG_MISSING")) return true;
      lockJobToWeb("API_CONFIG_MISSING");
      return false;
    }
    let _caps = [];
    try {
      _caps = (await window.BridgeClient.ping())?.capabilities || [];
    } catch (_) {}
    if (selectedDriver === "v1" && !_caps.includes("flow_generate")) {
      console.log(
        "[EditorExecutor] Bridge c\u0169 (ch\u01B0a h\u1ED7 tr\u1EE3 flow_generate) \u2192 fallback DOM",
      );
      if (failForcedDriverItem("BRIDGE_VERSION_UNSUPPORTED")) return true;
      if (fallbackAutoChainToWeb("CHAIN_BRIDGE_VERSION_UNSUPPORTED"))
        return false;
      if (failLockedApiItem("BRIDGE_VERSION_CHANGED_DURING_API_JOB"))
        return true;
      if (rejectChain("CHAIN_BRIDGE_VERSION_UNSUPPORTED")) return true;
      lockJobToWeb("BRIDGE_VERSION_UNSUPPORTED");
      return false;
    }
    if (
      this._shouldStop ||
      runtimeJob.state === "stopped" ||
      item.state === QueueItem.STATE.CANCELLED
    ) {
      item.state = QueueItem.STATE.CANCELLED;
      return true;
    }
    const latestSelection = await window.FlowApiFacade?.prepare?.(item, {
      owner,
      job: runtimeJob,
    });
    if (
      this._shouldStop ||
      runtimeJob.state === "stopped" ||
      item.state === QueueItem.STATE.CANCELLED
    ) {
      item.state = QueueItem.STATE.CANCELLED;
      return true;
    }
    if (!this._isFlowApiMode(item, true)) {
      if (failLockedApiItem("FLOW_API_JOB_LOCKED")) return true;
      if (rejectChain("CHAIN_FLOW_API_UNAVAILABLE")) return true;
      lockJobToWeb(
        item._flowApiPreflightReason ||
          "FLOW_API_MODE_CHANGED_DURING_PREFLIGHT",
      );
      return false;
    }
    const selectedRevision = Number(
      selection.settings?.revision ||
        item.flowApiCandidateProtocolRevision ||
        1,
    );
    const latestRevision = Number(
      latestSelection?.settings?.revision || selectedRevision,
    );
    if (
      !latestSelection ||
      latestSelection.ok !== true ||
      latestSelection.driver !== selectedDriver ||
      latestSelection.mode !== selection.mode ||
      latestRevision !== selectedRevision
    ) {
      item.flowApiCandidateDriver = null;
      item.flowApiCandidateMode = null;
      item.flowApiCandidateProtocolRevision = null;
      if (driverReselectCount < 3)
        return this._tryFlowApiSubmit(item, driverReselectCount + 1);
      const code = "FLOW_API_DRIVER_CHANGED_DURING_PREFLIGHT";
      if (userForcedApi) {
        item.state = QueueItem.STATE.FAILED;
        item.errorType = "server_unavailable";
        item.error = code;
        item.completedAt = Date.now();
        this._queue?._onItemCompleted?.(item);
        return true;
      }
      if (fallbackAutoChainToWeb(code)) return false;
      if (rejectChain(code)) return true;
      lockJobToWeb(code);
      return false;
    }
    console.log(
      `[EditorExecutor] Flow API mode \u2192 FlowApiFacade.submit (${selectedDriver}, fire-and-forget)`,
    );
    if (runtimeJob) {
      const committed =
        typeof this._queue?._commitFlowJobRoute === "function"
          ? this._queue._commitFlowJobRoute(
              runtimeJob,
              "api",
              "API_DISPATCH_COMMITTED",
            )
          : (() => {
              if (
                runtimeJob._flowApiEngineLock &&
                runtimeJob._flowApiEngineLock !== "api"
              )
                return false;
              runtimeJob._flowApiEngineLock = "api";
              runtimeJob._flowApiRouteReason ||
                (runtimeJob._flowApiRouteReason = "API_DISPATCH_COMMITTED");
              return true;
            })();
      if (!committed) {
        item.state = QueueItem.STATE.FAILED;
        item.errorType = "server_unavailable";
        item.error = "FLOW_API_BATCH_MODE_CONFLICT";
        item.completedAt = Date.now();
        this._queue?._onItemCompleted?.(item);
        return true;
      }
    }
    item.state = QueueItem.STATE.SUBMITTED;
    item.genMode = "api";
    item._apiWaitingSlot = true;
    item.submittedAt = Date.now();
    this._processedCount++;
    _EditorExecutor._incrementDailyStat("flow_prompt_total");
    if (this._onItemSubmitted) {
    }
    try {
      this._queue?._emitStateChanged?.();
    } catch (_) {}
    const pureAbort = () => {
      if (this._shouldStop) return true;
      const j = this._queue?.getJob(item.jobId);
      if (!j || j.state === "stopped") return true;
      if (
        this._queue?._isApiQuotaBlockedForItem?.(j, item) &&
        !item._apiDispatchStarted &&
        !item.flowApiAccepted
      )
        return true;
      if (
        item._apiDispatchRevoked === true &&
        !item._apiDispatchStarted &&
        item.flowApiAccepted !== true
      )
        return true;
      return item.state === QueueItem.STATE.CANCELLED;
    };
    const flowApiSubmitPromise = Promise.resolve()
      .then(() =>
        window.FlowApiFacade.submit(item, {
          job: runtimeJob,
          owner,
          abortFn: pureAbort,
          isPausedFn: () => this._queue?.getJob(item.jobId)?.state === "paused",
          shouldStopNewMutationsFn: () =>
            item._apiStopFurtherMutations === true,
          getMutationStopReason: () =>
            item._apiFurtherMutationStopReason || null,
          onBeforeSubmit: async () => {
            if (pureAbort()) return;
            try {
              await runtimeJob._onBeforeWorkflowItemStart?.(item);
            } catch (error) {
              item.noRetry = true;
              item.noReplay = true;
              throw error;
            }
          },
          onSlotAcquired: () => {
            item._apiWaitingSlot = false;
            if (
              selectedDriver === "v2" &&
              item.state === QueueItem.STATE.SUBMITTED
            )
              item.state = QueueItem.STATE.SUBMITTING;
            try {
              this._queue?._emitStateChanged?.();
            } catch (_) {}
          },
          onDispatchStarted: () => {
            if (runtimeJob?.singleNodeSession)
              window.workflowExecutor?._singleNodeSession?.admitted(
                runtimeJob.workflowNodeId,
              );
            item._apiWaitingSlot = false;
            item._apiDispatchStarted = true;
            item.auditLifecycle?.("history_api_dispatch", {
              stage: "dispatch",
              remainingMs: item.flowApiOperationDeadlineAt
                ? Math.max(0, item.flowApiOperationDeadlineAt - Date.now())
                : null,
            });
            if (
              [QueueItem.STATE.SUBMITTING, QueueItem.STATE.SUBMITTED].includes(
                item.state,
              )
            ) {
              item.state = QueueItem.STATE.MONITORING;
            }
            console.info(
              "[FlowApiTrackerPhase]",
              JSON.stringify({
                itemId: item.id,
                driver: selectedDriver,
                phase: "processing",
                operationIdAvailable: !!(
                  item.operationId || item.flowOperationId
                ),
                operationDeadlineAt: item.flowApiOperationDeadlineAt || null,
                remainingMs: item.flowApiOperationDeadlineAt
                  ? Math.max(0, item.flowApiOperationDeadlineAt - Date.now())
                  : null,
              }),
            );
            try {
              this._queue?._emitStateChanged?.();
            } catch (_) {}
          },
          onAccepted: () => {
            item._apiWaitingSlot = false;
            const operationId =
              item.operationId ||
              item.flowOperationId ||
              item.flowApiLineage?.find((entry) => entry?.operationId)
                ?.operationId ||
              null;
            item.auditLifecycle?.(
              operationId
                ? "history_api_receipt"
                : "submit_acceptance_unverified",
              {
                stage: operationId ? "receipt" : "ambiguous",
                operationIdAvailable: !!operationId,
              },
            );
            if (
              operationId &&
              [QueueItem.STATE.SUBMITTING, QueueItem.STATE.SUBMITTED].includes(
                item.state,
              )
            ) {
              item.state = QueueItem.STATE.MONITORING;
            }
            console.info(
              "[FlowApiTrackerPhase]",
              JSON.stringify({
                itemId: item.id,
                driver: selectedDriver,
                phase: operationId ? "receipt" : "acceptance_unverified",
                operationIdAvailable: !!operationId,
              }),
            );
            try {
              this._queue?._emitStateChanged?.();
            } catch (_) {}
          },
          onProviderQuota: (failure) => {
            if (
              ![
                "quota_exceeded",
                "per_model_daily",
                "tier_restricted",
              ].includes(failure?.errorType)
            )
              return;
            item.errorType = failure.errorType;
            item.errorPolicy = {
              ...(item.errorPolicy || {}),
              code: failure.code || null,
              grpcReason: failure.grpcReason || null,
              providerErrorCodes: failure.providerErrorCodes || [],
              driver: selectedDriver,
              retryable: false,
            };
            item.error =
              window.FlowApiDriverError?.displayMessage?.(failure) ||
              window.FlowApiAdapter?.formatError?.(
                failure.code,
                failure.errorType,
              ) ||
              failure.code ||
              item.error;
            this._queue?._blockVerifiedFlowQuotaJob?.(runtimeJob, item);
            try {
              this._queue?._emitStateChanged?.();
            } catch (_) {}
          },
          onProviderBotGate: (failure) => {
            const job = this._queue?.getJob(item.jobId);
            if (this._queue?._isApiUnusualActivity?.(failure)) {
              item._apiUnusualActivityDetected = true;
              item.flowApiFailureDetail = {
                ...(item.flowApiFailureDetail || {}),
                code: failure.code || "PUBLIC_ERROR_UNUSUAL_ACTIVITY",
                grpcReason: failure.grpcReason || null,
                providerErrorCodes: failure.providerErrorCodes || [],
                driver: selectedDriver,
              };
            }
            if (
              this._queue?._pauseApiUnusualActivityJob?.(item, {
                ...failure,
                driver: failure?.driver || selectedDriver,
              })
            ) {
              item.errorType = failure.errorType;
              item.error =
                window.FlowApiDriverError?.displayMessage?.(failure) ||
                window.FlowApiAdapter?.formatError?.(
                  failure.code,
                  failure.errorType,
                ) ||
                failure.code ||
                item.error;
              try {
                this._queue?._emitStateChanged?.();
              } catch (_) {}
              return;
            }
            if (
              job?.owner !== "prompts" ||
              this._queue?._captchaRecoveryMode?.() !== "pause_resume"
            )
              return;
            if (
              !["bot_detected", "captcha_failed"].includes(failure?.errorType)
            )
              return;
            if (
              (item.retrySubmitCount || 0) >=
              this._queue._apiGenerationRetryLimit(item)
            )
              return;
            item.errorType = failure.errorType;
            item.error =
              window.FlowApiDriverError?.displayMessage?.(failure) ||
              window.FlowApiAdapter?.formatError?.(
                failure.code,
                failure.errorType,
              ) ||
              failure.code ||
              item.error;
            this._queue.pauseJob(job.id, "captcha");
            try {
              this._queue?._emitStateChanged?.();
            } catch (_) {}
          },
          onRecoveryState: (recovery) => {
            if (!recovery) {
              item.recoveryLabel = null;
              item.recoveryPhase = null;
              item.recoveryCode = null;
              item.recoveryAttempt = 0;
              item.recoveryMaxAttempts = 0;
            } else {
              const key =
                recovery.phase === "reconnecting"
                  ? "gen.flowApiPollReconnecting"
                  : "gen.flowApiPollRetrying";
              const translated = window.I18n?.t?.(key, {
                attempt: recovery.attempt,
                max: recovery.maxAttempts,
              });
              const attemptSuffix = Number.isInteger(recovery.maxAttempts)
                ? ` (${recovery.attempt}/${recovery.maxAttempts})`
                : ` (${recovery.attempt})`;
              item.recoveryLabel =
                translated && translated !== key
                  ? translated
                  : recovery.phase === "reconnecting"
                    ? `Result tracking interrupted \u2014 reconnecting${attemptSuffix}`
                    : `Result tracking interrupted \u2014 retrying result check${attemptSuffix}`;
              item.recoveryPhase = recovery.phase;
              item.recoveryCode = recovery.code || null;
              item.recoveryAttempt = recovery.attempt;
              item.recoveryMaxAttempts = recovery.maxAttempts;
              item.auditLifecycle?.("queue_recovery_decision", {
                recoveryStage: "accepted_poll",
                ambiguous: false,
                action:
                  recovery.phase === "reconnecting"
                    ? "reconnect_same_operation"
                    : "retry_poll_same_operation",
                recoveryCode: recovery.code || null,
                recoveryAttempt: recovery.attempt,
                recoveryMaxAttempts: recovery.maxAttempts,
              });
            }
            try {
              this._queue?._emitStateChanged?.();
            } catch (_) {}
          },
        }),
      )
      .then(() => {
        if (item.state === QueueItem.STATE.CANCELLED) {
          return;
        }
        if (
          item.state === QueueItem.STATE.FAILED &&
          this._queue?._recoverApiUnusualActivityItem?.(item)
        )
          return;
        if (
          item.state === QueueItem.STATE.FAILED &&
          this._queue?._holdApiItemForManualResume?.(item)
        )
          return;
        if (
          item.state === QueueItem.STATE.FAILED &&
          ["bot_detected", "captcha_failed"].includes(item.errorType)
        ) {
          if (this._queue?._retryApiCaptchaAsNormal?.(item)) return;
          if (this._queue?._captchaRecoveryMode?.() !== "normal_error") {
            this._queue?._handleFlowError?.({
              category: "captcha",
              text: item.error,
              jobId: item.jobId,
              itemId: item.id,
              source: "api",
            });
            if (pureAbort()) return;
          }
        }
        if (
          [QueueItem.STATE.COMPLETED, QueueItem.STATE.PARTIAL_FAIL].includes(
            item.state,
          ) &&
          item.resultTileIds?.length > 0
        ) {
          try {
            this._queue?._emitStateChanged?.();
          } catch (_) {}
          try {
            this._queue?._onTilesReady?.(item, item.resultTileIds);
          } catch (e) {
            console.warn(
              "[EditorExecutor] API auto-download enqueue fail:",
              e?.message,
            );
          }
        }
        if (
          item.state === QueueItem.STATE.PARTIAL_FAIL &&
          ["bot_detected", "captcha_failed"].includes(item.errorType) &&
          item._apiUnusualPartialHandled !== true
        ) {
          if (this._queue?._captchaRecoveryMode?.() !== "normal_error") {
            this._queue?._handleFlowError?.({
              category: "captcha",
              text: item.error,
              jobId: item.jobId,
              itemId: item.id,
              source: "api",
            });
            if (pureAbort()) return;
          }
        }
        if (this._onItemCompleted) this._onItemCompleted(item);
      })
      .catch(async (e) => {
        const normalized =
          window.FlowApiDriverError?.normalize?.(e, {
            driver:
              item.flowApiDriver ||
              item.flowApiCandidateDriver ||
              selectedDriver,
            operationId: item.operationId || item.flowOperationId || null,
            dispatchStarted:
              item.flowApiAccepted === true || e?.dispatchStarted === true,
          }) || e;
        const flowApiFailureDiagnostic = {
          message:
            normalized?.message || String(normalized || "FLOW_API_FAILED"),
          code: normalized?.code || null,
          grpcCode: Number.isInteger(normalized?.grpcCode)
            ? normalized.grpcCode
            : null,
          grpcReason: normalized?.grpcReason || null,
          providerErrorCodes: normalized?.providerErrorCodes || [],
          stage: normalized?.stage || null,
          diagnostic: normalized?.diagnostic || null,
          failureDetails: normalized?.failureDetails || [],
        };
        console.info(
          "[EditorExecutor/FlowApiFailure]",
          JSON.stringify(flowApiFailureDiagnostic),
        );
        if (pureAbort()) {
          item.state = QueueItem.STATE.CANCELLED;
          item._apiWaitingSlot = false;
          return;
        }
        item.error =
          window.FlowApiDriverError?.displayMessage?.(normalized) ||
          normalized?.code ||
          normalized?.message ||
          "API_FAILED";
        item.errorType = normalized?.errorType || "unknown";
        item.errorPolicy = {
          code: normalized?.code || null,
          grpcCode: normalized?.grpcCode ?? null,
          grpcReason: normalized?.grpcReason || null,
          providerErrorCodes: normalized?.providerErrorCodes || [],
          driver: normalized?.driver || selectedDriver,
          failureDetails: normalized?.failureDetails || [],
          stage: normalized?.stage || "pre_dispatch",
          dispatchStarted: normalized?.dispatchStarted === true,
          ambiguous: normalized?.ambiguous === true,
          operationId: normalized?.operationId || null,
          retryable: normalized?.retryable === true,
          lineageCheck:
            window.FlowApiDriverError?.safeLineageCheck?.(normalized) || null,
          ...window.FlowApiDriverError?.safeLineageReference?.(normalized),
        };
        if (this._queue?._settleConfirmedApiUnusualActivity?.(item, normalized))
          return;
        if (
          (normalized?.driver !== "v2" && normalized?.stage === "terminal") ||
          ["quota_exceeded", "per_model_daily", "tier_restricted"].includes(
            item.errorType,
          ) ||
          ["PROMPT_TOO_LONG", "INVALID_V2_REFERENCES"].includes(
            normalized?.code,
          )
        ) {
          item.noRetry = true;
          item.errorPolicy.retryable = false;
        }
        if (this._queue?._deferSafeApiPreDispatchItem?.(item, normalized))
          return;
        if (
          ["bot_detected", "captcha_failed"].includes(item.errorType) &&
          !["ambiguous", "accepted_poll"].includes(normalized?.stage) &&
          (normalized?.stage === "terminal" || !normalized?.operationId) &&
          this._queue?._recoverApiUnusualActivityItem?.(item, normalized)
        )
          return;
        if (
          ["bot_detected", "captcha_failed"].includes(item.errorType) &&
          !["ambiguous", "accepted_poll"].includes(normalized?.stage) &&
          (normalized?.stage === "terminal" || !normalized?.operationId) &&
          this._queue?._holdApiItemForManualResume?.(item)
        )
          return;
        if (
          ["bot_detected", "captcha_failed"].includes(item.errorType) &&
          !["ambiguous", "accepted_poll"].includes(normalized?.stage) &&
          (normalized?.stage === "terminal" || !normalized?.operationId)
        ) {
          if (this._queue?._retryApiCaptchaAsNormal?.(item)) return;
          if (this._queue?._captchaRecoveryMode?.() !== "normal_error") {
            this._queue?._handleFlowError?.({
              category: "captcha",
              text: item.error,
              jobId: item.jobId,
              itemId: item.id,
              source: "api",
            });
            if (pureAbort()) return;
          }
        }
        if (this._queue?._retryApiNormalFailureAtBatchTail?.(item, normalized))
          return;
        if (
          normalized?.driver === "v2" &&
          ["receipt", "terminal"].includes(normalized?.stage)
        ) {
          item.noRetry = true;
          item.errorPolicy.retryable = false;
        }
        if (
          normalized?.driver === "v2" &&
          normalized?.retryable === true &&
          normalized?.stage === "pre_dispatch"
        ) {
          if (this._queue?._holdApiItemForManualResume?.(item)) return;
          if (this._queue?._recoverApiPreDispatchItem?.(item, normalized))
            return;
        }
        if (normalized?.stage === "accepted_poll") {
          item.recoveryLabel = null;
          item.recoveryPhase = null;
          item.recoveryCode = null;
          item.recoveryAttempt = 0;
          item.recoveryMaxAttempts = 0;
          item.state = QueueItem.STATE.FAILED;
          item.completedAt = Date.now();
          item.noRetry = true;
          item._apiWaitingSlot = false;
          item.auditLifecycle?.("api_poll_exhausted", {
            recoveryStage: "accepted_poll",
            operationId: normalized.operationId
              ? String(normalized.operationId).slice(0, 8)
              : null,
            action: "terminal_fail_no_automatic_resubmit",
          });
          const operationIds = new Set(
            [
              normalized.operationId,
              item.operationId,
              item.flowOperationId,
              ...(item.flowApiLineage || []).map((entry) => entry?.operationId),
            ].filter(Boolean),
          );
          await Promise.allSettled(
            [...operationIds].map((operationId) =>
              window.FlowApiV2CheckpointStore?.remove?.(operationId),
            ),
          );
          try {
            this._queue?._emitStateChanged?.();
          } catch (_) {}
          if (this._onItemCompleted) this._onItemCompleted(item);
          return;
        }
        if (normalized?.stage === "ambiguous") {
          item.recoveryLabel = null;
          item.recoveryPhase = null;
          item.recoveryCode = null;
          item.recoveryAttempt = 0;
          item.recoveryMaxAttempts = 0;
          item.state = QueueItem.STATE.RECOVERY_REQUIRED;
          item.completedAt = null;
          item._apiWaitingSlot = false;
          item.auditLifecycle?.("api_recovery_required", {
            recoveryStage: normalized.stage,
            ambiguous: normalized.ambiguous === true,
            operationId: normalized.operationId
              ? String(normalized.operationId).slice(0, 8)
              : null,
          });
          item.auditLifecycle?.("queue_recovery_decision", {
            recoveryStage: normalized.stage,
            ambiguous: normalized.ambiguous === true,
            action:
              normalized.stage === "accepted_poll"
                ? "resume_poll"
                : "wait_user",
            operationId: normalized.operationId
              ? String(normalized.operationId).slice(0, 8)
              : null,
          });
          if (
            this._queue?.getJob?.(item.jobId)?.owner !== "workflow" &&
            !normalized.operationId &&
            !item.operationId &&
            !item.flowOperationId &&
            (!item.flowApiAccepted || normalized.code === "REQUEST_TIMEOUT") &&
            !(item.flowApiLineage || []).some((entry) => entry?.operationId)
          ) {
            item.state = QueueItem.STATE.FAILED;
            item.completedAt = Date.now();
            item.noRetry = true;
            item.recoveryExhausted = true;
            item.errorPolicy.retryable = false;
            item.auditLifecycle?.("api_ambiguous_local_settled", {
              action: "settle_local_unverified_no_resubmit",
              reason: normalized.code || item.error,
            });
            if (this._onItemCompleted) this._onItemCompleted(item);
            return;
          }
          try {
            this._queue?._emitStateChanged?.();
          } catch (_) {}
          this._queue?._holdAmbiguousApiWorkflow?.(item);
          this._queue?._ensureRunning?.();
          return;
        }
        if (!item.isTerminal) {
          item.state = QueueItem.STATE.FAILED;
          item.completedAt = Date.now();
        }
        if (item.state !== QueueItem.STATE.CANCELLED && this._onItemCompleted)
          this._onItemCompleted(item);
      });
    item._flowApiSubmitPromise = flowApiSubmitPromise;
    flowApiSubmitPromise.then(
      () => {
        if (item._flowApiSubmitPromise === flowApiSubmitPromise)
          item._flowApiSubmitPromise = null;
      },
      () => {
        if (item._flowApiSubmitPromise === flowApiSubmitPromise)
          item._flowApiSubmitPromise = null;
      },
    );
    return true;
  }
  async _prepareApiUploadedRefsForWeb(item, job) {
    const ids = Array.isArray(item?.refFileIds)
      ? item.refFileIds.filter(Boolean)
      : [];
    if (ids.length === 0 || !window.MessageBridge?.checkFilesExist) return;
    const isUuid = (value) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        String(value || "").trim(),
      );
    const records =
      item.refThumbnails && typeof item.refThumbnails === "object"
        ? item.refThumbnails
        : {};
    const apiRefs = ids
      .map((id) => {
        const directName = item.refFileNames?.[id];
        let record = records[id];
        if (!record || typeof record !== "object") {
          const matches = Object.entries(records).filter(
            ([key, value]) =>
              value &&
              typeof value === "object" &&
              ["v1", "v2"].includes(value.api_driver) &&
              [key, value.media_uuid].some(
                (candidate) =>
                  candidate && [id, directName].includes(candidate),
              ),
          );
          if (matches.length === 1) record = matches[0][1];
        }
        const explicitApiUpload =
          record &&
          typeof record === "object" &&
          ["v1", "v2"].includes(record.api_driver);
        const legacyApiUuid =
          isUuid(id) &&
          isUuid(directName) &&
          id.toLowerCase() === directName.toLowerCase();
        if (!explicitApiUpload && !legacyApiUuid) return null;
        const aliases = [
          ...new Set(
            [
              record?.persistent_media_id,
              record?.file_name,
              ...(Array.isArray(record?.identity_aliases)
                ? record.identity_aliases
                : []),
              directName,
              record?.media_uuid,
              id,
            ]
              .map((value) => String(value || "").trim())
              .filter(Boolean),
          ),
        ];
        if (!aliases.some(isUuid)) return null;
        return { id, names: aliases, scanName: aliases[0] };
      })
      .filter(Boolean);
    if (apiRefs.length === 0) return;
    const check = async () => {
      const response = await window.MessageBridge.checkFilesExist([
        ...new Set(apiRefs.flatMap((ref) => ref.names)),
      ]);
      return response?.found || {};
    };
    const resolvedName = (ref, found2) =>
      ref.names.find((name) =>
        Object.prototype.hasOwnProperty.call(found2 || {}, name),
      );
    let found = {};
    try {
      found = await check();
    } catch (_) {
      return;
    }
    let missing = apiRefs.filter((ref) => !resolvedName(ref, found));
    if (missing.length > 0 && window.MessageBridge?.sendToContentScript) {
      try {
        const scan = await window.MessageBridge.sendToContentScript(
          "ensureFlowTilesLoaded",
          {
            targetFileNames: missing.map((ref) => ref.scanName),
            purpose: "identity",
          },
        );
        if (
          scan?.success === true &&
          scan.found &&
          typeof scan.found === "object"
        ) {
          found = { ...found, ...scan.found };
          missing = apiRefs.filter((ref) => !resolvedName(ref, found));
        }
      } catch (_) {}
    }
    if (missing.length === 0) {
      this._applyWorkflowWebRefTiles(item, apiRefs, found);
      return;
    }
    const owner = job?.owner || item?._owner || "prompts";
    const workflowExecutor =
      owner === "workflow" ? window.workflowExecutor : null;
    if (
      workflowExecutor?._apiBoardReloaded !== true &&
      job?._apiRefBoardReloaded !== true
    ) {
      console.info(
        "[FlowApiUploadWebFallback] API-uploaded refs absent from DOM; one-shot refresh",
        { itemId: item.id, owner, missing: missing.length },
      );
      const reloaded = await this._queue?.forceReloadAndStabilize?.(
        `${owner}-api-upload-ref-refresh`,
        {
          bypassSuppress: true,
          scope: owner,
          workflowId: owner === "workflow" ? job?.workflowId || null : null,
          settledIdentityRefresh: true,
          preDispatchRefSync: true,
          expectedEditorItemId: item.id,
        },
      );
      if (reloaded) {
        if (job) job._apiRefBoardReloaded = true;
        if (workflowExecutor) workflowExecutor._apiBoardReloaded = true;
        try {
          const postReloadScan =
            await window.MessageBridge.sendToContentScript?.(
              "ensureFlowTilesLoaded",
              {
                targetFileNames: missing.map((ref) => ref.scanName),
                purpose: "identity",
              },
            );
          const postReloadDom = await check();
          found = {
            ...(postReloadScan?.success === true &&
            postReloadScan.found &&
            typeof postReloadScan.found === "object"
              ? postReloadScan.found
              : {}),
            ...postReloadDom,
          };
        } catch (_) {}
      }
    }
    this._applyWorkflowWebRefTiles(item, apiRefs, found);
    missing = apiRefs.filter((ref) => !resolvedName(ref, found));
    console.info("[FlowApiUploadWebFallback] materialization result", {
      itemId: item.id,
      owner,
      resolved: apiRefs.length - missing.length,
      missing: missing.length,
      reloaded:
        job?._apiRefBoardReloaded === true ||
        workflowExecutor?._apiBoardReloaded === true,
    });
  }
  async _prepareApiUploadedRefsForWorkflowWeb(item, job) {
    if (job && !job.owner) job.owner = "workflow";
    return this._prepareApiUploadedRefsForWeb(item, job);
  }
  async _reloadAndRetryReferenceAttachment(
    item,
    job,
    { requested = 0, attached = 0, failed = 0 } = {},
  ) {
    if (
      !item ||
      item._referenceAttachReloadAttempted === true ||
      this._shouldAbortItem(item)
    )
      return false;
    item._referenceAttachReloadAttempted = true;
    const owner = job?.owner || item._owner || "prompts";
    const reloaded = await this._queue?.forceReloadAndStabilize?.(
      "reference-attach-recovery",
      {
        bypassSuppress: true,
        scope: owner,
        workflowId: owner === "workflow" ? job?.workflowId || null : null,
        preDispatchReferenceAttachRecovery: true,
        expectedEditorItemId: item.id,
      },
    );
    item.auditLifecycle?.("presubmit_stage", {
      stage: "reference_attach_reload_recovery",
      requested,
      attached,
      failed,
      success: reloaded === true,
    });
    if (reloaded !== true || this._shouldAbortItem(item)) return false;
    console.warn(
      "[EditorExecutor] Flow reference attach failed; page reloaded, retrying the complete pre-submit sequence once",
      { itemId: item.id, owner, requested, attached, failed },
    );
    return true;
  }
  _offerMaxSpeedForWebReferenceAttachFailure(item, job) {
    if (
      job?.owner !== "prompts" ||
      item?.genMode !== "web" ||
      typeof window.showUpgradeMaxSpeedIntro !== "function"
    )
      return false;
    console.info(
      "[EditorExecutor] offering Max Speed after terminal Web reference attach failure",
      { itemId: item.id, jobId: job.id || null },
    );
    window.showUpgradeMaxSpeedIntro();
    return true;
  }
  _applyWorkflowWebRefTiles(item, apiRefs, found) {
    const replacements = new Map(
      apiRefs.flatMap((ref) => {
        const matched = ref.names.find((name) =>
          Object.prototype.hasOwnProperty.call(found || {}, name),
        );
        return matched ? [[ref.id, found[matched]]] : [];
      }),
    );
    if (replacements.size === 0) return;
    item.refFileIds = (item.refFileIds || []).map(
      (id) => replacements.get(id) || id,
    );
    for (const field of ["refFileNames", "refThumbnails"]) {
      const source = item[field];
      if (!source || typeof source !== "object" || Array.isArray(source))
        continue;
      const remapped = {};
      for (const [id, value] of Object.entries(source))
        remapped[replacements.get(id) || id] = value;
      item[field] = remapped;
    }
  }
  async _recoverTimedOutWebRefs(
    item,
    job,
    result,
    fileNameMap,
    mediaTypeMap,
    identityMap,
  ) {
    const timedOut = [...new Set(result?.timedOutIds || [])];
    if (!timedOut.length) return result;
    const aborted = () =>
      this._shouldStop ||
      job?.state === "stopped" ||
      item.state === QueueItem.STATE.CANCELLED;
    const fail = (code) =>
      Object.assign(new Error(code), { code, noRetry: true });
    const assertActive = () => {
      if (aborted()) throw fail("ABORTED");
    };
    assertActive();
    if (typeof window.reuploadMissingFiles !== "function")
      throw fail("FLOW_REF_RECOVERY_UNAVAILABLE");
    item._refScanRecoveryAttempted ||
      (item._refScanRecoveryAttempted = new Set());
    const recoveredIds = [];
    for (const oldId of timedOut) {
      assertActive();
      if (item._refScanRecoveryAttempted.has(oldId))
        throw fail("FLOW_REF_RECOVERY_EXHAUSTED");
      item._refScanRecoveryAttempted.add(oldId);
      const uploaded = await window.reuploadMissingFiles(
        oldId,
        item.refThumbnails || {},
        null,
        item.refFileNames || {},
        {
          surface: job?.owner || "gen",
          forceDom: true,
          forceReuploadIds: [oldId],
          mediaTypeMap,
          abortFn: aborted,
        },
      );
      assertActive();
      const newIds = String(uploaded || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      if (newIds.length !== 1 || newIds[0] === oldId)
        throw fail("FLOW_REF_RECOVERY_UPLOAD_FAILED");
      const newId = newIds[0];
      const receipt = {
        ...(window.MediaRegistry?.getRefIdentity?.(newId) || {}),
        ...(window._lastReuploadTileDetails?.[newId] || {}),
      };
      const uuid = [
        receipt.media_uuid,
        receipt.file_id,
        receipt.file_name,
        newId,
      ].find((value) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          String(value || ""),
        ),
      );
      if (!uuid) throw fail("FLOW_REF_RECOVERY_UUID_MISSING");
      const type = mediaTypeMap[oldId] === "video" ? "video" : "image";
      if (receipt.type && receipt.type !== type)
        throw fail("FLOW_REF_RECOVERY_TYPE_MISMATCH");
      const info = {
        ...receipt,
        media_uuid: uuid,
        type,
        file_name: receipt.file_name || uuid,
        thumbnail: receipt.thumbnailUrl || receipt.thumbnail || null,
        identity_aliases: [
          ...new Set(
            [newId, uuid, receipt.persistent_media_id].filter(Boolean),
          ),
        ],
      };
      const remap = (target) => {
        if (!target?.refFileIds?.includes(oldId)) return;
        target.refFileIds = target.refFileIds.map((id) =>
          id === oldId ? newId : id,
        );
        target._mappedRefFileIds = target._mappedRefFileIds?.map((id) =>
          id === oldId ? newId : id,
        );
        target.refFileNames = {
          ...(target.refFileNames || {}),
          [newId]: info.file_name,
        };
        delete target.refFileNames[oldId];
        target.refThumbnails = {
          ...(target.refThumbnails || {}),
          [newId]: info,
        };
        delete target.refThumbnails[oldId];
        if (target.settings?.refVideoIds)
          target.settings = {
            ...target.settings,
            refVideoIds: target.settings.refVideoIds.map((id) =>
              id === oldId ? newId : id,
            ),
          };
        if (target.mentionData?.refImages)
          target.mentionData = {
            ...target.mentionData,
            refImages: target.mentionData.refImages.map((ref) =>
              ref.file_id === oldId || ref.id === oldId
                ? { ...ref, ...info, file_id: newId, id: newId }
                : ref,
            ),
          };
      };
      remap(item);
      for (const sibling of job?.items || [])
        if (
          !sibling.isTerminal &&
          ![QueueItem.STATE.SUBMITTED, QueueItem.STATE.MONITORING].includes(
            sibling.state,
          )
        )
          remap(sibling);
      item._refScanRecoveryAttempted.add(newId);
      fileNameMap[newId] = info.file_name;
      mediaTypeMap[newId] = type;
      identityMap[newId] = type === "video" ? null : uuid;
      await job?._onRefReuploaded?.({ oldId, newId, info });
      assertActive();
      recoveredIds.push(newId);
      console.info("[FlowRefScanRecovery] replaced ref after scan deadline", {
        itemId: item.id,
        mediaType: type,
        recovered: recoveredIds.length,
      });
    }
    const attached = await MessageBridge.addRefImages(
      recoveredIds,
      fileNameMap,
      mediaTypeMap,
      identityMap,
      { abortFn: aborted },
    );
    assertActive();
    if (attached?.success !== true)
      throw fail("FLOW_REF_RECOVERY_ATTACH_FAILED");
    const failedIds = (result.failedIds || []).filter(
      (id) => !timedOut.includes(id),
    );
    return {
      ...result,
      success: failedIds.length === 0,
      failedIds,
      timedOutIds: [],
      addedCount: (result.addedCount || 0) + (attached.addedCount || 0),
    };
  }
  async _processItem(item) {
    console.info(
      "[FlowRunMemory] editor item entered",
      JSON.stringify({
        promptIndex: item?.promptIndex ?? null,
        ...MessageBridge._flowPerfMemorySnapshot(),
      }),
    );
    const job = this._queue?.getJob(item.jobId);
    if (!job || job.state === "stopped") {
      item.state = QueueItem.STATE.CANCELLED;
      return;
    }
    const pauseStart = Date.now();
    const MAX_PAUSE_WAIT = 3e5;
    while (
      job.state === "paused" &&
      !this._shouldStop &&
      Date.now() - pauseStart < MAX_PAUSE_WAIT
    ) {
      await this._sleep(200);
    }
    if (this._shouldStop || job.state === "stopped") {
      item.state = QueueItem.STATE.CANCELLED;
      return;
    }
    if (job.state === "paused") {
      item.state = QueueItem.STATE.PENDING;
      this._queue?.enqueue(item);
      return;
    }
    this._currentItem = item;
    MessageBridge.beginExecutionTarget?.(item.id);
    try {
      if (!item._phaseR && (await this._tryFlowApiSubmit(item))) return;
      console.info(
        "[FlowApiWebTransition]",
        JSON.stringify({
          itemId: item.id,
          jobId: item.jobId,
          engineLock:
            this._queue?.getJob?.(item.jobId)?._flowApiEngineLock || null,
          reason:
            this._queue?.getJob?.(item.jobId)?._flowApiWebReason ||
            item._flowApiPreflightReason ||
            "WEB_PATH_WITHOUT_API_DECISION",
          forceWebChain: item._forceWebChain === true,
          apiEligible: this._isFlowApiMode(item),
          workflowApiEnabled:
            window.ExecutionConfig?.getWorkflowFlowApiEnabled?.() === true,
          settings: {
            apiModeEnabled:
              window.storageSettings?.getSettings?.()?.apiModeEnabled ?? null,
            genMode:
              window.storageSettings?.getSettings?.()?.defaultGenMode ||
              window.storageSettings?.getSettings?.()?.gen_mode ||
              null,
          },
        }),
      );
      if (
        this._shouldStop ||
        job.state === "stopped" ||
        item.state === QueueItem.STATE.CANCELLED
      ) {
        item.state = QueueItem.STATE.CANCELLED;
        return;
      }
      const runtimeJob = this._queue?.getJob?.(item.jobId);
      if (runtimeJob?._flowApiEngineLock === "api") {
        item.state = QueueItem.STATE.FAILED;
        item.errorType = "server_unavailable";
        item.error = "FLOW_API_JOB_LOCKED";
        item.completedAt = Date.now();
        this._queue?._onItemCompleted?.(item);
        console.error(
          "[FlowApiRouting/BatchModeConflict] blocked DOM boundary for API-locked job",
          item.jobId,
        );
        return;
      }
      if (runtimeJob && !runtimeJob._flowApiEngineLock) {
        const committed =
          typeof this._queue?._commitFlowJobRoute === "function"
            ? this._queue._commitFlowJobRoute(
                runtimeJob,
                "web",
                item._flowApiPreflightReason || "WEB_PATH_WITHOUT_API_DECISION",
              )
            : (() => {
                runtimeJob._flowApiEngineLock = "web";
                runtimeJob._flowApiRouteReason ||
                  (runtimeJob._flowApiRouteReason =
                    item._flowApiPreflightReason ||
                    "WEB_PATH_WITHOUT_API_DECISION");
                return true;
              })();
        if (!committed) {
          item.state = QueueItem.STATE.FAILED;
          item.errorType = "server_unavailable";
          item.error = "FLOW_API_BATCH_MODE_CONFLICT";
          item.completedAt = Date.now();
          this._queue?._onItemCompleted?.(item);
          return;
        }
      }
      if (runtimeJob?.singleNodeSession) {
        await window.workflowExecutor?._singleNodeSession?.enterFlowWeb(
          runtimeJob.workflowNodeId,
          () =>
            this._shouldStop ||
            job.state === "stopped" ||
            item.state === QueueItem.STATE.CANCELLED,
        );
      }
      await job._onBeforeWorkflowItemStart?.(item);
      if (
        this._shouldStop ||
        job.state === "stopped" ||
        item.state === QueueItem.STATE.CANCELLED
      ) {
        item.state = QueueItem.STATE.CANCELLED;
        return;
      }
      item.genMode = "web";
      const downloadsCleared = await this._queue?.waitForDownloadsEmpty?.(3e4, {
        activeOnly: true,
      });
      if (downloadsCleared === false) {
        console.warn(
          "[EditorExecutor] Web submit continuing after active download wait timeout",
        );
      }
      try {
        console.log(
          "[EditorExecutor] Step 0: prepare Flow editor (viewer Back, close Agent sidebar, Agent OFF)",
        );
        const prepResult = await MessageBridge.prepareFlowForGen();
        if (prepResult?.success === false) {
          throw new Error(prepResult.error || "FLOW_PREPARE_FAILED");
        }
        if (prepResult?.actioned) {
          console.log(
            `[EditorExecutor] Step 0 actioned (editor ready in ${prepResult.editorReadyMs || 0}ms)`,
          );
        }
      } catch (e) {
        console.error(
          "[EditorExecutor] Step 0 prepareFlowForGen failed:",
          e.message,
        );
        throw e;
      }
      const webContext = await this._queue?._ensureFlowTabActive?.();
      if (
        !webContext?.tabId ||
        webContext.driverKey !== "flow_v2" ||
        !webContext.projectId ||
        webContext.isProjectEditor !== true
      ) {
        const error = new Error("FLOW_PROJECT_REQUIRED");
        error.noRetry = true;
        throw error;
      }
      if (webContext.ready !== true) {
        throw new Error(webContext.error || "FLOW_CONTENT_NOT_READY");
      }
      if (item.projectId && item.projectId !== webContext.projectId) {
        const error = new Error("FLOW_PROJECT_MISMATCH");
        error.noRetry = true;
        throw error;
      }
      runtimeJob.flowTabId = webContext.tabId;
      item._flowDriverKey = "flow_v2";
      runtimeJob.flowDriverKey = "flow_v2";
      item.projectId = webContext.projectId;
      runtimeJob.projectId || (runtimeJob.projectId = webContext.projectId);
      const webCorrelationCapability =
        window.flowV2CorrelationBroker?.itemCapability?.(item) || null;
      if (
        runtimeJob.totalExpected > 1 &&
        runtimeJob.sequentialMode !== true &&
        webCorrelationCapability?.parallel !== true
      ) {
        runtimeJob.sequentialMode = true;
        runtimeJob.forcedV2WebSequential = true;
        console.info(
          "[EditorExecutor] Flow API kh\xF4ng kh\u1EA3 d\u1EE5ng, fallback Flow V2 DOM \u2192 chuy\u1EC3n batch sang sequential \u0111\u1EC3 gi\u1EEF \u0111\xFAng correlation",
        );
        try {
          if (typeof sendLog === "function") {
            sendLog(
              "Flow API kh\xF4ng kh\u1EA3 d\u1EE5ng; batch Flow V2 ti\u1EBFp t\u1EE5c b\u1EB1ng Web tu\u1EA7n t\u1EF1 \u0111\u1EC3 tr\xE1nh gh\xE9p nh\u1EA7m k\u1EBFt qu\u1EA3.",
              "warn",
            );
          }
        } catch (_) {}
      }
      const replacements =
        runtimeJob?.owner === "workflow" &&
        runtimeJob.workflowRunId === window.workflowExecutor?._flowRunId
          ? window.workflowExecutor?._webRefReplacements
          : null;
      for (const [oldId, replacement] of replacements || []) {
        if (!item.refFileIds?.includes(oldId)) continue;
        const { newId, info } = replacement;
        item.refFileIds = item.refFileIds.map((id) =>
          id === oldId ? newId : id,
        );
        item._mappedRefFileIds = item._mappedRefFileIds?.map((id) =>
          id === oldId ? newId : id,
        );
        if (item.mentionData?.refImages)
          item.mentionData = {
            ...item.mentionData,
            refImages: item.mentionData.refImages.map((ref) =>
              ref.file_id === oldId || ref.id === oldId
                ? { ...ref, ...info, file_id: newId, id: newId }
                : ref,
            ),
          };
        item.refFileNames = {
          ...(item.refFileNames || {}),
          [newId]: info.file_name,
        };
        item.refThumbnails = { ...(item.refThumbnails || {}), [newId]: info };
        delete item.refFileNames[oldId];
        delete item.refThumbnails[oldId];
        if (item.settings?.refVideoIds)
          item.settings = {
            ...item.settings,
            refVideoIds: item.settings.refVideoIds.map((id) =>
              id === oldId ? newId : id,
            ),
          };
      }
      await this._prepareApiUploadedRefsForWeb(item, runtimeJob);
      await this._queue._webRecovery?.prepare(item);
      try {
        await MessageBridge.sendToContentScript("pq:showBlocker", {
          blockerRunId:
            runtimeJob?._blockerRunId || this._queue?._blockerRunId || null,
        });
      } catch (_) {}
      try {
        await MessageBridge.sendToContentScript("beginFlowZoomSession", {
          factor: 0.3,
        });
      } catch (_) {}
      try {
        const _actRes = await new Promise((r) =>
          chrome.runtime.sendMessage(
            {
              action: "activateFlowTabForExecution",
              tabId: window._targetFlowTabId || null,
            },
            (res) => r(res),
          ),
        );
        console.log(
          `[EditorExecutor] anti-bot: assert Flow active-tab per-prompt \u2192 ${_actRes?.ok ? `ok (tab ${_actRes.tabId})` : "no Flow tab / skip"}`,
        );
      } catch (_) {}
      if (
        item._phaseR &&
        item._flowDriverKey === "flow_v2" &&
        !item._requireFlowApiChain
      ) {
        const observerStarted = Date.now();
        const observerTimeoutMs = Number(
          window.flowV2CorrelationBroker?._config?.()?.observer_ack_timeout_ms,
        );
        let observer =
          await MessageBridge.ensureFlowCorrelationObserver(observerTimeoutMs);
        if (observer?.error === "FLOW_RECOVERY_OBSERVER_UNAVAILABLE") {
          observer =
            await MessageBridge.ensureFlowCorrelationObserver(
              observerTimeoutMs,
            );
        }
        item.auditLifecycle?.("presubmit_stage", {
          stage: "observer_preflight",
          elapsedMs: Date.now() - observerStarted,
          success: observer?.success === true,
          tabId: observer?.tabId ?? null,
          error: observer?.error || null,
          observerRevision: observer?.observerRevision ?? null,
          activeAttempts: observer?.activeAttempts ?? null,
          observerReady: observer?.ready ?? null,
          xhrHookActive: observer?.xhrHookActive === true,
          fetchHookActive: observer?.fetchHookActive === true,
        });
        if (!observer?.success)
          throw new Error(
            observer?.error || "FLOW_RECOVERY_OBSERVER_UNAVAILABLE",
          );
      }
      if (item.settings?.manualSubmitMode) {
        try {
          await MessageBridge.sendToContentScript("pq:showBlocker", {
            blockerRunId:
              runtimeJob?._blockerRunId || this._queue?._blockerRunId || null,
          });
        } catch (_) {}
      }
      if (this._shouldAbortItem(item)) return;
      if (this._shouldAbortItem(item)) return;
      console.log(
        `[EditorExecutor] Step 1: clear all prompt chips (ref + character + voice)`,
      );
      await MessageBridge.removeExistingRefImages();
      await this._sleep(200);
      await this._applyWebSettingsBeforeRefs(item);
      if (this._shouldAbortItem(item)) return;
      const clearStartedAt = Date.now();
      console.info("[EditorExecutor] Step 1.3: clearEditor before references");
      const clearResult = await MessageBridge.clearEditor();
      const clearBridgeMs = Date.now() - clearStartedAt;
      const clearDelayMs = this._getClearEditorDelay();
      console.info(
        "[EditorExecutor] Step 1.3: clearEditor response",
        JSON.stringify({
          success: clearResult?.success === true,
          alreadyEmpty: clearResult?.alreadyEmpty === true,
          bridgeMs: clearBridgeMs,
          settleMs: clearDelayMs,
          inputTimeoutMs: this._cachedInputTimeout,
        }),
      );
      if (clearResult?.success !== true)
        console.warn(
          "[EditorExecutor] Step 1.3: clearEditor not confirmed",
          clearResult?.error || null,
        );
      await this._sleep(clearDelayMs);
      if (this._shouldAbortItem(item)) return;
      const _isVidItem = /video/i.test(item?.settings?.genType || "");
      const _isFramesItem = _isVidItem && item?.settings?.isFrames === true;
      delete item._flowInlineParts;
      let _effectivePrompt = item.prompt || "";
      let _components = _isFramesItem
        ? []
        : window.MentionParser?.parseComponents?.(_effectivePrompt) || [];
      if (
        _components.length > 0 &&
        !_isVidItem &&
        _components.some((c) => c.type === "voice")
      ) {
        const _nVoice = _components.filter((c) => c.type === "voice").length;
        console.warn(
          `[EditorExecutor] ${_nVoice} @voice: mention trong prompt gen \u1EA2NH \u2014 voice l\xE0 video-only \u2192 strip`,
        );
        _effectivePrompt = window.MentionParser.stripComponents(
          _effectivePrompt,
          ["voice"],
        );
        _components = window.MentionParser.parseComponents(_effectivePrompt);
      }
      const _inlineMode = _components.length > 0;
      const _segments = _inlineMode
        ? window.MentionParser.splitByComponents(_effectivePrompt)
        : null;
      const rcEditorStarted = Date.now();
      let _correlationPrompt = _effectivePrompt;
      const _hasVoiceMention = _components.some((c) => c.type === "voice");
      const _hasCharMention = _components.some((c) => c.type === "char");
      if (_inlineMode) {
        console.log(
          `[EditorExecutor] Inline mention mode: ${_components.length} mention, ${_segments.length} segment \u2014 skip single picker: voice=${_hasVoiceMention}, char=${_hasCharMention}`,
        );
      }
      const voicePayload =
        _isFramesItem || _hasVoiceMention ? null : item.settings?.voice;
      if (voicePayload && voicePayload.search_value) {
        const voiceKey = `${voicePayload.slug || voicePayload.search_value}`;
        if (!item._phaseR && this._lastVoiceKey === voiceKey + ":notfound") {
          console.log(
            `[EditorExecutor] Step 1.5: voice "${voiceKey}" \u0111\xE3 \u0111\xE1nh d\u1EA5u notfound \u2014 skip`,
          );
        } else {
          try {
            console.log(
              `[EditorExecutor] Step 1.5: selectFlowVoice \u2192 ${voicePayload.search_value}`,
            );
            const r = await MessageBridge.selectFlowVoice(voicePayload);
            if (r?.success !== true)
              console.warn(
                "[EditorExecutor] Voice unavailable \u2014 continue without voice",
              );
            if (r?.error === "voice_not_found") {
              console.warn(
                `[EditorExecutor] Voice "${voicePayload.search_value}" not found in Flow menu \u2014 submit without voice`,
              );
              this._lastVoiceKey = voiceKey + ":notfound";
            }
          } catch (e) {
            console.warn(
              `[EditorExecutor] selectFlowVoice failed (non-blocking):`,
              e.message,
            );
          }
        }
      }
      const characterPayload =
        _isFramesItem || _hasCharMention ? null : item.settings?.character;
      item._flowGlobalCharacterAttached = false;
      item._flowGlobalCharacterCount = 0;
      if (characterPayload && characterPayload.search_value) {
        const charKey = JSON.stringify(
          characterPayload.selections || [characterPayload],
        );
        if (!item._phaseR && this._lastCharacterKey === charKey + ":notfound") {
          console.log(
            `[EditorExecutor] Step 1.6: character "${charKey}" \u0111\xE3 \u0111\xE1nh d\u1EA5u notfound \u2014 skip`,
          );
        } else {
          try {
            console.log(
              `[EditorExecutor] Step 1.6: selectFlowCharacter \u2192 ${characterPayload.search_value}`,
            );
            const r = await MessageBridge.selectFlowCharacter(characterPayload);
            item._flowGlobalCharacterCount =
              Number(r?.selectedCount) || (r?.success === true ? 1 : 0);
            item._flowGlobalCharacterAttached =
              item._flowGlobalCharacterCount > 0;
            if (r?.success !== true)
              console.warn(
                "[EditorExecutor] Character unavailable \u2014 continue without character",
              );
            if (r?.error === "character_not_found") {
              console.warn(
                `[EditorExecutor] Character "${characterPayload.search_value}" not found in Flow menu \u2014 submit without character`,
              );
              if (
                !characterPayload.selections ||
                characterPayload.selections.length === 1
              )
                this._lastCharacterKey = charKey + ":notfound";
            }
          } catch (e) {
            console.warn(
              `[EditorExecutor] selectFlowCharacter failed (non-blocking):`,
              e.message,
            );
          }
        }
      }
      const expectedVideoRefIds = new Set(
        Array.isArray(item.settings?.refVideoIds)
          ? item.settings.refVideoIds.filter(Boolean)
          : [],
      );
      const videoRefIdentities = new Set(
        [...expectedVideoRefIds].map(
          (id) => window.FlowApiAdapter?._resolveRefUuid?.(item, id) || id,
        ),
      );
      const flowAdapter = window.ProviderRegistry?.get?.("flow");
      const isVideo = /video/i.test(item.settings?.genType || "");
      const isFrames = item.settings?.isFrames === true;
      const imageCap = flowAdapter?.getMaxRefImages?.({
        mode: isVideo ? "video" : "image",
        isFrames,
        modelValue: item.settings?.model,
      });
      const totalCap = flowAdapter?.getMaxRefImagesTotal?.(
        item.settings?.model,
      );
      const limits = [totalCap, ...(isFrames ? [2] : [])].filter(
        (value) => Number.isInteger(value) && value >= 0,
      );
      const refLimit = limits.length ? Math.min(...limits) : Infinity;
      const isVideoRef = (id) =>
        expectedVideoRefIds.has(id) ||
        videoRefIdentities.has(
          window.FlowApiAdapter?._resolveRefUuid?.(item, id) || id,
        );
      const originalRefs = item.refFileIds || [];
      const videos = originalRefs.filter(isVideoRef);
      const images = originalRefs.filter((id) => !isVideoRef(id));
      const videoCap = flowAdapter?.getMaxRefVideos?.(item.settings?.model);
      const cappedVideos = videos.slice(
        0,
        Number.isInteger(videoCap) && videoCap >= 0 ? Math.min(videoCap, 1) : 1,
      );
      const cappedImages =
        Number.isInteger(imageCap) && imageCap >= 0
          ? images.slice(0, imageCap)
          : images;
      const selected = new Set([...cappedVideos, ...cappedImages]);
      const seenRefs = new Set();
      const ordered = originalRefs.filter((id) => {
        if (!selected.has(id) || seenRefs.has(id)) return false;
        seenRefs.add(id);
        return true;
      });
      const cappedRefs =
        ordered.length > refLimit
          ? [...cappedVideos, ...cappedImages].slice(0, refLimit)
          : ordered;
      if (cappedRefs.length < originalRefs.length) {
        const dropped = originalRefs.length - cappedRefs.length;
        item.refFileIds = cappedRefs;
        console.warn(
          `[EditorExecutor] Model reference cap: using ${cappedRefs.length}, omitted ${dropped} extra reference(s)`,
        );
      }
      const refMediaTypeMap = Object.fromEntries(
        (item.refFileIds || [])
          .filter(Boolean)
          .map((id) => [
            id,
            expectedVideoRefIds.has(id) ||
            videoRefIdentities.has(
              window.FlowApiAdapter?._resolveRefUuid?.(item, id) || id,
            )
              ? "video"
              : "image",
          ]),
      );
      const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
      const thumbnailValues = Object.values(item.refThumbnails || {}).filter(
        (value) => value && typeof value === "object",
      );
      const metadataOwns = (metadata, value) => {
        const identities = [
          metadata?.file_id,
          metadata?.file_name,
          metadata?.media_uuid,
          metadata?.persistent_media_id,
          ...(Array.isArray(metadata?.identity_aliases)
            ? metadata.identity_aliases
            : []),
        ]
          .map((identity) => String(identity || ""))
          .filter(Boolean);
        return identities.includes(String(value || ""));
      };
      const refIdentityMap = Object.fromEntries(
        (item.refFileIds || [])
          .map((id) => {
            if (refMediaTypeMap[id] === "video") return [id, null];
            const knownName = item.refFileNames?.[id];
            const direct =
              item.refThumbnails?.[id] ||
              thumbnailValues.find(
                (metadata) =>
                  metadataOwns(metadata, id) ||
                  metadataOwns(metadata, knownName),
              ) ||
              {};
            const mention =
              item.mentionData?.refImages?.find?.(
                (ref) => ref?.file_id === id || ref?.id === id,
              ) || {};
            const aliases = [
              direct.media_uuid,
              mention.media_uuid,
              direct.file_name,
              direct.file_id,
              direct.persistent_media_id,
              mention.file_name,
              ...(Array.isArray(direct.identity_aliases)
                ? direct.identity_aliases
                : []),
              ...(Array.isArray(mention.identity_aliases)
                ? mention.identity_aliases
                : []),
              item.refFileNames?.[id],
              id,
            ];
            return [
              id,
              aliases.find((value) => uuidPattern.test(String(value || ""))) ||
                null,
            ];
          })
          .filter(([, identity]) => identity),
      );
      const countExpectedRefs = (refs) =>
        (refs || []).reduce(
          (counts, id) => {
            counts[refMediaTypeMap[id] === "video" ? "video" : "image"]++;
            return counts;
          },
          { image: 0, video: 0 },
        );
      if (item.refFileIds?.length > 0) {
        console.log(
          `[EditorExecutor] Step 2: addRefImages, refFileIds: ${item.refFileIds?.length || 0}`,
        );
        const fileNameMap = { ...(item.refFileNames || {}) };
        if (item.mentionData?.refImages) {
          for (const ref of item.mentionData.refImages) {
            if (ref.file_id && ref.file_name && !fileNameMap[ref.file_id]) {
              fileNameMap[ref.file_id] = ref.file_name;
            }
          }
        }
        console.log("[EditorExecutor] Step 2 media contract:", {
          imageRefIds: item.refFileIds.filter(
            (id) => refMediaTypeMap[id] !== "video",
          ),
          videoRefIds: item.refFileIds.filter(
            (id) => refMediaTypeMap[id] === "video",
          ),
        });
        let addResult = await MessageBridge.addRefImages(
          item.refFileIds,
          fileNameMap,
          refMediaTypeMap,
          refIdentityMap,
          {
            abortFn: () =>
              this._shouldStop ||
              job?.state === "stopped" ||
              item.state === QueueItem.STATE.CANCELLED,
          },
        );
        if (
          addResult?.aborted === true ||
          this._shouldStop ||
          job?.state === "stopped" ||
          item.state === QueueItem.STATE.CANCELLED
        ) {
          item.state = QueueItem.STATE.CANCELLED;
          return;
        }
        const recoverLateAttachmentAck = async (result) => {
          if (result?.success) return result;
          const requestedCounts = countExpectedRefs(item.refFileIds);
          for (let attempt = 0; attempt < 4; attempt++) {
            if (attempt) await this._sleep(100);
            const liveRefs = await MessageBridge.verifyRefAttachments().catch(
              () => null,
            );
            const exactLateAck =
              liveRefs?.success === true &&
              liveRefs.imageCount === requestedCounts.image &&
              liveRefs.videoCount === requestedCounts.video;
            if (!exactLateAck) continue;
            console.info(
              "[EditorExecutor] Step 2: recovered late reference chip acknowledgement",
              {
                requestedImages: requestedCounts.image,
                requestedVideos: requestedCounts.video,
                attempt: attempt + 1,
              },
            );
            return {
              ...result,
              success: true,
              failedIds: [],
              addedCount: item.refFileIds.length,
              recoveredLateAck: true,
            };
          }
          return result;
        };
        addResult = await recoverLateAttachmentAck(addResult);
        addResult = await this._recoverTimedOutWebRefs(
          item,
          job,
          addResult,
          fileNameMap,
          refMediaTypeMap,
          refIdentityMap,
        );
        if (
          !addResult?.success &&
          Array.isArray(addResult?.failedIds) &&
          addResult.failedIds.length > 0
        ) {
          console.info(
            `[EditorExecutor] Step 2: retry ${addResult.failedIds.length} failed ref(s) in-place`,
          );
          await this._sleep(300);
          let retryResult = await MessageBridge.addRefImages(
            addResult.failedIds,
            fileNameMap,
            refMediaTypeMap,
            refIdentityMap,
            {
              abortFn: () =>
                this._shouldStop ||
                job?.state === "stopped" ||
                item.state === QueueItem.STATE.CANCELLED,
            },
          );
          retryResult = await recoverLateAttachmentAck(retryResult);
          retryResult = await this._recoverTimedOutWebRefs(
            item,
            job,
            retryResult,
            fileNameMap,
            refMediaTypeMap,
            refIdentityMap,
          );
          if (
            retryResult?.aborted === true ||
            this._shouldStop ||
            job?.state === "stopped" ||
            item.state === QueueItem.STATE.CANCELLED
          ) {
            item.state = QueueItem.STATE.CANCELLED;
            return;
          }
          const retryFailed = Array.isArray(retryResult?.failedIds)
            ? retryResult.failedIds
            : addResult.failedIds;
          addResult = {
            ...addResult,
            success: retryResult?.success === true,
            failedIds: retryFailed,
            addedCount:
              (addResult.addedCount || 0) + (retryResult?.addedCount || 0),
          };
          addResult = await recoverLateAttachmentAck(addResult);
        }
        console.log("[EditorExecutor] Step 3 reference attachment:", {
          success: addResult?.success === true,
          requested: item.refFileIds.length,
          attached: addResult?.addedCount ?? null,
          failed: Array.isArray(addResult?.failedIds)
            ? addResult.failedIds.length
            : null,
          failedIds: addResult?.failedIds || [],
        });
        if (!addResult?.success) {
          const failed = new Set(addResult?.failedIds || []);
          const kept = item.refFileIds.filter((id) => !failed.has(id));
          const lostAllRequestedRefs =
            item.refFileIds.length > 0 && kept.length === 0;
          if (
            !failed.size ||
            lostAllRequestedRefs ||
            (item.settings?.isFrames === true &&
              kept.length !== item.refFileIds.length)
          ) {
            if (
              lostAllRequestedRefs &&
              (await this._reloadAndRetryReferenceAttachment(item, job, {
                requested: item.refFileIds.length,
                attached: kept.length,
                failed: failed.size,
              }))
            ) {
              return await this._processItem(item);
            }
            item.state = QueueItem.STATE.FAILED;
            item.error = lostAllRequestedRefs
              ? "FLOW_REFERENCE_ATTACH_FAILED: no selected reference was attached to the prompt"
              : `Could not add ${failed.size || "some"} required reference(s) to the prompt`;
            item.errorCode = lostAllRequestedRefs
              ? "FLOW_REFERENCE_ATTACH_FAILED"
              : "FLOW_REQUIRED_REFERENCE_ATTACH_FAILED";
            item.completedAt = Date.now();
            item.auditLifecycle?.("presubmit_failed", {
              stage: "reference_attach",
              requested: item.refFileIds.length,
              attached: kept.length,
              failed: failed.size,
              errorCode: item.errorCode,
            });
            this._queue?._notifyFlowError?.(item.error, "error");
            this._queue?._emitStateChanged?.();
            this._offerMaxSpeedForWebReferenceAttachFailure(item, job);
            if (item._phaseR) {
              throw Object.assign(new Error(item.error), {
                code: item.errorCode,
                noRetry: true,
              });
            }
            if (this._onItemCompleted) this._onItemCompleted(item);
            return;
          }
          item.refFileIds = kept;
          this._queue?._notifyFlowError?.(
            `${failed.size} reference(s) could not be attached; submitting with ${kept.length} available reference(s).`,
            "warning",
          );
          console.warn(
            "[EditorExecutor] Partial references attached; continuing submit",
            { kept: kept.length, dropped: failed.size },
          );
        }
        const expectedAfterAttach = countExpectedRefs(item.refFileIds);
        const attachedAfterAdd =
          await MessageBridge.verifyRefAttachments().catch(() => null);
        const attachmentMatches =
          attachedAfterAdd?.success === true &&
          attachedAfterAdd.imageCount === expectedAfterAttach.image &&
          attachedAfterAdd.videoCount === expectedAfterAttach.video;
        if (!attachmentMatches) {
          console.warn(
            "[EditorExecutor] Step 3: reference attachment drift after add; rebuilding composer once",
            {
              expectedImages: expectedAfterAttach.image,
              actualImages: attachedAfterAdd?.imageCount ?? null,
              expectedVideos: expectedAfterAttach.video,
              actualVideos: attachedAfterAdd?.videoCount ?? null,
            },
          );
          item.auditLifecycle?.("presubmit_stage", {
            stage: "reference_rebuild_started",
            expectedImages: expectedAfterAttach.image,
            actualImages: attachedAfterAdd?.imageCount ?? null,
            expectedVideos: expectedAfterAttach.video,
            actualVideos: attachedAfterAdd?.videoCount ?? null,
          });
          await MessageBridge.removeExistingRefImages();
          await this._sleep(200);
          if (voicePayload?.search_value) {
            const voiceRestore = await MessageBridge.selectFlowVoice(
              voicePayload,
            ).catch(() => null);
            if (voiceRestore?.success !== true)
              console.warn(
                "[EditorExecutor] Voice unavailable after reference rebuild",
              );
          }
          if (characterPayload?.search_value) {
            const characterRestore = await MessageBridge.selectFlowCharacter(
              characterPayload,
            ).catch(() => null);
            item._flowGlobalCharacterCount =
              Number(characterRestore?.selectedCount) ||
              (characterRestore?.success === true ? 1 : 0);
            item._flowGlobalCharacterAttached =
              item._flowGlobalCharacterCount > 0;
            if (!item._flowGlobalCharacterAttached)
              console.warn(
                "[EditorExecutor] Character unavailable after reference rebuild",
              );
          }
          let rebuilt =
            item.refFileIds.length > 0
              ? await MessageBridge.addRefImages(
                  item.refFileIds,
                  fileNameMap,
                  refMediaTypeMap,
                  refIdentityMap,
                  {
                    abortFn: () =>
                      this._shouldStop ||
                      job?.state === "stopped" ||
                      item.state === QueueItem.STATE.CANCELLED,
                  },
                )
              : { success: true, failedIds: [] };
          rebuilt = await this._recoverTimedOutWebRefs(
            item,
            job,
            rebuilt,
            fileNameMap,
            refMediaTypeMap,
            refIdentityMap,
          );
          const rebuiltRefs = await MessageBridge.verifyRefAttachments().catch(
            () => null,
          );
          const rebuildMatches =
            rebuilt?.success === true &&
            rebuiltRefs?.success === true &&
            rebuiltRefs.imageCount === expectedAfterAttach.image &&
            rebuiltRefs.videoCount === expectedAfterAttach.video;
          item.auditLifecycle?.("presubmit_stage", {
            stage: "reference_rebuild_result",
            expectedImages: expectedAfterAttach.image,
            actualImages: rebuiltRefs?.imageCount ?? null,
            expectedVideos: expectedAfterAttach.video,
            actualVideos: rebuiltRefs?.videoCount ?? null,
            success: rebuildMatches,
          });
          if (!rebuildMatches) {
            throw Object.assign(
              new Error(
                `FLOW_REFERENCE_ATTACHMENT_DRIFT:${rebuiltRefs?.imageCount ?? "?"}/${expectedAfterAttach.image},${rebuiltRefs?.videoCount ?? "?"}/${expectedAfterAttach.video}`,
              ),
              { code: "FLOW_REFERENCE_ATTACHMENT_DRIFT", noRetry: true },
            );
          }
          console.info(
            "[EditorExecutor] Step 3: reference attachment rebuild recovered exact composer contract",
          );
        }
      } else {
        console.log(
          `[EditorExecutor] Step 3: skip addRefImages (no refFileIds)`,
        );
      }
      if (this._shouldAbortItem(item)) return;
      if (_inlineMode) {
        console.log(
          `[EditorExecutor] Step 5: interleave ${_segments.length} segments (${_components.length} mention)`,
        );
        let segResult = await this._insertSegments(item, _segments);
        if (segResult.aborted) {
          try {
            await MessageBridge.clearEditor();
          } catch (_) {}
          return;
        }
        await this._sleep(this._getSubmitDelay());
        if (this._shouldAbortItem(item)) {
          try {
            await MessageBridge.clearEditor();
          } catch (_) {}
          return;
        }
        console.log(
          `[EditorExecutor] Step 6 (inline): verify text + chip inline`,
        );
        if (
          item._phaseR &&
          segResult.degraded > (segResult.verifiedGlobalChips || 0)
        )
          throw new Error("FLOW_RECOVERY_MENTION_INCOMPLETE");
        let verified = await this._verifyInlineInsert(segResult, _segments);
        if (!verified) {
          console.warn(
            "[EditorExecutor] Step 6 (inline): verify FAIL \u2192 retry segment loop (1 l\u1EA7n duy nh\u1EA5t)",
          );
          await MessageBridge.removeExistingRefImages();
          await MessageBridge.clearEditor();
          await this._sleep(this._getClearEditorDelay());
          if (item.refFileIds?.length > 0) {
            const fileNameMapRetry = { ...(item.refFileNames || {}) };
            if (item.mentionData?.refImages) {
              for (const ref of item.mentionData.refImages) {
                if (
                  ref.file_id &&
                  ref.file_name &&
                  !fileNameMapRetry[ref.file_id]
                ) {
                  fileNameMapRetry[ref.file_id] = ref.file_name;
                }
              }
            }
            let readd = await MessageBridge.addRefImages(
              item.refFileIds,
              fileNameMapRetry,
              refMediaTypeMap,
              refIdentityMap,
              {
                abortFn: () =>
                  this._shouldStop ||
                  job?.state === "stopped" ||
                  item.state === QueueItem.STATE.CANCELLED,
              },
            );
            readd = await this._recoverTimedOutWebRefs(
              item,
              job,
              readd,
              fileNameMapRetry,
              refMediaTypeMap,
              refIdentityMap,
            );
            if (!readd?.success) {
              throw new Error(
                `Could not restore ${readd?.failedIds?.length || "some"} reference image(s) after inline retry reset`,
              );
            }
          }
          if (voicePayload?.search_value) {
            try {
              const result = await MessageBridge.selectFlowVoice(voicePayload);
              if (result?.success !== true)
                console.warn("[EditorExecutor] Voice unavailable after reset");
            } catch (error) {
              console.warn(
                "[EditorExecutor] Optional component skipped:",
                error.message,
              );
            }
          }
          if (characterPayload?.search_value) {
            try {
              const result =
                await MessageBridge.selectFlowCharacter(characterPayload);
              item._flowGlobalCharacterCount =
                Number(result?.selectedCount) ||
                (result?.success === true ? 1 : 0);
              item._flowGlobalCharacterAttached =
                item._flowGlobalCharacterCount > 0;
              if (result?.success !== true)
                console.warn(
                  "[EditorExecutor] Character unavailable after reset",
                );
            } catch (error) {
              item._flowGlobalCharacterAttached = false;
              item._flowGlobalCharacterCount = 0;
              console.warn(
                "[EditorExecutor] Optional component skipped:",
                error.message,
              );
            }
          }
          const retrySegments =
            segResult.skipped?.length > 0 &&
            segResult.acceptedSegments?.length > 0
              ? segResult.acceptedSegments
              : _segments;
          if (retrySegments !== _segments) {
            console.warn(
              `[EditorExecutor] Inline retry: rebuild ${retrySegments.length} accepted segment(s); omit ${segResult.skipped.length} failed mention(s)`,
            );
          }
          segResult = await this._insertSegments(item, retrySegments);
          if (segResult.aborted) {
            try {
              await MessageBridge.clearEditor();
            } catch (_) {}
            return;
          }
          await this._sleep(500);
          if (
            item._phaseR &&
            segResult.degraded > (segResult.verifiedGlobalChips || 0)
          )
            throw new Error("FLOW_RECOVERY_MENTION_INCOMPLETE");
          verified = await this._verifyInlineInsert(segResult, _segments);
          if (!verified) {
            if (item._phaseR)
              throw new Error("FLOW_RECOVERY_MENTION_VERIFY_FAILED");
            console.error(
              "[EditorExecutor] Step 6 (inline): verify FAIL sau retry \u2014 abort item",
            );
            item.state = QueueItem.STATE.FAILED;
            item.error =
              "Inline mention interleave failed (text/chip verify kh\xF4ng pass sau retry)";
            item.completedAt = Date.now();
            try {
              await MessageBridge.clearEditor();
            } catch (_) {}
            this._queue?._emitStateChanged?.();
            if (this._onItemCompleted) this._onItemCompleted(item);
            return;
          }
        }
        if (item._flowDriverKey === "flow_v2") {
          const audit = await this._resolveInlineAudit(segResult, _segments);
          const inline = audit.inline;
          if (audit.lateReconciled) delete item._mentionSkipped;
          console.log(
            "[FlowMentionAudit] " +
              JSON.stringify({
                attempt: String(item.attemptId || item.id).slice(0, 8),
                promptIndex: item.promptIndex,
                verified: inline?.verified === true,
                actualChipCount: inline?.count ?? null,
                lateReconciled: audit.lateReconciled,
                expected: _segments.map((part) =>
                  part.text !== void 0
                    ? { kind: "text", length: part.text.length }
                    : { kind: part.voice ? "voice" : "character" },
                ),
                actual: (inline?.parts || []).map((part) =>
                  part.text !== void 0
                    ? { kind: "text", length: part.text.length }
                    : {
                        kind: part.voice ? "voice" : "character",
                        hasIdentity: !!part.id,
                      },
                ),
                submittedTextLength: inline?.submittedText?.length ?? null,
              }),
          );
          if (
            inline?.verified !== true ||
            typeof inline.submittedText !== "string"
          )
            throw new Error("FLOW_RECOVERY_INLINE_MENTION_UNVERIFIED");
          _correlationPrompt = inline.submittedText;
          item._flowInlineParts = inline.parts;
        }
      } else {
        console.log(
          `[EditorExecutor] Step 5: insertText, len: ${_effectivePrompt?.length || 0}`,
        );
        const insertStarted = Date.now();
        const insertResult = await MessageBridge.insertText(_effectivePrompt);
        item.auditLifecycle?.("presubmit_stage", {
          stage: "text_insert",
          elapsedMs: Date.now() - insertStarted,
          textLength: _effectivePrompt?.length || 0,
          success: insertResult?.success === true,
        });
        if (!insertResult?.success) {
          throw new Error(
            `PROMPT_INSERT_FAILED: ${insertResult?.error || "Flow editor rejected text"}`,
          );
        }
        await this._sleep(this._getSubmitDelay());
        if (this._shouldAbortItem(item)) {
          try {
            await MessageBridge.clearEditor();
          } catch (_) {}
          return;
        }
        console.log(`[EditorExecutor] Step 6: verifySlateModel`);
        const verify = await MessageBridge.verifySlateModel();
        if (!verify?.hasContent) {
          console.log(`[EditorExecutor] Step 6: Slate empty, retry insertText`);
          await MessageBridge.clearEditor();
          await this._sleep(this._getClearEditorDelay());
          const retryInsert = await MessageBridge.insertText(_effectivePrompt);
          await this._sleep(500);
          const retryVerify = await MessageBridge.verifySlateModel();
          if (!retryInsert?.success || !retryVerify?.hasContent) {
            throw new Error(
              `PROMPT_INSERT_FAILED: ${retryInsert?.error || "editor remained empty after retry"}`,
            );
          }
        }
      }
      item.auditLifecycle?.("presubmit_stage", {
        stage: "editor_verified",
        elapsedMs: Date.now() - rcEditorStarted,
        visibility: document.visibilityState,
        focused: document.hasFocus(),
      });
      let rcStageStarted = Date.now();
      console.log(`[EditorExecutor] Step 7: getPreTileSnapshot`);
      try {
        await MessageBridge.stabilizeFlowResultViewport();
      } catch (e) {
        console.warn(
          "[EditorExecutor] Step 7: viewport stabilization failed (non-blocking):",
          e?.message || e,
        );
      }
      item._ownTileIds = null;
      item._ownTileAliases = [];
      item._observedProcessingTileIds = [];
      item._mustFollowProcessingOwners = false;
      const snapshot = await MessageBridge.getPreTileSnapshot();
      item.preTileIds = snapshot.preTileIds;
      item.preFileNames = snapshot.preFileNames;
      console.log(
        `[EditorExecutor] Step 7: preTileIds count: ${snapshot.preTileIds?.length || 0}`,
      );
      item.auditLifecycle?.("presubmit_stage", {
        stage: "snapshot",
        elapsedMs: Date.now() - rcStageStarted,
        visibility: document.visibilityState,
        focused: document.hasFocus(),
      });
      rcStageStarted = Date.now();
      const expectedRefCounts = countExpectedRefs(item.refFileIds);
      const finalRefs = await MessageBridge.verifyRefAttachments();
      const finalRefContractMatches =
        finalRefs?.success === true &&
        finalRefs.imageCount === expectedRefCounts.image &&
        finalRefs.videoCount === expectedRefCounts.video;
      item.auditLifecycle?.("presubmit_stage", {
        stage: "reference_final_verify",
        expectedImages: expectedRefCounts.image,
        actualImages: finalRefs?.imageCount ?? null,
        expectedVideos: expectedRefCounts.video,
        actualVideos: finalRefs?.videoCount ?? null,
        success: finalRefContractMatches,
      });
      if (!finalRefContractMatches) {
        throw Object.assign(
          new Error(
            `FLOW_REFERENCE_ATTACHMENT_DRIFT:${finalRefs?.imageCount ?? "?"}/${expectedRefCounts.image},${finalRefs?.videoCount ?? "?"}/${expectedRefCounts.video}`,
          ),
          { code: "FLOW_REFERENCE_ATTACHMENT_DRIFT", noRetry: true },
        );
      }
      rcStageStarted = Date.now();
      let correlationArm = null;
      if (item._flowDriverKey === "flow_v2" && !item._requireFlowApiChain) {
        try {
          correlationArm = await window.flowV2CorrelationBroker?.arm?.(
            item,
            _correlationPrompt,
          );
        } catch (error) {
          console.warn(
            "[FlowV2Correlation] arm failed; sequential fallback:",
            error?.message || error,
          );
        }
        if (
          item._phaseR &&
          [
            "observer_update_required",
            "observer_unavailable",
            "observer_ack_timeout",
          ].includes(correlationArm?.reason)
        ) {
          const observer = await MessageBridge.ensureFlowCorrelationObserver(
            Number(
              window.flowV2CorrelationBroker?._config?.()
                ?.observer_ack_timeout_ms,
            ),
          );
          if (observer?.success) {
            correlationArm = await window.flowV2CorrelationBroker.arm(
              item,
              _correlationPrompt,
            );
          } else if (
            observer?.error === "FLOW_RECOVERY_OBSERVER_UNAVAILABLE" ||
            observer?.error === "FLOW_RECOVERY_OBSERVER_UPDATE_REQUIRED"
          ) {
            correlationArm = {
              ...correlationArm,
              reason:
                observer.error === "FLOW_RECOVERY_OBSERVER_UPDATE_REQUIRED"
                  ? "observer_update_required"
                  : "observer_unavailable",
            };
          } else {
            throw new Error(
              observer?.error || "FLOW_RECOVERY_OBSERVER_UNAVAILABLE",
            );
          }
        }
      }
      if (
        item._phaseR &&
        correlationArm?.reason === "reference_identity_unresolved"
      ) {
        throw Object.assign(
          new Error("FLOW_RECOVERY_REFERENCE_IDENTITY_UNRESOLVED"),
          {
            code: "FLOW_RECOVERY_REFERENCE_IDENTITY_UNRESOLVED",
            noRetry: true,
          },
        );
      }
      if (
        item._phaseR &&
        correlationArm?.reason === "FLOW_RECOVERY_PRESUBMIT_STALE"
      ) {
        throw new Error("FLOW_RECOVERY_PRESUBMIT_STALE");
      }
      if (correlationArm?.reason === "ambiguous_retired_request") {
        this._queue?.requestCorrelationReset?.(correlationArm.resetContext, {
          jobId: item.jobId,
        });
      }
      if (item._phaseR && !correlationArm?.armed)
        throw new Error(
          correlationArm?.reason === "observer_update_required"
            ? "FLOW_RECOVERY_OBSERVER_UPDATE_REQUIRED"
            : correlationArm?.reason === "ambiguous_retired_request"
              ? "FLOW_RECOVERY_AMBIGUOUS_REQUEST"
              : "FLOW_RECOVERY_OBSERVER_UNAVAILABLE",
        );
      if (item._phaseR) {
        item.auditLifecycle?.("presubmit_stage", {
          stage: "arm",
          elapsedMs: Date.now() - rcStageStarted,
          visibility: document.visibilityState,
          focused: document.hasFocus(),
        });
        rcStageStarted = Date.now();
        try {
          await this._queue._webRecovery.beforeDispatch(
            item,
            _correlationPrompt,
          );
          item.auditLifecycle?.("presubmit_stage", {
            stage: "journal",
            elapsedMs: Date.now() - rcStageStarted,
            visibility: document.visibilityState,
            focused: document.hasFocus(),
          });
          if (
            !(await window.flowV2CorrelationBroker.verifyBeforeSubmit(
              item,
              _correlationPrompt,
            ))
          ) {
            throw new Error("FLOW_RECOVERY_PRESUBMIT_STALE");
          }
        } catch (error) {
          if (item._phaseR.dispatched)
            await this._queue._webRecovery.cancelBeforeSubmit(item, {
              requeue: false,
            });
          throw error;
        }
        if (
          this._shouldStop ||
          job.state === "stopped" ||
          job.state === "paused"
        ) {
          await this._queue._webRecovery.cancelBeforeSubmit(item);
          return;
        }
      }
      if (item.settings?.manualSubmitMode) {
        console.log(
          "[EditorExecutor] Step 8: MANUAL mode \u2014 ch\u1EDD user nh\u1EA5n Enter (skip clickSubmit)",
        );
        const ok = await this._waitUserEnterSubmit(item);
        if (!ok) {
          item.state = QueueItem.STATE.CANCELLED;
          item.completedAt = Date.now();
          if (this._onItemCompleted) this._onItemCompleted(item);
          return;
        }
        console.log("[EditorExecutor] Step 8: MANUAL submit detected DONE");
        if (correlationArm?.armed) {
          window.flowV2CorrelationBroker
            .observeAfterSubmit(item)
            .catch((error) =>
              console.warn(
                "[FlowV2Correlation] manual observation failed:",
                error?.message || error,
              ),
            );
        }
      } else {
        item.state = QueueItem.STATE.SUBMITTING;
        item.submittedAt = Date.now();
        try {
          this._queue?._emitStateChanged?.();
        } catch (_) {}
        console.log(`[EditorExecutor] Step 8: clickSubmit`);
        const expectsNetworkRequestEvidence =
          correlationArm?.armed && correlationArm.capability?.parallel === true;
        const clickStartedAt = Date.now();
        const submitPromise = MessageBridge.clickSubmit({
          requestEvidenceOnly: expectsNetworkRequestEvidence,
          correlationGuard: correlationArm?.armed
            ? item._flowPresubmitGuard
            : null,
          referenceGuard: {
            imageCount: expectedRefCounts.image,
            videoCount: expectedRefCounts.video,
          },
        })
          .then(async (result) => {
            item.auditLifecycle?.("presubmit_stage", {
              stage: "click_ack",
              elapsedMs: Date.now() - clickStartedAt,
              visibility: document.visibilityState,
              focused: document.hasFocus(),
              success: result?.success === true,
            });
            if (result?.notDispatched === true) {
              if (item._phaseR) {
                await this._queue._webRecovery.cancelBeforeSubmit(item, {
                  requeue: false,
                });
              }
              await window.flowV2CorrelationBroker?.disarm?.(
                item,
                window.FlowV2CorrelationProtocol?.STATES?.FAILED,
                { dispatched: false },
              );
            }
            return result;
          })
          .catch(async (error) => {
            const code =
              error?.code || error?.message || "SUBMIT_NOT_CONFIRMED";
            item.auditLifecycle?.("presubmit_stage", {
              stage: "click_ack",
              elapsedMs: Date.now() - clickStartedAt,
              visibility: document.visibilityState,
              focused: document.hasFocus(),
              success: false,
              error: code,
            });
            if (error?.notDispatched === true) {
              if (item._phaseR)
                await this._queue._webRecovery.cancelBeforeSubmit(item, {
                  requeue: false,
                });
              await window.flowV2CorrelationBroker?.disarm?.(
                item,
                window.FlowV2CorrelationProtocol?.STATES?.FAILED,
                { dispatched: false },
              );
            }
            return {
              success: false,
              error: code,
              notDispatched: error?.notDispatched === true,
            };
          });
        let observation = null;
        let requestBound = false;
        if (correlationArm?.armed) {
          observation = window.flowV2CorrelationBroker.observeAfterSubmit(item);
          if (item._phaseR) item._flowCorrelationPromise = observation;
          observation.catch(() => {});
        }
        const submitResult = await submitPromise;
        if (!submitResult?.success) {
          if (
            item._phaseR?.dispatched === true &&
            submitResult?.notDispatched !== true &&
            observation
          ) {
            item.auditLifecycle?.("submit_ack_unverified", {
              error: String(
                submitResult?.error || "SUBMIT_NOT_CONFIRMED",
              ).slice(0, 240),
              observerRetained: true,
            });
            console.warn(
              "[FlowRecovery] submit ACK unavailable; retaining request observer",
              JSON.stringify({
                promptIndex: item.promptIndex ?? null,
                error: String(
                  submitResult?.error || "SUBMIT_NOT_CONFIRMED",
                ).slice(0, 240),
              }),
            );
          } else {
            const submitError = new Error(
              `SUBMIT_NOT_TRIGGERED: ${submitResult?.error || "Flow submit returned false"}`,
            );
            submitError.code = submitResult?.error || null;
            submitError.notDispatched = submitResult?.notDispatched === true;
            submitError.noRetry =
              submitError.notDispatched &&
              submitError.code === "PUBLIC_ERROR_USER_QUOTA_REACHED";
            throw submitError;
          }
        }
        requestBound =
          correlationArm?.capability?.parallel === true &&
          window.flowV2CorrelationBroker.canPipelineItem(item);
        if (item._phaseR) {
          item._flowCorrelationPromise = observation;
        } else if (correlationArm?.armed) {
          if (correlationArm.capability?.parallel === true) {
            const finalizeCorrelation = (correlated) => {
              if (
                this._shouldStop ||
                job.state === "stopped" ||
                item.state === QueueItem.STATE.CANCELLED
              )
                return null;
              if (correlated?.strong !== true && runtimeJob) {
                runtimeJob.sequentialMode = true;
                runtimeJob.forcedV2WebSequential = true;
                console.warn(
                  "[FlowV2Correlation] strong receipt unavailable; remaining items downgraded to sequential",
                );
              }
              return correlated;
            };
            if (requestBound) {
              item._flowCorrelationPromise =
                observation.then(finalizeCorrelation);
            } else {
              finalizeCorrelation(null);
              item._flowCorrelationPromise = null;
              observation.catch((error) =>
                console.warn(
                  "[FlowV2Correlation] unbound observation ended:",
                  error?.message || error,
                ),
              );
            }
          } else
            observation.catch((error) =>
              console.warn(
                "[FlowV2Correlation] observation failed:",
                error?.message || error,
              ),
            );
        }
        await this._sleep(this._getAfterSubmitDelay());
        console.log(`[EditorExecutor] Step 8: clickSubmit DONE`);
      }
      if (
        this._shouldStop ||
        job.state === "stopped" ||
        item.state === QueueItem.STATE.CANCELLED
      ) {
        item.state = QueueItem.STATE.CANCELLED;
        return;
      }
      if (item._phaseR) {
        try {
          await this._queue._webRecovery.captureDomFailureOwner(item, snapshot);
        } catch (error) {
          console.warn(
            "[FlowRecovery] DOM failure owner unavailable:",
            error?.message || error,
          );
        }
        if (
          this._shouldStop ||
          job.state === "stopped" ||
          item.state === QueueItem.STATE.CANCELLED
        ) {
          item.state = QueueItem.STATE.CANCELLED;
          return;
        }
        item.state = QueueItem.STATE.SUBMITTED;
        this._processedCount++;
        this._onItemSubmitted?.(item);
        return;
      }
      try {
        const postSnap = await MessageBridge.getPreTileSnapshot();
        const preSet = new Set(item.preTileIds || []);
        const expectedMediaType =
          String(item.settings?.genType || "").toLowerCase() === "video"
            ? "video"
            : "image";
        const appeared = (postSnap?.preTileIds || []).filter(
          (id) => !preSet.has(id),
        );
        const preFileNames = new Set(item.preFileNames || []);
        const own = appeared.filter((id) => {
          const actual = postSnap?.tileMediaById?.[id] || null;
          const fileName = postSnap?.tileFileNameById?.[id] || null;
          const status = postSnap?.tileStatusById?.[id] || null;
          const persistent = !!postSnap?.tilePersistentById?.[id];
          const isOldVirtualizedTile = !!fileName && preFileNames.has(fileName);
          const isUnprovenCompletedVideo =
            expectedMediaType === "video" &&
            actual === "video" &&
            status === "success";
          return (
            (!actual || actual === expectedMediaType) &&
            !isOldVirtualizedTile &&
            !isUnprovenCompletedVideo
          );
        });
        item._observedProcessingTileIds = own.filter(
          (id) => postSnap?.tileStatusById?.[id] === "processing",
        );
        item._mustFollowProcessingOwners =
          item._observedProcessingTileIds.length > 0;
        item.setPendingOwners?.(item._observedProcessingTileIds, "processing");
        const rejected = appeared.filter((id) => !own.includes(id));
        const qty = parseInt(item.settings?.quantity) || 1;
        const rankedOwn = own.slice().sort((a, b) => {
          const score = (id) =>
            (postSnap?.tilePersistentById?.[id] ? 4 : 0) +
            (postSnap?.tileStatusById?.[id] === "success" ? 2 : 0) +
            (/^[0-9a-f-]{36}$/i.test(id) ? 1 : 0);
          return score(b) - score(a);
        });
        const ownershipCandidates =
          item._observedProcessingTileIds.length > 0
            ? item._observedProcessingTileIds
            : rankedOwn;
        item._domOwnershipAmbiguous = ownershipCandidates.length > qty;
        if (item.flowCorrelationReceipt?.strong !== true) {
          item._ownTileIds =
            ownershipCandidates.length === qty
              ? ownershipCandidates.slice(0, qty)
              : null;
        } else {
          item._ownTileAliases =
            ownershipCandidates.length === qty
              ? ownershipCandidates.slice(0, qty)
              : [];
        }
        console.log(
          "[FlowV2ResultIdentity] post-submit ownership",
          JSON.stringify({
            item_id: item.id,
            expected_media_type: expectedMediaType,
            appeared: appeared.map((id) => ({
              id,
              media_type: postSnap?.tileMediaById?.[id] || null,
              status: postSnap?.tileStatusById?.[id] || null,
              persistent: !!postSnap?.tilePersistentById?.[id],
            })),
            accepted_ids: own,
            ranked_ids: rankedOwn,
            ownership_candidates: ownershipCandidates,
            locked_ids: item._ownTileIds || [],
            locked_aliases: item._ownTileAliases || [],
            rejected_ids: rejected,
            required_quantity: qty,
            ownership_locked: !!item._ownTileIds,
            ownership_ambiguous: item._domOwnershipAmbiguous === true,
            processing_owner_lock: item._mustFollowProcessingOwners === true,
          }),
        );
        if (
          item.flowCorrelationReceipt?.strong !== true &&
          item._domOwnershipAmbiguous === true &&
          item._observedProcessingTileIds.length === 0 &&
          ownershipCandidates.every(
            (id) => postSnap?.tileStatusById?.[id] === "failed",
          )
        ) {
          throw new Error("FLOW_RESULT_OWNERSHIP_AMBIGUOUS");
        }
      } catch (e) {
        if (e?.message === "FLOW_RESULT_OWNERSHIP_AMBIGUOUS") throw e;
        if (item.flowCorrelationReceipt?.strong !== true)
          item._ownTileIds = null;
        item._ownTileAliases = [];
        item._domOwnershipAmbiguous = true;
        console.warn(
          "[EditorExecutor] Step 8b: snapshot l\u1ED7i \u2192 d\xF9ng logic c\u0169:",
          e?.message || e,
        );
      }
      if (
        this._shouldStop ||
        job.state === "stopped" ||
        item.state === QueueItem.STATE.CANCELLED
      ) {
        item.state = QueueItem.STATE.CANCELLED;
        return;
      }
      item._submitOrder = ++_EditorExecutor._submitCounter;
      item.state = QueueItem.STATE.SUBMITTED;
      this._processedCount++;
      _EditorExecutor._incrementDailyStat("flow_prompt_total");
      if (this._onItemSubmitted) {
        this._onItemSubmitted(item);
      }
    } catch (err) {
      if (
        this._shouldStop ||
        job.state === "stopped" ||
        item.state === QueueItem.STATE.CANCELLED
      ) {
        item.state = QueueItem.STATE.CANCELLED;
        return;
      }
      if (err?.code === "FLOW_COMMAND_ACK_TIMEOUT") {
        item.auditLifecycle?.("flow_command_ack_timeout", {
          action: err.flowCommandAction,
        });
      }
      if (err?.flowGateDiagnostic) {
        item.auditLifecycle?.("flow_v2_gate_failed", err.flowGateDiagnostic);
      }
      if (
        err.preSubmitFailure !== true &&
        (await this._queue._webRecovery?.error(item, err))
      )
        return;
      console.error(
        "[EditorExecutor] L\u1ED7i x\u1EED l\xFD item:",
        err.message,
      );
      item.error = err.message;
      window.flowV2CorrelationBroker?.disarm?.(
        item,
        window.FlowV2CorrelationProtocol?.STATES?.FAILED,
      );
      const deterministicError =
        err?.noRetry === true ||
        /^(?:(?:SUBMIT_NOT_TRIGGERED: )?(?:SUBMIT_BUTTON_NOT_FOUND|FLOW_CREDIT_LIMIT)$|FLOW_RESULT_OWNERSHIP_AMBIGUOUS$|FLOW_LEGACY_GENERATION_DISABLED$|FLOW_PROJECT_REQUIRED$|FLOW_EXECUTION_TARGET_CHANGED$|FLOW_DRIVER_MISMATCH$|FLOW_PROJECT_MISMATCH$|FLOW_ORIGIN_MISMATCH$|UNSUPPORTED_FLOW_ORIGIN$|FLOW_V2_DISABLED$|FLOW_V2_CONFIG_MISSING$|V2_SETTING_MISSING:|V2_SETTING_OPTION_NOT_FOUND:|V2_MODEL_|MODEL_OPTION_(?:NOT_FOUND|NOT_APPLIED):|CONFIG_REQUIRED:)/.test(
          String(err?.code || err?.message || ""),
        );
      const retryQueued =
        !deterministicError &&
        this._queue?.scheduleWebRetryAtBatchTail?.(
          item,
          String(err?.code || err?.message || "WEB_EDITOR_EXECUTION_FAILED"),
          { source: "editor_executor" },
        );
      if (!retryQueued) {
        if (deterministicError) {
          item.noRetry = true;
          console.warn(
            "[EditorExecutor] Deterministic config/option error \u2014 skip whole-item retry:",
            err.message,
          );
        }
        item.state = QueueItem.STATE.FAILED;
        item.completedAt = Date.now();
        if (this._onItemCompleted) {
          this._onItemCompleted(item);
        }
      }
    } finally {
      MessageBridge.endExecutionTarget?.(item.id);
      this._currentItem = null;
      this._queue?.flushPendingCorrelationReset?.().catch(() => {});
      if (
        job.state === "paused" &&
        job.pauseReason === "api_unusual_activity"
      ) {
        this._queue?._emitStateChanged?.();
      }
    }
  }
  async _waitUserEnterSubmit(item) {
    const idx = (item.promptIndex ?? 0) + 1;
    const total = this._queue?.getJob(item.jobId)?.totalExpected || 1;
    item.state = QueueItem.STATE.WAITING_USER;
    try {
      this._queue?._emitStateChanged?.();
    } catch (_) {}
    try {
      await new Promise((r) =>
        chrome.runtime.sendMessage(
          {
            action: "activateFlowTabForExecution",
            tabId: window._targetFlowTabId || null,
            focusWindow: true,
          },
          () => {
            void chrome.runtime.lastError;
            r();
          },
        ),
      );
    } catch (_) {}
    let waitDone = false;
    const waitPromise = MessageBridge.sendToContentScript("waitUserSubmit", {
      expectedPrompt: item.prompt,
      excludeTileIds: item.preTileIds || [],
      promptIndex: idx,
      total,
      refCount: item.refFileIds?.length || 0,
      timeoutMs: 0,
    })
      .then((r) => {
        waitDone = true;
        return r;
      })
      .catch((err) => {
        waitDone = true;
        console.warn("[EditorExecutor] waitUserSubmit error:", err?.message);
        return null;
      });
    const _isAborting = () =>
      this._shouldStop || item.state === QueueItem.STATE.CANCELLED;
    const abortWatcher = (async () => {
      while (!_isAborting() && !waitDone) {
        await this._sleep(300);
      }
      if (!waitDone && _isAborting()) {
        try {
          await MessageBridge.sendToContentScript("cancelWaitUserSubmit", {});
        } catch (_) {}
      }
    })();
    const res = await waitPromise;
    try {
      await abortWatcher;
    } catch (_) {}
    if (res && res.submitted !== true && res.reason) {
      item.error = "Manual submit: " + res.reason;
    }
    if (res?.submitted === true) {
      const job = this._queue?.getJob(item.jobId);
      if (job?.owner === "workflow") {
        try {
          chrome.runtime.sendMessage({ action: "focusWorkflowWindow" }, () => {
            void chrome.runtime.lastError;
          });
        } catch (_) {}
      }
    }
    return res?.submitted === true;
  }
  async _applyWebSettingsBeforeRefs(item) {
    console.log("[EditorExecutor] Step 1.2: applySettings before references");
    try {
      await this._maybeApplySettings(item);
    } catch (settingsError) {
      const code = String(settingsError?.message || "");
      if (/^(?:V2_MODEL_|MODEL_OPTION_|V2_MODE_)/.test(code)) {
        settingsError.noRetry = true;
        throw settingsError;
      }
      const bypassableSettingError =
        /^(?:V2_SETTINGS_|V2_SETTING_(?:OPTION_NOT_FOUND|NOT_APPLIED):)/.test(
          code,
        );
      if (!bypassableSettingError) throw settingsError;
      try {
        console.warn(
          "[EditorExecutor] Step 1.2: settings unavailable \u2014 retry once:",
          code,
        );
        await this._sleep(350);
        await this._maybeApplySettings(item);
      } catch (retryError) {
        if (item._phaseR) throw retryError;
        const retryCode = String(retryError?.message || "");
        if (
          !/^(?:V2_SETTINGS_|V2_SETTING_(?:OPTION_NOT_FOUND|NOT_APPLIED):)/.test(
            retryCode,
          )
        )
          throw retryError;
        console.warn(
          "[EditorExecutor] Step 1.2: bypass settings after isolated retry:",
          retryCode,
        );
        try {
          await MessageBridge.prepareFlowForGen?.();
        } catch (_) {}
      }
    }
  }
  async _maybeApplySettings(item) {
    const needed = item.settings;
    if (!needed) return;
    console.log(
      `[EditorExecutor] _maybeApplySettings: needed.isFrames=${needed.isFrames}, needed.genType=${needed.genType}`,
    );
    console.log(`[EditorExecutor] _lastSettings:`, this._lastSettings);
    const mustApplyGenType = !!needed.genType;
    if (
      !mustApplyGenType &&
      this._lastSettings &&
      this._lastSettings.ratio === needed.ratio &&
      this._lastSettings.model === needed.model &&
      this._lastSettings.isFrames === (needed.isFrames || false) &&
      this._lastSettings.quantity === needed.quantity &&
      this._lastSettings.flowVideoDuration ===
        (needed.flowVideoDuration || null) &&
      this._lastSettings.flowVideoResolution ===
        (needed.flowVideoResolution || null)
    ) {
      console.log(
        `[EditorExecutor] Settings unchanged (no genType), skipping applySettings`,
      );
      return;
    }
    console.log(
      `[EditorExecutor] Calling applySettings: genType=${needed.genType}, ratio=${needed.ratio}, model=${needed.model}, isFrames=${needed.isFrames}, quantity=${needed.quantity}, flowVideoDuration=${needed.flowVideoDuration}, flowVideoResolution=${needed.flowVideoResolution}, flowVideoResolutionDomValue=${needed.flowVideoResolutionDomValue}`,
    );
    const applied = await MessageBridge.applySettings(
      needed.genType,
      needed.ratio,
      needed.model,
      needed.isFrames || false,
      needed.quantity || 1,
      needed.flowVideoDuration || null,
      needed.flowVideoResolution || null,
    );
    if (item._phaseR && applied?.success !== true)
      throw new Error("FLOW_RECOVERY_SETTINGS_NOT_VERIFIED");
    this._lastSettings = {
      genType: needed.genType,
      ratio: needed.ratio,
      model: needed.model,
      isFrames: needed.isFrames || false,
      quantity: needed.quantity || 1,
      flowVideoDuration: needed.flowVideoDuration || null,
      flowVideoResolution: needed.flowVideoResolution || null,
    };
  }
  _shouldAbortItem(item) {
    if (this._shouldStop) {
      item.state = QueueItem.STATE.CANCELLED;
      this._currentItem = null;
      return true;
    }
    const job = this._queue?.getJob(item.jobId);
    if (!job || job.state === "stopped") {
      item.state = QueueItem.STATE.CANCELLED;
      this._currentItem = null;
      return true;
    }
    return false;
  }
  async _awaitFlowDownload(dlItem, timeoutMs, perform) {
    const controller = new AbortController();
    const stopped = () => {
      const job = this._queue?.getJob?.(dlItem.jobId);
      return (
        this._shouldStop === true ||
        job?.state === "stopped" ||
        (dlItem.jobId && typeof this._queue?.getJob === "function" && !job)
      );
    };
    const abortFn = () => controller.signal.aborted || stopped();
    let timer, stopTimer;
    const failure = (code) => {
      controller.abort();
      return Object.assign(new Error(code), {
        code,
        noRetry: true,
        noReplay: true,
      });
    };
    try {
      if (stopped()) throw failure("DOWNLOAD_STOPPED");
      const watchdog = new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(failure("FLOW_DOWNLOAD_TIMEOUT")),
          timeoutMs,
        );
        stopTimer = setInterval(() => {
          if (stopped()) reject(failure("DOWNLOAD_STOPPED"));
        }, 100);
      });
      return await Promise.race([
        Promise.resolve().then(() => perform(controller.signal, abortFn)),
        watchdog,
      ]);
    } finally {
      clearTimeout(timer);
      clearInterval(stopTimer);
    }
  }
  async _processDownload(dlItem) {
    this._isDownloading = true;
    console.log(
      `[EditorExecutor] _processDownload: tileId=${dlItem.tileId?.substring(0, 20)}, fileName=${dlItem.fileName?.substring(0, 12) || "null"}, index=${dlItem.index || "null"}`,
    );
    this._queue?.setCurrentDownload?.({ ...dlItem, state: "DOWNLOADING" });
    const _cfgVideoTimeout =
      window.SystemConfig?.safeGetTimeout?.("video_download_timeout_ms") || 0;
    const _cfgImageTimeout =
      window.SystemConfig?.safeGetTimeout?.("image_timeout_ms") || 0;
    const _minOuterDownloadTimeout = 1e5;
    const dlTimeoutMs = dlItem.isVideo
      ? Math.max(_cfgVideoTimeout || 3e5, _minOuterDownloadTimeout)
      : Math.max(_cfgImageTimeout || 3e5, _minOuterDownloadTimeout);
    console.log(
      `[Fix1-DL-TIMEOUT] tile=${dlItem.tileId?.substring(0, 12)} isVideo=${!!dlItem.isVideo} timeout=${dlTimeoutMs}ms source=${dlItem.isVideo ? (_cfgVideoTimeout ? "video-config" : "fallback-300k") : _cfgImageTimeout ? "image-config" : "fallback-300k"}`,
    );
    const downloadFailureOptions = (error) => {
      const code = String(error?.code || error?.message || error || "");
      const targetUnavailable = new Set([
        "FLOW_DOWNLOAD_TARGET_NOT_FOUND",
        "FLOW_DOWNLOAD_TARGET_SCAN_COOLDOWN",
        "FLOW_DOWNLOAD_TARGET_UNMOUNTED",
      ]);
      return targetUnavailable.has(code) ? { retryable: false } : {};
    };
    try {
      const flowDownload =
        dlItem.providerData?.provider === "flow" ||
        (!dlItem.providerData?.provider &&
          (!dlItem.providerUrl || dlItem.apiProvider === true));
      if (flowDownload && window.DownloadHelper?.downloadFlowGalleryMedia) {
        const ok = await this._awaitFlowDownload(
          dlItem,
          dlTimeoutMs,
          async (signal, abortFn) => {
            if (!dlItem.plannedFilename) {
              const settings = await window.DownloadHelper.getSettings();
              if (abortFn())
                throw Object.assign(new Error("DOWNLOAD_STOPPED"), {
                  noRetry: true,
                  noReplay: true,
                });
              const ext = dlItem.isVideo ? "mp4" : "png";
              dlItem.plannedFilename = window.DownloadHelper.buildFilename({
                template: settings.template,
                project: settings.project,
                folder: settings.folder,
                prompt: dlItem.promptText,
                index: dlItem.index,
                taskName: dlItem.taskName || null,
                ext,
              });
              const res = String(dlItem.resolution || "").toLowerCase();
              const route =
                window.ProviderConfigManager?.getDownloadResolutionRouteSync?.(
                  "flow",
                  dlItem.isVideo ? "video" : "image",
                  res,
                ) || null;
              if (!route) throw new Error("FLOW_DOWNLOAD_CONFIG_MISSING");
              const upscale = route === "upscale";
              if (upscale)
                dlItem.plannedFilename = dlItem.plannedFilename.replace(
                  /\.[^.\/]+$/,
                  `_${res}.${ext}`,
                );
              this._queue?.setCurrentDownload?.({
                ...dlItem,
                state: "DOWNLOADING",
              });
            }
            if (abortFn())
              throw Object.assign(new Error("DOWNLOAD_STOPPED"), {
                noRetry: true,
                noReplay: true,
              });
            return window.DownloadHelper.downloadFlowGalleryMedia({
              tile: {
                id: dlItem.tileId,
                fileName: dlItem.fileName,
                type: dlItem.isVideo ? "video" : "image",
                mediaUuid: dlItem.providerData?.media_uuid || dlItem.apiMediaId,
                persistentMediaId: dlItem.fileName,
                projectId: dlItem.providerData?.project_id || dlItem.projectId,
                providerData:
                  dlItem.providerData?.provider === "flow"
                    ? dlItem.providerData
                    : null,
              },
              promptText: dlItem.promptText,
              taskName: dlItem.taskName,
              index: dlItem.index,
              ratio: dlItem.ratio,
              resolution: dlItem.resolution,
              watermarkMode: dlItem.watermarkMode,
              generationMode: dlItem.genMode,
              plannedFilename: dlItem.plannedFilename,
              abortFn,
              signal,
            });
          },
        );
        if (ok === true) this._queue?.markDownloadCompleted?.(dlItem.tileId);
        else
          this._queue?.markDownloadFailed?.(
            dlItem.tileId,
            "FLOW_DOWNLOAD_FAILED",
          );
        await this._sleep(200);
        return;
      }
      const _dlIsVideo = !!dlItem.isVideo;
      const _dlRes = String(dlItem.resolution || "").toLowerCase();
      const _dlRoute =
        window.ProviderConfigManager?.getDownloadResolutionRouteSync?.(
          "flow",
          _dlIsVideo ? "video" : "image",
          _dlRes,
        ) || null;
      const _dlUpscale = _dlRoute === "upscale";
      const _isApiMedia =
        dlItem.apiProvider === true ||
        !!dlItem.providerUrl ||
        !!dlItem.durableUrl;
      const _mediaContext = {
        mediaId: dlItem.apiMediaId || dlItem.tileId,
        mediaType: _dlIsVideo ? "video" : "image",
        providerData: dlItem.providerData || {
          provider: dlItem.apiProvider === true ? "flow" : null,
          url: dlItem.providerUrl || null,
          durable_url: dlItem.durableUrl || null,
          project_id: dlItem.projectId || null,
          api_driver: dlItem.apiDriver || null,
          identity_kind: dlItem.identityKind || null,
        },
      };
      const apiReady =
        _isApiMedia && _dlUpscale
          ? await window.FlowApiFacade?.checkDownloadReady?.({
              ..._mediaContext,
              requireUpscale: _dlUpscale,
              forWorkflow: dlItem.forWorkflow === true,
            })
          : {
              ready: _isApiMedia,
              reason: _isApiMedia ? "native_url_ready" : "not_api_media",
            };
      if (_isApiMedia && apiReady?.ready) {
        const ok = await this._downloadApiTile(dlItem);
        if (ok) this._queue?.markDownloadCompleted?.(dlItem.tileId);
        else
          this._queue?.markDownloadFailed?.(
            dlItem.tileId,
            "api-download-failed",
          );
        await this._sleep(200);
        return;
      }
      if (_isApiMedia && !apiReady?.ready) {
        console.warn(
          "[EditorExecutor] API media download unavailable; DOM fallback blocked:",
          apiReady?.reason,
        );
        this._queue?.markDownloadFailed?.(
          dlItem.tileId,
          apiReady?.reason || "api-download-unavailable",
        );
        await this._sleep(200);
        return;
      }
      const downloadPromise = MessageBridge.sendToContentScript(
        "downloadTileMedia",
        {
          tileId: dlItem.tileId,
          promptText: dlItem.promptText,
          plannedFilename: dlItem.plannedFilename || null,
          taskName: dlItem.taskName || null,
          fileName: dlItem.fileName,
          flowFileId: dlItem.flowFileId || null,
          resolution: dlItem.resolution || null,
          watermarkMode: dlItem.watermarkMode || null,
          index: dlItem.index || null,
          videoResolution: dlItem.isVideo ? dlItem.resolution || null : null,
        },
      );
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Download timeout")), dlTimeoutMs),
      );
      const _dlStart = Date.now();
      const resp = await Promise.race([downloadPromise, timeoutPromise]);
      if (!resp || resp?.success === false || resp?.error) {
        console.warn(
          "[EditorExecutor] Download failed:",
          dlItem.tileId,
          resp?.error || "no response",
        );
        const error = resp?.error || "no response";
        this._queue?.markDownloadFailed?.(
          dlItem.tileId,
          error,
          downloadFailureOptions(error),
        );
      } else {
        console.log(
          `[Fix1-DL-TIMEOUT] tile=${dlItem.tileId?.substring(0, 12)} DOWNLOAD OK sau ${Date.now() - _dlStart}ms (isVideo=${!!dlItem.isVideo})`,
        );
        this._queue?.markDownloadCompleted?.(dlItem.tileId);
      }
      await this._sleep(200);
    } catch (err) {
      console.error(
        `[EditorExecutor] Download error: ${err.message} | tile=${dlItem.tileId?.substring(0, 12)} isVideo=${!!dlItem.isVideo} dlTimeout=${dlTimeoutMs}ms`,
      );
      this._queue?.markDownloadFailed?.(dlItem.tileId, err.message, {
        ...downloadFailureOptions(err),
        retryable:
          downloadFailureOptions(err).retryable !== false &&
          !(
            err?.noRetry ||
            err?.noReplay ||
            err?.dispatchStarted === true ||
            ["receipt", "ambiguous", "accepted_poll"].includes(err?.stage) ||
            /^(GOOGLE_REJECTED|RPC_REJECTED|RPC_REJECT|SCHEMA_CHANGED|FLOW_API_UPSCALE_FAILED|DOWNLOAD_STOPPED|PROJECT_MISMATCH)$/.test(
              err.message,
            )
          ),
      });
    } finally {
      this._isDownloading = false;
      this._queue?.noteDownloadSettled?.();
    }
  }
  async _downloadApiTile(dlItem) {
    const downloadBlobUrls = new Set();
    let downloadAccepted = false;
    try {
      const isVideo = !!dlItem.isVideo;
      const apiMediaId =
        dlItem.providerData?.media_uuid || dlItem.apiMediaId || dlItem.tileId;
      const projectId =
        dlItem.providerData?.project_id || dlItem.projectId || null;
      const res = String(
        dlItem.resolution || (isVideo ? "720p" : "1k"),
      ).toLowerCase();
      const route =
        window.ProviderConfigManager?.getDownloadResolutionRouteSync?.(
          "flow",
          isVideo ? "video" : "image",
          res,
        ) || null;
      if (!route) return false;
      const wantsUpscale = route === "upscale";
      let nativeUrl = dlItem.providerUrl || dlItem.durableUrl;
      if (wantsUpscale) {
        const gate = await window.FlowApiFacade?.checkDownloadReady?.({
          mediaId: apiMediaId,
          mediaType: isVideo ? "video" : "image",
          providerData: dlItem.providerData,
          requireUpscale: true,
          forWorkflow: dlItem.forWorkflow === true,
        });
        if (!gate?.ready) {
          console.warn(
            "[EditorExecutor] API upscale preflight blocked:",
            gate?.reason || "unavailable",
          );
          return false;
        }
      }
      const deadline = Date.now() + (isVideo ? 6e5 : 12e4);
      const abortFn = () => Date.now() > deadline || this._shouldStop;
      let url = null;
      let blobUrl = null;
      let resolvedBase64 = null;
      let resolvedMime = null;
      let ext = isVideo ? "mp4" : "png";
      let suffix = "";
      const hasProviderUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          String(dlItem.providerData?.media_uuid || ""),
        );
      const nativeNeedsResolve =
        hasProviderUuid ||
        !nativeUrl ||
        (typeof nativeUrl === "string" &&
          nativeUrl.includes("media.getMediaUrlRedirect"));
      if (!wantsUpscale && nativeNeedsResolve) {
        const resolved = await window.FlowApiFacade?.resolveDownload?.({
          mediaId: apiMediaId,
          mediaType: isVideo ? "video" : "image",
          providerData: dlItem.providerData,
        });
        nativeUrl = resolved?.url || null;
        resolvedBase64 = resolved?.base64 || null;
        resolvedMime = resolved?.mime || null;
        console.log("[EditorExecutor] API native locator resolved", {
          mediaType: isVideo ? "video" : "image",
          hasServingUrl: !!nativeUrl,
          hasBase64: !!resolvedBase64,
        });
        if (!nativeUrl && !resolvedBase64) {
          console.warn(
            "[EditorExecutor] API native download blocked: media resolver returned no downloadable URL or bytes",
          );
          return false;
        }
      }
      if (wantsUpscale) {
        if (!window.FlowApiFacade || !projectId) return false;
        try {
          if (isVideo) {
            if (!dlItem.ratio && dlItem.providerData?.api_driver !== "v2") {
              console.warn(
                "[EditorExecutor] API upscale blocked: VIDEO_RATIO_MISSING",
              );
              return false;
            }
            const up = await window.FlowApiFacade.upscaleVideo({
              mediaId: apiMediaId,
              ratio: dlItem.ratio,
              resolution: res,
              abortFn,
              projectId,
              mediaType: "video",
              providerData: dlItem.providerData,
            });
            if (up?.ok && up.videoUrl) {
              url = up.videoUrl;
              suffix = `_${res}`;
              if (up.revoke === true) downloadBlobUrls.add(up.videoUrl);
              if (
                self.VideoWmClient &&
                window.WatermarkClient?.enabled?.("video")
              ) {
                try {
                  const cfgResp = await chrome.runtime.sendMessage({
                    action: "getWatermarkConfig",
                    mediaType: "video",
                  });
                  if (cfgResp?.success) {
                    const vb = await (
                      await fetch(url, { cache: "no-store" })
                    ).blob();
                    const vr = await self.VideoWmClient.process(
                      vb,
                      cfgResp.cfg,
                      {},
                    );
                    if (vr?.applied) {
                      blobUrl = URL.createObjectURL(vr.blob);
                      downloadBlobUrls.add(blobUrl);
                      url = blobUrl;
                      console.log(
                        `[EditorExecutor] video ${res} \u0111\xE3 xo\xE1 watermark \u2014 ${vr.stats?.frames || "?"} frame`,
                      );
                    } else {
                      console.warn(
                        `[EditorExecutor] video ${res}: kh\xF4ng xo\xE1 \u0111\u01B0\u1EE3c (${vr?.reason}) \u2192 gi\u1EEF b\u1EA3n upscale g\u1ED1c`,
                      );
                    }
                  }
                } catch (e) {
                  console.warn(
                    "[EditorExecutor] video upscale + xo\xE1 l\u1ED7i:",
                    e?.message,
                  );
                }
              }
            }
          } else {
            const up = await window.FlowApiFacade.upscaleImage({
              mediaId: apiMediaId,
              resolution: res,
              abortFn,
              projectId,
              mediaType: "image",
              providerData: dlItem.providerData,
            });
            if (up?.ok && up.base64) {
              ext =
                up.mime === "image/webp"
                  ? "webp"
                  : up.mime === "image/png"
                    ? "png"
                    : "jpg";
              let _b64 = up.base64;
              if (window.WatermarkClient?.enabled?.("image") === true) {
                const cl = await window.WatermarkClient.cleanBase64(
                  _b64,
                  up.mime,
                  "image",
                );
                if (cl.cleaned) _b64 = cl.base64;
              }
              const bin = atob(_b64);
              const bytes = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
              blobUrl = URL.createObjectURL(
                new Blob([bytes], { type: up.mime }),
              );
              downloadBlobUrls.add(blobUrl);
              url = blobUrl;
              suffix = `_${res}`;
            }
          }
        } catch (e) {
          console.warn("[EditorExecutor] API upscale exception:", e?.message);
          throw Object.assign(e, { noReplay: true });
        }
        if (!url) {
          console.warn(
            `[EditorExecutor] API upscale ${res} failed; native download suppressed`,
          );
          return false;
        }
      }
      if (!url) url = nativeUrl;
      if (!url && resolvedBase64) {
        const bin = atob(resolvedBase64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        blobUrl = URL.createObjectURL(
          new Blob([bytes], {
            type: resolvedMime || (isVideo ? "video/mp4" : "image/jpeg"),
          }),
        );
        downloadBlobUrls.add(blobUrl);
        url = blobUrl;
        if (!isVideo)
          ext =
            resolvedMime === "image/webp"
              ? "webp"
              : (resolvedMime || "").includes("png")
                ? "png"
                : "jpg";
      }
      if (!url) return false;
      const s = await window.DownloadHelper.getSettings();
      let filename = window.DownloadHelper.buildFilename({
        template: s.template,
        project: s.project,
        prompt: dlItem.promptText,
        index: dlItem.index,
        taskName: dlItem.taskName || null,
        folder: s.folder,
        ext,
      });
      if (suffix)
        filename = filename.replace(
          new RegExp(`\\.${ext}$`, "i"),
          `${suffix}.${ext}`,
        );
      if (!isVideo && !suffix) filename = filename.replace(/\.png$/i, "");
      if (
        isVideo &&
        !blobUrl &&
        url &&
        /^https?:/i.test(url) &&
        self.VideoWmClient &&
        window.WatermarkClient?.enabled?.("video")
      ) {
        try {
          const cfgResp = await chrome.runtime.sendMessage({
            action: "getWatermarkConfig",
            mediaType: "video",
          });
          if (cfgResp?.success) {
            let videoResponse;
            try {
              videoResponse = await fetch(url, { cache: "no-store" });
            } catch (_) {
              videoResponse = await fetch(url, {
                credentials: "include",
                cache: "no-store",
              });
            }
            if (!videoResponse.ok)
              throw new Error(`HTTP ${videoResponse.status}`);
            const sourceBlob = await videoResponse.blob();
            const cleaned = await self.VideoWmClient.process(
              sourceBlob,
              cfgResp.cfg,
              {},
            );
            if (cleaned?.applied && cleaned.blob) {
              blobUrl = URL.createObjectURL(cleaned.blob);
              downloadBlobUrls.add(blobUrl);
              url = blobUrl;
              console.log(
                `[EditorExecutor] API native video \u0111\xE3 xo\xE1 watermark \u2014 ${cleaned.stats?.frames || "?"} frame`,
              );
            } else {
              console.warn(
                `[EditorExecutor] API native video kh\xF4ng xo\xE1 \u0111\u01B0\u1EE3c (${cleaned?.reason || "not_applied"}) \u2192 gi\u1EEF b\u1EA3n g\u1ED1c`,
              );
            }
          } else {
            console.warn(
              `[EditorExecutor] API native video thi\u1EBFu watermark config (${cfgResp?.error || "NO_CONFIG"})`,
            );
          }
        } catch (error) {
          console.warn(
            "[EditorExecutor] API native video xo\xE1 watermark l\u1ED7i \u2192 gi\u1EEF b\u1EA3n g\u1ED1c:",
            error?.message || error,
          );
        }
      }
      let resp = null;
      const autoWatermarkEnabled =
        window.WatermarkClient?.enabled?.(isVideo ? "video" : "image") === true;
      if (
        (resolvedBase64 || (!blobUrl && url && /^https?:/.test(url))) &&
        autoWatermarkEnabled
      ) {
        let _b64 = resolvedBase64,
          _mime = resolvedMime;
        try {
          if (!_b64) {
            let _r;
            try {
              _r = await fetch(url, { cache: "no-store" });
            } catch (_e1) {
              _r = await fetch(url, {
                credentials: "include",
                cache: "no-store",
              });
            }
            if (!_r.ok) throw new Error(`HTTP ${_r.status}`);
            const contentType = String(
              _r.headers.get("content-type") || "",
            ).toLowerCase();
            const expectedPrefix = isVideo ? "video/" : "image/";
            if (!contentType.startsWith(expectedPrefix)) {
              throw new Error(
                `INVALID_MEDIA_CONTENT_TYPE:${contentType || "missing"}`,
              );
            }
            const _b = await _r.blob();
            _mime = _b.type || (isVideo ? "video/mp4" : "image/png");
            _b64 = await new Promise((res2, rej) => {
              const fr = new FileReader();
              fr.onload = () => res2(String(fr.result).split(",")[1]);
              fr.onerror = () =>
                rej(new Error("\u0111\u1ECDc blob th\u1EA5t b\u1EA1i"));
              fr.readAsDataURL(_b);
            });
          }
        } catch (e) {
          console.warn(
            "[EditorExecutor] watermark: kh\xF4ng l\u1EA5y \u0111\u01B0\u1EE3c bytes \u2192",
            e?.message,
          );
        }
        const wm = _b64
          ? await new Promise((resolve) => {
              chrome.runtime.sendMessage(
                {
                  action: "removeWatermarkAndDownload",
                  base64: _b64,
                  mime: _mime,
                  filename,
                  mediaType: isVideo ? "video" : "image",
                  waitForComplete: false,
                },
                (r) => {
                  void chrome.runtime.lastError;
                  resolve(r || null);
                },
              );
            })
          : null;
        console.log(
          `[EditorExecutor] watermark: th\u1EED xo\xE1 tr\u01B0\u1EDBc khi t\u1EA3i \u2014 ${wm?.success ? (wm.original ? `\u2705 B\u1EA2N G\u1ED0C, kh\xF4ng ph\xE1t hi\u1EC7n watermark (${wm.watermarkReason || "not_found"})` : "\u2705 B\u1EA2N S\u1EA0CH") : `gi\u1EEF g\u1ED1c (${wm?.reason || "kh\xF4ng r\xF5"})`}`,
        );
        if (wm?.success) resp = { success: true };
      } else if (!blobUrl && url && /^https?:/.test(url)) {
        console.log(
          `[EditorExecutor] watermark: auto ${isVideo ? "video" : "image"} OFF \u2192 t\u1EA3i b\u1EA3n g\u1ED1c`,
        );
      }
      if (!resp) {
        resp = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { action: "chromeDownload", url, filename, waitForComplete: false },
            (r) => resolve(r),
          );
        });
      }
      if (resp?.success) {
        downloadAccepted = true;
        console.log(`[EditorExecutor] API auto-download OK: ${filename}`);
        return true;
      }
      console.warn("[EditorExecutor] API auto-download fail:", resp?.error);
      return false;
    } catch (err) {
      console.error(
        "[EditorExecutor] _downloadApiTile exception:",
        err?.message,
      );
      if (err?.noReplay) throw err;
      return false;
    } finally {
      for (const url of downloadBlobUrls) {
        const revoke = () => {
          if (window.FlowApiAdapter?.revokeOwnedBlobUrl?.(url) !== true)
            URL.revokeObjectURL(url);
        };
        if (downloadAccepted) setTimeout(revoke, 6e4);
        else revoke();
      }
    }
  }
  async _insertSegments(item, segments) {
    const mentionCount = segments.filter((s) => s.voice || s.char).length;
    const wordCount = segments.reduce(
      (n, s) => n + (s.text ? s.text.split(/\s+/).length : 0),
      0,
    );
    const budgetMs = 3e4 + mentionCount * 15e3 + wordCount * 200;
    const startedAt = Date.now();
    let expectedInlineChips = 0;
    let degraded = 0;
    let verifiedGlobalChips = 0;
    let hasText = false;
    let submittedText = null;
    const skipped = [];
    const acceptedSegments = [];
    const accept = (seg) => {
      const previous = acceptedSegments[acceptedSegments.length - 1];
      if (seg.text !== void 0 && previous?.text !== void 0)
        previous.text += seg.text;
      else acceptedSegments.push({ ...seg });
    };
    const fallbackComponentAsText = async (seg, type, name) => {
      const literal =
        seg.literal || `@${type}:${/\s/.test(name) ? `[${name}]` : name}`;
      const textResult = await MessageBridge.insertTextSegment(literal);
      if (textResult?.success === false) {
        console.warn(
          `[EditorExecutor] Mention ${type}:"${name}" fallback text insert failed`,
        );
        return false;
      }
      accept({ text: literal });
      hasText = true;
      submittedText =
        typeof textResult?.value === "string"
          ? textResult.value
          : submittedText;
      console.warn(
        `[EditorExecutor] Mention ${type}:"${name}" unavailable \u2014 kept ${literal} as prompt text`,
      );
      return true;
    };
    let allOk = true;
    for (const seg of segments) {
      if (this._shouldAbortItem(item))
        return {
          success: false,
          aborted: true,
          expectedInlineChips,
          skipped,
          degraded,
          hasText,
        };
      if (Date.now() - startedAt > budgetMs) {
        console.error(
          `[EditorExecutor] Interleave v\u01B0\u1EE3t budget ${Math.round(budgetMs / 1e3)}s (${mentionCount} mention, ${wordCount} t\u1EEB) \u2014 abort loop`,
        );
        return {
          success: false,
          expectedInlineChips,
          skipped,
          degraded,
          hasText,
          error: "interleave_timeout",
        };
      }
      if (seg.text) {
        const r = await MessageBridge.insertTextSegment(seg.text);
        if (r?.success === false) {
          console.warn(
            `[EditorExecutor] Segment text fail (len=${seg.text.length}) \u2014 d\u1EEBng loop, \u0111\u1EC3 retry x\u1EED l\xFD`,
          );
          allOk = false;
          break;
        }
        accept(seg);
        hasText = true;
        submittedText = typeof r?.value === "string" ? r.value : null;
      } else if (seg.voice || seg.char) {
        const type = seg.voice ? "voice" : "char";
        const name = seg.voice || seg.char;
        let knownMissing = false;
        try {
          if (type === "voice") {
            const list =
              window.VoiceRegistry?.getRenderListSync?.("flow") || [];
            knownMissing =
              list.length > 0 &&
              !list.some((v) => (v.search_value || v.name) === name);
          } else {
            const list = window.CharacterRegistry?.getRenderListSync?.() || [];
            knownMissing =
              list.length > 0 &&
              !list.some((c) => (c.search_value || c.name) === name);
          }
        } catch (_) {}
        if (knownMissing) {
          console.warn(
            `[EditorExecutor] Mention ${type}:"${name}" kh\xF4ng c\xF3 trong registry (\u0111\xE3 sync) \u2014 d\xF9ng prompt text, kh\xF4ng ch\u1EA1y automation`,
          );
          skipped.push(`${type}:${name}`);
          if (!(await fallbackComponentAsText(seg, type, name))) {
            allOk = false;
            break;
          }
          continue;
        }
        let r;
        try {
          r =
            type === "voice"
              ? await MessageBridge.addVoiceInline(name)
              : await MessageBridge.addCharacterInline(name);
        } catch (error) {
          r = { success: false, error: error.code || error.message };
        }
        if (r?.success) {
          accept(seg);
          if (r.degraded && item._flowDriverKey === "flow_v2")
            throw new Error("FLOW_RECOVERY_INLINE_MENTION_REQUIRED");
          if (r.degraded) {
            degraded++;
            if (
              r.globalVerified === true &&
              segments.filter((s) => (type === "voice" ? s.voice : s.char))
                .length === 1
            ) {
              verifiedGlobalChips++;
              console.log(
                `[EditorExecutor] Mention ${type}:"${name}" verified in global ingredient row`,
              );
            } else
              console.warn(
                `[EditorExecutor] Mention ${type}:"${name}" degrade global chip (\u0110\u01B0\u1EDDng A)`,
              );
          } else {
            expectedInlineChips++;
          }
        } else {
          console.warn(
            `[EditorExecutor] Mention ${type}:"${name}" fail (${r?.error || "unknown"}) \u2014 fallback prompt text`,
          );
          skipped.push(`${type}:${name}`);
          if (!(await fallbackComponentAsText(seg, type, name))) {
            allOk = false;
            break;
          }
        }
      }
    }
    if (skipped.length > 0) {
      item._mentionSkipped = skipped;
      console.warn(
        `[EditorExecutor] ${skipped.length} component mention d\xF9ng prompt text: ${skipped.join(", ")}`,
      );
    }
    return {
      success: allOk,
      expectedInlineChips,
      skipped,
      degraded,
      verifiedGlobalChips,
      hasText,
      submittedText,
      acceptedSegments,
      exactInlineAudit: item._flowDriverKey === "flow_v2",
    };
  }
  async _resolveInlineAudit(segResult, segments) {
    const accepted = segResult?.acceptedSegments || segments;
    let inline = await MessageBridge.countInlineChips(accepted);
    let lateReconciled = false;
    if (
      inline?.verified !== true &&
      Array.isArray(segResult?.skipped) &&
      segResult.skipped.length > 0
    ) {
      const complete = await MessageBridge.countInlineChips(segments);
      if (
        complete?.verified === true &&
        typeof complete.submittedText === "string"
      ) {
        inline = complete;
        lateReconciled = true;
        segResult.acceptedSegments = segments.map((part) => ({ ...part }));
        segResult.expectedInlineChips = segments.filter(
          (part) => part.voice || part.char,
        ).length;
        segResult.skipped = [];
        console.log(
          "[EditorExecutor] Reconciled late Flow V2 mention mutation from exact final editor document",
        );
      }
    }
    return { inline, lateReconciled };
  }
  async _verifyInlineInsert(segResult, segments) {
    if (!segResult?.success) return false;
    try {
      if (segResult.hasText) {
        const verify = await MessageBridge.verifySlateModel();
        if (!verify?.hasContent) {
          console.warn(
            "[EditorExecutor] Inline verify: Slate model r\u1ED7ng d\xF9 \u0111\xE3 insert text segments",
          );
          return false;
        }
      }
      if (segResult.exactInlineAudit === true && segResult.acceptedSegments) {
        const audit = await this._resolveInlineAudit(segResult, segments);
        if (audit.inline?.verified !== true) {
          console.warn(
            "[EditorExecutor] Inline verify: exact Flow V2 document mismatch",
          );
          return false;
        }
        return true;
      }
      if (segResult.expectedInlineChips > 0) {
        const chipRes = await MessageBridge.countInlineChips();
        const count = chipRes?.count ?? 0;
        if (count < segResult.expectedInlineChips) {
          console.warn(
            `[EditorExecutor] Inline verify: chip inline ${count} < expected ${segResult.expectedInlineChips}`,
          );
          return false;
        }
      }
      return true;
    } catch (e) {
      console.warn("[EditorExecutor] Inline verify error:", e.message);
      return false;
    }
  }
  _getInputTimeout() {
    return window.storageSettings?.getSettings()?.inputTimeout || 1200;
  }
  _getClearEditorDelay() {
    const timeout = this._cachedInputTimeout ?? this._getInputTimeout();
    return Math.round(timeout * 0.4);
  }
  _getSubmitDelay() {
    const timeout = this._cachedInputTimeout ?? this._getInputTimeout();
    return Math.round(timeout * 0.5);
  }
  _getAfterSubmitDelay() {
    const timeout = this._cachedInputTimeout ?? this._getInputTimeout();
    return Math.round(timeout * 0.8);
  }
  _getRandomDelay() {
    if (
      this._cachedRandomDelayMin == null ||
      this._cachedRandomDelayMax == null
    ) {
      const settings = window.storageSettings?.getSettings() || {};
      this._cachedRandomDelayMin = (settings.randomDelayMin ?? 3) * 1e3;
      this._cachedRandomDelayMax = (settings.randomDelayMax ?? 10) * 1e3;
    }
    return this._randomBetween(
      this._cachedRandomDelayMin,
      this._cachedRandomDelayMax,
    );
  }
  _randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  _sleep(ms) {
    const startedAt = Date.now();
    return new Promise((resolve) => {
      this._sleepResolve = resolve;
      this._sleepTimer = setTimeout(() => {
        const actualMs = Date.now() - startedAt;
        if (actualMs - ms > 5e3)
          console.info(
            "[FlowTimerDelay] editor sleep delayed",
            JSON.stringify({
              requestedMs: ms,
              actualMs,
              visibility: document.visibilityState,
            }),
          );
        this._sleepResolve = null;
        resolve();
      }, ms);
    });
  }
  _interruptSleep() {
    if (this._sleepTimer) {
      clearTimeout(this._sleepTimer);
      this._sleepTimer = null;
    }
    if (this._sleepResolve) {
      this._sleepResolve();
      this._sleepResolve = null;
    }
  }
  pause() {
    this._isPaused = true;
  }
  resume() {
    this._isPaused = false;
  }
  stop() {
    this._shouldStop = true;
    this._isPaused = false;
    this._interruptSleep();
  }
  interruptCurrentItem() {
    this._interruptSleep();
  }
  reset() {
    this._processedCount = 0;
    this._lastSettings = null;
    this._currentItem = null;
  }
  get state() {
    if (!this._isRunning) return "idle";
    if (this._isPaused) return "paused";
    if (this._currentItem) return "submitting";
    return "running";
  }
  get currentItem() {
    return this._currentItem;
  }
  get processedCount() {
    return this._processedCount;
  }
  get isRunning() {
    return this._isRunning;
  }
  static _incrementDailyStat(key, amount = 1) {
    _EditorExecutor._statQueue = (
      _EditorExecutor._statQueue || Promise.resolve()
    )
      .then(async () => {
        const today = new Date().toISOString().slice(0, 10);
        const currentUserId = window.authManager?.user?.id || null;
        const res = await new Promise((resolve) =>
          chrome.storage.local.get(["af_daily_stats"], resolve),
        );
        const stats = res.af_daily_stats || {};
        if (stats._date !== today || stats._user_id !== currentUserId) {
          stats._date = today;
          stats._user_id = currentUserId;
          stats.flow_prompt_total = 0;
          stats.chatgpt_prompt_total = 0;
          stats.gemini_prompt_total = 0;
          stats.grok_prompt_total = 0;
          stats.flow_fail = 0;
          stats.chatgpt_fail = 0;
          stats.gemini_fail = 0;
          stats.grok_fail = 0;
          stats.task_run = 0;
          stats.workflow_run = 0;
          stats.angles_run = 0;
        }
        stats[key] = (stats[key] || 0) + amount;
        await new Promise((resolve) =>
          chrome.storage.local.set({ af_daily_stats: stats }, resolve),
        );
      })
      .catch((err) => {
        console.warn(
          "[EditorExecutor] _incrementDailyStat error:",
          err.message,
        );
      });
  }
};
__publicField(_EditorExecutor, "_submitCounter", 0);
let EditorExecutor = _EditorExecutor;
