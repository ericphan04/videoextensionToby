(function (root) {
  class FlowV2MediaMenu {
    constructor(api = {}) {
      this.api = api;
    }
    async download(payload = {}) {
      if (typeof this.api.download !== "function")
        return { success: false, error: "DOWNLOAD_DRIVER_UNAVAILABLE" };
      return this.api.download(payload);
    }
  }
  root.FlowV2MediaMenu = FlowV2MediaMenu;
})(typeof globalThis !== "undefined" ? globalThis : self);
