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
class VoiceRegistry {
  static initCrossContextSync() {
    if (this._storageListenerRegistered) return;
    if (typeof chrome === "undefined" || !chrome?.storage?.onChanged) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes[this._CACHE_KEY_SCRAPED]) {
        this._scrapedCache = null;
        this.getScrapedList().then(() => {
          if (window.eventBus) {
            window.eventBus.emit("voices:refreshed", {
              source: "cross_context_sync",
            });
          }
        });
      }
      if (changes[this._CACHE_KEY_BASE]) {
        this._baseCache = null;
        if (window.eventBus) {
          window.eventBus.emit("voices:base_catalog_updated", {
            source: "cross_context_sync",
          });
        }
      }
    });
    this._storageListenerRegistered = true;
  }
  static async getBaseCatalog(providerSlug = "flow") {
    if (this._baseCache && Date.now() < this._baseCache.expiresAt) {
      return this._baseCache.data.filter((v) => v.provider === providerSlug);
    }
    if (this._fetchPromise) return this._fetchPromise;
    this._fetchPromise = this._doFetchBase(providerSlug);
    try {
      return await this._fetchPromise;
    } finally {
      this._fetchPromise = null;
    }
  }
  static getBaseCatalogSync(providerSlug = "flow") {
    if (!this._baseCache?.data) return null;
    return this._baseCache.data.filter((v) => v.provider === providerSlug);
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
  static async getRenderList(providerSlug = "flow") {
    const scraped = await this.getScrapedList();
    if (scraped && scraped.length > 0) {
      return scraped;
    }
    const base = await this.getBaseCatalog(providerSlug);
    return (base || []).map((v) => ({ ...v, is_custom: false }));
  }
  static getRenderListSync(providerSlug = "flow") {
    const scraped = this.getScrapedListSync();
    if (scraped && scraped.length > 0) return scraped;
    const base = this.getBaseCatalogSync(providerSlug);
    if (base && base.length > 0) {
      return base.map((v) => ({ ...v, is_custom: false }));
    }
    this.getBaseCatalog(providerSlug).catch(() => {});
    return [];
  }
  static findBySlug(slug) {
    if (!slug) return null;
    const scraped = this.getScrapedListSync();
    if (scraped) {
      const hit = scraped.find((v) => v.slug === slug);
      if (hit) return hit;
    }
    const base = this.getBaseCatalogSync();
    if (base) {
      return base.find((v) => v.slug === slug) || null;
    }
    return null;
  }
  static async saveScrapedList(scrapedVoices, providerSlug = "flow") {
    const base = await this.getBaseCatalog(providerSlug);
    const baseSearchValues = new Set(
      (base || []).map((v) => (v.search_value || "").toLowerCase()),
    );
    const baseBySearchValue = new Map(
      (base || []).map((v) => [(v.search_value || "").toLowerCase(), v]),
    );
    const merged = scrapedVoices.map((scraped) => {
      const searchValue = scraped.name;
      const key = searchValue.toLowerCase();
      const isCustom = !baseSearchValues.has(key);
      if (!isCustom) {
        const baseVoice = baseBySearchValue.get(key);
        return {
          slug: baseVoice.slug,
          provider: baseVoice.provider,
          display_name: baseVoice.display_name,
          search_value: baseVoice.search_value,
          description: baseVoice.description || scraped.description,
          thumbnail_url: baseVoice.thumbnail_url,
          thumbnail_full_url: baseVoice.thumbnail_full_url,
          sample_url: baseVoice.sample_url || null,
          gender: baseVoice.gender,
          pitch_tier: baseVoice.pitch_tier,
          is_premium: baseVoice.is_premium || false,
          is_custom: false,
          scraped_at: Date.now(),
        };
      }
      return {
        slug: this._slugify(searchValue),
        provider: providerSlug,
        display_name: searchValue,
        search_value: searchValue,
        description: scraped.description || null,
        thumbnail_url: null,
        thumbnail_full_url: null,
        sample_url: null,
        gender: null,
        pitch_tier: null,
        is_premium: false,
        is_custom: true,
        scraped_at: Date.now(),
      };
    });
    const cacheData = { data: merged, scrapedAt: Date.now() };
    this._scrapedCache = cacheData;
    await this._writeScrapedCache(cacheData);
    if (window.eventBus) {
      window.eventBus.emit("voices:refreshed", {
        count: merged.length,
        provider: providerSlug,
      });
    }
    return merged;
  }
  static async reMergeScrapedWithBase(providerSlug = "flow") {
    if (!this._scrapedCache?.data) {
      await this.getScrapedList();
      if (!this._scrapedCache?.data) {
        console.log(
          "[VoiceRegistry] reMergeScrapedWithBase: no scraped cache (user ch\u01B0a Resync), skip",
        );
        return;
      }
    }
    const base = await this.getBaseCatalog(providerSlug);
    const baseBySearchValue = new Map(
      (base || []).map((v) => [(v.search_value || "").toLowerCase(), v]),
    );
    const remerged = this._scrapedCache.data.map((v) => {
      const key = (v.search_value || "").toLowerCase();
      const baseVoice = baseBySearchValue.get(key);
      if (baseVoice) {
        return {
          ...v,
          slug: baseVoice.slug,
          display_name: baseVoice.display_name,
          search_value: baseVoice.search_value || v.search_value,
          description: baseVoice.description || v.description,
          thumbnail_url: baseVoice.thumbnail_url,
          thumbnail_full_url: baseVoice.thumbnail_full_url,
          sample_url: baseVoice.sample_url || null,
          gender: baseVoice.gender || v.gender,
          pitch_tier: baseVoice.pitch_tier || v.pitch_tier,
          sort_order: baseVoice.sort_order ?? v.sort_order,
          is_premium: baseVoice.is_premium || false,
          is_custom: false,
        };
      }
      return { ...v, is_custom: true };
    });
    const cacheData = {
      data: remerged,
      scrapedAt: this._scrapedCache.scrapedAt,
    };
    this._scrapedCache = cacheData;
    await this._writeScrapedCache(cacheData);
    if (window.eventBus) {
      window.eventBus.emit("voices:refreshed", {
        count: remerged.length,
        source: "sse_remerge",
      });
    }
  }
  static async handleSseUpdate(data) {
    console.log("[VoiceRegistry] SSE provider_voices_updated:", data);
    const provider = data?.provider || "flow";
    if (!data?.provider) {
      console.warn(
        '[VoiceRegistry] SSE event missing provider field \u2014 fallback "flow" (verify backend MercurePublisher)',
      );
    }
    this._fetchPromise = null;
    this._baseCache = null;
    await this._clearBaseCache();
    console.log("[VoiceRegistry] SSE: cache cleared, starting refetch...");
    try {
      const base = await this.getBaseCatalog(provider);
      const targetSlug = data?.slug;
      const targetInBase = targetSlug
        ? base?.find((v) => v.slug === targetSlug)
        : base?.[0];
      console.log(
        "[VoiceRegistry] SSE: getBaseCatalog returned count=" +
          (Array.isArray(base) ? base.length : "N/A") +
          " target=" +
          (targetSlug || "first") +
          " display_name=" +
          (targetInBase?.display_name || "MISSING") +
          " sample_url=" +
          (targetInBase?.sample_url || "null"),
      );
      await this.reMergeScrapedWithBase(provider);
      const scraped = this._scrapedCache?.data;
      const targetInScraped =
        targetSlug && Array.isArray(scraped)
          ? scraped.find((v) => v.slug === targetSlug)
          : null;
      console.log(
        "[VoiceRegistry] SSE: reMergeScrapedWithBase done. scraped target=" +
          (targetInScraped
            ? "display_name=" +
              targetInScraped.display_name +
              " sample_url=" +
              targetInScraped.sample_url
            : "NOT_FOUND_OR_NO_SCRAPED"),
      );
    } catch (err) {
      console.warn(
        "[VoiceRegistry] SSE refetch failed:",
        err.message,
        err.stack,
      );
    }
    if (window.eventBus) {
      console.log(
        "[VoiceRegistry] SSE: emit voices:base_catalog_updated to eventBus",
      );
      window.eventBus.emit("voices:base_catalog_updated", data);
    } else {
      console.warn(
        "[VoiceRegistry] SSE: window.eventBus missing \u2014 modal listener will NOT fire",
      );
    }
  }
  static getStats() {
    const scraped = this.getScrapedListSync();
    if (scraped) {
      const custom = scraped.filter((v) => v.is_custom).length;
      return {
        total: scraped.length,
        base: scraped.length - custom,
        custom,
        scrapedAt: this._scrapedCache?.scrapedAt || null,
      };
    }
    const base = this.getBaseCatalogSync();
    return {
      total: base?.length || 0,
      base: base?.length || 0,
      custom: 0,
      scrapedAt: null,
    };
  }
  static async _doFetchBase(providerSlug) {
    try {
      const cached = await this._readBaseCache();
      if (cached && Date.now() < cached.expiresAt) {
        this._baseCache = cached;
        if (window.eventBus) {
          window.eventBus.emit("voices:base_catalog_updated", {
            source: "disk_cache",
          });
        }
        return cached.data.filter((v) => v.provider === providerSlug);
      }
      const baseUrl = await this._getApiBaseUrl();
      const headers = { Accept: "application/json" };
      try {
        if (chrome?.runtime?.id) headers["X-Extension-Id"] = chrome.runtime.id;
      } catch (_) {}
      try {
        const manifestVersion = chrome?.runtime?.getManifest?.()?.version;
        if (manifestVersion) headers["X-Ext-Version"] = manifestVersion;
      } catch (_) {}
      try {
        const token = window.authManager?.token;
        if (token) headers["Authorization"] = `Bearer ${token}`;
      } catch (_) {}
      const url = `${baseUrl}/api/v1/provider-voices?provider=${encodeURIComponent(providerSlug)}`;
      const sigHeaders =
        typeof RequestSigner !== "undefined"
          ? await RequestSigner.headers("GET", new URL(url).pathname, "")
          : {};
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8e3);
      let resp;
      try {
        resp = await fetch(url, {
          method: "GET",
          headers: { ...headers, ...sigHeaders },
          cache: "no-store",
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (json.success && Array.isArray(json.data)) {
        const processed = json.data.map((v) => {
          if (v.config && typeof v.config === "string") {
            try {
              v.config = JSON.parse(v.config);
            } catch (_) {}
          }
          return v;
        });
        const cacheData = {
          data: processed,
          expiresAt: Date.now() + this._CACHE_TTL_MS,
          fetchedAt: Date.now(),
        };
        this._baseCache = cacheData;
        if (json.meta && typeof json.meta.version !== "undefined") {
          this._lastVersion = json.meta.version;
        }
        await this._writeBaseCache(cacheData);
        if (window.eventBus) {
          window.eventBus.emit("voices:base_catalog_updated", {
            source: "initial_fetch",
          });
        }
        return processed.filter((v) => v.provider === providerSlug);
      }
      throw new Error("Invalid response shape");
    } catch (e) {
      console.warn("[VoiceRegistry] Fetch base catalog failed:", e.message);
      const stale = await this._readBaseCache();
      if (stale?.data) {
        this._baseCache = { ...stale, expiresAt: Date.now() + 5 * 60 * 1e3 };
        return stale.data.filter((v) => v.provider === providerSlug);
      }
      console.warn(
        "[VoiceRegistry] No cache, no server data \u2014 return empty (UI fallback render placeholder)",
      );
      return [];
    }
  }
  static _slugify(text) {
    return (
      String(text || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 100) || "unknown"
    );
  }
  static async _getApiBaseUrl() {
    return new Promise((resolve) => {
      const webBase = window.ApiBaseConfig?.getWebBase?.();
      if (webBase) {
        resolve(webBase);
        return;
      }
      resolve("https://labs.toby.vn");
    });
  }
  static async _readBaseCache() {
    return this._readKey(this._CACHE_KEY_BASE);
  }
  static async _writeBaseCache(data) {
    return this._writeKey(this._CACHE_KEY_BASE, data);
  }
  static async _clearBaseCache() {
    return this._removeKey(this._CACHE_KEY_BASE);
  }
  static async _readScrapedCache() {
    return this._readKey(this._CACHE_KEY_SCRAPED);
  }
  static async _writeScrapedCache(data) {
    return this._writeKey(this._CACHE_KEY_SCRAPED, data);
  }
  static async _clearScrapedCache() {
    return this._removeKey(this._CACHE_KEY_SCRAPED);
  }
  static async _readKey(key) {
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.get([key], (res) => {
          resolve(res[key] || null);
        });
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
  static async _removeKey(key) {
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.remove([key], resolve);
      } else {
        try {
          localStorage.removeItem(key);
        } catch (_) {}
        resolve();
      }
    });
  }
}
__publicField(VoiceRegistry, "_CACHE_KEY_BASE", "toby_provider_voices_base");
__publicField(
  VoiceRegistry,
  "_CACHE_KEY_SCRAPED",
  "toby_provider_voices_scraped",
);
__publicField(VoiceRegistry, "_CACHE_TTL_MS", 4 * 60 * 60 * 1e3);
__publicField(VoiceRegistry, "_GRACE_PERIOD_MS", 24 * 60 * 60 * 1e3);
__publicField(VoiceRegistry, "_baseCache", null);
__publicField(VoiceRegistry, "_scrapedCache", null);
__publicField(VoiceRegistry, "_lastVersion", null);
__publicField(VoiceRegistry, "_fetchPromise", null);
__publicField(VoiceRegistry, "_storageListenerRegistered", false);
if (typeof window !== "undefined") {
  window.VoiceRegistry = VoiceRegistry;
}
