(function () {
  "use strict";
  function runAllProjectError(code) {
    return Object.assign(
      new Error(
        window.I18n?.t?.("project.runAllBlocked") ||
          "Run All stopped: the current Flow project changed or could not be verified. Open the correct project and try again.",
      ),
      { code },
    );
  }
  const ProjectHelper = {
    async getRunAllProjectContext() {
      const context = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 5e3);
        const finish = (value) => {
          clearTimeout(timer);
          resolve(value);
        };
        try {
          chrome.runtime.sendMessage(
            { action: "getFlowProjectContext" },
            (response) => {
              finish(chrome.runtime.lastError ? null : response);
            },
          );
        } catch (_) {
          finish(null);
        }
      });
      if (
        !context?.projectId ||
        context.contentReady !== true ||
        context.isProjectEditor !== true ||
        context.projectError === true ||
        context.mediaViewer === true
      ) {
        throw runAllProjectError("RUN_ALL_PROJECT_UNAVAILABLE");
      }
      window._currentProjectId = context.projectId;
      window._currentProjectName =
        context.projectName || context.tabTitle || null;
      return context;
    },
    async assertRunAllProject(items, expectedProjectId) {
      const normalize = (value) =>
        String(value || "")
          .trim()
          .toLowerCase();
      const expected = normalize(expectedProjectId);
      if (
        !expected ||
        !items.length ||
        items.some((item) => normalize(item?.project_id) !== expected)
      ) {
        throw runAllProjectError("RUN_ALL_PROJECT_MISMATCH");
      }
      const context = await this.getRunAllProjectContext();
      if (normalize(context.projectId) !== expected)
        throw runAllProjectError("RUN_ALL_PROJECT_CHANGED");
      return true;
    },
    isCurrentProject(item) {
      if (!item.project_id) return true;
      if (!window._currentProjectId) return false;
      return item.project_id === window._currentProjectId;
    },
    async isCurrentProjectLive(item) {
      if (!item?.project_id) return true;
      const context = await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage(
            { action: "getFlowProjectContext" },
            (response) => {
              resolve(chrome.runtime.lastError ? null : response);
            },
          );
        } catch (_) {
          resolve(null);
        }
      });
      if (!context) return false;
      window._currentProjectId = context.projectId || null;
      window._currentProjectName =
        context.projectName || context.tabTitle || null;
      return (
        String(item.project_id).toLowerCase() ===
        String(context.projectId || "").toLowerCase()
      );
    },
    async checkWorkflowProjectGate(wf) {
      if (!wf?.project_id) return { ok: true };
      if (!(await this.isCurrentProjectLive(wf))) {
        let name = wf.project_name || null;
        if (!name) {
          try {
            name = await this.getProjectName(wf.project_id);
          } catch (_) {}
        }
        return {
          ok: false,
          code: "WRONG_PROJECT",
          expectedProjectId: wf.project_id,
          expectedName: name,
        };
      }
      try {
        const ready = await this.isFlowProjectReady();
        if (ready === false)
          return {
            ok: false,
            code: "PROJECT_NOT_READY",
            expectedProjectId: wf.project_id,
          };
      } catch (_) {}
      return { ok: true };
    },
    uniquifyName(baseName, existingNames) {
      if (!baseName) return baseName;
      const existing = new Set(
        Array.isArray(existingNames) ? existingNames.filter(Boolean) : [],
      );
      if (!existing.has(baseName)) return baseName;
      const m = baseName.match(/^(.+?)\s+(\d+)$/);
      const root = m ? m[1] : baseName;
      let counter = m ? parseInt(m[2], 10) + 1 : 2;
      let candidate = `${root} ${counter}`;
      const MAX = 1e5;
      while (existing.has(candidate)) {
        counter++;
        if (counter > MAX) {
          console.warn(
            "[ProjectHelper] uniquifyName overflow, fallback to timestamp suffix",
          );
          return `${root} ${Date.now()}`;
        }
        candidate = `${root} ${counter}`;
      }
      return candidate;
    },
    async getProjectName(projectId) {
      if (!projectId) return window.I18n?.t("project.shared") || "Chung";
      try {
        const result = await chrome.storage.local.get("af_projects");
        const projects = result.af_projects || {};
        return projects[projectId]?.name || projectId.substring(0, 8);
      } catch (e) {
        return projectId.substring(0, 8);
      }
    },
    async getProjectList() {
      try {
        const result = await chrome.storage.local.get("af_projects");
        let projects = result.af_projects || {};
        if (
          Object.keys(projects).length === 0 &&
          window.authManager?.isLoggedIn()
        ) {
          projects = (await this.fetchProjectNamesFromApi()) || {};
        }
        return projects;
      } catch (e) {
        return {};
      }
    },
    async fetchProjectNamesFromApi() {
      if (!window.authManager?.isLoggedIn()) return null;
      try {
        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            {
              action: "apiRequest",
              method: "GET",
              endpoint: "projects/names",
              token: window.authManager?.token,
            },
            (resp) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
              }
              resolve(resp);
            },
          );
        });
        if (response?.success && response.data) {
          const result = await chrome.storage.local.get("af_projects");
          const localProjects = result.af_projects || {};
          for (const [pid, info] of Object.entries(response.data)) {
            const serverAccessed = info.last_accessed_at
              ? new Date(info.last_accessed_at).getTime()
              : 0;
            const localAccessed =
              Number(localProjects[pid]?.last_accessed) || 0;
            if (
              info.name &&
              (!localProjects[pid]?.name || serverAccessed > localAccessed)
            ) {
              localProjects[pid] = {
                ...localProjects[pid],
                name: info.name,
                last_accessed: serverAccessed || Date.now(),
              };
            }
          }
          await chrome.storage.local.set({ af_projects: localProjects });
          return localProjects;
        }
      } catch (e) {
        console.warn(
          "[ProjectHelper] fetchProjectNamesFromApi error:",
          e.message,
        );
      }
      return null;
    },
    async syncCurrentProject() {
      if (!window._currentProjectId || !window._currentProjectName) return;
      if (!window.authManager?.isLoggedIn()) return;
      try {
        await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            {
              action: "apiRequest",
              method: "POST",
              endpoint: "projects/sync",
              token: window.authManager?.token,
              data: {
                project_id: window._currentProjectId,
                project_name: window._currentProjectName,
              },
            },
            (resp) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
              }
              resolve(resp);
            },
          );
        });
      } catch (e) {
        console.warn("[ProjectHelper] syncCurrentProject error:", e.message);
      }
    },
    async ensureProjectNames(projectIds) {
      if (!projectIds?.length) return;
      const result = await chrome.storage.local.get("af_projects");
      const projects = result.af_projects || {};
      const missing = projectIds.filter((pid) => pid && !projects[pid]?.name);
      if (missing.length > 0) {
        await this.fetchProjectNamesFromApi();
      }
    },
    async sortByProjectGroup(items, currentProjectId) {
      const projects = await this.getProjectList();
      const currentItems = [];
      const otherGroups = {};
      const legacyItems = [];
      for (const item of items) {
        if (!item.project_id) {
          legacyItems.push(item);
        } else if (item.project_id === currentProjectId) {
          currentItems.push(item);
        } else {
          if (!otherGroups[item.project_id]) otherGroups[item.project_id] = [];
          otherGroups[item.project_id].push(item);
        }
      }
      const sortedOtherKeys = Object.keys(otherGroups).sort((a, b) => {
        const nameA = projects[a]?.name || a;
        const nameB = projects[b]?.name || b;
        return nameA.localeCompare(nameB);
      });
      const sortByCreatedAt = (arr) => {
        return arr.sort((a, b) => {
          if (a.created_at && b.created_at) {
            return new Date(b.created_at) - new Date(a.created_at);
          }
          const idA = a.wf_id || a.task_id || "";
          const idB = b.wf_id || b.task_id || "";
          const tsA = parseInt(idA.replace(/^(wf_|task_)/, "")) || 0;
          const tsB = parseInt(idB.replace(/^(wf_|task_)/, "")) || 0;
          return tsB - tsA;
        });
      };
      const result = [];
      if (currentItems.length > 0) {
        const name =
          projects[currentProjectId]?.name ||
          window._currentProjectName ||
          window.I18n?.t("project.currentProject") ||
          "Current project";
        result.push({
          type: "header",
          projectId: currentProjectId,
          projectName: name,
          count: currentItems.length,
          isCurrent: true,
        });
        result.push(
          ...sortByCreatedAt(currentItems).map((item) => ({
            type: "item",
            item,
          })),
        );
      }
      for (const pid of sortedOtherKeys) {
        const name = projects[pid]?.name || pid.substring(0, 8);
        result.push({
          type: "header",
          projectId: pid,
          projectName: name,
          count: otherGroups[pid].length,
          isCurrent: false,
        });
        result.push(
          ...sortByCreatedAt(otherGroups[pid]).map((item) => ({
            type: "item",
            item,
          })),
        );
      }
      if (legacyItems.length > 0) {
        result.push({
          type: "header",
          projectId: null,
          projectName: window.I18n?.t("project.shared") || "Chung",
          count: legacyItems.length,
          isCurrent: false,
        });
        result.push(
          ...sortByCreatedAt(legacyItems).map((item) => ({
            type: "item",
            item,
          })),
        );
      }
      return result;
    },
    getUniqueProjectIds(items) {
      const ids = new Set();
      for (const item of items) {
        if (item.project_id) ids.add(item.project_id);
      }
      return [...ids];
    },
    async migrateLegacyItems(legacyItems, type) {
      if (
        !legacyItems?.length ||
        !window._currentProjectId ||
        !window.storageManager
      )
        return 0;
      const projectId = window._currentProjectId;
      let count = 0;
      for (const item of legacyItems) {
        try {
          const updated = { ...item, project_id: projectId };
          if (type === "task") {
            await window.storageManager.saveTask(updated);
          } else if (type === "workflow") {
            await window.storageManager.saveWorkflow(updated);
          }
          count++;
        } catch (e) {
          console.warn(
            `[ProjectHelper] Migrate ${type} ${item.task_id || item.wf_id} failed:`,
            e.message,
          );
        }
      }
      return count;
    },
    renderMigrationBanner(count, type) {
      if (!count || !window._currentProjectId) return "";
      const dismissKey = `legacy_migrate_${type}_dismissed`;
      if (sessionStorage.getItem(dismissKey)) return "";
      const I = window.I18n;
      const typeLabel =
        type === "task"
          ? I?.t("tasks.title") || "task"
          : I?.t("workflow.title") || "workflow";
      const projName =
        window._currentProjectName ||
        I?.t("project.currentProject") ||
        "Current project";
      const msg =
        I?.t("project.migrateLegacyMsg", {
          count,
          type: typeLabel,
          project: projName,
        }) ||
        `${count} ${typeLabel} not assigned to a project. Assign to "${projName}"?`;
      const btnAssign = I?.t("project.migrateAssign") || "Assign all";
      const btnSkip = I?.t("project.migrateSkip") || "Skip";
      return `<div class="legacy-migrate-banner" data-type="${type}">
        <div class="legacy-migrate-banner-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        </div>
        <div class="legacy-migrate-banner-text">${msg}</div>
        <button class="legacy-migrate-btn legacy-migrate-btn-skip" data-action="skip">${btnSkip}</button>
        <button class="legacy-migrate-btn legacy-migrate-btn-assign" data-action="assign">${btnAssign}</button>
      </div>`;
    },
    async showCrossProjectWarning(item, itemType = "task", options = {}) {
      const projectName = await this.getProjectName(item.project_id);
      const typeLabel = itemType === "task" ? "Task" : "Workflow";
      const confirmKey =
        options.confirmTextKey || "project.crossProjectConfirm";
      const confirmFallback = options.confirmTextFallback || "Switch project";
      const result = await window.customDialog?.confirm(
        window.I18n?.t("project.crossProjectMsg", {
          type: typeLabel,
          name: projectName,
        }) ||
          `${typeLabel} n\xE0y thu\u1ED9c project "${projectName}".
B\u1EA1n c\u1EA7n nh\xE2n b\u1EA3n / chuy\u1EC3n sang project g\u1ED1c \u0111\u1EC3 ch\u1EC9nh s\u1EEDa ho\u1EB7c ch\u1EA1y.`,
        {
          title:
            window.I18n?.t("project.crossProjectTitle") || "Different project",
          type: "warning",
          confirmText: window.I18n?.t(confirmKey) || confirmFallback,
          cancelText: window.I18n?.t("project.crossProjectCancel") || "Close",
        },
      );
      if (result) {
        return "switch";
      }
      return null;
    },
    navigateToProject(projectId) {
      if (!projectId) return;
      const flowBase = window.ProviderConfigManager?.getBaseUrlSync?.("flow");
      if (!flowBase) {
        console.warn(
          "[ProjectHelper] navigateToProject: Flow base URL missing \u2014 skip switch",
        );
        return;
      }
      try {
        chrome.runtime.sendMessage({
          action: "navigateToProject",
          url: `${flowBase}/project/${projectId}`,
          projectId,
        });
      } catch (e) {
        console.warn("[ProjectHelper] navigateToProject failed:", e?.message);
      }
    },
    async hasActiveProject() {
      return await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage(
            { action: "getFlowProjectContext" },
            (resp) => {
              resolve(!chrome.runtime.lastError && !!(resp && resp.projectId));
            },
          );
        } catch (_) {
          resolve(false);
        }
      });
    },
    async isFlowProjectOpen() {
      return await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage(
            { action: "getFlowProjectContext" },
            (resp) => {
              if (chrome.runtime.lastError || !resp) return resolve(false);
              const open = !!resp.projectId && resp.projectError !== true;
              if (open && resp.contentReady === false) {
                console.info(
                  "[ProjectPolicy] workflow editor allowed from valid project URL while content relay restarts",
                  {
                    projectId: resp.projectId,
                    contextSource: resp.contextSource || null,
                  },
                );
              }
              resolve(open);
            },
          );
        } catch (_) {
          resolve(false);
        }
      });
    },
    async isFlowProjectReady() {
      return await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage(
            { action: "getFlowProjectContext" },
            (resp) => {
              if (chrome.runtime.lastError || !resp) return resolve(false);
              resolve(
                !!resp.projectId &&
                  resp.projectError !== true &&
                  resp.contentReady !== false,
              );
            },
          );
        } catch (_) {
          resolve(false);
        }
      });
    },
    async warnNoProjectForUpload(navTarget = null, customMessage = null) {
      if (this._noProjectModalOpen) return;
      this._noProjectModalOpen = true;
      const target = navTarget || window._currentProjectId || null;
      const confirmText = target
        ? window.I18n?.t("workflow.goToProject") || "Go to project"
        : window.I18n?.t("workflow.goToFlow") || "Open Flow";
      let go = false;
      try {
        go = window.customDialog
          ? await window.customDialog.confirm(
              customMessage ||
                window.I18n?.t("workflow.noProjectUpload") ||
                "You're on the Google Flow homepage (no project open). Uploading reference images requires an open project \u2014 open/create a project and try again.",
              {
                title:
                  window.I18n?.t("workflow.noProjectTitle") ||
                  "No Flow project open",
                type: "warning",
                confirmText,
                cancelText: window.I18n?.t("common.close") || "Close",
              },
            )
          : false;
      } finally {
        this._noProjectModalOpen = false;
      }
      if (go) {
        if (target) {
          this.navigateToProject(target);
        } else {
          const fb = window.ProviderConfigManager?.getBaseUrlSync?.("flow");
          if (fb) {
            try {
              chrome.runtime.sendMessage({
                action: "navigateToProject",
                url: fb,
              });
            } catch (_) {}
          }
        }
      }
    },
    async ensureProjectOrGuide(customMessage = null) {
      let ctx = null;
      try {
        ctx = await new Promise((resolve) => {
          try {
            chrome.runtime.sendMessage(
              { action: "getFlowProjectContext" },
              (resp) => {
                resolve(chrome.runtime.lastError ? null : resp);
              },
            );
          } catch (_) {
            resolve(null);
          }
        });
      } catch (_) {
        ctx = null;
      }
      const ready = !!(ctx && ctx.projectId && ctx.projectError !== true);
      if (ready) {
        if (window._currentProjectId !== ctx.projectId) {
          window._currentProjectId = ctx.projectId;
          if (ctx.tabId) window._targetFlowTabId = ctx.tabId;
        }
        return true;
      }
      const msg =
        customMessage ||
        window.I18n?.t("workflow.noProjectForWorkflow") ||
        "You haven't opened Google Flow or entered a project yet. Workflows need an open Flow project to run \u2014 open Flow, then create/select a project.";
      this.warnNoProjectForUpload(null, msg);
      return false;
    },
    async showCloneConfirmation(itemType = "task") {
      return window.customDialog?.confirm(
        window.I18n?.t("project.cloneDescription") ||
          "Clone will keep structure and prompts, but remove reference images and results (from another project).",
        {
          title:
            window.I18n?.t("project.cloneTitle") ||
            "Clone from another project",
          type: "warning",
          confirmText: window.I18n?.t("project.clone") || "Clone",
          cancelText: window.I18n?.t("common.cancel") || "Cancel",
        },
      );
    },
    cloneTaskCrossProject(task) {
      const cloned = JSON.parse(JSON.stringify(task));
      cloned.task_id = window.IdGenerator
        ? window.IdGenerator.next("task")
        : `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      cloned.project_id = window._currentProjectId || null;
      cloned.task_name =
        (cloned.task_name || "Task") +
        " " +
        (window.I18n?.t("project.copySuffix") || "(copy)");
      cloned.status = "pending";
      cloned.ref_file_ids = "";
      cloned.result_file_ids = "";
      cloned.result_thumbnails = {};
      cloned.result_file_names = {};
      cloned.error_message = "";
      cloned.executed_at = null;
      if (cloned.frame_1_file_id) {
        cloned.frame_1_file_id = "";
      }
      if (cloned.frame_2_file_id) {
        cloned.frame_2_file_id = "";
      }
      if (cloned.pending_upload_keys) cloned.pending_upload_keys = [];
      return cloned;
    },
    cloneWorkflowCrossProject(workflow, nodes = [], edges = []) {
      const newWfId = window.IdGenerator
        ? window.IdGenerator.next("wf")
        : `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const nodeIdMap = {};
      const newNodes = nodes.map((node, i) => {
        const newNodeId = window.IdGenerator
          ? window.IdGenerator.next("node")
          : `node_${Date.now()}_${i}`;
        nodeIdMap[node.node_id] = newNodeId;
        const cloned = {
          ...JSON.parse(JSON.stringify(node)),
          node_id: newNodeId,
          wf_id: newWfId,
          status: "pending",
          result_file_ids: "",
          error_message: "",
          executed_at: null,
        };
        const oldThumbs = cloned.ref_thumbnails || {};
        const oldNames = cloned.ref_file_names || {};
        const oldIds = [
          ...new Set([
            ...(cloned.ref_file_ids || "")
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean),
            ...Object.keys(oldThumbs),
            ...Object.keys(oldNames),
          ]),
        ];
        const portableIds = [];
        const portableThumbs = {};
        const portableNames = {};
        oldIds.forEach((oldId, refIndex) => {
          const value = oldThumbs[oldId];
          const url =
            typeof value === "string"
              ? value
              : value?.thumbnail ||
                value?.source_thumbnail ||
                value?.video_url ||
                "";
          if (!/^https?:\/\//i.test(url)) return;
          const key = `upload_clone_${Date.now()}_${refIndex}_${Math.random().toString(36).slice(2, 7)}`;
          portableIds.push(key);
          portableThumbs[key] = value;
          if (oldNames[oldId]) portableNames[key] = oldNames[oldId];
        });
        cloned.ref_file_ids = portableIds.join(", ");
        cloned.ref_thumbnails = portableThumbs;
        cloned.ref_file_names = portableNames;
        cloned.ref_flow_file_ids = null;
        cloned.result_thumbnails = {};
        cloned.result_file_names = {};
        cloned.result_provider_urls = {};
        cloned.result_text = "";
        cloned.result_source = null;
        [1, 2].forEach((frameNo) => {
          const source = cloned[`frame_${frameNo}_source`];
          const thumb = cloned[`frame_${frameNo}_thumbnail`];
          cloned[`frame_${frameNo}_file_id`] =
            (source === "manual" || !source) &&
            /^https?:\/\//i.test(thumb || "")
              ? `upload_clone_frame_${Date.now()}_${frameNo}_${Math.random().toString(36).slice(2, 7)}`
              : "";
        });
        return cloned;
      });
      for (const cloned of newNodes) {
        if (
          cloned.frame_1_source &&
          cloned.frame_1_source !== "manual" &&
          cloned.frame_1_source !== ""
        ) {
          cloned.frame_1_source =
            nodeIdMap[cloned.frame_1_source] || cloned.frame_1_source;
        }
        if (
          cloned.frame_2_source &&
          cloned.frame_2_source !== "manual" &&
          cloned.frame_2_source !== ""
        ) {
          cloned.frame_2_source =
            nodeIdMap[cloned.frame_2_source] || cloned.frame_2_source;
        }
      }
      const newEdges = edges.map((edge) => ({
        ...edge,
        edge_id: window.IdGenerator
          ? window.IdGenerator.next("edge")
          : `edge_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        wf_id: newWfId,
        source_node_id: nodeIdMap[edge.source_node_id] || edge.source_node_id,
        target_node_id: nodeIdMap[edge.target_node_id] || edge.target_node_id,
      }));
      const newWorkflow = {
        ...JSON.parse(JSON.stringify(workflow)),
        wf_id: newWfId,
        wf_name:
          (workflow.wf_name || "Workflow") +
          " " +
          (window.I18n?.t("project.copySuffix") || "(copy)"),
        project_id: window._currentProjectId || null,
        status: "idle",
        progress_completed: 0,
        progress_total: 0,
        current_node_id: null,
      };
      delete newWorkflow.nodes;
      delete newWorkflow.edges;
      return { workflow: newWorkflow, nodes: newNodes, edges: newEdges };
    },
    async renderFilterToolbar(items, currentFilter, containerId) {
      const projects = await this.getProjectList();
      const projectIds = this.getUniqueProjectIds(items);
      const counts = {};
      for (const item of items) {
        const pid = item.project_id || "__legacy__";
        counts[pid] = (counts[pid] || 0) + 1;
      }
      const t = (key, params) =>
        window.I18n ? window.I18n.t(key, params) : key;
      let pills = `<button class="project-filter-pill ${!currentFilter ? "active" : ""}" data-project-filter="">${t("project.filterAll", { count: items.length })}</button>`;
      if (
        window._currentProjectId &&
        projectIds.includes(window._currentProjectId)
      ) {
        const name =
          projects[window._currentProjectId]?.name ||
          window._currentProjectName ||
          t("project.current");
        const count = counts[window._currentProjectId] || 0;
        pills += `<button class="project-filter-pill ${currentFilter === window._currentProjectId ? "active" : ""}" data-project-filter="${window._currentProjectId}">${this._escapeHtml(name)} (${count})</button>`;
      }
      for (const pid of projectIds) {
        if (pid === window._currentProjectId) continue;
        const name = projects[pid]?.name || pid.substring(0, 8);
        const count = counts[pid] || 0;
        pills += `<button class="project-filter-pill ${currentFilter === pid ? "active" : ""}" data-project-filter="${pid}">${this._escapeHtml(name)} (${count})</button>`;
      }
      if (counts["__legacy__"]) {
        pills += `<button class="project-filter-pill ${currentFilter === "__legacy__" ? "active" : ""}" data-project-filter="__legacy__">${t("project.shared")} (${counts["__legacy__"]})</button>`;
      }
      return `<div class="project-filter-toolbar" id="${containerId}">${pills}</div>`;
    },
    renderGroupHeader(projectName, count, isCurrent) {
      return `<div class="project-group-header ${isCurrent ? "current" : ""}">
        <span class="project-group-name">${this._escapeHtml(projectName)}</span>
        <span class="project-group-count">(${count})</span>
        ${isCurrent ? '<span class="project-group-badge">' + (window.I18n?.t("common.current") || "current") + "</span>" : ""}
      </div>`;
    },
    renderProjectLabel(projectId, projectName, isCurrent) {
      if (!projectId && !projectName) return "";
      const name = projectName || projectId?.substring(0, 8) || "";
      return `<div class="item-project-label ${isCurrent ? "current" : ""}">${this._escapeHtml(name)}</div>`;
    },
    _escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text || "";
      return div.innerHTML;
    },
  };
  window.ProjectHelper = ProjectHelper;
})();
