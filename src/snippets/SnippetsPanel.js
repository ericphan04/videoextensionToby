(function () {
  "use strict";
  class SnippetsPanel {
    constructor(container) {
      this.container = container;
      this.isExpanded = false;
      this.initialized = false;
    }
    async init() {
      if (this.initialized) return;
      this.initialized = true;
      if (
        window.userPromptsManager &&
        !window.userPromptsManager.isInitialized
      ) {
        await window.userPromptsManager.init();
      }
      this.render();
      this.bindEvents();
      await this.refresh();
      console.log("[TobyFlow] SnippetsPanel initialized");
    }
    render() {
      this.container.innerHTML = `
        <div class="snippets-panel">
          <div class="snippets-header" id="snippetsToggleHeader">
            <div class="snippets-header-left">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path>
              </svg>
              <label>${window.I18n?.t("snippets.title") || "Snippets"}</label>
              <span class="snippets-count" id="snippetsCount">0</span>
            </div>
            <svg class="snippets-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>
          <div class="snippets-body hidden" id="snippetsBody">
            <div class="snippets-actions">
              <button class="btn btn-secondary btn-sm" id="saveAsSnippetBtn">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                ${window.I18n?.t("snippets.saveCurrentPrompt") || "Save current prompt"}
              </button>
            </div>
            <div class="snippets-list" id="snippetsList"></div>
            <div class="snippets-empty hidden" id="snippetsEmpty">
              <p>${window.I18n?.t("snippets.noSnippets") || "No snippets yet. Save your first prompt."}</p>
            </div>
          </div>
        </div>
      `;
    }
    async refresh() {
      if (!window.userPromptsManager) return;
      await window.userPromptsManager.loadPrompts();
      const prompts = window.userPromptsManager.getPrompts();
      const countEl = this.container.querySelector("#snippetsCount");
      const listEl = this.container.querySelector("#snippetsList");
      const emptyEl = this.container.querySelector("#snippetsEmpty");
      if (countEl) countEl.textContent = prompts.length;
      if (!listEl) return;
      if (prompts.length === 0) {
        listEl.innerHTML = "";
        listEl.classList.add("hidden");
        if (emptyEl) emptyEl.classList.remove("hidden");
        return;
      }
      if (emptyEl) emptyEl.classList.add("hidden");
      listEl.classList.remove("hidden");
      listEl.innerHTML = prompts
        .map((p) => this._renderSnippetItem(p))
        .join("");
    }
    _renderSnippetItem(prompt) {
      const id = prompt.id;
      const title = this._escapeHtml(
        prompt.title || window.I18n?.t("snippets.untitled") || "Untitled",
      );
      const content = this._escapeHtml(
        this._truncate(prompt.content || "", 50),
      );
      const category = prompt.category ? this._escapeHtml(prompt.category) : "";
      const variables = window.userPromptsManager.extractVariables(
        prompt.content || "",
      );
      const hasVars = variables.length > 0;
      return `
        <div class="snippet-item" data-id="${id}">
          <div class="snippet-item-body">
            <div class="snippet-item-title">${title}</div>
            <div class="snippet-item-content">${content}</div>
            <div class="snippet-item-meta">
              ${category ? `<span class="snippet-category-badge">${category}</span>` : ""}
              ${hasVars ? `<span class="snippet-var-badge">${window.I18n?.t("snippets.variableCount", { count: variables.length }) || variables.length + " variables"}</span>` : ""}
            </div>
          </div>
          <div class="snippet-item-actions">
            <button class="snippet-action-btn snippet-insert-btn" data-action="insert" data-id="${id}" title="${window.I18n?.t("snippets.insertIntoPrompt") || "Insert into prompt"}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 3h6v6"></path>
                <path d="M10 14 21 3"></path>
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              </svg>
            </button>
            <button class="snippet-action-btn snippet-edit-btn" data-action="edit" data-id="${id}" title="${window.I18n?.t("common.edit") || "Edit"}">
              <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.75 15.7502H9.75002M1.875 16.1252L6.03695 14.5245C6.30316 14.4221 6.43626 14.3709 6.56079 14.3041C6.6714 14.2447 6.77685 14.1761 6.87603 14.0992C6.98769 14.0125 7.08853 13.9117 7.29021 13.71L15.75 5.25023C16.5784 4.4218 16.5784 3.07865 15.75 2.25023C14.9216 1.4218 13.5784 1.4218 12.75 2.25022L4.29021 10.71C4.08853 10.9117 3.98769 11.0125 3.90104 11.1242C3.82408 11.2234 3.75555 11.3288 3.69618 11.4394C3.62933 11.564 3.57814 11.6971 3.47575 11.9633L1.875 16.1252ZM1.875 16.1252L3.41859 12.1119C3.52905 11.8248 3.58428 11.6812 3.67901 11.6154C3.76179 11.5579 3.86423 11.5362 3.96322 11.5551C4.0765 11.5767 4.18529 11.6855 4.40286 11.9031L6.09718 13.5974C6.31475 13.815 6.42354 13.9237 6.44517 14.037C6.46408 14.136 6.44234 14.2385 6.38486 14.3212C6.31908 14.416 6.17549 14.4712 5.8883 14.5817L1.875 16.1252Z"/></svg>
            </button>
            <button class="snippet-action-btn snippet-delete-btn" data-action="delete" data-id="${id}" title="${window.I18n?.t("common.delete") || "Delete"}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `;
    }
    _insertSnippet(prompt) {
      const variables = window.userPromptsManager.extractVariables(
        prompt.content || "",
      );
      if (variables.length > 0) {
        this._showVariableDialog(prompt);
        return;
      }
      this._applyToEditor(prompt.content);
    }
    _applyToEditor(text) {
      const promptsArea = document.getElementById("promptsArea");
      if (promptsArea) {
        const current = promptsArea.value;
        promptsArea.value = current ? current + "\n" + text : text;
        promptsArea.dispatchEvent(new Event("input", { bubbles: true }));
        promptsArea.focus();
      }
      console.log("[TobyFlow] Snippet inserted into prompt");
    }
    _showVariableDialog(prompt) {
      const variables = window.userPromptsManager.extractVariables(
        prompt.content || "",
      );
      if (variables.length === 0) {
        this._applyToEditor(prompt.content);
        return;
      }
      const overlay = document.createElement("div");
      overlay.className = "snippet-dialog-overlay";
      overlay.innerHTML = `
        <div class="snippet-dialog">
          <div class="snippet-dialog-header">
            <div class="snippet-dialog-title">${window.I18n?.t("snippets.fillVariables") || "Fill variables"}</div>
            <button class="snippet-dialog-close" id="snippetDialogClose">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div class="snippet-dialog-preview">
            <div class="snippet-dialog-preview-label">${window.I18n?.t("snippets.preview") || "Preview:"}</div>
            <div class="snippet-dialog-preview-text" id="snippetPreviewText">${this._escapeHtml(prompt.content)}</div>
          </div>
          <div class="snippet-dialog-fields">
            ${variables
              .map(
                (v) => `
              <div class="snippet-dialog-field">
                <label>${this._escapeHtml(v)}</label>
                <div class="input-group">
                  <input type="text" data-var="${this._escapeAttr(v)}" placeholder="${window.I18n?.t("templates.enterValuePlaceholder") || "Enter value..."}" />
                </div>
              </div>
            `,
              )
              .join("")}
          </div>
          <div class="snippet-dialog-footer">
            <button class="btn btn-secondary btn-sm" id="snippetDialogCancel">${window.I18n?.t("common.cancel") || "Cancel"}</button>
            <button class="btn btn-primary btn-sm" id="snippetDialogApply">${window.I18n?.t("snippets.insertIntoPrompt") || "Insert into prompt"}</button>
          </div>
        </div>
      `;
      ["mousedown", "mouseup", "pointerdown", "pointerup"].forEach((evt) => {
        overlay.addEventListener(evt, (e) => e.stopPropagation());
      });
      document.body.appendChild(overlay);
      const previewEl = overlay.querySelector("#snippetPreviewText");
      const inputs = overlay.querySelectorAll("input[data-var]");
      const updatePreview = () => {
        const values = {};
        inputs.forEach((inp) => {
          values[inp.dataset.var] = inp.value || `{{${inp.dataset.var}}}`;
        });
        const filled = window.userPromptsManager.fillVariables(
          prompt.content,
          values,
        );
        previewEl.textContent = filled;
      };
      inputs.forEach((inp) => inp.addEventListener("input", updatePreview));
      const close = () => overlay.remove();
      overlay
        .querySelector("#snippetDialogClose")
        .addEventListener("click", close);
      overlay
        .querySelector("#snippetDialogCancel")
        .addEventListener("click", close);
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close();
      });
      overlay
        .querySelector("#snippetDialogApply")
        .addEventListener("click", () => {
          const values = {};
          inputs.forEach((inp) => {
            values[inp.dataset.var] = inp.value || "";
          });
          const filled = window.userPromptsManager.fillVariables(
            prompt.content,
            values,
          );
          this._applyToEditor(filled);
          close();
        });
      if (inputs.length > 0) inputs[0].focus();
    }
    _showSaveDialog(editId = null) {
      const existing = editId
        ? window.userPromptsManager.getById(editId)
        : null;
      const isEdit = !!existing;
      const promptsArea = document.getElementById("promptsArea");
      const defaultContent = isEdit
        ? existing.content
        : promptsArea?.value || "";
      const defaultTitle = isEdit ? existing.title : "";
      const defaultCategory = isEdit ? existing.category : "";
      const categories = window.userPromptsManager.getCategories();
      const overlay = document.createElement("div");
      overlay.className = "snippet-dialog-overlay";
      overlay.innerHTML = `
        <div class="snippet-dialog">
          <div class="snippet-dialog-header">
            <div class="snippet-dialog-title">${isEdit ? window.I18n?.t("snippets.editSnippet") || "Edit snippet" : window.I18n?.t("snippets.saveNewSnippet") || "Save new snippet"}</div>
            <button class="snippet-dialog-close" id="saveDialogClose">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div class="snippet-dialog-fields">
            <div class="snippet-dialog-field">
              <label>${window.I18n?.t("snippets.titleLabel") || "Title"}</label>
              <div class="input-group">
                <input type="text" id="snippetSaveTitle" placeholder="${window.I18n?.t("snippets.namePlaceholder") || "Snippet name..."}" value="${this._escapeAttr(defaultTitle)}" />
              </div>
            </div>
            <div class="snippet-dialog-field">
              <label>${window.I18n?.t("snippets.category") || "Category"}</label>
              <div class="input-group">
                <input type="text" id="snippetSaveCategory" placeholder="${window.I18n?.t("snippets.categoryPlaceholder") || "E.g.: Portrait, Landscape..."}" value="${this._escapeAttr(defaultCategory)}" list="snippetCategoryList" />
                <datalist id="snippetCategoryList">
                  ${categories.map((c) => `<option value="${this._escapeAttr(c)}">`).join("")}
                </datalist>
              </div>
            </div>
            <div class="snippet-dialog-field">
              <label>${window.I18n?.t("snippets.contentHint") || "Content (use {{variable_name}} to create variables)"}</label>
              <textarea id="snippetSaveContent" rows="5" placeholder="${window.I18n?.t("snippets.contentPlaceholder") || "Enter prompt content..."}">${this._escapeHtml(defaultContent)}</textarea>
            </div>
          </div>
          <div class="snippet-dialog-footer">
            <button class="btn btn-secondary btn-sm" id="saveDialogCancel">${window.I18n?.t("common.cancel") || "Cancel"}</button>
            <button class="btn btn-primary btn-sm" id="saveDialogConfirm">${isEdit ? window.I18n?.t("common.update") || "Update" : window.I18n?.t("common.save") || "Save"}</button>
          </div>
        </div>
      `;
      ["mousedown", "mouseup", "pointerdown", "pointerup"].forEach((evt) => {
        overlay.addEventListener(evt, (e) => e.stopPropagation());
      });
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay
        .querySelector("#saveDialogClose")
        .addEventListener("click", close);
      overlay
        .querySelector("#saveDialogCancel")
        .addEventListener("click", close);
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close();
      });
      overlay
        .querySelector("#saveDialogConfirm")
        .addEventListener("click", async () => {
          const title = overlay.querySelector("#snippetSaveTitle").value.trim();
          const category = overlay
            .querySelector("#snippetSaveCategory")
            .value.trim();
          const content = overlay
            .querySelector("#snippetSaveContent")
            .value.trim();
          if (!isEdit && window.featureGate) {
            const canCreate = await window.featureGate.canCreateSnippetAsync();
            if (!canCreate) {
              const isLoggedIn = window.authManager?.isLoggedIn();
              if (!isLoggedIn) {
                window.featureGate.showLoginPrompt(
                  window.I18n?.t("templates.requireLoginToSave") ||
                    "Login required to save prompts",
                );
              } else {
                const snippetsMax =
                  window.featureGate.entitlements?.snippets_max ?? 3;
                await window.customDialog?.confirm(
                  window.I18n?.t("snippets.quotaReachedDetail", {
                    max: snippetsMax,
                  }) ||
                    `B\u1EA1n \u0111\xE3 \u0111\u1EA1t gi\u1EDBi h\u1EA1n ${snippetsMax} prompt cho g\xF3i hi\u1EC7n t\u1EA1i. N\xE2ng c\u1EA5p \u0111\u1EC3 l\u01B0u kh\xF4ng gi\u1EDBi h\u1EA1n.`,
                  {
                    title:
                      window.I18n?.t("featuregate.featureLockedTitle") ||
                      "Feature Locked",
                    type: "warning",
                    confirmText: window.I18n?.t("common.upgrade") || "Upgrade",
                    cancelText: window.I18n?.t("common.close") || "Close",
                    onConfirm: () => {
                      window.eventBus?.emit("open:upgrade_modal");
                    },
                  },
                );
              }
              return;
            }
          }
          if (!content) {
            if (window.customDialog) {
              await window.customDialog.alert(
                window.I18n?.t("snippets.contentRequired") ||
                  "Prompt content cannot be empty.",
                {
                  title: window.I18n?.t("common.error") || "Error",
                  type: "warning",
                },
              );
            }
            return;
          }
          const data = {
            title: title || window.I18n?.t("snippets.untitled") || "Untitled",
            content,
            category,
          };
          try {
            if (isEdit) {
              await window.userPromptsManager.updatePrompt(editId, data);
            } else {
              await window.userPromptsManager.savePrompt(data);
            }
            close();
            await this.refresh();
            window.showNotification?.(
              isEdit
                ? window.I18n?.t("snippets.updatedSuccess") || "Snippet updated"
                : window.I18n?.t("snippets.savedSuccess") || "Snippet saved",
              "success",
            );
          } catch (err) {
            console.error(
              "[SnippetsPanel] L\u1ED7i l\u01B0u snippet:",
              err.message,
              err.code,
            );
            if (
              window.QuotaErrorHandler?.isQuotaError(err) ||
              err.status === 403
            ) {
              const snippetsMax =
                window.featureGate?.entitlements?.snippets_max ?? 3;
              await window.customDialog?.confirm(
                window.I18n?.t("snippets.quotaReachedDetail", {
                  max: snippetsMax,
                }) ||
                  `B\u1EA1n \u0111\xE3 \u0111\u1EA1t gi\u1EDBi h\u1EA1n ${snippetsMax} snippets theo g\xF3i hi\u1EC7n t\u1EA1i. N\xE2ng c\u1EA5p \u0111\u1EC3 l\u01B0u th\xEAm.`,
                {
                  title:
                    window.I18n?.t("snippets.quotaReached") ||
                    "Prompt limit reached",
                  confirmText: window.I18n?.t("common.upgrade") || "Upgrade",
                  cancelText: window.I18n?.t("common.close") || "Close",
                  type: "warning",
                  onConfirm: () => window.eventBus?.emit("open:upgrade_modal"),
                },
              );
            } else {
              window.customDialog?.alert(
                window.I18n?.t("common.saveFailed") ||
                  "Could not save: " + err.message,
                { type: "error" },
              );
            }
          }
        });
      overlay.querySelector("#snippetSaveTitle").focus();
    }
    bindEvents() {
      const header = this.container.querySelector("#snippetsToggleHeader");
      if (header) {
        header.addEventListener("click", () => {
          this.isExpanded = !this.isExpanded;
          const body = this.container.querySelector("#snippetsBody");
          const chevron = this.container.querySelector(".snippets-chevron");
          if (body) body.classList.toggle("hidden", !this.isExpanded);
          if (chevron) chevron.classList.toggle("expanded", this.isExpanded);
        });
      }
      const saveBtn = this.container.querySelector("#saveAsSnippetBtn");
      if (saveBtn) {
        saveBtn.addEventListener("click", () => this._showSaveDialog());
      }
      const listEl = this.container.querySelector("#snippetsList");
      if (listEl) {
        listEl.addEventListener("click", async (e) => {
          const actionBtn = e.target.closest("[data-action]");
          if (!actionBtn) return;
          const action = actionBtn.dataset.action;
          const id = actionBtn.dataset.id;
          if (action === "insert") {
            const prompt = window.userPromptsManager.getById(id);
            if (prompt) this._insertSnippet(prompt);
          } else if (action === "edit") {
            this._showSaveDialog(id);
          } else if (action === "delete") {
            const confirmed = window.customDialog
              ? await window.customDialog.confirm(
                  window.I18n?.t("snippets.confirmDelete") ||
                    "Are you sure you want to delete this snippet?",
                  {
                    title:
                      window.I18n?.t("snippets.deleteTitle") ||
                      "Delete snippet",
                    type: "warning",
                    confirmText: window.I18n?.t("common.delete") || "Delete",
                    cancelText: window.I18n?.t("common.cancel") || "Cancel",
                  },
                )
              : confirm(
                  window.I18n?.t("snippets.confirmDelete") ||
                    "Are you sure you want to delete this snippet?",
                );
            if (confirmed) {
              await window.userPromptsManager.deletePrompt(id);
              await this.refresh();
              window.showNotification?.(
                window.I18n?.t("snippets.deletedSuccess") || "Snippet deleted",
                "success",
              );
            }
          }
        });
      }
    }
    _truncate(str, maxLen) {
      if (str.length <= maxLen) return str;
      return str.substring(0, maxLen) + "...";
    }
    _escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text || "";
      return div.innerHTML;
    }
    _escapeAttr(text) {
      return (text || "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }
    destroy() {
      this.initialized = false;
    }
  }
  window.SnippetsPanel = SnippetsPanel;
})();
