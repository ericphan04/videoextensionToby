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
class ProviderTabLock {
  static async acquire(provider, opLabel = "", { signal, timeoutMs } = {}) {
    if (!provider)
      throw new Error("ProviderTabLock.acquire: provider required");
    const epoch = this._epoch;
    const deadline =
      Number.isFinite(timeoutMs) && timeoutMs > 0
        ? Date.now() + timeoutMs
        : null;
    const check = () => {
      if (signal?.aborted || epoch !== this._epoch)
        throw Object.assign(new Error("PROVIDER_LOCK_CANCELLED"), {
          code: "PROVIDER_LOCK_CANCELLED",
          noRetry: true,
        });
      if (deadline !== null && Date.now() >= deadline)
        throw Object.assign(new Error("PROVIDER_LOCK_TIMEOUT"), {
          code: "PROVIDER_LOCK_TIMEOUT",
          noRetry: true,
        });
    };
    const wait = async (promise) => {
      check();
      let timer, onAbort;
      try {
        await Promise.race([
          promise,
          new Promise((_, reject) => {
            if (deadline !== null)
              timer = setTimeout(
                () =>
                  reject(
                    Object.assign(new Error("PROVIDER_LOCK_TIMEOUT"), {
                      code: "PROVIDER_LOCK_TIMEOUT",
                      noRetry: true,
                    }),
                  ),
                Math.max(0, deadline - Date.now()),
              );
            if (signal) {
              onAbort = () =>
                reject(
                  Object.assign(new Error("PROVIDER_LOCK_CANCELLED"), {
                    code: "PROVIDER_LOCK_CANCELLED",
                    noRetry: true,
                  }),
                );
              signal.addEventListener("abort", onAbort, { once: true });
            }
          }),
        ]);
        check();
      } finally {
        clearTimeout(timer);
        if (onAbort) signal.removeEventListener("abort", onAbort);
      }
    };
    while (this._locks.has(provider)) {
      await wait(this._locks.get(provider).promise);
    }
    check();
    let releaseFn;
    const lockPromise = new Promise((resolve) => {
      releaseFn = resolve;
    });
    const owner = { promise: lockPromise, release: releaseFn };
    this._locks.set(provider, owner);
    try {
      if (this._currentActiveTab !== provider) {
        console.log(
          `[ProviderTabLock] Switching tab \u2192 ${provider} (${opLabel})`,
        );
        await wait(
          Promise.race([this._activateProviderTab(provider), lockPromise]),
        );
        this._currentActiveTab = provider;
        await wait(
          Promise.race([this._sleep(this._switchSettleMs), lockPromise]),
        );
      }
    } catch (err) {
      if (this._locks.get(provider) === owner) this._locks.delete(provider);
      releaseFn();
      throw err;
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (this._locks.get(provider) === owner) this._locks.delete(provider);
      releaseFn();
    };
  }
  static async ensureActiveSilent(provider) {
    if (!provider) return;
    if (this._currentActiveTab !== provider) {
      console.warn(
        `[ProviderTabLock] Tab drift \u2192 re-activate ${provider}`,
      );
      await this._activateProviderTab(provider);
      this._currentActiveTab = provider;
      await this._sleep(this._switchSettleMs);
    }
  }
  static _activateProviderTab(provider) {
    return new Promise((resolve) => {
      let action;
      if (provider === "flow") action = "ensureFlowTabActive";
      else if (provider === "chatgpt") action = "chatgpt:ensureActive";
      else if (provider === "gemini") action = "gemini:ensureActive";
      else if (provider === "grok") action = "grok:ensureActive";
      else {
        console.warn("[ProviderTabLock] Unknown provider:", provider);
        return resolve();
      }
      try {
        chrome.runtime.sendMessage({ action }, () => {
          if (chrome.runtime.lastError) {
            console.warn(
              "[ProviderTabLock] activate err:",
              chrome.runtime.lastError.message,
            );
          }
          resolve();
        });
      } catch (err) {
        console.warn("[ProviderTabLock] sendMessage exception:", err.message);
        resolve();
      }
    });
  }
  static reset() {
    this._epoch++;
    for (const owner of this._locks.values()) owner.release();
    this._locks.clear();
    this._currentActiveTab = null;
  }
  static _sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  static getState() {
    return {
      currentActiveTab: this._currentActiveTab,
      lockedProviders: Array.from(this._locks.keys()),
    };
  }
}
__publicField(ProviderTabLock, "_locks", new Map());
__publicField(ProviderTabLock, "_epoch", 0);
__publicField(ProviderTabLock, "_currentActiveTab", null);
__publicField(ProviderTabLock, "_switchSettleMs", 300);
window.ProviderTabLock = ProviderTabLock;
