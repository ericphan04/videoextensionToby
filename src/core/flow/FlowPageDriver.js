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
(function (root) {
  const _FlowPageDriver = class _FlowPageDriver {
    constructor({ key, origin, implementation = {}, capabilities = {} } = {}) {
      if (!key || !origin)
        throw new TypeError("FlowPageDriver requires key and origin");
      this.key = key;
      this.origin = origin;
      this.implementation = implementation;
      this.capabilities = Object.freeze({ ...capabilities });
    }
    supports(operation) {
      return typeof this.implementation?.[operation] === "function";
    }
    async invoke(operation, payload = {}) {
      if (this.key === "flow_legacy")
        return this.failure(
          "FLOW_LEGACY_GENERATION_DISABLED",
          "FLOW_LEGACY_GENERATION_DISABLED",
        );
      if (
        this.key === "flow_v2" &&
        typeof location !== "undefined" &&
        operation !== "getProjectContext" &&
        !globalThis.FlowDriverRegistry?.isProjectEditor(location.href)
      ) {
        return this.failure("FLOW_PROJECT_REQUIRED", "FLOW_PROJECT_REQUIRED");
      }
      if (!_FlowPageDriver.OPERATIONS.includes(operation)) {
        return this.failure(
          "UNKNOWN_OPERATION",
          `Unknown Flow driver operation: ${operation}`,
        );
      }
      const handler = this.implementation?.[operation];
      if (typeof handler !== "function") {
        return this.failure(
          "UNSUPPORTED_OPERATION",
          `${this.key} does not implement ${operation}`,
        );
      }
      try {
        return await handler(payload);
      } catch (error) {
        return this.failure(
          "DRIVER_OPERATION_FAILED",
          error?.message || String(error),
        );
      }
    }
    failure(code, message, details = null) {
      return {
        success: false,
        error: code,
        message,
        driverKey: this.key,
        details,
      };
    }
    static mediaRecord(input = {}) {
      const durability = ["durable", "session", "element-local"].includes(
        input.durability,
      )
        ? input.durability
        : "element-local";
      return {
        runtimeId: input.runtimeId || null,
        persistentMediaId: input.persistentMediaId || null,
        displayName: input.displayName || null,
        operationId: input.operationId || null,
        mediaType: input.mediaType === "video" ? "video" : "image",
        projectId: input.projectId || null,
        resultUrl: input.resultUrl || null,
        thumbnailUrl: input.thumbnailUrl || null,
        urlKind: input.urlKind || null,
        capturedAt: Number.isFinite(input.capturedAt)
          ? input.capturedAt
          : Date.now(),
        origin: input.origin || null,
        driverKey: input.driverKey || null,
        status: input.status || "unknown",
        durability,
        observationKey: input.observationKey || input.runtimeId || null,
      };
    }
  };
  __publicField(
    _FlowPageDriver,
    "OPERATIONS",
    Object.freeze([
      "getProjectContext",
      "prepareForGeneration",
      "getEditor",
      "clearEditor",
      "insertText",
      "submit",
      "applyGenerationSettings",
      "applyPageSettings",
      "enumerateTiles",
      "getTileStatuses",
      "waitForNewTiles",
      "scanMedia",
      "listComponents",
      "selectComponent",
      "addRefs",
      "removeRefs",
      "upload",
      "download",
      "preflight",
    ]),
  );
  let FlowPageDriver = _FlowPageDriver;
  root.FlowPageDriver = FlowPageDriver;
})(typeof globalThis !== "undefined" ? globalThis : self);
