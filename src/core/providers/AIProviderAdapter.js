class AIProviderAdapter {
  constructor() {
    this.key = "";
    this.displayName = "";
    this.featureKey = "";
    this.executionAction = "";
  }
  get capabilities() {
    return {
      supportsRatio: false,
      supportsQuantity: false,
      supportsVideo: false,
      supportsRefImage: false,
      supportsAutoDownload: false,
      supportsHumanized: false,
      maxRefImages: 0,
    };
  }
  async ensureReady() {
    throw new Error("AIProviderAdapter.ensureReady is abstract");
  }
  async submit() {
    throw new Error("AIProviderAdapter.submit is abstract");
  }
  async uploadRef() {
    throw new Error("AIProviderAdapter.uploadRef is abstract");
  }
  async cancel() {}
  async getPromptPrefix() {
    return "";
  }
  isEnabled() {
    if (!window.featureGate) return true;
    try {
      return !!window.featureGate.canUse(this.featureKey);
    } catch (e) {
      console.warn("[AIProviderAdapter] isEnabled error:", e?.message || e);
      return false;
    }
  }
}
window.AIProviderAdapter = AIProviderAdapter;
