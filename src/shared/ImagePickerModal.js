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
(function () {
  "use strict";
  const DEBUG = false;
  function log(...args) {
    if (DEBUG) console.log("[ImagePickerModal]", ...args);
  }
  const _ImagePickerModal = class _ImagePickerModal {
    constructor() {
      _ImagePickerModal._bindFlowLabelCacheInvalidation();
      this.overlay = null;
      this.activeTab = "flow";
      this.flowImages = [];
      this.refImagesPerPrompt = null;
      this.uploadedImages = [];
      this.albumData = [];
      this.selectedImages = new Map();
      this.onConfirm = null;
      this.existingFileIds = [];
    }
    static _bindFlowLabelCacheInvalidation() {
      if (this._flowLabelInvalidationBound || !window.eventBus?.on) return;
      this._flowLabelInvalidationBound = true;
      window.eventBus.on(
        "provider:selector_updated",
        ({ provider, key } = {}) => {
          if (provider === "flow" && key === "tile_display_name") {
            _ImagePickerModal._cachedFlowImages = null;
          }
        },
      );
    }
    static resolveMaxSelections({
      provider,
      mode = "image",
      isFrames = false,
      modelValue = null,
      duration = void 0,
    } = {}) {
      if (!provider) return null;
      const slug = String(provider).toLowerCase();
      const adapter =
        typeof ProviderRegistry !== "undefined" && ProviderRegistry.get
          ? ProviderRegistry.get(slug)
          : null;
      if (!adapter?.capabilities) return null;
      if (modelValue && typeof adapter.supportsRefImages === "function") {
        try {
          const _ctx = {
            inputType:
              mode === "video" ? (isFrames ? "Frames" : "Ingredients") : void 0,
            duration,
          };
          if (!adapter.supportsRefImages(modelValue, _ctx)) return 0;
        } catch (_) {}
      }
      if (typeof adapter.getMaxRefImages === "function") {
        try {
          const max2 = adapter.getMaxRefImages({ mode, isFrames, modelValue });
          if (typeof max2 === "number") return max2 > 0 ? max2 : 0;
        } catch (_) {}
      }
      const max = adapter.capabilities.maxRefImages;
      return typeof max === "number" && max > 0 ? max : null;
    }
    static resolveCapsMulti({
      provider,
      mode = "image",
      isFrames = false,
      modelValue = null,
      duration = void 0,
    } = {}) {
      const imageCap = this.resolveMaxSelections({
        provider,
        mode,
        isFrames,
        modelValue,
        duration,
      });
      let videoCap = 0;
      let totalCap = null;
      const adapter =
        typeof ProviderRegistry !== "undefined" && ProviderRegistry.get
          ? ProviderRegistry.get(String(provider || "").toLowerCase())
          : null;
      if (adapter) {
        if (typeof adapter.getMaxRefVideos === "function") {
          try {
            videoCap = adapter.getMaxRefVideos(modelValue) || 0;
          } catch (_) {}
        }
        if (typeof adapter.getMaxRefImagesTotal === "function") {
          try {
            totalCap = adapter.getMaxRefImagesTotal(modelValue);
          } catch (_) {}
        }
      }
      return { image: imageCap, video: videoCap, total: totalCap };
    }
    open(options = {}) {
      this.onConfirm = options.onConfirm || null;
      this.refAuditContext = options.refAuditContext || {};
      this.existingFileIds = (options.existingFileIds || [])
        .map((id) => String(id || "").trim())
        .filter(Boolean);
      this.existingFileTypes = options.existingFileTypes || {};
      this.existingMedia = options.existingMedia || {};
      const canonicalExistingIds = [];
      const canonicalExistingMedia = {};
      const canonicalExistingTypes = {};
      const canonicalSeen = new Set();
      for (const id of this.existingFileIds) {
        const known = this.existingMedia[id] || {};
        const persistentId = String(known.persistent_media_id || "").trim();
        const canonicalId = persistentId || id;
        if (!canonicalSeen.has(canonicalId)) {
          canonicalSeen.add(canonicalId);
          canonicalExistingIds.push(canonicalId);
        }
        canonicalExistingMedia[canonicalId] = {
          ...known,
          identity_aliases: [
            ...new Set(
              [
                ...(Array.isArray(known.identity_aliases)
                  ? known.identity_aliases
                  : []),
                id,
                canonicalId,
                known.media_uuid,
                known.persistent_media_id,
              ]
                .map((value) => String(value || "").trim())
                .filter(Boolean),
            ),
          ],
        };
        canonicalExistingTypes[canonicalId] =
          this.existingFileTypes[id] ||
          (known.type === "video" ? "video" : "image");
      }
      this.existingFileIds = canonicalExistingIds;
      this.existingMedia = canonicalExistingMedia;
      this.existingFileTypes = canonicalExistingTypes;
      this.singleSelect = options.singleSelect || false;
      this.mediaFilter = options.mediaFilter || null;
      this.allowVideo = options.allowVideo || false;
      if (this.allowVideo && this.mediaFilter === "image") {
        this.mediaFilter = null;
      }
      this.hideFlowTilePicker = options.hideFlowTilePicker || false;
      this.cleanFlowRefs = options.cleanFlowRefs !== false;
      if (options.maxSelections === 0) {
        this.maxSelections = 0;
      } else if (
        typeof options.maxSelections === "number" &&
        options.maxSelections > 0
      ) {
        this.maxSelections = options.maxSelections;
      } else {
        this.maxSelections = null;
      }
      this.maxImageSelections =
        typeof options.maxImageSelections === "number"
          ? options.maxImageSelections
          : this.maxSelections;
      this.maxVideoSelections =
        typeof options.maxVideoSelections === "number"
          ? options.maxVideoSelections
          : 0;
      this.maxTotalSelections =
        typeof options.maxTotalSelections === "number"
          ? options.maxTotalSelections
          : null;
      this.singleKind = options.singleKind === true;
      this.noRefSupportContext = options.noRefSupportContext || null;
      this.refImagesPerPrompt =
        options.refImagesPerPrompt == null
          ? null
          : window.RefImageAssignment.count(options.refImagesPerPrompt);
      this.uploadedImages = [];
      this.albumData = [];
      this._albumBlobUrls = [];
      this.selectedImages = new Map();
      this._confirming = false;
      this._visibleCount = 20;
      this._visibleAlbumCount = 3;
      this._collapsedAlbums = this._collapsedAlbums || new Set();
      this._needsFullRerender = false;
      if (this.maxSelections !== 0) {
        this.existingFileIds.forEach((fid) => {
          const id = fid.trim();
          if (!id) return;
          const knownType =
            this.existingFileTypes[id] === "video" ? "video" : "image";
          const known = this.existingMedia[id] || {};
          this.selectedImages.set(id, {
            fileId: id,
            thumbnail: known.thumbnail || "",
            ...(known.source_thumbnail && {
              source_thumbnail: known.source_thumbnail,
            }),
            ...(known.video_url && { video_url: known.video_url }),
            ...(known.file_name && { file_name: known.file_name }),
            ...(known.media_uuid && { media_uuid: known.media_uuid }),
            ...(known.persistent_media_id && {
              persistent_media_id: known.persistent_media_id,
            }),
            ...(known.identity_durability && {
              identity_durability: known.identity_durability,
            }),
            ...(known.identity_kind && { identity_kind: known.identity_kind }),
            ...(Array.isArray(known.identity_aliases) && {
              identity_aliases: known.identity_aliases,
            }),
            ...(known.api_driver && { api_driver: known.api_driver }),
            ...(known.project_id && { project_id: known.project_id }),
            ...(known.protocol_revision && {
              protocol_revision: known.protocol_revision,
            }),
            ...(known.protocol_fingerprint && {
              protocol_fingerprint: known.protocol_fingerprint,
            }),
            ...(known.display_name && { display_name: known.display_name }),
            source: "existing",
            type: knownType,
          });
        });
      }
      this.render();
      this.bindEvents();
      this.updateSelectedCount();
      this._isLoadingAlbums = false;
      this._loadSessionId = Date.now();
      this._loadAlbums();
      const cachedFlowImages = _ImagePickerModal._cachedFlowImages;
      const hasCompleteDisplayNames =
        Array.isArray(cachedFlowImages) &&
        cachedFlowImages.length > 0 &&
        cachedFlowImages.every(
          (img) =>
            typeof img?.display_name === "string" && img.display_name.trim(),
        ) &&
        cachedFlowImages.every(
          (img) => img?.type !== "video" || !!img.thumbnail || !!img.video_url,
        );
      if (hasCompleteDisplayNames) {
        this.flowImages = cachedFlowImages;
        this._mergeExistingMedia();
        const filtered = this._getFilteredFlowImages();
        const countEl = this.overlay?.querySelector("#flowImageCount");
        if (countEl) countEl.textContent = filtered.length;
      } else if (
        Array.isArray(cachedFlowImages) &&
        cachedFlowImages.length > 0
      ) {
        _ImagePickerModal._cachedFlowImages = null;
      }
    }
    _mediaIdentityTokens(media, fallbackId = null) {
      const fileName = String(media?.file_name || "").trim();
      const identityFileName =
        /^[A-Za-z0-9_-]{32,1024}$/.test(fileName) ||
        /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(fileName)
          ? fileName
          : null;
      const values = [
        fallbackId,
        media?.fileId,
        media?.file_id,
        media?.media_uuid,
        media?.persistent_media_id,
        identityFileName,
        ...(Array.isArray(media?.identity_aliases)
          ? media.identity_aliases
          : []),
      ];
      return new Set(
        values.map((value) => String(value || "").trim()).filter(Boolean),
      );
    }
    _sameMediaIdentity(left, right, leftId = null, rightId = null) {
      const a = this._mediaIdentityTokens(left, leftId);
      const b = this._mediaIdentityTokens(right, rightId);
      for (const token of a) if (b.has(token)) return true;
      return false;
    }
    _mergeMediaAliases(primary, secondary) {
      const merged = { ...(secondary || {}), ...(primary || {}) };
      for (const key of [
        "thumbnail",
        "source_thumbnail",
        "video_url",
        "file_name",
        "media_uuid",
        "persistent_media_id",
        "identity_durability",
        "identity_kind",
        "api_driver",
        "project_id",
        "protocol_revision",
        "protocol_fingerprint",
        "display_name",
      ]) {
        if (!merged[key] && secondary?.[key]) merged[key] = secondary[key];
      }
      merged.fileId = primary?.fileId || secondary?.fileId;
      if (primary?.type === "video" || secondary?.type === "video")
        merged.type = "video";
      if (primary?.source === "flow" || secondary?.source === "flow")
        merged.source = "flow";
      merged.identity_aliases = [
        ...new Set([
          ...this._mediaIdentityTokens(primary),
          ...this._mediaIdentityTokens(secondary),
        ]),
      ];
      return merged;
    }
    _mergeExistingMedia() {
      if (!Array.isArray(this.flowImages)) this.flowImages = [];
      const dedupedFlow = [];
      for (const media of this.flowImages) {
        const index = dedupedFlow.findIndex((existing) =>
          this._sameMediaIdentity(existing, media),
        );
        if (index < 0) dedupedFlow.push({ ...media });
        else
          dedupedFlow[index] = this._mergeMediaAliases(
            dedupedFlow[index],
            media,
          );
      }
      this.flowImages = dedupedFlow;
      const reconciledIds = [];
      const reconciledMedia = {};
      const reconciledTypes = {};
      const reconciledSeen = new Set();
      for (const rawId of this.existingFileIds || []) {
        const fileId = String(rawId || "").trim();
        if (!fileId) continue;
        const known = this.existingMedia?.[fileId] || {};
        const type =
          this.existingFileTypes?.[fileId] === "video" ? "video" : "image";
        const matchIndex = this.flowImages.findIndex((media) =>
          this._sameMediaIdentity(media, known, media?.fileId, fileId),
        );
        let resolvedId = fileId;
        let resolvedMedia = known;
        if (matchIndex >= 0) {
          const flowMedia = this._mergeMediaAliases(
            this.flowImages[matchIndex],
            { ...known, fileId, type },
          );
          this.flowImages[matchIndex] = flowMedia;
          resolvedId = flowMedia.fileId || fileId;
          resolvedMedia = flowMedia;
          const selected = this.selectedImages.get(fileId);
          if (selected && resolvedId !== fileId) {
            this.selectedImages.delete(fileId);
            this.selectedImages.set(resolvedId, {
              ...flowMedia,
              ...selected,
              fileId: resolvedId,
              source: "existing",
              identity_aliases: flowMedia.identity_aliases,
            });
          }
        } else {
          const existingRecord = {
            fileId,
            file_name: known.file_name || fileId,
            display_name: known.file_name || fileId,
            thumbnail: known.thumbnail || known.source_thumbnail || "",
            type,
            source: "existing",
            ...known,
          };
          existingRecord.fileId = fileId;
          existingRecord.identity_aliases = [
            ...this._mediaIdentityTokens(existingRecord, fileId),
          ];
          this.flowImages.unshift(existingRecord);
          resolvedMedia = existingRecord;
        }
        if (reconciledSeen.has(resolvedId)) continue;
        reconciledSeen.add(resolvedId);
        reconciledIds.push(resolvedId);
        reconciledMedia[resolvedId] = resolvedMedia;
        reconciledTypes[resolvedId] =
          type === "video" || resolvedMedia.type === "video"
            ? "video"
            : "image";
      }
      this.existingFileIds = reconciledIds;
      this.existingMedia = reconciledMedia;
      this.existingFileTypes = reconciledTypes;
    }
    close(force = false) {
      if (this._cleaning && !force) {
        try {
          const btn = this.overlay?.querySelector("#imgpickerConfirmBtn");
          if (btn) {
            btn.style.transition = "opacity .12s";
            btn.style.opacity = "0.4";
            setTimeout(() => {
              try {
                btn.style.opacity = "";
              } catch (_) {}
            }, 140);
          }
        } catch (_) {}
        return;
      }
      if (this._escHandler) {
        document.removeEventListener("keydown", this._escHandler);
        this._escHandler = null;
      }
      if (this._albumBlobUrls) {
        this._albumBlobUrls = [];
      }
      if (this.overlay) {
        this.overlay.remove();
        this.overlay = null;
      }
    }
    render() {
      this.close(true);
      this.overlay = document.createElement("div");
      this.overlay.className = "imgpicker-overlay";
      this.overlay.innerHTML = `
        <div class="imgpicker-modal">
          <div class="imgpicker-header">
            <h3 class="imgpicker-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
              ${window.I18n?.t("imagePicker.selectRefImages") || "Select / Upload image"}
            </h3>
            <button class="imgpicker-close" id="imgpickerClose">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          ${this.maxSelections === 0 ? this._renderNoRefBanner() : ""}

          <div class="imgpicker-tabs">
            <button class="imgpicker-tab active" data-tab="album">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
              Album
              <span class="imgpicker-tab-count" id="albumImageCount">0</span>
            </button>
            <button class="imgpicker-tab" data-tab="flow">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
              </svg>
              ${window.I18n?.t("imagePicker.flow") || "Flow Images"}
              <span class="imgpicker-tab-count" id="flowImageCount">0</span>
            </button>
            <button class="imgpicker-tab" data-tab="upload">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              Upload
              <span class="imgpicker-tab-count" id="uploadImageCount">0</span>
            </button>
          </div>

          <div class="imgpicker-content">
            <!-- Album Tab -->
            <div class="imgpicker-pane active" id="paneAlbum">
              <div class="imgpicker-album-container" id="albumContainer">
                <div class="imgpicker-loading">${window.I18n?.t("imagePicker.loadingAlbums") || "Loading albums..."}</div>
              </div>
            </div>

            <!-- Flow Images Tab -->
            <div class="imgpicker-pane" id="paneFlow">
              <div class="imgpicker-toolbar">
                <button class="btn btn-secondary btn-sm" id="scanFlowBtn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                  </svg>
                  ${window.I18n?.t("imagePicker.rescan") || "Rescan"}
                </button>
                <span class="imgpicker-hint" id="flowScanStatus">${window.I18n?.t("imagePicker.scanning") || "Scanning..."}</span>
              </div>
              <div class="imgpicker-grid" id="flowImageGrid">
                <!-- Flow images loaded here -->
              </div>
            </div>

            <!-- Upload Tab -->
            <div class="imgpicker-pane" id="paneUpload">
              <div class="imgpicker-drop-zone" id="imgpickerDropZone">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M15 8h.01"></path>
                  <path d="M12.5 21h-6.5a3 3 0 0 1 -3 -3v-12a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v6.5"></path>
                  <path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l3.5 3.5"></path>
                  <path d="M14 14l1 -1c.679 -.653 1.473 -.829 2.214 -.526"></path>
                  <path d="M19 22v-6"></path>
                  <path d="M22 19l-3 -3l-3 3"></path>
                </svg>
                <p>${window.I18n?.t("imagePicker.dragDropHere") || "Drag and drop images here"}</p>
                <span>${window.I18n?.t("imagePicker.orText") || "or"}</span>
                <button class="btn btn-secondary btn-sm" id="imgpickerBrowseBtn" type="button">${window.I18n?.t("imagePicker.orSelectFromComputer") || "Select from computer"}</button>
                <input type="file" id="imgpickerFileInput" multiple accept="${this.allowVideo ? "image/*,video/*" : "image/*"}" style="display:none;" />
              </div>
              <div class="imgpicker-grid" id="uploadImageGrid">
                <!-- Uploaded images here -->
              </div>
            </div>
          </div>

          <div class="imgpicker-footer">
            <div class="imgpicker-selected-info" id="imgpickerSelectedInfo">
              ${window.I18n?.t("imagePicker.selectedCount", { count: '<span id="selectedCount">0</span>' }) || '<span id="selectedCount">0</span> images selected'}
            </div>
            <div class="imgpicker-footer-actions">
              <button class="btn btn-secondary" id="imgpickerCancelBtn">${window.I18n?.t("imagePicker.cancel") || "Cancel"}</button>
              <button class="btn btn-primary" id="imgpickerConfirmBtn">${window.I18n?.t("imagePicker.confirm") || "Confirm"}</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(this.overlay);
    }
    bindEvents() {
      if (!this.overlay) return;
      this.overlay
        .querySelector("#imgpickerClose")
        ?.addEventListener("click", () => this.close());
      this.overlay
        .querySelector("#imgpickerCancelBtn")
        ?.addEventListener("click", () => this.close());
      this.overlay.addEventListener("click", (e) => {
        if (e.target === this.overlay) this.close();
      });
      this._escHandler = (e) => {
        if (e.key === "Escape") this.close();
      };
      document.addEventListener("keydown", this._escHandler);
      if (this.hideFlowTilePicker) {
        const flowTab = this.overlay.querySelector(
          '.imgpicker-tab[data-tab="flow"]',
        );
        if (flowTab) flowTab.style.display = "none";
        const flowPane = this.overlay.querySelector("#paneFlow");
        if (flowPane) flowPane.style.display = "none";
      }
      this.overlay.querySelectorAll(".imgpicker-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
          const tabId = tab.dataset.tab;
          if (this.hideFlowTilePicker && tabId === "flow") return;
          this.switchTab(tabId);
        });
      });
      this.overlay
        .querySelector("#scanFlowBtn")
        ?.addEventListener("click", () => this.scanFlowImages());
      const browseBtn = this.overlay.querySelector("#imgpickerBrowseBtn");
      const fileInput = this.overlay.querySelector("#imgpickerFileInput");
      log("bindEvents: browseBtn=", !!browseBtn, "fileInput=", !!fileInput);
      if (browseBtn && fileInput) {
        browseBtn.addEventListener("click", () => {
          log("browseBtn clicked, calling fileInput.click()");
          fileInput.click();
        });
        fileInput.addEventListener("change", (e) => {
          log("fileInput change, files:", e.target.files.length);
          this.handleUpload(Array.from(e.target.files));
          fileInput.value = "";
        });
      }
      const dropZone = this.overlay.querySelector("#imgpickerDropZone");
      dropZone?.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("dragover");
      });
      dropZone?.addEventListener("dragleave", () => {
        dropZone.classList.remove("dragover");
      });
      dropZone?.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
        const files = Array.from(e.dataTransfer.files).filter(
          (f) =>
            f.type.startsWith("image/") ||
            (this.allowVideo && f.type.startsWith("video/")),
        );
        this.handleUpload(files);
      });
      dropZone?.addEventListener("click", (e) => {
        if (e.target.closest("#imgpickerBrowseBtn")) return;
        if (fileInput) fileInput.click();
      });
      this.overlay
        .querySelector("#imgpickerConfirmBtn")
        ?.addEventListener("click", () => {
          this.confirm();
        });
    }
    switchTab(tabId) {
      this.activeTab = tabId;
      const tabs = this.overlay?.querySelectorAll(".imgpicker-tab");
      const panes = this.overlay?.querySelectorAll(".imgpicker-pane");
      const paneMap = {
        flow: "paneFlow",
        album: "paneAlbum",
        upload: "paneUpload",
      };
      tabs?.forEach((t) =>
        t.classList.toggle("active", t.dataset.tab === tabId),
      );
      panes?.forEach((p) => {
        p.classList.toggle("active", p.id === paneMap[tabId]);
      });
      if (tabId === "album" && this.albumData.length === 0) {
        this._loadAlbums();
      }
      if (tabId === "flow" && this.flowImages.length === 0) {
        this.scanFlowImages();
      } else if (tabId === "flow" && this.flowImages.length > 0) {
        this._renderFlowGrid();
        this._backgroundScan();
      }
    }
    async scanFlowImages() {
      const statusEl = this.overlay?.querySelector("#flowScanStatus");
      const gridEl = this.overlay?.querySelector("#flowImageGrid");
      const countEl = this.overlay?.querySelector("#flowImageCount");
      if (!gridEl) return;
      if (statusEl)
        statusEl.textContent =
          window.I18n?.t("imagePicker.activatingTab") || "Activating tab...";
      gridEl.innerHTML = Array.from(
        { length: 12 },
        () => '<div class="imgpicker-skeleton"></div>',
      ).join("");
      try {
        await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: "ensureFlowTabReady" }, () =>
            resolve(),
          );
        });
        await new Promise((r) => setTimeout(r, 300));
      } catch (err) {
        log("ensureFlowTabReady failed:", err.message);
      }
      if (statusEl)
        statusEl.textContent =
          window.I18n?.t("imagePicker.scanning") || "Scanning...";
      const MAX_RETRIES = 2;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          if (window.MessageBridge) {
            const result = await MessageBridge.scanFlowImages();
            this.flowImages = result?.images || [];
            this._mergeExistingMedia();
          } else {
            this.flowImages = [];
          }
        } catch (err) {
          log("Scan attempt", attempt + 1, "failed:", err.message);
          this.flowImages = [];
        }
        if (this.flowImages.length > 0 || attempt >= MAX_RETRIES) break;
        if (statusEl)
          statusEl.textContent =
            window.I18n?.t("imagePicker.waitingImages") ||
            "Waiting for images...";
        await new Promise((r) => setTimeout(r, 1e3));
      }
      log("Found", this.flowImages.length, "images on Flow");
      const filtered = this._getFilteredFlowImages();
      if (countEl) countEl.textContent = filtered.length;
      if (filtered.length === 0) {
        const noFoundKey =
          this.mediaFilter === "video"
            ? "imagePicker.noVideosFound"
            : "imagePicker.noImagesFound";
        const noFoundFallback =
          this.mediaFilter === "video"
            ? "Kh\xF4ng t\xECm th\u1EA5y video n\xE0o tr\xEAn trang Flow"
            : "Kh\xF4ng t\xECm th\u1EA5y \u1EA3nh n\xE0o tr\xEAn trang Flow";
        gridEl.innerHTML = `<div class="imgpicker-empty">${window.I18n?.t(noFoundKey) || noFoundFallback}</div>`;
        const mediaType =
          this.mediaFilter === "video"
            ? "video"
            : window.I18n?.t("common.images") || "images";
        if (statusEl)
          statusEl.textContent =
            window.I18n?.t("imagePicker.noMedia", { type: mediaType }) ||
            `No ${mediaType}`;
        return;
      }
      if (statusEl)
        statusEl.textContent =
          window.I18n?.t("imagePicker.foundImages", {
            count: filtered.length,
          }) || `Found ${filtered.length} images`;
      _ImagePickerModal._cachedFlowImages = this.flowImages;
      this._visibleCount = 20;
      this._deepScanned = false;
      this._renderFlowGrid();
    }
    async _backgroundScan() {
      try {
        await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: "ensureFlowTabReady" }, () =>
            resolve(),
          );
        });
        await new Promise((r) => setTimeout(r, 200));
        let images = [];
        if (window.MessageBridge) {
          const result = await MessageBridge.scanFlowImages();
          images = result?.images || [];
        }
        if (images.length > 0) {
          this.flowImages = images;
          this._mergeExistingMedia();
          _ImagePickerModal._cachedFlowImages = this.flowImages;
          const filtered = this._getFilteredFlowImages();
          const countEl = this.overlay?.querySelector("#flowImageCount");
          if (countEl) countEl.textContent = filtered.length;
          const statusEl = this.overlay?.querySelector("#flowScanStatus");
          if (statusEl)
            statusEl.textContent =
              window.I18n?.t("imagePicker.foundImages", {
                count: filtered.length,
              }) || `Found ${filtered.length} images`;
          this._visibleCount = 20;
          this._deepScanned = false;
          this._needsFullRerender = true;
          this._renderFlowGrid();
        }
      } catch (e) {
        log("Background scan failed:", e.message);
      }
    }
    _scanPageImages() {
      log("Flow scan bridge unavailable; refusing local DOM fallback");
      return [];
    }
    _renderChunked(items, container) {
      const CHUNK_SIZE = 5;
      let offset = 0;
      const startIndex = container.querySelectorAll(".imgpicker-item").length;
      const renderNextChunk = () => {
        if (offset >= items.length) {
          this._bindGridEvents(container, "flow", startIndex);
          this._bindImageLoadEvents(container);
          return;
        }
        const chunk = items.slice(offset, offset + CHUNK_SIZE);
        const fragment = document.createDocumentFragment();
        const temp = document.createElement("div");
        temp.innerHTML = chunk
          .map((img) => this._createImageItemHTML(img))
          .join("");
        while (temp.firstChild) fragment.appendChild(temp.firstChild);
        container.appendChild(fragment);
        this._bindImageLoadEvents(container);
        offset += CHUNK_SIZE;
        requestAnimationFrame(renderNextChunk);
      };
      requestAnimationFrame(renderNextChunk);
    }
    _getFilteredFlowImages() {
      if (!this.mediaFilter) return this.flowImages;
      return this.flowImages.filter((img) => img.type === this.mediaFilter);
    }
    _renderFlowGrid() {
      const gridEl = this.overlay?.querySelector("#flowImageGrid");
      if (!gridEl) return;
      const filtered = this._getFilteredFlowImages();
      const renderedCount = gridEl.querySelectorAll(".imgpicker-item").length;
      const targetCount = Math.min(this._visibleCount, filtered.length);
      if (renderedCount === 0 || this._needsFullRerender) {
        this._needsFullRerender = false;
        gridEl.innerHTML = "";
        const visible = filtered.slice(0, targetCount);
        this._renderChunked(visible, gridEl);
      } else if (targetCount > renderedCount) {
        const loadMoreEl = gridEl.querySelector("#imgpickerLoadMore");
        if (loadMoreEl) loadMoreEl.remove();
        const newItems = filtered.slice(renderedCount, targetCount);
        const fragment = document.createDocumentFragment();
        const temp = document.createElement("div");
        temp.innerHTML = newItems
          .map((img) => this._createImageItemHTML(img))
          .join("");
        while (temp.firstChild) fragment.appendChild(temp.firstChild);
        gridEl.appendChild(fragment);
        this._bindGridEvents(gridEl, "flow", renderedCount);
        this._bindImageLoadEvents(gridEl);
      }
      const existingLoadMore = gridEl.querySelector("#imgpickerLoadMore");
      if (existingLoadMore) existingLoadMore.remove();
      const hasMore = filtered.length > targetCount;
      if (hasMore) {
        const remaining = filtered.length - targetCount;
        gridEl.insertAdjacentHTML(
          "beforeend",
          `<div class="imgpicker-load-more" id="imgpickerLoadMore">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="16"></line>
              <line x1="8" y1="12" x2="16" y2="12"></line>
            </svg>
            <span>${window.I18n?.t("imagePicker.viewMore", { count: remaining }) || `View ${remaining} more image(s)`}</span>
            <svg class="imgpicker-load-more-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>`,
        );
        gridEl
          .querySelector("#imgpickerLoadMore")
          ?.addEventListener("click", () => {
            this._visibleCount += 20;
            this._renderFlowGrid();
          });
      } else if (!this._deepScanned && !this._deepScanning) {
        gridEl.insertAdjacentHTML(
          "beforeend",
          `<div class="imgpicker-load-more" id="imgpickerDeepScan">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
            <span>${window.I18n?.t("imagePicker.deepScan") || "Scan more images at the end of Flow"}</span>
          </div>`,
        );
        gridEl
          .querySelector("#imgpickerDeepScan")
          ?.addEventListener("click", () => this._deepScanFlow());
      }
      const pane = this.overlay?.querySelector("#paneFlow");
      if (pane && !pane._scrollBound) {
        pane._scrollBound = true;
        let scrollTimer = null;
        pane.addEventListener("scroll", () => {
          if (scrollTimer) return;
          scrollTimer = setTimeout(() => {
            scrollTimer = null;
            const { scrollTop, scrollHeight, clientHeight } = pane;
            if (scrollTop + clientHeight < scrollHeight - 100) return;
            if (this._visibleCount < this.flowImages.length) {
              this._visibleCount += 20;
              this._renderFlowGrid();
            }
          }, 150);
        });
      }
    }
    async _deepScanFlow() {
      if (this._deepScanning || this._deepScanned || !window.MessageBridge)
        return;
      this._deepScanning = true;
      const gridEl = this.overlay?.querySelector("#flowImageGrid");
      const statusEl = this.overlay?.querySelector("#flowScanStatus");
      const btnSpan = gridEl?.querySelector("#imgpickerDeepScan span");
      const scanningTxt =
        window.I18n?.t("imagePicker.deepScanning") || "Scanning all of Flow...";
      if (btnSpan) btnSpan.textContent = scanningTxt;
      if (statusEl) statusEl.textContent = scanningTxt;
      try {
        await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: "ensureFlowTabReady" }, () =>
            resolve(),
          );
        });
        await new Promise((r) => setTimeout(r, 200));
        const result = await MessageBridge.scanFlowImages(true);
        const images = result?.images || [];
        if (images.length > (this.flowImages?.length || 0)) {
          this.flowImages = images;
          this._mergeExistingMedia();
          _ImagePickerModal._cachedFlowImages = this.flowImages;
        }
        this._deepScanned = true;
        this._visibleCount += 20;
        this._needsFullRerender = true;
        this._renderFlowGrid();
        const filtered = this._getFilteredFlowImages();
        const countEl = this.overlay?.querySelector("#flowImageCount");
        if (countEl) countEl.textContent = filtered.length;
        if (statusEl)
          statusEl.textContent =
            window.I18n?.t("imagePicker.foundImages", {
              count: filtered.length,
            }) || `Found ${filtered.length} images`;
      } catch (e) {
        log("Deep scan failed:", e.message);
        this._deepScanned = true;
        if (statusEl)
          statusEl.textContent =
            window.I18n?.t("imagePicker.scanError") || "Scan error";
      } finally {
        this._deepScanning = false;
      }
    }
    _createImageItemHTML(img) {
      const isSelected = this.selectedImages.has(img.fileId);
      const isExisting = this.existingFileIds.includes(img.fileId);
      const displayName = img.display_name || img.file_name || img.fileId;
      const isVideo = img.type === "video";
      const videoUrl = img.video_url || "";
      const safeVideoUrl = this._escapeHtml(videoUrl);
      const safeThumbnail = this._escapeHtml(img.thumbnail || "");
      const safeFileId = this._escapeHtml(img.fileId || "");
      const mediaHtml =
        isVideo && !safeThumbnail && videoUrl
          ? `<video src="${safeVideoUrl}" class="imgpicker-video-preview" muted playsinline preload="metadata" aria-label="Video"></video>`
          : isVideo && !safeThumbnail
            ? '<div class="imgpicker-video-preview imgpicker-video-preview--placeholder" aria-label="Video">\u25B6</div>'
            : `<img src="${safeThumbnail}" alt="${isVideo ? "Flow video thumbnail" : "Flow image"}" loading="lazy" />`;
      return `
        <div class="imgpicker-item ${isVideo && !safeThumbnail && videoUrl ? "" : "imgpicker-item--loading"} ${isSelected ? "selected" : ""} ${isExisting ? "imgpicker-item--existing" : ""}" data-file-id="${safeFileId}" data-source="flow">
          ${mediaHtml}
          <div class="imgpicker-item-overlay">
            <div class="imgpicker-item-check">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
          </div>
          ${isVideo ? '<div class="imgpicker-item-badge">Video</div>' : ""}
          <div class="imgpicker-item-id imgpicker-item-id--name" title="${this._escapeHtml(displayName)}">${this._escapeHtml(displayName)}</div>
        </div>
      `;
    }
    _needsFlowThumbnailProxy(url) {
      try {
        const parsed = new URL(url);
        return (
          (parsed.hostname === "flow.google.com" ||
            parsed.hostname === "labs.google") &&
          parsed.pathname.startsWith("/asb/")
        );
      } catch (_) {
        return false;
      }
    }
    async _resolveFlowImageByUuid(item, sourceUrl) {
      const entry = this.flowImages?.find(
        (image) => image.fileId === item?.dataset.fileId,
      );
      const uuid = [entry?.media_uuid, entry?.fileId].find((value) =>
        /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(
          String(value || ""),
        ),
      );
      if (
        !uuid ||
        !this._needsFlowThumbnailProxy(sourceUrl) ||
        !window.FlowApiFacade?.resolveMedia
      )
        return "";
      try {
        const selection = await window.FlowApiSessionCoordinator?.check?.({
          surface: "workflow",
          mediaType: "image",
          passive: true,
          ...(entry.project_id && { projectId: entry.project_id }),
        });
        if (
          selection?.ready !== true ||
          selection.driver !== "v2" ||
          !selection.projectId
        )
          return "";
        if (entry?.project_id && entry.project_id !== selection.projectId)
          return "";
        const config =
          await window.ProviderConfigManager?.fetchFlowApiV2Configs?.();
        if (!config) return "";
        const result = await window.FlowApiFacade.resolveMedia({
          mediaId: uuid,
          mediaType: "image",
          providerData: {
            provider: "flow",
            api_driver: "v2",
            uuidLookup: true,
            project_id: selection.projectId,
            protocol_revision: Number(config.protocol?.schema_version || 0),
            protocol_fingerprint:
              window.FlowApiV2CheckpointStore?.fingerprint?.(config) || null,
          },
        });
        return /^https:\/\//i.test(result?.url || "") ? result.url : "";
      } catch (error) {
        console.warn(
          "[ImagePickerModal] UUID image lookup failed:",
          error?.message || error,
        );
        return "";
      }
    }
    async _resolveFlowThumbnail(img, item) {
      const sourceUrl = img?.dataset?.flowSourceUrl || img?.src || "";
      if (!img || !item || !/^https?:\/\//i.test(sourceUrl)) return false;
      img.dataset.flowSourceUrl = sourceUrl;
      let pending = _ImagePickerModal._flowThumbnailProxyCache.get(sourceUrl);
      if (!pending) {
        pending = new Promise((resolve) => {
          let settled = false;
          const finish = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
          };
          const timer = setTimeout(() => finish(null), 2e4);
          chrome.runtime.sendMessage(
            { action: "fetchImageAsBase64", url: sourceUrl },
            (result) => {
              clearTimeout(timer);
              if (
                chrome.runtime.lastError ||
                !result?.success ||
                !result.base64
              ) {
                finish(null);
                return;
              }
              finish(
                `data:${result.contentType || "image/jpeg"};base64,${result.base64}`,
              );
            },
          );
        });
        _ImagePickerModal._flowThumbnailProxyCache.set(sourceUrl, pending);
        if (_ImagePickerModal._flowThumbnailProxyCache.size > 80) {
          const oldest = _ImagePickerModal._flowThumbnailProxyCache
            .keys()
            .next().value;
          _ImagePickerModal._flowThumbnailProxyCache.delete(oldest);
        }
      }
      let dataUrl = await pending;
      if (!dataUrl && img.isConnected)
        dataUrl = await this._resolveFlowImageByUuid(item, sourceUrl);
      if (!dataUrl || !img.isConnected) {
        _ImagePickerModal._flowThumbnailProxyCache.delete(sourceUrl);
        return false;
      }
      const fileId = item.dataset.fileId;
      const flowImage = this.flowImages?.find(
        (entry) => entry.fileId === fileId,
      );
      if (flowImage) {
        flowImage.source_thumbnail = flowImage.source_thumbnail || sourceUrl;
        flowImage.thumbnail = dataUrl;
      }
      const selected = this.selectedImages?.get(fileId);
      if (selected) {
        selected.source_thumbnail = selected.source_thumbnail || sourceUrl;
        selected.thumbnail = dataUrl;
      }
      img.src = dataUrl;
      item.classList.remove("imgpicker-item--loading");
      item.classList.add("imgpicker-item--loaded");
      return true;
    }
    _bindImageLoadEvents(container) {
      const items = container.querySelectorAll(".imgpicker-item--loading");
      for (const item of items) {
        const img = item.querySelector("img");
        if (!img || img._loadBound) continue;
        img._loadBound = true;
        img.addEventListener("load", () => {
          item.classList.remove("imgpicker-item--loading");
          item.classList.add("imgpicker-item--loaded");
        });
        img.addEventListener("error", async () => {
          if (!img._flowProxyAttempted && /^https?:\/\//i.test(img.src || "")) {
            img._flowProxyAttempted = true;
            if (await this._resolveFlowThumbnail(img, item)) return;
          }
          item.classList.remove("imgpicker-item--loading");
        });
        if (img.complete && img.naturalWidth > 0) {
          item.classList.remove("imgpicker-item--loading");
          item.classList.add("imgpicker-item--loaded");
        } else if (this._needsFlowThumbnailProxy(img.src)) {
          img._flowProxyAttempted = true;
          void this._resolveFlowThumbnail(img, item).then((ok) => {
            if (!ok && img.isConnected)
              item.classList.remove("imgpicker-item--loading");
          });
        }
      }
      const videos = container.querySelectorAll(".imgpicker-video-preview");
      for (const video of videos) {
        if (video._loadBound) continue;
        video._loadBound = true;
        video.addEventListener(
          "loadedmetadata",
          () => {
            try {
              video.currentTime = 0.1;
            } catch (_) {}
          },
          { once: true },
        );
      }
    }
    _createThumbnail(file, maxSize = 200) {
      if (file.type?.startsWith("video/"))
        return this._createVideoThumbnail(file, maxSize);
      return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        let timer = setTimeout(() => {
          timer = null;
          URL.revokeObjectURL(url);
          resolve(null);
        }, 1e4);
        img.onload = () => {
          if (!timer) return;
          clearTimeout(timer);
          const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          const thumbnail = canvas.toDataURL("image/jpeg", 0.7);
          URL.revokeObjectURL(url);
          resolve(thumbnail);
        };
        img.onerror = () => {
          if (!timer) return;
          clearTimeout(timer);
          URL.revokeObjectURL(url);
          resolve(null);
        };
        img.src = url;
      });
    }
    _createVideoThumbnail(file, maxSize = 200) {
      return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const video = document.createElement("video");
        video.muted = true;
        video.preload = "metadata";
        let done = false;
        const timer = setTimeout(() => finish(null), 1e4);
        const finish = (result) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          URL.revokeObjectURL(url);
          resolve(result);
        };
        const capture = () => {
          try {
            const vw = video.videoWidth,
              vh = video.videoHeight;
            if (!vw || !vh) return finish(null);
            const scale = Math.min(maxSize / vw, maxSize / vh, 1);
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(vw * scale);
            canvas.height = Math.round(vh * scale);
            canvas
              .getContext("2d")
              .drawImage(video, 0, 0, canvas.width, canvas.height);
            finish(canvas.toDataURL("image/jpeg", 0.7));
          } catch (e) {
            finish(null);
          }
        };
        video.onloadeddata = () => {
          try {
            video.currentTime = Math.min(0.1, video.duration || 0.1);
          } catch (e) {
            capture();
          }
        };
        video.onseeked = capture;
        video.onerror = () => finish(null);
        video.src = url;
      });
    }
    async handleUpload(files) {
      log("handleUpload called with", files.length, "files");
      for (const file of files) {
        const key = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const thumbnail = await this._createThumbnail(file);
        if (!thumbnail) {
          log("Failed to create thumbnail for", file.name);
          continue;
        }
        const imgData = {
          key,
          file,
          thumbnail,
          source: "upload",
          file_name: file.name,
          type: file.type?.startsWith("video/") ? "video" : "image",
        };
        this.uploadedImages.push(imgData);
        if (this.singleSelect) {
          this.selectedImages.clear();
          this.overlay
            ?.querySelectorAll(".imgpicker-item.selected")
            .forEach((el) => {
              el.classList.remove("selected");
            });
        }
        if (
          !this.singleSelect &&
          this.maxSelections !== null &&
          this.selectedImages.size >= this.maxSelections
        ) {
          if (this.maxSelections === 0) this._showNoRefSupportWarning();
          else this._showMaxReachedWarning();
          this._renderUploadGrid();
          const countEl2 = this.overlay?.querySelector("#uploadImageCount");
          if (countEl2) countEl2.textContent = this.uploadedImages.length;
          continue;
        }
        this.selectedImages.set(key, {
          fileId: key,
          thumbnail,
          source: "upload",
          file,
          type: imgData.type,
          file_name: file.name,
          name: file.name.replace(/\.[^/.]+$/, ""),
        });
        this._renderUploadGrid();
        this.updateSelectedCount();
        const countEl = this.overlay?.querySelector("#uploadImageCount");
        if (countEl) countEl.textContent = this.uploadedImages.length;
      }
    }
    _renderUploadGrid() {
      const gridEl = this.overlay?.querySelector("#uploadImageGrid");
      if (!gridEl) return;
      gridEl.innerHTML = this.uploadedImages
        .map((img) => {
          const isSelected = this.selectedImages.has(img.key);
          return `
          <div class="imgpicker-item ${isSelected ? "selected" : ""}" data-file-id="${img.key}" data-source="upload">
            <img src="${img.thumbnail}" alt="${this._escapeHtml(img.file_name)}" />
            <div class="imgpicker-item-overlay">
              <div class="imgpicker-item-check">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
            </div>
            <button class="imgpicker-item-remove" data-key="${img.key}">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            ${img.type === "video" ? '<div class="imgpicker-item-badge">Video</div>' : ""}
            <div class="imgpicker-item-id">${this._escapeHtml(img.file_name.substring(0, 15))}</div>
          </div>
        `;
        })
        .join("");
      this._bindGridEvents(gridEl, "upload");
      gridEl.querySelectorAll(".imgpicker-item-remove").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const key = btn.dataset.key;
          this.uploadedImages = this.uploadedImages.filter(
            (img) => img.key !== key,
          );
          this.selectedImages.delete(key);
          this._renderUploadGrid();
          this.updateSelectedCount();
          const countEl = this.overlay?.querySelector("#uploadImageCount");
          if (countEl) countEl.textContent = this.uploadedImages.length;
        });
      });
    }
    _bindGridEvents(gridEl, source, startIndex = 0) {
      const delegationKey = `_delegated_${source}`;
      if (gridEl[delegationKey]) return;
      gridEl[delegationKey] = true;
      gridEl.addEventListener("click", (e) => {
        const item = e.target.closest(".imgpicker-item");
        if (!item) return;
        if (e.target.closest(".imgpicker-item-remove")) return;
        const fileId = item.dataset.fileId;
        const itemSource = item.dataset.source || source;
        if (this.selectedImages.has(fileId)) {
          this.selectedImages.delete(fileId);
          item.classList.remove("selected");
        } else {
          if (this.singleSelect) {
            this.selectedImages.clear();
            this.overlay
              ?.querySelectorAll(".imgpicker-item.selected")
              .forEach((el) => {
                el.classList.remove("selected");
              });
          }
          if (
            !this.singleSelect &&
            this.maxSelections !== null &&
            this.selectedImages.size >= this.maxSelections
          ) {
            if (this.maxSelections === 0) this._showNoRefSupportWarning();
            else this._showMaxReachedWarning();
            return;
          }
          let _pickType = "image";
          if (itemSource === "flow") {
            const _fi = this.flowImages.find((i) => i.fileId === fileId);
            if (_fi?.type === "video") _pickType = "video";
          } else if (itemSource === "upload") {
            const _up = this.uploadedImages.find((i) => i.key === fileId);
            if (
              _up?.type === "video" ||
              (_up?.file?.type || "").startsWith("video/")
            )
              _pickType = "video";
          }
          if (!this.singleSelect) {
            const _counts = this._countSelectionsByType();
            if (this.singleKind) {
              if (_pickType === "video" && _counts.image > 0) {
                this._showMaxReachedWarning(
                  window.I18n?.t?.("workflow.refSingleKindImage") ||
                    "This node already holds images \u2014 deselect them first, or use a separate node for video",
                );
                return;
              }
              if (_pickType === "image" && _counts.video > 0) {
                this._showMaxReachedWarning(
                  window.I18n?.t?.("workflow.refSingleKindVideo") ||
                    "This node already holds a video \u2014 deselect it first, or use a separate node for images",
                );
                return;
              }
            }
            if (
              _pickType === "video" &&
              typeof this.maxVideoSelections === "number" &&
              _counts.video >= this.maxVideoSelections
            ) {
              this._showMaxReachedWarning(
                `T\u1ED1i \u0111a ${this.maxVideoSelections} video ref`,
              );
              return;
            }
            if (
              _pickType === "image" &&
              typeof this.maxImageSelections === "number" &&
              this.maxImageSelections !== null &&
              _counts.image >= this.maxImageSelections
            ) {
              this._showMaxReachedWarning(
                `T\u1ED1i \u0111a ${this.maxImageSelections} image ref`,
              );
              return;
            }
            if (
              typeof this.maxTotalSelections === "number" &&
              _counts.image + _counts.video >= this.maxTotalSelections
            ) {
              this._showMaxReachedWarning(
                `T\u1ED1i \u0111a ${this.maxTotalSelections} ref t\u1ED5ng`,
              );
              return;
            }
          }
          let imgData;
          if (itemSource === "flow") {
            imgData = this.flowImages.find((i) => i.fileId === fileId);
          } else if (itemSource === "album") {
            const albumImgId = item.dataset.albumImageId;
            const status = item.dataset.status || "stale";
            for (const entry of this.albumData) {
              const found = entry.images.find(
                (i) => (i.file_id || i.id) === fileId || i.id === albumImgId,
              );
              if (found) {
                let thumbSrc = found.thumbnail_url || null;
                if (!thumbSrc) {
                  const imgEl = item.querySelector("img");
                  if (imgEl && imgEl.src) thumbSrc = imgEl.src;
                }
                imgData = {
                  fileId: found.file_id || found.id,
                  thumbnail: thumbSrc,
                  source: "album",
                  file_name: found.file_name || null,
                  thumbnail_url: found.thumbnail_url || null,
                  blob_key: found.blob_key || null,
                  album_image_id: found.id,
                  name: found.name || null,
                  _status: status,
                };
                break;
              }
            }
          } else {
            const uploaded = this.uploadedImages.find((i) => i.key === fileId);
            imgData = uploaded
              ? {
                  fileId: uploaded.key,
                  thumbnail: uploaded.thumbnail,
                  source: "upload",
                  file: uploaded.file,
                  type: uploaded.type || "image",
                }
              : null;
          }
          if (imgData) {
            this.selectedImages.set(fileId, imgData);
            item.classList.add("selected");
          }
        }
        this.updateSelectedCount();
      });
    }
    updateSelectedCount() {
      const countEl = this.overlay?.querySelector("#selectedCount");
      if (countEl) {
        countEl.textContent =
          this.maxSelections !== null
            ? `${this.selectedImages.size} / ${this.maxSelections}`
            : this.selectedImages.size;
      }
      if (this.refImagesPerPrompt) {
        this.overlay?.querySelectorAll(".imgpicker-item").forEach((element) => {
          const id = element.dataset.fileId;
          const order = [...this.selectedImages.keys()].indexOf(id);
          let badge = element.querySelector(".imgpicker-ref-group");
          if (order < 0) {
            badge?.remove();
            return;
          }
          if (!badge) {
            badge = document.createElement("span");
            badge.className = "imgpicker-ref-group";
            element.appendChild(badge);
          }
          badge.textContent = String(
            Math.floor(order / this.refImagesPerPrompt) + 1,
          );
          badge.title = window.I18n?.t("gen.refsPerPrompt") || "";
        });
      }
      if (this.refImagesPerPrompt && countEl) {
        countEl.textContent +=
          " \xB7 " +
          window.I18n.t("gen.refGroupSummary", {
            count: this.refImagesPerPrompt,
          });
      }
      if (this.maxSelections !== null && !this.singleSelect) {
        const reached = this.selectedImages.size >= this.maxSelections;
        this.overlay?.querySelectorAll(".imgpicker-item").forEach((el) => {
          if (!el.classList.contains("selected")) {
            el.classList.toggle("imgpicker-item--disabled", reached);
          }
        });
      }
    }
    _showMaxReachedWarning(customMsg = null) {
      let msg = customMsg;
      if (!msg) {
        const max = this.maxSelections;
        const translated = window.I18n?.t("imagePicker.maxReached", { max });
        const isValidTranslation =
          translated && translated !== "imagePicker.maxReached";
        msg = isValidTranslation
          ? translated
          : `\u0110\xE3 \u0111\u1EA1t gi\u1EDBi h\u1EA1n ${max} \u1EA3nh tham chi\u1EBFu. B\u1ECF ch\u1ECDn \u1EA3nh kh\xE1c tr\u01B0\u1EDBc khi ch\u1ECDn th\xEAm.`;
      }
      if (window.TobyNotify?.warning) {
        window.TobyNotify.warning(msg);
      } else if (window.showNotification) {
        window.showNotification(msg, "warning");
      } else {
        console.warn("[ImagePickerModal]", msg);
      }
    }
    _countSelectionsByType() {
      let image = 0,
        video = 0;
      for (const data of this.selectedImages.values()) {
        if (
          data?.type === "video" ||
          (data?.file?.type || "").startsWith("video/")
        )
          video++;
        else image++;
      }
      return { image, video };
    }
    _renderNoRefBanner() {
      const model = this.noRefSupportContext?.modelValue || "";
      const provider = String(
        this.noRefSupportContext?.provider || "",
      ).toLowerCase();
      const mediaType = this.noRefSupportContext?.mediaType || "video";
      const inputType = this.noRefSupportContext?.inputType;
      const locale = window.I18n?._currentLocale || "vi";
      const tt = (k, params) => {
        const v = window.I18n?.t?.(k, params);
        return v && v !== k ? v : null;
      };
      const FALLBACK_HEADER = {
        vi: `Model "${model}" kh\xF4ng h\u1ED7 tr\u1EE3 \u1EA3nh tham chi\u1EBFu.`,
        en: `Model "${model}" does not support reference images.`,
        ja: `\u30E2\u30C7\u30EB\u300C${model}\u300D\u306F\u53C2\u7167\u753B\u50CF\u306B\u5BFE\u5FDC\u3057\u3066\u3044\u307E\u305B\u3093\u3002`,
        th: `\u0E42\u0E21\u0E40\u0E14\u0E25 "${model}" \u0E44\u0E21\u0E48\u0E23\u0E2D\u0E07\u0E23\u0E31\u0E1A\u0E20\u0E32\u0E1E\u0E2D\u0E49\u0E32\u0E07\u0E2D\u0E34\u0E07`,
      };
      const header =
        tt("imagePicker.modelNoRefSupport", { model }) ||
        FALLBACK_HEADER[locale] ||
        FALLBACK_HEADER.vi;
      const adapter = window.ProviderRegistry?.get?.(provider);
      const allModels =
        window.ModelRegistry?.safeGetModelsSync?.(provider, mediaType) || [];
      const supportingModels = allModels
        .filter((m) => m && m.value && m.value !== model)
        .filter((m) => {
          if (!adapter?.supportsRefImages) return true;
          try {
            return adapter.supportsRefImages(m.value, { inputType });
          } catch (_) {
            return false;
          }
        })
        .map((m) => (m.name || m.value).replace(/^Veo 3\.1 - /, "Veo 3.1 "));
      const FALLBACK_GENERIC = {
        vi: "\u2192 \u0110\u1ED5i model kh\xE1c \u0111\u1EC3 d\xF9ng ref images.",
        en: "\u2192 Switch model to use reference images.",
        ja: "\u2192 \u4ED6\u306E\u30E2\u30C7\u30EB\u306B\u5207\u308A\u66FF\u3048\u3066\u304F\u3060\u3055\u3044\u3002",
        th: "\u2192 \u0E40\u0E1B\u0E25\u0E35\u0E48\u0E22\u0E19\u0E40\u0E1B\u0E47\u0E19\u0E42\u0E21\u0E40\u0E14\u0E25\u0E2D\u0E37\u0E48\u0E19\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E43\u0E0A\u0E49\u0E20\u0E32\u0E1E\u0E2D\u0E49\u0E32\u0E07\u0E2D\u0E34\u0E07",
      };
      let hint;
      if (supportingModels.length === 0) {
        hint =
          tt("imagePicker.modelNoRefSupportSwitchGeneric") ||
          FALLBACK_GENERIC[locale] ||
          FALLBACK_GENERIC.vi;
      } else {
        const joiner =
          {
            vi: " ho\u1EB7c ",
            en: " or ",
            ja: " \u307E\u305F\u306F ",
            th: " \u0E2B\u0E23\u0E37\u0E2D ",
          }[locale] || " or ";
        const listText = supportingModels.join(joiner);
        const tail =
          {
            vi: " \u0111\u1EC3 d\xF9ng ref.",
            en: " to use refs.",
            ja: " \u306B\u5207\u308A\u66FF\u3048\u3066\u304F\u3060\u3055\u3044\u3002",
            th: " \u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E43\u0E0A\u0E49\u0E20\u0E32\u0E1E\u0E2D\u0E49\u0E32\u0E07\u0E2D\u0E34\u0E07",
          }[locale] || " to use refs.";
        hint = `\u2192 ${listText}${tail}`;
      }
      return `
        <div class="imgpicker-banner imgpicker-banner--warning" id="imgpickerNoRefBanner">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <div class="imgpicker-banner-body">
            <div class="imgpicker-banner-header">${this._escapeHtml(header)}</div>
            <div class="imgpicker-banner-hint">${this._escapeHtml(hint)}</div>
          </div>
        </div>
      `;
    }
    _showNoRefSupportWarning() {
      const model = this.noRefSupportContext?.modelValue || "";
      const locale = window.I18n?._currentLocale || "vi";
      const FALLBACK = {
        vi: `Model "${model}" kh\xF4ng h\u1ED7 tr\u1EE3 \u1EA3nh tham chi\u1EBFu.`,
        en: `Model "${model}" does not support reference images.`,
        ja: `\u30E2\u30C7\u30EB\u300C${model}\u300D\u306F\u53C2\u7167\u753B\u50CF\u306B\u5BFE\u5FDC\u3057\u3066\u3044\u307E\u305B\u3093\u3002`,
        th: `\u0E42\u0E21\u0E40\u0E14\u0E25 "${model}" \u0E44\u0E21\u0E48\u0E23\u0E2D\u0E07\u0E23\u0E31\u0E1A\u0E20\u0E32\u0E1E\u0E2D\u0E49\u0E32\u0E07\u0E2D\u0E34\u0E07`,
      };
      const translated = window.I18n?.t?.("imagePicker.modelNoRefSupport", {
        model,
      });
      const isValid =
        translated && translated !== "imagePicker.modelNoRefSupport";
      const msg = isValid ? translated : FALLBACK[locale] || FALLBACK.vi;
      if (window.TobyNotify?.warning) {
        window.TobyNotify.warning(msg);
      } else if (window.showNotification) {
        window.showNotification(msg, "warning");
      } else {
        console.warn("[ImagePickerModal]", msg);
      }
    }
    async confirm() {
      if (this._confirming) return;
      this._confirming = true;
      let selected = Array.from(this.selectedImages.values());
      log("Confirmed", selected.length, "images");
      window.MediaRegistry?.auditRefIdentity?.(
        "picker:selected",
        selected,
        this.refAuditContext,
      );
      for (const item of selected) {
        if (item?.persistent_media_id) {
          if (
            !item.media_uuid &&
            /^[0-9a-f-]{36}$/i.test(String(item.fileId || ""))
          ) {
            item.media_uuid = item.fileId;
          }
          item.fileId = item.persistent_media_id;
          item.file_name = item.file_name || item.persistent_media_id;
          item.identity_durability =
            item.type === "video" &&
            !/^[A-Za-z0-9_-]{32,1024}$/.test(String(item.persistent_media_id))
              ? "session"
              : "durable";
        }
        if (
          item?.type !== "video" ||
          item.video_url ||
          item.source === "upload" ||
          !item.fileId ||
          !window.MessageBridge?.resolveVideoPlaybackUrl
        )
          continue;
        try {
          const resolved = await MessageBridge.resolveVideoPlaybackUrl(
            item.fileId,
            {
              fileName: item.file_name || "",
              sourceUrl: item.source_thumbnail || item.thumbnail || "",
              persistentMediaId: item.persistent_media_id || "",
            },
          );
          if (resolved?.success && resolved.video_url) {
            item.video_url = resolved.video_url;
            if (resolved.persistent_media_id) {
              item.fileId = resolved.persistent_media_id;
              item.file_name = item.file_name || resolved.persistent_media_id;
              item.identity_durability = /^[A-Za-z0-9_-]{32,1024}$/.test(
                String(resolved.persistent_media_id),
              )
                ? "durable"
                : "session";
            }
            if (
              !item.thumbnail &&
              resolved.thumbnail &&
              resolved.thumbnail !== resolved.video_url
            ) {
              item.thumbnail = resolved.thumbnail;
            }
          }
        } catch (error) {
          console.warn(
            "[ImagePickerModal] resolve selected video URL failed:",
            error?.message,
          );
        }
      }
      const uniqueSelected = new Map();
      for (const item of selected) {
        const identity = String(
          item?.persistent_media_id || item?.fileId || "",
        ).trim();
        if (!identity) continue;
        const previous = uniqueSelected.get(identity) || {};
        uniqueSelected.set(identity, {
          ...previous,
          ...item,
          fileId: identity,
        });
      }
      selected = Array.from(uniqueSelected.values());
      window.MediaRegistry?.auditRefIdentity?.(
        "picker:confirmed",
        selected,
        this.refAuditContext,
      );
      console.log(
        "[ImagePickerIdentity] confirm",
        JSON.stringify(
          selected.map((item) => ({
            file_id: window.MediaRegistry?.describeIdentity?.(item?.fileId),
            type: item?.type || null,
            source: item?.source || null,
            durability: item?.identity_durability || null,
            has_thumbnail: !!item?.thumbnail,
            has_video_url: !!item?.video_url,
          })),
        ),
      );
      let out = selected;
      try {
        out = await this._cleanFlowSelections(selected);
      } catch (e) {
        console.warn(
          "[ImagePickerModal] b\u1ECF qua xo\xE1 watermark:",
          e?.message,
        );
      }
      if (out === null) {
        this._confirming = false;
        try {
          this._setConfirmBusy(false);
        } catch (_) {}
        try {
          this.overlay
            ?.querySelectorAll(".imgpicker-wmask-overlay, .imgpicker-cleaning")
            .forEach((el) => el.remove());
        } catch (_) {}
        return;
      }
      if (this.onConfirm) {
        window.MediaRegistry?.auditRefIdentity?.(
          "picker:delivered",
          out,
          this.refAuditContext,
        );
        this.onConfirm(out);
      }
      this.close();
    }
    async _cleanFlowSelections(selected) {
      const _wmLog = (why) =>
        console.log(`[ImagePicker][WM] b\u1ECF qua xo\xE1 ref: ${why}`);
      if (!this.cleanFlowRefs || !Array.isArray(selected) || !selected.length) {
        _wmLog(
          `cleanFlowRefs=${this.cleanFlowRefs} \xB7 s\u1ED1 \u1EA3nh=${Array.isArray(selected) ? selected.length : "kh\xF4ng ph\u1EA3i m\u1EA3ng"}`,
        );
        return selected;
      }
      const targets = selected.filter(
        (it) => (it?.type || "image") === "image" && it?.thumbnail,
      );
      if (!targets.length) {
        _wmLog(
          `kh\xF4ng \u1EA3nh n\xE0o h\u1EE3p l\u1EC7 (${selected.length} m\u1EE5c: ` +
            selected
              .map(
                (x) =>
                  `${x?.source || "?"}/${x?.type || "image"}${x?.thumbnail ? "" : "/thi\u1EBFu-thumbnail"}`,
              )
              .join(", ") +
            ")",
        );
        return selected;
      }
      if (!window.WatermarkClient?.enabled?.("image", { scope: "input" })) {
        _wmLog(
          `c\u1ED5ng quy\u1EC1n ch\u1EB7n \u2014 WatermarkClient=${!!window.WatermarkClient} \xB7 admin(remove_watermark_enabled)=${window.SystemConfig?.getBool?.("remove_watermark_enabled")} \xB7 quy\u1EC1n g\xF3i(image_remove_watermark_enabled)=${window.featureGate?.canUse?.("image_remove_watermark_enabled")} \xB7 c\xF4ng t\u1EAFc(autoRemoveWatermarkInput)=${JSON.stringify((window.storageSettings?.getSettings?.() || {}).autoRemoveWatermarkInput)}`,
        );
        return selected;
      }
      console.log(
        `[ImagePicker][WM] b\u1EAFt \u0111\u1EA7u xo\xE1 ${targets.length} \u1EA3nh tham chi\u1EBFu`,
      );
      const wm = await this._askRefWatermark(targets.length);
      if (wm === "cancel") return null;
      if (wm !== "clean") return selected;
      this._setConfirmBusy(true, targets.length);
      let done = 0;
      try {
        for (const it of targets) {
          try {
            const _rawUrl = String(it.thumbnail);
            const fullUrl = window.WatermarkClient?.fullSizeInputUrl
              ? await window.WatermarkClient.fullSizeInputUrl(_rawUrl)
              : window.WatermarkClient?.fullSizeUrl
                ? window.WatermarkClient.fullSizeUrl(_rawUrl)
                : _rawUrl;
            const _get = async (u) => {
              try {
                return await fetch(u, { cache: "no-store" });
              } catch (_e1) {
                return await fetch(u, {
                  credentials: "include",
                  cache: "no-store",
                });
              }
            };
            let resp = await _get(fullUrl);
            if (!resp.ok && fullUrl !== _rawUrl) resp = await _get(_rawUrl);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const blob = await resp.blob();
            const cleaned = await window.WatermarkClient.cleanBlob(
              blob,
              "image",
              { scope: "input", ignoreUserSetting: true },
            );
            if (cleaned === blob) {
              done++;
              this._setConfirmBusy(true, targets.length, done);
              continue;
            }
            let b64 = await new Promise((res, rej) => {
              const fr = new FileReader();
              fr.onload = () => res(String(fr.result).split(",")[1]);
              fr.onerror = () =>
                rej(new Error("\u0111\u1ECDc blob th\u1EA5t b\u1EA1i"));
              fr.readAsDataURL(cleaned);
            });
            const mime = cleaned.type || "image/png";
            let routed = null;
            if (window.MessageBridge?.uploadFilesToFlow) {
              const payload = [
                {
                  base64: b64,
                  type: mime,
                  name: `clean-ref-${it.fileId}.${/jpe?g/i.test(mime) ? "jpg" : "png"}`,
                },
              ];
              const uploadPromise =
                window.MessageBridge.uploadFilesToFlow(payload);
              payload[0].base64 = "";
              b64 = null;
              routed = await uploadPromise;
            }
            const uploadedDetail = routed?.tileDetails?.[0];
            if (!routed && !b64) {
              b64 = await new Promise((res, rej) => {
                const fr = new FileReader();
                fr.onload = () => res(String(fr.result).split(",")[1]);
                fr.onerror = () =>
                  rej(new Error("\u0111\u1ECDc blob th\u1EA5t b\u1EA1i"));
                fr.readAsDataURL(cleaned);
              });
            }
            const up = routed
              ? {
                  ok: !!uploadedDetail?.id,
                  file_id: uploadedDetail?.id,
                  file_name: uploadedDetail?.file_name,
                  thumbnail: uploadedDetail?.thumbnail,
                  error: routed.error,
                }
              : await new Promise((res) => {
                  try {
                    chrome.runtime.sendMessage(
                      {
                        type: "uploadToFlow",
                        base64: b64,
                        name: `clean-ref-${it.fileId}.${/jpe?g/i.test(mime) ? "jpg" : "png"}`,
                        mime,
                      },
                      (r) => {
                        void chrome.runtime.lastError;
                        res(r || null);
                      },
                    );
                  } catch (_) {
                    res(null);
                  }
                });
            if (!up?.ok || !up.file_id)
              throw new Error(up?.error || "upload th\u1EA5t b\u1EA1i");
            window.MediaRegistry?.set?.(
              up.file_id,
              up.thumbnail || "",
              up.file_name || void 0,
            );
            if (up.file_name && window.workflowExecutor?.isRunning === true) {
              if (!(window._workflowRefPreflightCache instanceof Map)) {
                window._workflowRefPreflightCache = new Map();
              }
              window._workflowRefPreflightCache.set(up.file_name, up.file_id);
            }
            it.fileId = up.file_id;
            if (up.thumbnail) it.thumbnail = up.thumbnail;
            if (up.file_name) it.file_name = up.file_name;
          } catch (e) {
            console.warn(
              "[ImagePickerModal] gi\u1EEF nguy\xEAn \u1EA3nh, kh\xF4ng xo\xE1 \u0111\u01B0\u1EE3c:",
              e?.message,
            );
          }
          done++;
          this._setConfirmBusy(true, targets.length, done);
        }
      } finally {
        this._setConfirmBusy(false);
      }
      return selected;
    }
    _askRefWatermark(count) {
      return new Promise((resolve) => {
        const t = (k, d) => window.I18n?.t?.(k) || d;
        const ov = document.createElement("div");
        ov.className = "imgpicker-wmask-overlay";
        const PILL_ITEM =
          "flex:1 1 0;min-width:0;white-space:nowrap;appearance:none;border:none;background:transparent;color:var(--muted-foreground,#8b8b92);padding:7px 10px;font-size:12px;font-weight:500;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:background .15s ease,color .15s ease;";
        ov.innerHTML = `
          <div class="imgpicker-wmask-box">
            <div class="imgpicker-wmask-head">
              <div class="imgpicker-wmask-title">${t("imagePicker.wmAskTitle", "Which version for the reference images?")}</div>
              <button class="imgpicker-wmask-x" id="ipWmX" type="button" aria-label="${t("common.close", "Close")}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div class="imgpicker-wmask-pill" id="ipWmPill">
              <button data-wm="original" style="${PILL_ITEM}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg><span>${t("download.wmOriginal", "Original")}</span></button>
              <button data-wm="clean" style="${PILL_ITEM}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="flex-shrink:0"><g fill="currentColor"><path d="M2 14.25c.41 0 .75.34.75.75v2.5c0 2.07 1.68 3.75 3.75 3.75H9c.41 0 .75.34.75.75s-.34.75-.75.75H6.5c-2.89 0-5.25-2.35-5.25-5.25V15c0-.41.34-.75.75-.75m20 1c.41 0 .75.34.75.75v1.5c0 2.9-2.36 5.25-5.25 5.25H16c-.41 0-.75-.34-.75-.75s.34-.75.75-.75h1.5c2.07 0 3.75-1.68 3.75-3.75V16c0-.41.34-.75.75-.75"></path><path fill-rule="evenodd" d="M14 5.75c2.42 0 3.75 1.33 3.75 3.75v1.75H19c.41 0 .75.34.75.75s-.34.75-.75.75h-1.25v1.75c0 2.42-1.33 3.75-3.75 3.75h-4c-2.42 0-3.75-1.33-3.75-3.75v-1.75H5c-.41 0-.75-.34-.75-.75s.34-.75.75-.75h1.25V9.5c0-2.42 1.33-3.75 3.75-3.75zm-6.25 7v1.75c0 1.58.67 2.25 2.25 2.25h4c1.58 0 2.25-.67 2.25-2.25v-1.75zM10 7.25c-1.58 0-2.25.67-2.25 2.25v1.75h8.5V9.5c0-1.58-.67-2.25-2.25-2.25z" clip-rule="evenodd"></path><path d="M9 1.25c.41 0 .75.34.75.75s-.34.75-.75.75H6.5c-2.07 0-3.75 1.68-3.75 3.75V9c0 .41-.34.75-.75.75s-.75-.34-.75-.75V6.5c0-2.9 2.36-5.25 5.25-5.25zm8.5 0c2.89 0 5.25 2.35 5.25 5.25V9c0 .41-.34.75-.75.75s-.75-.34-.75-.75V6.5c0-2.07-1.68-3.75-3.75-3.75H15c-.41 0-.75-.34-.75-.75s.34-.75.75-.75z"></path></g></svg><span>${t("download.wmClean", "Watermark removed")}</span></button>
            </div>
            <div class="imgpicker-wmask-note">${t("imagePicker.wmAskNote", "The cleaned copy is uploaded to Flow as the reference \u2014 slightly slower.")}</div>
            <button class="imgpicker-wmask-go" id="ipWmGo">${t("imagePicker.wmAskGo", "Use {n} image(s)").replace("{n}", count)}</button>
          </div>`;
        let picked = "clean";
        const paint = () => {
          ov.querySelectorAll("button[data-wm]").forEach((b) => {
            const on = b.dataset.wm === picked;
            b.style.background = on ? "var(--primary,#ccff00)" : "transparent";
            b.style.color = on
              ? "var(--primary-foreground,#1e1e1e)"
              : "var(--muted-foreground,#8b8b92)";
            b.style.fontWeight = on ? "600" : "500";
          });
        };
        let done = false;
        const finish = (v) => {
          if (done) return;
          done = true;
          try {
            ov.remove();
          } catch (_) {}
          resolve(v);
        };
        ov.addEventListener("click", (e) => {
          if (e.target === ov) return finish("cancel");
          if (e.target.closest("#ipWmX")) return finish("cancel");
          if (e.target.closest("#ipWmGo")) return finish(picked);
          const b = e.target.closest("button[data-wm]");
          if (b) {
            picked = b.dataset.wm;
            paint();
          }
        });
        (this.overlay || document.body).appendChild(ov);
        paint();
      });
    }
    _paintCleaningOverlay(busy, total, done) {
      try {
        if (!this.overlay) return;
        let el = this.overlay.querySelector(".imgpicker-cleaning");
        if (!busy) {
          if (el) el.remove();
          return;
        }
        const t = (k, d) => window.I18n?.t?.(k) || d;
        if (!el) {
          el = document.createElement("div");
          el.className = "imgpicker-cleaning";
          el.innerHTML = `
            <div class="imgpicker-cleaning-box">
              <span class="imgpicker-cleaning-spin"></span>
              <div class="imgpicker-cleaning-text">${t("imagePicker.cleaningWatermark", "Removing watermark")}</div>
              <div class="imgpicker-cleaning-count"></div>
              <div class="imgpicker-cleaning-note">${t("imagePicker.cleaningNote", "Keep this open \u2014 images are being processed and uploaded to Flow.")}</div>
            </div>`;
          this.overlay.appendChild(el);
        }
        const c = el.querySelector(".imgpicker-cleaning-count");
        if (c) c.textContent = total ? `${done || 0}/${total}` : "";
      } catch (_) {}
    }
    _setConfirmBusy(busy, total, done) {
      this._cleaning = !!busy;
      this._paintCleaningOverlay(busy, total, done);
      try {
        const btn = this.overlay?.querySelector("#imgpickerConfirmBtn");
        if (!btn) return;
        if (!busy) {
          btn.disabled = false;
          if (btn.dataset.wmLabel) {
            btn.textContent = btn.dataset.wmLabel;
            delete btn.dataset.wmLabel;
          }
          return;
        }
        if (!btn.dataset.wmLabel) btn.dataset.wmLabel = btn.textContent || "";
        btn.disabled = true;
        const t =
          window.I18n?.t?.("imagePicker.cleaningWatermark") ||
          "Removing watermark";
        btn.textContent = total ? `${t} ${done || 0}/${total}` : t;
      } catch (_) {}
    }
    async _loadAlbums() {
      if (this._isLoadingAlbums) return;
      this._isLoadingAlbums = true;
      const loadSessionId = this._loadSessionId;
      const container = this.overlay?.querySelector("#albumContainer");
      if (!container) {
        this._isLoadingAlbums = false;
        return;
      }
      container.innerHTML = `<div class="imgpicker-loading">${window.I18n?.t("imagePicker.loadingAlbums") || "Loading albums..."}</div>`;
      try {
        if (!window.AlbumStore || !window.ImageStore) {
          container.innerHTML = `<div class="imgpicker-empty">${window.I18n?.t("imagePicker.albumNotReady") || "Album not ready"}</div>`;
          this._isLoadingAlbums = false;
          return;
        }
        const albums = await window.AlbumStore.getAlbums();
        if (loadSessionId !== this._loadSessionId) {
          log("_loadAlbums aborted: session changed");
          return;
        }
        if (!albums || albums.length === 0) {
          container.innerHTML = `<div class="imgpicker-empty">${window.I18n?.t("imagePicker.noAlbumsAvailable") || "No albums available"}</div>`;
          const countEl2 = this.overlay?.querySelector("#albumImageCount");
          if (countEl2) countEl2.textContent = "0";
          this._isLoadingAlbums = false;
          return;
        }
        this.albumData = [];
        let totalImages = 0;
        for (const album of albums) {
          if (loadSessionId !== this._loadSessionId) {
            log("_loadAlbums aborted mid-loop: session changed");
            return;
          }
          const images = await window.ImageStore.getAlbumImages(album.id);
          if (!images || images.length === 0) continue;
          const statuses = {};
          for (const img of images) {
            if (
              window.AlbumList &&
              typeof window.AlbumList._checkImageStatus === "function"
            ) {
              statuses[img.id] = await window.AlbumList._checkImageStatus(img);
            } else {
              statuses[img.id] = await this._checkAlbumImageStatus(img);
            }
          }
          this.albumData.push({ album, images, statuses });
          totalImages += images.length;
        }
        if (loadSessionId !== this._loadSessionId) {
          log("_loadAlbums aborted before render: session changed");
          return;
        }
        const countEl = this.overlay?.querySelector("#albumImageCount");
        if (countEl) countEl.textContent = totalImages;
        if (this.albumData.length === 0) {
          container.innerHTML = `<div class="imgpicker-empty">${window.I18n?.t("imagePicker.noImagesInAlbum") || "No images in this album"}</div>`;
          this._isLoadingAlbums = false;
          return;
        }
        this._renderAlbumGrid();
        this._isLoadingAlbums = false;
      } catch (err) {
        log("Load albums error:", err.message);
        container.innerHTML = `<div class="imgpicker-empty">${window.I18n?.t("imagePicker.albumLoadError") || "Failed to load album"}</div>`;
        this._isLoadingAlbums = false;
      }
    }
    _renderAlbumGrid() {
      const container = this.overlay?.querySelector("#albumContainer");
      if (!container) return;
      container.innerHTML = "";
      const ALBUMS_PER_PAGE = 3;
      if (!this._visibleAlbumCount) this._visibleAlbumCount = ALBUMS_PER_PAGE;
      const seenAlbumIds = new Set();
      const dedupedAlbumData = this.albumData.filter(({ album }) => {
        if (seenAlbumIds.has(album.id)) return false;
        seenAlbumIds.add(album.id);
        return true;
      });
      const visibleAlbumData = dedupedAlbumData.filter(
        ({ images, statuses }) => {
          return images.some((img) => statuses[img.id] !== "dead");
        },
      );
      const albumsToShow = visibleAlbumData.slice(0, this._visibleAlbumCount);
      const hasMoreAlbums = visibleAlbumData.length > this._visibleAlbumCount;
      for (const { album, images, statuses } of albumsToShow) {
        const visibleImages = images.filter(
          (img) => statuses[img.id] !== "dead",
        );
        if (visibleImages.length === 0) continue;
        const section = document.createElement("div");
        section.className = "imgpicker-album-section";
        section.dataset.albumId = album.id;
        if (this._collapsedAlbums?.has(album.id)) {
          section.classList.add("collapsed");
        }
        const header = document.createElement("div");
        header.className = "imgpicker-album-header";
        const isCollapsed = this._collapsedAlbums?.has(album.id);
        const chevronSvg = `<div class="imgpicker-album-chevron"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg></div>`;
        const titleHtml = `
          ${chevronSvg}
          <div class="imgpicker-album-info">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            <span class="imgpicker-album-name">${this._escapeHtml(album.name)}</span>
            <span class="imgpicker-album-count">${visibleImages.length}</span>
          </div>
        `;
        const deselectText =
          window.I18n?.t("imagePicker.deselectAll") || "Deselect";
        const selectAllText =
          window.I18n?.t("imagePicker.selectAll") || "Select All";
        const useBtn = this.singleSelect
          ? ""
          : `<button class="imgpicker-album-deselect-btn" data-album-id="${album.id}">${deselectText}</button><button class="imgpicker-album-use-btn" data-album-id="${album.id}">${selectAllText}</button>`;
        header.innerHTML = titleHtml + useBtn;
        section.appendChild(header);
        header.addEventListener("click", (e) => {
          if (
            e.target.closest(".imgpicker-album-use-btn") ||
            e.target.closest(".imgpicker-album-deselect-btn")
          )
            return;
          if (!this._collapsedAlbums) this._collapsedAlbums = new Set();
          if (this._collapsedAlbums.has(album.id)) {
            this._collapsedAlbums.delete(album.id);
            section.classList.remove("collapsed");
          } else {
            this._collapsedAlbums.add(album.id);
            section.classList.add("collapsed");
          }
        });
        const grid = document.createElement("div");
        grid.className = "imgpicker-grid imgpicker-album-grid";
        for (const img of visibleImages) {
          const status = statuses[img.id];
          const isSelected = this.selectedImages.has(img.file_id || img.id);
          const statusClass =
            status === "stale" ? " imgpicker-album-item--stale" : "";
          const thumbSrc = img.thumbnail_url || "";
          const itemEl = document.createElement("div");
          itemEl.className = `imgpicker-item${statusClass}${isSelected ? " selected" : ""}`;
          itemEl.dataset.fileId = img.file_id || img.id;
          itemEl.dataset.source = "album";
          itemEl.dataset.albumImageId = img.id;
          itemEl.dataset.status = status;
          itemEl.innerHTML = `
            ${thumbSrc ? `<img src="${this._escapeHtml(thumbSrc)}" alt="${this._escapeHtml(img.name || "")}" loading="lazy" />` : '<div class="imgpicker-album-placeholder"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></div>'}
            <div class="imgpicker-item-overlay">
              <div class="imgpicker-item-check">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
            </div>
            ${status === "stale" ? `<div class="imgpicker-album-stale-badge" title="${window.I18n?.t("imagePicker.staleImageTitle") || "Image from another project"}"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12 18.55 5.11A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11L2 12"></path><rect x="2" y="12" width="20" height="8" rx="2"></rect><path d="M6 16h.01M10 16h.01"></path></svg></div>` : ""}
            <div class="imgpicker-item-id">${this._escapeHtml((img.name || img.id || "").substring(0, 15))}</div>
          `;
          if (!thumbSrc && window.ImageStore) {
            this._loadAlbumThumbnail(itemEl, img.id);
          }
          grid.appendChild(itemEl);
        }
        section.appendChild(grid);
        container.appendChild(section);
        this._bindGridEvents(grid, "album");
        const deselectBtnEl = header.querySelector(
          ".imgpicker-album-deselect-btn",
        );
        if (deselectBtnEl) {
          deselectBtnEl.addEventListener("click", (e) => {
            e.stopPropagation();
            this._deselectAllAlbumImages(album.id);
          });
        }
        const useBtnEl = header.querySelector(".imgpicker-album-use-btn");
        if (useBtnEl) {
          useBtnEl.addEventListener("click", (e) => {
            e.stopPropagation();
            this._selectAllAlbumImages(album.id);
          });
        }
      }
      if (hasMoreAlbums) {
        const remaining = visibleAlbumData.length - this._visibleAlbumCount;
        const loadMoreEl = document.createElement("div");
        loadMoreEl.className = "imgpicker-album-load-more";
        loadMoreEl.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
          <span>${window.I18n?.t("imagePicker.viewMoreAlbums", { count: remaining }) || `View ${remaining} more album(s)`}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        `;
        loadMoreEl.addEventListener("click", () => {
          this._visibleAlbumCount += ALBUMS_PER_PAGE;
          this._renderAlbumGrid();
        });
        container.appendChild(loadMoreEl);
      }
    }
    async _loadAlbumThumbnail(itemEl, imageId) {
      try {
        const blobUrl = await window.ImageStore.getThumbnail(imageId);
        if (blobUrl && itemEl.isConnected) {
          const placeholder = itemEl.querySelector(
            ".imgpicker-album-placeholder",
          );
          if (placeholder) {
            const img = document.createElement("img");
            img.src = blobUrl;
            img.alt = "";
            img.loading = "lazy";
            placeholder.replaceWith(img);
          }
          this._albumBlobUrls.push(blobUrl);
        }
      } catch (e) {
        log("Load thumbnail failed:", imageId, e.message);
      }
    }
    _selectAllAlbumImages(albumId) {
      const albumEntry = this.albumData.find((a) => a.album.id === albumId);
      if (!albumEntry) return;
      for (const img of albumEntry.images) {
        const status = albumEntry.statuses[img.id];
        if (status === "dead") continue;
        const key = img.file_id || img.id;
        if (this.selectedImages.has(key)) continue;
        let thumbSrc = img.thumbnail_url || null;
        if (!thumbSrc) {
          const itemEl = this.overlay?.querySelector(
            `.imgpicker-item[data-album-image-id="${img.id}"]`,
          );
          const imgEl = itemEl?.querySelector("img");
          if (imgEl && imgEl.src) thumbSrc = imgEl.src;
        }
        this.selectedImages.set(key, {
          fileId: key,
          thumbnail: thumbSrc,
          source: "album",
          file_name: img.file_name || null,
          thumbnail_url: img.thumbnail_url || null,
          blob_key: img.blob_key || null,
          album_image_id: img.id,
          name: img.name || null,
          _status: status,
        });
      }
      this._renderAlbumGrid();
      this.updateSelectedCount();
    }
    _deselectAllAlbumImages(albumId) {
      const albumEntry = this.albumData.find((a) => a.album.id === albumId);
      if (!albumEntry) return;
      for (const img of albumEntry.images) {
        const key = img.file_id || img.id;
        this.selectedImages.delete(key);
      }
      this._renderAlbumGrid();
      this.updateSelectedCount();
    }
    async _checkAlbumImageStatus(image) {
      try {
        if (!image) return "dead";
        if (window.MessageBridge && (image.file_id || image.file_name)) {
          if (
            window.MessageBridge.lookupFlowMediaCatalog &&
            (image.file_id || image.file_name)
          ) {
            try {
              const identities = [image.file_id, image.file_name].filter(
                Boolean,
              );
              const catalog =
                await window.MessageBridge.lookupFlowMediaCatalog(identities);
              if (
                catalog?.supported === true &&
                identities.some((id) => catalog.known?.[id])
              )
                return "alive";
            } catch (e) {}
          }
          if (image.file_id) {
            try {
              const tileCheck = await window.MessageBridge.checkTilesExist([
                image.file_id,
              ]);
              if (tileCheck?.existing?.includes(image.file_id)) return "alive";
            } catch (e) {}
          }
          if (image.file_name) {
            try {
              const fnCheck = await window.MessageBridge.checkFilesExist([
                image.file_name,
              ]);
              if (fnCheck?.existing?.includes(image.file_name)) return "alive";
            } catch (e) {}
          }
        }
        if (image.thumbnail_url && image.thumbnail_url.startsWith("http"))
          return "stale";
        if (image.blob_key && window.ImageStore) {
          try {
            const hasBlob =
              typeof window.ImageStore.hasBlob === "function"
                ? await window.ImageStore.hasBlob(image.id)
                : !!(await window.ImageStore.getFullBlob(image.id));
            if (hasBlob) return "stale";
          } catch (e) {}
        }
        return "dead";
      } catch (e) {
        log("_checkAlbumImageStatus error:", e.message);
        return "alive";
      }
    }
    static async prepareAlbumImageForRef(imgData) {
      const fileId = imgData.fileId;
      const status = imgData._status || "stale";
      if (status === "alive" && fileId) {
        return {
          key: fileId,
          file_name: imgData.file_name,
          thumbnail_url: imgData.thumbnail_url,
        };
      }
      let file = null;
      try {
        if (window.ImageStore && imgData.album_image_id) {
          const blob = await window.ImageStore.getFullBlob(
            imgData.album_image_id,
          );
          if (blob) {
            file = new File(
              [blob],
              `album_${(imgData.album_image_id || "").substring(0, 8)}.png`,
              { type: blob.type || "image/png" },
            );
          }
        }
        if (
          !file &&
          imgData.thumbnail_url &&
          imgData.thumbnail_url.startsWith("http")
        ) {
          const fetchUrl =
            imgData.thumbnail_url.includes("lh3.") ||
            imgData.thumbnail_url.includes("googleusercontent.com")
              ? imgData.thumbnail_url.split("=")[0]
              : imgData.thumbnail_url;
          const resp = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
              { action: "fetchBlob", url: fetchUrl, expectImage: true },
              (r) => {
                if (chrome.runtime.lastError)
                  return reject(new Error(chrome.runtime.lastError.message));
                resolve(r);
              },
            );
          });
          if (resp?.success && resp.base64) {
            let bytes = null;
            if (typeof Uint8Array.fromBase64 === "function") {
              try {
                bytes = Uint8Array.fromBase64(resp.base64);
              } catch (_) {}
            }
            if (!bytes) {
              const binary = atob(resp.base64);
              bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++)
                bytes[i] = binary.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: "image/png" });
            file = new File(
              [blob],
              `album_${(imgData.album_image_id || "").substring(0, 8)}.png`,
              { type: "image/png" },
            );
          }
        }
        if (!file && window.ImageStore && imgData.album_image_id) {
          const thumbUrl = await window.ImageStore.getThumbnail(
            imgData.album_image_id,
          );
          if (
            thumbUrl &&
            typeof thumbUrl === "string" &&
            thumbUrl.startsWith("blob:")
          ) {
            try {
              const thumbResp = await fetch(thumbUrl);
              const thumbBlob = await thumbResp.blob();
              if (thumbBlob && thumbBlob.size > 0) {
                file = new File(
                  [thumbBlob],
                  `album_${(imgData.album_image_id || "").substring(0, 8)}.png`,
                  { type: thumbBlob.type || "image/png" },
                );
              }
            } catch (e) {}
          }
        }
      } catch (err) {
        log("prepareAlbumImageForRef blob fetch error:", err.message);
      }
      if (!file) {
        if (fileId) {
          return {
            key: fileId,
            file_name: imgData.file_name,
            thumbnail_url: imgData.thumbnail_url,
          };
        }
        log(
          "prepareAlbumImageForRef: no file_id and no blob for",
          imgData.album_image_id,
        );
        return null;
      }
      const uploadKey =
        "upload_album_" +
        Date.now() +
        "_" +
        Math.random().toString(36).slice(2, 8);
      const thumbForPending =
        imgData.thumbnail || imgData.thumbnail_url || null;
      if (!window.pendingUploadFiles) window.pendingUploadFiles = new Map();
      window.pendingUploadFiles.set(uploadKey, {
        file,
        thumbnail: thumbForPending,
      });
      const thumbForCache = imgData.thumbnail || imgData.thumbnail_url;
      if (window.GenTab?.thumbnailCache && thumbForCache) {
        window.GenTab.thumbnailCache[uploadKey] = thumbForCache;
      }
      if (window.GenTab?.fileNameCache && imgData.file_name) {
        window.GenTab.fileNameCache[uploadKey] = imgData.file_name;
      }
      return {
        key: uploadKey,
        file_name: imgData.file_name,
        thumbnail_url: imgData.thumbnail_url,
      };
    }
    _escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text || "";
      return div.innerHTML;
    }
  };
  __publicField(_ImagePickerModal, "_flowThumbnailProxyCache", new Map());
  let ImagePickerModal = _ImagePickerModal;
  window.ImagePickerModal = ImagePickerModal;
  window.imagePickerModal = new ImagePickerModal();
})();
