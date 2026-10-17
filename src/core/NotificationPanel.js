class NotificationPanel {
  constructor() {
    this.isOpen = false;
    this.notifications = [];
    this.element = null;
    this.loading = false;
    this.page = 1;
    this.hasMore = true;
    this._scrollHandler = null;
  }
  async toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      await this.open();
    }
  }
  async open() {
    if (this.isOpen) return;
    this.notifications = [];
    this.page = 1;
    this.hasMore = true;
    this._createPanel();
    requestAnimationFrame(() => {
      this.element?.classList.add("visible");
    });
    this.isOpen = true;
    await this.fetchNotifications();
    this._bindScrollHandler();
  }
  close() {
    if (!this.isOpen) return;
    this.element?.classList.remove("visible");
    setTimeout(() => {
      this.element?.remove();
      this.element = null;
    }, 300);
    this.isOpen = false;
    if (this._scrollHandler) {
      this.element
        ?.querySelector(".notification-panel-body")
        ?.removeEventListener("scroll", this._scrollHandler);
      this._scrollHandler = null;
    }
  }
  _createPanel() {
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    document.querySelector(".notification-panel-overlay")?.remove();
    this.element = document.createElement("div");
    this.element.className = "notification-panel-overlay";
    this.element.innerHTML = `
      <div class="notification-panel-dialog">
        <div class="notification-panel-header">
          <h3>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
            </svg>
            ${t("notification.panel.title", "Notifications")}
          </h3>
          <div class="notification-panel-actions">
            <button class="notification-panel-mark-all" type="button"
                    title="${t("notification.panel.markAllRead", "Mark all as read")}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 11 12 14 22 4"/>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
            </button>
            <button class="notification-panel-close" type="button"
                    title="${t("common.close", "Close")}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
        <div class="notification-panel-body" id="notificationPanelBody">
          <div class="notification-panel-loading">
            <svg class="spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
              <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
            </svg>
            <span>${t("notification.panel.loading", "Loading...")}</span>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(this.element);
    this._bindEvents();
    this._injectStyles();
  }
  _bindEvents() {
    const closeBtn = this.element?.querySelector(".notification-panel-close");
    closeBtn?.addEventListener("click", () => this.close());
    this.element?.addEventListener("click", (e) => {
      if (e.target === this.element) {
        this.close();
      }
    });
    const markAllBtn = this.element?.querySelector(
      ".notification-panel-mark-all",
    );
    markAllBtn?.addEventListener("click", () => this.markAllAsRead());
    ["mousedown", "mouseup", "pointerdown", "pointerup"].forEach((evt) => {
      this.element?.addEventListener(evt, (e) => e.stopPropagation());
    });
  }
  _bindScrollHandler() {
    const body = this.element?.querySelector(".notification-panel-body");
    if (!body) return;
    this._scrollHandler = () => {
      if (this.loading || !this.hasMore) return;
      const { scrollTop, scrollHeight, clientHeight } = body;
      if (scrollTop + clientHeight >= scrollHeight - 100) {
        this._loadMore();
      }
    };
    body.addEventListener("scroll", this._scrollHandler);
  }
  async fetchNotifications() {
    console.log(
      "[NotificationPanel] fetchNotifications called, page:",
      this.page,
    );
    console.log(
      "[NotificationPanel] isLoggedIn:",
      window.authManager?.isLoggedIn(),
    );
    if (!window.authManager?.isLoggedIn()) {
      console.log("[NotificationPanel] Not logged in, showing empty");
      this._renderEmpty();
      return;
    }
    this.loading = true;
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            action: "apiRequest",
            method: "GET",
            endpoint: `notifications?page=${this.page}&per_page=20`,
            token: window.authManager?.token,
          },
          (resp) => {
            if (chrome.runtime.lastError) {
              console.error(
                "[NotificationPanel] Chrome error:",
                chrome.runtime.lastError,
              );
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (resp?.success) {
              resolve(resp);
            } else {
              console.error("[NotificationPanel] API error:", resp?.error);
              reject(
                new Error(
                  resp?.error?.message || "Failed to load notifications",
                ),
              );
            }
          },
        );
      });
      const apiData = response.data?.data || response.data || {};
      const items = apiData.notifications || [];
      const meta = response.data?.meta || response.meta || apiData.meta;
      console.log("[NotificationPanel] Items:", items.length, "Meta:", meta);
      if (this.page === 1) {
        this.notifications = items;
      } else {
        this.notifications = [...this.notifications, ...items];
      }
      this.hasMore =
        meta?.has_more ?? (meta ? meta.current_page < meta.last_page : false);
      console.log("[NotificationPanel] hasMore:", this.hasMore);
      this._renderList();
    } catch (err) {
      console.error("[NotificationPanel] Fetch error:", err.message);
      if (this.page === 1) {
        this._renderEmpty();
      }
    } finally {
      this.loading = false;
    }
  }
  async _loadMore() {
    if (this.loading || !this.hasMore) return;
    this.page++;
    const body = this.element?.querySelector(".notification-panel-body");
    const loadingMore = document.createElement("div");
    loadingMore.className = "notification-panel-loading-more";
    loadingMore.innerHTML = `
      <svg class="spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
        <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
      </svg>
    `;
    body?.appendChild(loadingMore);
    await this.fetchNotifications();
    loadingMore.remove();
  }
  _renderList() {
    const body = this.element?.querySelector(".notification-panel-body");
    if (!body) return;
    if (this.notifications.length === 0) {
      this._renderEmpty();
      return;
    }
    body.innerHTML = this.notifications
      .map((n) => this._renderItem(n))
      .join("");
    body.querySelectorAll(".notification-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        const id = item.dataset.id;
        const notification = this.notifications.find(
          (n) => String(n.id) === id,
        );
        if (notification) {
          this._handleItemClick(notification);
        }
      });
    });
  }
  _renderItem(notification) {
    const isUnread = !notification.read_at;
    const icon = this._getIcon(notification.type);
    const time = this._formatTime(notification.created_at);
    const title = this._escapeHtml(
      notification.title || notification.data?.title || "Notification",
    );
    const message = this._escapeHtml(
      notification.body ||
        notification.message ||
        notification.data?.message ||
        "",
    );
    return `
      <div class="notification-item ${isUnread ? "unread" : ""}"
           data-id="${notification.id}"
           data-type="${notification.type}">
        <div class="notification-item-icon ${notification.type}">
          ${icon}
        </div>
        <div class="notification-item-content">
          <div class="notification-item-title">${title}</div>
          ${message ? `<div class="notification-item-message">${message}</div>` : ""}
          <div class="notification-item-time">${time}</div>
        </div>
        ${isUnread ? '<div class="notification-item-dot"></div>' : ""}
      </div>
    `;
  }
  _getIcon(type) {
    switch (type) {
      case "workflow_shared":
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
          <polyline points="16 6 12 2 8 6"/>
          <line x1="12" y1="2" x2="12" y2="15"/>
        </svg>`;
      case "account_expiring":
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>`;
      case "feature_announcement":
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m3 11 18-5v12L3 14v-3z"/>
          <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>
        </svg>`;
      case "system":
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>`;
      case "payment":
      case "order_paid":
      case "order_failed":
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
          <line x1="1" y1="10" x2="23" y2="10"/>
        </svg>`;
      case "order_admin_notify":
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>`;
      case "affiliate_commission":
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="1" x2="12" y2="23"/>
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>`;
      case "creator_template_reviewed":
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/>
        </svg>`;
      default:
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
        </svg>`;
    }
  }
  _formatTime(dateStr) {
    if (!dateStr) return "";
    const normalized =
      typeof dateStr === "string" && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(dateStr)
        ? dateStr.replace(" ", "T") + "Z"
        : dateStr;
    const date = new Date(normalized);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1e3);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    if (diffSec < 60) {
      return t("notification.time.justNow", "Just now");
    } else if (diffMin < 60) {
      return `${diffMin} ${t("notification.time.minutesAgo", "minutes ago")}`;
    } else if (diffHour < 24) {
      return `${diffHour} ${t("notification.time.hoursAgo", "hours ago")}`;
    } else if (diffDay < 7) {
      return `${diffDay} ${t("notification.time.daysAgo", "days ago")}`;
    } else {
      const day = date.getDate().toString().padStart(2, "0");
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    }
  }
  _escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
  _renderEmpty() {
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    const body = this.element?.querySelector(".notification-panel-body");
    if (!body) return;
    body.innerHTML = `
      <div class="notification-panel-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
        </svg>
        <p>${t("notification.panel.empty", "No notifications yet")}</p>
      </div>
    `;
  }
  _renderError(message) {
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    const body = this.element?.querySelector(".notification-panel-body");
    if (!body) return;
    body.innerHTML = `
      <div class="notification-panel-error">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>${t("notification.panel.error", "Could not load notifications")}</p>
        <span>${this._escapeHtml(message)}</span>
        <button class="notification-panel-retry" type="button">
          ${t("common.retry", "Retry")}
        </button>
      </div>
    `;
    body
      .querySelector(".notification-panel-retry")
      ?.addEventListener("click", () => {
        this.page = 1;
        this.fetchNotifications();
      });
  }
  async markAllAsRead() {
    if (!window.authManager?.isLoggedIn()) return;
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    try {
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            action: "apiRequest",
            method: "POST",
            endpoint: "notifications/mark-all-read",
            token: window.authManager?.token,
          },
          (resp) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (resp?.success) {
              resolve(resp.data);
            } else {
              reject(
                new Error(resp?.error?.message || "Failed to mark as read"),
              );
            }
          },
        );
      });
      this.notifications = this.notifications.map((n) => ({
        ...n,
        read_at: new Date().toISOString(),
      }));
      this._renderList();
      const bell = window.NotificationBell?.getInstance();
      bell?.updateBadge(0);
      window.showNotification?.(
        t("notification.panel.markedAllRead", "Marked all as read"),
        "success",
      );
    } catch (err) {
      console.error(
        "[NotificationPanel] L\u1ED7i mark all as read:",
        err.message,
      );
      window.showNotification?.(err.message, "error");
    }
  }
  async _handleItemClick(notification) {
    console.log("[NotificationPanel] Item clicked:", notification);
    if (!notification.read_at) {
      await this._markAsRead(notification.id);
    }
    if (window.NotificationModal) {
      this.close();
      window.NotificationModal.show(notification);
    }
  }
  async _markAsRead(id) {
    if (!window.authManager?.isLoggedIn()) return;
    try {
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            action: "apiRequest",
            method: "POST",
            endpoint: `notifications/${id}/read`,
            token: window.authManager?.token,
          },
          (resp) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (resp?.success) {
              resolve(resp.data);
            } else {
              reject(
                new Error(resp?.error?.message || "Failed to mark as read"),
              );
            }
          },
        );
      });
      const index = this.notifications.findIndex((n) => n.id === id);
      if (index >= 0) {
        this.notifications[index].read_at = new Date().toISOString();
        const item = this.element?.querySelector(
          `.notification-item[data-id="${id}"]`,
        );
        item?.classList.remove("unread");
        item?.querySelector(".notification-item-dot")?.remove();
      }
      const bell = window.NotificationBell?.getInstance();
      if (bell && bell.unreadCount > 0) {
        bell.updateBadge(bell.unreadCount - 1);
      }
    } catch (err) {
      console.warn("[NotificationPanel] L\u1ED7i mark as read:", err.message);
    }
  }
  _injectStyles() {
    if (document.getElementById("notification-panel-styles")) return;
    const style = document.createElement("style");
    style.id = "notification-panel-styles";
    style.textContent = `
      /* NotificationPanel Overlay - Pattern gi\u1ED1ng chat-ai.css */
      .notification-panel-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
        z-index: 200;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }

      .notification-panel-overlay.visible {
        display: flex;
      }

      .notification-panel-dialog {
        width: 100%;
        max-width: 640px;
        max-height: min(85vh, 760px);
        background: #191919;
        border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
        border-radius: 28px;
        display: flex;
        flex-direction: column;
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
        overflow: hidden;
        animation: notification-panel-slide-in 200ms ease-out;
      }

      @keyframes notification-panel-slide-in {
        from { opacity: 0; transform: scale(0.95) translateY(-8px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }

      .notification-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 28px 28px 20px;
        gap: 16px;
      }

      .notification-panel-header h3 {
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 0;
        min-width: 0;
        font-size: 22px;
        font-weight: 600;
        color: var(--foreground, #f8fafc);
      }

      .notification-panel-header h3 svg {
        width: 24px;
        height: 24px;
        flex-shrink: 0;
        color: #f5f5f5;
      }

      .notification-panel-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .notification-panel-mark-all,
      .notification-panel-close {
        background: #303030;
        border: none;
        color: #c4c4c4;
        cursor: pointer;
        padding: 10px;
        border-radius: 999px;
        min-width: 36px;
        min-height: 36px;
        justify-content: center;
        display: flex;
        align-items: center;
        transition: all 150ms;
      }

      .notification-panel-mark-all:hover,
      .notification-panel-close:hover {
        color: var(--foreground, #f8fafc);
        background: #3b3b3b;
      }

      .notification-panel-body {
        flex: 1;
        overflow-y: auto;
        padding: 0 20px 20px;
        min-height: 200px;
        scrollbar-width: thin;
        scrollbar-color: #454545 transparent;
      }

      /* Loading state */
      .notification-panel-loading,
      .notification-panel-loading-more {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 32px 16px;
        color: var(--muted-foreground, #666);
      }

      .notification-panel-loading-more {
        padding: 16px;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .spin {
        animation: spin 1s linear infinite;
      }

      /* Empty state */
      .notification-panel-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 48px 16px;
        color: var(--muted-foreground, #999);
        text-align: center;
      }

      .notification-panel-empty svg {
        opacity: 0.5;
      }

      .notification-panel-empty p {
        margin: 0;
        font-size: 14px;
      }

      /* Error state */
      .notification-panel-error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 48px 16px;
        color: var(--muted-foreground, #999);
        text-align: center;
      }

      .notification-panel-error svg {
        color: #ef4444;
        opacity: 0.7;
      }

      .notification-panel-error p {
        margin: 0;
        font-size: 14px;
        color: var(--foreground, #333);
      }

      .notification-panel-error span {
        font-size: 12px;
        color: var(--muted-foreground, #666);
      }

      .notification-panel-retry {
        margin-top: 12px;
        padding: 8px 16px;
        border: 1px solid var(--border, #e5e5e5);
        border-radius: 6px;
        background: var(--background, #fff);
        color: var(--foreground, #333);
        font-size: 13px;
        cursor: pointer;
        transition: background-color 0.2s;
      }

      .notification-panel-retry:hover {
        background: var(--muted, rgba(0, 0, 0, 0.05));
      }

      /* Notification item */
      .notification-panel-dialog .notification-item {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 16px 34px 16px 16px;
        margin: 4px 0;
        min-height: 88px;
        box-sizing: border-box;
        border-radius: 24px;
        background: transparent;
        cursor: pointer;
        transition: background-color 150ms ease;
        position: relative;
      }

      .notification-panel-dialog .notification-item:hover {
        background: #292929;
      }

      .notification-panel-dialog .notification-item.unread {
        background: #292929;
      }

      .notification-panel-dialog .notification-item.unread:hover {
        background: #333333;
      }

      .notification-panel-dialog .notification-item-icon {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
        border-radius: 16px;
        background: var(--muted, rgba(0, 0, 0, 0.05));
        color: var(--muted-foreground, #666);
      }

      .notification-panel-dialog .notification-item-icon svg { width: 22px; height: 22px; }

      .notification-panel-dialog .notification-item-icon.workflow_shared {
        background: rgba(59, 130, 246, 0.1);
        color: #3b82f6;
      }

      .notification-panel-dialog .notification-item-icon.account_expiring {
        background: rgba(245, 158, 11, 0.1);
        color: #f59e0b;
      }

      .notification-panel-dialog .notification-item-icon.feature_announcement {
        background: rgba(16, 185, 129, 0.1);
        color: #10b981;
      }

      .notification-panel-dialog .notification-item-icon.system {
        background: rgba(99, 102, 241, 0.1);
        color: #6366f1;
      }

      .notification-panel-dialog .notification-item-icon.payment,
      .notification-panel-dialog .notification-item-icon.order_paid,
      .notification-panel-dialog .notification-item-icon.order_failed {
        background: rgba(236, 72, 153, 0.1);
        color: #ec4899;
      }

      .notification-panel-dialog .notification-item-icon.order_admin_notify {
        background: rgba(139, 92, 246, 0.1);
        color: #8b5cf6;
      }

      .notification-panel-dialog .notification-item-content {
        flex: 1;
        min-width: 0;
      }

      .notification-panel-dialog .notification-item-title {
        font-size: 16px;
        font-weight: 600;
        color: #bfbfbf;
        line-height: 1.4;
        margin-bottom: 4px;
        overflow-wrap: anywhere;
      }

      .notification-panel-dialog .notification-item-message {
        font-size: 13px;
        color: #aaaaaa;
        line-height: 1.5;
        display: -webkit-box;
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .notification-panel-dialog .notification-item-time {
        font-size: 11px;
        color: #888888;
        margin-top: 6px;
      }

      .notification-panel-dialog .notification-item-dot {
        position: absolute;
        top: 50%;
        right: 16px;
        transform: translateY(-50%);
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--primary, #ccff00);
      }

      .notification-panel-dialog .notification-item.unread .notification-item-title,
      .notification-panel-dialog .notification-item:hover .notification-item-title {
        color: #f5f5f5;
      }

      .notification-panel-mark-all:focus-visible,
      .notification-panel-close:focus-visible {
        outline: 2px solid var(--primary, #ccff00);
        outline-offset: 3px;
      }

      @media (max-width: 420px) {
        .notification-panel-overlay { padding: 8px; }
        .notification-panel-dialog { border-radius: 22px; }
        .notification-panel-header { padding: 20px 16px 16px; gap: 8px; }
        .notification-panel-header h3 { font-size: 18px; gap: 8px; }
        .notification-panel-body { padding: 0 8px 12px; }
        .notification-panel-dialog .notification-item { gap: 12px; padding: 14px 28px 14px 12px; border-radius: 20px; }
        .notification-panel-dialog .notification-item-icon { width: 40px; height: 40px; border-radius: 13px; }
        .notification-panel-dialog .notification-item-title { font-size: 14px; }
      }

      /* Light theme */
      .theme-light .notification-panel-overlay {
        background: rgba(0, 0, 0, 0.4);
      }

      .theme-light .notification-panel-dialog {
        background: var(--background, #ffffff);
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.15);
      }

      .theme-light .notification-panel-header {
        border-color: var(--border, #e5e7eb);
      }

      .theme-light .notification-panel-header h3 {
        color: var(--foreground, #1a1a1a);
      }

      .theme-light .notification-panel-dialog .notification-item.unread {
        background: #f0f0f0;
      }

      .theme-light .notification-panel-dialog .notification-item:hover {
        background: var(--muted, #f1f5f9);
      }

      .theme-light .notification-panel-dialog .notification-item.unread:hover {
        background: #e7e7e7;
      }

      .theme-light .notification-panel-mark-all,
      .theme-light .notification-panel-close { background: #eeeeee; color: #555555; }
      .theme-light .notification-panel-mark-all:hover,
      .theme-light .notification-panel-close:hover { background: #e2e2e2; }
      .theme-light .notification-panel-header h3 svg { color: #1a1a1a; }
      .theme-light .notification-panel-dialog .notification-item-message { color: #666666; }
      .theme-light .notification-panel-dialog .notification-item-time { color: #777777; }
      .theme-light .notification-panel-dialog .notification-item-title,
      .theme-light .notification-panel-dialog .notification-item.unread .notification-item-title,
      .theme-light .notification-panel-dialog .notification-item:hover .notification-item-title {
        color: var(--foreground, #1a1a1a);
      }
    `;
    document.head.appendChild(style);
  }
}
window.NotificationPanel = NotificationPanel;
