(function () {
  "use strict";
  class AlbumCreateModal {
    constructor() {
      this._overlay = null;
      this._onSuccess = null;
      this._selectedImages = [];
    }
    show(onSuccess = null) {
      this._onSuccess = onSuccess;
      this._selectedImages = [];
      this._render();
      this._bindEvents();
    }
    close() {
      if (this._overlay) {
        this._overlay.remove();
        this._overlay = null;
      }
      if (this._escHandler) {
        document.removeEventListener("keydown", this._escHandler);
        this._escHandler = null;
      }
      this._selectedImages = [];
    }
    _render() {
      this.close();
      this._overlay = document.createElement("div");
      this._overlay.className = "album-modal-overlay";
      this._overlay.innerHTML = `
        <div class="album-modal">
          <div class="album-modal-header">
            <div class="album-modal-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
              ${window.I18n?.t("albums.createAlbum") || "Create new album"}
            </div>
            <button class="album-modal-close" id="albumModalClose">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <div class="album-modal-body">
            <div class="album-form-group">
              <label class="album-form-label" for="albumNameInput">${window.I18n?.t("albums.albumName") || "Album name"}</label>
              <input type="text" id="albumNameInput" class="album-form-input"
                placeholder="${window.I18n?.t("albums.namePlaceholder") || "Enter album name..."}" maxlength="100" autofocus />
              <p class="album-form-hint">${window.I18n?.t("albums.nameHint") || "Name it for easy search and management."}</p>
            </div>

            <!-- S9.2: Image selection section -->
            <div class="album-form-group">
              <label class="album-form-label">${window.I18n?.t("albums.addImages") || "Add images (optional)"}</label>
              <!-- Action buttons row - similar to tab_gen style -->
              <div class="album-create-action-row">
                <button class="btn-album-upload" id="albumUploadBtn" title="${window.I18n?.t("albums.uploadTooltip") || "Select images from library or drag & drop files"}">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                  <span>${window.I18n?.t("albums.uploadBtn") || "Upload images"}</span>
                </button>
                <button class="btn-album-capture" id="albumCaptureBtn" title="${window.I18n?.t("albums.captureTooltip") || "Capture screen"}">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                    <circle cx="12" cy="13" r="4"></circle>
                  </svg>
                </button>
              </div>
              <!-- Images preview -->
              <div class="album-create-images-zone" id="albumCreateImagesZone">
                <div class="album-create-images-empty" id="albumCreateImagesEmpty">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                  </svg>
                  <span>${window.I18n?.t("albums.noImagesSelected") || "No images selected"}</span>
                </div>
                <div class="album-create-images-grid" id="albumCreateImagesGrid" style="display: none;"></div>
              </div>
              <p class="album-form-hint">${window.I18n?.t("albums.canAddLater") || "You can add images after creating the album."}</p>
            </div>
          </div>

          <div class="album-modal-footer">
            <button class="btn btn-secondary" id="albumCancelBtn">${window.I18n?.t("common.cancel") || "Cancel"}</button>
            <button class="btn btn-primary" id="albumCreateSubmitBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              ${window.I18n?.t("albums.createBtn") || "Create album"}
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(this._overlay);
      setTimeout(() => {
        const input = this._overlay.querySelector("#albumNameInput");
        input?.focus();
      }, 100);
    }
    _bindEvents() {
      if (!this._overlay) return;
      this._overlay
        .querySelector("#albumModalClose")
        ?.addEventListener("click", () => this.close());
      this._overlay
        .querySelector("#albumCancelBtn")
        ?.addEventListener("click", () => this.close());
      this._overlay.addEventListener("click", (e) => {
        if (e.target === this._overlay) this.close();
      });
      this._escHandler = (e) => {
        if (e.key === "Escape") {
          this.close();
        }
      };
      document.addEventListener("keydown", this._escHandler);
      const submitBtn = this._overlay.querySelector("#albumCreateSubmitBtn");
      const nameInput = this._overlay.querySelector("#albumNameInput");
      submitBtn?.addEventListener("click", () => this._handleSubmit());
      nameInput?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this._handleSubmit();
        }
      });
      ["mousedown", "mouseup", "pointerdown", "pointerup"].forEach((evt) => {
        this._overlay.addEventListener(evt, (e) => e.stopPropagation());
      });
      const uploadBtn = this._overlay.querySelector("#albumUploadBtn");
      uploadBtn?.addEventListener("click", () => this._openImagePicker());
      const captureBtn = this._overlay.querySelector("#albumCaptureBtn");
      captureBtn?.addEventListener("click", () => this._startCapture());
    }
    _startCapture() {
      const modalContent = this._overlay?.querySelector(".album-modal");
      if (modalContent) {
        modalContent.style.display = "none";
      }
      if (window.eventBus) {
        const handler = (data) => {
          window.eventBus.off("capture:complete", handler);
          if (modalContent) {
            modalContent.style.display = "";
          }
          if (data?.fileId && data?.thumbnail) {
            this._addSelectedImages([
              {
                fileId: data.fileId,
                thumbnail: data.thumbnail,
                name: `capture_${Date.now()}`,
                fileName: null,
              },
            ]);
          }
        };
        window.eventBus.on("capture:complete", handler);
        window.eventBus.emit("capture:start", { source: "album_create" });
      }
    }
    _openImagePicker() {
      if (!window.ImagePickerModal) {
        console.warn("[AlbumCreateModal] ImagePickerModal not available");
        return;
      }
      const modal = new window.ImagePickerModal();
      modal.open({
        multiple: true,
        onConfirm: (selectedImages) => {
          this._addSelectedImages(selectedImages);
        },
      });
    }
    _addSelectedImages(images) {
      if (!images || !Array.isArray(images)) return;
      for (const img of images) {
        const exists = this._selectedImages.some(
          (i) => i.fileId === img.fileId,
        );
        if (!exists && img.fileId) {
          this._selectedImages.push({
            fileId: img.fileId,
            thumbnail: img.thumbnail || img.thumbnailUrl || null,
            name: img.name || null,
            file_name: img.file_name || img.fileName || null,
            source: img.source || "flow",
            file: img.file || null,
          });
        }
      }
      this._renderSelectedImages();
    }
    _renderSelectedImages() {
      const emptyEl = this._overlay?.querySelector("#albumCreateImagesEmpty");
      const gridEl = this._overlay?.querySelector("#albumCreateImagesGrid");
      if (!emptyEl || !gridEl) return;
      if (this._selectedImages.length === 0) {
        emptyEl.style.display = "flex";
        gridEl.style.display = "none";
        return;
      }
      emptyEl.style.display = "none";
      gridEl.style.display = "grid";
      gridEl.innerHTML = this._selectedImages
        .map(
          (img, idx) => `
        <div class="album-create-image-item" data-index="${idx}">
          <img src="${img.thumbnail || ""}" alt="" class="album-create-image-thumb" />
          <button class="album-create-image-remove" data-index="${idx}" title="${window.I18n?.t("common.delete") || "Delete"}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      `,
        )
        .join("");
      gridEl.querySelectorAll(".album-create-image-remove").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.dataset.index, 10);
          this._selectedImages.splice(idx, 1);
          this._renderSelectedImages();
        });
      });
    }
    async _handleSubmit() {
      const nameInput = this._overlay?.querySelector("#albumNameInput");
      const name = nameInput?.value?.trim();
      if (!name) {
        nameInput?.focus();
        this._showError(
          nameInput,
          window.I18n?.t("albums.pleaseEnterName") || "Please enter album name",
        );
        return;
      }
      if (window.AlbumStore) {
        const albums = await window.AlbumStore.getAlbums();
        const exists = albums.some(
          (a) => a.name.toLowerCase() === name.toLowerCase(),
        );
        if (exists) {
          this._showError(
            nameInput,
            window.I18n?.t("albums.nameExists") || "Album name already exists",
          );
          return;
        }
      }
      try {
        const submitBtn = this._overlay?.querySelector("#albumCreateSubmitBtn");
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 6v6l4 2"></path>
            </svg>
            ${window.I18n?.t("albums.creating") || "Creating..."}
          `;
        }
        const album = await window.AlbumStore?.createAlbum(name);
        if (album && this._selectedImages.length > 0 && window.ImageStore) {
          const usedNames = new Set();
          for (const img of this._selectedImages) {
            try {
              const isLocalUpload = img.source === "upload";
              let thumbnailBlob = null;
              let fullBlob = null;
              if (isLocalUpload && img.file instanceof Blob) {
                fullBlob = img.file;
                try {
                  thumbnailBlob = await window.ImageStore.compressThumbnail(
                    img.file,
                  );
                } catch (e) {
                  console.warn(
                    "[AlbumCreateModal] Thumbnail compression failed:",
                    e.message,
                  );
                }
              } else if (img.thumbnail) {
                const thumbResponse = await fetch(img.thumbnail);
                const thumbBlob = await thumbResponse.blob();
                thumbnailBlob =
                  await window.ImageStore.compressThumbnail(thumbBlob);
              }
              let baseName = (img.name || this._generateImageName(img))
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
                type: isLocalUpload ? "upload" : "flow",
                file_id: img.fileId,
                file_name: img.fileName || null,
                thumbnail_url: img.thumbnail || null,
              };
              await window.ImageStore.addImage(
                album.id,
                imageData,
                thumbnailBlob,
                fullBlob,
              );
            } catch (imgErr) {
              console.warn(
                "[AlbumCreateModal] L\u1ED7i th\xEAm \u1EA3nh:",
                imgErr.message,
              );
            }
          }
        }
        this.close();
        if (this._onSuccess) {
          this._onSuccess();
        }
        const message =
          window.I18n?.t("albums.successMsg", { name }) ||
          `Album "${name}" was created successfully.`;
        const successTitle = window.I18n?.t("albums.successTitle") || "Success";
        if (window.customDialog) {
          window.customDialog.alert(message, {
            title: successTitle,
            type: "success",
          });
        }
      } catch (err) {
        console.error("[AlbumCreateModal] Create error:", err);
        this._showError(
          nameInput,
          window.I18n?.t("albums.errorMsg") ||
            "Could not create album. Please try again.",
        );
        const submitBtn = this._overlay?.querySelector("#albumCreateSubmitBtn");
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            ${window.I18n?.t("albums.createBtn") || "Create album"}
          `;
        }
      }
    }
    _generateImageName(img) {
      if (img.name) return img.name;
      if (img.file_name)
        return img.file_name.replace(/\.[^.]+$/, "").slice(0, 30);
      return "image_" + Date.now().toString(36);
    }
    _showError(inputEl, message) {
      const existingError = this._overlay?.querySelector(".album-form-error");
      existingError?.remove();
      const errorEl = document.createElement("p");
      errorEl.className = "album-form-error";
      errorEl.textContent = message;
      inputEl?.parentElement?.appendChild(errorEl);
      inputEl?.classList.add("album-input-error");
      inputEl?.addEventListener(
        "input",
        () => {
          errorEl.remove();
          inputEl.classList.remove("album-input-error");
        },
        { once: true },
      );
    }
  }
  window.AlbumCreateModal = new AlbumCreateModal();
})();
