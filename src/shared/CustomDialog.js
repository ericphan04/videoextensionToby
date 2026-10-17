(function () {
  "use strict";
  class CustomDialog {
    constructor() {
      this._overlay = null;
    }
    alert(message, options = {}) {
      const {
        title = window.I18n?.t("dialog.notification") || "Notification",
        type = "info",
        html = false,
        buttons: customButtons,
      } = options;
      return new Promise((resolve) => {
        const defaultButtons = [
          { label: "OK", primary: true, action: () => resolve() },
        ];
        this._show({
          title,
          message,
          type,
          html,
          buttons: customButtons || defaultButtons,
        });
      });
    }
    confirm(message, options = {}) {
      const {
        title = window.I18n?.t("dialog.confirm") || "Confirm",
        type = "warning",
        confirmText = window.I18n?.t("common.confirm") || "Confirm",
        cancelText = window.I18n?.t("common.cancel") || "Cancel",
        confirmIcon = null,
      } = options;
      return new Promise((resolve) => {
        this._show({
          title,
          message,
          type,
          buttons: [
            { label: cancelText, primary: false, action: () => resolve(false) },
            {
              label: confirmText,
              primary: true,
              icon: confirmIcon,
              action: () => resolve(true),
            },
          ],
        });
      });
    }
    confirmResumeOrRerun(message, options = {}) {
      const {
        title = window.I18n?.t("workflow.resumeOrRerunTitle") ||
          "Continue or re-run?",
        type = "info",
        resumeText = window.I18n?.t("common.continue") || "Continue",
        rerunText = window.I18n?.t("workflow.rerun") || "Re-run",
        cancelText = window.I18n?.t("common.cancel") || "Cancel",
      } = options;
      return new Promise((resolve) => {
        this._show({
          title,
          message,
          type,
          showClose: true,
          onDismiss: () => resolve(null),
          buttons: [
            { label: cancelText, primary: false, action: () => resolve(null) },
            {
              label: rerunText,
              primary: false,
              action: () => resolve("rerun"),
            },
            {
              label: resumeText,
              primary: true,
              action: () => resolve("resume"),
            },
          ],
        });
      });
    }
    confirmDangerous(message, options = {}) {
      const {
        title = window.I18n?.t("dialog.confirmDangerous") || "Confirm Delete",
        itemName = "",
        confirmText = window.I18n?.t("common.delete") || "Delete",
        cancelText = window.I18n?.t("common.cancel") || "Cancel",
        zIndex = null,
      } = options;
      return new Promise((resolve) => {
        this._close();
        this._overlay = document.createElement("div");
        this._overlay.className = "cdialog-overlay";
        if (Number.isFinite(zIndex))
          this._overlay.style.zIndex = String(zIndex);
        this._overlay.innerHTML = `
          <div class="cdialog-box cdialog-compact">
            <div class="cdialog-header">
              <div class="cdialog-icon cdialog-error">${this._getIcon("error")}</div>
              <div class="cdialog-title">${this._escapeHtml(title)}</div>
            </div>
            <div class="cdialog-body">
              ${itemName ? `<div class="cdialog-item-name">${this._escapeHtml(itemName)}</div>` : ""}
              <div class="cdialog-message">${this._escapeHtml(message)}</div>
            </div>
            <div class="cdialog-footer">
              <button class="cdialog-btn cdialog-btn-secondary" data-action="cancel">
                ${this._escapeHtml(cancelText)}
              </button>
              <button class="cdialog-btn cdialog-btn-danger" data-action="confirm">
                ${this._escapeHtml(confirmText)}
              </button>
            </div>
          </div>
        `;
        const confirmBtn = this._overlay.querySelector(
          '[data-action="confirm"]',
        );
        const cancelBtn = this._overlay.querySelector('[data-action="cancel"]');
        confirmBtn.addEventListener("click", () => {
          this._close();
          resolve(true);
        });
        cancelBtn.addEventListener("click", () => {
          this._close();
          resolve(false);
        });
        this._escHandler = (e) => {
          if (e.key === "Escape") {
            this._close();
            resolve(false);
          } else if (e.key === "Enter") {
            this._close();
            resolve(true);
          }
        };
        document.addEventListener("keydown", this._escHandler);
        ["mousedown", "mouseup", "pointerdown", "pointerup"].forEach((evt) => {
          this._overlay.addEventListener(evt, (e) => e.stopPropagation());
        });
        document.body.appendChild(this._overlay);
        confirmBtn.focus();
      });
    }
    prompt(message, options = {}) {
      const {
        title = window.I18n?.t("dialog.input") || "Input",
        placeholder = "",
        confirmText = window.I18n?.t("common.ok") || "OK",
        cancelText = window.I18n?.t("common.cancel") || "Cancel",
        defaultValue = "",
        icon = "info",
      } = options;
      return new Promise((resolve) => {
        this._showPrompt({
          title,
          message,
          icon,
          placeholder,
          defaultValue,
          buttons: [
            { label: cancelText, primary: false, action: () => resolve(null) },
            {
              label: confirmText,
              primary: true,
              action: (val) => resolve(val),
            },
          ],
        });
      });
    }
    _showPrompt({
      title,
      message,
      placeholder,
      defaultValue,
      icon = "info",
      buttons,
    }) {
      this._close();
      this._overlay = document.createElement("div");
      this._overlay.className = "cdialog-overlay";
      this._overlay.innerHTML = `
        <div class="cdialog-box">
          <div class="cdialog-header">
            <div class="cdialog-icon cdialog-info">${this._getIcon(icon)}</div>
            <div class="cdialog-title">${this._escapeHtml(title)}</div>
          </div>
          <div class="cdialog-body">
            <div style="margin-bottom: 12px;">${this._escapeHtml(message)}</div>
            <input type="text" class="cdialog-input" placeholder="${this._escapeHtml(placeholder)}" value="${this._escapeHtml(defaultValue)}">
          </div>
          <div class="cdialog-footer">
            ${buttons
              .map(
                (btn, i) => `
              <button class="cdialog-btn ${btn.primary ? "cdialog-btn-primary" : "cdialog-btn-secondary"}" data-idx="${i}">
                ${this._escapeHtml(btn.label)}
              </button>
            `,
              )
              .join("")}
          </div>
        </div>
      `;
      const input = this._overlay.querySelector(".cdialog-input");
      this._overlay.querySelectorAll(".cdialog-btn").forEach((btnEl) => {
        btnEl.addEventListener("click", () => {
          const idx = parseInt(btnEl.dataset.idx);
          const val = input.value.trim();
          this._close();
          buttons[idx]?.action(val);
        });
      });
      this._escHandler = (e) => {
        if (e.key === "Escape") {
          this._close();
          const cancelBtn = buttons.find((b) => !b.primary);
          cancelBtn?.action(null);
        } else if (e.key === "Enter") {
          this._close();
          const confirmBtn = buttons.find((b) => b.primary);
          confirmBtn?.action(input.value.trim());
        }
      };
      document.addEventListener("keydown", this._escHandler);
      ["mousedown", "mouseup", "pointerdown", "pointerup"].forEach((evt) => {
        this._overlay.addEventListener(evt, (e) => e.stopPropagation());
      });
      document.body.appendChild(this._overlay);
      setTimeout(() => {
        input.focus();
        input.select();
      }, 10);
    }
    _getIcon(type) {
      switch (type) {
        case "chrome":
          return `<svg width="22" height="22" viewBox="0 0 100 100" aria-hidden="true">
            <path fill="#ea4335" d="M50 0a50 50 0 0 1 43.301 25H50a25 25 0 0 0-21.651 37.5L6.699 25A50 50 0 0 1 50 0Z"/>
            <path fill="#fbbc05" d="M93.301 25A50 50 0 0 1 50 100L71.651 62.5A25 25 0 0 0 50 25Z"/>
            <path fill="#34a853" d="M50 100A50 50 0 0 1 6.699 25L28.349 62.5A25 25 0 0 0 71.651 62.5Z"/>
            <circle cx="50" cy="50" r="24" fill="#fff"/>
            <circle cx="50" cy="50" r="21" fill="#4285f4"/>
          </svg>`;
        case "upload":
          return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 16V3m0 0L7 8m5-5 5 5"></path>
            <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"></path>
          </svg>`;
        case "warning":
          return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>`;
        case "error":
          return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>`;
        case "success":
          return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>`;
        case "device":
          return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="4" y="3" width="16" height="12" rx="2"></rect>
            <path d="M8 21h8"></path><path d="M12 15v6"></path>
          </svg>`;
        default:
          return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>`;
      }
    }
    _show({
      title,
      message,
      type,
      buttons,
      html = false,
      showClose = false,
      onDismiss = null,
    }) {
      this._close();
      const _dismiss = () => {
        this._close();
        if (typeof onDismiss === "function") {
          onDismiss();
          return;
        }
        const cancelBtn =
          buttons.find((b) => !b.primary) || buttons[buttons.length - 1];
        cancelBtn?.action();
      };
      const _closeIcon =
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      this._overlay = document.createElement("div");
      this._overlay.className = "cdialog-overlay";
      const messageContent = html ? message : this._escapeHtml(message);
      this._overlay.innerHTML = `
        <div class="cdialog-box">
          <div class="cdialog-header">
            <div class="cdialog-icon cdialog-${type}">${this._getIcon(type)}</div>
            <div class="cdialog-title">${this._escapeHtml(title)}</div>
            ${showClose ? `<button class="cdialog-close" data-action="dismiss" aria-label="Close" style="margin-left:auto;background:transparent;border:none;color:inherit;opacity:0.6;cursor:pointer;padding:4px;display:flex;border-radius:6px;">${_closeIcon}</button>` : ""}
          </div>
          <div class="cdialog-body">${messageContent}</div>
          <div class="cdialog-footer">
            ${buttons
              .map(
                (btn, i) => `
              <button class="cdialog-btn ${btn.primary ? "cdialog-btn-primary" : "cdialog-btn-secondary"}${btn.icon === "upload" ? " cdialog-btn-with-icon" : ""}" data-idx="${i}">
                ${btn.icon === "upload" ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V3m0 0L7 8m5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>' : ""}
                ${this._escapeHtml(btn.label)}
              </button>
            `,
              )
              .join("")}
          </div>
        </div>
      `;
      this._overlay.querySelectorAll(".cdialog-btn").forEach((btnEl) => {
        btnEl.addEventListener("click", (e) => {
          e.stopPropagation();
          e.preventDefault();
          const idx = parseInt(btnEl.dataset.idx);
          const action = buttons[idx]?.action;
          this._close();
          action?.();
        });
      });
      const _closeBtn = this._overlay.querySelector(".cdialog-close");
      if (_closeBtn) {
        _closeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          e.preventDefault();
          _dismiss();
        });
      }
      this._escHandler = (e) => {
        if (e.key === "Escape") {
          _dismiss();
        }
      };
      document.addEventListener("keydown", this._escHandler);
      ["mousedown", "mouseup", "pointerdown", "pointerup", "click"].forEach(
        (evt) => {
          this._overlay.addEventListener(evt, (e) => e.stopPropagation());
        },
      );
      this._overlay.addEventListener("click", (e) => {
        if (e.target === this._overlay) {
          _dismiss();
        }
      });
      document.body.appendChild(this._overlay);
      const primaryBtn = this._overlay.querySelector(".cdialog-btn-primary");
      primaryBtn?.focus();
    }
    _close() {
      if (this._overlay) {
        if (this._overlay.parentNode) {
          this._overlay.parentNode.removeChild(this._overlay);
        } else {
          this._overlay.remove();
        }
        this._overlay = null;
      }
      if (this._escHandler) {
        document.removeEventListener("keydown", this._escHandler);
        this._escHandler = null;
      }
    }
    _escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text || "";
      return div.innerHTML;
    }
  }
  window.CustomDialog = CustomDialog;
  window.customDialog = new CustomDialog();
})();
