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
class ProviderRegistry {
  static register(adapter) {
    if (!adapter || !adapter.key) {
      console.warn("[ProviderRegistry] adapter missing key, skip register");
      return;
    }
    this._adapters.set(adapter.key, adapter);
  }
  static get(key) {
    return this._adapters.get(key) || this._adapters.get("flow");
  }
  static getAll() {
    return Array.from(this._adapters.values());
  }
  static getAvailable() {
    return this.getAll().filter((a) => {
      try {
        return a.isEnabled();
      } catch (e) {
        console.warn(
          "[ProviderRegistry] isEnabled throw for",
          a?.key,
          e?.message || e,
        );
        return false;
      }
    });
  }
  static bootstrap() {
    if (this._initialized) return;
    if (window.FlowAdapter) {
      try {
        this.register(new window.FlowAdapter());
      } catch (e) {
        console.warn(
          "[ProviderRegistry] FlowAdapter init error:",
          e?.message || e,
        );
      }
    }
    if (window.ChatGPTAdapter) {
      try {
        this.register(new window.ChatGPTAdapter());
      } catch (e) {
        console.warn(
          "[ProviderRegistry] ChatGPTAdapter init error:",
          e?.message || e,
        );
      }
    }
    if (window.GrokAdapter) {
      try {
        if (!this._adapters.has("grok")) {
          this.register(new window.GrokAdapter());
        }
      } catch (e) {
        console.warn(
          "[ProviderRegistry] GrokAdapter init error:",
          e?.message || e,
        );
      }
    }
    if (window.GeminiAdapter) {
      try {
        this.register(new window.GeminiAdapter());
      } catch (e) {
        console.warn(
          "[ProviderRegistry] GeminiAdapter init error:",
          e?.message || e,
        );
      }
    }
    if (window.MuseAdapter) {
      try {
        this.register(new window.MuseAdapter());
      } catch (e) {
        console.warn(
          "[ProviderRegistry] MuseAdapter init error:",
          e?.message || e,
        );
      }
    }
    this._initialized = true;
    console.log(
      "[ProviderRegistry] Bootstrap done, adapters:",
      this.getAll().map((a) => a.key),
    );
  }
}
__publicField(ProviderRegistry, "_adapters", new Map());
__publicField(ProviderRegistry, "_initialized", false);
window.ProviderRegistry = ProviderRegistry;
if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    () => ProviderRegistry.bootstrap(),
    { once: true },
  );
} else {
  setTimeout(() => ProviderRegistry.bootstrap(), 0);
}
