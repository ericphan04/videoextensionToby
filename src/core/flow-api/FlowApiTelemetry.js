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
  class FlowApiTelemetry {
    static _sensitiveKey(key) {
      const normalized = String(key || "")
        .replace(/[._-]/g, "")
        .toLowerCase();
      return /^(prompt|prompttext|promptcontent|rawprompt|cookie|cookies|at|fsid|csrf|anticsrf|captcha.*|token|accesstoken|refreshtoken|authorization|privateconfig.*|protocol|schema|models|runtime|statemapping|requestbody|responsebody|freq)$/.test(
        normalized,
      );
    }
    static _identifierKey(key) {
      return /^(?:item|attempt|operation|media|project|job)(?:_?id)?$/i.test(
        String(key || "").replace(/([a-z])([A-Z])/g, "$1_$2"),
      );
    }
    static _diagnosticLabelKey(key) {
      return /^(?:reason|error|error_?type|message)$/i.test(
        String(key || "").replace(/([a-z])([A-Z])/g, "$1_$2"),
      );
    }
    static _hash(value) {
      const input = `${this._salt}:${String(value)}`;
      let hash = 2166136261;
      for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619) >>> 0;
      }
      return `session:${hash.toString(16).padStart(8, "0")}`;
    }
    static _safeUrl(value) {
      try {
        const parsed = new URL(value);
        return `${parsed.origin}${parsed.pathname}`;
      } catch (_) {
        return "[redacted-url]";
      }
    }
    static sanitize(value, key = "", depth = 0) {
      if (this._sensitiveKey(key)) return "[redacted]";
      if (depth > 6) return "[max-depth]";
      if (value == null || typeof value === "boolean") return value;
      if (typeof value === "number")
        return Number.isFinite(value) ? value : "[invalid-number]";
      if (typeof value === "string") {
        if (this._identifierKey(key)) return this._hash(value);
        if (/url$/i.test(key) || /^https?:\/\//i.test(value))
          return this._safeUrl(value);
        if (
          this._diagnosticLabelKey(key) &&
          !/^[A-Za-z0-9_.:-]{1,120}$/.test(value)
        )
          return "[redacted-text]";
        return value.length > 240 ? `${value.slice(0, 240)}\u2026` : value;
      }
      if (Array.isArray(value))
        return value
          .slice(0, 50)
          .map((entry) => this.sanitize(entry, key, depth + 1));
      if (typeof value !== "object") return String(value);
      const safe = {};
      for (const [childKey, childValue] of Object.entries(value)) {
        safe[childKey] = this.sanitize(childValue, childKey, depth + 1);
      }
      return safe;
    }
    static emit(event, payload = {}, options = {}) {
      const safe = this.sanitize({ event, ...payload });
      const signature = JSON.stringify(safe);
      const dedupeKey = options.dedupeKey || `${event}:${signature}`;
      if (options.dedupe !== false) {
        if (this._seen.has(dedupeKey)) return false;
        this._seen.set(dedupeKey, Date.now());
        if (this._seen.size > 500)
          this._seen.delete(this._seen.keys().next().value);
      }
      console.log("[FlowApiTelemetry]", signature);
      const remote = this._remotePayload(safe);
      if (remote && window.UsageSync?.trackEvent) {
        try {
          window.UsageSync.trackEvent("flow_api_lifecycle", remote);
        } catch (_) {}
      }
      return true;
    }
    static _remotePayload(safe) {
      if (!this._remoteEvents.has(safe?.event)) return null;
      const mapping = {
        event: "lifecycle_event",
        itemId: "item_hash",
        attemptId: "attempt_hash",
        attempt: "attempt_hash",
        operationId: "operation_hash",
        mediaId: "media_hash",
        projectId: "project_hash",
        jobId: "job_hash",
        driver: "driver",
        pageDriver: "page_driver",
        mode: "mode",
        surface: "surface",
        mediaType: "media_type",
        stage: "stage",
        reason: "reason",
        errorCode: "error_code",
        recoveryCode: "error_code",
        errorType: "error_type",
        state: "state",
        recoveryStage: "stage",
        terminalState: "state",
        action: "action",
        trigger: "trigger",
        protocolRevision: "protocol_revision",
        durationMs: "duration_ms",
        outputCount: "output_count",
        accountedOutputs: "output_count",
        samples: "samples",
        promptIndex: "prompt_index",
        retrySubmitCount: "retry_count",
        threshold: "threshold",
        minimum: "minimum",
        windowMs: "window_ms",
        circuitOpened: "circuit_opened",
        ready: "ready",
        coalescedCallers: "coalesced_callers",
        from: "from",
        to: "to",
        expected: "expected",
        expectedOutputs: "expected",
        completed: "completed",
        completedOutputs: "completed",
        failed: "failed",
        failedOutputs: "failed",
        downloaded: "downloaded",
        downloadedOutputs: "downloaded",
        prompts: "prompts",
        tasks: "tasks",
        declaredReferenceCount: "declared_reference_count",
        resolvedReferenceCount: "resolved_reference_count",
        submittedReferenceCount: "submitted_reference_count",
        unresolvedReferenceCount: "unresolved_reference_count",
        deduplicatedReferenceCount: "deduplicated_reference_count",
        droppedByLimitCount: "dropped_by_limit_count",
        ambiguous: "ambiguous",
      };
      const result = {};
      for (const [source, target] of Object.entries(mapping)) {
        const value = safe?.[source];
        if (value == null || value === "[redacted]") continue;
        if (
          (typeof value === "string" &&
            /^[A-Za-z0-9_.:-]{1,120}$/.test(value)) ||
          typeof value === "number" ||
          typeof value === "boolean"
        ) {
          result[target] = value;
        }
      }
      return result.lifecycle_event ? result : null;
    }
  }
  __publicField(FlowApiTelemetry, "_seen", new Map());
  __publicField(
    FlowApiTelemetry,
    "_remoteEvents",
    new Set([
      "commit_boundary",
      "driver_fallback",
      "driver_selected",
      "driver_selection_failed",
      "job_admitted",
      "job_terminal",
      "media_resolved",
      "operation_state_transition",
      "poll_state_changed",
      "schema_drift",
      "session_health_changed",
      "session_reconnect_finished",
      "session_reconnect_started",
      "sse_driver_changed",
      "submit_receipt",
      "submit_started",
      "task_job_admitted",
      "api_recovery_required",
      "api_user_resume_requeued",
      "api_waiting_user_resume",
      "correlation_acceptance_unknown",
      "correlation_ambiguous_request",
      "correlation_armed",
      "correlation_observer_incompatible",
      "correlation_parallel_revoked",
      "correlation_poll_seen",
      "correlation_presubmit_verified",
      "correlation_request_seen",
      "correlation_response_seen",
      "correlation_result_seen",
      "correlation_terminal_audit",
      "download_transition",
      "item_terminal",
      "outputs_completed",
      "outputs_failed",
      "pending_owners_observed",
      "presubmit_stage",
      "queue_recovery_decision",
      "retry_owner_accepted",
      "retry_correlation_acceptance_unknown",
      "retry_correlation_ambiguous_request",
      "retry_correlation_armed",
      "retry_correlation_observer_incompatible",
      "retry_correlation_parallel_revoked",
      "retry_correlation_poll_seen",
      "retry_correlation_presubmit_verified",
      "retry_correlation_request_seen",
      "retry_correlation_response_seen",
      "retry_correlation_result_seen",
      "retry_correlation_terminal_audit",
    ]),
  );
  __publicField(
    FlowApiTelemetry,
    "_salt",
    (() => {
      try {
        const bytes = new Uint32Array(2);
        crypto.getRandomValues(bytes);
        return `${bytes[0].toString(16)}${bytes[1].toString(16)}`;
      } catch (_) {
        return `${Date.now()}-${Math.random()}`;
      }
    })(),
  );
  window.FlowApiTelemetry = FlowApiTelemetry;
  if (typeof globalThis !== "undefined")
    globalThis.FlowApiTelemetry = FlowApiTelemetry;
})();
