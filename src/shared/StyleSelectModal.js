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
const _StyleSelectModal = class _StyleSelectModal {
  static show({
    addons = [],
    selectedId = null,
    onSelect = () => {},
    canCreate = false,
    onDataChange = null,
  }) {
    _StyleSelectModal._addons = addons;
    _StyleSelectModal._selectedId = selectedId;
    _StyleSelectModal._onSelect = onSelect;
    _StyleSelectModal._canCreate = !!canCreate;
    _StyleSelectModal._onDataChange = onDataChange;
    _StyleSelectModal._maxLen =
      window.ValidationRules?.safeGetInt?.("prompt_max_length", 3e4) ?? 3e4;
    _StyleSelectModal._render();
    _StyleSelectModal._open();
  }
  static _computeCanCreate() {
    try {
      if (!window.featureGate?.canUse?.("addon_prompt_enabled"))
        return { ok: false, reason: "locked" };
      const limit = window.featureGate.checkQuota?.("addon_prompt_max")?.limit;
      if (
        limit === void 0 ||
        limit === null ||
        limit === "unlimited" ||
        String(limit) === "-1"
      )
        return { ok: true };
      const used = (_StyleSelectModal._addons || []).filter(
        (a) => a && a.is_custom,
      ).length;
      return used < Number(limit)
        ? { ok: true }
        : { ok: false, reason: "quota", limit: Number(limit) };
    } catch (e) {
      return { ok: false, reason: "locked" };
    }
  }
  static async _handleCreateDenied(deny) {
    try {
      if (deny.reason === "quota") {
        const _T = (k, p) => window.I18n?.t(k, p);
        const msg =
          _T("gen.customStyleQuotaReached", { max: deny.limit }) ||
          `You have reached the limit of ${deny.limit} custom styles for your current plan. Upgrade to create more.`;
        const up = await window.customDialog?.confirm(msg, {
          title: _T("featuregate.featureLockedTitle") || "Limit reached",
          type: "warning",
          confirmText: _T("common.upgrade") || "Upgrade",
          cancelText: _T("common.later") || "Later",
        });
        if (up) {
          if (typeof window.openUpgradeModal === "function")
            window.openUpgradeModal();
          else {
            try {
              chrome.runtime.sendMessage({ action: "showUpgradeModal" });
            } catch (_) {}
          }
        }
        return;
      }
      await window.featureGate?.showModuleBlockedDialog?.(
        "addon_prompt_enabled",
      );
    } catch (e) {
      console.warn("[StyleSelectModal] _handleCreateDenied:", e && e.message);
    }
  }
  static hide() {
    if (_StyleSelectModal._overlay) {
      _StyleSelectModal._overlay.classList.add("hidden");
      _StyleSelectModal._overlay.classList.remove("visible");
    }
  }
  static _getContainer() {
    let container = document.getElementById("styleSelectModalContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "styleSelectModalContainer";
      document.body.appendChild(container);
    }
    return container;
  }
  static _render() {
    const container = _StyleSelectModal._getContainer();
    const t = (key) => window.I18n?.t(key) || key;
    const customAddons = [];
    const grouped = {};
    const globalUncat = [];
    for (const addon of _StyleSelectModal._addons) {
      if (addon.is_custom) {
        customAddons.push(addon);
      } else if (addon.category) {
        if (!grouped[addon.category]) grouped[addon.category] = [];
        grouped[addon.category].push(addon);
      } else {
        globalUncat.push(addon);
      }
    }
    const categories = Object.keys(grouped).sort();
    let itemsHtml = `
      <div class="style-modal-item none-option ${!_StyleSelectModal._selectedId ? "selected" : ""}" data-id="">
        <div class="style-modal-item-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
        </div>
        <span class="style-modal-item-name">${t("gen.noStyle") || "No style"}</span>
      </div>
    `;
    if (customAddons.length > 0) {
      itemsHtml += `<div class="style-modal-category">${t("gen.myStyles") || "My styles"}</div>`;
      for (const addon of customAddons) {
        itemsHtml += _StyleSelectModal._renderItem(addon);
      }
    }
    for (const category of categories) {
      itemsHtml += `<div class="style-modal-category">${_StyleSelectModal._esc(category)}</div>`;
      for (const addon of grouped[category]) {
        itemsHtml += _StyleSelectModal._renderItem(addon);
      }
    }
    if (globalUncat.length > 0) {
      if (categories.length > 0 || customAddons.length > 0) {
        itemsHtml += `<div class="style-modal-category">${t("gen.otherStyles") || "Others"}</div>`;
      }
      for (const addon of globalUncat) {
        itemsHtml += _StyleSelectModal._renderItem(addon);
      }
    }
    const _deny = _StyleSelectModal._computeCanCreate();
    const _tip = _deny.ok
      ? t("gen.createCustomStyleTip") ||
        t("gen.createCustomStyle") ||
        "Create your own style"
      : _deny.reason === "quota"
        ? window.I18n?.t("gen.customStyleQuotaReached", { max: _deny.limit }) ||
          `You have reached the limit of ${_deny.limit} custom styles`
        : (t("gen.createCustomStyle") || "Create custom style") +
          " \u2014 " +
          (t("common.upgrade") || "Upgrade");
    const _icon = _deny.ok
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>'
      : '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm0 2h14v2H5v-2z"/></svg>';
    const addBtnHtml = `
      <button type="button" class="style-modal-add${_deny.ok ? "" : " is-locked"}" id="styleModalAdd"
        data-tooltip="${_StyleSelectModal._esc(_tip)}"
        data-tooltip-pos="bottom"${_deny.ok ? "" : ' style="color:#f5c451;"'}>
        ${_icon}
      </button>`;
    container.innerHTML = `
      <div class="style-modal-overlay hidden" id="styleSelectModalOverlay">
        <div class="style-modal-backdrop"></div>
        <div class="style-modal-content" style="position:relative;overflow:hidden;">
          <div class="style-modal-header">
            <h3 class="style-modal-title">${t("gen.selectStyle") || "Select style"}</h3>
            <div style="display:flex;align-items:center;">
              ${addBtnHtml}
              <button type="button" class="style-modal-close" id="styleModalClose">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
          <div class="style-modal-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input type="text" id="styleModalSearch" placeholder="${t("gen.styleSearch") || "Search style..."}" />
          </div>
          <div class="style-modal-list" id="styleModalList">
            ${itemsHtml}
          </div>
          ${_StyleSelectModal._renderForm()}
        </div>
      </div>
    `;
    _StyleSelectModal._overlay = container.querySelector(
      "#styleSelectModalOverlay",
    );
    _StyleSelectModal._bindEvents();
  }
  static _renderItem(addon) {
    const isSelected =
      String(addon.id) === String(_StyleSelectModal._selectedId);
    const canPremium =
      window.featureGate?.canUse?.("premium_templates") || false;
    const locked =
      addon.locked !== void 0
        ? !!addon.locked
        : !!addon.is_premium && !addon.is_custom && !canPremium;
    const thumbHtml = addon.thumbnail_url
      ? `<div class="style-modal-item-thumb-wrap">
          <img class="style-modal-item-thumb" src="${_StyleSelectModal._esc(addon.thumbnail_url)}" alt="${_StyleSelectModal._esc(addon.name)}" loading="lazy" />
          <button type="button" class="style-modal-item-view" data-view-src="${_StyleSelectModal._esc(addon.thumbnail_url)}" data-view-name="${_StyleSelectModal._esc(addon.name)}"
            data-tooltip="${_StyleSelectModal._esc(window.I18n?.t("gen.viewThumb") || "View full-size image")}" data-tooltip-pos="top">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          </button>
        </div>`
      : `<div class="style-modal-item-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z"></path>
            <path d="M17 4a2 2 0 0 0 2 2a2 2 0 0 0 -2 2a2 2 0 0 0 -2 -2a2 2 0 0 0 2 -2"></path>
          </svg>
        </div>`;
    const editHtml = addon.is_custom
      ? `
      <button type="button" class="style-modal-item-edit" data-edit-id="${addon.id}"
        data-tooltip="${_StyleSelectModal._esc(window.I18n?.t("gen.editCustomStyle") || "Edit your custom style")}" data-tooltip-pos="left"
        style="flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;margin-left:auto;background:transparent;border:none;border-radius:6px;color:rgba(255,255,255,0.55);cursor:pointer;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
      </button>`
      : "";
    const crownHtml = addon.is_premium
      ? `
      <span class="style-modal-item-crown" data-tooltip="${_StyleSelectModal._esc(locked ? window.I18n?.t("gen.premiumStyleNeed") || "Upgrade to use this style" : "Premium")}" data-tooltip-pos="top">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z"/></svg>
      </span>`
      : "";
    return `
      <div class="style-modal-item ${isSelected ? "selected" : ""}${locked ? " style-modal-item--locked" : ""}" data-id="${addon.id}" data-locked="${locked ? "1" : ""}">
        ${thumbHtml}
        <span class="style-modal-item-name">${_StyleSelectModal._esc(addon.name) || window.I18n?.t("common.untitled") || "Untitled"}</span>
        ${crownHtml}
        ${editHtml}
        ${
          isSelected
            ? `
          <svg class="style-modal-item-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0;">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        `
            : ""
        }
      </div>
    `;
  }
  static _renderForm() {
    const t = (key) => window.I18n?.t(key) || key;
    const maxLen = _StyleSelectModal._maxLen;
    return `
      <div class="style-modal-form hidden" id="styleModalForm"
        style="position:absolute;inset:0;z-index:5;background:inherit;display:flex;flex-direction:column;padding:16px;gap:12px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <button type="button" id="styleFormBack" style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;background:transparent;border:none;color:#fff;cursor:pointer;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <h4 id="styleFormTitle" style="margin:0;font-size:14px;color:#fff;">${t("gen.createCustomStyle") || "Create custom style"}</h4>
        </div>
        <input type="text" id="styleFormName" maxlength="100" placeholder="${_StyleSelectModal._esc(t("gen.styleName") || "Style name")}"
          style="width:100%;box-sizing:border-box;padding:9px 11px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#fff;font-size:13px;" />
        <textarea id="styleFormContent" ${maxLen > 0 ? `maxlength="${maxLen}"` : ""} placeholder="${_StyleSelectModal._esc(t("gen.styleContent") || "Addon content (appended to every prompt)")}"
          style="flex:1;min-height:120px;width:100%;box-sizing:border-box;padding:9px 11px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#fff;font-size:13px;font-family:inherit;resize:vertical;"></textarea>
        <div id="styleFormCount" style="text-align:right;font-size:11px;color:rgba(255,255,255,0.45);margin-top:-4px;font-variant-numeric:tabular-nums;">0/${maxLen > 0 ? _StyleSelectModal._fmtNum(maxLen) : "\u221E"}</div>
        <div id="styleFormError" style="display:none;color:#f87171;font-size:12px;"></div>
        <div style="display:flex;align-items:center;gap:8px;">
          <button type="button" id="styleFormDelete" style="display:none;margin-right:auto;padding:8px 12px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);border-radius:8px;color:#f87171;font-size:13px;cursor:pointer;">${t("common.delete") || "Delete"}</button>
          <button type="button" id="styleFormCancel" style="padding:8px 14px;background:transparent;border:1px solid rgba(255,255,255,0.2);border-radius:8px;color:#fff;font-size:13px;cursor:pointer;">${t("common.cancel") || "Cancel"}</button>
          <button type="button" id="styleFormSave" style="padding:8px 16px;background:#ccff00;border:none;border-radius:8px;color:#161616;font-size:13px;font-weight:600;cursor:pointer;">${t("common.save") || "Save"}</button>
        </div>
      </div>
    `;
  }
  static _bindEvents() {
    const overlay = _StyleSelectModal._overlay;
    if (!overlay) return;
    overlay
      .querySelector("#styleModalClose")
      ?.addEventListener("click", () => _StyleSelectModal.hide());
    overlay
      .querySelector(".style-modal-backdrop")
      ?.addEventListener("click", () => {
        if (_StyleSelectModal._isFormOpen()) return;
        _StyleSelectModal.hide();
      });
    overlay.querySelector("#styleModalAdd")?.addEventListener("click", () => {
      const deny = _StyleSelectModal._computeCanCreate();
      if (!deny.ok) {
        _StyleSelectModal._handleCreateDenied(deny);
        return;
      }
      _StyleSelectModal._showForm(null);
    });
    overlay.querySelectorAll(".style-modal-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        const viewBtn = e.target.closest(".style-modal-item-view");
        if (viewBtn) {
          e.stopPropagation();
          _StyleSelectModal._showThumbPreview(
            viewBtn.dataset.viewSrc,
            viewBtn.dataset.viewName,
          );
          return;
        }
        const editBtn = e.target.closest(".style-modal-item-edit");
        if (editBtn) {
          e.stopPropagation();
          const id2 = editBtn.dataset.editId;
          const addon2 = _StyleSelectModal._addons.find(
            (a) => String(a.id) === String(id2),
          );
          if (addon2) _StyleSelectModal._showForm(addon2);
          return;
        }
        if (item.dataset.locked === "1") {
          e.stopPropagation();
          try {
            window.showNotification?.(
              window.I18n?.t("gen.premiumStyleNeed") ||
                "Upgrade to use this style",
              "warning",
              2500,
            );
          } catch (_) {}
          return;
        }
        const id = item.dataset.id;
        const addon = id
          ? _StyleSelectModal._addons.find((a) => String(a.id) === String(id))
          : null;
        _StyleSelectModal._onSelect(addon);
        _StyleSelectModal.hide();
      });
    });
    const searchInput = overlay.querySelector("#styleModalSearch");
    searchInput?.addEventListener("input", () =>
      _StyleSelectModal._filterList(searchInput.value),
    );
    overlay
      .querySelector("#styleFormBack")
      ?.addEventListener("click", () => _StyleSelectModal._hideForm());
    overlay
      .querySelector("#styleFormCancel")
      ?.addEventListener("click", () => _StyleSelectModal._hideForm());
    overlay
      .querySelector("#styleFormSave")
      ?.addEventListener("click", () => _StyleSelectModal._saveForm());
    overlay
      .querySelector("#styleFormDelete")
      ?.addEventListener("click", () => _StyleSelectModal._deleteForm());
    overlay
      .querySelector("#styleFormContent")
      ?.addEventListener("input", () => _StyleSelectModal._updateCharCount());
    if (_StyleSelectModal._escHandler) {
      document.removeEventListener("keydown", _StyleSelectModal._escHandler);
    }
    const escHandler = (e) => {
      if (e.key === "Escape" && overlay.classList.contains("visible")) {
        if (_StyleSelectModal._isFormOpen()) {
          _StyleSelectModal._hideForm();
          return;
        }
        _StyleSelectModal.hide();
        document.removeEventListener("keydown", escHandler);
        _StyleSelectModal._escHandler = null;
      }
    };
    _StyleSelectModal._escHandler = escHandler;
    document.addEventListener("keydown", escHandler);
  }
  static _showForm(addon) {
    _StyleSelectModal._editing = addon || null;
    const overlay = _StyleSelectModal._overlay;
    const t = (key) => window.I18n?.t(key) || key;
    const form = overlay.querySelector("#styleModalForm");
    const nameEl = overlay.querySelector("#styleFormName");
    const contentEl = overlay.querySelector("#styleFormContent");
    const titleEl = overlay.querySelector("#styleFormTitle");
    const delBtn = overlay.querySelector("#styleFormDelete");
    const errEl = overlay.querySelector("#styleFormError");
    if (errEl) {
      errEl.style.display = "none";
      errEl.textContent = "";
    }
    if (nameEl) nameEl.value = addon?.name || "";
    if (contentEl) contentEl.value = addon?.content || "";
    if (titleEl)
      titleEl.textContent = addon
        ? t("gen.editCustomStyle") || "Edit style"
        : t("gen.createCustomStyle") || "Create custom style";
    if (delBtn) delBtn.style.display = addon ? "inline-flex" : "none";
    if (form) form.classList.remove("hidden");
    _StyleSelectModal._updateCharCount();
    nameEl?.focus();
  }
  static _hideForm() {
    _StyleSelectModal._editing = null;
    _StyleSelectModal._overlay
      ?.querySelector("#styleModalForm")
      ?.classList.add("hidden");
  }
  static _isFormOpen() {
    const form = _StyleSelectModal._overlay?.querySelector("#styleModalForm");
    return !!form && !form.classList.contains("hidden");
  }
  static _showThumbPreview(src, name) {
    if (!src) return;
    document.getElementById("styleThumbPreview")?.remove();
    const ov = document.createElement("div");
    ov.id = "styleThumbPreview";
    ov.className = "style-thumb-preview-overlay";
    ov.innerHTML = `
      <div class="style-thumb-preview-inner">
        <img class="style-thumb-preview-img" src="${_StyleSelectModal._esc(src)}" alt="${_StyleSelectModal._esc(name || "")}" />
        ${name ? `<div class="style-thumb-preview-name">${_StyleSelectModal._esc(name)}</div>` : ""}
        <button type="button" class="style-thumb-preview-close" aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"></path></svg>
        </button>
      </div>`;
    document.body.appendChild(ov);
    const esc = (e) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        close();
      }
    };
    const close = () => {
      ov.remove();
      document.removeEventListener("keydown", esc, true);
    };
    ov.addEventListener("click", (e) => {
      if (e.target === ov || e.target.closest(".style-thumb-preview-close"))
        close();
    });
    document.addEventListener("keydown", esc, true);
  }
  static _showFormError(msg) {
    const errEl = _StyleSelectModal._overlay?.querySelector("#styleFormError");
    if (errEl) {
      errEl.textContent = msg;
      errEl.style.display = "block";
    }
  }
  static async _saveForm() {
    const overlay = _StyleSelectModal._overlay;
    const t = (key) => window.I18n?.t(key) || key;
    const name = (overlay.querySelector("#styleFormName")?.value || "").trim();
    const content = (
      overlay.querySelector("#styleFormContent")?.value || ""
    ).trim();
    if (!name || !content) {
      _StyleSelectModal._showFormError(
        t("gen.styleFormRequired") || "Enter both a name and content.",
      );
      return;
    }
    if (!window.authManager?._apiCall) {
      _StyleSelectModal._showFormError(
        t("gen.styleSaveFailed") || "Save failed. Try again.",
      );
      return;
    }
    const saveBtn = overlay.querySelector("#styleFormSave");
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.style.opacity = "0.6";
    }
    try {
      const editing = _StyleSelectModal._editing;
      const method = editing ? "PUT" : "POST";
      const endpoint = editing
        ? `addon-prompts/${editing.id}`
        : "addon-prompts";
      await window.authManager._apiCall(method, endpoint, { name, content });
      _StyleSelectModal._hideForm();
      window.showNotification?.(
        editing
          ? t("gen.styleUpdated") || "Style updated"
          : t("gen.styleCreated") || "Style created",
        "success",
      );
      _StyleSelectModal._onDataChange?.();
    } catch (e) {
      _StyleSelectModal._showFormError(
        e?.message || t("gen.styleSaveFailed") || "Save failed. Try again.",
      );
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.style.opacity = "";
      }
    }
  }
  static async _deleteForm() {
    const editing = _StyleSelectModal._editing;
    if (!editing) return;
    const t = (key) => window.I18n?.t(key) || key;
    const ok = await (window.customDialog?.confirm
      ? window.customDialog.confirm(
          t("gen.styleDeleteConfirm") || "Delete this style?",
          {
            type: "warning",
            confirmText: t("common.delete") || "Delete",
            cancelText: t("common.cancel") || "Cancel",
          },
        )
      : Promise.resolve(
          confirm(t("gen.styleDeleteConfirm") || "Delete this style?"),
        ));
    if (!ok) return;
    if (!window.authManager?._apiCall) {
      _StyleSelectModal._showFormError(
        t("gen.styleDeleteFailed") || "Delete failed.",
      );
      return;
    }
    try {
      await window.authManager._apiCall(
        "DELETE",
        `addon-prompts/${editing.id}`,
        {},
      );
      _StyleSelectModal._hideForm();
      window.showNotification?.(
        t("gen.styleDeleted") || "Style deleted",
        "success",
      );
      _StyleSelectModal._onDataChange?.();
    } catch (e) {
      _StyleSelectModal._showFormError(
        e?.message || t("gen.styleDeleteFailed") || "Delete failed.",
      );
    }
  }
  static _esc(s) {
    if (s == null) return "";
    return String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }
  static _fmtNum(n) {
    try {
      return Number(n).toLocaleString("en-US");
    } catch (e) {
      return String(n);
    }
  }
  static _updateCharCount() {
    const overlay = _StyleSelectModal._overlay;
    const contentEl = overlay?.querySelector("#styleFormContent");
    const countEl = overlay?.querySelector("#styleFormCount");
    if (!contentEl || !countEl) return;
    const len = contentEl.value.length;
    const max = _StyleSelectModal._maxLen;
    countEl.textContent = `${_StyleSelectModal._fmtNum(len)}/${max > 0 ? _StyleSelectModal._fmtNum(max) : "\u221E"}`;
    countEl.style.color =
      max > 0 && len > max ? "#f87171" : "rgba(255,255,255,0.45)";
  }
  static _filterList(searchTerm) {
    const list = _StyleSelectModal._overlay?.querySelector("#styleModalList");
    if (!list) return;
    const term = searchTerm.toLowerCase().trim();
    list.querySelectorAll(".style-modal-item").forEach((item) => {
      const name =
        item
          .querySelector(".style-modal-item-name")
          ?.textContent?.toLowerCase() || "";
      const matches =
        !term || name.includes(term) || item.classList.contains("none-option");
      item.style.display = matches ? "" : "none";
    });
    list.querySelectorAll(".style-modal-category").forEach((cat) => {
      const nextItems = [];
      let sibling = cat.nextElementSibling;
      while (sibling && !sibling.classList.contains("style-modal-category")) {
        if (sibling.classList.contains("style-modal-item")) {
          nextItems.push(sibling);
        }
        sibling = sibling.nextElementSibling;
      }
      const hasVisible = nextItems.some(
        (item) => item.style.display !== "none",
      );
      cat.style.display = hasVisible ? "" : "none";
    });
  }
  static _open() {
    if (_StyleSelectModal._overlay) {
      _StyleSelectModal._overlay.classList.remove("hidden");
      requestAnimationFrame(() => {
        _StyleSelectModal._overlay.classList.add("visible");
      });
      _StyleSelectModal._overlay.querySelector("#styleModalSearch")?.focus();
    }
  }
};
__publicField(_StyleSelectModal, "_instance", null);
__publicField(_StyleSelectModal, "_overlay", null);
__publicField(_StyleSelectModal, "_onSelect", null);
__publicField(_StyleSelectModal, "_addons", []);
__publicField(_StyleSelectModal, "_selectedId", null);
__publicField(_StyleSelectModal, "_canCreate", false);
__publicField(_StyleSelectModal, "_onDataChange", null);
__publicField(_StyleSelectModal, "_editing", null);
__publicField(_StyleSelectModal, "_maxLen", 3e4);
let StyleSelectModal = _StyleSelectModal;
window.StyleSelectModal = StyleSelectModal;
