class DomSelectorHelper {
  static querySelector(root, selectors, options = {}) {
    if (!root) return null;
    const list = Array.isArray(selectors) ? selectors : [selectors];
    for (let i = 0; i < list.length; i++) {
      const sel = list[i];
      if (!sel) continue;
      try {
        const el = root.querySelector(sel);
        if (el && this._matchesText(el, options.textMatch)) {
          if (options.debug) {
            console.log(`[DomSelectorHelper] Found with tier ${i + 1}: ${sel}`);
          }
          return el;
        }
      } catch (e) {
        console.warn("[DomSelectorHelper] Invalid selector:", sel, e.message);
      }
    }
    if (options.reportFailure !== false && options.provider && options.key) {
      if (window.ProviderConfigManager) {
        window.ProviderConfigManager.reportFailure(
          options.provider,
          options.key,
          list,
        );
      }
    }
    return null;
  }
  static querySelectorAll(root, selectors, options = {}) {
    if (!root) return [];
    const list = Array.isArray(selectors) ? selectors : [selectors];
    for (let i = 0; i < list.length; i++) {
      const sel = list[i];
      if (!sel) continue;
      try {
        const nodeList = root.querySelectorAll(sel);
        if (nodeList.length > 0) {
          const arr = Array.from(nodeList);
          if (options.textMatch) {
            const filtered = arr.filter((el) =>
              this._matchesText(el, options.textMatch),
            );
            if (filtered.length > 0) {
              if (options.debug) {
                console.log(
                  `[DomSelectorHelper] Found ${filtered.length} elements with tier ${i + 1}: ${sel}`,
                );
              }
              return filtered;
            }
          } else {
            if (options.debug) {
              console.log(
                `[DomSelectorHelper] Found ${arr.length} elements with tier ${i + 1}: ${sel}`,
              );
            }
            return arr;
          }
        }
      } catch (e) {
        console.warn("[DomSelectorHelper] Invalid selector:", sel, e.message);
      }
    }
    if (options.reportFailure !== false && options.provider && options.key) {
      if (window.ProviderConfigManager) {
        window.ProviderConfigManager.reportFailure(
          options.provider,
          options.key,
          list,
        );
      }
    }
    return [];
  }
  static async query(root, provider, key, options = {}) {
    const config = await window.ProviderConfigManager?.get(provider, key);
    if (!config) return null;
    return this.querySelector(root, config.selectors, {
      textMatch: config.text_match,
      provider,
      key,
      ...options,
    });
  }
  static async queryAll(root, provider, key, options = {}) {
    const config = await window.ProviderConfigManager?.get(provider, key);
    if (!config) return [];
    return this.querySelectorAll(root, config.selectors, {
      textMatch: config.text_match,
      provider,
      key,
      ...options,
    });
  }
  static async queryAttribute(root, provider, key, options = {}) {
    const config = await window.ProviderConfigManager?.get(provider, key);
    if (!config) return null;
    const el = this.querySelector(root, config.selectors, {
      textMatch: config.text_match,
      provider,
      key,
      ...options,
    });
    if (!el) return null;
    return config.attribute
      ? el.getAttribute(config.attribute)
      : el.textContent;
  }
  static querySync(root, provider, key, options = {}) {
    const defaults = window.ProviderConfigManager?._DEFAULTS?.[provider]?.[key];
    if (!defaults) return null;
    return this.querySelector(root, defaults.selectors, {
      textMatch: defaults.text_match,
      provider,
      key,
      ...options,
    });
  }
  static queryAllSync(root, provider, key, options = {}) {
    const defaults = window.ProviderConfigManager?._DEFAULTS?.[provider]?.[key];
    if (!defaults) return [];
    return this.querySelectorAll(root, defaults.selectors, {
      textMatch: defaults.text_match,
      provider,
      key,
      ...options,
    });
  }
  static _matchesText(el, textMatch) {
    if (!textMatch) return true;
    const list = (
      Array.isArray(textMatch) ? textMatch : String(textMatch).split("|")
    )
      .map((s) => String(s).trim().toLowerCase())
      .filter(Boolean);
    if (!list.length) return true;
    const text = el.textContent?.trim()?.toLowerCase() || "";
    return list.some((t) => text.includes(t));
  }
  static waitFor(root, selectors, options = {}) {
    const timeout = options.timeout || 1e4;
    const interval = options.interval || 100;
    return new Promise((resolve) => {
      const startTime = Date.now();
      const check = () => {
        const el = this.querySelector(root, selectors, {
          ...options,
          reportFailure: false,
        });
        if (el) {
          resolve(el);
          return;
        }
        if (Date.now() - startTime >= timeout) {
          if (options.provider && options.key) {
            const list = Array.isArray(selectors) ? selectors : [selectors];
            if (window.ProviderConfigManager) {
              window.ProviderConfigManager.reportFailure(
                options.provider,
                options.key,
                list,
              );
            }
          }
          resolve(null);
          return;
        }
        setTimeout(check, interval);
      };
      check();
    });
  }
  static async waitForConfig(root, provider, key, options = {}) {
    const config = await window.ProviderConfigManager?.get(provider, key);
    if (!config) return null;
    return this.waitFor(root, config.selectors, {
      textMatch: config.text_match,
      provider,
      key,
      ...options,
    });
  }
}
if (typeof window !== "undefined") {
  window.DomSelectorHelper = DomSelectorHelper;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = DomSelectorHelper;
}
