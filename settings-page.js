(function () {
  "use strict";
  const DEFAULTS = {
    inputTimeout: 1200,
    blobMaxAgeDays: 7,
    randomDelayMin: 3,
    randomDelayMax: 10,
    queueEnabled: false,
    manualSubmitMode: false,
    autoDownload: false,
    flowApiAutoOpenTrackerGrid: true,
    autoRemoveWatermark: false,
    autoRemoveWatermarkVideo: false,
    autoRemoveWatermarkInput: false,
    downloadFolder: "tobyflow_output",
    fileNameProject: "",
    fileNameTemplate: "[Date]_[Project]_[Prompt]_[Index]",
    downloadResolution: "1k",
    videoDownloadResolution: "720p",
    theme: "dark",
    language: "vi",
    notifyOnComplete: true,
    notifyTelegram: false,
    telegramAutoDownload: true,
    telegramDownloadFolder: "tobyflow_bot",
    telegramDownloadResolution: "1k",
    telegramVideoDownloadResolution: "720p",
    mcpAutoDownload: false,
    mcpDownloadFolder: "tobyflow_mcp",
    mcpDownloadResolution: "1k",
    mcpVideoDownloadResolution: "720p",
    telegramDefaultProvider: "flow",
    telegramFlowRatio: "16:9",
    telegramFlowModel: null,
    telegramFlowVideoModel: null,
    telegramFlowVideoDuration: "6s",
    telegramFlowVideoInputType: "Ingredients",
    telegramChatgptRatio: "square",
    telegramGeminiRatio: null,
    telegramGeminiModel: null,
    telegramGrokRatio: "widescreen",
    telegramGrokDuration: "6s",
    telegramGrokResolution: "720p",
    telegramGrokImageQuality: "speed",
    notifySound: false,
    humanizedMode: false,
    humanizedSpeed: 0.5,
    defaultGenType: "Image",
    defaultRatio: "9:16",
    defaultImageRatio: "16:9",
    defaultVideoRatio: "16:9",
    defaultImageModel: null,
    defaultVideoModel: null,
    defaultVideoDuration: "6s",
    defaultProvider: "flow",
    chatgptDefaultRatio: "story",
    chatgptModel: null,
    chatgptFallbackPrefix: "Generate an image of: ",
    chatgptAutoClose: false,
    chatgptDeleteAfterGen: false,
    museDefaultRatio: null,
    museDeleteAfterGen: false,
    grokDefaultMode: "image",
    grokDefaultRatio: "widescreen",
    grokDefaultDuration: "6s",
    grokDefaultResolution: "720p",
    grokDefaultImageQuality: "speed",
    grokAutoClose: false,
  };
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  function _escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text || "";
    return div.innerHTML;
  }
  function _safeExternalHttpUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
      const url = new URL(value.trim());
      return ["https:", "http:"].includes(url.protocol) ? url.href : "";
    } catch (_) {
      return "";
    }
  }
  const els = {};
  function bindElements() {
    els.storageModeBadge = $("#storageModeBadge");
    els.inputTimeout = $("#inputTimeout");
    els.blobMaxAgeDays = $("#blobMaxAgeDays");
    els.randomDelayMin = $("#randomDelayMin");
    els.randomDelayMax = $("#randomDelayMax");
    els.queueEnabled = $("#queueEnabled");
    els.pipelineDisabledWarning = $("#pipelineDisabledWarning");
    els.manualSubmitMode = $("#manualSubmitMode");
    els.autoDownload = $("#autoDownloadToggle");
    els.flowApiAutoOpenTrackerGrid = $("#flowApiAutoOpenTrackerGrid");
    els.autoRemoveWatermark = $("#autoRemoveWatermarkToggle");
    els.autoRemoveWatermarkVideo = $("#autoRemoveWatermarkVideoToggle");
    els.autoRemoveWatermarkInput = $("#autoRemoveWatermarkInputToggle");
    els.downloadFolder = $("#downloadFolder");
    els.fileNameProject = $("#fileNameProject");
    els.fileNameTemplate = $("#fileNameTemplate");
    els.downloadResolution = $("#downloadResolution");
    els.videoDownloadResolution = $("#videoDownloadResolution");
    els.theme = $("#themeSelect");
    els.language = $("#languageSelect");
    els.notifyComplete = $("#notifyOnComplete");
    els.notifySound = $("#notifySound");
    els.notifyTelegram = $("#notifyTelegram");
    els.notifyTelegramRow = $("#notifyTelegramRow");
    els.notifyTelegramInTab = $("#notifyTelegramInTab");
    els.humanizedMode = $("#humanizedMode");
    els.humanizedSpeed = $("#humanizedSpeed");
    els.humanizedSpeedLabel = $("#humanizedSpeedLabel");
    els.defaultProvider = $("#defaultProvider");
    els.flowApiModeEnabled = $("#flowApiModeEnabled");
    els.flowGenMode = $("#flowGenMode");
    els.chatgptDefaultRatio = $("#chatgptDefaultRatio");
    els.chatgptDefaultModel = $("#chatgptDefaultModel");
    els.geminiDefaultModel = $("#geminiDefaultModel");
    els.geminiVideoRatio = $("#geminiVideoRatio");
    els.chatgptAutoClose = $("#chatgptAutoClose");
    els.chatgptDeleteAfterGen = $("#chatgptDeleteAfterGen");
    els.geminiAutoClose = $("#geminiAutoClose");
    els.geminiDeleteAfterGen = $("#geminiDeleteAfterGen");
    els.museDefaultRatio = $("#museDefaultRatio");
    els.museDeleteAfterGen = $("#museDeleteAfterGen");
    els.chatgptFallbackPrefix = $("#chatgptFallbackPrefix");
    els.grokDefaultMode = $("#grokDefaultMode");
    els.grokDefaultRatio = $("#grokDefaultRatio");
    els.grokDefaultDuration = $("#grokDefaultDuration");
    els.grokDefaultResolution = $("#grokDefaultResolution");
    els.grokDefaultImageQuality = $("#grokDefaultImageQuality");
    els.grokAutoClose = $("#grokAutoClose");
    els.defaultGenType = $("#defaultGenType");
    els.defaultImageRatio = $("#defaultImageRatio");
    els.defaultVideoRatio = $("#defaultVideoRatio");
    els.defaultImageModel = $("#defaultImageModel");
    els.defaultVideoModel = $("#defaultVideoModel");
    els.defaultVideoDuration = $("#defaultVideoDuration");
    els.clearCacheBtn = $("#clearCacheBtn");
    els.dataManagementSection = $("#dataManagementSection");
    els.exportBtn = $("#exportDataBtn");
    els.importBtn = $("#importDataBtn");
    els.importFile = $("#importFileInput");
    els.telegramStatusBadge = $("#telegramStatusBadge");
    els.telegramNotLinked = $("#telegramNotLinked");
    els.telegramOtpDisplay = $("#telegramOtpDisplay");
    els.telegramLinked = $("#telegramLinked");
    els.telegramLinkBtn = $("#telegramLinkBtn");
    els.telegramOtpCode = $("#telegramOtpCode");
    els.telegramOtpCodeSmall = $("#telegramOtpCodeSmall");
    els.telegramOtpCopyBtn = $("#telegramOtpCopyBtn");
    els.telegramOtpCancelBtn = $("#telegramOtpCancelBtn");
    els.telegramOtpCountdown = $("#telegramOtpCountdown");
    els.telegramBotLink = $("#telegramBotLink");
    els.telegramBotName = $("#telegramBotName");
    els.telegramUsername = $("#telegramUsername");
    els.telegramLinkedBot = $("#telegramLinkedBot");
    els.telegramBotType = $("#telegramBotType");
    els.telegramUnlinkBtn = $("#telegramUnlinkBtn");
    els.telegramBotOptions = $("#telegramBotOptions");
    els.telegramOptionShared = $("#telegramOptionShared");
    els.telegramOptionCustom = $("#telegramOptionCustom");
    els.telegramSharedBotLink = $("#telegramSharedBotLink");
    els.telegramCustomBotSetup = $("#telegramCustomBotSetup");
    els.telegramCustomBotToken = $("#telegramCustomBotToken");
    els.telegramSettingsSection = $("#telegramSettingsSection");
    els.telegramAutoDownload = $("#telegramAutoDownload");
    els.telegramDownloadFolder = $("#telegramDownloadFolder");
    els.telegramDownloadResolution = $("#telegramDownloadResolution");
    els.telegramVideoDownloadResolution = $("#telegramVideoDownloadResolution");
    els.mcpAutoDownload = $("#mcpAutoDownload");
    els.mcpDownloadFolder = $("#mcpDownloadFolder");
    els.mcpDownloadResolution = $("#mcpDownloadResolution");
    els.mcpVideoDownloadResolution = $("#mcpVideoDownloadResolution");
    els.telegramDefaultProvider = $("#telegramDefaultProvider");
    els.telegramFlowRatio = $("#telegramFlowRatio");
    els.telegramFlowModel = $("#telegramFlowModel");
    els.telegramFlowVideoModel = $("#telegramFlowVideoModel");
    els.telegramFlowVideoDuration = $("#telegramFlowVideoDuration");
    els.telegramFlowVideoInputType = $("#telegramFlowVideoInputType");
    els.telegramChatgptRatio = $("#telegramChatgptRatio");
    els.telegramGeminiRatio = $("#telegramGeminiRatio");
    els.telegramGeminiModel = $("#telegramGeminiModel");
    els.telegramGrokRatio = $("#telegramGrokRatio");
    els.telegramGrokDuration = $("#telegramGrokDuration");
    els.telegramGrokResolution = $("#telegramGrokResolution");
    els.telegramGrokImageQuality = $("#telegramGrokImageQuality");
    els.telegramGrokVideoFields = $("#telegramGrokVideoFields");
    els.telegramGrokImageFields = $("#telegramGrokImageFields");
    els.saveAllBtn = $("#saveAllSettingsBtn");
    els.saveStatus = $("#settingsSaveStatus");
  }
  async function loadSettings() {
    const result = await chrome.storage.local.get(["af_settings", "af_locale"]);
    const settings = { ...DEFAULTS, ...result.af_settings };
    for (const key of ["defaultImageModel", "telegramFlowModel"]) {
      settings[key] =
        window.ModelRegistry?.getCanonicalValue?.("flow", settings[key]) ||
        settings[key];
    }
    if (result.af_locale) {
      settings.language = result.af_locale;
    }
    updateUI(settings);
  }
  async function fetchAndMergeServerSettings() {
    try {
      const result = await chrome.storage.local.get(["af_auth", "af_settings"]);
      const auth = result.af_auth;
      if (!auth?.token) return;
      const resp = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            action: "apiRequest",
            method: "GET",
            endpoint: "settings",
            token: auth.token,
          },
          (r) => resolve(r),
        );
      });
      if (resp?.success && resp.data?.settings_json) {
        const touchedRes = await chrome.storage.local.get([
          "af_settings",
          "af_settings_touched",
        ]);
        const localSettings = touchedRes.af_settings || {};
        const touched = new Set(
          Array.isArray(touchedRes.af_settings_touched)
            ? touchedRes.af_settings_touched
            : [],
        );
        const localOverrides = {};
        for (const key of Object.keys(localSettings)) {
          if (
            touched.has(key) ||
            (Object.prototype.hasOwnProperty.call(
              result.af_settings || {},
              key,
            ) &&
              JSON.stringify(localSettings[key]) !==
                JSON.stringify(result.af_settings[key]))
          ) {
            localOverrides[key] = localSettings[key];
          }
        }
        const merged = {
          ...DEFAULTS,
          ...resp.data.settings_json,
          ...localOverrides,
        };
        await chrome.storage.local.set({ af_settings: merged });
        updateUI(merged);
        console.log(
          `[Settings] Synced settings from server (${Object.keys(localOverrides).length} local override)`,
        );
      }
    } catch (err) {
      console.warn("[Settings] Server settings fetch failed:", err.message);
    }
  }
  function updateUI(s) {
    if (els.storageModeBadge) {
      chrome.storage.local.get(["af_auth"], (result) => {
        const isLoggedIn = result.af_auth?.token;
        els.storageModeBadge.textContent = isLoggedIn ? "Cloud" : "Local";
        els.storageModeBadge.className =
          "s-section-badge" + (isLoggedIn ? " s-badge-cloud" : "");
      });
    }
    if (els.inputTimeout) els.inputTimeout.value = s.inputTimeout;
    if (els.blobMaxAgeDays) els.blobMaxAgeDays.value = s.blobMaxAgeDays;
    if (els.randomDelayMin) els.randomDelayMin.value = s.randomDelayMin;
    if (els.randomDelayMax) els.randomDelayMax.value = s.randomDelayMax;
    if (els.queueEnabled) els.queueEnabled.checked = s.queueEnabled;
    if (els.manualSubmitMode) els.manualSubmitMode.checked = s.manualSubmitMode;
    _toggleQueueSettings(s.queueEnabled);
    if (els.autoDownload) els.autoDownload.checked = s.autoDownload;
    if (els.flowApiAutoOpenTrackerGrid)
      els.flowApiAutoOpenTrackerGrid.checked =
        s.flowApiAutoOpenTrackerGrid !== false;
    if (els.autoRemoveWatermark)
      els.autoRemoveWatermark.checked = !!s.autoRemoveWatermark;
    if (els.autoRemoveWatermarkVideo)
      els.autoRemoveWatermarkVideo.checked = !!s.autoRemoveWatermarkVideo;
    if (els.autoRemoveWatermarkInput)
      els.autoRemoveWatermarkInput.checked = !!s.autoRemoveWatermarkInput;
    if (els.downloadFolder) els.downloadFolder.value = s.downloadFolder;
    if (els.fileNameProject)
      els.fileNameProject.value = s.fileNameProject || "";
    if (els.fileNameTemplate)
      els.fileNameTemplate.value =
        s.fileNameTemplate || "[Date]_[Project]_[Prompt]_[Index]";
    if (els.downloadResolution)
      els.downloadResolution.value = s.downloadResolution;
    if (els.videoDownloadResolution)
      els.videoDownloadResolution.value = s.videoDownloadResolution || "720p";
    _toggleDownloadSettings(s.autoDownload);
    if (els.theme) els.theme.value = s.theme;
    if (els.language) els.language.value = s.language || "vi";
    if (els.notifyComplete) els.notifyComplete.checked = s.notifyOnComplete;
    if (els.notifySound) els.notifySound.checked = s.notifySound;
    if (els.notifyTelegram)
      els.notifyTelegram.checked = s.notifyTelegram || false;
    if (els.notifyTelegramInTab)
      els.notifyTelegramInTab.checked = s.notifyTelegram || false;
    if (els.telegramAutoDownload)
      els.telegramAutoDownload.checked = s.telegramAutoDownload !== false;
    if (els.telegramDownloadFolder)
      els.telegramDownloadFolder.value =
        s.telegramDownloadFolder || "tobyflow_bot";
    if (els.telegramDownloadResolution)
      els.telegramDownloadResolution.value =
        s.telegramDownloadResolution || "1k";
    if (els.telegramVideoDownloadResolution)
      els.telegramVideoDownloadResolution.value =
        s.telegramVideoDownloadResolution || "720p";
    if (els.mcpAutoDownload)
      els.mcpAutoDownload.checked =
        s.mcpAutoDownload === true ||
        s.mcpAutoDownload === "1" ||
        s.mcpAutoDownload === 1;
    if (els.mcpDownloadFolder)
      els.mcpDownloadFolder.value = s.mcpDownloadFolder || "tobyflow_mcp";
    if (els.mcpDownloadResolution)
      els.mcpDownloadResolution.value = s.mcpDownloadResolution || "1k";
    if (els.mcpVideoDownloadResolution)
      els.mcpVideoDownloadResolution.value =
        s.mcpVideoDownloadResolution || "720p";
    if (els.telegramDefaultProvider)
      els.telegramDefaultProvider.value = s.telegramDefaultProvider || "flow";
    if (els.telegramFlowRatio)
      els.telegramFlowRatio.value = s.telegramFlowRatio || "16:9";
    if (els.telegramFlowModel)
      els.telegramFlowModel.value =
        window.ModelRegistry?.getCanonicalValue?.(
          "flow",
          s.telegramFlowModel,
        ) ||
        s.telegramFlowModel ||
        window.ModelRegistry?.safeGetDefault?.("flow", "image") ||
        "";
    if (els.telegramFlowVideoModel)
      els.telegramFlowVideoModel.value =
        window.ModelRegistry?.getCanonicalValue?.(
          "flow",
          s.telegramFlowVideoModel,
        ) ||
        s.telegramFlowVideoModel ||
        window.ModelRegistry?.safeGetDefault?.("flow", "video") ||
        "";
    if (els.telegramFlowVideoDuration)
      els.telegramFlowVideoDuration.value = s.telegramFlowVideoDuration || "6s";
    if (els.telegramFlowVideoInputType)
      els.telegramFlowVideoInputType.value =
        s.telegramFlowVideoInputType || "Ingredients";
    if (els.telegramChatgptRatio)
      els.telegramChatgptRatio.value = s.telegramChatgptRatio || "square";
    if (els.telegramGeminiRatio && s.telegramGeminiRatio)
      els.telegramGeminiRatio.value = s.telegramGeminiRatio;
    if (els.telegramGeminiModel && s.telegramGeminiModel)
      els.telegramGeminiModel.value = s.telegramGeminiModel;
    if (els.telegramGrokRatio)
      els.telegramGrokRatio.value = s.telegramGrokRatio || "widescreen";
    if (els.telegramGrokDuration)
      els.telegramGrokDuration.value = s.telegramGrokDuration || "6s";
    if (els.telegramGrokResolution)
      els.telegramGrokResolution.value = s.telegramGrokResolution || "720p";
    if (els.telegramGrokImageQuality)
      els.telegramGrokImageQuality.value =
        s.telegramGrokImageQuality || "speed";
    if (els.humanizedMode) els.humanizedMode.checked = s.humanizedMode;
    if (els.humanizedSpeed) els.humanizedSpeed.value = s.humanizedSpeed;
    if (els.humanizedSpeedLabel)
      els.humanizedSpeedLabel.textContent =
        parseFloat(s.humanizedSpeed).toFixed(1) + "x";
    if (els.defaultProvider)
      els.defaultProvider.value = s.defaultProvider || "flow";
    if (els.flowApiModeEnabled)
      els.flowApiModeEnabled.checked =
        s.apiModeEnabled === true ||
        s.apiModeEnabled === "true" ||
        s.apiModeEnabled === 1;
    if (els.flowGenMode)
      els.flowGenMode.value = s.defaultGenMode || s.gen_mode || "auto";
    _syncFlowModeCards();
    if (els.chatgptDefaultRatio)
      els.chatgptDefaultRatio.value = s.chatgptDefaultRatio || "story";
    if (els.chatgptDefaultModel && s.chatgptModel)
      els.chatgptDefaultModel.value = s.chatgptModel;
    if (els.geminiDefaultModel && s.geminiModel)
      els.geminiDefaultModel.value = s.geminiModel;
    if (els.geminiVideoRatio && s.geminiVideoRatio)
      els.geminiVideoRatio.value = s.geminiVideoRatio;
    if (els.chatgptAutoClose)
      els.chatgptAutoClose.checked = !!s.chatgptAutoClose;
    if (els.chatgptDeleteAfterGen)
      els.chatgptDeleteAfterGen.checked = !!s.chatgptDeleteAfterGen;
    if (els.geminiAutoClose) els.geminiAutoClose.checked = !!s.geminiAutoClose;
    if (els.geminiDeleteAfterGen)
      els.geminiDeleteAfterGen.checked = !!s.geminiDeleteAfterGen;
    if (els.museDefaultRatio && s.museDefaultRatio)
      els.museDefaultRatio.value = s.museDefaultRatio;
    if (els.museDeleteAfterGen)
      els.museDeleteAfterGen.checked = !!s.museDeleteAfterGen;
    if (els.chatgptFallbackPrefix)
      els.chatgptFallbackPrefix.value =
        s.chatgptFallbackPrefix || "Generate an image of: ";
    if (els.grokDefaultMode)
      els.grokDefaultMode.value = s.grokDefaultMode || "image";
    if (els.grokDefaultRatio)
      els.grokDefaultRatio.value = s.grokDefaultRatio || "widescreen";
    if (els.grokDefaultDuration)
      els.grokDefaultDuration.value = s.grokDefaultDuration || "6s";
    if (els.grokDefaultResolution)
      els.grokDefaultResolution.value = s.grokDefaultResolution || "720p";
    if (els.grokDefaultImageQuality)
      els.grokDefaultImageQuality.value = s.grokDefaultImageQuality || "speed";
    if (els.grokAutoClose) els.grokAutoClose.checked = !!s.grokAutoClose;
    _toggleGrokVideoFields();
    if (els.defaultGenType) els.defaultGenType.value = s.defaultGenType;
    if (els.defaultImageRatio)
      els.defaultImageRatio.value = s.defaultImageRatio || "16:9";
    if (els.defaultVideoRatio)
      els.defaultVideoRatio.value = s.defaultVideoRatio || "16:9";
    if (els.defaultImageModel)
      els.defaultImageModel.value =
        window.ModelRegistry?.getCanonicalValue?.(
          "flow",
          s.defaultImageModel,
        ) ||
        s.defaultImageModel ||
        "";
    if (els.defaultVideoModel)
      els.defaultVideoModel.value = s.defaultVideoModel;
    if (els.defaultVideoDuration)
      els.defaultVideoDuration.value = s.defaultVideoDuration || "6s";
  }
  function _toggleGrokVideoFields() {
    const isVideo = els.grokDefaultMode?.value === "video";
    document.querySelectorAll(".grok-video-only").forEach((r) => {
      r.style.display = isVideo ? "" : "none";
    });
    document.querySelectorAll(".grok-image-only").forEach((r) => {
      r.style.display = isVideo ? "none" : "";
    });
  }
  function collectSettings() {
    return {
      inputTimeout: parseInt(els.inputTimeout?.value) || 1200,
      blobMaxAgeDays: parseInt(els.blobMaxAgeDays?.value) || 7,
      randomDelayMin: parseInt(els.randomDelayMin?.value) || 3,
      randomDelayMax: parseInt(els.randomDelayMax?.value) || 10,
      queueEnabled: els.queueEnabled?.checked || false,
      manualSubmitMode: els.manualSubmitMode?.checked || false,
      autoDownload: els.autoDownload?.checked || false,
      flowApiAutoOpenTrackerGrid:
        els.flowApiAutoOpenTrackerGrid?.checked !== false,
      autoRemoveWatermark: els.autoRemoveWatermark?.checked || false,
      autoRemoveWatermarkVideo: els.autoRemoveWatermarkVideo?.checked || false,
      autoRemoveWatermarkInput: els.autoRemoveWatermarkInput?.checked || false,
      downloadFolder: els.downloadFolder?.value || "tobyflow_output",
      fileNameProject: els.fileNameProject?.value || "",
      fileNameTemplate:
        els.fileNameTemplate?.value || "[Date]_[Project]_[Prompt]_[Index]",
      downloadResolution: els.downloadResolution?.value || "1k",
      videoDownloadResolution: els.videoDownloadResolution?.value || "720p",
      theme: els.theme?.value || "dark",
      language: els.language?.value || "vi",
      notifyOnComplete: els.notifyComplete?.checked ?? true,
      notifySound: els.notifySound?.checked || false,
      notifyTelegram:
        els.notifyTelegramInTab?.checked ??
        els.notifyTelegram?.checked ??
        false,
      telegramAutoDownload: els.telegramAutoDownload?.checked !== false,
      telegramDownloadFolder:
        els.telegramDownloadFolder?.value || "tobyflow_bot",
      telegramDownloadResolution: els.telegramDownloadResolution?.value || "1k",
      telegramVideoDownloadResolution:
        els.telegramVideoDownloadResolution?.value || "720p",
      mcpAutoDownload: els.mcpAutoDownload?.checked === true,
      mcpDownloadFolder: els.mcpDownloadFolder?.value || "tobyflow_mcp",
      mcpDownloadResolution: els.mcpDownloadResolution?.value || "1k",
      mcpVideoDownloadResolution:
        els.mcpVideoDownloadResolution?.value || "720p",
      telegramDefaultProvider: els.telegramDefaultProvider?.value || "flow",
      telegramFlowRatio: els.telegramFlowRatio?.value || "16:9",
      telegramFlowModel:
        els.telegramFlowModel?.value ||
        window.ModelRegistry?.safeGetDefault?.("flow", "image") ||
        null,
      telegramFlowVideoModel:
        els.telegramFlowVideoModel?.value ||
        window.ModelRegistry?.safeGetDefault?.("flow", "video") ||
        null,
      telegramFlowVideoDuration: els.telegramFlowVideoDuration?.value || "6s",
      telegramFlowVideoInputType:
        els.telegramFlowVideoInputType?.value || "Ingredients",
      telegramChatgptRatio: els.telegramChatgptRatio?.value || "square",
      telegramGeminiRatio: els.telegramGeminiRatio?.value || null,
      telegramGeminiModel: els.telegramGeminiModel?.value || null,
      telegramGrokRatio: els.telegramGrokRatio?.value || "widescreen",
      telegramGrokDuration: els.telegramGrokDuration?.value || "6s",
      telegramGrokResolution: els.telegramGrokResolution?.value || "720p",
      telegramGrokImageQuality: els.telegramGrokImageQuality?.value || "speed",
      humanizedMode: els.humanizedMode?.checked || false,
      humanizedSpeed: parseFloat(els.humanizedSpeed?.value) || 0.5,
      defaultGenType: els.defaultGenType?.value || "Image",
      defaultImageRatio: els.defaultImageRatio?.value || "16:9",
      defaultVideoRatio: els.defaultVideoRatio?.value || "16:9",
      defaultImageModel:
        els.defaultImageModel?.value ||
        window.ModelRegistry?.safeGetDefault?.("flow", "image") ||
        null,
      defaultVideoModel:
        els.defaultVideoModel?.value ||
        window.ModelRegistry?.safeGetDefault?.("flow", "video") ||
        null,
      defaultVideoDuration: els.defaultVideoDuration?.value || "6s",
      defaultProvider: els.defaultProvider?.value || "flow",
      apiModeEnabled: els.flowApiModeEnabled?.checked || false,
      defaultGenMode: els.flowGenMode?.value || "auto",
      chatgptDefaultRatio: els.chatgptDefaultRatio?.value || "story",
      chatgptModel:
        els.chatgptDefaultModel?.value ||
        window.ModelRegistry?.safeGetDefault?.("chatgpt", "image") ||
        null,
      geminiModel: els.geminiDefaultModel?.value || null,
      geminiVideoRatio: els.geminiVideoRatio?.value || null,
      chatgptAutoClose: els.chatgptAutoClose?.checked || false,
      chatgptDeleteAfterGen: els.chatgptDeleteAfterGen?.checked || false,
      geminiAutoClose: els.geminiAutoClose?.checked || false,
      geminiDeleteAfterGen: els.geminiDeleteAfterGen?.checked || false,
      museDefaultRatio: els.museDefaultRatio?.value || null,
      museDeleteAfterGen: els.museDeleteAfterGen?.checked || false,
      chatgptFallbackPrefix:
        els.chatgptFallbackPrefix?.value || "Generate an image of: ",
      grokDefaultMode: els.grokDefaultMode?.value || "image",
      grokDefaultRatio: els.grokDefaultRatio?.value || "widescreen",
      grokDefaultDuration: els.grokDefaultDuration?.value || "6s",
      grokDefaultResolution: els.grokDefaultResolution?.value || "720p",
      grokDefaultImageQuality: els.grokDefaultImageQuality?.value || "speed",
      grokAutoClose: els.grokAutoClose?.checked || false,
    };
  }
  async function syncToServer(settings) {
    try {
      console.log(
        "[DEBUG_SYNC_SETTINGS] syncToServer called. defaultProvider in payload =",
        settings?.defaultProvider,
        "| key count =",
        Object.keys(settings || {}).length,
      );
      const result = await chrome.storage.local.get(["af_auth"]);
      const auth = result.af_auth;
      if (!auth?.token) {
        console.warn(
          "[DEBUG_SYNC_SETTINGS] SKIP: no auth token (user not logged in)",
        );
        return;
      }
      console.log("[DEBUG_SYNC_SETTINGS] Sending PUT /settings...");
      const response = await chrome.runtime.sendMessage({
        action: "apiRequest",
        method: "PUT",
        endpoint: "settings",
        data: { settings_json: settings },
        token: auth.token,
      });
      if (response?.success) {
        console.log(
          "[DEBUG_SYNC_SETTINGS] \u2705 Settings synced to server. Server saved defaultProvider =",
          response?.data?.settings_json?.defaultProvider,
        );
        console.log("[TobyFlow] Settings synced to server from settings page");
      } else {
        console.warn("[DEBUG_SYNC_SETTINGS] \u274C FAIL:", response);
        console.warn(
          "[TobyFlow] Settings server sync failed:",
          response?.error,
          "errors:",
          response?.errors || response?.data?.errors || "(no detail)",
        );
      }
    } catch (err) {
      const detail = err.errors || err.data?.errors || null;
      console.warn(
        "[DEBUG_SYNC_SETTINGS] \u274C EXCEPTION:",
        err.message,
        detail,
      );
      console.warn(
        "[TobyFlow] Settings server sync error:",
        err.message,
        detail ? { errors: detail } : "",
      );
    }
  }
  let _bridgeReadyAutoSavePromise = null;
  async function _autoSaveFlowModeSettings(apiEnabled = true) {
    if (
      !els.flowApiModeEnabled ||
      els.flowApiModeEnabled.checked !== apiEnabled
    )
      return;
    if (apiEnabled && els.flowApiModeEnabled.disabled) return;
    if (_bridgeReadyAutoSavePromise) {
      await _bridgeReadyAutoSavePromise.catch(() => {});
      return _autoSaveFlowModeSettings(apiEnabled);
    }
    _bridgeReadyAutoSavePromise = (async () => {
      const stored = await chrome.storage.local.get([
        "af_settings",
        "af_settings_touched",
      ]);
      if (els.flowApiModeEnabled.checked !== apiEnabled) return;
      const existing = stored.af_settings || {};
      const patch = apiEnabled
        ? { apiModeEnabled: true, queueEnabled: true }
        : { apiModeEnabled: false };
      const changed = Object.keys(patch).some(
        (key) => existing[key] !== patch[key],
      );
      if (!changed) return;
      const settings = { ...existing, ...patch };
      if (apiEnabled && els.queueEnabled) {
        els.queueEnabled.checked = true;
        _toggleQueueSettings(true);
      }
      const touched = new Set(
        Array.isArray(stored.af_settings_touched)
          ? stored.af_settings_touched
          : [],
      );
      Object.keys(patch).forEach((key) => touched.add(key));
      await chrome.storage.local.set({
        af_settings: settings,
        af_settings_touched: Array.from(touched),
      });
      window.BridgeClient?.setFlowApiMaintenance?.(
        apiEnabled && _flowApiEntitled,
      ).catch(() => {});
      await syncToServer(settings);
      chrome.runtime
        .sendMessage({
          action: "settingsSaved",
          message: window.I18n?.t("settings.allSettingsSaved") || null,
        })
        .catch(() => {});
      showStatus(
        els.saveStatus,
        window.I18n?.t("settings.allSettingsSaved") || "All settings saved!",
        "success",
      );
      setTimeout(() => hideStatus(els.saveStatus), 3e3);
      console.info("[Settings] Flow mode auto-saved", patch);
    })().finally(() => {
      _bridgeReadyAutoSavePromise = null;
    });
    return _bridgeReadyAutoSavePromise;
  }
  const _DEBUG = true;
  async function saveAllSettings() {
    els.saveAllBtn.disabled = true;
    els.saveAllBtn.textContent =
      window.I18n?.t("settings.saving") || "Saving...";
    try {
      const collected = collectSettings();
      if (collected.apiModeEnabled === true) {
        collected.queueEnabled = true;
        if (els.queueEnabled) {
          els.queueEnabled.checked = true;
          _toggleQueueSettings(true);
        }
        console.log("[Settings] Flow API dependency normalization:", {
          apiModeEnabled: collected.apiModeEnabled,
          defaultGenMode: collected.defaultGenMode,
          queueEnabled: collected.queueEnabled,
        });
      }
      if (_DEBUG) {
        console.log(
          "[Settings] Collected settings keys:",
          Object.keys(collected).sort().join(", "),
        );
        console.log("[Settings] User-controlled values:");
        console.log("  inputTimeout:", collected.inputTimeout);
        console.log(
          "  randomDelayMin/Max:",
          collected.randomDelayMin,
          "-",
          collected.randomDelayMax,
        );
        console.log("  queueEnabled:", collected.queueEnabled);
      }
      const existingResult = await chrome.storage.local.get([
        "af_settings",
        "af_locale",
      ]);
      const existing = existingResult.af_settings || {};
      const settings = { ...existing, ...collected };
      if (_DEBUG) {
        const deprecatedFields = [
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
        ];
        const foundDeprecated = deprecatedFields.filter(
          (f) => collected[f] !== void 0,
        );
        if (foundDeprecated.length > 0) {
          console.error(
            "[Settings] \u26A0 WARNING: Deprecated fields being saved:",
            foundDeprecated,
          );
        } else {
          console.log(
            "[Settings] \u2713 No deprecated execution fields in collected settings",
          );
        }
      }
      await chrome.storage.local.set({ af_settings: settings });
      try {
        const touchedRes = await chrome.storage.local.get([
          "af_settings_touched",
        ]);
        const touched = new Set(
          Array.isArray(touchedRes.af_settings_touched)
            ? touchedRes.af_settings_touched
            : [],
        );
        for (const k of Object.keys(collected)) {
          const a = collected[k],
            b = existing[k];
          const same =
            typeof a === "object" && a !== null
              ? JSON.stringify(a) === JSON.stringify(b)
              : a === b;
          if (!same) touched.add(k);
        }
        await chrome.storage.local.set({
          af_settings_touched: Array.from(touched),
        });
      } catch (_) {}
      const currentLocale =
        existingResult.af_locale || existing.language || "vi";
      if (collected.language && collected.language !== currentLocale) {
        if (window.I18n?.setLocale) {
          await window.I18n.setLocale(collected.language, true, true);
        }
      }
      syncToServer(settings);
      chrome.runtime
        .sendMessage({
          action: "settingsSaved",
          message:
            window.I18n?.t("settings.settingsUpdated") || "Settings updated",
        })
        .catch(() => {});
      showStatus(
        els.saveStatus,
        window.I18n?.t("settings.allSettingsSaved") || "All settings saved!",
        "success",
      );
      setTimeout(() => hideStatus(els.saveStatus), 3e3);
    } catch (error) {
      showStatus(
        els.saveStatus,
        (window.I18n?.t("common.error") || "Error") + ": " + error.message,
        "error",
      );
    } finally {
      els.saveAllBtn.disabled = false;
      els.saveAllBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> ${window.I18n?.t("settings.saveAllSettings") || "Save all settings"}`;
    }
  }
  async function exportData() {
    try {
      const data = await chrome.storage.local.get(["af_settings"]);
      const exportObj = {
        version: "2.1.0",
        type: "settings",
        exportedAt: new Date().toISOString(),
        data,
      };
      const blob = new Blob([JSON.stringify(exportObj, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tobyflow-settings-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      if (window.customDialog)
        window.customDialog.alert(
          (window.I18n?.t("settings.exportError") || "Error exporting data") +
            ": " +
            e.message,
          { title: window.I18n?.t("common.error") || "Error", type: "error" },
        );
    }
  }
  async function importData(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const shouldImport = window.customDialog
      ? await window.customDialog.confirm(
          window.I18n?.t("settings.importSettingsConfirm") ||
            "Import will overwrite current settings. Continue?",
          {
            title:
              window.I18n?.t("settings.importConfirmTitle") || "Confirm Import",
            type: "warning",
            confirmText: "Import",
            cancelText: window.I18n?.t("common.cancel") || "Cancel",
          },
        )
      : confirm(
          window.I18n?.t("settings.importSettingsConfirm") ||
            "Import will overwrite current settings. Continue?",
        );
    if (!shouldImport) {
      els.importFile.value = "";
      return;
    }
    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      if (!obj.data || !obj.version)
        throw new Error(
          window.I18n?.t("settings.invalidFileFormat") || "Invalid file format",
        );
      const settingsOnly = { af_settings: obj.data.af_settings };
      if (!settingsOnly.af_settings)
        throw new Error(
          window.I18n?.t("settings.noSettingsInFile") ||
            "File does not contain settings data",
        );
      await chrome.storage.local.set(settingsOnly);
      if (window.customDialog)
        window.customDialog.alert(
          window.I18n?.t("settings.importSuccess") || "Import successful!",
          {
            title: window.I18n?.t("common.success") || "Success",
            type: "success",
          },
        );
      loadSettings();
    } catch (e) {
      if (window.customDialog)
        window.customDialog.alert(
          (window.I18n?.t("settings.importError") || "Import error") +
            ": " +
            e.message,
          { title: window.I18n?.t("common.error") || "Error", type: "error" },
        );
    } finally {
      els.importFile.value = "";
    }
  }
  function updateDataManagementVisibility() {
    if (!els.dataManagementSection) return;
    chrome.storage.local.get(["af_auth"], (result) => {
      const isLoggedIn = !!result.af_auth?.token;
      els.dataManagementSection.style.display = isLoggedIn ? "none" : "";
    });
  }
  async function clearCache() {
    const shouldClear = window.customDialog
      ? await window.customDialog.confirm(
          window.I18n?.t("settings.clearCacheConfirm") ||
            "Clear cache (thumbnail cache, temp data, IndexedDB)? Settings and main data will not be affected.",
          {
            title: window.I18n?.t("settings.clearCacheTitle") || "Clear Cache",
            type: "warning",
            confirmText: window.I18n?.t("common.delete") || "Delete",
            cancelText: window.I18n?.t("common.cancel") || "Cancel",
          },
        )
      : confirm(
          window.I18n?.t("settings.clearCacheConfirm") ||
            "Clear cache (thumbnail cache, temp data, IndexedDB)? Settings and main data will not be affected.",
        );
    if (!shouldClear) return;
    try {
      const allData = await chrome.storage.local.get(null);
      const keysToRemove = Object.keys(allData).filter(
        (key) => key === "af_thumbnail_cache" || key.startsWith("af_temp_"),
      );
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
      }
      await new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase("autoflow_pro");
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve();
      });
      console.log(
        "[TobyFlow] \u0110\xE3 x\xF3a b\u1ED9 nh\u1EDB \u0111\u1EC7m:",
        keysToRemove.length,
        "kh\xF3a storage + IndexedDB",
      );
      if (window.customDialog) {
        window.customDialog.alert(
          window.I18n?.t("settings.clearCacheSuccess") ||
            "Cache cleared successfully!",
          {
            title: window.I18n?.t("common.success") || "Success",
            type: "success",
          },
        );
      }
    } catch (e) {
      console.error(
        "[TobyFlow] L\u1ED7i x\xF3a b\u1ED9 nh\u1EDB \u0111\u1EC7m:",
        e,
      );
      if (window.customDialog) {
        window.customDialog.alert(
          (window.I18n?.t("settings.clearCacheError") ||
            "Error clearing cache") +
            ": " +
            e.message,
          { title: window.I18n?.t("common.error") || "Error", type: "error" },
        );
      }
    }
  }
  async function loadUserProfile() {
    const container = document.getElementById("userProfileContent");
    if (!container) return;
    try {
      const result = await chrome.storage.local.get([
        "af_auth",
        "af_entitlements",
      ]);
      const auth = result.af_auth;
      const entitlements = result.af_entitlements;
      if (auth?.token && auth?.user) {
        const user = auth.user;
        const initial = _escapeHtml(
          (user.name || user.email || "?").charAt(0).toUpperCase(),
        );
        const planLabel = _escapeHtml(
          entitlements?.plan?.name ||
            user.plan_name ||
            user.plan_slug ||
            "Free",
        );
        const planSlug = (
          entitlements?.plan?.slug ||
          user.plan_slug ||
          ""
        ).toLowerCase();
        const isFreePlan =
          !planSlug || planSlug === "free" || planSlug === "trial";
        const isGoogleLinked = !!user.google_id;
        const googleTitle = isGoogleLinked
          ? window.I18n?.t("settings.googleLinkedHint") ||
            "Google linked \u2014 click to unlink"
          : window.I18n?.t("settings.linkGoogle") || "Link";
        const googleIconHtml = `
                <button class="s-profile-google-link${isGoogleLinked ? " linked" : ""}" id="googleLinkIcon" title="${googleTitle}" aria-label="${googleTitle}">
                  <svg width="14" height="14" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                </button>`;
        const upgradeBtnHtml = isFreePlan
          ? `
            <button class="s-btn s-btn-upgrade s-btn-sm" id="settingsUpgradeBtn" title="${window.I18n?.t("footer.upgrade") || "Upgrade"}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z"/></svg>
              ${window.I18n?.t("footer.upgrade") || "Upgrade"}
            </button>`
          : "";
        container.innerHTML = `
          <div class="s-profile-card">
            <button class="s-profile-avatar" id="settingsAvatarBtn" type="button" title="${window.I18n?.t("user.profile") || "Profile"}" aria-label="${window.I18n?.t("user.profile") || "Profile"}">${initial}</button>
            <div class="s-profile-info">
              <div class="s-profile-email">
                <span class="s-profile-email-text">${_escapeHtml(user.email || "")}</span>
                <button class="s-profile-change-pass" id="settingsChangePassBtn" title="${window.I18n?.t("settings.changePassword") || "Change password"}" aria-label="${window.I18n?.t("settings.changePassword") || "Change password"}">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>
                </button>
                ${googleIconHtml}
              </div>
              <div class="s-profile-meta">
                <span class="s-profile-plan">${planLabel}</span>
                <span class="s-profile-sep"></span>
                <span class="s-profile-storage">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                  Cloud
                </span>
              </div>
            </div>
            ${upgradeBtnHtml}
            <button class="s-btn s-btn-secondary s-btn-sm s-profile-dashboard-btn" id="settingsProfileBtn" type="button" title="${window.I18n?.t("user.profile") || "Profile"}" aria-label="${window.I18n?.t("user.profile") || "Profile"}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </button>
            <button class="s-btn s-btn-secondary s-btn-sm" id="settingsLogoutBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              ${window.I18n?.t("auth.logout") || "Logout"}
            </button>
          </div>
        `;
        document
          .getElementById("settingsUpgradeBtn")
          ?.addEventListener("click", () => {
            try {
              chrome.runtime.sendMessage({ action: "showUpgradeModal" });
            } catch (_) {}
          });
        const openDashboard = () => {
          const webBase =
            window.ApiBaseConfig?.getWebBase?.() || "https://labs.toby.vn";
          const url = `${webBase}/dashboard`;
          try {
            chrome.tabs.create({ url });
          } catch (_) {
            window.open(url, "_blank");
          }
        };
        document
          .getElementById("settingsAvatarBtn")
          ?.addEventListener("click", openDashboard);
        document
          .getElementById("settingsProfileBtn")
          ?.addEventListener("click", openDashboard);
        document
          .getElementById("settingsChangePassBtn")
          ?.addEventListener("click", () => {
            const webBase =
              window.ApiBaseConfig?.getWebBase?.() || "https://labs.toby.vn";
            const url = `${webBase}/dashboard/account#change-password`;
            try {
              chrome.tabs.create({ url });
            } catch (_) {
              window.open(url, "_blank");
            }
          });
        document
          .getElementById("googleLinkIcon")
          ?.addEventListener("click", () => _toggleGoogleLink(auth));
        document
          .getElementById("settingsLogoutBtn")
          ?.addEventListener("click", async () => {
            if (auth?.token) {
              try {
                await new Promise((resolve) => {
                  chrome.runtime.sendMessage(
                    {
                      action: "apiRequest",
                      method: "POST",
                      endpoint: "sse/end-session",
                      token: auth.token,
                    },
                    () => resolve(),
                  );
                });
              } catch (e) {}
              try {
                await new Promise((resolve) => {
                  chrome.runtime.sendMessage(
                    {
                      action: "apiRequest",
                      method: "POST",
                      endpoint: "auth/logout",
                      token: auth.token,
                    },
                    () => resolve(),
                  );
                });
              } catch (e) {}
            }
            await chrome.storage.local.remove([
              "af_auth",
              "af_entitlements",
              "af_settings",
            ]);
            window.close();
          });
      } else {
        container.innerHTML = `
          <div class="s-profile-anon">
            <div class="s-profile-anon-info">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              <div>
                <span class="s-profile-anon-label">${window.I18n?.t("settings.notLoggedIn") || "Not logged in"}</span>
                <span class="s-profile-storage-local">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                  ${window.I18n?.t("settings.storageLocal") || "Local storage"}
                </span>
              </div>
            </div>
            <button class="s-btn s-btn-primary s-btn-sm" id="settingsLoginBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>
              ${window.I18n?.t("auth.login") || "Login"}
            </button>
          </div>
        `;
        document
          .getElementById("settingsLoginBtn")
          ?.addEventListener("click", () => {
            chrome.runtime.sendMessage({ action: "openLoginModal" });
          });
      }
    } catch (e) {
      console.error("[TobyFlow] Error loading user profile:", e);
    }
  }
  function showStatus(el, msg, type) {
    if (!el) return;
    el.textContent = msg;
    el.className = `s-status ${type}`;
    el.classList.remove("hidden");
  }
  function hideStatus(el) {
    if (el) el.classList.add("hidden");
  }
  function _toggleQueueSettings(enabled) {
    els.pipelineDisabledWarning?.classList.toggle("hidden", enabled === true);
  }
  function _toggleDownloadSettings(enabled) {
    const fields = [
      els.downloadFolder,
      els.fileNameProject,
      els.fileNameTemplate,
      els.downloadResolution,
      els.videoDownloadResolution,
    ];
    fields.forEach((el) => {
      if (!el) return;
      el.disabled = !enabled;
      const field = el.closest(".s-field");
      if (field) field.style.opacity = enabled ? "" : "0.45";
    });
  }
  function bindEvents() {
    els.saveAllBtn?.addEventListener("click", saveAllSettings);
    els.clearCacheBtn?.addEventListener("click", clearCache);
    els.exportBtn?.addEventListener("click", exportData);
    els.importBtn?.addEventListener("click", () => els.importFile?.click());
    els.importFile?.addEventListener("change", importData);
    document
      .getElementById("settingsCloseBtn")
      ?.addEventListener("click", () => {
        window.close();
      });
    els.queueEnabled?.addEventListener("change", () => {
      _toggleQueueSettings(els.queueEnabled.checked);
    });
    els.autoDownload?.addEventListener("change", () => {
      _toggleDownloadSettings(els.autoDownload.checked);
    });
    els.autoRemoveWatermarkInput?.addEventListener("change", async (e) => {
      if (!e.target.checked) return;
      const noiDung =
        window.I18n?.t("settings.wmInputConfirmBody") ||
        "AUTOMATICALLY removes the Gemini watermark from images entering the workflow: images passed between nodes, and images you upload as references.\n\nIn exchange, each image must be downloaded, cleaned, then re-uploaded \u2014 workflows with many images will run noticeably slower.\n\nTurn this on?\u0110\u1ED5i l\u1EA1i, m\u1ED7i \u1EA3nh ph\u1EA3i t\u1EA3i v\u1EC1, xo\xE1 watermark r\u1ED3i t\u1EA3i l\xEAn l\u1EA1i \u2014 workflow nhi\u1EC1u \u1EA3nh s\u1EBD ch\u1EADm h\u01A1n \u0111\xE1ng k\u1EC3.\n\nB\u1EADt t\xEDnh n\u0103ng n\xE0y?";
      const tieuDe =
        window.I18n?.t("settings.wmInputConfirmTitle") ||
        "Clean intermediate images";
      let dongY = true;
      if (window.customDialog) {
        dongY = await window.customDialog.confirm(noiDung, {
          title: tieuDe,
          type: "warning",
          confirmText: window.I18n?.t("common.confirm") || "Confirm",
          cancelText: window.I18n?.t("common.cancel") || "Cancel",
        });
      }
      if (!dongY) e.target.checked = false;
    });
    document.querySelectorAll("[data-flow-mode]").forEach((card) => {
      card.addEventListener("click", () => {
        const api = card.dataset.flowMode === "api";
        if (api && els.flowApiModeEnabled?.disabled) return;
        if (els.flowApiModeEnabled) els.flowApiModeEnabled.checked = api;
        _syncFlowModeCards();
        els.flowApiModeEnabled?.dispatchEvent(
          new Event("change", { bubbles: true }),
        );
      });
      card.addEventListener("keydown", (event) => {
        if (
          !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
            event.key,
          )
        )
          return;
        event.preventDefault();
        const other = document.querySelector(
          `[data-flow-mode="${card.dataset.flowMode === "api" ? "ui" : "api"}"]`,
        );
        if (other && !other.disabled) {
          other.focus();
          other.click();
        }
      });
    });
    els.flowApiModeEnabled?.addEventListener("change", async () => {
      if (els.flowApiModeEnabled.checked === false) {
        _stopBridgePoll();
        _refreshFlowWebHealth();
      }
      try {
        await _autoSaveFlowModeSettings(
          els.flowApiModeEnabled.checked === true,
        );
      } catch (error) {
        console.warn(
          "[Settings] Flow mode auto-save failed:",
          error?.message || error,
        );
      }
      try {
        window.BridgeClient?.setFlowApiMaintenance?.(
          _flowApiEntitled && els.flowApiModeEnabled.checked === true,
        ).catch(() => {});
        if (els.flowApiModeEnabled.checked) renderBridgeGuide(false);
      } catch (_) {}
    });
    els.humanizedSpeed?.addEventListener("input", () => {
      if (els.humanizedSpeedLabel) {
        els.humanizedSpeedLabel.textContent =
          parseFloat(els.humanizedSpeed.value).toFixed(1) + "x";
      }
    });
    els.blobMaxAgeDays?.addEventListener("change", () => {});
    els.language?.addEventListener("change", async () => {
      const newLocale = els.language.value;
      if (window.I18n?.setLocale) {
        await window.I18n.setLocale(newLocale, true, true);
        window.I18n.applyTranslations(document.body);
        document.title = window.I18n.t("settings.title") || "Settings";
        _displayVersion();
      }
    });
    els.grokDefaultMode?.addEventListener("change", _toggleGrokVideoFields);
    els.notifyTelegram?.addEventListener("change", () => {
      if (els.notifyTelegramInTab) {
        els.notifyTelegramInTab.checked = els.notifyTelegram.checked;
      }
    });
    els.notifyTelegramInTab?.addEventListener("change", async () => {
      if (els.notifyTelegram) {
        els.notifyTelegram.checked = els.notifyTelegramInTab.checked;
      }
      try {
        const result = await chrome.storage.local.get(["af_settings"]);
        const settings = result.af_settings || {};
        settings.notifyTelegram = els.notifyTelegramInTab.checked;
        await chrome.storage.local.set({ af_settings: settings });
        syncToServer(settings);
      } catch (err) {
        console.error("[Settings] Auto-save notifyTelegram failed:", err);
      }
    });
    document
      .getElementById("openChromeDownloadSettings")
      ?.addEventListener("click", async () => {
        const tabs = await chrome.tabs.query({ url: "chrome://settings/*" });
        const existing = tabs.find(
          (t) => t.url && t.url.includes("settings/downloads"),
        );
        if (existing) {
          chrome.tabs.update(existing.id, { active: true });
          chrome.windows.update(existing.windowId, { focused: true });
        } else {
          chrome.tabs.create({ url: "chrome://settings/downloads" });
        }
      });
    document
      .getElementById("openChromeExtensions")
      ?.addEventListener("click", async () => {
        const tabs = await chrome.tabs.query({ url: "chrome://extensions/*" });
        const existing = tabs[0];
        if (existing) {
          chrome.tabs.update(existing.id, { active: true });
          chrome.windows.update(existing.windowId, { focused: true });
        } else {
          chrome.tabs.create({ url: "chrome://extensions/" });
        }
      });
    els.telegramLinkBtn?.addEventListener("click", handleTelegramLink);
    els.telegramOtpCopyBtn?.addEventListener("click", handleTelegramOtpCopy);
    els.telegramOtpCancelBtn?.addEventListener(
      "click",
      handleTelegramOtpCancel,
    );
    els.telegramUnlinkBtn?.addEventListener("click", handleTelegramUnlink);
    els.telegramOptionShared?.addEventListener("click", () =>
      selectTelegramBotOption("shared"),
    );
    els.telegramOptionCustom?.addEventListener("click", () =>
      selectTelegramBotOption("custom"),
    );
    document
      .getElementById("mcpCreateTokenBtn")
      ?.addEventListener("click", handleMcpCreateToken);
  }
  function _mcpToast(msg, type = "info") {
    if (window.customDialog?.alert) {
      window.customDialog.alert(msg, { type });
    } else {
      console.log("[MCP-settings]", msg);
    }
  }
  function _flowApiConnectedToast(health = null) {
    const key =
      health?.fallbackFrom === "v2" && health?.driver === "v1"
        ? "settings.flowApiV1Fallback"
        : health?.driver === "v2"
          ? "settings.flowApiV2Connected"
          : "settings.flowApiConnected";
    _mcpToast(
      window.I18n?.t?.(key) ||
        (health?.driver === "v2"
          ? "Flow API V2 connected"
          : "Flow API connected successfully"),
      "success",
    );
  }
  let _mcpLoadVersion = 0;
  async function _loadMcpTokens() {
    const loadVersion = ++_mcpLoadVersion;
    let enabled = false;
    try {
      const r = await chrome.storage.local.get(["af_auth", "af_entitlements"]);
      const ent = r.af_entitlements?.entitlements || {};
      const v = ent.mcp_enabled?.value ?? ent.mcp_enabled;
      const userId = r.af_auth?.user?.id;
      enabled =
        !!r.af_auth?.token &&
        !!userId &&
        r.af_entitlements?.user_id === userId &&
        (v === "1" || v === 1 || v === true);
    } catch (_) {}
    if (loadVersion !== _mcpLoadVersion) return;
    const lockedEl = document.getElementById("mcpLocked");
    const manageEl = document.getElementById("mcpTokenManage");
    const guideEl = document.getElementById("mcpConnectGuide");
    const createEl = document.getElementById("mcpCreateControls");
    if (lockedEl) lockedEl.classList.toggle("hidden", enabled);
    if (guideEl) guideEl.classList.toggle("hidden", !enabled);
    if (createEl) createEl.classList.toggle("hidden", !enabled);
    if (enabled) _bindMcpConnectGuide();
    const upBtn = document.getElementById("mcpUpgradeBtn");
    if (upBtn && !upBtn._bound) {
      upBtn._bound = true;
      upBtn.addEventListener("click", () =>
        chrome.runtime.sendMessage({ action: "openUpgradeModal" }),
      );
    }
    const resp = await _telegramApiCall("GET", "mcp/tokens");
    if (loadVersion !== _mcpLoadVersion) return;
    const tokens = resp?.data || (resp?.success && resp.data) || [];
    const tokenList = Array.isArray(tokens) ? tokens : [];
    if (manageEl)
      manageEl.classList.toggle("hidden", !enabled && tokenList.length === 0);
    _renderMcpTokenList(tokenList);
    const n = tokenList.length;
    const badge = document.getElementById("mcpStatusBadge");
    if (badge) {
      badge.textContent =
        enabled && n > 0
          ? `${n} token`
          : window.I18n?.t("settings.notLinked") || "Not linked";
    }
  }
  let _deviceLoadVersion = 0;
  async function _loadExtensionDevices() {
    const loadVersion = ++_deviceLoadVersion;
    const listEl = document.getElementById("extensionDeviceList");
    if (!listEl) return;
    let resp = await _telegramApiCall("GET", "extension-devices");
    if (loadVersion !== _deviceLoadVersion) return;
    let claim = null;
    let registrationError = null;
    if (!resp?.current_registered) {
      try {
        claim = await window.ExtensionDeviceManager?.claim?.();
        if (loadVersion !== _deviceLoadVersion) return;
        resp = await _telegramApiCall("GET", "extension-devices");
      } catch (error) {
        registrationError = String(error?.message || "unknown error").replace(
          /[<>&"]/g,
          "",
        );
      }
      if (loadVersion !== _deviceLoadVersion) return;
    }
    const devices = Array.isArray(resp?.data) ? resp.data : [];
    if (!devices.length) {
      const registrationCode = claim?.registration_code;
      if (registrationCode === "EXTENSION_DEVICE_LIMIT_UNCONFIGURED") {
        listEl.innerHTML =
          '<p class="s-hint">Device limit is not configured for this plan yet. Contact the administrator.</p>';
      } else if (registrationCode === "EXTENSION_DEVICE_LIMIT_REACHED") {
        listEl.innerHTML =
          '<p class="s-hint">Your plan has no available device slot.</p>';
      } else if (registrationCode === "EXTENSION_DEVICE_REVOKED") {
        listEl.innerHTML =
          '<p class="s-hint">This extension device was removed and cannot register again.</p>';
      } else if (registrationError) {
        listEl.innerHTML = `<p class="s-hint">Could not register this extension device: ${registrationError}</p>`;
      } else {
        listEl.innerHTML =
          '<p class="s-hint">Devices register automatically when the extension connects.</p>';
      }
      return;
    }
    listEl.innerHTML =
      devices
        .map((device) => {
          const label = String(device.label || "TobyFlow extension").replace(
            /[<>&"]/g,
            "",
          );
          const deviceCode = String(device.device_code || "").replace(
            /[^A-Z0-9]/g,
            "",
          );
          const state = device.revoked_at
            ? "Removed"
            : device.current
              ? "This device"
              : "Active";
          const lastSeen = device.last_seen_at
            ? new Date(device.last_seen_at).toLocaleString()
            : "Never connected";
          const removeAction =
            !device.current && !device.revoked_at
              ? `<button class="s-btn s-btn-secondary s-btn-sm extension-device-revoke extension-device-remove" data-device-id="${device.id}" title="Remove device" aria-label="Remove device"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v5M14 11v5"></path></svg></button>`
              : "";
          return `<div class="mcp-token-row${device.revoked_at ? " mcp-token-row--expired" : ""}">
        <div class="mcp-token-info"><span class="mcp-token-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="13" rx="2"></rect><path d="M8 21h8M12 17v4"></path></svg></span><div class="mcp-token-details"><div class="mcp-token-name">${label}${deviceCode ? ` \xB7 ${deviceCode}` : ""} ${device.current ? '<span class="mcp-device-badge-current">THIS DEVICE</span>' : ""}</div><div class="mcp-token-meta"><span>${state}</span><span>\xB7</span><span>${lastSeen}</span></div></div></div>
        <div class="extension-device-actions"><button class="s-btn s-btn-secondary s-btn-sm extension-device-rename" data-device-id="${device.id}" data-device-label="${label}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg><span>Rename</span></button>${removeAction}</div>
      </div>`;
        })
        .join("") +
      (resp?.current_registered
        ? ""
        : `<p class="s-hint" style="margin-top:8px;">${registrationError ? `Could not register this extension device: ${registrationError}` : "This extension will register automatically after it connects."}</p>`);
    listEl.querySelectorAll(".extension-device-revoke").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const ok = window.customDialog?.confirm
          ? await window.customDialog.confirm(
              "Remove this extension device? The extension currently open will be activated as its replacement.",
              { type: "warning" },
            )
          : true;
        if (!ok) return;
        const result = await _telegramApiCall(
          "DELETE",
          `extension-devices/${btn.dataset.deviceId}`,
        );
        if (result?.success) {
          _loadExtensionDevices();
          if (result.replacement_registered === false)
            _mcpToast(
              "Device removed, but this extension could not be registered automatically. Check Devices and try again after it reconnects.",
              "warning",
            );
        } else
          _mcpToast(
            result?.error?.message || "Could not remove device",
            "error",
          );
      }),
    );
    listEl.querySelectorAll(".extension-device-rename").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const label = window.customDialog?.prompt
          ? await window.customDialog.prompt(
              "Enter a name you will recognize when choosing this MCP device.",
              {
                title: "Name this device",
                icon: "device",
                placeholder: "Example: MacBook work",
                defaultValue: btn.dataset.deviceLabel || "",
                confirmText: "Save",
                cancelText: "Cancel",
              },
            )
          : null;
        if (label === null) return;
        const trimmed = String(label).trim();
        if (!trimmed)
          return _mcpToast("Device name cannot be empty.", "warning");
        btn.disabled = true;
        const result = await _telegramApiCall(
          "PATCH",
          `extension-devices/${btn.dataset.deviceId}`,
          { label: trimmed },
        );
        if (result?.success) _loadExtensionDevices();
        else {
          btn.disabled = false;
          _mcpToast(
            result?.error?.message || "Could not rename device",
            "error",
          );
        }
      }),
    );
  }
  function _bindMcpConnectGuide() {
    document.querySelectorAll(".mcp-client-tab").forEach((tab) => {
      if (tab._bound) return;
      tab._bound = true;
      tab.addEventListener("click", () => {
        const client = tab.dataset.mcpClient;
        document.querySelectorAll(".mcp-client-tab").forEach((item) => {
          const active = item === tab;
          item.classList.toggle("active", active);
          item.setAttribute("aria-selected", String(active));
          item.tabIndex = active ? 0 : -1;
        });
        document.querySelectorAll(".mcp-client-guide").forEach((guide) => {
          const active = guide.dataset.mcpGuide === client;
          guide.classList.toggle("active", active);
          guide.hidden = !active;
        });
      });
    });
    document.querySelectorAll(".mcp-config-copy-btn").forEach((btn) => {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener("click", async () => {
        const txt =
          document.getElementById(btn.dataset.copyTarget)?.textContent || "";
        if (!txt) return;
        try {
          await navigator.clipboard.writeText(txt);
          const orig = btn.innerHTML;
          btn.innerHTML =
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
          setTimeout(() => {
            btn.innerHTML = orig;
          }, 1500);
        } catch (_) {
          _mcpToast(
            window.I18n?.t("settings.copyFailed") || "Copy failed",
            "error",
          );
        }
      });
    });
  }
  function _renderMcpTokenList(tokens) {
    const listEl = document.getElementById("mcpTokenList");
    if (!listEl) return;
    if (!tokens || tokens.length === 0) {
      listEl.innerHTML = `<p class="s-hint" data-i18n="settings.mcpNoTokens">No tokens yet.</p>`;
      return;
    }
    listEl.innerHTML = tokens
      .map((t) => {
        const label = (t.label || t.name || "token").replace(/[<>&"]/g, "");
        const last = t.last_used_at
          ? new Date(t.last_used_at).toLocaleDateString()
          : window.I18n?.t("settings.mcpNeverUsed") || "never used";
        const expired = t.expired === true;
        let expiryHtml;
        if (t.expires_at) {
          const exp = new Date(t.expires_at);
          if (expired) {
            expiryHtml = `<span class="mcp-token-expiry--expired">${window.I18n?.t("settings.mcpTokenExpired") || "Expired"}</span>`;
          } else {
            const days = Math.max(
              0,
              Math.ceil((exp.getTime() - Date.now()) / 864e5),
            );
            const cls = days <= 7 ? "mcp-token-expiry--soon" : "";
            const expiresLbl =
              window.I18n?.t("settings.mcpTokenExpires") || "Expires";
            const daysLbl =
              window.I18n?.t("settings.mcpTokenDaysLeft") || "days";
            expiryHtml = `<span class="${cls}">${expiresLbl}: ${exp.toLocaleDateString()} (${days} ${daysLbl})</span>`;
          }
        } else {
          expiryHtml = `<span>${window.I18n?.t("settings.mcpTokenNoExpiry") || "No expiry"}</span>`;
        }
        const revokeTitle = window.I18n?.t("settings.mcpRevoke") || "Revoke";
        const expiredBadge = expired
          ? ` <span class="mcp-token-badge-expired">${window.I18n?.t("settings.mcpTokenExpiredBadge") || "EXPIRED"}</span>`
          : "";
        return `<div class="mcp-token-row${expired ? " mcp-token-row--expired" : ""}">
        <div class="mcp-token-info">
          <span class="mcp-token-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"></circle><path d="m11 12 8-8"></path><path d="m18 5 2 2"></path><path d="m15 8 2 2"></path></svg>
          </span>
          <div class="mcp-token-details">
            <div class="mcp-token-name">${label}${expiredBadge}</div>
            <div class="mcp-token-meta"><span>${last}</span><span>\xB7</span>${expiryHtml}</div>
          </div>
        </div>
        <button class="s-btn s-btn-secondary s-btn-sm mcp-revoke-btn" data-token-id="${t.id}" title="${revokeTitle}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
        </button>
      </div>`;
      })
      .join("");
    listEl.querySelectorAll(".mcp-revoke-btn").forEach((btn) => {
      btn.addEventListener("click", () =>
        handleMcpRevokeToken(btn.dataset.tokenId),
      );
    });
  }
  async function handleMcpCreateToken() {
    const labelInput = document.getElementById("mcpTokenLabel");
    const label = labelInput?.value?.trim() || "";
    const btn = document.getElementById("mcpCreateTokenBtn");
    if (btn) btn.disabled = true;
    try {
      const resp = await _telegramApiCall("POST", "mcp/tokens", { label });
      const token = resp?.data?.token;
      if (!token) {
        _mcpToast(
          resp?.error?.message ||
            window.I18n?.t("settings.mcpCreateFailed") ||
            "Could not create token",
          "error",
        );
        return;
      }
      const disp = document.getElementById("mcpNewTokenDisplay");
      const valEl = document.getElementById("mcpNewTokenValue");
      if (valEl) valEl.textContent = token;
      if (disp) disp.classList.remove("hidden");
      const copyBtn = document.getElementById("mcpTokenCopyBtn");
      if (copyBtn) {
        copyBtn.onclick = () => {
          navigator.clipboard
            ?.writeText(token)
            .then(() =>
              _mcpToast(
                window.I18n?.t("settings.copied") || "Copied",
                "success",
              ),
            );
        };
      }
      if (labelInput) labelInput.value = "";
      try {
        await chrome.storage.local.set({ toby_mcp_token_revision: Date.now() });
      } catch (_) {}
      _loadMcpTokens();
    } catch (e) {
      _mcpToast(e?.message || "Error", "error");
    } finally {
      if (btn) btn.disabled = false;
    }
  }
  async function handleMcpRevokeToken(id) {
    if (!id) return;
    const ok = window.customDialog?.confirm
      ? await window.customDialog.confirm(
          window.I18n?.t("settings.mcpRevokeConfirm") ||
            "Revoke this token? MCP clients using it will stop working.",
          { type: "warning" },
        )
      : true;
    if (!ok) return;
    const resp = await _telegramApiCall("DELETE", `mcp/tokens/${id}`);
    if (resp?.success) {
      try {
        await chrome.storage.local.set({ toby_mcp_token_revision: Date.now() });
      } catch (_) {}
      _loadMcpTokens();
    } else {
      _mcpToast(resp?.error?.message || "Revoke failed", "error");
    }
  }
  let _settingsIsLoggedIn = false;
  function _settingsCanFreePlanUse(featureKey) {
    if (!featureKey) return null;
    const plans = window._cachedPlans;
    if (!Array.isArray(plans) || plans.length === 0) return null;
    const free = plans.find((p) => p?.slug === "free");
    if (!free || !Array.isArray(free.features)) return null;
    const f = free.features.find((x) => x?.key === featureKey);
    if (!f) return false;
    const v = f.value;
    if (f.type === "boolean") {
      return v === true || v === "1" || v === 1;
    }
    if (f.type === "quota") {
      if (v === "unlimited" || v === -1 || v === "-1") return true;
      const limit = typeof v === "string" ? parseInt(v, 10) : v;
      return Number.isFinite(limit) && limit > 0;
    }
    return (
      v !== null &&
      v !== void 0 &&
      v !== "0" &&
      v !== 0 &&
      v !== false &&
      v !== ""
    );
  }
  function _settingsGetCrownLabel(featureKey) {
    if (!_settingsIsLoggedIn) {
      const freeHas = featureKey ? _settingsCanFreePlanUse(featureKey) : null;
      if (freeHas === true) {
        return window.I18n?.t("common.requireLogin") || "Login required";
      }
    }
    return window.I18n?.t("common.upgrade") || "Upgrade";
  }
  function _settingsRenderCrownHTML(featureKey) {
    const label = _settingsGetCrownLabel(featureKey);
    return (
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z"></path></svg> ' +
      label
    );
  }
  async function _fetchPlansForCrowns() {
    if (Array.isArray(window._cachedPlans) && window._cachedPlans.length > 0)
      return;
    try {
      const resp = await new Promise((resolve, reject) => {
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
      if (Array.isArray(resp)) {
        window._cachedPlans = resp;
      }
    } catch (e) {
      console.warn("[Settings] Fetch plans failed:", e.message);
    }
  }
  function _cmpVersion(a, b) {
    const pa = String(a || "0")
      .split(".")
      .map(Number);
    const pb = String(b || "0")
      .split(".")
      .map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d !== 0) return d < 0 ? -1 : 1;
    }
    return 0;
  }
  const _FLOW_HEALTH_STALE_MS = 6e4;
  const _FLOW_RECOVERY_WATCH_MS = 12e4;
  let _bridgePollTimer = null;
  let _bridgePollDeadline = 0;
  let _bridgeBootstrapObserved = false;
  let _bridgeFallbackObserved = false;
  let _flowApiHealthAt = 0;
  let _flowWebHealthAt = 0;
  let _bridgeActionPromise = null;
  let _bridgeActionType = null;
  let _bridgeLastError = null;
  let _bridgeDetected = false;
  let _bridgeRenderSeq = 0;
  let _flowApiEntitled = false;
  let _bridgeSystemConfigWarmPromise = null;
  async function _ensureBridgeReleaseConfig(force = false) {
    if (!_bridgeSystemConfigWarmPromise) {
      _bridgeSystemConfigWarmPromise = Promise.resolve(
        window.SystemConfig?.restoreFromStorage?.(),
      ).catch(() => null);
    }
    await _bridgeSystemConfigWarmPromise;
    return window.SystemConfig?.fetch?.(force ? { force: true } : false);
  }
  function _stopBridgePoll() {
    if (_bridgePollTimer) clearInterval(_bridgePollTimer);
    _bridgePollTimer = null;
  }
  function _startBridgePoll() {
    if (!_flowApiEntitled) {
      _stopBridgePoll();
      return;
    }
    _bridgePollDeadline = Date.now() + _FLOW_RECOVERY_WATCH_MS;
    if (_bridgePollTimer) return;
    _bridgePollTimer = setInterval(() => {
      if (!_flowApiEntitled) {
        _stopBridgePoll();
        return;
      }
      if (Date.now() >= _bridgePollDeadline) {
        _stopBridgePoll();
        return;
      }
      const panel = document.getElementById("bridgeGuidePanel");
      if (document.hidden || !panel || panel.style.display === "none") return;
      renderBridgeGuide();
    }, 5e3);
  }
  function _watchBridgeFallback(status, apiSelected, apiConnected, bridgeBusy) {
    const fallback =
      apiSelected &&
      status.effectiveDriver === "v1" &&
      status.fallbackFrom === "v2";
    if (fallback && !_bridgeFallbackObserved) _startBridgePoll();
    if (!fallback && apiConnected && !bridgeBusy) _stopBridgePoll();
    _bridgeFallbackObserved = fallback;
  }
  function _syncFlowModeCards() {
    const runtimeDisabled =
      globalThis.SystemConfig?.get?.("flow_api_driver", null) === "disabled";
    const apiSelected =
      !runtimeDisabled && els.flowApiModeEnabled?.checked === true;
    document.querySelectorAll("[data-flow-mode]").forEach((card) => {
      const isApi = card.dataset.flowMode === "api";
      const selected = isApi === apiSelected;
      card.setAttribute("aria-checked", String(selected));
      card.disabled =
        isApi && (runtimeDisabled || els.flowApiModeEnabled?.disabled === true);
      card.tabIndex = selected && !card.disabled ? 0 : -1;
    });
    const web = document.getElementById("flowWebModeCard");
    if (web && els.flowApiModeEnabled?.disabled) web.tabIndex = 0;
  }
  async function _isFlowReloadChecking() {
    const stored = await chrome.storage.session
      .get("flowReloadUiState")
      .catch(() => ({}));
    const state = stored?.flowReloadUiState;
    return (
      state?.active === true &&
      Date.now() - Number(state.at) >= 0 &&
      Date.now() - Number(state.at) < 3e5
    );
  }
  function _setFlowHealthChecking(mode, checking) {
    const prefix = mode === "api" ? "flowMaxSpeed" : "flowWebMode";
    const badge = document.getElementById(prefix + "Badge");
    const checks = document.getElementById(prefix + "Checks");
    const label = window.I18n?.t("settings.providerStatusChecking") || "";
    if (badge) {
      badge.classList.toggle("is-checking", checking);
      badge.setAttribute("aria-busy", String(checking));
      if (checking) {
        badge.classList.remove("is-ready", "is-warn");
        badge.textContent = label;
      }
    }
    if (checks) {
      if (checking && !checks.children.length) {
        checks.innerHTML = (
          mode === "api" ? ["bridge", "api", "account"] : ["account"]
        )
          .map((kind) => _flowHealthIcon(kind, false, label))
          .join("");
      }
      checks.querySelectorAll(".s-flow-health-icon").forEach((icon) => {
        icon.classList.toggle("is-checking", checking);
        icon.setAttribute("aria-busy", String(checking));
        if (checking) {
          icon.setAttribute("data-tooltip", label);
          icon.setAttribute("aria-label", label);
        }
      });
    }
  }
  function _flowHealthIcon(kind, ready, label) {
    const paths = {
      bridge: '<path d="M8 3v4m8-4v4M6 7h12v4a6 6 0 0 1-12 0V7Zm6 10v4"/>',
      api: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 20"/>',
      account:
        '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    };
    const icon = document.createElement("span");
    icon.className = `s-flow-health-icon s-flow-health-icon--${kind} ${ready ? "is-ready" : "is-warn"}`;
    icon.setAttribute("data-tooltip", label);
    icon.setAttribute("role", "img");
    icon.setAttribute("aria-label", label);
    icon.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[kind]}</svg>`;
    return icon.outerHTML;
  }
  function _renderFlowModeHealth(ping, status, apiConnected, t) {
    const configBlocked = ["build_drift", "protocol_config_missing"].includes(
      status.validationReason,
    );
    const blockedLabel = configBlocked
      ? t(
          "settings.flowApiV2BuildDrift",
          "Google Flow changed. Update TobyFlow or contact support before retrying.",
        )
      : null;
    const versionBadge = document.getElementById("flowMaxSpeedVersion");
    if (versionBadge) {
      const driver =
        status.effectiveDriver === "v2"
          ? "V2"
          : status.effectiveDriver === "v1"
            ? "V1"
            : null;
      const isFallback = driver === "V1" && status.fallbackFrom === "v2";
      versionBadge.classList.toggle("is-fallback", apiConnected && isFallback);
      versionBadge.classList.toggle("is-inactive", !apiConnected);
      versionBadge.textContent = apiConnected
        ? `API ${driver || "\u2014"}${isFallback ? " \u21A9" : ""}`
        : driver
          ? `API ${driver}`
          : "API";
      versionBadge.title = apiConnected
        ? window.I18n?.t?.("settings.flowApiActiveVersion", {
            version: `API ${driver || "\u2014"}`,
          }) || `Active API version: ${driver || "\u2014"}`
        : t(
            "settings.flowApiInactiveHint",
            "No Flow API version is currently ready",
          );
    }
    const max = document.getElementById("flowMaxSpeedChecks");
    if (max)
      max.innerHTML =
        _flowHealthIcon(
          "bridge",
          ping.installed === true,
          ping.installed
            ? t("settings.bridgeHealthInstalled", "TobyBridge Install")
            : t(
                "settings.bridgeDotOff",
                "TobyBridge not installed \u2014 click for instructions",
              ),
        ) +
        _flowHealthIcon(
          "api",
          status.sessionReady === true,
          status.sessionReady
            ? t("settings.bridgeHealthTokenReady", "Flow API Connected")
            : blockedLabel ||
                t(
                  "settings.bridgeHealthTokenMissing",
                  "Google session not captured",
                ),
        ) +
        _flowHealthIcon(
          "account",
          status.sessionVerified === true,
          status.sessionVerified
            ? t(
                "settings.bridgeHealthSessionReady",
                "Google Flow sign-in verified",
              )
            : blockedLabel ||
                t(
                  "settings.bridgeHealthSessionMissing",
                  "Google Flow sign-in not verified",
                ),
        );
    const apiBadge = document.getElementById("flowMaxSpeedBadge");
    const connectionVisual = document.getElementById(
      "flowMaxSpeedLockedConnection",
    );
    const showConnectedVisual = _flowApiEntitled === true && !!apiConnected;
    if (connectionVisual) {
      connectionVisual.hidden = !showConnectedVisual;
      connectionVisual.classList.toggle("is-connected", showConnectedVisual);
      connectionVisual.setAttribute(
        "aria-label",
        showConnectedVisual
          ? t("workflow.connected", "Connected")
          : "TobyFlow connecting to Flow API",
      );
    }
    if (apiBadge) {
      apiBadge.hidden = showConnectedVisual;
      apiBadge.style.display = showConnectedVisual ? "none" : "";
      const count = [
        ping.installed === true,
        status.sessionReady === true,
        status.sessionVerified === true,
      ].filter(Boolean).length;
      apiBadge.textContent = _flowConnectionBadgeLabel(
        !!apiConnected,
        count,
        3,
        t,
      );
      apiBadge.title = t("settings.bridgeHealthTitle", "Connection checks");
      apiBadge.classList.toggle("is-ready", !!apiConnected);
      apiBadge.classList.toggle("is-warn", !apiConnected);
    }
  }
  function _flowConnectionBadgeLabel(ready, count, total, t) {
    const label = ready
      ? t("workflow.connected", "Connected")
      : t("workflow.notConnected", "Not connected");
    return `${label.charAt(0).toLocaleUpperCase()}${label.slice(1)} ${count}/${total}`;
  }
  let _flowWebHealthPending = false;
  async function _refreshFlowWebHealth() {
    if (_flowWebHealthPending || document.hidden) return;
    _flowWebHealthPending = true;
    _setFlowHealthChecking("web", true);
    try {
      if (await _isFlowReloadChecking()) return;
      const status = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 8e3);
        try {
          chrome.runtime.sendMessage(
            { action: "checkFlowTabOpen", passive: true },
            (response) => {
              clearTimeout(timer);
              resolve(chrome.runtime.lastError ? null : response);
            },
          );
        } catch (_) {
          clearTimeout(timer);
          resolve(null);
        }
      });
      if (await _isFlowReloadChecking()) return;
      _setFlowHealthChecking("web", false);
      _flowWebHealthAt = Date.now();
      const ready = status?.ready === true;
      const t = (key, fallback) => window.I18n?.t?.(key) || fallback;
      const label = ready
        ? t("common.flowReady", "Flow page is ready")
        : status?.error === "NO_PROJECT_OPEN"
          ? t("workflow.noProjectTitle", "No Flow project open")
          : status?.preflightState === "signed_out"
            ? t("gen.providerStatusLogin", "Not logged in")
            : t("workflow.notConnected", "not connected");
      const detail = `Google Flow: ${label}`;
      const web = document.getElementById("flowWebModeChecks");
      if (web) web.innerHTML = _flowHealthIcon("account", ready, detail);
      const badge = document.getElementById("flowWebModeBadge");
      if (badge) {
        badge.textContent = _flowConnectionBadgeLabel(
          ready,
          ready ? 1 : 0,
          1,
          t,
        );
        badge.title = detail;
        badge.classList.toggle("is-ready", ready);
        badge.classList.toggle("is-warn", !ready);
      }
    } finally {
      _flowWebHealthPending = false;
    }
  }
  function _startFlowWebHealth() {
    _refreshFlowWebHealth();
    const refresh = () => {
      if (document.hidden) return;
      if (Date.now() - _flowWebHealthAt >= _FLOW_HEALTH_STALE_MS)
        _refreshFlowWebHealth();
      if (Date.now() - _flowApiHealthAt >= _FLOW_HEALTH_STALE_MS)
        renderBridgeGuide();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener(
      "pagehide",
      () => {
        _stopBridgePoll();
        document.removeEventListener("visibilitychange", refresh);
        window.removeEventListener("focus", refresh);
      },
      { once: true },
    );
  }
  function _renderBridgeHealth(status, t, installed = true) {
    const item = (ok, label) =>
      `<span class="bridge-health-item ${ok ? "ok" : "warn"}"><span aria-hidden="true">${ok ? "&#10003;" : "!"}</span>${label}</span>`;
    const configBlocked = ["build_drift", "protocol_config_missing"].includes(
      status?.validationReason,
    );
    const blockedLabel = configBlocked
      ? t(
          "settings.flowApiV2BuildDrift",
          "Google Flow changed. Update TobyFlow or contact support before retrying.",
        )
      : null;
    const scopeLabels = {
      gen: "Gen",
      task: "Tasks",
      workflow: "Workflow",
      image: "Image",
      video: "Video",
    };
    const scopes =
      Array.isArray(status?.scopeHealth) && status.scopeHealth.length > 1
        ? `<div class="bridge-health-scopes" role="list">${status.scopeHealth
            .map((entry) => {
              const health = entry.health || {};
              const driver =
                health.driver === "v2"
                  ? "API V2"
                  : health.driver === "v1"
                    ? health.fallbackFrom === "v2"
                      ? "API V1 \u21A9"
                      : "API V1"
                    : "Web";
              const label = `${scopeLabels[entry.surface] || entry.surface} ${scopeLabels[entry.mediaType] || entry.mediaType}: ${driver}`;
              return `<span role="listitem" class="bridge-health-item ${health.ready ? "ok" : "warn"}"><span aria-hidden="true">${health.ready ? "&#10003;" : "!"}</span>${label}</span>`;
            })
            .join("")}</div>`
        : "";
    return (
      `<div class="bridge-health" aria-live="polite" aria-label="${t("settings.bridgeHealthTitle", "Connection checks")}">` +
      item(
        installed,
        t("settings.bridgeHealthInstalled", "TobyBridge Install"),
      ) +
      item(
        status?.sessionReady === true,
        status?.sessionReady
          ? t("settings.bridgeHealthTokenReady", "Flow API Connected")
          : blockedLabel ||
              t(
                "settings.bridgeHealthTokenMissing",
                "Google session not captured",
              ),
      ) +
      item(
        status?.sessionVerified === true,
        status?.sessionVerified
          ? t(
              "settings.bridgeHealthSessionReady",
              "Google Flow sign-in verified",
            )
          : blockedLabel ||
              t(
                "settings.bridgeHealthSessionMissing",
                "Google Flow sign-in not verified",
              ),
      ) +
      scopes +
      `</div>`
    );
  }
  let _bridgeGuideRenderPromise = null;
  let _bridgeGuideForcePending = false;
  function renderBridgeGuide(force = false) {
    if (
      !_flowApiEntitled ||
      globalThis.SystemConfig?.get?.("flow_api_driver", null) === "disabled"
    ) {
      _stopBridgePoll();
      return Promise.resolve();
    }
    if (_bridgeGuideRenderPromise) {
      if (force) _bridgeGuideForcePending = true;
      return _bridgeGuideRenderPromise;
    }
    _bridgeGuideRenderPromise = (async () => {
      do {
        _bridgeGuideForcePending = false;
        await _renderBridgeGuideOnce(force);
        force = true;
      } while (_bridgeGuideForcePending);
    })()
      .catch((error) => {
        console.warn(
          "[Settings] Flow health check failed:",
          error?.message || error,
        );
      })
      .finally(() => {
        _bridgeGuideRenderPromise = null;
        _setFlowHealthChecking("api", false);
      });
    return _bridgeGuideRenderPromise;
  }
  async function _renderBridgeGuideOnce(force = false) {
    if (
      !_flowApiEntitled ||
      globalThis.SystemConfig?.get?.("flow_api_driver", null) === "disabled"
    )
      return;
    _syncFlowModeCards();
    const panel = document.getElementById("bridgeGuidePanel");
    if (!panel || !window.BridgeClient) return;
    const renderSeq = ++_bridgeRenderSeq;
    const t = (k, d) => window.I18n?.t?.(k) || d;
    try {
      await _ensureBridgeReleaseConfig(force);
    } catch (_) {}
    if (!_flowApiEntitled || renderSeq !== _bridgeRenderSeq) return;
    if (
      globalThis.SystemConfig?.get?.("flow_api_driver", null) === "disabled"
    ) {
      _applyFlowApiUpgradeState(
        document.getElementById("flowModeSection"),
        true,
      );
      return;
    }
    if (
      !["v1", "v2", "v2_canary", "auto"].includes(
        globalThis.SystemConfig?.get?.("flow_api_driver", null),
      )
    )
      return;
    _setFlowHealthChecking("api", true);
    let bridgeReloading = await _isFlowReloadChecking();
    if (!_flowApiEntitled || renderSeq !== _bridgeRenderSeq) return;
    await window.ProviderConfigManager?.fetchPrivateConfigs?.(force);
    if (!_flowApiEntitled || renderSeq !== _bridgeRenderSeq) return;
    const downloadUrl = _safeExternalHttpUrl(
      window.ProviderConfigManager?.getApiConfigValueSync?.(
        "flow",
        "bridge_download_url",
      ),
    );
    const minVersion = window.SystemConfig?.get?.("bridge_min_version") || "";
    let ping, status;
    let recentAuthError = null;
    try {
      const stored = await chrome.storage.session.get("flowApiLastAuthError");
      const candidate = stored?.flowApiLastAuthError;
      if (candidate?.at && Date.now() - candidate.at < 10 * 60 * 1e3)
        recentAuthError = candidate;
    } catch (_) {}
    if (!_flowApiEntitled || renderSeq !== _bridgeRenderSeq) return;
    const configuredSurfaces =
      window.SystemConfig?.getList?.("flow_api_v2_surfaces", []) || [];
    const configuredMediaTypes =
      window.SystemConfig?.getList?.("flow_api_v2_media_types", []) || [];
    const probes = await Promise.allSettled([
      window.FlowApiSessionCoordinator?.checkScopes?.({
        surfaces: configuredSurfaces.length ? configuredSurfaces : ["gen"],
        mediaTypes: configuredMediaTypes.length
          ? configuredMediaTypes
          : ["image"],
        force: force && !_bridgeActionPromise,
        passive: true,
      }),
      window.BridgeClient.ping(force),
    ]);
    const sessionHealth =
      probes[0].status === "fulfilled" ? probes[0].value : null;
    if (!_flowApiEntitled || renderSeq !== _bridgeRenderSeq) return;
    const reconnectScope = sessionHealth?.scopes?.find?.(
      (entry) => entry.health?.ready !== true,
    ) ||
      sessionHealth?.scopes?.find?.(
        (entry) =>
          entry.health?.fallbackFrom === "v2" &&
          window.FlowApiSessionCoordinator?.canRecoverV2Reason?.(
            entry.health?.fallbackReason,
          ),
      ) ||
      sessionHealth?.scopes?.[0] || { surface: "gen", mediaType: "image" };
    status = sessionHealth
      ? {
          installed: sessionHealth.installed !== false,
          sessionReady: sessionHealth.ready === true,
          sessionVerified: sessionHealth.ready === true,
          validationReason: sessionHealth.reason || null,
          effectiveDriver: sessionHealth.driver || null,
          fallbackFrom: sessionHealth.fallbackFrom || null,
          fallbackReason: sessionHealth.fallbackReason || null,
          tokenBootstrapActive: sessionHealth.recoveryStarted === true,
          scopeHealth: sessionHealth.scopes || [],
          reconnectSurface: reconnectScope.surface,
          reconnectMediaType: reconnectScope.mediaType,
        }
      : { installed: false, sessionReady: false, sessionVerified: false };
    ping =
      probes[1].status === "fulfilled" ? probes[1].value : { installed: false };
    if (sessionHealth?.ready === true) {
      recentAuthError = null;
      if (_bridgeLastError !== "FLOW_LOGIN_BRIDGE_UPDATE_REQUIRED")
        _bridgeLastError = null;
      try {
        await chrome.storage.session.remove("flowApiLastAuthError");
      } catch (_) {}
    }
    if (renderSeq !== _bridgeRenderSeq) return;
    bridgeReloading = await _isFlowReloadChecking();
    if (renderSeq !== _bridgeRenderSeq) return;
    _setFlowHealthChecking("api", false);
    const bridgeExplicitlyMissing =
      ping?.error === "BRIDGE_NOT_INSTALLED" ||
      status?.validationReason === "bridge_not_installed";
    if (bridgeExplicitlyMissing) {
      _bridgeDetected = false;
      ping = { ...ping, installed: false, version: null, capabilities: [] };
    } else {
      _bridgeDetected =
        _bridgeDetected ||
        ping?.installed === true ||
        status?.installed === true;
      if (!ping?.installed && status?.installed) {
        ping = {
          installed: true,
          version: status.version || null,
          capabilities: [],
        };
      }
      if (!ping?.installed && _bridgeDetected) {
        ping = {
          installed: true,
          version: status?.version || null,
          capabilities: [],
        };
      }
    }
    const svgOk =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    const svgWarn =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    const svgDl =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
    const svgGoogle = `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style="flex-shrink:0">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>`;
    const svgExt =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
    const svgRefresh =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>';
    const openExtBtn = ` <button type="button" id="bridgeOpenExtBtn" title="${t("settings.bridgeOpenExt", "Open chrome://extensions")}" aria-label="chrome://extensions" style="display:inline-flex;align-items:center;justify-content:center;margin-left:5px;padding:1px;border:none;background:transparent;color:inherit;cursor:pointer;vertical-align:-2px;opacity:0.65;">${svgExt}</button>`;
    const openFlowInlineBtn = ` <button type="button" class="bridge-inline-link" id="bridgeOpenFlowInlineBtn" title="${t("settings.bridgeOpenFlowLogin", "Open Google Flow to sign in")}" aria-label="${t("settings.bridgeOpenFlowLogin", "Open Google Flow to sign in")}">${svgExt}</button>`;
    const authFallbackHint = recentAuthError
      ? `<div class="bridge-error" role="status">${t("settings.bridgeSignInRequired", "Generation could not use the Google Flow session. Check that Google Flow is signed in.")} <button type="button" class="bridge-inline-link" id="bridgeAuthHintOpenBtn" title="${t("settings.bridgeOpenFlowLogin", "Open Google Flow to sign in")}" aria-label="${t("settings.bridgeOpenFlowLogin", "Open Google Flow to sign in")}">${svgExt}</button></div>`
      : "";
    let html = "";
    let cardState = "attention";
    const outdated =
      ping.installed &&
      minVersion &&
      ping.version &&
      _cmpVersion(ping.version, minVersion) < 0;
    const bridgeBusy = !!_bridgeActionPromise;
    const retryLabel = bridgeBusy
      ? t("auth.connecting", "Connecting...")
      : t("settings.bridgeReconnect", "Reconnect");
    const retryButton = `<button type="button" class="bridge-btn${bridgeBusy ? " is-loading" : ""}" id="bridgeRecheckBtn"${bridgeBusy ? ' disabled aria-busy="true"' : ""}>${bridgeBusy ? '<span class="bridge-btn-spinner" aria-hidden="true"></span>' : svgRefresh}<span>${retryLabel}</span></button>`;
    const openingFlow = bridgeBusy && _bridgeActionType === "open_flow";
    const openFlowButton = `<button type="button" class="bridge-btn primary${openingFlow ? " is-loading" : ""}" id="bridgeOpenFlowBtn"${openingFlow ? ' disabled aria-busy="true"' : ""}>${openingFlow ? '<span class="bridge-btn-spinner" aria-hidden="true"></span>' : svgExt}<span>${openingFlow ? t("settings.providerStatusChecking", "Checking...") : t("settings.bridgeOpenFlowLogin", "Open Google Flow to sign in")}</span></button>`;
    const bridgeDownloadLabel = t(
      "settings.bridgeDownload",
      "Download TobyBridge",
    );
    const bridgeDownloadTooltip = `${bridgeDownloadLabel}${minVersion ? ` v${minVersion}` : ""}`;
    const persistentDownloadButton = downloadUrl
      ? `<a class="bridge-btn primary bridge-download-action" id="bridgeAlwaysDownloadBtn" href="${_escapeHtml(downloadUrl)}" target="_blank" rel="noopener" title="${_escapeHtml(bridgeDownloadTooltip)}" data-tooltip="${_escapeHtml(bridgeDownloadTooltip)}" aria-label="${_escapeHtml(bridgeDownloadTooltip)}">${svgDl}<span>TobyBridge</span></a>`
      : `<button type="button" class="bridge-btn bridge-download-action" id="bridgeAlwaysDownloadBtn" disabled title="${_escapeHtml(`${bridgeDownloadTooltip} \u2014 ${t("settings.bridgeNoUrl", "Admin has not configured TobyBridge \u2014 contact support")}`)}" data-tooltip="${_escapeHtml(bridgeDownloadTooltip)}" aria-label="${_escapeHtml(bridgeDownloadTooltip)}">${svgDl}<span>TobyBridge</span></button>`;
    const persistentLoginGuide =
      `<div class="bridge-login-fallback"><div><strong>${t("settings.bridgeLoginFallbackTitle", "Having trouble generating?")}</strong> <span>${t("settings.bridgeLoginFallbackDesc", "Check that you are signed in to Google Flow with the correct account.")}</span></div><div class="bridge-login-actions"><button type="button" class="bridge-btn" id="bridgeAlwaysLoginBtn">${svgGoogle}<span>${t("settings.bridgeCheckGoogleLogin", "Check Google Flow sign-in")}</span></button>` +
      persistentDownloadButton +
      `</div></div>`;
    if (
      bridgeExplicitlyMissing ||
      (ping.installed && status.sessionReady && status.sessionVerified)
    ) {
      _bridgeLastError = null;
    } else if (!_bridgeLastError && status.validationReason)
      _bridgeLastError = status.validationReason;
    const configBlocked = ["build_drift", "protocol_config_missing"].includes(
      _bridgeLastError,
    );
    const sessionIssue =
      _bridgeLastError === "FLOW_LOGIN_BRIDGE_UPDATE_REQUIRED"
        ? t("settings.bridgeOutdated", "TobyBridge outdated \u2014 update")
        : ["NO_FLOW_TAB", "flow_project_tab_required"].includes(
              _bridgeLastError,
            )
          ? t(
              "settings.bridgeFlowTabRequired",
              "Google Flow is not open yet. Open it and sign in to continue.",
            )
          : _bridgeLastError === "project_mismatch"
            ? t(
                "errors.flowErr_project_mismatch",
                "This operation belongs to another Flow project. Open that project to recover it.",
              )
            : [
                  "FLOW_TOKEN_NOT_READY",
                  "login_required",
                  "csrf_missing",
                  "fresh_page_session_required",
                ].includes(_bridgeLastError)
              ? t(
                  "settings.bridgeSignInRequired",
                  "Google Flow is open, but sign-in is not complete yet.",
                )
              : _bridgeLastError === "session_refresh_timeout"
                ? t(
                    "settings.flowApiV2SessionTimeout",
                    "Flow API V2 session refresh timed out. Open the correct Flow project and try again.",
                  )
                : ["V2_PAGE_RELOADING", "page_reloading"].includes(
                      _bridgeLastError,
                    )
                  ? t("common.refreshingFlow", "Refreshing Flow page...")
                  : [
                        "V2_CONTENT_SCRIPT_RECOVERING",
                        "content_script_recovering",
                      ].includes(_bridgeLastError)
                    ? t(
                        "settings.flowApiContentRecovering",
                        "Restoring the Flow page connection...",
                      )
                    : ["build_drift", "protocol_config_missing"].includes(
                          _bridgeLastError,
                        )
                      ? t(
                          "settings.flowApiV2BuildDrift",
                          "Google Flow changed. Update TobyFlow or contact support before retrying.",
                        )
                      : ["bridge_outdated", "capability_missing"].includes(
                            _bridgeLastError,
                          )
                        ? t(
                            "settings.bridgeOutdated",
                            "TobyBridge outdated \u2014 update",
                          )
                        : _bridgeLastError
                          ? `${t("settings.bridgeCheckFailed", "Connection check failed. Please try again.")} <code>${String(_bridgeLastError).replace(/[^A-Z0-9_:\- ]/gi, "")}</code>`
                          : "";
    const errorNote = sessionIssue
      ? `<div class="bridge-error" role="status">${sessionIssue}</div>`
      : "";
    const sessionVerified = status.sessionVerified === true;
    const apiConnected =
      ping.installed && status.sessionReady && sessionVerified;
    const apiReady = apiConnected;
    _flowApiHealthAt = Date.now();
    _watchBridgeFallback(
      status,
      els.flowApiModeEnabled?.checked === true,
      apiConnected,
      bridgeBusy,
    );
    const bootstrapActive = status.tokenBootstrapActive === true;
    if (!apiConnected && bootstrapActive && !_bridgeBootstrapObserved)
      _startBridgePoll();
    _bridgeBootstrapObserved = bootstrapActive;
    _renderFlowModeHealth(ping, status, apiConnected, t);
    if (apiReady) {
      _autoSaveFlowModeSettings().catch((error) => {
        console.info(
          "[Settings] Flow API ready auto-save failed:",
          error?.message || error,
        );
      });
    }
    const sig = [
      els.flowApiModeEnabled?.checked === true ? 1 : 0,
      ping.installed ? 1 : 0,
      ping.version || "",
      status.sessionReady ? 1 : 0,
      sessionVerified ? 1 : 0,
      status.effectiveDriver || "",
      status.fallbackFrom || "",
      status.fallbackReason || "",
      status.validationReason || "",
      status.tokenBootstrapActive ? 1 : 0,
      bridgeBusy ? 1 : 0,
      _bridgeLastError || "",
      recentAuthError?.error || "",
      outdated ? 1 : 0,
      downloadUrl || "",
      minVersion || "",
    ].join("|");
    if (
      !force &&
      panel.dataset.bridgeSig === sig &&
      panel.innerHTML &&
      panel._flowReconnectHandler
    )
      return;
    panel.dataset.bridgeSig = sig;
    console.info(
      "[Settings] Flow mode health:",
      JSON.stringify({
        selected: els.flowApiModeEnabled?.checked === true ? "api" : "web",
        installed: ping.installed === true,
        sessionReady: status.sessionReady === true,
        sessionVerified,
        effectiveDriver: status.effectiveDriver || null,
        fallbackFrom: status.fallbackFrom || null,
        outdated: !!outdated,
        apiReady: !!apiReady,
        busy: bridgeBusy,
        reason: status.validationReason || null,
      }),
    );
    console.info(
      "[Settings] TobyBridge version policy:",
      JSON.stringify({
        installed: ping.installed === true,
        installedVersion: ping.version || null,
        minimumVersion: minVersion || null,
        outdated: outdated === true,
        downloadConfigured: !!downloadUrl,
        downloadGranted:
          window.ProviderConfigManager?.isPrivateConfigGranted?.(
            "bridge_download_url",
          ) === true,
        downloadValueState: (() => {
          const value = window.ProviderConfigManager?.getApiConfigValueSync?.(
            "flow",
            "bridge_download_url",
          );
          return value == null
            ? "missing_or_empty"
            : downloadUrl
              ? "valid_http_url"
              : "invalid_http_url";
        })(),
        forcedRefresh: force === true,
      }),
    );
    const _dot = document.getElementById("flowModeStatusDot");
    if (_dot) {
      _dot.classList.remove("is-ready", "is-warn", "is-off");
      if (apiConnected) {
        _dot.classList.add("is-ready");
        _dot.title = t(
          "settings.bridgeDotReady",
          "TobyBridge ready \u2014 Flow API",
        );
      } else if (ping.installed) {
        _dot.classList.add("is-warn");
        _dot.title = t(
          "settings.bridgeDotWarn",
          "TobyBridge not ready \u2014 open the Flow tab & sign in",
        );
      } else {
        _dot.classList.add("is-off");
        _dot.title = t(
          "settings.bridgeDotOff",
          "TobyBridge not installed \u2014 click for instructions",
        );
      }
    }
    if (apiReady && !outdated) {
      cardState = "ready";
      html =
        `<div class="bridge-status-row"><div class="bridge-badge ok">${svgOk} <span>${t("settings.bridgeReady", "TobyBridge installed & ready")} ${ping.version ? "(v" + ping.version + ")" : ""}</span></div>${retryButton}</div>` +
        _renderBridgeHealth(status, t) +
        authFallbackHint +
        persistentLoginGuide +
        errorNote;
    } else if (ping.installed && outdated) {
      cardState = "update";
      html =
        `<div class="bridge-status-row"><div class="bridge-badge update">${svgDl} <span>${t("settings.bridgeOutdated", "TobyBridge outdated \u2014 update")} (v${ping.version} < v${minVersion})</span></div>${retryButton}</div>` +
        _renderBridgeHealth(status, t) +
        `<div class="bridge-guide-title">${t("settings.bridgeReplaceTitle", "Replace the old TobyBridge")}</div><ol class="bridge-steps"><li>${t("settings.bridgeReplaceStep1", "Open chrome://extensions and remove the old TobyBridge")}${openExtBtn}</li><li>${t("settings.bridgeReplaceStep2", "Download and unzip the new TobyBridge")}</li><li>${t("settings.bridgeReplaceStep3", "Choose Load unpacked and select the new folder")}</li><li>${t("settings.bridgeReplaceStep4", "Return here and click Reconnect")}</li></ol><div class="bridge-btn-row">` +
        (downloadUrl
          ? `<a class="bridge-btn primary" href="${downloadUrl}" target="_blank" rel="noopener">${svgDl}<span>${t("settings.bridgeDownloadNew", "Download new version")}</span></a>`
          : "") +
        `</div>` +
        persistentLoginGuide +
        errorNote;
    } else if (ping.installed) {
      cardState = "attention";
      const notReadyLabel =
        sessionIssue ||
        t(
          "settings.bridgeNotReady",
          "TobyBridge is installed, but Google Flow is not signed in",
        );
      html =
        `<div class="bridge-status-row"><div class="bridge-badge warn">${svgWarn} <span>${notReadyLabel}</span></div>${retryButton}</div>` +
        _renderBridgeHealth(status, t) +
        (configBlocked
          ? errorNote
          : `<div class="bridge-guide-title">${t("settings.bridgeLoginGuideTitle", "Sign in to Google Flow to use Flow API")}</div><ol class="bridge-steps"><li>${t("settings.bridgeLoginStep1", "Click Open Google Flow below")}${openFlowInlineBtn}</li><li>${t("settings.bridgeLoginStep2", "Sign in with the Google account you use for Flow")}</li><li>${t("settings.bridgeLoginStep3", "Return here and click Reconnect")}</li></ol><div class="bridge-btn-row">` +
            openFlowButton +
            `</div>` +
            errorNote) +
        persistentLoginGuide;
    } else {
      cardState = "install";
      html =
        `<div class="bridge-guide-title">${t("settings.bridgeNeedInstall", "Install TobyBridge to use Flow API")}</div>` +
        (downloadUrl
          ? `<a class="bridge-btn primary" href="${downloadUrl}" target="_blank" rel="noopener">${svgDl} ${t("settings.bridgeDownload", "Download TobyBridge")}</a>`
          : `<div class="bridge-note">${t("settings.bridgeNoUrl", "Admin has not configured TobyBridge \u2014 contact support")}</div>`) +
        `<ol class="bridge-steps"><li>${t("settings.bridgeStep1", "Unzip the downloaded file")}</li><li>${t("settings.bridgeStep2", "Open chrome://extensions")}${openExtBtn}</li><li>${t("settings.bridgeStep3", "Enable Developer mode (top right)")}</li><li>${t("settings.bridgeStep4", "Load unpacked \u2192 select the unzipped folder")}</li><li>${t("settings.bridgeStep5", "Done \u2014 click Reconnect")}</li></ol>` +
        retryButton +
        persistentLoginGuide +
        errorNote;
    }
    panel.innerHTML = `<div class="bridge-card state-${cardState}">${html}</div>`;
    panel
      .querySelector("#bridgeOpenFlowTabBtn")
      ?.addEventListener("click", () => {
        (
          panel.querySelector("#bridgeAlwaysLoginBtn") ||
          panel.querySelector("#bridgeOpenFlowBtn")
        )?.click();
      });
    const reconnectBridge = async () => {
      console.info(
        "[Settings] Flow API Reconnect clicked",
        JSON.stringify({
          entitled: _flowApiEntitled,
          busy: !!_bridgeActionPromise,
          reason: status.validationReason || null,
        }),
      );
      if (!_flowApiEntitled) return;
      const btn = panel.querySelector("#bridgeRecheckBtn");
      if (!btn) return;
      if (btn.disabled || _bridgeActionPromise) return;
      const restoreFocus = true;
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
      btn.classList.add("is-loading");
      btn.innerHTML = `<span class="bridge-btn-spinner" aria-hidden="true"></span><span>${t("auth.connecting", "Connecting...")}</span>`;
      _bridgeLastError = null;
      _bridgeActionType = "recheck";
      _startBridgePoll();
      _bridgeActionPromise = (async () => {
        const fresh = await window.FlowApiSessionCoordinator?.reconnect?.({
          surface: status.reconnectSurface || "gen",
          mediaType: status.reconnectMediaType || "image",
          userInitiated: true,
          force: true,
          trigger: "manual",
        });
        if (!fresh?.ready) {
          if (fresh?.reason === "login_required")
            throw new Error("login_required");
          if (fresh?.recoveryStarted)
            throw new Error("FLOW_API_CONNECTION_UNVERIFIED");
          throw new Error(fresh?.reason || "FLOW_TOKEN_NOT_READY");
        }
        try {
          await chrome.storage.session.remove("flowApiLastAuthError");
        } catch (_) {}
        _flowApiConnectedToast(fresh);
      })();
      renderBridgeGuide(false);
      try {
        await _bridgeActionPromise;
        console.info("[Settings] Flow API Reconnect completed");
      } catch (error) {
        _bridgeLastError = error?.message || "BRIDGE_RECHECK_FAILED";
        console.warn("[Settings] Flow API Reconnect failed:", _bridgeLastError);
      } finally {
        _bridgeActionPromise = null;
        _bridgeActionType = null;
        await renderBridgeGuide(true);
        if (restoreFocus && document.visibilityState === "visible") {
          panel
            .querySelector("#bridgeRecheckBtn")
            ?.focus?.({ preventScroll: true });
        }
      }
    };
    panel._flowReconnectHandler = reconnectBridge;
    if (!panel._flowReconnectDelegated) {
      panel.addEventListener("click", (event) => {
        if (event.target?.closest?.("#bridgeRecheckBtn"))
          panel._flowReconnectHandler?.();
      });
      panel._flowReconnectDelegated = true;
    }
    panel.querySelector("#bridgeOpenExtBtn")?.addEventListener("click", () => {
      try {
        chrome.tabs.create({ url: "chrome://extensions/" });
      } catch (_) {}
    });
    panel
      .querySelector("#bridgeOpenFlowInlineBtn")
      ?.addEventListener("click", () => {
        panel.querySelector("#bridgeOpenFlowBtn")?.click();
      });
    panel
      .querySelector("#bridgeAuthHintOpenBtn")
      ?.addEventListener("click", () => {
        (
          panel.querySelector("#bridgeAlwaysLoginBtn") ||
          panel.querySelector("#bridgeOpenFlowBtn")
        )?.click();
      });
    panel
      .querySelector("#bridgeAlwaysLoginBtn")
      ?.addEventListener("click", async (event) => {
        if (!_flowApiEntitled) return;
        const btn = event.currentTarget;
        if (btn.disabled || _bridgeActionPromise) return;
        const restoreFocus = event.isTrusted === true;
        btn.disabled = true;
        btn.setAttribute("aria-busy", "true");
        _bridgeLastError = null;
        _bridgeActionType = "open_flow";
        _startBridgePoll();
        _bridgeActionPromise = window.FlowApiSessionCoordinator?.reconnect?.({
          surface: status.reconnectSurface || "gen",
          mediaType: status.reconnectMediaType || "image",
          userInitiated: true,
          force: true,
        });
        try {
          const fresh = await _bridgeActionPromise;
          if (fresh?.ready) {
            try {
              await chrome.storage.session.remove("flowApiLastAuthError");
            } catch (_) {}
            _flowApiConnectedToast(fresh);
          }
          if (!fresh?.ready && !fresh?.recoveryStarted) {
            throw new Error(
              fresh?.detail || fresh?.reason || "FLOW_LOGIN_OPEN_FAILED",
            );
          }
        } catch (error) {
          _bridgeLastError = error?.message || "FLOW_LOGIN_OPEN_FAILED";
        } finally {
          _bridgeActionPromise = null;
          _bridgeActionType = null;
          await renderBridgeGuide(false);
          if (restoreFocus && document.visibilityState === "visible") {
            panel
              .querySelector("#bridgeAlwaysLoginBtn")
              ?.focus?.({ preventScroll: true });
          }
        }
      });
    panel
      .querySelector("#bridgeOpenFlowBtn")
      ?.addEventListener("click", async (e) => {
        if (!_flowApiEntitled) return;
        const btn = e.currentTarget;
        if (btn.disabled || _bridgeActionPromise) return;
        const restoreFocus = e.isTrusted === true;
        _bridgeLastError = null;
        _bridgeActionType = "open_flow";
        _startBridgePoll();
        _bridgeActionPromise = (async () => {
          const fresh = await window.FlowApiSessionCoordinator?.reconnect?.({
            surface: status.reconnectSurface || "gen",
            mediaType: status.reconnectMediaType || "image",
            userInitiated: true,
            force: true,
          });
          if (fresh?.ready) {
            try {
              await chrome.storage.session.remove("flowApiLastAuthError");
            } catch (_) {}
            _flowApiConnectedToast(fresh);
            return;
          }
          if (!fresh?.recoveryStarted)
            throw new Error(
              fresh?.detail || fresh?.reason || "FLOW_LOGIN_OPEN_FAILED",
            );
        })();
        renderBridgeGuide(false);
        try {
          await _bridgeActionPromise;
        } catch (error) {
          _bridgeLastError = error?.message || "FLOW_LOGIN_OPEN_FAILED";
        } finally {
          _bridgeActionPromise = null;
          _bridgeActionType = null;
          await renderBridgeGuide(false);
          if (restoreFocus && document.visibilityState === "visible") {
            panel
              .querySelector("#bridgeOpenFlowBtn")
              ?.focus?.({ preventScroll: true });
          }
        }
      });
  }
  const _entitlementBool = (feature) => {
    const value = feature?.value;
    return value === true || value === "1" || value === 1;
  };
  async function checkFeatureEntitlements() {
    try {
      const result = await chrome.storage.local.get([
        "af_entitlements",
        "af_auth",
      ]);
      const entitlements = result.af_entitlements?.entitlements || {};
      _settingsIsLoggedIn = !!result.af_auth?.token;
      const canUseApiFlow = _entitlementBool(entitlements.flow_api_enabled);
      const flowModeSection = document.getElementById("flowModeSection");
      if (flowModeSection) {
        flowModeSection.style.display = "";
        _applyFlowApiUpgradeState(flowModeSection, canUseApiFlow);
      }
      window.BridgeClient?.setFlowApiMaintenance?.(
        canUseApiFlow &&
          globalThis.SystemConfig?.get?.("flow_api_driver", null) !==
            "disabled" &&
          els.flowApiModeEnabled?.checked === true,
      ).catch(() => {});
      const autoDownloadFeature = entitlements.auto_download;
      const canUseAutoDownload = _entitlementBool(autoDownloadFeature);
      _applySettingsFeatureState(
        els.autoDownload,
        canUseAutoDownload,
        ".s-checkbox-row",
        false,
        "auto_download",
      );
      try {
        const sysRes = await chrome.storage.local.get(["af_system_settings"]);
        const liveSysV = window.SystemConfig?.get?.(
          "remove_watermark_enabled",
          void 0,
        );
        const sysV =
          liveSysV !== void 0
            ? liveSysV
            : sysRes.af_system_settings?.remove_watermark_enabled;
        if (sysV === void 0) {
          document
            .getElementById("watermarkSettingBlock")
            ?.classList.add("hidden");
          if (
            !checkFeatureEntitlements._wmSystemRefresh &&
            !checkFeatureEntitlements._wmSystemRefreshAttempted
          ) {
            checkFeatureEntitlements._wmSystemRefreshAttempted = true;
            checkFeatureEntitlements._wmSystemRefresh = Promise.resolve(
              window.SystemConfig?.fetch?.(true),
            )
              .then(() => checkFeatureEntitlements())
              .catch((e) =>
                console.warn(
                  "[Settings] kh\xF4ng t\u1EA3i \u0111\u01B0\u1EE3c gate watermark:",
                  e?.message,
                ),
              )
              .finally(() => {
                checkFeatureEntitlements._wmSystemRefresh = null;
              });
          }
        }
        const wmSysOn = sysV === true || sysV === "1" || sysV === 1;
        const wmBlock = document.getElementById("watermarkSettingBlock");
        if (wmBlock) wmBlock.classList.toggle("hidden", !wmSysOn);
        if (wmSysOn) {
          const imgV = entitlements.image_remove_watermark_enabled?.value;
          const vidV = entitlements.video_remove_watermark_enabled?.value;
          const canImg = _entitlementBool({ value: imgV });
          const canVid = _entitlementBool({ value: vidV });
          _applySettingsFeatureState(
            els.autoRemoveWatermark,
            canImg,
            ".s-wm-row",
            false,
            "image_remove_watermark_enabled",
          );
          _applySettingsFeatureState(
            els.autoRemoveWatermarkVideo,
            canVid,
            ".s-wm-row",
            false,
            "video_remove_watermark_enabled",
          );
          _applySettingsFeatureState(
            els.autoRemoveWatermarkInput,
            canImg,
            ".s-wm-row",
            false,
            "image_remove_watermark_enabled",
          );
          const up = document.getElementById("wmUpgradeHint");
          if (up) {
            up.classList.toggle("hidden", canImg && canVid);
            if (!up.dataset.bound) {
              up.dataset.bound = "1";
              up.addEventListener("click", (e) => {
                e.preventDefault();
                try {
                  chrome.runtime.sendMessage({ action: "showUpgradeModal" });
                } catch (_) {}
              });
            }
          }
          if (!canImg && els.autoRemoveWatermark)
            els.autoRemoveWatermark.checked = false;
          if (!canVid && els.autoRemoveWatermarkVideo)
            els.autoRemoveWatermarkVideo.checked = false;
          if (!canImg && els.autoRemoveWatermarkInput)
            els.autoRemoveWatermarkInput.checked = false;
        }
      } catch (e) {
        console.warn("[Settings] gate watermark l\u1ED7i:", e?.message);
      }
      const retryFeature = entitlements.retry_on_fail;
      const canUseRetry =
        retryFeature?.value === "1" || retryFeature?.value === 1;
      _applySettingsFeatureState(
        els.execRetries,
        canUseRetry,
        ".s-field",
        true,
        "retry_on_fail",
      );
      if (els.execRetries && !canUseRetry) {
        els.execRetries.value = "0";
      }
      const queueFeature = entitlements.pipeline_queue_enabled;
      const canUseQueue =
        queueFeature?.value === "1" || queueFeature?.value === 1;
      _applySettingsFeatureState(
        els.queueEnabled,
        canUseQueue,
        ".s-toggle-row",
        false,
        "pipeline_queue_enabled",
      );
      if (flowModeSection) {
        if (
          canUseApiFlow &&
          globalThis.SystemConfig?.get?.("flow_api_driver", null) !== "disabled"
        ) {
          try {
            renderBridgeGuide(false);
          } catch (_) {}
        }
      }
      const humanizedFeature = entitlements.humanized_mode;
      const canUseHumanized = humanizedFeature
        ? humanizedFeature.value === "1" || humanizedFeature.value === 1
        : true;
      _applySettingsFeatureState(
        els.humanizedMode,
        canUseHumanized,
        ".s-toggle-row",
        false,
        "humanized_mode",
      );
      const telegramFeature = entitlements.telegram_enabled;
      const canUseTelegram = telegramFeature
        ? telegramFeature.value === "1" || telegramFeature.value === 1
        : true;
      _applyTelegramFeatureState(canUseTelegram);
      const customBotFeature = entitlements.telegram_custom_bot;
      const canUseCustomBot =
        customBotFeature?.value === "1" || customBotFeature?.value === 1;
      _applyTelegramCustomBotState(canUseCustomBot);
    } catch (e) {
      console.warn("[Settings] Error checking feature entitlements:", e);
    }
  }
  function _applyFlowApiUpgradeState(section, canUse) {
    _flowApiEntitled = canUse === true;
    const runtimeDisabled =
      globalThis.SystemConfig?.get?.("flow_api_driver", null) === "disabled";
    if (!_flowApiEntitled || runtimeDisabled) {
      _stopBridgePoll();
      _bridgeRenderSeq++;
      _bridgeGuideForcePending = false;
      _setFlowHealthChecking("api", false);
    }
    const settingsCard = document.getElementById("flowApiSettingsCard");
    if (settingsCard) settingsCard.style.display = canUse ? "" : "none";
    for (const id of [
      "flowMaxSpeedVersion",
      "flowMaxSpeedChecks",
      "flowMaxSpeedBadge",
      "flowModeStatusDot",
    ]) {
      const element = document.getElementById(id);
      if (element) element.style.display = canUse ? "" : "none";
    }
    const toggle = document.getElementById("flowApiModeEnabled");
    const modeSel = document.getElementById("flowGenMode");
    const modeField = document.getElementById("flowGenModeField");
    const guide = document.getElementById("bridgeGuidePanel");
    const maintenance = document.getElementById("flowApiMaintenanceCard");
    let banner = document.getElementById("flowApiUpgradeBanner");
    const maxSpeedCard = document.getElementById("flowMaxSpeedCard");
    const lockedConnection = document.getElementById(
      "flowMaxSpeedLockedConnection",
    );
    if (maintenance) maintenance.hidden = !runtimeDisabled;
    if (maxSpeedCard) maxSpeedCard.hidden = runtimeDisabled;
    if (maxSpeedCard)
      maxSpeedCard.classList.toggle(
        "is-api-locked",
        !canUse && !runtimeDisabled,
      );
    if (lockedConnection) {
      lockedConnection.hidden = canUse || runtimeDisabled;
      lockedConnection.classList.remove("is-connected");
    }
    if (runtimeDisabled) {
      if (settingsCard) settingsCard.style.display = "none";
      if (toggle) toggle.disabled = true;
      if (modeSel) modeSel.disabled = true;
      if (modeField) modeField.style.display = "none";
      if (guide) guide.style.display = "none";
      const statusDot = document.getElementById("flowModeStatusDot");
      statusDot?.classList.remove("is-ready", "is-warn");
      statusDot?.classList.add("is-off");
      banner?.remove();
      _syncFlowModeCards();
      return;
    }
    if (maxSpeedCard) maxSpeedCard.disabled = !canUse;
    if (canUse) {
      if (toggle) toggle.disabled = false;
      if (modeSel) modeSel.disabled = false;
      if (modeField) modeField.style.display = "";
      if (guide) guide.style.display = "";
      banner?.remove();
      _syncFlowModeCards();
      return;
    }
    if (toggle) toggle.disabled = true;
    _syncFlowModeCards();
    if (modeSel) modeSel.disabled = true;
    if (modeField) modeField.style.display = "none";
    if (guide) guide.style.display = "none";
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "flowApiUpgradeBanner";
      banner.style.cssText =
        "display:flex;align-items:center;gap:10px;margin-top:10px;padding:12px 14px;background:linear-gradient(135deg, rgba(245,158,11,0.12), rgba(168,85,247,0.10));border:1px solid rgba(245,158,11,0.35);border-radius:10px;";
      banner.innerHTML =
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M2 20h20"/><path d="M4 17l2-11 5 5 1-7 1 7 5-5 2 11z"/></svg><div style="flex:1;min-width:0;font-size:12px;line-height:1.45;"><div style="font-weight:600;" data-i18n="settings.flowApiUpgradeTitle"></div><div style="opacity:0.75;" data-i18n="settings.flowApiUpgradeDesc"></div></div><button class="s-btn s-btn-upgrade s-btn-sm" id="flowApiUpgradeBtn" data-i18n="footer.upgrade" style="flex-shrink:0;"></button>';
      section.appendChild(banner);
      banner
        .querySelector("#flowApiUpgradeBtn")
        ?.addEventListener("click", () => {
          try {
            chrome.runtime.sendMessage({ action: "showUpgradeModal" });
          } catch (_) {}
        });
    }
    const translate = (key, fallback) => {
      const text = window.I18n?.t(key);
      return text && text !== key ? text : fallback;
    };
    banner.querySelector(
      '[data-i18n="settings.flowApiUpgradeTitle"]',
    ).textContent = translate(
      "settings.flowApiUpgradeTitle",
      "Premium feature",
    );
    banner.querySelector(
      '[data-i18n="settings.flowApiUpgradeDesc"]',
    ).textContent = translate(
      "settings.flowApiUpgradeDesc",
      "Create images/videos directly through Flow API (without web interactions): faster, more stable, independent of the Flow UI. Upgrade to Premium to use it.",
    );
    banner.querySelector("#flowApiUpgradeBtn").textContent = translate(
      "footer.upgrade",
      "Upgrade",
    );
  }
  function _applySettingsFeatureState(
    el,
    canUse,
    containerSel,
    isInput,
    featureKeyArg,
  ) {
    if (!el) return;
    const container = el.closest(containerSel);
    if (featureKeyArg) el.dataset.featureKey = featureKeyArg;
    if (canUse) {
      el.disabled = false;
      if (container) {
        container.style.opacity = "";
        container.style.cursor = "";
        container.title = "";
        container.querySelector(".premium-crown")?.remove();
      }
    } else {
      el.disabled = true;
      if (!isInput) el.checked = false;
      if (container) {
        container.style.opacity = "0.5";
        container.style.cursor = "not-allowed";
        container.title =
          window.I18n?.t("settings.premiumRequired") ||
          "This feature requires a Premium plan";
        const featureKey = el.dataset?.featureKey || el.id || null;
        let crown = container.querySelector(".premium-crown");
        const crownCreated = !crown;
        if (crownCreated) {
          crown = document.createElement("span");
          crown.className = "premium-crown";
        }
        crown.innerHTML = _settingsRenderCrownHTML(featureKey);
        crown.title = _settingsGetCrownLabel(featureKey);
        if (crownCreated) {
          const wmName = container.classList?.contains("s-wm-row")
            ? container.querySelector(".s-wm-name")
            : null;
          if (wmName) {
            wmName.appendChild(crown);
            return;
          }
          const toggleLabel =
            container.querySelector(".s-toggle > span:not(.s-toggle-track)") ||
            container.querySelector("label > span:last-of-type");
          if (toggleLabel) {
            toggleLabel.appendChild(crown);
          } else {
            const fieldLabel = container.querySelector("label");
            if (fieldLabel) {
              fieldLabel.appendChild(crown);
            } else {
              container.appendChild(crown);
            }
          }
        }
      }
    }
  }
  function _applyTelegramFeatureState(canUse) {
    const linkSection = document.querySelector("#telegramSection");
    const quotaSection = document.querySelector("#telegramQuotaSection");
    [linkSection, quotaSection].forEach((section) => {
      if (!section) return;
      if (canUse) {
        section.style.opacity = "";
        section.style.cursor = "";
        section.title = "";
        section.querySelector(".premium-crown")?.remove();
        section
          .querySelectorAll("button, input")
          .forEach((el) => (el.disabled = false));
      } else {
        section.style.opacity = "0.5";
        section.style.cursor = "not-allowed";
        section.title =
          window.I18n?.t("settings.premiumRequired") ||
          "This feature requires a Premium plan";
        section
          .querySelectorAll("button, input")
          .forEach((el) => (el.disabled = true));
      }
    });
    if (
      !canUse &&
      linkSection &&
      !linkSection.querySelector(".premium-crown")
    ) {
      const crown = document.createElement("span");
      crown.className = "premium-crown";
      crown.innerHTML = _settingsRenderCrownHTML("telegram_enabled");
      crown.title = _settingsGetCrownLabel("telegram_enabled");
      const headerSpan = linkSection.querySelector(
        ".s-section-header span:first-of-type",
      );
      if (headerSpan) {
        headerSpan.insertAdjacentElement("afterend", crown);
      }
    }
  }
  function _applyTelegramCustomBotState(canUseCustomBot) {
    if (!els.telegramOptionCustom) return;
    if (canUseCustomBot) {
      els.telegramOptionCustom.classList.remove(
        "telegram-bot-option--disabled",
      );
      els.telegramOptionCustom.style.opacity = "";
      els.telegramOptionCustom.style.cursor = "";
      els.telegramOptionCustom.style.pointerEvents = "";
      els.telegramOptionCustom.title = "";
    } else {
      els.telegramOptionCustom.classList.add("telegram-bot-option--disabled");
      els.telegramOptionCustom.style.opacity = "0.5";
      els.telegramOptionCustom.style.cursor = "not-allowed";
      els.telegramOptionCustom.style.pointerEvents = "none";
      els.telegramOptionCustom.title =
        window.I18n?.t("settings.premiumRequired") ||
        "This feature requires a Premium plan";
      if (_telegramUseCustomBot) {
        selectTelegramBotOption("shared");
      }
    }
  }
  async function _loadTelegramQuota() {
    try {
      const result = await chrome.storage.local.get("af_entitlements");
      const entitlements = result.af_entitlements || {};
      const features = entitlements.entitlements || {};
      const hourFeature = features.telegram_rate_hour;
      let hourLimit = 10;
      let hourUsed = 0;
      let isHourUnlimited = false;
      if (hourFeature) {
        const limitVal = hourFeature.value;
        isHourUnlimited = limitVal === "-1" || limitVal === "unlimited";
        hourLimit = isHourUnlimited ? "\u221E" : parseInt(limitVal) || 10;
        hourUsed = hourFeature.usage_today ?? hourFeature.usage ?? 0;
      }
      const dayFeature = features.telegram_rate_day;
      let dayLimit = 50;
      let dayUsed = 0;
      let isDayUnlimited = false;
      if (dayFeature) {
        const limitVal = dayFeature.value;
        isDayUnlimited = limitVal === "-1" || limitVal === "unlimited";
        dayLimit = isDayUnlimited ? "\u221E" : parseInt(limitVal) || 50;
        dayUsed = dayFeature.usage_today ?? dayFeature.usage ?? 0;
      }
      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };
      setVal("telegramQuotaHourUsed", hourUsed);
      setVal("telegramQuotaHourLimit", hourLimit);
      setVal("telegramQuotaDayUsed", dayUsed);
      setVal("telegramQuotaDayLimit", dayLimit);
      const upgradeHint = document.getElementById("telegramQuotaUpgrade");
      if (upgradeHint) {
        const planSlug = entitlements.plan?.slug || "trial";
        const isFreePlan = planSlug === "free" || planSlug === "trial";
        if (isFreePlan) {
          upgradeHint.classList.remove("hidden");
        } else {
          upgradeHint.classList.add("hidden");
        }
      }
    } catch (err) {
      console.warn("[Settings] _loadTelegramQuota error:", err);
    }
  }
  function _initTelegramQuotaUpgrade() {
    const upgradeHint = document.getElementById("telegramQuotaUpgrade");
    if (upgradeHint) {
      upgradeHint.addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "openUpgradeModal" });
      });
    }
  }
  async function _gateAgentBotTab() {
    let off = false;
    try {
      const r = await chrome.storage.local.get(["af_entitlements"]);
      const ent = r.af_entitlements?.entitlements || {};
      const v = ent.agent_bot_enabled?.value ?? ent.agent_bot_enabled;
      off = v === "0" || v === 0 || v === false;
    } catch (_) {}
    const aiTab = document.querySelector('.settings-tab[data-tab="ai"]');
    const aiContent = document.querySelector('[data-tab-content="ai"]');
    if (aiTab) aiTab.classList.toggle("hidden", off);
    if (off) {
      aiContent?.classList.remove("active");
      if (aiTab?.classList.contains("active")) {
        aiTab.classList.remove("active");
        document.querySelector(".settings-tab:not(.hidden)")?.click();
      }
    }
  }
  async function initTabs() {
    await _gateAgentBotTab();
    const tabs = document.querySelectorAll(".settings-tab");
    const contents = document.querySelectorAll(".tab-content");
    const hash = window.location.hash.slice(1);
    if (hash) {
      if (hash === "mcp" || hash === "telegram") {
        const aiBtn = document.querySelector('.settings-tab[data-tab="ai"]');
        const subBtn = document.querySelector(
          `.ai-subtab[data-subtab="${hash}"]`,
        );
        if (aiBtn && !aiBtn.classList.contains("hidden"))
          setTimeout(() => {
            aiBtn.click();
            subBtn?.click();
          }, 0);
      } else if (
        hash === "advanced" ||
        hash === "general" ||
        hash === "ai-platform" ||
        hash === "flow-api"
      ) {
        const setBtn = document.querySelector(
          '.settings-tab[data-tab="settings"]',
        );
        const grp = hash === "ai-platform" || hash === "flow-api" ? "ai" : hash;
        const subBtn = document.querySelector(
          `.set-subtab[data-setgroup="${grp}"]`,
        );
        if (setBtn)
          setTimeout(() => {
            setBtn.click();
            subBtn?.click();
            if (hash === "flow-api") {
              const flowSection = document.getElementById("flowModeSection");
              flowSection?.scrollIntoView?.({
                behavior: "smooth",
                block: "start",
              });
            }
          }, 0);
      } else {
        const targetBtn = document.querySelector(
          `.settings-tab[data-tab="${hash}"]`,
        );
        if (targetBtn) setTimeout(() => targetBtn.click(), 0);
      }
    }
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.tab;
        tabs.forEach((t) => t.classList.remove("active"));
        contents.forEach((c) => c.classList.remove("active"));
        tab.classList.add("active");
        const targetContent = document.querySelector(
          `[data-tab-content="${target}"]`,
        );
        if (targetContent) targetContent.classList.add("active");
        if (target === "storage") {
          loadDailyStats();
          scanAllStorage();
        }
        if (target === "info") renderAboutProviders();
        if (target === "devices") _loadExtensionDevices();
        const footer = document.querySelector(".settings-footer");
        if (footer)
          footer.style.display =
            target === "settings" || target === "ai" ? "" : "none";
        if (target === "settings") checkFeatureEntitlements();
        if (target === "ai") {
          checkFeatureEntitlements();
          const activeSub =
            document.querySelector(".ai-subtab.active")?.dataset.subtab ||
            "mcp";
          if (activeSub === "telegram") _loadTelegramQuota();
          else _loadMcpTokens();
        }
      });
    });
    document.querySelectorAll(".ai-subtab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sub = btn.dataset.subtab;
        document
          .querySelectorAll(".ai-subtab")
          .forEach((b) => b.classList.remove("active"));
        document
          .querySelectorAll(".ai-subtab-pane")
          .forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        document
          .querySelector(`[data-subtab-content="${sub}"]`)
          ?.classList.add("active");
        if (sub === "telegram") {
          _loadTelegramQuota();
          checkFeatureEntitlements();
        } else {
          _loadMcpTokens();
        }
      });
    });
    _initSettingsSubtabs();
  }
  function _initSettingsSubtabs() {
    const container = document.getElementById("settingsContainer");
    if (!container) return;
    const byId = {
      userProfileSection: "general",
      accountLinkingSection: "general",
      dataManagementSection: "general",
      settingsChatGPTSection: "ai",
      settingsGeminiSection: "ai",
      settingsMuseSection: "ai",
      settingsGrokSection: "ai",
      watermarkSettingBlock: "ai",
      flowModeSection: "ai",
    };
    const byHeader = {
      "settings.providerDefault": "ai",
      "gen.providerFlow": "ai",
      "settings.autoDownload": "general",
      "settings.ui": "general",
      "settings.notifications": "general",
      "settings.generalSettings": "advanced",
      "settings.pipelineQueue": "advanced",
      "settings.antiBan": "advanced",
      "settings.automationMode": "advanced",
    };
    const sections = container.querySelectorAll(":scope > .s-section");
    sections.forEach((sec) => {
      let g = byId[sec.id];
      if (!g) {
        const hk = sec
          .querySelector(".s-section-header [data-i18n]")
          ?.getAttribute("data-i18n");
        g = byHeader[hk];
      }
      sec.setAttribute("data-setgroup", g || "general");
    });
    const subBtns = container.querySelectorAll(".set-subtab");
    const showGroup = (group) => {
      sections.forEach((sec) =>
        sec.classList.toggle(
          "set-section-hidden",
          sec.getAttribute("data-setgroup") !== group,
        ),
      );
      subBtns.forEach((b) =>
        b.classList.toggle("active", b.dataset.setgroup === group),
      );
      if (group === "ai" || group === "advanced") checkFeatureEntitlements();
    };
    subBtns.forEach((btn) =>
      btn.addEventListener("click", () => showGroup(btn.dataset.setgroup)),
    );
    showGroup("general");
  }
  const TRASH_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>';
  const CHROME_STORAGE_DEFS = [
    {
      key: "af_settings",
      get label() {
        return window.I18n?.t("settings.storageSettings") || "Settings";
      },
      get desc() {
        return (
          window.I18n?.t("settings.storageSettingsDesc") ||
          "Theme, sidebar, timeout, download"
        );
      },
      icon: "blue",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4"/></svg>',
      safe: false,
    },
    {
      key: "af_auth",
      get label() {
        return window.I18n?.t("settings.storageAuth") || "Login";
      },
      get desc() {
        return (
          window.I18n?.t("settings.storageAuthDesc") ||
          "Authentication token and account info"
        );
      },
      icon: "purple",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
      safe: false,
    },
    {
      key: "af_entitlements",
      get label() {
        return window.I18n?.t("settings.storageEntitlements") || "Entitlements";
      },
      get desc() {
        return (
          window.I18n?.t("settings.storageEntitlementsDesc") ||
          "Plan, features, quota (cache from server)"
        );
      },
      icon: "green",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
      safe: true,
    },
    {
      key: "af_tasks",
      label: "Tasks",
      get desc() {
        return (
          window.I18n?.t("settings.storageTasksDesc") ||
          "List of created tasks (name, prompt, settings)"
        );
      },
      icon: "amber",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
      safe: false,
    },
    {
      key: "af_workflows",
      label: "Workflows",
      get desc() {
        return (
          window.I18n?.t("settings.storageWorkflowsDesc") ||
          "List of workflows (name, description, settings)"
        );
      },
      icon: "cyan",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg>',
      safe: false,
    },
    {
      key: "af_nodes",
      label: "Workflow Nodes",
      get desc() {
        return (
          window.I18n?.t("settings.storageNodesDesc") || "Nodes in workflows"
        );
      },
      icon: "cyan",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
      safe: false,
    },
    {
      key: "af_edges",
      label: "Workflow Edges",
      get desc() {
        return (
          window.I18n?.t("settings.storageEdgesDesc") ||
          "Connections between nodes"
        );
      },
      icon: "cyan",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
      safe: true,
    },
    {
      key: "af_user_prompts",
      label: "Prompt Snippets",
      get desc() {
        return (
          window.I18n?.t("settings.storageSnippetsDesc") ||
          "Saved prompt snippets for reuse"
        );
      },
      icon: "blue",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
      safe: false,
    },
    {
      key: "toby_gentab_state",
      label: "GenTab State",
      get desc() {
        return (
          window.I18n?.t("settings.storageGenTabDesc") ||
          "Generate tab UI state (gen type, model, ratio, prompt)"
        );
      },
      icon: "purple",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/></svg>',
      safe: false,
    },
    {
      key: "presets",
      label: "Presets (legacy)",
      get desc() {
        return "Legacy key, will migrate to toby_gentab_state";
      },
      icon: "gray",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/></svg>',
      safe: true,
    },
    {
      key: "af_history",
      get label() {
        return (
          window.I18n?.t("settings.storageHistory") || "Generation History"
        );
      },
      get desc() {
        return (
          window.I18n?.t("settings.storageHistoryDesc") ||
          "Generation history (prompt, timestamp)"
        );
      },
      icon: "green",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      safe: true,
    },
    {
      key: "af_angles_results",
      get label() {
        return (
          window.I18n?.t("settings.storageAnglesResults") || "Angles Results"
        );
      },
      get desc() {
        return (
          window.I18n?.t("settings.storageAnglesDesc") ||
          "Images created from Angles feature (thumbnail, prompt)"
        );
      },
      icon: "rose",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
      safe: true,
    },
    {
      key: "af_effects_results",
      get label() {
        return (
          window.I18n?.t("settings.storageEffectsResults") || "Effects Results"
        );
      },
      get desc() {
        return (
          window.I18n?.t("settings.storageEffectsDesc") ||
          "Images generated from Effects feature (last 50 items)"
        );
      },
      icon: "rose",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
      safe: true,
    },
    {
      key: "af_addon_prompts",
      get label() {
        return (
          window.I18n?.t("settings.storageAddonPrompts") || "Addon Prompts"
        );
      },
      get desc() {
        return (
          window.I18n?.t("settings.storageAddonPromptsDesc") ||
          "Extension prompts (cached from server, used in Prompts tab)"
        );
      },
      icon: "blue",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
      safe: true,
    },
    {
      key: "af_projects",
      get label() {
        return window.I18n?.t("settings.storageProjects") || "Projects";
      },
      get desc() {
        return (
          window.I18n?.t("settings.storageProjectsDesc") ||
          "Flow project list (name, ID, metadata)"
        );
      },
      icon: "cyan",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
      safe: false,
    },
    {
      key: "af_chatgpt_config",
      get label() {
        return (
          window.I18n?.t("settings.storageChatGPTConfig") || "ChatGPT Config"
        );
      },
      get desc() {
        return (
          window.I18n?.t("settings.storageChatGPTConfigDesc") ||
          "ChatGPT configuration cache (1h TTL, auto-refresh)"
        );
      },
      icon: "green",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
      safe: true,
    },
    {
      key: "af_grok_config",
      get label() {
        return window.I18n?.t("settings.storageGrokConfig") || "Grok Config";
      },
      get desc() {
        return (
          window.I18n?.t("settings.storageGrokConfigDesc") ||
          "Grok configuration cache (1h TTL, auto-refresh)"
        );
      },
      icon: "green",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
      safe: true,
    },
    {
      key: "af_daily_stats",
      get label() {
        return window.I18n?.t("settings.storageDailyStats") || "Daily Stats";
      },
      get desc() {
        return (
          window.I18n?.t("settings.storageDailyStatsDesc") ||
          "Daily generation count (used for usage charts)"
        );
      },
      icon: "amber",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
      safe: true,
    },
    {
      key: "af_local_usage",
      get label() {
        return window.I18n?.t("settings.storageLocalUsage") || "Local Usage";
      },
      get desc() {
        return (
          window.I18n?.t("settings.storageLocalUsageDesc") ||
          "Usage counter for anonymous users (not logged in)"
        );
      },
      icon: "amber",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      safe: true,
    },
    {
      key: "af_system_settings",
      label: "System Settings",
      get desc() {
        return "Cache system settings from server (timeout, feature flags)";
      },
      icon: "green",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
      safe: true,
    },
    {
      key: "toby_provider_configs",
      label: "Provider DOM Selectors",
      get desc() {
        return "Cache DOM selectors for ChatGPT/Grok/Flow from server";
      },
      icon: "green",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
      safe: true,
    },
    {
      key: "toby_provider_api_configs",
      label: "Provider API Configs",
      get desc() {
        return "Cache API config (ratios, resolutions, error patterns) from server";
      },
      icon: "green",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
      safe: true,
    },
    {
      key: "toby_provider_models",
      label: "AI Models",
      get desc() {
        return "Cache AI models list from server";
      },
      icon: "green",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
      safe: true,
    },
    {
      key: "toby_i18n_en",
      label: "i18n English",
      get desc() {
        return "Cache English translations from server";
      },
      icon: "green",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
      safe: true,
    },
    {
      key: "toby_i18n_vi",
      label: "i18n Ti\u1EBFng Vi\u1EC7t",
      get desc() {
        return "Cache Vietnamese translations from server";
      },
      icon: "green",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
      safe: true,
    },
    {
      key: "toby_i18n_ja",
      label: "i18n \u65E5\u672C\u8A9E",
      get desc() {
        return "Cache Japanese translations from server";
      },
      icon: "green",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
      safe: true,
    },
    {
      key: "toby_i18n_th",
      label: "i18n \u0E20\u0E32\u0E29\u0E32\u0E44\u0E17\u0E22",
      get desc() {
        return "Cache Thai translations from server";
      },
      icon: "green",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
      safe: true,
    },
  ];
  const IDB_STORE_DEFS = [
    {
      store: "workflow_paste_blobs",
      get label() {
        return (
          window.I18n?.t("settings.storageWorkflowPaste") ||
          "Workflow pasted images"
        );
      },
      get desc() {
        return (
          window.I18n?.t("settings.storageWorkflowPasteDesc") ||
          "Original images saved for workflow upload recovery"
        );
      },
      icon: "purple",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="5" width="14" height="16" rx="2"/><rect x="9" y="2" width="6" height="5" rx="1"/><path d="m8 17 3-3 2 2 3-4"/></svg>',
      readOnly: true,
    },
    {
      store: "flow_ref_previews",
      get label() {
        return (
          window.I18n?.t("settings.storageFlowPreviews") ||
          "Flow reference previews"
        );
      },
      get desc() {
        return (
          window.I18n?.t("settings.storageFlowPreviewsDesc") ||
          "Local thumbnails for Flow reference images"
        );
      },
      icon: "blue",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1"/><path d="m3 17 6-6 4 4 3-3 5 5"/></svg>',
      readOnly: true,
    },
    {
      store: "pending_uploads",
      get label() {
        return window.I18n?.t("storage.pendingUploads") || "Pending uploads";
      },
      get desc() {
        return (
          window.I18n?.t("settings.storagePendingDesc") ||
          "Local images pending upload to Flow (full blob)"
        );
      },
      icon: "amber",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
      safe: true,
    },
    {
      store: "lightweight_pending",
      get label() {
        return (
          window.I18n?.t("storage.lightweightPending") ||
          "Pending uploads (lightweight)"
        );
      },
      get desc() {
        return (
          window.I18n?.t("settings.storageLightweightDesc") ||
          "Only thumbnails (\u226450KB), no full blob"
        );
      },
      icon: "green",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/></svg>',
      safe: true,
    },
    {
      store: "uploaded_cache",
      get label() {
        return window.I18n?.t("storage.uploadedCache") || "Uploaded file cache";
      },
      get desc() {
        return (
          window.I18n?.t("settings.storageUploadedCacheDesc") ||
          "File cache for re-upload if tile lost on Flow"
        );
      },
      icon: "blue",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
      safe: true,
    },
    {
      store: "albums",
      label: "Albums",
      get desc() {
        return (
          window.I18n?.t("settings.storageAlbumsDesc") ||
          "Album data (name, image list)"
        );
      },
      icon: "purple",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
      safe: false,
    },
    {
      store: "album_images",
      get label() {
        return window.I18n?.t("storage.albumImages") || "Images in Albums";
      },
      get desc() {
        return (
          window.I18n?.t("settings.storageAlbumImagesDesc") ||
          "Image metadata (name @mention, file_id, thumbnail URL)"
        );
      },
      icon: "purple",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>',
      safe: false,
    },
    {
      store: "image_blobs",
      get label() {
        return window.I18n?.t("storage.imageBlobs") || "Image blobs";
      },
      get desc() {
        return window.I18n?.t("settings.storageAlbumBlobsDesc") || "";
      },
      icon: "rose",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5.5 8.5L9 12l-3.5 3.5L2 12l3.5-3.5z"/><path d="M12 2l3.5 3.5L12 9 8.5 5.5 12 2z"/><path d="M18.5 8.5L22 12l-3.5 3.5L15 12l3.5-3.5z"/><path d="M12 15l3.5 3.5L12 22l-3.5-3.5L12 15z"/></svg>',
      safe: true,
    },
  ];
  function formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(2) + " MB";
  }
  function estimateSize(data) {
    if (data === void 0 || data === null) return 0;
    try {
      let binarySize = 0;
      const json = JSON.stringify(data, (_key, value) => {
        if (value instanceof Blob) {
          binarySize += value.size;
          return null;
        }
        if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
          binarySize += value.byteLength;
          return null;
        }
        return value;
      });
      return binarySize + new Blob([json || ""]).size;
    } catch {
      return 0;
    }
  }
  function countItems(data) {
    if (!data) return 0;
    if (Array.isArray(data)) return data.length;
    if (typeof data === "object") return Object.keys(data).length;
    return 1;
  }
  function renderStorageCard(def, size, count, onDelete) {
    const card = document.createElement("div");
    card.className = "storage-card";
    const iconClass = `storage-card-icon icon-${def.icon}`;
    const countLabel =
      count > 0 ? `<span class="storage-card-count">${count}</span>` : "";
    const sizeText = formatBytes(size);
    card.innerHTML = `
      <div class="${iconClass}">${def.iconSvg}</div>
      <div class="storage-card-body">
        <div class="storage-card-title">${def.label} ${countLabel}</div>
        <div class="storage-card-desc">${def.desc}</div>
      </div>
      <div class="storage-card-meta">
        <span class="storage-card-size">${sizeText}</span>
      </div>
      <button class="storage-card-delete" title="${window.I18n?.t("common.delete") || "Delete"} ${def.label}">${TRASH_ICON}</button>
    `;
    if (def.readOnly) card.querySelector(".storage-card-delete").remove();
    else
      card
        .querySelector(".storage-card-delete")
        .addEventListener("click", () => onDelete(def, card));
    return card;
  }
  async function scanChromeStorage() {
    const container = document.getElementById("chromeStorageCards");
    if (!container) return 0;
    container.innerHTML = "";
    const allData = await chrome.storage.local.get(null);
    let totalSize = 0;
    for (const def of CHROME_STORAGE_DEFS) {
      const data = allData[def.key];
      const size =
        data === void 0 ? 0 : await chrome.storage.local.getBytesInUse(def.key);
      const count = countItems(data);
      totalSize += size;
      const card = renderStorageCard(def, size, count, async (d, cardEl) => {
        const deleteLabel = window.I18n?.t("common.delete") || "Delete";
        const cancelLabel = window.I18n?.t("common.cancel") || "Cancel";
        const warning = d.safe
          ? `${deleteLabel} "${d.label}"?

${window.I18n?.t("storage.safeDeleteWarning", { desc: d.desc }) || `This data will be permanently deleted. ${d.desc}`}`
          : `${deleteLabel} "${d.label}"?

${
  window.I18n?.t("storage.unsafeDeleteWarning", { desc: d.desc }) ||
  `WARNING: Important data! ${d.desc}.
This cannot be recovered after deletion.`
}`;
        const confirmed = window.customDialog
          ? await window.customDialog.confirm(warning, {
              title: `${deleteLabel} ${d.label}`,
              type: d.safe ? "warning" : "error",
              confirmText: deleteLabel,
              cancelText: cancelLabel,
            })
          : confirm(warning);
        if (confirmed) {
          await chrome.storage.local.remove(d.key);
          cardEl.style.opacity = "0.3";
          cardEl.style.pointerEvents = "none";
          setTimeout(() => scanAllStorage(), 500);
        }
      });
      container.appendChild(card);
    }
    const knownKeys = new Set(CHROME_STORAGE_DEFS.map((d) => d.key));
    const unknownKeys = Object.keys(allData).filter((k) => !knownKeys.has(k));
    if (unknownKeys.length > 0) {
      let unknownTotal = 0;
      const unknownDetails = [];
      for (const key of unknownKeys) {
        const size = await chrome.storage.local.getBytesInUse(key);
        unknownTotal += size;
        totalSize += size;
        if (size > 1024) unknownDetails.push(`${key}: ${formatBytes(size)}`);
      }
      if (unknownTotal > 0) {
        const card = document.createElement("div");
        card.className = "storage-card";
        card.innerHTML = `
          <div class="storage-card-icon icon-red"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
          <div class="storage-card-body">
            <div class="storage-card-title">${window.I18n?.t("settings.storageOther") || "Other Data"} <span class="storage-card-count">${unknownKeys.length} keys</span></div>
            <div class="storage-card-desc" style="font-size:10px;max-height:60px;overflow:auto;">${unknownDetails.join("<br>") || window.I18n?.t("settings.storageOtherDesc") || "Cache, locale, state..."}</div>
          </div>
          <div class="storage-card-meta">
            <span class="storage-card-size" style="${unknownTotal > 1048576 ? "color:#ef4444;font-weight:600;" : ""}">${formatBytes(unknownTotal)}</span>
          </div>
          <button class="storage-card-delete" title="${window.I18n?.t("settings.storageOtherDeleteTitle") || "Delete all other data"}">${TRASH_ICON}</button>
        `;
        card
          .querySelector(".storage-card-delete")
          .addEventListener("click", async () => {
            const deleteLabel = window.I18n?.t("common.delete") || "Delete";
            const otherLabel =
              window.I18n?.t("settings.storageOther") || "Other Data";
            const confirmMsg =
              (window.I18n?.t("settings.storageOtherConfirm", {
                count: unknownKeys.length,
                size: formatBytes(unknownTotal),
              }) ||
                `Delete ${unknownKeys.length} keys (${formatBytes(unknownTotal)})?`) +
              `

${unknownKeys.slice(0, 10).join(", ")}${unknownKeys.length > 10 ? "..." : ""}`;
            const confirmed = window.customDialog
              ? await window.customDialog.confirm(confirmMsg, {
                  title: `${deleteLabel} ${otherLabel}`,
                  type: "warning",
                })
              : confirm(confirmMsg);
            if (confirmed) {
              await chrome.storage.local.remove(unknownKeys);
              setTimeout(() => scanAllStorage(), 500);
            }
          });
        container.appendChild(card);
      }
    }
    totalSize = await chrome.storage.local.getBytesInUse(null);
    document.getElementById("chromeStorageTotal").textContent =
      formatBytes(totalSize);
    return totalSize;
  }
  async function scanIndexedDB() {
    const container = document.getElementById("indexedDBCards");
    if (!container) return { totalSize: 0, pendingCount: 0 };
    container.innerHTML = "";
    let totalSize = 0;
    let pendingCount = 0;
    let complete = true;
    let db;
    try {
      db = await new Promise((resolve, reject) => {
        const req = indexedDB.open("autoflow_pro");
        req.onupgradeneeded = () => req.transaction.abort();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch {
      container.innerHTML = `<div class="storage-card-empty">${window.I18n?.t("storage.idbNotInitialized") || "IndexedDB not initialized"}</div>`;
      document.getElementById("indexedDBTotal").textContent = "0 B";
      return { totalSize: 0, pendingCount: 0 };
    }
    const storeNames = Array.from(db.objectStoreNames);
    const definitions = [
      ...IDB_STORE_DEFS,
      ...storeNames
        .filter((name) => !IDB_STORE_DEFS.some((def) => def.store === name))
        .map((store) => ({
          store,
          label: store,
          desc: "IndexedDB",
          icon: "gray",
          iconSvg: TRASH_ICON,
          safe: false,
          readOnly: true,
        })),
    ];
    for (const def of definitions) {
      if (!storeNames.includes(def.store)) {
        const card = renderStorageCard(def, 0, 0, () => {});
        container.appendChild(card);
        continue;
      }
      try {
        const { size, count } = await new Promise((resolve, reject) => {
          const tx = db.transaction(def.store, "readonly");
          const store = tx.objectStore(def.store);
          let size2 = 0,
            count2 = 0;
          const cursorReq = store.openCursor();
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (!cursor) return;
            size2 += estimateSize(cursor.value);
            count2++;
            cursor.continue();
          };
          tx.oncomplete = () => resolve({ size: size2, count: count2 });
          tx.onerror = tx.onabort = () =>
            reject(tx.error || new Error("INDEXEDDB_SCAN_FAILED"));
        });
        totalSize += size;
        if (
          def.store === "pending_uploads" ||
          def.store === "lightweight_pending"
        ) {
          pendingCount += count;
        }
        const card = renderStorageCard(def, size, count, async (d, cardEl) => {
          const deleteLabel = window.I18n?.t("common.delete") || "Delete";
          const cancelLabel = window.I18n?.t("common.cancel") || "Cancel";
          const warning = d.safe
            ? `${deleteLabel} "${d.label}"?

${window.I18n?.t("storage.safeDeleteWarning", { desc: d.desc }) || `This data will be permanently deleted. ${d.desc}`}`
            : `${deleteLabel} "${d.label}"?

${
  window.I18n?.t("storage.unsafeDeleteWarning", { desc: d.desc }) ||
  `WARNING: Important data! ${d.desc}.
This cannot be recovered after deletion.`
}`;
          const confirmed = window.customDialog
            ? await window.customDialog.confirm(warning, {
                title: `${deleteLabel} ${d.label}`,
                type: d.safe ? "warning" : "error",
                confirmText: deleteLabel,
                cancelText: cancelLabel,
              })
            : confirm(warning);
          if (confirmed) {
            try {
              const freshDb = await new Promise((resolve, reject) => {
                const req = indexedDB.open("autoflow_pro");
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
              });
              const clearTx = freshDb.transaction(d.store, "readwrite");
              const clearStore = clearTx.objectStore(d.store);
              clearStore.clear();
              await new Promise((resolve, reject) => {
                clearTx.oncomplete = resolve;
                clearTx.onerror = reject;
              });
              freshDb.close();
              cardEl.style.opacity = "0.3";
              cardEl.style.pointerEvents = "none";
              setTimeout(() => scanAllStorage(), 500);
            } catch (e) {
              console.error("[Storage] Clear failed:", e);
            }
          }
        });
        container.appendChild(card);
      } catch (error) {
        complete = false;
        console.warn("[Storage] Store scan failed:", def.store, error);
        const card = renderStorageCard(
          { ...def, readOnly: true },
          0,
          0,
          () => {},
        );
        card.querySelector(".storage-card-size").textContent = "\u2014";
        container.appendChild(card);
      }
    }
    db.close();
    document.getElementById("indexedDBTotal").textContent =
      `${complete ? "\u2248" : "\u2265"} ${formatBytes(totalSize)}`;
    return { totalSize, pendingCount, complete };
  }
  async function loadDailyStats() {
    const today = new Date().toISOString().slice(0, 10);
    const dateEl = document.getElementById("dailyStatsDate");
    if (dateEl)
      dateEl.textContent = `${today.slice(8)}/${today.slice(5, 7)} UTC`;
    try {
      const result = await chrome.storage.local.get([
        "af_auth",
        "af_entitlements",
        "af_local_usage",
        "af_daily_stats",
      ]);
      const auth = result.af_auth || {};
      const userId = auth.user?.id ?? null;
      const isLoggedIn = !!auth.token && userId !== null;
      const cache = result.af_entitlements || {};
      const fetchedAt = new Date(cache.lastFetch || NaN);
      const cacheDate = Number.isFinite(fetchedAt.getTime())
        ? fetchedAt.toISOString().slice(0, 10)
        : null;
      const cacheMatches =
        isLoggedIn &&
        userId !== null &&
        String(cache.user_id) === String(userId) &&
        cacheDate === today;
      const features = cacheMatches ? cache.entitlements || {} : {};
      const stats = result.af_daily_stats || {};
      const statsMatch =
        stats._date === today &&
        String(stats._user_id ?? null) === String(userId);
      const daily = statsMatch ? stats : {};
      const count = (value) =>
        Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
      const total = (suffix) =>
        Object.entries(daily).reduce(
          (sum, [key, value]) =>
            sum + (key.endsWith(suffix) ? count(value) : 0),
          0,
        );
      const local =
        result.af_local_usage?._usage_date === today
          ? result.af_local_usage
          : {};
      const taskUsed =
        features.tasks_run_max?.usage_today ??
        (isLoggedIn ? daily.task_run : local.tasks_run_max) ??
        0;
      const workflowUsed =
        features.workflows_run_max?.usage_today ??
        (isLoggedIn ? daily.workflow_run : local.workflows_run_max) ??
        0;
      const prompt = features.prompt_submit_max;
      const promptUsed = count(prompt?.usage_today ?? total("_prompt_total"));
      const limit = count(prompt?.value);
      const setVal = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
      };
      setVal(
        "statPromptSubmit",
        limit > 0 ? `${promptUsed}/${limit}` : promptUsed,
      );
      setVal("statPromptFail", total("_fail"));
      setVal("statTaskRun", count(taskUsed));
      setVal("statWorkflowRun", count(workflowUsed));
    } catch (err) {
      console.warn("[Settings] loadDailyStats error:", err);
    }
  }
  async function scanAllStorage() {
    const chromeSize = await scanChromeStorage();
    const idbResult = await scanIndexedDB();
    const totalSize = chromeSize + idbResult.totalSize;
    document.getElementById("storageTotalUsed").textContent =
      `${idbResult.complete === false ? "\u2265" : "\u2248"} ${formatBytes(totalSize)}`;
    const descEl = document.getElementById("storageTotalDesc");
    if (descEl) {
      const chromeLabel = formatBytes(chromeSize);
      const idbLabel = formatBytes(idbResult.totalSize);
      const chromeStorageText =
        window.I18n?.t("settings.chromeStorage") || "Chrome Storage";
      descEl.textContent = `${chromeStorageText} ${chromeLabel} + IndexedDB \u2248 ${idbLabel}`;
    }
    const pendingRow = document.getElementById("storagePendingRow");
    const pendingText = document.getElementById("storagePendingText");
    if (pendingRow && pendingText) {
      if (idbResult.pendingCount > 0) {
        pendingRow.classList.remove("hidden");
        pendingRow.classList.add("has-pending");
        pendingText.textContent =
          window.I18n?.t("storage.pendingUploadText", {
            count: idbResult.pendingCount,
          }) ||
          `${idbResult.pendingCount} file(s) pending upload to Google Flow`;
      } else {
        pendingRow.classList.add("hidden");
        pendingRow.classList.remove("has-pending");
      }
    }
  }
  function bindStorageEvents() {
    document
      .getElementById("storageRefreshBtn")
      ?.addEventListener("click", () => {
        loadDailyStats();
        scanAllStorage();
      });
    document
      .getElementById("chromeStorageToggle")
      ?.addEventListener("click", () => {
        const section = document.querySelector(".s-section-collapsible");
        const content = document.getElementById("chromeStorageCards");
        if (section && content) {
          section.classList.toggle("open");
          content.classList.toggle("hidden");
        }
      });
    document
      .getElementById("storageCleanupBtn")
      ?.addEventListener("click", async () => {
        const btn = document.getElementById("storageCleanupBtn");
        btn.disabled = true;
        btn.querySelector("span").textContent = "Cleaning up...";
        let freed = 0;
        try {
          const presetsResult = await new Promise((r) =>
            chrome.storage.local.get(["presets"], r),
          );
          if (presetsResult.presets?.thumbnailCache) {
            const before = estimateSize(presetsResult.presets);
            const cleaned = { ...presetsResult.presets };
            const trimmedCache = {};
            for (const [k, v] of Object.entries(cleaned.thumbnailCache || {})) {
              if (typeof v === "string" && !v.startsWith("data:"))
                trimmedCache[k] = v;
            }
            cleaned.thumbnailCache = trimmedCache;
            delete cleaned.fileNameCache;
            await new Promise((r) =>
              chrome.storage.local.set({ presets: cleaned }, r),
            );
            freed += Math.max(0, before - estimateSize(cleaned));
          }
          const tasksResult = await new Promise((r) =>
            chrome.storage.local.get(["af_tasks"], r),
          );
          if (tasksResult.af_tasks?.length > 0) {
            const before = estimateSize(tasksResult.af_tasks);
            const cleaned = tasksResult.af_tasks.map((task) => {
              const t = { ...task };
              for (const field of ["ref_thumbnails", "result_thumbnails"]) {
                if (t[field] && typeof t[field] === "object") {
                  const rt = {};
                  for (const [k, v] of Object.entries(t[field])) {
                    if (
                      typeof v === "string" &&
                      v.startsWith("data:") &&
                      v.length > 500
                    )
                      continue;
                    if (
                      typeof v === "object" &&
                      v?.thumbnail?.startsWith?.("data:") &&
                      v.thumbnail.length > 500
                    ) {
                      rt[k] = { ...v, thumbnail: "" };
                      continue;
                    }
                    rt[k] = v;
                  }
                  t[field] = rt;
                }
              }
              return t;
            });
            await new Promise((r) =>
              chrome.storage.local.set({ af_tasks: cleaned }, r),
            );
            freed += Math.max(0, before - estimateSize(cleaned));
          }
          const histResult = await new Promise((r) =>
            chrome.storage.local.get(["af_history"], r),
          );
          if (histResult.af_history?.length > 50) {
            const before = estimateSize(histResult.af_history);
            await new Promise((r) =>
              chrome.storage.local.set(
                { af_history: histResult.af_history.slice(-50) },
                r,
              ),
            );
            freed += Math.max(
              0,
              before - estimateSize(histResult.af_history.slice(-50)),
            );
          }
          if (freed > 0) {
            const msg = `Freed ${formatBytes(freed)}`;
            window.customDialog
              ? window.customDialog.alert(msg, {
                  type: "success",
                  title: "Cleanup successful",
                })
              : alert(msg);
          } else {
            window.customDialog
              ? window.customDialog.alert("No extra data to clean", {
                  type: "info",
                  title: "Cleanup",
                })
              : alert("No extra data");
          }
        } catch (e) {
          console.error("[Storage] Cleanup failed:", e);
        }
        btn.disabled = false;
        btn.querySelector("span").textContent = "Clean up extra data";
        scanAllStorage();
      });
    document
      .getElementById("storageClearAllBtn")
      ?.addEventListener("click", async () => {
        const warning =
          window.I18n?.t("storage.clearAllWarning") ||
          "DELETE ALL LOCAL DATA?\n\nThis will remove:\n\u2022 All Tasks and Workflows\n\u2022 Prompt Snippets and Presets\n\u2022 Albums and saved images\n\u2022 Image/video generation history\n\u2022 Uploaded-file cache\n\u2022 Angle results\n\nThis will keep:\n\u2022 Settings\n\u2022 Sign-in information\n\u2022 Data already synchronized to the server\n\nThis action CANNOT be undone!";
        const deleteAllLabel =
          window.I18n?.t("common.deleteAll") || "Delete All";
        const cancelLabel = window.I18n?.t("common.cancel") || "Cancel";
        const confirmed = window.customDialog
          ? await window.customDialog.confirm(warning, {
              title:
                window.I18n?.t("storage.clearAllTitle") || "Delete all data",
              type: "error",
              confirmText: deleteAllLabel,
              cancelText: cancelLabel,
            })
          : confirm(warning);
        if (!confirmed) return;
        try {
          const allData = await chrome.storage.local.get(null);
          const keysToRemove = Object.keys(allData).filter(
            (key) =>
              key.startsWith("af_") &&
              key !== "af_settings" &&
              key !== "af_auth",
          );
          if (keysToRemove.length > 0) {
            await chrome.storage.local.remove(keysToRemove);
          }
          await new Promise((resolve) => {
            const req = indexedDB.deleteDatabase("autoflow_pro");
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
            req.onblocked = () => resolve();
          });
          if (window.customDialog) {
            window.customDialog.alert(
              window.I18n?.t("storage.clearAllSuccess") ||
                "All local data deleted successfully!",
              {
                title: window.I18n?.t("common.success") || "Success",
                type: "success",
              },
            );
          }
          scanAllStorage();
        } catch (e) {
          if (window.customDialog) {
            window.customDialog.alert(
              (window.I18n?.t("common.error") || "Error") + ": " + e.message,
              {
                title: window.I18n?.t("common.error") || "Error",
                type: "error",
              },
            );
          }
        }
      });
  }
  let _telegramOtpPollingInterval = null;
  let _telegramOtpCountdownInterval = null;
  let _telegramOtpExpiresAt = null;
  let _telegramUseCustomBot = false;
  async function initTelegramSection() {
    _updateSharedBotLinkFromConfig();
    try {
      const result = await chrome.storage.local.get(["af_auth"]);
      const auth = result.af_auth;
      if (!auth?.token) {
        _showTelegramState("not_linked");
        return;
      }
      const resp = await _telegramApiCall("GET", "telegram/link/status");
      if (resp?.success && resp.data?.bot_username) {
        const botUsername = resp.data.bot_username;
        if (els.telegramSharedBotLink) {
          els.telegramSharedBotLink.textContent = `@${botUsername}`;
          els.telegramSharedBotLink.href = `https://t.me/${botUsername}`;
        }
      }
      if (resp?.success && resp.data?.linked) {
        const botTypeText =
          resp.data.bot_type === "custom"
            ? (window.I18n?.t("settings.telegramBotCustom") || "Custom bot") +
              " (Pro)"
            : window.I18n?.t("settings.telegramBotShared") || "Bot chung";
        _showTelegramState("linked", {
          username: resp.data.telegram_username || "--",
          botName: resp.data.bot_username ? `@${resp.data.bot_username}` : "--",
          botType: botTypeText,
          isCustomBot: resp.data.bot_type === "custom",
        });
      } else {
        _showTelegramState("not_linked");
      }
    } catch (e) {
      console.warn("[Settings] Telegram status error:", e);
      _showTelegramState("not_linked");
    }
  }
  function _updateSharedBotLinkFromConfig() {
    const botUsername = window.SystemConfig?.get?.(
      "telegram_shared_bot_username",
    );
    if (botUsername && els.telegramSharedBotLink) {
      els.telegramSharedBotLink.textContent = `@${botUsername}`;
      els.telegramSharedBotLink.href = `https://t.me/${botUsername}`;
    } else if (!botUsername) {
      console.debug(
        "[Tier3] telegram_shared_bot_username missing from SystemConfig",
      );
    }
  }
  async function _telegramApiCall(method, endpoint, data = null) {
    const result = await chrome.storage.local.get(["af_auth"]);
    const auth = result.af_auth;
    if (!auth?.token) return null;
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: "apiRequest", method, endpoint, data, token: auth.token },
        (r) => resolve(r),
      );
    });
  }
  function _showTelegramState(state, data = {}) {
    if (els.telegramNotLinked) els.telegramNotLinked.classList.add("hidden");
    if (els.telegramOtpDisplay) els.telegramOtpDisplay.classList.add("hidden");
    if (els.telegramLinked) els.telegramLinked.classList.add("hidden");
    if (state !== "otp") {
      _stopTelegramOtpPolling();
    }
    if (state === "linked") {
      if (els.telegramLinked) els.telegramLinked.classList.remove("hidden");
      if (els.telegramUsername)
        els.telegramUsername.textContent = data.username || "--";
      if (els.telegramLinkedBot)
        els.telegramLinkedBot.textContent = data.botName || "--";
      if (els.telegramBotType)
        els.telegramBotType.textContent =
          data.botType ||
          window.I18n?.t("settings.telegramBotShared") ||
          "Bot chung";
      if (els.telegramStatusBadge) {
        els.telegramStatusBadge.textContent =
          window.I18n?.t("settings.telegramStatusLinked") || "Linked";
        els.telegramStatusBadge.className =
          "s-section-badge telegram-status-linked";
      }
    } else if (state === "otp") {
      if (els.telegramOtpDisplay)
        els.telegramOtpDisplay.classList.remove("hidden");
      if (els.telegramStatusBadge) {
        els.telegramStatusBadge.textContent =
          window.I18n?.t("settings.telegramLinking") || "Linking...";
        els.telegramStatusBadge.className =
          "s-section-badge telegram-status-linking";
      }
    } else {
      if (els.telegramNotLinked)
        els.telegramNotLinked.classList.remove("hidden");
      if (els.telegramStatusBadge) {
        els.telegramStatusBadge.textContent =
          window.I18n?.t("settings.telegramStatusNotLinked") || "Not linked";
        els.telegramStatusBadge.className =
          "s-section-badge telegram-status-not-linked";
      }
      if (els.telegramOptionShared)
        els.telegramOptionShared.classList.add("telegram-bot-option--selected");
      if (els.telegramOptionCustom)
        els.telegramOptionCustom.classList.remove(
          "telegram-bot-option--selected",
        );
      if (els.telegramCustomBotSetup)
        els.telegramCustomBotSetup.classList.add("hidden");
      if (els.telegramCustomBotToken) els.telegramCustomBotToken.value = "";
      _telegramUseCustomBot = false;
    }
  }
  function selectTelegramBotOption(botType) {
    _telegramUseCustomBot = botType === "custom";
    if (els.telegramOptionShared) {
      els.telegramOptionShared.classList.toggle(
        "telegram-bot-option--selected",
        botType === "shared",
      );
    }
    if (els.telegramOptionCustom) {
      els.telegramOptionCustom.classList.toggle(
        "telegram-bot-option--selected",
        botType === "custom",
      );
    }
    if (els.telegramCustomBotSetup) {
      els.telegramCustomBotSetup.classList.toggle(
        "hidden",
        !_telegramUseCustomBot,
      );
    }
  }
  async function handleTelegramLink() {
    try {
      const result = await chrome.storage.local.get(["af_auth"]);
      const auth = result.af_auth;
      if (!auth?.token) {
        if (window.customDialog) {
          window.customDialog.alert(
            window.I18n?.t("settings.telegramLoginRequired") ||
              "Please log in before linking Telegram.",
            {
              title: window.I18n?.t("settings.notLoggedIn") || "Not logged in",
              type: "warning",
            },
          );
        }
        return;
      }
      if (_telegramUseCustomBot) {
        const customToken = els.telegramCustomBotToken?.value?.trim();
        if (!customToken) {
          if (window.customDialog) {
            window.customDialog.alert(
              window.I18n?.t("settings.telegramMissingToken") ||
                "Please enter a bot token.",
              {
                title:
                  window.I18n?.t("settings.telegramMissingTokenTitle") ||
                  "Missing token",
                type: "warning",
              },
            );
          }
          return;
        }
        if (els.telegramLinkBtn) {
          els.telegramLinkBtn.disabled = true;
          els.telegramLinkBtn.innerHTML =
            '<span class="s-spinner-sm"></span> Setting up bot...';
        }
        const customResp = await _telegramApiCall(
          "POST",
          "telegram/custom-bot",
          { token: customToken },
        );
        if (!customResp?.success) {
          const errMsg =
            customResp?.error?.message ||
            window.I18n?.t("settings.telegramCustomBotError") ||
            "Failed to save custom bot";
          if (window.customDialog) {
            window.customDialog.alert(errMsg, {
              title: window.I18n?.t("common.error") || "Error",
              type: "error",
            });
          }
          if (els.telegramLinkBtn) {
            els.telegramLinkBtn.disabled = false;
            els.telegramLinkBtn.innerHTML =
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg><span>' +
              (window.I18n?.t("settings.linkTelegram") || "Link Telegram") +
              "</span>";
          }
          return;
        }
        const botUsername = customResp.data?.bot_username || "Your Bot";
        _showTelegramState("linked");
        if (els.telegramBotName)
          els.telegramBotName.textContent = `@${botUsername}`;
        if (els.telegramLinkBtn) {
          els.telegramLinkBtn.disabled = false;
          els.telegramLinkBtn.innerHTML =
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg><span>' +
            (window.I18n?.t("settings.linkTelegram") || "Link Telegram") +
            "</span>";
        }
        if (window.customDialog) {
          const linkedMsg = (
            window.I18n?.t("settings.telegramLinkedWithBot") ||
            "Linked with bot @{botUsername}. Send any message to the bot to activate."
          ).replace("{botUsername}", botUsername);
          window.customDialog.alert(linkedMsg, {
            title:
              window.I18n?.t("settings.telegramLinkedSuccessTitle") ||
              "Success",
            type: "success",
          });
        }
        return;
      }
      if (els.telegramLinkBtn) {
        els.telegramLinkBtn.disabled = true;
        els.telegramLinkBtn.innerHTML =
          '<span class="s-spinner-sm"></span> ' +
          (window.I18n?.t("settings.telegramGeneratingCode") ||
            "Generating code...");
      }
      const resp = await _telegramApiCall("POST", "telegram/link/generate");
      if (resp?.success && resp.data?.code) {
        const code = resp.data.code;
        const botUrl = resp.data.bot_url || "";
        if (!botUrl)
          console.debug(
            "[Tier3] Telegram OTP: bot_url missing from API response",
          );
        const botUsername = botUrl
          ? botUrl.replace("https://t.me/", "@")
          : "--";
        _showTelegramState("otp");
        if (els.telegramOtpCode) els.telegramOtpCode.textContent = code;
        if (els.telegramOtpCodeSmall)
          els.telegramOtpCodeSmall.textContent = code;
        if (els.telegramBotName) els.telegramBotName.textContent = botUsername;
        if (els.telegramBotLink) els.telegramBotLink.href = botUrl;
        _telegramOtpExpiresAt =
          Date.now() + (resp.data.expires_in || 300) * 1e3;
        _startTelegramOtpCountdown();
        _startTelegramOtpPolling();
      } else {
        const errMsg =
          resp?.error?.message ||
          window.I18n?.t("settings.telegramOtpError") ||
          "Failed to generate OTP code";
        if (window.customDialog) {
          window.customDialog.alert(errMsg, {
            title: window.I18n?.t("common.error") || "Error",
            type: "error",
          });
        }
      }
    } catch (e) {
      console.error("[Settings] Telegram link error:", e);
      if (window.customDialog) {
        window.customDialog.alert(
          (window.I18n?.t("settings.telegramConnectionError") ||
            "Connection error") +
            ": " +
            e.message,
          { title: window.I18n?.t("common.error") || "Error", type: "error" },
        );
      }
    } finally {
      if (els.telegramLinkBtn) {
        els.telegramLinkBtn.disabled = false;
        els.telegramLinkBtn.innerHTML =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg><span>' +
          (window.I18n?.t("settings.linkTelegram") || "Link Telegram") +
          "</span>";
      }
    }
  }
  function _startTelegramOtpCountdown() {
    _stopTelegramOtpCountdown();
    const updateCountdown = () => {
      if (!_telegramOtpExpiresAt) return;
      const remaining = Math.max(
        0,
        Math.floor((_telegramOtpExpiresAt - Date.now()) / 1e3),
      );
      const minutes = Math.floor(remaining / 60);
      const seconds = remaining % 60;
      if (els.telegramOtpCountdown) {
        els.telegramOtpCountdown.textContent = `${minutes}:${seconds.toString().padStart(2, "0")} left`;
      }
      if (remaining <= 0) {
        _stopTelegramOtpPolling();
        _showTelegramState("not_linked");
        if (window.customDialog) {
          window.customDialog.alert(
            "OTP code expired. Please generate a new one.",
            { title: "Expired", type: "warning" },
          );
        }
      }
    };
    updateCountdown();
    _telegramOtpCountdownInterval = setInterval(updateCountdown, 1e3);
  }
  function _stopTelegramOtpCountdown() {
    if (_telegramOtpCountdownInterval) {
      clearInterval(_telegramOtpCountdownInterval);
      _telegramOtpCountdownInterval = null;
    }
    _telegramOtpExpiresAt = null;
  }
  function _startTelegramOtpPolling() {
    _stopTelegramOtpPolling();
    const pollStatus = async () => {
      try {
        const resp = await _telegramApiCall("GET", "telegram/link/status");
        if (resp?.success && resp.data?.linked) {
          _stopTelegramOtpPolling();
          const botTypeText =
            resp.data.bot_type === "custom"
              ? (window.I18n?.t("settings.telegramBotCustom") || "Custom bot") +
                " (Pro)"
              : window.I18n?.t("settings.telegramBotShared") || "Bot chung";
          if (!resp.data.bot_username)
            console.debug(
              "[Tier3] Telegram link complete: bot_username missing from API response",
            );
          _showTelegramState("linked", {
            username: resp.data.telegram_username || "--",
            botName: resp.data.bot_username
              ? `@${resp.data.bot_username}`
              : "--",
            botType: botTypeText,
            isCustomBot: resp.data.bot_type === "custom",
          });
          if (window.customDialog) {
            window.customDialog.alert(
              window.I18n?.t("settings.telegramLinkSuccess") ||
                "Telegram linked successfully!",
              {
                title:
                  window.I18n?.t("settings.telegramLinkedSuccessTitle") ||
                  "Success",
                type: "success",
              },
            );
          }
        }
      } catch (e) {
        console.warn("[Settings] Telegram polling error:", e);
      }
    };
    _telegramOtpPollingInterval = setInterval(pollStatus, 3e3);
  }
  function _stopTelegramOtpPolling() {
    if (_telegramOtpPollingInterval) {
      clearInterval(_telegramOtpPollingInterval);
      _telegramOtpPollingInterval = null;
    }
    _stopTelegramOtpCountdown();
  }
  function handleTelegramOtpCancel() {
    _stopTelegramOtpPolling();
    _showTelegramState("not_linked");
  }
  async function handleTelegramOtpCopy() {
    const code = els.telegramOtpCode?.textContent;
    if (!code || code === "------") return;
    try {
      await navigator.clipboard.writeText(code);
      if (els.telegramOtpCopyBtn) {
        const originalTitle = els.telegramOtpCopyBtn.title;
        els.telegramOtpCopyBtn.title =
          window.I18n?.t("common.copied") || "Copied!";
        setTimeout(() => {
          if (els.telegramOtpCopyBtn)
            els.telegramOtpCopyBtn.title =
              originalTitle || window.I18n?.t("settings.copy") || "Copy";
        }, 2e3);
      }
    } catch (e) {
      console.warn("[Settings] Copy OTP failed:", e);
    }
  }
  async function handleTelegramUnlink() {
    const shouldUnlink = window.customDialog
      ? await window.customDialog.confirm(
          "Unlink Telegram? You will no longer receive commands from the bot.",
          {
            title: "Unlink Telegram",
            type: "warning",
            confirmText: "Unlink",
            cancelText: "Keep",
          },
        )
      : confirm("Unlink Telegram?");
    if (!shouldUnlink) return;
    try {
      const resp = await _telegramApiCall("POST", "telegram/unlink");
      if (resp?.success) {
        _showTelegramState("not_linked");
        if (window.customDialog) {
          window.customDialog.alert(
            window.I18n?.t("settings.telegramUnlinkSuccess") ||
              "Telegram unlinked successfully.",
            {
              title: window.I18n?.t("common.success") || "Success",
              type: "success",
            },
          );
        }
      } else {
        const errMsg =
          resp?.error?.message ||
          window.I18n?.t("settings.telegramUnlinkError") ||
          "Failed to unlink Telegram";
        if (window.customDialog) {
          window.customDialog.alert(errMsg, {
            title: window.I18n?.t("common.error") || "Error",
            type: "error",
          });
        }
      }
    } catch (e) {
      console.error("[Settings] Telegram unlink error:", e);
    }
  }
  async function _toggleGoogleLink(auth) {
    if (!auth?.token) return;
    const t = (k, f) => window.I18n?.t?.(k) || f;
    const icon = document.getElementById("googleLinkIcon");
    const linked = !!auth.user?.google_id;
    if (linked) {
      let ok = true;
      if (window.customDialog?.confirm) {
        ok = await window.customDialog.confirm(
          t("settings.googleUnlinkConfirm", "Unlink your Google account?"),
          { title: t("settings.unlinkGoogle", "Unlink"), type: "warning" },
        );
      }
      if (!ok) return;
      if (icon) icon.style.opacity = "0.5";
      try {
        await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            {
              action: "apiRequest",
              method: "POST",
              endpoint: "auth/google/unlink",
              token: auth.token,
            },
            (resp) => {
              if (chrome.runtime.lastError)
                return reject(new Error(chrome.runtime.lastError.message));
              if (resp?.success) resolve(resp.data);
              else
                reject(
                  new Error(
                    resp?.error?.message ||
                      t("settings.googleUnlinkError", "Error unlinking Google"),
                  ),
                );
            },
          );
        });
        if (auth.user) {
          delete auth.user.google_id;
          await chrome.storage.local.set({ af_auth: auth });
        }
        if (icon) {
          icon.classList.remove("linked");
          icon.title = t("settings.linkGoogle", "Link");
        }
        window.customDialog?.alert?.(
          t("settings.googleUnlinkSuccess", "Google account unlinked."),
          { title: t("common.success", "Success"), type: "success" },
        );
      } catch (e) {
        window.customDialog?.alert?.(
          e.message ||
            t("settings.googleUnlinkFailed", "Failed to unlink Google."),
          { title: t("common.error", "Error"), type: "error" },
        );
      } finally {
        if (icon) icon.style.opacity = "";
      }
    } else {
      try {
        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            {
              action: "apiRequest",
              method: "GET",
              endpoint: "auth/google/link-url",
              token: auth.token,
            },
            (resp) => {
              if (chrome.runtime.lastError)
                return reject(new Error(chrome.runtime.lastError.message));
              if (resp?.success) resolve(resp.data);
              else
                reject(
                  new Error(
                    resp?.error?.message ||
                      t(
                        "settings.googleLinkUrlError",
                        "Error getting Google link URL",
                      ),
                  ),
                );
            },
          );
        });
        const url = response?.url || response;
        if (url && typeof url === "string" && url.startsWith("http"))
          chrome.tabs.create({ url });
        else
          throw new Error(
            t(
              "settings.googleInvalidUrl",
              "Did not receive a valid Google link URL.",
            ),
          );
      } catch (e) {
        window.customDialog?.alert?.(
          e.message || t("settings.googleLinkError", "Failed to link Google."),
          { title: t("common.error", "Error"), type: "error" },
        );
      }
    }
  }
  async function initAccountLinking() {
    const section = document.getElementById("accountLinkingSection");
    const googleLinkBtn = document.getElementById("googleLinkBtn");
    const googleUnlinkBtn = document.getElementById("googleUnlinkBtn");
    const googleLinkStatus = document.getElementById("googleLinkStatus");
    if (!section) return;
    try {
      const result = await chrome.storage.local.get(["af_auth"]);
      const auth = result.af_auth;
      if (!auth?.token) {
        section.style.display = "none";
        return;
      }
      section.style.display = "";
      const user = auth.user;
      const isGoogleLinked = !!user?.google_id;
      if (isGoogleLinked) {
        googleLinkStatus.textContent =
          window.I18n?.t("settings.telegramStatusLinked") || "Linked";
        googleLinkStatus.style.color = "#22c55e";
        googleLinkBtn?.classList.add("hidden");
        googleUnlinkBtn?.classList.remove("hidden");
      } else {
        googleLinkStatus.textContent =
          window.I18n?.t("settings.notLinked") || "Not linked";
        googleLinkStatus.style.color = "";
        googleLinkBtn?.classList.remove("hidden");
        googleUnlinkBtn?.classList.add("hidden");
      }
      googleLinkBtn?.addEventListener("click", async () => {
        googleLinkBtn.disabled = true;
        googleLinkBtn.textContent =
          window.I18n?.t("settings.googleLinking") || "Linking...";
        try {
          const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
              {
                action: "apiRequest",
                method: "GET",
                endpoint: "auth/google/link-url",
                token: auth.token,
              },
              (resp) => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                  return;
                }
                if (resp?.success) resolve(resp.data);
                else
                  reject(
                    new Error(
                      resp?.error?.message ||
                        window.I18n?.t("settings.googleLinkUrlError") ||
                        "Error getting Google link URL",
                    ),
                  );
              },
            );
          });
          const url = response?.url || response;
          if (url && typeof url === "string" && url.startsWith("http")) {
            chrome.tabs.create({ url });
          } else {
            throw new Error(
              window.I18n?.t("settings.googleInvalidUrl") ||
                "Did not receive a valid Google link URL.",
            );
          }
        } catch (e) {
          if (window.customDialog) {
            window.customDialog.alert(
              e.message ||
                window.I18n?.t("settings.googleLinkError") ||
                "Failed to link Google.",
              {
                title: window.I18n?.t("common.error") || "Error",
                type: "error",
              },
            );
          }
        } finally {
          googleLinkBtn.disabled = false;
          googleLinkBtn.textContent =
            window.I18n?.t("settings.linkGoogle") || "Link";
        }
      });
      googleUnlinkBtn?.addEventListener("click", async () => {
        googleUnlinkBtn.disabled = true;
        googleUnlinkBtn.textContent =
          window.I18n?.t("settings.googleUnlinking") || "Unlinking...";
        try {
          await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
              {
                action: "apiRequest",
                method: "POST",
                endpoint: "auth/google/unlink",
                token: auth.token,
              },
              (resp) => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                  return;
                }
                if (resp?.success) resolve(resp.data);
                else
                  reject(
                    new Error(
                      resp?.error?.message ||
                        window.I18n?.t("settings.googleUnlinkError") ||
                        "Error unlinking Google",
                    ),
                  );
              },
            );
          });
          googleLinkStatus.textContent =
            window.I18n?.t("settings.notLinked") || "Not linked";
          googleLinkStatus.style.color = "";
          googleLinkBtn?.classList.remove("hidden");
          googleUnlinkBtn?.classList.add("hidden");
          if (auth.user) {
            delete auth.user.google_id;
            await chrome.storage.local.set({ af_auth: auth });
          }
          if (window.customDialog) {
            window.customDialog.alert(
              window.I18n?.t("settings.googleUnlinkSuccess") ||
                "Google account unlinked.",
              {
                title: window.I18n?.t("common.success") || "Success",
                type: "success",
              },
            );
          }
        } catch (e) {
          if (window.customDialog) {
            window.customDialog.alert(
              e.message ||
                window.I18n?.t("settings.googleUnlinkFailed") ||
                "Failed to unlink Google.",
              {
                title: window.I18n?.t("common.error") || "Error",
                type: "error",
              },
            );
          }
        } finally {
          googleUnlinkBtn.disabled = false;
          googleUnlinkBtn.textContent =
            window.I18n?.t("settings.unlinkGoogle") || "Unlink";
        }
      });
    } catch (e) {
      console.error("[Settings] Error init account linking:", e);
    }
  }
  function _applySystemSettings() {
    chrome.storage.local.get(["af_system_settings"], (res) => {
      const ss = res.af_system_settings || {};
      const showUpgrade =
        ss.show_upgrade_ui === true ||
        ss.show_upgrade_ui === "1" ||
        ss.show_upgrade_ui === 1;
      if (!showUpgrade && ss.show_upgrade_ui !== void 0) {
        document.body.classList.add("hide-upgrade-ui");
      } else {
        document.body.classList.remove("hide-upgrade-ui");
      }
      if (window.SystemConfig) {
        const previousDriver = window.SystemConfig.get("flow_api_driver", null);
        window.SystemConfig.restoreFromStorage()
          .then(() => {
            window.SystemConfig.applyToUI();
            _displayVersion();
            if (
              window.SystemConfig.get("flow_api_driver", null) !==
              previousDriver
            ) {
              checkFeatureEntitlements();
            }
          })
          .catch(() => {});
      }
    });
  }
  async function _checkTelegramLinkStatus() {
    if (!window.authManager || !window.authManager.isLoggedIn()) {
      if (els.notifyTelegramRow) els.notifyTelegramRow.style.display = "none";
      return;
    }
    try {
      const result = await window.authManager._apiCall(
        "GET",
        "telegram/link/status",
      );
      const isLinked = result && result.linked;
      if (els.notifyTelegramRow) {
        els.notifyTelegramRow.style.display = isLinked ? "" : "none";
      }
    } catch (e) {
      if (els.notifyTelegramRow) els.notifyTelegramRow.style.display = "none";
    }
  }
  async function _populateDynamicSelects(activate = false) {
    try {
      if (!window.authManager?.isLoggedIn?.()) return;
      if (activate) {
        const claim = await window.ExtensionDeviceManager?.claim?.();
        if (claim?.registered !== true) {
          await window.ConfigAccessUI?.refresh?.();
          return;
        }
      }
      if (window.ModelRegistry?.fetch) {
        await window.ModelRegistry.fetch();
      }
      _fillModelSelect(els.defaultImageModel, "flow", "image");
      _fillModelSelect(els.defaultVideoModel, "flow", "video");
      _fillModelSelect(
        els.telegramFlowModel,
        "flow",
        "image",
        (m) => `\u{1F34C} ${(m.name || "").replace(/^🍌\s*/, "")}`,
      );
      _fillModelSelect(
        els.telegramFlowVideoModel,
        "flow",
        "video",
        (m) => `\u{1F3AC} ${(m.name || "").replace(/^🎬\s*/, "")}`,
      );
      _fillModelSelect(els.chatgptDefaultModel, "chatgpt", "image");
      _fillModelSelect(els.geminiDefaultModel, "gemini", "image");
      _fillModelSelect(els.telegramGeminiModel, "gemini", "image");
      if (window.ProviderConfigManager?._fetchApiConfigs) {
        await window.ProviderConfigManager._fetchApiConfigs();
        _fillRatioSelect(els.telegramFlowRatio, "flow", "image");
        _fillRatioSelect(els.defaultImageRatio, "flow", "image");
        _fillRatioSelect(els.defaultVideoRatio, "flow", "video");
        _fillRatioSelect(els.chatgptDefaultRatio, "chatgpt", "image");
        _fillRatioSelect(els.telegramGeminiRatio, "gemini", "image");
        _fillRatioSelect(els.geminiVideoRatio, "gemini", "video");
        _fillRatioSelect(els.museDefaultRatio, "muse", "image");
        _fillRatioSelect(els.grokDefaultRatio, "grok", "image");
        _fillDownloadResolutionSelect(els.downloadResolution, "flow", "image");
        _fillDownloadResolutionSelect(
          els.videoDownloadResolution,
          "flow",
          "video",
        );
        _fillDownloadResolutionSelect(
          els.telegramDownloadResolution,
          "flow",
          "image",
        );
        _fillDownloadResolutionSelect(
          els.telegramVideoDownloadResolution,
          "flow",
          "video",
        );
        _fillDownloadResolutionSelect(
          els.mcpDownloadResolution,
          "flow",
          "image",
        );
        _fillDownloadResolutionSelect(
          els.mcpVideoDownloadResolution,
          "flow",
          "video",
        );
        _fillVideoDurationSelect(els.defaultVideoDuration, "flow");
      }
      els.defaultVideoModel?.addEventListener("change", () => {
        _fillVideoDurationSelect(els.defaultVideoDuration, "flow");
      });
    } catch (e) {
      console.warn(
        "[Settings] Provider config unavailable; model controls remain unavailable:",
        e?.message,
      );
    }
  }
  function _fillModelSelect(selectEl, providerSlug, mediaType, labelFn) {
    if (!selectEl || !window.ModelRegistry?.getModelsSync) return;
    const models = window.ModelRegistry.getModelsSync(providerSlug, mediaType);
    if (!Array.isArray(models) || models.length === 0)
      return { invalid: false };
    const prevValue =
      window.ModelRegistry?.getCanonicalValue?.(providerSlug, selectEl.value) ||
      selectEl.value;
    selectEl.innerHTML = "";
    for (const m of models) {
      const opt = document.createElement("option");
      opt.value = m.value || m.name;
      opt.textContent = labelFn ? labelFn(m) : m.name;
      selectEl.appendChild(opt);
    }
    if (prevValue && [...selectEl.options].some((o) => o.value === prevValue)) {
      selectEl.value = prevValue;
    } else {
      const configuredDefault = models.find((m) => m.is_default)?.value;
      if (
        configuredDefault &&
        [...selectEl.options].some((o) => o.value === configuredDefault)
      ) {
        selectEl.value = configuredDefault;
      }
    }
    return {
      invalid: !!prevValue && selectEl.value !== prevValue,
      previous: prevValue,
      current: selectEl.value,
    };
  }
  function _fillRatioSelect(selectEl, providerSlug, mode) {
    if (!selectEl || !window.ProviderConfigManager?.getRatiosSync) return;
    const ratios = window.ProviderConfigManager.getRatiosSync(
      providerSlug,
      mode,
    );
    if (!Array.isArray(ratios) || ratios.length === 0) return;
    const prevValue = selectEl.value;
    const iconMap = {
      "16:9": "\u25AC",
      "9:16": "\u25AE",
      "1:1": "\u25A1",
      "4:3": "\u25AD",
      "3:4": "\u25AF",
      "2:3": "\u25AF",
      "3:2": "\u25AD",
    };
    selectEl.innerHTML = "";
    for (const r of ratios) {
      const isObject = typeof r === "object" && r !== null;
      const optionValue = isObject
        ? providerSlug === "gemini"
          ? r.value
          : r.ui_name || r.value
        : r;
      if (!optionValue) continue;
      const numericLabel = isObject ? r.value : r;
      const icon = iconMap[numericLabel] || "";
      const opt = document.createElement("option");
      opt.value = optionValue;
      opt.textContent = isObject
        ? `${icon} ${_capitalize(r.ui_name)} (${r.value})`.trim()
        : `${icon} ${r}`.trim();
      selectEl.appendChild(opt);
    }
    if (prevValue && [...selectEl.options].some((o) => o.value === prevValue)) {
      selectEl.value = prevValue;
    } else {
      const configuredDefault = ratios.find(
        (r) => typeof r === "object" && r?.is_default === true,
      );
      const configuredValue = configuredDefault
        ? providerSlug === "gemini"
          ? configuredDefault.value
          : configuredDefault.ui_name || configuredDefault.value
        : null;
      if (
        configuredValue &&
        [...selectEl.options].some((o) => o.value === configuredValue)
      ) {
        selectEl.value = configuredValue;
      }
    }
  }
  function _capitalize(s) {
    if (!s || typeof s !== "string") return "";
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function _fillDownloadResolutionSelect(selectEl, providerSlug, mode) {
    if (!selectEl || !window.ProviderConfigManager?.getDownloadResolutionsSync)
      return;
    const options = window.ProviderConfigManager.getDownloadResolutionsSync(
      providerSlug,
      mode,
    );
    if (!Array.isArray(options) || options.length === 0) return;
    const prevValue = selectEl.value;
    selectEl.innerHTML = "";
    for (const r of options) {
      const opt = document.createElement("option");
      opt.value = r.value;
      opt.textContent = r.label || r.menu_label || r.value;
      selectEl.appendChild(opt);
    }
    if (prevValue && [...selectEl.options].some((o) => o.value === prevValue)) {
      selectEl.value = prevValue;
    }
  }
  function _fillVideoDurationSelect(selectEl, providerSlug = "flow") {
    if (!selectEl || !window.ProviderConfigManager?.safeGetVideoDurationsSync)
      return;
    let tier = "default";
    const videoModelEl = els.defaultVideoModel;
    if (videoModelEl?.value && window.ModelRegistry?.safeGetModelsSync) {
      try {
        const models =
          window.ModelRegistry.safeGetModelsSync("flow", "video") || [];
        const modelObj = models.find(
          (m) =>
            m.value === videoModelEl.value || m.name === videoModelEl.value,
        );
        if (modelObj?.config?.duration_tier)
          tier = modelObj.config.duration_tier;
      } catch (_) {}
    }
    const durations = window.ProviderConfigManager.safeGetVideoDurationsSync(
      providerSlug,
      tier,
    );
    if (!Array.isArray(durations) || durations.length === 0) return;
    const prevValue = selectEl.value;
    selectEl.innerHTML = "";
    for (const d of durations) {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = d;
      selectEl.appendChild(opt);
    }
    if (prevValue && durations.includes(prevValue)) {
      selectEl.value = prevValue;
    } else {
      const defaultIdx = durations.indexOf("6s");
      selectEl.value = defaultIdx >= 0 ? durations[defaultIdx] : durations[0];
    }
  }
  function renderAboutProviders(snapshot) {
    const container = document.getElementById("aboutProviders");
    if (!container) return;
    container.replaceChildren();
    const providers =
      snapshot || window.ProviderConfigManager?._apiConfigsCache?.data;
    if (!providers) return;
    for (const [slug, provider] of Object.entries(providers)) {
      const card = document.createElement("div");
      card.className = "s-info-provider-card";
      const header = document.createElement("div");
      header.className = "s-info-provider-header";
      const icon = document.createElement("div");
      icon.className = "s-info-provider-icon";
      icon.innerHTML = window.ProviderBrandIcons?.get(slug) || "";
      const name = document.createElement("span");
      name.className = "s-info-provider-name";
      name.textContent = provider.name || slug;
      header.append(icon, name);
      card.appendChild(header);
      container.appendChild(card);
    }
  }
  function _displayVersion() {
    const manifest = chrome?.runtime?.getManifest?.();
    const version = manifest?.version ? `v${manifest.version}` : "";
    const versionEl = document.getElementById("aboutVersion");
    if (versionEl && version) {
      versionEl.textContent = version;
    }
    const aboutTitle = document.querySelector(".s-about-title");
    if (aboutTitle)
      aboutTitle.textContent =
        window.SystemConfig?.get?.("app_name") || manifest?.name || "";
    const subtitleEl = document.getElementById("settingsSubtitle");
    if (subtitleEl) {
      const appName = window.SystemConfig?.get?.("app_name") || "Toby Flow";
      subtitleEl.textContent = version ? `${appName} ${version}` : appName;
    }
    const updateBtn = document.getElementById("aboutUpdateBtn");
    if (updateBtn && !updateBtn._bound) {
      updateBtn._bound = true;
      updateBtn.hidden = true;
      window.SystemConfig?.fetch?.()
        .then((settings) => {
          updateBtn.hidden = !settings?.extension_url;
        })
        .catch(() => {
          updateBtn.hidden = true;
        });
      updateBtn.addEventListener("click", async () => {
        const settings = await window.SystemConfig?.fetch?.().catch(() => null);
        const url = settings?.extension_url;
        if (url) await chrome.tabs.create({ url });
      });
    }
  }
  function _renderVoicesSyncStatus() {
    const statusEl = document.getElementById("voicesSyncStatus");
    if (!statusEl || !window.VoiceRegistry) return;
    const stats = window.VoiceRegistry.getStats();
    if (!stats || stats.total === 0) {
      statusEl.textContent =
        window.I18n?.t("settings.voicesNeedSync") ||
        "Not synced yet \u2014 click Resync to start";
      return;
    }
    const parts = [];
    if (stats.base > 0) parts.push(`${stats.base} base`);
    if (stats.custom > 0) parts.push(`${stats.custom} custom`);
    let msg = `${stats.total} voices (${parts.join(" + ")})`;
    if (stats.scrapedAt) {
      const mins = Math.round((Date.now() - stats.scrapedAt) / 6e4);
      const timeStr =
        mins < 1
          ? "v\u1EEBa xong"
          : mins < 60
            ? `${mins}m tr\u01B0\u1EDBc`
            : `${Math.round(mins / 60)}h tr\u01B0\u1EDBc`;
      msg += ` \xB7 Sync l\u1EA7n cu\u1ED1i: ${timeStr}`;
    }
    statusEl.textContent = msg;
  }
  function initFlowVoicesSection() {
    const btn = document.getElementById("resyncFlowVoicesBtn");
    const adminBadge = document.getElementById("resyncVoicesAdminBadge");
    const adminHint = document.getElementById("voicesSyncAdminHint");
    if (!btn) return;
    window.VoiceRegistry?.initCrossContextSync?.();
    const user = window.authManager?.user;
    const isAdmin = !!(user?.role === "admin" || user?.is_admin === true);
    if (adminBadge)
      adminBadge.style.display = isAdmin ? "inline-block" : "none";
    if (adminHint) adminHint.style.display = isAdmin ? "block" : "none";
    _renderVoicesSyncStatus();
    btn.addEventListener("click", async () => {
      const statusEl = document.getElementById("voicesSyncStatus");
      btn.disabled = true;
      if (statusEl)
        statusEl.textContent =
          window.I18n?.t("settings.voicesSyncing") ||
          "Opening Flow tab and scraping...";
      try {
        if (!window.MessageBridge?.syncFlowVoices) {
          throw new Error("MessageBridge.syncFlowVoices not available");
        }
        const result = await window.MessageBridge.syncFlowVoices();
        const baseT = result.base || 0;
        const customT = result.custom || 0;
        const totalT = result.total || 0;
        const msg = result.uploaded_to_server
          ? `\u2713 ${totalT} voices (${baseT} base + ${customT} custom). \u0110\xE3 upload l\xEAn server.`
          : `\u2713 ${totalT} voices \u0111\xE3 l\u01B0u local (${baseT} base + ${customT} custom).`;
        if (statusEl) statusEl.textContent = msg;
      } catch (e) {
        console.error("[SettingsPage] Resync voices failed:", e);
        if (statusEl)
          statusEl.textContent = `\u2717 ${e.message || "Sync failed"}`;
      } finally {
        btn.disabled = false;
      }
    });
    if (window.eventBus) {
      window.eventBus.on("voices:refreshed", _renderVoicesSyncStatus);
      window.eventBus.on(
        "voices:base_catalog_updated",
        _renderVoicesSyncStatus,
      );
    }
  }
  async function init() {
    if (window.I18n) {
      await window.I18n.init();
    }
    if (window.authManager?.init) {
      try {
        await window.authManager.init();
      } catch (e) {
        console.warn("[SettingsPage] AuthManager init failed:", e?.message);
      }
    }
    window.ExtensionDeviceManager?.init?.();
    try {
      await window.SystemConfig?.restoreFromStorage?.();
    } catch (_) {}
    bindElements();
    bindEvents();
    _startFlowWebHealth();
    initTabs();
    _displayVersion();
    bindStorageEvents();
    if (window.SseClient && window.authManager?.isLoggedIn?.()) {
      try {
        await window.SseClient.connect();
        console.log(
          "[SettingsPage] SseClient connected (follower mode expected)",
        );
      } catch (e) {
        console.warn("[SettingsPage] SseClient connect failed:", e?.message);
      }
    }
    await _populateDynamicSelects(true);
    renderAboutProviders();
    loadSettings();
    fetchAndMergeServerSettings();
    _checkTelegramLinkStatus();
    loadUserProfile();
    _fetchPlansForCrowns()
      .then(() => checkFeatureEntitlements())
      .catch(() => {});
    checkFeatureEntitlements();
    initTelegramSection();
    _initTelegramQuotaUpgrade();
    _loadTelegramQuota();
    initAccountLinking();
    _applySystemSettings();
    loadDailyStats();
    updateDataManagementVisibility();
    initFlowVoicesSection();
    if (window.I18n) {
      window.I18n.applyTranslations(document.body);
      document.title = window.I18n.t("settings.title") || "Settings";
    }
    if (window.eventBus) {
      window.eventBus.on("provider:api_config_updated", () =>
        renderAboutProviders(),
      );
      window.eventBus.on("provider:models_updated", () =>
        renderAboutProviders(),
      );
      window.eventBus.on("provider:updated", () => _populateDynamicSelects());
      window.eventBus.on("extension-device:claimed", () =>
        _populateDynamicSelects(),
      );
      window.eventBus.on("i18n:changed", () => {
        if (window.I18n) {
          window.I18n.applyTranslations(document.body);
          document.title = window.I18n.t("settings.title") || "Settings";
        }
      });
      window.eventBus.on("provider:api_config_updated", ({ provider, key }) => {
        try {
          if (key === "download_resolutions" && provider === "flow") {
            _fillDownloadResolutionSelect(
              els.downloadResolution,
              "flow",
              "image",
            );
            _fillDownloadResolutionSelect(
              els.videoDownloadResolution,
              "flow",
              "video",
            );
            _fillDownloadResolutionSelect(
              els.telegramDownloadResolution,
              "flow",
              "image",
            );
            _fillDownloadResolutionSelect(
              els.telegramVideoDownloadResolution,
              "flow",
              "video",
            );
            _fillDownloadResolutionSelect(
              els.mcpDownloadResolution,
              "flow",
              "image",
            );
            _fillDownloadResolutionSelect(
              els.mcpVideoDownloadResolution,
              "flow",
              "video",
            );
            return;
          }
        } catch (_) {}
        if (key !== "ratios") return;
        try {
          if (provider === "flow") {
            _fillRatioSelect(els.telegramFlowRatio, "flow", "image");
            _fillRatioSelect(els.defaultImageRatio, "flow", "image");
            _fillRatioSelect(els.defaultVideoRatio, "flow", "video");
          } else if (provider === "chatgpt") {
            _fillRatioSelect(els.chatgptDefaultRatio, "chatgpt", "image");
          } else if (provider === "gemini") {
            _fillRatioSelect(els.telegramGeminiRatio, "gemini", "image");
            _fillRatioSelect(els.geminiVideoRatio, "gemini", "video");
          } else if (provider === "grok") {
            _fillRatioSelect(els.grokDefaultRatio, "grok", "image");
          } else if (provider === "muse") {
            _fillRatioSelect(els.museDefaultRatio, "muse", "image");
          }
        } catch (_e) {}
      });
      window.eventBus.on("provider:models_updated", () => {
        try {
          _fillModelSelect(els.defaultImageModel, "flow", "image");
          _fillModelSelect(els.defaultVideoModel, "flow", "video");
          _fillModelSelect(
            els.telegramFlowModel,
            "flow",
            "image",
            (m) => `\u{1F34C} ${(m.name || "").replace(/^🍌\s*/, "")}`,
          );
          _fillModelSelect(
            els.telegramFlowVideoModel,
            "flow",
            "video",
            (m) => `\u{1F3AC} ${(m.name || "").replace(/^🎬\s*/, "")}`,
          );
          _fillModelSelect(els.chatgptDefaultModel, "chatgpt", "image");
          const geminiDefaultChange = _fillModelSelect(
            els.geminiDefaultModel,
            "gemini",
            "image",
          );
          const geminiTelegramChange = _fillModelSelect(
            els.telegramGeminiModel,
            "gemini",
            "image",
          );
          if (geminiDefaultChange?.invalid || geminiTelegramChange?.invalid) {
            window.customDialog?.alert?.(
              window.I18n?.t?.("settings.providerModelChanged"),
              { title: window.I18n?.t?.("common.notice"), type: "info" },
            );
          }
        } catch (_e) {}
      });
    }
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.action === "auth:oauthLogin" && msg.token) {
        console.log("[Settings] Login success received, refreshing all data");
        loadSettings();
        loadUserProfile();
        loadDailyStats();
        scanAllStorage();
        checkFeatureEntitlements();
        initTelegramSection();
        initAccountLinking();
        _checkTelegramLinkStatus();
        updateDataManagementVisibility();
      }
      if (msg.action === "sseRelay:entitlements_changed") {
        console.log("[Settings] SSE entitlements changed, refreshing UI");
        try {
          if (msg.data?.plan?.slug && window.authManager?.user) {
            window.authManager.user.plan_slug = msg.data.plan.slug;
            if (msg.data.plan.name)
              window.authManager.user.plan_name = msg.data.plan.name;
          }
          loadUserProfile();
          loadDailyStats();
          checkFeatureEntitlements();
          updateDataManagementVisibility();
        } catch (e) {
          console.warn(
            "[Settings] sseRelay:entitlements_changed handler error:",
            e,
          );
        }
      }
      if (msg.action === "sseRelay:system_settings_changed") {
        try {
          checkFeatureEntitlements._wmSystemRefreshAttempted = false;
          if (msg.data && typeof msg.data === "object")
            window.SystemConfig?.handleSseUpdate?.(msg.data);
          checkFeatureEntitlements();
          renderBridgeGuide(false);
        } catch (e) {
          console.warn(
            "[Settings] sseRelay:system_settings_changed handler error:",
            e,
          );
        }
      }
      if (msg.action === "sseRelay:force_logout") {
        console.log("[Settings] SSE force_logout, closing window");
        try {
          window.close();
        } catch (e) {}
      }
      if (msg.action === "auth:googleLinked") {
        console.log(
          "[Settings] Google link success received, refreshing user data",
        );
        (async () => {
          try {
            const stored = await chrome.storage.local.get(["af_auth"]);
            const auth = stored.af_auth;
            if (!auth?.token) return;
            const resp = await new Promise((resolve) => {
              chrome.runtime.sendMessage(
                {
                  action: "apiRequest",
                  method: "GET",
                  endpoint: "auth/me",
                  token: auth.token,
                },
                resolve,
              );
            });
            if (resp?.success && resp.data?.user) {
              await chrome.storage.local.set({
                af_auth: { ...auth, user: resp.data.user },
              });
              console.log("[Settings] User data refreshed with google_id");
            }
            loadUserProfile();
            initAccountLinking();
            if (window.customDialog) {
              window.customDialog.alert(
                window.I18n?.t("settings.googleLinkSuccess") ||
                  "Google account linked successfully.",
                {
                  title: window.I18n?.t("common.success") || "Success",
                  type: "success",
                },
              );
            }
          } catch (e) {
            console.error("[Settings] Error refreshing user data:", e);
          }
        })();
      }
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "session" && changes.flowReloadUiState) {
        const previous = changes.flowReloadUiState.oldValue;
        const next = changes.flowReloadUiState.newValue;
        if (previous?.active !== next?.active) {
          _refreshFlowWebHealth();
          if (next?.active !== true && _flowApiEntitled) {
            window.BridgeClient?.invalidate?.();
            window.FlowApiSessionCoordinator?.invalidate?.({
              preserveBridge: true,
            });
            renderBridgeGuide(false);
          }
        }
      }
      if (area === "local") {
        if (changes.af_daily_stats || changes.af_local_usage) loadDailyStats();
        if (changes.toby_provider_api_configs)
          renderAboutProviders(
            changes.toby_provider_api_configs.newValue?.data || {},
          );
        if (changes.af_locale && window.I18n) {
          window.I18n.setLocale(changes.af_locale.newValue, false);
          window.I18n.applyTranslations(document.body);
          document.title = window.I18n.t("settings.title") || "Settings";
          if (els.language) {
            els.language.value = changes.af_locale.newValue;
          }
        }
        if (changes.af_entitlements) {
          checkFeatureEntitlements();
          _loadMcpTokens();
          loadDailyStats();
          scanAllStorage();
          loadUserProfile();
          _loadTelegramQuota();
        }
        if (changes.af_system_settings) {
          checkFeatureEntitlements._wmSystemRefreshAttempted = false;
          checkFeatureEntitlements();
        }
        if (changes.af_settings) {
          loadSettings();
        }
        if (changes.af_auth) {
          _loadMcpTokens();
          loadSettings();
          loadUserProfile();
          loadDailyStats();
          scanAllStorage();
          checkFeatureEntitlements();
          initTelegramSection();
          initAccountLinking();
          updateDataManagementVisibility();
          if (changes.af_auth.newValue?.token) {
            fetchAndMergeServerSettings();
          }
        }
        if (changes.af_system_settings) _applySystemSettings();
      }
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
