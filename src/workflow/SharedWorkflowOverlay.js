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
class SharedWorkflowOverlay {
  static show(notification) {
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    const data = notification?.data || {};
    this.close();
    this._currentData = {
      notificationId: notification?.id,
      shareId: data.share_id,
      shareToken: data.share_token,
      sharerId: data.sharer_id,
      sharerName: data.sharer_name || data.sharer_email || "Someone",
      sharerEmail: data.sharer_email,
      workflowId: data.workflow_id,
      workflowName: data.workflow_name || "Workflow",
      note: data.note,
    };
    const overlay = this._createOverlay(this._currentData);
    document.body.appendChild(overlay);
    this._element = overlay;
    requestAnimationFrame(() => {
      overlay.classList.add("visible");
    });
    this._bindEvents(overlay);
  }
  static close() {
    if (this._element) {
      this._element.classList.remove("visible");
      setTimeout(() => {
        this._element?.remove();
        this._element = null;
        this._currentData = null;
      }, 300);
    }
  }
  static async accept() {
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    const data = this._currentData;
    if (!data?.shareToken) {
      window.showNotification?.(
        t("workflow.shareOverlay.errorNoToken", "Share information not found"),
        "error",
      );
      this.close();
      return;
    }
    this._setLoading(true, "accept");
    try {
      await this._apiCall("POST", `workflow-shares/${data.shareToken}/accept`);
      window.showNotification?.(
        t(
          "workflow.shareOverlay.acceptSuccess",
          "Workflow accepted. It has been added to your list.",
        ),
        "success",
      );
      if (window.WorkflowList?.refresh) {
        window.WorkflowList.refresh();
      }
      if (window.eventBus) {
        window.eventBus.emit("workflow:shared:accepted", {
          workflowId: data.workflowId,
          workflowName: data.workflowName,
        });
      }
      this.close();
    } catch (err) {
      console.error(
        "[SharedWorkflowOverlay] L\u1ED7i ch\u1EA5p nh\u1EADn:",
        err,
      );
      window.showNotification?.(
        err.message ||
          t(
            "workflow.shareOverlay.acceptError",
            "Could not accept the workflow",
          ),
        "error",
      );
      this._setLoading(false);
    }
  }
  static async reject() {
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    const data = this._currentData;
    if (!data?.shareId) {
      window.showNotification?.(
        t("workflow.shareOverlay.errorNoId", "Share information not found"),
        "error",
      );
      this.close();
      return;
    }
    this._setLoading(true, "reject");
    try {
      await this._apiCall("POST", `workflow-shares/${data.shareId}/reject`);
      window.showNotification?.(
        t("workflow.shareOverlay.rejectSuccess", "Share invitation rejected"),
        "info",
      );
      if (window.eventBus) {
        window.eventBus.emit("workflow:shared:rejected", {
          shareId: data.shareId,
        });
      }
      this.close();
    } catch (err) {
      console.error("[SharedWorkflowOverlay] L\u1ED7i t\u1EEB ch\u1ED1i:", err);
      window.showNotification?.(
        err.message ||
          t(
            "workflow.shareOverlay.rejectError",
            "Could not reject the invitation",
          ),
        "error",
      );
      this._setLoading(false);
    }
  }
  static later() {
    this.close();
  }
  static _createOverlay(data) {
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    const overlay = document.createElement("div");
    overlay.className = "shared-workflow-overlay";
    overlay.innerHTML = `
      <div class="shared-workflow-backdrop"></div>
      <div class="shared-workflow-card">
        <!-- Icon -->
        <div class="shared-workflow-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="18" cy="5" r="3"/>
            <circle cx="6" cy="12" r="3"/>
            <circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
        </div>

        <!-- Title -->
        <h2 class="shared-workflow-title">
          ${t("workflow.shareOverlay.title", "Workflow Share Invitation")}
        </h2>

        <!-- Message -->
        <p class="shared-workflow-message">
          <strong>${this._escapeHtml(data.sharerName)}</strong>
          ${t("workflow.shareOverlay.hasShared", "shared a workflow with you")}
        </p>

        <!-- Workflow info -->
        <div class="shared-workflow-info">
          <div class="shared-workflow-info-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
            <span class="shared-workflow-info-label">${t("workflow.shareOverlay.workflowLabel", "Workflow:")}</span>
            <span class="shared-workflow-info-value">${this._escapeHtml(data.workflowName)}</span>
          </div>

          ${
            data.note
              ? `
          <div class="shared-workflow-info-item shared-workflow-note">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span class="shared-workflow-info-label">${t("workflow.shareOverlay.noteLabel", "Note:")}</span>
            <span class="shared-workflow-info-value">"${this._escapeHtml(data.note)}"</span>
          </div>
          `
              : ""
          }
        </div>

        <!-- Buttons -->
        <div class="shared-workflow-buttons">
          <button class="shared-workflow-btn shared-workflow-btn-later" id="sharedWorkflowLaterBtn">
            ${t("workflow.shareOverlay.later", "Later")}
          </button>
          <button class="shared-workflow-btn shared-workflow-btn-reject" id="sharedWorkflowRejectBtn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            ${t("workflow.shareOverlay.reject", "Reject")}
          </button>
          <button class="shared-workflow-btn shared-workflow-btn-accept" id="sharedWorkflowAcceptBtn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            ${t("workflow.shareOverlay.accept", "Accept")}
          </button>
        </div>
      </div>

      <style>
        .shared-workflow-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 10000020;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.3s ease, visibility 0.3s ease;
        }

        .shared-workflow-overlay.visible {
          opacity: 1;
          visibility: visible;
        }

        .shared-workflow-backdrop {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(8px);
        }

        .shared-workflow-card {
          position: relative;
          background: var(--bg-primary, #ffffff);
          border-radius: 16px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          width: 90%;
          max-width: 420px;
          padding: 32px;
          text-align: center;
          transform: scale(0.9) translateY(20px);
          transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .shared-workflow-overlay.visible .shared-workflow-card {
          transform: scale(1) translateY(0);
        }

        .shared-workflow-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 80px;
          height: 80px;
          margin-bottom: 20px;
          background: linear-gradient(135deg, var(--accent-color, #3b82f6), var(--accent-hover, #2563eb));
          border-radius: 50%;
          color: #ffffff;
          animation: shared-pulse 2s ease-in-out infinite;
        }

        @keyframes shared-pulse {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4);
          }
          50% {
            box-shadow: 0 0 0 15px rgba(59, 130, 246, 0);
          }
        }

        .shared-workflow-title {
          margin: 0 0 12px 0;
          font-size: 20px;
          font-weight: 700;
          color: var(--text-primary, #1f2937);
        }

        .shared-workflow-message {
          margin: 0 0 24px 0;
          font-size: 15px;
          line-height: 1.5;
          color: var(--text-secondary, #4b5563);
        }

        .shared-workflow-message strong {
          color: var(--text-primary, #1f2937);
        }

        .shared-workflow-info {
          background: var(--bg-secondary, #f9fafb);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 24px;
          text-align: left;
        }

        .shared-workflow-info-item {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          font-size: 14px;
          color: var(--text-secondary, #4b5563);
        }

        .shared-workflow-info-item + .shared-workflow-info-item {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid var(--border-color, #e5e7eb);
        }

        .shared-workflow-info-item svg {
          flex-shrink: 0;
          margin-top: 2px;
          color: var(--accent-color, #3b82f6);
        }

        .shared-workflow-info-label {
          font-weight: 500;
          color: var(--text-muted, #6b7280);
          white-space: nowrap;
        }

        .shared-workflow-info-value {
          font-weight: 500;
          color: var(--text-primary, #1f2937);
          word-break: break-word;
        }

        .shared-workflow-note .shared-workflow-info-value {
          font-style: italic;
          color: var(--text-secondary, #4b5563);
        }

        .shared-workflow-buttons {
          display: flex;
          gap: 10px;
          justify-content: center;
          flex-wrap: wrap;
        }

        .shared-workflow-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 12px 20px;
          font-size: 14px;
          font-weight: 600;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .shared-workflow-btn:active {
          transform: scale(0.97);
        }

        .shared-workflow-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .shared-workflow-btn-later {
          background: transparent;
          color: var(--text-muted, #6b7280);
        }

        .shared-workflow-btn-later:hover:not(:disabled) {
          background: var(--bg-hover, #f3f4f6);
          color: var(--text-primary, #374151);
        }

        .shared-workflow-btn-reject {
          background: var(--bg-tertiary, #e5e7eb);
          color: var(--text-primary, #374151);
        }

        .shared-workflow-btn-reject:hover:not(:disabled) {
          background: var(--error-color, #ef4444);
          color: #ffffff;
        }

        .shared-workflow-btn-accept {
          background: var(--accent-color, #3b82f6);
          color: #ffffff;
          flex: 1;
          max-width: 160px;
        }

        .shared-workflow-btn-accept:hover:not(:disabled) {
          background: var(--accent-hover, #2563eb);
        }

        /* Spinning animation for loading */
        .shared-workflow-btn .spin {
          animation: shared-spin 1s linear infinite;
        }

        @keyframes shared-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* Dark theme */
        @media (prefers-color-scheme: dark) {
          .shared-workflow-card {
            background: var(--bg-primary, #1f2937);
          }

          .shared-workflow-title {
            color: var(--text-primary, #f3f4f6);
          }

          .shared-workflow-message {
            color: var(--text-secondary, #9ca3af);
          }

          .shared-workflow-message strong {
            color: var(--text-primary, #f3f4f6);
          }

          .shared-workflow-info {
            background: var(--bg-secondary, #111827);
          }

          .shared-workflow-info-item + .shared-workflow-info-item {
            border-top-color: var(--border-color, #374151);
          }

          .shared-workflow-info-value {
            color: var(--text-primary, #f3f4f6);
          }

          .shared-workflow-btn-later:hover:not(:disabled) {
            background: var(--bg-hover, #374151);
          }

          .shared-workflow-btn-reject {
            background: var(--bg-tertiary, #374151);
            color: var(--text-primary, #e5e7eb);
          }
        }

        /* Responsive */
        @media (max-width: 480px) {
          .shared-workflow-card {
            width: 95%;
            padding: 24px 20px;
          }

          .shared-workflow-icon {
            width: 64px;
            height: 64px;
          }

          .shared-workflow-icon svg {
            width: 32px;
            height: 32px;
          }

          .shared-workflow-title {
            font-size: 18px;
          }

          .shared-workflow-buttons {
            flex-direction: column;
          }

          .shared-workflow-btn {
            width: 100%;
          }

          .shared-workflow-btn-accept {
            max-width: none;
            order: -1;
          }
        }
      </style>
    `;
    return overlay;
  }
  static _bindEvents(overlay) {
    const laterBtn = overlay.querySelector("#sharedWorkflowLaterBtn");
    const rejectBtn = overlay.querySelector("#sharedWorkflowRejectBtn");
    const acceptBtn = overlay.querySelector("#sharedWorkflowAcceptBtn");
    laterBtn?.addEventListener("click", () => this.later());
    rejectBtn?.addEventListener("click", () => this.reject());
    acceptBtn?.addEventListener("click", () => this.accept());
    const handleKeydown = (e) => {
      if (e.key === "Escape") {
        this.later();
        document.removeEventListener("keydown", handleKeydown);
      }
    };
    document.addEventListener("keydown", handleKeydown);
  }
  static _setLoading(loading, action = null) {
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    const overlay = this._element;
    if (!overlay) return;
    const laterBtn = overlay.querySelector("#sharedWorkflowLaterBtn");
    const rejectBtn = overlay.querySelector("#sharedWorkflowRejectBtn");
    const acceptBtn = overlay.querySelector("#sharedWorkflowAcceptBtn");
    if (loading) {
      laterBtn.disabled = true;
      rejectBtn.disabled = true;
      acceptBtn.disabled = true;
      const loadingHtml = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
          <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
        </svg>
      `;
      if (action === "accept") {
        acceptBtn.innerHTML =
          loadingHtml + t("workflow.shareOverlay.accepting", "Processing...");
      } else if (action === "reject") {
        rejectBtn.innerHTML =
          loadingHtml + t("workflow.shareOverlay.rejecting", "Processing...");
      }
    } else {
      laterBtn.disabled = false;
      rejectBtn.disabled = false;
      acceptBtn.disabled = false;
      rejectBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
        ${t("workflow.shareOverlay.reject", "Reject")}
      `;
      acceptBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        ${t("workflow.shareOverlay.accept", "Accept")}
      `;
    }
  }
  static async _apiCall(method, endpoint, data = null) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: "apiRequest",
          method,
          endpoint,
          data,
          token: window.authManager?.getToken(),
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(
              new Error(chrome.runtime.lastError.message || "Connection error"),
            );
            return;
          }
          if (!response) {
            reject(
              new Error(
                "Kh\xF4ng nh\u1EADn \u0111\u01B0\u1EE3c ph\u1EA3n h\u1ED3i t\u1EEB server",
              ),
            );
            return;
          }
          if (response.success) {
            resolve(response.data);
          } else {
            const error = new Error(response.error?.message || "API error");
            error.code = response.error?.code;
            error.httpStatus = response.httpStatus;
            reject(error);
          }
        },
      );
    });
  }
  static _escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
__publicField(SharedWorkflowOverlay, "_element", null);
__publicField(SharedWorkflowOverlay, "_currentData", null);
window.SharedWorkflowOverlay = SharedWorkflowOverlay;
if (window.eventBus) {
  window.eventBus.on("notification:show_shared_overlay", (data) => {
    try {
      SharedWorkflowOverlay.show(data);
    } catch (err) {
      console.warn(
        "[SharedWorkflowOverlay] Auto-show error:",
        err?.message || err,
      );
    }
  });
}
