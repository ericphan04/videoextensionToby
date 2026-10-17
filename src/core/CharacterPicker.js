class CharacterPicker {
  constructor(opts) {
    this.triggerEl = opts.triggerEl;
    this.thumbEl = opts.thumbEl;
    this.labelEl = opts.labelEl;
    this.hiddenSelectEl = opts.hiddenSelectEl || null;
    this.onChange = opts.onChange || (() => {});
    this.getSelected = opts.getSelected || (() => "");
    this._initialized = false;
    this._clickHandler = null;
    this._refreshedHandler = null;
    this._storageChangeHandler = null;
  }
  init() {
    if (!this.triggerEl) return;
    if (this._initialized) return;
    this._initialized = true;
    this._clickHandler = (e) => {
      e.stopPropagation();
      this._openModal();
    };
    this.triggerEl.addEventListener("click", this._clickHandler);
    if (window.eventBus) {
      this._refreshedHandler = () => this._updateTrigger();
      window.eventBus.on("characters:refreshed", this._refreshedHandler);
    }
    if (chrome?.storage?.onChanged) {
      this._storageChangeHandler = (changes, area) => {
        if (area !== "local") return;
        if (changes.toby_provider_characters_scraped) {
          if (window.CharacterRegistry) {
            window.CharacterRegistry._scrapedCache = null;
            window.CharacterRegistry.getScrapedList().then(() =>
              this._updateTrigger(),
            );
          } else {
            this._updateTrigger();
          }
        }
      };
      chrome.storage.onChanged.addListener(this._storageChangeHandler);
    }
    this._updateTrigger();
  }
  destroy() {
    if (this._clickHandler && this.triggerEl) {
      this.triggerEl.removeEventListener("click", this._clickHandler);
      this._clickHandler = null;
    }
    if (window.eventBus && this._refreshedHandler) {
      window.eventBus.off?.("characters:refreshed", this._refreshedHandler);
      this._refreshedHandler = null;
    }
    if (this._storageChangeHandler && chrome?.storage?.onChanged) {
      chrome.storage.onChanged.removeListener(this._storageChangeHandler);
      this._storageChangeHandler = null;
    }
    this._initialized = false;
  }
  clearForMention() {
    this._clearedByMention = true;
    if (!this.getSelected() && !this.hiddenSelectEl?.value) return;
    if (this.hiddenSelectEl) this.hiddenSelectEl.value = "";
    this.onChange("", null);
    this._updateTrigger();
  }
  setSelected(slug) {
    if (this.hiddenSelectEl) this.hiddenSelectEl.value = slug || "";
    this._updateTrigger();
  }
  _openModal() {
    if (!window.CharacterSelectModal) {
      console.warn("[CharacterPicker] CharacterSelectModal not loaded");
      return;
    }
    const characters = window.CharacterRegistry?.getRenderListSync() || [];
    const selectedCharacters = window.CharacterRegistry.selections(
      this.getSelected(),
    );
    const selectedSlugs = selectedCharacters.map((item) => item.slug);
    window.CharacterSelectModal.show({
      characters,
      selectedSlugs,
      selectedCharacters,
      multiple: true,
      onSelect: (characters2) => {
        const selected = Array.isArray(characters2) ? characters2 : [];
        const charObj = selected[0] || null;
        const slug = charObj?.slug || "";
        this._clearedByMention = true;
        if (this.hiddenSelectEl)
          this.hiddenSelectEl.value =
            window.CharacterRegistry.selectionValue(selected);
        this._updateTrigger();
        try {
          this.onChange(slug, charObj, selected);
        } catch (e) {
          console.warn("[CharacterPicker] onChange callback error:", e);
        }
      },
    });
  }
  _characterIconSvg() {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="8" r="4"></circle>
      <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"></path>
    </svg>`;
  }
  _updateTrigger() {
    if (!this.labelEl || !this.thumbEl) return;
    const thumbId = this.thumbEl.id;
    if (!thumbId) {
      console.warn(
        "[CharacterPicker] thumbEl missing id \u2014 cannot update trigger",
      );
      return;
    }
    const selected = window.CharacterRegistry.selections(this.getSelected());
    const slug = selected[0]?.slug || "";
    const t = (key, fallback) => window.I18n?.t?.(key) || fallback;
    const character =
      window.CharacterRegistry?.findBySlug?.(slug) || selected[0];
    const displayName = character?.name || character?.search_value;
    if (!slug || !displayName) {
      this.labelEl.setAttribute("data-i18n", "character.none");
      this.labelEl.textContent = t("character.none", "Character");
      this.thumbEl.outerHTML = `<span class="voice-picker-trigger-thumb-svg" id="${thumbId}">${this._characterIconSvg()}</span>`;
      this.thumbEl = document.getElementById(thumbId);
      this.triggerEl.classList.remove("has-value");
      this.triggerEl.title = t("character.pickerTitle", "Choose character");
      return;
    }
    this.labelEl.removeAttribute("data-i18n");
    this.labelEl.textContent =
      displayName + (selected.length > 1 ? ` +${selected.length - 1}` : "");
    this.triggerEl.classList.add("has-value");
    this.triggerEl.title = selected
      .map((item) => item.name || item.search_value)
      .filter(Boolean)
      .join(", ");
    const thumbUrl = character.thumbnail_url || null;
    if (thumbUrl) {
      this.thumbEl.outerHTML = `<img class="voice-picker-trigger-thumb" id="${thumbId}" src="${this._escape(thumbUrl)}" alt="${this._escape(character.name || "")}" loading="lazy" />`;
    } else {
      this.thumbEl.outerHTML = `<span class="voice-picker-trigger-thumb-svg" id="${thumbId}">${this._characterIconSvg()}</span>`;
    }
    this.thumbEl = document.getElementById(thumbId);
  }
  _escape(str) {
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
}
if (typeof window !== "undefined") {
  window.CharacterPicker = CharacterPicker;
}
