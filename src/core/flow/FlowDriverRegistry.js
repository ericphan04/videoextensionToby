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
(function (root) {
  class FlowDriverRegistry {
    static _parseV2Path(pathname) {
      const segments = String(pathname || "")
        .split("/")
        .filter(Boolean);
      const projectAt = segments.indexOf("project");
      const prefix = projectAt >= 0 ? segments.slice(0, projectAt) : segments;
      let accountSeen = false;
      let localeSeen = false;
      for (let i = 0; i < prefix.length; i++) {
        if (
          prefix[i] === "u" &&
          !accountSeen &&
          /^\d+$/.test(prefix[i + 1] || "")
        ) {
          accountSeen = true;
          i++;
          continue;
        }
        if (!localeSeen && this.LOCALE_RE.test(prefix[i])) {
          localeSeen = true;
          continue;
        }
        return null;
      }
      if (projectAt < 0) {
        return {
          projectId: null,
          isProjectEditor: false,
          routePrefix: prefix.length ? `/${prefix.join("/")}` : "",
        };
      }
      const projectId = segments[projectAt + 1];
      if (!this.PROJECT_ID_RE.test(projectId || "")) return null;
      return {
        projectId,
        isProjectEditor: segments.length === projectAt + 2,
        routePrefix: prefix.length ? `/${prefix.join("/")}` : "",
      };
    }
    static register(key, factory) {
      if (!Object.prototype.hasOwnProperty.call(this.ORIGINS, key)) {
        throw new TypeError(`Unknown Flow driver key: ${key}`);
      }
      if (typeof factory !== "function")
        throw new TypeError(`Driver factory required for ${key}`);
      this._factories.set(key, factory);
    }
    static keyForUrl(value) {
      try {
        const url = new URL(value);
        if (
          url.origin === this.ORIGINS.flow_v2 &&
          this._parseV2Path(url.pathname)
        )
          return "flow_v2";
      } catch (_) {}
      return null;
    }
    static isProjectEditor(value) {
      try {
        const url = new URL(value);
        return (
          url.origin === this.ORIGINS.flow_v2 &&
          this._parseV2Path(url.pathname)?.isProjectEditor === true
        );
      } catch (_) {
        return false;
      }
    }
    static projectIdForUrl(value) {
      try {
        const url = new URL(value);
        const key = this.keyForUrl(url.href);
        if (!key) return null;
        return key === "flow_v2"
          ? this._parseV2Path(url.pathname)?.projectId || null
          : null;
      } catch (_) {
        return null;
      }
    }
    static describeUrl(value) {
      try {
        const url = new URL(value);
        const driverKey = this.keyForUrl(url.href);
        if (!driverKey) return null;
        const route = this._parseV2Path(url.pathname);
        return {
          driverKey,
          origin: url.origin,
          projectId: route?.projectId || null,
          routePrefix: route?.routePrefix || "",
          isProjectEditor: route?.isProjectEditor === true,
        };
      } catch (_) {
        return null;
      }
    }
    static resolveForUrl(value, options = {}) {
      const context = this.describeUrl(value);
      if (!context) return null;
      const factory = this._factories.get(context.driverKey);
      if (!factory) return { ...context, driver: null };
      return { ...context, driver: factory({ ...options, ...context }) };
    }
  }
  __publicField(
    FlowDriverRegistry,
    "ORIGINS",
    Object.freeze({ flow_v2: "https://flow.google.com" }),
  );
  __publicField(
    FlowDriverRegistry,
    "PROJECT_ID_RE",
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
  __publicField(
    FlowDriverRegistry,
    "LOCALE_RE",
    /^[a-z]{2,3}(?:-[a-z]{2,4})?$/i,
  );
  __publicField(FlowDriverRegistry, "_factories", new Map());
  root.FlowDriverRegistry = FlowDriverRegistry;
})(typeof globalThis !== "undefined" ? globalThis : self);
