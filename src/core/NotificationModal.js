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
class NotificationModal {
  static async show(notification) {
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    console.log("[NotificationModal] show() called with:", notification);
    this._close();
    return new Promise((resolve) => {
      this._resolve = resolve;
      const { html, buttons } = this._getContent(notification);
      console.log("[NotificationModal] Generated HTML:", html);
      const modal = this._createModal(notification, html, buttons);
      this._previousFocus = document.activeElement;
      document.body.appendChild(modal);
      this._instance = modal;
      this._bindEvents(modal, notification, buttons, resolve);
      this._injectStyles();
      modal.querySelector(".notification-detail-btn.primary")?.focus();
      if (!notification.read_at) this._markAsRead(notification.id);
    });
  }
  static _close(result = null) {
    if (this._handleKeydown) {
      document.removeEventListener("keydown", this._handleKeydown);
      this._handleKeydown = null;
    }
    if (this._instance) {
      this._instance.remove();
      this._instance = null;
    }
    if (this._resolve) {
      this._resolve(result);
      this._resolve = null;
    }
    if (result !== "upgrade" && this._previousFocus?.isConnected)
      this._previousFocus.focus();
    this._previousFocus = null;
  }
  static _getContent(notification) {
    const t = (key, fallback) => {
      const translated = window.I18n?.t(key);
      return translated && translated !== key ? translated : fallback;
    };
    const data = notification.data || {};
    const type = notification.type;
    let html = "";
    let buttons = [];
    switch (type) {
      case "workflow_shared":
        html = this._getWorkflowSharedContent(notification, data);
        buttons = [
          {
            label: t("notification.action.reject", "Reject"),
            action: "reject",
            primary: false,
            danger: true,
          },
          {
            label: t("notification.action.acceptOnly", "Accept"),
            action: "accept",
            primary: false,
          },
          {
            label: t("notification.action.acceptAndCopy", "Accept & Copy"),
            action: "acceptAndCopy",
            primary: true,
          },
        ];
        break;
      case "account_expiring":
      case "renewal_reminder":
        html = this._getAccountExpiringContent(notification, data);
        buttons = [
          {
            label: t("notification.action.later", "Later"),
            action: "close",
            primary: false,
          },
          {
            label: t("notification.action.renew", "Renew"),
            action: "upgrade",
            primary: true,
          },
        ];
        break;
      case "feature_announcement":
        html = this._getFeatureAnnouncementContent(notification, data);
        buttons = [
          { label: t("common.ok", "OK"), action: "close", primary: true },
        ];
        break;
      case "payment":
      case "order_paid":
      case "order_failed":
        html = this._getPaymentContent(notification, data);
        buttons = [
          { label: t("common.ok", "OK"), action: "close", primary: true },
        ];
        break;
      case "order_admin_notify":
        html = this._getOrderAdminContent(notification, data);
        buttons = [
          {
            label: t("common.close", "Close"),
            action: "close",
            primary: false,
          },
          {
            label: t("notification.action.viewOrder", "View order"),
            action: "open_link",
            primary: true,
          },
        ];
        break;
      case "system":
      default:
        html = this._getDefaultContent(notification, data);
        buttons = [
          { label: t("common.ok", "OK"), action: "close", primary: true },
        ];
        break;
    }
    return { html, buttons };
  }
  static _getWorkflowSharedContent(notification, data) {
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    const workflowName = this._escapeHtml(data.workflow_name || "Workflow");
    const sharedBy = this._escapeHtml(
      data.sharer_name ||
        data.sharer_email ||
        data.shared_by_name ||
        data.shared_by_email ||
        window.I18n?.t("workflow.unknownSharer") ||
        "Someone",
    );
    const permission = data.permission || "view";
    const permissionText =
      permission === "edit"
        ? t("notification.permission.edit", "edit")
        : t("notification.permission.view", "xem");
    return `
      <div class="notification-modal-icon workflow_shared">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
          <polyline points="16 6 12 2 8 6"/>
          <line x1="12" y1="2" x2="12" y2="15"/>
        </svg>
      </div>
      <h3>${t("notification.workflowShared.title", "Workflow Shared")}</h3>
      <p class="notification-modal-desc">
        <strong>${sharedBy}</strong> ${t("notification.workflowShared.sharedWith", "shared a workflow with you")}:
      </p>
      <div class="notification-modal-workflow">
        <div class="workflow-name">${workflowName}</div>
        <div class="workflow-permission">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${permission === "edit" ? '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>' : '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>'}
          </svg>
          ${t("notification.workflowShared.permission", "Permission")}: ${permissionText}
        </div>
      </div>
      <p class="notification-modal-hint">
        ${t("notification.workflowShared.hint", "Would you like to add this workflow to your list?")}
      </p>
    `;
  }
  static _getAccountExpiringContent(notification, data) {
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    const expiryDate = data.expires_at ?? data.expiry_date;
    const expiryMs = expiryDate ? Date.parse(expiryDate) : NaN;
    const configuredDays = Number(data.days_remaining ?? data.days_left);
    const daysLeft = Number.isFinite(expiryMs)
      ? Math.max(0, Math.ceil((expiryMs - Date.now()) / 864e5))
      : Number.isFinite(configuredDays)
        ? Math.max(0, Math.ceil(configuredDays))
        : null;
    const planName = this._escapeHtml(data.plan_name || data.plan_slug || "");
    let formattedDate = "";
    if (Number.isFinite(expiryMs)) {
      formattedDate =
        window.I18n?.formatDate?.(expiryDate) ||
        new Date(expiryDate).toLocaleDateString();
    }
    return `
      <div class="notification-modal-icon account_expiring">
        <img src="${chrome.runtime.getURL("icons/icon-128.png")}" width="64" height="64" alt="Toby Flow">
      </div>
      <h3>${t("notification.accountExpiring.title", "Account is expiring soon")}</h3>
      <p class="notification-modal-desc">
        ${t("notification.accountExpiring.desc", "Your")} <strong>${planName}</strong> ${t("notification.accountExpiring.willExpire", "plan will expire in")}:
      </p>
      <div class="notification-modal-expiry">
        <div class="expiry-days">
          <span class="days-number">${daysLeft ?? "\u2014"}</span>
          <span class="days-label">${t("notification.accountExpiring.days", "days")}</span>
        </div>
        ${formattedDate ? `<div class="expiry-date">(${this._escapeHtml(formattedDate)})</div>` : ""}
      </div>
      <p class="notification-modal-hint">
        ${t("notification.accountExpiring.hint", "Renew now to keep using all Premium features.")}
      </p>
    `;
  }
  static _getFeatureAnnouncementContent(notification, data) {
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    console.log("[NotificationModal] _getFeatureAnnouncementContent:", {
      notification,
      data,
    });
    const title = this._escapeHtml(
      notification.title || data.title || "New feature",
    );
    const message = this._escapeHtml(
      notification.body || notification.message || data.message || "",
    );
    const imageUrl = data.image_url || "";
    console.log("[NotificationModal] Parsed:", { title, message, imageUrl });
    return `
      <div class="notification-modal-icon feature_announcement">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m3 11 18-5v12L3 14v-3z"/>
          <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>
        </svg>
      </div>
      <h3>${title}</h3>
      ${imageUrl ? `<img class="notification-modal-image" src="${this._escapeAttr(imageUrl)}" alt="${title}" />` : ""}
      <p class="notification-modal-desc">${message}</p>
    `;
  }
  static _getPaymentContent(notification, data) {
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    const title = this._escapeHtml(
      notification.title || data.title || "Payment notification",
    );
    const message = this._escapeHtml(
      notification.body || notification.message || data.message || "",
    );
    const rawAmount = data.amount;
    let amount = "";
    if (rawAmount !== "" && rawAmount != null && isFinite(Number(rawAmount))) {
      const currency =
        data.currency || window.LocationCache?.getCurrency?.() || "VND";
      try {
        amount =
          window.I18n?.formatCurrency?.(Number(rawAmount), currency) ||
          `${rawAmount} ${currency}`;
      } catch (_) {
        amount = `${rawAmount} ${currency}`;
      }
    }
    const status = data.status || "";
    let statusClass = "";
    let statusText = "";
    if (status === "success" || status === "completed") {
      statusClass = "success";
      statusText = t("notification.payment.success", "Success");
    } else if (status === "failed") {
      statusClass = "failed";
      statusText = t("notification.payment.failed", "Failed");
    } else if (status === "pending") {
      statusClass = "pending";
      statusText = t("notification.payment.pending", "Processing");
    }
    return `
      <div class="notification-modal-icon payment ${statusClass}">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
          <line x1="1" y1="10" x2="23" y2="10"/>
        </svg>
      </div>
      <h3>${title}</h3>
      ${amount ? `<div class="notification-modal-amount">${this._escapeHtml(amount)}</div>` : ""}
      ${statusText ? `<div class="notification-modal-status ${statusClass}">${statusText}</div>` : ""}
      <p class="notification-modal-desc">${message}</p>
    `;
  }
  static _getOrderAdminContent(notification, data) {
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    const title = this._escapeHtml(
      notification.title || t("notification.orderAdmin.title", "New order"),
    );
    const message = this._escapeHtml(notification.body || "");
    const orderNumber = this._escapeHtml(data.order_invoice_number || "");
    const userName = this._escapeHtml(data.user_name || "");
    const userEmail = this._escapeHtml(data.user_email || "");
    const planName = this._escapeHtml(data.plan_name || "");
    let amount = "";
    if (
      data.amount != null &&
      data.amount !== "" &&
      isFinite(Number(data.amount))
    ) {
      const currency =
        data.currency || window.LocationCache?.getCurrency?.() || "VND";
      try {
        amount =
          window.I18n?.formatCurrency?.(Number(data.amount), currency) ||
          `${data.amount} ${currency}`;
      } catch (_) {
        amount = `${data.amount} ${currency}`;
      }
    }
    return `
      <div class="notification-modal-icon order_admin">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      </div>
      <h3>${title}</h3>
      <div class="notification-modal-order-info">
        ${orderNumber ? `<div class="order-row"><span class="order-label">${t("notification.orderAdmin.orderNumber", "Order #")}:</span> <strong>#${orderNumber}</strong></div>` : ""}
        ${userName ? `<div class="order-row"><span class="order-label">${t("notification.orderAdmin.customer", "Customer")}:</span> ${userName}</div>` : ""}
        ${userEmail ? `<div class="order-row"><span class="order-label">Email:</span> ${userEmail}</div>` : ""}
        ${planName ? `<div class="order-row"><span class="order-label">${t("notification.orderAdmin.plan", "Plan")}:</span> ${planName}</div>` : ""}
        ${amount ? `<div class="order-row"><span class="order-label">${t("notification.orderAdmin.amount", "Amount")}:</span> <strong>${amount}</strong></div>` : ""}
      </div>
      ${message ? `<p class="notification-modal-desc">${message}</p>` : ""}
    `;
  }
  static _getDefaultContent(notification, data) {
    const title = this._escapeHtml(
      notification.title || data.title || "Notification",
    );
    const message = this._escapeHtml(
      notification.body || notification.message || data.message || "",
    );
    return `
      <div class="notification-modal-icon system">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
      </div>
      <h3>${title}</h3>
      <p class="notification-modal-desc">${message}</p>
    `;
  }
  static _createModal(notification, html, buttons) {
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    const overlay = document.createElement("div");
    overlay.className = "notification-detail-overlay";
    overlay.innerHTML = `
      <div class="notification-detail-modal" role="dialog" aria-modal="true" aria-labelledby="notificationDetailTitle">
        <button class="notification-detail-close" type="button"
                title="${t("common.close", "Close")}" aria-label="${t("common.close", "Close")}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        <div class="notification-detail-body">
          ${html}
        </div>
        <div class="notification-detail-footer">
          ${buttons
            .map(
              (btn, i) => `
            <button class="notification-detail-btn ${btn.primary ? "primary" : ""} ${btn.danger ? "danger" : ""}"
                    data-action="${btn.action}" data-idx="${i}">
              ${this._escapeHtml(btn.label)}
            </button>
          `,
            )
            .join("")}
        </div>
      </div>
    `;
    overlay.querySelector("h3")?.setAttribute("id", "notificationDetailTitle");
    return overlay;
  }
  static _bindEvents(modal, notification, buttons, resolve) {
    modal
      .querySelector(".notification-detail-close")
      ?.addEventListener("click", () => {
        this._close();
      });
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        this._close();
      }
    });
    this._handleKeydown = (e) => {
      if (e.key === "Escape") {
        this._close();
      } else if (e.key === "Tab") {
        const controls = [...modal.querySelectorAll("button:not(:disabled)")];
        const first = controls[0],
          last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", this._handleKeydown);
    modal.querySelectorAll(".notification-detail-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const action = btn.dataset.action;
        if (action === "close") {
          this._close();
          return;
        }
        modal
          .querySelectorAll(".notification-detail-btn")
          .forEach((b) => (b.disabled = true));
        btn.innerHTML = `
          <svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
            <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
          </svg>
        `;
        try {
          switch (action) {
            case "accept":
              await this._acceptShare(notification, { shouldCopy: false });
              break;
            case "acceptAndCopy":
              await this._acceptShare(notification, { shouldCopy: true });
              break;
            case "reject":
              await this._rejectShare(notification);
              break;
            case "upgrade":
              this._openUpgrade();
              break;
            case "open_link":
              this._openLink(notification);
              break;
          }
          if (this._instance === modal) this._close(action);
        } catch (err) {
          console.error("[NotificationModal] Action error:", err.message);
          if (!err.silent) {
            window.showNotification?.(err.message, "error");
          }
          modal.querySelectorAll(".notification-detail-btn").forEach((b, i) => {
            b.disabled = false;
            b.innerHTML = this._escapeHtml(buttons[i].label);
          });
        }
      });
    });
    ["mousedown", "mouseup", "pointerdown", "pointerup"].forEach((evt) => {
      modal.addEventListener(evt, (e) => e.stopPropagation());
    });
  }
  static async _markAsRead(id) {
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
            resolve(resp);
          },
        );
      });
    } catch (err) {
      console.warn("[NotificationModal] L\u1ED7i mark as read:", err.message);
    }
  }
  static async _acceptShare(notification, options = {}) {
    const { shouldCopy = false } = options;
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    if (this._isAcceptingShare) {
      console.log(
        "[NotificationModal] Accept share already in progress, ignoring duplicate click",
      );
      return;
    }
    const data = notification.data || {};
    const token = data.token || data.accept_token;
    const shareId = data.share_id || notification.reference_id;
    const wfId = data.workflow_wf_id;
    const nodeCount = Number(data.workflow_node_count ?? 0);
    if (!token) {
      throw new Error(
        t("notification.error.noShareId", "Share information not found"),
      );
    }
    this._isAcceptingShare = true;
    try {
      const fg = window.featureGate;
      if (shouldCopy && fg) {
        const wfQuota = fg.checkQuota("workflows_max");
        if (
          wfQuota &&
          wfQuota.limit !== "unlimited" &&
          wfQuota.limit > 0 &&
          (wfQuota.used ?? 0) >= wfQuota.limit
        ) {
          const msg = t(
            "workflow.shareAcceptQuotaExhausted",
            `G\xF3i c\u1EE7a b\u1EA1n gi\u1EDBi h\u1EA1n t\u1ED1i \u0111a ${wfQuota.limit} workflow. B\u1EA1n \u0111\xE3 c\xF3 ${wfQuota.used} workflow. N\xE2ng c\u1EA5p Premium \u0111\u1EC3 sao ch\xE9p workflow.`,
          );
          const upgrade = await window.customDialog?.confirm(msg, {
            title: t("workflow.quotaReached", "Quota reached"),
            type: "warning",
            confirmText: t("common.upgrade", "Upgrade"),
            cancelText: t("common.later", "Later"),
          });
          if (upgrade && typeof window.openUpgradeModal === "function")
            window.openUpgradeModal();
          const err = new Error(msg);
          err.silent = true;
          throw err;
        }
        if (nodeCount > 0) {
          const nodeQuota = fg.checkQuota("workflows_nodes_max");
          const nodeLimit = nodeQuota?.limit;
          if (
            nodeLimit &&
            nodeLimit !== "unlimited" &&
            nodeLimit > 0 &&
            nodeCount > nodeLimit
          ) {
            const msg = t(
              "workflow.shareNodeLimitExceeded",
              `Workflow n\xE0y c\xF3 ${nodeCount} nodes, v\u01B0\u1EE3t gi\u1EDBi h\u1EA1n ${nodeLimit} nodes c\u1EE7a g\xF3i. N\xE2ng c\u1EA5p \u0111\u1EC3 sao ch\xE9p workflow n\xE0y.`,
            );
            const upgrade = await window.customDialog?.confirm(msg, {
              title: t("workflow.quotaReached", "Quota reached"),
              type: "warning",
              confirmText: t("common.upgrade", "Upgrade"),
              cancelText: t("common.later", "Later"),
            });
            if (upgrade && typeof window.openUpgradeModal === "function")
              window.openUpgradeModal();
            const err = new Error(msg);
            err.silent = true;
            throw err;
          }
        }
      }
      const acceptResp = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            action: "apiRequest",
            method: "POST",
            endpoint: `workflow-shares/${token}/accept`,
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
                new Error(
                  resp?.error?.message ||
                    t(
                      "notification.error.acceptFailed",
                      "Could not accept share",
                    ),
                ),
              );
            }
          },
        );
      });
      let dupResp = null;
      if (shouldCopy) {
        const targetWfId = wfId || acceptResp?.workflow?.wf_id;
        if (targetWfId) {
          dupResp = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
              {
                action: "apiRequest",
                method: "POST",
                endpoint: `shared-workflows/${targetWfId}/clone`,
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
                  const err = new Error(
                    resp?.error?.message ||
                      t(
                        "notification.error.duplicateFailed",
                        "Could not duplicate workflow",
                      ),
                  );
                  err.code = resp?.error?.code;
                  reject(err);
                }
              },
            );
          });
        }
      }
      if (shouldCopy && dupResp) {
        if (window.featureGate) {
          window.featureGate.refresh({ force: true }).catch(() => {});
        }
        window.showNotification?.(
          t(
            "notification.workflowShared.acceptedAndCopied",
            "Workflow copied to your list",
          ),
          "success",
        );
      } else {
        window.showNotification?.(
          t(
            "notification.workflowShared.acceptedOnly",
            'Added to "Shared with me"',
          ),
          "success",
        );
      }
      if (window.eventBus) {
        window.eventBus.emit("workflow:shared_accepted", {
          shareId,
          notification,
          workflow: dupResp,
          copied: shouldCopy && !!dupResp,
        });
      }
      return dupResp || acceptResp;
    } finally {
      this._isAcceptingShare = false;
    }
  }
  static async _rejectShare(notification) {
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    const data = notification.data || {};
    const shareId = data.share_id || notification.reference_id;
    if (!shareId) {
      throw new Error(
        t("notification.error.noShareId", "Share information not found"),
      );
    }
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: "apiRequest",
          method: "POST",
          endpoint: `workflow-shares/${shareId}/reject`,
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
              new Error(
                resp?.error?.message ||
                  t(
                    "notification.error.rejectFailed",
                    "Could not reject share",
                  ),
              ),
            );
          }
        },
      );
    });
    window.showNotification?.(
      t("notification.workflowShared.rejected", "Declined workflow share"),
      "info",
    );
    return response;
  }
  static _openUpgrade() {
    if (typeof window.openUpgradeModal === "function") {
      window.openUpgradeModal();
    } else {
      try {
        chrome.runtime.sendMessage({ action: "showUpgradeModal" });
      } catch (e) {}
    }
  }
  static _openLink(notification) {
    const actionUrl = notification.action_url;
    if (!actionUrl) {
      console.warn("[NotificationModal] No action_url in notification");
      return;
    }
    let fullUrl = actionUrl;
    if (actionUrl.startsWith("/")) {
      const baseUrl =
        window.SystemConfig?.get("app_url") ||
        window.ApiBaseConfig?.getWebBase?.();
      if (!baseUrl)
        console.debug(
          "[Tier3] NotificationModal: baseUrl resolve null \u2014 relative action URL kh\xF4ng build \u0111\u01B0\u1EE3c",
        );
      fullUrl = (baseUrl || "") + actionUrl;
    }
    window.open(fullUrl, "_blank");
  }
  static _escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
  static _escapeAttr(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  static _injectStyles() {
    if (document.getElementById("notification-detail-styles")) return;
    const style = document.createElement("style");
    style.id = "notification-detail-styles";
    style.textContent = `
      /* NotificationModal Overlay - Pattern gi\u1ED1ng chat-ai.css */
      .notification-detail-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
        z-index: 10000020;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }

