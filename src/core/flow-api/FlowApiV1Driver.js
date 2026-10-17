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
  class FlowApiV1Driver {
    static async checkReady({ item } = {}) {
      if (!window.FlowApiAdapter)
        return { ready: false, reason: "V1_ADAPTER_MISSING" };
      if (!item) return { ready: true };
      if (
        item?.settings?.voice?.search_value ||
        item?.settings?.character?.search_value ||
        window.MentionParser?.hasComponents?.(item?.prompt || "")
      ) {
        return { ready: false, reason: "V1_COMPONENT_INPUT_UNSUPPORTED" };
      }
      const isVideo = /video/i.test(item?.settings?.genType || "");
      if (
        (window.FlowApiAdapter._declaredRefVideoIds?.(item)?.length || 0) > 0 &&
        !isVideo
      ) {
        return { ready: false, reason: "V1_VIDEO_REF_FOR_IMAGE_UNSUPPORTED" };
      }
      if (isVideo) {
        if (!window.FlowApiAdapter._videoRatio?.(item?.settings?.ratio)) {
          return { ready: false, reason: "V1_VIDEO_RATIO_UNSUPPORTED" };
        }
        const quantity = Math.max(
          1,
          parseInt(item?.settings?.quantity, 10) || 1,
        );
        if (quantity > 1)
          return { ready: false, reason: "V1_VIDEO_QUANTITY_UNSUPPORTED" };
        if (window.FlowApiAdapter.canResolveVideoKey?.(item) !== true) {
          return { ready: false, reason: "V1_VIDEO_MODEL_MODE_UNSUPPORTED" };
        }
      } else if (!window.FlowApiAdapter._imageRatio?.(item?.settings?.ratio)) {
        return { ready: false, reason: "V1_IMAGE_RATIO_UNSUPPORTED" };
      }
      const declaredRefs = item?.refFileIds?.length || 0;
      if (declaredRefs > 0) {
        const resolution = window.FlowApiAdapter._resolveRefs?.(item);
        if (!resolution || resolution.resolved?.length !== declaredRefs) {
          return { ready: false, reason: "V1_REFERENCE_IDENTITY_UNRESOLVED" };
        }
      }
      return { ready: true };
    }
    static submit(item, options = {}) {
      let dispatchSelection = options.selection || null;
      const commit = () => {
        item.flowApiDriver = "v1";
        item.flowApiMode = dispatchSelection?.mode || item.flowApiMode || null;
        item.flowApiProtocolRevision = 1;
        item.flowApiAccepted = true;
      };
      return window.FlowApiAdapter.submit(item, {
        ...options,
        onDispatchStarted: async () => {
          while (options.isPausedFn?.() && !options.abortFn?.()) {
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
          if (options.abortFn?.()) throw new Error("ABORTED");
          const latest = await window.FlowApiFacade?.prepare?.(item, options);
          while (options.isPausedFn?.() && !options.abortFn?.()) {
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
          if (options.abortFn?.()) throw new Error("ABORTED");
          if (!latest?.ok || latest.driver !== "v1") {
            const error = new Error(
              latest?.reason || "FLOW_API_DRIVER_CHANGED_BEFORE_DISPATCH",
            );
            error.code = "FLOW_API_DRIVER_CHANGED_BEFORE_DISPATCH";
            throw error;
          }
          dispatchSelection = latest;
          window.FlowApiFacade.commitDriver(item, latest, options);
          window.FlowApiTelemetry?.emit?.(
            "commit_boundary",
            {
              itemId: item.id,
              attemptId: item.attemptId || item.id,
              driver: "v1",
              surface: options.owner || "gen",
            },
            { dedupe: false },
          );
          window.FlowApiTelemetry?.emit?.(
            "submit_started",
            {
              itemId: item.id,
              attemptId: item.attemptId || item.id,
              driver: "v1",
              surface: options.owner || "gen",
            },
            { dedupeKey: `submit_started:v1:${item.attemptId || item.id}` },
          );
          commit();
          try {
            options.onDispatchStarted?.();
          } catch (_) {}
        },
      });
    }
    static async checkDownloadReady(options = {}) {
      if (!window.FlowApiAdapter?.checkDownloadReady) {
        return Promise.resolve({ ready: false, reason: "V1_ADAPTER_MISSING" });
      }
      const gate = await window.FlowApiAdapter.checkDownloadReady(options);
      if (!gate?.ready) return gate;
      const status = await window.BridgeClient?.request?.("get_status");
      return status?.ok && status.tokenReady
        ? gate
        : { ready: false, reason: status?.error || "FLOW_TOKEN_NOT_READY" };
    }
    static resolveMedia({ mediaId, mediaType = "video" } = {}) {
      if (!window.FlowApiAdapter?.resolveMediaUrl) return Promise.resolve(null);
      return window.FlowApiAdapter.resolveMediaUrl(mediaId, mediaType);
    }
    static resolveDownload({ mediaId, mediaType = "image" } = {}) {
      if (!window.FlowApiAdapter?.resolveMediaDownload)
        return Promise.resolve(null);
      return window.FlowApiAdapter.resolveMediaDownload(mediaId, mediaType, {
        singleAttempt: true,
      });
    }
    static upscaleImage({ mediaId, resolution, abortFn, projectId } = {}) {
      if (!window.FlowApiAdapter?.upscaleImage)
        return Promise.resolve({ ok: false, error: "V1_ADAPTER_MISSING" });
      return window.FlowApiAdapter.upscaleImage(
        mediaId,
        resolution,
        abortFn,
        projectId,
      );
    }
    static upscaleVideo({
      mediaId,
      ratio,
      resolution,
      abortFn,
      projectId,
    } = {}) {
      if (!window.FlowApiAdapter?.upscaleVideo)
        return Promise.resolve({ ok: false, error: "V1_ADAPTER_MISSING" });
      return window.FlowApiAdapter.upscaleVideo(
        mediaId,
        ratio,
        resolution,
        abortFn,
        projectId,
      );
    }
  }
  __publicField(FlowApiV1Driver, "id", "v1");
  window.FlowApiV1Driver = FlowApiV1Driver;
  if (typeof globalThis !== "undefined")
    globalThis.FlowApiV1Driver = FlowApiV1Driver;
})();
