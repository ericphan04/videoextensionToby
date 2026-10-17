(function (root) {
  class FlowV2TileResolver {
    constructor(api = {}) {
      this.api = api;
    }
    enumerate(operationId = null) {
      const selector = this.api.getTileSelector?.();
      if (!selector)
        return { success: false, error: "TILE_PROFILE_MISSING", tiles: [] };
      return {
        success: true,
        tiles: Array.from(document.querySelectorAll(selector))
          .map((tile) => this.api.extractRecord?.(tile, operationId))
          .filter(Boolean),
      };
    }
  }
  root.FlowV2TileResolver = FlowV2TileResolver;
})(typeof globalThis !== "undefined" ? globalThis : self);
