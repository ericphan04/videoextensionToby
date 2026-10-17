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
class QuotaErrorHandler {
  static isQuotaError(err) {
    if (!err) return false;
    const code = err.code || err.reason;
    return code && this.QUOTA_ERROR_CODES.includes(code);
  }
  static showDialog(err, moduleName = "") {
    if (!window.ExecutionGate?.showDeniedDialog) {
      console.warn(
        "[QuotaErrorHandler] ExecutionGate not available, dialog skipped",
      );
      return;
    }
    const gate = {
      reason: err.code || err.reason,
      limit: err.serverData?.limit ?? err.limit,
      used: err.serverData?.used ?? err.used,
      global_limit: err.serverData?.global_limit ?? err.global_limit,
      global_used: err.serverData?.global_used ?? err.global_used,
      prompt_count: err.serverData?.prompt_count ?? err.prompt_count,
      node_count: err.serverData?.node_count ?? err.node_count,
    };
    window.ExecutionGate.showDeniedDialog(gate, moduleName);
  }
  static handleIfQuotaError(err, moduleName = "") {
    if (!this.isQuotaError(err)) return false;
    this.showDialog(err, moduleName);
    return true;
  }
  static handleAndThrow(err, moduleName = "") {
    if (this.isQuotaError(err)) {
      this.showDialog(err, moduleName);
    }
    throw err;
  }
  static getMessage(code, data = {}) {
    const t = window.I18n?.t?.bind(window.I18n) || ((k) => k);
    switch (code) {
      case "QUOTA_EXCEEDED":
        return data.limit
          ? t(
              "errors.quotaExceeded",
              `You have used all ${data.used || 0}/${data.limit} runs for this module.`,
            )
          : t(
              "errors.quotaExceededGeneric",
              "You have used up your quota for this module.",
            );
      case "GLOBAL_QUOTA_EXCEEDED":
        return data.global_limit
          ? t(
              "errors.globalQuotaExceeded",
              `You have used all ${data.global_used || 0}/${data.global_limit} prompts for today.`,
            )
          : t(
              "errors.globalQuotaExceededGeneric",
              "You have used up your prompt quota for today.",
            );
      case "MODULE_DISABLED":
        return t(
          "errors.moduleDisabled",
          "This module is not included in your plan.",
        );
      case "FEATURE_LOCKED":
        return t("errors.featureLocked", "This feature is not unlocked yet.");
      case "BATCH_LIMIT_EXCEEDED":
        return t("gen.batchLimitExceeded", {
          count: data.prompt_count ?? "?",
          limit: data.limit ?? "?",
        });
      case "WORKFLOW_NODE_LIMIT_EXCEEDED":
        return t("workflow.nodeQuotaExceededMsg", {
          count: data.node_count ?? "?",
          max: data.limit ?? "?",
        });
      default:
        return t(
          "errors.unknownQuotaError",
          "Action failed due to a quota limit.",
        );
    }
  }
}
__publicField(
  QuotaErrorHandler,
  "QUOTA_ERROR_CODES",
  Object.freeze([
    "QUOTA_EXCEEDED",
    "PROVIDER_QUOTA_EXCEEDED",
    "GLOBAL_QUOTA_EXCEEDED",
    "MODULE_DISABLED",
    "FEATURE_LOCKED",
    "BATCH_LIMIT_EXCEEDED",
    "WORKFLOW_NODE_LIMIT_EXCEEDED",
    "PLAN_CONFIGURATION_MISSING",
  ]),
);
window.QuotaErrorHandler = QuotaErrorHandler;
