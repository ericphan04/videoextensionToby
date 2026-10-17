(function () {
  "use strict";
  if (typeof window.showNotification !== "function") {
    window.showNotification = (msg, type) => {
      console.log("[TemplatePreview][notify]", type || "info", msg);
    };
  }
  let diagram = null;
  let currentTemplate = null;
  let previewKind = "template";
  let _connRefreshTimer = null;
  function scheduleConnRefresh(delay = 90) {
    clearTimeout(_connRefreshTimer);
    _connRefreshTimer = setTimeout(() => {
      try {
        diagram?._forceUpdateAllConnections?.();
      } catch (_) {}
    }, delay);
  }
  const t = (k, f) => {
    const v = window.I18n && window.I18n.t && window.I18n.t(k);
    return v && v !== k ? v : f;
  };
  let _loadingHidden = false;
  function hideLoading() {
    if (_loadingHidden) return;
    _loadingHidden = true;
    const el = document.getElementById("tpLoading");
    if (!el) return;
    el.classList.add("tp-loading-out");
    setTimeout(() => el.remove(), 350);
  }
  function adaptTemplate(tpl) {
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
          const isVideo = /\.(mp4|webm|mov)(?:[?#]|$)/i.test(String(url || ""));
          refThumbnails[`template_ref_${ts}_${idx}_${i}`] = isVideo
            ? { thumbnail: url, video_url: url, type: "video" }
            : url;
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
          node_name: node.node_name || data.node_name || node.name || node.type,
          pos_x: node.pos_x ?? node.position?.x ?? 100,
          pos_y: node.pos_y ?? node.position?.y ?? 100,
          prompt: node.prompt || data.prompt || "",
          model: node.model || data.model || "",
          ratio: node.ratio || data.ratio || "1:1",
          quantity: node.quantity || data.quantity || 1,
          node_zoom: [1.5, 2].includes(Number(node.node_zoom ?? data.node_zoom))
            ? Number(node.node_zoom ?? data.node_zoom)
            : 1,
          ref_img_urls: refImgUrls,
          ref_thumbnails: {
            ...(node.ref_thumbnails || data.ref_thumbnails || {}),
            ...refThumbnails,
          },
          ref_file_ids: Object.keys(refThumbnails).length
            ? Object.keys(refThumbnails).join(", ")
            : node.ref_file_ids || data.ref_file_ids || "",
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
    return {
      wf_id: `preview_${tpl.id || tpl.wf_id || "tpl"}`,
      wf_name: tpl.name || tpl.wf_name || "Template",
      nodes,
      edges,
    };
  }
  function findDrawflowId(nodeId) {
    const home = diagram?.editor?.drawflow?.drawflow?.Home?.data || {};
    if (home[String(nodeId)]) return String(nodeId);
    for (const [id, n] of Object.entries(home)) {
      if (n.data?.node_id === nodeId) return id;
    }
    return null;
  }
  function mkThumb(cls, raw) {
    const url =
      typeof raw === "string" ? raw : raw?.video_url || raw?.thumbnail || "";
    const isVideo =
      (raw &&
        typeof raw === "object" &&
        (raw.type === "video" || raw.video_url)) ||
      /\.(mp4|webm|mov)(?:[?#]|$)/i.test(url);
    const thumb = document.createElement("div");
    thumb.className = cls;
    thumb.dataset.mediaSrc = url;
    thumb.dataset.mediaType = isVideo ? "video" : "image";
    const img = document.createElement(isVideo ? "video" : "img");
    if (isVideo) {
      img.muted = true;
      img.playsInline = true;
      img.preload = "metadata";
    } else {
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = "preview";
    }
    let _markTries = 0;
    const markLoaded = () => {
      const preview = img.closest(".df-node-preview");
      if (preview) {
        preview.classList.remove("tp-thumb-loading");
        scheduleConnRefresh();
        return;
      }
      if (_markTries++ < 10) requestAnimationFrame(markLoaded);
    };
    img.addEventListener(isVideo ? "loadedmetadata" : "load", markLoaded);
    img.addEventListener("error", markLoaded);
    img.src = url;
    if (
      (!isVideo && img.complete && img.naturalWidth) ||
      (isVideo && img.readyState >= 1)
    )
      markLoaded();
    thumb.appendChild(img);
    if (cls === "df-preview-thumb") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `df-preview-zoom nodrag${isVideo ? " df-preview-zoom--video" : ""}`;
      btn.title = t("workflow.viewMedia", "Xem");
      btn.innerHTML = isVideo
        ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5v14l11-7z"></path></svg>'
        : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>';
      thumb.appendChild(btn);
    }
    return thumb;
  }
  function renderResultOnNode(nodeId, media, retry = 0) {
    const url =
      typeof media === "string"
        ? media
        : media?.video_url || media?.thumbnail || "";
    if (!url) return;
    const dfId = findDrawflowId(nodeId);
    const nodeEl = dfId && document.querySelector(`#node-${dfId}`);
    if (!nodeEl) {
      if (retry < 5)
        setTimeout(
          () => renderResultOnNode(nodeId, media, retry + 1),
          120 * (retry + 1),
        );
      return;
    }
    const c = nodeEl.querySelector(".df-node-preview");
    if (!c) return;
    c.innerHTML = "";
    c.classList.remove("hidden", "multi-result");
    c.classList.add("template-result-preview", "tp-thumb-loading");
    const thumb = mkThumb("df-preview-thumb", media);
    const mediaEl = thumb.querySelector("img, video");
    if (mediaEl) mediaEl.onerror = () => c.classList.add("hidden");
    c.appendChild(thumb);
  }
  function renderRefOnNode(nodeId, refUrls, nodeType, retry = 0) {
    if (!refUrls || !refUrls.length) return;
    const dfId = findDrawflowId(nodeId);
    const nodeEl = dfId && document.querySelector(`#node-${dfId}`);
    if (!nodeEl) {
      if (retry < 5)
        setTimeout(
          () => renderRefOnNode(nodeId, refUrls, nodeType, retry + 1),
          120 * (retry + 1),
        );
      return;
    }
    if (nodeType === "image") {
      const c = nodeEl.querySelector(".df-node-preview");
      if (!c) return;
      c.innerHTML = "";
      c.classList.remove("hidden");
      c.classList.add("template-ref-preview", "image-ref", "tp-thumb-loading");
      c.classList.toggle("multi-result", refUrls.length > 1);
      refUrls.forEach((url) => {
        if (url) c.appendChild(mkThumb("df-preview-thumb", url));
      });
    } else {
      let c = nodeEl.querySelector(".df-node-ref-preview");
      if (!c) {
        const body = nodeEl.querySelector(".df-node-body");
        if (!body) return;
        c = document.createElement("div");
        c.className = "df-node-ref-preview";
        c.setAttribute("data-ref-preview", "");
        body.appendChild(c);
      }
      c.innerHTML = "";
      refUrls.slice(0, 6).forEach((url) => {
        if (url) c.appendChild(mkThumb("df-ref-thumb", url));
      });
    }
  }
  function renderNodeMedia(adapted) {
    for (const node of adapted.nodes) {
      const resultMedia = node.result_thumbnails
        ? Object.values(node.result_thumbnails).filter((v) =>
            typeof v === "string" ? !!v : !!(v?.video_url || v?.thumbnail),
          )
        : [];
      if (resultMedia.length) {
        renderResultOnNode(node.node_id, resultMedia[0]);
        continue;
      }
      const refUrls =
        node.ref_img_urls && node.ref_img_urls.length
          ? node.ref_img_urls
          : Object.values(node.ref_thumbnails || {});
      if (refUrls.length)
        renderRefOnNode(node.node_id, refUrls, node.node_type);
    }
  }
  let _appName = "";
  function applyBrand() {
    if (!_appName) return;
    document.title = `${_appName} \xB7 Template Preview`;
    document.querySelectorAll(".tobyflow-header-title").forEach((el) => {
      el.textContent = _appName;
    });
    document
      .querySelectorAll(".tobyflow-header-logo img, .tobyflow-header-logo-img")
      .forEach((el) => {
        el.alt = _appName;
      });
    const titleEl = document.getElementById("tpTitle");
    if (titleEl && (!titleEl.textContent || titleEl.textContent === "Template"))
      titleEl.textContent = _appName;
  }
  async function render(tpl, kind = "template") {
    if (!tpl) return;
    currentTemplate = tpl;
    previewKind = kind === "shared" ? "shared" : "template";
    document.getElementById("tpTitle").textContent =
      tpl.name || tpl.wf_name || "Template";
    const tpPremiumEl = document.getElementById("tpPremium");
    if (tpPremiumEl) {
      if (tpl.is_premium) {
        const _tip = t(
          "workflow.premiumTemplateUpgradeHint",
          "Premium template \u2014 upgrade to Premium to copy, clone and use this workflow.",
        );
        tpPremiumEl.style.display = "";
        tpPremiumEl.title = _tip;
        tpPremiumEl.setAttribute("data-tooltip", _tip);
      } else {
        tpPremiumEl.style.display = "none";
      }
    }
    document.getElementById("tpUseLabel").textContent =
      previewKind === "shared"
        ? t("workflow.cloneShared", "Use workflow")
        : t("workflow.copyTemplateBtn", "Use");
    const videoUrl = tpl.video_url || "";
    const videoBtn = document.getElementById("tpVideoBtn");
    if (videoBtn) {
      if (videoUrl) {
        videoBtn.style.display = "";
        document.getElementById("tpVideoLabel").textContent = t(
          "workflow.watchDemo",
          "Xem video demo",
        );
        videoBtn.onclick = () => {
          try {
            window.open(videoUrl, "_blank");
          } catch (_) {}
        };
      } else {
        videoBtn.style.display = "none";
        videoBtn.onclick = null;
      }
    }
    const adapted = adaptTemplate(tpl);
    const nodeCount = adapted.nodes.length || tpl.node_count || 0;
    const nodeIcon =
      '<svg width="14" height="14" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="none"><path fill="currentColor" fill-rule="evenodd" d="M4 6.25A2.25 2.25 0 016.25 4h3a2.25 2.25 0 012.25 2.25V7h3.25a.75.75 0 010 1.5H11.5v.75a2.25 2.25 0 01-2.25 2.25h-3A2.25 2.25 0 014 9.25V8.5H.75a.75.75 0 010-1.5H4v-.75zm6 0a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75v3c0 .414.336.75.75.75h3a.75.75 0 00.75-.75v-3z" clip-rule="evenodd"></path></svg>';
    const metaEl = document.getElementById("tpMeta");
    metaEl.innerHTML = nodeIcon;
    metaEl.appendChild(
      document.createTextNode(` ${nodeCount} ${t("workflow.nodes", "nodes")}`),
    );
    const container = document.getElementById("diagramContainer");
    if (diagram?.destroy) {
      try {
        diagram.destroy();
      } catch (_) {}
    }
    container.innerHTML = "";
    diagram = new window.DiagramCanvas(container, { isReadOnly: true });
    diagram.loadWorkflow(adapted);
    applyBrand();
    setTimeout(() => {
      try {
        renderNodeMedia(adapted);
      } catch (e) {
        console.warn("[TemplatePreview] renderNodeMedia:", e?.message);
      }
      try {
        diagram.fitToScreen?.();
      } catch (_) {}
      scheduleConnRefresh(0);
      applyBrand();
      hideLoading();
    }, 250);
    setTimeout(() => {
      try {
        diagram.fitToScreen?.();
      } catch (_) {}
      scheduleConnRefresh(0);
    }, 650);
    console.log(
      "[TemplatePreview] rendered template",
      tpl.id,
      "nodes=",
      adapted.nodes.length,
    );
  }
  let _using = false;
  let _sidebarTargetTabId = null;
  async function preloadSidebarTarget() {
    try {
      const stored = await chrome.storage.session.get(["targetFlowTabId"]);
      const targetId = stored?.targetFlowTabId || null;
      if (targetId) {
        const tab2 = await chrome.tabs.get(targetId).catch(() => null);
        if (tab2?.url && /^https:\/\/flow\.google\.com\//.test(tab2.url)) {
          _sidebarTargetTabId = targetId;
          return;
        }
      }
      const tabs = await chrome.tabs.query({
        url: ["https://flow.google.com/*"],
      });
      const tab = tabs.find((item) => item.active) || tabs[0] || null;
      _sidebarTargetTabId = tab?.id || null;
    } catch (e) {
      console.warn("[TemplatePreview] preload Flow tab failed:", e?.message);
    }
  }
  function onUse() {
    if (_using || !currentTemplate) return;
    _using = true;
    const btn = document.getElementById("tpUseBtn");
    if (btn) btn.disabled = true;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      try {
        window.close();
      } catch (_) {}
    };
    const pendingClone =
      previewKind === "shared"
        ? {
            type: "shared",
            wfId: currentTemplate.wf_id,
            workflow: currentTemplate,
            timestamp: Date.now(),
          }
        : {
            type: "template",
            templateId: currentTemplate.id,
            template: currentTemplate,
            timestamp: Date.now(),
          };
    try {
      chrome.runtime.sendMessage(
        {
          action: "openSidePanelForTemplateUse",
          tabId: _sidebarTargetTabId,
          pendingClone,
        },
        (response) => {
          const error = chrome.runtime.lastError;
          if (error || !response?.ok) {
            console.warn(
              "[TemplatePreview] open sidebar failed:",
              error?.message || response?.error,
            );
            _using = false;
            if (btn) btn.disabled = false;
            return;
          }
          close();
        },
      );
    } catch (e) {
      console.warn("[TemplatePreview] use sendMessage failed:", e?.message);
      _using = false;
      if (btn) btn.disabled = false;
    }
  }
  async function init() {
    document.getElementById("tpUseBtn")?.addEventListener("click", onUse);
    document.getElementById("tpCloseBtn")?.addEventListener("click", () => {
      try {
        window.close();
      } catch (_) {}
    });
    preloadSidebarTarget();
    const _lt = document.getElementById("tpLoadingText");
    if (_lt)
      _lt.textContent = t("workflow.loadingEditor", "Loading workflow\u2026");
    setTimeout(hideLoading, 8e3);
    try {
      const ss = await new Promise((r) =>
        chrome.storage.local.get(["af_system_settings"], (res) =>
          r(res.af_system_settings),
        ),
      );
      _appName = ss?.app_name || ss?.data?.app_name || "";
      applyBrand();
    } catch (_) {}
    const lb = document.getElementById("tpLightbox");
    const lbImg = document.getElementById("tpLightboxImg");
    const lbVideo = document.getElementById("tpLightboxVideo");
    const closeLb = () => {
      lb?.classList.remove("show");
      if (lbImg) {
        lbImg.src = "";
        lbImg.hidden = false;
      }
      if (lbVideo) {
        try {
          lbVideo.pause();
        } catch (_) {}
        lbVideo.src = "";
        lbVideo.hidden = true;
      }
    };
    document
      .getElementById("diagramContainer")
      ?.addEventListener("click", (e) => {
        const zoomBtn = e.target?.closest?.(".df-preview-zoom");
        if (!zoomBtn) return;
        const thumb = zoomBtn.closest(".df-preview-thumb, .df-ref-thumb");
        const src =
          thumb?.dataset?.mediaSrc || thumb?.querySelector("video, img")?.src;
        const isVideo =
          thumb?.dataset?.mediaType === "video" ||
          !!thumb?.querySelector("video");
        if (src && lb && lbImg && lbVideo) {
          e.preventDefault();
          e.stopPropagation();
          lbImg.hidden = isVideo;
          lbVideo.hidden = !isVideo;
          if (isVideo) {
            lbVideo.src = src;
            const playPromise = lbVideo.play();
            if (playPromise?.catch) playPromise.catch(() => {});
          } else {
            lbImg.src = src;
          }
          lb.classList.add("show");
        }
      });
    lb?.addEventListener("click", (e) => {
      if (e.target === lb || e.target.id === "tpLightboxClose") closeLb();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeLb();
    });
    try {
      await window.I18n?.init?.();
    } catch (_) {}
    if (_lt)
      _lt.textContent = t("workflow.loadingEditor", "Loading workflow\u2026");
    try {
      await window.ModelPresentationRegistry?.fetch?.();
    } catch (e) {
      console.warn("[TemplatePreview] ModelPresentationRegistry:", e?.message);
    }
    try {
      await window.NodeTemplates?.fetchFromServer?.();
    } catch (e) {
      console.warn("[TemplatePreview] NodeTemplates:", e?.message);
    }
    try {
      await window.ValidationRules?.fetch?.();
    } catch (e) {
      console.warn("[TemplatePreview] ValidationRules:", e?.message);
    }
    let pending = null;
    try {
      pending = await new Promise((r) =>
        chrome.storage.local.get(["_pendingTemplatePreview"], (res) =>
          r(res._pendingTemplatePreview),
        ),
      );
    } catch (_) {}
    if (pending?.template) {
      chrome.storage.local.remove("_pendingTemplatePreview");
      await render(pending.template, pending.kind || "template");
    } else {
      document.getElementById("tpTitle").textContent = t(
        "workflow.templateNotFound",
        "Template not found",
      );
    }
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.action === "loadTemplatePreview" && msg.template) {
        render(msg.template, msg.kind || "template");
      }
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
