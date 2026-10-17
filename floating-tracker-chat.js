(function () {
  "use strict";
  const STATE_CONFIG = {
    PENDING: {
      label: "Pending",
      bg: "rgba(255,255,255,0.08)",
      color: "rgba(255,255,255,0.5)",
    },
    SUBMITTING: {
      label: "Submitting",
      bg: "rgba(59,130,246,0.2)",
      color: "#60a5fa",
    },
    SUBMITTED: {
      label: "Submitted",
      bg: "rgba(59,130,246,0.15)",
      color: "#93c5fd",
    },
    MONITORING: {
      label: "Running",
      bg: "rgba(168,85,247,0.2)",
      color: "#c084fc",
    },
    RETRY_SUBMIT: {
      label: "Retry",
      bg: "rgba(249,115,22,0.2)",
      color: "#fb923c",
    },
    COMPLETED: { label: "Done", bg: "rgba(34,197,94,0.2)", color: "#4ade80" },
    PARTIAL_FAIL: {
      label: "Partial",
      bg: "rgba(234,179,8,0.2)",
      color: "#facc15",
    },
    FAILED: { label: "Failed", bg: "rgba(239,68,68,0.2)", color: "#f87171" },
    CANCELLED: {
      label: "Cancelled",
      bg: "rgba(107,114,128,0.2)",
      color: "#9ca3af",
    },
  };
  const OWNER_COLORS = {
    prompts: "#3b82f6",
    task: "#f97316",
    workflow: "#a855f7",
    angles: "#ec4899",
    telegram: "#06b6d4",
  };
  function escHtml(str) {
    if (str === null || str === void 0) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function formatTime(ms) {
    if (!ms || ms < 0) return "00:00";
    const s = Math.floor(ms / 1e3);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return (m < 10 ? "0" : "") + m + ":" + (sec < 10 ? "0" : "") + sec;
  }
  function createFloatingTrackerRich(opts) {
    const id = opts.id;
    const title = opts.title || "Toby Flow";
    const rightOffset =
      typeof opts.rightOffset === "number" ? opts.rightOffset : 16;
    const tracker = {
      _el: null,
      _hideTimer: null,
      _expandedJobs: new Set(),
      _manuallyCollapsed: new Set(),
      _lastData: null,
      _legacyData: null,
      _providerProgress: null,
      _startTime: null,
      _elapsedTimer: null,
      _create() {
        if (this._el && document.body.contains(this._el)) return;
        const existing = document.getElementById(id);
        if (existing) existing.remove();
        this._el = null;
        const el = document.createElement("div");
        el.id = id;
        el.style.cssText =
          "position:fixed;bottom:16px;right:" +
          rightOffset +
          'px;width:420px;background:linear-gradient(160deg,rgba(30,40,32,0.78),rgba(20,28,23,0.82));-webkit-backdrop-filter:blur(22px) saturate(1.4);backdrop-filter:blur(22px) saturate(1.4);border:1px solid rgba(255,255,255,0.12);border-radius:20px;box-shadow:0 16px 48px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.07);z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13px;color:#fff;display:none;overflow:hidden;';
        const header = document.createElement("div");
        header.className = "tobyflow-ft-header";
        header.style.cssText =
          "display:flex !important;align-items:center !important;gap:7px;padding:10px 14px;background:rgba(255,255,255,0.03);border-bottom:1px solid rgba(255,255,255,0.07);cursor:grab;user-select:none;";
        header.innerHTML =
          '<span class="tobyflow-ft-logo" style="flex-shrink:0;display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:7px;overflow:hidden;background:rgba(204,255,0,0.14);"><svg viewBox="0 0 24 24" fill="none" stroke="#ccff00" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;width:13px;height:13px"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></span><span class="tobyflow-ft-title" style="font-weight:700;font-size:12.5px;white-space:nowrap;letter-spacing:0.2px;flex-shrink:0;">' +
          escHtml(title) +
          '</span><span style="margin-left:auto !important;display:flex !important;align-items:center !important;gap:7px;flex-shrink:0 !important;flex-grow:0 !important;"><span class="tobyflow-ft-counter" style="font-size:11px;opacity:0.75;font-variant-numeric:tabular-nums;flex-shrink:0;"></span><span class="tobyflow-ft-elapsed" style="font-size:10px;opacity:0.5;font-variant-numeric:tabular-nums;flex-shrink:0;padding-right:15px;"></span><button class="tobyflow-ft-skip-blocker" title="Unblock interaction (automation keeps running)" style="width:24px !important;height:24px !important;min-width:24px !important;padding:0 !important;margin:0 !important;box-sizing:border-box !important;background:rgba(204,255,0,0.14);border:none;border-radius:7px;color:#ccff00;cursor:pointer;display:flex !important;align-items:center !important;justify-content:center !important;flex-shrink:0;line-height:0 !important;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block !important;width:12px !important;height:12px !important;flex-shrink:0;margin:auto !important;"><path d="M7 11V7a5 5 0 0 1 9.9-1"/><rect x="3" y="11" width="18" height="10" rx="2"/></svg></button><button class="tobyflow-ft-stop-all" title="Stop all" style="width:24px !important;height:24px !important;min-width:24px !important;padding:0 !important;margin:0 !important;box-sizing:border-box !important;background:rgba(239,68,68,0.16);border:none;border-radius:7px;color:#f87171;cursor:pointer;display:flex !important;align-items:center !important;justify-content:center !important;flex-shrink:0;line-height:0 !important;"><svg viewBox="0 0 24 24" fill="currentColor" style="display:block !important;width:11px !important;height:11px !important;flex-shrink:0;margin:auto !important;vertical-align:middle !important"><rect x="6" y="6" width="12" height="12" rx="1"/></svg></button></span>';
        el.appendChild(header);
        const self = this;
        header
          .querySelector(".tobyflow-ft-stop-all")
          .addEventListener("click", function () {
            self._sendAction("pq:stopAll", {
              stopSource: "CHAT_FLOATING_TRACKER_STOP_ALL",
            });
          });
        const _skipBtn = header.querySelector(".tobyflow-ft-skip-blocker");
        if (_skipBtn)
          _skipBtn.addEventListener("click", function () {
            try {
              if (typeof opts.onSkipBlocker === "function")
                opts.onSkipBlocker();
            } catch (_) {}
          });
        const progress = document.createElement("div");
        progress.style.cssText =
          "height:3px;background:rgba(255,255,255,0.06);overflow:hidden;";
        progress.innerHTML =
          '<div class="tobyflow-ft-progress-fill" style="height:100%;width:100%;background:linear-gradient(90deg,#a3e635,#ccff00,#e2ff66);transform:scaleX(0);transform-origin:left;transition:transform 0.3s ease-out;will-change:transform;"></div>';
        el.appendChild(progress);
        if (!document.getElementById("tobyflow-ftr-animations")) {
          const style = document.createElement("style");
          style.id = "tobyflow-ftr-animations";
          style.textContent =
            "@keyframes tobyflow-ftr-pulse{0%,100%{opacity:1}50%{opacity:0.6}}@keyframes tobyflow-ftr-glow{0%,100%{opacity:0.5}50%{opacity:1}}@keyframes tobyflow-ftr-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}@keyframes tobyflow-ftr-spin{to{transform:rotate(360deg)}}.tobyflow-ft-progress-fill.active{animation:tobyflow-ftr-glow 1.5s ease-in-out infinite}.tobyflow-ft-dot-pulse{animation:tobyflow-ftr-pulse 1.5s ease-in-out infinite}.tobyflow-chat-ft-thumb{position:relative;width:42px;height:42px;border-radius:6px;overflow:hidden;flex:0 0 42px;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.34)}.tobyflow-chat-ft-thumb>img,.tobyflow-chat-ft-thumb>video{width:100%;height:100%;object-fit:cover;display:block;background:#0c1320}.tobyflow-chat-ft-skeleton{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:linear-gradient(110deg,#2e2e33 30%,#3b3b40 50%,#2e2e33 70%);background-size:200% 100%;animation:tobyflow-ftr-shimmer 1.5s ease-in-out infinite}.tobyflow-chat-ft-loader{display:block;width:16px;height:16px;box-sizing:border-box;border:2px solid rgba(255,255,255,.2);border-top-color:#ccff00;border-radius:50%;transform-origin:center;animation:tobyflow-ftr-spin .9s linear infinite !important}.tobyflow-chat-ft-placeholder svg{display:block;width:20px;height:20px}@media (prefers-reduced-motion:reduce){.tobyflow-chat-ft-skeleton,.tobyflow-ft-dot-pulse,.tobyflow-ft-progress-fill.active{animation:none}}";
          document.head.appendChild(style);
        }
        const pipelineRow = document.createElement("div");
        pipelineRow.className = "tobyflow-ft-pipeline";
        pipelineRow.style.cssText =
          "display:none;padding:6px 12px;font-size:11px;color:rgba(255,255,255,0.7);border-bottom:1px solid rgba(255,255,255,0.06);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
        el.appendChild(pipelineRow);
        const jobsWrap = document.createElement("div");
        jobsWrap.className = "tobyflow-ft-jobs";
        jobsWrap.style.cssText =
          "max-height:320px;overflow-y:auto;overflow-x:hidden;";
        el.appendChild(jobsWrap);
        const statusEl = document.createElement("div");
        statusEl.className = "tobyflow-ft-status";
        statusEl.style.cssText =
          "padding:8px 12px;font-size:11px;color:rgba(255,255,255,0.7);display:none;align-items:center;gap:8px;";
        el.appendChild(statusEl);
        document.body.appendChild(el);
        this._el = el;
        try {
          chrome.storage.local.get(["af_system_settings"], (res) => {
            const s = (res && res.af_system_settings) || {};
            const name = s.app_name;
            const logo = s.app_logo_url;
            const titleEl = el.querySelector(".tobyflow-ft-title");
            if (name && titleEl) titleEl.textContent = name;
            const logoEl = el.querySelector(".tobyflow-ft-logo");
            if (logo && logoEl) {
              logoEl.style.background = "transparent";
              logoEl.innerHTML =
                '<img src="' +
                logo +
                '" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">';
            }
          });
        } catch (_) {}
        (function makeDraggable() {
          const hdr = el.querySelector(".tobyflow-ft-header");
          if (!hdr) return;
          let dragging = false,
            sx = 0,
            sy = 0,
            ox = 0,
            oy = 0;
          hdr.addEventListener("mousedown", function (e) {
            if (e.target.closest("button")) return;
            const r = el.getBoundingClientRect();
            el.style.left = r.left + "px";
            el.style.top = r.top + "px";
            el.style.right = "auto";
            el.style.bottom = "auto";
            dragging = true;
            sx = e.clientX;
            sy = e.clientY;
            ox = r.left;
            oy = r.top;
            hdr.style.cursor = "grabbing";
            e.preventDefault();
          });
          document.addEventListener("mousemove", function (e) {
            if (!dragging) return;
            let nx = ox + e.clientX - sx,
              ny = oy + e.clientY - sy;
            nx = Math.max(0, Math.min(nx, window.innerWidth - el.offsetWidth));
            ny = Math.max(0, Math.min(ny, window.innerHeight - 40));
            el.style.left = nx + "px";
            el.style.top = ny + "px";
          });
          document.addEventListener("mouseup", function () {
            if (dragging) {
              dragging = false;
              hdr.style.cursor = "grab";
            }
          });
        })();
        this._setupJobsDelegation(jobsWrap);
      },
      _setupJobsDelegation(container) {
        const self = this;
        container.addEventListener("click", function (e) {
          const actionEl = e.target.closest("[data-action]");
          if (actionEl) {
            e.stopPropagation();
            const action = actionEl.getAttribute("data-action");
            const jobId = actionEl.getAttribute("data-job-id");
            if (action === "stop")
              self._sendAction("pq:stopJob", {
                jobId,
                stopSource: "CHAT_FLOATING_TRACKER_JOB_STOP",
              });
            else if (action === "pause")
              self._sendAction("pq:pauseJob", { jobId });
            else if (action === "resume")
              self._sendAction("pq:resumeJob", { jobId });
            return;
          }
          const headerEl = e.target.closest("[data-job-toggle]");
          if (headerEl) {
            const toggleJobId = headerEl.getAttribute("data-job-toggle");
            if (self._expandedJobs.has(toggleJobId)) {
              self._expandedJobs.delete(toggleJobId);
              self._manuallyCollapsed.add(toggleJobId);
            } else {
              self._expandedJobs.add(toggleJobId);
              self._manuallyCollapsed.delete(toggleJobId);
            }
            if (self._lastData) self._renderJobs(self._lastData.jobs || []);
          }
        });
      },
      _sendAction(action, data) {
        try {
          const payload = Object.assign({ action }, data || {});
          chrome.runtime.sendMessage(payload, function () {
            if (chrome.runtime.lastError) {
            }
          });
        } catch (e) {
          console.warn("[FloatingTrackerRich] _sendAction failed:", e.message);
        }
      },
      updateFromQueue(data) {
        this._create();
        if (!data) return;
        this._lastData = data;
        clearTimeout(this._hideTimer);
        const el = this._el;
        const completed = data.completed || 0;
        const total = data.total || 0;
        const isRunning = data.isRunning;
        const jobs = data.jobs || [];
        const statusEl = el.querySelector(".tobyflow-ft-status");
        if (statusEl) statusEl.style.display = "none";
        if (!isRunning || total === 0) {
          if (completed > 0) {
            el.style.display = "block";
            el.querySelector(".tobyflow-ft-counter").textContent =
              completed + "/" + total + " done";
            const progressFill2 = el.querySelector(
              ".tobyflow-ft-progress-fill",
            );
            progressFill2.style.transform = "scaleX(1)";
            progressFill2.classList.remove("active");
            el.querySelector(".tobyflow-ft-elapsed").textContent = "";
            const stopBtn2 = el.querySelector(".tobyflow-ft-stop-all");
            if (stopBtn2) stopBtn2.style.display = "none";
            const pRow = el.querySelector(".tobyflow-ft-pipeline");
            if (pRow) pRow.style.display = "none";
            this._renderJobs(jobs);
            const self = this;
            this._hideTimer = setTimeout(function () {
              self.hide();
            }, 3e3);
          } else {
            this.hide();
          }
          return;
        }
        el.style.display = "block";
        const stopBtn = el.querySelector(".tobyflow-ft-stop-all");
        if (stopBtn) stopBtn.style.display = "";
        const activeProgress = this._activeProviderProgress(jobs);
        const pct =
          total > 0
            ? Math.min(
                100,
                Math.round(
                  ((completed +
                    (activeProgress ? activeProgress.value / 100 : 0)) /
                    total) *
                    100,
                ),
              )
            : 0;
        el.querySelector(".tobyflow-ft-counter").textContent =
          completed +
          "/" +
          total +
          (activeProgress ? " \xB7 " + activeProgress.value + "%" : "");
        el.querySelector(".tobyflow-ft-counter").style.color = activeProgress
          ? "#c084fc"
          : "";
        const progressFill = el.querySelector(".tobyflow-ft-progress-fill");
        progressFill.style.transform = "scaleX(" + pct / 100 + ")";
        progressFill.classList.add("active");
        el.querySelector(".tobyflow-ft-elapsed").textContent = formatTime(
          data.elapsed,
        );
        this._renderPipelineRow(data.pipeline);
        this._renderJobs(jobs);
      },
      _renderPipelineRow(pipeline) {
        const row = this._el.querySelector(".tobyflow-ft-pipeline");
        if (!pipeline) {
          row.style.display = "none";
          return;
        }
        const sent = (pipeline.editor && pipeline.editor.processedCount) || 0;
        const tm = pipeline.tileMonitor || {};
        const active = tm.activeCount || 0;
        const done = tm.completedCount || 0;
        const failed = tm.failedCount || 0;
        if (sent === 0 && active === 0 && done === 0 && failed === 0) {
          row.style.display = "none";
          return;
        }
        const sep = '<span style="opacity:0.3;margin:0 5px;">\u2022</span>';
        const failedColor = failed > 0 ? "#f87171" : "rgba(255,255,255,0.35)";
        const activeColor = active > 0 ? "#c084fc" : "rgba(255,255,255,0.35)";
        const html =
          '<span style="color:#93c5fd;">\u25B6 ' +
          sent +
          " sent</span>" +
          sep +
          '<span style="color:' +
          activeColor +
          ';">\u26A1 ' +
          active +
          " active</span>" +
          sep +
          '<span style="color:#4ade80;">\u2713 ' +
          done +
          " done</span>" +
          sep +
          '<span style="color:' +
          failedColor +
          ';">\u2715 ' +
          failed +
          " failed</span>";
        row.style.display = "";
        row.innerHTML = html;
      },
      _activeProviderProgress(jobs) {
        if (typeof this._providerProgress !== "number") return null;
        const active = [];
        for (const job of jobs || []) {
          for (const item of job.items || []) {
            if (item.state === "SUBMITTING" || item.state === "MONITORING")
              active.push({ job, item });
          }
        }
        return active.length === 1
          ? { ...active[0], value: this._providerProgress }
          : null;
      },
      _mediaPlaceholderIcon(item) {
        const mode = String(
          item?.genType || item?.mediaType || "",
        ).toLowerCase();
        if (mode.includes("text")) {
          return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h9l3 3v15H6z"/><path d="M9 11h6M9 15h6M9 7h3"/></svg>';
        }
        if (mode.includes("video") || item?.thumbVideo === true) {
          return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 9 5-3v12l-5-3z"/></svg>';
        }
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
      },
      _safeMediaUrl(value) {
        const url = typeof value === "string" ? value.trim() : "";
        return /^(https?:|blob:|data:image\/|data:video\/)/i.test(url)
          ? url
          : null;
      },
      _thumbnailHtml(item) {
        const result = Array.isArray(item?.results) ? item.results[0] : null;
        const isVideo =
          String(item?.genType || item?.mediaType || "")
            .toLowerCase()
            .includes("video") ||
          item?.thumbVideo === true ||
          result?.video === true;
        const mediaUrl =
          this._safeMediaUrl(item?.thumb) ||
          this._safeMediaUrl(result?.thumbnail || result?.poster) ||
          this._safeMediaUrl(result?.url || result?.playUrl);
        if (mediaUrl) {
          const tag =
            isVideo && !result?.thumbnail && !result?.poster
              ? '<video src="' +
                escHtml(mediaUrl) +
                '" muted playsinline preload="metadata"></video>'
              : '<img src="' + escHtml(mediaUrl) + '" alt="">';
          return '<span class="tobyflow-chat-ft-thumb">' + tag + "</span>";
        }
        const active =
          ["SUBMITTING", "SUBMITTED", "MONITORING", "RETRY_SUBMIT"].includes(
            item?.state,
          ) && item?.apiWaiting !== true;
        if (active) {
          const delay = -(Date.now() % 900);
          return (
            '<span class="tobyflow-chat-ft-thumb"><span class="tobyflow-chat-ft-skeleton" aria-busy="true"><span class="tobyflow-chat-ft-loader" style="animation-delay:' +
            delay +
            'ms" aria-hidden="true"></span></span></span>'
          );
        }
        return (
          '<span class="tobyflow-chat-ft-thumb tobyflow-chat-ft-placeholder">' +
          this._mediaPlaceholderIcon(item) +
          "</span>"
        );
      },
      _renderJobs(jobs) {
        const jobsEl = this._el.querySelector(".tobyflow-ft-jobs");
        if (!jobs || jobs.length === 0) {
          jobsEl.innerHTML = "";
          return;
        }
        const self = this;
        const now = Date.now();
        const activeProgress = self._activeProviderProgress(jobs);
        let html = "";
        for (let i = 0; i < jobs.length; i++) {
          const j = jobs[i];
          const color = OWNER_COLORS[j.owner] || "#6b7280";
          const isDone = j.status === "completed" || j.status === "stopped";
          const isActive = j.status === "running" || j.status === "paused";
          const jobNativeProgress =
            activeProgress?.job === j ? activeProgress.value : null;
          const jobPct =
            j.total > 0
              ? Math.min(
                  100,
                  Math.round(
                    ((j.completed +
                      (jobNativeProgress !== null
                        ? jobNativeProgress / 100
                        : 0)) /
                      j.total) *
                      100,
                  ),
                )
              : 0;
          const jobElapsed = j.startedAt ? formatTime(now - j.startedAt) : "";
          const hasResultMedia = !!j.items?.some(
            (item) => Array.isArray(item?.results) && item.results.length > 0,
          );
          if (isActive && !self._manuallyCollapsed.has(j.id)) {
            self._expandedJobs.add(j.id);
          } else if (isDone) {
            if (hasResultMedia) self._expandedJobs.add(j.id);
            else self._expandedJobs.delete(j.id);
            self._manuallyCollapsed.delete(j.id);
          }
          const isExpanded = self._expandedJobs.has(j.id);
          const hasRetrying =
            isActive &&
            j.items &&
            j.items.some(function (it) {
              return it.state === "RETRY_SUBMIT";
            });
          let statusBadge = "";
          if (hasRetrying) {
            statusBadge =
              '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(249,115,22,0.2);color:#fb923c;">retrying</span>';
          } else if (isDone) {
            const doneColor = j.status === "completed" ? "#4ade80" : "#f87171";
            const doneBg =
              j.status === "completed"
                ? "rgba(34,197,94,0.2)"
                : "rgba(239,68,68,0.2)";
            const doneLabel = j.status === "completed" ? "done" : "stopped";
            statusBadge =
              '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:' +
              doneBg +
              ";color:" +
              doneColor +
              ';">' +
              doneLabel +
              "</span>";
          } else if (j.status === "paused") {
            statusBadge =
              '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(234,179,8,0.2);color:#facc15;">paused</span>';
          }
          let failBadge = "";
          if (j.failed > 0) {
            failBadge =
              '<span style="font-size:9px;padding:1px 4px;border-radius:3px;background:rgba(239,68,68,0.2);color:#f87171;margin-left:2px;">' +
              j.failed +
              " err</span>";
          }
          let actions = "";
          if (isActive) {
            if (j.owner === "prompts" && j.status === "paused") {
              actions +=
                '<button data-action="resume" data-job-id="' +
                escHtml(j.id) +
                '" title="Resume" style="width:20px;height:20px;min-width:20px;padding:0;margin:0;box-sizing:border-box;background:rgba(34,197,94,0.15);border:none;border-radius:4px;color:#4ade80;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:0;flex-shrink:0;margin-right:3px;"><svg viewBox="0 0 24 24" fill="currentColor" style="display:block;width:10px;height:10px;flex-shrink:0;margin:auto"><polygon points="8,6 18,12 8,18"/></svg></button>';
            } else if (j.owner === "prompts" && j.status === "running") {
              actions +=
                '<button data-action="pause" data-job-id="' +
                escHtml(j.id) +
                '" title="Pause" style="width:20px;height:20px;min-width:20px;padding:0;margin:0;box-sizing:border-box;background:rgba(234,179,8,0.15);border:none;border-radius:4px;color:#facc15;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:0;flex-shrink:0;margin-right:3px;"><svg viewBox="0 0 24 24" fill="currentColor" style="display:block;width:10px;height:10px;flex-shrink:0;margin:auto"><rect x="7" y="6" width="3" height="12" rx="1"/><rect x="14" y="6" width="3" height="12" rx="1"/></svg></button>';
            }
            actions +=
              '<button data-action="stop" data-job-id="' +
              escHtml(j.id) +
              '" title="Stop" style="width:20px;height:20px;min-width:20px;padding:0;margin:0;box-sizing:border-box;background:rgba(239,68,68,0.15);border:none;border-radius:4px;color:#ef4444;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:0;flex-shrink:0;"><svg viewBox="0 0 24 24" fill="currentColor" style="display:block;width:10px;height:10px;flex-shrink:0;margin:auto"><rect x="7" y="7" width="10" height="10" rx="1"/></svg></button>';
          }
          const jobOpacity = isDone && !hasResultMedia ? "opacity:0.5;" : "";
          html +=
            '<div style="padding:4px 12px;border-bottom:1px solid rgba(255,255,255,0.05);' +
            jobOpacity +
            '">';
          html +=
            '<div class="tobyflow-ft-job-header" data-job-toggle="' +
            escHtml(j.id) +
            '" style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:3px 0;">';
          html +=
            '<span class="' +
            (isActive ? "tobyflow-ft-dot-pulse" : "") +
            '" style="width:8px;height:8px;border-radius:50%;background:' +
            color +
            ';flex-shrink:0;"></span>';
          html +=
            '<span style="flex:1;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;">' +
            escHtml(j.label || j.owner) +
            "</span>";
          html += statusBadge + failBadge;
          html +=
            '<span style="font-size:10px;opacity:0.5;font-variant-numeric:tabular-nums;flex-shrink:0;">' +
            jobElapsed +
            "</span>";
          html +=
            '<span style="font-size:10px;color:#c084fc;font-variant-numeric:tabular-nums;flex-shrink:0;">' +
            jobPct +
            "%</span>";
          html +=
            '<div style="display:flex;gap:2px;flex-shrink:0;">' +
            actions +
            "</div>";
          html +=
            '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;transition:transform 0.2s;' +
            (isExpanded ? "transform:rotate(180deg);" : "") +
            '"><polyline points="6 9 12 15 18 9"/></svg>';
          html += "</div>";
          html +=
            '<div style="height:2px;background:rgba(255,255,255,0.08);border-radius:1px;margin:3px 0;overflow:hidden;">';
          html +=
            '<div style="height:100%;width:100%;background:' +
            color +
            ";border-radius:1px;transform:scaleX(" +
            jobPct / 100 +
            ');transform-origin:left;transition:transform 0.3s ease-out;will-change:transform;"></div>';
          html += "</div>";
          if (isExpanded && j.items && j.items.length > 0) {
            html += '<div style="padding:0px;margin-left:4px;">';
            const displayItems = j.items.slice(-12);
            for (let k = 0; k < displayItems.length; k++) {
              const it = displayItems[k];
              const sc = STATE_CONFIG[it.state] || STATE_CONFIG.PENDING;
              const providerProgress =
                activeProgress?.item === it ? activeProgress.value : null;
              const itemPrompt = String(
                it.promptText || it.prompt || "",
              ).trim();
              const promptShort =
                itemPrompt.length > 50
                  ? itemPrompt.substring(0, 50) + "..."
                  : itemPrompt;
              let timeInfo = "";
              if (it.completedAt && it.submittedAt) {
                timeInfo = formatTime(it.completedAt - it.submittedAt);
              } else if (it.submittedAt) {
                timeInfo = formatTime(now - it.submittedAt);
              }
              let retryBadge = "";
              if (it.retryCount > 0) {
                retryBadge =
                  '<span style="font-size:8px;padding:0 3px;border-radius:2px;background:rgba(249,115,22,0.2);color:#fb923c;">x' +
                  it.retryCount +
                  "</span>";
              }
              const itemBg =
                it.state === "SUBMITTING" || it.state === "MONITORING"
                  ? "background:rgba(255,255,255,0.03);border-radius:4px;"
                  : "";
              html +=
                '<div style="display:flex;align-items:center;gap:5px;padding:4px 4px;font-size:11px;' +
                itemBg +
                '">';
              html += self._thumbnailHtml(it);
              html +=
                '<span style="color:rgba(255,255,255,0.4);font-size:10px;width:18px;flex-shrink:0;font-variant-numeric:tabular-nums;">#' +
                ((it.promptIndex || 0) + 1) +
                "</span>";
              html +=
                '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:rgba(255,255,255,0.7);" title="' +
                escHtml(itemPrompt) +
                '">' +
                escHtml(promptShort || j.label || title) +
                "</span>";
              html += retryBadge;
              if (timeInfo) {
                html +=
                  '<span style="font-size:9px;opacity:0.4;font-variant-numeric:tabular-nums;flex-shrink:0;">' +
                  timeInfo +
                  "</span>";
              }
              const statusLabel =
                providerProgress !== null ? providerProgress + "%" : sc.label;
              const badgeStyle =
                providerProgress !== null ? STATE_CONFIG.MONITORING : sc;
              html +=
                '<span style="font-size:9px;padding:1px 4px;border-radius:3px;background:' +
                badgeStyle.bg +
                ";color:" +
                badgeStyle.color +
                ';flex-shrink:0;white-space:nowrap;font-variant-numeric:tabular-nums;">' +
                statusLabel +
                "</span>";
              html += "</div>";
            }
            if (j.items.length > 12) {
              html +=
                '<div style="font-size:10px;opacity:0.4;padding:2px 4px;">... and ' +
                (j.items.length - 12) +
                " more</div>";
            }
            html += "</div>";
          }
          html += "</div>";
        }
        jobsEl.innerHTML = html;
      },
      show(data) {
        this._create();
        this._el.style.display = "block";
        this._startTime = Date.now();
        this._lastData = null;
        this._legacyData = null;
        this._providerProgress = null;
        this._startElapsedTimer();
        this.update(data);
      },
      update(data) {
        if (!this._el) return;
        const d = data || {};
        this._legacyData = Object.assign({}, this._legacyData || {}, d);
        const view = this._legacyData;
        const current = view.current || 0;
        const total = view.total || 1;
        const phase = String(view.phase || "").trim();
        const prompt = String(view.prompt || "").trim();
        const pct = total > 0 ? Math.round((current / total) * 100) : 0;
        const counterEl = this._el.querySelector(".tobyflow-ft-counter");
        const progressFill = this._el.querySelector(
          ".tobyflow-ft-progress-fill",
        );
        const statusEl = this._el.querySelector(".tobyflow-ft-status");
        if (counterEl) counterEl.textContent = current + "/" + total;
        const visualPct =
          typeof this._providerProgress === "number"
            ? this._providerProgress
            : pct;
        if (progressFill)
          progressFill.style.transform = "scaleX(" + visualPct / 100 + ")";
        const hasProviderProgress = typeof this._providerProgress === "number";
        const promptShort =
          prompt.length > 80 ? prompt.substring(0, 80) + "..." : prompt;
        let statusText = promptShort || phase || title;
        if (!hasProviderProgress && phase && promptShort)
          statusText = phase + ": " + promptShort;
        if (statusEl) {
          const legacyItem = {
            state: "MONITORING",
            genType: view.genMode || view.mediaType || "image",
          };
          statusEl.innerHTML =
            this._thumbnailHtml(legacyItem) +
            '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' +
            escHtml(prompt || phase || title) +
            '">' +
            escHtml(statusText) +
            "</span>" +
            (hasProviderProgress
              ? '<span style="font-size:10px;padding:2px 6px;border-radius:5px;background:rgba(168,85,247,0.2);color:#c084fc;flex-shrink:0;white-space:nowrap;font-variant-numeric:tabular-nums;">' +
                this._providerProgress +
                "%</span>"
              : "");
          statusEl.style.display = "flex";
        }
        const jobsEl = this._el.querySelector(".tobyflow-ft-jobs");
        if (jobsEl) jobsEl.innerHTML = "";
        const pipelineRow = this._el.querySelector(".tobyflow-ft-pipeline");
        if (pipelineRow) pipelineRow.style.display = "none";
      },
      setProviderProgress(value) {
        const numeric = Number(value);
        const next =
          value === null || value === void 0 || !Number.isFinite(numeric)
            ? null
            : Math.min(100, Math.max(0, Math.round(numeric)));
        if (next === this._providerProgress) return;
        this._providerProgress = next;
        if (!this._el) return;
        if (this._lastData) {
          this.updateFromQueue(this._lastData);
        } else if (this._legacyData) {
          this.update(this._legacyData);
        }
      },
      _startElapsedTimer() {
        this._stopElapsedTimer();
        const elapsedEl =
          this._el && this._el.querySelector(".tobyflow-ft-elapsed");
        if (!elapsedEl) return;
        const self = this;
        this._elapsedTimer = setInterval(function () {
          if (!self._startTime) return;
          const elapsed = Date.now() - self._startTime;
          elapsedEl.textContent = formatTime(elapsed);
        }, 1e3);
      },
      _stopElapsedTimer() {
        if (this._elapsedTimer) {
          clearInterval(this._elapsedTimer);
          this._elapsedTimer = null;
        }
      },
      hide() {
        this._stopElapsedTimer();
        clearTimeout(this._hideTimer);
        if (this._el) this._el.style.display = "none";
        this._lastData = null;
        this._legacyData = null;
        this._providerProgress = null;
      },
    };
    return tracker;
  }
  window.createFloatingTrackerRich = createFloatingTrackerRich;
})();
