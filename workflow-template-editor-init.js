document.addEventListener("DOMContentLoaded", async () => {
  document.body.classList.add("wf-popup", "wf-template-editor");
  if (window.EventBus) {
    window.eventBus = new EventBus();
  }
  if (window.I18n) {
    await window.I18n.init();
    window.I18n.applyTranslations(document.body);
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.af_locale && window.I18n) {
      window.I18n.setLocale(changes.af_locale.newValue, false);
      window.I18n.applyTranslations(document.body);
    }
  });
  if (window.storageSettings) {
    await window.storageSettings.loadAndApply();
    console.log("[TemplateEditorInit] StorageSettings ready");
  }
  try {
    window.ChatGPTConfig?.fetchInBackground?.();
  } catch (e) {}
  try {
    window.GrokConfig?.fetchInBackground?.();
  } catch (e) {}
  try {
    await window.ModelPresentationRegistry?.fetch?.();
  } catch (error) {
    console.warn("[ModelPresentation]", error.message);
  }
  if (window.authManager) {
    await window.authManager.init();
    console.log(
      "[TemplateEditorInit] AuthManager ready, logged in:",
      window.authManager.isLoggedIn(),
    );
  }
  if (window.SseClient && window.authManager?.isLoggedIn()) {
    try {
      await window.SseClient.connect();
      console.log(
        "[TemplateEditorInit] SseClient connected (follower mode expected)",
      );
    } catch (e) {
      console.warn(
        "[TemplateEditorInit] SseClient connect failed:",
        e?.message,
      );
    }
  }
  if (window.RequestCoalescer) {
    window.RequestCoalescer.init();
    console.log(
      "[TemplateEditorInit] RequestCoalescer ready, isLeader:",
      window.RequestCoalescer.isLeader(),
    );
  }
  if (window.storageManager) {
    await window.storageManager.init();
    console.log(
      "[TemplateEditorInit] StorageManager mode:",
      window.storageManager.getMode(),
    );
  }
  if (window.featureGate) {
    await window.featureGate.init();
    try {
      if (!window.featureGate._isCacheValid?.() && window.featureGate.refresh) {
        await window.featureGate.refresh();
      }
    } catch (err) {
      console.warn(
        "[TemplateEditorInit] FeatureGate refresh failed, d\xF9ng cache:",
        err.message,
      );
    }
    console.log(
      "[TemplateEditorInit] FeatureGate ready, canManageTemplates:",
      window.featureGate.canManageWorkflowTemplates?.(),
    );
  }
  if (!Array.isArray(window._cachedPlans) || window._cachedPlans.length === 0) {
    try {
      const plansResp = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            action: "apiRequest",
            method: "GET",
            endpoint: "plans?extension=flow&include_internal=1",
          },
          (r) => {
            if (chrome.runtime.lastError)
              reject(new Error(chrome.runtime.lastError.message));
            else if (r?.success && r?.data) resolve(r.data);
            else reject(new Error("plans fetch failed"));
          },
        );
      });
      if (Array.isArray(plansResp)) window._cachedPlans = plansResp;
    } catch (err) {
      console.warn("[TemplateEditorInit] Fetch plans failed:", err.message);
    }
  }
  if (window.SystemConfig) {
    await SystemConfig.restoreFromStorage();
    SystemConfig.applyToUI();
  }
  try {
    if (window.PendingUploadStore) {
      await PendingUploadStore.restore();
      await PendingUploadStore.restoreCache();
      await PendingUploadStore.restoreLightweight();
      console.log("[TemplateEditorInit] PendingUploadStore restored");
    }
  } catch (e) {
    console.error("[TemplateEditorInit] PendingUploadStore error:", e);
  }
  try {
    if (window.ProviderConfigManager?._fetchApiConfigs) {
      await window.ProviderConfigManager._fetchApiConfigs();
      console.log("[TemplateEditorInit] PCM api_configs fetched");
    }
  } catch (e) {
    console.warn(
      "[TemplateEditorInit] PCM api_configs fetch failed:",
      e?.message,
    );
  }
  try {
    if (window.NodeTemplates?.fetchFromServer) {
      window.NodeTemplates.clearServerCache?.();
      await window.NodeTemplates.fetchFromServer().catch((err) => {
        console.warn(
          "[TemplateEditorInit] NodeTemplates.fetchFromServer failed:",
          err?.message,
        );
      });
    }
  } catch (e) {
    console.warn("[TemplateEditorInit] NodeTemplates fetch error:", e);
  }
  console.log(
    "[TemplateEditorInit] Creating WorkflowEditor for template mode...",
  );
  let editor;
  try {
    editor = new WorkflowEditor();
    window.workflowEditor = editor;
    console.log("[TemplateEditorInit] WorkflowEditor created");
  } catch (e) {
    console.error("[TemplateEditorInit] WorkflowEditor constructor error:", e);
    return;
  }
  editor._hideSidebar = () => {};
  editor._showSidebar = () => {};
  let _suppressWindowClose = false;
  const originalClose = editor.close.bind(editor);
  editor.close = () => {
    const hadOverlay = !!editor.overlay;
    originalClose();
    if (hadOverlay && !_suppressWindowClose) window.close();
  };
  const originalRender = editor.render.bind(editor);
  editor.render = () => {
    _suppressWindowClose = true;
    originalRender();
    _suppressWindowClose = false;
  };
  window.addEventListener("unload", () => {
    chrome.runtime
      .sendMessage({ action: "templateEditorClosed" })
      .catch(() => {});
  });
  const urlParams = new URLSearchParams(window.location.search);
  const templateId = urlParams.get("templateId");
  const mode = urlParams.get("mode") || (templateId ? "edit" : "create");
  console.log("[TemplateEditorInit] Mode:", mode, "TemplateId:", templateId);
  let pendingData = null;
  try {
    const stored = await new Promise((resolve) => {
      chrome.storage.local.get(["_pendingTemplate"], (result) =>
        resolve(result),
      );
    });
    if (stored._pendingTemplate) {
      pendingData = stored._pendingTemplate;
      chrome.storage.local.remove("_pendingTemplate");
      console.log(
        "[TemplateEditorInit] Loaded pending template data:",
        pendingData.name || pendingData.id,
      );
    }
  } catch (e) {
    console.error("[TemplateEditorInit] Error loading pending template:", e);
  }
  editor.isTemplateMode = true;
  if (mode === "edit" && (pendingData || templateId)) {
    try {
      let template = null;
      if (
        pendingData &&
        templateId &&
        String(pendingData.id) === String(templateId)
      ) {
        template = pendingData;
        console.log(
          "[TemplateEditorInit] Using cached pendingData for template:",
          templateId,
        );
      } else if (templateId) {
        console.log(
          "[TemplateEditorInit] Fetching template from API:",
          templateId,
        );
        template = await fetchTemplateById(templateId);
      } else if (pendingData) {
        template = pendingData;
        console.log(
          "[TemplateEditorInit] Using pendingData (no templateId in URL)",
        );
      }
      if (!template) {
        throw new Error(
          window.I18n?.t("workflow.templateNotFound") || "Template not found",
        );
      }
      console.log(
        "[TemplateEditorInit] Opening template for edit:",
        template.id,
        template.name,
      );
      if (template._creator_edit && editor.openCreatorTemplateForEdit) {
        editor.openCreatorTemplateForEdit(template);
      } else {
        editor.openTemplateForEdit(template);
      }
    } catch (err) {
      console.error("[TemplateEditorInit] Error loading template:", err);
      window.showNotification?.(
        err.message ||
          window.I18n?.t("workflow.loadTemplateFailed") ||
          "Failed to load template",
        "error",
      );
      openCreateMode(editor);
    }
  } else {
    openCreateMode(editor);
  }
  console.log("[TemplateEditorInit] Template editor ready");
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "loadTemplateInEditor" && message.data) {
      const d = message.data;
      if (d.mode === "edit" && d.template) {
        if (d.template._creator_edit && editor.openCreatorTemplateForEdit) {
          editor.openCreatorTemplateForEdit(d.template);
        } else {
          editor.openTemplateForEdit(d.template);
        }
      } else {
        openCreateMode(editor);
      }
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.af_entitlements && window.featureGate) {
      const newData = changes.af_entitlements.newValue;
      if (newData?.entitlements) {
        window.featureGate.entitlements = newData.entitlements;
        window.featureGate.plan = newData.plan || window.featureGate.plan;
      }
      window.eventBus?.emit("featuregate:refreshed", {
        plan: newData?.plan,
        entitlements: newData?.entitlements,
      });
      window.ProviderConfigManager?.fetchPrivateConfigs?.(true).catch(() => {});
    }
    if (area === "local" && changes.af_system_settings?.newValue) {
      window.SystemConfig?.handleStorageUpdate?.(
        changes.af_system_settings.newValue,
      );
    }
  });
});
async function fetchTemplateById(templateId) {
  return new Promise((resolve, reject) => {
    if (window.authManager?.isLoggedIn()) {
      window.authManager
        ._apiCall("GET", `workflow-templates/${templateId}`)
        .then((result) => resolve(result?.data || result))
        .catch(reject);
    } else {
      chrome.runtime.sendMessage(
        {
          action: "apiRequest",
          method: "GET",
          endpoint: `workflow-templates/${templateId}`,
        },
        (resp) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (resp?.success) {
            resolve(resp.data);
          } else {
            reject(new Error(resp?.error?.message || "API Error"));
          }
        },
      );
    }
  });
}
function openCreateMode(editor) {
  const t = (key) => window.I18n?.t(key) || key;
  editor.templateId = null;
  editor.templateData = {
    name: t("workflow.newTemplateName") || "New Template",
    description: "",
    category_id: null,
    thumbnail_url: null,
    is_premium: false,
    is_featured: false,
    is_published: true,
  };
  editor.mode = "create";
  editor.workflow = {
    wf_id: "template_new_" + Date.now(),
    wf_name: t("workflow.newTemplateName") || "New Template",
    description: "",
    status: "idle",
    enabled: true,
    settings: {},
    settings_json: {},
    nodes: [],
    edges: [],
  };
  editor.selectedNodeId = null;
  editor.render();
  editor.initComponents();
  editor.bindEvents();
  editor._updateQuotaDisplay?.();
  editor._hasUnsavedChanges = false;
  console.log("[TemplateEditorInit] Opened in create mode");
}
