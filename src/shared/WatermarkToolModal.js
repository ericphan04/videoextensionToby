(function () {
  "use strict";
  const t = (k, d, vars) => {
    let s = window.I18n?.t?.(`watermark.${k}`) || d;
    if (vars)
      for (const [n, v] of Object.entries(vars)) s = s.replace(`{${n}}`, v);
    return s;
  };
  class WatermarkToolModal {
    constructor() {
      this.overlay = null;
      this.items = [];
      this.running = false;
      this.stopped = false;
      this._seq = 0;
    }
    async open() {
      if (this.overlay) this.close();
      this.items = [];
      this.running = false;
      this.stopped = false;
      this._userScrolledAt = 0;
      this._render();
    }
    close() {
      for (const it of this.items) {
        if (it.origUrl) URL.revokeObjectURL(it.origUrl);
        if (it.cleanUrl) URL.revokeObjectURL(it.cleanUrl);
      }
      this.items = [];
      clearTimeout(this._subTimer);
      this.overlay?.remove();
      this.overlay = null;
      if (this.host) {
        this.host.classList.add("hidden");
        this.host.innerHTML = "";
        this.host = null;
      }
    }
    _render() {
      const ov = document.createElement("div");
      ov.className = "wmtool-panel";
      ov.innerHTML = `
        <div class="wmtool-panel-inner">
          <div class="wmtool-head">
            <!-- C\xF9ng h\xECnh v\u1EDBi "No Watermark" \u1EDF ch\xE2n sidebar (sidebar.html #footerWmOpen) \u2014 hai ch\u1ED7
                 n\xF3i v\u1EC1 m\u1ED9t t\xEDnh n\u0103ng th\xEC ph\u1EA3i c\xF9ng m\u1ED9t h\xECnh, \u0111\u1ED5i b\xEAn n\xE0o ph\u1EA3i \u0111\u1ED5i b\xEAn kia. -->
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" role="img" aria-hidden="true"><g fill="currentColor"><path d="M2 14.25c.41 0 .75.34.75.75v2.5c0 2.07 1.68 3.75 3.75 3.75H9c.41 0 .75.34.75.75s-.34.75-.75.75H6.5c-2.89 0-5.25-2.35-5.25-5.25V15c0-.41.34-.75.75-.75m20 1c.41 0 .75.34.75.75v1.5c0 2.9-2.36 5.25-5.25 5.25H16c-.41 0-.75-.34-.75-.75s.34-.75.75-.75h1.5c2.07 0 3.75-1.68 3.75-3.75V16c0-.41.34-.75.75-.75"></path><path fill-rule="evenodd" d="M14 5.75c2.42 0 3.75 1.33 3.75 3.75v1.75H19c.41 0 .75.34.75.75s-.34.75-.75.75h-1.25v1.75c0 2.42-1.33 3.75-3.75 3.75h-4c-2.42 0-3.75-1.33-3.75-3.75v-1.75H5c-.41 0-.75-.34-.75-.75s.34-.75.75-.75h1.25V9.5c0-2.42 1.33-3.75 3.75-3.75zm-6.25 7v1.75c0 1.58.67 2.25 2.25 2.25h4c1.58 0 2.25-.67 2.25-2.25v-1.75zM10 7.25c-1.58 0-2.25.67-2.25 2.25v1.75h8.5V9.5c0-1.58-.67-2.25-2.25-2.25z" clip-rule="evenodd"></path><path d="M9 1.25c.41 0 .75.34.75.75s-.34.75-.75.75H6.5c-2.07 0-3.75 1.68-3.75 3.75V9c0 .41-.34.75-.75.75s-.75-.34-.75-.75V6.5c0-2.9 2.36-5.25 5.25-5.25zm8.5 0c2.89 0 5.25 2.35 5.25 5.25V9c0 .41-.34.75-.75.75s-.75-.34-.75-.75V6.5c0-2.07-1.68-3.75-3.75-3.75H15c-.41 0-.75-.34-.75-.75s.34-.75.75-.75z"></path></g></svg>
            <div class="wmtool-title-wrap">
              <div class="wmtool-title">${this._esc(t("title", "Remove watermark"))}</div>
              <div class="wmtool-sub" id="wmtoolSub">${this._esc(t("sub", "Gemini \xB7 Flow"))}</div>
            </div>
            <button class="wmtool-x wmtool-clear hidden" id="wmtoolClear"
                    data-tooltip="${this._esc(t("clearAll", "Clear all"))}" data-tooltip-pos="bottom"
                    aria-label="${this._esc(t("clearAll", "Clear all"))}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6"></path>
                <path d="M10 11v6M14 11v6"></path>
              </svg>
            </button>
            <button class="wmtool-x" id="wmtoolClose" aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg>
            </button>
          </div>
          <div class="wmtool-body" id="wmtoolBody"></div>
          <div class="wmtool-foot">
            <button class="btn btn-secondary btn-sm hidden" id="wmtoolStop">${this._esc(t("stop", "Stop"))}</button>
            <div class="wmtool-action-stack">
              <button class="btn btn-generate" id="wmtoolAction" disabled>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M11.8525 4.21651L11.7221 3.2387C11.6906 3.00226 11.4889 2.82568 11.2504 2.82568C11.0118 2.82568 10.8102 3.00226 10.7786 3.23869L10.6483 4.21651C10.2658 7.0847 8.00939 9.34115 5.14119 9.72358L4.16338 9.85396C3.92694 9.88549 3.75037 10.0872 3.75037 10.3257C3.75037 10.5642 3.92694 10.7659 4.16338 10.7974L5.14119 10.9278C8.00938 11.3102 10.2658 13.5667 10.6483 16.4349L10.7786 17.4127C10.8102 17.6491 11.0118 17.8257 11.2504 17.8257C11.4889 17.8257 11.6906 17.6491 11.7221 17.4127L11.8525 16.4349C12.2349 13.5667 14.4913 11.3102 17.3595 10.9278L18.3374 10.7974C18.5738 10.7659 18.7504 10.5642 18.7504 10.3257C18.7504 10.0872 18.5738 9.88549 18.3374 9.85396L17.3595 9.72358C14.4913 9.34115 12.2349 7.0847 11.8525 4.21651Z"></path><path d="M4.6519 14.7568L4.82063 14.2084C4.84491 14.1295 4.91781 14.0757 5.00037 14.0757C5.08292 14.0757 5.15582 14.1295 5.1801 14.2084L5.34883 14.7568C5.56525 15.4602 6.11587 16.0108 6.81925 16.2272L7.36762 16.3959C7.44652 16.4202 7.50037 16.4931 7.50037 16.5757C7.50037 16.6582 7.44652 16.7311 7.36762 16.7554L6.81926 16.9241C6.11587 17.1406 5.56525 17.6912 5.34883 18.3946L5.1801 18.9429C5.15582 19.0218 5.08292 19.0757 5.00037 19.0757C4.91781 19.0757 4.84491 19.0218 4.82063 18.9429L4.65191 18.3946C4.43548 17.6912 3.88486 17.1406 3.18147 16.9241L2.63311 16.7554C2.55421 16.7311 2.50037 16.6582 2.50037 16.5757C2.50037 16.4931 2.55421 16.4202 2.63311 16.3959L3.18148 16.2272C3.88486 16.0108 4.43548 15.4602 4.6519 14.7568Z"></path></svg>
                <span id="wmtoolActionLabel"></span>
              </button>
              <div class="wmtool-download-meta">
                <span class="wmtool-count" id="wmtoolCount"></span>
                <label class="toolbar-toggle wm-toggle wm-toggle--xs wmtool-download-toggle hidden"
                       for="wmtoolDownloadAllFiles" id="wmtoolDownloadScope">
                  <input type="checkbox" id="wmtoolDownloadAllFiles" />
                  <span class="toggle-track"><span class="toggle-thumb"></span></span>
                  <span class="toggle-label">${this._esc(t("includeUnremoved", "Include files that could not be cleaned"))}</span>
                </label>
              </div>
            </div>
          </div>
        </div>`;
      ov.addEventListener(
        "wheel",
        () => {
          this._userScrolledAt = Date.now();
        },
        { passive: true },
      );
      ov.addEventListener(
        "touchmove",
        () => {
          this._userScrolledAt = Date.now();
        },
        { passive: true },
      );
      const host = document.getElementById("watermarkToolPanel");
      if (!host) {
        console.warn("[Watermark] thi\u1EBFu #watermarkToolPanel");
        return;
      }
      host.innerHTML = "";
      host.appendChild(ov);
      host.classList.remove("hidden");
      this.host = host;
      this.overlay = ov;
      ov.querySelector("#wmtoolClose").addEventListener("click", () =>
        this.close(),
      );
      ov.querySelector("#wmtoolClear").addEventListener("click", () =>
        this._clearAll(),
      );
      ov.querySelector("#wmtoolAction").addEventListener("click", () =>
        this._onAction(),
      );
      ov.querySelector("#wmtoolDownloadAllFiles").addEventListener(
        "change",
        () => this._syncFoot(),
      );
      ov.querySelector("#wmtoolStop").addEventListener("click", () => {
        this.stopped = true;
      });
      this._renderBody();
    }
    _renderBody() {
      const body = this.overlay?.querySelector("#wmtoolBody");
      if (!body) return;
      body.innerHTML = "";
      body.appendChild(this._dropZone(this.items.length > 0));
      for (const it of this.items) body.appendChild(this._itemEl(it));
      this._syncFoot();
    }
    async _videoPoster(file) {
      const url = URL.createObjectURL(file);
      try {
        const v = document.createElement("video");
        v.muted = true;
        v.playsInline = true;
        v.preload = "auto";
        v.src = url;
        await new Promise((res, rej) => {
          const to = setTimeout(() => rej(new Error("timeout")), 8e3);
          const done = () => {
            clearTimeout(to);
            res();
          };
          v.addEventListener("seeked", done, { once: true });
          v.addEventListener(
            "error",
            () => {
              clearTimeout(to);
              rej(new Error("video error"));
            },
            { once: true },
          );
          v.addEventListener(
            "loadedmetadata",
            () => {
              v.currentTime = Math.min(1, (v.duration || 2) / 2);
            },
            { once: true },
          );
        });
        const S = 96;
        const scale = Math.min(
          1,
          S / Math.max(v.videoWidth || S, v.videoHeight || S),
        );
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round((v.videoWidth || S) * scale));
        c.height = Math.max(1, Math.round((v.videoHeight || S) * scale));
        c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
        v.removeAttribute("src");
        v.load();
        return c.toDataURL("image/jpeg", 0.7);
      } catch (e) {
        console.warn(
          "[Watermark] poster video th\u1EA5t b\u1EA1i:",
          e?.message,
        );
        return null;
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    _runLabel(it) {
      if (it.kind !== "video" || !it.progress)
        return t("running", "Processing");
      const p = it.progress;
      if (p.phase === "sampling")
        return t("wmSampling", "Detecting watermark\u2026");
      if (p.phase === "audio") return t("wmAudio", "Merging audio\u2026");
      if (p.phase === "finalizing") return t("wmFinalizing", "Packaging\u2026");
      if (p.phase === "processing")
        return p.frame ? `${p.frame} frame` : t("running", "Processing");
      return t("running", "Processing");
    }
    _refreshItem(it) {
      const body = this.overlay?.querySelector("#wmtoolBody");
      if (!body) return;
      const old = body.querySelector(`.wmtool-row[data-wm-id="${it.id}"]`);
      if (!old) {
        this._renderBody();
        return;
      }
      const fresh = this._itemEl(it);
      old.replaceWith(fresh);
      if (it.status === "running") this._followRunning(fresh);
      this._syncFoot();
    }
    _followRunning(row) {
      if (this._userScrolledAt && Date.now() - this._userScrolledAt < 3e3)
        return;
      const smooth = !self.matchMedia?.("(prefers-reduced-motion: reduce)")
        ?.matches;
      row.scrollIntoView({
        block: "nearest",
        behavior: smooth ? "smooth" : "auto",
      });
    }
    _dropZone(compact) {
      const el = document.createElement("div");
      el.className = "wmtool-drop" + (compact ? " compact" : "");
      const iconUpload = (
        sz,
      ) => `<svg class="wmtool-drop-ico" width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <path d="M12 3v13"></path><path d="m7 8 5-5 5 5"></path>
        </svg>`;
      el.innerHTML = compact
        ? `${iconUpload(16)}<p>${this._esc(t("addMore", "Drop more images here"))}</p>
           <button class="btn btn-secondary btn-sm" type="button">${this._esc(t("pick", "Choose from computer"))}</button>`
        : `${iconUpload(28)}
           <p>${this._esc(t("drop", "Drop images here"))}</p>
           <span>${this._esc(t("or", "or"))}</span>
           <button class="btn btn-secondary btn-sm" type="button">${this._esc(t("pick", "Choose from computer"))}</button>
           <div class="wmtool-note">${t("note", "Images <b>only</b>. Video not supported yet. Cropped or re-compressed images may not come out clean.")}</div>`;
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/png,image/jpeg,video/mp4";
      input.multiple = true;
      input.style.display = "none";
      el.appendChild(input);
      input.addEventListener("change", () => {
        this._addFiles(input.files);
        input.value = "";
      });
      el.addEventListener("click", () => {
        if (!this.running) input.click();
      });
      el.addEventListener("dragover", (e) => {
        e.preventDefault();
        el.classList.add("dragover");
      });
      el.addEventListener("dragleave", () => el.classList.remove("dragover"));
      el.addEventListener("drop", (e) => {
        e.preventDefault();
        el.classList.remove("dragover");
        if (!this.running) this._addFiles(e.dataTransfer?.files);
      });
      return el;
    }
    _itemEl(it) {
      const el = document.createElement("div");
      el.dataset.wmId = String(it.id);
      el.className =
        "wmtool-row" + (it.status === "waiting" ? " is-waiting" : "");
      const pill =
        {
          waiting: `<span class="wmtool-pill idle">${this._esc(t("waiting", "Waiting"))}</span>`,
          running: `<span class="wmtool-pill run"><span class="wmtool-dot pulse"></span>${this._esc(this._runLabel(it))}</span>`,
          done: `<span class="wmtool-pill ok"><span class="wmtool-dot"></span>${this._esc(t("done", "Removed"))}</span>`,
          kept: `<span class="wmtool-pill warn"><span class="wmtool-dot"></span>${this._esc(it.kind === "video" ? t("keptVideo", "Original clip kept") : t("kept", "Kept original"))}</span>`,
          error: `<span class="wmtool-pill warn"><span class="wmtool-dot"></span>${this._esc(it.error || "L\u1ED7i")}</span>`,
        }[it.status] || "";
      const canView =
        it.status === "done" && it.kind !== "video" && it.result?.pos;
      const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
      let sub;
      if (it.status === "done" && it.kind === "video") {
        const st = it.result?.stats || {};
        const grow =
          it.cleanSize && it.size
            ? ` (\xD7${(it.cleanSize / it.size).toFixed(1)})`
            : "";
        sub = `${mb(it.cleanSize || it.size)}${grow} \xB7 ${st.frames || 0} frame \xB7 ${((st.ms || 0) / 1e3).toFixed(1)}s`;
      } else if (it.status === "done") {
        sub = `${mb(it.size)} \xB7 ${Math.round(it.result?.timings?.total || 0)}ms`;
      } else if (it.status === "kept") {
        sub =
          it.kind === "video"
            ? t(
                "keptShortVideo",
                "no watermark found \u2014 original clip kept",
              )
            : t("keptShort", "no watermark found");
      } else {
        sub = mb(it.size);
      }
      el.innerHTML = `
        <button class="wmtool-thumb${canView ? " can-view" : ""}${it.kind === "video" && !it.poster ? " is-video" : ""}" type="button"
                style="${it.origUrl || it.poster ? `background-image:url('${it.origUrl || it.poster}')` : ""}"
                ${canView ? `title="${this._esc(t("view", "Compare before/after"))}"` : "disabled"}>
          ${it.kind === "video" && !it.poster ? `<svg class="wmtool-thumb-film" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M7 4v16M17 4v16M2 9h5M2 15h5M17 9h5M17 15h5"></path></svg>` : ""}
          ${canView ? `<span class="wmtool-thumb-eye"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"></path><circle cx="12" cy="12" r="3"></circle></svg></span>` : ""}
        </button>
        <span class="wmtool-row-text">
          <span class="wmtool-name" title="${this._esc(it.name)}">${this._esc(it.name)}</span>
          <span class="wmtool-row-sub">${this._esc(sub)}</span>
        </span>
        ${pill}
        ${it.status === "done" ? `<button class="btn btn-secondary btn-sm wmtool-dl" type="button">${this._esc(t("dl", "Download"))}</button>` : ""}
        <button class="wmtool-rm" type="button" title="${this._esc(t("remove", "Remove from list"))}"
                aria-label="${this._esc(t("remove", "Remove from list"))}" ${it.status === "running" ? "disabled" : ""}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg>
        </button>`;
      if (it.status === "kept") {
        const ncc = Math.round((it.result?.ncc || 0) * 100);
        const th =
          it.threshold != null ? Math.round(it.threshold * 100) : "\u2014";
        el.title = String(
          t(
            "notFound",
            "No watermark found in the bottom-right corner (best match {ncc}%, needs \u2265 {th}%). Image <b>left unchanged</b>.",
            { ncc, th },
          ),
        ).replace(/<[^>]+>/g, "");
      }
      if (canView) {
        el.querySelector(".wmtool-thumb").addEventListener("click", () =>
          this._openPreview(it),
        );
      }
      el.querySelector(".wmtool-dl")?.addEventListener("click", () =>
        this._download(it),
      );
      el.querySelector(".wmtool-rm")?.addEventListener("click", () =>
        this._removeItem(it),
      );
      return el;
    }
    _removeItem(it) {
      if (it.status === "running") return;
      if (it.origUrl) URL.revokeObjectURL(it.origUrl);
      if (it.cleanUrl) URL.revokeObjectURL(it.cleanUrl);
      const i = this.items.indexOf(it);
      if (i >= 0) this.items.splice(i, 1);
      this._renderBody();
    }
    _clearAll() {
      const keep = [];
      for (const it of this.items) {
        if (it.status === "running") {
          keep.push(it);
          continue;
        }
        if (it.origUrl) URL.revokeObjectURL(it.origUrl);
        if (it.cleanUrl) URL.revokeObjectURL(it.cleanUrl);
      }
      this.items = keep;
      this._renderBody();
    }
    _openPreview(it) {
      const p = it.result?.pos;
      if (!p) return;
      const ov = document.createElement("div");
      ov.className = "wmtool-pv-overlay";
      ov.innerHTML = `
        <div class="wmtool-pv">
          <div class="wmtool-pv-head">
            <span class="wmtool-name" title="${this._esc(it.name)}">${this._esc(it.name)}</span>
            <button class="wmtool-x" type="button" aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg>
            </button>
          </div>
          <div class="wmtool-pv-stage">
            <canvas class="wmtool-pv-canvas"></canvas>
            <div class="wmtool-divider"></div>
            <span class="wmtool-tag l">${this._esc(t("origLbl", "Original"))}</span>
            <span class="wmtool-tag r">${this._esc(t("cleanLbl", "Removed"))}</span>
            <span class="wmtool-zoom"></span>
          </div>
          <div class="wmtool-pv-foot"></div>
        </div>`;
      document.body.appendChild(ov);
      const close = () => {
        ov.remove();
        document.removeEventListener("keydown", onKey);
      };
      const onKey = (e) => {
        if (e.key === "Escape") close();
      };
      document.addEventListener("keydown", onKey);
      ov.querySelector(".wmtool-x").addEventListener("click", close);
      ov.addEventListener("click", (e) => {
        if (e.target === ov) close();
      });
      ov.querySelector(".wmtool-pv-foot").appendChild(this._metricsEl(it));
      const cv = ov.querySelector(".wmtool-pv-canvas");
      const stage = ov.querySelector(".wmtool-pv-stage");
      const divider = ov.querySelector(".wmtool-divider");
      let split = 0.5;
      Promise.all([this._loadImg(it.origUrl), this._loadImg(it.cleanUrl)])
        .then(([a, b]) => {
          if (!ov.isConnected) return;
          const dpr = Math.min(2, self.devicePixelRatio || 1);
          const W = stage.clientWidth || 320,
            H = stage.clientHeight || 300;
          cv.width = W * dpr;
          cv.height = H * dpr;
          cv.style.width = W + "px";
          cv.style.height = H + "px";
          const side = Math.max(p.w, p.h) * 2;
          const sx = Math.max(
            0,
            Math.min(a.naturalWidth - side, p.x + p.w / 2 - side / 2),
          );
          const sy = Math.max(
            0,
            Math.min(a.naturalHeight - side, p.y + p.h / 2 - side / 2),
          );
          ov.querySelector(".wmtool-zoom").textContent =
            `${t("zoomNote", "bottom-right")} \xB7 ${Math.round((H / side) * 100)}%`;
          const ctx = cv.getContext("2d");
          ctx.imageSmoothingEnabled = false;
          const draw = () => {
            ctx.clearRect(0, 0, cv.width, cv.height);
            const cut = Math.round(cv.width * split);
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, cut, cv.height);
            ctx.clip();
            ctx.drawImage(a, sx, sy, side, side, 0, 0, cv.width, cv.height);
            ctx.restore();
            ctx.save();
            ctx.beginPath();
            ctx.rect(cut, 0, cv.width - cut, cv.height);
            ctx.clip();
            ctx.drawImage(b, sx, sy, side, side, 0, 0, cv.width, cv.height);
            ctx.restore();
          };
          draw();
          let dragging = false;
          const setAt = (clientX) => {
            const r = stage.getBoundingClientRect();
            split = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
            divider.style.left = `${split * 100}%`;
            draw();
          };
          stage.addEventListener("pointerdown", (e) => {
            dragging = true;
            stage.setPointerCapture(e.pointerId);
            setAt(e.clientX);
          });
          stage.addEventListener("pointermove", (e) => {
            if (dragging) setAt(e.clientX);
          });
          stage.addEventListener("pointerup", () => {
            dragging = false;
          });
          stage.addEventListener("pointercancel", () => {
            dragging = false;
          });
        })
        .catch(() => {
          ov.querySelector(".wmtool-pv-stage").textContent = t(
            "errGeneric",
            "Error",
          );
        });
    }
    _loadImg(url) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("IMG_LOAD_FAILED"));
        img.src = url;
      });
    }
    _metricsEl(it) {
      const el = document.createElement("div");
      el.className = "wmtool-stats";
      const r = it.result || {};
      const pct = (v) => `${Math.round(v * 100)}<i>%</i>`;
      const stats = [];
      if (r.timings?.total != null) {
        const ms = Math.round(r.timings.total);
        stats.push([
          t("statSpeed", "Speed"),
          ms >= 1e3 ? `${(ms / 1e3).toFixed(1)}<i>s</i>` : `${ms}<i>ms</i>`,
        ]);
      }
      if (r.nccAfter != null)
        stats.push([
          t("statClean", "Cleanliness"),
          pct(1 - Math.abs(r.nccAfter)),
        ]);
      if (r.ncc != null) stats.push([t("statMatch", "Detection"), pct(r.ncc)]);
      el.innerHTML = stats
        .map(
          ([label, val]) =>
            `<span class="wmtool-stat"><b>${val}</b><em>${this._esc(label)}</em></span>`,
        )
        .join("");
      return el;
    }
    _addFiles(fileList) {
      const all = Array.from(fileList || []);
      const isVid = (f) =>
        f.type === "video/mp4" || /\.mp4$/i.test(f.name || "");
      const files = all.filter(
        (f) => /^image\/(png|jpeg)$/.test(f.type) || isVid(f),
      );
      const rejected = all.length - files.length;
      for (const f of files) {
        this.items.push({
          id: ++this._seq,
          file: f,
          name: f.name,
          size: f.size,
          kind: isVid(f) ? "video" : "image",
          status: "waiting",
          result: null,
          origUrl: isVid(f) ? null : URL.createObjectURL(f),
          cleanUrl: null,
        });
      }
      this._renderBody();
      for (const it of this.items) {
        if (it.kind !== "video" || it.poster !== void 0) continue;
        it.poster = null;
        this._videoPoster(it.file).then((p) => {
          if (!p) return;
          it.poster = p;
          try {
            this._refreshItem(it);
          } catch (_) {}
        });
      }
      if (rejected > 0)
        this._flashSub(
          `${t("errFile", "Invalid file")} \u2014 ${rejected}/${all.length}`,
        );
    }
    _flashSub(msg) {
      const el = this.overlay?.querySelector("#wmtoolSub");
      if (!el) return;
      clearTimeout(this._subTimer);
      el.textContent = msg;
      el.style.color = "#f59e0b";
      this._subTimer = setTimeout(() => {
        this._subTimer = null;
        el.style.color = "";
        this._syncFoot();
      }, 3200);
    }
    _syncFoot() {
      const ov = this.overlay;
      if (!ov) return;
      const btn = ov.querySelector("#wmtoolAction");
      const stop = ov.querySelector("#wmtoolStop");
      const scope = ov.querySelector("#wmtoolDownloadScope");
      const includeAll = ov.querySelector("#wmtoolDownloadAllFiles");
      const cnt = ov.querySelector("#wmtoolCount");
      if (!btn || !stop || !scope || !includeAll || !cnt) {
        console.warn("[Watermark] ch\xE2n panel thi\u1EBFu ph\u1EA7n t\u1EED");
        return;
      }
      const label = ov.querySelector("#wmtoolActionLabel") || btn;
      const done = this.items.filter((i) => i.status === "done");
      const finished = this.items.filter(
        (i) =>
          i.status === "done" || i.status === "kept" || i.status === "error",
      );
      const pending = this.items.filter((i) => i.status === "waiting");
      stop.classList.toggle("hidden", !this.running);
      scope.classList.toggle(
        "hidden",
        this.running || pending.length > 0 || finished.length === 0,
      );
      const clr = ov.querySelector("#wmtoolClear");
      if (clr) {
        clr.classList.toggle("hidden", this.items.length === 0);
        clr.disabled = this.running;
      }
      if (this.running) {
        const n = this.items.filter(
          (i) => i.status !== "waiting" && i.status !== "running",
        ).length;
        btn.disabled = true;
        cnt.textContent = `${n}/${this.items.length}`;
        label.textContent = t("run", "Remove watermark");
      } else if (pending.length) {
        btn.disabled = false;
        cnt.textContent = `${pending.length} ${t("cntPending", "pending")}`;
        label.textContent = `${t("run", "Remove watermark")} (${pending.length})`;
      } else if (finished.length) {
        const downloadCount = includeAll.checked
          ? finished.length
          : done.length;
        btn.disabled = downloadCount === 0;
        cnt.textContent = `${done.length} ${t("cntDone", "cleaned")} \xB7 ${finished.length} ${t("cntFinished", "processed")}`;
        label.textContent = `${t("dlAll", "Download all")} (${downloadCount})`;
      } else {
        btn.disabled = true;
        cnt.textContent = this.items.length
          ? `${this.items.length} ${t("cntImages", "images")}`
          : t("empty", "No images yet");
        label.textContent = t("run", "Remove watermark");
      }
      if (!this._subTimer) {
        ov.querySelector("#wmtoolSub").textContent = this.running
          ? `${this.items.filter((i) => i.status === "done" || i.status === "kept").length} / ${this.items.length}`
          : t("sub", "Gemini \xB7 Flow");
      }
    }
    _onAction() {
      const pending = this.items.filter((i) => i.status === "waiting");
      if (pending.length > 0) return this._runQueue();
      const includeAll =
        this.overlay?.querySelector("#wmtoolDownloadAllFiles")?.checked ===
        true;
      const downloadable = includeAll
        ? this.items.filter(
            (i) =>
              i.status === "done" ||
              i.status === "kept" ||
              i.status === "error",
          )
        : this.items.filter((i) => i.status === "done");
      for (const it of downloadable)
        this._download(it, includeAll && it.status !== "done");
    }
    async _runQueue() {
      this.running = true;
      this.stopped = false;
      this._syncFoot();
      try {
        for (const it of this.items) {
          if (this.stopped) break;
          if (it.status !== "waiting") continue;
          it.status = "running";
          try {
            this._refreshItem(it);
          } catch (e) {
            console.warn(
              "[Watermark] l\u1ED7i v\u1EBD l\u1EA1i d\xF2ng:",
              e?.message,
            );
          }
          try {
            await this._processOne(it);
          } catch (err) {
            if (err?.code === "CANCELLED" || err?.message === "CANCELLED") {
              it.status = "waiting";
              it.progress = null;
            } else {
              it.status = "error";
              it.error = this._errText(err?.code, err?.message);
              console.error(
                "[Watermark] x\u1EED l\xFD th\u1EA5t b\u1EA1i:",
                it.file?.name,
                err?.code,
                err?.message,
                err,
              );
            }
          }
          try {
            this._refreshItem(it);
          } catch (e) {
            console.warn(
              "[Watermark] l\u1ED7i v\u1EBD l\u1EA1i d\xF2ng:",
              e?.message,
            );
          }
        }
      } finally {
        this.running = false;
        try {
          this._syncFoot();
        } catch (e) {
          console.warn(
            "[Watermark] l\u1ED7i c\u1EADp nh\u1EADt ch\xE2n panel:",
            e?.message,
          );
        }
      }
    }
    async _processOne(it) {
      if (it.kind === "video") return this._processVideo(it);
      const base64 = await this._fileToBase64(it.file);
      const [natW, natH] = await this._imageSize(it.origUrl);
      it.natW = natW;
      it.natH = natH;
      const resp = await chrome.runtime.sendMessage({
        action: "removeWatermark",
        base64,
        mime: it.file.type,
      });
      if (!resp?.success) {
        it.status = "error";
        it.error = this._errText(resp?.error);
        return;
      }
      it.result = resp;
      it.threshold = resp.threshold ?? null;
      if (!resp.applied) {
        it.status = "kept";
        return;
      }
      const bin = atob(resp.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      it.cleanUrl = URL.createObjectURL(
        new Blob([bytes], { type: resp.mime || "image/png" }),
      );
      it.status = "done";
    }
    async _processVideo(it) {
      if (!self.VideoWmClient) {
        it.status = "error";
        it.error = this._errText("NO_VIDEO_MODULE");
        return;
      }
      const cfgResp = await chrome.runtime.sendMessage({
        action: "getWatermarkConfig",
        mediaType: "video",
      });
      if (!cfgResp?.success) {
        it.status = "error";
        it.error = this._errText(cfgResp?.error);
        return;
      }
      const r = await self.VideoWmClient.process(it.file, cfgResp.cfg, {
        isCancelled: () => this.stopped,
        onProgress: (p) => {
          it.progress = p;
          try {
            this._refreshItem(it);
          } catch (_) {}
        },
      });
      it.result = r;
      it.progress = null;
      if (!r.applied) {
        it.status = "kept";
        return;
      }
      it.cleanUrl = URL.createObjectURL(r.blob);
      it.cleanSize = r.blob.size;
      it.status = "done";
    }
    _errText(code, message) {
      if (!code)
        return message
          ? String(message).slice(0, 120)
          : t("errGeneric", "Error");
      const map = {
        NOT_ALLOWED: "locked",
        PLAN_REQUIRED: "locked",
        FEATURE_DISABLED: "errDisabled",
        AUTH_REQUIRED: "errAuth",
        NO_CONFIG: "errConfig",
        CONFIG_MISSING: "errConfig",
        CORE_NOT_LOADED: "errCore",
        NETWORK: "errNetwork",
        TOO_LARGE: "errTooLarge",
        CANNOT_DECODE: "errCodec",
        NO_VIDEO_MODULE: "errCore",
      };
      const fallbacks = {
        locked: "T\xEDnh n\u0103ng c\u1EE7a g\xF3i Premium",
        errDisabled: "T\xEDnh n\u0103ng \u0111ang t\u1EA1m t\u1EAFt",
        errAuth: "Vui l\xF2ng \u0111\u0103ng nh\u1EADp",
        errConfig: "Ch\u01B0a c\xF3 c\u1EA5u h\xECnh t\u1EEB m\xE1y ch\u1EE7",
        errCore:
          "Extension ch\u01B0a n\u1EA1p \u0111\u1EE7 \u2014 h\xE3y t\u1EA3i l\u1EA1i extension",
        errNetwork:
          "Kh\xF4ng k\u1EBFt n\u1ED1i \u0111\u01B0\u1EE3c m\xE1y ch\u1EE7",
        errTooLarge: "Clip qu\xE1 l\u1EDBn (tr\u1EA7n 300 MB)",
        errCodec:
          "\u0110\u1ECBnh d\u1EA1ng video kh\xF4ng gi\u1EA3i m\xE3 \u0111\u01B0\u1EE3c",
      };
      const key = map[code];
      if (key) return t(key, fallbacks[key]);
      if (String(code).startsWith("NOT_IMAGE"))
        return t("errFile", "Invalid file");
      if (/^HTTP_/.test(String(code)))
        return t("errNetwork", "Cannot reach the server");
      if (message && String(message) !== String(code))
        return String(message).slice(0, 120);
      return code;
    }
    _download(it, original = false) {
      if (!original && !it.cleanUrl) return;
      const transientOriginalUrl =
        original && !it.origUrl ? URL.createObjectURL(it.file) : null;
      const url = original ? it.origUrl || transientOriginalUrl : it.cleanUrl;
      if (!url) return;
      const ext =
        it.kind === "video"
          ? "mp4"
          : /jpe?g/i.test(it.result?.mime || "")
            ? "jpg"
            : "png";
      const base = it.name.replace(/\.[^.]+$/, "");
      const request = chrome.runtime.sendMessage({
        action: "chromeDownload",
        url,
        filename: original ? it.name : `${base}_clean.${ext}`,
      });
      if (transientOriginalUrl)
        Promise.resolve(request).finally(() =>
          URL.revokeObjectURL(transientOriginalUrl),
        );
    }
    _fileToBase64(file) {
      return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result).split(",")[1]);
        fr.onerror = () => reject(new Error("READ_FAIL"));
        fr.readAsDataURL(file);
      });
    }
    _imageSize(url) {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve([img.naturalWidth, img.naturalHeight]);
        img.onerror = () => resolve([0, 0]);
        img.src = url;
      });
    }
    _esc(s) {
      return String(s == null ? "" : s).replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
    }
  }
  window.WatermarkToolModal = WatermarkToolModal;
  window.watermarkToolModal = new WatermarkToolModal();
})();
