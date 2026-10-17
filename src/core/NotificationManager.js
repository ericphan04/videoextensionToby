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
  const _NotificationManager = class _NotificationManager {
    static async init() {
      if (_NotificationManager._initialized) return;
      _NotificationManager._initialized = true;
      await _NotificationManager._loadNotificationSettings();
      _NotificationManager._loadWebhookUrl();
      _NotificationManager._bindEvents();
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.af_settings) {
          _NotificationManager._loadNotificationSettings();
        }
      });
      console.log(
        "[TobyFlow] NotificationManager \u0111\xE3 kh\u1EDFi t\u1EA1o",
      );
    }
    static notify(title, body, options = {}) {
      const settings = _NotificationManager._getSettings();
      if (settings.browserNotification) {
        try {
          chrome.runtime.sendMessage(
            {
              action: "showNotification",
              title,
              body,
              notifId: options.notifId || null,
            },
            () => {
              if (chrome.runtime.lastError) {
              }
            },
          );
        } catch (e) {
          console.warn("[TobyFlow] Browser notification failed:", e);
        }
      }
      if (settings.sound) {
        _NotificationManager._playBeep();
      }
      _NotificationManager._setBadge("!");
      setTimeout(() => {
        _NotificationManager._setBadge("");
      }, 5e3);
    }
    static notifyServerNotification(notification) {
      if (!notification) return;
      const settings = _NotificationManager._getSettings();
      if (!settings.browserNotification) return;
      const title = notification.title || "Toby Flow";
      const body = notification.body || notification.message || "";
      const notifId = "srv-" + (notification.id || Date.now());
      try {
        chrome.runtime.sendMessage(
          { action: "showNotification", title, body, notifId },
          () => {
            if (chrome.runtime.lastError) {
            }
          },
        );
      } catch (e) {
        console.warn("[TobyFlow] Server browser notification failed:", e);
      }
      if (settings.sound) _NotificationManager._playBeep();
    }
    static showToast(message, type = "info", duration) {
      try {
        window.showNotification?.(message, type, duration);
      } catch (e) {}
    }
    static _playBeep() {
      try {
        const ctx =
          _NotificationManager._audioContext ||
          new (window.AudioContext || window.webkitAudioContext)();
        _NotificationManager._audioContext = ctx;
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(880, ctx.currentTime);
        gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
          0.001,
          ctx.currentTime + 0.3,
        );
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.3);
      } catch (e) {
        console.warn("[TobyFlow] Sound notification failed:", e);
      }
    }
    static _setBadge(text) {
      try {
        chrome.runtime.sendMessage({ action: "setBadge", text }, () => {
          if (chrome.runtime.lastError) {
          }
        });
      } catch (e) {}
    }
    static _getSettings() {
      return {
        browserNotification:
          _NotificationManager._cachedNotifyOnComplete ?? true,
        sound: _NotificationManager._cachedNotifySound ?? false,
      };
    }
    static async _loadNotificationSettings() {
      try {
        const result = await new Promise((resolve) => {
          chrome.storage.local.get(["af_settings"], (r) =>
            resolve(r.af_settings || {}),
          );
        });
        _NotificationManager._cachedNotifyOnComplete =
          result.notifyOnComplete ?? true;
        _NotificationManager._cachedNotifySound = result.notifySound ?? false;
      } catch (e) {
        console.warn("[TobyFlow] Failed to load notification settings:", e);
      }
    }
    static async _loadWebhookUrl() {
      if (!window.authManager || !window.authManager.isLoggedIn()) return;
      try {
        const result = await window.authManager._apiCall(
          "GET",
          "webhook-settings",
        );
        if (result && result.webhook_url) {
          _NotificationManager._webhookUrl = result.webhook_url;
        }
      } catch (e) {}
    }
    static async _sendWebhook(eventType, data) {
      if (!_NotificationManager._webhookUrl) return;
      try {
        chrome.runtime.sendMessage(
          {
            action: "sendWebhook",
            url: _NotificationManager._webhookUrl,
            data: {
              event: eventType,
              timestamp: new Date().toISOString(),
              ...data,
            },
          },
          () => {
            if (chrome.runtime.lastError) {
            }
          },
        );
      } catch (e) {
        console.warn("[TobyFlow] Webhook send failed:", e);
      }
    }
    static async _sendTelegramNotify(eventType, data) {
      try {
        const res = await new Promise((resolve) => {
          chrome.storage.local.get(["af_settings"], (r) =>
            resolve(r.af_settings || {}),
          );
        });
        if (!res.notifyTelegram) return;
      } catch (e) {
        return;
      }
      if (!window.authManager || !window.authManager.isLoggedIn()) return;
      this._telegramQueue.push({ eventType, data });
      this._processTelegramQueue();
    }
    static async _processTelegramQueue() {
      if (this._telegramProcessing || this._telegramQueue.length === 0) return;
      this._telegramProcessing = true;
      while (this._telegramQueue.length > 0) {
        const now = Date.now();
        const timeSinceLast = now - this._telegramLastSent;
        if (timeSinceLast < this._telegramMinInterval) {
          await new Promise((r) =>
            setTimeout(r, this._telegramMinInterval - timeSinceLast),
          );
        }
        const { eventType, data } = this._telegramQueue.shift();
        try {
          await window.authManager._apiCall(
            "POST",
            "telegram/notify-completion",
            {
              event_type: eventType,
              label: data?.label || data?.taskName || data?.workflowName || "",
              completed_count: data?.completedCount || data?.resultCount || 0,
              failed_count: data?.failedCount || 0,
            },
          );
          this._telegramLastSent = Date.now();
        } catch (e) {
          if (/too many|rate limit|429/i.test(e.message)) {
            console.warn("[TobyFlow] Telegram rate limited, waiting 10s...");
            await new Promise((r) => setTimeout(r, 1e4));
            this._telegramQueue.unshift({ eventType, data });
          } else {
            console.warn("[TobyFlow] Telegram notify failed:", e.message);
          }
        }
      }
      this._telegramProcessing = false;
    }
    static _bindEvents() {
      if (!window.eventBus) return;
      const t = (key, fallback) => window.I18n?.t?.(key) || fallback;
      window.eventBus.on("generation:complete", (data) => {
        _NotificationManager.notify(
          t(
            "notification.browser.generationCompleteTitle",
            "Generation complete!",
          ),
          data?.message ||
            t(
              "notification.browser.generationCompleteBody",
              "Image/video generation finished.",
            ),
          { tag: "generation-complete" },
        );
        _NotificationManager._sendWebhook("generation:complete", {
          prompt: data?.prompt || "",
          resultCount: data?.resultCount || 0,
        });
        _NotificationManager._sendTelegramNotify("generation", data);
      });
      window.eventBus.on("task:complete", (data) => {
        _NotificationManager.notify(
          t("notification.browser.taskCompleteTitle", "Task complete!"),
          data?.taskName ||
            t(
              "notification.browser.taskCompleteBody",
              "Task finished running.",
            ),
          { tag: "task-complete" },
        );
        _NotificationManager._sendWebhook("task:complete", {
          taskId: data?.taskId || "",
          taskName: data?.taskName || "",
        });
        _NotificationManager._sendTelegramNotify("task", data);
      });
      window.eventBus.on("workflow:complete", (data) => {
        _NotificationManager.notify(
          t("notification.browser.workflowCompleteTitle", "Workflow complete!"),
          data?.workflowName ||
            t(
              "notification.browser.workflowCompleteBody",
              "Workflow finished running.",
            ),
          { tag: "workflow-complete" },
        );
        _NotificationManager._sendWebhook("workflow:complete", {
          workflowId: data?.workflowId || "",
          workflowName: data?.workflowName || "",
        });
        _NotificationManager._sendTelegramNotify("workflow", data);
      });
      window.eventBus.on("auth:login", () => {
        _NotificationManager._loadWebhookUrl();
      });
      window.eventBus.on("auth:logout", () => {
        _NotificationManager._webhookUrl = null;
      });
    }
  };
  __publicField(_NotificationManager, "_initialized", false);
  __publicField(_NotificationManager, "_audioContext", null);
  __publicField(_NotificationManager, "_webhookUrl", null);
  __publicField(_NotificationManager, "_cachedNotifyOnComplete", true);
  __publicField(_NotificationManager, "_cachedNotifySound", false);
  __publicField(_NotificationManager, "_telegramLastSent", 0);
  __publicField(_NotificationManager, "_telegramMinInterval", 3e3);
  __publicField(_NotificationManager, "_telegramQueue", []);
  __publicField(_NotificationManager, "_telegramProcessing", false);
  let NotificationManager = _NotificationManager;
  window.NotificationManager = NotificationManager;
})();
