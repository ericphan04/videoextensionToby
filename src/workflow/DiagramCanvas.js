function _isTempId(id) {
  if (typeof id !== "string") return false;
  if (/^upload_(?:import|admin_clone|shared_clone)_/.test(id)) return false;
  return id.startsWith("upload_");
}
function _stripTempIds(refFileIds) {
  if (typeof refFileIds !== "string" || !refFileIds) return "";
  return refFileIds
    .split(",")
    .map((s) => s.trim())
    .filter((id) => id && !_isTempId(id))
    .join(",");
}
function _stripTempIdKeys(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!_isTempId(key)) cleaned[key] = value;
  }
  return cleaned;
}
function _drawflowBindingSafeData(data) {
  if (!data || typeof data !== "object") return data;
  const safe = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === null || typeof value !== "object") safe[key] = value;
  }
  return safe;
}
class DiagramCanvas {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.editor = null;
    this.workflowId = null;
    this.zoom = 1;
    this.isTemplateMode = options.isTemplateMode || false;
    this.isReadOnly = options.isReadOnly || false;
    this.isAdminPreview = options.isAdminPreview || false;
    this._restoringEdges = false;
    this.init();
  }
  init() {
    this.render();
    this.initDrawflow();
    this.bindEvents();
    if (this.isReadOnly) {
      this.setReadOnly(true);
    }
  }
  render() {
    this.container.innerHTML = `
      <div class="diagram-container">
        <div class="diagram-canvas">
          <div id="drawflowCanvas"></div>
        </div>
        <div class="canvas-controls">
          <button class="canvas-control-btn" id="zoomInBtn" title="${window.I18n?.t("common.zoomIn") || "Zoom in"}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              <line x1="11" y1="8" x2="11" y2="14"></line>
              <line x1="8" y1="11" x2="14" y2="11"></line>
            </svg>
          </button>
          <span class="canvas-zoom-level" id="zoomLevel">100%</span>
          <button class="canvas-control-btn" id="zoomOutBtn" title="${window.I18n?.t("common.zoomOut") || "Zoom out"}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              <line x1="8" y1="11" x2="14" y2="11"></line>
            </svg>
          </button>
          <button class="canvas-control-btn" id="resetZoomBtn" title="${window.I18n?.t("common.resetZoom") || "Reset zoom"}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="1 4 1 10 7 10"></polyline>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
            </svg>
          </button>
        </div>
        <button class="diagram-recenter-btn" id="recenterBtn" title="${window.I18n?.t("workflow.recenter") || "Recenter"}">
          <svg width="15" height="15" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M64,496H184V464H64a16.019,16.019,0,0,1-16-16V328H16V448A48.054,48.054,0,0,0,64,496Z"></path><path fill="currentColor" d="M48,64A16.019,16.019,0,0,1,64,48H184V16H64A48.054,48.054,0,0,0,16,64V184H48Z"></path><path fill="currentColor" d="M448,16H328V48H448a16.019,16.019,0,0,1,16,16V184h32V64A48.054,48.054,0,0,0,448,16Z"></path><path fill="currentColor" d="M464,448a16.019,16.019,0,0,1-16,16H328v32H448a48.054,48.054,0,0,0,48-48V328H464Z"></path><path fill="currentColor" d="M400,256c0-79.4-64.6-144-144-144S112,176.6,112,256s64.6,144,144,144S400,335.4,400,256ZM256,368A112,112,0,1,1,368,256,112.127,112.127,0,0,1,256,368Z"></path></svg>
          <span>${window.I18n?.t("workflow.recenter") || "Recenter"}</span>
        </button>
        <div class="df-select-box hidden" id="dfSelectBox"></div>
        <div class="workflow-progress hidden" id="workflowProgress">
          <span class="workflow-progress-text" id="progressText">0 / 0</span>
          <div class="workflow-progress-bar">
            <div class="workflow-progress-bar-fill" id="progressFill" style="width: 0%"></div>
          </div>
        </div>
        <div class="canvas-brand-zone">
          <div class="tobyflow-header-brand">
            <div class="tobyflow-header-logo">
              <img src="icons/icon-32.png" alt="Toby Flow">
            </div>
            <span class="tobyflow-header-title">Toby Flow</span>
            <span class="tobyflow-user-plan-badge hidden" id="canvasPlanBadge" data-plan="free" title="${window.I18n?.t("settings.planBadgeTooltip") || "Plan & quota"}">Free</span>
          </div>
        </div>
      </div>
    `;
  }
  initDrawflow() {
    const canvas = this.container.querySelector("#drawflowCanvas");
    if (!canvas || typeof Drawflow === "undefined") {
      console.error("[DiagramCanvas] Drawflow not loaded");
      return;
    }
    this.editor = new Drawflow(canvas);
    const rawUpdateNodeDataFromId = this.editor.updateNodeDataFromId.bind(
      this.editor,
    );
    this.editor.updateNodeDataFromId = (nodeId, data) => {
      rawUpdateNodeDataFromId(nodeId, _drawflowBindingSafeData(data));
      const moduleName = this.editor.getModuleFromNodeId(nodeId);
      const storedNode =
        this.editor.drawflow?.drawflow?.[moduleName]?.data?.[nodeId];
      if (storedNode) storedNode.data = data;
    };
    this.editor.reroute = true;
    this.editor.curvature = 0.5;
    this.editor.reroute_curvature_start_end = 0.5;
    this.editor.reroute_curvature = 0.5;
    this.editor.force_first_input = false;
    this.editor.line_path = 5;
    this.editor.editor_mode = "edit";
    this.editor.start();
    this._initDrawflowPointerRelease();
    this.zoom = 1;
    this.editor.zoom = this.zoom;
    this.editor.zoom_refresh();
    this.updateZoomDisplay();
    Object.keys(NodeTemplates.types).forEach((type) => {
      this.editor.registerNode(
        type,
        {},
        () => {},
        () => {},
      );
    });
  }
  bindEvents() {
    const zoomInBtn = this.container.querySelector("#zoomInBtn");
    const zoomOutBtn = this.container.querySelector("#zoomOutBtn");
    const resetZoomBtn = this.container.querySelector("#resetZoomBtn");
    zoomInBtn?.addEventListener("click", () => this.zoomIn());
    zoomOutBtn?.addEventListener("click", () => this.zoomOut());
    resetZoomBtn?.addEventListener("click", () => this.resetZoom());
    this.container
      .querySelector("#recenterBtn")
      ?.addEventListener("click", () => this.recenter());
    if (this.editor) {
      this.editor.on("nodeSelected", (id) => {
        if (window.eventBus)
          window.eventBus.emit("node:selected", { nodeId: id });
      });
      this.editor.on("nodeUnselected", () => {
        if (window.eventBus) window.eventBus.emit("node:unselected");
      });
      this.editor.on("connectionCreated", (connection) => {
        try {
          this._handleConnectionCreated(connection);
        } catch (err) {
          console.error("[DiagramCanvas] connectionCreated error:", err);
        }
      });
      this.editor.on("connectionRemoved", (connection) => {
        try {
          this._syncFrameSourceOnDisconnect(connection);
        } catch (e) {
          console.warn(
            "[DiagramCanvas] frame source disconnect sync failed:",
            e,
          );
        }
        if (window.eventBus)
          window.eventBus.emit("edge:removed", { connection });
        try {
          this._validateRequiredPorts();
        } catch (e) {}
      });
      this.editor.on("nodeRemoved", (id) => {
        if (window.eventBus)
          window.eventBus.emit("node:removed", { nodeId: id });
      });
      this.editor.on("nodeCreated", (id) => {
        if (window.eventBus)
          window.eventBus.emit("node:created", { drawflowId: String(id) });
      });
      this.editor.on("nodeMoved", (id) => {
        const node = this.editor.getNodeFromId(id);
        if (window.eventBus)
          window.eventBus.emit("node:moved", {
            nodeId: id,
            pos_x: node.pos_x,
            pos_y: node.pos_y,
          });
      });
      this._selectedConnection = null;
      this.editor.on("connectionSelected", (id) => {
        this._selectedConnection = id;
        this._showConnectionDeleteBtn(id);
      });
      this.editor.on("connectionUnselected", () => {
        this._selectedConnection = null;
        this._removeConnectionDeleteBtn();
        try {
          this.container
            .querySelectorAll("svg.connection.selected")
            .forEach((s) => s.classList.remove("selected"));
        } catch (_) {}
      });
    }
    this._initNoteInteractions();
    const drawflowEl = this.container.querySelector(".drawflow");
    if (drawflowEl) {
      drawflowEl.addEventListener("click", (e) => {
        const clickedNode = e.target?.closest?.(".drawflow-node");
        const clickedConnection = e.target?.closest?.(".connection");
        const clickedPoint = e.target?.closest?.(".point");
        if (!clickedConnection) {
          try {
            this.container
              .querySelectorAll(
                "svg.connection.selected, svg.connection .main-path.selected",
              )
              .forEach((el) => el.classList.remove("selected"));
          } catch (_) {}
          if (this._selectedConnection) {
            this._selectedConnection = null;
            try {
              this._removeConnectionDeleteBtn();
            } catch (_) {}
          }
        }
        if (
          !clickedNode &&
          !clickedConnection &&
          !clickedPoint &&
          window.eventBus
        ) {
          window.eventBus.emit("node:unselected");
        }
      });
    }
    try {
      this._initMultiSelect();
    } catch (e) {
      console.warn("[DiagramCanvas] multiSelect init failed:", e);
    }
    try {
      this._initSpacePan();
    } catch (e) {
      console.warn("[DiagramCanvas] spacePan init failed:", e);
    }
    this._handleKeyDown = (e) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
          return;
        if (this.isReadOnly) return;
        if (this._selectedConnection && this.editor) {
          const conn = this._selectedConnection;
          this.editor.removeSingleConnection(
            conn.output_id,
            conn.input_id,
            conn.output_class,
            conn.input_class,
          );
          this._selectedConnection = null;
          e.preventDefault();
        }
      }
    };
    document.addEventListener("keydown", this._handleKeyDown);
    const canvasContainer =
      this.container.querySelector(".diagram-container") || this.container;
    canvasContainer.addEventListener("dblclick", (e) =>
      this._zoomIntoCanvasPoint(e, canvasContainer),
    );
    canvasContainer.addEventListener(
      "wheel",
      (e) => {
        if (!this.editor) return;
        if (
          e.target.closest(
            "input, textarea, select, .df-node-inline-dropdown, .tobyflow-node-picker",
          )
        )
          return;
        e.preventDefault();
        e.stopPropagation();
        const isPinch = e.ctrlKey || e.metaKey;
        const isTrackpadSwipe =
          !isPinch &&
          (Math.abs(e.deltaX) > 0 ||
            (e.deltaMode === 0 && Math.abs(e.deltaY) < 50));
        if (isPinch) {
          const rect = canvasContainer.getBoundingClientRect();
          const cx = e.clientX - rect.left;
          const cy = e.clientY - rect.top;
          const oldZoom = this.zoom || this.editor.zoom || 1;
          const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
          const newZoom = Math.max(0.1, Math.min(2, oldZoom * factor));
          const canvasX = this.editor.canvas_x || 0;
          const canvasY = this.editor.canvas_y || 0;
          const worldX = (cx - canvasX) / oldZoom;
          const worldY = (cy - canvasY) / oldZoom;
          const newCanvasX = cx - worldX * newZoom;
          const newCanvasY = cy - worldY * newZoom;
          this._applyZoomAndPan(newZoom, newCanvasX, newCanvasY);
        } else if (isTrackpadSwipe || Math.abs(e.deltaX) > 0) {
          const canvasX = (this.editor.canvas_x || 0) - e.deltaX;
          const canvasY = (this.editor.canvas_y || 0) - e.deltaY;
          this._applyZoomAndPan(
            this.zoom || this.editor.zoom || 1,
            canvasX,
            canvasY,
          );
        } else {
          const rect = canvasContainer.getBoundingClientRect();
          const cx = e.clientX - rect.left;
          const cy = e.clientY - rect.top;
          const oldZoom = this.zoom || this.editor.zoom || 1;
          const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
          const newZoom = Math.max(0.1, Math.min(2, oldZoom * factor));
          const canvasX = this.editor.canvas_x || 0;
          const canvasY = this.editor.canvas_y || 0;
          const worldX = (cx - canvasX) / oldZoom;
          const worldY = (cy - canvasY) / oldZoom;
          const newCanvasX = cx - worldX * newZoom;
          const newCanvasY = cy - worldY * newZoom;
          this._applyZoomAndPan(newZoom, newCanvasX, newCanvasY);
        }
      },
      { passive: false },
    );
    canvasContainer.addEventListener(
      "mousedown",
      (e) => {
        if (e.button === 2) {
          this._finishDrawflowInteraction();
          e.stopPropagation();
        }
      },
      true,
    );
    canvasContainer.addEventListener("contextmenu", (e) => {
      this._finishDrawflowInteraction();
      if (this.isReadOnly) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const nodeEl = e.target.closest(".drawflow-node");
      if (nodeEl) {
        e.preventDefault();
        e.stopPropagation();
        const nodeId = nodeEl.id.replace("node-", "");
        this._showNodeContextMenu(e.clientX, e.clientY, nodeId);
        return;
      }
      const pathEl = e.target.closest("svg.connection .main-path");
      if (pathEl) {
        e.preventDefault();
        e.stopPropagation();
        const svgConn = pathEl.closest("svg.connection");
        if (svgConn) {
          const classes = Array.from(svgConn.classList);
          const inMatch = classes.find((c) => c.startsWith("node_in_node-"));
          const outMatch = classes.find((c) => c.startsWith("node_out_node-"));
          const outClass = classes.find((c) => /^output_\d+$/.test(c));
          const inClass = classes.find((c) => /^input_\d+$/.test(c));
          if (inMatch && outMatch && outClass && inClass) {
            const conn = {
              input_id: inMatch.replace("node_in_node-", ""),
              output_id: outMatch.replace("node_out_node-", ""),
              output_class: outClass,
              input_class: inClass,
            };
            this.container
              .querySelectorAll("svg.connection.selected")
              .forEach((s) => s.classList.remove("selected"));
            svgConn.classList.add("selected");
            this._selectedConnection = conn;
            this._showConnectionContextMenu(e.clientX, e.clientY, conn);
          }
        }
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const rect = canvasContainer.getBoundingClientRect();
      const zoom = this.zoom || this.editor?.zoom || 1;
      const panX = this.editor?.canvas_x || 0;
      const panY = this.editor?.canvas_y || 0;
      const pixelX = e.clientX - rect.left;
      const pixelY = e.clientY - rect.top;
      window.eventBus?.emit("canvas:contextmenu", {
        clientX: e.clientX,
        clientY: e.clientY,
        canvasX: (pixelX - panX) / zoom,
        canvasY: (pixelY - panY) / zoom,
      });
    });
    document.addEventListener("click", () => this._hideNodeContextMenu());
    const canvas = this.container.querySelector("#drawflowCanvas");
    if (canvas) {
      canvas.addEventListener("click", (e) => {
        if (this.isReadOnly) return;
        const hoverBtn = e.target.closest(".df-hover-btn, .df-node-run-corner");
        if (hoverBtn) {
          e.stopPropagation();
          const action = hoverBtn.dataset.action;
          const nodeEl2 = hoverBtn.closest(".drawflow-node");
          if (!nodeEl2) return;
          const nodeId2 = nodeEl2.id.replace("node-", "");
          this._dispatchNodeAction(action, nodeId2);
          return;
        }
        const promptModeBtn = e.target.closest(
          '[data-action="toggle-prompt-multi"]',
        );
        if (promptModeBtn) {
          e.stopPropagation();
          e.preventDefault();
          const nodeEl2 = promptModeBtn.closest(".drawflow-node");
          if (!nodeEl2) return;
          this._dispatchNodeAction(
            "toggle-prompt-multi",
            nodeEl2.id.replace("node-", ""),
          );
          return;
        }
        const renameBtn = e.target.closest(".df-node-rename-btn");
        if (renameBtn) {
          e.stopPropagation();
          e.preventDefault();
          const nodeEl2 = renameBtn.closest(".drawflow-node");
          if (nodeEl2) this._startNodeRename(nodeEl2);
          return;
        }
        const headerZone = e.target.closest(".df-node-header");
        if (
          headerZone &&
          !this.isReadOnly &&
          !e.target.closest(
            ".df-node-rename-btn, .df-node-toggle, .df-node-slug-badge, .df-node-icon, .df-node-zoom-toggle, .df-node-provider-pill, .df-node-saved-badge, .df-hover-toolbar",
          )
        ) {
          const titleTextEl = headerZone.querySelector(".df-node-title-text");
          if (
            titleTextEl &&
            titleTextEl.getAttribute("contenteditable") !== "true"
          ) {
            const nodeEl2 = headerZone.closest(".drawflow-node");
            if (nodeEl2) {
              e.stopPropagation();
              e.preventDefault();
              this._startNodeRename(nodeEl2);
              return;
            }
          }
        }
        const zoomBtn = e.target.closest(".df-node-zoom-toggle");
        if (zoomBtn) {
          e.stopPropagation();
          e.preventDefault();
          const nodeEl2 = zoomBtn.closest(".drawflow-node");
          if (nodeEl2) this._toggleNodeZoom(nodeEl2);
          return;
        }
        const toggleBtn = e.target.closest(".df-node-toggle");
        if (!toggleBtn) return;
        e.stopPropagation();
        e.preventDefault();
        const nodeEl = toggleBtn.closest(".drawflow-node");
        if (!nodeEl) return;
        const nodeId = nodeEl.id.replace("node-", "");
        const node = this.editor.getNodeFromId(nodeId);
        if (!node) return;
        const newEnabled = node.data.enabled === false;
        node.data.enabled = newEnabled;
        this.editor.updateNodeDataFromId(nodeId, node.data);
        const dfNode = nodeEl.querySelector(".df-node");
        if (dfNode) {
          dfNode.classList.toggle("df-node-disabled", !newEnabled);
          dfNode.dataset.enabled = String(newEnabled);
        }
        toggleBtn.classList.toggle("on", newEnabled);
        toggleBtn.classList.toggle("off", !newEnabled);
        toggleBtn.title = newEnabled
          ? window.I18n?.t("node.disableNode") || "Disable node"
          : window.I18n?.t("node.enableNode") || "Enable node";
        if (window.eventBus) {
          window.eventBus.emit("node:toggled", { nodeId, enabled: newEnabled });
        }
      });
      canvas.addEventListener(
        "click",
        (e) => {
          if (!e.altKey) return;
          if (this.isReadOnly) return;
          const nodeEl = e.target.closest(".drawflow-node");
          if (!nodeEl) return;
          const nodeId = nodeEl.id.replace("node-", "");
          const node = this.editor?.getNodeFromId(nodeId);
          const slug = node?.data?.slug;
          if (!slug) {
            return;
          }
          const activeTextarea = document.activeElement;
          if (!activeTextarea || activeTextarea.tagName !== "TEXTAREA") {
            const atSlug2 = `@${slug}`;
            navigator.clipboard?.writeText(atSlug2).then(() => {
              console.log(
                `[DiagramCanvas] Alt+Click: Copied ${atSlug2} to clipboard`,
              );
              if (window.eventBus) {
                window.eventBus.emit("toast:show", {
                  message:
                    window.I18n?.t("workflow.slugCopied", { slug: atSlug2 }) ||
                    `${atSlug2} copied`,
                  type: "success",
                });
              }
            });
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          const atSlug = `@${slug} `;
          const cursorPos = activeTextarea.selectionStart;
          const text = activeTextarea.value;
          const newText =
            text.substring(0, cursorPos) + atSlug + text.substring(cursorPos);
          activeTextarea.value = newText;
          activeTextarea.selectionStart = activeTextarea.selectionEnd =
            cursorPos + atSlug.length;
          activeTextarea.dispatchEvent(new Event("input", { bubbles: true }));
          activeTextarea.focus();
          console.log(
            `[DiagramCanvas] Alt+Click: Inserted ${atSlug.trim()} at position ${cursorPos}`,
          );
        },
        true,
      );
    }
  }
  addNode(type, posX = 100, posY = 100, data = {}, options = {}) {
    if (!this.editor) return null;
    if (!options.skipQuotaCheck) {
      const exportData = this.editor.export();
      const currentNodeCount = Object.keys(
        exportData.drawflow?.Home?.data || {},
      ).length;
      if (
        window.featureGate &&
        !window.featureGate.canAddNode(currentNodeCount)
      ) {
        const isLoggedIn = window.authManager?.isLoggedIn();
        if (!isLoggedIn) {
          window.featureGate.showLoginPrompt(
            window.I18n?.t("node.trialNodeLimit", {
              limit: window.featureGate.getConfig().workflows_max_node,
            }) ||
              `B\u1EA3n d\xF9ng th\u1EED gi\u1EDBi h\u1EA1n t\u1ED1i \u0111a ${window.featureGate.getConfig().workflows_max_node} node m\u1ED7i workflow.`,
          );
        } else {
          const quota = window.featureGate.checkQuota("workflows_nodes_max");
          const dialog = window.customDialog || window.CustomDialog;
          if (dialog) {
            dialog
              .confirm(
                window.I18n?.t("node.nodeQuotaExhausted", {
                  limit: quota.limit,
                }) ||
                  `Your plan is limited to ${quota.limit} nodes per workflow. Upgrade to Premium for unlimited nodes.`,
                {
                  title:
                    window.I18n?.t("workflow.quotaReached") || "Limit reached",
                  type: "warning",
                  confirmText: window.I18n?.t("common.upgrade") || "Upgrade",
                  cancelText: window.I18n?.t("common.cancel") || "Cancel",
                },
              )
              .then((shouldUpgrade) => {
                if (shouldUpgrade) {
                  if (typeof window.openUpgradeModal === "function") {
                    window.openUpgradeModal();
                  } else {
                    chrome.runtime.sendMessage({ action: "showUpgradeModal" });
                  }
                }
              });
          }
        }
        return null;
      }
    }
    const config = NodeTemplates.getType(type) || NodeTemplates.types.generate;
    if (!data.node_id) {
      data.node_id = window.IdGenerator
        ? window.IdGenerator.next("node")
        : `node_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    }
    const ports =
      typeof NodeTemplates.getNodePorts === "function"
        ? NodeTemplates.getNodePorts(type, data)
        : { in: [], out: [] };
    const inputs = ports.in.length || (config.inputs ?? 0);
    const outputs = ports.out.length || (config.outputs ?? 0);
    const portMap = { ...(data._port_map || {}) };
    ports.in.forEach((p, idx) => {
      portMap[`input_${idx + 1}`] = p.name;
    });
    ports.out.forEach((p, idx) => {
      portMap[`output_${idx + 1}`] = p.name;
    });
    const dataWithPortMap = {
      ...data,
      _port_map: portMap,
      node_type: data.node_type || type,
    };
    const html = NodeTemplates.createNodeHTML(type, dataWithPortMap);
    const drawflowId = this.editor.addNode(
      type,
      inputs,
      outputs,
      posX,
      posY,
      type,
      _drawflowBindingSafeData(dataWithPortMap),
      html,
    );
    if (drawflowId == null) {
      console.error("[DiagramCanvas] addNode failed for", data.node_id);
      return null;
    }
    const storedNode =
      this.editor.drawflow?.drawflow?.[this.editor.module || "Home"]?.data?.[
        drawflowId
      ];
    if (storedNode) storedNode.data = dataWithPortMap;
    if (!this._idMap) this._idMap = new Map();
    this._idMap.set(String(drawflowId), data.node_id);
    requestAnimationFrame(() => {
      try {
        this._injectPortAttributes(drawflowId, ports);
      } catch (e) {
        console.warn(
          "[DiagramCanvas] _injectPortAttributes failed:",
          e.message,
        );
      }
    });
    return drawflowId;
  }
  updateNodeData(nodeId, data) {
    if (!this.editor) return;
    const node = this.editor.getNodeFromId(nodeId);
    if (node) {
      const mergedData = { ...node.data, ...data };
      this.editor.updateNodeDataFromId(nodeId, mergedData);
      const renderType = mergedData.node_type || node.class;
      const html = NodeTemplates.createNodeHTML(renderType, mergedData);
      this.editor.drawflow.drawflow.Home.data[nodeId].html = html;
      const element = document.querySelector(
        `#node-${nodeId} .drawflow_content_node`,
      );
      if (element) {
        element.innerHTML = html;
      }
    }
  }
  removeNode(nodeId) {
    if (!this.editor) return;
    const actualId = this.editor.getNodeFromId(nodeId)?.data?.node_id;
    if (window.workflowExecutor?.isSingleNodeActive?.(actualId)) return;
    this.editor.removeNodeId(`node-${nodeId}`);
  }
  removeMultipleNodes(nodeIds) {
    if (!this.editor || !Array.isArray(nodeIds) || nodeIds.length === 0) {
      return { deleted: 0, skippedStart: 0 };
    }
    const mod = this.editor.module || "Home";
    let deleted = 0;
    let skippedStart = 0;
    for (const id of nodeIds) {
      try {
        const nd = this.editor.drawflow?.drawflow?.[mod]?.data?.[id];
        if (nd?.data?.node_type === "start" || nd?.class === "start") {
          skippedStart++;
          continue;
        }
        this.editor.removeNodeId(`node-${id}`);
        deleted++;
      } catch (err) {
        console.warn(
          "[DiagramCanvas] removeMultipleNodes: skip id",
          id,
          err?.message,
        );
      }
    }
    try {
      this._clearMultiSelect();
    } catch (_) {}
    return { deleted, skippedStart };
  }
  clear() {
    if (!this.editor) return;
    if (this._idMap) this._idMap.clear();
    this.editor.clear();
  }
  loadWorkflow(workflow) {
    if (!this.editor) return;
    this._loadCancelToken = (this._loadCancelToken || 0) + 1;
    const currentToken = this._loadCancelToken;
    this.clear();
    this.workflowId = workflow.wf_id;
    const nodes = workflow.nodes || [];
    const edges = workflow.edges || [];
    const allSamePos =
      nodes.length > 1 &&
      nodes.every(
        (n) =>
          (n.pos_x ?? 100) === (nodes[0].pos_x ?? 100) &&
          (n.pos_y ?? 100) === (nodes[0].pos_y ?? 100),
      );
    const nodeIdMap = new Map();
    const BATCH_SIZE = 20;
    const addNodesSync = () => {
      console.log(
        "[DiagramCanvas] loadWorkflow: Loading nodes with IDs:",
        nodes.map((n) => ({
          node_id: n.node_id,
          node_type: n.node_type,
          node_name: n.node_name,
        })),
      );
      nodes.forEach((node, index) => {
        let posX = node.pos_x ?? 100;
        let posY = node.pos_y ?? 100;
        if (allSamePos) {
          posX = 100 + (index % 3) * 350;
          posY = 100 + Math.floor(index / 3) * 250;
        }
        let nodeType = node.node_type;
        if (!nodeType) {
          console.warn(
            `[DiagramCanvas] loadWorkflow: Node ${node.node_id} (name: "${node.node_name}") missing node_type, fallback to 'generate'. This may indicate data corruption.`,
          );
          nodeType = "generate";
        }
        const nodeDataWithType = { ...node, node_type: nodeType };
        try {
          NodeTemplates.normalizeNodeData?.(nodeDataWithType, {
            preferUserModel: !this.isTemplateMode && !this.isReadOnly,
          });
        } catch (_) {}
        const drawflowId = this.addNode(
          nodeType,
          posX,
          posY,
          nodeDataWithType,
          { skipQuotaCheck: true },
        );
        nodeIdMap.set(node.node_id, drawflowId);
        console.log(
          `[DiagramCanvas] loadWorkflow: Added node ${node.node_id} (${nodeType}) as drawflowId=${drawflowId}`,
        );
      });
    };
    if (nodes.length > 100) {
      console.warn(
        `[DiagramCanvas] Large workflow with ${nodes.length} nodes - consider performance impact`,
      );
    }
    addNodesSync();
    let migratedCount = 0;
    const addEdges = () => {
      if (this._loadCancelToken !== currentToken) {
        console.log(
          "[DiagramCanvas] Edge loading cancelled - newer workflow loading",
        );
        return;
      }
      this._restoringEdges = true;
      try {
        edges.forEach((edge) => {
          const sourceId = nodeIdMap.get(edge.source_node_id);
          const targetId = nodeIdMap.get(edge.target_node_id);
          if (!sourceId || !targetId) {
            console.warn(
              "[DiagramCanvas] Edge skipped - node not found:",
              edge.edge_id,
              "source:",
              edge.source_node_id,
              "->",
              sourceId,
              "target:",
              edge.target_node_id,
              "->",
              targetId,
            );
            return;
          }
          const sourceNodeData = nodes.find(
            (n) => n.node_id === edge.source_node_id,
          );
          const targetNodeData = nodes.find(
            (n) => n.node_id === edge.target_node_id,
          );
          const wasLegacy =
            !edge.source_port ||
            edge.source_port === "default" ||
            !edge.target_port ||
            edge.target_port === "default";
          if (wasLegacy) {
            const inferred = this._inferEdgePortsFromLegacy(
              edge,
              sourceNodeData,
              targetNodeData,
            );
            if (
              inferred &&
              (inferred.source_port !== edge.source_port ||
                inferred.target_port !== edge.target_port)
            ) {
              edge.source_port = inferred.source_port;
              edge.target_port = inferred.target_port;
              if (inferred.source_port && inferred.source_port !== "default")
                migratedCount++;
            }
          }
          let outputClass = edge.source_handle || "output_1";
          let inputClass = edge.target_handle || "input_1";
          const sourceNode = this.editor.getNodeFromId(sourceId);
          const targetNode = this.editor.getNodeFromId(targetId);
          let sourcePortName = edge.source_port || "default";
          const targetPortName = edge.target_port || "default";
          if (
            sourcePortName === "last_frame" ||
            sourcePortName === "frame_out"
          ) {
            const mappedValues = Object.values(
              sourceNode?.data?._port_map || {},
            );
            if (mappedValues.includes("frame")) sourcePortName = "frame";
            else if (mappedValues.includes("last_frame"))
              sourcePortName = "last_frame";
            edge.source_port = sourcePortName;
          }
          if (sourceNode?.data?._port_map && sourcePortName !== "default") {
            const entry = Object.entries(sourceNode.data._port_map).find(
              ([k, v]) => v === sourcePortName && k.startsWith("output_"),
            );
            if (entry) outputClass = entry[0];
          }
          if (targetNode?.data?._port_map && targetPortName !== "default") {
            const entry = Object.entries(targetNode.data._port_map).find(
              ([k, v]) => v === targetPortName && k.startsWith("input_"),
            );
            if (entry) inputClass = entry[0];
          }
          if (!sourceNode?.outputs?.[outputClass]) {
            console.warn(
              "[DiagramCanvas] Skip edge \u2014 source output missing:",
              edge.edge_id,
              `node=${sourceId}`,
              `port=${outputClass}`,
              `available=${Object.keys(sourceNode?.outputs || {}).join(",") || "(none)"}`,
            );
            return;
          }
          if (!targetNode?.inputs?.[inputClass]) {
            console.warn(
              "[DiagramCanvas] Skip edge \u2014 target input missing:",
              edge.edge_id,
              `node=${targetId}`,
              `port=${inputClass}`,
              `available=${Object.keys(targetNode?.inputs || {}).join(",") || "(none)"}`,
            );
            return;
          }
          try {
            this.editor.addConnection(
              sourceId,
              targetId,
              outputClass,
              inputClass,
            );
          } catch (e) {
            console.warn(
              "[DiagramCanvas] Connection failed:",
              edge.edge_id,
              e.message || e,
            );
          }
        });
      } finally {
        this._restoringEdges = false;
      }
      if (migratedCount > 0) {
        console.log(
          `[DiagramCanvas] Auto-migrated ${migratedCount} legacy edges to typed ports`,
        );
        try {
          window.eventBus?.emit("workflow:edges_migrated", {
            count: migratedCount,
          });
        } catch (e) {}
      }
    };
    try {
      addEdges();
    } catch (e) {
      console.warn("[DiagramCanvas] Retrying edges after frame...");
      requestAnimationFrame(addEdges);
    }
    requestAnimationFrame(() => {
      try {
        this._reinjectAllPortAttributes();
      } catch (e) {}
      try {
        this._recolorAllEdges();
      } catch (e) {}
      try {
        this._validateRequiredPorts();
      } catch (e) {}
      this._forceUpdateAllConnections();
      setTimeout(() => {
        try {
          this.fitToScreen();
        } catch (e) {}
        this._forceUpdateAllConnections();
      }, 200);
      setTimeout(() => {
        try {
          this.fitToScreen();
        } catch (e) {}
        this._forceUpdateAllConnections();
        if (this.isReadOnly) {
          this.setReadOnly(true);
        }
      }, 600);
    });
  }
  _forceUpdateAllConnections() {
    if (!this.editor) return;
    try {
      const data =
        this.editor.drawflow?.drawflow?.[this.editor.module || "Home"]?.data ||
        {};
      Object.keys(data).forEach((id) => {
        try {
          this.editor.updateConnectionNodes(`node-${id}`);
        } catch (e) {}
      });
    } catch (e) {}
  }
  _reinjectAllPortAttributes() {
    if (!this.editor) return;
    const moduleName = this.editor.module || "Home";
    const nodes = this.editor.drawflow?.drawflow?.[moduleName]?.data || {};
    for (const [drawflowId, nodeInfo] of Object.entries(nodes)) {
      const type = nodeInfo.data?.node_type || nodeInfo.class;
      const normalizedData = { ...(nodeInfo.data || {}), node_type: type };
      try {
        window.NodeTemplates?.normalizeNodeData?.(normalizedData);
      } catch (_) {}
      const ports = window.NodeTemplates?.getNodePorts?.(
        type,
        normalizedData,
      ) || { in: [], out: [] };
      this.editor.updateNodeDataFromId(drawflowId, normalizedData);
      this._resizeNodePorts(drawflowId, ports);
      this._injectPortAttributes(drawflowId, ports);
    }
  }
  _inferEdgePortsFromLegacy(edge, sourceNode, targetNode) {
    if (!edge) return null;
    const hasSourcePort = edge.source_port && edge.source_port !== "default";
    const hasTargetPort = edge.target_port && edge.target_port !== "default";
    if (hasSourcePort && hasTargetPort) return null;
    if (!sourceNode || !targetNode) {
      return { source_port: "default", target_port: "default" };
    }
    const sourceType = sourceNode?.node_type || sourceNode?.type;
    const targetType = targetNode?.node_type || targetNode?.type;
    const getPorts =
      typeof NodeTemplates !== "undefined" &&
      typeof NodeTemplates.getNodePorts === "function"
        ? NodeTemplates.getNodePorts.bind(NodeTemplates)
        : null;
    if (!getPorts) return null;
    const sourcePorts = sourceType
      ? getPorts(sourceType, sourceNode) || { in: [], out: [] }
      : { in: [], out: [] };
    const targetPorts = targetType
      ? getPorts(targetType, targetNode) || { in: [], out: [] }
      : { in: [], out: [] };
    const newSourcePort = hasSourcePort
      ? edge.source_port
      : sourcePorts.out?.[0]?.name || "default";
    let newTargetPort = hasTargetPort ? edge.target_port : null;
    if (!newTargetPort) {
      const sourcePortObj =
        sourcePorts.out?.find((p) => p.name === newSourcePort) ||
        sourcePorts.out?.[0];
      const sourceType_ = sourcePortObj?.type;
      if (sourceType_ && targetPorts.in?.length > 0) {
        const typeMatched = targetPorts.in.find((p) => p.type === sourceType_);
        newTargetPort = typeMatched?.name || targetPorts.in[0].name;
      } else {
        newTargetPort = targetPorts.in?.[0]?.name || "default";
      }
    }
    return { source_port: newSourcePort, target_port: newTargetPort };
  }
  _resizeNodePorts(drawflowId, newPorts) {
    if (!this.editor || !drawflowId || !newPorts) return;
    const node = this.editor.getNodeFromId(drawflowId);
    if (!node) return;
    const targetIn = (newPorts.in || []).length;
    const targetOut = (newPorts.out || []).length;
    let currentIn = Object.keys(node.inputs || {}).length;
    let currentOut = Object.keys(node.outputs || {}).length;
    this._suppressFrameSyncOnResize = true;
    try {
      while (currentIn < targetIn) {
        this.editor.addNodeInput(drawflowId);
        currentIn++;
      }
      while (currentIn > targetIn) {
        this.editor.removeNodeInput(drawflowId, `input_${currentIn}`);
        currentIn--;
      }
      while (currentOut < targetOut) {
        this.editor.addNodeOutput(drawflowId);
        currentOut++;
      }
      while (currentOut > targetOut) {
        this.editor.removeNodeOutput(drawflowId, `output_${currentOut}`);
        currentOut--;
      }
      const portMap = {};
      (newPorts.in || []).forEach((p, idx) => {
        portMap[`input_${idx + 1}`] = p.name;
      });
      (newPorts.out || []).forEach((p, idx) => {
        portMap[`output_${idx + 1}`] = p.name;
      });
      const newData = { ...(node.data || {}), _port_map: portMap };
      this.editor.updateNodeDataFromId(drawflowId, newData);
      try {
        this.editor.updateConnectionNodes(`node-${drawflowId}`);
      } catch (e) {}
    } catch (err) {
      console.warn("[DiagramCanvas] _resizeNodePorts failed:", err.message);
    } finally {
      this._suppressFrameSyncOnResize = false;
    }
  }
  _injectPortAttributes(drawflowId, ports) {
    if (!ports || (!ports.in?.length && !ports.out?.length)) return;
    const nodeEl = document.querySelector(`#node-${drawflowId}`);
    if (!nodeEl) return;
    const PORT_ICONS = {
      text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
      image:
        '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M6.25 1.5H3.9C3.05992 1.5 2.63988 1.5 2.31901 1.66349C2.03677 1.8073 1.8073 2.03677 1.66349 2.31901C1.5 2.63988 1.5 3.05992 1.5 3.9V8.1C1.5 8.94008 1.5 9.36012 1.66349 9.68099C1.8073 9.96323 2.03677 10.1927 2.31901 10.3365C2.63988 10.5 3.05992 10.5 3.9 10.5H8.5C8.96499 10.5 9.19748 10.5 9.38823 10.4489C9.90587 10.3102 10.3102 9.90587 10.4489 9.38823C10.5 9.19748 10.5 8.96499 10.5 8.5M9.5 4V1M8 2.5H11M5.25 4.25C5.25 4.80228 4.80228 5.25 4.25 5.25C3.69772 5.25 3.25 4.80228 3.25 4.25C3.25 3.69772 3.69772 3.25 4.25 3.25C4.80228 3.25 5.25 3.69772 5.25 4.25ZM7.49502 5.95907L3.26557 9.80402C3.02768 10.0203 2.90873 10.1284 2.89821 10.2221C2.88909 10.3033 2.92023 10.3838 2.98159 10.4378C3.05239 10.5 3.21314 10.5 3.53464 10.5H8.22799C8.94757 10.5 9.30736 10.5 9.58996 10.3791C9.94472 10.2274 10.2274 9.94472 10.3791 9.58996C10.5 9.30736 10.5 8.94757 10.5 8.22799C10.5 7.98587 10.5 7.86482 10.4735 7.75208C10.4403 7.61039 10.3765 7.47768 10.2866 7.3632C10.2151 7.2721 10.1206 7.19647 9.93154 7.04523L8.53291 5.92633C8.34369 5.77495 8.24908 5.69927 8.1449 5.67256C8.05307 5.64901 7.95643 5.65206 7.86627 5.68135C7.76397 5.71457 7.67432 5.79607 7.49502 5.95907Z"/></svg>',
      image_in:
        '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M6.25 1.5H3.9C3.05992 1.5 2.63988 1.5 2.31901 1.66349C2.03677 1.8073 1.8073 2.03677 1.66349 2.31901C1.5 2.63988 1.5 3.05992 1.5 3.9V8.1C1.5 8.94008 1.5 9.36012 1.66349 9.68099C1.8073 9.96323 2.03677 10.1927 2.31901 10.3365C2.63988 10.5 3.05992 10.5 3.9 10.5H8.5C8.96499 10.5 9.19748 10.5 9.38823 10.4489C9.90587 10.3102 10.3102 9.90587 10.4489 9.38823C10.5 9.19748 10.5 8.96499 10.5 8.5M9.5 4V1M8 2.5H11M5.25 4.25C5.25 4.80228 4.80228 5.25 4.25 5.25C3.69772 5.25 3.25 4.80228 3.25 4.25C3.25 3.69772 3.69772 3.25 4.25 3.25C4.80228 3.25 5.25 3.69772 5.25 4.25ZM7.49502 5.95907L3.26557 9.80402C3.02768 10.0203 2.90873 10.1284 2.89821 10.2221C2.88909 10.3033 2.92023 10.3838 2.98159 10.4378C3.05239 10.5 3.21314 10.5 3.53464 10.5H8.22799C8.94757 10.5 9.30736 10.5 9.58996 10.3791C9.94472 10.2274 10.2274 9.94472 10.3791 9.58996C10.5 9.30736 10.5 8.94757 10.5 8.22799C10.5 7.98587 10.5 7.86482 10.4735 7.75208C10.4403 7.61039 10.3765 7.47768 10.2866 7.3632C10.2151 7.2721 10.1206 7.19647 9.93154 7.04523L8.53291 5.92633C8.34369 5.77495 8.24908 5.69927 8.1449 5.67256C8.05307 5.64901 7.95643 5.65206 7.86627 5.68135C7.76397 5.71457 7.67432 5.79607 7.49502 5.95907Z"></path></svg>',
      video:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>',
      frame:
        '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v2h2V5H4zm0 4v2h2V9H4zm0 4v2h2v-2H4zm0 4v2h2v-2H4zm14-12v2h2V5h-2zm0 4v2h2V9h-2zm0 4v2h2v-2h-2zm0 4v2h2v-2h-2zM7 6v12h10V6H7z"/></svg>',
      frame_1:
        '<svg viewBox="0 0 11 10" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7.5L8.9 7.5C9.46005 7.5 9.74008 7.5 9.95399 7.39101C10.1422 7.29513 10.2951 7.14215 10.391 6.95399C10.5 6.74008 10.5 6.46005 10.5 5.9V4.1C10.5 3.53995 10.5 3.25992 10.391 3.04601C10.2951 2.85785 10.1422 2.70487 9.95399 2.60899C9.74008 2.5 9.46005 2.5 8.9 2.5L5 2.5M3 7.5H2.1C1.53995 7.5 1.25992 7.5 1.04601 7.39101C0.857847 7.29513 0.704867 7.14215 0.608994 6.95399C0.5 6.74008 0.5 6.46005 0.5 5.9V4.1C0.5 3.53995 0.5 3.25992 0.608994 3.04601C0.704867 2.85785 0.857847 2.70487 1.04601 2.60899C1.25992 2.5 1.53995 2.5 2.1 2.5H3M3 0.5L3 9.5M1.75 9.5L4.25 9.5M1.75 0.499996L4.25 0.5"/></svg>',
      frame_2:
        '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 3.5H2.6C2.03995 3.5 1.75992 3.5 1.54601 3.60899C1.35785 3.70487 1.20487 3.85785 1.10899 4.04601C1 4.25992 1 4.53995 1 5.1V6.9C1 7.46005 1 7.74008 1.10899 7.95399C1.20487 8.14215 1.35785 8.29513 1.54601 8.39101C1.75992 8.5 2.03995 8.5 2.6 8.5H6.5M8.5 3.5H9.4C9.96005 3.5 10.2401 3.5 10.454 3.60899C10.6422 3.70487 10.7951 3.85785 10.891 4.04601C11 4.25992 11 4.53995 11 5.1V6.9C11 7.46005 11 7.74008 10.891 7.95399C10.7951 8.14215 10.6422 8.29513 10.454 8.39101C10.2401 8.5 9.96005 8.5 9.4 8.5H8.5M8.5 10.5L8.5 1.5M9.75 1.5L7.25 1.5M9.75 10.5L7.25 10.5"/></svg>',
      any: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>',
    };
    const applyPort = (portEl, port, side) => {
      if (!portEl) return;
      portEl.setAttribute("data-port-type", port.type);
      portEl.setAttribute("data-port-name", port.name);
      portEl.setAttribute("data-port-side", side);
      if (port.required) portEl.setAttribute("data-port-required", "true");
      if (port.label)
        portEl.setAttribute("title", `${port.label} (${port.type})`);
      let iconKey =
        port.type === "frame" && PORT_ICONS[port.name] ? port.name : port.type;
      if (port.type === "image" && side === "in") iconKey = "image_in";
      else if (port.type === "image" && side === "out" && port.name === "frame")
        iconKey = "frame_2";
      const iconHtml = PORT_ICONS[iconKey] || PORT_ICONS.any;
      let wrap = portEl.querySelector(".df-port-icon");
      if (!wrap) {
        wrap = document.createElement("span");
        wrap.className = "df-port-icon";
        wrap.style.pointerEvents = "none";
        portEl.appendChild(wrap);
      }
      if (wrap.dataset.iconType !== iconKey) {
        wrap.innerHTML = iconHtml;
        wrap.dataset.iconType = iconKey;
      }
      portEl.setAttribute("data-port-label", port.label || port.name);
    };
    (ports.in || []).forEach((port, idx) => {
      const inputEl = nodeEl.querySelector(`.input.input_${idx + 1}`);
      applyPort(inputEl, port, "in");
    });
    (ports.out || []).forEach((port, idx) => {
      const outputEl = nodeEl.querySelector(`.output.output_${idx + 1}`);
      applyPort(outputEl, port, "out");
    });
  }
  _recolorAllEdges() {
    if (!this.editor) return;
    const data = this.editor.export();
    const nodes = data?.drawflow?.Home?.data || {};
    for (const [drawflowId, nodeInfo] of Object.entries(nodes)) {
      const outputs = nodeInfo.outputs || {};
      const sourceType = nodeInfo.class;
      const sourcePorts =
        typeof NodeTemplates?.getNodePorts === "function"
          ? NodeTemplates.getNodePorts(sourceType, nodeInfo.data)
          : { out: [] };
      Object.entries(outputs).forEach(([outputClass, outInfo]) => {
        const portMap = nodeInfo.data?._port_map || {};
        const portName = portMap[outputClass];
        const portInfo = portName
          ? sourcePorts.out.find((p) => p.name === portName)
          : null;
        if (!portInfo) return;
        (outInfo.connections || []).forEach((conn) => {
          this._colorEdgeByType(
            {
              output_id: drawflowId,
              input_id: conn.node,
              output_class: outputClass,
              input_class: conn.output,
            },
            portInfo.type,
          );
        });
      });
    }
  }
  static _copyWorkflowValue(value) {
    if (value == null || typeof value !== "object") return value;
    if (Array.isArray(value))
      return value.map((item) => DiagramCanvas._copyWorkflowValue(item));
    if (typeof value.toJSON === "function")
      return DiagramCanvas._copyWorkflowValue(value.toJSON());
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        DiagramCanvas._copyWorkflowValue(item),
      ]),
    );
  }
  exportWorkflow({ preserveMissingGenerateModel = false } = {}) {
    if (!this.editor) return { nodes: [], edges: [] };
    const homeData =
      this.editor.drawflow?.drawflow?.Home?.data ||
      this.editor.export()?.drawflow?.Home?.data ||
      {};
    const nodes = [];
    const edges = [];
    Object.entries(homeData).forEach(([id, node]) => {
      const d = node.data || {};
      const actualNodeType = d.node_type || node.class;
      const fallbackName =
        window.NodeTemplates?.getType?.(actualNodeType)?.name || actualNodeType;
      const nodeData = {
        node_id: d.node_id || `node_${id}`,
        node_type: d.node_type || node.class,
        node_name: d.node_name || fallbackName,
        pos_x: node.pos_x,
        pos_y: node.pos_y,
        prompt: d.prompt || "",
        media_type: d.media_type || "Image",
        model:
          d.model ||
          (actualNodeType === "generate" && preserveMissingGenerateModel
            ? null
            : actualNodeType === "grok"
              ? window.ModelRegistry?.safeGetDefault(
                  "grok",
                  String(
                    d.grok_mode || d.media_type || "image",
                  ).toLowerCase() === "video"
                    ? "video"
                    : "image",
                ) || null
              : actualNodeType === "chatgpt"
                ? window.ModelRegistry?.safeGetDefault("chatgpt", "image") ||
                  null
                : actualNodeType === "muse"
                  ? window.ModelRegistry?.safeGetDefault(
                      "muse",
                      d.media_type === "Video" ? "video" : "image",
                    ) || null
                  : window.ModelRegistry?.safeGetDefault(
                      "flow",
                      actualNodeType === "generate" && d.media_type === "Video"
                        ? "video"
                        : "image",
                    ) || null),
        ratio: d.ratio || "Ngang",
        quantity: d.quantity || 1,
        node_zoom: [1.5, 2].includes(Number(d.node_zoom))
          ? Number(d.node_zoom)
          : 1,
        video_input_type: d.video_input_type || "",
        video_duration: d.video_duration || "",
        video_resolution: d.video_resolution || "",
        voice_slug: d.voice_slug || null,
        voice_search_value: d.voice_search_value || null,
        character_selections: d.character_selections ?? null,
        character_slug: d.character_slug || null,
        character_search_value: d.character_search_value || null,
        ref_file_ids: _stripTempIds(d.ref_file_ids),
        frame_ref_mode: d.frame_ref_mode || null,
        frame_1_source: d.frame_1_source || "",
        frame_1_file_id: _isTempId(d.frame_1_file_id)
          ? ""
          : d.frame_1_file_id || "",
        frame_2_source: d.frame_2_source || "",
        frame_2_file_id: _isTempId(d.frame_2_file_id)
          ? ""
          : d.frame_2_file_id || "",
        auto_download: d.auto_download || false,
        enabled: d.enabled !== false,
        status: d.status || "pending",
        result_file_ids: d.result_file_ids || "",
        error_message: d.error_message || "",
        executed_at: d.executed_at || null,
      };
      if (d.download_folder !== void 0)
        nodeData.download_folder = d.download_folder;
      if (d.download_file_template !== void 0)
        nodeData.download_file_template = d.download_file_template;
      if (d.download_resolution !== void 0)
        nodeData.download_resolution = d.download_resolution;
      if (d.video_download_resolution !== void 0)
        nodeData.video_download_resolution = d.video_download_resolution;
      if (d.download_collect_all !== void 0)
        nodeData.download_collect_all = d.download_collect_all;
      if (d.watermark_mode !== void 0)
        nodeData.watermark_mode = d.watermark_mode;
      if (d.frame_1_file_name) nodeData.frame_1_file_name = d.frame_1_file_name;
      if (d.frame_2_file_name) nodeData.frame_2_file_name = d.frame_2_file_name;
      if (d.frame_1_thumbnail) nodeData.frame_1_thumbnail = d.frame_1_thumbnail;
      if (d.frame_2_thumbnail) nodeData.frame_2_thumbnail = d.frame_2_thumbnail;
      if (d.prompts_json?.length) nodeData.prompts_json = d.prompts_json;
      if (d.delay_seconds !== void 0) nodeData.delay_seconds = d.delay_seconds;
      if (d.note_text) nodeData.note_text = d.note_text;
      if (d.note_color) nodeData.note_color = d.note_color;
      if (d.note_font_size !== void 0 && d.note_font_size !== null)
        nodeData.note_font_size = d.note_font_size;
      if (d.note_width !== void 0 && d.note_width !== null)
        nodeData.note_width = d.note_width;
      if (d.note_height !== void 0 && d.note_height !== null)
        nodeData.note_height = d.note_height;
      if (d.result_thumbnails) nodeData.result_thumbnails = d.result_thumbnails;
      if (d.result_file_names) nodeData.result_file_names = d.result_file_names;
      const hasRefFileIds = (nodeData.ref_file_ids || "").trim().length > 0;
      if (hasRefFileIds) {
        if (d.ref_thumbnails)
          nodeData.ref_thumbnails = _stripTempIdKeys(d.ref_thumbnails);
        if (d.ref_file_names)
          nodeData.ref_file_names = _stripTempIdKeys(d.ref_file_names);
      } else {
        nodeData.ref_thumbnails = {};
        nodeData.ref_file_names = {};
      }
      if (d.confirmed_media_clear === true)
        nodeData.confirmed_media_clear = true;
      if (d.result_provider_urls)
        nodeData.result_provider_urls = d.result_provider_urls;
      if (actualNodeType === "telegram") {
        nodeData.telegram_chat_id = d.telegram_chat_id || "";
        nodeData.telegram_send_mode = d.telegram_send_mode || "single";
        nodeData.telegram_message = d.telegram_message || "";
      }
      if (actualNodeType === "grok") {
        nodeData.provider = d.provider || "grok";
        nodeData.grok_mode =
          String(d.grok_mode || d.media_type || "image").toLowerCase() ===
          "video"
            ? "video"
            : "image";
        nodeData.grok_duration = d.grok_duration || "6s";
        nodeData.grok_resolution = d.grok_resolution || "720p";
        if (d.grok_image_quality)
          nodeData.grok_image_quality = d.grok_image_quality;
      } else if (actualNodeType === "chatgpt") {
        nodeData.provider = d.provider || "chatgpt";
        nodeData.chatgpt_delete_after_gen = d.chatgpt_delete_after_gen === true;
        if (d.use_fallback_prefix)
          nodeData.use_fallback_prefix = d.use_fallback_prefix;
      } else if (actualNodeType === "gemini") {
        nodeData.provider = "gemini";
        nodeData.media_type = d.media_type === "Video" ? "Video" : "Image";
        nodeData.gemini_delete_after_gen = d.gemini_delete_after_gen === true;
      } else if (actualNodeType === "muse") {
        nodeData.provider = "muse";
        nodeData.muse_delete_after_gen = d.muse_delete_after_gen === true;
        nodeData.muse_upload_video_to_flow =
          d.muse_upload_video_to_flow !== false;
      } else if (actualNodeType === "prompt") {
        if (d.use_ai !== void 0) nodeData.use_ai = d.use_ai;
        if (d.use_ai && d.provider) nodeData.provider = d.provider;
        if (d.timeout_sec) nodeData.timeout_sec = d.timeout_sec;
        if (d.ai_fallback !== void 0) nodeData.ai_fallback = d.ai_fallback;
        if (d.ai_delete_after_run !== void 0)
          nodeData.ai_delete_after_run = d.ai_delete_after_run;
      } else if (actualNodeType === "text_extract") {
        nodeData.extract_mode = d.extract_mode || "marker";
        if (d.extract_marker) nodeData.extract_marker = d.extract_marker;
        if (d.extract_regex) nodeData.extract_regex = d.extract_regex;
        nodeData.extract_strict = d.extract_strict === true;
        nodeData.extract_multi_match = d.extract_multi_match || "first";
        nodeData.extract_on_fail = d.extract_on_fail || "skip_downstream";
      } else {
        if (d.provider) nodeData.provider = d.provider;
      }
      if (d.prompt_source) nodeData.prompt_source = d.prompt_source;
      if (d.multi_prompt !== void 0) nodeData.multi_prompt = d.multi_prompt;
      if (d.timeout_ms) nodeData.timeout_ms = d.timeout_ms;
      if (d.max_ref_images) nodeData.max_ref_images = d.max_ref_images;
      if (d.slug) nodeData.slug = d.slug;
      if (d.slug_auto !== void 0) nodeData.slug_auto = d.slug_auto;
      if (d.prompt_mode) nodeData.prompt_mode = d.prompt_mode;
      if (d.ref_mode) nodeData.ref_mode = d.ref_mode;
      if (
        actualNodeType === "chatgpt" ||
        actualNodeType === "grok" ||
        actualNodeType === "gemini"
      ) {
        console.log(
          "[DiagramCanvas] exportWorkflow mention modes:",
          "node_id=" + nodeData.node_id,
          "type=" + actualNodeType,
          "d.prompt_mode=" + (d.prompt_mode || "undefined"),
          "d.ref_mode=" + (d.ref_mode || "undefined"),
          "exported_prompt_mode=" + (nodeData.prompt_mode || "none"),
          "exported_ref_mode=" + (nodeData.ref_mode || "none"),
        );
      }
      if (d.result_text !== void 0)
        nodeData.result_text = d.result_text || null;
      if (d.result_source !== void 0)
        nodeData.result_source = d.result_source || null;
      if (d.result_img_url) nodeData.result_img_url = d.result_img_url;
      if (d.ref_img_urls?.length) {
        nodeData.ref_img_urls = d.ref_img_urls;
        console.log(
          "[DiagramCanvas] exportWorkflow - node has ref_img_urls:",
          nodeData.node_id,
          d.ref_img_urls,
        );
      }
      nodes.push(nodeData);
      Object.entries(node.outputs || {}).forEach(([outputKey, output]) => {
        (output.connections || []).forEach((conn) => {
          const targetNode = homeData[conn.node];
          const sourcePort = node.data?._port_map?.[outputKey] || null;
          const targetPort = targetNode?.data?._port_map?.[conn.output] || null;
          edges.push({
            edge_id: `edge_${id}_${outputKey}_${conn.node}_${conn.output}`,
            source_node_id: node.data?.node_id || `node_${id}`,
            source_handle: outputKey,
            source_port: sourcePort,
            target_node_id: targetNode?.data?.node_id || `node_${conn.node}`,
            target_handle: conn.output,
            target_port: targetPort,
            data_type: "image",
          });
        });
      });
    });
    return {
      nodes: nodes.map((node) => DiagramCanvas._copyWorkflowValue(node)),
      edges,
    };
  }
  zoomIn() {
    if (!this.editor) return;
    this.zoom = Math.min(this.zoom + 0.1, 2);
    this.editor.zoom = this.zoom;
    this.editor.zoom_refresh();
    this.updateZoomDisplay();
  }
  zoomOut() {
    if (!this.editor) return;
    this.zoom = Math.max(this.zoom - 0.1, 0.1);
    this.editor.zoom = this.zoom;
    this.editor.zoom_refresh();
    this.updateZoomDisplay();
  }
  resetZoom() {
    if (!this.editor) return;
    this.zoom = 1;
    this.editor.zoom = this.zoom;
    this.editor.zoom_refresh();
    this.updateZoomDisplay();
  }
  recenter() {
    if (!this.editor) return;
    try {
      this.fitToScreen();
    } catch (e) {}
    try {
      this._forceUpdateAllConnections();
    } catch (e) {}
  }
  _finishDrawflowInteraction() {
    const editor = this.editor;
    if (
      editor &&
      (editor.drag ||
        editor.drag_point ||
        editor.connection ||
        editor.editor_selected)
    ) {
      const panPosition = editor.editor_selected && this._drawflowPanPosition;
      editor.dragEnd({
        type: "mouseup",
        clientX: panPosition ? panPosition.x : editor.pos_x,
        clientY: panPosition ? panPosition.y : editor.pos_y,
        target: this.container,
      });
      this._drawflowPanPosition = null;
    }
    if (this._multiDrag) this._onMultiDragUp();
    if (this._selectBox)
      this._onBoxUp({
        clientX: this._selectBox.startX,
        clientY: this._selectBox.startY,
      });
    if (this._spacePan) this._endSpacePan();
  }
  _initDrawflowPointerRelease() {
    this._drawflowPointerReleaseCleanup?.();
    const releaseOutside = (e) => {
      if (!this.container?.contains(e.target))
        this._finishDrawflowInteraction();
    };
    const releaseOnBlur = () => {
      this._nodePopupPress = null;
      this._finishDrawflowInteraction();
    };
    const rememberStart = (e) => {
      this._drawflowPanPosition = null;
      const node = e.target?.closest?.(".drawflow-node");
      const control = e.target?.closest?.(
        "button, input, textarea, select, .input, .output, .df-hover-toolbar",
      );
      this._nodePopupPress =
        e.button === 0 && node && !control && !e.shiftKey && !e.metaKey
          ? {
              nodeId: node.id.replace("node-", ""),
              x: e.clientX,
              y: e.clientY,
              moved: false,
            }
          : null;
    };
    const releaseNodePopup = (e) => {
      const press = this._nodePopupPress;
      this._nodePopupPress = null;
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 4)
        press.moved = true;
      if (press)
        window.eventBus?.emit("node:pointer_release", {
          canvas: this,
          nodeId: press.nodeId,
          moved: press.moved,
        });
    };
    const releaseOnIdleMove = (e) => {
      const press = this._nodePopupPress;
      if (
        press &&
        e.buttons !== 0 &&
        !press.moved &&
        Math.hypot(e.clientX - press.x, e.clientY - press.y) > 4
      ) {
        press.moved = true;
        window.eventBus?.emit("node:drag_start", {
          canvas: this,
          nodeId: press.nodeId,
        });
      }
      if (e.buttons === 0) this._finishDrawflowInteraction();
      else if (this.editor?.editor_selected)
        this._drawflowPanPosition = { x: e.clientX, y: e.clientY };
    };
    this._releaseDrawflowOnIdleMove = releaseOnIdleMove;
    document.addEventListener("mouseup", releaseOutside, true);
    document.addEventListener("mouseup", releaseNodePopup);
    window.addEventListener("blur", releaseOnBlur);
    this.container.addEventListener("mousedown", rememberStart, true);
    this.container.addEventListener("mousemove", releaseOnIdleMove, true);
    this._drawflowPointerReleaseCleanup = () => {
      document.removeEventListener("mouseup", releaseOutside, true);
      document.removeEventListener("mouseup", releaseNodePopup);
      window.removeEventListener("blur", releaseOnBlur);
      this.container.removeEventListener("mousedown", rememberStart, true);
      this.container.removeEventListener("mousemove", releaseOnIdleMove, true);
      this._drawflowPointerReleaseCleanup = null;
      this._releaseDrawflowOnIdleMove = null;
    };
  }
  setHandMode(on) {
    this._handMode = !!on;
    if (this.container)
      this.container.classList.toggle("wf-hand-mode", this._handMode);
  }
  _initSpacePan() {
    if (this._spacePanBound || !this.container) return;
    this._spacePanBound = true;
    this._spaceDown = false;
    this._spacePan = null;
    const isTyping = (t) =>
      t &&
      (t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA" ||
        t.tagName === "SELECT" ||
        t.isContentEditable);
    const onMove = (e) => {
      if (!this._spacePan) return;
      const p = this._spacePan;
      const nx = p.cx + (e.clientX - p.mx);
      const ny = p.cy + (e.clientY - p.my);
      this._applyZoomAndPan(this.zoom || this.editor?.zoom || 1, nx, ny);
    };
    const endPan = () => {
      if (this._spacePan) {
        this._spacePan = null;
        this.container.classList.remove("wf-space-panning");
      }
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", endPan, true);
    };
    this._endSpacePan = endPan;
    const onKeyDown = (e) => {
      if (e.code !== "Space") return;
      if (this.isReadOnly || isTyping(e.target)) return;
      if (!this.container.offsetParent) return;
      if (!this._spaceDown) {
        this._spaceDown = true;
        this.container.classList.add("wf-space-pan");
      }
      e.preventDefault();
    };
    const onKeyUp = (e) => {
      if (e.code !== "Space") return;
      this._spaceDown = false;
      this.container.classList.remove("wf-space-pan");
      endPan();
    };
    const onMouseDown = (e) => {
      if (!(this._spaceDown || this._handMode) || e.button !== 0) return;
      if (this.isReadOnly || !this.container.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      this.container.classList.add("wf-space-panning");
      this._spacePan = {
        mx: e.clientX,
        my: e.clientY,
        cx: this.editor?.canvas_x || 0,
        cy: this.editor?.canvas_y || 0,
      };
      document.addEventListener("mousemove", onMove, true);
      document.addEventListener("mouseup", endPan, true);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    this.container.addEventListener("mousedown", onMouseDown, true);
    this._spacePanCleanup = () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      this.container.removeEventListener("mousedown", onMouseDown, true);
    };
  }
  _initMultiSelect() {
    this._multiSelected = new Set();
    if (!this.container) {
      console.warn("[DiagramCanvas] multiSelect init SKIP \u2014 no container");
      return;
    }
    let box =
      this.container.querySelector("#dfSelectBox") ||
      document.getElementById("dfSelectBox");
    if (!box) {
      box = document.createElement("div");
      box.id = "dfSelectBox";
      box.className = "df-select-box hidden";
    }
    try {
      document.body.appendChild(box);
    } catch (e) {}
    this._selectBoxEl = box;
    console.log(
      "[DiagramCanvas] multiSelect init OK (Shift/Cmd + k\xE9o n\u1EC1n canvas \u0111\u1EC3 ch\u1ECDn v\xF9ng)",
    );
    this._onBoxMove = (e) => {
      const sb = this._selectBox;
      if (!sb) return;
      const x = Math.min(sb.startX, e.clientX),
        y = Math.min(sb.startY, e.clientY);
      box.style.left = x + "px";
      box.style.top = y + "px";
      box.style.width = Math.abs(e.clientX - sb.startX) + "px";
      box.style.height = Math.abs(e.clientY - sb.startY) + "px";
    };
    this._onBoxUp = (e) => {
      document.removeEventListener("mousemove", this._onBoxMove, true);
      document.removeEventListener("mouseup", this._onBoxUp, true);
      const sb = this._selectBox;
      this._selectBox = null;
      box.classList.add("hidden");
      if (!sb) return;
      const sel = {
        left: Math.min(sb.startX, e.clientX),
        top: Math.min(sb.startY, e.clientY),
        right: Math.max(sb.startX, e.clientX),
        bottom: Math.max(sb.startY, e.clientY),
      };
      if (sel.right - sel.left < 5 && sel.bottom - sel.top < 5) {
        this._clearMultiSelect();
        return;
      }
      this._clearMultiSelect();
      this.container.querySelectorAll(".drawflow-node").forEach((nodeEl) => {
        const r = nodeEl.getBoundingClientRect();
        const hit = !(
          r.right < sel.left ||
          r.left > sel.right ||
          r.bottom < sel.top ||
          r.top > sel.bottom
        );
        if (hit) {
          this._multiSelected.add(nodeEl.id.replace("node-", ""));
          nodeEl.classList.add("df-multi-selected");
        }
      });
      this._emitSelectionChanged();
    };
    this._onMultiDragMove = (e) => {
      const md = this._multiDrag;
      if (!md) return;
      const zoom = this.zoom || this.editor?.zoom || 1;
      const dx = (e.clientX - md.mouseStartX) / zoom;
      const dy = (e.clientY - md.mouseStartY) / zoom;
      md.starts.forEach((s, id) => {
        if (id === md.grabbedId) return;
        s.el.style.left = s.left + dx + "px";
        s.el.style.top = s.top + dy + "px";
        try {
          this.editor.updateConnectionNodes(`node-${id}`);
        } catch (err) {}
      });
    };
    this._onMultiDragUp = () => {
      document.removeEventListener("mousemove", this._onMultiDragMove, true);
      document.removeEventListener("mouseup", this._onMultiDragUp, true);
      const md = this._multiDrag;
      this._multiDrag = null;
      if (!md) return;
      const mod = this.editor.module || "Home";
      md.starts.forEach((s, id) => {
        if (id === md.grabbedId) return;
        const left = parseFloat(s.el.style.left) || 0;
        const top = parseFloat(s.el.style.top) || 0;
        try {
          const nd = this.editor.drawflow?.drawflow?.[mod]?.data?.[id];
          if (nd) {
            nd.pos_x = left;
            nd.pos_y = top;
          }
        } catch (err) {}
        try {
          this.editor.updateConnectionNodes(`node-${id}`);
        } catch (err) {}
        if (window.eventBus)
          window.eventBus.emit("node:moved", {
            nodeId: id,
            pos_x: left,
            pos_y: top,
          });
      });
    };
    document.addEventListener(
      "mousedown",
      (e) => {
        if (e.button !== 0) return;
        if (this.isReadOnly) return;
        if (!this.container || !this.container.contains(e.target)) return;
        const nodeEl = e.target?.closest?.(".drawflow-node");
        const onControl = e.target?.closest?.(
          ".tobyflow-wf-toolbar, .canvas-controls, .wf-port-legend, .diagram-recenter-btn, .df-node-settings-bar, .df-hover-toolbar, .canvas-brand-zone, .node-form-panel",
        );
        if (e.shiftKey || e.metaKey) {
          if (onControl) return;
          e.preventDefault();
          e.stopPropagation();
          if (nodeEl) {
            this._toggleNodeSelect(nodeEl);
            return;
          }
          this._selectBox = { startX: e.clientX, startY: e.clientY };
          box.style.left = e.clientX + "px";
          box.style.top = e.clientY + "px";
          box.style.width = "0px";
          box.style.height = "0px";
          box.classList.remove("hidden");
          document.addEventListener("mousemove", this._onBoxMove, true);
          document.addEventListener("mouseup", this._onBoxUp, true);
          return;
        }
        if (nodeEl) {
          const id = nodeEl.id.replace("node-", "");
          if (this._multiSelected.size > 1 && this._multiSelected.has(id)) {
            this._startMultiDrag(e, nodeEl);
          } else if (
            this._multiSelected.size > 0 &&
            !this._multiSelected.has(id)
          ) {
            this._clearMultiSelect();
          }
        } else if (this._multiSelected.size > 0) {
          this._clearMultiSelect();
        }
      },
      true,
    );
  }
  _selectedNodeCount() {
    const ids = new Set(this._multiSelected || []);
    const selected = this.editor?.node_selected;
    if (selected?.id) ids.add(selected.id.replace("node-", ""));
    return ids.size;
  }
  _emitSelectionChanged() {
    window.eventBus?.emit("node:selection_changed", {
      canvas: this,
      count: this._selectedNodeCount(),
    });
  }
  _zoomIntoCanvasPoint(event, container) {
    if (
      !this.editor ||
      event.button !== 0 ||
      event.shiftKey ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    )
      return;
    if (
      !event.target.matches(".diagram-container, .parent-drawflow, .drawflow")
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    const rect = container.getBoundingClientRect();
    const zoom = this.zoom || this.editor.zoom || 1;
    const next = Math.min(2, zoom * 1.5);
    const x = (event.clientX - rect.left - (this.editor.canvas_x || 0)) / zoom;
    const y = (event.clientY - rect.top - (this.editor.canvas_y || 0)) / zoom;
    this._applyZoomAndPan(
      next,
      rect.width / 2 - x * next,
      rect.height / 2 - y * next,
    );
  }
  _toggleNodeSelect(nodeEl) {
    const id = nodeEl.id.replace("node-", "");
    if (this._multiSelected.has(id)) {
      this._multiSelected.delete(id);
      nodeEl.classList.remove("df-multi-selected");
    } else {
      this._multiSelected.add(id);
      nodeEl.classList.add("df-multi-selected");
    }
    this._emitSelectionChanged();
  }
  _clearMultiSelect() {
    if (!this._multiSelected) return;
    this._multiSelected.forEach((id) => {
      this.container
        .querySelector(`#node-${id}`)
        ?.classList.remove("df-multi-selected");
    });
    this._multiSelected.clear();
  }
  _startMultiDrag(e, grabbedEl) {
    const grabbedId = grabbedEl.id.replace("node-", "");
    const starts = new Map();
    this._multiSelected.forEach((id) => {
      const el = this.container.querySelector(`#node-${id}`);
      if (el)
        starts.set(id, {
          el,
          left: parseFloat(el.style.left) || 0,
          top: parseFloat(el.style.top) || 0,
        });
    });
    this._multiDrag = {
      grabbedId,
      starts,
      mouseStartX: e.clientX,
      mouseStartY: e.clientY,
    };
    document.addEventListener("mousemove", this._onMultiDragMove, true);
    document.addEventListener("mouseup", this._onMultiDragUp, true);
  }
  updateZoomDisplay() {
    const zoomLevel = this.container.querySelector("#zoomLevel");
    if (zoomLevel) {
      zoomLevel.textContent = `${Math.round(this.zoom * 100)}%`;
    }
    try {
      this.container.style.setProperty("--wf-zoom", String(this.zoom || 1));
    } catch (_) {}
  }
  showProgress(current, total) {
    const progress = this.container.querySelector("#workflowProgress");
    const text = this.container.querySelector("#progressText");
    const fill = this.container.querySelector("#progressFill");
    if (progress) progress.classList.remove("hidden");
    if (text) text.textContent = `${current} / ${total}`;
    if (fill) fill.style.width = `${total > 0 ? (current / total) * 100 : 0}%`;
  }
  hideProgress() {
    const progress = this.container.querySelector("#workflowProgress");
    if (progress) progress.classList.add("hidden");
  }
  duplicateNode(nodeId) {
    const node = this.editor?.getNodeFromId(nodeId);
    if (!node) return null;
    const nodeType = node.data?.node_type || node.class;
    const baseName =
      (node.data.node_name || nodeType) +
      " " +
      (window.I18n?.t("common.copySuffix") || "(copy)");
    const newData = {
      ...node.data,
      node_id: window.IdGenerator
        ? window.IdGenerator.next("node")
        : `node_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      node_name: this._uniquifyNodeName(baseName),
      node_type: nodeType,
    };
    try {
      NodeTemplates.normalizeNodeData?.(newData);
    } catch (_) {}
    delete newData.status;
    delete newData.result_file_ids;
    delete newData.result_file_names;
    delete newData.result_thumbnails;
    if (node.data?.slug) {
      newData.slug = this._uniquifySlug(node.data.slug);
      newData.slug_auto = true;
    }
    return this.addNode(nodeType, node.pos_x + 40, node.pos_y + 40, newData);
  }
  _uniquifyNodeName(baseName) {
    if (!this.editor || !baseName) return baseName;
    const moduleData = this.editor.drawflow?.drawflow?.Home?.data || {};
    const existing = new Set();
    Object.values(moduleData).forEach((n) => {
      const name = n?.data?.node_name;
      if (name) existing.add(name);
    });
    if (!existing.has(baseName)) return baseName;
    const m = baseName.match(/^(.+?)\s+(\d+)$/);
    const root = m ? m[1] : baseName;
    let counter = m ? parseInt(m[2], 10) + 1 : 2;
    let candidate = `${root} ${counter}`;
    while (existing.has(candidate)) {
      counter++;
      candidate = `${root} ${counter}`;
    }
    return candidate;
  }
  _uniquifySlug(baseSlug) {
    if (!this.editor || !baseSlug) return baseSlug;
    const moduleData = this.editor.drawflow?.drawflow?.Home?.data || {};
    const existing = new Set();
    Object.values(moduleData).forEach((n) => {
      const s = n?.data?.slug;
      if (s) existing.add(s);
    });
    if (!existing.has(baseSlug)) return baseSlug;
    const m = baseSlug.match(/^(.+?)_(\d+)$/);
    const root = m ? m[1] : baseSlug;
    let counter = m ? parseInt(m[2], 10) + 1 : 2;
    const MAX = 30;
    const build = (n) => {
      const suffix = `_${n}`;
      const maxRoot = MAX - suffix.length;
      if (maxRoot < 1) return `node${suffix}`.substring(0, MAX);
      let trimmed = root.length > maxRoot ? root.substring(0, maxRoot) : root;
      trimmed = trimmed.replace(/_+$/, "");
      if (!trimmed) trimmed = "node";
      return trimmed + suffix;
    };
    let candidate = build(counter);
    while (existing.has(candidate)) {
      counter++;
      candidate = build(counter);
    }
    return candidate;
  }
  fitToScreen() {
    if (!this.editor) return;
    const moduleData = this.editor.drawflow?.drawflow?.Home?.data || {};
    const nodeIds = Object.keys(moduleData);
    const onlyStartNode =
      nodeIds.length === 1 &&
      (moduleData[nodeIds[0]]?.class === "start" ||
        moduleData[nodeIds[0]]?.data?.node_type === "start");
    if (nodeIds.length === 0 || onlyStartNode) {
      this._applyZoomAndPan(1, 0, 0);
      return;
    }
    const FALLBACK_W = 340;
    const FALLBACK_H = 220;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const id of nodeIds) {
      const n = moduleData[id];
      const x = n.pos_x || 0;
      const y = n.pos_y || 0;
      const el = document.getElementById(`node-${id}`);
      const _nz = Number(n.data?.node_zoom);
      const zoom2 = _nz === 1.5 ? 1.5 : _nz === 2 ? 2 : 1;
      const w = (el?.offsetWidth || FALLBACK_W) * zoom2;
      const h = (el?.offsetHeight || FALLBACK_H) * zoom2;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + w > maxX) maxX = x + w;
      if (y + h > maxY) maxY = y + h;
    }
    const bboxW = Math.max(1, maxX - minX);
    const bboxH = Math.max(1, maxY - minY);
    const cvElForSize =
      this.container || this.container.querySelector("#drawflowCanvas");
    const cvRectForSize = cvElForSize?.getBoundingClientRect?.();
    const vpW = Math.round(
      cvRectForSize?.width || this.container?.clientWidth || 800,
    );
    const vpH = Math.round(
      cvRectForSize?.height || this.container?.clientHeight || 600,
    );
    const PADDING = 80;
    const cvRect = cvRectForSize || this.container.getBoundingClientRect();
    let leftInset = 0;
    let rightInset = 0;
    let toolbarFound = false;
    try {
      const searchRoot =
        this.container.closest(".workflow-editor-center") ||
        this.container.parentElement ||
        document;
      const toolbar = searchRoot.querySelector?.(".tobyflow-wf-toolbar");
      if (toolbar) {
        toolbarFound = true;
        const tbRect = toolbar.getBoundingClientRect();
        if (tbRect.width > 0 && tbRect.height > 0) {
          leftInset = Math.max(0, tbRect.right - cvRect.left + 12);
        }
      }
      if (toolbarFound && leftInset === 0) {
        leftInset = 64;
      }
    } catch (e) {}
    const effectiveVpW = Math.max(200, vpW - leftInset - rightInset);
    const fitZoom = Math.min(
      (effectiveVpW - PADDING * 2) / bboxW,
      (vpH - PADDING * 2) / bboxH,
      1,
    );
    const zoom = Math.max(0.1, Math.min(1, fitZoom));
    const bboxCenterX = (minX + maxX) / 2;
    const bboxCenterY = (minY + maxY) / 2;
    const visibleCenterX = leftInset + effectiveVpW / 2;
    const canvasX = visibleCenterX - bboxCenterX * zoom;
    const canvasY = vpH / 2 - bboxCenterY * zoom;
    console.log(
      `[DiagramCanvas] fitToScreen: nodes=${nodeIds.length} bbox=(${minX},${minY})\u2192(${maxX},${maxY}) size=${bboxW}x${bboxH} center=(${bboxCenterX.toFixed(0)},${bboxCenterY.toFixed(0)})`,
    );
    console.log(
      `[DiagramCanvas] fitToScreen: viewport=${vpW}x${vpH} leftInset=${leftInset} toolbarFound=${toolbarFound} effectiveVpW=${effectiveVpW}`,
    );
    console.log(
      `[DiagramCanvas] fitToScreen: visibleCenterX=${visibleCenterX.toFixed(0)} fitZoom=${fitZoom.toFixed(3)} zoom=${zoom.toFixed(3)} canvasX=${canvasX.toFixed(0)} canvasY=${canvasY.toFixed(0)}`,
    );
    this._applyZoomAndPan(zoom, canvasX, canvasY);
  }
  _applyZoomAndPan(zoom, canvasX, canvasY) {
    if (!this.editor) return;
    this.zoom = zoom;
    this.editor.zoom = zoom;
    this.editor.canvas_x = canvasX;
    this.editor.canvas_y = canvasY;
    this.editor.zoom_last_value = zoom;
    const precanvas =
      this.editor.precanvas ||
      this.container.querySelector(".parent-drawflow .drawflow") ||
      this.container.querySelector(".drawflow");
    if (precanvas) {
      precanvas.style.transformOrigin = "0 0";
      precanvas.style.transform = `translate(${canvasX}px, ${canvasY}px) scale(${zoom})`;
    }
    try {
      this.editor.dispatch && this.editor.dispatch("zoom", zoom);
    } catch (e) {}
    this.updateZoomDisplay();
  }
  _rejectConnection(connection, msg, reason) {
    if (this._restoringEdges) {
      console.warn(
        `[DiagramCanvas] Gi\u1EEF edge \u0111\xE3 l\u01B0u khi restore (${reason}):`,
        msg,
      );
      return false;
    }
    try {
      this.editor.removeSingleConnection(
        connection.output_id,
        connection.input_id,
        connection.output_class,
        connection.input_class,
      );
    } catch (e) {}
    if (typeof window.showNotification === "function")
      window.showNotification(msg, "error");
    console.warn(`[DiagramCanvas] Reject connection (${reason}):`, msg);
    return true;
  }
  _handleConnectionCreated(connection) {
    if (!this.editor || !connection) return;
    const sourceNode = this.editor.getNodeFromId(connection.output_id);
    const targetNode = this.editor.getNodeFromId(connection.input_id);
    if (!sourceNode || !targetNode) return;
    let sourcePortName = sourceNode.data?._port_map?.[connection.output_class];
    let targetPortName = targetNode.data?._port_map?.[connection.input_class];
    const sourceType = sourceNode.class || sourceNode.data?.node_type;
    const targetType = targetNode.class || targetNode.data?.node_type;
    const sourcePorts =
      typeof NodeTemplates?.getNodePorts === "function"
        ? NodeTemplates.getNodePorts(sourceType, sourceNode.data)
        : { in: [], out: [] };
    const targetPorts =
      typeof NodeTemplates?.getNodePorts === "function"
        ? NodeTemplates.getNodePorts(targetType, targetNode.data)
        : { in: [], out: [] };
    if (!sourcePortName) {
      const outIdx =
        parseInt(
          String(connection.output_class || "").replace("output_", ""),
          10,
        ) - 1;
      sourcePortName = sourcePorts.out?.[outIdx]?.name || null;
    }
    if (!targetPortName) {
      const inIdx =
        parseInt(
          String(connection.input_class || "").replace("input_", ""),
          10,
        ) - 1;
      targetPortName = targetPorts.in?.[inIdx]?.name || null;
    }
    if (!sourcePortName || !targetPortName) {
      if (window.eventBus) window.eventBus.emit("edge:created", { connection });
      try {
        this._validateRequiredPorts();
      } catch (e) {}
      return;
    }
    const sourcePort = sourcePorts.out.find((p) => p.name === sourcePortName);
    const targetPort = targetPorts.in.find((p) => p.name === targetPortName);
    if (!sourcePort || !targetPort) {
      if (window.eventBus)
        window.eventBus.emit("edge:created", {
          connection,
          sourcePort: sourcePortName,
          targetPort: targetPortName,
        });
      try {
        this._validateRequiredPorts();
      } catch (e) {}
      return;
    }
    const compat = (NodeTemplates?.PORT_COMPAT || {})[sourcePort.type] || [];
    if (!compat.includes(targetPort.type)) {
      const msg =
        window.I18n?.t("workflow.portIncompatible", {
          source: sourcePort.type,
          target: targetPort.type,
        }) ||
        `Incompatible ports: ${sourcePort.type} \u2192 ${targetPort.type}`;
      if (this._rejectConnection(connection, msg, "type mismatch")) return;
    }
    if (
      Array.isArray(targetPort.acceptFromNodeTypes) &&
      targetPort.acceptFromNodeTypes.length > 0
    ) {
      if (!targetPort.acceptFromNodeTypes.includes(sourceType)) {
        const friendlyName = (nodeType) => {
          if (!nodeType) return nodeType;
          const cfg =
            typeof NodeTemplates?.getType === "function"
              ? NodeTemplates.getType(nodeType)
              : null;
          return cfg?.name || nodeType;
        };
        const acceptedFriendly = targetPort.acceptFromNodeTypes
          .map(friendlyName)
          .join(", ");
        const sourceFriendly = friendlyName(sourceType);
        const portLabel = targetPort.label || targetPort.name;
        const i18n = window.I18n;
        const msg =
          i18n?.t?.("workflow.portRejectAcceptFrom", {
            port: portLabel,
            accepted: acceptedFriendly,
            source: sourceFriendly,
          }) ||
          `Port "${portLabel}" ch\u1EC9 nh\u1EADn t\u1EEB: ${acceptedFriendly} (source: ${sourceFriendly})`;
        if (
          this._rejectConnection(
            connection,
            msg,
            "acceptFromNodeTypes mismatch",
          )
        )
          return;
      }
    }
    if (sourcePort.multiple === false) {
      const outputData = sourceNode.outputs?.[connection.output_class];
      const connCount = (outputData?.connections || []).length;
      if (connCount > 1) {
        const msg =
          sourceNode.data?.node_type === "prompt" &&
          /^prompt_\d+$/.test(sourcePortName)
            ? window.I18n?.t("workflow.multiPromptPortUsed", {
                port: sourcePort.label || sourcePortName,
              }) ||
              `"${sourcePort.label || sourcePortName}" is already connected. Add another prompt to create a new branch.`
            : window.I18n?.t("workflow.portSingleOutput", {
                port: sourcePort.label || sourcePortName,
              }) ||
              `Port "${sourcePort.label || sourcePortName}" only supports 1 connection`;
        if (this._rejectConnection(connection, msg, "source multiple=false"))
          return;
      }
    }
    if (targetPort.multiple === false) {
      const inputData = targetNode.inputs?.[connection.input_class];
      const connCount = (inputData?.connections || []).length;
      if (connCount > 1) {
        const msg =
          window.I18n?.t("workflow.portSingleConnection", {
            port: targetPort.label || targetPort.name,
          }) ||
          `Port "${targetPort.label || targetPort.name}" ch\u1EC9 ch\u1EA5p nh\u1EADn 1 connection`;
        if (this._rejectConnection(connection, msg, "multiple=false")) return;
      }
    }
    if (sourcePort.type !== targetPort.type) {
      console.log(
        `[DiagramCanvas] Auto-coerce: ${sourcePort.type} \u2192 ${targetPort.type} (${sourcePortName} \u2192 ${targetPortName})`,
      );
    }
    try {
      this._colorEdgeByType(connection, sourcePort.type);
    } catch (e) {}
    if (window.eventBus) {
      window.eventBus.emit("edge:created", {
        connection,
        sourcePort: sourcePortName,
        targetPort: targetPortName,
      });
    }
    try {
      this._validateRequiredPorts();
    } catch (e) {}
    if (targetPortName === "frame_1" || targetPortName === "frame_2") {
      this._syncFrameSourceOnConnect(
        connection,
        sourceNode,
        targetNode,
        targetPortName,
      ).catch((err) =>
        console.warn("[DiagramCanvas] frame source connect sync failed:", err),
      );
    }
  }
  async _syncFrameSourceOnConnect(
    connection,
    sourceNode,
    targetNode,
    targetPortName,
  ) {
    if (!sourceNode || !targetNode || !this.editor) return;
    const frameNum = targetPortName === "frame_1" ? 1 : 2;
    const sourceField = `frame_${frameNum}_source`;
    const fileIdField = `frame_${frameNum}_file_id`;
    const tgtData = targetNode.data || {};
    const sourceLogicalId =
      sourceNode.data?.node_id || `node_${connection.output_id}`;
    const sourceNodeName =
      sourceNode.data?.node_name || sourceNode.class || sourceLogicalId;
    const sharedFrames = ["generate", "grok"].includes(
      tgtData.node_type || targetNode.class,
    );
    if (
      tgtData[sourceField] === sourceLogicalId &&
      (!sharedFrames || tgtData.frame_ref_mode === "upstream_node")
    )
      return;
    const isManualWithFile =
      tgtData[sourceField] === "manual" && tgtData[fileIdField];
    if (!sharedFrames && isManualWithFile && this._restoringEdges) {
      console.warn(
        `[DiagramCanvas] Gi\u1EEF edge \u0111\xE3 l\u01B0u khi restore (frame ${frameNum} \u0111ang d\xF9ng \u1EA3nh manual) \u2014 b\u1ECF qua confirm`,
      );
      return;
    }
    if (!sharedFrames && isManualWithFile) {
      const dialog = window.CustomDialog || window.customDialog;
      let confirmed = true;
      if (dialog?.confirm) {
        try {
          const I = window.I18n;
          confirmed = await dialog.confirm(
            I?.t?.("workflow.frameSourceConfirm", {
              frame: frameNum,
              node: sourceNodeName,
            }) ||
              `Frame ${frameNum} is using a manually uploaded image. Replace it with output from node "${sourceNodeName}"?`,
            {
              title:
                I?.t?.("workflow.frameSourceConfirmTitle") ||
                "Confirm frame source change",
              okText: I?.t?.("common.ok") || "OK",
              cancelText: I?.t?.("common.cancel") || "Cancel",
              confirmText: I?.t?.("common.ok") || "OK",
            },
          );
        } catch (e) {
          confirmed = false;
        }
      }
      if (!confirmed) {
        try {
          this.editor.removeSingleConnection(
            connection.output_id,
            connection.input_id,
            connection.output_class,
            connection.input_class,
          );
        } catch (e) {}
        return;
      }
    }
    const newData = {
      ...tgtData,
      [sourceField]: sourceLogicalId,
      ...(sharedFrames
        ? { frame_ref_mode: "upstream_node" }
        : { [fileIdField]: "" }),
    };
    try {
      this.editor.updateNodeDataFromId(connection.input_id, newData);
    } catch (e) {
      console.warn("[DiagramCanvas] updateNodeDataFromId failed:", e);
      return;
    }
    if (window.eventBus) {
      window.eventBus.emit("node:data_changed", {
        drawflowId: String(connection.input_id),
        nodeId: tgtData.node_id,
        changedFields: [
          sourceField,
          fileIdField,
          ...(sharedFrames ? ["frame_ref_mode"] : []),
        ],
      });
      window.eventBus.emit("frame:sync_persist_request", {
        nodeId: tgtData.node_id,
        frameData: {
          [sourceField]: sourceLogicalId,
          [fileIdField]: newData[fileIdField] || "",
          ...(sharedFrames && { frame_ref_mode: newData.frame_ref_mode }),
          frame_1_source: newData.frame_1_source,
          frame_2_source: newData.frame_2_source,
          frame_1_file_id: newData.frame_1_file_id,
          frame_2_file_id: newData.frame_2_file_id,
          ...(sharedFrames &&
            Object.fromEntries(
              [1, 2].flatMap((slot) =>
                ["file_name", "thumbnail"].map((field) => [
                  `frame_${slot}_${field}`,
                  newData[`frame_${slot}_${field}`] || null,
                ]),
              ),
            )),
        },
      });
    }
  }
  _syncFrameSourceOnDisconnect(connection) {
    if (!connection || !this.editor) return;
    if (this._suppressFrameSyncOnResize) return;
    const targetNode = this.editor.getNodeFromId(connection.input_id);
    if (!targetNode) return;
    const targetPortName = targetNode.data?._port_map?.[connection.input_class];
    if (targetPortName !== "frame_1" && targetPortName !== "frame_2") return;
    const frameNum = targetPortName === "frame_1" ? 1 : 2;
    const sourceField = `frame_${frameNum}_source`;
    const tgtData = targetNode.data || {};
    if (!tgtData[sourceField] || tgtData[sourceField] === "manual") return;
    try {
      const upstreamNode = this.editor.getNodeFromId(connection.output_id);
      const upstreamLogicalId =
        upstreamNode?.data?.node_id || `node_${connection.output_id}`;
      if (tgtData[sourceField] !== upstreamLogicalId) {
        return;
      }
    } catch (e) {}
    if (targetNode.inputs?.[connection.input_class]?.connections?.length)
      return;
    const sharedFrames = ["generate", "grok"].includes(
      tgtData.node_type || targetNode.class,
    );
    const hasFrameWire = Object.entries(targetNode.inputs || {}).some(
      ([key, input]) =>
        ["frame_1", "frame_2"].includes(tgtData._port_map?.[key]) &&
        input.connections?.length,
    );
    const newData = {
      ...tgtData,
      [sourceField]: "",
      ...(sharedFrames && {
        frame_ref_mode: hasFrameWire ? "upstream_node" : "manual",
        ...(!hasFrameWire && {
          frame_1_source: "manual",
          frame_2_source: "manual",
        }),
      }),
    };
    try {
      this.editor.updateNodeDataFromId(connection.input_id, newData);
    } catch (e) {
      console.warn(
        "[DiagramCanvas] updateNodeDataFromId failed (disconnect):",
        e,
      );
      return;
    }
    if (window.eventBus) {
      window.eventBus.emit("node:data_changed", {
        drawflowId: String(connection.input_id),
        nodeId: tgtData.node_id,
        changedFields: sharedFrames
          ? ["frame_ref_mode", "frame_1_source", "frame_2_source"]
          : [sourceField],
      });
      window.eventBus.emit("frame:sync_persist_request", {
        nodeId: tgtData.node_id,
        frameData: {
          frame_1_source: newData.frame_1_source,
          frame_2_source: newData.frame_2_source,
          frame_1_file_id: tgtData.frame_1_file_id,
          frame_2_file_id: tgtData.frame_2_file_id,
          [sourceField]: newData[sourceField],
          ...(sharedFrames && { frame_ref_mode: newData.frame_ref_mode }),
          ...(sharedFrames &&
            Object.fromEntries(
              [1, 2].flatMap((slot) =>
                ["file_name", "thumbnail"].map((field) => [
                  `frame_${slot}_${field}`,
                  newData[`frame_${slot}_${field}`] || null,
                ]),
              ),
            )),
        },
      });
    }
  }
  _colorEdgeByType(connection, portType) {
    if (!connection) return;
    let edgeType = portType;
    try {
      const tEl = this.container.querySelector(
        `#node-${connection.input_id} .${connection.input_class}[data-port-type]`,
      );
      const t = tEl?.getAttribute("data-port-type");
      if (t) edgeType = t;
    } catch (e) {}
    if (!edgeType) return;
    const connTypeClass =
      {
        frame: "conn-type-frame",
        video: "conn-type-frame",
        text: "conn-type-text",
        image: "conn-type-image",
      }[edgeType] || "conn-type-any";
    const sel = `.connection.node_in_node-${connection.input_id}.node_out_node-${connection.output_id}.${connection.output_class}.${connection.input_class} path`;
    let svgPath = this.container.querySelector(sel);
    if (!svgPath) {
      svgPath = this.container.querySelector(
        `.connection.node_in_node-${connection.input_id}.node_out_node-${connection.output_id} path`,
      );
    }
    if (svgPath) {
      const svgEl = svgPath.parentElement;
      if (svgEl) {
        svgEl.classList.remove(
          "conn-type-frame",
          "conn-type-text",
          "conn-type-image",
          "conn-type-any",
        );
        svgEl.classList.add(connTypeClass);
      }
      this._addConnectionOverlay(svgPath);
    }
  }
  _addConnectionOverlay(mainPath) {
    if (!mainPath) return;
    const svgEl = mainPath.parentElement;
    if (!svgEl || svgEl.querySelector(".main-path-overlay")) return;
    const overlay = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    overlay.setAttribute("class", "main-path-overlay");
    overlay.setAttribute("d", mainPath.getAttribute("d") || "");
    overlay.setAttribute("fill", "none");
    svgEl.appendChild(overlay);
    const observer = new MutationObserver(() => {
      const d = mainPath.getAttribute("d");
      if (d) overlay.setAttribute("d", d);
    });
    observer.observe(mainPath, { attributes: true, attributeFilter: ["d"] });
  }
  _validateRequiredPorts() {
    if (!this.editor) return;
    const data = this.editor.export();
    const nodes = data?.drawflow?.Home?.data || {};
    for (const [drawflowId, nodeInfo] of Object.entries(nodes)) {
      const type = nodeInfo.class;
      const ports =
        typeof NodeTemplates?.getNodePorts === "function"
          ? NodeTemplates.getNodePorts(type, nodeInfo.data)
          : null;
      if (!ports || !ports.in || ports.in.length === 0) continue;
      ports.in.forEach((port, idx) => {
        if (!port.required) return;
        const inputClass = `input_${idx + 1}`;
        const conns = nodeInfo.inputs?.[inputClass]?.connections || [];
        const hasConnection = conns.length > 0;
        const portEl = document.querySelector(
          `#node-${drawflowId} .input.${inputClass}`,
        );
        if (portEl) {
          portEl.classList.toggle("df-port-warning", !hasConnection);
        }
      });
    }
  }
  setReadOnly(readOnly) {
    this.isReadOnly = readOnly;
    if (readOnly) {
      if (this.editor) {
        this.editor.editor_mode = "view";
      }
      this.container.classList.add("wf-canvas-readonly");
      this.container
        .querySelectorAll(
          ".node-delete, .add-connection-btn, .drawflow-delete, .df-hover-toolbar",
        )
        .forEach((el) => (el.style.display = "none"));
      if (!this.isAdminPreview) {
        this.container
          .querySelectorAll(".drawflow-node")
          .forEach((node) => (node.style.pointerEvents = "none"));
      }
      this.container
        .querySelectorAll(".df-node-toggle, .df-qty-btn, .df-inline-pill")
        .forEach((el) => (el.style.pointerEvents = "none"));
      if (!this.isAdminPreview) {
        this.container
          .querySelectorAll(".df-node-gear")
          .forEach((el) => (el.style.pointerEvents = "none"));
      }
      if (this._handleKeyDown) {
        document.removeEventListener("keydown", this._handleKeyDown);
      }
    } else {
      if (this.editor) {
        this.editor.editor_mode = "edit";
      }
      this.container.classList.remove("wf-canvas-readonly");
      this.container
        .querySelectorAll(
          ".node-delete, .add-connection-btn, .drawflow-delete, .df-hover-toolbar",
        )
        .forEach((el) => (el.style.display = ""));
      this.container
        .querySelectorAll(".drawflow-node")
        .forEach((node) => (node.style.pointerEvents = ""));
      this.container
        .querySelectorAll(
          ".df-node-toggle, .df-node-gear, .df-qty-btn, .df-inline-pill",
        )
        .forEach((el) => (el.style.pointerEvents = ""));
      if (this._handleKeyDown) {
        document.addEventListener("keydown", this._handleKeyDown);
      }
    }
  }
  destroy() {
    this._finishDrawflowInteraction();
    this._drawflowPointerReleaseCleanup?.();
    if (this._handleKeyDown) {
      document.removeEventListener("keydown", this._handleKeyDown);
      this._handleKeyDown = null;
    }
    if (this.editor) {
      this.editor.clear();
      this.editor = null;
    }
    this.container.innerHTML = "";
    this.zoom = 1;
    this.workflowId = null;
    this._selectedConnection = null;
    this._removeConnectionDeleteBtn();
  }
  _showConnectionDeleteBtn(conn) {
    this._removeConnectionDeleteBtn();
    if (this.isReadOnly) return;
    const svg = this.container.querySelector(
      ".drawflow svg.connection.selected",
    );
    if (!svg) return;
    const path = svg.querySelector(".main-path");
    if (!path) return;
    const pathLen = path.getTotalLength();
    const targetLen = pathLen > 90 ? pathLen - 38 : pathLen * 0.72;
    const pt = path.getPointAtLength(targetLen);
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.classList.add("connection-delete-btn");
    const cx = pt.x;
    const cy = pt.y;
    const r = 18;
    const armLen = 6.5;
    g.innerHTML = `
      <circle class="del-bg" cx="${cx}" cy="${cy}" r="${r}" />
      <line class="del-x" x1="${cx - armLen}" y1="${cy - armLen}" x2="${cx + armLen}" y2="${cy + armLen}" />
      <line class="del-x" x1="${cx + armLen}" y1="${cy - armLen}" x2="${cx - armLen}" y2="${cy + armLen}" />
    `;
    g.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.editor && conn) {
        this.editor.removeSingleConnection(
          conn.output_id,
          conn.input_id,
          conn.output_class,
          conn.input_class,
        );
        this._selectedConnection = null;
        this._removeConnectionDeleteBtn();
      }
    });
    svg.appendChild(g);
  }
  _removeConnectionDeleteBtn() {
    this.container
      .querySelectorAll(".connection-delete-btn")
      .forEach((el) => el.remove());
  }
  _showConnectionContextMenu(clientX, clientY, conn) {
    if (this.isReadOnly) return;
    this._hideConnectionContextMenu();
    try {
      this._hideNodeContextMenu?.();
    } catch (_) {}
    const t = (k, f) => window.I18n?.t?.(k) || f;
    const menu = document.createElement("div");
    menu.className = "df-canvas-context-menu df-connection-context-menu";
    menu.innerHTML =
      '<button type="button" class="df-canvas-context-item" data-action="delete-connection"><span class="df-canvas-context-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></span><span class="df-canvas-context-label">' +
      t("workflow.deleteConnection", "Delete connection") +
      "</span></button>";
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(clientX, window.innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(clientY, window.innerHeight - rect.height - 8))}px`;
    this._connectionContextMenu = menu;
    menu
      .querySelector('[data-action="delete-connection"]')
      ?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.editor && conn) {
          this.editor.removeSingleConnection(
            conn.output_id,
            conn.input_id,
            conn.output_class,
            conn.input_class,
          );
          this._selectedConnection = null;
          this._removeConnectionDeleteBtn();
        }
        this._hideConnectionContextMenu();
      });
    setTimeout(() => {
      const close = (ev) => {
        if (!menu.contains(ev.target)) this._hideConnectionContextMenu();
      };
      this._connCtxCloseHandler = close;
      document.addEventListener("click", close, true);
      document.addEventListener("contextmenu", close, true);
    }, 0);
  }
  _hideConnectionContextMenu() {
    if (this._connectionContextMenu) {
      this._connectionContextMenu.remove();
      this._connectionContextMenu = null;
    }
    if (this._connCtxCloseHandler) {
      document.removeEventListener("click", this._connCtxCloseHandler, true);
      document.removeEventListener(
        "contextmenu",
        this._connCtxCloseHandler,
        true,
      );
      this._connCtxCloseHandler = null;
    }
  }
  _showNodeContextMenu(clientX, clientY, nodeId) {
    if (this.isReadOnly) {
      return;
    }
    this._hideNodeContextMenu();
    if (!this.editor || !nodeId) return;
    const node = this.editor.getNodeFromId(nodeId);
    if (!node?.data) return;
    const data = node.data;
    const t = (key, fb) => window.I18n?.t(key) || fb;
    const isStart = data.node_type === "start";
    const isNote = data.node_type === "note";
    const refIds = String(data.ref_file_ids || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const isImageUploadAction =
      data.node_type === "image" &&
      refIds.length > 0 &&
      (refIds.some((id) => id.startsWith("upload_")) ||
        data.status === "failed");
    const hasResults =
      (data.result_file_ids || "").split(",").filter(Boolean).length > 0 ||
      !!data.result_text ||
      !!(data.status && data.status !== "pending");
    const hasPrompt = !!(data.prompt && String(data.prompt).trim());
    const isTemplateMode = this.isTemplateMode;
    const isExecuting = !!window.workflowExecutor?.isRunning;
    const multiSel = this._multiSelected;
    const isMultiCtx =
      multiSel && multiSel.size > 1 && multiSel.has(String(nodeId));
    if (isMultiCtx) {
      const count = multiSel.size;
      const runnableCount = this.getSelectedExecutableNodeIds({
        enabledOnly: true,
      }).length;
      const resettableCount = this.getSelectedExecutableNodeIds().length;
      const disabledCount = resettableCount - runnableCount;
      const tc = (key, fb) => {
        const v = window.I18n?.t?.(key, { count });
        return v && v !== key ? v : fb;
      };
      const tx = (key, value, fb) => {
        const v = window.I18n?.t?.(key, { count: value });
        return v && v !== key ? v : fb;
      };
      const runIcon =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
      const disableIcon =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3v9"/></svg>';
      const enableIcon =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>';
      const resetIcon =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>';
      const copyIcon =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
      const delIcon =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
      const multiItems = [];
      if (!isTemplateMode && !isExecuting) {
        if (runnableCount > 0) {
          multiItems.push({
            action: "run-multi",
            label: tx(
              "node.runNodesMulti",
              runnableCount,
              `Run ${runnableCount} node`,
            ),
            icon: runIcon,
          });
        }
        if (resettableCount > 0) {
          multiItems.push({
            action: "reset-multi",
            label: tx(
              "node.resetNodesMulti",
              resettableCount,
              `Reset ${resettableCount} node`,
            ),
            icon: resetIcon,
          });
        }
        if (runnableCount > 0 || resettableCount > 0)
          multiItems.push({ separator: true });
      }
      if (!isExecuting && (runnableCount > 0 || disabledCount > 0)) {
        if (runnableCount > 0)
          multiItems.push({
            action: "disable-multi",
            label: tx(
              "node.disableNodesMulti",
              runnableCount,
              `Disable ${runnableCount} nodes`,
            ),
            icon: disableIcon,
          });
        if (disabledCount > 0)
          multiItems.push({
            action: "enable-multi",
            label: tx(
              "node.enableNodesMulti",
              disabledCount,
              `Enable ${disabledCount} nodes`,
            ),
            icon: enableIcon,
          });
        multiItems.push({ separator: true });
      }
      multiItems.push(
        {
          action: "copy-multi",
          label: tc("node.copyNodesMulti", `Copy ${count} node`),
          shortcut: "\u2318C",
          icon: copyIcon,
        },
        {
          action: "delete-multi",
          label: tc("node.deleteNodesMulti", `X\xF3a ${count} node`),
          shortcut: "\u232B",
          danger: true,
          icon: delIcon,
        },
      );
      this._renderContextMenu(clientX, clientY, multiItems, nodeId);
      return;
    }
    const items = [];
    if (!isStart && !isNote && !isTemplateMode) {
      const singleSession =
        window.workflowExecutor?.canAcceptSingleNode?.(this.workflowId) ||
        window.workflowExecutor?._singleNodeRemoteState?.workflowId ===
          this.workflowId;
      const activeSingle = window.workflowExecutor?.isSingleNodeActive?.(
        data.node_id,
      );
      const session = window.workflowExecutor?._singleNodeSession;
      const syncingCompletedSession =
        window.__flowReloadSyncInProgress === true &&
        session?.workflowId === this.workflowId &&
        session.closed === true &&
        session.stopping !== true &&
        !activeSingle;
      if (
        isExecuting &&
        (!singleSession || activeSingle) &&
        !syncingCompletedSession
      ) {
        console.info("[WorkflowSingleNodeMenu]", {
          workflowId: this.workflowId,
          nodeId: data.node_id,
          singleSession: !!singleSession,
          activeSingle: !!activeSingle,
          localWorkflowId:
            window.workflowExecutor?._singleNodeSession?.workflowId,
          remoteWorkflowId:
            window.workflowExecutor?._singleNodeRemoteState?.workflowId,
          stopping:
            window.workflowExecutor?._singleNodeSession?.stopping === true,
          version: window.chrome?.runtime?.getManifest?.()?.version || null,
        });
        items.push({
          action: "force-stop-node",
          label: activeSingle
            ? t("workflow.stopNode", "Stop")
            : t("workflow.forceStop", "Force stop"),
          danger: true,
          icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12"/></svg>',
        });
      } else {
        const runLabel = isImageUploadAction
          ? t("common.upload", "Upload")
          : t("node.runNode", "Run node");
        const runIcon = isImageUploadAction
          ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16V4"/><polyline points="7 9 12 4 17 9"/><path d="M5 20h14"/></svg>'
          : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
        items.push({ action: "run-node", label: runLabel, icon: runIcon });
      }
    }
    if (isNote && !isTemplateMode && !isExecuting) {
      items.push({
        action: "run-note-group",
        label: t("workflow.runNoteGroup", "Run this group"),
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
      });
      items.push({
        action: "reset-note-group",
        label: t("workflow.resetNoteGroup", "Reset this group"),
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
      });
      items.push({ separator: true });
    }
    if (
      hasResults &&
      !isNote &&
      !isTemplateMode &&
      !window.workflowExecutor?.isSingleNodeActive?.(data.node_id)
    ) {
      items.push({
        action: "reset-node",
        label: t("node.resetNode", "Reset node"),
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
      });
    }
    if (hasPrompt) {
      items.push({
        action: "copy-prompt",
        label: t("node.copyPrompt", "Copy prompt"),
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
      });
    }
    const hasSlug = !!(data.slug && String(data.slug).trim());
    if (hasSlug) {
      items.push({
        action: "copy-slug",
        label: t("node.copySlug", "Copy @slug"),
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><line x1="21.17" y1="8" x2="12" y2="8"/><line x1="3.95" y1="6.06" x2="8.54" y2="14"/><line x1="10.88" y1="21.94" x2="15.46" y2="14"/></svg>',
      });
    }
    if (!isNote) {
      items.push({
        action: "branch-node",
        label: t("node.branch", "Create branch"),
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M6 6a9 9 0 0 0 9 9"/></svg>',
      });
    }
    if (!isStart) {
      items.push({
        action: "settings-node",
        label: t("node.settings", "Settings"),
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
      });
    }
    items.push({ separator: true });
    if (!isStart) {
      items.push({
        action: "copy-node-clipboard",
        label: t("node.copyNode", "Copy node"),
        shortcut: "\u2318C",
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
      });
      items.push({
        action: "copy-node",
        label: t("node.duplicate", "Duplicate"),
        shortcut: "\u2318D",
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
      });
      items.push({
        action: "delete-node",
        label: t("node.deleteNode", "Delete node"),
        shortcut: "\u232B",
        danger: true,
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
      });
    }
    this._renderContextMenu(clientX, clientY, items, nodeId);
  }
  _renderContextMenu(clientX, clientY, items, nodeId) {
    this._finishDrawflowInteraction();
    const menu = document.createElement("div");
    menu.className = "df-node-context-menu";
    menu.innerHTML = items
      .map((item) => {
        if (item.separator)
          return '<div class="df-node-context-separator"></div>';
        return `<button class="df-node-context-item${item.danger ? " df-node-context-item--danger" : ""}" data-action="${item.action}">
        <span class="df-node-context-icon">${item.icon || ""}</span>
        <span class="df-node-context-label">${item.label}</span>
        ${item.shortcut ? `<span class="df-node-context-shortcut">${item.shortcut}</span>` : ""}
      </button>`;
      })
      .join("");
    menu.style.left = `${clientX}px`;
    menu.style.top = `${clientY}px`;
    document.body.appendChild(menu);
    this._contextMenuEl = menu;
    this._updateContextMenuRunState();
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      let x = clientX,
        y = clientY;
      if (rect.right > window.innerWidth - 8)
        x = window.innerWidth - rect.width - 8;
      if (rect.bottom > window.innerHeight - 8)
        y = window.innerHeight - rect.height - 8;
      menu.style.left = `${Math.max(8, x)}px`;
      menu.style.top = `${Math.max(8, y)}px`;
    });
    menu.addEventListener("click", (e) => {
      const btn = e.target.closest(".df-node-context-item");
      if (!btn || btn.disabled) return;
      e.stopPropagation();
      this._finishDrawflowInteraction();
      const action = btn.dataset.action;
      this._hideNodeContextMenu();
      this._dispatchNodeAction(action, nodeId);
    });
  }
  _updateContextMenuRunState() {
    this._contextMenuEl
      ?.querySelectorAll(
        '[data-action="run-node"], [data-action="run-multi"], [data-action="run-note-group"]',
      )
      .forEach((button) => {
        button.disabled = window.__flowReloadSyncInProgress === true;
        button.title = button.disabled
          ? window.I18n?.t("workflow.reloadingFlowWait") ||
            "Reloading Flow, please wait..."
          : "";
      });
  }
  _hideNodeContextMenu() {
    if (this._contextMenuEl) {
      this._contextMenuEl.remove();
      this._contextMenuEl = null;
    }
  }
  _toggleNodeZoom(nodeEl) {
    if (!nodeEl || this.isReadOnly) return;
    const drawflowId = nodeEl.id.replace("node-", "");
    const node = this.editor?.getNodeFromId(drawflowId);
    if (!node) return;
    const cur = Number(node.data?.node_zoom);
    const next = cur === 1.5 ? 2 : cur === 2 ? 1 : 1.5;
    this.editor.updateNodeDataFromId(drawflowId, {
      ...node.data,
      node_zoom: next,
    });
    const dfNode = nodeEl.querySelector(".df-node");
    if (dfNode)
      dfNode.dataset.zoom = next === 1.5 ? "1.5" : next === 2 ? "2" : "1";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          this._forceUpdateAllConnections?.();
        } catch (e) {}
      });
    });
    window.eventBus?.emit("node:request_save", { drawflowId });
  }
  _startNodeRename(nodeEl) {
    if (!nodeEl || this.isReadOnly) return;
    const titleEl = nodeEl.querySelector(".df-node-title-text");
    if (!titleEl || titleEl.getAttribute("contenteditable") === "true") return;
    const drawflowId = nodeEl.id.replace("node-", "");
    const node = this.editor?.getNodeFromId(drawflowId);
    if (!node) return;
    const original = node.data?.node_name || titleEl.textContent || "";
    titleEl.setAttribute("contenteditable", "true");
    titleEl.classList.add("nodrag");
    titleEl.focus();
    try {
      const range = document.createRange();
      range.selectNodeContents(titleEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (_) {}
    let done = false;
    const commit = (save) => {
      if (done) return;
      done = true;
      titleEl.removeEventListener("keydown", onKey);
      titleEl.removeEventListener("blur", onBlur);
      titleEl.removeAttribute("contenteditable");
      titleEl.classList.remove("nodrag");
      let newName = (titleEl.textContent || "").replace(/\s+/g, " ").trim();
      if (newName.length > 60) newName = newName.slice(0, 60);
      if (!save || !newName || newName === original) {
        titleEl.textContent = original;
        return;
      }
      titleEl.textContent = newName;
      const titleWrap = nodeEl.querySelector(".df-node-title");
      if (titleWrap) titleWrap.setAttribute("title", newName);
      const fresh = this.editor?.getNodeFromId(drawflowId);
      if (fresh) {
        this.editor.updateNodeDataFromId(drawflowId, {
          ...fresh.data,
          node_name: newName,
        });
        window.eventBus?.emit("node:renamed", {
          drawflowId,
          nodeId: fresh.data?.node_id,
          name: newName,
        });
      }
    };
    const onKey = (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        commit(true);
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        commit(false);
      }
    };
    const onBlur = () => commit(true);
    titleEl.addEventListener("keydown", onKey);
    titleEl.addEventListener("blur", onBlur);
  }
  _initNoteInteractions() {
    if (this._noteInteractionsBound) return;
    const host = this.container?.querySelector(".drawflow") || this.container;
    if (!host) return;
    this._noteInteractionsBound = true;
    host.addEventListener("mousedown", (e) => {
      if (this.isReadOnly) return;
      const noteEl = e.target.closest?.(".df-node-note-frame");
      if (!noteEl) return;
      const dfNodeEl = noteEl.closest(".drawflow-node");
      if (!dfNodeEl) return;
      const nodeId = dfNodeEl.id.replace("node-", "");
      const handle = e.target.closest(".df-note-resize");
      if (handle) {
        e.preventDefault();
        e.stopPropagation();
        this._startNoteResize(
          e,
          nodeId,
          dfNodeEl,
          noteEl,
          handle.dataset.corner || "se",
        );
        return;
      }
      if (
        e.target.closest(
          ".df-hover-toolbar, .nodrag, button, input, textarea, select",
        )
      )
        return;
      this._startNoteGroupDrag(e, nodeId);
    });
  }
  _startNoteResize(e, noteId, dfNodeEl, noteEl, corner) {
    const noteNode = this.editor?.getNodeFromId(noteId);
    if (!noteNode) return;
    const zoom = this.zoom || this.editor?.zoom || 1;
    const data = noteNode.data || {};
    const startW = Math.max(160, parseInt(data.note_width, 10) || 420);
    const startH = Math.max(100, parseInt(data.note_height, 10) || 280);
    const startPX = Number(noteNode.pos_x) || 0;
    const startPY = Number(noteNode.pos_y) || 0;
    const startMX = e.clientX,
      startMY = e.clientY;
    const west = corner.includes("w"),
      north = corner.includes("n");
    const affectsW = corner.includes("e") || corner.includes("w");
    const affectsH = corner.includes("n") || corner.includes("s");
    let curW = startW,
      curH = startH,
      curPX = startPX,
      curPY = startPY;
    const onMove = (ev) => {
      const dx = (ev.clientX - startMX) / zoom;
      const dy = (ev.clientY - startMY) / zoom;
      if (affectsW)
        curW = Math.max(160, Math.round(west ? startW - dx : startW + dx));
      if (affectsH)
        curH = Math.max(100, Math.round(north ? startH - dy : startH + dy));
      curPX = west ? Math.round(startPX + (startW - curW)) : startPX;
      curPY = north ? Math.round(startPY + (startH - curH)) : startPY;
      noteEl.style.width = curW + "px";
      noteEl.style.height = curH + "px";
      if (affectsW) dfNodeEl.style.width = curW + "px";
      if (affectsH) dfNodeEl.style.height = curH + "px";
      if (west || north) {
        dfNodeEl.style.left = curPX + "px";
        dfNodeEl.style.top = curPY + "px";
      }
      try {
        this.editor.updateConnectionNodes(`node-${noteId}`);
      } catch (_) {}
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      const nd = this.editor?.drawflow?.drawflow?.Home?.data?.[noteId];
      if (nd) {
        nd.data = { ...nd.data, note_width: curW, note_height: curH };
        nd.pos_x = curPX;
        nd.pos_y = curPY;
      }
      if (noteNode) {
        noteNode.data = {
          ...noteNode.data,
          note_width: curW,
          note_height: curH,
        };
        noteNode.pos_x = curPX;
        noteNode.pos_y = curPY;
      }
      if (window.eventBus)
        window.eventBus.emit("node:moved", {
          nodeId: noteId,
          pos_x: curPX,
          pos_y: curPY,
        });
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }
  _startNoteGroupDrag(e, noteId) {
    const noteNode = this.editor?.getNodeFromId(noteId);
    if (!noteNode) return;
    const zoom = this.zoom || this.editor?.zoom || 1;
    const noteWrapEl = document.querySelector(`#node-${noteId}`);
    const w = noteWrapEl
      ? noteWrapEl.offsetWidth
      : Math.max(160, parseInt(noteNode.data?.note_width, 10) || 420);
    const h = noteWrapEl
      ? noteWrapEl.offsetHeight
      : Math.max(100, parseInt(noteNode.data?.note_height, 10) || 280);
    const nx = Number(noteNode.pos_x) || 0,
      ny = Number(noteNode.pos_y) || 0;
    const allData = this.editor?.drawflow?.drawflow?.Home?.data || {};
    const contained = [];
    for (const id in allData) {
      if (String(id) === String(noteId)) continue;
      const n = allData[id];
      const el = document.querySelector(`#node-${id}`);
      if (el?.querySelector(".df-node-note-frame")) continue;
      const nw = el ? el.offsetWidth : 0;
      const nh = el ? el.offsetHeight : 0;
      const cx = (Number(n.pos_x) || 0) + nw / 2;
      const cy = (Number(n.pos_y) || 0) + nh / 2;
      if (cx >= nx && cx <= nx + w && cy >= ny && cy <= ny + h) {
        contained.push({
          id,
          startX: Number(n.pos_x) || 0,
          startY: Number(n.pos_y) || 0,
          el,
        });
      }
    }
    if (!contained.length) return;
    const startMX = e.clientX,
      startMY = e.clientY;
    const onMove = (ev) => {
      const dx = (ev.clientX - startMX) / zoom;
      const dy = (ev.clientY - startMY) / zoom;
      for (const c of contained) {
        const px = Math.round(c.startX + dx),
          py = Math.round(c.startY + dy);
        const nd = allData[c.id];
        if (nd) {
          nd.pos_x = px;
          nd.pos_y = py;
        }
        const live = this.editor?.getNodeFromId(c.id);
        if (live) {
          live.pos_x = px;
          live.pos_y = py;
        }
        if (c.el) {
          c.el.style.left = px + "px";
          c.el.style.top = py + "px";
        }
        try {
          this.editor.updateConnectionNodes(`node-${c.id}`);
        } catch (_) {}
      }
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (window.eventBus)
        window.eventBus.emit("node:moved", { nodeId: noteId });
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }
  getNodeIdsInNote(noteId) {
    const noteNode = this.editor?.getNodeFromId(noteId);
    if (!noteNode) return [];
    const wrapEl = document.querySelector(`#node-${noteId}`);
    const w = wrapEl
      ? wrapEl.offsetWidth
      : Math.max(160, parseInt(noteNode.data?.note_width, 10) || 420);
    const h = wrapEl
      ? wrapEl.offsetHeight
      : Math.max(100, parseInt(noteNode.data?.note_height, 10) || 280);
    const nx = Number(noteNode.pos_x) || 0,
      ny = Number(noteNode.pos_y) || 0;
    const allData = this.editor?.drawflow?.drawflow?.Home?.data || {};
    const ids = [];
    for (const id in allData) {
      if (String(id) === String(noteId)) continue;
      const el = document.querySelector(`#node-${id}`);
      if (el?.querySelector(".df-node-note-frame")) continue;
      const n = allData[id];
      const cx = (Number(n.pos_x) || 0) + (el ? el.offsetWidth : 0) / 2;
      const cy = (Number(n.pos_y) || 0) + (el ? el.offsetHeight : 0) / 2;
      if (cx >= nx && cx <= nx + w && cy >= ny && cy <= ny + h) {
        const actualId = n?.data?.node_id;
        if (actualId) ids.push(String(actualId));
      }
    }
    return ids;
  }
  getSelectedExecutableNodeIds({ enabledOnly = false } = {}) {
    if (!this.editor || !this._multiSelected?.size) return [];
    const ids = [];
    for (const drawflowId of this._multiSelected) {
      const node = this.editor.getNodeFromId(drawflowId);
      const type = node?.data?.node_type || node?.class;
      const actualId = node?.data?.node_id;
      if (
        actualId &&
        !["start", "note"].includes(type) &&
        (!enabledOnly || node.data?.enabled !== false)
      ) {
        ids.push(String(actualId));
      }
    }
    return ids;
  }
  _setSelectedNodesEnabled(enabled) {
    if (this.isReadOnly || window.workflowExecutor?.isRunning || !this.editor)
      return 0;
    let changed = 0;
    for (const drawflowId of this._multiSelected || []) {
      const node = this.editor.getNodeFromId(drawflowId);
      const type = node?.data?.node_type || node?.class;
      if (
        !node?.data?.node_id ||
        ["start", "note"].includes(type) ||
        (node.data.enabled !== false) === enabled
      )
        continue;
      const data = { ...node.data, enabled };
      this.editor.updateNodeDataFromId(drawflowId, data);
      const nodeEl = this.container?.querySelector(`#node-${drawflowId}`);
      const body = nodeEl?.querySelector(".df-node");
      if (body) {
        body.classList.toggle("df-node-disabled", !enabled);
        body.dataset.enabled = String(enabled);
      }
      const toggle = nodeEl?.querySelector(".df-node-toggle");
      if (toggle) {
        toggle.classList.toggle("on", enabled);
        toggle.classList.toggle("off", !enabled);
        toggle.title = enabled
          ? window.I18n?.t("node.disableNode") || "Disable node"
          : window.I18n?.t("node.enableNode") || "Enable node";
      }
      window.eventBus?.emit("node:toggled", {
        nodeId: String(drawflowId),
        enabled,
      });
      changed++;
    }
    if (changed)
      window.eventBus?.emit("node:request_save", {
        reason: "toggle-selected-nodes",
      });
    return changed;
  }
  _dispatchNodeAction(action, nodeId) {
    if (
      ["run-node", "run-multi", "run-note-group"].includes(action) &&
      window.__flowReloadSyncInProgress === true
    ) {
      window.showNotification?.(
        window.I18n?.t("workflow.reloadingFlowWait") ||
          "Reloading Flow, please wait...",
        "info",
        2500,
      );
      return;
    }
    if (!nodeId || !this.editor) return;
    const node = this.editor.getNodeFromId(nodeId);
    if (!node) return;
    if (action === "run-node") {
      window.eventBus?.emit("node:run_single", { nodeId });
    } else if (action === "run-note-group") {
      const nodeIds = this.getNodeIdsInNote(nodeId);
      window.eventBus?.emit("node:run_group", { noteId: nodeId, nodeIds });
    } else if (action === "reset-note-group") {
      const nodeIds = this.getNodeIdsInNote(nodeId);
      window.eventBus?.emit("node:reset_group", { noteId: nodeId, nodeIds });
    } else if (action === "force-stop-node") {
      window.eventBus?.emit("node:force_stop", { nodeId });
    } else if (action === "reset-node") {
      console.info("[WorkflowNodeReset] action dispatched", {
        drawflowId: String(nodeId),
        nodeId: node.data?.node_id || null,
        nodeType: node.data?.node_type || node.class || null,
        status: node.data?.status || null,
        hasResults: Boolean(String(node.data?.result_file_ids || "").trim()),
      });
      window.eventBus?.emit("node:reset_single", { nodeId });
    } else if (action === "download-node") {
      window.eventBus?.emit("node:download", { nodeId });
    } else if (action === "settings-node") {
      window.eventBus?.emit("node:open_settings", { nodeId });
    } else if (action === "toggle-prompt-multi") {
      if (node.data?.node_type !== "prompt") return;
      window.eventBus?.emit("node:toggle_prompt_multi", { nodeId });
    } else if (action === "copy-prompt") {
      const promptText = node?.data?.prompt || "";
      if (!promptText) return;
      const showCopiedNotice = () => {
        if (typeof window.showNotification === "function") {
          window.showNotification(
            window.I18n?.t("node.promptCopied") || "Prompt copied",
            "success",
            1500,
          );
        }
      };
      (async () => {
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(promptText);
            showCopiedNotice();
            return;
          }
          throw new Error("Clipboard API unavailable");
        } catch (_) {
          try {
            const ta = document.createElement("textarea");
            ta.value = promptText;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            ta.remove();
            showCopiedNotice();
          } catch (_2) {}
        }
      })();
    } else if (action === "copy-slug") {
      const slug = node?.data?.slug || "";
      if (!slug) return;
      const atSlug = `@${slug}`;
      const showCopiedNotice = () => {
        if (typeof window.showNotification === "function") {
          window.showNotification(
            window.I18n?.t("node.slugCopied", { slug: atSlug }) ||
              `${atSlug} copied`,
            "success",
            1500,
          );
        }
      };
      (async () => {
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(atSlug);
            showCopiedNotice();
            return;
          }
          throw new Error("Clipboard API unavailable");
        } catch (_) {
          try {
            const ta = document.createElement("textarea");
            ta.value = atSlug;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            ta.remove();
            showCopiedNotice();
          } catch (_2) {}
        }
      })();
    } else if (action === "copy-node") {
      const newDrawflowId = this.duplicateNode(nodeId);
      if (newDrawflowId) {
        const newNode = this.editor?.getNodeFromId(newDrawflowId);
        if (newNode?.data) {
          window.eventBus?.emit("node:duplicated", {
            drawflowId: newDrawflowId,
            data: newNode.data,
            sourceDrawflowId: nodeId,
          });
        }
      }
    } else if (action === "copy-node-clipboard") {
      window.eventBus?.emit("node:copy_to_clipboard", { nodeId });
    } else if (action === "run-multi") {
      const nodeIds = this.getSelectedExecutableNodeIds({ enabledOnly: true });
      if (nodeIds.length) window.eventBus?.emit("nodes:run_multi", { nodeIds });
    } else if (action === "reset-multi") {
      const nodeIds = this.getSelectedExecutableNodeIds();
      if (nodeIds.length)
        window.eventBus?.emit("nodes:reset_multi", { nodeIds });
    } else if (action === "disable-multi") {
      this._setSelectedNodesEnabled(false);
    } else if (action === "enable-multi") {
      this._setSelectedNodesEnabled(true);
    } else if (action === "copy-multi") {
      const ids = this._multiSelected
        ? [...this._multiSelected].map(String)
        : [];
      if (ids.length) window.eventBus?.emit("nodes:copy_multi", { ids });
    } else if (action === "delete-multi") {
      const ids = this._multiSelected
        ? [...this._multiSelected].map(String)
        : [];
      if (ids.length) window.eventBus?.emit("nodes:delete_multi", { ids });
    } else if (action === "delete-node") {
      this.removeNode(nodeId);
    } else if (action === "branch-node") {
      window.eventBus?.emit("node:branch", { sourceNodeId: nodeId });
    }
  }
}
window.DiagramCanvas = DiagramCanvas;
