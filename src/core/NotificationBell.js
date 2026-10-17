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
const _NotificationBell = class _NotificationBell {
  constructor() {
    this.unreadCount = 0;
    this.panel = null;
    this.element = null;
    this.pollInterval = null;
    this.pollIntervalMs = 9e4;
    this._boundHandleSSE = null;
    this._boundHandleCountUpdated = null;
    this._boundHandleLeaderChange = null;
    this._fetchDebounceTimer = null;
    this._lastFetchTime = 0;
    this._renewalCheckedCount = null;
    this._renewalFetch = null;
    this._renewalPending = null;
    this._activeRenewalModal = null;
    this._renewalSeen = new Set();
    this._renewalObserver = null;
    this._authEpoch = 0;
    this._boundRenewalVisibility = () => this._tryShowRenewal();
    this._boundAuthLogin = null;
    this._boundAuthLogout = null;
  }
  static getInstance() {
    if (!_NotificationBell.instance) {
      _NotificationBell.instance = new _NotificationBell();
    }
    return _NotificationBell.instance;
  }
  init(container) {
    if (!container) {
      console.warn("[NotificationBell] Container kh\xF4ng t\u1ED3n t\u1EA1i");
      return;
    }
    if (this.element) {
      console.log(
        "[NotificationBell] \u0110\xE3 \u0111\u01B0\u1EE3c kh\u1EDFi t\u1EA1o, skip",
      );
      return;
    }
    this.element = document.createElement("div");
    this.element.className = "notification-bell";
    this.element.innerHTML = this.render();
    container.appendChild(this.element);
    this._bindEvents();
    if (window.NotificationPanel && !this.panel) {
      this.panel = new window.NotificationPanel();
    }
    this._listenSSE();
    document.addEventListener("visibilitychange", this._boundRenewalVisibility);
    this.fetchUnreadCount();
    setTimeout(() => {
      if (!this.pollInterval) {
        this._startPolling();
      }
    }, 2e3);
    this._injectStyles();
    console.log("[NotificationBell] \u0110\xE3 kh\u1EDFi t\u1EA1o");
  }
  render() {
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    return `
      <button class="notification-bell-btn tobyflow-header-btn" type="button"
              title="${t("notification.bell.title", "Notifications")}"
              aria-label="${t("notification.bell.title", "Notifications")}">
        <svg class="notification-bell-icon" width="18" height="18" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
        </svg>
        <span class="notification-bell-badge hidden" id="notificationBadge">0</span>
      </button>
    `;
  }
  _bindEvents() {
    const btn = this.element?.querySelector(".notification-bell-btn");
    if (btn) {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.togglePanel();
      });
    }
    document.addEventListener("click", (e) => {
      if (
        this.panel?.isOpen &&
        !e.target.closest(".notification-bell") &&
        !e.target.closest(".notification-panel-overlay")
      ) {
        this.panel.close();
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.panel?.isOpen) {
        this.panel.close();
      }
    });
  }
  updateBadge(count) {
    this.unreadCount = count;
    if (Number(count) === 0) {
      this._renewalPending = null;
      this._renewalObserver?.disconnect();
      this._renewalObserver = null;
      this._renewalFetch = null;
      this._renewalCheckedCount = 0;
    }
    const badge = this.element?.querySelector("#notificationBadge");
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 99 ? "99+" : count;
      badge.classList.remove("hidden");
      badge.classList.add("notification-badge-bounce");
      setTimeout(
        () => badge.classList.remove("notification-badge-bounce"),
        300,
      );
    } else {
      badge.classList.add("hidden");
    }
  }
  async fetchUnreadCount(force = false) {
    if (!window.authManager?.isLoggedIn()) {
      this.updateBadge(0);
      return;
    }
    const now = Date.now();
    const DEBOUNCE_MS = 5e3;
    if (
      !force &&
      this._lastFetchTime &&
      now - this._lastFetchTime < DEBOUNCE_MS
    ) {
      console.log("[NotificationBell] fetchUnreadCount debounced, skip");
      return;
    }
    this._lastFetchTime = now;
    const token = window.authManager?.token;
    const epoch = this._authEpoch;
    try {
      const resp = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            action: "apiRequest",
            method: "GET",
            endpoint: "notifications/unread-count",
            token: window.authManager?.token,
          },
          resolve,
        );
      });
      if (chrome.runtime.lastError) {
        return;
      }
      if (
        epoch !== this._authEpoch ||
        token !== window.authManager?.token ||
        !window.authManager?.isLoggedIn()
      )
        return;
      if (resp?.success && resp?.data !== void 0) {
        const apiData = resp.data?.data || resp.data || {};
        const count =
          typeof apiData === "number"
            ? apiData
            : (apiData.count ?? apiData.unread_count ?? 0);
        this.updateBadge(count);
        if (count > 0 && this._renewalCheckedCount !== count)
          this._fetchRenewalReminder(count);
      }
    } catch (err) {
      console.error("[NotificationBell] fetchUnreadCount error:", err);
    }
  }
  _isRenewal(notification) {
    if (
      !notification?.id ||
      notification.read_at ||
      !["account_expiring", "renewal_reminder"].includes(notification.type)
    )
      return false;
    const data = notification.data || {};
    if (data.product_slug && data.product_slug !== "tobyflow") return false;
    const notifiedExpiry = Date.parse(data.expires_at ?? data.expiry_date);
    const currentExpiry = Date.parse(
      window.authManager?.getUser?.()?.plan_expires_at,
    );
    return !(
      Number.isFinite(notifiedExpiry) &&
      Number.isFinite(currentExpiry) &&
      currentExpiry > notifiedExpiry
    );
  }
  _queueRenewal(notification) {
    if (
      this._activeRenewalModal ||
      !this._isRenewal(notification) ||
      this._renewalSeen.has(String(notification.id))
    )
      return;
    if (!this._renewalPending) this._renewalPending = notification;
    this._tryShowRenewal();
  }
  _tryShowRenewal() {
    if (
      !this._renewalPending ||
      !this.element ||
      !window.authManager?.isLoggedIn()
    )
      return;
    if (document.visibilityState === "hidden") {
      this._renewalObserver?.disconnect();
      this._renewalObserver = null;
      return;
    }
    const blocked =
      window.NotificationModal?._instance ||
      ["upgradeOverlay", "loginOverlay", "onboardingOverlay"].some((id) => {
        const overlay = document.getElementById(id);
        return overlay && !overlay.classList.contains("hidden");
      });
    if (blocked || !window.NotificationModal) {
      if (!this._renewalObserver) {
        this._renewalObserver = new MutationObserver(() =>
          this._tryShowRenewal(),
        );
        this._renewalObserver.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["class"],
        });
      }
      return;
    }
    this._renewalObserver?.disconnect();
    this._renewalObserver = null;
    const notification = this._renewalPending;
    this._renewalPending = null;
    if (!this._isRenewal(notification)) return;
    this._renewalSeen.add(String(notification.id));
    if (this._renewalSeen.size > 100)
      this._renewalSeen.delete(this._renewalSeen.values().next().value);
    const epoch = this._authEpoch;
    const shown = window.NotificationModal.show(notification);
    const modal = (this._activeRenewalModal =
      window.NotificationModal._instance);
    shown
      .catch((err) => {
        if (epoch !== this._authEpoch) return;
        this._renewalSeen.delete(String(notification.id));
        this._renewalCheckedCount = null;
        console.warn("[NotificationBell] Renewal modal failed:", err.message);
      })
      .finally(() => {
        if (this._activeRenewalModal === modal) this._activeRenewalModal = null;
      });
  }
  async _fetchRenewalReminder(count) {
    if (this._renewalFetch) return;
    const epoch = this._authEpoch;
    const token = window.authManager?.token;
    const flight = (this._renewalFetch = {});
    try {
      let lastPage = 1;
      for (let page = 1; page <= lastPage; page++) {
        const resp = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            {
              action: "apiRequest",
              method: "GET",
              endpoint: `notifications?page=${page}&per_page=50`,
              token,
            },
            (response) => {
              if (chrome.runtime.lastError)
                reject(new Error(chrome.runtime.lastError.message));
              else resolve(response);
            },
          );
        });
        if (
          this._renewalFetch !== flight ||
          epoch !== this._authEpoch ||
          token !== window.authManager?.token ||
          !window.authManager?.isLoggedIn()
        )
          return;
        if (!resp?.success || resp.data?.success === false)
          throw new Error("Notification request failed");
        const data = resp.data?.data || resp.data || {};
        if (!Array.isArray(data.notifications))
          throw new Error("Invalid notification list");
        if (page === 1) {
          const meta = resp.data?.meta || resp.meta || data.meta;
          if (Number.isSafeInteger(meta?.last_page) && meta.last_page > 0)
            lastPage = meta.last_page;
        }
        const reminder = data.notifications.find(
          (n) => this._isRenewal(n) && !this._renewalSeen.has(String(n.id)),
        );
        if (reminder) {
          this._queueRenewal(reminder);
          break;
        }
        if (data.notifications.length === 0) break;
      }
      this._renewalCheckedCount = count;
    } catch (err) {
      console.warn("[NotificationBell] Renewal lookup failed:", err.message);
    } finally {
      if (this._renewalFetch === flight) this._renewalFetch = null;
    }
  }
  _resetRenewal() {
    this._authEpoch++;
    if (
      this._activeRenewalModal &&
      window.NotificationModal?._instance === this._activeRenewalModal
    )
      window.NotificationModal._close();
    this._activeRenewalModal = null;
    this._renewalObserver?.disconnect();
    this._renewalObserver = null;
    this._renewalPending = null;
    this._renewalFetch = null;
    this._renewalCheckedCount = null;
    this._renewalSeen.clear();
    this._lastFetchTime = 0;
  }
  togglePanel() {
    if (!this.panel) {
      if (window.NotificationPanel) {
        this.panel = new window.NotificationPanel();
      } else {
        console.warn(
          "[NotificationBell] NotificationPanel ch\u01B0a s\u1EB5n s\xE0ng",
        );
        return;
      }
    }
    this.panel.toggle();
  }
  _listenSSE() {
    if (!window.eventBus) return;
    this._boundHandleSSE = (data) => {
      console.log("[NotificationBell] SSE: notification.new", data);
      this.updateBadge(this.unreadCount + 1);
      try {
        const notif = data?.notification || data;
        if (notif) this._queueRenewal(notif);
        if (notif && (notif.title || notif.body)) {
          window.NotificationManager?.notifyServerNotification(notif);
          if (
            ![
              "workflow_shared",
              "account_expiring",
              "renewal_reminder",
            ].includes(notif.type)
          ) {
            const msg = notif.title
              ? notif.body
                ? `${notif.title} \u2014 ${notif.body}`
                : notif.title
              : notif.body;
            if (msg) window.showNotification?.(msg, "info", 6e3);
          }
        }
      } catch (e) {}
      if (this.panel?.isOpen) {
        this.panel.fetchNotifications();
      }
    };
    window.eventBus.on("notification:new", this._boundHandleSSE);
    this._boundHandleCountUpdated = (data) => {
      console.log("[NotificationBell] SSE: notification:count_updated", data);
      const count =
        typeof data === "number"
          ? data
          : (data?.count ?? data?.unread_count ?? 0);
      this.updateBadge(count);
      if (count > 0 && this._renewalCheckedCount !== count)
        this._fetchRenewalReminder(count);
    };
    window.eventBus.on(
      "notification:count_updated",
      this._boundHandleCountUpdated,
    );
    this._boundAuthLogin = () => {
      this._resetRenewal();
      this.fetchUnreadCount();
    };
    window.eventBus.on("auth:login", this._boundAuthLogin);
    this._boundAuthLogout = () => {
      this._resetRenewal();
      this.updateBadge(0);
      this._stopPolling();
      if (this.panel?.isOpen) {
        this.panel.close();
      }
    };
    window.eventBus.on("auth:logout", this._boundAuthLogout);
    this._boundHandleLeaderChange = () => {
      console.log("[NotificationBell] Became leader, starting polling");
      this.fetchUnreadCount();
      this._startPolling();
    };
    window.eventBus.on(
      "broadcast:became_leader",
      this._boundHandleLeaderChange,
    );
    window.eventBus.on("broadcast:became_follower", () => {
      console.log("[NotificationBell] Became follower, stopping polling");
      this._stopPolling();
    });
  }
  _startPolling() {
    this._stopPolling();
    if (!window.authManager?.isLoggedIn()) return;
    if (
      window.SseBroadcastManager?.isInitialized() &&
      !window.SseBroadcastManager.isLeader()
    ) {
      console.log(
        "[NotificationBell] Follower mode - skip polling, nh\u1EADn count qua BroadcastChannel",
      );
      return;
    }
    this.pollInterval = setInterval(() => {
      if (
        window.SseBroadcastManager?.isInitialized() &&
        !window.SseBroadcastManager.isLeader()
      ) {
        this._stopPolling();
        return;
      }
      this.fetchUnreadCount();
    }, this.pollIntervalMs);
  }
  _stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
  _injectStyles() {
    if (document.getElementById("notification-bell-styles")) return;
    const style = document.createElement("style");
    style.id = "notification-bell-styles";
    style.textContent = `
      /* NotificationBell Styles */
      .notification-bell {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .notification-bell-btn {
        position: relative;
        /* Inherit af-header-btn styles, just override what's needed */
      }

      .notification-bell-icon {
        width: 16px;
        height: 16px;
        stroke: currentColor;
      }

      .notification-bell-badge {
        position: absolute;
        top: 0px;
        right: 0px;
        min-width: 14px;
        height: 14px;
        padding: 0 4px;
        border-radius: 7px;
        background: #ef4444;
        color: #fff;
        font-size: 9px;
        font-weight: 600;
        line-height: 14px;
        text-align: center;
        box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3);
        pointer-events: none;
        transform-origin: center;
      }

      .notification-bell-badge.hidden {
        display: none;
      }

      @keyframes notification-badge-bounce {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.2); }
      }

      .notification-badge-bounce {
        animation: notification-badge-bounce 0.3s ease;
      }

      /* Dark mode */
      [data-theme="dark"] .notification-bell-btn,
      .dark .notification-bell-btn {
        color: var(--foreground, #e5e5e5);
      }

      [data-theme="dark"] .notification-bell-btn:hover,
      .dark .notification-bell-btn:hover {
        background: var(--muted, rgba(255, 255, 255, 0.1));
      }
    `;
    document.head.appendChild(style);
  }
  destroy() {
    this._resetRenewal();
    document.removeEventListener(
      "visibilitychange",
      this._boundRenewalVisibility,
    );
    this._stopPolling();
    if (this._fetchDebounceTimer) {
      clearTimeout(this._fetchDebounceTimer);
      this._fetchDebounceTimer = null;
    }
    if (window.eventBus) {
      if (this._boundHandleSSE) {
        window.eventBus.off("notification:new", this._boundHandleSSE);
      }
      if (this._boundHandleCountUpdated) {
        window.eventBus.off(
          "notification:count_updated",
          this._boundHandleCountUpdated,
        );
      }
      if (this._boundHandleLeaderChange) {
        window.eventBus.off(
          "broadcast:became_leader",
          this._boundHandleLeaderChange,
        );
      }
      if (this._boundAuthLogin)
        window.eventBus.off("auth:login", this._boundAuthLogin);
      if (this._boundAuthLogout)
        window.eventBus.off("auth:logout", this._boundAuthLogout);
    }
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
    if (this.panel) {
      this.panel.close();
      this.panel = null;
    }
    _NotificationBell.instance = null;
    console.log("[NotificationBell] \u0110\xE3 destroy");
  }
};
__publicField(_NotificationBell, "instance", null);
let NotificationBell = _NotificationBell;
window.NotificationBell = NotificationBell;
