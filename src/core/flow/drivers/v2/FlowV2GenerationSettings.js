(function (root) {
  class FlowV2GenerationSettings {
    constructor(api = {}) {
      this.api = api;
    }
    async apply(payload) {
      if (typeof this.api.apply !== "function")
        return { success: false, error: "SETTINGS_DRIVER_UNAVAILABLE" };
      return this.api.apply(payload);
    }
  }
  root.FlowV2GenerationSettings = FlowV2GenerationSettings;
})(typeof globalThis !== "undefined" ? globalThis : self);
