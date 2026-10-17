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
class McpExecutor {
  static async _runnerId() {
    const ownerId = String(window.authManager?.user?.id || "");
    if (this._runnerIdPromise && this._runnerOwnerId === ownerId)
      return this._runnerIdPromise;
    this._runnerOwnerId = ownerId;
    const task = (this._runnerIdPromise = (async () => {
      const stored = await chrome.storage.local.get([
        this._RUNNER_ID_KEY,
        this._RUNNER_OWNER_KEY,
      ]);
      if (
        ownerId &&
        stored?.[this._RUNNER_ID_KEY] &&
        stored?.[this._RUNNER_OWNER_KEY] === ownerId
      ) {
        return stored[this._RUNNER_ID_KEY];
      }
      const runnerId = crypto.randomUUID();
      await chrome.storage.local.set({
        [this._RUNNER_ID_KEY]: runnerId,
        [this._RUNNER_OWNER_KEY]: ownerId,
      });
      return runnerId;
    })());
    try {
      return await task;
    } catch (error) {
      if (this._runnerIdPromise === task) this._runnerIdPromise = null;
      throw error;
    }
  }
  static _runnerLabel() {
    const ua = String(navigator.userAgent || "");
    const browser = /Edg\//.test(ua)
      ? "Microsoft Edge"
      : /OPR\//.test(ua)
        ? "Opera"
        : /Chrome\//.test(ua)
          ? "Google Chrome"
          : "Browser";
    const os = /Windows NT/.test(ua)
      ? "Windows"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Android/.test(ua)
          ? "Android"
          : /Linux/.test(ua)
            ? "Linux"
            : "Unknown OS";
    return `${browser} - ${os}`;
  }
  static init() {
    if (this._initialized) return;
    this._initialized = true;
    window.eventBus?.on("sse:ai_command", (data) => this._execute(data));
    window.eventBus?.on("sse:ai_cancel", (data) =>
      this._handleCancel(data).catch((error) =>
        console.warn("[McpExecutor] cancel routing failed", error?.message),
      ),
    );
    window.eventBus?.on("execution:force_stopped", () => {
      if (!this._currentJobId) return;
      this._wasStopped = true;
      if (this._currentProvider === "muse")
        window.MuseSession?.abort?.().catch(() => {});
    });
    const restore = () => {
      this._pingExecutorHeartbeat("ready").catch(() => {});
      this._flushResultOutbox().catch(() => {});
    };
    for (const event of [
      "auth:login",
      "sse:connected",
      "broadcast:became_leader",
    ]) {
      window.eventBus?.on(event, restore);
    }
    window.addEventListener?.("online", restore);
    window.addEventListener?.("focus", restore);
    document.addEventListener?.("visibilitychange", () => {
      if (document.visibilityState === "visible") restore();
    });
    this._flushResultOutbox().catch((e) =>
      console.warn("[McpExecutor] flush outbox l\u1ED7i:", e?.message),
    );
    this._pingExecutorHeartbeat("ready").catch(() => {});
    this._executorHeartbeatTimer = setInterval(
      () => this._pingExecutorHeartbeat("ready").catch(() => {}),
      45e3,
    );
    console.log("[McpExecutor] \u0110\xE3 kh\u1EDFi t\u1EA1o");
  }
  static async _pingExecutorHeartbeat(stage = "ready", jobId = null) {
    if (stage !== "ready") return this._sendExecutorHeartbeat(stage, jobId);
    if (this._readyHeartbeatPromise) return this._readyHeartbeatPromise;
    this._readyHeartbeatPromise = this._sendExecutorHeartbeat(stage, jobId);
    try {
      return await this._readyHeartbeatPromise;
    } finally {
      this._readyHeartbeatPromise = null;
    }
  }
  static async _sendExecutorHeartbeat(stage, jobId) {
    if (!window.authManager?._apiCall || !window.authManager?.isLoggedIn?.())
      return false;
    let timer = null;
    let expired = false;
    try {
      const timeoutMs = Number(
        window.SystemConfig?.safeGetTimeout?.("api_timeout_ms"),
      );
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw Object.assign(
          new Error("MCP_HEARTBEAT_TIMEOUT_CONFIG_UNAVAILABLE"),
          { code: "MCP_HEARTBEAT_TIMEOUT_CONFIG_UNAVAILABLE" },
        );
      }
      await Promise.race([
        (async () => {
          const runnerId = await this._runnerId();
          if (expired) return;
          return window.authManager._apiCall("POST", "mcp/executor-heartbeat", {
            runner_id: runnerId,
            label: this._runnerLabel(),
            job_id: jobId || this._currentJobId || null,
            stage,
            context: window.location?.pathname || "sidebar",
          });
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            expired = true;
            reject(
              Object.assign(new Error("MCP executor heartbeat timed out"), {
                code: "MCP_HEARTBEAT_TIMEOUT",
              }),
            );
          }, timeoutMs);
        }),
      ]);
      if (this._heartbeatFailed)
        console.info("[McpExecutor] Executor heartbeat restored");
      this._heartbeatFailed = false;
      return true;
    } catch (error) {
      if (!this._heartbeatFailed)
        console.warn(
          `[McpExecutor] Executor heartbeat failed: stage=${stage}, code=${error?.code || "unknown"}, status=${error?.httpStatus ?? "n/a"}, message=${error?.message || "unknown"}`,
        );
      this._heartbeatFailed = true;
      return false;
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }
  static _startActiveHeartbeat(jobId) {
    this._stopActiveHeartbeat();
    this._pingExecutorHeartbeat("event_received", jobId).catch(() => {});
    this._activeHeartbeatTimer = setInterval(
      () => this._pingExecutorHeartbeat("running", jobId).catch(() => {}),
      3e4,
    );
  }
  static _stopActiveHeartbeat() {
    if (this._activeHeartbeatTimer) clearInterval(this._activeHeartbeatTimer);
    this._activeHeartbeatTimer = null;
  }
  static _isLeaderContext() {
    const role = window.SseBroadcastManager?._role;
    return !role || role === "leader";
  }
  static async _execute(data) {
    const { command, args, job_id } = data || {};
    if (!job_id) return;
    if (!data.runner_id || data.runner_id !== (await this._runnerId())) return;
    if (!this._isLeaderContext()) {
      console.log("[McpExecutor] follower context \u2192 skip", job_id);
      return;
    }
    const VALID = [
      "gen_image",
      "gen_video",
      "upload_ref",
      "extract_last_frame",
      "run_node",
      "run_workflow",
      "create_project",
      "open_project",
      "get_context",
      "get_provider_status",
      "get_characters",
      "delete_chat",
      "clear_flow_cookies",
    ];
    if (!VALID.includes(command)) {
      await this._sendResult(job_id, "failed", {
        errorCode: "GEN_FAILED",
        errorMessage: `L\u1EC7nh kh\xF4ng h\u1ED7 tr\u1EE3: ${command}`,
      });
      return;
    }
    try {
      if (window.featureGate?.isInitialized?.() !== true) {
        await window.featureGate?.init?.();
      }
      if (
        window.featureGate &&
        window.featureGate.canUse &&
        window.featureGate.canUse("mcp_enabled") === false
      ) {
        await this._sendResult(job_id, "failed", {
          errorCode: "FEATURE_NOT_IN_PLAN",
          errorMessage: "MCP ch\u01B0a b\u1EADt cho plan",
        });
        return;
      }
    } catch (_) {}
    if (this._isExecuting) {
      if (job_id === this._currentJobId) {
        console.log("[McpExecutor] Duplicate active command ignored:", job_id);
        this._pingExecutorHeartbeat("duplicate_ignored", job_id).catch(
          () => {},
        );
        return;
      }
      await this._sendResult(job_id, "failed", {
        errorCode: "EXTENSION_BUSY",
        errorMessage: "Extension \u0111ang x\u1EED l\xFD l\u1EC7nh MCP kh\xE1c",
      });
      return;
    }
    this._currentJobId = job_id;
    this._isExecuting = true;
    this._cancelRequested = false;
    this._wasStopped = false;
    this._startActiveHeartbeat(job_id);
    const provider = args?.provider || "flow";
    this._currentProvider = provider;
    const isWorkflowCommand =
      command === "run_workflow" || command === "run_node";
    let ownsMcpLock = false;
    let generationStarted = false;
    let generationFinished = false;
    try {
      const requestedOwner = isWorkflowCommand ? "workflow" : "mcp";
      if (window.ExecutionLock?.isBlockedBy(requestedOwner)) {
        const st = window.ExecutionLock.getState?.() || {};
        const ownerLabels = {
          prompts: "Prompt/Gen",
          task: "Task",
          workflow: "Workflow",
          angles: "Angles",
          effects: "Effects",
          queue: "Queue",
        };
        const busy =
          st.label || ownerLabels[st.owner] || st.owner || "another task";
        await this._sendResult(job_id, "failed", {
          errorCode: "EXTENSION_BUSY",
          errorMessage: `Extension \u0111ang b\u1EADn: ${busy}. Ch\u1EDD xong r\u1ED3i th\u1EED l\u1EA1i.`,
        });
        return;
      }
      if (!isWorkflowCommand) {
        window.ExecutionLock?.acquire("mcp", `MCP: ${command}`);
        ownsMcpLock = true;
      }
      this._currentExecutionToken = null;
      const execAction = this._mapCommandToAction(command, provider);
      if (execAction && !window.ExecutionGate) {
        await this._sendResult(job_id, "failed", {
          errorCode: "EXECUTION_GATE_UNAVAILABLE",
          errorMessage: "ExecutionGate ch\u01B0a s\u1EB5n s\xE0ng.",
        });
        return;
      }
      if (execAction && window.ExecutionGate) {
        try {
          const nPrompts =
            Array.isArray(args?.prompts) && args.prompts.length
              ? args.prompts.length
              : 1;
          const promptCount =
            command === "gen_image"
              ? nPrompts * Math.min(args?.count || 1, 4)
              : command === "gen_video"
                ? nPrompts
                : 1;
          const refCount =
            args?.ref_mode === "none"
              ? 0
              : (Array.isArray(args?.refs) ? args.refs.length : 0) +
                (Array.isArray(args?.refs_per_prompt)
                  ? args.refs_per_prompt.reduce(
                      (total, refSet) =>
                        total + (Array.isArray(refSet) ? refSet.length : 0),
                      0,
                    )
                  : 0) +
                (Array.isArray(args?.reuse_refs) ? args.reuse_refs.length : 0);
          const gate = await ExecutionGate.request(execAction, promptCount, {
            owner: "mcp",
            label: `MCP: ${command}`,
            provider,
            has_ref: refCount > 0,
            ref_count: refCount,
          });
          if (!gate.allowed) {
            await this._sendResult(job_id, "failed", {
              errorCode: "DAILY_QUOTA_EXCEEDED",
              errorMessage:
                "\u0110\xE3 h\u1EBFt l\u01B0\u1EE3t s\u1EED d\u1EE5ng trong ng\xE0y (quota). Ch\u1EDD reset ho\u1EB7c n\xE2ng plan \u2014 kh\xF4ng retry ngay.",
            });
            return;
          }
          if (!gate.token || gate.reason === "OFFLINE_FALLBACK") {
            await this._sendResult(job_id, "failed", {
              errorCode: "EXECUTION_GATE_UNAVAILABLE",
              errorMessage:
                "Kh\xF4ng th\u1EC3 x\xE1c nh\u1EADn quy\u1EC1n ch\u1EA1y v\u1EDBi server. Ki\u1EC3m tra k\u1EBFt n\u1ED1i r\u1ED3i th\u1EED l\u1EA1i.",
            });
            return;
          }
          this._currentExecutionToken = gate.token;
        } catch (e) {
          if (window.QuotaErrorHandler?.isQuotaError?.(e)) {
            await this._sendResult(job_id, "failed", {
              errorCode: "DAILY_QUOTA_EXCEEDED",
              errorMessage:
                "\u0110\xE3 h\u1EBFt l\u01B0\u1EE3t s\u1EED d\u1EE5ng trong ng\xE0y (quota). Ch\u1EDD reset ho\u1EB7c n\xE2ng plan \u2014 kh\xF4ng retry ngay.",
            });
            return;
          }
          await this._sendResult(job_id, "failed", {
            errorCode: "EXECUTION_GATE_UNAVAILABLE",
            errorMessage:
              e?.message ||
              "Kh\xF4ng th\u1EC3 k\u1EBFt n\u1ED1i ExecutionGate.",
          });
          return;
        }
      }
      let result;
      generationStarted = ["gen_image", "gen_video"].includes(command);
      this._currentGenerationStartedAt = generationStarted ? Date.now() : null;
      switch (command) {
        case "gen_image":
          result = await this._executeGen(args, false);
          break;
        case "gen_video":
          result = await this._executeGen(args, true);
          break;
        case "upload_ref":
          result = await this._executeUploadRef(args);
          break;
        case "extract_last_frame":
          result = await this._executeExtractLastFrame(args);
          break;
        case "run_node":
          result = await this._executeWorkflowNode(args);
          break;
        case "run_workflow":
          result = await this._executeWorkflow(args);
          break;
        case "create_project":
          result = await this._executeCreateProject(args);
          break;
        case "open_project":
          result = await this._executeOpenProject(args);
          break;
        case "get_context":
          result = await this._executeGetContext();
          break;
        case "get_provider_status":
          result = await this._executeGetProviderStatus(args);
          break;
        case "get_characters":
          result = await this._executeGetCharacters();
          break;
        case "delete_chat":
          result = await this._executeDeleteChat(args);
          break;
        case "clear_flow_cookies":
          result = await this._executeClearFlowCookies(args);
          break;
      }
      generationFinished = true;
      if (this._wasStopped) {
        const quota = this._quotaCompletion(result, true);
        const delivered = await this._sendResult(
          job_id,
          "failed",
          {
            ...result,
            errorCode: "CANCELLED",
            errorMessage:
              "\u0110\xE3 hu\u1EF7 (d\u1EEBng th\u1EE7 c\xF4ng ho\u1EB7c cancel_all) tr\u01B0\u1EDBc khi ho\xE0n t\u1EA5t.",
          },
          {
            executionToken: this._currentExecutionToken,
            executionOutcome: quota.status,
            executionResultData: quota.resultData,
          },
        );
        if (window.ExecutionGate && this._currentExecutionToken) {
          if (delivered)
            await ExecutionGate.complete(
              this._currentExecutionToken,
              quota.status,
              quota.resultData,
            );
          this._currentExecutionToken = null;
        }
      } else {
        const quota = this._quotaCompletion(result, false);
        const delivered = await this._sendResult(
          job_id,
          "completed",
          { ...(result || {}), _command: command },
          {
            executionToken: this._currentExecutionToken,
            executionOutcome: quota.status,
            executionResultData: quota.resultData,
          },
        );
        if (window.ExecutionGate && this._currentExecutionToken) {
          if (delivered)
            await ExecutionGate.complete(
              this._currentExecutionToken,
              quota.status,
              quota.resultData,
            );
          this._currentExecutionToken = null;
        }
      }
    } catch (err) {
      const stopped = this._wasStopped;
      const code = stopped ? "CANCELLED" : err?.code || "GEN_FAILED";
      const msg = stopped
        ? "\u0110\xE3 hu\u1EF7 (d\u1EEBng th\u1EE7 c\xF4ng ho\u1EB7c cancel_all)."
        : err?.message || String(err);
      if (!stopped) console.error("[McpExecutor] L\u1ED7i:", err?.message);
      if (generationStarted && !generationFinished) {
        const promptList =
          Array.isArray(args?.prompts) && args.prompts.length
            ? [...args.prompts]
            : args?.prompt
              ? [args.prompt]
              : [];
        await this._saveGenHistory({
          promptList,
          mediaType: command === "gen_video" ? "video" : "image",
          model: this._historyModel(
            provider,
            args?.model,
            command === "gen_video",
          ),
          ratio: args?.ratio,
          quantity: args?.count || 1,
          provider,
          thumbs: [],
          resultFileIds: [],
          refFileIds: err?.refFileIds || [],
          refThumbnails: err?.refThumbnails || {},
          status: stopped ? "stopped" : "failed",
          errorReason: msg,
          stopOrigin: null,
          errorDetails: err?.errorDetails || [],
          flowApiVersions: err?.flowApiVersions || [],
        });
      }
      const delivered = await this._sendResult(
        job_id,
        "failed",
        { errorCode: code, errorMessage: msg },
        {
          executionToken: this._currentExecutionToken,
          executionOutcome: "failed",
        },
      );
      if (window.ExecutionGate && this._currentExecutionToken) {
        if (delivered)
          await ExecutionGate.complete(this._currentExecutionToken, "failed", {
            error: msg,
          });
        this._currentExecutionToken = null;
      }
    } finally {
      if (ownsMcpLock) window.ExecutionLock?.release("mcp");
      this._stopActiveHeartbeat();
      this._currentJobId = null;
      this._currentProvider = null;
      this._currentGenerationStartedAt = null;
      this._isExecuting = false;
    }
  }
  static _resolvePromptList(args) {
    const list =
      Array.isArray(args?.prompts) && args.prompts.length
        ? args.prompts
        : args?.prompt
          ? [args.prompt]
          : [];
    if (!list.length)
      throw this._err("GEN_FAILED", "Thi\u1EBFu prompt/prompts.");
    if (list.some((prompt) => typeof prompt !== "string" || !prompt.trim())) {
      throw this._err(
        "VALIDATION_ERROR",
        "Every prompt must be a non-empty string; blank slots cannot be removed because refs_per_prompt is positional.",
      );
    }
    return [...list];
  }
  static async _executeGen(args, isVideo) {
    const provider = args.provider || "flow";
    if (provider === "chatgpt") return this._executeChatGPTGen(args);
    if (provider === "grok") return this._executeGrokGen(args, isVideo);
    if (provider === "gemini") return this._executeGeminiGen(args, isVideo);
    if (provider === "muse") return this._executeMuseGen(args, isVideo);
    if (provider === "flow") return this._executeFlowGen(args, isVideo);
    throw this._err(
      "UNSUPPORTED_PROVIDER",
      `Provider kh\xF4ng \u0111\u01B0\u1EE3c h\u1ED7 tr\u1EE3: ${provider}`,
    );
  }
  static async _readFlowProjectContext() {
    let timeoutMs = 0;
    try {
      timeoutMs = Number(window.SystemConfig?.getTimeout?.("api_timeout_ms"));
    } catch (_) {}
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw this._err(
        "CONFIG_UNAVAILABLE",
        "Flow context timeout config ch\u01B0a t\u1EA3i t\u1EEB server.",
      );
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, context) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(context);
      };
      const unavailable = () =>
        this._err(
          "PROVIDER_TAB_NOT_READY",
          "Kh\xF4ng nh\u1EADn \u0111\u01B0\u1EE3c Flow context t\u1EEB relay. Ki\u1EC3m tra k\u1EBFt n\u1ED1i extension v\xE0 tab Flow r\u1ED3i th\u1EED l\u1EA1i; ch\u01B0a th\u1EC3 k\u1EBFt lu\u1EADn c\u1EA7n t\u1EA1o project m\u1EDBi.",
        );
      const timer = setTimeout(() => finish(unavailable()), timeoutMs);
      try {
        chrome.runtime.sendMessage(
          { action: "getFlowProjectContext" },
          (context) => {
            if (
              chrome.runtime.lastError ||
              !context ||
              typeof context !== "object"
            )
              finish(unavailable());
            else finish(null, context);
          },
        );
      } catch (_) {
        finish(unavailable());
      }
    });
  }
  static _flowProjectReadinessError(context) {
    if (!context?.projectId) {
      return "Ch\u01B0a m\u1EDF Google Flow ho\u1EB7c ch\u01B0a v\xE0o 1 project. H\xE3y m\u1EDF Flow + v\xE0o/t\u1EA1o 1 project (ho\u1EB7c g\u1ECDi create_project) r\u1ED3i th\u1EED l\u1EA1i.";
    }
    if (context.projectError === true)
      return "Flow project \u0111ang b\xE1o l\u1ED7i ho\u1EB7c \u0111\xE3 b\u1ECB xo\xE1. Ki\u1EC3m tra project tr\xEAn tab Flow r\u1ED3i th\u1EED l\u1EA1i.";
    if (context.contentReady === false) {
      return "\u0110\xE3 m\u1EDF Flow project nh\u01B0ng content script/relay ch\u01B0a s\u1EB5n s\xE0ng. \u0110\u1EE3i tab t\u1EA3i xong; n\u1EBFu \u0111ang xem media h\xE3y tr\u1EDF l\u1EA1i editor r\u1ED3i th\u1EED l\u1EA1i. Kh\xF4ng c\u1EA7n t\u1EA1o project m\u1EDBi.";
    }
    return null;
  }
  static async _resolveFlowChain(args, isVideo, promptList, hasRef) {
    if (!args.chain) return null;
    const fail = (message) => {
      throw this._err("VALIDATION_ERROR", message);
    };
    const config = window.ProviderConfigManager?.getFlowChainConfigSync?.();
    const max = Number(
      isVideo ? config?.max_video_segments : config?.max_image_segments,
    );
    const apiCapability =
      (isVideo ? config?.video_enabled : config?.image_enabled) === true;
    const webCapability =
      (isVideo
        ? config?.video_web_chain_enabled
        : config?.image_web_chain_enabled) === true;
    if (
      !config?.enabled ||
      !Number.isFinite(max) ||
      max < 2 ||
      (!apiCapability && !webCapability)
    )
      fail("Flow chain is unavailable in server config.");
    if (promptList.length < 2 || promptList.length > max)
      fail(`Chain requires 2\u2013${max} prompts.`);
    if ((args.count || 1) !== 1) fail("Chain requires count=1.");
    if (!["generated_only", "generated_plus_mapped"].includes(args.chain))
      fail("Invalid chain policy.");
    if (isVideo && args.chain !== "generated_only")
      fail("Video chain requires generated_only.");
    if (isVideo && hasRef && args.video_input_type !== "Frames")
      fail("Video chain refs require Frames input.");
    const settings = (await window.storageSettings?.getSettings?.()) || {};
    const storedMode =
      args.gen_mode || settings.defaultGenMode || settings.gen_mode || "ui";
    const serverApiDisabled =
      window.SystemConfig?.get?.("flow_api_driver", null) === "disabled";
    const mode = serverApiDisabled
      ? "web"
      : storedMode === "ui"
        ? "web"
        : storedMode;
    const isFrames = isVideo && args.video_input_type === "Frames";
    const components =
      !isFrames &&
      (!!args.voice ||
        !!args.character ||
        promptList.some((prompt) =>
          window.MentionParser?.hasComponents?.(prompt),
        ));
    const apiEnabled =
      args.gen_mode === "api" ||
      [true, "true", 1].includes(settings.apiModeEnabled);
    const apiAllowed =
      apiCapability &&
      apiEnabled &&
      window.featureGate?.canUse?.("flow_api_enabled") &&
      !components;
    let ready = false;
    if (apiAllowed && mode !== "web") {
      try {
        ready =
          (
            await window.FlowApiSessionCoordinator?.check?.({
              surface: "mcp",
              mediaType: isVideo ? "video" : "image",
              force: true,
              passive: true,
            })
          )?.ready === true;
      } catch (_) {}
    }
    let engine = null;
    if (mode === "web" && webCapability) engine = "web";
    else if (mode === "api" && apiAllowed && ready) engine = "api";
    else if (mode === "auto")
      engine = apiAllowed && ready ? "api" : webCapability ? "web" : null;
    if (!engine)
      fail(`Flow ${mode} chain is not ready for the selected settings.`);
    return {
      enabled: true,
      kind: isVideo ? "video_last_frame" : "image_result",
      refPolicy: args.chain,
      engine,
      allowWebFallback: mode === "auto" && engine === "api" && webCapability,
    };
  }
  static async _resolvePromptImages(args, promptCount, maxRefs) {
    if (args.ref_mode === "none")
      return Array.from({ length: promptCount }, () => []);
    const perPrompt =
      Array.isArray(args.refs_per_prompt) && args.refs_per_prompt.length > 0;
    if (perPrompt && args.refs_per_prompt.length !== promptCount)
      throw this._err(
        "VALIDATION_ERROR",
        "refs_per_prompt must match prompts length.",
      );
    const sets = perPrompt ? args.refs_per_prompt : [args.refs || []];
    const resolved = [];
    for (const refs of sets) {
      if (Number.isInteger(maxRefs) && refs.length > maxRefs)
        throw this._err("VALIDATION_ERROR", "Reference image limit exceeded.");
      resolved.push(
        await this._resolveRefsToImages(refs, maxRefs ?? refs.length),
      );
    }
    return perPrompt
      ? resolved
      : Array.from({ length: promptCount }, () => resolved[0]);
  }
  static async _executeFlowGen(args, isVideo) {
    const {
      prompt,
      prompts,
      ratio,
      model,
      count,
      refs,
      refs_per_prompt,
      ref_mode,
      duration,
      video_input_type,
      voice,
      character,
      reuse_refs,
    } = args;
    const promptList = this._resolvePromptList(args);
    if (!promptList.length)
      throw this._err("GEN_FAILED", "Thi\u1EBFu prompt/prompts.");
    const requestedRefSets = refs_per_prompt?.length
      ? refs_per_prompt
      : [refs || []];
    if (
      isVideo &&
      video_input_type === "Frames" &&
      ref_mode !== "none" &&
      requestedRefSets.some(
        (set) =>
          set.length + (refs_per_prompt?.length ? 0 : reuse_refs?.length || 0) >
          2,
      )
    ) {
      throw this._err(
        "VALIDATION_ERROR",
        "Flow Frames accepts at most 2 images (first and last frame).",
      );
    }
    if (!window.PromptQueue || !PromptQueue.isEnabled?.()) {
      throw this._err(
        "GEN_FAILED",
        "PromptQueue ch\u01B0a s\u1EB5n s\xE0ng (c\u1EA7n b\u1EADt pipeline queue).",
      );
    }
    const flowRatio = await this._resolveFlowRatio(ratio, isVideo);
    if (
      !window.ModelRegistry?.getDefaultAsync ||
      !window.ModelRegistry?.findModel
    ) {
      throw this._err(
        "CONFIG_UNAVAILABLE",
        "Flow model registry ch\u01B0a s\u1EB5n s\xE0ng. Reload extension r\u1ED3i th\u1EED l\u1EA1i.",
      );
    }
    let effectiveModel = model || null;
    if (!effectiveModel) {
      try {
        effectiveModel = await window.ModelRegistry.getDefaultAsync(
          "flow",
          isVideo ? "video" : "image",
        );
      } catch (error) {
        throw this._err(
          "CONFIG_UNAVAILABLE",
          `Kh\xF4ng \u0111\u1ECDc \u0111\u01B0\u1EE3c model Flow m\u1EB7c \u0111\u1ECBnh: ${error?.message || "unknown error"}`,
        );
      }
    }
    if (!effectiveModel) {
      throw this._err(
        "CONFIG_UNAVAILABLE",
        `Kh\xF4ng c\xF3 model Flow ${isVideo ? "video" : "image"} kh\u1EA3 d\u1EE5ng t\u1EEB server.`,
      );
    }
    const flowContext = await this._readFlowProjectContext();
    const readinessError = this._flowProjectReadinessError(flowContext);
    if (readinessError)
      throw this._err("PROVIDER_TAB_NOT_READY", readinessError);
    try {
      await new Promise((r) =>
        chrome.runtime.sendMessage(
          {
            action: "activateFlowTabForExecution",
            tabId: flowContext.tabId,
            focusWindow: true,
          },
          () => r(),
        ),
      );
      await new Promise((r) => setTimeout(r, 400));
    } catch (_) {}
    const requestedRefs =
      ref_mode !== "none" &&
      (!!reuse_refs?.length || requestedRefSets.some((set) => set.length));
    const chain = await this._resolveFlowChain(
      args,
      isVideo,
      promptList,
      requestedRefs,
    );
    if (chain && isVideo && requestedRefs) {
      if (
        requestedRefSets[0]?.length + (reuse_refs?.length || 0) > 1 ||
        requestedRefSets.slice(1).some((set) => set.length)
      ) {
        throw this._err(
          "VALIDATION_ERROR",
          "Video chain accepts only one initial start frame; later frames come from the preceding video.",
        );
      }
    }
    const refFileIds = [];
    const refFileNames = {};
    let refFileIdsPerPrompt = null;
    let refImageMode = "none";
    const _uploadOne = async (ref) => {
      if (typeof ref !== "string" || !ref.trim()) {
        throw this._err(
          "VALIDATION_ERROR",
          "Reference image must be a non-empty base64/data URL/public URL string.",
        );
      }
      const up = await this._uploadRefToFlow(ref);
      if (up?.tileId) {
        if (up.fileName) refFileNames[up.tileId] = up.fileName;
        return up.tileId;
      }
      throw this._err(
        "UPLOAD_FAILED",
        "Reference image upload completed without a Flow media identity.",
      );
    };
    if (
      ref_mode !== "none" &&
      Array.isArray(refs_per_prompt) &&
      refs_per_prompt.length
    ) {
      refImageMode = "sequential";
      refFileIdsPerPrompt = [];
      for (const refSet of refs_per_prompt) {
        const ids = [];
        for (const ref of Array.isArray(refSet) ? refSet : []) {
          const id = await _uploadOne(ref);
          if (id) ids.push(id);
        }
        refFileIdsPerPrompt.push(ids);
      }
    } else if (ref_mode !== "none" && Array.isArray(refs) && refs.length) {
      refImageMode = "all";
      for (const ref of refs) {
        const id = await _uploadOne(ref);
        if (id) refFileIds.push(id);
      }
    }
    if (ref_mode !== "none" && Array.isArray(reuse_refs) && reuse_refs.length) {
      const reuseTiles = await this._resolveReuseRefs(reuse_refs, refFileNames);
      for (const t of reuseTiles)
        if (!refFileIds.includes(t)) refFileIds.push(t);
      if (reuseTiles.length && refImageMode !== "sequential")
        refImageMode = "all";
    }
    const genType = isVideo ? "Video" : "Image";
    const quantity = isVideo ? 1 : Math.min(count || 1, 4);
    const isFrames = isVideo && video_input_type === "Frames";
    let flowDuration = isVideo ? duration || null : null;
    const inputType = isFrames ? "Frames" : "Ingredients";
    const hasRef =
      refFileIds.length > 0 ||
      (Array.isArray(refFileIdsPerPrompt) &&
        refFileIdsPerPrompt.some((a) => a?.length));
    const flowAdapter = window.ProviderRegistry?.get?.("flow");
    if (isVideo && hasRef && flowAdapter?.getDurationOverride) {
      try {
        const forced = flowAdapter.getDurationOverride({
          modelValue: effectiveModel,
          hasRef: true,
          inputType,
        });
        if (forced && forced !== flowDuration) {
          console.warn(
            `[McpExecutor] \xA713 duration \xE9p ${flowDuration} \u2192 ${forced} (${effectiveModel} + ref)`,
          );
          flowDuration = forced;
        }
      } catch (_) {}
    }
    if (hasRef && flowAdapter?.supportsRefImages) {
      let refsSupported = true;
      try {
        refsSupported = flowAdapter.supportsRefImages(effectiveModel, {
          inputType: isVideo ? inputType : void 0,
          duration: isVideo ? flowDuration || void 0 : void 0,
        });
      } catch (_) {}
      if (!refsSupported)
        throw this._err(
          "VALIDATION_ERROR",
          `Model "${effectiveModel}" (${inputType}) does not support the supplied reference images.`,
        );
    }
    const dl = await this._getMcpDownloadSettings();
    let voicePayload = null;
    if (isVideo && voice) {
      const modelObj = window.ModelRegistry.findModel("flow", effectiveModel);
      if (!modelObj?.config?.supports_voice) {
        throw this._err(
          "VALIDATION_ERROR",
          `Model "${effectiveModel}" does not support voice. Choose a model with supports_voice (see list_capabilities) or remove voice.`,
        );
      }
      let vlist = [];
      try {
        vlist = (await window.VoiceRegistry?.getRenderList?.("flow")) || [];
      } catch (_) {}
      const v = vlist.find((x) => x.slug === voice);
      if (!v?.search_value) {
        throw this._err(
          "VALIDATION_ERROR",
          `Voice "${voice}" kh\xF4ng h\u1EE3p l\u1EC7. D\xF9ng list_voices \u0111\u1EC3 l\u1EA5y slug \u0111\xFAng.`,
        );
      }
      voicePayload = { slug: v.slug, search_value: v.search_value };
    }
    let characterPayload = null;
    if (character) {
      const modelObj = window.ModelRegistry.findModel("flow", effectiveModel);
      if (modelObj?.config?.supports_character !== true) {
        throw this._err(
          "VALIDATION_ERROR",
          `Model "${effectiveModel}" does not support characters. Choose a model with supports_character (see list_capabilities) or remove character.`,
        );
      }
      let characters = [];
      try {
        characters = (await window.CharacterRegistry?.getRenderList?.()) || [];
      } catch (_) {}
      const selected = characters.find((item) => item.slug === character);
      if (!selected?.search_value) {
        throw this._err(
          "VALIDATION_ERROR",
          `Character "${character}" kh\xF4ng h\u1EE3p l\u1EC7. D\xF9ng list_characters \u0111\u1EC3 l\u1EA5y slug hi\u1EC7n c\xF3.`,
        );
      }
      characterPayload = {
        slug: selected.slug,
        search_value: selected.search_value,
      };
    }
    const result = await PromptQueue.getInstance().submitJob({
      owner: "mcp",
      chain,
      sequentialMode: args.run_mode === "sequential",
      projectId: flowContext.projectId,
      label: isVideo ? "MCP Video" : "MCP Generate",
      _executionToken: this._currentExecutionToken,
      _executionTokenManagedByCaller: true,
      prompts: promptList,
      voice: voicePayload,
      character: characterPayload,
      settings: {
        genType,
        ratio: flowRatio,
        model: effectiveModel,
        quantity,
        isFrames,
        flowVideoDuration: flowDuration,
        ...(args.gen_mode ? { flowExecutionMode: args.gen_mode } : {}),
      },
      refImageMode,
      refFileIds,
      refFileIdsPerPrompt,
      refFileNames,
      autoDownload: dl.autoDownload,
      downloadResolution: dl.downloadResolution,
      videoDownloadResolution: dl.videoDownloadResolution,
      taskName: dl.autoDownload ? dl.downloadFolder : null,
    });
    const thumbs = this._collectThumbs(result?.resultThumbnails);
    if (thumbs.length === 0)
      throw Object.assign(
        this._err(
          "GEN_FAILED",
          result?.failedPrompts?.[0]?.error ||
            result?.reason ||
            "Flow kh\xF4ng t\u1EA1o \u0111\u01B0\u1EE3c k\u1EBFt qu\u1EA3 (0 \u1EA3nh/video).",
        ),
        {
          errorDetails: result?.errorDetails || [],
          flowApiVersions: result?.flowApiVersions || [],
        },
      );
    thumbs.forEach((t) => {
      t.provider = "flow";
    });
    const allRefIds = [
      ...refFileIds,
      ...(Array.isArray(refFileIdsPerPrompt) ? refFileIdsPerPrompt.flat() : []),
    ];
    await this._saveGenHistory({
      promptList,
      mediaType: isVideo ? "video" : "image",
      model: this._historyModel("flow", effectiveModel, isVideo),
      ratio: flowRatio,
      quantity,
      refFileIds: allRefIds,
      thumbs,
      resultFileIds: result?.resultTileIds || [],
      provider: "flow",
      status: result?.stopped ? "stopped" : null,
      stopOrigin: result?.stopOrigin || null,
      errorReason: result?.stopped
        ? result.stopReason || "BATCH_STOPPED"
        : null,
      failedPrompts: result?.failedPrompts || [],
      errorDetails: result?.errorDetails || [],
      flowApiVersions: result?.flowApiVersions || [],
      durationMs: result?.durationMs,
    });
    return {
      thumbnails: thumbs,
      batch: this._buildBatch(
        promptList.length,
        result?.failedPrompts,
        result?.completed,
      ),
    };
  }
  static async _executeChatGPTGen(args) {
    const { prompt, prompts, ratio, model, refs } = args;
    const promptList = this._resolvePromptList(args);
    if (!promptList.length)
      throw this._err("GEN_FAILED", "Thi\u1EBFu prompt/prompts.");
    if (!window.ChatGPTSession)
      throw this._err(
        "PROVIDER_TAB_NOT_READY",
        "Ch\u01B0a m\u1EDF tab ChatGPT.",
      );
    const ready = await window.ChatGPTSession.ensureReady({
      createIfMissing: true,
      activate: true,
      focusWindow: true,
      forceCheck: true,
    });
    if (!ready.ready) {
      throw ready.error === "NOT_LOGGED_IN"
        ? this._err(
            "PROVIDER_NOT_LOGGED_IN",
            "Vui l\xF2ng \u0111\u0103ng nh\u1EADp ChatGPT.",
          )
        : this._err(
            "PROVIDER_TAB_NOT_READY",
            `ChatGPT kh\xF4ng s\u1EB5n s\xE0ng: ${ready.error}`,
          );
    }
    if (!window.MessageBridge?.chatGPTSubmitAndWait)
      throw this._err(
        "PROVIDER_TAB_NOT_READY",
        "MessageBridge ChatGPT kh\xF4ng kh\u1EA3 d\u1EE5ng.",
      );
    const promptImages = await this._resolvePromptImages(
      args,
      promptList.length,
    );
    const settings = await window.storageSettings?.getSettings();
    const fallbackPrefix =
      settings?.chatgptFallbackPrefix || "Generate an image of: ";
    const mcpDownload = await this._getMcpDownloadSettings();
    let fileNameSettings = null;
    if (
      mcpDownload.autoDownload &&
      window.DownloadHelper?.getSettings &&
      window.DownloadHelper?.buildFilename
    ) {
      try {
        fileNameSettings = await window.DownloadHelper.getSettings();
      } catch (error) {
        console.warn(
          "[McpExecutor] ChatGPT filename settings unavailable:",
          error?.message || error,
        );
      }
    }
    const thumbs = [];
    const failedPrompts = [];
    let lastErr = null;
    let downloadIndex = 0;
    for (let idx = 0; idx < promptList.length; idx++) {
      const p = promptList[idx];
      if (this._cancelRequested) {
        failedPrompts.push({
          index: idx,
          prompt: p,
          error: "\u0110\xE3 hu\u1EF7",
        });
        continue;
      }
      try {
        const result = await window.MessageBridge.chatGPTSubmitAndWait({
          text: p,
          images: promptImages[idx],
          settings: {
            imageMode: true,
            ratio: this._mapRatioToChatGPT(ratio),
            model: model || null,
            fallbackPrefix,
          },
          timeout:
            window.SystemConfig?.getTimeout("chatgpt_timeout_ms") || 12e4,
          tabId: ready.tabId,
          taskName: "MCP ChatGPT",
        });
        if (!result?.success) {
          lastErr = result?.message || result?.error;
          failedPrompts.push({ index: idx, prompt: p, error: lastErr });
          continue;
        }
        const before = thumbs.length;
        for (const url of result.imageUrls || []) {
          const outputIndex = ++downloadIndex;
          thumbs.push({
            url,
            type: "image",
            file_name: `chatgpt_${url.slice(-12)}.png`,
            provider: "chatgpt",
          });
          if (
            mcpDownload.autoDownload &&
            fileNameSettings &&
            window.DownloadHelper?.downloadExternalMedia
          ) {
            try {
              const filename = window.DownloadHelper.buildFilename({
                template: fileNameSettings.template,
                project: fileNameSettings.project,
                prompt: p,
                index: outputIndex,
                taskName: mcpDownload.downloadFolder,
                folder: fileNameSettings.folder,
                ext: "png",
              });
              let source = url;
              const fetched = await window.MessageBridge?.chatGPTFetchImage?.(
                url,
                result.tabId || ready.tabId,
              );
              if (fetched?.success && fetched.base64) {
                source = String(fetched.base64).startsWith("data:")
                  ? fetched.base64
                  : `data:${fetched.mime || "image/png"};base64,${fetched.base64}`;
              }
              const downloaded =
                await window.DownloadHelper.downloadExternalMedia({
                  url: source,
                  filename,
                  mediaType: "image",
                  waitForComplete: false,
                });
              if (!downloaded?.success)
                console.warn(
                  "[McpExecutor] ChatGPT auto-download failed:",
                  downloaded?.error || "DOWNLOAD_FAILED",
                );
            } catch (downloadError) {
              console.warn(
                "[McpExecutor] ChatGPT auto-download error:",
                downloadError?.message || downloadError,
              );
            }
          }
        }
        if (thumbs.length === before)
          failedPrompts.push({
            index: idx,
            prompt: p,
            error: "Kh\xF4ng c\xF3 \u1EA3nh tr\u1EA3 v\u1EC1",
          });
      } catch (e) {
        lastErr = e?.message;
        failedPrompts.push({ index: idx, prompt: p, error: lastErr });
      }
    }
    if (thumbs.length === 0)
      throw this._err(
        "GEN_FAILED",
        lastErr || "ChatGPT could not generate an image.",
      );
    await this._saveGenHistory({
      promptList,
      mediaType: "image",
      model: this._historyModel("chatgpt", model),
      ratio,
      quantity: 1,
      refFileIds: [],
      thumbs,
      resultFileIds: [],
      provider: "chatgpt",
      failedPrompts,
    });
    return {
      thumbnails: thumbs,
      _tabId: ready.tabId,
      batch: this._buildBatch(promptList.length, failedPrompts),
    };
  }
  static async _executeGrokGen(args, isVideo) {
    const {
      prompt,
      prompts,
      ratio,
      refs,
      duration,
      resolution,
      model,
      video_input_type,
    } = args;
    const promptList = this._resolvePromptList(args);
    if (!promptList.length)
      throw this._err("GEN_FAILED", "Thi\u1EBFu prompt/prompts.");
    if (!window.GrokSession)
      throw this._err("PROVIDER_TAB_NOT_READY", "Ch\u01B0a m\u1EDF tab Grok.");
    const ready = await window.GrokSession.ensureReady({
      createIfMissing: true,
      activate: true,
      focusWindow: true,
      forceCheck: true,
    });
    if (!ready.ready) {
      throw ready.error === "NOT_LOGGED_IN"
        ? this._err(
            "PROVIDER_NOT_LOGGED_IN",
            "Vui l\xF2ng \u0111\u0103ng nh\u1EADp Grok.",
          )
        : this._err(
            "PROVIDER_TAB_NOT_READY",
            `Grok kh\xF4ng s\u1EB5n s\xE0ng: ${ready.error}`,
          );
    }
    if (!window.MessageBridge?.grokSubmitAndWait)
      throw this._err(
        "PROVIDER_TAB_NOT_READY",
        "MessageBridge Grok kh\xF4ng kh\u1EA3 d\u1EE5ng.",
      );
    const mode = isVideo ? "video" : "image";
    const adapter = window.ProviderRegistry?.get?.("grok");
    const selectedModel = adapter?.getModel?.(model, mode);
    if (!selectedModel)
      throw this._err(
        "CONFIG_UNAVAILABLE",
        "Grok model config is unavailable.",
      );
    const inputType = video_input_type || "Ingredients";
    const refMode = isVideo
      ? adapter
          .getVideoInputTypes(selectedModel.value)
          .find((option) => option.value === inputType)
      : null;
    if (isVideo && !refMode)
      throw this._err(
        "VALIDATION_ERROR",
        "Grok model does not support the selected video input type.",
      );
    const maxRefs = adapter.getMaxRefImages({
      mode,
      isFrames: inputType === "Frames",
      modelValue: selectedModel.value,
    });
    const promptImages = await this._resolvePromptImages(
      args,
      promptList.length,
      maxRefs,
    );
    try {
      await window.GrokSession.setMode(mode);
    } catch (_) {}
    const stored = await chrome.storage.local.get(["af_settings"]);
    const userSettings = stored?.af_settings || {};
    const grokDuration = duration || userSettings.grokDefaultDuration || null;
    const grokResolution =
      resolution || userSettings.grokDefaultResolution || null;
    const grokImageQuality =
      args.image_quality || userSettings.grokDefaultImageQuality || null;
    if (isVideo && (!grokDuration || !grokResolution)) {
      throw this._err(
        "CONFIG_UNAVAILABLE",
        "Grok video defaults are unavailable from server-backed user settings. Reload the extension and retry.",
      );
    }
    if (!isVideo && !grokImageQuality) {
      throw this._err(
        "CONFIG_UNAVAILABLE",
        "Grok image quality is unavailable from server-backed user settings. Reload the extension and retry.",
      );
    }
    const mcpDownload = await this._getMcpDownloadSettings();
    let fileNameSettings = null;
    if (mcpDownload.autoDownload) {
      if (
        !window.DownloadHelper?.getSettings ||
        !window.DownloadHelper?.buildFilename ||
        !window.MessageBridge?.grokDownloadMedia
      ) {
        console.warn(
          "[McpExecutor] Grok auto-download unavailable: shared download helpers missing",
        );
      } else {
        try {
          fileNameSettings = await window.DownloadHelper.getSettings();
        } catch (error) {
          console.warn(
            "[McpExecutor] Grok filename settings unavailable:",
            error?.message || error,
          );
        }
      }
    }
    const thumbs = [];
    const failedPrompts = [];
    let lastErr = null;
    let downloadIndex = 0;
    for (let idx = 0; idx < promptList.length; idx++) {
      const p = promptList[idx];
      if (this._cancelRequested) {
        failedPrompts.push({
          index: idx,
          prompt: p,
          error: "\u0110\xE3 hu\u1EF7",
        });
        continue;
      }
      try {
        const result = await window.MessageBridge.grokSubmitAndWait({
          text: p,
          images: promptImages[idx],
          settings: {
            mode,
            model: selectedModel.value,
            videoInputType: inputType,
            refRoleSelectors: refMode?.role_selectors || null,
            ratio: this._mapRatioToGrok(ratio),
            duration: isVideo ? grokDuration : null,
            resolution: isVideo ? grokResolution : null,
            imageQuality: isVideo ? null : grokImageQuality,
          },
          timeout: isVideo
            ? window.SystemConfig?.getTimeout("video_timeout_ms") || 6e5
            : window.SystemConfig?.getTimeout("image_timeout_ms") || 3e5,
          tabId: ready.tabId,
          taskName: "MCP Grok",
        });
        if (!result?.success) {
          lastErr = result?.message || result?.error;
          failedPrompts.push({ index: idx, prompt: p, error: lastErr });
          continue;
        }
        const mediaType = result.mediaType || (isVideo ? "video" : "image");
        const urls = result.mediaUrls || result.imageUrls || [];
        const before = thumbs.length;
        for (const url of urls) {
          const fetched = result.fetchedMedia?.find((f) => f.url === url);
          const outputIndex = ++downloadIndex;
          thumbs.push({
            url,
            type: mediaType,
            file_name: `grok_${url.slice(-12)}.${mediaType === "video" ? "mp4" : "png"}`,
            video_url: mediaType === "video" ? url : "",
            base64: fetched?.base64 || null,
            provider: "grok",
          });
          if (mcpDownload.autoDownload && fileNameSettings) {
            try {
              const ext = mediaType === "video" ? "mp4" : "png";
              const filename = window.DownloadHelper.buildFilename({
                template: fileNameSettings.template,
                project: fileNameSettings.project,
                prompt: p,
                index: outputIndex,
                taskName: mcpDownload.downloadFolder,
                folder: fileNameSettings.folder,
                ext,
              });
              let downloaded;
              if (window.WatermarkClient?.enabled?.(mediaType) === true) {
                let source = fetched?.base64 || null;
                let sourceMime = fetched?.mime || null;
                if (!source) {
                  const fetchedForDownload =
                    await window.MessageBridge.grokFetchImage?.(
                      url,
                      result.tabId || ready.tabId,
                    );
                  if (fetchedForDownload?.success) {
                    source = fetchedForDownload.base64;
                    sourceMime = fetchedForDownload.mime || sourceMime;
                  }
                }
                sourceMime =
                  /^data:([^;,]+);base64,/.exec(source || "")?.[1] ||
                  sourceMime;
                downloaded = await window.DownloadHelper.downloadExternalMedia({
                  url,
                  base64: source,
                  mime: sourceMime,
                  filename,
                  mediaType,
                  waitForComplete: true,
                });
              } else {
                downloaded = await window.MessageBridge.grokDownloadMedia(
                  url,
                  result.tabId || ready.tabId,
                  filename,
                  fetched?.base64 || null,
                  { nativeFirst: urls.length === 1 },
                );
              }
              if (!downloaded?.success) {
                console.warn(
                  "[McpExecutor] Grok auto-download failed:",
                  downloaded?.error || "DOWNLOAD_FAILED",
                );
              }
            } catch (downloadError) {
              console.warn(
                "[McpExecutor] Grok auto-download error:",
                downloadError?.message || downloadError,
              );
            }
          }
        }
        if (thumbs.length === before)
          failedPrompts.push({
            index: idx,
            prompt: p,
            error: "Kh\xF4ng c\xF3 k\u1EBFt qu\u1EA3 tr\u1EA3 v\u1EC1",
          });
      } catch (e) {
        lastErr = e?.message;
        failedPrompts.push({ index: idx, prompt: p, error: lastErr });
      }
    }
    if (thumbs.length === 0)
      throw this._err(
        "GEN_FAILED",
        lastErr || "Grok could not generate a result.",
      );
    await this._saveGenHistory({
      promptList,
      mediaType: isVideo ? "video" : "image",
      model: this._historyModel("grok", selectedModel.value, isVideo),
      ratio,
      quantity: 1,
      refFileIds: [],
      thumbs,
      resultFileIds: [],
      provider: "grok",
      failedPrompts,
    });
    return {
      thumbnails: thumbs,
      _tabId: ready.tabId,
      batch: this._buildBatch(promptList.length, failedPrompts),
    };
  }
  static async _executeGeminiGen(args, isVideo) {
    const { prompt, prompts, ratio, model, refs } = args;
    const promptList = this._resolvePromptList(args);
    if (!promptList.length)
      throw this._err("GEN_FAILED", "Thi\u1EBFu prompt/prompts.");
    const adapter = window.ProviderRegistry?.get?.("gemini");
    if (!adapter)
      throw this._err(
        "PROVIDER_TAB_NOT_READY",
        "Gemini adapter ch\u01B0a s\u1EB5n s\xE0ng.",
      );
    if (
      args.ref_mode !== "none" &&
      (refs?.length || args.refs_per_prompt?.some((set) => set.length)) &&
      !window.featureGate?.canUseProviderRefImages?.("gemini")
    ) {
      throw this._err(
        "FEATURE_NOT_IN_PLAN",
        "Gemini reference images ch\u01B0a \u0111\u01B0\u1EE3c b\u1EADt cho plan hi\u1EC7n t\u1EA1i.",
      );
    }
    const promptImages = await this._resolvePromptImages(
      args,
      promptList.length,
    );
    const selectedModel =
      model ||
      window.ModelRegistry?.safeGetDefault?.(
        "gemini",
        isVideo ? "video" : "image",
      );
    if (!selectedModel)
      throw this._err(
        "CONFIG_UNAVAILABLE",
        "Gemini model config ch\u01B0a t\u1EA3i t\u1EEB server.",
      );
    const mcpDownload = await this._getMcpDownloadSettings();
    let fileNameSettings = null;
    if (
      mcpDownload.autoDownload &&
      window.DownloadHelper?.getSettings &&
      window.DownloadHelper?.buildFilename
    ) {
      try {
        fileNameSettings = await window.DownloadHelper.getSettings();
      } catch (error) {
        console.warn(
          "[McpExecutor] Gemini filename settings unavailable:",
          error?.message || error,
        );
      }
    }
    const thumbs = [];
    const failedPrompts = [];
    let lastErr = null;
    let lastErrorCode = "GEN_FAILED";
    for (let idx = 0; idx < promptList.length; idx++) {
      if (this._cancelRequested) {
        failedPrompts.push({
          index: idx,
          prompt: promptList[idx],
          error: "\u0110\xE3 hu\u1EF7",
        });
        continue;
      }
      try {
        const result = await adapter.submit({
          prompt: promptList[idx],
          mediaType: isVideo ? "video" : "image",
          model: selectedModel,
          ratio: isVideo ? null : ratio,
          refs: promptImages[idx],
          runId: `mcp-gemini-${Date.now()}-${idx}`,
          settings: { promptIndex: idx },
        });
        const promptDownloadBase = thumbs.length;
        for (const item of result.results || []) {
          let materializedBase64 =
            !isVideo && String(item.url || "").startsWith("data:")
              ? String(item.url).split(",")[1]
              : null;
          if (
            isVideo &&
            item.url &&
            result.tabId &&
            window.MessageBridge?.geminiFetchMedia
          ) {
            const monitor =
              window.ProviderConfigManager?.getApiConfigValueSync?.(
                "gemini",
                "generation_monitor",
              )?.video;
            if (Number.isFinite(Number(monitor?.max_materialized_bytes))) {
              const fetched = await window.MessageBridge.geminiFetchMedia(
                item.url,
                result.tabId,
                Number(monitor.max_materialized_bytes),
              );
              if (fetched?.success)
                materializedBase64 = String(fetched.base64 || "").replace(
                  /^data:[^,]+,/,
                  "",
                );
            }
          }
          thumbs.push({
            url: item.url,
            type: isVideo ? "video" : "image",
            provider: "gemini",
            file_name: `gemini_${Date.now()}_${thumbs.length + 1}.${isVideo ? "mp4" : "png"}`,
            video_url: isVideo ? item.url : "",
            base64: materializedBase64,
            fingerprint: item.fingerprint || null,
            tab_id: result.tabId || null,
          });
        }
        if (
          mcpDownload.autoDownload &&
          fileNameSettings &&
          window.GeminiMediaDownloadHelper?.downloadResults &&
          (result.results || []).length
        ) {
          const downloaded =
            await window.GeminiMediaDownloadHelper.downloadResults({
              items: result.results,
              tabId: result.tabId,
              mediaType: isVideo ? "video" : "image",
              waitForComplete: false,
              filenameFor: (_item, mediaIndex) =>
                window.DownloadHelper.buildFilename({
                  template: fileNameSettings.template,
                  project: fileNameSettings.project,
                  prompt: promptList[idx],
                  index: promptDownloadBase + mediaIndex + 1,
                  taskName: mcpDownload.downloadFolder,
                  folder: fileNameSettings.folder,
                  ext: isVideo ? "mp4" : "png",
                }),
              onLog: (message) =>
                console.warn("[McpExecutor] Gemini auto-download:", message),
            });
          if (!downloaded?.success)
            console.warn(
              "[McpExecutor] Gemini auto-download partial:",
              downloaded?.failures || [],
            );
        }
        if (!(result.results || []).length)
          failedPrompts.push({
            index: idx,
            prompt: promptList[idx],
            error: "Kh\xF4ng c\xF3 k\u1EBFt qu\u1EA3 tr\u1EA3 v\u1EC1",
          });
      } catch (e) {
        lastErr = e?.message;
        lastErrorCode =
          typeof e?.code === "string" && /^[A-Z][A-Z0-9_]{0,39}$/.test(e.code)
            ? e.code
            : "GEN_FAILED";
        failedPrompts.push({
          index: idx,
          prompt: promptList[idx],
          error: `[${lastErrorCode}] ${lastErr || "Gemini kh\xF4ng t\u1EA1o \u0111\u01B0\u1EE3c k\u1EBFt qu\u1EA3."}`,
        });
      }
    }
    if (!thumbs.length)
      throw this._err(
        lastErrorCode,
        lastErr ||
          "Gemini kh\xF4ng t\u1EA1o \u0111\u01B0\u1EE3c k\u1EBFt qu\u1EA3.",
      );
    await this._saveGenHistory({
      promptList,
      mediaType: isVideo ? "video" : "image",
      model: selectedModel,
      ratio: isVideo ? null : ratio,
      quantity: 1,
      refFileIds: [],
      thumbs,
      resultFileIds: [],
      provider: "gemini",
      failedPrompts,
    });
    return {
      thumbnails: thumbs,
      batch: this._buildBatch(promptList.length, failedPrompts),
    };
  }
  static async _executeMuseGen(args, isVideo) {
    const { prompt, prompts, ratio, model, refs, refs_per_prompt, reuse_refs } =
      args;
    const promptList = this._resolvePromptList(args);
    if (!promptList.length)
      throw this._err("GEN_FAILED", "Thi\u1EBFu prompt/prompts.");
    if (
      args.ref_mode !== "none" &&
      Array.isArray(reuse_refs) &&
      reuse_refs.length
    ) {
      throw this._err(
        "VALIDATION_ERROR",
        "Muse MCP ch\u01B0a h\u1ED7 tr\u1EE3 reuse_refs; h\xE3y g\u1EEDi \u1EA3nh qua refs ho\u1EB7c refs_per_prompt.",
      );
    }
    const mediaType = isVideo ? "video" : "image";
    const registry = window.ModelRegistry;
    if (!registry?.getModels || !registry?.findModel)
      throw this._err(
        "CONFIG_UNAVAILABLE",
        "Muse model registry ch\u01B0a s\u1EB5n s\xE0ng.",
      );
    let models;
    try {
      models = await registry.getModels("muse", mediaType);
    } catch (error) {
      throw this._err(
        "CONFIG_UNAVAILABLE",
        `Kh\xF4ng \u0111\u1ECDc \u0111\u01B0\u1EE3c Muse model config t\u1EEB server: ${error?.message || "unknown error"}`,
      );
    }
    if (!Array.isArray(models) || !models.length)
      throw this._err(
        "CONFIG_UNAVAILABLE",
        `Muse ${mediaType} model config ch\u01B0a t\u1EA3i t\u1EEB server.`,
      );
    const selected = model
      ? registry.findModel("muse", model)
      : models.find((item) => item.is_default) || models[0];
    if (
      !selected?.value ||
      !models.some((item) => item.value === selected.value)
    ) {
      throw this._err(
        "VALIDATION_ERROR",
        `Muse model "${model}" kh\xF4ng h\u1ED7 tr\u1EE3 ${mediaType} ho\u1EB7c kh\xF4ng c\xF3 trong config server. D\xF9ng list_capabilities \u0111\u1EC3 ch\u1ECDn model h\u1EE3p l\u1EC7.`,
      );
    }
    const selectedModel = selected.value;
    const adapter = window.ProviderRegistry?.get?.("muse");
    if (!adapter || adapter.key !== "muse")
      throw this._err(
        "PROVIDER_TAB_NOT_READY",
        "Muse adapter ch\u01B0a s\u1EB5n s\xE0ng.",
      );
    const sharedRefs =
      args.ref_mode === "none" ? [] : Array.isArray(refs) ? refs : [];
    const perPromptRefs =
      args.ref_mode === "none"
        ? []
        : Array.isArray(refs_per_prompt)
          ? refs_per_prompt
          : [];
    const hasRefs =
      sharedRefs.length > 0 ||
      perPromptRefs.some(
        (refSet) => Array.isArray(refSet) && refSet.length > 0,
      );
    const maxRefs =
      adapter.getMaxRefImages?.({
        mode: mediaType,
        modelValue: selectedModel,
      }) ?? 0;
    if (hasRefs && !window.featureGate?.canUseProviderRefImages?.("muse")) {
      throw this._err(
        "FEATURE_NOT_IN_PLAN",
        "Muse reference images ch\u01B0a \u0111\u01B0\u1EE3c b\u1EADt cho plan hi\u1EC7n t\u1EA1i.",
      );
    }
    if (hasRefs && maxRefs <= 0) {
      throw this._err(
        "VALIDATION_ERROR",
        `Muse ${mediaType} kh\xF4ng h\u1ED7 tr\u1EE3 \u1EA3nh tham chi\u1EBFu theo c\u1EA5u h\xECnh hi\u1EC7n t\u1EA1i.`,
      );
    }
    const resolvedSharedRefs = await this._resolveRefsToImages(
      sharedRefs,
      maxRefs,
    );
    const resolvedPerPromptRefs = [];
    for (const refSet of perPromptRefs) {
      resolvedPerPromptRefs.push(
        await this._resolveRefsToImages(refSet, maxRefs),
      );
    }
    const historyByInput = new Map(),
      historyByRef = new Map(),
      usedHistoryRefs = new Map();
    const registerHistoryRefs = (resolved, inputs) =>
      resolved.forEach((ref, index) => {
        const input = inputs[index];
        if (!historyByInput.has(input))
          historyByInput.set(input, {
            id: `mcp_ref_${historyByInput.size + 1}`,
            thumbnail:
              typeof input === "string" &&
              input.length <= 4096 &&
              /^https:\/\//i.test(input)
                ? input
                : null,
          });
        historyByRef.set(ref, historyByInput.get(input));
      });
    registerHistoryRefs(resolvedSharedRefs, sharedRefs);
    resolvedPerPromptRefs.forEach((refs2, index) =>
      registerHistoryRefs(refs2, perPromptRefs[index]),
    );
    const historyRefs = () => ({
      refFileIds: [...usedHistoryRefs.keys()],
      refThumbnails: Object.fromEntries(
        [...usedHistoryRefs]
          .filter(([, ref]) => ref.thumbnail)
          .slice(0, 100)
          .map(([id, ref]) => [id, ref.thumbnail]),
      ),
    });
    const userSettings = await chrome.storage.local.get(["af_settings"]);
    const deleteAfterGen =
      mediaType === "image" &&
      userSettings.af_settings?.museDeleteAfterGen === true &&
      adapter.capabilities?.supportsDeleteAfterGen === true;
    let selectedRatio = ratio;
    if (!selectedRatio) {
      const configuredRatios = await window.ProviderConfigManager?.getRatios?.(
        "muse",
        mediaType,
      );
      selectedRatio =
        configuredRatios?.find((item) => item?.is_default === true)?.value ||
        configuredRatios?.[0]?.value ||
        configuredRatios?.[0] ||
        null;
    }
    if (!selectedRatio)
      throw this._err(
        "CONFIG_UNAVAILABLE",
        `Muse ${mediaType} ratio config ch\u01B0a t\u1EA3i t\u1EEB server.`,
      );
    const thumbs = [];
    const failedPrompts = [];
    let lastErr = null;
    for (let idx = 0; idx < promptList.length; idx++) {
      const currentPrompt = promptList[idx];
      if (this._cancelRequested) {
        failedPrompts.push({
          index: idx,
          prompt: currentPrompt,
          error: "\u0110\xE3 hu\u1EF7",
        });
        continue;
      }
      try {
        const promptRefs = resolvedPerPromptRefs.length
          ? resolvedPerPromptRefs[idx]
          : resolvedSharedRefs;
        for (const ref of promptRefs || []) {
          const history = historyByRef.get(ref);
          if (history) usedHistoryRefs.set(history.id, history);
        }
        const result = await adapter.submit({
          prompt: currentPrompt,
          refs: promptRefs,
          settings: { mode: mediaType, ratio: selectedRatio },
          taskName: "MCP Muse",
        });
        if (!result?.success) {
          lastErr =
            result?.message || result?.error || "Muse did not return a result";
          failedPrompts.push({
            index: idx,
            prompt: currentPrompt,
            error: lastErr,
          });
          continue;
        }
        const resultMediaType = result.mediaType || mediaType;
        if (resultMediaType !== mediaType) {
          lastErr = `Muse returned ${resultMediaType} for requested ${mediaType}.`;
          failedPrompts.push({
            index: idx,
            prompt: currentPrompt,
            error: lastErr,
          });
          continue;
        }
        const urls = result.mediaUrls || [];
        const before = thumbs.length;
        for (const url of urls) {
          const fetched = result.fetchedMedia?.find((item) => item.url === url);
          thumbs.push({
            url,
            type: resultMediaType,
            provider: "muse",
            file_name: `muse_${Date.now()}_${thumbs.length + 1}.${resultMediaType === "video" ? "mp4" : "png"}`,
            video_url: resultMediaType === "video" ? url : "",
            base64: fetched?.base64
              ? String(fetched.base64).replace(/^data:[^,]+,/, "")
              : null,
          });
        }
        if (
          deleteAfterGen &&
          thumbs.length > before &&
          !this._cancelRequested
        ) {
          const deleted =
            await window.MuseSession?.deleteCurrentConversation?.();
          if (!deleted?.success)
            console.warn(
              "[McpExecutor] Muse cleanup failed:",
              deleted?.error || "unknown",
            );
        }
        if (thumbs.length === before)
          failedPrompts.push({
            index: idx,
            prompt: currentPrompt,
            error: "Kh\xF4ng c\xF3 k\u1EBFt qu\u1EA3 tr\u1EA3 v\u1EC1",
          });
      } catch (error) {
        lastErr = error?.message || String(error);
        failedPrompts.push({
          index: idx,
          prompt: currentPrompt,
          error: lastErr,
        });
      }
    }
    if (!thumbs.length)
      throw Object.assign(
        this._err(
          "GEN_FAILED",
          lastErr ||
            "Muse kh\xF4ng t\u1EA1o \u0111\u01B0\u1EE3c k\u1EBFt qu\u1EA3.",
        ),
        historyRefs(),
      );
    await this._saveGenHistory({
      promptList,
      mediaType,
      model: selectedModel,
      ratio: selectedRatio,
      quantity: 1,
      ...historyRefs(),
      thumbs,
      resultFileIds: [],
      provider: "muse",
      failedPrompts,
    });
    return {
      thumbnails: thumbs,
      batch: this._buildBatch(promptList.length, failedPrompts),
    };
  }
  static async _executeExtractLastFrame(args) {
    if (args.provider && args.provider !== "flow")
      throw this._err(
        "VALIDATION_ERROR",
        "Last-frame extraction currently supports Flow references.",
      );
    if (!window.VideoFrameExtractor?.extractLastFrame)
      throw this._err(
        "PROVIDER_TAB_NOT_READY",
        "Video frame extractor is unavailable.",
      );
    const context = await this._readFlowProjectContext();
    const readinessError = this._flowProjectReadinessError(context);
    if (readinessError)
      throw this._err("PROVIDER_TAB_NOT_READY", readinessError);
    const checkCancelled = () => {
      if (this._cancelRequested)
        throw this._err("CANCELLED", "Last-frame extraction cancelled.");
    };
    checkCancelled();
    let url = args.video_url || null;
    if (args.tile_id) {
      const playback = await window.MessageBridge?.resolveVideoPlaybackUrl?.(
        args.tile_id,
        {
          fileName: args.file_name || "",
          sourceUrl: url || "",
          forceDomResolve: false,
        },
      );
      if (!playback?.success || !playback.video_url)
        throw this._err(
          "RESULT_MEDIA_UNAVAILABLE",
          "Could not resolve the selected Flow video.",
        );
      url = playback.video_url;
    }
    if (!url)
      throw this._err(
        "VALIDATION_ERROR",
        "Provide the Flow video tile_id or a playable video_url.",
      );
    checkCancelled();
    const frame = await window.VideoFrameExtractor.extractLastFrame(url, {
      provider: "flow",
    });
    if (!frame?.base64)
      throw this._err(
        "RESULT_MEDIA_UNAVAILABLE",
        "Video decoder returned no last frame.",
      );
    checkCancelled();
    const result = await this._executeUploadRef({ image: frame.base64 });
    checkCancelled();
    return result;
  }
  static async _executeUploadRef(args) {
    const up = await this._uploadRefToFlow(args.image);
    if (!up?.tileId)
      throw this._err(
        "UPLOAD_FAILED",
        "Upload \u1EA3nh tham chi\u1EBFu th\u1EA5t b\u1EA1i.",
      );
    const upload = { file_id: up.tileId };
    if (up.fileName) upload.file_name = up.fileName;
    if (up.thumbnailUrl && /^https?:\/\//i.test(up.thumbnailUrl))
      upload.thumbnail_url = up.thumbnailUrl;
    return { upload };
  }
  static _inlineImageParts(ref, declaredMime = null, index = 0) {
    let base64 = String(ref || "").trim();
    let mime = String(declaredMime || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const data = /^data:([^;,]+)(?:;[^,]*)?;base64,([\s\S]+)$/i.exec(base64);
    if (data) {
      mime = String(data[1] || "").toLowerCase();
      base64 = data[2];
    } else if (/^data:/i.test(base64)) {
      throw this._err(
        "VALIDATION_ERROR",
        "Reference data URL must contain base64 image bytes.",
      );
    }
    const allowed = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ]);
    if (mime && !allowed.has(mime)) {
      throw this._err(
        "VALIDATION_ERROR",
        `Reference content type is not a supported image: ${mime}`,
      );
    }
    base64 = base64.replace(/\s+/g, "");
    if (!base64)
      throw this._err("VALIDATION_ERROR", "Reference image bytes are empty.");
    if (!mime) {
      if (base64.startsWith("iVBORw0KGgo")) mime = "image/png";
      else if (base64.startsWith("UklGR")) mime = "image/webp";
      else if (base64.startsWith("R0lGOD")) mime = "image/gif";
      else mime = "image/jpeg";
    }
    const ext =
      mime === "image/png"
        ? "png"
        : mime === "image/webp"
          ? "webp"
          : mime === "image/gif"
            ? "gif"
            : "jpg";
    return { base64, mime, name: `mcp_ref_${index}.${ext}` };
  }
  static async _uploadRefToFlow(ref) {
    if (!ref || typeof ref !== "string") return null;
    if (!window.MessageBridge?.uploadFilesToFlow)
      throw this._err(
        "PROVIDER_TAB_NOT_READY",
        "MessageBridge upload kh\xF4ng kh\u1EA3 d\u1EE5ng.",
      );
    if (window.ImmediateUploader?._ensureFlowTabReady) {
      try {
        const act = await window.ImmediateUploader._ensureFlowTabReady();
        if (!act?.isOpen)
          throw this._err(
            "PROVIDER_TAB_NOT_READY",
            "Ch\u01B0a m\u1EDF tab Google Flow.",
          );
      } catch (e) {
        if (e?.code) throw e;
      }
    }
    let parts = null;
    if (/^https?:\/\//i.test(ref)) {
      const resp = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { action: "fetchBlob", url: ref, expectImage: true },
          (r) => {
            if (chrome.runtime.lastError)
              reject(new Error(chrome.runtime.lastError.message));
            else resolve(r);
          },
        );
      });
      if (!resp?.success || !resp.base64) {
        throw this._err(
          "REF_FETCH_FAILED",
          `Could not download ref image from URL: ${ref} (${resp?.error || "unknown error"}). Use a public URL that opens directly (no login/cookie required).`,
        );
      }
      parts = this._inlineImageParts(resp.base64, resp.contentType, 0);
    } else {
      parts = this._inlineImageParts(ref, null, 0);
    }
    let { base64, mime, name } = parts;
    if (window.WatermarkClient) {
      try {
        const cl = await window.WatermarkClient.cleanBase64(
          base64,
          mime,
          "image",
          { scope: "input" },
        );
        if (cl?.cleaned && cl.base64) base64 = cl.base64;
      } catch (e) {
        console.warn("[MCP] b\u1ECF qua xo\xE1 watermark cho ref:", e?.message);
      }
    }
    const result = await window.MessageBridge.uploadFilesToFlow(
      [{ name, type: mime, base64 }],
      { surface: "mcp", manualUpload: true },
    );
    const tileId = result?.orderedTileIds?.[0] || result?.tileIds?.[0] || null;
    if (!tileId)
      throw this._err(
        "UPLOAD_FAILED",
        "Upload xong nh\u01B0ng kh\xF4ng nh\u1EADn \u0111\u01B0\u1EE3c tile.",
      );
    const fileName =
      window.MediaRegistry?.getFileName?.(tileId) ||
      window.GenTab?.fileNameCache?.[tileId] ||
      "";
    const thumbnailUrl = window.MediaRegistry?.getThumb?.(tileId) || "";
    return { tileId, fileName, thumbnailUrl };
  }
  static async _executeCreateProject(args) {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const oldId = window._currentProjectId || null;
    if (typeof window._createNewProject === "function") {
      try {
        const result = await window._createNewProject();
        if (result?.ok === false)
          throw new Error(result.error || "CREATE_PROJECT_FAILED");
      } catch (e) {
        throw this._err(
          "PROVIDER_TAB_NOT_READY",
          `T\u1EA1o project th\u1EA5t b\u1EA1i: ${e?.message || e}`,
        );
      }
    } else {
      let targetTabId = null;
      try {
        const flowHome = window.ProviderConfigManager?.getCreateUrl?.("flow");
        const navigation = await new Promise((r) =>
          chrome.runtime.sendMessage(
            { action: "navigateToProject", url: flowHome },
            r,
          ),
        );
        if (!navigation?.success || !navigation.tabId)
          throw new Error(navigation?.error || "FLOW_TARGET_UNAVAILABLE");
        targetTabId = navigation.tabId;
        await sleep(1800);
      } catch (error) {
        throw this._err("PROVIDER_TAB_NOT_READY", error.message);
      }
      const resp = await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage(
            { action: "clickCreateNewProject", targetTabId },
            (r) => resolve(r),
          );
        } catch (e) {
          resolve({ success: false, error: e?.message });
        }
      });
      if (!resp?.success) {
        throw this._err(
          "PROVIDER_TAB_NOT_READY",
          resp?.error ||
            resp?.result?.error ||
            "Could not create project (the Create project button was not found on Flow).",
        );
      }
    }
    let newId = null;
    for (let i = 0; i < 30; i++) {
      await sleep(1e3);
      const cur = window._currentProjectId;
      if (cur && cur !== oldId) {
        newId = cur;
        break;
      }
    }
    if (!newId) {
      throw this._err(
        "PROJECT_CREATION_UNCONFIRMED",
        "\u0110\xE3 g\u1EEDi thao t\xE1c t\u1EA1o project nh\u01B0ng ch\u01B0a x\xE1c nh\u1EADn \u0111\u01B0\u1EE3c project m\u1EDBi. Ki\u1EC3m tra tab Flow/get_context tr\u01B0\u1EDBc khi t\u1EA1o l\u1EA1i \u0111\u1EC3 tr\xE1nh t\u1EA1o tr\xF9ng.",
      );
    }
    return {
      project: {
        project_id: newId,
        project_name: window._currentProjectName || null,
      },
    };
  }
  static async _executeOpenProject(args) {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const projectId = args?.project_id;
    if (!projectId) throw this._err("GEN_FAILED", "Thi\u1EBFu project_id");
    if (window._currentProjectId === projectId) {
      const ready = await window.ProjectHelper?.isFlowProjectReady?.();
      if (ready === false)
        throw this._err(
          "PROVIDER_TAB_NOT_READY",
          `Project ${projectId} \u0111ang l\u1ED7i ho\u1EB7c \u0111\xE3 b\u1ECB xo\xE1.`,
        );
      let nm = null;
      try {
        nm = await window.ProjectHelper?.getProjectName?.(projectId);
      } catch (_) {}
      return {
        project: {
          project_id: projectId,
          project_name: nm || window._currentProjectName || null,
        },
      };
    }
    try {
      const ensureResp = await new Promise((r) =>
        chrome.runtime.sendMessage({ action: "ensureFlowTabActive" }, (resp) =>
          r(resp),
        ),
      );
      if (!ensureResp?.ok) {
        const flowHome = window.ProviderConfigManager?.getCreateUrl?.("flow");
        await new Promise((r) =>
          chrome.runtime.sendMessage(
            { action: "navigateToProject", url: flowHome },
            () => r(),
          ),
        );
        await sleep(1500);
      }
    } catch (_) {}
    if (window.ProjectHelper?.navigateToProject) {
      window.ProjectHelper.navigateToProject(projectId);
    } else {
      const flowBase = window.ProviderConfigManager?.getBaseUrlSync?.("flow");
      await new Promise((r) =>
        chrome.runtime.sendMessage(
          {
            action: "navigateToProject",
            url: `${flowBase}/project/${projectId}`,
            projectId,
          },
          () => r(),
        ),
      );
    }
    let ok = false;
    for (let i = 0; i < 30; i++) {
      await sleep(1e3);
      if (window._currentProjectId === projectId) {
        ok = true;
        break;
      }
    }
    if (!ok)
      throw this._err(
        "PROVIDER_TAB_NOT_READY",
        `Kh\xF4ng m\u1EDF \u0111\u01B0\u1EE3c project ${projectId} (timeout). Project c\xF3 th\u1EC3 \u0111\xE3 b\u1ECB xo\xE1 ho\u1EB7c kh\xF4ng thu\u1ED9c t\xE0i kho\u1EA3n n\xE0y.`,
      );
    try {
      const ready = await window.ProjectHelper?.isFlowProjectReady?.();
      if (ready === false)
        throw this._err(
          "PROVIDER_TAB_NOT_READY",
          `Project ${projectId} \u0111ang l\u1ED7i ho\u1EB7c \u0111\xE3 b\u1ECB xo\xE1.`,
        );
    } catch (e) {
      if (e?.code) throw e;
    }
    let name = null;
    try {
      name = await window.ProjectHelper?.getProjectName?.(projectId);
    } catch (_) {}
    return {
      project: {
        project_id: projectId,
        project_name: name || window._currentProjectName || null,
      },
    };
  }
  static async _executeGetContext() {
    const ctx = await this._readFlowProjectContext();
    return {
      project: {
        project_id: ctx.projectId || null,
        project_name: ctx.projectId
          ? ctx.projectName ||
            (ctx.projectId === window._currentProjectId
              ? window._currentProjectName
              : null) ||
            null
          : null,
      },
    };
  }
  static async _preflightProviders(providers) {
    const order = { chatgpt: 0, grok: 1, gemini: 2, muse: 3, flow: 4 };
    const sorted = [...new Set(providers || [])].sort(
      (a, b) => (order[a] ?? 9) - (order[b] ?? 9),
    );
    const notReady = [];
    for (const p of sorted) {
      if (p === "chatgpt") {
        const prepared = await window.ChatGPTSession?.prepareNewChat?.({
          createIfMissing: true,
        });
        const r = prepared?.ready
          ? await window.ChatGPTSession.ensureReady({
              createIfMissing: false,
              activate: true,
              focusWindow: true,
              forceCheck: true,
              waitForEditorMs: 12e3,
            })
          : prepared;
        if (!r?.ready)
          notReady.push({
            provider: "chatgpt",
            reason:
              r?.error === "NOT_LOGGED_IN"
                ? "not logged in"
                : r?.error || "provider runtime unavailable",
            login: r?.error === "NOT_LOGGED_IN",
          });
      } else if (p === "grok") {
        const r = await window.GrokSession?.ensureReady?.({
          createIfMissing: true,
          activate: true,
          focusWindow: true,
          forceCheck: true,
        });
        if (!r?.ready)
          notReady.push({
            provider: "grok",
            reason:
              r?.error === "NOT_LOGGED_IN"
                ? "not logged in"
                : r?.error || "provider runtime unavailable",
            login: r?.error === "NOT_LOGGED_IN",
          });
      } else if (p === "gemini") {
        const r = await window.GeminiSession?.ensureReady?.({
          createIfMissing: true,
          activate: true,
          focusWindow: true,
        });
        if (!r?.ready)
          notReady.push({
            provider: "gemini",
            reason:
              r?.error === "NOT_LOGGED_IN"
                ? "not logged in"
                : r?.error || "provider runtime unavailable",
            login: r?.error === "NOT_LOGGED_IN",
          });
      } else if (p === "muse") {
        const r = await window.MuseSession?.ensureReady?.({
          createIfMissing: true,
          activate: true,
          silent: true,
        });
        if (!r?.ready && !(r?.error === "COMPOSER_NOT_READY" && r?.tabId)) {
          notReady.push({
            provider: "muse",
            reason:
              r?.error === "NOT_LOGGED_IN"
                ? "not logged in"
                : r?.error || "provider runtime unavailable",
            login: r?.error === "NOT_LOGGED_IN",
          });
        }
      } else if (p === "flow") {
        try {
          const context = await this._readFlowProjectContext();
          const reason = this._flowProjectReadinessError(context);
          if (reason) notReady.push({ provider: "flow", reason, login: false });
          else {
            try {
              await new Promise((res) =>
                chrome.runtime.sendMessage(
                  {
                    action: "activateFlowTabForExecution",
                    tabId: context.tabId,
                    focusWindow: true,
                  },
                  () => res(),
                ),
              );
            } catch (_) {}
          }
        } catch (error) {
          notReady.push({
            provider: "flow",
            reason: error.message,
            login: false,
          });
        }
      }
    }
    if (notReady.length) {
      const list = notReady
        .map((x) => `${x.provider} (${x.reason})`)
        .join("; ");
      const allLogin = notReady.every((x) => x.login);
      throw this._err(
        allLogin ? "PROVIDER_NOT_LOGGED_IN" : "PROVIDER_TAB_NOT_READY",
        `${notReady.length} provider ch\u01B0a s\u1EB5n s\xE0ng: ${list}. Chu\u1EA9n b\u1ECB xong T\u1EA4T C\u1EA2 r\u1ED3i run_workflow l\u1EA1i.`,
      );
    }
  }
  static async _executeGetProviderStatus(args) {
    const supported = ["flow", "chatgpt", "grok", "gemini", "muse"];
    const requested = Array.isArray(args?.providers) ? args.providers : null;
    const want = args?.provider
      ? [args.provider]
      : requested
        ? requested.filter((provider) => supported.includes(provider))
        : supported;
    const providers = [];
    for (const p of want) {
      let ready = false,
        reason = "ok";
      const requiredFeatures =
        p === "flow" ? ["gen_enabled"] : [`${p}_enabled`, `${p}_mcp_enabled`];
      const disabledFeature = window.featureGate?.canUse
        ? requiredFeatures.find(
            (key) => window.featureGate.canUse(key) === false,
          )
        : null;
      if (disabledFeature) {
        providers.push({
          provider: p,
          ready: false,
          reason: `feature_disabled:${disabledFeature}`,
          feature_enabled: false,
        });
        continue;
      }
      try {
        if (p === "chatgpt") {
          const r = await window.ChatGPTSession?.ensureReady?.({
            createIfMissing: false,
            activate: false,
          });
          ready = !!r?.ready;
          reason = ready ? "ok" : r?.error || "not_ready";
        } else if (p === "grok") {
          const r = await window.GrokSession?.ensureReady?.({
            createIfMissing: false,
            activate: false,
          });
          ready = !!r?.ready;
          reason = ready ? "ok" : r?.error || "not_ready";
        } else if (p === "gemini") {
          const r = await window.GeminiSession?.ensureReady?.({
            createIfMissing: false,
            activate: false,
          });
          ready = !!r?.ready;
          reason = ready ? "ok" : r?.error || "not_ready";
        } else if (p === "muse") {
          const r = await window.MuseSession?.ensureReady?.({
            createIfMissing: false,
            activate: false,
            silent: true,
          });
          ready = !!r?.ready;
          reason = ready ? "ok" : r?.error || "not_ready";
        } else if (p === "flow") {
          const context = await this._readFlowProjectContext();
          reason = this._flowProjectReadinessError(context) || "ok";
          ready = reason === "ok";
        } else {
          reason = "unknown_provider";
        }
      } catch (e) {
        reason = e?.message || "error";
      }
      providers.push({ provider: p, ready, reason, feature_enabled: true });
    }
    console.info("[McpExecutor] provider status:", providers);
    return { data: { providers } };
  }
  static async _executeGetCharacters() {
    if (!window.CharacterRegistry?.getRenderList) {
      throw this._err(
        "CONFIG_UNAVAILABLE",
        "Character registry ch\u01B0a s\u1EB5n s\xE0ng. Reload extension r\u1ED3i th\u1EED l\u1EA1i.",
      );
    }
    let characters = [];
    try {
      characters = await window.CharacterRegistry.getRenderList();
    } catch (error) {
      throw this._err(
        "CONFIG_UNAVAILABLE",
        `Kh\xF4ng \u0111\u1ECDc \u0111\u01B0\u1EE3c danh s\xE1ch character: ${error?.message || "unknown error"}`,
      );
    }
    return {
      data: {
        characters: (characters || []).map((item) => ({
          slug: item.slug,
          name: item.name || item.search_value || item.slug,
          search_value: item.search_value || item.name || null,
          thumbnail: item.thumbnail || item.thumbnail_url || null,
        })),
      },
    };
  }
  static async _executeDeleteChat(args) {
    const provider = args?.provider || "chatgpt";
    if (provider !== "chatgpt" && provider !== "muse") {
      throw this._err(
        "VALIDATION_ERROR",
        `delete_chat ch\u01B0a h\u1ED7 tr\u1EE3 provider "${provider}".`,
      );
    }
    const session =
      provider === "muse" ? window.MuseSession : window.ChatGPTSession;
    if (!session)
      throw this._err(
        "PROVIDER_TAB_NOT_READY",
        `Ch\u01B0a m\u1EDF tab ${provider === "muse" ? "Muse" : "ChatGPT"}.`,
      );
    const ready = await session.ensureReady({
      createIfMissing: false,
      activate: true,
      focusWindow: true,
    });
    if (!ready?.ready)
      throw this._err(
        "PROVIDER_TAB_NOT_READY",
        `${provider === "muse" ? "Muse" : "ChatGPT"} is not ready to delete chat: ${ready?.error || "open the provider tab"}.`,
      );
    const r =
      provider === "muse"
        ? await session.deleteCurrentConversation()
        : await session.deleteLastMessage();
    if (!r?.success)
      throw this._err(
        "GEN_FAILED",
        `X\xF3a conversation th\u1EA5t b\u1EA1i${r?.error ? ": " + r.error : ""}.`,
      );
    return { data: { deleted: true, provider } };
  }
  static _workflowProviders(nodes = []) {
    const providers = new Set();
    for (const node of nodes) {
      if (node?.enabled === false) continue;
      const type = node?.node_type;
      if (type === "image" || type === "generate") providers.add("flow");
      else if (type === "chatgpt")
        providers.add(node.provider === "gemini" ? "gemini" : "chatgpt");
      else if (type === "grok") providers.add("grok");
      else if (type === "gemini") providers.add("gemini");
      else if (type === "muse") providers.add("muse");
      else if (
        type === "prompt" &&
        (node.use_ai === true || node.enhance === true)
      ) {
        providers.add(
          ["chatgpt", "grok", "gemini"].includes(node.provider)
            ? node.provider
            : "chatgpt",
        );
      }
    }
    return [...providers];
  }
  static async _prepareWorkflowExecution(wfId, nodeId = null) {
    if (!wfId) throw this._err("VALIDATION_ERROR", "Thi\u1EBFu wf_id");
    let workflow = null;
    try {
      workflow = await window.storageManager?.getWorkflow?.(wfId);
    } catch (error) {
      throw this._err(
        "CONFIG_UNAVAILABLE",
        `Kh\xF4ng t\u1EA3i \u0111\u01B0\u1EE3c workflow t\u1EEB server: ${error?.message || "unknown error"}`,
      );
    }
    if (!workflow)
      throw this._err(
        "VALIDATION_ERROR",
        `Workflow "${wfId}" kh\xF4ng t\u1ED3n t\u1EA1i ho\u1EB7c ch\u01B0a \u0111\u1ED3ng b\u1ED9.`,
      );
    let selectedNodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
    if (nodeId) {
      const selected = selectedNodes.find(
        (node) => String(node.node_id) === String(nodeId),
      );
      if (!selected)
        throw this._err(
          "VALIDATION_ERROR",
          `Node "${nodeId}" kh\xF4ng t\u1ED3n t\u1EA1i trong workflow.`,
        );
      selectedNodes = [selected];
    }
    try {
      if (
        workflow.project_id &&
        !window.ProjectHelper?.checkWorkflowProjectGate
      ) {
        throw this._err(
          "CONFIG_UNAVAILABLE",
          "Project gate ch\u01B0a s\u1EB5n s\xE0ng; kh\xF4ng th\u1EC3 x\xE1c minh Flow project c\u1EE7a workflow.",
        );
      }
      if (window.ProjectHelper?.checkWorkflowProjectGate) {
        const gate =
          await window.ProjectHelper.checkWorkflowProjectGate(workflow);
        if (!gate.ok) {
          if (gate.code === "WRONG_PROJECT") {
            const where = gate.expectedName
              ? `"${gate.expectedName}" (id: ${gate.expectedProjectId})`
              : `project ${gate.expectedProjectId}`;
            throw this._err(
              "WRONG_PROJECT",
              `Workflow thu\u1ED9c ${where}. H\u1ECEI user c\xF3 mu\u1ED1n m\u1EDF project n\xE0y kh\xF4ng; n\u1EBFu \u0111\u1ED3ng \xFD g\u1ECDi open_project("${gate.expectedProjectId}") r\u1ED3i ch\u1EA1y l\u1EA1i.`,
            );
          }
          throw this._err(
            "PROVIDER_TAB_NOT_READY",
            "Project c\u1EE7a workflow \u0111ang l\u1ED7i ho\u1EB7c \u0111\xE3 x\xF3a. H\xE3y m\u1EDF/ch\u1ECDn l\u1EA1i project h\u1EE3p l\u1EC7 r\u1ED3i th\u1EED l\u1EA1i.",
          );
        }
      }
    } catch (error) {
      if (error?.code) throw error;
      throw this._err(
        "PROVIDER_TAB_NOT_READY",
        `Kh\xF4ng x\xE1c minh \u0111\u01B0\u1EE3c Flow project: ${error?.message || "unknown error"}`,
      );
    }
    try {
      await this._preflightProviders(this._workflowProviders(selectedNodes));
    } catch (error) {
      if (error?.code) throw error;
      throw this._err(
        "PROVIDER_TAB_NOT_READY",
        `Kh\xF4ng ki\u1EC3m tra \u0111\u01B0\u1EE3c provider c\u1EE7a workflow: ${error?.message || "unknown error"}`,
      );
    }
    return { workflow, selectedNodes };
  }
  static _collectNodeMedia(node) {
    const media = [];
    const seen = new Set();
    const thumbnails =
      node?.result_thumbnails && typeof node.result_thumbnails === "object"
        ? node.result_thumbnails
        : {};
    const providerUrls =
      node?.result_provider_urls &&
      typeof node.result_provider_urls === "object"
        ? node.result_provider_urls
        : {};
    const ids = new Set([
      ...Object.keys(thumbnails),
      ...Object.keys(providerUrls),
    ]);
    for (const id of ids) {
      const raw = thumbnails[id];
      const info = typeof raw === "string" ? { thumbnail: raw } : raw || {};
      const rawProvenance = providerUrls[id];
      const provenance =
        typeof rawProvenance === "string"
          ? { url: rawProvenance }
          : rawProvenance || {};
      const videoUrl =
        info.video_url || info.videoUrl || provenance.video_url || "";
      const url =
        info.thumbnail ||
        info.thumbnailUrl ||
        info.url ||
        provenance.url ||
        videoUrl;
      if (typeof url !== "string" || !/^https?:\/\//i.test(url)) continue;
      const type =
        info.type === "video" || provenance.media_type === "video" || !!videoUrl
          ? "video"
          : "image";
      const key = `${type}:${videoUrl || url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      media.push({
        url,
        type,
        tile_id: id,
        provider:
          provenance.provider ||
          (node.node_type === "generate"
            ? "flow"
            : node.node_type === "chatgpt" && node.provider === "gemini"
              ? "gemini"
              : node.node_type) ||
          null,
        tab_id: provenance.tab_id || null,
        file_name: info.file_name || node?.result_file_names?.[id] || "",
        video_url: type === "video" ? videoUrl || url : "",
      });
    }
    return media;
  }
  static async _executeWorkflowNode(args) {
    if (!window.workflowExecutor?.executeSingleNode) {
      throw this._err(
        "CONFIG_UNAVAILABLE",
        "WorkflowExecutor single-node ch\u01B0a kh\u1EDFi t\u1EA1o.",
      );
    }
    const wfId = args?.wf_id;
    const nodeId = args?.node_id;
    if (!nodeId) throw this._err("VALIDATION_ERROR", "Thi\u1EBFu node_id");
    const prepared = await this._prepareWorkflowExecution(wfId, nodeId);
    const target = prepared.selectedNodes[0];
    const executionResult = await window.workflowExecutor.executeSingleNode(
      wfId,
      nodeId,
      { manualSubmitMode: false },
    );
    const refreshed = await window.storageManager?.getWorkflow?.(wfId);
    const persistedNode =
      refreshed?.nodes?.find(
        (item) => String(item.node_id) === String(nodeId),
      ) || null;
    const liveNode = {
      ...target,
      result_thumbnails: executionResult?.thumbnails || {},
      result_file_names: executionResult?.fileNames || {},
      result_provider_urls: executionResult?.providerUrls || {},
      result_text:
        executionResult?.resultText || executionResult?.result_text || "",
    };
    const liveMedia = this._collectNodeMedia(liveNode);
    const expectedResultIds = new Set(
      [
        ...(Array.isArray(executionResult?.fileIds)
          ? executionResult.fileIds
          : []),
        ...Object.keys(executionResult?.thumbnails || {}),
        ...Object.keys(executionResult?.providerUrls || {}),
      ]
        .filter(Boolean)
        .map(String),
    );
    const persistedMedia = this._collectNodeMedia(persistedNode).filter(
      (item) => expectedResultIds.has(String(item.tile_id || "")),
    );
    const media = liveMedia.length ? liveMedia : persistedMedia;
    if (media.length) return { thumbnails: media };
    if (["generate", "chatgpt", "grok", "gemini"].includes(target.node_type)) {
      throw this._err(
        "RESULT_MEDIA_UNAVAILABLE",
        `Node "${target.node_name || nodeId}" completed but no usable media could be returned to MCP.`,
      );
    }
    const resultText = liveNode.result_text || persistedNode?.result_text || "";
    if (typeof resultText === "string" && resultText.trim()) {
      return {
        data: {
          workflow_id: wfId,
          node_id: nodeId,
          node_type: target.node_type,
          status: persistedNode?.status || "completed",
          result_text: resultText,
        },
      };
    }
    return {
      data: {
        workflow_id: wfId,
        node_id: nodeId,
        node_type: target?.node_type || null,
        status: persistedNode?.status || "completed",
      },
    };
  }
  static async _executeWorkflow(args) {
    const wfId = args.wf_id;
    if (!window.workflowExecutor)
      throw this._err(
        "GEN_FAILED",
        "WorkflowExecutor ch\u01B0a kh\u1EDFi t\u1EA1o.",
      );
    await this._prepareWorkflowExecution(wfId);
    const collected = [];
    const collectedKeys = new Set();
    const collectMedia = (id, raw, node = null) => {
      const info = typeof raw === "string" ? { thumbnail: raw } : raw || {};
      const videoUrl = info.video_url || info.videoUrl || "";
      const url = info.thumbnail || info.thumbnailUrl || info.url || videoUrl;
      if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return;
      const type = info.type === "video" || !!videoUrl ? "video" : "image";
      const key = `${type}:${videoUrl || url}`;
      if (collectedKeys.has(key)) return;
      collectedKeys.add(key);
      collected.push({
        url,
        type,
        provider: info.provider || null,
        tab_id: info.tab_id || info.tabId || null,
        tile_id: id || null,
        file_name: info.file_name || node?.result_file_names?.[id] || "",
        video_url: type === "video" ? videoUrl || url : "",
      });
    };
    const onNode = (d) => {
      if (d?.result?.thumbnails) {
        for (const [id, info] of Object.entries(d.result.thumbnails))
          collectMedia(id, info);
      }
    };
    window.eventBus?.on("node:completed", onNode);
    const previousHistorySource = window.workflowExecutor._historySource;
    window.workflowExecutor._historySource = "mcp";
    try {
      const ok = await window.workflowExecutor.execute(wfId);
      if (!ok)
        throw this._err(
          "GEN_FAILED",
          "Workflow th\u1EF1c thi th\u1EA5t b\u1EA1i.",
        );
      const wf = await window.storageManager?.getWorkflow?.(wfId);
      for (const node of wf?.nodes || []) {
        if (!["generate", "chatgpt", "grok", "gemini"].includes(node.node_type))
          continue;
        for (const item of this._collectNodeMedia(node))
          collectMedia(item.tile_id, item, node);
      }
      if (collected.length === 0) {
        const outputs = (wf?.nodes || [])
          .filter(
            (node) =>
              typeof node.result_text === "string" && node.result_text.trim(),
          )
          .map((node) => ({
            node_id: node.node_id,
            node_type: node.node_type,
            result_text: node.result_text,
          }));
        if (outputs.length) return { data: { workflow_id: wfId, outputs } };
        throw this._err(
          "GEN_FAILED",
          "Workflow ho\xE0n th\xE0nh nh\u01B0ng kh\xF4ng c\xF3 media ho\u1EB7c text output. Reset workflow r\u1ED3i ch\u1EA1y l\u1EA1i.",
        );
      }
      return { thumbnails: collected };
    } finally {
      window.eventBus?.off("node:completed", onNode);
      window.workflowExecutor._historySource = previousHistorySource;
      try {
        await window.generationHistory?._flushBuffer?.();
      } catch (error) {
        console.warn(
          "[McpExecutor] Workflow history flush failed:",
          error?.message,
        );
      }
    }
  }
  static async _sendResult(jobId, status, payload = {}, deliveryMeta = {}) {
    const body = { job_id: jobId, status, runner_id: await this._runnerId() };
    const evidence = Array.isArray(payload.thumbnails)
      ? {
          ...(payload.batch || {}),
          generated_result_count: payload.thumbnails.length,
        }
      : payload.batch;
    if (status === "completed") {
      if (payload.project) {
        body.project = payload.project;
      } else if (payload.upload) {
        body.upload = payload.upload;
      } else if (payload.data) {
        body.data = payload.data;
      } else {
        let thumbs;
        try {
          thumbs = await this._convertForMcp(
            payload.thumbnails || [],
            payload._tabId,
          );
        } catch (error) {
          return this._sendResult(
            jobId,
            "failed",
            {
              batch: { ...evidence, delivery_failed: true },
              errorCode: error?.code || "RESULT_MEDIA_UNAVAILABLE",
              errorMessage: error?.message || String(error),
            },
            deliveryMeta,
          );
        }
        if (
          ["gen_image", "gen_video", "run_workflow"].includes(
            payload._command,
          ) &&
          thumbs.length === 0
        ) {
          return this._sendResult(
            jobId,
            "failed",
            {
              batch: { ...evidence, delivery_failed: true },
              errorCode: "RESULT_MEDIA_UNAVAILABLE",
              errorMessage:
                "Provider \u0111\xE3 x\u1EED l\xFD nh\u01B0ng kh\xF4ng th\u1EC3 chuy\u1EC3n media k\u1EBFt qu\u1EA3 v\u1EC1 MCP client.",
            },
            deliveryMeta,
          );
        }
        body.thumbnails = thumbs;
        body.result_count = thumbs.length;
        if (evidence) body.batch = evidence;
        if (payload.batch)
          body.completion_state = payload.batch.failed > 0 ? "partial" : "full";
        else body.completion_state = "full";
      }
    } else {
      if (evidence) body.batch = evidence;
      if (payload.errorCode) body.error_code = payload.errorCode;
      if (payload.errorMessage)
        body.error_message = String(payload.errorMessage).slice(0, 1e3);
    }
    const delivery = await this._deliverResultBody(body);
    if (delivery.delivered) return true;
    if (!delivery.retryable) {
      if (status === "completed") {
        const failureBody = {
          job_id: jobId,
          runner_id: body.runner_id,
          status: "failed",
          batch: { ...(body.batch || {}), delivery_failed: true },
          error_code: "RESULT_DELIVERY_REJECTED",
          error_message:
            "Provider completed, but the MCP result payload was rejected by the server.",
        };
        const fallbackDelivery = await this._deliverResultBody(failureBody);
        if (!fallbackDelivery.delivered && fallbackDelivery.retryable) {
          await this._enqueueResultOutbox(failureBody, deliveryMeta);
          return false;
        }
      }
      return true;
    }
    await this._enqueueResultOutbox(body, deliveryMeta);
    return false;
  }
  static async _deliverResultBody(body) {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (!window.authManager?._apiCall)
          throw new Error("AuthManager ch\u01B0a s\u1EB5n s\xE0ng");
        await window.authManager._apiCall("POST", "mcp/result", body);
        return { delivered: true, retryable: false };
      } catch (err) {
        lastError = err;
        const status = Number(err?.httpStatus || 0);
        const retryable =
          status === 0 ||
          status === 408 ||
          status === 409 ||
          status === 429 ||
          status >= 500;
        if (!retryable)
          return { delivered: false, retryable: false, error: err };
        if (attempt < 2)
          await new Promise((r) => setTimeout(r, 750 * 2 ** attempt));
      }
    }
    console.error(
      "[McpExecutor] g\u1EEDi result th\u1EA5t b\u1EA1i sau retry:",
      lastError?.message,
    );
    return { delivered: false, retryable: true, error: lastError };
  }
  static async _enqueueResultOutbox(body, meta = {}) {
    const stored = await chrome.storage.local.get([this._RESULT_OUTBOX_KEY]);
    const items = Array.isArray(stored?.[this._RESULT_OUTBOX_KEY])
      ? stored[this._RESULT_OUTBOX_KEY]
      : [];
    const withoutSameJob = items.filter(
      (item) => item?.body?.job_id !== body.job_id,
    );
    const userId = window.authManager?.user?.id || null;
    if (!userId) return;
    withoutSameJob.push({
      body,
      meta,
      userId,
      queuedAt: Date.now(),
      attempts: 0,
    });
    await chrome.storage.local.set({
      [this._RESULT_OUTBOX_KEY]: withoutSameJob.slice(-50),
    });
    setTimeout(() => this._flushResultOutbox().catch(() => {}), 3e4);
  }
  static async _flushResultOutbox() {
    if (this._resultFlushPromise) return this._resultFlushPromise;
    this._resultFlushPromise = (async () => {
      const stored = await chrome.storage.local.get([this._RESULT_OUTBOX_KEY]);
      const items = Array.isArray(stored?.[this._RESULT_OUTBOX_KEY])
        ? stored[this._RESULT_OUTBOX_KEY]
        : [];
      if (!items.length) return;
      const currentUserId = window.authManager?.user?.id || null;
      if (!currentUserId) return;
      const remaining = [];
      for (const item of items) {
        const age = Date.now() - Number(item.queuedAt || 0);
        if (age > 864e5 || (item.attempts || 0) >= 10) continue;
        if (String(item.userId || "") !== String(currentUserId)) {
          remaining.push(item);
          continue;
        }
        const delivery = await this._deliverResultBody(item.body);
        if (!delivery.delivered) {
          if (delivery.retryable) {
            remaining.push({ ...item, attempts: (item.attempts || 0) + 1 });
            continue;
          }
          if (item.body?.status === "completed") {
            const failureBody = {
              job_id: item.body.job_id,
              status: "failed",
              error_code: "RESULT_DELIVERY_REJECTED",
              runner_id: item.body.runner_id,
              batch: { ...(item.body.batch || {}), delivery_failed: true },
              error_message:
                "Provider completed, but the queued MCP result payload was rejected by the server.",
            };
            const fallbackDelivery = await this._deliverResultBody(failureBody);
            if (!fallbackDelivery.delivered && fallbackDelivery.retryable) {
              remaining.push({
                ...item,
                body: failureBody,
                attempts: (item.attempts || 0) + 1,
              });
              continue;
            }
          }
          await this._completeOutboxExecution(item);
          continue;
        }
        await this._completeOutboxExecution(item);
      }
      if (remaining.length)
        await chrome.storage.local.set({
          [this._RESULT_OUTBOX_KEY]: remaining,
        });
      else await chrome.storage.local.remove(this._RESULT_OUTBOX_KEY);
    })().finally(() => {
      this._resultFlushPromise = null;
    });
    return this._resultFlushPromise;
  }
  static async _completeOutboxExecution(item) {
    const token = item?.meta?.executionToken;
    if (!token || !window.ExecutionGate) return;
    const allowed = new Set(["success", "partial", "failed"]);
    const outcome = allowed.has(item.meta?.executionOutcome)
      ? item.meta.executionOutcome
      : "failed";
    const resultData =
      item.meta?.executionResultData &&
      typeof item.meta.executionResultData === "object"
        ? item.meta.executionResultData
        : outcome === "failed"
          ? { error: "mcp_result_delayed" }
          : {};
    try {
      await ExecutionGate.complete(token, outcome, resultData);
    } catch (_) {}
  }
  static async _convertForMcp(thumbnails, tabId) {
    const out = [];
    let inlineBytes = 0;
    for (const t of thumbnails) {
      try {
        const type = t.type || "image";
        if (type === "video") {
          const vurl = t.video_url || t.url;
          let blob = null;
          try {
            if (t.base64)
              blob = await (
                await fetch(
                  String(t.base64).startsWith("data:")
                    ? t.base64
                    : `data:${t.mime_type || "video/mp4"};base64,${t.base64}`,
                )
              ).blob();
            else if (vurl) {
              const r = await this._fetchTO(vurl, {}, 3e4);
              if (r?.ok) blob = await r.blob();
            }
          } catch (_) {}
          let finalUrl = vurl || "";
          let videoStoredInR2 = false;
          let poster = null;
          if (blob) {
            if (window.DownloadHelper?.cleanMediaBlob) {
              const cl = await window.DownloadHelper.cleanMediaBlob(
                blob,
                "video",
              );
              blob = cl.blob || blob;
              if (
                !cl.cleaned &&
                cl.reason &&
                cl.reason !== "DISABLED" &&
                !cl.noWatermark
              ) {
                console.warn("[MCP] video watermark unchanged:", cl.reason);
              }
            }
            const r2 = await this._uploadMediaToR2(blob);
            if (r2) {
              finalUrl = r2;
              videoStoredInR2 = true;
            } else if (window.WatermarkClient?.enabled?.("video") === true) {
              console.warn(
                "[MCP] Video could not be stored in R2; returning the original provider URL.",
              );
            }
            poster = await this._videoPoster(blob);
            if (poster && window.WatermarkClient) {
              const cl = await window.WatermarkClient.cleanBase64(
                poster,
                "image/png",
                "video",
              );
              if (cl.cleaned) poster = cl.base64;
            }
          }
          if (finalUrl || poster) {
            const v = {
              type: "video",
              provider: t.provider || null,
              tile_id: t.tile_id || null,
              video_url: finalUrl,
              file_name: t.file_name || "",
              storage: videoStoredInR2 ? "r2" : "provider",
              downloadable: videoStoredInR2,
            };
            if (poster) {
              v.poster = poster;
              inlineBytes += poster.length;
            }
            out.push(v);
          }
          continue;
        }
        let base64 = t.base64 || null;
        if (!base64 && t.url) {
          base64 = await this._fetchImageAsBase64(t.url, t.tab_id || tabId);
        }
        let mime = t.mime_type || "image/png";
        const dataUrl =
          typeof base64 === "string" &&
          /^data:([^;,]+);base64,([\s\S]+)$/.exec(base64);
        if (dataUrl) {
          mime = dataUrl[1];
          base64 = dataUrl[2];
        }
        let cleaned = false;
        if (base64 && window.WatermarkClient) {
          const cl = await window.WatermarkClient.cleanBase64(
            base64,
            mime,
            "image",
          );
          if (cl.cleaned) {
            base64 = cl.base64;
            mime = cl.mime || mime;
            cleaned = true;
          }
        }
        let storedUrl = null;
        if (base64) {
          try {
            const blob = await (
              await fetch(`data:${mime};base64,${base64}`)
            ).blob();
            storedUrl = await this._uploadMediaToR2(blob);
            if (storedUrl) base64 = null;
          } catch (_) {}
        }
        const item = {
          type: "image",
          provider: t.provider || null,
          tile_id: t.tile_id || null,
          file_name: t.file_name || "",
        };
        if (storedUrl) {
          item.url = storedUrl;
          item.storage = "r2";
          item.downloadable = true;
        } else if (t.url && /^https?:\/\//i.test(t.url) && !cleaned) {
          item.url = t.url;
          item.storage = "provider";
          item.downloadable = false;
        }
        if (base64) {
          item.base64 = base64;
          item.mime_type = mime;
          item.storage = "inline";
          item.downloadable = true;
          inlineBytes += base64.length;
        }
        if (item.url || item.base64) out.push(item);
      } catch (e) {
        console.warn("[McpExecutor] convert thumb l\u1ED7i:", e?.message);
      }
    }
    if (inlineBytes > 2e7) {
      throw this._err(
        "CONFIG_UNAVAILABLE",
        "MCP media exceeds the inline result limit and object storage is unavailable. Configure R2 and retry.",
      );
    }
    return out;
  }
  static async _fetchImageAsBase64(url, tabId) {
    try {
      if (window.MessageBridge?.chatGPTFetchImage && tabId) {
        const r = await window.MessageBridge.chatGPTFetchImage(url, tabId);
        if (r?.success && r?.base64) return r.base64;
      }
      const resp = await fetch(url);
      if (!resp.ok) return null;
      return await this._blobToBase64(await resp.blob());
    } catch (_) {
      return null;
    }
  }
  static async _uploadMediaToR2(blob) {
    try {
      const ct = blob.type || "video/mp4";
      const ext = ct.includes("webm")
        ? "webm"
        : ct.includes("jpeg")
          ? "jpg"
          : ct.includes("png")
            ? "png"
            : ct.includes("webp")
              ? "webp"
              : "mp4";
      const resp = await window.authManager?._apiCall(
        "POST",
        "mcp/media/upload-url",
        { ext, content_type: ct },
      );
      const p = resp && resp.enabled !== void 0 ? resp : resp?.data || {};
      if (!p?.enabled || !p.upload_url) return null;
      const put = await this._fetchTO(
        p.upload_url,
        {
          method: "PUT",
          body: blob,
          headers: { "Content-Type": ct, ...(p.headers || {}) },
        },
        6e4,
      );
      if (!put?.ok) {
        console.warn("[McpExecutor] R2 PUT fail", put?.status);
        return null;
      }
      return p.public_url || null;
    } catch (e) {
      console.warn("[McpExecutor] R2 upload l\u1ED7i:", e?.message);
      return null;
    }
  }
  static async _fetchTO(url, opts, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { ...opts, signal: ctrl.signal });
    } catch (_) {
      return null;
    } finally {
      clearTimeout(t);
    }
  }
  static _videoPoster(blob) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => {
        if (!done) {
          done = true;
          resolve(v);
        }
      };
      try {
        const url = URL.createObjectURL(blob);
        const cleanup = () => {
          try {
            URL.revokeObjectURL(url);
          } catch (_) {}
        };
        const video = document.createElement("video");
        video.muted = true;
        video.preload = "metadata";
        video.playsInline = true;
        video.src = url;
        video.onloadeddata = () => {
          try {
            video.currentTime = Math.min(0.1, video.duration || 0.1);
          } catch (_) {
            cleanup();
            finish(null);
          }
        };
        video.onseeked = () => {
          try {
            const c = document.createElement("canvas");
            const width = video.videoWidth || 360,
              height = video.videoHeight || 640;
            const scale = Math.min(1, 512 / Math.max(width, height));
            c.width = Math.max(1, Math.round(width * scale));
            c.height = Math.max(1, Math.round(height * scale));
            c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
            finish(c.toDataURL("image/png").split(",")[1] || null);
          } catch (_) {
            finish(null);
          }
          cleanup();
        };
        video.onerror = () => {
          cleanup();
          finish(null);
        };
        setTimeout(() => {
          cleanup();
          finish(null);
        }, 8e3);
      } catch (_) {
        finish(null);
      }
    });
  }
  static _blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  static async _handleCancel(data) {
    if (!this._isLeaderContext()) return;
    if (!data?.runner_id || data.runner_id !== (await this._runnerId())) return;
    const cancelAll = data?.all === true;
    if (
      this._currentJobId &&
      (cancelAll || data?.job_id === this._currentJobId)
    ) {
      this._cancelRequested = true;
      this._wasStopped = true;
      if (this._currentProvider === "muse")
        window.MuseSession?.abort?.().catch(() => {});
      if (window.ExecutionLock?.stopCurrent) window.ExecutionLock.stopCurrent();
      window.eventBus?.emit("queue:stop_all", {
        stopOrigin: "user",
        stopReason: "USER_CANCELLED",
      });
    }
  }
  static async _getMcpDownloadSettings() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(["af_settings"], (res) => {
          const s = res?.af_settings || {};
          const on =
            s.mcpAutoDownload === true ||
            s.mcpAutoDownload === "1" ||
            s.mcpAutoDownload === 1;
          const canDl = window.featureGate
            ? window.featureGate.canUse("auto_download")
            : true;
          resolve({
            autoDownload: on && canDl,
            downloadResolution: s.mcpDownloadResolution || "1k",
            videoDownloadResolution: s.mcpVideoDownloadResolution || "720p",
            downloadFolder: s.mcpDownloadFolder || "tobyflow_mcp",
          });
        });
      } catch (_) {
        resolve({
          autoDownload: false,
          downloadResolution: "1k",
          videoDownloadResolution: "720p",
          downloadFolder: "tobyflow_mcp",
        });
      }
    });
  }
  static _err(code, message) {
    const e = new Error(message);
    e.code = code;
    return e;
  }
  static _quotaCompletion(result, stopped = false) {
    const thumbnails = Array.isArray(result?.thumbnails)
      ? result.thumbnails.length
      : 0;
    const batchFailed = Math.max(0, Number(result?.batch?.failed || 0));
    const batchSucceeded = Math.max(0, Number(result?.batch?.succeeded || 0));
    const successfulCount = thumbnails || batchSucceeded;
    if (successfulCount > 0 && (stopped || batchFailed > 0)) {
      return {
        status: "partial",
        resultData: {
          successful_count: successfulCount,
          ...(batchFailed > 0 ? { failed_count: batchFailed } : {}),
        },
      };
    }
    if (
      stopped ||
      (result?.batch && successfulCount === 0 && batchFailed > 0)
    ) {
      return {
        status: "failed",
        resultData: { error: stopped ? "cancelled" : "mcp_generation_failed" },
      };
    }
    return { status: "success", resultData: {} };
  }
  static _buildBatch(total, failedList, completed) {
    const failed = Array.isArray(failedList) ? failedList : [];
    if (total <= 1 && failed.length === 0) return null;
    return {
      succeeded:
        typeof completed === "number"
          ? completed
          : Math.max(0, total - failed.length),
      failed: failed.length,
      failed_prompts: failed.map((f) => ({
        index: typeof f.index === "number" ? f.index : null,
        prompt: String(f.prompt || "").slice(0, 500),
        error: String(f.error || "").slice(0, 300),
      })),
    };
  }
  static async _executeClearFlowCookies(args = {}) {
    if (
      args.confirm !== true ||
      typeof args.project_id !== "string" ||
      !args.project_id.trim() ||
      (args.provider && args.provider !== "flow")
    ) {
      throw this._err(
        "VALIDATION_ERROR",
        "Provide the current Flow project_id and confirm: true after user consent.",
      );
    }
    if (window.FlowApiAdapter?.isApiModeIntended?.() !== true) {
      throw this._err("FLOW_API_NOT_ACTIVE", "Flow API mode must be active.");
    }
    if (!(await window.BridgeClient?.supportsFlowCookieRecovery?.(true))) {
      throw this._err(
        "BRIDGE_COOKIE_RECOVERY_UNAVAILABLE",
        "TobyBridge >= 1.3.33 with Flow cookie/cache recovery is required.",
      );
    }
    const target = await window.MessageBridge?.getTargetContext?.();
    if (
      !Number.isInteger(target?.tabId) ||
      target.driverKey !== "flow_v2" ||
      target.projectId !== args.project_id
    ) {
      throw this._err(
        "COOKIE_RECOVERY_PROJECT_MISMATCH",
        "The current Flow project does not match project_id.",
      );
    }
    const queue = window.PromptQueue?.getInstance?.();
    if (
      !queue?.clearFlowCookiesForTest ||
      !window.FlowCookieRecovery?._withLoading
    ) {
      throw this._err("CONFIG_NOT_READY", "Flow cookie recovery is not ready.");
    }
    const result = await window.FlowCookieRecovery._withLoading(() =>
      queue.clearFlowCookiesForTest(target),
    );
    if (result?.ok !== true) {
      throw this._err(
        result?.error || "COOKIE_RECOVERY_FAILED",
        "Could not finish Flow cookie recovery. Generation data is retained; do not automatically retry.",
      );
    }
    return {
      data: {
        project_id: target.projectId,
        cookies_cleared: true,
        cache_cleared: true,
        reloaded: true,
        auto_resumed: false,
      },
    };
  }
  static _mapCommandToAction(command, provider) {
    if (command === "gen_image" || command === "gen_video") {
      return provider === "grok"
        ? "grok_run"
        : provider === "chatgpt"
          ? "chatgpt_run"
          : provider === "gemini"
            ? "gemini_run"
            : provider === "muse"
              ? "muse_run"
              : provider === "flow"
                ? "generate"
                : null;
    }
    return null;
  }
  static async _resolveReuseRefs(reuseRefs, refFileNames = {}) {
    const out = [];
    let boardReloadAttempted = false;
    let boardReloaded = false;
    for (const r of Array.isArray(reuseRefs) ? reuseRefs : []) {
      if (!r || typeof r !== "object") {
        throw this._err(
          "VALIDATION_ERROR",
          "reuse_refs entries must be objects.",
        );
      }
      const provider = r.provider || "flow";
      try {
        if (provider === "flow") {
          const tid = (r.tile_id || "").toString().trim();
          if (!tid)
            throw this._err(
              "VALIDATION_ERROR",
              "Flow reuse_ref requires tile_id.",
            );
          let id = tid;
          if (window.resolveFileIdsString) {
            const fnMap = r.file_name ? { [tid]: r.file_name } : {};
            const thMap = r.url ? { [tid]: r.url } : {};
            const resolved = await window.resolveFileIdsString(
              tid,
              thMap,
              fnMap,
            );
            id = (resolved || tid).split(",")[0].trim() || tid;
          }
          if (r.file_name && window.MessageBridge?.checkFilesExist) {
            let chk = null;
            try {
              chk = await window.MessageBridge.checkFilesExist([r.file_name]);
            } catch (_) {}
            if (
              chk &&
              Array.isArray(chk.missing) &&
              chk.missing.includes(r.file_name)
            ) {
              if (!boardReloadAttempted) {
                boardReloadAttempted = true;
                try {
                  const queue = window.PromptQueue?.getInstance?.();
                  boardReloaded = !!(await queue?.forceReloadAndStabilize?.(
                    "mcp-reuse-ref-refresh",
                    { bypassSuppress: true, scope: "mcp" },
                  ));
                } catch (error) {
                  console.warn(
                    "[McpExecutor] Could not refresh Flow board for reuse_refs:",
                    error?.message || error,
                  );
                }
              }
              if (!boardReloaded) {
                throw this._err(
                  "REF_FETCH_FAILED",
                  `Ch\u01B0a th\u1EC3 \u0111\u1ED3ng b\u1ED9 \u1EA3nh "${r.file_name}" v\u1EDBi Flow project \u0111ang m\u1EDF (Flow \u0111ang b\u1EADn ho\u1EB7c reload th\u1EA5t b\u1EA1i). Th\u1EED l\u1EA1i khi c\xE1c l\u01B0\u1EE3t gen hi\u1EC7n t\u1EA1i ho\xE0n t\u1EA5t.`,
                );
              }
              let foundId = null;
              try {
                const scan = await window.MessageBridge.sendToContentScript?.(
                  "ensureFlowTilesLoaded",
                  { force: true, targetFileNames: [r.file_name] },
                );
                foundId = scan?.found?.[r.file_name] || null;
              } catch (_) {}
              if (!foundId) {
                try {
                  chk = await window.MessageBridge.checkFilesExist([
                    r.file_name,
                  ]);
                  foundId = chk?.found?.[r.file_name] || null;
                } catch (_) {}
              }
              if (!foundId) {
                throw this._err(
                  "REF_FETCH_FAILED",
                  `\u1EA2nh "${r.file_name}" kh\xF4ng c\xF3 trong Flow project \u0111ang m\u1EDF sau khi n\u1EA1p l\u1EA1i (\u0111\u1ED5i project ho\u1EB7c \u0111\xE3 x\xF3a?). M\u1EDF \u0111\xFAng project ch\u1EE9a \u1EA3nh r\u1ED3i th\u1EED l\u1EA1i.`,
                );
              }
              id = foundId;
            } else if (chk?.found?.[r.file_name]) {
              id = chk.found[r.file_name];
            }
          }
          if (id) {
            out.push(id);
            if (r.file_name) refFileNames[id] = r.file_name;
          }
        } else if (provider === "chatgpt" || provider === "grok") {
          if (!r.url)
            throw this._err(
              "REF_FETCH_FAILED",
              `reuse_ref ${provider} thi\u1EBFu url \u0111\u1EC3 bridge sang Flow.`,
            );
          const CDN =
            provider === "chatgpt"
              ? /(^|\.)chatgpt\.com$|(^|\.)oaiusercontent\.com$/i
              : /(^|\.)grok\.com$|(^|\.)x\.ai$/i;
          let host = "";
          try {
            host = new URL(r.url).hostname;
          } catch (_) {}
          if (!host || !CDN.test(host))
            throw this._err(
              "REF_FETCH_FAILED",
              `reuse_ref url ph\u1EA3i l\xE0 CDN ${provider} (host nh\u1EADn: ${host || "invalid"}). Ch\u1EC9 d\xF9ng url \u1EA3nh K\u1EBET QU\u1EA2 t\u1EEB ${provider}.`,
            );
          const session =
            provider === "chatgpt" ? window.ChatGPTSession : window.GrokSession;
          const ready = await session?.ensureReady?.({
            createIfMissing: false,
            activate: false,
          });
          if (!ready?.ready)
            throw this._err(
              "PROVIDER_TAB_NOT_READY",
              `Tab ${provider} ch\u01B0a s\u1EB5n s\xE0ng \u0111\u1EC3 l\u1EA5y \u1EA3nh bridge sang Flow (m\u1EDF + \u0111\u0103ng nh\u1EADp ${provider}).`,
            );
          const fetchFn =
            provider === "chatgpt"
              ? window.MessageBridge?.chatGPTFetchImage
              : window.MessageBridge?.grokFetchImage;
          const fr = await fetchFn?.(r.url, ready.tabId);
          if (!fr?.success || !fr.base64)
            throw this._err(
              "REF_FETCH_FAILED",
              `Could not fetch the ${provider} image from url (${fr?.error || "error"}) to bridge to Flow.`,
            );
          const up = await this._uploadRefToFlow(fr.base64);
          if (up?.tileId) {
            out.push(up.tileId);
            if (up.fileName) refFileNames[up.tileId] = up.fileName;
          }
        } else {
          throw this._err(
            "VALIDATION_ERROR",
            `reuse_ref provider is unsupported: ${provider}`,
          );
        }
      } catch (e) {
        if (e?.code) throw e;
        throw this._err(
          "REF_FETCH_FAILED",
          `reuse_ref (${provider}) l\u1ED7i: ${e?.message || e}`,
        );
      }
    }
    return out;
  }
  static async _resolveRefsToImages(refs, maxRefs = 4) {
    if (!Array.isArray(refs) || !refs.length) return [];
    if (!Number.isInteger(maxRefs) || maxRefs < 1) {
      throw this._err(
        "VALIDATION_ERROR",
        "Reference image limit is unavailable for this provider.",
      );
    }
    const out = [];
    for (let i = 0; i < Math.min(refs.length, maxRefs); i++) {
      const ref = refs[i];
      if (typeof ref !== "string" || !ref) continue;
      let parts = null;
      if (/^https?:\/\//i.test(ref)) {
        try {
          const resp = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
              { action: "fetchBlob", url: ref, expectImage: true },
              (r) => {
                if (chrome.runtime.lastError)
                  reject(new Error(chrome.runtime.lastError.message));
                else resolve(r);
              },
            );
          });
          if (!resp?.success || !resp.base64) {
            throw this._err(
              "REF_FETCH_FAILED",
              `Could not download ref image from URL: ${ref} (${resp?.error || "unknown error"}). Use a public URL that opens directly (no login/cookie required).`,
            );
          }
          parts = this._inlineImageParts(resp.base64, resp.contentType, i);
        } catch (e) {
          if (e?.code) throw e;
          throw this._err(
            "REF_FETCH_FAILED",
            `L\u1ED7i t\u1EA3i ref URL ${ref}: ${e?.message || e}`,
          );
        }
      } else {
        parts = this._inlineImageParts(ref, null, i);
      }
      if (parts?.base64)
        out.push({ base64: parts.base64, name: parts.name, type: parts.mime });
    }
    return out;
  }
  static _historyModel(provider, model, isVideo = false) {
    const m = (model || "").trim();
    if (m) return m;
    if (provider === "grok") return "grok";
    if (provider === "chatgpt") {
      return (
        window.storageSettings?.getSettings?.()?.chatgptModel ||
        window.ModelRegistry?.safeGetDefault?.("chatgpt", "image") ||
        null
      );
    }
    if (provider === "gemini")
      return (
        window.ModelRegistry?.safeGetDefault?.(
          "gemini",
          isVideo ? "video" : "image",
        ) || ""
      );
    if (provider === "muse")
      return (
        window.ModelRegistry?.safeGetDefault?.(
          "muse",
          isVideo ? "video" : "image",
        ) || ""
      );
    return (
      window.ModelRegistry?.safeGetDefault?.(
        "flow",
        isVideo ? "video" : "image",
      ) || ""
    );
  }
  static async _saveGenHistory({
    promptList,
    mediaType,
    model,
    ratio,
    quantity,
    refFileIds,
    refThumbnails = {},
    thumbs,
    resultFileIds,
    provider,
    status,
    stopOrigin = null,
    errorReason,
    failedPrompts = [],
    errorDetails = [],
    flowApiVersions = [],
    durationMs = null,
  }) {
    try {
      if (!window.generationHistory?.saveRecord) return;
      const result_thumbnails = (thumbs || []).map((t) => ({
        thumbnail: t.url || "",
        file_name: t.file_name || "",
        type: t.type || "image",
        video_url: t.video_url || "",
      }));
      await window.generationHistory.saveRecord({
        prompt: (promptList || []).join("\n\n"),
        media_type: mediaType || "image",
        model: model || "",
        ratio: ratio || "",
        prompt_count: (promptList || []).length || 1,
        quantity: quantity || 1,
        ref_file_ids: (refFileIds || []).filter(Boolean).join(", "),
        ref_thumbnails: refThumbnails,
        result_file_ids: (resultFileIds || []).filter(Boolean).join(", "),
        result_thumbnails,
        source: "mcp",
        source_id: this._currentJobId || "",
        status: status || (failedPrompts.length ? "partial" : "success"),
        stop_origin:
          status === "stopped" && stopOrigin === "user" ? "user" : null,
        error_reason:
          errorReason ||
          [
            ...new Set(failedPrompts.map((item) => item.error).filter(Boolean)),
          ].join(" \xB7 ") ||
          null,
        error_details: errorDetails,
        duration_ms: Number.isFinite(durationMs)
          ? durationMs
          : this._currentGenerationStartedAt
            ? Math.max(0, Date.now() - this._currentGenerationStartedAt)
            : null,
        flow_api_versions: flowApiVersions,
        provider: provider || "flow",
        project_id: window._currentProjectId || null,
        auto_download: false,
      });
      await window.generationHistory._flushBuffer?.();
    } catch (e) {
      console.warn(
        "[McpExecutor] _saveGenHistory l\u1ED7i (b\u1ECF qua, kh\xF4ng fail gen):",
        e?.message,
      );
    }
  }
  static _collectThumbs(resultThumbnails) {
    const thumbs = [];
    if (resultThumbnails) {
      for (const [tileId, info] of Object.entries(resultThumbnails)) {
        if (info.thumbnail || info.video_url) {
          thumbs.push({
            url: info.thumbnail || "",
            file_name: info.file_name || "",
            type: info.type || "image",
            video_url: info.video_url || "",
            tile_id: tileId,
          });
        }
      }
    }
    return thumbs;
  }
  static _reverseRatioMap(uiMap) {
    if (!uiMap || typeof uiMap !== "object") return {};
    const r = {};
    for (const [k, v] of Object.entries(uiMap)) r[v] = k;
    return r;
  }
  static async _resolveFlowRatio(ratio, isVideo = false) {
    const mode = isVideo ? "video" : "image";
    let configured;
    try {
      configured = await window.ProviderConfigManager?.getRatios?.(
        "flow",
        mode,
      );
    } catch (_) {
      configured = null;
    }
    const valid = (Array.isArray(configured) ? configured : [])
      .map((item) => (typeof item === "string" ? item : item?.value))
      .filter((value) => typeof value === "string" && value.trim())
      .map((value) => value.trim());
    if (!valid.length) {
      throw this._err(
        "CONFIG_UNAVAILABLE",
        `Flow ${mode} ratios are unavailable from server config.`,
      );
    }
    if (ratio != null && String(ratio).trim()) {
      const requested = String(ratio).trim().toLowerCase();
      const matched = valid.find((value) => value.toLowerCase() === requested);
      if (!matched) {
        throw this._err(
          "VALIDATION_ERROR",
          `Ratio "${String(ratio).trim()}" is invalid for Flow ${mode}.`,
        );
      }
      return matched;
    }
    const settings = window.storageSettings?.getSettings?.() || {};
    const preferred = isVideo
      ? settings.defaultVideoRatio
      : settings.defaultImageRatio;
    return (
      [preferred, settings.aspectRatio]
        .map((value) => valid.find((candidate) => candidate === value))
        .find(Boolean) || valid[0]
    );
  }
  static _mapRatioToChatGPT(ratio) {
    return this._mapRatioToProvider("chatgpt", ratio, "chatgptDefaultRatio");
  }
  static _mapRatioToGrok(ratio) {
    return this._mapRatioToProvider("grok", ratio, "grokDefaultRatio");
  }
  static _mapRatioToProvider(provider, ratio, settingKey) {
    let uiMap = null;
    try {
      uiMap = window.ProviderConfigManager?.getRatioUiMapSync?.(provider);
    } catch (_) {
      uiMap = null;
    }
    if (
      !uiMap ||
      typeof uiMap !== "object" ||
      Object.keys(uiMap).length === 0
    ) {
      throw this._err(
        "CONFIG_UNAVAILABLE",
        `${provider} ratio UI mapping is unavailable from server config.`,
      );
    }
    const configuredDefault =
      window.storageSettings?.getSettings?.()?.[settingKey];
    const requested = String(ratio || configuredDefault || "")
      .trim()
      .toLowerCase();
    if (!requested) {
      throw this._err(
        "CONFIG_UNAVAILABLE",
        `${provider} default ratio is unavailable from server-backed user settings.`,
      );
    }
    if (Object.prototype.hasOwnProperty.call(uiMap, requested))
      return requested;
    const valueToUi = this._reverseRatioMap(uiMap);
    if (valueToUi[requested]) return valueToUi[requested];
    throw this._err(
      "VALIDATION_ERROR",
      `Ratio "${requested}" is invalid for ${provider}.`,
    );
  }
}
__publicField(McpExecutor, "_currentJobId", null);
__publicField(McpExecutor, "_isExecuting", false);
__publicField(McpExecutor, "_cancelRequested", false);
__publicField(McpExecutor, "_wasStopped", false);
__publicField(McpExecutor, "_currentProvider", null);
__publicField(McpExecutor, "_initialized", false);
__publicField(McpExecutor, "_currentExecutionToken", null);
__publicField(McpExecutor, "_RESULT_OUTBOX_KEY", "af_mcp_result_outbox");
__publicField(McpExecutor, "_resultFlushPromise", null);
__publicField(McpExecutor, "_executorHeartbeatTimer", null);
__publicField(McpExecutor, "_activeHeartbeatTimer", null);
__publicField(McpExecutor, "_readyHeartbeatPromise", null);
__publicField(McpExecutor, "_heartbeatFailed", false);
__publicField(McpExecutor, "_RUNNER_ID_KEY", "toby_mcp_runner_id");
__publicField(McpExecutor, "_RUNNER_OWNER_KEY", "toby_mcp_runner_owner");
__publicField(McpExecutor, "_runnerIdPromise", null);
__publicField(McpExecutor, "_runnerOwnerId", null);
window.McpExecutor = McpExecutor;
