class WorkflowTab {
  constructor(container) {
    this.container = container;
    this.workflowList = null;
    this.workflowTemplateList = null;
    this.isInitialized = false;
    this._currentSubtab = "templates";
  }
  async init() {
    if (this.isInitialized) return;
    console.log("[WorkflowTab] Initializing...");
    if (window.storageManager && !window.storageManager.storage) {
      await window.storageManager.init();
    }
    this._renderSubtabs();
    const workflowContent = this.container.querySelector(
      '[data-content="workflows"]',
    );
    const listSection =
      workflowContent ||
      this.container.querySelector("#workflowListSection") ||
      this.container;
    this.workflowList = new WorkflowList(listSection);
    this.workflowList._runWorkflowAndWait = (workflow, options) =>
      this.runWorkflow(workflow, void 0, options);
    this._bindSubtabEvents();
    if (window.eventBus) {
      window.eventBus.on("workflow:open_editor", (data) => {
        this.openEditor(data.mode, data.workflow);
      });
      window.eventBus.on("workflow:run", (data) => {
        this.runWorkflow(data.workflow, data.manualSubmitMode);
      });
      window.eventBus.on("execution:started", () => {
        this.workflowList?._debouncedLoadWorkflows?.() ||
          this.workflowList?.loadWorkflows();
      });
      window.eventBus.on("execution:progress", () => {
        this.workflowList?._debouncedLoadWorkflows?.() ||
          this.workflowList?.loadWorkflows();
      });
      window.eventBus.on("execution:completed", async (data) => {
        if (!data?.error && !data?.stopped && window.featureGate) {
          await window.featureGate.recordPendingWorkflowRun();
        }
        this.workflowList?._debouncedLoadWorkflows?.() ||
          this.workflowList?.loadWorkflows();
      });
      window.eventBus.on("workflow:reset", () => {
        this.workflowList?._debouncedLoadWorkflows?.() ||
          this.workflowList?.loadWorkflows();
      });
      window.eventBus.on("featuregate:refreshed", () => {
        this._applySubtabFeatureGate(this._currentSubtab);
      });
      window.eventBus.on("node:completed", () => {
        this.workflowList?._debouncedLoadWorkflows?.() ||
          this.workflowList?.loadWorkflows();
      });
      window.eventBus.on("auth:login", () =>
        this._updateMyTemplatesSubtab(true),
      );
      window.eventBus.on("auth:restored", () =>
        this._updateMyTemplatesSubtab(true),
      );
      window.eventBus.on("auth:logout", () =>
        this._updateMyTemplatesSubtab(true),
      );
      window.eventBus.on("affiliate:updated", () =>
        this._updateMyTemplatesSubtab(true),
      );
      window.eventBus.on("sse:entitlements_changed", () =>
        this._updateMyTemplatesSubtab(true),
      );
      window.eventBus.on("workflow:subtab_changed", (data) => {
        const subtab = data?.subtab;
        if (subtab && subtab !== this._currentSubtab) {
          this._switchSubtab(subtab);
        }
      });
      window.eventBus.on("workflow:imported", () => {
        this.workflowList?.loadWorkflows();
      });
      window.eventBus.on("sse:workflows_updated", (data) => {
        this.workflowList?._debouncedLoadWorkflows?.() ||
          this.workflowList?.loadWorkflows?.();
        if (data?.toast) window.showNotification?.(data.toast, "info", 5e3);
      });
      try {
        chrome.runtime.onMessage.addListener((msg) => {
          if (
            msg?.action === "creatorTemplateUpdated" &&
            this._currentSubtab === "mytemplates"
          ) {
            this._loadMyTemplates();
          }
        });
      } catch (_) {}
    }
    try {
      const hasWorkflows = await this._checkUserHasWorkflows();
      if (hasWorkflows) {
        console.log(
          "[WorkflowTab] User has workflows, auto-switching to workflows subtab",
        );
        this._switchSubtab("workflows");
      } else {
        this._loadWorkflowTemplateList();
      }
    } catch (e) {
      console.warn(
        "[WorkflowTab] Error checking workflows, defaulting to templates:",
        e?.message,
      );
      this._loadWorkflowTemplateList();
    }
    this.isInitialized = true;
    console.log("[WorkflowTab] Initialized");
  }
  async _checkUserHasWorkflows() {
    try {
      if (window.storageManager?.getWorkflows) {
        const result = await window.storageManager.getWorkflows({ limit: 1 });
        const workflows = result?.data || result || [];
        return workflows.length > 0;
      }
      return false;
    } catch (e) {
      console.warn("[WorkflowTab] _checkUserHasWorkflows error:", e?.message);
      return false;
    }
  }
  async openEditor(mode = "create", workflow = null) {
    console.log(
      "[WorkflowTab] openEditor called, mode:",
      mode,
      "wfId:",
      workflow?.wf_id,
    );
    try {
      const ready = window.ProjectHelper?.isFlowProjectOpen
        ? await window.ProjectHelper.isFlowProjectOpen()
        : await window.ProjectHelper?.isFlowProjectReady?.();
      if (!ready) {
        console.warn(
          "[WorkflowTab] openEditor b\u1ECB ch\u1EB7n \u2014 kh\xF4ng c\xF3 Flow project h\u1EE3p l\u1EC7 (homepage / project l\u1ED7i-\u0111\xE3 xo\xE1)",
        );
        if (typeof window.showNotification === "function") {
          window.showNotification(
            window.I18n?.t("workflow.projectNotReady") ||
              "Flow project not ready (no project open or the project was deleted). Open/select a project and try again.",
            "warning",
          );
        }
        if (typeof window._showProjectSelectOverlay === "function") {
          window._showProjectSelectOverlay(true);
        } else {
          window.ProjectHelper?.warnNoProjectForUpload?.(null);
        }
        return;
      }
    } catch (e) {
      console.warn(
        "[WorkflowTab] openEditor readiness check failed, fail-open:",
        e?.message,
      );
    }
    chrome.runtime.sendMessage(
      {
        action: "openWorkflowEditor",
        data: {
          mode,
          workflow,
          projectId: window._currentProjectId || null,
          projectName: window._currentProjectName || null,
        },
      },
      (response) => {
        console.log("[WorkflowTab] openWorkflowEditor response:", response);
        if (
          response &&
          response.ok === false &&
          response.error === "PROJECT_NOT_READY"
        ) {
          console.warn(
            "[WorkflowTab] editor b\u1ECB ch\u1EB7n \u1EDF background re-gate \u2014 Flow project ch\u01B0a s\u1EB5n s\xE0ng",
          );
          if (typeof window.showNotification === "function") {
            window.showNotification(
              window.I18n?.t("workflow.projectNotReady") ||
                "Flow project not ready (no project open or the project was deleted). Open/select a project and try again.",
              "warning",
            );
          }
          if (typeof window._showProjectSelectOverlay === "function")
            window._showProjectSelectOverlay(true);
        }
      },
    );
  }
  async runWorkflow(workflow, manualSubmitMode = void 0, options = {}) {
    const cancelled = () => options.shouldStop?.() === true;
    if (!workflow?.wf_id || cancelled()) return false;
    if (window.featureGate) {
      const quota =
        await window.featureGate.checkQuotaAsync("workflows_run_max");
      if (cancelled()) return false;
      if (!quota.allowed) {
        const isLoggedIn = window.authManager?.isLoggedIn();
        if (isLoggedIn) {
          const limitText =
            quota.limit === "unlimited"
              ? window.I18n?.t("common.unlimited") || "Unlimited"
              : `${quota.limit} ${window.I18n?.t("workflow.runsPerDay") || "runs/day"}`;
          const shouldUpgrade = await window.customDialog?.confirm(
            window.I18n?.t("workflow.runQuotaExhausted", {
              limitText,
              used: quota.used,
            }) ||
              `Workflow runs exhausted today.

Limit: ${limitText}
Used: ${quota.used} runs

Upgrade plan to increase limit.`,
            {
              title:
                window.I18n?.t("workflow.runQuotaTitle") ||
                "Workflow runs exhausted",
              confirmText: window.I18n?.t("common.upgrade") || "Upgrade",
              cancelText: window.I18n?.t("common.later") || "Later",
            },
          );
          if (shouldUpgrade) {
            if (typeof window.openUpgradeModal === "function") {
              window.openUpgradeModal();
            }
          }
        } else {
          window.featureGate.showLoginPrompt(
            window.I18n?.t("workflow.trialRunExhausted") ||
              "You have used all workflow runs in trial.",
          );
        }
        return false;
      }
      const quotaCheck = window.featureGate.checkGlobalQuotaWarning("Workflow");
      if (quotaCheck.exhausted) {
        return false;
      }
    }
    if (window.workflowExecutor?.isRunning) {
      window.customDialog.alert(
        window.I18n?.t("workflow.alreadyRunning") ||
          "Another workflow is currently running. Please wait or stop it first.",
        { type: "warning" },
      );
      return false;
    }
    try {
      const running = await window.WorkflowExecutor?.getCrossContextRunning?.();
      if (cancelled()) return false;
      if (running?.wf_id) {
        const runningName = running.wf_name || "Workflow";
        window.customDialog.alert(
          window.I18n?.t("workflow.anotherRunningCrossContext", {
            name: runningName,
          }) ||
            `"${runningName}" \u0111ang ch\u1EA1y \u1EDF c\u1EEDa s\u1ED5 kh\xE1c. Vui l\xF2ng \u0111\u1EE3i ho\u1EB7c d\u1EEBng tr\u01B0\u1EDBc.`,
          { type: "warning" },
        );
        return false;
      }
    } catch (e) {
      console.warn(
        "[WorkflowTab] Cross-context running check failed:",
        e.message,
      );
    }
    const fullWorkflow = await window.storageManager?.getWorkflow(
      workflow.wf_id,
    );
    if (cancelled()) return false;
    const hasCompleted = fullWorkflow?.nodes?.some(
      (n) => n.status === "completed",
    );
    if (hasCompleted) {
      const choice = await window.customDialog.confirmResumeOrRerun(
        window.I18n?.t("workflow.resumeOrRerun", { name: workflow.wf_name }) ||
          `Workflow "${workflow.wf_name}" has completed nodes.
Click "Resume" to continue from unfinished nodes, or "Run again" to reset.`,
        {
          title:
            window.I18n?.t("workflow.resumeOrRerunTitle") ||
            "Continue or re-run?",
        },
      );
      if (choice === null || cancelled()) return false;
      if (choice === "rerun") {
        if (options.beforeDispatch) {
          await options.beforeDispatch(fullWorkflow || workflow);
          if (cancelled()) return false;
        }
        await window.workflowExecutor.reset(workflow.wf_id);
        if (cancelled()) return false;
      }
    }
    let _msMode = manualSubmitMode === true;
    if (this.workflowList?._preflightCheck) {
      const preflight = await this.workflowList._preflightCheck(
        fullWorkflow || workflow,
      );
      if (!preflight || !preflight.ready || cancelled()) {
        console.log(
          "[WorkflowTab] runWorkflow aborted - preflight failed/cancelled",
        );
        return false;
      }
      _msMode = preflight.manualSubmitMode === true;
    }
    console.log("[WorkflowTab] Running workflow:", workflow.wf_id);
    if (cancelled()) return false;
    if (options.beforeDispatch) {
      await options.beforeDispatch(fullWorkflow || workflow);
      if (cancelled()) return false;
    }
    if (window.featureGate) {
      window.featureGate.setPendingWorkflowRun();
    }
    try {
      const result = await window.workflowExecutor.execute(workflow.wf_id, {
        manualSubmitMode: _msMode,
      });
      if (result === false) {
        console.warn("[WorkflowTab] Workflow execution aborted before start");
        const msg =
          window.I18n?.t("workflow.executionAborted") ||
          "Could not start the workflow. Please check the log for details.";
        if (window.showNotification) {
          window.showNotification(msg, "error");
        }
      }
      return result !== false;
    } catch (error) {
      console.error("[WorkflowTab] Workflow execution failed:", error);
      window.customDialog.alert(
        (window.I18n?.t("workflow.executionError") ||
          "Workflow execution error") +
          ": " +
          error.message,
        { type: "error" },
      );
      return false;
    }
  }
  stopWorkflow() {
    if (window.workflowExecutor?.isRunning) {
      window.workflowExecutor.stop();
    }
  }
  destroy() {
    this.isInitialized = false;
  }
  _renderSubtabs() {
    const t = (key) => window.I18n?.t(key) || key;
    if (this.container.querySelector(".tobyflow-workflow-subtabs")) {
      return;
    }
    const existingSection = this.container.querySelector(
      "#workflowListSection",
    );
    const subtabsHtml = `
      <div class="tobyflow-workflow-subtabs">
        <button class="tobyflow-workflow-subtab active" data-subtab="templates">
          <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" data-testid="center-icon"><path d="M4.918 6.763c0-.943.764-1.707 1.707-1.707h2.463c.943 0 1.707.764 1.707 1.707v2.463c0 .943-.764 1.707-1.707 1.707H6.625a1.707 1.707 0 0 1-1.707-1.707zm1.708-.244a.244.244 0 0 0-.244.244v2.463c0 .135.109.244.244.244h2.463a.244.244 0 0 0 .244-.244V6.763a.244.244 0 0 0-.244-.244zm0 6.547c-.943 0-1.707.764-1.707 1.707v2.463c0 .943.764 1.707 1.707 1.707h2.463c.943 0 1.707-.764 1.707-1.707v-2.463c0-.943-.764-1.707-1.707-1.707zm-.244 1.708c0-.135.109-.244.244-.244h2.463c.135 0 .244.109.244.244v2.463a.244.244 0 0 1-.244.244H6.626a.244.244 0 0 1-.244-.244zm6.276-8.487c0-.404.328-.732.732-.732h4.878a.732.732 0 0 1 0 1.464H13.39a.73.73 0 0 1-.732-.732m.732 7.279a.732.732 0 0 0 0 1.464h4.878a.732.732 0 0 0 0-1.464zm-.732-3.864c0-.404.328-.732.732-.732h4.878a.732.732 0 0 1 0 1.464H13.39a.73.73 0 0 1-.732-.732m.732 7.279a.732.732 0 0 0 0 1.464h4.878a.732.732 0 0 0 0-1.464z"></path><path d="M2.004 6.634A4.634 4.634 0 0 1 6.638 2H17.37a4.634 4.634 0 0 1 4.634 4.634v10.732A4.634 4.634 0 0 1 17.37 22H6.638a4.634 4.634 0 0 1-4.634-4.634zm4.634-3.171a3.17 3.17 0 0 0-3.171 3.171v10.732a3.17 3.17 0 0 0 3.17 3.171H17.37a3.17 3.17 0 0 0 3.17-3.171V6.634a3.17 3.17 0 0 0-3.17-3.171z"></path></svg>
          <span>${t("workflow.subtabTemplates")}</span>
        </button>
        <button class="tobyflow-workflow-subtab" data-subtab="workflows">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="m10.883 9.62.16.043 6.55 2.312c.913.322.975 1.59.097 2l-2.534 1.181-1.181 2.534c-.384.823-1.522.82-1.93.065l-.07-.162-2.312-6.55c-.284-.804.424-1.58 1.22-1.424m2.143 6.957.964-2.064.044-.084c.11-.191.277-.345.479-.439l2.064-.964-5.488-1.937z" clip-rule="evenodd"></path><path d="M3.333 12.668c.367 0 .665.298.665.665v.833c0 1.013.822 1.835 1.835 1.835h.833l.135.014a.666.666 0 0 1 0 1.302l-.135.014h-.833a3.165 3.165 0 0 1-3.165-3.165v-.833c0-.367.298-.665.665-.665M6.8 2.682a.665.665 0 0 1 0 1.302l-.134.014h-.833a1.835 1.835 0 0 0-1.835 1.835v.833a.665.665 0 0 1-1.33 0v-.833a3.166 3.166 0 0 1 3.165-3.165h.833zM14.166 2.668a3.165 3.165 0 0 1 3.165 3.165v.833a.665.665 0 0 1-1.33 0v-.833a1.835 1.835 0 0 0-1.835-1.835h-.833a.665.665 0 0 1 0-1.33z"></path></svg>
          <span>${t("workflow.subtabWorkflows")}</span>
        </button>
        <button class="tobyflow-workflow-subtab" data-subtab="mytemplates" data-creator-only style="display: none;">
          <svg width="15" height="15" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M13.5 6.188h-9c-1.813 0-2.812.999-2.812 2.812v5.25c0 1.814.999 2.813 2.812 2.813h9c1.813 0 2.813-1 2.813-2.813V9c0-1.814-1-2.812-2.813-2.812m1.688 8.062c0 1.183-.505 1.688-1.688 1.688h-9c-1.183 0-1.687-.505-1.687-1.688V9c0-1.183.504-1.687 1.687-1.687h9c1.183 0 1.688.504 1.688 1.687zM3.938 4.5c0-.31.251-.562.562-.562h9a.563.563 0 0 1 0 1.124h-9a.563.563 0 0 1-.562-.562m1.5-2.25c0-.31.252-.562.562-.562h6a.563.563 0 0 1 0 1.125H6a.563.563 0 0 1-.562-.563m5.792 8.336L8.869 9.141a1.27 1.27 0 0 0-1.93 1.08v2.809c0 .464.24.877.647 1.104a1.27 1.27 0 0 0 1.283-.025l2.36-1.444a1.21 1.21 0 0 0 .584-1.04 1.21 1.21 0 0 0-.583-1.039m-.588 1.118L8.28 13.15a.14.14 0 0 1-.146.003.14.14 0 0 1-.072-.123v-2.81c0-.067.04-.104.072-.123a.14.14 0 0 1 .072-.02q.033 0 .074.023l2.361 1.446h.001q.045.028.045.078a.09.09 0 0 1-.046.08"></path></svg>
          <span>${t("workflow.subtabMyTemplates") || "My Templates"}</span>
        </button>
        <button class="tobyflow-workflow-subtab" data-subtab="shared">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
            <polyline points="16 6 12 2 8 6"/>
            <line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
          <span>${t("workflow.subtabShared")}</span>
          <span class="tobyflow-workflow-subtab-badge" data-shared-count style="display: none;">0</span>
        </button>
      </div>
      <div class="tobyflow-workflow-content" data-content="templates" style="display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden;">
        <!-- WorkflowTemplateList content - lazy loaded -->
      </div>
      <div class="tobyflow-workflow-content" data-content="workflows" style="display: none; flex-direction: column; flex: 1; min-height: 0; overflow: hidden;">
        <!-- WorkflowList content will be moved here -->
      </div>
      <div class="tobyflow-workflow-content" data-content="shared" style="display: none; flex-direction: column; flex: 1; min-height: 0; overflow: hidden;">
        <!-- Shared workflows list \u2014 render b\u1EDFi WorkflowList.renderSharedTab() -->
      </div>
      <div class="tobyflow-workflow-content" data-content="mytemplates" style="display: none; flex-direction: column; flex: 1; min-height: 0; overflow: auto;">
        <!-- [Affiliate Creator Page] Template c\u1EE7a t\xF4i \u2014 render b\u1EDFi MyTemplatesList.renderInto() -->
      </div>
    `;
    this.container.insertAdjacentHTML("afterbegin", subtabsHtml);
    window.ProviderTabScroll?.bind(
      this.container.querySelector(".tobyflow-workflow-subtabs"),
    );
    this._updateMyTemplatesSubtab();
    if (existingSection) {
      const workflowsContent = this.container.querySelector(
        '[data-content="workflows"]',
      );
      if (workflowsContent) {
        workflowsContent.appendChild(existingSection);
      }
    }
  }
  _updateMyTemplatesSubtab(force = false) {
    const btn = this.container?.querySelector(
      '.tobyflow-workflow-subtab[data-subtab="mytemplates"]',
    );
    if (!btn) return;
    const pane = this.container?.querySelector('[data-content="mytemplates"]');
    if (!window.authManager?.isLoggedIn?.()) {
      btn.style.display = "none";
      if (pane) pane.innerHTML = "";
      if (this._currentSubtab === "mytemplates")
        this._switchSubtab("workflows");
      return;
    }
    if (force) window.CreatorTemplatePublish?.invalidateEligible?.();
    window.CreatorTemplatePublish?.isEligible?.()
      .then((ok) => {
        btn.style.display = ok ? "" : "none";
        if (ok) {
          if (this._currentSubtab === "mytemplates") this._loadMyTemplates();
        } else {
          if (pane) pane.innerHTML = "";
          if (this._currentSubtab === "mytemplates")
            this._switchSubtab("workflows");
        }
      })
      .catch(() => {});
  }
  _bindSubtabEvents() {
    const subtabBtns = this.container.querySelectorAll(
      ".tobyflow-workflow-subtab",
    );
    subtabBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const subtab = btn.dataset.subtab;
        if (!subtab) return;
        if (subtab === this._currentSubtab) {
          this._refreshCurrentSubtab(subtab);
        } else {
          this._switchSubtab(subtab);
        }
      });
    });
  }
  _refreshCurrentSubtab(subtab) {
    console.log("[WorkflowTab] Refreshing current subtab:", subtab);
    const blocked = this._applySubtabFeatureGate(subtab);
    if (blocked) return;
    if (subtab === "workflows") {
      this.workflowList?._debouncedLoadWorkflows?.() ||
        this.workflowList?.loadWorkflows?.();
    } else if (subtab === "templates") {
      this.workflowTemplateList?.loadTemplates?.();
    } else if (subtab === "shared") {
      this.workflowList?.loadSharedWorkflows?.();
    } else if (subtab === "mytemplates") {
      this._loadMyTemplates();
    }
  }
  _switchSubtab(subtab) {
    console.log("[WorkflowTab] Switching to subtab:", subtab);
    const subtabBtns = this.container.querySelectorAll(
      ".tobyflow-workflow-subtab",
    );
    subtabBtns.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.subtab === subtab);
    });
    const contentPanes = this.container.querySelectorAll(
      ".tobyflow-workflow-content",
    );
    contentPanes.forEach((pane) => {
      const isActive = pane.dataset.content === subtab;
      pane.style.display = isActive ? "flex" : "none";
      if (isActive) {
        pane.style.flexDirection = "column";
        pane.style.flex = "1";
        pane.style.minHeight = "0";
        pane.style.overflow = "hidden";
      }
    });
    this._currentSubtab = subtab;
    if (window.eventBus) {
      window.eventBus.emit("workflow:subtab_changed", { subtab });
    }
    const blocked = this._applySubtabFeatureGate(subtab);
    if (blocked) return;
    if (subtab === "workflows") {
      this.workflowList?.loadWorkflows?.();
    } else if (subtab === "templates") {
      if (!this.workflowTemplateList) {
        this._loadWorkflowTemplateList();
      } else {
        this.workflowTemplateList._loadTemplates?.(false);
      }
    } else if (subtab === "shared") {
      const sharedContent = this.container.querySelector(
        '[data-content="shared"]',
      );
      if (sharedContent && this.workflowList) {
        this.workflowList.showSharedLoadingSkeleton(sharedContent);
        this.workflowList.loadSharedWorkflows().then(() => {
          this.workflowList.renderSharedTab(sharedContent);
        });
      }
    } else if (subtab === "mytemplates") {
      this._loadMyTemplates();
    }
  }
  _loadMyTemplates() {
    const pane = this.container.querySelector('[data-content="mytemplates"]');
    if (pane && window.MyTemplatesList?.renderInto) {
      window.MyTemplatesList.renderInto(pane);
    }
  }
  _applySubtabFeatureGate(subtab) {
    if (subtab === "mytemplates") return false;
    const featureKey =
      subtab === "templates"
        ? "workflow_templates_enabled"
        : "workflows_enabled";
    const fg = window.featureGate;
    const pane = this.container.querySelector(`[data-content="${subtab}"]`);
    if (!pane) return false;
    const oldOverlay = pane.querySelector(".wf-subtab-blocked-overlay");
    if (oldOverlay) oldOverlay.remove();
    if (!fg || fg.canUse(featureKey)) {
      pane.classList.remove("wf-subtab-blocked");
      return false;
    }
    const isLoggedIn = !!window.authManager?.isLoggedIn?.();
    const t = (key, fallback) => window.I18n?.t(key) || fallback;
    const moduleNameMap = {
      workflows_enabled: t("workflow.title", "Workflow"),
      workflow_templates_enabled: t("workflow.subtabTemplates", "Templates"),
    };
    const moduleName = moduleNameMap[featureKey] || "Feature";
    const title = isLoggedIn
      ? t("featuregate.featureLockedTitle", "Feature Locked")
      : t("featuregate.loginRequiredTitle", "Login Required");
    const message = isLoggedIn
      ? t(
          "featuregate.featureLockedPaid",
          `G\xF3i hi\u1EC7n t\u1EA1i c\u1EE7a b\u1EA1n kh\xF4ng bao g\u1ED3m ${moduleName}. Vui l\xF2ng n\xE2ng c\u1EA5p \u0111\u1EC3 s\u1EED d\u1EE5ng.`,
        ).replace("{module}", moduleName)
      : t(
          "featuregate.loginRequiredFeature",
          `T\xEDnh n\u0103ng ${moduleName} y\xEAu c\u1EA7u \u0111\u0103ng nh\u1EADp.`,
        ).replace("{module}", moduleName);
    const ctaLabel = isLoggedIn
      ? t("common.upgrade", "Upgrade")
      : t("auth.login", "Login");
    pane.classList.add("wf-subtab-blocked");
    const ctaBtnClass = isLoggedIn
      ? "wf-subtab-blocked-cta wf-subtab-blocked-cta--upgrade"
      : "wf-subtab-blocked-cta";
    const overlayHtml = `
      <div class="wf-subtab-blocked-overlay">
        <div class="wf-subtab-blocked-card">
          <svg class="wf-subtab-blocked-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <h3 class="wf-subtab-blocked-title">${this._escapeHtml(title)}</h3>
          <p class="wf-subtab-blocked-msg">${this._escapeHtml(message)}</p>
          <button class="${ctaBtnClass}" data-action="${isLoggedIn ? "upgrade" : "login"}">
            ${this._escapeHtml(ctaLabel)}
          </button>
        </div>
      </div>
    `;
    pane.insertAdjacentHTML("afterbegin", overlayHtml);
    const ctaBtn = pane.querySelector(".wf-subtab-blocked-cta");
    ctaBtn?.addEventListener("click", () => {
      if (isLoggedIn) {
        if (typeof window.openUpgradeModal === "function") {
          window.openUpgradeModal();
        } else {
          try {
            chrome.runtime.sendMessage({ action: "showUpgradeModal" });
          } catch (e) {}
        }
      } else {
        const loginOverlay = document.getElementById("loginOverlay");
        if (loginOverlay) loginOverlay.classList.remove("hidden");
      }
    });
    return true;
  }
  _escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str ?? "");
    return div.innerHTML;
  }
  _loadWorkflowTemplateList() {
    const templatesContent = this.container.querySelector(
      '[data-content="templates"]',
    );
    if (!templatesContent) return;
    if (typeof window.WorkflowTemplateList === "function") {
      this.workflowTemplateList = new window.WorkflowTemplateList(
        templatesContent,
      );
      window.workflowTemplateList = this.workflowTemplateList;
      console.log("[WorkflowTab] WorkflowTemplateList loaded");
    } else {
      templatesContent.innerHTML = `
        <div class="workflow-empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
          <p>${window.I18n?.t("workflow.templatesComingSoon") || "Workflow Templates coming soon"}</p>
        </div>
      `;
    }
  }
}
window.WorkflowTab = WorkflowTab;
