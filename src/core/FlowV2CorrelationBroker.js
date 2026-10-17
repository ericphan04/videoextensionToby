class FlowV2CorrelationBroker {
  constructor() {
    this._attempts = new Map();
    this._drainOnly = false;
    this._circuitOpen = false;
    this._bindConfigInvalidation();
  }
  _protocol() {
    return window.FlowV2CorrelationProtocol;
  }
  _structuredPromptFingerprint(parts) {
    if (!Array.isArray(parts) || !parts.some((part) => part.voice || part.char))
      return null;
    const normalize = (value) =>
      String(value || "")
        .normalize("NFKC")
        .trim()
        .replace(/\s+/g, " ");
    if (parts.some((part) => part.text === void 0 && !part.id)) return null;
    const merged = [];
    for (const part of parts) {
      if (part.text !== void 0 && merged.at(-1)?.text !== void 0)
        merged.at(-1).text += part.text;
      else merged.push({ ...part });
    }
    return this._promptFingerprint(
      JSON.stringify(
        merged
          .filter((part) => part.text === void 0 || normalize(part.text))
          .map((part) =>
            part.text !== void 0
              ? { kind: "text", text: normalize(part.text) }
              : {
                  kind: part.voice ? "voice" : "character",
                  id: String(part.id).toLowerCase(),
                },
          ),
      ),
    );
  }
  _expectedImageModelKey(item) {
    if (this.mediaTypeFor(item) !== "image") return null;
    const mapping =
      window.ProviderConfigManager?.getFlowApiModelMappingSync?.()?.image;
    const names = window.ModelRegistry?.getDomNames?.(
      "flow",
      item.settings?.model,
    ) || [item.settings?.model];
    const keys = [
      ...new Set(
        names
          .map((name) => mapping?.[name])
          .filter((key) => typeof key === "string"),
      ),
    ];
    return keys.length === 1 ? keys[0] : null;
  }
  _expectedVideoModelKey(item, normalized = false) {
    if (this.mediaTypeFor(item) !== "video") return null;
    if (
      item._flowGlobalCharacterAttached === true &&
      !item._flowInlineParts?.some((part) => part.char)
    )
      return null;
    const adapter = window.FlowApiAdapter;
    const pcm = window.ProviderConfigManager;
    const ratio = pcm?.getFlowVideoRatioMappingSync?.()?.[item.settings?.ratio];
    const hasCharacter =
      item._flowInlineParts?.some((part) => part.char) === true;
    const count = normalized
      ? 0
      : (item.refFileIds?.length || 0) + (hasCharacter ? 1 : 0);
    const type = adapter?._computeVideoGenType?.(item, count)?.genType;
    if (!type || !ratio) return null;
    const modelNames = window.ModelRegistry?.getDomNames?.(
      "flow",
      item.settings?.model,
    ) || [item.settings?.model];
    const keys = [
      ...new Set(
        modelNames
          .map((model) =>
            adapter._videoModelKey(
              type,
              ratio,
              adapter._cachedTier,
              model,
              item.settings?.flowVideoDuration,
            ),
          )
          .filter(Boolean),
      ),
    ];
    const key = keys.length === 1 ? keys[0] : null;
    if (!key) return null;
    const resolutions = window.ModelRegistry?.getGenerationResolutionConfig?.(
      "flow",
      item.settings?.model,
    );
    const resolution = resolutions?.options?.find(
      (option) => option.value === item.settings?.flowVideoResolution,
    );
    if (resolutions?.enabled && !resolution) return null;
    const suffix = resolution?.api_model_key_suffix || "";
    return suffix && !key.endsWith(suffix) ? key + suffix : key;
  }
  _normalizedVoiceFingerprint(item, submittedPrompt) {
    const parts = item._flowInlineParts;
    if (
      !/video/i.test(item.settings?.genType || "") ||
      item.refFileIds?.length ||
      !Array.isArray(parts) ||
      parts.some((part) => part.char) ||
      parts.filter((part) => part.voice).length !== 1
    )
      return null;
    return this._promptFingerprint(submittedPrompt);
  }
  _promptFingerprint(value) {
    const input = String(value || "")
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ");
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `id-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }
  _promptCorrelationMeta(value) {
    const normalized = String(value || "")
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ");
    return {
      normalizedLength: normalized.length,
      anchorFingerprint:
        normalized.length > 4096
          ? this._promptFingerprint(normalized.slice(0, 512))
          : null,
    };
  }
  _config() {
    const cfg = window.ProviderConfigManager?.getApiConfigValueSync?.(
      "flow",
      "flow_v2_web_correlation",
    );
    if (!cfg || Number(cfg.schema_version) !== this._protocol()?.VERSION)
      return null;
    if (
      !Array.isArray(cfg.allowed_surfaces) ||
      !Array.isArray(cfg.allowed_media_types) ||
      !Array.isArray(cfg.parallel_surfaces) ||
      !Array.isArray(cfg.parallel_media_types) ||
      !cfg.parallel_max_quantity ||
      typeof cfg.parallel_max_quantity !== "object" ||
      !(Number(cfg.max_active_operations) > 0) ||
      !(Number(cfg.observer_ack_timeout_ms) > 0) ||
      !(Number(cfg.receipt_timeout_ms) > 0) ||
      !(Number(cfg.attempt_ttl_ms) > 0)
    )
      return null;
    return cfg;
  }
  _bindConfigInvalidation() {
    const recheck = async ({ provider, key } = {}) => {
      if (provider && provider !== "flow") return;
      if (key && key !== "flow_v2_web_correlation") return;
      let enabled = false;
      try {
        enabled =
          (await window.ExecutionConfig?.getFlowV2WebParallelEnabledReady?.()) ===
          true;
      } catch (_) {}
      this._drainOnly = !enabled || this._circuitOpen;
      if (this._drainOnly)
        console.warn(
          "[FlowV2Correlation] kill switch OFF; drain accepted attempts, new submissions stay sequential",
        );
    };
    window.eventBus?.on?.("provider:api_config_updated", recheck);
    window.eventBus?.on?.("execution_config:refreshed", recheck);
  }
  async refreshRunGate() {
    let masterEnabled = false;
    try {
      masterEnabled =
        (await window.ExecutionConfig?.getFlowV2WebParallelEnabledReady?.()) ===
        true;
    } catch (_) {}
    this._drainOnly = !masterEnabled || this._circuitOpen;
    return { masterEnabled, config: this._config() };
  }
  capability(surface, mediaType) {
    const cfg = this._config();
    const allowedSurface =
      Array.isArray(cfg?.allowed_surfaces) &&
      cfg.allowed_surfaces.includes(surface);
    const allowedType =
      Array.isArray(cfg?.allowed_media_types) &&
      cfg.allowed_media_types.includes(mediaType);
    const productionSurface =
      Array.isArray(cfg?.parallel_surfaces) &&
      cfg.parallel_surfaces.includes(surface);
    const productionType =
      Array.isArray(cfg?.parallel_media_types) &&
      cfg.parallel_media_types.includes(mediaType);
    const masterEnabled =
      window.ExecutionConfig?.getFlowV2WebParallelEnabled?.() === true;
    const observable = !!cfg && allowedSurface && allowedType;
    const parallel =
      observable &&
      masterEnabled &&
      !this._drainOnly &&
      cfg.observation_only === false &&
      productionSurface &&
      productionType;
    return {
      observable,
      parallel,
      maxActiveOperations: Math.max(1, Number(cfg?.max_active_operations) || 1),
      requestBindTimeoutMs: Math.min(
        3e4,
        Math.max(15e3, Number(cfg?.receipt_timeout_ms) || 0),
      ),
      receiptTimeoutMs: Math.max(1e3, Number(cfg?.receipt_timeout_ms) || 0),
      attemptTtlMs: Math.max(5e3, Number(cfg?.attempt_ttl_ms) || 0),
      reason: !cfg
        ? "config_missing"
        : !masterEnabled
          ? "master_off"
          : this._drainOnly
            ? "drain_only"
            : cfg.observation_only !== false
              ? "observation_only"
              : !productionSurface
                ? "surface_not_rollout"
                : !productionType
                  ? "media_not_rollout"
                  : null,
    };
  }
  surfaceFor(item) {
    const owner = String(item?._owner || "").toLowerCase();
    return owner === "workflow"
      ? "workflow"
      : owner === "task"
        ? "task"
        : "gen";
  }
  mediaTypeFor(item) {
    return String(item?.settings?.genType || "").toLowerCase() === "video"
      ? "video"
      : "image";
  }
  itemCapability(item) {
    const capability = this.capability(
      this.surfaceFor(item),
      this.mediaTypeFor(item),
    );
    if (item?.settings?.manualSubmitMode === true) {
      return { ...capability, parallel: false, reason: "manual_submit" };
    }
    const cfg = this._config();
    const mediaType = this.mediaTypeFor(item);
    const maxQuantity = Math.max(
      0,
      Number(cfg?.parallel_max_quantity?.[mediaType]) || 0,
    );
    const quantity = Math.max(1, Number(item?.settings?.quantity) || 1);
    if (quantity > maxQuantity) {
      return { ...capability, parallel: false, reason: "quantity_not_rollout" };
    }
    if (quantity > capability.maxActiveOperations) {
      return { ...capability, parallel: false, reason: "active_operation_cap" };
    }
    return capability;
  }
  async arm(item, submittedPrompt = null) {
    const surface = this.surfaceFor(item);
    const mediaType = this.mediaTypeFor(item);
    let capability = this.itemCapability(item);
    if (!capability.observable) return { armed: false, capability };
    const cfg = this._config();
    const context = await window.MessageBridge?.getTargetContext?.();
    if (context?.driverKey !== "flow_v2" || !context.projectId) {
      return { armed: false, capability, reason: "context_invalid" };
    }
    const now = Date.now();
    if (item?._phaseR) {
      capability = {
        ...capability,
        requestBindTimeoutMs: Math.min(
          capability.receiptTimeoutMs,
          capability.attemptTtlMs,
        ),
      };
    }
    const quantity = Math.max(1, Number(item?.settings?.quantity) || 1);
    const refResolution = window.FlowApiAdapter?._resolveRefs?.(item);
    if (
      (item.refFileIds || []).length > 0 &&
      (!refResolution ||
        refResolution.unresolved?.length > 0 ||
        refResolution.resolved?.length !== item.refFileIds.length)
    ) {
      return {
        armed: false,
        capability,
        reason: "reference_identity_unresolved",
      };
    }
    const attempt = {
      attemptId: item.attemptId || item.id,
      state: this._protocol().STATES.ARMED,
      surface,
      mediaType,
      projectId: context.projectId,
      targetContext: { ...context },
      expectedQuantity: quantity,
      expectedRequestCount: 1,
      capability,
      receipts: [],
      operationIds: [],
      mediaIds: [],
      children: [],
      createdAt: now,
      expiresAt: now + capability.attemptTtlMs,
      lastSequence: 0,
      strong: false,
    };
    item._flowAcceptanceAmbiguous = null;
    item._flowTerminalResponseError = null;
    item._flowResponseEvidenceExpired = false;
    item._flowResultEvidenceExpired = false;
    item._flowPresubmitGuard = null;
    const promptMeta = this._promptCorrelationMeta(
      submittedPrompt ?? item.prompt,
    );
    const inlineCharacterIds = [
      ...new Set(
        (item._flowInlineParts || [])
          .filter((part) => part.char && part.id)
          .map((part) => part.id),
      ),
    ];
    const expectedGlobalCharacter =
      item._flowGlobalCharacterAttached === true &&
      inlineCharacterIds.length === 0;
    let result;
    try {
      result = await window.MessageBridge.armFlowCorrelation({
        attemptId: attempt.attemptId,
        projectId: attempt.projectId,
        mediaType,
        expectedQuantity: quantity,
        ttlMs: capability.attemptTtlMs,
        promptFingerprint: this._promptFingerprint(
          submittedPrompt ?? item.prompt,
        ),
        promptAnchorFingerprint: promptMeta.anchorFingerprint,
        promptNormalizedLength: promptMeta.normalizedLength,
        structuredPromptFingerprint: this._structuredPromptFingerprint(
          item._flowInlineParts,
        ),
        normalizedVoiceFingerprint: this._expectedVideoModelKey(item, true)
          ? this._normalizedVoiceFingerprint(
              item,
              submittedPrompt ?? item.prompt,
            )
          : null,
        expectedReferenceIds: [
          ...new Set([
            ...(refResolution?.resolved || []),
            ...inlineCharacterIds,
          ]),
        ],
        expectedMediaReferenceIds: [...new Set(refResolution?.resolved || [])],
        expectedCharacterIds: inlineCharacterIds,
        expectedGlobalCharacter,
        expectedGlobalCharacterCount: expectedGlobalCharacter
          ? item._flowGlobalCharacterCount || 1
          : 0,
        expectedImageModelKey: this._expectedImageModelKey(item),
        expectedVideoModelKey: this._expectedVideoModelKey(item),
        expectedVideoRatioEnum:
          mediaType === "video"
            ? Number(
                window.FlowApiAdapter?._videoRatio?.(item.settings?.ratio),
              ) || null
            : null,
        normalizedVideoModelKey: this._expectedVideoModelKey(item, true),
        strictDispatch: !!item._phaseR,
      });
    } catch (error) {
      result = { success: false, error: error?.message || "arm_failed" };
    }
    if (!result?.success) {
      try {
        await window.MessageBridge.disarmFlowCorrelation(
          attempt.attemptId,
          false,
        );
      } catch (_) {}
      return {
        armed: false,
        capability,
        reason: result?.error || "arm_failed",
      };
    }
    this._attempts.set(attempt.attemptId, attempt);
    let ack = null;
    try {
      ack = await this._next(
        attempt,
        ["armed"],
        Math.max(100, Number(cfg.observer_ack_timeout_ms)),
      );
    } catch (error) {
      attempt.lastReceiptError = error?.message || "CORRELATION_ACK_FAILED";
    }
    if (!ack) {
      await this.disarm(item, this._protocol().STATES.FAILED, {
        dispatched: false,
      });
      return { armed: false, capability, reason: "observer_ack_timeout" };
    }
    const requiredObserverRevision = this._protocol().OBSERVER_REVISION;
    const observerIncompatible =
      ack.structuredPromptVersion !== 2 ||
      ack.observerRevision !== requiredObserverRevision;
    if (
      observerIncompatible ||
      ack.xhrHookActive !== true ||
      ack.fetchHookActive !== true
    ) {
      await this.disarm(item, this._protocol().STATES.FAILED, {
        dispatched: false,
      });
      item.auditLifecycle?.("correlation_observer_incompatible", {
        requiredStructuredPromptVersion: 2,
        observedStructuredPromptVersion: ack.structuredPromptVersion || null,
        requiredObserverRevision,
        observedObserverRevision: ack.observerRevision || null,
        xhrHookActive: ack.xhrHookActive === true,
        fetchHookActive: ack.fetchHookActive === true,
      });
      return {
        armed: false,
        capability,
        reason: observerIncompatible
          ? "observer_update_required"
          : "observer_unavailable",
      };
    }
    if (ack.reason === "ambiguous_retired_request") {
      await this.disarm(item, this._protocol().STATES.FAILED, {
        dispatched: false,
      });
      item.auditLifecycle?.("correlation_ambiguous_request", {
        phase: "before_dispatch",
      });
      return {
        armed: false,
        capability,
        reason: "ambiguous_retired_request",
        resetContext: context,
      };
    }
    item.correlationState = attempt.state;
    item._flowCorrelationTarget = { ...context };
    item._flowPresubmitGuard = {
      attemptId: attempt.attemptId,
      validUntil: attempt.createdAt + attempt.capability.requestBindTimeoutMs,
    };
    item.auditLifecycle?.("correlation_armed", {
      surface,
      observationOnly: !capability.parallel,
      structuredPromptFingerprint: this._structuredPromptFingerprint(
        item._flowInlineParts,
      ),
      submittedTextLength: String(submittedPrompt ?? item.prompt ?? "").length,
      submittedTextFingerprint: this._promptFingerprint(
        submittedPrompt ?? item.prompt,
      ),
      receiptTimeoutMs: capability.receiptTimeoutMs,
      requestBindTimeoutMs: capability.requestBindTimeoutMs,
    });
    return { armed: true, attempt, capability };
  }
  async _next(attempt, stages, timeoutMs = null) {
    let result;
    try {
      result = await window.MessageBridge.waitFlowCorrelation(
        attempt.attemptId,
        stages,
        timeoutMs || attempt.capability.receiptTimeoutMs,
        attempt.lastSequence,
      );
    } catch (error) {
      if (error?.message !== "CORRELATION_RECEIPT_TIMEOUT") throw error;
      result = { success: false, error: "CORRELATION_RECEIPT_TIMEOUT" };
    }
    if (!result?.success) {
      attempt.lastReceiptError =
        typeof result?.error === "string" && /^[A-Z_]{1,96}$/.test(result.error)
          ? result.error
          : "CORRELATION_RECEIPT_UNAVAILABLE";
      return null;
    }
    if (!this._protocol().validateReceipt(result.receipt, attempt)) {
      attempt.lastReceiptError = "CORRELATION_RECEIPT_INVALID";
      return null;
    }
    attempt.lastReceiptError = null;
    attempt.lastSequence = Math.max(
      attempt.lastSequence,
      Number(result.receipt.sequence) || 0,
    );
    attempt.receipts.push(result.receipt);
    return result.receipt;
  }
  async verifyBeforeSubmit(item, submittedPrompt) {
    const start = Date.now();
    const attempt = this._attempts.get(item.attemptId || item.id);
    const context = await window.MessageBridge.getTargetContext();
    const document = await window.MessageBridge.countInlineChips();
    const finalContext = await window.MessageBridge.getTargetContext();
    const partsFingerprint = this._structuredPromptFingerprint(document?.parts);
    const valid =
      attempt &&
      !attempt.disarmed &&
      Date.now() <
        attempt.createdAt + attempt.capability.requestBindTimeoutMs &&
      context?.projectId === attempt.projectId &&
      context?.driverKey === "flow_v2" &&
      finalContext?.projectId === context.projectId &&
      finalContext?.tabId === context.tabId &&
      finalContext?.driverKey === context.driverKey &&
      (item._flowTabId == null || context.tabId === item._flowTabId) &&
      typeof document?.submittedText === "string" &&
      this._promptFingerprint(document.submittedText) ===
        this._promptFingerprint(submittedPrompt) &&
      partsFingerprint ===
        this._structuredPromptFingerprint(item._flowInlineParts) &&
      (item._phaseRRecord?.snapshot.accountId == null ||
        String(item._phaseRRecord.snapshot.accountId) ===
          String(window.authManager?.user?.id));
    item.auditLifecycle?.("correlation_presubmit_verified", {
      valid: !!valid,
      elapsedMs: Date.now() - start,
      visibility: document?.visibility || null,
      focused: document?.focused ?? null,
      documentScope: "flow_page",
    });
    item._flowPresubmitGuard = valid
      ? {
          attemptId: attempt.attemptId,
          validUntil:
            attempt.createdAt + attempt.capability.requestBindTimeoutMs,
        }
      : null;
    return !!valid;
  }
  _retainVerifiedImageChildren(item, attempt, requests, responses) {
    if (!item._phaseR || attempt.mediaType !== "image") return;
    const children = Array(attempt.expectedQuantity).fill(null);
    const seenOps = new Set(),
      seenMedia = new Set();
    for (const response of responses) {
      const ordinal = response.requestOrdinal;
      if (
        !Number.isInteger(ordinal) ||
        ordinal < 0 ||
        ordinal >= children.length ||
        requests.filter(
          (request) =>
            request.requestOrdinal === ordinal &&
            request.requestCardinality === attempt.expectedRequestCount,
        ).length !== 1 ||
        responses.filter((other) => other.requestOrdinal === ordinal).length !==
          1 ||
        !(response.httpStatus >= 200 && response.httpStatus < 300)
      )
        continue;
      const owned = (response.children || []).filter(
        (child2) =>
          child2.status === "completed" && child2.operationId && child2.mediaId,
      );
      if (owned.length !== 1) continue;
      const child = owned[0];
      if (seenOps.has(child.operationId) || seenMedia.has(child.mediaId))
        return;
      seenOps.add(child.operationId);
      seenMedia.add(child.mediaId);
      children[ordinal] = child;
    }
    if (children.some(Boolean))
      item.flowCorrelationReceipt = {
        strong: false,
        verifiedPartial: true,
        children,
        schemaVersion: this._protocol().VERSION,
        operationIds: [...seenOps],
        mediaIds: [...seenMedia],
      };
  }
  async observeAfterSubmit(item) {
    const attempt = this._attempts.get(item?.attemptId || item?.id);
    if (!attempt || attempt.disarmed || item.state === "CANCELLED") return null;
    const P = this._protocol();
    const requests = [];
    const responses = [];
    const bindDeadline = Date.now() + attempt.capability.requestBindTimeoutMs;
    while (
      requests.length < attempt.expectedRequestCount ||
      responses.length < attempt.expectedRequestCount
    ) {
      const receiptWaitMs = attempt.requestBound
        ? Math.min(
            attempt.capability.receiptTimeoutMs,
            Math.max(100, attempt.expiresAt - Date.now()),
          )
        : Math.max(1, bindDeadline - Date.now());
      const receipt = await this._next(
        attempt,
        ["request_seen", "response_seen", "acceptance_unknown"],
        receiptWaitMs,
      );
      if (
        attempt.disarmed ||
        this._attempts.get(attempt.attemptId) !== attempt ||
        item.state === "CANCELLED" ||
        (item._phaseR && item.attemptId !== attempt.attemptId)
      )
        return null;
      if (
        !receipt &&
        attempt.requestBound &&
        attempt.lastReceiptError === "CORRELATION_RECEIPT_TIMEOUT" &&
        Date.now() < attempt.expiresAt
      ) {
        item.auditLifecycle?.("correlation_response_pending", {
          requestCount: requests.length,
          responseCount: responses.length,
          remainingMs: attempt.expiresAt - Date.now(),
        });
        continue;
      }
      if (!receipt || receipt.stage === "acceptance_unknown") {
        item._flowResponseEvidenceExpired =
          !receipt &&
          attempt.requestBound === true &&
          Date.now() >= attempt.expiresAt;
        if (!receipt && requests.length < attempt.expectedRequestCount) {
          try {
            const snapshot = await window.MessageBridge.snapshotFlowCorrelation(
              attempt.attemptId,
            );
            const mismatch = snapshot?.receipts
              ?.filter((entry) => entry.stage === "input_seen")
              .at(-1);
            if (mismatch)
              item.auditLifecycle?.("correlation_input_mismatch", {
                promptExact: mismatch.promptExact === true,
                promptAnchorMatched: mismatch.promptAnchorMatched === true,
                actualPromptLength: mismatch.actualPromptLength || 0,
                expectedPromptLength: this._promptCorrelationMeta(item.prompt)
                  .normalizedLength,
                modelMatched: mismatch.modelMatched === true,
                ratioMatched: mismatch.ratioMatched === true,
                quantityMatched: mismatch.quantityMatched === true,
                referencesMatched: mismatch.referencesMatched === true,
                actualReferenceCount: mismatch.actualReferenceCount || 0,
                expectedReferenceCount: mismatch.expectedReferenceCount || 0,
              });
          } catch (_) {}
        }
        attempt.state = P.STATES.ACCEPTANCE_UNKNOWN;
        item.correlationState = attempt.state;
        item._flowAcceptanceAmbiguous = {
          requestBound: attempt.requestBound === true,
          phase:
            requests.length < attempt.expectedRequestCount
              ? "request"
              : "response",
          reason:
            receipt?.reason ||
            (receipt
              ? "observer_acceptance_unknown"
              : attempt.lastReceiptError),
          httpStatus: Number(receipt?.httpStatus) || 0,
        };
        item.auditLifecycle?.("correlation_acceptance_unknown", {
          phase:
            requests.length < attempt.expectedRequestCount
              ? "request"
              : "response",
          requestCount: requests.length,
          responseCount: responses.length,
          reason:
            receipt?.reason ||
            (receipt
              ? "observer_acceptance_unknown"
              : attempt.lastReceiptError),
          transport: receipt?.transport || null,
          receiptWaitMs,
        });
        this._retainVerifiedImageChildren(item, attempt, requests, responses);
        return attempt;
      }
      if (receipt.stage === "request_seen") requests.push(receipt);
      else if (receipt.stage === "response_seen") {
        responses.push(receipt);
        if (receipt.reason === "generation_response_missing_ownership") {
          attempt.state = P.STATES.ACCEPTANCE_UNKNOWN;
          item.correlationState = attempt.state;
          const explicitCodes = Array.isArray(receipt.terminalErrorCodes)
            ? receipt.terminalErrorCodes
            : [];
          item._flowTerminalResponseError =
            attempt.requestBound === true &&
            attempt.expectedRequestCount === 1 &&
            requests.length === 1 &&
            responses.length === 1 &&
            receipt.httpStatus >= 200 &&
            receipt.httpStatus < 300 &&
            receipt.rpcResponseMatched === true &&
            receipt.children?.length === 0 &&
            receipt.operationIds?.length === 0 &&
            receipt.identityCandidates?.length === 0 &&
            explicitCodes.length > 0
              ? {
                  errorCodes: explicitCodes.slice(0, 12),
                  httpStatus: receipt.httpStatus,
                }
              : null;
          item._flowAcceptanceAmbiguous = {
            requestBound: attempt.requestBound === true,
            phase: "response",
            reason: receipt.reason,
            httpStatus: Number(receipt.httpStatus) || 0,
            rpcResponseMatched: receipt.rpcResponseMatched === true,
          };
          item.auditLifecycle?.("correlation_acceptance_unknown", {
            phase: "response",
            reason: receipt.reason,
            httpStatus: receipt.httpStatus,
            requestCount: requests.length,
            responseCount: responses.length,
            rpcResponseMatched: receipt.rpcResponseMatched === true,
            responseCharacters: receipt.responseCharacters || 0,
            responseRootCount: receipt.responseRootCount || 0,
            responseDecodedCount: receipt.responseDecodedCount || 0,
            errorCodes: (receipt.errorCodes || []).slice(0, 12),
            terminalErrorCodes: explicitCodes.slice(0, 12),
            explicitTerminalError: item._flowTerminalResponseError !== null,
          });
          this._retainVerifiedImageChildren(item, attempt, requests, responses);
          return attempt;
        }
      }
      if (
        !attempt.requestBound &&
        requests.length === attempt.expectedRequestCount
      ) {
        const ordinals = [
          ...new Set(requests.map((entry) => entry.requestOrdinal)),
        ].sort((a, b) => a - b);
        attempt.requestBound =
          requests.every(
            (entry) =>
              entry.requestCardinality === attempt.expectedRequestCount,
          ) &&
          ordinals.length === attempt.expectedRequestCount &&
          ordinals.every((ordinal, index) => ordinal === index);
        if (attempt.requestBound) {
          attempt.state = P.STATES.REQUEST_SEEN;
          item.correlationState = attempt.state;
          item.auditLifecycle?.("correlation_request_seen", {
            requestCount: requests.length,
            matchKind: receipt.matchKind || null,
            elapsedMs: Date.now() - attempt.createdAt,
            visibility: globalThis.document?.visibilityState || null,
            focused: globalThis.document?.hasFocus?.() ?? null,
            promptExact: receipt.promptExact === true,
            promptAnchorMatched: receipt.promptAnchorMatched === true,
            modelMatched: receipt.modelMatched === true,
            ratioMatched: receipt.ratioMatched === true,
            quantityMatched: receipt.quantityMatched === true,
            referencesMatched: receipt.referencesMatched === true,
            actualReferenceCount: receipt.actualReferenceCount || 0,
            expectedReferenceCount: receipt.expectedReferenceCount || 0,
          });
        }
      }
    }
    if (!attempt.requestBound) {
      attempt.state = P.STATES.ACCEPTANCE_UNKNOWN;
      item.correlationState = attempt.state;
      return attempt;
    }
    responses.sort((a, b) => a.requestOrdinal - b.requestOrdinal);
    const childrenByPair = new Map();
    for (const child of responses.flatMap(
      (receipt) => receipt.children || [],
    )) {
      const normalizedChild = {
        ...child,
        status: child.status || (child.mediaId ? "completed" : "failed"),
        errorCodes: Array.isArray(child.errorCodes) ? child.errorCodes : [],
      };
      childrenByPair.set(
        `${normalizedChild.operationId}:${normalizedChild.mediaId || normalizedChild.status}`,
        normalizedChild,
      );
    }
    attempt.children = [...childrenByPair.values()];
    const activeByOperation = new Map(
      attempt.children
        .filter(
          (child) =>
            ["accepted", "completed"].includes(child.status) && child.mediaId,
        )
        .map((child) => [child.operationId, child]),
    );
    const activeCandidates = [...activeByOperation.values()];
    const completedByMedia = new Map(
      activeCandidates
        .filter((child) => child.status === "completed")
        .map((child) => [child.mediaId, child]),
    );
    const completedCandidates = [...completedByMedia.values()];
    const activeOps = new Set(
      activeCandidates.map((child) => child.operationId),
    );
    const failedByOperation = new Map(
      attempt.children
        .filter(
          (child) =>
            child.status === "failed" &&
            !child.mediaId &&
            !activeOps.has(child.operationId),
        )
        .map((child) => [child.operationId, child]),
    );
    const failedCandidates = [...failedByOperation.values()];
    const remaining = attempt.expectedQuantity - activeCandidates.length;
    if (
      remaining >= 0 &&
      (remaining === 0 || failedCandidates.length === remaining)
    ) {
      const selected = new Set([
        ...activeCandidates,
        ...failedCandidates.slice(0, remaining),
      ]);
      attempt.children = attempt.children.filter((child) =>
        selected.has(child),
      );
    }
    attempt.operationIds = [
      ...new Set(attempt.children.map((child) => child.operationId)),
    ];
    attempt.mediaIds = [
      ...new Set(
        attempt.children
          .filter((child) => child.status === "completed" && child.mediaId)
          .map((child) => child.mediaId),
      ),
    ];
    const expectedOrdinals = Array.from(
      { length: attempt.expectedRequestCount },
      (_, index) => index,
    );
    const requestOrdinals = [
      ...new Set(requests.map((receipt) => receipt.requestOrdinal)),
    ].sort((a, b) => a - b);
    const responseOrdinals = [
      ...new Set(responses.map((receipt) => receipt.requestOrdinal)),
    ].sort((a, b) => a - b);
    const exactRequestShape =
      requests.length === attempt.expectedRequestCount &&
      responses.length === attempt.expectedRequestCount &&
      requests.every(
        (receipt) =>
          receipt.requestCardinality === attempt.expectedRequestCount,
      ) &&
      requestOrdinals.length === expectedOrdinals.length &&
      responseOrdinals.length === expectedOrdinals.length &&
      expectedOrdinals.every(
        (ordinal, index) =>
          requestOrdinals[index] === ordinal &&
          responseOrdinals[index] === ordinal,
      );
    const childOperations = new Set(
      attempt.children.map((child) => child.operationId),
    );
    const completedChildren = attempt.children.filter(
      (child) => child.status === "completed",
    );
    const failedChildren = attempt.children.filter(
      (child) => child.status === "failed",
    );
    const acceptedChildren = attempt.children.filter(
      (child) => child.status === "accepted",
    );
    const acceptedMedia = new Set(
      acceptedChildren.map((child) => child.mediaId).filter(Boolean),
    );
    const childMedia = new Set(completedChildren.map((child) => child.mediaId));
    const exactChildShape =
      attempt.operationIds.length === attempt.expectedQuantity &&
      attempt.children.length === attempt.expectedQuantity &&
      childOperations.size === attempt.expectedQuantity &&
      attempt.mediaIds.length === completedChildren.length &&
      childMedia.size === completedChildren.length &&
      attempt.operationIds.every((id) => childOperations.has(id)) &&
      attempt.mediaIds.every((id) => childMedia.has(id)) &&
      (attempt.mediaType !== "video" ||
        acceptedChildren.length +
          completedChildren.length +
          failedChildren.length ===
          attempt.expectedQuantity) &&
      acceptedMedia.size === acceptedChildren.length &&
      failedChildren.every(
        (child) => !child.mediaId && child.errorCodes?.length > 0,
      );
    const httpAccepted = responses.every(
      (receipt) => receipt.httpStatus >= 200 && receipt.httpStatus < 300,
    );
    attempt.strong = httpAccepted && exactRequestShape && exactChildShape;
    attempt.state = attempt.strong
      ? P.STATES.ACCEPTED
      : P.STATES.ACCEPTANCE_UNKNOWN;
    item.correlationState = attempt.state;
    if (!attempt.strong)
      item._flowAcceptanceAmbiguous = {
        requestBound: attempt.requestBound === true,
        phase: "response",
        reason: "generation_response_shape_unverified",
        httpStatus: httpAccepted
          ? 200
          : Number(responses.find((entry) => entry.httpStatus)?.httpStatus) ||
            0,
      };
    item.flowOperationId = attempt.strong ? attempt.operationIds[0] : null;
    item.flowCorrelationReceipt = {
      schemaVersion: P.VERSION,
      operationIds: attempt.operationIds,
      mediaIds: attempt.mediaIds,
      children: attempt.children,
      errorCodes: [
        ...new Set(responses.flatMap((receipt) => receipt.errorCodes || [])),
      ],
      strong: attempt.strong,
    };
    if (attempt.strong) {
      const runtimeAliases = [
        ...new Set([
          ...(item._ownTileAliases || []),
          ...(item._ownTileIds || []).filter((id) =>
            /^dom-tile:/i.test(String(id)),
          ),
        ]),
      ];
      const hasNonCompletedChild = attempt.children.some(
        (child) => child.status !== "completed",
      );
      item._ownTileAliases = hasNonCompletedChild
        ? runtimeAliases
        : runtimeAliases.filter((id) => !/^dom-tile:/i.test(String(id)));
      item._ownTileIds = attempt.mediaIds.slice(0, attempt.expectedQuantity);
      item._mustFollowProcessingOwners = false;
      item._observedProcessingTileIds = [];
      item.setPendingOwners?.(item._ownTileIds, "provider_bound");
      if (attempt.mediaType === "video" && acceptedChildren.length > 0) {
        item._flowResultEvidencePromise = this._waitForVideoResultEvidence(
          item,
          attempt,
        );
        item._flowResultEvidencePromise.catch(() => {});
      }
    }
    item.auditLifecycle?.("correlation_response_seen", {
      requestCount: requests.length,
      responseCount: responses.length,
      operationCount: attempt.operationIds.length,
      mediaCount: attempt.mediaIds.length,
      childCount: attempt.children.length,
      strong: attempt.strong,
      exactRequestShape,
      exactChildShape,
      requestIdentityCounts: requests.map(
        (receipt) => receipt.requestIdentityCount || 0,
      ),
      requestIdentityFingerprints: requests.map(
        (receipt) => receipt.requestIdentityFingerprint || null,
      ),
      requestIdentityTokens: requests.map(
        (receipt) => receipt.requestIdentityTokens || [],
      ),
      responseIdentityCounts: responses.map(
        (receipt) => receipt.responseIdentityCount || 0,
      ),
    });
    return attempt;
  }
  async _waitForVideoResultEvidence(item, attempt) {
    const ledger = new Map(
      (attempt.children || []).map((child) => [
        child.operationId,
        {
          operationId: child.operationId,
          queuedMediaId: child.mediaId || null,
          terminalMediaId: child.status === "completed" ? child.mediaId : null,
          status: child.status,
          errorCodes: child.errorCodes || [],
          acceptedAt: Date.now(),
          lastPollAt: null,
          terminalAt: null,
          thumbnail: child.thumbnail || null,
          video_url: child.video_url || null,
        },
      ]),
    );
    while (Date.now() < attempt.expiresAt) {
      const receipt = await this._next(
        attempt,
        ["poll_seen", "result_seen"],
        Math.min(
          attempt.capability.receiptTimeoutMs,
          Math.max(100, attempt.expiresAt - Date.now()),
        ),
      );
      if (
        item._phaseR &&
        (attempt.disarmed ||
          this._attempts.get(attempt.attemptId) !== attempt ||
          item.attemptId !== attempt.attemptId)
      )
        return { strong: false, mediaIds: [] };
      if (!receipt) continue;
      const now = Date.now();
      for (const child of receipt.children || []) {
        if (!ledger.has(child.operationId)) continue;
        const previous = ledger.get(child.operationId) || {
          operationId: child.operationId,
          queuedMediaId: null,
          acceptedAt: now,
        };
        if (["completed", "failed"].includes(previous.status)) continue;
        ledger.set(child.operationId, {
          ...previous,
          status: child.status,
          thumbnail: child.thumbnail || previous.thumbnail || null,
          video_url: child.video_url || previous.video_url || null,
          lastPollAt: now,
          terminalAt: ["completed", "failed"].includes(child.status)
            ? now
            : null,
          terminalMediaId: child.status === "completed" ? child.mediaId : null,
          errorCodes: child.errorCodes || [],
        });
      }
      const children = [...ledger.values()];
      const terminal = children.filter((child) =>
        ["completed", "failed"].includes(child.status),
      );
      const completed = terminal.filter(
        (child) => child.status === "completed" && child.terminalMediaId,
      );
      item.auditLifecycle?.("correlation_poll_seen", {
        processingCount: children.filter(
          (child) => child.status === "processing",
        ).length,
        terminalCount: terminal.length,
      });
      if (terminal.length < attempt.expectedQuantity) continue;
      attempt.children = children.map((child) => ({
        operationId: child.operationId,
        mediaId: child.terminalMediaId || null,
        status: child.status,
        errorCodes: child.errorCodes || [],
        thumbnail: child.thumbnail || null,
        video_url: child.video_url || null,
      }));
      attempt.operationIds = [
        ...new Set(attempt.children.map((child) => child.operationId)),
      ];
      attempt.mediaIds = [
        ...new Set(completed.map((child) => child.terminalMediaId)),
      ];
      const failedCount = terminal.filter(
        (child) => child.status === "failed",
      ).length;
      item.providerGenerationState =
        failedCount === 0
          ? "COMPLETED"
          : completed.length > 0
            ? "PARTIAL_FAIL"
            : "FAILED";
      item.providerCompletedAt = now;
      item.flowCorrelationReceipt = {
        ...(item.flowCorrelationReceipt || {}),
        operationIds: attempt.operationIds,
        mediaIds: attempt.mediaIds,
        children: attempt.children,
        strong: true,
      };
      if (
        failedCount === 0 &&
        attempt.mediaIds.length === attempt.expectedQuantity
      ) {
        item._ownTileAliases = (item._ownTileAliases || []).filter(
          (id) => !/^dom-tile:/i.test(String(id)),
        );
      }
      item._ownTileIds = attempt.mediaIds.slice(0, attempt.expectedQuantity);
      item.setPendingOwners?.(item._ownTileIds, "provider_terminal");
      item.auditLifecycle?.("correlation_result_seen", {
        mediaCount: item._ownTileIds.length,
        failedCount,
      });
      try {
        window.PromptQueue?.getInstance?.()._emitStateChanged?.();
      } catch (_) {}
      return {
        strong: true,
        mediaIds: item._ownTileIds,
        children: attempt.children,
      };
    }
    return { strong: false, mediaIds: [], expired: true };
  }
  async waitForRequestBound(item) {
    const attempt = this._attempts.get(item?.attemptId || item?.id);
    if (!attempt) return false;
    const deadline = Date.now() + attempt.capability.requestBindTimeoutMs;
    while (Date.now() < deadline) {
      if (attempt.disarmed || this._attempts.get(attempt.attemptId) !== attempt)
        return false;
      if (attempt.requestBound === true) return true;
      if (
        [
          this._protocol().STATES.ACCEPTANCE_UNKNOWN,
          this._protocol().STATES.REJECTED,
          this._protocol().STATES.FAILED,
        ].includes(attempt.state)
      )
        return false;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return false;
  }
  canPipelineItem(item) {
    const attempt = this._attempts.get(item?.attemptId || item?.id);
    return (
      attempt?.parallelRevoked !== true &&
      attempt?.capability.parallel === true &&
      (attempt?.requestBound === true || attempt?.strong === true) &&
      ![
        this._protocol().STATES.ACCEPTANCE_UNKNOWN,
        this._protocol().STATES.REJECTED,
        this._protocol().STATES.FAILED,
      ].includes(attempt.state)
    );
  }
  canBypassMonitorDrain(activeItems = []) {
    return (
      !this._drainOnly &&
      Array.isArray(activeItems) &&
      activeItems.length > 0 &&
      activeItems.every((item) => this.canPipelineItem(item))
    );
  }
  operationCountFor(item) {
    const attempt = this._attempts.get(item?.attemptId || item?.id);
    if (attempt?.strong && attempt.operationIds.length > 0)
      return attempt.operationIds.length;
    return Math.max(1, Number(item?.settings?.quantity) || 1);
  }
  canAdmitWithActive(item, activeItems = []) {
    const capability = this.itemCapability(item);
    if (
      capability.parallel !== true ||
      !this.canBypassMonitorDrain(activeItems)
    )
      return false;
    const activeOperations = activeItems.reduce(
      (total, activeItem) => total + this.operationCountFor(activeItem),
      0,
    );
    return (
      activeOperations + this.operationCountFor(item) <=
      capability.maxActiveOperations
    );
  }
  getCheckpoint(item) {
    const attempt = this._attempts.get(item?.attemptId || item?.id);
    return attempt ? this._protocol().checkpoint(attempt) : null;
  }
  markMonitoring(item) {
    const attempt = this._attempts.get(item?.attemptId || item?.id);
    if (!attempt) return;
    const next = this._protocol().STATES.MONITORING;
    if (this._protocol().canTransition(attempt.state, next))
      attempt.state = next;
  }
  revokeParallel(item, reason = "runtime_downgrade") {
    const attempt = this._attempts.get(item?.attemptId || item?.id);
    if (!attempt) return false;
    attempt.parallelRevoked = true;
    if (item._phaseR) return true;
    attempt.strong = false;
    item.flowOperationId = null;
    if (item.flowCorrelationReceipt) item.flowCorrelationReceipt.strong = false;
    item.auditLifecycle?.("correlation_parallel_revoked", { reason });
    return true;
  }
  auditTerminal(item) {
    const attempt = this._attempts.get(item?.attemptId || item?.id);
    if (!attempt) return null;
    const observed = new Set(
      [
        ...(item.resultTileIds || []),
        ...(item.outputs || []).flatMap((output) => [
          output.resultId,
          output.mediaId,
          output.mediaUuid,
          ...(output.identityAliases || []),
        ]),
        ...Object.values(item.resultThumbnails || {}).flatMap((info) => [
          info?.media_uuid,
          info?.persistent_media_id,
          info?.file_name,
          ...(Array.isArray(info?.identity_aliases)
            ? info.identity_aliases
            : []),
        ]),
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase()),
    );
    const matched = attempt.mediaIds.filter((id) =>
      observed.has(String(id).toLowerCase()),
    ).length;
    const terminalSuccess =
      item.state === "COMPLETED" || item.state === "PARTIAL_FAIL";
    const providerIds = new Set(
      attempt.mediaIds.map((id) => String(id).toLowerCase()),
    );
    const completedOutputs = (item.outputs || []).filter(
      (output) => output?.status === "completed",
    );
    const completedOutputMatches = completedOutputs.filter((output) =>
      [
        output.resultId,
        output.mediaId,
        output.mediaUuid,
        ...(output.identityAliases || []),
      ]
        .filter(Boolean)
        .some((value) => providerIds.has(String(value).toLowerCase())),
    ).length;
    const allCompletedOutputsOwned =
      completedOutputMatches === completedOutputs.length;
    const safeCardinality =
      item.state === "COMPLETED"
        ? matched >= attempt.expectedQuantity &&
          completedOutputs.length >= attempt.expectedQuantity
        : matched >= completedOutputs.length;
    const safe =
      !attempt.strong ||
      !terminalSuccess ||
      (completedOutputs.length > 0 &&
        allCompletedOutputsOwned &&
        safeCardinality);
    if (!safe) {
      this._circuitOpen = true;
      this._drainOnly = true;
      console.error(
        "[FlowV2Correlation] terminal media mismatch; local circuit breaker switched to drain-only",
      );
    }
    item.auditLifecycle?.("correlation_terminal_audit", {
      strong: attempt.strong,
      providerMediaCount: attempt.mediaIds.length,
      matchedMediaCount: matched,
      completedOutputCount: completedOutputs.length,
      completedOutputMatches,
      terminalCorrelationSafe: safe,
    });
    return { safe, matched, expected: attempt.mediaIds.length };
  }
  getStopResetContext(item) {
    const attempt = this._attempts.get(item?.attemptId || item?.id);
    if (item?._flowCorrelationNeedsReset === true)
      return item._flowCorrelationTarget || null;
    if (
      attempt &&
      item?._phaseR?.dispatched === true &&
      attempt.requestBound !== true
    ) {
      return attempt.targetContext || null;
    }
    return null;
  }
  async disarm(item, terminalState = null, options = {}) {
    const attemptId = item?.attemptId || item?.id;
    if (!attemptId) return;
    const attempt = this._attempts.get(attemptId);
    if (
      attempt &&
      terminalState &&
      this._protocol().canTransition(attempt.state, terminalState)
    ) {
      attempt.state = terminalState;
    }
    const retired = {
      operationIds: [
        ...new Set([
          ...(attempt?.operationIds || []),
          ...(attempt?.receipts || []).flatMap(
            (receipt) => receipt.operationIds || [],
          ),
        ]),
      ],
      mediaIds: [
        ...new Set([
          ...(attempt?.mediaIds || []),
          ...(attempt?.receipts || []).flatMap(
            (receipt) => receipt.mediaIds || [],
          ),
        ]),
      ],
      requestBound: attempt?.requestBound === true,
      state: attempt?.state || null,
      lastReceiptError: attempt?.lastReceiptError || null,
    };
    if (attempt) attempt.disarmed = true;
    this._attempts.delete(attemptId);
    if (item) item._flowPresubmitGuard = null;
    const dispatched =
      options.dispatched === false
        ? false
        : item?._phaseR
          ? item._phaseR.dispatched === true
          : true;
    if (
      attempt &&
      dispatched &&
      attempt.requestBound !== true &&
      attempt.targetContext
    ) {
      item._flowCorrelationNeedsReset = true;
      item._flowCorrelationTarget = { ...attempt.targetContext };
    }
    try {
      await window.MessageBridge.disarmFlowCorrelation(
        attemptId,
        dispatched,
        options.discardOnStop === true,
      );
    } catch (_) {}
    return retired;
  }
}
window.FlowV2CorrelationBroker = FlowV2CorrelationBroker;
window.flowV2CorrelationBroker =
  window.flowV2CorrelationBroker || new FlowV2CorrelationBroker();
