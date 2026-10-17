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
const _ExecutionGate = class _ExecutionGate {
  static async request(action, promptCount = 1, metadata = {}) {
    try {
      await window.ExecutionConfig.getConfig();
      const timeoutMs = Number(
        window.SystemConfig?.safeGetTimeout("api_timeout_ms"),
      );
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw Object.assign(
          new Error("Execution API timeout config unavailable"),
          { code: "EXECUTION_CONFIG_UNAVAILABLE" },
        );
      }
      const response = await this._apiCall(
        "POST",
        "execution/request",
        { action, prompt_count: promptCount, metadata },
        timeoutMs,
      );
      const data = response?.data || response;
      const rawToken = data?.execution_token || data?.token;
      const token =
        typeof rawToken === "string" && rawToken.trim() ? rawToken : null;
      const allowed =
        !!token &&
        response?.success !== false &&
        ![false, 0, "0"].includes(data?.allowed);
      const moduleQuota = {
        remaining: typeof data.remaining === "number" ? data.remaining : void 0,
        limit: typeof data.limit === "number" ? data.limit : void 0,
        used: typeof data.used === "number" ? data.used : void 0,
      };
      const globalQuota = data.global
        ? {
            remaining:
              typeof data.global.remaining === "number"
                ? data.global.remaining
                : void 0,
            limit:
              typeof data.global.limit === "number"
                ? data.global.limit
                : void 0,
            used:
              typeof data.global.used === "number" ? data.global.used : void 0,
          }
        : null;
      console.log(
        "[ExecutionGate] request:",
        action,
        "- allowed:",
        allowed,
        ", token present:",
        !!token,
        ", module remaining:",
        moduleQuota.remaining,
        ", global remaining:",
        globalQuota?.remaining,
      );
      if (allowed && token) {
        this._activeTokens.set(token, {
          action,
          timestamp: Date.now(),
          promptCount,
          admittedCount: 0,
          provider: metadata.provider || null,
          expiresAt:
            Number(data.expires_in) > 0
              ? Date.now() + Number(data.expires_in) * 1e3
              : null,
        });
      }
      return {
        allowed,
        token,
        remaining: moduleQuota.remaining,
        limit: moduleQuota.limit,
        used: moduleQuota.used,
        global_remaining: globalQuota?.remaining,
        global_limit: globalQuota?.limit,
        global_used: globalQuota?.used,
        prompt_count: promptCount,
        reason:
          data?.reason ||
          (allowed ? "SERVER_APPROVED" : "EXECUTION_TOKEN_MISSING"),
      };
    } catch (err) {
      if (window.QuotaErrorHandler?.isQuotaError(err)) {
        console.warn("[ExecutionGate] Server denied:", err.code, err.message);
        const serverData = err.serverData || {};
        const globalQuota =
          typeof serverData.global_limit === "number" ||
          typeof serverData.global_remaining === "number"
            ? {
                remaining:
                  typeof serverData.global_remaining === "number"
                    ? serverData.global_remaining
                    : void 0,
                limit:
                  typeof serverData.global_limit === "number"
                    ? serverData.global_limit
                    : void 0,
                used:
                  typeof serverData.global_used === "number"
                    ? serverData.global_used
                    : void 0,
              }
            : null;
        return {
          allowed: false,
          token: null,
          remaining:
            typeof serverData.remaining === "number"
              ? serverData.remaining
              : void 0,
          limit:
            typeof serverData.limit === "number" ? serverData.limit : void 0,
          used: typeof serverData.used === "number" ? serverData.used : void 0,
          global_remaining: globalQuota?.remaining,
          global_limit: globalQuota?.limit,
          global_used: globalQuota?.used,
          prompt_count: promptCount,
          node_count:
            typeof serverData.node_count === "number"
              ? serverData.node_count
              : void 0,
          message: err.message || null,
          plan_slug:
            typeof serverData.plan_slug === "string"
              ? serverData.plan_slug
              : null,
          quota_key:
            typeof serverData.quota_key === "string"
              ? serverData.quota_key
              : null,
          provider:
            typeof serverData.provider === "string"
              ? serverData.provider
              : metadata.provider || null,
          reason: err.code,
        };
      }
      console.error(
        "[ExecutionGate] authorization failed, blocking:",
        err.code || err.message,
      );
      throw err;
    }
  }
  static async complete(token, status = "success", resultData = {}) {
    if (!token) {
      this._refreshFeatureGate();
      return;
    }
    if (!this._activeTokens.has(token)) {
      console.log(
        "[ExecutionGate] complete: token already completed, skip duplicate",
        token,
      );
      return;
    }
    this._activeTokens.delete(token);
    this._apiCall(
      "POST",
      "execution/complete",
      {
        token,
        status,
        result_data: Object.keys(resultData).length > 0 ? resultData : void 0,
      },
      this._SETTLEMENT_TIMEOUT,
    )
      .then(() => {
        console.log("[ExecutionGate] complete:", token, status);
        this._refreshFeatureGate();
      })
      .catch((err) => {
        console.info(
          "[ExecutionGate] complete failed (non-blocking):",
          err.message,
        );
        this._refreshFeatureGate();
      });
  }
  static async cancel(token, { waitForSettlement = false } = {}) {
    if (!token) return;
    this._activeTokens.delete(token);
    const settlement = this._apiCall(
      "POST",
      "execution/cancel",
      { token },
      this._SETTLEMENT_TIMEOUT,
    )
      .then(() => {
        console.log("[ExecutionGate] cancel:", token);
        this._refreshFeatureGate();
      })
      .catch((err) => {
        console.error(
          "[ExecutionGate] cancel failed (non-blocking):",
          err.message,
        );
        this._refreshFeatureGate();
        if (waitForSettlement) throw err;
      });
    if (waitForSettlement) await settlement;
  }
  static async cancelAll() {
    const tokens = Array.from(this._activeTokens.keys());
    if (tokens.length === 0) return 0;
    console.log("[ExecutionGate] cancelAll:", tokens.length, "active tokens");
    for (const token of tokens) {
      this.cancel(token).catch(() => {});
    }
    return tokens.length;
  }
  static async _fallbackCheck(action, promptCount = 1) {
    return {
      allowed: false,
      token: null,
      reason: "EXECUTION_AUTHORIZATION_UNAVAILABLE",
      prompt_count: promptCount,
    };
  }
  static claimQueueAdmission(token, action, promptCount) {
    const record =
      typeof token === "string" ? this._activeTokens.get(token) : null;
    if (
      !record ||
      record.action !== action ||
      (["generate", "task_run"].includes(action) &&
        record.expiresAt &&
        Date.now() >= record.expiresAt)
    ) {
      throw Object.assign(new Error("EXECUTION_TOKEN_INVALID"), {
        code: "EXECUTION_TOKEN_INVALID",
      });
    }
    if (["generate", "task_run"].includes(action)) {
      if (
        !Number.isInteger(promptCount) ||
        promptCount < 1 ||
        !Number.isInteger(record.promptCount) ||
        (record.admittedCount || 0) + promptCount > record.promptCount
      ) {
        throw Object.assign(new Error("EXECUTION_BATCH_MISMATCH"), {
          code: "EXECUTION_BATCH_MISMATCH",
        });
      }
      record.admittedCount = (record.admittedCount || 0) + promptCount;
    }
    return true;
  }
  static _apiCall(
    method,
    endpoint,
    data,
    timeoutMs = this._SETTLEMENT_TIMEOUT,
  ) {
    const boundedTimeout =
      Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
        ? Number(timeoutMs)
        : this._SETTLEMENT_TIMEOUT;
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      let settled = false;
      const admission = endpoint === "execution/request";
      if (admission)
        console.info(
          "[ExecutionGate] authorization started:",
          JSON.stringify({ endpoint, timeoutMs: boundedTimeout }),
        );
      const timeoutId = setTimeout(() => {
        settled = true;
        const err = Object.assign(
          new Error("Request timeout after " + boundedTimeout + "ms"),
          {
            code: "EXECUTION_REQUEST_TIMEOUT",
            endpoint,
            timeoutMs: boundedTimeout,
          },
        );
        if (admission)
          console.warn(
            "[ExecutionGate] authorization timed out:",
            JSON.stringify({
              endpoint,
              elapsedMs: Date.now() - startedAt,
              timeoutMs: boundedTimeout,
            }),
          );
        reject(err);
      }, boundedTimeout);
      const done = (fn, val) => {
        clearTimeout(timeoutId);
        if (settled) {
          if (admission && fn === resolve) {
            const data2 = val?.data || val;
            const token = data2?.execution_token || data2?.token;
            if (
              typeof token === "string" &&
              token.trim() &&
              val?.success !== false &&
              ![false, 0, "0"].includes(data2?.allowed)
            ) {
              console.warn(
                "[ExecutionGate] late authorization received; cancelling unused reservation:",
                JSON.stringify({ endpoint, elapsedMs: Date.now() - startedAt }),
              );
              this.cancel(token, { waitForSettlement: true }).catch((err) => {
                console.warn(
                  "[ExecutionGate] late authorization cleanup failed:",
                  err.code || err.message,
                );
              });
            }
          }
          return;
        }
        settled = true;
        if (admission)
          console.info(
            "[ExecutionGate] authorization response:",
            JSON.stringify({
              endpoint,
              elapsedMs: Date.now() - startedAt,
              ok: fn === resolve,
              code: val?.code || null,
            }),
          );
        fn(val);
      };
      if (window.authManager?.isLoggedIn()) {
        Promise.resolve()
          .then(() => window.authManager._apiCall(method, endpoint, data))
          .then((res) => done(resolve, res))
          .catch((err) => done(reject, err));
        return;
      }
      if (
        typeof chrome !== "undefined" &&
        chrome.runtime &&
        chrome.runtime.sendMessage
      ) {
        chrome.runtime.sendMessage(
          { action: "apiRequest", method, endpoint, data },
          (resp) => {
            if (chrome.runtime.lastError) {
              done(reject, new Error(chrome.runtime.lastError.message));
              return;
            }
            if (resp?.success) {
              if (resp.meta) {
                done(resolve, { data: resp.data, meta: resp.meta });
              } else {
                done(resolve, resp.data);
              }
            } else {
              const err = new Error(
                resp?.error?.message || "API request failed",
              );
              err.code = resp?.error?.code || null;
              err.serverData = resp?.data || {};
              err.httpStatus =
                Number(resp?.httpStatus || resp?.error?.httpStatus || 0) ||
                null;
              done(reject, err);
            }
          },
        );
      } else {
        done(reject, new Error("No API transport available"));
      }
    });
  }
  static showDeniedDialog(gate, moduleName = "", onRetry = null) {
    const Dialog = window.customDialog;
    if (!Dialog) return;
    const showUpgrade =
      window.SystemConfig?.getBool("show_upgrade_ui") !== false;
    const contactUrl = window.SystemConfig?.get("upgrade_contact_url", "");
    const getUpgradeButton = () => {
      if (showUpgrade) {
        return {
          label: window.I18n?.t("gate.upgradeNow") || "Upgrade now",
          primary: true,
          action: () => {
            if (typeof window.openUpgradeModal === "function") {
              window.openUpgradeModal();
            } else {
              chrome.runtime
                .sendMessage({ action: "showUpgradeModal" })
                .catch(() => {});
            }
          },
        };
      } else if (contactUrl) {
        return {
          label: window.I18n?.t("gate.contact") || "Contact",
          primary: true,
          action: () => {
            window.open(contactUrl, "_blank");
          },
        };
      }
      return null;
    };
    const buildButtons = () => {
      const buttons = [
        {
          label: window.I18n?.t("common.close") || "Close",
          primary: false,
          action: () => {},
        },
      ];
      const upgradeBtn = getUpgradeButton();
      if (upgradeBtn) buttons.push(upgradeBtn);
      return buttons;
    };
    if (gate.reason === "GLOBAL_QUOTA_EXCEEDED") {
      const globalLimit = gate.global_limit ?? gate.limit ?? "?";
      const globalUsed = gate.global_used ?? gate.used ?? "?";
      const globalRemaining =
        typeof globalLimit === "number" && typeof globalUsed === "number"
          ? globalLimit - globalUsed
          : null;
      const promptCount = gate.prompt_count ?? gate.promptCount ?? null;
      let message;
      let title;
      if (
        globalRemaining !== null &&
        globalRemaining > 0 &&
        promptCount !== null &&
        promptCount > globalRemaining
      ) {
        title =
          window.I18n?.t("gate.insufficientQuotaTitle") ||
          "Insufficient prompt quota";
        message =
          (window.I18n?.t("gate.insufficientQuotaMsg", {
            promptCount,
            globalRemaining,
            globalLimit,
            globalUsed,
          }) ||
            `This task needs ${promptCount} prompts but only ${globalRemaining} remain.

Limit: ${globalLimit} prompts/day
Used: ${globalUsed} prompts
Remaining: ${globalRemaining} prompts`) +
          "\n\n" +
          (showUpgrade
            ? window.I18n?.t("gate.insufficientQuotaUpgrade") ||
              "Reduce prompts or upgrade your plan to increase the limit."
            : window.I18n?.t("gate.insufficientQuotaContact") ||
              "Reduce prompts or contact admin to increase the limit.");
      } else {
        title =
          window.I18n?.t("gate.dailyQuotaExhaustedTitle") ||
          "Daily prompt quota exhausted";
        message =
          (window.I18n?.t("gate.dailyQuotaExhaustedMsg", {
            globalLimit,
            globalUsed,
          }) ||
            `You have used all ${globalLimit} prompts for today.

Used: ${globalUsed}/${globalLimit} prompts`) +
          "\n\n" +
          (window.I18n?.t("gate.dailyQuotaGlobalNote") ||
            "Global quota applies to all features (Generate, Task, Workflow, Angles, Effects).") +
          "\n\n" +
          (showUpgrade
            ? window.I18n?.t("gate.dailyQuotaUpgrade") ||
              "Upgrade your plan for more quota."
            : window.I18n?.t("gate.dailyQuotaContact") ||
              "Please contact admin to upgrade.");
      }
      Dialog.alert(message, {
        title,
        type: "warning",
        buttons: buildButtons(),
      });
    } else if (
      gate.reason === "QUOTA_EXCEEDED" ||
      gate.reason === "PROVIDER_QUOTA_EXCEEDED"
    ) {
      const limit = gate.limit ?? "?";
      const used = gate.used ?? "?";
      const quotaName =
        gate.reason === "PROVIDER_QUOTA_EXCEEDED" && gate.provider
          ? gate.provider
          : moduleName;
      const title =
        window.I18n?.t("gate.usageLimitTitle") || "Usage limit reached";
      const message =
        (window.I18n?.t("gate.usageLimitMsg", {
          moduleName: quotaName || "",
          limit,
          used,
        }) ||
          `No uses left${quotaName ? " for " + quotaName : ""} today.

Limit: ${limit} uses/day
Used: ${used} uses`) +
        "\n\n" +
        (showUpgrade
          ? window.I18n?.t("gate.usageLimitUpgrade") ||
            "Upgrade your plan to increase the limit."
          : window.I18n?.t("gate.usageLimitContact") ||
            "Please contact admin to increase the limit.");
      Dialog.alert(message, {
        title,
        type: "warning",
        buttons: buildButtons(),
      });
    } else if (gate.reason === "BATCH_LIMIT_EXCEEDED") {
      const limit = gate.limit ?? "?";
      const count = gate.prompt_count ?? "?";
      Dialog.alert(
        window.I18n?.t("gen.batchLimitExceeded", { count, limit }) ||
          `Your plan allows ${limit} prompts/batch. You have ${count} prompts.`,
        {
          title:
            window.I18n?.t("gate.usageLimitTitle") || "Usage limit reached",
          type: "warning",
          buttons: buildButtons(),
        },
      );
    } else if (gate.reason === "WORKFLOW_NODE_LIMIT_EXCEEDED") {
      const limit = gate.limit ?? "?";
      const count = gate.node_count ?? "?";
      Dialog.alert(
        window.I18n?.t("workflow.nodeQuotaExceededMsg", {
          count,
          max: limit,
        }) || gate.reason,
        {
          title:
            window.I18n?.t("workflow.nodeQuotaExceeded") ||
            "Node limit exceeded",
          type: "warning",
          buttons: buildButtons(),
        },
      );
    } else if (
      gate.reason === "MODULE_DISABLED" ||
      gate.reason === "FEATURE_LOCKED"
    ) {
      Dialog.alert(
        (window.I18n?.t("gate.featureLockedMsg", {
          moduleName: moduleName || "",
        }) ||
          `The feature${moduleName ? " " + moduleName : ""} is locked for your current plan.`) +
          "\n\n" +
          (showUpgrade
            ? window.I18n?.t("gate.featureLockedUpgrade") ||
              "Upgrade your plan to use this feature."
            : window.I18n?.t("gate.featureLockedContact") ||
              "Please contact admin to unlock."),
        {
          title: window.I18n?.t("gate.featureLockedTitle") || "Feature locked",
          type: "warning",
          buttons: buildButtons(),
        },
      );
    } else if (
      gate.reason === "OFFLINE_CACHE_STALE" ||
      gate.reason === "OFFLINE_NO_QUOTA_INFO"
    ) {
      const title =
        window.I18n?.t("gate.connectionErrorTitle") ||
        "Server connection error";
      const message =
        window.I18n?.t("gate.connectionErrorMsg") ||
        "Lost connection to server. Please check your network and try again in a few seconds.";
      const connButtons = [
        {
          label: window.I18n?.t("common.close") || "Close",
          primary: false,
          action: () => {},
        },
      ];
      if (typeof onRetry === "function") {
        connButtons.push({
          label: window.I18n?.t("common.retry") || "Retry",
          primary: true,
          action: () => {
            try {
              onRetry();
            } catch (e) {
              console.warn("[ExecutionGate] onRetry threw:", e?.message);
            }
          },
        });
      }
      Dialog.alert(message, { title, type: "warning", buttons: connButtons });
    } else {
      Dialog.alert(
        (window.I18n?.t("gate.notAllowedMsg", {
          moduleName: moduleName || "",
        }) || `Not allowed to run${moduleName ? " " + moduleName : ""}.`) +
          "\n" +
          (gate.reason || ""),
        {
          title: window.I18n?.t("gate.notAllowedTitle") || "Action not allowed",
          type: "warning",
        },
      );
    }
  }
  static _refreshFeatureGate() {
    if (!window.featureGate || typeof window.featureGate.refresh !== "function")
      return;
    const now = Date.now();
    const lastRefresh = _ExecutionGate._lastFeatureGateRefreshAt || 0;
    if (now - lastRefresh < 30 * 1e3) {
      console.log(
        "[ExecutionGate] Skip FeatureGate refresh (v\u1EEBa refresh " +
          Math.round((now - lastRefresh) / 1e3) +
          "s tr\u01B0\u1EDBc)",
      );
      return;
    }
    _ExecutionGate._lastFeatureGateRefreshAt = now;
    window.featureGate.refresh().catch((err) => {
      console.warn("[ExecutionGate] FeatureGate refresh failed:", err.message);
      _ExecutionGate._lastFeatureGateRefreshAt = 0;
    });
  }
  static _initCleanup() {
    if (typeof window === "undefined") return;
    window.addEventListener("unload", () => {
      for (const [token] of this._activeTokens) {
        try {
          const baseUrl = window.authManager?.apiBaseUrl;
          const authToken = window.authManager?.token;
          if (baseUrl && authToken) {
            const url = baseUrl + "/execution/cancel";
            const body = JSON.stringify({ token });
            try {
              fetch(url, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: "Bearer " + authToken,
                },
                body,
                keepalive: true,
              }).catch(() => {});
            } catch (_fetchErr) {
              if (navigator.sendBeacon) {
                const blob = new Blob([body], { type: "application/json" });
                navigator.sendBeacon(url, blob);
              }
            }
          } else if (navigator.sendBeacon && baseUrl) {
            const url = baseUrl + "/execution/cancel";
            const blob = new Blob([JSON.stringify({ token })], {
              type: "application/json",
            });
            navigator.sendBeacon(url, blob);
          }
        } catch (e) {}
      }
      this._activeTokens.clear();
    });
  }
};
__publicField(_ExecutionGate, "_SETTLEMENT_TIMEOUT", 15e3);
__publicField(_ExecutionGate, "_activeTokens", new Map());
let ExecutionGate = _ExecutionGate;
ExecutionGate._initCleanup();
window.ExecutionGate = ExecutionGate;
