(async function () {
  "use strict";
  const root = document.getElementById("autoCapcutApp");
  const t = (key, fallback) => window.I18n?.t?.(key) || fallback;
  const defaultState = {
    step: 0,
    name: "",
    audio: null,
    folder: null,
    media: [],
    mediaTotal: 0,
    srt: null,
    script: null,
    sort: "natural",
    motion: "random",
    subtitles: true,
    alignmentMode: "srt",
    manualOverrides: {},
    progress: 0,
    status: "",
    diagnostics: [],
  };
  if (!window.eventBus && window.EventBus) window.eventBus = new EventBus();
  try {
    await window.I18n?.init?.();
    await window.SystemConfig?.restoreFromStorage?.();
    await window.SystemConfig?.fetch?.(true);
    if (window.AuthManager && !window.authManager)
      window.authManager = new AuthManager();
    await window.authManager?.init?.();
    if (window.FeatureGate && !window.featureGate)
      window.featureGate = new FeatureGate();
    await window.featureGate?.refreshAsync?.();
    await window.ProviderConfigManager?.fetchPrivateConfigs?.();
  } catch (_) {
    root.innerHTML = `<div class="ac-banner error">${t("autoCapcut.connectionRequired", "Server connection is required")}</div>`;
    return;
  }
  const saved = (await chrome.storage.local.get("auto_capcut_builder_state"))
    .auto_capcut_builder_state;
  const state = Object.assign({}, defaultState, saved || {});
  const persist = () =>
    chrome.storage.local.set({
      auto_capcut_builder_state: {
        ...state,
        audio: state.audio,
        folder: state.folder,
        media: state.media,
        srt: state.srt,
        script: state.script,
      },
    });
  const native = (command, params = {}, requestId = crypto.randomUUID()) =>
    BridgeClient.request("native_request", { command, params, requestId });
  const allowed = () =>
    window.SystemConfig?.getBool?.("auto_capcut_tool_enabled") === true &&
    (window.featureGate?.canUse?.("auto_capcut_enabled") ?? false);
  function errorCode(response, fallback) {
    return response?.error?.code || response?.error || fallback;
  }
  async function checkEnvironment({ mutate = true } = {}) {
    const diagnostics = [];
    if (!allowed()) {
      diagnostics.push({ level: "error", code: "FEATURE_LOCKED" });
      return { ok: false, diagnostics };
    }
    const ping = await BridgeClient.ping(true);
    if (!ping.installed) {
      diagnostics.push({
        level: "error",
        code: "BRIDGE_NOT_INSTALLED",
        recoverable: true,
      });
      return { ok: false, diagnostics };
    }
    const host = ping.native;
    if (!host?.installed) {
      diagnostics.push({
        level: "error",
        code: host?.error || "NATIVE_HOST_NOT_INSTALLED",
        recoverable: true,
      });
      return { ok: false, diagnostics };
    }
    if (
      state.hostSessionId &&
      host.session_id &&
      state.hostSessionId !== host.session_id &&
      (state.audio || state.folder || state.srt || state.script)
    ) {
      if (mutate) {
        Object.assign(state, {
          audio: null,
          folder: null,
          srt: null,
          script: null,
          media: [],
          mediaTotal: 0,
          analysis: null,
          manualOverrides: {},
          status: t(
            "autoCapcut.relinkRequired",
            "Desktop host restarted. Please relink local sources.",
          ),
        });
      }
      diagnostics.push({
        level: "error",
        code: "SOURCE_RELINK_REQUIRED",
        recoverable: true,
      });
    }
    state.hostSessionId = host.session_id || state.hostSessionId;
    if (!host.capabilities?.includes("capcut_build_v1")) {
      diagnostics.push({
        level: "error",
        code: "CAPCUT_ADAPTER_NOT_READY",
        recoverable: true,
      });
    }
    if (!host.capabilities?.includes("srt_alignment_v1")) {
      diagnostics.push({
        level: "error",
        code: "NATIVE_HOST_UPDATE_REQUIRED",
        recoverable: true,
      });
    }
    if (mutate) await persist();
    return {
      ok: !diagnostics.some((item) => item.level === "error"),
      diagnostics,
      host,
    };
  }
  function sourceDiagnostics() {
    const items = [];
    if (!state.name.trim())
      items.push({ level: "error", code: "PROJECT_NAME_REQUIRED" });
    if (!state.audio?.token)
      items.push({ level: "error", code: "AUDIO_REQUIRED" });
    if (!state.media.length)
      items.push({ level: "error", code: "MEDIA_REQUIRED" });
    if (!state.analysis?.scenes?.length)
      items.push({ level: "error", code: "ALIGNMENT_REQUIRED" });
    if (!state.srt?.token && state.subtitles)
      items.push({ level: "warning", code: "SUBTITLE_SOURCE_MISSING" });
    if (state.mediaTotal > state.media.length)
      items.push({ level: "error", code: "MEDIA_LIST_NOT_FULLY_LOADED" });
    let previousEnd = null;
    for (const scene of state.analysis?.scenes || []) {
      const override = state.manualOverrides[scene.scene_id];
      const start = override?.start_us ?? scene.start_us;
      const end = override?.end_us ?? scene.end_us;
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        end <= start ||
        (previousEnd !== null && start !== previousEnd)
      ) {
        items.push({ level: "error", code: "BOUNDARY_OVERRIDE_INVALID" });
        break;
      }
      previousEnd = end;
    }
    return items;
  }
  async function runPreflight() {
    const environment = await checkEnvironment();
    state.diagnostics = [...environment.diagnostics, ...sourceDiagnostics()];
    await persist();
    render();
    return {
      ok:
        environment.ok &&
        !state.diagnostics.some((item) => item.level === "error"),
    };
  }
  async function loadMediaPage(reset = false) {
    if (!state.folder) return;
    const page = await native("media_list_page", {
      folder_token: state.folder.token,
      offset: reset ? 0 : state.media.length,
      limit: 100,
    });
    if (!page?.ok) {
      state.status = errorCode(page, "MEDIA_LIST_FAILED");
      render();
      return;
    }
    state.media = reset
      ? page.data.items || []
      : state.media.concat(page.data.items || []);
    state.mediaTotal = page.data.total || state.media.length;
    state.analysis = null;
    state.manualOverrides = {};
    await persist();
    render();
  }
  async function pick(command, key) {
    const response = await native(command);
    if (!response?.ok || !response.data || response.data.cancelled) return;
    state[key] = response.data.item || response.data.items?.[0] || null;
    state.analysis = null;
    state.manualOverrides = {};
    if (key === "folder") return loadMediaPage(true);
    await persist();
    render();
  }
  function move(from, to) {
    if (
      to < 0 ||
      to >= state.media.length ||
      from === to ||
      !Number.isInteger(from)
    )
      return;
    const [item] = state.media.splice(from, 1);
    state.media.splice(to, 0, item);
    state.analysis = null;
    state.manualOverrides = {};
    persist();
    render();
  }
  async function analyze() {
    const target = root.querySelector("#acAlignmentResult");
    const probe = await native("media_probe_sources", {
      path_tokens: [state.audio.token],
    });
    const duration = Math.round(
      Number(probe?.data?.items?.[0]?.probe?.format?.duration || 0) * 1e6,
    );
    if (!duration) {
      target.textContent = errorCode(probe, "AUDIO_PROBE_FAILED");
      return;
    }
    const count = state.mediaTotal || state.media.length;
    if (state.alignmentMode !== "srt") {
      const model = await native("model_list");
      if (!model?.ok || !model.data?.installed) {
        target.textContent = errorCode(model, "VOICE_MODEL_NOT_INSTALLED");
        return;
      }
      state.activeRequest = crypto.randomUUID();
      const stream = BridgeClient.stream();
      if (!stream) {
        target.textContent = "BRIDGE_NOT_INSTALLED";
        return;
      }
      const off = stream.onMessage((message) => {
        if (message?.progress)
          target.textContent = `${message.progress.percent || 0}%`;
      });
      const voice = await stream.request("native_request", {
        command: "alignment_voice",
        requestId: state.activeRequest,
        params: {
          audio_path_token: state.audio.token,
          audio_duration_us: duration,
          media_count: count,
          language: "auto",
          script_path_token:
            state.alignmentMode === "script_audio"
              ? state.script?.token || null
              : null,
        },
      });
      off();
      stream.close();
      state.activeRequest = null;
      if (voice?.ok) {
        state.analysis = voice.data.analysis;
        state.manualOverrides = {};
        await persist();
        render();
      } else {
        target.textContent = errorCode(voice, "VOICE_ALIGNMENT_FAILED");
      }
      return;
    }
    const response = await native("alignment_analyze", {
      audio_path_token: state.audio.token,
      srt_path_token: state.srt.token,
      settings: {
        media_count: count,
        audio_duration_us: duration,
        min_duration_us: 1e6,
        max_duration_us: 3e7,
        target_duration_us: Math.round(duration / count),
        count_policy: "use_available",
      },
    });
    if (response?.ok) {
      state.analysis = response.data.analysis;
      state.manualOverrides = {};
      await persist();
      render();
    } else {
      target.textContent = errorCode(response, "ALIGNMENT_FAILED");
    }
  }
  function diagnosticsHtml() {
    if (!state.diagnostics.length) return "";
    const downloadUrl = safeExternalUrl(
      window.ProviderConfigManager?.getApiConfigValueSync?.(
        "flow",
        "bridge_download_url",
      ),
    );
    const rows = state.diagnostics
      .map((item) => {
        const label = t(`autoCapcut.diagnostic.${item.code}`, item.code);
        return `<li class="ac-diag ac-diag--${item.level}"><strong>${item.level === "error" ? "\u25CF" : "\u25B2"}</strong>${escapeHtml(label)}</li>`;
      })
      .join("");
    const recovery = state.diagnostics.some((item) => item.recoverable)
      ? `<div class="ac-recovery"><button class="ac-btn" id="acRetryEnvironment">${t("autoCapcut.checkAgain", "Check again")}</button>${downloadUrl ? `<a class="ac-btn primary" href="${escapeHtml(downloadUrl)}" target="_blank" rel="noopener">${t("autoCapcut.downloadBridge", "Download TobyBridge")}</a>` : ""}</div>`
      : "";
    return `<ul class="ac-diagnostics">${rows}</ul>${recovery}`;
  }
  function render() {
    const steps = [
      t("autoCapcut.stepSources", "Sources"),
      t("autoCapcut.stepAlignment", "Alignment"),
      t("autoCapcut.stepMotion", "Motion & Subtitles"),
      t("autoCapcut.stepBuild", "Build"),
    ];
    root.innerHTML = `<header class="ac-head"><h1>${t("autoCapcut.title", "Auto CapCut Builder")}</h1><span class="ac-status">${escapeHtml(state.status || "")}</span></header><nav class="ac-steps">${steps.map((label, index) => `<button class="ac-step ${index === state.step ? "active" : ""}" data-step="${index}">${index + 1}. ${label}</button>`).join("")}</nav><section class="ac-panel">${panel()}</section>`;
    bind();
  }
  function panel() {
    if (state.step === 0) {
      return `<div class="ac-grid"><label class="ac-field">${t("autoCapcut.projectName", "Project name")}<input id="acName" value="${escapeHtml(state.name)}"></label><label class="ac-field">${t("autoCapcut.sort", "Sort")}<select id="acSort"><option value="natural" ${state.sort === "natural" ? "selected" : ""}>Natural</option><option value="manual" ${state.sort === "manual" ? "selected" : ""}>Manual</option></select></label></div><div class="ac-actions"><button class="ac-btn" data-pick="audio">${escapeHtml(state.audio?.display_name || t("autoCapcut.selectAudio", "Select audio"))}</button><button class="ac-btn" data-pick="folder">${escapeHtml(state.folder?.display_name || t("autoCapcut.selectFolder", "Select media folder"))}</button><button class="ac-btn" data-pick="srt">${escapeHtml(state.srt?.display_name || t("autoCapcut.selectSrt", "Select SRT"))}</button><button class="ac-btn" data-pick="script">${escapeHtml(state.script?.display_name || t("autoCapcut.selectScript", "Select script"))}</button></div><div class="ac-media">${state.media.map((item, index) => `<div class="ac-item" draggable="true" data-index="${index}"><span>\u2195</span><span class="ac-item-name">${escapeHtml(item.display_name)}</span><button class="ac-btn" data-up="${index}">\u2191</button><button class="ac-btn" data-down="${index}">\u2193</button></div>`).join("")}</div>${nav()}`;
    }
    if (state.step === 1) {
      const scenes = (state.analysis?.scenes || [])
        .map((scene) => {
          const override = state.manualOverrides[scene.scene_id] || {};
          return `<div class="ac-item ac-scene"><span class="ac-item-name">${escapeHtml(scene.narration || scene.scene_id)}</span><label>${t("autoCapcut.start", "Start")}<input class="ac-boundary" data-scene="${escapeHtml(scene.scene_id)}" data-edge="start_us" type="number" min="0" value="${override.start_us ?? scene.start_us}"></label><label>${t("autoCapcut.end", "End")}<input class="ac-boundary" data-scene="${escapeHtml(scene.scene_id)}" data-edge="end_us" type="number" min="1" value="${override.end_us ?? scene.end_us}"></label></div>`;
        })
        .join("");
      const coverage = state.analysis
        ? `${state.analysis.scenes?.length || 0} scenes \xB7 ${Math.round((state.analysis.coverage?.aggregate || 0) * 100)}% confidence`
        : "";
      const sourceReady =
        state.alignmentMode === "srt"
          ? state.srt
          : state.alignmentMode === "script_audio"
            ? state.script
            : true;
      return `<div class="ac-banner">${t("autoCapcut.alignmentHint", "SRT-first is deterministic. Voice analysis requires the optional desktop model.")}</div><label class="ac-field">${t("autoCapcut.alignmentMode", "Alignment mode")}<select id="acAlignmentMode"><option value="srt" ${state.alignmentMode === "srt" ? "selected" : ""}>SRT-first</option><option value="script_audio" ${state.alignmentMode === "script_audio" ? "selected" : ""}>${t("autoCapcut.scriptAudio", "Script + voice")}</option><option value="audio_only" ${state.alignmentMode === "audio_only" ? "selected" : ""}>${t("autoCapcut.audioOnly", "Voice only")}</option></select></label><p>${state.media.length} media \xB7 ${escapeHtml(state.srt?.display_name || t("autoCapcut.noSrt", "No SRT"))}</p><div id="acAlignmentResult">${coverage}</div><div class="ac-media">${scenes}</div><div class="ac-actions"><button class="ac-btn primary" id="acAnalyze" ${!state.audio || !sourceReady || !state.media.length ? "disabled" : ""}>${t("autoCapcut.analyze", "Analyze alignment")}</button></div>${nav()}`;
    }
    if (state.step === 2) {
      return `<div class="ac-grid"><label class="ac-field">${t("autoCapcut.motion", "Motion")}<select id="acMotion"><option value="random" ${state.motion === "random" ? "selected" : ""}>Random pan/zoom</option><option value="none" ${state.motion === "none" ? "selected" : ""}>No motion</option></select></label><label class="ac-field"><span>${t("autoCapcut.subtitles", "Editable subtitles")}</span><input id="acSubtitles" type="checkbox" ${state.subtitles ? "checked" : ""}></label></div>${nav()}`;
    }
    return `<div id="acDiag">${diagnosticsHtml()}</div><div class="ac-progress"><i style="width:${state.progress}%"></i></div><div class="ac-actions"><button class="ac-btn" id="acPreflight">${t("autoCapcut.preflight", "Check readiness")}</button><button class="ac-btn primary" id="acBuild">${t("autoCapcut.build", "Build CapCut project")}</button><button class="ac-btn" id="acCancel">${t("common.cancel", "Cancel")}</button></div>${nav()}`;
  }
  function nav() {
    const more =
      state.step === 0 && state.media.length < state.mediaTotal
        ? `<button class="ac-btn" id="acLoadMore">${t("common.loadMore", "Load more")} (${state.media.length}/${state.mediaTotal})</button>`
        : "";
    return `${more}<div class="ac-actions"><button class="ac-btn" id="acPrev" ${state.step === 0 ? "disabled" : ""}>${t("common.back", "Back")}</button><button class="ac-btn primary" id="acNext" ${state.step === 3 ? "disabled" : ""}>${t("common.next", "Next")}</button></div>`;
  }
  function bind() {
    root.querySelectorAll("[data-step]").forEach((button) => {
      button.onclick = () => {
        state.step = +button.dataset.step;
        persist();
        render();
      };
    });
    root.querySelector("#acPrev")?.addEventListener("click", () => {
      state.step--;
      persist();
      render();
    });
    root.querySelector("#acNext")?.addEventListener("click", () => {
      state.step++;
      persist();
      render();
    });
    root
      .querySelector("#acLoadMore")
      ?.addEventListener("click", () => loadMediaPage(false));
    root.querySelector("#acAnalyze")?.addEventListener("click", analyze);
    root.querySelector("#acPreflight")?.addEventListener("click", runPreflight);
    root
      .querySelector("#acRetryEnvironment")
      ?.addEventListener("click", runPreflight);
    root.querySelector("#acName")?.addEventListener("change", (event) => {
      state.name = event.target.value;
      persist();
    });
    root.querySelector("#acSort")?.addEventListener("change", (event) => {
      state.sort = event.target.value;
      persist();
    });
    root.querySelector("#acMotion")?.addEventListener("change", (event) => {
      state.motion = event.target.value;
      persist();
    });
    root
      .querySelector("#acAlignmentMode")
      ?.addEventListener("change", (event) => {
        state.alignmentMode = event.target.value;
        state.analysis = null;
        state.manualOverrides = {};
        persist();
        render();
      });
    root.querySelector("#acSubtitles")?.addEventListener("change", (event) => {
      state.subtitles = event.target.checked;
      persist();
    });
    const commands = {
      audio: "picker_select_audio",
      folder: "picker_select_media_folder",
      srt: "picker_select_srt",
      script: "picker_select_script",
    };
    root.querySelectorAll("[data-pick]").forEach((button) => {
      button.onclick = () =>
        pick(commands[button.dataset.pick], button.dataset.pick);
    });
    root.querySelectorAll("[data-up]").forEach((button) => {
      button.onclick = () => move(+button.dataset.up, +button.dataset.up - 1);
    });
    root.querySelectorAll("[data-down]").forEach((button) => {
      button.onclick = () =>
        move(+button.dataset.down, +button.dataset.down + 1);
    });
    let dragged = null;
    root.querySelectorAll('.ac-item[draggable="true"]').forEach((item) => {
      item.ondragstart = () => {
        dragged = +item.dataset.index;
        item.classList.add("dragging");
      };
      item.ondragover = (event) => event.preventDefault();
      item.ondrop = (event) => {
        event.preventDefault();
        move(dragged, +item.dataset.index);
      };
    });
    root.querySelectorAll(".ac-boundary").forEach((input) =>
      input.addEventListener("change", () => {
        const id = input.dataset.scene;
        state.manualOverrides[id] = {
          ...(state.manualOverrides[id] || {}),
          [input.dataset.edge]: Number(input.value),
        };
        persist();
      }),
    );
    root.querySelector("#acBuild")?.addEventListener("click", build);
    root
      .querySelector("#acCancel")
      ?.addEventListener(
        "click",
        () =>
          state.activeRequest &&
          native("host_cancel_job", { job_id: state.activeRequest }),
      );
  }
  async function build() {
    const ready = await runPreflight();
    if (!ready.ok) return;
    state.activeRequest = crypto.randomUUID();
    const stream = BridgeClient.stream();
    if (!stream) {
      state.diagnostics = [
        { level: "error", code: "BRIDGE_NOT_INSTALLED", recoverable: true },
      ];
      render();
      return;
    }
    const off = stream.onMessage((message) => {
      if (!message?.progress) return;
      state.progress = message.progress.percent || 0;
      const bar = root.querySelector(".ac-progress > i");
      if (bar) bar.style.width = `${state.progress}%`;
    });
    const result = await stream.request("native_request", {
      command: "capcut_build_project",
      requestId: state.activeRequest,
      params: {
        project: {
          name: state.name,
          audio: state.audio.token,
          media: state.media.map((item) => item.token),
          srt: state.srt?.token || null,
          script: state.script?.token || null,
          motion: state.motion,
          subtitles: state.subtitles,
          alignment: state.analysis,
          manual_overrides: state.manualOverrides,
        },
      },
    });
    off();
    stream.close();
    state.activeRequest = null;
    state.status = result?.ok
      ? t("autoCapcut.buildComplete", "Project created")
      : errorCode(result, "BUILD_FAILED");
    await persist();
    render();
  }
  function escapeHtml(value) {
    const element = document.createElement("div");
    element.textContent = String(value ?? "");
    return element.innerHTML;
  }
  function safeExternalUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return ["https:", "http:"].includes(url.protocol) ? url.href : "";
    } catch (_) {
      return "";
    }
  }
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== "local") return;
    if (changes.af_system_settings?.newValue)
      window.SystemConfig.handleStorageUpdate(
        changes.af_system_settings.newValue,
      );
    if (changes.af_entitlements)
      window.featureGate.entitlements =
        changes.af_entitlements.newValue?.entitlements || {};
    if ((changes.af_system_settings || changes.af_entitlements) && !allowed()) {
      state.status = t(
        "autoCapcut.accessRevoked",
        "Access changed; new builds are disabled",
      );
      render();
    }
    if (
      changes.af_system_settings ||
      changes.af_entitlements ||
      changes.af_auth
    ) {
      window.ProviderConfigManager?.clearPrivateConfigs?.();
      render();
      try {
        await window.ProviderConfigManager?.fetchPrivateConfigs?.(true);
      } catch (_) {}
      render();
    }
  });
  if (!allowed()) {
    root.innerHTML = `<div class="ac-banner error">${t("autoCapcut.accessRevoked", "Access is unavailable")}</div>`;
    return;
  }
  render();
})();
