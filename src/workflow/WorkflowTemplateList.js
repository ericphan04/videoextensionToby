class WorkflowTemplateList {
  constructor(container) {
    this.container = container;
    this.templates = [];
    this.categories = [];
    this.selectedCategory = null;
    this.searchQuery = "";
    this.currentPage = 1;
    this.lastPage = 1;
    this.loading = false;
    this._searchTimeout = null;
    this._i18nHandler = null;
    this._isCopyingTemplate = false;
    this.render();
    this._bindEvents();
    this._loadCategories();
    this._loadTemplates();
    if (chrome?.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((message) => {
        if (
          message?.action === "workflowTemplateImportRequested" &&
          message.template
        ) {
          this._handleImport(message.template).catch((err) => {
            console.warn(
              "[WorkflowTemplateList] Import from preview failed:",
              err,
            );
          });
        }
        if (message?.action === "templateEditorClosed") {
          console.log(
            "[WorkflowTemplateList] Template editor closed, refreshing list...",
          );
          this._loadTemplates(false);
        }
      });
    }
  }
  _escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  _renderStar(filled) {
    if (filled) {
      return `<svg class="wf-star wf-star--filled" width="12" height="12" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
    }
    return `<svg class="wf-star wf-star--empty" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
  }
  _renderCombinedRating(templateId, avgRating, ratingsCount, userRating = 0) {
    const hasRating = ratingsCount && ratingsCount > 0;
    const isLoggedIn = window.authManager?.isLoggedIn() || false;
    let starsHtml = "";
    for (let i = 1; i <= 5; i++) {
      const filled = i <= (userRating || 0);
      if (isLoggedIn) {
        starsHtml += `<span class="wf-star-interactive${filled ? " wf-star-interactive--selected" : ""}" data-rating="${i}" data-template-id="${templateId}">${this._renderStar(filled)}</span>`;
      } else {
        const displayFilled = i <= Math.round(avgRating || 0);
        starsHtml += this._renderStar(displayFilled);
      }
    }
    const avgText = hasRating
      ? `<span class="wf-combined-rating__avg">${avgRating}</span>`
      : "";
    const countText = hasRating
      ? `<span class="wf-combined-rating__count">(${ratingsCount})</span>`
      : "";
    return `
      <div class="wf-combined-rating${isLoggedIn ? " wf-combined-rating--interactive" : ""}" data-template-id="${templateId}">
        <span class="wf-combined-rating__stars">${starsHtml}</span>
        ${avgText}
        ${countText}
      </div>
    `;
  }
  _renderRatingDisplay(avgRating, ratingsCount) {
    const hasRating = ratingsCount && ratingsCount > 0;
    const roundedRating = hasRating ? Math.round(avgRating) : 0;
    let starsHtml = "";
    for (let i = 1; i <= 5; i++) {
      starsHtml += this._renderStar(i <= roundedRating);
    }
    return `
      <span class="wf-template-rating${!hasRating ? " wf-template-rating--empty" : ""}">
        <span class="wf-template-rating__stars">${starsHtml}</span>
        ${hasRating ? `<span class="wf-template-rating__text">${avgRating}</span>` : ""}
      </span>
    `;
  }
  _renderInteractiveRating(templateId, userRating = 0) {
    let starsHtml = "";
    for (let i = 1; i <= 5; i++) {
      const filled = i <= userRating;
      starsHtml += `<span class="wf-star-interactive${filled ? " wf-star-interactive--selected" : ""}" data-rating="${i}" data-template-id="${templateId}">${this._renderStar(filled)}</span>`;
    }
    return `
      <div class="wf-template-rating-interactive" data-template-id="${templateId}">
        <span class="wf-template-rating-interactive__label">${window.I18n?.t("workflow.rateLabel") || "Your rating:"}</span>
        <span class="wf-template-rating-interactive__stars">${starsHtml}</span>
      </div>
    `;
  }
  _bindInteractiveRating(container, templateId) {
    let starsContainer = container.querySelector(
      ".wf-combined-rating--interactive .wf-combined-rating__stars",
    );
    if (!starsContainer) {
      starsContainer = container.querySelector(
        ".wf-template-rating-interactive__stars",
      );
    }
    if (!starsContainer) return;
    const starSpans = starsContainer.querySelectorAll(".wf-star-interactive");
    if (starSpans.length === 0) return;
    starSpans.forEach((span) => {
      span.addEventListener("mouseenter", () => {
        const hoverRating = parseInt(span.dataset.rating, 10);
        starSpans.forEach((s, idx) => {
          const svgEl = s.querySelector("svg");
          if (idx < hoverRating) {
            svgEl.setAttribute("fill", "#f59e0b");
            svgEl.setAttribute("stroke", "#f59e0b");
            svgEl.classList.add("wf-star--filled");
            svgEl.classList.remove("wf-star--empty");
          } else {
            svgEl.setAttribute("fill", "none");
            svgEl.setAttribute("stroke", "#888");
            svgEl.classList.remove("wf-star--filled");
            svgEl.classList.add("wf-star--empty");
          }
        });
      });
      span.addEventListener("click", () => {
        const rating = parseInt(span.dataset.rating, 10);
        this._rateWorkflowTemplate(templateId, rating, starsContainer);
      });
    });
    starsContainer.addEventListener("mouseleave", () => {
      starSpans.forEach((s) => {
        const svgEl = s.querySelector("svg");
        if (s.classList.contains("wf-star-interactive--selected")) {
          svgEl.setAttribute("fill", "#f59e0b");
          svgEl.setAttribute("stroke", "#f59e0b");
          svgEl.classList.add("wf-star--filled");
          svgEl.classList.remove("wf-star--empty");
        } else {
          svgEl.setAttribute("fill", "none");
          svgEl.setAttribute("stroke", "#888");
          svgEl.classList.remove("wf-star--filled");
          svgEl.classList.add("wf-star--empty");
        }
      });
    });
  }
  async _rateWorkflowTemplate(templateId, rating, starsContainer) {
    try {
      console.log(
        "[WorkflowTemplateList] Rating template",
        templateId,
        "stars:",
        rating,
      );
      const result = await this._apiCall(
        `workflow-templates/${templateId}/rate`,
        "POST",
        { rating },
      );
      const data = result.data || result;
      if (starsContainer) {
        const starSpans = starsContainer.querySelectorAll(
          ".wf-star-interactive",
        );
        starSpans.forEach((s, i) => {
          const svgEl = s.querySelector("svg");
          if (i < rating) {
            svgEl.setAttribute("fill", "#f59e0b");
            svgEl.setAttribute("stroke", "#f59e0b");
            svgEl.classList.add("wf-star--filled");
            svgEl.classList.remove("wf-star--empty");
            s.classList.add("wf-star-interactive--selected");
          } else {
            svgEl.setAttribute("fill", "none");
            svgEl.setAttribute("stroke", "#888");
            svgEl.classList.remove("wf-star--filled");
            svgEl.classList.add("wf-star--empty");
            s.classList.remove("wf-star-interactive--selected");
          }
        });
      }
      const card = this.container.querySelector(
        `.wf-template-card[data-template-id="${templateId}"]`,
      );
      if (card && data.avg_rating !== void 0) {
        const ratingEl = card.querySelector(".wf-template-rating");
        if (ratingEl) {
          ratingEl.outerHTML = this._renderRatingDisplay(
            data.avg_rating,
            data.ratings_count,
          );
        }
        const tpl = this.templates.find(
          (t) => String(t.id) === String(templateId),
        );
        if (tpl) {
          tpl.avg_rating = data.avg_rating;
          tpl.ratings_count = data.ratings_count;
          tpl.user_rating = rating;
        }
      }
      const modalCombinedRating = document.querySelector(
        ".wf-detail-modal .wf-combined-rating",
      );
      if (modalCombinedRating && data.avg_rating !== void 0) {
        const avgEl = modalCombinedRating.querySelector(
          ".wf-combined-rating__avg",
        );
        const countEl = modalCombinedRating.querySelector(
          ".wf-combined-rating__count",
        );
        const hintEl = modalCombinedRating.querySelector(
          ".wf-combined-rating__hint",
        );
        if (avgEl) avgEl.textContent = data.avg_rating;
        else {
          const avgSpan = document.createElement("span");
          avgSpan.className = "wf-combined-rating__avg";
          avgSpan.textContent = data.avg_rating;
          modalCombinedRating
            .querySelector(".wf-combined-rating__stars")
            ?.after(avgSpan);
        }
        if (countEl) countEl.textContent = `(${data.ratings_count})`;
        else {
          const countSpan = document.createElement("span");
          countSpan.className = "wf-combined-rating__count";
          countSpan.textContent = `(${data.ratings_count})`;
          modalCombinedRating
            .querySelector(".wf-combined-rating__avg")
            ?.after(countSpan);
        }
        if (hintEl) hintEl.remove();
      }
      const modalRatingDisplay = document.querySelector(
        ".wf-detail-modal .wf-template-rating",
      );
      if (modalRatingDisplay && data.avg_rating !== void 0) {
        modalRatingDisplay.outerHTML = this._renderRatingDisplay(
          data.avg_rating,
          data.ratings_count,
        );
      }
      window.showNotification?.(
        window.I18n?.t("workflow.ratedTemplate", { rating }) ||
          `Rated ${rating} star${rating > 1 ? "s" : ""}`,
        "success",
      );
      console.log(
        "[WorkflowTemplateList] Rated template",
        templateId,
        "-> avg:",
        data.avg_rating,
      );
    } catch (err) {
      console.error(
        "[WorkflowTemplateList] Rate template error:",
        templateId,
        err.message,
      );
      window.showNotification?.(
        (window.I18n?.t("workflow.rateError") || "Error submitting rating: ") +
          err.message,
        "error",
      );
    }
  }
  render() {
    const t = (key, params) => window.I18n?.t(key, params) || key;
    const canManageTemplates =
      window.featureGate?.canManageWorkflowTemplates?.() ||
      (window.authManager?.canManageTemplates?.() ?? false);
    this._renderedCanManage = canManageTemplates;
    this.container.innerHTML = `
      <div class="wf-template-list">
        <div class="wf-template-search-row">
          <div class="wf-template-search-box">
            <svg class="wf-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.3-4.3"/>
            </svg>
            <input type="text" class="wf-search-input" placeholder="${t("workflow.searchTemplate")}" />
          </div>
          <select class="wf-category-select compact-select">
            <option value="">${t("workflow.allCategories")}</option>
          </select>
          ${
            canManageTemplates
              ? `
            <button class="wf-create-template-btn" title="${t("workflow.createNewTemplate") || "Create New Template"}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span>${t("workflow.createTemplate") || "Create Template"}</span>
            </button>
          `
              : ""
          }
        </div>

        <div class="wf-template-empty hidden">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
          <p>${t("workflow.noTemplates")}</p>
        </div>

        <div class="wf-template-grid">
          ${this._renderSkeletons()}
        </div>

        <button class="wf-load-more hidden">
          <span>${t("workflow.loadMore")}</span>
          <svg class="wf-load-more-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 5v14"></path>
            <path d="m6 13 6 6 6-6"></path>
          </svg>
        </button>
      </div>
    `;
  }
  _showRateLimitBanner(retryAfter) {
    let banner = this.container.querySelector(".wf-rate-limit-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "wf-rate-limit-banner";
      this.container.prepend(banner);
    }
    banner.style.display = "flex";
    const clockIcon = `<svg class="wf-rate-limit-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    const tBase =
      window.I18n?.t?.("workflow.rateLimitedBanner") ||
      "Your plan is being rate-limited. Retrying automatically in {seconds}s...";
    let remaining = retryAfter;
    const update = () => {
      const text = tBase.replace(
        "{seconds}",
        `<span class="wf-rate-limit-countdown">${remaining}</span>`,
      );
      banner.innerHTML = `${clockIcon}<span class="wf-rate-limit-text">${text}</span>`;
    };
    update();
    if (this._rateLimitTimer) clearInterval(this._rateLimitTimer);
    if (this._rateLimitRetryTimer) clearTimeout(this._rateLimitRetryTimer);
    this._rateLimitTimer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(this._rateLimitTimer);
        this._rateLimitTimer = null;
        banner.style.display = "none";
      } else {
        update();
      }
    }, 1e3);
    this._rateLimitRetryTimer = setTimeout(() => {
      this._rateLimitRetryTimer = null;
      this._loadTemplates(false);
    }, retryAfter * 1e3);
  }
  _renderSkeletons() {
    return `
      <div class="wf-template-card skeleton">
        <div class="wf-template-thumb skeleton-thumb"></div>
        <div class="wf-template-info">
          <div class="skeleton-text"></div>
          <div class="skeleton-text short"></div>
        </div>
      </div>
      <div class="wf-template-card skeleton">
        <div class="wf-template-thumb skeleton-thumb"></div>
        <div class="wf-template-info">
          <div class="skeleton-text"></div>
          <div class="skeleton-text short"></div>
        </div>
      </div>
      <div class="wf-template-card skeleton">
        <div class="wf-template-thumb skeleton-thumb"></div>
        <div class="wf-template-info">
          <div class="skeleton-text"></div>
          <div class="skeleton-text short"></div>
        </div>
      </div>
      <div class="wf-template-card skeleton">
        <div class="wf-template-thumb skeleton-thumb"></div>
        <div class="wf-template-info">
          <div class="skeleton-text"></div>
          <div class="skeleton-text short"></div>
        </div>
      </div>
    `;
  }
  _bindEvents() {
    const searchInput = this.container.querySelector(".wf-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this._handleSearch(e.target.value);
      });
    }
    const categorySelect = this.container.querySelector(".wf-category-select");
    if (categorySelect) {
      categorySelect.addEventListener("change", (e) => {
        const categoryId = e.target.value || null;
        this._handleCategoryFilter(categoryId);
      });
    }
    const createTemplateBtn = this.container.querySelector(
      ".wf-create-template-btn",
    );
    if (createTemplateBtn) {
      createTemplateBtn.addEventListener("click", () => {
        this._createNewTemplate();
      });
    }
    const gridContainer = this.container.querySelector(".wf-template-grid");
    if (gridContainer) {
      gridContainer.addEventListener("click", async (e) => {
        const card = e.target.closest(".wf-template-card");
        if (!card) return;
        const templateId = card.dataset.templateId;
        if (!templateId) return;
        const template = this.templates.find(
          (t) => String(t.id) === String(templateId),
        );
        if (!template) return;
        const upgradeBtn = e.target.closest(".wf-template-upgrade-btn");
        if (upgradeBtn) {
          this._showUpgradePrompt(template);
          return;
        }
        const editBtn = e.target.closest(".wf-template-edit-btn");
        if (editBtn) {
          if (await window.SystemConfig?.getBoolReady?.("workflow_web_mode")) {
            chrome.runtime.sendMessage(
              {
                action: "openWebSpaces",
                path: `/admin/workflow-templates/${encodeURIComponent(template.id)}/edit`,
              },
              (resp) => {
                void chrome.runtime.lastError;
                if (!resp?.ok)
                  window.showNotification?.(
                    window.I18n?.t("workflow.openWebFailed") ||
                      "Could not open web editor",
                    "error",
                  );
              },
            );
            return;
          }
          this._openTemplateForEdit(template.id);
          return;
        }
        const videoBtn = e.target.closest(".wf-template-video-btn");
        if (videoBtn) {
          const videoUrl = videoBtn.dataset.videoUrl;
          if (videoUrl) {
            this._showVideoModal(videoUrl);
          }
          return;
        }
        const shareBtn = e.target.closest(".wf-template-share-btn");
        if (shareBtn) {
          e.stopPropagation();
          const slug = shareBtn.dataset.templateSlug;
          if (slug) {
            this._copyTemplateShareLink(slug);
          }
          return;
        }
        const useBtn = e.target.closest(".wf-template-use-btn");
        if (useBtn) {
          if (await window.SystemConfig?.getBoolReady?.("workflow_web_mode")) {
            chrome.runtime.sendMessage(
              {
                action: "openWebSpaces",
                path: `/app/templates/${encodeURIComponent(template.id)}/preview`,
              },
              (resp) => {
                void chrome.runtime.lastError;
                if (!resp?.ok)
                  window.showNotification?.(
                    window.I18n?.t("workflow.openWebFailed") ||
                      "Could not open web editor",
                    "error",
                  );
              },
            );
            return;
          }
          this._showTemplateDetail(template);
          return;
        }
        const cardInfo = e.target.closest(".wf-template-info");
        if (cardInfo) {
          this._showTemplateDetail(template);
          return;
        }
        const thumb = e.target.closest(".wf-template-thumb");
        if (thumb && !e.target.closest("button")) {
          this._showTemplateDetail(template);
          return;
        }
      });
    }
    const loadMoreBtn = this.container.querySelector(".wf-load-more");
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener("click", () => {
        if (!this.loading && this.currentPage < this.lastPage) {
          this._loadTemplates(true);
        }
      });
    }
    if (window.eventBus) {
      this._i18nHandler = () => {
        this.render();
        this._bindEvents();
        this._renderCategories();
        this._renderTemplates();
      };
      window.eventBus.on("i18n:changed", this._i18nHandler);
      this._templateCreatedHandler = () => {
        console.log(
          "[WorkflowTemplateList] Template created, refreshing list...",
        );
        this._loadTemplates(false);
      };
      this._templateUpdatedHandler = () => {
        console.log(
          "[WorkflowTemplateList] Template updated, refreshing list...",
        );
        this._loadTemplates(false);
      };
      window.eventBus.on("template:created", this._templateCreatedHandler);
      window.eventBus.on("template:updated", this._templateUpdatedHandler);
      this._authLoginHandler = () => {
        console.log(
          "[WorkflowTemplateList] User logged in, refreshing templates...",
        );
        try {
          this.render();
          this._bindEvents();
        } catch (e) {}
        this._loadTemplates(false);
      };
      window.eventBus.on("auth:login", this._authLoginHandler);
      this._authLogoutHandler = () => {
        console.log(
          "[WorkflowTemplateList] User logged out, refreshing templates...",
        );
        try {
          this.render();
          this._bindEvents();
        } catch (e) {}
        this._loadTemplates(false);
      };
      window.eventBus.on("auth:logout", this._authLogoutHandler);
      this._featuregateRefreshHandler = () => {
        const canManage =
          window.featureGate?.canManageWorkflowTemplates?.() ||
          (window.authManager?.canManageTemplates?.() ?? false);
        if (canManage === this._renderedCanManage) return;
        try {
          this.render();
          this._bindEvents();
        } catch (e) {}
        this._loadTemplates(false);
      };
      window.eventBus.on(
        "featuregate:refreshed",
        this._featuregateRefreshHandler,
      );
    }
  }
  async _apiCall(endpoint, method = "GET", data = null) {
    if (window.authManager?.isLoggedIn()) {
      return window.authManager._apiCall(method, endpoint, data);
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("Request timeout (20s) - background unresponsive"));
      }, 2e4);
      try {
        chrome.runtime.sendMessage(
          { action: "apiRequest", method, endpoint, data },
          (resp) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (resp?.success) {
              if (resp.meta) {
                resolve({ data: resp.data, meta: resp.meta });
              } else {
                resolve(resp.data);
              }
            } else {
              reject(new Error(resp?.error?.message || "API Error"));
            }
          },
        );
      } catch (err) {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        reject(err);
      }
    });
  }
  async _loadCategories() {
    try {
      const result = await this._apiCall("workflow-templates/categories");
      this.categories = Array.isArray(result) ? result : result?.data || [];
      this._renderCategories();
    } catch (err) {
      console.error("[WorkflowTemplateList] Failed to load categories:", err);
    }
  }
  _renderCategories() {
    const t = (key) => window.I18n?.t(key) || key;
    const selectEl = this.container.querySelector(".wf-category-select");
    if (!selectEl) return;
    let html = `<option value="">${t("workflow.allCategories")}</option>`;
    for (const cat of this.categories) {
      const isSelected = String(this.selectedCategory) === String(cat.id);
      html += `<option value="${cat.id}" ${isSelected ? "selected" : ""}>${cat.name || cat.title}</option>`;
    }
    selectEl.innerHTML = html;
  }
  loadTemplates() {
    return this._loadTemplates(false);
  }
  async _loadTemplates(append = false) {
    if (this.loading) {
      const since = this._loadingStartedAt || 0;
      if (Date.now() - since < 3e4) return;
      console.warn(
        "[WorkflowTemplateList] Loading flag stuck > 30s, force reset",
      );
      this.loading = false;
    }
    this.loading = true;
    this._loadingStartedAt = Date.now();
    const grid = this.container.querySelector(".wf-template-grid");
    const loadMoreBtn = this.container.querySelector(".wf-load-more");
    const emptyState = this.container.querySelector(".wf-template-empty");
    if (append && loadMoreBtn) {
      loadMoreBtn.disabled = true;
      loadMoreBtn.classList.add("is-loading");
    }
    if (!append && grid) {
      grid.innerHTML = this._renderSkeletons();
    }
    if (emptyState) {
      emptyState.classList.add("hidden");
    }
    try {
      const page = append ? this.currentPage + 1 : 1;
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("per_page", "20");
      if (this.selectedCategory) {
        params.set("category_id", this.selectedCategory);
      }
      if (this.searchQuery) {
        params.set("search", this.searchQuery);
      }
      const endpoint = `workflow-templates?${params.toString()}`;
      const result = await this._apiCall(endpoint);
      let newTemplates = [];
      if (Array.isArray(result)) {
        newTemplates = result;
        this.lastPage = 1;
        this.currentPage = 1;
      } else if (result?.data) {
        newTemplates = result.data;
        this.lastPage = result.meta?.last_page || 1;
        this.currentPage = result.meta?.current_page || page;
      }
      if (append) {
        this.templates = [...this.templates, ...newTemplates];
      } else {
        this.templates = newTemplates;
      }
      this._renderTemplates();
      if (loadMoreBtn) {
        if (this.currentPage < this.lastPage && this.templates.length > 0) {
          loadMoreBtn.classList.remove("hidden");
        } else {
          loadMoreBtn.classList.add("hidden");
        }
      }
      if (this.templates.length === 0 && emptyState) {
        emptyState.classList.remove("hidden");
      }
    } catch (err) {
      if (err?.code === "RATE_LIMITED" || err?.httpStatus === 429) {
        const retryAfter = Number(err.retryAfter) || 60;
        console.warn(
          "[WorkflowTemplateList] Rate limited, gi\u1EEF data c\u0169, retry sau",
          retryAfter,
          "s",
        );
        this._showRateLimitBanner(retryAfter);
        if (this.templates.length > 0) {
          this._renderTemplates();
        }
      } else {
        console.error("[WorkflowTemplateList] Failed to load templates:", err);
        if (grid && !append) {
          grid.innerHTML = "";
        }
        if (emptyState) {
          emptyState.classList.remove("hidden");
        }
      }
    } finally {
      this.loading = false;
      this._loadingStartedAt = 0;
      if (loadMoreBtn) {
        loadMoreBtn.disabled = false;
        loadMoreBtn.classList.remove("is-loading");
      }
    }
  }
  _renderTemplates() {
    const grid = this.container.querySelector(".wf-template-grid");
    if (!grid) return;
    if (this.templates.length === 0) {
      grid.innerHTML = "";
      return;
    }
    let html = "";
    for (const template of this.templates) {
      html += this._renderTemplateCard(template);
    }
    grid.innerHTML = html;
  }
  _renderTemplateCard(template) {
    const t = (key) => window.I18n?.t(key) || key;
    const thumbnail =
      template.thumbnail_url ||
      template.thumbnail ||
      template.preview_image ||
      "";
    if (!thumbnail) {
      console.log(
        "[WorkflowTemplateList] Template card missing thumbnail:",
        template.id,
        template.name,
      );
    }
    const thumbnailStyle = thumbnail
      ? `background-image: url('${thumbnail}')`
      : "background: linear-gradient(135deg, var(--muted) 0%, var(--surface) 100%)";
    const categoryName =
      template.category?.name || template.category_name || "";
    const useCount = template.use_count || template.uses || 0;
    const isPremiumTemplate = template.is_premium || false;
    const canAccessPremium =
      window.featureGate?.canAccessPremiumTemplates() || false;
    const isLocked = isPremiumTemplate && !canAccessPremium;
    const isLoggedIn = window.authManager?.isLoggedIn() || false;
    const isAdmin = window.authManager?.isAdmin?.() || false;
    const premiumBadge = isPremiumTemplate
      ? `
      <div class="wf-template-premium-badge" title="${t("workflow.premiumTemplate") || "Template Premium"}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z"/>
        </svg>
        <span>Premium</span>
      </div>
    `
      : "";
    const lockOverlay = "";
    const editButton = isAdmin
      ? `
      <button class="wf-template-edit-btn" title="${t("workflow.editTemplate") || "Edit template"}">
        <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.75 15.7502H9.75002M1.875 16.1252L6.03695 14.5245C6.30316 14.4221 6.43626 14.3709 6.56079 14.3041C6.6714 14.2447 6.77685 14.1761 6.87603 14.0992C6.98769 14.0125 7.08853 13.9117 7.29021 13.71L15.75 5.25023C16.5784 4.4218 16.5784 3.07865 15.75 2.25023C14.9216 1.4218 13.5784 1.4218 12.75 2.25022L4.29021 10.71C4.08853 10.9117 3.98769 11.0125 3.90104 11.1242C3.82408 11.2234 3.75555 11.3288 3.69618 11.4394C3.62933 11.564 3.57814 11.6971 3.47575 11.9633L1.875 16.1252ZM1.875 16.1252L3.41859 12.1119C3.52905 11.8248 3.58428 11.6812 3.67901 11.6154C3.76179 11.5579 3.86423 11.5362 3.96322 11.5551C4.0765 11.5767 4.18529 11.6855 4.40286 11.9031L6.09718 13.5974C6.31475 13.815 6.42354 13.9237 6.44517 14.037C6.46408 14.136 6.44234 14.2385 6.38486 14.3212C6.31908 14.416 6.17549 14.4712 5.8883 14.5817L1.875 16.1252Z"/></svg>
      </button>
    `
      : "";
    const shareButton = template.slug
      ? `
      <button class="wf-template-share-btn" data-template-slug="${this._escapeHtml(template.slug)}" title="${t("workflow.copyShareLink") || "Copy share link"}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
      </button>
    `
      : "";
    const videoButton = template.video_url
      ? `
      <button class="wf-template-video-btn" data-video-url="${this._escapeHtml(template.video_url)}" title="${t("workflow.watchDemo") || "Xem video demo"}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/>
        </svg>
      </button>
    `
      : "";
    const hoverOverlay = `
      <div class="wf-template-hover-overlay">
        <button class="wf-template-use-btn" title="${t("workflow.useTemplate") || "Use template"}">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M11.8525 4.21651L11.7221 3.2387C11.6906 3.00226 11.4889 2.82568 11.2504 2.82568C11.0118 2.82568 10.8102 3.00226 10.7786 3.23869L10.6483 4.21651C10.2658 7.0847 8.00939 9.34115 5.14119 9.72358L4.16338 9.85396C3.92694 9.88549 3.75037 10.0872 3.75037 10.3257C3.75037 10.5642 3.92694 10.7659 4.16338 10.7974L5.14119 10.9278C8.00938 11.3102 10.2658 13.5667 10.6483 16.4349L10.7786 17.4127C10.8102 17.6491 11.0118 17.8257 11.2504 17.8257C11.4889 17.8257 11.6906 17.6491 11.7221 17.4127L11.8525 16.4349C12.2349 13.5667 14.4913 11.3102 17.3595 10.9278L18.3374 10.7974C18.5738 10.7659 18.7504 10.5642 18.7504 10.3257C18.7504 10.0872 18.5738 9.88549 18.3374 9.85396L17.3595 9.72358C14.4913 9.34115 12.2349 7.0847 11.8525 4.21651Z"></path><path d="M4.6519 14.7568L4.82063 14.2084C4.84491 14.1295 4.91781 14.0757 5.00037 14.0757C5.08292 14.0757 5.15582 14.1295 5.1801 14.2084L5.34883 14.7568C5.56525 15.4602 6.11587 16.0108 6.81925 16.2272L7.36762 16.3959C7.44652 16.4202 7.50037 16.4931 7.50037 16.5757C7.50037 16.6582 7.44652 16.7311 7.36762 16.7554L6.81926 16.9241C6.11587 17.1406 5.56525 17.6912 5.34883 18.3946L5.1801 18.9429C5.15582 19.0218 5.08292 19.0757 5.00037 19.0757C4.91781 19.0757 4.84491 19.0218 4.82063 18.9429L4.65191 18.3946C4.43548 17.6912 3.88486 17.1406 3.18147 16.9241L2.63311 16.7554C2.55421 16.7311 2.50037 16.6582 2.50037 16.5757C2.50037 16.4931 2.55421 16.4202 2.63311 16.3959L3.18148 16.2272C3.88486 16.0108 4.43548 15.4602 4.6519 14.7568Z"></path></svg>
          ${t("workflow.useTemplate") || "Use template"}
        </button>
      </div>
    `;
    const upgradeOverlay = isLocked
      ? `
      <div class="wf-template-hover-overlay wf-template-hover-overlay--locked">
        <button class="wf-template-upgrade-btn" title="${t("common.upgrade") || "Upgrade"}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z"/>
          </svg>
          ${t("common.upgrade") || "Upgrade"}
        </button>
      </div>
    `
      : "";
    return `
      <div class="wf-template-card${isLocked ? " wf-template-locked" : ""}${isPremiumTemplate ? " wf-template-premium" : ""}" data-template-id="${template.id}" data-is-premium="${isPremiumTemplate}" data-is-locked="${isLocked}">
        <div class="wf-template-thumb" style="${thumbnailStyle}">
          ${
            !thumbnail
              ? `
            <svg class="wf-template-placeholder" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <path d="M21 15l-5-5L5 21"/>
            </svg>
          `
              : ""
          }
          ${premiumBadge}
          ${lockOverlay}
          ${hoverOverlay}
          ${upgradeOverlay}
          ${videoButton}
          ${shareButton}
          ${editButton}
        </div>
        <div class="wf-template-info">
          <div class="wf-template-name" title="${this._escapeHtml(template.name)}">${this._escapeHtml(template.name) || t("workflow.unnamed")}</div>
          <div class="wf-template-meta">
            ${categoryName ? `<span class="wf-template-category">${this._escapeHtml(categoryName)}</span>` : ""}
            <span class="wf-template-nodes-count" title="${t("workflow.nodesInWorkflow") || "Nodes in workflow"}">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M6.17 3.646a.5.5 0 0 1 .707 0l5.477 5.477a.5.5 0 0 1 0 .707l-1.366 1.366a4.373 4.373 0 1 1-6.184-6.184L6.17 3.646Zm.353 1.061L5.508 5.723 5.5 5.73a3.373 3.373 0 1 0 4.77 4.77l.006-.008 1.016-1.015-4.77-4.77Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M5.354 10.646a.5.5 0 0 1 0 .707L3.02 13.688a.5.5 0 1 1-.707-.707l2.334-2.334a.5.5 0 0 1 .707 0ZM10.354 2.313a.5.5 0 0 1 0 .707L8.02 5.354a.5.5 0 0 1-.707-.708l2.334-2.333a.5.5 0 0 1 .707 0ZM13.687 5.646a.5.5 0 0 1 0 .708l-2.333 2.333a.5.5 0 1 1-.707-.707l2.333-2.334a.5.5 0 0 1 .707 0Z" fill="currentColor"/></svg>
              ${(template.nodes || []).length} ${t("workflow.nodes") || "nodes"}
            </span>
          </div>
          <div class="wf-template-footer">
            <span class="wf-template-use-count">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15.5385 11.4899C17.7949 11.4899 19.641 9.65316 19.641 7.40826C19.641 5.16336 17.7949 3.32663 15.5385 3.32663C15.4359 3.32663 15.3334 3.32663 15.2308 3.32663C15.8462 4.34704 16.2564 5.57153 16.2564 6.79602C16.2564 8.53071 15.5385 10.1634 14.4103 11.3879C14.718 11.4899 15.1282 11.4899 15.5385 11.4899Z" fill="currentColor"/><path d="M17.2821 13.6326H16.2565C17.7949 14.9591 18.8206 17 18.8206 19.2448C18.8206 19.7551 18.718 20.1632 18.6154 20.5714C19.9488 20.3673 20.7693 20.0612 21.2821 19.7551C21.7949 19.4489 22.0001 18.9387 22.0001 18.3265C22.0001 15.7755 19.8462 13.6326 17.2821 13.6326Z" fill="currentColor"/><path d="M9.38459 11.4898C10.6154 11.4898 11.641 11.0817 12.5641 10.2654C13.5897 9.44903 14.1025 8.1225 14.1025 6.79597C14.1025 5.77556 13.7948 4.75515 13.1795 4.04087C12.3589 2.81638 11.0256 2.00005 9.38459 2.00005C6.82049 2.00005 4.66664 4.14291 4.66664 6.69393C4.66664 9.34699 6.82049 11.4898 9.38459 11.4898Z" fill="currentColor"/><path d="M12.1538 13.9389C11.8462 13.9389 11.641 13.8369 11.3333 13.8369H7.4359C4.46154 13.8369 2 16.2859 2 19.245C2 19.9593 2.30769 20.4695 2.82051 20.8777C3.64103 21.3879 5.58974 22.0001 9.38461 22.0001C13.1795 22.0001 15.0256 21.3879 15.9487 20.8777C15.9487 20.8777 16.0513 20.7757 16.1538 20.7757C16.5641 20.4695 16.8718 19.9593 16.8718 19.245C16.7692 16.592 14.8205 14.3471 12.1538 13.9389Z" fill="currentColor"/></svg>
              ${useCount}
            </span>
            ${this._renderRatingDisplay(template.avg_rating || template.rating_avg, template.ratings_count || template.rating_count)}
          </div>
        </div>
      </div>
    `;
  }
  async _handleImport(template) {
    console.log(
      "[WorkflowTemplateList] Import template:",
      template?.id,
      template?.name,
    );
    const t = (key, params) => window.I18n?.t(key, params) || key;
    const importBtns = this.container.querySelectorAll(
      ".wf-template-import-btn",
    );
    importBtns.forEach((btn) => (btn.disabled = true));
    try {
      if (!window.authManager?.isLoggedIn()) {
        window.featureGate?.showLoginPrompt?.(
          t("workflow.requireLoginToImport") ||
            "Login required to import workflows",
        );
        return;
      }
      if (!template?.id) {
        window.customDialog?.alert(
          t("workflow.templateNotFound") || "Template not found",
          { type: "error" },
        );
        return;
      }
      await this._copyTemplateToWorkflow(template.id, template);
    } catch (err) {
      console.error("[WorkflowTemplateList] Import failed:", err);
      if (window.customDialog) {
        window.customDialog.alert(
          t("workflow.importFailed") + ": " + (err?.message || ""),
          { type: "error" },
        );
      }
    } finally {
      importBtns.forEach((btn) => (btn.disabled = false));
    }
  }
  _showTemplateDetail(template) {
    const t = (key, params) => window.I18n?.t(key, params) || key;
    console.log("[WorkflowTemplateList] Showing template detail:", {
      id: template.id,
      name: template.name,
      thumbnail_url: template.thumbnail_url,
      description: template.description,
    });
    const thumbnail =
      template.thumbnail_url ||
      template.thumbnail ||
      template.preview_image ||
      "";
    const thumbnailHtml = thumbnail
      ? `<img src="${thumbnail}" class="wf-detail-thumb-img" alt="${this._escapeHtml(template.name)}" />`
      : `<div class="wf-detail-thumb-placeholder">
           <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
             <rect x="3" y="3" width="18" height="18" rx="2"/>
             <circle cx="8.5" cy="8.5" r="1.5"/>
             <path d="M21 15l-5-5L5 21"/>
           </svg>
         </div>`;
    const categoryName =
      template.category?.name || template.category_name || "";
    const useCount = template.use_count || template.uses || 0;
    const isPremiumTemplate = template.is_premium || false;
    const premiumTooltip =
      t("workflow.premiumTemplateUpgradeHint") ||
      "Premium template \u2014 upgrade to the Premium plan to copy and use this workflow.";
    const premiumThumbBadge = isPremiumTemplate
      ? `
      <div class="wf-detail-premium-badge" title="${this._escapeHtml(premiumTooltip)}" data-tooltip="${this._escapeHtml(premiumTooltip)}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z"/></svg>
        <span>Premium</span>
      </div>`
      : "";
    const premiumUpgradeLabel = isPremiumTemplate
      ? `
      <div class="wf-detail-premium-notice">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <span>${this._escapeHtml(premiumTooltip)}</span>
      </div>`
      : "";
    let nodesPreview = "";
    if (
      template.nodes &&
      Array.isArray(template.nodes) &&
      template.nodes.length > 0
    ) {
      const typeCounts = new Map();
      for (const node of template.nodes) {
        const type = (node.type || node.node_type || "default")
          .toString()
          .toLowerCase();
        typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
      }
      const typeLabel = (type) => {
        const nm = window.NodeTemplates?.getType?.(type)?.name;
        return typeof nm === "string" && nm
          ? nm
          : type.charAt(0).toUpperCase() + type.slice(1);
      };
      nodesPreview = `
        <div class="wf-detail-nodes wf-detail-nodes-compact">
          ${[...typeCounts.entries()].map(([type, count]) => `<span class="wf-detail-node-pill wf-detail-node-pill--${type}">${this._escapeHtml(typeLabel(type))}<span class="wf-detail-node-pill-count">${count}</span></span>`).join("")}
        </div>
      `;
    }
    const isLoggedIn = window.authManager?.isLoggedIn() || false;
    const primaryActionBtn = isLoggedIn
      ? `<button class="wf-detail-use-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          ${t("workflow.useTemplate") || "Use template"}
        </button>`
      : `<button class="wf-detail-import-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          ${t("workflow.importTemplate")}
        </button>`;
    const modalHtml = `
      <div class="wf-detail-modal-overlay">
        <div class="wf-detail-modal">
          <div class="wf-detail-header">
            <h3 class="wf-detail-title">${this._escapeHtml(template.name) || t("workflow.unnamed")}</h3>
            <div class="wf-detail-header-actions">
              ${
                template.video_url
                  ? `
                <button class="wf-detail-video-btn" data-video-url="${this._escapeHtml(template.video_url)}" title="${t("workflow.watchDemo") || "Xem video demo"}">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/>
                  </svg>
                </button>
              `
                  : ""
              }
              <button class="wf-detail-close-btn" title="${t("common.close")}">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
          <div class="wf-detail-body">
            <div class="wf-detail-thumb">
              ${thumbnailHtml}
              ${
                template.video_url
                  ? `
                <button type="button" class="wf-detail-thumb-video-play" data-video-url="${this._escapeHtml(template.video_url)}" aria-label="${t("workflow.watchDemo") || "Xem video demo"}" title="${t("workflow.watchDemo") || "Xem video demo"}">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.87l10.5-6.86a1 1 0 0 0 0-1.74L9.5 4.27A1 1 0 0 0 8 5.14Z" fill="currentColor"/></svg>
                </button>
              `
                  : ""
              }
              ${premiumThumbBadge}
            </div>
            ${premiumUpgradeLabel}
            <div class="wf-detail-info">
              ${template.description ? `<p class="wf-detail-desc">${this._escapeHtml(template.description)}</p>` : ""}
              <div class="wf-detail-meta">
                <div class="wf-detail-meta-left">
                  ${categoryName ? `<span class="wf-detail-category">${this._escapeHtml(categoryName)}</span>` : ""}
                  <span class="wf-detail-uses">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15.5385 11.4899C17.7949 11.4899 19.641 9.65316 19.641 7.40826C19.641 5.16336 17.7949 3.32663 15.5385 3.32663C15.4359 3.32663 15.3334 3.32663 15.2308 3.32663C15.8462 4.34704 16.2564 5.57153 16.2564 6.79602C16.2564 8.53071 15.5385 10.1634 14.4103 11.3879C14.718 11.4899 15.1282 11.4899 15.5385 11.4899Z" fill="currentColor"/><path d="M17.2821 13.6326H16.2565C17.7949 14.9591 18.8206 17 18.8206 19.2448C18.8206 19.7551 18.718 20.1632 18.6154 20.5714C19.9488 20.3673 20.7693 20.0612 21.2821 19.7551C21.7949 19.4489 22.0001 18.9387 22.0001 18.3265C22.0001 15.7755 19.8462 13.6326 17.2821 13.6326Z" fill="currentColor"/><path d="M9.38459 11.4898C10.6154 11.4898 11.641 11.0817 12.5641 10.2654C13.5897 9.44903 14.1025 8.1225 14.1025 6.79597C14.1025 5.77556 13.7948 4.75515 13.1795 4.04087C12.3589 2.81638 11.0256 2.00005 9.38459 2.00005C6.82049 2.00005 4.66664 4.14291 4.66664 6.69393C4.66664 9.34699 6.82049 11.4898 9.38459 11.4898Z" fill="currentColor"/><path d="M12.1538 13.9389C11.8462 13.9389 11.641 13.8369 11.3333 13.8369H7.4359C4.46154 13.8369 2 16.2859 2 19.245C2 19.9593 2.30769 20.4695 2.82051 20.8777C3.64103 21.3879 5.58974 22.0001 9.38461 22.0001C13.1795 22.0001 15.0256 21.3879 15.9487 20.8777C15.9487 20.8777 16.0513 20.7757 16.1538 20.7757C16.5641 20.4695 16.8718 19.9593 16.8718 19.245C16.7692 16.592 14.8205 14.3471 12.1538 13.9389Z" fill="currentColor"/></svg>
                    ${useCount} ${t("workflow.useCount")}
                  </span>
                  <span class="wf-detail-nodes-count" title="${t("workflow.nodesInWorkflow") || "Nodes in workflow"}">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M6.17 3.646a.5.5 0 0 1 .707 0l5.477 5.477a.5.5 0 0 1 0 .707l-1.366 1.366a4.373 4.373 0 1 1-6.184-6.184L6.17 3.646Zm.353 1.061L5.508 5.723 5.5 5.73a3.373 3.373 0 1 0 4.77 4.77l.006-.008 1.016-1.015-4.77-4.77Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M5.354 10.646a.5.5 0 0 1 0 .707L3.02 13.688a.5.5 0 1 1-.707-.707l2.334-2.334a.5.5 0 0 1 .707 0ZM10.354 2.313a.5.5 0 0 1 0 .707L8.02 5.354a.5.5 0 0 1-.707-.708l2.334-2.333a.5.5 0 0 1 .707 0ZM13.687 5.646a.5.5 0 0 1 0 .708l-2.333 2.333a.5.5 0 1 1-.707-.707l2.333-2.334a.5.5 0 0 1 .707 0Z" fill="currentColor"/></svg>
                    ${(template.nodes || []).length} ${t("workflow.nodes") || "nodes"}
                  </span>
                </div>
                <div class="wf-detail-meta-right">
                  ${this._renderCombinedRating(template.id, template.avg_rating || template.rating_avg, template.ratings_count || template.rating_count, template.user_rating)}
                </div>
              </div>
            </div>
            ${nodesPreview}
          </div>
          <div class="wf-detail-footer">
            <button class="wf-detail-cancel-btn">${t("common.cancel")}</button>
            <button class="wf-detail-preview-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              ${t("workflow.previewBtn") || "Preview"}
            </button>
            ${primaryActionBtn}
          </div>
        </div>
      </div>
    `;
    const existingModal = document.querySelector(".wf-detail-modal-overlay");
    if (existingModal) existingModal.remove();
    document.body.insertAdjacentHTML("beforeend", modalHtml);
    const modalOverlay = document.querySelector(".wf-detail-modal-overlay");
    const closeBtn = modalOverlay.querySelector(".wf-detail-close-btn");
    const cancelBtn = modalOverlay.querySelector(".wf-detail-cancel-btn");
    const importBtn = modalOverlay.querySelector(".wf-detail-import-btn");
    const useBtn = modalOverlay.querySelector(".wf-detail-use-btn");
    const previewBtn = modalOverlay.querySelector(".wf-detail-preview-btn");
    const closeModal = () => {
      modalOverlay.remove();
    };
    closeBtn.addEventListener("click", closeModal);
    cancelBtn.addEventListener("click", closeModal);
    modalOverlay.addEventListener("click", (e) => {
      if (e.target === modalOverlay) closeModal();
    });
    this._bindInteractiveRating(modalOverlay, template.id);
    if (previewBtn) {
      previewBtn.addEventListener("click", () => {
        closeModal();
        this._openTemplateInEditor(template);
      });
    }
    const videoBtn = modalOverlay.querySelector(".wf-detail-video-btn");
    if (videoBtn) {
      videoBtn.addEventListener("click", () => {
        const videoUrl = videoBtn.dataset.videoUrl;
        if (videoUrl) {
          this._showVideoModal(videoUrl);
        }
      });
    }
    const thumbnailVideoBtn = modalOverlay.querySelector(
      ".wf-detail-thumb-video-play",
    );
    if (thumbnailVideoBtn) {
      thumbnailVideoBtn.addEventListener("click", () => {
        const videoUrl = thumbnailVideoBtn.dataset.videoUrl;
        if (videoUrl) this._showVideoModal(videoUrl);
      });
    }
    if (useBtn) {
      useBtn.addEventListener("click", async () => {
        closeModal();
        await this._copyTemplateToWorkflow(template.id, template);
      });
    }
    if (importBtn) {
      importBtn.addEventListener("click", async () => {
        closeModal();
        await this._handleImport(template);
      });
    }
    const escHandler = (e) => {
      if (e.key === "Escape") {
        closeModal();
      }
    };
    document.addEventListener("keydown", escHandler);
    const originalCloseModal = closeModal;
    const closeModalWithCleanup = () => {
      document.removeEventListener("keydown", escHandler);
      originalCloseModal();
    };
    closeBtn.removeEventListener("click", closeModal);
    cancelBtn.removeEventListener("click", closeModal);
    closeBtn.addEventListener("click", closeModalWithCleanup);
    cancelBtn.addEventListener("click", closeModalWithCleanup);
    modalOverlay.removeEventListener("click", closeModal);
    modalOverlay.addEventListener("click", (e) => {
      if (e.target === modalOverlay) closeModalWithCleanup();
    });
    if (useBtn) {
      useBtn.removeEventListener("click", useBtn._handler);
      useBtn._handler = async () => {
        closeModalWithCleanup();
        await this._copyTemplateToWorkflow(template.id, template);
      };
      useBtn.addEventListener("click", useBtn._handler);
    }
    if (importBtn) {
      importBtn.removeEventListener("click", importBtn._handler);
      importBtn._handler = async () => {
        closeModalWithCleanup();
        await this._handleImport(template);
      };
      importBtn.addEventListener("click", importBtn._handler);
    }
  }
  _showVideoModal(videoUrl) {
    const t = (key) => window.I18n?.t(key) || key;
    let videoId = "";
    let isPortraitVideo = false;
    try {
      const url = new URL(videoUrl);
      const hostname = url.hostname.toLowerCase();
      const youtubeHosts = new Set([
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
      ]);
      if (youtubeHosts.has(hostname)) {
        if (url.pathname === "/watch")
          videoId = url.searchParams.get("v") || "";
        else {
          const [, route, id] = url.pathname.split("/");
          if (["embed", "shorts", "live"].includes(route)) {
            videoId = id || "";
            isPortraitVideo = route === "shorts";
          }
        }
      } else if (hostname === "youtu.be" || hostname === "www.youtu.be") {
        videoId = url.pathname.split("/").filter(Boolean)[0] || "";
      }
    } catch (error) {
      console.warn(
        "[WorkflowTemplateList] Invalid YouTube video URL:",
        videoUrl,
        error,
      );
    }
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
      console.warn(
        "[WorkflowTemplateList] Unsupported YouTube video URL:",
        videoUrl,
      );
      return;
    }
    const apiBase = window.ApiBaseConfig?.get?.();
    let playerOrigin = "";
    try {
      playerOrigin = new URL(apiBase).origin;
    } catch (error) {
      console.warn(
        "[WorkflowTemplateList] Cannot resolve hosted video player origin:",
        error,
      );
      return;
    }
    document.querySelector(".wf-video-modal-overlay")?.remove();
    const embedUrl = `${playerOrigin}/embed/youtube/${videoId}`;
    const modalContainer = document.createElement("div");
    modalContainer.innerHTML = `
      <div class="wf-video-modal-overlay" role="dialog" aria-modal="true" aria-label="${this._escapeHtml(t("workflow.watchDemo") || "Xem video demo")}">
        <div class="wf-video-modal${isPortraitVideo ? " wf-video-modal--portrait" : ""}">
          <div class="wf-video-container" aria-busy="true">
            <div class="wf-video-loading" role="status" aria-live="polite" aria-label="${this._escapeHtml(t("common.loading"))}"></div>
            <iframe src="${embedUrl}" title="${this._escapeHtml(t("workflow.watchDemo") || "Xem video demo")}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
          </div>
        </div>
        <button type="button" class="wf-video-modal-close" title="${this._escapeHtml(t("common.close") || "Close")}" aria-label="${this._escapeHtml(t("common.close") || "Close")}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`;
    const modalOverlay = modalContainer.firstElementChild;
    const playerFrame = modalOverlay.querySelector(
      ".wf-video-container iframe",
    );
    playerFrame?.addEventListener(
      "load",
      () => {
        const videoContainer = playerFrame.closest(".wf-video-container");
        videoContainer?.classList.add("is-loaded");
        videoContainer?.setAttribute("aria-busy", "false");
      },
      { once: true },
    );
    document.body.appendChild(modalOverlay);
    const closeModal = () => {
      modalOverlay.querySelector("iframe")?.setAttribute("src", "about:blank");
      modalOverlay.remove();
      document.removeEventListener("keydown", escHandler);
    };
    const escHandler = (event) => {
      if (event.key === "Escape") closeModal();
    };
    modalOverlay
      .querySelector(".wf-video-modal-close")
      ?.addEventListener("click", closeModal);
    modalOverlay.addEventListener("click", (event) => {
      if (event.target === modalOverlay) closeModal();
    });
    document.addEventListener("keydown", escHandler);
  }
  async _copyTemplateShareLink(slug) {
    const t = (k) => window.I18n?.t(k) || k;
    try {
      const apiBase = window.ApiBaseConfig?.get?.() || "";
      const origin = apiBase.replace(/\/api\/v\d+\/?$/, "");
      const shareUrl = `${origin}/workflows/${slug}`;
      await navigator.clipboard.writeText(shareUrl);
      window.showNotification?.(
        t("workflow.shareLinkCopied") || `Link copied: ${shareUrl}`,
        "success",
        3e3,
      );
    } catch (e) {
      console.error("[WorkflowTemplateList] Copy share link failed:", e);
      window.showNotification?.(
        t("workflow.shareLinkCopyFailed") || "Unable to copy share link",
        "error",
      );
    }
  }
  async _openTemplateInEditor(template) {
    const t = (key, params) => window.I18n?.t(key, params) || key;
    const dialog = window.customDialog;
    let freshTemplate = template;
    try {
      const fetched = await this._fetchTemplateById(template.id);
      if (fetched) {
        freshTemplate = fetched;
      }
    } catch (err) {
      console.warn(
        "[WorkflowTemplateList] Failed to fetch fresh template, using cached:",
        err,
      );
    }
    if (
      freshTemplate &&
      freshTemplate.is_premium == null &&
      template?.is_premium != null
    ) {
      freshTemplate.is_premium = template.is_premium;
    }
    console.log(
      "[WorkflowTemplateList] Opening template in LITE preview:",
      freshTemplate.id,
    );
    try {
      chrome.runtime.sendMessage(
        { action: "openWorkflowTemplatePreview", template: freshTemplate },
        () => void chrome.runtime.lastError,
      );
    } catch (e) {
      console.error(
        "[WorkflowTemplateList] open lite preview failed:",
        e?.message,
      );
    }
  }
  async _confirmDeleteTemplate(template) {
    const t = (key, params) => window.I18n?.t(key, params) || key;
    const dialog = window.customDialog || window.CustomDialog;
    if (!window.featureGate?.canManageWorkflowTemplates()) {
      window.showNotification?.(
        t("workflow.adminRequired") ||
          "Admin permission required for this action",
        "error",
      );
      return false;
    }
    if (!dialog) {
      const confirmed = confirm(
        t("workflow.confirmDeleteTemplate", { name: template.name }) ||
          `B\u1EA1n c\xF3 ch\u1EAFc mu\u1ED1n x\xF3a template "${template.name}"? H\xE0nh \u0111\u1ED9ng n\xE0y kh\xF4ng th\u1EC3 ho\xE0n t\xE1c.`,
      );
      if (!confirmed) return false;
    } else {
      const confirmed = await dialog.confirm(
        t("workflow.confirmDeleteTemplate", { name: template.name }) ||
          `B\u1EA1n c\xF3 ch\u1EAFc mu\u1ED1n x\xF3a template "${template.name}"?`,
        {
          title: t("workflow.deleteTemplate") || "Delete Template",
          type: "danger",
          confirmText: t("common.delete") || "Delete",
          cancelText: t("common.cancel") || "Cancel",
        },
      );
      if (!confirmed) return false;
    }
    try {
      await this._apiCall(`admin/workflow-templates/${template.id}`, "DELETE");
      window.showNotification?.(
        t("workflow.deleteTemplateSuccess") || "Template deleted successfully",
        "success",
      );
      this._loadTemplates(false);
      return true;
    } catch (err) {
      console.error(
        "[WorkflowTemplateList] X\xF3a template th\u1EA5t b\u1EA1i:",
        err,
      );
      window.showNotification?.(
        t("workflow.deleteTemplateFailed") || "Could not delete template",
        "error",
      );
      return false;
    }
  }
  async _trackTemplateUse(templateId) {
    try {
      await this._apiCall(`workflow-templates/${templateId}/use`, "POST");
    } catch (err) {
      console.warn("[WorkflowTemplateList] Failed to track template use:", err);
    }
  }
  async _showUseTemplateConfirmation(template) {
    const t = (key, params) => window.I18n?.t(key, params) || key;
    return new Promise((resolve) => {
      const thumbnail =
        template.thumbnail_url ||
        template.thumbnail ||
        template.preview_image ||
        "";
      const thumbnailHtml = thumbnail
        ? `<img src="${thumbnail}" class="wf-confirm-thumb-img" alt="${this._escapeHtml(template.name)}" />`
        : `<div class="wf-confirm-thumb-placeholder">
             <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
               <rect x="3" y="3" width="18" height="18" rx="2"/>
               <circle cx="8.5" cy="8.5" r="1.5"/>
               <path d="M21 15l-5-5L5 21"/>
             </svg>
           </div>`;
      const nodeCount = (template.nodes || []).length;
      const modalHtml = `
        <div class="wf-confirm-modal-overlay" id="useTemplateConfirmModal">
          <div class="wf-confirm-modal">
            <div class="wf-confirm-header">
              <h3 class="wf-confirm-title">${t("workflow.useTemplateConfirmTitle") || "Use Template"}</h3>
              <button class="wf-confirm-close-btn" data-action="cancel" title="${t("common.close") || "Close"}">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div class="wf-confirm-body">
              <div class="wf-confirm-template-info">
                <div class="wf-confirm-thumb">${thumbnailHtml}</div>
                <div class="wf-confirm-details">
                  <h4 class="wf-confirm-name">${this._escapeHtml(template.name) || t("workflow.unnamed")}</h4>
                  ${template.description ? `<p class="wf-confirm-desc">${this._escapeHtml(template.description)}</p>` : ""}
                  <div class="wf-confirm-meta">
                    <span class="wf-confirm-nodes">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="6" cy="6" r="3"/>
                        <circle cx="18" cy="18" r="3"/>
                        <path d="M9 6h6a3 3 0 0 1 3 3v6"/>
                      </svg>
                      ${nodeCount} ${t("workflow.nodes") || "nodes"}
                    </span>
                  </div>
                </div>
              </div>
              <div class="wf-confirm-message">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="16" x2="12" y2="12"/>
                  <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
                <span>${t("workflow.useTemplateConfirmMessage") || "This template will be copied as a new workflow in your account. You can edit it freely without affecting the original template."}</span>
              </div>
            </div>
            <div class="wf-confirm-footer">
              <button class="wf-confirm-cancel-btn" data-action="cancel">
                ${t("common.cancel") || "Cancel"}
              </button>
              <button class="wf-confirm-use-btn" data-action="confirm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 5v14"/>
                  <path d="M5 12h14"/>
                </svg>
                ${t("workflow.useTemplate") || "Use template"}
              </button>
            </div>
          </div>
        </div>
      `;
      document.querySelectorAll("#useTemplateConfirmModal").forEach((el) => {
        const wrapper =
          el.parentElement?.children.length === 1 ? el.parentElement : null;
        el.remove();
        if (wrapper && wrapper.parentElement === document.body)
          wrapper.remove();
      });
      const modalContainer = document.createElement("div");
      modalContainer.innerHTML = modalHtml;
      document.body.appendChild(modalContainer);
      const modal = modalContainer.querySelector("#useTemplateConfirmModal");
      const handleAction = (action) => {
        document.removeEventListener("keydown", handleKeyDown);
        modal?.remove();
        modalContainer?.remove();
        resolve(action === "confirm");
      };
      const handleKeyDown = (e) => {
        if (e.key === "Escape") {
          handleAction("cancel");
        }
      };
      if (!modal) {
        console.warn(
          "[WorkflowTemplateList] useTemplateConfirmModal element not found after render",
        );
        modalContainer?.remove();
        resolve(false);
        return;
      }
      modal.addEventListener("click", (e) => {
        const action = e.target.closest("[data-action]")?.dataset?.action;
        if (action) {
          handleAction(action);
          return;
        }
        if (e.target === modal) {
          handleAction("cancel");
        }
      });
      document.addEventListener("keydown", handleKeyDown);
      setTimeout(() => {
        modal?.querySelector(".wf-confirm-use-btn")?.focus();
      }, 100);
    });
  }
  async _copyTemplateToWorkflow(templateId, templateObj = null) {
    const t = (key, params) => window.I18n?.t(key, params) || key;
    const dialog = window.customDialog || window.CustomDialog;
    console.log(
      "[CloneDebug] _copyTemplateToWorkflow START id=",
      templateId,
      "hasObj=",
      !!templateObj,
      "isCopying=",
      this._isCopyingTemplate,
    );
    if (this._isCopyingTemplate) {
      console.log(
        "[CloneDebug] EARLY RETURN: _isCopyingTemplate lock \u0111ang b\u1EADt \u2192 no modal",
      );
      return;
    }
    const now = Date.now();
    const cooldownMs = 3e3;
    if (this._lastCloneTime && now - this._lastCloneTime < cooldownMs) {
      console.log("[CloneDebug] EARLY RETURN: cooldown 3s \u2192 no modal");
      const waitSec = Math.ceil(
        (cooldownMs - (now - this._lastCloneTime)) / 1e3,
      );
      window.showNotification?.(
        t("workflow.pleaseWaitBeforeClone", { seconds: waitSec }) ||
          `Please wait ${waitSec} seconds before cloning the next template`,
        "warning",
      );
      return;
    }
    const template =
      templateObj ||
      this.templates.find((tpl) => String(tpl.id) === String(templateId));
    if (!template) {
      console.warn(
        "[CloneDebug] _copyTemplateToWorkflow: template NOT FOUND (id=" +
          templateId +
          ", hasObj=" +
          !!templateObj +
          ") \u2192 return, no modal",
      );
      window.showNotification?.(
        t("workflow.templateNotFound") || "Template not found",
        "error",
      );
      return;
    }
    console.log(
      "[CloneDebug] _copyTemplateToWorkflow: template OK (name=" +
        (template.name || "?") +
        ", nodes=" +
        (template.nodes?.length ?? "n/a") +
        ") \u2192 m\u1EDF modal x\xE1c nh\u1EADn",
    );
    if (
      window.ProjectHelper &&
      !(await window.ProjectHelper.ensureProjectOrGuide())
    ) {
      return;
    }
    this._isCopyingTemplate = true;
    let confirmed = false;
    try {
      confirmed = await this._showUseTemplateConfirmation(template);
    } catch (e) {
      this._isCopyingTemplate = false;
      throw e;
    }
    if (!confirmed) {
      console.log(
        "[WorkflowTemplateList] User cancelled use template confirmation",
      );
      this._isCopyingTemplate = false;
      return;
    }
    try {
      if (!window.authManager?.isLoggedIn()) {
        window.showNotification?.(
          t("workflow.loginRequiredToCopy") ||
            "Please login to copy this template",
          "warning",
        );
        if (window.featureGate?.showLoginPrompt) {
          window.featureGate.showLoginPrompt(
            t("workflow.loginToCloneTemplate") ||
              "Login to clone this template to your workflows",
          );
        }
        return;
      }
      if (
        window.featureGate &&
        !window.featureGate.canUse("workflows_enabled")
      ) {
        const isLoggedIn = window.authManager?.isLoggedIn?.();
        const ctaText = isLoggedIn
          ? t("common.upgrade") || "Upgrade"
          : t("auth.login") || "Login";
        const titleText = isLoggedIn
          ? t("featuregate.featureLockedTitle") || "Feature Locked"
          : t("featuregate.loginRequiredTitle") || "Login Required";
        const msgText = isLoggedIn
          ? t("workflow.useTemplateRequiresUpgrade") ||
            "Workflow creation is not enabled for your plan. Upgrade to copy this template."
          : t("workflow.useTemplateRequiresLogin") ||
            "Please login to copy this template to your account.";
        const ok = await dialog?.confirm(msgText, {
          title: titleText,
          type: "warning",
          confirmText: ctaText,
          cancelText: t("common.later") || "Later",
        });
        if (ok) {
          if (isLoggedIn) {
            if (typeof window.openUpgradeModal === "function") {
              window.openUpgradeModal();
            } else {
              try {
                chrome.runtime.sendMessage({ action: "showUpgradeModal" });
              } catch (e) {}
            }
          } else {
            const loginOverlay = document.getElementById("loginOverlay");
            if (loginOverlay) loginOverlay.classList.remove("hidden");
          }
        }
        return;
      }
      const template2 =
        templateObj ||
        this.templates.find((tpl) => String(tpl.id) === String(templateId));
      if (
        template2?.is_premium &&
        !window.featureGate?.canAccessPremiumTemplates()
      ) {
        const shouldUpgrade = await dialog?.confirm(
          t("workflow.premiumTemplateRequired") ||
            "You need to upgrade your plan to use this premium template.",
          {
            title:
              t("workflow.premiumRequired") ||
              "This template requires Premium plan",
            type: "warning",
            confirmText: t("common.upgrade") || "Upgrade",
            cancelText: t("common.later") || "Later",
          },
        );
        if (shouldUpgrade) {
          if (typeof window.openUpgradeModal === "function") {
            window.openUpgradeModal();
          } else {
            try {
              chrome.runtime.sendMessage({ action: "showUpgradeModal" });
            } catch (e) {}
          }
        }
        return;
      }
      if (window.featureGate) {
        try {
          await window.featureGate.refresh({ force: true });
        } catch (e) {}
        const quota = window.featureGate.checkQuota("workflows_max");
        if (
          quota.limit !== "unlimited" &&
          quota.limit > 0 &&
          quota.used >= quota.limit
        ) {
          const shouldUpgrade = await dialog?.confirm(
            t("workflow.quotaLimitReached", {
              limit: quota.limit,
              used: quota.used,
            }) ||
              `G\xF3i c\u1EE7a b\u1EA1n gi\u1EDBi h\u1EA1n t\u1ED1i \u0111a ${quota.limit} workflow. B\u1EA1n \u0111\xE3 c\xF3 ${quota.used} workflow. N\xE2ng c\u1EA5p Premium \u0111\u1EC3 t\u1EA1o kh\xF4ng gi\u1EDBi h\u1EA1n.`,
            {
              title: t("workflow.quotaLimitTitle") || "Limit reached",
              type: "warning",
              confirmText: t("common.upgrade") || "Upgrade",
              cancelText: t("common.later") || "Later",
            },
          );
          if (shouldUpgrade) {
            if (typeof window.openUpgradeModal === "function") {
              window.openUpgradeModal();
            } else {
              try {
                chrome.runtime.sendMessage({ action: "showUpgradeModal" });
              } catch (e) {}
            }
          }
          return;
        }
        const nodeCount = Number(template2?.node_count) || 0;
        if (nodeCount > 0) {
          const nodeQuota = window.featureGate.checkQuota(
            "workflows_nodes_max",
          );
          const limit = nodeQuota?.limit;
          if (
            limit !== "unlimited" &&
            limit !== "-1" &&
            limit > 0 &&
            nodeCount > limit
          ) {
            const shouldUpgrade = await dialog?.confirm(
              t("workflow.templateNodeQuotaExceeded", {
                count: nodeCount,
                limit,
              }) ||
                `Template "${template2.name}" c\xF3 ${nodeCount} node nh\u01B0ng g\xF3i c\u1EE7a b\u1EA1n ch\u1EC9 cho ph\xE9p t\u1ED1i \u0111a ${limit} node/workflow. Vui l\xF2ng n\xE2ng c\u1EA5p l\xEAn g\xF3i cao h\u01A1n.`,
              {
                title:
                  t("workflow.limitReached") ||
                  "Workflow creation limit reached",
                type: "warning",
                confirmText: t("common.upgrade") || "Upgrade",
                cancelText: t("common.later") || "Later",
              },
            );
            if (shouldUpgrade) {
              if (typeof window.openUpgradeModal === "function") {
                window.openUpgradeModal();
              } else {
                try {
                  chrome.runtime.sendMessage({ action: "showUpgradeModal" });
                } catch (e) {}
              }
            }
            return;
          }
        }
      }
      window.showNotification?.(
        t("workflow.copyingTemplate") || "Copying template...",
        "info",
        2e3,
      );
      const response = await window.authManager._apiCall(
        "POST",
        `workflow-templates/${templateId}/clone`,
        { project_id: window._currentProjectId || null },
      );
      if (response?.workflow) {
        const newWorkflow = response.workflow;
        console.log(
          "[WorkflowTemplateList] Template cloned successfully:",
          newWorkflow.wf_id,
        );
        await new Promise((resolve) => setTimeout(resolve, 200));
        if (window.workflowList?.loadWorkflows) {
          await window.workflowList.loadWorkflows();
        }
        if (window.featureGate) {
          window.featureGate
            .refresh({ force: true })
            .catch((e) =>
              console.warn(
                "[WorkflowTemplateList] FeatureGate refresh failed:",
                e,
              ),
            );
        }
        const workflowsTab = document.querySelector(
          '[data-subtab="workflows"]',
        );
        if (workflowsTab) {
          workflowsTab.click();
        } else if (window.eventBus) {
          window.eventBus.emit("workflow:subtab_changed", {
            subtab: "workflows",
          });
        }
        setTimeout(() => {
          if (window.workflowList?._openWorkflow) {
            window.workflowList._openWorkflow(newWorkflow.wf_id);
          } else if (window.eventBus) {
            window.eventBus.emit("workflow:open_editor", {
              mode: "edit",
              workflow: newWorkflow,
            });
          }
        }, 300);
        window.showNotification?.(
          t("workflow.copyTemplateSuccess") || "Template copied successfully",
          "success",
        );
      } else {
        throw new Error(
          t("workflow.copyTemplateNoData") ||
            "No workflow data received from server",
        );
      }
    } catch (err) {
      const expectedPlanDenial =
        ["PREMIUM_REQUIRED", "QUOTA_EXCEEDED", "FEATURE_DISABLED"].includes(
          err?.code,
        ) ||
        /giới hạn|quota|node\/workflow|node nhưng gói/i.test(
          err?.message || "",
        );
      if (expectedPlanDenial)
        console.info(
          "[WorkflowTemplateList] Copy blocked by plan policy:",
          err?.message || err,
        );
      else
        console.error(
          "[WorkflowTemplateList] Copy template to workflow failed:",
          err,
        );
      let errorMessage =
        err.message ||
        t("workflow.copyTemplateFailed") ||
        "Could not copy the template";
      if (err.code === "PREMIUM_REQUIRED") {
        const shouldUpgrade = await dialog?.confirm(
          t("workflow.premiumTemplateRequired") ||
            "You need to upgrade your plan to use this premium template.",
          {
            title:
              t("workflow.premiumRequired") ||
              "This template requires Premium plan",
            type: "warning",
            confirmText: t("common.upgrade") || "Upgrade",
            cancelText: t("common.later") || "Later",
          },
        );
        if (shouldUpgrade) {
          if (typeof window.openUpgradeModal === "function") {
            window.openUpgradeModal();
          } else {
            try {
              chrome.runtime.sendMessage({ action: "showUpgradeModal" });
            } catch (e) {}
          }
        }
        return;
      }
      if (
        err.code === "QUOTA_EXCEEDED" ||
        err.code === "FEATURE_DISABLED" ||
        err.message?.includes("gi\u1EDBi h\u1EA1n") ||
        err.message?.includes("quota") ||
        err.message?.includes("node/workflow") ||
        err.message?.includes("node nh\u01B0ng g\xF3i")
      ) {
        let dialogMsg =
          t("workflow.quotaExceededOnClone") ||
          "You have reached the workflow limit. Upgrade your plan to create more.";
        const nodeMatch = err.message?.match(
          /có\s+(\d+)\s+node.*tối đa\s+(\d+)/i,
        );
        if (nodeMatch) {
          const count = parseInt(nodeMatch[1], 10);
          const limit = parseInt(nodeMatch[2], 10);
          dialogMsg =
            t("workflow.templateNodeQuotaExceeded", { count, limit }) ||
            `This template has ${count} nodes but your plan only allows up to ${limit} nodes/workflow. Please choose a template with ${limit} nodes or upgrade to the Pro plan.`;
        }
        const shouldUpgrade = await dialog?.confirm(dialogMsg, {
          title: t("workflow.quotaLimitTitle") || "Limit reached",
          type: "warning",
          confirmText: t("common.upgrade") || "Upgrade",
          cancelText: t("common.later") || "Later",
        });
        if (shouldUpgrade) {
          if (typeof window.openUpgradeModal === "function") {
            window.openUpgradeModal();
          } else {
            try {
              chrome.runtime.sendMessage({ action: "showUpgradeModal" });
            } catch (e) {}
          }
        }
        return;
      }
      if (err.httpStatus === 401 || err.code === "UNAUTHENTICATED") {
        errorMessage =
          t("auth.sessionExpired") || "Session expired, please log in again";
      } else if (err.httpStatus === 403 || err.code === "FORBIDDEN") {
        errorMessage =
          t("workflow.copyTemplateForbidden") ||
          "You do not have permission to copy this template";
      } else if (err.httpStatus === 404) {
        errorMessage = t("workflow.templateNotFound") || "Template not found";
      } else if (err.httpStatus >= 500) {
        errorMessage =
          t("common.serverError") || "Server error. Please try again later.";
      }
      window.showNotification?.(errorMessage, "error");
      if (err.serverData) {
        console.error(
          "[WorkflowTemplateList] Server error data:",
          err.serverData,
        );
      }
    } finally {
      this._isCopyingTemplate = false;
      this._lastCloneTime = Date.now();
    }
  }
  async _openTemplateForEdit(templateId) {
    const t = (key, params) => window.I18n?.t(key, params) || key;
    if (!window.featureGate?.canManageWorkflowTemplates()) {
      window.showNotification?.(
        t("workflow.adminRequired") ||
          "Admin permission required for this action",
        "error",
      );
      return;
    }
    try {
      window.showNotification?.(
        t("workflow.loadingTemplate") || "Loading template...",
        "info",
        2e3,
      );
      const template = await this._fetchTemplateById(templateId);
      if (!template) {
        throw new Error(t("workflow.templateNotFound") || "Template not found");
      }
      console.log(
        "[WorkflowTemplateList] M\u1EDF template \u0111\u1EC3 ch\u1EC9nh s\u1EEDa:",
        templateId,
        template.name,
      );
      await chrome.storage.local.set({ _pendingTemplate: template });
      this._openTemplateEditorWindow(template.id, "edit");
    } catch (err) {
      console.error(
        "[WorkflowTemplateList] L\u1ED7i khi m\u1EDF template \u0111\u1EC3 ch\u1EC9nh s\u1EEDa:",
        err,
      );
      let errorMessage =
        err.message ||
        t("workflow.loadTemplateFailed") ||
        "Failed to load template";
      if (err.httpStatus === 401 || err.code === "UNAUTHENTICATED") {
        errorMessage =
          t("auth.sessionExpired") || "Session expired, please log in again";
      } else if (err.httpStatus === 403) {
        errorMessage =
          t("workflow.noPermission") ||
          "You do not have permission to perform this action";
      } else if (err.httpStatus === 404) {
        errorMessage = t("workflow.templateNotFound") || "Template not found";
      }
      window.showNotification?.(errorMessage, "error");
    }
  }
  _openTemplateEditorWindow(templateId = null, mode = "create") {
    chrome.runtime.sendMessage(
      {
        action: "openTemplateEditor",
        data: { mode, templateId: templateId || null },
      },
      (response) => {
        if (response?.ok) {
          console.log(
            "[WorkflowTemplateList] \u0110\xE3 g\u1EEDi y\xEAu c\u1EA7u m\u1EDF template editor window",
          );
        } else {
          console.error(
            "[WorkflowTemplateList] L\u1ED7i m\u1EDF template editor:",
            response?.error,
          );
          window.showNotification?.(
            window.I18n?.t("workflow.popupBlocked") ||
              "Browser blocked the popup. Please allow popups and try again.",
            "warning",
          );
        }
      },
    );
  }
  async _fetchTemplateById(templateId) {
    const result = await this._apiCall(`workflow-templates/${templateId}`);
    return result?.data || result;
  }
  _createNewTemplate() {
    const t = (key, params) => window.I18n?.t(key, params) || key;
    if (!window.featureGate?.canManageWorkflowTemplates()) {
      window.showNotification?.(
        t("workflow.adminRequired") ||
          "Admin permission required for this action",
        "error",
      );
      return;
    }
    console.log(
      "[WorkflowTemplateList] T\u1EA1o template m\u1EDBi - m\u1EDF window ri\xEAng",
    );
    chrome.storage.local.remove("_pendingTemplate");
    this._openTemplateEditorWindow(null, "create");
    window.showNotification?.(
      t("workflow.openingTemplateEditor") || "Opening template editor...",
      "info",
    );
  }
  _handleSearch(query) {
    if (this._searchTimeout) {
      clearTimeout(this._searchTimeout);
    }
    this._searchTimeout = setTimeout(() => {
      this.searchQuery = query.trim();
      this.currentPage = 1;
      this._loadTemplates(false);
    }, 400);
  }
  _handleCategoryFilter(categoryId) {
    if (this.selectedCategory === categoryId) return;
    this.selectedCategory = categoryId || null;
    this.currentPage = 1;
    this._loadTemplates(false);
  }
  async _showUpgradePrompt(template) {
    const t = (key, params) => window.I18n?.t(key, params) || key;
    const dialog = window.customDialog || window.CustomDialog;
    const isLoggedIn = window.authManager?.isLoggedIn() || false;
    let message = "";
    let confirmText = "";
    if (!isLoggedIn) {
      message =
        t("workflow.premiumTemplateLoginRequired", { name: template.name }) ||
        `Template "${template.name}" l\xE0 template Premium.

\u0110\u0103ng nh\u1EADp v\xE0 n\xE2ng c\u1EA5p l\xEAn g\xF3i Premium \u0111\u1EC3 s\u1EED d\u1EE5ng template n\xE0y v\xE0 nhi\u1EC1u template \u0111\u1ED9c quy\u1EC1n kh\xE1c.`;
      confirmText = t("auth.login") || "Login";
    } else {
      message =
        t("workflow.premiumTemplateUpgradeRequired", { name: template.name }) ||
        `Template "${template.name}" l\xE0 template Premium.

N\xE2ng c\u1EA5p l\xEAn g\xF3i Premium \u0111\u1EC3 s\u1EED d\u1EE5ng template n\xE0y v\xE0 truy c\u1EADp \u0111\u1EA7y \u0111\u1EE7 c\xE1c t\xEDnh n\u0103ng cao c\u1EA5p.`;
      confirmText = t("common.upgrade") || "Upgrade";
    }
    const confirmed = await dialog?.confirm(message, {
      title: t("workflow.premiumTemplateTitle") || "Template Premium",
      type: "warning",
      confirmText,
      cancelText: t("common.later") || "Later",
    });
    if (confirmed) {
      if (!isLoggedIn) {
        const loginOverlay = document.getElementById("loginOverlay");
        if (loginOverlay) {
          loginOverlay.classList.remove("hidden");
        } else {
          chrome.runtime.sendMessage({ action: "openSettings" });
        }
      } else {
        if (typeof window.openUpgradeModal === "function") {
          window.openUpgradeModal();
        } else {
          try {
            chrome.runtime.sendMessage({ action: "showUpgradeModal" });
          } catch (e) {}
        }
      }
    }
  }
  async _getUniqueName(baseName) {
    let existingNames = [];
    if (window.storageManager) {
      const workflows = await window.storageManager.getWorkflows();
      existingNames = (workflows || []).map((w) => w.wf_name);
    } else {
      const result = await chrome.storage.local.get(["af_workflows"]);
      existingNames = (result.af_workflows || []).map((w) => w.wf_name);
    }
    let name = baseName;
    let counter = 1;
    while (existingNames.includes(name)) {
      name = `${baseName} (${counter})`;
      counter++;
    }
    return name;
  }
  destroy() {
    if (this._searchTimeout) {
      clearTimeout(this._searchTimeout);
    }
    if (this._i18nHandler && window.eventBus) {
      window.eventBus.off("i18n:changed", this._i18nHandler);
      this._i18nHandler = null;
    }
    if (window.eventBus) {
      if (this._templateCreatedHandler) {
        window.eventBus.off("template:created", this._templateCreatedHandler);
        this._templateCreatedHandler = null;
      }
      if (this._templateUpdatedHandler) {
        window.eventBus.off("template:updated", this._templateUpdatedHandler);
        this._templateUpdatedHandler = null;
      }
      if (this._authLoginHandler) {
        window.eventBus.off("auth:login", this._authLoginHandler);
        this._authLoginHandler = null;
      }
      if (this._authLogoutHandler) {
        window.eventBus.off("auth:logout", this._authLogoutHandler);
        this._authLogoutHandler = null;
      }
      if (this._featuregateRefreshHandler) {
        window.eventBus.off(
          "featuregate:refreshed",
          this._featuregateRefreshHandler,
        );
        this._featuregateRefreshHandler = null;
      }
    }
  }
}
window.WorkflowTemplateList = WorkflowTemplateList;
