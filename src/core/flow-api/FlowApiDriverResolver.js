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
  class FlowApiDriverResolver {
    static invalidate() {
      this._healthEpoch = (this._healthEpoch || 0) + 1;
      this._healthCache.clear();
    }
    static rememberVerifiedHealth(health, options = {}) {
      if (health?.ready !== true || health?.driver !== "v2") return;
      const flowTabId = Number.isInteger(options.flowTabId)
        ? options.flowTabId
        : health.flowTabId;
      const key = `${this._surface(options.surface)}:${options.mediaType === "video" ? "video" : "image"}:${Number(options.revision || 1)}:${options.projectId || "unscoped"}:${Number.isInteger(flowTabId) && flowTabId >= 0 ? `tab:${flowTabId}` : "tab:unscoped"}`;
      this._healthCache.set(key, { ...health, at: Date.now() });
    }
    static tripV2(reason, revision = this.SUPPORTED_REVISION) {
      const key = Number(revision) || this.SUPPORTED_REVISION;
      const runtime =
        window.ProviderConfigManager?.getFlowApiV2ConfigSync?.()?.runtime || {};
      const configuredThreshold = Number(runtime.schema_drift_threshold);
      const configuredMinimum = Number(runtime.schema_drift_min_samples);
      const configuredWindow = Number(runtime.schema_drift_window_ms);
      const threshold =
        Number.isInteger(configuredThreshold) && configuredThreshold > 0
          ? Math.min(configuredThreshold, 100)
          : 1;
      const minimum =
        Number.isInteger(configuredMinimum) && configuredMinimum > 0
          ? Math.min(configuredMinimum, 100)
          : 1;
      const windowMs =
        Number.isFinite(configuredWindow) && configuredWindow >= 1e3
          ? Math.min(configuredWindow, 36e5)
          : 6e4;
      const now = Date.now();
      const samples = (this._v2CircuitSamples.get(key) || []).filter(
        (sample) => now - sample.at <= windowMs,
      );
      samples.push({ reason: reason || "V2_SAFETY_INVARIANT_FAILED", at: now });
      this._v2CircuitSamples.set(key, samples);
      const required = Math.max(threshold, minimum);
      const opened = samples.length >= required;
      if (opened)
        this._v2Circuits.set(key, {
          reason: reason || "V2_SAFETY_INVARIANT_FAILED",
          at: now,
          samples: samples.length,
          threshold,
          minimum,
          windowMs,
        });
      this.invalidate();
      window.FlowApiTelemetry?.emit?.("schema_drift", {
        driver: "v2",
        reason: reason || "V2_SAFETY_INVARIANT_FAILED",
        protocolRevision: key,
        samples: samples.length,
        threshold,
        minimum,
        windowMs,
        circuitOpened: opened,
      });
      return opened;
    }
    static resetV2Circuit(revision = null) {
      if (revision == null) {
        this._v2Circuits.clear();
        this._v2CircuitSamples.clear();
      } else {
        const key = Number(revision) || this.SUPPORTED_REVISION;
        this._v2Circuits.delete(key);
        this._v2CircuitSamples.delete(key);
      }
      this.invalidate();
    }
    static _bindInvalidation() {
      if (this._listenerBound) return;
      this._listenerBound = true;
      try {
        window.eventBus?.on?.("flow_api:driver_changed", () =>
          this.invalidate(),
        );
        window.eventBus?.on?.(
          "provider:api_config_updated",
          ({ provider, key } = {}) => {
            if (
              provider === "flow" &&
              String(key || "").startsWith("flow_api_v2_")
            )
              this.invalidate();
          },
        );
        this._flowApiEntitlement =
          window.featureGate?.canUse?.("flow_api_enabled");
        window.eventBus?.on?.(
          "featuregate:refreshed",
          ({ entitlements } = {}) => {
            const raw = entitlements?.flow_api_enabled;
            const next =
              raw == null
                ? window.featureGate?.canUse?.("flow_api_enabled")
                : [true, 1, "1", "true"].includes(raw);
            if (
              typeof next === "boolean" &&
              typeof this._flowApiEntitlement === "boolean" &&
              next !== this._flowApiEntitlement
            )
              this.invalidate();
            if (typeof next === "boolean") this._flowApiEntitlement = next;
          },
        );
      } catch (_) {}
    }
    static _stableBucket(identity, revision) {
      const text = `${String(identity || "anonymous")}:${Number(revision) || 1}`;
      let hash = 2166136261;
      for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0) % 100;
    }
    static _surface(value) {
      if (value === "task" || value === "workflow") return value;
      return "gen";
    }
    static async _systemSnapshot() {
      const system = window.SystemConfig;
      if (!system) return null;
      try {
        await system.fetch();
      } catch (_) {}
      const required = [
        "flow_api_driver",
        "flow_api_v2_enabled",
        "flow_api_v2_canary_percent",
        "flow_api_v2_surfaces",
        "flow_api_v2_media_types",
        "flow_api_auto_primary",
        "flow_api_auto_fallback",
        "flow_api_v2_config_revision",
      ];
      const raw = Object.fromEntries(
        required.map((key) => [key, system.get(key, null)]),
      );
      if (required.some((key) => raw[key] == null)) return null;
      const mode = raw.flow_api_driver;
      const canary = Number(raw.flow_api_v2_canary_percent);
      const revision = Number(raw.flow_api_v2_config_revision);
      const surfaces = system.getList("flow_api_v2_surfaces", null);
      const mediaTypes = system.getList("flow_api_v2_media_types", null);
      const primary = raw.flow_api_auto_primary;
      const fallback = raw.flow_api_auto_fallback;
      const validBooleans = [true, false, 1, 0, "1", "0"];
      if (
        !["disabled", "v1", "v2", "v2_canary", "auto"].includes(mode) ||
        !validBooleans.includes(raw.flow_api_v2_enabled) ||
        !Number.isInteger(canary) ||
        canary < 0 ||
        canary > 100 ||
        !Number.isInteger(revision) ||
        revision < 1 ||
        !Array.isArray(surfaces) ||
        surfaces.some(
          (value) => !["gen", "task", "workflow"].includes(value),
        ) ||
        !Array.isArray(mediaTypes) ||
        mediaTypes.some((value) => !["image", "video"].includes(value)) ||
        !["v1", "v2"].includes(primary) ||
        !["none", "v1", "v2"].includes(fallback)
      )
        return null;
      return {
        mode,
        enabled: system.getBool("flow_api_v2_enabled"),
        canary,
        surfaces,
        mediaTypes,
        primary,
        fallback,
        revision,
      };
    }
    static async resolve(options = {}) {
      this._bindInvalidation();
      const surface = this._surface(options.surface);
      const mediaType = options.mediaType === "video" ? "video" : "image";
      const settings = await this._systemSnapshot();
      if (!settings)
        return {
          ok: false,
          driver: "web",
          stage: "preflight",
          reason: "SYSTEM_CONFIG_MISSING",
          noFallback: true,
        };
      if (settings.mode === "disabled")
        return {
          ok: true,
          driver: "web",
          reason: "SYSTEM_DRIVER_DISABLED",
          settings,
        };
      let requested = "v1";
      let fallback = "none";
      if (settings.mode === "v2") requested = "v2";
      else if (settings.mode === "v2_canary") {
        const identity =
          options.identity ||
          window.authManager?.user?.id ||
          options.clientId ||
          "anonymous";
        requested =
          this._stableBucket(identity, settings.revision) < settings.canary
            ? "v2"
            : "v1";
        fallback = requested === "v2" ? "v1" : "none";
      } else if (settings.mode === "auto") {
        requested = settings.primary;
        fallback = settings.fallback;
      }
      const candidates = [requested];
      if (fallback !== "none" && fallback !== requested)
        candidates.push(fallback);
      if (options.pinnedDriver && !candidates.includes(options.pinnedDriver))
        return {
          ok: false,
          driver: options.pinnedDriver,
          reason: "FLOW_API_BATCH_DRIVER_CHANGED",
          settings,
          stage: "preflight",
          noFallback: true,
          noRetry: true,
        };
      if (options.pinnedDriver)
        candidates.splice(0, candidates.length, options.pinnedDriver);
      let previous = null;
      let primaryFailure = null;
      for (const driver of candidates) {
        let health;
        if (driver === "v1") {
          health = await window.FlowApiV1Driver?.checkReady?.({
            item: options.item,
            surface,
            mediaType,
          });
          health || (health = { ready: false, reason: "V1_DRIVER_MISSING" });
          if (
            (previous?.driver === "v2" || options.pinnedDriver === "v1") &&
            health.ready === true
          ) {
            let session;
            try {
              session = await window.FlowApiAdapter?.checkGenerationReady?.();
            } catch (_) {
              session = { ready: false, reason: "V1_SESSION_CHECK_FAILED" };
            }
            if (session?.ready !== true)
              return {
                ok: false,
                driver: "v2",
                mode: settings.mode,
                stage: "preflight",
                reason: "V1_CONNECTION_REQUIRED",
                settings,
                requiresV1Connection: true,
                fallbackTarget: "v1",
                noFallback: true,
                noRetry: true,
                fallbackReason: previous?.reason || null,
                v1Reason: session?.reason || "V1_SESSION_NOT_READY",
                health: previous?.health || null,
                failureDetails: [
                  previous?.reason,
                  session?.reason || "V1_SESSION_NOT_READY",
                ]
                  .filter(
                    (reason) =>
                      typeof reason === "string" &&
                      /^[A-Za-z][A-Za-z0-9_]{2,119}$/.test(reason),
                  )
                  .map((message) => ({ message, statusCode: null })),
              };
            if (
              previous?.driver === "v2" &&
              options.item &&
              options.allowV1Fallback !== true
            )
              return {
                ok: false,
                driver: "v2",
                mode: settings.mode,
                settings,
                stage: "preflight",
                reason: "V1_FALLBACK_CONFIRMATION_REQUIRED",
                requiresV1Confirmation: true,
                fallbackTarget: "v1",
                fallbackReason: previous.reason,
                noFallback: true,
                noRetry: true,
              };
          }
        } else if (driver === "v2") {
          const gateReason = !settings.enabled
            ? "V2_KILL_SWITCH_OFF"
            : !settings.surfaces.includes(surface)
              ? "V2_SURFACE_NOT_ENABLED"
              : !settings.mediaTypes.includes(mediaType)
                ? "V2_MEDIA_NOT_ENABLED"
                : settings.revision > this.SUPPORTED_REVISION
                  ? "V2_CLIENT_REVISION_UNSUPPORTED"
                  : this._v2Circuits.has(settings.revision)
                    ? "V2_CIRCUIT_OPEN"
                    : null;
          if (gateReason) health = { ready: false, reason: gateReason };
          else {
            const inputHealth =
              await window.FlowApiV2Driver?.checkInputSupported?.({
                item: options.item,
                surface,
                mediaType,
                revision: settings.revision,
              });
            if (inputHealth?.ready === false) {
              return {
                ok: false,
                driver: "v2",
                mode: settings.mode,
                settings,
                stage: "preflight",
                reason: inputHealth.reason,
                health: inputHealth,
                noFallback: true,
                noRetry: true,
              };
            } else {
              const projectId =
                options.projectId || options.item?.projectId || null;
              const flowTabId = Number.isInteger(options.flowTabId)
                ? options.flowTabId
                : options.item?.flowApiTabId;
              const healthKey = `${surface}:${mediaType}:${settings.revision}:${projectId || "unscoped"}:${Number.isInteger(flowTabId) && flowTabId >= 0 ? `tab:${flowTabId}` : "tab:unscoped"}`;
              health = this._healthCache.get(healthKey);
              if (!health || Date.now() - health.at > 15e3) {
                const epoch = this._healthEpoch || 0;
                health = await window.FlowApiV2Driver?.checkReady?.({
                  surface,
                  mediaType,
                  revision: settings.revision,
                  projectId,
                  flowTabId,
                });
                if (epoch !== (this._healthEpoch || 0)) {
                  const reloadActive =
                    window.__flowReloadSyncInProgress === true;
                  console.info(
                    "[FlowApiRouting/HealthInvalidated]",
                    JSON.stringify({
                      surface,
                      mediaType,
                      rechecking:
                        !reloadActive && options._healthEpochRecheck !== true,
                      reloadActive,
                    }),
                  );
                  if (!reloadActive && options._healthEpochRecheck !== true) {
                    return this.resolve({
                      ...options,
                      _healthEpochRecheck: true,
                    });
                  }
                  return {
                    ok: false,
                    driver: "v2",
                    mode: settings.mode,
                    stage: "preflight",
                    reason: "fresh_page_session_required",
                    settings,
                    noFallback: true,
                    health: {
                      ready: false,
                      reason: "fresh_page_session_required",
                    },
                  };
                }
                health = {
                  ...(health || { ready: false, reason: "V2_DRIVER_MISSING" }),
                  at: Date.now(),
                };
                const transientPageFailure =
                  health.ready !== true &&
                  [
                    "captcha_not_ready",
                    "V2_PAGE_COMMAND_TIMEOUT",
                    "V2_PAGE_RELOADING",
                    "V2_CONTENT_SCRIPT_RECOVERING",
                    "page_reloading",
                    "content_script_recovering",
                    "V2_PAGE_RELAY_UNAVAILABLE",
                    "fresh_page_session_required",
                    "session_refresh_timeout",
                  ].includes(health.reason);
                if (transientPageFailure) this._healthCache.delete(healthKey);
                else this._healthCache.set(healthKey, health);
                if (this._healthCache.size > 100)
                  this._healthCache.delete(
                    this._healthCache.keys().next().value,
                  );
              }
            }
          }
        } else {
          health = { ready: false, reason: "FLOW_API_DRIVER_INVALID" };
        }
        if (health.ready === true) {
          if (previous)
            window.FlowApiTelemetry?.emit?.("driver_fallback", {
              from: previous.driver,
              to: driver,
              stage: "pre_dispatch",
              reason: previous.reason,
              surface,
              mediaType,
              protocolRevision: settings.revision,
            });
          const resolved = {
            ok: true,
            driver,
            mode: settings.mode,
            settings,
            health,
            ...(previous
              ? { fallbackFrom: previous.driver, reason: previous.reason }
              : {}),
          };
          window.FlowApiTelemetry?.emit?.(
            "driver_selected",
            {
              itemId: options.item?.id || null,
              driver,
              mode: settings.mode,
              surface,
              mediaType,
              protocolRevision: settings.revision,
              from: previous?.driver || null,
              reason: previous?.reason || null,
            },
            {
              dedupeKey: `driver_selected:${options.item?.attemptId || options.item?.id || "health"}:${driver}:${surface}:${mediaType}:${settings.revision}`,
            },
          );
          return resolved;
        }
        if (health.dispatchStarted === true) {
          return {
            ok: false,
            driver,
            mode: settings.mode,
            stage: "accepted",
            reason: health.reason || "SUBMIT_AMBIGUOUS",
            settings,
            noFallback: true,
            noRetry: true,
          };
        }
        previous = {
          driver,
          reason: health.reason || `${driver.toUpperCase()}_NOT_READY`,
          health,
        };
        if (driver === requested) primaryFailure = previous;
        if (
          driver === "v2" &&
          driver === requested &&
          [
            "captcha_not_ready",
            "V2_PAGE_COMMAND_TIMEOUT",
            "V2_PAGE_RELOADING",
            "V2_CONTENT_SCRIPT_RECOVERING",
            "page_reloading",
            "content_script_recovering",
            "V2_PAGE_RELAY_UNAVAILABLE",
            "fresh_page_session_required",
            "session_refresh_timeout",
            "flow_project_tab_required",
            "csrf_missing",
            "project_mismatch",
            "login_required",
          ].includes(previous.reason)
        )
          break;
      }
      const failure = primaryFailure || previous;
      const failed = {
        ok: false,
        driver: requested,
        mode: settings.mode,
        stage: "preflight",
        reason: failure?.reason || "FLOW_API_NOT_READY",
        health: failure?.health || null,
        settings,
        ...(previous && previous.driver !== requested
          ? { fallbackFailure: previous }
          : {}),
      };
      if (requested === "v2") failed.noFallback = true;
      if (
        requested === "v2" &&
        [
          "captcha_not_ready",
          "V2_PAGE_COMMAND_TIMEOUT",
          "V2_PAGE_RELOADING",
          "V2_CONTENT_SCRIPT_RECOVERING",
          "page_reloading",
          "content_script_recovering",
          "V2_PAGE_RELAY_UNAVAILABLE",
          "fresh_page_session_required",
          "session_refresh_timeout",
          "flow_project_tab_required",
          "csrf_missing",
          "project_mismatch",
          "login_required",
        ].includes(failed.reason)
      )
        failed.noFallback = true;
      window.FlowApiTelemetry?.emit?.(
        "driver_selection_failed",
        {
          itemId: options.item?.id || null,
          driver: requested,
          mode: settings.mode,
          surface,
          mediaType,
          protocolRevision: settings.revision,
          reason: failed.reason,
          errorCode: failed.errorCode || failed.health?.errorCode || null,
          stage: "pre_dispatch",
        },
        {
          dedupeKey: `driver_failed:${options.item?.attemptId || options.item?.id || "health"}:${requested}:${surface}:${mediaType}:${settings.revision}:${failed.reason}:${failed.errorCode || failed.health?.errorCode || "none"}`,
        },
      );
      return failed;
    }
  }
  __publicField(FlowApiDriverResolver, "SUPPORTED_REVISION", 1);
  __publicField(FlowApiDriverResolver, "_healthCache", new Map());
  __publicField(FlowApiDriverResolver, "_v2Circuits", new Map());
  __publicField(FlowApiDriverResolver, "_v2CircuitSamples", new Map());
  __publicField(FlowApiDriverResolver, "_listenerBound", false);
  window.FlowApiDriverResolver = FlowApiDriverResolver;
  if (typeof globalThis !== "undefined")
    globalThis.FlowApiDriverResolver = FlowApiDriverResolver;
})();
