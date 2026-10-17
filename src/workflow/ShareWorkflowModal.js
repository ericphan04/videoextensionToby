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
class ShareWorkflowModal {
  static async show(wfId) {
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    this._close();
    return new Promise((resolve) => {
      const modal = this._createModal();
      document.body.appendChild(modal);
      this._instance = modal;
      this._bindEvents(modal, wfId, resolve);
      requestAnimationFrame(() => {
        modal.classList.add("visible");
        const emailInput = modal.querySelector("#shareWorkflowEmail");
        emailInput?.focus();
      });
    });
  }
  static _close() {
    if (this._instance) {
      this._instance.classList.remove("visible");
      setTimeout(() => {
        this._instance?.remove();
        this._instance = null;
      }, 200);
    }
  }
  static isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
  static _createModal() {
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    const modal = document.createElement("div");
    modal.className = "share-workflow-modal";
    modal.innerHTML = `
      <div class="share-workflow-backdrop"></div>
      <div class="share-workflow-content">
        <div class="share-workflow-header">
          <h3>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="18" cy="5" r="3"/>
              <circle cx="6" cy="12" r="3"/>
              <circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            ${t("workflow.share.title", "Share Workflow")}
          </h3>
          <button class="share-workflow-close" type="button" aria-label="${t("common.close", "Close")}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="share-workflow-body">
          <!-- Email -->
          <div class="share-workflow-field">
            <label for="shareWorkflowEmail">${t("workflow.share.emailLabel", "Recipient email")} <span class="required">*</span></label>
            <input type="email"
                   id="shareWorkflowEmail"
                   placeholder="${t("workflow.share.emailPlaceholder", "Enter email of the person you want to share with...")}"
                   required
                   maxlength="255"
                   autocomplete="email" />
          </div>

          <!-- Note -->
          <div class="share-workflow-field">
            <label for="shareWorkflowNote">
              ${t("workflow.share.noteLabel", "Note")}
              <span class="char-count"><span id="shareWorkflowNoteCount">0</span>/500</span>
            </label>
            <textarea id="shareWorkflowNote"
                      rows="3"
                      placeholder="${t("workflow.share.notePlaceholder", "Add a note for the recipient (optional)...")}"
                      maxlength="500"></textarea>
          </div>

          <!-- Th\xF4ng b\xE1o l\u1ED7i inline -->
          <div class="share-workflow-error hidden" id="shareWorkflowError">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span id="shareWorkflowErrorText"></span>
          </div>
        </div>

        <div class="share-workflow-footer">
          <button class="btn btn-secondary" type="button" id="shareWorkflowCancelBtn">${t("common.cancel", "Cancel")}</button>
          <button class="btn btn-primary" type="button" id="shareWorkflowSubmitBtn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="18" cy="5" r="3"/>
              <circle cx="6" cy="12" r="3"/>
              <circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            ${t("workflow.share.submit", "Share")}
          </button>
        </div>
      </div>

      <style>
        /* ShareWorkflowModal - sync v\u1EDBi imgpicker-modal pattern */
        .share-workflow-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.75);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000010;
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.2s ease, visibility 0.2s ease;
        }

        .share-workflow-modal.visible {
          opacity: 1;
          visibility: visible;
        }

        .share-workflow-backdrop {
          position: absolute;
          inset: 0;
        }

        .share-workflow-content {
          position: relative;
          width: 92%;
          max-width: 420px;
          max-height: 85vh;
          background: var(--card, #1c1c1f);
          border-radius: 12px;
          border: 1px solid var(--border, #1e3050);
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
          overflow: hidden;
        }

        .share-workflow-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border, #1e3050);
        }

        .share-workflow-header h3 {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0;
          font-size: 15px;
          font-weight: 600;
          color: var(--foreground, #f8fafc);
        }

        .share-workflow-header h3 svg {
          color: var(--primary);
        }

        .share-workflow-close {
          background: none;
          border: none;
          color: var(--muted-foreground, #8b8b92);
          cursor: pointer;
          padding: 4px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          transition: all 150ms;
        }

        .share-workflow-close:hover {
          color: var(--foreground, #f8fafc);
          background: var(--surface, #252529);
        }

        .share-workflow-body {
          padding: 20px;
          overflow-y: auto;
          flex: 1;
        }

        .share-workflow-field {
          margin-bottom: 16px;
        }

        .share-workflow-field:last-child {
          margin-bottom: 0;
        }

        .share-workflow-field label {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 6px;
          font-size: 13px;
          font-weight: 500;
          color: var(--foreground, #f8fafc);
        }

        .share-workflow-field label .required {
          color: var(--destructive, #ef4444);
        }

        .share-workflow-field label .char-count {
          font-weight: 400;
          font-size: 11px;
          color: var(--muted-foreground, #8b8b92);
        }

        .share-workflow-field input,
        .share-workflow-field textarea {
          width: 100%;
          padding: 10px 12px;
          font-size: 13px;
          line-height: 1.5;
          color: var(--foreground, #f8fafc);
          background: var(--surface, #252529);
          border: 1px solid var(--border, #1e3050);
          border-radius: 8px;
          outline: none;
          transition: border-color 150ms, box-shadow 150ms;
        }

        .share-workflow-field input:focus,
        .share-workflow-field textarea:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 2px rgba(204, 255, 0, 0.15);
        }

        .share-workflow-field input.error,
        .share-workflow-field textarea.error {
          border-color: var(--destructive, #ef4444);
        }

        .share-workflow-field input::placeholder,
        .share-workflow-field textarea::placeholder {
          color: var(--muted-foreground, #8b8b92);
        }

        .share-workflow-field textarea {
          resize: vertical;
          min-height: 80px;
        }

        .share-workflow-error {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 10px 12px;
          margin-top: 16px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 8px;
          color: var(--destructive, #ef4444);
          font-size: 12px;
          line-height: 1.4;
        }

        .share-workflow-error.hidden {
          display: none;
        }

        .share-workflow-error svg {
          flex-shrink: 0;
          margin-top: 1px;
        }

        .share-workflow-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          padding: 16px 20px;
          border-top: 1px solid var(--border, #1e3050);
        }

        .share-workflow-footer .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 500;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: all 150ms;
        }

        .share-workflow-footer .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .share-workflow-footer .btn-secondary {
          background: var(--surface, #252529);
          color: var(--foreground, #f8fafc);
        }

        .share-workflow-footer .btn-secondary:hover:not(:disabled) {
          background: var(--muted, #2e2e33);
        }

        .share-workflow-footer .btn-primary {
          background: var(--primary);
          color: var(--primary-foreground);
        }

        .share-workflow-footer .btn-primary:hover:not(:disabled) {
          filter: brightness(1.1);
        }

        .share-workflow-footer .btn .spin {
          animation: share-spin 1s linear infinite;
        }

        @keyframes share-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      </style>
    `;
    return modal;
  }
  static _bindEvents(modal, wfId, resolve) {
    const closeBtn = modal.querySelector(".share-workflow-close");
    const cancelBtn = modal.querySelector("#shareWorkflowCancelBtn");
    const submitBtn = modal.querySelector("#shareWorkflowSubmitBtn");
    const backdrop = modal.querySelector(".share-workflow-backdrop");
    const emailInput = modal.querySelector("#shareWorkflowEmail");
    const noteTextarea = modal.querySelector("#shareWorkflowNote");
    const noteCount = modal.querySelector("#shareWorkflowNoteCount");
    const handleClose = () => {
      this._close();
      resolve(false);
    };
    closeBtn?.addEventListener("click", handleClose);
    cancelBtn?.addEventListener("click", handleClose);
    backdrop?.addEventListener("click", handleClose);
    const handleKeydown = (e) => {
      if (e.key === "Escape") {
        handleClose();
        document.removeEventListener("keydown", handleKeydown);
      }
    };
    document.addEventListener("keydown", handleKeydown);
    noteTextarea?.addEventListener("input", () => {
      const count = noteTextarea.value.length;
      if (noteCount) {
        noteCount.textContent = count;
      }
    });
    emailInput?.addEventListener("input", () => {
      emailInput.classList.remove("error");
      this._hideError(modal);
    });
    emailInput?.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        await this._handleSubmit(modal, wfId, resolve);
      }
    });
    submitBtn?.addEventListener("click", async () => {
      await this._handleSubmit(modal, wfId, resolve);
    });
  }
  static async _handleSubmit(modal, wfId, resolve) {
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    const emailInput = modal.querySelector("#shareWorkflowEmail");
    const noteTextarea = modal.querySelector("#shareWorkflowNote");
    const submitBtn = modal.querySelector("#shareWorkflowSubmitBtn");
    const email = emailInput?.value?.trim();
    const note = noteTextarea?.value?.trim() || "";
    if (!email) {
      this._showError(
        modal,
        t("workflow.share.emailRequired", "Please enter recipient email"),
      );
      emailInput?.classList.add("error");
      emailInput?.focus();
      return;
    }
    if (!this.isValidEmail(email)) {
      this._showError(
        modal,
        t("workflow.share.emailInvalid", "Invalid email address"),
      );
      emailInput?.classList.add("error");
      emailInput?.focus();
      return;
    }
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
        <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
        <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
      </svg>
      ${t("workflow.share.submitting", "Sharing...")}
    `;
    try {
      const result = await this._submitShare(wfId, email, note);
      this._close();
      const successMsg = result?.replaced
        ? result.message ||
          t("workflow.share.successResend", "Resent workflow share invitation")
        : result?.message ||
          t(
            "workflow.share.success",
            "Workflow share invitation sent successfully",
          );
      window.showNotification?.(successMsg, "success");
      resolve(true);
    } catch (err) {
      console.error("[ShareWorkflowModal] L\u1ED7i chia s\u1EBB:", err);
      const httpStatus = err.httpStatus;
      const errorCode = err.code;
      let errorMessage = err.message;
      if (httpStatus === 422) {
        if (errorCode === "INVALID_RECIPIENT" || errorCode === "SHARE_SELF") {
          errorMessage = t(
            "workflow.share.errorShareSelf",
            "You cannot share a workflow with yourself",
          );
        } else if (errorCode === "EMAIL_INVALID") {
          errorMessage = t(
            "workflow.share.errorEmailInvalid",
            "Invalid email or user does not exist",
          );
        } else if (
          errorCode === "SHARE_EXISTS" ||
          errorCode === "ALREADY_SHARED"
        ) {
          errorMessage = t(
            "workflow.share.errorAlreadyShared",
            "This workflow has already been shared with this person",
          );
        } else {
          errorMessage =
            err.message || t("workflow.share.errorValidation", "Invalid data");
        }
        this._showError(modal, errorMessage);
        emailInput?.classList.add("error");
      } else if (httpStatus === 403) {
        if (errorCode === "FEATURE_DISABLED") {
          errorMessage =
            err.message ||
            t(
              "workflow.share.errorFeatureDisabled",
              "Workflow sharing is not enabled for your plan.",
            );
        } else if (errorCode === "EMAIL_NOT_VERIFIED") {
          errorMessage =
            err.message ||
            t(
              "workflow.share.errorEmailNotVerified",
              "You need to verify your email before sharing a workflow.",
            );
        } else {
          errorMessage =
            err.message ||
            t("workflow.share.error", "Failed to share workflow");
        }
        this._showError(modal, errorMessage);
      } else if (httpStatus === 429) {
        errorMessage = t(
          "workflow.share.errorRateLimit",
          "You have sent too many invitations. Please try again later.",
        );
        this._showError(modal, errorMessage);
      } else {
        window.showNotification?.(
          err.message || t("workflow.share.error", "Failed to share workflow"),
          "error",
        );
      }
      submitBtn.disabled = false;
      submitBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="18" cy="5" r="3"/>
          <circle cx="6" cy="12" r="3"/>
          <circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
        ${t("workflow.share.submit", "Share")}
      `;
    }
  }
  static async _submitShare(wfId, email, note) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: "apiRequest",
          method: "POST",
          endpoint: `workflows/${wfId}/shares`,
          token: window.authManager?.getToken(),
          data: { recipient_email: email, note: note || null },
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
            resolve({
              data: response.data,
              replaced: response.replaced || false,
              replacedPreviousStatus: response.replaced_previous_status || null,
              message: response.message || null,
            });
          } else {
            const error = new Error(
              response.error?.message || "Failed to share workflow",
            );
            error.code = response.error?.code;
            error.httpStatus = response.httpStatus;
            reject(error);
          }
        },
      );
    });
  }
  static _showError(modal, message) {
    const errorEl = modal.querySelector("#shareWorkflowError");
    const textEl = modal.querySelector("#shareWorkflowErrorText");
    if (errorEl && textEl) {
      textEl.textContent = message;
      errorEl.classList.remove("hidden");
    }
  }
  static _hideError(modal) {
    const errorEl = modal.querySelector("#shareWorkflowError");
    if (errorEl) {
      errorEl.classList.add("hidden");
    }
  }
}
__publicField(ShareWorkflowModal, "_instance", null);
window.ShareWorkflowModal = ShareWorkflowModal;
