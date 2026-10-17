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
class ApiBaseConfig {
  static get() {
    return window.authManager?.apiBaseUrl || this.DEFAULT;
  }
  static getWebBase() {
    return this.get().replace(/\/api\/v\d+\/?$/, "");
  }
}
__publicField(ApiBaseConfig, "DEFAULT", "https://labs.toby.vn/api/v1");
window.ApiBaseConfig = ApiBaseConfig;
