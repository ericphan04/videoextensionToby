(function () {
  if (typeof window.showNotification === "function") return;
  const _icons = {
    success:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
    error:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
    info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
    warning:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
  };
  let _timer = null;
  let _lastNotif = { key: "", timestamp: 0 };
  window.showNotification = function (message, type = "success", duration) {
    const ms =
      typeof duration === "number" ? duration : type === "error" ? 5e3 : 2500;
    const dedupKey = `${type}::${message}`;
    const now = Date.now();
    if (_lastNotif.key === dedupKey && now - _lastNotif.timestamp < 3e3) {
      return;
    }
    _lastNotif = { key: dedupKey, timestamp: now };
    const existing = document.querySelector(".tobyflow-notification");
    if (existing) {
      clearTimeout(_timer);
      existing.remove();
    }
    const el = document.createElement("div");
    el.className = `tobyflow-notification ${type}`;
    el.innerHTML = `${_icons[type] || _icons.info}<span>${message}</span>`;
    el.style.pointerEvents = "auto";
    document.body.appendChild(el);
    const RESUME_DURATION = 1500;
    const startDismiss = (delay) => {
      _timer = setTimeout(() => {
        el.classList.add("tobyflow-notif-out");
        setTimeout(() => el.remove(), 300);
      }, delay);
    };
    startDismiss(ms);
    el.addEventListener("mouseenter", () => {
      if (_timer) {
        clearTimeout(_timer);
        _timer = null;
      }
    });
    el.addEventListener("mouseleave", () => {
      if (!el.classList.contains("tobyflow-notif-out"))
        startDismiss(RESUME_DURATION);
    });
  };
})();
document.addEventListener("DOMContentLoaded", async () => {
  document.body.classList.add("wf-popup");
  const hideWfLoading = () => {
    clearTimeout(_wfLoadingSafety);
    const el = document.getElementById("wfEditorLoading");
    if (!el || el.classList.contains("wf-editor-loading-out")) return;
    el.classList.add("wf-editor-loading-out");
    setTimeout(() => el.remove(), 320);
  };
  const _wfLoadingSafety = setTimeout(hideWfLoading, 2e4);
  if (window.EventBus) {
    window.eventBus = new EventBus();
  }
  if (window.I18n) {
    await window.I18n.init();
    window.I18n.applyTranslations(document.body);
    const _lt = document.getElementById("wfEditorLoadingText");
    if (_lt)
      _lt.textContent =
        window.I18n.t("workflow.loadingEditor") || _lt.textContent;
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.af_locale && window.I18n) {
      window.I18n.setLocale(changes.af_locale.newValue, false);
      window.I18n.applyTranslations(document.body);
    }
  });
  if (window.storageSettings) {
    await window.authManager?.init?.();
    await window.storageSettings.ready;
    await window.storageSettings.ensureAuthSettingsReady?.();
    console.log(
      "[WorkflowEditorInit] StorageSettings ready, queueEnabled:",
      window.storageSettings.getSettings()?.queueEnabled,
    );
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
      "[WorkflowEditorInit] AuthManager ready, logged in:",
      window.authManager.isLoggedIn(),
    );
    window.ExtensionDeviceManager?.init?.();
  }
  if (window.SseClient && window.authManager?.isLoggedIn()) {
    try {
      await window.SseClient.connect();
      console.log(
        "[WorkflowEditorInit] SseClient connected (follower mode expected)",
      );
    } catch (e) {
      console.warn(
        "[WorkflowEditorInit] SseClient connect failed:",
        e?.message,
      );
    }
  }
  if (window.RequestCoalescer) {
    window.RequestCoalescer.init();
    console.log(
      "[WorkflowEditorInit] RequestCoalescer ready, isLeader:",
      window.RequestCoalescer.isLeader(),
    );
  }
  if (window.storageManager) {
    await window.storageManager.init();
    console.log(
      "[WorkflowEditorInit] StorageManager mode:",
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
        "[WorkflowEditorInit] FeatureGate refresh failed, d\xF9ng cache:",
        err.message,
      );
    }
    console.log(
      "[WorkflowEditorInit] FeatureGate ready, plan:",
      window.featureGate.plan?.slug || "unknown",
      ", auto_download:",
      window.featureGate.canUse("auto_download"),
      ", workflows_nodes_max:",
      window.featureGate.checkQuota("workflows_nodes_max")?.limit,
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
      console.warn("[WorkflowEditorInit] Fetch plans failed:", err.message);
    }
  }
  if (window.SystemConfig) {
    await SystemConfig.restoreFromStorage();
    SystemConfig.applyToUI();
    console.log(
      "[WorkflowEditorInit] SystemConfig restored, show_upgrade_ui:",
      SystemConfig.getBool("show_upgrade_ui"),
    );
  }
  if (window.ExecutionConfig) {
    try {
      await window.ExecutionConfig.getConfig();
    } catch (e) {
      console.warn(
        "[WorkflowEditorInit] ExecutionConfig.getConfig failed:",
        e?.message,
      );
    }
  }
  try {
    if (window.PendingUploadStore) {
      await PendingUploadStore.restore();
      await PendingUploadStore.restoreCache();
      await PendingUploadStore.restoreLightweight();
      console.log("[WorkflowEditorInit] PendingUploadStore restored");
    }
  } catch (e) {
    console.error("[WorkflowEditorInit] PendingUploadStore error:", e);
  }
  try {
    if (window.authManager?.isLoggedIn?.())
      await window.ExtensionDeviceManager?.claim?.();
    if (window.ProviderConfigManager?._fetchApiConfigs) {
      await window.ProviderConfigManager._fetchApiConfigs();
      console.log("[WorkflowEditorInit] PCM api_configs fetched");
    }
  } catch (e) {
    console.warn(
      "[WorkflowEditorInit] PCM api_configs fetch failed (using inline fallback):",
      e?.message,
    );
  }
  try {
    await window.ProviderConfigManager?.fetchPrivateConfigs?.();
  } catch (e) {
    console.warn(
      "[WorkflowEditorInit] private-configs fetch failed:",
      e?.message,
    );
  }
  try {
    window.CharacterRegistry?.initCrossContextSync?.();
    window.CharacterRegistry?.getScrapedList?.().catch(() => {});
    if (window.VoiceRegistry) {
      window.VoiceRegistry.initCrossContextSync?.();
      await Promise.all([
        window.VoiceRegistry.getBaseCatalog?.("flow").catch(() => null),
        window.VoiceRegistry.getScrapedList?.().catch(() => null),
      ]);
      console.log(
        "[WorkflowEditorInit] VoiceRegistry hydrated (scraped + base)",
      );
    }
  } catch (e) {
    console.warn("[WorkflowEditorInit] VoiceRegistry init failed:", e?.message);
  }
  try {
    if (window.ProviderMeta?.fetch) {
      await window.ProviderMeta.fetch();
      console.log("[WorkflowEditorInit] ProviderMeta fetched");
    }
    if (window.ProviderMeta?.init) {
      window.ProviderMeta.init();
      console.log("[WorkflowEditorInit] ProviderMeta initialized");
    }
  } catch (e) {
    console.warn("[WorkflowEditorInit] ProviderMeta fetch failed:", e?.message);
  }
  try {
    if (window.WorkflowExecutor && !window.workflowExecutor) {
      window.workflowExecutor = new WorkflowExecutor();
      console.log("[WorkflowEditorInit] WorkflowExecutor created");
    }
  } catch (e) {
    console.error("[WorkflowEditorInit] WorkflowExecutor error:", e);
  }
  try {
    window.generationHistory?.init();
  } catch (e) {
    console.warn(
      "[WorkflowEditorInit] GenerationHistory init failed:",
      e?.message,
    );
  }
  try {
    if (window.NodeTemplates?.fetchFromServer) {
      window.NodeTemplates.clearServerCache?.();
      await window.NodeTemplates.fetchFromServer().catch((err) => {
        console.warn(
          "[WorkflowEditorInit] NodeTemplates.fetchFromServer failed, d\xF9ng local fallback:",
          err?.message,
        );
      });
      console.log(
        "[WorkflowEditorInit] NodeTemplates server types loaded:",
        Object.keys(window.NodeTemplates._serverTypes || {}).length,
      );
    }
  } catch (e) {
    console.warn("[WorkflowEditorInit] NodeTemplates fetch error:", e);
  }
  console.log("[WorkflowEditorInit] Creating WorkflowEditor...");
  let editor;
  try {
    editor = new WorkflowEditor();
    window.workflowEditor = editor;
    console.log("[WorkflowEditorInit] WorkflowEditor created");
  } catch (e) {
    console.error("[WorkflowEditorInit] WorkflowEditor constructor error:", e);
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
  console.log("[WorkflowEditorInit] Checking pending workflow data...");
  let stored;
  try {
    stored = await new Promise((resolve) => {
      chrome.storage.local.get(["_pendingWorkflow"], (result) =>
        resolve(result),
      );
    });
    console.log(
      "[WorkflowEditorInit] Pending data:",
      stored._pendingWorkflow ? "workflow" : "",
    );
  } catch (e) {
    console.error("[WorkflowEditorInit] Storage get error:", e);
    stored = {};
  }
  if (stored._pendingTemplatePreview?.template) {
    chrome.storage.local.remove("_pendingTemplatePreview");
    const tpl = stored._pendingTemplatePreview.template;
    try {
      const ts = Date.now();
      const nodes = (Array.isArray(tpl.nodes) ? tpl.nodes : []).map(
        (node, idx) => {
          const data = node.data || {};
          const refImgUrls =
            Array.isArray(node.ref_img_urls) && node.ref_img_urls.length
              ? node.ref_img_urls
              : Array.isArray(data.ref_img_urls)
                ? data.ref_img_urls
                : [];
          const refThumbnails = {};
          refImgUrls.forEach((url, i) => {
            refThumbnails[`template_ref_${ts}_${idx}_${i}`] = url;
          });
          const existingResultThumbs =
            node.result_thumbnails || data.result_thumbnails || {};
          const resultImgUrl = node.result_img_url || data.result_img_url || "";
          const resultThumbnails =
            Object.keys(existingResultThumbs).length || resultImgUrl
              ? {
                  ...existingResultThumbs,
                  ...(resultImgUrl
                    ? { [`result_${ts}_${idx}`]: resultImgUrl }
                    : {}),
                }
              : null;
          return {
            ...data,
            node_id: node.node_id || node.id || `node_${ts}_${idx}`,
            node_type: node.node_type || node.type,
            node_name:
              node.node_name || data.node_name || node.name || node.type,
            pos_x: node.pos_x ?? node.position?.x ?? 100,
            pos_y: node.pos_y ?? node.position?.y ?? 100,
            prompt: node.prompt || data.prompt || "",
            model: node.model || data.model || "",
            ratio: node.ratio || data.ratio || "1:1",
            quantity: node.quantity || data.quantity || 1,
            ref_img_urls: refImgUrls,
            ref_thumbnails: {
              ...(node.ref_thumbnails || data.ref_thumbnails || {}),
              ...refThumbnails,
            },
            result_thumbnails: resultThumbnails,
            enabled: node.enabled !== false,
          };
        },
      );
      const edges = (Array.isArray(tpl.edges) ? tpl.edges : []).map(
        (edge, idx) => ({
          edge_id: edge.edge_id || edge.id || `edge_${ts}_${idx}`,
          source_node_id: edge.source_node_id || edge.source,
          target_node_id: edge.target_node_id || edge.target,
          source_handle:
            edge.source_handle ||
            edge.output_class ||
            edge.sourceHandle ||
            "output_1",
          target_handle:
            edge.target_handle ||
            edge.input_class ||
            edge.targetHandle ||
            "input_1",
          source_port: edge.source_port || edge.sourcePort || "default",
          target_port: edge.target_port || edge.targetPort || "default",
        }),
      );
      const adapted = {
        wf_id: `preview_${tpl.id || "tpl"}`,
        wf_name: tpl.name || "Template",
        nodes,
        edges,
        enabled: false,
        status: "pending",
        _is_template_preview: true,
        _template_id: tpl.id,
        _original_template: tpl,
        _is_community_template: true,
      };
      editor.open("view", adapted);
      hideWfLoading();
      setTimeout(() => {
        try {
          const overlay = editor.overlay;
          if (overlay)
            overlay.classList.add("wf-preview-mode", "wf-community-preview");
          console.log(
            "[WorkflowEditorInit] Template preview (view mode) activated",
          );
        } catch (err) {
          console.warn("[WorkflowEditorInit] preview lock fail:", err);
        }
      }, 200);
    } catch (e) {
      console.error("[WorkflowEditorInit] Template preview error:", e);
      editor.open("create");
    }
    hideWfLoading();
    return;
  }
  try {
    if (stored._pendingWorkflow) {
      const data = stored._pendingWorkflow;
      chrome.storage.local.remove("_pendingWorkflow");
      if (data.projectId) {
        window._currentProjectId = data.projectId;
        window._currentProjectName = data.projectName || null;
      }
      if (
        (data.mode === "edit" ||
          data.mode === "view" ||
          data.mode === "admin_preview") &&
        data.workflow
      ) {
        let workflowToOpen = data.workflow;
        if (data.mode === "edit") {
          const smMode = window.storageManager?.getMode();
          const isLoggedIn = window.authManager?.isLoggedIn();
          console.log(
            "[WorkflowEditorInit] Refresh check - storageManager mode:",
            smMode,
            ", authManager logged in:",
            isLoggedIn,
            ", wf_id:",
            data.workflow.wf_id,
          );
          if (
            data.workflow.wf_id &&
            window.WorkflowExecutor?.recoverBufferCheckpoint
          ) {
            try {
              const recovered =
                await window.WorkflowExecutor.recoverBufferCheckpoint(
                  data.workflow.wf_id,
                );
              if (recovered) {
                console.log(
                  "[WorkflowEditorInit] Buffer checkpoint recovered for:",
                  data.workflow.wf_id,
                );
              }
            } catch (recoverErr) {
              console.warn(
                "[WorkflowEditorInit] Buffer recovery failed:",
                recoverErr.message,
              );
            }
          }
          if (smMode === "api" && data.workflow.wf_id) {
            try {
              console.log(
                "[WorkflowEditorInit] Fetching latest workflow data from server...",
              );
              const freshWorkflow = await window.storageManager.getWorkflow(
                data.workflow.wf_id,
              );
              if (freshWorkflow && freshWorkflow.nodes) {
                console.log(
                  "[WorkflowEditorInit] Using fresh data from server, nodes:",
                  freshWorkflow.nodes?.length,
                );
                window.workflowEditor?._logNodeMediaSnapshot?.(
                  "open-backend-response",
                  freshWorkflow.nodes,
                  freshWorkflow.wf_id,
                );
                workflowToOpen = freshWorkflow;
              } else {
                console.warn(
                  "[WorkflowEditorInit] Server returned no data, using passed workflow",
                );
              }
            } catch (fetchErr) {
              console.warn(
                "[WorkflowEditorInit] Failed to fetch fresh data, using passed workflow:",
                fetchErr.message,
              );
            }
          } else if (isLoggedIn && smMode !== "api") {
            console.log(
              "[WorkflowEditorInit] Attempting to switch storageManager to API mode...",
            );
            try {
              await window.storageManager.switchToApi();
              const freshWorkflow = await window.storageManager.getWorkflow(
                data.workflow.wf_id,
              );
              if (freshWorkflow && freshWorkflow.nodes) {
                console.log(
                  "[WorkflowEditorInit] Using fresh data after mode switch, nodes:",
                  freshWorkflow.nodes?.length,
                );
                window.workflowEditor?._logNodeMediaSnapshot?.(
                  "open-backend-response",
                  freshWorkflow.nodes,
                  freshWorkflow.wf_id,
                );
                workflowToOpen = freshWorkflow;
              }
            } catch (switchErr) {
              console.warn(
                "[WorkflowEditorInit] Mode switch failed:",
                switchErr.message,
              );
            }
          }
          delete workflowToOpen._is_shared_view;
          delete workflowToOpen._is_template_preview;
        } else {
          if (data.mode === "admin_preview") {
            workflowToOpen = { ...workflowToOpen, _is_admin_view: true };
            console.log(
              "[WorkflowEditorInit] Opening in ADMIN_PREVIEW (read-only) mode, nodes:",
              workflowToOpen.nodes?.length,
            );
          } else {
            const hasReadOnlyFlag =
              workflowToOpen._is_shared_view === true ||
              workflowToOpen._is_template_preview === true;
            if (!hasReadOnlyFlag) {
              workflowToOpen = { ...workflowToOpen, _is_shared_view: true };
            }
            const previewType = workflowToOpen._is_template_preview
              ? "template preview"
              : "shared workflow";
            console.log(
              `[WorkflowEditorInit] Opening ${previewType} in VIEW (read-only) mode, nodes:`,
              workflowToOpen.nodes?.length,
            );
          }
        }
        console.log(
          "[WorkflowEditorInit] Loading workflow nodes:",
          workflowToOpen.nodes?.map((n) => ({
            id: n.node_id,
            name: n.node_name,
            status: n.status,
          })),
        );
        editor.open(data.mode, workflowToOpen);
      } else {
        console.log(
          "[WorkflowEditorInit] Opening in create mode (no workflow data)",
        );
        editor.open("create");
      }
    } else {
      console.log("[WorkflowEditorInit] Opening in create mode (no pending)");
      editor.open("create");
    }
    console.log("[WorkflowEditorInit] Editor opened successfully");
    hideWfLoading();
    setTimeout(() => {
      if (window._updateCanvasPlanBadge) window._updateCanvasPlanBadge();
      if (window.SystemConfig) SystemConfig.applyToUI();
    }, 100);
    try {
      const running = await window.WorkflowExecutor?.getCrossContextRunning?.();
      if (running) {
        if (running.wf_id === editor.workflow?.wf_id) {
          let freshRunningNodeStatus = null;
          try {
            const freshWorkflow = await window.storageManager?.getWorkflow(
              running.wf_id,
            );
            if (freshWorkflow?.nodes) {
              for (const node of freshWorkflow.nodes) {
                if (node.node_id === running.current_node_id) {
                  freshRunningNodeStatus = String(
                    node.status || "",
                  ).toLowerCase();
                }
                if (node.status && node.status !== "pending") {
                  editor._syncDrawflowNodeData?.(node.node_id, {
                    status: node.status,
                  });
                  editor._updateNodeStatusUI?.(node.node_id, node.status);
                  if (node.status === "completed" && node.result_file_ids) {
                    const fileIds = node.result_file_ids
                      .split(",")
                      .filter(Boolean);
                    if (fileIds.length > 0) {
                      editor._showNodePreview?.(node.node_id, fileIds);
                    }
                  }
                }
              }
            }
          } catch (e) {
            console.warn(
              "[WorkflowEditorInit] Failed to sync node statuses:",
              e.message,
            );
          }
          if (
            running.executor_context === "single_nodes" &&
            window.workflowExecutor &&
            !window.workflowExecutor._executionTask
          ) {
            window.workflowExecutor._singleNodeRemoteState = {
              workflowId: running.wf_id,
              runId: running.run_id,
              nodes: running.single_node_states || [],
            };
            window.workflowExecutor._runningOtherWfId = running.wf_id;
          }
          const hasActiveSingleNodes =
            running.executor_context === "single_nodes" &&
            running.single_node_states?.length > 0;
          const nodeAlreadyTerminal =
            !hasActiveSingleNodes &&
            Boolean(running.current_node_id) &&
            ["completed", "failed", "skipped"].includes(freshRunningNodeStatus);
          if (nodeAlreadyTerminal) {
            console.log(
              "[WorkflowEditorInit] Running flag belongs to terminal/post-processing node; keep editor controls idle:",
              {
                nodeId: running.current_node_id,
                status: freshRunningNodeStatus,
              },
            );
            editor._openedToViewRunning = false;
            editor._crossContextRunIsTerminal = true;
          } else {
            editor._crossContextRunIsTerminal = false;
            console.log(
              "[WorkflowEditorInit] This workflow is actively running, syncing UI...",
              {
                nodeId: running.current_node_id || null,
                persistedStatus: freshRunningNodeStatus,
              },
            );
            editor._openedToViewRunning = true;
            if (typeof editor._onExecutionStarted === "function") {
              editor._onExecutionStarted();
            }
            if (window.workflowExecutor) {
              window.workflowExecutor.isRunning = true;
              window.workflowExecutor.currentWorkflow = editor.workflow;
            }
            if (editor.workflow) {
              editor.workflow.status = "running";
            }
            if (hasActiveSingleNodes) editor._syncRunningNodeFromExecutor?.();
            if (!hasActiveSingleNodes && running.current_node_id) {
              console.log(
                "[WorkflowEditorInit] Syncing running node UI:",
                running.current_node_id,
              );
              editor._updateNodeStatusUI?.(running.current_node_id, "running");
              if (window.workflowExecutor) {
                window.workflowExecutor.currentNode = {
                  node_id: running.current_node_id,
                };
              }
            }
          }
        } else {
          console.log(
            "[WorkflowEditorInit] Another workflow is running:",
            running.wf_name,
          );
          if (window.workflowExecutor) {
            window.workflowExecutor.isRunning = true;
            window.workflowExecutor._runningOtherWfId = running.wf_id;
          }
        }
      }
    } catch (e) {
      console.error("[WorkflowEditorInit] Error checking running state:", e);
    }
  } catch (e) {
    console.error("[WorkflowEditorInit] editor.open() error:", e);
  } finally {
    hideWfLoading();
  }
  const remoteWorkflowLeaseTimer = setInterval(async () => {
    const executor = window.workflowExecutor;
    const remoteId = executor?._runningOtherWfId;
    if (!remoteId || executor._heartbeatTimer) return;
    try {
      const running = await window.WorkflowExecutor?.getCrossContextRunning?.();
      if (
        running ||
        executor._heartbeatTimer ||
        executor._runningOtherWfId !== remoteId
      )
        return;
      executor.isRunning = false;
      executor._runningOtherWfId = null;
      executor.currentWorkflow = null;
      editor._updatePlayButtonState?.();
      console.log(
        "[WorkflowEditorInit] Released expired remote workflow state:",
        remoteId,
      );
    } catch (error) {
      console.warn(
        "[WorkflowEditorInit] Remote lease check failed:",
        error.message,
      );
    }
  }, 5e3);
  window.addEventListener(
    "unload",
    () => clearInterval(remoteWorkflowLeaseTimer),
    { once: true },
  );
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "queue:stop_job" && message.jobId) {
      const queue = window.PromptQueue?.getInstance?.();
      if (!queue?._jobs?.has(message.jobId)) return false;
      Promise.resolve(
        queue.stopJobAndPersist(message.jobId, {
          stopOrigin: "user",
          stopReason: "USER_CANCELLED",
          stopSource: message.stopSource || "QUEUE_STOP_SOURCE_UNKNOWN",
        }),
      )
        .then((stopped) => sendResponse({ ok: stopped === true }))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error?.message || "STOP_JOB_FAILED",
          }),
        );
      return true;
    }
    if (message.action === "queue:stop_all") {
      const queue = window.PromptQueue?.getInstance?.();
      if (!queue?._jobs?.size) return false;
      try {
        queue.stopAll({
          stopOrigin: "user",
          stopReason: "USER_CANCELLED",
          stopSource: message.stopSource || "QUEUE_STOP_SOURCE_UNKNOWN",
        });
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || "STOP_ALL_FAILED" });
      }
      return true;
    }
    if (message.action === "captcha:userAction") {
      window.eventBus?.emit("captcha:userAction", {
        decision: message.decision,
      });
    }
    if (message.action === "loadWorkflowInEditor" && message.data) {
      const d = message.data;
      if (d.projectId) {
        window._currentProjectId = d.projectId;
        window._currentProjectName = d.projectName || null;
      }
      const currentWfId = editor?.workflow?.wf_id || null;
      const targetWfId = d.workflow?.wf_id || null;
      const hasUnsaved = !!editor?._hasUnsavedChanges;
      const targetIsCreate = d.mode !== "edit";
      const isSameWorkflowReload =
        currentWfId && targetWfId && targetWfId === currentWfId;
      const isDifferentWorkflow =
        (targetWfId && currentWfId && targetWfId !== currentWfId) ||
        (targetIsCreate && currentWfId);
      if (hasUnsaved && isSameWorkflowReload) {
        console.log(
          "[WorkflowEditorInit] Same wf_id + unsaved \u2192 skip reload to preserve edits",
        );
        return;
      }
      const proceed = async () => {
        if (d.mode === "edit" && d.workflow) {
          let workflowToOpen = d.workflow;
          const smMode = window.storageManager?.getMode();
          const isLoggedIn = window.authManager?.isLoggedIn();
          if (smMode === "api" && d.workflow.wf_id) {
            try {
              console.log(
                "[WorkflowEditorInit] Message: Fetching latest workflow data...",
              );
              const freshWorkflow = await window.storageManager.getWorkflow(
                d.workflow.wf_id,
              );
              if (freshWorkflow && freshWorkflow.nodes) {
                window.workflowEditor?._logNodeMediaSnapshot?.(
                  "open-backend-response",
                  freshWorkflow.nodes,
                  freshWorkflow.wf_id,
                );
                workflowToOpen = freshWorkflow;
              }
            } catch (e) {
              console.warn(
                "[WorkflowEditorInit] Message: Failed to fetch fresh data:",
                e.message,
              );
            }
          } else if (isLoggedIn && smMode !== "api" && d.workflow.wf_id) {
            try {
              await window.storageManager.switchToApi();
              const freshWorkflow = await window.storageManager.getWorkflow(
                d.workflow.wf_id,
              );
              if (freshWorkflow && freshWorkflow.nodes) {
                window.workflowEditor?._logNodeMediaSnapshot?.(
                  "open-backend-response",
                  freshWorkflow.nodes,
                  freshWorkflow.wf_id,
                );
                workflowToOpen = freshWorkflow;
              }
            } catch (e) {
              console.warn(
                "[WorkflowEditorInit] Message: Mode switch/fetch failed:",
                e.message,
              );
            }
          }
          editor.open("edit", workflowToOpen);
        } else {
          editor.open("create");
        }
      };
      if (hasUnsaved && isDifferentWorkflow) {
        const I = window.I18n;
        (async () => {
          const confirmed = await window.customDialog?.confirm(
            I?.t("workflow.unsavedSwitchMsg") ||
              "Current workflow has unsaved changes. Switch to another workflow without saving?",
            {
              title: I?.t("workflow.unsavedTitle") || "Unsaved changes",
              type: "warning",
              confirmText:
                I?.t("workflow.switchWithoutSave") || "Switch without saving",
              cancelText: I?.t("workflow.goBack") || "Go back",
            },
          );
          if (confirmed) {
            await proceed();
          }
        })();
      } else {
        proceed();
      }
    }
    if (message.action === "sseRelay:entitlements_changed") {
      console.log(
        "[WorkflowEditorInit] SSE entitlements changed, refreshing featureGate",
      );
      try {
        if (
          message.data?.features &&
          message.data?.plan &&
          window.featureGate?.handleSseEntitlementsChanged
        ) {
          window.featureGate.handleSseEntitlementsChanged(message.data);
        } else {
          window.featureGate?.refresh?.();
        }
        if (message.data?.plan?.slug && window.authManager?.user) {
          window.authManager.user.plan_slug = message.data.plan.slug;
          if (message.data.plan.name)
            window.authManager.user.plan_name = message.data.plan.name;
        }
        window.ProviderConfigManager?.fetchPrivateConfigs?.(true).catch(
          () => {},
        );
      } catch (e) {
        console.warn(
          "[WorkflowEditorInit] sseRelay:entitlements_changed handler error:",
          e,
        );
      }
    }
    if (message.action === "sseRelay:system_settings_changed") {
      try {
        if (message.data && typeof message.data === "object")
          window.SystemConfig?.handleSseUpdate?.(message.data);
      } catch (e) {
        console.warn(
          "[WorkflowEditorInit] sseRelay:system_settings_changed handler error:",
          e,
        );
      }
    }
    if (message.action === "sseRelay:force_logout") {
      console.log("[WorkflowEditorInit] SSE force_logout, closing window");
      try {
        window.close();
      } catch (e) {}
    }
    if (message.action === "workflowDeleted" && message.wfId) {
      window.RequestCoalescer?.invalidate?.("workflows");
      const currentWfId = editor?.workflow?.wf_id || null;
      if (currentWfId && currentWfId === message.wfId) {
        console.log(
          "[WorkflowEditorInit] Current workflow deleted from another context, closing editor",
        );
        if (editor) {
          editor._hasUnsavedChanges = false;
          editor._skipDeferredSave = true;
          if (editor._deferredSaveTimer != null)
            clearTimeout(editor._deferredSaveTimer);
          editor._deferredSaveTimer = null;
        }
        try {
          window.customDialog?.alert(
            window.I18n?.t("workflow.deletedFromOtherContext") ||
              "This workflow was deleted from another window. The editor will close.",
            { type: "warning" },
          );
        } catch (e) {}
        setTimeout(() => {
          try {
            window.close();
          } catch (e) {}
        }, 1500);
      }
    }
    if (message.action === "workflowExecutionEvent" && window.eventBus) {
      const { event, data } = message;
      if (message._bg_relayed) {
        return;
      }
      const executor = window.workflowExecutor;
      const isLocallyRunning =
        (executor?.isRunning || !!executor?._executionTask) &&
        !executor?._runningOtherWfId;
      const isNodeEvent = [
        "node:queued",
        "node:started",
        "node:completed",
        "node:failed",
        "node:warning",
        "node:phase",
        "node:cancelled",
        "node:queue_cancelled",
        "execution:single_node_state",
      ].includes(event);
      if (isLocallyRunning && isNodeEvent) {
        return;
      }
      if (
        event === "execution:stop" &&
        executor?.handleRemoteStop?.(
          data?.wf_id || data?.workflow?.wf_id,
          data?.run_id,
        ) === false
      )
        return;
      if (
        event === "execution:single_node_state" &&
        executor &&
        !isLocallyRunning
      ) {
        executor._singleNodeRemoteState = data;
      }
      if (event === "execution:completed" && executor && !isLocallyRunning) {
        const completedId =
          data?.workflowId ||
          data?.workflow?.wf_id ||
          data?.wfId ||
          data?.wf_id;
        if (
          !completedId ||
          String(completedId) ===
            String(executor._singleNodeRemoteState?.workflowId)
        ) {
          executor._singleNodeRemoteState = null;
        }
      }
      window.eventBus.emit(event, data);
      if (event === "execution:started" && executor && data?.workflow) {
        if (!isLocallyRunning) {
          console.log(
            "[WorkflowEditorInit] Tracking remote workflow:",
            data.workflow.wf_id,
          );
          executor.isRunning = true;
          executor._runningOtherWfId = data.workflow.wf_id;
          executor.currentWorkflow = data.workflow;
        }
      } else if (event === "execution:completed" && executor) {
        const completedWfId =
          data?.workflowId ||
          data?.workflow?.wf_id ||
          data?.wfId ||
          data?.wf_id;
        if (!isLocallyRunning) {
          if (
            !completedWfId ||
            !executor._runningOtherWfId ||
            String(completedWfId) === String(executor._runningOtherWfId)
          ) {
            console.log(
              "[WorkflowEditorInit] Remote workflow completed, clearing state",
            );
            executor.isRunning = false;
            executor._runningOtherWfId = null;
            executor.currentWorkflow = null;
          }
        } else if (
          completedWfId &&
          executor._runningOtherWfId === completedWfId
        ) {
          console.log("[WorkflowEditorInit] Tracked other workflow completed");
          executor._runningOtherWfId = null;
        }
      } else if (event === "workflow:reset" && executor) {
        if (executor._executionTask) return;
        const resetId = data?.workflowId;
        const activeId =
          executor.currentWorkflow?.wf_id || executor._runningOtherWfId;
        if (resetId && activeId && resetId !== activeId) return;
        executor.isRunning = false;
        executor.shouldStop = true;
        executor._runningOtherWfId = null;
        executor.currentWorkflow = null;
        if (window.workflowEditor) {
          window.workflowEditor._syncExecutionUI?.();
        }
      } else if (event === "execution:stop" && executor) {
        const stopWfId = data?.wf_id || data?.workflow?.wf_id;
        console.log(
          "[WorkflowEditorInit] Remote stop received, wfId:",
          stopWfId,
        );
        if (window.workflowEditor) {
          window.workflowEditor._syncExecutionUI?.();
        }
      }
    }
  });
  function updateCanvasPlanBadge() {
    const planBadge = document.getElementById("canvasPlanBadge");
    if (!planBadge) return;
    const isLoggedIn = window.authManager?.isLoggedIn();
    const user = window.authManager?.getUser();
    const planSlug = user?.plan_slug || window.featureGate?.plan?.slug;
    const isPremium =
      planSlug === "unlimited" ||
      planSlug === "premium" ||
      planSlug === "autoflow-pro" ||
      planSlug === "autogrok-pro" ||
      planSlug === "autoflow-ultra";
    if (!isLoggedIn) {
      planBadge.classList.add("hidden");
    } else {
      planBadge.classList.remove("hidden");
      if (planSlug === "autoflow-ultra") {
        planBadge.textContent = "Ultra";
        planBadge.setAttribute("data-plan", "autoflow-ultra");
      } else if (isPremium) {
        const planName =
          planSlug === "autoflow-pro" || planSlug === "autogrok-pro"
            ? "Pro"
            : "Premium";
        planBadge.textContent = planName;
        planBadge.setAttribute("data-plan", "autoflow-pro");
      } else {
        planBadge.textContent = "Free";
        planBadge.setAttribute("data-plan", "free");
      }
    }
  }
  window._updateCanvasPlanBadge = updateCanvasPlanBadge;
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
      updateCanvasPlanBadge();
      console.log(
        "[WorkflowEditorInit] Entitlements updated from storage, plan:",
        newData?.plan?.slug,
      );
    }
  });
  if (window.eventBus) {
    window.eventBus.on("quota:warning", (data) => {
      const remaining = data?.remaining ?? 0;
      const limit = data?.limit ?? 0;
      console.log(
        "[WorkflowEditorInit] Quota warning:",
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
      const module = data?.module || "Workflow";
      console.log(
        "[WorkflowEditorInit] Quota exhausted:",
        limit,
        "limit for",
        module,
      );
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
  if (window.eventBus) {
    window.eventBus.on("node:completed", async (data) => {
      if (editor._ebHandlers?.["node:completed"]) return;
      if (!data?.node?.node_id) return;
      const nodeId = data.node.node_id;
      const currentNode = editor.workflow?.nodes?.find(
        (n) => n.node_id === nodeId,
      );
      if (currentNode) {
        currentNode.status = "completed";
        currentNode.result_file_ids = data.result?.fileIds?.join(",") || "";
        editor._updateNodeStatusUI(nodeId, "completed");
        editor._syncDrawflowNodeData(nodeId, {
          status: "completed",
          result_file_ids: currentNode.result_file_ids,
        });
        if (
          data.deferApiPreviewRefresh !== true &&
          data.result?.fileIds?.length > 0
        ) {
          editor._showNodePreview(nodeId, data.result.fileIds);
        }
      }
    });
    window.eventBus.on("node:started", (data) => {
      if (editor._ebHandlers?.["node:started"]) return;
      if (!data?.node?.node_id) return;
      const nodeId = data.node.node_id;
      const currentNode = editor.workflow?.nodes?.find(
        (n) => n.node_id === nodeId,
      );
      if (currentNode) {
        currentNode.status = "running";
        editor._updateNodeStatusUI(nodeId, "running");
        editor._syncDrawflowNodeData(nodeId, { status: "running" });
      }
    });
    window.eventBus.on("node:failed", (data) => {
      if (editor._ebHandlers?.["node:failed"]) return;
      if (!data?.node?.node_id) return;
      const nodeId = data.node.node_id;
      const currentNode = editor.workflow?.nodes?.find(
        (n) => n.node_id === nodeId,
      );
      if (currentNode) {
        currentNode.status = "failed";
        editor._updateNodeStatusUI(nodeId, "failed");
        editor._syncDrawflowNodeData(nodeId, { status: "failed" });
      }
    });
    window.eventBus.on("execution:completed", async (data) => {
      if (editor.workflow?.wf_id && window.storageManager) {
        try {
          const fresh = await window.storageManager.getWorkflow(
            editor.workflow.wf_id,
          );
          if (fresh?.nodes) {
            editor.workflow.nodes = fresh.nodes;
            editor.workflow.edges = fresh.edges || editor.workflow.edges;
          }
          const allCompleted =
            editor.workflow.nodes?.length > 0 &&
            editor.workflow.nodes.every((n) => n.status === "completed");
          if (allCompleted) {
            editor._showResetButton();
          }
        } catch (e) {
          console.error(
            "[WorkflowEditorInit] Failed to refresh on completion:",
            e,
          );
        }
      }
    });
    window.eventBus.on("workflow:reset", async (data) => {
      if (data?.workflowId !== editor.workflow?.wf_id) return;
      if (window.storageManager) {
        try {
          const fresh = await window.storageManager.getWorkflow(
            data.workflowId,
          );
          if (fresh?.nodes) {
            editor.workflow.nodes = fresh.nodes;
            for (const node of fresh.nodes) {
              editor._updateNodeStatusUI(
                node.node_id,
                node.status || "pending",
              );
              editor._syncDrawflowNodeData(node.node_id, {
                status: node.status || "pending",
                result_file_ids: "",
              });
              editor._clearNodePreview?.(node.node_id);
            }
            editor._showRunButton?.();
          }
        } catch (e) {
          console.error("[WorkflowEditorInit] Failed to sync reset:", e);
        }
      }
    });
  }
  let _syncTimer = null;
  let _syncActive = false;
  let _syncEpoch = 0;
  let _lastEventTime = 0;
  const EVENT_GRACE_PERIOD = 5e3;
  const SYNC_MIN_MS = 3e3;
  const SYNC_MAX_MS = 15e3;
  let _syncDelay = SYNC_MIN_MS;
  if (window.eventBus) {
    [
      "node:started",
      "node:completed",
      "node:failed",
      "execution:completed",
    ].forEach((evt) => {
      window.eventBus.on(evt, () => {
        _lastEventTime = Date.now();
        _syncDelay = SYNC_MIN_MS;
      });
    });
  }
  let _syncBackoffUntil = 0;
  const _pollOnce = async (epoch) => {
    _syncTimer = null;
    if (!_syncActive || epoch !== _syncEpoch) return;
    let didChange = false;
    const shouldFetch =
      Date.now() - _lastEventTime >= EVENT_GRACE_PERIOD &&
      window.workflowExecutor?.isRunning &&
      editor.workflow?.wf_id &&
      window.storageManager &&
      Date.now() >= _syncBackoffUntil;
    if (shouldFetch) {
      try {
        const fresh = await window.storageManager.getWorkflow(
          editor.workflow.wf_id,
        );
        if (fresh?.nodes) {
          _syncBackoffUntil = 0;
          for (const node of fresh.nodes) {
            const currentNode = editor.workflow.nodes?.find(
              (n) => n.node_id === node.node_id,
            );
            if (!currentNode) continue;
            const SERVER_BEHIND = new Set([
              "idle",
              "pending",
              "",
              null,
              void 0,
            ]);
            const LOCAL_AHEAD = new Set([
              "running",
              "completed",
              "failed",
              "skipped",
            ]);
            let localIsAhead = false;
            if (LOCAL_AHEAD.has(currentNode.status)) {
              if (SERVER_BEHIND.has(node.status)) {
                localIsAhead = true;
              } else if (
                currentNode.status !== "running" &&
                node.status === "running"
              ) {
                localIsAhead = true;
              }
            }
            if (localIsAhead) {
              continue;
            }
            if (currentNode.status !== node.status) {
              didChange = true;
              currentNode.status = node.status;
              currentNode.result_file_ids = node.result_file_ids || "";
              editor._updateNodeStatusUI(node.node_id, node.status);
              editor._syncDrawflowNodeData(node.node_id, {
                status: node.status,
                result_file_ids: node.result_file_ids || "",
              });
              if (node.status === "completed" && node.result_file_ids) {
                const fileIds = node.result_file_ids
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                if (fileIds.length > 0)
                  editor._showNodePreview(node.node_id, fileIds);
              }
            }
          }
          const allCompleted =
            fresh.nodes.length > 0 &&
            fresh.nodes.every((n) => n.status === "completed");
          if (allCompleted) {
            editor._showResetButton();
          }
        }
      } catch (e) {
        if (e?.message?.includes("rate-limit") || e?.code === "RATE_LIMITED") {
          _syncBackoffUntil = Date.now() + 1e4;
        }
      }
    }
    _syncDelay = didChange
      ? SYNC_MIN_MS
      : Math.min(SYNC_MAX_MS, Math.round(_syncDelay * 1.5));
    if (_syncActive && epoch === _syncEpoch)
      _syncTimer = setTimeout(() => _pollOnce(epoch), _syncDelay);
  };
  const startSyncPolling = () => {
    if (_syncActive) return;
    _syncActive = true;
    _syncEpoch++;
    _syncDelay = SYNC_MIN_MS;
    const epoch = _syncEpoch;
    _syncTimer = setTimeout(() => _pollOnce(epoch), _syncDelay);
  };
  const stopSyncPolling = () => {
    _syncActive = false;
    _syncEpoch++;
    if (_syncTimer) {
      clearTimeout(_syncTimer);
      _syncTimer = null;
    }
  };
  if (window.eventBus) {
    window.eventBus.on("execution:started", startSyncPolling);
    window.eventBus.on("execution:completed", stopSyncPolling);
    window.eventBus.on("workflow:reset", stopSyncPolling);
  }
  try {
    const runningCheck =
      await window.WorkflowExecutor?.getCrossContextRunning?.();
    if (
      runningCheck?.wf_id &&
      editor.workflow?.wf_id === runningCheck.wf_id &&
      editor._crossContextRunIsTerminal !== true
    ) {
      startSyncPolling();
    } else if (editor._crossContextRunIsTerminal === true) {
      console.log(
        "[WorkflowEditorInit] Skip execution polling for terminal/post-processing running flag",
      );
    }
  } catch (e) {}
  if (window.eventBus && typeof window.showNotification === "function") {
    window.eventBus.on("upload:failed", (data) => {
      const err = data?.error || "Unknown error";
      const maybeNoProject =
        /no tile id|tile id returned|no project|chưa có project/i.test(err);
      if (maybeNoProject && window.ProjectHelper?.hasActiveProject) {
        window.ProjectHelper.hasActiveProject().then((has) => {
          if (has) {
            window.showNotification(
              window.I18n?.t("msg.uploadFailed", { error: err }) ||
                `Upload failed: ${err}`,
              "error",
            );
          } else {
            window.ProjectHelper.warnNoProjectForUpload(
              window.workflowEditor?.workflow?.project_id || null,
            );
          }
        });
        return;
      }
      const msg =
        window.I18n?.t("msg.uploadFailed", { error: err }) ||
        `Upload failed: ${err}`;
      window.showNotification(msg, "error");
    });
    window.eventBus.on("upload:pending", (data) => {
      if (data?.reason === "NO_FLOW_TAB") {
        const msg =
          window.I18n?.t("msg.uploadPendingNoFlowTab") ||
          "Upload is pending \u2014 please open the Google Flow tab and try again.";
        window.showNotification(msg, "warning");
      }
    });
    let _lastFlowToast = { text: "", at: 0 };
    const _flowToast = (msg, type) => {
      const now = Date.now();
      if (msg === _lastFlowToast.text && now - _lastFlowToast.at < 3e3) return;
      _lastFlowToast = { text: msg, at: now };
      window.showNotification(msg, type, 6e3);
    };
    window.eventBus.on("node:policy_blocked", (data) => {
      _flowToast(
        data?.text ||
          window.I18n?.t("workflow.flowPolicyBlocked") ||
          "The prompt may violate Google Flow policy \u2014 please change it.",
        "error",
      );
    });
    window.eventBus.on("execution:quota_exceeded", (data) => {
      _flowToast(
        data?.text ||
          window.I18n?.t("workflow.flowQuotaExceeded") ||
          "You have reached your Google Flow generation limit. Try again later or upgrade.",
        "error",
      );
    });
    window.eventBus.on("execution:rate_limited", (data) => {
      _flowToast(
        data?.text ||
          window.I18n?.t("workflow.flowRateLimited") ||
          "Google Flow is asking to slow down \u2014 it will wait then continue.",
        "warning",
      );
    });
  }
  window.addEventListener("unload", stopSyncPolling);
  let _flowMultiTabDismissedSignature = "";
  let _flowTabWarningSeq = 0;
  let _flowTabWarningTimer = setTimeout(_warnMultipleFlowTabs, 600);
  const _scheduleFlowTabWarning = () => {
    _flowTabWarningSeq++;
    clearTimeout(_flowTabWarningTimer);
    _flowTabWarningTimer = setTimeout(_warnMultipleFlowTabs, 250);
  };
  chrome.tabs?.onCreated?.addListener(_scheduleFlowTabWarning);
  chrome.tabs?.onUpdated?.addListener(_scheduleFlowTabWarning);
  chrome.tabs?.onRemoved?.addListener(_scheduleFlowTabWarning);
  window.addEventListener("unload", () => {
    clearTimeout(_flowTabWarningTimer);
    chrome.tabs?.onCreated?.removeListener(_scheduleFlowTabWarning);
    chrome.tabs?.onUpdated?.removeListener(_scheduleFlowTabWarning);
    chrome.tabs?.onRemoved?.removeListener(_scheduleFlowTabWarning);
  });
  async function _warnMultipleFlowTabs() {
    const seq = ++_flowTabWarningSeq;
    console.log("[FlowMultiTabWarning] check start");
    try {
      if (!chrome.tabs?.query) {
        console.warn("[FlowMultiTabWarning] chrome.tabs.query unavailable");
        return;
      }
      const queriedTabs = await chrome.tabs.query({
        url: ["https://flow.google.com/*"],
      });
      if (seq !== _flowTabWarningSeq) return;
      const tabs = (queriedTabs || []).filter((tab) => {
        try {
          return !!globalThis.FlowDriverRegistry?.projectIdForUrl(
            tab?.url || tab?.pendingUrl || "",
          );
        } catch (_) {
          return false;
        }
      });
      console.log(
        "[FlowMultiTabWarning] Found Flow tabs:",
        tabs?.map((t) => ({ id: t.id, url: t.url, title: t.title })),
      );
      const existingOverlay = document.getElementById("tbwf-multi-tab-overlay");
      if (!tabs || tabs.length <= 1) {
        existingOverlay?.remove();
        console.log("[FlowMultiTabWarning] Skip \u2014 \u22641 project tab");
        return;
      }
      if (existingOverlay) return;
      const tabSignature = tabs
        .map((t) => t.id)
        .sort((a, b) => a - b)
        .join(",");
      if (_flowMultiTabDismissedSignature === tabSignature) return;
      let currentId = null;
      try {
        const stored2 = await chrome.storage?.session?.get("targetFlowTabId");
        currentId = stored2?.targetFlowTabId || null;
      } catch (_) {}
      if (seq !== _flowTabWarningSeq) return;
      const I = window.I18n;
      const title =
        I?.t("flowMultiTab.title") || "Multiple Google Flow tabs detected";
      const desc =
        I?.t("flowMultiTab.desc", { count: tabs.length }) ||
        `B\u1EA1n \u0111ang m\u1EDF <strong>${tabs.length}</strong> tab Google Flow. \u0110\u1EC3 tr\xE1nh upload/gen v\xE0o sai project, vui l\xF2ng \u0111\xF3ng c\xE1c tab kh\xF4ng c\u1EA7n thi\u1EBFt.`;
      const currentLabel = I?.t("flowMultiTab.current") || "In use";
      const closeLabel = I?.t("flowMultiTab.close") || "Close";
      const dismissLabel = I?.t("flowMultiTab.dismiss") || "Got it";
      const escHtml = (s) =>
        String(s || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      const buildRows = (tabList) =>
        tabList
          .map((t) => {
            const isCurrent = t.id === currentId;
            const fullTitle = t.title || `Flow Tab #${t.id}`;
            const shortTitle =
              fullTitle.length > 60
                ? fullTitle.substring(0, 60) + "..."
                : fullTitle;
            return `
          <div class="tbwf-row" data-tab-row="${t.id}">
            <span class="tbwf-row-title" title="${escHtml(fullTitle)}">${escHtml(shortTitle)}</span>
            ${
              isCurrent
                ? `<span class="tbwf-current-badge">${escHtml(currentLabel)}</span>`
                : `<button type="button" class="tbwf-close-btn" data-close-tab="${t.id}">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" style="margin-right:4px;vertical-align:-1px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>${escHtml(closeLabel)}
                </button>`
            }
          </div>`;
          })
          .join("");
      if (!document.getElementById("tbwf-multi-tab-styles")) {
        const styleEl = document.createElement("style");
        styleEl.id = "tbwf-multi-tab-styles";
        styleEl.textContent = `
          #tbwf-multi-tab-overlay { position:fixed; inset:0; z-index:2147483647; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.6); }
          .tbwf-row { display:flex; align-items:center; gap:8px; padding:8px 10px; background:rgba(255,255,255,0.04); border-radius:6px; margin-bottom:6px; transition:background 0.15s ease; }
          .tbwf-row:hover { background:rgba(255,255,255,0.07); }
          .tbwf-row-title { flex:1; font-size:13px; color:rgba(255,255,255,0.85); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
          .tbwf-current-badge { font-size:10px; padding:2px 6px; border-radius:3px; background:rgba(34,197,94,0.2); color:#4ade80; font-weight:600; }
          .tbwf-close-btn { display:inline-flex; align-items:center; font-size:11px; padding:5px 12px; border:1px solid transparent; border-radius:4px; background:rgba(239,68,68,0.15); color:#ef4444; cursor:pointer; font-weight:500; transition:background 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.05s ease; font-family:inherit; }
          .tbwf-close-btn:hover { background:rgba(239,68,68,0.32); border-color:rgba(239,68,68,0.5); color:#fff; }
          .tbwf-close-btn:active { transform:scale(0.96); }
          .tbwf-close-btn:focus-visible { outline:2px solid rgba(239,68,68,0.7); outline-offset:1px; }
          #tbwf-dismiss { padding:8px 18px; border:none; border-radius:6px; background:#4f46e5; color:#fff; font-size:13px; font-weight:600; cursor:pointer; transition:background 0.15s ease, transform 0.05s ease; font-family:inherit; }
          #tbwf-dismiss:hover { background:#6366f1; }
          #tbwf-dismiss:active { transform:scale(0.97); }
          #tbwf-dismiss:focus-visible { outline:2px solid rgba(99,102,241,0.7); outline-offset:1px; }
        `;
        document.head.appendChild(styleEl);
      }
      const overlay = document.createElement("div");
      overlay.id = "tbwf-multi-tab-overlay";
      overlay.innerHTML = `
        <div style="width:min(480px,90vw);background:#1a1a24;border:1px solid rgba(255,255,255,0.1);border-radius:12px;box-shadow:0 12px 48px rgba(0,0,0,0.6);overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#fff;">
          <div style="padding:14px 18px;background:rgba(251,191,36,0.12);border-bottom:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;gap:8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span style="font-weight:600;font-size:14px;">${escHtml(title)}</span>
          </div>
          <div style="padding:16px 18px;font-size:13px;line-height:1.55;color:rgba(255,255,255,0.8);">
            <p style="margin:0 0 12px;">${desc}</p>
            <div id="tbwf-tab-list" style="max-height:240px;overflow-y:auto;">${buildRows(tabs)}</div>
          </div>
          <div style="padding:12px 18px;border-top:1px solid rgba(255,255,255,0.08);display:flex;justify-content:flex-end;">
            <button type="button" id="tbwf-dismiss">${escHtml(dismissLabel)}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const closeOverlay = () => {
        overlay.remove();
        document.removeEventListener("keydown", escHandler);
      };
      const escHandler = (e) => {
        if (e.key === "Escape") closeOverlay();
      };
      document.addEventListener("keydown", escHandler);
      overlay.querySelector("#tbwf-dismiss")?.addEventListener("click", () => {
        _flowMultiTabDismissedSignature = tabSignature;
        closeOverlay();
      });
      overlay
        .querySelector("#tbwf-tab-list")
        ?.addEventListener("click", async (e) => {
          const btn = e.target.closest("[data-close-tab]");
          if (!btn) return;
          const tabId = parseInt(btn.getAttribute("data-close-tab"), 10);
          if (!tabId) return;
          try {
            await chrome.tabs.remove(tabId);
            const row = overlay.querySelector(`[data-tab-row="${tabId}"]`);
            row?.remove();
            _scheduleFlowTabWarning();
          } catch (err) {
            console.warn(
              "[FlowMultiTabWarning] Close tab failed:",
              err?.message,
            );
          }
        });
    } catch (e) {
      console.warn("[FlowMultiTabWarning] check failed:", e?.message);
    }
  }
});
