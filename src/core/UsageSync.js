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
const _UsageSync = class _UsageSync {
  constructor() {
    this._sessionId = null;
    this._sessionStartedAt = null;
    this._activeTab = null;
    this._lastSyncedStats = null;
    this._syncTimer = null;
    this._heartbeatTimer = null;
    this._eventBuffer = [];
    this._eventFlushPromise = null;
    this._eventRetryAt = 0;
    this._eventRetryBackoffMs = 0;
    this._eventRetryTimer = null;
    this._flushTimer = null;
    this._lastFlushAt = Date.now();
    this._fingerprint = null;
    this._rateLimitedUntil = 0;
    this._lastSyncAttempt = 0;
    this._syncBackoffMs = 0;
    this._initialized = false;
    this._onStorageChanged = this._onStorageChanged.bind(this);
    this._onVisibilityChange = this._onVisibilityChange.bind(this);
    this._onBeforeUnload = this._onBeforeUnload.bind(this);
    this._onAuthLogin = this._onAuthLogin.bind(this);
    this._onAuthLogout = this._onAuthLogout.bind(this);
  }
  init() {
    if (this._initialized) return;
    this._initialized = true;
    console.log("[UsageSync] Khoi tao usage analytics tracking");
    if (window.eventBus) {
      window.eventBus.on("auth:login", this._onAuthLogin);
      window.eventBus.on("auth:logout", this._onAuthLogout);
    }
    if (chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener(this._onStorageChanged);
    }
    document.addEventListener("visibilitychange", this._onVisibilityChange);
    window.addEventListener("beforeunload", this._onBeforeUnload);
    if (window.eventBus) {
      window.eventBus.on("execution:completed", () => {
        if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
        if (this._postExecDeferTimer) clearTimeout(this._postExecDeferTimer);
        this._postExecDeferTimer = setTimeout(() => {
          this._postExecDeferTimer = null;
          this._sendHeartbeat();
          this._heartbeatTimer = setInterval(
            () => {
              this._sendHeartbeat();
            },
            5 * 60 * 1e3,
          );
        }, 5e3);
      });
    }
    this._startSession();
  }
  setActiveTab(tabId) {
    this._activeTab = tabId;
  }
  trackEvent(event, metadata = {}) {
    this._validateEventMetadata(event, metadata);
    this._eventBuffer.push({
      event,
      metadata,
      timestamp: new Date().toISOString(),
    });
    if (this._eventBuffer.length >= 20) {
      this._flushEvents();
    }
    if (!this._flushTimer) {
      this._flushTimer = setTimeout(() => {
        this._flushTimer = null;
        this._flushEvents();
      }, 6e4);
    }
  }
  _validateEventMetadata(event, metadata) {
    const schema = _UsageSync.EVENT_SCHEMAS[event];
    if (!schema) {
      console.warn(
        `[UsageSync] Event "${event}" khong co schema khai bao trong EVENT_SCHEMAS`,
      );
      return;
    }
    if (!metadata || typeof metadata !== "object") return;
    const allowedKeys = new Set(schema);
    const metaKeys = Object.keys(metadata);
    const extraKeys = metaKeys.filter((k) => !allowedKeys.has(k));
    if (extraKeys.length > 0) {
      console.warn(
        `[UsageSync] Event "${event}" co metadata keys khong khai bao trong schema:`,
        extraKeys,
      );
    }
  }
  async _getFingerprint() {
    if (this._fingerprint) return this._fingerprint;
    try {
      const res = await new Promise((resolve) => {
        chrome.storage.local.get(["af_fingerprint"], resolve);
      });
      if (res?.af_fingerprint && typeof res.af_fingerprint === "string") {
        this._fingerprint = res.af_fingerprint;
        return this._fingerprint;
      }
    } catch (err) {
      console.warn("[UsageSync] Doc fingerprint that bai:", err.message);
    }
    const fp = this._generateUuidV4();
    this._fingerprint = fp;
    try {
      await new Promise((resolve) => {
        chrome.storage.local.set({ af_fingerprint: fp }, resolve);
      });
    } catch (err) {
      console.warn("[UsageSync] Luu fingerprint that bai:", err.message);
    }
    return fp;
  }
  _generateUuidV4() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 3) | 8;
      return v.toString(16);
    });
  }
  async _startSession() {
    try {
      const res = await new Promise((resolve) => {
        chrome.storage.local.get(["af_active_session"], resolve);
      });
      const active = res?.af_active_session;
      const TEN_MINUTES = 10 * 60 * 1e3;
      if (
        active &&
        active.id &&
        active.last_heartbeat_at &&
        Date.now() - active.last_heartbeat_at < TEN_MINUTES
      ) {
        this._sessionId = active.id;
        this._sessionStartedAt = active.started_at || Date.now();
        console.log("[UsageSync] Reuse session active:", this._sessionId);
      } else {
        this._sessionId = this._generateUuidV4();
        this._sessionStartedAt = Date.now();
        console.log("[UsageSync] Session bat dau:", this._sessionId);
      }
    } catch (err) {
      this._sessionId = this._generateUuidV4();
      this._sessionStartedAt = Date.now();
      console.warn(
        "[UsageSync] Doc active session that bai, tao moi:",
        err.message,
      );
    }
    await this._persistActiveSession();
    if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
    this._heartbeatTimer = setInterval(
      () => {
        this._sendHeartbeat();
      },
      5 * 60 * 1e3,
    );
    this._sendHeartbeat();
    if (this._isLoggedIn()) {
      const jitterMs = 1e3 + Math.random() * 2e3;
      setTimeout(() => {
        this._syncDailyStats();
      }, jitterMs);
    }
  }
  async _persistActiveSession() {
    if (!this._sessionId) return;
    try {
      await new Promise((resolve) => {
        chrome.storage.local.set(
          {
            af_active_session: {
              id: this._sessionId,
              started_at: this._sessionStartedAt,
              last_heartbeat_at: Date.now(),
            },
          },
          resolve,
        );
      });
    } catch (err) {
      console.warn("[UsageSync] Persist active session that bai:", err.message);
    }
  }
  _endSession() {
    if (!this._sessionId) return;
    console.log("[UsageSync] Session ket thuc:", this._sessionId);
    this._sendSessionEnd();
    this._flushEvents();
    this._stopTimers();
    this._sessionId = null;
    this._sessionStartedAt = null;
  }
  async _sendHeartbeat() {
    if (!this._sessionId) return;
    const uptimeSeconds = Math.round(
      (Date.now() - this._sessionStartedAt) / 1e3,
    );
    const isLoggedIn = this._isLoggedIn();
    await this._persistActiveSession();
    try {
      const payload = {
        session_id: this._sessionId,
        active_tab: this._activeTab,
        uptime_seconds: uptimeSeconds,
      };
      if (!isLoggedIn) {
        payload.fingerprint = await this._getFingerprint();
      }
      await this._apiCall("POST", "usage/heartbeat", payload);
    } catch (err) {
      console.warn("[UsageSync] Heartbeat that bai:", err.message);
    }
  }
  _sendSessionEnd() {
    if (!this._sessionId) return;
    const baseUrl = this._getApiBaseUrl();
    if (!baseUrl) return;
    const token = this._getAuthToken();
    const isLoggedIn = !!token;
    const url = `${baseUrl}/usage/session-end`;
    try {
      const headers = { "Content-Type": "application/json" };
      try {
        if (chrome?.runtime?.id) headers["X-Extension-Id"] = chrome.runtime.id;
      } catch (_) {}
      const body = { session_id: this._sessionId };
      if (isLoggedIn) {
        headers["Authorization"] = "Bearer " + token;
      } else {
        if (this._fingerprint) {
          headers["X-Fingerprint"] = this._fingerprint;
          body.fingerprint = this._fingerprint;
        }
      }
      fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        keepalive: true,
      });
    } catch (err) {
      console.warn("[UsageSync] Gui session-end that bai:", err.message);
    }
  }
  _onStorageChanged(changes, area) {
    if (area !== "local") return;
    if (changes.af_daily_stats) {
      if (this._syncTimer) {
        clearTimeout(this._syncTimer);
      }
      this._syncTimer = setTimeout(() => {
        this._syncTimer = null;
        this._syncDailyStats();
      }, 3e4);
    }
    if (changes.af_active_session) {
      const newSession = changes.af_active_session.newValue;
      if (newSession && newSession.id && this._sessionId !== newSession.id) {
        const TEN_MINUTES = 10 * 60 * 1e3;
        if (
          newSession.last_heartbeat_at &&
          Date.now() - newSession.last_heartbeat_at < TEN_MINUTES
        ) {
        }
      }
    }
  }
  async _syncDailyStats() {
    if (!this._isLoggedIn()) return;
    const now = Date.now();
    if (now < this._rateLimitedUntil) {
      console.log("[UsageSync] Dang trong rate limit period, bo qua sync");
      return;
    }
    if (now - this._lastSyncAttempt < 1e4) {
      console.log("[UsageSync] Sync attempt qua gan nhau, bo qua");
      return;
    }
    this._lastSyncAttempt = now;
    try {
      const result = await new Promise((resolve) => {
        chrome.storage.local.get(["af_daily_stats"], (res) => {
          resolve(res.af_daily_stats || null);
        });
      });
      if (!result || !result._date) return;
      const statsJson = JSON.stringify(result);
      if (statsJson === this._lastSyncedStats) return;
      const utcDate = new Date().toISOString().slice(0, 10);
      const payload = {
        date: result._date || utcDate,
        task_run: result.task_run || 0,
        workflow_run: result.workflow_run || 0,
        angles_run: result.angles_run || 0,
        flow_prompt_total: result.flow_prompt_total || 0,
        chatgpt_prompt_total: result.chatgpt_prompt_total || 0,
        gemini_prompt_total: result.gemini_prompt_total || 0,
        grok_prompt_total: result.grok_prompt_total || 0,
        flow_fail: result.flow_fail || 0,
        chatgpt_fail: result.chatgpt_fail || 0,
        gemini_fail: result.gemini_fail || 0,
        grok_fail: result.grok_fail || 0,
      };
      await this._apiCall("POST", "usage/sync-daily", payload);
      this._lastSyncedStats = statsJson;
      this._syncBackoffMs = 0;
      console.log("[UsageSync] Daily stats da dong bo");
    } catch (err) {
      if (err.message?.includes("429") || err.httpStatus === 429) {
        this._syncBackoffMs = this._syncBackoffMs
          ? Math.min(this._syncBackoffMs * 2, 12e4)
          : 1e4;
        this._rateLimitedUntil = Date.now() + this._syncBackoffMs;
        console.warn(
          `[UsageSync] Rate limited (429), backoff ${this._syncBackoffMs / 1e3}s`,
        );
      } else {
        console.warn("[UsageSync] Dong bo daily stats that bai:", err.message);
      }
    }
  }
  async _flushEvents() {
    if (this._eventFlushPromise) return this._eventFlushPromise;
    if (this._eventBuffer.length === 0) return;
    if (Date.now() < this._eventRetryAt) return;
    this._eventFlushPromise = (async () => {
      while (this._eventBuffer.length > 0) {
        const events = this._eventBuffer.splice(0, 50);
        try {
          const isLoggedIn = this._isLoggedIn();
          const payload = isLoggedIn
            ? { events }
            : { events, fingerprint: await this._getFingerprint() };
          const response = await this._apiCall("POST", "usage/events", payload);
          if (response?.success === false)
            throw new Error(response?.error?.code || "USAGE_EVENTS_REJECTED");
          this._lastFlushAt = Date.now();
          this._eventRetryAt = 0;
          this._eventRetryBackoffMs = 0;
          if (this._eventRetryTimer) {
            clearTimeout(this._eventRetryTimer);
            this._eventRetryTimer = null;
          }
        } catch (err) {
          this._eventBuffer.unshift(...events);
          console.info(
            "[UsageSync] Flush deferred; events retained for retry:",
            err.message,
          );
          this._eventRetryBackoffMs = this._eventRetryBackoffMs
            ? Math.min(this._eventRetryBackoffMs * 2, 12e4)
            : 1e4;
          this._eventRetryAt = Date.now() + this._eventRetryBackoffMs;
          if (this._eventRetryTimer) clearTimeout(this._eventRetryTimer);
          this._eventRetryTimer = setTimeout(() => {
            this._eventRetryTimer = null;
            this._flushEvents();
          }, this._eventRetryBackoffMs);
          break;
        }
      }
    })();
    try {
      await this._eventFlushPromise;
    } finally {
      this._eventFlushPromise = null;
    }
  }
  _flushEventsOnUnload() {
    if (this._eventBuffer.length === 0) return;
    const baseUrl = this._getApiBaseUrl();
    if (!baseUrl) return;
    const token = this._getAuthToken();
    const isLoggedIn = !!token;
    const url = `${baseUrl}/usage/events`;
    const batches = [];
    while (this._eventBuffer.length)
      batches.push(this._eventBuffer.splice(0, 50));
    try {
      const headers = { "Content-Type": "application/json" };
      try {
        if (chrome?.runtime?.id) headers["X-Extension-Id"] = chrome.runtime.id;
      } catch (_) {}
      if (isLoggedIn) {
        headers["Authorization"] = "Bearer " + token;
      } else {
        if (this._fingerprint) {
          headers["X-Fingerprint"] = this._fingerprint;
        }
      }
      for (const events of batches) {
        const body = isLoggedIn
          ? { events }
          : { events, fingerprint: this._fingerprint };
        fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          keepalive: true,
        });
      }
    } catch (err) {
      console.warn("[UsageSync] Flush events on unload that bai:", err.message);
    }
  }
  _onAuthLogin() {
    console.log(
      "[UsageSync] User dang nhap \u2014 tiep tuc session voi context login",
    );
    setTimeout(() => {
      this._syncDailyStats();
    }, 5e3);
  }
  _onAuthLogout() {
    console.log(
      "[UsageSync] User dang xuat \u2014 tiep tuc session voi context anonymous",
    );
    this._flushEvents();
  }
  _onVisibilityChange() {
    if (!this._sessionId) return;
    if (document.visibilityState === "hidden") {
      if (this._heartbeatTimer) {
        clearInterval(this._heartbeatTimer);
        this._heartbeatTimer = null;
      }
      this._sendSessionEnd();
    } else if (document.visibilityState === "visible") {
      if (!this._heartbeatTimer) {
        this._sendHeartbeat();
        this._heartbeatTimer = setInterval(
          () => {
            this._sendHeartbeat();
          },
          5 * 60 * 1e3,
        );
      }
    }
  }
  _onBeforeUnload() {
    if (this._sessionId) {
      this._sendSessionEnd();
    }
    this._flushEventsOnUnload();
  }
  _isLoggedIn() {
    return window.authManager?.isLoggedIn() === true;
  }
  _getApiBaseUrl() {
    return window.ApiBaseConfig.get();
  }
  _getAuthToken() {
    return window.authManager?.getToken() || null;
  }
  async _apiCall(method, endpoint, data = null) {
    const isLoggedIn = this._isLoggedIn();
    if (isLoggedIn) {
      if (!window.authManager?._apiCall) {
        throw new Error("AuthManager chua san sang");
      }
      return window.authManager._apiCall(method, endpoint, data);
    }
    const fp = await this._getFingerprint();
    const extraHeaders = fp ? { "X-Fingerprint": fp } : {};
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: "apiRequest", method, endpoint, data, headers: extraHeaders },
        (resp) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (resp?.success) {
            resolve(resp.data || resp);
          } else {
            reject(new Error(resp?.error?.message || "Anonymous API error"));
          }
        },
      );
    });
  }
  _stopTimers() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
    if (this._syncTimer) {
      clearTimeout(this._syncTimer);
      this._syncTimer = null;
    }
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
    if (this._eventRetryTimer) {
      clearTimeout(this._eventRetryTimer);
      this._eventRetryTimer = null;
    }
  }
};
__publicField(_UsageSync, "EVENT_SCHEMAS", {
  gen_start: [
    "provider",
    "model",
    "ratio",
    "prompt_count",
    "has_ref",
    "pipeline",
  ],
  gen_complete: [
    "provider",
    "model",
    "ratio",
    "prompt_count",
    "success_count",
    "fail_count",
    "duration_ms",
  ],
  task_run_start: ["task_id", "provider", "prompt_count"],
  task_run_complete: [
    "task_id",
    "provider",
    "prompt_count",
    "success_count",
    "duration_ms",
  ],
  workflow_start: ["workflow_id", "node_count"],
  workflow_complete: ["workflow_id", "success"],
  workflow_run_start: ["workflow_id", "node_count", "parallel"],
  workflow_run_complete: [
    "workflow_id",
    "success_node_count",
    "failed_node_count",
    "duration_ms",
  ],
  angles_run: ["provider", "preset_id", "success"],
  effects_run: ["effect_id", "provider", "success"],
  chatgpt_run: ["ratio", "image_mode", "success"],
  grok_run: ["mode", "ratio", "success"],
  download: ["source", "media_type", "resolution"],
  login: ["method"],
  logout: [],
  template_use: ["template_id"],
  chat_send: ["model"],
  pa_generate: ["provider"],
  flow_api_lifecycle: [
    "lifecycle_event",
    "item_hash",
    "attempt_hash",
    "operation_hash",
    "media_hash",
    "project_hash",
    "job_hash",
    "driver",
    "page_driver",
    "mode",
    "surface",
    "media_type",
    "stage",
    "reason",
    "error_type",
    "state",
    "action",
    "trigger",
    "protocol_revision",
    "duration_ms",
    "output_count",
    "samples",
    "threshold",
    "minimum",
    "window_ms",
    "circuit_opened",
    "ready",
    "coalesced_callers",
    "from",
    "to",
    "expected",
    "completed",
    "failed",
    "downloaded",
    "prompts",
    "tasks",
    "prompt_index",
    "retry_count",
    "ambiguous",
    "declared_reference_count",
    "resolved_reference_count",
    "submitted_reference_count",
    "unresolved_reference_count",
    "deduplicated_reference_count",
    "dropped_by_limit_count",
  ],
});
let UsageSync = _UsageSync;
window.UsageSync = new UsageSync();
