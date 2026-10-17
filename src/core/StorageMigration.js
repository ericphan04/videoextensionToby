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
class StorageMigration {
  static async run() {
    await this.removeUnscopedOperationalConfig();
    console.log("[StorageMigration] Starting Phase 2/2b migration...");
    await this.removeDeprecatedKeys();
    await this.verifyServerSyncKeys();
    await this.cleanDeprecatedSettingsFields();
    console.log("[StorageMigration] Phase 2/2b migration complete");
  }
  static async removeUnscopedOperationalConfig() {
    const keys = [
      "toby_provider_configs",
      "toby_provider_api_configs",
      "toby_provider_models",
      "af_chatgpt_config",
      "af_grok_config",
    ];
    const stored = await chrome.storage.local.get([
      ...keys,
      "toby_config_access_scope",
    ]);
    const unscoped = keys.filter(
      (key) => stored[key] && stored[key].scope?.contract !== "device-v1",
    );
    if (stored.toby_config_access_scope?.contract !== "device-v1") {
      unscoped.push("af_execution_config", "_tobyConfigsReady");
    }
    unscoped.push("toby_provider_dom_selectors");
    await chrome.storage.local.remove(unscoped);
  }
  static async removeDeprecatedKeys() {
    try {
      const existing = await chrome.storage.local.get(this.DEPRECATED_KEYS);
      const keysToRemove = Object.keys(existing).filter(
        (k) => existing[k] !== void 0,
      );
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
        console.log(
          "[StorageMigration] Removed deprecated keys:",
          keysToRemove,
        );
      } else {
        console.log("[StorageMigration] No deprecated keys to remove");
      }
    } catch (e) {
      console.warn(
        "[StorageMigration] Error removing deprecated keys:",
        e.message,
      );
    }
  }
  static async verifyServerSyncKeys() {
    try {
      const existing = await chrome.storage.local.get(this.SERVER_SYNCED_KEYS);
      for (const key of this.SERVER_SYNCED_KEYS) {
        if (existing[key]) {
          console.log(
            `[StorageMigration] Server-synced key "${key}" exists (cache)`,
          );
        }
      }
    } catch (e) {
      console.warn(
        "[StorageMigration] Error verifying server sync keys:",
        e.message,
      );
    }
  }
  static async cleanDeprecatedSettingsFields() {
    try {
      const data = await chrome.storage.local.get(["af_settings"]);
      if (!data.af_settings) {
        console.log("[StorageMigration] No af_settings to clean");
        return;
      }
      const settings = { ...data.af_settings };
      let cleaned = 0;
      const cleanedFields = [];
      for (const field of this.DEPRECATED_SETTINGS_FIELDS) {
        if (settings[field] !== void 0) {
          cleanedFields.push(`${field}=${settings[field]}`);
          delete settings[field];
          cleaned++;
        }
      }
      if (cleaned > 0) {
        await chrome.storage.local.set({ af_settings: settings });
        console.log(
          `[StorageMigration] \u2713 Cleaned ${cleaned} deprecated fields from af_settings:`,
        );
        cleanedFields.forEach((f) => console.log(`  - ${f}`));
      } else {
        console.log(
          "[StorageMigration] \u2713 No deprecated fields to clean (already clean)",
        );
      }
      const remainingKeys = Object.keys(settings).sort();
      console.log(
        "[StorageMigration] Remaining af_settings keys:",
        remainingKeys.length,
      );
      if (remainingKeys.length <= 30) {
        console.log("  ", remainingKeys.join(", "));
      }
    } catch (e) {
      console.warn(
        "[StorageMigration] Error cleaning deprecated fields:",
        e.message,
      );
    }
  }
  static async migrateSettingsKey() {
    try {
      const data = await chrome.storage.local.get([
        "af_settings",
        "af_user_prefs",
      ]);
      if (data.af_user_prefs || !data.af_settings) {
        console.log(
          "[StorageMigration] Settings key already migrated or empty",
        );
        return;
      }
      await chrome.storage.local.set({ af_user_prefs: data.af_settings });
      await chrome.storage.local.remove(["af_settings"]);
      console.log(
        "[StorageMigration] Migrated af_settings \u2192 af_user_prefs",
      );
    } catch (e) {
      console.warn(
        "[StorageMigration] Error migrating settings key:",
        e.message,
      );
    }
  }
  static async getStorageStats() {
    try {
      const all = await chrome.storage.local.get(null);
      const keys = Object.keys(all);
      const sizes = {};
      for (const key of keys) {
        const json = JSON.stringify(all[key]);
        sizes[key] = json.length;
      }
      const sorted = Object.entries(sizes).sort((a, b) => b[1] - a[1]);
      console.log("[StorageMigration] Storage stats:");
      for (const [key, size] of sorted.slice(0, 10)) {
        console.log(`  ${key}: ${(size / 1024).toFixed(1)} KB`);
      }
      return sizes;
    } catch (e) {
      console.warn(
        "[StorageMigration] Error getting storage stats:",
        e.message,
      );
      return {};
    }
  }
}
__publicField(StorageMigration, "DEPRECATED_KEYS", ["af_validation_rules"]);
__publicField(StorageMigration, "SERVER_SYNCED_KEYS", [
  "af_daily_stats",
  "toby_provider_configs",
  "af_execution_config",
]);
__publicField(StorageMigration, "DEPRECATED_SETTINGS_FIELDS", [
  "execDelayNodes",
  "execMaxRetries",
  "execTimeout",
  "execOnError",
  "delayBetweenPrompts",
  "queueBatchSize",
  "queueMaxMonitor",
  "queueRestMin",
  "queueRestMax",
  "flowSessionRefreshEnabled",
  "flowSessionRefreshIntervalMin",
  "flowAutoRecoveryEnabled",
  "flowConsecutiveFailThreshold",
  "flowBackoffBaseSec",
  "flowBackoffMaxSec",
  "flowBackoffJitterPercent",
  "parallelThreads",
  "chatgptPrepandPrefix",
  "sidebarPosition",
  "sidebarWidth",
]);
window.StorageMigration = StorageMigration;
