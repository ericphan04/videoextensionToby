(() => {
  "use strict";
  if (globalThis.ConfigSnapshotAccess) return;
  const protectedKeys = new Set([
    "toby_provider_configs",
    "toby_provider_api_configs",
    "toby_provider_models",
    "toby_provider_dom_selectors",
    "_tobyConfigsReady",
    "af_chatgpt_config",
    "af_grok_config",
    "af_execution_config",
  ]);
  let provider = null;
  let epoch = 0;
  let flight = null;
  let lease = null;
  let code = "AUTH_REQUIRED";
  let retryAt = 0;
  const listeners = new Set();
  const leaseNow = () => globalThis.performance?.now?.() ?? Date.now();
  function invalidate(reason) {
    epoch++;
    lease = null;
    flight = null;
    code = reason || "CONFIG_ACCESS_REQUIRED";
    for (const listener of listeners) listener(code);
  }
  async function ensure() {
    if (lease && leaseNow() < lease.until) return true;
    if (flight) return flight;
    if (!provider || Date.now() < retryAt) return false;
    const started = epoch;
    const task = (async () => {
      try {
        const dom = await chrome.runtime.sendMessage({
          action: "getProviderConfigs",
          provider,
        });
        const api = dom?.success
          ? await chrome.runtime.sendMessage({
              action: "getProviderApiConfigs",
              provider,
            })
          : dom;
        const access = api?.meta?.access;
        if (started !== epoch) return false;
        if (
          !dom?.success ||
          !api?.success ||
          access?.contract !== "device-v1" ||
          !(access.authorization_ttl_sec > 0)
        ) {
          code = api?.error?.code || "CONFIG_ACCESS_REQUIRED";
          lease = null;
          retryAt = Date.now() + 1e3;
          return false;
        }
        lease = {
          access,
          until: leaseNow() + access.authorization_ttl_sec * 1e3,
        };
        code = null;
        return true;
      } catch (_) {
        if (started === epoch) {
          lease = null;
          code = "CONFIG_CONTRACT_UNAVAILABLE";
          retryAt = Date.now() + 1e3;
        }
        return false;
      }
    })();
    flight = task;
    try {
      return await task;
    } finally {
      if (flight === task) flight = null;
    }
  }
  async function read(keys, callback) {
    const result = await (async () => {
      const list =
        typeof keys === "string"
          ? [keys]
          : Array.isArray(keys)
            ? keys
            : Object.keys(keys || {});
      const needsConfig =
        keys === null || list.some((key) => protectedKeys.has(key));
      const authorized = needsConfig ? await ensure() : false;
      const started = epoch;
      const stored = await chrome.storage.local.get([
        ...new Set([
          ...list,
          "toby_config_access_scope",
          "af_auth",
          "toby_client_enrollment",
        ]),
      ]);
      const sidecar = stored.toby_config_access_scope;
      const access = lease?.access;
      const tokenHash =
        needsConfig && stored.af_auth?.token
          ? Array.from(
              new Uint8Array(
                await crypto.subtle.digest(
                  "SHA-256",
                  new TextEncoder().encode(stored.af_auth.token),
                ),
              ),
              (byte) => byte.toString(16).padStart(2, "0"),
            ).join("")
          : null;
      const sameScope =
        authorized &&
        started === epoch &&
        access &&
        leaseNow() < lease.until &&
        sidecar?.contract === "device-v1" &&
        sidecar.client_id === access.client_id &&
        sidecar.key_id === access.key_id &&
        sidecar.key_revision === access.key_revision &&
        sidecar.product_id === access.product_id &&
        String(stored.af_auth?.user?.id) === String(access.user_id) &&
        sidecar.token_hash === tokenHash &&
        stored.toby_client_enrollment?.client_id === access.client_id;
      const output = {};
      for (const key of list) {
        let value = stored[key];
        if (protectedKeys.has(key)) {
          const scope =
            key === "af_execution_config" || key === "_tobyConfigsReady"
              ? sidecar
              : value?.scope;
          if (
            !sameScope ||
            scope?.contract !== "device-v1" ||
            scope.client_id !== access.client_id ||
            scope.key_id !== access.key_id ||
            scope.key_revision !== access.key_revision ||
            String(scope.user_id) !== String(access.user_id) ||
            scope.product_id !== access.product_id ||
            scope.token_hash !== tokenHash ||
            scope.auth_epoch !== sidecar.auth_epoch ||
            scope.audience !== sidecar.audience
          )
            value = void 0;
        }
        output[key] = value;
      }
      return output;
    })().catch(() => {
      invalidate("LOCAL_STORAGE_UNAVAILABLE");
      const list =
        typeof keys === "string"
          ? [keys]
          : Array.isArray(keys)
            ? keys
            : Object.keys(keys || {});
      return Object.fromEntries(list.map((key) => [key, void 0]));
    });
    if (callback) callback(result);
    return result;
  }
  function acceptChange(snapshot) {
    const access = lease?.access;
    return (
      !!access &&
      leaseNow() < lease.until &&
      snapshot?.scope?.contract === "device-v1" &&
      snapshot.scope.client_id === access.client_id &&
      snapshot.scope.key_id === access.key_id &&
      snapshot.scope.key_revision === access.key_revision &&
      String(snapshot.scope.user_id) === String(access.user_id)
    );
  }
  async function updateOverlay(overlay) {
    if (!overlay || !code) return;
    const group =
      code === "AUTH_REQUIRED"
        ? "login"
        : ["KEY_MISSING", "KEY_MISMATCH", "DEVICE_KEY_REQUIRED"].includes(code)
          ? "key"
          : /DEVICE_(UNREGISTERED|LIMIT|REVOKED)|EXTENSION_DEVICE_(LIMIT|REVOKED)/.test(
                code,
              )
            ? "device"
            : /BANNED|BLOCKED|DISABLED|KEY_REVOKED|NOT_AUTHORIZED/.test(code)
              ? "blocked"
              : "service";
    const locale =
      (await chrome.storage.local.get("af_locale")).af_locale || "en";
    const cached = (await chrome.storage.local.get(`toby_i18n_${locale}`))[
      `toby_i18n_${locale}`
    ]?.data;
    const message = cached?.[`configAccess.${group}`];
    if (message) {
      const title = overlay.querySelector("h3");
      const description = overlay.querySelector("p");
      if (title) title.textContent = message;
      if (description) description.textContent = "";
    }
    if (group !== "service") {
      const button = overlay.querySelector("button");
      if (button) {
        const next = button.cloneNode(true);
        if (cached?.["configAccess.settings"])
          next.textContent = cached["configAccess.settings"];
        next.addEventListener("click", () =>
          chrome.runtime
            .sendMessage({ action: "openSettings" })
            .catch(() => {}),
        );
        button.replaceWith(next);
      }
    }
  }
  globalThis.ConfigSnapshotAccess = Object.freeze({
    read,
    ensure,
    acceptChange,
    updateOverlay,
    start: (value) => {
      provider = value;
      ensure().catch(() => {});
    },
    active: () => !!lease && leaseNow() < lease.until,
    code: () => code,
    onInvalidated: (listener) => listeners.add(listener),
  });
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "CONFIG_ACCESS_INVALIDATED") invalidate(message.code);
    if (message.type === "CONFIG_ACCESS_RECOVERED") {
      retryAt = 0;
      read(["toby_provider_configs", "toby_provider_api_configs"])
        .then((snapshot) => {
          const api = snapshot.toby_provider_api_configs?.data?.[provider];
          if (
            snapshot.toby_provider_configs?.data?.[provider] &&
            api &&
            lease &&
            leaseNow() < lease.until &&
            (provider !== "flow" ||
              api.configs?.flow_v2_driver?.enabled === true)
          ) {
            globalThis.document
              ?.getElementById?.("tobyflow-config-error-overlay")
              ?.remove();
          }
        })
        .catch(() => {});
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    const auth = changes.af_auth;
    const authChanged =
      auth &&
      (auth.oldValue?.token !== auth.newValue?.token ||
        String(auth.oldValue?.user?.id) !== String(auth.newValue?.user?.id) ||
        auth.oldValue?.apiBaseUrl !== auth.newValue?.apiBaseUrl);
    const client = changes.toby_client_enrollment;
    if (
      area === "local" &&
      (authChanged ||
        (client && client.oldValue?.client_id !== client.newValue?.client_id) ||
        (changes.toby_config_access_scope &&
          !changes.toby_config_access_scope.newValue))
    )
      invalidate("CONFIG_SCOPE_CHANGED");
  });
})();
