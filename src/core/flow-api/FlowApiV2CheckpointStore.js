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
(function () {
  "use strict";
  class FlowApiV2CheckpointStore {
    static _runtimeInteger(config, key, min = 0) {
      const value = Number(config?.runtime?.[key]);
      if (!Number.isInteger(value) || value < min)
        throw new Error(`V2_RUNTIME_CONFIG_INVALID:${key}`);
      return value;
    }
    static _operationDeadline(checkpoint, config) {
      const persisted = Number(checkpoint?.operationDeadlineAt);
      if (Number.isFinite(persisted) && persisted > 0) return persisted;
      const timeoutKey =
        checkpoint?.mediaType === "video"
          ? "video_timeout_ms"
          : "image_timeout_ms";
      const timeoutMs = this._runtimeInteger(config, timeoutKey, 1);
      const submittedAt = Number(checkpoint?.submittedAt);
      return (
        (Number.isFinite(submittedAt) && submittedAt > 0
          ? submittedAt
          : Date.now()) + timeoutMs
      );
    }
    static _storageGet(area, key) {
      return new Promise((resolve, reject) =>
        chrome.storage[area].get([key], (value) => {
          const error = chrome.runtime?.lastError;
          if (error) reject(new Error("V2_CHECKPOINT_STORAGE_READ_FAILED"));
          else resolve(value?.[key]);
        }),
      );
    }
    static _storageSet(area, values) {
      return new Promise((resolve, reject) =>
        chrome.storage[area].set(values, () => {
          const error = chrome.runtime?.lastError;
          if (error) reject(new Error("V2_CHECKPOINT_STORAGE_WRITE_FAILED"));
          else resolve();
        }),
      );
    }
    static _canonical(value) {
      if (Array.isArray(value))
        return value.map((entry) => this._canonical(entry));
      if (!value || typeof value !== "object") return value;
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, this._canonical(value[key])]),
      );
    }
    static fingerprint(config) {
      const pinned = config && this._snapshotFingerprints.get(config);
      if (pinned) return pinned;
      const text = JSON.stringify(
        this._canonical({
          protocol: config?.protocol || null,
          models: config?.models || null,
          schema: config?.schema || null,
          state_mapping: config?.state_mapping || null,
          runtime: config?.runtime || null,
        }),
      );
      let hash = 2166136261;
      for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
    }
    static _deepFreeze(value) {
      if (!value || typeof value !== "object" || Object.isFrozen(value))
        return value;
      Object.values(value).forEach((entry) => this._deepFreeze(entry));
      return Object.freeze(value);
    }
    static _snapshotText(config) {
      return JSON.stringify(
        this._canonical({
          protocol: config.protocol,
          models: config.models,
          schema: config.schema,
          state_mapping: config.state_mapping,
          runtime: config.runtime,
        }),
      );
    }
    static _runtimeSnapshot(config) {
      const snapshot = this._deepFreeze(
        JSON.parse(
          JSON.stringify({
            protocol: config.protocol,
            models: config.models,
            schema: config.schema,
            state_mapping: config.state_mapping,
            runtime: config.runtime,
          }),
        ),
      );
      this._snapshotFingerprints.set(snapshot, this.fingerprint(snapshot));
      return snapshot;
    }
    static _releaseRuntime(operationId) {
      const owner = this._runtimeOwners.get(operationId);
      this._runtimeOwners.delete(operationId);
      this._runtimeSnapshots.delete(operationId);
      if (owner && --owner.pool.refs === 0)
        this._snapshotPool.delete(owner.pool.key);
    }
    static _retainRuntime(operationId, config, jobId, projectId) {
      const key = this._snapshotText(config);
      let pool = this._snapshotPool.get(key);
      const previous = this._runtimeOwners.get(operationId);
      if (previous?.pool === pool && pool) {
        const owner2 = { pool, jobId, projectId };
        this._runtimeOwners.set(operationId, owner2);
        this._runtimeSnapshots.set(operationId, pool.snapshot);
        return owner2;
      }
      this._releaseRuntime(operationId);
      if (!pool) {
        pool = { key, refs: 0, snapshot: this._runtimeSnapshot(config) };
        this._snapshotPool.set(key, pool);
      }
      pool.refs++;
      const owner = { pool, jobId, projectId };
      this._runtimeOwners.set(operationId, owner);
      this._runtimeSnapshots.set(operationId, pool.snapshot);
      return owner;
    }
    static _releaseRuntimeScope(key, value) {
      for (const [operationId, owner] of this._runtimeOwners) {
        if (owner[key] === value) this._releaseRuntime(operationId);
      }
    }
    static async save(item, operation, config, state = "accepted") {
      this._pendingPollBatch = null;
      const operationId = operation?.operationId;
      if (!item?.id || !this._uuid(operationId)) return false;
      const protocolRevision = Number(
        config?.protocol?.schema_version || item.flowApiProtocolRevision || 0,
      );
      if (protocolRevision !== 1) return false;
      const projectId = operation.projectId || item.projectId || null;
      if (!this._uuid(projectId)) return false;
      const mediaType = /video/i.test(
        item?.settings?.genType || operation.mediaType || "",
      )
        ? "video"
        : "image";
      const timeoutKey =
        mediaType === "video" ? "video_timeout_ms" : "image_timeout_ms";
      const timeoutMs = this._runtimeInteger(config, timeoutKey, 1);
      const recordedDispatch = Number(item.flowApiDispatchedAt);
      const dispatchedAt =
        Number.isFinite(recordedDispatch) && recordedDispatch > 0
          ? recordedDispatch
          : item.submittedAt || Date.now();
      const recordedDeadline = Number(item.flowApiOperationDeadlineAt);
      const operationDeadlineAt =
        Number.isFinite(recordedDeadline) && recordedDeadline > dispatchedAt
          ? recordedDeadline
          : dispatchedAt + timeoutMs;
      const checkpoint = {
        driver: "v2",
        protocolRevision,
        protocolFingerprint: this.fingerprint(config),
        itemId: item.id,
        jobId: item.jobId || null,
        projectId,
        ...(Number.isInteger(item.flowApiTabId) && item.flowApiTabId >= 0
          ? { flowTabId: item.flowApiTabId }
          : {}),
        attemptId: operation.attemptId || item.attemptId || item.id,
        operationId,
        mediaId: operation.mediaId || null,
        mediaType,
        surface: ["gen", "task", "workflow"].includes(operation.surface)
          ? operation.surface
          : "gen",
        state,
        submittedAt: item.submittedAt || dispatchedAt,
        dispatchedAt,
        operationDeadlineAt,
        lastPolledAt: Date.now(),
      };
      const runtimeOwner = this._retainRuntime(
        operationId,
        config,
        item.jobId || null,
        projectId,
      );
      this._writeTail = this._writeTail
        .catch(() => {})
        .then(async () => {
          const all = (await this._storageGet("local", this.KEY)) || {};
          all[operationId] = checkpoint;
          await this._storageSet("local", { [this.KEY]: all });
        });
      try {
        await this._writeTail;
      } catch (error) {
        if (this._runtimeOwners.get(operationId) === runtimeOwner)
          this._releaseRuntime(operationId);
        console.warn(
          "[FlowApiV2CheckpointStore] checkpoint not persisted:",
          error?.message,
        );
        return false;
      }
      return true;
    }
    static async update(operationId, patch = {}) {
      if (!this._uuid(operationId)) return false;
      return this.updateMany([{ operationId, patch }]);
    }
    static async updateMany(updates = []) {
      const valid = updates.filter((update) => this._uuid(update?.operationId));
      if (!valid.length) return false;
      let batch = this._pendingPollBatch;
      if (!batch) {
        let collected;
        const collection = new Promise((resolve) => {
          collected = resolve;
        });
        batch = { updates: new Map(), promise: null };
        this._pendingPollBatch = batch;
        batch.promise = this._writeTail
          .catch(() => {})
          .then(async () => {
            await collection;
            const all = (await this._storageGet("local", this.KEY)) || {};
            let changed = false;
            for (const [operationId, patch] of batch.updates) {
              if (!all[operationId]) continue;
              all[operationId] = { ...all[operationId], ...patch };
              changed = true;
            }
            if (changed) await this._storageSet("local", { [this.KEY]: all });
          });
        this._writeTail = batch.promise;
        Promise.resolve().then(() => {
          if (this._pendingPollBatch === batch) this._pendingPollBatch = null;
          collected();
        });
      }
      for (const { operationId, patch = {} } of valid) {
        const allowed = { ...batch.updates.get(operationId) };
        for (const key of ["mediaId", "state", "lastPolledAt"]) {
          if (Object.prototype.hasOwnProperty.call(patch, key))
            allowed[key] = patch[key];
        }
        allowed.lastPolledAt = Date.now();
        batch.updates.set(operationId, allowed);
      }
      try {
        await batch.promise;
      } catch (error) {
        console.warn(
          "[FlowApiV2CheckpointStore] poll checkpoint not persisted:",
          error?.message,
        );
        return false;
      }
      return true;
    }
    static async remove(operationId) {
      if (!operationId) return;
      this._pendingPollBatch = null;
      this._releaseRuntime(operationId);
      this._writeTail = this._writeTail
        .catch(() => {})
        .then(async () => {
          const all = (await this._storageGet("local", this.KEY)) || {};
          delete all[operationId];
          await this._storageSet("local", { [this.KEY]: all });
        });
      try {
        await this._writeTail;
      } catch (error) {
        console.warn(
          "[FlowApiV2CheckpointStore] checkpoint cleanup failed:",
          error?.message,
        );
        return false;
      }
      return true;
    }
    static async removeForJob(jobId) {
      if (!jobId) return 0;
      this._releaseRuntimeScope("jobId", jobId);
      this._pendingPollBatch = null;
      let removed = 0;
      this._writeTail = this._writeTail
        .catch(() => {})
        .then(async () => {
          const all = (await this._storageGet("local", this.KEY)) || {};
          for (const [operationId, checkpoint] of Object.entries(all)) {
            if (checkpoint?.jobId !== jobId) continue;
            delete all[operationId];
            if (this._runtimeOwners.get(operationId)?.jobId === jobId)
              this._releaseRuntime(operationId);
            removed++;
          }
          if (removed > 0) await this._storageSet("local", { [this.KEY]: all });
          if (
            removed > 0 &&
            Object.keys(all).length === 0 &&
            this._recoveryTimer
          ) {
            clearTimeout(this._recoveryTimer);
            this._recoveryTimer = null;
          }
        });
      await this._writeTail;
      return removed;
    }
    static async removeForProject(projectId) {
      if (!projectId) return 0;
      this._releaseRuntimeScope("projectId", projectId);
      this._pendingPollBatch = null;
      let removed = 0;
      this._writeTail = this._writeTail
        .catch(() => {})
        .then(async () => {
          const all = (await this._storageGet("local", this.KEY)) || {};
          for (const [operationId, checkpoint] of Object.entries(all)) {
            if (checkpoint?.projectId !== projectId) continue;
            delete all[operationId];
            if (this._runtimeOwners.get(operationId)?.projectId === projectId)
              this._releaseRuntime(operationId);
            removed++;
          }
          if (removed > 0) await this._storageSet("local", { [this.KEY]: all });
          if (
            removed > 0 &&
            Object.keys(all).length === 0 &&
            this._recoveryTimer
          ) {
            clearTimeout(this._recoveryTimer);
            this._recoveryTimer = null;
          }
        });
      await this._writeTail;
      return removed;
    }
    static runtimeConfig(operationId) {
      return this._runtimeSnapshots.get(operationId) || null;
    }
    static async compatibleConfig(checkpoint) {
      const inMemory = this.runtimeConfig(checkpoint.operationId);
      if (
        inMemory &&
        Number(inMemory.protocol?.schema_version) ===
          Number(checkpoint.protocolRevision) &&
        this.fingerprint(inMemory) === checkpoint.protocolFingerprint
      )
        return inMemory;
      if (window.featureGate?.canUse?.("flow_api_enabled") !== true)
        return null;
      const config =
        await window.ProviderConfigManager?.fetchFlowApiV2Configs?.();
      if (
        !config ||
        Number(config.protocol?.schema_version) !==
          Number(checkpoint.protocolRevision) ||
        this.fingerprint(config) !== checkpoint.protocolFingerprint
      )
        return null;
      return this._runtimeSnapshot(config);
    }
    static async _patch(checkpoint, patch, terminal = false) {
      if (checkpoint.surface === "workflow")
        return { ok: true, skipped: "WORKFLOW_TRACKER_EXCLUDED" };
      try {
        return await chrome.runtime.sendMessage({
          action: "ft:recoveryPatch",
          projectId: checkpoint.projectId,
          itemId: checkpoint.itemId,
          patch: {
            recoveryLabel: null,
            recoveryPhase: null,
            recoveryCode: null,
            recoveryAttempt: 0,
            recoveryMaxAttempts: 0,
            statusLabel: null,
            statusKind: null,
            statusReason: null,
            ...patch,
            flowApiAccepted: true,
            flowApiDriver: "v2",
            flowApiProtocolRevision: checkpoint.protocolRevision,
            flowApiProtocolFingerprint: checkpoint.protocolFingerprint,
            ...(Number.isInteger(checkpoint.flowTabId)
              ? { flowApiTabId: checkpoint.flowTabId }
              : {}),
            flowApiLineage: [
              {
                attemptId: checkpoint.attemptId,
                operationId: checkpoint.operationId,
                mediaId: patch.mediaId || checkpoint.mediaId || null,
              },
            ],
            operationId: checkpoint.operationId,
            mediaId: patch.mediaId || checkpoint.mediaId || null,
          },
          terminal,
        });
      } catch (_) {
        return null;
      }
    }
    static async _failRecovery(checkpoint, code) {
      await this._patch(
        checkpoint,
        {
          state: "FAILED",
          completedAt: Date.now(),
          errorType: "unknown",
          error: code,
          noRetry: true,
          recoveryExhausted: true,
          errorPolicy: {
            code,
            driver: "v2",
            stage: "accepted_poll",
            dispatchStarted: true,
            ambiguous: false,
            retryable: false,
            operationId: checkpoint.operationId,
          },
        },
        true,
      );
      await this.remove(checkpoint.operationId);
    }
    static async _failTimedOut(checkpoint) {
      await this._failRecovery(checkpoint, "V2_OPERATION_TIMEOUT");
    }
    static _bindRecoveryWakeups() {
      if (this._recoveryBound) return;
      this._recoveryBound = true;
      let fingerprint = JSON.stringify(
        window.ProviderConfigManager?.getFlowApiV2ConfigSync?.() || null,
      );
      const wake = () => {
        if (this._recoveryFlight) {
          this._recoveryWakePending = true;
          return;
        }
        this.recoverCheckpoints().catch((error) => {
          console.warn(
            "[FlowApiV2CheckpointStore] recovery wake-up failed:",
            error?.message || error,
          );
        });
      };
      window.eventBus?.on?.(
        "provider:api_config_updated",
        ({ provider } = {}) => {
          if (provider === "flow") wake();
        },
      );
      window.eventBus?.on?.("provider:private_configs_loaded", () => {
        const next = JSON.stringify(
          window.ProviderConfigManager?.getFlowApiV2ConfigSync?.() || null,
        );
        if (next === fingerprint) return;
        fingerprint = next;
        wake();
      });
      window.eventBus?.on?.("bridge:changed", wake);
      window.eventBus?.on?.("sse:connected", wake);
      window.eventBus?.on?.("auth:login", wake);
      window.eventBus?.on?.("featuregate:refreshed", wake);
    }
    static async recoverCheckpoints() {
      this._bindRecoveryWakeups();
      if (this._recoveryFlight) return this._recoveryFlight;
      const flight = this._recoverCheckpoints();
      this._recoveryFlight = flight;
      try {
        return await flight;
      } finally {
        this._recoveryFlight = null;
        if (this._recoveryWakePending) {
          this._recoveryWakePending = false;
          Promise.resolve()
            .then(() => this.recoverCheckpoints())
            .catch((error) => {
              console.warn(
                "[FlowApiV2CheckpointStore] deferred recovery failed:",
                error?.message || error,
              );
            });
        }
      }
    }
    static async _deferUnavailable(checkpoint, code, errorType) {
      const deadline = Number(checkpoint.operationDeadlineAt);
      if (!(deadline > 0)) {
        await this._failRecovery(checkpoint, code);
        return null;
      }
      if (deadline > 0 && Date.now() >= deadline) {
        await this._failTimedOut(checkpoint);
        return null;
      }
      await this._patch(
        checkpoint,
        { state: "RECOVERY_REQUIRED", errorType, error: code },
        false,
      );
      return deadline > 0 ? Math.max(1, deadline - Date.now()) : null;
    }
    static async _recoverCheckpoints() {
      if (this._recoveryTimer) {
        clearTimeout(this._recoveryTimer);
        this._recoveryTimer = null;
      }
      const all = (await this._storageGet("local", this.KEY)) || {};
      const owner = crypto.randomUUID();
      let nextPollDelayMs = null;
      const deferUnavailable = async (checkpoint, code, type) => {
        const delay = await this._deferUnavailable(checkpoint, code, type);
        if (delay != null)
          nextPollDelayMs =
            nextPollDelayMs == null ? delay : Math.min(nextPollDelayMs, delay);
      };
      for (const checkpoint of Object.values(all)) {
        if (
          checkpoint?.driver !== "v2" ||
          Number(checkpoint.protocolRevision) !== 1 ||
          !checkpoint.itemId ||
          !this._uuid(checkpoint.operationId)
        )
          continue;
        const liveItem = window.PromptQueue?._instance
          ?.getJob?.(checkpoint.jobId)
          ?.items?.find((item) => item.id === checkpoint.itemId);
        if (liveItem?._flowApiSubmitPromise) continue;
        const currentProject =
          window._currentProjectId || window._flowProjectId || null;
        if (
          currentProject &&
          checkpoint.projectId &&
          currentProject !== checkpoint.projectId
        ) {
          await deferUnavailable(
            checkpoint,
            "FLOW_API_V2_PROJECT_MISMATCH",
            "project_mismatch",
          );
          continue;
        }
        let config = null;
        try {
          config = await this.compatibleConfig(checkpoint);
        } catch (_) {}
        if (!config) {
          await deferUnavailable(
            checkpoint,
            "FLOW_API_V2_PINNED_CONFIG_UNAVAILABLE",
            "server_unavailable",
          );
          continue;
        }
        let requestTimeoutMs;
        try {
          requestTimeoutMs = this._runtimeInteger(
            config,
            "request_timeout_ms",
            1e3,
          );
        } catch (_) {
          await deferUnavailable(
            checkpoint,
            "V2_RUNTIME_CONFIG_INVALID",
            "server_unavailable",
          );
          continue;
        }
        const locks = (await this._storageGet("session", this.LOCK_KEY)) || {};
        if (locks[checkpoint.operationId]?.expiresAt > Date.now()) {
          const retryAfterLeaseMs = Math.max(
            250,
            Number(locks[checkpoint.operationId].expiresAt) - Date.now() + 50,
          );
          nextPollDelayMs =
            nextPollDelayMs == null
              ? retryAfterLeaseMs
              : Math.min(nextPollDelayMs, retryAfterLeaseMs);
          continue;
        }
        const lockTtlMs = Math.min(27e4, requestTimeoutMs * 2 + 3e4);
        locks[checkpoint.operationId] = {
          owner,
          expiresAt: Date.now() + lockTtlMs,
        };
        await this._storageSet("session", { [this.LOCK_KEY]: locks });
        const verified =
          (await this._storageGet("session", this.LOCK_KEY)) || {};
        if (verified[checkpoint.operationId]?.owner !== owner) continue;
        try {
          const requestPoll = () =>
            window.BridgeClient.request("flow_v2_poll_operations", {
              protocol: config.protocol,
              models: config.models,
              schema: config.schema,
              stateMapping: config.state_mapping,
              runtime: config.runtime,
              operationIds: [checkpoint.operationId],
              acceptedOperationIds: [checkpoint.operationId],
              projectId: checkpoint.projectId,
              ...(Number.isInteger(checkpoint.flowTabId)
                ? { flowTabId: checkpoint.flowTabId }
                : {}),
              protocolRevision: checkpoint.protocolRevision,
              protocolFingerprint: checkpoint.protocolFingerprint,
            });
          let poll = await requestPoll();
          const normalized = !poll?.ok
            ? window.FlowApiDriverError?.normalize?.(
                new Error(poll?.error || "FLOW_API_V2_RECOVERY_PENDING"),
                {
                  driver: "v2",
                  operationId: checkpoint.operationId,
                  dispatchStarted: true,
                },
              )
            : null;
          const maxSessionRefreshes = this._runtimeInteger(
            config,
            "session_refresh_max_attempts",
          );
          if (normalized?.retryable === true && maxSessionRefreshes > 0) {
            let recovered = null;
            try {
              recovered =
                await window.FlowApiSessionCoordinator?.recoverOperation?.({
                  driver: "v2",
                  surface: checkpoint.surface || "gen",
                  mediaType: checkpoint.mediaType,
                  operationId: checkpoint.operationId,
                  projectId: checkpoint.projectId,
                  ...(Number.isInteger(checkpoint.flowTabId)
                    ? { flowTabId: checkpoint.flowTabId }
                    : {}),
                  userInitiated: false,
                  recoveryAuthorized: true,
                });
            } catch (_) {}
            if (recovered?.ready === true) poll = await requestPoll();
          }
          const output = poll?.outputs?.find?.(
            (entry) => entry.operationId === checkpoint.operationId,
          );
          if (!poll?.ok || !output) {
            await this._patch(
              checkpoint,
              {
                state: "RECOVERY_REQUIRED",
                error: poll?.error || "FLOW_API_V2_RECOVERY_PENDING",
              },
              false,
            );
            let pollIntervalMs;
            try {
              pollIntervalMs = this._runtimeInteger(
                config,
                "poll_interval_ms",
                1,
              );
            } catch (_) {
              await deferUnavailable(
                checkpoint,
                "V2_RUNTIME_CONFIG_INVALID",
                "server_unavailable",
              );
              continue;
            }
            if (Date.now() < this._operationDeadline(checkpoint, config)) {
              nextPollDelayMs =
                nextPollDelayMs == null
                  ? pollIntervalMs
                  : Math.min(nextPollDelayMs, pollIntervalMs);
            } else {
              await this._failTimedOut(checkpoint);
            }
            continue;
          }
          const terminal = this._terminalKind(output.state);
          if (terminal === "failed") {
            const failure = window.FlowApiDriverError.fromFailedOutputs([
              output,
            ]);
            await this._patch(
              checkpoint,
              {
                state: "FAILED",
                completedAt: Date.now(),
                errorType: "unknown",
                error: window.FlowApiDriverError.displayMessage(failure),
                noRetry: true,
                errorPolicy: {
                  code: failure.code,
                  driver: "v2",
                  stage: "terminal",
                  dispatchStarted: true,
                  ambiguous: false,
                  retryable: false,
                  failureDetails: failure.failureDetails,
                },
              },
              true,
            );
            await this.remove(checkpoint.operationId);
          } else if (terminal === "completed") {
            const resolved = await this._resolve(checkpoint, output, config);
            if (!resolved?.ok) {
              await this._patch(
                checkpoint,
                {
                  state: "RECOVERY_REQUIRED",
                  error: resolved?.error || "FLOW_API_V2_RESOLVE_PENDING",
                },
                false,
              );
              try {
                const pollIntervalMs = this._runtimeInteger(
                  config,
                  "poll_interval_ms",
                  1,
                );
                if (Date.now() < this._operationDeadline(checkpoint, config)) {
                  nextPollDelayMs =
                    nextPollDelayMs == null
                      ? pollIntervalMs
                      : Math.min(nextPollDelayMs, pollIntervalMs);
                } else {
                  await this._failRecovery(
                    checkpoint,
                    resolved?.error || "V2_RESOLVE_FAILED",
                  );
                }
              } catch (_) {
                await deferUnavailable(
                  checkpoint,
                  "V2_RUNTIME_CONFIG_INVALID",
                  "server_unavailable",
                );
              }
              continue;
            }
            const mediaId = resolved.output.mediaId;
            const url =
              resolved.output.url || resolved.output.durableUrl || null;
            await this._patch(
              checkpoint,
              {
                state: "COMPLETED",
                completedAt: Date.now(),
                mediaId,
                thumb: url,
                thumbPlayUrl: url,
                thumbVideo: checkpoint.mediaType === "video",
                results: url
                  ? [
                      {
                        url,
                        playUrl: url,
                        video: checkpoint.mediaType === "video",
                        tileId: mediaId,
                        fileName: mediaId,
                      },
                    ]
                  : [],
              },
              true,
            );
            await this.remove(checkpoint.operationId);
          } else {
            await this.update(checkpoint.operationId, {
              state: output.state,
              mediaId: output.mediaId || checkpoint.mediaId,
            });
            await this._patch(
              checkpoint,
              { state: "RECOVERY_REQUIRED", error: null, errorType: null },
              false,
            );
            let pollIntervalMs;
            try {
              pollIntervalMs = this._runtimeInteger(
                config,
                "poll_interval_ms",
                1,
              );
            } catch (_) {
              await deferUnavailable(
                checkpoint,
                "V2_RUNTIME_CONFIG_INVALID",
                "server_unavailable",
              );
              continue;
            }
            if (Date.now() >= this._operationDeadline(checkpoint, config)) {
              await this._failTimedOut(checkpoint);
            } else {
              await this._patch(
                checkpoint,
                {
                  state: "RECOVERY_REQUIRED",
                  error: "FLOW_API_V2_RECOVERY_PENDING",
                },
                false,
              );
              nextPollDelayMs =
                nextPollDelayMs == null
                  ? pollIntervalMs
                  : Math.min(nextPollDelayMs, pollIntervalMs);
            }
          }
        } finally {
          const fresh =
            (await this._storageGet("session", this.LOCK_KEY)) || {};
          if (fresh[checkpoint.operationId]?.owner === owner) {
            delete fresh[checkpoint.operationId];
            await this._storageSet("session", { [this.LOCK_KEY]: fresh });
          }
        }
      }
      if (nextPollDelayMs != null && !this._recoveryTimer) {
        this._recoveryTimer = setTimeout(() => {
          this._recoveryTimer = null;
          this.recoverCheckpoints().catch((error) => {
            console.warn(
              "[FlowApiV2CheckpointStore] scheduled recovery failed:",
              error?.message || error,
            );
          });
        }, nextPollDelayMs);
      }
    }
    static async _resolve(checkpoint, output, config) {
      const mediaId = output.mediaId || checkpoint.mediaId || null;
      if (!this._uuid(mediaId)) {
        return { ok: false, error: "V2_MEDIA_ID_MISSING" };
      }
      const response = await window.BridgeClient.request(
        "flow_v2_resolve_media",
        {
          protocol: config.protocol,
          models: config.models,
          schema: config.schema,
          stateMapping: config.state_mapping,
          runtime: config.runtime,
          mediaId,
          projectId: checkpoint.projectId,
          operationId: checkpoint.operationId,
          ...(Number.isInteger(checkpoint.flowTabId)
            ? { flowTabId: checkpoint.flowTabId }
            : {}),
          mediaType: checkpoint.mediaType === "video" ? "video" : "image",
          protocolRevision: checkpoint.protocolRevision,
          protocolFingerprint: checkpoint.protocolFingerprint,
        },
      );
      if (
        !response?.ok ||
        response.output?.mediaId !== mediaId ||
        !(response.output.url || response.output.durableUrl)
      ) {
        return {
          ok: false,
          error: response?.error || "FLOW_API_V2_RESOLVE_LINEAGE_MISMATCH",
        };
      }
      return response;
    }
    static _terminalKind(state) {
      const value = String(state || "").toLowerCase();
      if (
        [
          "completed",
          "complete",
          "done",
          "succeeded",
          "success",
          "resolved",
        ].includes(value)
      )
        return "completed";
      if (
        ["failed", "error", "cancelled", "canceled", "rejected"].includes(value)
      )
        return "failed";
      return null;
    }
    static _uuid(value) {
      return (
        typeof value === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          value,
        )
      );
    }
  }
  __publicField(
    FlowApiV2CheckpointStore,
    "KEY",
    "toby_flow_api_checkpoints_v2_schema1",
  );
  __publicField(
    FlowApiV2CheckpointStore,
    "LOCK_KEY",
    "toby_flow_api_recovery_locks_v2_schema1",
  );
  __publicField(FlowApiV2CheckpointStore, "_writeTail", Promise.resolve());
  __publicField(FlowApiV2CheckpointStore, "_runtimeSnapshots", new Map());
  __publicField(FlowApiV2CheckpointStore, "_runtimeOwners", new Map());
  __publicField(FlowApiV2CheckpointStore, "_snapshotPool", new Map());
  __publicField(
    FlowApiV2CheckpointStore,
    "_snapshotFingerprints",
    new WeakMap(),
  );
  __publicField(FlowApiV2CheckpointStore, "_recoveryTimer", null);
  __publicField(FlowApiV2CheckpointStore, "_recoveryFlight", null);
  __publicField(FlowApiV2CheckpointStore, "_recoveryWakePending", false);
  __publicField(FlowApiV2CheckpointStore, "_recoveryBound", false);
  window.FlowApiV2CheckpointStore = FlowApiV2CheckpointStore;
  if (typeof globalThis !== "undefined")
    globalThis.FlowApiV2CheckpointStore = FlowApiV2CheckpointStore;
})();
