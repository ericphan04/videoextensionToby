(function () {
  "use strict";
  class FlowApiFacade {
    static _surface(owner) {
      if (owner === "task") return "task";
      if (owner === "workflow") return "workflow";
      return "gen";
    }
    static async _runtimeGate() {
      const system = window.SystemConfig;
      if (!system?.get)
        return { allowed: false, reason: "SYSTEM_CONFIG_MISSING" };
      try {
        await system.fetch?.();
      } catch (_) {}
      const mode = system.get("flow_api_driver", null);
      if (mode === "disabled")
        return { allowed: false, reason: "SYSTEM_DRIVER_DISABLED" };
      if (!["v1", "v2", "v2_canary", "auto"].includes(mode)) {
        return { allowed: false, reason: "SYSTEM_CONFIG_MISSING" };
      }
      return { allowed: true, mode };
    }
    static async _requireMediaRuntime() {
      const gate = await this._runtimeGate();
      if (gate.allowed) return gate;
      const error = new Error(gate.reason);
      error.code = gate.reason;
      error.stage = "pre_dispatch";
      error.noRetry = true;
      throw error;
    }
    static async prepare(item, options = {}) {
      if (
        item?.flowApiAccepted === true &&
        item?.flowApiDriver &&
        ["v1", "v2"].includes(item.flowApiDriver)
      ) {
        return {
          ok: true,
          driver: item.flowApiDriver,
          mode: item.flowApiMode || null,
          pinned: true,
        };
      }
      const mediaType = /video/i.test(item?.settings?.genType || "")
        ? "video"
        : "image";
      const job = options.job;
      const selection = await window.FlowApiDriverResolver.resolve({
        surface: this._surface(options.owner),
        mediaType,
        item,
        identity: window.authManager?.user?.id || options.clientId || null,
        allowV1Fallback:
          job?._flowApiV1Approval?.projectId === item?.projectId &&
          job?._flowApiV1Approval?.revision ===
            Number(
              window.SystemConfig?.get?.("flow_api_v2_config_revision", null),
            ),
        pinnedDriver: job?._flowApiDriverLock || null,
      });
      if (
        job?._flowApiDriverLock &&
        selection.driver !== job._flowApiDriverLock
      ) {
        return {
          ...selection,
          ok: false,
          reason: "FLOW_API_BATCH_DRIVER_CHANGED",
          noFallback: true,
          noRetry: true,
          requiresV1Connection: false,
          requiresV1Confirmation: false,
        };
      }
      if (selection.requiresV1Confirmation && job && !job._flowApiV1Decision) {
        job._flowApiV1Decision =
          window.FlowApiSessionCoordinator.confirmV1Fallback();
        const confirmed = await job._flowApiV1Decision;
        if (confirmed) {
          job._flowApiV1Approval = {
            projectId: item.projectId,
            revision: selection.settings.revision,
          };
          return this.prepare(item, options);
        }
      } else if (selection.requiresV1Confirmation && job?._flowApiV1Decision) {
        await job._flowApiV1Decision;
        if (
          job._flowApiV1Approval?.projectId === item.projectId &&
          job._flowApiV1Approval?.revision === selection.settings.revision
        ) {
          return this.prepare(item, options);
        }
      }
      if (
        selection.requiresV1Connection === true &&
        item &&
        !["v1", "v2"].includes(selection.mode)
      ) {
        await window.FlowApiSessionCoordinator?.requestV1Connection?.();
      }
      return selection;
    }
    static commitDriver(item, selection, options = {}) {
      const job = options.job;
      if (!job) return;
      if (
        job._flowApiDriverLock &&
        job._flowApiDriverLock !== selection.driver
      ) {
        throw Object.assign(new Error("FLOW_API_BATCH_DRIVER_CHANGED"), {
          code: "FLOW_API_BATCH_DRIVER_CHANGED",
          stage: "pre_dispatch",
          noRetry: true,
        });
      }
      job._flowApiDriverLock = selection.driver;
      job._flowApiEngineLock = "api";
      console.info(
        "[FlowApiRouting/BatchPinned]",
        JSON.stringify({
          jobId: job.id || item.jobId,
          itemId: item.id,
          driver: selection.driver,
          revision: selection.settings?.revision || null,
        }),
      );
    }
    static async submit(item, options = {}) {
      const selected =
        item?.flowApiAccepted === true && item?.flowApiDriver
          ? { ok: true, driver: item.flowApiDriver, pinned: true }
          : await this.prepare(item, options);
      if (!selected.ok || !["v1", "v2"].includes(selected.driver)) {
        throw (
          window.FlowApiDriverError?.normalize?.(
            Object.assign(
              new Error(selected.reason || "FLOW_API_DRIVER_NOT_READY"),
              {
                code: selected.reason || "FLOW_API_DRIVER_NOT_READY",
                stage: selected.stage || "pre_dispatch",
                diagnostic: selected.health?.diagnostic || null,
                failureDetails: selected.failureDetails || [],
                grpcCode: selected.health?.grpcCode,
                grpcReason: selected.health?.grpcReason,
                providerErrorCodes: selected.health?.providerErrorCodes,
              },
            ),
            {
              driver: selected.driver,
              stage: selected.stage || "pre_dispatch",
            },
          ) || new Error(selected.reason || "FLOW_API_DRIVER_NOT_READY")
        );
      }
      item.flowApiCandidateDriver = selected.driver;
      item.flowApiCandidateMode = selected.mode || null;
      item.flowApiCandidateProtocolRevision =
        selected.driver === "v2" ? Number(selected.settings?.revision || 1) : 1;
      if (
        selected.driver === "v2" &&
        Number.isInteger(selected.health?.flowTabId) &&
        selected.health.flowTabId >= 0
      ) {
        item.flowApiTabId = selected.health.flowTabId;
      }
      const driver =
        selected.driver === "v2"
          ? window.FlowApiV2Driver
          : window.FlowApiV1Driver;
      if (!driver?.submit)
        throw new Error(
          `FLOW_API_${selected.driver.toUpperCase()}_DRIVER_MISSING`,
        );
      item.flowApiAttemptedDrivers = [
        ...new Set(
          [
            ...(Array.isArray(item.flowApiAttemptedDrivers)
              ? item.flowApiAttemptedDrivers
              : []),
            selected.driver,
          ].filter((value) => value === "v1" || value === "v2"),
        ),
      ];
      try {
        return await driver.submit(item, { ...options, selection: selected });
      } catch (error) {
        if (
          selected.driver === "v2" &&
          [
            "TRANSPORT_FAILED",
            "REQUEST_TIMEOUT",
            "BRIDGE_REQUEST_TIMEOUT",
            "BRIDGE_CHANNEL_CLOSED",
            "EMPTY_RESPONSE",
            "V2_PAGE_RELAY_UNAVAILABLE",
            "V2_PAGE_COMMAND_TIMEOUT",
            "V2_PAGE_RELOADING",
            "V2_CONTENT_SCRIPT_RECOVERING",
          ].includes(error?.code || error?.message)
        ) {
          window.FlowApiDriverResolver?.invalidate?.();
        }
        if (
          error?.code === "FLOW_API_DRIVER_CHANGED_BEFORE_DISPATCH" &&
          item?.flowApiAccepted !== true &&
          Number(options._driverReselectCount || 0) < 3
        ) {
          return await this.submit(item, {
            ...options,
            _driverReselectCount: Number(options._driverReselectCount || 0) + 1,
          });
        }
        throw (
          window.FlowApiDriverError?.normalize?.(error, {
            driver: selected.driver,
            operationId: item?.operationId || item?.flowOperationId || null,
            dispatchStarted:
              error?.dispatchStarted === true || item?.flowApiAccepted === true,
          }) || error
        );
      } finally {
        item.flowApiCandidateDriver = null;
        item.flowApiCandidateMode = null;
        item.flowApiCandidateProtocolRevision = null;
      }
    }
    static _mediaContext(input = {}) {
      const providerData =
        input.providerData && typeof input.providerData === "object"
          ? input.providerData
          : {};
      const thumbnail =
        input.thumbnail && typeof input.thumbnail === "object"
          ? input.thumbnail
          : {};
      const directDriver =
        input.apiDriver ||
        input.api_driver ||
        input.flowApiDriver ||
        providerData.api_driver ||
        thumbnail.api_driver ||
        null;
      let driver = ["v1", "v2"].includes(directDriver) ? directDriver : null;
      const legacyV1 =
        !driver &&
        window.SystemConfig?.get?.("flow_api_driver", null) !== "v2" &&
        (input.provider || providerData.provider) === "flow" &&
        (input.identityKind ||
          input.identity_kind ||
          providerData.identity_kind ||
          thumbnail.identity_kind) === "flow-api-uuid" &&
        !input.operationId &&
        !input.operation_uuid &&
        !providerData.operation_uuid;
      if (legacyV1) driver = "v1";
      return {
        ...providerData,
        ...input,
        mediaId:
          providerData.media_uuid ||
          input.media_uuid ||
          thumbnail.media_uuid ||
          input.mediaId,
        apiDriver: driver,
        protocolRevision:
          Number(
            input.protocolRevision ||
              input.protocol_revision ||
              providerData.protocol_revision ||
              thumbnail.protocol_revision ||
              0,
          ) || null,
        protocolFingerprint:
          input.protocolFingerprint ||
          input.protocol_fingerprint ||
          providerData.protocol_fingerprint ||
          thumbnail.protocol_fingerprint ||
          null,
        operationId:
          input.operationId ||
          input.operation_uuid ||
          providerData.operation_uuid ||
          thumbnail.operation_uuid ||
          null,
        projectId:
          input.projectId ||
          input.project_id ||
          providerData.project_id ||
          thumbnail.project_id ||
          null,
      };
    }
    static _mediaDriver(input = {}) {
      const context = this._mediaContext(input);
      const driver =
        context.apiDriver === "v2"
          ? window.FlowApiV2Driver
          : context.apiDriver === "v1"
            ? window.FlowApiV1Driver
            : null;
      return { context, driver };
    }
    static async checkDownloadReady(input = {}) {
      const runtime = await this._runtimeGate();
      if (!runtime.allowed) return { ready: false, reason: runtime.reason };
      const { context, driver } = this._mediaDriver(input);
      if (!driver?.checkDownloadReady) {
        return {
          ready: false,
          reason: context.apiDriver
            ? `FLOW_API_${context.apiDriver.toUpperCase()}_DRIVER_MISSING`
            : "FLOW_API_MEDIA_PROVENANCE_MISSING",
        };
      }
      try {
        return await window.FlowApiDownloadRetry.execute(
          async () => {
            await this._requireMediaRuntime();
            const result = await driver.checkDownloadReady(context);
            if (!result?.ready)
              return {
                ...result,
                ok: false,
                error: result?.reason || "FLOW_DOWNLOAD_NOT_READY",
              };
            return result;
          },
          {
            action: "download_preflight",
            driver: context.apiDriver,
            abortFn: context.abortFn,
            onRetry: () => this._refreshDownloadTransport(context),
          },
        );
      } catch (error) {
        return {
          ready: false,
          reason: error.code || error.error || error.message,
        };
      }
    }
    static async resolveMedia(input = {}) {
      await this._requireMediaRuntime();
      const { context, driver } = this._mediaDriver(input);
      if (!driver?.resolveMedia)
        throw new Error(
          context.apiDriver
            ? `FLOW_API_${context.apiDriver.toUpperCase()}_DRIVER_MISSING`
            : "FLOW_API_MEDIA_PROVENANCE_MISSING",
        );
      return driver.resolveMedia(context);
    }
    static async resolveDownload(input = {}) {
      await this._requireMediaRuntime();
      const { context, driver } = this._mediaDriver(input);
      if (!driver?.resolveDownload)
        throw new Error(
          context.apiDriver
            ? `FLOW_API_${context.apiDriver.toUpperCase()}_DRIVER_MISSING`
            : "FLOW_API_MEDIA_PROVENANCE_MISSING",
        );
      return window.FlowApiDownloadRetry.execute(
        async () => {
          await this._requireMediaRuntime();
          return driver.resolveDownload({
            ...context,
            downloadSingleAttempt: true,
          });
        },
        {
          action: "resolve_download",
          driver: context.apiDriver,
          abortFn: context.abortFn,
          requirePayload: true,
          onRetry: () => this._refreshDownloadTransport(context),
        },
      );
    }
    static async _refreshDownloadTransport(context) {
      await this._requireMediaRuntime();
      window.BridgeClient?.invalidate?.();
      if (context.apiDriver !== "v2" || !context.projectId) return;
      const config = await window.FlowApiV2Driver._pinnedMediaConfig(context);
      await window.BridgeClient.request("flow_v2_health", {
        protocol: config.protocol,
        models: config.models,
        schema: config.schema,
        stateMapping: config.state_mapping,
        runtime: config.runtime,
        projectId: context.projectId,
        surface: context.surface || "gen",
        mediaType: context.mediaType,
        protocolRevision: context.protocolRevision,
        protocolFingerprint: context.protocolFingerprint,
      });
    }
    static async upscaleImage(input = {}) {
      const runtime = await this._runtimeGate();
      if (!runtime.allowed)
        return {
          ok: false,
          error: runtime.reason,
          stage: "pre_dispatch",
          noRetry: true,
        };
      const { context, driver } = this._mediaDriver(input);
      if (!driver?.upscaleImage)
        return {
          ok: false,
          error: context.apiDriver
            ? `FLOW_API_${context.apiDriver.toUpperCase()}_DRIVER_MISSING`
            : "FLOW_API_MEDIA_PROVENANCE_MISSING",
        };
      return window.FlowApiDownloadRetry.execute(
        async () => {
          await this._requireMediaRuntime();
          return driver.upscaleImage(context);
        },
        {
          action: "upscale_image",
          driver: context.apiDriver,
          abortFn: context.abortFn,
          mutation: true,
          onRetry: () => this._refreshDownloadTransport(context),
        },
      );
    }
    static async upscaleVideo(input = {}) {
      const runtime = await this._runtimeGate();
      if (!runtime.allowed)
        return {
          ok: false,
          error: runtime.reason,
          stage: "pre_dispatch",
          noRetry: true,
        };
      const { context, driver } = this._mediaDriver(input);
      if (!driver?.upscaleVideo)
        return {
          ok: false,
          error: context.apiDriver
            ? `FLOW_API_${context.apiDriver.toUpperCase()}_DRIVER_MISSING`
            : "FLOW_API_MEDIA_PROVENANCE_MISSING",
        };
      return window.FlowApiDownloadRetry.execute(
        async () => {
          await this._requireMediaRuntime();
          return driver.upscaleVideo(context);
        },
        {
          action: "upscale_video",
          driver: context.apiDriver,
          abortFn: context.abortFn,
          mutation: true,
          onRetry: () => this._refreshDownloadTransport(context),
        },
      );
    }
  }
  window.FlowApiFacade = FlowApiFacade;
  if (typeof globalThis !== "undefined")
    globalThis.FlowApiFacade = FlowApiFacade;
})();
