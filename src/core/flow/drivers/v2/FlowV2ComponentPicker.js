(function (root) {
  class FlowV2ComponentPicker {
    constructor(api = {}) {
      this.api = api;
    }
    async list(kind) {
      if (
        !["voice", "character"].includes(kind) ||
        typeof this.api.list !== "function"
      ) {
        return { success: false, error: "V2_COMPONENT_LIST_UNAVAILABLE" };
      }
      return this.api.list(kind);
    }
    async select(kind, name, options = {}) {
      if (
        !["voice", "character"].includes(kind) ||
        !name ||
        typeof this.api.select !== "function"
      ) {
        return { success: false, error: "V2_COMPONENT_SELECT_UNAVAILABLE" };
      }
      return this.api.select(kind, name, options);
    }
    async remove(kind) {
      if (
        !["voice", "character", "image", "video"].includes(kind) ||
        typeof this.api.remove !== "function"
      ) {
        return { success: false, error: "V2_COMPONENT_REMOVE_UNAVAILABLE" };
      }
      return this.api.remove(kind);
    }
    async addRefs(payload = {}) {
      if (typeof this.api.addRefs !== "function")
        return { success: false, error: "V2_REFS_UNVERIFIED" };
      return this.api.addRefs(payload);
    }
    async upload(payload = {}) {
      if (typeof this.api.upload !== "function")
        return { success: false, error: "V2_UPLOAD_UNVERIFIED" };
      return this.api.upload(payload);
    }
  }
  root.FlowV2ComponentPicker = FlowV2ComponentPicker;
})(typeof globalThis !== "undefined" ? globalThis : self);
