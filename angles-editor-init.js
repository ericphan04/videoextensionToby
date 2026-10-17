(async function () {
  "use strict";
  await new Promise((r) =>
    document.readyState === "loading"
      ? document.addEventListener("DOMContentLoaded", r)
      : r(),
  );
  if (!window.eventBus && typeof EventBus !== "undefined") {
    window.eventBus = new EventBus();
  }
  if (window.I18n) {
    await window.I18n.init();
    window.I18n.applyTranslations(document.body);
  }
  if (window.storageSettings) {
    await window.storageSettings.loadAndApply();
    console.log(
      "[AngleEditor] StorageSettings ready, queueEnabled:",
      window.storageSettings.getSettings()?.queueEnabled,
    );
  }
  try {
    window.ChatGPTConfig?.fetchInBackground?.();
  } catch (e) {}
  try {
    window.GrokConfig?.fetchInBackground?.();
  } catch (e) {}
  if (window.AuthManager && !window.authManager) {
    window.authManager = new AuthManager();
  }
  if (window.authManager) {
    await window.authManager.init();
    console.log(
      "[AngleEditor] AuthManager ready, logged in:",
      window.authManager.isLoggedIn(),
    );
  }
  if (window.SseClient && window.authManager?.isLoggedIn()) {
    try {
      await window.SseClient.connect();
      console.log("[AngleEditor] SseClient connected (follower mode expected)");
    } catch (e) {
      console.warn("[AngleEditor] SseClient connect failed:", e?.message);
    }
  }
  if (window.RequestCoalescer) {
    window.RequestCoalescer.init();
    console.log(
      "[AngleEditor] RequestCoalescer ready, isLeader:",
      window.RequestCoalescer.isLeader(),
    );
  }
  if (window.storageManager) {
    await window.storageManager.init();
    console.log(
      "[AngleEditor] StorageManager mode:",
      window.storageManager.getMode(),
    );
  }
  if (window.PendingUploadStore) {
    await PendingUploadStore.restore();
    await PendingUploadStore.restoreCache();
    await PendingUploadStore.restoreLightweight();
    console.log("[AngleEditor] PendingUploadStore restored");
  }
  if (window.FeatureGate && !window.featureGate) {
    window.featureGate = new FeatureGate();
  }
  if (
    window.featureGate &&
    typeof window.featureGate.refreshAsync === "function"
  ) {
    try {
      await window.featureGate.refreshAsync();
      console.log(
        "[AngleEditor] FeatureGate ready, plan:",
        window.featureGate.plan?.slug,
      );
    } catch (e) {
      console.warn(
        "[AngleEditor] FeatureGate refresh failed, using cached:",
        e.message,
      );
    }
  }
  if (window.SystemConfig) {
    await SystemConfig.restoreFromStorage();
    SystemConfig.applyToUI();
    console.log(
      "[AngleEditor] SystemConfig restored, show_upgrade_ui:",
      SystemConfig.getBool("show_upgrade_ui"),
    );
  }
  try {
    if (window.ProviderConfigManager?._fetchApiConfigs) {
      await window.ProviderConfigManager._fetchApiConfigs();
      console.log("[AngleEditor] PCM api_configs fetched");
    }
  } catch (e) {
    console.warn("[AngleEditor] PCM api_configs fetch failed:", e?.message);
  }
  try {
    const stored = await new Promise((resolve) => {
      chrome.storage.local.get(["_pendingAnglesProject"], (result) =>
        resolve(result),
      );
    });
    if (stored._pendingAnglesProject) {
      window._currentProjectId = stored._pendingAnglesProject.projectId || null;
      window._currentProjectName =
        stored._pendingAnglesProject.projectName || null;
      chrome.storage.local.remove("_pendingAnglesProject");
      console.log("[AngleEditor] Project context:", window._currentProjectId);
    }
  } catch (e) {}
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      if (changes.af_locale && window.I18n) {
        window.I18n.setLocale(changes.af_locale.newValue, false);
        window.I18n.applyTranslations(document.body);
      }
      if (changes.af_entitlements && window.featureGate) {
        const newData = changes.af_entitlements.newValue;
        if (newData?.entitlements) {
          window.featureGate.entitlements = newData.entitlements;
          window.featureGate.plan = newData.plan || window.featureGate.plan;
        }
        window.eventBus?.emit("featuregate:refreshed", {
          plan: newData?.plan,
          entitlements: newData?.entitlements,
        });
        console.log(
          "[AngleEditor] Entitlements updated from storage, plan:",
          newData?.plan?.slug,
        );
        window.ProviderConfigManager?.fetchPrivateConfigs?.(true).catch(
          () => {},
        );
      }
      if (changes.af_system_settings?.newValue) {
        window.SystemConfig?.handleStorageUpdate?.(
          changes.af_system_settings.newValue,
        );
      }
    }
  });
  if (window.eventBus) {
    window.eventBus.on("quota:warning", (data) => {
      const remaining = data?.remaining ?? 0;
      const limit = data?.limit ?? 0;
      console.log(
        "[AngleEditor] Quota warning:",
        remaining,
        "/",
        limit,
        "remaining",
      );
      window.customDialog?.alert(
        window.I18n?.t("gate.quotaWarningMsg", { remaining, limit }) ||
          `${remaining}/${limit} prompts left today. Upgrade for unlimited.`,
        {
          title:
            window.I18n?.t("gate.quotaWarningTitle") ||
            "Running low on prompts",
          type: "warning",
        },
      );
    });
    window.eventBus.on("quota:exhausted", (data) => {
      const limit = data?.limit ?? 0;
      const module = data?.module || "Angles";
      console.log("[AngleEditor] Quota exhausted:", limit, "limit for", module);
      if (window.customDialog) {
        const showUpgrade =
          window.SystemConfig?.getBool("show_upgrade_ui") !== false;
        const contactUrl = window.SystemConfig?.get("upgrade_contact_url", "");
        const buttons = [
          {
            label: window.I18n?.t("gate.close") || "Close",
            primary: false,
            action: () => {},
          },
        ];
        if (showUpgrade) {
          buttons.push({
            label: window.I18n?.t("gate.upgradeNow") || "Upgrade now",
            primary: true,
            action: () => {
              chrome.runtime
                .sendMessage({ action: "showUpgradeModal" })
                .catch(() => {});
            },
          });
        } else if (contactUrl) {
          buttons.push({
            label: window.I18n?.t("gate.contact") || "Contact",
            primary: true,
            action: () => {
              window.open(contactUrl, "_blank");
            },
          });
        }
        const exhaustedMsg =
          window.I18n?.t("gate.quotaExhaustedMsg", { limit }) ||
          `You've used all <strong>${limit} prompts</strong> today.`;
        const upgradeDesc = showUpgrade
          ? window.I18n?.t("gate.upgradeForUnlimited") ||
            "Upgrade to Premium for unlimited daily prompt runs and many more features."
          : window.I18n?.t("gate.contactAdminUpgrade") ||
            "Please contact admin to upgrade your plan.";
        window.customDialog.alert(
          `<div style="line-height:1.6">
            <p>${exhaustedMsg}</p>
            <p style="margin-top:12px;color:var(--muted-foreground)">${upgradeDesc}</p>
          </div>`,
          {
            title:
              window.I18n?.t("gate.quotaExhaustedTitle") ||
              "Daily prompt quota exhausted",
            type: "warning",
            html: true,
            buttons,
          },
        );
      }
    });
  }
  const editor = new AngleEditor(document.body);
  window.anglesEditor = editor;
  console.log("[AngleEditor] Initialized");
})();
