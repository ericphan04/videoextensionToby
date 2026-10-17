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
const _ApiStorage = class _ApiStorage {
  constructor() {}
  _handleAuthError(err) {
    const isAuthError =
      err.httpStatus === 401 ||
      err.httpStatus === 403 ||
      err.code === "UNAUTHENTICATED" ||
      err.message?.includes("\u0111\u0103ng nh\u1EADp");
    if (
      isAuthError &&
      window.storageManager?.mode === "api" &&
      !_ApiStorage._authErrorEmitted
    ) {
      _ApiStorage._authErrorEmitted = true;
      console.info(
        "[ApiStorage] Auth session expired, emitting api:auth_error",
      );
      window.eventBus?.emit("api:auth_error", { error: err });
      setTimeout(() => {
        _ApiStorage._authErrorEmitted = false;
      }, 5e3);
    }
    return isAuthError;
  }
  _handleQuotaError(err) {
    console.log("[ApiStorage] Checking quota error:", {
      code: err.code,
      httpStatus: err.httpStatus,
      message: err.message,
    });
    const isQuotaError =
      err.code === "QUOTA_EXCEEDED" ||
      err.code === "WORKFLOW_QUOTA_EXCEEDED" ||
      err.message?.includes("QUOTA_EXCEEDED");
    if (isQuotaError) {
      const dialog = window.customDialog || window.CustomDialog;
      if (dialog) {
        const message =
          err.message || "You have reached the limit for your current plan";
        dialog.alert(
          message +
            "\n\nVui l\xF2ng n\xE2ng c\u1EA5p l\xEAn Premium \u0111\u1EC3 s\u1EED d\u1EE5ng kh\xF4ng gi\u1EDBi h\u1EA1n.",
          { title: "Limit reached", type: "warning" },
        );
      } else {
        alert("Limit reached: " + (err.message || "Please upgrade to Premium"));
      }
      return true;
    }
    return false;
  }
  _auth() {
    if (!window.authManager) {
      throw new Error(
        "AuthManager ch\u01B0a \u0111\u01B0\u1EE3c kh\u1EDFi t\u1EA1o",
      );
    }
    return window.authManager;
  }
  async _call(method, endpoint, data = null, retries = 2, options = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        let response;
        if (method === "GET" && window.RequestCoalescer?.isReady()) {
          response = await window.RequestCoalescer.request(
            method,
            endpoint,
            data,
            options,
          );
        } else {
          response = await this._auth()._apiCall(method, endpoint, data);
        }
        return response;
      } catch (err) {
        lastError = err;
        if (this._handleAuthError(err)) {
          throw err;
        }
        const isNetworkError =
          !err.httpStatus ||
          err.message?.includes("network") ||
          err.message?.includes("Failed to fetch") ||
          err.message?.includes("timeout");
        if (!isNetworkError || attempt >= retries) {
          throw err;
        }
        const delay = Math.min(500 * Math.pow(2, attempt), 2e3);
        console.warn(
          `[ApiStorage] Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${retries}):`,
          err.message,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }
  async getTasks(options = {}) {
    try {
      const params = new URLSearchParams();
      if (options.page) params.set("page", String(options.page));
      if (options.per_page) params.set("per_page", String(options.per_page));
      if (options.search) params.set("search", options.search);
      if (options.project_id) params.set("project_id", options.project_id);
      const query = params.toString();
      const endpoint = query ? `tasks?${query}` : "tasks";
      const result = await this._call("GET", endpoint);
      console.log(
        "[TobyFlow] ApiStorage: L\u1EA5y danh s\xE1ch tasks th\xE0nh c\xF4ng",
      );
      if (Array.isArray(result)) {
        return {
          data: result,
          meta: { current_page: 1, last_page: 1, total: result.length },
        };
      }
      return {
        data: result.data || [],
        meta: result.meta || {
          current_page: 1,
          last_page: 1,
          total: result.data?.length || 0,
        },
      };
    } catch (err) {
      const isAuthError =
        err.code === "UNAUTHENTICATED" ||
        err.httpStatus === 401 ||
        /unauthenticated/i.test(err.message || "");
      const isRateLimit = err.code === "RATE_LIMITED" || err.httpStatus === 429;
      if (isAuthError) {
        console.info("[TobyFlow] ApiStorage: Skip getTasks (UNAUTHENTICATED)");
      } else if (isRateLimit) {
        console.warn("[TobyFlow] ApiStorage: Skip getTasks (RATE_LIMITED)");
      } else {
        console.error(
          "[TobyFlow] ApiStorage: L\u1ED7i l\u1EA5y danh s\xE1ch tasks",
          err.message,
        );
      }
      throw err;
    }
  }
  async getTask(taskId) {
    try {
      const result = await this._call("GET", `tasks/${taskId}`);
      return result;
    } catch (err) {
      console.error(
        "[TobyFlow] ApiStorage: L\u1ED7i l\u1EA5y task",
        taskId,
        err.message,
      );
      return null;
    }
  }
  async saveTask(task) {
    const { _isNew, ...taskData } = task;
    const isNew = _isNew || !taskData.task_id;
    taskData.platform = "flow";
    if (taskData.project_id && !taskData.project_name) {
      if (
        taskData.project_id === window._currentProjectId &&
        window._currentProjectName
      ) {
        taskData.project_name = window._currentProjectName;
      } else {
        try {
          const result = await chrome.storage.local.get("af_projects");
          const projects = result.af_projects || {};
          if (projects[taskData.project_id]?.name) {
            taskData.project_name = projects[taskData.project_id].name;
          }
        } catch (e) {}
      }
    }
    try {
      let result;
      if (!isNew) {
        result = await this._call("PUT", `tasks/${taskData.task_id}`, taskData);
        console.log(
          "[TobyFlow] ApiStorage: C\u1EADp nh\u1EADt task",
          taskData.task_id,
        );
      } else {
        result = await this._call("POST", "tasks", taskData);
        console.log(
          "[TobyFlow] ApiStorage: T\u1EA1o task m\u1EDBi",
          result?.task_id,
        );
      }
      this._verifyTaskRefGroupSave(taskData, result);
      return result;
    } catch (err) {
      const isNotFound =
        err.httpStatus === 404 || err.message?.includes("No query results");
      if (!isNew && isNotFound) {
        try {
          const result = await this._call("POST", "tasks", taskData);
          this._verifyTaskRefGroupSave(taskData, result);
          console.log(
            "[TobyFlow] ApiStorage: T\u1EA1o task m\u1EDBi (fallback t\u1EEB 404)",
            result?.task_id,
          );
          return result;
        } catch (retryErr) {
          this._handleQuotaError(retryErr);
          console.error(
            "[TobyFlow] ApiStorage: L\u1ED7i t\u1EA1o task (fallback)",
            retryErr.message,
          );
          throw retryErr;
        }
      }
      this._handleQuotaError(err);
      console.error(
        "[TobyFlow] ApiStorage: L\u1ED7i l\u01B0u task",
        err.message,
      );
      throw err;
    }
  }
  _verifyTaskRefGroupSave(request, saved) {
    if (request.ref_images_per_prompt == null) return;
    const requested = window.RefImageAssignment.count(
      request.ref_images_per_prompt,
    );
    const returned = window.RefImageAssignment.count(
      saved?.ref_images_per_prompt,
    );
    console.info("[TaskRefGroupSave]", {
      taskId: saved?.task_id || request.task_id,
      requested,
      returned,
      fieldPresent: saved?.ref_images_per_prompt != null,
      matched: requested === returned,
    });
    if (requested === returned) return;
    const key = "tasks.refGroupNotSaved";
    const message = window.I18n?.t(key);
    const detail = `${window.I18n?.t("gen.refImages") || ""} (${requested} \u2192 ${returned})`;
    const error = new Error(message && message !== key ? message : detail);
    error.code = "TASK_REF_GROUP_NOT_SAVED";
    error.httpStatus = 409;
    throw error;
  }
  async deleteTask(taskId) {
    try {
      await this._call("DELETE", `tasks/${taskId}`);
      console.log("[TobyFlow] ApiStorage: X\xF3a task", taskId);
      return true;
    } catch (err) {
      console.error(
        "[TobyFlow] ApiStorage: L\u1ED7i x\xF3a task",
        taskId,
        err.message,
      );
      throw err;
    }
  }
  async updateTaskStatus(taskId, status, fileIds = "", extra = null) {
    try {
      const data = { status };
      if (fileIds) {
        data.result_file_ids = fileIds;
      }
      if (extra && typeof extra === "object") {
        if (extra.result_thumbnails)
          data.result_thumbnails = extra.result_thumbnails;
        if (extra.result_file_names)
          data.result_file_names = extra.result_file_names;
        if (extra.result_provider_urls)
          data.result_provider_urls = extra.result_provider_urls;
        if (extra.error_message) data.error_message = extra.error_message;
        if (extra.executed_at) data.executed_at = extra.executed_at;
      }
      const result = await this._call("PATCH", `tasks/${taskId}/status`, data);
      console.log(
        "[TobyFlow] ApiStorage: C\u1EADp nh\u1EADt tr\u1EA1ng th\xE1i task",
        taskId,
        "->",
        status,
      );
      return result;
    } catch (err) {
      console.error(
        "[TobyFlow] ApiStorage: L\u1ED7i c\u1EADp nh\u1EADt tr\u1EA1ng th\xE1i task",
        taskId,
        err.message,
      );
      throw err;
    }
  }
  async getWorkflows(options = {}) {
    try {
      const params = new URLSearchParams();
      if (options.page) params.set("page", String(options.page));
      if (options.per_page) params.set("per_page", String(options.per_page));
      if (options.search) params.set("search", options.search);
      if (options.project_id) params.set("project_id", options.project_id);
      if (options.platform) params.set("platform", options.platform);
      const query = params.toString();
      const endpoint = query ? `workflows?${query}` : "workflows";
      const result = await this._call("GET", endpoint);
      console.log(
        "[TobyFlow] ApiStorage: L\u1EA5y danh s\xE1ch workflows th\xE0nh c\xF4ng",
      );
      if (Array.isArray(result)) {
        return {
          data: result,
          meta: { current_page: 1, last_page: 1, total: result.length },
        };
      }
      return {
        data: result.data || [],
        meta: result.meta || {
          current_page: 1,
          last_page: 1,
          total: result.data?.length || 0,
        },
      };
    } catch (err) {
      const isAuthError =
        err.code === "UNAUTHENTICATED" ||
        err.httpStatus === 401 ||
        /unauthenticated/i.test(err.message || "");
      if (isAuthError) {
        console.info(
          "[TobyFlow] ApiStorage: Skip getWorkflows (UNAUTHENTICATED)",
        );
      } else {
        console.error(
          "[TobyFlow] ApiStorage: L\u1ED7i l\u1EA5y danh s\xE1ch workflows",
          err.message,
        );
      }
      if (err.code === "RATE_LIMITED" || err.httpStatus === 429) {
        throw err;
      }
      return { data: [], meta: { current_page: 1, last_page: 1, total: 0 } };
    }
  }
  async getWorkflowDefinitionFresh(wfId) {
    const [nodeResponse, edgeResponse] = await Promise.all([
      this._call("GET", `workflows/${wfId}/nodes`, null, 2, {
        skipCoalesce: true,
      }),
      this._call("GET", `workflows/${wfId}/edges`, null, 2, {
        skipCoalesce: true,
      }),
    ]);
    const nodes = Array.isArray(nodeResponse)
      ? nodeResponse
      : nodeResponse?.data;
    const edges = Array.isArray(edgeResponse)
      ? edgeResponse
      : edgeResponse?.data;
    if (!Array.isArray(nodes) || !Array.isArray(edges))
      throw new Error("WORKFLOW_DEFINITION_INVALID");
    return { nodes, edges };
  }
  async getWorkflow(wfId) {
    try {
      const result = await this._call("GET", `workflows/${wfId}`);
      if (result) {
        if (!Array.isArray(result.nodes)) result.nodes = [];
        if (!Array.isArray(result.edges)) result.edges = [];
      }
      return result;
    } catch (err) {
      if (err.httpStatus === 404) {
        console.log(
          "[TobyFlow] ApiStorage: Workflow kh\xF4ng t\u1ED3n t\u1EA1i",
          wfId,
        );
        return null;
      }
      console.error(
        "[TobyFlow] ApiStorage: L\u1ED7i l\u1EA5y workflow",
        wfId,
        err.message,
      );
      err._isConnectionError = true;
      throw err;
    }
  }
  async saveWorkflow(workflow) {
    try {
      const data = { ...workflow };
      if (data.settings && !data.settings_json) {
        data.settings_json = data.settings;
        delete data.settings;
      }
      data.platform = "flow";
      if (data.project_id && !data.project_name) {
        if (
          data.project_id === window._currentProjectId &&
          window._currentProjectName
        ) {
          data.project_name = window._currentProjectName;
        } else {
          try {
            const result2 = await chrome.storage.local.get("af_projects");
            const projects = result2.af_projects || {};
            if (projects[data.project_id]?.name) {
              data.project_name = projects[data.project_id].name;
            }
          } catch (e) {}
        }
      }
      const isNew = !data.wf_id || data._isNew;
      delete data._isNew;
      let result;
      if (!isNew) {
        result = await this._call("PUT", `workflows/${data.wf_id}`, data);
        console.log(
          "[TobyFlow] ApiStorage: C\u1EADp nh\u1EADt workflow",
          data.wf_id,
        );
      } else {
        result = await this._call("POST", "workflows", data);
        console.log(
          "[TobyFlow] ApiStorage: T\u1EA1o workflow m\u1EDBi",
          result?.wf_id,
        );
      }
      const wfId = data.wf_id || result?.wf_id;
      if (wfId) {
        try {
          window.RequestCoalescer?.invalidate?.(
            Object.hasOwn(data, "project_id")
              ? "workflows"
              : `workflows/${wfId}`,
          );
        } catch (e) {}
      }
      return result;
    } catch (err) {
      this._handleQuotaError(err);
      console.error(
        "[TobyFlow] ApiStorage: L\u1ED7i l\u01B0u workflow",
        err.message,
      );
      throw err;
    }
  }
  async deleteWorkflow(wfId) {
    try {
      await this._call("DELETE", `workflows/${wfId}`);
      window.RequestCoalescer?.invalidate?.("workflows");
      console.log("[TobyFlow] ApiStorage: X\xF3a workflow", wfId);
      return true;
    } catch (err) {
      console.error(
        "[TobyFlow] ApiStorage: L\u1ED7i x\xF3a workflow",
        wfId,
        err.message,
      );
      throw err;
    }
  }
  async getNodes(wfId) {
    try {
      const result = await this._call("GET", `workflows/${wfId}/nodes`);
      return Array.isArray(result) ? result : result.data || [];
    } catch (err) {
      console.error(
        "[TobyFlow] ApiStorage: L\u1ED7i l\u1EA5y nodes c\u1EE7a workflow",
        wfId,
        err.message,
      );
      return [];
    }
  }
  async saveNode(wfId, node) {
    try {
      const payload = this._prepareNodeMediaForPersistence(node);
      let result;
      if (node.node_id && !node._isNew) {
        result = await this._call(
          "PUT",
          `workflows/${wfId}/nodes/${node.node_id}`,
          payload,
        );
        console.log(
          "[TobyFlow] ApiStorage: C\u1EADp nh\u1EADt node",
          node.node_id,
        );
      } else {
        delete node._isNew;
        delete payload._isNew;
        result = await this._call("POST", `workflows/${wfId}/nodes`, payload);
        console.log(
          "[TobyFlow] ApiStorage: T\u1EA1o node m\u1EDBi trong workflow",
          wfId,
        );
      }
      window.RequestCoalescer?.invalidate?.(`workflows/${wfId}`);
      return result;
    } catch (err) {
      this._handleQuotaError(err);
      console.error(
        "[TobyFlow] ApiStorage: L\u1ED7i l\u01B0u node",
        err.message,
      );
      throw err;
    }
  }
  async deleteNode(wfId, nodeId) {
    try {
      await this._call("DELETE", `workflows/${wfId}/nodes/${nodeId}`);
      window.RequestCoalescer?.invalidate?.(`workflows/${wfId}`);
      console.log(
        "[TobyFlow] ApiStorage: X\xF3a node",
        nodeId,
        "kh\u1ECFi workflow",
        wfId,
      );
      return true;
    } catch (err) {
      this._handleQuotaError(err);
      console.error(
        "[TobyFlow] ApiStorage: L\u1ED7i x\xF3a node",
        nodeId,
        err.message,
      );
      throw err;
    }
  }
  async updateNodeStatus(wfId, nodeId, data) {
    try {
      const result = await this._call(
        "PATCH",
        `workflows/${wfId}/nodes/${nodeId}/status`,
        this._prepareNodeMediaForPersistence(data),
      );
      return result;
    } catch (err) {
      console.warn(
        "[TobyFlow] ApiStorage: L\u1ED7i c\u1EADp nh\u1EADt tr\u1EA1ng th\xE1i node",
        nodeId,
        err.message,
      );
      return null;
    }
  }
  async getEdges(wfId) {
    try {
      const result = await this._call("GET", `workflows/${wfId}/edges`);
      return Array.isArray(result) ? result : result.data || [];
    } catch (err) {
      console.error(
        "[TobyFlow] ApiStorage: L\u1ED7i l\u1EA5y edges c\u1EE7a workflow",
        wfId,
        err.message,
      );
      return [];
    }
  }
  async saveEdge(wfId, edge) {
    try {
      const result = await this._call("POST", `workflows/${wfId}/edges`, edge);
      console.log("[TobyFlow] ApiStorage: T\u1EA1o edge trong workflow", wfId);
      return result;
    } catch (err) {
      this._handleQuotaError(err);
      console.error(
        "[TobyFlow] ApiStorage: L\u1ED7i l\u01B0u edge",
        err.message,
      );
      throw err;
    }
  }
  async deleteEdge(wfId, edgeId) {
    try {
      await this._call("DELETE", `workflows/${wfId}/edges/${edgeId}`);
      console.log(
        "[TobyFlow] ApiStorage: X\xF3a edge",
        edgeId,
        "kh\u1ECFi workflow",
        wfId,
      );
      return true;
    } catch (err) {
      this._handleQuotaError(err);
      console.error(
        "[TobyFlow] ApiStorage: L\u1ED7i x\xF3a edge",
        edgeId,
        err.message,
      );
      throw err;
    }
  }
  _prepareNodeMediaForPersistence(node) {
    if (!node || typeof node !== "object" || Array.isArray(node)) return node;
    const out = { ...node };
    let removed = 0;
    const copy = (value) => {
      if (typeof value === "string" && /^(?:data:|blob:)/i.test(value.trim())) {
        removed++;
        return void 0;
      }
      if (Array.isArray(value))
        return value.map(copy).filter((item) => item !== void 0);
      if (value && typeof value === "object") {
        const entries = [];
        for (const [key, item] of Object.entries(value)) {
          const cleaned = copy(item);
          if (cleaned !== void 0) entries.push([key, cleaned]);
        }
        return Object.fromEntries(entries);
      }
      return value;
    };
    for (const field of [
      "ref_thumbnails",
      "result_thumbnails",
      "result_provider_urls",
      "result_frame_thumbnails",
      "result_clean_thumbnails",
    ]) {
      if (out[field] && typeof out[field] === "object")
        out[field] = copy(out[field]);
    }
    const mediaEntryBytes = (value) =>
      JSON.stringify(value)
        .replace(
          /[^\x00-\x7f]/g,
          (char) => "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0"),
        )
        .replace(/\//g, "\\/").length;
    for (const field of [
      "ref_thumbnails",
      "result_thumbnails",
      "result_frame_thumbnails",
      "result_clean_thumbnails",
    ]) {
      const map = out[field];
      if (!map || typeof map !== "object" || Array.isArray(map)) continue;
      for (const [id, entry] of Object.entries(map)) {
        if (
          !entry ||
          typeof entry !== "object" ||
          Array.isArray(entry) ||
          typeof entry.display_name !== "string" ||
          mediaEntryBytes(entry) <= 4096 ||
          !(entry.media_uuid || entry.persistent_media_id || entry.file_name)
        )
          continue;
        const { display_name, ...withoutName } = entry;
        if (mediaEntryBytes(withoutName) <= 4096) map[id] = withoutName;
      }
    }
    if (removed)
      console.warn("[ApiStorage] Omitted session-only media URIs from save", {
        nodeId: node.node_id || null,
        count: removed,
      });
    return out;
  }
  async saveWorkflowFull(workflow, nodes, edges) {
    try {
      const BOOLEAN_NOT_NULL_DEFAULTS = {
        enabled: true,
        auto_download: false,
        enhance: false,
        enhance_fallback: true,
        multi_prompt: false,
        slug_auto: true,
      };
      const normalizedNodes = (nodes || []).map((n) => {
        if (!n || typeof n !== "object") return n;
        const out = this._prepareNodeMediaForPersistence(n);
        if (out.delay_seconds !== void 0 && out.delay_seconds !== null) {
          const ds = parseInt(out.delay_seconds, 10);
          if (!Number.isFinite(ds) || ds < 1) {
            console.warn(
              `[ApiStorage] Normalize: node "${out.node_id}" delay_seconds ${out.delay_seconds} \u2192 3 (rule min:1)`,
            );
            out.delay_seconds = 3;
          } else if (ds > 300) {
            console.warn(
              `[ApiStorage] Normalize: node "${out.node_id}" delay_seconds ${ds} \u2192 300 (rule max:300)`,
            );
            out.delay_seconds = 300;
          } else {
            out.delay_seconds = ds;
          }
        }
        for (const [field, defaultVal] of Object.entries(
          BOOLEAN_NOT_NULL_DEFAULTS,
        )) {
          if (out[field] === null) {
            console.warn(
              `[ApiStorage] Normalize: node "${out.node_id}" ${field}=null \u2192 ${defaultVal} (NOT NULL column)`,
            );
            out[field] = defaultVal;
          }
        }
        return out;
      });
      const payload = { ...workflow, nodes: normalizedNodes, edges };
      if (payload.settings && !payload.settings_json) {
        payload.settings_json = payload.settings;
        delete payload.settings;
      }
      const allowedCreatedSources = new Set([
        "extension",
        "mcp",
        "template",
        "shared",
        "admin_clone",
      ]);
      if (
        payload.created_source != null &&
        !allowedCreatedSources.has(payload.created_source)
      ) {
        console.warn(
          "[ApiStorage] Normalize: unsupported created_source omitted",
        );
        delete payload.created_source;
      }
      payload.platform = "flow";
      console.log(
        "[FlowRefBackendAudit] API request",
        JSON.stringify({
          wf_id: payload.wf_id || null,
          nodes: normalizedNodes
            .filter((node) => node?.ref_file_ids)
            .map((node) => ({
              node_id: node.node_id || null,
              ref_file_ids: node.ref_file_ids,
              refs: Object.entries(node.ref_thumbnails || {}).map(
                ([id, value]) => ({
                  id,
                  type:
                    value && typeof value === "object"
                      ? value.type || null
                      : "image",
                  has_thumbnail: !!(value && typeof value === "object"
                    ? value.thumbnail
                    : value),
                  has_source_thumbnail: !!(
                    value &&
                    typeof value === "object" &&
                    value.source_thumbnail
                  ),
                  has_video_url: !!(
                    value &&
                    typeof value === "object" &&
                    value.video_url
                  ),
                }),
              ),
              ref_file_names: Object.keys(node.ref_file_names || {}),
            })),
        }),
      );
      if (payload.project_id && !payload.project_name) {
        if (
          payload.project_id === window._currentProjectId &&
          window._currentProjectName
        ) {
          payload.project_name = window._currentProjectName;
        } else {
          try {
            const result2 = await chrome.storage.local.get("af_projects");
            const projects = result2.af_projects || {};
            if (projects[payload.project_id]?.name) {
              payload.project_name = projects[payload.project_id].name;
            }
          } catch (e) {}
        }
      }
      const result = await this._call("POST", "workflows/bulk-save", payload);
      console.log(
        "[FlowRefBackendAudit] API response",
        JSON.stringify({
          wf_id: result?.wf_id || null,
          nodes: Array.isArray(result?.nodes)
            ? result.nodes
                .filter((node) => node?.ref_file_ids)
                .map((node) => ({
                  node_id: node.node_id || null,
                  ref_file_ids: node.ref_file_ids,
                  refs: Object.entries(node.ref_thumbnails || {}).map(
                    ([id, value]) => ({
                      id,
                      type:
                        value && typeof value === "object"
                          ? value.type || null
                          : "image",
                      has_thumbnail: !!(value && typeof value === "object"
                        ? value.thumbnail
                        : value),
                      has_source_thumbnail: !!(
                        value &&
                        typeof value === "object" &&
                        value.source_thumbnail
                      ),
                      has_video_url: !!(
                        value &&
                        typeof value === "object" &&
                        value.video_url
                      ),
                    }),
                  ),
                  ref_file_names: Object.keys(node.ref_file_names || {}),
                }))
            : null,
        }),
      );
      console.log(
        "[TobyFlow] ApiStorage: L\u01B0u to\xE0n b\u1ED9 workflow",
        workflow.wf_id,
      );
      try {
        window.RequestCoalescer?.invalidate?.(`workflows/${workflow.wf_id}`);
      } catch (e) {}
      return result;
    } catch (err) {
      this._handleQuotaError(err);
      if (err.details && typeof err.details === "object") {
        console.error(
          "[TobyFlow] ApiStorage: L\u1ED7i l\u01B0u to\xE0n b\u1ED9 workflow",
          err.message,
          "\u2014 field errors:",
          err.details,
        );
      } else {
        console.error(
          "[TobyFlow] ApiStorage: L\u1ED7i l\u01B0u to\xE0n b\u1ED9 workflow",
          err.message,
        );
      }
      throw err;
    }
  }
  async resetWorkflow(wfId) {
    try {
      const result = await this._call("POST", `workflows/${wfId}/reset`);
      try {
        window.RequestCoalescer?.invalidate?.(`workflows/${wfId}`);
      } catch (e) {}
      console.log("[TobyFlow] ApiStorage: Reset workflow", wfId);
      return result || true;
    } catch (err) {
      console.error(
        "[TobyFlow] ApiStorage: L\u1ED7i reset workflow",
        wfId,
        err.message,
      );
      throw err;
    }
  }
};
__publicField(_ApiStorage, "_authErrorEmitted", false);
let ApiStorage = _ApiStorage;
window.ApiStorage = ApiStorage;
