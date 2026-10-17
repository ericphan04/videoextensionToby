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
class SaveTemplateModal {
  static async show(workflowData) {
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    if (!window.featureGate?.canManageWorkflowTemplates()) {
      window.showNotification?.(
        t(
          "workflow.adminRequired",
          "Admin permission required for this action",
        ),
        "error",
      );
      return null;
    }
    this._close();
    this._selectedThumbnail = null;
    await this._fetchCategories();
    return new Promise((resolve) => {
      const modal = this._createModal(workflowData);
      document.body.appendChild(modal);
      this._instance = modal;
      this._bindEvents(modal, workflowData, resolve);
      requestAnimationFrame(() => {
        modal.classList.add("visible");
        const nameInput = modal.querySelector("#saveTemplateName");
        nameInput?.focus();
      });
    });
  }
  static _close() {
    if (this._instance) {
      this._instance.classList.remove("visible");
      setTimeout(() => {
        this._instance?.remove();
        this._instance = null;
      }, 200);
    }
  }
  static async _fetchCategories() {
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            action: "apiRequest",
            method: "GET",
            endpoint: "workflow-templates/categories",
          },
          (resp) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (resp?.success && resp?.data) {
              resolve(resp.data);
            } else {
              reject(
                new Error(resp?.error?.message || "Failed to load categories"),
              );
            }
          },
        );
      });
      this._categories = response.categories || response || [];
    } catch (err) {
      console.warn(
        "[SaveTemplateModal] L\u1ED7i fetch categories:",
        err.message,
      );
      this._categories = [];
    }
  }
  static _createModal(workflowData) {
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    const defaultName = workflowData.wf_name || "Workflow Template";
    const defaultDesc = workflowData.description || "";
    const categoryOptions = this._categories
      .map(
        (cat) =>
          `<option value="${cat.id}">${this._escapeHtml(cat.name)}</option>`,
      )
      .join("");
    const modal = document.createElement("div");
    modal.className = "save-template-modal";
    modal.innerHTML = `
      <div class="save-template-backdrop"></div>
      <div class="save-template-content">
        <div class="save-template-header">
          <h3>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
            ${t("workflow.saveTemplate.title", "Save Workflow Template")}
          </h3>
          <button class="save-template-close" type="button" aria-label="${t("common.close", "Close")}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="save-template-body">
          <!-- T\xEAn template -->
          <div class="save-template-field">
            <label for="saveTemplateName">${t("workflow.saveTemplate.nameLabel", "Template Name")} <span class="required">*</span></label>
            <input type="text"
                   id="saveTemplateName"
                   value="${this._escapeAttr(defaultName)}"
                   placeholder="${t("workflow.saveTemplate.namePlaceholder", "Enter template name...")}"
                   required
                   maxlength="100" />
          </div>

          <!-- M\xF4 t\u1EA3 -->
          <div class="save-template-field">
            <label for="saveTemplateDesc">${t("workflow.saveTemplate.descriptionLabel", "Description")}</label>
            <textarea id="saveTemplateDesc"
                      rows="3"
                      placeholder="${t("workflow.saveTemplate.descriptionPlaceholder", "Brief description of this template...")}"
                      maxlength="500">${this._escapeHtml(defaultDesc)}</textarea>
          </div>

          <!-- Danh m\u1EE5c -->
          <div class="save-template-field">
            <label for="saveTemplateCategory">${t("workflow.saveTemplate.categoryLabel", "Category")}</label>
            <select id="saveTemplateCategory">
              <option value="">${t("workflow.saveTemplate.selectCategory", "-- Select category --")}</option>
              ${categoryOptions}
            </select>
          </div>

          <!-- Thumbnail -->
          <div class="save-template-field">
            <label>${t("workflow.saveTemplate.thumbnailLabel", "Thumbnail Image")}</label>
            <div class="save-template-thumbnail-picker" id="saveTemplateThumbnailPicker">
              <div class="thumbnail-preview" id="saveTemplateThumbnailPreview">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                <span>${t("workflow.saveTemplate.clickToSelect", "Click to select image")}</span>
              </div>
              <button type="button" class="thumbnail-remove hidden" id="saveTemplateThumbnailRemove" title="${t("workflow.saveTemplate.removeThumbnail", "Remove image")}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <span class="save-template-hint">${t("workflow.saveTemplate.thumbnailSizeHint", "Recommended: 640\xD7360px or 1280\xD7720px (16:9 ratio)")}</span>
          </div>

          <!-- Video Demo URL -->
          <div class="save-template-field">
            <label for="saveTemplateVideoUrl">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="color: #ff0000; vertical-align: middle; margin-right: 4px;">
                <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/>
              </svg>
              ${t("workflow.saveTemplate.videoUrlLabel", "Video Demo (YouTube)")}
            </label>
            <input type="url"
                   id="saveTemplateVideoUrl"
                   placeholder="${t("workflow.saveTemplate.videoUrlPlaceholder", "https://www.youtube.com/watch?v=...")}"
                   maxlength="500" />
            <span class="save-template-hint">${t("workflow.saveTemplate.videoUrlHint", "Link video YouTube demo template")}</span>
          </div>

          <!-- Active, Premium & Featured -->
          <div class="save-template-toggles">
            <label class="save-template-toggle">
              <input type="checkbox" id="saveTemplateActive" checked />
              <span class="toggle-track"><span class="toggle-thumb"></span></span>
              <span class="toggle-label">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="9 12 12 15 16 10"/>
                </svg>
                ${t("workflow.saveTemplate.publishNow", "Publish ngay")}
              </span>
            </label>

            <label class="save-template-toggle">
              <input type="checkbox" id="saveTemplatePremium" />
              <span class="toggle-track"><span class="toggle-thumb"></span></span>
              <span class="toggle-label">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z"/>
                </svg>
                ${t("workflow.saveTemplate.premiumTemplate", "Premium Template")}
              </span>
            </label>

            <label class="save-template-toggle">
              <input type="checkbox" id="saveTemplateFeatured" />
              <span class="toggle-track"><span class="toggle-thumb"></span></span>
              <span class="toggle-label">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                ${t("workflow.saveTemplate.featured", "Featured")}
              </span>
            </label>
          </div>

          <!-- Th\xF4ng b\xE1o l\u1ED7i -->
          <div class="save-template-error hidden" id="saveTemplateError">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span id="saveTemplateErrorText"></span>
          </div>
        </div>

        <div class="save-template-footer">
          <button class="btn btn-secondary" type="button" id="saveTemplateCancelBtn">${t("common.cancel", "Cancel")}</button>
          <button class="btn btn-primary" type="button" id="saveTemplateSaveBtn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
            ${t("workflow.saveTemplate.save", "Save Template")}
          </button>
        </div>
      </div>
    `;
    return modal;
  }
  static _bindEvents(modal, workflowData, resolve) {
    const closeBtn = modal.querySelector(".save-template-close");
    const cancelBtn = modal.querySelector("#saveTemplateCancelBtn");
    const saveBtn = modal.querySelector("#saveTemplateSaveBtn");
    const backdrop = modal.querySelector(".save-template-backdrop");
    const thumbnailPicker = modal.querySelector("#saveTemplateThumbnailPicker");
    const thumbnailRemove = modal.querySelector("#saveTemplateThumbnailRemove");
    const handleClose = () => {
      this._close();
      resolve(null);
    };
    closeBtn?.addEventListener("click", handleClose);
    cancelBtn?.addEventListener("click", handleClose);
    backdrop?.addEventListener("click", handleClose);
    const handleKeydown = (e) => {
      if (e.key === "Escape") {
        handleClose();
        document.removeEventListener("keydown", handleKeydown);
      }
    };
    document.addEventListener("keydown", handleKeydown);
    thumbnailPicker?.addEventListener("click", (e) => {
      if (e.target.closest(".thumbnail-remove")) return;
      if (window.WorkflowMediaModal) {
        window.WorkflowMediaModal.show({
          type: "thumbnail",
          multiple: false,
          preselected: this._selectedThumbnail ? [this._selectedThumbnail] : [],
          onSelect: (url) => {
            this._selectedThumbnail = url;
            this._updateThumbnailPreview(modal, url);
          },
        });
      } else {
        console.warn(
          "[SaveTemplateModal] WorkflowMediaModal ch\u01B0a s\u1EB5n s\xE0ng",
        );
      }
    });
    thumbnailRemove?.addEventListener("click", (e) => {
      e.stopPropagation();
      this._selectedThumbnail = null;
      this._updateThumbnailPreview(modal, null);
    });
    saveBtn?.addEventListener("click", async () => {
      await this._handleSave(modal, workflowData, resolve);
    });
    const nameInput = modal.querySelector("#saveTemplateName");
    nameInput?.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        await this._handleSave(modal, workflowData, resolve);
      }
    });
  }
  static _updateThumbnailPreview(modal, url) {
    const preview = modal.querySelector("#saveTemplateThumbnailPreview");
    const removeBtn = modal.querySelector("#saveTemplateThumbnailRemove");
    if (url) {
      preview.innerHTML = `<img src="${this._escapeAttr(url)}" alt="Thumbnail" />`;
      preview.classList.add("has-image");
      removeBtn?.classList.remove("hidden");
    } else {
      const clickToSelectText =
        window.I18n?.t("workflow.saveTemplate.clickToSelect") ||
        "Click to select image";
      preview.innerHTML = `
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        <span>${clickToSelectText}</span>
      `;
      preview.classList.remove("has-image");
      removeBtn?.classList.add("hidden");
    }
  }
  static async _handleSave(modal, workflowData, resolve) {
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    const nameInput = modal.querySelector("#saveTemplateName");
    const descInput = modal.querySelector("#saveTemplateDesc");
    const categorySelect = modal.querySelector("#saveTemplateCategory");
    const videoUrlInput = modal.querySelector("#saveTemplateVideoUrl");
    const activeCheckbox = modal.querySelector("#saveTemplateActive");
    const premiumCheckbox = modal.querySelector("#saveTemplatePremium");
    const featuredCheckbox = modal.querySelector("#saveTemplateFeatured");
    const saveBtn = modal.querySelector("#saveTemplateSaveBtn");
    const name = nameInput?.value?.trim();
    if (!name) {
      this._showError(
        modal,
        t("workflow.saveTemplate.nameRequired", "Please enter template name"),
      );
      nameInput?.focus();
      return;
    }
    saveBtn.disabled = true;
    const updateProgress = (text) => {
      saveBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
          <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
        </svg>
        ${text}
      `;
    };
    updateProgress(t("workflow.saveTemplate.saving", "Saving..."));
    try {
      updateProgress(
        t("workflow.saveTemplate.uploadingImages", "Uploading images..."),
      );
      const urlMapping = await this._uploadLocalImages(
        workflowData,
        (current, total) => {
          updateProgress(
            `${t("workflow.saveTemplate.uploadingImages", "Uploading images...")} ${current}/${total}...`,
          );
        },
      );
      updateProgress(t("workflow.saveTemplate.saving", "Saving..."));
      console.log("[SaveTemplateModal] Checkbox states:", {
        activeCheckbox_found: !!activeCheckbox,
        activeCheckbox_checked: activeCheckbox?.checked,
        premiumCheckbox_checked: premiumCheckbox?.checked,
        featuredCheckbox_checked: featuredCheckbox?.checked,
      });
      const templateData = this._convertToTemplateFormat(
        workflowData,
        {
          name,
          description: descInput?.value?.trim() || "",
          category_id: categorySelect?.value
            ? parseInt(categorySelect.value, 10)
            : null,
          thumbnail_url: this._selectedThumbnail || null,
          video_url: videoUrlInput?.value?.trim() || null,
          is_active: activeCheckbox?.checked || false,
          is_premium: premiumCheckbox?.checked || false,
          is_featured: featuredCheckbox?.checked || false,
        },
        urlMapping,
      );
      console.log("[SaveTemplateModal] Template data to send:", {
        name: templateData.name,
        is_active: templateData.is_active,
        is_premium: templateData.is_premium,
        nodes_count: templateData.nodes?.length,
      });
      const result = await this._saveTemplate(templateData);
      console.log("[SaveTemplateModal] API result:", result);
      this._close();
      const isActive = result?.is_active || false;
      const successMsg = isActive
        ? t("workflow.saveTemplate.success", "Template saved successfully")
        : t(
            "workflow.saveTemplate.successInactive",
            "Template saved. Enable Active in Admin to show it.",
          );
      console.log(
        "[SaveTemplateModal] \u2713 Template saved:",
        result?.id || result?.name,
        isActive ? "(active)" : "(inactive)",
      );
      if (typeof window.showNotification === "function") {
        window.showNotification(successMsg, "success", 4e3);
      }
      if (typeof window.WorkflowEditor?._showToast === "function") {
        window.WorkflowEditor._showToast(successMsg, "success");
      }
      window.eventBus?.emit("template:created", result);
      resolve({ success: true, template: result });
    } catch (err) {
      console.error("[SaveTemplateModal] L\u1ED7i l\u01B0u template:", err);
      this._showError(
        modal,
        err.message ||
          t("workflow.saveTemplate.error", "Failed to save template"),
      );
      saveBtn.disabled = false;
      saveBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
        ${t("workflow.saveTemplate.save", "Save Template")}
      `;
    }
  }
  static async _uploadLocalImages(workflowData, onProgress) {
    const urlMapping = new Map();
    const localUrls = new Map();
    const addUrl = (url, provenance = null) => {
      if (url && !localUrls.has(url)) localUrls.set(url, provenance);
    };
    const allRefUrls = [];
    for (const node of workflowData.nodes || []) {
      if (node.ref_thumbnails && typeof node.ref_thumbnails === "object") {
        for (const entry of Object.values(node.ref_thumbnails)) {
          const url =
            typeof entry === "string"
              ? entry
              : entry?.thumbnail || entry?.video_url;
          allRefUrls.push({
            node_id: node.node_id,
            url,
            type: "ref_thumbnail",
          });
          if (this._needsUpload(url)) {
            addUrl(url);
          }
        }
      }
      if (node.result_img_url && this._needsUpload(node.result_img_url)) {
        addUrl(node.result_img_url);
      }
      if (node.frame_1_thumbnail && this._needsUpload(node.frame_1_thumbnail)) {
        addUrl(node.frame_1_thumbnail);
      }
      if (node.frame_2_thumbnail && this._needsUpload(node.frame_2_thumbnail)) {
        addUrl(node.frame_2_thumbnail);
      }
      if (
        node.result_thumbnails &&
        typeof node.result_thumbnails === "object"
      ) {
        for (const [fid, entry] of Object.entries(node.result_thumbnails)) {
          if (!entry || typeof entry !== "object") continue;
          const provenance = node.result_provider_urls?.[fid];
          for (const url of [entry.thumbnail, entry.video_url]) {
            if (
              url &&
              (this._needsUpload(url) || provenance?.provider === "gemini")
            )
              addUrl(url, provenance);
          }
        }
      }
    }
    console.log(
      "[SaveTemplateModal] All ref URLs found:",
      allRefUrls.length,
      allRefUrls,
    );
    console.log("[SaveTemplateModal] All ref URLs found in nodes:", allRefUrls);
    console.log(
      "[SaveTemplateModal] URLs to upload (local + Flow):",
      localUrls.size,
      [...localUrls.keys()].map((u) => u.substring(0, 80)),
    );
    if (localUrls.size === 0) {
      console.log(
        "[SaveTemplateModal] No URLs need upload - all are public CDN URLs or no ref images found",
      );
      return urlMapping;
    }
    console.log(
      "[SaveTemplateModal] Starting upload for",
      localUrls.size,
      "images...",
    );
    let current = 0;
    const total = localUrls.size;
    for (const [localUrl, provenance] of localUrls) {
      current++;
      onProgress?.(current, total);
      try {
        const serverUrl = await this._uploadLocalUrl(localUrl, provenance);
        if (serverUrl) {
          urlMapping.set(localUrl, serverUrl);
          console.log(
            "[SaveTemplateModal] Uploaded:",
            localUrl.substring(0, 50),
            "\u2192",
            serverUrl,
          );
        }
      } catch (err) {
        console.warn(
          "[SaveTemplateModal] Failed to upload:",
          localUrl.substring(0, 50),
          err.message,
        );
      }
    }
    return urlMapping;
  }
  static _isLocalUrl(url) {
    if (!url || typeof url !== "string") return false;
    return url.startsWith("blob:") || url.startsWith("data:");
  }
  static _isFlowUrl(url) {
    if (!url || typeof url !== "string") return false;
    const flowDomains = [
      "labs.google",
      "flow.google",
      "flow-content.google",
      "uxlfoundation.org",
    ];
    return flowDomains.some((domain) => url.includes(domain));
  }
  static _isChatGPTOrGrokUrl(url) {
    if (!url || typeof url !== "string") return false;
    const domains = [
      "chatgpt.com",
      "oaiusercontent.com",
      "sandboxed.openai.com",
      "grok.com",
      "x.ai",
    ];
    return domains.some((domain) => url.includes(domain));
  }
  static _needsUpload(url) {
    return (
      this._isLocalUrl(url) ||
      this._isFlowUrl(url) ||
      this._isChatGPTOrGrokUrl(url)
    );
  }
  static async _uploadLocalUrl(localUrl, provenance = null) {
    let base64, mimeType, fileName;
    if (localUrl.startsWith("data:")) {
      const match = localUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return null;
      mimeType = match[1];
      base64 = match[2];
      const ext = mimeType.split("/")[1] || "png";
      fileName = `upload_${Date.now()}.${ext}`;
    } else if (localUrl.startsWith("blob:")) {
      try {
        const resp = await window.MessageBridge?.sendToContentScript(
          "fetchImageAsBase64",
          { url: localUrl },
        );
        if (!resp?.success || !resp.base64) {
          const directResult = await this._fetchBlobDirect(localUrl);
          if (!directResult) return null;
          base64 = directResult.base64;
          mimeType = directResult.mimeType;
        } else {
          base64 = resp.base64;
          mimeType = resp.mimeType || "image/png";
        }
      } catch (err) {
        console.warn(
          "[SaveTemplateModal] MessageBridge fetch failed:",
          err.message,
        );
        const directResult = await this._fetchBlobDirect(localUrl);
        if (!directResult) return null;
        base64 = directResult.base64;
        mimeType = directResult.mimeType;
      }
      const ext = mimeType?.split("/")[1] || "png";
      fileName = `upload_${Date.now()}.${ext}`;
    } else if (this._isFlowUrl(localUrl)) {
      console.log(
        "[SaveTemplateModal] Fetching Flow URL:",
        localUrl.substring(0, 80),
      );
      try {
        const resp = await window.MessageBridge?.sendToContentScript(
          "fetchImageAsBase64",
          { url: localUrl },
        );
        if (resp?.success && resp.base64) {
          base64 = resp.base64;
          mimeType = resp.mimeType || "image/jpeg";
        } else {
          const bgResult = await this._fetchFlowUrlViaBackground(localUrl);
          if (!bgResult) {
            console.warn(
              "[SaveTemplateModal] Failed to fetch Flow URL:",
              localUrl.substring(0, 80),
            );
            return null;
          }
          base64 = bgResult.base64;
          mimeType = bgResult.mimeType;
        }
      } catch (err) {
        console.warn("[SaveTemplateModal] Flow URL fetch failed:", err.message);
        return null;
      }
      const ext = mimeType?.split("/")[1] || "jpg";
      fileName = `flow_${Date.now()}.${ext}`;
    } else if (
      provenance?.provider === "gemini" &&
      provenance?.tab_id &&
      window.MessageBridge?.geminiFetchMedia
    ) {
      const mediaKind = provenance.media_type === "video" ? "video" : "image";
      const monitor = window.ProviderConfigManager?.getApiConfigValueSync?.(
        "gemini",
        "generation_monitor",
      )?.[mediaKind];
      const maxBytes = Number(monitor?.max_materialized_bytes);
      if (!Number.isFinite(maxBytes) || maxBytes <= 0) return null;
      const fetched = await window.MessageBridge.geminiFetchMedia(
        localUrl,
        provenance.tab_id,
        maxBytes,
      );
      if (!fetched?.success || !fetched.base64) return null;
      base64 = fetched.base64;
      mimeType =
        fetched.mimeType ||
        fetched.contentType ||
        (mediaKind === "video" ? "video/mp4" : "image/png");
      fileName = `gemini_${Date.now()}.${mimeType.split("/")[1] || "bin"}`;
    } else if (this._isChatGPTOrGrokUrl(localUrl)) {
      console.log(
        "[SaveTemplateModal] Fetching ChatGPT/Grok URL:",
        localUrl.substring(0, 80),
      );
      const resp = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: "creator:fetchImage", url: localUrl },
          (r) => {
            if (chrome.runtime.lastError) {
              resolve(null);
              return;
            }
            resolve(r);
          },
        );
      });
      if (!resp?.success || !resp.base64) {
        console.warn(
          "[SaveTemplateModal] Failed to fetch ChatGPT/Grok URL (tab provider c\xF2n m\u1EDF?):",
          localUrl.substring(0, 80),
        );
        return null;
      }
      base64 = resp.base64;
      mimeType = resp.mime || resp.mimeType || "image/jpeg";
      const ext = mimeType?.split("/")[1] || "jpg";
      fileName = `provider_${Date.now()}.${ext}`;
    } else {
      return null;
    }
    if (!base64) return null;
    if (typeof base64 === "string" && base64.startsWith("data:")) {
      const idx = base64.indexOf(",");
      if (idx !== -1) base64 = base64.substring(idx + 1);
    }
    const _isVid =
      typeof mimeType === "string" && mimeType.startsWith("video/");
    if (window.WatermarkClient && !_isVid) {
      try {
        const cl = await window.WatermarkClient.cleanBase64(
          base64,
          mimeType || "image/png",
          "image",
        );
        if (cl.cleaned) {
          base64 = cl.base64;
          mimeType = cl.mime || mimeType;
        }
      } catch (e) {
        console.warn(
          "[SaveTemplateModal] b\u1ECF qua xo\xE1 watermark:",
          e?.message,
        );
      }
    }
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          action: "apiRequest",
          method: "POST",
          endpoint: "admin/media/upload",
          token: window.authManager?.getToken(),
          isFormData: true,
          formDataFields: {
            file: { name: fileName, type: mimeType, base64 },
            type: "ref_image",
          },
        },
        (response) => {
          if (response?.success && response.data?.url) {
            resolve(response.data.url);
          } else {
            console.warn(
              "[SaveTemplateModal] Upload API failed:",
              response?.error,
            );
            resolve(null);
          }
        },
      );
    });
  }
  static async _fetchBlobDirect(blobUrl) {
    try {
      const response = await fetch(blobUrl);
      const blob = await response.blob();
      const mimeType = blob.type || "image/png";
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result.split(",")[1];
          resolve({ base64, mimeType });
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      return null;
    }
  }
  static async _fetchFlowUrlViaBackground(url) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: "fetchImageAsBase64", url },
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn(
              "[SaveTemplateModal] Background fetch error:",
              chrome.runtime.lastError.message,
            );
            resolve(null);
            return;
          }
          if (response?.success && response.base64) {
            resolve({
              base64: response.base64,
              mimeType: response.contentType || "image/jpeg",
            });
          } else {
            resolve(null);
          }
        },
      );
    });
  }
  static _convertToTemplateFormat(
    workflowData,
    options,
    urlMapping = new Map(),
  ) {
    const resolveUrl = (url) => {
      if (!url || typeof url !== "string") return null;
      if (urlMapping.has(url)) {
        return urlMapping.get(url);
      }
      if (this._isChatGPTOrGrokUrl(url)) {
        return null;
      }
      if (url.startsWith("http://") || url.startsWith("https://")) {
        return url;
      }
      return null;
    };
    const nodes = (workflowData.nodes || []).map((node) => {
      let refImgUrls = [];
      if (Array.isArray(node.ref_img_urls) && node.ref_img_urls.length > 0) {
        refImgUrls = node.ref_img_urls
          .map((url) => resolveUrl(url))
          .filter(Boolean);
      } else if (
        node.ref_thumbnails &&
        typeof node.ref_thumbnails === "object"
      ) {
        refImgUrls = Object.values(node.ref_thumbnails)
          .map((entry) =>
            resolveUrl(
              typeof entry === "string"
                ? entry
                : entry?.thumbnail || entry?.video_url,
            ),
          )
          .filter(Boolean);
      }
      const resultImgUrl = resolveUrl(node.result_img_url);
      const frame1Thumbnail = resolveUrl(node.frame_1_thumbnail);
      const frame2Thumbnail = resolveUrl(node.frame_2_thumbnail);
      console.log("[SaveTemplateModal] Node ref extraction:", {
        node_id: node.node_id,
        node_type: node.node_type,
        ref_thumbnails_count: node.ref_thumbnails
          ? Object.keys(node.ref_thumbnails).length
          : 0,
        ref_thumbnails_urls: node.ref_thumbnails
          ? Object.values(node.ref_thumbnails).map((u) => u?.substring(0, 80))
          : [],
        resolved_urls: refImgUrls.length,
        resolved_urls_list: refImgUrls.map((u) => u?.substring(0, 80)),
        result_img_url: resultImgUrl ? "resolved" : "none",
      });
      const extraData = this._extractNodeData(node);
      if (
        node.result_thumbnails &&
        typeof node.result_thumbnails === "object"
      ) {
        const rebuilt = {};
        for (const [fid, entry] of Object.entries(node.result_thumbnails)) {
          if (!entry || typeof entry !== "object") continue;
          const poster = resolveUrl(entry.thumbnail);
          const videoUrl = resolveUrl(entry.video_url);
          if (poster || videoUrl)
            rebuilt[fid] = {
              thumbnail: poster || "",
              type: entry.type || (videoUrl ? "video" : "image"),
              ...(videoUrl ? { video_url: videoUrl } : {}),
            };
        }
        if (Object.keys(rebuilt).length) extraData.result_thumbnails = rebuilt;
      }
      if (resultImgUrl) {
        extraData.result_img_url = resultImgUrl;
      } else {
        delete extraData.result_img_url;
      }
      if (frame1Thumbnail) {
        extraData.frame_1_thumbnail = frame1Thumbnail;
      } else {
        delete extraData.frame_1_thumbnail;
      }
      if (frame2Thumbnail) {
        extraData.frame_2_thumbnail = frame2Thumbnail;
      } else {
        delete extraData.frame_2_thumbnail;
      }
      return {
        id: node.node_id,
        type: node.node_type,
        position: { x: node.pos_x || 0, y: node.pos_y || 0 },
        data: {
          node_name: node.node_name || "",
          label: node.node_name || node.node_type || "",
          prompt: node.prompt || "",
          model: node.model || "",
          ratio: node.ratio || (node.node_type === "gemini" ? "" : "1:1"),
          quantity: node.quantity || 1,
          enabled: node.enabled !== false,
          media_type: node.media_type || "Image",
          gen_type: node.gen_type || "flow",
          ref_img_urls: refImgUrls,
          delay_seconds: node.delay_seconds || 5,
          download_resolution: node.download_resolution || "original",
          note_text: node.note_text || "",
          telegram_chat_id: node.telegram_chat_id || "",
          telegram_caption: node.telegram_caption || "",
          ...extraData,
        },
      };
    });
    const edges = (workflowData.edges || []).map((edge) => ({
      id:
        edge.edge_id ||
        (window.IdGenerator
          ? window.IdGenerator.next("edge")
          : `edge_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`),
      source: edge.source_node_id,
      target: edge.target_node_id,
      sourceHandle: edge.source_handle || "output_1",
      targetHandle: edge.target_handle || "input_1",
      sourcePort: edge.source_port || null,
      targetPort: edge.target_port || null,
      dataType: edge.data_type || "image",
    }));
    return {
      name: options.name,
      description: options.description,
      category_id: options.category_id,
      thumbnail_url: options.thumbnail_url,
      video_url: options.video_url,
      is_active: options.is_active,
      is_premium: options.is_premium,
      is_featured: options.is_featured,
      nodes,
      edges,
      settings: workflowData.settings || {},
    };
  }
  static _extractNodeData(node) {
    const extra = {};
    const copyFields = [
      "auto_download",
      "retry_on_fail",
      "style_weight",
      "quality",
      "negative_prompt",
      "seed",
      "cfg_scale",
      "steps",
      "video_duration",
      "video_resolution",
      "video_fps",
      "aspect_ratio",
      "node_zoom",
      "system_prompt",
      "temperature",
      "max_tokens",
      "slug",
      "slug_auto",
      "prompt_mode",
      "ref_mode",
      "ref_file_names",
      "angle_preset_id",
      "angle_preset_name",
      "angle_preset_json",
      "angle_rotation",
      "angle_tilt",
      "angle_zoom",
      "angle_ratio",
      "angle_built_prompt",
      "download_resolution",
      "video_download_resolution",
      "download_folder",
      "download_file_template",
      "download_collect_all",
      "telegram_send_mode",
      "telegram_message",
      "provider",
      "prompt_source",
      "multi_prompt",
      "timeout_sec",
      "timeout_ms",
      "use_fallback_prefix",
      "max_ref_images",
      "use_ai",
      "ai_fallback",
      "ai_delete_after_run",
      "voice_slug",
      "voice_search_value",
      "character_slug",
      "character_search_value",
      "character_selections",
      "result_img_url",
      "grok_mode",
      "grok_duration",
      "grok_resolution",
      "grok_image_quality",
      "chatgpt_delete_after_gen",
      "gemini_delete_after_gen",
      "muse_delete_after_gen",
      "muse_upload_video_to_flow",
      "video_input_type",
      "frame_ref_mode",
      "frame_1_source",
      "frame_1_file_name",
      "frame_1_thumbnail",
      "frame_2_source",
      "frame_2_file_name",
      "frame_2_thumbnail",
      "prompts_json",
      "extract_mode",
      "extract_marker",
      "extract_regex",
      "extract_strict",
      "extract_multi_match",
      "extract_on_fail",
      "note_color",
      "note_font_size",
      "note_width",
      "note_height",
    ];
    copyFields.forEach((field) => {
      if (node[field] !== void 0) {
        extra[field] = node[field];
      }
    });
    return extra;
  }
  static async _saveTemplate(templateData) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: "apiRequest",
          method: "POST",
          endpoint: "admin/workflow-templates",
          token: window.authManager?.getToken(),
          data: templateData,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(
              new Error(chrome.runtime.lastError.message || "Connection error"),
            );
            return;
          }
          if (!response) {
            reject(
              new Error(
                "Kh\xF4ng nh\u1EADn \u0111\u01B0\u1EE3c ph\u1EA3n h\u1ED3i t\u1EEB server",
              ),
            );
            return;
          }
          if (response.success) {
            resolve(response.data);
          } else {
            reject(
              new Error(response.error?.message || "Failed to save template"),
            );
          }
        },
      );
    });
  }
  static _showError(modal, message) {
    const errorEl = modal.querySelector("#saveTemplateError");
    const textEl = modal.querySelector("#saveTemplateErrorText");
    if (errorEl && textEl) {
      textEl.textContent = message;
      errorEl.classList.remove("hidden");
      setTimeout(() => {
        errorEl.classList.add("hidden");
      }, 5e3);
    }
  }
  static _escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  static _escapeAttr(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}
__publicField(SaveTemplateModal, "_instance", null);
__publicField(SaveTemplateModal, "_categories", []);
__publicField(SaveTemplateModal, "_selectedThumbnail", null);
window.SaveTemplateModal = SaveTemplateModal;
