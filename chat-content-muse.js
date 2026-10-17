(function () {
  if (window.__tobyflowMuseLoaded__) return;
  window.__tobyflowMuseLoaded__ = true;
  window.__tobyflowMuseNativeVideoWrapperPlay__ = true;
  const PROVIDER = "muse";
  ConfigSnapshotAccess.start(PROVIDER);
  const CONFIG_WAIT_MAX_MS = 1e4;
  const CONFIG_WAIT_INTERVAL_MS = 200;
  let config = null;
  let apiConfigs = null;
  ConfigSnapshotAccess.onInvalidated(() => {
    config = apiConfigs = null;
  });
  let configWaitPromise = null;
  let activeRun = null;
  let activeChatPreparation = null;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  function checkRun(run) {
    if (run?.cancelled)
      throw Object.assign(new Error("CANCELLED"), { code: "CANCELLED" });
  }
  function waitForRun(run, operation) {
    if (!run) return Promise.resolve().then(operation);
    checkRun(run);
    return new Promise((resolve, reject) => {
      const signal = run.controller.signal;
      const finish = (fn, value) => {
        signal.removeEventListener("abort", onAbort);
        fn(value);
      };
      const onAbort = () =>
        finish(
          reject,
          Object.assign(new Error("CANCELLED"), { code: "CANCELLED" }),
        );
      signal.addEventListener("abort", onAbort, { once: true });
      Promise.resolve()
        .then(() => {
          checkRun(run);
          return operation();
        })
        .then(
          (value) => finish(resolve, value),
          (error) => finish(reject, error),
        );
    });
  }
  function trace(stage, data = {}) {
    try {
      const sent = chrome.runtime.sendMessage({
        action: "muse:trace",
        stage,
        data,
      });
      sent?.catch?.(() => {});
    } catch (_) {}
  }
  async function loadConfig() {
    const stored = await ConfigSnapshotAccess.read([
      "toby_provider_configs",
      "toby_provider_api_configs",
    ]);
    config = stored?.toby_provider_configs?.data?.[PROVIDER] || null;
    apiConfigs =
      stored?.toby_provider_api_configs?.data?.[PROVIDER]?.configs || null;
    return !!config;
  }
  function showConfigErrorOverlay() {
    if (document.getElementById("tobyflow-config-error-overlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "tobyflow-config-error-overlay";
    queueMicrotask(() =>
      ConfigSnapshotAccess.updateOverlay(overlay).catch(() => {}),
    );
    overlay.innerHTML = `<style>
      #tobyflow-config-error-overlay{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(10,10,14,.95);color:#fff;font-family:system-ui,sans-serif}
      #tobyflow-config-error-overlay>div{max-width:320px;padding:32px;text-align:center}#tobyflow-config-error-overlay h3{margin:0 0 8px}#tobyflow-config-error-overlay p{margin:0 0 20px;color:#c7c7cf;line-height:1.5}#tobyflow-config-error-overlay button{border:0;border-radius:8px;padding:10px 20px;font:inherit;cursor:pointer}
    </style><div><h3>M\u1EA5t k\u1EBFt n\u1ED1i server</h3><p>Kh\xF4ng th\u1EC3 k\u1EBFt n\u1ED1i t\u1EDBi m\xE1y ch\u1EE7 Toby. Vui l\xF2ng ki\u1EC3m tra l\u1EA1i sau.</p><button type="button">Th\u1EED l\u1EA1i</button></div>`;
    overlay
      .querySelector("button")
      ?.addEventListener("click", () => location.reload());
    document.body.appendChild(overlay);
  }
  async function ensureConfig() {
    if (config && ConfigSnapshotAccess.active()) return true;
    if (configWaitPromise) return configWaitPromise;
    configWaitPromise = (async () => {
      const deadline = Date.now() + CONFIG_WAIT_MAX_MS;
      while (Date.now() < deadline) {
        if (await loadConfig()) return true;
        try {
          chrome.runtime.sendMessage({
            action: "getProviderConfigs",
            provider: PROVIDER,
          });
        } catch (_) {}
        await sleep(CONFIG_WAIT_INTERVAL_MS);
      }
      showConfigErrorOverlay();
      return false;
    })();
    try {
      return await configWaitPromise;
    } finally {
      configWaitPromise = null;
    }
  }
  ensureConfig().catch(() => {});
  function selectors(key) {
    if (!ConfigSnapshotAccess.active()) {
      ConfigSnapshotAccess.ensure().catch(() => {});
      return [];
    }
    return config?.selectors?.[key]?.selectors || [];
  }
  function all(key) {
    const found = [];
    for (const selector of selectors(key)) {
      try {
        found.push(...document.querySelectorAll(selector));
      } catch (_) {}
    }
    return found;
  }
  function first(key) {
    return all(key).find((el) => el.isConnected) || null;
  }
  function visible(elements) {
    return elements.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  }
  function activeComposer() {
    return (
      visible(all("composer")).find((el) => !el.disabled && !el.readOnly) ||
      null
    );
  }
  function composerAudit() {
    const candidates = all("composer");
    return {
      candidates: candidates.length,
      visible: visible(candidates).length,
      editable: candidates.filter((el) => !el.disabled && !el.readOnly).length,
      active: !!activeComposer(),
    };
  }
  async function waitForActiveComposer(deadline, run = null) {
    while (Date.now() < deadline) {
      checkRun(run);
      const composer = activeComposer();
      if (composer) return composer;
      await waitForRun(run, () => sleep(150));
    }
    return null;
  }
  function uploadContextForComposer(composer) {
    const inputs = all("file_input");
    let scope = composer?.parentElement || null;
    while (scope && scope !== document.documentElement) {
      const input = inputs.find((candidate) => scope.contains(candidate));
      if (input) return { input, scope, inputCandidates: inputs.length };
      scope = scope.parentElement;
    }
    return { input: null, scope: null, inputCandidates: inputs.length };
  }
  function referenceAttachmentState() {
    const composer = activeComposer();
    const scopeSelectors = selectors("attachment_scope");
    const scope =
      composer && scopeSelectors.length
        ? composer.closest(scopeSelectors.join(","))
        : null;
    const attachments = scope
      ? [...new Set(all("attachment_preview"))].filter(
          (el) => el.isConnected && scope.contains(el),
        )
      : [];
    return { composer, scope, attachments };
  }
  function attachmentCount() {
    return referenceAttachmentState().attachments.length;
  }
  function referenceUploadTimings() {
    const timings = apiConfigs?.reference_upload_timings;
    const timeoutMs = Number(timings?.timeout_ms),
      settleMs = Number(timings?.settle_ms),
      pollMs = Number(timings?.poll_interval_ms);
    return [timeoutMs, settleMs, pollMs].every(
      (value) => Number.isFinite(value) && value > 0,
    ) && timeoutMs > settleMs
      ? { timeoutMs, settleMs, pollMs }
      : null;
  }
  async function waitForReferenceAttachments(
    expected,
    scope,
    deadline,
    timings,
    run,
  ) {
    const startedAt = Date.now();
    let stableSince = null,
      previous = [],
      lastCount = null;
    while (Date.now() < deadline) {
      checkRun(run);
      const state = referenceAttachmentState();
      if (state.attachments.length !== lastCount) {
        lastCount = state.attachments.length;
        trace("reference_attach_progress", {
          expectedTotal: expected,
          actual: lastCount,
          elapsedMs: Date.now() - startedAt,
        });
      }
      if (state.scope !== scope)
        return { success: false, reason: "COMPOSER_CHANGED" };
      if (state.attachments.length > expected)
        return { success: false, reason: "EXTRA_ATTACHMENTS" };
      const unchanged =
        state.attachments.length === previous.length &&
        state.attachments.every((el) => previous.includes(el));
      if (state.attachments.length === expected) {
        if (!unchanged || stableSince === null) stableSince = Date.now();
        if (Date.now() - stableSince >= timings.settleMs)
          return {
            success: true,
            elapsedMs: Date.now() - startedAt,
            settledMs: Date.now() - stableSince,
          };
      } else stableSince = null;
      previous = state.attachments;
      await waitForRun(run, () =>
        sleep(Math.min(timings.pollMs, Math.max(1, deadline - Date.now()))),
      );
    }
    checkRun(run);
    return { success: false, reason: "ATTACHMENTS_NOT_SETTLED" };
  }
  function dispatchFileDrop(target, transfer) {
    if (!target || typeof DragEvent !== "function") return false;
    try {
      const options = {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      };
      target.dispatchEvent(new DragEvent("dragenter", options));
      target.dispatchEvent(new DragEvent("dragover", options));
      target.dispatchEvent(new DragEvent("drop", options));
      return true;
    } catch (_) {
      return false;
    }
  }
  function simulateClick(el, coordinateAnchor = null) {
    if (!el || !(el instanceof Element)) return false;
    const ownRect = el.getBoundingClientRect();
    const anchorRect =
      coordinateAnchor instanceof Element
        ? coordinateAnchor.getBoundingClientRect()
        : null;
    const rect = ownRect.width && ownRect.height ? ownRect : anchorRect;
    if (!rect || !rect.width || !rect.height) return false;
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const opts = {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0,
      pointerType: "mouse",
    };
    el.dispatchEvent(new PointerEvent("pointerdown", opts));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new PointerEvent("pointerup", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.dispatchEvent(new MouseEvent("click", opts));
    return true;
  }
  function hover(el) {
    if (!el || !(el instanceof Element)) return;
    const rect = el.getBoundingClientRect();
    const opts = {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      pointerType: "mouse",
    };
    el.dispatchEvent(new PointerEvent("pointerover", opts));
    el.dispatchEvent(new PointerEvent("pointerenter", opts));
    el.dispatchEvent(new MouseEvent("mouseover", opts));
    el.dispatchEvent(new MouseEvent("mouseenter", opts));
    el.dispatchEvent(new MouseEvent("mousemove", opts));
  }
  const FloatingTracker =
    typeof window.createFloatingTrackerRich === "function"
      ? window.createFloatingTrackerRich({
          id: "tobyflow-muse-tracker",
          title: "Muse",
          onSkipBlocker: () => ExecutionBlocker.hide(),
        })
      : { show() {}, update() {}, hide() {}, updateFromQueue() {} };
  let richTrackerActive = false;
  let richTrackerProvider = null;
  if (
    FloatingTracker &&
    typeof FloatingTracker.show === "function" &&
    typeof window.createFloatingTrackerRich === "function"
  ) {
    const showLocal = FloatingTracker.show.bind(FloatingTracker);
    const updateLocal = FloatingTracker.update.bind(FloatingTracker);
    const hideLocal = FloatingTracker.hide.bind(FloatingTracker);
    FloatingTracker.show = (data) => {
      if (!richTrackerActive) showLocal(data);
    };
    FloatingTracker.update = (data) => {
      if (!richTrackerActive) updateLocal(data);
    };
    FloatingTracker.hide = () => {
      if (!richTrackerActive) hideLocal();
    };
  }
  function applyRichTrackerData(data) {
    const incomingProvider = data?.trackerProvider || "flow";
    const incomingActive = !!(data?.jobs?.length && data.isRunning !== false);
    if (
      richTrackerActive &&
      richTrackerProvider === PROVIDER &&
      incomingProvider !== PROVIDER
    ) {
      return false;
    }
    richTrackerActive = incomingActive;
    richTrackerProvider = incomingActive ? incomingProvider : null;
    try {
      FloatingTracker.updateFromQueue(data);
    } catch (_) {}
    return true;
  }
  const restoreTrackerSnapshot = new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: "muse:getTrackerSnapshot" },
      (response) => {
        if (!chrome.runtime.lastError && response?.data)
          applyRichTrackerData(response.data);
        resolve();
      },
    );
  });
  const ExecutionBlocker = {
    el: null,
    timer: null,
    show() {
      if (!this.el) {
        const style = document.createElement("style");
        style.id = "tobyflow-muse-blocker-styles";
        style.textContent =
          '@keyframes tobyflow-muse-glow{0%,100%{opacity:.4}50%{opacity:.7}}#tobyflow-muse-blocker{position:fixed;inset:0;z-index:2147483646;pointer-events:none;background:transparent}#tobyflow-muse-blocker:before{content:"";position:absolute;inset:0;border:5px solid #cdff01;box-shadow:inset 0 0 0 2px rgba(205,255,1,.5),inset 0 0 15px rgba(205,255,1,.3),0 0 15px rgba(205,255,1,.5),0 0 35px rgba(205,255,1,.35),0 0 60px rgba(205,255,1,.2),0 0 100px rgba(205,255,1,.1);animation:tobyflow-muse-glow 1.8s ease-in-out infinite;will-change:opacity}';
        document.head.appendChild(style);
        this.el = document.createElement("div");
        this.el.id = "tobyflow-muse-blocker";
        document.body.appendChild(this.el);
      }
      this.el.style.display = "block";
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.hide(), 7 * 60 * 1e3);
    },
    hide() {
      clearTimeout(this.timer);
      this.timer = null;
      if (this.el) this.el.style.display = "none";
    },
  };
  function sourceFor(key, el) {
    const attribute = config?.selectors?.[key]?.attribute;
    if (attribute) return el.getAttribute(attribute);
    return el.currentSrc || el.src || el.getAttribute("src");
  }
  function optionalSourceAttributeFor(key, el, configField) {
    const attribute = config?.selectors?.[key]?.[configField];
    return attribute ? el?.getAttribute?.(attribute) || "" : "";
  }
  function nestedMediaFor(key, el) {
    const selector = config?.selectors?.[key]?.media_selector;
    if (!selector || !el?.querySelector) return null;
    try {
      return el.querySelector(selector);
    } catch (_) {
      return null;
    }
  }
  function mediaSnapshot() {
    const urls = [];
    for (const [key, elements] of [
      ["result_image", all("result_image")],
      ["result_video", all("result_video")],
    ]) {
      for (const el of elements) {
        const src = sourceFor(key, el);
        if (src) urls.push(src);
      }
    }
    return new Set(urls);
  }
  function resultMessageIdFor(el) {
    const selector = selectors("result_message").join(", ");
    const attribute = config?.selectors?.result_message?.attribute;
    if (!selector || !attribute || !el?.closest) return null;
    try {
      return el.closest(selector)?.getAttribute(attribute) || null;
    } catch (_) {
      return null;
    }
  }
  function resultMessageSnapshot() {
    const attribute = config?.selectors?.result_message?.attribute;
    return new Set(
      attribute
        ? all("result_message")
            .map((el) => el.getAttribute(attribute))
            .filter(Boolean)
        : [],
    );
  }
  function generationFailurePatterns() {
    const configured = apiConfigs?.error_patterns?.generation_failed_text;
    const values = Array.isArray(configured)
      ? configured
      : typeof configured === "string"
        ? configured.split(/[|,]/)
        : [];
    return values.map((value) => String(value || "").trim()).filter(Boolean);
  }
  function generationFailureMessages() {
    const patterns = generationFailurePatterns();
    if (!patterns.length) return [];
    return String(document.body?.innerText || "")
      .split(/\n+/)
      .map((value) => value.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .filter((message) => {
        const lowered = message.toLowerCase();
        return patterns.some((pattern) =>
          lowered.includes(pattern.toLowerCase()),
        );
      });
  }
  function failureMessageCounts(messages = generationFailureMessages()) {
    return messages.reduce((counts, message) => {
      counts.set(message, (counts.get(message) || 0) + 1);
      return counts;
    }, new Map());
  }
  function detectTerminalGenerationFailure(beforeCounts) {
    const messages = generationFailureMessages();
    const seen = beforeCounts || new Map();
    const currentCounts = new Map();
    for (const message of messages) {
      const count = (currentCounts.get(message) || 0) + 1;
      currentCounts.set(message, count);
      if (count > (seen.get(message) || 0)) return message;
    }
    return null;
  }
  function textOnlyResult(beforeMessages, state, sentAt) {
    state.matchesConfiguredFailure = false;
    const policy = apiConfigs?.result_wait;
    const stableMs = Number(policy?.text_stable_ms),
      minMs = Number(policy?.text_min_elapsed_ms);
    if (
      ![stableMs, minMs].every((value) => Number.isFinite(value) && value > 0)
    )
      return null;
    const messages = all("result_message").filter((el) => {
      const id = el.getAttribute(config?.selectors?.result_message?.attribute);
      return id && !beforeMessages.has(id);
    });
    const text = messages
      .map((el) => String(el.innerText || "").trim())
      .filter(Boolean)
      .join("\n");
    const patterns = generationFailurePatterns();
    const matchesConfiguredFailure = patterns.some((pattern) =>
      text.toLowerCase().includes(pattern.toLowerCase()),
    );
    state.matchesConfiguredFailure = matchesConfiguredFailure;
    const hasMedia = ["result_image", "result_video"].some((key) =>
      all(key).some((el) => {
        const id = resultMessageIdFor(el);
        return id && !beforeMessages.has(id);
      }),
    );
    if (
      !text ||
      !matchesConfiguredFailure ||
      hasMedia ||
      first("stop_button")
    ) {
      state.signature = null;
      return null;
    }
    const signature =
      messages
        .map((el) => el.getAttribute(config.selectors.result_message.attribute))
        .join("|") +
      "\n" +
      text;
    if (signature !== state.signature) {
      state.signature = signature;
      state.since = Date.now();
    }
    return Date.now() - sentAt >= minMs && Date.now() - state.since >= stableMs
      ? text
      : null;
  }
  async function fetchImageWithRetry(url, run) {
    const policy = apiConfigs?.media_fetch;
    const attempts = Number(policy?.attempts),
      timeoutMs = Number(policy?.timeout_ms),
      retryMs = Number(policy?.retry_delay_ms);
    if (
      !Number.isInteger(attempts) ||
      attempts < 1 ||
      attempts > 5 ||
      ![timeoutMs, retryMs].every(
        (value) => Number.isFinite(value) && value > 0,
      )
    ) {
      return { url, error: "MUSE_MEDIA_FETCH_CONFIG_MISSING", attempts: 0 };
    }
    let error = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      checkRun(run);
      const controller = new AbortController();
      const cancel = () => controller.abort();
      run.controller.signal.addEventListener("abort", cancel, { once: true });
      let timer;
      try {
        const base64 = await waitForRun(run, () =>
          Promise.race([
            asDataUrl(url, controller.signal),
            new Promise((_, reject) => {
              timer = setTimeout(() => {
                controller.abort();
                reject(new Error("MEDIA_FETCH_TIMEOUT"));
              }, timeoutMs);
            }),
          ]),
        );
        if (
          typeof base64 !== "string" ||
          !/^data:image\/[a-z0-9.+-]+;base64,.+/i.test(base64)
        )
          throw new Error("MEDIA_NOT_IMAGE");
        return { url, base64, attempts: attempt };
      } catch (failure) {
        checkRun(run);
        error = failure?.message || "MEDIA_FETCH_FAILED";
        trace("image_fetch_failed", { attempt, error });
      } finally {
        clearTimeout(timer);
        controller.abort();
        run.controller.signal.removeEventListener("abort", cancel);
      }
      if (attempt < attempts) await waitForRun(run, () => sleep(retryMs));
    }
    return { url, error, attempts };
  }
  function missingSubmissionConfigs() {
    const missing = ["session_readiness", "result_wait", "media_fetch"].filter(
      (key) => !apiConfigs?.[key],
    );
    for (const key of ["shell_state", "connection_status"])
      if (!selectors(key).length) missing.push(key);
    return missing;
  }
  async function ensureSubmissionConfigs(run) {
    await waitForRun(run, () => loadConfig());
    let missing = missingSubmissionConfigs();
    if (!missing.length) return { ready: true };
    trace("submission_config_wait", { missing });
    for (const action of ["getProviderApiConfigs", "getProviderConfigs"]) {
      try {
        chrome.runtime
          .sendMessage({ action, provider: PROVIDER, force: true })
          ?.catch?.(() => {});
      } catch (_) {}
    }
    const deadline = Date.now() + CONFIG_WAIT_MAX_MS;
    while (Date.now() < deadline) {
      await waitForRun(run, () => sleep(CONFIG_WAIT_INTERVAL_MS));
      await waitForRun(run, () => loadConfig());
      missing = missingSubmissionConfigs();
      if (!missing.length) {
        trace("submission_config_ready");
        return { ready: true };
      }
    }
    return { ready: false, missing };
  }
  async function checkSessionBeforeSubmit(run) {
    const admission = await ensureSubmissionConfigs(run);
    if (!admission.ready)
      return {
        success: false,
        error: "MUSE_SESSION_CONFIG_MISSING",
        diagnostic: { missing: admission.missing },
      };
    const policy = apiConfigs?.session_readiness;
    if (
      ![policy?.timeout_ms, policy?.poll_interval_ms].every(
        (value) => Number.isFinite(Number(value)) && Number(value) > 0,
      )
    ) {
      return { success: false, error: "MUSE_SESSION_CONFIG_MISSING" };
    }
    let timer, result;
    try {
      result = await waitForRun(run, () =>
        Promise.race([
          chrome.runtime.sendMessage({ action: "muse:checkSession" }),
          new Promise((resolve) => {
            timer = setTimeout(
              () => resolve({ success: false, error: "MUSE_SESSION_TIMEOUT" }),
              Number(policy.timeout_ms) + Number(policy.poll_interval_ms),
            );
          }),
        ]),
      );
    } finally {
      clearTimeout(timer);
    }
    trace("session_preflight", {
      success: result?.success === true,
      error: result?.error || null,
      vmState: result?.vmState || null,
    });
    if (!result?.success)
      return result || { success: false, error: "MUSE_SESSION_NO_RESPONSE" };
    const shell = config?.selectors?.shell_state;
    if (
      !selectors("shell_state").length ||
      !shell?.attribute ||
      !policy?.hydrated_state ||
      !selectors("connection_status").length ||
      !Array.isArray(policy.connecting_patterns) ||
      ![policy.timeout_ms, policy.poll_interval_ms].every(
        (value) => Number.isFinite(Number(value)) && Number(value) > 0,
      )
    ) {
      return { success: false, error: "MUSE_CONNECTION_CONFIG_MISSING" };
    }
    const deadline = Date.now() + Number(policy.timeout_ms);
    while (Date.now() < deadline) {
      checkRun(run);
      const hydrated = all("shell_state").some(
        (el) => el.getAttribute(shell.attribute) === policy.hydrated_state,
      );
      const status = all("connection_status")
        .map((el) => String(el.innerText || ""))
        .join("\n");
      const connecting = policy.connecting_patterns.some((pattern) =>
        status.toLowerCase().includes(String(pattern).toLowerCase()),
      );
      if (hydrated && !connecting && activeComposer()) return result;
      await waitForRun(run, () => sleep(Number(policy.poll_interval_ms)));
    }
    return { success: false, error: "MUSE_CONNECTION_NOT_READY" };
  }
  function setTextarea(textarea, text) {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    textarea.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: text,
      }),
    );
    setter?.call(textarea, text);
    textarea.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: text,
      }),
    );
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
  }
  async function insertPromptAndWaitForSend(text, deadline, run = null) {
    await waitForRun(
      run,
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const populated = new WeakSet();
    while (Date.now() < deadline) {
      checkRun(run);
      const composer = activeComposer();
      if (composer && composer.value !== text && !populated.has(composer)) {
        populated.add(composer);
        composer.focus();
        setTextarea(composer, text);
        trace("prompt_inserted", { composer: composerAudit() });
        console.debug("[Muse] Prompt inserted into active composer");
      }
      const send =
        visible(all("send_button")).find(
          (item) =>
            !item.disabled && item.getAttribute("aria-disabled") !== "true",
        ) || null;
      if (send && composer?.value === text) {
        trace("send_ready", { candidates: all("send_button").length });
        return send;
      }
      await waitForRun(run, () => sleep(150));
    }
    return null;
  }
  async function asDataUrl(url, signal = null) {
    const response = await fetch(url, signal ? { signal } : void 0);
    if (!response.ok) throw new Error(`MEDIA_FETCH_${response.status}`);
    const blob = await response.blob();
    if (!blob.size) throw new Error("MEDIA_EMPTY");
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      const abort2 = () => {
        reader.abort();
        reject(new Error("MEDIA_READ_ABORTED"));
      };
      const finish = (fn, value) => {
        signal?.removeEventListener("abort", abort2);
        fn(value);
      };
      reader.onload = () => finish(resolve, reader.result);
      reader.onerror = () =>
        finish(reject, reader.error || new Error("MEDIA_READ_FAILED"));
      reader.onabort = () => finish(reject, new Error("MEDIA_READ_ABORTED"));
      if (signal?.aborted) {
        reject(new Error("MEDIA_READ_ABORTED"));
        return;
      }
      signal?.addEventListener("abort", abort2, { once: true });
      reader.readAsDataURL(blob);
    });
  }
  async function isUsablePosterData(value) {
    if (
      typeof value !== "string" ||
      !/^data:image\/[a-z0-9.+-]+;base64,/i.test(value)
    )
      return false;
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () =>
        resolve(image.naturalWidth > 1 && image.naturalHeight > 1);
      image.onerror = () => resolve(false);
      image.src = value;
    });
  }
  async function posterUrlToDataUrl(url) {
    if (!url) return "";
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (image.naturalWidth <= 1 || image.naturalHeight <= 1) return "";
      const maxWidth = 640;
      const scale = Math.min(1, maxWidth / image.naturalWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas
        .getContext("2d")
        ?.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.8);
    } catch (_) {
      return "";
    }
  }
  async function captureVideoPoster(video) {
    if (!(video instanceof HTMLVideoElement)) return "";
    const capture = () => {
      if (!video.videoWidth || !video.videoHeight) return "";
      const maxWidth = 640;
      const scale = Math.min(1, maxWidth / video.videoWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      try {
        canvas
          .getContext("2d")
          ?.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", 0.8);
      } catch (_) {
        return "";
      }
    };
    const ready = capture();
    if (ready) return ready;
    await new Promise((resolve) => {
      const done = () => {
        video.removeEventListener("loadeddata", done);
        video.removeEventListener("error", done);
        resolve();
      };
      video.addEventListener("loadeddata", done, { once: true });
      video.addEventListener("error", done, { once: true });
      setTimeout(done, 3e3);
    });
    return capture();
  }
  async function captureVideoPosterWhenReady(key, wrapper, deadline) {
    const waitUntil = Math.min(
      Number(deadline) || Date.now(),
      Date.now() + 5e3,
    );
    let poster = "";
    while (Date.now() < waitUntil && !poster) {
      const posterUrl = optionalSourceAttributeFor(
        key,
        wrapper,
        "poster_attribute",
      );
      if (posterUrl) {
        try {
          poster = await asDataUrl(posterUrl);
        } catch (_) {}
      }
      if (poster && !(await isUsablePosterData(poster))) poster = "";
      if (!poster && posterUrl) poster = await posterUrlToDataUrl(posterUrl);
      if (poster && !(await isUsablePosterData(poster))) poster = "";
      if (!poster)
        poster = await captureVideoPoster(nestedMediaFor(key, wrapper));
      if (poster && !(await isUsablePosterData(poster))) poster = "";
      if (!poster) await sleep(200);
    }
    return poster;
  }
  function reportGenLocalRefUpload(images, uploading) {
    for (const image of Array.isArray(images) ? images : []) {
      const progress = image?.genLocalRef;
      if (!progress?.runId || !progress?.refId) continue;
      try {
        const sent = chrome.runtime.sendMessage({
          action: "gen:localRefUploadProgress",
          ...progress,
          uploading,
        });
        sent?.catch?.(() => {});
      } catch (_) {}
    }
  }
  async function uploadImages(images, run = null) {
    reportGenLocalRefUpload(images, true);
    try {
      checkRun(run);
      if (!Array.isArray(images) || !images.length)
        return { success: true, transport: "none" };
      const composer = await waitForActiveComposer(Date.now() + 1e4, run);
      checkRun(run);
      const context = uploadContextForComposer(composer);
      const { input, inputCandidates } = context;
      const initialState = referenceAttachmentState();
      const timings = referenceUploadTimings();
      if (
        !input ||
        !composer ||
        !initialState.scope ||
        !timings ||
        !selectors("attachment_preview").length
      ) {
        const diagnostic2 = {
          stage: "preflight",
          hasInput: !!input,
          hasComposer: !!composer,
          inputCandidates,
          hasAttachmentScope: !!initialState.scope,
          hasTimings: !!timings,
          hasAttachmentSelector: selectors("attachment_preview").length > 0,
        };
        console.warn("[MuseRefUpload]", JSON.stringify(diagnostic2));
        return { success: false, diagnostic: diagnostic2 };
      }
      const before = initialState.attachments.length;
      const files = images
        .map((image, index) => {
          const raw = String(image?.base64 || "").replace(/^data:[^,]+,/, "");
          if (!raw) return null;
          const binary = atob(raw);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++)
            bytes[i] = binary.charCodeAt(i);
          return new File([bytes], image.name || `reference-${index + 1}.png`, {
            type: image.type || "image/png",
          });
        })
        .filter(Boolean);
      if (files.length !== images.length) {
        const diagnostic2 = {
          stage: "decode",
          expected: images.length,
          decoded: files.length,
        };
        console.warn("[MuseRefUpload]", JSON.stringify(diagnostic2));
        return { success: false, diagnostic: diagnostic2 };
      }
      const expectedTotal = before + files.length;
      const readyResult = (transport, readiness) => ({
        success: true,
        transport,
        expectedTotal,
        scope: initialState.scope,
        elapsedMs: readiness.elapsedMs,
        settledMs: readiness.settledMs,
      });
      trace("reference_attach_wait", {
        expected: files.length,
        before,
        timeoutMs: timings.timeoutMs,
        settleMs: timings.settleMs,
      });
      const transfer = new DataTransfer();
      files.forEach((file) => transfer.items.add(file));
      const filesSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "files",
      )?.set;
      if (typeof filesSetter !== "function") {
        const diagnostic2 = { stage: "native_setter_missing" };
        console.warn("[MuseRefUpload]", JSON.stringify(diagnostic2));
        return { success: false, diagnostic: diagnostic2 };
      }
      checkRun(run);
      filesSetter.call(input, transfer.files);
      input.dispatchEvent(
        new Event("change", { bubbles: true, composed: true }),
      );
      input.dispatchEvent(
        new Event("input", { bubbles: true, composed: true }),
      );
      const attached = await waitForReferenceAttachments(
        expectedTotal,
        initialState.scope,
        Date.now() + timings.timeoutMs,
        timings,
        run,
      );
      checkRun(run);
      if (attached.success) return readyResult("native_input", attached);
      const afterNative = attachmentCount();
      if (
        attached.reason !== "ATTACHMENTS_NOT_SETTLED" ||
        afterNative !== before
      ) {
        return {
          success: false,
          diagnostic: {
            stage: attached.reason,
            expected: files.length,
            before,
            after: afterNative,
          },
        };
      }
      checkRun(run);
      const dropDispatched = dispatchFileDrop(composer, transfer);
      if (dropDispatched) {
        const dropped = await waitForReferenceAttachments(
          expectedTotal,
          initialState.scope,
          Date.now() + timings.timeoutMs,
          timings,
          run,
        );
        if (dropped.success) return readyResult("drop", dropped);
      }
      const diagnostic = {
        stage: dropDispatched ? "drop_preview_timeout" : "drop_unavailable",
        expected: files.length,
        before,
        after: attachmentCount(),
        inputFileCount: input.files?.length || 0,
        inputCandidates,
      };
      console.warn("[MuseRefUpload]", JSON.stringify(diagnostic));
      return { success: false, diagnostic };
    } finally {
      reportGenLocalRefUpload(images, false);
    }
  }
  async function submitAndWait(payload) {
    if (activeRun || activeChatPreparation)
      return { success: false, error: "PROVIDER_BUSY" };
    const run = {
      cancelled: false,
      startedAt: Date.now(),
      controller: new AbortController(),
    };
    activeRun = run;
    try {
      if (!(await waitForRun(run, () => ensureConfig())))
        return { success: false, error: "PROVIDER_CONFIG_MISSING" };
      await waitForRun(run, () => restoreTrackerSnapshot);
      if (
        !selectors("result_message").length ||
        !config?.selectors?.result_message?.attribute
      ) {
        trace("result_identity_config_missing");
        return { success: false, error: "MUSE_RESULT_IDENTITY_CONFIG_MISSING" };
      }
      const requestedMediaType = payload.mode === "video" ? "video" : "image";
      const resultKey =
        requestedMediaType === "video" ? "result_video" : "result_image";
      trace("submit_received", {
        refCount: Array.isArray(payload.images) ? payload.images.length : 0,
        requestedMediaType,
      });
      if (!(await waitForActiveComposer(Date.now() + 1e4, run))) {
        const diagnostic = composerAudit();
        trace("composer_not_ready", diagnostic);
        console.warn(
          "[MuseComposer] submit blocked",
          JSON.stringify(diagnostic),
        );
        return { success: false, error: "COMPOSER_NOT_FOUND", diagnostic };
      }
      trace("composer_ready", composerAudit());
      const session = await checkSessionBeforeSubmit(run);
      checkRun(run);
      if (!session?.success)
        return {
          success: false,
          error: session?.error || "MUSE_SESSION_NOT_READY",
          diagnostic: session?.diagnostic || null,
        };
      const before = mediaSnapshot();
      const beforeMessages = resultMessageSnapshot();
      const failureMessagesBeforeSubmit = failureMessageCounts();
      FloatingTracker.show({
        current: 0,
        total: 1,
        phase: "Preparing\u2026",
        prompt: String(payload.text || "").slice(0, 50),
        genMode: payload.mode || "image",
      });
      ExecutionBlocker.show();
      const upload = await uploadImages(payload.images, run);
      checkRun(run);
      if (!upload?.success) {
        trace("reference_attach_failed", upload?.diagnostic || {});
        return {
          success: false,
          error: "REF_UPLOAD_FAILED",
          diagnostic: upload?.diagnostic || null,
        };
      }
      trace("reference_attach_ready", {
        transport: upload.transport || "none",
        expectedTotal: upload.expectedTotal ?? 0,
        elapsedMs: upload.elapsedMs ?? 0,
        settledMs: upload.settledMs ?? 0,
      });
      const promptText = payload.text || "";
      const send = await insertPromptAndWaitForSend(
        promptText,
        Date.now() + 1e4,
        run,
      );
      checkRun(run);
      if (!send) {
        const diagnostic = {
          composer: composerAudit(),
          sendCandidates: all("send_button").length,
        };
        trace("send_not_found", diagnostic);
        return { success: false, error: "SEND_BUTTON_NOT_FOUND", diagnostic };
      }
      for (const url of mediaSnapshot()) before.add(url);
      for (const id of resultMessageSnapshot()) beforeMessages.add(id);
      if (Array.isArray(payload.images) && payload.images.length) {
        const state = referenceAttachmentState();
        if (
          state.scope !== upload.scope ||
          state.attachments.length !== upload.expectedTotal ||
          !state.scope?.contains(send)
        ) {
          const diagnostic = {
            stage: "presubmit",
            expected: upload.expectedTotal,
            actual: state.attachments.length,
            sameComposer: state.scope === upload.scope,
          };
          trace("reference_attach_changed", diagnostic);
          return { success: false, error: "REF_UPLOAD_FAILED", diagnostic };
        }
      }
      if (
        !send.isConnected ||
        send.disabled ||
        send.getAttribute("aria-disabled") === "true"
      ) {
        trace("send_no_longer_ready");
        return { success: false, error: "SEND_BUTTON_NOT_CLICKABLE" };
      }
      const sentAt = Date.now();
      if (!simulateClick(send)) {
        trace("send_not_clickable");
        return { success: false, error: "SEND_BUTTON_NOT_CLICKABLE" };
      }
      trace("send_clicked");
      FloatingTracker.update({
        current: 0,
        total: 1,
        phase: "Generating\u2026",
        prompt: String(payload.text || "").slice(0, 50),
      });
      const deadline = Date.now() + Number(payload.timeout);
      let sawGenerating = false;
      const textState = { signature: null, since: sentAt };
      while (Date.now() < deadline) {
        if (run.cancelled) {
          trace("cancelled");
          return { success: false, error: "CANCELLED" };
        }
        sawGenerating || (sawGenerating = !!first("stop_button"));
        const failureMessage = detectTerminalGenerationFailure(
          failureMessagesBeforeSubmit,
        );
        const textOnly = textOnlyResult(beforeMessages, textState, sentAt);
        if (textOnly) {
          trace("text_only_result");
          return {
            success: false,
            error: "MUSE_TEXT_ONLY_RESULT",
            message: `Muse returned text without media: ${textOnly.slice(0, 1e3)}`,
          };
        }
        if (failureMessage && !textState.matchesConfiguredFailure) {
          trace("generation_failed");
          return {
            success: false,
            error: "GENERATION_FAILED",
            message: failureMessage,
          };
        }
        const newMedia = visible(all(resultKey))
          .map((el) => ({ key: resultKey, el }))
          .filter(({ key, el }) => {
            const src = sourceFor(key, el),
              messageId = resultMessageIdFor(el);
            return (
              src &&
              !before.has(src) &&
              messageId &&
              !beforeMessages.has(messageId) &&
              (key !== "result_image" ||
                (el.complete === true && el.naturalWidth > 0))
            );
          });
        if (newMedia.length && !first("stop_button")) {
          const mediaUrls = newMedia.map(({ key, el }) => sourceFor(key, el));
          const mediaType = requestedMediaType;
          trace("result_detected", {
            mediaType,
            count: mediaUrls.length,
            sawGenerating,
            sinceSendMs: Date.now() - sentAt,
            messageIds: Array.from(
              new Set(newMedia.map(({ el }) => resultMessageIdFor(el))),
            ),
          });
          const fetchedMedia = [];
          if (mediaType === "image") {
            for (const url of mediaUrls) {
              fetchedMedia.push(await fetchImageWithRetry(url, run));
            }
          } else {
            for (const { key, el } of newMedia) {
              if (key !== "result_video") continue;
              const url = sourceFor(key, el);
              const poster = await waitForRun(run, () =>
                captureVideoPosterWhenReady(key, el, deadline),
              );
              console.info("[MuseVideoPoster] capture completed", {
                found: !!poster,
                hasConfiguredPoster: !!optionalSourceAttributeFor(
                  key,
                  el,
                  "poster_attribute",
                ),
              });
              if (poster) fetchedMedia.push({ url, poster });
            }
          }
          checkRun(run);
          return {
            success: true,
            mediaUrls,
            mediaType,
            fetchedMedia,
            sawGenerating,
          };
        }
        await waitForRun(run, () => sleep(500));
      }
      trace("generation_timeout", { sawGenerating });
      return {
        success: false,
        error: "TIMEOUT",
        message: sawGenerating
          ? "Muse generation timed out."
          : "Muse did not start generation.",
      };
    } catch (error) {
      if (run.cancelled || error?.code === "CANCELLED") {
        trace("cancelled");
        return { success: false, error: "CANCELLED" };
      }
      throw error;
    } finally {
      if (activeRun === run) {
        activeRun = null;
        ExecutionBlocker.hide();
        FloatingTracker.hide();
      }
    }
  }
  async function abort({ requestedAt = Date.now() } = {}) {
    const preparation = activeChatPreparation;
    if (
      Number.isFinite(requestedAt) &&
      ((activeRun && activeRun.startedAt > requestedAt) ||
        (preparation && preparation.startedAt > requestedAt))
    ) {
      return { success: false, error: "ABORT_SUPERSEDED", superseded: true };
    }
    const alreadyCancelled = activeRun?.cancelled === true;
    if (activeRun) activeRun.cancelled = true;
    const ownedRun = activeRun;
    ownedRun?.controller.abort();
    if (preparation) {
      preparation.cancelled = true;
      preparation.controller.abort();
    }
    const stop = preparation && !ownedRun ? null : first("stop_button");
    const stopClicked = !alreadyCancelled && !!stop;
    if (stopClicked) stop.click();
    ExecutionBlocker.hide();
    FloatingTracker.hide();
    return ownedRun || preparation || stopClicked
      ? {
          success: true,
          abortReceived: true,
          stopClicked,
          remoteStopped: stopClicked,
        }
      : { success: false, abortReceived: true, error: "STOP_BUTTON_NOT_FOUND" };
  }
  async function waitFor(key, deadline) {
    while (Date.now() < deadline) {
      const el = visible(all(key))[0] || null;
      if (el) return el;
      await sleep(150);
    }
    return null;
  }
  async function waitForConnected(key, deadline) {
    while (Date.now() < deadline) {
      const el = first(key);
      if (el) return el;
      await sleep(150);
    }
    return null;
  }
  async function waitForEnabled(key, deadline) {
    while (Date.now() < deadline) {
      const el =
        visible(all(key)).find(
          (item) =>
            !item.disabled && item.getAttribute("aria-disabled") !== "true",
        ) || null;
      if (el) return el;
      await sleep(150);
    }
    return null;
  }
  async function createNewChat() {
    if (activeChatPreparation || activeRun)
      return { success: false, error: "PROVIDER_BUSY" };
    const run = {
      cancelled: false,
      startedAt: Date.now(),
      controller: new AbortController(),
    };
    activeChatPreparation = run;
    try {
      return await createMuseNewChat(run);
    } catch (error) {
      return {
        success: false,
        error: error.code || error.message || "NEW_CHAT_FAILED",
      };
    } finally {
      if (activeChatPreparation === run) activeChatPreparation = null;
    }
  }
  async function createMuseNewChat(run) {
    if (!(await waitForRun(run, () => ensureConfig())))
      return { success: false, error: "PROVIDER_CONFIG_MISSING" };
    checkRun(run);
    const timings = apiConfigs?.automation_timings;
    const budgetMs = Number(timings?.new_chat_timeout_ms),
      pollMs = Number(timings?.poll_interval_ms);
    if (
      !Number.isFinite(budgetMs) ||
      budgetMs <= 0 ||
      !Number.isFinite(pollMs) ||
      pollMs <= 0
    ) {
      return { success: false, error: "MUSE_AUTOMATION_TIMINGS_MISSING" };
    }
    const deadline = Date.now() + budgetMs;
    const poll = async (resolve) => {
      while (Date.now() < deadline) {
        checkRun(run);
        const target = resolve();
        if (target) return target;
        await waitForRun(run, () =>
          sleep(Math.min(pollMs, Math.max(1, deadline - Date.now()))),
        );
      }
      checkRun(run);
      return resolve() || null;
    };
    const switcher = await poll(() => visible(all("chat_switcher_trigger"))[0]);
    if (!switcher) return { success: false, error: "CHAT_SWITCHER_NOT_FOUND" };
    checkRun(run);
    if (!visible(all("side_chats_panel")).length) switcher.click();
    const panel = await poll(() => visible(all("side_chats_panel"))[0]);
    if (!panel) return { success: false, error: "SIDE_CHATS_PANEL_NOT_FOUND" };
    const previousActive = first("active_thread_row");
    const newChat = await poll(() => visible(all("new_chat_button"))[0]);
    if (!newChat) return { success: false, error: "NEW_CHAT_BUTTON_NOT_FOUND" };
    checkRun(run);
    newChat.click();
    if (previousActive) {
      const changed = await poll(
        () =>
          !previousActive.isConnected ||
          first("active_thread_row") !== previousActive,
      );
      return changed
        ? { success: true }
        : { success: false, error: "NEW_CHAT_NOT_CONFIRMED" };
    }
    const composer = await poll(() => activeComposer());
    return composer
      ? { success: true }
      : { success: false, error: "NEW_CHAT_COMPOSER_NOT_READY" };
  }
  async function deleteCurrentChat() {
    if (!(await ensureConfig()))
      return { success: false, error: "PROVIDER_CONFIG_MISSING" };
    const deadline = Date.now() + 3e4;
    const switcher = first("chat_switcher_trigger");
    if (!switcher) return { success: false, error: "CHAT_SWITCHER_NOT_FOUND" };
    if (!visible(all("side_chats_panel")).length) switcher.click();
    if (!(await waitFor("side_chats_panel", deadline)))
      return { success: false, error: "SIDE_CHATS_PANEL_NOT_FOUND" };
    let activeRow = await waitForConnected("active_thread_row", deadline);
    if (!activeRow) return { success: false, error: "ACTIVE_THREAD_NOT_FOUND" };
    activeRow.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    await sleep(300);
    activeRow = await waitForConnected("active_thread_row", deadline);
    if (!activeRow) return { success: false, error: "ACTIVE_THREAD_NOT_FOUND" };
    activeRow.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    await sleep(100);
    activeRow.focus?.({ preventScroll: true });
    hover(activeRow);
    const options = await waitForConnected(
      "active_thread_options_button",
      deadline,
    );
    if (
      !activeRow ||
      !options ||
      options.disabled ||
      options.getAttribute("aria-disabled") === "true"
    ) {
      return { success: false, error: "ACTIVE_THREAD_OPTIONS_NOT_FOUND" };
    }
    hover(options);
    if (!simulateClick(options, activeRow))
      return { success: false, error: "ACTIVE_THREAD_OPTIONS_NOT_CLICKABLE" };
    const deleteItem = await waitFor("delete_thread_menu_item", deadline);
    if (!deleteItem)
      return { success: false, error: "DELETE_MENU_ITEM_NOT_FOUND" };
    if (!activeRow.isConnected || first("active_thread_row") !== activeRow)
      return { success: false, error: "ACTIVE_THREAD_CHANGED" };
    if (!simulateClick(deleteItem))
      return { success: false, error: "DELETE_MENU_ITEM_NOT_CLICKABLE" };
    const confirm = await waitFor("delete_confirm_button", deadline);
    if (!confirm) return { success: false, error: "DELETE_CONFIRM_NOT_FOUND" };
    if (!activeRow.isConnected || first("active_thread_row") !== activeRow)
      return { success: false, error: "ACTIVE_THREAD_CHANGED" };
    if (!simulateClick(confirm))
      return { success: false, error: "DELETE_CONFIRM_NOT_CLICKABLE" };
    while (Date.now() < deadline) {
      if (!activeRow.isConnected || first("active_thread_row") !== activeRow)
        return { success: true };
      await sleep(150);
    }
    return { success: false, error: "DELETE_NOT_CONFIRMED" };
  }
  async function downloadVideo(payload = {}) {
    return downloadMediaNative(payload, "video");
  }
  async function downloadMediaNative(payload = {}, mediaType) {
    if (!(await ensureConfig()))
      return { success: false, error: "PROVIDER_CONFIG_MISSING" };
    const url = String(payload.url || "");
    if (!url) return { success: false, error: "MEDIA_URL_MISSING" };
    const key = mediaType === "image" ? "result_image" : "result_video";
    const matches = all(key).filter(
      (el) => sourceFor(key, el) === url && resultMessageIdFor(el),
    );
    if (matches.length !== 1)
      return {
        success: false,
        error: matches.length
          ? "MEDIA_RESULT_AMBIGUOUS"
          : "MEDIA_RESULT_NOT_FOUND",
      };
    if (visible(all("download_menu_item")).length)
      return { success: false, error: "DOWNLOAD_MENU_ALREADY_OPEN" };
    const media = matches[0];
    try {
      media.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: "auto",
      });
    } catch (_) {}
    await sleep(0);
    const rect = media.getBoundingClientRect();
    const eventOptions = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      button: 2,
      buttons: 2,
    };
    media.dispatchEvent(
      new PointerEvent("pointerdown", {
        ...eventOptions,
        pointerType: "mouse",
      }),
    );
    media.dispatchEvent(new MouseEvent("mousedown", eventOptions));
    media.dispatchEvent(new MouseEvent("contextmenu", eventOptions));
    const item = await waitFor("download_menu_item", Date.now() + 1e4);
    if (!item) return { success: false, error: "DOWNLOAD_MENU_ITEM_NOT_FOUND" };
    if (
      visible(all("download_menu_item")).length !== 1 ||
      !media.isConnected ||
      sourceFor(key, media) !== url
    ) {
      return { success: false, error: "DOWNLOAD_TARGET_CHANGED" };
    }
    if (!simulateClick(item))
      return { success: false, error: "DOWNLOAD_MENU_ITEM_NOT_CLICKABLE" };
    return { success: true };
  }
  async function captureVideoPosterForUrl(payload = {}) {
    if (!(await ensureConfig()))
      return { success: false, error: "PROVIDER_CONFIG_MISSING" };
    const url = String(payload.url || "");
    if (!url) return { success: false, error: "VIDEO_URL_MISSING" };
    const wrapper = all("result_video").find(
      (el) => sourceFor("result_video", el) === url,
    );
    if (!wrapper) return { success: false, error: "VIDEO_RESULT_NOT_FOUND" };
    try {
      wrapper.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: "auto",
      });
    } catch (_) {}
    const poster = await captureVideoPosterWhenReady(
      "result_video",
      wrapper,
      Date.now() + 5e3,
    );
    return poster
      ? { success: true, poster }
      : { success: false, error: "VIDEO_POSTER_UNAVAILABLE" };
  }
  async function playVideo(payload = {}) {
    if (!(await ensureConfig()))
      return { success: false, error: "PROVIDER_CONFIG_MISSING" };
    const url = String(payload.url || "");
    if (!url) return { success: false, error: "VIDEO_URL_MISSING" };
    const candidates = all("result_video");
    const wrapper = candidates.find(
      (el) => sourceFor("result_video", el) === url,
    );
    if (!wrapper) {
      console.warn("[MuseNativePlayback] result wrapper not found", {
        candidateCount: candidates.length,
        url,
      });
      return {
        success: false,
        error: "VIDEO_RESULT_NOT_FOUND",
        candidateCount: candidates.length,
      };
    }
    try {
      wrapper.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: "auto",
      });
    } catch (_) {}
    if (!simulateClick(wrapper))
      return { success: false, error: "VIDEO_WRAPPER_NOT_CLICKABLE" };
    await sleep(0);
    const media = nestedMediaFor("result_video", wrapper);
    if (!media || typeof media.play !== "function")
      return { success: false, error: "VIDEO_MEDIA_NOT_FOUND" };
    try {
      await media.play();
      const result = {
        success: true,
        playing: !media.paused,
        muted: media.muted === true,
      };
      console.info("[MuseNativePlayback] started", result);
      return result;
    } catch (error) {
      try {
        media.muted = true;
        await media.play();
        const result = {
          success: true,
          playing: !media.paused,
          mutedFallback: true,
        };
        console.info("[MuseNativePlayback] started muted fallback", result);
        return result;
      } catch (_) {
        console.warn("[MuseNativePlayback] play rejected", {
          name: error?.name || null,
          message: error?.message || String(error),
        });
        return {
          success: false,
          error: "VIDEO_PLAY_FAILED",
          message: error?.message || String(error),
        };
      }
    }
  }
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.action === "pq:trackerUpdate") {
      const data = message.data;
      if (!applyRichTrackerData(data)) {
        sendResponse({ ok: true, ignored: true });
        return false;
      }
      sendResponse({ ok: true });
      return false;
    }
    if (
      message?.action === "providerConfigUpdated" ||
      message?.action === "providerApiConfigUpdated"
    ) {
      loadConfig().then(() => sendResponse({ success: true }));
      return true;
    }
    if (message?.action === "muse:checkLogin") {
      ensureConfig()
        .then(async (ok) => {
          const waitStarted = Date.now();
          if (ok && message.waitForComposer === true) {
            await waitForActiveComposer(Date.now() + CONFIG_WAIT_MAX_MS);
          }
          const ready = ok && !!activeComposer();
          const diagnostic = ok ? composerAudit() : null;
          if (message.waitForComposer === true) {
            trace("composer_preflight", {
              ready,
              waitedMs: Date.now() - waitStarted,
              ...diagnostic,
            });
          }
          if (!ready && ok)
            console.warn(
              "[MuseComposer] readiness blocked",
              JSON.stringify(diagnostic),
            );
          sendResponse({
            success: true,
            ready,
            error: ready
              ? null
              : ok
                ? "COMPOSER_NOT_READY"
                : "PROVIDER_CONFIG_MISSING",
            diagnostic,
          });
        })
        .catch((error) =>
          sendResponse({
            success: false,
            ready: false,
            error: "EXCEPTION",
            message: error?.message,
          }),
        );
      return true;
    }
    if (message?.action === "muse:abort") {
      abort(message)
        .then(sendResponse)
        .catch((error) =>
          sendResponse({
            success: false,
            error: "EXCEPTION",
            message: error?.message,
          }),
        );
      return true;
    }
    if (message?.action === "muse:newChat") {
      createNewChat()
        .then(sendResponse)
        .catch((error) =>
          sendResponse({
            success: false,
            error: "EXCEPTION",
            message: error?.message,
          }),
        );
      return true;
    }
    if (message?.action === "muse:deleteCurrentChat") {
      deleteCurrentChat()
        .then(sendResponse)
        .catch((error) =>
          sendResponse({
            success: false,
            error: "EXCEPTION",
            message: error?.message,
          }),
        );
      return true;
    }
    if (message?.action === "muse:downloadVideo") {
      downloadVideo(message.payload || {})
        .then(sendResponse)
        .catch((error) =>
          sendResponse({
            success: false,
            error: "EXCEPTION",
            message: error?.message,
          }),
        );
      return true;
    }
    if (message?.action === "muse:downloadImage") {
      downloadMediaNative(message.payload || {}, "image")
        .then(sendResponse)
        .catch((error) =>
          sendResponse({
            success: false,
            error: "EXCEPTION",
            message: error?.message,
          }),
        );
      return true;
    }
    if (message?.action === "muse:captureVideoPoster") {
      captureVideoPosterForUrl(message.payload || {})
        .then(sendResponse)
        .catch((error) =>
          sendResponse({
            success: false,
            error: "EXCEPTION",
            message: error?.message,
          }),
        );
      return true;
    }
    if (message?.action === "muse:playVideo") {
      playVideo(message.payload || {})
        .then(sendResponse)
        .catch((error) =>
          sendResponse({
            success: false,
            error: "EXCEPTION",
            message: error?.message,
          }),
        );
      return true;
    }
    if (message?.action !== "muse:submitAndWait") return;
    submitAndWait(message.payload || {})
      .then(sendResponse)
      .catch((error) =>
        sendResponse({
          success: false,
          error: "EXCEPTION",
          message: error?.message,
        }),
      );
    return true;
  });
})();
