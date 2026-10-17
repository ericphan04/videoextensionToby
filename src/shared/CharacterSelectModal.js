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
const _CharacterSelectModal = class _CharacterSelectModal {
  static show({
    characters = [],
    selectedSlug = null,
    selectedSlugs = [],
    selectedCharacters = [],
    multiple = false,
    onSelect = () => {},
  }) {
    _CharacterSelectModal._refreshVersion++;
    _CharacterSelectModal._characters = characters || [];
    _CharacterSelectModal._selectedSlug = selectedSlug;
    _CharacterSelectModal._multiple = multiple;
    _CharacterSelectModal._selectedCharacters = selectedCharacters;
    _CharacterSelectModal._selectedSlugs = multiple
      ? [...selectedSlugs]
      : selectedSlug
        ? [selectedSlug]
        : [];
    _CharacterSelectModal._onSelect = onSelect;
    _CharacterSelectModal._render();
    _CharacterSelectModal._open();
    _CharacterSelectModal._refreshAsync();
  }
  static async _refreshAsync() {
    const refreshVersion = _CharacterSelectModal._refreshVersion;
    try {
      const fresh = await window.CharacterRegistry?.getRenderList?.();
      if (
        !Array.isArray(fresh) ||
        refreshVersion !== _CharacterSelectModal._refreshVersion
      )
        return;
      if (
        !_CharacterSelectModal._overlay ||
        !document.body.contains(_CharacterSelectModal._overlay)
      ) {
        _CharacterSelectModal._characters = fresh;
        return;
      }
      const before = JSON.stringify(
        _CharacterSelectModal._characters.map((c) => c.slug),
      );
      const after = JSON.stringify(fresh.map((c) => c.slug));
      if (before === after) return;
      _CharacterSelectModal._characters = fresh;
      _CharacterSelectModal._render();
      _CharacterSelectModal._open();
    } catch (e) {
      console.warn(
        "[CharacterSelectModal] _refreshAsync failed:",
        e?.message || e,
      );
    }
  }
  static hide() {
    _CharacterSelectModal._refreshVersion++;
    if (_CharacterSelectModal._overlay) {
      _CharacterSelectModal._overlay.classList.remove("visible");
      const overlay = _CharacterSelectModal._overlay;
      setTimeout(() => {
        if (!overlay.classList.contains("visible"))
          overlay.classList.add("hidden");
      }, 200);
    }
    if (_CharacterSelectModal._escHandler) {
      document.removeEventListener(
        "keydown",
        _CharacterSelectModal._escHandler,
      );
      _CharacterSelectModal._escHandler = null;
    }
  }
  static _getContainer() {
    let container = document.getElementById("characterSelectModalContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "characterSelectModalContainer";
      document.body.appendChild(container);
    }
    return container;
  }
  static _t(key, fallback) {
    return window.I18n?.t?.(key) || fallback;
  }
  static _esc(str) {
    return String(str || "").replace(
      /[&<>"']/g,
      (ch) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[ch],
    );
  }
  static _notify(message, type = "info", duration = 4e3) {
    try {
      if (typeof window.showNotification === "function") {
        window.showNotification(message, type, duration);
        return;
      }
      if (typeof window.showToast === "function") {
        window.showToast(message);
        return;
      }
      if (window.customDialog?.alert) {
        window.customDialog.alert(message, { type });
        return;
      }
      console.log(`[CharacterSelectModal] ${type}: ${message}`);
    } catch (_) {}
  }
  static _characterIconSvg() {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="8" r="4"></circle>
      <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"></path>
    </svg>`;
  }
  static _renderItem(c) {
    const isSelected = _CharacterSelectModal._selectedSlugs.includes(c.slug);
    const thumbUrl = c.thumbnail_url || null;
    const thumbHtml = thumbUrl
      ? `<img class="style-modal-item-thumb" src="${_CharacterSelectModal._esc(thumbUrl)}" alt="${_CharacterSelectModal._esc(c.name || "")}" loading="lazy" referrerpolicy="no-referrer" />`
      : `<div class="style-modal-item-icon">${_CharacterSelectModal._characterIconSvg()}</div>`;
    return `
      <div class="style-modal-item ${isSelected ? "selected" : ""}" data-slug="${_CharacterSelectModal._esc(c.slug)}">
        ${thumbHtml}
        <div class="voice-modal-item-info">
          <span class="style-modal-item-name">${_CharacterSelectModal._esc(c.name || c.search_value || c.slug)}</span>
        </div>
        ${
          isSelected
            ? `
          <svg class="style-modal-item-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        `
            : ""
        }
      </div>
    `;
  }
  static _render() {
    const container = _CharacterSelectModal._getContainer();
    const t = _CharacterSelectModal._t;
    const noneSelected = _CharacterSelectModal._selectedSlugs.length === 0;
    let itemsHtml = `
      <div class="style-modal-item none-option ${noneSelected ? "selected" : ""}" data-slug="">
        <div class="style-modal-item-icon">${_CharacterSelectModal._characterIconSvg()}</div>
        <div class="voice-modal-item-info">
          <span class="style-modal-item-name">${t("common.default", "Default")}</span>
          <span class="voice-modal-item-desc">${t("character.noneDesc", "Generate without character")}</span>
        </div>
        ${
          noneSelected
            ? `
          <svg class="style-modal-item-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        `
            : ""
        }
      </div>
    `;
    if (_CharacterSelectModal._characters.length === 0) {
      itemsHtml += `
        <div class="voice-modal-empty">
          <p>${t("character.empty", "No characters yet \u2014 click Sync to scan from Flow.")}</p>
        </div>
      `;
    } else {
      itemsHtml += _CharacterSelectModal._characters
        .map((c) => _CharacterSelectModal._renderItem(c))
        .join("");
    }
    container.innerHTML = `
      <div class="style-modal-overlay hidden" id="characterSelectModalOverlay">
        <div class="style-modal-backdrop"></div>
        <div class="style-modal-content">
          <div class="style-modal-header">
            <h3 class="style-modal-title">${t("character.pickerTitle", "Choose character")}</h3>
            <div class="voice-modal-header-actions">
              <button type="button" class="voice-modal-sync-btn" id="characterModalSyncBtn"
                      data-i18n-tooltip="character.syncTooltip"
                      data-tooltip="${_CharacterSelectModal._esc(t("character.syncTooltip", "Sync characters from Flow"))}"
                      data-tooltip-pos="bottom">
                <svg class="voice-modal-sync-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="23 4 23 10 17 10"></polyline>
                  <polyline points="1 20 1 14 7 14"></polyline>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                </svg>
                <span class="voice-modal-sync-status" id="characterModalSyncStatus" style="display:none;"></span>
              </button>
              <button type="button" class="style-modal-close" id="characterModalClose"
                      data-i18n-tooltip="common.close"
                      data-tooltip="${_CharacterSelectModal._esc(t("common.close", "Close"))}"
                      data-tooltip-pos="bottom">
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
            <input type="text" id="characterModalSearch" placeholder="${t("character.searchPlaceholder", "Search characters...")}" />
          </div>
          <div class="style-modal-list" id="characterModalList">
            ${itemsHtml}
          </div>
        </div>
      </div>
    `;
    if (_CharacterSelectModal._escHandler)
      document.removeEventListener(
        "keydown",
        _CharacterSelectModal._escHandler,
      );
    _CharacterSelectModal._overlay = container.querySelector(
      "#characterSelectModalOverlay",
    );
    _CharacterSelectModal._bindEvents();
  }
  static _bindEvents() {
    const overlay = _CharacterSelectModal._overlay;
    if (!overlay) return;
    overlay
      .querySelector("#characterModalClose")
      ?.addEventListener("click", () => _CharacterSelectModal.hide());
    overlay
      .querySelector(".style-modal-backdrop")
      ?.addEventListener("click", () => _CharacterSelectModal.hide());
    overlay
      .querySelector("#characterModalSyncBtn")
      ?.addEventListener("click", async () => {
        await _CharacterSelectModal._handleSyncClick();
      });
    overlay.querySelectorAll(".style-modal-item").forEach((item) => {
      item.addEventListener("click", () => {
        const slug = item.dataset.slug || "";
        const character = slug
          ? _CharacterSelectModal._characters.find((c) => c.slug === slug)
          : null;
        if (_CharacterSelectModal._multiple) {
          const selected = _CharacterSelectModal._selectedSlugs;
          _CharacterSelectModal._selectedSlugs = !slug
            ? []
            : selected.includes(slug)
              ? selected.filter((value) => value !== slug)
              : [...selected, slug];
          const characters = _CharacterSelectModal._selectedSlugs.map(
            (value) =>
              _CharacterSelectModal._characters.find((c) => c.slug === value) ||
              window.CharacterRegistry?.findBySlug(value) ||
              _CharacterSelectModal._selectedCharacters.find(
                (c) => c.slug === value,
              ) || { slug: value, search_value: "" },
          );
          _CharacterSelectModal._selectedCharacters = characters;
          _CharacterSelectModal._updateSelectedItems();
          try {
            _CharacterSelectModal._onSelect(characters);
          } catch (_) {}
          return;
        }
        try {
          _CharacterSelectModal._onSelect(character);
        } catch (_) {}
        _CharacterSelectModal.hide();
      });
    });
    const searchInput = overlay.querySelector("#characterModalSearch");
    let debounceTimer = null;
    searchInput?.addEventListener("input", () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(
        () => _CharacterSelectModal._filterList(searchInput.value),
        100,
      );
    });
    _CharacterSelectModal._escHandler = (e) => {
      if (e.key === "Escape" && overlay.classList.contains("visible")) {
        _CharacterSelectModal.hide();
      }
    };
    document.addEventListener("keydown", _CharacterSelectModal._escHandler);
  }
  static _updateSelectedItems() {
    _CharacterSelectModal._overlay
      ?.querySelectorAll(".style-modal-item")
      .forEach((item) => {
        const slug = item.dataset.slug || "";
        const selected = slug
          ? _CharacterSelectModal._selectedSlugs.includes(slug)
          : _CharacterSelectModal._selectedSlugs.length === 0;
        item.classList.toggle("selected", selected);
        const check = item.querySelector(".style-modal-item-check");
        if (!selected) check?.remove();
        else if (!check)
          item.insertAdjacentHTML(
            "beforeend",
            `
        <svg class="style-modal-item-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>`,
          );
      });
  }
  static _filterList(searchTerm) {
    const list = _CharacterSelectModal._overlay?.querySelector(
      "#characterModalList",
    );
    if (!list) return;
    const term = searchTerm.toLowerCase().trim();
    list.querySelectorAll(".style-modal-item").forEach((item) => {
      if (item.classList.contains("none-option")) {
        item.style.display = "";
        return;
      }
      const name =
        item
          .querySelector(".style-modal-item-name")
          ?.textContent?.toLowerCase() || "";
      const slug = (item.dataset.slug || "").toLowerCase();
      const matches = !term || name.includes(term) || slug.includes(term);
      item.style.display = matches ? "" : "none";
    });
  }
  static _open() {
    if (!_CharacterSelectModal._overlay) return;
    _CharacterSelectModal._overlay.classList.remove("hidden");
    requestAnimationFrame(() =>
      _CharacterSelectModal._overlay.classList.add("visible"),
    );
    _CharacterSelectModal._overlay
      .querySelector("#characterModalSearch")
      ?.focus();
  }
  static async _handleSyncClick() {
    const btn = _CharacterSelectModal._overlay?.querySelector(
      "#characterModalSyncBtn",
    );
    const statusEl = _CharacterSelectModal._overlay?.querySelector(
      "#characterModalSyncStatus",
    );
    const iconEl = _CharacterSelectModal._overlay?.querySelector(
      ".voice-modal-sync-icon",
    );
    if (!btn || btn.disabled) return;
    const syncVersion = ++_CharacterSelectModal._refreshVersion;
    btn.disabled = true;
    btn.classList.add("voice-modal-sync-loading");
    if (iconEl) iconEl.classList.add("voice-modal-sync-spin");
    if (statusEl) {
      statusEl.style.display = "inline-block";
      statusEl.textContent = "...";
    }
    try {
      if (!window.MessageBridge?.syncFlowCharacters) {
        throw new Error("MessageBridge.syncFlowCharacters not available");
      }
      const result = await window.MessageBridge.syncFlowCharacters();
      if (syncVersion !== _CharacterSelectModal._refreshVersion) return;
      const total = result.total || 0;
      if (statusEl) statusEl.textContent = `\u2713 ${total}`;
      const t = (key, fallback) => window.I18n?.t(key) || fallback;
      _CharacterSelectModal._notify(
        t(
          "character.syncSuccess",
          `\u2713 \u0110\xE3 \u0111\u1ED3ng b\u1ED9 ${total} nh\xE2n v\u1EADt.`,
        ).replace("{total}", total),
        "success",
        4e3,
      );
      _CharacterSelectModal._characters = Array.isArray(result.characters)
        ? result.characters
        : (await window.CharacterRegistry?.getRenderList?.()) || [];
      if (
        _CharacterSelectModal._characters.length === 0 &&
        _CharacterSelectModal._selectedSlug
      ) {
        _CharacterSelectModal._selectedSlug = null;
        try {
          _CharacterSelectModal._onSelect?.(null);
        } catch (e) {
          console.warn(
            "[CharacterSelectModal] Could not clear stale selection:",
            e,
          );
        }
      }
      if (
        _CharacterSelectModal._multiple &&
        _CharacterSelectModal._characters.length === 0 &&
        _CharacterSelectModal._selectedSlugs.length
      ) {
        _CharacterSelectModal._selectedSlugs = [];
        _CharacterSelectModal._onSelect?.([]);
      }
      _CharacterSelectModal._render();
      _CharacterSelectModal._open();
    } catch (e) {
      console.error("[CharacterSelectModal] Sync failed:", e);
      if (statusEl) statusEl.textContent = "\u2717";
      const t = (key, fallback) => window.I18n?.t(key) || fallback;
      _CharacterSelectModal._notify(
        t("character.syncFailed", "\u2717 Character sync failed: ") +
          (e.message || e),
        "error",
        6e3,
      );
    } finally {
      setTimeout(() => {
        if (btn) {
          btn.disabled = false;
          btn.classList.remove("voice-modal-sync-loading");
        }
        if (iconEl) iconEl.classList.remove("voice-modal-sync-spin");
      }, 1500);
    }
  }
};
__publicField(_CharacterSelectModal, "_overlay", null);
__publicField(_CharacterSelectModal, "_onSelect", null);
__publicField(_CharacterSelectModal, "_characters", []);
__publicField(_CharacterSelectModal, "_selectedSlug", null);
__publicField(_CharacterSelectModal, "_selectedSlugs", []);
__publicField(_CharacterSelectModal, "_selectedCharacters", []);
__publicField(_CharacterSelectModal, "_multiple", false);
__publicField(_CharacterSelectModal, "_escHandler", null);
__publicField(_CharacterSelectModal, "_refreshVersion", 0);
let CharacterSelectModal = _CharacterSelectModal;
if (typeof window !== "undefined") {
  window.CharacterSelectModal = CharacterSelectModal;
}
