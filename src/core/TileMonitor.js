class TileMonitor {
  constructor() {
    this._activeMonitors = new Map();
    this._waitingMonitors = new Map();
    this._maxConcurrent = 8;
    this._timeout =
      window.SystemConfig?.safeGetTimeout?.("image_timeout_ms") || 3e5;
    this._maxRetries = 2;
    this._queue = null;
    this._onItemCompleted = null;
    this._onTilesReady = null;
    this._claimedTileIds = new Map();
    this._completedCount = 0;
    this._failedCount = 0;
    this._lastClaimAt = 0;
  }
  setup({ queue, onItemCompleted, onTilesReady }) {
    this._queue = queue;
    this._onItemCompleted = onItemCompleted;
    this._onTilesReady = onTilesReady;
  }
  _emitItemStatus(item, phase, extra = {}) {
    if (!item || !window.eventBus) return;
    window.eventBus.emit("item:status", {
      itemId: item.id,
      jobId: item.jobId,
      phase,
      attempt: extra.attempt || 0,
      maxRetries: this._maxRetries,
      successCount: extra.successCount || item.resultTileIds?.length || 0,
      failedCount: extra.failedCount || 0,
      text: extra.text || "",
      timestamp: Date.now(),
    });
  }
  updateSettings({ maxMonitor, timeout, maxRetries }) {
    if (maxMonitor !== void 0) this._maxConcurrent = maxMonitor;
    if (timeout !== void 0) this._timeout = timeout * 1e3;
    if (maxRetries !== void 0) this._maxRetries = maxRetries;
  }
  _matchesOwnedTileIdentity(item, candidate) {
    const canonical = new Set(
      (item?._ownTileIds || []).map((id) => String(id).toLowerCase()),
    );
    const aliases = new Set(
      (item?._ownTileAliases || []).map((id) => String(id).toLowerCase()),
    );
    if (canonical.size === 0 && aliases.size === 0) return false;
    const identities =
      typeof candidate === "string"
        ? [candidate]
        : [
            candidate?.tile_id,
            candidate?.persistent_media_id,
            candidate?.file_name,
            candidate?.tile?.runtimeId,
            candidate?.tile?.persistentMediaId,
          ];
    return identities.filter(Boolean).some((value) => {
      const id = String(value).toLowerCase();
      return canonical.has(id) || aliases.has(id);
    });
  }
  _generationTimeoutFor(item) {
    const isVideo =
      String(item?.settings?.genType || "").toLowerCase() === "video";
    const key = isVideo ? "video_timeout_ms" : "image_timeout_ms";
    return window.SystemConfig?.safeGetTimeout?.(key) || this._timeout;
  }
  _correlationRetryPeers(item) {
    return [...this._activeMonitors.values()]
      .map((monitor) => monitor?.item)
      .filter(
        (candidate) =>
          candidate &&
          candidate !== item &&
          candidate.jobId === item.jobId &&
          candidate._flowDriverKey === "flow_v2" &&
          !candidate.isTerminal &&
          candidate.state !== QueueItem.STATE.CANCELLED &&
          (candidate.flowCorrelationReceipt?.strong === true ||
            ["waiting", "retrying"].includes(
              candidate._correlationRetryDrainState,
            )),
      );
  }
  _correlationRetryOrder(item) {
    const order = Number(item?._submitOrder);
    return [
      Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER,
      String(item?.id || ""),
    ];
  }
  async _waitForCorrelationRetryTurn(item) {
    item._correlationRetryDrainState = "waiting";
    const deadline = Date.now() + this._generationTimeoutFor(item);
    while (Date.now() < deadline) {
      const job = this._queue?.getJob(item.jobId);
      if (
        !job ||
        job.state === "stopped" ||
        item.state === QueueItem.STATE.CANCELLED
      ) {
        delete item._correlationRetryDrainState;
        return false;
      }
      const peers = this._correlationRetryPeers(item);
      const blockingPeers = peers.filter(
        (peer) => peer._correlationRetryDrainState !== "waiting",
      );
      const waitingItems = [
        item,
        ...peers.filter(
          (peer) => peer._correlationRetryDrainState === "waiting",
        ),
      ].sort((left, right) => {
        const [leftOrder, leftId] = this._correlationRetryOrder(left);
        const [rightOrder, rightId] = this._correlationRetryOrder(right);
        return leftOrder - rightOrder || leftId.localeCompare(rightId);
      });
      if (blockingPeers.length === 0 && waitingItems[0] === item) {
        item._correlationRetryDrainState = "retrying";
        return true;
      }
      await this._sleep(500);
    }
    delete item._correlationRetryDrainState;
    return false;
  }
  hasCapacityFor(item) {
    const video = /video/i.test(item?.settings?.genType || "");
    const config = window.ExecutionConfig?.safeGetQueueConfig?.() || {};
    const cap = video
      ? (config.video_max_monitor ?? config.max_monitor ?? this._maxConcurrent)
      : (config.max_monitor ?? this._maxConcurrent);
    const active = [...this._activeMonitors.values()].filter(
      (monitor) =>
        /video/i.test(monitor.item?.settings?.genType || "") === video,
    ).length;
    return active < cap;
  }
  async monitor(item) {
    const abortController = new AbortController();
    this._waitingMonitors || (this._waitingMonitors = new Map());
    this._waitingMonitors.set(item.id, { item, abortController });
    const slotDeadline = Date.now() + this._generationTimeoutFor(item) + 2e4;
    try {
      while (!this.hasCapacityFor(item)) {
        const job = this._queue?.getJob?.(item.jobId);
        if (
          abortController.signal.aborted ||
          item.state === QueueItem.STATE.CANCELLED ||
          job?.state === "stopped"
        )
          throw new DOMException("Aborted", "AbortError");
        if (Date.now() >= slotDeadline)
          throw Object.assign(new Error("FLOW_MONITOR_CAPACITY_TIMEOUT"), {
            noRetry: true,
          });
        await this._sleep(
          Math.min(250, Math.max(0, slotDeadline - Date.now())),
        );
      }
      if (
        abortController.signal.aborted ||
        item.state === QueueItem.STATE.CANCELLED ||
        this._queue?.getJob?.(item.jobId)?.state === "stopped"
      )
        throw new DOMException("Aborted", "AbortError");
    } catch (error) {
      item.state =
        error.name === "AbortError"
          ? QueueItem.STATE.CANCELLED
          : QueueItem.STATE.FAILED;
      if (error.name !== "AbortError") {
        item.error = error.message;
        item.noRetry = true;
        this._failedCount++;
      }
      item.completedAt = Date.now();
      this._onItemCompleted?.(item);
      return;
    } finally {
      if (
        this._waitingMonitors.get(item.id)?.abortController === abortController
      )
        this._waitingMonitors.delete(item.id);
    }
    item.state = QueueItem.STATE.MONITORING;
    if (
      item.flowCorrelationReceipt?.strong === true &&
      (item._ownTileIds?.length || item._ownTileAliases?.length)
    ) {
      const ownedIdentities = [
        ...new Set([...item._ownTileIds, ...(item._ownTileAliases || [])]),
      ];
      let collision = false;
      for (const tileId of ownedIdentities) {
        const existing = this._claimedTileIds.get(tileId);
        if (existing && existing.itemId !== item.id) {
          collision = true;
          break;
        }
      }
      if (collision) {
        item.flowCorrelationReceipt.strong = false;
        item.flowOperationId = null;
        const job = this._queue?.getJob(item.jobId);
        if (job) {
          job.sequentialMode = true;
          job.forcedV2WebSequential = true;
        }
        console.error(
          "[FlowV2Correlation] media claim collision; downgraded job to sequential",
        );
      } else {
        for (const tileId of ownedIdentities) {
          this._claimedTileIds.set(tileId, {
            jobId: item.jobId,
            itemId: item.id,
            claimedAt: Date.now(),
          });
        }
      }
    }
    if (this._activeMonitors.size === 0) {
      this._lastClaimAt = Date.now();
    }
    const promise = this._monitorItem(item, abortController.signal);
    this._activeMonitors.set(item.id, { promise, item, abortController });
    promise.finally(() => {
      if (
        this._activeMonitors.get(item.id)?.abortController === abortController
      )
        this._activeMonitors.delete(item.id);
      if (this._activeMonitors.size === 0) {
        const blockerRunId =
          this._queue?.getJob?.(item.jobId)?._blockerRunId || null;
        if (blockerRunId) {
          Promise.resolve(
            this._queue?._releaseFlowBlocker?.({ blockerRunId }),
          ).catch((error) => {
            console.warn(
              "[ExecutionBlockerAudit] monitor-finally release failed:",
              error?.message || error,
            );
          });
        }
      }
    });
  }
  async _monitorItem(item, abortSignal) {
    const job = this._queue?.getJob(item.jobId);
    if (!job || job.state === "stopped") {
      item.state = QueueItem.STATE.CANCELLED;
      return;
    }
    try {
      this._emitItemStatus(item, "monitoring");
      if (item._phaseR) {
        await this._queue._webRecovery.monitor(item);
        return;
      }
      if (this._queue._webRecovery?.eligible(item)) {
        await this._queue._webRecovery.error(
          item,
          new Error("FLOW_RECOVERY_ADMISSION_MISSING"),
        );
        return;
      }
      if (item._flowCorrelationPromise) {
        try {
          await item._flowCorrelationPromise;
        } catch (error) {
          console.warn(
            "[FlowV2Correlation] response receipt failed before result claim:",
            error?.message || error,
          );
        }
      }
      if (item._flowResultEvidencePromise) {
        try {
          await item._flowResultEvidencePromise;
        } catch (error) {
          console.warn(
            "[FlowV2Correlation] terminal result evidence failed:",
            error?.message || error,
          );
        }
      }
      const result = await this._waitForTiles(item, abortSignal);
      if (item.state === QueueItem.STATE.CANCELLED || job.state === "stopped") {
        return;
      }
      const expectedQuantity = parseInt(item.settings?.quantity) || 1;
      const earlyClaimedSet = new Set(item._earlyClaimedTiles || []);
      let successTids = result?.successTids || [];
      let failedTids = result?.failedTids || [];
      if (
        successTids.length === 0 &&
        failedTids.length === 0 &&
        result?.tiles?.length > 0
      ) {
        const fallbackExpectedType =
          String(item.settings?.genType || "").toLowerCase() === "video"
            ? "video"
            : "image";
        try {
          const identityResponse = await MessageBridge.sendToContentScript(
            "getTileStatuses",
            { tileIds: result.tiles },
          );
          const rejected = [];
          result.tiles = result.tiles.filter((tid) => {
            const statusInfo = identityResponse?.statuses?.[tid] || null;
            const actual = statusInfo?.type || null;
            const sameType = !actual || actual === fallbackExpectedType;
            const isV2CompletedVideo =
              item._flowDriverKey === "flow_v2" &&
              fallbackExpectedType === "video" &&
              statusInfo?.status === "success";
            const identityProven =
              !isV2CompletedVideo ||
              this._matchesOwnedTileIdentity(item, {
                tile_id: tid,
                persistent_media_id: statusInfo?.persistent_media_id,
                file_name: statusInfo?.file_name,
                tile: statusInfo?.tile,
              });
            const keep = sameType && identityProven;
            if (!keep) rejected.push({ id: tid, media_type: actual });
            return keep;
          });
          if (rejected.length > 0) {
            console.warn(
              "[FlowV2ResultIdentity] fallback rejected cross-media claim",
              JSON.stringify({
                item_id: item.id,
                expected_media_type: fallbackExpectedType,
                rejected,
              }),
            );
          }
        } catch (error) {
          console.warn(
            "[FlowV2ResultIdentity] fallback type verification unavailable",
            error?.message || error,
          );
        }
        if (earlyClaimedSet.size > 0) {
          result.tiles = result.tiles.filter((tid) => {
            if (earlyClaimedSet.has(tid)) return true;
            const claimed = this._claimedTileIds.get(tid);
            return !claimed || claimed.itemId === item.id;
          });
          if (result.tiles.length > expectedQuantity) {
            result.tiles.sort((a, b) => {
              const aEarly = earlyClaimedSet.has(a) ? 0 : 1;
              const bEarly = earlyClaimedSet.has(b) ? 0 : 1;
              return aEarly - bEarly;
            });
            result.tiles = result.tiles.slice(0, expectedQuantity);
          }
          console.log(
            `[TileMonitor] Using ${earlyClaimedSet.size} early claimed tile(s) for item ${item.id.substring(0, 8)}`,
          );
        } else {
          const waitStart = Date.now();
          while (Date.now() - waitStart < 5e3) {
            const hasEarlier = [...this._activeMonitors.values()].some(
              (m) =>
                m.item._submitOrder &&
                item._submitOrder &&
                m.item._submitOrder < item._submitOrder &&
                m.item !== item &&
                (m.item.state === "MONITORING" || m.item.state === "SUBMITTED"),
            );
            if (!hasEarlier) break;
            await this._sleep(300);
          }
          result.tiles = result.tiles.filter((tid) => {
            const claimed = this._claimedTileIds.get(tid);
            return !claimed || claimed.itemId === item.id;
          });
          if (result.tiles.length > expectedQuantity) {
            result.tiles = result.tiles.slice(0, expectedQuantity);
          }
          for (const tid of result.tiles) {
            this._claimedTileIds.set(tid, {
              jobId: item.jobId,
              itemId: item.id,
              claimedAt: Date.now(),
            });
          }
          if (result.tiles.length > 0) {
            item._claimedCount =
              (item._claimedCount || 0) + result.tiles.length;
            this._lastClaimAt = Date.now();
          }
        }
        for (const tid of result.tiles) {
          const status = await this._detectTileStatus(tid);
          if (status === "failed") {
            failedTids.push(tid);
          } else if (status === "success") {
            successTids.push(tid);
          } else {
            failedTids.push(tid);
          }
        }
      }
      if (successTids.length === 0 && failedTids.length === 0) {
        if (earlyClaimedSet.size > 0) {
          console.log(
            `[TileMonitor] Completion timeout nh\u01B0ng c\xF3 ${earlyClaimedSet.size} early claimed tile(s)`,
          );
          for (const tid of earlyClaimedSet) {
            const status = await this._detectTileStatus(tid);
            if (status === "failed") {
              failedTids.push(tid);
            } else if (status === "success") {
              successTids.push(tid);
            }
          }
        }
        if (successTids.length === 0 && failedTids.length === 0) {
          try {
            const errState = await MessageBridge.sendToContentScript(
              "getFlowErrorState",
              {},
            );
            const category = errState?.state?.category || null;
            const text = errState?.state?.text || "";
            const verifiedError = this._classifyVerifiedProviderCode(text);
            const effectiveCategory =
              this._categoryForVerifiedProviderType(verifiedError?.errorType) ||
              category;
            const hardCategory =
              effectiveCategory === "policy" ||
              (effectiveCategory === "captcha" &&
                ["bot_detected", "captcha_failed"].includes(
                  verifiedError?.errorType,
                )) ||
              (effectiveCategory === "quota" &&
                [
                  "quota_exceeded",
                  "per_model_daily",
                  "tier_restricted",
                ].includes(verifiedError?.errorType));
            if (hardCategory) {
              const normalCaptcha =
                effectiveCategory === "captcha" &&
                this._queue?._captchaRecoveryMode?.() === "normal_error";
              if (!normalCaptcha) {
                console.warn(
                  `[TileMonitor] 0-tile + Flow error ${effectiveCategory} (DOM). "${text}"`,
                );
                this._handleClassifiedFlowError(
                  item,
                  effectiveCategory,
                  text,
                  null,
                  verifiedError?.errorType || null,
                );
                return;
              }
              console.warn(
                `[TileMonitor] 0-tile captcha uses normal_error \u2014 continue bounded resubmit. "${text}"`,
              );
            } else if (category === "captcha" || category === "quota") {
              console.warn(
                `[TileMonitor] 0-tile ${category} text has no mapped provider code \u2014 continue bounded resubmit.`,
              );
            }
          } catch (e) {}
          console.warn(
            `[TileMonitor] Kh\xF4ng ph\xE1t hi\u1EC7n tiles m\u1EDBi cho item ${item.id.substring(0, 8)} \u2192 queue bounded retry at batch tail`,
          );
          this._requestFallbackSubmit(item, "NO_NEW_TILES");
          return;
        }
      }
      if (result?.thumbnails) {
        const keptSet = new Set([...successTids, ...failedTids]);
        for (const tid of Object.keys(result.thumbnails)) {
          if (!keptSet.has(tid)) {
            delete result.thumbnails[tid];
          }
        }
      }
      console.log(
        `[TileMonitor] _monitorItem classified: ${successTids.length} success, ${failedTids.length} failed for item ${item.id.substring(0, 8)}`,
      );
      if (
        failedTids.length === 0 &&
        successTids.length > 0 &&
        successTids.length < expectedQuantity
      ) {
        const missingCount = expectedQuantity - successTids.length;
        item.state = QueueItem.STATE.PARTIAL_FAIL;
        item.error = `FLOW_RESULT_QUANTITY_MISMATCH:${successTids.length}/${expectedQuantity}`;
        item.resultTileIds = successTids;
        item.resultThumbnails = result?.thumbnails || {};
        item.syncCompletedOutputs?.(successTids, item.resultThumbnails);
        item.syncFailedOutputs?.([], item.error);
        item.tileId = successTids[0] || null;
        item.completedAt = Date.now();
        this._completedCount++;
        this._emitItemStatus(item, "partial_fail", {
          successCount: successTids.length,
          failedCount: missingCount,
        });
        this._onTilesReady?.(item, successTids);
        this._onItemCompleted?.(item);
        return;
      }
      if (failedTids.length === 0) {
        item.state = QueueItem.STATE.COMPLETED;
        item.resultTileIds = successTids;
        item.resultThumbnails = result?.thumbnails || {};
        item.syncCompletedOutputs?.(successTids, item.resultThumbnails);
        item.tileId = successTids[0] || null;
        item.completedAt = Date.now();
        this._completedCount++;
        this._emitItemStatus(item, "completed", {
          successCount: successTids.length,
        });
        if (successTids.length > 0) {
          console.log(
            `[TileMonitor] Calling _onTilesReady with ${successTids.length} tiles:`,
            successTids.map((t) => t.substring(0, 8)),
          );
          this._onTilesReady?.(item, successTids);
        }
        this._onItemCompleted?.(item);
      } else {
        this._emitItemStatus(item, "fail_detected", {
          successCount: successTids.length,
          failedCount: failedTids.length,
        });
        await this._handleFailedTiles(
          item,
          result || {},
          successTids,
          failedTids,
        );
      }
    } catch (err) {
      if (err.name === "AbortError") {
        if (item.state !== QueueItem.STATE.CANCELLED) {
          item.state = QueueItem.STATE.CANCELLED;
        }
        return;
      }
      if (err?.code === "FLOW_COMMAND_ACK_TIMEOUT") {
        item.auditLifecycle?.("flow_command_ack_timeout", {
          action: err.flowCommandAction,
        });
      }
      if (item._phaseR) {
        console.warn(
          "[FlowRecovery] result monitor failed",
          JSON.stringify({
            promptIndex: item.promptIndex ?? null,
            attemptId: item.attemptId || null,
            error: err?.code || err?.message || String(err),
            correlationState: item.correlationState || null,
            acceptancePhase: item._flowAcceptanceAmbiguous?.phase || null,
          }),
        );
        await this._queue._webRecovery.unknown(
          item,
          "FLOW_RECOVERY_RESULT_UNVERIFIED",
        );
        return;
      }
      console.error("[TileMonitor] L\u1ED7i theo d\xF5i item:", err.message);
      item.state = QueueItem.STATE.FAILED;
      item.error = err.message;
      item.completedAt = Date.now();
      this._failedCount++;
      this._onItemCompleted?.(item);
    }
  }
  async _waitTileAppearance(
    preTileIds,
    timeoutMs,
    abortSignal,
    expectedQuantity = 1,
    preFileNames = null,
  ) {
    const startTime = Date.now();
    const pollInterval = 300;
    let bestTiles = [];
    while (Date.now() - startTime < timeoutMs) {
      if (abortSignal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      try {
        const response = await MessageBridge.sendToContentScript(
          "scanNewTiles",
          {
            excludeTileIds: preTileIds || [],
            excludeFileNames: preFileNames ? Array.from(preFileNames) : [],
          },
          {
            signal: abortSignal,
            timeoutMs: Math.max(1, timeoutMs - (Date.now() - startTime)),
          },
        );
        if (response?.success && response.tiles?.length > 0) {
          bestTiles = response.tiles;
          if (bestTiles.length >= expectedQuantity) {
            console.log(
              `[TileMonitor] Early detect: ${bestTiles.length}/${expectedQuantity} tile(s) sau ${Date.now() - startTime}ms`,
            );
            return bestTiles;
          }
        }
      } catch (err) {
        if (err.name === "AbortError") throw err;
        console.warn(
          "[TileMonitor] _waitTileAppearance poll error:",
          err.message,
        );
      }
      await this._sleep(
        Math.min(
          pollInterval,
          Math.max(0, timeoutMs - (Date.now() - startTime)),
        ),
      );
    }
    if (bestTiles.length > 0) {
      console.log(
        `[TileMonitor] _waitTileAppearance timeout, tr\u1EA3 v\u1EC1 ${bestTiles.length}/${expectedQuantity} tile(s) \u0111\xE3 ph\xE1t hi\u1EC7n`,
      );
      return bestTiles;
    }
    console.log(
      `[TileMonitor] _waitTileAppearance timeout sau ${timeoutMs}ms, kh\xF4ng ph\xE1t hi\u1EC7n tile m\u1EDBi`,
    );
    return [];
  }
  async _waitForTiles(item, abortSignal) {
    const expectedQuantity = parseInt(item.settings?.quantity) || 1;
    const claimedTileIds = [];
    const hasProvenIdentity =
      (item._ownTileIds?.length || 0) > 0 ||
      (item._ownTileAliases?.length || 0) > 0;
    if (
      item._domOwnershipAmbiguous === true &&
      !hasProvenIdentity &&
      (item._observedProcessingTileIds?.length || 0) === 0
    ) {
      console.error(
        "[FlowV2ResultIdentity] ambiguous post-submit DOM cardinality; refuse board fallback",
        JSON.stringify({
          item_id: item.id,
          expected_quantity: expectedQuantity,
        }),
      );
      item._earlyClaimedTiles = [];
      return {
        tiles: [],
        thumbnails: {},
        failed: true,
        successTids: [],
        failedTids: [],
      };
    }
    const INITIAL_WAIT = 3e3;
    const BASE_SETTLE_DELAY = 3e3;
    const PER_TILE_SETTLE = 5e3;
    const POLL_INTERVAL = 400;
    const MAX_TIMEOUT = this._generationTimeoutFor(item);
    const startTime = Date.now();
    let lastClaimTime = 0;
    let hasAnyTile = false;
    console.log(
      `[TileMonitor] Starting continuous claim for item ${item.id.substring(0, 8)}, expectedQuantity=${expectedQuantity}`,
    );
    if (item._submitOrder && item.flowCorrelationReceipt?.strong !== true) {
      const ORDER_WAIT_TIMEOUT = 5e3;
      const orderWaitStart = Date.now();
      while (Date.now() - orderWaitStart < ORDER_WAIT_TIMEOUT) {
        if (abortSignal?.aborted)
          throw new DOMException("Aborted", "AbortError");
        const hasEarlierActive = [...this._activeMonitors.values()].some(
          (m) => {
            if (m.item === item) return false;
            if (
              !m.item._submitOrder ||
              m.item._submitOrder >= item._submitOrder
            )
              return false;
            const earlierState = m.item.state;
            const earlierQty = parseInt(m.item.settings?.quantity) || 1;
            const earlierClaimed = m.item._earlyClaimedTiles?.length || 0;
            return (
              (earlierState === QueueItem.STATE.MONITORING ||
                earlierState === QueueItem.STATE.SUBMITTED) &&
              earlierClaimed < earlierQty
            );
          },
        );
        if (!hasEarlierActive) break;
        await this._sleep(300);
      }
      const orderWaitElapsed = Date.now() - orderWaitStart;
      if (orderWaitElapsed > 100) {
        console.log(
          `[TileMonitor] Item ${item.id.substring(0, 8)} waited ${orderWaitElapsed}ms cho earlier items (_submitOrder ${item._submitOrder})`,
        );
      }
    }
    while (Date.now() - startTime < MAX_TIMEOUT) {
      window.MessageBridge?.heartbeatActivateFlowTab?.();
      if (abortSignal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const job = this._queue?.getJob(item.jobId);
      if (!job || job.state === "stopped") {
        throw new DOMException("Aborted", "AbortError");
      }
      const _nowTick = Date.now();
      if (
        claimedTileIds.length < expectedQuantity &&
        (!this._lastPendingHeartbeat ||
          _nowTick - this._lastPendingHeartbeat > 15e3)
      ) {
        this._lastPendingHeartbeat = _nowTick;
        try {
          const _pc =
            (
              await MessageBridge.sendToContentScript("getPendingTileCount", {
                excludeClaimedTileIds: [...this._claimedTileIds.keys()],
              })
            )?.count || 0;
          if (_pc > 0) this._lastClaimAt = Date.now();
        } catch (_) {}
      }
      try {
        const alreadyClaimed = [...claimedTileIds, ...(item.preTileIds || [])];
        const response = await MessageBridge.sendToContentScript(
          "scanNewTiles",
          {
            excludeTileIds: alreadyClaimed,
            excludeFileNames: Array.from(item.preFileNames || []),
          },
          {
            signal: abortSignal,
            timeoutMs: Math.max(1, MAX_TIMEOUT - (Date.now() - startTime)),
          },
        );
        if (response?.success && response.tiles?.length > 0) {
          const remaining = expectedQuantity - claimedTileIds.length;
          if (remaining > 0) {
            let candidates = response.tiles;
            const expectedMediaType =
              String(item.settings?.genType || "").toLowerCase() === "video"
                ? "video"
                : "image";
            const rejectedMedia = candidates.filter((candidate) => {
              const actual =
                typeof candidate === "string" ? null : candidate?.media_type;
              return !!actual && actual !== expectedMediaType;
            });
            candidates = candidates.filter((candidate) => {
              const actual =
                typeof candidate === "string" ? null : candidate?.media_type;
              return !actual || actual === expectedMediaType;
            });
            const observedProcessing = new Set(
              item._observedProcessingTileIds || [],
            );
            for (const candidate of candidates) {
              if (typeof candidate === "string") continue;
              const status =
                candidate?.status || candidate?.tile?.status || null;
              if (status === "processing" && candidate?.tile_id)
                observedProcessing.add(candidate.tile_id);
            }
            item._observedProcessingTileIds = [...observedProcessing];
            item.setPendingOwners?.(
              item._observedProcessingTileIds,
              "processing",
            );
            if (item._mustFollowProcessingOwners === true) {
              const rejectedOutsidePendingOwners = candidates.filter(
                (candidate) => {
                  const id =
                    typeof candidate === "string"
                      ? candidate
                      : candidate?.tile_id;
                  return !observedProcessing.has(id);
                },
              );
              if (rejectedOutsidePendingOwners.length > 0) {
                console.warn(
                  "[FlowV2ResultIdentity] rejected result outside processing-owner lineage",
                  JSON.stringify({
                    item_id: item.id,
                    expected_media_type: expectedMediaType,
                    pending_owner_ids: [...observedProcessing],
                    rejected_ids: rejectedOutsidePendingOwners.map(
                      (candidate) =>
                        typeof candidate === "string"
                          ? candidate
                          : candidate?.tile_id,
                    ),
                  }),
                );
              }
              candidates = candidates.filter((candidate) => {
                const id =
                  typeof candidate === "string"
                    ? candidate
                    : candidate?.tile_id;
                return observedProcessing.has(id);
              });
            }
            const rejectedUnprovenCompleted = candidates.filter((candidate) => {
              if (
                typeof candidate === "string" ||
                expectedMediaType !== "video"
              )
                return false;
              const id = candidate?.tile_id || "";
              const status =
                candidate?.status || candidate?.tile?.status || null;
              return (
                status === "success" &&
                !observedProcessing.has(id) &&
                !this._matchesOwnedTileIdentity(item, candidate)
              );
            });
            if (rejectedUnprovenCompleted.length > 0) {
              console.warn(
                "[FlowV2ResultIdentity] rejected unproven completed video remount",
                JSON.stringify({
                  item_id: item.id,
                  rejected_ids: rejectedUnprovenCompleted.map(
                    (candidate) => candidate?.tile_id,
                  ),
                }),
              );
            }
            const rejectedUnprovenIds = new Set(
              rejectedUnprovenCompleted.map((candidate) => candidate?.tile_id),
            );
            candidates = candidates.filter((candidate) => {
              const id =
                typeof candidate === "string" ? candidate : candidate?.tile_id;
              return !rejectedUnprovenIds.has(id);
            });
            candidates = candidates.slice().sort((a, b) => {
              const score = (candidate) => {
                if (typeof candidate === "string") {
                  return /^[0-9a-f-]{36}$/i.test(candidate) ||
                    /^(?![0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$)[A-Za-z0-9_-]{32,1024}$/i.test(
                      candidate,
                    )
                    ? 1
                    : 0;
                }
                const durableIdentity =
                  /^(?![0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$)[A-Za-z0-9_-]{32,1024}$/i.test(
                    String(candidate?.persistent_media_id || ""),
                  ) ||
                  candidate?.identity_durability === "durable" ||
                  candidate?.tile?.durability === "durable";
                return (
                  (durableIdentity ? 4 : 0) +
                  (candidate?.tile?.durability === "durable" ? 2 : 0) +
                  (/^[0-9a-f-]{36}$/i.test(candidate?.tile_id || "") ? 1 : 0)
                );
              };
              return score(b) - score(a);
            });
            if (rejectedMedia.length > 0) {
              console.warn(
                "[FlowV2ResultIdentity] rejected cross-media claim",
                JSON.stringify({
                  item_id: item.id,
                  expected_media_type: expectedMediaType,
                  rejected: rejectedMedia.map((candidate) => ({
                    id:
                      typeof candidate === "string"
                        ? candidate
                        : candidate?.tile_id,
                    media_type:
                      typeof candidate === "string"
                        ? null
                        : candidate?.media_type,
                    persistent_identity_kind:
                      /^(?![0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$)[A-Za-z0-9_-]{32,1024}$/i.test(
                        String(
                          typeof candidate === "string"
                            ? ""
                            : candidate?.persistent_media_id || "",
                        ),
                      )
                        ? "flow_v2_asb"
                        : "other_or_missing",
                    persistent_identity_length: String(
                      typeof candidate === "string"
                        ? ""
                        : candidate?.persistent_media_id || "",
                    ).length,
                  })),
                }),
              );
            }
            if (item._ownTileIds?.length || item._ownTileAliases?.length) {
              candidates = candidates.filter((candidate) =>
                this._matchesOwnedTileIdentity(item, candidate),
              );
            }
            const tilesToClaim =
              candidates.length > remaining
                ? candidates.slice(0, remaining)
                : candidates;
            for (const tileObj of tilesToClaim) {
              const tid =
                typeof tileObj === "string" ? tileObj : tileObj.tile_id;
              if (!tid) continue;
              if (claimedTileIds.includes(tid)) continue;
              const existing = this._claimedTileIds.get(tid);
              if (!existing || existing.itemId === item.id) {
                this._claimedTileIds.set(tid, {
                  jobId: item.jobId,
                  itemId: item.id,
                  claimedAt: Date.now(),
                });
                claimedTileIds.push(tid);
                lastClaimTime = Date.now();
                hasAnyTile = true;
                item._claimedCount = claimedTileIds.length;
                this._lastClaimAt = Date.now();
                const claimedMeta =
                  typeof tileObj === "string" ? null : tileObj;
                console.log(
                  "[FlowV2ResultIdentity] claimed result tile",
                  JSON.stringify({
                    item_id: item.id,
                    expected_media_type: expectedMediaType,
                    runtime_id: tid,
                    actual_media_type: claimedMeta?.media_type || null,
                    persistent_identity_kind: /^[A-Za-z0-9_-]{32,1024}$/.test(
                      String(claimedMeta?.persistent_media_id || ""),
                    )
                      ? "flow_v2_asb"
                      : "other_or_missing",
                    persistent_identity_length: String(
                      claimedMeta?.persistent_media_id || "",
                    ).length,
                    identity_durability: claimedMeta?.tile?.durability || null,
                    claimed_count: claimedTileIds.length,
                    expected_quantity: expectedQuantity,
                  }),
                );
              }
            }
          }
        }
        const elapsed = Date.now() - startTime;
        const timeSinceLastClaim =
          lastClaimTime > 0 ? Date.now() - lastClaimTime : elapsed;
        if (claimedTileIds.length >= expectedQuantity) {
          console.log(
            `[TileMonitor] Got all ${expectedQuantity} tile(s) for item ${item.id.substring(0, 8)} in ${elapsed}ms`,
          );
          break;
        }
        const missingTiles = expectedQuantity - claimedTileIds.length;
        const dynamicSettleDelay =
          BASE_SETTLE_DELAY + missingTiles * PER_TILE_SETTLE;
        if (
          elapsed > INITIAL_WAIT &&
          hasAnyTile &&
          timeSinceLastClaim > dynamicSettleDelay
        ) {
          let pending = 0;
          if (claimedTileIds.length < expectedQuantity) {
            try {
              pending =
                (
                  await MessageBridge.sendToContentScript(
                    "getPendingTileCount",
                    { excludeClaimedTileIds: [...this._claimedTileIds.keys()] },
                  )
                )?.count || 0;
            } catch (_) {}
          }
          if (pending > 0 && claimedTileIds.length < expectedQuantity) {
            lastClaimTime = Date.now();
            console.log(
              `[TileMonitor] Settle hit nh\u01B0ng DOM c\xF2n ${pending} tile gen orphan \u2192 continue claim cho item ${item.id.substring(0, 8)}`,
            );
          } else {
            if (claimedTileIds.length < expectedQuantity) {
              console.warn(
                `[TileMonitor] \u26A0\uFE0F INCOMPLETE: settled v\u1EDBi ${claimedTileIds.length}/${expectedQuantity} tile(s) cho item ${item.id.substring(0, 8)} \u2014 DOM h\u1EBFt pending gen sau ${dynamicSettleDelay}ms.`,
              );
            } else {
              console.log(
                `[TileMonitor] Settled v\u1EDBi ${claimedTileIds.length}/${expectedQuantity} tile(s) cho item ${item.id.substring(0, 8)} (no new tiles in ${dynamicSettleDelay}ms)`,
              );
            }
            break;
          }
        }
      } catch (err) {
        if (err.name === "AbortError") throw err;
        console.warn("[TileMonitor] Continuous claim poll error:", err.message);
      }
      await this._sleep(POLL_INTERVAL);
    }
    item._earlyClaimedTiles = [...claimedTileIds];
    if (claimedTileIds.length > 0) {
      console.log(
        `[TileMonitor] Waiting for ${claimedTileIds.length} claimed tile(s) to complete:`,
        claimedTileIds.map((t) => t.substring(0, 8)),
      );
      const remainingTimeout = Math.max(
        MAX_TIMEOUT - (Date.now() - startTime),
        3e4,
      );
      const completionResult = await this._waitClaimedTilesComplete(
        claimedTileIds,
        remainingTimeout,
        item,
        abortSignal,
      );
      console.log(
        `[TileMonitor] _waitForTiles returning: ${completionResult.success.length} success, ${completionResult.failed.length} failed`,
      );
      const allTiles = [
        ...completionResult.success,
        ...completionResult.failed,
      ];
      return {
        tiles: allTiles,
        thumbnails: completionResult.thumbnails,
        failed: completionResult.failed.length > 0,
        successTids: completionResult.success,
        failedTids: completionResult.failed,
      };
    }
    console.log(
      `[TileMonitor] No tiles claimed, falling back to waitForNewTiles for item ${item.id.substring(0, 8)}`,
    );
    const tilePromise = MessageBridge.waitForNewTiles(
      item.preTileIds,
      this._generationTimeoutFor(item),
      {
        captureFileNames: true,
        preFileNames: item.preFileNames,
        operationId: item.id,
        expectedMediaType: item.settings?.genType || null,
        signal: abortSignal,
      },
    );
    return tilePromise;
  }
  async _classifyFlowFailure(tileId) {
    try {
      const errState = await MessageBridge.sendToContentScript(
        "getFlowErrorState",
        { tileId },
      );
      const category =
        errState?.tileCategory || errState?.state?.category || null;
      const tileText = errState?.tileReason || "";
      const stateText = errState?.state?.text || "";
      const tileType =
        this._classifyVerifiedProviderCode(tileText)?.errorType || null;
      const stateType =
        this._classifyVerifiedProviderCode(stateText)?.errorType || null;
      const errorType = tileType || stateType;
      const text = tileType
        ? tileText
        : stateType
          ? stateText
          : tileText || stateText;
      return {
        category: this._categoryForVerifiedProviderType(errorType) || category,
        text,
        errorType,
      };
    } catch (e) {
      console.warn(
        "[TileMonitor] getFlowErrorState failed (degrade \u2192 retry nh\u01B0 c\u0169):",
        e.message,
      );
      return { category: null, text: "", errorType: null };
    }
  }
  _categoryForVerifiedProviderType(errorType) {
    if (["bot_detected", "captcha_failed"].includes(errorType))
      return "captcha";
    if (
      ["quota_exceeded", "per_model_daily", "tier_restricted"].includes(
        errorType,
      )
    )
      return "quota";
    if (errorType === "content_blocked") return "policy";
    return null;
  }
  _classifyVerifiedProviderCode(text) {
    if (typeof text !== "string" || !text) return null;
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
    const codes = text.match(/\b[A-Z][A-Z0-9_]{2,119}\b/g) || [];
    for (const code of codes) {
      const match = entries.find(
        ([prefix]) => code === prefix || code.startsWith(`${prefix}_`),
      );
      if (match) return { code, errorType: match[1] };
    }
    return null;
  }
  async _handleFailedTiles(item, result, successTids, failedTids) {
    const itemOwnTileIds = [...(result.tiles || [])];
    if (!item.resultThumbnails) item.resultThumbnails = {};
    if (result.thumbnails) {
      Object.assign(item.resultThumbnails, result.thumbnails);
    }
    if (successTids.length > 0) {
      if (!item.resultTileIds) item.resultTileIds = [];
      item.resultTileIds.push(...successTids);
      item.syncCompletedOutputs?.(successTids, item.resultThumbnails);
      this._onTilesReady?.(item, successTids);
    }
    let remainingFailed = [...failedTids];
    let totalRetrySucceeded = 0;
    if (remainingFailed.length > 0) {
      const { category, text, errorType } = await this._classifyFlowFailure(
        remainingFailed[0],
      );
      const hardCategory =
        category === "policy" ||
        (category === "captcha" &&
          ["bot_detected", "captcha_failed"].includes(errorType)) ||
        (category === "quota" &&
          ["quota_exceeded", "per_model_daily", "tier_restricted"].includes(
            errorType,
          ));
      if (hardCategory) {
        const normalCaptcha =
          category === "captcha" &&
          this._queue?._captchaRecoveryMode?.() === "normal_error";
        if (normalCaptcha) {
          console.warn(
            `[TileMonitor] Captcha classified as normal_error \u2014 continue bounded retry. "${text}"`,
          );
        } else {
          console.warn(
            `[TileMonitor] Flow error classified: ${category} \u2014 skip retry. "${text}"`,
          );
          this._handleClassifiedFlowError(
            item,
            category,
            text,
            remainingFailed[0],
            errorType,
          );
          return;
        }
      } else if (category === "captcha" || category === "quota") {
        console.warn(
          `[TileMonitor] ${category} text has no mapped provider code \u2014 continue bounded retry.`,
        );
      }
      if (category === "rate_limit") {
        console.warn(
          `[TileMonitor] Flow rate-limited: "${text}" \u2014 retry v\u1EABn ch\u1EA1y (PromptQueue backoff).`,
        );
        window.eventBus?.emit("flow:error_classified", {
          category,
          text,
          jobId: item.jobId,
          itemId: item.id,
        });
      }
    }
    if (remainingFailed.length > 0 && this._maxRetries > 0) {
      let retryDrainSafe = true;
      let retryDrainTimedOut = false;
      if (item.flowCorrelationReceipt?.strong === true) {
        window.flowV2CorrelationBroker?.revokeParallel?.(item, "retry_pending");
        retryDrainSafe = await this._waitForCorrelationRetryTurn(item);
        if (!retryDrainSafe) {
          retryDrainTimedOut =
            item.state !== QueueItem.STATE.CANCELLED &&
            this._queue?.getJob(item.jobId)?.state !== "stopped";
          if (retryDrainTimedOut) {
            item.error = "CORRELATION_RETRY_DRAIN_TIMEOUT";
            console.warn(
              "[FlowV2Correlation] retry skipped because same-job correlated siblings did not drain before timeout",
            );
          }
        }
      }
      for (
        let attempt = 1;
        retryDrainSafe &&
        attempt <= this._maxRetries &&
        remainingFailed.length > 0;
        attempt++
      ) {
        const retryJob = this._queue?.getJob(item.jobId);
        if (
          !retryJob ||
          retryJob.state === "stopped" ||
          item.state === QueueItem.STATE.CANCELLED
        ) {
          break;
        }
        window.eventBus?.emit("retry:status", {
          text: `Click Retry (${attempt}/${this._maxRetries})`,
        });
        this._emitItemStatus(item, "click_retry", {
          attempt,
          successCount: successTids.length + totalRetrySucceeded,
          failedCount: remainingFailed.length,
        });
        const retryResult = await this._retryViaButton(
          remainingFailed,
          itemOwnTileIds,
          item,
        );
        const clickedCount = retryResult?.clickedCount || 0;
        const phaseAfterCall =
          clickedCount > 0 ? "wait_retry" : "retry_skipped";
        this._emitItemStatus(item, phaseAfterCall, {
          attempt,
          successCount: successTids.length + totalRetrySucceeded,
          failedCount: remainingFailed.length,
          text:
            clickedCount > 0
              ? `\u0110\xE3 click ${clickedCount}, ch\u1EDD tile`
              : `Skip click (\u0111\xE3 click tr\u01B0\u1EDBc)`,
        });
        if (retryResult?.newTileIds?.length > 0) {
          const retryClaimedTileIds = [];
          for (const tid of retryResult.newTileIds) {
            const existing = this._claimedTileIds.get(tid);
            if (!existing || existing.itemId === item.id) {
              this._claimedTileIds.set(tid, {
                jobId: item.jobId,
                itemId: item.id,
                claimedAt: Date.now(),
              });
              retryClaimedTileIds.push(tid);
              itemOwnTileIds.push(tid);
            }
          }
          if (retryClaimedTileIds.length > 0) {
            const retryCompletion = await this._waitClaimedTilesComplete(
              retryClaimedTileIds,
              this._generationTimeoutFor(item),
              item,
            );
            if (retryCompletion.success.length > 0) {
              item.resultTileIds.push(...retryCompletion.success);
              Object.assign(item.resultThumbnails, retryCompletion.thumbnails);
              item.syncCompletedOutputs?.(
                retryCompletion.success,
                item.resultThumbnails,
              );
              this._onTilesReady?.(item, retryCompletion.success);
              totalRetrySucceeded += retryCompletion.success.length;
            }
            remainingFailed = [
              ...(retryResult?.stillFailed || []),
              ...retryCompletion.failed,
            ];
          }
        } else if (retryResult?.succeeded?.length > 0) {
          for (const tid of retryResult.succeeded) {
            this._claimedTileIds.set(tid, {
              jobId: item.jobId,
              itemId: item.id,
              claimedAt: Date.now(),
            });
            itemOwnTileIds.push(tid);
          }
          const legacyCompletion = await this._waitClaimedTilesComplete(
            retryResult.succeeded,
            this._generationTimeoutFor(item),
            item,
          );
          if (legacyCompletion.success.length > 0) {
            item.resultTileIds.push(...legacyCompletion.success);
            Object.assign(item.resultThumbnails, legacyCompletion.thumbnails);
            item.syncCompletedOutputs?.(
              legacyCompletion.success,
              item.resultThumbnails,
            );
            this._onTilesReady?.(item, legacyCompletion.success);
            totalRetrySucceeded += legacyCompletion.success.length;
          }
          remainingFailed = [
            ...(retryResult?.stillFailed || []),
            ...legacyCompletion.failed,
          ];
        } else {
          if (
            Array.isArray(retryResult?.stillFailed) &&
            retryResult.stillFailed.length > 0
          ) {
            remainingFailed = retryResult.stillFailed;
          }
        }
        if (remainingFailed.length > 0) {
          const { category, text, errorType } = await this._classifyFlowFailure(
            remainingFailed[0],
          );
          const hardCategory =
            category === "policy" ||
            (category === "captcha" &&
              ["bot_detected", "captcha_failed"].includes(errorType)) ||
            (category === "quota" &&
              ["quota_exceeded", "per_model_daily", "tier_restricted"].includes(
                errorType,
              ));
          if (hardCategory) {
            const normalCaptcha =
              category === "captcha" &&
              this._queue?._captchaRecoveryMode?.() === "normal_error";
            if (!normalCaptcha) {
              console.warn(
                `[TileMonitor] Retry round ${attempt}: Flow error ${category} xu\u1EA5t hi\u1EC7n gi\u1EEFa ch\u1EEBng \u2192 d\u1EEBng retry. "${text}"`,
              );
              this._handleClassifiedFlowError(
                item,
                category,
                text,
                remainingFailed[0],
                errorType,
              );
              return;
            }
            console.warn(
              `[TileMonitor] Retry round ${attempt}: captcha remains normal_error \u2014 bounded retry continues.`,
            );
          } else if (category === "captcha" || category === "quota") {
            console.warn(
              `[TileMonitor] Retry round ${attempt}: ${category} text has no mapped provider code \u2014 continue bounded retry.`,
            );
          }
        }
        if (remainingFailed.length === 0) break;
      }
      const fallbackJob = this._queue?.getJob(item.jobId);
      if (
        !fallbackJob ||
        fallbackJob.state === "stopped" ||
        item.state === QueueItem.STATE.CANCELLED
      ) {
        if (item.state !== QueueItem.STATE.CANCELLED) {
          item.state = QueueItem.STATE.CANCELLED;
        }
        return;
      }
      if (retryDrainTimedOut) {
        item.noRetry = true;
        item.syncFailedOutputs?.(remainingFailed, item.error);
        item.completedAt = Date.now();
        if (item.resultTileIds?.length > 0) {
          item.state = QueueItem.STATE.PARTIAL_FAIL;
          item.tileId = item.resultTileIds[0] || null;
          this._completedCount++;
          this._emitItemStatus(item, "partial_fail", {
            successCount: item.resultTileIds.length,
            failedCount: remainingFailed.length || failedTids.length,
          });
        } else {
          item.state = QueueItem.STATE.FAILED;
          this._failedCount++;
          this._emitItemStatus(item, "failed", {
            failedCount: remainingFailed.length || failedTids.length,
          });
        }
        this._onItemCompleted?.(item);
        return;
      }
      const totalSucceeded = successTids.length + totalRetrySucceeded;
      if (totalSucceeded === 0 && this._maxRetries > 0) {
        this._requestFallbackSubmit(item, "TILES_FAILED_AFTER_RETRY", {
          failedCount: remainingFailed.length,
        });
        return;
      }
    }
    const remainingFailedCount = remainingFailed.length;
    item.syncFailedOutputs?.(remainingFailed, item.error || null);
    if (item.resultTileIds && item.resultTileIds.length > 0) {
      item.state =
        remainingFailedCount > 0
          ? QueueItem.STATE.PARTIAL_FAIL
          : QueueItem.STATE.COMPLETED;
      item.tileId = item.resultTileIds[0] || null;
      this._completedCount++;
      this._emitItemStatus(
        item,
        remainingFailedCount > 0 ? "partial_fail" : "completed",
        {
          successCount: item.resultTileIds.length,
          failedCount: remainingFailedCount,
        },
      );
    } else {
      item.state = QueueItem.STATE.FAILED;
      this._failedCount++;
      this._emitItemStatus(item, "failed", {
        failedCount: remainingFailedCount || failedTids.length,
      });
    }
    item.completedAt = Date.now();
    this._onItemCompleted?.(item);
  }
  async _retryViaButton(failedTids, itemOwnTileIds, item = null) {
    try {
      const ownTileSet = new Set(itemOwnTileIds || []);
      const excludeTileIds = Array.from(this._claimedTileIds.keys()).filter(
        (tid) => !ownTileSet.has(tid),
      );
      if (
        item?._flowDriverKey === "flow_v2" &&
        window.flowV2CorrelationBroker
      ) {
        const clickedAttempts = [];
        const stillFailed = [];
        const retryStopped = () =>
          item.state === QueueItem.STATE.CANCELLED ||
          this._queue?.getJob?.(item.jobId)?.state === "stopped";
        for (const failedTileId of failedTids) {
          if (retryStopped()) {
            stillFailed.push(failedTileId);
            continue;
          }
          const retryAttempt = {
            id: crypto.randomUUID(),
            attemptId: null,
            _owner: item._owner,
            _flowDriverKey: "flow_v2",
            settings: {
              ...item.settings,
              quantity: 1,
              manualSubmitMode: false,
            },
            auditLifecycle: (event, detail) =>
              item.auditLifecycle?.(`retry_${event}`, {
                failedTileId,
                ...detail,
              }),
          };
          retryAttempt.attemptId = retryAttempt.id;
          const armed = await window.flowV2CorrelationBroker.arm(retryAttempt);
          if (!armed?.armed) {
            stillFailed.push(failedTileId);
            continue;
          }
          const click = await MessageBridge.sendToContentScript(
            "retryFailedTilesViaButton",
            {
              failedTileIds: [failedTileId],
              timeout: this._generationTimeoutFor(item),
              excludeTileIds,
              ackOnly: true,
            },
          );
          const ownerId = click?.newTileIds?.[0] || null;
          if (!ownerId) {
            stillFailed.push(failedTileId);
            await window.flowV2CorrelationBroker.disarm(retryAttempt, "failed");
            continue;
          }
          retryAttempt._ownTileAliases = [ownerId];
          clickedAttempts.push({ failedTileId, ownerId, retryAttempt });
        }
        const newTileIds = [];
        for (const entry of clickedAttempts) {
          if (retryStopped()) {
            stillFailed.push(entry.failedTileId);
            await window.flowV2CorrelationBroker.disarm(
              entry.retryAttempt,
              "failed",
            );
            continue;
          }
          item._ownTileIds = [
            ...new Set([...(item._ownTileIds || []), entry.ownerId]),
          ];
          item._ownTileAliases = [
            ...new Set([
              ...(item._ownTileAliases || []),
              ...(entry.retryAttempt._ownTileAliases || []),
            ]),
          ];
          newTileIds.push(entry.ownerId);
          await window.flowV2CorrelationBroker.disarm(
            entry.retryAttempt,
            "monitoring",
          );
          item.auditLifecycle?.("retry_owner_accepted", {
            failedTileId: entry.failedTileId,
            ownerId: entry.ownerId,
            evidence: "exact_click_unique_non_success_owner",
          });
        }
        return {
          succeeded: [],
          stillFailed: [...new Set(stillFailed)],
          newTileIds: [...new Set(newTileIds)],
          clickedCount: clickedAttempts.length,
        };
      }
      const resp = await MessageBridge.sendToContentScript(
        "retryFailedTilesViaButton",
        {
          failedTileIds: failedTids,
          timeout: this._generationTimeoutFor(item),
          excludeTileIds,
        },
      );
      return resp || { succeeded: [], stillFailed: failedTids };
    } catch (err) {
      console.warn(
        "[TileMonitor] Retry via button th\u1EA5t b\u1EA1i:",
        err.message,
      );
      return { succeeded: [], stillFailed: failedTids };
    }
  }
  async _detectTileStatus(tileId) {
    try {
      const resp = await MessageBridge.sendToContentScript("detectTileStatus", {
        tileId,
      });
      return resp?.status || "unknown";
    } catch (err) {
      console.warn(
        "[TileMonitor] Kh\xF4ng th\u1EC3 ki\u1EC3m tra tr\u1EA1ng th\xE1i tile:",
        err.message,
      );
      return "unknown";
    }
  }
  _handleClassifiedFlowError(
    item,
    category,
    text,
    tileId,
    verifiedErrorType = null,
  ) {
    item.flowErrorCategory = category;
    item.flowErrorText = text;
    if (verifiedErrorType) item.errorType = verifiedErrorType;
    const job = this._queue?.getJob?.(item.jobId);
    const pausable = !!(job && job.owner === "prompts");
    const recoveryMode =
      category === "captcha" ? this._queue?._captchaRecoveryMode?.() : null;
    const captchaResumeExhausted =
      category === "captcha" &&
      pausable &&
      recoveryMode === "pause_resume" &&
      (item.retrySubmitCount || 0) >= this._maxRetries;
    item._captchaResumeExhausted = captchaResumeExhausted;
    const pauseCaptcha =
      category === "captcha" &&
      pausable &&
      recoveryMode === "pause_resume" &&
      !captchaResumeExhausted;
    if (category === "captcha" && !pauseCaptcha) {
      item.noRetry = true;
      item.state = QueueItem.STATE.FAILED;
      item.error = text || category;
      item.errorType = item.errorType || "captcha_failed";
      item.completedAt = Date.now();
    }
    window.eventBus?.emit("flow:error_classified", {
      category,
      text,
      jobId: item.jobId,
      itemId: item.id,
      tileId: tileId || null,
      pausable,
      recoveryMode,
      action: category === "captcha" ? recoveryMode : null,
      verifiedErrorType,
    });
    if (pauseCaptcha) {
      item.retrySubmitCount = (item.retrySubmitCount || 0) + 1;
      item.state = QueueItem.STATE.PENDING;
      item._webRetryReservedAttempt = item.retrySubmitCount;
      item._webRetryBatchTailOrder = this._queue._webRetryBatchTailSequence =
        (this._queue._webRetryBatchTailSequence || 0) + 1;
      item.priority = 100;
      item.error = null;
      item.flowErrorCategory = null;
      this._queue?.enqueue?.(item);
      return;
    }
    if (
      category === "captcha" &&
      this._queue?.getJob?.(item.jobId)?.state === "stopped"
    )
      return;
    if (!item.isTerminal) {
      item.noRetry = true;
      item.state = QueueItem.STATE.FAILED;
      item.error = text || category;
      item.completedAt = Date.now();
    }
    this._failedCount++;
    this._onItemCompleted?.(item);
  }
  _requestFallbackSubmit(
    item,
    failureReason = "WEB_FALLBACK_EXHAUSTED",
    options = {},
  ) {
    if (!item || item.isTerminal) return;
    const job = this._queue?.getJob?.(item.jobId);
    if (!job || !["running", "paused"].includes(job.state)) {
      item.state = QueueItem.STATE.CANCELLED;
      return;
    }
    if (
      this._queue?.scheduleWebRetryAtBatchTail?.(item, failureReason, {
        source: "tile_monitor",
      })
    ) {
      this._emitItemStatus(item, "tier2_resubmit_queued", {
        failedCount: options.failedCount || 0,
      });
    } else {
      const code = "FLOW_WEB_RETRY_EXHAUSTED";
      item.state = QueueItem.STATE.FAILED;
      item.noRetry = true;
      item.error = code;
      item.errorType = "web_retry_exhausted";
      item.errorPolicy = {
        ...(item.errorPolicy || {}),
        code,
        stage: "web_retry",
        recoveryCause: failureReason || item._webRetryFailureReason || null,
      };
      item.syncFailedOutputs?.([], code);
      item.completedAt = Date.now();
      item.auditLifecycle?.("web_retry_exhausted", {
        reason: item.errorPolicy.recoveryCause,
        retrySubmitCount: item.retrySubmitCount || 0,
        maxRetries: this._queue?._webRetryMaxRetries ?? null,
      });
      this._failedCount++;
      this._onItemCompleted?.(item);
    }
  }
  abortJob(jobId) {
    for (const monitor of this._waitingMonitors?.values() || []) {
      if (monitor.item.jobId === jobId) {
        monitor.item.state = QueueItem.STATE.CANCELLED;
        monitor.abortController.abort();
      }
    }
    const toRemove = [];
    for (const [itemId, monitor] of this._activeMonitors) {
      if (monitor.item.jobId === jobId) {
        if (!monitor.item.isTerminal)
          monitor.item.state = QueueItem.STATE.CANCELLED;
        monitor.abortController?.abort();
        toRemove.push(itemId);
      }
    }
    for (const id of toRemove) {
      this._activeMonitors.delete(id);
    }
  }
  stopAll() {
    for (const monitor of this._waitingMonitors?.values() || []) {
      monitor.item.state = QueueItem.STATE.CANCELLED;
      monitor.abortController.abort();
    }
    for (const [, monitor] of this._activeMonitors) {
      if (!monitor.item.isTerminal)
        monitor.item.state = QueueItem.STATE.CANCELLED;
      monitor.abortController?.abort();
    }
    this._activeMonitors.clear();
  }
  reset() {
    this._claimedTileIds.clear();
  }
  resetEphemeralClaims(reason = "page-reload") {
    let removed = 0;
    for (const tileId of this._claimedTileIds.keys()) {
      if (/^dom-tile:/i.test(String(tileId || ""))) {
        this._claimedTileIds.delete(tileId);
        removed++;
      }
    }
    this._lastPendingHeartbeat = 0;
    this._lastClaimAt = Date.now();
    console.log(
      "[FlowV2ResultIdentity] reset ephemeral claim epoch",
      JSON.stringify({
        reason,
        removed,
        durableClaimsKept: this._claimedTileIds.size,
      }),
    );
    return removed;
  }
  resetCounters() {
    this._completedCount = 0;
    this._failedCount = 0;
  }
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  async _hydrateCompletedVideoPlayback(tileId, info, item = null) {
    if (!info || info.status !== "success" || info.type !== "video")
      return info;
    const driverKey = info.driver_key || info.tile?.driverKey || null;
    if (driverKey !== "flow_v2") return info;
    const currentPersistentId =
      info.persistent_media_id || info.result_id || info.file_name || "";
    const mediaUuid = [
      info.media_uuid,
      info.tile?.mediaUuid,
      currentPersistentId,
    ].find((value) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        String(value || ""),
      ),
    );
    const providerChild =
      mediaUuid && item?.flowCorrelationReceipt?.strong === true
        ? (item.flowCorrelationReceipt.children || []).find(
            (child) =>
              child?.status === "completed" &&
              String(child.mediaId || "").toLowerCase() ===
                String(mediaUuid).toLowerCase(),
          )
        : null;
    if (providerChild?.video_url) {
      const hasAsbIdentity =
        /^(?![0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$)[A-Za-z0-9_-]{32,1024}$/i.test(
          String(currentPersistentId),
        );
      console.log(
        "[WorkflowVideoPlay] captured playback from Web terminal receipt",
        JSON.stringify({
          runtime_id: tileId,
          media_uuid: mediaUuid,
          has_poster: !!(
            providerChild.thumbnail ||
            info.source_thumbnail ||
            info.thumbnail
          ),
        }),
      );
      return {
        ...info,
        media_uuid: mediaUuid,
        file_name: hasAsbIdentity ? currentPersistentId : mediaUuid,
        persistent_media_id: hasAsbIdentity ? currentPersistentId : mediaUuid,
        identity_durability: hasAsbIdentity ? "durable" : "session",
        identity_aliases: [
          ...new Set([
            ...(Array.isArray(info.identity_aliases)
              ? info.identity_aliases
              : []),
            mediaUuid,
          ]),
        ],
        video_url: providerChild.video_url,
        thumbnail: providerChild.thumbnail || info.thumbnail || "",
        source_thumbnail:
          providerChild.thumbnail ||
          info.source_thumbnail ||
          info.thumbnail ||
          "",
        thumb_is_poster: true,
      };
    }
    if (
      info.video_url &&
      /^(?![0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$)[A-Za-z0-9_-]{32,1024}$/i.test(
        String(currentPersistentId),
      )
    )
      return info;
    try {
      console.log(
        "[WorkflowVideoPlay] capture playback at completion",
        JSON.stringify({
          runtime_id: tileId,
          has_poster: !!(info.source_thumbnail || info.thumbnail),
        }),
      );
      const resolved = await MessageBridge.resolveVideoPlaybackUrl(tileId, {
        fileName: info.file_name || "",
        sourceUrl: info.source_thumbnail || info.thumbnail || "",
        forceDomResolve: false,
        skipMediaApiResolve: true,
        activationTimeoutMs: 6e3,
      });
      if (resolved?.success && resolved.video_url) {
        const resolvedAsbId =
          /^(?![0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$)[A-Za-z0-9_-]{32,1024}$/i.test(
            String(resolved.persistent_media_id || ""),
          )
            ? resolved.persistent_media_id
            : "";
        console.log(
          "[WorkflowVideoPlay] captured playback at completion",
          JSON.stringify({
            runtime_id: tileId,
            has_video_url: true,
            identity_kind: resolvedAsbId ? "flow_v2_asb" : "temporary",
            has_display_name: !!info.display_name,
          }),
        );
        return {
          ...info,
          ...(resolvedAsbId && {
            result_id: resolvedAsbId,
            file_name: resolvedAsbId,
            persistent_media_id: resolvedAsbId,
            identity_durability: "durable",
            identity_aliases: [
              ...new Set(
                [
                  ...(Array.isArray(info.identity_aliases)
                    ? info.identity_aliases
                    : []),
                  tileId,
                  currentPersistentId,
                  resolvedAsbId,
                ].filter(Boolean),
              ),
            ],
          }),
          ...(!resolvedAsbId && {
            identity_durability:
              info.identity_durability === "durable"
                ? "session"
                : info.identity_durability || "session",
          }),
          video_url: resolved.video_url,
          thumbnail: info.thumbnail || resolved.thumbnail || "",
          source_thumbnail:
            info.source_thumbnail || info.thumbnail || resolved.thumbnail || "",
          thumb_is_poster: true,
        };
      }
    } catch (error) {
      console.warn(
        "[WorkflowVideoPlay] completion playback capture failed",
        JSON.stringify({
          runtime_id: tileId,
          error: error?.message || String(error),
        }),
      );
    }
    return info;
  }
  _isProvenCompletedVideoSuccessor(item, candidate, processingIds) {
    if (
      processingIds.length !== 1 ||
      !candidate ||
      typeof candidate !== "object"
    )
      return false;
    if (
      candidate.status !== "success" ||
      String(candidate.media_type || "").toLowerCase() !== "video"
    )
      return false;
    const id = candidate.tile_id;
    const owner = id ? this._claimedTileIds.get(id) : null;
    const durableItem = {
      ...item,
      _ownTileIds: (item._ownTileIds || []).filter(
        (value) => !String(value).startsWith("dom-tile:"),
      ),
      _ownTileAliases: (item._ownTileAliases || []).filter(
        (value) => !String(value).startsWith("dom-tile:"),
      ),
    };
    return (
      !!id &&
      (!owner || owner.itemId === item.id) &&
      (durableItem._ownTileIds.length > 0 ||
        durableItem._ownTileAliases.length > 0) &&
      this._matchesOwnedTileIdentity(durableItem, candidate)
    );
  }
  _isSoleDomCompletedVideoSuccessor(item, candidate, processingIds) {
    if (
      this._activeMonitors.size !== 1 ||
      processingIds.length !== 1 ||
      !candidate ||
      typeof candidate !== "object"
    )
      return false;
    if (
      candidate.status !== "success" ||
      String(candidate.media_type || "").toLowerCase() !== "video"
    )
      return false;
    const id = candidate.tile_id;
    const owner = id ? this._claimedTileIds.get(id) : null;
    if (!id || (owner && owner.itemId !== item.id)) return false;
    const durableOwners = [
      ...(item._ownTileIds || []),
      ...(item._ownTileAliases || []),
    ].filter((value) => value && !String(value).startsWith("dom-tile:"));
    if (durableOwners.length > 0)
      return this._matchesOwnedTileIdentity(item, candidate);
    const baselineIds = new Set(
      (item.preTileIds || []).map((value) => String(value)),
    );
    const baselineNames = new Set(
      Array.from(item.preFileNames || []).map((value) => String(value)),
    );
    const candidateIds = [
      candidate.tile_id,
      candidate.persistent_media_id,
      candidate.file_name,
      candidate.tile?.runtimeId,
      candidate.tile?.persistentMediaId,
    ]
      .filter(Boolean)
      .map((value) => String(value));
    return !candidateIds.some(
      (value) => baselineIds.has(value) || baselineNames.has(value),
    );
  }
  async _waitClaimedTilesComplete(
    claimedTileIds,
    timeoutMs = 18e4,
    item = null,
    abortSignal = null,
  ) {
    abortSignal ||
      (abortSignal = this._activeMonitors.get(item?.id)?.abortController
        ?.signal);
    const checkStopped = () => {
      if (
        abortSignal?.aborted ||
        item?.state === "CANCELLED" ||
        this._queue?.getJob?.(item?.jobId)?.state === "stopped"
      ) {
        throw new DOMException("Aborted", "AbortError");
      }
    };
    checkStopped();
    const startTime = Date.now();
    const pollInterval = 500;
    const GEN_GRACE_MS = 12e3;
    const isFlowV2Video =
      item?._flowDriverKey === "flow_v2" &&
      String(item?.settings?.genType || "").toLowerCase() === "video";
    const ownedVideoDeadline = isFlowV2Video ? startTime + timeoutMs : null;
    const effectiveGenGraceMs = isFlowV2Video ? 9e4 : GEN_GRACE_MS;
    const MAX_READOPT = 6;
    const ABS_CAP_MS = Math.max(timeoutMs, 12e5);
    const GEN_EXTEND_MS = 6e4;
    const ITEM_STUCK_MS = 6e4;
    const FAILED_DEFINITIVE_GRACE_MS = 8e3;
    let watchIds = [...new Set(claimedTileIds)];
    const successSet = new Set();
    const thumbnails = {};
    const persistedResultIds = new Map();
    const formatResult = (failedIds) => {
      const success = [...successSet].map(
        (id) => persistedResultIds.get(id) || id,
      );
      const projectedThumbnails = {};
      for (const [runtimeId, info] of Object.entries(thumbnails)) {
        projectedThumbnails[persistedResultIds.get(runtimeId) || runtimeId] =
          info;
      }
      return { success, failed: failedIds, thumbnails: projectedThumbnails };
    };
    let lastGenActiveAt = Date.now();
    let lastItemActiveAt = Date.now();
    let reAdoptCount = 0;
    let deadline = startTime + timeoutMs;
    let lastProcessingSuccessorScanAt = 0;
    const observedOwnedProcessingIds = new Set();
    while (Date.now() < deadline && Date.now() - startTime < ABS_CAP_MS) {
      checkStopped();
      if (ownedVideoDeadline !== null && Date.now() >= ownedVideoDeadline) {
        item.noRetry = true;
        throw Object.assign(new Error("V2_RESULT_NOT_IDENTIFIED"), {
          noRetry: true,
        });
      }
      window.MessageBridge?.heartbeatActivateFlowTab?.();
      const completedMediaIds =
        item?._flowDriverKey === "flow_v2" &&
        item.flowCorrelationReceipt?.strong === true
          ? (item.flowCorrelationReceipt.children || [])
              .filter(
                (child) =>
                  child.status === "completed" &&
                  child.operationId &&
                  child.mediaId,
              )
              .map((child) => child.mediaId)
          : [];
      const response = await MessageBridge.sendToContentScript(
        "getTileStatuses",
        { tileIds: watchIds, completedMediaIds },
        {
          signal: abortSignal,
          timeoutMs: Math.max(
            1,
            Math.min(
              deadline - Date.now(),
              ABS_CAP_MS - (Date.now() - startTime),
            ),
          ),
        },
      );
      checkStopped();
      if (!response?.success || !response.statuses) {
        await this._sleep(pollInterval);
        continue;
      }
      const statuses = response.statuses;
      const failedNow = [];
      const processing = [];
      for (const tileId of watchIds) {
        if (successSet.has(tileId)) continue;
        let info = statuses[tileId];
        if (info?.status === "success") {
          info = await this._hydrateCompletedVideoPlayback(tileId, info, item);
          checkStopped();
          successSet.add(tileId);
          if (info.result_id) persistedResultIds.set(tileId, info.result_id);
          thumbnails[tileId] = {
            thumbnail: info.thumbnail,
            ...(info.source_thumbnail && {
              source_thumbnail: info.source_thumbnail,
            }),
            type: info.type,
            file_name: info.file_name,
            ...(info.display_name && { display_name: info.display_name }),
            ...(info.video_url && { video_url: info.video_url }),
            driver_key: info.driver_key || info.tile?.driverKey || null,
            origin: info.origin || info.tile?.origin || null,
            persistent_media_id:
              info.persistent_media_id || info.tile?.persistentMediaId || null,
            operation_id: info.operation_id || info.tile?.operationId || null,
            identity_durability:
              info.identity_durability || info.tile?.durability || null,
            identity_aliases: Array.isArray(info.identity_aliases)
              ? info.identity_aliases
              : [],
            captured_at: info.captured_at || info.tile?.capturedAt || null,
            url_kind: info.url_kind || info.tile?.urlKind || null,
            ...(info.thumb_is_poster === true && { thumb_is_poster: true }),
          };
        } else if (
          !info ||
          info.status === "not_found" ||
          info.status === "failed"
        ) {
          failedNow.push(tileId);
        } else {
          processing.push(tileId);
        }
      }
      const allExplicitFailed =
        failedNow.length > 0 &&
        failedNow.every((t) => statuses[t]?.status === "failed");
      if (processing.length > 0) {
        for (const processingId of processing)
          observedOwnedProcessingIds.add(processingId);
        if (
          item?._flowDriverKey === "flow_v2" &&
          Date.now() - lastProcessingSuccessorScanAt >= 2e3
        ) {
          lastProcessingSuccessorScanAt = Date.now();
          try {
            const scan = await MessageBridge.sendToContentScript(
              "scanNewTiles",
              {
                excludeTileIds: [
                  ...new Set([
                    ...(item.preTileIds || []),
                    ...watchIds,
                    ...successSet,
                  ]),
                ],
                excludeFileNames: Array.from(item.preFileNames || []),
              },
            );
            const expectedType = String(
              item.settings?.genType || (item._isVideo ? "Video" : ""),
            ).toLowerCase();
            const completedSuccessors = (scan?.tiles || []).filter(
              (candidate) =>
                this._isProvenCompletedVideoSuccessor(
                  item,
                  candidate,
                  processing,
                ) ||
                this._isSoleDomCompletedVideoSuccessor(
                  item,
                  candidate,
                  processing,
                ),
            );
            if (completedSuccessors.length === 1) {
              const completedId = completedSuccessors[0].tile_id;
              this._claimedTileIds.set(completedId, {
                jobId: item.jobId,
                itemId: item.id,
                claimedAt: Date.now(),
              });
              watchIds = watchIds.map((id) =>
                id === processing[0] ? completedId : id,
              );
              console.info(
                "[FlowV2ResultIdentity] adopted proven completed successor",
                JSON.stringify({
                  item_id: item.id,
                  stale_runtime_id: processing[0],
                  result_runtime_id: completedId,
                }),
              );
              await this._sleep(pollInterval);
              continue;
            }
            const unclaimedFailedSuccessors = (scan?.tiles || []).filter(
              (candidate) => {
                if (!candidate || typeof candidate === "string") return false;
                const id = candidate.tile_id || "";
                const owner = id ? this._claimedTileIds.get(id) : null;
                return (
                  !!id &&
                  candidate.status === "failed" &&
                  (!owner || owner.itemId === item.id) &&
                  (item._ownTileIds?.length > 0 ||
                    item._ownTileAliases?.length > 0) &&
                  this._matchesOwnedTileIdentity(item, candidate)
                );
              },
            );
            const typeMatchedFailures = unclaimedFailedSuccessors.filter(
              (candidate) => {
                const actualType = String(
                  candidate.media_type || "",
                ).toLowerCase();
                return (
                  !expectedType ||
                  actualType === expectedType ||
                  actualType === "unknown"
                );
              },
            );
            const failedSuccessors =
              typeMatchedFailures.length > 0
                ? typeMatchedFailures
                : unclaimedFailedSuccessors;
            if (failedSuccessors.length === 1) {
              const failedId = failedSuccessors[0].tile_id;
              this._claimedTileIds.set(failedId, {
                jobId: item.jobId,
                itemId: item.id,
                claimedAt: Date.now(),
              });
              watchIds = [...successSet, failedId];
              lastItemActiveAt = Date.now();
              this._lastClaimAt = Date.now();
              console.warn(
                "[FlowV2ResultIdentity] adopted explicit failed successor for Retry",
                JSON.stringify({
                  item_id: item.id,
                  stale_processing_ids: processing,
                  failed_successor_id: failedId,
                  expected_media_type: expectedType || null,
                  observed_media_type: failedSuccessors[0].media_type || null,
                  media_type_fallback: typeMatchedFailures.length === 0,
                }),
              );
              await this._sleep(pollInterval);
              continue;
            }
            if (
              unclaimedFailedSuccessors.length > 1 &&
              !item._loggedAmbiguousV2FailedSuccessor
            ) {
              item._loggedAmbiguousV2FailedSuccessor = true;
              console.warn(
                "[FlowV2ResultIdentity] failed successor ambiguous; refuse Retry guess",
                JSON.stringify({
                  item_id: item.id,
                  candidate_count: unclaimedFailedSuccessors.length,
                  expected_media_type: expectedType || null,
                }),
              );
            }
          } catch (error) {
            if (!item._loggedV2FailedSuccessorScanError) {
              item._loggedV2FailedSuccessorScanError = true;
              console.warn(
                "[FlowV2ResultIdentity] failed successor scan error:",
                error?.message || error,
              );
            }
          }
        }
        lastGenActiveAt = Date.now();
        lastItemActiveAt = Date.now();
        if (item) deadline = Math.max(deadline, Date.now() + GEN_EXTEND_MS);
        this._lastClaimAt = Date.now();
        await this._sleep(pollInterval);
        continue;
      }
      if (failedNow.length === 0) {
        console.log(
          `[TileMonitor] _waitClaimedTilesComplete done: ${successSet.size} success, 0 failed`,
        );
        return formatResult([]);
      }
      if (!item) {
        console.log(
          `[TileMonitor] _waitClaimedTilesComplete done: ${successSet.size} success, ${failedNow.length} failed (no-heartbeat path)`,
        );
        return formatResult(failedNow);
      }
      let pending = 0;
      try {
        pending =
          (
            await MessageBridge.sendToContentScript("getPendingTileCount", {
              excludeClaimedTileIds: [...this._claimedTileIds.keys()],
            })
          )?.count || 0;
      } catch (_) {}
      if (pending > 0) {
        const stuckThreshold = allExplicitFailed
          ? FAILED_DEFINITIVE_GRACE_MS
          : ITEM_STUCK_MS;
        if (Date.now() - lastItemActiveAt > stuckThreshold) {
          const _fs = failedNow
            .map(
              (t) =>
                `${t.substring(0, 10)}=${statuses[t]?.status || "no-info"}`,
            )
            .join(",");
          console.warn(
            `[TileMonitor] Item ${item.id.substring(0, 8)} tile ch\u1EBFt + kh\xF4ng successor ${Math.round((Date.now() - lastItemActiveAt) / 1e3)}s (pending=${pending} gen node kh\xE1c, grace=${stuckThreshold / 1e3}s ${allExplicitFailed ? "fail-r\xF5" : "not_found"}) \u2192 finalize fail | failStatus[${_fs}]`,
          );
          const _recA = await this._recoverVirtualizedFails(
            failedNow,
            statuses,
            successSet,
            thumbnails,
            persistedResultIds,
            item,
          );
          return formatResult(_recA);
        }
        lastGenActiveAt = Date.now();
        deadline = Math.max(deadline, Date.now() + GEN_EXTEND_MS);
        const hasEarlierActive = [...this._activeMonitors.values()].some(
          (m) =>
            m.item !== item &&
            m.item._submitOrder &&
            item._submitOrder &&
            m.item._submitOrder < item._submitOrder &&
            (m.item.state === QueueItem.STATE.MONITORING ||
              m.item.state === QueueItem.STATE.SUBMITTED),
        );
        if (
          item &&
          !hasEarlierActive &&
          !allExplicitFailed &&
          (!isFlowV2Video ||
            failedNow.some((id) => observedOwnedProcessingIds.has(id))) &&
          reAdoptCount < MAX_READOPT
        ) {
          try {
            const scan = await MessageBridge.sendToContentScript(
              "scanNewTiles",
              {
                excludeTileIds: [
                  ...watchIds,
                  ...successSet,
                  ...(item.preTileIds || []),
                ],
                excludeFileNames: Array.from(item.preFileNames || []),
              },
            );
            const _genType = (
              item.settings?.genType || (item._isVideo ? "Video" : "")
            )
              .toString()
              .toLowerCase();
            const enforceType = _genType === "image" || _genType === "video";
            const expectedVideo = _genType === "video";
            const rejectedUnprovenVideoSuccessors = [];
            const fresh = (scan?.tiles || [])
              .filter((t) => {
                if (!enforceType) return true;
                const tType =
                  typeof t === "object" && t.media_type
                    ? t.media_type
                    : "unknown";
                if (tType === "unknown") return true;
                return tType === _genType;
              })
              .filter((t) => {
                if (!expectedVideo || typeof t === "string") return true;
                const id = t?.tile_id || "";
                const status = t?.status || t?.tile?.status || null;
                const unprovenCompleted =
                  status === "success" &&
                  !failedNow.some((failedId) =>
                    observedOwnedProcessingIds.has(failedId),
                  );
                if (unprovenCompleted) rejectedUnprovenVideoSuccessors.push(id);
                return !unprovenCompleted;
              })
              .filter(
                (t) =>
                  !isFlowV2Video ||
                  ((item._ownTileIds?.length > 0 ||
                    item._ownTileAliases?.length > 0) &&
                    this._matchesOwnedTileIdentity(item, t)),
              )
              .map((t) => (typeof t === "string" ? t : t.tile_id))
              .filter((id) => id && !successSet.has(id))
              .filter((id) => {
                const owner = this._claimedTileIds.get(id);
                return !owner || owner.itemId === item.id;
              });
            if (rejectedUnprovenVideoSuccessors.length > 0) {
              console.warn(
                "[FlowV2ResultIdentity] rejected unproven completed re-adopt candidates",
                JSON.stringify({
                  item_id: item.id,
                  rejected_ids: rejectedUnprovenVideoSuccessors,
                  action: "wait-for-fail-then-retry",
                }),
              );
            }
            if (fresh.length > 0) {
              reAdoptCount++;
              const replaceableFailed = failedNow.filter(
                (id) =>
                  statuses[id]?.status !== "failed" &&
                  (!isFlowV2Video || observedOwnedProcessingIds.has(id)),
              );
              const adopt = fresh.slice(0, replaceableFailed.length);
              if (adopt.length === 0) {
                await this._sleep(pollInterval);
                continue;
              }
              for (const tid of adopt) {
                this._claimedTileIds.set(tid, {
                  jobId: item.jobId,
                  itemId: item.id,
                  claimedAt: Date.now(),
                });
              }
              const retainedFailed = failedNow.filter(
                (id) => !replaceableFailed.slice(0, adopt.length).includes(id),
              );
              watchIds = [...successSet, ...retainedFailed, ...adopt];
              lastItemActiveAt = Date.now();
              console.log(
                `[TileMonitor] Re-adopt: claimed tile stale (Flow \u0111\u1ED5i ID), page c\xF2n gen (pending=${pending}) \u2192 claim+watch ${adopt.map((t) => t.substring(0, 8)).join(",")}`,
              );
              await this._sleep(pollInterval);
              continue;
            }
          } catch (_) {}
        }
        await this._sleep(pollInterval);
        continue;
      }
      const pageSettleGraceMs = allExplicitFailed
        ? FAILED_DEFINITIVE_GRACE_MS
        : effectiveGenGraceMs;
      if (Date.now() - lastGenActiveAt < pageSettleGraceMs) {
        if (
          isFlowV2Video &&
          !allExplicitFailed &&
          !item._loggedV2RemountGrace
        ) {
          item._loggedV2RemountGrace = true;
          console.log(
            "[FlowV2ResultIdentity] pending tile unmounted; wait for video UUID successor",
            JSON.stringify({
              item_id: item.id,
              grace_ms: effectiveGenGraceMs,
              claimed_count: item._claimedCount || 0,
              pending_owner_count: item.pendingOwners?.length || 0,
            }),
          );
        }
        if (
          isFlowV2Video &&
          !allExplicitFailed &&
          this._activeMonitors.size === 1 &&
          reAdoptCount < MAX_READOPT
        ) {
          try {
            const scan = await MessageBridge.sendToContentScript(
              "scanNewTiles",
              {
                excludeTileIds: [
                  ...new Set([
                    ...(item.preTileIds || []),
                    ...watchIds,
                    ...this._claimedTileIds.keys(),
                  ]),
                ],
                excludeFileNames: Array.from(item.preFileNames || []),
              },
            );
            const replaceableFailed = failedNow.filter(
              (id) =>
                statuses[id]?.status !== "failed" &&
                observedOwnedProcessingIds.has(id),
            );
            const successors = (scan?.tiles || []).filter((candidate) => {
              if (!candidate || typeof candidate === "string") return false;
              const id = candidate.tile_id || "";
              const type = String(candidate.media_type || "").toLowerCase();
              const status = candidate.status || candidate.tile?.status || "";
              const hasExactProviderIdentity =
                (item._ownTileIds?.length > 0 ||
                  item._ownTileAliases?.length > 0) &&
                this._matchesOwnedTileIdentity(item, candidate);
              const hasSoleDomLineage = this._isSoleDomCompletedVideoSuccessor(
                item,
                candidate,
                replaceableFailed,
              );
              return (
                !!id &&
                type === "video" &&
                status === "success" &&
                !successSet.has(id) &&
                (hasExactProviderIdentity || hasSoleDomLineage)
              );
            });
            if (successors.length === 1 && replaceableFailed.length === 1) {
              const successorId = successors[0].tile_id;
              reAdoptCount++;
              this._claimedTileIds.set(successorId, {
                jobId: item.jobId,
                itemId: item.id,
                claimedAt: Date.now(),
              });
              watchIds = [
                ...successSet,
                ...failedNow.filter((id) => id !== replaceableFailed[0]),
                successorId,
              ];
              lastItemActiveAt = Date.now();
              this._lastClaimAt = Date.now();
              console.log(
                "[FlowV2ResultIdentity] adopted completed video UUID successor after pending=0",
                JSON.stringify({
                  item_id: item.id,
                  old_runtime_ids: failedNow,
                  successor_id: successorId,
                  candidate_count: successors.length,
                }),
              );
              await this._sleep(pollInterval);
              continue;
            }
            if (successors.length > 1 && !item._loggedAmbiguousV2Successor) {
              item._loggedAmbiguousV2Successor = true;
              console.warn(
                "[FlowV2ResultIdentity] completed successor ambiguous; keep waiting",
                JSON.stringify({
                  item_id: item.id,
                  candidate_count: successors.length,
                }),
              );
            }
          } catch (error) {
            if (!item._loggedV2SuccessorScanError) {
              item._loggedV2SuccessorScanError = true;
              console.warn(
                "[FlowV2ResultIdentity] pending=0 successor scan failed:",
                error?.message || error,
              );
            }
          }
        }
        await this._sleep(pollInterval);
        continue;
      }
      console.log(
        `[TileMonitor] _waitClaimedTilesComplete done: ${successSet.size} success, ${failedNow.length} failed (page h\u1EBFt gen)`,
      );
      const _recB = await this._recoverVirtualizedFails(
        failedNow,
        statuses,
        successSet,
        thumbnails,
        persistedResultIds,
        item,
      );
      return formatResult(_recB);
    }
    if (isFlowV2Video) {
      item.noRetry = true;
      throw Object.assign(new Error("V2_RESULT_NOT_IDENTIFIED"), {
        noRetry: true,
      });
    }
    console.warn(
      "[TileMonitor] _waitClaimedTilesComplete timeout, treating processing as failed",
    );
    const finalResponse = await MessageBridge.sendToContentScript(
      "getTileStatuses",
      { tileIds: watchIds },
    );
    const failed = [];
    for (const tileId of watchIds) {
      if (successSet.has(tileId)) continue;
      let info = finalResponse?.statuses?.[tileId];
      if (info?.status === "success") {
        info = await this._hydrateCompletedVideoPlayback(tileId, info, item);
        successSet.add(tileId);
        if (info.result_id) persistedResultIds.set(tileId, info.result_id);
        thumbnails[tileId] = {
          thumbnail: info.thumbnail,
          ...(info.source_thumbnail && {
            source_thumbnail: info.source_thumbnail,
          }),
          type: info.type,
          file_name: info.file_name,
          ...(info.display_name && { display_name: info.display_name }),
          ...(info.video_url && { video_url: info.video_url }),
          driver_key: info.driver_key || info.tile?.driverKey || null,
          origin: info.origin || info.tile?.origin || null,
          persistent_media_id:
            info.persistent_media_id || info.tile?.persistentMediaId || null,
          operation_id: info.operation_id || info.tile?.operationId || null,
          identity_durability:
            info.identity_durability || info.tile?.durability || null,
          identity_aliases: Array.isArray(info.identity_aliases)
            ? info.identity_aliases
            : [],
          captured_at: info.captured_at || info.tile?.capturedAt || null,
          url_kind: info.url_kind || info.tile?.urlKind || null,
          ...(info.thumb_is_poster === true && { thumb_is_poster: true }),
        };
      } else {
        failed.push(tileId);
      }
    }
    const recoveredTimeout = await this._recoverVirtualizedFails(
      failed,
      finalResponse?.statuses || {},
      successSet,
      thumbnails,
      persistedResultIds,
      item,
    );
    return formatResult(recoveredTimeout);
  }
  async _recoverVirtualizedFails(
    failedTids,
    statuses,
    successSet,
    thumbnails,
    persistedResultIds = null,
    item = null,
  ) {
    if (!failedTids || failedTids.length === 0) return failedTids;
    const worthZoom = failedTids.some(
      (t) => (statuses?.[t]?.status || "not_found") !== "failed",
    );
    if (!worthZoom) return failedTids;
    const virtualizedIds = failedTids.filter(
      (t) => (statuses?.[t]?.status || "not_found") !== "failed",
    );
    try {
      await MessageBridge.sendToContentScript("ensureFlowTilesLoaded", {
        force: true,
        targetFileNames: virtualizedIds,
      });
    } catch (_) {
      return failedTids;
    }
    let re = {};
    try {
      const resp = await MessageBridge.sendToContentScript("getTileStatuses", {
        tileIds: failedTids,
      });
      re = resp?.statuses || {};
    } catch (_) {
      return failedTids;
    }
    const stillFailed = [];
    for (const tid of failedTids) {
      let info = re[tid];
      if (info?.status === "success") {
        info = await this._hydrateCompletedVideoPlayback(tid, info, item);
        successSet.add(tid);
        if (info.result_id && persistedResultIds)
          persistedResultIds.set(tid, info.result_id);
        thumbnails[tid] = {
          thumbnail: info.thumbnail,
          type: info.type,
          file_name: info.file_name,
          ...(info.display_name && { display_name: info.display_name }),
          ...(info.source_thumbnail && {
            source_thumbnail: info.source_thumbnail,
          }),
          ...(info.video_url && { video_url: info.video_url }),
          driver_key: info.driver_key || info.tile?.driverKey || null,
          origin: info.origin || info.tile?.origin || null,
          persistent_media_id:
            info.persistent_media_id || info.tile?.persistentMediaId || null,
          operation_id: info.operation_id || info.tile?.operationId || null,
          identity_durability:
            info.identity_durability || info.tile?.durability || null,
          identity_aliases: Array.isArray(info.identity_aliases)
            ? info.identity_aliases
            : [],
          captured_at: info.captured_at || info.tile?.capturedAt || null,
          url_kind: info.url_kind || info.tile?.urlKind || null,
          ...(info.thumb_is_poster === true && { thumb_is_poster: true }),
        };
      } else {
        stillFailed.push(tid);
      }
    }
    const saved = failedTids.length - stillFailed.length;
    if (saved > 0)
      console.log(
        `[TileMonitor] Zoom-recover: c\u1EE9u ${saved}/${failedTids.length} tile lazy-virtualize (not_found\u2192success)`,
      );
    return stillFailed;
  }
  get activeCount() {
    return this._activeMonitors.size;
  }
  get activeItems() {
    return [...this._activeMonitors.values()]
      .map((monitor) => monitor.item)
      .filter(Boolean);
  }
  get claimingCount() {
    let count = 0;
    for (const m of this._activeMonitors.values()) {
      if ((m.item._claimedCount || 0) > 0) count++;
    }
    return count;
  }
  get hasOwnedInFlightOutput() {
    for (const monitor of this._activeMonitors.values()) {
      const item = monitor?.item;
      if (!item) continue;
      const terminal =
        item.state === QueueItem.STATE.COMPLETED ||
        item.state === QueueItem.STATE.PARTIAL_FAIL ||
        item.state === QueueItem.STATE.FAILED ||
        item.state === QueueItem.STATE.CANCELLED;
      if (terminal) continue;
      if (
        (item._claimedCount || 0) > 0 ||
        (item.pendingOwners?.length || 0) > 0
      )
        return true;
    }
    return false;
  }
  get waitingCount() {
    return Math.max(0, this._activeMonitors.size - this.claimingCount);
  }
  isStagnant(thresholdMs = 6e4) {
    if (this._activeMonitors.size === 0) return false;
    if (this._lastClaimAt === 0) return false;
    return Date.now() - this._lastClaimAt > thresholdMs;
  }
  get completedCount() {
    return this._completedCount;
  }
  get failedCount() {
    return this._failedCount;
  }
}
