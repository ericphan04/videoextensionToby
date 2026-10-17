(function () {
  "use strict";
  const LOG = "[MediaIntercept/bridge]";
  const CH_REQ = "TOBY_MEDIA_INTERCEPT";
  const CH_RES = "TOBY_MEDIA_INTERCEPT_RESULT";
  const CH_CFG = "TOBY_MEDIA_INTERCEPT_CONFIG";
  const send = (id, base64, reason) =>
    window.postMessage(
      { channel: CH_RES, id, base64: base64 || "", reason: reason || null },
      "*",
    );
  const BID = crypto?.randomUUID?.() || String(Date.now()) + Math.random();
  const EPOCH = (window.__tobyBridgeEpoch =
    (window.__tobyBridgeEpoch || 0) + 1);
  const isStale = () => window.__tobyBridgeEpoch !== EPOCH;
  const TICKET_TTL_MS = 9e4;
  let _ticket = null;
  const takeTicket = () => {
    if (!_ticket) return null;
    if (Date.now() - _ticket.at < TICKET_TTL_MS) return _ticket.mode;
    _ticket = null;
    console.log(
      `${LOG} v\xE9 \u0111\xE3 qu\xE1 h\u1EA1n \u2192 theo thi\u1EBFt l\u1EADp chung`,
    );
    return null;
  };
  async function userWantsClean(kind) {
    try {
      const st = await chrome.storage.local.get(["af_settings"]);
      const k =
        kind === "video" ? "autoRemoveWatermarkVideo" : "autoRemoveWatermark";
      const v = st?.af_settings?.[k];
      return v === true || v === "1" || v === 1;
    } catch (e) {
      console.warn(
        `${LOG} kh\xF4ng \u0111\u1ECDc \u0111\u01B0\u1EE3c thi\u1EBFt l\u1EADp:`,
        e?.message,
      );
      return false;
    }
  }
  const onRequest = async (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (
      !d ||
      d.channel !== CH_REQ ||
      typeof d.id !== "string" ||
      !d.id ||
      d.id.length > 160
    )
      return;
    if (typeof d.base64 !== "string" || d.base64.length === 0) return;
    if (
      typeof d.mime !== "string" ||
      !/^(?:image\/(?:png|jpeg|webp)|video\/mp4)$/i.test(d.mime)
    )
      return;
    if (d.url != null && typeof d.url !== "string") return;
    if (isStale()) return;
    try {
      const kind = /^video\//i.test(d.mime || "") ? "video" : "image";
      const gate = await chrome.runtime.sendMessage({
        action: "wm:canRemove",
        mediaType: kind,
      });
      if (!gate?.allowed) {
        console.log(
          `${LOG} b\u1ECF qua (${gate?.reason || "kh\xF4ng c\xF3 quy\u1EC1n"})`,
        );
        return send(d.id, null, "blocked");
      }
      const _tk = takeTicket();
      if (_tk === "original") {
        console.log(
          `${LOG} b\u1ECF qua: ng\u01B0\u1EDDi d\xF9ng ch\u1ECDn B\u1EA2N G\u1ED0C cho l\u01B0\u1EE3t n\xE0y`,
        );
        return send(d.id, null, "user_original");
      }
      if (_tk !== "clean" && !(await userWantsClean(kind))) {
        console.log(
          `${LOG} b\u1ECF qua: thi\u1EBFt l\u1EADp xo\xE1 watermark (${kind}) \u0111ang T\u1EAET`,
        );
        return send(d.id, null, "disabled");
      }
      if (_tk === "clean")
        console.log(
          `${LOG} ng\u01B0\u1EDDi d\xF9ng ch\u1ECDn B\u1EA2N S\u1EA0CH cho l\u01B0\u1EE3t n\xE0y (v\u01B0\u1EE3t thi\u1EBFt l\u1EADp chung)`,
        );
      if (kind === "video") {
        try {
          window.postMessage(
            { channel: "TOBY_MEDIA_INTERCEPT_STATE", phase: "cleaning" },
            "*",
          );
        } catch (_) {}
        const v = await chrome.runtime
          .sendMessage({
            action: "wm:cleanVideo",
            base64: d.base64,
            mime: d.mime || "video/mp4",
          })
          .catch((e) => ({ ok: false, error: e?.message }));
        if (v?.ok && v.base64) {
          console.log(`${LOG} \u0111\xE3 xo\xE1 (video)`);
          return send(d.id, v.base64);
        }
        if (v?.ok && v.applied === false && v.noWatermark === true) {
          console.log(
            `${LOG} kh\xF4ng ph\xE1t hi\u1EC7n watermark video (${v.reason}) \u2192 gi\u1EEF file g\u1ED1c`,
          );
          return send(d.id, null, v.reason || "not_found");
        }
        const why = v?.error || "kh\xF4ng r\xF5";
        console.log(
          `${LOG} kh\xF4ng xo\xE1 (video): ${why}` +
            (/receiving end|No receiving/i.test(why)
              ? " \u2014 h\xE3y M\u1EDE SIDEBAR r\u1ED3i t\u1EA3i l\u1EA1i"
              : ""),
        );
        return send(d.id, null, "error");
      }
      try {
        window.postMessage(
          { channel: "TOBY_MEDIA_INTERCEPT_STATE", phase: "cleaning" },
          "*",
        );
      } catch (_) {}
      const r = await chrome.runtime.sendMessage({
        action: "removeWatermark",
        base64: d.base64,
        mime: d.mime,
        mediaType: kind,
      });
      if (r?.success && r.applied && r.base64) {
        console.log(`${LOG} \u0111\xE3 xo\xE1 (${kind})`);
        return send(d.id, r.base64);
      }
      console.log(
        `${LOG} kh\xF4ng xo\xE1 (${r?.reason || r?.error || "kh\xF4ng r\xF5"})`,
      );
      send(d.id, null, r?.success ? r.reason || "not_found" : "error");
    } catch (e) {
      const m = e?.message || "";
      if (/Extension context invalidated|context invalidated/i.test(m)) {
        try {
          window.removeEventListener("message", onRequest);
        } catch (_) {}
        if (isStale()) {
          console.info(
            `${LOG} b\u1EA3n m\u1ED3 c\xF4i r\xFAt lui, b\u1EA3n m\u1EDBi ti\u1EBFp qu\u1EA3n.`,
          );
          return;
        }
        console.info(
          `${LOG} extension \u0111\xE3 n\u1EA1p l\u1EA1i \u2192 T\u1EAET l\u1EDBp ch\u1EB7n t\u1EDBi khi b\u1EA3n m\u1EDBi \u0111\u01B0\u1EE3c ti\xEAm.`,
        );
        window.__tobyInterceptActive = false;
        try {
          window.postMessage(
            {
              channel: CH_CFG,
              enabled: false,
              allowed: false,
              patterns: [],
              bid: BID,
            },
            "*",
          );
        } catch (_) {}
      } else {
        console.warn(`${LOG} l\u1ED7i:`, m);
      }
      send(d.id, null, "error");
    }
  };
  window.addEventListener("message", onRequest);
  function classifyReason(reason) {
    if (!reason) return "no_patterns";
    if (reason === "AUTH_REQUIRED" || reason === "PLAN_REQUIRED")
      return "no_permission";
    if (reason === "HTTP_401" || reason === "HTTP_403") return "no_permission";
    if (reason === "CONFIG_MISSING" || reason === "NO_URL_PATTERNS")
      return "no_patterns";
    return "transient";
  }
  async function pushConfig() {
    let patterns = [],
      enabled = false,
      allowed = false,
      timeout_ms,
      image_timeout_ms;
    let cfgReason = "EXCEPTION";
    try {
      const resp = await chrome.runtime.sendMessage({
        action: "wm:getInterceptConfig",
      });
      cfgReason = resp ? (resp.reason ?? null) : "EXCEPTION";
      if (
        resp?.success &&
        Array.isArray(resp.patterns) &&
        resp.patterns.length
      ) {
        patterns = resp.patterns;
        enabled = resp.enabled !== false;
        timeout_ms = resp.timeout_ms;
        image_timeout_ms = resp.image_timeout_ms;
      } else {
        const message =
          `${LOG} ch\u01B0a c\xF3 m\u1EABu URL t\u1EEB server \u2192 kh\xF4ng ch\u1EB7n` +
          (cfgReason ? ` (${cfgReason})` : "");
        if (["AUTH_REQUIRED", "HTTP_401", "HTTP_403"].includes(cfgReason))
          console.info(message);
        else console.warn(message);
      }
      const [gi, gv] = await Promise.all([
        chrome.runtime
          .sendMessage({ action: "wm:canRemove", mediaType: "image" })
          .catch(() => null),
        chrome.runtime
          .sendMessage({ action: "wm:canRemove", mediaType: "video" })
          .catch(() => null),
      ]);
      allowed = !!(gi?.allowed || gv?.allowed);
      if (!allowed)
        console.log(
          `${LOG} t\xE0i kho\u1EA3n kh\xF4ng c\xF3 quy\u1EC1n xo\xE1 watermark \u2192 kh\xF4ng ch\u1EB7n`,
        );
    } catch (e) {
      if (
        /Extension context invalidated|context invalidated/i.test(
          e?.message || "",
        ) ||
        isDead()
      ) {
        return { active: false, why: "dead" };
      }
      console.warn(
        `${LOG} kh\xF4ng l\u1EA5y \u0111\u01B0\u1EE3c c\u1EA5u h\xECnh:`,
        e?.message,
      );
    }
    if (isDead()) return { active: false, why: "dead" };
    const active = !!(enabled && allowed && patterns.length);
    window.__tobyInterceptActive = active;
    window.postMessage(
      {
        channel: CH_CFG,
        enabled,
        allowed,
        patterns,
        timeout_ms,
        image_timeout_ms,
        bid: BID,
      },
      "*",
    );
    let why;
    if (active) why = "ok";
    else if (!allowed) why = "no_permission";
    else why = classifyReason(cfgReason);
    return { active, why };
  }
  try {
    window.addEventListener("message", (ev) => {
      if (ev.source !== window) return;
      if (ev.data?.channel !== "TOBY_WM_ORIGIN_TICKET") return;
      if (isStale() || isDead()) return;
      if (!ev.data.mode) {
        if (_ticket)
          console.log(
            `${LOG} thu v\xE9 (l\u01B0\u1EE3t t\u1EA3i \u0111\xE3 xong)`,
          );
        _ticket = null;
        return;
      }
      const mode = ev.data.mode === "clean" ? "clean" : "original";
      _ticket = { mode, at: Date.now() };
      console.log(
        `${LOG} nh\u1EADn v\xE9 "${mode === "clean" ? "b\u1EA3n s\u1EA1ch" : "b\u1EA3n g\u1ED1c"}" cho l\u01B0\u1EE3t t\u1EA3i t\u1EDBi`,
      );
    });
  } catch (_) {}
  const RETRY_DELAYS = [1500, 4e3, 1e4, 3e4];
  const PERM_RETRY_DELAYS = [6e4, 12e4, 3e5, 3e5];
  const KEEP_TRYING = ["no_permission", "transient"];
  let _retryTimer = null;
  function isDead() {
    try {
      return !chrome?.runtime?.id;
    } catch (_) {
      return true;
    }
  }
  async function pushConfigWithRetry(attempt) {
    attempt = attempt || 0;
    if (isDead()) return;
    let active = false,
      why = "transient";
    try {
      ({ active, why } = await pushConfig());
    } catch (e) {
      if (
        /Extension context invalidated|context invalidated/i.test(
          e?.message || "",
        ) ||
        isDead()
      )
        return;
      console.warn(
        `${LOG} \u0111\u1EA9y c\u1EA5u h\xECnh l\u1ED7i:`,
        e?.message,
      );
    }
    if (why === "dead" || isDead()) return;
    if (active) {
      scheduleReassert();
      return;
    }
    const delays = KEEP_TRYING.includes(why)
      ? [...RETRY_DELAYS, ...PERM_RETRY_DELAYS]
      : RETRY_DELAYS;
    const next = delays[attempt];
    if (next === void 0) {
      const message =
        `${LOG} v\u1EABn ch\u01B0a b\u1EADt \u0111\u01B0\u1EE3c sau ${attempt + 1} l\u01B0\u1EE3t (${why}) \u2192 l\u1EDBp ch\u1EB7n T\u1EAET.` +
        (why === "no_permission"
          ? ""
          : " Ki\u1EC3m tra: \u0111\xE3 ch\u1EA1y migration m\u1EABu URL ch\u01B0a, t\xE0i kho\u1EA3n c\xF3 quy\u1EC1n kh\xF4ng.");
      if (why === "no_permission") console.info(message);
      else console.warn(message);
      return;
    }
    _retryTimer = setTimeout(() => pushConfigWithRetry(attempt + 1), next);
  }
  function restartRetry() {
    if (_retryTimer) {
      clearTimeout(_retryTimer);
      _retryTimer = null;
    }
    pushConfigWithRetry();
  }
  const REASSERT_DELAYS = [3e3, 1e4];
  function scheduleReassert() {
    for (const d of REASSERT_DELAYS) {
      setTimeout(() => {
        if (!isStale() && !isDead()) pushConfig().catch(() => {});
      }, d);
    }
  }
  pushConfigWithRetry();
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.action === "wm:interceptConfigChanged") restartRetry();
    });
  } catch (_) {}
  let _lastReturnPush = 0;
  function pushOnReturn() {
    if (isStale() || isDead()) return;
    if (window.__tobyInterceptActive === true) return;
    if (Date.now() - _lastReturnPush < 5e3) return;
    _lastReturnPush = Date.now();
    restartRetry();
  }
  try {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) pushOnReturn();
    });
    window.addEventListener("focus", pushOnReturn);
  } catch (_) {}
})();
