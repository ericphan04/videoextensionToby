class AlbumList {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.albums = [];
    this._searchQuery = "";
    this._searchDebounce = null;
    this._viewingAlbumId = null;
    this._viewImages = [];
    this._viewPage = 0;
    this._viewPageSize = 20;
    this._currentPreviewIndex = -1;
    this._isLoading = true;
  }
  async init() {
    this.render();
    await this.loadAlbums();
    this._isLoading = false;
    this.render();
    this._initStorageBar();
  }
  _initStorageBar() {
    const openStorageSettings = () => {
      chrome.runtime.sendMessage({ action: "openSettings", tab: "storage" });
    };
    const iconBtn = document.getElementById("albumStorageBarIconBtn");
    if (iconBtn && !iconBtn._wired) {
      iconBtn._wired = true;
      iconBtn.addEventListener("click", openStorageSettings);
    }
    const progressBar = document.getElementById("albumStorageBarProgress");
    if (progressBar && !progressBar._wired) {
      progressBar._wired = true;
      progressBar.style.cursor = "pointer";
      progressBar.addEventListener("click", openStorageSettings);
    }
    const labelEl = document.getElementById("albumStorageBarLabel");
    if (labelEl && !labelEl._wired) {
      labelEl._wired = true;
      labelEl.style.cursor = "pointer";
      labelEl.addEventListener("click", openStorageSettings);
    }
    this._updateStorageBar();
    if (!this._storageBarRefreshTimer) {
      this._storageBarRefreshTimer = setInterval(
        () => this._updateStorageBar(),
        3e4,
      );
    }
  }
  async _updateStorageBar() {
    const fillEl = document.getElementById("albumStorageBarFill");
    const labelEl = document.getElementById("albumStorageBarLabel");
    if (!fillEl || !labelEl) return;
    try {
      const totalSize = await this._calculateAlbumStorageSize();
      const formatBytes = (bytes) => {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
        return (bytes / 1048576).toFixed(2) + " MB";
      };
      let pct;
      if (totalSize < 1048576) {
        pct = (totalSize / 1048576) * 33;
      } else if (totalSize < 5242880) {
        pct = 33 + ((totalSize - 1048576) / 4194304) * 34;
      } else {
        pct = 67 + Math.min(((totalSize - 5242880) / 5242880) * 33, 33);
      }
      fillEl.style.width = Math.max(pct, 2) + "%";
      fillEl.classList.remove("warn", "heavy");
      if (totalSize > 5242880) fillEl.classList.add("heavy");
      else if (totalSize > 1048576) fillEl.classList.add("warn");
      labelEl.textContent = formatBytes(totalSize);
      labelEl.title =
        window.I18n?.t("albums.storageBarLabelTooltip") ||
        "Album storage usage";
    } catch (err) {
      labelEl.textContent = "N/A";
    }
  }
  destroy() {
    if (this._storageBarRefreshTimer) {
      clearInterval(this._storageBarRefreshTimer);
      this._storageBarRefreshTimer = null;
    }
    if (this._searchDebounce) {
      clearTimeout(this._searchDebounce);
      this._searchDebounce = null;
    }
  }
  async _calculateAlbumStorageSize() {
    const estimateSize = (data) => {
      if (data === void 0 || data === null) return 0;
      try {
        const json = typeof data === "string" ? data : JSON.stringify(data);
        return new Blob([json]).size;
      } catch {
        return 0;
      }
    };
    const ALBUM_STORES = ["albums", "album_images", "image_blobs"];
    let totalSize = 0;
    try {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open("autoflow_pro");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      for (const storeName of ALBUM_STORES) {
        if (!db.objectStoreNames.contains(storeName)) continue;
        try {
          const items = await new Promise((resolve) => {
            const tx = db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
          });
          for (const item of items) {
            totalSize += estimateSize(item);
          }
        } catch {}
      }
      db.close();
    } catch {}
    return totalSize;
  }
  async loadAlbums() {
    if (window.AlbumStore) {
      this.albums = await window.AlbumStore.getAlbums();
      this.albums.sort((a, b) => b.updated_at - a.updated_at);
      console.log(
        "[AlbumList] Loaded albums:",
        this.albums.map((a) => ({ id: a.id, name: a.name })),
      );
    }
  }
  render() {
    if (!this.container) return;
    if (this._viewingAlbumId) {
      this._renderAlbumView();
      return;
    }
    const html = `
      <div class="album-list-header">
        <h3 class="album-list-title">Albums</h3>
        <div class="album-header-actions">
          <button class="album-refresh-btn" id="albumRefreshBtn" title="${window.I18n?.t("albums.refreshTooltip") || "Refresh list"}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
          </button>
          <button class="album-create-btn" id="albumCreateBtn" title="${window.I18n?.t("albums.createAlbum") || "Create new album"}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            ${window.I18n?.t("albums.createBtn") || "Create album"}
          </button>
        </div>
      </div>
      <div class="album-search-box">
        <svg class="album-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input type="text" class="album-search-input" id="albumSearchInput" placeholder="${window.I18n?.t("albums.searchPlaceholder") || "Search albums..."}" value="${this._escapeHtml(this._searchQuery || "")}">
      </div>
      <div class="album-list-content" id="albumListContent">
        ${this._isLoading ? this._renderSkeletons(3) : this._getFilteredAlbums().length === 0 ? (this._searchQuery ? this._renderSearchEmpty() : this._renderEmpty()) : this._renderAlbums()}
      </div>
    `;
    this.container.innerHTML = html;
    this._bindEvents();
  }
  _getFilteredAlbums() {
    if (!this._searchQuery) return this.albums;
    const q = this._searchQuery.toLowerCase();
    return this.albums.filter((a) => a.name.toLowerCase().includes(q));
  }
  _renderEmpty() {
    return `
      <div class="album-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
        <p>${window.I18n?.t("albums.noAlbums") || "No albums yet"}</p>
        <p class="album-empty-hint">${window.I18n?.t("albums.emptyHint") || "Create an album to manage reference images"}</p>
      </div>
    `;
  }
  _renderSearchEmpty() {
    return `
      <div class="album-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <p>${window.I18n?.t("albums.notFound") || "No albums found"}</p>
        <p class="album-empty-hint">${window.I18n?.t("albums.tryOther") || "Try different keywords"}</p>
      </div>
    `;
  }
  _renderAlbums() {
    return this._getFilteredAlbums()
      .map((album) => this._renderAlbumItem(album))
      .join("");
  }
  _renderSkeletons(count = 3) {
    const items = [];
    for (let i = 0; i < count; i++) {
      const nameW = 30 + Math.random() * 30;
      items.push(`
        <div class="album-item skeleton">
          <div class="album-item-header" style="display: flex; align-items: center; justify-content: space-between;">
            <div class="album-item-info" style="display: flex; align-items: center; gap: 8px; flex: 1;">
              <div class="skeleton-base" style="width: 16px; height: 16px; border-radius: 3px;"></div>
              <div class="skeleton-base" style="width: ${nameW}%; height: 14px;"></div>
            </div>
            <div class="skeleton-base" style="width: 14px; height: 14px; border-radius: 3px;"></div>
          </div>
          <div class="album-item-meta" style="margin-top: 6px;">
            <div class="skeleton-base" style="width: 110px; height: 10px;"></div>
          </div>
          <div class="album-item-thumbnails" style="display: flex; gap: 6px; margin-top: 8px;">
            <div class="skeleton-base" style="width: 48px; height: 48px; border-radius: 4px;"></div>
            <div class="skeleton-base" style="width: 48px; height: 48px; border-radius: 4px;"></div>
            <div class="skeleton-base" style="width: 48px; height: 48px; border-radius: 4px;"></div>
          </div>
        </div>
      `);
    }
    return items.join("");
  }
  _renderAlbumItem(album) {
    const imageCount = album.image_ids?.length || 0;
    const updatedText = this._formatTimeAgo(album.updated_at);
    return `
      <div class="album-item" data-album-id="${album.id}">
        <div class="album-item-header">
          <div class="album-item-info">
            <svg class="album-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            <span class="album-name">${this._escapeHtml(album.name)}</span>
          </div>
          <button class="album-menu-btn" data-album-id="${album.id}" title="${window.I18n?.t("albums.options") || "Options"}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="1"></circle>
              <circle cx="19" cy="12" r="1"></circle>
              <circle cx="5" cy="12" r="1"></circle>
            </svg>
          </button>
        </div>
        <div class="album-item-meta">
          ${window.I18n?.t("albums.imagesCount", { count: imageCount }) || `${imageCount} images`} \u2022 ${updatedText}
        </div>
        <div class="album-item-thumbnails" data-album-id="${album.id}">
          <div class="album-thumb-placeholder">${window.I18n?.t("albums.loading") || "Loading..."}</div>
        </div>
      </div>
    `;
  }
  _bindEvents() {
    const refreshBtn = document.getElementById("albumRefreshBtn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => this.refresh());
    }
    const createBtn = document.getElementById("albumCreateBtn");
    if (createBtn) {
      createBtn.addEventListener("click", () => this._showCreateModal());
    }
    const searchInput = document.getElementById("albumSearchInput");
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        clearTimeout(this._searchDebounce);
        this._searchDebounce = setTimeout(() => {
          this._searchQuery = searchInput.value.trim();
          const content = document.getElementById("albumListContent");
          if (content) {
            const filtered = this._getFilteredAlbums();
            content.innerHTML =
              filtered.length === 0
                ? this._searchQuery
                  ? this._renderSearchEmpty()
                  : this._renderEmpty()
                : this._renderAlbums();
            this._bindAlbumItemEvents();
            this._loadThumbnails();
          }
        }, 300);
      });
    }
    if (window.eventBus) {
      window.eventBus.on("album:refresh", () => this.refresh());
    }
    this._bindAlbumItemEvents();
    this._loadThumbnails();
  }
  _bindAlbumItemEvents() {
    this.container.querySelectorAll(".album-menu-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._showContextMenu(btn, btn.dataset.albumId);
      });
    });
    this.container.querySelectorAll(".album-item").forEach((item) => {
      item.addEventListener("click", () =>
        this._previewAlbum(item.dataset.albumId),
      );
    });
  }
  async _loadThumbnails() {
    await Promise.all(
      this._getFilteredAlbums().map(async (album) => {
        const container = this.container.querySelector(
          `.album-item-thumbnails[data-album-id="${album.id}"]`,
        );
        if (!container) return;
        if (window.ImageStore && album.image_ids?.length > 0) {
          const images = await window.ImageStore.getAlbumImages(album.id);
          const MAX_THUMBS = 6;
          const overflowCount = Math.max(0, images.length - MAX_THUMBS);
          const thumbsHtml = await Promise.all(
            images.slice(0, MAX_THUMBS).map(async (img, idx) => {
              const isPending = AlbumList._isImagePending(img);
              const isDead = !isPending && AlbumList._isImageDead(img);
              let thumbUrl = "";
              if (img.thumbnail_url && img.thumbnail_url.startsWith("http")) {
                thumbUrl = img.thumbnail_url;
              }
              if (!thumbUrl && img.id && window.ImageStore) {
                thumbUrl = (await window.ImageStore.getThumbnail(img.id)) || "";
              }
              if (!thumbUrl && img.thumbnail_url) {
                thumbUrl = img.thumbnail_url;
              }
              const isLastWithOverflow =
                idx === MAX_THUMBS - 1 && overflowCount > 0;
              const overflowOverlay = isLastWithOverflow
                ? `<span class="album-thumb-overflow">+${overflowCount}</span>`
                : "";
              const wrapperClass = isLastWithOverflow
                ? "album-thumb-wrap album-thumb-wrap--overflow"
                : "album-thumb-wrap";
              if (thumbUrl) {
                let stateClass = "";
                if (isPending) stateClass = " album-thumb--pending";
                else if (isDead) stateClass = " album-thumb--dead";
                return `<div class="${wrapperClass}"><img class="album-thumb${stateClass}" src="${thumbUrl}" alt="" loading="lazy">${overflowOverlay}</div>`;
              }
              if (isPending) {
                return `<div class="${wrapperClass}"><div class="album-thumb album-thumb--pending album-thumb--placeholder" title="${window.I18n?.t("albums.processing") || "Processing..."}"></div>${overflowOverlay}</div>`;
              }
              if (isDead) {
                return `<div class="${wrapperClass}"><div class="album-thumb album-thumb--dead album-thumb--placeholder" title="${window.I18n?.t("albums.imageError") || "Image error"}"></div>${overflowOverlay}</div>`;
              }
              return null;
            }),
          );
          const validThumbs = thumbsHtml.filter(Boolean);
          container.innerHTML =
            validThumbs.length > 0
              ? validThumbs.join("")
              : `<span class="album-no-images">${window.I18n?.t("albums.empty") || "Empty"}</span>`;
        } else {
          container.innerHTML = `<span class="album-no-images">${window.I18n?.t("albums.empty") || "Empty"}</span>`;
        }
      }),
    );
  }
  _showContextMenu(anchorEl, albumId, insideView = false) {
    document.querySelectorAll(".album-context-menu").forEach((m) => m.remove());
    const menu = document.createElement("div");
    menu.className = "album-context-menu";
    menu.innerHTML = `
      ${
        insideView
          ? ""
          : `<button class="album-menu-item" data-action="view">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
        ${window.I18n?.t("albums.view") || "Xem"}
      </button>`
      }
      <button class="album-menu-item" data-action="use">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 11 12 14 22 4"></polyline>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
        </svg>
        ${window.I18n?.t("albums.use") || "Use"}
      </button>
      <button class="album-menu-item" data-action="add">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="12" y1="8" x2="12" y2="16"></line>
          <line x1="8" y1="12" x2="16" y2="12"></line>
        </svg>
        ${window.I18n?.t("albums.addImage") || "Add image"}
      </button>
      <button class="album-menu-item" data-action="capture">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
          <circle cx="12" cy="13" r="4"></circle>
        </svg>
        ${window.I18n?.t("albums.capture") || "Capture more"}
      </button>
      <button class="album-menu-item" data-action="cleanup">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        ${window.I18n?.t("albums.cleanup") || "Clean up errors"}
      </button>
      <div class="album-menu-divider"></div>
      <button class="album-menu-item album-menu-item--danger" data-action="delete">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
        ${window.I18n?.t("albums.deleteAlbum") || "Delete album"}
      </button>
    `;
    document.body.appendChild(menu);
    const rect = anchorEl.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    let left = rect.left;
    if (left + menuRect.width > viewportWidth - 10) {
      left = rect.right - menuRect.width;
    }
    if (left < 10) left = 10;
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${left}px`;
    menu.querySelectorAll(".album-menu-item").forEach((item) => {
      item.addEventListener("click", () => {
        this._handleMenuAction(item.dataset.action, albumId);
        menu.remove();
      });
    });
    setTimeout(() => {
      document.addEventListener("click", () => menu.remove(), { once: true });
    }, 0);
  }
  async _handleMenuAction(action, albumId) {
    switch (action) {
      case "view":
        this._previewAlbum(albumId);
        break;
      case "use":
        await this._useAlbum(albumId);
        break;
      case "add":
        this._addImagesToAlbum(albumId);
        break;
      case "capture":
        this._captureToAlbum(albumId);
        break;
      case "cleanup":
        await this._cleanupAlbum(albumId);
        break;
      case "delete":
        await this._deleteAlbum(albumId);
        break;
    }
  }
  _showCreateModal() {
    if (window.AlbumCreateModal) {
      window.AlbumCreateModal.show(() => this.refresh());
    }
  }
  async _useAlbum(albumId) {
    const album = this.albums.find((a) => a.id === albumId);
    if (!album || !window.ImageStore) return;
    const images = await window.ImageStore.getAlbumImages(albumId);
    const deadImages = [];
    const usableImages = [];
    let staleCount = 0;
    for (const img of images) {
      const status = await AlbumList._checkImageStatus(img);
      if (status === "dead") {
        deadImages.push(img);
      } else {
        usableImages.push(img);
        if (status === "stale") staleCount++;
      }
    }
    if (deadImages.length > 0) {
      for (const img of deadImages) {
        await window.ImageStore.deleteImage(img.id);
      }
      console.log(
        "[AlbumList] Cleaned up",
        deadImages.length,
        "dead images from album",
        albumId,
      );
    }
    if (usableImages.length === 0) {
      window.customDialog?.alert(
        `${window.I18n?.t("albums.albumEmpty") || "Album empty"}: "${album.name}"${
          deadImages.length > 0
            ? `

${deadImages.length} ${window.I18n?.t("albums.imageError") || "Image error"}`
            : ""
        }`,
        {
          title: window.I18n?.t("albums.albumEmpty") || "Album empty",
          type: "warning",
        },
      );
      if (deadImages.length > 0) this.refresh();
      return;
    }
    if (window.eventBus) {
      window.eventBus.emit("album:use", { albumId, images: usableImages });
    }
    let msg = `${window.I18n?.t("albums.addToGeneration") || "Add to generation"}: ${usableImages.length} ${window.I18n?.t("albums.imagesLabel") || "Images"} - "${album.name}"`;
    if (staleCount > 0) {
      msg += `

${staleCount} ${window.I18n?.t("albums.imagesLabel") || "Images"} (stale)`;
    }
    if (deadImages.length > 0) {
      msg += `

${deadImages.length} ${window.I18n?.t("albums.imageError") || "Image error"}`;
      this.refresh();
    }
    window.customDialog?.alert(msg, {
      title: window.I18n?.t("common.success") || "Success",
      type: "success",
    });
  }
  async _addImagesToAlbum(albumId) {
    if (window.ImagePickerModal) {
      const existingImages = window.ImageStore
        ? await window.ImageStore.getAlbumImages(albumId)
        : [];
      const existingFileIds = existingImages
        .map((i) => i.file_id)
        .filter(Boolean);
      const usedNames = new Set(
        existingImages.map((i) => i.name).filter(Boolean),
      );
      const modal = new window.ImagePickerModal();
      modal.open({
        existingFileIds,
        onConfirm: async (selectedImages) => {
          for (const img of selectedImages) {
            if (img.fileId && !existingFileIds.includes(img.fileId)) {
              let baseName = (img.name || "image")
                .toLowerCase()
                .replace(/[^a-z0-9_]/g, "_");
              let finalName = baseName;
              let counter = 1;
              while (usedNames.has(finalName)) {
                finalName = `${baseName}_${counter}`;
                counter++;
              }
              usedNames.add(finalName);
              const imageData = {
                name: finalName,
                type: img.source === "upload" ? "upload" : "image",
                file_id: img.fileId,
                file_name: img.file_name || null,
                thumbnail_url: img.thumbnail || null,
              };
              let thumbBlob = null;
              let fullBlob = null;
              if (img.source === "upload" && img.file instanceof Blob) {
                fullBlob = img.file;
                try {
                  thumbBlob = await window.ImageStore.compressThumbnail(
                    img.file,
                  );
                } catch (e) {
                  console.warn(
                    "[AlbumList] Thumbnail compression failed:",
                    e.message,
                  );
                }
              }
              await window.ImageStore?.addImage(
                albumId,
                imageData,
                thumbBlob,
                fullBlob,
              );
            }
          }
          this.refresh();
        },
      });
    }
  }
  _captureToAlbum(albumId) {
    if (window.eventBus) {
      window.eventBus.emit("capture:start", { targetAlbumId: albumId });
    }
  }
  async _cleanupAlbum(albumId) {
    const album = this.albums.find((a) => a.id === albumId);
    if (!album) return;
    const { removed, names, staleCount } =
      await AlbumList._cleanupDeadImages(albumId);
    if (removed === 0) {
      let msg = `"${album.name}" - ${window.I18n?.t("albums.noImagesInAlbum") || "No images in this album"} (${window.I18n?.t("albums.imageError") || "Image error"}: 0)`;
      if (staleCount > 0) {
        msg += `

${staleCount} stale`;
      }
      window.customDialog?.alert(msg, {
        title:
          window.I18n?.t("albums.cleanupTitle") || "Clean up broken images",
        type: "info",
      });
    } else {
      let msg = `${window.I18n?.t("albums.cleanupTitle") || "Clean up broken images"}: ${removed} - "${album.name}":

${names.map((n) => `  - ${n}`).join("\n")}`;
      if (staleCount > 0) {
        msg += `

${staleCount} stale`;
      }
      window.customDialog?.alert(msg, {
        title:
          window.I18n?.t("albums.cleanupTitle") || "Clean up broken images",
        type: "success",
      });
      this.refresh();
    }
  }
  async _deleteAlbum(albumId) {
    const album = this.albums.find((a) => a.id === albumId);
    if (!album) return;
    const confirmed = await window.customDialog?.confirm(
      `${window.I18n?.t("albums.deleteAlbumConfirm", { name: album.name }) || `Are you sure you want to delete album "${album.name}"?`}`,
      {
        title: window.I18n?.t("albums.deleteAlbum") || "Delete album",
        type: "warning",
        confirmText: window.I18n?.t("common.delete") || "Delete",
        cancelText: window.I18n?.t("common.cancel") || "Cancel",
      },
    );
    if (confirmed && window.AlbumStore) {
      await window.AlbumStore.deleteAlbum(albumId);
      this.refresh();
    }
  }
  async _previewAlbum(albumId) {
    this._viewingAlbumId = albumId;
    this._viewPage = 0;
    this._viewImages = [];
    if (window.ImageStore) {
      this._viewImages = await window.ImageStore.getAlbumImages(albumId);
    }
    this.render();
  }
  _exitAlbumView() {
    this._viewingAlbumId = null;
    this._viewImages = [];
    this._viewPage = 0;
    this.render();
  }
  async _uploadFilesToCurrentAlbum(files) {
    if (!this._viewingAlbumId) return;
    if (!Array.isArray(files) || files.length === 0) return;
    const albumId = this._viewingAlbumId;
    const notify = (msg, type = "success") =>
      window.showNotification?.(msg, type, 2500);
    notify(
      window.I18n?.t("albums.uploadingN", { count: files.length }) ||
        `Uploading ${files.length} images...`,
      "info",
    );
    const usedNames = new Set(
      (this._viewImages || []).map((img) => (img.name || "").toLowerCase()),
    );
    let added = 0;
    let failed = 0;
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        failed++;
        continue;
      }
      try {
        const fullBlob = file;
        let thumbnailBlob = null;
        try {
          thumbnailBlob = await window.ImageStore.compressThumbnail(file);
        } catch (e) {
          console.warn("[AlbumList] thumbnail compression failed:", e.message);
        }
        let baseName = (file.name || `image_${Date.now()}`)
          .replace(/\.[^.]+$/, "")
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, "_");
        if (!baseName) baseName = "image_" + Date.now();
        let finalName = baseName;
        let counter = 1;
        while (usedNames.has(finalName)) {
          finalName = `${baseName}_${counter}`;
          counter++;
        }
        usedNames.add(finalName);
        const imageData = {
          name: finalName,
          type: "upload",
          file_id: null,
          file_name: file.name || null,
          thumbnail_url: null,
        };
        await window.ImageStore.addImage(
          albumId,
          imageData,
          thumbnailBlob,
          fullBlob,
        );
        added++;
      } catch (err) {
        console.warn("[AlbumList] upload file failed:", file.name, err.message);
        failed++;
      }
    }
    if (added > 0) {
      try {
        this._viewImages = await window.ImageStore.getAlbumImages(albumId);
        const albumIdx = this.albums.findIndex((a) => a.id === albumId);
        if (albumIdx >= 0) {
          this.albums[albumIdx].image_ids = (this._viewImages || []).map(
            (i) => i.id,
          );
          this.albums[albumIdx].updated_at = Date.now();
        }
      } catch (e) {
        console.warn("[AlbumList] reload images failed:", e.message);
      }
      this._renderAlbumView();
      notify(
        window.I18n?.t("albums.uploadedNSuccess", { count: added }) ||
          `Added ${added} images to album`,
        "success",
      );
      this._updateStorageBar();
    }
    if (failed > 0 && added === 0) {
      notify(
        window.I18n?.t("albums.uploadFailedAll") || "Upload failed",
        "error",
      );
    } else if (failed > 0) {
      notify(
        window.I18n?.t("albums.uploadPartial", { failed }) ||
          `${failed} images failed to upload`,
        "warning",
      );
    }
  }
  async _renderAlbumView() {
    const album = this.albums.find((a) => a.id === this._viewingAlbumId);
    if (!album) {
      this._exitAlbumView();
      return;
    }
    const endIdx = (this._viewPage + 1) * this._viewPageSize;
    const visibleImages = this._viewImages.slice(0, endIdx);
    const hasMore = endIdx < this._viewImages.length;
    this.container.innerHTML = `
      <div class="album-view-header">
        <button class="album-view-back" id="albumViewBack" title="${window.I18n?.t("albums.goBack") || "Go back"}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <div class="album-view-title-group">
          <h3 class="album-view-title">${this._escapeHtml(album.name)}</h3>
          <span class="album-view-count">${window.I18n?.t("albums.imagesCount", { count: this._viewImages.length }) || `${this._viewImages.length} images`}</span>
        </div>
        <button class="album-menu-btn album-view-menu-btn" id="albumViewMenuBtn" title="${window.I18n?.t("albums.options") || "Options"}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="1"></circle>
            <circle cx="19" cy="12" r="1"></circle>
            <circle cx="5" cy="12" r="1"></circle>
          </svg>
        </button>
      </div>
      <div class="album-view-grid" id="albumViewGrid">
        <button class="album-view-upload-tile" id="albumViewUploadTile" type="button" aria-label="${window.I18n?.t("gen.selectUploadImage") || "Select image / Drag here"}" title="${window.I18n?.t("gen.selectUploadImage") || "Select image / Drag here"}">
          <svg class="album-view-upload-tile__icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 8h.01"></path>
            <path d="M12.5 21h-6.5a3 3 0 0 1 -3 -3v-12a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v6.5"></path>
            <path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l3.5 3.5"></path>
            <path d="M14 14l1 -1c.679 -.653 1.473 -.829 2.214 -.526"></path>
            <path d="M19 22v-6"></path>
            <path d="M22 19l-3 -3l-3 3"></path>
          </svg>
          <span class="album-view-upload-tile__text">${window.I18n?.t("gen.selectUploadImage") || "Select image / Drag here"}</span>
        </button>
        <div class="album-drop-overlay" id="albumDropOverlay">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          <div class="album-drop-overlay-text">${window.I18n?.t("albums.dropImagesHere") || "Drop images here to add to album"}</div>
        </div>
      </div>
    `;
    document
      .getElementById("albumViewBack")
      ?.addEventListener("click", () => this._exitAlbumView());
    const menuBtn = document.getElementById("albumViewMenuBtn");
    if (menuBtn) {
      menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._showContextMenu(menuBtn, album.id, true);
      });
    }
    const uploadTile = document.getElementById("albumViewUploadTile");
    if (uploadTile) {
      uploadTile.addEventListener("click", (e) => {
        e.stopPropagation();
        this._addImagesToAlbum(this._viewingAlbumId);
      });
      let _tileDragDepth = 0;
      uploadTile.addEventListener("dragenter", (e) => {
        if (!e.dataTransfer?.types?.includes("Files")) return;
        e.preventDefault();
        e.stopPropagation();
        _tileDragDepth++;
        uploadTile.classList.add("drag-over");
      });
      uploadTile.addEventListener("dragover", (e) => {
        if (!e.dataTransfer?.types?.includes("Files")) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
      });
      uploadTile.addEventListener("dragleave", (e) => {
        e.stopPropagation();
        _tileDragDepth = Math.max(0, _tileDragDepth - 1);
        if (_tileDragDepth === 0) uploadTile.classList.remove("drag-over");
      });
      uploadTile.addEventListener("drop", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        _tileDragDepth = 0;
        uploadTile.classList.remove("drag-over");
        const files = Array.from(e.dataTransfer?.files || []).filter((f) =>
          f.type.startsWith("image/"),
        );
        if (files.length === 0) return;
        await this._uploadFilesToCurrentAlbum(files);
      });
    }
    const grid = document.getElementById("albumViewGrid");
    if (grid) {
      let _dragDepth = 0;
      grid.addEventListener("dragenter", (e) => {
        if (!e.dataTransfer?.types?.includes("Files")) return;
        e.preventDefault();
        _dragDepth++;
        grid.classList.add("drag-over");
      });
      grid.addEventListener("dragover", (e) => {
        if (!e.dataTransfer?.types?.includes("Files")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      });
      grid.addEventListener("dragleave", () => {
        _dragDepth = Math.max(0, _dragDepth - 1);
        if (_dragDepth === 0) grid.classList.remove("drag-over");
      });
      grid.addEventListener("drop", async (e) => {
        e.preventDefault();
        _dragDepth = 0;
        grid.classList.remove("drag-over");
        const files = Array.from(e.dataTransfer?.files || []).filter((f) =>
          f.type.startsWith("image/"),
        );
        if (files.length === 0) return;
        await this._uploadFilesToCurrentAlbum(files);
      });
    }
    if (grid && visibleImages.length > 0) {
      for (const img of visibleImages) {
        grid.appendChild(await this._createAlbumViewItem(img));
      }
      if (hasMore) {
        const showMore = document.createElement("button");
        showMore.className = "photos-flow-images-show-more";
        showMore.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
          ${window.I18n?.t("albums.viewMore", { count: this._viewImages.length - endIdx }) || `View more (${this._viewImages.length - endIdx} images)`}
        `;
        showMore.addEventListener("click", async () => {
          this._viewPage++;
          const nextEnd = (this._viewPage + 1) * this._viewPageSize;
          const nextImages = this._viewImages.slice(endIdx, nextEnd);
          showMore.remove();
          for (const img of nextImages) {
            grid.appendChild(await this._createAlbumViewItem(img));
          }
          if (nextEnd < this._viewImages.length) {
            const newShowMore = showMore.cloneNode(true);
            newShowMore.innerHTML = `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
              ${window.I18n?.t("albums.viewMore", { count: this._viewImages.length - nextEnd }) || `View more (${this._viewImages.length - nextEnd} images)`}
            `;
            newShowMore.addEventListener("click", () => {
              this._viewPage++;
              this._renderAlbumView();
            });
            grid.appendChild(newShowMore);
          }
        });
        grid.appendChild(showMore);
      }
    }
  }
  async _createAlbumViewItem(image) {
    let status;
    if (AlbumList._isImagePending(image)) {
      status = "pending";
    } else if (AlbumList._isImageDead(image)) {
      status = "dead";
    } else {
      status = await AlbumList._checkImageStatus(image);
    }
    const item = document.createElement("div");
    let stateClass = "";
    if (status === "dead") stateClass = " album-view-item--dead";
    else if (status === "stale") stateClass = " album-view-item--stale";
    else if (status === "pending") stateClass = " album-view-item--pending";
    item.className = "photos-flow-images-item album-view-item" + stateClass;
    item.dataset.imageId = image.id;
    let thumbUrl = "";
    if (image.thumbnail_url && image.thumbnail_url.startsWith("http")) {
      thumbUrl = image.thumbnail_url;
    }
    if (!thumbUrl && image.id && window.ImageStore) {
      thumbUrl = (await window.ImageStore.getThumbnail(image.id)) || "";
    }
    if (!thumbUrl && image.thumbnail_url) {
      thumbUrl = image.thumbnail_url;
    }
    const img = document.createElement("img");
    img.src = thumbUrl || "";
    img.alt = image.name || "";
    img.loading = "lazy";
    if (!thumbUrl) {
      item.innerHTML = `<div class="album-view-placeholder">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
      </div>`;
    }
    if (status === "dead") {
      const badge = document.createElement("div");
      badge.className = "album-view-dead-badge";
      badge.title = window.I18n?.t("albums.imageError") || "Image error";
      badge.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>`;
      item.appendChild(badge);
    } else if (status === "stale") {
      const badge = document.createElement("div");
      badge.className = "album-view-stale-badge";
      badge.title =
        window.I18n?.t("imagePicker.staleImageTitle") ||
        "Image from another project";
      badge.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M22 12 18.55 5.11A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11L2 12"></path>
        <rect x="2" y="12" width="20" height="8" rx="2"></rect>
        <path d="M6 16h.01M10 16h.01"></path>
      </svg>`;
      item.appendChild(badge);
    } else if (status === "pending") {
      const badge = document.createElement("div");
      badge.className = "album-view-pending-badge";
      badge.title = window.I18n?.t("albums.processing") || "Processing...";
      badge.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
      </svg>`;
      item.appendChild(badge);
    }
    const nameLabel = document.createElement("div");
    nameLabel.className = "album-view-name";
    nameLabel.textContent = image.name || "Unnamed";
    const actions = document.createElement("div");
    actions.className = "photos-flow-images-item-actions";
    actions.innerHTML = `
      <button class="photos-flow-images-action" data-action="use" title="${window.I18n?.t("albums.use") || "Use"}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 11 12 14 22 4"/>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
      </button>
      <button class="photos-flow-images-action" data-action="editName" title="${window.I18n?.t("common.edit") || "Edit"}">
        <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.75 15.7502H9.75002M1.875 16.1252L6.03695 14.5245C6.30316 14.4221 6.43626 14.3709 6.56079 14.3041C6.6714 14.2447 6.77685 14.1761 6.87603 14.0992C6.98769 14.0125 7.08853 13.9117 7.29021 13.71L15.75 5.25023C16.5784 4.4218 16.5784 3.07865 15.75 2.25023C14.9216 1.4218 13.5784 1.4218 12.75 2.25022L4.29021 10.71C4.08853 10.9117 3.98769 11.0125 3.90104 11.1242C3.82408 11.2234 3.75555 11.3288 3.69618 11.4394C3.62933 11.564 3.57814 11.6971 3.47575 11.9633L1.875 16.1252ZM1.875 16.1252L3.41859 12.1119C3.52905 11.8248 3.58428 11.6812 3.67901 11.6154C3.76179 11.5579 3.86423 11.5362 3.96322 11.5551C4.0765 11.5767 4.18529 11.6855 4.40286 11.9031L6.09718 13.5974C6.31475 13.815 6.42354 13.9237 6.44517 14.037C6.46408 14.136 6.44234 14.2385 6.38486 14.3212C6.31908 14.416 6.17549 14.4712 5.8883 14.5817L1.875 16.1252Z"/></svg>
      </button>
      <button class="photos-flow-images-action photos-flow-images-action--danger" data-action="delete" title="${window.I18n?.t("common.delete") || "Delete"}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    `;
    actions.querySelectorAll(".photos-flow-images-action").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (btn.dataset.action === "use") {
          this._useAlbumImage(image);
        } else if (btn.dataset.action === "editName") {
          this._editImageName(image, nameLabel);
        } else if (btn.dataset.action === "delete") {
          this._deleteAlbumImage(image);
        }
      });
    });
    item.addEventListener("click", () => {
      this._openAlbumImagePreview(image);
    });
    if (thumbUrl) item.appendChild(img);
    item.appendChild(actions);
    item.appendChild(nameLabel);
    return item;
  }
  static _isImagePending(image) {
    if (!image) return false;
    if (window.ImmediateUploader && image._uploadKey) {
      return window.ImmediateUploader.isUploading(image._uploadKey);
    }
    return false;
  }
  static _isImageDead(image) {
    if (!image) return true;
    if (AlbumList._isImagePending(image)) return false;
    if (image.blob_key) return false;
    if (
      image.thumbnail_url &&
      (image.thumbnail_url.startsWith("blob:") ||
        image.thumbnail_url.startsWith("data:"))
    ) {
      return false;
    }
    if (image.file_id) {
      if (image.thumbnail_url && image.thumbnail_url.startsWith("http")) {
        return false;
      }
      return false;
    }
    if (!image.thumbnail_url) return true;
    if (
      !image.thumbnail_url.startsWith("http") &&
      !image.thumbnail_url.startsWith("blob:") &&
      !image.thumbnail_url.startsWith("data:")
    ) {
      return true;
    }
    return false;
  }
  static async _checkImageStatus(image) {
    if (AlbumList._isImageDead(image)) {
      return "dead";
    }
    try {
      if (!window.MessageBridge) {
        return "alive";
      }
      if (
        window.MessageBridge.lookupFlowMediaCatalog &&
        (image.file_id || image.file_name)
      ) {
        try {
          const identities = [image.file_id, image.file_name].filter(Boolean);
          const catalog =
            await window.MessageBridge.lookupFlowMediaCatalog(identities);
          if (
            catalog?.supported === true &&
            identities.some((id) => catalog.known?.[id])
          )
            return "alive";
        } catch (_) {}
      }
      if (image.file_id) {
        const tileCheck = await window.MessageBridge.checkTilesExist([
          image.file_id,
        ]);
        if (tileCheck?.existing?.includes(image.file_id)) {
          return "alive";
        }
      }
      if (image.file_name) {
        const fnCheck = await window.MessageBridge.checkFilesExist([
          image.file_name,
        ]);
        if (fnCheck?.existing?.includes(image.file_name)) {
          return "alive";
        }
      }
      if (image.thumbnail_url && image.thumbnail_url.startsWith("http")) {
        return "stale";
      }
      if (image.blob_key && window.ImageStore) {
        try {
          const hasBlob =
            typeof window.ImageStore.hasBlob === "function"
              ? await window.ImageStore.hasBlob(image.id)
              : !!(await window.ImageStore.getThumbnail(image.id));
          if (hasBlob) {
            return "stale";
          }
        } catch (e) {}
      }
      return "dead";
    } catch (err) {
      console.warn(
        "[AlbumList] _checkImageStatus failed:",
        image.name || image.id,
        err.message,
      );
      return "alive";
    }
  }
  static async _checkImageAlive(image) {
    const status = await AlbumList._checkImageStatus(image);
    return status !== "dead";
  }
  static async _cleanupDeadImages(albumId) {
    if (!window.ImageStore) return { removed: 0, names: [], staleCount: 0 };
    const images = await window.ImageStore.getAlbumImages(albumId);
    const deadImages = [];
    let staleCount = 0;
    for (const img of images) {
      const status = await AlbumList._checkImageStatus(img);
      if (status === "dead") deadImages.push(img);
      else if (status === "stale") staleCount++;
    }
    const names = [];
    for (const img of deadImages) {
      names.push(img.name || img.original_name || img.id?.substring(0, 8));
      await window.ImageStore.deleteImage(img.id);
    }
    return { removed: deadImages.length, names, staleCount };
  }
  async _useAlbumImage(image) {
    const status = await AlbumList._checkImageStatus(image);
    if (status === "dead") {
      const imgName = image.name || image.original_name || "Unnamed";
      if (window.ImageStore) {
        await window.ImageStore.deleteImage(image.id);
        console.log("[AlbumList] Removed dead album image:", image.id);
        window.eventBus?.emit("album:refresh");
      }
      window.customDialog?.alert(
        `${window.I18n?.t("albums.imageError") || "Image error"}: "${imgName}"`,
        {
          title: window.I18n?.t("albums.imageError") || "Image error",
          type: "warning",
        },
      );
      return;
    }
    if (!window.GenTab) return;
    const useKey = await AlbumList._prepareImageForGenTab(image, status);
    if (!useKey) return;
    if (window.GenTab.fileIdsInput) {
      const current = window.GenTab.fileIdsInput.value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!current.includes(useKey)) {
        current.push(useKey);
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
    console.log(
      "[AlbumList] Added album image to ref:",
      useKey,
      status === "stale" ? "(uploading)" : "",
    );
  }
  static async _prepareImageForGenTab(image, status) {
    const fileId = image.file_id;
    if (!window.GenTab.thumbnailCache) window.GenTab.thumbnailCache = {};
    if (!window.GenTab.fileNameCache) window.GenTab.fileNameCache = {};
    if (!window.GenTab.refImageNames) window.GenTab.refImageNames = {};
    const needsUpload = !fileId || status === "stale";
    if (fileId) {
      if (image.thumbnail_url)
        window.GenTab.thumbnailCache[fileId] = image.thumbnail_url;
      if (image.file_name)
        window.GenTab.fileNameCache[fileId] = image.file_name;
      if (image.name) window.GenTab.refImageNames[fileId] = image.name;
    }
    if (status === "alive" && fileId) {
      return fileId;
    }
    let file = null;
    let thumbnailForCache = image.thumbnail_url || null;
    try {
      if (window.ImageStore && image.blob_key) {
        const blob = await window.ImageStore.getFullBlob(image.id);
        if (blob) {
          file = new File(
            [blob],
            image.original_name || `album_${image.id.substring(0, 8)}.png`,
            { type: blob.type || "image/png" },
          );
        }
        if (!thumbnailForCache || !thumbnailForCache.startsWith("http")) {
          const thumbUrl = await window.ImageStore.getThumbnail(image.id);
          if (thumbUrl) thumbnailForCache = thumbUrl;
        }
      }
      if (
        !file &&
        image.thumbnail_url &&
        image.thumbnail_url.startsWith("http")
      ) {
        const fetchUrl =
          image.thumbnail_url.includes("lh3.") ||
          image.thumbnail_url.includes("googleusercontent.com")
            ? image.thumbnail_url.split("=")[0]
            : image.thumbnail_url;
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
          const binary = atob(resp.base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++)
            bytes[i] = binary.charCodeAt(i);
          const blob = new Blob([bytes], { type: "image/png" });
          file = new File(
            [blob],
            image.original_name || `album_${image.id.substring(0, 8)}.png`,
            { type: "image/png" },
          );
        }
      }
    } catch (err) {
      console.error(
        "[AlbumList] Failed to get image blob for upload:",
        err.message,
      );
    }
    if (!file) {
      if (fileId) {
        console.warn(
          "[AlbumList] No blob available for stale image, using file_id as fallback:",
          fileId,
        );
        return fileId;
      }
      console.warn(
        "[AlbumList] No file_id and no blob for album image:",
        image.id,
      );
      return null;
    }
    const uploadKey =
      "upload_album_" +
      Date.now() +
      "_" +
      Math.random().toString(36).slice(2, 8);
    if (!window.pendingUploadFiles) window.pendingUploadFiles = new Map();
    window.pendingUploadFiles.set(uploadKey, {
      file,
      thumbnail: thumbnailForCache,
    });
    if (thumbnailForCache)
      window.GenTab.thumbnailCache[uploadKey] = thumbnailForCache;
    if (image.file_name)
      window.GenTab.fileNameCache[uploadKey] = image.file_name;
    if (image.name) window.GenTab.refImageNames[uploadKey] = image.name;
    console.log(
      "[AlbumList] Prepared image for upload at submit time:",
      uploadKey,
      file.name,
      needsUpload ? "(needs upload)" : "",
    );
    return uploadKey;
  }
  _editImageName(image, nameLabelEl) {
    document.querySelector(".album-name-popup")?.remove();
    document.querySelector(".album-name-popup-backdrop")?.remove();
    const currentName = image.name || "";
    const itemEl = nameLabelEl.closest(".album-view-item");
    const rect = itemEl
      ? itemEl.getBoundingClientRect()
      : nameLabelEl.getBoundingClientRect();
    const backdrop = document.createElement("div");
    backdrop.className = "album-name-popup-backdrop";
    const popup = document.createElement("div");
    popup.className = "album-name-popup";
    popup.style.left = `${Math.max(8, rect.left)}px`;
    popup.style.top = `${rect.bottom + 6}px`;
    const title = document.createElement("div");
    title.className = "album-name-popup-title";
    title.textContent =
      window.I18n?.t("albums.imageNameMention") || "Image name (for @mention)";
    popup.appendChild(title);
    const inputWrap = document.createElement("div");
    inputWrap.className = "album-name-popup-input-wrap";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "album-name-popup-input";
    input.value = currentName;
    input.placeholder = "a-z, 0-9, _";
    inputWrap.appendChild(input);
    const saveBtn = document.createElement("button");
    saveBtn.className = "album-name-popup-save";
    saveBtn.title = window.I18n?.t("common.save") || "Save";
    saveBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    inputWrap.appendChild(saveBtn);
    popup.appendChild(inputWrap);
    document.body.appendChild(backdrop);
    document.body.appendChild(popup);
    setTimeout(() => {
      input.focus();
      input.select();
    }, 10);
    const close = () => {
      popup.remove();
      backdrop.remove();
    };
    const save = async () => {
      let newName = input.value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_");
      if (!newName) newName = `image_${Date.now() % 1e4}`;
      if (newName === currentName) {
        close();
        return;
      }
      const albumImages = this._viewImages || [];
      const isDuplicate = albumImages.some(
        (img) => img.id !== image.id && img.name === newName,
      );
      if (isDuplicate) {
        input.value = newName;
        input.style.borderColor = "var(--destructive, #dc2626)";
        input.setAttribute(
          "title",
          window.I18n?.t("albums.nameExistsInAlbum") ||
            "Name already exists in album",
        );
        return;
      }
      if (window.ImageStore) {
        await window.ImageStore.updateImageName(image.id, newName);
        image.name = newName;
        await this._refreshRegistry();
      }
      nameLabelEl.textContent = newName;
      close();
    };
    backdrop.addEventListener("click", close);
    saveBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      save();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        save();
      }
      if (e.key === "Escape") {
        close();
      }
    });
  }
  async _deleteAlbumImage(image) {
    const confirmed = await window.customDialog?.confirm(
      window.I18n?.t("albums.deleteImageConfirm", { name: image.name }) ||
        `Are you sure you want to delete image "${image.name}"?`,
      {
        title: window.I18n?.t("albums.deleteImage") || "Delete image",
        type: "warning",
        confirmText: window.I18n?.t("common.delete") || "Delete",
        cancelText: window.I18n?.t("common.cancel") || "Cancel",
      },
    );
    if (confirmed && window.ImageStore) {
      await window.ImageStore.deleteImage(image.id);
      this._viewImages = this._viewImages.filter((img) => img.id !== image.id);
      this.refresh();
    }
  }
  _openAlbumImagePreview(image) {
    const index = this._viewImages.findIndex((img) => img.id === image.id);
    if (index === -1) return;
    this._currentPreviewIndex = index;
    this._showAlbumPreviewModal();
  }
  async _showAlbumPreviewModal() {
    let modal = document.getElementById("albumImagePreviewModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "albumImagePreviewModal";
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
          <div class="flow-image-preview-content">
            <img src="" alt="" class="flow-image-preview-img" />
          </div>
          <button class="flow-image-preview-nav flow-image-preview-next" title="${window.I18n?.t("common.next") || "Sau"}">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
          <div class="flow-image-preview-footer">
            <span class="flow-image-preview-name"></span>
            <span class="flow-image-preview-counter"></span>
            <div class="flow-image-preview-actions">
              <button class="flow-image-preview-action" data-action="use" title="${window.I18n?.t("albums.use") || "Use"}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="9 11 12 14 22 4"/>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                </svg>
                <span>${window.I18n?.t("albums.use") || "Use"}</span>
              </button>
              <button class="flow-image-preview-action flow-image-preview-action--danger" data-action="delete" title="${window.I18n?.t("common.delete") || "Delete"}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                <span>${window.I18n?.t("common.delete") || "Delete"}</span>
              </button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      this._bindAlbumPreviewEvents(modal);
    }
    await this._updateAlbumPreviewContent();
    modal.classList.add("active");
    document.body.style.overflow = "hidden";
  }
  _bindAlbumPreviewEvents(modal) {
    const backdrop = modal.querySelector(".flow-image-preview-backdrop");
    const closeBtn = modal.querySelector(".flow-image-preview-close");
    const prevBtn = modal.querySelector(".flow-image-preview-prev");
    const nextBtn = modal.querySelector(".flow-image-preview-next");
    const useBtn = modal.querySelector(
      '.flow-image-preview-action[data-action="use"]',
    );
    const deleteBtn = modal.querySelector(
      '.flow-image-preview-action[data-action="delete"]',
    );
    backdrop.addEventListener("click", () => this._closeAlbumPreview());
    closeBtn.addEventListener("click", () => this._closeAlbumPreview());
    prevBtn.addEventListener("click", () => this._navigateAlbumPreview(-1));
    nextBtn.addEventListener("click", () => this._navigateAlbumPreview(1));
    useBtn.addEventListener("click", () => {
      const image = this._viewImages[this._currentPreviewIndex];
      if (image) this._useAlbumImage(image);
      this._closeAlbumPreview();
    });
    deleteBtn.addEventListener("click", async () => {
      const image = this._viewImages[this._currentPreviewIndex];
      if (image) {
        this._closeAlbumPreview();
        await this._deleteAlbumImage(image);
      }
    });
    this._albumPreviewKeyHandler = (e) => {
      if (!modal.classList.contains("active")) return;
      if (e.key === "Escape") this._closeAlbumPreview();
      if (e.key === "ArrowLeft") this._navigateAlbumPreview(-1);
      if (e.key === "ArrowRight") this._navigateAlbumPreview(1);
    };
    document.addEventListener("keydown", this._albumPreviewKeyHandler);
  }
  _closeAlbumPreview() {
    const modal = document.getElementById("albumImagePreviewModal");
    if (modal) {
      modal.classList.remove("active");
      document.body.style.overflow = "";
    }
    this._currentPreviewIndex = -1;
  }
  async _navigateAlbumPreview(direction) {
    const newIndex = this._currentPreviewIndex + direction;
    if (newIndex < 0 || newIndex >= this._viewImages.length) return;
    this._currentPreviewIndex = newIndex;
    await this._updateAlbumPreviewContent();
  }
  async _updateAlbumPreviewContent() {
    const modal = document.getElementById("albumImagePreviewModal");
    if (!modal || this._currentPreviewIndex < 0) return;
    const image = this._viewImages[this._currentPreviewIndex];
    if (!image) return;
    const imgEl = modal.querySelector(".flow-image-preview-img");
    const nameEl = modal.querySelector(".flow-image-preview-name");
    const counterEl = modal.querySelector(".flow-image-preview-counter");
    const prevBtn = modal.querySelector(".flow-image-preview-prev");
    const nextBtn = modal.querySelector(".flow-image-preview-next");
    let imgUrl = "";
    if (window.ImageStore) {
      imgUrl = await window.ImageStore.getFullImage(image.id);
    }
    if (!imgUrl && image.thumbnail_url?.startsWith("http")) {
      imgUrl = image.thumbnail_url.split("=")[0];
    }
    imgEl.src = imgUrl || "";
    imgEl.alt = image.name || "";
    nameEl.textContent = image.name || "Unnamed";
    counterEl.textContent = `${this._currentPreviewIndex + 1} / ${this._viewImages.length}`;
    prevBtn.style.display = this._currentPreviewIndex > 0 ? "" : "none";
    nextBtn.style.display =
      this._currentPreviewIndex < this._viewImages.length - 1 ? "" : "none";
  }
  async refresh() {
    await this.loadAlbums();
    if (this._viewingAlbumId) {
      if (window.ImageStore) {
        this._viewImages = await window.ImageStore.getAlbumImages(
          this._viewingAlbumId,
        );
      }
    }
    this.render();
    await this._refreshRegistry();
  }
  async _refreshRegistry() {
    if (window.imageNameRegistry) {
      await window.imageNameRegistry.refreshFromSources();
      if (window.eventBus) {
        window.eventBus.emit("registry:refreshed");
      }
    }
  }
  _formatTimeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 6e4);
    const hours = Math.floor(diff / 36e5);
    const days = Math.floor(diff / 864e5);
    if (minutes < 1) return window.I18n?.t("history.justNow") || "Just now";
    if (minutes < 60)
      return (
        window.I18n?.t("albums.minutesAgo", { count: minutes }) ||
        `${minutes} minutes ago`
      );
    if (hours < 24)
      return (
        window.I18n?.t("albums.hoursAgo", { count: hours }) ||
        `${hours} hours ago`
      );
    return (
      window.I18n?.t("albums.daysAgo", { count: days }) || `${days} days ago`
    );
  }
  _escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
window.AlbumList = AlbumList;
