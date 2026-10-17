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
  class RequestCoalescer {
    static get REQUEST_TIMEOUT() {
      return window.SystemConfig?.getTimeout("api_timeout_ms") || 3e4;
    }
    static init() {
      if (this._initialized) return;
      if (typeof BroadcastChannel === "undefined") {
        console.warn(
          "[RequestCoalescer] BroadcastChannel not supported, using direct mode",
        );
        this._initialized = true;
        return;
      }
      this._isLeader = this._detectIsLeader();
      try {
        this._channel = new BroadcastChannel(this.CHANNEL_NAME);
        this._channel.onmessage = (e) => this._handleMessage(e.data);
        this._initialized = true;
        if (this._isLeader) {
          console.log("[RequestCoalescer] Initialized as LEADER (sidePanel)");
        } else {
          console.log("[RequestCoalescer] Initialized as FOLLOWER (popup)");
        }
        window.addEventListener("beforeunload", () => this._cleanup());
        this._setupAuthListeners();
      } catch (err) {
        console.warn(
          "[RequestCoalescer] Failed to create channel:",
          err.message,
        );
        this._initialized = true;
      }
    }
    static _setupAuthListeners() {
      if (!window.eventBus) return;
      window.eventBus.on("auth:login", () => {
        console.log("[RequestCoalescer] Auth login - clearing cache");
        this.clearCache();
      });
      window.eventBus.on("auth:logout", () => {
        console.log("[RequestCoalescer] Auth logout - clearing cache");
        this.clearCache();
      });
    }
    static clearCache() {
      this._recentRequests.clear();
      for (const [id, pending] of this._pendingRequests) {
        clearTimeout(pending.timeout);
      }
      this._pendingRequests.clear();
    }
    static invalidate(endpointPattern, broadcast = true) {
      if (!endpointPattern) return 0;
      let count = 0;
      for (const key of Array.from(this._recentRequests.keys())) {
        if (key.includes(endpointPattern)) {
          this._recentRequests.delete(key);
          count++;
        }
      }
      if (count > 0) {
        console.log(
          "[RequestCoalescer] Invalidated",
          count,
          "cache entries for",
          endpointPattern,
        );
      }
      if (broadcast)
        this._broadcast({ type: this.MSG_INVALIDATE, endpointPattern });
      return count;
    }
    static _detectIsLeader() {
      const path = window.location.pathname;
      const isPopup =
        path.endsWith("workflow-editor.html") ||
        path.endsWith("angles-editor.html") ||
        path.endsWith("effects-editor.html") ||
        path.endsWith("settings.html");
      return !isPopup;
    }
    static async request(method, endpoint, data = null, options = {}) {
      if (!this._initialized) this.init();
      const skipCoalesce =
        options.skipCoalesce ||
        method !== "GET" ||
        endpoint.includes("execution/") ||
        endpoint.includes("auth/");
      if (skipCoalesce) {
        return this._directRequest(
          method,
          endpoint,
          data,
          options.extraHeaders,
        );
      }
      const cacheKey = this._getCacheKey(method, endpoint, data);
      const cached = this._recentRequests.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.DEDUP_WINDOW) {
        console.log("[RequestCoalescer] Dedup hit:", cacheKey);
        return cached.promise;
      }
      if (this._isLeader || !this._channel) {
        const promise2 = this._executeAndBroadcast(
          method,
          endpoint,
          data,
          options.extraHeaders,
        );
        this._recentRequests.set(cacheKey, {
          promise: promise2,
          timestamp: Date.now(),
        });
        this._cleanupCache();
        return promise2;
      }
      const promise = this._delegateToLeader(
        method,
        endpoint,
        data,
        options.extraHeaders,
      );
      this._recentRequests.set(cacheKey, { promise, timestamp: Date.now() });
      this._cleanupCache();
      return promise;
    }
    static _getCacheKey(method, endpoint, data) {
      return `${method}:${endpoint}:${data ? JSON.stringify(data) : ""}`;
    }
    static async _directRequest(method, endpoint, data, extraHeaders) {
      if (!window.authManager?._apiCall) {
        throw new Error("AuthManager not available");
      }
      return window.authManager._apiCall(
        method,
        endpoint,
        data,
        false,
        extraHeaders,
      );
    }
    static async _executeAndBroadcast(method, endpoint, data, extraHeaders) {
      try {
        const result = await this._directRequest(
          method,
          endpoint,
          data,
          extraHeaders,
        );
        this._broadcast({
          type: this.MSG_RESPONSE,
          endpoint,
          method,
          success: true,
          data: result,
          timestamp: Date.now(),
        });
        return result;
      } catch (err) {
        this._broadcast({
          type: this.MSG_RESPONSE,
          endpoint,
          method,
          success: false,
          error: {
            message: err.message,
            code: err.code,
            httpStatus: err.httpStatus,
          },
          timestamp: Date.now(),
        });
        throw err;
      }
    }
    static async _delegateToLeader(method, endpoint, data, extraHeaders) {
      const leaderAlive = await this._pingLeader();
      if (!leaderAlive) {
        console.log(
          "[RequestCoalescer] No leader response, falling back to direct call",
        );
        return this._directRequest(method, endpoint, data, extraHeaders);
      }
      const requestId = `req_${++this._requestIdCounter}_${Date.now()}`;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this._pendingRequests.delete(requestId);
          console.warn(
            "[RequestCoalescer] Request timeout, falling back to direct call",
          );
          this._directRequest(method, endpoint, data, extraHeaders)
            .then(resolve)
            .catch(reject);
        }, this.REQUEST_TIMEOUT);
        this._pendingRequests.set(requestId, {
          resolve,
          reject,
          timeout,
          endpoint,
          method,
        });
        this._broadcast({
          type: this.MSG_REQUEST,
          requestId,
          method,
          endpoint,
          data,
          extraHeaders,
          timestamp: Date.now(),
        });
      });
    }
    static _pingLeader() {
      return new Promise((resolve) => {
        if (!this._channel) {
          resolve(false);
          return;
        }
        const pingId = `ping_${Date.now()}`;
        let responded = false;
        const handler = (e) => {
          if (
            e.data?.type === this.MSG_LEADER_PONG &&
            e.data?.pingId === pingId
          ) {
            responded = true;
            this._channel.removeEventListener("message", handler);
            resolve(true);
          }
        };
        this._channel.addEventListener("message", handler);
        this._broadcast({ type: this.MSG_LEADER_PING, pingId });
        setTimeout(() => {
          if (!responded) {
            this._channel.removeEventListener("message", handler);
            resolve(false);
          }
        }, this.LEADER_TIMEOUT);
      });
    }
    static _handleMessage(msg) {
      if (!msg?.type) return;
      switch (msg.type) {
        case this.MSG_INVALIDATE:
          if (typeof msg.endpointPattern === "string" && msg.endpointPattern) {
            this.invalidate(msg.endpointPattern, false);
          }
          break;
        case this.MSG_LEADER_PING:
          if (this._isLeader) {
            this._broadcast({ type: this.MSG_LEADER_PONG, pingId: msg.pingId });
          }
          break;
        case this.MSG_REQUEST:
          if (this._isLeader) {
            this._handleFollowerRequest(msg);
          }
          break;
        case this.MSG_RESPONSE:
          if (!this._isLeader) {
            this._handleLeaderResponse(msg);
          }
          break;
      }
    }
    static async _handleFollowerRequest(msg) {
      const { requestId, method, endpoint, data, extraHeaders } = msg;
      try {
        const cacheKey = this._getCacheKey(method, endpoint, data);
        const cached = this._recentRequests.get(cacheKey);
        let result;
        if (cached && Date.now() - cached.timestamp < this.DEDUP_WINDOW) {
          console.log(
            "[RequestCoalescer] Leader dedup hit for follower request:",
            cacheKey,
          );
          result = await cached.promise;
        } else {
          const promise = this._directRequest(
            method,
            endpoint,
            data,
            extraHeaders,
          );
          this._recentRequests.set(cacheKey, {
            promise,
            timestamp: Date.now(),
          });
          this._cleanupCache();
          result = await promise;
        }
        this._broadcast({
          type: this.MSG_RESPONSE,
          requestId,
          endpoint,
          method,
          success: true,
          data: result,
          timestamp: Date.now(),
        });
      } catch (err) {
        this._broadcast({
          type: this.MSG_RESPONSE,
          requestId,
          endpoint,
          method,
          success: false,
          error: {
            message: err.message,
            code: err.code,
            httpStatus: err.httpStatus,
          },
          timestamp: Date.now(),
        });
      }
    }
    static _handleLeaderResponse(msg) {
      const { requestId, success, data, error } = msg;
      const pending = this._pendingRequests.get(requestId);
      if (!pending) {
        for (const [id, req] of this._pendingRequests) {
          if (req.endpoint === msg.endpoint && req.method === msg.method) {
            clearTimeout(req.timeout);
            this._pendingRequests.delete(id);
            if (success) {
              req.resolve(data);
            } else {
              const err = new Error(error?.message || "Request failed");
              err.code = error?.code;
              err.httpStatus = error?.httpStatus;
              req.reject(err);
            }
            return;
          }
        }
        return;
      }
      clearTimeout(pending.timeout);
      this._pendingRequests.delete(requestId);
      if (success) {
        pending.resolve(data);
      } else {
        const err = new Error(error?.message || "Request failed");
        err.code = error?.code;
        err.httpStatus = error?.httpStatus;
        pending.reject(err);
      }
    }
    static _broadcast(msg) {
      if (this._channel) {
        try {
          this._channel.postMessage(msg);
        } catch (err) {
          console.warn("[RequestCoalescer] Broadcast failed:", err.message);
        }
      }
    }
    static _cleanupCache() {
      const now = Date.now();
      for (const [key, entry] of this._recentRequests) {
        if (now - entry.timestamp > this.DEDUP_WINDOW * 2) {
          this._recentRequests.delete(key);
        }
      }
    }
    static _cleanup() {
      for (const [id, pending] of this._pendingRequests) {
        clearTimeout(pending.timeout);
      }
      this._pendingRequests.clear();
      this._recentRequests.clear();
      if (this._channel) {
        try {
          this._channel.close();
        } catch (_) {}
        this._channel = null;
      }
    }
    static isReady() {
      return this._initialized;
    }
    static isLeader() {
      return this._isLeader;
    }
  }
  __publicField(RequestCoalescer, "CHANNEL_NAME", "tobyflow-request-coalescer");
  __publicField(RequestCoalescer, "MSG_REQUEST", "api_request");
  __publicField(RequestCoalescer, "MSG_RESPONSE", "api_response");
  __publicField(RequestCoalescer, "MSG_LEADER_PING", "leader_ping");
  __publicField(RequestCoalescer, "MSG_LEADER_PONG", "leader_pong");
  __publicField(RequestCoalescer, "MSG_INVALIDATE", "cache_invalidate");
  __publicField(RequestCoalescer, "LEADER_TIMEOUT", 500);
  __publicField(RequestCoalescer, "DEDUP_WINDOW", 500);
  __publicField(RequestCoalescer, "_channel", null);
  __publicField(RequestCoalescer, "_isLeader", false);
  __publicField(RequestCoalescer, "_initialized", false);
  __publicField(RequestCoalescer, "_pendingRequests", new Map());
  __publicField(RequestCoalescer, "_recentRequests", new Map());
  __publicField(RequestCoalescer, "_requestIdCounter", 0);
  window.RequestCoalescer = RequestCoalescer;
})();
