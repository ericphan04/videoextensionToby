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
class SseClient {
  static getReconnectStats() {
    const now = Date.now();
    const currentUptimeMs = this._lastConnectedAt
      ? now - this._lastConnectedAt
      : 0;
    return {
      mode: this._mode,
      totalReconnects: this._totalReconnects,
      currentRetryCount: this._retryCount,
      lastReconnectAt: this._lastReconnectAt
        ? new Date(this._lastReconnectAt).toISOString()
        : null,
      lastConnectedAt: this._lastConnectedAt
        ? new Date(this._lastConnectedAt).toISOString()
        : null,
      currentUptimeMs,
      cumulativeUptimeMs: this._connectionUptime + currentUptimeMs,
    };
  }
  static get _BASE_DELAY() {
    return 2e3;
  }
  static get _MAX_DELAY() {
    return window.SystemConfig?.getTimeout("sse_max_delay_ms") || 3e4;
  }
  static get _MAX_RETRIES() {
    return window.SystemConfig?.getTimeout("sse_max_retries") || 15;
  }
  static get _HEARTBEAT_TIMEOUT() {
    return window.SystemConfig?.getTimeout("sse_heartbeat_timeout_ms") || 45e3;
  }
  static get _STABLE_THRESHOLD() {
    return window.SystemConfig?.getTimeout("sse_stable_threshold_ms") || 1e4;
  }
  static async connect() {
    if (this._eventSource) return;
    if (this._connecting) return;
    if (!window.authManager?.isLoggedIn()) {
      console.log(
        "[SSE] Ch\u01B0a \u0111\u0103ng nh\u1EADp, kh\xF4ng k\u1EBFt n\u1ED1i",
      );
      return;
    }
    const rateLimitedUntil = window.authManager?._rateLimitedUntil || 0;
    if (rateLimitedUntil > Date.now()) {
      console.log(
        "[SSE] connect skip \u2014 cooldown rate-limit " +
          Math.ceil((rateLimitedUntil - Date.now()) / 1e3) +
          "s, l\xEAn l\u1ECBch backoff",
      );
      this._scheduleReconnect();
      return;
    }
    if (
      window.SseBroadcastManager &&
      !window.SseBroadcastManager.isInitialized()
    ) {
      await window.SseBroadcastManager.init(window.authManager?.user?.id);
    }
    this._setupRoleChangeListener();
    if (
      window.SseBroadcastManager?.isInitialized() &&
      !window.SseBroadcastManager.isLeader()
    ) {
      console.log(
        "[SSE] Follower mode - nh\u1EADn events qua BroadcastChannel",
      );
      this._connected = true;
      window.eventBus?.emit("sse:follower_mode");
      return;
    }
    this._connecting = true;
    window.eventBus?.emit("sse:connecting");
    window.SseBroadcastManager?.broadcastSseStatus("connecting");
    try {
      console.log(
        "[SSE] B\u1EAFt \u0111\u1EA7u k\u1EBFt n\u1ED1i... (retry #" +
          this._retryCount +
          ")",
      );
      const mercureInfo = await this._getMercureToken();
      if (mercureInfo && mercureInfo !== "MERCURE_UNAVAILABLE") {
        this._connectMercure(mercureInfo);
        return;
      }
      console.log(
        "[SSE] Mercure unavailable \u2192 fallback legacy /sse/stream",
      );
      const ticket = await this._getTicket();
      if (!ticket) {
        console.warn("[SSE] Kh\xF4ng l\u1EA5y \u0111\u01B0\u1EE3c ticket");
        this._connecting = false;
        this._scheduleReconnect();
        return;
      }
      if (ticket === "AUTH_ERROR") {
        console.warn(
          "[SSE] Auth error, kh\xF4ng reconnect (ch\u1EDD user login)",
        );
        this._connecting = false;
        this._connected = false;
        window.eventBus?.emit("sse:auth_required");
        return;
      }
      if (
        typeof ticket === "string" &&
        ticket.startsWith("POLLING_REQUIRED:")
      ) {
        const intervalMs = parseInt(ticket.split(":")[1], 10) || 3e4;
        this._connecting = false;
        this._retryCount = 0;
        this._startPolling(intervalMs);
        return;
      }
      console.log("[SSE] \u0110\xE3 l\u1EA5y ticket");
      this._mode = "sse";
      const stored = await chrome.storage.local.get("af_sse_last_event_id");
      const lastId = stored.af_sse_last_event_id || "";
      const baseUrl = this._getBaseUrl();
      if (!baseUrl) {
        console.warn("[SSE] Kh\xF4ng c\xF3 base URL");
        this._connecting = false;
        return;
      }
      let url = `${baseUrl}/api/v1/sse/stream?ticket=${encodeURIComponent(ticket)}`;
      if (lastId) url += `&last_event_id=${encodeURIComponent(lastId)}`;
      console.log("[SSE] Connecting to:", url);
      this._connectedAt = 0;
      this._eventSource = new EventSource(url);
      this._eventSource.onopen = () => {
        this._connected = true;
        this._connecting = false;
        this._connectedAt = Date.now();
        this._lastHeartbeat = Date.now();
        this._startHeartbeatCheck();
        this._scheduleStableReset();
        console.log("[SSE] \u0110\xE3 k\u1EBFt n\u1ED1i");
        window.eventBus?.emit("sse:connected");
        window.SseBroadcastManager?.broadcastSseStatus("connected");
      };
      this._eventSource.onmessage = (e) => {
        this._lastHeartbeat = Date.now();
        this._handleMessage(e);
      };
      this._eventSource.onerror = (e) => {
        const state = this._eventSource?.readyState;
        const stateStr =
          state === 0
            ? "CONNECTING"
            : state === 1
              ? "OPEN"
              : state === 2
                ? "CLOSED"
                : "UNKNOWN";
        const aliveMs = this._connectedAt ? Date.now() - this._connectedAt : 0;
        console.warn(
          `[SSE] L\u1ED7i k\u1EBFt n\u1ED1i (readyState: ${stateStr}, alive: ${aliveMs}ms), s\u1EBD reconnect...`,
        );
        this._connected = false;
        this._connecting = false;
        this._stopHeartbeatCheck();
        this._clearStableReset();
        window.eventBus?.emit("sse:disconnected");
        window.SseBroadcastManager?.broadcastSseStatus("disconnected");
        this._closeEventSource();
        this._scheduleReconnect();
      };
    } catch (err) {
      console.warn("[SSE] Kh\xF4ng th\u1EC3 k\u1EBFt n\u1ED1i:", err.message);
      this._connecting = false;
      this._scheduleReconnect();
    }
  }
  static _scheduleStableReset() {
    if (this._stableResetTimer) clearTimeout(this._stableResetTimer);
    this._stableResetTimer = setTimeout(() => {
      this._stableResetTimer = null;
      if (this._connected) {
        const wasRetrying = this._retryCount > 0;
        this._retryCount = 0;
        if (wasRetrying) {
          console.log("[SSE] Connection stable, reset retry counter");
        }
      }
    }, this._STABLE_THRESHOLD);
  }
  static _clearStableReset() {
    if (this._stableResetTimer) {
      clearTimeout(this._stableResetTimer);
      this._stableResetTimer = null;
    }
  }
  static _scheduleReconnect() {
    if (this._reconnectTimer) return;
    this._retryCount++;
    if (this._retryCount > this._MAX_RETRIES) {
      console.warn(
        "[SSE] \u0110\xE3 v\u01B0\u1EE3t qu\xE1 " +
          this._MAX_RETRIES +
          " l\u1EA7n retry li\xEAn ti\u1EBFp, d\u1EEBng reconnect. S\u1EBD th\u1EED l\u1EA1i khi focus/visibility.",
      );
      window.eventBus?.emit("sse:gave_up");
      return;
    }
    const baseDelay = Math.min(
      this._BASE_DELAY * Math.pow(2, this._retryCount - 1),
      this._MAX_DELAY,
    );
    const jitter = Math.random() * 2e3;
    const delay = baseDelay + jitter;
    this._totalReconnects++;
    this._lastReconnectAt = Date.now();
    if (this._lastConnectedAt) {
      this._connectionUptime += Date.now() - this._lastConnectedAt;
      this._lastConnectedAt = null;
    }
    console.log(
      "[SSE] Reconnect sau " +
        (delay / 1e3).toFixed(1) +
        "s (base: " +
        baseDelay / 1e3 +
        "s + jitter: " +
        (jitter / 1e3).toFixed(1) +
        "s, retry #" +
        this._retryCount +
        ", total reconnects: " +
        this._totalReconnects +
        ")",
    );
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.connect();
    }, delay);
  }
  static _startHeartbeatCheck() {
    this._stopHeartbeatCheck();
    this._heartbeatCheckTimer = setInterval(() => {
      if (!this._connected) return;
      if (this._mode === "mercure") {
        const rs = this._eventSource?.readyState;
        if (rs === 2) {
          console.info("[Mercure] EventSource CLOSED, schedule reconnect...");
          this._connected = false;
          window.eventBus?.emit("sse:disconnected");
          window.SseBroadcastManager?.broadcastSseStatus("disconnected");
          this._scheduleReconnect();
        }
        return;
      }
      const elapsed = Date.now() - this._lastHeartbeat;
      if (elapsed > this._HEARTBEAT_TIMEOUT) {
        console.warn(
          "[SSE] Heartbeat timeout (" +
            elapsed / 1e3 +
            "s), force reconnect...",
        );
        window.eventBus?.emit("sse:heartbeat_timeout");
        this._closeEventSource();
        this._connected = false;
        window.eventBus?.emit("sse:disconnected");
        window.SseBroadcastManager?.broadcastSseStatus("disconnected");
        this._scheduleReconnect();
      }
    }, 1e4);
  }
  static _stopHeartbeatCheck() {
    if (this._heartbeatCheckTimer) {
      clearInterval(this._heartbeatCheckTimer);
      this._heartbeatCheckTimer = null;
    }
  }
  static disconnect() {
    if (
      !window.SseBroadcastManager?.isInitialized() ||
      window.SseBroadcastManager.isLeader()
    ) {
      this._endSessionOnServer();
    }
    window.SseBroadcastManager?.destroy();
    this._closeEventSource();
    this._stopHeartbeatCheck();
    this._clearStableReset();
    this._stopPolling();
    this._mercureToken = null;
    this._mercureSessionRefreshedAt = 0;
    this._mercureFetchInFlight = null;
    this._noMercureUntil = 0;
    this._switchScheduled = false;
    this._recentEventIds = [];
    this._mode = "sse";
    this._mercureConnFailStreak = 0;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._connecting = false;
    this._retryCount = 0;
    this._roleListenerSetup = false;
    if (this._connected) {
      this._connected = false;
      console.log("[SSE] \u0110\xE3 ng\u1EAFt k\u1EBFt n\u1ED1i");
      window.eventBus?.emit("sse:disconnected");
    }
  }
  static _endSessionOnServer() {
    const token = window.authManager?.token;
    if (!token) {
      console.log("[SSE] Skip _endSessionOnServer: kh\xF4ng c\xF3 token");
      return;
    }
    chrome.runtime.sendMessage(
      {
        action: "apiRequest",
        method: "POST",
        endpoint: "sse/end-session",
        data: null,
        token,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          return;
        }
        if (response?.success) {
          console.log("[SSE] end-session backup th\xE0nh c\xF4ng");
        }
      },
    );
  }
  static _closeEventSource() {
    this._stopMercureKeepAlive();
    if (this._eventSource) {
      this._eventSource.close();
      this._eventSource = null;
    }
  }
  static _startMercureKeepAlive() {
    this._stopMercureKeepAlive();
    this._mercureKeepAliveTimer = setInterval(async () => {
      if (this._mode !== "mercure" || !this._connected) return;
      try {
        const resp = await window.authManager?._apiCall(
          "GET",
          "sse/subscribe-token",
        );
        if (resp?.token && resp?.hub_url) {
          this._mercureSessionRefreshedAt = Date.now();
          this._mercureToken = {
            token: resp.token,
            hub_url: resp.hub_url,
            topics: resp.topics || [],
            expires_at_ms: Date.now() + (resp.expires_in || 7200) * 1e3,
          };
        }
      } catch (e) {
        console.warn(
          "[Mercure] keep-alive session refresh failed (non-fatal):",
          e?.message || e,
        );
      }
    }, this._MERCURE_KEEPALIVE_MS);
  }
  static _stopMercureKeepAlive() {
    if (this._mercureKeepAliveTimer) {
      clearInterval(this._mercureKeepAliveTimer);
      this._mercureKeepAliveTimer = null;
    }
  }
  static isConnected() {
    if (
      window.SseBroadcastManager?.isInitialized() &&
      !window.SseBroadcastManager.isLeader()
    ) {
      return this._connected;
    }
    return (
      this._connected && this._eventSource?.readyState === EventSource.OPEN
    );
  }
  static pollNow() {
    if (this._mode !== "polling" || !this._pollingTimer) return;
    this._pollOnce();
  }
  static forceReconnect() {
    if (this.isConnected()) return;
    if (this._connecting) return;
    if (!window.authManager?.isLoggedIn()) return;
    const rateLimitedUntil = window.authManager?._rateLimitedUntil || 0;
    if (rateLimitedUntil > Date.now()) {
      console.log(
        "[SSE] forceReconnect skip \u2014 \u0111ang cooldown rate-limit " +
          Math.ceil((rateLimitedUntil - Date.now()) / 1e3) +
          "s",
      );
      return;
    }
    this._retryCount = 0;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._closeEventSource();
    this.connect();
  }
  static _trackEventId(eventId) {
    if (!eventId) return;
    if (this._recentEventIds.includes(eventId)) return;
    this._recentEventIds.push(eventId);
    if (this._recentEventIds.length > this._RECENT_EVENT_IDS_MAX) {
      this._recentEventIds.shift();
    }
  }
  static _handleMessage(e) {
    if (e.lastEventId) {
      this._lastEventId = e.lastEventId;
      chrome.storage.local.set({ af_sse_last_event_id: e.lastEventId });
      this._trackEventId(e.lastEventId);
    }
    if (!e.data || e.data.trim() === "") {
      return;
    }
    let payload;
    try {
      payload = JSON.parse(e.data);
    } catch (err) {
      console.warn("[SSE] L\u1ED7i parse JSON:", err.message, "| Raw:", e.data);
      return;
    }
    if (payload?.id) this._trackEventId(payload.id);
    const eventName = payload.event || "unknown";
    if (eventName === "heartbeat") {
      return;
    }
    console.log("[SSE] Event:", eventName, payload.data);
    if (eventName === "session_replaced") {
      const timeSinceConnect = Date.now() - this._connectedAt;
      if (timeSinceConnect < 3e3) {
        console.log(
          "[SSE] B\u1ECF qua stale session_replaced event (received " +
            timeSinceConnect +
            "ms sau connect)",
        );
        return;
      }
    }
    window.SseBroadcastManager?.forwardSseEvent(eventName, payload.data);
    try {
      window.eventBus?.emit(`sse:${eventName}`, payload.data);
    } catch (err) {
      console.warn(
        "[SSE] L\u1ED7i trong event handler:",
        eventName,
        err.message,
      );
    }
    this._handleNotificationEvents(eventName, payload.data);
    this._handleProviderConfigEvents(eventName, payload.data);
    this._handleConfigEvents(eventName, payload.data);
  }
  static _handleProviderConfigEvents(eventName, data) {
    if (
      eventName === "provider_config_updated" ||
      eventName === "config.updated"
    ) {
      if (window.ProviderConfigManager) {
        window.ProviderConfigManager.handleSseUpdate(data);
      }
    }
    if (eventName === "provider_updated") {
      console.log("[SSE] provider_updated event received:", data);
      (async () => {
        try {
          if (window.ProviderMeta?.handleSseUpdate) {
            await window.ProviderMeta.handleSseUpdate(data);
          } else if (window.ProviderMeta?.fetch) {
            window.ProviderMeta._cache = null;
            await window.ProviderMeta.fetch();
          }
        } catch (e) {
          console.warn("[SSE] ProviderMeta refetch failed:", e?.message);
        }
        console.log("[SSE] Emitting provider:updated after refetch");
        window.eventBus?.emit("provider:updated", data);
      })();
    }
  }
  static _handleConfigEvents(eventName, data) {
    try {
      switch (eventName) {
        case "provider_models_updated":
          if (window.ModelRegistry) {
            window.ModelRegistry.handleSseUpdate(data);
          }
          break;
        case "provider_voices_updated":
          if (window.VoiceRegistry) {
            window.VoiceRegistry.handleSseUpdate(data);
          }
          break;
        case "node_types_updated":
          console.log(
            "[SseClient] node_types_updated \u2192 invalidate NodeTemplates cache + emit node_types:refreshed",
            data,
          );
          if (window.NodeTemplates) {
            window.NodeTemplates._serverTypes = null;
            window.NodeTemplates._serverTypesFetchedAt = 0;
          }
          window.eventBus?.emit("node_types:refreshed", data);
          break;
        case "pa_content_formats_updated":
          try {
            chrome.runtime.sendMessage({ action: "pa:invalidateFormats" });
          } catch (_) {}
          window.eventBus?.emit("pa:formats_updated", data);
          break;
        case "validation_rules_updated":
          if (window.ValidationRules) {
            window.ValidationRules.handleSseUpdate(data);
          }
          break;
        case "entitlements_changed":
        case "plan_activated":
          if (window.featureGate?.refresh) {
            console.log(
              `[SseClient] ${eventName} \u2192 FeatureGate.refresh()`,
              data,
            );
            window.featureGate
              .refresh()
              .catch((err) =>
                console.warn(
                  "[SseClient] FeatureGate refresh failed:",
                  err?.message,
                ),
              );
          }
          if (window.CreatorTemplatePublish)
            window.CreatorTemplatePublish._eligibleCache = null;
          try {
            chrome.runtime.sendMessage({ action: "pa:invalidateFormats" });
          } catch (_) {}
          break;
        case "default_settings_updated":
          window.storageSettings
            ?._loadServerDefaults?.()
            ?.catch((error) =>
              console.warn(
                "[SseClient] Default settings refresh failed:",
                error?.message,
              ),
            );
          window.eventBus?.emit("default_settings:refreshed", data);
          break;
        case "i18n_updated":
          if (window.I18n?.invalidate && data?.locale) {
            window.I18n.invalidate(data.locale);
            if (this._i18nReloadTimer) clearTimeout(this._i18nReloadTimer);
            this._i18nReloadTimer = setTimeout(() => {
              this._i18nReloadTimer = null;
              window.I18n.reload?.();
            }, 500);
          }
          break;
      }
    } catch (err) {
      console.warn("[SseClient] _handleConfigEvents error:", err.message);
    }
  }
  static _handleNotificationEvents(eventName, data) {
    try {
      switch (eventName) {
        case "notification.new":
          window.eventBus?.emit("notification:new", data);
          if (data?.type === "workflow_shared") {
            window.eventBus?.emit("notification:show_shared_overlay", data);
          }
          break;
        case "notification.count_updated":
          window.eventBus?.emit("notification:count_updated", data);
          break;
        case "workflow.share_accepted":
          window.eventBus?.emit("workflow:share_accepted", data);
          break;
        case "workflow.share_rejected":
          window.eventBus?.emit("workflow:share_rejected", data);
          break;
        case "workflow.share_revoked":
          window.eventBus?.emit("workflow:share_revoked", data);
          break;
      }
    } catch (err) {
      console.warn(
        "[SSE] Error in notification handler:",
        eventName,
        err.message,
      );
    }
  }
  static async _getTicket() {
    try {
      console.log("[SSE] \u0110ang l\u1EA5y ticket...");
      const resp = await window.authManager?._apiCall("POST", "sse/ticket");
      if (resp?.ticket) {
        console.log("[SSE] \u0110\xE3 l\u1EA5y \u0111\u01B0\u1EE3c ticket");
        return resp.ticket;
      }
      console.warn("[SSE] Response kh\xF4ng c\xF3 ticket:", resp);
      return null;
    } catch (err) {
      const serverData = err.serverData || {};
      const isSseRequiresPaid =
        err.code === "SSE_REQUIRES_PAID" ||
        serverData.fallback_url === "/api/v1/events/poll";
      if (err.httpStatus === 403 && isSseRequiresPaid) {
        const interval = serverData.fallback_interval_ms || 3e4;
        console.info(
          "[SSE] Free plan d\xF9ng polling, interval:",
          interval,
          "ms",
        );
        return "POLLING_REQUIRED:" + interval;
      }
      if (
        err.httpStatus === 401 ||
        err.httpStatus === 403 ||
        err.code === "UNAUTHENTICATED"
      ) {
        console.info(
          "[SSE] Phi\xEAn \u0111\u0103ng nh\u1EADp kh\xF4ng s\u1EB5n s\xE0ng \u2014 d\u1EEBng reconnect realtime",
        );
        return "AUTH_ERROR";
      }
      console.warn(
        "[SSE] L\u1EA5y ticket th\u1EA5t b\u1EA1i:",
        err.message,
        err,
      );
      return null;
    }
  }
  static async _getMercureToken() {
    if (this._noMercureUntil > Date.now()) {
      return "MERCURE_UNAVAILABLE";
    }
    if (
      this._mercureToken &&
      this._mercureToken.expires_at_ms - Date.now() > 15 * 60 * 1e3 &&
      Date.now() - this._mercureSessionRefreshedAt < this._MERCURE_KEEPALIVE_MS
    ) {
      return this._mercureToken;
    }
    if (this._mercureFetchInFlight) {
      return this._mercureFetchInFlight;
    }
    this._mercureFetchInFlight = (async () => {
      try {
        const resp = await window.authManager?._apiCall(
          "GET",
          "sse/subscribe-token",
        );
        if (!resp?.token || !resp?.hub_url) {
          console.warn(
            "[Mercure] Response kh\xF4ng c\xF3 token/hub_url:",
            resp,
          );
          return null;
        }
        const expiresInSec = resp.expires_in || 7200;
        this._mercureSessionRefreshedAt = Date.now();
        this._mercureToken = {
          token: resp.token,
          hub_url: resp.hub_url,
          topics: resp.topics || [],
          expires_at_ms: Date.now() + expiresInSec * 1e3,
        };
        console.log(
          "[Mercure] Subscriber token cached, expires in",
          expiresInSec,
          "s",
        );
        return this._mercureToken;
      } catch (err) {
        if (err.httpStatus === 404) {
          console.log(
            "[Mercure] Endpoint 404 (backend Phase 2 ch\u01B0a deploy) \u2192 fallback legacy SSE",
          );
          this._noMercureUntil = Date.now() + 5 * 60 * 1e3;
          return "MERCURE_UNAVAILABLE";
        }
        const isDisabled =
          err.code === "MERCURE_DISABLED" ||
          err.serverData?.code === "MERCURE_DISABLED";
        if (isDisabled) {
          console.log(
            "[Mercure] Hub ch\u01B0a enable tr\xEAn VPS \u2192 fallback legacy SSE",
          );
          this._noMercureUntil = Date.now() + 5 * 60 * 1e3;
          return "MERCURE_UNAVAILABLE";
        }
        const isRequiresPaid =
          err.httpStatus === 403 &&
          (err.code === "SSE_REQUIRES_PAID" ||
            err.serverData?.code === "SSE_REQUIRES_PAID");
        if (isRequiresPaid) {
          console.log(
            "[Mercure] Free user \u2014 cache no_mercure, fallback /sse/ticket s\u1EBD trigger polling",
          );
          this._noMercureUntil = Date.now() + 15 * 60 * 1e3;
          return "MERCURE_UNAVAILABLE";
        }
        console.warn("[Mercure] Fetch token failed:", err.message);
        return null;
      } finally {
        this._mercureFetchInFlight = null;
      }
    })();
    return this._mercureFetchInFlight;
  }
  static _connectMercure(tokenInfo) {
    this._mode = "mercure";
    const url = new URL(tokenInfo.hub_url);
    (tokenInfo.topics || []).forEach((t) =>
      url.searchParams.append("topic", t),
    );
    url.searchParams.append("authorization", tokenInfo.token);
    chrome.storage.local.get("af_sse_last_event_id", (stored) => {
      const lastId = stored.af_sse_last_event_id;
      if (lastId) url.searchParams.append("Last-Event-ID", lastId);
      console.log(
        "[Mercure] Connecting to hub:",
        tokenInfo.hub_url,
        "topics:",
        tokenInfo.topics,
      );
      let opened = false;
      this._connectedAt = 0;
      this._eventSource = new EventSource(url.toString());
      this._eventSource.onopen = () => {
        opened = true;
        this._mercureConnFailStreak = 0;
        this._connected = true;
        this._connecting = false;
        this._connectedAt = Date.now();
        this._lastConnectedAt = Date.now();
        this._lastHeartbeat = Date.now();
        this._startHeartbeatCheck();
        this._scheduleStableReset();
        console.log("[Mercure] Connected \u2713");
        window.eventBus?.emit("sse:connected");
        window.SseBroadcastManager?.broadcastSseStatus("connected");
        this._startMercureKeepAlive();
        this._primePollAfterMercureReconnect().catch((e) => {
          console.warn(
            "[Mercure] Prime poll failed (non-fatal):",
            e?.message || e,
          );
        });
      };
      this._eventSource.onmessage = (e) => {
        this._lastHeartbeat = Date.now();
        this._handleMessage(e);
      };
      this._eventSource.onerror = () => {
        const state = this._eventSource?.readyState;
        const stateStr =
          state === 0
            ? "CONNECTING"
            : state === 1
              ? "OPEN"
              : state === 2
                ? "CLOSED"
                : "UNKNOWN";
        const aliveMs = this._connectedAt ? Date.now() - this._connectedAt : 0;
        console.info(
          `[Mercure] Error (readyState: ${stateStr}, alive: ${aliveMs}ms), reconnect...`,
        );
        const nearExpiry = this._mercureToken?.expires_at_ms - Date.now() < 6e4;
        const earlyDrop = aliveMs > 0 && aliveMs < 5e3;
        if (nearExpiry || earlyDrop) {
          this._mercureToken = null;
          console.log("[Mercure] Clear JWT cache:", {
            nearExpiry,
            earlyDrop,
            aliveMs,
          });
        }
        if (!opened) {
          this._mercureConnFailStreak++;
          if (this._mercureConnFailStreak >= this._MERCURE_FAIL_MAX) {
            console.info(
              `[Mercure] ${this._mercureConnFailStreak} l\u1EA7n connect fail (ch\u01B0a t\u1EEBng open) \u2192 degrade legacy SSE 5 ph\xFAt`,
            );
            this._noMercureUntil = Date.now() + 5 * 60 * 1e3;
            this._mercureToken = null;
            this._mercureConnFailStreak = 0;
          }
        } else {
          this._mercureConnFailStreak = 0;
        }
        this._connected = false;
        this._connecting = false;
        this._stopHeartbeatCheck();
        this._clearStableReset();
        window.eventBus?.emit("sse:disconnected");
        window.SseBroadcastManager?.broadcastSseStatus("disconnected");
        this._closeEventSource();
        this._scheduleReconnect();
      };
    });
  }
  static _startPolling(intervalMs = 3e4) {
    if (this._mode === "polling" && this._pollingTimer) {
      this.setPollingInterval(intervalMs);
      return;
    }
    this._mode = "polling";
    this._pollingInterval = intervalMs;
    if (
      window.SseBroadcastManager?.isInitialized() &&
      !window.SseBroadcastManager.isLeader()
    ) {
      console.log(
        "[Polling] Skip \u2014 follower tab, leader s\u1EBD poll + forward events",
      );
      this._connected = true;
      window.eventBus?.emit("sse:follower_mode");
      return;
    }
    console.log(`[Polling] Start polling mode, interval ${intervalMs}ms`);
    this._connected = true;
    window.eventBus?.emit("sse:connected");
    window.SseBroadcastManager?.broadcastSseStatus("connected");
    this._pollOnce();
    this._pollingTimer = setInterval(
      () => this._pollOnce(),
      this._pollingInterval,
    );
  }
  static async _pollOnce() {
    if (this._pollingInProgress) return;
    if (!window.authManager?.isLoggedIn()) {
      this._stopPolling();
      return;
    }
    if (window.authManager?._rateLimitedUntil > Date.now()) {
      console.log("[Polling] Skip \u2014 rate limited cooldown active");
      return;
    }
    this._pollingInProgress = true;
    try {
      const since = this._lastEventId || "";
      const endpoint = since
        ? `events/poll?since=${encodeURIComponent(since)}`
        : "events/poll";
      const resp = await window.authManager._apiCall("GET", endpoint);
      const events = resp?.events || resp?.data?.events || [];
      const lastId = resp?.last_event_id || resp?.data?.last_event_id;
      if (events.length > 0) {
        console.log(`[Polling] Received ${events.length} events`);
        events.forEach((ev) => {
          const eventName = ev.event || "unknown";
          if (ev.id && this._recentEventIds.includes(ev.id)) return;
          if (ev.id) {
            this._lastEventId = ev.id;
            chrome.storage.local.set({ af_sse_last_event_id: ev.id });
            this._trackEventId(ev.id);
          }
          window.SseBroadcastManager?.forwardSseEvent(eventName, ev.data);
          try {
            window.eventBus?.emit(`sse:${eventName}`, ev.data);
          } catch (handlerErr) {
            console.warn(
              "[Polling] Handler error:",
              eventName,
              handlerErr.message,
            );
          }
          this._handleNotificationEvents(eventName, ev.data);
          this._handleProviderConfigEvents(eventName, ev.data);
          this._handleConfigEvents(eventName, ev.data);
        });
      }
      if (lastId) this._lastEventId = lastId;
    } catch (err) {
      console.info("[Polling] Fetch deferred:", err.message);
      if (err.httpStatus === 401) {
        this._stopPolling();
        window.eventBus?.emit("sse:auth_required");
      }
    } finally {
      this._pollingInProgress = false;
    }
  }
  static async _primePollAfterMercureReconnect() {
    await new Promise((r) => setTimeout(r, 500));
    if (this._mode !== "mercure") return;
    if (!window.authManager?.isLoggedIn()) return;
    if (window.authManager?._rateLimitedUntil > Date.now()) return;
    try {
      const since = this._lastEventId || "";
      const sincePart = since ? `&since=${encodeURIComponent(since)}` : "";
      const endpoint = `events/poll?prime=1${sincePart}`;
      const resp = await window.authManager._apiCall("GET", endpoint);
      const events = resp?.events || resp?.data?.events || [];
      if (events.length === 0) return;
      let drainedCount = 0;
      events.forEach((ev) => {
        const eventName = ev.event || "unknown";
        if (ev.id && this._recentEventIds.includes(ev.id)) return;
        if (ev.id) {
          this._lastEventId = ev.id;
          chrome.storage.local.set({ af_sse_last_event_id: ev.id });
          this._trackEventId(ev.id);
        }
        drainedCount++;
        window.SseBroadcastManager?.forwardSseEvent(eventName, ev.data);
        try {
          window.eventBus?.emit(`sse:${eventName}`, ev.data);
        } catch (handlerErr) {
          console.warn(
            "[Mercure] Prime handler error:",
            eventName,
            handlerErr.message,
          );
        }
        this._handleNotificationEvents(eventName, ev.data);
        this._handleProviderConfigEvents(eventName, ev.data);
        this._handleConfigEvents(eventName, ev.data);
      });
      if (drainedCount > 0) {
        console.log(
          `[Mercure] Prime poll: drained ${drainedCount}/${events.length} missed events (rest dedupe'd)`,
        );
      }
    } catch (err) {
      console.warn("[Mercure] Prime poll fetch failed:", err.message);
    }
  }
  static setPollingInterval(ms) {
    if (this._mode !== "polling") {
      console.log("[Polling] Not in polling mode, ignore setPollingInterval");
      return;
    }
    if (this._pollingInterval === ms) return;
    this._pollingInterval = ms;
    if (this._pollingTimer) {
      clearInterval(this._pollingTimer);
      this._pollingTimer = setInterval(() => this._pollOnce(), ms);
    }
    console.log(`[Polling] Interval changed to ${ms}ms`);
  }
  static _stopPolling() {
    if (this._pollingTimer) {
      clearInterval(this._pollingTimer);
      this._pollingTimer = null;
    }
    this._mode = "sse";
    this._pollingInProgress = false;
  }
  static getMode() {
    return this._mode;
  }
  static _getBaseUrl() {
    const apiBaseUrl = window.ApiBaseConfig.get();
    return apiBaseUrl.replace(/\/api\/v\d+$/, "");
  }
  static _setupRoleChangeListener() {
    if (this._roleListenerSetup) return;
    this._roleListenerSetup = true;
    window.eventBus?.on("broadcast:became_leader", () => {
      if (this._eventSource || this._connecting || this._pollingTimer) {
        console.log(
          "[SSE] \u0110\xE3 connected/connecting/polling, skip duplicate became_leader trigger",
        );
        return;
      }
      if (this._mode === "polling") {
        console.log("[Polling] Tr\u1EDF th\xE0nh leader, resume polling...");
        this._startPolling(this._pollingInterval);
        return;
      }
      console.log("[SSE] Tr\u1EDF th\xE0nh leader, k\u1EBFt n\u1ED1i SSE...");
      this._closeEventSource();
      this._connected = false;
      this.connect();
    });
    window.eventBus?.on("sse:plan_activated", () =>
      this._scheduleTransportSwitch("plan_activated"),
    );
    window.eventBus?.on("sse:entitlements_changed", () =>
      this._scheduleTransportSwitch("entitlements_changed"),
    );
    window.eventBus?.on("broadcast:became_follower", () => {
      console.log("[SSE] Tr\u1EDF th\xE0nh follower, ng\u1EAFt SSE/polling...");
      this._closeEventSource();
      if (this._pollingTimer) {
        clearInterval(this._pollingTimer);
        this._pollingTimer = null;
        this._pollingInProgress = false;
        console.log("[Polling] Stopped \u2014 follower mode");
      }
      this._connecting = false;
      this._connected = true;
      window.eventBus?.emit("sse:connected");
      window.eventBus?.emit("sse:follower_mode");
    });
  }
  static _scheduleTransportSwitch(reason) {
    if (this._switchScheduled) {
      console.log(
        `[SSE] Transport switch \u0111\xE3 schedule, skip duplicate trigger (${reason})`,
      );
      return;
    }
    this._switchScheduled = true;
    setTimeout(() => {
      this._switchScheduled = false;
      if (
        window.SseBroadcastManager?.isInitialized() &&
        !window.SseBroadcastManager.isLeader()
      ) {
        console.log("[SSE] Skip transport switch \u2014 not leader");
        return;
      }
      console.log(`[SSE] Plan changed (${reason}) \u2192 switch transport`);
      this._closeEventSource();
      this._stopPolling();
      this._mercureToken = null;
      this._mercureFetchInFlight = null;
      this._noMercureUntil = 0;
      this._mode = "sse";
      this._connected = false;
      this._connecting = false;
      this.connect();
    }, 2e3);
  }
}
__publicField(SseClient, "_eventSource", null);
__publicField(SseClient, "_lastEventId", null);
__publicField(SseClient, "_reconnectTimer", null);
__publicField(SseClient, "_connected", false);
__publicField(SseClient, "_connecting", false);
__publicField(SseClient, "_roleListenerSetup", false);
__publicField(SseClient, "_connectedAt", 0);
__publicField(SseClient, "_mode", "sse");
__publicField(SseClient, "_pollingTimer", null);
__publicField(SseClient, "_pollingInterval", 3e4);
__publicField(SseClient, "_pollingInProgress", false);
__publicField(SseClient, "_mercureToken", null);
__publicField(SseClient, "_mercureSessionRefreshedAt", 0);
__publicField(SseClient, "_mercureFetchInFlight", null);
__publicField(SseClient, "_mercureKeepAliveTimer", null);
__publicField(SseClient, "_MERCURE_KEEPALIVE_MS", 20 * 60 * 1e3);
__publicField(SseClient, "_noMercureUntil", 0);
__publicField(SseClient, "_mercureConnFailStreak", 0);
__publicField(SseClient, "_MERCURE_FAIL_MAX", 3);
__publicField(SseClient, "_switchScheduled", false);
__publicField(SseClient, "_recentEventIds", []);
__publicField(SseClient, "_RECENT_EVENT_IDS_MAX", 50);
__publicField(SseClient, "_retryCount", 0);
__publicField(SseClient, "_totalReconnects", 0);
__publicField(SseClient, "_lastReconnectAt", null);
__publicField(SseClient, "_lastConnectedAt", null);
__publicField(SseClient, "_connectionUptime", 0);
__publicField(SseClient, "_lastHeartbeat", 0);
__publicField(SseClient, "_heartbeatCheckTimer", null);
__publicField(SseClient, "_stableResetTimer", null);
window.SseClient = SseClient;
