class RetryHelper {
  static async recoverMediaTextOnly(
    result,
    resubmit,
    { code, provider, shouldStop = () => false } = {},
  ) {
    const cancelled = () => ({
      success: false,
      error: "ABORTED",
      noRetry: true,
    });
    let retries = 0,
      maxRetries = null,
      conversationPath = null;
    while (result?.error === code) {
      if (shouldStop()) return cancelled();
      if (
        result.textOnlyConfirmed !== true ||
        result.noRetry ||
        !result.conversationPath
      )
        return { ...result, noRetry: true };
      if (conversationPath && conversationPath !== result.conversationPath)
        return { success: false, error: "CONVERSATION_CHANGED", noRetry: true };
      conversationPath = result.conversationPath;
      if (maxRetries === null) {
        let config;
        try {
          config = await window.ExecutionConfig?.getConfig?.();
        } catch (_) {}
        if (shouldStop()) return cancelled();
        const value = config?.workflow?.max_retries;
        if (
          value == null ||
          value === "" ||
          !Number.isSafeInteger(Number(value)) ||
          Number(value) < 0
        ) {
          return {
            success: false,
            error: "CONFIG_REQUIRED:exec_max_retries",
            noRetry: true,
          };
        }
        maxRetries = Number(value);
      }
      if (retries >= maxRetries)
        return { ...result, noRetry: true, textOnlyRetries: retries };
      retries++;
      console.info(
        "[MediaTextRetry]",
        JSON.stringify({ provider, retry: retries, maxRetries }),
      );
      if (shouldStop()) return cancelled();
      try {
        result = await resubmit({ retry: retries, conversationPath });
      } catch (error) {
        return shouldStop()
          ? cancelled()
          : {
              success: false,
              error: error?.code || error?.message || "SUBMIT_FAILED",
              noRetry: true,
            };
      }
      if (shouldStop()) return cancelled();
    }
    return retries > 0 && !result?.success
      ? { ...result, noRetry: true }
      : result;
  }
  static getConfig() {
    const s = window.workflowExecutor?.settings || {};
    return {
      maxRetries: s.maxRetries ?? 2,
      retryDelay: s.retryDelay ?? 3e3,
      tileTimeout: s.tileTimeout ?? 18e4,
      stopOnError: s.stopOnError ?? false,
    };
  }
  static async execute(fn, options = {}) {
    const config = this.getConfig();
    const maxRetries = options.maxRetries ?? config.maxRetries;
    const retryDelay = options.retryDelay ?? config.retryDelay;
    const shouldStop = options.shouldStop || (() => false);
    const onRetry = options.onRetry || (() => {});
    const onFail = options.onFail || (() => {});
    const label = options.label || "action";
    const totalAttempts = 1 + maxRetries;
    let attempt = 0;
    let lastError = null;
    while (attempt < totalAttempts) {
      if (shouldStop()) {
        throw new Error(
          `${label}: \u0110\xE3 d\u1EEBng b\u1EDFi ng\u01B0\u1EDDi d\xF9ng`,
        );
      }
      try {
        attempt++;
        const result = await fn({ attempt, totalAttempts });
        return result;
      } catch (error) {
        if (shouldStop()) throw error;
        lastError = error;
        console.warn(
          `[RetryHelper] ${label} attempt ${attempt}/${totalAttempts} failed:`,
          error.message,
        );
        if (error.noRetry) {
          console.warn(
            `[RetryHelper] ${label}: error.noRetry=true \u2014 kh\xF4ng retry th\xEAm`,
          );
          break;
        }
        if (attempt < totalAttempts) {
          onRetry(attempt, totalAttempts, error);
          await this._interruptibleDelay(retryDelay, shouldStop);
        }
      }
    }
    onFail(lastError, attempt);
    throw lastError;
  }
  static async _interruptibleDelay(ms, shouldStop) {
    const chunkSize = 500;
    let elapsed = 0;
    while (elapsed < ms) {
      if (shouldStop())
        throw new Error(
          "\u0110\xE3 d\u1EEBng b\u1EDFi ng\u01B0\u1EDDi d\xF9ng",
        );
      const wait = Math.min(chunkSize, ms - elapsed);
      await new Promise((r) => setTimeout(r, wait));
      elapsed += wait;
    }
  }
}
window.RetryHelper = RetryHelper;
