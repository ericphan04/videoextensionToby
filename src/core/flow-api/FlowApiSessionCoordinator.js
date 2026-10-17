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
  class FlowApiSessionCoordinator {
    static _pendingReloads(item) {
      return [...this._reloadBarriers.values()].filter((barrier) => {
        if (
          Number.isInteger(item?.flowApiTabId) &&
          Number.isInteger(barrier.flowTabId)
        ) {
          return item.flowApiTabId === barrier.flowTabId;
        }
        return (
          !item?.projectId ||
          !barrier.projectId ||
          item.projectId === barrier.projectId
        );
      });
    }
    static hasPendingReload(item) {
      return this._pendingReloads(item).length > 0;
    }
    static async waitForReload(item, abortFn = () => false) {
      while (!abortFn()) {
        const barriers = this._pendingReloads(item);
        if (!barriers.length) return true;
        await Promise.race([
          Promise.allSettled(barriers.map((barrier) => barrier.promise)),
          new Promise((resolve) => setTimeout(resolve, 100)),
        ]);
      }
      return false;
    }
    static _activeWebDispatch() {
      const queue = window.PromptQueue?._instance;
      const item = queue?._editorExecutor?._currentItem;
      const job = item ? queue?.getJob?.(item.jobId) : null;
      if (
        item &&
        (item.genMode === "web" ||
          item._forceWebChain === true ||
          job?._flowApiEngineLock === "web")
      )
        return item;
      const hasWebMonitor =
        (queue?._tileMonitor?.activeCount || 0) > 0 &&
        [...(queue?._jobs?.values?.() || [])].some(
          (activeJob) =>
            activeJob?.isActive && activeJob?._flowApiEngineLock === "web",
        );
      return hasWebMonitor ? { phase: "monitoring", genMode: "web" } : null;
    }
    static _activeApiDispatch() {
      return window.FlowApiAdapter?.hasInFlight?.() === true;
    }
    static _webDispatchHealth({ presentation = false } = {}) {
      if (presentation) {
        if (this._bridgeExplicitlyMissing === true) {
          return this._normalized(
            {
              ready: false,
              installed: false,
              retryable: true,
              reason: "BRIDGE_NOT_INSTALLED",
              detail: "bridge_explicitly_missing",
            },
            {
              driver: window.FlowApiDriverResolver?._lastSelectedDriver || "v2",
              stage: "health",
            },
          );
        }
        if (this._lastReadyHealth?.ready === true) {
          return {
            ...this._lastReadyHealth,
            detail: "health_probe_suppressed_web_active",
            activeGenerationRoute: "web",
          };
        }
        return this._normalized(
          {
            ready: false,
            installed: true,
            retryable: true,
            connecting: true,
            reason: "web_dom_dispatch_active",
            detail: "health_probe_suppressed_web_active",
          },
          {
            driver: window.FlowApiDriverResolver?._lastSelectedDriver || "v2",
            stage: "health",
          },
        );
      }
      return this._normalized(
        {
          ready: false,
          installed: true,
          retryable: true,
          reason: "web_dom_dispatch_active",
          detail: "health_probe_suppressed",
        },
        { driver: "web", stage: "health" },
      );
    }
    static _apiDispatchHealth() {
      if (this._bridgeExplicitlyMissing === true) {
        return this._normalized(
          {
            ready: false,
            installed: false,
            retryable: true,
            reason: "BRIDGE_NOT_INSTALLED",
            detail: "bridge_explicitly_missing",
          },
          {
            driver: window.FlowApiDriverResolver?._lastSelectedDriver || "v2",
            stage: "health",
          },
        );
      }
      if (this._lastReadyHealth?.ready === true) {
        return {
          ...this._lastReadyHealth,
          detail: "health_probe_suppressed_api_active",
        };
      }
      return this._normalized(
        {
          ready: true,
          installed: true,
          reason: null,
          detail: "health_probe_suppressed_api_active",
        },
        {
          driver:
            window.FlowApiV2Driver?.hasActiveMutation?.() === true
              ? "v2"
              : window.FlowApiDriverResolver?._lastSelectedDriver || "v2",
          stage: "health",
        },
      );
    }
    static _reloadSyncHealth({ presentation = false } = {}) {
      if (this._bridgeExplicitlyMissing === true) {
        return this._normalized(
          {
            ready: false,
            installed: false,
            retryable: true,
            reason: "BRIDGE_NOT_INSTALLED",
            detail: "bridge_explicitly_missing",
          },
          {
            driver: window.FlowApiDriverResolver?._lastSelectedDriver || "v2",
            stage: "health",
          },
        );
      }
      if (presentation && this._lastReadyHealth?.ready === true) {
        return {
          ...this._lastReadyHealth,
          connecting: true,
          detail: "health_probe_suppressed_reload_active",
        };
      }
      return this._normalized(
        {
          ready: false,
          installed: true,
          retryable: true,
          connecting: true,
          reason: "fresh_page_session_required",
          detail: "health_probe_suppressed_reload_active",
        },
        {
          driver: window.FlowApiDriverResolver?._lastSelectedDriver || "v2",
          stage: "health",
        },
      );
    }
    static async confirmV1Fallback() {
      const message = window.I18n?.t?.("flowV1Fallback.confirmMessage");
      if (!message || message === "flowV1Fallback.confirmMessage") return false;
      return window.customDialog?.confirm
        ? !!(await window.customDialog.confirm(message, {
            title: window.I18n.t("flowV1Fallback.title"),
            type: "warning",
            confirmText: window.I18n.t("flowV1Fallback.useV1"),
          }))
        : !!window.confirm?.(message);
    }
    static async requestV1Connection() {
      if (this._v1ConnectionDialog) return this._v1ConnectionDialog;
      const text = (key, fallback) => {
        const value = window.I18n?.t?.(key);
        return value && value !== key ? value : fallback;
      };
      this._v1ConnectionDialog = (async () => {
        const message = text(
          "flowV1Fallback.message",
          "Flow API V2 is unavailable. Before switching to V1, open Settings and sign in to Flow Labs. Generation has not been sent.",
        );
        const confirmed = window.customDialog?.confirm
          ? await window.customDialog.confirm(message, {
              title: text("flowV1Fallback.title", "Connect Flow API V1"),
              type: "warning",
              confirmText: text("flowV1Fallback.openSettings", "Open Settings"),
            })
          : window.confirm?.(message);
        if (confirmed)
          await chrome.runtime.sendMessage({ action: "openSettings" });
        return false;
      })();
      try {
        return await this._v1ConnectionDialog;
      } finally {
        this._v1ConnectionDialog = null;
      }
    }
    static invalidate(options = {}) {
      this._healthEpoch = (this._healthEpoch || 0) + 1;
      this._healthFlights?.clear();
      this._healthCache.clear();
      window.FlowApiDriverResolver?.invalidate?.();
      if (options.preserveBridge !== true) window.BridgeClient?.invalidate?.();
    }
    static _storageFieldsChanged(change, keys) {
      if (!change) return false;
      const before = change.oldValue || {};
      const after = change.newValue || {};
      if (
        keys.includes("apiModeEnabled") &&
        keys.includes("defaultGenMode") &&
        keys.includes("gen_mode")
      ) {
        const normalizedBool = (value) =>
          value == null ? null : [true, 1, "1", "true"].includes(value);
        const route = (value) => ({
          api: normalizedBool(value.apiModeEnabled),
          mode: value.defaultGenMode ?? value.gen_mode ?? null,
        });
        return JSON.stringify(route(before)) !== JSON.stringify(route(after));
      }
      return keys.some(
        (key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]),
      );
    }
    static _isFlowUrl(url) {
      return /^https:\/\/flow\.google\.com\//i.test(String(url || ""));
    }
    static _flowSessionUrlKey(url) {
      if (!this._isFlowUrl(url)) return null;
      try {
        const parsed = new URL(url);
        const project = parsed.pathname.match(/\/project\/([^/]+)/i)?.[1];
        return project
          ? `project:${project}`
          : `path:${parsed.pathname.replace(/\/+$/, "") || "/"}`;
      } catch (_) {
        return String(url).split(/[?#]/, 1)[0];
      }
    }
    static _bindInvalidation() {
      if (this._bound) return;
      this._bound = true;
      const invalidate = () => this.invalidate();
      for (const event of [
        "flow_api:driver_changed",
        "flow_api:auth_invalid",
        "auth:login",
        "auth:logout",
        "entitlements:changed",
      ]) {
        try {
          window.eventBus?.on?.(event, invalidate);
        } catch (_) {}
      }
      try {
        window.eventBus?.on?.(
          "provider:api_config_updated",
          ({ provider, key } = {}) => {
            if (
              provider === "flow" &&
              String(key || "").startsWith("flow_api_v2_")
            )
              invalidate();
          },
        );
      } catch (_) {}
      this._privateConfigFingerprint = JSON.stringify(
        window.ProviderConfigManager?.getFlowApiV2ConfigSync?.() || null,
      );
      try {
        window.eventBus?.on?.("provider:private_configs_loaded", () => {
          const next = JSON.stringify(
            window.ProviderConfigManager?.getFlowApiV2ConfigSync?.() || null,
          );
          if (next !== this._privateConfigFingerprint) invalidate();
          this._privateConfigFingerprint = next;
        });
      } catch (_) {}
      try {
        window.eventBus?.on?.("bridge:changed", ({ installed } = {}) => {
          this._bridgeExplicitlyMissing = installed === false;
          if (installed === false) this._lastReadyHealth = null;
          this.invalidate({ preserveBridge: true });
        });
      } catch (_) {}
      this._flowApiEntitlement =
        window.featureGate?.canUse?.("flow_api_enabled");
      try {
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
              invalidate();
            if (typeof next === "boolean") this._flowApiEntitlement = next;
          },
        );
      } catch (_) {}
      try {
        chrome.storage?.onChanged?.addListener?.((changes, area) => {
          if (area !== "local") return;
          const routingSettingsChanged = this._storageFieldsChanged(
            changes.af_settings,
            ["apiModeEnabled", "defaultGenMode", "gen_mode"],
          );
          const privateConfigChanged =
            changes.toby_flow_api_v2_private_configs &&
            JSON.stringify(
              changes.toby_flow_api_v2_private_configs.oldValue || null,
            ) !==
              JSON.stringify(
                changes.toby_flow_api_v2_private_configs.newValue || null,
              );
          if (routingSettingsChanged || privateConfigChanged) invalidate();
        });
      } catch (_) {}
      try {
        chrome.tabs?.onCreated?.addListener?.((tab) => {
          const url = tab?.url || tab?.pendingUrl;
          if (!this._isFlowUrl(url)) return;
          this._flowTabIds.add(tab.id);
          this._flowTabUrls.set(tab.id, url);
          if (tab?.status !== "complete") this._flowLoadingTabIds.add(tab.id);
          invalidate();
        });
        chrome.tabs?.onUpdated?.addListener?.((tabId, change, tab) => {
          const wasFlow = this._flowTabIds.has(tabId);
          const previousUrl = this._flowTabUrls.get(tabId) || "";
          const nextUrl =
            change?.url || tab?.url || tab?.pendingUrl || previousUrl;
          const isFlow = this._isFlowUrl(nextUrl);
          if (isFlow) {
            this._flowTabIds.add(tabId);
            this._flowTabUrls.set(tabId, nextUrl);
          } else if (change?.url) {
            this._flowTabIds.delete(tabId);
            this._flowTabUrls.delete(tabId);
          }
          const sessionBoundaryChanged =
            !!change?.url &&
            this._flowSessionUrlKey(previousUrl) !==
              this._flowSessionUrlKey(nextUrl);
          const startsFlowLoad =
            (wasFlow || isFlow) &&
            (sessionBoundaryChanged || change?.status === "loading");
          if (startsFlowLoad && !this._flowLoadingTabIds.has(tabId)) {
            this._flowLoadingTabIds.add(tabId);
            invalidate();
          }
          if (change?.status === "complete")
            this._flowLoadingTabIds.delete(tabId);
        });
        chrome.tabs?.onRemoved?.addListener?.((tabId) => {
          this._flowLoadingTabIds.delete(tabId);
          this._flowTabUrls.delete(tabId);
          if (!this._flowTabIds.delete(tabId)) return;
          invalidate();
        });
        chrome.tabs?.query?.({ url: "https://flow.google.com/*" }, (tabs) => {
          for (const tab of tabs || [])
            if (Number.isInteger(tab?.id)) {
              this._flowTabIds.add(tab.id);
              if (tab.url || tab.pendingUrl)
                this._flowTabUrls.set(tab.id, tab.url || tab.pendingUrl);
            }
        });
      } catch (_) {}
    }
    static _surface(value) {
      if (value === "task" || value === "workflow") return value;
      return "gen";
    }
    static _mediaType(value, item) {
      if (value === "video" || /video/i.test(item?.settings?.genType || ""))
        return "video";
      return "image";
    }
    static canRecoverV2Reason(reason) {
      return [
        "V2_PAGE_RELAY_UNAVAILABLE",
        "V2_PAGE_COMMAND_TIMEOUT",
        "V2_PAGE_RELOADING",
        "V2_CONTENT_SCRIPT_RECOVERING",
        "page_reloading",
        "content_script_recovering",
        "fresh_page_session_required",
        "captcha_not_ready",
        "session_refresh_timeout",
        "flow_project_tab_required",
        "project_mismatch",
        "csrf_missing",
        "login_required",
      ].includes(reason);
    }
    static canAutoReconnectReason(reason) {
      const normalized = this._normalized({ ready: false, reason }).reason;
      return [
        "fresh_page_session_required",
        "session_refresh_timeout",
        "flow_project_tab_required",
        "project_mismatch",
        "csrf_missing",
        "login_required",
      ].includes(normalized);
    }
    static async checkWithReconnect(options = {}) {
      let health = await this.check({
        ...options,
        force: options.force !== false,
        passive: true,
      });
      if (window.__flowReloadSyncInProgress === true) return health;
      if (
        health?.ready === true ||
        !this.canAutoReconnectReason(health?.reason)
      )
        return health;
      health = await this.reconnect({
        ...options,
        force: true,
        passive: true,
        recoveryAuthorized: true,
        trigger: options.trigger || "preflight",
      });
      if (health?.ready === true) return health;
      return this.check({ ...options, force: false, passive: true });
    }
    static _emitHealthTransition(key, result, context) {
      try {
        const write = chrome.storage?.local?.set?.({
          [`toby_flow_api_health_${context.surface}_${context.mediaType}`]: {
            at: Date.now(),
            ready: result?.ready === true,
            driver: result?.driver || context.driver,
            fallbackFrom: result?.fallbackFrom || null,
            reason: result?.reason || null,
            connecting: result?.connecting === true,
          },
        });
        write?.catch?.(() => {});
      } catch (_) {}
      const signature = JSON.stringify({
        ready: result?.ready === true,
        driver: result?.driver || null,
        reason: result?.reason || null,
        errorCode: result?.errorCode || null,
        stage: result?.stage || null,
      });
      if (this._healthTelemetry.get(key) === signature) return;
      this._healthTelemetry.set(key, signature);
      if (this._healthTelemetry.size > 100)
        this._healthTelemetry.delete(this._healthTelemetry.keys().next().value);
      window.FlowApiTelemetry?.emit?.(
        "session_health_changed",
        {
          driver: result?.driver || context.driver,
          surface: context.surface,
          mediaType: context.mediaType,
          protocolRevision: context.revision,
          ready: result?.ready === true,
          state: result?.ready === true ? "ready" : "not_ready",
          reason: result?.reason || null,
          errorCode: result?.errorCode || null,
          stage: result?.stage || "health",
        },
        { dedupeKey: `session_health:${key}:${signature}` },
      );
    }
    static _normalized(value = {}, fallback = {}) {
      const rawReason = value.reason || value.error || fallback.reason || null;
      const reason =
        {
          BRIDGE_NOT_INSTALLED: "bridge_not_installed",
          not_installed: "bridge_not_installed",
          no_client: "bridge_not_installed",
          V2_BRIDGE_VERSION_UNSUPPORTED: "bridge_outdated",
          V2_PRIVATE_CONFIG_MANAGER_MISSING: "protocol_config_missing",
          V2_PRIVATE_CONFIG_MISSING: "protocol_config_missing",
          V2_RPC_CONFIG_INVALID: "protocol_config_missing",
          SYSTEM_CONFIG_MISSING: "protocol_config_missing",
          V2_PROTOCOL_REVISION_MISMATCH: "build_drift",
          V2_STATE_MAPPING_UNVERIFIED: "build_drift",
          PROTOCOL_REVISION_UNSUPPORTED: "build_drift",
          PROTOCOL_FINGERPRINT_MISMATCH: "build_drift",
          PROTOCOL_CONFIG_INVALID: "build_drift",
          protocol_config_invalid: "build_drift",
          INVALID_V2_COMMAND: "build_drift",
          origin_mismatch: "build_drift",
          V2_PAGE_RELAY_UNAVAILABLE: "fresh_page_session_required",
          V2_PAGE_COMMAND_TIMEOUT: "session_refresh_timeout",
          BRIDGE_REQUEST_TIMEOUT: "session_refresh_timeout",
          V2_PAGE_RELOADING: "page_reloading",
          V2_CONTENT_SCRIPT_RECOVERING: "content_script_recovering",
          BRIDGE_CHANNEL_CLOSED: "session_refresh_timeout",
          captcha_not_ready: "fresh_page_session_required",
          CAPTCHA_FAILED: "fresh_page_session_required",
          CAPTCHA_CONFIG_INVALID: "protocol_config_missing",
        }[rawReason] || rawReason;
      const action =
        {
          bridge_not_installed: "install_bridge",
          bridge_outdated: "update_bridge",
          flow_project_tab_required: "open_flow_project",
          project_mismatch: "open_correct_project",
          login_required: "sign_in_flow",
          csrf_missing: "retry_session",
          fresh_page_session_required: "retry_session",
          session_refresh_timeout: "retry_session",
          page_reloading: "wait",
          content_script_recovering: "wait",
          build_drift: "update_tobyflow",
          protocol_config_missing: "contact_support",
          capability_missing: "update_bridge",
        }[reason] || (value.ready === true ? null : "retry");
      const messageKey =
        {
          bridge_not_installed: "settings.bridgeNeedInstall",
          bridge_outdated: "settings.bridgeOutdated",
          capability_missing: "settings.bridgeOutdated",
          flow_project_tab_required: "settings.bridgeFlowTabRequired",
          project_mismatch: "errors.flowErr_project_mismatch",
          login_required: "settings.bridgeSignInRequired",
          csrf_missing: "settings.bridgeSignInRequired",
          fresh_page_session_required: "settings.bridgeSignInRequired",
          session_refresh_timeout: "settings.flowApiV2SessionTimeout",
          build_drift: "settings.flowApiV2BuildDrift",
          page_reloading: "common.refreshingFlow",
          content_script_recovering: "settings.flowApiContentRecovering",
          protocol_config_missing: "settings.flowApiV2BuildDrift",
        }[reason] || null;
      return {
        ready: value.ready === true,
        connecting:
          value.ready !== true &&
          (value.recoveryStarted === true ||
            ["page_reloading", "content_script_recovering"].includes(reason) ||
            (window.__flowReloadSyncInProgress === true &&
              [
                "fresh_page_session_required",
                "captcha_not_ready",
                "V2_PAGE_RELAY_UNAVAILABLE",
                "session_refresh_timeout",
                "page_reloading",
                "content_script_recovering",
              ].includes(reason))),
        driver:
          value.driver === "web" || fallback.driver === "web"
            ? "web"
            : value.driver === "v2" || fallback.driver === "v2"
              ? "v2"
              : "v1",
        reason,
        errorCode: rawReason,
        recoveryStarted: value.recoveryStarted === true,
        requiresV1Connection: value.requiresV1Connection === true,
        fallbackTarget: value.fallbackTarget || null,
        v1Reason: value.v1Reason || null,
        userActionRequired:
          value.requiresV1Connection === true ||
          value.userActionRequired === true ||
          [
            "bridge_not_installed",
            "bridge_outdated",
            "flow_project_tab_required",
            "project_mismatch",
            "login_required",
            "csrf_missing",
            "fresh_page_session_required",
            "session_refresh_timeout",
            "build_drift",
            "protocol_config_missing",
            "capability_missing",
            "no_flow_tab",
            "no_token",
          ].includes(reason),
        stage: value.stage || fallback.stage || "health",
        retryable:
          value.retryable !== false &&
          ![
            "bridge_outdated",
            "build_drift",
            "protocol_config_missing",
            "capability_missing",
            "V2_ENTITLEMENT_MISSING",
            "V2_CLIENT_REVISION_UNSUPPORTED",
            "V2_CIRCUIT_OPEN",
          ].includes(reason),
        mode: value.mode || fallback.mode || null,
        fallbackFrom: value.fallbackFrom || fallback.fallbackFrom || null,
        fallbackReason: value.fallbackReason || fallback.fallbackReason || null,
        revision: Number(value.protocolRevision || fallback.revision || 1),
        installed: value.installed !== false,
        detail: value.detail || null,
        projectId: value.projectId || fallback.projectId || null,
        flowTabId: Number.isInteger(value.flowTabId)
          ? value.flowTabId
          : Number.isInteger(fallback.flowTabId)
            ? fallback.flowTabId
            : null,
        pagePreserved: value.pagePreserved === true,
        reloadIssued: value.reloadIssued === true,
        documentChanged: value.documentChanged === true,
        action,
        messageKey,
      };
    }
    static async _scopeUiTarget(options = {}) {
      const itemTabId = options.item?.flowApiTabId;
      const flowTabId = Number.isInteger(options.flowTabId)
        ? options.flowTabId
        : itemTabId;
      if (
        options.projectId ||
        options.item?.projectId ||
        (Number.isInteger(flowTabId) && flowTabId >= 0)
      )
        return options;
      try {
        const target = await window.MessageBridge?.getTargetContext?.();
        if (
          target?.projectId &&
          Number.isInteger(target.tabId) &&
          target.tabId >= 0
        ) {
          const signature = `${target.projectId}:${target.tabId}`;
          if (this._lastUiTargetScopeSignature !== signature) {
            this._lastUiTargetScopeSignature = signature;
            console.info(
              "[FlowApiTargetScope] resolved",
              JSON.stringify({
                projectId: target.projectId,
                flowTabId: target.tabId,
                source: "targetFlowContext",
              }),
            );
          }
          return {
            ...options,
            projectId: target.projectId,
            flowTabId: target.tabId,
          };
        }
      } catch (_) {}
      return options;
    }
    static async _selection(options) {
      if (options.driver === "v1" || options.driver === "v2") {
        return {
          ok: true,
          driver: options.driver,
          mode: options.mode || null,
          settings: {
            revision: Number(
              options.revision || options.item?.flowApiProtocolRevision || 1,
            ),
          },
        };
      }
      return (
        window.FlowApiDriverResolver?.resolve?.({
          surface: this._surface(options.surface),
          mediaType: this._mediaType(options.mediaType, options.item),
          item: options.item || null,
          projectId: options.projectId || options.item?.projectId || null,
          flowTabId: Number.isInteger(options.flowTabId)
            ? options.flowTabId
            : options.item?.flowApiTabId,
          identity: window.authManager?.user?.id || options.clientId || null,
        }) || {
          ok: false,
          driver: "web",
          stage: "preflight",
          reason: "FLOW_API_RESOLVER_MISSING",
          noFallback: true,
        }
      );
    }
    static async check(options = {}) {
      this._bindInvalidation();
      if (!options.item && window.__flowReloadSyncInProgress === true) {
        return this._reloadSyncHealth({
          presentation: options.passive === true,
        });
      }
      if (!options.item && this._activeWebDispatch()) {
        return this._webDispatchHealth({
          presentation: options.passive === true,
        });
      }
      if (
        !options.item &&
        options.passive === true &&
        this._activeApiDispatch()
      ) {
        return this._apiDispatchHealth();
      }
      options = await this._scopeUiTarget(options);
      this._healthFlights || (this._healthFlights = new Map());
      const key = JSON.stringify([
        options.driver || "effective",
        this._surface(options.surface),
        this._mediaType(options.mediaType, options.item),
        options.projectId || options.item?.projectId || null,
        Number.isInteger(options.flowTabId)
          ? options.flowTabId
          : options.item?.flowApiTabId || null,
        options.revision || options.item?.flowApiProtocolRevision || null,
        options.passive === true,
        options.force === true,
        options.clientId || null,
      ]);
      if (options.item) return this._checkNow(options);
      if (this._healthFlights.has(key)) return this._healthFlights.get(key);
      const flight = this._checkNow(options);
      this._healthFlights.set(key, flight);
      try {
        return await flight;
      } finally {
        if (this._healthFlights.get(key) === flight)
          this._healthFlights.delete(key);
      }
    }
    static async _checkNow(options = {}) {
      this._bindInvalidation();
      if (options.force === true) this.invalidate();
      const epoch = this._healthEpoch || 0;
      const surface = this._surface(options.surface);
      const mediaType = this._mediaType(options.mediaType, options.item);
      const selection = await this._selection({
        ...options,
        surface,
        mediaType,
      });
      if (!options.item && window.__flowReloadSyncInProgress === true) {
        return this._reloadSyncHealth({
          presentation: options.passive === true,
        });
      }
      if (selection?.driver === "web") {
        const result2 = this._normalized(
          {
            ready: false,
            installed: true,
            reason: selection.reason || "SYSTEM_DRIVER_DISABLED",
            mode: selection.mode || selection.settings?.mode || "disabled",
          },
          { driver: "web", stage: selection.stage || "preflight" },
        );
        const key2 = `web:${surface}:${mediaType}:0`;
        this._emitHealthTransition(key2, result2, {
          driver: "web",
          surface,
          mediaType,
          revision: 0,
        });
        return result2;
      }
      const driver = selection?.driver === "v2" ? "v2" : "v1";
      const revision = Number(
        selection?.settings?.revision ||
          options.revision ||
          options.item?.flowApiProtocolRevision ||
          1,
      );
      const projectId = options.projectId || options.item?.projectId || null;
      const flowTabId = Number.isInteger(options.flowTabId)
        ? options.flowTabId
        : options.item?.flowApiTabId;
      const key = `${driver}:${surface}:${mediaType}:${revision}:${projectId || "unscoped"}:${Number.isInteger(flowTabId) && flowTabId >= 0 ? `tab:${flowTabId}` : "tab:unscoped"}:${options.passive === true ? "ui" : "generation"}`;
      const cached = this._healthCache.get(key);
      if (
        selection?.ok === true &&
        !options.force &&
        cached &&
        Date.now() - cached.at < this.HEALTH_TTL_MS
      )
        return cached.value;
      let result;
      if (selection?.ok !== true) {
        result = this._normalized(
          { ...selection, ...(selection.health || {}) },
          { driver, revision, stage: selection?.stage || "preflight" },
        );
      } else if (driver === "v2") {
        const health =
          selection.health?.ready === true
            ? selection.health
            : await window.FlowApiV2Driver?.checkReady?.({
                surface,
                mediaType,
                revision,
                projectId,
                flowTabId,
              });
        result = this._normalized(
          health || { ready: false, reason: "V2_DRIVER_MISSING" },
          {
            driver,
            revision,
            mode: selection.mode,
            fallbackFrom: selection.fallbackFrom,
            fallbackReason: selection.reason,
          },
        );
      } else {
        const health =
          options.passive === true
            ? await window.FlowApiAdapter?.checkBridgeUiReady?.()
            : await window.FlowApiAdapter?.checkGenerationReady?.();
        result = this._normalized(
          health || { ready: false, reason: "V1_ADAPTER_MISSING" },
          {
            driver,
            revision,
            mode: selection.mode,
            fallbackFrom: selection.fallbackFrom,
            fallbackReason: selection.reason,
          },
        );
      }
      if (epoch !== (this._healthEpoch || 0))
        return this._normalized(
          {
            ready: false,
            reason: "fresh_page_session_required",
            retryable: true,
          },
          { driver, projectId },
        );
      if (driver === "v2" && result.ready !== true)
        this._healthCache.delete(key);
      else this._healthCache.set(key, { at: Date.now(), value: result });
      if (result.ready === true) this._lastReadyHealth = result;
      if (this._healthCache.size > 100)
        this._healthCache.delete(this._healthCache.keys().next().value);
      this._emitHealthTransition(key, result, {
        driver,
        surface,
        mediaType,
        revision,
      });
      return result;
    }
    static async checkScopes(options = {}) {
      options = await this._scopeUiTarget(options);
      const scopes =
        Array.isArray(options.surfaces) && options.surfaces.length
          ? [...new Set(options.surfaces.map((value) => this._surface(value)))]
          : ["gen"];
      const mediaTypes =
        Array.isArray(options.mediaTypes) && options.mediaTypes.length
          ? [
              ...new Set(
                options.mediaTypes.map((value) => this._mediaType(value)),
              ),
            ]
          : ["image"];
      if (options.force === true) this.invalidate();
      const results = await Promise.all(
        scopes.flatMap((surface) =>
          mediaTypes.map(async (mediaType) => ({
            surface,
            mediaType,
            health: await this.check({
              ...options,
              force: false,
              surface,
              mediaType,
            }),
          })),
        ),
      );
      const drivers = [
        ...new Set(
          results.map((entry) => entry.health?.driver).filter(Boolean),
        ),
      ];
      const fallbackFrom = [
        ...new Set(
          results.map((entry) => entry.health?.fallbackFrom).filter(Boolean),
        ),
      ];
      const firstFailure =
        results.find((entry) => entry.health?.ready !== true)?.health || null;
      const aggregate = this._normalized(
        {
          ready:
            results.length > 0 &&
            results.every((entry) => entry.health?.ready === true),
          driver:
            drivers.length === 1
              ? drivers[0]
              : firstFailure?.driver || drivers[0] || "web",
          reason: firstFailure?.reason || null,
          fallbackFrom: fallbackFrom.length === 1 ? fallbackFrom[0] : null,
          fallbackReason:
            results.find((entry) => entry.health?.fallbackReason)?.health
              .fallbackReason || null,
          installed: results.every(
            (entry) => entry.health?.installed !== false,
          ),
          detail: drivers.length > 1 ? "mixed_effective_drivers" : null,
        },
        { driver: drivers[0] || "web", stage: "health" },
      );
      return { ...aggregate, scopes: results };
    }
    static async reconnect(options = {}) {
      this._bindInvalidation();
      if (
        options.userInitiated !== true &&
        !options.item &&
        this._activeWebDispatch()
      ) {
        return this._webDispatchHealth();
      }
      options = await this._scopeUiTarget(options);
      const surface = this._surface(options.surface);
      const mediaType = this._mediaType(options.mediaType, options.item);
      const projectId = options.projectId || options.item?.projectId || null;
      const requestedFlowTabId = Number.isInteger(options.flowTabId)
        ? options.flowTabId
        : options.item?.flowApiTabId;
      const acceptedOperationInFlight =
        window.PromptQueue?._instance?.hasAcceptedV2Operation?.({
          projectId,
          flowTabId: requestedFlowTabId,
        }) === true;
      if (acceptedOperationInFlight && options.preservePage !== true) {
        options = { ...options, preservePage: true };
        console.info(
          "[FlowApiReconnect] preserving page for accepted V2 operation",
          JSON.stringify({
            surface,
            mediaType,
            hasProject: !!projectId,
            flowTabPinned: Number.isInteger(requestedFlowTabId),
          }),
        );
      }
      const baseKey = `${options.driver || "effective"}:${surface}:${mediaType}:${projectId || "unscoped"}:${Number.isInteger(requestedFlowTabId) && requestedFlowTabId >= 0 ? `tab:${requestedFlowTabId}` : "tab:unscoped"}`;
      const reconnectMode =
        options.preservePage === true
          ? "accepted-read"
          : options.forcePageReload === true
            ? `forced:${String(options.recoveryReason || "forced")}`
            : "standard";
      const key = `${baseKey}:${reconnectMode}`;
      if (this._reconnects.has(key)) {
        this._reconnectCallers.set(
          key,
          (this._reconnectCallers.get(key) || 1) + 1,
        );
        return this._reconnects.get(key);
      }
      const last = this._cooldowns.get(key) || 0;
      if (!options.force && Date.now() - last < this.RECONNECT_COOLDOWN_MS) {
        return this.check({
          ...options,
          surface,
          mediaType,
          force: false,
          passive: true,
        });
      }
      this._cooldowns.set(key, Date.now());
      this._reconnectCallers.set(key, 1);
      const reconnectStartedAt = Date.now();
      window.FlowApiTelemetry?.emit?.(
        "session_reconnect_started",
        {
          driver: options.driver || "effective",
          surface,
          mediaType,
          projectId,
          trigger:
            options.trigger ||
            (options.userInitiated === true ? "manual" : "queue"),
        },
        { dedupeKey: `reconnect_start:${key}:${reconnectStartedAt}` },
      );
      const promise = (async () => {
        let selection = await this._selection({
          ...options,
          surface,
          mediaType,
        });
        if (selection?.requiresV1Connection === true) {
          if (options.userInitiated === true) await this.requestV1Connection();
          return this._normalized(selection, {
            driver: "v2",
            stage: "preflight",
          });
        }
        if (
          !options.driver &&
          selection?.fallbackFrom === "v2" &&
          this.canRecoverV2Reason(selection.reason)
        ) {
          selection = { ...selection, driver: "v2", ok: true };
        }
        if (selection?.driver === "web") {
          return this._normalized(
            {
              ready: false,
              installed: true,
              reason: selection.reason || "SYSTEM_DRIVER_DISABLED",
            },
            { driver: "web", stage: selection.stage || "preflight" },
          );
        }
        const driver = selection?.driver === "v2" ? "v2" : "v1";
        if (selection?.ok !== true) {
          const blocked = this._normalized(
            { ...selection, ...(selection.health || {}) },
            {
              driver,
              revision: selection?.settings?.revision,
              projectId,
              stage: selection?.stage || "preflight",
            },
          );
          const reconnectable = new Set([
            "no_token",
            "token_expired",
            "login_required",
            "csrf_missing",
            "fresh_page_session_required",
            "session_refresh_timeout",
            "flow_project_tab_required",
            "project_mismatch",
          ]);
          if (!reconnectable.has(String(blocked.reason || "").toLowerCase()))
            return blocked;
        }
        let result;
        if (driver === "v1") {
          result =
            options.userInitiated === true
              ? await window.FlowApiAdapter?.refreshBridgeConnection?.()
              : await window.FlowApiAdapter?.checkBridgeUiReady?.();
        } else {
          if (options.preservePage !== true)
            this._reloadBarriers.set(key, {
              projectId,
              flowTabId: requestedFlowTabId,
              promise,
            });
          const bridge =
            typeof window.BridgeClient?.ping === "function"
              ? await window.BridgeClient.ping()
              : null;
          if (bridge && bridge.installed !== true) {
            const transient = [
              "BRIDGE_REQUEST_TIMEOUT",
              "BRIDGE_CHANNEL_CLOSED",
              "EMPTY_RESPONSE",
            ].includes(String(bridge.error || ""));
            return this._normalized(
              {
                ready: false,
                installed: transient,
                reason: transient
                  ? bridge.error
                  : bridge.error || "BRIDGE_NOT_INSTALLED",
                retryable: transient,
              },
              { driver, revision: selection?.settings?.revision, projectId },
            );
          }
          const requiredCapability =
            options.preservePage === true
              ? "flow_v2_preserve_page_reconnect"
              : options.forcePageReload === true
                ? "flow_v2_unusual_reload"
                : "flow_v2_reconnect";
          const supported = bridge
            ? Array.isArray(bridge.capabilities) &&
              bridge.capabilities.includes(requiredCapability)
            : await window.BridgeClient?.hasCapability?.(requiredCapability);
          if (!supported)
            return this._normalized(
              {
                ready: false,
                installed: true,
                reason: "capability_missing",
                userActionRequired: true,
                retryable: false,
              },
              { driver, revision: selection?.settings?.revision, projectId },
            );
          const config =
            await window.ProviderConfigManager?.fetchFlowApiV2Configs?.();
          if (!config)
            return this._normalized(
              {
                ready: false,
                reason: "protocol_config_missing",
                userActionRequired: true,
                retryable: false,
              },
              { driver, projectId },
            );
          const flowTabId = requestedFlowTabId;
          if (
            options.preservePage !== true &&
            window.PromptQueue?._instance?.hasAcceptedV2Operation?.({
              projectId,
              flowTabId,
            }) === true
          ) {
            options = { ...options, preservePage: true };
            const preservationSupported = bridge
              ? Array.isArray(bridge.capabilities) &&
                bridge.capabilities.includes("flow_v2_preserve_page_reconnect")
              : await window.BridgeClient?.hasCapability?.(
                  "flow_v2_preserve_page_reconnect",
                );
            if (!preservationSupported)
              return this._normalized(
                {
                  ready: false,
                  installed: true,
                  reason: "capability_missing",
                  userActionRequired: true,
                  retryable: false,
                },
                { driver, revision: selection?.settings?.revision, projectId },
              );
            console.info(
              "[FlowApiReconnect] late accepted V2 operation \u2014 preserving page",
            );
          }
          result = await window.BridgeClient.request("flow_v2_reconnect", {
            projectId,
            userInitiated: options.userInitiated === true,
            ...(Number.isInteger(flowTabId) && flowTabId >= 0
              ? { flowTabId }
              : {}),
            recoveryAuthorized: options.recoveryAuthorized === true,
            forcePageReload: options.forcePageReload === true,
            preservePage: options.preservePage === true,
            recoveryReason: options.recoveryReason || null,
            allowFocus: options.userInitiated === true,
            protocol: config.protocol,
            models: config.models,
            schema: config.schema,
            stateMapping: config.state_mapping,
            protocolRevision: Number(config.protocol?.schema_version || 0),
            protocolFingerprint:
              window.FlowApiV2CheckpointStore?.fingerprint?.(config) || null,
            runtime: config.runtime,
          });
        }
        this.invalidate();
        if (result?.ready === true) {
          const revision = Number(selection?.settings?.revision || 1);
          const verified = this._normalized(result, {
            driver,
            projectId,
            flowTabId: requestedFlowTabId,
            revision,
          });
          const verifiedTabId = Number.isInteger(verified.flowTabId)
            ? verified.flowTabId
            : requestedFlowTabId;
          window.FlowApiDriverResolver?.rememberVerifiedHealth?.(verified, {
            surface,
            mediaType,
            revision,
            projectId,
            flowTabId: verifiedTabId,
          });
          const healthKey = `${driver}:${surface}:${mediaType}:${revision}:${projectId || "unscoped"}:${Number.isInteger(verifiedTabId) && verifiedTabId >= 0 ? `tab:${verifiedTabId}` : "tab:unscoped"}:ui`;
          this._healthCache.set(healthKey, { at: Date.now(), value: verified });
          this._emitHealthTransition(healthKey, verified, {
            driver,
            surface,
            mediaType,
            revision,
          });
          return verified;
        }
        const checked =
          result?.recoveryStarted === true
            ? await this.check({
                ...options,
                driver,
                surface,
                mediaType,
                force: true,
                passive: true,
              })
            : null;
        return this._normalized(checked?.ready ? checked : result, {
          driver,
          projectId,
          revision: selection?.settings?.revision,
        });
      })()
        .then((result) => {
          window.FlowApiTelemetry?.emit?.(
            "session_reconnect_finished",
            {
              driver: result?.driver || options.driver || "effective",
              surface,
              mediaType,
              projectId,
              trigger:
                options.trigger ||
                (options.userInitiated === true ? "manual" : "queue"),
              durationMs: Date.now() - reconnectStartedAt,
              ready: result?.ready === true,
              forcedPageReload: options.forcePageReload === true,
              pagePreserved: result?.pagePreserved === true,
              reloadIssued: result?.reloadIssued === true,
              documentChanged: result?.documentChanged === true,
              reason: result?.reason || null,
              errorCode: result?.errorCode || null,
              coalescedCallers: this._reconnectCallers.get(key) || 1,
            },
            { dedupeKey: `reconnect_finish:${key}:${reconnectStartedAt}` },
          );
          return result;
        })
        .finally(() => {
          this._reloadBarriers.delete(key);
          this._reconnects.delete(key);
          this._reconnectCallers.delete(key);
        });
      this._reconnects.set(key, promise);
      return promise;
    }
    static async recoverOperation(options = {}) {
      const operationId =
        options.operationId || options.item?.operationId || null;
      const driver = options.driver || options.item?.flowApiDriver || "v1";
      if (driver !== "v2" || !operationId) {
        return this.reconnect({ ...options, driver });
      }
      const preservePage = options.operationTerminal !== true;
      const flowTabId = Number.isInteger(options.flowTabId)
        ? options.flowTabId
        : options.item?.flowApiTabId;
      const readiness = await this.reconnect({
        ...options,
        driver: "v2",
        projectId: options.projectId || options.item?.projectId,
        force: options.force === true,
        flowTabId,
        recoveryAuthorized: true,
        preservePage,
      });
      return this._normalized(
        { ...readiness, stage: "accepted_poll" },
        {
          driver: "v2",
          stage: "accepted_poll",
          projectId: options.projectId || options.item?.projectId,
        },
      );
    }
  }
  __publicField(FlowApiSessionCoordinator, "_healthCache", new Map());
  __publicField(FlowApiSessionCoordinator, "_healthTelemetry", new Map());
  __publicField(FlowApiSessionCoordinator, "_reconnects", new Map());
  __publicField(FlowApiSessionCoordinator, "_reconnectCallers", new Map());
  __publicField(FlowApiSessionCoordinator, "_reloadBarriers", new Map());
  __publicField(FlowApiSessionCoordinator, "_cooldowns", new Map());
  __publicField(FlowApiSessionCoordinator, "_bound", false);
  __publicField(FlowApiSessionCoordinator, "_flowTabIds", new Set());
  __publicField(FlowApiSessionCoordinator, "_flowLoadingTabIds", new Set());
  __publicField(FlowApiSessionCoordinator, "_flowTabUrls", new Map());
  __publicField(FlowApiSessionCoordinator, "HEALTH_TTL_MS", 5e3);
  __publicField(FlowApiSessionCoordinator, "RECONNECT_COOLDOWN_MS", 2e3);
  window.FlowApiSessionCoordinator = FlowApiSessionCoordinator;
  if (typeof globalThis !== "undefined")
    globalThis.FlowApiSessionCoordinator = FlowApiSessionCoordinator;
})();
