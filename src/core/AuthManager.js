class AuthManager {
  constructor() {
    this.user = null;
    this.token = null;
    this.apiBaseUrl =
      typeof window !== "undefined" && window.ApiBaseConfig
        ? window.ApiBaseConfig.DEFAULT
        : "https://labs.toby.vn/api/v1";
    this.isInitialized = false;
    this._refreshing = false;
    this._rateLimitedUntil = 0;
    this._sessionInvalid = false;
    this._isLoggingOut = false;
  }
  async init() {
    try {
      const stored = await new Promise((resolve) => {
        chrome.storage.local.get(["af_auth"], (result) => {
          resolve(result.af_auth || null);
        });
      });
      if (stored) {
        this.token = stored.token || null;
        this.user = stored.user || null;
        if (stored.apiBaseUrl) {
          this.apiBaseUrl = stored.apiBaseUrl;
        }
        const isPopupWindow = !!(
          window.location.pathname.endsWith("workflow-editor.html") ||
          window.location.pathname.endsWith("angles-editor.html") ||
          window.location.pathname.endsWith("effects-editor.html") ||
          window.location.pathname.endsWith("settings.html")
        );
        if (this.token && !isPopupWindow) {
          try {
            await this.fetchUser();
            console.log(
              "[TobyFlow] AuthManager: Phi\xEAn \u0111\u0103ng nh\u1EADp \u0111\u01B0\u1EE3c kh\xF4i ph\u1EE5c",
            );
            if (window.eventBus) {
              window.eventBus.emit("auth:restored", { user: this.user });
            }
          } catch (err) {
            if (err.httpStatus === 429 || err.code === "RATE_LIMITED") {
              console.warn(
                "[TobyFlow] AuthManager: Rate limited khi verify token, gi\u1EEF session",
              );
            } else if (err.code === "EXTENSION_NOT_AUTHORIZED") {
              console.warn(
                "[TobyFlow] AuthManager: Extension not authorized \u2014 gi\u1EEF session, \u0111\u1EE3i overlay self-heal",
              );
            } else {
              console.warn(
                "[TobyFlow] AuthManager: Token h\u1EBFt h\u1EA1n, th\u1EED l\xE0m m\u1EDBi",
              );
              try {
                await this.refreshToken();
              } catch (refreshErr) {
                if (
                  refreshErr.httpStatus === 429 ||
                  refreshErr.code === "RATE_LIMITED"
                ) {
                  console.warn(
                    "[TobyFlow] AuthManager: Rate limited khi refresh, gi\u1EEF session",
                  );
                } else if (refreshErr.code === "EXTENSION_NOT_AUTHORIZED") {
                  console.warn(
                    "[TobyFlow] AuthManager: Refresh blocked by anti-clone \u2014 gi\u1EEF session, \u0111\u1EE3i overlay self-heal",
                  );
                } else if (
                  refreshErr.httpStatus === 401 ||
                  refreshErr.code === "UNAUTHENTICATED"
                ) {
                  console.info(
                    "[TobyFlow] AuthManager: Refresh token h\u1EBFt h\u1EA1n (401), \u0111\u0103ng xu\u1EA5t",
                  );
                  await this._clearAuth();
                } else {
                  console.warn(
                    "[TobyFlow] AuthManager: Refresh th\u1EA5t b\u1EA1i do network/transient \u2014 GI\u1EEE session:",
                    refreshErr.message,
                  );
                }
              }
            }
          }
        } else if (this.token && isPopupWindow) {
          console.log(
            "[TobyFlow] AuthManager: Popup context \u2014 skip server verify, trust sidePanel state",
          );
        }
      }
      this.isInitialized = true;
      console.log(
        "[TobyFlow] AuthManager: \u0110\xE3 kh\u1EDFi t\u1EA1o, \u0111\u0103ng nh\u1EADp:",
        this.isLoggedIn(),
      );
    } catch (err) {
      console.error("[TobyFlow] AuthManager: L\u1ED7i kh\u1EDFi t\u1EA1o", err);
      this.isInitialized = true;
    }
  }
  async login(email, password) {
    const oldToken = this.token;
    try {
      if (this.token && this.user) {
        try {
          await this._apiCall("POST", "sse/end-session");
          console.log(
            "[TobyFlow] AuthManager: SSE session c\u0169 \u0111\xE3 \u0111\u01B0\u1EE3c x\xF3a",
          );
        } catch (sseErr) {
          console.warn(
            "[TobyFlow] AuthManager: Kh\xF4ng th\u1EC3 x\xF3a SSE session c\u0169",
            sseErr.message,
          );
        }
      }
      this.token = null;
      const fingerprint = await this._getStoredFingerprint();
      const headers = fingerprint ? { "X-Fingerprint": fingerprint } : null;
      const response = await this._apiCall(
        "POST",
        "auth/login",
        { email, password },
        false,
        headers,
      );
      const { token, user } = response;
      if (!token) {
        throw new Error(
          window.I18n?.t("auth.loginNoToken") ||
            "Login response does not contain a token",
        );
      }
      this.token = token;
      this.user = user;
      await this._saveAuth(token, user);
      console.log(
        "[TobyFlow] AuthManager: \u0110\u0103ng nh\u1EADp th\xE0nh c\xF4ng -",
        user?.email,
      );
      if (window.featureGate) {
        try {
          await window.featureGate.resetForLogin();
          console.log(
            "[TobyFlow] AuthManager: Entitlements refreshed sau login, plan:",
            window.featureGate.plan?.slug,
          );
        } catch (e) {
          console.warn(
            "[TobyFlow] AuthManager: Kh\xF4ng th\u1EC3 refresh entitlements",
            e,
          );
        }
      }
      if (window.eventBus) {
        window.eventBus.emit("auth:login", { user });
      }
      return { token, user };
    } catch (err) {
      if (oldToken) {
        this.token = oldToken;
      }
      console.error(
        "[TobyFlow] AuthManager: \u0110\u0103ng nh\u1EADp th\u1EA5t b\u1EA1i",
        err.message,
      );
      throw err;
    }
  }
  async register(name, email, password, passwordConfirmation) {
    const oldToken = this.token;
    this.token = null;
    try {
      const fingerprint = await this._getStoredFingerprint();
      const headers = fingerprint ? { "X-Fingerprint": fingerprint } : null;
      const refCode = await new Promise((r) => {
        try {
          chrome.storage.local.get(["tf_ref"], (x) => {
            const t = x?.tf_ref;
            r(
              t && t.code && (!t.expires || t.expires > Date.now())
                ? t.code
                : null,
            );
          });
        } catch (_) {
          r(null);
        }
      });
      const regBody = {
        name,
        email,
        password,
        password_confirmation: passwordConfirmation,
      };
      if (refCode) regBody.ref_code = refCode;
      const response = await this._apiCall(
        "POST",
        "auth/register",
        regBody,
        false,
        headers,
      );
      console.log(
        "[TobyFlow] AuthManager: \u0110\u0103ng k\xFD th\xE0nh c\xF4ng -",
        email,
      );
      if (response.token) {
        this.token = response.token;
        this.user = response.user;
        await this._saveAuth(response.token, response.user);
        if (window.featureGate) {
          try {
            await window.featureGate.resetForLogin();
            console.log(
              "[TobyFlow] AuthManager: Entitlements refreshed sau register, plan:",
              window.featureGate.plan?.slug,
            );
          } catch (e) {
            console.warn(
              "[TobyFlow] AuthManager: Kh\xF4ng th\u1EC3 refresh entitlements",
              e,
            );
          }
        }
        if (window.eventBus) {
          window.eventBus.emit("auth:login", { user: response.user });
        }
      }
      return response;
    } catch (err) {
      if (oldToken) {
        this.token = oldToken;
      }
      console.error(
        "[TobyFlow] AuthManager: \u0110\u0103ng k\xFD th\u1EA5t b\u1EA1i",
        err.message,
      );
      throw err;
    }
  }
  async logout() {
    if (window.featureGate) {
      window.featureGate._isLoggingOut = true;
    }
    this._isLoggingOut = true;
    try {
      if (window.SseClient?.disconnect) {
        try {
          window.SseClient.disconnect();
        } catch (sseDisconnectErr) {
          console.warn(
            "[TobyFlow] AuthManager: L\u1ED7i disconnect SSE",
            sseDisconnectErr.message,
          );
        }
      }
      try {
        if (this.token) {
          console.log(
            "[TobyFlow] AuthManager: B\u1EAFt \u0111\u1EA7u logout, g\u1ECDi sse/end-session...",
          );
          try {
            const sseResult = await this._apiCall("POST", "sse/end-session");
            console.log(
              "[TobyFlow] AuthManager: SSE session \u0111\xE3 \u0111\u01B0\u1EE3c x\xF3a",
              sseResult,
            );
          } catch (sseErr) {
            console.warn(
              "[TobyFlow] AuthManager: Kh\xF4ng th\u1EC3 x\xF3a SSE session",
              sseErr.message,
              sseErr,
            );
          }
          console.log("[TobyFlow] AuthManager: G\u1ECDi auth/logout...");
          await this._apiCall("POST", "auth/logout");
          console.log("[TobyFlow] AuthManager: auth/logout th\xE0nh c\xF4ng");
        } else {
          console.log(
            "[TobyFlow] AuthManager: Kh\xF4ng c\xF3 token, b\u1ECF qua API calls",
          );
        }
      } catch (err) {
        console.warn(
          "[TobyFlow] AuthManager: L\u1ED7i khi g\u1ECDi API \u0111\u0103ng xu\u1EA5t",
          err.message,
        );
      }
      const previousUser = this.user;
      this.token = null;
      this.user = null;
      if (window.featureGate) {
        await window.featureGate.resetForLogout();
      }
      await this._clearAuth();
      this._sessionInvalid = true;
      console.log(
        "[TobyFlow] AuthManager: \u0110\xE3 \u0111\u0103ng xu\u1EA5t",
      );
      if (window.eventBus) {
        window.eventBus.emit("auth:logout", { user: previousUser });
      }
    } finally {
      if (window.featureGate) {
        window.featureGate._isLoggingOut = false;
      }
      this._isLoggingOut = false;
    }
  }
  async refreshToken() {
    if (this._refreshing) {
      return new Promise((resolve, reject) => {
        let elapsed = 0;
        const checkInterval = setInterval(() => {
          elapsed += 100;
          if (!this._refreshing) {
            clearInterval(checkInterval);
            this.token
              ? resolve({ token: this.token })
              : reject(
                  new Error(
                    window.I18n?.t("auth.refreshTokenFailed") ||
                      "Token refresh failed",
                  ),
                );
          } else if (elapsed >= 15e3) {
            clearInterval(checkInterval);
            reject(
              new Error(
                window.I18n?.t("auth.refreshTokenTimeout") ||
                  "Token refresh timed out",
              ),
            );
          }
        }, 100);
      });
    }
    this._refreshing = true;
    try {
      const response = await this._apiCall("POST", "auth/refresh");
      const { token } = response;
      if (!token) {
        throw new Error(
          window.I18n?.t("auth.refreshNoToken") ||
            "Refresh response does not contain a token",
        );
      }
      this.token = token;
      if (response.user) {
        this.user = response.user;
      }
      await this._saveAuth(this.token, this.user);
      console.log(
        "[TobyFlow] AuthManager: Token \u0111\xE3 \u0111\u01B0\u1EE3c l\xE0m m\u1EDBi",
      );
      return { token };
    } catch (err) {
      if (
        err?.httpStatus === 401 ||
        err?.code === "UNAUTHENTICATED" ||
        /Unauthenticated/i.test(err?.message || "")
      ) {
        console.info(
          "[TobyFlow] AuthManager: Refresh session rejected; login required",
        );
      } else {
        console.error(
          "[TobyFlow] AuthManager: L\xE0m m\u1EDBi token th\u1EA5t b\u1EA1i",
          err.message,
        );
      }
      throw err;
    } finally {
      this._refreshing = false;
    }
  }
  async fetchUser() {
    const oldPlanSlug = this.user?.plan_slug;
    const response = await this._apiCall("GET", "auth/me");
    this.user = response.user || response;
    await this._saveAuth(this.token, this.user);
    const newPlanSlug = this.user?.plan_slug;
    if (oldPlanSlug && newPlanSlug && oldPlanSlug !== newPlanSlug) {
      console.log(
        `[TobyFlow] Plan changed: ${oldPlanSlug} \u2192 ${newPlanSlug}`,
      );
      if (window.eventBus) {
        window.eventBus.emit("plan:changed", {
          oldPlan: oldPlanSlug,
          newPlan: newPlanSlug,
        });
      }
    }
    return this.user;
  }
  isLoggedIn() {
    return !!this.token;
  }
  getToken() {
    return this.token;
  }
  getUser() {
    return this.user;
  }
  isAdmin() {
    return this.user?.role === "admin" || this.user?.is_admin === true;
  }
  canManageTemplates() {
    return this.isLoggedIn() && this.isAdmin();
  }
  async forgotPassword(email) {
    try {
      const response = await this._apiCall("POST", "auth/forgot-password", {
        email,
      });
      console.log(
        "[TobyFlow] AuthManager: \u0110\xE3 g\u1EEDi email kh\xF4i ph\u1EE5c m\u1EADt kh\u1EA9u -",
        email,
      );
      return response;
    } catch (err) {
      console.error(
        "[TobyFlow] AuthManager: G\u1EEDi email kh\xF4i ph\u1EE5c th\u1EA5t b\u1EA1i",
        err.message,
      );
      throw err;
    }
  }
  async resendVerification() {
    try {
      const response = await this._apiCall("POST", "auth/resend-verification");
      console.log(
        "[TobyFlow] AuthManager: \u0110\xE3 g\u1EEDi l\u1EA1i email x\xE1c minh",
      );
      return response;
    } catch (err) {
      console.error(
        "[TobyFlow] AuthManager: G\u1EEDi l\u1EA1i email x\xE1c minh th\u1EA5t b\u1EA1i",
        err.message,
      );
      throw err;
    }
  }
  async resendVerificationByEmail(email) {
    try {
      const response = await this._apiCall(
        "POST",
        "auth/resend-verification-public",
        { email },
        false,
      );
      console.log(
        "[TobyFlow] AuthManager: \u0110\xE3 g\u1EEDi l\u1EA1i email x\xE1c minh (public)",
      );
      return response;
    } catch (err) {
      console.error(
        "[TobyFlow] AuthManager: G\u1EEDi l\u1EA1i email x\xE1c minh (public) th\u1EA5t b\u1EA1i",
        err.message,
      );
      throw err;
    }
  }
  async changeUnverifiedEmail(email, password, newEmail) {
    const response = await this._apiCall(
      "PATCH",
      "auth/unverified/email",
      { email, password, new_email: newEmail },
      false,
    );
    console.log(
      "[TobyFlow] AuthManager: \u0110\u1ED5i email unverified th\xE0nh c\xF4ng \u2192",
      newEmail,
    );
    return response;
  }
  async deleteUnverifiedAccount(email, password) {
    const response = await this._apiCall(
      "DELETE",
      "auth/unverified/account",
      { email, password },
      false,
    );
    console.log(
      "[TobyFlow] AuthManager: \u0110\xE3 xo\xE1 t\xE0i kho\u1EA3n unverified",
    );
    if (this.token) {
      await this._clearAuth();
      if (window.eventBus) {
        window.eventBus.emit("auth:logout", { reason: "self_delete" });
      }
    }
    return response;
  }
  async loginWithGoogle() {
    try {
      const response = await this._apiCall("GET", "auth/google/url");
      const url = response.url || response;
      if (!url) {
        throw new Error(
          window.I18n?.t("auth.googleUrlMissing") ||
            "Did not receive Google login URL",
        );
      }
      chrome.tabs.create({ url });
      console.log(
        "[TobyFlow] AuthManager: \u0110\xE3 m\u1EDF trang \u0111\u0103ng nh\u1EADp Google",
      );
      return { url };
    } catch (err) {
      console.error(
        "[TobyFlow] AuthManager: \u0110\u0103ng nh\u1EADp Google th\u1EA5t b\u1EA1i",
        err.message,
      );
      throw err;
    }
  }
  async getLinkGoogleUrl() {
    try {
      const response = await this._apiCall("GET", "auth/google/link-url");
      const url = response?.url || response;
      if (!url || typeof url !== "string" || !url.startsWith("http")) {
        throw new Error(
          window.I18n?.t("auth.googleLinkUrlInvalid") ||
            "Did not receive a valid Google link URL",
        );
      }
      return { url };
    } catch (err) {
      console.error(
        "[TobyFlow] AuthManager: L\u1EA5y URL li\xEAn k\u1EBFt Google th\u1EA5t b\u1EA1i",
        err.message,
      );
      throw err;
    }
  }
  async linkGoogle(googleToken) {
    try {
      const response = await this._apiCall("POST", "auth/google/link", {
        google_token: googleToken,
      });
      return response;
    } catch (err) {
      console.error(
        "[TobyFlow] AuthManager: Li\xEAn k\u1EBFt Google th\u1EA5t b\u1EA1i",
        err.message,
      );
      throw err;
    }
  }
  async unlinkGoogle() {
    try {
      const response = await this._apiCall("POST", "auth/google/unlink");
      console.log(
        "[TobyFlow] AuthManager: \u0110\xE3 h\u1EE7y li\xEAn k\u1EBFt Google",
      );
      return response;
    } catch (err) {
      console.error(
        "[TobyFlow] AuthManager: H\u1EE7y li\xEAn k\u1EBFt Google th\u1EA5t b\u1EA1i",
        err.message,
      );
      throw err;
    }
  }
  async _saveAuth(token, user) {
    this._sessionInvalid = false;
    this._rateLimitedUntil = 0;
    this._isLoggingOut = false;
    return new Promise((resolve) => {
      chrome.storage.local.set(
        {
          af_auth: {
            token,
            user,
            apiBaseUrl: this.apiBaseUrl,
            savedAt: Date.now(),
          },
        },
        resolve,
      );
    });
  }
  async _clearAuth() {
    const previousUserId = this.user?.id ?? null;
    this.token = null;
    this.user = null;
    this._rateLimitedUntil = 0;
    try {
      const snap = await new Promise((resolve) => {
        chrome.storage.local.get(["af_settings"], (r) =>
          resolve(r.af_settings || null),
        );
      });
      if (snap && Object.keys(snap).length > 0 && previousUserId) {
        await new Promise((resolve) => {
          chrome.storage.local.set(
            {
              af_settings_pending_resync: {
                user_id: previousUserId,
                settings: snap,
                saved_at: Date.now(),
              },
            },
            resolve,
          );
        });
      }
    } catch (_) {}
    return new Promise((resolve) => {
      chrome.storage.local.remove(
        [
          "af_auth",
          "af_tasks",
          "af_workflows",
          "af_nodes",
          "af_edges",
          "af_user_prompts",
          "af_addon_prompts",
          "af_settings",
          "af_settings_owner",
          "af_daily_stats",
        ],
        resolve,
      );
    });
  }
  async _getStoredFingerprint() {
    try {
      const res = await new Promise((resolve) => {
        chrome.storage.local.get(["af_fingerprint"], resolve);
      });
      const fp = res?.af_fingerprint;
      return typeof fp === "string" && fp.length >= 32 ? fp : null;
    } catch (_) {
      return null;
    }
  }
  _formatAuthApiError(response) {
    const code = response.error?.code;
    const status = Number(response.httpStatus) || 0;
    const original =
      response.error?.message || window.I18n?.t("auth.unknownApiError");
    const translated = (...keys) => {
      for (const key of keys) {
        const value = window.I18n?.t(key);
        if (value && value !== key) return value;
      }
      return original;
    };
    if (status === 422) {
      const details = response.error?.details || response.data?.errors;
      if (details && typeof details === "object") {
        const messages = Object.values(details)
          .flat()
          .filter((value) => typeof value === "string" && value.trim());
        if (messages.length) return [...new Set(messages)].join(" \xB7 ");
      }
    }
    const diagnostic = [status ? `HTTP ${status}` : null, code]
      .filter(Boolean)
      .join(" \xB7 ");
    let message = original;
    if (code === "NETWORK_ERROR" || code === "NETWORK_CIRCUIT_OPEN") {
      message = translated("auth.requestNetworkError", "errors.network");
    } else if (code === "BACKGROUND_CONNECTION_ERROR") {
      message = translated("auth.backgroundConnectionError");
    } else if (code === "NO_BACKGROUND_RESPONSE") {
      message = translated("auth.noBackgroundResponse");
    } else if (status >= 500) {
      message = translated("auth.requestServerError", "auth.registerFailed");
    } else if (code === "PARSE_ERROR") {
      message = translated(
        "auth.requestInvalidResponse",
        "auth.unknownApiError",
      );
    } else {
      return original;
    }
    return diagnostic ? `${message} [${diagnostic}]` : message;
  }
  async _apiCall(
    method,
    endpoint,
    data = null,
    _isRetry = false,
    extraHeaders = null,
  ) {
    const isAuthEndpoint = endpoint.startsWith("auth/");
    if (!isAuthEndpoint && this._rateLimitedUntil > Date.now()) {
      const retryAfter = Math.ceil((this._rateLimitedUntil - Date.now()) / 1e3);
      const err = new Error(
        window.I18n?.t("auth.rateLimited", { seconds: retryAfter }) ||
          `Too many requests, please try again in ${retryAfter} seconds`,
      );
      err.code = "RATE_LIMITED";
      err.httpStatus = 429;
      err.retryAfter = retryAfter;
      return Promise.reject(err);
    }
    if (!isAuthEndpoint && this._sessionInvalid) {
      const err = new Error(
        window.I18n?.t("auth.sessionExpired") ||
          "Session expired, please log in again",
      );
      err.code = "UNAUTHENTICATED";
      err.httpStatus = 401;
      return Promise.reject(err);
    }
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: "apiRequest",
          method,
          endpoint,
          data,
          token: this.token,
          headers: extraHeaders || void 0,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            const rawMessage = chrome.runtime.lastError.message;
            const error = new Error(
              isAuthEndpoint
                ? this._formatAuthApiError({
                    error: {
                      code: "BACKGROUND_CONNECTION_ERROR",
                      message: rawMessage,
                    },
                  })
                : rawMessage ||
                    window.I18n?.t("auth.backgroundConnectionError") ||
                    "Background connection error",
            );
            error.code = "BACKGROUND_CONNECTION_ERROR";
            error.originalMessage = rawMessage;
            reject(error);
            return;
          }
          if (!response) {
            const error = new Error(
              isAuthEndpoint
                ? this._formatAuthApiError({
                    error: { code: "NO_BACKGROUND_RESPONSE" },
                  })
                : window.I18n?.t("auth.noBackgroundResponse") ||
                    "No response received from background",
            );
            error.code = "NO_BACKGROUND_RESPONSE";
            reject(error);
            return;
          }
          if (response.success) {
            if (response.meta) {
              resolve({ data: response.data, meta: response.meta });
            } else {
              resolve(response.data);
            }
          } else {
            const errorCode = response.error?.code;
            const errorMessage =
              (isAuthEndpoint
                ? this._formatAuthApiError(response)
                : response.error?.message) ||
              window.I18n?.t("auth.unknownApiError") ||
              "Unknown API error";
            const httpStatus = response.httpStatus;
            if (
              httpStatus === 401 &&
              !_isRetry &&
              !this._sessionInvalid &&
              !this._isLoggingOut &&
              endpoint !== "auth/login" &&
              endpoint !== "auth/refresh" &&
              endpoint !== "sse/end-session"
            ) {
              console.info(
                "[TobyFlow] AuthManager: Nh\u1EADn 401, th\u1EED l\xE0m m\u1EDBi token",
              );
              this.refreshToken()
                .then(() => this._apiCall(method, endpoint, data, true))
                .then(resolve)
                .catch(() => {
                  this._sessionInvalid = true;
                  const isPopupWindow = !!(
                    window.location.pathname.endsWith("workflow-editor.html") ||
                    window.location.pathname.endsWith("angles-editor.html") ||
                    window.location.pathname.endsWith("effects-editor.html") ||
                    window.location.pathname.endsWith("settings.html")
                  );
                  if (isPopupWindow) {
                    console.warn(
                      "[TobyFlow] AuthManager: Popup context \u2014 skip _clearAuth \u0111\u1EC3 kh\xF4ng \u1EA3nh h\u01B0\u1EDFng sidePanel",
                    );
                    const err = new Error(
                      window.I18n?.t("auth.sessionExpired") ||
                        "Session expired, please log in again",
                    );
                    err.httpStatus = 401;
                    err.code = "UNAUTHENTICATED";
                    reject(err);
                    return;
                  }
                  this._clearAuth().then(() => {
                    if (window.eventBus) {
                      window.eventBus.emit("auth:logout", {
                        reason: "token_expired",
                      });
                    }
                    const err = new Error(
                      window.I18n?.t("auth.sessionExpired") ||
                        "Session expired, please log in again",
                    );
                    err.httpStatus = 401;
                    err.code = "UNAUTHENTICATED";
                    reject(err);
                  });
                });
              return;
            }
            if (httpStatus === 429) {
              const retryAfter =
                response.retry_after ||
                response.data?.retry_after ||
                response.headers?.["Retry-After"] ||
                15;
              const isAuthEp = endpoint.startsWith("auth/");
              let cooldownMs;
              if (isAuthEp) {
                cooldownMs = Math.min(
                  120 * 1e3,
                  (Number(retryAfter) + 1) * 1e3,
                );
              } else {
                const jitter = (Math.random() - 0.5) * 0.4;
                cooldownMs = Math.min(
                  30 * 1e3,
                  Math.max(5, Number(retryAfter) * (1 + jitter)) * 1e3,
                );
              }
              console.warn(
                "[TobyFlow] AuthManager: Rate limited (429), retry after",
                retryAfter,
                "s (jittered:",
                (cooldownMs / 1e3).toFixed(1),
                "s)",
              );
              this._rateLimitedUntil = Date.now() + cooldownMs;
              if (window.eventBus) {
                window.eventBus.emit("api:rate_limited", {
                  endpoint,
                  retryAfter: Math.ceil(cooldownMs / 1e3),
                  message: errorMessage,
                });
              }
              const error2 = new Error(
                window.I18n?.t("auth.rateLimited", {
                  seconds: Math.ceil(cooldownMs / 1e3),
                }) ||
                  "Too many requests, please try again in " +
                    retryAfter +
                    " seconds",
              );
              error2.code = "RATE_LIMITED";
              error2.httpStatus = 429;
              error2.retryAfter = retryAfter;
              reject(error2);
              return;
            }
            const error = new Error(errorMessage);
            error.code = errorCode;
            error.httpStatus = httpStatus;
            error.serverData = response.data || {};
            error.details =
              response.error?.details || response.data?.errors || null;
            if (isAuthEndpoint)
              error.originalMessage = response.error?.message || null;
            error.exception = response.error?.exception || null;
            reject(error);
          }
        },
      );
    });
  }
}
window.authManager = new AuthManager();
window.AuthManager = AuthManager;
