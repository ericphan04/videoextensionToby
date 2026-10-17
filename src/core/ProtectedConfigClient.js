(() => {
  "use strict";
  const paths = Object.freeze({
    dom: "providers/dom-selectors",
    api: "providers/api-configs",
    private: "providers/private-configs",
    models: "provider-models",
    execution: "system-config/execution",
    aiTools: "system-config/ai-tools",
    access: "access",
  });
  const cacheKeys = Object.freeze({
    dom: "toby_provider_configs",
    api: "toby_provider_api_configs",
    models: "toby_provider_models",
    execution: "af_execution_config",
  });
  const snapshotKeys = [
    ...Object.values(cacheKeys),
    "toby_provider_dom_selectors",
    "_tobyConfigsReady",
    "af_chatgpt_config",
    "af_grok_config",
    "toby_config_access_scope",
  ];
  const pages = new Set([
    "sidebar.html",
    "settings.html",
    "workflow-editor.html",
    "workflow-template-editor.html",
    "template-preview.html",
    "angles-editor.html",
    "effects-editor.html",
    "auto-capcut-builder.html",
    "run-window.html",
    "web-loading.html",
  ]);
  let dependencies;
  let epoch = 0;
  let identity = null;
  let keyFlight = null;
  let readinessFlight = null;
  let claimFlight = null;
  let rotationFlight = null;
  let replacementFlight = null;
  let lease = null;
  let state = { ready: false, code: "AUTH_REQUIRED" };
  let privateEpoch = 0;
  let writes = Promise.resolve();
  const controllers = new Set();
  const flights = new Map();
  const forcedFlights = new Map();
  const cache = new Map();
  const error = (code, httpStatus = 403) =>
    Object.assign(new Error(code), { code, httpStatus });
  const leaseNow = () => globalThis.performance?.now?.() ?? Date.now();
  const storage = {
    get: (keys) =>
      new Promise((resolve, reject) =>
        chrome.storage.local.get(keys, (value) => {
          chrome.runtime.lastError
            ? reject(error("LOCAL_STORAGE_UNAVAILABLE", 503))
            : resolve(value);
        }),
      ),
    set: (value) =>
      new Promise((resolve, reject) =>
        chrome.storage.local.set(value, () => {
          chrome.runtime.lastError
            ? reject(error("LOCAL_STORAGE_UNAVAILABLE", 503))
            : resolve();
        }),
      ),
    remove: (keys) =>
      new Promise((resolve, reject) =>
        chrome.storage.local.remove(keys, () => {
          chrome.runtime.lastError
            ? reject(error("LOCAL_STORAGE_UNAVAILABLE", 503))
            : resolve();
        }),
      ),
  };
  const write = (operation) => {
    const next = writes.then(operation, operation);
    writes = next.catch(() => {});
    return next;
  };
  function allowedSender(sender) {
    if (sender?.id !== chrome.runtime.id || typeof sender.url !== "string")
      return false;
    try {
      const url = new URL(sender.url);
      return (
        url.protocol === "chrome-extension:" &&
        url.hostname === chrome.runtime.id &&
        pages.has(url.pathname.slice(1))
      );
    } catch (_) {
      return false;
    }
  }
  function allowedProviderSender(sender, provider) {
    if (sender?.id !== chrome.runtime.id || typeof provider !== "string")
      return false;
    if (allowedSender(sender)) return true;
    const script =
      provider === "flow" ? "content.js" : `chat-content-${provider}.js`;
    try {
      const url = new URL(sender.url);
      return chrome.runtime.getManifest().content_scripts.some(
        (group) =>
          group.js?.includes(script) &&
          group.matches.some((pattern) => {
            const rule = pattern.match(/^(\*|https?):\/\/([^/]+)(\/.*)$/);
            if (
              !rule ||
              (rule[1] === "*"
                ? !["http:", "https:"].includes(url.protocol)
                : url.protocol !== rule[1] + ":")
            )
              return false;
            const host = rule[2];
            if (
              host.startsWith("*.")
                ? url.hostname !== host.slice(2) &&
                  !url.hostname.endsWith(host.slice(1))
                : url.hostname !== host
            )
              return false;
            const path = rule[3]
              .split("*")
              .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
              .join(".*");
            return new RegExp("^" + path + "$").test(url.pathname + url.search);
          }),
      );
    } catch (_) {
      return false;
    }
  }
  async function invalidate(
    code = "CONFIG_ACCESS_INVALIDATED",
    details = {},
    needsClaim = false,
  ) {
    epoch++;
    lease = null;
    identity = null;
    keyFlight = readinessFlight = claimFlight = null;
    cache.clear();
    flights.clear();
    forcedFlights.clear();
    for (const controller of controllers) controller.abort();
    state = { ready: false, code, retryable: details.retryable === true };
    dependencies?.invalidateRuntime?.();
    try {
      if (details.code)
        await dependencies?.recoveryFailed?.(details, needsClaim);
    } finally {
      await write(async () => {
        await storage.remove(snapshotKeys);
        if (chrome.storage.session)
          await chrome.storage.session.remove("_provider_urls_cache");
      });
    }
    dependencies?.broadcast?.({
      type: "CONFIG_ACCESS_INVALIDATED",
      code,
      retryable: state.retryable,
      auth_epoch: epoch,
    });
  }
  async function context(requireAuth = true) {
    if (!dependencies) throw error("CONFIG_CONTRACT_UNAVAILABLE", 503);
    await dependencies.bootReady?.();
    const stored = await storage.get(["af_auth", "apiBaseUrl"]);
    const auth = stored.af_auth || {};
    const audience = String(
      auth.apiBaseUrl || stored.apiBaseUrl || dependencies.apiBase(),
    ).replace(/\/$/, "");
    const url = new URL(audience);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/api/v1"
    ) {
      throw error("API_AUDIENCE_MISMATCH");
    }
    const enrollment = await dependencies.getEnrollment();
    const token = requireAuth ? String(auth.token || "") : "";
    const userId = requireAuth ? auth.user?.id : null;
    if (requireAuth && (!token || !userId)) throw error("AUTH_REQUIRED", 401);
    if (!enrollment?.client_id || !enrollment.secret)
      throw error("ENROLLMENT_REQUIRED");
    const tokenHash = await dependencies.sha256(token);
    const owner = [audience, userId, tokenHash, enrollment.client_id].join("|");
    if (requireAuth && identity !== null && identity !== owner)
      await invalidate("CONFIG_SCOPE_CHANGED");
    if (requireAuth) identity = owner;
    return { audience, token, tokenHash, userId, enrollment, epoch, owner };
  }
  function assertCurrent(ctx) {
    if (ctx.epoch !== epoch || (ctx.token && ctx.owner !== identity))
      throw error("CONFIG_SCOPE_CHANGED");
  }
  function validateBootstrap(value, ctx) {
    if (
      !value ||
      value.contract !== "device-v1" ||
      value.extension_id !== chrome.runtime.id ||
      value.audience !== ctx.audience ||
      !Number.isSafeInteger(value.product_id) ||
      value.product_id < 1
    ) {
      throw error("API_AUDIENCE_MISMATCH");
    }
    return value;
  }
  async function prepare(
    method,
    url,
    payload,
    ctx,
    record = null,
    candidate = null,
    revision = record?.key_revision,
  ) {
    const parsed = new URL(url);
    if (
      parsed.origin + "/api/v1" !== ctx.audience ||
      !parsed.pathname.startsWith("/api/v1/")
    )
      throw error("API_AUDIENCE_MISMATCH");
    const nonce = DeviceKeyStore.nonce();
    const body =
      method === "GET"
        ? ""
        : JSON.stringify({ ...(payload || {}), request_nonce: nonce });
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Extension-Id": chrome.runtime.id,
      "X-Ext-Version": chrome.runtime.getManifest().version,
      "X-Device-Label": dependencies.deviceLabel(),
      "X-Toby-Grok-Ref-Schema": "1",
      ...(await dependencies.hmac(method, parsed.pathname, body)),
    };
    if (headers["X-Client-Id"] !== ctx.enrollment.client_id)
      throw error("CONFIG_SCOPE_CHANGED");
    if (ctx.token) headers.Authorization = `Bearer ${ctx.token}`;
    if (record) {
      const bootstrap = validateBootstrap(record.bootstrap, ctx);
      if (record.client_id !== ctx.enrollment.client_id)
        throw error("KEY_MISMATCH");
      const fields = [
        "device-v1",
        ctx.audience,
        chrome.runtime.id,
        String(bootstrap.product_id),
        ctx.enrollment.client_id,
        record.key_id,
        String(revision),
        headers["X-Ext-Version"],
        ctx.tokenHash,
        headers["X-Timestamp"],
        nonce,
        method,
        parsed.pathname + parsed.search,
        await dependencies.sha256(body),
      ];
      if (fields.some((value) => /[\r\n]/.test(value)))
        throw error("INVALID_DEVICE_PROOF");
      const message = fields.join("\n");
      Object.assign(headers, {
        "X-Toby-Device-Proof": "device-v1",
        "X-Toby-Device-Key-Id": record.key_id,
        "X-Toby-Device-Key-Revision": String(revision),
        "X-Toby-Device-Nonce": nonce,
        "X-Toby-Device-Signature": await DeviceKeyStore.sign(record, message),
      });
      if (candidate)
        headers["X-Toby-New-Key-Signature"] = await DeviceKeyStore.sign(
          candidate,
          message,
        );
    }
    return { headers, body };
  }
  async function request(
    ctx,
    endpoint,
    method = "GET",
    payload = null,
    record = null,
    candidate = null,
    revision,
    retried = false,
  ) {
    assertCurrent(ctx);
    const admission = dependencies.admit?.(endpoint, ctx.owner);
    if (admission?.allowed === false)
      throw Object.assign(error(admission.code, admission.httpStatus), {
        owner: ctx.owner,
        endpoint,
        retryAfterMs: admission.retryAfterMs || 0,
        recoveryDeferred: admission.recoveryDeferred === true,
        retryable:
          admission.retryable === true ||
          ["RATE_LIMITED", "NETWORK_CIRCUIT_OPEN"].includes(admission.code),
      });
    const url = `${ctx.audience}/${endpoint}`;
    const prepared = await prepare(
      method,
      url,
      payload,
      ctx,
      record,
      candidate,
      revision,
    );
    assertCurrent(ctx);
    const controller = new AbortController();
    controllers.add(controller);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 15e3);
    try {
      const response = await fetch(url, {
        method,
        headers: prepared.headers,
        ...(method === "GET" ? {} : { body: prepared.body }),
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      dependencies.syncTime(response);
      dependencies.reachable?.();
      let retryAfterMs = 0;
      const rawRetry = response.headers?.get?.("Retry-After");
      if (response.status === 429) {
        const seconds =
          rawRetry && Number.isFinite(Number(rawRetry))
            ? Number(rawRetry)
            : rawRetry && Number.isFinite(Date.parse(rawRetry))
              ? Math.max(0, (Date.parse(rawRetry) - Date.now()) / 1e3)
              : 60;
        retryAfterMs = Math.max(0, seconds) * 1e3;
        dependencies.rateLimited?.(retryAfterMs / 1e3);
      }
      let envelope2;
      try {
        envelope2 = await response.json();
      } catch (failure) {
        if (timedOut || failure?.name === "TypeError") throw failure;
        throw Object.assign(
          error(
            response.status === 429
              ? "RATE_LIMITED"
              : response.status >= 500
                ? "HTTP_SERVICE_UNAVAILABLE"
                : "CONFIG_RESPONSE_INVALID",
            response.status === 429 || response.status >= 500
              ? response.status
              : 502,
          ),
          {
            retryable: response.status === 429 || response.status >= 500,
            retryAfterMs,
          },
        );
      }
      if (
        response.status === 429 &&
        !rawRetry &&
        Number.isFinite(Number(envelope2.data?.retry_after))
      ) {
        const retry = Number(envelope2.data.retry_after);
        retryAfterMs = Math.max(0, Number.isFinite(retry) ? retry : 60) * 1e3;
        dependencies.rateLimited?.(retryAfterMs / 1e3);
      }
      assertCurrent(ctx);
      if (
        method === "GET" &&
        !retried &&
        response.status === 403 &&
        [
          "EXPIRED_SIGNATURE",
          "EXPIRED_DEVICE_PROOF",
          "REPLAY_DETECTED",
        ].includes(envelope2.error?.code)
      ) {
        return request(
          ctx,
          endpoint,
          method,
          payload,
          record,
          candidate,
          revision,
          true,
        );
      }
      if (!response.ok || envelope2.success !== true) {
        const code =
          envelope2.error?.code ||
          (response.status === 401
            ? "AUTH_REQUIRED"
            : response.status === 429
              ? "RATE_LIMITED"
              : response.status >= 500
                ? "HTTP_SERVICE_UNAVAILABLE"
                : "CONFIG_FETCH_FAILED");
        const permanent =
          /^(KEY_|LOCAL_|DEVICE_KEY_|CLIENT_|ACCOUNT_|EXTENSION_DEVICE_|INVALID_DEVICE_)/.test(
            code,
          ) ||
          [
            "EXTENSION_NOT_AUTHORIZED",
            "LEGACY_CONTRACT_STATE_UNAVAILABLE",
          ].includes(code);
        const serviceReason = envelope2.error?.service_reason;
        dependencies.rejected?.({
          method,
          endpoint: endpoint.split("?")[0],
          audience: ctx.audience,
          httpStatus: response.status,
          code,
          ...([
            "GATE_DISABLED",
            "DB_QUERY_FAILED",
            "KEY_STATE_INCONSISTENT",
          ].includes(serviceReason)
            ? { service_reason: serviceReason }
            : {}),
        });
        throw Object.assign(error(code, response.status), {
          retryable:
            !permanent && (response.status === 429 || response.status >= 500),
          retryAfterMs,
        });
      }
      return { ...envelope2, httpStatus: response.status };
    } catch (failure) {
      assertCurrent(ctx);
      if (timedOut || typeof failure.code !== "string" || !failure.code) {
        if (timedOut || !controller.signal.aborted)
          dependencies.networkFailed?.({
            method,
            endpoint,
            error: failure,
            audience: ctx.audience,
          });
        failure = Object.assign(
          error(timedOut ? "REQUEST_TIMEOUT" : "NETWORK_ERROR", 503),
          { retryable: true },
        );
      }
      throw Object.assign(failure, { owner: ctx.owner, endpoint });
    } finally {
      clearTimeout(timer);
      controllers.delete(controller);
    }
  }
  async function ensureKey(ctx) {
    if (keyFlight?.owner === ctx.owner && keyFlight.epoch === ctx.epoch)
      return keyFlight.promise;
    const flight = { owner: ctx.owner, epoch: ctx.epoch };
    flight.promise = (async () => {
      const status = await request(ctx, "extension-device-key");
      const bootstrap = validateBootstrap(status.meta?.bootstrap, ctx);
      const key = await DeviceKeyStore.reconcile(
        ctx.enrollment.client_id,
        status.data,
        bootstrap,
      );
      assertCurrent(ctx);
      if (status.data.replacement_required)
        throw error("CLIENT_RESET_REQUIRES_REPLACEMENT");
      if (status.data.registered) return key;
      const challenge = await request(
        ctx,
        "extension-device-key/challenge",
        "POST",
        { operation: "register", public_key_id: key.key_id },
      );
      const registered = await request(
        ctx,
        "extension-device-key/register",
        "POST",
        {
          challenge_id: challenge.data.challenge_id,
          public_key_spki: key.public_key_spki,
        },
        key,
        null,
        0,
      );
      assertCurrent(ctx);
      return DeviceKeyStore.reconcile(
        ctx.enrollment.client_id,
        registered.data,
        bootstrap,
      );
    })().catch((failure) => {
      if (keyFlight === flight) keyFlight = null;
      assertCurrent(ctx);
      throw Object.assign(failure, { owner: ctx.owner });
    });
    keyFlight = flight;
    return flight.promise;
  }
  function scope(ctx, record, access) {
    if (
      !access ||
      access.contract !== "device-v1" ||
      String(access.user_id) !== String(ctx.userId) ||
      access.client_id !== ctx.enrollment.client_id ||
      access.key_id !== record.key_id ||
      access.key_revision !== record.key_revision ||
      access.product_id !== record.bootstrap.product_id ||
      !Number.isFinite(access.authorization_ttl_sec) ||
      access.authorization_ttl_sec <= 0
    ) {
      throw error("CONFIG_SCOPE_MISMATCH");
    }
    return {
      ...access,
      audience: ctx.audience,
      auth_epoch: ctx.epoch,
      token_hash: ctx.tokenHash,
      authorized_at: Date.now(),
    };
  }
  async function claim(checkExisting = false, expectedOwner = null) {
    if (claimFlight) return claimFlight;
    const flight = (async () => {
      const enrollment = await dependencies.ensureEnrollment();
      if (!enrollment) await diagnoseRenewalFailure();
      const ctx = await context();
      if (expectedOwner && ctx.owner !== expectedOwner)
        throw error("CONFIG_SCOPE_CHANGED");
      const key = await ensureKey(ctx);
      if (checkExisting) {
        try {
          const existing = await request(
            ctx,
            "extension-config/access",
            "GET",
            null,
            key,
          );
          scope(ctx, key, existing.meta?.access);
          assertCurrent(ctx);
          await dependencies.recoveryClaimed?.(ctx.owner);
          return { success: true, data: { registered: true }, httpStatus: 200 };
        } catch (failure) {
          if (failure.code !== "DEVICE_UNREGISTERED") throw failure;
        }
      }
      const result = await request(
        ctx,
        "extension-devices/claim",
        "POST",
        {},
        key,
      );
      assertCurrent(ctx);
      if (result.data?.registered !== true) {
        lease = null;
        state = {
          ready: false,
          code: result.data?.registration_code || "DEVICE_LIMIT_REACHED",
        };
        await dependencies.recoveryFailed?.(
          Object.assign(error(state.code), { owner: ctx.owner }),
        );
      } else await dependencies.recoveryClaimed?.(ctx.owner);
      return result;
    })();
    claimFlight = flight;
    try {
      return await flight;
    } catch (failure) {
      if (failure.code !== "CONFIG_SCOPE_CHANGED") {
        await invalidate(
          failure.code || "CONFIG_ACCESS_REQUIRED",
          failure,
          true,
        );
      }
      throw failure;
    } finally {
      if (claimFlight === flight) claimFlight = null;
    }
  }
  async function ready(force = false) {
    try {
      return await readyOnce(force);
    } catch (failure) {
      if (failure.code !== "CONFIG_SCOPE_CHANGED") {
        lease = null;
        state = {
          ready: false,
          code: failure.code || "CONFIG_FETCH_FAILED",
          retryable: failure.retryable === true,
        };
        await dependencies.recoveryFailed?.(failure);
      }
      throw failure;
    }
  }
  async function readyOnce(force = false) {
    const admission = dependencies.admit?.("extension-config/access");
    if (admission?.allowed === false)
      throw error(admission.code, admission.httpStatus);
    const enrollment = await dependencies.ensureEnrollment();
    if (!enrollment) await diagnoseRenewalFailure();
    const ctx = await context();
    if (
      !force &&
      lease?.owner === ctx.owner &&
      lease.epoch === epoch &&
      leaseNow() < lease.until
    )
      return lease;
    if (readinessFlight?.owner === ctx.owner && readinessFlight.epoch === epoch)
      return readinessFlight.promise;
    const flight = { owner: ctx.owner, epoch };
    flight.promise = (async () => {
      const record = await ensureKey(ctx);
      if (claimFlight) {
        const claimed = await claimFlight;
        assertCurrent(ctx);
        if (claimed.data?.registered !== true)
          throw error(
            claimed.data?.registration_code || "DEVICE_LIMIT_REACHED",
          );
      }
      const result = await request(
        ctx,
        "extension-config/access",
        "GET",
        null,
        record,
      );
      const access = scope(ctx, record, result.meta?.access);
      assertCurrent(ctx);
      lease = {
        owner: ctx.owner,
        epoch,
        ctx,
        record,
        scope: access,
        until: leaseNow() + access.authorization_ttl_sec * 1e3,
      };
      state = { ready: true, code: null, scope: access };
      await dependencies.recoveryAuthorized?.(ctx.owner);
      assertCurrent(ctx);
      return lease;
    })();
    readinessFlight = flight;
    try {
      return await flight.promise;
    } finally {
      if (readinessFlight === flight) readinessFlight = null;
    }
  }
  async function diagnoseRenewalFailure() {
    const ctx = await context();
    const renewalFailure = dependencies.enrollmentFailure?.();
    if (
      renewalFailure?.client_id === ctx.enrollment.client_id &&
      renewalFailure.audience === ctx.audience &&
      (renewalFailure.retryable === true ||
        renewalFailure.code === "CONFIG_SCOPE_CHANGED")
    ) {
      throw Object.assign(
        error(renewalFailure.code, renewalFailure.httpStatus),
        renewalFailure,
        { owner: ctx.owner },
      );
    }
    const status = await request(ctx, "extension-device-key");
    if (status.data.registered) {
      await DeviceKeyStore.reconcile(
        ctx.enrollment.client_id,
        status.data,
        validateBootstrap(status.meta?.bootstrap, ctx),
      );
    }
    if (status.data.replacement_required)
      throw error("CLIENT_RESET_REQUIRES_REPLACEMENT");
    throw error("ENROLLMENT_REQUIRED");
  }
  function query(options) {
    const params = new URLSearchParams();
    if (options.provider !== void 0) {
      if (
        typeof options.provider !== "string" ||
        !/^[a-z0-9_-]{1,50}$/.test(options.provider)
      )
        throw error("INVALID_CONFIG_QUERY", 422);
      params.set("provider", options.provider);
    }
    if (options.keys !== void 0) {
      if (
        !Array.isArray(options.keys) ||
        !options.keys.length ||
        options.keys.some(
          (key) => typeof key !== "string" || !/^[a-z0-9_]+$/.test(key),
        ) ||
        options.keys.join(",").length > 2e3
      )
        throw error("INVALID_CONFIG_QUERY", 422);
      params.set("keys", options.keys.join(","));
    }
    return params.size ? `?${params}` : "";
  }
  function consumerEnvelope(envelope2, active) {
    assertCurrent(active.ctx);
    return {
      ...envelope2,
      meta: {
        ...envelope2.meta,
        access: {
          ...envelope2.meta.access,
          authorization_ttl_sec: Math.max(
            0,
            Math.floor((active.until - leaseNow()) / 1e3),
          ),
        },
      },
    };
  }
  async function fetchConfig(operation, options = {}) {
    try {
      if (!Object.hasOwn(paths, operation))
        throw error("INVALID_CONFIG_OPERATION", 422);
      if (
        Object.keys(options).some(
          (key2) => !["provider", "keys", "force"].includes(key2),
        )
      )
        throw error("INVALID_CONFIG_QUERY", 422);
      const suffix = query(options);
      if (operation === "access") {
        if (suffix) throw error("INVALID_CONFIG_QUERY", 422);
        const active2 = await ready(options.force === true);
        return consumerEnvelope(
          {
            success: true,
            data: { registered: true },
            meta: { access: active2.scope },
            httpStatus: 200,
          },
          active2,
        );
      }
      const key = operation + suffix;
      const active = await ready();
      assertCurrent(active.ctx);
      if (options.force && flights.has(key)) {
        if (forcedFlights.has(key)) return forcedFlights.get(key);
        const existing = flights.get(key);
        const followup = (async () => {
          try {
            await existing;
          } catch (_) {}
          assertCurrent(active.ctx);
          if (flights.get(key) === existing) flights.delete(key);
          return fetchConfig(operation, options);
        })();
        forcedFlights.set(key, followup);
        try {
          return await followup;
        } finally {
          if (forcedFlights.get(key) === followup) forcedFlights.delete(key);
        }
      }
      if (options.force) {
        for (const cachedKey of cache.keys())
          if (cachedKey === operation || cachedKey.startsWith(operation + "?"))
            cache.delete(cachedKey);
        if (operation === "api" || operation === "private") {
          privateEpoch++;
          for (const cachedKey of cache.keys())
            if (cachedKey === "private" || cachedKey.startsWith("private?"))
              cache.delete(cachedKey);
          dependencies.invalidateResource?.("private");
        }
      }
      const cached = cache.get(key);
      if (
        !options.force &&
        cached?.epoch === epoch &&
        Date.now() < cached.expiresAt
      )
        return consumerEnvelope(cached.envelope, active);
      if (flights.has(key))
        return consumerEnvelope(await flights.get(key), active);
      const resourceEpoch = privateEpoch;
      const promise = (async () => {
        const envelope2 = await request(
          active.ctx,
          `extension-config/${paths[operation]}${suffix}`,
          "GET",
          null,
          active.record,
        );
        if (operation === "private" && resourceEpoch !== privateEpoch) {
          assertCurrent(active.ctx);
          if (flights.get(key) === promise) flights.delete(key);
          return fetchConfig(operation, { ...options, force: true });
        }
        const access = scope(active.ctx, active.record, envelope2.meta?.access);
        const ttl =
          operation === "execution"
            ? 3e5
            : operation === "aiTools"
              ? 3e4
              : 36e5;
        await write(async () => {
          assertCurrent(active.ctx);
          const values = { toby_config_access_scope: access };
          if (!suffix && cacheKeys[operation]) {
            values[cacheKeys[operation]] =
              operation === "execution"
                ? envelope2.data
                : {
                    data: envelope2.data,
                    meta: envelope2.meta,
                    scope: access,
                    fetchedAt: Date.now(),
                    expiresAt: Date.now() + ttl,
                  };
          }
          if (operation === "api" && !suffix) {
            const cg = {
              ...envelope2.data?.chatgpt?.configs?.error_patterns,
              ...envelope2.data?.chatgpt?.configs?.ui_text_patterns,
            };
            values.af_chatgpt_config = {
              data: cg,
              fetched_at: Date.now(),
              scope: access,
            };
            values.af_grok_config = {
              data: envelope2.data?.grok?.configs?.error_patterns || {},
              fetched_at: Date.now(),
              scope: access,
            };
          }
          await storage.set(values);
          assertCurrent(active.ctx);
          if (operation === "api" && !suffix)
            await dependencies.commitUrls?.(envelope2.data, access);
        });
        cache.set(key, {
          envelope: envelope2,
          epoch,
          expiresAt: Date.now() + ttl,
        });
        return envelope2;
      })();
      flights.set(key, promise);
      try {
        return consumerEnvelope(await promise, active);
      } finally {
        if (flights.get(key) === promise) flights.delete(key);
      }
    } catch (failure) {
      if (
        failure.httpStatus !== 422 &&
        failure.code !== "CONFIG_SCOPE_CHANGED"
      ) {
        await invalidate(failure.code || "CONFIG_FETCH_FAILED", failure);
      }
      throw failure;
    }
  }
  async function envelope(operation, options) {
    try {
      return await fetchConfig(operation, options);
    } catch (failure) {
      return {
        success: false,
        error: { code: failure.code || "CONFIG_FETCH_FAILED" },
        httpStatus: failure.httpStatus || 503,
      };
    }
  }
  async function markReady() {
    const active = await ready();
    return write(async () => {
      assertCurrent(active.ctx);
      const stored = await storage.get([
        "toby_provider_configs",
        "toby_provider_api_configs",
      ]);
      if (
        !["toby_provider_configs", "toby_provider_api_configs"].every((key) => {
          const snapshot = stored[key];
          return (
            snapshot?.data &&
            snapshot.scope?.auth_epoch === active.ctx.epoch &&
            snapshot.scope.token_hash === active.ctx.tokenHash &&
            snapshot.scope.client_id === active.ctx.enrollment.client_id
          );
        })
      )
        return false;
      await storage.set({ _tobyConfigsReady: Date.now() });
      assertCurrent(active.ctx);
      return true;
    });
  }
  async function prepareMutation(method, url, payload, token) {
    const ctx = await context();
    if (ctx.token !== token) throw error("CONFIG_SCOPE_CHANGED");
    const record = await ensureKey(ctx);
    return prepare(method, url, payload, ctx, record);
  }
  async function prepareRenewal(url, payload) {
    const record = await DeviceKeyStore.get();
    if (!record?.key_revision) return null;
    const ctx = await context(false);
    return prepare("POST", url, payload, ctx, record);
  }
  async function rotate() {
    if (rotationFlight) return rotationFlight;
    const flight = rotateOnce();
    rotationFlight = flight;
    try {
      return await flight;
    } finally {
      if (rotationFlight === flight) rotationFlight = null;
    }
  }
  async function rotateOnce() {
    const ctx = await context();
    const pending = await DeviceKeyStore.get("pending_rotation");
    keyFlight = null;
    const current = await ensureKey(ctx);
    if (pending?.key_id === current.key_id) {
      await invalidate("KEY_REVISION_CHANGED");
      return {
        success: true,
        data: {
          registered: true,
          key_id: current.key_id,
          key_revision: current.key_revision,
        },
      };
    }
    const candidate = await DeviceKeyStore.stageRotation(
      ctx.enrollment.client_id,
    );
    const challenge = await request(
      ctx,
      "extension-device-key/challenge",
      "POST",
      { operation: "rotate", public_key_id: candidate.key_id },
    );
    const response = await request(
      ctx,
      "extension-device-key/rotate",
      "POST",
      {
        challenge_id: challenge.data.challenge_id,
        public_key_spki: candidate.public_key_spki,
      },
      current,
      candidate,
    );
    assertCurrent(ctx);
    await DeviceKeyStore.reconcile(
      ctx.enrollment.client_id,
      response.data,
      current.bootstrap,
    );
    await invalidate("KEY_REVISION_CHANGED");
    return { success: true, data: response.data };
  }
  async function replaceIdentity(retryOrphan = false) {
    if (replacementFlight) return replacementFlight;
    const flight = replaceOnce(retryOrphan);
    replacementFlight = flight;
    try {
      return await flight;
    } finally {
      if (replacementFlight === flight) replacementFlight = null;
    }
  }
  async function replaceOnce(retryOrphan) {
    if (
      [
        "CLIENT_BANNED",
        "DEVICE_BANNED",
        "ACCOUNT_DISABLED",
        "ACCOUNT_BLOCKED",
        "DEVICE_KEY_REVOKED",
        "EXTENSION_NOT_AUTHORIZED",
      ].includes(state.code)
    ) {
      throw error(state.code);
    }
    const ctx = await context();
    const status = await request(ctx, "extension-device-key");
    if (status.data?.revoked) throw error("DEVICE_KEY_REVOKED");
    let pending = await DeviceKeyStore.stageReplacement(retryOrphan);
    if (pending.request_sent && !pending.enrollment)
      throw error("REPLACEMENT_RESPONSE_LOST", 409);
    if (!pending.enrollment) {
      pending = await DeviceKeyStore.put({ ...pending, request_sent: true });
      const response = await fetch(`${ctx.audience}/enroll`, {
        method: "POST",
        cache: "no-store",
        redirect: "error",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Extension-Id": chrome.runtime.id,
          "X-Ext-Version": chrome.runtime.getManifest().version,
        },
        body: JSON.stringify({
          device_fingerprint: pending.device_fingerprint,
          ext_version: chrome.runtime.getManifest().version,
          request_nonce: DeviceKeyStore.nonce(),
        }),
      });
      dependencies.syncTime(response);
      const result = await response.json();
      if (
        !response.ok ||
        !result.success ||
        !result.data?.client_id ||
        !result.data.secret
      ) {
        throw error(
          result.error?.code || "REPLACEMENT_ENROLLMENT_FAILED",
          response.status,
        );
      }
      assertCurrent(ctx);
      pending = await DeviceKeyStore.put({
        ...pending,
        enrollment: {
          ...result.data,
          device_fingerprint: pending.device_fingerprint,
        },
      });
    }
    assertCurrent(ctx);
    await DeviceKeyStore.commitReplacement(pending.enrollment);
    await invalidate("DEVICE_IDENTITY_REPLACED");
    await DeviceKeyStore.recoverReplacement();
    await dependencies.replacementCommitted?.();
    return { success: true, data: { replaced: true } };
  }
  self.ProtectedConfigClient = Object.freeze({
    configure: (value) => {
      dependencies = value;
    },
    allowedSender,
    allowedProviderSender,
    invalidate,
    fetch: fetchConfig,
    envelope,
    ready,
    markReady,
    claim,
    prepareMutation,
    prepareRenewal,
    rotate,
    replaceIdentity,
    status: () => ({ ...state, ready: !!lease && leaseNow() < lease.until }),
  });
})();
