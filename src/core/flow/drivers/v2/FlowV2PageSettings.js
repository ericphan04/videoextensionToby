(function (root) {
  class FlowV2PageSettings {
    constructor(api = {}) {
      this.api = api;
    }
    async apply(payload = {}) {
      if (typeof this.api.apply !== "function")
        return { success: false, error: "PAGE_SETTINGS_DRIVER_UNAVAILABLE" };
      return this.api.apply(payload);
    }
  }
  root.FlowV2PageSettings = FlowV2PageSettings;
})(typeof globalThis !== "undefined" ? globalThis : self);
