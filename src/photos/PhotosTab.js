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
class PhotosTab {
  static async init() {
    if (this._initialized) return;
    this._initialized = true;
    this._bindSubtabs();
    this._bindAlbumTab();
    this._bindFlowImagesTab();
    this._bindSearchTab();
    this._createImagePreviewModal();
    await this._activateSubtab("photos-album");
  }
  static _bindSubtabs() {
    const subtabs = document.querySelectorAll(".photos-subtab");
    subtabs.forEach((btn) => {
      btn.addEventListener("click", async () => {
        const subtabId = btn.dataset.subtab;
        await this._activateSubtab(subtabId);
      });
    });
  }
  static async _activateSubtab(subtabId) {
    this._currentSubtab = subtabId;
    document.querySelectorAll(".photos-subtab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.subtab === subtabId);
    });
    document.querySelectorAll(".photos-subtab-pane").forEach((pane) => {
      pane.classList.toggle("active", pane.id === subtabId);
    });
    switch (subtabId) {
      case "photos-album":
        await this._initAlbumSubtab();
        break;
      case "photos-flow-images":
        await this._activateFlowTab();
        await this._initFlowImagesSubtab();
        break;
      case "photos-search":
        break;
    }
  }
  static async _activateFlowTab() {
    try {
      const patterns =
        window.ProviderConfigManager?.getTabQueryPatterns?.("flow") || [];
      const tabs = await chrome.tabs.query({ url: patterns });
      const target =
        window.MessageBridge?._selectFlowCandidate?.(tabs) || tabs[0] || null;
      if (target) {
        await chrome.tabs.update(target.id, { active: true });
        await chrome.windows.update(target.windowId, { focused: true });
        await window.MessageBridge?.setTargetTabId?.(target.id);
      }
    } catch (err) {
      console.log("[PhotosTab] Could not activate Flow tab:", err.message);
    }
  }
  static _bindAlbumTab() {}
  static async _initAlbumSubtab() {
    if (window.AlbumList) {
      const container = document.getElementById("albumListContainer");
      if (container && !container.__albumList) {
        container.__albumList = new AlbumList("albumListContainer");
        await container.__albumList.init();
      } else if (container?.__albumList) {
        container.__albumList.refresh();
      }
    }
  }
  static _bindFlowImagesTab() {
    const refreshBtn = document.getElementById("refreshFlowImagesBtn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => {
        this._flowImagesLoaded = false;
        this._flowImages = [];
        this._flowImagesPage = 0;
        this._initFlowImagesSubtab();
      });
    }
    const grid = document.getElementById("photosFlowImagesGrid");
    if (grid) {
      grid.addEventListener("scroll", () => {
        if (grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 100) {
          this._loadMoreFlowImages();
        }
      });
    }
  }
  static async _initFlowImagesSubtab() {
    const grid = document.getElementById("photosFlowImagesGrid");
    if (!grid) return;
    if (this._flowImagesLoaded && this._flowImages.length > 0) {
      return;
    }
    const skeletonItems = [];
    for (let i = 0; i < 12; i++) {
      skeletonItems.push(
        '<div class="photos-flow-images-item skeleton-base" style="aspect-ratio: 1; border-radius: 4px;"></div>',
      );
    }
    grid.innerHTML = skeletonItems.join("");
    try {
      this._flowImages = await this._scanFlowImages(false);
      this._flowImagesLoaded = true;
      this._flowImagesPage = 0;
      this._renderFlowImages();
    } catch (err) {
      console.error("[PhotosTab] Flow Images scan error:", err);
      grid.innerHTML = `
        <div class="photos-flow-images-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>${window.I18n?.t("photos.loadError") || "Failed to load images. Please try again."}</span>
        </div>
      `;
    }
  }
  static async _scanFlowImages(deep = false) {
    try {
      if (window.MessageBridge) {
        const result = await window.MessageBridge.scanFlowImages(deep);
        const images = result?.images || [];
        return images.map((img) => ({
          id: img.fileId,
          thumbnail: img.thumbnail,
          src: img.thumbnail,
          type: img.type || "image",
          video_url: img.video_url || null,
          source_thumbnail: img.source_thumbnail || img.thumbnail || null,
          fileName: img.file_name || null,
          flowFileId: img.file_id || null,
          persistentMediaId: img.persistent_media_id || img.file_name || null,
          mediaUuid:
            img.media_uuid ||
            this._extractMediaUuid(img.file_name) ||
            this._extractMediaUuid(img.fileId) ||
            this._extractMediaUuid(img.video_url) ||
            this._extractMediaUuid(img.thumbnail) ||
            null,
          identityDurability: img.identity_durability || null,
          projectId:
            img.project_id || result?.projectId || result?.project_id || null,
          providerData: img.provider_data || null,
        }));
      }
    } catch (err) {
      console.error("[PhotosTab] MessageBridge scan failed:", err);
    }
    throw new Error("FLOW_TARGET_UNAVAILABLE");
  }
  static _renderFlowImages() {
    const grid = document.getElementById("photosFlowImagesGrid");
    if (!grid) return;
    if (this._flowImages.length === 0) {
      grid.innerHTML = `
        <div class="photos-flow-images-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          <span>${window.I18n?.t("photos.noPhotos") || "No images in Flow yet"}</span>
        </div>
      `;
      return;
    }
    grid.innerHTML = "";
    const endIndex = Math.min(
      (this._flowImagesPage + 1) * this._flowImagesPageSize,
      this._flowImages.length,
    );
    for (let i = 0; i < endIndex; i++) {
      grid.appendChild(this._createFlowImageItem(this._flowImages[i], i));
    }
    this._flowImagesPage = Math.floor(endIndex / this._flowImagesPageSize);
    this._updateShowMoreButton(grid);
  }
  static _updateShowMoreButton(grid) {
    grid.querySelector(".photos-flow-images-show-more")?.remove();
    const currentCount = grid.querySelectorAll(
      ".photos-flow-images-item",
    ).length;
    const totalCount = this._flowImages.length;
    if (currentCount < totalCount) {
      const showMoreBtn = document.createElement("button");
      showMoreBtn.className = "photos-flow-images-show-more";
      showMoreBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
        ${window.I18n?.t("imagePicker.viewMore", { count: totalCount - currentCount }) || `View more (${totalCount - currentCount} images)`}
      `;
      showMoreBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        this._loadMoreFlowImages();
        this._updateShowMoreButton(grid);
      });
      grid.appendChild(showMoreBtn);
    }
  }
  static _loadMoreFlowImages() {
    const grid = document.getElementById("photosFlowImagesGrid");
    if (!grid || !this._flowImagesLoaded) return;
    const startIndex = this._flowImagesPage * this._flowImagesPageSize;
    if (startIndex >= this._flowImages.length) return;
    const endIndex = Math.min(
      startIndex + this._flowImagesPageSize,
      this._flowImages.length,
    );
    for (let i = startIndex; i < endIndex; i++) {
      grid.appendChild(this._createFlowImageItem(this._flowImages[i], i));
    }
    this._flowImagesPage++;
  }
  static _createFlowImageItem(tile, index) {
    const item = document.createElement("div");
    item.className = "photos-flow-images-item";
    item.dataset.tileId = tile.id;
    item.dataset.index = index;
    const isVideo = tile.type === "video";
    const thumbSrc = tile.thumbnail || tile.src || "";
    const videoUrl = tile.video_url || "";
    const mediaEl = document.createElement("img");
    mediaEl.alt = isVideo ? "Flow video thumbnail" : "Flow image";
    mediaEl.loading = "lazy";
    item.classList.add("photos-flow-images-item--thumb-loading");
    if (isVideo) item.classList.add("photos-flow-images-item--video");
    const loading = document.createElement("div");
    loading.className = "photos-flow-images-thumb-loading";
    loading.setAttribute("aria-hidden", "true");
    loading.innerHTML =
      '<span class="photos-flow-images-thumb-spinner"></span>';
    item.appendChild(loading);
    mediaEl.addEventListener(
      "load",
      () => {
        item.classList.remove("photos-flow-images-item--thumb-loading");
        loading.remove();
      },
      { once: true },
    );
    const onThumbError = () => {
      item.classList.remove("photos-flow-images-item--thumb-loading");
      loading.remove();
      mediaEl.style.display = "none";
      const placeholder = document.createElement("div");
      placeholder.className = isVideo
        ? "photos-flow-images-video-placeholder"
        : "photos-flow-images-thumb-unavailable";
      placeholder.title = window.I18n?.t("albums.imageError") || "Image error";
      placeholder.innerHTML = isVideo
        ? '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>'
        : '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m3 17 5-5 4 4 3-3 6 6"/><path d="M8 8h.01"/></svg>';
      item.insertBefore(placeholder, item.firstChild);
    };
    mediaEl.addEventListener("error", onThumbError, { once: true });
    const actions = document.createElement("div");
    actions.className = "photos-flow-images-item-actions";
    let actionsHtml = "";
    if (!isVideo) {
      actionsHtml += `
        <button class="photos-flow-images-action" data-action="use" title="${window.I18n?.t("photos.use") || "Use"}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 11 12 14 22 4"/>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
        </button>`;
    }
    actionsHtml += `
      <button class="photos-flow-images-action" data-action="download" title="${window.I18n?.t("photos.download") || "Download"}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </button>`;
    actions.innerHTML = actionsHtml;
    if (isVideo) {
      const playOverlay = document.createElement("div");
      playOverlay.className = "photos-flow-images-play-overlay";
      playOverlay.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
      item.appendChild(playOverlay);
    }
    actions.querySelectorAll(".photos-flow-images-action").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === "use") {
          this._useFlowImage(tile);
        } else if (action === "download") {
          this._downloadFlowImage(tile, index);
        }
      });
    });
    item.addEventListener("click", () => {
      this._openImagePreview(index);
    });
    item.style.cursor = "pointer";
    item.appendChild(mediaEl);
    item.appendChild(actions);
    if (thumbSrc) this._setProxiedThumbnail(mediaEl, thumbSrc, tile);
    else onThumbError();
    return item;
  }
  static _useFlowImage(tile) {
    if (!tile.id) return;
    if (window.GenTab) {
      if (!window.GenTab.thumbnailCache) {
        window.GenTab.thumbnailCache = {};
      }
      if (tile.thumbnail) {
        window.GenTab.thumbnailCache[tile.id] = tile.thumbnail;
      }
      if (tile.fileName) {
        window.GenTab.fileNameCache[tile.id] = tile.fileName;
      }
      if (window.GenTab.fileIdsInput) {
        const current = window.GenTab.fileIdsInput.value
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (!current.includes(tile.id)) {
          current.push(tile.id);
          window.GenTab.fileIdsInput.value = current.join(", ");
          window.GenTab.fileIdsInput.dispatchEvent(
            new Event("input", { bubbles: true }),
          );
        }
      }
      window.GenTab.renderFileIdThumbnails();
      window.GenTab.saveState();
      const genTabBtn = document.querySelector(
        '.tobyflow-tab[data-tab="tab-gen"]',
      );
      if (genTabBtn) genTabBtn.click();
      console.log("[PhotosTab] Added image to ref:", tile.id);
    }
  }
  static async _downloadFlowImage(tile, index) {
    if (!tile.id) {
      console.warn("[PhotosTab] No tile ID to download");
      return;
    }
    if (window.DownloadHelper) {
      const fileName =
        tile.fileName ||
        tile.persistentMediaId ||
        tile.persistent_media_id ||
        null;
      DownloadHelper.showModal({
        tileId: tile.id,
        fileName,
        flowFileId: tile.flowFileId || null,
        promptText: window._currentProjectName || "flow",
        index: typeof index === "number" ? index + 1 : void 0,
        mediaType: tile.type === "video" ? "video" : "image",
        apiOnly: true,
        apiDownload: ({
          resolution,
          watermarkMode,
          plannedFilename,
          abortFn,
          signal,
        }) =>
          DownloadHelper.downloadFlowGalleryMedia({
            tile,
            index: typeof index === "number" ? index + 1 : void 0,
            promptText: window._currentProjectName || "flow",
            resolution,
            watermarkMode,
            plannedFilename,
            abortFn,
            signal,
          }),
      });
    } else {
      console.warn("[PhotosTab] DownloadHelper not available");
    }
  }
  static _createImagePreviewModal() {
    if (document.getElementById("flowImagePreviewModal")) return;
    const modal = document.createElement("div");
    modal.id = "flowImagePreviewModal";
    modal.className = "flow-image-preview-modal";
    modal.innerHTML = `
      <div class="flow-image-preview-backdrop"></div>
      <div class="flow-image-preview-container">
        <button class="flow-image-preview-close" title="${window.I18n?.t("common.close") || "Close"}">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        <button class="flow-image-preview-nav flow-image-preview-prev" title="${window.I18n?.t("common.previous") || "Previous"}">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <div class="flow-image-preview-content"></div>
        <button class="flow-image-preview-nav flow-image-preview-next" title="${window.I18n?.t("common.next") || "Sau"}">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
        <div class="flow-image-preview-footer">
          <span class="flow-image-preview-counter"></span>
          <div class="flow-image-preview-actions">
            <button class="flow-image-preview-action" data-action="use" title="${window.I18n?.t("photos.use") || "Use"}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 11 12 14 22 4"/>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
              <span>${window.I18n?.t("photos.use") || "Use"}</span>
            </button>
            <button class="flow-image-preview-action" data-action="download" title="${window.I18n?.t("photos.download") || "Download"}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              <span>${window.I18n?.t("photos.download") || "Download"}</span>
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    this._bindImagePreviewEvents(modal);
  }
  static _bindImagePreviewEvents(modal) {
    const backdrop = modal.querySelector(".flow-image-preview-backdrop");
    const container = modal.querySelector(".flow-image-preview-container");
    const closeBtn = modal.querySelector(".flow-image-preview-close");
    const prevBtn = modal.querySelector(".flow-image-preview-prev");
    const nextBtn = modal.querySelector(".flow-image-preview-next");
    const useBtn = modal.querySelector(
      '.flow-image-preview-action[data-action="use"]',
    );
    const downloadBtn = modal.querySelector(
      '.flow-image-preview-action[data-action="download"]',
    );
    backdrop.addEventListener("click", () => this._closeImagePreview());
    container.addEventListener("click", (e) => {
      if (e.target === container) this._closeImagePreview();
    });
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._closeImagePreview();
    });
    prevBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._navigatePreview(-1);
    });
    nextBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._navigatePreview(1);
    });
    useBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const tile = this._flowImages[this._currentPreviewIndex];
      if (tile) this._useFlowImage(tile);
      this._closeImagePreview();
    });
    downloadBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const tile = this._flowImages[this._currentPreviewIndex];
      if (tile) this._downloadFlowImage(tile, this._currentPreviewIndex);
    });
    document.addEventListener("keydown", (e) => {
      if (!modal.classList.contains("active")) return;
      if (e.key === "Escape") this._closeImagePreview();
      if (e.key === "ArrowLeft") this._navigatePreview(-1);
      if (e.key === "ArrowRight") this._navigatePreview(1);
    });
  }
  static _openImagePreview(index) {
    const modal = document.getElementById("flowImagePreviewModal");
    if (!modal) return;
    if (index < 0 || index >= this._flowImages.length) return;
    this._currentPreviewIndex = index;
    this._updatePreviewContent();
    modal.classList.add("active");
    document.body.style.overflow = "hidden";
  }
  static _closeImagePreview() {
    const modal = document.getElementById("flowImagePreviewModal");
    if (modal) {
      const video = modal.querySelector("video");
      if (video) {
        try {
          video.pause();
          video.src = "";
        } catch (_) {}
      }
      this._revokePreviewObjectUrl();
      modal.classList.remove("active");
      document.body.style.overflow = "";
    }
    this._currentPreviewIndex = -1;
  }
  static _navigatePreview(direction) {
    const total = this._flowImages.length;
    if (total === 0) return;
    let newIdx = this._currentPreviewIndex + direction;
    if (newIdx < 0) newIdx = total - 1;
    if (newIdx >= total) newIdx = 0;
    this._currentPreviewIndex = newIdx;
    this._updatePreviewContent();
  }
  static async _updatePreviewContent() {
    const modal = document.getElementById("flowImagePreviewModal");
    if (!modal || this._currentPreviewIndex < 0) return;
    const tile = this._flowImages[this._currentPreviewIndex];
    if (!tile) return;
    const renderToken = ++this._previewRenderToken;
    const contentEl = modal.querySelector(".flow-image-preview-content");
    const counter = modal.querySelector(".flow-image-preview-counter");
    const oldVideo = contentEl.querySelector("video");
    if (oldVideo) {
      try {
        oldVideo.pause();
        oldVideo.src = "";
      } catch (_) {}
    }
    this._revokePreviewObjectUrl();
    contentEl.innerHTML = "";
    const isVideo = tile.type === "video";
    let videoUrl = tile.video_url || "";
    if (isVideo) {
      videoUrl = await this._normalizeVideoPlaybackUrl(
        videoUrl || tile.source_thumbnail || tile.thumbnail || "",
      );
      if (renderToken !== this._previewRenderToken) return;
      if (videoUrl) tile.video_url = videoUrl;
      const video = document.createElement("video");
      video.className = "flow-image-preview-img";
      video.controls = true;
      video.autoplay = false;
      video.playsInline = true;
      video.muted = false;
      contentEl.appendChild(video);
      if (tile.thumbnail) {
        const poster = await this._getDisplayThumbnail(tile.thumbnail);
        if (renderToken !== this._previewRenderToken) return;
        video.poster = poster || tile.thumbnail;
      }
      try {
        if (!videoUrl && window.MessageBridge && tile.id) {
          const resolved = await window.MessageBridge.resolveVideoPlaybackUrl(
            tile.id,
            {
              fileName: tile.mediaUuid || tile.fileName || "",
              sourceUrl: tile.source_thumbnail || tile.thumbnail || "",
              persistentMediaId: tile.persistentMediaId || tile.fileName || "",
              allowVirtualScan: false,
              activationTimeoutMs: 0,
            },
          );
          if (resolved?.success && resolved.video_url) {
            videoUrl = await this._normalizeVideoPlaybackUrl(
              resolved.video_url,
            );
            tile.video_url = videoUrl;
          }
        }
        let playback = "";
        try {
          playback = await this._createVideoPlaybackBlobUrl(videoUrl);
        } catch (firstError) {
          const resolved =
            await window.MessageBridge?.resolveVideoPlaybackUrl?.(tile.id, {
              fileName: tile.mediaUuid || tile.fileName || "",
              sourceUrl: tile.source_thumbnail || tile.thumbnail || "",
              persistentMediaId: tile.persistentMediaId || tile.mediaUuid || "",
              forceDomResolve: false,
              allowVirtualScan: false,
              activationTimeoutMs: 0,
            });
          if (
            !resolved?.success ||
            !resolved.video_url ||
            resolved.video_url === videoUrl
          )
            throw firstError;
          videoUrl = resolved.video_url;
          videoUrl = await this._normalizeVideoPlaybackUrl(videoUrl);
          tile.video_url = videoUrl;
          if (resolved.persistent_media_id)
            tile.persistentMediaId = resolved.persistent_media_id;
          playback = await this._createVideoPlaybackBlobUrl(videoUrl);
        }
        if (renderToken !== this._previewRenderToken || !video.isConnected) {
          if (playback) URL.revokeObjectURL(playback);
          return;
        }
        this._previewObjectUrl = playback;
        video.src = playback;
        await video.play().catch(() => {});
      } catch (error) {
        console.warn(
          "[PhotosTab] Video preview unavailable:",
          error?.message || error,
        );
      }
    } else {
      const img = document.createElement("img");
      img.alt = "";
      img.className = "flow-image-preview-img";
      contentEl.appendChild(img);
      this._setProxiedThumbnail(img, tile.thumbnail || tile.src || "", tile);
    }
    counter.textContent = `${this._currentPreviewIndex + 1} / ${this._flowImages.length}`;
    const prevBtn = modal.querySelector(".flow-image-preview-prev");
    const nextBtn = modal.querySelector(".flow-image-preview-next");
    prevBtn.style.display = this._flowImages.length > 1 ? "" : "none";
    nextBtn.style.display = this._flowImages.length > 1 ? "" : "none";
    const useBtn = modal.querySelector(
      '.flow-image-preview-action[data-action="use"]',
    );
    if (useBtn) useBtn.style.display = isVideo ? "none" : "";
  }
  static _needsFlowThumbnailProxy(url) {
    try {
      const parsed = new URL(url);
      return (
        ((parsed.hostname === "flow.google.com" ||
          parsed.hostname === "labs.google") &&
          parsed.pathname.startsWith("/asb/")) ||
        (parsed.hostname === "flow-content.google" &&
          parsed.pathname.startsWith("/image/"))
      );
    } catch (_) {
      return false;
    }
  }
  static _extractMediaUuid(value) {
    const match = String(value || "").match(
      /(?:^|\/(?:image|video)\/)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:$|[/?])/i,
    );
    return match?.[1] || null;
  }
  static async _normalizeVideoPlaybackUrl(value) {
    if (!value) return "";
    let parsed;
    try {
      parsed = new URL(value);
    } catch (_) {
      return value;
    }
    if (
      parsed.origin !== "https://flow.google.com" ||
      !parsed.pathname.startsWith("/asb/")
    ) {
      return value;
    }
    try {
      if (!this._flowVideoTransformConfigPromise) {
        this._flowVideoTransformConfigPromise =
          window.ProviderConfigManager?.getForPage?.(
            "flow",
            "tile_video",
            "https://flow.google.com/",
          ) || Promise.resolve(null);
      }
      const config = await this._flowVideoTransformConfigPromise;
      const suffix =
        typeof config?.playback_url_suffix === "string"
          ? config.playback_url_suffix
          : "";
      const pattern =
        typeof config?.poster_transform_pattern === "string"
          ? config.poster_transform_pattern
          : "";
      if (!suffix) return value;
      if (parsed.pathname.endsWith(suffix)) return parsed.href;
      let pathname = parsed.pathname;
      if (pattern && pattern.length <= 120)
        pathname = pathname.replace(new RegExp(pattern, "i"), "");
      parsed.pathname = pathname + suffix;
      return parsed.href;
    } catch (error) {
      this._flowVideoTransformConfigPromise = null;
      console.warn(
        "[PhotosTab] Flow video transform unavailable:",
        error?.message || error,
      );
      return value;
    }
  }
  static _getDisplayThumbnail(sourceUrl) {
    if (!sourceUrl || !this._needsFlowThumbnailProxy(sourceUrl))
      return Promise.resolve(sourceUrl || "");
    let pending = this._flowThumbnailProxyCache.get(sourceUrl);
    if (!pending) {
      pending = new Promise((resolve) => {
        const timer = setTimeout(() => resolve(""), 2e4);
        chrome.runtime.sendMessage(
          { action: "fetchImageAsBase64", url: sourceUrl },
          (result) => {
            clearTimeout(timer);
            if (chrome.runtime.lastError || !result?.success || !result.base64)
              return resolve("");
            resolve(
              `data:${result.contentType || "image/jpeg"};base64,${result.base64}`,
            );
          },
        );
      });
      this._flowThumbnailProxyCache.set(sourceUrl, pending);
      if (this._flowThumbnailProxyCache.size > 100) {
        this._flowThumbnailProxyCache.delete(
          this._flowThumbnailProxyCache.keys().next().value,
        );
      }
    }
    return pending;
  }
  static async _resolveFlowImageByUuid(tile) {
    const uuid = tile?.mediaUuid;
    if (
      tile?.type === "video" ||
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(
        String(uuid || ""),
      ) ||
      !window.FlowApiFacade?.resolveMedia
    )
      return "";
    try {
      const selection = await window.FlowApiSessionCoordinator?.check?.({
        surface: "workflow",
        mediaType: "image",
        passive: true,
        ...(tile.projectId && { projectId: tile.projectId }),
      });
      if (
        selection?.ready !== true ||
        selection.driver !== "v2" ||
        !selection.projectId ||
        (tile.projectId && tile.projectId !== selection.projectId)
      )
        return "";
      const config =
        await window.ProviderConfigManager?.fetchFlowApiV2Configs?.();
      if (!config) return "";
      const resolved = await window.FlowApiFacade.resolveMedia({
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
      return /^https:\/\//i.test(resolved?.url || "") ? resolved.url : "";
    } catch (error) {
      console.warn(
        "[PhotosTab] UUID image lookup failed:",
        error?.message || error,
      );
      return "";
    }
  }
  static _setProxiedThumbnail(img, sourceUrl, tile = null) {
    if (!img) return;
    if (!sourceUrl || !this._needsFlowThumbnailProxy(sourceUrl)) {
      img.src = sourceUrl || "";
      return;
    }
    img.removeAttribute("src");
    this._getDisplayThumbnail(sourceUrl).then(async (proxied) => {
      const dataUrl =
        proxied || (tile ? await this._resolveFlowImageByUuid(tile) : "");
      if (!dataUrl || !img.isConnected) {
        if (!dataUrl) this._flowThumbnailProxyCache.delete(sourceUrl);
        if (!dataUrl && img.isConnected) img.dispatchEvent(new Event("error"));
        return;
      }
      if (tile) {
        tile.source_thumbnail = tile.source_thumbnail || sourceUrl;
        tile.thumbnail = dataUrl;
        tile.src = dataUrl;
      }
      img.src = dataUrl;
    });
  }
  static async _createVideoPlaybackBlobUrl(url) {
    if (!url || !/^https:\/\//i.test(url))
      throw new Error("VIDEO_URL_NOT_READY");
    const requestBytes = (action, extra = {}) =>
      new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action, url, ...extra }, (result) => {
          if (chrome.runtime.lastError)
            return reject(new Error(chrome.runtime.lastError.message));
          resolve(result);
        });
      });
    let response = await requestBytes("fetchBlob", { expectImage: false });
    const isFlowAsb = /^https:\/\/flow\.google\.com\/asb\//i.test(url);
    if (!response?.success && isFlowAsb) {
      console.log("[PhotosTab] Video proxy retry in Flow tab", {
        error: response?.error || "VIDEO_PROXY_EMPTY",
      });
      response = await requestBytes("fetchImageAsBase64");
    }
    if (!response?.success || !response.base64) {
      if (isFlowAsb) {
        console.log("[PhotosTab] Video preview using direct ASB stream", {
          error: response?.error || "VIDEO_PROXY_EMPTY",
        });
        return url;
      }
      throw new Error(response?.error || "VIDEO_PROXY_EMPTY");
    }
    if (!String(response.contentType || "").startsWith("video/")) {
      throw new Error(
        `VIDEO_PROXY_INVALID_TYPE:${response.contentType || "unknown"}`,
      );
    }
    const binary = atob(response.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const playbackUrl = URL.createObjectURL(
      new Blob([bytes], { type: response.contentType }),
    );
    console.log("[PhotosTab] Video preview bytes ready", {
      contentType: response.contentType,
      size: response.size || bytes.length,
    });
    return playbackUrl;
  }
  static _revokePreviewObjectUrl() {
    if (!this._previewObjectUrl) return;
    try {
      URL.revokeObjectURL(this._previewObjectUrl);
    } catch (_) {}
    this._previewObjectUrl = "";
  }
  static _bindSearchTab() {
    const channelBtns = document.querySelectorAll(".photos-channel-btn");
    channelBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const channel = btn.dataset.channel;
        this._searchChannel(channel);
      });
    });
    const searchInput = document.getElementById("photosSearchInput");
    if (searchInput) {
      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          this._searchChannel("pinterest");
        }
      });
    }
  }
  static async _searchChannel(channel) {
    const searchInput = document.getElementById("photosSearchInput");
    const keyword = searchInput?.value?.trim();
    if (!keyword) {
      if (window.customDialog) {
        window.customDialog.alert(
          window.I18n?.t("photos.enterSearchKeyword") ||
            "Please enter a search keyword.",
          { type: "warning" },
        );
      }
      searchInput?.focus();
      return;
    }
    const baseUrl = this.SEARCH_CHANNELS[channel];
    if (!baseUrl) return;
    const searchUrl = baseUrl + encodeURIComponent(keyword);
    try {
      const currentWindow = await chrome.windows.getCurrent();
      const domain = new URL(baseUrl).hostname.replace("www.", "");
      const tabs = await chrome.tabs.query({
        url: `*://*.${domain}/*`,
        windowId: currentWindow.id,
      });
      if (tabs.length > 0) {
        chrome.tabs.update(tabs[0].id, { url: searchUrl, active: true });
        return;
      }
    } catch (e) {
      console.warn("[PhotosTab] Tab reuse check failed:", e.message);
    }
    chrome.tabs.create({ url: searchUrl });
  }
}
__publicField(PhotosTab, "_initialized", false);
__publicField(PhotosTab, "_currentSubtab", "photos-album");
__publicField(PhotosTab, "_flowImages", []);
__publicField(PhotosTab, "_flowImagesLoaded", false);
__publicField(PhotosTab, "_flowImagesPage", 0);
__publicField(PhotosTab, "_flowImagesPageSize", 20);
__publicField(PhotosTab, "_currentPreviewIndex", -1);
__publicField(PhotosTab, "_flowThumbnailProxyCache", new Map());
__publicField(PhotosTab, "_previewObjectUrl", "");
__publicField(PhotosTab, "_previewRenderToken", 0);
__publicField(PhotosTab, "_flowVideoTransformConfigPromise", null);
__publicField(PhotosTab, "SEARCH_CHANNELS", {
  pinterest: "https://www.pinterest.com/search/pins/?q=",
  youtube: "https://www.youtube.com/results?search_query=",
  tiktok: "https://www.tiktok.com/search?q=",
  "google-photos": "https://www.google.com/search?tbm=isch&q=",
  facebook: "https://www.facebook.com/search/photos/?q=",
  unsplash: "https://unsplash.com/s/photos/",
  etsy: "https://www.etsy.com/search?q=",
  pixabay: "https://pixabay.com/images/search/",
  amazon: "https://www.amazon.com/s?k=",
});
window.PhotosTab = PhotosTab;
