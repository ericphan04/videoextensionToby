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
const _ConfigRequiredError = class _ConfigRequiredError extends Error {
  constructor(configKey, context = "", metadata = {}) {
    const message = context
      ? `CONFIG_REQUIRED: ${configKey} (${context})`
      : `CONFIG_REQUIRED: ${configKey}`;
    super(message);
    this.name = "ConfigRequiredError";
    this.configKey = configKey;
    this.context = context;
    this.code = metadata.code || null;
    this.httpStatus = metadata.httpStatus ?? null;
    this.accessDenied = metadata.accessDenied === true;
    if (_ConfigRequiredError._DEBUG) {
      console.debug(
        `[ConfigRequiredError] \u26A0 Created: ${configKey} (${context || "no context"})`,
      );
    }
  }
  static is(err) {
    return (
      err instanceof _ConfigRequiredError || err?.name === "ConfigRequiredError"
    );
  }
};
__publicField(_ConfigRequiredError, "_DEBUG", true);
let ConfigRequiredError = _ConfigRequiredError;
if (typeof window !== "undefined") {
  window.ConfigRequiredError = ConfigRequiredError;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = ConfigRequiredError;
}
