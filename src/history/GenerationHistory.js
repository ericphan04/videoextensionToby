(function () {
  "use strict";
  const MAX_LOCAL_RECORDS = 200;
  const BATCH_FLUSH_INTERVAL = 1e4;
  const BATCH_MAX_SIZE = 10;
  const BATCH_REQUEST_DELAY = 100;
  class GenerationHistory {
    constructor() {
      this.isInitialized = false;
      this._buffer = [];
      this._flushTimer = null;
      this._flushing = false;
      this._taskStartedAt = new Map();
    }
    async init() {
      if (this.isInitialized) return;
      this.isInitialized = true;
      this._setupAutoSave();
      this._setupFlushOnUnload();
      console.log(
        "[TobyFlow] GenerationHistory \u0111\xE3 s\u1EB5n s\xE0ng (batching enabled)",
      );
    }
    _setupFlushOnUnload() {
      window.addEventListener("beforeunload", () => {
        if (this._buffer.length > 0) {
          this._flushSync();
        }
      });
    }
    _setupAutoSave() {
      if (!window.eventBus) return;
      window.eventBus.on("task:status_changed", async (data) => {
        const taskKey = data.task_id || data.taskId;
        if (
          data.status === "running" &&
          taskKey &&
          !this._taskStartedAt.has(taskKey)
        ) {
          this._taskStartedAt.set(taskKey, Date.now());
        }
        if (
          data.status === "completed" ||
          data.status === "failed" ||
          data.status === "stopped"
        ) {
          const startedAt = taskKey ? this._taskStartedAt.get(taskKey) : null;
          if (taskKey) this._taskStartedAt.delete(taskKey);
          await this.saveFromTask({
            ...data,
            duration_ms: Number.isFinite(data.duration_ms)
              ? data.duration_ms
              : startedAt
                ? Math.max(0, Date.now() - startedAt)
                : null,
          });
        }
      });
      window.eventBus.on("prompt:completed", async (data) => {
        await this.saveRecord(data);
      });
    }
    async saveFromTask(taskData) {
      const record = {
        prompt: taskData.prompt || "",
        media_type: taskData.media_type || taskData.genType || null,
        model: taskData.model || "",
        ratio: taskData.ratio || taskData.aspectRatio || "",
        prompt_count: taskData.prompt_count || null,
        quantity: taskData.quantity || null,
        ref_file_ids: taskData.ref_file_ids || taskData.fileIds || "",
        ref_thumbnails: taskData.ref_thumbnails || {},
        ref_flow_file_ids: Array.isArray(taskData.ref_flow_file_ids)
          ? taskData.ref_flow_file_ids
          : [],
        result_file_ids: taskData.result_file_ids || "",
        result_flow_file_ids: Array.isArray(taskData.result_flow_file_ids)
          ? taskData.result_flow_file_ids
          : [],
        result_thumbnails: taskData.result_thumbnails || [],
        result_file_names: taskData.result_file_names || {},
        result_provider_urls: taskData.result_provider_urls || {},
        flow_api_versions: taskData.flow_api_versions || [],
        error_details: taskData.error_details || [],
        source: taskData.source || "task",
        source_id: taskData.task_id || taskData.source_id || "",
        status:
          taskData.status === "stopped"
            ? "stopped"
            : taskData.status === "failed"
              ? "failed"
              : taskData.error_details?.length
                ? "partial"
                : "success",
        error_reason: taskData.error_reason || taskData.error || null,
        duration_ms: Number.isFinite(taskData.duration_ms)
          ? taskData.duration_ms
          : null,
        stop_origin: taskData.stop_origin || null,
        provider: taskData.provider || "flow",
        historyRoute: taskData.historyRoute || null,
        ...(Object.prototype.hasOwnProperty.call(taskData, "gen_mode")
          ? { gen_mode: taskData.gen_mode }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(taskData, "initial_gen_mode")
          ? { initial_gen_mode: taskData.initial_gen_mode }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(taskData, "fallback_reason")
          ? { fallback_reason: taskData.fallback_reason }
          : {}),
        project_id: taskData.project_id || window._currentProjectId || null,
        auto_download: !!taskData.auto_download,
      };
      await this.saveRecord(record);
    }
    _deriveFlowApiVersion(record) {
      if (String(record.provider || "flow") !== "flow") return null;
      const drivers = new Set(
        [
          ...(Array.isArray(record.flow_api_versions)
            ? record.flow_api_versions
            : []),
          record.api_driver,
          ...Object.values(record.result_provider_urls || {}).map(
            (value) => value?.api_driver,
          ),
          ...Object.values(record.result_thumbnails || {}).map(
            (value) => value?.api_driver,
          ),
        ].filter((value) => value === "v1" || value === "v2"),
      );
      return drivers.size === 2 ? "mixed" : [...drivers][0] || null;
    }
    _deriveGenMode(record) {
      if (record.gen_mode === "api" || record.gen_mode === "web")
        return record.gen_mode;
      if (Object.prototype.hasOwnProperty.call(record, "gen_mode")) return null;
      const provider = String(record.provider || "flow");
      if (provider !== "flow") return null;
      if (this._deriveFlowApiVersion(record)) return "api";
      if (
        String(record.result_file_ids || "").trim() ||
        (Array.isArray(record.result_thumbnails) &&
          record.result_thumbnails.length > 0)
      )
        return "web";
      return null;
    }
    _canonicalModel(record) {
      const provider = String(record.provider || "flow").toLowerCase();
      const raw = String(record.model || "").trim();
      if (provider !== "flow") return raw;
      if (raw.toLocaleLowerCase() === "flow") return "";
      const models = [
        ...(window.ModelRegistry?.safeGetModelsSync?.("flow", "image") || []),
        ...(window.ModelRegistry?.safeGetModelsSync?.("flow", "video") || []),
      ];
      const normalizedRaw = raw.toLocaleLowerCase();
      const matched = raw
        ? models.find((model) => {
            const names = [
              model?.value,
              model?.name,
              ...(model?.config?.dom_aliases || []),
            ];
            return names.some(
              (name) =>
                typeof name === "string" &&
                name.trim().toLocaleLowerCase() === normalizedRaw,
            );
          })
        : null;
      if (matched?.value || matched?.name) return matched.value || matched.name;
      if (raw) {
        const catalogProviders = ["chatgpt", "grok", "gemini", "muse"].filter(
          (slug) => window.ModelRegistry?.findModel?.(slug, raw),
        );
        if (catalogProviders.length > 0) {
          console.warn(
            "[GenerationHistory] Flow model/provider conflict",
            JSON.stringify({
              model: raw.slice(0, 100),
              catalogProviders,
              source: String(record.source || "").slice(0, 50),
              sourceId: String(record.source_id || "").slice(0, 100),
            }),
          );
        }
        return raw;
      }
      return "";
    }
    _diagnosticsForPublication(diagnostics) {
      const summary = diagnostics?.summary;
      if (!summary || !Object.prototype.hasOwnProperty.call(summary, "blocked"))
        return diagnostics;
      const { blocked, ...legacySummary } = summary;
      if (
        !Number.isInteger(blocked) ||
        blocked < 0 ||
        !Number.isInteger(legacySummary.unfinished) ||
        legacySummary.unfinished < 0
      )
        return diagnostics;
      legacySummary.unfinished += blocked;
      return { ...diagnostics, summary: legacySummary };
    }
    async saveRecord(record) {
      if (!record.prompt && !record.result_file_ids) return;
      if (!window.authManager?.isLoggedIn()) {
        await this._saveLocal(record);
        return;
      }
      const historyRoute =
        record.historyRoute && typeof record.historyRoute === "object"
          ? record.historyRoute
          : {};
      const routedRecord = { ...record };
      if (
        !Object.prototype.hasOwnProperty.call(routedRecord, "gen_mode") &&
        Object.prototype.hasOwnProperty.call(historyRoute, "genMode")
      ) {
        routedRecord.gen_mode = ["api", "web"].includes(historyRoute.genMode)
          ? historyRoute.genMode
          : null;
      }
      if (
        !Object.prototype.hasOwnProperty.call(
          routedRecord,
          "initial_gen_mode",
        ) &&
        Object.prototype.hasOwnProperty.call(historyRoute, "initialGenMode")
      ) {
        routedRecord.initial_gen_mode = ["api", "web"].includes(
          historyRoute.initialGenMode,
        )
          ? historyRoute.initialGenMode
          : null;
      }
      if (
        !Object.prototype.hasOwnProperty.call(
          routedRecord,
          "fallback_reason",
        ) &&
        typeof historyRoute.fallbackReason === "string"
      ) {
        routedRecord.fallback_reason = historyRoute.fallbackReason;
      }
      const derivedGenMode = this._deriveGenMode(routedRecord);
      const payload = {
        prompt: record.prompt || "",
        media_type: record.media_type || "image",
        model: this._canonicalModel(record),
        ratio: record.ratio || "",
        prompt_count:
          record.prompt_count && record.prompt_count >= 1
            ? record.prompt_count
            : null,
        quantity:
          record.quantity && record.quantity >= 1 ? record.quantity : null,
        ref_file_ids: record.ref_file_ids || "",
        ref_thumbnails: record.ref_thumbnails || {},
        ref_flow_file_ids: Array.isArray(record.ref_flow_file_ids)
          ? record.ref_flow_file_ids
          : [],
        result_file_ids: record.result_file_ids || "",
        result_flow_file_ids: Array.isArray(record.result_flow_file_ids)
          ? record.result_flow_file_ids
          : [],
        result_thumbnails: record.result_thumbnails || [],
        result_file_names: record.result_file_names || {},
        source: record.source || "manual",
        submit_mode: record.submit_mode === "manual" ? "manual" : "auto",
        source_id: record.source_id || "",
        status: record.status || "success",
        error_reason: record.error_reason
          ? String(record.error_reason).slice(0, 1e3)
          : null,
        duration_ms: Number.isFinite(record.duration_ms)
          ? Math.max(0, Math.round(record.duration_ms))
          : null,
        stop_origin: record.stop_origin === "user" ? "user" : null,
        error_details: record.error_details || [],
        diagnostics: this._diagnosticsForPublication(
          record.diagnostics || historyRoute.diagnostics || null,
        ),
        provider: record.provider || "flow",
        gen_mode: derivedGenMode,
        flow_api_version:
          derivedGenMode === "api"
            ? this._deriveFlowApiVersion(routedRecord)
            : null,
        initial_gen_mode: ["api", "web"].includes(routedRecord.initial_gen_mode)
          ? routedRecord.initial_gen_mode
          : null,
        fallback_reason:
          typeof routedRecord.fallback_reason === "string"
            ? routedRecord.fallback_reason.slice(0, 80)
            : null,
        bridge_version: /^\d+\.\d+\.\d+(?:\.\d+)?$/.test(
          window.BridgeClient?._pingCache?.version || "",
        )
          ? window.BridgeClient._pingCache.version
          : null,
        project_id: record.project_id || window._currentProjectId || null,
        auto_download: !!record.auto_download,
      };
      if (payload.diagnostics === null) delete payload.diagnostics;
      this._buffer.push(payload);
      console.log(
        "[TobyFlow] History record buffered, queue size:",
        this._buffer.length,
      );
      if (!this._flushTimer) {
        this._flushTimer = setTimeout(() => {
          this._flushTimer = null;
          this._flushBuffer();
        }, BATCH_FLUSH_INTERVAL);
      }
      if (this._buffer.length >= BATCH_MAX_SIZE) {
        clearTimeout(this._flushTimer);
        this._flushTimer = null;
        this._flushBuffer();
      }
    }
    async _flushBuffer() {
      if (this._flushFlight) {
        await this._flushFlight;
        if (this._buffer.length) await this._flushBuffer();
        return;
      }
      if (!this._buffer.length) return;
      const flight = this._flushBufferOnce();
      this._flushFlight = flight;
      try {
        await flight;
      } finally {
        if (this._flushFlight === flight) this._flushFlight = null;
        this._flushing = false;
      }
      if (this._buffer.length) await this._flushBuffer();
    }
    async _flushBufferOnce() {
      if (this._flushing || this._buffer.length === 0) return;
      this._flushing = true;
      const toFlush = [...this._buffer];
      this._buffer = [];
      console.log("[TobyFlow] Flushing", toFlush.length, "history records");
      for (let i = 0; i < toFlush.length; i++) {
        const payload = toFlush[i];
        try {
          const result = await window.authManager._apiCall(
            "POST",
            "history",
            payload,
          );
          console.log(
            "[GenerationHistory/Published]",
            JSON.stringify({
              historyId: result?.id || null,
              source: payload.source,
              provider: payload.provider,
              extensionVersion:
                typeof chrome !== "undefined"
                  ? chrome.runtime?.getManifest?.()?.version || null
                  : null,
            }),
          );
        } catch (e) {
          console.warn(
            "[TobyFlow] History flush failed, saving to local:",
            e.message,
          );
          console.warn(
            "[GenerationHistory/PublicationFailed]",
            JSON.stringify({
              extensionVersion:
                typeof chrome !== "undefined"
                  ? chrome.runtime?.getManifest?.()?.version || null
                  : null,
              httpStatus: e.httpStatus ?? null,
              code: e.code || null,
              exception: e.exception || null,
              validationFields:
                e.details && typeof e.details === "object"
                  ? Object.keys(e.details).slice(0, 20)
                  : [],
              source: payload.source,
              provider: payload.provider,
              genMode: payload.gen_mode,
              fallback: "local_storage",
            }),
          );
          await this._saveLocal(payload);
        }
        if (i < toFlush.length - 1) {
          await new Promise((r) => setTimeout(r, BATCH_REQUEST_DELAY));
        }
      }
      this._flushing = false;
      console.log("[TobyFlow] History flush completed");
    }
    _flushSync() {
      if (this._buffer.length === 0) return;
      const toFlush = [...this._buffer];
      this._buffer = [];
      const baseUrl = window.ApiBaseConfig.get();
      const token = window.authManager?.token;
      if (!token) {
        toFlush.forEach((payload) => {
          try {
            const result = JSON.parse(
              localStorage.getItem("af_history_pending") || "[]",
            );
            result.push(payload);
            localStorage.setItem(
              "af_history_pending",
              JSON.stringify(result.slice(-50)),
            );
          } catch (_) {}
        });
        return;
      }
      toFlush.forEach((payload) => {
        try {
          const blob = new Blob([JSON.stringify(payload)], {
            type: "application/json",
          });
          navigator.sendBeacon(
            `${baseUrl}/history?_token=${encodeURIComponent(token)}`,
            blob,
          );
        } catch (_) {}
      });
    }
    async getHistory(page = 1, perPage = 20, isFavorite = null) {
      if (!window.authManager?.isLoggedIn()) {
        return this._getLocal(page, perPage, isFavorite);
      }
      try {
        let endpoint = `history?page=${page}&per_page=${perPage}`;
        if (isFavorite !== null) {
          endpoint += `&is_favorite=${isFavorite ? 1 : 0}`;
        }
        const response = await window.authManager._apiCall("GET", endpoint);
        return {
          data: response.data || [],
          meta: response.meta || {
            current_page: page,
            total: 0,
            per_page: perPage,
          },
        };
      } catch (e) {
        console.warn(
          "[TobyFlow] T\u1EA3i l\u1ECBch s\u1EED th\u1EA5t b\u1EA1i:",
          e.message,
        );
        return this._getLocal(page, perPage, isFavorite);
      }
    }
    async toggleFavorite(id) {
      if (String(id).startsWith("local_")) {
        return this._toggleLocalFavorite(id);
      }
      if (!window.authManager?.isLoggedIn()) {
        return this._toggleLocalFavorite(id);
      }
      try {
        const response = await window.authManager._apiCall(
          "PATCH",
          `history/${id}/favorite`,
        );
        return response;
      } catch (e) {
        console.warn(
          "[TobyFlow] Toggle favorite th\u1EA5t b\u1EA1i:",
          e.message,
        );
        return null;
      }
    }
    async deleteRecord(id) {
      if (String(id).startsWith("local_")) {
        return this._deleteLocal(id);
      }
      if (!window.authManager?.isLoggedIn()) {
        return this._deleteLocal(id);
      }
      try {
        await window.authManager._apiCall("DELETE", `history/${id}`);
        return true;
      } catch (e) {
        console.warn(
          "[TobyFlow] X\xF3a l\u1ECBch s\u1EED th\u1EA5t b\u1EA1i:",
          e.message,
        );
        return false;
      }
    }
    async _saveLocal(record) {
      try {
        const result = await new Promise((r) =>
          chrome.storage.local.get(["af_history"], r),
        );
        const history = result.af_history || [];
        record.id = `local_${Date.now()}`;
        record.created_at = new Date().toISOString();
        record.is_favorite = false;
        if (!record.project_id)
          record.project_id = window._currentProjectId || null;
        history.unshift(record);
        if (history.length > MAX_LOCAL_RECORDS)
          history.length = MAX_LOCAL_RECORDS;
        await new Promise((r) =>
          chrome.storage.local.set({ af_history: history }, r),
        );
      } catch (e) {
        console.error(
          "[TobyFlow] L\u01B0u local th\u1EA5t b\u1EA1i:",
          e.message,
        );
      }
    }
    async _getLocal(page, perPage, isFavorite = null) {
      try {
        const result = await new Promise((r) =>
          chrome.storage.local.get(["af_history"], r),
        );
        let history = result.af_history || [];
        if (isFavorite !== null) {
          history = history.filter((h) => !!h.is_favorite === isFavorite);
        }
        const start = (page - 1) * perPage;
        return {
          data: history.slice(start, start + perPage),
          meta: {
            current_page: page,
            total: history.length,
            per_page: perPage,
            last_page: Math.ceil(history.length / perPage) || 1,
          },
        };
      } catch (e) {
        console.error(
          "[TobyFlow] \u0110\u1ECDc local th\u1EA5t b\u1EA1i:",
          e.message,
        );
        return {
          data: [],
          meta: { current_page: 1, total: 0, per_page: perPage, last_page: 1 },
        };
      }
    }
    async _toggleLocalFavorite(id) {
      try {
        const result = await new Promise((r) =>
          chrome.storage.local.get(["af_history"], r),
        );
        const history = result.af_history || [];
        const record = history.find((h) => h.id === id);
        if (record) {
          record.is_favorite = !record.is_favorite;
          await new Promise((r) =>
            chrome.storage.local.set({ af_history: history }, r),
          );
          return { is_favorite: record.is_favorite };
        }
        return null;
      } catch (e) {
        console.error(
          "[TobyFlow] Toggle local favorite th\u1EA5t b\u1EA1i:",
          e.message,
        );
        return null;
      }
    }
    async _deleteLocal(id) {
      try {
        const result = await new Promise((r) =>
          chrome.storage.local.get(["af_history"], r),
        );
        let history = result.af_history || [];
        history = history.filter((h) => h.id !== id);
        await new Promise((r) =>
          chrome.storage.local.set({ af_history: history }, r),
        );
        return true;
      } catch (e) {
        console.error("[TobyFlow] X\xF3a local th\u1EA5t b\u1EA1i:", e.message);
        return false;
      }
    }
  }
  window.generationHistory = new GenerationHistory();
  window.GenerationHistory = GenerationHistory;
})();
