var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) =>
  key in obj
    ? __defProp(obj, key, {
        enumerable: true,
        configurable: true,
        writable: true,
        value,
      })
    : (obj[key] = value);
var __publicField = (obj, key, value) =>
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
(function () {
  "use strict";
  if (typeof window === "undefined") return;
  if (window.SmartTooltip && window.SmartTooltip._initialized) return;
  const PADDING = 8;
  const TOOLTIP_H_ESTIMATE = 28;
  class SmartTooltip {
    static init() {
      if (this._initialized) return;
      this._initialized = true;
      this._createTooltipElements();
      document.addEventListener(
        "mouseenter",
        (e) => {
          const el = e.target;
          if (!el || !el.matches || !el.matches("[data-tooltip]")) return;
          try {
            this._showTooltip(el);
          } catch (_) {}
        },
        true,
      );
      document.addEventListener(
        "mouseleave",
        (e) => {
          const el = e.target;
          if (!el || !el.matches || !el.matches("[data-tooltip]")) return;
          this._hideTooltip();
        },
        true,
      );
      document.addEventListener(
        "focusin",
        (e) => {
          const el = e.target;
          if (!el || !el.matches || !el.matches("[data-tooltip]")) return;
          try {
            this._showTooltip(el);
          } catch (_) {}
        },
        true,
      );
      document.addEventListener(
        "focusout",
        (e) => {
          const el = e.target;
          if (!el || !el.matches || !el.matches("[data-tooltip]")) return;
          this._hideTooltip();
        },
        true,
      );
    }
    static _createTooltipElements() {
      if (!document.getElementById("smart-tooltip-override-style")) {
        const style = document.createElement("style");
        style.id = "smart-tooltip-override-style";
        style.textContent = `
          [data-tooltip]::after,
          [data-tooltip]::before,
          [data-tooltip]:hover::after,
          [data-tooltip]:hover::before,
          [data-tooltip]:focus-visible::after,
          [data-tooltip]:focus-visible::before {
            display: none !important;
            content: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
          }
        `;
        document.head.appendChild(style);
      }
      const tooltip = document.createElement("div");
      tooltip.className = "smart-tooltip";
      tooltip.style.cssText = `
        position: fixed;
        padding: 4px 8px;
        background: #0c0c0e;
        color: #ffffff;
        font-size: 11px;
        font-weight: 500;
        border-radius: 6px;
        white-space: normal;
        max-width: 220px;
        width: max-content;
        text-align: center;
        line-height: 1.35;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.15s ease;
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
        z-index: 2147483647;
      `;
      document.body.appendChild(tooltip);
      this._tooltipEl = tooltip;
      const caret = document.createElement("div");
      caret.className = "smart-tooltip-caret";
      caret.style.cssText = `
        position: fixed;
        width: 0;
        height: 0;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.15s ease;
        z-index: 2147483647;
      `;
      document.body.appendChild(caret);
      this._caretEl = caret;
    }
    static _showTooltip(el) {
      const text = el.getAttribute("data-tooltip");
      if (!text) return;
      this._currentTarget = el;
      const tooltip = this._tooltipEl;
      const caret = this._caretEl;
      tooltip.textContent = text;
      const rect = el.getBoundingClientRect();
      const vw =
        window.innerWidth || document.documentElement.clientWidth || 1024;
      const vh =
        window.innerHeight || document.documentElement.clientHeight || 768;
      const _forced = el.getAttribute("data-tooltip-placement");
      let pos = _forced === "bottom" ? "bottom" : "top";
      if (!_forced && rect.top < TOOLTIP_H_ESTIMATE + PADDING) {
        pos = "bottom";
      }
      const centerX = rect.left + rect.width / 2;
      tooltip.style.opacity = "0";
      tooltip.style.display = "block";
      const tooltipRect = tooltip.getBoundingClientRect();
      const tooltipW = tooltipRect.width;
      const _align = el.getAttribute("data-tooltip-align");
      const _eff =
        _align === "auto" ? (centerX < vw / 2 ? "left" : "right") : _align;
      let left;
      if (_eff === "left") left = rect.left;
      else if (_eff === "right") left = rect.right - tooltipW;
      else left = centerX - tooltipW / 2;
      if (left < PADDING) {
        left = PADDING;
      } else if (left + tooltipW > vw - PADDING) {
        left = vw - PADDING - tooltipW;
      }
      if (pos === "top") {
        tooltip.style.top = "auto";
        tooltip.style.bottom = `${vh - rect.top + 6}px`;
        caret.style.top = "auto";
        caret.style.bottom = `${vh - rect.top + 1}px`;
        caret.style.borderTop = "5px solid #0c0c0e";
        caret.style.borderBottom = "none";
      } else {
        tooltip.style.top = `${rect.bottom + 6}px`;
        tooltip.style.bottom = "auto";
        caret.style.top = `${rect.bottom + 1}px`;
        caret.style.bottom = "auto";
        caret.style.borderTop = "none";
        caret.style.borderBottom = "5px solid #0c0c0e";
      }
      tooltip.style.left = `${left}px`;
      const caretX = Math.max(
        left + 4,
        Math.min(centerX - 5, left + tooltipW - 14),
      );
      caret.style.left = `${caretX}px`;
      tooltip.style.opacity = "1";
      caret.style.opacity = "1";
    }
    static _hideTooltip() {
      if (this._tooltipEl) this._tooltipEl.style.opacity = "0";
      if (this._caretEl) this._caretEl.style.opacity = "0";
      this._currentTarget = null;
    }
  }
  __publicField(SmartTooltip, "_initialized", false);
  __publicField(SmartTooltip, "_tooltipEl", null);
  __publicField(SmartTooltip, "_caretEl", null);
  __publicField(SmartTooltip, "_currentTarget", null);
  window.SmartTooltip = SmartTooltip;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => SmartTooltip.init(), {
      once: true,
    });
  } else {
    SmartTooltip.init();
  }
})();
