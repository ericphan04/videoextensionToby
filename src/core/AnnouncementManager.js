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
class AnnouncementManager {
  static async init() {
    const data = await this._fetchAnnouncement();
    this._lastFetched = data;
    if (!data || !data.version) {
      this._bindEvents();
      return;
    }
    const stored = await new Promise((resolve) => {
      chrome.storage.local.get(
        [this._STORAGE_KEY_VERSION, this._STORAGE_KEY_INIT],
        resolve,
      );
    });
    if (!stored[this._STORAGE_KEY_INIT]) {
      await new Promise((resolve) => {
        chrome.storage.local.set(
          {
            [this._STORAGE_KEY_VERSION]: data.version,
            [this._STORAGE_KEY_INIT]: true,
          },
          resolve,
        );
      });
      this._bindEvents();
      this._startPolling();
      this._subscribeSSE();
      console.log(
        "[TobyFlow] AnnouncementManager: first-time init, suppress legacy notification",
      );
      return;
    }
    if (data.version !== stored[this._STORAGE_KEY_VERSION]) {
      this._showByMode(data);
    }
    this._bindEvents();
    this._startPolling();
    this._subscribeSSE();
    console.log("[TobyFlow] AnnouncementManager initialized");
  }
  static _showByMode(data) {
    if (!data) return;
    this._lastFetched = data;
    if (!(data.content?.trim() || data.short_message?.trim())) {
      this._hideBadge();
      this._hideShortBanner();
      this.markSeen(data.version);
      return;
    }
    if (data.display_mode === "short_message" && !data.short_message?.trim()) {
      this._closeModal();
      this.markSeen(data.version);
      return;
    }
    this._showShortBanner(data);
    if (data.display_mode === "short_message") {
      this._hideBadge();
      this._closeModal();
    } else if (data.display_mode === "popup") {
      this._openModal(data, true);
    } else {
      this._showBadge();
    }
  }
  static _showShortBanner(data) {
    const banner = document.getElementById("announcementShortBanner");
    const button = document.getElementById("announcementShortOpenBtn");
    if (!banner || !button) return;
    const message = data.short_message?.trim();
    if (!message) {
      banner.classList.add("hidden");
      return;
    }
    button.textContent = message;
    button.disabled = data.display_mode === "short_message";
    banner.dataset.version = data.version;
    banner.classList.remove("hidden");
  }
  static _hideShortBanner() {
    document.getElementById("announcementShortBanner")?.classList.add("hidden");
  }
  static _subscribeSSE() {
    if (!window.eventBus) return;
    if (this._sseBound) return;
    this._sseBound = true;
    window.eventBus.on("sse:announcement_changed", async (payload) => {
      try {
        const stored = await new Promise((resolve) => {
          chrome.storage.local.get([this._STORAGE_KEY_VERSION], resolve);
        });
        if (payload?.version === stored[this._STORAGE_KEY_VERSION]) return;
        const data = await this._fetchAnnouncement();
        this._lastFetched = data;
        if (data?.version && data.version !== stored[this._STORAGE_KEY_VERSION])
          this._showByMode(data);
      } catch (err) {
        console.warn(
          "[TobyFlow] AnnouncementManager: SSE handler failed",
          err.message,
        );
      }
    });
  }
  static _startPolling() {
    if (this._pollTimer) return;
    if (
      window.SseBroadcastManager?.isInitialized() &&
      !window.SseBroadcastManager.isLeader()
    ) {
      console.log("[AnnouncementManager] Follower mode - skip polling");
      return;
    }
    this._pollTimer = setInterval(async () => {
      if (document.visibilityState === "hidden") return;
      if (
        window.SseBroadcastManager?.isInitialized() &&
        !window.SseBroadcastManager.isLeader()
      ) {
        this._stopPolling();
        return;
      }
      try {
        const data = await this._fetchAnnouncement();
        this._lastFetched = data;
        if (!data || !data.version) return;
        const stored = await new Promise((resolve) => {
          chrome.storage.local.get([this._STORAGE_KEY_VERSION], resolve);
        });
        if (data.version !== stored[this._STORAGE_KEY_VERSION]) {
          this._showByMode(data);
        }
      } catch (_) {}
    }, this._POLL_INTERVAL_MS);
  }
  static _stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }
  static _showBadge() {
    const badge = document.getElementById("changelogBadge");
    if (badge) badge.classList.remove("hidden");
  }
  static _hideBadge() {
    const badge = document.getElementById("changelogBadge");
    if (badge) badge.classList.add("hidden");
  }
  static markSeen(version, keepShortBanner = false) {
    if (!version) return;
    chrome.storage.local.set({ [this._STORAGE_KEY_VERSION]: version });
    this._hideBadge();
    if (!keepShortBanner) this._hideShortBanner();
  }
  static async _fetchAnnouncement() {
    try {
      const apiBaseUrl = window.ApiBaseConfig.get();
      const headers = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      try {
        if (chrome?.runtime?.id) headers["X-Extension-Id"] = chrome.runtime.id;
      } catch (_) {}
      try {
        Object.assign(
          headers,
          await (window.RequestSigner?.headers?.(
            "GET",
            new URL(`${apiBaseUrl}/announcement`).pathname,
            "",
          ) || {}),
        );
      } catch (_) {}
      const response = await fetch(`${apiBaseUrl}/announcement`, {
        method: "GET",
        headers,
        cache: "no-store",
      });
      if (!response.ok) {
        console.warn("[TobyFlow] Announcement API non-OK:", response.status);
        return null;
      }
      const data = await response.json();
      if (data.success && data.data) return data.data;
      return null;
    } catch (err) {
      console.warn("[TobyFlow] Failed to fetch announcement:", err.message);
      return null;
    }
  }
  static _renderContent(data) {
    const body = document.getElementById("changelogBody");
    const title = document.getElementById("changelogTitle");
    if (!body) return;
    if (!data || !data.content) {
      if (data?.short_message?.trim()) {
        body.replaceChildren();
        const paragraph = document.createElement("p");
        paragraph.textContent = data.short_message.trim();
        body.appendChild(paragraph);
        if (title)
          title.textContent =
            data.title ||
            window.I18n?.t?.("announcement.title") ||
            "What's new?";
        return;
      }
      const fallbackTitle =
        window.I18n?.t?.("announcement.title") || "What's new?";
      const emptyText =
        window.I18n?.t?.("announcement.empty") || "No new announcements.";
      body.innerHTML = `<p class="tobyflow-announcement-empty">${emptyText}</p>`;
      if (title) title.textContent = fallbackTitle;
      return;
    }
    if (title && data.title) title.textContent = data.title;
    const typeClass = data.type
      ? ` tobyflow-announcement-content--${data.type}`
      : "";
    body.innerHTML = `<div class="tobyflow-announcement-content${typeClass}">${data.content}</div>`;
  }
  static _showLoading() {
    const body = document.getElementById("changelogBody");
    if (body) {
      const loadingText = window.I18n?.t?.("common.loading") || "Loading...";
      body.innerHTML = `<div class="tobyflow-announcement-loading">${loadingText}</div>`;
    }
  }
  static async _openModal(
    prefetched = null,
    keepShortBanner = false,
    markAsSeen = true,
  ) {
    const overlay = document.getElementById("changelogOverlay");
    if (overlay) overlay.classList.remove("hidden");
    let data = prefetched;
    if (!data) {
      this._showLoading();
      data = await this._fetchAnnouncement();
      this._lastFetched = data;
    }
    this._renderContent(data);
    if (markAsSeen && data?.version)
      this.markSeen(data.version, keepShortBanner);
  }
  static _closeModal() {
    const overlay = document.getElementById("changelogOverlay");
    if (overlay) overlay.classList.add("hidden");
  }
  static _bindEvents() {
    if (this._eventsBound) return;
    this._eventsBound = true;
    const btn = document.getElementById("changelogBtn");
    const closeBtn = document.getElementById("changelogCloseBtn");
    const overlay = document.getElementById("changelogOverlay");
    if (btn) {
      btn.addEventListener("click", () => this._openModal());
    }
    document
      .getElementById("announcementShortOpenBtn")
      ?.addEventListener("click", () => {
        if (this._lastFetched?.display_mode === "short_message") return;
        return this._openModal(this._lastFetched, true, false);
      });
    document
      .getElementById("announcementShortDismissBtn")
      ?.addEventListener("click", () => {
        const version = document.getElementById("announcementShortBanner")
          ?.dataset.version;
        this.markSeen(version);
      });
    if (closeBtn) {
      closeBtn.addEventListener("click", () => this._closeModal());
    }
    if (overlay) {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) this._closeModal();
      });
    }
  }
}
__publicField(
  AnnouncementManager,
  "_STORAGE_KEY_VERSION",
  "af_announcement_seen_version",
);
__publicField(
  AnnouncementManager,
  "_STORAGE_KEY_INIT",
  "af_announcement_initialized",
);
__publicField(AnnouncementManager, "_POLL_INTERVAL_MS", 30 * 60 * 1e3);
__publicField(AnnouncementManager, "_pollTimer", null);
__publicField(AnnouncementManager, "_lastFetched", null);
window.AnnouncementManager = AnnouncementManager;
window.ChangelogManager = AnnouncementManager;