      /* Modal container */
      .notification-detail-modal {
        position: relative;
        background: var(--background, #1e1e1e);
        border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
        border-radius: 16px;
        max-width: 480px;
        width: 100%;
        max-height: 85vh;
        overflow: hidden;
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
        animation: notification-detail-slide-in 200ms ease-out;
      }

      @keyframes notification-detail-slide-in {
        from { opacity: 0; transform: scale(0.95) translateY(-8px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }

      /* Close button */
      .notification-detail-close {
        position: absolute;
        top: 12px;
        right: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        padding: 0;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: var(--muted-foreground, #8b8b92);
        cursor: pointer;
        transition: background-color 0.2s, color 0.2s;
        z-index: 1;
      }

      .notification-detail-close:hover {
        background: var(--muted, #2e2e33);
        color: var(--foreground, #f8fafc);
      }

      /* Body */
      .notification-detail-body {
        padding: 32px 24px 24px;
        text-align: center;
        overflow-y: auto;
        max-height: calc(85vh - 80px);
      }

      .notification-detail-body h3 {
        margin: 0 0 12px;
        font-size: 18px;
        font-weight: 600;
        color: var(--foreground, #f8fafc);
      }

      /* Footer */
      .notification-detail-footer {
        display: flex;
        gap: 12px;
        padding: 16px 24px 24px;
        border-top: 1px solid var(--border, rgba(255, 255, 255, 0.08));
      }

      /* Buttons */
      .notification-detail-btn {
        flex: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 12px 20px;
        border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
        border-radius: 10px;
        background: var(--secondary, #242428);
        color: var(--foreground, #f8fafc);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }

      .notification-detail-btn:hover {
        background: var(--muted, #2e2e33);
      }

      .notification-detail-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .notification-detail-btn.primary {
        background: var(--primary, #ccff00);
        border-color: var(--primary, #ccff00);
        color: var(--primary-foreground, #1e1e1e);
      }

      .notification-detail-btn.primary:hover {
        background: var(--primary-hover, #b8e600);
        border-color: var(--primary-hover, #b8e600);
      }

      .notification-detail-btn.danger {
        border-color: #ef4444;
        color: #ef4444;
      }

      .notification-detail-btn.danger:hover {
        background: rgba(239, 68, 68, 0.1);
      }

      /* ===== Content styles (gi\u1EEF nguy\xEAn prefix notification-modal- cho n\u1ED9i dung) ===== */
      .notification-modal-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 64px;
        height: 64px;
        margin-bottom: 16px;
        border-radius: 16px;
        background: var(--muted, #2e2e33);
        color: var(--muted-foreground, #8b8b92);
      }

      .notification-modal-icon.workflow_shared {
        background: rgba(59, 130, 246, 0.15);
        color: #3b82f6;
      }

      .notification-modal-icon.account_expiring {
        background: transparent;
      }

      .notification-modal-icon.account_expiring img {
        display: block;
        width: 64px;
        height: 64px;
        object-fit: contain;
      }

      .notification-modal-icon.feature_announcement {
        background: rgba(16, 185, 129, 0.15);
        color: #10b981;
      }

      .notification-modal-icon.system {
        background: rgba(99, 102, 241, 0.15);
        color: #6366f1;
      }

      .notification-modal-icon.payment {
        background: rgba(236, 72, 153, 0.15);
        color: #ec4899;
      }

      .notification-modal-icon.payment.success {
        background: rgba(16, 185, 129, 0.15);
        color: #10b981;
      }

      .notification-modal-icon.payment.failed {
        background: rgba(239, 68, 68, 0.15);
        color: #ef4444;
      }

      .notification-modal-icon.order_admin {
        background: rgba(139, 92, 246, 0.15);
        color: #8b5cf6;
      }

      .notification-modal-order-info {
        margin: 12px 0 16px;
        padding: 12px;
        background: var(--muted, rgba(0, 0, 0, 0.1));
        border-radius: 8px;
        font-size: 13px;
      }

      .notification-modal-order-info .order-row {
        display: flex;
        justify-content: space-between;
        padding: 4px 0;
        color: var(--foreground, #fff);
      }

      .notification-modal-order-info .order-row:not(:last-child) {
        border-bottom: 1px solid var(--border, rgba(255,255,255,0.1));
      }

      .notification-modal-order-info .order-label {
        color: var(--muted-foreground, #8b8b92);
      }

      .notification-modal-desc {
        margin: 0 0 16px;
        font-size: 14px;
        line-height: 1.5;
        color: var(--muted-foreground, #8b8b92);
      }

      .notification-modal-desc strong {
        color: var(--foreground, #f8fafc);
      }

      .notification-modal-hint {
        margin: 16px 0 0;
        font-size: 13px;
        color: var(--muted-foreground, #8b8b92);
      }

      .notification-modal-image {
        max-width: 100%;
        max-height: 200px;
        margin: 16px 0;
        border-radius: 8px;
        object-fit: contain;
      }

      /* Workflow shared specific */
      .notification-modal-workflow {
        padding: 16px;
        margin: 16px 0;
        background: var(--muted, rgba(255, 255, 255, 0.05));
        border-radius: 12px;
      }

      .workflow-name {
        font-size: 16px;
        font-weight: 600;
        color: var(--foreground, #f8fafc);
        margin-bottom: 8px;
      }

      .workflow-permission {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 12px;
        background: var(--background, #1e1e1e);
        border-radius: 20px;
        font-size: 13px;
        color: var(--muted-foreground, #8b8b92);
      }

      /* Account expiring specific */
      .notification-modal-expiry {
        padding: 24px;
        margin: 16px 0;
        background: rgba(245, 158, 11, 0.08);
        border: 1px solid rgba(245, 158, 11, 0.2);
        border-radius: 12px;
      }

      .expiry-days {
        display: flex;
        align-items: baseline;
        justify-content: center;
        gap: 8px;
      }

      .days-number {
        font-size: 48px;
        font-weight: 700;
        color: #f59e0b;
        line-height: 1;
      }

      .days-label {
        font-size: 18px;
        font-weight: 500;
        color: #f59e0b;
      }

      .expiry-date {
        margin-top: 8px;
        font-size: 14px;
        color: var(--muted-foreground, #8b8b92);
      }

      /* Payment specific */
      .notification-modal-amount {
        font-size: 24px;
        font-weight: 700;
        color: var(--foreground, #f8fafc);
        margin: 8px 0;
      }

      .notification-modal-status {
        display: inline-block;
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 13px;
        font-weight: 500;
        margin-bottom: 12px;
      }

      .notification-modal-status.success {
        background: rgba(16, 185, 129, 0.15);
        color: #10b981;
      }

      .notification-modal-status.failed {
        background: rgba(239, 68, 68, 0.15);
        color: #ef4444;
      }

      .notification-modal-status.pending {
        background: rgba(245, 158, 11, 0.15);
        color: #f59e0b;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .spin {
        animation: spin 1s linear infinite;
      }

      /* Light theme */
      .theme-light .notification-detail-overlay {
        background: rgba(0, 0, 0, 0.4);
      }

      .theme-light .notification-detail-modal {
        background: var(--background, #ffffff);
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.15);
      }

      .theme-light .notification-detail-body h3 {
        color: var(--foreground, #1a1a1a);
      }

      .theme-light .notification-detail-close:hover {
        background: var(--muted, #f1f5f9);
        color: var(--foreground, #1a1a1a);
      }

      .theme-light .notification-detail-btn {
        background: var(--secondary, #f1f5f9);
        color: var(--foreground, #1a1a1a);
      }

      .theme-light .notification-detail-btn:hover {
        background: var(--muted, #e2e8f0);
      }

      .theme-light .notification-detail-btn.primary {
        background: var(--primary, #335AF5);
        border-color: var(--primary, #335AF5);
        color: #fff;
      }

      .theme-light .notification-modal-desc {
        color: var(--muted-foreground, #64748b);
      }

      .theme-light .notification-modal-desc strong,
      .theme-light .workflow-name,
      .theme-light .notification-modal-amount {
        color: var(--foreground, #1a1a1a);
      }
    `;
    document.head.appendChild(style);
  }
}
__publicField(NotificationModal, "_instance", null);
__publicField(NotificationModal, "_resolve", null);
__publicField(NotificationModal, "_isAcceptingShare", false);
__publicField(NotificationModal, "_handleKeydown", null);
__publicField(NotificationModal, "_previousFocus", null);
window.NotificationModal = NotificationModal;
