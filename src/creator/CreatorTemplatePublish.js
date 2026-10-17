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
class CreatorTemplatePublish {
  static async showEditMetadata(template) {
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    const profile = await this._fetchProfile();
    if (!profile?.is_active) {
      window.showNotification?.(
        t(
          "creator.notActive",
          "You must be an approved affiliate to publish templates.",
        ),
        "error",
      );
      return null;
    }
    this._close();
    this._editTemplateId = template.id;
    this._selectedThumbnail = template.thumbnail_url || null;
    return new Promise((resolve) => {
      const modal = this._createModal(
        { wf_name: template.name, description: template.description || "" },
        { isEdit: true, thumbnail: template.thumbnail_url },
      );
      document.body.appendChild(modal);
      this._instance = modal;
      this._bindEvents(modal, null, resolve, { isEdit: true });
      requestAnimationFrame(() => {
        modal.classList.add("visible");
        modal.querySelector("#creatorTplName")?.focus();
      });
    });
  }
  static async show(workflowData) {
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    const profile = await this._fetchProfile();
    if (!profile?.is_active) {
      window.showNotification?.(
        t(
          "creator.notActive",
          "You must be an approved affiliate to publish templates.",
        ),
        "error",
      );
      return null;
    }
    if (!profile.can_publish_templates) {
      window.showNotification?.(
        t(
          "creator.publishRevoked",
          "Your template publishing permission has been suspended.",
        ),
        "error",
      );
      return null;
    }
    this._profile = profile;
    if (!profile.slug) {
      window.showNotification?.(
        t(
          "creator.publish.noSlugHint",
          "Tip: set your page slug in Dashboard \u2192 Account so your template shows publicly.",
        ),
        "info",
        4e3,
      );
    }
    this._close();
    this._selectedThumbnail = null;
    this._editTemplateId = null;
    return new Promise((resolve) => {
      const modal = this._createModal(workflowData);
      document.body.appendChild(modal);
      this._instance = modal;
      this._bindEvents(modal, workflowData, resolve);
      requestAnimationFrame(() => {
        modal.classList.add("visible");
        modal.querySelector("#creatorTplName")?.focus();
      });
    });
  }
  static invalidateEligible() {
    this._eligibleCache = null;
    this._eligiblePromise = null;
  }
  static async isEligible() {
    const now = Date.now();
    if (this._eligibleCache && now - this._eligibleCache.at < 6e4) {
      return this._eligibleCache.value;
    }
    if (this._eligiblePromise) return this._eligiblePromise;
    this._eligiblePromise = (async () => {
      try {
        const profile = await this._fetchProfile();
        const value = !!(profile?.is_active && profile?.can_publish_templates);
        this._eligibleCache = { at: Date.now(), value };
        return value;
      } catch (e) {
        return false;
      } finally {
        this._eligiblePromise = null;
      }
    })();
    return this._eligiblePromise;
  }
  static async _fetchProfile() {
    try {
      const resp = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            action: "apiRequest",
            method: "GET",
            endpoint: "affiliate/creator-profile",
            token: window.authManager?.getToken(),
          },
          (r) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve(r);
          },
        );
      });
      return resp?.success ? resp.data : null;
    } catch (e) {
      console.warn("[CreatorTemplatePublish] fetch profile fail:", e.message);
      return null;
    }
  }
  static _close() {
    if (this._instance) {
      this._instance.classList.remove("visible");
      const el = this._instance;
      setTimeout(() => {
        el?.remove();
      }, 200);
      this._instance = null;
    }
  }
  static _countRefs(workflowData) {
    let refs = 0;
    for (const node of workflowData.nodes || []) {
      if (node.ref_thumbnails && typeof node.ref_thumbnails === "object") {
        refs += Object.keys(node.ref_thumbnails).length;
      } else if (Array.isArray(node.ref_img_urls)) {
        refs += node.ref_img_urls.length;
      }
    }
    return refs;
  }
  static _createModal(workflowData, opts = {}) {
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    const isEdit = !!opts.isEdit;
    const defaultName = workflowData.wf_name || "Workflow Template";
    const defaultDesc = workflowData.description || "";
    const nodeCount = (workflowData.nodes || []).length;
    const refCount = this._countRefs(workflowData);
    const modal = document.createElement("div");
    modal.className = "save-template-modal creator-publish-modal";
    modal.innerHTML = `
      <div class="save-template-backdrop"></div>
      <div class="save-template-content">
        <div class="save-template-header">
          <h3>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
            </svg>
            ${isEdit ? t("creator.edit.title", "Edit Template Info") : t("creator.publish.title", "Publish Workflow Template")}
          </h3>
          <button class="save-template-close" type="button" aria-label="${t("common.close", "Close")}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="save-template-body">
          <div class="save-template-field">
            <label for="creatorTplName">${t("creator.publish.nameLabel", "Template name")} <span class="required">*</span></label>
            <input type="text" id="creatorTplName" value="${this._escapeAttr(defaultName)}"
                   placeholder="${t("creator.publish.namePlaceholder", "Enter template name...")}" required maxlength="100" />
          </div>
          <div class="save-template-field">
            <label for="creatorTplDesc">${t("creator.publish.descLabel", "Short description")}</label>
            <textarea id="creatorTplDesc" rows="3" maxlength="500"
                      placeholder="${t("creator.publish.descPlaceholder", "A short description of this template...")}">${this._escapeHtml(defaultDesc)}</textarea>
          </div>
          <div class="save-template-field">
            <label>${t("creator.publish.thumbnailLabel", "Thumbnail")}</label>
            <div class="save-template-thumbnail-picker" id="creatorTplThumbPicker">
              <div class="thumbnail-preview${opts.thumbnail ? " has-image" : ""}" id="creatorTplThumbPreview">
                ${
                  opts.thumbnail
                    ? `<img src="${this._escapeAttr(opts.thumbnail)}" alt="Thumbnail" />`
                    : `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                <span>${t("creator.publish.clickToSelect", "Click to select an image (optional)")}</span>`
                }
              </div>
              <button type="button" class="thumbnail-remove ${opts.thumbnail ? "" : "hidden"}" id="creatorTplThumbRemove" title="${t("common.remove", "Remove")}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <span class="save-template-hint">${t("creator.publish.thumbnailSizeHint", "Recommended: 640\xD7360px or 1280\xD7720px (16:9 ratio)")}</span>
          </div>
          ${
            isEdit
              ? `
          <div class="creator-publish-note">
            ${t("creator.edit.metaNote", "Editing display info only (workflow content unchanged) \u2192 keeps approved status.")}
          </div>`
              : `
          <div class="creator-publish-info">
            <span><strong>${nodeCount}</strong> ${t("creator.publish.nodes", "node")}</span>
            <span>\xB7</span>
            <span><strong>${refCount}</strong> ${t("creator.publish.refImages", "reference images (saved to server)")}</span>
          </div>
          <div class="creator-publish-note">
            ${t("creator.publish.reviewNote", "The template will be submitted for review. Once approved by an admin it will appear on your creator page.")}
          </div>`
          }
          <div class="save-template-error hidden" id="creatorTplError">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span id="creatorTplErrorText"></span>
          </div>
        </div>
        <div class="save-template-footer">
          <button class="btn btn-secondary" type="button" id="creatorTplCancel">${t("common.cancel", "Cancel")}</button>
          <button class="btn btn-primary" type="button" id="creatorTplSubmit">${isEdit ? t("creator.edit.save", "Save changes") : t("creator.publish.submit", "Submit for review")}</button>
        </div>
      </div>
    `;
    return modal;
  }
  static _bindEvents(modal, workflowData, resolve, opts = {}) {
    const close = () => {
      this._close();
      resolve(null);
    };
    modal
      .querySelector(".save-template-close")
      ?.addEventListener("click", close);
    modal.querySelector("#creatorTplCancel")?.addEventListener("click", close);
    modal
      .querySelector(".save-template-backdrop")
      ?.addEventListener("click", close);
    const handleKeydown = (e) => {
      if (e.key === "Escape") {
        close();
        document.removeEventListener("keydown", handleKeydown);
      }
    };
    document.addEventListener("keydown", handleKeydown);
    const thumbPicker = modal.querySelector("#creatorTplThumbPicker");
    thumbPicker?.addEventListener("click", async (e) => {
      if (e.target.closest(".thumbnail-remove")) return;
      const url = await this._pickAndUpload("thumbnail");
      if (url) {
        this._selectedThumbnail = url;
        this._updateThumb(modal, url);
      }
    });
    modal
      .querySelector("#creatorTplThumbRemove")
      ?.addEventListener("click", (e) => {
        e.stopPropagation();
        this._selectedThumbnail = null;
        this._updateThumb(modal, null);
      });
    modal
      .querySelector("#creatorTplSubmit")
      ?.addEventListener("click", () =>
        opts.isEdit
          ? this._handleEditSubmit(modal, resolve)
          : this._handleSubmit(modal, workflowData, resolve),
      );
  }
  static async _handleEditSubmit(modal, resolve) {
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    const nameInput = modal.querySelector("#creatorTplName");
    const descInput = modal.querySelector("#creatorTplDesc");
    const submitBtn = modal.querySelector("#creatorTplSubmit");
    const name = nameInput?.value?.trim();
    if (!name) {
      this._showError(
        modal,
        t("creator.publish.nameRequired", "Please enter a template name"),
      );
      nameInput?.focus();
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = t("creator.edit.saving", "Saving...");
    try {
      const result = await this._submitUpdate(this._editTemplateId, {
        name,
        description: descInput?.value?.trim() || "",
        thumbnail_url: this._selectedThumbnail || null,
      });
      this._close();
      window.showNotification?.(
        t("creator.edit.success", "Template updated."),
        "success",
        3e3,
      );
      window.eventBus?.emit("creator:template-updated", result);
      resolve({ success: true, template: result });
    } catch (err) {
      this._showError(
        modal,
        err.message || t("creator.edit.error", "Could not update template"),
      );
      submitBtn.disabled = false;
      submitBtn.textContent = t("creator.edit.save", "Save changes");
    }
  }
  static _submitUpdate(id, data) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: "apiRequest",
          method: "PUT",
          endpoint: `creator-templates/${id}`,
          token: window.authManager?.getToken(),
          data,
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
          if (response.success) resolve(response.data);
          else
            reject(
              new Error(response.error?.message || "Failed to update template"),
            );
        },
      );
    });
  }
  static _updateThumb(modal, url) {
    const preview = modal.querySelector("#creatorTplThumbPreview");
    const removeBtn = modal.querySelector("#creatorTplThumbRemove");
    if (url) {
      preview.innerHTML = `<img src="${this._escapeAttr(url)}" alt="Thumbnail" />`;
      preview.classList.add("has-image");
      removeBtn?.classList.remove("hidden");
    } else {
      preview.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>${window.I18n?.t("creator.publish.clickToSelect") || "Click to select an image (optional)"}</span>`;
      preview.classList.remove("has-image");
      removeBtn?.classList.add("hidden");
    }
  }
  static async _handleSubmit(modal, workflowData, resolve) {
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    const nameInput = modal.querySelector("#creatorTplName");
    const descInput = modal.querySelector("#creatorTplDesc");
    const submitBtn = modal.querySelector("#creatorTplSubmit");
    const name = nameInput?.value?.trim();
    if (!name) {
      this._showError(
        modal,
        t("creator.publish.nameRequired", "Please enter a template name"),
      );
      nameInput?.focus();
      return;
    }
    submitBtn.disabled = true;
    const progress = (txt) => {
      submitBtn.textContent = txt;
    };
    progress(t("creator.publish.uploading", "Uploading"));
    try {
      const { urlMapping, failed } = await this._uploadImages(
        workflowData,
        (c, total) =>
          progress(
            `${t("creator.publish.uploading", "Uploading")} ${c}/${total}...`,
          ),
      );
      if (failed > 0) {
        const msg = t(
          "creator.publish.uploadFailedConfirm",
          "{n} images failed to upload \u2014 the template will be missing reference images. Continue anyway?",
        ).replace("{n}", failed);
        if (!confirm(msg)) {
          submitBtn.disabled = false;
          submitBtn.textContent = t(
            "creator.publish.submit",
            "Submit for review",
          );
          return;
        }
      }
      progress(t("creator.publish.submitting", "Submitting..."));
      const templateData = this._convertToTemplateFormat(
        workflowData,
        {
          name,
          description: descInput?.value?.trim() || "",
          thumbnail_url: this._selectedThumbnail || null,
        },
        urlMapping,
      );
      const result = await this._submit(templateData);
      this._close();
      window.showNotification?.(
        t("creator.publish.success", "Template submitted for review."),
        "success",
        4e3,
      );
      window.eventBus?.emit("creator:template-submitted", result);
      resolve({ success: true, template: result });
    } catch (err) {
      console.error("[CreatorTemplatePublish] submit error:", err);
      this._showError(
        modal,
        err.message ||
          t("creator.publish.error", "Could not submit the template"),
      );
      submitBtn.disabled = false;
      submitBtn.textContent = t("creator.publish.submit", "Submit for review");
    }
  }
  static _isLocalUrl(url) {
    return (
      typeof url === "string" &&
      (url.startsWith("blob:") || url.startsWith("data:"))
    );
  }
  static _isFlowUrl(url) {
    if (typeof url !== "string") return false;
    return [
      "labs.google",
      "flow.google",
      "flow-content.google",
      "uxlfoundation.org",
    ].some((d) => url.includes(d));
  }
  static _isChatGPTOrGrokUrl(url) {
    if (typeof url !== "string") return false;
    return [
      "chatgpt.com",
      "oaiusercontent.com",
      "sandboxed.openai.com",
      "grok.com",
      "x.ai",
    ].some((d) => url.includes(d));
  }
  static _isProviderUrl(url) {
    return this._isFlowUrl(url) || this._isChatGPTOrGrokUrl(url);
  }
  static _needsUpload(url) {
    return this._isLocalUrl(url) || this._isProviderUrl(url);
  }
  static async _uploadImages(workflowData, onProgress) {
    const urlMapping = new Map();
    const localUrls = new Map();
    const addUrl = (url, meta = null) => {
      if (url && !localUrls.has(url)) localUrls.set(url, meta);
    };
    for (const node of workflowData.nodes || []) {
      if (node.ref_thumbnails && typeof node.ref_thumbnails === "object") {
        for (const url of Object.values(node.ref_thumbnails)) {
          const mediaUrl =
            typeof url === "string" ? url : url?.thumbnail || url?.video_url;
          if (this._needsUpload(mediaUrl)) addUrl(mediaUrl);
        }
      }
      if (Array.isArray(node.ref_img_urls)) {
        for (const url of node.ref_img_urls) {
          if (this._needsUpload(url)) addUrl(url);
        }
      }
      if (node.result_img_url && this._needsUpload(node.result_img_url))
        addUrl(node.result_img_url);
      if (node.frame_1_thumbnail && this._needsUpload(node.frame_1_thumbnail))
        addUrl(node.frame_1_thumbnail);
      if (node.frame_2_thumbnail && this._needsUpload(node.frame_2_thumbnail))
        addUrl(node.frame_2_thumbnail);
      if (
        node.result_thumbnails &&
        typeof node.result_thumbnails === "object"
      ) {
        for (const [fid, entry] of Object.entries(node.result_thumbnails)) {
          const provenance = node.result_provider_urls?.[fid];
          const poster = entry?.thumbnail;
          if (
            poster &&
            (this._needsUpload(poster) || provenance?.provider === "gemini")
          )
            addUrl(poster, provenance);
          if (
            entry?.video_url &&
            (this._needsUpload(entry.video_url) ||
              provenance?.provider === "gemini")
          )
            addUrl(entry.video_url, provenance);
        }
      }
    }
    if (localUrls.size === 0) return { urlMapping, failed: 0 };
    let current = 0;
    let failed = 0;
    const total = localUrls.size;
    for (const [localUrl, provenance] of localUrls) {
      current++;
      onProgress?.(current, total);
      try {
        const serverUrl = await this._uploadOne(localUrl, provenance);
        if (serverUrl) urlMapping.set(localUrl, serverUrl);
        else failed++;
      } catch (e) {
        failed++;
        console.warn(
          "[CreatorTemplatePublish] upload fail:",
          localUrl?.substring(0, 60),
          e.message,
        );
      }
    }
    return { urlMapping, failed };
  }
  static async _uploadOne(localUrl, provenance = null) {
    let base64, mimeType, fileName;
    if (localUrl.startsWith("data:")) {
      const m = localUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) return null;
      mimeType = m[1];
      base64 = m[2];
      fileName = `upload_${Date.now()}.${mimeType.split("/")[1] || "png"}`;
    } else if (localUrl.startsWith("blob:")) {
      const resp = await window.MessageBridge?.sendToContentScript(
        "fetchImageAsBase64",
        { url: localUrl },
      );
      if (resp?.success && resp.base64) {
        base64 = resp.base64;
        mimeType = resp.mimeType || resp.contentType || "image/png";
      } else {
        const direct = await this._fetchBlobDirect(localUrl);
        if (!direct) return null;
        base64 = direct.base64;
        mimeType = direct.mimeType;
      }
      fileName = `upload_${Date.now()}.${mimeType?.split("/")[1] || "png"}`;
    } else if (this._isFlowUrl(localUrl)) {
      const resp = await window.MessageBridge?.sendToContentScript(
        "fetchImageAsBase64",
        { url: localUrl },
      );
      if (resp?.success && resp.base64) {
        base64 = resp.base64;
        mimeType = resp.mimeType || resp.contentType || "image/jpeg";
      } else {
        const bg = await new Promise((r) => {
          chrome.runtime.sendMessage(
            { action: "fetchImageAsBase64", url: localUrl },
            (resp2) => {
              if (chrome.runtime.lastError) {
                r(null);
                return;
              }
              r(resp2);
            },
          );
        });
        if (bg?.success && bg.base64) {
          base64 = bg.base64;
          mimeType = bg.contentType || "image/jpeg";
        } else return null;
      }
      fileName = `flow_${Date.now()}.${mimeType?.split("/")[1] || "jpg"}`;
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
        (provenance.media_type === "video" ? "video/mp4" : "image/png");
      fileName = `gemini_${Date.now()}.${mimeType.split("/")[1] || "bin"}`;
    } else if (this._isChatGPTOrGrokUrl(localUrl)) {
      const resp = await this._fetchProviderImage(localUrl);
      if (!resp) return null;
      base64 = resp.base64;
      mimeType = resp.mimeType;
      fileName = `provider_${Date.now()}.${mimeType?.split("/")[1] || "jpg"}`;
    } else {
      return null;
    }
    if (!base64) return null;
    if (base64.startsWith("data:")) {
      const idx = base64.indexOf(",");
      if (idx !== -1) base64 = base64.substring(idx + 1);
    }
    if (window.WatermarkClient && !this._isChatGPTOrGrokUrl(localUrl)) {
      try {
        const cl = await window.WatermarkClient.cleanBase64(
          base64,
          mimeType || "image/png",
          mimeType?.startsWith("video/") ? "video" : "image",
        );
        if (cl.cleaned) {
          base64 = cl.base64;
          mimeType = cl.mime || mimeType;
        }
      } catch (e) {
        console.warn(
          "[CreatorTemplatePublish] b\u1ECF qua xo\xE1 watermark:",
          e?.message,
        );
      }
    }
    return this._postMediaWithRetry({ name: fileName, type: mimeType, base64 });
  }
  static async _postMediaWithRetry(fileFields, attempt = 0) {
    const MAX_RETRY = 4;
    const resp = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          action: "apiRequest",
          method: "POST",
          endpoint: "creator-templates/media",
          token: window.authManager?.getToken(),
          isFormData: true,
          formDataFields: { file: fileFields, type: "ref_image" },
        },
        (r) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(r);
        },
      );
    });
    if (resp?.success && resp.data?.url) return resp.data.url;
    const is429 =
      resp?.httpStatus === 429 ||
      resp?.error?.code === "RATE_LIMITED" ||
      /too many|rate limit/i.test(resp?.error?.message || "");
    if (is429 && attempt < MAX_RETRY) {
      const retryAfter =
        Number(resp?.retry_after || resp?.data?.retry_after) || 5;
      const waitMs =
        Math.min(retryAfter, 65) * 1e3 + Math.floor(Math.random() * 400);
      console.warn(
        `[CreatorTemplatePublish] media upload 429 \u2192 \u0111\u1EE3i ${Math.round(waitMs / 1e3)}s r\u1ED3i retry (${attempt + 1}/${MAX_RETRY})`,
      );
      await new Promise((r) => setTimeout(r, waitMs));
      return this._postMediaWithRetry(fileFields, attempt + 1);
    }
    console.warn("[CreatorTemplatePublish] media upload failed:", resp?.error);
    return null;
  }
  static _pickAndUpload(type = "thumbnail") {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/jpeg,image/png,image/gif,image/webp";
      input.style.cssText =
        "position:fixed;left:-9999px;top:0;opacity:0;width:1px;height:1px;";
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        input.remove();
        if (!file) {
          resolve(null);
          return;
        }
        if (file.size > 10 * 1024 * 1024) {
          window.showNotification?.(
            window.I18n?.t("creator.publish.imageTooLarge") ||
              "Image exceeds 10MB.",
            "error",
          );
          resolve(null);
          return;
        }
        try {
          const dataUrl = await new Promise((res, rej) => {
            const reader = new FileReader();
            reader.onload = () => res(reader.result);
            reader.onerror = () => rej(new Error("READ_ERROR"));
            reader.readAsDataURL(file);
          });
          const base64 = String(dataUrl).split(",")[1];
          chrome.runtime.sendMessage(
            {
              action: "apiRequest",
              method: "POST",
              endpoint: "creator-templates/media",
              token: window.authManager?.getToken(),
              isFormData: true,
              formDataFields: {
                file: {
                  name: file.name || "image",
                  type: file.type || "image/png",
                  base64,
                },
                type,
              },
            },
            (response) => {
              if (response?.success && response.data?.url)
                resolve(response.data.url);
              else {
                window.showNotification?.(
                  response?.error?.message ||
                    window.I18n?.t("creator.publish.uploadFailed") ||
                    "Image upload failed.",
                  "error",
                );
                resolve(null);
              }
            },
          );
        } catch (e) {
          resolve(null);
        }
      });
      document.body.appendChild(input);
      input.click();
    });
  }
  static async _fetchProviderImage(url) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: "creator:fetchImage", url },
        (resp) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          if (resp?.success && resp.base64)
            resolve({
              base64: resp.base64,
              mimeType: resp.mime || resp.mimeType || "image/jpeg",
            });
          else resolve(null);
        },
      );
    });
  }
  static async _fetchBlobDirect(blobUrl) {
    try {
      const response = await fetch(blobUrl);
      const blob = await response.blob();
      const mimeType = blob.type || "image/png";
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () =>
          resolve({ base64: reader.result.split(",")[1], mimeType });
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }
  static _convertToTemplateFormat(
    workflowData,
    options,
    urlMapping = new Map(),
  ) {
    const resolveUrl = (url) => {
      if (!url || typeof url !== "string") return null;
      if (urlMapping.has(url)) return urlMapping.get(url);
      if (url.startsWith("http://") || url.startsWith("https://")) {
        if (this._isProviderUrl(url)) return null;
        return url;
      }
      return null;
    };
    const nodes = (workflowData.nodes || []).map((node) => {
      let refImgUrls = [];
      if (Array.isArray(node.ref_img_urls) && node.ref_img_urls.length > 0) {
        refImgUrls = node.ref_img_urls.map(resolveUrl).filter(Boolean);
      } else if (
        node.ref_thumbnails &&
        typeof node.ref_thumbnails === "object"
      ) {
        refImgUrls = Object.values(node.ref_thumbnails)
          .map(resolveUrl)
          .filter(Boolean);
      }
      const extraData = this._extractNodeData(node);
      const resultImgUrl = resolveUrl(node.result_img_url);
      if (resultImgUrl) extraData.result_img_url = resultImgUrl;
      else delete extraData.result_img_url;
      const f1 = resolveUrl(node.frame_1_thumbnail);
      if (f1) extraData.frame_1_thumbnail = f1;
      else delete extraData.frame_1_thumbnail;
      const f2 = resolveUrl(node.frame_2_thumbnail);
      if (f2) extraData.frame_2_thumbnail = f2;
      else delete extraData.frame_2_thumbnail;
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
        if (Object.keys(rebuilt).length > 0)
          extraData.result_thumbnails = rebuilt;
        else delete extraData.result_thumbnails;
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
      thumbnail_url: options.thumbnail_url,
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
      "gemini_delete_after_gen",
      "video_input_type",
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
    copyFields.forEach((f) => {
      if (node[f] !== void 0) extra[f] = node[f];
    });
    return extra;
  }
  static async _submit(templateData) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: "apiRequest",
          method: "POST",
          endpoint: "creator-templates",
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
          if (response.success) resolve(response.data);
          else
            reject(
              new Error(
                response.error?.message ||
                  "Failed to submit template for review",
              ),
            );
        },
      );
    });
  }
  static _showError(modal, message) {
    const errorEl = modal.querySelector("#creatorTplError");
    const textEl = modal.querySelector("#creatorTplErrorText");
    if (errorEl && textEl) {
      textEl.textContent = message;
      errorEl.classList.remove("hidden");
      setTimeout(() => errorEl.classList.add("hidden"), 5e3);
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
__publicField(CreatorTemplatePublish, "_instance", null);
__publicField(CreatorTemplatePublish, "_selectedThumbnail", null);
__publicField(CreatorTemplatePublish, "_profile", null);
__publicField(CreatorTemplatePublish, "_editTemplateId", null);
window.CreatorTemplatePublish = CreatorTemplatePublish;
