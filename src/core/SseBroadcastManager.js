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
  class SseBroadcastManager {
    static get HEARTBEAT_INTERVAL() {
      return window.SystemConfig?.getTimeout("broadcast_heartbeat_ms") || 5e3;
    }
    static get LEADER_TIMEOUT() {
      return (
        window.SystemConfig?.getTimeout("broadcast_leader_timeout_ms") || 1e4
      );
    }
    static get ELECTION_DELAY() {
      return (
        window.SystemConfig?.getTimeout("broadcast_election_delay_ms") || 2e3
      );
    }
    static async init(userId) {
      if (this._initialized) return;
      if (!userId) {
        if (window.DEBUG)
          console.debug(
            "[SseBroadcast] Skip init (no userId yet, will retry on next connect)",
          );
        return;
      }
      const isSidepanel = window.location?.href?.includes("sidebar.html");
      console.log("[SseBroadcast] Context detection:", {
        href: window.location?.href,
        isSidepanel,
        hasBroadcastChannel: typeof BroadcastChannel !== "undefined",
      });
      if (isSidepanel) {
        console.log(
          "[SseBroadcast] Sidepanel detected, d\xF9ng chrome.storage cho leader election + BroadcastChannel cho event forwarding",
        );
        this._userId = userId;
        this._tabId = this._generateTabId();
        this._tabTimestamp = Date.now();
        this._initialized = true;
        this._useFallback = true;
        if (typeof BroadcastChannel !== "undefined") {
          const channelName2 = `${this.CHANNEL_PREFIX}${userId}`;
          try {
            this._channel = new BroadcastChannel(channelName2);
            this._channel.onmessage = (e) => this._handleMessage(e.data);
            console.log(
              "[SseBroadcast] BroadcastChannel created for event forwarding (sidepanel leader)",
            );
          } catch (err) {
            console.warn(
              "[SseBroadcast] BroadcastChannel creation failed in sidepanel:",
              err.message,
            );
          }
        }
        await this._initStorageBasedLeader(userId);
        return;
      }
      if (typeof BroadcastChannel === "undefined") {
        console.warn(
          "[SseBroadcast] BroadcastChannel kh\xF4ng \u0111\u01B0\u1EE3c h\u1ED7 tr\u1EE3, s\u1EED d\u1EE5ng fallback mode",
        );
        this._useFallback = true;
        this._role = this.ROLE_LEADER;
        this._initialized = true;
        return;
      }
      this._userId = userId;
      this._tabId = this._generateTabId();
      this._tabTimestamp = Date.now();
      const channelName = `${this.CHANNEL_PREFIX}${userId}`;
      try {
        this._channel = new BroadcastChannel(channelName);
        this._channel.onmessage = (e) => this._handleMessage(e.data);
      } catch (err) {
        console.warn(
          "[SseBroadcast] Kh\xF4ng th\u1EC3 t\u1EA1o BroadcastChannel, s\u1EED d\u1EE5ng fallback mode:",
          err.message,
        );
        this._useFallback = true;
        this._role = this.ROLE_LEADER;
        this._initialized = true;
        return;
      }
      this._initialized = true;
      this._useFallback = true;
      await this._initStorageBasedLeader(userId);
      window.addEventListener("beforeunload", () => this._cleanup());
      window.addEventListener("unload", () => this._cleanup());
      console.log(
        `[SseBroadcast] Initialized - tabId: ${this._tabId}, channel: ${channelName}, role: ${this._role}`,
      );
    }
    static async _initStorageBasedLeader(userId) {
      const leaderKey = `sse_leader_${userId}`;
      const heartbeatKey = `sse_leader_heartbeat_${userId}`;
      await new Promise((r) => setTimeout(r, Math.random() * 500));
      try {
        const stored = await chrome.storage.local.get([
          leaderKey,
          heartbeatKey,
        ]);
        const currentLeader = stored[leaderKey];
        const lastHeartbeat = stored[heartbeatKey] || 0;
        const now = Date.now();
        const leaderExpired = !currentLeader || now - lastHeartbeat > 15e3;
        if (leaderExpired) {
          await chrome.storage.local.set({
            [leaderKey]: this._tabId,
            [heartbeatKey]: now,
          });
          await new Promise((r) => setTimeout(r, 100));
          const verify = await chrome.storage.local.get([leaderKey]);
          if (verify[leaderKey] === this._tabId) {
            this._role = this.ROLE_LEADER;
            console.log(
              "[SseBroadcast] Storage-based: Claimed leader - tabId:",
              this._tabId,
            );
            this._startStorageHeartbeat(leaderKey, heartbeatKey);
          } else {
            this._role = this.ROLE_FOLLOWER;
            console.log(
              "[SseBroadcast] Storage-based: Lost race, follower mode",
            );
            this._startStorageLeaderCheck(leaderKey, heartbeatKey);
          }
        } else if (currentLeader === this._tabId) {
          this._role = this.ROLE_LEADER;
          this._startStorageHeartbeat(leaderKey, heartbeatKey);
        } else {
          this._role = this.ROLE_FOLLOWER;
          console.log(
            "[SseBroadcast] Storage-based: Follower mode (leader: " +
              currentLeader +
              ")",
          );
          this._startStorageLeaderCheck(leaderKey, heartbeatKey);
        }
      } catch (err) {
        console.warn(
          "[SseBroadcast] Storage-based leader election failed:",
          err.message,
        );
        this._role = this.ROLE_LEADER;
      }
      window.addEventListener("beforeunload", () =>
        this._cleanupStorageLeader(leaderKey, heartbeatKey),
      );
    }
    static _startStorageHeartbeat(leaderKey, heartbeatKey) {
      if (this._storageHeartbeatInterval)
        clearInterval(this._storageHeartbeatInterval);
      this._storageHeartbeatInterval = setInterval(async () => {
        if (this._role !== this.ROLE_LEADER) return;
        try {
          await chrome.storage.local.set({
            [leaderKey]: this._tabId,
            [heartbeatKey]: Date.now(),
          });
        } catch (e) {}
      }, 5e3);
    }
    static _startStorageLeaderCheck(leaderKey, heartbeatKey) {
      if (this._storageLeaderCheckInterval)
        clearInterval(this._storageLeaderCheckInterval);
      this._storageLeaderCheckInterval = setInterval(async () => {
        if (this._role === this.ROLE_LEADER) return;
        try {
          const stored = await chrome.storage.local.get([
            leaderKey,
            heartbeatKey,
          ]);
          const lastHeartbeat = stored[heartbeatKey] || 0;
          const now = Date.now();
          if (now - lastHeartbeat > 15e3) {
            await new Promise((r) => setTimeout(r, Math.random() * 500));
            const recheck = await chrome.storage.local.get([
              leaderKey,
              heartbeatKey,
            ]);
            const recheckHeartbeat = recheck[heartbeatKey] || 0;
            if (Date.now() - recheckHeartbeat <= 15e3) {
              return;
            }
            await chrome.storage.local.set({
              [leaderKey]: this._tabId,
              [heartbeatKey]: Date.now(),
            });
            await new Promise((r) => setTimeout(r, 100));
            const verify = await chrome.storage.local.get([leaderKey]);
            if (verify[leaderKey] !== this._tabId) {
              console.log(
                "[SseBroadcast] Leader claim race lost, staying follower (winner:",
                verify[leaderKey],
                ")",
              );
              return;
            }
            console.log(
              "[SseBroadcast] Leader expired, claimed leadership - tabId:",
              this._tabId,
            );
            this._role = this.ROLE_LEADER;
            this._startStorageHeartbeat(leaderKey, heartbeatKey);
            window.SseClient?.connect();
          }
        } catch (e) {}
      }, 5e3);
    }
    static async _cleanupStorageLeader(leaderKey, heartbeatKey) {
      if (this._storageHeartbeatInterval)
        clearInterval(this._storageHeartbeatInterval);
      if (this._storageLeaderCheckInterval)
        clearInterval(this._storageLeaderCheckInterval);
      if (this._role === this.ROLE_LEADER) {
        try {
          const stored = await chrome.storage.local.get([leaderKey]);
          if (stored[leaderKey] === this._tabId) {
            await chrome.storage.local.remove([leaderKey, heartbeatKey]);
          }
        } catch (e) {}
      }
    }
    static isInitialized() {
      return this._initialized;
    }
    static getRole() {
      if (this._role) return this._role;
      if (this._useFallback) return this.ROLE_LEADER;
      return this._role;
    }
    static isLeader() {
      return this.getRole() === this.ROLE_LEADER;
    }
    static forwardSseEvent(eventName, data) {
      if (!this.isLeader()) return;
      if (!this._channel) return;
      this._channel.postMessage({
        type: this.MSG_SSE_EVENT,
        payload: { eventName, data },
        from: this._tabId,
        timestamp: Date.now(),
      });
    }
    static broadcastSseStatus(status) {
      if (!this.isLeader()) return;
      if (!this._channel) return;
      this._channel.postMessage({
        type: this.MSG_SSE_STATUS,
        payload: { status },
        from: this._tabId,
        timestamp: Date.now(),
      });
    }
    static destroy() {
      this._cleanup();
      this._channel?.close();
      this._channel = null;
      this._role = null;
      this._tabId = null;
      this._userId = null;
      this._tabs.clear();
      this._initialized = false;
      this._useFallback = false;
      console.log("[SseBroadcast] Destroyed");
    }
    static _generateTabId() {
      return `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    static async _startElection() {
      this._broadcast({
        type: this.MSG_TAB_ANNOUNCE,
        tabId: this._tabId,
        timestamp: this._tabTimestamp,
      });
      return new Promise((resolve) => {
        this._electionResolve = resolve;
        this._electionTimer = setTimeout(() => {
          this._electionTimer = null;
          this._electionResolve = null;
          if (!this._role) {
            this._becomeLeader();
          }
          resolve();
        }, this.ELECTION_DELAY);
      });
    }
    static _becomeLeader() {
      if (this._role === this.ROLE_LEADER) {
        return;
      }
      const wasFollower = this._role === this.ROLE_FOLLOWER;
      this._role = this.ROLE_LEADER;
      if (this._leaderCheckInterval) {
        clearInterval(this._leaderCheckInterval);
        this._leaderCheckInterval = null;
      }
      this._startHeartbeat();
      this._broadcast({
        type: this.MSG_LEADER_CLAIM,
        tabId: this._tabId,
        timestamp: this._tabTimestamp,
      });
      console.log("[SseBroadcast] Became LEADER");
      window.eventBus?.emit("broadcast:became_leader");
      if (wasFollower) {
        window.eventBus?.emit("broadcast:role_changed", {
          role: this.ROLE_LEADER,
        });
      }
    }
    static _becomeFollower() {
      const wasLeader = this._role === this.ROLE_LEADER;
      this._role = this.ROLE_FOLLOWER;
      if (this._heartbeatInterval) {
        clearInterval(this._heartbeatInterval);
        this._heartbeatInterval = null;
      }
      if (this._electionTimer) {
        clearTimeout(this._electionTimer);
        this._electionTimer = null;
      }
      if (this._electionResolve) {
        const resolveFn = this._electionResolve;
        this._electionResolve = null;
        resolveFn();
      }
      this._startLeaderCheck();
      console.log("[SseBroadcast] Became FOLLOWER");
      window.eventBus?.emit("broadcast:became_follower");
      if (wasLeader) {
        window.eventBus?.emit("broadcast:role_changed", {
          role: this.ROLE_FOLLOWER,
        });
      }
    }
    static _startHeartbeat() {
      if (this._heartbeatInterval) return;
      this._heartbeatInterval = setInterval(() => {
        if (this._role !== this.ROLE_LEADER) return;
        this._broadcast({
          type: this.MSG_LEADER_HEARTBEAT,
          tabId: this._tabId,
          timestamp: Date.now(),
        });
      }, this.HEARTBEAT_INTERVAL);
      this._broadcast({
        type: this.MSG_LEADER_HEARTBEAT,
        tabId: this._tabId,
        timestamp: Date.now(),
      });
    }
    static _startLeaderCheck() {
      if (this._leaderCheckInterval) return;
      this._lastLeaderHeartbeat = Date.now();
      this._leaderCheckInterval = setInterval(() => {
        if (this._role !== this.ROLE_FOLLOWER) return;
        const timeSinceHeartbeat = Date.now() - this._lastLeaderHeartbeat;
        if (timeSinceHeartbeat > this.LEADER_TIMEOUT) {
          console.log("[SseBroadcast] Leader timeout, starting re-election");
          this._requestNewLeader();
        }
      }, this.HEARTBEAT_INTERVAL);
    }
    static _requestNewLeader() {
      if (this._leaderCheckInterval) {
        clearInterval(this._leaderCheckInterval);
        this._leaderCheckInterval = null;
      }
      this._broadcast({
        type: this.MSG_REQUEST_LEADER,
        tabId: this._tabId,
        timestamp: this._tabTimestamp,
      });
      setTimeout(() => {
        this._electLeader();
      }, this.ELECTION_DELAY);
    }
    static _electLeader() {
      let oldestTab = { tabId: this._tabId, timestamp: this._tabTimestamp };
      for (const [tabId, info] of this._tabs) {
        if (
          info.timestamp < oldestTab.timestamp ||
          (info.timestamp === oldestTab.timestamp && tabId < oldestTab.tabId)
        ) {
          oldestTab = { tabId, timestamp: info.timestamp };
        }
      }
      if (oldestTab.tabId === this._tabId) {
        this._becomeLeader();
      } else {
        this._becomeFollower();
      }
    }
    static _handleMessage(msg) {
      if (!msg || !msg.type) return;
      if (msg.from === this._tabId) return;
      switch (msg.type) {
        case this.MSG_TAB_ANNOUNCE:
          this._handleTabAnnounce(msg);
          break;
        case this.MSG_TAB_LEAVE:
          this._handleTabLeave(msg);
          break;
        case this.MSG_LEADER_HEARTBEAT:
          this._handleLeaderHeartbeat(msg);
          break;
        case this.MSG_LEADER_CLAIM:
          this._handleLeaderClaim(msg);
          break;
        case this.MSG_LEADER_RESIGN:
          this._handleLeaderResign(msg);
          break;
        case this.MSG_SSE_EVENT:
          this._handleSseEvent(msg);
          break;
        case this.MSG_REQUEST_LEADER:
          this._handleRequestLeader(msg);
          break;
        case this.MSG_SSE_STATUS:
          this._handleSseStatus(msg);
          break;
      }
    }
    static _handleTabAnnounce(msg) {
      this._tabs.set(msg.tabId, {
        timestamp: msg.timestamp,
        lastSeen: Date.now(),
      });
      if (this._role === this.ROLE_LEADER) {
        this._broadcast({
          type: this.MSG_LEADER_HEARTBEAT,
          tabId: this._tabId,
          timestamp: Date.now(),
        });
      }
    }
    static _handleTabLeave(msg) {
      this._tabs.delete(msg.tabId);
    }
    static _handleLeaderHeartbeat(msg) {
      this._lastLeaderHeartbeat = Date.now();
      if (this._electionTimer) {
        clearTimeout(this._electionTimer);
        this._electionTimer = null;
        this._becomeFollower();
      }
      this._tabs.set(msg.tabId, {
        timestamp: msg.timestamp,
        role: this.ROLE_LEADER,
        lastSeen: Date.now(),
      });
    }
    static _handleLeaderClaim(msg) {
      if (this._role === this.ROLE_LEADER) {
        if (
          msg.timestamp < this._tabTimestamp ||
          (msg.timestamp === this._tabTimestamp && msg.tabId < this._tabId)
        ) {
          this._becomeFollower();
        }
      } else {
        this._lastLeaderHeartbeat = Date.now();
        if (!this._role) {
          this._becomeFollower();
        }
      }
    }
    static _handleLeaderResign(msg) {
      this._tabs.delete(msg.tabId);
      if (this._role === this.ROLE_FOLLOWER) {
        this._requestNewLeader();
      }
    }
    static _handleSseEvent(msg) {
      if (this._role !== this.ROLE_FOLLOWER) return;
      const { eventName, data } = msg.payload || {};
      if (!eventName) return;
      console.log("[SseBroadcast] Received forwarded SSE event:", eventName);
      try {
        window.eventBus?.emit(`sse:${eventName}`, data);
        this._handleForwardedNotificationEvents(eventName, data);
        if (window.SseClient?._handleConfigEvents) {
          window.SseClient._handleConfigEvents(eventName, data);
        }
        if (window.SseClient?._handleProviderConfigEvents) {
          window.SseClient._handleProviderConfigEvents(eventName, data);
        }
      } catch (err) {
        console.warn(
          "[SseBroadcast] Error emitting event:",
          eventName,
          err.message,
        );
      }
    }
    static _handleForwardedNotificationEvents(eventName, data) {
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
          "[SseBroadcast] Error in notification handler:",
          eventName,
          err.message,
        );
      }
    }
    static _handleRequestLeader(msg) {
      this._tabs.set(msg.tabId, {
        timestamp: msg.timestamp,
        lastSeen: Date.now(),
      });
      if (this._role === this.ROLE_LEADER) {
        this._broadcast({
          type: this.MSG_LEADER_HEARTBEAT,
          tabId: this._tabId,
          timestamp: Date.now(),
        });
      }
    }
    static _handleSseStatus(msg) {
      if (this._role !== this.ROLE_FOLLOWER) return;
      const { status } = msg.payload || {};
      if (!status) return;
      console.log("[SseBroadcast] Received SSE status from leader:", status);
      if (status === "connected") {
        window.eventBus?.emit("sse:connected");
      } else if (status === "disconnected") {
        window.eventBus?.emit("sse:disconnected");
      } else if (status === "connecting") {
        window.eventBus?.emit("sse:connecting");
      }
    }
    static _broadcast(msg) {
      if (!this._channel) return;
      try {
        this._channel.postMessage({ ...msg, from: this._tabId });
      } catch (err) {
        console.warn("[SseBroadcast] Broadcast error:", err.message);
      }
    }
    static _cleanup() {
      if (this._heartbeatInterval) {
        clearInterval(this._heartbeatInterval);
        this._heartbeatInterval = null;
      }
      if (this._leaderCheckInterval) {
        clearInterval(this._leaderCheckInterval);
        this._leaderCheckInterval = null;
      }
      if (this._electionTimer) {
        clearTimeout(this._electionTimer);
        this._electionTimer = null;
      }
      if (this._storageHeartbeatInterval) {
        clearInterval(this._storageHeartbeatInterval);
        this._storageHeartbeatInterval = null;
      }
      if (this._storageLeaderCheckInterval) {
        clearInterval(this._storageLeaderCheckInterval);
        this._storageLeaderCheckInterval = null;
      }
      if (this._channel) {
        if (this._role === this.ROLE_LEADER) {
          this._broadcast({ type: this.MSG_LEADER_RESIGN, tabId: this._tabId });
        } else {
          this._broadcast({ type: this.MSG_TAB_LEAVE, tabId: this._tabId });
        }
      }
    }
  }
  __publicField(SseBroadcastManager, "CHANNEL_PREFIX", "tobyflow-sse-");
  __publicField(SseBroadcastManager, "ROLE_LEADER", "leader");
  __publicField(SseBroadcastManager, "ROLE_FOLLOWER", "follower");
  __publicField(SseBroadcastManager, "MSG_TAB_ANNOUNCE", "tab_announce");
  __publicField(SseBroadcastManager, "MSG_TAB_LEAVE", "tab_leave");
  __publicField(
    SseBroadcastManager,
    "MSG_LEADER_HEARTBEAT",
    "leader_heartbeat",
  );
  __publicField(SseBroadcastManager, "MSG_LEADER_RESIGN", "leader_resign");
  __publicField(SseBroadcastManager, "MSG_SSE_EVENT", "sse_event");
  __publicField(SseBroadcastManager, "MSG_REQUEST_LEADER", "request_leader");
  __publicField(SseBroadcastManager, "MSG_LEADER_CLAIM", "leader_claim");
  __publicField(SseBroadcastManager, "MSG_SSE_STATUS", "sse_status");
  __publicField(SseBroadcastManager, "_channel", null);
  __publicField(SseBroadcastManager, "_role", null);
  __publicField(SseBroadcastManager, "_tabId", null);
  __publicField(SseBroadcastManager, "_userId", null);
  __publicField(SseBroadcastManager, "_tabTimestamp", null);
  __publicField(SseBroadcastManager, "_tabs", new Map());
  __publicField(SseBroadcastManager, "_heartbeatInterval", null);
  __publicField(SseBroadcastManager, "_leaderCheckInterval", null);
  __publicField(SseBroadcastManager, "_electionTimer", null);
  __publicField(SseBroadcastManager, "_lastLeaderHeartbeat", null);
  __publicField(SseBroadcastManager, "_initialized", false);
  __publicField(SseBroadcastManager, "_useFallback", false);
  __publicField(SseBroadcastManager, "_storageHeartbeatInterval", null);
  __publicField(SseBroadcastManager, "_storageLeaderCheckInterval", null);
  window.SseBroadcastManager = SseBroadcastManager;
})();
