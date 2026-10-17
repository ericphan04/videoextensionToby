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
class ModelPresentationRegistry {
  static async fetch(force = false) {
    if (this._flight) {
      if (!force) return this._flight;
      try {
        await this._flight;
      } catch (_) {}
    }
    const epoch = this._epoch;
    const task = (async () => {
      const base = window.ApiBaseConfig.get();
      const url = `${base}/provider-models/presentation`;
      const auth = (await chrome.storage.local.get("af_auth")).af_auth;
      const headers = {
        Accept: "application/json",
        "X-Extension-Id": chrome.runtime.id,
        "X-Ext-Version": chrome.runtime.getManifest().version,
        ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
        ...(await RequestSigner.headers("GET", new URL(url).pathname, "")),
      };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8e3);
      try {
        const response = await fetch(url, {
          headers,
          cache: "no-store",
          redirect: "error",
          signal: controller.signal,
        });
        const json = await response.json();
        if (!response.ok || !json.success || !Array.isArray(json.data))
          throw new Error("MODEL_PRESENTATION_UNAVAILABLE");
        if (epoch !== this._epoch)
          throw new Error("MODEL_PRESENTATION_SCOPE_CHANGED");
        this._models = json.data;
        window.eventBus?.emit?.("provider:presentation_updated");
        return this._models;
      } finally {
        clearTimeout(timer);
      }
    })();
    this._flight = task;
    try {
      return await task;
    } finally {
      if (this._flight === task) this._flight = null;
    }
  }
  static getModels(provider, mediaType) {
    return this._models.filter(
      (model) =>
        model.provider === provider &&
        (model.media_type === mediaType ||
          (model.media_type === "both" &&
            ["image", "video"].includes(mediaType)) ||
          (Array.isArray(model.config?.shared_media) &&
            model.config.shared_media.includes(mediaType))),
    );
  }
  static findModel(provider, value) {
    const models = this._models.filter((model) => model.provider === provider);
    const exact = models.find((model) => model.value === value);
    if (exact) return exact;
    const normalize = (input) =>
      typeof input === "string" ? input.trim().toLowerCase() : "";
    const normalized = normalize(value);
    if (!normalized) return null;
    return (
      models.find((model) => normalize(model.value) === normalized) ||
      models.find((model) => normalize(model.name) === normalized) ||
      models.find(
        (model) =>
          Array.isArray(model.config?.dom_aliases) &&
          model.config.dom_aliases.some(
            (alias) => normalize(alias) === normalized,
          ),
      ) ||
      null
    );
  }
  static displayModel(provider, value) {
    return (
      window.ModelRegistry?.findModel?.(provider, value) ||
      this.findModel(provider, value)
    );
  }
  static invalidate() {
    this._epoch++;
    this._models = [];
    this._flight = null;
  }
}
__publicField(ModelPresentationRegistry, "_models", []);
__publicField(ModelPresentationRegistry, "_flight", null);
__publicField(ModelPresentationRegistry, "_epoch", 0);
window.ModelPresentationRegistry = ModelPresentationRegistry;
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.af_auth) return;
    const auth = changes.af_auth;
    if (
      auth.oldValue?.token === auth.newValue?.token &&
      String(auth.oldValue?.user?.id) === String(auth.newValue?.user?.id)
    )
      return;
    ModelPresentationRegistry.invalidate();
    ModelPresentationRegistry.fetch().catch(() => {});
  });
  window.eventBus?.on?.("sse:provider_models_updated", () =>
    ModelPresentationRegistry.fetch(true).catch(() => {}),
  );
} catch (_) {}
