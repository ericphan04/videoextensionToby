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
class CharacterRegistry {
  static selections(value) {
    if (value && !Array.isArray(value) && typeof value === "object") {
      const isNodeOrSettings =
        "character_slug" in value ||
        "character_selections" in value ||
        "node_type" in value ||
        "node_id" in value ||
        "node_name" in value;
      value = Array.isArray(value.character_selections)
        ? value.character_selections
        : value.selections ||
          (value.character_slug
            ? [
                {
                  slug: value.character_slug,
                  search_value: value.character_search_value,
                },
              ]
            : isNodeOrSettings
              ? []
              : [value]);
    }
    if (typeof value === "string") {
      try {
        value = JSON.parse(value);
      } catch (_) {
        value = value ? [value] : [];
      }
    }
    const seen = new Set();
    return (Array.isArray(value) ? value : [])
      .map((item) => {
        const slug = typeof item === "string" ? item : item?.slug;
        const cached = this.findBySlug(slug);
        const name = cached?.name || item?.name;
        const thumbnail = cached?.thumbnail_url || item?.thumbnail_url;
        return {
          slug,
          search_value:
            cached?.search_value || item?.search_value || name || "",
          ...(name ? { name } : {}),
          ...(thumbnail ? { thumbnail_url: thumbnail } : {}),
        };
      })
      .filter((item) => {
        if (!item.slug || seen.has(item.slug)) return false;
        seen.add(item.slug);
        return true;
      });
  }
  static selectionValue(value) {
    const items = this.selections(value).map(({ slug, search_value }) => ({
      slug,
      search_value,
    }));
    return items.length ? JSON.stringify(items) : "";
  }
  static payload(value) {
    const selections = this.selections(value)
      .filter((item) => item.search_value)
      .map(({ slug, search_value }) => ({ slug, search_value }));
    return selections.length ? { ...selections[0], selections } : null;
  }
  static initCrossContextSync() {
    if (this._storageListenerRegistered) return;
    if (typeof chrome === "undefined" || !chrome?.storage?.onChanged) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes[this._CACHE_KEY_SCRAPED]) {
        this._scrapedCache = null;
        this.getScrapedList().then(() => {
          if (window.eventBus) {
            window.eventBus.emit("characters:refreshed", {
              source: "cross_context_sync",
            });
          }
        });
      }
    });
    this._storageListenerRegistered = true;
  }
  static async getScrapedList() {
    if (this._scrapedCache?.data) return this._scrapedCache.data;
    const stored = await this._readScrapedCache();
    if (stored?.data) {
      this._scrapedCache = stored;
      return stored.data;
    }
    return null;
  }
  static getScrapedListSync() {
    return this._scrapedCache?.data || null;
  }
  static async getRenderList() {
    const scraped = await this.getScrapedList();
    return scraped && scraped.length > 0 ? scraped : [];
  }
  static getRenderListSync() {
    const scraped = this.getScrapedListSync();
    if (scraped && scraped.length > 0) return scraped;
    this.getScrapedList()
      .then((d) => {
        if (d && d.length > 0 && window.eventBus) {
          window.eventBus.emit("characters:refreshed", { source: "disk_read" });
        }
      })
      .catch(() => {});
    return [];
  }
  static findBySlug(slug) {
    if (!slug) return null;
    const scraped = this.getScrapedListSync();
    if (scraped) {
      return scraped.find((c) => c.slug === slug) || null;
    }
    return null;
  }
  static findByName(name) {
    if (!name) return null;
    const scraped = this.getScrapedListSync();
    if (scraped) {
      const key = String(name).toLowerCase();
      return (
        scraped.find(
          (c) => (c.search_value || c.name || "").toLowerCase() === key,
        ) || null
      );
    }
    return null;
  }
  static async saveScrapedList(scrapedCharacters) {
    const list = Array.isArray(scrapedCharacters) ? scrapedCharacters : [];
    const seen = new Set();
    const merged = [];
    for (const c of list) {
      const name = (c?.name || "").trim();
      if (!name) continue;
      const slug = this._slugify(name);
      if (seen.has(slug)) continue;
      seen.add(slug);
      merged.push({
        slug,
        name,
        search_value: name,
        thumbnail_url: c?.thumbnail || c?.thumbnail_url || null,
        scraped_at: Date.now(),
      });
    }
    const cacheData = { data: merged, scrapedAt: Date.now() };
    this._scrapedCache = cacheData;
    await this._writeScrapedCache(cacheData);
    if (window.eventBus) {
      window.eventBus.emit("characters:refreshed", { count: merged.length });
    }
    return merged;
  }
  static getStats() {
    const scraped = this.getScrapedListSync();
    return {
      total: scraped?.length || 0,
      scrapedAt: this._scrapedCache?.scrapedAt || null,
    };
  }
  static _slugify(text) {
    let s = String(text || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!s) return "unknown";
    if (!/^[a-z]/.test(s)) s = "c_" + s;
    return s.slice(0, 100);
  }
  static async _readScrapedCache() {
    return this._readKey(this._CACHE_KEY_SCRAPED);
  }
  static async _writeScrapedCache(data) {
    return this._writeKey(this._CACHE_KEY_SCRAPED, data);
  }
  static async _readKey(key) {
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.get([key], (res) => resolve(res[key] || null));
      } else {
        try {
          const cached = localStorage.getItem(key);
          resolve(cached ? JSON.parse(cached) : null);
        } catch {
          resolve(null);
        }
      }
    });
  }
  static async _writeKey(key, data) {
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.set({ [key]: data }, resolve);
      } else {
        try {
          localStorage.setItem(key, JSON.stringify(data));
        } catch (_) {}
        resolve();
      }
    });
  }
}
__publicField(
  CharacterRegistry,
  "_CACHE_KEY_SCRAPED",
  "toby_provider_characters_scraped",
);
__publicField(CharacterRegistry, "_scrapedCache", null);
__publicField(CharacterRegistry, "_storageListenerRegistered", false);
if (typeof window !== "undefined") {
  window.CharacterRegistry = CharacterRegistry;
}
