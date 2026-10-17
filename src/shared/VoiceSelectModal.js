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
const _VoiceSelectModal = class _VoiceSelectModal {
  static show({
    voices = [],
    selectedSlug = null,
    onSelect = () => {},
    providerSlug = "flow",
  }) {
    _VoiceSelectModal._voices = voices || [];
    _VoiceSelectModal._selectedSlug = selectedSlug;
    _VoiceSelectModal._onSelect = onSelect;
    _VoiceSelectModal._providerSlug = providerSlug;
    _VoiceSelectModal._render();
    _VoiceSelectModal._open();
    _VoiceSelectModal._refreshAsync(providerSlug);
    _VoiceSelectModal._bindVoiceRefreshListener();
  }
  static async _refreshAsync(providerSlug = "flow", force = false) {
    if (!window.VoiceRegistry) return;
    try {
      const fresh = await window.VoiceRegistry.getRenderList(providerSlug);
      console.log("[VoiceSelectModal] _refreshAsync fetched", {
        count: Array.isArray(fresh) ? fresh.length : "N/A",
        force,
      });
      if (!Array.isArray(fresh) || fresh.length === 0) return;
      if (
        !_VoiceSelectModal._overlay ||
        !_VoiceSelectModal._overlay.classList.contains("visible")
      ) {
        _VoiceSelectModal._voices = fresh;
        console.log(
          "[VoiceSelectModal] _refreshAsync: modal closed, cached for next show",
        );
        return;
      }
      if (!force) {
        const sameStructure =
          fresh.length === _VoiceSelectModal._voices.length &&
          fresh.every((v, i) => v.slug === _VoiceSelectModal._voices[i]?.slug);
        if (sameStructure) {
          const _uiFingerprint = (list) =>
            list
              .map((v) =>
                [
                  v.display_name || "",
                  v.sample_url || "",
                  v.thumbnail_url || "",
                  v.is_premium ? 1 : 0,
                ].join("|"),
              )
              .join("\n");
          if (
            _uiFingerprint(fresh) === _uiFingerprint(_VoiceSelectModal._voices)
          ) {
            _VoiceSelectModal._voices = fresh;
            console.log(
              "[VoiceSelectModal] _refreshAsync: same structure + UI fields \u2192 silent update, skip render",
            );
            return;
          }
          _VoiceSelectModal._voices = fresh;
          requestAnimationFrame(() => {
            _VoiceSelectModal._render();
            _VoiceSelectModal._open();
          });
          console.log(
            "[VoiceSelectModal] _refreshAsync: UI fields changed, deferred render",
          );
          return;
        }
      }
      console.log("[VoiceSelectModal] Refresh: updated voice list", {
        before: _VoiceSelectModal._voices.length,
        after: fresh.length,
        force,
      });
      _VoiceSelectModal._voices = fresh;
      _VoiceSelectModal._render();
      _VoiceSelectModal._open();
    } catch (e) {
      console.warn("[VoiceSelectModal] _refreshAsync failed:", e?.message || e);
    }
  }
  static _bindVoiceRefreshListener() {
    if (_VoiceSelectModal._voiceRefreshHandler) return;
    if (!window.eventBus?.on) return;
    _VoiceSelectModal._voiceRefreshHandler = () => {
      setTimeout(
        () =>
          _VoiceSelectModal._refreshAsync(
            _VoiceSelectModal._providerSlug || "flow",
            true,
          ),
        50,
      );
    };
    window.eventBus.on(
      "voices:refreshed",
      _VoiceSelectModal._voiceRefreshHandler,
    );
    window.eventBus.on(
      "voices:base_catalog_updated",
      _VoiceSelectModal._voiceRefreshHandler,
    );
  }
  static _unbindVoiceRefreshListener() {
    if (!_VoiceSelectModal._voiceRefreshHandler) return;
    try {
      window.eventBus?.off?.(
        "voices:refreshed",
        _VoiceSelectModal._voiceRefreshHandler,
      );
      window.eventBus?.off?.(
        "voices:base_catalog_updated",
        _VoiceSelectModal._voiceRefreshHandler,
      );
    } catch (_) {}
    _VoiceSelectModal._voiceRefreshHandler = null;
  }
  static hide() {
    if (_VoiceSelectModal._overlay) {
      _VoiceSelectModal._overlay.classList.add("hidden");
      _VoiceSelectModal._overlay.classList.remove("visible");
    }
    if (_VoiceSelectModal._escHandler) {
      document.removeEventListener("keydown", _VoiceSelectModal._escHandler);
      _VoiceSelectModal._escHandler = null;
    }
    _VoiceSelectModal._stopAudio();
    _VoiceSelectModal._unbindVoiceRefreshListener();
  }
  static _getContainer() {
    let container = document.getElementById("voiceSelectModalContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "voiceSelectModalContainer";
      document.body.appendChild(container);
    }
    return container;
  }
  static _t(key, fallback) {
    return window.I18n?.t?.(key) || fallback;
  }
  static _isAdmin() {
    try {
      if (typeof window.authManager?.isAdmin === "function") {
        return !!window.authManager.isAdmin();
      }
      const user = window.authManager?.user;
      return !!(user && (user.role === "admin" || user.is_admin === true));
    } catch (_) {
      return false;
    }
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
      if (
        window.customDialog &&
        typeof window.customDialog.alert === "function"
      ) {
        window.customDialog.alert(message, { type });
        return;
      }
      console.log(`[VoiceSelectModal] ${type}: ${message}`);
    } catch (_) {}
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
  static _resolveThumbUrl(voice) {
    if (voice.thumbnail_full_url) return voice.thumbnail_full_url;
    if (!voice.thumbnail_url) return null;
    if (voice.thumbnail_url.startsWith("http")) return voice.thumbnail_url;
    const baseUrl = window.ApiBaseConfig?.getWebBase?.() || "";
    return `${baseUrl}/storage/${voice.thumbnail_url}`;
  }
  static _voiceIconSvg() {
    return `<svg width="20" height="20" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 5L1.5 7M3.75 5.5V6.5M6 3V9M8.25 1.5V10.5M10.5 5V7"></path></svg>`;
  }
  static _randomIconSvg() {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"></circle>
      <circle cx="15.5" cy="8.5" r="1.5" fill="currentColor"></circle>
      <circle cx="8.5" cy="15.5" r="1.5" fill="currentColor"></circle>
      <circle cx="15.5" cy="15.5" r="1.5" fill="currentColor"></circle>
      <circle cx="12" cy="12" r="1.5" fill="currentColor"></circle>
    </svg>`;
  }
  static _playIconSvg() {
    return `<svg class="voice-modal-play-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <polygon points="6 4 20 12 6 20"></polygon>
    </svg>`;
  }
  static _stopIconSvg() {
    return `<svg class="voice-modal-play-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <rect x="6" y="6" width="12" height="12" rx="1"></rect>
    </svg>`;
  }
  static _renderItem(voice) {
    const isSelected = voice.slug === _VoiceSelectModal._selectedSlug;
    const thumbUrl = _VoiceSelectModal._resolveThumbUrl(voice);
    const thumbHtml = thumbUrl
      ? `<img class="style-modal-item-thumb" src="${_VoiceSelectModal._esc(thumbUrl)}" alt="${_VoiceSelectModal._esc(voice.display_name || "")}" loading="lazy" />`
      : `<div class="style-modal-item-icon">${_VoiceSelectModal._voiceIconSvg()}</div>`;
    const isPlaying = _VoiceSelectModal._playingSlug === voice.slug;
    const playBtnHtml = voice.sample_url
      ? `<button type="button" class="voice-modal-play-btn ${isPlaying ? "is-playing" : ""}" data-action="play-sample" data-slug="${_VoiceSelectModal._esc(voice.slug)}" data-sample-url="${_VoiceSelectModal._esc(voice.sample_url)}" title="${_VoiceSelectModal._t("voice.playSample", "Play sample")}" aria-label="${_VoiceSelectModal._t("voice.playSample", "Play sample")}">
          ${isPlaying ? _VoiceSelectModal._stopIconSvg() : _VoiceSelectModal._playIconSvg()}
        </button>`
      : "";
    return `
      <div class="style-modal-item ${isSelected ? "selected" : ""}" data-slug="${_VoiceSelectModal._esc(voice.slug)}">
        ${thumbHtml}
        <div class="voice-modal-item-info">
          <span class="style-modal-item-name">${_VoiceSelectModal._esc(voice.display_name || voice.search_value || voice.slug)}</span>
          ${voice.description ? `<span class="voice-modal-item-desc">${_VoiceSelectModal._esc(voice.description)}</span>` : ""}
        </div>
        ${voice.is_premium ? '<span class="voice-modal-item-badge">PRO</span>' : ""}
        ${
          isSelected
            ? `
          <svg class="style-modal-item-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        `
            : ""
        }
        ${playBtnHtml}
      </div>
    `;
  }
  static _render() {
    const container = _VoiceSelectModal._getContainer();
    const t = _VoiceSelectModal._t;
    const noneSelected = !_VoiceSelectModal._selectedSlug;
    let itemsHtml = `
      <div class="style-modal-item none-option ${noneSelected ? "selected" : ""}" data-slug="">
        <div class="style-modal-item-icon">${_VoiceSelectModal._randomIconSvg()}</div>
        <div class="voice-modal-item-info">
          <span class="style-modal-item-name">${t("voice.random", "Random voice")}</span>
          <span class="voice-modal-item-desc">${t("voice.randomDesc", "Flow picks default voice")}</span>
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
    if (_VoiceSelectModal._voices.length === 0) {
      itemsHtml += `
        <div class="voice-modal-empty">
          <p>${t("voice.needResync", "Voices not synced yet.")}</p>
          <button type="button" class="voice-modal-open-settings" id="voiceModalOpenSettings">
            ${t("voice.openSettings", "Open Settings to Resync")}
          </button>
        </div>
      `;
    } else {
      const custom = _VoiceSelectModal._voices.filter((v) => v.is_custom);
      const base = _VoiceSelectModal._voices.filter((v) => !v.is_custom);
      if (custom.length > 0) {
        itemsHtml += `<div class="style-modal-category">${t("voice.groupCustom", "Custom (yours)")}</div>`;
        itemsHtml += custom
          .map((v) => _VoiceSelectModal._renderItem(v))
          .join("");
      }
      if (base.length > 0) {
        itemsHtml += `<div class="style-modal-category">${t("voice.groupBase", "Base catalog")}</div>`;
        itemsHtml += base.map((v) => _VoiceSelectModal._renderItem(v)).join("");
      }
    }
    container.innerHTML = `
      <div class="style-modal-overlay hidden" id="voiceSelectModalOverlay">
        <div class="style-modal-backdrop"></div>
        <div class="style-modal-content">
          <div class="style-modal-header">
            <h3 class="style-modal-title">${t("voice.pickerTitle", "Choose voice")}</h3>
            <div class="voice-modal-header-actions">
              <!-- [Fix 2026-06-10] Sync button hi\u1EC3n th\u1ECB cho T\u1EA4T C\u1EA2 user (\u0111\u1ED3ng b\u1ED9 pattern resync
                   \u1EDF settings.html). User th\u01B0\u1EDDng: scrape local + l\u01B0u custom voices. Admin: th\xEAm
                   step upload server l\xE0m promotion candidates (logic MessageBridge.syncFlowVoices
                   t\u1EF1 skip POST server cho non-admin \u2192 safe).
                   Tooltip i18n-aware:
                     - data-i18n-tooltip: I18n.applyTranslations() auto-update khi user \u0111\u1ED5i locale
                     - data-tooltip: initial value (tooltip ready ngay kh\xF4ng ph\u1EE5 thu\u1ED9c I18n cycle)
                   Admin/user c\xF3 2 keys ri\xEAng (voice.syncTooltip vs voice.syncTooltipAdmin). -->
              ${(() => {
                const syncKey = _VoiceSelectModal._isAdmin()
                  ? "voice.syncTooltipAdmin"
                  : "voice.syncTooltip";
                const syncFallback = _VoiceSelectModal._isAdmin()
                  ? "\u0110\u1ED3ng b\u1ED9 gi\u1ECDng \u0111\u1ECDc t\u1EEB Flow (admin: + upload to server)"
                  : "\u0110\u1ED3ng b\u1ED9 gi\u1ECDng \u0111\u1ECDc t\u1EEB Flow";
                return `<button type="button" class="voice-modal-sync-btn" id="voiceModalSyncBtn"
                      data-i18n-tooltip="${syncKey}"
                      data-tooltip="${_VoiceSelectModal._esc(t(syncKey, syncFallback))}"
                      data-tooltip-pos="bottom">
                <svg class="voice-modal-sync-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="23 4 23 10 17 10"></polyline>
                  <polyline points="1 20 1 14 7 14"></polyline>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                </svg>
                <span class="voice-modal-sync-status" id="voiceModalSyncStatus" style="display:none;"></span>
              </button>`;
              })()}
              <button type="button" class="style-modal-close" id="voiceModalClose"
                      data-i18n-tooltip="common.close"
                      data-tooltip="${_VoiceSelectModal._esc(t("common.close", "Close"))}"
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
            <input type="text" id="voiceModalSearch" placeholder="${t("voice.searchPlaceholder", "Search voices...")}" />
          </div>
          <div class="style-modal-list" id="voiceModalList">
            ${itemsHtml}
          </div>
        </div>
      </div>
    `;
    _VoiceSelectModal._overlay = container.querySelector(
      "#voiceSelectModalOverlay",
    );
    _VoiceSelectModal._bindEvents();
  }
  static _bindEvents() {
    const overlay = _VoiceSelectModal._overlay;
    if (!overlay) return;
    overlay
      .querySelector("#voiceModalClose")
      ?.addEventListener("click", () => _VoiceSelectModal.hide());
    overlay
      .querySelector(".style-modal-backdrop")
      ?.addEventListener("click", () => _VoiceSelectModal.hide());
    const syncBtn = overlay.querySelector("#voiceModalSyncBtn");
    if (syncBtn) {
      syncBtn.addEventListener("click", async () => {
        await _VoiceSelectModal._handleSyncClick();
      });
    }
    overlay.querySelectorAll(".style-modal-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        const playBtn = e.target.closest(".voice-modal-play-btn");
        if (playBtn) {
          e.stopPropagation();
          const slug2 = playBtn.dataset.slug || "";
          const sampleUrl = playBtn.dataset.sampleUrl || "";
          _VoiceSelectModal._togglePlay(slug2, sampleUrl);
          return;
        }
        const slug = item.dataset.slug || "";
        const voice = slug
          ? _VoiceSelectModal._voices.find((v) => v.slug === slug)
          : null;
        try {
          _VoiceSelectModal._onSelect(voice);
        } catch (_) {}
        _VoiceSelectModal.hide();
      });
    });
    overlay
      .querySelector("#voiceModalOpenSettings")
      ?.addEventListener("click", () => {
        try {
          chrome.runtime.sendMessage({ action: "openSettings" });
        } catch (e) {
          console.warn("[VoiceSelectModal] openSettings failed:", e.message);
        }
        _VoiceSelectModal.hide();
      });
    const searchInput = overlay.querySelector("#voiceModalSearch");
    let debounceTimer = null;
    searchInput?.addEventListener("input", () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(
        () => _VoiceSelectModal._filterList(searchInput.value),
        100,
      );
    });
    _VoiceSelectModal._escHandler = (e) => {
      if (e.key === "Escape" && overlay.classList.contains("visible")) {
        _VoiceSelectModal.hide();
      }
    };
    document.addEventListener("keydown", _VoiceSelectModal._escHandler);
  }
  static _filterList(searchTerm) {
    const list = _VoiceSelectModal._overlay?.querySelector("#voiceModalList");
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
      const desc =
        item
          .querySelector(".voice-modal-item-desc")
          ?.textContent?.toLowerCase() || "";
      const slug = (item.dataset.slug || "").toLowerCase();
      const matches =
        !term ||
        name.includes(term) ||
        desc.includes(term) ||
        slug.includes(term);
      item.style.display = matches ? "" : "none";
    });
    list.querySelectorAll(".style-modal-category").forEach((cat) => {
      const nextItems = [];
      let sibling = cat.nextElementSibling;
      while (sibling && !sibling.classList.contains("style-modal-category")) {
        if (
          sibling.classList.contains("style-modal-item") &&
          !sibling.classList.contains("none-option")
        ) {
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
    if (!_VoiceSelectModal._overlay) return;
    _VoiceSelectModal._overlay.classList.remove("hidden");
    requestAnimationFrame(() => {
      _VoiceSelectModal._overlay.classList.add("visible");
    });
    _VoiceSelectModal._overlay.querySelector("#voiceModalSearch")?.focus();
  }
  static _togglePlay(slug, sampleUrl) {
    if (!slug || !sampleUrl) return;
    if (_VoiceSelectModal._playingSlug === slug) {
      _VoiceSelectModal._stopAudio();
      return;
    }
    _VoiceSelectModal._stopAudio();
    if (!_VoiceSelectModal._audio) {
      _VoiceSelectModal._audio = new Audio();
      _VoiceSelectModal._audio.preload = "auto";
      _VoiceSelectModal._audio.addEventListener("ended", () => {
        _VoiceSelectModal._playingSlug = null;
        _VoiceSelectModal._updatePlayButtons();
      });
      _VoiceSelectModal._audio.addEventListener("error", (e) => {
        const audioErr = _VoiceSelectModal._audio?.error;
        const errMsg = audioErr
          ? `code=${audioErr.code} (${_VoiceSelectModal._audioErrorText(audioErr.code)})`
          : "unknown";
        console.warn("[VoiceSelectModal] Audio error:", errMsg);
        _VoiceSelectModal._notifyPlayFailed(errMsg);
        _VoiceSelectModal._playingSlug = null;
        _VoiceSelectModal._updatePlayButtons();
      });
    }
    _VoiceSelectModal._audio.src = sampleUrl;
    _VoiceSelectModal._playingSlug = slug;
    _VoiceSelectModal._updatePlayButtons();
    _VoiceSelectModal._audio.play().catch((err) => {
      console.warn("[VoiceSelectModal] Play failed:", err?.message || err);
      _VoiceSelectModal._notifyPlayFailed(err?.message || String(err));
      _VoiceSelectModal._playingSlug = null;
      _VoiceSelectModal._updatePlayButtons();
    });
  }
  static _audioErrorText(code) {
    switch (code) {
      case 1:
        return "aborted";
      case 2:
        return "network \u2014 URL redirect/CORS/offline?";
      case 3:
        return "decode \u2014 codec kh\xF4ng support";
      case 4:
        return "src not supported \u2014 URL 404/redirect (vd gstatic.com \u2192 www.gstatic.com)?";
      default:
        return "unknown";
    }
  }
  static _notifyPlayFailed(reason) {
    const msg =
      _VoiceSelectModal._t("voice.playFailed", "Failed to play sample audio") +
      ` \u2014 ${reason}`;
    if (typeof window.showNotification === "function") {
      window.showNotification(msg, "warning", 5e3);
    }
  }
  static _stopAudio() {
    if (_VoiceSelectModal._audio) {
      try {
        _VoiceSelectModal._audio.pause();
        _VoiceSelectModal._audio.currentTime = 0;
      } catch (_) {}
    }
    if (_VoiceSelectModal._playingSlug) {
      _VoiceSelectModal._playingSlug = null;
      _VoiceSelectModal._updatePlayButtons();
    }
  }
  static _updatePlayButtons() {
    if (!_VoiceSelectModal._overlay) return;
    _VoiceSelectModal._overlay
      .querySelectorAll(".voice-modal-play-btn")
      .forEach((btn) => {
        const slug = btn.dataset.slug;
        const isPlaying = slug === _VoiceSelectModal._playingSlug;
        btn.classList.toggle("is-playing", isPlaying);
        btn.innerHTML = isPlaying
          ? _VoiceSelectModal._stopIconSvg()
          : _VoiceSelectModal._playIconSvg();
      });
  }
  static async _handleSyncClick() {
    const btn = _VoiceSelectModal._overlay?.querySelector("#voiceModalSyncBtn");
    const statusEl = _VoiceSelectModal._overlay?.querySelector(
      "#voiceModalSyncStatus",
    );
    const iconEl = _VoiceSelectModal._overlay?.querySelector(
      ".voice-modal-sync-icon",
    );
    if (!btn) return;
    if (btn.disabled) return;
    btn.disabled = true;
    btn.classList.add("voice-modal-sync-loading");
    if (iconEl) iconEl.classList.add("voice-modal-sync-spin");
    if (statusEl) {
      statusEl.style.display = "inline-block";
      statusEl.textContent = "...";
    }
    try {
      if (!window.MessageBridge?.syncFlowVoices) {
        throw new Error("MessageBridge.syncFlowVoices not available");
      }
      const result = await window.MessageBridge.syncFlowVoices();
      const total = result.total || 0;
      const custom = result.custom || 0;
      const base = result.base || 0;
      const uploaded = result.uploaded_to_server;
      console.log("[VoiceSelectModal] Sync done:", result);
      if (statusEl) {
        statusEl.textContent = uploaded
          ? `\u2713 ${total} (uploaded)`
          : `\u2713 ${total}`;
      }
      const t = (key, fallback) => window.I18n?.t(key) || fallback;
      const successMsg = uploaded
        ? t(
            "voice.syncSuccessAdmin",
            `\u2713 \u0110\xE3 sync ${total} gi\u1ECDng \u0111\u1ECDc (${base} base + ${custom} custom) \u2014 uploaded l\xEAn server.`,
          )
            .replace("{total}", total)
            .replace("{base}", base)
            .replace("{custom}", custom)
        : t(
            "voice.syncSuccess",
            `\u2713 \u0110\xE3 sync ${total} gi\u1ECDng \u0111\u1ECDc (${base} base + ${custom} custom).`,
          )
            .replace("{total}", total)
            .replace("{base}", base)
            .replace("{custom}", custom);
      _VoiceSelectModal._notify(successMsg, "success", 4e3);
      _VoiceSelectModal._voices =
        window.VoiceRegistry?.getRenderListSync("flow") || [];
      _VoiceSelectModal._render();
      _VoiceSelectModal._open();
    } catch (e) {
      console.error("[VoiceSelectModal] Sync failed:", e);
      if (statusEl) statusEl.textContent = "\u2717";
      if (btn)
        btn.setAttribute("data-tooltip", `Sync failed: ${e.message || e}`);
      const t = (key, fallback) => window.I18n?.t(key) || fallback;
      const errMsg =
        t("voice.syncFailed", "\u2717 Voice sync failed: ") + (e.message || e);
      _VoiceSelectModal._notify(errMsg, "error", 6e3);
    } finally {
      setTimeout(() => {
        if (btn) btn.disabled = false;
        if (btn) btn.classList.remove("voice-modal-sync-loading");
        if (iconEl) iconEl.classList.remove("voice-modal-sync-spin");
      }, 1500);
    }
  }
};
__publicField(_VoiceSelectModal, "_overlay", null);
__publicField(_VoiceSelectModal, "_onSelect", null);
__publicField(_VoiceSelectModal, "_voices", []);
__publicField(_VoiceSelectModal, "_selectedSlug", null);
__publicField(_VoiceSelectModal, "_escHandler", null);
__publicField(_VoiceSelectModal, "_audio", null);
__publicField(_VoiceSelectModal, "_playingSlug", null);
let VoiceSelectModal = _VoiceSelectModal;
if (typeof window !== "undefined") {
  window.VoiceSelectModal = VoiceSelectModal;
}
