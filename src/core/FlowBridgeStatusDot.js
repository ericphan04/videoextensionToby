(function () {
  "use strict";
  const DOT_ID = "flowBridgeDot";
  const POLL_MS = 5e3;
  let _timer = null;
  let _updateInFlight = null;
  let _started = false;
  function _isApiModeSetting() {
    try {
      if (
        window.featureGate?.canUse &&
        !window.featureGate.canUse("flow_api_enabled")
      )
        return false;
      const s = window.storageSettings?.getSettings?.() || {};
      const enabled =
        s.apiModeEnabled === true ||
        s.apiModeEnabled === "true" ||
        s.apiModeEnabled === 1;
      if (!enabled) return false;
      const mode = s.defaultGenMode || s.gen_mode || "ui";
      return mode === "api" || mode === "auto";
    } catch (_) {
      return false;
    }
  }
  const t = (k, d) => window.I18n?.t?.(k) || d;
  function update() {
    if (_updateInFlight) return _updateInFlight;
    _updateInFlight = _update().finally(() => {
      _updateInFlight = null;
    });
    return _updateInFlight;
  }
  async function _update() {
    const dot = document.getElementById(DOT_ID);
    if (!dot || !window.FlowApiSessionCoordinator) return;
    if (!_isApiModeSetting()) {
      dot.style.display = "none";
      return;
    }
    dot.style.display = "";
    if (window.FlowApiV2Driver?.hasActiveMutation?.() === true) {
      dot.setAttribute("aria-busy", "true");
      return;
    }
    dot.setAttribute("aria-busy", "false");
    let status;
    try {
      const checked = await window.FlowApiSessionCoordinator.check({
        surface: "gen",
        mediaType: "image",
        passive: true,
      });
      status = {
        installed: checked.installed !== false,
        sessionReady: checked.ready === true,
        driver: checked.driver,
        reason: checked.reason,
        action: checked.action,
      };
    } catch (_) {
      status = {
        installed: true,
        sessionReady: false,
        reason: "session_refresh_timeout",
      };
    }
    dot.classList.remove("dot-ready", "dot-warn", "dot-off");
    if (status.installed && status.sessionReady) {
      dot.classList.add("dot-ready");
      delete dot.dataset.healthAction;
      const label =
        status.driver === "v2"
          ? t("settings.flowApiV2Connected", "Flow API V2 connected")
          : t("settings.bridgeDotReady", "TobyBridge ready \u2014 Flow API V1");
      dot.setAttribute("data-tooltip", label);
      dot.setAttribute("aria-label", label);
    } else if (status.installed) {
      dot.classList.add("dot-warn");
      const label =
        {
          bridge_outdated: t(
            "settings.bridgeOutdated",
            "TobyBridge must be updated",
          ),
          capability_missing: t(
            "settings.bridgeOutdated",
            "TobyBridge must be updated",
          ),
          flow_project_tab_required: t(
            "settings.bridgeFlowTabRequired",
            "Open a Flow project tab",
          ),
          project_mismatch: t(
            "errors.flowErr_project_mismatch",
            "Open the correct Flow project",
          ),
          login_required: t("settings.bridgeSignInRequired", "Sign in to Flow"),
          csrf_missing: t(
            "settings.bridgeSignInRequired",
            "Refresh the Flow session",
          ),
          fresh_page_session_required: t(
            "settings.bridgeSignInRequired",
            "Refresh the Flow session",
          ),
          session_refresh_timeout: t(
            "settings.flowApiV2SessionTimeout",
            "Flow session refresh timed out",
          ),
          page_reloading: t("common.refreshingFlow", "Refreshing Flow page..."),
          content_script_recovering: t(
            "settings.flowApiContentRecovering",
            "Restoring the Flow page connection...",
          ),
          build_drift: t(
            "settings.flowApiV2BuildDrift",
            "TobyFlow and Flow protocol do not match",
          ),
          protocol_config_missing: t(
            "settings.flowApiV2BuildDrift",
            "Flow API V2 configuration is incomplete",
          ),
        }[status.reason] ||
        t(
          "settings.bridgeDotWarn",
          "TobyBridge not ready \u2014 open the Flow tab & sign in",
        );
      dot.dataset.healthAction = status.action || "retry";
      dot.setAttribute("data-tooltip", label);
      dot.setAttribute("aria-label", label);
    } else {
      dot.classList.add("dot-off");
      delete dot.dataset.healthAction;
      const label = t(
        "settings.bridgeDotOff",
        "TobyBridge not installed \u2014 click for instructions",
      );
      dot.setAttribute("data-tooltip", label);
      dot.setAttribute("aria-label", label);
    }
  }
  async function _onClick(e) {
    if (!e.target.closest || !e.target.closest("#" + DOT_ID)) return;
    e.stopPropagation();
    e.preventDefault();
    const dot = document.getElementById(DOT_ID);
    if (dot && dot.classList.contains("dot-warn")) {
      if (
        ["update_bridge", "update_tobyflow", "contact_support"].includes(
          dot.dataset.healthAction,
        )
      ) {
        try {
          chrome.runtime.openOptionsPage?.();
        } catch (_) {}
        return;
      }
      const restoreFocus = e.isTrusted === true;
      dot.setAttribute("aria-busy", "true");
      try {
        await window.FlowApiSessionCoordinator?.reconnect?.({
          surface: "gen",
          mediaType: "image",
          userInitiated: true,
          force: true,
        });
      } catch (_) {}
      dot.setAttribute("aria-busy", "false");
      if (
        restoreFocus &&
        document.visibilityState === "visible" &&
        dot.isConnected
      ) {
        dot.focus?.({ preventScroll: true });
      }
      setTimeout(update, 1500);
      return;
    }
    try {
      chrome.runtime.openOptionsPage?.();
    } catch (_) {}
  }
  function start() {
    if (_started) return;
    _started = true;
    const dot = document.getElementById(DOT_ID);
    if (dot) dot.addEventListener("click", _onClick, true);
    update();
    if (_timer) clearInterval(_timer);
    _timer = setInterval(update, POLL_MS);
    window.eventBus?.on?.("settings:changed", update);
    window.eventBus?.on?.("featuregate:refreshed", update);
    window.eventBus?.on?.("execution:tracker_update", update);
    window.eventBus?.on?.("flow_api:auth_invalid", () => update());
    window.eventBus?.on?.("flow_api:mutation_activity", update);
    window.eventBus?.on?.("bridge:changed", update);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
  window.FlowBridgeStatusDot = { update, start };
})();
