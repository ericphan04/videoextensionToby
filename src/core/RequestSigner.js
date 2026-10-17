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
class RequestSigner {
  static async readDerivedSnapshot(cacheKey, access) {
    const epoch = this._protectedEpoch;
    const keys = [cacheKey, "af_auth", this.ENROLLMENT_KEY];
    const stored = await chrome.storage.local.get(keys);
    const snapshot = stored[cacheKey];
    const auth = stored.af_auth;
    const clientId = stored[this.ENROLLMENT_KEY]?.client_id;
    const tokenHash = await this._sha256Hex(auth?.token || "");
    const current = await chrome.storage.local.get([
      "af_auth",
      this.ENROLLMENT_KEY,
    ]);
    const fields = [
      "contract",
      "user_id",
      "client_id",
      "key_id",
      "key_revision",
      "product_id",
    ];
    if (
      epoch !== this._protectedEpoch ||
      !auth?.token ||
      !auth.user?.id ||
      current.af_auth?.token !== auth.token ||
      String(current.af_auth?.user?.id) !== String(auth.user.id) ||
      current.af_auth?.apiBaseUrl !== auth.apiBaseUrl ||
      current[this.ENROLLMENT_KEY]?.client_id !== clientId ||
      !snapshot?.data ||
      snapshot.scope?.contract !== "device-v1" ||
      snapshot.scope.token_hash !== tokenHash ||
      String(snapshot.scope.user_id) !== String(auth.user.id) ||
      snapshot.scope.client_id !== clientId ||
      fields.some((field) => snapshot.scope[field] !== access?.[field])
    ) {
      const metadata = {
        code: "CONFIG_SCOPE_CHANGED",
        httpStatus: 403,
        accessDenied: true,
      };
      if (window.ConfigRequiredError)
        throw new window.ConfigRequiredError(cacheKey, metadata.code, metadata);
      throw Object.assign(new Error(metadata.code), metadata);
    }
    return snapshot.data;
  }
  static async refreshProtectedPermissions() {
    if (!window.authManager?.isLoggedIn?.()) return;
    if (this._permissionsRefreshFlight) return this._permissionsRefreshFlight;
    const flight = (async () => {
      await this.fetchProtected("access", { force: true });
      window.ProviderConfigManager?.clearPrivateConfigs?.();
      await Promise.all([
        window.ProviderConfigManager?.fetchPrivateConfigs?.(true),
        window.ModelRegistry?.refresh?.(),
        window.ModelPresentationRegistry?.fetch?.(true),
      ]);
    })();
    this._permissionsRefreshFlight = flight;
    try {
      return await flight;
    } finally {
      if (this._permissionsRefreshFlight === flight)
        this._permissionsRefreshFlight = null;
    }
  }
  static async fetchProtected(operation, options = {}, retried = false) {
    const tokenAtStart =
      window.authManager?.getToken?.() || window.authManager?.token;
    const epoch = this._protectedEpoch;
    let response;
    try {
      response = await chrome.runtime.sendMessage({
        action: "FETCH_PROTECTED_CONFIG",
        operation,
        ...options,
      });
    } catch (_) {
      response = {
        success: false,
        error: { code: "CONFIG_BROKER_UNAVAILABLE" },
        httpStatus: 503,
      };
    }
    if (
      response?.httpStatus === 401 &&
      !retried &&
      tokenAtStart &&
      window.authManager?.refreshToken &&
      !window.authManager._sessionInvalid &&
      !window.authManager._isLoggingOut &&
      this._protectedRefreshRejectedToken !== tokenAtStart
    ) {
      try {
        if (window.authManager.token === tokenAtStart) {
          if (!this._protectedRefreshFlight) {
            const flight = window.authManager.refreshToken();
            this._protectedRefreshFlight = flight;
            flight
              .finally(() => {
                if (this._protectedRefreshFlight === flight)
                  this._protectedRefreshFlight = null;
              })
              .catch(() => {});
          }
          await this._protectedRefreshFlight;
        }
        return this.fetchProtected(operation, options, true);
      } catch (_) {
        this._protectedRefreshRejectedToken = tokenAtStart;
      }
    }
    if (
      response?.success === true &&
      response.meta?.access?.contract === "device-v1"
    ) {
      if (
        epoch !== this._protectedEpoch ||
        tokenAtStart !==
          (window.authManager?.getToken?.() || window.authManager?.token)
      ) {
        const metadata2 = {
          code: "CONFIG_SCOPE_CHANGED",
          httpStatus: 403,
          accessDenied: true,
        };
        if (window.ConfigRequiredError)
          throw new window.ConfigRequiredError(
            operation,
            metadata2.code,
            metadata2,
          );
        throw Object.assign(new Error(metadata2.code), metadata2);
      }
      this._protectedScope = response.meta.access;
      return response;
    }
    const code = response?.error?.code || "CONFIG_FETCH_FAILED";
    const httpStatus = response?.httpStatus || 503;
    this._protectedScope = null;
    const metadata = {
      code,
      httpStatus,
      accessDenied:
        [401, 403, 404, 409].includes(httpStatus) ||
        [
          "KEY_MISSING",
          "KEY_MISMATCH",
          "LOCAL_KEY_UNAVAILABLE",
          "LOCAL_STORAGE_UNAVAILABLE",
          "CONFIG_CONTRACT_UNAVAILABLE",
          "PROOF_STORE_UNAVAILABLE",
          "LEGACY_CONTRACT_STATE_UNAVAILABLE",
          "CONFIG_SCOPE_CHANGED",
          "CONFIG_BROKER_UNAVAILABLE",
        ].includes(code),
    };
    if (window.ConfigRequiredError)
      throw new window.ConfigRequiredError(operation, code, metadata);
    throw Object.assign(new Error(code), metadata);
  }
  static async protectedStatus() {
    const response = await chrome.runtime.sendMessage({
      action: "PROTECTED_CONFIG_STATUS",
    });
    return (
      response?.data || { ready: false, code: "CONFIG_CONTRACT_UNAVAILABLE" }
    );
  }
  static async _ensureOffset() {
    if (this._offsetLoaded) return;
    try {
      const s = await new Promise((r) =>
        chrome.storage.local.get([this.TIME_OFFSET_KEY], r),
      );
      const v = s[this.TIME_OFFSET_KEY];
      if (typeof v === "number" && isFinite(v)) this._offsetMs = v;
    } catch (_) {}
    this._offsetLoaded = true;
  }
  static async _getEnrollment() {
    if (this._cache) return this._cache;
    try {
      const stored = await new Promise((r) =>
        chrome.storage.local.get([this.ENROLLMENT_KEY], r),
      );
      this._cache = stored[this.ENROLLMENT_KEY] || null;
      return this._cache;
    } catch (_) {
      return null;
    }
  }
  static async headers(method, path, body = "") {
    const enrollment = await this._getEnrollment();
    if (!enrollment || !enrollment.secret || !enrollment.client_id)
      return { "X-Toby-Grok-Ref-Schema": "1" };
    await this._ensureOffset();
    const timestamp = Math.floor((Date.now() + this._offsetMs) / 1e3);
    const normalizedPath = "/" + String(path || "").replace(/^\/+/, "");
    const bodyHash = await this._sha256Hex(body || "");
    const message = `${timestamp}:${String(method || "GET").toUpperCase()}:${normalizedPath}:${bodyHash}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(enrollment.secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBytes = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(message),
    );
    const sig = Array.from(new Uint8Array(sigBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return {
      "X-Toby-Grok-Ref-Schema": "1",
      "X-Client-Id": enrollment.client_id,
      "X-Timestamp": String(timestamp),
      "X-Signature": sig,
    };
  }
  static async ensureEnrollment() {
    if (typeof chrome.runtime?.sendMessage !== "function") return false;
    try {
      const result = await chrome.runtime.sendMessage({
        action: "ensureEnrollment",
      });
      this._cache = null;
      return result?.ok === true;
    } catch (_) {
      return false;
    }
  }
  static async _sha256Hex(text) {
    const buf = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(text || ""),
    );
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
}
__publicField(RequestSigner, "ENROLLMENT_KEY", "toby_client_enrollment");
__publicField(RequestSigner, "TIME_OFFSET_KEY", "toby_server_time_offset");
__publicField(RequestSigner, "_cache", null);
__publicField(RequestSigner, "_offsetMs", 0);
__publicField(RequestSigner, "_offsetLoaded", false);
__publicField(RequestSigner, "_protectedScope", null);
__publicField(RequestSigner, "_protectedRefreshFlight", null);
__publicField(RequestSigner, "_protectedRefreshRejectedToken", null);
__publicField(RequestSigner, "_permissionsRefreshFlight", null);
__publicField(RequestSigner, "_protectedEpoch", 0);
try {
  chrome.storage?.onChanged?.addListener?.((changes, area) => {
    if (area !== "local") return;
    const auth = changes.af_auth;
    const authChanged =
      auth &&
      (auth.oldValue?.token !== auth.newValue?.token ||
        String(auth.oldValue?.user?.id) !== String(auth.newValue?.user?.id) ||
        auth.oldValue?.apiBaseUrl !== auth.newValue?.apiBaseUrl);
    const client = changes[RequestSigner.ENROLLMENT_KEY];
    if (
      authChanged ||
      (client && client.oldValue?.client_id !== client.newValue?.client_id) ||
      (changes.toby_config_access_scope &&
        !changes.toby_config_access_scope.newValue)
    ) {
      RequestSigner.invalidateProtected();
    }
    if (changes[RequestSigner.ENROLLMENT_KEY]) {
      RequestSigner._cache =
        changes[RequestSigner.ENROLLMENT_KEY].newValue || null;
    }
    if (changes[RequestSigner.TIME_OFFSET_KEY]) {
      const nv = changes[RequestSigner.TIME_OFFSET_KEY].newValue;
      if (typeof nv === "number" && isFinite(nv)) {
        RequestSigner._offsetMs = nv;
        RequestSigner._offsetLoaded = true;
      }
    }
  });
} catch (_) {}
RequestSigner.invalidateProtected = () => {
  RequestSigner._protectedEpoch++;
  RequestSigner._protectedScope = null;
  window.ProviderConfigManager?.invalidateProtected?.();
  window.ModelRegistry?.invalidateProtected?.();
  window.ExecutionConfig?.invalidateProtected?.();
  window.eventBus?.emit?.("config:access_invalidated");
};
try {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "CONFIG_ACCESS_INVALIDATED")
      RequestSigner.invalidateProtected();
  });
} catch (_) {}
try {
  let reconnectPending = false;
  window.eventBus?.on?.("sse:disconnected", () => {
    reconnectPending = true;
  });
  window.eventBus?.on?.("sse:connected", () => {
    if (!reconnectPending) return;
    reconnectPending = false;
    RequestSigner.refreshProtectedPermissions().catch((error) => {
      if (window.ConfigRequiredError?.is?.(error))
        window.ConfigErrorHandler?.handle?.(error, "config reconnect");
    });
  });
  window.eventBus?.on?.("sse:entitlements_changed", () => {
    RequestSigner.refreshProtectedPermissions().catch((error) => {
      if (window.ConfigRequiredError?.is?.(error))
        window.ConfigErrorHandler?.handle?.(error, "config permissions");
    });
  });
} catch (_) {}
if (typeof window !== "undefined") {
  window.RequestSigner = RequestSigner;
}
