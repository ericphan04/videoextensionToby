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
(function () {
  "use strict";
  class FlowApiV2Driver {
    static hasActiveMutation() {
      return this._activeMutations > 0;
    }
    static _setMutationActive(active) {
      this._activeMutations = Math.max(
        0,
        this._activeMutations + (active ? 1 : -1),
      );
      try {
        window.eventBus?.emit?.("flow_api:mutation_activity", {
          active: this._activeMutations > 0,
          count: this._activeMutations,
        });
      } catch (_) {}
    }
    static _flowTabPin(item) {
      const flowTabId = Number(item?.flowApiTabId);
      return Number.isInteger(flowTabId) && flowTabId >= 0 ? { flowTabId } : {};
    }
    static async uploadReference({
      base64,
      fileName,
      mimeType,
      projectId,
      surface = "gen",
      abortFn,
      domUpload,
    }) {
      const stopped = () => abortFn?.() === true;
      const supportedVideoTypes = [
        "video/mp4",
        "video/webm",
        "video/quicktime",
      ];
      const mediaType = supportedVideoTypes.includes(mimeType)
        ? "video"
        : "image";
      const isSupportedImage = [
        "image/jpeg",
        "image/png",
        "image/webp",
      ].includes(mimeType);
      const isSupportedVideo = supportedVideoTypes.includes(mimeType);
      if (!isSupportedImage && !isSupportedVideo) return domUpload();
      if (stopped()) throw new Error("UPLOAD_STOPPED");
      const settings = window.storageSettings?.getSettings?.() || {};
      const apiEnabled =
        [true, "true", 1].includes(settings.apiModeEnabled) &&
        window.featureGate?.canUse?.("flow_api_enabled") === true;
      const runtimeAllowsApi = async () => {
        try {
          await window.SystemConfig?.fetch?.();
        } catch (_) {}
        return ["v1", "v2", "v2_canary", "auto"].includes(
          window.SystemConfig?.get?.("flow_api_driver", null),
        );
      };
      const runtimeApiEnabled = apiEnabled && (await runtimeAllowsApi());
      let response = null;
      let driver = null;
      let previewConfig = null;
      let uploadProjectId = projectId || null;
      let routeReason = !apiEnabled
        ? "api_toggle_off"
        : runtimeApiEnabled
          ? "api_not_ready"
          : "system_driver_disabled";
      if (runtimeApiEnabled) {
        try {
          let health = await window.FlowApiSessionCoordinator?.check?.({
            surface,
            mediaType,
            projectId,
            force: false,
            passive: true,
          });
          if (
            [
              "fresh_page_session_required",
              "session_refresh_timeout",
              "captcha_not_ready",
              "page_reloading",
              "content_script_recovering",
            ].includes(health?.reason)
          ) {
            const deadline = Date.now() + 2e4;
            while (health?.ready !== true && Date.now() < deadline) {
              if (stopped()) throw new Error("UPLOAD_STOPPED");
              await new Promise((resolve) =>
                setTimeout(resolve, Math.min(2e3, deadline - Date.now())),
              );
              if (stopped()) throw new Error("UPLOAD_STOPPED");
              health = await window.FlowApiSessionCoordinator?.check?.({
                surface,
                mediaType,
                projectId,
                force: false,
                passive: true,
              });
              if (
                ![
                  "fresh_page_session_required",
                  "session_refresh_timeout",
                  "captcha_not_ready",
                  "page_reloading",
                  "content_script_recovering",
                ].includes(health?.reason)
              )
                break;
            }
          }
          routeReason =
            health?.reason ||
            (health?.ready === true
              ? "upload_capability_missing"
              : "health_unavailable");
          if (health?.reason === "project_mismatch") {
            const error = new Error("UPLOAD_PROJECT_MISMATCH");
            error.noReplay = true;
            throw error;
          }
          if (stopped()) throw new Error("UPLOAD_STOPPED");
          if (health?.ready === true) {
            driver = health.driver;
            const targetProject =
              projectId ||
              health.projectId ||
              (await window.FlowApiAdapter?._resolveProjectId?.({}));
            if (!this._uuid(targetProject))
              throw new Error("UPLOAD_PROJECT_REQUIRED");
            uploadProjectId = targetProject;
            const v2UploadEnabled = () =>
              window.SystemConfig?.getBool?.("flow_api_v2_upload_enabled") ===
              true;
            if (driver === "v2" && !v2UploadEnabled())
              routeReason = "v2_upload_disabled_by_server";
            const uploadCapability = isSupportedVideo
              ? "flow_v2_upload_video"
              : "flow_v2_upload_ref";
            if (
              driver === "v2" &&
              v2UploadEnabled() &&
              (await window.BridgeClient?.hasCapability?.(uploadCapability))
            ) {
              const config =
                await window.ProviderConfigManager?.fetchFlowApiV2Configs?.();
              if (
                isSupportedVideo
                  ? !config?.protocol?.transport?.video_upload
                  : !config?.protocol?.rpc?.upload_ref
              )
                throw new Error("V2_UPLOAD_CONFIG_MISSING");
              previewConfig = config;
              if (stopped()) throw new Error("UPLOAD_STOPPED");
              if (!v2UploadEnabled() || !(await runtimeAllowsApi())) {
                console.log(
                  "[FlowUploadRoute] API upload disabled by server before dispatch",
                );
                return domUpload();
              }
              this._setMutationActive(true);
              try {
                try {
                  response = await window.BridgeClient.request(
                    isSupportedVideo
                      ? "flow_v2_upload_video"
                      : "flow_v2_upload_ref",
                    {
                      projectId: targetProject,
                      base64,
                      fileName,
                      mimeType,
                      protocol: config.protocol,
                      models: config.models,
                      schema: config.schema,
                      stateMapping: config.state_mapping,
                      runtime: config.runtime,
                      protocolRevision: Number(config.protocol.schema_version),
                      protocolFingerprint:
                        window.FlowApiV2CheckpointStore?.fingerprint?.(config),
                    },
                    { abortFn },
                  );
                } catch (cause) {
                  const error = new Error("UPLOAD_ACCEPTANCE_UNKNOWN");
                  error.code = "UPLOAD_ACCEPTANCE_UNKNOWN";
                  error.noReplay = true;
                  throw error;
                }
              } finally {
                this._setMutationActive(false);
              }
              if (response?.error === "project_mismatch") {
                const error = new Error("UPLOAD_PROJECT_MISMATCH");
                error.noReplay = true;
                throw error;
              }
              if (response?.stage === "receipt" && response?.ok !== true) {
                const code =
                  typeof response.error === "string" &&
                  /^[A-Z][A-Z0-9_]{1,100}$/.test(response.error)
                    ? response.error
                    : "UPLOAD_REJECTED";
                const error = new Error(code);
                error.code = code;
                error.noReplay = true;
                throw error;
              }
              if (
                response?.ambiguous ||
                (response?.dispatchStarted === true && response?.ok !== true)
              ) {
                const error = new Error("UPLOAD_ACCEPTANCE_UNKNOWN");
                error.code = "UPLOAD_ACCEPTANCE_UNKNOWN";
                error.noReplay = true;
                throw error;
              }
            } else if (
              driver === "v1" &&
              isSupportedImage &&
              window.FlowApiAdapter?.uploadRef
            ) {
              if (!(await runtimeAllowsApi())) {
                console.log(
                  "[FlowUploadRoute] API upload disabled by server before V1 dispatch",
                );
                return domUpload();
              }
              try {
                const mediaId = await window.FlowApiAdapter.uploadRef(
                  targetProject,
                  { base64, fileName, mimeType },
                );
                if (!mediaId) throw new Error("UPLOAD_RESPONSE_EMPTY");
                response = { ok: true, mediaId };
              } catch (cause) {
                const error = new Error("UPLOAD_ACCEPTANCE_UNKNOWN");
                error.code = "UPLOAD_ACCEPTANCE_UNKNOWN";
                error.noReplay = true;
                throw error;
              }
            }
          }
        } catch (error) {
          if (error.noReplay || stopped()) throw error;
          console.info(
            "[FlowUploadRoute] API unavailable; retaining DOM fallback:",
            error.message,
          );
        }
      }
      if (stopped()) throw new Error("UPLOAD_STOPPED");
      if (response?.ok === true && this._referenceId(response.mediaId)) {
        if (driver === "v2")
          console.info(
            "[FlowUploadApiReceipt]",
            JSON.stringify({
              surface,
              driver,
              stage: response.stage || null,
              mediaIdentity: window.MediaRegistry?.describeIdentity?.(
                response.mediaId,
              ) || { kind: "redacted" },
              projectBound: !!uploadProjectId,
              responseKeys: Object.keys(response).sort(),
              hasUrlField: !!(
                response.url ||
                response.thumbnailUrl ||
                response.thumbnail_url
              ),
            }),
          );
        console.log(
          "[FlowUploadRoute]",
          JSON.stringify({
            route: "api",
            driver,
            mediaKind: this._uuid(response.mediaId) ? "uuid" : "asb",
          }),
        );
        let thumbnailUrl = "";
        let videoUrl = "";
        if (driver === "v2" && this._uuid(response.mediaId)) {
          let previewTimedOut = false;
          let previewTimer;
          const previewStartedAt = Date.now();
          try {
            const config = previewConfig;
            if (config?.protocol?.schema_version && uploadProjectId) {
              const previewTimeoutMs =
                mediaType === "video"
                  ? this._runtimeInteger(config, "mutation_timeout_ms")
                  : 5e3;
              console.info(
                "[FlowUploadApiPreviewResolve]",
                JSON.stringify({
                  state: "request",
                  surface,
                  mediaType,
                  mediaIdentity: window.MediaRegistry?.describeIdentity?.(
                    response.mediaId,
                  ) || {
                    kind: "uuid",
                    length: String(response.mediaId).length,
                  },
                  projectBound: true,
                  timeoutMs: previewTimeoutMs,
                }),
              );
              const lookup = this.resolveMedia({
                mediaId: response.mediaId,
                projectId: uploadProjectId,
                mediaType,
                uuidLookup: true,
                protocolRevision: Number(config.protocol.schema_version),
                protocolFingerprint:
                  window.FlowApiV2CheckpointStore?.fingerprint?.(config),
                waitForMaterialization: mediaType === "video",
                abortFn: () =>
                  stopped() || (mediaType !== "video" && previewTimedOut),
              });
              const resolved =
                mediaType === "video"
                  ? await lookup
                  : await Promise.race([
                      lookup,
                      new Promise((resolve) => {
                        previewTimer = setTimeout(() => {
                          previewTimedOut = true;
                          resolve(null);
                        }, previewTimeoutMs);
                      }),
                    ]);
              if (mediaType === "video") {
                videoUrl = resolved?.url || "";
                thumbnailUrl = resolved?.posterUrl || "";
              } else {
                thumbnailUrl = resolved?.url || "";
              }
              console.info(
                "[FlowUploadApiPreviewResolve]",
                JSON.stringify({
                  state: previewTimedOut ? "timeout" : "response",
                  surface,
                  mediaType,
                  elapsedMs: Date.now() - previewStartedAt,
                  resolved: !!(thumbnailUrl || videoUrl),
                  hasPoster: !!thumbnailUrl,
                  hasPlayback: !!videoUrl,
                }),
              );
            } else {
              console.info(
                "[FlowUploadApiPreviewResolve]",
                JSON.stringify({
                  state: "skipped",
                  surface,
                  mediaType,
                  reason: !uploadProjectId
                    ? "project_unbound"
                    : "config_unavailable",
                }),
              );
            }
          } catch (error) {
            console.info(
              "[FlowUploadRoute] Preview resolve unavailable:",
              error?.message,
            );
            console.info(
              "[FlowUploadApiPreviewResolve]",
              JSON.stringify({
                state: "error",
                surface,
                mediaType,
                elapsedMs: Date.now() - previewStartedAt,
                reason:
                  error?.code || error?.message || "PREVIEW_RESOLVE_FAILED",
              }),
            );
            if (mediaType === "video") {
              const code = String(
                error?.code ||
                  error?.message ||
                  "V2_UPLOAD_VIDEO_RESULT_UNVERIFIED",
              );
              const failure = error instanceof Error ? error : new Error(code);
              failure.code = code;
              failure.noReplay = true;
              failure.dispatchStarted = true;
              failure.stage = failure.stage || "accepted_poll";
              console.warn(
                "[FlowUploadApiVerification]",
                JSON.stringify({
                  surface,
                  mediaType,
                  state: "failed",
                  reason: code,
                  elapsedMs: Date.now() - previewStartedAt,
                  replayAllowed: false,
                }),
              );
              throw failure;
            }
          } finally {
            if (previewTimer) clearTimeout(previewTimer);
          }
        }
        if (driver === "v2")
          console.info(
            "[FlowUploadApiPreview]",
            JSON.stringify({
              surface,
              mediaKind: this._uuid(response.mediaId) ? "uuid" : "asb",
              resolved: !!(thumbnailUrl || videoUrl),
              source:
                thumbnailUrl || videoUrl ? "resolve_media" : "local_cache",
            }),
          );
        const protocolRevision =
          driver === "v2"
            ? Number(previewConfig?.protocol?.schema_version || 0)
            : 0;
        const protocolFingerprint =
          driver === "v2" && previewConfig
            ? window.FlowApiV2CheckpointStore?.fingerprint?.(previewConfig) ||
              null
            : null;
        const uuidIdentity = this._uuid(response.mediaId);
        return {
          ok: true,
          file_id: response.mediaId,
          file_name: response.mediaId,
          ...(uuidIdentity && { media_uuid: response.mediaId }),
          persistent_media_id: response.mediaId,
          identity_kind: uuidIdentity ? "flow-api-uuid" : "flow-v2-asb",
          identity_durability: uuidIdentity ? "durable-resolver" : "durable",
          identity_aliases: [response.mediaId],
          thumbnailUrl,
          thumbnail: thumbnailUrl,
          ...(videoUrl && { video_url: videoUrl }),
          ...(protocolRevision > 0 && { protocol_revision: protocolRevision }),
          ...(protocolFingerprint && {
            protocol_fingerprint: protocolFingerprint,
          }),
          api_driver: driver,
          project_id: uploadProjectId,
          media_type: mediaType,
        };
      }
      if (response?.ok === true)
        throw new Error("UPLOAD_RESPONSE_IDENTITY_INVALID");
      console.log(
        "[FlowUploadRoute]",
        JSON.stringify({
          route: "dom",
          apiEnabled,
          driver,
          reason: response?.error || routeReason,
        }),
      );
      return domUpload();
    }
    static _runtimeInteger(config, key, min = 1) {
      const value = Number(config?.runtime?.[key]);
      if (!Number.isInteger(value) || value < min)
        throw new Error(`V2_RUNTIME_CONFIG_INVALID:${key}`);
      return value;
    }
    static _uuid(value) {
      return (
        typeof value === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          value,
        )
      );
    }
    static _referenceId(value) {
      return (
        this._uuid(value) ||
        (typeof value === "string" &&
          value.length <= 2048 &&
          /^AB-[A-Za-z0-9_-]{37,}={0,2}$/.test(value))
      );
    }
    static requiredCapabilities(mediaType) {
      const submit =
        mediaType === "video" ? "flow_v2_submit_video" : "flow_v2_submit_image";
      return [
        "flow_v2_health",
        submit,
        "flow_v2_poll_operations",
        "flow_v2_resolve_media",
        "flow_v2_cancel_command",
      ];
    }
    static _modelConfig(models, modelValue) {
      if (
        !models ||
        typeof models !== "object" ||
        typeof modelValue !== "string" ||
        !modelValue
      )
        return null;
      if (models[modelValue] && typeof models[modelValue] === "object")
        return models[modelValue];
      const canonical =
        window.ModelRegistry?.getCanonicalValue?.("flow", modelValue) ||
        modelValue;
      const normalized = (value) =>
        String(value || "")
          .trim()
          .toLocaleLowerCase();
      return (
        Object.values(models).find(
          (entry) =>
            entry &&
            typeof entry === "object" &&
            Array.isArray(entry.ui_values) &&
            entry.ui_values.some(
              (alias) =>
                normalized(alias) === normalized(canonical) ||
                normalized(alias) === normalized(modelValue),
            ),
        ) || null
      );
    }
    static _capabilityModel(mapping, duration, resolution) {
      if (typeof mapping === "string" && mapping) return mapping;
      if (!mapping || typeof mapping !== "object") return null;
      const durationValue = mapping?.[duration] ?? mapping.default;
      if (typeof durationValue === "string" && durationValue)
        return durationValue;
      if (durationValue && typeof durationValue === "object") {
        const exact = durationValue?.[resolution] ?? durationValue?.default;
        if (typeof exact === "string" && exact) return exact;
      }
      return typeof mapping.default === "string" && mapping.default
        ? mapping.default
        : null;
    }
    static _referenceResolution(item) {
      const unique = new Map();
      const declared = [
        ...new Set(Array.isArray(item?.refFileIds) ? item.refFileIds : []),
      ];
      let unresolvedCount = 0;
      for (const id of declared) {
        const resolved =
          window.FlowApiAdapter?._resolveRefUuid?.(item, id) || id;
        if (!resolved) {
          unresolvedCount++;
          continue;
        }
        const value = String(resolved);
        const key = this._uuid(value) ? value.toLowerCase() : value;
        if (!this._referenceId(key)) {
          unresolvedCount++;
          continue;
        }
        if (!unique.has(key)) unique.set(key, key);
      }
      return {
        ids: [...unique.values()],
        declaredCount: declared.length,
        unresolvedCount,
        deduplicatedCount: Math.max(
          0,
          declared.length - unresolvedCount - unique.size,
        ),
      };
    }
    static async _filterGenReferences(item, config, options = {}) {
      if (item._owner !== "prompts" || !item.refFileIds?.length) return;
      if (options.abortFn?.()) throw new Error("ABORTED");
      const job = window.PromptQueue?._instance?.getJob?.(item.jobId);
      const cache = job
        ? job._genApiRefChecks || (job._genApiRefChecks = new Map())
        : new Map();
      const admitted = new Set(this._referenceIds(item, config));
      const resolvedId = (id) => {
        const value = window.FlowApiAdapter?._resolveRefUuid?.(item, id) || id;
        return this._uuid(value) ? String(value).toLowerCase() : value;
      };
      const declared = item.refFileIds.filter((id) =>
        admitted.has(resolvedId(id)),
      );
      if (!declared.length) return;
      const ids = [...new Set(declared.map(resolvedId))];
      const results = new Map();
      const fingerprint =
        window.FlowApiV2CheckpointStore?.fingerprint?.(config) || "";
      let cursor = 0;
      const safeCheckCode = (value) =>
        typeof value === "string" && /^[A-Za-z][A-Za-z0-9_]{1,119}$/.test(value)
          ? value
          : null;
      const logSkipped = (id, code) =>
        console.warn(
          "[GenApiRefValidation] check skipped",
          JSON.stringify({
            projectId: item.projectId,
            mediaId: id,
            code: safeCheckCode(code),
          }),
        );
      let concurrency;
      try {
        concurrency = this._runtimeInteger(config, "max_concurrent");
      } catch (_) {
        logSkipped(null, "V2_RUNTIME_CONFIG_INVALID");
        return;
      }
      const check = async (id) => {
        if (options.abortFn?.()) throw new Error("ABORTED");
        if (!this._uuid(id))
          return this._referenceId(id) ? { id, status: "native" } : null;
        const key = `${item.projectId}:${item.flowApiTabId ?? ""}:${fingerprint}:${id}`;
        if (!cache.has(key))
          cache.set(
            key,
            (async () => {
              try {
                const response = await window.BridgeClient.request(
                  "flow_v2_resolve_media",
                  {
                    protocol: config.protocol,
                    models: config.models,
                    schema: config.schema,
                    stateMapping: config.state_mapping,
                    runtime: config.runtime,
                    mediaId: id,
                    projectId: item.projectId,
                    protocolRevision: Number(
                      config.protocol?.schema_version || 0,
                    ),
                    protocolFingerprint: fingerprint || null,
                    ...this._flowTabPin(item),
                  },
                  { abortFn: options.abortFn },
                );
                if (options.abortFn?.()) throw new Error("ABORTED");
                const output = response?.output;
                if (
                  response?.ok === true &&
                  output?.mediaId === id &&
                  output?.projectId === item.projectId
                ) {
                  return { id, status: "valid" };
                }
                if (
                  response?.ok !== true &&
                  response?.error === "LINEAGE_MISMATCH" &&
                  response?.diagnostic?.lineageCheck === "resolved projectId"
                ) {
                  return {
                    id,
                    status: "other_project",
                    checkCode: "LINEAGE_MISMATCH",
                    lineageCheck:
                      window.FlowApiDriverError?.safeLineageCheck?.(response) ||
                      null,
                  };
                }
                logSkipped(
                  id,
                  response?.ok === true
                    ? "V2_RESOLVE_IDENTITY_MISMATCH"
                    : response?.error,
                );
                return null;
              } catch (error) {
                if (options.abortFn?.() || error?.message === "ABORTED")
                  throw error;
                logSkipped(id, error?.code || error?.message);
                return null;
              }
            })(),
          );
        const pending = cache.get(key);
        try {
          const result = await pending;
          if (!result && cache.get(key) === pending) cache.delete(key);
          return result;
        } catch (error) {
          if (cache.get(key) === pending) cache.delete(key);
          if (options.abortFn?.()) throw new Error("ABORTED");
          if (error?.message === "ABORTED") return check(id);
          throw error;
        }
      };
      const worker = async () => {
        while (cursor < ids.length) {
          const id = ids[cursor++];
          results.set(id, await check(id));
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(ids.length, concurrency) }, worker),
      );
      if (options.abortFn?.()) throw new Error("ABORTED");
      const entries = declared.map((id) => ({
        fileId: id,
        ...results.get(resolvedId(id)),
        name:
          window.GenTab?.refImageNames?.[id] || item.refFileNames?.[id] || id,
      }));
      const rejected = entries.filter(
        (entry) => entry.status === "other_project",
      );
      if (rejected.length)
        console.warn(
          "[GenApiRefValidation]",
          JSON.stringify({
            projectId: item.projectId,
            flowTabId: item.flowApiTabId ?? null,
            promptIndex: item.promptIndex,
            checks: entries
              .slice(0, 32)
              .map((entry) => ({
                mediaId: entry.id,
                status: entry.status,
                code: entry.checkCode || null,
                lineageCheck: entry.lineageCheck || null,
              })),
          }),
        );
      window.eventBus?.emit?.("gen:api_ref_validation", {
        projectId: item.projectId,
        entries,
      });
      if (!rejected.length) return;
      if (
        ["mention", "sequential"].includes(item.refImageMode) ||
        item.settings?.isFrames === true ||
        rejected.length === declared.length
      ) {
        item.noRetry = true;
        const errorKey = "gen.apiRefPromptSkipped";
        const text = window.I18n?.t?.(errorKey, {
          names: rejected.map((entry) => entry.name).join(", "),
        });
        const error = new Error(
          text && text !== errorKey ? text : "GEN_API_REFERENCE_UNVERIFIED",
        );
        Object.assign(error, {
          code: "GEN_API_REFERENCE_UNVERIFIED",
          retryable: false,
          dispatchStarted: false,
          stage: "pre_dispatch",
          diagnostic: {
            refChecks: rejected
              .slice(0, 32)
              .map((entry) => ({
                status: entry.status,
                code: entry.checkCode || null,
                lineageCheck: entry.lineageCheck || null,
              })),
          },
        });
        throw error;
      }
    }
    static _referenceIds(item, config = null) {
      const ids = this._referenceResolution(item).ids;
      const adapter = window.ProviderRegistry?.get?.("flow");
      const modelValue = item?.settings?.model;
      const isVideo = /video/i.test(item?.settings?.genType || "");
      const modelCap = adapter?.getMaxRefImages?.({
        mode: isVideo ? "video" : "image",
        isFrames: item?.settings?.isFrames === true,
        modelValue,
      });
      const totalCap = adapter?.getMaxRefImagesTotal?.(modelValue);
      const advertisedCap =
        window.BridgeClient?._pingCache?.flowV2MaxReferences;
      const transportCap =
        Number.isInteger(advertisedCap) && advertisedCap > 0
          ? Math.min(advertisedCap, 32)
          : 8;
      const caps = [
        transportCap,
        totalCap,
        ...(item?.settings?.isFrames === true ? [2] : []),
      ].filter((value) => Number.isInteger(value) && value >= 0);
      const videoRefs = new Set(
        (
          window.FlowApiAdapter?._declaredRefVideoIds?.(item) ||
          item?.settings?.refVideoIds ||
          []
        )
          .map((id) => window.FlowApiAdapter?._resolveRefUuid?.(item, id) || id)
          .map((id) => (this._uuid(id) ? String(id).toLowerCase() : id)),
      );
      if (videoRefs.size && config) {
        const mapping = this._modelConfig(config.models?.video, modelValue);
        const variant =
          mapping?.video_edit_variants?.[item.settings?.flowVideoResolution] ||
          mapping?.video_edit_variants?.default;
        if (
          Number.isInteger(variant?.max_ref_images) &&
          variant.max_ref_images >= 0
        ) {
          caps.push(1 + variant.max_ref_images);
        }
      }
      const limit = Math.min(...caps);
      const images = ids.filter((id) => !videoRefs.has(id));
      const cappedImages =
        Number.isInteger(modelCap) && modelCap >= 0
          ? images.slice(0, modelCap)
          : images;
      if (videoRefs.size) {
        const videoCap = adapter?.getMaxRefVideos?.(modelValue);
        const allowedVideos =
          Number.isInteger(videoCap) && videoCap >= 0
            ? Math.min(videoCap, 1)
            : 1;
        const selectedVideos = ids
          .filter((id) => videoRefs.has(id))
          .slice(0, allowedVideos);
        const selected = new Set([...selectedVideos, ...cappedImages]);
        const ordered = ids.filter((id) => selected.has(id));
        return ordered.length > limit
          ? [...selectedVideos, ...cappedImages].slice(0, limit)
          : ordered;
      }
      return cappedImages.slice(0, limit);
    }
    static async checkInputSupported({ item, mediaType } = {}) {
      if (
        window.featureGate?.canUse &&
        window.featureGate.canUse("flow_api_enabled") !== true
      ) {
        return { ready: false, reason: "V2_ENTITLEMENT_MISSING" };
      }
      if (!item) return { ready: true };
      if (
        item.settings?.voice?.search_value ||
        item.settings?.character?.search_value ||
        window.MentionParser?.hasComponents?.(item.prompt || "")
      ) {
        return { ready: false, reason: "V2_COMPONENT_INPUT_UNSUPPORTED" };
      }
      const quantity = Math.max(1, Number(item.settings?.quantity) || 1);
      if (!Number.isInteger(quantity) || quantity > 32)
        return { ready: false, reason: "V2_QUANTITY_INVALID" };
      const config =
        await window.ProviderConfigManager?.fetchFlowApiV2Configs?.();
      if (!config) return { ready: false, reason: "V2_PRIVATE_CONFIG_MISSING" };
      const model = item.settings?.model;
      if (typeof model !== "string" || !model)
        return { ready: false, reason: "V2_MODEL_MISSING" };
      const promptModelConfig = this._modelConfig(
        config.models?.[mediaType],
        model,
      );
      const modelPromptLimit = promptModelConfig?.max_prompt_chars;
      const declaredVideoRefs =
        window.FlowApiAdapter?._declaredRefVideoIds?.(item) ||
        (item.settings?.refVideoIds || []).filter((id) =>
          (item.refFileIds || []).includes(id),
        );
      if (promptModelConfig?.ingredients_layout != null) {
        if (promptModelConfig.ingredients_layout !== "canonical_v1") {
          return {
            ready: false,
            reason: "V2_INGREDIENTS_LAYOUT_CONFIG_INVALID",
          };
        }
      }
      if (promptModelConfig?.first_frame_layout != null) {
        if (promptModelConfig.first_frame_layout !== "canonical_v1") {
          return {
            ready: false,
            reason: "V2_FIRST_FRAME_LAYOUT_CONFIG_INVALID",
          };
        }
      }
      if (
        mediaType === "video" &&
        !declaredVideoRefs.length &&
        (item.refFileIds?.length || 0) > 0
      ) {
        const firstFrame =
          item.settings?.isFrames === true && item.refFileIds.length === 1;
        const ingredients = item.settings?.isFrames !== true;
        const capability = firstFrame
          ? "flow_v2_first_frame_canonical"
          : ingredients
            ? "flow_v2_ingredients_canonical"
            : null;
        if (capability) {
          let bridge = null;
          try {
            bridge = await window.BridgeClient?.ping?.();
          } catch (error) {
            return {
              ready: false,
              reason: error?.message || "BRIDGE_PING_FAILED",
            };
          }
          if (bridge && bridge.installed !== true) {
            return {
              ready: false,
              reason: bridge.error || "BRIDGE_NOT_INSTALLED",
            };
          }
          const supported = bridge
            ? Array.isArray(bridge.capabilities) &&
              bridge.capabilities.includes(capability)
            : (await window.BridgeClient?.hasCapability?.(capability)) === true;
          if (!supported)
            return {
              ready: false,
              reason: firstFrame
                ? "V2_FIRST_FRAME_BRIDGE_CAPABILITY_MISSING"
                : "V2_INGREDIENTS_BRIDGE_CAPABILITY_MISSING",
            };
        }
      }
      if (
        modelPromptLimit != null &&
        (!Number.isInteger(modelPromptLimit) || modelPromptLimit <= 0)
      ) {
        return { ready: false, reason: "V2_PROMPT_LIMIT_CONFIG_INVALID" };
      }
      if (
        modelPromptLimit > 0 &&
        typeof item.prompt === "string" &&
        item.prompt.length > modelPromptLimit
      ) {
        return {
          ready: false,
          reason: "PROMPT_TOO_LONG",
          diagnostic: {
            promptChars: item.prompt.length,
            promptMaxLength: modelPromptLimit,
            model,
          },
        };
      }
      const refIds = this._referenceIds(item, config);
      const videoRefs = declaredVideoRefs.filter((id) => {
        const resolved =
          window.FlowApiAdapter?._resolveRefUuid?.(item, id) || id;
        return refIds.includes(
          this._uuid(resolved) ? String(resolved).toLowerCase() : resolved,
        );
      });
      if (videoRefs.length) {
        const mapping = this._modelConfig(config.models?.video, model);
        if (
          mediaType !== "video" ||
          !mapping?.video_edit_video ||
          !config.protocol?.rpc?.video_edit_submit
        )
          return { ready: false, reason: "V2_VIDEO_REFERENCE_UNSUPPORTED" };
        if (videoRefs.length !== 1 || item.settings?.isFrames === true)
          return {
            ready: false,
            reason: "V2_VIDEO_EDIT_REFERENCE_COUNT_UNSUPPORTED",
          };
        const variant =
          mapping.video_edit_variants?.[item.settings?.flowVideoResolution] ||
          mapping.video_edit_variants?.default;
        if (
          (refIds.length > 1 ||
            item.settings?.flowVideoResolution === "360p") &&
          (!variant ||
            variant.image_refs_idx !== 8 ||
            ![9, 13].includes(variant.row_length) ||
            !Number.isInteger(variant.max_ref_images) ||
            variant.max_ref_images < 0 ||
            variant.max_ref_images > 6)
        )
          return { ready: false, reason: "V2_VIDEO_EDIT_CONFIG_INVALID" };
        if (
          refIds.length > 1 &&
          (!variant || refIds.length - 1 > variant.max_ref_images)
        )
          return {
            ready: false,
            reason: "V2_VIDEO_EDIT_REFERENCE_COUNT_UNSUPPORTED",
          };
        if (
          !Array.isArray(mapping.video_edit_resolutions) ||
          (item.settings?.flowVideoResolution &&
            !mapping.video_edit_resolutions.includes(
              item.settings.flowVideoResolution,
            ))
        )
          return {
            ready: false,
            reason: "V2_VIDEO_EDIT_RESOLUTION_UNSUPPORTED",
          };
        if (!config.schema?.aspect_ratios?.video?.[item.settings?.ratio])
          return { ready: false, reason: "V2_VIDEO_RATIO_UNVERIFIED" };
        if (
          !Number.isInteger(mapping.video_edit_frames?.start) ||
          !Number.isInteger(mapping.video_edit_frames?.end) ||
          mapping.video_edit_frames.start < 0 ||
          mapping.video_edit_frames.end <= mapping.video_edit_frames.start ||
          mapping.video_edit_frames.end > 1e5
        )
          return { ready: false, reason: "V2_VIDEO_EDIT_CONFIG_INVALID" };
        if (
          !(await window.BridgeClient?.hasCapability?.(
            "flow_v2_submit_video_edit",
          ))
        )
          return {
            ready: false,
            reason: "V2_VIDEO_EDIT_BRIDGE_CAPABILITY_MISSING",
          };
        if (
          (refIds.length > 1 ||
            item.settings?.flowVideoResolution === "360p") &&
          !(await window.BridgeClient?.hasCapability?.(
            "flow_v2_video_edit_mixed_refs",
          ))
        )
          return {
            ready: false,
            reason: "V2_VIDEO_EDIT_BRIDGE_CAPABILITY_MISSING",
          };
        return { ready: true };
      }
      if (mediaType === "image") {
        const modelConfig2 = this._modelConfig(config.models?.image, model);
        if (!modelConfig2?.default)
          return { ready: false, reason: "V2_MODEL_UNSUPPORTED" };
        const ratios2 = config.schema?.aspect_ratios?.image;
        if (
          !ratios2 ||
          !Object.prototype.hasOwnProperty.call(ratios2, item.settings?.ratio)
        ) {
          return {
            ready: false,
            reason: "V2_IMAGE_RATIO_UNVERIFIED",
            diagnostic: {
              requestedRatio: item.settings?.ratio ?? null,
              configuredRatios:
                ratios2 && typeof ratios2 === "object"
                  ? Object.keys(ratios2).slice(0, 20)
                  : [],
            },
          };
        }
        return { ready: true };
      }
      const refs = refIds.length;
      const isFrames = item.settings?.isFrames === true;
      const adapter = window.ProviderRegistry?.get?.("flow");
      if (
        refs > 0 &&
        adapter?.supportsRefImages?.(model, {
          inputType: isFrames ? "Frames" : "Ingredients",
          duration: item.settings?.flowVideoDuration || item.settings?.duration,
        }) === false
      )
        return { ready: false, reason: "V2_MODEL_REFERENCE_UNSUPPORTED" };
      if (isFrames && refs !== 1 && refs !== 2) {
        return { ready: false, reason: "V2_VIDEO_FRAME_COUNT_UNSUPPORTED" };
      }
      const ratios = config.schema?.aspect_ratios?.video;
      if (
        !ratios ||
        !Object.prototype.hasOwnProperty.call(ratios, item.settings?.ratio)
      ) {
        return { ready: false, reason: "V2_VIDEO_RATIO_UNVERIFIED" };
      }
      const baseModelConfig = this._modelConfig(config.models?.video, model);
      const modelConfig = baseModelConfig
        ? {
            ...baseModelConfig,
            ...baseModelConfig.by_ratio?.[item.settings?.ratio],
          }
        : null;
      if (
        Array.isArray(modelConfig?.generation_resolutions) &&
        item.settings?.flowVideoResolution &&
        !modelConfig.generation_resolutions.includes(
          item.settings.flowVideoResolution,
        )
      ) {
        return { ready: false, reason: "V2_GENERATION_RESOLUTION_UNSUPPORTED" };
      }
      let mapped = null;
      if (refs === 0) {
        mapped = this._capabilityModel(
          modelConfig?.text_2_video,
          item.settings?.flowVideoDuration || item.settings?.duration,
          item.settings?.flowVideoResolution,
        );
      } else if (isFrames && refs === 2) {
        mapped = this._capabilityModel(
          modelConfig?.start_end_frame_2_video,
          item.settings?.flowVideoDuration,
          item.settings?.flowVideoResolution,
        );
      } else if (isFrames && refs === 1) {
        mapped = this._capabilityModel(
          modelConfig?.frame_2_video,
          item.settings?.flowVideoDuration,
          item.settings?.flowVideoResolution,
        );
      } else if (!isFrames && refs > 0) {
        mapped = this._capabilityModel(
          modelConfig?.reference_frame_2_video,
          item.settings?.flowVideoDuration,
          item.settings?.flowVideoResolution,
        );
      }
      return mapped
        ? { ready: true }
        : { ready: false, reason: "V2_VIDEO_MODEL_MODE_UNSUPPORTED" };
    }
    static async checkReady({
      surface,
      mediaType,
      revision,
      projectId,
      flowTabId,
    } = {}) {
      const key = JSON.stringify([
        mediaType,
        revision,
        projectId || null,
        Number.isInteger(flowTabId) ? flowTabId : null,
        window.FlowApiDriverResolver?._healthEpoch || 0,
      ]);
      const pending = this._readyChecks || (this._readyChecks = new Map());
      if (pending.has(key)) return pending.get(key);
      const promise = this._checkReadyUnshared({
        surface,
        mediaType,
        revision,
        projectId,
        flowTabId,
      });
      pending.set(key, promise);
      try {
        return await promise;
      } finally {
        if (pending.get(key) === promise) pending.delete(key);
      }
    }
    static async _checkReadyUnshared({
      surface,
      mediaType,
      revision,
      projectId,
      flowTabId,
    } = {}) {
      const PCM = window.ProviderConfigManager;
      if (!PCM)
        return { ready: false, reason: "V2_PRIVATE_CONFIG_MANAGER_MISSING" };
      const config = await PCM.fetchFlowApiV2Configs?.();
      if (!config) return { ready: false, reason: "V2_PRIVATE_CONFIG_MISSING" };
      const protocolRevision = Number(config.protocol?.schema_version || 0);
      if (protocolRevision !== Number(revision) || protocolRevision !== 1) {
        return {
          ready: false,
          reason: "V2_PROTOCOL_REVISION_MISMATCH",
          protocolRevision,
        };
      }
      if (config.state_mapping?.verified !== true) {
        return {
          ready: false,
          reason: "V2_STATE_MAPPING_UNVERIFIED",
          protocolRevision,
        };
      }
      const requiredRpc =
        mediaType === "video"
          ? [
              "video_submit",
              "video_text_submit",
              "video_first_frame_submit",
              "video_first_last_submit",
              "video_poll",
              "media_resolve",
            ]
          : ["image_submit", "media_resolve"];
      if (
        requiredRpc.some(
          (key) => typeof config.protocol?.rpc?.[key] !== "string",
        )
      ) {
        return {
          ready: false,
          reason: "V2_RPC_CONFIG_INVALID",
          protocolRevision,
        };
      }
      const requiredCapabilities = this.requiredCapabilities(mediaType);
      let bridge;
      if (window.BridgeClient?.ping) {
        bridge = await window.BridgeClient.ping();
      } else {
        const support = await Promise.all(
          requiredCapabilities.map(async (capability) => {
            try {
              return (
                (await window.BridgeClient?.hasCapability?.(capability)) ===
                true
              );
            } catch (_) {
              return false;
            }
          }),
        );
        bridge = {
          installed: !!window.BridgeClient,
          capabilities: requiredCapabilities.filter(
            (_, index) => support[index],
          ),
        };
      }
      if (!bridge?.installed) {
        const reason = bridge?.error || "BRIDGE_NOT_INSTALLED";
        const uncertain = [
          "BRIDGE_REQUEST_TIMEOUT",
          "BRIDGE_CHANNEL_CLOSED",
          "EMPTY_RESPONSE",
        ].includes(reason);
        return {
          ready: false,
          installed: uncertain,
          reason,
          protocolRevision,
          ...(uncertain ? { retryable: true, uncertain: true } : {}),
        };
      }
      const capabilities = Array.isArray(bridge.capabilities)
        ? bridge.capabilities
        : [];
      const missingCapabilities = requiredCapabilities.filter(
        (capability) => !capabilities.includes(capability),
      );
      if (missingCapabilities.length) {
        return {
          ready: false,
          installed: true,
          reason: "V2_BRIDGE_VERSION_UNSUPPORTED",
          protocolRevision,
          missingCapabilities,
        };
      }
      const healthKey = JSON.stringify([
        protocolRevision,
        window.FlowApiV2CheckpointStore?.fingerprint?.(config) || null,
        projectId || null,
        Number.isInteger(flowTabId) ? flowTabId : null,
        window.FlowApiDriverResolver?._healthEpoch || 0,
      ]);
      const healthChecks =
        this._pageHealthChecks || (this._pageHealthChecks = new Map());
      let healthFlight = healthChecks.get(healthKey);
      if (!healthFlight) {
        healthFlight = window.BridgeClient.request("flow_v2_health", {
          protocol: config.protocol,
          models: config.models,
          schema: config.schema,
          stateMapping: config.state_mapping,
          protocolRevision,
          protocolFingerprint:
            window.FlowApiV2CheckpointStore?.fingerprint?.(config) || null,
          runtime: config.runtime,
          surface,
          mediaType,
          projectId: projectId || null,
          ...(Number.isInteger(flowTabId) && flowTabId >= 0
            ? { flowTabId }
            : {}),
        }).finally(() => {
          if (healthChecks.get(healthKey) === healthFlight)
            healthChecks.delete(healthKey);
        });
        healthChecks.set(healthKey, healthFlight);
      }
      const response = await healthFlight;
      if (
        response?.error === "fresh_page_session_required" &&
        response?.diagnostic
      ) {
        const details = response.diagnostic;
        const signature = JSON.stringify({
          sessionProof: [
            "page_session_missing",
            "same_domain_header_missing",
          ].includes(details.sessionProof)
            ? details.sessionProof
            : "unknown",
          wizPresent: details.wizPresent === true,
          atPresent: details.atPresent === true,
          buildPresent: details.buildPresent === true,
          fSidPresent: details.fSidPresent === true,
          nativeRequestObserved: details.nativeRequestObserved === true,
          sameDomainHeaderObserved: details.sameDomainHeaderObserved === true,
        });
        if (this._lastSessionDiagnostic !== signature) {
          this._lastSessionDiagnostic = signature;
          console.warn("[FlowApiV2Health] session proof missing", signature);
        }
      } else if (response?.ready === true) {
        this._lastSessionDiagnostic = null;
      }
      return response?.ok && response?.ready
        ? {
            ready: true,
            protocolRevision,
            session: response.session || null,
            projectId: response.projectId || projectId || null,
            ...(Number.isInteger(response.flowTabId)
              ? { flowTabId: response.flowTabId }
              : {}),
            supportedCapabilities: requiredCapabilities,
          }
        : {
            ready: false,
            reason: response?.error || "V2_PAGE_SESSION_NOT_READY",
            protocolRevision,
            diagnostic: response?.diagnostic || null,
            grpcCode: response?.grpcCode ?? null,
            grpcReason: response?.grpcReason || null,
            providerErrorCodes: response?.providerErrorCodes || [],
          };
    }
    static async submit(item, options = {}) {
      const promptLimit =
        window.ValidationRules?.safeGetInt?.("prompt_max_length", 0) || 0;
      const promptLength =
        typeof item.prompt === "string" ? item.prompt.length : 0;
      if (promptLimit > 0 && promptLength > promptLimit) {
        throw new window.FlowApiDriverError("PROMPT_TOO_LONG", {
          driver: "v2",
          stage: "pre_dispatch",
          retryable: false,
          diagnostic: {
            promptChars: promptLength,
            promptMaxLength: promptLimit,
          },
        });
      }
      const adapter = window.FlowApiAdapter;
      if (!adapter?._acquire || !adapter?._paceSubmit || !adapter?._release) {
        throw new Error("FLOW_API_SUBMIT_GATE_MISSING");
      }
      const abortFn = options.abortFn || (() => false);
      const cancelled = () => {
        item.state = window.QueueItem?.STATE?.CANCELLED || "CANCELLED";
        item._apiWaitingSlot = false;
        return { ok: true, cancelled: true, item };
      };
      const runtimeConfig =
        await window.ProviderConfigManager?.fetchFlowApiV2Configs?.();
      if (!runtimeConfig) throw new Error("V2_PRIVATE_CONFIG_MISSING");
      if (!(await this._acquireRuntimeSlot(runtimeConfig, abortFn)))
        return cancelled();
      const gateMediaType = /video/i.test(item?.settings?.genType || "")
        ? "video"
        : "image";
      if (!(await adapter._acquire(abortFn, gateMediaType))) {
        this._releaseRuntimeSlot();
        return cancelled();
      }
      try {
        if (
          !(await adapter._paceSubmit(
            item?.settings?.apiSubmitDelayMs,
            abortFn,
          ))
        )
          return cancelled();
        if (!(await this._waitForResume(options))) return cancelled();
        return await this._submitInSlot(item, options);
      } finally {
        adapter._release(gateMediaType);
        this._releaseRuntimeSlot();
      }
    }
    static async _waitForResume(options) {
      while (options.isPausedFn?.() && !options.abortFn?.()) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return !options.abortFn?.();
    }
    static async _awaitAcceptedRead(
      read,
      item,
      deadline,
      options = {},
      operationIds = [],
    ) {
      let timer = null;
      let settled = false;
      const interrupted = () => {
        const code = options.abortFn?.()
          ? "ABORTED"
          : Date.now() >= deadline
            ? "V2_OPERATION_TIMEOUT"
            : null;
        if (!code) return null;
        if (code === "ABORTED")
          item.state = window.QueueItem?.STATE?.CANCELLED || "CANCELLED";
        return Object.assign(new Error(code), {
          dispatchStarted: true,
          operationId: item.operationId || item.flowOperationId || null,
          stage: "accepted_poll",
          retryable: false,
          diagnostic: {
            operationWait: { deadlineAt: deadline, observedAt: Date.now() },
          },
        });
      };
      const stopped = new Promise((_, reject) => {
        const check = () => {
          if (settled) return;
          const error = interrupted();
          if (error) {
            reject(error);
            return;
          }
          timer = setTimeout(
            check,
            Math.min(100, Math.max(1, deadline - Date.now())),
          );
        };
        check();
      });
      try {
        const value = await Promise.race([
          Promise.resolve().then(() => {
            const error2 = interrupted();
            if (error2) throw error2;
            return read();
          }),
          stopped,
        ]);
        const error = interrupted();
        if (
          error?.message === "ABORTED" ||
          (error && value?.error === "ABORTED")
        )
          throw error;
        return value;
      } catch (error) {
        if (["ABORTED", "V2_OPERATION_TIMEOUT"].includes(error?.message))
          options.onRecoveryState?.(null);
        if (error?.message === "ABORTED") {
          const ownedIds = [
            ...new Set(
              [
                ...operationIds,
                item.operationId,
                item.flowOperationId,
                ...(item.flowApiLineage || []).map(
                  (entry) => entry.operationId,
                ),
              ].filter(Boolean),
            ),
          ];
          await Promise.allSettled(
            ownedIds.map((id) => window.FlowApiV2CheckpointStore?.remove?.(id)),
          );
        }
        throw error;
      } finally {
        settled = true;
        if (timer !== null) clearTimeout(timer);
      }
    }
    static _operationDeadline(item, config, mediaType, dispatchAt = null) {
      const timeoutMs = this._runtimeInteger(
        config,
        mediaType === "video" ? "video_timeout_ms" : "image_timeout_ms",
      );
      const existing = Number(item?.flowApiOperationDeadlineAt);
      if (Number.isFinite(existing) && existing > 0) return existing;
      const recordedDispatch = Number(item?.flowApiDispatchedAt);
      const base =
        Number.isFinite(recordedDispatch) && recordedDispatch > 0
          ? recordedDispatch
          : Number.isFinite(dispatchAt) && dispatchAt > 0
            ? dispatchAt
            : Date.now();
      item.flowApiDispatchedAt = base;
      item.flowApiOperationDeadlineAt = base + timeoutMs;
      return item.flowApiOperationDeadlineAt;
    }
    static _pumpRuntimeWaiters() {
      const kept = [];
      for (const waiter of this._runtimeWaiters) {
        if (waiter.abortFn()) waiter.resolve(false);
        else kept.push(waiter);
      }
      this._runtimeWaiters = kept;
      while (
        this._runtimeWaiters.length &&
        this._runtimeInFlight < this._runtimeWaiters[0].maxConcurrent
      ) {
        this._runtimeInFlight++;
        this._runtimeWaiters.shift().resolve(true);
      }
      if (!this._runtimeWaiters.length && this._runtimeWaitTimer) {
        clearInterval(this._runtimeWaitTimer);
        this._runtimeWaitTimer = null;
      }
    }
    static async _acquireRuntimeSlot(config, abortFn = () => false) {
      const maxConcurrent = this._runtimeInteger(config, "max_concurrent");
      if (abortFn()) return false;
      if (
        this._runtimeInFlight < maxConcurrent &&
        this._runtimeWaiters.length === 0
      ) {
        this._runtimeInFlight++;
        return true;
      }
      return new Promise((resolve) => {
        this._runtimeWaiters.push({ abortFn, resolve, maxConcurrent });
        if (!this._runtimeWaitTimer)
          this._runtimeWaitTimer = setInterval(
            () => this._pumpRuntimeWaiters(),
            250,
          );
        this._pumpRuntimeWaiters();
      });
    }
    static _releaseRuntimeSlot() {
      this._runtimeInFlight = Math.max(0, this._runtimeInFlight - 1);
      this._pumpRuntimeWaiters();
    }
    static async _submitInSlot(item, options = {}) {
      const mediaType = /video/i.test(item?.settings?.genType || "")
        ? "video"
        : "image";
      if (!(await this._waitForResume(options))) {
        item.state = window.QueueItem?.STATE?.CANCELLED || "CANCELLED";
        item._apiWaitingSlot = false;
        return { ok: true, cancelled: true, item };
      }
      await window.BridgeClient?.ping?.();
      const inputHealth = await this.checkInputSupported({ item, mediaType });
      if (inputHealth.ready !== true)
        throw Object.assign(
          new Error(inputHealth.reason || "V2_INPUT_UNSUPPORTED"),
          { stage: "pre_dispatch", diagnostic: inputHealth.diagnostic || null },
        );
      let config =
        await window.ProviderConfigManager?.fetchFlowApiV2Configs?.();
      if (!config) throw new Error("V2_PRIVATE_CONFIG_MISSING");
      const generationTransport = window.SystemConfig?.get?.(
        "flow_api_v2_generation_transport",
        null,
      );
      if (!["xhr", "fetch_request"].includes(generationTransport)) {
        throw Object.assign(
          new Error("V2_GENERATION_TRANSPORT_CONFIG_MISSING"),
          { stage: "pre_dispatch", noRetry: true },
        );
      }
      if (
        generationTransport === "fetch_request" &&
        !(await window.BridgeClient?.hasCapability?.(
          "flow_v2_fetch_request_generation",
        ))
      ) {
        throw Object.assign(new Error("V2_BRIDGE_FETCH_REQUEST_UNSUPPORTED"), {
          stage: "pre_dispatch",
          noRetry: true,
        });
      }
      const genericSubmitPacingMs = Math.max(
        0,
        Number(item?.settings?.apiSubmitDelayMs) || 0,
      );
      const v2SubmitPacingMs = this._runtimeInteger(
        config,
        "submit_pacing_ms",
        50,
      );
      const effectiveSubmitPacingMs = Math.max(
        genericSubmitPacingMs,
        v2SubmitPacingMs,
      );
      if (
        effectiveSubmitPacingMs > genericSubmitPacingMs &&
        !(await window.FlowApiAdapter._paceSubmit(
          effectiveSubmitPacingMs,
          options.abortFn || (() => false),
        ))
      ) {
        item.state = window.QueueItem?.STATE?.CANCELLED || "CANCELLED";
        item._apiWaitingSlot = false;
        return { ok: true, cancelled: true, item };
      }
      const admittedRefs = this._referenceIds(item, config);
      let hasVideoRef = (
        window.FlowApiAdapter?._declaredRefVideoIds?.(item) ||
        (item.settings?.refVideoIds || []).filter((id) =>
          item.refFileIds?.includes(id),
        )
      ).some((id) => {
        const resolved =
          window.FlowApiAdapter?._resolveRefUuid?.(item, id) || id;
        return admittedRefs.includes(
          this._uuid(resolved) ? String(resolved).toLowerCase() : resolved,
        );
      });
      const quantity = Math.max(1, Number(item.settings?.quantity) || 1);
      let method =
        mediaType === "video"
          ? hasVideoRef
            ? "flow_v2_submit_video_edit"
            : "flow_v2_submit_video"
          : "flow_v2_submit_image";
      const nativeImageBatch =
        mediaType === "image" &&
        quantity > 1 &&
        (await window.BridgeClient?.hasCapability?.(
          "flow_v2_submit_image_batch",
        ));
      if (nativeImageBatch) method = "flow_v2_submit_image_batch";
      if (!(await window.BridgeClient?.hasCapability?.(method)))
        throw new Error("V2_BRIDGE_VERSION_UNSUPPORTED");
      let protocolRevision = Number(config.protocol?.schema_version || 0);
      let protocolFingerprint =
        window.FlowApiV2CheckpointStore?.fingerprint?.(config) || null;
      const latestSelection = await window.FlowApiFacade?.prepare?.(
        item,
        options,
      );
      const surface =
        options.owner === "workflow"
          ? "workflow"
          : options.owner === "task"
            ? "task"
            : "gen";
      const latestHealth =
        latestSelection?.driver === "v2"
          ? await this.checkReady({
              surface,
              mediaType,
              revision: latestSelection.settings?.revision,
              projectId: item?.projectId || null,
              ...this._flowTabPin(item),
            })
          : null;
      const latestConfig =
        await window.ProviderConfigManager?.fetchFlowApiV2Configs?.();
      const latestRevision = Number(
        latestConfig?.protocol?.schema_version || 0,
      );
      const latestFingerprint = latestConfig
        ? window.FlowApiV2CheckpointStore?.fingerprint?.(latestConfig) || null
        : null;
      if (
        !latestSelection?.ok ||
        latestSelection.driver !== "v2" ||
        latestHealth?.ready !== true ||
        Number(latestSelection.settings?.revision || latestRevision) !==
          latestRevision ||
        latestRevision !== protocolRevision ||
        latestFingerprint !== protocolFingerprint
      ) {
        const error = new Error(
          latestSelection?.reason ||
            latestHealth?.reason ||
            "FLOW_API_DRIVER_CHANGED_BEFORE_DISPATCH",
        );
        error.code = "FLOW_API_DRIVER_CHANGED_BEFORE_DISPATCH";
        throw error;
      }
      const verifiedProjectId =
        latestHealth.projectId || item.projectId || null;
      if (
        !this._uuid(verifiedProjectId) ||
        (item.projectId &&
          String(item.projectId).toLowerCase() !==
            verifiedProjectId.toLowerCase())
      ) {
        const error = new Error("V2_PROJECT_CONTEXT_INVALID");
        error.code = "FLOW_API_DRIVER_CHANGED_BEFORE_DISPATCH";
        throw error;
      }
      item.projectId = verifiedProjectId;
      if (options.abortFn?.()) {
        item.state = window.QueueItem?.STATE?.CANCELLED || "CANCELLED";
        item._apiWaitingSlot = false;
        return { ok: true, cancelled: true, item };
      }
      options = { ...options, selection: latestSelection };
      config = latestConfig;
      protocolRevision = latestRevision;
      protocolFingerprint = latestFingerprint;
      await this._filterGenReferences(item, config, options);
      if (item._owner === "prompts" && mediaType === "video") {
        const filteredRefs = this._referenceIds(item, config);
        hasVideoRef = (
          window.FlowApiAdapter?._declaredRefVideoIds?.(item) ||
          (item.settings?.refVideoIds || []).filter((id) =>
            item.refFileIds?.includes(id),
          )
        ).some((id) => {
          const value =
            window.FlowApiAdapter?._resolveRefUuid?.(item, id) || id;
          return filteredRefs.includes(
            this._uuid(value) ? String(value).toLowerCase() : value,
          );
        });
        method = hasVideoRef
          ? "flow_v2_submit_video_edit"
          : "flow_v2_submit_video";
        if (!(await window.BridgeClient?.hasCapability?.(method)))
          throw new Error("V2_BRIDGE_VERSION_UNSUPPORTED");
      }
      let response;
      const referenceIds = this._referenceIds(item, config);
      const referenceResolution = this._referenceResolution(item);
      const referenceTelemetry = {
        declaredReferenceCount: referenceResolution.declaredCount,
        resolvedReferenceCount: referenceResolution.ids.length,
        submittedReferenceCount: referenceIds.length,
        unresolvedReferenceCount: referenceResolution.unresolvedCount,
        deduplicatedReferenceCount: referenceResolution.deduplicatedCount,
        droppedByLimitCount: Math.max(
          0,
          referenceResolution.ids.length - referenceIds.length,
        ),
        referenceKinds: referenceIds.map((id) =>
          this._uuid(id) ? "uuid" : "asb",
        ),
      };
      const videoReferenceIds = hasVideoRef
        ? [
            ...new Set(
              (
                window.FlowApiAdapter?._declaredRefVideoIds?.(item) ||
                (item.settings?.refVideoIds || []).filter((id) =>
                  item.refFileIds?.includes(id),
                )
              )
                .map(
                  (id) =>
                    window.FlowApiAdapter?._resolveRefUuid?.(item, id) || id,
                )
                .map((id) => (this._uuid(id) ? String(id).toLowerCase() : id)),
            ),
          ].filter((id) => referenceIds.includes(id))
        : [];
      if (referenceIds.length < new Set(item.refFileIds || []).size) {
        const dropped =
          new Set(item.refFileIds || []).size - referenceIds.length;
        console.info(
          `[FlowApiV2] Reference limit: using ${referenceIds.length}, omitting ${dropped} extra reference(s)`,
        );
        if (typeof window.showNotification === "function") {
          const message = window.I18n?.t?.("gen.refExceedLimitLog", {
            count: new Set(item.refFileIds || []).size,
            limit: referenceIds.length,
          });
          if (message && message !== "gen.refExceedLimitLog") {
            window.showNotification(message, "warning", 6e3);
          }
        }
      }
      const receipts = [];
      const rejectedRequests = [];
      let invalidReceipt = false;
      const mutationCount = nativeImageBatch ? 1 : quantity;
      const submitStartedAt = Date.now();
      try {
        for (let outputIndex = 0; outputIndex < mutationCount; outputIndex++) {
          if (options.shouldStopNewMutationsFn?.() && receipts.length > 0) {
            const stopReason =
              options.getMutationStopReason?.() ||
              "PUBLIC_ERROR_UNUSUAL_ACTIVITY";
            rejectedRequests.push(stopReason);
            item._apiUnusualPartialHandled = [
              "bot_detected",
              "captcha_failed",
            ].includes(
              this._classifyProviderError({ code: stopReason }, config),
            );
            break;
          }
          if (!(await this._waitForResume(options))) break;
          if (options.abortFn?.()) break;
          if (
            outputIndex > 0 &&
            !(await window.FlowApiAdapter._paceSubmit(
              effectiveSubmitPacingMs,
              options.abortFn || (() => false),
            ))
          )
            break;
          if (outputIndex > 0) {
            const currentSelection = await window.FlowApiFacade?.prepare?.(
              item,
              options,
            );
            const currentConfig =
              await window.ProviderConfigManager?.fetchFlowApiV2Configs?.();
            if (
              window.featureGate?.canUse?.("flow_api_enabled") === false ||
              !currentSelection?.ok ||
              currentSelection.driver !== "v2" ||
              !currentConfig ||
              window.FlowApiV2CheckpointStore?.fingerprint?.(currentConfig) !==
                protocolFingerprint
            ) {
              rejectedRequests.push("V2_BATCH_POLICY_CHANGED");
              break;
            }
          }
          if (!(await this._waitForResume(options))) break;
          let edgeSelection, edgeHealth;
          do {
            if (
              window.FlowApiSessionCoordinator?.waitForReload &&
              !(await window.FlowApiSessionCoordinator.waitForReload(
                item,
                options.abortFn,
              ))
            )
              break;
            if (options.abortFn?.()) break;
            edgeSelection = await window.FlowApiFacade?.prepare?.(
              item,
              options,
            );
            edgeHealth =
              edgeSelection?.ok && edgeSelection.driver === "v2"
                ? await this.checkReady({
                    surface,
                    mediaType,
                    revision: protocolRevision,
                    projectId: item.projectId,
                    ...this._flowTabPin(item),
                  })
                : null;
          } while (window.FlowApiSessionCoordinator?.hasPendingReload?.(item));
          if (options.abortFn?.()) break;
          if (
            !edgeSelection?.ok ||
            edgeSelection.driver !== "v2" ||
            edgeHealth?.ready !== true ||
            (edgeHealth.projectId &&
              edgeHealth.projectId.toLowerCase() !==
                item.projectId.toLowerCase())
          ) {
            const reason =
              edgeSelection?.reason ||
              edgeHealth?.reason ||
              "V2_PAGE_SESSION_NOT_READY";
            if (receipts.length) {
              rejectedRequests.push(reason);
              break;
            }
            const error = new Error(reason);
            error.code = "FLOW_API_DRIVER_CHANGED_BEFORE_DISPATCH";
            throw error;
          }
          if (hasVideoRef)
            console.info(
              "[FlowApiV2/MixedRefSubmit]",
              JSON.stringify({
                itemId: item.id,
                outputIndex,
                method,
                model: item.settings?.model || null,
                ratio: item.settings?.ratio || null,
                resolution: item.settings?.flowVideoResolution || null,
                duration:
                  item.settings?.flowVideoDuration ||
                  item.settings?.duration ||
                  null,
                referenceKinds: referenceIds.map((id) =>
                  this._uuid(id) ? "uuid" : "asb",
                ),
                videoReferenceKinds: videoReferenceIds.map((id) =>
                  this._uuid(id) ? "uuid" : "asb",
                ),
                imageReferenceCount: referenceIds.filter(
                  (id) => !videoReferenceIds.includes(id),
                ).length,
              }),
            );
          if (options.isPausedFn?.()) {
            outputIndex--;
            continue;
          }
          if (options.abortFn?.()) break;
          if (options.shouldStopNewMutationsFn?.() && receipts.length > 0) {
            const stopReason =
              options.getMutationStopReason?.() ||
              "PUBLIC_ERROR_UNUSUAL_ACTIVITY";
            rejectedRequests.push(stopReason);
            item._apiUnusualPartialHandled = [
              "bot_detected",
              "captcha_failed",
            ].includes(
              this._classifyProviderError({ code: stopReason }, config),
            );
            break;
          }
          await options.onBeforeSubmit?.();
          if (options.abortFn?.()) break;
          if (options.isPausedFn?.()) {
            outputIndex--;
            continue;
          }
          item._apiWaitingSlot = false;
          try {
            options.onSlotAcquired?.();
          } catch (_) {}
          window.FlowApiTelemetry?.emit?.(
            "commit_boundary",
            {
              itemId: item.id,
              attemptId: item.attemptId || item.id,
              driver: "v2",
              projectId: item.projectId || null,
              protocolRevision,
              surface,
              ...referenceTelemetry,
            },
            { dedupe: false },
          );
          window.FlowApiTelemetry?.emit?.(
            "submit_started",
            {
              itemId: item.id,
              attemptId: item.attemptId || item.id,
              driver: "v2",
              projectId: item.projectId || null,
              protocolRevision,
              surface,
              ...referenceTelemetry,
            },
            { dedupeKey: `submit_started:v2:${item.attemptId || item.id}` },
          );
          window.FlowApiFacade.commitDriver(item, edgeSelection, options);
          const dispatchAt = Date.now();
          this._operationDeadline(item, config, mediaType, dispatchAt);
          item._apiDispatchStarted = true;
          try {
            options.onDispatchStarted?.();
          } catch (_) {}
          this._setMutationActive(true);
          try {
            response = await window.BridgeClient.request(
              method,
              {
                generationTransport,
                protocol: config.protocol,
                schema: config.schema,
                models: config.models,
                runtime: config.runtime,
                stateMapping: config.state_mapping,
                protocolRevision,
                protocolFingerprint,
                ...this._flowTabPin(item),
                input: {
                  itemId: item.id,
                  attemptId:
                    nativeImageBatch || quantity === 1
                      ? item.attemptId || item.id
                      : `${item.attemptId || item.id}:${outputIndex}`,
                  projectId: item.projectId || null,
                  prompt: item.prompt || "",
                  model: item.settings?.model || null,
                  ratio: item.settings?.ratio || null,
                  duration:
                    item.settings?.flowVideoDuration ||
                    item.settings?.duration ||
                    null,
                  resolution: item.settings?.flowVideoResolution || null,
                  isFrames: item.settings?.isFrames === true,
                  quantity: nativeImageBatch ? quantity : 1,
                  refMediaIds: referenceIds,
                  refVideoMediaIds: videoReferenceIds,
                },
              },
              { abortFn: options.abortFn },
            );
          } finally {
            this._setMutationActive(false);
          }
          if (!response?.ok) {
            if (response?.ambiguous || response?.stage === "ambiguous") break;
            const rejection = this._responseError(response, config);
            item.flowApiFailureDetail = {
              code: rejection.code,
              grpcCode: rejection.grpcCode ?? null,
              grpcReason: rejection.grpcReason || null,
              providerErrorCodes: rejection.providerErrorCodes || [],
              driver: "v2",
            };
            rejectedRequests.push(rejection.code);
            this._reportQuota(rejection, config, options);
            this._reportBotGate(rejection, config, options);
            if (quantity === 1) break;
            if (
              ["bot_detected", "captcha_failed"].includes(rejection.errorType)
            ) {
              item.errorType = rejection.errorType;
              item.error = rejection.code || response.error;
            }
            if (
              [
                "bot_detected",
                "captcha_failed",
                "auth_expired",
                "quota_exceeded",
                "per_model_daily",
                "tier_restricted",
                "rate_limited",
              ].includes(rejection.errorType)
            )
              break;
            continue;
          }
          const accepted = Array.isArray(response.outputs)
            ? response.outputs
            : [];
          const expectedOutputCount = nativeImageBatch ? quantity : 1;
          if (
            accepted.length !== expectedOutputCount ||
            accepted.some(
              (output) =>
                !this._uuid(output.operationId) ||
                (output.mediaId != null && !this._uuid(output.mediaId)) ||
                receipts.some(
                  (prior) => prior.operationId === output.operationId,
                ),
            )
          ) {
            invalidReceipt = true;
            break;
          }
          receipts.push(...accepted);
          item.flowApiDriver = "v2";
          item.flowApiProtocolRevision = protocolRevision;
          item.flowApiProtocolFingerprint = protocolFingerprint;
          item.flowApiAccepted = true;
          item.flowApiLineage = receipts.map((output) => ({
            attemptId: output.attemptId || item.attemptId || item.id,
            operationId: output.operationId,
            mediaId: output.mediaId || null,
          }));
          item.operationId || (item.operationId = accepted[0].operationId);
          item.flowOperationId ||
            (item.flowOperationId = accepted[0].operationId);
          if (quantity > 1 && !options.abortFn?.())
            for (const output of accepted)
              await window.FlowApiV2CheckpointStore?.save?.(
                item,
                {
                  ...output,
                  projectId: response.projectId || item.projectId,
                  mediaType,
                  surface,
                },
                config,
                output.state || (output.url ? "completed" : "accepted"),
              );
          if (quantity > 1 && receipts.length === quantity) {
            try {
              options.onAccepted?.();
            } catch (_) {}
          }
        }
        if (
          receipts.length &&
          !invalidReceipt &&
          !response?.ambiguous &&
          response?.stage !== "ambiguous" &&
          (response?.ok || rejectedRequests.length)
        ) {
          response = { ok: true, outputs: receipts, projectId: item.projectId };
        }
      } catch (requestError) {
        if (
          requestError?.dispatchStarted === true ||
          requestError?.ambiguous === true
        ) {
          item.flowApiDriver = "v2";
          item.flowApiMode =
            options.selection?.mode || item.flowApiMode || null;
          item.flowApiProtocolRevision = protocolRevision;
          item.flowApiProtocolFingerprint = protocolFingerprint;
          item.flowApiAccepted = true;
          try {
            options.onAccepted?.();
          } catch (_) {}
        }
        throw requestError;
      }
      if (options.abortFn?.()) {
        for (const output of receipts)
          await window.FlowApiV2CheckpointStore?.remove?.(output.operationId);
        item.state = window.QueueItem?.STATE?.CANCELLED || "CANCELLED";
        item._apiWaitingSlot = false;
        return { ok: true, cancelled: true, item };
      }
      if (invalidReceipt) {
        item.flowApiDriver = "v2";
        item.flowApiAccepted = true;
        window.FlowApiDriverResolver?.tripV2?.(
          "V2_SCHEMA_DRIFT_OUTPUT_IDENTITY",
          protocolRevision,
        );
        throw Object.assign(new Error("V2_SCHEMA_DRIFT_OUTPUT_IDENTITY"), {
          dispatchStarted: true,
          ambiguous: true,
          stage: "ambiguous",
        });
      }
      if (!response?.ok) {
        if (
          !receipts.length &&
          response?.stage === "pre_dispatch" &&
          response.dispatchStarted === false &&
          response.ambiguous === false &&
          item.flowApiAccepted !== true &&
          !item.operationId &&
          !item.flowOperationId
        ) {
          item._apiDispatchStarted = false;
        }
        const providerCode = Array.isArray(response?.providerErrorCodes)
          ? response.providerErrorCodes.find(
              (code) =>
                typeof code === "string" &&
                /^PUBLIC_ERROR_[A-Z0-9_]+$/.test(code),
            )
          : null;
        const failureCode =
          providerCode || this._responseError(response, config).code;
        const error = new Error(failureCode);
        error.code = failureCode;
        error.reason = failureCode;
        error.errorType = this._classifyProviderError(
          {
            code: failureCode,
            providerErrorCodes: response?.providerErrorCodes,
            grpcReason: response?.grpcReason,
          },
          config,
        );
        error.grpcCode = Number.isInteger(response?.grpcCode)
          ? response.grpcCode
          : null;
        error.grpcReason =
          typeof response?.grpcReason === "string" &&
          /^[A-Z][A-Z0-9_]{2,119}$/.test(response.grpcReason)
            ? response.grpcReason
            : null;
        error.providerErrorCodes = response?.providerErrorCodes;
        error.diagnostic =
          response?.diagnostic && typeof response.diagnostic === "object"
            ? { ...response.diagnostic }
            : null;
        error.stage = [
          "pre_dispatch",
          "receipt",
          "ambiguous",
          "accepted_poll",
        ].includes(response?.stage)
          ? response.stage
          : null;
        error.dispatchStarted = response?.dispatchStarted === true;
        error.ambiguous = response?.ambiguous === true;
        const confirmedRejectedReceipt =
          error.stage === "receipt" &&
          error.ambiguous !== true &&
          !error.operationId;
        if (
          (error.dispatchStarted || error.ambiguous) &&
          !confirmedRejectedReceipt
        ) {
          item.flowApiDriver = "v2";
          item.flowApiMode =
            options.selection?.mode || item.flowApiMode || null;
          item.flowApiProtocolRevision = protocolRevision;
          item.flowApiProtocolFingerprint = protocolFingerprint;
          item.flowApiAccepted = true;
          try {
            options.onAccepted?.();
          } catch (_) {}
        }
        throw error;
      }
      let outputs = Array.isArray(response.outputs) ? response.outputs : [];
      if (
        !outputs.length ||
        outputs.some(
          (output) =>
            !this._uuid(output.operationId) ||
            (output.mediaId != null && !this._uuid(output.mediaId)),
        )
      ) {
        item.flowApiDriver = "v2";
        item.flowApiMode = options.selection?.mode || item.flowApiMode || null;
        item.flowApiProtocolRevision = protocolRevision;
        item.flowApiProtocolFingerprint = protocolFingerprint;
        item.flowApiAccepted = true;
        try {
          options.onAccepted?.();
        } catch (_) {}
        const error = new Error("V2_SCHEMA_DRIFT_OUTPUT_IDENTITY");
        error.dispatchStarted = true;
        error.ambiguous = true;
        window.FlowApiDriverResolver?.tripV2?.(error.message, protocolRevision);
        throw error;
      }
      item.flowApiDriver = "v2";
      item.flowApiMode = options.selection?.mode || item.flowApiMode || null;
      item.flowApiProtocolRevision = protocolRevision;
      item.flowApiProtocolFingerprint = protocolFingerprint;
      item.flowApiAccepted = true;
      window.FlowApiTelemetry?.emit?.(
        "submit_receipt",
        {
          itemId: item.id,
          attemptId: item.attemptId || item.id,
          driver: "v2",
          projectId: response.projectId || item.projectId || null,
          protocolRevision,
          outputCount: outputs.length,
          durationMs: Date.now() - submitStartedAt,
        },
        { dedupeKey: `receipt:v2:${item.attemptId || item.id}` },
      );
      item.flowApiLineage = outputs.map((output) => ({
        attemptId: output.attemptId || item.attemptId || item.id,
        operationId: output.operationId,
        mediaId: output.mediaId || null,
      }));
      item.operationId = outputs[0].operationId;
      item.flowOperationId = outputs[0].operationId;
      for (const output of outputs) {
        if (quantity > 1) continue;
        await window.FlowApiV2CheckpointStore?.save?.(
          item,
          {
            ...output,
            projectId:
              response.projectId || output.projectId || item.projectId || null,
            mediaType,
            surface,
          },
          config,
          output.state || (output.url ? "completed" : "accepted"),
        );
      }
      if (options.abortFn?.()) {
        for (const output of outputs)
          await window.FlowApiV2CheckpointStore?.remove?.(output.operationId);
        item.state = window.QueueItem?.STATE?.CANCELLED || "CANCELLED";
        item._apiWaitingSlot = false;
        return { ok: true, cancelled: true, item };
      }
      if (quantity === 1) {
        try {
          options.onAccepted?.();
        } catch (_) {}
      }
      if (outputs.some((output) => !this._isCompleted(output))) {
        outputs = await this._drainAccepted(item, outputs, config, options);
      }
      item.flowApiLineage = outputs.map((output) => ({
        attemptId: output.attemptId || item.attemptId || item.id,
        operationId: output.operationId,
        mediaId: output.mediaId || null,
        state: this._isCompleted(output)
          ? "completed"
          : this._isFailed(output)
            ? "failed"
            : null,
      }));
      const failedOutputs = outputs.filter((output) => this._isFailed(output));
      rejectedRequests.push(
        ...failedOutputs.map((output) => output.error || "V2_OPERATION_FAILED"),
      );
      if (failedOutputs.length === outputs.length) {
        for (const output of outputs)
          await window.FlowApiV2CheckpointStore?.remove?.(output.operationId);
        const error =
          window.FlowApiDriverError.fromFailedOutputs(failedOutputs);
        error.errorType = this._classifyProviderError(error, config);
        console.info(
          "[FlowApiV2/TerminalFailure]",
          JSON.stringify(error.diagnostic),
        );
        throw error;
      }
      for (const output of failedOutputs)
        await window.FlowApiV2CheckpointStore?.remove?.(output.operationId);
      outputs = outputs.filter((output) => !this._isFailed(output));
      for (let index = 0; index < outputs.length; index++) {
        if (!outputs[index].url)
          outputs[index] = await this._resolveOutput(
            item,
            outputs[index],
            config,
            options,
          );
      }
      if (options.abortFn?.()) {
        for (const output of outputs)
          await window.FlowApiV2CheckpointStore?.remove?.(output.operationId);
        item.state = window.QueueItem?.STATE?.CANCELLED || "CANCELLED";
        item._apiWaitingSlot = false;
        return { ok: true, cancelled: true, item };
      }
      if (
        outputs.some((output) => !this._uuid(output.mediaId) || !output.url)
      ) {
        const error = new Error("V2_SCHEMA_DRIFT_RESOLVED_MEDIA");
        error.dispatchStarted = true;
        window.FlowApiDriverResolver?.tripV2?.(error.message, protocolRevision);
        throw error;
      }
      const ids = outputs.map((output) => output.mediaId);
      item.operationId = outputs[0].operationId;
      item.mediaId = outputs[0].mediaId;
      item.flowApiLineage = outputs.map((output) => ({
        attemptId: output.attemptId || item.attemptId || item.id,
        operationId: output.operationId,
        mediaId: output.mediaId,
        state: "completed",
      }));
      item.resultTileIds = ids;
      item.resultFileNames = Object.fromEntries(ids.map((id) => [id, id]));
      item.resultThumbnails = Object.fromEntries(
        outputs.map((output) => [
          output.mediaId,
          {
            thumbnail:
              mediaType === "video"
                ? output.posterUrl || output.url || null
                : output.url || output.posterUrl || null,
            video_url: mediaType === "video" ? output.url || null : null,
            type: mediaType,
            file_name: output.mediaId,
            media_uuid: output.mediaId,
            persistent_media_id: output.mediaId,
            identity_kind: "flow-v2-api-uuid",
            identity_durability: "durable-resolver",
            operation_uuid: output.operationId,
            api_driver: "v2",
            protocol_revision: protocolRevision,
            protocol_fingerprint: protocolFingerprint,
          },
        ]),
      );
      item.resultProviderUrls = Object.fromEntries(
        outputs.map((output) => [
          output.mediaId,
          {
            url: output.url || null,
            durable_url: output.durableUrl || null,
            provider: "flow",
            media_type: mediaType,
            project_id: response.projectId || item.projectId || null,
            media_uuid: output.mediaId,
            operation_uuid: output.operationId,
            persistent_media_id: output.mediaId,
            identity_kind: "flow-v2-api-uuid",
            identity_durability: "durable-resolver",
            api_driver: "v2",
            protocol_revision: protocolRevision,
            protocol_fingerprint: protocolFingerprint,
            captured_at: Date.now(),
          },
        ]),
      );
      item.syncCompletedOutputs?.(ids, item.resultThumbnails);
      if (rejectedRequests.length) {
        const failure = failedOutputs.length
          ? window.FlowApiDriverError.fromFailedOutputs(failedOutputs)
          : null;
        if (failure)
          failure.errorType = this._classifyProviderError(failure, config);
        const reason = failure
          ? window.FlowApiDriverError.displayMessage(failure)
          : null;
        item.error = [
          ...new Set(
            [
              reason,
              ...rejectedRequests
                .filter(
                  (code) =>
                    !failedOutputs.some(
                      (output) =>
                        (output.error || "V2_OPERATION_FAILED") === code,
                    ),
                )
                .map(
                  (code) =>
                    window.FlowApiDriverError?.displayMessage?.({
                      code,
                      errorType: this._classifyProviderError({ code }, config),
                    }) || code,
                ),
            ].filter(Boolean),
          ),
        ].join(" \xB7 ");
        item.errorPolicy = {
          ...item.flowApiFailureDetail,
          code: failure?.code || rejectedRequests[0],
          driver: "v2",
          stage: "terminal",
          dispatchStarted: true,
          ambiguous: false,
          retryable: false,
          providerErrorCodes:
            failure?.providerErrorCodes ||
            item.flowApiFailureDetail?.providerErrorCodes ||
            [],
          failureDetails: failure?.failureDetails || [],
        };
        item.errorType =
          failure?.errorType ||
          this._classifyProviderError(
            {
              code: rejectedRequests[0],
              providerErrorCodes: item.errorPolicy.providerErrorCodes,
            },
            config,
          );
        item.noRetry = true;
        item.syncFailedOutputs?.([], item.error);
      }
      item.tileId = ids[0];
      item.genMode = "api";
      item.completedAt = Date.now();
      item.state = rejectedRequests.length
        ? window.QueueItem?.STATE?.PARTIAL_FAIL || "PARTIAL_FAIL"
        : window.QueueItem?.STATE?.COMPLETED || "COMPLETED";
      for (const output of outputs)
        await window.FlowApiV2CheckpointStore?.remove?.(output.operationId);
      return { ok: true, item };
    }
    static async _pinnedMediaConfig(context = {}) {
      if (!this._uuid(context.mediaId)) throw new Error("V2_MEDIA_ID_INVALID");
      if (context.uuidLookup !== true && !this._uuid(context.operationId))
        throw new Error("V2_OPERATION_ID_MISSING");
      if (!this._uuid(context.projectId))
        throw new Error("V2_PROJECT_ID_MISSING");
      const config =
        await window.ProviderConfigManager?.fetchFlowApiV2Configs?.();
      if (!config) throw new Error("V2_PRIVATE_CONFIG_MISSING");
      const revision = Number(config.protocol?.schema_version || 0);
      const fingerprint =
        window.FlowApiV2CheckpointStore?.fingerprint?.(config) || null;
      if (
        revision !== Number(context.protocolRevision) ||
        !context.protocolFingerprint ||
        fingerprint !== context.protocolFingerprint
      ) {
        throw new Error("V2_PINNED_CONFIG_MISMATCH");
      }
      return config;
    }
    static async checkDownloadReady(context = {}) {
      try {
        const config = await this._pinnedMediaConfig(context);
        if (
          context.requireUpscale &&
          context.mediaType === "video" &&
          (!config.protocol?.rpc?.video_upscale ||
            !config.protocol?.rpc?.catalog_get)
        )
          return { ready: false, reason: "V2_VIDEO_UPSCALE_CONFIG_MISSING" };
        if (
          context.requireUpscale &&
          context.mediaType !== "video" &&
          (!config.protocol?.rpc?.image_upscale ||
            !Number.isInteger(config.schema?.wire?.image_upscale_level_2k) ||
            !Number.isInteger(config.schema?.wire?.image_upscale_level_4k))
        )
          return { ready: false, reason: "V2_IMAGE_UPSCALE_CONFIG_MISSING" };
        if (
          !(await window.BridgeClient?.hasCapability?.(
            context.requireUpscale
              ? context.mediaType === "video"
                ? "flow_v2_upscale_video"
                : "flow_v2_upscale_image"
              : "flow_v2_resolve_media",
          ))
        ) {
          return { ready: false, reason: "V2_BRIDGE_RESOLVE_UNSUPPORTED" };
        }
        return { ready: true };
      } catch (error) {
        return { ready: false, reason: error?.message || "V2_MEDIA_NOT_READY" };
      }
    }
    static async resolveMedia(context = {}) {
      if (context.abortFn?.()) throw new Error("ABORTED");
      const config = await this._pinnedMediaConfig(context);
      if (context.uuidLookup === true) {
        const waitForMaterialization =
          context.mediaType === "video" &&
          context.waitForMaterialization === true;
        const deadline = waitForMaterialization
          ? Date.now() + this._runtimeInteger(config, "mutation_timeout_ms")
          : 0;
        const intervalMs = waitForMaterialization
          ? this._runtimeInteger(config, "poll_interval_ms")
          : 0;
        let attempts = 0;
        while (true) {
          if (context.abortFn?.()) throw new Error("ABORTED");
          const response = await window.BridgeClient.request(
            "flow_v2_resolve_media",
            {
              protocol: config.protocol,
              models: config.models,
              schema: config.schema,
              stateMapping: config.state_mapping,
              runtime: config.runtime,
              mediaId: context.mediaId,
              projectId: context.projectId,
              mediaType: context.mediaType === "video" ? "video" : "image",
              protocolRevision: context.protocolRevision,
              protocolFingerprint: context.protocolFingerprint,
            },
            { abortFn: context.abortFn },
          );
          if (context.abortFn?.()) throw new Error("ABORTED");
          attempts++;
          const output2 = response?.output;
          if (response?.ok) {
            if (
              output2?.mediaId !== context.mediaId ||
              output2?.projectId !== context.projectId
            ) {
              throw new Error("V2_RESOLVE_IDENTITY_MISMATCH");
            }
            if (output2?.url) {
              if (attempts > 1)
                console.info(
                  "[FlowUploadVideoHydration]",
                  JSON.stringify({
                    state: "ready",
                    attempts,
                    hasPoster: !!output2.posterUrl,
                  }),
                );
              return {
                url: output2.url,
                posterUrl: output2.posterUrl || null,
                mediaId: output2.mediaId,
                revoke: false,
              };
            }
          }
          const code = response?.ok
            ? "V2_RESOLVE_URL_PENDING"
            : response?.error || "V2_RESOLVE_FAILED";
          const responseError = !response?.ok
            ? this._responseError(response, config)
            : null;
          const retryableRead =
            waitForMaterialization && responseError?.retryable === true;
          if (
            !waitForMaterialization ||
            (!["SCHEMA_CHANGED", "V2_RESOLVE_URL_PENDING"].includes(code) &&
              !retryableRead)
          ) {
            if (!response?.ok) throw responseError;
            throw new Error("V2_RESOLVE_IDENTITY_MISMATCH");
          }
          if (Date.now() >= deadline) {
            const error = new Error("V2_UPLOAD_VIDEO_MATERIALIZATION_TIMEOUT");
            error.code = "V2_UPLOAD_VIDEO_MATERIALIZATION_TIMEOUT";
            error.diagnostic =
              responseError?.diagnostic || response?.diagnostic || null;
            throw error;
          }
          if (attempts === 1 || retryableRead)
            console.info(
              "[FlowUploadVideoHydration]",
              JSON.stringify({
                state: "waiting",
                attempt: attempts,
                projectBound: !!context.projectId,
                reason: retryableRead ? code : "materializing",
              }),
            );
          const waitUntil = Math.min(deadline, Date.now() + intervalMs);
          while (Date.now() < waitUntil && !context.abortFn?.()) {
            await new Promise((resolve) =>
              setTimeout(resolve, Math.min(250, waitUntil - Date.now())),
            );
          }
        }
      }
      const item = {
        projectId: context.projectId,
        flowApiProtocolRevision: context.protocolRevision,
        flowApiProtocolFingerprint: context.protocolFingerprint,
        flowApiSurface: context.surface || "gen",
        settings: {
          genType: context.mediaType === "video" ? "Video" : "Image",
        },
      };
      const output = await this._resolveOutput(
        item,
        {
          mediaId: context.mediaId,
          operationId: context.operationId,
          projectId: context.projectId,
        },
        config,
        {
          abortFn: context.abortFn,
          skipSessionRecovery: context.downloadSingleAttempt === true,
        },
      );
      return output?.url
        ? { url: output.url, mediaId: output.mediaId, revoke: false }
        : null;
    }
    static async resolveDownload(context = {}) {
      const resolved = await this.resolveMedia(context);
      return resolved
        ? {
            ...resolved,
            base64: null,
            mime: context.mediaType === "video" ? "video/mp4" : null,
          }
        : null;
    }
    static async upscaleImage(context = {}) {
      if (context.abortFn?.()) return { ok: false, error: "ABORTED" };
      const readiness = await this.checkDownloadReady({
        ...context,
        requireUpscale: true,
        mediaType: "image",
      });
      if (!readiness.ready)
        return {
          ok: false,
          error: readiness.reason,
          stage: "pre_dispatch",
          dispatchStarted: false,
        };
      const config = await this._pinnedMediaConfig(context);
      const resolution = String(context.resolution || "").toLowerCase();
      if (!["2k", "4k"].includes(resolution))
        return { ok: false, error: "V2_IMAGE_UPSCALE_RESOLUTION_UNSUPPORTED" };
      if (context.abortFn?.()) return { ok: false, error: "ABORTED" };
      return window.BridgeClient.request(
        "flow_v2_upscale_image",
        {
          protocol: config.protocol,
          models: config.models,
          schema: config.schema,
          stateMapping: config.state_mapping,
          runtime: config.runtime,
          mediaId: context.mediaId,
          projectId: context.projectId,
          operationId: context.operationId,
          protocolRevision: context.protocolRevision,
          protocolFingerprint: context.protocolFingerprint,
          resolution,
        },
        { abortFn: context.abortFn },
      );
    }
    static async upscaleVideo(context = {}) {
      const readiness = await this.checkDownloadReady({
        ...context,
        requireUpscale: true,
        mediaType: "video",
      });
      if (!readiness.ready)
        return {
          ok: false,
          error: readiness.reason,
          stage: "pre_dispatch",
          dispatchStarted: false,
        };
      if (context.abortFn?.()) return { ok: false, error: "ABORTED" };
      const config = await this._pinnedMediaConfig(context);
      const params = {
        protocol: config.protocol,
        models: config.models,
        schema: config.schema,
        stateMapping: config.state_mapping,
        runtime: config.runtime,
        projectId: context.projectId,
        protocolRevision: context.protocolRevision,
        protocolFingerprint: context.protocolFingerprint,
      };
      const timeout = this._runtimeInteger(config, "video_timeout_ms");
      const interval = this._runtimeInteger(config, "poll_interval_ms");
      const receipt = await window.BridgeClient.request(
        "flow_v2_upscale_video",
        {
          ...params,
          mediaId: context.mediaId,
          resolution: String(context.resolution || "").toLowerCase(),
        },
        { abortFn: context.abortFn },
      );
      const upsampledMediaId =
        typeof receipt?.mediaId === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_upsampled$/i.test(
          receipt.mediaId,
        );
      if (!receipt?.ok || !upsampledMediaId)
        return {
          ok: false,
          error: receipt?.error || "V2_UPSCALE_RECEIPT_INVALID",
          stage: receipt?.stage || null,
          ambiguous: receipt?.ambiguous === true,
          dispatchStarted:
            typeof receipt?.dispatchStarted === "boolean"
              ? receipt.dispatchStarted
              : null,
          providerErrorCodes: receipt?.providerErrorCodes || [],
          grpcCode: receipt?.grpcCode,
          grpcReason: receipt?.grpcReason || null,
        };
      const deadline = Date.now() + timeout;
      const read = (method, data) =>
        window.FlowApiDownloadRetry.execute(
          () =>
            window.BridgeClient.request(method, data, {
              abortFn: context.abortFn,
            }),
          {
            action: method,
            driver: "v2",
            delayMs: interval,
            abortFn: () => context.abortFn?.() || Date.now() >= deadline,
            onRetry: () =>
              window.BridgeClient.request("flow_v2_health", {
                ...params,
                surface: "gen",
                mediaType: "video",
              }),
          },
        );
      while (Date.now() < deadline) {
        if (context.abortFn?.())
          return { ok: false, error: "ABORTED", mediaId: receipt.mediaId };
        const poll = await read("flow_v2_poll_operations", {
          ...params,
          operationIds: [receipt.mediaId],
          acceptedOperationIds: [receipt.mediaId],
        });
        if (!poll?.ok)
          return {
            ok: false,
            error: poll?.error || "V2_UPSCALE_POLL_FAILED",
            mediaId: receipt.mediaId,
          };
        const output = poll.outputs?.[0];
        if (
          poll.outputs?.length !== 1 ||
          output?.operationId !== receipt.mediaId
        )
          return { ok: false, error: "V2_UPSCALE_LINEAGE_MISMATCH" };
        if (
          output?.projectId !== context.projectId &&
          !(output?.state === "failed" && output?.projectId === null)
        )
          return { ok: false, error: "V2_UPSCALE_LINEAGE_MISMATCH" };
        if (output.state === "failed") {
          const failureDetail = output.failureDetail || null;
          const isCompactFailure =
            output.compact === true ||
            (output.compact == null &&
              output.projectId === null &&
              output.generationId == null &&
              output.model == null);
          const hasFailureEvidence =
            !!output.grpcReason ||
            (Array.isArray(output.providerErrorCodes) &&
              output.providerErrorCodes.length > 0) ||
            Number.isInteger(output.grpcCode) ||
            Number.isInteger(failureDetail?.statusCode) ||
            !!failureDetail?.message ||
            (typeof output.error === "string" &&
              output.error !== "V2_GENERATION_FAILED" &&
              output.error !== "V2_UPSCALE_FAILED");
          if (!isCompactFailure || hasFailureEvidence) {
            return {
              ok: false,
              error: output.error || "V2_UPSCALE_FAILED",
              mediaId: receipt.mediaId,
              stage: "terminal",
              dispatchStarted: true,
              providerErrorCodes: output.providerErrorCodes || [],
              grpcCode: output.grpcCode ?? failureDetail?.statusCode ?? null,
              grpcReason: output.grpcReason || null,
            };
          }
          console.info(
            "[FlowApiV2Driver] provisional compact upscale state; polling again",
          );
        }
        if (output.state === "completed") {
          const resolved = await read("flow_v2_resolve_media", {
            ...params,
            mediaId: receipt.mediaId,
          });
          if (
            !resolved?.ok ||
            resolved.output?.mediaId !== receipt.mediaId ||
            resolved.output?.projectId !== context.projectId ||
            !resolved.output?.url
          )
            return {
              ok: false,
              error: resolved?.error || "V2_UPSCALE_RESOLVE_FAILED",
            };
          return {
            ok: true,
            videoUrl: resolved.output.url,
            mediaId: receipt.mediaId,
          };
        }
        const waitUntil = Math.min(deadline, Date.now() + interval);
        while (Date.now() < waitUntil && !context.abortFn?.())
          await new Promise((resolve) =>
            setTimeout(resolve, Math.min(250, waitUntil - Date.now())),
          );
      }
      return {
        ok: false,
        error: "V2_UPSCALE_TIMEOUT",
        mediaId: receipt.mediaId,
      };
    }
    static async _drainAccepted(item, initialOutputs, config, options = {}) {
      const byOperation = new Map(
        initialOutputs.map((output) => [output.operationId, { ...output }]),
      );
      const mediaType = /video/i.test(item?.settings?.genType || "")
        ? "video"
        : "image";
      const intervalMs = this._runtimeInteger(config, "poll_interval_ms");
      const maxPollRetries = this._runtimeInteger(
        config,
        "max_retry_attempts",
        0,
      );
      const baseBackoffMs = this._runtimeInteger(config, "base_backoff_ms", 0);
      const maxBackoffMs = this._runtimeInteger(config, "max_backoff_ms", 0);
      const maxSessionRefreshes = this._runtimeInteger(
        config,
        "session_refresh_max_attempts",
        0,
      );
      let sessionRefreshes = 0;
      let consecutivePollErrors = 0;
      let recoveryUiActive = false;
      const deadline = this._operationDeadline(item, config, mediaType);
      if (
        [...byOperation.values()].every(
          (output) => this._isCompleted(output) || this._isFailed(output),
        )
      ) {
        return [...byOperation.values()];
      }
      let pollCount = 0;
      let successfulPollCount = 0;
      let emptyPollCount = 0;
      let lastSuccessfulPollAt = null;
      let lastPollErrorCode = null;
      while (Date.now() < deadline) {
        if (options.abortFn?.()) {
          for (const output of byOperation.values()) {
            await window.FlowApiV2CheckpointStore?.remove?.(output.operationId);
          }
          item.state = window.QueueItem?.STATE?.CANCELLED || "CANCELLED";
          throw Object.assign(new Error("ABORTED"), {
            dispatchStarted: true,
            operationId: byOperation.keys().next().value || null,
            stage: "accepted_poll",
          });
        }
        const pendingIds = [...byOperation.values()]
          .filter(
            (output) => !this._isCompleted(output) && !this._isFailed(output),
          )
          .map((output) => output.operationId);
        if (!pendingIds.length) return [...byOperation.values()];
        pollCount++;
        const response = await this._awaitAcceptedRead(
          () =>
            window.BridgeClient.request(
              "flow_v2_poll_operations",
              {
                protocol: config.protocol,
                models: config.models,
                schema: config.schema,
                stateMapping: config.state_mapping,
                runtime: config.runtime,
                operationIds: pendingIds,
                acceptedOperationIds: pendingIds,
                projectId: item.projectId || null,
                ...this._flowTabPin(item),
                protocolRevision: item.flowApiProtocolRevision,
                protocolFingerprint: item.flowApiProtocolFingerprint,
              },
              { abortFn: () => options.abortFn?.() || Date.now() >= deadline },
            ),
          item,
          deadline,
          options,
          [...byOperation.keys()],
        );
        if (!response?.ok) {
          const code = response?.error || "V2_POLL_FAILED";
          lastPollErrorCode = code;
          const normalized = window.FlowApiDriverError?.normalize?.(
            this._responseError(response, config),
            {
              driver: "v2",
              operationId: pendingIds[0],
              dispatchStarted: true,
              stage: "accepted_poll",
            },
          );
          if (
            normalized?.errorType === "server_unavailable" &&
            consecutivePollErrors < maxPollRetries
          ) {
            consecutivePollErrors += 1;
            const backoffMs =
              Math.min(
                maxBackoffMs,
                baseBackoffMs *
                  Math.pow(2, Math.max(0, consecutivePollErrors - 1)),
              ) ||
              (window.FlowApiDriverError?.isInternalReadFailure?.(normalized)
                ? intervalMs
                : 0);
            options.onRecoveryState?.({
              phase: "poll_retry",
              attempt: consecutivePollErrors,
              maxAttempts: maxPollRetries,
              backoffMs,
              code: normalized.code || code,
            });
            recoveryUiActive = true;
            const retryAt = Math.min(deadline, Date.now() + backoffMs);
            while (!options.abortFn?.() && Date.now() < retryAt) {
              await new Promise((resolve) =>
                setTimeout(resolve, Math.min(250, retryAt - Date.now())),
              );
            }
            continue;
          }
          if (normalized?.retryable === true) {
            if (
              !window.FlowApiDriverError?.isInternalReadFailure?.(normalized) &&
              sessionRefreshes < maxSessionRefreshes
            ) {
              sessionRefreshes += 1;
              options.onRecoveryState?.({
                phase: "reconnecting",
                attempt: sessionRefreshes,
                maxAttempts: maxSessionRefreshes,
                code: normalized.code || code,
              });
              recoveryUiActive = true;
              let recovered = null;
              try {
                recovered = await this._awaitAcceptedRead(
                  () =>
                    window.FlowApiSessionCoordinator?.recoverOperation?.({
                      driver: "v2",
                      surface:
                        options.owner === "workflow"
                          ? "workflow"
                          : options.owner === "task"
                            ? "task"
                            : "gen",
                      mediaType,
                      item,
                      operationId: pendingIds[0],
                      projectId: item.projectId || null,
                      userInitiated: false,
                      recoveryAuthorized: true,
                    }),
                  item,
                  deadline,
                  options,
                  [...byOperation.keys()],
                );
              } catch (error2) {
                if (
                  ["ABORTED", "V2_OPERATION_TIMEOUT"].includes(error2?.message)
                )
                  throw error2;
              }
              if (recovered?.ready === true) {
                consecutivePollErrors = 0;
                continue;
              }
            }
            consecutivePollErrors += 1;
            const exponent = Math.min(
              30,
              Math.max(0, consecutivePollErrors - 1),
            );
            const backoffMs =
              Math.min(maxBackoffMs, baseBackoffMs * Math.pow(2, exponent)) ||
              (window.FlowApiDriverError?.isInternalReadFailure?.(normalized)
                ? intervalMs
                : 0);
            options.onRecoveryState?.({
              phase: "poll_retry",
              attempt: consecutivePollErrors,
              maxAttempts: null,
              backoffMs,
              code: normalized.code || code,
            });
            recoveryUiActive = true;
            const retryAt = Math.min(deadline, Date.now() + backoffMs);
            while (!options.abortFn?.() && Date.now() < retryAt) {
              await new Promise((resolve) =>
                setTimeout(resolve, Math.min(250, retryAt - Date.now())),
              );
            }
            continue;
          }
          options.onRecoveryState?.(null);
          const error = new Error(normalized?.code || code);
          error.dispatchStarted = true;
          error.operationId = pendingIds[0];
          error.stage = "accepted_poll";
          error.retryable = normalized?.retryable === true;
          error.errorType = normalized?.errorType || "unknown";
          error.grpcCode = normalized?.grpcCode;
          error.grpcReason = normalized?.grpcReason;
          error.providerErrorCodes = normalized?.providerErrorCodes;
          error.diagnostic =
            normalized?.diagnostic || response?.diagnostic || null;
          error.failureDetails =
            normalized?.failureDetails || response?.failureDetails || [];
          throw error;
        }
        successfulPollCount++;
        lastSuccessfulPollAt = Date.now();
        lastPollErrorCode = null;
        if (!response.outputs?.length) emptyPollCount++;
        if (recoveryUiActive) {
          consecutivePollErrors = 0;
          recoveryUiActive = false;
          options.onRecoveryState?.(null);
        }
        const checkpointUpdates = [];
        for (const output of response.outputs || []) {
          if (!byOperation.has(output.operationId)) {
            window.FlowApiDriverResolver?.tripV2?.(
              "V2_POLL_LINEAGE_MISMATCH",
              item.flowApiProtocolRevision,
            );
            throw Object.assign(new Error("V2_POLL_LINEAGE_MISMATCH"), {
              dispatchStarted: true,
              diagnostic: { lineageCheck: "poll response identity" },
            });
          }
          const merged = { ...byOperation.get(output.operationId), ...output };
          if (this._isFailed(merged)) {
            const failure = {
              code: merged.error || null,
              grpcReason: merged.grpcReason || null,
              providerErrorCodes: merged.providerErrorCodes || [],
            };
            this._reportQuota(failure, config, options);
            this._reportBotGate(failure, config, options);
          }
          if (this._isFailed(merged))
            console.info(
              "[FlowApiV2/FailedPoll]",
              JSON.stringify({
                operationId: output.operationId,
                state: merged.state,
                rawState: merged.rawState ?? null,
                model: merged.model || null,
                error: merged.error || null,
                failureDetail: merged.failureDetail || null,
                compact: merged.projectId === null,
                wireDiagnostic: response.diagnostic || null,
              }),
            );
          byOperation.set(output.operationId, merged);
          window.FlowApiTelemetry?.emit?.(
            "operation_state_transition",
            {
              itemId: item.id,
              attemptId: item.attemptId || item.id,
              operationId: output.operationId,
              mediaId: merged.mediaId || null,
              driver: "v2",
              state: merged.state || null,
              ...(merged.unknownState === true &&
              Number.isInteger(merged.rawState)
                ? { rawState: merged.rawState }
                : {}),
            },
            {
              dedupeKey: `state:v2:${output.operationId}:${merged.state || "unknown"}:${merged.unknownState === true ? merged.rawState : ""}`,
            },
          );
          window.FlowApiTelemetry?.emit?.(
            "poll_state_changed",
            {
              itemId: item.id,
              attemptId: item.attemptId || item.id,
              operationId: output.operationId,
              mediaId: merged.mediaId || null,
              driver: "v2",
              state: merged.state || null,
            },
            {
              dedupeKey: `poll_state:v2:${output.operationId}:${merged.state || "unknown"}`,
            },
          );
          checkpointUpdates.push({
            operationId: output.operationId,
            patch: { state: merged.state, mediaId: merged.mediaId || null },
          });
        }
        if (window.FlowApiV2CheckpointStore?.updateMany) {
          await window.FlowApiV2CheckpointStore.updateMany(checkpointUpdates);
        } else {
          await Promise.all(
            checkpointUpdates.map(({ operationId, patch }) =>
              window.FlowApiV2CheckpointStore?.update?.(operationId, patch),
            ),
          );
        }
        if (
          [...byOperation.values()].every(
            (output) => this._isCompleted(output) || this._isFailed(output),
          )
        ) {
          return [...byOperation.values()];
        }
        const nextPollAt = Math.min(deadline, Date.now() + intervalMs);
        while (!options.abortFn?.() && Date.now() < nextPollAt) {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.min(250, nextPollAt - Date.now())),
          );
        }
      }
      const unresolved = [...byOperation.values()].filter(
        (output) => !this._isCompleted(output) && !this._isFailed(output),
      );
      const operationTimeout = {
        dispatchedAt: item.flowApiDispatchedAt || null,
        deadlineAt: deadline,
        observedAt: Date.now(),
        pollCount,
        successfulPollCount,
        emptyPollCount,
        lastSuccessfulPollAt,
        lastPollErrorCode,
        unresolvedCount: unresolved.length,
        outputs: [...byOperation.values()]
          .slice(0, 32)
          .map((output) => ({
            operationId: output.operationId,
            state: output.state || null,
            completed: this._isCompleted(output),
            failed: this._isFailed(output),
          })),
      };
      console.info(
        "[FlowApiV2/OperationTimeout]",
        JSON.stringify(operationTimeout),
      );
      throw Object.assign(new Error("V2_OPERATION_TIMEOUT"), {
        dispatchStarted: true,
        operationId: unresolved[0]?.operationId || null,
        stage: "accepted_poll",
        retryable: false,
        diagnostic: { operationTimeout },
      });
    }
    static _reportQuota(error, config, options) {
      const errorType = this._classifyProviderError(error, config);
      if (
        !["quota_exceeded", "per_model_daily", "tier_restricted"].includes(
          errorType,
        ) ||
        options?._apiQuotaReported
      )
        return;
      if (options) options._apiQuotaReported = true;
      try {
        options?.onProviderQuota?.({
          code:
            error?.code ||
            error?.grpcReason ||
            error?.providerErrorCodes?.[0] ||
            null,
          grpcReason: error?.grpcReason || null,
          providerErrorCodes: error?.providerErrorCodes || [],
          errorType,
        });
      } catch (reportError) {
        console.warn(
          "[FlowApiV2] Quota gate callback failed:",
          reportError?.message || reportError,
        );
      }
    }
    static _reportBotGate(error, config, options) {
      const errorType = this._classifyProviderError(error, config);
      if (
        !["bot_detected", "captcha_failed"].includes(errorType) ||
        options?._apiBotReported
      )
        return;
      if (options) options._apiBotReported = true;
      try {
        options?.onProviderBotGate?.({
          code:
            error?.code ||
            error?.grpcReason ||
            error?.providerErrorCodes?.[0] ||
            null,
          grpcReason: error?.grpcReason || null,
          providerErrorCodes: error?.providerErrorCodes || [],
          errorType,
          driver: "v2",
          stage: error?.stage || null,
        });
      } catch (reportError) {
        console.warn(
          "[FlowApiV2] Bot gate callback failed:",
          reportError?.message || reportError,
        );
      }
    }
    static _classifyProviderError(error, config) {
      const candidates = [
        ...(Array.isArray(error?.providerErrorCodes)
          ? error.providerErrorCodes
          : []),
        error?.code,
        error?.grpcReason,
      ].filter((value) => typeof value === "string");
      const mapping =
        config?.error_mapping && typeof config.error_mapping === "object"
          ? config.error_mapping
          : {};
      const entries = Object.entries(mapping).sort(
        (a, b) => b[0].length - a[0].length,
      );
      for (const raw of candidates) {
        const matched = entries.find(
          ([code]) => code && raw.toUpperCase().startsWith(code.toUpperCase()),
        );
        if (matched) {
          const mapped = window.FlowApiAdapter?.classifyError?.("", matched[1]);
          if (mapped && mapped !== "unknown") return mapped;
        }
        const classified = window.FlowApiAdapter?.classifyError?.(raw);
        if (classified && classified !== "unknown") return classified;
      }
      return "unknown";
    }
    static _responseError(response, config) {
      const providerCode = response?.providerErrorCodes?.find?.(
        (code2) =>
          typeof code2 === "string" && /^PUBLIC_ERROR_[A-Z0-9_]+$/.test(code2),
      );
      const grpcReason =
        typeof response?.grpcReason === "string" &&
        /^[A-Z][A-Z0-9_]{2,119}$/.test(response.grpcReason)
          ? response.grpcReason
          : null;
      const code =
        providerCode || grpcReason || response?.error || "V2_REQUEST_FAILED";
      const error = new Error(code);
      error.code = code;
      error.errorType = this._classifyProviderError(
        { code, grpcReason, providerErrorCodes: response?.providerErrorCodes },
        config,
      );
      const policy = window.FlowApiAdapter?.getErrorPolicy?.(error.errorType);
      if (policy?.retryable === true) error.retryable = true;
      error.grpcCode = response?.grpcCode;
      error.grpcReason = response?.grpcReason;
      error.providerErrorCodes = response?.providerErrorCodes;
      error.diagnostic =
        response?.diagnostic && typeof response.diagnostic === "object"
          ? { ...response.diagnostic }
          : null;
      return error;
    }
    static async _resolveOutput(item, output, config, options = {}) {
      if (!this._uuid(output.mediaId)) {
        throw Object.assign(new Error("V2_MEDIA_ID_MISSING"), {
          dispatchStarted: true,
          operationId: output.operationId,
          stage: "accepted_poll",
        });
      }
      const mediaId = output.mediaId;
      const mediaType = /video/i.test(item?.settings?.genType || "")
        ? "video"
        : "image";
      const request = () =>
        window.BridgeClient.request(
          "flow_v2_resolve_media",
          {
            protocol: config.protocol,
            models: config.models,
            schema: config.schema,
            stateMapping: config.state_mapping,
            runtime: config.runtime,
            mediaId,
            operationId: output.operationId,
            projectId: item.projectId || output.projectId || null,
            ...this._flowTabPin(item),
            mediaType,
            protocolRevision: item.flowApiProtocolRevision,
            protocolFingerprint: item.flowApiProtocolFingerprint,
          },
          {
            abortFn: () => options.abortFn?.() || Date.now() >= resolveDeadline,
          },
        );
      const maxReadRetries = this._runtimeInteger(
        config,
        "max_retry_attempts",
        0,
      );
      const baseBackoffMs = this._runtimeInteger(config, "base_backoff_ms", 0);
      const maxBackoffMs = this._runtimeInteger(config, "max_backoff_ms", 0);
      const resolveDeadline = this._operationDeadline(item, config, mediaType);
      let readRetries = 0;
      let sessionRefreshes = 0;
      let recoveryUiActive = false;
      const maxSessionRefreshes =
        options.skipSessionRecovery === true
          ? 0
          : this._runtimeInteger(config, "session_refresh_max_attempts", 0);
      let response = null;
      let normalized = null;
      while (!options.abortFn?.() && Date.now() < resolveDeadline) {
        response = await this._awaitAcceptedRead(
          request,
          item,
          resolveDeadline,
          options,
          [output.operationId],
        );
        normalized = !response?.ok
          ? window.FlowApiDriverError?.normalize?.(
              this._responseError(response, config),
              {
                driver: "v2",
                operationId: output.operationId,
                dispatchStarted: true,
                stage: "accepted_poll",
              },
            )
          : null;
        if (response?.ok || normalized?.retryable !== true) break;
        readRetries += 1;
        if (
          readRetries > maxReadRetries &&
          sessionRefreshes < maxSessionRefreshes &&
          !window.FlowApiDriverError?.isInternalReadFailure?.(normalized)
        ) {
          sessionRefreshes += 1;
          options.onRecoveryState?.({
            phase: "reconnecting",
            attempt: sessionRefreshes,
            maxAttempts: maxSessionRefreshes,
            code: normalized.code || response?.error,
          });
          recoveryUiActive = true;
          try {
            await this._awaitAcceptedRead(
              () =>
                window.FlowApiSessionCoordinator?.recoverOperation?.({
                  driver: "v2",
                  surface: item?.flowApiSurface || "gen",
                  mediaType: /video/i.test(item?.settings?.genType || "")
                    ? "video"
                    : "image",
                  item,
                  operationId: output.operationId,
                  projectId: item.projectId || output.projectId || null,
                  userInitiated: false,
                  recoveryAuthorized: true,
                  operationTerminal: true,
                }),
              item,
              resolveDeadline,
              options,
              [output.operationId],
            );
          } catch (error) {
            if (["ABORTED", "V2_OPERATION_TIMEOUT"].includes(error?.message))
              throw error;
          }
          readRetries = 0;
        } else {
          options.onRecoveryState?.({
            phase: "poll_retry",
            attempt: readRetries,
            maxAttempts: readRetries <= maxReadRetries ? maxReadRetries : null,
            code: normalized.code || response?.error,
          });
          recoveryUiActive = true;
        }
        const exponent = Math.min(30, Math.max(0, readRetries - 1));
        const backoffMs =
          Math.min(maxBackoffMs, baseBackoffMs * Math.pow(2, exponent)) ||
          (window.FlowApiDriverError?.isInternalReadFailure?.(normalized)
            ? this._runtimeInteger(config, "poll_interval_ms")
            : 0);
        const retryAt = Math.min(resolveDeadline, Date.now() + backoffMs);
        while (!options.abortFn?.() && Date.now() < retryAt) {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.min(250, retryAt - Date.now())),
          );
        }
      }
      if (recoveryUiActive) options.onRecoveryState?.(null);
      if (!response?.ok || response.output?.mediaId !== mediaId) {
        const reason = response?.error || "V2_RESOLVE_LINEAGE_MISMATCH";
        if (reason === "V2_RESOLVE_LINEAGE_MISMATCH") {
          window.FlowApiDriverResolver?.tripV2?.(
            reason,
            item.flowApiProtocolRevision,
          );
        }
        const failure = !response?.ok
          ? this._responseError(response, config)
          : Object.assign(new Error(reason), {
              diagnostic: { lineageCheck: "resolved mediaId" },
            });
        throw Object.assign(failure, {
          dispatchStarted: true,
          operationId: output.operationId,
          stage: "accepted_poll",
        });
      }
      window.FlowApiTelemetry?.emit?.(
        "media_resolved",
        {
          itemId: item?.id || null,
          operationId: output.operationId,
          mediaId,
          projectId: item.projectId || output.projectId || null,
          driver: "v2",
          hasUrl: !!response.output?.url,
        },
        { dedupeKey: `resolve:v2:${output.operationId}:${mediaId}` },
      );
      return { ...output, ...response.output, operationId: output.operationId };
    }
    static _isCompleted(output) {
      if (output?.url && !this._isFailed(output)) return true;
      return (
        window.FlowApiV2CheckpointStore?._terminalKind?.(output?.state) ===
        "completed"
      );
    }
    static _isFailed(output) {
      return (
        window.FlowApiV2CheckpointStore?._terminalKind?.(output?.state) ===
        "failed"
      );
    }
  }
  __publicField(FlowApiV2Driver, "_activeMutations", 0);
  __publicField(FlowApiV2Driver, "id", "v2");
  __publicField(FlowApiV2Driver, "_runtimeInFlight", 0);
  __publicField(FlowApiV2Driver, "_runtimeWaiters", []);
  window.FlowApiV2Driver = FlowApiV2Driver;
  if (typeof globalThis !== "undefined")
    globalThis.FlowApiV2Driver = FlowApiV2Driver;
})();
