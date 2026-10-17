(function () {
  "use strict";
  class FlowApiDownloadRetry {
    static async budget() {
      const execution = globalThis.window?.ExecutionConfig;
      const config = execution?.getConfig
        ? await execution.getConfig()
        : typeof globalThis._fetchExecutionConfig === "function"
          ? await globalThis._fetchExecutionConfig()
          : typeof chrome !== "undefined"
            ? (await chrome.storage.local.get("af_execution_config"))
                ?.af_execution_config
            : null;
      const value = config?.workflow?.max_retries;
      if (
        value == null ||
        value === "" ||
        !Number.isSafeInteger(Number(value)) ||
        Number(value) < 0
      ) {
        throw Object.assign(new Error("CONFIG_REQUIRED:exec_max_retries"), {
          noRetry: true,
        });
      }
      return Number(value);
    }
    static retryable(error, mutation = false) {
      const code = String(
        error?.code || error?.error || error?.reason || error?.message || "",
      );
      if (
        error?.noRetry ||
        error?.noReplay ||
        /ABORTED|STOPPED|CONFIG|LINEAGE|IDENTITY|PROVENANCE|MISMATCH|BAD_MIME|INVALID|UNSUPPORTED|CAPABILITY|NOT_ENTITLED|AUTH_REQUIRED|ACCESS_DENIED|CONTENT|POLICY|QUOTA|FORBIDDEN|TOKEN_NOT_READY|TOKEN_EXPIRED|NO_FLOW_KEY|no_token|login_required/.test(
          code,
        )
      )
        return false;
      if (
        mutation &&
        !(
          error?.dispatchStarted === false ||
          ["pre_dispatch", "preflight"].includes(error?.stage)
        )
      )
        return false;
      if (
        /^(GOOGLE_REJECTED|RPC_REJECTED|RPC_REJECT|SCHEMA_CHANGED)$/.test(code)
      )
        return false;
      if (error?.retryable === true || [4, 14].includes(error?.grpcCode))
        return true;
      return /TIMEOUT|TIMED_OUT|NETWORK|FETCH|FAILED TO FETCH|FAILED_TO_FETCH|RELAY_UNAVAILABLE|PAGE_RELOADING|CONTENT_SCRIPT_RECOVERING|NOT_READY|csrf_missing|captcha_not_ready|fresh_page_session_required|session_refresh_timeout|HTTP_(403|404|408|429|5\d\d)|BRIDGE_NOT_INSTALLED/i.test(
        code,
      );
    }
    static async execute(work, options = {}) {
      const maxRetries = await this.budget();
      for (let attempt = 0; ; attempt++) {
        if (options.abortFn?.())
          throw Object.assign(new Error("DOWNLOAD_STOPPED"), { noRetry: true });
        try {
          const result = await work(attempt);
          if (result?.ok === false) {
            const reason =
              result.providerErrorCodes?.[0] ||
              result.grpcReason ||
              result.error ||
              result.reason ||
              "FLOW_API_DOWNLOAD_FAILED";
            throw Object.assign(new Error(reason), result, { code: reason });
          }
          if (options.requirePayload && !result?.url && !result?.base64)
            throw new Error("FLOW_DOWNLOAD_NOT_READY");
          return result;
        } catch (error) {
          if (
            options.abortFn?.() ||
            attempt >= maxRetries ||
            !this.retryable(error, options.mutation)
          )
            throw error;
          console.info(
            "[FlowDownloadRetry]",
            JSON.stringify({
              action: options.action,
              driver: options.driver,
              retry: attempt + 1,
              maxRetries,
              error: error.code || error.error || error.message,
            }),
          );
          try {
            await options.onRetry?.(error);
          } catch (repairError) {
            if (!this.retryable(repairError)) throw repairError;
          }
          const delay = Math.max(0, Number(options.delayMs) || 0);
          const until = Date.now() + delay;
          do {
            if (options.abortFn?.())
              throw Object.assign(new Error("DOWNLOAD_STOPPED"), {
                noRetry: true,
              });
            await new Promise((resolve) =>
              setTimeout(
                resolve,
                Math.min(100, Math.max(0, until - Date.now())),
              ),
            );
          } while (Date.now() < until);
        }
      }
    }
  }
  globalThis.FlowApiDownloadRetry = FlowApiDownloadRetry;
  if (typeof window !== "undefined")
    window.FlowApiDownloadRetry = FlowApiDownloadRetry;
})();
