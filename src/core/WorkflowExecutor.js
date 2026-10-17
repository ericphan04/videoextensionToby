(function () {
  "use strict";
  function isPortableUploadId(id) {
    return (
      typeof id === "string" &&
      /^upload_(?:import|admin_clone|shared_clone)_/.test(id)
    );
  }
  function isFlowV2AsbIdentity(value) {
    const identity = String(value || "").trim();
    return (
      /^[A-Za-z0-9_-]{32,1024}$/.test(identity) &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        identity,
      )
    );
  }
  const DEBUG = false;
  function log(...args) {
    if (DEBUG) console.log("[WorkflowExecutor]", ...args);
  }
  function isLastFramePort(portName) {
    return (
      portName === "frame" ||
      portName === "last_frame" ||
      portName === "frame_out"
    );
  }
  function extractFileNameFromUrl(url) {
    const _pat = window._getMediaUrlPattern?.() || "getMediaUrlRedirect";
    if (!url || !url.includes(_pat)) return "";
    try {
      const urlObj = new URL(url, "https://aitestkitchen.withgoogle.com");
      const name = urlObj.searchParams.get("name");
      if (name && /^[a-f0-9-]{8,}$/i.test(name)) return name;
      const input = urlObj.searchParams.get("input");
      if (input) {
        const parsed = JSON.parse(decodeURIComponent(input));
        const json = parsed?.json || parsed?.["0"]?.json || parsed;
        if (json?.name && /^[a-f0-9-]{8,}$/i.test(json.name)) return json.name;
      }
    } catch (e) {}
    return "";
  }
  function preserveFlowApiRefIdentity(sourceNode, corrections) {
    const isUuid = (value) =>
      typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value,
      );
    for (const [oldId, newId] of Object.entries(corrections)) {
      if (!isUuid(oldId) || !isFlowV2AsbIdentity(newId)) continue;
      for (const key of [
        "ref_thumbnails",
        "result_thumbnails",
        "result_provider_urls",
      ]) {
        const map = sourceNode[key];
        if (
          !map ||
          typeof map !== "object" ||
          Array.isArray(map) ||
          !map[oldId]
        )
          continue;
        const value = map[oldId];
        const record = typeof value === "string" ? { thumbnail: value } : value;
        if (!record || typeof record !== "object" || Array.isArray(record))
          continue;
        map[oldId] = {
          ...record,
          media_uuid: isUuid(record.media_uuid) ? record.media_uuid : oldId,
          identity_aliases: [
            ...new Set([
              ...(Array.isArray(record.identity_aliases)
                ? record.identity_aliases
                : []),
              oldId,
              newId,
            ]),
          ],
        };
      }
    }
  }
  function getThumbCache() {
    if (window.tileCache instanceof Map) return window.tileCache;
    return window.workflowEditor?._tileCache || null;
  }
  function broadcastEvent(event, data) {
    try {
      const workflowId =
        data?.workflowId ||
        data?.wf_id ||
        data?.workflow?.wf_id ||
        window.workflowExecutor?.currentWorkflow?.wf_id ||
        null;
      const relayData =
        workflowId && !data?.workflowId
          ? { ...(data || {}), workflowId }
          : data || {};
      chrome.runtime
        .sendMessage({
          action: "workflowExecutionEvent",
          event,
          data: JSON.parse(JSON.stringify(relayData)),
        })
        .catch(() => {});
    } catch (e) {}
  }
  function emitNodePhase(nodeId, phase) {
    if (!nodeId || !phase) return;
    try {
      window.eventBus?.emit("node:phase", { nodeId, phase });
      broadcastEvent("node:phase", { nodeId, phase });
    } catch (e) {}
  }
  const HEARTBEAT_INTERVAL_MS = 60 * 1e3;
  const HEARTBEAT_TTL_MS = 5 * 60 * 1e3;
  async function readRunningFlag() {
    return mutateRunningFlag(readRunningFlagUnlocked);
  }
  async function readRunningFlagUnlocked() {
    try {
      const data = await new Promise((resolve) => {
        chrome.storage.local.get(["af_running_workflow"], (r) => resolve(r));
      });
      const flag = data.af_running_workflow;
      if (!flag?.wf_id) return null;
      const lastBeat = flag.last_heartbeat_at || flag.started_at;
      let ownerGone = false;
      if (flag.owner_document_id && chrome.runtime?.getContexts) {
        try {
          const contexts = await chrome.runtime.getContexts({
            documentIds: [flag.owner_document_id],
          });
          ownerGone = contexts.length === 0;
        } catch (_) {}
      }
      if (ownerGone || (lastBeat && Date.now() - lastBeat > HEARTBEAT_TTL_MS)) {
        try {
          await new Promise((resolve) =>
            chrome.storage.local.remove("af_running_workflow", resolve),
          );
        } catch (e) {}
        console.warn(
          "[WorkflowExecutor] Auto-cleared stale af_running_workflow:",
          flag.wf_id,
          "last heartbeat age(ms):",
          Date.now() - lastBeat,
          "ownerDocumentGone:",
          ownerGone,
        );
        return null;
      }
      return flag;
    } catch (e) {
      return null;
    }
  }
  async function claimRunningFlag(wfId, wfName, ctx) {
    const runId = crypto.randomUUID();
    const doClaim = async () => {
      const existing = await readRunningFlagUnlocked();
      if (existing?.wf_id) {
        return {
          ok: false,
          runningWfName: existing.wf_name || "Workflow",
          runningWfId: existing.wf_id,
          reason: "existing_live_owner",
        };
      }
      const now = Date.now();
      let ownerDocumentId = null;
      try {
        ownerDocumentId =
          (
            await chrome.runtime.sendMessage({
              action: "workflowOwnerDocument",
            })
          )?.documentId || null;
      } catch (_) {}
      await new Promise((resolve) => {
        chrome.storage.local.set(
          {
            af_running_workflow: {
              wf_id: wfId,
              wf_name: wfName || "Workflow",
              started_at: now,
              last_heartbeat_at: now,
              executor_context: ctx,
              owner_document_id: ownerDocumentId,
              run_id: runId,
            },
          },
          resolve,
        );
      });
      return { ok: true, runId };
    };
    if (typeof navigator !== "undefined" && navigator.locks?.request) {
      try {
        return await navigator.locks.request(
          "af_running_workflow_claim",
          { mode: "exclusive" },
          doClaim,
        );
      } catch (e) {
        console.warn(
          "[WorkflowExecutor] Web Locks API failed, fallback to TOCTOU pattern:",
          e.message,
        );
      }
    }
    return await doClaim();
  }
  function mutateRunningFlag(operation) {
    if (typeof navigator !== "undefined" && navigator.locks?.request) {
      return navigator.locks.request(
        "af_running_workflow_claim",
        { mode: "exclusive" },
        operation,
      );
    }
    return operation();
  }
  async function pulseHeartbeat(wfId, runId = null) {
    return mutateRunningFlag(() => pulseHeartbeatUnlocked(wfId, runId));
  }
  async function pulseHeartbeatUnlocked(wfId, runId = null) {
    try {
      const data = await new Promise((resolve) => {
        chrome.storage.local.get(["af_running_workflow"], (r) => resolve(r));
      });
      const flag = data.af_running_workflow;
      if (!flag || flag.wf_id !== wfId) return;
      if (flag.run_id && flag.run_id !== runId) return;
      await new Promise((resolve) => {
        chrome.storage.local.set(
          { af_running_workflow: { ...flag, last_heartbeat_at: Date.now() } },
          resolve,
        );
      });
    } catch (e) {}
  }
  async function updateRunningFlagName(wfId, wfName, runId = null) {
    return mutateRunningFlag(() =>
      updateRunningFlagNameUnlocked(wfId, wfName, runId),
    );
  }
  async function updateRunningFlagNameUnlocked(wfId, wfName, runId = null) {
    try {
      const data = await new Promise((resolve) => {
        chrome.storage.local.get(["af_running_workflow"], (r) => resolve(r));
      });
      const flag = data.af_running_workflow;
      if (flag?.wf_id !== wfId) return;
      if (flag.run_id && flag.run_id !== runId) return;
      await new Promise((resolve) => {
        chrome.storage.local.set(
          { af_running_workflow: { ...flag, wf_name: wfName || flag.wf_name } },
          resolve,
        );
      });
    } catch (e) {}
  }
  async function clearRunningFlag(wfId, runId = null) {
    return mutateRunningFlag(() => clearRunningFlagUnlocked(wfId, runId));
  }
  async function clearRunningFlagUnlocked(wfId, runId = null) {
    try {
      const data = await new Promise((resolve) => {
        chrome.storage.local.get(["af_running_workflow"], (r) => resolve(r));
      });
      const flag = data.af_running_workflow;
      if (!flag) return;
      if (wfId && flag.wf_id !== wfId) return;
      if (flag.run_id && flag.run_id !== runId) return;
      await new Promise((resolve) =>
        chrome.storage.local.remove("af_running_workflow", resolve),
      );
    } catch (e) {}
  }
  async function updateCurrentNode(wfId, nodeId, runId = null) {
    return mutateRunningFlag(() =>
      updateCurrentNodeUnlocked(wfId, nodeId, runId),
    );
  }
  async function updateCurrentNodeUnlocked(wfId, nodeId, runId = null) {
    try {
      const data = await new Promise((resolve) => {
        chrome.storage.local.get(["af_running_workflow"], (r) => resolve(r));
      });
      const flag = data.af_running_workflow;
      if (!flag || flag.wf_id !== wfId) return;
      if (flag.run_id && flag.run_id !== runId) return;
      await new Promise((resolve) => {
        chrome.storage.local.set(
          { af_running_workflow: { ...flag, current_node_id: nodeId } },
          resolve,
        );
      });
    } catch (e) {}
  }
  let _serverExecutionId = null;
  async function startServerTracking(wfId, wfName, totalNodes, ctx) {
    try {
      if (!window.authManager?._apiCall) {
        console.log(
          "[WorkflowExecutor] Server tracking skipped - authManager not ready",
        );
        return null;
      }
      const resp = await window.authManager._apiCall(
        "POST",
        "executions/start",
        {
          wf_id: wfId,
          wf_name: wfName,
          total_nodes: totalNodes,
          executor_context: ctx || "sidebar",
        },
      );
      if (resp?.success && resp?.data?.execution_id) {
        _serverExecutionId = resp.data.execution_id;
        console.log(
          "[WorkflowExecutor] Server tracking started:",
          _serverExecutionId,
        );
        try {
          await mutateRunningFlag(async () => {
            const data = await new Promise((r) =>
              chrome.storage.local.get(["af_running_workflow"], r),
            );
            if (data.af_running_workflow?.wf_id === wfId) {
              await new Promise((r) =>
                chrome.storage.local.set(
                  {
                    af_running_workflow: {
                      ...data.af_running_workflow,
                      execution_id: _serverExecutionId,
                    },
                  },
                  r,
                ),
              );
            }
          });
        } catch (_) {}
        return _serverExecutionId;
      }
    } catch (e) {
      console.warn(
        "[WorkflowExecutor] Server tracking start failed:",
        e.message,
      );
    }
    return null;
  }
  async function heartbeatServer(
    currentNodeId,
    completedNodes,
    nodeStates = null,
  ) {
    if (!_serverExecutionId) return;
    try {
      const payload = {
        current_node_id: currentNodeId,
        completed_nodes: completedNodes,
      };
      if (nodeStates && Object.keys(nodeStates).length > 0)
        payload.node_states = nodeStates;
      await window.authManager?._apiCall(
        "PATCH",
        `executions/${_serverExecutionId}/heartbeat`,
        payload,
      );
    } catch (e) {}
  }
  async function completeServerTracking(status, summary, completedNodes) {
    if (!_serverExecutionId) return;
    try {
      await window.authManager?._apiCall(
        "POST",
        `executions/${_serverExecutionId}/complete`,
        { status, summary, completed_nodes: completedNodes },
      );
      console.log("[WorkflowExecutor] Server tracking completed:", status);
    } catch (e) {
      console.warn(
        "[WorkflowExecutor] Server tracking complete failed:",
        e.message,
      );
    }
    _serverExecutionId = null;
  }
  function emitLog(data) {
    window.eventBus.emit("execution:log", data);
  }
  function emitProgress(data) {
    window.eventBus.emit("execution:progress", data);
  }
  const MENTIONABLE_NODE_TYPES = [
    "image",
    "text",
    "text_extract",
    "generate",
    "chatgpt",
    "grok",
    "gemini",
    "muse",
    "prompt",
  ];
  const NODES_CAN_USE_MENTIONS = [
    "generate",
    "chatgpt",
    "grok",
    "gemini",
    "muse",
    "prompt",
  ];
  function parseMentions(prompt) {
    if (!prompt || typeof prompt !== "string") return [];
    const mentionRegex = /@([a-z][a-z0-9_]{0,29})(?![a-z0-9@._:-])/g;
    const mentions = [];
    let match;
    while ((match = mentionRegex.exec(prompt)) !== null) {
      mentions.push(match[1]);
    }
    return [...new Set(mentions)];
  }
  function _wfFolderName(name) {
    return (
      String(name || "workflow")
        .replace(/[đĐ]/g, (c) => (c === "\u0111" ? "d" : "D"))
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .substring(0, 30) || "workflow"
    );
  }
  function buildNodesBySlug(nodes) {
    const map = new Map();
    for (const node of nodes || []) {
      if (node.slug) {
        map.set(node.slug, node);
      }
    }
    return map;
  }
  function resolveWorkflowImagePreview(value) {
    if (typeof value === "string") return value || null;
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    return (
      value.thumbnail || value.thumbnail_url || value.source_thumbnail || null
    );
  }
  function resolveWorkflowPersistentMediaId(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    return value.persistent_media_id || value.file_name || null;
  }
  function getMentionReferenceIds(sourceNode) {
    if (
      !sourceNode ||
      !["image", "generate", "chatgpt", "grok", "gemini", "muse"].includes(
        sourceNode.node_type,
      )
    )
      return [];
    const split = (value) =>
      String(value || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
        .filter((id) => !id.startsWith("upload_"));
    if (sourceNode.node_type !== "image")
      return split(sourceNode.result_file_ids);
    const ids = split(sourceNode.ref_file_ids);
    if (ids.length) return ids;
    const thumbs = sourceNode.ref_thumbnails;
    if (thumbs && typeof thumbs === "object" && !Array.isArray(thumbs)) {
      const webIds = Object.keys(thumbs).filter((id) =>
        id.startsWith("template_ref_"),
      );
      if (webIds.length) return webIds;
    }
    return [];
  }
  function resolvePromptMentions(node, nodesBySlug) {
    let prompt = node.prompt || "";
    const promptMode = node.prompt_mode || "all";
    const doSubstitute = promptMode === "mention";
    if (!doSubstitute) return prompt;
    const mentions = parseMentions(prompt).filter((slug) =>
      nodesBySlug.has(slug),
    );
    if (mentions.length === 0) return prompt;
    for (const slug of mentions) {
      const sourceNode = nodesBySlug.get(slug);
      if (!sourceNode) continue;
      const re = new RegExp(`@${slug}(?![a-z0-9_])`, "g");
      if (sourceNode.node_type === "text") {
        if (!doSubstitute) continue;
        prompt = prompt.replace(re, () => (sourceNode.prompt || "").trim());
      } else if (sourceNode.node_type === "prompt") {
        if (!doSubstitute) continue;
        prompt = prompt.replace(re, () =>
          (sourceNode.result_text || sourceNode.prompt || "").trim(),
        );
      } else if (sourceNode.node_type === "text_extract") {
        prompt = prompt.replace(re, () =>
          (sourceNode.result_text || "").trim(),
        );
      }
    }
    prompt = prompt.replace(/[ \t]{2,}/g, " ").trim();
    return prompt;
  }
  function resolveMentionedRefImages(node, nodesBySlug) {
    const mode = node.ref_mode || "all";
    const prompt = node.prompt || "";
    if (mode !== "mention") {
      return null;
    }
    const mentions = parseMentions(prompt).filter((slug) =>
      nodesBySlug.has(slug),
    );
    const refImages = [];
    const seenFileIds = new Set();
    const seenFileNames = new Set();
    console.log(
      `[resolveMentionedRefImages] mentions=${mentions.join(",") || "(none)"} nodesBySlug.size=${nodesBySlug.size}`,
    );
    for (const slug of mentions) {
      const sourceNode = nodesBySlug.get(slug);
      if (!sourceNode) {
        console.log(
          `[resolveMentionedRefImages] slug="${slug}" \u2192 NOT FOUND in nodesBySlug`,
        );
        continue;
      }
      console.log(
        `[resolveMentionedRefImages] slug="${slug}" \u2192 node_type=${sourceNode.node_type} ref_file_ids="${sourceNode.ref_file_ids || ""}" result_file_ids="${sourceNode.result_file_ids || ""}"`,
      );
      const imageNodeTypes = [
        "image",
        "generate",
        "chatgpt",
        "grok",
        "gemini",
        "muse",
      ];
      if (!imageNodeTypes.includes(sourceNode.node_type)) {
        console.log(
          `[resolveMentionedRefImages] slug="${slug}" skipped (node_type=${sourceNode.node_type} not in imageNodeTypes)`,
        );
        continue;
      }
      let fileIds = [];
      let rawThumbs = {};
      let fileNames = {};
      if (sourceNode.node_type === "image") {
        fileIds = getMentionReferenceIds(sourceNode);
        rawThumbs = sourceNode.ref_thumbnails || {};
        fileNames = sourceNode.ref_file_names || {};
      } else {
        fileIds = getMentionReferenceIds(sourceNode);
        rawThumbs = sourceNode.result_thumbnails || {};
        fileNames = sourceNode.result_file_names || {};
      }
      const thumbVals = Object.values(rawThumbs)
        .map(resolveWorkflowImagePreview)
        .filter(Boolean);
      const resolveThumb = (fid, idx) => {
        let t = resolveWorkflowImagePreview(rawThumbs[fid]);
        if (!t) t = getThumbCache()?.get(fid)?.thumbnail;
        if (!t && window.GenTab?.thumbnailCache?.[fid])
          t = window.GenTab.thumbnailCache[fid];
        if (
          !t &&
          typeof MediaRegistry !== "undefined" &&
          MediaRegistry.getThumb
        )
          t = MediaRegistry.getThumb(fid);
        if (!t && thumbVals.length === fileIds.length) t = thumbVals[idx];
        return t || null;
      };
      fileIds.forEach((fid, idx) => {
        const thumb = resolveThumb(fid, idx);
        const fileName =
          fileNames[fid] ||
          resolveWorkflowPersistentMediaId(rawThumbs[fid]) ||
          null;
        const sourceFileIdKey = `${slug}\0${fid}`;
        const sourceFileNameKey = fileName ? `${slug}\0${fileName}` : null;
        if (
          seenFileIds.has(sourceFileIdKey) ||
          (sourceFileNameKey && seenFileNames.has(sourceFileNameKey))
        )
          return;
        seenFileIds.add(sourceFileIdKey);
        if (sourceFileNameKey) seenFileNames.add(sourceFileNameKey);
        if (!thumb)
          console.warn(
            `[resolveMentionedRefImages] slug="${slug}" fid=${fid.substring(0, 14)} \u2192 KH\xD4NG resolve \u0111\u01B0\u1EE3c thumbnail (raw keys=${Object.keys(rawThumbs).join(",") || "none"})`,
          );
        refImages.push({
          fileId: fid,
          thumbnail: thumb,
          fileName,
          sourceSlug: slug,
          sourceNodeType: sourceNode.node_type,
        });
      });
    }
    console.log(
      `[resolveMentionedRefImages] RESULT: ${refImages.length} ref images`,
    );
    if (refImages.length > 0) {
      console.log(
        `[resolveMentionedRefImages] First ref: fileId=${refImages[0].fileId}, thumbnail=${refImages[0].thumbnail ? "YES" : "NULL"}, fileName=${refImages[0].fileName || "null"}`,
      );
    }
    return refImages;
  }
  function validateMentions(node, nodesBySlug) {
    const warnings = [];
    const errors = [];
    const prompt = node.prompt || "";
    const parsedMentions = parseMentions(prompt);
    const mentions = parsedMentions.filter((slug) => nodesBySlug.has(slug));
    if (parsedMentions.length > 0 && mentions.length === 0)
      return { warnings, errors };
    if (mentions.length === 0) {
      if (node.ref_mode === "mention") {
        warnings.push({
          type: "no_image_mention",
          message:
            "ref_mode=mention nh\u01B0ng kh\xF4ng c\xF3 @image trong prompt. S\u1EBD kh\xF4ng c\xF3 reference images.",
        });
      }
      return { warnings, errors };
    }
    const imageNodeTypes = [
      "image",
      "generate",
      "chatgpt",
      "grok",
      "gemini",
      "muse",
    ];
    let hasImageMention = false;
    for (const slug of mentions) {
      const sourceNode = nodesBySlug.get(slug);
      if (!sourceNode) continue;
      if (imageNodeTypes.includes(sourceNode.node_type)) {
        hasImageMention = true;
        const hasResult = getMentionReferenceIds(sourceNode).length > 0;
        if (!hasResult && sourceNode.status !== "completed") {
          warnings.push({
            type: "pending_result",
            slug,
            message: `@${slug} ch\u01B0a c\xF3 media. N\u1EBFu node ngu\u1ED3n ch\u01B0a t\u1EA1o \u0111\u01B0\u1EE3c \u1EA3nh, @${slug} s\u1EBD \u0111\u01B0\u1EE3c gi\u1EEF nh\u01B0 text trong prompt.`,
          });
        }
      }
    }
    if (node.ref_mode === "mention" && !hasImageMention) {
      warnings.push({
        type: "no_image_mention",
        message:
          "ref_mode=mention nh\u01B0ng kh\xF4ng c\xF3 @image trong prompt. S\u1EBD kh\xF4ng c\xF3 reference images.",
      });
    }
    return { warnings, errors };
  }
  const CLEAN_SRC_KEY = "__src_result_ids";
  function _sameFileIdList(a, b) {
    const parse = (value) =>
      String(value || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    const left = parse(a);
    const right = parse(b);
    return (
      left.length === right.length &&
      left.every((id, index) => id === right[index])
    );
  }
  class WorkflowExecutor {
    constructor({ singleNodeWorker = false } = {}) {
      this._singleNodeWorker = singleNodeWorker;
      this.isRunning = false;
      this.shouldStop = false;
      this.currentWorkflow = null;
      this.currentNode = null;
      if (!singleNodeWorker)
        chrome.runtime.onMessage.addListener(
          (message, sender, sendResponse) => {
            if (
              message.action === "workflow:single_node" &&
              this.canAcceptSingleNode(message.workflowId) &&
              message.runId === this._flowRunId
            ) {
              try {
                const completion = this._admitSingleNode(
                  message.workflowId,
                  message.nodeId,
                  message.options || {},
                );
                completion.catch((error) =>
                  console.warn(
                    "[WorkflowSingleNode] remote job failed:",
                    error.message,
                  ),
                );
                sendResponse({
                  ok: true,
                  accepted: true,
                  runId: this._flowRunId,
                  execution_mode: "single_nodes",
                });
              } catch (error) {
                sendResponse({ ok: false, error: error.code || error.message });
              }
              return false;
            }
            if (
              message.action === "workflow:stop_single_node" &&
              this._singleNodeSession &&
              message.runId === this._flowRunId &&
              message.workflowId === this._singleNodeSession.workflowId
            ) {
              sendResponse({
                ok: this.stopSingleNode(message.nodeId, message.stopSource),
              });
              return false;
            }
            if (
              message.action === "queue:stop_job" &&
              this._singleNodeSession?.stopJob(
                message.jobId,
                message.stopSource,
              )
            ) {
              sendResponse({ ok: true });
              return false;
            }
            if (!this.isRunning && !this._executionTask) return false;
            if (message.action === "queue:stop_all") {
              if (this._singleNodeSession)
                window.PromptQueue?.getInstance?.()?.stopAll?.({
                  stopOrigin: "user",
                  stopReason: "USER_CANCELLED",
                  stopSource: message.stopSource,
                });
              this.stop(
                true,
                true,
                message.stopSource || "QUEUE_STOP_SOURCE_UNKNOWN",
              );
              sendResponse({ ok: true });
              return false;
            }
            if (
              message.action === "queue:stop_job" &&
              this._geminiTrackerJobs?.has(message.jobId)
            ) {
              this.stop(
                true,
                true,
                message.stopSource || "QUEUE_STOP_SOURCE_UNKNOWN",
              );
              sendResponse({ ok: true });
            }
            return false;
          },
        );
      this._flowZoomRestoreConfirmed = false;
      this._flowZoomMayBeArmed = false;
      this._heartbeatTimer = null;
      this.settings = {
        delayBetweenNodes: 3e3,
        retryOnFail: true,
        maxRetries: 2,
        retryDelay: 5e3,
        tileTimeout:
          window.SystemConfig?.safeGetTimeout?.("tile_completion_timeout_ms") ||
          3e4,
        timeout: window.SystemConfig?.safeGetTimeout?.("api_timeout_ms") || 6e4,
        stopOnError: false,
      };
      this._submitMutexQueue = Promise.resolve();
      this._flowCaptchaBound = false;
      this._nodeStateBuffer = new Map();
      this._executionInProgress = false;
      this._nodeStatesLive = {};
      this._nodeStatesDirty = false;
      this._bufferCheckpointTimer = null;
      this._serverPlan = null;
    }
    async _healFlowVideoResult(node, result) {
      if (!result || !Array.isArray(result.fileIds)) return;
      const uuidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      result.thumbnails = result.thumbnails || {};
      for (const id of result.fileIds) {
        const value = result.thumbnails[id];
        const info =
          value && typeof value === "object"
            ? value
            : { thumbnail: value || "" };
        const uuid = [info.media_uuid, id, info.file_name].find((value2) =>
          uuidPattern.test(String(value2 || "")),
        );
        if (uuid) result.thumbnails[id] = { ...info, media_uuid: uuid };
      }
      if (
        (node?.provider && node.provider !== "flow") ||
        ["chatgpt", "grok", "gemini"].includes(node?.node_type)
      )
        return;
      try {
        const response = await MessageBridge.getThumbnailsByIds(
          result.fileIds,
          { nativeMediaIdentitiesOnly: true },
        );
        for (const [id, info] of Object.entries(response?.results || {})) {
          if (!result.fileIds.includes(id)) continue;
          const previous = result.thumbnails[id] || {};
          if (
            previous.media_uuid &&
            previous.media_uuid.toLowerCase() !== info.media_uuid?.toLowerCase()
          )
            continue;
          result.thumbnails[id] = { ...previous, ...info };
        }
      } catch (error) {
        console.warn(
          "[WorkflowVideoIdentity] native result metadata unavailable:",
          error?.message,
        );
      }
    }
    async _resetFlowStopForRun(emitLog2 = null) {
      if (this.shouldStop)
        throw Object.assign(new Error("UPLOAD_ABORTED"), {
          code: "UPLOAD_ABORTED",
        });
      if (!this._flowStopResetPromise) {
        this._flowStopResetPromise = (async () => {
          const reset = await window.MessageBridge?.sendToContentScript?.(
            "resetStop",
            {},
          );
          if (this.shouldStop) {
            await window.MessageBridge?.stopExecution?.().catch(() => {});
            throw Object.assign(new Error("UPLOAD_ABORTED"), {
              code: "UPLOAD_ABORTED",
            });
          }
          if (reset?.success !== true) {
            throw Object.assign(
              new Error(reset?.error || "UPLOAD_STOP_RESET_FAILED"),
              { code: reset?.error || "UPLOAD_STOP_RESET_FAILED" },
            );
          }
          try {
            emitLog2?.("[Workflow] Flow stop state reset for new execution");
          } catch (_) {}
          return reset;
        })();
      }
      return this._flowStopResetPromise;
    }
    async _restoreFlowZoom(context = "execution-finalize") {
      if (this._singleNodeSessionWorker) {
        if (this._flowZoomMayBeArmed)
          this._singleNodeSessionWorker.owner._flowZoomMayBeArmed = true;
        return true;
      }
      if (!window.MessageBridge) return false;
      if (!this._flowZoomMayBeArmed) return true;
      if (this._flowZoomRestoreConfirmed) return true;
      let lastError = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const result = await window.MessageBridge.sendToContentScript(
            "endFlowZoomSession",
            { force: true },
          );
          if (result?.ok !== true) {
            throw new Error(
              result?.error ||
                "Flow content script did not confirm zoom restore",
            );
          }
          if (result.restored !== true) {
            console.log(
              `[WorkflowExecutor] Flow zoom cleanup confirmed (${context}, no active session, current=${result.zoom ?? "unknown"})`,
            );
          } else {
            console.log(
              `[WorkflowExecutor] Flow zoom restore confirmed (${context}, attempt ${attempt})`,
            );
          }
          this._flowZoomRestoreConfirmed = true;
          return true;
        } catch (error) {
          lastError = error;
          console.warn(
            `[WorkflowExecutor] Flow zoom restore failed (${context}, attempt ${attempt}/2):`,
            error?.message || error,
          );
        }
      }
      console.error(
        `[WorkflowExecutor] Flow zoom restore could not be confirmed (${context}):`,
        lastError?.message || lastError,
      );
      return false;
    }
    _providerDisplayName(node) {
      const m = {
        generate: "Google Flow",
        chatgpt: "ChatGPT",
        grok: "Grok",
        gemini: "Gemini",
        muse: "Muse",
      };
      return m[node?.node_type] || "Provider";
    }
    _createProviderFailureError(
      provider,
      node,
      result,
      fallbackCode = "IMAGE_GEN_FAILED",
    ) {
      const clean = (value, max = 800) =>
        typeof value === "string"
          ? value.replace(/\s+/g, " ").trim().slice(0, max)
          : "";
      const code = clean(result?.error, 120) || fallbackCode;
      const providerName = clean(provider, 80) || "Provider";
      const nodeName = clean(node?.node_name, 160);
      const translate = (key, params) => {
        const value = window.I18n?.t?.(key, params);
        return value && value !== key ? clean(value) : "";
      };
      let detail = clean(result?.message);
      if (!detail) {
        if (/QUOTA|RATE_LIMIT|LIMIT_REACHED/i.test(code)) {
          detail = translate("workflow.failQuota", { provider: providerName });
        } else if (
          /NOT_LOGGED_IN|SESSION_NOT_FOUND|SESSION_EXPIRED|EDITOR_NOT_FOUND|NOT_READY|NO_TAB/i.test(
            code,
          )
        ) {
          detail = translate("workflow.providerNotReady", {
            provider: providerName,
          });
        } else if (/CONTENT_BLOCKED|POLICY|SAFETY/i.test(code)) {
          detail = translate("workflow.failContentBlocked", {
            provider: providerName,
            node: nodeName,
          });
        }
      }
      if (!detail) detail = clean(result?.reason, 240);
      if (!detail || detail === code) {
        detail = translate("workflow.statusFailed") || "Generation failed";
      }
      const codeAlreadyVisible = detail
        .toUpperCase()
        .includes(code.toUpperCase());
      const error = new Error(
        `${providerName} \u2014 ${detail}${codeAlreadyVisible ? "" : ` [${code}]`}`,
      );
      error.code = code;
      error.provider = providerName.toLowerCase();
      error.providerMessage = clean(result?.message) || null;
      error.providerReason = clean(result?.reason, 240) || null;
      error.hasPendingImage = result?.hasPendingImage === true;
      error.noRetry = result?.noRetry === true;
      error.errorDetails = Array.isArray(result?.errorDetails)
        ? result.errorDetails
        : [];
      error.failureDetails = Array.isArray(result?.failureDetails)
        ? result.failureDetails
        : [];
      error.providerErrorCodes = Array.isArray(result?.providerErrorCodes)
        ? result.providerErrorCodes
        : code
          ? [code]
          : [];
      return error;
    }
    _notifyRefUploadDropped(node, droppedCount, keptCount) {
      const nodeName = node?.node_name || "Node";
      const msg =
        window.I18n?.t("workflow.refUploadDropped", {
          count: droppedCount,
          kept: keptCount,
          node: nodeName,
        }) ||
        `"${nodeName}": ${droppedCount} \u1EA3nh tham chi\u1EBFu kh\xF4ng upload \u0111\u01B0\u1EE3c l\xEAn Flow (vd file video) n\xEAn \u0111\xE3 b\u1ECB b\u1ECF qua. T\u1EA1o ti\u1EBFp v\u1EDBi ${keptCount} \u1EA3nh h\u1EE3p l\u1EC7.`;
      this._showWorkflowToast(msg, "warning");
    }
    _workflowFailureDetail(node, error) {
      const clean = (value) =>
        typeof value === "string"
          ? value.replace(/\s+/g, " ").trim().slice(0, 700)
          : "";
      const nodeType = node?.node_type || node?.type;
      const raw = clean(error?.code || error?.message);
      let errorType = clean(error?.errorType);
      if (nodeType === "generate") {
        errorType =
          window.FlowApiAdapter?.classifyError?.(raw, errorType) ||
          errorType ||
          "unknown";
      }
      const candidates = [];
      if (nodeType === "generate" || error?.flowApiFailure === true) {
        try {
          const structured = window.FlowApiDriverError?.displayMessage?.(error);
          if (structured) candidates.push(structured);
        } catch (_) {}
        const translated = window.FlowApiAdapter?.formatError?.(raw, errorType);
        if (translated) candidates.push(translated);
      }
      candidates.push(
        error?.providerMessage,
        error?.message,
        error?.providerReason,
      );
      const details = [
        ...(Array.isArray(error?.failureDetails) ? error.failureDetails : []),
        ...(Array.isArray(error?.errorDetails) ? error.errorDetails : []),
      ];
      for (const detail2 of details.slice(0, 8)) {
        if (typeof detail2 === "string") candidates.push(detail2);
        else if (detail2 && typeof detail2 === "object") {
          candidates.push(detail2.message, detail2.reason, detail2.code);
          for (const code of Array.isArray(detail2.providerErrorCodes)
            ? detail2.providerErrorCodes
            : []) {
            candidates.push(
              window.FlowApiAdapter?.formatError?.(code, errorType) || code,
            );
          }
        }
      }
      const generic =
        /^(?:GENERATION_FAILED|API_FAILED|UNKNOWN_ERROR|V2_(?:GENERATION|OPERATION)_FAILED)$/i;
      const detail =
        candidates.map(clean).find((value) => value && !generic.test(value)) ||
        "";
      return { detail, errorType: errorType || "unknown", raw };
    }
    _notifyGenFailed(node, attempts, error) {
      try {
        if (node._genFailNotified) return;
        node._genFailNotified = true;
        const provider = this._providerDisplayName(node);
        const n =
          attempts ||
          (this.settings?.retryOnFail ? this.settings?.maxRetries || 0 : 0) + 1;
        const nodeName = node?.node_name || "";
        const T = (k, params, fb) => window.I18n?.t(k, params) || fb;
        const show = (message, type, duration) => {
          if (error && typeof error === "object")
            error._workflowFailureToastShown = true;
          this._showWorkflowToast(message, type, duration);
        };
        const resolved = this._workflowFailureDetail(node, error);
        const specific = resolved.detail;
        const withNode = (detail) =>
          nodeName ? `"${nodeName}" \u2014 ${detail}` : detail;
        if (this.shouldStop) {
          show(
            T(
              "workflow.stoppedByUserNode",
              { node: nodeName },
              `\u0110\xE3 d\u1EEBng theo y\xEAu c\u1EA7u \u2014 "${nodeName}" ch\u01B0a ch\u1EA1y xong.`,
            ),
            "info",
            6e3,
          );
          return;
        }
        if (this._captchaHalted) {
          show(
            T(
              "workflow.haltedByCaptcha",
              { provider },
              `${provider} y\xEAu c\u1EA7u x\xE1c minh reCAPTCHA. M\u1EDF tab ${provider} \u0111\u1EC3 x\xE1c minh r\u1ED3i ch\u1EA1y l\u1EA1i.`,
            ),
            "warning",
            12e3,
          );
          return;
        }
        const code = error?.code || "";
        const raw = `${code} ${error?.message || ""}`;
        if (
          node?.node_type === "generate" &&
          window.FlowApiAdapter?.isUnverifiedResult?.(error)
        ) {
          show(withNode(specific || T("gen.flowErr_unknown")), "warning", 12e3);
          return;
        }
        if (
          node?.node_type === "generate" &&
          /no_flow_tab|flow_project_tab_required|NO_PROJECT_OPEN|FLOW_PROJECT_REQUIRED|Không tìm thấy tab Google Flow|Google Flow tab not found/i.test(
            raw,
          )
        ) {
          window.MessageBridge?._showNoFlowTabWarning?.();
          return;
        }
        if (
          window.QuotaErrorHandler?.isQuotaError?.(error) ||
          /QUOTA_EXCEEDED|RATE_LIMIT/i.test(raw)
        ) {
          show(
            specific && resolved.errorType === "per_model_daily"
              ? withNode(specific)
              : T(
                  "workflow.failQuota",
                  { provider },
                  `H\u1EBFt h\u1EA1n m\u1EE9c ${provider}. Ch\u1EDD h\u1EA1n m\u1EE9c \u0111\u01B0\u1EE3c c\u1EA5p l\u1EA1i r\u1ED3i ch\u1EA1y ti\u1EBFp.`,
                ),
            "warning",
            1e4,
          );
          return;
        }
        if (
          resolved.errorType === "auth_expired" ||
          /NOT_LOGGED_IN|SESSION_NOT_FOUND|SESSION_EXPIRED|TOKEN_EXPIRED/i.test(
            raw,
          )
        ) {
          show(
            T(
              "workflow.failNotLoggedIn",
              { provider },
              `Phi\xEAn ${provider} \u0111\xE3 h\u1EBFt. \u0110\u0103ng nh\u1EADp l\u1EA1i tab ${provider} r\u1ED3i ch\u1EA1y ti\u1EBFp.`,
            ),
            "warning",
            1e4,
          );
          return;
        }
        if (
          resolved.errorType === "content_blocked" ||
          /CONTENT_BLOCKED|UNSAFE|POLICY|SAFETY/i.test(raw)
        ) {
          show(
            T(
              "workflow.failContentBlocked",
              { provider, node: nodeName },
              `${provider} t\u1EEB ch\u1ED1i n\u1ED9i dung c\u1EE7a "${nodeName}". S\u1EEDa prompt r\u1ED3i ch\u1EA1y l\u1EA1i.`,
            ),
            "warning",
            1e4,
          );
          return;
        }
        if (
          resolved.errorType === "server_unavailable" ||
          /CONNECTION_ERROR|NetworkError|Failed to fetch/i.test(raw)
        ) {
          show(
            specific
              ? withNode(specific)
              : T("workflow.failConnection", {}, resolved.raw),
            "error",
            1e4,
          );
          return;
        }
        if (
          specific &&
          ([
            "bot_detected",
            "captcha_failed",
            "tier_restricted",
            "media_expired",
            "project_mismatch",
            "schema_changed",
          ].includes(resolved.errorType) ||
            error?.providerMessage ||
            error?.providerReason ||
            error?.flowApiFailure === true ||
            /PUBLIC_ERROR_|HTTP \d{3}|gRPC \d+/i.test(raw))
        ) {
          show(
            withNode(specific),
            ["bot_detected", "captcha_failed", "tier_restricted"].includes(
              resolved.errorType,
            )
              ? "warning"
              : "error",
            12e3,
          );
          return;
        }
        if (
          specific &&
          !/^(?:Generation failed|Failed|Thất bại)$/i.test(specific)
        ) {
          show(withNode(specific), "error", 1e4);
          return;
        }
        show(
          T(
            "workflow.genFailedAfterRetries",
            { count: n, provider, node: nodeName },
            `${provider} failed after ${n} attempts. Open the ${provider} tab to see error details.`,
          ),
          "error",
          9e3,
        );
      } catch (_) {}
    }
    _showWorkflowToast(message, type = "error", duration = 8e3) {
      try {
        if (typeof window.showNotification === "function") {
          window.showNotification(message, type, duration);
          return;
        }
        if (!document.getElementById("tobyflow-wf-toast-styles")) {
          const st = document.createElement("style");
          st.id = "tobyflow-wf-toast-styles";
          st.textContent = `
            #tobyflow-wf-toast-container{position:fixed;top:16px;right:16px;z-index:2147483647;display:flex;flex-direction:column;gap:8px;max-width:380px;pointer-events:none}
            .tobyflow-wf-toast{pointer-events:auto;cursor:pointer;padding:12px 14px;border-radius:10px;font-size:13px;line-height:1.45;color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.35);opacity:0;transform:translateX(20px);transition:opacity .25s,transform .25s;white-space:pre-wrap;word-break:break-word}
            .tobyflow-wf-toast.show{opacity:1;transform:translateX(0)}
            .tobyflow-wf-toast-info{background:#152438;border:1px solid #60a5fa}
            .tobyflow-wf-toast-error{background:#3a1418;border:1px solid #ef4444}
            .tobyflow-wf-toast-warning{background:#3a2e10;border:1px solid #f59e0b}
            .tobyflow-wf-toast-success{background:#10291a;border:1px solid #22c55e}`;
          document.head.appendChild(st);
        }
        let container = document.getElementById("tobyflow-wf-toast-container");
        if (!container) {
          container = document.createElement("div");
          container.id = "tobyflow-wf-toast-container";
          document.body.appendChild(container);
        }
        const el = document.createElement("div");
        el.className = "tobyflow-wf-toast tobyflow-wf-toast-" + type;
        el.textContent = message;
        const dismiss = () => {
          el.classList.remove("show");
          setTimeout(() => el.remove(), 300);
        };
        el.addEventListener("click", dismiss);
        container.appendChild(el);
        requestAnimationFrame(() => el.classList.add("show"));
        setTimeout(dismiss, duration);
      } catch (_) {}
    }
    async _preflightProviderTab(providerKey, emitLog2, maxWaitMs = 8e3) {
      const Session =
        providerKey === "chatgpt"
          ? window.ChatGPTSession
          : providerKey === "grok"
            ? window.GrokSession
            : providerKey === "gemini"
              ? window.GeminiSession
              : providerKey === "muse"
                ? window.MuseSession
                : null;
      const adapter = window.ProviderRegistry?.get(providerKey);
      if (!Session || !adapter) {
        return { ready: false, tabId: null, error: "SESSION_NOT_FOUND" };
      }
      emitLog2(
        `[Preflight] ${providerKey}: Activating tab + navigate homepage...`,
      );
      let tabId = null;
      try {
        const initial = await adapter.ensureReady({
          createIfMissing: true,
          activate: true,
          ...(providerKey === "grok" ? { forceCheck: true } : {}),
        });
        tabId = initial?.tabId || null;
        if (providerKey === "chatgpt" && (!tabId || !Session.ensureTabActive)) {
          return {
            ready: false,
            tabId,
            error: !tabId
              ? initial?.error || "NO_TAB"
              : "NEW_CHAT_NAVIGATION_UNAVAILABLE",
          };
        }
        if (Session.ensureTabActive) {
          try {
            await Session.ensureTabActive({
              forceRefresh: true,
              focusWindow: false,
            });
          } catch (error) {
            if (providerKey === "chatgpt") {
              emitLog2(
                `[Preflight] ${providerKey}: New Chat navigation failed: ${error?.message || "unknown error"}`,
                "warn",
              );
              return {
                ready: false,
                tabId,
                error: "NEW_CHAT_NAVIGATION_FAILED",
              };
            }
            throw error;
          }
          Session._ready = false;
          Session._lastCheck = 0;
          emitLog2(
            `[Preflight] ${providerKey}: Homepage navigation triggered (forceRefresh), cache invalidated`,
          );
        }
      } catch (e) {
        emitLog2(
          `[Preflight] ${providerKey}: ensureReady failed: ${e.message}`,
          "warn",
        );
      }
      const start = Date.now();
      let lastStatus = null;
      while (Date.now() - start < maxWaitMs) {
        try {
          let isReady = false;
          let statusInfo = {};
          if (providerKey === "grok" && Session.checkStatus) {
            const status = await Session.checkStatus();
            statusInfo = status;
            isReady = status.loggedIn && !status.cloudflareChallenge;
            if (status.cloudflareChallenge) {
              emitLog2(
                `[Preflight] ${providerKey}: Cloudflare challenge detected, waiting...`,
                "warn",
              );
            }
          } else if (Session.ensureReady) {
            const result = await Session.ensureReady({
              createIfMissing: false,
              activate: false,
            });
            statusInfo = result || {};
            isReady = result?.ready === true;
            tabId = result?.tabId || tabId;
          }
          if (isReady) {
            emitLog2(
              `[Preflight] ${providerKey}: Ready after ${Date.now() - start}ms`,
            );
            return { ready: true, tabId, error: null };
          }
          const statusKey = JSON.stringify(statusInfo);
          if (statusKey !== lastStatus) {
            lastStatus = statusKey;
            emitLog2(
              `[Preflight] ${providerKey}: Waiting... (loggedIn=${statusInfo.loggedIn}, ready=${statusInfo.ready})`,
            );
          }
        } catch (e) {
          emitLog2(
            `[Preflight] ${providerKey}: Poll error: ${e.message}`,
            "warn",
          );
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      emitLog2(
        `[Preflight] ${providerKey}: Timeout after ${maxWaitMs}ms, proceeding anyway...`,
        "warn",
      );
      return { ready: false, tabId, error: "PREFLIGHT_TIMEOUT" };
    }
    _refreshSettingsFromExecutionConfig() {
      const wfCfg = window.ExecutionConfig?.safeGetWorkflowConfig?.() || {};
      if (typeof wfCfg.delay_nodes_sec === "number") {
        this.settings.delayBetweenNodes = wfCfg.delay_nodes_sec * 1e3;
      }
      if (typeof wfCfg.max_retries === "number") {
        this.settings.maxRetries = wfCfg.max_retries;
      }
      if (typeof wfCfg.timeout_sec === "number") {
        this.settings.tileTimeout = wfCfg.timeout_sec * 1e3;
      }
      if (wfCfg.on_error === "stop" || wfCfg.on_error === "continue") {
        this.settings.stopOnError = wfCfg.on_error === "stop";
      }
      console.log(
        "[WorkflowExecutor] Refreshed settings from ExecutionConfig:",
        {
          delayBetweenNodes: this.settings.delayBetweenNodes,
          maxRetries: this.settings.maxRetries,
          tileTimeout: this.settings.tileTimeout,
          stopOnError: this.settings.stopOnError,
          source:
            Object.keys(wfCfg).length > 0
              ? "system_settings"
              : "hardcoded_defaults",
        },
      );
    }
    async _fetchServerPlan(wfId, settingsOverride = {}, onlyNodeIds = null) {
      try {
        if (!window.authManager?._apiCall) {
          console.warn("[WorkflowExecutor] authManager not available");
          return { success: false, error: "AUTH_NOT_READY" };
        }
        const response = await window.authManager._apiCall(
          "POST",
          `workflows/${wfId}/execute`,
          {
            settings_override: settingsOverride,
            ...(Array.isArray(onlyNodeIds) && onlyNodeIds.length > 0
              ? { only_node_ids: onlyNodeIds.map(String) }
              : {}),
          },
        );
        if (!response?.plan) {
          console.warn(
            "[WorkflowExecutor] Server plan fetch failed \u2014 invalid response shape:",
            response,
          );
          return { success: false, error: "PLAN_FETCH_FAILED" };
        }
        if (response.plan.cycle_detected) {
          console.error(
            "[WorkflowExecutor] Server detected cycle, unreachable nodes:",
            response.plan.unreachable_node_ids,
          );
          return {
            success: false,
            error: "CYCLE_DETECTED",
            unreachable: response.plan.unreachable_node_ids,
          };
        }
        console.log("[WorkflowExecutor] Server plan received:", {
          execution_id: response.plan.execution_id,
          total_steps: response.plan.total_steps,
          is_mixed_providers: response.plan.is_mixed_providers,
          level_count: response.plan.level_count,
          applied_settings: response.plan.applied_settings,
        });
        return {
          success: true,
          plan: response.plan,
          prompt_count: response.prompt_count ?? null,
        };
      } catch (e) {
        const ctx = {
          message: e.message,
          httpStatus: e.httpStatus,
          code: e.code,
          exception: e.exception,
          details: e.details,
        };
        console.warn("[WorkflowExecutor] Server plan fetch error:", ctx);
        return {
          success: false,
          error: e.message,
          httpStatus: e.httpStatus,
          exception: e.exception,
        };
      }
    }
    _convertServerPlanToLevels(serverPlan, localNodes) {
      if (!serverPlan?.steps?.length) return [];
      const levelMap = new Map();
      for (const step of serverPlan.steps) {
        const levelIdx = step.level_index ?? 0;
        if (!levelMap.has(levelIdx)) levelMap.set(levelIdx, []);
        const localNode = localNodes.find((n) => n.node_id === step.node_id);
        if (!localNode) {
          console.warn(
            "[WorkflowExecutor] Server step KH\xD4NG kh\u1EDBp node local, b\u1ECF qua:",
            step.node_id,
          );
        }
        if (localNode) {
          levelMap.get(levelIdx).push({ ...localNode, _serverStep: step });
        }
      }
      const levels = [];
      const sortedKeys = [...levelMap.keys()].sort((a, b) => a - b);
      for (const key of sortedKeys) {
        levels.push(levelMap.get(key));
      }
      return levels;
    }
    _startHeartbeat(wfId, runId = this._flowRunId) {
      this._stopHeartbeat();
      if (!wfId) return;
      this._heartbeatWfId = wfId;
      this._heartbeatTimer = setInterval(() => {
        pulseHeartbeat(wfId, runId);
        const states = this._nodeStatesDirty
          ? { ...this._nodeStatesLive }
          : null;
        this._nodeStatesDirty = false;
        heartbeatServer(
          this.currentNode?.node_id,
          this._completedNodesCount || 0,
          states,
        );
      }, HEARTBEAT_INTERVAL_MS);
    }
    _stopHeartbeat() {
      if (this._heartbeatTimer) {
        clearInterval(this._heartbeatTimer);
        this._heartbeatTimer = null;
      }
    }
    _startBufferCheckpoint(wfId) {
      this._stopBufferCheckpoint();
      if (!wfId) return;
      this._bufferCheckpointTimer = setInterval(() => {
        this._persistBufferCheckpoint(wfId);
      }, 1e4);
    }
    _stopBufferCheckpoint() {
      if (this._bufferCheckpointTimer) {
        clearInterval(this._bufferCheckpointTimer);
        this._bufferCheckpointTimer = null;
      }
    }
    async _persistBufferCheckpoint(wfId) {
      if (this._nodeStateBuffer.size === 0) return;
      try {
        await new Promise((resolve) => {
          chrome.storage.local.set(
            {
              [`af_workflow_buffer_${wfId}`]: {
                nodes: Object.fromEntries(this._nodeStateBuffer),
                timestamp: Date.now(),
              },
            },
            resolve,
          );
        });
        log("Buffer checkpoint saved:", this._nodeStateBuffer.size, "nodes");
      } catch (e) {
        console.warn("[WorkflowExecutor] Buffer checkpoint failed:", e);
      }
    }
    async _clearBufferCheckpoint(wfId) {
      if (!wfId) return;
      try {
        await new Promise((resolve) => {
          chrome.storage.local.remove([`af_workflow_buffer_${wfId}`], resolve);
        });
      } catch (e) {}
    }
    async _acquireSubmitMutex() {
      let release;
      const acquired = new Promise((resolve) => {
        release = resolve;
      });
      const mutexOwner = this._singleNodeSessionWorker?.owner || this;
      const prev = mutexOwner._submitMutexQueue;
      mutexOwner._submitMutexQueue = prev.then(() => acquired);
      const signal = this._flowAdmissionAbortController?.signal;
      let onAbort;
      try {
        await Promise.race([
          prev,
          new Promise((_, reject) => {
            onAbort = () =>
              reject(
                Object.assign(new Error("ABORTED"), {
                  code: "ABORTED",
                  noRetry: true,
                }),
              );
            signal?.addEventListener("abort", onAbort, { once: true });
            if (signal?.aborted) onAbort();
          }),
        ]);
        this._assertWorkflowNotStopped();
        return release;
      } catch (error) {
        release();
        throw error;
      } finally {
        signal?.removeEventListener("abort", onAbort);
      }
    }
    async _getGenDefaults() {
      if (this._genDefaults) return this._genDefaults;
      const _defImg =
        (await window.ModelRegistry?.getDefaultAsync("flow", "image")) || null;
      const _defVid =
        (await window.ModelRegistry?.getDefaultAsync("flow", "video")) || null;
      if (!_defImg)
        console.debug(
          "[Tier3] WorkflowExecutor._getGenDefaults: flow.image default model cache miss",
        );
      if (!_defVid)
        console.debug(
          "[Tier3] WorkflowExecutor._getGenDefaults: flow.video default model cache miss",
        );
      try {
        const result = await new Promise((resolve) => {
          chrome.storage.local.get(["af_settings"], (r) =>
            resolve(r.af_settings || {}),
          );
        });
        this._genDefaults = {
          genType: result.defaultGenType || "Image",
          ratio: result.defaultRatio || "9:16",
          imageModel: result.defaultImageModel || _defImg,
          videoModel: result.defaultVideoModel || _defVid,
        };
      } catch (e) {
        this._genDefaults = {
          genType: "Image",
          ratio: "D\u1ECDc",
          imageModel: _defImg,
          videoModel: _defVid,
        };
      }
      return this._genDefaults;
    }
    async _getGenDefaultsForNode(node) {
      const genType2 = String(node?.media_type || "").trim();
      const ratio = String(node?.ratio || "").trim();
      const model = String(node?.model || "").trim();
      if (genType2 && ratio && model) {
        console.info(
          "[WorkflowGenDefaults]",
          JSON.stringify({
            nodeId: node?.node_id || null,
            source: "node",
            waitedMs: 0,
            mediaType: genType2.slice(0, 50),
            model: model.slice(0, 100),
          }),
        );
        return {
          genType: genType2,
          ratio,
          imageModel: genType2 === "Video" ? null : model,
          videoModel: genType2 === "Video" ? model : null,
        };
      }
      const startedAt = Date.now();
      const defaults = await this._getGenDefaults();
      console.info(
        "[WorkflowGenDefaults]",
        JSON.stringify({
          nodeId: node?.node_id || null,
          source: "server-defaults",
          waitedMs: Date.now() - startedAt,
          mediaType: genType2.slice(0, 50),
          model: model.slice(0, 100),
          imageModel: String(defaults.imageModel || "").slice(0, 100),
          videoModel: String(defaults.videoModel || "").slice(0, 100),
          missing: [
            !genType2 && "media_type",
            !ratio && "ratio",
            !model && "model",
          ].filter(Boolean),
        }),
      );
      return defaults;
    }
    _historyModelForNode(node, provider, result = null) {
      if (provider === "grok") return "grok";
      if (provider !== "flow") return node?.model || provider;
      return result?.modelUsed || node?.model || null;
    }
    _isContentScriptContext() {
      return (
        typeof getEditor === "function" && typeof getSubmitButton === "function"
      );
    }
    _ensureFlowCaptchaListener() {
      if (this._singleNodeWorker || this._flowCaptchaBound || !window.eventBus)
        return;
      this._flowCaptchaBound = true;
      const handleCaptcha = (data) => {
        if (this.isRunning && data?.category === "captcha") {
          if (
            data?.action === "normal_error" ||
            data?.recoveryMode === "normal_error"
          )
            return;
          const stopBatch =
            data?.action === "stop_batch" ||
            data?.recoveryMode === "stop_batch";
          if ((this.shouldStop && !stopBatch) || this._captchaHalted) return;
          const job = window.PromptQueue?.getInstance?.()?.getJob?.(data.jobId);
          if (
            !job ||
            job.owner !== "workflow" ||
            job.workflowRunId !== this._flowRunId ||
            job.workflowId !== this.currentWorkflow?.wf_id ||
            (job.state === "stopped" && !stopBatch)
          )
            return;
          if (
            !stopBatch &&
            data?.recoveryMode === "pause_resume" &&
            job.state === "paused" &&
            job.pauseReason === "api_unusual_activity" &&
            job.items?.some(
              (item) =>
                item.genMode === "api" &&
                item.state === "WAITING_PROVIDER" &&
                item._apiManualResumePending === true,
            )
          )
            return;
          console.warn(
            `[WorkflowExecutor] reCAPTCHA detected \u2192 ${stopBatch ? "stop batch by server policy" : "halt for user decision"}.`,
          );
          this._captchaHalted = true;
          if (stopBatch) this._captchaDecided = true;
          if (data?.text) this._captchaText = data.text;
          this.shouldStop = true;
          this._singleNodeSession?.stopAll("WORKFLOW_CAPTCHA_POLICY");
        }
      };
      window.eventBus.on("flow:error_classified", handleCaptcha);
      window.eventBus.on("execution:captcha_detected", handleCaptcha);
    }
    async _resumeApiUnusualWorkflowJobs() {
      const queue = window.PromptQueue?.getInstance?.();
      const pausedApiJobs = (queue?.getJobsByOwner?.("workflow") || []).filter(
        (job) =>
          job.state === "paused" &&
          job.pauseReason === "api_unusual_activity" &&
          job.workflowRunId === this._flowRunId &&
          job.workflowId === this.currentWorkflow?.wf_id,
      );
      let resumed = true;
      for (const job of pausedApiJobs) {
        if (!(await queue.resumeJob(job.id))) resumed = false;
      }
      return resumed;
    }
    async _handleCaptchaDecision() {
      const I = window.I18n;
      const title =
        I?.t("workflow.captchaModalTitle") ||
        "Google Flow temporarily blocked the request (captcha)";
      const base =
        I?.t("workflow.captchaModalMsg") ||
        "Google Flow temporarily blocked a node because of unusual activity. Running nodes have finished.\n\nContinue with the remaining nodes? (The block may recur; consider waiting 1\u20132 minutes before retrying.)";
      const msg = this._captchaText
        ? `${this._captchaText}

${base}`
        : base;
      const continueText = I?.t("workflow.captchaContinue") || "Continue";
      const stopText = I?.t("workflow.captchaStop") || "Stop workflow";
      if (!window.customDialog?.confirm) {
        console.warn(
          "[WorkflowExecutor] customDialog N/A \u2192 default STOP on captcha.",
        );
        return "stop";
      }
      let timer = null;
      const confirmP = window.customDialog
        .confirm(msg, {
          title,
          type: "warning",
          confirmText: continueText,
          cancelText: stopText,
        })
        .then((ok) => {
          if (timer) clearTimeout(timer);
          return ok ? "continue" : "stop";
        });
      const timeoutP = new Promise((resolve) => {
        timer = setTimeout(() => {
          try {
            window.customDialog._close();
          } catch (_) {}
          resolve("stop");
        }, 6e4);
      });
      return Promise.race([confirmP, timeoutP]);
    }
    async _runOwnedExecution(work, workflowId) {
      if (this._executionTask)
        throw Object.assign(new Error("WORKFLOW_EXECUTION_STILL_STOPPING"), {
          code: "WORKFLOW_EXECUTION_STILL_STOPPING",
          noRetry: true,
        });
      const controller = new AbortController();
      this._flowReadAbortController = controller;
      const admissionController = new AbortController();
      this._flowAdmissionAbortController = admissionController;
      const previousRunId = this._flowRunId;
      const task = Promise.resolve()
        .then(work)
        .finally(async () => {
          try {
            if (this._flowRunId && this._flowRunId !== previousRunId)
              await clearRunningFlag(workflowId, this._flowRunId);
          } finally {
            if (this._executionTask === task) {
              if (this._flowRunId && this._flowRunId !== previousRunId) {
                this._stopHeartbeat();
                if (window.ExecutionLock) ExecutionLock.release("workflow");
              }
              this._executionTask = null;
            }
            if (this._flowReadAbortController === controller)
              this._flowReadAbortController = null;
            if (this._flowAdmissionAbortController === admissionController)
              this._flowAdmissionAbortController = null;
            window.eventBus?.emit("execution:settled", { workflowId });
          }
        });
      this._executionTask = task;
      return task;
    }
    async waitForExecutionStopped() {
      try {
        await this._executionTask;
      } catch (_) {}
    }
    async execute(workflowId, opts = {}) {
      return this._runOwnedExecution(
        () => this._executeWorkflowOwned(workflowId, opts),
        workflowId,
      );
    }
    async _executeWorkflowOwned(workflowId, opts = {}) {
      const startupAt = Date.now();
      let startupStageAt = startupAt;
      const logStartupStage = (stage) => {
        const now = Date.now();
        console.info(
          "[WorkflowRunStartup]",
          JSON.stringify({
            workflowId,
            stage,
            stageMs: now - startupStageAt,
            totalMs: now - startupAt,
            ...window.MessageBridge?._flowPerfMemorySnapshot?.(),
          }),
        );
        startupStageAt = now;
      };
      console.log(
        "[WorkflowExecutor] execute() called with:",
        workflowId,
        "isRunning:",
        this.isRunning,
      );
      this._ensureFlowCaptchaListener();
      if (this.isRunning) {
        log("Already running a workflow");
        return false;
      }
      if (window.GenTab?._checkDuplicateProviderTabs) {
        try {
          const wf = await window.storageManager?.getWorkflow?.(workflowId);
          const allNodes = wf?.nodes || [];
          const _provSubset =
            opts.onlyNodeIds && opts.onlyNodeIds.length
              ? new Set(opts.onlyNodeIds.map(String))
              : null;
          const nodes = _provSubset
            ? allNodes.filter((n) => _provSubset.has(String(n.node_id)))
            : allNodes;
          const providers = new Set();
          for (const n of nodes) {
            if (n.enabled === false) continue;
            const t = n.node_type;
            if (t === "image" || t === "generate") providers.add("flow");
            else if (t === "chatgpt")
              providers.add(n.provider === "gemini" ? "gemini" : "chatgpt");
            else if (t === "grok") providers.add("grok");
            else if (t === "gemini") providers.add("gemini");
            else if (t === "muse") providers.add("muse");
            else if (
              t === "prompt" &&
              (n.use_ai === true || n.enhance === true)
            ) {
              providers.add(
                ["chatgpt", "grok", "gemini", "muse"].includes(n.provider)
                  ? n.provider
                  : "chatgpt",
              );
            }
          }
          for (const p of providers) {
            window.GenTab._checkDuplicateProviderTabs(p, { interactive: true });
          }
        } catch (e) {
          console.warn(
            "[WorkflowExecutor] duplicate tab check failed:",
            e?.message || e,
          );
        }
      }
      this._genDefaults = null;
      const isBlockedByLock =
        window.ExecutionLock && ExecutionLock.isBlockedBy("workflow");
      console.log("[WorkflowExecutor] ExecutionLock check:", isBlockedByLock);
      if (isBlockedByLock) {
        const shouldStop = await ExecutionLock.showBlockedDialog("workflow");
        console.log(
          "[WorkflowExecutor] ExecutionLock dialog result:",
          shouldStop,
        );
        if (!shouldStop) return false;
        await ExecutionLock.stopCurrent();
      }
      const isPopupCtxEarly =
        window.location?.pathname?.includes("workflow-editor") ||
        window.location?.pathname?.includes("popup");
      console.log(
        "[WorkflowExecutor] Claiming running flag, ctx:",
        isPopupCtxEarly ? "popup" : "sidebar",
      );
      const claim = await claimRunningFlag(
        workflowId,
        null,
        isPopupCtxEarly ? "popup" : "sidebar",
      );
      logStartupStage("claim-complete");
      console.log("[WorkflowExecutor] Claim result:", claim);
      if (!claim.ok) {
        log("Cross-context running flag held by:", claim.runningWfId);
        const err = new Error(
          `"${claim.runningWfName}" \u0111ang ch\u1EA1y \u1EDF c\u1EEDa s\u1ED5 kh\xE1c`,
        );
        err.code = "CROSS_CONTEXT_RUNNING";
        throw err;
      }
      try {
        this._flowRunId = claim.runId;
        this._startHeartbeat(workflowId, claim.runId);
        this.isRunning = true;
        this._flowWebRecoveryPolicy = null;
        this._webRefReplacements = new Map();
        this._flowZoomRestoreConfirmed = false;
        this._flowZoomMayBeArmed = false;
        this.shouldStop =
          this._flowAdmissionAbortController?.signal.aborted === true;
        this._geminiTrackerJobs = new Map();
        this._portableUploadStopReset = null;
        this._flowStopResetPromise = null;
        this._captchaHalted = false;
        this._captchaDecided = false;
        this._captchaText = "";
        this._manualSubmitMode = opts?.manualSubmitMode === true;
        this._serverTrackingWfId = workflowId;
        this._submittedNodes = new Set();
        this._currentExecutionToken = null;
        this._singleNodeExecutionToken = null;
        this._downloadedTileIds = new Set();
        this._downloadNoReplayTileIds = new Set();
        this._workflowApiPreviewRequests = new Map();
        this._submitMutexQueue = Promise.resolve();
        this._nodeStateBuffer.clear();
        this._nodeStatesLive = {};
        this._nodeStatesDirty = false;
        this._executionInProgress = true;
        this._startBufferCheckpoint(workflowId);
        let workflow2;
        try {
          workflow2 = await window.storageManager.getWorkflow(workflowId);
        } catch (loadErr) {
          if (loadErr.code === "CONNECTION_ERROR") throw loadErr;
          throw loadErr;
        }
        if (!workflow2) {
          throw new Error(
            "Workflow kh\xF4ng t\u1ED3n t\u1EA1i ho\u1EB7c \u0111\xE3 b\u1ECB x\xF3a",
          );
        }
        if (!Array.isArray(workflow2.nodes)) workflow2.nodes = [];
        if (!Array.isArray(workflow2.edges)) workflow2.edges = [];
        const executionScope =
          Array.isArray(opts.onlyNodeIds) && opts.onlyNodeIds.length > 0
            ? new Set(opts.onlyNodeIds.map(String))
            : null;
        const needsFlowStopReset = workflow2.nodes.some(
          (node) =>
            node.enabled !== false &&
            (!executionScope || executionScope.has(String(node.node_id))) &&
            ["image", "generate", "chatgpt", "grok", "gemini"].includes(
              node.node_type,
            ),
        );
        if (needsFlowStopReset)
          await this._resetFlowStopForRun((message) => log(message));
        const zoomScope = executionScope;
        this._flowZoomMayBeArmed = workflow2.nodes.some(
          (n) =>
            n.node_type === "generate" &&
            n.enabled !== false &&
            (!zoomScope || zoomScope.has(String(n.node_id))),
        );
        console.log(
          "[WorkflowExecutor] execute: Loaded workflow nodes:",
          workflow2.nodes.map((n) => ({
            node_id: n.node_id,
            node_type: n.node_type,
            node_name: n.node_name,
          })),
        );
        for (const n of workflow2.nodes) {
          if (n.node_type === "image") {
            console.log(
              `[WorkflowExecutor] Image node "${n.node_name}": ref_file_ids="${n.ref_file_ids || ""}", ref_thumbnails keys=${Object.keys(n.ref_thumbnails || {}).join(",") || "(none)"}`,
            );
          }
        }
        if (
          window.MessageBridge &&
          workflow2.nodes.some((n) => n.node_type === "generate") &&
          window.FlowApiAdapter?.isApiModeIntended?.({ forWorkflow: true }) !==
            true
        ) {
          try {
            await window.MessageBridge.sendToContentScript(
              "beginFlowZoomSession",
              { factor: 0.3, hold: true },
            );
          } catch (e) {}
        }
        if (window.featureGate && workflow2.nodes.length > 0) {
          try {
            const nodeQuota = window.featureGate.checkQuota(
              "workflows_nodes_max",
            );
            const limit = nodeQuota?.limit;
            if (
              limit !== "unlimited" &&
              limit !== "-1" &&
              limit > 0 &&
              workflow2.nodes.length > limit
            ) {
              console.info(
                "[WorkflowExecutor] Run legacy workflow over-quota: " +
                  workflow2.nodes.length +
                  " nodes / " +
                  limit +
                  " limit. Run v\u1EABn \u0111\u01B0\u1EE3c nh\u01B0ng kh\xF4ng th\u1EC3 th\xEAm node m\u1EDBi.",
              );
            }
          } catch (e) {}
        }
        this.currentWorkflow = workflow2;
        this._apiBoardReloaded = false;
        if (window.ExecutionLock)
          ExecutionLock.acquire("workflow", `Workflow: ${workflow2.wf_name}`);
        if (
          workflow2.nodes.some(
            (n) => n.enabled !== false && n.node_type === "generate",
          ) &&
          window.FlowApiAdapter?.isApiModeIntended?.({ forWorkflow: true }) !==
            true
        ) {
          try {
            chrome.runtime
              .sendMessage({ action: "activateFlowTabForExecution" })
              .catch(() => {});
          } catch (e) {
            log("Error activating Flow tab:", e);
          }
        }
        let promptCount = 0;
        let flowPromptCount = 0;
        let chatgptPromptCount = 0;
        let grokPromptCount = 0;
        let geminiPromptCount = 0;
        let musePromptCount = 0;
        const _pcSubset =
          opts.onlyNodeIds && opts.onlyNodeIds.length
            ? new Set(opts.onlyNodeIds.map(String))
            : null;
        if (Array.isArray(workflow2.nodes)) {
          for (const node of workflow2.nodes) {
            if (node.enabled === false) continue;
            if (_pcSubset && !_pcSubset.has(String(node.node_id))) continue;
            if (node.node_type === "generate") {
              promptCount += 1;
              flowPromptCount += 1;
            } else if (node.node_type === "chatgpt") {
              promptCount += 1;
              chatgptPromptCount += 1;
            } else if (node.node_type === "grok") {
              promptCount += 1;
              grokPromptCount += 1;
            } else if (node.node_type === "gemini") {
              promptCount += 1;
              geminiPromptCount += 1;
            } else if (node.node_type === "muse") {
              promptCount += 1;
              musePromptCount += 1;
            } else if (node.node_type === "prompt" && node.use_ai === true) {
              promptCount += 1;
              if (node.provider === "gemini") geminiPromptCount += 1;
              else chatgptPromptCount += 1;
            }
          }
        }
        if (promptCount === 0) {
          promptCount = 1;
          flowPromptCount = 1;
        }
        this._workflowPromptCounts = {
          total: promptCount,
          flow: flowPromptCount,
          chatgpt: chatgptPromptCount,
          grok: grokPromptCount,
          gemini: geminiPromptCount,
          muse: musePromptCount,
        };
        log(
          "Calculated prompt count for workflow:",
          promptCount,
          "(flow:",
          flowPromptCount,
          ", chatgpt:",
          chatgptPromptCount,
          ", grok:",
          grokPromptCount,
          ", gemini:",
          geminiPromptCount,
          ")",
        );
        this._workflowSuccessCounts = {
          total: 0,
          flow: 0,
          chatgpt: 0,
          grok: 0,
          gemini: 0,
        };
        logStartupStage("configuration-loaded");
        console.log(
          "[WorkflowExecutor] Requesting ExecutionGate, promptCount:",
          promptCount,
        );
        if (window.ExecutionGate) {
          try {
            const workflowNodeCount = _pcSubset
              ? _pcSubset.size
              : workflow2.nodes.length;
            const gate = await ExecutionGate.request(
              "workflow_run",
              promptCount,
              {
                owner: "workflow",
                label: workflowId,
                node_count: workflowNodeCount,
              },
            );
            console.log("[WorkflowExecutor] ExecutionGate response:", gate);
            if (!gate.allowed) {
              ExecutionGate.showDeniedDialog(gate, "Workflow");
              this.isRunning = false;
              if (window.ExecutionLock) ExecutionLock.release("workflow");
              return false;
            }
            if (!gate.token) {
              const tokenError = new Error(
                "Server did not issue a workflow execution token. Please check the connection and retry.",
              );
              tokenError.code = "WORKFLOW_EXECUTION_TOKEN_MISSING";
              tokenError.reason = gate.reason || "TOKEN_NOT_ISSUED";
              throw tokenError;
            }
            this._currentExecutionToken = gate.token;
          } catch (e) {
            if (window.QuotaErrorHandler?.handleIfQuotaError(e, "Workflow")) {
              console.warn(
                "[WorkflowExecutor] ExecutionGate denied:",
                e.code || e.reason,
              );
              this.isRunning = false;
              if (window.ExecutionLock) ExecutionLock.release("workflow");
              return false;
            }
            console.error(
              "[WorkflowExecutor] ExecutionGate request failed, ABORTING (Server-Only spec):",
              e.message,
            );
            emitLog({
              message: `\u274C Kh\xF4ng th\u1EC3 xin ph\xE9p server ch\u1EA1y workflow: ${e.message || "unknown"}. Vui l\xF2ng ki\u1EC3m tra k\u1EBFt n\u1ED1i v\xE0 th\u1EED l\u1EA1i.`,
              type: "error",
            });
            this.isRunning = false;
            if (window.ExecutionLock) ExecutionLock.release("workflow");
            return false;
          }
        }
        logStartupStage("authorization-complete");
        console.log("[WorkflowExecutor] Starting workflow:", workflow2.wf_name);
        this._refreshSettingsFromExecutionConfig();
        const wfSettings = workflow2.settings_json || {};
        if (
          wfSettings.delay_between_nodes !== void 0 &&
          wfSettings.delay_between_nodes !== null
        ) {
          this.settings.delayBetweenNodes =
            Math.max(0, Number(wfSettings.delay_between_nodes) || 0) * 1e3;
        }
        if (wfSettings.max_retries !== void 0)
          this.settings.maxRetries = wfSettings.max_retries;
        if (wfSettings.timeout)
          this.settings.tileTimeout = wfSettings.timeout * 1e3;
        if (wfSettings.stop_on_error !== void 0)
          this.settings.stopOnError = wfSettings.stop_on_error;
        let parallelExecution = wfSettings.parallel_execution ?? true;
        try {
          if (window.storageManager?.saveWorkflowFull) {
            emitLog({
              message:
                "\u0110ang \u0111\u1ED3ng b\u1ED9 workflow l\xEAn server...",
              type: "info",
            });
            await window.storageManager.saveWorkflowFull(
              workflow2,
              workflow2.nodes || [],
              workflow2.edges || [],
            );
            log("Pre-execute save complete, workflow synced to server");
          }
        } catch (saveErr) {
          if (saveErr.details && typeof saveErr.details === "object") {
            console.error(
              "[WorkflowExecutor] Pre-execute save failed:",
              saveErr.message,
              "\u2014 field errors:",
              saveErr.details,
            );
          } else {
            console.error(
              "[WorkflowExecutor] Pre-execute save failed:",
              saveErr,
            );
          }
          let userMsg = `\u274C Kh\xF4ng th\u1EC3 \u0111\u1ED3ng b\u1ED9 workflow l\xEAn server: ${saveErr.message || "unknown error"}.`;
          if (
            saveErr.code === "VALIDATION_ERROR" &&
            saveErr.details &&
            typeof saveErr.details === "object"
          ) {
            const fields = Object.keys(saveErr.details);
            if (fields.length > 0) {
              const firstField = fields[0];
              const firstMsgs = saveErr.details[firstField];
              const firstMsg = Array.isArray(firstMsgs)
                ? firstMsgs[0]
                : String(firstMsgs);
              userMsg += ` Field "${firstField}": ${firstMsg}`;
              if (fields.length > 1)
                userMsg += ` (+${fields.length - 1} field kh\xE1c \u2014 xem console).`;
            }
          } else {
            userMsg +=
              " Vui l\xF2ng ki\u1EC3m tra k\u1EBFt n\u1ED1i v\xE0 th\u1EED l\u1EA1i.";
          }
          emitLog({ message: userMsg, type: "error" });
          this.isRunning = false;
          if (window.ExecutionLock) ExecutionLock.release("workflow");
          return false;
        }
        let executionLevels;
        let isMixedProviders = false;
        logStartupStage("workflow-saved");
        const serverPlanResult = await this._fetchServerPlan(
          workflowId,
          {
            parallel_execution: parallelExecution,
            stop_on_error: this.settings.stopOnError ?? false,
            max_retries: this.settings.maxRetries,
          },
          opts.onlyNodeIds,
        );
        if (serverPlanResult.success && serverPlanResult.plan) {
          this._serverPlan = serverPlanResult.plan;
          isMixedProviders = serverPlanResult.plan.is_mixed_providers ?? false;
          executionLevels = this._convertServerPlanToLevels(
            serverPlanResult.plan,
            workflow2.nodes,
          );
          const localPlanNodes = executionScope
            ? (workflow2.nodes || []).filter((node) =>
                executionScope.has(String(node.node_id)),
              )
            : workflow2.nodes || [];
          if (serverPlanResult.plan.total_steps !== localPlanNodes.length) {
            console.warn(
              `[WorkflowExecutor] Plan mismatch: server=${serverPlanResult.plan.total_steps} steps, expected=${localPlanNodes.length} nodes \u2014 workflow c\xF3 th\u1EC3 ch\u01B0a sync server`,
            );
            emitLog({
              message: `\u26A0\uFE0F Workflow ch\u01B0a sync ho\xE0n to\xE0n l\xEAn server (${serverPlanResult.plan.total_steps}/${localPlanNodes.length} nodes). Vui l\xF2ng l\u01B0u workflow r\u1ED3i th\u1EED l\u1EA1i.`,
              type: "warn",
            });
          }
          console.log(
            "[WorkflowExecutor] Using server execution plan, levels:",
            executionLevels.length,
          );
        } else {
          if (serverPlanResult.error === "CYCLE_DETECTED") {
            emitLog({
              message: `\u274C Workflow c\xF3 cycle (v\xF2ng l\u1EB7p), kh\xF4ng th\u1EC3 ch\u1EA1y. Nodes unreachable: ${(serverPlanResult.unreachable || []).join(", ")}`,
              type: "error",
            });
            this.isRunning = false;
            return false;
          }
          if (serverPlanResult.error === "EMPTY_WORKFLOW") {
            emitLog({
              message:
                "\u274C Workflow tr\u1ED1ng \u2014 h\xE3y th\xEAm node tr\u01B0\u1EDBc khi ch\u1EA1y",
              type: "error",
            });
            this.isRunning = false;
            return false;
          }
          console.error(
            "[WorkflowExecutor] Server plan unavailable, blocking execution:",
            {
              error: serverPlanResult.error,
              httpStatus: serverPlanResult.httpStatus,
              exception: serverPlanResult.exception,
            },
          );
          const isRateLimited = serverPlanResult.httpStatus === 429;
          const isHttp5xx =
            serverPlanResult.httpStatus >= 500 &&
            serverPlanResult.httpStatus < 600;
          const isServerException = !!serverPlanResult.exception;
          const isHttp4xx =
            !isRateLimited &&
            serverPlanResult.httpStatus >= 400 &&
            serverPlanResult.httpStatus < 500;
          const isFeShapeError =
            serverPlanResult.error === "PLAN_FETCH_FAILED" ||
            serverPlanResult.error === "CYCLE_DETECTED";
          let userMsg;
          if (isRateLimited) {
            userMsg = `\u23F3 Server \u0111ang b\u1EADn, vui l\xF2ng \u0111\u1EE3i v\xE0i gi\xE2y r\u1ED3i th\u1EED l\u1EA1i. (Rate limited)`;
          } else if (isHttp5xx || isServerException) {
            userMsg = `\u274C L\u1ED7i server t\u1EA1m th\u1EDDi khi t\u1EA3i execution plan (${serverPlanResult.error || "HTTP " + serverPlanResult.httpStatus}). Vui l\xF2ng th\u1EED l\u1EA1i sau \xEDt ph\xFAt.`;
          } else if (isHttp4xx) {
            userMsg = `\u274C Y\xEAu c\u1EA7u kh\xF4ng h\u1EE3p l\u1EC7: ${serverPlanResult.error || "HTTP " + serverPlanResult.httpStatus}. Vui l\xF2ng ki\u1EC3m tra workflow v\xE0 th\u1EED l\u1EA1i.`;
          } else if (isFeShapeError) {
            userMsg = `\u274C Ph\u1EA3n h\u1ED3i t\u1EEB server kh\xF4ng h\u1EE3p l\u1EC7 (${serverPlanResult.error}). Vui l\xF2ng reload extension v\xE0 th\u1EED l\u1EA1i.`;
          } else {
            userMsg = `\u274C Kh\xF4ng th\u1EC3 t\u1EA3i execution plan t\u1EEB server (${serverPlanResult.error || "unknown"}). Vui l\xF2ng ki\u1EC3m tra k\u1EBFt n\u1ED1i v\xE0 th\u1EED l\u1EA1i.`;
          }
          emitLog({ message: userMsg, type: "error" });
          const shouldShowOverlay =
            !isHttp4xx && !isHttp5xx && !isServerException && !isFeShapeError;
          if (
            shouldShowOverlay &&
            window.ConfigErrorHandler?.handle &&
            window.ConfigRequiredError
          ) {
            try {
              window.ConfigErrorHandler.handle(
                new window.ConfigRequiredError(
                  "workflow_plan",
                  serverPlanResult.error || "fetch_failed",
                ),
                "WorkflowExecutor.execute",
              );
            } catch (_) {}
          }
          this.isRunning = false;
          if (window.ExecutionLock) ExecutionLock.release("workflow");
          return false;
        }
        if (isMixedProviders) {
          emitLog({
            message:
              "Workflow c\xF3 nhi\u1EC1u provider \u2014 level ch\u1EC9 ch\u1EE9a Flow s\u1EBD ch\u1EA1y song song, level ch\u1EE9a ChatGPT/Grok/mixed s\u1EBD tu\u1EA7n t\u1EF1",
            type: "info",
          });
        }
        this._effectiveParallel = parallelExecution;
        try {
          const canUseRetry =
            window.featureGate?.canUse("retry_on_fail") ?? false;
          if (!canUseRetry) {
            this.settings.maxRetries = 0;
            this.settings.retryOnFail = false;
            log("Retry feature disabled by plan");
          }
        } catch (e) {
          log("Error checking retry feature:", e);
        }
        await this._updateWorkflowStatus("running");
        logStartupStage("ready-to-run");
        window.eventBus.emit("execution:started", { workflow: workflow2 });
        broadcastEvent("execution:started", {
          workflow: { wf_id: workflow2.wf_id, wf_name: workflow2.wf_name },
        });
        window.UsageSync?.trackEvent("workflow_start", {
          workflow_id: workflow2.wf_id,
          node_count: workflow2.nodes?.length || 0,
        });
        await updateRunningFlagName(
          workflow2.wf_id,
          workflow2.wf_name,
          claim.runId,
        );
        if (opts.onlyNodeIds && opts.onlyNodeIds.length) {
          const _runSet = new Set(opts.onlyNodeIds.map(String));
          const _inPlan = new Set();
          executionLevels.forEach((lv) =>
            lv.forEach((n) => _inPlan.add(String(n.node_id))),
          );
          const _missing = [..._runSet].filter((id) => !_inPlan.has(id));
          if (_missing.length) {
            console.warn(
              "[SubsetRun] Node \u0111\u01B0\u1EE3c ch\u1ECDn KH\xD4NG c\xF3 trong k\u1EBF ho\u1EA1ch server:",
              _missing,
            );
            emitLog({
              message: `\u26A0\uFE0F ${_missing.length} node \u0111\u01B0\u1EE3c ch\u1ECDn kh\xF4ng n\u1EB1m trong k\u1EBF ho\u1EA1ch ch\u1EA1y \u2014 b\u1ECF qua: ${_missing.join(", ")}`,
              type: "warn",
            });
          }
          executionLevels = executionLevels
            .map((level) => level.filter((n) => _runSet.has(String(n.node_id))))
            .filter((level) => level.length > 0);
          console.log(
            "[SubsetRun] y\xEAu c\u1EA7u",
            _runSet.size,
            "node \u2192 ch\u1EA1y",
            executionLevels.reduce((a, l) => a + l.length, 0),
            "node;",
            "k\u1EBF ho\u1EA1ch server c\xF3",
            _inPlan.size,
            "node",
          );
          if (executionLevels.length === 0) {
            emitLog({
              message:
                "Kh\xF4ng c\xF3 node \u0111\u01B0\u1EE3c ch\u1ECDn n\xE0o ch\u1EA1y \u0111\u01B0\u1EE3c",
              type: "warn",
            });
            this.isRunning = false;
            return false;
          }
          log(
            "[SubsetRun] server-ordered subset levels:",
            executionLevels.map((l) => l.map((n) => n.node_name)),
          );
        }
        const executionOrder = executionLevels.flat();
        const totalNodes =
          executionOrder?.length || workflow2.nodes?.length || 0;
        startServerTracking(
          workflow2.wf_id,
          workflow2.wf_name,
          totalNodes,
          "sidebar",
        );
        if (window.ExecutionLock && !window.PromptQueue?.isEnabled?.()) {
          ExecutionLock.broadcastTracker({
            owner: "workflow",
            label: `Workflow: ${workflow2.wf_name}`,
            phase: "started",
            current: 0,
            total: executionOrder.length,
          });
        }
        log(
          "Execution order:",
          executionOrder.map((n) => n.node_name),
        );
        console.log(
          "[WorkflowExecutor] All nodes:",
          (workflow2.nodes || []).map(
            (n) =>
              `${n.node_name} (${n.node_type}, id=${n.node_id?.substring(0, 8)}, enabled=${n.enabled})`,
          ),
        );
        console.log(
          "[WorkflowExecutor] All edges:",
          (workflow2.edges || []).map(
            (e) =>
              `${e.source_node_id?.substring(0, 8)} \u2192 ${e.target_node_id?.substring(0, 8)} (${e.source_port || "default"} \u2192 ${e.target_port || "default"})`,
          ),
        );
        console.log("[WorkflowExecutor] Execution levels detail:");
        executionLevels.forEach((level, idx) => {
          console.log(
            `  Level ${idx}:`,
            level.map(
              (n) =>
                `${n.node_name} (${n.node_type}, id=${n.node_id?.substring(0, 8)})`,
            ),
          );
        });
        if (parallelExecution)
          log(
            "Parallel mode enabled, levels:",
            executionLevels.map((l) => l.map((n) => n.node_name)),
          );
        await this._batchPreResolveRefImages(executionOrder, workflow2);
        if (window.PromptQueue?.isEnabled?.()) {
          PromptQueue.getInstance().suppressReload();
        }
        const total = executionOrder.length;
        let completed = 0;
        const enabledNodes = executionOrder.filter((n) => n.enabled !== false);
        emitLog({
          message: `Workflow "${workflow2.wf_name}" - ${enabledNodes.length}/${total} nodes s\u1EBD ch\u1EA1y${parallelExecution ? " (song song)" : ""}`,
          type: "info",
        });
        emitLog({
          message: `Th\u1EE9 t\u1EF1: ${enabledNodes.map((n) => n.node_name).join(" \u2192 ")}`,
          type: "info",
        });
        for (let levelIdx = 0; levelIdx < executionLevels.length; levelIdx++) {
          if (this.shouldStop) break;
          if (levelIdx > 0) {
            try {
              const freshNodes = await window.storageManager?.getNodes?.(
                workflow2.wf_id,
              );
              if (freshNodes?.length > 0) {
                for (const fn of freshNodes) {
                  const existing = workflow2.nodes.find(
                    (n) => n.node_id === fn.node_id,
                  );
                  if (existing) {
                    const preserveEnabled = existing.enabled;
                    const preserveStatus = existing.status;
                    const preserveResultFileIds = existing.result_file_ids;
                    const preserveResultThumbnails = existing.result_thumbnails;
                    const preserveResultFileNames = existing.result_file_names;
                    const preserveResultText = existing.result_text;
                    const preserveResultFrameFileIds =
                      existing.result_frame_file_ids;
                    const preserveResultFrameThumbnails =
                      existing.result_frame_thumbnails;
                    Object.assign(existing, fn);
                    if (preserveEnabled !== void 0) {
                      existing.enabled = preserveEnabled;
                    }
                    if (
                      ["completed", "running", "failed", "skipped"].includes(
                        preserveStatus,
                      )
                    ) {
                      existing.status = preserveStatus;
                    }
                    if (preserveResultFileIds) {
                      existing.result_file_ids = preserveResultFileIds;
                    }
                    if (preserveResultThumbnails) {
                      existing.result_thumbnails = preserveResultThumbnails;
                    }
                    if (preserveResultFileNames) {
                      existing.result_file_names = preserveResultFileNames;
                    }
                    if (preserveResultText) {
                      existing.result_text = preserveResultText;
                    }
                    if (preserveResultFrameFileIds) {
                      existing.result_frame_file_ids =
                        preserveResultFrameFileIds;
                    }
                    if (preserveResultFrameThumbnails) {
                      existing.result_frame_thumbnails =
                        preserveResultFrameThumbnails;
                    }
                  }
                }
              }
            } catch (e) {}
          }
          const levelNodes = executionLevels[levelIdx];
          const serverParallelAllowed =
            levelNodes[0]?._serverStep?.parallel_allowed ?? false;
          const useParallelThisLevel =
            serverParallelAllowed && levelNodes.length > 1;
          if (
            parallelExecution &&
            !serverParallelAllowed &&
            levelNodes.length > 1
          ) {
            emitLog({
              message: `Level ${levelIdx + 1}: ch\u1EA1y tu\u1EA7n t\u1EF1 theo plan server (ChatGPT/Grok/mixed providers)`,
              type: "info",
            });
          }
          if (useParallelThisLevel) {
            const runnableNodes = levelNodes.filter(
              (n) => n.enabled !== false && n.status !== "completed",
            );
            const skipNodes = levelNodes.filter(
              (n) => n.enabled === false || n.status === "completed",
            );
            for (const node of skipNodes) {
              const reason =
                node.enabled === false
                  ? "\u0111\xE3 t\u1EAFt"
                  : "\u0111\xE3 ho\xE0n th\xE0nh";
              emitLog({
                nodeId: node.node_id,
                message: `B\u1ECF qua (${reason})`,
                type: "info",
              });
              completed++;
              emitProgress({ total, completed, current: node });
            }
            if (runnableNodes.length > 0) {
              emitLog({
                message: `--- Level ${levelIdx + 1}: ch\u1EA1y song song ${runnableNodes.length} nodes ---`,
                type: "info",
              });
              const STAGGER_DELAY_MS = executionScope
                ? 0
                : Math.max(0, this.settings.delayBetweenNodes || 0);
              const nodePromises = [];
              const flowSubmitNodes = runnableNodes.filter(
                (node) => node.node_type === "generate",
              );
              const flowSubmitGate = this._createOrderedFlowSubmitGate(
                flowSubmitNodes.length,
              );
              const flowSubmitOrder = new Map(
                flowSubmitNodes.map((node, index) => [node.node_id, index]),
              );
              const recoveryQueue = window.PromptQueue?.getInstance?.();
              if (recoveryQueue)
                recoveryQueue._phaseRWorkflowAdmitting = new Set(
                  runnableNodes.map((n) => n.node_id),
                );
              for (let i = 0; i < runnableNodes.length; i++) {
                if (i > 0) await this._sleep(STAGGER_DELAY_MS);
                const node = runnableNodes[i];
                const submitOrder = flowSubmitOrder.get(node.node_id);
                const executionMeta = Number.isInteger(submitOrder)
                  ? { flowSubmitGate, flowSubmitOrder: submitOrder }
                  : null;
                nodePromises.push(
                  this._executeSingleNode(
                    node,
                    workflow2,
                    completed,
                    total,
                    executionMeta,
                    executionScope,
                  ).finally(() => {
                    executionMeta?.flowSubmitGate?.release(
                      executionMeta.flowSubmitOrder,
                      "node_terminal",
                    );
                    recoveryQueue?._phaseRWorkflowAdmitting?.delete(
                      node.node_id,
                    );
                  }),
                );
              }
              const results = await Promise.allSettled(nodePromises);
              for (let i = 0; i < results.length; i++) {
                completed++;
                emitProgress({ total, completed, current: runnableNodes[i] });
                await this._updateWorkflowProgress(
                  completed,
                  total,
                  runnableNodes[i].node_id,
                );
                if (
                  results[i].status === "rejected" &&
                  this.settings.stopOnError
                ) {
                  this.shouldStop = true;
                  break;
                }
              }
            }
          } else {
            for (const node of levelNodes) {
              if (this.shouldStop) {
                log("Execution stopped by user");
                emitLog({
                  message:
                    "Workflow b\u1ECB d\u1EEBng b\u1EDFi ng\u01B0\u1EDDi d\xF9ng",
                  type: "warn",
                });
                break;
              }
              this.currentNode = node;
              updateCurrentNode(workflow2.wf_id, node.node_id, claim.runId);
              if (node.enabled === false) {
                emitLog({
                  nodeId: node.node_id,
                  message: `B\u1ECF qua (\u0111\xE3 t\u1EAFt)`,
                  type: "info",
                });
                completed++;
                emitProgress({ total, completed, current: node });
                continue;
              }
              if (node.status === "completed") {
                emitLog({
                  nodeId: node.node_id,
                  message: `B\u1ECF qua (\u0111\xE3 ho\xE0n th\xE0nh)`,
                  type: "info",
                });
                completed++;
                emitProgress({ total, completed, current: node });
                continue;
              }
              try {
                await this._executeSingleNode(
                  node,
                  workflow2,
                  completed,
                  total,
                  null,
                  executionScope,
                );
              } catch (nodeError) {
                if (this.settings.stopOnError) {
                  this.shouldStop = true;
                  break;
                }
                log(
                  "Node failed, continuing with next nodes:",
                  node.node_name,
                  nodeError.message,
                );
              }
              completed++;
              emitProgress({ total, completed, current: node });
              if (window.ExecutionLock && !window.PromptQueue?.isEnabled?.()) {
                ExecutionLock.broadcastTracker({
                  owner: "workflow",
                  label: `Workflow: ${workflow2.wf_name}`,
                  phase: "prompt_submitting",
                  current: completed,
                  total,
                  promptText: node.node_name,
                });
              }
              await this._updateWorkflowProgress(
                completed,
                total,
                node.node_id,
              );
            }
          }
          if (this.shouldStop && this._captchaHalted && !this._captchaDecided) {
            this._captchaDecided = true;
            const decision = await this._handleCaptchaDecision();
            if (decision === "continue") {
              const resumed = await this._resumeApiUnusualWorkflowJobs();
              if (resumed) {
                this._captchaHalted = false;
                this.shouldStop = false;
                emitLog({
                  message:
                    "Captcha: ng\u01B0\u1EDDi d\xF9ng ch\u1ECDn TI\u1EBEP T\u1EE4C \u2014 ch\u1EA1y c\xE1c node c\xF2n l\u1EA1i (n\u1EBFu c\xF3).",
                  type: "warn",
                });
              } else {
                emitLog({
                  message:
                    "Captcha: kh\xF4ng th\u1EC3 ti\u1EBFp t\u1EE5c job \u0111\xE3 t\u1EA1m d\u1EEBng \u2014 workflow s\u1EBD d\u1EEBng an to\xE0n.",
                  type: "error",
                });
              }
            } else {
              emitLog({
                message:
                  "Captcha: ng\u01B0\u1EDDi d\xF9ng ch\u1ECDn D\u1EEANG workflow.",
                type: "warn",
              });
            }
          }
          if (levelIdx < executionLevels.length - 1 && !this.shouldStop) {
            const delaySec = Math.round(this.settings.delayBetweenNodes / 1e3);
            emitLog({
              message: `Ch\u1EDD ${delaySec}s tr\u01B0\u1EDBc level ti\u1EBFp theo...`,
              type: "info",
            });
            await this._sleep(this.settings.delayBetweenNodes);
          }
        }
        await this._flushNodeStateBuffer();
        const finalStatus = this.shouldStop ? "paused" : "completed";
        try {
          await this._updateWorkflowStatus(finalStatus);
        } catch (statusErr) {
          const isRateLimit =
            statusErr?.code === "RATE_LIMITED" || statusErr?.httpStatus === 429;
          if (isRateLimit) {
            console.warn(
              `[WorkflowExecutor] _updateWorkflowStatus(${finalStatus}) rate-limited (429) \u2014 gi\u1EEF status local, sync sau`,
            );
            if (this.currentWorkflow) this.currentWorkflow.status = finalStatus;
          } else {
            throw statusErr;
          }
        }
        emitLog({
          message:
            finalStatus === "completed"
              ? `Workflow "${workflow2.wf_name}" ho\xE0n th\xE0nh! (${completed}/${total} nodes)`
              : `Workflow "${workflow2.wf_name}" \u0111\xE3 d\u1EEBng (${completed}/${total} nodes)`,
          type: finalStatus === "completed" ? "success" : "warn",
        });
        if (window.ExecutionGate && this._currentExecutionToken) {
          try {
            const hasFailedNodes = Object.values(
              this._nodeStatesLive || {},
            ).some((status) => status === "failed");
            const successfulCount = this._workflowSuccessCounts?.total || 0;
            const finalStatus2 =
              this.shouldStop || hasFailedNodes
                ? successfulCount > 0
                  ? "partial"
                  : "failed"
                : "success";
            const resultData = {};
            if (finalStatus2 === "partial" && this._workflowSuccessCounts) {
              resultData.successful_count =
                this._workflowSuccessCounts.total || 0;
            }
            await ExecutionGate.complete(
              this._currentExecutionToken,
              finalStatus2,
              resultData,
            );
          } catch (err) {
            console.error(
              "[WorkflowExecutor] ExecutionGate.complete failed:",
              err,
            );
          }
          this._currentExecutionToken = null;
        }
        if (window.featureGate && this._workflowPromptCounts) {
          const counts =
            this._workflowSuccessCounts || this._workflowPromptCounts;
          window.featureGate.recordWorkflowRun();
          if (counts.flow > 0) window.featureGate.recordGenRun();
          if (counts.chatgpt > 0)
            window.featureGate.recordChatGPTRun(counts.chatgpt);
          if (counts.grok > 0) window.featureGate.recordGrokRun(counts.grok);
          if (counts.total > 0)
            window.featureGate.recordPromptSubmit(counts.total, "workflow");
          if (counts.flow > 0)
            window.featureGate._incrementDailyStat(
              "flow_prompt_total",
              counts.flow,
            );
          if (counts.chatgpt > 0)
            window.featureGate._incrementDailyStat(
              "chatgpt_prompt_total",
              counts.chatgpt,
            );
          if (counts.grok > 0)
            window.featureGate._incrementDailyStat(
              "grok_prompt_total",
              counts.grok,
            );
          this._workflowPromptCounts = null;
          this._workflowSuccessCounts = null;
        }
        try {
          window.ProviderTabLock?.reset();
        } catch (e) {}
        await this._restoreFlowZoom("workflow-success");
        window.eventBus.emit("execution:completed", {
          workflow: this.currentWorkflow,
          stopped: this.shouldStop,
        });
        broadcastEvent("execution:completed", { stopped: this.shouldStop });
        window.UsageSync?.trackEvent("workflow_complete", {
          workflow_id: workflow2.wf_id,
          success: !this.shouldStop,
        });
        if (!this.shouldStop) {
          window.eventBus.emit("workflow:complete", {
            workflowId: workflow2.wf_id,
            workflowName: workflow2.wf_name,
            completedCount: completed,
            totalCount: total,
          });
        }
        if (window.ExecutionLock && !window.PromptQueue?.isEnabled?.()) {
          ExecutionLock.broadcastTracker({
            owner: "workflow",
            phase: "completed",
            current: completed,
            total,
          });
        }
        if (
          !this.shouldStop &&
          typeof notifyCompletion === "function" &&
          this.currentWorkflow?.wf_name
        ) {
          notifyCompletion(
            "Toby Flow",
            `Workflow "${this.currentWorkflow.wf_name}" \u0111\xE3 ho\xE0n th\xE0nh!`,
          );
        }
        this._executionSuccess = true;
        this._completedNodesCount = completed;
        this._executionSummary = {
          completed_count: completed,
          total_count: total,
        };
        log("Workflow execution finished");
        return true;
      } catch (error) {
        console.error("[WorkflowExecutor] Workflow execution error:", {
          message: error?.message,
          name: error?.name,
          code: error?.code,
          httpStatus: error?.httpStatus,
          exception: error?.exception,
          details: error?.details,
          stack: error?.stack,
        });
        try {
          emitLog({
            message: `\u274C Workflow execution error: ${error?.message || "unknown"}`,
            type: "error",
          });
        } catch (_) {}
        try {
          await this._flushNodeStateBuffer();
        } catch (e) {}
        if (window.ExecutionGate && this._currentExecutionToken) {
          try {
            await ExecutionGate.complete(
              this._currentExecutionToken,
              "failed",
              { error: error.message },
            );
          } catch (err) {
            console.error(
              "[WorkflowExecutor] ExecutionGate.complete failed:",
              err,
            );
          }
          this._currentExecutionToken = null;
        }
        if (window.ExecutionLock && !window.PromptQueue?.isEnabled?.()) {
          ExecutionLock.broadcastTracker({ owner: "workflow", phase: "error" });
        }
        await this._updateWorkflowStatus("error");
        window.UsageSync?.trackEvent("workflow_complete", {
          workflow_id: this.currentWorkflow?.wf_id || workflowId,
          success: false,
        });
        this._executionSuccess = false;
        this._executionSummary = { error: error.message };
        await this._restoreFlowZoom("workflow-error");
        window.eventBus.emit("execution:completed", {
          workflow: this.currentWorkflow,
          error,
        });
        broadcastEvent("execution:completed", {
          error: {
            message: error.message,
            flowApiFailure: error.flowApiFailure === true,
          },
        });
        return false;
      } finally {
        window._workflowRefPreflightCache = null;
        this.isRunning = false;
        this._manualSubmitMode = false;
        this._executionInProgress = false;
        this._nodeStateBuffer.clear();
        this._nodeStatesLive = {};
        this._nodeStatesDirty = false;
        this._stopBufferCheckpoint();
        this._clearBufferCheckpoint(workflowId);
        await this._restoreFlowZoom("workflow-finally");
        try {
          window.ProviderTabLock?.reset();
        } catch (_) {}
        if (window.PromptQueue?.isEnabled?.()) {
          try {
            const queue = PromptQueue.getInstance();
            queue.unsuppressReload();
            const refreshed = await queue.flushPendingApiRefresh(
              "workflow-api-results-refresh",
              { scope: "workflow", workflowId },
            );
            if (this._workflowApiPreviewRequests?.size > 0) {
              window.eventBus?.emit("node:api_preview_refresh", {
                requests: [...this._workflowApiPreviewRequests.values()],
                boardReady: !!refreshed,
              });
            }
          } catch (error) {
            console.warn(
              "[WorkflowExecutor] API board refresh failed:",
              error?.message,
            );
            if (this._workflowApiPreviewRequests?.size > 0) {
              window.eventBus?.emit("node:api_preview_refresh", {
                requests: [...this._workflowApiPreviewRequests.values()],
                boardReady: false,
              });
            }
          }
        }
        this._workflowApiPreviewRequests?.clear?.();
        this.currentWorkflow = null;
        this.currentNode = null;
        const finalStatus = this.shouldStop
          ? "stopped"
          : this._executionSuccess
            ? "completed"
            : "failed";
        completeServerTracking(
          finalStatus,
          this._executionSummary || null,
          this._completedNodesCount || 0,
        );
      }
    }
    canAcceptSingleNode(workflowId) {
      return this._singleNodeSession?.accepts(workflowId) === true;
    }
    isSingleNodeActive(nodeId) {
      return (
        this._singleNodeSession?.records.has(String(nodeId)) === true ||
        this._singleNodeRemoteState?.nodes?.some(
          (node) => String(node.nodeId) === String(nodeId),
        ) === true
      );
    }
    stopSingleNode(nodeId, stopSource) {
      if (this._singleNodeSession)
        return this._singleNodeSession.stopNode(nodeId, stopSource);
      if (!this.isSingleNodeActive(nodeId)) return false;
      const remote = this._singleNodeRemoteState;
      chrome.runtime
        .sendMessage({
          action: "workflow:stop_single_node",
          workflowId: remote.workflowId,
          runId: remote.runId,
          nodeId,
          stopSource,
        })
        .catch((error) =>
          console.warn(
            "[WorkflowSingleNode] remote stop failed:",
            error.message,
          ),
        );
      return true;
    }
    async executeSingleNode(workflowId, nodeId, opts = {}) {
      return this._admitSingleNode(workflowId, nodeId, opts);
    }
    _admitSingleNode(workflowId, nodeId, opts = {}) {
      if (this._singleNodeSession) {
        if (!this.canAcceptSingleNode(workflowId))
          throw Object.assign(new Error("SINGLE_NODE_SESSION_STOPPING"), {
            code: "SINGLE_NODE_SESSION_STOPPING",
          });
        return this._singleNodeSession.enqueue(nodeId, opts);
      }
      if (this.isRunning || this._executionTask)
        throw Object.assign(new Error("WORKFLOW_EXECUTION_BUSY"), {
          code: "WORKFLOW_EXECUTION_BUSY",
        });
      const session = new window.WorkflowSingleNodeSession(this, workflowId);
      this._singleNodeSession = session;
      const completion = session.enqueue(nodeId, opts);
      this._runOwnedExecution(
        () => this._runSingleNodeSession(session),
        workflowId,
      ).catch((error) => session.fail(error));
      return completion;
    }
    async _runSingleNodeSession(session) {
      let queue = null;
      let deferred = false;
      let started = false;
      try {
        const claim = await claimRunningFlag(
          session.workflowId,
          null,
          "single_nodes",
        );
        if (!claim.ok) {
          console.warn(
            "[WorkflowSingleNode] Admission rejected by live owner",
            {
              workflowId: session.workflowId,
              runningWorkflowId: claim.runningWfId,
              runningWorkflowName: claim.runningWfName,
              reason: claim.reason,
            },
          );
          throw Object.assign(new Error("CROSS_CONTEXT_RUNNING"), {
            code: "CROSS_CONTEXT_RUNNING",
          });
        }
        session.runId = claim.runId;
        this._flowRunId = claim.runId;
        this._startHeartbeat(session.workflowId, claim.runId);
        this.isRunning = true;
        this.shouldStop = session.stopping;
        this._flowZoomMayBeArmed = false;
        this._flowZoomRestoreConfirmed = false;
        this._flowStopResetPromise = null;
        this._apiBoardReloaded = false;
        this._geminiTrackerJobs = new Map();
        this._captchaHalted = false;
        this._captchaDecided = false;
        this._captchaText = "";
        this._webRefReplacements = new Map();
        if (
          !this._singleNodeSessionWorker ||
          !(window._workflowRefPreflightCache instanceof Map)
        )
          window._workflowRefPreflightCache = new Map();
        const workflow2 = await window.storageManager.getWorkflow(
          session.workflowId,
        );
        if (!workflow2) throw new Error("Workflow not found");
        this.currentWorkflow = workflow2;
        await updateRunningFlagName(
          workflow2.wf_id,
          workflow2.wf_name,
          claim.runId,
        );
        this._ensureFlowCaptchaListener();
        if (!session.stopping) await this._resetFlowStopForRun();
        window.ExecutionLock?.acquire("workflow", workflow2.wf_name);
        if (window.PromptQueue?.isEnabled?.()) {
          queue = window.PromptQueue.getInstance();
          queue.deferApiRefresh();
          deferred = true;
        }
        started = true;
        window.eventBus?.emit("execution:started", {
          workflow: workflow2,
          singleNode: true,
          singleNodeSession: true,
        });
        broadcastEvent("execution:started", {
          workflow: { wf_id: workflow2.wf_id, wf_name: workflow2.wf_name },
          singleNode: true,
          singleNodeSession: true,
        });
        session.setReady(workflow2);
        if (session.stopping) session.stopAll("SESSION_STOP_BEFORE_READY");
        await session.done;
      } catch (error) {
        session.fail(error);
        throw error;
      } finally {
        await this._restoreFlowZoom("single-node-session");
        if (deferred) {
          queue.releaseApiRefresh();
          let boardReady = false;
          try {
            boardReady = !!(await queue.flushPendingApiRefresh(
              "single-node-session-results",
              { scope: "workflow", workflowId: session.workflowId },
            ));
          } catch (error) {
            console.warn(
              "[WorkflowSingleNode] board refresh failed:",
              error.message,
            );
          }
          if (session.previewRequests.size)
            window.eventBus?.emit("node:api_preview_refresh", {
              requests: [...session.previewRequests.values()],
              boardReady,
            });
        }
        window._workflowRefPreflightCache = null;
        this.isRunning = false;
        if (started) {
          const data = {
            workflow: this.currentWorkflow,
            workflowId: session.workflowId,
            singleNode: true,
            singleNodeSession: true,
            stopped: session.stopping,
            error: session.error
              ? { message: session.error.message, code: session.error.code }
              : null,
          };
          window.eventBus?.emit("execution:completed", data);
          broadcastEvent("execution:completed", data);
        }
        this.currentWorkflow = null;
        this.currentNode = null;
        this._singleNodeSession = null;
      }
    }
    _publishSingleNodeRejected(nodeId, error, workflowId) {
      const data = {
        nodeId,
        workflowId,
        error: { message: error.message, code: error.code },
      };
      window.eventBus?.emit("node:run_rejected", data);
      broadcastEvent("node:run_rejected", data);
    }
    _publishQueuedNodeCancelled(node, workflowId) {
      window.eventBus?.emit("node:queue_cancelled", { node, workflowId });
      broadcastEvent("node:queue_cancelled", {
        node: { node_id: node.node_id },
        workflowId,
      });
    }
    _publishSingleNodeState(session) {
      if (!session.runId) return;
      const data = {
        workflowId: session.workflowId,
        runId: session.runId,
        nodes: session.state(),
      };
      window.eventBus?.emit("execution:single_node_state", data);
      broadcastEvent("execution:single_node_state", data);
      if (this._flowRunId)
        mutateRunningFlag(async () => {
          const stored = await new Promise((resolve) =>
            chrome.storage.local.get(["af_running_workflow"], resolve),
          );
          const flag = stored.af_running_workflow;
          if (flag?.run_id !== data.runId || flag.wf_id !== data.workflowId)
            return;
          await new Promise((resolve) =>
            chrome.storage.local.set(
              {
                af_running_workflow: {
                  ...flag,
                  single_node_states: data.nodes,
                  executor_context: "single_nodes",
                },
              },
              resolve,
            ),
          );
        }).catch((error) =>
          console.warn(
            "[WorkflowSingleNode] state lease update failed:",
            error.message,
          ),
        );
      const queue = window.PromptQueue?.getInstance?.();
      if (queue) queue._throttledBroadcast?.(queue._buildSnapshot());
    }
    _createSingleNodeWorker(session, record) {
      const worker = new WorkflowExecutor({ singleNodeWorker: true });
      worker._singleNodeSessionWorker = session;
      worker._singleNodeRecord = record;
      worker._flowAdmissionAbortController = new AbortController();
      worker._flowReadAbortController = new AbortController();
      worker._flowRunId = this._flowRunId;
      worker.settings = { ...this.settings };
      worker._refreshSettingsFromExecutionConfig();
      worker._historySource = this._historySource;
      worker._resetFlowStopForRun = (...args) =>
        this._resetFlowStopForRun(...args);
      worker._webRefReplacements = this._webRefReplacements;
      return worker;
    }
    _stopSingleNodeWorker(record, stopSource) {
      const worker = record.worker;
      if (!worker) return;
      worker.shouldStop = true;
      worker._flowAdmissionAbortController?.abort();
      worker._flowReadAbortController?.abort();
      if (
        record.generationStarted === true &&
        record.liveNode?.status === "completed"
      ) {
        record.stopAfterResult = true;
        return;
      }
      const queue = window.PromptQueue?.getInstance?.();
      for (const job of queue?.getJobsByOwner?.("workflow") || []) {
        if (
          job.workflowRunId === this._flowRunId &&
          String(job.workflowNodeId) === record.nodeId
        ) {
          queue.stopJob(job.id, {
            stopOrigin: "user",
            stopReason: "USER_CANCELLED",
            stopSource,
          });
        }
      }
      if (worker._currentExecutionToken) {
        worker._singleNodeCancelPromise = window.ExecutionGate?.cancel?.(
          worker._currentExecutionToken,
          { waitForSettlement: true },
        )?.catch?.((error) =>
          console.warn(
            "[WorkflowSingleNode] token cancel failed:",
            error.message,
          ),
        );
        worker._currentExecutionToken = null;
      }
      if (record.generationStarted !== true) return;
      const requestedAt = Date.now();
      const provider =
        record.node?.node_type === "prompt" && record.node.use_ai === true
          ? record.node.provider || "chatgpt"
          : record.node?.node_type;
      const sessionApi = {
        chatgpt: window.ChatGPTSession,
        grok: window.GrokSession,
        gemini: window.GeminiSession,
        muse: window.MuseSession,
      }[provider];
      let abortPromise;
      if (sessionApi?.abort) abortPromise = sessionApi.abort({ requestedAt });
      else if (sessionApi?.getTabInfo)
        abortPromise = sessionApi.getTabInfo().then((info) => {
          if (!info?.tabId) return { providerStopped: false, error: "NO_TAB" };
          return window.MessageBridge?.[`${provider}Abort`]?.(info.tabId, {
            requestedAt,
          });
        });
      if (abortPromise)
        worker._singleNodeProviderAbortPromise = Promise.resolve(abortPromise)
          .then((response) => {
            if (
              response?.providerStopped === true ||
              (provider === "muse" && response?.success === true)
            )
              return;
            throw new Error(response?.error || "PROVIDER_STOP_UNCONFIRMED");
          })
          .catch((error) => {
            if (this._singleNodeSession)
              this._singleNodeSession.browserStopError = error;
            console.warn(
              "[WorkflowSingleNode] provider stop unconfirmed:",
              provider,
              error.message,
            );
          });
    }
    async _executeSingleNodeOwned(workflowId, nodeId, opts = {}) {
      const managed = this._singleNodeSessionWorker;
      this._singleNodeGenerationStarted = false;
      this._singleNodeStartPromise = null;
      this._singleNodeStartError = null;
      const generationHistoryStartedAt = Date.now();
      console.info(
        "[WorkflowRunStartup] single node requested",
        JSON.stringify({
          workflowId,
          nodeId,
          ...window.MessageBridge?._flowPerfMemorySnapshot?.(),
        }),
      );
      this._ensureFlowCaptchaListener();
      if (this.isRunning) {
        throw new Error("\u0110ang c\xF3 workflow kh\xE1c \u0111ang ch\u1EA1y");
      }
      let singleNodeQueue = null;
      let singleNodeApiRefreshDeferred = false;
      let singleNodeApiResult = false;
      let singleNodePreviewRequest = null;
      let terminalNodeId = nodeId;
      let terminalWorkflowId = workflowId;
      const isPopupCtxEarly =
        window.location?.pathname?.includes("workflow-editor") ||
        window.location?.pathname?.includes("popup");
      const claim = managed
        ? { ok: true, runId: managed.owner._flowRunId }
        : await claimRunningFlag(
            workflowId,
            null,
            isPopupCtxEarly ? "popup" : "sidebar",
          );
      if (!claim.ok) {
        const err = new Error(
          `"${claim.runningWfName}" \u0111ang ch\u1EA1y \u1EDF c\u1EEDa s\u1ED5 kh\xE1c`,
        );
        err.code = "CROSS_CONTEXT_RUNNING";
        throw err;
      }
      try {
        this._flowRunId = claim.runId;
        if (!managed) this._startHeartbeat(workflowId, claim.runId);
        this.isRunning = true;
        this._flowWebRecoveryPolicy = null;
        if (!managed) this._webRefReplacements = new Map();
        this._flowZoomRestoreConfirmed = false;
        this._flowZoomMayBeArmed = false;
        this.shouldStop =
          this._flowAdmissionAbortController?.signal.aborted === true;
        this._geminiTrackerJobs = new Map();
        this._portableUploadStopReset = null;
        this._flowStopResetPromise = null;
        this._captchaHalted = false;
        this._captchaDecided = false;
        this._captchaText = "";
        this._manualSubmitMode = opts?.manualSubmitMode === true;
        this._submittedNodes = new Set();
        this._currentExecutionToken = null;
        this._singleNodeExecutionToken = null;
        this._downloadNoReplayTileIds = new Set();
        if (!managed) window._workflowRefPreflightCache = null;
        let workflow2;
        try {
          workflow2 = await window.storageManager.getWorkflow(workflowId);
        } catch (loadErr) {
          if (loadErr.code === "CONNECTION_ERROR") throw loadErr;
          throw loadErr;
        }
        if (!workflow2)
          throw new Error(
            "Workflow kh\xF4ng t\u1ED3n t\u1EA1i ho\u1EB7c \u0111\xE3 b\u1ECB x\xF3a",
          );
        if (opts.refreshDefinition === true) {
          const fresh =
            await window.storageManager.getWorkflowDefinitionFresh(workflowId);
          workflow2 = { ...workflow2, nodes: fresh.nodes, edges: fresh.edges };
        }
        terminalWorkflowId = workflow2.wf_id;
        if (!Array.isArray(workflow2.nodes)) workflow2.nodes = [];
        if (!Array.isArray(workflow2.edges)) workflow2.edges = [];
        if (window.featureGate && workflow2.nodes.length > 0) {
          try {
            const nodeQuota = window.featureGate.checkQuota(
              "workflows_nodes_max",
            );
            const limit = nodeQuota?.limit;
            if (
              limit !== "unlimited" &&
              limit !== "-1" &&
              limit > 0 &&
              workflow2.nodes.length > limit
            ) {
              console.info(
                "[WorkflowExecutor] Single-run legacy workflow over-quota: " +
                  workflow2.nodes.length +
                  "/" +
                  limit,
              );
            }
          } catch (e) {}
        }
        this.currentWorkflow = workflow2;
        this._apiBoardReloaded = false;
        const node = workflow2.nodes.find((n) => n.node_id === nodeId);
        if (!node) throw new Error("Node not found");
        terminalNodeId = node.node_id;
        console.log(
          "[WorkflowExecutor] executeSingleNode loaded node:",
          "node_id=" + node.node_id,
          "node_type=" + node.node_type,
          "prompt_mode=" + (node.prompt_mode || "all(default)"),
          "ref_mode=" + (node.ref_mode || "all(default)"),
          "watermark_mode=" + (node.watermark_mode ?? "(thi\u1EBFu)"),
        );
        if (
          ["image", "generate", "chatgpt", "grok", "gemini", "muse"].includes(
            node.node_type,
          )
        ) {
          await this._resetFlowStopForRun((message) => log(message));
        }
        await updateRunningFlagName(
          workflow2.wf_id,
          workflow2.wf_name,
          claim.runId,
        );
        let promptCount = 0;
        if (node.node_type === "generate") {
          promptCount = 1;
        } else if (node.node_type === "chatgpt") {
          promptCount = 1;
        } else if (node.node_type === "grok" || node.node_type === "gemini") {
          promptCount = 1;
        }
        if (promptCount === 0) promptCount = 1;
        if (this.shouldStop)
          throw Object.assign(new Error("ABORTED"), {
            code: "ABORTED",
            workflowUserStopped: true,
          });
        if (!managed && window.ExecutionLock)
          ExecutionLock.acquire("workflow", "");
        if (window.ExecutionGate) {
          try {
            const gate = await ExecutionGate.request(
              "workflow_run",
              promptCount,
              {
                owner: "workflow",
                label: `single_node:${nodeId}`,
                node_count: 1,
              },
            );
            if (!gate.allowed) {
              ExecutionGate.showDeniedDialog(gate, "Workflow");
              this.isRunning = false;
              if (!managed && window.ExecutionLock)
                ExecutionLock.release("workflow");
              throw new Error(
                gate.reason === "QUOTA_EXCEEDED"
                  ? "\u0110\xE3 h\u1EBFt l\u01B0\u1EE3t ch\u1EA1y Workflow h\xF4m nay"
                  : "Kh\xF4ng \u0111\u01B0\u1EE3c ph\xE9p ch\u1EA1y Workflow",
              );
            }
            this._currentExecutionToken = gate.token;
            this._singleNodeExecutionToken = gate.token;
            console.log(
              "[WorkflowExecutor] executeSingleNode ExecutionGate token:",
              gate.token,
              "promptCount:",
              promptCount,
            );
          } catch (e) {
            if (window.QuotaErrorHandler?.isQuotaError(e)) {
              this.isRunning = false;
              if (!managed && window.ExecutionLock)
                ExecutionLock.release("workflow");
              throw e;
            }
            console.error(
              "[WorkflowExecutor] executeSingleNode ExecutionGate failed, ABORTING (Server-Only):",
              e.message,
            );
            this.isRunning = false;
            if (!managed && window.ExecutionLock)
              ExecutionLock.release("workflow");
            throw new Error(
              `Kh\xF4ng th\u1EC3 xin ph\xE9p server ch\u1EA1y node: ${e.message || "unknown"}. Vui l\xF2ng ki\u1EC3m tra k\u1EBFt n\u1ED1i v\xE0 th\u1EED l\u1EA1i.`,
            );
          }
        }
        if (this.shouldStop)
          throw Object.assign(new Error("ABORTED"), {
            code: "ABORTED",
            workflowUserStopped: true,
          });
        this.currentNode = node;
        if (managed) this._singleNodeRecord.liveNode = node;
        const deferGenerationStart = managed && node.node_type === "generate";
        if (deferGenerationStart) {
          window.eventBus?.emit("node:queued", { workflowId, node });
          broadcastEvent("node:queued", {
            workflowId,
            node: { node_id: node.node_id, node_name: node.node_name },
          });
        } else await this._startSingleNodeGeneration(node);
        this._flowZoomMayBeArmed = node.node_type === "generate";
        node._effective_prompt =
          NODES_CAN_USE_MENTIONS.includes(node.node_type) &&
          node.node_type !== "prompt"
            ? this._resolveEffectivePrompt(node, workflow2).text
            : node.prompt || "";
        updateCurrentNode(workflow2.wf_id, node.node_id, claim.runId);
        if (!managed && window.ExecutionLock)
          ExecutionLock.acquire("workflow", `Node: ${node.node_name}`);
        log(`Running single node: "${node.node_name}"`);
        if (window.ExecutionLock && !window.PromptQueue?.isEnabled?.()) {
          ExecutionLock.broadcastTracker({
            owner: "workflow",
            label: `Node: ${node.node_name}`,
            phase: "started",
            current: 0,
            total: 1,
            promptText:
              node._effective_prompt?.substring(0, 60) || node.node_name,
          });
        }
        if (!managed)
          window.eventBus.emit("execution:started", {
            workflow: workflow2,
            singleNode: true,
          });
        if (!managed)
          broadcastEvent("execution:started", {
            workflow: { wf_id: workflow2.wf_id, wf_name: workflow2.wf_name },
            singleNode: true,
          });
        const singleNodeApiIntended =
          node.node_type === "generate" &&
          window.FlowApiAdapter?.isApiModeIntended?.({ forWorkflow: true }) ===
            true;
        if (singleNodeApiIntended) {
          await this._batchPreResolveRefImages([node], workflow2);
        }
        if (
          node.node_type === "generate" &&
          window.MessageBridge &&
          window.FlowApiAdapter?.isApiModeIntended?.({ forWorkflow: true }) !==
            true
        ) {
          try {
            await window.MessageBridge.sendToContentScript(
              "beginFlowZoomSession",
              { factor: 0.3, hold: true },
            );
          } catch (e) {}
        }
        if (
          node.node_type === "generate" &&
          window.PromptQueue?.isEnabled?.()
        ) {
          singleNodeQueue = PromptQueue.getInstance();
          singleNodeQueue.deferApiRefresh();
          singleNodeApiRefreshDeferred = true;
        }
        const result = await this._executeNode(node, workflow2);
        if (managed && this.shouldStop)
          throw Object.assign(new Error("ABORTED"), {
            code: "ABORTED",
            workflowUserStopped: true,
          });
        await this._healFlowVideoResult(node, result);
        singleNodeApiResult = result?.genMode === "api";
        if (singleNodeApiResult) {
          const missingPreviewIds = (result.fileIds || []).filter((fid) => {
            const info = result.thumbnails?.[fid];
            return typeof info === "string"
              ? !info
              : !(info?.thumbnail || info?.video_url);
          });
          singleNodePreviewRequest = {
            nodeId: node.node_id,
            fileIds: missingPreviewIds,
            displayFileIds: Array.isArray(result.fileIds)
              ? [...result.fileIds]
              : [],
          };
        }
        const genProducingTypes = ["generate", "chatgpt", "grok", "gemini"];
        if (
          genProducingTypes.includes(node.node_type) &&
          (!result.fileIds || result.fileIds.length === 0)
        ) {
          if (result?._userSkipped === true) {
            const reason =
              window.I18n?.t?.("workflow.userSkippedNode") ||
              "User skipped manual submit";
            console.log(
              "[WorkflowExecutor] executeSingleNode SKIPPED (manual):",
              node.node_id,
              reason,
            );
            await this._updateNodeStatus(node.node_id, "skipped", null, reason);
            window.eventBus?.emit("node:warning", { node, message: reason });
            return;
          }
          throw this._emptyGenerationResultError(result);
        }
        if (result.thumbnails && Object.keys(result.thumbnails).length > 0) {
          node.result_thumbnails = {
            ...(node.result_thumbnails || {}),
            ...result.thumbnails,
          };
        }
        if (result.fileNames && Object.keys(result.fileNames).length > 0) {
          node.result_file_names = {
            ...(node.result_file_names || {}),
            ...result.fileNames,
          };
        }
        if (
          result.providerUrls &&
          Object.keys(result.providerUrls).length > 0
        ) {
          node.result_provider_urls = {
            ...(node.result_provider_urls || {}),
            ...result.providerUrls,
          };
        }
        if (result.genMode) {
          node.result_gen_mode = result.genMode;
          const _origN = this.currentWorkflow?.nodes?.find(
            (n) => n.node_id === node.node_id,
          );
          if (_origN) _origN.result_gen_mode = result.genMode;
        }
        window.eventBus?.emit("node:preview_available", { node, result });
        const lastFramePromise = this._maybeExtractLastFrame(
          node,
          result,
          workflow2,
        );
        const singleHasImmediatePreview = (result.fileIds || []).some((fid) => {
          const info = result.thumbnails?.[fid];
          return typeof info === "string"
            ? !!info
            : !!(info?.thumbnail || info?.video_url);
        });
        const deferSingleApiPreview =
          singleNodeApiResult && !singleHasImmediatePreview;
        window.eventBus.emit("node:completed", {
          node,
          result,
          deferApiPreviewRefresh: deferSingleApiPreview,
        });
        broadcastEvent("node:completed", {
          node: { node_id: node.node_id, node_name: node.node_name },
          result: {
            fileIds: result.fileIds,
            duration: result.duration,
            thumbnails: result.thumbnails,
            partialFailureMessage: result.partialFailureMessage || null,
          },
          deferApiPreviewRefresh: deferSingleApiPreview,
        });
        await lastFramePromise;
        await this._updateNodeStatus(
          node.node_id,
          "completed",
          result.fileIds,
          result.partialFailureMessage || null,
          {
            result_thumbnails: node.result_thumbnails,
            result_file_names: node.result_file_names,
            result_provider_urls: node.result_provider_urls,
            result_text: node.result_text,
            result_source: node.result_source,
            result_frame_file_ids: node.result_frame_file_ids,
            result_frame_thumbnails: node.result_frame_thumbnails,
            result_clean_file_ids: node.result_clean_file_ids,
            result_clean_thumbnails: node.result_clean_thumbnails,
          },
        );
        const promptProducingTypes = [
          "generate",
          "chatgpt",
          "grok",
          "gemini",
          "muse",
        ];
        if (
          promptProducingTypes.includes(node.node_type) &&
          result.fileIds?.length > 0
        ) {
          const nodeProvider =
            node.node_type === "chatgpt"
              ? "chatgpt"
              : node.node_type === "grok"
                ? "grok"
                : node.node_type === "gemini"
                  ? "gemini"
                  : node.node_type === "muse"
                    ? "muse"
                    : "flow";
          const isVideoNode =
            node.media_type === "Video" ||
            (node.node_type === "grok" && node.grok_mode === "video") ||
            (node.node_type === "muse" && node.muse_mode === "video");
          const wfThumbs = (result.fileIds || [])
            .map((fid) => {
              const t = result.thumbnails?.[fid];
              if (!t) return null;
              return {
                thumbnail: typeof t === "string" ? t : t.thumbnail,
                type:
                  typeof t === "object" && t.type
                    ? t.type
                    : isVideoNode
                      ? "video"
                      : "image",
                file_name: typeof t === "object" ? t.file_name || "" : "",
                ...(typeof t === "object" && t.media_uuid
                  ? { media_uuid: t.media_uuid }
                  : {}),
                ...(typeof t === "object" && t.video_url
                  ? { video_url: t.video_url }
                  : {}),
                ...(typeof t === "object" && t.thumb_is_poster === true
                  ? { thumb_is_poster: true }
                  : {}),
              };
            })
            .filter(Boolean);
          window.eventBus.emit("prompt:completed", {
            prompt:
              node._effective_prompt ??
              this._resolveEffectivePrompt(node, workflow2).text,
            media_type: isVideoNode ? "Video" : node.media_type || "image",
            model: this._historyModelForNode(node, nodeProvider, result),
            ratio: node.ratio || "",
            prompt_count: 1,
            quantity: parseInt(node.quantity) || 1,
            ref_file_ids:
              Array.isArray(result.refFileIdsUsed) &&
              result.refFileIdsUsed.length
                ? result.refFileIdsUsed.join(", ")
                : node.ref_file_ids || "",
            ref_thumbnails: this._historyNodeRefThumbnails(
              node,
              workflow2,
              result.refFileIdsUsed,
            ),
            result_file_ids: (result.fileIds || []).join(", "),
            result_thumbnails: wfThumbs,
            result_provider_urls: result.providerUrls || {},
            flow_api_versions: result.flowApiVersions || [],
            gen_mode:
              result.historyRoute?.genMode ??
              (nodeProvider === "flow" ? result.genMode || "web" : null),
            initial_gen_mode:
              result.historyRoute?.initialGenMode ??
              (nodeProvider === "flow" ? result.genMode || "web" : null),
            fallback_reason: result.historyRoute?.fallbackReason ?? null,
            diagnostics: result.historyRoute?.diagnostics ?? null,
            error_details: result.errorDetails || [],
            duration_ms: Math.max(0, Date.now() - generationHistoryStartedAt),
            status: result.partialFailureMessage ? "partial" : "success",
            error_reason: result.partialFailureMessage || null,
            result_file_names: result.fileNames || node.result_file_names || {},
            source: this._historySource === "mcp" ? "mcp" : "workflow",
            source_id: workflow2?.wf_id || "",
            provider: nodeProvider,
            project_id: workflow2?.project_id || null,
            auto_download: !!node.auto_download,
            submit_mode:
              node.node_type === "generate" && this._manualSubmitMode === true
                ? "manual"
                : "auto",
          });
        }
        if (node.node_type === "gemini") {
          await this._runOptionalProviderStep(
            "gemini",
            () =>
              this._completeGeminiPostPersist(
                node,
                workflow2,
                result,
                (message, level = "info") => {
                  console.log(
                    "[WorkflowProviderCleanup]",
                    JSON.stringify({ nodeId: node.node_id, level, message }),
                  );
                },
              ),
            (message) => console.warn("[WorkflowProviderCleanup]", message),
          );
        }
        if (node.node_type === "muse") {
          await this._runOptionalProviderStep(
            "muse",
            () =>
              this._completeMusePostPersist(
                node,
                workflow2,
                result,
                (message, level = "info") => {
                  console.log(
                    "[WorkflowProviderCleanup]",
                    JSON.stringify({ nodeId: node.node_id, level, message }),
                  );
                },
              ),
            (message) => console.warn("[WorkflowProviderCleanup]", message),
          );
        }
        await this._runOptionalProviderStep(
          "chatgpt",
          () =>
            this._completeChatGPTPostPersist(
              node,
              result,
              (message, level = "info") => {
                console.log(
                  "[WorkflowProviderCleanup]",
                  JSON.stringify({ nodeId: node.node_id, level, message }),
                );
              },
            ),
          (message) => console.warn("[WorkflowProviderCleanup]", message),
        );
        const isPipelineNode =
          window.PromptQueue?.isEnabled() && node.node_type === "generate";
        const isExternalProviderNode = [
          "chatgpt",
          "grok",
          "gemini",
          "muse",
        ].includes(node.node_type);
        const canUseAutoDownload =
          window.featureGate?.canUse("auto_download") ?? false;
        if (
          canUseAutoDownload &&
          node.auto_download &&
          result.fileIds?.length > 0 &&
          !isPipelineNode &&
          !isExternalProviderNode
        ) {
          const isVideo =
            node.media_type === "Video" ||
            (node.node_type === "grok" && node.grok_mode === "video");
          const res = isVideo
            ? node.video_download_resolution || "720p"
            : node.download_resolution || "1k";
          const taskName =
            node.download_folder ||
            workflow2?.wf_name ||
            this.currentWorkflow?.wf_name ||
            null;
          try {
            await this._downloadGeneratedResultsApiAware(
              result,
              node,
              res,
              taskName,
              isVideo,
              node.watermark_mode === "clean" ||
                node.watermark_mode === "original"
                ? node.watermark_mode
                : null,
            );
          } catch (downloadError) {
            if (
              this.shouldStop ||
              downloadError?.message === "DOWNLOAD_STOPPED"
            )
              throw downloadError;
            this._downloadNoReplayTileIds ||
              (this._downloadNoReplayTileIds = new Set());
            for (const id of downloadError?.downloadBlockedIds || [])
              this._downloadNoReplayTileIds.add(id);
            log(
              `Auto-download "${node.node_name}" failed after generation: ${downloadError.message}`,
              "warn",
            );
          }
          log(
            `[WM] auto_download "${node.node_name}": watermark_mode=${node.watermark_mode ?? "(thi\u1EBFu)"}`,
          );
        }
        log(`Single node "${node.node_name}" completed`);
        if (window.ExecutionGate && this._currentExecutionToken) {
          try {
            await ExecutionGate.complete(
              this._currentExecutionToken,
              "success",
            );
          } catch (err) {
            console.error(
              "[WorkflowExecutor] ExecutionGate.complete failed:",
              err,
            );
          }
          this._currentExecutionToken = null;
        }
        if (window.featureGate) {
          window.featureGate.recordWorkflowRun();
          if (node.node_type === "generate") {
            window.featureGate.recordGenRun();
            window.featureGate.recordPromptSubmit(1, "workflow");
            window.featureGate._incrementDailyStat("flow_prompt_total", 1);
          } else if (node.node_type === "chatgpt") {
            window.featureGate.recordChatGPTRun(1);
            window.featureGate.recordPromptSubmit(1, "workflow");
            window.featureGate._incrementDailyStat("chatgpt_prompt_total", 1);
          } else if (node.node_type === "grok") {
            window.featureGate.recordGrokRun(1);
            window.featureGate.recordPromptSubmit(1, "workflow");
            window.featureGate._incrementDailyStat("grok_prompt_total", 1);
          } else if (node.node_type === "gemini") {
            window.featureGate.recordPromptSubmit(1, "workflow");
          }
        }
        if (window.ExecutionLock && !window.PromptQueue?.isEnabled?.()) {
          ExecutionLock.broadcastTracker({
            owner: "workflow",
            phase: "completed",
            current: 1,
            total: 1,
          });
        }
        await this._restoreFlowZoom("single-node-success");
        if (!managed)
          window.eventBus.emit("execution:completed", {
            workflow: workflow2,
            singleNode: true,
          });
        if (!managed)
          broadcastEvent("execution:completed", { singleNode: true });
        return result;
      } catch (error) {
        if (managed && !this._singleNodeGenerationStarted)
          error.preSubmitFailure = true;
        if (
          (this.shouldStop || error.workflowUserStopped) &&
          !error.flowProviderStopped
        ) {
          if (
            managed &&
            this._singleNodeRecord.stopAfterResult &&
            this.currentNode?.status === "completed"
          ) {
            if (this._currentExecutionToken)
              await window.ExecutionGate?.complete?.(
                this._currentExecutionToken,
                "success",
              );
            this._currentExecutionToken = null;
            return { stopped: true };
          }
          if (this._currentExecutionToken) {
            await window.ExecutionGate?.cancel?.(this._currentExecutionToken);
            this._currentExecutionToken = null;
          }
          if (managed && !this._singleNodeGenerationStarted) {
            managed.owner._publishQueuedNodeCancelled(
              this.currentNode || { node_id: nodeId },
              workflowId,
            );
          } else if (this.currentNode)
            await this._markNodeCancelled(this.currentNode);
          await this._restoreFlowZoom("single-node-stopped");
          if (!managed)
            window.eventBus.emit("execution:completed", {
              workflow: this.currentWorkflow,
              singleNode: true,
              stopped: true,
            });
          if (!managed)
            broadcastEvent("execution:completed", {
              singleNode: true,
              stopped: true,
            });
          return { stopped: true };
        }
        if (error.recoveryRequired) {
          if (this.currentNode) {
            await this._updateNodeStatus(
              this.currentNode.node_id,
              "failed",
              null,
              error.message,
            );
            window.eventBus.emit("node:failed", {
              node: this.currentNode,
              error,
            });
            broadcastEvent("node:failed", {
              node: { node_id: this.currentNode.node_id },
              error: {
                message: error.message,
                flowApiFailure: true,
                recoveryRequired: true,
              },
            });
          }
          if (!managed) await this._updateWorkflowStatus("paused");
          if (this._currentExecutionToken) {
            await window.ExecutionGate?.cancel?.(this._currentExecutionToken);
            this._currentExecutionToken = null;
          }
          await this._restoreFlowZoom("single-node-api-recovery");
          if (!managed)
            window.eventBus.emit("execution:completed", {
              workflow,
              singleNode: true,
              error,
            });
          if (!managed)
            broadcastEvent("execution:completed", {
              singleNode: true,
              error: {
                message: error.message,
                recoveryRequired: true,
                flowApiFailure: true,
              },
            });
          throw error;
        }
        console.error("[WorkflowExecutor] Single node execution failed:", {
          message: error?.message,
          name: error?.name,
          code: error?.code,
          stack: error?.stack,
        });
        if (window.ExecutionGate && this._currentExecutionToken) {
          try {
            await ExecutionGate.complete(this._currentExecutionToken, "failed");
          } catch (err) {
            console.error(
              "[WorkflowExecutor] ExecutionGate.complete failed:",
              err,
            );
          }
          this._currentExecutionToken = null;
        }
        if (window.ExecutionLock && !window.PromptQueue?.isEnabled?.()) {
          ExecutionLock.broadcastTracker({ owner: "workflow", phase: "error" });
        }
        if (this.currentNode && error.preSubmitFailure !== true) {
          await this._updateNodeStatus(
            this.currentNode.node_id,
            "failed",
            null,
            error.message,
          );
          window.eventBus.emit("node:failed", {
            node: this.currentNode,
            error,
          });
          broadcastEvent("node:failed", {
            node: {
              node_id: this.currentNode.node_id,
              node_name: this.currentNode.node_name,
            },
            error: {
              message: error.message,
              flowApiFailure: error.flowApiFailure === true,
            },
          });
          if (
            !error.recoveryRequired &&
            ["generate", "chatgpt", "grok", "gemini", "muse"].includes(
              this.currentNode.node_type,
            )
          ) {
            this._notifyGenFailed(this.currentNode, null, error);
            if (!this.currentNode._genFailLogged) {
              this.currentNode._genFailLogged = true;
              const _n = this.currentNode;
              const _fp =
                _n.node_type === "chatgpt"
                  ? "chatgpt"
                  : _n.node_type === "grok"
                    ? "grok"
                    : _n.node_type === "gemini"
                      ? "gemini"
                      : _n.node_type === "muse"
                        ? "muse"
                        : "flow";
              const _iv =
                _n.media_type === "Video" ||
                (_n.node_type === "grok" && _n.grok_mode === "video");
              window.eventBus?.emit?.("prompt:completed", {
                prompt: _n._effective_prompt || _n.prompt || "",
                media_type: _iv ? "Video" : _n.media_type || "image",
                model: this._historyModelForNode(_n, _fp),
                ratio: _n.ratio || "",
                prompt_count: 1,
                quantity: parseInt(_n.quantity) || 1,
                ref_file_ids: this._historyNodeRefIds(
                  _n,
                  this.currentWorkflow,
                ).join(", "),
                ref_thumbnails: this._historyNodeRefThumbnails(
                  _n,
                  this.currentWorkflow,
                ),
                result_file_ids: "",
                result_thumbnails: [],
                source: this._historySource === "mcp" ? "mcp" : "workflow",
                source_id: this.currentWorkflow?.wf_id || "",
                provider: _fp,
                status: "failed",
                error_reason: error?.message || "Generation failed",
                error_details: error?.errorDetails || [],
                duration_ms: Math.max(
                  0,
                  Date.now() - generationHistoryStartedAt,
                ),
                flow_api_versions: error?.flowApiVersions || [],
                gen_mode: error?.historyRoute?.genMode ?? null,
                initial_gen_mode: error?.historyRoute?.initialGenMode ?? null,
                fallback_reason: error?.historyRoute?.fallbackReason ?? null,
                diagnostics: error?.historyRoute?.diagnostics ?? null,
                project_id: this.currentWorkflow?.project_id || null,
                auto_download: !!_n.auto_download,
                submit_mode:
                  _n.node_type === "generate" && this._manualSubmitMode === true
                    ? "manual"
                    : "auto",
              });
            }
          }
        } else if (error.preSubmitFailure === true) {
          console.warn(
            "[WorkflowExecutor] Single-node run stopped before provider submit:",
            error.code || error.message,
          );
        }
        await this._restoreFlowZoom("single-node-error");
        if (!managed)
          window.eventBus.emit("execution:completed", {
            workflow: this.currentWorkflow,
            singleNode: true,
            error,
          });
        if (!managed)
          broadcastEvent("execution:completed", {
            singleNode: true,
            error: {
              message: error.message,
              flowApiFailure: error.flowApiFailure === true,
            },
          });
        throw error;
      } finally {
        if (managed && this._currentExecutionToken) {
          try {
            await window.ExecutionGate?.cancel?.(this._currentExecutionToken, {
              waitForSettlement: true,
            });
          } catch (error) {
            console.warn(
              "[WorkflowSingleNode] final token cancel failed:",
              error.message,
            );
          }
          this._currentExecutionToken = null;
        }
        if (managed) {
          await this._singleNodeCancelPromise;
          await this._singleNodeProviderAbortPromise;
        }
        this._singleNodeExecutionToken = null;
        if (!managed) window._workflowRefPreflightCache = null;
        this.isRunning = false;
        this._manualSubmitMode = false;
        if (singleNodeApiRefreshDeferred && singleNodeQueue) {
          singleNodeQueue.releaseApiRefresh();
          singleNodeApiRefreshDeferred = false;
          if (
            managed &&
            singleNodeApiResult &&
            singleNodePreviewRequest?.fileIds.length
          ) {
            managed.previewRequests.set(nodeId, singleNodePreviewRequest);
          }
          if (singleNodeApiResult && !managed) {
            singleNodeQueue
              .flushPendingApiRefresh("api-results-refresh")
              .then((ok) => {
                if (
                  singleNodePreviewRequest?.nodeId &&
                  singleNodePreviewRequest.fileIds.length > 0
                ) {
                  window.eventBus?.emit("node:api_preview_refresh", {
                    ...singleNodePreviewRequest,
                    boardReady: !!ok,
                  });
                }
              })
              .catch((error) => {
                console.warn(
                  "[WorkflowExecutor] Single-node API board refresh failed:",
                  error?.message || error,
                );
                if (
                  singleNodePreviewRequest?.nodeId &&
                  singleNodePreviewRequest.fileIds.length > 0
                ) {
                  window.eventBus?.emit("node:api_preview_refresh", {
                    ...singleNodePreviewRequest,
                    boardReady: false,
                  });
                }
              });
          }
        }
        this.currentWorkflow = null;
        this.currentNode = null;
        await this._restoreFlowZoom("single-node-finally");
      }
    }
    async _startSingleNodeGeneration(node) {
      if (this._singleNodeStartPromise) return this._singleNodeStartPromise;
      this._singleNodeStartPromise = (async () => {
        if (this.shouldStop)
          throw Object.assign(new Error("ABORTED"), {
            workflowUserStopped: true,
          });
        await this._resetNodeResultsForRun(node);
        this._singleNodeGenerationStarted = true;
        if (this.shouldStop)
          throw Object.assign(new Error("ABORTED"), {
            workflowUserStopped: true,
          });
        if (this._singleNodeRecord) {
          this._singleNodeRecord.generationStarted = true;
          this._singleNodeSessionWorker?._changed(this._singleNodeRecord);
        }
        window.eventBus.emit("node:started", { node });
        broadcastEvent("node:started", {
          node: {
            node_id: node.node_id,
            node_name: node.node_name,
            node_type: node.node_type,
          },
        });
        await this._updateNodeStatus(node.node_id, "running");
      })().catch((error) => {
        error.preSubmitFailure = true;
        error.noRetry = true;
        this._singleNodeStartError = error;
        throw error;
      });
      return this._singleNodeStartPromise;
    }
    stop(broadcast = true, force = false, stopSource = null) {
      if (this._singleNodeSession) {
        this.shouldStop = true;
        this._flowAdmissionAbortController?.abort();
        if (force) this._flowReadAbortController?.abort();
        this._singleNodeSession.stopAll(stopSource || "WORKFLOW_SESSION_STOP");
        if (broadcast)
          broadcastEvent("execution:stop", {
            wf_id: this.currentWorkflow?.wf_id,
            run_id: this._flowRunId,
          });
        return;
      }
      const requestedAt = Date.now();
      if (this.isRunning || this._executionTask || force) {
        log("Stopping workflow...");
        console.info(
          "[WorkflowStop] requested",
          JSON.stringify({
            requestedAt,
            submittedNodes: this._submittedNodes?.size || 0,
            currentNodeId: this.currentNode?.node_id || null,
            stopSource,
          }),
        );
        this.shouldStop = true;
        this._flowAdmissionAbortController?.abort();
        if (force) this._flowReadAbortController?.abort();
        if (force) window.ProviderTabLock?.reset?.();
        if (!this._executionTask) this._stopHeartbeat();
        window.MessageBridge?.sendToContentScript?.("cancelFlowScans")?.catch?.(
          () => {},
        );
        for (const job of this._geminiTrackerJobs?.values() || []) {
          if (job.status !== "running") continue;
          const item = job.items[0];
          this._updateGeminiWorkflowTracker(
            {
              node_id: item.id,
              node_name: job.label,
              prompt: item.promptText,
              media_type: item.mediaType === "video" ? "Video" : "Image",
            },
            "CANCELLED",
          );
        }
        if (window.MessageBridge) {
          window.MessageBridge.releaseFlowBlocker({ stopRelease: true }).catch(
            () => {},
          );
        }
        if (window.MessageBridge)
          window.MessageBridge.sendToContentScript("endFlowZoomSession", {
            force: true,
          }).catch(() => {});
        if (window.ExecutionGate && this._currentExecutionToken) {
          ExecutionGate.cancel(this._currentExecutionToken);
          this._currentExecutionToken = null;
        }
        if (window.PromptQueue && PromptQueue.isEnabled()) {
          const queue = PromptQueue.getInstance();
          const wfJobs = queue.getJobsByOwner("workflow") || [];
          for (const job of wfJobs) {
            queue.stopJob(job.id, {
              stopOrigin: "user",
              stopReason: "USER_CANCELLED",
              stopSource,
            });
          }
        }
        const hasSubmittedNodes =
          this._submittedNodes && this._submittedNodes.size > 0;
        if (hasSubmittedNodes) {
          log(
            `${this._submittedNodes.size} node(s) \u0111\xE3 submit, s\u1EBD ch\u1EDD k\u1EBFt qu\u1EA3 tr\u01B0\u1EDBc khi d\u1EEBng...`,
          );
        } else {
          log("Ch\u01B0a c\xF3 node n\xE0o submit, d\u1EEBng ngay...");
          if (window.MessageBridge) {
            window.MessageBridge.stopExecution().catch(() => {});
          }
        }
        if (window.GrokSession?.getTabInfo) {
          window.GrokSession.getTabInfo()
            .then((grokInfo) => {
              if (grokInfo?.tabId) {
                window.MessageBridge?.grokAbort(grokInfo.tabId, { requestedAt })
                  .then((result) => {
                    console.log(
                      "[WorkflowExecutor] Grok abort",
                      JSON.stringify(result),
                    );
                    if (result?.providerStopped !== true)
                      emitLog({
                        type: "warn",
                        message:
                          "[Grok] Abort: " +
                          (result?.error || "provider stop unconfirmed"),
                      });
                  })
                  .catch(() => {});
              }
            })
            .catch(() => {});
        }
        if (window.ChatGPTSession?.getTabInfo) {
          window.ChatGPTSession.getTabInfo()
            .then((chatgptInfo) => {
              if (chatgptInfo?.tabId) {
                window.MessageBridge?.chatgptAbort(chatgptInfo.tabId, {
                  requestedAt,
                })
                  .then((result) => {
                    console.log(
                      "[WorkflowExecutor] ChatGPT abort",
                      JSON.stringify(result),
                    );
                    if (result?.providerStopped !== true)
                      emitLog({
                        type: "warn",
                        message:
                          "[ChatGPT] Abort: " +
                          (result?.error || "provider stop unconfirmed"),
                      });
                  })
                  .catch(() => {});
              }
            })
            .catch(() => {});
        }
        if (window.GeminiSession?.getTabInfo) {
          window.GeminiSession.getTabInfo()
            .then((geminiInfo) => {
              if (geminiInfo?.tabId) {
                window.MessageBridge?.geminiAbort?.(geminiInfo.tabId, {
                  requestedAt,
                })
                  .then((result) => {
                    console.log(
                      "[WorkflowExecutor] Gemini abort",
                      JSON.stringify(result),
                    );
                    if (result?.providerStopped !== true)
                      emitLog({
                        type: "warn",
                        message:
                          "[Gemini] Abort received status: " +
                          (result?.error ||
                            (result?.abortReceived
                              ? "provider stop unconfirmed"
                              : "not acknowledged")),
                      });
                  })
                  .catch(() => {});
              }
            })
            .catch(() => {});
        }
        if (window.MuseSession?.abort) {
          window.MuseSession.abort()
            .then((result) => {
              console.log(
                "[WorkflowExecutor] Muse abort",
                JSON.stringify(result),
              );
              if (result?.success !== true)
                emitLog({
                  type: "warn",
                  message:
                    "[Muse] Abort: " +
                    (result?.error || "provider stop unconfirmed"),
                });
            })
            .catch(() => {});
        }
        if (broadcast) {
          broadcastEvent("execution:stop", {
            wf_id: this.currentWorkflow?.wf_id,
            run_id: this._flowRunId || null,
          });
        }
        window.eventBus?.emit("execution:force_stopped");
      }
    }
    handleRemoteStop(workflowId = null, runId = null) {
      if (runId && this._executionTask && this._flowRunId !== runId)
        return false;
      const activeId = this.currentWorkflow?.wf_id || this._runningOtherWfId;
      if (workflowId && activeId && String(workflowId) !== String(activeId))
        return false;
      if (this.isRunning || this._executionTask) {
        this.stop(false, true);
        return true;
      }
      if (this.isRunning || this._runningOtherWfId) {
        log("Remote stop received, stopping local execution...");
        this.shouldStop = true;
        if (this._runningOtherWfId && !this.isRunning) {
          this._runningOtherWfId = null;
          this.currentWorkflow = null;
          try {
            clearRunningFlag(workflowId || activeId);
          } catch (e) {}
        }
      }
      return true;
    }
    async reset(workflowId) {
      log("Resetting workflow:", workflowId);
      const running = await readRunningFlag();
      if (this._executionTask && this.currentWorkflow?.wf_id === workflowId) {
        this.stop(true, true);
        await this.waitForExecutionStopped();
      } else if (running?.wf_id === workflowId) {
        await WorkflowExecutor.requestCrossContextStop(running);
      }
      await window.storageManager.resetWorkflow(workflowId);
      window.eventBus.emit("workflow:reset", { workflowId });
      broadcastEvent("workflow:reset", { workflowId });
    }
    async _resetNodeResultsForRun(node) {
      if (!node?.node_id || !this.currentWorkflow?.wf_id) {
        const error = new Error("WORKFLOW_NODE_RESET_CONTEXT_MISSING");
        error.code = "WORKFLOW_NODE_RESET_CONTEXT_MISSING";
        error.preSubmitFailure = true;
        throw error;
      }
      const clearedResults = {
        result_file_ids: "",
        result_flow_file_ids: [],
        result_thumbnails: {},
        result_file_names: {},
        result_provider_urls: {},
        result_text: "",
        result_source: "",
        result_frame_file_ids: null,
        result_frame_thumbnails: {},
        result_clean_file_ids: null,
        result_clean_thumbnails: {},
        error_message: "",
        executed_at: null,
      };
      const persistedReset = { status: "pending", ...clearedResults };
      if (this._executionInProgress) {
        const buffered = this._nodeStateBuffer.get(node.node_id) || {};
        this._nodeStateBuffer.set(node.node_id, {
          ...buffered,
          ...persistedReset,
        });
      } else {
        let persisted = null;
        let resetCause = null;
        try {
          persisted = await window.storageManager.updateNodeStatus(
            this.currentWorkflow.wf_id,
            node.node_id,
            persistedReset,
          );
        } catch (error) {
          resetCause = error;
        }
        if (!persisted) {
          const error = new Error(
            window.I18n?.t?.("workflow.resetFailed") ||
              "Failed to reset workflow node results",
          );
          error.code = "WORKFLOW_NODE_RESULT_RESET_FAILED";
          error.preSubmitFailure = true;
          if (resetCause) error.cause = resetCause;
          throw error;
        }
      }
      Object.assign(node, clearedResults, {
        status: "running",
        result_gen_mode: null,
      });
      const original = this.currentWorkflow.nodes?.find(
        (item) => item.node_id === node.node_id,
      );
      if (original && original !== node) {
        Object.assign(original, clearedResults, {
          status: "running",
          result_gen_mode: null,
        });
      }
      for (const target of [...new Set([node, original].filter(Boolean))]) {
        delete target._extract_failed;
        delete target._extract_reason;
        delete target._userSkipped;
        delete target._genFailLogged;
        delete target._genFailNotified;
      }
    }
    _createOrderedFlowSubmitGate(
      total,
      signal = this._flowAdmissionAbortController?.signal,
    ) {
      let next = 0;
      const waiters = new Map();
      const releasedAhead = new Set();
      const release = (order, reason = "admitted") => {
        if (!Number.isInteger(order) || order < next) return;
        if (order !== next) {
          releasedAhead.add(order);
          return;
        }
        next++;
        while (releasedAhead.delete(next)) next++;
        const waiter = waiters.get(next);
        if (waiter) {
          waiters.delete(next);
          waiter();
        }
        console.debug("[WorkflowExecutor] Flow submit turn released", {
          order,
          next,
          total,
          reason,
        });
      };
      return {
        wait: (order) => {
          if (!Number.isInteger(order) || order === next || order < next)
            return Promise.resolve();
          if (signal?.aborted)
            return Promise.reject(
              Object.assign(new Error("ABORTED"), {
                code: "ABORTED",
                noRetry: true,
              }),
            );
          return new Promise((resolve, reject) => {
            const cleanup = () => signal?.removeEventListener("abort", onAbort);
            const onAbort = () => {
              waiters.delete(order);
              cleanup();
              reject(
                Object.assign(new Error("ABORTED"), {
                  code: "ABORTED",
                  noRetry: true,
                }),
              );
            };
            waiters.set(order, () => {
              cleanup();
              resolve();
            });
            signal?.addEventListener("abort", onAbort, { once: true });
          });
        },
        release,
      };
    }
    async _executeSingleNode(
      node,
      workflow2,
      completed,
      total,
      executionMeta = null,
      executionScope = null,
    ) {
      const generationHistoryStartedAt = Date.now();
      this.currentNode = node;
      node._effective_prompt =
        NODES_CAN_USE_MENTIONS.includes(node.node_type) &&
        node.node_type !== "prompt"
          ? this._resolveEffectivePrompt(node, workflow2).text
          : node.prompt || "";
      const nodeLog = (message, type = "info") => {
        emitLog({ nodeId: node.node_id, message, type });
      };
      const depCheck = this._checkDependencies(
        node,
        workflow2.nodes,
        workflow2.edges,
        executionScope,
      );
      if (!depCheck.ok) {
        console.warn(
          `[WorkflowExecutor] DEP_SKIP: "${node.node_name}" (${node.node_type}) \u2192 ${depCheck.reason}`,
        );
        log(
          "Skipping node (dependency failed):",
          node.node_name,
          depCheck.reason,
        );
        emitLog({
          nodeId: node.node_id,
          message: `B\u1ECF qua "${node.node_name}" (dependency l\u1ED7i: ${depCheck.reason})`,
          type: "warn",
        });
        await this._updateNodeStatus(node.node_id, "skipped");
        window.eventBus.emit("node:warning", {
          node,
          message: depCheck.reason,
        });
        return;
      }
      await this._resetNodeResultsForRun(node);
      try {
        emitLog({
          nodeId: node.node_id,
          message: `--- B\u1EAFt \u0111\u1EA7u node [${completed + 1}/${total}]: "${node.node_name}" ---`,
          type: "info",
        });
        window.eventBus.emit("node:started", { node });
        broadcastEvent("node:started", {
          node: {
            node_id: node.node_id,
            node_name: node.node_name,
            node_type: node.node_type,
          },
        });
        await this._updateNodeStatus(node.node_id, "running");
        const result = await this._executeNode(node, workflow2, executionMeta);
        await this._healFlowVideoResult(node, result);
        const genProducingTypes = ["generate", "chatgpt", "grok", "gemini"];
        if (
          genProducingTypes.includes(node.node_type) &&
          (!result.fileIds || result.fileIds.length === 0)
        ) {
          if (result?._userSkipped === true) {
            const reason =
              window.I18n?.t?.("workflow.userSkippedNode") ||
              "User skipped manual submit";
            node._userSkipped = true;
            const _origNode = this.currentWorkflow?.nodes?.find(
              (n) => n.node_id === node.node_id,
            );
            if (_origNode) _origNode._userSkipped = true;
            emitLog({
              nodeId: node.node_id,
              message: `"${node.node_name}" SKIPPED: ${reason} \u2192 downstream nodes b\u1ECF qua`,
              type: "warn",
            });
            await this._updateNodeStatus(node.node_id, "skipped", null, reason);
            window.eventBus.emit("node:warning", { node, message: reason });
            return;
          }
          throw this._emptyGenerationResultError(result);
        }
        if (
          node.node_type === "text_extract" &&
          result?._extract_failed === true
        ) {
          const reason = result._extract_reason || "marker did not match";
          emitLog({
            nodeId: node.node_id,
            message: `Text Extract "${node.node_name}" SKIPPED: ${reason} \u2192 downstream nodes b\u1ECF qua`,
            type: "warn",
          });
          await this._updateNodeStatus(node.node_id, "skipped", null, reason);
          window.eventBus.emit("node:warning", { node, message: reason });
          return;
        }
        if (result.thumbnails && Object.keys(result.thumbnails).length > 0) {
          node.result_thumbnails = {
            ...(node.result_thumbnails || {}),
            ...result.thumbnails,
          };
        }
        if (result.fileNames && Object.keys(result.fileNames).length > 0) {
          node.result_file_names = {
            ...(node.result_file_names || {}),
            ...result.fileNames,
          };
        }
        if (
          result.providerUrls &&
          Object.keys(result.providerUrls).length > 0
        ) {
          node.result_provider_urls = {
            ...(node.result_provider_urls || {}),
            ...result.providerUrls,
          };
        }
        if (result.genMode) {
          node.result_gen_mode = result.genMode;
          const _origN = this.currentWorkflow?.nodes?.find(
            (n) => n.node_id === node.node_id,
          );
          if (_origN) _origN.result_gen_mode = result.genMode;
        }
        const apiPreviewIds =
          Array.isArray(result.apiFileIds) && result.apiFileIds.length > 0
            ? result.apiFileIds
            : result.genMode === "api"
              ? result.fileIds || []
              : [];
        const missingApiPreviewIds = apiPreviewIds.filter((fid) => {
          const info = result.thumbnails?.[fid];
          return typeof info === "string"
            ? !info
            : !(info?.thumbnail || info?.video_url);
        });
        if (missingApiPreviewIds.length > 0) {
          this._workflowApiPreviewRequests?.set(node.node_id, {
            nodeId: node.node_id,
            fileIds: [...new Set(missingApiPreviewIds.filter(Boolean))],
            displayFileIds: [
              ...new Set((result.fileIds || []).filter(Boolean)),
            ],
          });
        }
        window.eventBus?.emit("node:preview_available", { node, result });
        const lastFramePromise = this._maybeExtractLastFrame(
          node,
          result,
          workflow2,
        );
        if (node.node_type === "gemini" && result.runtimeThumbnails) {
          node.result_thumbnails = {
            ...(node.result_thumbnails || {}),
            ...result.runtimeThumbnails,
          };
          const liveNode = this.currentWorkflow?.nodes?.find(
            (item) => item.node_id === node.node_id,
          );
          if (liveNode) {
            liveNode.result_thumbnails = {
              ...(liveNode.result_thumbnails || {}),
              ...result.runtimeThumbnails,
            };
          }
        }
        if (this._workflowSuccessCounts) {
          const succ = this._workflowSuccessCounts;
          if (node.node_type === "generate") {
            succ.total++;
            succ.flow++;
          } else if (node.node_type === "chatgpt") {
            succ.total++;
            succ.chatgpt++;
          } else if (node.node_type === "grok") {
            succ.total++;
            succ.grok++;
          } else if (node.node_type === "gemini") {
            succ.total++;
            succ.gemini++;
          } else if (node.node_type === "muse") {
            succ.total++;
            succ.muse = (succ.muse || 0) + 1;
          } else if (node.node_type === "prompt" && node.use_ai === true) {
            succ.total++;
            if (node.provider === "gemini") succ.gemini++;
            else succ.chatgpt++;
          }
        }
        const deferWorkflowApiPreview = missingApiPreviewIds.length > 0;
        window.eventBus.emit("node:completed", {
          node,
          result,
          deferApiPreviewRefresh: deferWorkflowApiPreview,
        });
        broadcastEvent("node:completed", {
          node: { node_id: node.node_id, node_name: node.node_name },
          result: {
            fileIds: result.fileIds,
            duration: result.duration,
            thumbnails: result.thumbnails,
            partialFailureMessage: result.partialFailureMessage || null,
          },
          deferApiPreviewRefresh: deferWorkflowApiPreview,
        });
        await lastFramePromise;
        await this._updateNodeStatus(
          node.node_id,
          "completed",
          result.fileIds,
          result.partialFailureMessage || null,
          {
            result_thumbnails: node.result_thumbnails,
            result_file_names: node.result_file_names,
            result_provider_urls: node.result_provider_urls,
            result_text: node.result_text,
            result_source: node.result_source,
            result_frame_file_ids: node.result_frame_file_ids,
            result_frame_thumbnails: node.result_frame_thumbnails,
            result_clean_file_ids: node.result_clean_file_ids,
            result_clean_thumbnails: node.result_clean_thumbnails,
          },
        );
        const promptProducingTypes = [
          "generate",
          "chatgpt",
          "grok",
          "gemini",
          "muse",
        ];
        if (
          promptProducingTypes.includes(node.node_type) &&
          result.fileIds?.length > 0
        ) {
          const nodeProvider =
            node.node_type === "chatgpt"
              ? "chatgpt"
              : node.node_type === "grok"
                ? "grok"
                : node.node_type === "gemini"
                  ? "gemini"
                  : node.node_type === "muse"
                    ? "muse"
                    : "flow";
          const isVideoNode =
            node.media_type === "Video" ||
            (node.node_type === "grok" && node.grok_mode === "video");
          const wfThumbs = (result.fileIds || [])
            .map((fid) => {
              const t = result.thumbnails?.[fid];
              if (!t) return null;
              return {
                thumbnail: typeof t === "string" ? t : t.thumbnail,
                type:
                  typeof t === "object" && t.type
                    ? t.type
                    : isVideoNode
                      ? "video"
                      : "image",
                file_name: typeof t === "object" ? t.file_name || "" : "",
                ...(typeof t === "object" && t.media_uuid
                  ? { media_uuid: t.media_uuid }
                  : {}),
                ...(typeof t === "object" && t.video_url
                  ? { video_url: t.video_url }
                  : {}),
                ...(typeof t === "object" && t.thumb_is_poster === true
                  ? { thumb_is_poster: true }
                  : {}),
              };
            })
            .filter(Boolean);
          window.eventBus.emit("prompt:completed", {
            prompt:
              node._effective_prompt ??
              this._resolveEffectivePrompt(node, workflow2).text,
            media_type: isVideoNode ? "Video" : node.media_type || "image",
            model: this._historyModelForNode(node, nodeProvider, result),
            ratio: node.ratio || "",
            prompt_count: 1,
            quantity: parseInt(node.quantity) || 1,
            ref_file_ids:
              Array.isArray(result.refFileIdsUsed) &&
              result.refFileIdsUsed.length
                ? result.refFileIdsUsed.join(", ")
                : node.ref_file_ids || "",
            ref_thumbnails: this._historyNodeRefThumbnails(
              node,
              workflow2,
              result.refFileIdsUsed,
            ),
            result_file_ids: (result.fileIds || []).join(", "),
            result_thumbnails: wfThumbs,
            result_file_names: result.fileNames || node.result_file_names || {},
            result_provider_urls: result.providerUrls || {},
            flow_api_versions: result.flowApiVersions || [],
            gen_mode:
              result.historyRoute?.genMode ??
              (nodeProvider === "flow" ? result.genMode || "web" : null),
            initial_gen_mode:
              result.historyRoute?.initialGenMode ??
              (nodeProvider === "flow" ? result.genMode || "web" : null),
            fallback_reason: result.historyRoute?.fallbackReason ?? null,
            diagnostics: result.historyRoute?.diagnostics ?? null,
            error_details: result.errorDetails || [],
            duration_ms: Math.max(0, Date.now() - generationHistoryStartedAt),
            status: result.partialFailureMessage ? "partial" : "success",
            error_reason: result.partialFailureMessage || null,
            source: this._historySource === "mcp" ? "mcp" : "workflow",
            source_id: workflow2?.wf_id || "",
            provider: nodeProvider,
            project_id: workflow2?.project_id || null,
            auto_download: !!node.auto_download,
            submit_mode:
              node.node_type === "generate" && this._manualSubmitMode === true
                ? "manual"
                : "auto",
          });
        }
        if (node.node_type === "gemini") {
          await this._runOptionalProviderStep(
            "gemini",
            () =>
              this._completeGeminiPostPersist(node, workflow2, result, nodeLog),
            (message) => nodeLog(message, "warn"),
          );
        }
        if (node.node_type === "muse") {
          await this._runOptionalProviderStep(
            "muse",
            () =>
              this._completeMusePostPersist(node, workflow2, result, nodeLog),
            (message) => nodeLog(message, "warn"),
          );
        }
        await this._runOptionalProviderStep(
          "chatgpt",
          () => this._completeChatGPTPostPersist(node, result, nodeLog),
          (message) => nodeLog(message, "warn"),
        );
        emitLog({
          nodeId: node.node_id,
          message: `"${node.node_name}" ho\xE0n th\xE0nh - ${result.fileIds?.length || 0} file, ${Math.round(result.duration / 1e3)}s`,
          type: "success",
        });
        const isPipelineNode =
          window.PromptQueue?.isEnabled() && node.node_type === "generate";
        const isExternalProviderNode = [
          "chatgpt",
          "grok",
          "gemini",
          "muse",
        ].includes(node.node_type);
        const canUseAutoDownload =
          window.featureGate?.canUse("auto_download") ?? false;
        if (
          canUseAutoDownload &&
          node.auto_download &&
          result.fileIds?.length > 0 &&
          !isPipelineNode &&
          !isExternalProviderNode
        ) {
          const isVideo =
            node.media_type === "Video" ||
            (node.node_type === "grok" && node.grok_mode === "video");
          const res = isVideo
            ? node.video_download_resolution || "720p"
            : node.download_resolution || "1k";
          const taskName =
            node.download_folder ||
            workflow2?.wf_name ||
            this.currentWorkflow?.wf_name ||
            null;
          emitLog({
            nodeId: node.node_id,
            message: `T\u1EA3i ${result.fileIds.length} file [${res.toUpperCase()}]...`,
            type: "info",
          });
          try {
            await this._downloadGeneratedResultsApiAware(
              result,
              node,
              res,
              taskName,
              isVideo,
              node.watermark_mode === "clean" ||
                node.watermark_mode === "original"
                ? node.watermark_mode
                : null,
            );
          } catch (downloadError) {
            if (
              this.shouldStop ||
              downloadError?.message === "DOWNLOAD_STOPPED"
            )
              throw downloadError;
            this._downloadNoReplayTileIds ||
              (this._downloadNoReplayTileIds = new Set());
            for (const id of downloadError?.downloadBlockedIds || [])
              this._downloadNoReplayTileIds.add(id);
            emitLog({
              nodeId: node.node_id,
              message: `Auto-download failed after generation: ${downloadError.message}`,
              type: "warn",
            });
          }
          log(
            `[WM] auto_download "${node.node_name}": watermark_mode=${node.watermark_mode ?? "(thi\u1EBFu)"}`,
          );
        }
      } catch (error) {
        if (
          (this.shouldStop || error.workflowUserStopped) &&
          !error.flowProviderStopped
        ) {
          await this._markNodeCancelled(node);
          return { stopped: true };
        }
        console.error(
          "[WorkflowExecutor] Node failed:",
          node.node_name,
          JSON.stringify({
            nodeId: node.node_id,
            nodeType: node.node_type,
            message: error?.message,
            name: error?.name,
            code: error?.code,
            stack: error?.stack,
          }),
        );
        await this._updateNodeStatus(
          node.node_id,
          "failed",
          null,
          error.message,
        );
        window.eventBus.emit("node:failed", { node, error });
        broadcastEvent("node:failed", {
          node: { node_id: node.node_id, node_name: node.node_name },
          error: {
            message: error.message,
            flowApiFailure: error.flowApiFailure === true,
          },
        });
        if (
          !error.recoveryRequired &&
          ["generate", "chatgpt", "grok", "gemini", "muse"].includes(
            node.node_type,
          ) &&
          !node._genFailLogged
        ) {
          node._genFailLogged = true;
          this._notifyGenFailed(node, null, error);
          const _failProvider =
            node.node_type === "chatgpt"
              ? "chatgpt"
              : node.node_type === "grok"
                ? "grok"
                : node.node_type === "gemini"
                  ? "gemini"
                  : node.node_type === "muse"
                    ? "muse"
                    : "flow";
          const _isVideoFail =
            node.media_type === "Video" ||
            (node.node_type === "grok" && node.grok_mode === "video");
          window.eventBus?.emit?.("prompt:completed", {
            prompt:
              node._effective_prompt ??
              this._resolveEffectivePrompt(node, workflow2).text,
            media_type: _isVideoFail ? "Video" : node.media_type || "image",
            model: this._historyModelForNode(node, _failProvider),
            ratio: node.ratio || "",
            prompt_count: 1,
            quantity: parseInt(node.quantity) || 1,
            ref_file_ids: this._historyNodeRefIds(node, workflow2).join(", "),
            ref_thumbnails: this._historyNodeRefThumbnails(node, workflow2),
            result_file_ids: "",
            result_thumbnails: [],
            source: this._historySource === "mcp" ? "mcp" : "workflow",
            source_id: workflow2?.wf_id || "",
            provider: _failProvider,
            status: "failed",
            error_reason: error?.message || "Generation failed",
            error_details: error?.errorDetails || [],
            duration_ms: Math.max(0, Date.now() - generationHistoryStartedAt),
            flow_api_versions: error?.flowApiVersions || [],
            gen_mode: error?.historyRoute?.genMode ?? null,
            initial_gen_mode: error?.historyRoute?.initialGenMode ?? null,
            fallback_reason: error?.historyRoute?.fallbackReason ?? null,
            diagnostics: error?.historyRoute?.diagnostics ?? null,
            project_id: workflow2?.project_id || null,
            auto_download: !!node.auto_download,
            submit_mode:
              node.node_type === "generate" && this._manualSubmitMode === true
                ? "manual"
                : "auto",
          });
        }
        emitLog({
          nodeId: node.node_id,
          message: `"${node.node_name}" th\u1EA5t b\u1EA1i: ${error.message}`,
          type: "error",
        });
        if (this.settings.stopOnError) {
          emitLog({
            message:
              'D\u1EEBng workflow do c\xE0i \u0111\u1EB7t "D\u1EEBng khi l\u1ED7i"',
            type: "error",
          });
          this.shouldStop = true;
        }
        throw error;
      }
    }
    _notifyNodeError(node, error) {
      try {
        const nodeType = node?.node_type || node?.type;
        if (!["generate", "chatgpt", "grok", "gemini"].includes(nodeType))
          return;
        const reason = (error?.message || "Unknown error").toString();
        const now = Date.now();
        if (
          this._lastErrNotify &&
          this._lastErrNotify.reason === reason &&
          now - this._lastErrNotify.t < 6e3
        )
          return;
        this._lastErrNotify = { reason, t: now };
        const title = `${node?.node_name || "Node"} failed`;
        if (typeof window.showNotification === "function") {
          window.showNotification(`${title}: ${reason}`, "error", 7e3);
        } else if (typeof window.showToast === "function") {
          window.showToast(`${title}: ${reason}`);
        } else if (
          window.customDialog &&
          typeof window.customDialog.alert === "function"
        ) {
          window.customDialog.alert(reason, { type: "error", title });
        }
      } catch (_) {}
    }
    async _batchPreResolveRefImages(nodes, workflow2 = null) {
      if (
        !this._singleNodeSessionWorker ||
        !(window._workflowRefPreflightCache instanceof Map)
      ) {
        window._workflowRefPreflightCache = new Map();
      }
      for (const n of nodes || []) {
        if (n?.node_type === "image") this._syncRefMapKeysByPosition(n);
      }
      if (!window.TileResolver || !nodes || nodes.length === 0) return;
      const imagesToResolve = [];
      const seenKeys = new Set();
      const apiModeIntended =
        window.FlowApiAdapter?.isApiModeIntended?.({ forWorkflow: true }) ===
        true;
      const collectIds = (owner, idsField, fileNameFields, thumbnailFields) => {
        const ids = String(owner?.[idsField] || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        for (const fileId of ids) {
          if (fileId.startsWith("upload_") || seenKeys.has(fileId)) continue;
          const fileName =
            fileNameFields.map((f) => owner?.[f]?.[fileId]).find(Boolean) ||
            null;
          const thumbVal =
            thumbnailFields.map((f) => owner?.[f]?.[fileId]).find(Boolean) ||
            null;
          const thumbnailUrl =
            thumbVal && typeof thumbVal === "object"
              ? thumbVal.thumbnail || thumbVal.video_url || null
              : thumbVal || null;
          if (!fileName && !thumbnailUrl) continue;
          seenKeys.add(fileId);
          imagesToResolve.push({
            id: fileId,
            file_name: fileName,
            thumbnail_url: thumbnailUrl,
          });
        }
      };
      for (const node of nodes) {
        collectIds(
          node,
          "ref_file_ids",
          ["ref_file_names", "result_file_names"],
          ["ref_thumbnails", "result_thumbnails"],
        );
      }
      const runnableIds = new Set(
        (nodes || []).map((n) => n?.node_id).filter(Boolean),
      );
      const workflowNodes = workflow2?.nodes || [];
      if (apiModeIntended) {
        for (const edge of workflow2?.edges || []) {
          if (!runnableIds.has(edge.target_node_id)) continue;
          const source = workflowNodes.find(
            (n) => n.node_id === edge.source_node_id,
          );
          if (!source) continue;
          if (isLastFramePort(edge.source_port)) {
            collectIds(
              source,
              "result_frame_file_ids",
              ["result_frame_file_names"],
              ["result_frame_thumbnails"],
            );
          } else if (source.node_type === "image" && source.ref_file_ids) {
            collectIds(
              source,
              "ref_file_ids",
              ["ref_file_names", "result_file_names"],
              ["ref_thumbnails", "result_thumbnails"],
            );
          } else if (source.result_file_ids) {
            collectIds(
              source,
              "result_file_ids",
              ["result_file_names", "ref_file_names"],
              ["result_thumbnails", "ref_thumbnails"],
            );
          }
        }
      }
      if (imagesToResolve.length === 0) return;
      if (!apiModeIntended && window.MessageBridge?.lookupFlowMediaCatalog) {
        try {
          const catalog = await window.MessageBridge.lookupFlowMediaCatalog(
            imagesToResolve
              .flatMap((image) => [image.id, image.file_name])
              .filter(Boolean),
          );
          if (catalog?.supported === true) {
            for (const image of imagesToResolve) {
              const info =
                catalog.known?.[image.id] || catalog.known?.[image.file_name];
              if (info) window.MediaRegistry?.setRefIdentity?.(image.id, info);
            }
            for (const owner of [...nodes, ...workflowNodes]) {
              window.MediaRegistry?.applyRefIdentityCorrection?.(
                owner,
                owner.ref_file_ids,
                owner.ref_file_ids,
                void 0,
                {
                  surface: "workflow:catalog-preflight",
                  nodeId: owner.node_id,
                },
              );
            }
            console.info(
              "[FlowMediaCatalog] workflow preflight",
              JSON.stringify({
                requested: imagesToResolve.length,
                known: Object.keys(catalog.known || {}).length,
                unknown: catalog.unknown?.length || 0,
                domScan: false,
                networkValidation: false,
              }),
            );
            return;
          }
        } catch (error) {
          console.warn(
            "[FlowMediaCatalog] workflow preflight unavailable:",
            error?.message,
          );
          return;
        }
      }
      log(
        `[S2.6.3] Batch pre-resolving ${imagesToResolve.length} ref images...`,
      );
      const results = new Map();
      const verifiedFileNameTiles = new Map();
      const namedImages = imagesToResolve.filter((img) => !!img.file_name);
      if (apiModeIntended) {
        const identityRefs = imagesToResolve.filter(
          (img) =>
            !!window.FlowApiAdapter?._resolveRefUuid?.(
              { refFileNames: { [img.id]: img.file_name } },
              img.id,
            ),
        );
        for (const img of identityRefs) {
          results.set(img.id, img.id);
          if (img.file_name) {
            verifiedFileNameTiles.set(img.file_name, img.id);
            window._workflowRefPreflightCache.set(img.file_name, img.id);
          }
        }
        if (identityRefs.length > 0) {
          console.log(
            "[FlowApiRefPreflight]",
            JSON.stringify({
              requested: identityRefs.length,
              acceptedByIdentity: identityRefs.length,
              networkValidation: false,
              domScanRequired: false,
            }),
          );
        }
      }
      if (
        apiModeIntended &&
        namedImages.length > 0 &&
        window.MessageBridge?.checkFilesExist
      ) {
        const domNamedImages = namedImages.filter(
          (img) => !results.has(img.id),
        );
        const allFileNames = [
          ...new Set(domNamedImages.map((img) => img.file_name)),
        ];
        let foundMap = {};
        let missingFileNames = allFileNames;
        if (allFileNames.length > 0) {
          try {
            const check =
              await window.MessageBridge.checkFilesExist(allFileNames);
            foundMap = check?.found || {};
            missingFileNames =
              check?.missing || allFileNames.filter((fn) => !foundMap[fn]);
          } catch (e) {
            log(
              `[S2.6.3] Mounted ref check failed, continue targeted scan: ${e.message}`,
            );
          }
        }
        if (
          missingFileNames.length > 0 &&
          window.MessageBridge?.sendToContentScript
        ) {
          log(
            `[S2.6.3] ${missingFileNames.length} refs not mounted, targeted lazy scan...`,
          );
          try {
            const scan = await window.MessageBridge.sendToContentScript(
              "ensureFlowTilesLoaded",
              {
                force: true,
                targetFileNames: missingFileNames,
                purpose: "identity",
              },
            );
            foundMap = { ...foundMap, ...(scan?.found || {}) };
          } catch (e) {
            log(`[S2.6.3] Targeted lazy scan failed: ${e.message}`);
          }
        }
        for (const img of domNamedImages) {
          const tileId = foundMap[img.file_name];
          if (!tileId) continue;
          results.set(img.id, tileId);
          verifiedFileNameTiles.set(img.file_name, tileId);
          window.TileCache?.set?.(img.file_name, tileId);
        }
      }
      const remaining = imagesToResolve.filter((img) => !results.has(img.id));
      if (remaining.length > 0) {
        window.TileCache?.clearFailed();
        let retry = window.TileResolver.batchResolve(remaining);
        for (const [id, tileId] of retry.results) results.set(id, tileId);
        if (
          !apiModeIntended &&
          retry.unresolved.length > 0 &&
          window.MessageBridge?.sendToContentScript
        ) {
          try {
            await window.MessageBridge.sendToContentScript(
              "ensureFlowTilesLoaded",
              {
                purpose: "identity",
                targetFileNames: retry.unresolved
                  .map((image) => image.file_name || image.id)
                  .filter(Boolean),
              },
            );
            window.TileCache?.clearFailed();
            retry = window.TileResolver.batchResolve(retry.unresolved);
            for (const [id, tileId] of retry.results) results.set(id, tileId);
          } catch (e) {
            log(`[S2.6.3] Web lazy load failed: ${e.message}`);
          }
        }
      }
      if (results.size > 0) {
        for (const img of imagesToResolve) {
          const tileId = img.file_name
            ? verifiedFileNameTiles.get(img.file_name)
            : null;
          if (apiModeIntended && img.file_name && tileId)
            window._workflowRefPreflightCache.set(img.file_name, tileId);
        }
        for (const node of nodes) {
          if (!node.ref_file_ids) continue;
          const refIds = (node.ref_file_ids || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          let changed = false;
          const correctedIds = refIds.map((id) => {
            if (results.has(id)) {
              changed = true;
              return results.get(id);
            }
            return id;
          });
          if (changed) {
            node.ref_file_ids = correctedIds.join(", ");
            for (const field of ["ref_thumbnails", "ref_file_names"]) {
              const map = node[field];
              if (!map || typeof map !== "object" || Array.isArray(map))
                continue;
              const remapped = {};
              for (const [k, v] of Object.entries(map)) {
                remapped[results.has(k) ? results.get(k) : k] = v;
              }
              node[field] = remapped;
            }
            log(`[S2.6.3] Node "${node.node_name}" ref_file_ids updated`);
          }
          if (node.node_type === "image") this._syncRefMapKeysByPosition(node);
        }
      }
      log(`[S2.6.3] Batch pre-resolve complete: ${results.size} resolved`);
    }
    _syncRefMapKeysByPosition(node, emitLog2 = null) {
      const ids = String(node?.ref_file_ids || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!ids.length) return false;
      let healed = false;
      for (const field of ["ref_thumbnails", "ref_file_names"]) {
        const map = node[field];
        if (!map || typeof map !== "object" || Array.isArray(map)) continue;
        const keys = Object.keys(map);
        if (keys.length !== ids.length) continue;
        if (ids.some((id) => Object.prototype.hasOwnProperty.call(map, id)))
          continue;
        const remapped = {};
        ids.forEach((id, i) => {
          remapped[id] = map[keys[i]];
        });
        node[field] = remapped;
        healed = true;
      }
      if (healed && emitLog2)
        emitLog2(
          `[Drift fix] "${node.node_name}": re-key ref map theo v\u1ECB tr\xED (${ids.length})`,
          "warn",
        );
      return healed;
    }
    async _acquireLockForNodeType(node) {
      const t = node.node_type || node.type;
      if (
        this._singleNodeSessionWorker &&
        t === "generate" &&
        window.PromptQueue?.isEnabled?.()
      )
        return null;
      if (!t || t === "note") return null;
      let provider = null;
      if (["generate", "download", "image", "telegram", "delay"].includes(t)) {
        provider = "flow";
      } else if (t === "chatgpt") {
        provider = "chatgpt";
      } else if (t === "grok") {
        provider = "grok";
      } else if (t === "gemini") {
        provider = "gemini";
      } else if (t === "prompt" && node.use_ai === true) {
        provider = node.provider || "chatgpt";
      }
      if (!provider) return null;
      if (node._serverStep?.parallel_allowed === true) {
        return null;
      }
      if (!window.ProviderTabLock) return null;
      try {
        return await window.ProviderTabLock.acquire(
          provider,
          `node ${node.node_name || node.node_id}`,
          { signal: this._flowAdmissionAbortController?.signal },
        );
      } catch (err) {
        console.warn(
          "[WorkflowExecutor] ProviderTabLock.acquire failed:",
          err.message,
        );
        if (
          ["PROVIDER_LOCK_CANCELLED", "PROVIDER_LOCK_TIMEOUT"].includes(
            err?.code,
          )
        )
          throw err;
        return null;
      }
    }
    _checkDependencies(node, nodes, edges, executionScope = null) {
      if (!nodes || !Array.isArray(nodes)) return { ok: true };
      const inputEdges = (edges || []).filter(
        (e) => e.target_node_id === node.node_id,
      );
      let _fileSrcTotal = 0;
      let _fileSrcWithResult = 0;
      const _emptyFileSrcNames = [];
      for (const edge of inputEdges) {
        const sourceNode = nodes.find((n) => n.node_id === edge.source_node_id);
        if (!sourceNode) continue;
        if (sourceNode.enabled === false) {
          continue;
        }
        if (sourceNode._userSkipped === true) {
          return {
            ok: false,
            reason: `Node ngu\u1ED3n "${sourceNode.node_name}" \u0111\xE3 b\u1ECB b\u1ECF qua (manual submit)`,
          };
        }
        if (sourceNode.status === "failed" || sourceNode.status === "skipped") {
          continue;
        }
        const outsideScope =
          executionScope instanceof Set &&
          !executionScope.has(String(sourceNode.node_id));
        if (sourceNode.status !== "completed" && !outsideScope) {
          return {
            ok: false,
            reason: `Node ngu\u1ED3n "${sourceNode.node_name}" ch\u01B0a ho\xE0n th\xE0nh`,
          };
        }
        if (
          sourceNode.node_type === "text_extract" &&
          sourceNode._extract_failed &&
          (sourceNode.extract_on_fail || "skip_downstream") ===
            "skip_downstream"
        ) {
          return {
            ok: false,
            reason: `Upstream extract failed: ${sourceNode._extract_reason || "no match"}`,
          };
        }
        if (["prompt", "text", "text_extract"].includes(sourceNode.node_type)) {
          const hasText =
            (sourceNode.result_text && sourceNode.result_text.trim()) ||
            (sourceNode.prompt && sourceNode.prompt.trim());
          if (!hasText) {
            console.warn(
              `[WorkflowExecutor] DEP_CHECK no text: src="${sourceNode.node_name}" (${sourceNode.node_type}) result_text=${JSON.stringify((sourceNode.result_text || "").substring(0, 80))} prompt=${JSON.stringify((sourceNode.prompt || "").substring(0, 80))}`,
            );
            return {
              ok: false,
              reason: `Node ngu\u1ED3n "${sourceNode.node_name}" kh\xF4ng c\xF3 text output`,
            };
          }
        } else if (!["delay", "note"].includes(sourceNode.node_type)) {
          _fileSrcTotal++;
          const sourceIds =
            sourceNode.node_type === "image"
              ? this._getImageSourceIds(sourceNode, false)
              : String(sourceNode.result_file_ids || "")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
          if (sourceIds.length === 0) {
            _emptyFileSrcNames.push(sourceNode.node_name);
          } else {
            _fileSrcWithResult++;
          }
        }
      }
      if (_fileSrcTotal > 0 && _fileSrcWithResult === 0) {
        return {
          ok: false,
          reason: `T\u1EA5t c\u1EA3 ${_fileSrcTotal} node ngu\u1ED3n kh\xF4ng c\xF3 file k\u1EBFt qu\u1EA3`,
        };
      }
      const _isVideoFrames =
        node.media_type === "Video" && node.video_input_type === "Frames";
      if (
        !_isVideoFrames &&
        _emptyFileSrcNames.length > 0 &&
        _fileSrcWithResult > 0
      ) {
        emitLog({
          nodeId: node.node_id,
          message: `"${node.node_name}" ch\u1EA1y thi\u1EBFu ${_emptyFileSrcNames.length} ref (node ngu\u1ED3n r\u1ED7ng: ${_emptyFileSrcNames.join(", ")}) \u2014 d\xF9ng ${_fileSrcWithResult} ref c\xF2n l\u1EA1i`,
          type: "warn",
        });
      }
      if (node.media_type === "Video" && node.video_input_type === "Frames") {
        const frameSources = [
          {
            source: node.frame_1_source,
            fileId: node.frame_1_file_id,
            label: "Frame 1",
          },
          {
            source: node.frame_2_source,
            fileId: node.frame_2_file_id,
            label: "Frame 2",
          },
        ];
        for (const frame of frameSources) {
          if (node.frame_ref_mode === "manual")
            frame.source = frame.fileId ? "manual" : "";
          if (
            node.frame_ref_mode === "upstream_node" &&
            frame.source === "manual"
          )
            frame.source = "";
          if (!frame.source || frame.source === "") continue;
          if (frame.source === "manual") {
            if (!frame.fileId) {
              return {
                ok: false,
                reason: `${frame.label} ch\u01B0a ch\u1ECDn \u1EA3nh`,
              };
            }
          } else {
            const sourceNode = nodes.find((n) => n.node_id === frame.source);
            if (!sourceNode) {
              return {
                ok: false,
                reason: `${frame.label}: node ngu\u1ED3n kh\xF4ng t\u1ED3n t\u1EA1i`,
              };
            }
            const outsideScope =
              executionScope instanceof Set &&
              !executionScope.has(String(sourceNode.node_id));
            if (sourceNode.status !== "completed" && !outsideScope) {
              return {
                ok: false,
                reason: `${frame.label}: node "${sourceNode.node_name}" ch\u01B0a ho\xE0n th\xE0nh`,
              };
            }
            const frameIds =
              sourceNode.node_type === "image"
                ? this._getImageSourceIds(sourceNode, false)
                : String(sourceNode.result_file_ids || "")
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
            if (frameIds.length === 0) {
              return {
                ok: false,
                reason: `${frame.label}: node "${sourceNode.node_name}" kh\xF4ng c\xF3 file k\u1EBFt qu\u1EA3`,
              };
            }
          }
        }
      }
      if (
        [
          "delay",
          "download",
          "note",
          "image",
          "telegram",
          "prompt",
          "text_extract",
        ].includes(node.node_type)
      ) {
        return { ok: true, reason: null };
      }
      const hasPromptUpstream = inputEdges.some((e) => {
        if (
          e.target_port &&
          e.target_port !== "text" &&
          e.target_port !== "default"
        )
          return false;
        const src = nodes.find((n) => n.node_id === e.source_node_id);
        return (
          src && ["prompt", "text", "text_extract"].includes(src.node_type)
        );
      });
      if (
        node.prompt_source === "upstream_node" ||
        !node.prompt ||
        node.prompt.trim() === ""
      ) {
        if (!hasPromptUpstream) {
          return {
            ok: false,
            reason: `Node "${node.node_name}" ch\u01B0a c\xF3 prompt`,
          };
        }
      }
      return { ok: true, reason: null };
    }
    async _recoverProviderTiles(sourceNode, emitLog2) {
      if (!this._providerRecoveryPromises)
        this._providerRecoveryPromises = new Map();
      const recoveryKey = sourceNode?.node_id || sourceNode;
      const activeRecovery = this._providerRecoveryPromises.get(recoveryKey);
      if (activeRecovery) {
        emitLog2(
          `[PROVIDER_RECOVERY] Await recovery \u0111ang ch\u1EA1y cho ${sourceNode?.node_name || recoveryKey}`,
        );
        return await activeRecovery;
      }
      const recoveryPromise = this._recoverProviderTilesInternal(
        sourceNode,
        emitLog2,
      );
      this._providerRecoveryPromises.set(recoveryKey, recoveryPromise);
      try {
        return await recoveryPromise;
      } finally {
        if (
          this._providerRecoveryPromises.get(recoveryKey) === recoveryPromise
        ) {
          this._providerRecoveryPromises.delete(recoveryKey);
        }
      }
    }
    async _recoverProviderTilesInternal(sourceNode, emitLog2) {
      if (!sourceNode?.result_provider_urls) {
        emitLog2(
          `[Recovery] Skip: no result_provider_urls for node ${sourceNode?.node_id?.substring(0, 16) || "unknown"}`,
        );
        emitLog2(
          `[Recovery] sourceNode keys: ${
            Object.keys(sourceNode || {})
              .filter((k) => k.startsWith("result_"))
              .join(", ") || "(no result_* keys)"
          }`,
        );
        return false;
      }
      if (!window.MessageBridge) {
        emitLog2(`[Recovery] Skip: no MessageBridge`);
        return false;
      }
      const ids = (sourceNode.result_file_ids || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (ids.length === 0) {
        emitLog2(`[Recovery] Skip: no result_file_ids`);
        return false;
      }
      emitLog2(
        `[Recovery] Checking ${ids.length} tile(s): ${ids.map((id) => id.substring(0, 16)).join(", ")}`,
      );
      emitLog2(
        `[Recovery] provider_urls keys: ${Object.keys(
          sourceNode.result_provider_urls || {},
        )
          .map((k) => k.substring(0, 16))
          .join(", ")}`,
      );
      let missing = [];
      try {
        let candidates = ids;
        if (window.MessageBridge.lookupFlowMediaCatalog) {
          const catalog = await window.MessageBridge.lookupFlowMediaCatalog(
            ids
              .flatMap((id) => [id, sourceNode.result_file_names?.[id]])
              .filter(Boolean),
          );
          if (catalog?.supported === true) {
            candidates = ids.filter((id) =>
              /^(?:chatgpt|grok|gemini)_/.test(id),
            );
            for (const id of ids) {
              const info =
                catalog.known?.[id] ||
                catalog.known?.[sourceNode.result_file_names?.[id]];
              if (info) window.MediaRegistry?.setRefIdentity?.(id, info);
            }
            if (!candidates.length) return false;
          }
        }
        const check = await window.MessageBridge.checkTilesExist(candidates);
        emitLog2(
          `[Recovery] checkTilesExist result: existing=${check?.existing?.length || 0}, missing=${check?.missing?.length || 0}`,
        );
        missing = check?.missing || [];
      } catch (e) {
        emitLog2(
          `[Recovery] checkTilesExist fail: ${e.message} \u2014 skip recovery`,
          "warn",
        );
        return false;
      }
      if (missing.length === 0) {
        emitLog2(`[Recovery] All tiles exist on Flow DOM, skip recovery`);
        return false;
      }
      const corrections = {};
      const missingWithFileName = missing.filter(
        (id) => !!sourceNode.result_file_names?.[id],
      );
      for (const oldId of missingWithFileName) {
        const fileName = sourceNode.result_file_names[oldId];
        try {
          const found = await window.MessageBridge.findTileByFileName(fileName);
          if (found?.tileId && found.tileId !== oldId) {
            corrections[oldId] = {
              newId: found.tileId,
              file_name: fileName,
              thumbnail: null,
            };
            emitLog2(
              `[PROVIDER_RECOVERY] filename-resolved ${oldId.substring(0, 16)} \u2192 ${found.tileId.substring(0, 16)}`,
            );
          }
        } catch (e) {
          emitLog2(
            `[PROVIDER_RECOVERY] findTileByFileName failed: ${e.message}`,
            "warn",
          );
        }
      }
      let unresolved = missing.filter((id) => !corrections[id]);
      const targetFileNames = [
        ...new Set(
          unresolved
            .map((id) => sourceNode.result_file_names?.[id])
            .filter(Boolean),
        ),
      ];
      let targetedScanFailed = false;
      if (targetFileNames.length > 0) {
        if (!window.MessageBridge?.sendToContentScript) {
          targetedScanFailed = true;
          emitLog2(
            "[PROVIDER_RECOVERY] targeted scan unavailable \u2014 kh\xF4ng upload named media m\xF9",
            "warn",
          );
        } else
          try {
            const scan = await window.MessageBridge.sendToContentScript(
              "ensureFlowTilesLoaded",
              { force: true, targetFileNames, purpose: "identity" },
            );
            if (scan?.success === false)
              throw new Error(scan.error || "TARGET_SCAN_FAILED");
            const foundMap = scan?.found || {};
            for (const oldId of unresolved) {
              const fileName = sourceNode.result_file_names?.[oldId];
              const newId = fileName ? foundMap[fileName] : null;
              if (newId && newId !== oldId) {
                corrections[oldId] = {
                  newId,
                  file_name: fileName,
                  thumbnail: null,
                };
                emitLog2(
                  `[PROVIDER_RECOVERY] targeted filename-resolved ${oldId.substring(0, 16)} \u2192 ${newId.substring(0, 16)}`,
                );
              }
            }
          } catch (e) {
            targetedScanFailed = true;
            emitLog2(
              `[PROVIDER_RECOVERY] targeted scan failed: ${e.message}`,
              "warn",
            );
          }
      }
      unresolved = missing.filter((id) => !corrections[id]);
      if (targetedScanFailed) {
        const deferred = unresolved.filter(
          (id) => !!sourceNode.result_file_names?.[id],
        );
        if (deferred.length > 0) {
          emitLog2(
            `[PROVIDER_RECOVERY] defer ${deferred.length} named media v\xEC targeted scan l\u1ED7i (kh\xF4ng upload m\xF9)`,
            "warn",
          );
          unresolved = unresolved.filter(
            (id) => !sourceNode.result_file_names?.[id],
          );
        }
      }
      if (unresolved.length > 0) {
        emitLog2(
          `[PROVIDER_RECOVERY] targeted-scan-miss ${unresolved.length}/${ids.length} \u2192 provider recovery`,
          "info",
        );
      }
      for (const oldId of unresolved) {
        const providerData = sourceNode.result_provider_urls[oldId];
        if (!providerData?.url) {
          emitLog2(
            `[Recovery] ${oldId.substring(0, 16)}: kh\xF4ng c\xF3 provider URL \u2014 skip`,
            "warn",
          );
          continue;
        }
        if (providerData.media_type === "video") {
          emitLog2(
            `[Recovery] ${oldId.substring(0, 16)}: video \u2014 Flow kh\xF4ng support upload, skip`,
            "warn",
          );
          continue;
        }
        const bridgeFn =
          providerData.provider === "chatgpt"
            ? window.MessageBridge.chatGPTBridgeToFlow
            : providerData.provider === "grok"
              ? window.MessageBridge.grokBridgeToFlow
              : providerData.provider === "gemini"
                ? window.MessageBridge.geminiBridgeToFlow
                : null;
        if (!bridgeFn) {
          emitLog2(
            `[Recovery] ${oldId.substring(0, 16)}: provider "${providerData.provider}" kh\xF4ng h\u1ED7 tr\u1EE3`,
            "warn",
          );
          continue;
        }
        try {
          emitLog2(
            `[PROVIDER_RECOVERY] will-upload ${oldId.substring(0, 16)} (${providerData.provider})`,
            "warn",
          );
          const fileName = `${providerData.provider}-recovered-${Date.now()}.png`;
          let bridgeResp;
          if (providerData.provider === "gemini") {
            const monitor =
              window.ProviderConfigManager?.getApiConfigValueSync?.(
                "gemini",
                "generation_monitor",
              )?.image;
            const maxBytes = Number(monitor?.max_materialized_bytes);
            bridgeResp = await bridgeFn.call(window.MessageBridge, {
              url: providerData.url,
              tabId: providerData.tab_id,
              fileName,
              maxBytes,
            });
          } else {
            bridgeResp = await bridgeFn.call(
              window.MessageBridge,
              providerData.url,
              providerData.tab_id,
              fileName,
            );
          }
          let newTileId = null;
          let newFileName = null;
          let newThumbnail = null;
          if (bridgeResp?.success) {
            if (providerData.provider === "chatgpt") {
              const td = Array.isArray(bridgeResp.tileDetails)
                ? bridgeResp.tileDetails[0]
                : bridgeResp.tileDetails || null;
              newTileId = td?.id || td?.tile_id || td?.tileId;
              newFileName = td?.file_name;
              newThumbnail = td?.thumbnailUrl || td?.thumbnail_url;
            } else {
              newTileId = bridgeResp.tileId;
              newFileName = bridgeResp.fileName;
              newThumbnail = bridgeResp.thumbnailUrl;
            }
          }
          if (newTileId) {
            corrections[oldId] = {
              newId: newTileId,
              file_name: newFileName,
              thumbnail: newThumbnail,
            };
            emitLog2(
              `[Recovery] ${oldId.substring(0, 16)} \u2192 ${newTileId.substring(0, 16)}`,
              "success",
            );
          } else {
            emitLog2(
              `[Recovery] ${oldId.substring(0, 16)} fail: ${bridgeResp?.error || "NO_TILE_ID"}`,
              "warn",
            );
          }
        } catch (err) {
          emitLog2(
            `[Recovery] ${oldId.substring(0, 16)} exception: ${err.message}`,
            "warn",
          );
        }
      }
      if (Object.keys(corrections).length === 0) return false;
      const newIdsArr = ids.map((id) => corrections[id]?.newId || id);
      sourceNode.result_file_ids = newIdsArr.join(", ");
      if (
        !sourceNode.result_thumbnails ||
        Array.isArray(sourceNode.result_thumbnails)
      )
        sourceNode.result_thumbnails = {};
      if (
        !sourceNode.result_file_names ||
        Array.isArray(sourceNode.result_file_names)
      )
        sourceNode.result_file_names = {};
      if (
        !sourceNode.result_provider_urls ||
        Array.isArray(sourceNode.result_provider_urls)
      )
        sourceNode.result_provider_urls = {};
      for (const [oldId, info] of Object.entries(corrections)) {
        const newId = info.newId;
        const oldThumb = sourceNode.result_thumbnails[oldId];
        if (oldThumb) {
          if (typeof oldThumb === "object") {
            sourceNode.result_thumbnails[newId] = {
              ...oldThumb,
              thumbnail: info.thumbnail || oldThumb.thumbnail,
              file_name: info.file_name || oldThumb.file_name,
            };
          } else {
            sourceNode.result_thumbnails[newId] = info.thumbnail || oldThumb;
          }
          delete sourceNode.result_thumbnails[oldId];
        } else if (info.thumbnail) {
          sourceNode.result_thumbnails[newId] = info.thumbnail;
        }
        if (sourceNode.result_file_names[oldId]) {
          sourceNode.result_file_names[newId] =
            info.file_name || sourceNode.result_file_names[oldId];
          delete sourceNode.result_file_names[oldId];
        } else if (info.file_name) {
          sourceNode.result_file_names[newId] = info.file_name;
        }
        if (sourceNode.result_provider_urls[oldId]) {
          sourceNode.result_provider_urls[newId] =
            sourceNode.result_provider_urls[oldId];
          delete sourceNode.result_provider_urls[oldId];
        }
        if (typeof MediaRegistry !== "undefined") {
          if (info.thumbnail) MediaRegistry.setThumb?.(newId, info.thumbnail);
          if (info.file_name)
            MediaRegistry.setFileName?.(newId, info.file_name);
        }
      }
      try {
        const wfId = this.currentWorkflow?.wf_id;
        if (wfId && window.storageManager?.updateNodeStatus) {
          const persisted = await window.storageManager.updateNodeStatus(
            wfId,
            sourceNode.node_id,
            {
              result_file_ids: sourceNode.result_file_ids,
              result_thumbnails: sourceNode.result_thumbnails,
              result_file_names: sourceNode.result_file_names,
              result_provider_urls: sourceNode.result_provider_urls,
            },
          );
          if (persisted === null) throw new Error("UPDATE_NODE_STATUS_FAILED");
        }
        emitLog2(
          `[PROVIDER_RECOVERY] persisted ${Object.keys(corrections).length} correction(s)`,
        );
      } catch (e) {
        emitLog2(`[PROVIDER_RECOVERY] persist failed: ${e.message}`, "warn");
      }
      window.eventBus?.emit("node:ref_replaced", {
        nodeId: sourceNode.node_id,
        resultFileIds: sourceNode.result_file_ids,
        resultFileNames: sourceNode.result_file_names,
        resultThumbnails: sourceNode.result_thumbnails,
        resultProviderUrls: sourceNode.result_provider_urls,
      });
      return true;
    }
    _consumerHasRefVideo(consumerNode, workflow2) {
      try {
        const ids = String(consumerNode?.ref_file_ids || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const isVid = (e) =>
          !!(e && typeof e === "object" && (e.type === "video" || e.video_url));
        for (const id of ids) {
          if (isVid(consumerNode?.ref_thumbnails?.[id])) return true;
          if (getThumbCache()?.get(id)?.type === "video") return true;
        }
        const edges = workflow2?.edges || [];
        for (const edge of edges) {
          if (edge?.target_node_id !== consumerNode?.node_id) continue;
          const src = (workflow2?.nodes || []).find(
            (n) => n.node_id === edge.source_node_id,
          );
          if (!src) continue;
          const srcIds =
            src.node_type === "image"
              ? this._getImageSourceIds(src, false)
              : String(src.result_file_ids || "")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
          for (const sid of srcIds) {
            if (
              isVid(src.ref_thumbnails?.[sid]) ||
              isVid(src.result_thumbnails?.[sid])
            )
              return true;
          }
        }
      } catch (_) {}
      return false;
    }
    _isFlowApiResultSource(sourceNode) {
      if (!sourceNode?.result_file_ids) return false;
      if (sourceNode.result_gen_mode === "api") return true;
      if (sourceNode.result_gen_mode) return false;
      try {
        const providerUrls = sourceNode.result_provider_urls;
        const ids = String(sourceNode.result_file_ids)
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
        return !!(
          providerUrls &&
          typeof providerUrls === "object" &&
          !Array.isArray(providerUrls) &&
          ids.length > 0 &&
          ids.every((id) => providerUrls[id]?.provider === "flow")
        );
      } catch (_) {
        return false;
      }
    }
    _canSkipBlanketUpstreamTileScan(node, workflow2, inputEdges) {
      try {
        if (
          window.FlowApiAdapter?.isApiModeIntended?.({ forWorkflow: true }) !==
          true
        )
          return false;
        if ((node?.node_type || node?.type) !== "generate") return false;
        const isFrames2 =
          node.media_type === "Video" && node.video_input_type === "Frames";
        if (
          !isFrames2 &&
          (node.voice_search_value ||
            window.CharacterRegistry.payload(node) ||
            window.MentionParser?.hasComponents?.(
              this._resolveEffectivePrompt(node, workflow2).text,
            ))
        )
          return false;
        const cache = window._workflowRefPreflightCache;
        if (!(cache instanceof Map)) return false;
        let hasMediaInput = false;
        const probeIds = [];
        const probeNames = {};
        const probeThumbs = {};
        const probeProviderUrls = {};
        const probeVideoIds = [];
        const addProbeMedia = (owner, ids) => {
          for (const id of ids) {
            probeIds.push(id);
            const name =
              owner?.ref_file_names?.[id] || owner?.result_file_names?.[id];
            if (name) probeNames[id] = name;
            const media =
              owner?.ref_thumbnails?.[id] || owner?.result_thumbnails?.[id];
            if (media) probeThumbs[id] = media;
            const provider = owner?.result_provider_urls?.[id];
            if (provider) probeProviderUrls[id] = provider;
            if (
              media &&
              typeof media === "object" &&
              (media.type === "video" || media.video_url)
            ) {
              probeVideoIds.push(id);
            }
          }
        };
        const fileNameIsVerified = (owner, id) => {
          const fileName =
            owner?.result_file_names?.[id] || owner?.ref_file_names?.[id];
          return !!(fileName && cache.has(fileName));
        };
        for (const edge of inputEdges) {
          if (isLastFramePort(edge.source_port)) return false;
          const source = (workflow2.nodes || []).find(
            (n) => n.node_id === edge.source_node_id,
          );
          if (!source) continue;
          const idsValue =
            (source.node_type || source.type) === "image"
              ? this._getImageSourceIds(source, false).join(", ")
              : source.result_file_ids;
          const ids = String(idsValue || "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean)
            .filter((id) => !id.startsWith("upload_"));
          if (ids.length === 0) continue;
          hasMediaInput = true;
          addProbeMedia(source, ids);
          if (this._isFlowApiResultSource(source)) {
            continue;
          }
          if (!ids.every((id) => fileNameIsVerified(source, id))) return false;
        }
        const ownIds = String(node.ref_file_ids || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
          .filter((id) => !id.startsWith("upload_"));
        if (ownIds.length > 0) {
          hasMediaInput = true;
          addProbeMedia(node, ownIds);
          if (!ownIds.every((id) => fileNameIsVerified(node, id))) return false;
        }
        const uniqueProbeIds = [...new Set(probeIds)];
        if (uniqueProbeIds.length > 0) {
          const probe = {
            refFileIds: uniqueProbeIds,
            refFileNames: probeNames,
            refThumbnails: probeThumbs,
            resultProviderUrls: probeProviderUrls,
            settings: {
              model: node.model,
              ratio: node.ratio,
              isFrames:
                node.media_type === "Video" &&
                node.video_input_type === "Frames",
              flowVideoDuration: node.video_duration || "6s",
              refVideoIds: [...new Set(probeVideoIds)],
            },
          };
          const unresolved =
            window.FlowApiAdapter?._resolveRefs?.(probe)?.unresolved ||
            uniqueProbeIds;
          if (unresolved.length > 0) return false;
          if (
            probeVideoIds.length > 0 &&
            window.FlowApiAdapter?.canResolveVideoKey?.(probe) !== true
          ) {
            return false;
          }
        }
        return hasMediaInput || ownIds.length === 0;
      } catch (_) {
        return false;
      }
    }
    async _canUseV2RefsWithoutBoard(node, workflow2) {
      if (
        !node ||
        !window.FlowApiFacade?.prepare ||
        !window.FlowApiV2Driver?.checkInputSupported
      )
        return false;
      const refIds = [],
        videoIds = [],
        thumbnails = {},
        names = {},
        providerUrls = {};
      const add = (owner, ids) => {
        for (const id of ids) {
          if (!id || id.startsWith("upload_")) continue;
          refIds.push(id);
          const media =
            owner.ref_thumbnails?.[id] ||
            owner.result_thumbnails?.[id] ||
            window.MediaRegistry?.getRefIdentity?.(id);
          if (media) thumbnails[id] = media;
          const name =
            owner.ref_file_names?.[id] || owner.result_file_names?.[id];
          if (name) names[id] = name;
          if (owner.result_provider_urls?.[id])
            providerUrls[id] = owner.result_provider_urls[id];
          if (
            media?.type === "video" ||
            media?.video_url ||
            (!media?.type && owner !== node && owner.media_type === "Video")
          )
            videoIds.push(id);
        }
      };
      add(
        node,
        String(node.ref_file_ids || "")
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean),
      );
      for (const edge of workflow2?.edges || []) {
        if (edge.target_node_id !== node.node_id) continue;
        if (isLastFramePort(edge.source_port)) return false;
        const owner = workflow2.nodes?.find(
          (source) => source.node_id === edge.source_node_id,
        );
        if (!owner) continue;
        add(
          owner,
          owner.node_type === "image"
            ? this._getImageSourceIds(owner, false)
            : String(owner.result_file_ids || "")
                .split(",")
                .map((id) => id.trim())
                .filter(Boolean),
        );
      }
      const candidate = {
        prompt: this._resolveEffectivePrompt(node, workflow2).text,
        refFileIds: [...new Set(refIds)],
        refThumbnails: thumbnails,
        refFileNames: names,
        resultProviderUrls: providerUrls,
        settings: {
          model: node.model,
          ratio: node.ratio,
          genType: node.media_type || node.gen_type,
          quantity: node.quantity,
          isFrames: node.video_input_type === "Frames",
          flowVideoDuration: node.video_duration,
          flowVideoResolution: node.video_resolution,
          refVideoIds: [...new Set(videoIds)],
          voice: node.voice_search_value
            ? { search_value: node.voice_search_value }
            : null,
          character: window.CharacterRegistry.payload(node),
        },
      };
      const selection = await window.FlowApiFacade.prepare(candidate, {
        owner: "workflow",
      });
      return (
        selection?.ok === true &&
        selection.driver === "v2" &&
        (
          await window.FlowApiV2Driver.checkInputSupported({
            item: candidate,
            mediaType: /video/i.test(candidate.settings.genType || "")
              ? "video"
              : "image",
          })
        )?.ready === true
      );
    }
    async _ensureApiMediaOnBoard(
      sourceNode,
      apiIds,
      emitLog2,
      consumerNode,
      workflow2,
    ) {
      if (!apiIds || apiIds.length === 0) return true;
      if (
        ["chatgpt", "gemini"].includes(
          consumerNode?.node_type || consumerNode?.type,
        ) &&
        this._sourceRefsHaveThumbnail(sourceNode)
      ) {
        emitLog2(
          `[API media] ${consumerNode.node_type || consumerNode.type} d\xF9ng thumbnail bytes \u2192 kh\xF4ng c\u1EA7n Flow board`,
        );
        return false;
      }
      if (window.FlowApiAdapter?.isApiModeIntended?.({ forWorkflow: true })) {
        try {
          if (await this._canUseV2RefsWithoutBoard(consumerNode, workflow2)) {
            emitLog2(
              "[API media] Flow API V2 input verified \u2192 use UUID refs; board scan/reload suppressed",
            );
            return false;
          }
        } catch (error) {
          emitLog2(
            `[API media] V2 admission unavailable: ${error?.message || "unknown"}`,
            "warn",
          );
        }
      }
      try {
        const _consumerIsFrames =
          consumerNode?.media_type === "Video" &&
          consumerNode?.video_input_type === "Frames";
        const _willFallbackDom = !!(
          (!_consumerIsFrames &&
            (consumerNode?.voice_search_value ||
              window.CharacterRegistry.payload(consumerNode) ||
              window.MentionParser?.hasComponents?.(
                this._resolveEffectivePrompt(consumerNode, workflow2).text,
              ))) ||
          this._consumerHasRefVideo(consumerNode, workflow2)
        );
        if (
          !_willFallbackDom &&
          window.FlowApiAdapter?.isApiModeIntended?.({ forWorkflow: true })
        ) {
          emitLog2(
            "[API media] Node k\u1EBF ti\u1EBFp c\u0169ng ch\u1EA1y Flow API \u2192 d\xF9ng th\u1EB3ng UUID, kh\xF4ng c\u1EA7n board",
          );
          return false;
        }
      } catch (_) {}
      const MB = window.MessageBridge;
      if (!MB?.checkFilesExist) return false;
      const _fnOf = (id) => this._flowBoardRefScanTarget(sourceNode, id);
      const _fnToId = new Map(apiIds.map((id) => [_fnOf(id), id]));
      const catalogReadyIds = new Set();
      if (MB?.lookupFlowMediaCatalog) {
        try {
          const lookupKeys = [
            ...new Set(
              apiIds.flatMap((id) => this._flowBoardRefAliases(sourceNode, id)),
            ),
          ];
          const catalog = await MB.lookupFlowMediaCatalog(lookupKeys);
          if (catalog?.supported === true) {
            for (const id of apiIds) {
              const aliases = this._flowBoardRefAliases(sourceNode, id);
              if (
                aliases.some((alias) =>
                  Object.prototype.hasOwnProperty.call(
                    catalog.known || {},
                    alias,
                  ),
                )
              ) {
                catalogReadyIds.add(id);
              }
            }
            if (catalogReadyIds.size > 0) {
              emitLog2(
                `[API media] media_catalog \u0111\xE3 x\xE1c nh\u1EADn ${catalogReadyIds.size}/${apiIds.length} media`,
              );
            }
          }
        } catch (error) {
          emitLog2(
            `[API media] Kh\xF4ng tra \u0111\u01B0\u1EE3c media_catalog: ${error?.message || error}`,
            "warn",
          );
        }
      }
      const _check = async () => {
        const pendingIds = apiIds.filter((id) => !catalogReadyIds.has(id));
        const names = pendingIds.map(_fnOf);
        if (names.length === 0) return [];
        try {
          const r = await MB.checkFilesExist(names);
          const miss = Array.isArray(r?.missing) ? r.missing : names;
          return miss.map((fn) => _fnToId.get(fn) || fn);
        } catch (_) {
          return apiIds.slice();
        }
      };
      let missing = await _check();
      if (missing.length === 0) return true;
      if (MB?.sendToContentScript) {
        const scanNames = [...new Set(missing.map(_fnOf).filter(Boolean))];
        try {
          const scan = await MB.sendToContentScript("ensureFlowTilesLoaded", {
            force: false,
            targetFileNames: scanNames,
            purpose: "interaction",
            recentOnly: true,
            reason: "workflow-api-media-recent-probe",
          });
          const found =
            scan?.success === true && scan?.domScan !== false
              ? scan.found || {}
              : {};
          const resolvedIds = missing.filter((id) =>
            this._flowBoardHasRefAlias(
              found,
              this._flowBoardRefAliases(sourceNode, id),
            ),
          );
          if (resolvedIds.length > 0) {
            if (!(window._workflowRefPreflightCache instanceof Map)) {
              window._workflowRefPreflightCache = new Map();
            }
            for (const id of resolvedIds) {
              const aliases = this._flowBoardRefAliases(sourceNode, id);
              const tileId = aliases.map((alias) => found[alias]).find(Boolean);
              if (!tileId) continue;
              for (const alias of aliases)
                window._workflowRefPreflightCache.set(alias, tileId);
            }
            const resolvedSet = new Set(resolvedIds);
            missing = missing.filter((id) => !resolvedSet.has(id));
            emitLog2(
              `[API media] \u0110\xE3 t\xECm th\u1EA5y ${resolvedIds.length} media \u1EDF top DOM`,
            );
          }
        } catch (error) {
          emitLog2(
            `[API media] Targeted scan th\u1EA5t b\u1EA1i: ${error?.message || error}`,
            "warn",
          );
        }
        if (missing.length === 0) return true;
      }
      if (!this._apiBoardReloaded && window.PromptQueue?.isEnabled?.()) {
        emitLog2(
          `[API media] ${missing.length} media ch\u01B0a l\xEAn board \u2192 n\u1EA1p l\u1EA1i trang Flow`,
          "warn",
        );
        try {
          const ok =
            await window.PromptQueue.getInstance().forceReloadAndStabilize(
              "workflow-api-media-refresh",
              {
                bypassSuppress: true,
                scope: "workflow",
                workflowId:
                  workflow2?.wf_id || this.currentWorkflow?.wf_id || null,
              },
            );
          if (ok) {
            this._apiBoardReloaded = true;
            if (consumerNode)
              consumerNode._flowTilesPreparedForRefCheck = false;
            missing = await _check();
          }
        } catch (e) {
          emitLog2(
            `[API media] N\u1EA1p l\u1EA1i trang th\u1EA5t b\u1EA1i: ${e?.message || e}`,
            "warn",
          );
        }
        if (missing.length === 0) {
          emitLog2(
            "[API media] \u0110\xE3 th\u1EA5y \u0111\u1EE7 media tr\xEAn board sau khi n\u1EA1p l\u1EA1i",
          );
          return true;
        }
      }
      if (typeof window.reuploadMissingFiles === "function") {
        const thumbs = sourceNode.result_thumbnails || {};
        const strMap = {};
        for (const id of missing) {
          const t = thumbs[id];
          const url = typeof t === "string" ? t : t?.thumbnail;
          const isVideo =
            t && typeof t === "object" && (t.type === "video" || t.video_url);
          if (!isVideo && typeof url === "string" && url.startsWith("http"))
            strMap[id] = url;
        }
        if (Object.keys(strMap).length > 0) {
          emitLog2(
            `[API media] C\xF2n ${missing.length} media thi\u1EBFu \u2192 th\u1EED t\u1EA3i l\u1EA1i t\u1EEB \u1EA3nh g\u1ED1c`,
          );
          try {
            const out = await window.reuploadMissingFiles(
              missing.join(", "),
              strMap,
              null,
              null,
              { surface: "workflow" },
            );
            const newIds = (out || "")
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean);
            const _reallyFixed =
              newIds.length === missing.length &&
              newIds.some((nid, i) => nid !== missing[i]);
            const _stillOld = newIds.filter((nid, i) => nid === missing[i]);
            if (_reallyFixed && _stillOld.length === 0) {
              const cur = (sourceNode.result_file_ids || "")
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean);
              const map = new Map(missing.map((old, i) => [old, newIds[i]]));
              sourceNode.result_file_ids = cur
                .map((id) => map.get(id) || id)
                .join(", ");
              for (const [oldId, newId] of map) {
                if (oldId === newId) continue;
                if (sourceNode.result_thumbnails?.[oldId]) {
                  sourceNode.result_thumbnails[newId] =
                    sourceNode.result_thumbnails[oldId];
                  delete sourceNode.result_thumbnails[oldId];
                }
                if (sourceNode.result_file_names) {
                  const _fn =
                    typeof MediaRegistry !== "undefined"
                      ? MediaRegistry.getFileName(newId)
                      : null;
                  if (_fn) sourceNode.result_file_names[newId] = _fn;
                  delete sourceNode.result_file_names[oldId];
                }
                if (sourceNode.result_provider_urls?.[oldId]) {
                  sourceNode.result_provider_urls[newId] =
                    sourceNode.result_provider_urls[oldId];
                  delete sourceNode.result_provider_urls[oldId];
                }
              }
              emitLog2(
                "[API media] \u0110\xE3 t\u1EA3i l\u1EA1i th\xE0nh c\xF4ng, ref tr\u1ECF sang tile m\u1EDBi",
              );
              return true;
            }
          } catch (e) {
            emitLog2(
              `[API media] T\u1EA3i l\u1EA1i t\u1EEB \u1EA3nh g\u1ED1c th\u1EA5t b\u1EA1i: ${e?.message || e}`,
              "warn",
            );
          }
        }
      }
      emitLog2(
        `[API media] Kh\xF4ng \u0111\u01B0a \u0111\u01B0\u1EE3c ${missing.length} media l\xEAn board. GI\u1EEE NGUY\xCAN id \u2014 node sau n\u1EBFu ch\u1EA1y ch\u1EBF \u0111\u1ED9 web s\u1EBD b\xE1o l\u1ED7i thi\u1EBFu \u1EA3nh tham chi\u1EBFu.`,
        "error",
      );
      return false;
    }
    async _recordWebRefReupload({ oldId, newId, info }) {
      this._assertWorkflowNotStopped();
      if (!this.currentWorkflow || !oldId || !newId || oldId === newId)
        throw new Error("FLOW_REF_RECOVERY_CONTEXT_MISSING");
      this._webRefReplacements || (this._webRefReplacements = new Map());
      this._webRefReplacements.set(oldId, { newId, info });
      for (const owner of this.currentWorkflow.nodes || []) {
        const saved = owner._original_ref_state || owner;
        const ids = String(saved.ref_file_ids || "")
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean);
        if (!ids.includes(oldId)) continue;
        const data = {
          ref_file_ids: ids.map((id) => (id === oldId ? newId : id)).join(", "),
          ref_file_names: {
            ...(saved.ref_file_names || {}),
            [newId]: info.file_name,
          },
          ref_thumbnails: { ...(saved.ref_thumbnails || {}), [newId]: info },
        };
        delete data.ref_file_names[oldId];
        delete data.ref_thumbnails[oldId];
        Object.assign(saved, data);
        if (saved !== owner) {
          owner.ref_file_ids = String(owner.ref_file_ids || "")
            .split(",")
            .map((id) => (id.trim() === oldId ? newId : id.trim()))
            .join(", ");
          owner.ref_file_names = {
            ...(owner.ref_file_names || {}),
            [newId]: info.file_name,
          };
          owner.ref_thumbnails = {
            ...(owner.ref_thumbnails || {}),
            [newId]: info,
          };
          delete owner.ref_file_names[oldId];
          delete owner.ref_thumbnails[oldId];
        }
        if (this._executionInProgress) {
          this._nodeStateBuffer.set(owner.node_id, {
            ...(this._nodeStateBuffer.get(owner.node_id) || {}),
            ...data,
          });
        } else {
          const persisted = await window.storageManager.updateNodeStatus(
            this.currentWorkflow.wf_id,
            owner.node_id,
            data,
          );
          if (persisted === null)
            throw new Error("FLOW_REF_RECOVERY_PERSIST_FAILED");
        }
        window.eventBus?.emit("node:ref_replaced", {
          nodeId: owner.node_id,
          newRefIds: data.ref_file_ids,
          refFileNames: data.ref_file_names,
          refThumbnails: data.ref_thumbnails,
          skipDomScan: true,
        });
      }
    }
    _assertWorkflowNotStopped() {
      if (this.shouldStop)
        throw Object.assign(new Error("ABORTED"), {
          code: "ABORTED",
          noRetry: true,
        });
    }
    async _markNodeCancelled(node) {
      if (!node?.node_id) return;
      node.status = "pending";
      node.error_message = "";
      await this._updateNodeStatus(node.node_id, "pending");
      window.eventBus.emit("node:cancelled", { node });
      broadcastEvent("node:cancelled", {
        node: { node_id: node.node_id, node_name: node.node_name },
      });
    }
    _updateGeminiWorkflowTracker(node, state, error = null) {
      if (this._singleNodeSessionWorker) {
        this._singleNodeRecord.trackerState = state;
        this._singleNodeSessionWorker._changed(this._singleNodeRecord);
        return;
      }
      if (!this._geminiTrackerJobs) this._geminiTrackerJobs = new Map();
      this._portableUploadStopReset = null;
      const id = `workflow-gemini:${node.node_id}`;
      const previous = this._geminiTrackerJobs.get(id);
      const terminal = ["COMPLETED", "FAILED", "CANCELLED"].includes(state);
      const now = Date.now();
      const item = {
        ...(previous?.items?.[0] || {}),
        id: node.node_id,
        promptIndex: 0,
        promptText: node._resolvedPrompt || node.prompt || node.node_name || "",
        state,
        error: error?.code || null,
        mediaType: node.media_type === "Video" ? "video" : "image",
        completedAt: terminal ? now : null,
      };
      if (state === "MONITORING") item.submittedAt = now;
      this._geminiTrackerJobs.set(id, {
        id,
        owner: "workflow",
        label: node.node_name || "Gemini",
        status: terminal
          ? state === "COMPLETED"
            ? "completed"
            : "stopped"
          : "running",
        startedAt: previous?.startedAt || now,
        completedAt: terminal ? now : null,
        total: 1,
        completed: state === "COMPLETED" ? 1 : 0,
        failed: state === "FAILED" ? 1 : 0,
        items: [item],
      });
      this._geminiTrackerRevision = Math.max(
        Date.now(),
        (this._geminiTrackerRevision || 0) + 1,
      );
      const data = {
        revision: this._geminiTrackerRevision,
        jobs: [...this._geminiTrackerJobs.values()],
      };
      const patterns =
        window.ProviderConfigManager?.getTabQueryPatterns?.("gemini") || [];
      if (!patterns.length) return;
      chrome.tabs.query({ url: patterns }, (tabs) => {
        if (chrome.runtime.lastError) return;
        for (const tab of tabs || [])
          chrome.tabs.sendMessage(
            tab.id,
            { action: "workflow:geminiTrackerUpdate", data },
            () => void chrome.runtime.lastError,
          );
      });
    }
    async _tracePreparationStage(node, stage, operation, nodeLog) {
      const startedAt = Date.now();
      const report = (state, code = null) => {
        const message =
          "[WorkflowPreparation] " +
          JSON.stringify({
            nodeId: node.node_id,
            provider: node.node_type,
            stage,
            state,
            elapsedMs: Date.now() - startedAt,
            code,
          });
        if (nodeLog) nodeLog(message, state === "failed" ? "warn" : "info");
        console.log(message);
      };
      report("started");
      const pendingTimer = setTimeout(() => report("pending"), 1e4);
      try {
        const result = await operation();
        report("completed");
        return result;
      } catch (error) {
        report("failed", error?.code || null);
        throw error;
      } finally {
        clearTimeout(pendingTimer);
      }
    }
    _flowBoardRefAliases(source, id) {
      const mediaRecords = [
        source?.ref_thumbnails?.[id],
        source?.result_thumbnails?.[id],
      ].filter((media) => media && typeof media === "object");
      return [
        ...new Set(
          [
            id,
            source?.ref_file_names?.[id],
            source?.result_file_names?.[id],
            ...mediaRecords.flatMap((media) => [
              media.media_uuid,
              media.file_name,
              media.persistent_media_id,
              ...(Array.isArray(media.identity_aliases)
                ? media.identity_aliases
                : []),
            ]),
          ]
            .map((value) => String(value || "").trim())
            .filter(Boolean),
        ),
      ];
    }
    _flowBoardHasRefAlias(found, aliases) {
      return (aliases || []).some((alias) =>
        Object.prototype.hasOwnProperty.call(found || {}, alias),
      );
    }
    _flowBoardRefScanTarget(source, id) {
      const mediaRecords = [
        source?.ref_thumbnails?.[id],
        source?.result_thumbnails?.[id],
      ].filter((media) => media && typeof media === "object");
      const apiMedia = mediaRecords.find((media) =>
        ["v1", "v2"].includes(media.api_driver),
      );
      if (apiMedia) {
        const uuid = [
          apiMedia.media_uuid,
          id,
          ...(Array.isArray(apiMedia.identity_aliases)
            ? apiMedia.identity_aliases
            : []),
        ].find((value) =>
          /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(
            String(value || ""),
          ),
        );
        if (uuid) return String(uuid);
      }
      return (
        source?.ref_file_names?.[id] ||
        source?.result_file_names?.[id] ||
        mediaRecords
          .map((media) => media.file_name || media.persistent_media_id)
          .find(Boolean) ||
        id
      );
    }
    async _correctUpstreamNodeIds(node, workflow2, emitLog2) {
      if (typeof window.correctFileIds !== "function") return;
      if (!workflow2?.nodes || !Array.isArray(workflow2.nodes)) return;
      const edges = workflow2.edges || [];
      const inputEdges = edges.filter((e) => e.target_node_id === node.node_id);
      if (inputEdges.length === 0) return;
      const scanTargets = [
        ...new Set(
          inputEdges.flatMap((edge) => {
            const source = workflow2.nodes.find(
              (n) => n.node_id === edge.source_node_id,
            );
            if (!source) return [];
            const frame = isLastFramePort(edge.source_port);
            const ids = frame
              ? String(source.result_frame_file_ids || "")
                  .split(",")
                  .map((id) => id.trim())
                  .filter(Boolean)
              : source.node_type === "image"
                ? this._getImageSourceIds(source, false)
                : String(source.result_file_ids || "")
                    .split(",")
                    .map((id) => id.trim())
                    .filter(Boolean);
            if (frame)
              return ids.filter((id) =>
                /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id),
              );
            return ids
              .map((id) => this._flowBoardRefScanTarget(source, id))
              .filter(Boolean);
          }),
        ),
      ];
      let initialScanFound = {};
      let initialScanCatalogKnown = {};
      let initialScanSucceeded = false;
      const runtimeFrameReady = (source) => {
        if (!source || !this._isLastFrameFresh(source)) return false;
        const ids = String(source.result_frame_file_ids || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        return (
          ids.length > 0 &&
          ids.every((id) => {
            const frame = source.result_frame_thumbnails?.[id];
            if (frame?.runtime_base64) return true;
            return (
              window.FlowApiAdapter?.isApiModeIntended?.({
                forWorkflow: true,
              }) === true &&
              frame?.identity_kind === "flow-api-uuid" &&
              window.FlowApiAdapter?._isUuid?.(frame.media_uuid || id) === true
            );
          })
        );
      };
      const onlyFreshRuntimeFrameMedia =
        inputEdges.some((e) => isLastFramePort(e.source_port)) &&
        inputEdges.every((edge) => {
          const source = workflow2.nodes.find(
            (n) => n.node_id === edge.source_node_id,
          );
          if (!source) return true;
          if (isLastFramePort(edge.source_port))
            return runtimeFrameReady(source);
          const sourceType = source.node_type || source.type;
          if (
            sourceType === "prompt" ||
            sourceType === "note" ||
            sourceType === "delay"
          )
            return true;
          const mediaIds =
            sourceType === "image"
              ? this._getImageSourceIds(source, false)
              : String(source.result_file_ids || "")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
          return mediaIds.length === 0;
        });
      let v2RefsWithoutBoard = false;
      if (
        (node?.node_type || node?.type) === "generate" &&
        window.FlowApiAdapter?.isApiModeIntended?.({ forWorkflow: true }) ===
          true
      ) {
        const admissionStartedAt = Date.now();
        try {
          v2RefsWithoutBoard = await this._canUseV2RefsWithoutBoard(
            node,
            workflow2,
          );
          console.info(
            "[WorkflowApiRefPreflight] V2 direct-ref admission",
            JSON.stringify({
              nodeId: node.node_id,
              accepted: v2RefsWithoutBoard,
              elapsedMs: Date.now() - admissionStartedAt,
            }),
          );
        } catch (error) {
          console.warn(
            "[WorkflowApiRefPreflight] V2 direct-ref admission failed",
            {
              nodeId: node.node_id,
              elapsedMs: Date.now() - admissionStartedAt,
              error: error?.message || String(error),
            },
          );
        }
      }
      if (v2RefsWithoutBoard) {
        node._flowV2RefsWithoutBoard = true;
        node._apiUpstreamIds = new Set(
          String(node.ref_file_ids || "")
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean)
            .filter((id) => !id.startsWith("upload_")),
        );
        for (const edge of inputEdges) {
          if (isLastFramePort(edge.source_port)) continue;
          const source = workflow2.nodes.find(
            (candidate) => candidate.node_id === edge.source_node_id,
          );
          if (!source) continue;
          const ids =
            (source.node_type || source.type) === "image"
              ? this._getImageSourceIds(source, false)
              : String(source.result_file_ids || "")
                  .split(",")
                  .map((id) => id.trim())
                  .filter(Boolean);
          for (const id of ids)
            if (!id.startsWith("upload_")) node._apiUpstreamIds.add(id);
        }
      }
      try {
        if (onlyFreshRuntimeFrameMedia) {
          node._flowTilesPreparedForRefCheck = true;
          emitLog2(
            "[Frame cu\u1ED1i] frame v\u1EEBa upload \u0111\xE3 \u0111\u01B0\u1EE3c x\xE1c minh \u2192 b\u1ECF zoom scan l\u1EB7p",
          );
          console.log(
            `[REUPLOAD_AUDIT] Skip blanket scan for fresh runtime last-frame on ${node.node_id}`,
          );
        } else if (v2RefsWithoutBoard) {
          node._flowTilesPreparedForRefCheck = true;
          emitLog2(
            "[Tile Load] Flow API V2 \u0111\xE3 accept UUID refs \u2192 b\u1ECF Flow board scan/correction",
          );
          console.info(
            "[WorkflowApiRefPreflight] V2 direct refs bypass Flow board",
            { nodeId: node.node_id, refCount: node._apiUpstreamIds?.size || 0 },
          );
        } else if (
          this._providerCanMaterializeUpstreamRefs(node, workflow2, inputEdges)
        ) {
          node._flowTilesPreparedForRefCheck = true;
          emitLog2(
            `[Tile Load] ${node.node_type} refs \u0111\xE3 c\xF3 thumbnail bytes \u2192 b\u1ECF Flow board scan/reload`,
          );
          console.info(
            "[WorkflowProviderRefPreflight] materialized refs bypass Flow board",
            { nodeId: node.node_id, provider: node.node_type },
          );
        } else if (
          this._canSkipBlanketUpstreamTileScan(node, workflow2, inputEdges)
        ) {
          node._flowTilesPreparedForRefCheck = true;
          emitLog2(
            "[Tile Load] API refs \u0111\xE3 \u0111\u01B0\u1EE3c preflight/UUID x\xE1c minh \u2192 b\u1ECF blanket scan tr\u01B0\u1EDBc node",
          );
          console.log(
            `[REUPLOAD_AUDIT] Skip Fix D2 blanket scan for API node ${node.node_id}`,
          );
        } else if (window.MessageBridge?.sendToContentScript) {
          console.log(
            `[REUPLOAD_AUDIT] Fix D2 \u2014 sendToContentScript('ensureFlowTilesLoaded') TR\u01AF\u1EDAC _correctUpstreamNodeIds loop (${inputEdges.length} upstream edges)`,
          );
          emitLog2(
            `[Tile Load] ensureFlowTilesLoaded TR\u01AF\u1EDAC T\u1EA7ng 1-5a (upstream check)`,
          );
          console.log(
            "[RefCorrectionAudit] initial scan start",
            JSON.stringify({
              nodeId: node.node_id,
              targetFileNames: scanTargets,
              targeted: scanTargets.length > 0,
            }),
          );
          const _r = await window.MessageBridge.sendToContentScript(
            "ensureFlowTilesLoaded",
            { targetFileNames: scanTargets, purpose: "identity" },
          );
          if (_r?.success === true) {
            initialScanSucceeded = true;
            initialScanFound = _r.found || {};
            initialScanCatalogKnown = _r.catalog?.known || {};
          }
          if (_r?.success !== false) node._flowTilesPreparedForRefCheck = true;
          console.log(
            `[REUPLOAD_AUDIT] Fix D2 \u2014 ensureFlowTilesLoaded DONE: ${JSON.stringify(_r)}`,
          );
        } else {
          console.warn(
            `[REUPLOAD_AUDIT] Fix D2 \u2014 MessageBridge.sendToContentScript kh\xF4ng t\u1ED3n t\u1EA1i!`,
          );
        }
      } catch (e) {
        console.warn(`[REUPLOAD_AUDIT] Fix D2 failed: ${e.message}`);
        emitLog2(
          `[Tile Load] ensureFlowTilesLoaded failed (upstream): ${e.message}`,
          "warn",
        );
      }
      if (
        initialScanSucceeded &&
        !this._apiBoardReloaded &&
        window.PromptQueue?.isEnabled?.()
      ) {
        const apiUploadCandidates = inputEdges.flatMap((edge) => {
          if (isLastFramePort(edge.source_port)) return [];
          const source = workflow2.nodes.find(
            (n) => n.node_id === edge.source_node_id,
          );
          if (source?.node_type !== "image") return [];
          return this._getImageSourceIds(source, false).flatMap((id) => {
            const media = [
              source.ref_thumbnails?.[id],
              source.result_thumbnails?.[id],
            ].find(
              (record) =>
                record &&
                typeof record === "object" &&
                ["v1", "v2"].includes(record.api_driver),
            );
            if (!media) return [];
            const aliases = this._flowBoardRefAliases(source, id);
            const name =
              source.ref_file_names?.[id] ||
              source.result_file_names?.[id] ||
              media.file_name ||
              media.media_uuid ||
              id;
            return [
              {
                name,
                aliases,
                scanTarget: this._flowBoardRefScanTarget(source, id),
              },
            ];
          });
        });
        let missingApiUploadRefs = apiUploadCandidates.filter(
          (candidate) =>
            !this._flowBoardHasRefAlias(initialScanFound, candidate.aliases),
        );
        if (
          missingApiUploadRefs.length > 0 &&
          window.MessageBridge?.sendToContentScript
        ) {
          try {
            const recent = await window.MessageBridge.sendToContentScript(
              "ensureFlowTilesLoaded",
              {
                targetFileNames: [
                  ...new Set(
                    missingApiUploadRefs.map(
                      (candidate) => candidate.scanTarget,
                    ),
                  ),
                ],
                purpose: "interaction",
                recentOnly: true,
                reason: "workflow-api-upload-recent-probe",
              },
            );
            if (recent?.success === true && recent?.domScan !== false) {
              initialScanFound = {
                ...initialScanFound,
                ...(recent.found || {}),
              };
              missingApiUploadRefs = missingApiUploadRefs.filter(
                (candidate) =>
                  !this._flowBoardHasRefAlias(
                    initialScanFound,
                    candidate.aliases,
                  ),
              );
            }
          } catch (error) {
            console.warn(
              "[WorkflowApiUploadDomRefresh] recent top probe failed",
              { nodeId: node.node_id, error: error?.message || String(error) },
            );
          }
        }
        const missingApiUploadNames = [
          ...new Set(missingApiUploadRefs.map((candidate) => candidate.name)),
        ];
        if (missingApiUploadNames.length > 0) {
          let v2CanUseRefsWithoutBoard = false;
          if (
            window.FlowApiAdapter?.isApiModeIntended?.({
              forWorkflow: true,
            }) === true
          ) {
            try {
              v2CanUseRefsWithoutBoard = await this._canUseV2RefsWithoutBoard(
                node,
                workflow2,
              );
            } catch (error) {
              console.warn(
                "[WorkflowApiUploadDomRefresh] V2 admission check failed",
                {
                  nodeId: node.node_id,
                  error: error?.message || String(error),
                },
              );
            }
          }
          if (v2CanUseRefsWithoutBoard) {
            emitLog2(
              "[API media] Flow API V2 input verified \u2192 b\u1ECF reload cho UUID refs",
            );
            console.info(
              "[WorkflowApiUploadDomRefresh] V2 UUID refs do not require Flow board",
              { nodeId: node.node_id, missing: missingApiUploadNames.length },
            );
            missingApiUploadRefs = [];
          }
        }
        if (
          missingApiUploadNames.length > 0 &&
          missingApiUploadRefs.length > 0
        ) {
          console.warn(
            "[WorkflowApiUploadDomRefresh] API-uploaded refs absent from Flow board",
            { nodeId: node.node_id, missing: missingApiUploadNames.length },
          );
          try {
            const reloaded =
              await window.PromptQueue.getInstance().forceReloadAndStabilize(
                "workflow-api-upload-ref-refresh",
                {
                  bypassSuppress: true,
                  scope: "workflow",
                  workflowId:
                    workflow2.wf_id || this.currentWorkflow?.wf_id || null,
                  settledIdentityRefresh: true,
                },
              );
            if (reloaded) {
              this._apiBoardReloaded = true;
              const retry = await window.MessageBridge.sendToContentScript(
                "ensureFlowTilesLoaded",
                { targetFileNames: scanTargets, purpose: "identity" },
              );
              initialScanSucceeded = retry?.success === true;
              initialScanFound = initialScanSucceeded ? retry.found || {} : {};
              initialScanCatalogKnown = initialScanSucceeded
                ? retry.catalog?.known || {}
                : {};
              node._flowTilesPreparedForRefCheck = initialScanSucceeded;
              console.info("[WorkflowApiUploadDomRefresh] post-reload scan", {
                nodeId: node.node_id,
                scanOk: initialScanSucceeded,
                resolved: missingApiUploadRefs.filter((candidate) =>
                  this._flowBoardHasRefAlias(
                    initialScanFound,
                    candidate.aliases,
                  ),
                ).length,
                requested: missingApiUploadRefs.length,
              });
            }
          } catch (error) {
            node._flowTilesPreparedForRefCheck = false;
            console.warn("[WorkflowApiUploadDomRefresh] reload/scan failed", {
              nodeId: node.node_id,
              error: error?.message || String(error),
            });
          }
          if (!this._apiBoardReloaded) {
            console.warn(
              "[WorkflowApiUploadDomRefresh] reload deferred; Web may submit with fewer refs",
              { nodeId: node.node_id, missing: missingApiUploadNames.length },
            );
          }
        }
      }
      for (const edge of inputEdges) {
        const sourceNode = workflow2.nodes.find(
          (n) => n.node_id === edge.source_node_id,
        );
        if (!sourceNode) continue;
        if (isLastFramePort(edge.source_port)) {
          let frameIds = String(sourceNode.result_frame_file_ids || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          if (!this._isLastFrameFresh(sourceNode)) {
            emitLog2(
              `[Frame stale] "${sourceNode.node_name}": frame kh\xF4ng kh\u1EDBp video hi\u1EC7n t\u1EA1i \u2192 tr\xEDch l\u1EA1i`,
              "warn",
            );
            sourceNode.result_frame_file_ids = null;
            sourceNode.result_frame_thumbnails = null;
            await this._extractFrameForNode(sourceNode, null);
            frameIds = String(sourceNode.result_frame_file_ids || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
          }
          if (!frameIds.length) {
            throw Object.assign(
              new Error(
                `Kh\xF4ng th\u1EC3 d\u1EF1ng frame tham chi\u1EBFu m\u1EDBi t\u1EEB "${sourceNode.node_name}"`,
              ),
              { code: "FRAME_REF_STALE" },
            );
          }
          let frameThumbs =
            sourceNode.result_frame_thumbnails &&
            typeof sourceNode.result_frame_thumbnails === "object" &&
            !Array.isArray(sourceNode.result_frame_thumbnails)
              ? sourceNode.result_frame_thumbnails
              : {};
          const mapsFor = (ids) => {
            const thumbs = {};
            const names = {};
            for (const id of ids) {
              const entry = frameThumbs[id];
              const thumb =
                typeof entry === "string"
                  ? entry
                  : entry?.runtime_base64 || entry?.thumbnail;
              const name =
                entry && typeof entry === "object" ? entry.file_name : null;
              if (thumb) thumbs[id] = thumb;
              if (name) names[id] = name;
            }
            return { thumbs, names };
          };
          let { thumbs: frameThumbMap, names: frameNameMap } =
            mapsFor(frameIds);
          if (runtimeFrameReady(sourceNode)) {
            emitLog2(
              `[Frame cu\u1ED1i] "${sourceNode.node_name}": d\xF9ng upload \u0111\xE3 x\xE1c minh trong runtime, kh\xF4ng scan/reupload`,
            );
            continue;
          }
          const persistedFramesResolved =
            initialScanSucceeded &&
            frameIds.every((id) => {
              const entry = frameThumbs[id];
              const aliases = [
                ...new Set(
                  [
                    id,
                    entry && typeof entry === "object"
                      ? entry.media_uuid
                      : null,
                    entry && typeof entry === "object" ? entry.file_name : null,
                    entry && typeof entry === "object"
                      ? entry.persistent_media_id
                      : null,
                    ...(entry &&
                    typeof entry === "object" &&
                    Array.isArray(entry.identity_aliases)
                      ? entry.identity_aliases
                      : []),
                  ]
                    .map((value) => String(value || "").trim())
                    .filter(Boolean),
                ),
              ];
              return aliases.some(
                (alias) =>
                  Object.prototype.hasOwnProperty.call(
                    initialScanFound,
                    alias,
                  ) ||
                  Object.prototype.hasOwnProperty.call(
                    initialScanCatalogKnown,
                    alias,
                  ) ||
                  Object.values(initialScanFound).includes(alias),
              );
            });
          if (persistedFramesResolved) {
            for (const id of frameIds) {
              const current =
                frameThumbs[id] && typeof frameThumbs[id] === "object"
                  ? frameThumbs[id]
                  : {};
              const aliases = [
                ...new Set(
                  [
                    id,
                    current.media_uuid,
                    current.file_name,
                    current.persistent_media_id,
                    ...(Array.isArray(current.identity_aliases)
                      ? current.identity_aliases
                      : []),
                  ]
                    .map((value) => String(value || "").trim())
                    .filter(Boolean),
                ),
              ];
              const catalogEntry =
                aliases
                  .map((alias) => initialScanCatalogKnown[alias])
                  .find(Boolean) ||
                Object.values(initialScanCatalogKnown).find((entry) => {
                  if (!entry || typeof entry !== "object") return false;
                  const entryAliases = [
                    entry.media_uuid,
                    entry.file_name,
                    entry.persistent_media_id,
                    ...(Array.isArray(entry.identity_aliases)
                      ? entry.identity_aliases
                      : []),
                  ]
                    .map((value) => String(value || "").trim())
                    .filter(Boolean);
                  return entryAliases.some((alias) => aliases.includes(alias));
                });
              if (!catalogEntry || typeof catalogEntry !== "object") continue;
              frameThumbs[id] = {
                ...catalogEntry,
                ...current,
                thumbnail: catalogEntry.thumbnail || current.thumbnail || "",
                source_thumbnail:
                  catalogEntry.source_thumbnail ||
                  current.source_thumbnail ||
                  catalogEntry.thumbnail ||
                  current.thumbnail ||
                  "",
                file_name: catalogEntry.file_name || current.file_name || "",
                persistent_media_id:
                  catalogEntry.persistent_media_id ||
                  current.persistent_media_id ||
                  catalogEntry.file_name ||
                  "",
                identity_aliases: [
                  ...new Set([
                    ...aliases,
                    ...(Array.isArray(catalogEntry.identity_aliases)
                      ? catalogEntry.identity_aliases
                      : []),
                  ]),
                ],
              };
            }
            sourceNode.result_frame_thumbnails = frameThumbs;
            emitLog2(
              `[Frame cu\u1ED1i] "${sourceNode.node_name}": frame \u0111\xE3 c\xF3 trong media catalog \u2192 t\xE1i s\u1EED d\u1EE5ng, kh\xF4ng zoom/reupload`,
            );
            continue;
          }
          if (Object.keys(frameThumbMap).length === 0) {
            emitLog2(
              `[Frame stale] "${sourceNode.node_name}": thi\u1EBFu thumbnail \u2192 tr\xEDch l\u1EA1i frame cu\u1ED1i`,
              "warn",
            );
            await this._extractFrameForNode(sourceNode, null);
            frameIds = String(sourceNode.result_frame_file_ids || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            frameThumbs =
              sourceNode.result_frame_thumbnails &&
              typeof sourceNode.result_frame_thumbnails === "object" &&
              !Array.isArray(sourceNode.result_frame_thumbnails)
                ? sourceNode.result_frame_thumbnails
                : {};
            ({ thumbs: frameThumbMap, names: frameNameMap } =
              mapsFor(frameIds));
          }
          let updatedIds = frameIds.join(", ");
          if (
            typeof window.reuploadMissingFiles === "function" &&
            Object.keys(frameThumbMap).length > 0
          ) {
            updatedIds = await window.reuploadMissingFiles(
              updatedIds,
              frameThumbMap,
              updatedIds,
              frameNameMap,
              { surface: "workflow" },
            );
          }
          const newIds = String(updatedIds || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          if (
            newIds.length === frameIds.length &&
            !_sameFileIdList(updatedIds, frameIds.join(", "))
          ) {
            const remapped = {};
            for (let i = 0; i < frameIds.length; i++) {
              const oldId = frameIds[i];
              const newId = newIds[i];
              const oldEntry = frameThumbs[oldId];
              const mrThumb = MediaRegistry.getThumb(newId);
              const mrName = MediaRegistry.getFileName(newId);
              remapped[newId] =
                oldEntry && typeof oldEntry === "object"
                  ? {
                      ...oldEntry,
                      ...(mrThumb && { thumbnail: mrThumb }),
                      ...(mrName && { file_name: mrName }),
                    }
                  : {
                      thumbnail: mrThumb || oldEntry || "",
                      type: "image",
                      file_name: mrName || frameNameMap[oldId] || "",
                    };
            }
            sourceNode.result_frame_file_ids = newIds.join(", ");
            sourceNode.result_frame_thumbnails = remapped;
            emitLog2(
              `[Frame stale] "${sourceNode.node_name}": re-upload ${frameIds.join(", ")} \u2192 ${newIds.join(", ")}`,
              "warn",
            );
            await this._updateNodeStatus(
              sourceNode.node_id,
              sourceNode.status || "completed",
              null,
              null,
              {
                result_frame_file_ids: sourceNode.result_frame_file_ids,
                result_frame_thumbnails: sourceNode.result_frame_thumbnails,
              },
            );
          }
          continue;
        }
        if (sourceNode.node_type === "image" && sourceNode.ref_file_ids) {
          await this._tracePreparationStage(
            node,
            "upstream_portable_refs",
            () => this._materializePortableImageRefs(sourceNode, emitLog2),
            emitLog2,
          );
          const canonicalIds = this._getImageSourceIds(sourceNode, false);
          const canonical = canonicalIds.join(", ");
          this._syncRefMapKeysByPosition(sourceNode, emitLog2);
          if (!_sameFileIdList(sourceNode.result_file_ids, canonical)) {
            const pick = (map) => {
              if (!map || typeof map !== "object" || Array.isArray(map))
                return {};
              const out = {};
              for (const id of canonicalIds)
                if (map[id] !== void 0) out[id] = map[id];
              return out;
            };
            sourceNode.result_file_ids = canonical;
            sourceNode.result_thumbnails = pick(sourceNode.ref_thumbnails);
            sourceNode.result_file_names = pick(sourceNode.ref_file_names);
            sourceNode.result_provider_urls = {};
            sourceNode.result_clean_file_ids = null;
            sourceNode.result_clean_thumbnails = null;
            emitLog2(
              `[Image source] "${sourceNode.node_name}": b\u1ECF result mirror c\u0169, d\xF9ng ${canonicalIds.length} ref hi\u1EC7n t\u1EA1i`,
            );
          }
        }
        if (!sourceNode.result_file_ids) continue;
        const srcType = sourceNode.node_type || sourceNode.type;
        const isProviderSource = ["chatgpt", "grok", "gemini", "muse"].includes(
          srcType,
        );
        if (node._flowV2RefsWithoutBoard === true) {
          emitLog2(
            `[Upstream] "${sourceNode.node_name}": Flow API V2 d\xF9ng UUID tr\u1EF1c ti\u1EBFp, b\u1ECF board correction/recovery`,
          );
          continue;
        }
        const _srcIsApi = this._isFlowApiResultSource(sourceNode);
        if (_srcIsApi) {
          const _apiIds = (sourceNode.result_file_ids || "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
          const _readyForRefResolution = await this._ensureApiMediaOnBoard(
            sourceNode,
            _apiIds,
            emitLog2,
            node,
            workflow2,
          );
          if (_readyForRefResolution) {
            emitLog2(
              `[Upstream] "${sourceNode.node_name}" (Flow API): identity \u0111\xE3 x\xE1c nh\u1EADn \u2192 \u0111\u1ED1i chi\u1EBFu b\xECnh th\u01B0\u1EDDng`,
            );
          } else {
            if (!node._apiUpstreamIds) node._apiUpstreamIds = new Set();
            for (const id of (sourceNode.result_file_ids || "")
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean)) {
              node._apiUpstreamIds.add(id);
            }
            continue;
          }
        }
        const originalIds = sourceNode.result_file_ids;
        const thumbMap = {
          ...(sourceNode.ref_thumbnails || {}),
          ...(sourceNode.result_thumbnails || {}),
        };
        const fileNameMap = {
          ...(sourceNode.ref_file_names || {}),
          ...(sourceNode.result_file_names || {}),
        };
        const hasMap =
          Object.keys(thumbMap).length > 0 ||
          Object.keys(fileNameMap).length > 0;
        const sourceIds = String(originalIds || "")
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean);
        const initialCatalogInfoFor = (id) => {
          const records = [
            sourceNode.ref_thumbnails?.[id],
            sourceNode.result_thumbnails?.[id],
          ].filter((record) => record && typeof record === "object");
          const aliases = [
            id,
            fileNameMap[id],
            ...records.flatMap((record) => [
              record.media_uuid,
              record.file_name,
              record.persistent_media_id,
              ...(Array.isArray(record.identity_aliases)
                ? record.identity_aliases
                : []),
            ]),
          ]
            .map((value) => String(value || "").trim())
            .filter(Boolean);
          for (const alias of aliases) {
            if (initialScanCatalogKnown[alias])
              return initialScanCatalogKnown[alias];
          }
          return null;
        };
        const initialMediaMetadata = Object.fromEntries(
          sourceIds.map((id) => [id, initialCatalogInfoFor(id)]),
        );
        const initialScanVerified =
          sourceIds.length > 0 &&
          sourceIds.every((id) => !!initialMediaMetadata[id]);
        if (initialScanVerified) {
          for (const id of sourceIds)
            window.MediaRegistry?.setRefIdentity?.(
              id,
              initialMediaMetadata[id],
            );
          window.MediaRegistry?.applyRefIdentityCorrection?.(
            sourceNode,
            originalIds,
            originalIds,
            initialMediaMetadata,
            {
              surface: "workflow:upstream-catalog",
              nodeId: sourceNode.node_id,
              fields:
                sourceNode.node_type === "image"
                  ? [
                      "ref_thumbnails",
                      "result_thumbnails",
                      "ref_file_names",
                      "result_file_names",
                    ]
                  : ["result_thumbnails", "result_file_names"],
            },
          );
          console.log(
            "[RefCorrectionAudit] reuse initial scan",
            JSON.stringify({
              nodeId: node.node_id,
              sourceNodeId: sourceNode.node_id,
              resolvedIds: sourceIds,
              correctedCount: 0,
            }),
          );
        }
        if (hasMap && !initialScanVerified) {
          emitLog2(
            `[Upstream] Ki\u1EC3m tra result IDs t\u1EEB "${sourceNode.node_name}": ${originalIds.substring(0, 60)}...`,
          );
          const { correctedIds, changed, mediaMetadata } =
            await this._tracePreparationStage(
              node,
              "upstream_correct_ids",
              () => window.correctFileIds(originalIds, thumbMap, fileNameMap),
              emitLog2,
            );
          const priorPersistentIds = sourceIds.map(
            (id) =>
              sourceNode.ref_thumbnails?.[id]?.persistent_media_id || null,
          );
          window.MediaRegistry?.applyRefIdentityCorrection?.(
            sourceNode,
            originalIds,
            originalIds,
            mediaMetadata,
            {
              surface: "workflow:upstream",
              nodeId: sourceNode.node_id,
              fields:
                sourceNode.node_type === "image"
                  ? [
                      "ref_thumbnails",
                      "result_thumbnails",
                      "ref_file_names",
                      "result_file_names",
                    ]
                  : ["result_thumbnails", "result_file_names"],
            },
          );
          if (
            !changed &&
            sourceNode.node_type === "image" &&
            sourceIds.some((id, index) => {
              const persistentId =
                sourceNode.ref_thumbnails?.[id]?.persistent_media_id;
              return (
                isFlowV2AsbIdentity(persistentId) &&
                persistentId !== priorPersistentIds[index] &&
                mediaMetadata?.[id]?.media_uuid === id
              );
            })
          ) {
            const identityUpdate = {
              ref_file_names: sourceNode.ref_file_names,
              ref_thumbnails: sourceNode.ref_thumbnails,
              result_file_names: sourceNode.result_file_names,
              result_thumbnails: sourceNode.result_thumbnails,
            };
            if (this._nodeStateBuffer?.has?.(sourceNode.node_id)) {
              this._nodeStateBuffer.set(sourceNode.node_id, {
                ...this._nodeStateBuffer.get(sourceNode.node_id),
                ...identityUpdate,
              });
            }
            window.eventBus?.emit("node:ref_replaced", {
              nodeId: sourceNode.node_id,
              newRefIds: sourceNode.ref_file_ids,
              refFileNames: sourceNode.ref_file_names,
              refThumbnails: sourceNode.ref_thumbnails,
              resultFileIds: sourceNode.result_file_ids,
              resultFileNames: sourceNode.result_file_names,
              resultThumbnails: sourceNode.result_thumbnails,
              skipDomScan: true,
            });
            try {
              await window.storageManager?.updateNodeStatus?.(
                this.currentWorkflow?.wf_id || workflow2.wf_id,
                sourceNode.node_id,
                identityUpdate,
              );
              console.info(
                "[WorkflowRefIdentity] persisted native ASB metadata",
                { nodeId: sourceNode.node_id, refs: sourceIds.length },
              );
            } catch (persistError) {
              console.warn(
                "[WorkflowRefIdentity] native ASB metadata persist deferred",
                {
                  nodeId: sourceNode.node_id,
                  reason: persistError?.message || String(persistError),
                },
              );
            }
          }
          if (changed) {
            sourceNode.result_file_ids = correctedIds;
            const corrections = {};
            const oldArr = (originalIds || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            const newArr = (correctedIds || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            for (let i = 0; i < oldArr.length; i++) {
              if (oldArr[i] !== newArr[i]) corrections[oldArr[i]] = newArr[i];
            }
            preserveFlowApiRefIdentity(sourceNode, corrections);
            if (
              sourceNode.result_thumbnails &&
              typeof sourceNode.result_thumbnails === "object" &&
              !Array.isArray(sourceNode.result_thumbnails)
            ) {
              const updated = {};
              for (const [oldId, url] of Object.entries(
                sourceNode.result_thumbnails,
              )) {
                updated[corrections[oldId] || oldId] = url;
              }
              sourceNode.result_thumbnails = updated;
            }
            if (
              sourceNode.result_file_names &&
              typeof sourceNode.result_file_names === "object" &&
              !Array.isArray(sourceNode.result_file_names)
            ) {
              const updated = {};
              for (const [oldId, fn] of Object.entries(
                sourceNode.result_file_names,
              )) {
                updated[corrections[oldId] || oldId] = fn;
              }
              sourceNode.result_file_names = updated;
            }
            if (
              sourceNode.result_provider_urls &&
              typeof sourceNode.result_provider_urls === "object" &&
              !Array.isArray(sourceNode.result_provider_urls)
            ) {
              const updated = {};
              for (const [oldId, pu] of Object.entries(
                sourceNode.result_provider_urls,
              )) {
                updated[corrections[oldId] || oldId] = pu;
              }
              sourceNode.result_provider_urls = updated;
            }
            if (sourceNode.node_type === "image") {
              const remap = (map) => {
                if (!map || typeof map !== "object" || Array.isArray(map))
                  return {};
                const out = {};
                for (const [oldId, value] of Object.entries(map))
                  out[corrections[oldId] || oldId] = value;
                return out;
              };
              sourceNode.ref_file_ids = correctedIds;
              sourceNode.ref_thumbnails = remap(sourceNode.ref_thumbnails);
              sourceNode.ref_file_names = remap(sourceNode.ref_file_names);
              if (this._nodeStateBuffer?.has?.(sourceNode.node_id)) {
                const buffered =
                  this._nodeStateBuffer.get(sourceNode.node_id) || {};
                this._nodeStateBuffer.set(sourceNode.node_id, {
                  ...buffered,
                  result_file_ids: sourceNode.result_file_ids,
                  result_thumbnails: sourceNode.result_thumbnails,
                  result_file_names: sourceNode.result_file_names,
                });
              }
              window.eventBus?.emit("node:ref_replaced", {
                nodeId: sourceNode.node_id,
                oldRefIds: originalIds,
                newRefIds: sourceNode.ref_file_ids,
                refFileNames: sourceNode.ref_file_names,
                refThumbnails: sourceNode.ref_thumbnails,
                resultFileIds: sourceNode.result_file_ids,
                resultFileNames: sourceNode.result_file_names,
                resultThumbnails: sourceNode.result_thumbnails,
              });
            }
            emitLog2(
              `[Upstream] \u0110\xE3 correct result IDs t\u1EEB "${sourceNode.node_name}": ${correctedIds.substring(0, 60)}...`,
            );
          } else {
            emitLog2(
              `[Upstream] Result IDs t\u1EEB "${sourceNode.node_name}" v\u1EABn h\u1EE3p l\u1EC7`,
            );
          }
        } else if (!hasMap && !isProviderSource) {
          emitLog2(
            `[Upstream] Node "${sourceNode.node_name}": kh\xF4ng c\xF3 thumbnail/file_name map, b\u1ECF qua correct`,
          );
          continue;
        }
        if (
          isProviderSource &&
          ["chatgpt", "grok", "gemini", "muse"].includes(node.node_type) &&
          this._sourceRefsHaveThumbnail(sourceNode)
        ) {
          emitLog2(
            `[Upstream] ${srcType} \u2192 ${node.node_type}: d\xF9ng media \u0111\xE3 materialize, kh\xF4ng ki\u1EC3m tra/reupload Flow tile`,
          );
        } else if (isProviderSource) {
          try {
            const recovered = await this._recoverProviderTiles(
              sourceNode,
              emitLog2,
            );
            if (!recovered) {
              emitLog2(
                `[Upstream] Node "${sourceNode.node_name}" (${srcType}): provider recovery skipped (tiles OK ho\u1EB7c kh\xF4ng recover \u0111\u01B0\u1EE3c)`,
              );
            }
          } catch (recErr) {
            emitLog2(
              `[Recovery] error cho "${sourceNode.node_name}": ${recErr.message}`,
              "warn",
            );
          }
        } else if (
          typeof window.reuploadMissingFiles === "function" &&
          !(
            ["grok", "chatgpt", "gemini"].includes(node.node_type) &&
            this._sourceRefsHaveThumbnail(sourceNode)
          )
        ) {
          const beforeUpstream = (sourceNode.result_file_ids || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          const upstreamThumbMap = {
            ...(sourceNode.result_thumbnails || {}),
            ...(sourceNode.ref_thumbnails || {}),
          };
          const upstreamFileNamesMap = {
            ...(sourceNode.result_file_names || {}),
            ...(sourceNode.ref_file_names || {}),
          };
          emitLog2(
            `[REUPLOAD_AUDIT] >>> Upstream T\u1EA7ng 5a FIRE \u2014 node "${sourceNode.node_name || sourceNode.node_id}" (${srcType}), result_ids: ${beforeUpstream.map((id) => id.substring(0, 18)).join(", ")}`,
            "warn",
          );
          emitLog2(
            `[REUPLOAD_AUDIT] Upstream file_names: ${JSON.stringify(upstreamFileNamesMap)}`,
          );
          emitLog2(
            `[REUPLOAD_AUDIT] Upstream thumb keys: ${Object.keys(
              upstreamThumbMap,
            )
              .map((k) => k.substring(0, 18))
              .join(", ")}`,
          );
          const updated = await this._tracePreparationStage(
            node,
            "upstream_reupload_check",
            () =>
              window.reuploadMissingFiles(
                sourceNode.result_file_ids,
                upstreamThumbMap,
                originalIds,
                upstreamFileNamesMap,
                { surface: "workflow" },
              ),
            emitLog2,
          );
          if (!_sameFileIdList(updated, sourceNode.result_file_ids)) {
            emitLog2(
              `[REUPLOAD_AUDIT] !!! UPSTREAM REUPLOAD HAPPENED \u2014 "${sourceNode.node_name}": ${sourceNode.result_file_ids.substring(0, 60)} \u2192 ${updated.substring(0, 60)}`,
              "warn",
            );
            emitLog2(
              `[Upstream T\u1EA7ng 5] Re-upload result t\u1EEB "${sourceNode.node_name}": ${updated.substring(0, 60)}...`,
            );
            const oldIdArr = beforeUpstream;
            const newIdArr = (updated || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            sourceNode.result_file_ids = updated;
            if (
              !sourceNode.result_file_names ||
              Array.isArray(sourceNode.result_file_names)
            )
              sourceNode.result_file_names = {};
            if (
              !sourceNode.result_thumbnails ||
              Array.isArray(sourceNode.result_thumbnails)
            )
              sourceNode.result_thumbnails = {};
            const _idsAligned = oldIdArr.length === newIdArr.length;
            for (let i = 0; i < newIdArr.length; i++) {
              const newId = newIdArr[i];
              if (!newId) continue;
              const oldId = _idsAligned ? oldIdArr[i] : null;
              if (oldId === newId) continue;
              const newFileName =
                MediaRegistry.getFileName(newId) ||
                (oldId ? sourceNode.result_file_names[oldId] : null);
              if (newFileName)
                sourceNode.result_file_names[newId] = newFileName;
              const newThumb =
                MediaRegistry.getThumb(newId) ||
                (oldId ? sourceNode.result_thumbnails[oldId] : null);
              if (newThumb) sourceNode.result_thumbnails[newId] = newThumb;
              if (oldId) {
                delete sourceNode.result_file_names[oldId];
                delete sourceNode.result_thumbnails[oldId];
              }
            }
            try {
              const persistPayload = {
                result_file_ids: sourceNode.result_file_ids,
                result_thumbnails: sourceNode.result_thumbnails,
                result_file_names: sourceNode.result_file_names,
              };
              if (sourceNode.node_type === "image") {
                this._syncRefMapKeysByPosition(sourceNode, emitLog2);
                sourceNode.ref_file_ids = sourceNode.result_file_ids;
                if (
                  sourceNode.ref_thumbnails &&
                  typeof sourceNode.ref_thumbnails === "object" &&
                  !Array.isArray(sourceNode.ref_thumbnails)
                ) {
                  const updatedRefThumbs = {};
                  for (let i = 0; i < oldIdArr.length; i++) {
                    const oldId = oldIdArr[i];
                    const newId = newIdArr[i];
                    if (oldId && newId && sourceNode.ref_thumbnails[oldId]) {
                      updatedRefThumbs[newId] =
                        sourceNode.ref_thumbnails[oldId];
                    } else if (oldId && sourceNode.ref_thumbnails[oldId]) {
                      updatedRefThumbs[oldId] =
                        sourceNode.ref_thumbnails[oldId];
                    }
                  }
                  sourceNode.ref_thumbnails = updatedRefThumbs;
                }
                if (
                  sourceNode.ref_file_names &&
                  typeof sourceNode.ref_file_names === "object" &&
                  !Array.isArray(sourceNode.ref_file_names)
                ) {
                  const updatedRefNames = {};
                  for (let i = 0; i < oldIdArr.length; i++) {
                    const oldId = oldIdArr[i];
                    const newId = newIdArr[i];
                    if (oldId && newId && sourceNode.ref_file_names[oldId]) {
                      updatedRefNames[newId] = sourceNode.ref_file_names[oldId];
                    } else if (oldId && sourceNode.ref_file_names[oldId]) {
                      updatedRefNames[oldId] = sourceNode.ref_file_names[oldId];
                    }
                  }
                  sourceNode.ref_file_names = updatedRefNames;
                }
                persistPayload.ref_file_ids = sourceNode.ref_file_ids;
                persistPayload.ref_thumbnails = sourceNode.ref_thumbnails;
                persistPayload.ref_file_names = sourceNode.ref_file_names;
              }
              await window.storageManager?.updateNodeStatus(
                this.currentWorkflow?.wf_id || workflow2.wf_id,
                sourceNode.node_id,
                persistPayload,
              );
              emitLog2(
                `[Persist] Upstream "${sourceNode.node_name}" new IDs \u0111\xE3 l\u01B0u DB \u2192 tr\xE1nh reupload l\u1EB7p`,
              );
            } catch (e) {
              emitLog2(
                `[Persist] Failed to save upstream "${sourceNode.node_name}": ${e.message}`,
                "warn",
              );
            }
            try {
              const isImageSrc = sourceNode.node_type === "image";
              window.eventBus?.emit("node:ref_replaced", {
                nodeId: sourceNode.node_id,
                oldRefIds: oldIdArr.join(", "),
                newRefIds: isImageSrc ? sourceNode.ref_file_ids : void 0,
                refFileNames: isImageSrc ? sourceNode.ref_file_names : void 0,
                refThumbnails: isImageSrc ? sourceNode.ref_thumbnails : void 0,
                resultFileIds: sourceNode.result_file_ids,
                resultFileNames: sourceNode.result_file_names,
                resultThumbnails: sourceNode.result_thumbnails,
              });
            } catch (e) {}
          }
          const afterUpstream = (updated || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          const droppedUpstream = beforeUpstream.length - afterUpstream.length;
          if (droppedUpstream > 0) {
            emitLog2(
              `[Node ${sourceNode.node_name}] ${droppedUpstream} \u1EA3nh k\u1EBFt qu\u1EA3 kh\xF4ng t\xECm th\u1EA5y, \u0111\xE3 b\u1ECB b\u1ECF qua`,
              "warn",
            );
            if (afterUpstream.length === 0 && beforeUpstream.length > 0) {
              emitLog2(
                `[Node ${sourceNode.node_name}] T\u1EA5t c\u1EA3 \u1EA3nh k\u1EBFt qu\u1EA3 \u0111\xE3 m\u1EA5t. Node ti\u1EBFp theo ch\u1EA1y kh\xF4ng c\xF3 input.`,
                "error",
              );
            }
          }
        }
      }
    }
    _historyNodeRefIds(node, workflow2) {
      const collected = this._collectInputFileIds(
        node,
        workflow2?.nodes || [],
        workflow2?.edges || [],
      );
      const values = Array.isArray(collected)
        ? collected
        : Object.values(collected || {});
      return [
        ...new Set(
          values.map((value) => String(value || "").trim()).filter(Boolean),
        ),
      ];
    }
    _historyNodeRefThumbnails(node, workflow2, usedIds) {
      const ids =
        Array.isArray(usedIds) && usedIds.length
          ? usedIds
          : this._historyNodeRefIds(node, workflow2);
      const sources = [node, ...(workflow2?.nodes || [])];
      const thumbnails = {};
      for (const id of ids) {
        for (const source of sources) {
          const entry =
            source?.ref_thumbnails?.[id] ||
            source?.result_thumbnails?.[id] ||
            source?.result_clean_thumbnails?.[id] ||
            source?.result_frame_thumbnails?.[id];
          if (entry) {
            thumbnails[id] = entry;
            break;
          }
        }
      }
      return thumbnails;
    }
    _collectInputFileIds(node, nodes, edges) {
      const _preferClean = ["generate", "chatgpt", "grok", "gemini"].includes(
        node?.node_type,
      );
      if (!nodes || !Array.isArray(nodes)) {
        return [];
      }
      if (
        node.media_type === "Video" &&
        node.video_input_type === "Frames" &&
        node.frame_ref_mode
      ) {
        if (node.frame_ref_mode === "manual" || node._framePortsResolved)
          return {
            frame1: node.frame_1_file_id || null,
            frame2: node.frame_2_file_id || null,
          };
        return {
          frame1:
            this._collectPortInputs(node, "frame_1", nodes, edges)[0] || null,
          frame2:
            this._collectPortInputs(node, "frame_2", nodes, edges)[0] || null,
        };
      }
      if (
        node.media_type === "Video" &&
        node.video_input_type === "Frames" &&
        (node.frame_1_source || node.frame_2_source)
      ) {
        return this._collectFrameFileIds(node, nodes);
      }
      const fileIds = [];
      const PASSTHROUGH_TYPES = ["delay", "note"];
      const inputEdges = (edges || []).filter(
        (e) => e.target_node_id === node.node_id,
      );
      for (const edge of inputEdges) {
        const sourceNode = nodes.find((n) => n.node_id === edge.source_node_id);
        if (!sourceNode) continue;
        if (isLastFramePort(edge.source_port)) {
          const frameIds = (sourceNode.result_frame_file_ids || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          fileIds.push(...frameIds);
          continue;
        }
        if (sourceNode.node_type === "image" && sourceNode.ref_file_ids) {
          const ids = this._getImageSourceIds(sourceNode, _preferClean);
          fileIds.push(...ids);
        } else if (sourceNode.result_file_ids) {
          const srcIds = this._cleanFirstIds(sourceNode, _preferClean);
          const ids = (srcIds || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          fileIds.push(...ids);
        } else if (PASSTHROUGH_TYPES.includes(sourceNode.node_type)) {
          const visited = new Set([node.node_id, sourceNode.node_id]);
          const queue = [sourceNode.node_id];
          while (queue.length > 0) {
            const currentId = queue.shift();
            const upstreamEdges = (edges || []).filter(
              (e) => e.target_node_id === currentId,
            );
            for (const ue of upstreamEdges) {
              const upNode = nodes.find((n) => n.node_id === ue.source_node_id);
              if (!upNode || visited.has(upNode.node_id)) continue;
              visited.add(upNode.node_id);
              if (isLastFramePort(ue.source_port)) {
                const frameIds = (upNode.result_frame_file_ids || "")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                fileIds.push(...frameIds);
              } else if (upNode.node_type === "image" && upNode.ref_file_ids) {
                fileIds.push(...this._getImageSourceIds(upNode, _preferClean));
              } else if (upNode.result_file_ids) {
                const upSrc = this._cleanFirstIds(upNode, _preferClean);
                const ids = (upSrc || "")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                fileIds.push(...ids);
              } else if (PASSTHROUGH_TYPES.includes(upNode.node_type)) {
                queue.push(upNode.node_id);
              }
            }
          }
        }
      }
      if (node.ref_file_ids) {
        const refIds = (node.ref_file_ids || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (refIds.length > 0) {
          log("Node ref_file_ids:", refIds);
        }
        fileIds.push(...refIds);
      }
      const buildFileNameLookup = () => {
        const map = new Map();
        if (node.ref_file_names) {
          for (const [id, fn] of Object.entries(node.ref_file_names))
            if (fn) map.set(id, fn);
        }
        for (const edge of inputEdges) {
          const src = nodes.find((n) => n.node_id === edge.source_node_id);
          if (!src) continue;
          if (src.result_file_names) {
            for (const [id, fn] of Object.entries(src.result_file_names))
              if (fn) map.set(id, fn);
          }
          if (src.ref_file_names) {
            for (const [id, fn] of Object.entries(src.ref_file_names))
              if (fn) map.set(id, fn);
          }
        }
        return map;
      };
      const fnLookup = buildFileNameLookup();
      const seenFileNames = new Set();
      const seenIds = new Set();
      const dedupedFileIds = [];
      for (const id of fileIds) {
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        const fn = fnLookup.get(id);
        if (fn) {
          if (seenFileNames.has(fn)) {
            log(
              `[Dedup file_name] Skip duplicate ID ${id.substring(0, 16)}... (c\xF9ng file_name v\u1EDBi ID \u0111\xE3 ch\u1ECDn)`,
            );
            continue;
          }
          seenFileNames.add(fn);
        }
        dedupedFileIds.push(id);
      }
      return dedupedFileIds;
    }
    _collectPortInputs(node, portName, nodes, edges) {
      if (!Array.isArray(edges) || !Array.isArray(nodes)) return [];
      const NodeTpl = window.NodeTemplates;
      const getFirstInPort = (n) => {
        if (!n || !NodeTpl?.getNodePorts) return null;
        const type = n.node_type || n.type;
        const ports = NodeTpl.getNodePorts(type, n) || { in: [] };
        return ports.in?.[0]?.name || null;
      };
      const getFirstOutPort = (n) => {
        if (!n || !NodeTpl?.getNodePorts) return null;
        const type = n.node_type || n.type;
        const ports = NodeTpl.getNodePorts(type, n) || { out: [] };
        return ports.out?.[0]?.name || null;
      };
      const portEdges = edges.filter((e) => {
        if (e.target_node_id !== node.node_id) return false;
        const tgtPort = e.target_port;
        if (!tgtPort || tgtPort === "default") {
          const firstPort = getFirstInPort(node);
          return firstPort === portName;
        }
        return tgtPort === portName;
      });
      const result = [];
      for (const edge of portEdges) {
        const upstream = nodes.find((n) => n.node_id === edge.source_node_id);
        if (!upstream) continue;
        let sourcePortName = edge.source_port;
        if (!sourcePortName || sourcePortName === "default") {
          sourcePortName = getFirstOutPort(upstream) || "default";
        }
        const _preferClean = /_ref$/.test(String(portName || ""));
        const data = this._getNodeOutputForPort(
          upstream,
          sourcePortName,
          _preferClean,
        );
        if (data === null || data === void 0) continue;
        if (Array.isArray(data)) {
          result.push(...data);
        } else if (typeof data === "string") {
          if (data.trim()) result.push(data.trim());
          else result.push(data);
        }
      }
      return result;
    }
    _cleanFirstIds(node, preferClean) {
      if (!preferClean) return node?.result_file_ids;
      const c = (node?.result_clean_file_ids || "").trim();
      return c && this._isCleanRefsFresh(node) ? c : node?.result_file_ids;
    }
    _getImageSourceIds(node, preferClean = false) {
      const split = (value) =>
        String(value || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .filter((id) => !id.startsWith("upload_"));
      const refs = split(node?.ref_file_ids);
      if (preferClean && refs.length > 0) {
        const clean = split(node?.result_clean_file_ids);
        if (clean.length === refs.length && this._isCleanRefsFresh(node))
          return clean;
      }
      if (refs.length > 0) return refs;
      return split(node?.result_file_ids);
    }
    _getNodeOutputForPort(node, portName, preferClean = false) {
      if (!node) return null;
      const splitIds = (s) =>
        (s || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
      const filterUploadKeys = (ids) =>
        ids.filter((id) => !id.startsWith("upload_"));
      if ((node.node_type || node.type) === "image" && portName !== "text") {
        if (preferClean && this._isCleanRefsFresh(node)) {
          const cleanIds = filterUploadKeys(
            splitIds(node.result_clean_file_ids),
          );
          if (cleanIds.length > 0) return cleanIds;
        }
        const thumbs = node.ref_thumbnails || {};
        const refIds = filterUploadKeys(splitIds(node.ref_file_ids));
        if (refIds.some((id) => thumbs[id])) return refIds;
        const thumbKeys = Object.keys(thumbs);
        if (refIds.length > 0) {
          return thumbKeys.length === refIds.length ? thumbKeys : refIds;
        }
        if (thumbKeys.length > 0) return thumbKeys;
        return splitIds(this._cleanFirstIds(node, preferClean));
      }
      if (!portName || portName === "default") {
        const nodeType = node.node_type || node.type;
        const portsCfg =
          typeof window.NodeTemplates?.getNodePorts === "function"
            ? window.NodeTemplates.getNodePorts(nodeType, node)
            : null;
        const firstOut = portsCfg?.out?.[0];
        if (firstOut?.type === "text") return node.result_text || "";
        const ids = splitIds(this._cleanFirstIds(node, preferClean));
        if (ids.length === 0 && nodeType === "image" && node.ref_file_ids) {
          return filterUploadKeys(splitIds(node.ref_file_ids));
        }
        return ids;
      }
      if (isLastFramePort(portName)) {
        return splitIds(node.result_frame_file_ids);
      }
      if (
        ["media", "image_out", "pass", "any_out", "video_out"].includes(
          portName,
        )
      ) {
        const ids = splitIds(this._cleanFirstIds(node, preferClean));
        if (
          ids.length === 0 &&
          node.node_type === "image" &&
          node.ref_file_ids
        ) {
          return filterUploadKeys(splitIds(node.ref_file_ids));
        }
        return ids;
      }
      const batchPromptMatch =
        node.node_type === "prompt" &&
        node.multi_prompt === true &&
        /^prompt_(\d+)$/.exec(String(portName || ""));
      if (batchPromptMatch) {
        const index = Number(batchPromptMatch[1]) - 1;
        const prompts = Array.isArray(node.prompts_json)
          ? node.prompts_json
              .map((item) => String(item || "").trim())
              .filter(Boolean)
          : [];
        return prompts[index] || null;
      }
      if (portName === "text") {
        if (!node.result_text && node.node_type === "prompt") {
          return (node.prompt || "").trim();
        }
        return node.result_text || "";
      }
      if (node.node_type === "image") {
        const r = splitIds(node.result_file_ids);
        if (r.length > 0) return r;
        return filterUploadKeys(splitIds(node.ref_file_ids));
      }
      return splitIds(node.result_file_ids);
    }
    _buildFileNameLookup(node, workflow2) {
      const lookup = {};
      if (!workflow2?.nodes) return lookup;
      const currentId = node?.node_id;
      for (const n of workflow2.nodes) {
        if (n.result_file_names) {
          Object.assign(lookup, n.result_file_names);
        }
        if (
          n.result_frame_thumbnails &&
          typeof n.result_frame_thumbnails === "object"
        ) {
          for (const [fid, meta] of Object.entries(n.result_frame_thumbnails)) {
            if (meta?.file_name) lookup[fid] = meta.file_name;
          }
        }
        if (n.ref_file_names && n.node_id !== currentId) {
          Object.assign(lookup, n.ref_file_names);
        }
      }
      return lookup;
    }
    _collectFrameFileIds(node, nodes) {
      const result = { frame1: null, frame2: null };
      if (node.frame_ref_mode === "manual")
        return {
          frame1: node.frame_1_file_id || null,
          frame2: node.frame_2_file_id || null,
        };
      if (!nodes || !Array.isArray(nodes)) {
        return result;
      }
      const resolveFrameOut = (sourceNode) => {
        if (!sourceNode) return null;
        const isVideoSrc =
          sourceNode.media_type === "Video" ||
          (sourceNode.node_type === "grok" && sourceNode.grok_mode === "video");
        const ids = isVideoSrc
          ? String(sourceNode.result_frame_file_ids || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : sourceNode.node_type === "image"
            ? this._getImageSourceIds(sourceNode, false)
            : String(sourceNode.result_file_ids || "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
        return ids[0] || null;
      };
      if (
        node.frame_1_source === "manual" &&
        node.frame_ref_mode !== "upstream_node"
      ) {
        result.frame1 = node.frame_1_file_id || null;
      } else if (node.frame_1_source) {
        result.frame1 = resolveFrameOut(
          nodes.find((n) => n.node_id === node.frame_1_source),
        );
      }
      if (
        node.frame_2_source === "manual" &&
        node.frame_ref_mode !== "upstream_node"
      ) {
        result.frame2 = node.frame_2_file_id || null;
      } else if (node.frame_2_source) {
        result.frame2 = resolveFrameOut(
          nodes.find((n) => n.node_id === node.frame_2_source),
        );
      }
      log("Frame file IDs:", result);
      return result;
    }
    _emptyGenerationResultError(result = {}) {
      const errorDetails = Array.isArray(result.errorDetails)
        ? result.errorDetails
        : [];
      const firstDetail = errorDetails[0] || {};
      const providerCode =
        (Array.isArray(firstDetail.providerErrorCodes)
          ? firstDetail.providerErrorCodes.find(Boolean)
          : null) ||
        firstDetail.grpcReason ||
        firstDetail.code ||
        result.pipelineResult?.stopReason ||
        result.pipelineResult?.failedPrompts?.find((item) => item?.error)
          ?.error ||
        null;
      const error = new Error(
        providerCode ||
          "T\u1EA5t c\u1EA3 gen \u0111\u1EC1u th\u1EA5t b\u1EA1i (0 k\u1EBFt qu\u1EA3)",
      );
      if (providerCode) error.code = providerCode;
      error.historyRoute = result.historyRoute || null;
      error.flowApiVersions = result.flowApiVersions || [];
      error.errorDetails = errorDetails;
      return error;
    }
    _recordStoppedFlowNodeHistory(node, workflow2, result) {
      if (node._genFailLogged) return;
      node._genFailLogged = true;
      const userStopped = result.stopOrigin === "user";
      const details = result.errorDetails || [];
      const failed =
        !userStopped && ((result.failed || 0) > 0 || details.length > 0);
      window.eventBus?.emit?.("prompt:completed", {
        prompt:
          node._effective_prompt ??
          this._resolveEffectivePrompt(node, workflow2).text,
        media_type: node.media_type || "image",
        model: this._historyModelForNode(node, "flow"),
        ratio: node.ratio || "",
        prompt_count: 1,
        quantity: parseInt(node.quantity) || 1,
        ref_file_ids: (
          result.refFileIdsUsed || this._historyNodeRefIds(node, workflow2)
        ).join(", "),
        ref_thumbnails: this._historyNodeRefThumbnails(
          node,
          workflow2,
          result.refFileIdsUsed,
        ),
        result_file_ids: "",
        result_thumbnails: [],
        source: this._historySource === "mcp" ? "mcp" : "workflow",
        source_id: workflow2?.wf_id || "",
        provider: "flow",
        status: failed ? "failed" : "stopped",
        stop_origin: userStopped ? "user" : null,
        error_reason: userStopped
          ? result.stopSource
            ? `USER_CANCELLED:${result.stopSource}`
            : "USER_CANCELLED"
          : result.stopReason || details[0]?.code || "GENERATION_STOPPED",
        error_details: details,
        duration_ms: result.durationMs || 0,
        flow_api_versions: result.flowApiVersions || [],
        gen_mode: result.historyRoute?.genMode ?? null,
        initial_gen_mode: result.historyRoute?.initialGenMode ?? null,
        fallback_reason: result.historyRoute?.fallbackReason ?? null,
        diagnostics: result.historyRoute?.diagnostics ?? null,
        project_id: workflow2?.project_id || null,
        auto_download: !!node.auto_download,
        submit_mode: this._manualSubmitMode === true ? "manual" : "auto",
      });
    }
    async _executeNode(node, workflow2, executionMeta = null) {
      delete node._genFailNotified;
      const nodeAccum = { thumbnails: {}, fileNames: {} };
      if (!this._nodeAccumMap) this._nodeAccumMap = new Map();
      this._nodeAccumMap.set(node.node_id, nodeAccum);
      this._currentNodeAccum = nodeAccum;
      this._lastTileThumbnails = {};
      this._lastTileFileNames = {};
      const nodeLog = (message, type = "info") => {
        emitLog({ nodeId: node.node_id, message, type });
      };
      await this._ensureFrameRefsExtracted(node, workflow2);
      await this._ensureCleanRefsUploaded(node, workflow2);
      return window.RetryHelper.execute(
        async ({ attempt, totalAttempts }) => {
          if (
            attempt > 1 &&
            ["generate", "chatgpt", "grok", "gemini", "muse"].includes(
              node.node_type,
            )
          )
            window.eventBus?.emit("node:phase", {
              nodeId: node.node_id,
              phase: "submitting",
            });
          if (attempt > 1) {
            nodeLog(
              `Th\u1EED l\u1EA1i l\u1EA7n ${attempt}/${totalAttempts}...`,
              "warn",
            );
          }
          log(
            `Executing node "${node.node_name}" (attempt ${attempt}/${totalAttempts})`,
          );
          try {
            return await this._executeNodeInternal(
              node,
              workflow2,
              nodeAccum,
              executionMeta,
            );
          } catch (error) {
            if (
              ["OFFLINE_CACHE_STALE", "OFFLINE_NO_QUOTA_INFO"].includes(
                error?.code,
              )
            ) {
              error.noRetry = true;
            }
            throw error;
          }
        },
        {
          label: `Node "${node.node_name}"`,
          maxRetries: this.settings.retryOnFail ? this.settings.maxRetries : 0,
          retryDelay: this.settings.retryDelay,
          shouldStop: () =>
            this.shouldStop &&
            !(this._submittedNodes && this._submittedNodes.has(node.node_id)),
          onRetry: (attempt, totalAttempts, error) => {
            nodeLog(`L\u1ED7i: ${error.message}`, "error");
            const waitSec = Math.round(this.settings.retryDelay / 1e3);
            nodeLog(
              `Ch\u1EDD ${waitSec}s tr\u01B0\u1EDBc khi th\u1EED l\u1EA1i...`,
              "warn",
            );
            window.eventBus?.emit("node:retry", {
              node,
              workflowId: workflow2?.wf_id || null,
              attempt,
              maxRetries: totalAttempts - 1,
              delayMs: this.settings.retryDelay,
              error,
            });
          },
          onFail: (error, attempts) => {
            if (error.workflowUserStopped) return;
            if (error.recoveryRequired) {
              nodeLog(error.message, "warn");
              return;
            }
            nodeLog(
              `Th\u1EA5t b\u1EA1i sau ${attempts} l\u1EA7n th\u1EED`,
              "error",
            );
            if (
              ["generate", "chatgpt", "grok", "gemini", "muse"].includes(
                node.node_type,
              )
            ) {
              this._notifyGenFailed(node, attempts, error);
            }
          },
        },
      );
    }
    async _executeNodeInternal(
      node,
      workflow2,
      nodeAccum = null,
      executionMeta = null,
    ) {
      const startTime = Date.now();
      const restoreInactivePrompt =
        ["generate", "chatgpt", "grok", "gemini", "muse"].includes(
          node.node_type,
        ) && node.prompt_source === "upstream_node";
      const inactivePrompt = restoreInactivePrompt ? node.prompt : null;
      const frameBackup =
        node.video_input_type === "Frames" && node.frame_ref_mode
          ? Object.fromEntries(
              [
                "ref_file_ids",
                "ref_thumbnails",
                "ref_file_names",
                ...(node.frame_ref_mode === "upstream_node"
                  ? [1, 2].flatMap((slot) =>
                      ["source", "file_id", "file_name", "thumbnail"].map(
                        (field) => `frame_${slot}_${field}`,
                      ),
                    )
                  : []),
              ].map((field) => [field, node[field]]),
            )
          : null;
      const quantity = node.quantity || 1;
      const allNewTileIds = [];
      const nodeLog = (message, type = "info") => {
        emitLog({ nodeId: node.node_id, message, type });
      };
      if (node.node_type === "note") {
        return { fileIds: [], duration: 0 };
      }
      const tabRelease = await this._acquireLockForNodeType(node);
      const shouldBlockFlow =
        node.node_type === "generate" &&
        !window.PromptQueue?.isEnabled?.() &&
        !!window.MessageBridge;
      if (shouldBlockFlow) {
        window.MessageBridge.sendToContentScript("pq:showBlocker", {}).catch(
          () => {},
        );
      }
      try {
        this._assertWorkflowNotStopped();
        if (node.node_type === "gemini")
          this._updateGeminiWorkflowTracker(node, "SUBMITTING");
        const result = await this._executeNodeDispatch(
          node,
          workflow2,
          nodeAccum,
          nodeLog,
          startTime,
          executionMeta,
        );
        if (node.node_type === "gemini")
          this._updateGeminiWorkflowTracker(
            node,
            this.shouldStop ? "CANCELLED" : "COMPLETED",
          );
        return result;
      } catch (error) {
        if (node.node_type === "gemini")
          this._updateGeminiWorkflowTracker(
            node,
            this.shouldStop || error?.code === "ABORTED"
              ? "CANCELLED"
              : "FAILED",
            error,
          );
        throw error;
      } finally {
        if (shouldBlockFlow) {
          window.MessageBridge.sendToContentScript("pq:hideBlocker", {}).catch(
            () => {},
          );
        }
        if (tabRelease) {
          try {
            tabRelease();
          } catch (e) {}
        }
        if (node._original_ref_state) {
          node.ref_file_ids = node._original_ref_state.ref_file_ids;
          node.ref_thumbnails = node._original_ref_state.ref_thumbnails;
          node.ref_file_names = node._original_ref_state.ref_file_names;
          delete node._original_ref_state;
        }
        if (
          node._portMergedRefIds &&
          node._portMergedRefIds.size > 0 &&
          typeof node.ref_file_ids === "string"
        ) {
          node.ref_file_ids = node.ref_file_ids
            .split(",")
            .map((s) => s.trim())
            .filter((id) => id && !node._portMergedRefIds.has(id))
            .join(", ");
        }
        delete node._portMergedRefIds;
        if (frameBackup) Object.assign(node, frameBackup);
        delete node._framePortsResolved;
        delete node._flowTilesPreparedForRefCheck;
        delete node._apiUpstreamIds;
        delete node._flowV2RefsWithoutBoard;
        if (restoreInactivePrompt) node.prompt = inactivePrompt;
        delete node._original_prompt_with_mentions;
        delete node._mentionRefSources;
      }
    }
    async _executeNodeDispatch(
      node,
      workflow2,
      nodeAccum,
      nodeLog,
      startTime,
      executionMeta = null,
    ) {
      const quantity = node.quantity || 1;
      const allNewTileIds = [];
      if (node.node_type === "prompt") {
        return this._executePromptNode(node, workflow2, nodeLog);
      }
      if (node.node_type === "text_extract") {
        return this._executeTextExtractNode(
          node,
          workflow2,
          nodeLog,
          startTime,
        );
      }
      const needsInput = [
        "generate",
        "telegram",
        "image",
        "delay",
        "chatgpt",
        "grok",
        "gemini",
      ];
      if (needsInput.includes(node.node_type)) {
        await this._tracePreparationStage(
          node,
          "upstream_refs",
          () => this._correctUpstreamNodeIds(node, workflow2, nodeLog),
          nodeLog,
        );
      }
      const originalNodePrompt =
        node.prompt_source === "upstream_node" ? "" : node.prompt || "";
      if (
        ["generate", "chatgpt", "grok", "gemini", "muse"].includes(
          node.node_type,
        ) &&
        (node.prompt_source === void 0 || node.prompt_source === null)
      ) {
        const hasUpstreamPromptNode = (workflow2.edges || []).some((e) => {
          if (e.target_node_id !== node.node_id) return false;
          const srcNode = workflow2.nodes.find(
            (n) => n.node_id === e.source_node_id,
          );
          return (
            srcNode &&
            ["prompt", "text", "text_extract"].includes(srcNode.node_type)
          );
        });
        const hasOwnPrompt = !!(node.prompt || "").trim();
        if (hasUpstreamPromptNode && !hasOwnPrompt) {
          node.prompt_source = "upstream_node";
          nodeLog(
            "Auto-detect prompt_source = upstream_node (textbox r\u1ED7ng + c\xF3 Prompt/Text/TextExtract connected)",
          );
        } else {
          node.prompt_source = "textbox";
          if (hasUpstreamPromptNode) {
            nodeLog(
              "Auto-detect prompt_source = textbox (node c\xF3 prompt ri\xEAng \u2192 \u01B0u ti\xEAn own prompt d\xF9 c\xF3 upstream connected)",
            );
          }
        }
      }
      if (
        ["generate", "chatgpt", "grok", "gemini", "muse"].includes(
          node.node_type,
        ) &&
        node.prompt_source === "textbox" &&
        !(node.prompt || "").trim()
      ) {
        const hasUpstreamTextEdge = (workflow2.edges || []).some((e) => {
          if (e.target_node_id !== node.node_id) return false;
          const tgtPort = e.target_port;
          if (tgtPort && tgtPort !== "default" && tgtPort !== "text")
            return false;
          const srcNode = workflow2.nodes.find(
            (n) => n.node_id === e.source_node_id,
          );
          if (
            !srcNode ||
            !["prompt", "text", "text_extract"].includes(srcNode.node_type)
          )
            return false;
          const text = (srcNode.result_text || srcNode.prompt || "").trim();
          return text.length > 0;
        });
        if (hasUpstreamTextEdge) {
          nodeLog(
            `Auto-override prompt_source: "textbox" \u2192 "upstream_node" cho node "${node.node_name}" (textbox r\u1ED7ng + c\xF3 upstream Prompt connected v\xE0o port "text")`,
            "warn",
          );
          node.prompt_source = "upstream_node";
        }
      }
      let portTextOverridden = false;
      if (
        ["generate", "chatgpt", "grok", "gemini", "muse"].includes(
          node.node_type,
        ) &&
        node.prompt_source === "upstream_node"
      ) {
        try {
          const combinedResult = this._combineUpstreamTexts(node, workflow2);
          if (combinedResult) {
            node.prompt = combinedResult.text;
            node._effective_prompt = combinedResult.text;
            nodeLog(
              `Prompt t\u1EEB ${combinedResult.sources.length} upstream(s): ${combinedResult.sources.map((u) => u.nodeName).join(", ")}`,
            );
            portTextOverridden = true;
          }
        } catch (err) {
          nodeLog('L\u1ED7i collect port "text": ' + err.message, "warn");
        }
      }
      if (
        !portTextOverridden &&
        ["generate", "chatgpt", "grok", "gemini", "muse"].includes(
          node.node_type,
        ) &&
        node.prompt_source === "upstream_node"
      ) {
        try {
          const { text: effectivePrompt, source } =
            this._resolveEffectivePrompt(node, workflow2);
          node._effective_prompt = effectivePrompt;
          node.prompt = effectivePrompt;
          if (effectivePrompt) {
            nodeLog(
              `Prompt source (legacy field): ${source} (len=${effectivePrompt.length})`,
            );
          }
        } catch (err) {
          nodeLog("Resolve upstream prompt l\u1ED7i: " + err.message, "error");
          throw err;
        }
      }
      if (
        ["generate", "chatgpt", "grok", "gemini", "muse"].includes(
          node.node_type,
        ) &&
        node.prompt_source === "upstream_node" &&
        !(node.prompt || "").trim()
      ) {
        nodeLog(
          `Prompt r\u1ED7ng: node "${node.node_name}" c\u1EA5u h\xECnh l\u1EA5y prompt t\u1EEB upstream nh\u01B0ng kh\xF4ng t\xECm th\u1EA5y text. Ki\u1EC3m tra: (1) \u0111\xE3 connect Prompt/Text node v\xE0o port "text" ch\u01B0a, (2) upstream node c\xF3 n\u1ED9i dung kh\xF4ng.`,
          "error",
        );
        const err = new Error(
          "EMPTY_UPSTREAM_PROMPT: " + (node.node_name || node.node_id),
        );
        err.code = "EMPTY_UPSTREAM_PROMPT";
        err.noRetry = true;
        node.last_error = "EMPTY_UPSTREAM_PROMPT";
        throw err;
      }
      delete node._mentionRefSources;
      const useOwnPrompt =
        node.prompt_source !== "upstream_node" && !portTextOverridden;
      const needPromptMentionPass =
        node.prompt_mode === "mention" || node.ref_mode === "mention";
      if (
        NODES_CAN_USE_MENTIONS.includes(node.node_type) &&
        needPromptMentionPass &&
        useOwnPrompt
      ) {
        try {
          const nodesBySlug = buildNodesBySlug(workflow2.nodes);
          console.log(
            `[Mention prompt_mode] originalNodePrompt (first 200 chars): ${originalNodePrompt.substring(0, 200)}`,
          );
          console.log(
            `[Mention prompt_mode] effective prompt (overridden): ${(node.prompt || "").substring(0, 200)}`,
          );
          console.log(
            `[Mention prompt_mode] nodesBySlug keys: ${[...nodesBySlug.keys()].join(", ") || "(none)"}`,
          );
          const effectivePrompt = node.prompt;
          node.prompt = originalNodePrompt;
          const { warnings, errors } = validateMentions(node, nodesBySlug);
          for (const w of warnings) {
            nodeLog(`[Mention] Warning: ${w.message}`, "warn");
          }
          for (const e of errors) {
            nodeLog(`[Mention] Error: ${e.message}`, "error");
          }
          const resolvedPrompt = resolvePromptMentions(node, nodesBySlug);
          console.info(
            "[WorkflowPromptExpansion]",
            JSON.stringify({
              nodeId: node.node_id,
              originalChars: originalNodePrompt.length,
              resolvedChars: resolvedPrompt.length,
              sources: parseMentions(originalNodePrompt).map((slug) => {
                const source = nodesBySlug.get(slug);
                const text =
                  source?.node_type === "text"
                    ? source.prompt
                    : source?.node_type === "prompt"
                      ? source.result_text || source.prompt
                      : source?.node_type === "text_extract"
                        ? source.result_text
                        : null;
                return {
                  slug,
                  nodeType: source?.node_type || null,
                  textChars: typeof text === "string" ? text.trim().length : 0,
                };
              }),
            }),
          );
          console.log(
            `[Mention prompt_mode] resolvedPrompt (first 200 chars): ${resolvedPrompt.substring(0, 200)}`,
          );
          node._original_prompt_with_mentions = originalNodePrompt;
          if (resolvedPrompt !== originalNodePrompt) {
            nodeLog(
              `[Mention] Resolved prompt: ${resolvedPrompt.substring(0, 100)}${resolvedPrompt.length > 100 ? "..." : ""}`,
            );
            node.prompt = resolvedPrompt;
            node._effective_prompt = resolvedPrompt;
          } else {
            node.prompt = effectivePrompt;
          }
        } catch (err) {
          nodeLog(
            "[Mention] L\u1ED7i resolve prompt mentions: " + err.message,
            "warn",
          );
        }
      }
      let mentionRefOverride = null;
      if (
        NODES_CAN_USE_MENTIONS.includes(node.node_type) &&
        node.ref_mode === "mention"
      ) {
        try {
          const nodesBySlug = buildNodesBySlug(workflow2.nodes);
          const promptForMentions = useOwnPrompt
            ? originalNodePrompt
            : node.prompt || "";
          console.log(
            `[Mention ref_mode] promptForMentions (first 200 chars): ${promptForMentions.substring(0, 200)}`,
          );
          console.log(
            `[Mention ref_mode] nodesBySlug keys: ${[...nodesBySlug.keys()].join(", ") || "(none)"}`,
          );
          const foundMentions = parseMentions(promptForMentions);
          const missingMentionRefs = foundMentions.filter((slug) => {
            const source = nodesBySlug.get(slug);
            return (
              source &&
              ["image", "generate", "chatgpt", "grok", "gemini"].includes(
                source.node_type,
              ) &&
              getMentionReferenceIds(source).length === 0
            );
          });
          if (missingMentionRefs.length) {
            nodeLog(
              `[Mention ref_mode] Ch\u01B0a c\xF3 media, gi\u1EEF trong prompt nh\u01B0 text: ${missingMentionRefs.map((slug) => "@" + slug).join(", ")}`,
              "warn",
            );
          }
          console.log(
            `[Mention ref_mode] parseMentions found: ${foundMentions.length > 0 ? foundMentions.join(", ") : "(none)"}`,
          );
          const currentPrompt = node.prompt;
          node.prompt = promptForMentions;
          mentionRefOverride = resolveMentionedRefImages(node, nodesBySlug);
          node.prompt = currentPrompt;
          console.log(
            `[Mention ref_mode] mentionRefOverride returned:`,
            mentionRefOverride,
          );
          console.log(
            `[Mention ref_mode] mentionRefOverride is array: ${Array.isArray(mentionRefOverride)}, length: ${mentionRefOverride?.length}`,
          );
          if (mentionRefOverride && mentionRefOverride.length > 0) {
            console.log(
              `[Mention ref_mode] ENTERING IF BLOCK \u2014 ${mentionRefOverride.length} ref image(s)`,
            );
            nodeLog(
              `[Mention ref_mode] Ch\u1EC9 s\u1EED d\u1EE5ng ${mentionRefOverride.length} ref image(s) t\u1EEB @mentions`,
            );
            if (!node._original_ref_state) {
              node._original_ref_state = {
                ref_file_ids: node.ref_file_ids || "",
                ref_thumbnails: { ...(node.ref_thumbnails || {}) },
                ref_file_names: { ...(node.ref_file_names || {}) },
              };
            }
            const mentionFileIds = mentionRefOverride.map((r) => r.fileId);
            node.ref_file_ids = mentionFileIds.join(", ");
            console.log(
              `[Mention ref_mode] SET node.ref_file_ids = "${node.ref_file_ids}"`,
            );
            console.log(
              `[Mention ref_mode] mentionRefOverride details:`,
              mentionRefOverride.map((r) => ({
                fileId: r.fileId,
                hasThumbnail: !!r.thumbnail,
                hasFileName: !!r.fileName,
              })),
            );
            if (!node.ref_thumbnails || Array.isArray(node.ref_thumbnails))
              node.ref_thumbnails = {};
            if (!node.ref_file_names || Array.isArray(node.ref_file_names))
              node.ref_file_names = {};
            for (const ref of mentionRefOverride) {
              if (ref.thumbnail)
                node.ref_thumbnails[ref.fileId] = ref.thumbnail;
              if (ref.fileName) node.ref_file_names[ref.fileId] = ref.fileName;
            }
            node._mentionRefSources = {};
            for (const ref of mentionRefOverride) {
              node._mentionRefSources[ref.fileId] = {
                sourceSlug: ref.sourceSlug,
                sourceNodeType: ref.sourceNodeType,
              };
            }
            nodeLog(
              `[Mention ref_mode] ref_file_ids set to: ${node.ref_file_ids}`,
            );
          } else if (mentionRefOverride && mentionRefOverride.length === 0) {
            nodeLog(
              "[Mention ref_mode] Kh\xF4ng c\xF3 ref kh\u1EA3 d\u1EE5ng t\u1EEB @mentions \u2014 ti\u1EBFp t\u1EE5c kh\xF4ng c\xF3 ref",
              "warn",
            );
            if (!node._original_ref_state) {
              node._original_ref_state = {
                ref_file_ids: node.ref_file_ids || "",
                ref_thumbnails: { ...(node.ref_thumbnails || {}) },
                ref_file_names: { ...(node.ref_file_names || {}) },
              };
            }
            node.ref_file_ids = "";
            node.ref_thumbnails = {};
            node.ref_file_names = {};
            node._mentionRefSources = {};
          }
        } catch (err) {
          nodeLog(
            "[Mention ref_mode] L\u1ED7i resolve ref images: " + err.message,
            "warn",
          );
        }
      }
      if (
        ["generate", "chatgpt", "grok", "gemini", "muse", "prompt"].includes(
          node.node_type,
        ) &&
        mentionRefOverride === null
      ) {
        try {
          const incomingRefAudit = (workflow2.edges || [])
            .filter((e) => e.target_node_id === node.node_id)
            .map((e) => {
              const sourceNode = workflow2.nodes.find(
                (n) => n.node_id === e.source_node_id,
              );
              const sourceType =
                sourceNode?.node_type || sourceNode?.type || null;
              const sourceIds =
                sourceType === "image"
                  ? this._getImageSourceIds(sourceNode, false)
                  : String(sourceNode?.result_file_ids || "")
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean);
              return {
                sourceNodeId: e.source_node_id,
                sourceType,
                sourcePort: e.source_port ?? null,
                targetPort: e.target_port ?? null,
                sourceIds,
                refIds: sourceNode?.ref_file_ids || "",
                resultIds: sourceNode?.result_file_ids || "",
                refThumbnailKeys: Object.keys(sourceNode?.ref_thumbnails || {}),
                resultThumbnailKeys: Object.keys(
                  sourceNode?.result_thumbnails || {},
                ),
              };
            });
          console.log(
            "[REF_EDGE_AUDIT] incoming edges for node",
            node.node_id,
            incomingRefAudit,
          );
          const explicitImageRefEdges = (workflow2.edges || []).filter((e) => {
            if (e.target_node_id !== node.node_id) return false;
            const sourceNode = workflow2.nodes.find(
              (n) => n.node_id === e.source_node_id,
            );
            if (
              e.target_port === "image_ref" ||
              e.target_port === "video_ref"
            ) {
              return true;
            }
            if (
              !e.target_port ||
              e.target_port === "default" ||
              e.target_port === null
            ) {
              if (
                [
                  "image",
                  "generate",
                  "chatgpt",
                  "grok",
                  "gemini",
                  "muse",
                ].includes(sourceNode?.node_type)
              ) {
                nodeLog(
                  `[Port-merge] Legacy edge t\u1EEB ${sourceNode.node_type} \u2192 treating as image_ref`,
                );
                return true;
              }
            }
            return false;
          });
          if (
            explicitImageRefEdges.some((edge) =>
              isLastFramePort(edge.source_port),
            )
          ) {
            console.log(
              `[LastFrameReuse] ${node.node_type} node ${node.node_id} reuses verified frame identity; bytes resolve at provider boundary`,
            );
          }
          const portImageRefsImg =
            explicitImageRefEdges.length > 0
              ? this._collectPortInputs(
                  node,
                  "image_ref",
                  workflow2.nodes,
                  explicitImageRefEdges,
                )
              : [];
          const portImageRefsVid =
            explicitImageRefEdges.length > 0
              ? this._collectPortInputs(
                  node,
                  "video_ref",
                  workflow2.nodes,
                  explicitImageRefEdges,
                )
              : [];
          const portImageRefs = [...portImageRefsImg, ...portImageRefsVid];
          const unavailableRefSources = explicitImageRefEdges.filter((edge) => {
            const src = workflow2.nodes.find(
              (n) => n.node_id === edge.source_node_id,
            );
            if (!src) return true;
            const configuredIds = String(src.ref_file_ids || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            if (configuredIds.length === 0) return false;
            const runtimeIds = this._collectPortInputs(
              node,
              edge.target_port || "image_ref",
              workflow2.nodes,
              [edge],
            );
            return runtimeIds.length === 0;
          });
          console.log(
            "[REF_EDGE_AUDIT] collection result",
            JSON.stringify({
              nodeId: node.node_id,
              acceptedEdges: explicitImageRefEdges.map((e) => ({
                sourceNodeId: e.source_node_id,
                sourcePort: e.source_port ?? null,
                targetPort: e.target_port ?? null,
              })),
              imageRefIds: portImageRefsImg,
              videoRefIds: portImageRefsVid,
              mergedRefIds: portImageRefs,
              sources: explicitImageRefEdges.map((edge) => {
                const src = workflow2.nodes.find(
                  (n) => n.node_id === edge.source_node_id,
                );
                const frame = isLastFramePort(edge.source_port);
                const ids = String(
                  frame
                    ? src?.result_frame_file_ids
                    : src?.result_file_ids || "",
                )
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                const names = frame
                  ? Object.fromEntries(
                      ids.map((id) => [
                        id,
                        src?.result_frame_thumbnails?.[id]?.file_name || null,
                      ]),
                    )
                  : Object.fromEntries(
                      ids.map((id) => [
                        id,
                        src?.result_file_names?.[id] || null,
                      ]),
                    );
                return {
                  nodeId: src?.node_id || null,
                  sourcePort: edge.source_port || null,
                  ids,
                  names,
                  cleanIds: String(src?.result_clean_file_ids || "")
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                };
              }),
            }),
          );
          if (unavailableRefSources.length > 0) {
            const sourceNames = unavailableRefSources.map((edge) => {
              const src = workflow2.nodes.find(
                (n) => n.node_id === edge.source_node_id,
              );
              return src?.node_name || edge.source_node_id;
            });
            const ownRefIds = String(node.ref_file_ids || "")
              .split(",")
              .map((id) => id.trim())
              .filter(Boolean);
            const allConnectedGenerateRefsMissing =
              node.node_type === "generate" &&
              portImageRefs.length === 0 &&
              ownRefIds.length === 0;
            if (
              (node.media_type === "Video" &&
                node.video_input_type === "Frames") ||
              allConnectedGenerateRefsMissing
            ) {
              const error = new Error(
                `REF_SOURCE_UNAVAILABLE:${sourceNames.join(",")}`,
              );
              error.code = "REF_UPLOAD_FAILED";
              error.noRetry = true;
              throw error;
            }
            nodeLog(
              `B\u1ECF qua ref ch\u01B0a s\u1EB5n s\xE0ng t\u1EEB ${sourceNames.join(", ")}; ti\u1EBFp t\u1EE5c v\u1EDBi ref c\xF2n l\u1EA1i`,
              "warn",
            );
          }
          if (portImageRefs.length > 0) {
            const refsToMerge = portImageRefs;
            const existing = (node.ref_file_ids || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            const combined = [...new Set([...existing, ...refsToMerge])];
            if (!node._original_ref_state) {
              node._original_ref_state = {
                ref_file_ids: node.ref_file_ids || "",
                ref_thumbnails: { ...(node.ref_thumbnails || {}) },
                ref_file_names: { ...(node.ref_file_names || {}) },
              };
            }
            node.ref_file_ids = combined.join(", ");
            if (!node._portMergedRefIds) node._portMergedRefIds = new Set();
            for (const id of refsToMerge) {
              if (!existing.includes(id)) node._portMergedRefIds.add(id);
            }
            if (!node.ref_thumbnails || Array.isArray(node.ref_thumbnails))
              node.ref_thumbnails = {};
            if (!node.ref_file_names || Array.isArray(node.ref_file_names))
              node.ref_file_names = {};
            for (const edge of explicitImageRefEdges) {
              const src = workflow2.nodes.find(
                (n) => n.node_id === edge.source_node_id,
              );
              if (!src) continue;
              const srcFrameThumbs =
                src.result_frame_thumbnails &&
                typeof src.result_frame_thumbnails === "object" &&
                !Array.isArray(src.result_frame_thumbnails)
                  ? src.result_frame_thumbnails
                  : {};
              const srcThumbs = {
                ...(src.ref_thumbnails || {}),
                ...(src.result_thumbnails || {}),
                ...srcFrameThumbs,
              };
              const srcFrameNames = {};
              for (const [fid, ent] of Object.entries(srcFrameThumbs)) {
                if (ent && typeof ent === "object" && ent.file_name)
                  srcFrameNames[fid] = ent.file_name;
              }
              const cleanRefsFresh = this._isCleanRefsFresh(src);
              const srcCleanThumbs =
                cleanRefsFresh &&
                src.result_clean_thumbnails &&
                typeof src.result_clean_thumbnails === "object" &&
                !Array.isArray(src.result_clean_thumbnails)
                  ? src.result_clean_thumbnails
                  : {};
              for (const [fid, entry] of Object.entries(srcCleanThumbs)) {
                if (fid !== CLEAN_SRC_KEY && entry && typeof entry === "object")
                  srcThumbs[fid] = entry;
              }
              const srcCleanNames = {};
              for (const [fid, ent] of Object.entries(srcCleanThumbs)) {
                if (ent && typeof ent === "object" && ent.file_name)
                  srcCleanNames[fid] = ent.file_name;
              }
              const srcFileNames = {
                ...(src.ref_file_names || {}),
                ...(src.result_file_names || {}),
                ...srcFrameNames,
                ...srcCleanNames,
              };
              for (const [fid, entry] of Object.entries(srcThumbs)) {
                const persistentId = resolveWorkflowPersistentMediaId(entry);
                if (!srcFileNames[fid] && persistentId)
                  srcFileNames[fid] = persistentId;
              }
              for (const [fid, thumb] of Object.entries(srcThumbs)) {
                if (!node.ref_thumbnails[fid]) node.ref_thumbnails[fid] = thumb;
              }
              for (const [fid, fname] of Object.entries(srcFileNames)) {
                if (!node.ref_file_names[fid]) node.ref_file_names[fid] = fname;
              }
              const srcIsImg = src.node_type === "image";
              const srcIsFrame = isLastFramePort(edge.source_port);
              const srcIdValue = srcIsFrame
                ? src.result_frame_file_ids
                : srcIsImg
                  ? src.ref_file_ids
                  : src.result_file_ids;
              const srcIds = (srcIdValue || "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              const thumbVals = Object.values(
                srcIsFrame ? srcFrameThumbs : srcThumbs,
              );
              const nameVals = Object.values(srcFileNames);
              if (srcIds.length > 0 && thumbVals.length === srcIds.length) {
                srcIds.forEach((sid, i) => {
                  if (!node.ref_thumbnails[sid] && thumbVals[i])
                    node.ref_thumbnails[sid] = thumbVals[i];
                });
              }
              if (srcIds.length > 0 && nameVals.length === srcIds.length) {
                srcIds.forEach((sid, i) => {
                  if (!node.ref_file_names[sid] && nameVals[i])
                    node.ref_file_names[sid] = nameVals[i];
                });
              }
            }
            for (const fid of refsToMerge) {
              if (!node.ref_thumbnails[fid]) {
                const mrThumb =
                  typeof MediaRegistry !== "undefined" &&
                  MediaRegistry.getThumb?.(fid);
                if (mrThumb) {
                  node.ref_thumbnails[fid] = mrThumb;
                  nodeLog(
                    `[Port-merge] Fallback MediaRegistry thumb cho ${fid.substring(0, 12)}`,
                  );
                }
              }
              if (!node.ref_file_names[fid]) {
                const mrName =
                  typeof MediaRegistry !== "undefined" &&
                  MediaRegistry.getFileName?.(fid);
                if (mrName) {
                  node.ref_file_names[fid] = mrName;
                }
              }
            }
            nodeLog(
              `Port "image_ref" merge: +${refsToMerge.length} \u1EA3nh (t\u1ED5ng ${combined.length})`,
            );
            nodeLog(
              `[Port-merge] ref_file_names after merge: ${JSON.stringify(node.ref_file_names)}`,
            );
          }
        } catch (err) {
          if (err?.code === "REF_UPLOAD_FAILED" || err?.noRetry === true)
            throw err;
          nodeLog('L\u1ED7i collect port "image_ref": ' + err.message, "warn");
        }
      }
      if (
        node.node_type === "generate" &&
        node.media_type === "Video" &&
        node.video_input_type === "Frames" &&
        node.frame_ref_mode !== "manual"
      ) {
        if (node.frame_ref_mode === "upstream_node")
          this._resolveGrokFramePortInputs(node, workflow2);
        try {
          const f1 = this._collectPortInputs(
            node,
            "frame_1",
            workflow2.nodes,
            workflow2.edges,
          );
          if (f1.length > 0 && !node.frame_1_file_id) {
            node.frame_1_file_id = f1[0];
            nodeLog(
              `Frame 1 t\u1EEB port: ${node.frame_1_file_id.substring(0, 16)}...`,
            );
          }
          const f2 = this._collectPortInputs(
            node,
            "frame_2",
            workflow2.nodes,
            workflow2.edges,
          );
          if (f2.length > 0 && !node.frame_2_file_id) {
            node.frame_2_file_id = f2[0];
            nodeLog(
              `Frame 2 t\u1EEB port: ${node.frame_2_file_id.substring(0, 16)}...`,
            );
          }
        } catch (err) {
          nodeLog("L\u1ED7i collect port frame: " + err.message, "warn");
        }
      }
      if (node.node_type === "delay") {
        return this._executeDelayNode(node, nodeLog);
      }
      if (node.node_type === "image") {
        return this._executeImageNode(node, nodeLog);
      }
      if (node.node_type === "text") {
        nodeLog(
          "Text node pass-through: " + (node.prompt || "").substring(0, 100),
        );
        node.result_text = node.prompt || "";
        return { success: true, text: node.result_text };
      }
      if (node.node_type === "note") {
        nodeLog("Note node skipped (visual only)");
        return { success: true };
      }
      if (node.node_type === "telegram") {
        return this._executeTelegramNode(node, workflow2, nodeLog);
      }
      if (node.node_type === "download") {
        return this._executeDownloadNode(node, workflow2, nodeLog);
      }
      if (node.node_type === "chatgpt") {
        return this._executeChatGPTImageNode(
          node,
          workflow2,
          nodeLog,
          nodeAccum,
        );
      }
      if (node.node_type === "grok") {
        return this._executeGrokImageNode(node, workflow2, nodeLog, nodeAccum);
      }
      if (node.node_type === "gemini") {
        return this._executeGeminiNode(node, workflow2, nodeLog, nodeAccum);
      }
      if (node.node_type === "muse") {
        return this._executeMuseNode(node, workflow2, nodeLog, nodeAccum);
      }
      const sharedFlowFrames =
        node.media_type === "Video" &&
        node.video_input_type === "Frames" &&
        !!node.frame_ref_mode;
      if (sharedFlowFrames) node.ref_file_ids = "";
      if (
        !sharedFlowFrames &&
        !node.ref_file_ids &&
        node.ref_file_names &&
        Object.keys(node.ref_file_names).length > 0
      ) {
        node.ref_file_ids = Object.keys(node.ref_file_names).join(", ");
        nodeLog(
          "Smart Clone: reconstructed ref_file_ids from ref_file_names: " +
            node.ref_file_ids,
        );
      } else if (
        !sharedFlowFrames &&
        !node.ref_file_ids &&
        node.ref_thumbnails &&
        Object.keys(node.ref_thumbnails).length > 0
      ) {
        node.ref_file_ids = Object.keys(node.ref_thumbnails).join(", ");
        nodeLog(
          "Smart Clone: reconstructed ref_file_ids from ref_thumbnails: " +
            node.ref_file_ids,
        );
      }
      if (
        node.ref_file_ids &&
        node.ref_file_ids.split(",").some((id) => {
          const key = id.trim();
          return key.startsWith("upload_") && !isPortableUploadId(key);
        }) &&
        typeof window.uploadPendingFiles === "function"
      ) {
        const oldRefIds = node.ref_file_ids;
        nodeLog(
          window.I18n?.t("workflow.uploadingLocalImages") ||
            "Uploading local images to Flow...",
          "info",
        );
        node.ref_file_ids = await window.uploadPendingFiles(node.ref_file_ids);
        if (node.ref_file_ids !== oldRefIds) {
          const oldIdArr = (oldRefIds || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          const newIdArr = (node.ref_file_ids || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          const uploadMapping = window._lastUploadKeyMapping || {};
          for (const field of ["ref_thumbnails", "ref_file_names"]) {
            const current =
              node[field] &&
              typeof node[field] === "object" &&
              !Array.isArray(node[field])
                ? node[field]
                : {};
            const next = {};
            for (const oldId of oldIdArr) {
              const newId =
                uploadMapping[oldId] ||
                (newIdArr.includes(oldId) ? oldId : null);
              if (newId && current[oldId] !== void 0)
                next[newId] = current[oldId];
            }
            for (const [id, value] of Object.entries(current)) {
              if (!oldIdArr.includes(id) && newIdArr.includes(id))
                next[id] = value;
            }
            node[field] = next;
          }
          if (!node.ref_file_names) node.ref_file_names = {};
          for (const newId of newIdArr) {
            if (MediaRegistry.getFileName(newId)) {
              node.ref_file_names[newId] = MediaRegistry.getFileName(newId);
            }
            const freshThumb = MediaRegistry.getThumb(newId);
            if (freshThumb && node.ref_thumbnails) {
              const previous = node.ref_thumbnails[newId];
              node.ref_thumbnails[newId] =
                previous && typeof previous === "object"
                  ? {
                      ...previous,
                      ...(typeof freshThumb === "object"
                        ? freshThumb
                        : { thumbnail: freshThumb }),
                    }
                  : freshThumb;
            }
          }
          window.MediaRegistry?.applyRefIdentityCorrection?.(
            node,
            node.ref_file_ids,
            node.ref_file_ids,
            void 0,
            { surface: "workflow:upload-ready", nodeId: node.node_id },
          );
          for (const oldId of oldIdArr) {
            if (oldId.startsWith("upload_") && uploadMapping[oldId]) {
              delete node.ref_file_names[oldId];
              if (node.ref_thumbnails) delete node.ref_thumbnails[oldId];
            }
          }
          let persistRefIds = node.ref_file_ids;
          let persistRefThumbs = node.ref_thumbnails;
          let persistRefNames = node.ref_file_names;
          if (node._original_ref_state) {
            const origKeySet = new Set(
              (node._original_ref_state.ref_file_ids || "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            );
            for (const nid of newIdArr) origKeySet.add(nid);
            const filteredIds = (node.ref_file_ids || "")
              .split(",")
              .map((s) => s.trim())
              .filter(
                (id) =>
                  origKeySet.has(id) &&
                  !(node._portMergedRefIds && node._portMergedRefIds.has(id)),
              );
            persistRefIds = filteredIds.join(", ");
            persistRefThumbs = {};
            persistRefNames = {};
            for (const fid of filteredIds) {
              if (node.ref_thumbnails?.[fid])
                persistRefThumbs[fid] = node.ref_thumbnails[fid];
              if (node.ref_file_names?.[fid])
                persistRefNames[fid] = node.ref_file_names[fid];
            }
          }
          window.eventBus?.emit("node:ref_replaced", {
            nodeId: node.node_id,
            oldRefIds,
            newRefIds: persistRefIds,
            refFileNames: persistRefNames,
            refThumbnails: persistRefThumbs,
          });
          nodeLog(
            "[Upload] Persisting ref data (filtered) after local file upload",
          );
          try {
            await window.storageManager?.updateNodeStatus(
              this.currentWorkflow.wf_id,
              node.node_id,
              {
                ref_file_ids: persistRefIds,
                ref_thumbnails: persistRefThumbs,
                ref_file_names: persistRefNames,
              },
            );
            if (node._original_ref_state) {
              node._original_ref_state.ref_file_ids = persistRefIds;
              node._original_ref_state.ref_thumbnails = { ...persistRefThumbs };
              node._original_ref_state.ref_file_names = { ...persistRefNames };
              nodeLog(
                "[Upload] Updated _original_ref_state with persisted values",
              );
            }
          } catch (e) {
            log("Failed to persist ref update:", e.message);
          }
        }
      }
      if (
        node.ref_file_ids &&
        node.ref_file_ids.split(",").some((id) => {
          const key = id.trim();
          return key.startsWith("upload_") && !isPortableUploadId(key);
        })
      ) {
        nodeLog(
          "[Upload] Local reference upload incomplete; stopping Generate node",
          "error",
        );
        throw Object.assign(new Error("REF_UPLOAD_FAILED"), {
          code: "REF_UPLOAD_FAILED",
        });
      }
      if (node.media_type === "Video" && node.video_input_type === "Frames") {
        if (!node.frame_1_file_id && node.frame_1_file_name) {
          node.frame_1_file_id = node.frame_1_file_name;
          nodeLog(
            "Smart Clone: reconstructed frame_1_file_id from file_name: " +
              node.frame_1_file_name,
          );
        }
        if (!node.frame_2_file_id && node.frame_2_file_name) {
          node.frame_2_file_id = node.frame_2_file_name;
          nodeLog(
            "Smart Clone: reconstructed frame_2_file_id from file_name: " +
              node.frame_2_file_name,
          );
        }
        if (
          node.frame_1_file_id &&
          node.frame_1_file_id.startsWith("upload_") &&
          typeof window.uploadPendingFiles === "function"
        ) {
          node.frame_1_file_id = await window.uploadPendingFiles(
            node.frame_1_file_id,
          );
        }
        if (
          node.frame_2_file_id &&
          node.frame_2_file_id.startsWith("upload_") &&
          typeof window.uploadPendingFiles === "function"
        ) {
          node.frame_2_file_id = await window.uploadPendingFiles(
            node.frame_2_file_id,
          );
        }
        for (const slot of [1, 2]) {
          const fid = node[`frame_${slot}_file_id`];
          if (
            fid &&
            isPortableUploadId(fid) &&
            typeof window.reuploadMissingFiles === "function"
          ) {
            const thumbUrl = node[`frame_${slot}_thumbnail`];
            if (thumbUrl) {
              const fakeMap = { [fid]: thumbUrl };
              const reuploaded = await window.reuploadMissingFiles(
                fid,
                fakeMap,
                null,
                null,
                { surface: "workflow" },
              );
              if (reuploaded && reuploaded !== fid) {
                nodeLog(`[Frame ${slot}] Import: ${fid} \u2192 ${reuploaded}`);
                node[`frame_${slot}_file_id`] = reuploaded;
                if (typeof MediaRegistry !== "undefined") {
                  if (MediaRegistry.getFileName(reuploaded)) {
                    node[`frame_${slot}_file_name`] =
                      MediaRegistry.getFileName(reuploaded);
                  }
                  if (MediaRegistry.getThumb(reuploaded)) {
                    node[`frame_${slot}_thumbnail`] =
                      MediaRegistry.getThumb(reuploaded);
                  }
                }
              }
            }
          }
          const resolvedFrameId = String(
            node[`frame_${slot}_file_id`] || "",
          ).trim();
          if (resolvedFrameId.startsWith("upload_")) {
            throw Object.assign(new Error(`FRAME_${slot}_UPLOAD_FAILED`), {
              code: "REF_UPLOAD_FAILED",
            });
          }
        }
      }
      const hasImportKeys =
        node.ref_file_ids &&
        node.ref_file_ids
          .split(",")
          .some((id) => isPortableUploadId(id.trim()));
      let importKeysJustUploaded = false;
      if (hasImportKeys && typeof window.reuploadMissingFiles === "function") {
        const importThumbMap = node.ref_thumbnails || {};
        const importInputCount = String(node.ref_file_ids || "")
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean).length;
        nodeLog(
          `[Import] X\u1EED l\xFD ${Object.keys(importThumbMap).length} import keys t\u1EEB CDN...`,
        );
        const _apiUpImp = node._apiUpstreamIds;
        const _impIds = (node.ref_file_ids || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
        const _impDom =
          _apiUpImp && _apiUpImp.size > 0
            ? _impIds.filter((id) => !_apiUpImp.has(id))
            : _impIds;
        let uploadedImport;
        if (_impDom.length === _impIds.length) {
          uploadedImport = await window.reuploadMissingFiles(
            node.ref_file_ids,
            importThumbMap,
            null,
            null,
            { surface: "workflow" },
          );
        } else {
          const _impOut = await window.reuploadMissingFiles(
            _impDom.join(", "),
            importThumbMap,
            null,
            null,
            { surface: "workflow" },
          );
          const _outArr = (_impOut || "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
          const _merged = [];
          if (_outArr.length === _impDom.length) {
            let di = 0;
            for (const id of _impIds)
              _merged.push(_apiUpImp.has(id) ? id : _outArr[di++]);
          } else {
            const _k = new Set([..._outArr, ..._apiUpImp]);
            for (const id of _impIds) if (_k.has(id)) _merged.push(id);
            for (const id of _outArr)
              if (!_merged.includes(id)) _merged.push(id);
          }
          uploadedImport = _merged.join(", ");
        }
        if (uploadedImport !== node.ref_file_ids) {
          nodeLog(
            `[Import] Upload th\xE0nh c\xF4ng: ${uploadedImport.substring(0, 60)}...`,
          );
          node.ref_file_ids = uploadedImport;
          importKeysJustUploaded = true;
          const newIdArr = (uploadedImport || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          if (!node.ref_file_names) node.ref_file_names = {};
          if (!node.ref_thumbnails) node.ref_thumbnails = {};
          const reuploadDetails = window._lastReuploadTileDetails || {};
          for (const [outputIndex, newId] of newIdArr.entries()) {
            const detail = reuploadDetails[newId];
            const sourceInfo =
              newIdArr.length === _impIds.length
                ? importThumbMap[_impIds[outputIndex]]
                : null;
            const isVideoUpload =
              sourceInfo?.type === "video" ||
              !!sourceInfo?.video_url ||
              detail?.type === "video";
            const resolvedFileName =
              detail?.file_name || MediaRegistry.getFileName(newId);
            if (resolvedFileName) {
              node.ref_file_names[newId] = resolvedFileName;
            }
            const resolvedThumb =
              detail?.thumbnailUrl || MediaRegistry.getThumb(newId);
            if (resolvedThumb || isVideoUpload) {
              node.ref_thumbnails[newId] = isVideoUpload
                ? {
                    thumbnail: resolvedThumb || "",
                    type: "video",
                    ...(detail?.display_name && {
                      display_name: detail.display_name,
                    }),
                    ...(detail?.video_url && { video_url: detail.video_url }),
                    ...(resolvedFileName && { file_name: resolvedFileName }),
                  }
                : detail?.display_name
                  ? {
                      thumbnail: resolvedThumb,
                      type: "image",
                      display_name: detail.display_name,
                    }
                  : resolvedThumb;
            }
          }
          for (const key of Object.keys(importThumbMap)) {
            if (isPortableUploadId(key)) {
              delete node.ref_file_names[key];
              delete node.ref_thumbnails[key];
            }
          }
          let persistRefIds = node.ref_file_ids;
          let persistRefThumbs = node.ref_thumbnails;
          let persistRefNames = node.ref_file_names;
          if (node._original_ref_state) {
            const origKeySet = new Set(
              (node._original_ref_state.ref_file_ids || "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            );
            for (const nid of newIdArr) {
              origKeySet.add(nid);
            }
            const filteredIds = (node.ref_file_ids || "")
              .split(",")
              .map((s) => s.trim())
              .filter(
                (id) =>
                  origKeySet.has(id) &&
                  !(node._portMergedRefIds && node._portMergedRefIds.has(id)),
              );
            persistRefIds = filteredIds.join(", ");
            persistRefThumbs = {};
            persistRefNames = {};
            for (const fid of filteredIds) {
              if (node.ref_thumbnails?.[fid])
                persistRefThumbs[fid] = node.ref_thumbnails[fid];
              if (node.ref_file_names?.[fid])
                persistRefNames[fid] = node.ref_file_names[fid];
            }
            nodeLog(
              `[Import] Filtered refs: ${filteredIds.length} original + new IDs (excluded port-merged)`,
            );
          }
          window.eventBus?.emit("node:ref_replaced", {
            nodeId: node.node_id,
            oldRefIds: Object.keys(importThumbMap).join(", "),
            newRefIds: persistRefIds,
            refFileNames: persistRefNames,
            refThumbnails: persistRefThumbs,
          });
          try {
            await window.storageManager?.updateNodeStatus(
              this.currentWorkflow.wf_id,
              node.node_id,
              {
                ref_file_ids: persistRefIds,
                ref_thumbnails: persistRefThumbs,
                ref_file_names: persistRefNames,
              },
            );
            nodeLog(
              "[Import] \u0110\xE3 l\u01B0u ref data (filtered) v\xE0o storage",
            );
            if (node._original_ref_state) {
              node._original_ref_state.ref_file_ids = persistRefIds;
              node._original_ref_state.ref_thumbnails = { ...persistRefThumbs };
              node._original_ref_state.ref_file_names = { ...persistRefNames };
              nodeLog(
                "[Import] Updated _original_ref_state with persisted values",
              );
            }
          } catch (e) {
            log("[Import] Failed to persist ref update:", e.message);
          }
        } else {
          nodeLog(
            "[Import] Kh\xF4ng c\xF3 import key n\xE0o \u0111\u01B0\u1EE3c upload (c\xF3 th\u1EC3 CDN URL \u0111\xE3 h\u1EBFt h\u1EA1n)",
            "warn",
          );
        }
        const importOutputIds = String(node.ref_file_ids || "")
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean);
        if (
          importOutputIds.length !== importInputCount ||
          importOutputIds.some((id) => isPortableUploadId(id))
        ) {
          throw Object.assign(
            new Error(
              `TEMPLATE_REF_UPLOAD_FAILED:${importInputCount - importOutputIds.filter((id) => !isPortableUploadId(id)).length}`,
            ),
            { code: "REF_UPLOAD_FAILED" },
          );
        }
      }
      if (
        node.ref_file_ids &&
        !node.ref_file_ids.includes("upload_") &&
        !importKeysJustUploaded &&
        node.ref_file_names &&
        Object.keys(node.ref_file_names).length > 0
      ) {
        const _ownIdsArr = (node.ref_file_ids || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const _inputEdgesForLink = (workflow2.edges || []).filter(
          (e) => e.target_node_id === node.node_id,
        );
        const _linkReplacements = [];
        const _imageUpstreams = [];
        for (const edge of _inputEdgesForLink) {
          const src = (workflow2.nodes || []).find(
            (n) => n.node_id === edge.source_node_id,
          );
          if (!src || (src.node_type !== "image" && src.type !== "image"))
            continue;
          _imageUpstreams.push(src);
        }
        for (const ownId of _ownIdsArr) {
          for (const src of _imageUpstreams) {
            const srcRefFns = src.ref_file_names || {};
            if (srcRefFns[ownId]) {
              const srcResultIds = (src.result_file_ids || "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              if (srcResultIds.length === 1 && srcResultIds[0] !== ownId) {
                _linkReplacements.push({
                  oldId: ownId,
                  newId: srcResultIds[0],
                  srcName: src.node_name || src.node_id,
                  srcResultFn:
                    (src.result_file_names || {})[srcResultIds[0]] ||
                    (src.ref_file_names || {})[srcResultIds[0]],
                });
              }
              break;
            }
          }
        }
        if (_linkReplacements.length > 0) {
          console.log(
            `[REUPLOAD_AUDIT] Fix F \u2014 ${_linkReplacements.length} content-link replacement(s): ${_linkReplacements.map((r) => `${r.oldId.substring(0, 14)}\u2192${r.newId.substring(0, 14)} (${r.srcName})`).join(", ")}`,
          );
          nodeLog(
            `[Fix F] Replace ${_linkReplacements.length} own refs v\u1EDBi upstream's current IDs`,
          );
          const replaceMap = new Map(
            _linkReplacements.map((r) => [r.oldId, r.newId]),
          );
          const fnMap = new Map(
            _linkReplacements.map((r) => [r.newId, r.srcResultFn]),
          );
          node.ref_file_ids = _ownIdsArr
            .map((id) => replaceMap.get(id) || id)
            .join(", ");
          if (
            node.ref_file_names &&
            typeof node.ref_file_names === "object" &&
            !Array.isArray(node.ref_file_names)
          ) {
            const updatedFns = {};
            for (const [oldId, fn] of Object.entries(node.ref_file_names)) {
              const newId = replaceMap.get(oldId) || oldId;
              const correctFn =
                fnMap.get(newId) || (newId === oldId ? fn : void 0);
              if (correctFn) updatedFns[newId] = correctFn;
            }
            node.ref_file_names = updatedFns;
          }
          if (
            node.ref_thumbnails &&
            typeof node.ref_thumbnails === "object" &&
            !Array.isArray(node.ref_thumbnails)
          ) {
            const updatedThumbs = {};
            for (const [oldId, thumb] of Object.entries(node.ref_thumbnails)) {
              const newId = replaceMap.get(oldId) || oldId;
              let upstreamThumb = thumb;
              for (const src of _imageUpstreams) {
                if (src.result_thumbnails && src.result_thumbnails[newId]) {
                  upstreamThumb = src.result_thumbnails[newId];
                  break;
                }
              }
              updatedThumbs[newId] = upstreamThumb;
            }
            node.ref_thumbnails = updatedThumbs;
          }
        }
      }
      const _ownCorrectionIds = String(node.ref_file_ids || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      const _allRefsAcceptedByV2 =
        _ownCorrectionIds.length > 0 &&
        node._flowV2RefsWithoutBoard === true &&
        _ownCorrectionIds.every((id) => node._apiUpstreamIds?.has(id));
      if (_allRefsAcceptedByV2) {
        nodeLog(
          `[T\u1EA7ng 1-5] Flow API V2 \u0111\xE3 accept ${_ownCorrectionIds.length} UUID ref \u2192 b\u1ECF board correction/reupload`,
        );
      }
      if (
        node.ref_file_ids &&
        !node.ref_file_ids.includes("upload_") &&
        !importKeysJustUploaded &&
        !_allRefsAcceptedByV2
      ) {
        try {
          if (
            !node._flowTilesPreparedForRefCheck &&
            window.MessageBridge?.sendToContentScript
          ) {
            console.log(
              `[REUPLOAD_AUDIT] Fix 4 (D2) \u2014 sendToContentScript('ensureFlowTilesLoaded') TR\u01AF\u1EDAC own ref check`,
            );
            const _prep = await window.MessageBridge.sendToContentScript(
              "ensureFlowTilesLoaded",
              {
                purpose: "identity",
                targetFileNames: Object.values(
                  node.ref_file_names || {},
                ).filter(Boolean),
              },
            );
            if (_prep?.success !== false)
              node._flowTilesPreparedForRefCheck = true;
          } else if (node._flowTilesPreparedForRefCheck) {
            console.log(
              "[REUPLOAD_AUDIT] Own ref blanket scan skipped \u2014 node \u0111\xE3 prepare \u1EDF upstream pass",
            );
          }
        } catch (e) {
          nodeLog(
            `[Tile Load] ensureFlowTilesLoaded failed: ${e.message}`,
            "warn",
          );
        }
        const originalNodeRefIds = node.ref_file_ids;
        let refCorrectionChanged = false;
        const thumbMap = {
          ...(node.ref_thumbnails || {}),
          ...(node.result_thumbnails || {}),
        };
        const fnMap = {
          ...(node.ref_file_names || {}),
          ...(node.result_file_names || {}),
        };
        if (
          typeof window.correctFileIds === "function" &&
          (Object.keys(thumbMap).length > 0 || Object.keys(fnMap).length > 0)
        ) {
          nodeLog(
            `[T\u1EA7ng 1-3] Ki\u1EC3m tra ref IDs: ${node.ref_file_ids.substring(0, 60)}...`,
          );
          const { correctedIds, changed, mediaMetadata } =
            await window.correctFileIds(node.ref_file_ids, thumbMap, fnMap);
          window.MediaRegistry?.applyRefIdentityCorrection?.(
            node,
            node.ref_file_ids,
            node.ref_file_ids,
            mediaMetadata,
            { surface: "workflow:flow-gen", nodeId: node.node_id },
          );
          if (changed) {
            nodeLog(
              `[T\u1EA7ng 1-4] Ref IDs \u0111\xE3 correct: ${correctedIds.substring(0, 60)}...`,
            );
            const _oldRefArr = (node.ref_file_ids || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            node.ref_file_ids = correctedIds;
            refCorrectionChanged = true;
            try {
              const _newRefArr = (correctedIds || "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              if (_oldRefArr.length === _newRefArr.length) {
                const _remap = (obj) => {
                  if (!obj || typeof obj !== "object" || Array.isArray(obj))
                    return null;
                  const moved = new Map();
                  for (let i = 0; i < _oldRefArr.length; i++) {
                    const from = _oldRefArr[i],
                      to = _newRefArr[i];
                    if (!to || from === to || obj[from] === void 0) continue;
                    moved.set(from, to);
                  }
                  if (moved.size === 0) return null;
                  const out = {};
                  for (const [k, v] of Object.entries(obj)) {
                    if (!moved.has(k)) out[k] = v;
                  }
                  for (const [from, to] of moved) out[to] = obj[from];
                  return out;
                };
                const _names = _remap(node.ref_file_names);
                if (_names) node.ref_file_names = _names;
                const _thumbs = _remap(node.ref_thumbnails);
                if (_thumbs) node.ref_thumbnails = _thumbs;
                if (_names || _thumbs) {
                  nodeLog(
                    "[T\u1EA7ng 1-4] \u0110\xE3 \u0111\u1ED5i kho\xE1 ref_file_names/ref_thumbnails theo id m\u1EDBi",
                  );
                }
              } else {
                nodeLog(
                  `[T\u1EA7ng 1-4] S\u1ED1 ref tr\u01B0\u1EDBc/sau l\u1EC7ch (${_oldRefArr.length}\u2192${_newRefArr.length}) \u2192 gi\u1EEF nguy\xEAn kho\xE1`,
                  "warn",
                );
              }
            } catch (e) {
              console.warn(
                "[WorkflowExecutor] re-key ref maps l\u1ED7i (b\u1ECF qua):",
                e?.message || e,
              );
            }
          } else {
            nodeLog("[T\u1EA7ng 1-3] Ref IDs v\u1EABn h\u1EE3p l\u1EC7");
          }
        }
        if (typeof window.reuploadMissingFiles === "function") {
          const beforeRef = (node.ref_file_ids || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          const refThumbMap = {
            ...(node.ref_thumbnails || {}),
            ...(node.result_thumbnails || {}),
          };
          const refFileNamesMap = {
            ...(node.ref_file_names || {}),
            ...(node.result_file_names || {}),
          };
          nodeLog(
            `[REUPLOAD_AUDIT] >>> T\u1EA7ng 5 FIRE \u2014 node: ${node.title || node.node_id}, type: ${node.node_type}`,
            "warn",
          );
          nodeLog(
            `[T\u1EA7ng 5] Checking refs: ${node.ref_file_ids.substring(0, 60)}`,
          );
          nodeLog(
            `[T\u1EA7ng 5] file_names map: ${JSON.stringify(refFileNamesMap)}`,
          );
          nodeLog(
            `[T\u1EA7ng 5] thumb map keys: ${Object.keys(refThumbMap)
              .map((k) => k.substring(0, 18))
              .join(", ")}`,
          );
          const _needsUploadHint = beforeRef.some(
            (id) => id.startsWith("upload_") || isPortableUploadId(id),
          );
          if (_needsUploadHint) emitNodePhase(node.node_id, "uploading");
          const _apiUp = node._apiUpstreamIds;
          const _originalOwnIds = String(
            node._original_ref_state?.ref_file_ids || "",
          )
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
          const _allRefsArePortMerged =
            !!node._original_ref_state &&
            _originalOwnIds.length === 0 &&
            (node._portMergedRefIds?.size || 0) > 0;
          const _domRef = _allRefsArePortMerged
            ? []
            : _apiUp && _apiUp.size > 0
              ? beforeRef.filter((id) => !_apiUp.has(id))
              : beforeRef;
          const _skippedApi = beforeRef.length - _domRef.length;
          if (_skippedApi > 0) {
            nodeLog(
              `[T\u1EA7ng 5] B\u1ECF qua ${_skippedApi} ref API ho\u1EB7c pure port-merged \u0111\xE3 x\u1EED l\xFD, ch\u1EC9 \u0111\u1ED1i chi\u1EBFu ${_domRef.length} own ref`,
            );
          }
          let updated;
          if (_domRef.length === 0) {
            updated = node.ref_file_ids;
          } else {
            const _chainOut = await window.reuploadMissingFiles(
              _domRef.join(", "),
              refThumbMap,
              originalNodeRefIds,
              refFileNamesMap,
              { surface: "workflow" },
            );
            if (_skippedApi === 0) {
              updated = _chainOut;
            } else {
              const _out = (_chainOut || "")
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean);
              const _ordered = [];
              if (_out.length === _domRef.length) {
                let di = 0;
                for (const id of beforeRef)
                  _ordered.push(_apiUp.has(id) ? id : _out[di++]);
              } else {
                const _keep = new Set([..._out, ...(_apiUp || [])]);
                for (const id of beforeRef)
                  if (_keep.has(id)) _ordered.push(id);
                for (const id of _out)
                  if (!_ordered.includes(id)) _ordered.push(id);
              }
              updated = _ordered.join(", ");
            }
          }
          if (!_sameFileIdList(updated, node.ref_file_ids)) {
            nodeLog(
              `[REUPLOAD_AUDIT] !!! REUPLOAD HAPPENED \u2014 before: ${node.ref_file_ids.substring(0, 60)} \u2192 after: ${updated.substring(0, 60)}`,
              "warn",
            );
            nodeLog(
              `[T\u1EA7ng 5] Re-upload ref images: ${updated.substring(0, 60)}...`,
            );
            const oldIdArr = (node.ref_file_ids || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            const newIdArr = (updated || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            node.ref_file_ids = updated;
            refCorrectionChanged = true;
            if (!node.ref_file_names) node.ref_file_names = {};
            if (!node.ref_thumbnails) node.ref_thumbnails = {};
            const newIdSet = new Set(newIdArr);
            const oldIdSet = new Set(oldIdArr);
            const replacedOldIds = oldIdArr.filter((id) => !newIdSet.has(id));
            const newlyAddedIds = newIdArr.filter((id) => !oldIdSet.has(id));
            if (replacedOldIds.length === newlyAddedIds.length) {
              for (let i = 0; i < replacedOldIds.length; i++) {
                const oldId = replacedOldIds[i];
                const newId = newlyAddedIds[i];
                const newFileName = MediaRegistry.getFileName(newId);
                const newThumb = MediaRegistry.getThumb(newId);
                if (newFileName) {
                  node.ref_file_names[newId] = newFileName;
                } else if (node.ref_file_names[oldId]) {
                  node.ref_file_names[newId] = node.ref_file_names[oldId];
                }
                if (newThumb) {
                  node.ref_thumbnails[newId] = newThumb;
                } else if (node.ref_thumbnails[oldId]) {
                  node.ref_thumbnails[newId] = node.ref_thumbnails[oldId];
                }
                delete node.ref_file_names[oldId];
                delete node.ref_thumbnails[oldId];
                nodeLog(
                  `[T\u1EA7ng 5] Transferred metadata: ${oldId.substring(0, 20)} \u2192 ${newId.substring(0, 20)}`,
                );
              }
            } else {
              nodeLog(
                `[T\u1EA7ng 5] WARN: ID count mismatch - replaced=${replacedOldIds.length}, new=${newlyAddedIds.length}`,
                "warn",
              );
              for (const newId of newlyAddedIds) {
                const newFileName = MediaRegistry.getFileName(newId);
                const newThumb = MediaRegistry.getThumb(newId);
                if (newFileName) node.ref_file_names[newId] = newFileName;
                if (newThumb) node.ref_thumbnails[newId] = newThumb;
              }
            }
            for (const key of Object.keys(node.ref_file_names)) {
              if (!newIdSet.has(key)) {
                delete node.ref_file_names[key];
              }
            }
            for (const key of Object.keys(node.ref_thumbnails)) {
              if (!newIdSet.has(key)) {
                delete node.ref_thumbnails[key];
              }
            }
            nodeLog(
              `[T\u1EA7ng 5] Updated ref_file_names/thumbnails with new keys`,
            );
          } else {
            nodeLog(
              `[REUPLOAD_AUDIT] T\u1EA7ng 5 NO-CHANGE \u2014 refs v\u1EABn nguy\xEAn ${beforeRef.length} IDs (file_name match ho\u1EB7c tile t\u1ED3n t\u1EA1i)`,
            );
          }
          const afterRef = (updated || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          const droppedRef = beforeRef.length - afterRef.length;
          if (droppedRef > 0) {
            nodeLog(
              `[Node ${node.node_name || node.node_id}] ${droppedRef} \u1EA3nh tham chi\u1EBFu kh\xF4ng t\xECm th\u1EA5y, \u0111\xE3 b\u1ECB b\u1ECF qua`,
              "warn",
            );
            if (afterRef.length === 0 && beforeRef.length > 0) {
              nodeLog(
                `[Node ${node.node_name || node.node_id}] T\u1EA5t c\u1EA3 \u1EA3nh tham chi\u1EBFu \u0111\xE3 m\u1EA5t. Node ch\u1EA1y kh\xF4ng c\xF3 ref.`,
                "error",
              );
            }
          }
        }
        if (refCorrectionChanged) {
          nodeLog("[T\u1EA7ng 1-5] Persisting corrected ref data to storage");
          try {
            await window.storageManager?.updateNodeStatus(
              this.currentWorkflow.wf_id,
              node.node_id,
              {
                ref_file_ids: node.ref_file_ids,
                ref_thumbnails: node.ref_thumbnails,
                ref_file_names: node.ref_file_names,
              },
            );
            if (node._original_ref_state) {
              node._original_ref_state.ref_file_ids = node.ref_file_ids;
              node._original_ref_state.ref_thumbnails = {
                ...node.ref_thumbnails,
              };
              node._original_ref_state.ref_file_names = {
                ...node.ref_file_names,
              };
              nodeLog(
                "[T\u1EA7ng 1-5] Updated _original_ref_state with persisted values",
              );
            }
          } catch (e) {
            log("Failed to persist ref update:", e.message);
          }
          if (
            node._mentionRefSources &&
            Object.keys(node._mentionRefSources).length > 0
          ) {
            const beforeArr = (originalNodeRefIds || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            const afterArr = (node.ref_file_ids || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            const sourceUpdates = {};
            const _apiUpM = node._apiUpstreamIds;
            const _canPairByIndex = beforeArr.length === afterArr.length;
            for (let i = 0; _canPairByIndex && i < beforeArr.length; i++) {
              const oldId = beforeArr[i];
              const newId = afterArr[i];
              if (oldId === newId) continue;
              if (_apiUpM && (_apiUpM.has(oldId) || _apiUpM.has(newId)))
                continue;
              const source = node._mentionRefSources[oldId];
              if (!source || source.sourceNodeType !== "image") continue;
              if (!sourceUpdates[source.sourceSlug]) {
                sourceUpdates[source.sourceSlug] = {
                  oldIds: [],
                  newIds: [],
                  thumbnails: {},
                  fileNames: {},
                };
              }
              sourceUpdates[source.sourceSlug].oldIds.push(oldId);
              sourceUpdates[source.sourceSlug].newIds.push(newId);
              if (node.ref_thumbnails?.[newId]) {
                sourceUpdates[source.sourceSlug].thumbnails[newId] =
                  node.ref_thumbnails[newId];
              }
              if (node.ref_file_names?.[newId]) {
                sourceUpdates[source.sourceSlug].fileNames[newId] =
                  node.ref_file_names[newId];
              }
            }
            for (const [slug, updates] of Object.entries(sourceUpdates)) {
              const sourceNode = workflow2.nodes.find((n) => n.slug === slug);
              if (!sourceNode || sourceNode.node_type !== "image") continue;
              nodeLog(
                `[Bug 47] Updating source image node "${slug}" with reuploaded IDs`,
              );
              let srcIds = (sourceNode.ref_file_ids || "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              for (let i = 0; i < updates.oldIds.length; i++) {
                const idx = srcIds.indexOf(updates.oldIds[i]);
                if (idx !== -1) {
                  srcIds[idx] = updates.newIds[i];
                }
              }
              sourceNode.ref_file_ids = srcIds.join(", ");
              if (!sourceNode.ref_thumbnails) sourceNode.ref_thumbnails = {};
              if (!sourceNode.ref_file_names) sourceNode.ref_file_names = {};
              for (const [newId, thumb] of Object.entries(updates.thumbnails)) {
                sourceNode.ref_thumbnails[newId] = thumb;
              }
              for (const [newId, fn] of Object.entries(updates.fileNames)) {
                sourceNode.ref_file_names[newId] = fn;
              }
              for (const oldId of updates.oldIds) {
                delete sourceNode.ref_thumbnails[oldId];
                delete sourceNode.ref_file_names[oldId];
              }
              try {
                await window.storageManager?.updateNodeStatus(
                  this.currentWorkflow.wf_id,
                  sourceNode.node_id,
                  {
                    ref_file_ids: sourceNode.ref_file_ids,
                    ref_thumbnails: sourceNode.ref_thumbnails,
                    ref_file_names: sourceNode.ref_file_names,
                  },
                );
                nodeLog(
                  `[Bug 47] Source node "${slug}" persisted: ${sourceNode.ref_file_ids}`,
                );
                window.eventBus?.emit("node:ref_replaced", {
                  nodeId: sourceNode.node_id,
                  oldRefIds: updates.oldIds.join(", "),
                  newRefIds: updates.newIds.join(", "),
                  refFileNames: sourceNode.ref_file_names,
                  refThumbnails: sourceNode.ref_thumbnails,
                });
              } catch (e) {
                nodeLog(
                  `[Bug 47] Failed to persist source node "${slug}": ${e.message}`,
                  "error",
                );
              }
            }
          }
        }
      }
      const rawInputFileIds =
        node.ref_mode === "mention" &&
        !(node.media_type === "Video" && node.video_input_type === "Frames")
          ? String(node.ref_file_ids || "")
              .split(",")
              .map((id) => id.trim())
              .filter(Boolean)
          : this._collectInputFileIds(node, workflow2.nodes, workflow2.edges);
      const isFramesResult =
        !Array.isArray(rawInputFileIds) && rawInputFileIds?.frame1 !== void 0;
      if (
        isFramesResult &&
        node.frame_ref_mode &&
        rawInputFileIds.frame2 &&
        !rawInputFileIds.frame1
      ) {
        throw Object.assign(new Error("REF_UPLOAD_FAILED"), {
          code: "REF_UPLOAD_FAILED",
        });
      }
      let inputFileIds = isFramesResult
        ? [rawInputFileIds.frame1, rawInputFileIds.frame2].filter(Boolean)
        : Array.isArray(rawInputFileIds)
          ? rawInputFileIds
          : [];
      nodeLog(
        `[T\u1EA7ng 1] Input file IDs: ${inputFileIds.length} \u1EA3nh \u2014 ${inputFileIds.map((id) => id.substring(0, 20)).join(", ")}`,
      );
      console.log(
        `[DEBUG_REF] Node "${node.node_name}" (${node.node_type}, ${node.media_type || "Image"}):`,
        {
          upstreamRaw: rawInputFileIds,
          inputFileIds,
          nodeOwnRefIds: node.ref_file_ids,
          upstreamResultFromImageGen: workflow2.edges
            .filter((e) => e.target_node_id === node.node_id)
            .map((e) => {
              const src = workflow2.nodes.find(
                (n) => n.node_id === e.source_node_id,
              );
              return {
                srcNodeName: src?.node_name,
                srcType: src?.node_type,
                srcResultIds: src?.result_file_ids,
                tgtPort: e.target_port,
              };
            }),
        },
      );
      const isVideoIngredients =
        node.media_type === "Video" && node.video_input_type !== "Frames";
      if (!isFramesResult) {
        const flowAdapter = window.ProviderRegistry?.get?.("flow");
        const imageCap = flowAdapter?.getMaxRefImages?.({
          mode: isVideoIngredients ? "video" : "image",
          isFrames: false,
          modelValue: node.model,
        });
        const totalCap = flowAdapter?.getMaxRefImagesTotal?.(node.model);
        const refLimit = Math.min(
          ...[imageCap, totalCap].filter(
            (value) => Number.isInteger(value) && value >= 0,
          ),
        );
        if (Array.isArray(inputFileIds) && inputFileIds.length > refLimit) {
          const dropped = inputFileIds.length - refLimit;
          nodeLog(
            `Model gi\u1EDBi h\u1EA1n ${refLimit} ref \u2014 b\u1ECF qua ${dropped} ref th\u1EEBa (\u01B0u ti\xEAn \u1EA3nh t\u1EEB port edge)`,
            "warn",
          );
          inputFileIds = inputFileIds.slice(0, refLimit);
        }
      }
      const syntheticIdPattern = /^(chatgpt_|grok_|grok_video_|gemini_)/;
      const originalInputCount = inputFileIds.length;
      inputFileIds = inputFileIds.filter((id) => !syntheticIdPattern.test(id));
      if (sharedFlowFrames && inputFileIds.length !== originalInputCount) {
        throw Object.assign(new Error("REF_UPLOAD_FAILED"), {
          code: "REF_UPLOAD_FAILED",
        });
      }
      if (inputFileIds.length < originalInputCount) {
        const droppedSynthetic = originalInputCount - inputFileIds.length;
        nodeLog(
          `Lo\u1EA1i b\u1ECF ${droppedSynthetic} synthetic ID t\u1EEB upstream (chatgpt/grok bridge timeout)`,
          "warn",
        );
      }
      if (inputFileIds.length > 0) {
        const _flowAdapter = window.ProviderRegistry?.get?.("flow");
        if (_flowAdapter?.supportsRefImages) {
          const _isVidStrip = node.media_type === "Video";
          const _inputTypeStrip = _isVidStrip
            ? node.video_input_type || "Ingredients"
            : void 0;
          const _durationStrip = _isVidStrip
            ? node.video_duration || void 0
            : void 0;
          if (
            !_flowAdapter.supportsRefImages(node.model, {
              inputType: _inputTypeStrip,
              duration: _durationStrip,
            })
          ) {
            const _ctxStr = _inputTypeStrip
              ? ` (${_inputTypeStrip}${_durationStrip ? ", " + _durationStrip : ""})`
              : "";
            nodeLog(
              `[Model Constraint] Model "${node.model}"${_ctxStr} KH\xD4NG h\u1ED7 tr\u1EE3 ref images \u2014 b\u1ECF qua ${inputFileIds.length} ref (upstream + node pick)`,
              "warn",
            );
            inputFileIds = [];
          }
        }
      }
      const fnLookup = this._buildFileNameLookup(node, workflow2);
      if (sharedFlowFrames) {
        for (const slot of [1, 2]) {
          const id = node[`frame_${slot}_file_id`],
            name = node[`frame_${slot}_file_name`];
          if (id && name) fnLookup[id] = name;
        }
      }
      const pqExists = !!window.PromptQueue;
      const pqEnabled = pqExists && PromptQueue.isEnabled();
      console.log(
        `[WorkflowExecutor] >>> NODE GENERATE DISPATCH \u2014 Pipeline Check: exists=${pqExists}, enabled=${pqEnabled}, settings.queueEnabled=${window.storageSettings?.getSettings?.()?.queueEnabled}`,
      );
      console.log(
        `[WorkflowExecutor] >>> Will use ${pqExists && pqEnabled ? "PIPELINE (PromptQueue)" : "DIRECT (applySettings \u2192 ... \u2192 _waitForNewTiles)"} path`,
      );
      nodeLog(
        `[Pipeline Check] PromptQueue exists: ${pqExists}, isEnabled: ${pqEnabled}, settings.queueEnabled: ${window.storageSettings?.getSettings?.()?.queueEnabled}`,
      );
      if (pqExists && pqEnabled) {
        const pq = PromptQueue.getInstance();
        const gd2 = await this._getGenDefaultsForNode(node);
        const isVid2 = (node.media_type || gd2.genType) === "Video";
        const nodeRefIds = node.ref_file_ids
          ? (node.ref_file_ids || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
        const _fnMap = new Map();
        if (node.ref_file_names) {
          for (const [id, fn] of Object.entries(node.ref_file_names))
            if (fn) _fnMap.set(id, fn);
        }
        for (const e of (workflow2.edges || []).filter(
          (e2) => e2.target_node_id === node.node_id,
        )) {
          const src = workflow2.nodes.find(
            (n) => n.node_id === e.source_node_id,
          );
          if (src?.result_file_names) {
            for (const [id, fn] of Object.entries(src.result_file_names))
              if (fn) _fnMap.set(id, fn);
          }
          if (src?.ref_file_names) {
            for (const [id, fn] of Object.entries(src.ref_file_names))
              if (fn) _fnMap.set(id, fn);
          }
          const _ct = this._isCleanRefsFresh(src)
            ? src?.result_clean_thumbnails
            : null;
          if (_ct && typeof _ct === "object" && !Array.isArray(_ct)) {
            for (const [id, ent] of Object.entries(_ct)) {
              if (ent && typeof ent === "object" && ent.file_name)
                _fnMap.set(id, ent.file_name);
            }
          }
        }
        const _seenFn = new Set();
        const _seenId = new Set();
        const combinedRefIds = [];
        const _dropLog = [];
        for (const id of [...inputFileIds, ...nodeRefIds]) {
          if (!sharedFlowFrames && _seenId.has(id)) {
            _dropLog.push(`${id.substring(0, 14)}(id-dup)`);
            continue;
          }
          _seenId.add(id);
          const fn = _fnMap.get(id);
          if (fn) {
            if (!sharedFlowFrames && _seenFn.has(fn)) {
              _dropLog.push(
                `${id.substring(0, 14)}(fn-dup:${fn.substring(0, 8)})`,
              );
              continue;
            }
            _seenFn.add(fn);
          }
          combinedRefIds.push(id);
        }
        console.log(
          `[REUPLOAD_AUDIT] DEDUP \u2014 inputFileIds: ${inputFileIds.length}, nodeRefIds: ${nodeRefIds.length}, _fnMap size: ${_fnMap.size}`,
        );
        console.log(
          `[REUPLOAD_AUDIT] DEDUP \u2014 _fnMap entries: ${JSON.stringify([..._fnMap.entries()].map(([k, v]) => `${k.substring(0, 14)}\u2192${v?.substring(0, 8)}`))}`,
        );
        console.log(
          `[REUPLOAD_AUDIT] DEDUP \u2014 inputFileIds: ${JSON.stringify(inputFileIds.map((id) => id.substring(0, 14)))}`,
        );
        console.log(
          `[REUPLOAD_AUDIT] DEDUP \u2014 nodeRefIds: ${JSON.stringify(nodeRefIds.map((id) => id.substring(0, 14)))}`,
        );
        console.log(
          `[REUPLOAD_AUDIT] DEDUP \u2014 combinedRefIds: ${combinedRefIds.length}, dropped: ${_dropLog.length} [${_dropLog.join(", ")}]`,
        );
        const isVideoIngredientsPq =
          node.media_type === "Video" && node.video_input_type !== "Frames";
        const flowAdapterPq = window.ProviderRegistry?.get?.("flow");
        const imageCapPq = flowAdapterPq?.getMaxRefImages?.({
          mode: isVideoIngredientsPq ? "video" : "image",
          isFrames: false,
          modelValue: node.model,
        });
        const totalCapPq = flowAdapterPq?.getMaxRefImagesTotal?.(node.model);
        const refLimitPq = Math.min(
          ...[
            sharedFlowFrames
              ? flowAdapterPq?.getMaxRefImages?.({
                  mode: "video",
                  isFrames: true,
                  modelValue: node.model,
                })
              : imageCapPq,
            totalCapPq,
          ].filter((value) => Number.isInteger(value) && value >= 0),
        );
        let cappedRefIds = combinedRefIds;
        if (combinedRefIds.length > refLimitPq) {
          cappedRefIds = combinedRefIds.slice(0, refLimitPq);
          const dropped = combinedRefIds.length - cappedRefIds.length;
          if (dropped > 0) {
            nodeLog(
              `Model gi\u1EDBi h\u1EA1n ${refLimitPq} ref \u2014 b\u1ECF qua ${dropped} ref th\u1EEBa (\u01B0u ti\xEAn gi\u1EEF \u1EA3nh t\u1EEB port edge)`,
              "warn",
            );
          }
        }
        const syntheticPattern = /^(chatgpt_|grok_|grok_video_|gemini_)/;
        const validFlowRefIds = cappedRefIds.filter(
          (id) => !syntheticPattern.test(id),
        );
        if (validFlowRefIds.length < cappedRefIds.length) {
          const droppedSynthetic = cappedRefIds.length - validFlowRefIds.length;
          nodeLog(
            `Lo\u1EA1i b\u1ECF ${droppedSynthetic} synthetic ID (chatgpt/grok bridge timeout) \u2014 kh\xF4ng c\xF3 tile tr\xEAn Flow DOM`,
            "warn",
          );
        }
        cappedRefIds = validFlowRefIds;
        if (cappedRefIds.length > 0 && flowAdapterPq?.supportsRefImages) {
          const _pipeInputType = isVid2
            ? node.video_input_type || "Ingredients"
            : void 0;
          const _pipeDuration = isVid2 ? node.video_duration || void 0 : void 0;
          if (
            !flowAdapterPq.supportsRefImages(node.model, {
              inputType: _pipeInputType,
              duration: _pipeDuration,
            })
          ) {
            const _ctxStr = _pipeInputType
              ? ` (${_pipeInputType}${_pipeDuration ? ", " + _pipeDuration : ""})`
              : "";
            nodeLog(
              `[Model Constraint] Model "${node.model}"${_ctxStr} KH\xD4NG h\u1ED7 tr\u1EE3 ref images \u2014 b\u1ECF qua ${cappedRefIds.length} ref (pipeline)`,
              "warn",
            );
            cappedRefIds = [];
          }
        }
        const videoEdgeIds = new Set(
          this._collectPortInputs(
            node,
            "video_ref",
            workflow2.nodes,
            (workflow2.edges || []).filter(
              (edge) =>
                edge.target_node_id === node.node_id &&
                edge.target_port === "video_ref",
            ),
          ),
        );
        const _pipeRefVideoIds = cappedRefIds.filter((id) => {
          if (videoEdgeIds.has(id)) return true;
          const tc = getThumbCache()?.get(id);
          if (tc?.type === "video") return true;
          const rt = node.ref_thumbnails?.[id];
          if (rt && typeof rt === "object" && rt.type === "video") return true;
          for (const srcN of workflow2?.nodes || []) {
            const srt = srcN?.ref_thumbnails?.[id];
            if (
              srt &&
              typeof srt === "object" &&
              (srt.type === "video" || srt.video_url)
            )
              return true;
            const srr = srcN?.result_thumbnails?.[id];
            if (
              srr &&
              typeof srr === "object" &&
              (srr.type === "video" || srr.video_url)
            )
              return true;
          }
          return false;
        });
        console.log(
          "[FlowApiRefRouting]",
          JSON.stringify({
            nodeId: node.node_id,
            model: node.model,
            refCount: cappedRefIds.length,
            videoRefCount: _pipeRefVideoIds.length,
            videoPortCount: videoEdgeIds.size,
            quantity,
          }),
        );
        const pipelineRefNames = {
          ...(node.ref_file_names || {}),
          ...(sharedFlowFrames ? fnLookup : {}),
        };
        const pipelineRefThumbnails = { ...(node.ref_thumbnails || {}) };
        for (const srcNode of workflow2.nodes || []) {
          if (
            srcNode?.result_file_names &&
            typeof srcNode.result_file_names === "object"
          ) {
            Object.assign(pipelineRefNames, srcNode.result_file_names);
          }
        }
        for (const e of (workflow2.edges || []).filter(
          (e2) => e2.target_node_id === node.node_id,
        )) {
          const src = (workflow2.nodes || []).find(
            (n) => n.node_id === e.source_node_id,
          );
          if (src?.ref_file_names && typeof src.ref_file_names === "object") {
            Object.assign(pipelineRefNames, src.ref_file_names);
          }
          if (
            src?.result_thumbnails &&
            typeof src.result_thumbnails === "object"
          ) {
            Object.assign(pipelineRefThumbnails, src.result_thumbnails);
          }
          if (src?.ref_thumbnails && typeof src.ref_thumbnails === "object") {
            Object.assign(pipelineRefThumbnails, src.ref_thumbnails);
          }
          const _ct = this._isCleanRefsFresh(src)
            ? src?.result_clean_thumbnails
            : null;
          if (_ct && typeof _ct === "object" && !Array.isArray(_ct)) {
            for (const [fid, ent] of Object.entries(_ct)) {
              if (ent && typeof ent === "object" && ent.file_name)
                pipelineRefNames[fid] = ent.file_name;
            }
          }
        }
        for (const srcNode of workflow2.nodes || []) {
          for (const map of [
            srcNode?.result_thumbnails,
            srcNode?.ref_thumbnails,
            srcNode?.result_provider_urls,
          ]) {
            if (!map || typeof map !== "object" || Array.isArray(map)) continue;
            for (const [fid, entry] of Object.entries(map)) {
              if (entry && typeof entry === "object" && entry.media_uuid) {
                pipelineRefNames[fid] = entry.media_uuid;
              }
            }
          }
        }
        try {
          const isUuid = (v) =>
            typeof v === "string" &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              v.trim(),
            );
          const _apiIntended =
            window.FlowApiAdapter?.isApiModeIntended?.({
              forWorkflow: true,
            }) === true;
          if (_apiIntended) {
            const refContext = { refFileNames: { ...pipelineRefNames } };
            for (const id of cappedRefIds) {
              const uuid = window.FlowApiAdapter?._resolveRefUuid?.(
                refContext,
                id,
              );
              if (isUuid(uuid)) pipelineRefNames[id] = uuid;
            }
          }
          const missing = !_apiIntended
            ? []
            : cappedRefIds.filter(
                (id) => !isUuid(pipelineRefNames[id]) && !isUuid(id),
              );
          if (missing.length && window.MessageBridge?.sendToContentScript) {
            let filled = 0;
            for (const id of missing) {
              try {
                const r = await window.MessageBridge.sendToContentScript(
                  "extractTileIdentifiers",
                  { tileId: id },
                );
                if (isUuid(r?.fileName)) {
                  pipelineRefNames[id] = r.fileName;
                  filled++;
                }
              } catch (e) {
                console.warn(
                  "[WorkflowExecutor] h\u1ECFi UUID t\u1EEB b\u1EA3ng Flow th\u1EA5t b\u1EA1i \u2192 d\u1EEBng l\u1EA5p:",
                  e?.message || e,
                );
                break;
              }
            }
            nodeLog(
              `[Ref UUID] thi\u1EBFu ${missing.length} \u2192 l\u1EA5p \u0111\u01B0\u1EE3c ${filled} t\u1EEB b\u1EA3ng Flow`,
              filled === missing.length ? "info" : "warn",
            );
          }
        } catch (e) {
          console.warn(
            "[WorkflowExecutor] l\u1EA5p UUID ref l\u1ED7i (b\u1ECF qua):",
            e?.message || e,
          );
        }
        emitNodePhase(node.node_id, "generating");
        if (!this._flowWebRecoveryPolicy) {
          await window.ExecutionConfig?.getConfig?.();
          if (!this._flowWebRecoveryPolicy)
            this._flowWebRecoveryPolicy = {
              enabled:
                window.ExecutionConfig?._cache?.parallel?.web_resubmit_enabled,
              max: window.ExecutionConfig?.getWorkflowConfig?.().max_retries,
            };
        }
        if (this.shouldStop)
          throw new Error("WORKFLOW_STOPPED_BEFORE_QUEUE_ADMISSION");
        if (executionMeta?.flowSubmitGate) {
          await executionMeta.flowSubmitGate.wait(
            executionMeta.flowSubmitOrder,
          );
        }
        this._assertWorkflowNotStopped();
        const pipelineResult = await pq.submitJob({
          abortSignal: this._flowAdmissionAbortController?.signal,
          onWorkflowItemAdmitted: () => {
            executionMeta?.flowSubmitGate?.release(
              executionMeta.flowSubmitOrder,
              "queue_admitted",
            );
          },
          onBeforeWorkflowItemStart: this._singleNodeSessionWorker
            ? () => this._startSingleNodeGeneration(node)
            : null,
          onRefReuploaded: (replacement) =>
            this._recordWebRefReupload(replacement),
          onResultsReady: (result) => {
            if (this.shouldStop || !result.fileIds?.length) return;
            node.result_file_ids = result.fileIds.join(",");
            node.result_thumbnails = { ...result.thumbnails };
            node.result_file_names = { ...result.fileNames };
            node.result_provider_urls = { ...result.providerUrls };
            if (result.genMode) node.result_gen_mode = result.genMode;
            window.eventBus?.emit("node:preview_available", { node, result });
          },
          onGenerationComplete: (result) => {
            if (this.shouldStop || !result.fileIds?.length) return;
            window.eventBus?.emit("node:generation_ready", { node, result });
          },
          webRecoveryPolicy: this._flowWebRecoveryPolicy,
          owner: "workflow",
          phaseRNodeId: node.node_id,
          workflowId: this.currentWorkflow?.wf_id,
          workflowRunId: this._flowRunId,
          singleNodeSession: !!this._singleNodeSessionWorker,
          phaseRContext: {
            workflowId: this.currentWorkflow?.wf_id || null,
            workflowName: this.currentWorkflow?.wf_name || null,
            nodeId: node.node_id,
            nodeName: node.node_name || null,
            serverStep: node._serverStep || null,
          },
          label: `Node: ${node.node_name || "Generate"}`,
          prompts: [node.prompt || ""],
          settings: {
            genType: node.media_type || gd2.genType,
            watermarkMode:
              node.watermark_mode === "clean" ||
              node.watermark_mode === "original"
                ? node.watermark_mode
                : null,
            ratio: node.ratio || gd2.ratio,
            model: node.model || (isVid2 ? gd2.videoModel : gd2.imageModel),
            isFrames:
              node.media_type === "Video" && node.video_input_type === "Frames",
            quantity,
            manualSubmitMode: this._manualSubmitMode === true,
            flowVideoDuration: (() => {
              let dur = isVid2 ? node.video_duration || "6s" : null;
              if (isVid2 && cappedRefIds.length > 0) {
                const forced = flowAdapterPq?.getDurationOverride?.({
                  modelValue: node.model,
                  hasRef: true,
                  hasRefVideo: _pipeRefVideoIds.length > 0,
                  inputType: node.video_input_type || "Ingredients",
                });
                if (forced && forced !== dur) {
                  nodeLog(
                    `[Model Constraint] Override duration ${dur} \u2192 ${forced} (${node.model} + ref image)`,
                    "warn",
                  );
                  dur = forced;
                }
              }
              console.log(
                `[WorkflowExecutor] Pipeline flowVideoDuration: node.video_duration="${node.video_duration}", isVid=${isVid2}, hasRef=${cappedRefIds.length > 0}, result="${dur}"`,
              );
              return dur;
            })(),
            flowVideoResolution: isVid2
              ? window.ModelRegistry?.getGenerationResolutionValue?.(
                  "flow",
                  node.model,
                  node.video_resolution,
                )
              : null,
            refVideoIds: _pipeRefVideoIds,
            wantsLastFrame:
              isVid2 &&
              (workflow2.edges || []).some(
                (edge) =>
                  edge.source_node_id === node.node_id &&
                  isLastFramePort(edge.source_port),
              ),
          },
          refFileIds: cappedRefIds,
          refFileNames: pipelineRefNames,
          refThumbnails: pipelineRefThumbnails,
          refImageMode: cappedRefIds.length > 0 ? "all" : "none",
          autoDownload:
            (window.featureGate?.canUse("auto_download") ?? false) &&
            (node.auto_download === true ||
              node.auto_download === "1" ||
              node.auto_download === 1),
          downloadResolution: node.download_resolution || null,
          videoDownloadResolution: node.video_download_resolution || null,
          taskName: workflow2?.wf_name || null,
          _executionToken:
            this._singleNodeExecutionToken ||
            this._currentExecutionToken ||
            null,
          _executionTokenManagedByCaller: true,
          voice:
            isVid2 &&
            node.video_input_type !== "Frames" &&
            node.voice_slug &&
            node.voice_search_value
              ? { slug: node.voice_slug, search_value: node.voice_search_value }
              : null,
          character:
            node.video_input_type !== "Frames" &&
            window.CharacterRegistry.payload(node)
              ? window.CharacterRegistry.payload(node)
              : null,
        });
        if (this._singleNodeStartError) throw this._singleNodeStartError;
        if (pipelineResult.recoveryRequired) {
          this.shouldStop = true;
          const error = new Error(
            [
              pipelineResult.reason,
              pipelineResult.recoveryLabel,
              pipelineResult.recoveryHint,
            ]
              .filter(Boolean)
              .join(" \u2014 "),
          );
          error.code = pipelineResult.reason || "FLOW_API_RECOVERY_REQUIRED";
          error.recoveryRequired = true;
          error.noRetry = true;
          error.flowApiFailure = true;
          throw error;
        }
        const resultTileIds = pipelineResult.resultTileIds || [];
        if (pipelineResult.stopped && resultTileIds.length === 0) {
          this._recordStoppedFlowNodeHistory(node, workflow2, pipelineResult);
          const stoppedError = this._emptyGenerationResultError({
            ...pipelineResult,
            pipelineResult,
          });
          stoppedError.noRetry = true;
          stoppedError.workflowUserStopped =
            pipelineResult.stopOrigin === "user";
          stoppedError.flowProviderStopped =
            !stoppedError.workflowUserStopped &&
            ((pipelineResult.failed || 0) > 0 ||
              (pipelineResult.errorDetails || []).length > 0);
          throw stoppedError;
        }
        console.log(
          `[WorkflowExecutor] >>> PIPELINE returned ${resultTileIds.length} tiles:`,
          resultTileIds.slice(0, 5),
        );
        nodeLog(
          `Pipeline tr\u1EA3 v\u1EC1 ${resultTileIds.length} tile`,
          "info",
        );
        if (
          !pipelineResult.stopped &&
          resultTileIds.length === 0 &&
          (pipelineResult.failed || 0) > 0
        ) {
          const primaryError = pipelineResult.failedPrompts?.[0]?.error || "";
          const failureReason = primaryError || "GENERATION_FAILED";
          const isTobyRecoveryError = /^FLOW_RECOVERY_[A-Z0-9_]+$/.test(
            primaryError,
          );
          const pipelineError = new Error(
            isTobyRecoveryError
              ? failureReason
              : `Google Flow: ${failureReason}`,
          );
          pipelineError.code = primaryError || "GENERATION_FAILED";
          if (!primaryError)
            console.warn(
              "[WorkflowExecutor] Pipeline generation failed without reason",
              {
                failedPrompts: pipelineResult.failed,
                resultCount: resultTileIds.length,
              },
            );
          pipelineError.flowApiFailure =
            pipelineResult.failedPrompts?.some(
              (failed) => failed.genMode === "api",
            ) === true;
          pipelineError.errorDetails = pipelineResult.errorDetails || [];
          pipelineError.flowApiVersions = pipelineResult.flowApiVersions || [];
          pipelineError.historyRoute = pipelineResult.historyRoute || null;
          pipelineError.flowProviderStopped =
            this._captchaHalted === true &&
            this._captchaDecided === true &&
            pipelineResult.noRetry === true;
          if (pipelineResult.noRetry === true) pipelineError.noRetry = true;
          throw pipelineError;
        }
        const canUseAutoDownload =
          window.featureGate?.canUse("auto_download") ?? false;
        const nodeAutoDownload =
          canUseAutoDownload &&
          (node.auto_download === true ||
            node.auto_download === "1" ||
            node.auto_download === 1);
        const pipelineDownloadedIds = Array.isArray(
          pipelineResult.downloadedTileIds,
        )
          ? pipelineResult.downloadedTileIds
          : [];
        if (nodeAutoDownload && pipelineDownloadedIds.length > 0) {
          if (!this._downloadedTileIds) this._downloadedTileIds = new Set();
          for (const tid of pipelineDownloadedIds) {
            this._downloadedTileIds.add(tid);
          }
        }
        if (
          nodeAutoDownload &&
          Array.isArray(pipelineResult.failedDownloadTileIds) &&
          pipelineResult.failedDownloadTileIds.length > 0
        ) {
          nodeLog(
            `Auto-download l\u1ED7i ${pipelineResult.failedDownloadTileIds.length} file; k\u1EBFt qu\u1EA3 gen v\u1EABn \u0111\u01B0\u1EE3c gi\u1EEF`,
            "warn",
          );
        }
        if (
          nodeAutoDownload &&
          Array.isArray(pipelineResult.blockedDownloadTileIds)
        ) {
          this._downloadNoReplayTileIds ||
            (this._downloadNoReplayTileIds = new Set());
          for (const id of pipelineResult.blockedDownloadTileIds)
            this._downloadNoReplayTileIds.add(id);
        }
        const resultThumbnails = {};
        const resultFileNames = {};
        const resultProviderUrls = {};
        if (pipelineResult.resultProviderUrls) {
          for (const tid of resultTileIds) {
            if (pipelineResult.resultProviderUrls[tid])
              resultProviderUrls[tid] = pipelineResult.resultProviderUrls[tid];
          }
        }
        const nodeExpectsVideo =
          String(node.media_type || node.gen_type || "").toLowerCase() ===
          "video";
        if (pipelineResult.resultThumbnails) {
          for (const [tid, info] of Object.entries(
            pipelineResult.resultThumbnails,
          )) {
            const isVideoInfo =
              nodeExpectsVideo || info?.type === "video" || !!info?.video_url;
            const providerData = resultProviderUrls[tid] || null;
            const providerServingUrl =
              typeof providerData?.url === "string" &&
              !providerData.url.includes("media.getMediaUrlRedirect")
                ? providerData.url
                : null;
            const apiPreview = providerServingUrl;
            const infoThumbnail =
              typeof info?.thumbnail === "string" &&
              !(
                isVideoInfo &&
                info.thumbnail.includes("media.getMediaUrlRedirect")
              )
                ? info.thumbnail
                : "";
            const thumbnail =
              infoThumbnail ||
              (typeof apiPreview === "string" && /^https?:\/\//.test(apiPreview)
                ? apiPreview
                : "");
            const infoVideoUrl =
              typeof info?.video_url === "string" &&
              !info.video_url.includes("media.getMediaUrlRedirect")
                ? info.video_url
                : "";
            const videoUrl =
              infoVideoUrl ||
              (isVideoInfo && providerData && apiPreview ? apiPreview : "");
            if (info && (thumbnail || isVideoInfo || info.file_name)) {
              resultThumbnails[tid] = {
                thumbnail,
                type: isVideoInfo ? "video" : info.type || "image",
                file_name: info.file_name || "",
                ...(info.phaseRDownloadName && {
                  phaseRDownloadName: info.phaseRDownloadName,
                }),
                ...(info.media_uuid && { media_uuid: info.media_uuid }),
                ...(info.source_thumbnail && {
                  source_thumbnail: info.source_thumbnail,
                }),
                ...(info.thumb_is_poster === true && { thumb_is_poster: true }),
                ...(videoUrl && { video_url: videoUrl }),
                ...(info.playback_url_source && {
                  playback_url_source: info.playback_url_source,
                }),
                ...(info.persistent_media_id && {
                  persistent_media_id: info.persistent_media_id,
                }),
                ...(info.identity_kind && {
                  identity_kind: info.identity_kind,
                }),
                ...(info.identity_durability && {
                  identity_durability: info.identity_durability,
                }),
                ...(info.api_driver && { api_driver: info.api_driver }),
                ...(info.operation_uuid && {
                  operation_uuid: info.operation_uuid,
                }),
                ...(info.protocol_revision && {
                  protocol_revision: info.protocol_revision,
                }),
                ...(info.protocol_fingerprint && {
                  protocol_fingerprint: info.protocol_fingerprint,
                }),
                ...(Array.isArray(info.identity_aliases) &&
                  info.identity_aliases.length > 0 && {
                    identity_aliases: [
                      ...new Set(info.identity_aliases.filter(Boolean)),
                    ],
                  }),
                ...(info.display_name && { display_name: info.display_name }),
              };
              const durableName =
                info.file_name || info.persistent_media_id || "";
              if (durableName) resultFileNames[tid] = durableName;
            }
          }
        }
        if (pipelineResult.resultFileNames) {
          Object.assign(resultFileNames, pipelineResult.resultFileNames);
        }
        if (resultTileIds.length > 0 && window.MessageBridge) {
          const hydrationTargets = resultTileIds.filter((id) => {
            const info = resultThumbnails[id] || {};
            if (!info.thumbnail) return true;
            if (!nodeExpectsVideo) return false;
            if (!info.video_url) return true;
            const hasDurableAsb =
              isFlowV2AsbIdentity(info.persistent_media_id) &&
              info.identity_durability !== "session";
            return pipelineResult.genMode !== "api" && !hasDurableAsb;
          });
          if (hydrationTargets.length > 0) {
            try {
              const scanResult = await MessageBridge.getThumbnailsByIds(
                hydrationTargets,
                {
                  exactIdentityOnly: true,
                  deep: false,
                  fileNamesById: resultFileNames,
                  displayNamesById: Object.fromEntries(
                    hydrationTargets
                      .map((id) => [
                        id,
                        resultThumbnails[id]?.display_name || "",
                      ])
                      .filter(([, name]) => !!name),
                  ),
                },
              );
              const results = scanResult?.results || {};
              for (const tid of hydrationTargets) {
                if (results[tid]?.thumbnail || results[tid]?.video_url) {
                  const current = resultThumbnails[tid] || {};
                  resultThumbnails[tid] = {
                    ...current,
                    thumbnail:
                      results[tid].thumbnail || current.thumbnail || "",
                    type: nodeExpectsVideo
                      ? "video"
                      : results[tid].type || "image",
                    file_name:
                      results[tid].file_name || current.file_name || "",
                    ...((results[tid].media_uuid || current.media_uuid) && {
                      media_uuid: results[tid].media_uuid || current.media_uuid,
                    }),
                    ...(results[tid].source_thumbnail && {
                      source_thumbnail: results[tid].source_thumbnail,
                    }),
                    ...(results[tid].thumb_is_poster === true && {
                      thumb_is_poster: true,
                    }),
                    ...(results[tid].persistent_media_id && {
                      persistent_media_id: results[tid].persistent_media_id,
                    }),
                    ...(results[tid].identity_kind && {
                      identity_kind: results[tid].identity_kind,
                    }),
                    ...(results[tid].identity_durability && {
                      identity_durability: results[tid].identity_durability,
                    }),
                    ...(Array.isArray(results[tid].identity_aliases) &&
                      results[tid].identity_aliases.length > 0 && {
                        identity_aliases: [
                          ...new Set(
                            results[tid].identity_aliases.filter(Boolean),
                          ),
                        ],
                      }),
                    ...(results[tid].video_url && {
                      video_url: results[tid].video_url,
                    }),
                    ...(results[tid].display_name && {
                      display_name: results[tid].display_name,
                    }),
                  };
                  const durableName =
                    results[tid].file_name ||
                    results[tid].persistent_media_id ||
                    "";
                  if (durableName) resultFileNames[tid] = durableName;
                }
              }
            } catch (e) {
              console.warn(
                "[WorkflowExecutor] Scan pipeline result thumbnails failed:",
                e.message,
              );
            }
          }
        }
        console.log(
          "[WorkflowVideoPreviewAudit] executor result metadata",
          resultTileIds.map((tid) => {
            const info = resultThumbnails[tid] || {};
            return {
              id: tid,
              type: info.type || null,
              hasThumbnail: !!info.thumbnail,
              hasVideoUrl: !!info.video_url,
              thumbIsPoster: info.thumb_is_poster === true,
              identityKind: isFlowV2AsbIdentity(info.persistent_media_id || tid)
                ? "flow_v2_asb"
                : "other",
              persistentIdLength: String(info.persistent_media_id || "").length,
            };
          }),
        );
        if (pipelineResult.jobId && resultTileIds.length > 0) {
          pq.enrichJobResults?.(pipelineResult.jobId, {
            thumbnails: resultThumbnails,
            fileNames: resultFileNames,
            providerUrls: resultProviderUrls,
          });
        }
        return {
          fileIds: resultTileIds,
          modelUsed:
            node.model || (isVid2 ? gd2.videoModel : gd2.imageModel) || null,
          partialFailureMessage:
            resultTileIds.length > 0
              ? [
                  ...new Set(
                    (pipelineResult.failedPrompts || [])
                      .map((failed) => failed.error)
                      .filter(Boolean),
                  ),
                ].join(" \xB7 ")
              : "",
          duration: 0,
          flowApiVersions: pipelineResult.flowApiVersions || [],
          historyRoute: pipelineResult.historyRoute || null,
          errorDetails: pipelineResult.errorDetails || [],
          thumbnails: resultThumbnails,
          fileNames: resultFileNames,
          providerUrls: resultProviderUrls,
          flowDriverKey: pipelineResult.flowDriverKey || null,
          genMode: pipelineResult.genMode || "web",
          apiFileIds: Array.isArray(pipelineResult.apiResultTileIds)
            ? pipelineResult.apiResultTileIds.filter(Boolean)
            : [],
          pipelineResult,
          _userSkipped:
            (pipelineResult.cancelledCount || 0) > 0 &&
            resultTileIds.length === 0 &&
            (pipelineResult.completed || 0) === 0,
          refFileIdsUsed: Array.isArray(cappedRefIds) ? cappedRefIds : [],
        };
      }
      const gd = await this._getGenDefaultsForNode(node);
      const isVid = (node.media_type || gd.genType) === "Video";
      const isFrames2 = isVid && node.video_input_type === "Frames";
      nodeLog(
        `C\xE0i \u0111\u1EB7t: ${node.media_type || gd.genType} / ${node.ratio || gd.ratio} / ${node.model || (isVid ? gd.videoModel : gd.imageModel)}`,
      );
      if (this.shouldStop) throw new Error("Execution stopped by user");
      this._submittedNodes?.delete(node.node_id);
      const accum = nodeAccum ||
        this._currentNodeAccum || { thumbnails: {}, fileNames: {} };
      let preTileIds, preFileNames;
      const releaseSubmitMutex = await this._acquireSubmitMutex();
      try {
        this._assertWorkflowNotStopped();
        if (this._singleNodeSessionWorker)
          await this._startSingleNodeGeneration(node);
        if (window.MessageBridge?.prepareFlowForGen) {
          try {
            log(
              "Step 0: prepareFlowForGen (close chat panel + Agent OFF + wait editor)",
            );
            const prep = await window.MessageBridge.prepareFlowForGen();
            if (prep?.success === false) {
              throw new Error(prep.error || "FLOW_PREPARE_FAILED");
            }
            if (prep?.actioned) {
              log(
                `Step 0 actioned (editor ready in ${prep.editorReadyMs || 0}ms)`,
              );
            }
          } catch (e) {
            log("Step 0 prepareFlowForGen failed:", e.message);
            throw e;
          }
        }
        await this._removeExistingRefImages();
        await this._sleep(200);
        await this._clearEditor();
        await this._sleep(this._getClearEditorDelay());
        let _directPrompt = node.prompt || "";
        let _mentionVoiceFallback = null;
        let _mentionCharFallback = null;
        const _directComps = isFrames2
          ? []
          : window.MentionParser?.parseComponents?.(_directPrompt) || [];
        if (_directComps.length > 0) {
          nodeLog(
            `\u26A0\uFE0F Prompt c\xF3 ${_directComps.length} mention @voice:/@char: \u2014 direct path ch\u01B0a h\u1ED7 tr\u1EE3 inline, \xE1p mention \u0111\u1EA7u ti\xEAn nh\u01B0 single`,
            "warn",
          );
          _mentionVoiceFallback =
            _directComps.find((c) => c.type === "voice")?.name || null;
          _mentionCharFallback =
            _directComps.find((c) => c.type === "char")?.name || null;
          _directPrompt = window.MentionParser.stripComponents(_directPrompt);
        }
        {
          const _voicePayload =
            !isFrames2 && isVid && node.voice_slug && node.voice_search_value
              ? { slug: node.voice_slug, search_value: node.voice_search_value }
              : isVid && _mentionVoiceFallback
                ? { search_value: _mentionVoiceFallback }
                : null;
          const _charPayload =
            !isFrames2 && window.CharacterRegistry.payload(node)
              ? window.CharacterRegistry.payload(node)
              : _mentionCharFallback
                ? { search_value: _mentionCharFallback }
                : null;
          if (_voicePayload && window.MessageBridge?.selectFlowVoice) {
            try {
              nodeLog(
                `Ch\u1ECDn gi\u1ECDng \u0111\u1ECDc: ${_voicePayload.search_value}`,
              );
              await window.MessageBridge.selectFlowVoice(_voicePayload);
            } catch (e) {
              log("selectFlowVoice failed (non-blocking):", e.message);
            }
          }
          if (_charPayload && window.MessageBridge?.selectFlowCharacter) {
            try {
              nodeLog(
                `Ch\u1ECDn nh\xE2n v\u1EADt: ${_charPayload.search_value}`,
              );
              await window.MessageBridge.selectFlowCharacter(_charPayload);
            } catch (e) {
              log("selectFlowCharacter failed (non-blocking):", e.message);
            }
          }
        }
        if (
          isFramesResult &&
          node.media_type === "Video" &&
          node.video_input_type === "Frames"
        ) {
          const frame1Valid =
            rawInputFileIds.frame1 &&
            !syntheticIdPattern.test(rawInputFileIds.frame1);
          const frame2Valid =
            rawInputFileIds.frame2 &&
            !syntheticIdPattern.test(rawInputFileIds.frame2);
          if (frame1Valid) {
            nodeLog(
              `Th\xEAm Frame 1: ${rawInputFileIds.frame1.substring(0, 20)}...`,
            );
            await this._addFileToPrompt(
              rawInputFileIds.frame1,
              fnLookup[rawInputFileIds.frame1],
            );
            await this._sleep(500);
          } else if (rawInputFileIds.frame1) {
            nodeLog("Frame 1 l\xE0 synthetic ID \u2014 b\u1ECF qua", "warn");
          }
          if (frame2Valid) {
            nodeLog(
              `Th\xEAm Frame 2: ${rawInputFileIds.frame2.substring(0, 20)}...`,
            );
            await this._addFileToPrompt(
              rawInputFileIds.frame2,
              fnLookup[rawInputFileIds.frame2],
            );
            await this._sleep(500);
          } else if (rawInputFileIds.frame2) {
            nodeLog("Frame 2 l\xE0 synthetic ID \u2014 b\u1ECF qua", "warn");
          }
        } else {
          if (inputFileIds.length > 0) {
            nodeLog(`Th\xEAm ${inputFileIds.length} \u1EA3nh tham chi\u1EBFu`);
            log(`Adding ${inputFileIds.length} ref images:`, inputFileIds);
          }
          for (const fileId of inputFileIds) {
            log("Adding ref image:", fileId);
            await this._addFileToPrompt(fileId, fnLookup[fileId]);
            await this._sleep(800);
          }
        }
        if (this.shouldStop) throw new Error("Execution stopped by user");
        const _hasRefForSettings = Array.isArray(inputFileIds)
          ? inputFileIds.length > 0
          : false;
        await this._applySettings(node, _hasRefForSettings);
        nodeLog(`Nh\u1EADp prompt: "${_directPrompt.substring(0, 40)}..."`);
        await this._insertPrompt(_directPrompt);
        await this._sleep(this._getSubmitDelay());
        if (this.shouldStop) throw new Error("Execution stopped by user");
        if (
          !this._isContentScriptContext() &&
          window.MessageBridge?.stabilizeFlowResultViewport
        ) {
          await window.MessageBridge.stabilizeFlowResultViewport();
        }
        preTileIds = await this._getCurrentTileIds(accum);
        console.log(
          `[WorkflowExecutor] preTileIds captured: ${preTileIds.length} tiles`,
          preTileIds.slice(0, 5),
        );
        nodeLog(
          `Snapshot ${preTileIds.length} tile c\xF3 s\u1EB5n TR\u01AF\u1EDAC submit (baseline)`,
          "info",
        );
        emitNodePhase(node.node_id, "submitting");
        await this._clickSubmit();
        this._submittedNodes?.add(node.node_id);
        log("Prompt submitted, waiting for result...");
        nodeLog(
          `\u0110\xE3 submit (x${quantity}), ch\u1EDD k\u1EBFt qu\u1EA3...`,
          "info",
        );
        window.eventBus.emit("node:submitted", { node });
        emitNodePhase(node.node_id, "generating");
        await this._sleep(1500);
      } finally {
        releaseSubmitMutex();
      }
      preFileNames = accum.preFileNames || null;
      console.log(
        `[WorkflowExecutor] CALLING _waitForNewTiles (timeout=${this.settings.tileTimeout}ms, expected quantity=${quantity})`,
      );
      nodeLog(
        `\u0110ang ch\u1EDD ${quantity} tile m\u1EDBi (timeout ${Math.round(this.settings.tileTimeout / 1e3)}s)...`,
        "info",
      );
      const newTileIds = await this._waitForNewTiles(
        preTileIds,
        this.settings.tileTimeout,
        preFileNames,
        accum,
        quantity,
        node.media_type || genType,
      );
      console.log(
        `[WorkflowExecutor] _waitForNewTiles RETURNED ${newTileIds.length} tiles:`,
        newTileIds.slice(0, 5),
      );
      allNewTileIds.push(...newTileIds);
      nodeLog(
        `Nh\u1EADn ${newTileIds.length} k\u1EBFt qu\u1EA3 m\u1EDBi`,
        "success",
      );
      if (newTileIds.length > 0) emitNodePhase(node.node_id, "downloading");
      this._submittedNodes?.delete(node.node_id);
      const duration = Date.now() - startTime;
      log(
        `Node "${node.node_name}" completed in ${duration}ms, got ${allNewTileIds.length} tiles`,
      );
      let directFlowContext = null;
      try {
        directFlowContext =
          await window.MessageBridge?._getStoredTargetContext?.();
      } catch (_) {}
      return {
        fileIds: allNewTileIds,
        modelUsed:
          node.model || (isVid ? gd.videoModel : gd.imageModel) || null,
        duration,
        thumbnails: accum.thumbnails,
        fileNames: accum.fileNames,
        genMode: "web",
        flowDriverKey:
          directFlowContext?.driverKey ||
          (allNewTileIds.some(
            (id) => accum.thumbnails?.[id]?.driver_key === "flow_v2",
          )
            ? "flow_v2"
            : null),
        refFileIdsUsed: Array.isArray(inputFileIds) ? inputFileIds : [],
      };
    }
    async _executeDownloadNode(node, workflow2, emitLog2) {
      const startTime = Date.now();
      console.log(
        `[WorkflowExecutor] >>> DOWNLOAD NODE START "${node.node_name || node.node_id}", collectAll=${node.download_collect_all}`,
      );
      const canUseAutoDownload =
        window.featureGate?.canUse("auto_download") ?? false;
      if (!canUseAutoDownload) {
        emitLog2(
          "G\xF3i hi\u1EC7n t\u1EA1i kh\xF4ng h\u1ED7 tr\u1EE3 t\u1EA3i xu\u1ED1ng t\u1EF1 \u0111\u1ED9ng. Vui l\xF2ng n\xE2ng c\u1EA5p.",
          "warn",
        );
        return { fileIds: [], duration: Date.now() - startTime };
      }
      const collectAll =
        node.download_collect_all === true ||
        node.download_collect_all === "1" ||
        node.download_collect_all === 1;
      let inputFileIds;
      if (collectAll) {
        inputFileIds = this._collectAllWorkflowFileIds(workflow2.nodes);
        console.log(
          `[WorkflowExecutor] >>> DOWNLOAD collectAll=TRUE \u2192 collected ${inputFileIds.length} tiles t\u1EEB T\u1EA4T C\u1EA2 workflow nodes (k\u1EC3 c\u1EA3 nodes ch\u01B0a ho\xE0n th\xE0nh!)`,
        );
      } else {
        inputFileIds = this._collectPortInputs(
          node,
          "media_in",
          workflow2.nodes,
          workflow2.edges,
        );
        if (!inputFileIds || inputFileIds.length === 0) {
          inputFileIds = this._collectInputFileIds(
            node,
            workflow2.nodes,
            workflow2.edges,
          );
        }
        console.log(
          `[WorkflowExecutor] >>> DOWNLOAD via port/upstream \u2192 collected ${inputFileIds?.length || 0} tiles:`,
          inputFileIds?.slice(0, 5),
        );
      }
      if (!Array.isArray(inputFileIds) || inputFileIds.length === 0) {
        throw new Error("Kh\xF4ng c\xF3 file \u0111\u1EC3 t\u1EA3i");
      }
      const fnLookup = this._buildFileNameLookup(node, workflow2);
      const providerUrlLookup = this._buildProviderUrlLookup(workflow2.nodes);
      const hasVideoUpstream = this._hasVideoUpstreamNode(node, workflow2);
      const resolution = hasVideoUpstream
        ? node.video_download_resolution || "720p"
        : node.download_resolution || "1k";
      emitLog2(
        `T\u1EA3i ${inputFileIds.length} file (${resolution.toUpperCase()})...`,
      );
      let downloaded = 0;
      let skippedCrossProject = 0;
      let failedDownloads = 0;
      const downloadErrors = [];
      let downloadRetryBlocked = false;
      if (!this._downloadedTileIds) this._downloadedTileIds = new Set();
      for (const fileId of inputFileIds) {
        if (this.shouldStop) throw new Error("DOWNLOAD_STOPPED");
        if (this._downloadedTileIds.has(fileId)) {
          downloaded++;
          emitLog2(
            `\u0110\xE3 t\u1EA3i tr\u01B0\u1EDBc \u0111\xF3 ${downloaded}/${inputFileIds.length}, b\u1ECF qua t\u1EA3i l\u1EA1i`,
            "info",
          );
          continue;
        }
        if (this._downloadNoReplayTileIds?.has(fileId)) {
          failedDownloads++;
          downloadRetryBlocked = true;
          downloadErrors.push("DOWNLOAD_ACCEPTANCE_UNKNOWN");
          emitLog2(
            `T\u1EA3i ${fileId} \u0111\xE3 \u0111\u01B0\u1EE3c g\u1EEDi nh\u01B0ng ch\u01B0a x\xE1c nh\u1EADn; kh\xF4ng g\u1EEDi l\u1EA1i \u0111\u1EC3 tr\xE1nh t\u1EA3i tr\xF9ng`,
            "warn",
          );
          continue;
        }
        const expectedFileName = fnLookup[fileId];
        if (expectedFileName && this._isContentScriptContext()) {
          const tile =
            typeof _getTileById === "function" ? _getTileById(fileId) : null;
          if (tile) {
            const currentFileName = this._extractFileNameFromTile(tile);
            const native =
              typeof _getObservedFlowMediaMetadata === "function"
                ? _getObservedFlowMediaMetadata(fileId)
                : null;
            const aliasesMatch =
              native &&
              [native.media_uuid, native.persistent_media_id].includes(
                expectedFileName,
              );
            if (
              currentFileName &&
              currentFileName !== expectedFileName &&
              !aliasesMatch
            ) {
              emitLog2(
                `Tile ${fileId.substring(0, 16)} thu\u1ED9c project kh\xE1c, b\u1ECF qua`,
                "warn",
              );
              skippedCrossProject++;
              continue;
            }
          }
        }
        const sourceNode = (workflow2.nodes || []).find((n) => {
          if (!n || n.node_id === node.node_id) return false;
          const ids = (n.result_file_ids || "").split(",").map((s) => s.trim());
          return ids.includes(fileId);
        });
        const fileIndex = inputFileIds.indexOf(fileId);
        const promptText = this._buildDownloadFileName(
          node,
          workflow2,
          fileIndex,
          sourceNode,
        );
        let fileName = fnLookup[fileId] || null;
        const subfolder = node.download_folder ? node.download_folder : void 0;
        try {
          const savedProviderData =
            providerUrlLookup[fileId] ||
            (expectedFileName ? providerUrlLookup[expectedFileName] : null);
          let providerData = savedProviderData;
          const savedMedia =
            sourceNode?.result_thumbnails?.[fileId] ||
            sourceNode?.ref_thumbnails?.[fileId];
          if (
            providerData?.provider === "flow" &&
            window.FlowApiAdapter?.isApiModeIntended?.({
              forWorkflow: true,
              forDownload: true,
            }) !== true
          ) {
            providerData = null;
          }
          const fileIsVideo =
            savedProviderData?.media_type === "video" ||
            savedMedia?.type === "video" ||
            sourceNode?.media_type === "Video" ||
            sourceNode?.gen_type === "Video" ||
            (sourceNode?.node_type === "grok" &&
              sourceNode?.grok_mode === "video");
          if (
            providerData?.provider === "muse" &&
            !fileIsVideo &&
            !this._museRuntimeResults?.has(fileId)
          )
            providerData = null;
          if (
            !providerData ||
            (providerData.provider === "flow" && !providerData.api_driver)
          ) {
            const routes = await this._nodeUuidDownloadRoutes(
              sourceNode || {},
              [fileId],
              fnLookup,
              providerUrlLookup,
              workflow2,
            );
            providerData = routes.get(fileId) || providerData;
          }
          const fileResolution = fileIsVideo
            ? node.video_download_resolution
            : node.download_resolution;
          if (!fileResolution) throw new Error("DOWNLOAD_RESOLUTION_MISSING");
          const plannedFilename = await this._buildNodeDownloadPath(
            promptText,
            subfolder,
            fileIsVideo ? "mp4" : "png",
          );
          const _vRes = fileIsVideo ? fileResolution : null;
          const _wmMode =
            node.watermark_mode === "clean" ||
            node.watermark_mode === "original"
              ? node.watermark_mode
              : null;
          log(
            `[WM] node Download "${node.node_name}": watermark_mode=${node.watermark_mode ?? "(thi\u1EBFu)"} \u2192 g\u1EEDi ${_wmMode ?? "inherit"}`,
          );
          const needsFlowRoute =
            !providerData || providerData.provider === "flow";
          const downloadRoute = needsFlowRoute
            ? window.ProviderConfigManager?.getDownloadResolutionRouteSync?.(
                "flow",
                fileIsVideo ? "video" : "image",
                fileResolution,
              ) || null
            : "direct";
          if (needsFlowRoute && !downloadRoute)
            throw new Error("FLOW_DOWNLOAD_CONFIG_MISSING");
          const wantsUpscale = downloadRoute === "upscale";
          await this._downloadNodeResult({
            fileId,
            fileName,
            providerData,
            savedProviderData,
            media: savedMedia,
            workflow: workflow2,
            isVideo: fileIsVideo,
            wantsUpscale,
            promptText,
            index: fileIndex + 1,
            subfolder,
            watermarkMode: _wmMode,
            resolution: fileResolution,
            ratio: sourceNode?.ratio || null,
            generationMode:
              sourceNode?.result_gen_mode || sourceNode?.gen_mode || null,
            plannedFilename,
          });
          this._downloadedTileIds.add(fileId);
          downloaded++;
          emitLog2(
            `\u0110\xE3 t\u1EA3i ${downloaded}/${inputFileIds.length}`,
            "success",
          );
        } catch (err) {
          failedDownloads++;
          downloadErrors.push(err.message || "DOWNLOAD_FAILED");
          downloadRetryBlocked =
            downloadRetryBlocked ||
            err?.noRetry === true ||
            err?.noReplay === true ||
            err?.dispatchStarted === true ||
            ["receipt", "ambiguous", "accepted_poll"].includes(err?.stage) ||
            /^(GOOGLE_REJECTED|RPC_REJECTED|RPC_REJECT|SCHEMA_CHANGED|FLOW_API_UPSCALE_FAILED)$/.test(
              err?.code || err?.message || "",
            );
          emitLog2(`L\u1ED7i t\u1EA3i file ${fileId}: ${err.message}`, "warn");
        }
        await this._sleep(500);
      }
      if (skippedCrossProject > 0) {
        emitLog2(
          `B\u1ECF qua ${skippedCrossProject} file thu\u1ED9c project kh\xE1c`,
          "warn",
        );
        throw new Error(
          `DOWNLOAD_PROJECT_MISMATCH (${skippedCrossProject}/${inputFileIds.length})`,
        );
      }
      if (downloaded === 0 && failedDownloads > 0) {
        throw Object.assign(
          new Error(
            `DOWNLOAD_ALL_FAILED (${failedDownloads}/${inputFileIds.length}): ${[...new Set(downloadErrors)].join(" \xB7 ")}`,
          ),
          downloadRetryBlocked ? { noRetry: true, noReplay: true } : {},
        );
      }
      if (failedDownloads > 0) {
        emitLog2(
          `T\u1EA3i m\u1ED9t ph\u1EA7n: ${downloaded} th\xE0nh c\xF4ng, ${failedDownloads} th\u1EA5t b\u1EA1i`,
          "warn",
        );
        throw Object.assign(
          new Error(
            `DOWNLOAD_PARTIAL_FAILED (${failedDownloads}/${inputFileIds.length}): ${[...new Set(downloadErrors)].join(" \xB7 ")}`,
          ),
          downloadRetryBlocked ? { noRetry: true, noReplay: true } : {},
        );
      }
      return { fileIds: [], duration: Date.now() - startTime };
    }
    async _resolveDownloadWebIdentity(
      fileId,
      fileName,
      media,
      providerData,
      workflow2,
      isVideo,
    ) {
      const projectId =
        providerData?.project_id ||
        media?.project_id ||
        workflow2?.project_id ||
        workflow2?.projectId ||
        null;
      const bridge = window.MessageBridge;
      if (projectId) {
        const context = this._isContentScriptContext()
          ? {
              projectId:
                typeof getCurrentProjectId === "function"
                  ? getCurrentProjectId()
                  : null,
            }
          : await bridge?.sendToContentScript?.("getProjectContext");
        if (
          String(context?.projectId || "").toLowerCase() !==
          String(projectId).toLowerCase()
        )
          throw new Error("PROJECT_MISMATCH");
      }
      const uuid = (value) =>
        typeof value === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          value,
        );
      const ids = [
        ...new Set(
          [
            providerData?.media_uuid,
            media?.media_uuid,
            fileId,
            fileName,
            media?.persistent_media_id,
          ].filter(Boolean),
        ),
      ];
      const uuidIds = ids.filter(uuid);
      let catalog = null;
      try {
        catalog =
          this._isContentScriptContext() &&
          typeof _lookupFlowMediaCatalog === "function"
            ? _lookupFlowMediaCatalog(ids)
            : await bridge?.lookupFlowMediaCatalog?.(ids);
      } catch (error) {
        console.warn(
          "[WorkflowDownloadIdentity] catalog unavailable; checking exact mounted owner",
          error.message || error,
        );
      }
      if (
        projectId &&
        catalog?.projectId &&
        String(catalog.projectId).toLowerCase() !==
          String(projectId).toLowerCase()
      )
        throw new Error("PROJECT_MISMATCH");
      const found = ids
        .map((id) => catalog?.known?.[id])
        .find((info) => info?.type === (isVideo ? "video" : "image"));
      const ownerUuid = uuidIds[0];
      const locatorIds = ids.filter(
        (id) =>
          !ownerUuid ||
          !uuid(id) ||
          id.toLowerCase() === ownerUuid.toLowerCase(),
      );
      if (
        ownerUuid &&
        found?.media_uuid &&
        String(found.media_uuid).toLowerCase() !== ownerUuid.toLowerCase()
      )
        throw new Error("FLOW_WEB_MEDIA_IDENTITY_MISMATCH");
      const catalogIdentity = isVideo
        ? found?.persistent_media_id
        : found?.media_uuid;
      if (
        catalogIdentity &&
        (isVideo ? isFlowV2AsbIdentity(catalogIdentity) : uuid(catalogIdentity))
      ) {
        return { tileId: catalogIdentity, fileName: catalogIdentity };
      }
      let existing = null;
      if (providerData?.api_driver === "v2") {
        existing =
          this._isContentScriptContext() && typeof _getTileById === "function"
            ? locatorIds.filter((id) => _getTileById(id)?.isConnected)
            : (await bridge?.checkTilesExist?.(locatorIds))?.existing || [];
        if (!existing.length) {
          throw new Error(
            "FLOW_WEB_RESULT_NOT_SYNCED: API result is not observed on Flow; retry API or refresh Flow after generation finishes",
          );
        }
        const mountedOwner = locatorIds.find((id) => existing.includes(id));
        if (isVideo && mountedOwner)
          return { tileId: mountedOwner, fileName: mountedOwner };
      }
      if (!isVideo && uuidIds.length)
        return { tileId: uuidIds[0], fileName: uuidIds[0] };
      if (isVideo && uuidIds.length) {
        existing = existing || [];
        if (
          this._isContentScriptContext() &&
          typeof _getTileById === "function"
        ) {
          existing = uuidIds.filter((id) => _getTileById(id)?.isConnected);
        } else if (bridge?.checkTilesExist)
          existing = (await bridge.checkTilesExist(uuidIds))?.existing || [];
        const mounted = uuidIds.find((id) => existing.includes(id));
        if (mounted) return { tileId: mounted, fileName: mounted };
      }
      const savedAsb = isVideo ? ids.find(isFlowV2AsbIdentity) : null;
      if (savedAsb) return { tileId: savedAsb, fileName: savedAsb };
      if (!uuidIds.length && providerData?.provider !== "flow")
        return { tileId: fileId, fileName };
      throw new Error(
        isVideo
          ? "FLOW_WEB_MEDIA_CATALOG_PENDING"
          : "FLOW_WEB_MEDIA_ID_MISSING",
      );
    }
    async _downloadNodeResult({
      fileId,
      fileName,
      providerData,
      savedProviderData,
      media,
      workflow: workflow2,
      isVideo,
      wantsUpscale,
      promptText,
      index,
      subfolder,
      watermarkMode,
      resolution,
      ratio,
      plannedFilename,
      generationMode = null,
      forWorkflow = true,
    }) {
      if (this.shouldStop) throw new Error("DOWNLOAD_STOPPED");
      if (
        generationMode !== "web" &&
        !wantsUpscale &&
        (!providerData || providerData.provider === "flow") &&
        providerData?.uuidLookup !== true &&
        typeof this._nodeUuidDownloadRoutes === "function"
      ) {
        try {
          const routes = await this._nodeUuidDownloadRoutes(
            {
              media_type: isVideo ? "Video" : "Image",
              result_thumbnails: { [fileId]: media || {} },
            },
            [fileId],
            { [fileId]: fileName },
            { [fileId]: providerData || savedProviderData },
            workflow2 || {},
            { nativeLookup: true },
          );
          providerData = routes.get(fileId) || providerData;
        } catch (error) {
          console.warn(
            "[WorkflowDownloadRoute] native UUID inference unavailable:",
            error.message || error,
          );
        }
      }
      let gate = { ready: true };
      const flowApiSelected =
        generationMode !== "web" &&
        providerData?.provider === "flow" &&
        window.FlowApiAdapter?.isApiModeIntended?.({
          forWorkflow: false,
          forDownload: true,
        }) !== false;
      let apiWebFallbackAuthorized = false;
      let apiWebFallbackReason = null;
      if (providerData?.provider === "flow" && !flowApiSelected)
        gate = { ready: false, reason: "API_DISABLED" };
      if (flowApiSelected) {
        try {
          gate = await window.FlowApiFacade?.checkDownloadReady?.({
            mediaId: providerData.media_uuid || fileId,
            mediaType: isVideo ? "video" : "image",
            providerData,
            requireUpscale: wantsUpscale,
            forWorkflow: false,
          });
        } catch (error) {
          gate = {
            ready: false,
            reason: error.message || "API_PREFLIGHT_FAILED",
          };
        }
        if (gate?.ready !== true)
          console.warn(
            "[WorkflowDownloadRoute] API preflight blocked:",
            JSON.stringify({
              mediaType: isVideo ? "video" : "image",
              driver: providerData.api_driver,
              reason: gate?.reason || "API_NOT_READY",
            }),
          );
        if (gate?.ready !== true) {
          apiWebFallbackAuthorized = true;
          apiWebFallbackReason =
            gate?.reason || "FLOW_API_DOWNLOAD_PREFLIGHT_FAILED";
        }
      }
      if (
        (providerData?.url ||
          providerData?.durable_url ||
          providerData?.provider === "flow") &&
        gate?.ready === true
      ) {
        let ok2 = false;
        try {
          ok2 = await this._downloadProviderTileDirect(
            providerData.provider === "flow"
              ? providerData.media_uuid || fileId
              : fileId,
            { ...providerData, media_type: isVideo ? "video" : "image" },
            promptText,
            index,
            subfolder,
            fileName,
            watermarkMode,
            resolution,
            ratio,
            plannedFilename,
          );
        } catch (error) {
          const safeBeforeDispatch =
            error?.dispatchStarted === false ||
            ["pre_dispatch", "preflight"].includes(error?.stage);
          if (flowApiSelected && !safeBeforeDispatch) throw error;
          if (flowApiSelected) {
            apiWebFallbackAuthorized = true;
            apiWebFallbackReason =
              error?.code ||
              error?.error ||
              error?.message ||
              "FLOW_API_DOWNLOAD_FAILED";
          }
          console.warn(
            "[WorkflowDownloadIdentity] direct download failed; resolving exact Web owner",
            error.message || error,
          );
        }
        if (ok2 === true) {
          console.log(
            "[WorkflowDownloadRoute] completed route=api",
            JSON.stringify({
              mediaType: isVideo ? "video" : "image",
              driver: providerData.api_driver,
            }),
          );
          return true;
        }
        if (flowApiSelected && !apiWebFallbackAuthorized) {
          throw new Error(
            wantsUpscale
              ? "FLOW_API_UPSCALE_FAILED"
              : "FLOW_API_DOWNLOAD_FAILED",
          );
        }
      }
      if (this.shouldStop) throw new Error("DOWNLOAD_STOPPED");
      const identity = await this._resolveDownloadWebIdentity(
        fileId,
        fileName,
        media,
        savedProviderData || providerData,
        workflow2,
        isVideo,
      );
      console.log(
        "[WorkflowDownloadRoute] route=web",
        JSON.stringify({
          mediaType: isVideo ? "video" : "image",
          reason:
            apiWebFallbackReason ||
            (gate?.ready !== true
              ? gate?.reason || "API_NOT_READY"
              : providerData
                ? "API_NATIVE_FAILED"
                : "NO_API_ROUTE"),
        }),
      );
      if (this.shouldStop) throw new Error("DOWNLOAD_STOPPED");
      const ok = await this._downloadSingleTile(
        identity.tileId,
        promptText,
        isVideo ? null : resolution,
        identity.fileName,
        null,
        subfolder,
        isVideo ? resolution : null,
        watermarkMode,
        plannedFilename,
      );
      if (!ok) throw new Error("WEB_DOM_DOWNLOAD_FAILED");
      return true;
    }
    async _nodeUuidDownloadRoutes(
      data,
      fileIds,
      fileNames,
      providerUrls,
      workflow2,
      options = {},
    ) {
      const routes = new Map();
      if (
        window.FlowApiAdapter?.isApiModeIntended?.({
          forWorkflow: true,
          forDownload: true,
        }) !== true
      )
        return routes;
      const uuid = (value) =>
        typeof value === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          value,
        );
      let legacyReady;
      const selections = new Map();
      for (const id of fileIds) {
        const existing = providerUrls[id] || providerUrls[fileNames[id]];
        const media = data.result_thumbnails?.[id] || null || {};
        const mediaId = [existing?.media_uuid, media?.media_uuid, id].find(
          uuid,
        );
        if (!mediaId) continue;
        const mediaType =
          data.media_type === "Video" ||
          data.gen_type === "Video" ||
          media.type === "video"
            ? "video"
            : "image";
        const pinnedDriver = existing?.api_driver || media?.api_driver;
        let lookupConfig = null;
        let driver = options.nativeLookup === true ? null : pinnedDriver;
        if (!driver) {
          if (!selections.has(mediaType)) {
            try {
              selections.set(
                mediaType,
                await window.FlowApiSessionCoordinator?.check?.({
                  surface: "workflow",
                  mediaType,
                  projectId:
                    existing?.project_id ||
                    media.project_id ||
                    workflow2?.project_id ||
                    workflow2?.projectId,
                  passive: true,
                }),
              );
            } catch (_) {
              selections.set(mediaType, null);
            }
          }
          const selection = selections.get(mediaType);
          if (selection?.ready !== true) continue;
          driver = selection.driver;
          if (driver === "v2") {
            lookupConfig =
              await window.ProviderConfigManager?.fetchFlowApiV2Configs?.();
            if (!lookupConfig) continue;
          }
        }
        const standaloneV2Upload =
          driver === "v2" &&
          (media.identity_kind === "flow-api-uuid" ||
            existing?.identity_kind === "flow-api-uuid") &&
          !existing?.operation_uuid &&
          !media.operation_uuid;
        if (standaloneV2Upload && !lookupConfig) {
          lookupConfig =
            await window.ProviderConfigManager?.fetchFlowApiV2Configs?.();
          if (!lookupConfig) continue;
        }
        if (driver !== "v1" && driver !== "v2") continue;
        if (driver === "v1") {
          if (legacyReady === void 0) {
            try {
              legacyReady =
                (
                  await window.FlowApiAdapter?.checkSessionReady?.({
                    allowAutoHeal: false,
                  })
                )?.ready === true;
            } catch (_) {
              legacyReady = false;
            }
          }
          if (!legacyReady) continue;
        }
        const provider = {
          ...(existing?.provider === "flow" ? existing : {}),
          provider: "flow",
          api_driver: driver,
          media_uuid: mediaId,
          media_type: mediaType,
          project_id:
            existing?.project_id ||
            media.project_id ||
            workflow2?.project_id ||
            workflow2?.projectId ||
            selections.get(mediaType)?.projectId,
          operation_uuid:
            options.nativeLookup === true
              ? void 0
              : existing?.operation_uuid || media.operation_uuid,
          protocol_revision:
            options.nativeLookup === true
              ? lookupConfig?.protocol?.schema_version
              : existing?.protocol_revision ||
                media.protocol_revision ||
                lookupConfig?.protocol?.schema_version,
          protocol_fingerprint:
            options.nativeLookup === true
              ? lookupConfig
                ? window.FlowApiV2CheckpointStore?.fingerprint?.(lookupConfig)
                : null
              : existing?.protocol_fingerprint ||
                media.protocol_fingerprint ||
                (lookupConfig
                  ? window.FlowApiV2CheckpointStore?.fingerprint?.(lookupConfig)
                  : null),
          ...(lookupConfig && (!pinnedDriver || standaloneV2Upload)
            ? { uuidLookup: true }
            : {}),
        };
        try {
          const health = await window.FlowApiFacade?.checkDownloadReady?.({
            mediaId,
            mediaType: provider.media_type,
            providerData: provider,
            requireUpscale: false,
            forWorkflow: false,
          });
          if (health?.ready === true) routes.set(id, provider);
          else
            console.warn(
              "[WorkflowDownloadRoute] UUID preflight blocked:",
              health?.reason || "API_NOT_READY",
            );
        } catch (_) {}
      }
      return routes;
    }
    _hasVideoUpstreamNode(node, workflow2) {
      if (!workflow2?.edges || !workflow2?.nodes) return false;
      const inputEdges = workflow2.edges.filter(
        (e) => e.target_node_id === node.node_id,
      );
      for (const edge of inputEdges) {
        const sourceNode = workflow2.nodes.find(
          (n) => n.node_id === edge.source_node_id,
        );
        if (!sourceNode) continue;
        if (sourceNode.media_type === "Video") return true;
        const nodeType = sourceNode.node_type || sourceNode.type;
        if (nodeType === "grok" && sourceNode.grok_mode === "video")
          return true;
        const thumbs = sourceNode.result_thumbnails || {};
        for (const key of Object.keys(thumbs)) {
          const t = thumbs[key];
          if (t && typeof t === "object" && t.type === "video") return true;
        }
      }
      return false;
    }
    _collectAllWorkflowFileIds(nodes) {
      const fileIds = [];
      for (const n of nodes || []) {
        if (n.node_type === "download") continue;
        if (n.result_file_ids) {
          const ids = (n.result_file_ids || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          fileIds.push(...ids);
        }
      }
      return [...new Set(fileIds)];
    }
    async _buildNodeDownloadPath(
      renderedName,
      subfolder,
      ext,
      workflowName = this.currentWorkflow?.wf_name,
    ) {
      const settings = await window.DownloadHelper.getSettings();
      const sanitize = (value) =>
        String(value || "")
          .replace(/[\u0000-\u001f\u007f]/g, " ")
          .replace(/[\/\\:*?"<>|]/g, "_")
          .replace(/\s+/g, " ")
          .trim();
      const folder = window.DownloadHelper.normalizeDownloadRootFolder(
        settings.folder,
      );
      const child = window.DownloadHelper.normalizeDownloadSubfolder(
        subfolder || workflowName,
      );
      const base = sanitize(renderedName);
      if (!folder || !base) throw new Error("DOWNLOAD_FILENAME_MISSING");
      return [
        folder,
        child.toLowerCase() === folder.toLowerCase() ? "" : child,
        `${base}.${ext}`,
      ]
        .filter(Boolean)
        .join("/");
    }
    _buildDownloadFileName(node, workflow2, index, sourceNode = null) {
      const DEFAULT_TEMPLATE = "{node}_{prompt}_{date}_{time}_{index}";
      const template = node.download_file_template || DEFAULT_TEMPLATE;
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const time = `${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}-${String(now.getSeconds()).padStart(2, "0")}`;
      const sanitize = (val) =>
        String(val || "")
          .replace(/[\/\\:*?"<>|]/g, "_")
          .trim() || "untitled";
      let rawPrompt = "";
      if (sourceNode) {
        try {
          const resolved = this._resolveEffectivePrompt(sourceNode, workflow2);
          rawPrompt = String(resolved?.text || "");
        } catch (_) {}
      }
      const promptValue = sanitize(rawPrompt.substring(0, 60));
      return template
        .replace(
          /\{workflow\}/g,
          sanitize(workflow2.wf_name || workflow2.name || "workflow"),
        )
        .replace(/\{node\}/g, sanitize(node.node_name || "download"))
        .replace(/\{index\}/g, String(index + 1))
        .replace(/\{date\}/g, date)
        .replace(/\{time\}/g, time)
        .replace(/\{prompt\}/g, promptValue);
    }
    async _executeTelegramNode(node, workflow2, emitLog2) {
      const startTime = Date.now();
      const canUseTelegram =
        (window.featureGate?.canUse("telegram_enabled") ?? false) &&
        (window.featureGate?.canUse("telegram_workflow") ?? false);
      if (!canUseTelegram) {
        emitLog2(
          "T\xEDnh n\u0103ng Telegram b\u1ECB kh\xF3a trong g\xF3i hi\u1EC7n t\u1EA1i. Vui l\xF2ng n\xE2ng c\u1EA5p.",
          "warn",
        );
        let inputFileIds2 = this._collectPortInputs(
          node,
          "media_in",
          workflow2.nodes,
          workflow2.edges,
        );
        if (!inputFileIds2 || inputFileIds2.length === 0) {
          inputFileIds2 = this._collectInputFileIds(
            node,
            workflow2.nodes,
            workflow2.edges,
          );
        }
        return { fileIds: inputFileIds2, duration: Date.now() - startTime };
      }
      const chatId = node.telegram_chat_id;
      if (!chatId) {
        throw new Error("Ch\u01B0a nh\u1EADp Telegram Chat ID");
      }
      let inputFileIds = this._collectPortInputs(
        node,
        "media_in",
        workflow2.nodes,
        workflow2.edges,
      );
      if (!inputFileIds || inputFileIds.length === 0) {
        inputFileIds = this._collectInputFileIds(
          node,
          workflow2.nodes,
          workflow2.edges,
        );
      }
      if (!Array.isArray(inputFileIds) || inputFileIds.length === 0) {
        throw new Error(
          "Kh\xF4ng c\xF3 \u1EA3nh \u0111\u1EC3 g\u1EEDi qua Telegram",
        );
      }
      const fnLookup = this._buildFileNameLookup(node, workflow2);
      const images = [];
      let skippedCrossProject = 0;
      for (const fileId of inputFileIds) {
        if (this.shouldStop) break;
        const expectedFileName = fnLookup[fileId];
        if (expectedFileName && this._isContentScriptContext()) {
          const tile = document.querySelector(`[data-tile-id="${fileId}"]`);
          if (tile) {
            const currentFileName = this._extractFileNameFromTile(tile);
            if (currentFileName && currentFileName !== expectedFileName) {
              emitLog2(
                `Tile ${fileId.substring(0, 16)} thu\u1ED9c project kh\xE1c, b\u1ECF qua`,
                "warn",
              );
              skippedCrossProject++;
              continue;
            }
          }
        }
        let mediaUrl = null;
        let mediaType = "image";
        for (const n of workflow2.nodes || []) {
          if (n.result_thumbnails && n.result_thumbnails[fileId]) {
            const thumb = n.result_thumbnails[fileId];
            if (typeof thumb === "object") {
              if (thumb.type === "video" && thumb.video_url) {
                mediaUrl = thumb.video_url;
                mediaType = "video";
              } else if (
                thumb.thumbnail &&
                thumb.thumbnail.startsWith("https://")
              ) {
                mediaUrl = thumb.thumbnail;
                mediaType = thumb.type || "image";
              }
            } else if (thumb && thumb.startsWith("https://")) {
              mediaUrl = thumb;
            }
            if (mediaUrl) break;
          }
        }
        if (!mediaUrl && this._isContentScriptContext()) {
          const tile = document.querySelector(`[data-tile-id="${fileId}"]`);
          if (tile) {
            const video = tile.querySelector("video[src]");
            if (video && video.src && video.src.startsWith("https://")) {
              mediaUrl = video.src;
              mediaType = "video";
            } else {
              const img =
                (typeof _q === "function" ? _q("tile_image", tile) : null) ||
                tile.querySelector("img[src]");
              if (img && img.src && img.src.startsWith("https://")) {
                mediaUrl = img.src;
                mediaType = "image";
              }
            }
          }
        }
        if (mediaUrl) {
          images.push({ url: mediaUrl, type: mediaType, file_id: fileId });
        }
      }
      if (skippedCrossProject > 0) {
        emitLog2(
          `B\u1ECF qua ${skippedCrossProject} file thu\u1ED9c project kh\xE1c`,
          "warn",
        );
      }
      if (images.length === 0) {
        throw new Error(
          "Kh\xF4ng t\xECm th\u1EA5y URL \u1EA3nh h\u1EE3p l\u1EC7 \u0111\u1EC3 g\u1EEDi",
        );
      }
      emitLog2(
        `\u0110ang t\u1EA3i ${images.length} file \u0111\u1EC3 g\u1EEDi qua Telegram...`,
      );
      const mediaItems = await this._convertMediaToBase64ForTelegram(images);
      if (mediaItems.length === 0) {
        throw new Error(
          "Kh\xF4ng th\u1EC3 t\u1EA3i file \u0111\u1EC3 g\u1EEDi qua Telegram",
        );
      }
      const sendMode = node.telegram_send_mode || "single";
      const message = node.telegram_message || "";
      emitLog2(`G\u1EEDi ${mediaItems.length} file qua Telegram...`);
      try {
        const response = await window.authManager._apiCall(
          "POST",
          "telegram/send-workflow-images",
          { chat_id: chatId, images: mediaItems, message, send_mode: sendMode },
        );
        const sentCount =
          response?.sent_count || response?.data?.sent_count || 0;
        emitLog2(
          `\u0110\xE3 g\u1EEDi ${sentCount} \u1EA3nh qua Telegram`,
          "success",
        );
      } catch (err) {
        emitLog2(`L\u1ED7i g\u1EEDi Telegram: ${err.message}`, "warn");
      }
      return { fileIds: inputFileIds, duration: Date.now() - startTime };
    }
    async _convertMediaToBase64ForTelegram(mediaItems) {
      const results = [];
      for (const item of mediaItems) {
        if (this.shouldStop) break;
        try {
          const mediaType = item.type || "image";
          const url = item.url;
          if (!url) continue;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3e4);
          let response;
          try {
            response = await fetch(url, { signal: controller.signal });
          } finally {
            clearTimeout(timeoutId);
          }
          if (!response.ok) {
            console.warn(
              "[WorkflowExecutor] Failed to fetch media:",
              url,
              response.status,
            );
            continue;
          }
          let blob = await response.blob();
          if (mediaType === "video" && blob.size > 50 * 1024 * 1024) {
            console.warn(
              "[WorkflowExecutor] Video too large for Telegram:",
              blob.size,
            );
            continue;
          }
          if (window.DownloadHelper?.cleanMediaBlob) {
            const clean = await window.DownloadHelper.cleanMediaBlob(
              blob,
              mediaType,
              { force: false },
            );
            blob = clean.blob || blob;
            if (!clean.cleaned && clean.reason !== "DISABLED") {
              console.warn(
                "[Telegram] b\u1ECF qua xo\xE1 watermark:",
                clean.reason,
              );
            }
          }
          const base64 = await this._blobToBase64(blob);
          results.push({
            type: mediaType,
            base64,
            mime_type:
              blob.type || (mediaType === "video" ? "video/mp4" : "image/png"),
          });
        } catch (err) {
          console.warn(
            "[WorkflowExecutor] Error converting media to base64:",
            item.url,
            err.message,
          );
        }
      }
      return results;
    }
    _blobToBase64(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result.split(",")[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
    async _executeDelayNode(node, emitLog2) {
      const seconds = node.delay_seconds || 3;
      emitLog2(`Ch\u1EDD ${seconds} gi\xE2y...`);
      const startTime = Date.now();
      const targetMs = seconds * 1e3;
      while (Date.now() - startTime < targetMs) {
        if (this.shouldStop) break;
        const remaining = targetMs - (Date.now() - startTime);
        await this._sleep(Math.min(200, remaining));
      }
      let inputFileIds = this._collectPortInputs(
        node,
        "any_in",
        this.currentWorkflow.nodes,
        this.currentWorkflow.edges,
      );
      if (!inputFileIds || inputFileIds.length === 0) {
        inputFileIds = this._collectInputFileIds(
          node,
          this.currentWorkflow.nodes,
          this.currentWorkflow.edges,
        );
      }
      return {
        fileIds: Array.isArray(inputFileIds) ? inputFileIds : [],
        duration: seconds * 1e3,
      };
    }
    async _materializePortableImageRefs(node, emitLog2) {
      const hasImageImportKeys =
        node.ref_file_ids &&
        node.ref_file_ids
          .split(",")
          .some((id) => isPortableUploadId(id.trim()));
      if (
        hasImageImportKeys &&
        typeof window.reuploadMissingFiles !== "function"
      ) {
        throw Object.assign(new Error("REF_UPLOAD_UNAVAILABLE"), {
          code: "REF_UPLOAD_FAILED",
        });
      }
      if (
        hasImageImportKeys &&
        typeof window.reuploadMissingFiles === "function"
      ) {
        if (this.isRunning) {
          if (this.shouldStop) throw new Error("UPLOAD_ABORTED");
          if (!this._portableUploadStopReset)
            this._portableUploadStopReset = this._resetFlowStopForRun(() =>
              emitLog2(
                "[Import] Flow upload Stop state reset for this workflow run",
              ),
            );
          await this._portableUploadStopReset;
          if (this.shouldStop) throw new Error("UPLOAD_ABORTED");
        }
        const imageImportThumbMap = { ...(node.ref_thumbnails || {}) };
        const imageImportInputCount = String(node.ref_file_ids || "")
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean).length;
        const imageImportOriginalIds = node.ref_file_ids;
        emitLog2(
          `[Import] X\u1EED l\xFD ${Object.keys(imageImportThumbMap).length} import keys t\u1EEB CDN...`,
        );
        const uploadedImageImport = await window.reuploadMissingFiles(
          imageImportOriginalIds,
          imageImportThumbMap,
          null,
          null,
          { surface: "workflow" },
        );
        const imageImportOutputIds = String(uploadedImageImport || "")
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean);
        const imageImportUploadComplete =
          imageImportOutputIds.length === imageImportInputCount &&
          imageImportOutputIds.every((id) => !isPortableUploadId(id));
        if (!imageImportUploadComplete) {
          console.warn(
            "[WorkflowExecutor][ImportUpload] unverified result; preserving source refs for retry",
            JSON.stringify({
              nodeId: node.node_id,
              expected: imageImportInputCount,
              received: imageImportOutputIds.length,
              unresolved: imageImportOutputIds.filter((id) =>
                isPortableUploadId(id),
              ).length,
              mediaTypes: Object.values(imageImportThumbMap).map(
                (entry) =>
                  entry?.type || (entry?.video_url ? "video" : "image"),
              ),
            }),
          );
          throw Object.assign(
            new Error(
              `TEMPLATE_MEDIA_UPLOAD_FAILED:${imageImportInputCount - imageImportOutputIds.filter((id) => !isPortableUploadId(id)).length}`,
            ),
            { code: "REF_UPLOAD_FAILED" },
          );
        }
        if (uploadedImageImport !== imageImportOriginalIds) {
          emitLog2(
            `[Import] Upload th\xE0nh c\xF4ng: ${uploadedImageImport.substring(0, 60)}...`,
          );
          node.ref_file_ids = uploadedImageImport;
          const newImageIdArr = imageImportOutputIds;
          if (!node.ref_file_names) node.ref_file_names = {};
          if (!node.ref_thumbnails) node.ref_thumbnails = {};
          const reuploadDetails = window._lastReuploadTileDetails || {};
          const originalImageIds = imageImportOriginalIds
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean);
          for (const [outputIndex, newId] of newImageIdArr.entries()) {
            const detail = reuploadDetails[newId];
            const sourceInfo =
              imageImportThumbMap[originalImageIds[outputIndex]];
            const isVideoUpload =
              sourceInfo?.type === "video" ||
              !!sourceInfo?.video_url ||
              detail?.type === "video";
            if (detail?.file_name) {
              node.ref_file_names[newId] = detail.file_name;
            } else if (MediaRegistry.getFileName(newId)) {
              node.ref_file_names[newId] = MediaRegistry.getFileName(newId);
            }
            const resolvedThumb =
              detail?.thumbnailUrl || MediaRegistry.getThumb(newId);
            if (resolvedThumb || isVideoUpload) {
              node.ref_thumbnails[newId] = isVideoUpload
                ? {
                    thumbnail: resolvedThumb || "",
                    type: "video",
                    ...(detail?.display_name && {
                      display_name: detail.display_name,
                    }),
                    ...(detail?.video_url && { video_url: detail.video_url }),
                    ...(detail?.file_name && { file_name: detail.file_name }),
                  }
                : detail?.display_name
                  ? {
                      thumbnail: resolvedThumb,
                      type: "image",
                      display_name: detail.display_name,
                    }
                  : resolvedThumb;
            }
          }
          for (const key of Object.keys(imageImportThumbMap)) {
            if (isPortableUploadId(key)) {
              delete node.ref_file_names[key];
              delete node.ref_thumbnails[key];
            }
          }
          window.eventBus?.emit("node:ref_replaced", {
            nodeId: node.node_id,
            oldRefIds: imageImportOriginalIds,
            newRefIds: node.ref_file_ids,
            refFileNames: node.ref_file_names,
            refThumbnails: node.ref_thumbnails,
          });
          try {
            await window.storageManager?.updateNodeStatus(
              this.currentWorkflow.wf_id,
              node.node_id,
              {
                ref_file_ids: node.ref_file_ids,
                ref_thumbnails: node.ref_thumbnails,
                ref_file_names: node.ref_file_names,
              },
            );
            emitLog2("[Import] \u0110\xE3 l\u01B0u ref data v\xE0o storage");
          } catch (e) {
            log("[Import] Failed to persist ref update:", e.message);
          }
        }
      }
    }
    async _executeImageNode(node, emitLog2) {
      emitLog2(
        `[IMAGE] Start: ref_file_ids=${node.ref_file_ids?.substring(0, 40)}`,
      );
      emitLog2(
        `[IMAGE] ref_file_names=${JSON.stringify(node.ref_file_names || {})}`,
      );
      const refIds = node.ref_file_ids
        ? (node.ref_file_ids || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      if (refIds.length === 0) {
        emitLog2(
          "Node h\xECnh \u1EA3nh kh\xF4ng c\xF3 file tham chi\u1EBFu",
          "warning",
        );
        return { fileIds: [], duration: 0 };
      }
      if (!node.ref_thumbnails || Array.isArray(node.ref_thumbnails))
        node.ref_thumbnails = {};
      if (!node.ref_file_names || Array.isArray(node.ref_file_names))
        node.ref_file_names = {};
      const missingThumbIds = refIds.filter((fid) => !node.ref_thumbnails[fid]);
      for (const fid of missingThumbIds) {
        if (typeof MediaRegistry !== "undefined") {
          const mrThumb = MediaRegistry.getThumb?.(fid);
          if (mrThumb) {
            node.ref_thumbnails[fid] = mrThumb;
            emitLog2(
              `[IMAGE] Sync thumb t\u1EEB MediaRegistry: ${fid.substring(0, 12)}`,
            );
          }
          const mrName = MediaRegistry.getFileName?.(fid);
          if (mrName && !node.ref_file_names[fid]) {
            node.ref_file_names[fid] = mrName;
          }
        }
      }
      const stillMissing = refIds.filter((fid) => !node.ref_thumbnails[fid]);
      if (stillMissing.length > 0 && window.MessageBridge?.getThumbnailsByIds) {
        emitLog2(
          `[IMAGE] DOM scan cho ${stillMissing.length} IDs thi\u1EBFu thumbnail...`,
        );
        try {
          const scanResult =
            await window.MessageBridge.getThumbnailsByIds(stillMissing);
          const results = scanResult?.results || {};
          for (const [fileId, info] of Object.entries(results)) {
            if (info?.thumbnail) {
              node.ref_thumbnails[fileId] = { ...info };
              emitLog2(
                `[IMAGE] DOM scan found thumb: ${fileId.substring(0, 12)}`,
              );
            }
            if (info?.file_name && !node.ref_file_names[fileId]) {
              node.ref_file_names[fileId] = info.file_name;
            }
          }
        } catch (scanErr) {
          emitLog2(`[IMAGE] DOM scan failed: ${scanErr.message}`, "warn");
        }
      }
      emitLog2(
        `[IMAGE] ref_thumbnails keys after sync: ${Object.keys(node.ref_thumbnails).join(", ") || "(empty)"}`,
      );
      const oldRefIds = node.ref_file_ids;
      if (
        node.ref_file_ids.split(",").some((id) => {
          const key = id.trim();
          return key.startsWith("upload_") && !isPortableUploadId(key);
        }) &&
        typeof window.uploadPendingFiles === "function"
      ) {
        emitLog2(
          window.I18n?.t("workflow.uploadingLocalImages") ||
            "Uploading local images to Flow...",
          "info",
        );
        node.ref_file_ids = await window.uploadPendingFiles(node.ref_file_ids);
        if (node.ref_file_ids !== oldRefIds) {
          const oldIdArr = String(oldRefIds || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          const newIdArr = (node.ref_file_ids || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          const uploadMapping = window._lastUploadKeyMapping || {};
          for (const field of ["ref_thumbnails", "ref_file_names"]) {
            const current =
              node[field] &&
              typeof node[field] === "object" &&
              !Array.isArray(node[field])
                ? node[field]
                : {};
            const next = {};
            for (const oldId of oldIdArr) {
              const newId =
                uploadMapping[oldId] ||
                (newIdArr.includes(oldId) ? oldId : null);
              if (newId && current[oldId] !== void 0)
                next[newId] = current[oldId];
            }
            for (const [id, value] of Object.entries(current)) {
              if (!oldIdArr.includes(id) && newIdArr.includes(id))
                next[id] = value;
            }
            node[field] = next;
          }
          if (!node.ref_file_names) node.ref_file_names = {};
          for (const newId of newIdArr) {
            if (MediaRegistry.getFileName(newId)) {
              node.ref_file_names[newId] = MediaRegistry.getFileName(newId);
            }
            const freshThumb = MediaRegistry.getThumb(newId);
            if (freshThumb) {
              const previous = node.ref_thumbnails?.[newId];
              node.ref_thumbnails[newId] =
                previous && typeof previous === "object"
                  ? { ...previous, thumbnail: freshThumb }
                  : freshThumb;
            }
          }
          window.eventBus?.emit("node:ref_replaced", {
            nodeId: node.node_id,
            oldRefIds,
            newRefIds: node.ref_file_ids,
            refFileNames: node.ref_file_names,
            refThumbnails: node.ref_thumbnails,
          });
          emitLog2("[Upload] Persisting ref data after local file upload");
          try {
            await window.storageManager?.updateNodeStatus(
              this.currentWorkflow.wf_id,
              node.node_id,
              {
                ref_file_ids: node.ref_file_ids,
                ref_thumbnails: node.ref_thumbnails,
                ref_file_names: node.ref_file_names,
              },
            );
          } catch (e) {
            log("Failed to persist ref update:", e.message);
          }
        }
        if (
          String(node.ref_file_ids || "")
            .split(",")
            .some((id) => {
              const key = id.trim();
              return key.startsWith("upload_") && !isPortableUploadId(key);
            })
        ) {
          const error = new Error("REF_UPLOAD_FAILED");
          error.code = "REF_UPLOAD_FAILED";
          emitLog2(
            "[IMAGE] Local reference upload incomplete; stopping node",
            "error",
          );
          throw error;
        }
      }
      await this._materializePortableImageRefs(node, emitLog2);
      window.MediaRegistry?.applyRefIdentityCorrection?.(
        node,
        node.ref_file_ids,
        node.ref_file_ids,
        void 0,
        { surface: "workflow:image-video-upload", nodeId: node.node_id },
      );
      if (node.ref_file_ids && !node.ref_file_ids.includes("upload_")) {
        const originalImageRefIds = node.ref_file_ids;
        const thumbMap = {
          ...(node.ref_thumbnails || {}),
          ...(node.result_thumbnails || {}),
        };
        const fnMap = {
          ...(node.ref_file_names || {}),
          ...(node.result_file_names || {}),
        };
        if (
          typeof window.correctFileIds === "function" &&
          (Object.keys(thumbMap).length > 0 || Object.keys(fnMap).length > 0)
        ) {
          const beforeCorrect = node.ref_file_ids;
          const { correctedIds, changed, mediaMetadata } =
            await window.correctFileIds(node.ref_file_ids, thumbMap, fnMap);
          window.MediaRegistry?.applyRefIdentityCorrection?.(
            node,
            node.ref_file_ids,
            node.ref_file_ids,
            mediaMetadata,
            { surface: "workflow:image-video", nodeId: node.node_id },
          );
          if (changed) {
            emitLog2(
              "\u0110\xE3 c\u1EADp nh\u1EADt ref image IDs (tile ID thay \u0111\u1ED5i sau reload)",
            );
            node.ref_file_ids = correctedIds;
            const oldIds = String(beforeCorrect || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            const newIds = String(correctedIds || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            if (oldIds.length === newIds.length) {
              for (const field of ["ref_thumbnails", "ref_file_names"]) {
                const current = node[field];
                if (
                  !current ||
                  typeof current !== "object" ||
                  Array.isArray(current)
                )
                  continue;
                const next = { ...current };
                for (let index = 0; index < oldIds.length; index++) {
                  if (oldIds[index] !== newIds[index])
                    delete next[oldIds[index]];
                }
                for (let index = 0; index < oldIds.length; index++) {
                  const oldId = oldIds[index];
                  const newId = newIds[index];
                  if (oldId === newId || current[oldId] === void 0) continue;
                  next[newId] = current[oldId];
                }
                node[field] = next;
              }
            } else {
              emitLog2(
                `[ID correction] Kh\xF4ng re-key metadata v\xEC s\u1ED1 ID \u0111\u1ED5i ${oldIds.length} \u2192 ${newIds.length}`,
                "warning",
              );
            }
            try {
              await window.storageManager?.updateNodeStatus(
                this.currentWorkflow.wf_id,
                node.node_id,
                {
                  ref_file_ids: node.ref_file_ids,
                  ref_thumbnails: node.ref_thumbnails,
                  ref_file_names: node.ref_file_names,
                },
              );
            } catch (e) {
              emitLog2(
                "[ID correction] Kh\xF4ng l\u01B0u \u0111\u01B0\u1EE3c ref data: " +
                  e.message,
                "error",
              );
            }
          } else if (Object.keys(mediaMetadata || {}).length > 0) {
            try {
              await window.storageManager?.updateNodeStatus(
                this.currentWorkflow.wf_id,
                node.node_id,
                {
                  ref_thumbnails: node.ref_thumbnails,
                  ref_file_names: node.ref_file_names,
                },
              );
            } catch (e) {
              emitLog2(
                "[ID correction] Kh\xF4ng l\u01B0u \u0111\u01B0\u1EE3c identity metadata: " +
                  e.message,
                "warning",
              );
            }
          }
        }
        if (typeof window.reuploadMissingFiles === "function") {
          const beforeReupload = node.ref_file_ids;
          const thumbMap2 = {
            ...(node.ref_thumbnails || {}),
            ...(node.result_thumbnails || {}),
          };
          const imageRefFileNamesMap = {
            ...(node.ref_file_names || {}),
            ...(node.result_file_names || {}),
          };
          const updated = await window.reuploadMissingFiles(
            node.ref_file_ids,
            thumbMap2,
            originalImageRefIds,
            imageRefFileNamesMap,
            { surface: "workflow" },
          );
          if (!_sameFileIdList(updated, beforeReupload)) {
            emitLog2(
              "\u0110\xE3 re-upload \u1EA3nh tham chi\u1EBFu b\u1ECB thi\u1EBFu tr\xEAn Flow",
            );
            node.ref_file_ids = updated;
            const oldArr = (beforeReupload || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            const newArr = (updated || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            if (!node.ref_thumbnails) node.ref_thumbnails = {};
            if (!node.ref_file_names) node.ref_file_names = {};
            for (let i = 0; i < oldArr.length && i < newArr.length; i++) {
              if (oldArr[i] !== newArr[i]) {
                if (node.ref_thumbnails[oldArr[i]]) {
                  node.ref_thumbnails[newArr[i]] =
                    node.ref_thumbnails[oldArr[i]];
                  delete node.ref_thumbnails[oldArr[i]];
                }
                if (node.ref_file_names?.[oldArr[i]]) {
                  node.ref_file_names[newArr[i]] =
                    node.ref_file_names[oldArr[i]];
                  delete node.ref_file_names[oldArr[i]];
                }
                const reupDetails = window._lastReuploadTileDetails || {};
                const reupDetail = reupDetails[newArr[i]];
                const newThumb =
                  reupDetail?.thumbnailUrl || MediaRegistry.getThumb(newArr[i]);
                const newFileName =
                  reupDetail?.file_name || MediaRegistry.getFileName(newArr[i]);
                emitLog2(
                  `[Reupload] ${oldArr[i]} \u2192 ${newArr[i]}, file_name=${newFileName || "NULL"}`,
                );
                if (newThumb) {
                  node.ref_thumbnails[newArr[i]] =
                    reupDetail?.type === "video"
                      ? {
                          thumbnail: newThumb,
                          type: "video",
                          ...(reupDetail?.video_url && {
                            video_url: reupDetail.video_url,
                          }),
                          ...(newFileName && { file_name: newFileName }),
                        }
                      : newThumb;
                }
                if (newFileName) {
                  node.ref_file_names[newArr[i]] = newFileName;
                } else {
                  emitLog2(
                    `[Reupload] WARNING: No file_name for ${newArr[i]} - may reupload again next run`,
                    "warning",
                  );
                }
              }
            }
            emitLog2(
              `[Persist] Saving ref data: ids=${node.ref_file_ids}, names=${JSON.stringify(node.ref_file_names)}`,
            );
            try {
              await window.storageManager?.updateNodeStatus(
                this.currentWorkflow.wf_id,
                node.node_id,
                {
                  ref_file_ids: node.ref_file_ids,
                  ref_thumbnails: node.ref_thumbnails,
                  ref_file_names: node.ref_file_names,
                },
              );
              emitLog2("[Persist] Ref data saved successfully");
            } catch (e) {
              emitLog2(
                "[Persist] FAILED to save ref data: " + e.message,
                "error",
              );
            }
            window.eventBus?.emit("node:ref_replaced", {
              nodeId: node.node_id,
              oldRefIds: beforeReupload,
              newRefIds: node.ref_file_ids,
              refFileNames: node.ref_file_names,
              refThumbnails: node.ref_thumbnails,
            });
          }
        }
      }
      const finalIds = (node.ref_file_ids || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (finalIds.length === 0) {
        emitLog2(
          "Kh\xF4ng th\u1EC3 t\xECm l\u1EA1i \u1EA3nh tham chi\u1EBFu tr\xEAn Flow",
          "warning",
        );
      } else {
        emitLog2(
          `Truy\u1EC1n ${finalIds.length} h\xECnh tham chi\u1EBFu cho node ti\u1EBFp theo`,
        );
      }
      node.result_file_ids = node.ref_file_ids;
      node.result_thumbnails = { ...(node.ref_thumbnails || {}) };
      node.result_file_names = { ...(node.ref_file_names || {}) };
      const imageFileNames = {
        ...(node.ref_file_names || {}),
        ...(node.result_file_names || {}),
      };
      return {
        fileIds: finalIds,
        fileNames: imageFileNames,
        thumbnails: { ...node.result_thumbnails },
        duration: 0,
      };
    }
    _resolveRefThumb(node, fid) {
      const rt = node.ref_thumbnails?.[fid];
      const direct = resolveWorkflowImagePreview(rt);
      if (direct) return direct;
      if (window.GenTab?.thumbnailCache?.[fid])
        return window.GenTab.thumbnailCache[fid];
      if (typeof MediaRegistry !== "undefined" && MediaRegistry.getThumb?.(fid))
        return MediaRegistry.getThumb(fid);
      {
        const _tcThumb = getThumbCache()?.get(fid)?.thumbnail;
        if (_tcThumb) return _tcThumb;
      }
      return "";
    }
    _allRefsResolvableFromThumbnail(node) {
      const ids = (node.ref_file_ids || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (ids.length === 0) return false;
      return ids.every((fid) => !!this._resolveRefThumb(node, fid));
    }
    _sourceRefsHaveThumbnail(sourceNode) {
      const ids =
        sourceNode?.node_type === "image"
          ? this._getImageSourceIds(sourceNode, false)
          : String(sourceNode?.result_file_ids || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
      if (ids.length === 0) return false;
      const thumbs = {
        ...(sourceNode.result_thumbnails || {}),
        ...(sourceNode.ref_thumbnails || {}),
      };
      return ids.every((id) => !!resolveWorkflowImagePreview(thumbs[id]));
    }
    _providerCanMaterializeUpstreamRefs(node, workflow2, inputEdges = null) {
      if (!["chatgpt", "gemini"].includes(node?.node_type || node?.type))
        return false;
      const edges = Array.isArray(inputEdges)
        ? inputEdges
        : (workflow2?.edges || []).filter(
            (edge) => edge.target_node_id === node.node_id,
          );
      let mediaSourceCount = 0;
      for (const edge of edges) {
        if (isLastFramePort(edge.source_port)) return false;
        const source = (workflow2?.nodes || []).find(
          (candidate) => candidate.node_id === edge.source_node_id,
        );
        if (!source) continue;
        const ids =
          (source.node_type || source.type) === "image"
            ? this._getImageSourceIds(source, false)
            : String(source.result_file_ids || "")
                .split(",")
                .map((id) => id.trim())
                .filter(Boolean);
        if (ids.length === 0) continue;
        mediaSourceCount += ids.length;
        if (!this._sourceRefsHaveThumbnail(source)) return false;
      }
      return mediaSourceCount > 0;
    }
    _isLastFrameFresh(sourceNode) {
      const videoIds = String(sourceNode?.result_file_ids || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const frameIds = String(sourceNode?.result_frame_file_ids || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!videoIds.length || frameIds.length !== 1) return false;
      const frameEntry = sourceNode?.result_frame_thumbnails?.[frameIds[0]];
      if (
        !frameEntry ||
        typeof frameEntry !== "object" ||
        !frameEntry.source_file_id
      )
        return false;
      const currentId = videoIds[0];
      const records = [
        sourceNode.result_thumbnails?.[currentId],
        sourceNode.result_provider_urls?.[currentId],
      ].filter(
        (record) =>
          record && typeof record === "object" && !Array.isArray(record),
      );
      const aliases = [
        currentId,
        sourceNode.result_file_names?.[currentId],
        ...records.flatMap((record) => [
          record.media_uuid,
          record.persistent_media_id,
          record.file_name,
          ...(Array.isArray(record.identity_aliases)
            ? record.identity_aliases
            : []),
        ]),
      ];
      const identity = (value) => {
        if (typeof value !== "string") return "";
        const id = value.trim();
        return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)
          ? id.toLowerCase()
          : id;
      };
      const sourceId = identity(frameEntry.source_file_id);
      return (
        !!sourceId && aliases.some((alias) => identity(alias) === sourceId)
      );
    }
    async _executeGeminiNode(node, workflow2, emitLog2, nodeAccum = null) {
      this._assertWorkflowNotStopped();
      const startedAt = Date.now();
      if (!window.featureGate?.canUse?.("gemini_enabled")) {
        throw Object.assign(new Error("Gemini feature is not enabled"), {
          code: "FEATURE_LOCKED",
        });
      }
      const adapter = window.ProviderRegistry?.get?.("gemini");
      if (!adapter)
        throw Object.assign(new Error("Gemini adapter is not available"), {
          code: "ADAPTER_NOT_AVAILABLE",
        });
      const preflight = await this._tracePreparationStage(
        node,
        "provider_preflight",
        () => this._preflightProviderTab("gemini", emitLog2),
        emitLog2,
      );
      this._assertWorkflowNotStopped();
      if (!preflight?.ready && preflight?.error !== "PREFLIGHT_TIMEOUT") {
        window.eventBus?.emit?.("gemini:login_required", {
          error: preflight?.error || "NOT_LOGGED_IN",
        });
        throw Object.assign(new Error(preflight?.error || "NOT_LOGGED_IN"), {
          code: preflight?.error || "NOT_LOGGED_IN",
        });
      }
      if (!["Image", "Video"].includes(node.media_type)) {
        throw Object.assign(
          new Error(
            `Invalid Gemini media type: ${node.media_type || "(empty)"}`,
          ),
          { code: "CONFIG_UNAVAILABLE" },
        );
      }
      const mediaType = node.media_type === "Video" ? "video" : "image";
      const requestedRefCount = String(node.ref_file_ids || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean).length;
      const configuredRefCap = Number(
        adapter.getMaxRefImages?.({ mode: mediaType }),
      );
      if (
        requestedRefCount > 0 &&
        (!Number.isFinite(configuredRefCap) || configuredRefCap <= 0)
      ) {
        throw Object.assign(new Error("Gemini reference config missing"), {
          code: "CONFIG_UNAVAILABLE",
        });
      }
      if (requestedRefCount > configuredRefCap) {
        throw Object.assign(
          new Error(
            `Gemini reference limit exceeded (${requestedRefCount}/${configuredRefCap})`,
          ),
          { code: "REF_LIMIT_EXCEEDED" },
        );
      }
      if (
        requestedRefCount > 0 &&
        !window.featureGate?.canUseProviderRefImages?.("gemini")
      ) {
        throw Object.assign(
          new Error("Gemini reference images are not enabled"),
          { code: "FEATURE_LOCKED" },
        );
      }
      const refs = await this._tracePreparationStage(
        node,
        "materialize_refs",
        () => this._resolveRefImagesForLLM(node, adapter),
        emitLog2,
      );
      this._assertWorkflowNotStopped();
      if (refs.length < requestedRefCount) {
        throw Object.assign(
          new Error(
            `Gemini reference materialization incomplete (${refs.length}/${requestedRefCount})`,
          ),
          { code: "REF_UPLOAD_FAILED" },
        );
      }
      const availableModels =
        window.ModelRegistry?.safeGetModelsSync?.("gemini", mediaType) || [];
      const model =
        node.model ||
        availableModels.find((item) => item?.is_default)?.value ||
        null;
      if (!model)
        throw Object.assign(new Error("Gemini model config missing"), {
          code: "MODEL_CONFIG_MISSING",
        });
      if (
        !availableModels.some((item) => String(item?.value) === String(model))
      ) {
        throw Object.assign(
          new Error(`Gemini model is not available: ${model}`),
          { code: "MODEL_CONFIG_MISSING" },
        );
      }
      const availableRatios =
        window.ProviderConfigManager?.safeGetRatiosSync?.(
          "gemini",
          mediaType,
        ) || [];
      const ratioValues = availableRatios
        .map((item) => String(typeof item === "string" ? item : item?.value))
        .filter(Boolean);
      const ratio =
        node.ratio ||
        availableRatios.find((item) => item?.is_default)?.value ||
        null;
      if (!ratio || !ratioValues.includes(String(ratio))) {
        throw Object.assign(
          new Error(
            `Gemini ratio config missing or invalid: ${ratio || "(empty)"}`,
          ),
          { code: "RATIO_CONFIG_MISSING" },
        );
      }
      let token = null;
      try {
        if (window.ExecutionGate) {
          const gate = await this._tracePreparationStage(
            node,
            "execution_permission",
            () =>
              window.ExecutionGate.request("gemini_run", 1, {
                owner: "workflow",
                label: workflow2?.wf_name || "gemini_node",
                provider: "gemini",
                media_type: mediaType,
                has_ref: refs.length > 0,
                ref_count: refs.length,
                parent_workflow_token: this._currentExecutionToken || null,
              }),
            emitLog2,
          );
          if (!gate?.allowed)
            throw Object.assign(new Error(gate?.reason || "QUOTA_EXCEEDED"), {
              code: gate?.reason || "QUOTA_EXCEEDED",
            });
          token = gate.token;
        }
        this._assertWorkflowNotStopped();
        this._updateGeminiWorkflowTracker(node, "MONITORING");
        emitNodePhase(node.node_id, "generating");
        const result = await adapter.submit({
          prompt: node._resolvedPrompt || node.prompt || "",
          mediaType,
          model,
          ratio,
          refs,
          shouldStop: () => this.shouldStop,
          timeout: node.timeout_ms || void 0,
          runId: `workflow-gemini-${node.node_id}-${Date.now()}`,
          settings: {
            source: "workflow",
            workflowId: workflow2?.wf_id,
            nodeId: node.node_id,
          },
        });
        this._assertWorkflowNotStopped();
        this._updateGeminiWorkflowTracker(node, "DOWNLOADING");
        const items = Array.isArray(result?.results) ? result.results : [];
        if (items.length === 0)
          throw Object.assign(new Error("Gemini returned no media"), {
            code: "MEDIA_EMPTY",
          });
        emitNodePhase(node.node_id, "downloading");
        const fileIds = [];
        const thumbnails = {};
        const runtimeThumbnails = {};
        const fileNames = {};
        const providerUrls = {};
        const geminiTabId = result.tabId || preflight.tabId;
        const conversationUrl = await chrome.tabs
          .get(geminiTabId)
          .then((tab) => tab.url)
          .catch(() => null);
        const monitor = window.ProviderConfigManager?.getApiConfigValueSync?.(
          "gemini",
          "generation_monitor",
        )?.[mediaType];
        const maxMaterializedBytes = Number(monitor?.max_materialized_bytes);
        const uploadRunStamp = Date.now();
        for (let index = 0; index < items.length; index++) {
          const item = items[index];
          let id = `gemini_${node.node_id}_${uploadRunStamp}_${index}`;
          const ext = mediaType === "video" ? "mp4" : "png";
          const name = `gemini-${node.node_id}-${index + 1}.${ext}`;
          const persistedUrl =
            mediaType === "video"
              ? String(item.url || "")
              : item.sourceUrl ||
                (String(item.url || "").startsWith("data:") ? null : item.url);
          if (!persistedUrl) {
            throw Object.assign(
              new Error("Gemini result source URL is unavailable"),
              { code: "MEDIA_FETCH_FAILED" },
            );
          }
          let flowThumbnail = "";
          let flowFileName = name;
          if (mediaType === "image") {
            if (
              !Number.isFinite(maxMaterializedBytes) ||
              maxMaterializedBytes <= 0
            ) {
              throw Object.assign(
                new Error("Gemini materialization config missing"),
                { code: "MONITOR_CONFIG_MISSING" },
              );
            }
            emitNodePhase(node.node_id, "uploading");
            emitLog2(
              `[Gemini Bridge] ${index + 1}/${items.length}: uploading result to Flow...`,
            );
            const bridge = await window.MessageBridge?.geminiBridgeToFlow?.({
              url: item.url,
              tabId: geminiTabId,
              fileName: name,
              maxBytes: maxMaterializedBytes,
              prefetchedDataUrl: String(item.url || "").startsWith("data:")
                ? item.url
                : null,
            });
            if (bridge?.success && bridge.tileId) {
              id = bridge.tileId;
              flowThumbnail = bridge.thumbnailUrl || "";
              flowFileName =
                bridge.fileName || extractFileNameFromUrl(flowThumbnail) || "";
              emitLog2(
                `[Gemini Bridge] ${index + 1}/${items.length}: tileId=${id.substring(0, 16)}`,
                "success",
              );
            } else {
              emitLog2(
                `[Gemini Bridge] ${index + 1}/${items.length}: ${bridge?.error || "UPLOAD_FAILED"} \u2014 gi\u1EEF synthetic result`,
                "warn",
              );
            }
          } else {
            emitLog2(
              "[Gemini Bridge] Video result gi\u1EEF provider-native v\xEC Flow kh\xF4ng h\u1ED7 tr\u1EE3 video upload",
            );
          }
          fileIds.push(id);
          const durableThumbnail =
            flowThumbnail ||
            (item.thumbnail && !String(item.thumbnail).startsWith("data:")
              ? item.thumbnail
              : persistedUrl);
          thumbnails[id] = {
            thumbnail: durableThumbnail,
            type: mediaType,
            video_url: mediaType === "video" ? persistedUrl : void 0,
            file_name: flowFileName,
            mime_type:
              item.mimeType ||
              (mediaType === "video" ? "video/mp4" : "image/png"),
            provider: "gemini",
          };
          runtimeThumbnails[id] = {
            ...thumbnails[id],
            thumbnail:
              flowThumbnail || item.thumbnail || item.url || persistedUrl,
            video_url:
              mediaType === "video" ? item.url || persistedUrl : void 0,
          };
          fileNames[id] = flowFileName;
          providerUrls[id] = {
            url: persistedUrl,
            provider: "gemini",
            media_type: mediaType,
            tab_id: geminiTabId,
            fingerprint: item.fingerprint || null,
            captured_at: Date.now(),
          };
        }
        node.result_file_ids = fileIds.join(", ");
        node.result_thumbnails = {
          ...(node.result_thumbnails || {}),
          ...thumbnails,
        };
        node.result_file_names = {
          ...(node.result_file_names || {}),
          ...fileNames,
        };
        node.result_provider_urls = {
          ...(node.result_provider_urls || {}),
          ...providerUrls,
        };
        if (nodeAccum) {
          Object.assign(nodeAccum.thumbnails, thumbnails);
          Object.assign(nodeAccum.fileNames, fileNames);
        }
        if (typeof MediaRegistry !== "undefined") {
          for (const id of fileIds) {
            const thumb =
              runtimeThumbnails[id]?.thumbnail || thumbnails[id]?.thumbnail;
            if (thumb) MediaRegistry.setThumb?.(id, thumb);
            if (fileNames[id]) MediaRegistry.setFileName?.(id, fileNames[id]);
          }
        }
        emitLog2(`[Gemini] result IDs: ${fileIds.join(", ")}`);
        await window.ExecutionGate?.complete?.(token, "success").catch(
          () => {},
        );
        token = null;
        return {
          success: true,
          fileIds,
          thumbnails,
          runtimeThumbnails,
          fileNames,
          providerUrls,
          mediaType,
          geminiItems: items,
          geminiTabId,
          conversationUrl,
          flowUploadComplete:
            fileIds.length === items.length &&
            fileIds.every((id) => !String(id).startsWith("gemini_")),
          duration: Date.now() - startedAt,
        };
      } catch (error) {
        if (token)
          await window.ExecutionGate?.complete?.(
            token,
            error?.code === "ABORTED" ? "cancelled" : "failed",
          ).catch(() => {});
        throw error;
      }
    }
    async _executeMuseNode(node, workflow2, emitLog2, nodeAccum = null) {
      this._assertWorkflowNotStopped();
      if (!window.featureGate?.canUse?.("muse_enabled"))
        throw Object.assign(new Error("Muse feature is not enabled"), {
          code: "FEATURE_LOCKED",
        });
      const adapter = window.ProviderRegistry?.get?.("muse");
      if (!adapter)
        throw Object.assign(new Error("Muse adapter is not available"), {
          code: "ADAPTER_NOT_AVAILABLE",
        });
      const mediaType = node.media_type === "Video" ? "video" : "image";
      let models =
        window.ModelRegistry?.safeGetModelsSync?.("muse", mediaType) || [];
      if (!models.length && window.ModelRegistry?.getModels) {
        models = await window.ModelRegistry.getModels("muse", mediaType);
        this._assertWorkflowNotStopped();
      }
      const model =
        node.model ||
        models.find((item) => item?.is_default)?.value ||
        models[0]?.value ||
        null;
      if (
        !model ||
        !models.some(
          (item) => String(item?.value || item?.name) === String(model),
        )
      )
        throw Object.assign(new Error("Muse model config missing"), {
          code: "MODEL_CONFIG_MISSING",
        });
      const ratios =
        window.ProviderConfigManager?.safeGetRatiosSync?.("muse", mediaType) ||
        [];
      const ratio =
        node.ratio || ratios.find((item) => item?.is_default)?.value || null;
      if (
        !ratio ||
        !ratios.some(
          (item) =>
            String(typeof item === "string" ? item : item?.value) ===
            String(ratio),
        )
      )
        throw Object.assign(new Error("Muse ratio config missing or invalid"), {
          code: "RATIO_CONFIG_MISSING",
        });
      const requestedRefCount = String(node.ref_file_ids || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean).length;
      const maxRefs = Number(
        adapter.getMaxRefImages?.({ mode: mediaType, modelValue: model }),
      );
      if (
        requestedRefCount > 0 &&
        (!Number.isFinite(maxRefs) ||
          maxRefs <= 0 ||
          requestedRefCount > maxRefs)
      )
        throw Object.assign(new Error("Muse reference limit/config invalid"), {
          code: "REF_LIMIT_EXCEEDED",
        });
      if (
        requestedRefCount > 0 &&
        !window.featureGate?.canUseProviderRefImages?.("muse")
      )
        throw Object.assign(
          new Error("Muse reference images are not enabled"),
          { code: "FEATURE_LOCKED" },
        );
      const refs = await this._tracePreparationStage(
        node,
        "materialize_refs",
        () => this._resolveRefImagesForLLM(node, adapter),
        emitLog2,
      );
      if (refs.length < requestedRefCount)
        throw Object.assign(
          new Error(
            `Muse reference materialization incomplete (${refs.length}/${requestedRefCount})`,
          ),
          { code: "REF_UPLOAD_FAILED" },
        );
      let token = null;
      try {
        const gate = await window.ExecutionGate?.request?.("muse_run", 1, {
          owner: "workflow",
          label: workflow2?.wf_name || "muse_node",
          provider: "muse",
          media_type: mediaType,
          has_ref: refs.length > 0,
          ref_count: refs.length,
          parent_workflow_token: this._currentExecutionToken || null,
        });
        if (window.ExecutionGate && !gate?.allowed)
          throw Object.assign(new Error(gate?.reason || "QUOTA_EXCEEDED"), {
            code: gate?.reason || "QUOTA_EXCEEDED",
          });
        token = gate?.token || null;
        emitNodePhase(node.node_id, "generating");
        const prompt =
          node._effective_prompt ??
          this._resolveEffectivePrompt(node, workflow2).text;
        console.info(
          "[MuseWorkflowPromptAudit]",
          JSON.stringify({
            nodeId: node.node_id,
            promptSource: node.prompt_source || null,
            promptChars: prompt.length,
            nodePromptChars: String(node.prompt || "").length,
            effectivePromptChars: String(node._effective_prompt || "").length,
          }),
        );
        const result = await adapter.submit({
          prompt,
          refs,
          settings: { mode: mediaType, ratio, model, autoDownload: false },
          taskName: workflow2?.wf_name || null,
          shouldStop: () => this.shouldStop,
        });
        this._assertWorkflowNotStopped();
        if (
          !result?.success ||
          !Array.isArray(result.mediaUrls) ||
          !result.mediaUrls.length
        ) {
          const errorCode = result?.error || "MUSE_MEDIA_EMPTY";
          const providerMessage =
            typeof result?.message === "string" ? result.message.trim() : "";
          console.warn(
            "[MuseWorkflowSubmit]",
            JSON.stringify({
              nodeId: node.node_id,
              error: errorCode,
              message: providerMessage || null,
              diagnostic: result?.diagnostic || null,
            }),
          );
          throw Object.assign(new Error(providerMessage || errorCode), {
            code: errorCode,
            providerMessage: providerMessage || null,
            noRetry: result?.noRetry === true,
          });
        }
        const fileIds = [],
          thumbnails = {},
          runtimeThumbnails = {},
          fileNames = {},
          providerUrls = {};
        const uploadVideoToFlow = node.muse_upload_video_to_flow !== false;
        let flowUploadComplete = true;
        const resultMediaType =
          result.mediaType === "video" ? "video" : mediaType;
        const stamp = Date.now();
        const tabId = result.tabId;
        for (let index = 0; index < result.mediaUrls.length; index++) {
          const url = String(result.mediaUrls[index] || "");
          const fetched = result.fetchedMedia?.find((item) => item.url === url);
          let id = `muse_${node.node_id}_${stamp}_${index}`;
          let thumbnail =
            resultMediaType === "video"
              ? fetched?.poster || ""
              : fetched?.base64 || url;
          let fileName = "";
          let flowBridge = null;
          if (
            resultMediaType === "image" &&
            typeof fetched?.base64 === "string" &&
            fetched.base64.startsWith("data:image/")
          ) {
            emitNodePhase(node.node_id, "uploading");
            const match = fetched.base64.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              const uploaded = await window.MessageBridge?.uploadFilesToFlow?.(
                [
                  {
                    name: `muse-${node.node_id}-${index + 1}.jpg`,
                    type: match[1],
                    base64: match[2],
                  },
                ],
                { surface: "workflow" },
              );
              const detail = uploaded?.tileDetails?.[0];
              if (detail?.id) {
                id = detail.id;
                thumbnail = detail.thumbnailUrl || thumbnail;
                fileName = detail.file_name || "";
                emitLog2(
                  `[Muse Bridge] ${index + 1}: uploaded to Flow`,
                  "success",
                );
              } else {
                flowUploadComplete = false;
                emitLog2(
                  `[Muse Bridge] ${index + 1}: Flow upload unavailable; keeping provider result`,
                  "warn",
                );
              }
            } else {
              flowUploadComplete = false;
              emitLog2(
                `[Muse Bridge] ${index + 1}: invalid image bytes; keeping provider result`,
                "warn",
              );
            }
          } else if (resultMediaType === "image") {
            flowUploadComplete = false;
            emitLog2(
              `[Muse Bridge] ${index + 1}: image bytes unavailable; keeping provider result`,
              "warn",
            );
          }
          if (resultMediaType === "video" && uploadVideoToFlow) {
            emitNodePhase(node.node_id, "uploading");
            flowBridge = await window.MessageBridge?.museVideoBridgeToFlow?.({
              url,
              tabId,
              fileName: `muse-${node.node_id}-${index + 1}.mp4`,
            });
            if (flowBridge?.success && flowBridge.tileId) {
              id = flowBridge.tileId;
              thumbnail = flowBridge.thumbnailUrl || "";
              fileName = flowBridge.fileName || "";
              emitLog2(
                `[Muse Bridge] ${index + 1}: video uploaded to Flow`,
                "success",
              );
            } else {
              flowUploadComplete = false;
              console.warn(
                "[MuseVideoFlowBridge]",
                JSON.stringify({
                  nodeId: node.node_id,
                  index: index + 1,
                  error:
                    flowBridge?.error || "MUSE_VIDEO_FLOW_BRIDGE_NO_RESPONSE",
                  message: flowBridge?.message || null,
                }),
              );
              emitLog2(
                `[Muse Bridge] ${index + 1}: video Flow upload unavailable (${flowBridge?.error || "unknown"}); keeping source-tab route`,
                "warn",
              );
            }
          }
          const hasFlowVideo =
            resultMediaType === "video" &&
            flowBridge?.success &&
            flowBridge.tileId;
          if (resultMediaType === "video" && !uploadVideoToFlow)
            flowUploadComplete = false;
          const flowUploadError =
            resultMediaType === "video" && uploadVideoToFlow && !hasFlowVideo
              ? String(flowBridge?.error || "MUSE_VIDEO_FLOW_UPLOAD_FAILED")
              : "";
          const persistedThumbnail =
            resultMediaType === "video"
              ? hasFlowVideo &&
                typeof thumbnail === "string" &&
                !/^(?:blob:|data:)/i.test(thumbnail)
                ? thumbnail
                : ""
              : thumbnail;
          thumbnails[id] = {
            thumbnail: persistedThumbnail,
            type: resultMediaType,
            file_name: fileName,
            provider: hasFlowVideo ? "flow" : "muse",
            ...(hasFlowVideo &&
            flowBridge.videoUrl &&
            !/^(?:blob:|data:)/i.test(flowBridge.videoUrl)
              ? { video_url: flowBridge.videoUrl }
              : {}),
            ...(hasFlowVideo && flowBridge.media_uuid
              ? { media_uuid: flowBridge.media_uuid }
              : {}),
            ...(hasFlowVideo && flowBridge.api_driver
              ? { api_driver: flowBridge.api_driver }
              : {}),
            ...(flowUploadError
              ? {
                  flow_upload_status: "failed",
                  flow_upload_error: flowUploadError,
                }
              : {}),
          };
          runtimeThumbnails[id] =
            resultMediaType === "video"
              ? {
                  ...thumbnails[id],
                  thumbnail,
                  thumb_is_poster: !!thumbnail,
                  ...(!hasFlowVideo && /^blob:/i.test(url)
                    ? { muse_blob_url: url }
                    : {}),
                }
              : thumbnails[id];
          fileIds.push(id);
          fileNames[id] = fileName;
          if (id.startsWith("muse_")) {
            this._museRuntimeResults || (this._museRuntimeResults = new Map());
            this._museRuntimeResults.set(id, {
              provider: "muse",
              url,
              media_type: resultMediaType,
              tab_id: tabId,
              base64: fetched?.base64,
            });
          }
          providerUrls[id] = hasFlowVideo
            ? {
                url: flowBridge.videoUrl || persistedThumbnail || "",
                provider: "flow",
                source_provider: "muse",
                media_type: "video",
                media_uuid: flowBridge.media_uuid || null,
                persistent_media_id: flowBridge.persistent_media_id || null,
                identity_kind: flowBridge.identity_kind || null,
                identity_durability: flowBridge.identity_durability || null,
                api_driver: flowBridge.api_driver || null,
                project_id: flowBridge.project_id || null,
                captured_at: Date.now(),
              }
            : {
                provider: "muse",
                media_type: resultMediaType,
                tab_id: tabId,
                captured_at: Date.now(),
                ...(flowUploadError
                  ? {
                      flow_upload_status: "failed",
                      flow_upload_error: flowUploadError,
                    }
                  : {}),
              };
        }
        node.result_file_ids = fileIds.join(", ");
        node.result_thumbnails = {
          ...(node.result_thumbnails || {}),
          ...thumbnails,
        };
        node.result_file_names = {
          ...(node.result_file_names || {}),
          ...fileNames,
        };
        node.result_provider_urls = {
          ...(node.result_provider_urls || {}),
          ...providerUrls,
        };
        if (nodeAccum) {
          Object.assign(nodeAccum.thumbnails, thumbnails);
          Object.assign(nodeAccum.fileNames, fileNames);
        }
        if (typeof MediaRegistry !== "undefined")
          for (const id of fileIds) {
            if (thumbnails[id]?.thumbnail)
              MediaRegistry.setThumb?.(id, thumbnails[id].thumbnail);
            if (fileNames[id]) MediaRegistry.setFileName?.(id, fileNames[id]);
          }
        await window.ExecutionGate?.complete?.(token, "success").catch(
          () => {},
        );
        token = null;
        return {
          success: true,
          fileIds,
          thumbnails,
          runtimeThumbnails,
          fileNames,
          providerUrls,
          mediaType: resultMediaType,
          museResult: result,
          museTabId: tabId,
          flowUploadComplete,
          duration: 0,
        };
      } catch (error) {
        if (token)
          await window.ExecutionGate?.complete?.(
            token,
            error?.code === "ABORTED" ? "cancelled" : "failed",
          ).catch(() => {});
        throw error;
      }
    }
    async _runOptionalProviderStep(provider, action, reportWarning) {
      try {
        await action();
      } catch (error) {
        const message = `${provider} post-generation warning: ${error?.message || "unavailable"}`;
        console.warn("[WorkflowProviderCleanup]", message);
        try {
          reportWarning?.(message);
        } catch (_) {}
      }
    }
    async _completeChatGPTDownload(node, workflow2, result, emitLog2) {
      const imageUrls = result.chatgptImageUrls || [];
      const cgTabId = result.cleanupTabId;
      let cleanupDownloadsOk = true;
      try {
        const canUseAutoDownload =
          window.featureGate?.canUse("auto_download") ?? false;
        const nodeAutoDownload =
          canUseAutoDownload &&
          (node.auto_download === true ||
            node.auto_download === "1" ||
            node.auto_download === 1);
        if (nodeAutoDownload && imageUrls.length > 0 && cgTabId) {
          emitLog2(
            `Auto-download ${imageUrls.length} \u1EA3nh ChatGPT (background)...`,
          );
          const downloads = (async () => {
            try {
              const _wfCgDl = await window.DownloadHelper.getSettings();
              const _wfCgDownloadFolder = _wfCgDl.folder;
              const _wfCgDownloadTemplate = _wfCgDl.template;
              for (let urlIdx = 0; urlIdx < imageUrls.length; urlIdx++) {
                const url = imageUrls[urlIdx];
                let downloaded = false;
                window.eventBus?.emit?.("workflow:download", {
                  workflowId: workflow2?.wf_id,
                  nodeId: node.node_id,
                  nodeName: node.node_name,
                  key: `chatgpt:${urlIdx}`,
                  index: urlIdx + 1,
                  total: imageUrls.length,
                  stage: "started",
                });
                try {
                  const fetchResp =
                    await window.MessageBridge?.chatGPTFetchImage?.(
                      url,
                      cgTabId,
                    );
                  if (fetchResp?.success && fetchResp.base64) {
                    const blob = await (await fetch(fetchResp.base64)).blob();
                    const blobUrl = URL.createObjectURL(blob);
                    const filename = window.DownloadHelper.buildFilename({
                      template: _wfCgDownloadTemplate,
                      project: _wfCgDl.project || window._currentProjectName,
                      prompt: node.prompt || "",
                      index: urlIdx + 1,
                      taskName: workflow2?.wf_name,
                      folder: _wfCgDownloadFolder,
                      ext: "png",
                    });
                    const dlResp = await new Promise((resolve) => {
                      chrome.runtime.sendMessage(
                        {
                          action: "chromeDownload",
                          url: blobUrl,
                          filename,
                          waitForComplete: true,
                          waitTimeoutMs: 12e4,
                        },
                        (r) => resolve(r),
                      );
                    });
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 3e4);
                    if (!dlResp?.success) cleanupDownloadsOk = false;
                    downloaded = dlResp?.success === true;
                    if (!dlResp?.success)
                      emitLog2(
                        `ChatGPT download fail: ${dlResp?.error || "unknown"}`,
                        "warn",
                      );
                  } else {
                    cleanupDownloadsOk = false;
                    emitLog2(
                      `ChatGPT fetchImage fail: ${fetchResp?.error || "unknown"}`,
                      "warn",
                    );
                  }
                } catch (dlErr) {
                  cleanupDownloadsOk = false;
                  emitLog2(
                    `ChatGPT auto-download l\u1ED7i: ${dlErr.message}`,
                    "warn",
                  );
                } finally {
                  window.eventBus?.emit?.("workflow:download", {
                    workflowId: workflow2?.wf_id,
                    nodeId: node.node_id,
                    nodeName: node.node_name,
                    key: `chatgpt:${urlIdx}`,
                    index: urlIdx + 1,
                    total: imageUrls.length,
                    stage: downloaded ? "completed" : "failed",
                  });
                }
              }
              emitLog2(`Auto-download ChatGPT ho\xE0n t\u1EA5t`, "success");
            } catch (e) {
              cleanupDownloadsOk = false;
              emitLog2(`Auto-download ChatGPT bg error: ${e.message}`, "error");
            }
          })().catch(() => {
            cleanupDownloadsOk = false;
          });
          await downloads;
        }
      } finally {
        result.cleanupDownloadsOk = cleanupDownloadsOk;
      }
    }
    async _completeChatGPTPostPersist(node, result, emitLog2) {
      if (node.node_type !== "chatgpt") return;
      try {
        await this._completeChatGPTDownload(
          node,
          this.currentWorkflow,
          result,
          emitLog2,
        );
      } catch (error) {
        result.cleanupDownloadsOk = false;
        emitLog2(
          `ChatGPT auto-download warning: ${error?.message || "unavailable"}`,
          "warn",
        );
      }
      const enabled = node.chatgpt_delete_after_gen === true;
      console.log(
        "[WorkflowProviderCleanup] decision",
        JSON.stringify({
          nodeId: node.node_id,
          provider: "chatgpt",
          enabled,
          flowUploadComplete: result.flowUploadComplete === true,
          downloadsOk: result.cleanupDownloadsOk === true,
          hasConversation: !!result.conversationUrl,
          hasTab: !!result.cleanupTabId,
          stopped: this.shouldStop === true,
        }),
      );
      if (!enabled) return;
      await this._deleteGeneratedProviderChat(
        "chatgpt",
        result.cleanupTabId,
        result.conversationUrl,
        result.flowUploadComplete === true &&
          result.cleanupDownloadsOk === true,
        emitLog2,
        node,
      );
    }
    async _deleteGeneratedProviderChat(
      provider,
      tabId,
      conversationUrl,
      uploaded,
      emitLog2,
      node,
    ) {
      if (!uploaded || !tabId || !conversationUrl || this.shouldStop) {
        emitLog2(
          `${provider} cleanup skipped: Flow upload or conversation identity not confirmed`,
          "warn",
        );
        return;
      }
      try {
        const wfId = this.currentWorkflow?.wf_id;
        if (
          !wfId ||
          !node?.node_id ||
          !window.storageManager?.updateNodeStatus
        ) {
          emitLog2(
            `${provider} cleanup skipped: result checkpoint unavailable`,
            "warn",
          );
          return;
        }
        await window.storageManager.updateNodeStatus(wfId, node.node_id, {
          result_file_ids: node.result_file_ids,
          result_file_names: node.result_file_names,
        });
        const tab = await chrome.tabs.get(tabId);
        if (this.shouldStop || tab?.url !== conversationUrl) {
          emitLog2(`${provider} cleanup skipped: conversation changed`, "warn");
          return;
        }
        const action =
          provider === "chatgpt"
            ? "chatgpt:deleteConversationWithReloadFallback"
            : "gemini:deleteCurrentConversation";
        let response;
        {
          await chrome.tabs.update(tabId, { active: true });
          const activeTab = await chrome.tabs.get(tabId);
          if (this.shouldStop || activeTab?.url !== conversationUrl) {
            emitLog2(
              `${provider} cleanup skipped: stopped or conversation changed after activation`,
              "warn",
            );
            return;
          }
          const responseBudgetMs = provider === "chatgpt" ? 6e4 : 12e3;
          emitLog2(
            `${provider} cleanup started (tab active; response budget ${responseBudgetMs / 1e3}s)`,
          );
          const cleanupDeadline = Date.now() + 1e4;
          let timer;
          try {
            const deleteRequest =
              provider === "chatgpt"
                ? chrome.runtime.sendMessage({
                    action,
                    tabId,
                    expectedConversationUrl: conversationUrl,
                  })
                : chrome.tabs.sendMessage(tabId, {
                    action,
                    expectedConversationUrl: conversationUrl,
                    cleanupDeadline,
                  });
            response = await Promise.race([
              deleteRequest,
              new Promise((resolve) => {
                timer = setTimeout(
                  () =>
                    resolve({
                      success: false,
                      error:
                        "CLEANUP_ACK_TIMEOUT: result saved; deletion unconfirmed",
                    }),
                  responseBudgetMs,
                );
              }),
            ]);
          } finally {
            clearTimeout(timer);
          }
        }
        if (response?.success) emitLog2(`${provider} cleanup completed`);
        if (!response?.success) {
          emitLog2(
            `${provider} cleanup warning: ${response?.error || "not confirmed"}`,
            "warn",
          );
          if (response?.diagnostics)
            emitLog2(
              `${provider} cleanup diagnostics: ${JSON.stringify(response.diagnostics)}`,
              "warn",
            );
        }
      } catch (error) {
        emitLog2(
          `${provider} cleanup warning: ${error?.message || "unavailable"}`,
          "warn",
        );
      }
    }
    async _completeGeminiPostPersist(node, workflow2, result, emitLog2) {
      const items = Array.isArray(result?.geminiItems)
        ? result.geminiItems
        : [];
      const tabId = result?.geminiTabId;
      const mediaType = result?.mediaType === "video" ? "video" : "image";
      const autoDownload =
        (window.featureGate?.canUse?.("auto_download") ?? false) &&
        (node.auto_download === true ||
          node.auto_download === "1" ||
          node.auto_download === 1);
      let downloadsOk = true;
      if (autoDownload && items.length > 0) {
        const settings = await window.DownloadHelper?.getSettings?.();
        if (!settings || !window.GeminiMediaDownloadHelper?.downloadResults) {
          downloadsOk = false;
          emitLog2(
            "Gemini auto-download: download settings unavailable",
            "warn",
          );
        } else {
          const project =
            settings.project || window._currentProjectName || "flow";
          const downloadResult =
            await window.GeminiMediaDownloadHelper.downloadResults({
              items,
              tabId,
              mediaType,
              waitForComplete: node.gemini_delete_after_gen === true,
              onLog: (message, type) => emitLog2(message, type),
              filenameFor: (_item, index) => {
                let filename = window.DownloadHelper.buildFilename({
                  template: settings.template,
                  project,
                  prompt: node.prompt || "",
                  index: index + 1,
                  taskName: workflow2?.wf_name,
                  folder: settings.folder,
                  ext: mediaType === "video" ? "mp4" : "png",
                });
                if (mediaType === "video")
                  filename = filename.replace(/\.png$/i, ".mp4");
                return filename;
              },
            });
          downloadsOk = downloadResult.success;
        }
      }
      console.log(
        "[WorkflowProviderCleanup] decision",
        JSON.stringify({
          nodeId: node.node_id,
          provider: "gemini",
          enabled: node.gemini_delete_after_gen === true,
          flowUploadComplete: result.flowUploadComplete === true,
          downloadsOk,
          hasConversation: !!result.conversationUrl,
          hasTab: !!tabId,
          stopped: this.shouldStop === true,
        }),
      );
      if (node.gemini_delete_after_gen === true) {
        if (autoDownload && !downloadsOk) {
          emitLog2(
            "Gemini cleanup skipped because one or more downloads failed",
            "warn",
          );
          return;
        }
        await this._deleteGeneratedProviderChat(
          "gemini",
          tabId,
          result.conversationUrl,
          result.flowUploadComplete === true,
          emitLog2,
          node,
        );
      }
    }
    async _completeMusePostPersist(node, workflow2, result, emitLog2) {
      const mediaType = result?.mediaType === "video" ? "video" : "image";
      const deleteAfter = node.muse_delete_after_gen === true;
      const autoDownload =
        (window.featureGate?.canUse?.("auto_download") ?? false) &&
        (node.auto_download === true ||
          node.auto_download === "1" ||
          node.auto_download === 1);
      const mustDownloadBeforeCleanup =
        mediaType === "video" &&
        deleteAfter &&
        result.flowUploadComplete !== true;
      const shouldDownload = autoDownload || mustDownloadBeforeCleanup;
      let downloadsOk = true;
      if (shouldDownload) {
        const settings = await window.DownloadHelper?.getSettings?.();
        if (!settings) {
          downloadsOk = false;
          emitLog2("Muse auto-download: download settings unavailable", "warn");
        } else if (result.flowUploadComplete === true) {
          for (let index = 0; index < (result?.fileIds || []).length; index++) {
            const fileId = result.fileIds[index];
            const response = await this._downloadSingleTile(
              fileId,
              node.prompt || node.node_name || "muse",
              mediaType === "video"
                ? settings.videoResolution
                : settings.resolution,
              result.fileNames?.[fileId] || null,
              null,
              workflow2?.wf_name || null,
              mediaType === "video" ? settings.videoResolution : null,
              null,
            ).catch((error) => {
              emitLog2(
                `Muse Flow download failed: ${error?.message || "unknown"}`,
                "warn",
              );
              return false;
            });
            if (response !== true) {
              downloadsOk = false;
              break;
            }
            this._downloadedTileIds || (this._downloadedTileIds = new Set());
            this._downloadedTileIds.add(fileId);
            emitLog2(
              `Muse Flow download completed ${index + 1}/${result.fileIds.length}`,
              "success",
            );
          }
        } else
          for (
            let index = 0;
            index < (result?.museResult?.mediaUrls || []).length;
            index++
          ) {
            const url = result.museResult.mediaUrls[index];
            const filename = window.DownloadHelper.buildFilename({
              template: settings.template,
              project: settings.project || window._currentProjectName || "flow",
              prompt: node.prompt || "",
              index: index + 1,
              taskName: workflow2?.wf_name,
              folder: settings.folder,
              ext: mediaType === "video" ? "mp4" : "jpg",
            });
            const fetched = result.museResult?.fetchedMedia?.find(
              (item) => item.url === url,
            );
            const response =
              mediaType === "video"
                ? await window.MessageBridge?.museDownloadNative?.(
                    result.museTabId,
                    filename,
                    url,
                    deleteAfter ? 6e5 : 12e4,
                  )
                : await window.MessageBridge?.museDownloadImageResult?.({
                    tabId: result.museTabId,
                    url,
                    base64: fetched?.base64,
                    filename,
                    waitForComplete: deleteAfter,
                  });
            if (!response?.success) {
              downloadsOk = false;
              emitLog2(
                `Muse auto-download failed: ${response?.error || "unknown"}`,
                "warn",
              );
              break;
            }
            const fileId = result?.fileIds?.[index];
            if (fileId) {
              this._downloadedTileIds || (this._downloadedTileIds = new Set());
              this._downloadedTileIds.add(fileId);
            }
            emitLog2(
              `Muse auto-download completed ${index + 1}/${result.museResult.mediaUrls.length}`,
              "success",
            );
          }
      }
      if (deleteAfter) {
        const durableImage =
          mediaType === "image" && result.flowUploadComplete === true;
        const durableVideo =
          mediaType === "video" &&
          (result.flowUploadComplete === true || downloadsOk);
        if (!durableImage && !durableVideo) {
          emitLog2(
            "Muse cleanup skipped: result persistence/download not confirmed",
            "warn",
          );
          return;
        }
        const removed = await window.MuseSession?.deleteCurrentConversation?.();
        if (!removed?.success)
          emitLog2(
            `Muse cleanup warning: ${removed?.error || "not confirmed"}`,
            "warn",
          );
      }
    }
    async _executeChatGPTImageNode(
      node,
      workflow2,
      emitLog2,
      nodeAccum = null,
    ) {
      const startTime = Date.now();
      if (
        !window.featureGate ||
        !window.featureGate.canUse("chatgpt_enabled")
      ) {
        const err = new Error(
          "T\xEDnh n\u0103ng ChatGPT ch\u01B0a \u0111\u01B0\u1EE3c k\xEDch ho\u1EA1t cho g\xF3i hi\u1EC7n t\u1EA1i",
        );
        err.code = "FEATURE_LOCKED";
        node.last_error = "FEATURE_LOCKED";
        throw err;
      }
      if (!window.ProviderRegistry) {
        throw new Error("ProviderRegistry ch\u01B0a s\u1EB5n s\xE0ng");
      }
      const adapter = window.ProviderRegistry.get("chatgpt");
      if (!adapter) {
        throw new Error(
          "ChatGPT adapter ch\u01B0a \u0111\u01B0\u1EE3c \u0111\u0103ng k\xFD",
        );
      }
      const preflight = await this._preflightProviderTab("chatgpt", emitLog2);
      const tabId = preflight.tabId;
      if (!preflight.ready && preflight.error !== "PREFLIGHT_TIMEOUT") {
        if (
          window.eventBus &&
          ![
            "NEW_CHAT_NAVIGATION_FAILED",
            "NEW_CHAT_NAVIGATION_UNAVAILABLE",
          ].includes(preflight.error)
        ) {
          window.eventBus.emit("chatgpt:login_required", {
            error: preflight.error || "NOT_LOGGED_IN",
          });
        }
        const err = new Error(
          "ChatGPT ch\u01B0a s\u1EB5n s\xE0ng: " +
            (preflight.error || "NOT_LOGGED_IN"),
        );
        err.code = preflight.error || "NOT_LOGGED_IN";
        node.last_error = err.code;
        throw err;
      }
      if (
        !node.ref_file_ids &&
        node.ref_file_names &&
        Object.keys(node.ref_file_names).length > 0
      ) {
        node.ref_file_ids = Object.keys(node.ref_file_names).join(", ");
        emitLog2(
          "Smart Clone: reconstructed ref_file_ids from ref_file_names: " +
            node.ref_file_ids,
        );
      } else if (
        !node.ref_file_ids &&
        node.ref_thumbnails &&
        Object.keys(node.ref_thumbnails).length > 0
      ) {
        node.ref_file_ids = Object.keys(node.ref_thumbnails).join(", ");
        emitLog2(
          "Smart Clone: reconstructed ref_file_ids from ref_thumbnails: " +
            node.ref_file_ids,
        );
      }
      if (
        node.ref_file_ids &&
        node.ref_file_ids.includes("upload_") &&
        typeof window.uploadPendingFiles === "function"
      ) {
        const oldRefIds = node.ref_file_ids;
        emitLog2(
          "Upload \u1EA3nh ref local l\xEAn Flow tr\u01B0\u1EDBc khi submit ChatGPT...",
          "info",
        );
        node.ref_file_ids = await window.uploadPendingFiles(node.ref_file_ids);
        if (node.ref_file_ids !== oldRefIds) {
          const newIdArr = (node.ref_file_ids || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          if (!node.ref_file_names) node.ref_file_names = {};
          if (!node.ref_thumbnails) node.ref_thumbnails = {};
          for (const newId of newIdArr) {
            if (typeof MediaRegistry !== "undefined") {
              if (MediaRegistry.getFileName?.(newId))
                node.ref_file_names[newId] = MediaRegistry.getFileName(newId);
              if (MediaRegistry.getThumb?.(newId))
                node.ref_thumbnails[newId] = MediaRegistry.getThumb(newId);
            }
          }
          const oldIdArr = (oldRefIds || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          for (const oldId of oldIdArr) {
            if (oldId.startsWith("upload_") && !newIdArr.includes(oldId)) {
              delete node.ref_file_names[oldId];
              if (node.ref_thumbnails) delete node.ref_thumbnails[oldId];
            }
          }
        }
        const currentRefIds = String(node.ref_file_ids || "")
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean);
        const pendingRefCount = currentRefIds.filter((id) =>
          id.startsWith("upload_"),
        ).length;
        if (pendingRefCount > 0) {
          if (currentRefIds.length === pendingRefCount) {
            const error = new Error("REF_UPLOAD_FAILED");
            error.code = "REF_UPLOAD_FAILED";
            emitLog2(
              "ChatGPT: no local reference uploaded; stopping node",
              "error",
            );
            throw error;
          }
          emitLog2(
            `ChatGPT: ${pendingRefCount} ref local ch\u01B0a upload xong; ti\u1EBFp t\u1EE5c v\u1EDBi ref \u0111\xE3 s\u1EB5n s\xE0ng`,
            "warn",
          );
        }
      }
      if (
        node.ref_file_ids &&
        !node.ref_file_ids.includes("upload_") &&
        !this._allRefsResolvableFromThumbnail(node)
      ) {
        const originalChatGPTRefIds = node.ref_file_ids;
        const cgThumbMap = { ...(node.ref_thumbnails || {}) };
        const cgFnMap = { ...(node.ref_file_names || {}) };
        if (
          typeof window.correctFileIds === "function" &&
          (Object.keys(cgThumbMap).length > 0 ||
            Object.keys(cgFnMap).length > 0)
        ) {
          const { correctedIds, changed } = await window.correctFileIds(
            node.ref_file_ids,
            cgThumbMap,
            cgFnMap,
          );
          if (changed) {
            emitLog2(
              "ChatGPT: \u0110\xE3 c\u1EADp nh\u1EADt ref IDs (tile ID thay \u0111\u1ED5i sau reload)",
            );
            node.ref_file_ids = correctedIds;
          }
        }
        if (typeof window.reuploadMissingFiles === "function") {
          const beforeChatGPTReupload = node.ref_file_ids;
          const refThumbMap2 = { ...(node.ref_thumbnails || {}) };
          const refFileNamesMap2 = { ...(node.ref_file_names || {}) };
          const _apiUpP = node._apiUpstreamIds;
          const _pIds = (node.ref_file_ids || "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
          const _pDom =
            _apiUpP && _apiUpP.size > 0
              ? _pIds.filter((id) => !_apiUpP.has(id))
              : _pIds;
          let updated;
          if (_pDom.length === _pIds.length) {
            updated = await window.reuploadMissingFiles(
              node.ref_file_ids,
              refThumbMap2,
              originalChatGPTRefIds,
              refFileNamesMap2,
              { surface: "workflow" },
            );
          } else if (_pDom.length === 0) {
            updated = node.ref_file_ids;
          } else {
            const _pOut = (
              (await window.reuploadMissingFiles(
                _pDom.join(", "),
                refThumbMap2,
                originalChatGPTRefIds,
                refFileNamesMap2,
                { surface: "workflow" },
              )) || ""
            )
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean);
            const _pm = [];
            if (_pOut.length === _pDom.length) {
              let di = 0;
              for (const id of _pIds)
                _pm.push(_apiUpP.has(id) ? id : _pOut[di++]);
            } else {
              const _k = new Set([..._pOut, ..._apiUpP]);
              for (const id of _pIds) if (_k.has(id)) _pm.push(id);
              for (const id of _pOut) if (!_pm.includes(id)) _pm.push(id);
            }
            updated = _pm.join(", ");
          }
          if (!_sameFileIdList(updated, beforeChatGPTReupload)) {
            emitLog2(
              "ChatGPT: \u0110\xE3 re-upload \u1EA3nh tham chi\u1EBFu b\u1ECB thi\u1EBFu tr\xEAn Flow",
            );
            node.ref_file_ids = updated;
            const oldArr = (beforeChatGPTReupload || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            const newArr = (updated || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            if (!node.ref_thumbnails) node.ref_thumbnails = {};
            if (!node.ref_file_names) node.ref_file_names = {};
            for (let i = 0; i < oldArr.length && i < newArr.length; i++) {
              if (oldArr[i] !== newArr[i]) {
                if (node.ref_thumbnails[oldArr[i]]) {
                  node.ref_thumbnails[newArr[i]] =
                    node.ref_thumbnails[oldArr[i]];
                  delete node.ref_thumbnails[oldArr[i]];
                }
                if (node.ref_file_names?.[oldArr[i]]) {
                  node.ref_file_names[newArr[i]] =
                    node.ref_file_names[oldArr[i]];
                  delete node.ref_file_names[oldArr[i]];
                }
                const reupDetails = window._lastReuploadTileDetails || {};
                const newThumb =
                  reupDetails[newArr[i]]?.thumbnailUrl ||
                  MediaRegistry.getThumb(newArr[i]);
                const newFileName =
                  reupDetails[newArr[i]]?.file_name ||
                  MediaRegistry.getFileName(newArr[i]);
                if (newThumb) node.ref_thumbnails[newArr[i]] = newThumb;
                if (newFileName) node.ref_file_names[newArr[i]] = newFileName;
              }
            }
            try {
              if (!(isFrames && node.frame_ref_mode === "upstream_node")) {
                await window.storageManager?.updateNodeStatus(
                  this.currentWorkflow?.wf_id || workflow2?.wf_id,
                  node.node_id,
                  {
                    ref_file_ids: node.ref_file_ids,
                    ref_thumbnails: node.ref_thumbnails,
                    ref_file_names: node.ref_file_names,
                  },
                );
              }
            } catch (e) {
              console.warn(
                "[ChatGPT] Failed to persist ref update:",
                e.message,
              );
            }
            if (
              node._mentionRefSources &&
              Object.keys(node._mentionRefSources).length > 0
            ) {
              const sourceUpdates = {};
              for (let i = 0; i < oldArr.length && i < newArr.length; i++) {
                const oldId = oldArr[i];
                const newId = newArr[i];
                if (oldId === newId) continue;
                const source = node._mentionRefSources[oldId];
                if (!source || source.sourceNodeType !== "image") continue;
                if (!sourceUpdates[source.sourceSlug]) {
                  sourceUpdates[source.sourceSlug] = {
                    oldIds: [],
                    newIds: [],
                    thumbnails: {},
                    fileNames: {},
                  };
                }
                sourceUpdates[source.sourceSlug].oldIds.push(oldId);
                sourceUpdates[source.sourceSlug].newIds.push(newId);
                if (node.ref_thumbnails?.[newId])
                  sourceUpdates[source.sourceSlug].thumbnails[newId] =
                    node.ref_thumbnails[newId];
                if (node.ref_file_names?.[newId])
                  sourceUpdates[source.sourceSlug].fileNames[newId] =
                    node.ref_file_names[newId];
              }
              for (const [slug, updates] of Object.entries(sourceUpdates)) {
                const sourceNode = workflow2.nodes.find((n) => n.slug === slug);
                if (!sourceNode || sourceNode.node_type !== "image") continue;
                emitLog2(
                  `[Bug 47] ChatGPT: Updating source image node "${slug}" with reuploaded IDs`,
                );
                let srcIds = (sourceNode.ref_file_ids || "")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                for (let j = 0; j < updates.oldIds.length; j++) {
                  const idx = srcIds.indexOf(updates.oldIds[j]);
                  if (idx !== -1) srcIds[idx] = updates.newIds[j];
                }
                sourceNode.ref_file_ids = srcIds.join(", ");
                if (!sourceNode.ref_thumbnails) sourceNode.ref_thumbnails = {};
                if (!sourceNode.ref_file_names) sourceNode.ref_file_names = {};
                for (const [newId, thumb] of Object.entries(updates.thumbnails))
                  sourceNode.ref_thumbnails[newId] = thumb;
                for (const [newId, fn] of Object.entries(updates.fileNames))
                  sourceNode.ref_file_names[newId] = fn;
                for (const oldId of updates.oldIds) {
                  delete sourceNode.ref_thumbnails[oldId];
                  delete sourceNode.ref_file_names[oldId];
                }
                try {
                  await window.storageManager?.updateNodeStatus(
                    this.currentWorkflow?.wf_id || workflow2?.wf_id,
                    sourceNode.node_id,
                    {
                      ref_file_ids: sourceNode.ref_file_ids,
                      ref_thumbnails: sourceNode.ref_thumbnails,
                      ref_file_names: sourceNode.ref_file_names,
                    },
                  );
                  window.eventBus?.emit("node:ref_replaced", {
                    nodeId: sourceNode.node_id,
                    oldRefIds: updates.oldIds.join(", "),
                    newRefIds: updates.newIds.join(", "),
                    refFileNames: sourceNode.ref_file_names,
                    refThumbnails: sourceNode.ref_thumbnails,
                  });
                } catch (e) {
                  console.warn(
                    `[Bug 47] ChatGPT: Failed to persist source node "${slug}":`,
                    e.message,
                  );
                }
              }
            }
          }
        }
      }
      const refIdArr = (node.ref_file_ids || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (
        !refIdArr.length &&
        node.ref_thumbnails &&
        typeof node.ref_thumbnails === "object"
      ) {
        const webKeys = Object.keys(node.ref_thumbnails).filter((k) =>
          k.startsWith("template_ref_"),
        );
        if (webKeys.length) {
          refIdArr.push(...webKeys);
          emitLog2(
            `ChatGPT: d\xF9ng ${webKeys.length} ref web (template_ref) t\u1EEB ref_thumbnails`,
          );
        }
      }
      console.log(
        `[_executeChatGPTImageNode] ref_file_ids="${node.ref_file_ids || ""}", ref_thumbnails keys=${Object.keys(node.ref_thumbnails || {}).join(",") || "(none)"}`,
      );
      if (node.ref_thumbnails && typeof node.ref_thumbnails === "object") {
        const tKeys = Object.keys(node.ref_thumbnails);
        const _hasDirectThumb = (id) =>
          !!node.ref_thumbnails[id] ||
          !!getThumbCache()?.get(id)?.thumbnail ||
          (typeof MediaRegistry !== "undefined" &&
            !!MediaRegistry.getThumb?.(id));
        if (
          refIdArr.length > 0 &&
          tKeys.length === refIdArr.length &&
          !refIdArr.some((id) => _hasDirectThumb(id))
        ) {
          const remap = { ...node.ref_thumbnails };
          refIdArr.forEach((id, i) => {
            remap[id] = node.ref_thumbnails[tKeys[i]];
          });
          node.ref_thumbnails = remap;
          emitLog2(
            `ChatGPT: remap ${refIdArr.length} thumbnail theo v\u1ECB tr\xED (ref ID l\u1EC7ch thumbnail key)`,
            "warn",
          );
        }
      }
      const maxRef = adapter.capabilities?.maxRefImages || 4;
      const refIdsCapped = refIdArr.slice(0, maxRef);
      if (refIdArr.length > maxRef) {
        emitLog2(
          `ChatGPT: v\u01B0\u1EE3t gi\u1EDBi h\u1EA1n ${maxRef} \u1EA3nh ref \u2014 ch\u1EC9 g\u1EEDi ${maxRef} \u1EA3nh \u0111\u1EA7u`,
          "warn",
        );
      }
      const resolvedRefIds = [];
      const resolvedRefs = await this._resolveRefImagesForLLM(
        { ...node, ref_file_ids: refIdsCapped.join(", ") },
        adapter,
        resolvedRefIds,
      );
      emitLog2(
        `ChatGPT refs resolved: ${resolvedRefs.length}/${refIdsCapped.length}`,
      );
      if (refIdsCapped.length > 0 && resolvedRefs.length === 0) {
        throw Object.assign(
          new Error(
            `ChatGPT reference materialization incomplete (${resolvedRefs.length}/${refIdsCapped.length})`,
          ),
          { code: "REF_UPLOAD_FAILED" },
        );
      }
      if (resolvedRefs.length < refIdsCapped.length) {
        emitLog2(
          `ChatGPT: ${resolvedRefs.length}/${refIdsCapped.length} ref s\u1EB5n s\xE0ng; ti\u1EBFp t\u1EE5c v\u1EDBi \u1EA3nh \u0111\xE3 t\u1EA3i \u0111\u01B0\u1EE3c`,
          "warn",
        );
      }
      if (
        resolvedRefs.length > 0 &&
        !window.featureGate?.canUseProviderRefImages?.("chatgpt")
      ) {
        throw Object.assign(new Error("CHATGPT_REF_IMAGES_NOT_ALLOWED"), {
          code: "FEATURE_LOCKED",
        });
      }
      let cgToken = null;
      if (window.ExecutionGate) {
        try {
          const gate = await window.ExecutionGate.request("chatgpt_run", 1, {
            owner: "workflow",
            label: workflow2?.wf_name || "chatgpt_node",
            provider: "chatgpt",
            has_ref: resolvedRefs.length > 0,
            ref_count: resolvedRefs.length,
            parent_workflow_token: this._currentExecutionToken || null,
          });
          if (!gate?.allowed) {
            window.ExecutionGate.showDeniedDialog?.(gate, "ChatGPT");
            const err = new Error(
              gate?.reason === "QUOTA_EXCEEDED"
                ? "\u0110\xE3 h\u1EBFt l\u01B0\u1EE3t ChatGPT h\xF4m nay"
                : "Kh\xF4ng \u0111\u01B0\u1EE3c ph\xE9p ch\u1EA1y ChatGPT",
            );
            err.code = gate?.reason || "QUOTA_EXCEEDED";
            node.last_error = "RATE_LIMIT";
            throw err;
          }
          cgToken = gate.token;
        } catch (e) {
          if (window.QuotaErrorHandler?.isQuotaError(e)) {
            node.last_error =
              e.code === "FEATURE_LOCKED" ? "FEATURE_LOCKED" : "RATE_LIMIT";
            throw e;
          }
          console.error(
            "[WorkflowExecutor] ChatGPT ExecutionGate failed, ABORTING node (Server-Only):",
            e.message,
          );
          node.last_error = "GATE_REQUEST_FAILED";
          throw new Error(
            `Kh\xF4ng th\u1EC3 xin ph\xE9p server ch\u1EA1y ChatGPT node: ${e.message || "unknown"}`,
          );
        }
      }
      try {
        emitLog2(
          `ChatGPT submit: ratio=${node.ratio || "story"}, mode=${node.use_fallback_prefix || "auto"}, refs=${resolvedRefs.length}`,
        );
        if (window.eventBus) {
          window.eventBus.emit("execution:tracker_update", {
            owner: "workflow",
            phase: "chatgpt_generating",
            promptText: "ChatGPT generating...",
            genMode: "image",
          });
        }
        const _wfSettings = window.storageSettings?.getSettings?.() || {};
        emitNodePhase(node.node_id, "generating");
        const result = await adapter.submit({
          prompt: node.prompt || "",
          refFileIds: resolvedRefs,
          settings: {
            ratio: node.ratio || "story",
            model: node.model || null,
            timeout:
              node.timeout_ms ||
              window.SystemConfig?.getTimeout("chatgpt_timeout_ms") ||
              3e5,
            useFallbackPrefix: node.use_fallback_prefix || "auto",
            fallbackPrefix:
              _wfSettings.chatgptFallbackPrefix || "Generate an image of: ",
          },
          taskName: workflow2?.wf_name || null,
          shouldStop: () => this.shouldStop,
        });
        if (result?.success) emitNodePhase(node.node_id, "downloading");
        if (!result || !result.success) {
          const errCode = result?.error || "IMAGE_GEN_FAILED";
          node.last_error = errCode;
          try {
            await window.storageManager?.updateNodeStatus(
              this.currentWorkflow?.wf_id || workflow2?.wf_id,
              node.node_id,
              { last_error: errCode },
            );
          } catch (e) {}
          if (cgToken && window.ExecutionGate) {
            await window.ExecutionGate.complete(cgToken, "failed").catch(
              () => {},
            );
            cgToken = null;
          }
          if (errCode === "CONTENT_BLOCKED") {
            node._contentBlockedRetries =
              (node._contentBlockedRetries || 0) + 1;
            if (node._contentBlockedRetries > 1) {
              const err2 = this._createProviderFailureError(
                "ChatGPT",
                node,
                result,
              );
              err2.noRetry = true;
              throw err2;
            }
            emitLog2(
              "ChatGPT content policy warning \u2014 th\u1EED l\u1EA1i 1 l\u1EA7n...",
              "warn",
            );
          }
          const err = this._createProviderFailureError("ChatGPT", node, result);
          if (errCode === "TIMEOUT" && result?.hasPendingImage) {
            err.noRetry = true;
            emitLog2(
              "ChatGPT TIMEOUT nh\u01B0ng image \u0111ang gen \u1EDF backend \u2014 b\u1ECF qua retry \u0111\u1EC3 tr\xE1nh resubmit",
              "warn",
            );
          } else if (
            [
              "SUBSCRIPTION_REQUIRED",
              "LIMIT_ALERT",
              "FEATURE_LOCKED",
              "CHALLENGE_TIMEOUT",
            ].includes(errCode)
          ) {
            err.noRetry = true;
          }
          throw err;
        }
        node.last_mode_used = result.imageModeUsed
          ? "image_mode"
          : "fallback_prefix";
        node.last_error = null;
        emitLog2(`ChatGPT mode used: ${node.last_mode_used}`);
        const imageUrls = result.imageUrls || [];
        if (imageUrls.length === 0) {
          throw new Error(
            "ChatGPT kh\xF4ng tr\u1EA3 v\u1EC1 URL \u1EA3nh n\xE0o",
          );
        }
        emitLog2(
          `ChatGPT tr\u1EA3 v\u1EC1 ${imageUrls.length} \u1EA3nh \u2014 bridge sang Flow...`,
        );
        const uploadedTiles = [];
        const cgTabId = result.tabId || tabId;
        const conversationUrl = await chrome.tabs
          .get(cgTabId)
          .then((tab) => tab.url)
          .catch(() => null);
        emitLog2(
          `[ChatGPT Bridge] Starting bridge for ${imageUrls.length} image(s)`,
        );
        const _uploadRunStamp = Date.now();
        for (let i = 0; i < imageUrls.length; i++) {
          const url = imageUrls[i];
          const fileName = `chatgpt-${node.node_id}-${_uploadRunStamp}-${i + 1}.png`;
          const bridgeStartTime = Date.now();
          window.eventBus?.emit?.("workflow:bridge_upload", {
            workflowId: workflow2?.wf_id,
            nodeId: node.node_id,
            nodeName: node.node_name,
            provider: "chatgpt",
            index: i + 1,
            total: imageUrls.length,
            stage: "started",
          });
          try {
            if (!window.MessageBridge?.chatGPTBridgeToFlow) {
              emitLog2(
                "MessageBridge.chatGPTBridgeToFlow kh\xF4ng t\u1ED3n t\u1EA1i \u2014 fallback synthetic tile",
                "warn",
              );
              uploadedTiles.push({
                tileId: `chatgpt_${Date.now()}_${i}`,
                thumbnail: url,
                file_name: fileName,
              });
              continue;
            }
            emitLog2(
              `[ChatGPT Bridge] ${i + 1}/${imageUrls.length}: Starting upload...`,
            );
            const bridgeResp = await window.MessageBridge.chatGPTBridgeToFlow(
              url,
              cgTabId,
              fileName,
              (stage) =>
                window.eventBus?.emit?.("workflow:bridge_upload", {
                  workflowId: workflow2?.wf_id,
                  nodeId: node.node_id,
                  nodeName: node.node_name,
                  provider: "chatgpt",
                  index: i + 1,
                  total: imageUrls.length,
                  stage,
                }),
            );
            const bridgeDuration = Date.now() - bridgeStartTime;
            emitLog2(
              `[ChatGPT Bridge] ${i + 1}/${imageUrls.length}: Completed in ${bridgeDuration}ms`,
            );
            const tileDetails = Array.isArray(bridgeResp)
              ? bridgeResp
              : bridgeResp?.tileDetails || [];
            if (tileDetails && tileDetails.length > 0) {
              const td = tileDetails[0];
              const tileId = td.id || td.tile_id || td.tileId;
              if (tileId) {
                const thumbUrl = td.thumbnailUrl || td.thumbnail_url || url;
                const flowFileName =
                  td.file_name || extractFileNameFromUrl(thumbUrl);
                uploadedTiles.push({
                  tileId,
                  flowUploaded: true,
                  thumbnail: thumbUrl,
                  file_name: flowFileName,
                  media_uuid:
                    td.media_uuid ||
                    (td.api_driver &&
                    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(
                      tileId,
                    )
                      ? tileId
                      : null),
                  api_driver: td.api_driver || null,
                  project_id: td.project_id || null,
                });
                emitLog2(
                  `Bridge ${i + 1}/${imageUrls.length}: tileId=${tileId.substring(0, 16)}` +
                    (flowFileName
                      ? `, file_name=${flowFileName.substring(0, 16)}`
                      : ""),
                );
              } else {
                emitLog2(
                  `Bridge ${i + 1}/${imageUrls.length}: tileDetails kh\xF4ng c\xF3 tileId \u2014 fallback synthetic`,
                  "warn",
                );
                uploadedTiles.push({
                  tileId: `chatgpt_${Date.now()}_${i}`,
                  thumbnail: url,
                  file_name: fileName,
                });
              }
            } else {
              emitLog2(
                `Bridge ${i + 1}/${imageUrls.length}: ${bridgeResp?.error || "tileDetails r\u1ED7ng"} \u2014 fallback synthetic`,
                "warn",
              );
              uploadedTiles.push({
                tileId: `chatgpt_${Date.now()}_${i}`,
                thumbnail: url,
                file_name: fileName,
              });
            }
          } catch (bErr) {
            emitLog2(
              `Bridge ${i + 1} exception: ${bErr.message} \u2192 fallback synthetic`,
              "warn",
            );
            uploadedTiles.push({
              tileId: `chatgpt_${Date.now()}_${i}_err`,
              thumbnail: url,
              file_name: fileName,
            });
          } finally {
            window.eventBus?.emit?.("workflow:bridge_upload", {
              workflowId: workflow2?.wf_id,
              nodeId: node.node_id,
              nodeName: node.node_name,
              provider: "chatgpt",
              index: i + 1,
              total: imageUrls.length,
              stage: uploadedTiles[i]?.flowUploaded ? "completed" : "failed",
            });
          }
        }
        if (uploadedTiles.length === 0) {
          emitLog2(
            "C\u1EA3nh b\xE1o: ChatGPT c\xF3 \u1EA3nh nh\u01B0ng kh\xF4ng bridge \u0111\u01B0\u1EE3c sang Flow",
            "warn",
          );
        }
        node.result_file_ids = uploadedTiles.map((t) => t.tileId).join(", ");
        node.result_thumbnails = uploadedTiles.reduce((acc, t) => {
          acc[t.tileId] = {
            thumbnail: t.thumbnail,
            type: "image",
            file_name: t.file_name || "",
            ...(t.media_uuid && { media_uuid: t.media_uuid }),
            ...(t.api_driver && {
              api_driver: t.api_driver,
              identity_kind: "flow-api-uuid",
              identity_durability: "durable-resolver",
            }),
            ...(t.project_id && { project_id: t.project_id }),
          };
          return acc;
        }, {});
        node.result_file_names = uploadedTiles.reduce((acc, t) => {
          if (t.file_name) acc[t.tileId] = t.file_name;
          return acc;
        }, {});
        node.result_provider_urls = uploadedTiles.reduce((acc, t, idx) => {
          const url = imageUrls?.[idx];
          if (t.tileId && url) {
            acc[t.tileId] = {
              url,
              provider: "chatgpt",
              media_type: "image",
              tab_id: cgTabId,
              captured_at: Date.now(),
            };
          }
          return acc;
        }, {});
        emitLog2(
          `[ChatGPT] result_provider_urls keys: ${Object.keys(node.result_provider_urls || {}).join(", ") || "(empty)"}`,
        );
        if (typeof MediaRegistry !== "undefined") {
          for (const t of uploadedTiles) {
            if (t.thumbnail) MediaRegistry.setThumb?.(t.tileId, t.thumbnail);
            if (t.file_name) MediaRegistry.setFileName?.(t.tileId, t.file_name);
          }
        }
        if (cgToken && window.ExecutionGate) {
          await window.ExecutionGate.complete(cgToken, "success").catch(
            () => {},
          );
        }
        const fileIds = uploadedTiles.map((t) => t.tileId);
        const duration = Date.now() - startTime;
        emitLog2(
          `ChatGPT Image node ho\xE0n t\u1EA5t: ${fileIds.length} \u1EA3nh trong ${duration}ms`,
          "success",
        );
        return {
          fileIds,
          cleanupTabId: cgTabId,
          conversationUrl,
          flowUploadComplete:
            uploadedTiles.length === imageUrls.length &&
            uploadedTiles.every((tile) => tile.flowUploaded === true),
          cleanupDownloadsOk: true,
          chatgptImageUrls: imageUrls,
          duration,
          thumbnails: node.result_thumbnails,
          fileNames: node.result_file_names,
          refFileIdsUsed: resolvedRefIds,
        };
      } catch (err) {
        if (cgToken && window.ExecutionGate) {
          await window.ExecutionGate.complete(cgToken, "failed").catch(
            () => {},
          );
        }
        if (!node.last_error) {
          node.last_error = err?.code || "IMAGE_GEN_FAILED";
        }
        try {
          await window.storageManager?.updateNodeStatus(
            this.currentWorkflow?.wf_id || workflow2?.wf_id,
            node.node_id,
            {
              last_error: node.last_error,
              last_mode_used: node.last_mode_used,
            },
          );
        } catch (e) {}
        throw err;
      }
    }
    _resolveGrokFramePortInputs(node, workflow2) {
      for (const slot of [1, 2]) {
        const prefix = `frame_${slot}`;
        const edges = (workflow2.edges || []).filter(
          (edge) =>
            edge.target_node_id === node.node_id && edge.target_port === prefix,
        );
        if (node.frame_ref_mode === "manual") continue;
        if (!edges.length) {
          if (node.frame_ref_mode === "upstream_node") {
            node[`${prefix}_source`] = "";
            for (const field of ["file_id", "file_name", "thumbnail"])
              node[`${prefix}_${field}`] = null;
          }
          continue;
        }
        if (
          node.frame_ref_mode !== "upstream_node" &&
          node[`${prefix}_source`] === "manual" &&
          node[`${prefix}_file_id`]
        )
          continue;
        const ids = this._collectPortInputs(
          node,
          prefix,
          workflow2.nodes,
          edges,
        );
        const id = ids[0];
        if (!id)
          throw Object.assign(new Error("REF_UPLOAD_FAILED"), {
            code: "REF_UPLOAD_FAILED",
          });
        const source = workflow2.nodes.find(
          (candidate) => candidate.node_id === edges[0].source_node_id,
        );
        const thumbnail =
          source?.result_frame_thumbnails?.[id] ||
          source?.result_thumbnails?.[id] ||
          source?.ref_thumbnails?.[id];
        node[`${prefix}_source`] = edges[0].source_node_id;
        node[`${prefix}_file_id`] = id;
        node[`${prefix}_thumbnail`] =
          typeof thumbnail === "string"
            ? thumbnail
            : thumbnail?.source_thumbnail || thumbnail?.thumbnail || null;
        node[`${prefix}_file_name`] =
          thumbnail?.file_name ||
          source?.result_file_names?.[id] ||
          source?.ref_file_names?.[id] ||
          null;
        node.ref_thumbnails = {
          ...(node.ref_thumbnails || {}),
          ...(thumbnail && { [id]: thumbnail }),
        };
      }
      if (node.frame_ref_mode === "upstream_node") {
        node._framePortsResolved = true;
        node.ref_file_ids =
          node.node_type === "generate"
            ? ""
            : [node.frame_1_file_id, node.frame_2_file_id]
                .filter(Boolean)
                .join(",");
        node.ref_thumbnails = Object.fromEntries(
          [node.frame_1_file_id, node.frame_2_file_id]
            .filter(Boolean)
            .map((id) => [id, node.ref_thumbnails?.[id] || null]),
        );
        node.ref_file_names = Object.fromEntries(
          [1, 2]
            .filter((slot) => node[`frame_${slot}_file_id`])
            .map((slot) => [
              node[`frame_${slot}_file_id`],
              node[`frame_${slot}_file_name`] || null,
            ]),
        );
      }
    }
    async _executeGrokImageNode(node, workflow2, emitLog2, nodeAccum = null) {
      const startTime = Date.now();
      if (!window.featureGate || !window.featureGate.canUse("grok_enabled")) {
        const err = new Error(
          "T\xEDnh n\u0103ng Grok ch\u01B0a \u0111\u01B0\u1EE3c k\xEDch ho\u1EA1t cho g\xF3i hi\u1EC7n t\u1EA1i",
        );
        err.code = "FEATURE_LOCKED";
        node.last_error = "FEATURE_LOCKED";
        throw err;
      }
      if (!window.ProviderRegistry) {
        throw new Error("ProviderRegistry ch\u01B0a s\u1EB5n s\xE0ng");
      }
      const adapter = window.ProviderRegistry.get("grok");
      if (!adapter) {
        throw new Error(
          "Grok adapter ch\u01B0a \u0111\u01B0\u1EE3c \u0111\u0103ng k\xFD",
        );
      }
      const preflight = await this._preflightProviderTab("grok", emitLog2);
      const tabId = preflight.tabId;
      if (!preflight.ready && preflight.error !== "PREFLIGHT_TIMEOUT") {
        if (window.eventBus) {
          window.eventBus.emit("grok:login_required", {
            error: preflight.error || "NOT_LOGGED_IN",
          });
        }
        const err = new Error(
          "Grok ch\u01B0a s\u1EB5n s\xE0ng: " +
            (preflight.error || "NOT_LOGGED_IN"),
        );
        err.code = preflight.error || "NOT_LOGGED_IN";
        node.last_error = err.code;
        throw err;
      }
      adapter.normalizeNodeData?.(node);
      const isFrames2 =
        node.grok_mode === "video" && node.video_input_type === "Frames";
      if (isFrames2 && adapter.frameReferenceData) {
        this._resolveGrokFramePortInputs(node, workflow2);
        adapter.validateFrameSlots(node);
        Object.assign(node, adapter.frameReferenceData(node));
      }
      if (
        !isFrames2 &&
        !node.ref_file_ids &&
        node.ref_file_names &&
        Object.keys(node.ref_file_names).length > 0
      ) {
        node.ref_file_ids = Object.keys(node.ref_file_names).join(", ");
        emitLog2(
          "Smart Clone: reconstructed ref_file_ids from ref_file_names: " +
            node.ref_file_ids,
        );
      } else if (
        !isFrames2 &&
        !node.ref_file_ids &&
        node.ref_thumbnails &&
        Object.keys(node.ref_thumbnails).length > 0
      ) {
        node.ref_file_ids = Object.keys(node.ref_thumbnails).join(", ");
        emitLog2(
          "Smart Clone: reconstructed ref_file_ids from ref_thumbnails: " +
            node.ref_file_ids,
        );
      }
      const initialFrameRefIds = (node.ref_file_ids || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      const initialFrameRefCount = (node.ref_file_ids || "")
        .split(",")
        .filter((id) => id.trim()).length;
      const requiresUpload = (id) =>
        id.startsWith("upload_") &&
        !(
          isFrames2 &&
          id.startsWith("upload_import_") &&
          node.ref_thumbnails?.[id]
        );
      if (
        node.ref_file_ids &&
        node.ref_file_ids.split(",").some((id) => requiresUpload(id.trim())) &&
        typeof window.uploadPendingFiles === "function"
      ) {
        const oldRefIds = node.ref_file_ids;
        emitLog2(
          "Upload \u1EA3nh ref local l\xEAn Flow tr\u01B0\u1EDBc khi submit Grok...",
          "info",
        );
        if (isFrames2) {
          const uploadedIds = [];
          for (const rawId of node.ref_file_ids.split(",")) {
            const id = rawId.trim();
            uploadedIds.push(
              requiresUpload(id) ? await window.uploadPendingFiles(id) : id,
            );
          }
          node.ref_file_ids = uploadedIds.filter(Boolean).join(",");
        } else {
          node.ref_file_ids = await window.uploadPendingFiles(
            node.ref_file_ids,
          );
        }
        if (node.ref_file_ids !== oldRefIds) {
          const newIdArr = (node.ref_file_ids || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          if (!node.ref_file_names) node.ref_file_names = {};
          if (!node.ref_thumbnails) node.ref_thumbnails = {};
          for (const newId of newIdArr) {
            if (typeof MediaRegistry !== "undefined") {
              if (MediaRegistry.getFileName?.(newId))
                node.ref_file_names[newId] = MediaRegistry.getFileName(newId);
              if (MediaRegistry.getThumb?.(newId))
                node.ref_thumbnails[newId] = MediaRegistry.getThumb(newId);
            }
          }
          const oldIdArr = (oldRefIds || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          for (const oldId of oldIdArr) {
            if (oldId.startsWith("upload_") && !newIdArr.includes(oldId)) {
              delete node.ref_file_names[oldId];
              if (node.ref_thumbnails) delete node.ref_thumbnails[oldId];
            }
          }
        }
        const currentRefIds = String(node.ref_file_ids || "")
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean);
        const pendingRefCount = currentRefIds.filter(requiresUpload).length;
        if (pendingRefCount > 0) {
          if (isFrames2 || currentRefIds.length === pendingRefCount) {
            const error = new Error("REF_UPLOAD_FAILED");
            error.code = "REF_UPLOAD_FAILED";
            emitLog2(
              "Grok: no local reference uploaded; stopping node",
              "error",
            );
            throw error;
          }
          emitLog2(
            `Grok: ${pendingRefCount} ref local ch\u01B0a upload xong; ti\u1EBFp t\u1EE5c v\u1EDBi ref \u0111\xE3 s\u1EB5n s\xE0ng`,
            "warn",
          );
        }
      }
      if (
        node.ref_file_ids &&
        !node.ref_file_ids.includes("upload_") &&
        !this._allRefsResolvableFromThumbnail(node)
      ) {
        const originalGrokRefIds = node.ref_file_ids;
        const gkThumbMap = { ...(node.ref_thumbnails || {}) };
        const gkFnMap = { ...(node.ref_file_names || {}) };
        if (
          typeof window.correctFileIds === "function" &&
          (Object.keys(gkThumbMap).length > 0 ||
            Object.keys(gkFnMap).length > 0)
        ) {
          const { correctedIds, changed } = await window.correctFileIds(
            node.ref_file_ids,
            gkThumbMap,
            gkFnMap,
          );
          if (changed) {
            emitLog2(
              "Grok: \u0110\xE3 c\u1EADp nh\u1EADt ref IDs (tile ID thay \u0111\u1ED5i sau reload)",
            );
            node.ref_file_ids = correctedIds;
          }
        }
        if (typeof window.reuploadMissingFiles === "function") {
          const beforeGrokReupload = node.ref_file_ids;
          const refThumbMap2 = { ...(node.ref_thumbnails || {}) };
          const refFileNamesMap2 = { ...(node.ref_file_names || {}) };
          const _apiUpP = node._apiUpstreamIds;
          const _pIds = (node.ref_file_ids || "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
          const _pDom =
            _apiUpP && _apiUpP.size > 0
              ? _pIds.filter((id) => !_apiUpP.has(id))
              : _pIds;
          let updated;
          if (_pDom.length === _pIds.length) {
            updated = await window.reuploadMissingFiles(
              node.ref_file_ids,
              refThumbMap2,
              originalGrokRefIds,
              refFileNamesMap2,
              { surface: "workflow" },
            );
          } else if (_pDom.length === 0) {
            updated = node.ref_file_ids;
          } else {
            const _pOut = (
              (await window.reuploadMissingFiles(
                _pDom.join(", "),
                refThumbMap2,
                originalGrokRefIds,
                refFileNamesMap2,
                { surface: "workflow" },
              )) || ""
            )
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean);
            const _pm = [];
            if (_pOut.length === _pDom.length) {
              let di = 0;
              for (const id of _pIds)
                _pm.push(_apiUpP.has(id) ? id : _pOut[di++]);
            } else {
              const _k = new Set([..._pOut, ..._apiUpP]);
              for (const id of _pIds) if (_k.has(id)) _pm.push(id);
              for (const id of _pOut) if (!_pm.includes(id)) _pm.push(id);
            }
            updated = _pm.join(", ");
          }
          if (!_sameFileIdList(updated, beforeGrokReupload)) {
            emitLog2(
              "Grok: \u0110\xE3 re-upload \u1EA3nh tham chi\u1EBFu b\u1ECB thi\u1EBFu tr\xEAn Flow",
            );
            node.ref_file_ids = updated;
            const oldArr = (beforeGrokReupload || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            const newArr = (updated || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            if (!node.ref_thumbnails) node.ref_thumbnails = {};
            if (!node.ref_file_names) node.ref_file_names = {};
            for (let i = 0; i < oldArr.length && i < newArr.length; i++) {
              if (oldArr[i] !== newArr[i]) {
                if (node.ref_thumbnails[oldArr[i]]) {
                  node.ref_thumbnails[newArr[i]] =
                    node.ref_thumbnails[oldArr[i]];
                  delete node.ref_thumbnails[oldArr[i]];
                }
                if (node.ref_file_names?.[oldArr[i]]) {
                  node.ref_file_names[newArr[i]] =
                    node.ref_file_names[oldArr[i]];
                  delete node.ref_file_names[oldArr[i]];
                }
                const reupDetails = window._lastReuploadTileDetails || {};
                const newThumb =
                  reupDetails[newArr[i]]?.thumbnailUrl ||
                  MediaRegistry.getThumb(newArr[i]);
                const newFileName =
                  reupDetails[newArr[i]]?.file_name ||
                  MediaRegistry.getFileName(newArr[i]);
                if (newThumb) node.ref_thumbnails[newArr[i]] = newThumb;
                if (newFileName) node.ref_file_names[newArr[i]] = newFileName;
              }
            }
            try {
              await window.storageManager?.updateNodeStatus(
                this.currentWorkflow?.wf_id || workflow2?.wf_id,
                node.node_id,
                {
                  ref_file_ids: node.ref_file_ids,
                  ref_thumbnails: node.ref_thumbnails,
                  ref_file_names: node.ref_file_names,
                },
              );
            } catch (e) {
              console.warn("[Grok] Failed to persist ref update:", e.message);
            }
            if (
              node._mentionRefSources &&
              Object.keys(node._mentionRefSources).length > 0
            ) {
              const sourceUpdates = {};
              for (let i = 0; i < oldArr.length && i < newArr.length; i++) {
                const oldId = oldArr[i];
                const newId = newArr[i];
                if (oldId === newId) continue;
                const source = node._mentionRefSources[oldId];
                if (!source || source.sourceNodeType !== "image") continue;
                if (!sourceUpdates[source.sourceSlug]) {
                  sourceUpdates[source.sourceSlug] = {
                    oldIds: [],
                    newIds: [],
                    thumbnails: {},
                    fileNames: {},
                  };
                }
                sourceUpdates[source.sourceSlug].oldIds.push(oldId);
                sourceUpdates[source.sourceSlug].newIds.push(newId);
                if (node.ref_thumbnails?.[newId])
                  sourceUpdates[source.sourceSlug].thumbnails[newId] =
                    node.ref_thumbnails[newId];
                if (node.ref_file_names?.[newId])
                  sourceUpdates[source.sourceSlug].fileNames[newId] =
                    node.ref_file_names[newId];
              }
              for (const [slug, updates] of Object.entries(sourceUpdates)) {
                const sourceNode = workflow2.nodes.find((n) => n.slug === slug);
                if (!sourceNode || sourceNode.node_type !== "image") continue;
                emitLog2(
                  `[Bug 47] Grok: Updating source image node "${slug}" with reuploaded IDs`,
                );
                let srcIds = (sourceNode.ref_file_ids || "")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                for (let j = 0; j < updates.oldIds.length; j++) {
                  const idx = srcIds.indexOf(updates.oldIds[j]);
                  if (idx !== -1) srcIds[idx] = updates.newIds[j];
                }
                sourceNode.ref_file_ids = srcIds.join(", ");
                if (!sourceNode.ref_thumbnails) sourceNode.ref_thumbnails = {};
                if (!sourceNode.ref_file_names) sourceNode.ref_file_names = {};
                for (const [newId, thumb] of Object.entries(updates.thumbnails))
                  sourceNode.ref_thumbnails[newId] = thumb;
                for (const [newId, fn] of Object.entries(updates.fileNames))
                  sourceNode.ref_file_names[newId] = fn;
                for (const oldId of updates.oldIds) {
                  delete sourceNode.ref_thumbnails[oldId];
                  delete sourceNode.ref_file_names[oldId];
                }
                try {
                  await window.storageManager?.updateNodeStatus(
                    this.currentWorkflow?.wf_id || workflow2?.wf_id,
                    sourceNode.node_id,
                    {
                      ref_file_ids: sourceNode.ref_file_ids,
                      ref_thumbnails: sourceNode.ref_thumbnails,
                      ref_file_names: sourceNode.ref_file_names,
                    },
                  );
                  window.eventBus?.emit("node:ref_replaced", {
                    nodeId: sourceNode.node_id,
                    oldRefIds: updates.oldIds.join(", "),
                    newRefIds: updates.newIds.join(", "),
                    refFileNames: sourceNode.ref_file_names,
                    refThumbnails: sourceNode.ref_thumbnails,
                  });
                } catch (e) {
                  console.warn(
                    `[Bug 47] Grok: Failed to persist source node "${slug}":`,
                    e.message,
                  );
                }
              }
            }
          }
        }
      }
      const refIdArr = (node.ref_file_ids || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (
        !isFrames2 &&
        !refIdArr.length &&
        node.ref_thumbnails &&
        typeof node.ref_thumbnails === "object"
      ) {
        const webKeys = Object.keys(node.ref_thumbnails).filter((k) =>
          k.startsWith("template_ref_"),
        );
        if (webKeys.length) {
          refIdArr.push(...webKeys);
          emitLog2(
            `Grok: d\xF9ng ${webKeys.length} ref web (template_ref) t\u1EEB ref_thumbnails`,
          );
        }
      }
      if (node.ref_thumbnails && typeof node.ref_thumbnails === "object") {
        const tKeys = Object.keys(node.ref_thumbnails);
        const _hasDirectThumb = (id) =>
          !!resolveWorkflowImagePreview(node.ref_thumbnails[id]) ||
          !!getThumbCache()?.get(id)?.thumbnail ||
          (typeof MediaRegistry !== "undefined" &&
            !!MediaRegistry.getThumb?.(id));
        if (
          refIdArr.length > 0 &&
          tKeys.length === refIdArr.length &&
          !refIdArr.some((id) => _hasDirectThumb(id))
        ) {
          const remap = { ...node.ref_thumbnails };
          refIdArr.forEach((id, i) => {
            remap[id] = node.ref_thumbnails[tKeys[i]];
          });
          node.ref_thumbnails = remap;
          emitLog2(
            `Grok: remap ${refIdArr.length} thumbnail theo v\u1ECB tr\xED (ref ID l\u1EC7ch thumbnail key)`,
            "warn",
          );
        }
      }
      const maxRef = adapter.getMaxRefImages({
        mode: node.grok_mode || "image",
        isFrames: isFrames2,
        modelValue: node.model,
      });
      if (isFrames2 && refIdArr.length > maxRef)
        throw Object.assign(new Error("Grok frame reference limit exceeded"), {
          code: "GROK_REF_LIMIT_EXCEEDED",
        });
      if (isFrames2 && refIdArr.length !== initialFrameRefCount)
        throw Object.assign(new Error("Grok frame reference is missing"), {
          code: "REF_UPLOAD_FAILED",
        });
      if (
        isFrames2 &&
        adapter.frameReferenceData &&
        refIdArr.some((id, i) => id !== initialFrameRefIds[i])
      ) {
        for (let i = 0; i < refIdArr.length; i++) {
          const prefix = `frame_${i + 1}`;
          node[`${prefix}_file_id`] = refIdArr[i];
          const thumbnail = node.ref_thumbnails?.[refIdArr[i]];
          node[`${prefix}_thumbnail`] =
            typeof thumbnail === "string"
              ? thumbnail
              : thumbnail?.thumbnail || node[`${prefix}_thumbnail`];
          node[`${prefix}_file_name`] =
            node.ref_file_names?.[refIdArr[i]] || node[`${prefix}_file_name`];
        }
        if (node.frame_ref_mode !== "upstream_node") {
          await window.storageManager?.updateNodeStatus(
            this.currentWorkflow?.wf_id || workflow2?.wf_id,
            node.node_id,
            adapter.frameReferenceData(node),
          );
        }
      }
      const refIdsCapped = refIdArr.slice(0, maxRef);
      if (refIdArr.length > maxRef) {
        emitLog2(
          `Grok: v\u01B0\u1EE3t gi\u1EDBi h\u1EA1n ${maxRef} \u1EA3nh ref \u2014 ch\u1EC9 g\u1EEDi ${maxRef} \u1EA3nh \u0111\u1EA7u`,
          "warn",
        );
      }
      const resolvedRefs = [];
      const resolvedRefIds = [];
      for (const fid of refIdsCapped) {
        let thumb = "";
        const refThumb = node.ref_thumbnails?.[fid];
        const runtimeBase64 =
          refThumb && typeof refThumb === "object"
            ? refThumb.runtime_base64
            : null;
        if (runtimeBase64) {
          const m = String(runtimeBase64).match(/^data:(.+?);base64,(.+)$/);
          resolvedRefs.push({
            base64: m ? m[2] : String(runtimeBase64),
            name: node.ref_file_names?.[fid] || `${fid}.jpg`,
            type: m ? m[1] : "image/jpeg",
          });
          resolvedRefIds.push(fid);
          emitLog2(
            `Grok ref: d\xF9ng tr\u1EF1c ti\u1EBFp last-frame base64 ${fid.substring(0, 12)}`,
          );
          continue;
        }
        thumb = resolveWorkflowImagePreview(refThumb) || "";
        if (!thumb && window.GenTab?.thumbnailCache?.[fid])
          thumb = window.GenTab.thumbnailCache[fid];
        if (
          !thumb &&
          typeof MediaRegistry !== "undefined" &&
          MediaRegistry.getThumb?.(fid)
        )
          thumb = MediaRegistry.getThumb(fid);
        if (!thumb && getThumbCache()?.get(fid)?.thumbnail) {
          thumb = getThumbCache().get(fid).thumbnail;
        }
        if (!thumb && window.MessageBridge?.getThumbnailsByIds) {
          try {
            const scan = await window.MessageBridge.getThumbnailsByIds([fid], {
              deep: true,
              fileNamesById: node.ref_file_names || {},
            });
            const scanned = scan?.results?.[fid];
            thumb = resolveWorkflowImagePreview(scanned) || scanned?.url || "";
            if (thumb) {
              node.ref_thumbnails[fid] = scanned;
              const recoveredName =
                scanned?.file_name || scanned?.persistent_media_id || null;
              if (recoveredName) {
                if (!node.ref_file_names || Array.isArray(node.ref_file_names))
                  node.ref_file_names = {};
                node.ref_file_names[fid] = recoveredName;
              }
              emitLog2(
                `Grok ref: resolve thumbnail t\u1EEB Flow tile ${fid.substring(0, 12)}`,
              );
            }
          } catch (scanErr) {
            emitLog2(
              `Grok ref scan l\u1ED7i: ${fid.substring(0, 12)} - ${scanErr.message}`,
              "warn",
            );
          }
        }
        if (!thumb) {
          emitLog2(
            `Grok ref skip: kh\xF4ng c\xF3 thumbnail URL cho ${fid.substring(0, 12)}`,
            "warn",
          );
          continue;
        }
        const fileName =
          node.ref_file_names?.[fid] ||
          (typeof MediaRegistry !== "undefined" &&
            MediaRegistry.getFileName?.(fid)) ||
          `${fid}.png`;
        try {
          const dataMatch =
            typeof thumb === "string"
              ? thumb.match(/^data:([^;,]+);base64,(.+)$/s)
              : null;
          let fetchResp = dataMatch
            ? { success: true, base64: dataMatch[2], contentType: dataMatch[1] }
            : null;
          if (!fetchResp && /^https?:/i.test(thumb)) {
            fetchResp = await new Promise((resolve) => {
              chrome.runtime.sendMessage(
                { action: "fetchBlob", url: thumb, expectImage: true },
                (r) => resolve(r),
              );
            });
          }
          if (
            !fetchResp?.success &&
            /^(?:https?:|blob:)/i.test(thumb) &&
            window.MessageBridge?.sendToContentScript
          ) {
            const primaryError = fetchResp?.error || null;
            const flowResp = await window.MessageBridge.sendToContentScript(
              "fetchImageAsBase64",
              { url: thumb },
            );
            fetchResp = flowResp?.success
              ? flowResp
              : {
                  success: false,
                  error:
                    [primaryError, flowResp?.error]
                      .filter(Boolean)
                      .join(" -> ") || "REF_FETCH_FAILED",
                };
          }
          if (fetchResp?.success && fetchResp.base64) {
            const m = fetchResp.base64.match(/^data:(.+?);base64,(.+)$/);
            if (m) {
              resolvedRefs.push({ base64: m[2], name: fileName, type: m[1] });
            } else {
              resolvedRefs.push({
                base64: fetchResp.base64,
                name: fileName,
                type: "image/png",
              });
            }
            resolvedRefIds.push(fid);
          } else {
            emitLog2(
              `Grok ref fetch fail: ${fid.substring(0, 12)} (${fetchResp?.error || "unknown"})`,
              "warn",
            );
          }
        } catch (err) {
          emitLog2(
            `Grok ref fetch error: ${fid.substring(0, 12)} - ${err.message}`,
            "warn",
          );
        }
      }
      emitLog2(
        `Grok refs resolved: ${resolvedRefs.length}/${refIdsCapped.length}`,
      );
      if (
        refIdsCapped.length > 0 &&
        (isFrames2
          ? resolvedRefs.length !== refIdsCapped.length
          : resolvedRefs.length === 0)
      ) {
        throw Object.assign(
          new Error(
            `Grok reference materialization incomplete (${resolvedRefs.length}/${refIdsCapped.length})`,
          ),
          { code: "REF_UPLOAD_FAILED" },
        );
      }
      if (resolvedRefs.length < refIdsCapped.length) {
        emitLog2(
          `Grok: ${resolvedRefs.length}/${refIdsCapped.length} ref s\u1EB5n s\xE0ng; ti\u1EBFp t\u1EE5c v\u1EDBi \u1EA3nh \u0111\xE3 t\u1EA3i \u0111\u01B0\u1EE3c`,
          "warn",
        );
      }
      console.log("[REF_EDGE_AUDIT] Grok ref resolution", {
        nodeId: node.node_id,
        nodeRefFileIds: node.ref_file_ids || "",
        cappedIds: refIdsCapped,
        thumbnailKeys: Object.keys(node.ref_thumbnails || {}),
        resolvedCount: resolvedRefs.length,
      });
      let grokToken = null;
      if (window.ExecutionGate) {
        try {
          const gate = await window.ExecutionGate.request("grok_run", 1, {
            owner: "workflow",
            label: workflow2?.wf_name || "grok_node",
            provider: "grok",
            has_ref: resolvedRefs.length > 0,
            ref_count: resolvedRefs.length,
            parent_workflow_token: this._currentExecutionToken || null,
          });
          if (!gate?.allowed) {
            window.ExecutionGate.showDeniedDialog?.(gate, "Grok");
            const err = new Error(
              gate?.reason === "QUOTA_EXCEEDED"
                ? "\u0110\xE3 h\u1EBFt l\u01B0\u1EE3t Grok h\xF4m nay"
                : "Kh\xF4ng \u0111\u01B0\u1EE3c ph\xE9p ch\u1EA1y Grok",
            );
            err.code = gate?.reason || "QUOTA_EXCEEDED";
            node.last_error = "RATE_LIMIT";
            throw err;
          }
          grokToken = gate.token;
        } catch (e) {
          if (window.QuotaErrorHandler?.isQuotaError(e)) {
            node.last_error =
              e.code === "FEATURE_LOCKED" ? "FEATURE_LOCKED" : "RATE_LIMIT";
            throw e;
          }
          console.error(
            "[WorkflowExecutor] Grok ExecutionGate failed, ABORTING node (Server-Only):",
            e.message,
          );
          node.last_error = "GATE_REQUEST_FAILED";
          throw new Error(
            `Kh\xF4ng th\u1EC3 xin ph\xE9p server ch\u1EA1y Grok node: ${e.message || "unknown"}`,
          );
        }
      }
      try {
        const grokMode = node.grok_mode || "image";
        const grokRatio = node.ratio || "widescreen";
        const grokDuration = node.grok_duration || "6s";
        const grokResolution = node.grok_resolution || "720p";
        const grokImageQuality = node.grok_image_quality || "speed";
        const defaultTimeout =
          grokMode === "video"
            ? window.SystemConfig?.getTimeout("video_timeout_ms") || 6e5
            : window.SystemConfig?.getTimeout("image_timeout_ms") || 3e5;
        const grokTimeout = node.timeout_ms || defaultTimeout;
        emitLog2(
          `Grok submit: mode=${grokMode}, ratio=${grokRatio}, refs=${resolvedRefs.length}`,
        );
        if (window.eventBus) {
          window.eventBus.emit("execution:tracker_update", {
            owner: "workflow",
            phase: "grok_generating",
            promptText: `Grok generating ${grokMode}...`,
            genMode: grokMode,
          });
        }
        emitNodePhase(node.node_id, "generating");
        const result = await adapter.submit({
          prompt: node.prompt || "",
          refFileIds: resolvedRefs,
          shouldStop: () => this.shouldStop,
          settings: {
            mode: grokMode,
            model: node.model,
            videoInputType: node.video_input_type || "Ingredients",
            ratio: grokRatio,
            duration: grokDuration,
            resolution: grokResolution,
            imageQuality: grokImageQuality,
            timeout: grokTimeout,
          },
          taskName: workflow2?.wf_name || null,
        });
        if (result?.success) emitNodePhase(node.node_id, "downloading");
        if (!result || !result.success) {
          const errCode = result?.error || "IMAGE_GEN_FAILED";
          node.last_error = errCode;
          try {
            await window.storageManager?.updateNodeStatus(
              this.currentWorkflow?.wf_id || workflow2?.wf_id,
              node.node_id,
              { last_error: errCode },
            );
          } catch (e) {}
          if (grokToken && window.ExecutionGate) {
            await window.ExecutionGate.complete(grokToken, "failed").catch(
              () => {},
            );
            grokToken = null;
          }
          if (errCode === "SUBSCRIPTION_REQUIRED") {
            if (window.eventBus) {
              window.eventBus.emit("grok:subscription_required", {
                error: errCode,
                message: result?.message,
              });
            }
          }
          const err = this._createProviderFailureError("Grok", node, result);
          throw err;
        }
        node.last_error = null;
        const mediaType =
          result.mediaType || (grokMode === "video" ? "video" : "image");
        node.last_mode_used = mediaType;
        emitLog2(
          `Grok ${mediaType}: ${result.mediaUrls?.length || 0} k\u1EBFt qu\u1EA3`,
          "success",
        );
        const mediaUrls = Array.isArray(result.mediaUrls)
          ? result.mediaUrls
          : [];
        if (mediaUrls.length === 0) {
          throw new Error("Grok kh\xF4ng tr\u1EA3 v\u1EC1 URL media n\xE0o");
        }
        const uploadedTiles = [];
        const grokTabId = result.tabId || tabId;
        const _uploadRunStamp = Date.now();
        for (let i = 0; i < mediaUrls.length; i++) {
          const url = mediaUrls[i];
          const ext = mediaType === "video" ? "mp4" : "png";
          const fileName = `grok-${node.node_id}-${_uploadRunStamp}-${i + 1}.${ext}`;
          if (mediaType === "video") {
            const syntheticTileId = `grok_video_${Date.now()}_${i}`;
            uploadedTiles.push({
              tileId: syntheticTileId,
              thumbnail: result.mediaPosters?.[i] || url,
              video_url: url,
              file_name: fileName,
              type: "video",
            });
            emitLog2(
              `Video ${i + 1}/${mediaUrls.length}: skip bridge, d\xF9ng provider URL \u0111\u1EC3 download`,
            );
            continue;
          }
          const bridgeStartTime = Date.now();
          window.eventBus?.emit?.("workflow:bridge_upload", {
            workflowId: workflow2?.wf_id,
            nodeId: node.node_id,
            nodeName: node.node_name,
            provider: "grok",
            index: i + 1,
            total: mediaUrls.length,
            stage: "started",
          });
          try {
            if (!window.MessageBridge?.grokBridgeToFlow) {
              emitLog2(
                "MessageBridge.grokBridgeToFlow kh\xF4ng t\u1ED3n t\u1EA1i \u2014 fallback synthetic tile",
                "warn",
              );
              const syntheticTileId = `grok_${Date.now()}_${i}`;
              uploadedTiles.push({
                tileId: syntheticTileId,
                thumbnail: url,
                file_name: fileName,
                type: mediaType,
              });
              continue;
            }
            emitLog2(
              `[Grok Bridge] ${i + 1}/${mediaUrls.length}: Starting upload...`,
            );
            const bridgeResp = await window.MessageBridge.grokBridgeToFlow(
              url,
              grokTabId,
              fileName,
              (stage) =>
                window.eventBus?.emit?.("workflow:bridge_upload", {
                  workflowId: workflow2?.wf_id,
                  nodeId: node.node_id,
                  nodeName: node.node_name,
                  provider: "grok",
                  index: i + 1,
                  total: mediaUrls.length,
                  stage,
                }),
            );
            const bridgeDuration = Date.now() - bridgeStartTime;
            emitLog2(
              `[Grok Bridge] ${i + 1}/${mediaUrls.length}: Completed in ${bridgeDuration}ms`,
            );
            if (bridgeResp?.success && bridgeResp.tileId) {
              const thumbUrl = bridgeResp.thumbnailUrl || url;
              const flowFileName =
                bridgeResp.fileName || extractFileNameFromUrl(thumbUrl);
              uploadedTiles.push({
                tileId: bridgeResp.tileId,
                flowUploaded: true,
                thumbnail: thumbUrl,
                file_name: flowFileName,
                type: mediaType,
                media_uuid:
                  bridgeResp.media_uuid ||
                  (bridgeResp.api_driver &&
                  /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(
                    bridgeResp.tileId,
                  )
                    ? bridgeResp.tileId
                    : null),
                api_driver: bridgeResp.api_driver || null,
                project_id: bridgeResp.project_id || null,
              });
              emitLog2(
                `Bridge ${i + 1}/${mediaUrls.length}: tileId=${bridgeResp.tileId.substring(0, 16)}` +
                  (flowFileName
                    ? `, file_name=${flowFileName.substring(0, 16)}`
                    : ""),
              );
            } else {
              const errReason = bridgeResp?.error || "unknown";
              emitLog2(
                `Grok bridge ${errReason} \u2192 fallback synthetic tile (${i + 1}/${mediaUrls.length})`,
                "warn",
              );
              const syntheticTileId = `grok_${Date.now()}_${i}`;
              uploadedTiles.push({
                tileId: syntheticTileId,
                thumbnail: url,
                file_name: fileName,
                type: mediaType,
              });
            }
          } catch (bErr) {
            emitLog2(
              `Grok bridge exception: ${bErr.message} \u2192 fallback synthetic`,
              "warn",
            );
            const syntheticTileId = `grok_${Date.now()}_${i}_err`;
            uploadedTiles.push({
              tileId: syntheticTileId,
              thumbnail: url,
              file_name: fileName,
              type: mediaType,
            });
          } finally {
            window.eventBus?.emit?.("workflow:bridge_upload", {
              workflowId: workflow2?.wf_id,
              nodeId: node.node_id,
              nodeName: node.node_name,
              provider: "grok",
              index: i + 1,
              total: mediaUrls.length,
              stage: uploadedTiles[i]?.flowUploaded ? "completed" : "failed",
            });
          }
        }
        node.result_file_ids = uploadedTiles.map((t) => t.tileId).join(", ");
        node.result_thumbnails = uploadedTiles.reduce((acc, t) => {
          acc[t.tileId] = {
            thumbnail: t.thumbnail,
            type: t.type || "image",
            file_name: t.file_name || "",
            ...(t.video_url && { video_url: t.video_url }),
            ...(t.media_uuid && { media_uuid: t.media_uuid }),
            ...(t.api_driver && {
              api_driver: t.api_driver,
              identity_kind: "flow-api-uuid",
              identity_durability: "durable-resolver",
            }),
            ...(t.project_id && { project_id: t.project_id }),
          };
          return acc;
        }, {});
        node.result_file_names = uploadedTiles.reduce((acc, t) => {
          if (t.file_name) acc[t.tileId] = t.file_name;
          return acc;
        }, {});
        node.result_provider_urls = uploadedTiles.reduce((acc, t, idx) => {
          const url = mediaUrls?.[idx];
          if (t.tileId && url) {
            acc[t.tileId] = {
              url,
              provider: "grok",
              media_type: t.type || mediaType || "image",
              tab_id: grokTabId,
              captured_at: Date.now(),
            };
          }
          return acc;
        }, {});
        if (typeof MediaRegistry !== "undefined") {
          for (const t of uploadedTiles) {
            if (t.thumbnail) MediaRegistry.setThumb?.(t.tileId, t.thumbnail);
            if (t.file_name) MediaRegistry.setFileName?.(t.tileId, t.file_name);
          }
        }
        const canUseAutoDownload =
          window.featureGate?.canUse("auto_download") ?? false;
        const nodeAutoDownload =
          canUseAutoDownload &&
          (node.auto_download === true ||
            node.auto_download === "1" ||
            node.auto_download === 1);
        if (nodeAutoDownload && mediaUrls.length > 0 && grokTabId) {
          emitLog2(
            `Auto-download ${mediaUrls.length} media Grok (background)...`,
          );
          const downloads = (async () => {
            try {
              const _wfGrokDl = await window.DownloadHelper.getSettings();
              const _wfGrokDownloadFolder = _wfGrokDl.folder;
              const _wfGrokDownloadTemplate = _wfGrokDl.template;
              for (let urlIdx = 0; urlIdx < mediaUrls.length; urlIdx++) {
                const url = mediaUrls[urlIdx];
                let downloaded = false;
                window.eventBus?.emit?.("workflow:download", {
                  workflowId: workflow2?.wf_id,
                  nodeId: node.node_id,
                  nodeName: node.node_name,
                  key: `grok:${urlIdx}`,
                  index: urlIdx + 1,
                  total: mediaUrls.length,
                  stage: "started",
                });
                try {
                  const ext = mediaType === "video" ? "mp4" : "png";
                  let filename = window.DownloadHelper.buildFilename({
                    template: _wfGrokDownloadTemplate,
                    project: _wfGrokDl.project || window._currentProjectName,
                    prompt: node.prompt || "",
                    index: urlIdx + 1,
                    taskName: workflow2?.wf_name,
                    folder: _wfGrokDownloadFolder,
                    ext,
                  });
                  if (ext !== "png" && filename.endsWith(".png")) {
                    filename = filename.replace(/\.png$/i, `.${ext}`);
                  }
                  const _pre =
                    result.fetchedMedia?.find((f) => f.url === url)?.base64 ||
                    null;
                  const dl = (await window.MessageBridge?.grokDownloadMedia?.(
                    url,
                    grokTabId,
                    filename,
                    _pre,
                    { nativeFirst: mediaUrls.length === 1 },
                  )) || {
                    success: false,
                    tier: 0,
                    error: "MessageBridge unavailable",
                  };
                  downloaded = dl.success === true;
                  if (!dl.success)
                    emitLog2(
                      `Grok download fail (Tier ${dl.tier}): ${dl.error || "unknown"}`,
                      "warn",
                    );
                  else if (dl.tier === 0)
                    emitLog2("Grok native Download completed", "success");
                  else if (dl.tier === 3)
                    emitLog2(`Grok download OK (Tier 3 direct URL)`, "success");
                } catch (dlErr) {
                  emitLog2(
                    `Grok auto-download l\u1ED7i: ${dlErr.message}`,
                    "warn",
                  );
                } finally {
                  window.eventBus?.emit?.("workflow:download", {
                    workflowId: workflow2?.wf_id,
                    nodeId: node.node_id,
                    nodeName: node.node_name,
                    key: `grok:${urlIdx}`,
                    index: urlIdx + 1,
                    total: mediaUrls.length,
                    stage: downloaded ? "completed" : "failed",
                  });
                }
              }
              emitLog2(`Auto-download Grok ho\xE0n t\u1EA5t`, "success");
            } catch (e) {
              emitLog2(`Auto-download Grok bg error: ${e.message}`, "error");
            }
          })().catch(() => {});
          await downloads;
        }
        if (grokToken && window.ExecutionGate) {
          await window.ExecutionGate.complete(grokToken, "success").catch(
            () => {},
          );
        }
        const fileIds = uploadedTiles.map((t) => t.tileId);
        const duration = Date.now() - startTime;
        emitLog2(
          `Grok Image node ho\xE0n t\u1EA5t: ${fileIds.length} media trong ${duration}ms`,
          "success",
        );
        return {
          fileIds: fileIds.length > 0 ? fileIds : mediaUrls,
          duration,
          thumbnails: node.result_thumbnails,
          fileNames: node.result_file_names,
          grokResult: result,
          refFileIdsUsed: resolvedRefIds,
        };
      } catch (err) {
        if (grokToken && window.ExecutionGate) {
          await window.ExecutionGate.complete(grokToken, "failed").catch(
            () => {},
          );
        }
        if (!node.last_error) {
          node.last_error = err?.code || "IMAGE_GEN_FAILED";
        }
        try {
          await window.storageManager?.updateNodeStatus(
            this.currentWorkflow?.wf_id || workflow2?.wf_id,
            node.node_id,
            {
              last_error: node.last_error,
              last_mode_used: node.last_mode_used,
            },
          );
        } catch (e) {}
        throw err;
      }
    }
    async _executePromptNode(node, workflow2, emitLog2) {
      const startTime = Date.now();
      const useAi = node.use_ai === true && node.multi_prompt !== true;
      console.log(
        `[PromptNode] START: nodeId=${node.node_id}, use_ai=${useAi}, provider=${node.provider}, hasFeatureGate=${!!window.featureGate}`,
      );
      if (
        window.featureGate &&
        !window.featureGate.canUse("prompt_node_enabled")
      ) {
        console.warn(
          `[PromptNode] FEATURE_LOCKED: prompt_node_enabled = false`,
        );
        const err = new Error(
          "Prompt node ch\u01B0a \u0111\u01B0\u1EE3c k\xEDch ho\u1EA1t cho g\xF3i hi\u1EC7n t\u1EA1i",
        );
        err.code = "FEATURE_LOCKED";
        node.last_error = "FEATURE_LOCKED";
        throw err;
      }
      const originalNodePrompt = node.prompt || "";
      const promptHasMention =
        typeof parseMentions === "function"
          ? parseMentions(originalNodePrompt).length > 0
          : /@[a-z][a-z0-9_]{0,29}(?![a-z0-9@._:-])/i.test(originalNodePrompt);
      const promptMode = node.prompt_mode || "auto";
      const refMode = node.ref_mode || "auto";
      const shouldSubstituteInline =
        promptMode === "mention" ||
        (promptMode === "auto" && promptHasMention) ||
        refMode === "mention";
      let portTextOverridden = false;
      if (!shouldSubstituteInline) {
        try {
          const combinedResult = this._combineUpstreamTexts(node, workflow2);
          if (combinedResult) {
            node.prompt = [originalNodePrompt.trim(), combinedResult.text]
              .filter(Boolean)
              .join("\n\n");
            portTextOverridden = true;
            emitLog2(
              `Prompt node gi\u1EEF ${originalNodePrompt.length} chars instruction + text t\u1EEB ${combinedResult.sources.length} upstream(s): len=${node.prompt.length}`,
            );
            console.info(
              "[PromptTextAudit]",
              JSON.stringify({
                stage: "ai_node_text_inputs",
                nodeId: node.node_id,
                mode: promptMode,
                ownChars: originalNodePrompt.length,
                combinedChars: node.prompt.length,
                sources: combinedResult.sources.map((source) => ({
                  name: source.nodeName,
                  chars: source.text.length,
                })),
              }),
            );
          }
        } catch (err) {
          emitLog2(
            'L\u1ED7i collect port "text" prompt node: ' + err.message,
            "warn",
          );
        }
      } else {
        console.log(
          `[PromptNode] SKIP port-based combine \u2014 prompt c\xF3 @mention (mode=${promptMode}) \u2192 inline substitute thay v\xEC override`,
        );
      }
      if (shouldSubstituteInline && !portTextOverridden) {
        try {
          const nodesBySlug = buildNodesBySlug(workflow2.nodes || []);
          const { warnings, errors } = validateMentions(node, nodesBySlug);
          for (const w of warnings)
            emitLog2(`[Mention] Warning: ${w.message}`, "warn");
          for (const e of errors)
            emitLog2(`[Mention] Error: ${e.message}`, "error");
          const savedMode = node.prompt_mode;
          if (promptMode === "auto") node.prompt_mode = "mention";
          const resolvedPrompt = resolvePromptMentions(node, nodesBySlug);
          node.prompt_mode = savedMode;
          if (resolvedPrompt !== originalNodePrompt) {
            console.log(
              `[PromptNode][Mention] Resolved: "${originalNodePrompt.substring(0, 100)}..." \u2192 "${resolvedPrompt.substring(0, 100)}..."`,
            );
            node.prompt = resolvedPrompt;
            emitLog2(
              `Prompt mention resolved (mode=${promptMode}): ${originalNodePrompt.length} \u2192 ${resolvedPrompt.length} chars`,
            );
          }
        } catch (err) {
          emitLog2("Mention resolve error: " + err.message, "warn");
          console.warn("[PromptNode] Mention resolve failed:", err);
        }
      }
      const promptText = (node.prompt || "").trim();
      if (!promptText) {
        const err = new Error("Prompt node: n\u1ED9i dung prompt r\u1ED7ng");
        err.code = "EMPTY_PROMPT";
        node.last_error = "EMPTY_PROMPT";
        throw err;
      }
      const promptOwnRefIds = String(node.ref_file_ids || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      let promptPortRefIds = [];
      if (useAi) {
        try {
          const imageNodeTypes = new Set([
            "image",
            "generate",
            "chatgpt",
            "grok",
            "gemini",
            "muse",
          ]);
          const imageRefEdges = (workflow2.edges || []).filter((edge) => {
            if (
              edge.target_node_id !== node.node_id ||
              edge.target_port !== "image_ref"
            )
              return false;
            const source = (workflow2.nodes || []).find(
              (item) => item.node_id === edge.source_node_id,
            );
            return (
              !!source && imageNodeTypes.has(source.node_type || source.type)
            );
          });
          const nodesBySlug = buildNodesBySlug(workflow2.nodes || []);
          const useMentionRefs =
            refMode === "mention" ||
            (refMode === "auto" &&
              parseMentions(originalNodePrompt).some((slug) =>
                imageNodeTypes.has(nodesBySlug.get(slug)?.node_type),
              ));
          const mentionedRefs = useMentionRefs
            ? resolveMentionedRefImages(
                { ...node, prompt: originalNodePrompt, ref_mode: "mention" },
                nodesBySlug,
              )
            : null;
          const portImageRefs =
            mentionedRefs !== null
              ? mentionedRefs.map((ref) => ref.fileId)
              : this._collectPortInputs(
                  node,
                  "image_ref",
                  workflow2.nodes,
                  imageRefEdges,
                );
          promptPortRefIds = portImageRefs;
          if (portImageRefs.length > 0 || mentionedRefs !== null) {
            const existing =
              mentionedRefs !== null
                ? []
                : (node.ref_file_ids || "")
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
            const combined = [...new Set([...existing, ...portImageRefs])];
            if (!node._original_ref_state) {
              node._original_ref_state = {
                ref_file_ids: node.ref_file_ids || "",
                ref_thumbnails: { ...(node.ref_thumbnails || {}) },
                ref_file_names: { ...(node.ref_file_names || {}) },
              };
            }
            if (!node._portMergedRefIds) node._portMergedRefIds = new Set();
            for (const id of portImageRefs) {
              if (!promptOwnRefIds.includes(id)) node._portMergedRefIds.add(id);
            }
            node.ref_file_ids = combined.join(", ");
            if (mentionedRefs !== null) {
              node.ref_thumbnails = {};
              node.ref_file_names = {};
              for (const ref of mentionedRefs) {
                if (ref.thumbnail)
                  node.ref_thumbnails[ref.fileId] = ref.thumbnail;
                if (ref.fileName)
                  node.ref_file_names[ref.fileId] = ref.fileName;
              }
            }
            if (!node.ref_thumbnails || Array.isArray(node.ref_thumbnails))
              node.ref_thumbnails = {};
            if (!node.ref_file_names || Array.isArray(node.ref_file_names))
              node.ref_file_names = {};
            for (const edge of mentionedRefs !== null ? [] : imageRefEdges) {
              const src = workflow2.nodes.find(
                (n) => n.node_id === edge.source_node_id,
              );
              if (!src) continue;
              const srcThumbs = {
                ...(src.ref_thumbnails || {}),
                ...(src.result_thumbnails || {}),
              };
              const srcNames = {
                ...(src.ref_file_names || {}),
                ...(src.result_file_names || {}),
              };
              for (const [fid, thumb] of Object.entries(srcThumbs)) {
                if (!node.ref_thumbnails[fid]) node.ref_thumbnails[fid] = thumb;
              }
              for (const [fid, fname] of Object.entries(srcNames)) {
                if (!node.ref_file_names[fid]) node.ref_file_names[fid] = fname;
              }
            }
            for (const fid of portImageRefs) {
              if (
                !node.ref_thumbnails[fid] &&
                typeof MediaRegistry !== "undefined" &&
                MediaRegistry.getThumb?.(fid)
              ) {
                node.ref_thumbnails[fid] = MediaRegistry.getThumb(fid);
              }
            }
            emitLog2(
              mentionedRefs !== null
                ? `Prompt node mention refs: ${combined.length} \u1EA3nh t\u1EEB @mentions`
                : `Prompt node port "image_ref" merge: +${portImageRefs.length} \u1EA3nh (t\u1ED5ng ${combined.length})`,
            );
          }
        } catch (err) {
          emitLog2(
            'L\u1ED7i collect port "image_ref" prompt node: ' + err.message,
            "warn",
          );
        }
      }
      if (!useAi) {
        console.log(
          `[PromptNode] BRANCH 1: use_ai=false \u2192 plain pass-through (len=${promptText.length})`,
        );
        node.result_text = this._normalizeExtractedText(promptText);
        node.result_source = "plain";
        node.last_error = null;
        emitLog2(
          `AI Agent node: pass-through plain text (len=${node.result_text.length})`,
        );
        if (originalNodePrompt !== node.prompt) {
          node.prompt = originalNodePrompt;
        }
        const duration = Date.now() - startTime;
        return { fileIds: [], duration, resultText: promptText };
      }
      const _nodeTypeCfg =
        window.NodeTemplates?.getType?.("prompt")?.config || {};
      const _aiFeatureKey = _nodeTypeCfg.ai_feature_key || "ai_agent_enabled";
      console.log(
        `[PromptNode] BRANCH 2: use_ai=true, checking feature gate '${_aiFeatureKey}'...`,
      );
      if (window.featureGate && !window.featureGate.canUse(_aiFeatureKey)) {
        console.warn(
          `[PromptNode] ${_aiFeatureKey} = false \u2192 fallback plain. Plan: ${window.featureGate?._currentPlan || "unknown"}`,
        );
        emitLog2(
          `${_aiFeatureKey} = false \u2192 fallback sang plain text`,
          "warn",
        );
        node.result_text = this._normalizeExtractedText(promptText);
        node.result_source = "plain_fallback";
        node.last_error = null;
        if (typeof window.showNotification === "function") {
          const _nodeName =
            node.node_name ||
            window.I18n?.t?.("node.aiAgentNodeDefault") ||
            "AI Agent";
          const _msg = (
            window.I18n?.t?.("workflow.aiAgentNoPermFallback", {
              node: _nodeName,
            }) ||
            `${_nodeName}: your current plan does not include AI Agent \u2014 used plain text instead. Upgrade to Premium to unlock.`
          ).replace("{node}", _nodeName);
          window.showNotification(_msg, "warning", 5e3);
        }
        if (originalNodePrompt !== node.prompt) {
          node.prompt = originalNodePrompt;
        }
        const duration = Date.now() - startTime;
        return { fileIds: [], duration, resultText: promptText };
      }
      console.log(
        `[PromptNode] Feature gate OK. Getting adapter for provider=${node.provider}...`,
      );
      const providerKey = node.provider || "chatgpt";
      if (!window.ProviderRegistry) {
        console.error(
          `[PromptNode] ProviderRegistry KH\xD4NG s\u1EB5n s\xE0ng`,
        );
        throw new Error("ProviderRegistry ch\u01B0a s\u1EB5n s\xE0ng");
      }
      const adapter = window.ProviderRegistry.get(providerKey);
      if (!adapter) {
        console.error(
          `[PromptNode] Adapter ${providerKey} KH\xD4NG kh\u1EA3 d\u1EE5ng`,
        );
        throw new Error(`Provider ${providerKey} kh\xF4ng kh\u1EA3 d\u1EE5ng`);
      }
      if (typeof adapter.submitText !== "function") {
        console.error(
          `[PromptNode] Adapter ${providerKey} kh\xF4ng c\xF3 submitText method`,
        );
        throw new Error(
          `Adapter ${providerKey} kh\xF4ng h\u1ED7 tr\u1EE3 submitText()`,
        );
      }
      console.log(
        `[PromptNode] Adapter ${providerKey} OK. Requesting ExecutionGate...`,
      );
      const _allowedProviders = new Set(["chatgpt", "gemini", "grok"]);
      const action = _allowedProviders.has(providerKey)
        ? `${providerKey}_run`
        : "chatgpt_run";
      const providerRefCount = String(node.ref_file_ids || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean).length;
      if (
        providerRefCount > 0 &&
        (providerKey === "chatgpt" || providerKey === "gemini") &&
        !window.featureGate?.canUseProviderRefImages?.(providerKey)
      ) {
        throw Object.assign(
          new Error(`${providerKey.toUpperCase()}_REF_IMAGES_NOT_ALLOWED`),
          { code: "FEATURE_LOCKED" },
        );
      }
      let token = null;
      if (window.ExecutionGate) {
        try {
          const gate = await window.ExecutionGate.request(action, 1, {
            owner: "workflow",
            label: `Prompt enhance (${providerKey})`,
            provider: providerKey,
            has_ref: providerRefCount > 0,
            ref_count: providerRefCount,
            parent_workflow_token: this._currentExecutionToken || null,
          });
          if (!gate?.allowed) {
            window.ExecutionGate.showDeniedDialog?.(gate, "Prompt enhance");
            const err = new Error(
              gate?.reason === "QUOTA_EXCEEDED"
                ? `\u0110\xE3 h\u1EBFt l\u01B0\u1EE3t ${providerKey} h\xF4m nay`
                : `Kh\xF4ng \u0111\u01B0\u1EE3c ph\xE9p ch\u1EA1y ${providerKey}`,
            );
            err.code = gate?.reason || "QUOTA_EXCEEDED";
            node.last_error = "RATE_LIMIT";
            throw err;
          }
          token = gate.token;
        } catch (e) {
          if (window.QuotaErrorHandler?.isQuotaError(e)) {
            node.last_error =
              e.code === "FEATURE_LOCKED" ? "FEATURE_LOCKED" : "RATE_LIMIT";
            throw e;
          }
          node.last_error = e?.code || "EXECUTION_GATE_FAILED";
          throw e;
        }
      }
      try {
        console.log(
          `[PromptNode] Calling adapter.ensureReady() for ${providerKey}...`,
        );
        const ready = await adapter.ensureReady();
        console.log(`[PromptNode] ensureReady result:`, ready);
        if (!ready || !ready.ready) {
          if (window.eventBus && providerKey === "chatgpt") {
            window.eventBus.emit("chatgpt:login_required", {
              error: ready?.error || "NOT_LOGGED_IN",
            });
          } else if (window.eventBus && providerKey === "gemini") {
            window.eventBus.emit("gemini:login_required", {
              error: ready?.error || "NOT_LOGGED_IN",
            });
          }
          const err = new Error(
            `${providerKey} ch\u01B0a s\u1EB5n s\xE0ng: ${ready?.error || "NOT_LOGGED_IN"}`,
          );
          err.code = ready?.error || "NOT_READY";
          node.last_error = err.code;
          throw err;
        }
        if (
          providerKey === "chatgpt" &&
          window.ChatGPTSession?.ensureTabActive
        ) {
          await window.ChatGPTSession.ensureTabActive();
        } else if (
          providerKey === "grok" &&
          window.GrokSession?.ensureTabActive
        ) {
          await window.GrokSession.ensureTabActive({ focusWindow: false });
        } else if (
          providerKey === "gemini" &&
          window.GeminiSession?.ensureTabActive
        ) {
          await window.GeminiSession.ensureTabActive();
        }
        if (
          !node.ref_file_ids &&
          (Object.keys(node.ref_file_names || {}).length > 0 ||
            Object.keys(node.ref_thumbnails || {}).length > 0)
        ) {
          emitLog2(
            "Prompt node: b\u1ECF qua metadata ref m\u1ED3 c\xF4i v\xEC ref_file_ids \u0111ang r\u1ED7ng",
            "warn",
          );
        }
        if (
          node.ref_file_ids &&
          node.ref_file_ids.includes("upload_") &&
          typeof window.uploadPendingFiles === "function"
        ) {
          const oldRefIds = node.ref_file_ids;
          emitLog2("Upload pending refs cho prompt node...");
          try {
            node.ref_file_ids = await window.uploadPendingFiles(
              node.ref_file_ids,
            );
            if (node.ref_file_ids !== oldRefIds) {
              const newIdArr = (node.ref_file_ids || "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              if (!node.ref_file_names) node.ref_file_names = {};
              for (const newId of newIdArr) {
                if (
                  typeof MediaRegistry !== "undefined" &&
                  MediaRegistry.getFileName?.(newId)
                ) {
                  node.ref_file_names[newId] = MediaRegistry.getFileName(newId);
                }
              }
            }
          } catch (uploadError) {
            node.ref_file_ids = oldRefIds;
            emitLog2(
              `Prompt node: upload ref l\u1ED7i (${uploadError?.message || "unknown"}); b\u1ECF qua ref l\u1ED7i v\xE0 ti\u1EBFp t\u1EE5c`,
              "warn",
            );
          }
          const pendingCount = String(node.ref_file_ids || "")
            .split(",")
            .map((id) => id.trim())
            .filter((id) => id.startsWith("upload_")).length;
          if (pendingCount > 0) {
            emitLog2(
              `Prompt node: b\u1ECF qua ${pendingCount} local ref ch\u01B0a upload; ti\u1EBFp t\u1EE5c b\u1EB1ng ref kh\u1EA3 d\u1EE5ng ho\u1EB7c text`,
              "warn",
            );
          }
        }
        const requestedEnhanceRefs = String(node.ref_file_ids || "")
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean);
        const materializableRefIds = requestedEnhanceRefs.filter(
          (id) => !id.startsWith("upload_"),
        );
        const resolvedRefs = await this._resolveRefImagesForLLM(
          { ...node, ref_file_ids: materializableRefIds.join(", ") },
          adapter,
        );
        let providerMaxRefs = null;
        try {
          providerMaxRefs = adapter?.capabilities?.maxRefImages ?? null;
        } catch (_) {}
        console.info(
          "[PromptRefAudit]",
          JSON.stringify({
            nodeId: node.node_id,
            provider: providerKey,
            ownRefCount: promptOwnRefIds.length,
            portRefCount: promptPortRefIds.length,
            requestedRefCount: requestedEnhanceRefs.length,
            materializableRefCount: materializableRefIds.length,
            resolvedRefCount: resolvedRefs.length,
            providerMaxRefs,
            textMentions:
              typeof parseMentions === "function"
                ? parseMentions(originalNodePrompt)
                : [],
          }),
        );
        if (resolvedRefs.length < requestedEnhanceRefs.length) {
          emitLog2(
            `Prompt: ${resolvedRefs.length}/${requestedEnhanceRefs.length} ref s\u1EB5n s\xE0ng; ${resolvedRefs.length === 0 ? "ti\u1EBFp t\u1EE5c b\u1EB1ng prompt text" : "ti\u1EBFp t\u1EE5c v\u1EDBi \u1EA3nh \u0111\xE3 t\u1EA3i \u0111\u01B0\u1EE3c"}`,
            "warn",
          );
        }
        if (resolvedRefs.length > 0) {
          emitLog2(
            `\u0110\xE3 resolve ${resolvedRefs.length} ref image(s) cho prompt enhance`,
          );
        }
        const baseTimeoutSec = parseInt(node.timeout_sec, 10) || 60;
        const lengthBonusSec = Math.min(
          120,
          Math.floor((promptText?.length || 0) / 100),
        );
        const totalTimeoutSec = baseTimeoutSec + lengthBonusSec;
        const timeoutMs = totalTimeoutSec * 1e3;
        emitLog2(
          `Prompt enhance via ${providerKey} (timeout ${totalTimeoutSec}s = base ${baseTimeoutSec}s + ${lengthBonusSec}s adaptive cho prompt ${promptText?.length || 0} chars)...`,
        );
        if (window.eventBus) {
          window.eventBus.emit("execution:tracker_update", {
            owner: "workflow",
            phase: "prompt_enhancing",
            promptText: `Enhancing via ${providerKey}...`,
            genMode: "text",
          });
        }
        let enhanceResult = null;
        let enhanceError = null;
        try {
          console.log(
            `[PromptNode] Calling adapter.submitText for ${providerKey}, timeout=${timeoutMs}ms...`,
          );
          console.info(
            "[PromptTextAudit]",
            JSON.stringify({
              stage: "ai_node_submit",
              nodeId: node.node_id,
              provider: providerKey,
              chars: promptText.length,
              delimiters: Object.fromEntries(
                ["[", "]", "<", ">"].map((symbol) => [
                  symbol,
                  promptText.split(symbol).length - 1,
                ]),
              ),
            }),
          );
          enhanceResult = await adapter.submitText({
            prompt: promptText,
            refFileIds: resolvedRefs,
            timeout: timeoutMs,
          });
          console.log(`[PromptNode] submitText returned:`, {
            success: enhanceResult?.success,
            textLen: enhanceResult?.text?.length || 0,
            error: enhanceResult?.error,
          });
        } catch (submitErr) {
          enhanceError = submitErr;
          const errCode = submitErr?.code || submitErr?.message || "UNKNOWN";
          console.error(`[PromptNode] submitText THREW:`, submitErr);
          emitLog2(`Enhance error: ${errCode}`, "warn");
        }
        const enhancedText = (enhanceResult?.text || "").trim();
        if (enhanceError || !enhancedText) {
          const preSubmitErrors = new Set([
            "COMPOSER_DIRTY",
            "NEW_CHAT_NOT_READY",
            "EDITOR_NOT_FOUND",
            "SUBMIT_FAILED",
            "SUBMIT_FAILED_NEED_RELOAD",
            "SUBMIT_LOST",
            "GEMINI_LISTENER_NOT_READY",
            "GEMINI_LISTENER_UNRESPONSIVE",
            "INSERT_FAILED",
            "SEND_BUTTON_NOT_FOUND",
          ]);
          const submitErrorCode =
            enhanceError?.code || enhanceError?.message || "";
          const canFallback =
            node.ai_fallback !== false && !preSubmitErrors.has(submitErrorCode);
          if (canFallback) {
            const errCode = enhanceError?.code || enhanceError?.message || "";
            const reason = enhanceError ? errCode : "empty response";
            emitLog2(
              `${providerKey} ${reason} \u2014 fallback sang plain text`,
              "warn",
            );
            node.result_text = this._normalizeExtractedText(promptText);
            node.result_source = "plain_fallback";
            node.last_error = null;
            if (typeof window.showNotification === "function") {
              let notifMsg = `${node.node_name || "Prompt"}: ${providerKey} kh\xF4ng ph\u1EA3n h\u1ED3i, \u0111\xE3 d\xF9ng plain text.`;
              if (errCode === "IMAGE_GENERATION_DETECTED") {
                notifMsg = `${node.node_name || "Prompt"}: ${providerKey} t\u1EA1o \u1EA3nh thay v\xEC tr\u1EA3 prompt text \u2014 \u0111\xE3 d\xF9ng plain text.`;
              }
              window.showNotification(notifMsg, "warning", 5e3);
            }
          } else {
            if (token && window.ExecutionGate) {
              await window.ExecutionGate.complete(token, "failed").catch(
                () => {},
              );
            }
            const err =
              enhanceError ||
              new Error(`${providerKey} tr\u1EA3 v\u1EC1 empty text`);
            err.code = err.code || "ENHANCE_FAILED";
            node.last_error = err.code;
            throw err;
          }
        } else {
          node.result_text = this._normalizeExtractedText(enhancedText);
          node.result_source = providerKey;
          node.last_error = null;
          emitLog2(
            `Prompt enhance ho\xE0n t\u1EA5t: len=${node.result_text.length}`,
          );
        }
        console.log("[PromptNode] Delete conversation check:", {
          ai_delete_after_run: node.ai_delete_after_run,
          result_source: node.result_source,
          providerKey,
          conditionMatch:
            node.ai_delete_after_run === true &&
            node.result_source === providerKey,
        });
        if (
          node.ai_delete_after_run === true &&
          node.result_source === providerKey
        ) {
          try {
            emitLog2(`Delete ${providerKey} conversation sau enhance...`);
            let delResult = null;
            if (
              providerKey === "chatgpt" &&
              window.ChatGPTSession?.deleteLastMessage
            ) {
              delResult = await window.ChatGPTSession.deleteLastMessage();
            } else if (
              providerKey === "gemini" &&
              window.GeminiSession?.deleteCurrentConversation
            ) {
              delResult =
                await window.GeminiSession.deleteCurrentConversation();
            }
            if (delResult?.success) {
              emitLog2(`\u2713 \u0110\xE3 x\xF3a ${providerKey} conversation`);
            } else {
              emitLog2(
                `\u26A0 Delete ${providerKey} conversation th\u1EA5t b\u1EA1i: ${delResult?.error || "unknown"}`,
                "warn",
              );
            }
          } catch (delErr) {
            emitLog2(
              `\u26A0 Delete ${providerKey} exception: ${delErr.message}`,
              "warn",
            );
          }
        }
        if (token && window.ExecutionGate) {
          const providerSucceeded = node.result_source === providerKey;
          await window.ExecutionGate.complete(
            token,
            providerSucceeded ? "success" : "failed",
          ).catch(() => {});
        }
        if (originalNodePrompt !== node.prompt) {
          node.prompt = originalNodePrompt;
          console.log(
            "[PromptNode] Restored node.prompt v\u1EC1 original sau AI submit",
          );
        }
        const duration = Date.now() - startTime;
        return { fileIds: [], duration, resultText: node.result_text };
      } catch (err) {
        if (token && window.ExecutionGate) {
          await window.ExecutionGate.complete(token, "failed").catch(() => {});
        }
        if (
          typeof originalNodePrompt === "string" &&
          originalNodePrompt !== node.prompt
        ) {
          node.prompt = originalNodePrompt;
        }
        if (!node.last_error) {
          node.last_error = err?.code || err?.message || "PROMPT_FAILED";
        }
        throw err;
      }
    }
    async _executeTextExtractNode(node, workflow2, emitLog2, startTime) {
      const _now = startTime || Date.now();
      const log2 = (msg, type = "info") => emitLog2(msg, type);
      let upstreamText = "";
      try {
        const combined = this._combineUpstreamTexts(node, workflow2);
        if (combined && combined.text) {
          upstreamText = combined.text;
          log2(
            `Text Extract: nh\u1EADn ${combined.text.length} chars text t\u1EEB ${combined.sources.length} upstream(s)`,
          );
          console.log(
            `[TextExtract] "${node.node_name}" upstream text len=${combined.text.length} | first 200: ${JSON.stringify(combined.text.substring(0, 200))} | last 200: ${JSON.stringify(combined.text.substring(combined.text.length - 200))}`,
          );
        }
      } catch (e) {
        log2(`L\u1ED7i collect upstream text: ${e.message}`, "warn");
      }
      if (!upstreamText) {
        const inputEdges = (workflow2.edges || []).filter(
          (e) => e.target_node_id === node.node_id,
        );
        for (const edge of inputEdges) {
          const src = (workflow2.nodes || []).find(
            (n) => n.node_id === edge.source_node_id,
          );
          if (src?.result_text) {
            upstreamText += (upstreamText ? "\n" : "") + src.result_text;
          } else if (src?.prompt) {
            upstreamText += (upstreamText ? "\n" : "") + src.prompt;
          }
        }
      }
      if (!upstreamText) {
        const err = new Error(
          "Text Extract: upstream text r\u1ED7ng \u2014 ch\u01B0a connect text input ho\u1EB7c upstream ch\u01B0a execute",
        );
        err.code = "EMPTY_UPSTREAM";
        throw err;
      }
      const mode = node.extract_mode || "marker";
      const marker = (node.extract_marker || "").trim();
      const customRegex = (node.extract_regex || "").trim();
      const strict = node.extract_strict === true;
      const multiMatch = node.extract_multi_match || "first";
      const onFail = node.extract_on_fail || "skip_downstream";
      try {
        let extractedText = null;
        if (mode === "json") {
          if (!marker) {
            throw new Error("JSON key (extract_marker) r\u1ED7ng");
          }
          let parsed;
          try {
            const cleaned = upstreamText
              .replace(/^\s*```(?:json)?\s*/i, "")
              .replace(/\s*```\s*$/i, "")
              .trim();
            parsed = JSON.parse(cleaned);
          } catch (e) {
            throw new Error(
              `Upstream kh\xF4ng ph\u1EA3i JSON h\u1EE3p l\u1EC7: ${e.message}`,
            );
          }
          const value = parsed && parsed[marker];
          if (value === void 0 || value === null) {
            return this._handleExtractFail(
              node,
              `JSON key '${marker}' kh\xF4ng t\u1ED3n t\u1EA1i trong upstream`,
              onFail,
              _now,
              log2,
            );
          }
          extractedText =
            typeof value === "string" ? value : JSON.stringify(value);
          log2(
            `Text Extract JSON key '${marker}' \u2192 ${extractedText.length} chars`,
          );
        } else {
          let regex;
          if (mode === "regex") {
            if (!customRegex)
              throw new Error("Custom regex (extract_regex) r\u1ED7ng");
            try {
              regex = new RegExp(customRegex, strict ? "g" : "gi");
            } catch (e) {
              throw new Error(`Regex pattern invalid: ${e.message}`);
            }
          } else {
            if (!marker)
              throw new Error("Marker name (extract_marker) r\u1ED7ng");
            const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const flexibleMarker = strict
              ? escapedMarker
              : escapedMarker.replace(/[_\s\\-]/g, "[_\\s-]*");
            const pattern = `\\[${flexibleMarker}\\]\\s*:?\\s*([\\s\\S]+?)(?=\\n\\s*\\[\\w|$)`;
            regex = new RegExp(pattern, strict ? "g" : "gi");
          }
          const matches = [...upstreamText.matchAll(regex)];
          if (matches.length === 0) {
            return this._handleExtractFail(
              node,
              `Kh\xF4ng t\xECm th\u1EA5y marker '${marker || customRegex}' trong upstream output`,
              onFail,
              _now,
              log2,
            );
          }
          if (matches.length > 1 && multiMatch === "error") {
            throw new Error(
              `Text Extract: t\xECm th\u1EA5y ${matches.length} matches cho '${marker || "regex"}' \u2014 mode 'error'`,
            );
          }
          const extractGroup = (m) =>
            ((m && (m[1] || m[m.length - 1] || m[0])) || "").trim();
          if (multiMatch === "last") {
            extractedText = extractGroup(matches[matches.length - 1]);
          } else if (multiMatch === "concat") {
            extractedText = matches.map(extractGroup).join("\n\n");
          } else {
            extractedText = extractGroup(matches[0]);
          }
          log2(
            `Text Extract '${marker}' \u2192 ${extractedText.length} chars (${matches.length} match${matches.length > 1 ? "es" : ""}, mode=${multiMatch})`,
          );
        }
        extractedText = this._normalizeExtractedText(extractedText, {
          compact: true,
        });
        if (!extractedText || !extractedText.trim()) {
          return this._handleExtractFail(
            node,
            `Marker '${marker || customRegex}' match \u0111\u01B0\u1EE3c nh\u01B0ng content R\u1ED6NG (AI c\xF3 th\u1EC3 vi\u1EBFt marker li\u1EC1n nhau kh\xF4ng c\xF3 n\u1ED9i dung)`,
            onFail,
            _now,
            log2,
          );
        }
        node.result_text = extractedText;
        node.result_source = "extract";
        delete node._extract_failed;
        delete node._extract_reason;
        return {
          fileIds: [],
          duration: Date.now() - _now,
          thumbnails: {},
          fileNames: {},
          result_text: extractedText,
          result_source: "extract",
        };
      } catch (err) {
        if (err.code !== "EXTRACT_HANDLED") {
          throw err;
        }
        return this._handleExtractFail(node, err.message, onFail, _now, log2);
      }
    }
    _normalizeExtractedText(text, opts = {}) {
      if (typeof text !== "string" || !text) return text || "";
      const compact = opts.compact === true;
      return text
        .replace(/\r\n/g, "\n")
        .replace(/ /g, " ")
        .replace(/[​-‍﻿]/g, "")
        .split("\n")
        .map((line) => (compact ? line.trim() : line.replace(/[ \t]+$/, "")))
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }
    _handleExtractFail(node, reason, onFail, startTime, log2) {
      log2(`Text Extract fail: ${reason}`, "warn");
      try {
        this._emitToast(
          `Text Extract "${node.node_name || node.node_type}" l\u1ED7i: ${reason}`,
          onFail === "fail_workflow" ? "error" : "warning",
          onFail === "fail_workflow" ? 1e4 : 7e3,
        );
      } catch (_) {}
      if (onFail === "fail_workflow") {
        const err = new Error(`Text Extract fail: ${reason}`);
        err.code = "EXTRACT_FAIL";
        throw err;
      }
      node.result_text = "";
      node.result_source = "extract";
      node._extract_failed = true;
      node._extract_reason = reason;
      return {
        fileIds: [],
        duration: Date.now() - startTime,
        thumbnails: {},
        fileNames: {},
        result_text: "",
        result_source: "extract",
        _extract_failed: true,
        _extract_reason: reason,
      };
    }
    async _resolveRefImagesForLLM(node, adapter, resolvedIds = null) {
      const idsRaw = node.ref_file_ids || "";
      if (!idsRaw) return [];
      const fileIds = idsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (fileIds.length === 0) return [];
      let maxRefs;
      if (typeof adapter?.getMaxRefImages === "function") {
        const mode = (node.media_type || "Image").toLowerCase();
        const isFrames2 =
          mode === "video" && node.video_input_type === "Frames";
        maxRefs = adapter.getMaxRefImages({ mode, isFrames: isFrames2 });
      }
      if (
        adapter?.key === "gemini" &&
        (typeof maxRefs !== "number" || maxRefs <= 0)
      ) {
        return [];
      }
      if (typeof maxRefs !== "number" || maxRefs <= 0) {
        maxRefs = adapter?.capabilities?.maxRefImages || 4;
      }
      const capped = fileIds.slice(0, maxRefs);
      const refThumbs = node.ref_thumbnails || {};
      const resolveCachedThumb = (fid) => {
        const cached = refThumbs[fid];
        if (cached && typeof cached === "object" && cached.runtime_base64)
          return cached.runtime_base64;
        const direct = resolveWorkflowImagePreview(cached);
        if (direct) return direct;
        if (window.GenTab?.thumbnailCache?.[fid])
          return window.GenTab.thumbnailCache[fid];
        const tc = getThumbCache()?.get(fid);
        if (tc?.thumbnail) return tc.thumbnail;
        if (typeof MediaRegistry !== "undefined" && MediaRegistry.getThumb)
          return MediaRegistry.getThumb(fid) || null;
        return null;
      };
      const isExpiredSignedUrl = (url) => {
        if (!url || typeof url !== "string") return false;
        try {
          const expires = Number(new URL(url).searchParams.get("Expires"));
          return expires > 0 && expires <= Date.now() / 1e3;
        } catch (_) {
          return false;
        }
      };
      const uuidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const getMediaUuid = (fid) => {
        const refEntry = refThumbs[fid];
        const tileEntry = getThumbCache()?.get(fid);
        const candidates = [
          refEntry && typeof refEntry === "object" ? refEntry.media_uuid : null,
          tileEntry?.media_uuid,
          node.ref_file_names?.[fid],
          fid,
        ];
        return (
          candidates.find((value) =>
            uuidPattern.test(String(value || "").trim()),
          ) || null
        );
      };
      if (window.FlowApiFacade?.resolveMedia) {
        const apiCandidates = capped.filter((fid) => {
          const url = resolveCachedThumb(fid);
          return !!getMediaUuid(fid) && (!url || isExpiredSignedUrl(url));
        });
        if (apiCandidates.length > 0) {
          const settled = await Promise.allSettled(
            apiCandidates.map(async (fid) => {
              const mediaUuid = getMediaUuid(fid);
              const previous =
                refThumbs[fid] && typeof refThumbs[fid] === "object"
                  ? refThumbs[fid]
                  : {};
              const resolved = await window.FlowApiFacade.resolveMedia({
                mediaId: mediaUuid,
                mediaType: "image",
                thumbnail: previous,
                providerData: node.result_provider_urls?.[fid] || null,
              }).catch(() => null);
              if (!resolved?.url) return false;
              const hydrated = {
                ...previous,
                thumbnail: resolved.url,
                type: "image",
                media_uuid: mediaUuid,
                persistent_media_id: previous.persistent_media_id || mediaUuid,
                identity_kind: "flow-api-uuid",
                identity_durability: "durable-resolver",
              };
              if (
                !node.ref_thumbnails ||
                typeof node.ref_thumbnails !== "object" ||
                Array.isArray(node.ref_thumbnails)
              ) {
                node.ref_thumbnails = {};
              }
              node.ref_thumbnails[fid] = hydrated;
              refThumbs[fid] = hydrated;
              getThumbCache()?.set?.(fid, hydrated);
              if (typeof MediaRegistry !== "undefined") {
                MediaRegistry.setThumb?.(fid, resolved.url);
                MediaRegistry.setFileName?.(fid, mediaUuid);
              }
              return true;
            }),
          );
          const resolvedCount = settled.filter(
            (item) => item.status === "fulfilled" && item.value === true,
          ).length;
          console.log(
            "[WorkflowRefApiRecovery] image refs resolved before DOM scan",
            {
              requested: apiCandidates.length,
              resolved: resolvedCount,
              unresolved: apiCandidates.length - resolvedCount,
            },
          );
        }
      }
      const missingThumbIds = capped.filter((fid) => {
        const url = resolveCachedThumb(fid);
        return !url || isExpiredSignedUrl(url);
      });
      if (
        missingThumbIds.length > 0 &&
        window.MessageBridge?.getThumbnailsByIds
      ) {
        try {
          const scan = await window.MessageBridge.getThumbnailsByIds(
            missingThumbIds,
            { deep: true, fileNamesById: node.ref_file_names || {} },
          );
          const recovered = scan?.results || {};
          console.log("[WorkflowExecutor] Flow DOM ref recovery:", {
            requested: missingThumbIds.length,
            recovered: Object.keys(recovered).length,
          });
          if (
            !node.ref_thumbnails ||
            typeof node.ref_thumbnails !== "object" ||
            Array.isArray(node.ref_thumbnails)
          ) {
            node.ref_thumbnails = {};
          }
          if (
            !node.ref_file_names ||
            typeof node.ref_file_names !== "object" ||
            Array.isArray(node.ref_file_names)
          ) {
            node.ref_file_names = {};
          }
          for (const fid of missingThumbIds) {
            const info = recovered[fid];
            const recoveredThumb = resolveWorkflowImagePreview(info);
            if (!recoveredThumb) continue;
            node.ref_thumbnails[fid] = info;
            refThumbs[fid] = info;
            const recoveredName =
              info.file_name || info.persistent_media_id || null;
            if (recoveredName) node.ref_file_names[fid] = recoveredName;
            if (typeof MediaRegistry !== "undefined") {
              if (info.thumbnail) MediaRegistry.setThumb?.(fid, info.thumbnail);
              else MediaRegistry.setThumb?.(fid, recoveredThumb);
              if (recoveredName)
                MediaRegistry.setFileName?.(fid, recoveredName);
            }
            const tileCache = getThumbCache();
            if (tileCache?.set) {
              tileCache.set(fid, {
                thumbnail: recoveredThumb,
                type: info.type || "image",
                ...(recoveredName && { file_name: recoveredName }),
                ...(info.source_thumbnail && {
                  source_thumbnail: info.source_thumbnail,
                }),
                ...(info.persistent_media_id && {
                  persistent_media_id: info.persistent_media_id,
                }),
              });
            }
          }
        } catch (err) {
          console.warn(
            "[WorkflowExecutor] Flow DOM ref recovery failed:",
            err?.message || err,
          );
        }
      }
      const results = [];
      for (const fid of capped) {
        let thumbUrl = null;
        const cached = refThumbs[fid];
        thumbUrl =
          cached && typeof cached === "object" && cached.runtime_base64
            ? cached.runtime_base64
            : resolveWorkflowImagePreview(cached);
        if (!thumbUrl && window.GenTab?.thumbnailCache?.[fid]) {
          thumbUrl = window.GenTab.thumbnailCache[fid];
        }
        if (!thumbUrl && getThumbCache()) {
          const tc = getThumbCache().get(fid);
          if (tc?.thumbnail) thumbUrl = tc.thumbnail;
        }
        if (
          !thumbUrl &&
          typeof MediaRegistry !== "undefined" &&
          MediaRegistry.getThumb
        ) {
          thumbUrl = MediaRegistry.getThumb(fid) || null;
        }
        if (!thumbUrl) {
          console.warn(
            "[WorkflowExecutor] Prompt ref thumbnail missing for",
            fid,
          );
          continue;
        }
        try {
          let resp = null;
          const dataMatch =
            typeof thumbUrl === "string"
              ? thumbUrl.match(/^data:([^;,]+);base64,(.+)$/s)
              : null;
          if (dataMatch) {
            resp = {
              success: true,
              base64: dataMatch[2],
              contentType: dataMatch[1],
            };
          } else if (
            typeof thumbUrl === "string" &&
            /^(?:https?:|blob:)/i.test(thumbUrl)
          ) {
            if (/^https?:/i.test(thumbUrl)) {
              resp = await new Promise((resolve) => {
                chrome.runtime.sendMessage(
                  { action: "fetchBlob", url: thumbUrl, expectImage: true },
                  (r) => {
                    const runtimeError = chrome.runtime.lastError?.message;
                    resolve(
                      r ||
                        (runtimeError
                          ? { success: false, error: runtimeError }
                          : null),
                    );
                  },
                );
              });
            }
            if (!resp?.success && window.MessageBridge?.sendToContentScript) {
              const primaryError = resp?.error || null;
              const flowResp = await window.MessageBridge.sendToContentScript(
                "fetchImageAsBase64",
                { url: thumbUrl },
              );
              resp = flowResp?.success
                ? flowResp
                : {
                    success: false,
                    error:
                      [primaryError, flowResp?.error]
                        .filter(Boolean)
                        .join(" -> ") || "REF_FETCH_FAILED",
                  };
            }
          }
          if (resp?.success && resp.base64) {
            const name = `prompt_ref_${fid.substring(0, 12)}.png`;
            const m = resp.base64.match(/^data:(.+?);base64,(.+)$/);
            if (m) {
              results.push({ base64: m[2], name, type: m[1] });
            } else {
              results.push({
                base64: resp.base64,
                name,
                type: resp.contentType || "image/png",
              });
            }
            resolvedIds?.push(fid);
          } else {
            console.warn(
              "[WorkflowExecutor] Ref bytes materialization failed",
              {
                fileId: fid,
                scheme:
                  typeof thumbUrl === "string"
                    ? thumbUrl.split(":", 1)[0]
                    : null,
                error: resp?.error || "UNSUPPORTED_REF_URL",
              },
            );
          }
        } catch (err) {
          console.warn(
            "[WorkflowExecutor] fetchBlob ref failed:",
            fid,
            err.message,
          );
        }
      }
      return results;
    }
    _resolveEffectivePrompt(node, workflow2) {
      if (node.prompt_source !== "upstream_node") {
        return { text: node.prompt || "", source: "textbox" };
      }
      const upstreamTexts = this._getAllUpstreamTextSources(node, workflow2);
      if (upstreamTexts.length === 0) {
        if (
          ["generate", "chatgpt", "grok", "gemini", "muse"].includes(
            node.node_type,
          )
        ) {
          return { text: "", source: "upstream_node" };
        }
        return { text: node.prompt || "", source: "textbox_fallback" };
      }
      upstreamTexts.sort((a, b) => {
        const aIsPrompt = a.nodeType === "prompt" ? 0 : 1;
        const bIsPrompt = b.nodeType === "prompt" ? 0 : 1;
        if (aIsPrompt !== bIsPrompt) return aIsPrompt - bIsPrompt;
        return a.posY - b.posY;
      });
      let text = upstreamTexts.map((u) => u.text).join("\n\n");
      const maxLen =
        window.ValidationRules?.safeGetInt?.("prompt_max_length", 5e3) ?? 5e3;
      if (maxLen > 0 && text.length > maxLen) {
        console.warn(
          `[WorkflowExecutor] Combined upstream prompts > ${maxLen} chars \u2014 truncating`,
        );
        text = text.substring(0, maxLen);
      }
      return { text, source: "upstream_node" };
    }
    _getAllUpstreamTextSources(node, workflow2) {
      return this._combineUpstreamTexts(node, workflow2)?.sources || [];
    }
    _combineUpstreamTexts(node, workflow2) {
      const textEdges = (workflow2?.edges || []).filter((e) => {
        if (e.target_node_id !== node.node_id) return false;
        const tgtPort = e.target_port;
        return !tgtPort || tgtPort === "default" || tgtPort === "text";
      });
      const sources = [];
      for (const edge of textEdges) {
        const srcNode = (workflow2?.nodes || []).find(
          (n) => n.node_id === edge.source_node_id,
        );
        if (!srcNode) continue;
        const sourcePort =
          edge.source_port && edge.source_port !== "default"
            ? edge.source_port
            : "text";
        let text2 = this._getNodeOutputForPort(srcNode, sourcePort);
        if (typeof text2 === "string") text2 = text2.trim();
        if (
          !text2 &&
          srcNode.node_type === "prompt" &&
          srcNode.multi_prompt === true &&
          /^prompt_\d+$/.test(edge.source_port || "")
        )
          continue;
        if (!text2) text2 = srcNode.result_text?.trim();
        if (
          !text2 &&
          (srcNode.node_type === "text" || srcNode.node_type === "prompt")
        ) {
          text2 = srcNode.prompt?.trim();
        }
        if (
          node.node_type !== "text_extract" &&
          text2 &&
          srcNode.node_type === "prompt" &&
          /@[a-z][a-z0-9_]{0,29}(?![a-z0-9@._:-])/i.test(text2)
        ) {
          try {
            const nbs = buildNodesBySlug(workflow2?.nodes || []);
            const resolved = resolvePromptMentions(
              { prompt: text2, prompt_mode: "mention", ref_mode: "mention" },
              nbs,
            );
            if (resolved && resolved.trim()) text2 = resolved.trim();
          } catch (_) {}
        }
        if (text2) {
          sources.push({
            text: text2,
            nodeType: srcNode.node_type,
            posY: srcNode.pos_y ?? srcNode.position?.y ?? 0,
            nodeName: srcNode.node_name || srcNode.node_id,
          });
        }
      }
      if (sources.length === 0) return null;
      sources.sort((a, b) => {
        const aP = a.nodeType === "prompt" ? 0 : 1;
        const bP = b.nodeType === "prompt" ? 0 : 1;
        if (aP !== bP) return aP - bP;
        return a.posY - b.posY;
      });
      let text = sources.map((u) => u.text).join("\n\n");
      if (node.node_type !== "text_extract") {
        const maxLen =
          window.ValidationRules?.safeGetInt?.("prompt_max_length", 5e3) ?? 5e3;
        if (maxLen > 0 && text.length > maxLen) {
          const originalLen = text.length;
          text = text.substring(0, maxLen);
          try {
            this._emitToast(
              `Prompt cho "${node.node_name || node.node_type}" b\u1ECB c\u1EAFt ${originalLen.toLocaleString()}\u2192${maxLen.toLocaleString()} chars (v\u01B0\u1EE3t prompt_max_length). N\u1ED9i dung cu\u1ED1i b\u1ECB m\u1EA5t.`,
              "warning",
              8e3,
            );
          } catch (_) {}
        }
      }
      return { text, sources };
    }
    async _getCurrentTileIds(nodeAccum = null) {
      if (this._isContentScriptContext()) {
        const tileSelector = window._getTileSelectorString?.();
        if (!tileSelector) return [];
        const tiles = document.querySelectorAll(tileSelector);
        return [
          ...new Set(
            Array.from(tiles)
              .map(
                (t) =>
                  t.dataset.tileId ||
                  t.getAttribute("data-media-id") ||
                  t
                    .querySelector("[data-media-id]")
                    ?.getAttribute("data-media-id"),
              )
              .filter(Boolean),
          ),
        ];
      } else if (window.MessageBridge) {
        const result = await window.MessageBridge.getCurrentTileIds();
        const preFileNames = result?.fileNames
          ? new Set(result.fileNames)
          : null;
        this._lastPreFileNames = preFileNames;
        const accum = nodeAccum || this._currentNodeAccum;
        if (accum) {
          accum.preFileNames = preFileNames;
        }
        return result?.tileIds || [];
      }
      log("Warning: No method available to get tile IDs");
      return [];
    }
    async _applySettings(node, hasRef = false) {
      const isVideo = node.media_type === "Video";
      const isVideoFrames = isVideo && node.video_input_type === "Frames";
      const quantity = node.quantity || 1;
      let videoDuration = isVideo ? node.video_duration || "6s" : null;
      if (isVideo && hasRef && videoDuration) {
        const flowAdapter = window.ProviderRegistry?.get?.("flow");
        const _refIdsForVid = (node.ref_file_ids || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const _hasRefVideo = _refIdsForVid.some((id) => {
          const tc = getThumbCache()?.get(id);
          if (tc?.type === "video") return true;
          const rt = node.ref_thumbnails?.[id];
          return !!(rt && typeof rt === "object" && rt.type === "video");
        });
        const forced = flowAdapter?.getDurationOverride?.({
          modelValue: node.model,
          hasRef: true,
          hasRefVideo: _hasRefVideo,
          inputType: node.video_input_type || "Ingredients",
        });
        if (forced && forced !== videoDuration) {
          log(
            `[Model Constraint] Override duration ${videoDuration} \u2192 ${forced} (${node.model} + ref image)`,
          );
          videoDuration = forced;
        }
      }
      log("Applying settings:", {
        mediaType: node.media_type,
        ratio: node.ratio,
        model: node.model,
        videoInputType: node.video_input_type,
        isVideoFrames,
        quantity,
        videoDuration,
      });
      const defaults = await this._getGenDefaultsForNode(node);
      const genType2 = node.media_type || defaults.genType;
      const ratio = node.ratio || defaults.ratio;
      const model = isVideo
        ? node.model || defaults.videoModel
        : node.model || defaults.imageModel;
      const videoResolution = isVideo
        ? window.ModelRegistry?.getGenerationResolutionValue?.(
            "flow",
            model,
            node.video_resolution,
          )
        : null;
      if (typeof applySettings === "function") {
        log("Using direct applySettings");
        await applySettings(
          genType2,
          ratio,
          model,
          isVideoFrames,
          quantity,
          videoDuration,
          [],
          videoResolution,
          null,
        );
      } else if (window.MessageBridge) {
        log("Using MessageBridge for applySettings");
        await window.MessageBridge.applySettings(
          genType2,
          ratio,
          model,
          isVideoFrames,
          quantity,
          videoDuration,
          videoResolution,
        );
      } else {
        log("Warning: applySettings function not available");
        await this._sleep(500);
      }
    }
    async _clearEditor() {
      if (
        typeof getEditor === "function" &&
        typeof clearEditor === "function"
      ) {
        const editor = getEditor();
        if (editor) {
          clearEditor(editor);
          log("Editor cleared (direct)");
        }
      } else if (window.MessageBridge) {
        log("Using MessageBridge for clearEditor");
        await window.MessageBridge.clearEditor();
      } else {
        log("Warning: clearEditor not available");
      }
    }
    async _removeExistingRefImages() {
      if (typeof removeExistingRefImages === "function") {
        const removed = await removeExistingRefImages();
        if (removed > 0)
          log(`\u0110\xE3 x\xF3a ${removed} ref images c\u0169 (direct)`);
      } else if (window.MessageBridge) {
        log("Using MessageBridge for removeExistingRefImages");
        await window.MessageBridge.removeExistingRefImages();
      } else {
        log("Warning: removeExistingRefImages not available");
      }
    }
    _getInputTimeoutMs() {
      if (typeof getInputTimeoutMs === "function") {
        return getInputTimeoutMs();
      }
      const s = window.storageSettings?.getSettings() || {};
      return s.inputTimeout || 1200;
    }
    _getClearEditorDelay() {
      return Math.round(this._getInputTimeoutMs() * 0.4);
    }
    _getSubmitDelay() {
      return Math.round(this._getInputTimeoutMs() * 0.5);
    }
    _getAfterSubmitDelay() {
      return Math.round(this._getInputTimeoutMs() * 0.8);
    }
    _getDelayBetweenPromptsMs() {
      const delayBetweenSec =
        window.ExecutionConfig?.safeGetDelayBetweenPromptsSec?.() ?? 5;
      return delayBetweenSec * 1e3;
    }
    _getRandomDelay() {
      const s = window.storageSettings?.getSettings() || {};
      const min = (s.randomDelayMin || 3) * 1e3;
      const max = (s.randomDelayMax || 10) * 1e3;
      return min + Math.random() * (max - min);
    }
    _getIconElementSelector() {
      if (typeof window._getDynamicSelector === "function") {
        const cfg = window._getDynamicSelector("icon_element");
        if (cfg?.selectors?.length) return cfg.selectors.join(", ");
      }
      const pcm = window.ProviderConfigManager;
      const selectors =
        pcm?._cache?.data?.flow?.dom_selectors?.icon_element?.selectors;
      if (Array.isArray(selectors) && selectors.length) {
        return selectors.join(", ");
      }
      console.debug(
        "[Tier3] WorkflowExecutor._getIconElementSelector: icon_element cache miss \u2014 warning detection degraded",
      );
      return "";
    }
    _extractFileNameFromTile(tile) {
      if (!tile) return null;
      if (typeof window._getPersistentMediaId === "function") {
        const persistentId = window._getPersistentMediaId(tile);
        if (persistentId) return persistentId;
      }
      const nativeMediaId = tile
        .querySelector("[data-media-id]")
        ?.getAttribute("data-media-id");
      if (nativeMediaId && /^[a-f0-9-]{8,}$/i.test(nativeMediaId))
        return nativeMediaId;
      const _p = window._getMediaUrlPattern?.();
      if (!_p) return null;
      const candidates = [
        ...tile.querySelectorAll(`img[src*="${_p}"]`),
        ...tile.querySelectorAll(`a[href*="${_p}"]`),
      ];
      for (const el of candidates) {
        const url = el.src || el.href;
        const fileName = this._extractFileNameFromUrl(url);
        if (fileName) return fileName;
      }
      const redirectUrl =
        tile.dataset?.redirectUrl || tile.getAttribute("data-redirect-url");
      if (redirectUrl) {
        const fileName = this._extractFileNameFromUrl(redirectUrl);
        if (fileName) return fileName;
      }
      return null;
    }
    _extractFileNameFromUrl(url) {
      if (!url) return null;
      try {
        const urlObj = new URL(url, window.location.origin);
        const name = urlObj.searchParams.get("name");
        if (name && /^[a-f0-9-]{8,}$/i.test(name)) return name;
        const input = urlObj.searchParams.get("input");
        if (input) {
          const inputObj = JSON.parse(decodeURIComponent(input));
          if (inputObj?.name && /^[a-f0-9-]{8,}$/i.test(inputObj.name))
            return inputObj.name;
        }
      } catch (e) {}
      return null;
    }
    async _insertPrompt(prompt) {
      if (typeof getEditor === "function" && typeof insertText === "function") {
        const editor = getEditor();
        if (editor) {
          await insertText(editor, prompt);
          log("Prompt inserted (direct):", prompt.substring(0, 50) + "...");
        }
      } else if (window.MessageBridge) {
        log("Using MessageBridge for insertText");
        await window.MessageBridge.insertText(prompt);
      } else {
        log("Warning: insertText not available");
      }
    }
    async _addFileToPrompt(fileId, fileName, flowFileId) {
      this._assertWorkflowNotStopped();
      const replacement = this._webRefReplacements?.get(fileId);
      if (replacement) {
        fileId = replacement.newId;
        fileName = replacement.info.file_name;
        flowFileId = replacement.info.media_uuid;
      }
      let result = null;
      if (window.MessageBridge?.addRefImages) {
        const names = { [fileId]: fileName },
          types = { [fileId]: "image" },
          identities = { [fileId]: flowFileId || null };
        result = await window.MessageBridge.addRefImages(
          [fileId],
          names,
          types,
          identities,
          { abortFn: () => this.shouldStop },
        );
        if (result?.timedOutIds?.length) {
          if (typeof EditorExecutor === "undefined")
            throw new Error("FLOW_REF_RECOVERY_UNAVAILABLE");
          const thumbs = Object.assign(
            {},
            ...(this.currentWorkflow?.nodes || []).map(
              (node) => node.ref_thumbnails || {},
            ),
          );
          const item = {
            refFileIds: [fileId],
            refFileNames: names,
            refThumbnails: thumbs,
            settings: {},
          };
          const recovery = Object.create(EditorExecutor.prototype);
          Object.defineProperty(recovery, "_shouldStop", {
            get: () => this.shouldStop,
          });
          result = await recovery._recoverTimedOutWebRefs(
            item,
            {
              owner: "workflow",
              items: [item],
              _onRefReuploaded: (change) => this._recordWebRefReupload(change),
            },
            result,
            names,
            types,
            identities,
          );
        }
      } else if (typeof addFileToPrompt === "function") {
        const budget = Number(
          window.SystemConfig?.safeGetTimeout?.("flow_ref_scan_timeout_ms"),
        );
        if (!Number.isFinite(budget) || budget <= 0)
          throw Object.assign(
            new Error("FLOW_SCAN_TIMEOUT_CONFIG_UNAVAILABLE"),
            { code: "FLOW_SCAN_TIMEOUT_CONFIG_UNAVAILABLE", noRetry: true },
          );
        const control = _createFlowScanRequest(
          crypto.randomUUID(),
          Date.now() + budget,
        );
        try {
          result = await addFileToPrompt(
            fileId,
            fileName,
            flowFileId || null,
            "image",
            () => this.shouldStop,
            { deadline: control.deadline, scanControl: control },
          );
        } finally {
          control.release();
          _invalidateTileCache();
        }
      } else {
        throw new Error("ADD_REF_UNAVAILABLE");
      }
      this._assertWorkflowNotStopped();
      const confirmed = result === true || result?.success === true;
      if (!confirmed) {
        const error = new Error(result?.error || "ADD_REF_NOT_CONFIRMED");
        error.code = result?.error || "ADD_REF_NOT_CONFIRMED";
        throw error;
      }
      return true;
    }
    async _clickSubmit() {
      if (this._isContentScriptContext()) {
        if (
          typeof _checkFlowCreditLimit === "function" &&
          _checkFlowCreditLimit()
        ) {
          const localizedMsg =
            window.I18n?.t?.("flow.creditLimitHit") ||
            "Your Google Flow account is out of credit \u2014 cannot submit";
          const err = new Error(localizedMsg);
          err.code = "FLOW_CREDIT_LIMIT";
          throw err;
        }
        const maxWait = 1e4;
        const startTime = Date.now();
        while (Date.now() - startTime < maxWait) {
          const resolved = window.FlowDriverRegistry?.resolveForUrl?.(
            location.href,
          );
          const result = await resolved?.driver?.invoke?.("submit", {
            timeoutMs: 3e4,
          });
          if (result?.success) {
            log("Submit confirmed (shared Flow V2 driver)");
            await this._sleep(this._getAfterSubmitDelay());
            return;
          }
          if (result?.notDispatched !== true) {
            const error = new Error(result?.error || "SUBMIT_NOT_CONFIRMED");
            error.code = result?.error || "SUBMIT_NOT_CONFIRMED";
            throw error;
          }
          log(
            `Submit not dispatched (${result?.error || "not ready"}), retrying...`,
          );
          await this._sleep(500);
        }
        throw new Error("Submit button not found or disabled after 10s");
      } else if (window.MessageBridge) {
        const maxWait = 1e4;
        const startTime = Date.now();
        while (Date.now() - startTime < maxWait) {
          let result;
          try {
            result = await window.MessageBridge.clickSubmit();
          } catch (error) {
            if (error?.notDispatched !== true) throw error;
            result = {
              success: false,
              error: error?.code || error?.message,
              notDispatched: true,
            };
          }
          if (result?.success) {
            log("Submit clicked (MessageBridge)");
            await this._sleep(this._getAfterSubmitDelay());
            return;
          }
          if (result?.notDispatched !== true) {
            const error = new Error(result?.error || "SUBMIT_NOT_CONFIRMED");
            error.code = result?.error || "SUBMIT_NOT_CONFIRMED";
            throw error;
          }
          log(
            `Submit not dispatched via MessageBridge (${result?.error || "not ready"}), retrying...`,
          );
          await this._sleep(500);
        }
        throw new Error("Submit button not found or disabled after 10s");
      } else {
        throw new Error(
          "clickSubmit not available - no content script or MessageBridge",
        );
      }
    }
    async _waitForNewTiles(
      preTileIds,
      timeout,
      preFileNames = null,
      nodeAccum = null,
      quantity = 0,
      expectedMediaType = null,
    ) {
      if (!this._isContentScriptContext() && window.MessageBridge) {
        log("Using MessageBridge for waitForNewTiles");
        const opts = preFileNames
          ? {
              preFileNames: Array.from(preFileNames),
              maxQuantity: quantity,
              expectedMediaType,
            }
          : {
              captureFileNames: true,
              maxQuantity: quantity,
              expectedMediaType,
            };
        const result = await window.MessageBridge.waitForNewTiles(
          preTileIds,
          timeout,
          opts,
        );
        if (result?.failed) {
          throw new Error(
            "Google Flow tr\u1EA3 v\u1EC1 l\u1ED7i khi t\u1EA1o n\u1ED9i dung",
          );
        }
        if (result?.thumbnails) {
          const thumbTarget = nodeAccum?.thumbnails ?? this._lastTileThumbnails;
          const fnTarget = nodeAccum?.fileNames ?? this._lastTileFileNames;
          Object.assign(thumbTarget, result.thumbnails);
          for (const [tid, info] of Object.entries(result.thumbnails)) {
            if (info?.file_name) {
              fnTarget[tid] = info.file_name;
            }
          }
        }
        return result?.tiles || [];
      }
      const startTime = Date.now();
      const preSet = new Set(preTileIds);
      const MIN_FAIL_DETECT_MS = 15e3;
      while (Date.now() - startTime < timeout) {
        const hasSubmittedNodes =
          this._submittedNodes && this._submittedNodes.size > 0;
        if (this.shouldStop && !hasSubmittedNodes) {
          throw new Error("Execution stopped by user");
        }
        await new Promise((r) => setTimeout(r, 2e3));
        const currentTileIds = await this._getCurrentTileIds();
        const newTiles = currentTileIds.filter((id) => !preSet.has(id));
        if (newTiles.length > 0) {
          const elapsed = Date.now() - startTime;
          let allComplete = true;
          let hasError = false;
          for (const tileId of newTiles) {
            const tile = document.querySelector(`[data-tile-id="${tileId}"]`);
            if (!tile) continue;
            if (elapsed >= MIN_FAIL_DETECT_MS) {
              const iconSelector = this._getIconElementSelector();
              if (!iconSelector) {
                continue;
              }
              const warningIcons = tile.querySelectorAll(iconSelector);
              let tileIsFailed = false;
              for (const icon of warningIcons) {
                if (icon.textContent.trim() !== "warning") continue;
                let parent = icon.parentElement;
                let isHidden = false;
                while (parent && parent !== tile) {
                  if (parent.style && parent.style.opacity === "0") {
                    isHidden = true;
                    break;
                  }
                  parent = parent.parentElement;
                }
                if (!isHidden) {
                  tileIsFailed = true;
                  break;
                }
              }
              if (tileIsFailed) {
                hasError = true;
                break;
              }
            }
            const media =
              tile.querySelector("video") || tile.querySelector("img");
            if (!media || !media.src || media.src.startsWith("data:")) {
              allComplete = false;
              break;
            }
          }
          if (hasError) {
            throw new Error(
              "Google Flow tr\u1EA3 v\u1EC1 l\u1ED7i khi t\u1EA1o n\u1ED9i dung",
            );
          }
          if (allComplete) {
            log("New tiles completed:", newTiles);
            return newTiles;
          }
        }
      }
      throw new Error("Timeout waiting for generation");
    }
    _buildProviderUrlLookup(nodes) {
      const lookup = {};
      if (!Array.isArray(nodes)) return lookup;
      for (const n of nodes) {
        const map = n?.result_provider_urls;
        if (!map || typeof map !== "object") continue;
        for (const [tileId, data] of Object.entries(map)) {
          if (
            (data?.url || data?.durable_url || data?.provider === "flow") &&
            !lookup[tileId]
          ) {
            lookup[tileId] = data;
          }
        }
      }
      for (const [id, data] of this._museRuntimeResults || []) {
        if (!lookup[id]) lookup[id] = data;
      }
      return lookup;
    }
    async _downloadProviderTileDirect(
      fileId,
      providerData,
      promptText,
      index,
      subfolder,
      fileName,
      watermarkMode,
      resolution,
      ratio,
      plannedFilename = null,
    ) {
      const { url, durable_url, provider, media_type, tab_id, project_id } =
        providerData;
      let sourceUrl = provider === "flow" ? url || durable_url : url;
      if (!window.MessageBridge) return false;
      try {
        let effectiveTabId = tab_id;
        if (provider === "gemini") {
          const queried = await new Promise((resolve) => {
            chrome.runtime.sendMessage(
              { action: "queryProviderTabs", provider: "gemini" },
              (response) => resolve(response),
            );
          });
          effectiveTabId = queried?.tabs?.[0]?.id ?? tab_id;
          if (!effectiveTabId) return false;
        }
        let blob = null;
        let ext = media_type === "video" ? "mp4" : "png";
        let resolutionSuffix = "";
        const buildOutputFilename = async (suffix = "") => {
          if (plannedFilename)
            return plannedFilename.replace(/\.[^.\/]+$/, `.${ext}`);
          const downloadSettings = await window.DownloadHelper.getSettings();
          const sanitize = (s) =>
            String(s || "")
              .replace(/[\u0000-\u001f\u007f]/g, " ")
              .replace(/[\/\\:*?"<>|]/g, "_")
              .replace(/\s+/g, " ")
              .trim();
          const safeBase =
            sanitize(promptText) || `${provider}-${Date.now()}-${index}`;
          const safeFolder = window.DownloadHelper.normalizeDownloadRootFolder(
            downloadSettings.folder,
          );
          const workflowFolder =
            subfolder || this.currentWorkflow?.wf_name || null;
          const safeWorkflowFolder =
            window.DownloadHelper.normalizeDownloadSubfolder(workflowFolder);
          let output =
            safeWorkflowFolder &&
            safeWorkflowFolder.toLowerCase() !== safeFolder.toLowerCase()
              ? `${safeFolder}/${safeWorkflowFolder}/${safeBase}.${ext}`
              : `${safeFolder}/${safeBase}.${ext}`;
          if (suffix)
            output = output.replace(
              new RegExp(`\\.${ext}$`, "i"),
              `${suffix}.${ext}`,
            );
          return output;
        };
        if (provider === "muse") {
          if (!Number.isInteger(tab_id) || !url) return false;
          const filename2 = await buildOutputFilename();
          const bytes = this._museRuntimeResults?.get(fileId)?.base64;
          const result =
            media_type === "image"
              ? await window.MessageBridge.museDownloadImageResult({
                  tabId: tab_id,
                  url,
                  base64: bytes,
                  filename: filename2.replace(/\.[^.\/]+$/, ".jpg"),
                  waitForComplete: true,
                })
              : await window.MessageBridge.museDownloadNative(
                  tab_id,
                  filename2,
                  url,
                  6e5,
                  media_type,
                );
          console.log("[WorkflowExecutor] Muse Download node route:", {
            fileId,
            success: result?.success === true,
            error: result?.error || null,
          });
          return result?.success === true;
        }
        if (provider === "flow") {
          if (this.shouldStop) throw new Error("DOWNLOAD_STOPPED");
          fileId = providerData.media_uuid || fileId;
          const isVideo = media_type === "video";
          const res = String(resolution || "").toLowerCase();
          const downloadRoute =
            window.ProviderConfigManager?.getDownloadResolutionRouteSync?.(
              "flow",
              isVideo ? "video" : "image",
              res,
            ) || null;
          if (!downloadRoute) return false;
          const wantsUpscale = downloadRoute === "upscale";
          const gate = await window.FlowApiFacade?.checkDownloadReady?.({
            mediaId: fileId,
            mediaType: isVideo ? "video" : "image",
            providerData,
            requireUpscale: wantsUpscale,
            forWorkflow: false,
          });
          if (this.shouldStop) throw new Error("DOWNLOAD_STOPPED");
          if (!gate?.ready) {
            console.warn(
              "[WorkflowExecutor] Flow API download preflight blocked:",
              gate?.reason || "unavailable",
            );
            return false;
          }
          const projectId =
            project_id || this.currentWorkflow?.project_id || null;
          const deadline = Date.now() + (isVideo ? 6e5 : 12e4);
          const abortFn = () => Date.now() > deadline || this.shouldStop;
          const fetchFlowBlob = (source, refreshNative = false) =>
            window.FlowApiDownloadRetry.execute(
              async (attempt) => {
                if (attempt > 0 && refreshNative) {
                  const renewed = await window.FlowApiFacade.resolveDownload({
                    mediaId: fileId,
                    mediaType: isVideo ? "video" : "image",
                    providerData,
                    abortFn,
                  });
                  if (renewed?.base64) {
                    const mime = String(renewed.mime || "").toLowerCase();
                    if (!mime.startsWith(isVideo ? "video/" : "image/"))
                      throw new Error(
                        `FLOW_DOWNLOAD_BAD_MIME:${mime || "missing"}`,
                      );
                    const bytes = Uint8Array.from(
                      atob(renewed.base64),
                      (value) => value.charCodeAt(0),
                    );
                    if (!bytes.length)
                      throw new Error("FLOW_DOWNLOAD_EMPTY_BYTES");
                    return new Blob([bytes], { type: mime });
                  }
                  if (renewed?.url) source = renewed.url;
                }
                const controller = new AbortController();
                const readLimitMs = Math.max(
                  1e3,
                  Math.min(isVideo ? 9e4 : 3e4, deadline - Date.now()),
                );
                const readTimeout = setTimeout(
                  () => controller.abort(),
                  readLimitMs,
                );
                const watch = setInterval(() => {
                  if (abortFn()) controller.abort();
                }, 100);
                try {
                  let response;
                  try {
                    response = await fetch(source, {
                      cache: "no-store",
                      signal: controller.signal,
                    });
                  } catch (firstError) {
                    if (controller.signal.aborted) throw firstError;
                    response = await fetch(source, {
                      credentials: "include",
                      cache: "no-store",
                      signal: controller.signal,
                    });
                  }
                  if (!response.ok)
                    throw new Error(`FLOW_DOWNLOAD_HTTP_${response.status}`);
                  const contentType = String(
                    response.headers.get("content-type") || "",
                  ).toLowerCase();
                  if (!contentType.startsWith(isVideo ? "video/" : "image/"))
                    throw new Error(
                      `FLOW_DOWNLOAD_BAD_MIME:${contentType || "missing"}`,
                    );
                  const bytes = await response.blob();
                  if (!bytes.size) throw new Error("FLOW_DOWNLOAD_EMPTY_BYTES");
                  return bytes;
                } catch (error) {
                  if (controller.signal.aborted && !abortFn()) {
                    throw Object.assign(
                      new Error("FLOW_DOWNLOAD_FETCH_TIMEOUT"),
                      { code: "FLOW_DOWNLOAD_FETCH_TIMEOUT" },
                    );
                  }
                  throw error;
                } finally {
                  clearTimeout(readTimeout);
                  clearInterval(watch);
                }
              },
              {
                action: "fetch_bytes",
                driver: providerData.api_driver,
                abortFn,
              },
            );
          if (wantsUpscale) {
            if (
              !projectId ||
              (isVideo && !ratio && providerData.api_driver !== "v2")
            ) {
              console.warn(
                "[WorkflowExecutor] Upscale context missing; native download suppressed",
              );
              return false;
            }
            try {
              const up = await chrome.runtime.sendMessage({
                action: "flowApiUpscaleForDownload",
                payload: {
                  mediaId: fileId,
                  mediaType: isVideo ? "video" : "image",
                  resolution: res,
                  ratio: ratio || null,
                  apiDriver: providerData.api_driver || null,
                  projectId,
                  operationId: providerData.operation_uuid || null,
                  protocolRevision: providerData.protocol_revision || null,
                  protocolFingerprint:
                    providerData.protocol_fingerprint || null,
                  legacyV1Provenance:
                    !providerData.api_driver &&
                    providerData.identity_kind === "flow-api-uuid",
                  existingWebMedia: providerData.existingWebMedia === true,
                },
              });
              if (abortFn()) throw new Error("DOWNLOAD_STOPPED");
              if (up?.ok && isVideo && up.videoUrl) {
                blob = await fetchFlowBlob(up.videoUrl);
                resolutionSuffix = `_${res}`;
              } else if (up?.ok && !isVideo && up.base64) {
                const bytes = Uint8Array.from(atob(up.base64), (c) =>
                  c.charCodeAt(0),
                );
                blob = new Blob([bytes], { type: up.mime || "image/png" });
                ext =
                  up.mime === "image/webp"
                    ? "webp"
                    : up.mime === "image/png"
                      ? "png"
                      : "jpg";
                resolutionSuffix = `_${res}`;
              } else {
                const error = Object.assign(
                  new Error(
                    up?.grpcReason ||
                      up?.providerErrorCodes?.[0] ||
                      up?.error ||
                      "FLOW_API_UPSCALE_FAILED",
                  ),
                  {
                    code: up?.error || "FLOW_API_UPSCALE_FAILED",
                    stage: up?.stage || null,
                    dispatchStarted: up?.dispatchStarted === true,
                    ambiguous: up?.ambiguous === true,
                    noReplay:
                      up?.ambiguous === true ||
                      up?.dispatchStarted === true ||
                      !(
                        ["pre_dispatch", "preflight"].includes(up?.stage) ||
                        up?.dispatchStarted === false
                      ),
                  },
                );
                throw error;
              }
            } catch (e) {
              console.warn(
                `[WorkflowExecutor] Flow API upscale ${res} exception:`,
                e?.message,
              );
              throw Object.assign(e, { noReplay: true });
            }
            if (!blob) {
              console.warn(
                `[WorkflowExecutor] Flow API upscale ${res} failed; native download suppressed`,
              );
              return false;
            }
          }
          if (!blob) {
            const hasProviderUuid =
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                String(providerData.media_uuid || ""),
              );
            if (
              hasProviderUuid ||
              !sourceUrl ||
              sourceUrl.includes("media.getMediaUrlRedirect")
            ) {
              const resolved = await window.FlowApiFacade?.resolveDownload?.({
                mediaId: fileId,
                mediaType: isVideo ? "video" : "image",
                providerData,
                abortFn,
              });
              if (abortFn()) throw new Error("DOWNLOAD_STOPPED");
              sourceUrl = resolved?.url || null;
              if (resolved?.base64) {
                const bytes = Uint8Array.from(atob(resolved.base64), (c) =>
                  c.charCodeAt(0),
                );
                blob = new Blob([bytes], {
                  type: resolved.mime || (isVideo ? "video/mp4" : "image/jpeg"),
                });
              }
              console.log(
                "[WorkflowExecutor] Flow API native locator resolved",
                {
                  mediaType: isVideo ? "video" : "image",
                  hasServingUrl: !!sourceUrl,
                  hasBase64: !!resolved?.base64,
                },
              );
            }
            if (!blob) {
              if (!sourceUrl) return false;
              blob = await fetchFlowBlob(sourceUrl, true);
            }
            if (!isVideo && blob.type === "image/jpeg") ext = "jpg";
          }
          if (
            watermarkMode !== "original" &&
            window.DownloadHelper?.cleanMediaBlob
          ) {
            if (abortFn()) throw new Error("DOWNLOAD_STOPPED");
            const kind = isVideo ? "video" : "image";
            const force = watermarkMode === "clean";
            if (force || window.WatermarkClient.enabled(kind)) {
              const clean = await window.DownloadHelper.cleanMediaBlob(
                blob,
                kind,
                { force },
              );
              blob = clean.blob || blob;
              if (!clean.cleaned)
                console[
                  window.WatermarkClient?.isNoWatermarkResult?.(clean)
                    ? "info"
                    : "warn"
                ](
                  "[WorkflowExecutor] Flow API watermark clean skipped \u2192 original:",
                  clean.reason,
                );
            }
          }
        }
        if (provider === "grok" && window.MessageBridge.grokDownloadMedia) {
          const filename2 = await buildOutputFilename();
          const result = await window.MessageBridge.grokDownloadMedia(
            url,
            effectiveTabId,
            filename2,
            null,
          );
          console.log("[WorkflowExecutor] Grok Download node route:", {
            fileId,
            mediaType: media_type || "image",
            tier: result?.tier || 0,
            success: result?.success === true,
          });
          return result?.success === true;
        }
        const fetchFn =
          provider === "chatgpt"
            ? window.MessageBridge.chatGPTFetchImage
            : null;
        if (provider !== "flow") {
          let fetchResp;
          if (provider === "gemini") {
            const monitor =
              window.ProviderConfigManager?.getApiConfigValueSync?.(
                "gemini",
                "generation_monitor",
              )?.[media_type === "video" ? "video" : "image"];
            const maxBytes = Number(monitor?.max_materialized_bytes);
            if (!Number.isFinite(maxBytes) || maxBytes <= 0) return false;
            fetchResp = await window.MessageBridge?.geminiFetchMedia?.(
              url,
              effectiveTabId,
              maxBytes,
            );
          } else {
            if (!fetchFn) return false;
            fetchResp = await fetchFn(url, tab_id);
          }
          if (!fetchResp?.success || !fetchResp.base64) {
            console.warn(
              "[WorkflowExecutor] Provider fetch fail:",
              provider,
              fetchResp?.error,
            );
            return false;
          }
          blob = await (await fetch(fetchResp.base64)).blob();
        }
        const filename = await buildOutputFilename(resolutionSuffix);
        if (provider === "flow" && this.shouldStop)
          throw new Error("DOWNLOAD_STOPPED");
        const blobUrl = URL.createObjectURL(blob);
        blob = null;
        const blobLease = setTimeout(
          () => URL.revokeObjectURL(blobUrl),
          (media_type === "video" ? 6e5 : 12e4) + 6e4,
        );
        let dlResp;
        try {
          dlResp = await new Promise((resolve) => {
            chrome.runtime.sendMessage(
              {
                action: "chromeDownload",
                url: blobUrl,
                filename,
                waitForComplete: true,
                flowApiDownloadRetry: provider === "flow",
                waitTimeoutMs: media_type === "video" ? 6e5 : 12e4,
              },
              (r) => resolve(r),
            );
          });
        } finally {
          clearTimeout(blobLease);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 6e4);
        }
        if (provider === "flow" && !dlResp?.success) {
          throw Object.assign(
            new Error(dlResp?.error || "FLOW_CHROME_DOWNLOAD_FAILED"),
            {
              noRetry: true,
              noWebFallback: true,
              downloadId: dlResp?.downloadId || null,
            },
          );
        }
        return !!dlResp?.success;
      } catch (err) {
        console.error(
          "[WorkflowExecutor] _downloadProviderTileDirect exception:",
          err,
        );
        if (provider === "flow") throw err;
        return false;
      }
    }
    async _downloadSingleTile(
      fileId,
      promptText,
      resolution,
      fileName,
      flowFileId,
      taskName,
      videoResolution,
      watermarkMode,
      explicitFilename = null,
    ) {
      const folderName =
        taskName !== void 0 ? taskName : this.currentWorkflow?.wf_name || null;
      const vRes = videoResolution || null;
      let plannedFilename = explicitFilename;
      for (const source of this.currentWorkflow?.nodes || []) {
        if (plannedFilename) break;
        let thumbnails = source.result_thumbnails;
        if (typeof thumbnails === "string") {
          try {
            thumbnails = JSON.parse(thumbnails);
          } catch (_) {
            continue;
          }
        }
        for (const [id, info] of Object.entries(thumbnails || {})) {
          if (
            info?.phaseRDownloadName &&
            [id, info.media_uuid, info.file_name, info.persistent_media_id]
              .filter(Boolean)
              .some((identity) => identity === fileId || identity === fileName)
          ) {
            plannedFilename = info.phaseRDownloadName;
            break;
          }
        }
        if (plannedFilename) break;
      }
      if (
        this._isContentScriptContext() &&
        typeof downloadTileMedia === "function"
      ) {
        return (
          (await downloadTileMedia(
            fileId,
            promptText,
            folderName,
            fileName || null,
            resolution,
            flowFileId || null,
            null,
            vRes,
            watermarkMode || null,
            plannedFilename,
          )) === true
        );
      } else if (window.MessageBridge) {
        const response = await window.MessageBridge.downloadTileMedia(
          fileId,
          promptText,
          folderName,
          fileName || null,
          resolution,
          flowFileId || null,
          null,
          vRes,
          watermarkMode || null,
          plannedFilename,
        );
        return response === true || response?.success === true;
      }
      return false;
    }
    async _downloadTiles(
      fileIds,
      promptText,
      resolution,
      fileNameMap,
      taskName,
      videoResolution,
      watermarkMode,
    ) {
      if (!this._downloadedTileIds) this._downloadedTileIds = new Set();
      for (const tid of fileIds) {
        if (this._downloadedTileIds.has(tid)) {
          log(`Skip tile \u0111\xE3 download: ${tid.substring(0, 20)}`);
          continue;
        }
        const fn = fileNameMap?.[tid] || null;
        const ok = await this._downloadSingleTile(
          tid,
          promptText,
          resolution,
          fn,
          null,
          taskName,
          videoResolution,
          watermarkMode,
        );
        if (ok) this._downloadedTileIds.add(tid);
        else console.warn("[WorkflowExecutor] DOM auto-download failed:", tid);
        await this._sleep(300);
      }
    }
    async _downloadGeneratedResultsApiAware(
      result,
      node,
      resolution,
      taskName,
      nodeIsVideo,
      watermarkMode,
    ) {
      if (!this._downloadedTileIds) this._downloadedTileIds = new Set();
      const fileIds = Array.isArray(result?.fileIds) ? result.fileIds : [];
      const providerUrls =
        result?.providerUrls || result?.resultProviderUrls || {};
      const fileNames = result?.fileNames || {};
      const failures = [];
      let retryBlocked = false;
      const blockedIds = [];
      const promptText = node.prompt || node.node_name;
      const filenamePlan =
        result._downloadFilenamePlan || (result._downloadFilenamePlan = {});
      const filenameTimestamp =
        result._downloadFilenameTimestamp ??
        (result._downloadFilenameTimestamp = Date.now());
      for (let i = 0; i < fileIds.length; i++) {
        const fileId = fileIds[i];
        if (this._downloadedTileIds.has(fileId)) continue;
        window.eventBus?.emit?.("workflow:download", {
          workflowId: this.currentWorkflow?.wf_id,
          nodeId: node.node_id,
          nodeName: node.node_name,
          key: fileId,
          index: i + 1,
          total: fileIds.length,
          stage: "started",
        });
        let persistentId = fileNames[fileId] || null;
        const providerData =
          providerUrls[fileId] ||
          (persistentId ? providerUrls[persistentId] : null) ||
          null;
        let ok = false;
        const saved =
          result?.thumbnails?.[fileId] || result?.resultThumbnails?.[fileId];
        const media = saved && typeof saved === "object" ? saved : null;
        const isVideo =
          providerData?.media_type === "video" ||
          media?.type === "video" ||
          nodeIsVideo;
        const generationMode =
          result?.genMode || node?.result_gen_mode || node?.gen_mode || null;
        const apiEnabled =
          generationMode !== "web" &&
          window.FlowApiAdapter?.isApiModeIntended?.({ forDownload: true }) ===
            true;
        let route = apiEnabled ? providerData : null;
        try {
          if (this.shouldStop) throw new Error("DOWNLOAD_STOPPED");
          if (
            apiEnabled &&
            (!route || (route.provider === "flow" && !route.api_driver))
          ) {
            try {
              const inferred = await this._nodeUuidDownloadRoutes(
                { ...node, result_thumbnails: result?.thumbnails || {} },
                [fileId],
                fileNames,
                providerUrls,
                this.currentWorkflow || {},
              );
              route = inferred.get(fileId) || route;
            } catch (_) {}
          }
          const res = String(resolution || "").toLowerCase();
          const downloadRoute =
            window.ProviderConfigManager?.getDownloadResolutionRouteSync?.(
              "flow",
              isVideo ? "video" : "image",
              res,
            ) || null;
          if (!downloadRoute) throw new Error("FLOW_DOWNLOAD_CONFIG_MISSING");
          const wantsUpscale = downloadRoute === "upscale";
          let plannedFilename =
            media?.phaseRDownloadName || filenamePlan[fileId];
          if (!plannedFilename) {
            const settings = await window.DownloadHelper.getSettings();
            plannedFilename = window.DownloadHelper.buildFilename({
              template: settings.template,
              project: settings.project,
              folder: settings.folder,
              prompt: promptText,
              index: i + 1,
              taskName,
              ext: isVideo ? "mp4" : "png",
              timestamp: filenameTimestamp,
            });
            if (wantsUpscale) {
              plannedFilename = plannedFilename.replace(
                /\.[^.\/]+$/,
                `_${res}.${isVideo ? "mp4" : "png"}`,
              );
            }
            filenamePlan[fileId] = plannedFilename;
          }
          ok = await this._downloadNodeResult({
            fileId,
            fileName: persistentId,
            providerData: route,
            savedProviderData: providerData,
            media,
            workflow: this.currentWorkflow,
            isVideo,
            wantsUpscale,
            promptText,
            index: i + 1,
            subfolder: taskName,
            resolution,
            watermarkMode,
            ratio: node.ratio || null,
            generationMode,
            plannedFilename,
          });
        } catch (error) {
          failures.push(`${fileId}: ${error.message || "DOWNLOAD_FAILED"}`);
          const unsafeToReplay =
            error?.noRetry === true ||
            error?.noReplay === true ||
            error?.dispatchStarted === true ||
            ["receipt", "ambiguous", "accepted_poll"].includes(error?.stage);
          retryBlocked = retryBlocked || unsafeToReplay;
          if (unsafeToReplay) blockedIds.push(fileId);
        }
        if (ok === true) this._downloadedTileIds.add(fileId);
        else if (!failures.some((message) => message.startsWith(`${fileId}: `)))
          failures.push(`${fileId}: DOWNLOAD_FAILED`);
        window.eventBus?.emit?.("workflow:download", {
          workflowId: this.currentWorkflow?.wf_id,
          nodeId: node.node_id,
          nodeName: node.node_name,
          key: fileId,
          index: i + 1,
          total: fileIds.length,
          stage: ok === true ? "completed" : "failed",
        });
        await this._sleep(300);
      }
      if (failures.length)
        throw Object.assign(
          new Error(
            `FLOW_AUTO_DOWNLOAD_FAILED (${failures.length}/${fileIds.length}): ${failures.join(" \xB7 ")}`,
          ),
          retryBlocked
            ? { noRetry: true, noReplay: true, downloadBlockedIds: blockedIds }
            : {},
        );
    }
    async _maybeExtractLastFrame(node, result, workflow2) {
      const reportFailure = (error) => {
        console.warn(
          "[LastFrame] eager extract error (b\u1ECF qua, video v\u1EABn completed):",
          error?.message || error || "LAST_FRAME_EXTRACTION_EMPTY",
        );
        const failedSourceId = Array.isArray(result?.fileIds)
          ? result.fileIds.find(Boolean)
          : null;
        if (failedSourceId) {
          const targets = [
            node,
            this.currentWorkflow?.nodes?.find(
              (item) => item.node_id === node?.node_id,
            ),
          ].filter(Boolean);
          for (const target of targets) {
            try {
              Object.defineProperty(target, "_lastFrameExtractionFailure", {
                value: {
                  sourceId: failedSourceId,
                  runId: this._flowRunId || null,
                },
                writable: true,
                configurable: true,
                enumerable: false,
              });
            } catch (_) {}
          }
        }
        const key = "workflowUploadToast.lastFrame.extractFailed";
        const name = node?.node_name || node?.node_id || "";
        const translated = window.I18n?.t?.(key, { node: name });
        this._showWorkflowToast(
          translated && translated !== key
            ? translated
            : `\u201C${name}\u201D: Video \u0111\xE3 ho\xE0n t\u1EA5t nh\u01B0ng kh\xF4ng th\u1EC3 tr\xEDch frame cu\u1ED1i.`,
          "warning",
          9e3,
        );
      };
      try {
        if (!node) return;
        const isVideoNode =
          (node.node_type === "generate" &&
            (node.media_type || "Image") === "Video") ||
          (node.node_type === "grok" &&
            (node.grok_mode || "image") === "video");
        if (!isVideoNode) return;
        const edges = Array.isArray(workflow2?.edges)
          ? workflow2.edges
          : Array.isArray(this.currentWorkflow?.edges)
            ? this.currentWorkflow.edges
            : [];
        const hasFrameEdge = edges.some(
          (e) =>
            e.source_node_id === node.node_id && isLastFramePort(e.source_port),
        );
        if (!hasFrameEdge) return;
        const eagerFrameIds = Array.isArray(result?.frameFileIds)
          ? result.frameFileIds.filter(Boolean).slice(0, 1)
          : [];
        if (eagerFrameIds.length === 1) {
          const frameId = eagerFrameIds[0];
          const sourceFileId = Array.isArray(result?.fileIds)
            ? result.fileIds[0]
            : null;
          const rawEntry = result?.frameThumbnails?.[frameId];
          const entry =
            rawEntry && typeof rawEntry === "object"
              ? { ...rawEntry }
              : { thumbnail: rawEntry || "", type: "image" };
          node.result_frame_file_ids = frameId;
          node.result_frame_thumbnails = {
            [frameId]: {
              ...entry,
              type: "image",
              file_name:
                entry.file_name || result?.frameFileNames?.[frameId] || frameId,
              source_file_id: entry.source_file_id || sourceFileId,
            },
          };
          console.log(
            "[LastFrameRecovery] eager API handoff accepted",
            JSON.stringify({ nodeId: node.node_id, sourceFileId, frameId }),
          );
          return;
        }
        node.result_frame_file_ids = null;
        node.result_frame_thumbnails = null;
        const extracted = await this._extractFrameForNode(node, result);
        if (extracted !== true) reportFailure("LAST_FRAME_EXTRACTION_EMPTY");
      } catch (e) {
        reportFailure(e);
      }
    }
    async _ensureFrameRefsExtracted(node, workflow2) {
      try {
        if (!node) return;
        const edges = Array.isArray(workflow2?.edges)
          ? workflow2.edges
          : Array.isArray(this.currentWorkflow?.edges)
            ? this.currentWorkflow.edges
            : [];
        const frameEdges = edges.filter(
          (e) =>
            e.target_node_id === node.node_id && isLastFramePort(e.source_port),
        );
        if (!frameEdges.length) return;
        const nodes = Array.isArray(workflow2?.nodes)
          ? workflow2.nodes
          : Array.isArray(this.currentWorkflow?.nodes)
            ? this.currentWorkflow.nodes
            : [];
        for (const edge of frameEdges) {
          const src = nodes.find((n) => n.node_id === edge.source_node_id);
          if (!src) continue;
          const cachedFrameIds = String(src.result_frame_file_ids || "")
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean);
          const provenance =
            cachedFrameIds.length === 1
              ? src.result_frame_thumbnails?.[cachedFrameIds[0]]?.source_file_id
              : null;
          const fresh = this._isLastFrameFresh(src);
          console.info(
            "[LastFrameCache]",
            JSON.stringify({
              consumerNodeId: node.node_id,
              sourceNodeId: src.node_id,
              cachedFrameCount: cachedFrameIds.length,
              provenancePresent: !!provenance,
              decision: fresh
                ? "reuse"
                : !cachedFrameIds.length
                  ? "extract_missing_frame"
                  : !provenance
                    ? "extract_missing_provenance"
                    : "extract_changed_or_unresolved_source",
            }),
          );
          if (fresh) continue;
          const currentSourceId = String(src.result_file_ids || "")
            .split(",")
            .map((id) => id.trim())
            .find(Boolean);
          const priorFailure = src._lastFrameExtractionFailure;
          if (
            currentSourceId &&
            priorFailure?.sourceId === currentSourceId &&
            priorFailure.runId === (this._flowRunId || null)
          ) {
            throw Object.assign(
              new Error(`LAST_FRAME_REF_UNAVAILABLE:${src.node_id}`),
              { code: "REF_UPLOAD_FAILED" },
            );
          }
          if (
            (src.result_frame_file_ids || "").trim() ||
            src.result_frame_thumbnails
          ) {
            src.result_frame_file_ids = null;
            src.result_frame_thumbnails = null;
            try {
              await this._updateNodeStatus(
                src.node_id,
                src.status || "completed",
                null,
                null,
                { result_frame_file_ids: null, result_frame_thumbnails: null },
              );
            } catch (_) {}
          }
          await this._extractFrameForNode(src, null);
          if (
            !(src.result_frame_file_ids || "").trim() ||
            !this._isLastFrameFresh(src)
          ) {
            throw Object.assign(
              new Error(`LAST_FRAME_REF_UNAVAILABLE:${src.node_id}`),
              { code: "REF_UPLOAD_FAILED" },
            );
          }
        }
      } catch (e) {
        console.warn(
          "[LastFrame] lazy ensure error (stop downstream):",
          e?.message || e,
        );
        if (e?.code === "REF_UPLOAD_FAILED") throw e;
        throw Object.assign(
          new Error(e?.message || "LAST_FRAME_REF_UNAVAILABLE"),
          { code: "REF_UPLOAD_FAILED" },
        );
      }
    }
    _isCleanRefsFresh(src) {
      const thumbs = src?.result_clean_thumbnails;
      if (!thumbs || typeof thumbs !== "object" || Array.isArray(thumbs))
        return false;
      const stamped = thumbs[CLEAN_SRC_KEY];
      if (typeof stamped !== "string") return false;
      const split = (v) =>
        String(v || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
      const rawIds = split(
        src?.node_type === "image" ? src.ref_file_ids : src.result_file_ids,
      );
      const stampedIds = split(stamped);
      const cleanIds = split(src.result_clean_file_ids);
      if (
        !rawIds.length ||
        cleanIds.length !== rawIds.length ||
        stampedIds.length !== rawIds.length
      )
        return false;
      if (rawIds.some((id, index) => id !== stampedIds[index])) return false;
      return cleanIds.every((cleanId, index) => {
        if (cleanId === rawIds[index]) return true;
        const meta = thumbs[cleanId];
        return (
          !!meta &&
          typeof meta === "object" &&
          meta.source_file_id === rawIds[index]
        );
      });
    }
    async _invalidateCleanRefs(src) {
      if (!src) return;
      src.result_clean_file_ids = null;
      src.result_clean_thumbnails = null;
      try {
        await this._updateNodeStatus(
          src.node_id,
          src.status || "completed",
          null,
          null,
          { result_clean_file_ids: null, result_clean_thumbnails: null },
        );
      } catch (_) {}
    }
    async _ensureCleanRefsUploaded(node, workflow2) {
      try {
        if (!node) return;
        if (!window.WatermarkClient?.enabled?.("image", { scope: "input" }))
          return;
        const edges = Array.isArray(workflow2?.edges)
          ? workflow2.edges
          : Array.isArray(this.currentWorkflow?.edges)
            ? this.currentWorkflow.edges
            : [];
        const refEdges = edges.filter(
          (e) =>
            e.target_node_id === node.node_id &&
            !isLastFramePort(e.source_port),
        );
        if (!refEdges.length) return;
        const nodes = Array.isArray(workflow2?.nodes)
          ? workflow2.nodes
          : Array.isArray(this.currentWorkflow?.nodes)
            ? this.currentWorkflow.nodes
            : [];
        for (const edge of refEdges) {
          const src = nodes.find((n) => n.node_id === edge.source_node_id);
          if (!src) continue;
          if ((src.result_clean_file_ids || "").trim()) {
            if (!this._isCleanRefsFresh(src)) {
              emitLog({
                nodeId: src.node_id,
                message:
                  "[\u1EA2nh s\u1EA1ch] k\u1EBFt qu\u1EA3 \u0111\xE3 \u0111\u1ED5i \u2192 b\u1ECF b\u1EA3n s\u1EA1ch c\u0169, d\u1EF1ng l\u1EA1i",
              });
              await this._invalidateCleanRefs(src);
            } else if (await this._reviveCleanRefs(src)) continue;
          }
          if (!["generate", "image"].includes(src.node_type)) continue;
          if ((src.media_type || "Image") === "Video") continue;
          const sourceIds =
            src.node_type === "image" ? src.ref_file_ids : src.result_file_ids;
          if (!(sourceIds || "").trim()) continue;
          if (!this._cleanRefLocks) this._cleanRefLocks = new Map();
          const lockKey = src.node_id;
          let job = this._cleanRefLocks.get(lockKey);
          if (!job) {
            job = this._uploadCleanRefsForNode(src).finally(() =>
              this._cleanRefLocks.delete(lockKey),
            );
            this._cleanRefLocks.set(lockKey, job);
          }
          await job;
        }
      } catch (e) {
        console.warn(
          "[CleanRef] lazy ensure error (b\u1ECF qua):",
          e?.message || e,
        );
      }
    }
    async _reviveCleanRefs(src) {
      const ids = (src.result_clean_file_ids || "").trim();
      const thumbs = src.result_clean_thumbnails;
      if (
        !ids ||
        !thumbs ||
        typeof thumbs !== "object" ||
        Array.isArray(thumbs)
      ) {
        await this._invalidateCleanRefs(src);
        return false;
      }
      if (!window.correctFileIds) return true;
      const fileNameMap = {};
      for (const [id, t] of Object.entries(thumbs)) {
        if (t && typeof t === "object" && t.file_name)
          fileNameMap[id] = t.file_name;
      }
      try {
        const { correctedIds, changed } = await window.correctFileIds(
          ids,
          thumbs,
          fileNameMap,
        );
        if (changed && correctedIds) {
          const oldArr = ids
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
          const newArr = correctedIds
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
          const remapped = {};
          for (let i = 0; i < oldArr.length; i++) {
            const from = oldArr[i],
              to = newArr[i] || oldArr[i];
            if (thumbs[from]) remapped[to] = thumbs[from];
          }
          if (typeof thumbs[CLEAN_SRC_KEY] === "string")
            remapped[CLEAN_SRC_KEY] = thumbs[CLEAN_SRC_KEY];
          src.result_clean_file_ids = correctedIds;
          src.result_clean_thumbnails = remapped;
          try {
            await this._updateNodeStatus(
              src.node_id,
              src.status || "completed",
              null,
              null,
              {
                result_clean_file_ids: src.result_clean_file_ids,
                result_clean_thumbnails: src.result_clean_thumbnails,
              },
            );
          } catch (_) {}
          emitLog({
            nodeId: src.node_id,
            message:
              "[\u1EA2nh s\u1EA1ch] Flow \u0111\xE3 \u0111\u1ED5i tile_id \u2192 \u0111\xE3 s\u1EEDa l\u1EA1i id b\u1EA3n s\u1EA1ch",
          });
        }
        return true;
      } catch (e) {
        console.warn(
          "[CleanRef] revive l\u1ED7i (d\u1EF1ng l\u1EA1i):",
          e?.message || e,
        );
        await this._invalidateCleanRefs(src);
        return false;
      }
    }
    async _withWorkflowUploadToast(node, kind, upload) {
      const notify = (state, type) => {
        try {
          const key = `workflowUploadToast.${kind}.${state}`;
          const name = node?.node_name || node?.node_id || "";
          const translated = window.I18n?.t?.(key, { node: name });
          this._showWorkflowToast(
            translated && translated !== key
              ? translated
              : `${kind} \xB7 ${state} \xB7 ${name}`,
            type,
            6e3,
          );
        } catch (_) {}
      };
      notify("uploading", "info");
      try {
        const result = await upload();
        notify(
          this.shouldStop
            ? "stopped"
            : result?.ok && result.file_id
              ? "done"
              : "failed",
          this.shouldStop
            ? "info"
            : result?.ok && result.file_id
              ? "success"
              : "warning",
        );
        return result;
      } catch (error) {
        notify(
          this.shouldStop ||
            /^(ABORTED|UPLOAD_STOPPED|UPLOAD_ABORTED)$/.test(
              error?.code || error?.message || "",
            )
            ? "stopped"
            : "failed",
          "warning",
        );
        throw error;
      }
    }
    async _uploadCleanRefsForNode(src) {
      const clog = (message, type = "info") =>
        emitLog({
          nodeId: src.node_id,
          message: `[\u1EA2nh s\u1EA1ch] ${message}`,
          type,
        });
      const sourceIdsValue =
        src.node_type === "image" ? src.ref_file_ids : src.result_file_ids;
      const ids = (sourceIdsValue || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!ids.length) return false;
      const cleanIds = [];
      const cleanThumbs = {};
      let anyCleaned = false;
      for (const fid of ids) {
        let cleanedId = null;
        try {
          const thumb =
            src.node_type === "image"
              ? src.ref_thumbnails?.[fid] || src.result_thumbnails?.[fid]
              : src.result_thumbnails?.[fid];
          const url =
            thumb && typeof thumb === "object" ? thumb.thumbnail : thumb;
          if (!url || typeof url !== "string") {
            clog(
              `tile ${fid.substring(0, 10)}: kh\xF4ng c\xF3 URL \u2192 gi\u1EEF g\u1ED1c`,
              "warn",
            );
            cleanIds.push(fid);
            continue;
          }
          const fullUrl = window.WatermarkClient?.fullSizeInputUrl
            ? await window.WatermarkClient.fullSizeInputUrl(url)
            : window.WatermarkClient?.fullSizeUrl
              ? window.WatermarkClient.fullSizeUrl(url)
              : url;
          const _get = async (u) => {
            try {
              return await fetch(u, { cache: "no-store" });
            } catch (_e1) {
              return await fetch(u, {
                credentials: "include",
                cache: "no-store",
              });
            }
          };
          let resp = await _get(fullUrl);
          if (!resp.ok && fullUrl !== url) {
            clog(
              `tile ${fid.substring(0, 10)}: URL b\u1EA3n g\u1ED1c HTTP ${resp.status} \u2192 lui v\u1EC1 URL hi\u1EC3n th\u1ECB`,
              "warn",
            );
            resp = await _get(url);
          }
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          let blob = await resp.blob();
          let cleanBlob = await window.WatermarkClient.cleanBlob(
            blob,
            "image",
            { scope: "input" },
          );
          if (cleanBlob === blob) {
            clog(
              `tile ${fid.substring(0, 10)}: kh\xF4ng th\u1EA5y watermark \u2192 gi\u1EEF g\u1ED1c`,
            );
            cleanIds.push(fid);
            continue;
          }
          let b64 = await new Promise((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => res(String(fr.result).split(",")[1]);
            fr.onerror = () =>
              rej(new Error("\u0111\u1ECDc blob th\u1EA5t b\u1EA1i"));
            fr.readAsDataURL(cleanBlob);
          });
          const mime = cleanBlob.type || "image/png";
          const ext = /jpe?g/i.test(mime) ? "jpg" : "png";
          const uploadPromise = this._withWorkflowUploadToast(
            src,
            "cleanRef",
            () =>
              this._uploadFrameToFlow(
                b64,
                `clean-${src.node_id}-${fid.substring(0, 8)}.${ext}`,
                mime,
              ),
          );
          b64 = null;
          blob = null;
          cleanBlob = null;
          const up = await uploadPromise;
          if (!up?.ok || !up.file_id)
            throw new Error(up?.error || "upload th\u1EA5t b\u1EA1i");
          cleanedId = up.file_id;
          cleanThumbs[up.file_id] = {
            thumbnail: up.thumbnail || "",
            type: "image",
            file_name: up.file_name || "",
            source_file_id: fid,
          };
          anyCleaned = true;
          clog(
            `tile ${fid.substring(0, 10)} \u2192 b\u1EA3n s\u1EA1ch ${String(up.file_id).substring(0, 12)}`,
            "success",
          );
        } catch (e) {
          clog(
            `tile ${fid.substring(0, 10)}: ${e?.message || e} \u2192 gi\u1EEF g\u1ED1c`,
            "warn",
          );
        }
        cleanIds.push(cleanedId || fid);
      }
      if (!anyCleaned) return false;
      cleanThumbs[CLEAN_SRC_KEY] = sourceIdsValue || "";
      src.result_clean_file_ids = cleanIds.join(",");
      src.result_clean_thumbnails = cleanThumbs;
      try {
        await this._updateNodeStatus(
          src.node_id,
          src.status || "completed",
          null,
          null,
          {
            result_clean_file_ids: src.result_clean_file_ids,
            result_clean_thumbnails: src.result_clean_thumbnails,
          },
        );
      } catch (e) {
        console.warn(
          "[CleanRef] persist th\u1EA5t b\u1EA1i (gi\u1EEF trong b\u1ED9 nh\u1EDB):",
          e?.message || e,
        );
      }
      return true;
    }
    async _extractFrameForNode(videoNode, result = null) {
      if (!videoNode) return false;
      const isFlowVideo =
        videoNode.node_type === "generate" &&
        (videoNode.media_type || "Image") === "Video";
      const isGrokVideo =
        videoNode.node_type === "grok" &&
        (videoNode.grok_mode || "image") === "video";
      if (!isFlowVideo && !isGrokVideo) return false;
      const provider = isGrokVideo ? "grok" : "flow";
      const flog = (message, type = "info") =>
        emitLog({
          nodeId: videoNode.node_id,
          message: `[Frame cu\u1ED1i] ${message}`,
          type,
        });
      if (!window.VideoFrameExtractor?.extractLastFrame) {
        flog("VideoFrameExtractor ch\u01B0a load \u2192 b\u1ECF qua", "warn");
        return false;
      }
      const splitIds = (s) =>
        (s || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
      const fileIds =
        Array.isArray(result?.fileIds) && result.fileIds.length
          ? result.fileIds
          : splitIds(videoNode.result_file_ids);
      if (!fileIds.length) {
        flog(
          "node video ch\u01B0a c\xF3 result_file_ids \u2192 b\u1ECF qua",
          "warn",
        );
        return false;
      }
      let srcFid = null;
      for (const fid of fileIds) {
        const t =
          result?.thumbnails?.[fid] || videoNode.result_thumbnails?.[fid];
        if (t && typeof t === "object" && (t.type === "video" || t.video_url)) {
          srcFid = fid;
          break;
        }
      }
      if (!srcFid) srcFid = fileIds[0];
      let videoUrl = null;
      const t0 =
        result?.thumbnails?.[srcFid] || videoNode.result_thumbnails?.[srcFid];
      if (t0 && typeof t0 === "object" && t0.video_url) videoUrl = t0.video_url;
      if (!videoUrl && videoNode.result_provider_urls?.[srcFid]?.url)
        videoUrl = videoNode.result_provider_urls[srcFid].url;
      if (
        !videoUrl &&
        provider === "grok" &&
        t0 &&
        typeof t0 === "object" &&
        t0.thumbnail
      )
        videoUrl = t0.thumbnail;
      const hasUsableFlowVideoTransport = (value) => {
        if (!value) return false;
        try {
          const parsed = new URL(value);
          if (
            parsed.hostname === "flow-content.google" &&
            /^\/video\/[0-9a-f-]{36}(?:\/|$)/i.test(parsed.pathname)
          ) {
            const expires = Number(parsed.searchParams.get("Expires"));
            return Number.isFinite(expires) && expires > Date.now() / 1e3 + 5;
          }
          return (
            parsed.hostname === "flow.google.com" &&
            /^\/asb\/[A-Za-z0-9_-]{32,1024}=mm(?:,|$)/.test(parsed.pathname)
          );
        } catch (_) {
          return false;
        }
      };
      if (
        provider === "flow" &&
        window.MessageBridge?.resolveVideoPlaybackUrl &&
        !hasUsableFlowVideoTransport(videoUrl)
      ) {
        try {
          const sourceThumbnail =
            t0 && typeof t0 === "object"
              ? t0.source_thumbnail || t0.thumbnail || ""
              : typeof t0 === "string"
                ? t0
                : "";
          const webOwnedResult = videoNode.result_gen_mode === "web";
          const providerData =
            result?.providerUrls?.[srcFid] ||
            videoNode.result_provider_urls?.[srcFid] ||
            null;
          const recovered = await window.MessageBridge.resolveVideoPlaybackUrl(
            srcFid,
            {
              fileName:
                (t0 && typeof t0 === "object" ? t0.file_name : "") ||
                result?.fileNames?.[srcFid] ||
                videoNode.result_file_names?.[srcFid] ||
                srcFid,
              sourceUrl: sourceThumbnail,
              persistentMediaId:
                t0 && typeof t0 === "object"
                  ? t0.persistent_media_id || ""
                  : "",
              providerData,
              projectId:
                providerData?.project_id ||
                this.currentWorkflow?.flow_project_id ||
                this.currentWorkflow?.project_id ||
                null,
              rejectedVideoUrls: [videoUrl].filter(Boolean),
              skipMediaApiResolve: webOwnedResult,
              forceDomResolve: webOwnedResult,
              allowVirtualScan: true,
              allowUuidVirtualScan: true,
              surface: "workflow",
            },
          );
          if (recovered?.success && recovered.video_url) {
            videoUrl = recovered.video_url;
            const recoveredMeta = {
              ...(t0 && typeof t0 === "object" ? t0 : {}),
              thumbnail: recovered.thumbnail || sourceThumbnail,
              ...(sourceThumbnail && { source_thumbnail: sourceThumbnail }),
              type: "video",
              video_url: recovered.video_url,
              ...(recovered.persistent_media_id && {
                persistent_media_id: recovered.persistent_media_id,
              }),
            };
            videoNode.result_thumbnails = {
              ...(videoNode.result_thumbnails || {}),
              [srcFid]: recoveredMeta,
            };
            if (result?.thumbnails && typeof result.thumbnails === "object") {
              result.thumbnails[srcFid] = recoveredMeta;
            }
            flog(
              "\u0111\xE3 kh\xF4i ph\u1EE5c URL video t\u1EEB poster/tile hi\u1EC7n t\u1EA1i",
            );
          }
        } catch (e) {
          flog(
            `kh\xF4i ph\u1EE5c URL video th\u1EA5t b\u1EA1i: ${e?.message || e}`,
            "warn",
          );
        }
      }
      if (
        !videoUrl &&
        provider === "flow" &&
        window.MessageBridge?.getThumbnailsByIds
      ) {
        try {
          const scan = await window.MessageBridge.getThumbnailsByIds([srcFid], {
            deep: false,
            exactIdentityOnly: true,
          });
          videoUrl = scan?.results?.[srcFid]?.video_url || null;
        } catch (_) {}
      }
      const durableUrl =
        videoNode.result_provider_urls?.[srcFid]?.durable_url || null;
      if (!videoUrl && durableUrl) videoUrl = durableUrl;
      if (!videoUrl) {
        flog(
          "kh\xF4ng t\xECm \u0111\u01B0\u1EE3c URL video c\u1EE7a tile \u2192 b\u1ECF qua",
          "warn",
        );
        return false;
      }
      flog(`\u0111ang tr\xEDch frame cu\u1ED1i video (${provider})...`);
      const grokTabId =
        provider === "grok"
          ? videoNode.result_provider_urls?.[srcFid]?.tab_id || null
          : null;
      let frame = null;
      const candidates = [...new Set([durableUrl, videoUrl].filter(Boolean))];
      let lastError = null;
      for (const candidate of candidates) {
        try {
          frame = await window.VideoFrameExtractor.extractLastFrame(candidate, {
            provider,
            tabId: grokTabId,
          });
          if (frame?.base64) break;
        } catch (e) {
          lastError = e;
        }
      }
      if (!frame?.base64 && lastError) throw lastError;
      if (!frame?.base64) {
        flog("tr\xEDch frame th\u1EA5t b\u1EA1i \u2192 b\u1ECF qua", "warn");
        return false;
      }
      flog(
        frame.watermarkRemoved
          ? "\u0111\xE3 xo\xE1 watermark kh\u1ECFi frame tr\u01B0\u1EDBc khi upload"
          : "frame kh\xF4ng c\xF3 watermark ho\u1EB7c kh\xF4ng th\u1EC3 l\xE0m s\u1EA1ch \u2014 d\xF9ng bytes g\u1ED1c",
        frame.watermarkRemoved ? "success" : "info",
      );
      const frameName = `frame-${videoNode.node_id}-${Date.now()}.jpg`;
      const up = await this._withWorkflowUploadToast(
        videoNode,
        "lastFrame",
        () =>
          this._uploadLastFrameWithFallback(
            videoNode,
            srcFid,
            frame.base64,
            frameName,
            result,
          ),
      );
      if (!up?.ok || !up.file_id) {
        flog(
          "upload frame l\xEAn Flow th\u1EA5t b\u1EA1i: " +
            (up?.error || "unknown"),
          "warn",
        );
        return false;
      }
      videoNode.result_frame_file_ids = up.file_id;
      videoNode.result_frame_thumbnails = {
        [up.file_id]: {
          thumbnail: up.thumbnail || "",
          type: "image",
          file_name: up.file_name || "",
          source_file_id: srcFid,
          ...(up.media_uuid && { media_uuid: up.media_uuid }),
          ...(up.persistent_media_id && {
            persistent_media_id: up.persistent_media_id,
          }),
          ...(up.identity_kind && { identity_kind: up.identity_kind }),
          ...(up.identity_durability && {
            identity_durability: up.identity_durability,
          }),
        },
      };
      Object.defineProperty(
        videoNode.result_frame_thumbnails[up.file_id],
        "runtime_base64",
        { value: frame.base64, enumerable: false, configurable: true },
      );
      flog(
        `\u2713 \u0111\xE3 tr\xEDch + upload frame cu\u1ED1i \u2192 tile ${String(up.file_id).substring(0, 12)}`,
        "success",
      );
      try {
        await this._updateNodeStatus(
          videoNode.node_id,
          videoNode.status || "completed",
          null,
          null,
          {
            result_thumbnails: videoNode.result_thumbnails,
            result_frame_file_ids: videoNode.result_frame_file_ids,
            result_frame_thumbnails: videoNode.result_frame_thumbnails,
          },
        );
      } catch (_) {}
      return true;
    }
    async _uploadLastFrameWithFallback(
      videoNode,
      sourceFileId,
      base64,
      name,
      result = null,
    ) {
      if (window.FlowApiV2Driver?.uploadReference)
        return this._uploadFrameToFlow(base64, name);
      const providerMeta =
        result?.providerUrls?.[sourceFileId] ||
        videoNode?.result_provider_urls?.[sourceFileId] ||
        {};
      const apiOwned =
        window.FlowApiAdapter?.isApiModeIntended?.({ forWorkflow: true }) ===
        true;
      let apiError = null;
      let uploadDriver = providerMeta.api_driver || null;
      if (apiOwned && !uploadDriver) {
        try {
          const selection = await window.FlowApiSessionCoordinator?.check?.({
            surface: "workflow",
            mediaType: "image",
            passive: true,
          });
          if (selection?.ready === true) uploadDriver = selection.driver;
        } catch (_) {}
      }
      if (
        apiOwned &&
        uploadDriver === "v1" &&
        window.FlowApiAdapter?.uploadRef
      ) {
        try {
          const projectId =
            providerMeta?.project_id ||
            (await window.FlowApiAdapter._resolveProjectId?.({
              projectId: providerMeta?.project_id,
            }));
          if (!projectId) throw new Error("LAST_FRAME_API_PROJECT_MISSING");
          const frameId = await window.FlowApiAdapter.uploadRef(projectId, {
            base64,
            mimeType: "image/jpeg",
            fileName: name,
          });
          if (!frameId) throw new Error("LAST_FRAME_API_UPLOAD_EMPTY");
          if (typeof MediaRegistry !== "undefined")
            MediaRegistry.set(frameId, "", frameId);
          console.log(
            "[LastFrameRecovery] reuploaded missing frame through API",
            JSON.stringify({
              nodeId: videoNode?.node_id,
              sourceFileId,
              frameId,
            }),
          );
          return {
            ok: true,
            file_id: frameId,
            file_name: frameId,
            thumbnail: "",
            media_uuid: frameId,
            persistent_media_id: frameId,
            identity_kind: "flow-api-uuid",
            identity_durability: "durable-resolver",
          };
        } catch (error) {
          apiError = error;
          console.warn(
            "[LastFrameRecovery] API reupload failed; trying DOM fallback",
            {
              nodeId: videoNode?.node_id,
              sourceFileId,
              error: error?.message || String(error),
            },
          );
        }
      }
      const domUpload = await this._uploadFrameToFlow(base64, name);
      if (domUpload?.ok && domUpload.file_id) {
        console.log(
          "[LastFrameRecovery] DOM fallback upload succeeded",
          JSON.stringify({
            nodeId: videoNode?.node_id,
            sourceFileId,
            frameId: domUpload.file_id,
          }),
        );
        return domUpload;
      }
      return (
        domUpload || {
          ok: false,
          error: apiError?.message || "LAST_FRAME_REUPLOAD_FAILED",
        }
      );
    }
    async _uploadFrameToFlow(base64, name, mime = "image/jpeg") {
      const rawBase64 = String(base64 || "").replace(
        /^data:image\/[a-z0-9.+-]+;base64,/i,
        "",
      );
      if (!rawBase64) return { ok: false, error: "FRAME_UPLOAD_EMPTY" };
      if (window.FlowApiV2Driver?.uploadReference) {
        const resp = await window.FlowApiV2Driver.uploadReference({
          base64: rawBase64,
          fileName: name,
          mimeType: mime,
          projectId:
            this.currentWorkflow?.flow_project_id ||
            this.currentWorkflow?.project_id ||
            null,
          surface: "workflow",
          abortFn: () => this.shouldStop === true,
          domUpload: () => this._uploadFrameToFlowDom(rawBase64, name, mime),
        });
        if (resp?.ok && resp.file_id && typeof MediaRegistry !== "undefined") {
          MediaRegistry.set(
            resp.file_id,
            resp.thumbnailUrl || resp.thumbnail || "",
            resp.file_name || void 0,
          );
          MediaRegistry.setRefIdentity?.(resp.file_id, {
            ...resp,
            type: "image",
          });
        }
        return resp;
      }
      return this._uploadFrameToFlowDom(rawBase64, name, mime);
    }
    async _uploadFrameToFlowDom(base64, name, mime = "image/jpeg") {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (this.shouldStop) throw new Error("UPLOAD_STOPPED");
        const resp = await new Promise((resolve) => {
          try {
            chrome.runtime.sendMessage(
              { type: "uploadToFlow", base64, name, mime },
              (r) => {
                void chrome.runtime.lastError;
                resolve(r || null);
              },
            );
          } catch (_) {
            resolve(null);
          }
        });
        if (resp?.ok) {
          if (resp.file_id) {
            if (typeof MediaRegistry !== "undefined") {
              MediaRegistry.set(
                resp.file_id,
                resp.thumbnail || "",
                resp.file_name || void 0,
              );
            }
            if (resp.file_name) {
              if (!(window._workflowRefPreflightCache instanceof Map)) {
                window._workflowRefPreflightCache = new Map();
              }
              window._workflowRefPreflightCache.set(
                resp.file_name,
                resp.file_id,
              );
            }
          }
          return resp;
        }
        console.warn("[LastFrameRecovery] DOM upload attempt failed", {
          attempt: attempt + 1,
          error: resp?.error || "NO_RESPONSE",
          message: resp?.message || null,
        });
        if (resp?.error === "BUSY" && attempt < 2) {
          await this._sleep(1500 * (attempt + 1));
          continue;
        }
        return resp;
      }
      return null;
    }
    async _updateNodeStatus(
      nodeId,
      status,
      fileIds = null,
      errorMessage = null,
      extra = null,
    ) {
      if (nodeId && status && this._nodeStatesLive[nodeId] !== status) {
        this._nodeStatesLive[nodeId] = status;
        this._nodeStatesDirty = true;
      }
      const data = { status };
      if (fileIds && (Array.isArray(fileIds) ? fileIds.length > 0 : fileIds)) {
        data.result_file_ids = Array.isArray(fileIds)
          ? fileIds.join(", ")
          : fileIds;
      }
      if (errorMessage || status === "completed") {
        data.error_message =
          status === "completed" && errorMessage
            ? "[PARTIAL_GENERATION] " + errorMessage
            : errorMessage || "";
      }
      if (status === "completed" || status === "failed") {
        data.executed_at = new Date().toISOString();
      }
      if (extra && typeof extra === "object") {
        if (extra.result_thumbnails)
          data.result_thumbnails = extra.result_thumbnails;
        if (extra.result_file_names)
          data.result_file_names = extra.result_file_names;
        if (extra.result_provider_urls)
          data.result_provider_urls = extra.result_provider_urls;
        if (typeof extra.result_text === "string")
          data.result_text = extra.result_text;
        if (typeof extra.result_source === "string")
          data.result_source = extra.result_source;
        if (
          Object.prototype.hasOwnProperty.call(extra, "result_frame_file_ids")
        ) {
          data.result_frame_file_ids = extra.result_frame_file_ids;
        }
        if (
          Object.prototype.hasOwnProperty.call(extra, "result_clean_file_ids")
        ) {
          data.result_clean_file_ids = extra.result_clean_file_ids;
        }
        if (
          Object.prototype.hasOwnProperty.call(extra, "result_clean_thumbnails")
        ) {
          data.result_clean_thumbnails = extra.result_clean_thumbnails;
        }
        if (
          Object.prototype.hasOwnProperty.call(extra, "result_frame_thumbnails")
        ) {
          data.result_frame_thumbnails = extra.result_frame_thumbnails;
        }
      }
      if (data.result_file_ids !== void 0) {
        data.result_clean_file_ids = null;
        data.result_clean_thumbnails = null;
      }
      const node = this.currentWorkflow?.nodes?.find(
        (n) => n.node_id === nodeId,
      );
      if (node) {
        Object.assign(node, data);
      }
      if (status === "running") {
        return;
      }
      if (this._executionInProgress) {
        const existing = this._nodeStateBuffer.get(nodeId) || {};
        this._nodeStateBuffer.set(nodeId, { ...existing, ...data });
        return;
      }
      await window.storageManager.updateNodeStatus(
        this.currentWorkflow.wf_id,
        nodeId,
        data,
      );
    }
    async _flushNodeStateBuffer() {
      if (this._nodeStateBuffer.size === 0) return;
      if (!this.currentWorkflow?.wf_id) {
        console.warn(
          "[WorkflowExecutor] Cannot flush buffer: no current workflow",
        );
        return;
      }
      const updatedNodes = (this.currentWorkflow.nodes || []).map((n) => {
        const buffered = this._nodeStateBuffer.get(n.node_id);
        return buffered ? { ...n, ...buffered } : n;
      });
      try {
        await window.storageManager.saveWorkflowFull(
          this.currentWorkflow,
          updatedNodes,
          this.currentWorkflow?.edges || [],
        );
        log("Flushed node state buffer:", this._nodeStateBuffer.size, "nodes");
      } catch (e) {
        const isRateLimit = e?.code === "RATE_LIMITED" || e?.httpStatus === 429;
        if (isRateLimit) {
          console.warn(
            "[WorkflowExecutor] Flush buffer rate-limited (429) \u2014 skip fallback PATCH per-node (s\u1EBD retry l\u1EA7n execute ti\u1EBFp)",
          );
          return;
        }
        console.error(
          "[WorkflowExecutor] Flush buffer failed, fallback PATCH t\u1EEBng node:",
          e,
        );
        if (!this.currentWorkflow?.wf_id) return;
        for (const [nodeId, data] of this._nodeStateBuffer) {
          try {
            await window.storageManager.updateNodeStatus(
              this.currentWorkflow.wf_id,
              nodeId,
              data,
            );
          } catch (err) {
            if (err?.code === "RATE_LIMITED" || err?.httpStatus === 429) {
              console.warn(
                "[WorkflowExecutor] Per-node PATCH rate-limited (429) \u2014 stop fallback loop",
              );
              return;
            }
            console.error(
              "[WorkflowExecutor] Fallback PATCH failed for node:",
              nodeId,
              err,
            );
          }
        }
      }
    }
    async _updateWorkflowStatus(status) {
      if (!this.currentWorkflow?.wf_id) {
        console.warn(
          "[WorkflowExecutor] _updateWorkflowStatus skipped - no current workflow",
        );
        return;
      }
      const now = new Date().toISOString();
      const data = {
        wf_id: this.currentWorkflow.wf_id,
        status,
        updated_at: now,
      };
      if (status === "running") {
        data.last_run_at = now;
      }
      console.log(
        "[WorkflowExecutor] _updateWorkflowStatus:",
        status,
        "wfId:",
        data.wf_id,
      );
      await window.storageManager.saveWorkflow(data);
      console.log("[WorkflowExecutor] _updateWorkflowStatus done");
      if (!this.currentWorkflow) return;
      this.currentWorkflow.status = status;
      if (status === "running") {
        this.currentWorkflow.last_run_at = now;
      }
    }
    async _updateWorkflowProgress(completed, total, currentNodeId) {
      if (this.currentWorkflow) {
        this.currentWorkflow.progress_completed = completed;
        this.currentWorkflow.progress_total = total;
        this.currentWorkflow.current_node_id = currentNodeId;
      }
    }
    async _sleep(ms) {
      const chunks = Math.ceil(ms / 500);
      for (let i = 0; i < chunks; i++) {
        if (this.shouldStop) return;
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(500, ms - i * 500)),
        );
      }
    }
  }
  window.WorkflowExecutor = WorkflowExecutor;
  window.workflowExecutor = new WorkflowExecutor();
  WorkflowExecutor.getCrossContextRunning = readRunningFlag;
  WorkflowExecutor.clearCrossContextRunning = clearRunningFlag;
  WorkflowExecutor.requestCrossContextStop = async (running) => {
    if (!running?.wf_id) return;
    const timeoutMs = Number(
      window.SystemConfig?.safeGetTimeout?.("api_timeout_ms"),
    );
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
      throw new Error("FLOW_COMMAND_TIMEOUT_CONFIG_UNAVAILABLE");
    const deadline = Date.now() + timeoutMs;
    broadcastEvent("execution:stop", {
      wf_id: running.wf_id,
      run_id: running.run_id || null,
    });
    while (Date.now() < deadline) {
      const current = await readRunningFlag();
      if (
        !current ||
        current.wf_id !== running.wf_id ||
        (running.run_id
          ? current.run_id !== running.run_id
          : current.started_at !== running.started_at)
      )
        return;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(100, Math.max(0, deadline - Date.now()))),
      );
    }
    throw Object.assign(new Error("WORKFLOW_STOP_ACK_TIMEOUT"), {
      code: "WORKFLOW_STOP_ACK_TIMEOUT",
      noRetry: true,
    });
  };
  WorkflowExecutor.recoverBufferCheckpoint = async function (wfId) {
    if (!wfId) return false;
    try {
      const storageKey = `af_workflow_buffer_${wfId}`;
      const data = await new Promise((resolve) => {
        chrome.storage.local.get([storageKey], (r) => resolve(r));
      });
      const buffer = data[storageKey];
      if (!buffer?.nodes || Object.keys(buffer.nodes).length === 0)
        return false;
      const BUFFER_TTL_MS = 30 * 60 * 1e3;
      if (buffer.timestamp && Date.now() - buffer.timestamp > BUFFER_TTL_MS) {
        console.info(
          "[WorkflowExecutor] Discarding stale buffer checkpoint (>",
          BUFFER_TTL_MS / 6e4,
          "min old)",
        );
        chrome.storage.local.remove([storageKey]);
        return false;
      }
      console.info(
        "[WorkflowExecutor] Recovering buffer checkpoint:",
        Object.keys(buffer.nodes).length,
        "nodes",
      );
      for (const [nodeId, nodeData] of Object.entries(buffer.nodes)) {
        try {
          await window.storageManager?.updateNodeStatus(wfId, nodeId, nodeData);
        } catch (e) {
          console.warn(
            "[WorkflowExecutor] Recovery PATCH failed for node:",
            nodeId,
            e,
          );
        }
      }
      chrome.storage.local.remove([storageKey]);
      console.info(
        "[WorkflowExecutor] Buffer checkpoint recovered and cleared",
      );
      return true;
    } catch (e) {
      console.error("[WorkflowExecutor] Buffer recovery error:", e);
      return false;
    }
  };
})();
