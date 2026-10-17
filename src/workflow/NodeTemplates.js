const NodeTemplates = {
  PORT_TYPES: {
    text: { color: "#9177e1", label: "Text", icon: "T" },
    image: { color: "#3b82f6", label: "Image", icon: "I" },
    video: { color: "#a855f7", label: "Video", icon: "V" },
    any: { color: "#71717a", label: "Any", icon: "*" },
    frame: { color: "#14b8a6", label: "Frame", icon: "F" },
  },
  PORT_COMPAT: {
    text: ["text", "any"],
    image: ["image", "frame", "any"],
    video: ["video", "any"],
    frame: ["frame", "image", "any"],
    any: ["text", "image", "video", "frame", "any"],
  },
  icons: {
    generate: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r="0.5" fill="currentColor"/><circle cx="17.5" cy="10.5" r="0.5" fill="currentColor"/><circle cx="8.5" cy="7.5" r="0.5" fill="currentColor"/><circle cx="6.5" cy="12.5" r="0.5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z"/></svg>`,
    download: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    image: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
    video_camera: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2" ry="2"/></svg>`,
    delay: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    note: `<svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9.75 2.625V4.65C9.75 5.91012 9.75 6.54018 9.99524 7.02148C10.211 7.44484 10.5552 7.78905 10.9785 8.00476C11.4598 8.25 12.0899 8.25 13.35 8.25H15.375M15.75 9.74117V12.15C15.75 13.4101 15.75 14.0402 15.5048 14.5215C15.289 14.9448 14.9448 15.289 14.5215 15.5048C14.0402 15.75 13.4101 15.75 12.15 15.75H5.85C4.58988 15.75 3.95982 15.75 3.47852 15.5048C3.05516 15.289 2.71095 14.9448 2.49524 14.5215C2.25 14.0402 2.25 13.4101 2.25 12.15V5.85C2.25 4.58988 2.25 3.95982 2.49524 3.47852C2.71095 3.05516 3.05516 2.71095 3.47852 2.49524C3.95982 2.25 4.58988 2.25 5.85 2.25H8.25883C8.80916 2.25 9.08432 2.25 9.34327 2.31217C9.57285 2.36729 9.79233 2.4582 9.99364 2.58156C10.2207 2.7207 10.4153 2.91527 10.8044 3.30442L14.6956 7.19559C15.0847 7.58473 15.2793 7.7793 15.4184 8.00636C15.5418 8.20767 15.6327 8.42715 15.6878 8.65673C15.75 8.91568 15.75 9.19084 15.75 9.74117Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    telegram: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`,
    chatgpt: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><circle cx="9" cy="11" r="1" fill="currentColor"/><circle cx="13" cy="11" r="1" fill="currentColor"/><circle cx="17" cy="11" r="1" fill="currentColor"/></svg>`,
    grok: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
    gemini: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c.8 5.2 4.8 9.2 10 10-5.2.8-9.2 4.8-10 10-.8-5.2-4.8-9.2-10-10 5.2-.8 9.2-4.8 10-10Z"/></svg>`,
    muse: `<img src="icons/muse.svg" width="14" height="14" alt="Muse" />`,
    prompt: `<svg width="14" height="14" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.47158 3.7689C4.43604 4.12493 5.19375 4.88096 5.55044 5.84302C5.64791 6.10611 5.89926 6.28072 6.18038 6.28072C6.46138 6.28072 6.71273 6.10611 6.81033 5.84328C7.16715 4.88096 7.92499 4.12493 8.88932 3.7689C9.15287 3.67152 9.32787 3.42073 9.32787 3.14036C9.32787 2.85999 9.15287 2.6092 8.88932 2.51182C7.92499 2.15579 7.16728 1.39976 6.81033 0.437441C6.71273 0.17461 6.46138 0 6.18038 0C5.89926 0 5.64804 0.17461 5.55044 0.437703C5.19362 1.39976 4.43591 2.15579 3.47158 2.51182C3.20803 2.6092 3.03303 2.85999 3.03303 3.14036C3.03303 3.42073 3.20803 3.67152 3.47158 3.7689ZM6.18038 2.07621C6.4783 2.48407 6.83814 2.84324 7.24704 3.14036C6.83801 3.43748 6.4783 3.79639 6.18038 4.20451C5.8826 3.79639 5.52289 3.43748 5.11386 3.14036C5.52276 2.84324 5.8826 2.48407 6.18038 2.07621ZM14.9858 15.163C14.4549 14.967 14.0377 14.5507 13.8412 14.0209C13.7436 13.7578 13.4923 13.5832 13.2113 13.5832C12.9302 13.5832 12.6788 13.7578 12.5813 14.0209C12.385 14.5507 11.9678 14.967 11.4368 15.163C11.1731 15.2604 10.9981 15.5112 10.9981 15.7916C10.9981 16.072 11.1731 16.3228 11.4368 16.4201C11.9678 16.6162 12.385 17.0324 12.5813 17.5623C12.6788 17.8254 12.9302 18 13.2113 18C13.4923 18 13.7436 17.8254 13.8412 17.5623C14.0377 17.0324 14.4549 16.6162 14.9858 16.4201C15.2495 16.3228 15.4245 16.072 15.4245 15.7916C15.4245 15.5112 15.2495 15.2604 14.9858 15.163ZM13.2113 16.0521C13.1293 15.9604 13.0422 15.8735 12.9502 15.7916C13.0422 15.7097 13.1293 15.6227 13.2113 15.5311C13.2934 15.6227 13.3805 15.7097 13.4723 15.7916C13.3805 15.8735 13.2934 15.9604 13.2113 16.0521ZM13.6885 9.89753L15.3237 8.25012C15.8941 7.67524 15.8918 6.74224 15.3186 6.17025L13.5778 4.43331C13.2988 4.15477 12.9277 4.00137 12.5329 4.00137C12.1382 4.00137 11.7671 4.15477 11.4882 4.43331L9.83338 6.08445C9.83292 6.08491 9.83233 6.08523 9.83187 6.08569C9.83145 6.08608 9.83122 6.08661 9.83076 6.08707L2.44678 13.4546C2.32071 13.5803 2.25 13.7507 2.25 13.9285V16.8463C2.25 17.2165 2.55067 17.5165 2.92166 17.5165H5.846C6.02519 17.5165 6.19704 17.445 6.32324 17.3178L13.6885 9.89753ZM12.4381 5.38097C12.5033 5.31578 12.5631 5.31631 12.6279 5.38097L14.3687 7.1179C14.4208 7.17 14.4209 7.25482 14.3691 7.30717L13.2069 8.47813L11.2613 6.55513L12.4381 5.38097ZM5.56592 16.1762H3.59332V14.206L10.3113 7.50299L12.2616 9.4305L5.56592 16.1762Z" fill="currentColor"/></svg>`,
    text: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>`,
    text_extract: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="8" width="10" height="8" rx="1"/></svg>`,
    transform: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>`,
    condition: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>`,
    merge: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg>`,
    output: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    brandFlow: `<svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="#3186FF"/></svg>`,
    brandOpenAI: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg>`,
    brandGrok: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815"/></svg>`,
    brandGemini: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2c.8 5.2 4.8 9.2 10 10-5.2.8-9.2 4.8-10 10-.8-5.2-4.8-9.2-10-10 5.2-.8 9.2-4.8 10-10Z"/></svg>`,
    mediaImage: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
    mediaVideo: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2" ry="2"/></svg>`,
  },
  getNodeProvider(type) {
    if (type === "generate") return "flow";
    if (type === "chatgpt") return "openai";
    if (type === "grok") return "grok";
    if (type === "gemini") return "gemini";
    if (type === "muse") return "muse";
    return null;
  },
  renderProviderBadge(type) {
    const provider = this.getNodeProvider(type);
    if (!provider) return "";
    const logoMap = {
      flow: this.icons.brandFlow,
      openai: this.icons.brandOpenAI,
      grok: this.icons.brandGrok,
      gemini: this.icons.brandGemini,
      muse: this.icons.muse,
    };
    const labelMap = {
      flow: "Google Flow",
      openai: "ChatGPT",
      grok: "Grok",
      gemini: "Gemini",
      muse: "Muse",
    };
    const logo = logoMap[provider];
    if (!logo) return "";
    return `<div class="df-node-provider-pill df-node-provider-${provider}" title="${labelMap[provider]}" data-tooltip="${labelMap[provider]}">
      <span class="df-node-provider-pill-logo">${logo}</span>
      <span class="df-node-provider-pill-label">${labelMap[provider]}</span>
    </div>`;
  },
  _thumbHeader(
    iconClass,
    iconHtml,
    name,
    badgeHtml,
    enabled,
    headerExtra = "",
  ) {
    const tRename = window.I18n?.t("node.rename") || "Rename";
    const onTitle = enabled
      ? window.I18n?.t("node.disableNode") || "Disable node"
      : window.I18n?.t("node.enableNode") || "Enable node";
    const pen =
      '<svg width="13" height="13" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.75 15.7502H9.75002M1.875 16.1252L6.03695 14.5245C6.30343 14.4221 6.43666 14.3708 6.56133 14.3038C6.67203 14.2442 6.77758 14.1755 6.8769 14.0985C6.98876 14.0117 7.08969 13.9108 7.29155 13.7089L15.375 5.62538C16.2034 4.79695 16.2034 3.45381 15.375 2.62538C14.5466 1.79696 13.2034 1.79696 12.375 2.62538L4.29159 10.7088C4.08973 10.9107 3.9888 11.0116 3.90201 11.1235C3.82505 11.2228 3.75633 11.3284 3.69673 11.4391C3.62973 11.5637 3.57842 11.697 3.47599 11.9634L1.875 16.1252Z"/></svg>';
    return `<div class="df-node-header">
            <div class="df-node-icon ${iconClass}">${iconHtml}</div>
            <div class="df-node-title nodrag" title="${this.escapeAttr(name)}"><span class="df-node-title-text">${this.escapeHtml(name)}</span>${badgeHtml || ""}</div>
            ${headerExtra || ""}
            <button type="button" class="df-node-rename-btn nodrag" title="${this.escapeAttr(tRename)}" data-tooltip="${this.escapeAttr(tRename)}">${pen}</button>
          </div>
          <button class="df-node-toggle ${enabled ? "on" : "off"}" title="${this.escapeAttr(onTitle)}">
            <span class="df-node-toggle-track"><span class="df-node-toggle-thumb"></span></span>
          </button>`;
  },
  renderMediaTypeBadge() {
    return "";
  },
  slugBadge(slug) {
    if (!slug) return "";
    const pen =
      '<svg width="11" height="11" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.75 15.7502H9.75002M1.875 16.1252L6.03695 14.5245C6.30343 14.4221 6.43666 14.3708 6.56133 14.3038C6.67203 14.2442 6.77758 14.1755 6.8769 14.0985C6.98876 14.0117 7.08969 13.9108 7.29155 13.7089L15.375 5.62538C16.2034 4.79695 16.2034 3.45381 15.375 2.62538C14.5466 1.79696 13.2034 1.79696 12.375 2.62538L4.29159 10.7088C4.08973 10.9107 3.9888 11.0116 3.90201 11.1235C3.82505 11.2228 3.75633 11.3284 3.69673 11.4391C3.62973 11.5637 3.57842 11.697 3.47599 11.9634L1.875 16.1252Z"/></svg>';
    const tEdit = window.I18n?.t("node.editSlug") || "Edit slug";
    return `<span class="df-node-slug-badge" data-slug-edit title="@${this.escapeAttr(slug)}"><span class="df-node-slug-prefix">@</span><span class="df-node-slug-text">${this.escapeHtml(slug)}</span><button type="button" class="df-node-slug-edit-btn nodrag" title="${this.escapeAttr(tEdit)}" data-tooltip="${this.escapeAttr(tEdit)}">${pen}</button></span>`;
  },
  zoomToggleBtn() {
    const t =
      window.I18n?.t("node.zoomNodeCycle") ||
      "Change zoom level (1\xD7 \u2192 1.5\xD7 \u2192 2\xD7)";
    const expand =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
    return `<button type="button" class="df-node-zoom-toggle nodrag" data-action="zoom-node" title="${this.escapeAttr(t)}" data-tooltip="${this.escapeAttr(t)}"><span class="df-zoom-state df-zoom-state-1">${expand}</span><span class="df-zoom-state df-zoom-state-15">1.5\xD7</span><span class="df-zoom-state df-zoom-state-2">2\xD7</span></button>`;
  },
  runNodeCornerBtn() {
    const t = window.I18n?.t("node.runNode") || "Run node";
    const play =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>';
    return `<button type="button" class="df-node-run-corner nodrag" data-action="run-node" title="${this.escapeAttr(t)}" data-tooltip="${this.escapeAttr(t)}">${play}</button>`;
  },
  noteRunCornerBtn() {
    const t = window.I18n?.t("workflow.runNoteGroup") || "Run this group";
    const play =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>';
    return `<button type="button" class="df-node-run-corner df-node-note-run nodrag" data-action="run-note-group" title="${this.escapeAttr(t)}" data-tooltip="${this.escapeAttr(t)}">${play}</button>`;
  },
  _previewPlaceholderIcon(isVid) {
    return isVid
      ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2" ry="2"/></svg>'
      : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
  },
  get types() {
    const t = (key, fallback) => {
      const val = window.I18n?.t(key);
      return val && val !== key ? val : fallback;
    };
    return {
      generate: {
        name: t("node.generateName", "Generate Image/Video"),
        description: t("node.generateDesc", "Create new image/video"),
        color: "generate",
        inputs: 1,
        outputs: 1,
        portType: "image",
        ports: {
          in: [
            {
              name: "image_ref",
              type: "image",
              required: false,
              multiple: true,
              label: t("node.portRefImages", "Reference images"),
            },
            {
              name: "text",
              type: "text",
              required: false,
              multiple: true,
              label: t("node.portPromptText", "Prompt text"),
            },
            {
              name: "frame_1",
              type: "frame",
              required: false,
              multiple: false,
              label: t("node.portFrame1", "Frame 1 (video)"),
              visibleWhen: "isVideoFrames",
            },
            {
              name: "frame_2",
              type: "frame",
              required: false,
              multiple: false,
              label: t("node.portFrame2", "Frame 2 (video)"),
              visibleWhen: "isVideoFrames",
            },
            {
              name: "video_ref",
              type: "video",
              required: false,
              multiple: false,
              label: t("node.portRefVideo", "Reference video"),
              visibleWhen: "isVideoIngredient",
              acceptFromNodeTypes: ["generate", "image"],
            },
          ],
          out: [
            {
              name: "media",
              type: "image",
              label: t("node.portResult", "Result"),
              dynamicType: "media_type",
            },
            {
              name: "frame",
              type: "frame",
              label: t("node.portFrameOut", "Last frame"),
              visibleWhen: "isVideo",
            },
          ],
        },
      },
      download: {
        name: t("node.downloadName", "Download"),
        description: t("node.downloadDesc", "Auto-download results"),
        color: "download",
        inputs: 1,
        outputs: 0,
        portType: "any",
        ports: {
          in: [
            {
              name: "media_in",
              type: "any",
              required: true,
              multiple: true,
              label: t("node.portFilesToDownload", "Files to download"),
            },
          ],
          out: [],
        },
      },
      delay: {
        name: t("node.delayName", "Wait"),
        description: t("node.delayDesc", "Wait X seconds"),
        color: "delay",
        inputs: 1,
        outputs: 1,
        portType: "any",
        ports: {
          in: [
            {
              name: "any_in",
              type: "any",
              required: false,
              label: t("node.portInputPassthrough", "Input pass-through"),
            },
          ],
          out: [
            {
              name: "any_out",
              type: "any",
              label: t("node.portOutputAfterDelay", "Output (after delay)"),
            },
          ],
        },
      },
      image: {
        name: t("node.imageName", "Image"),
        description: t("node.imageDesc", "Upload or assign reference image"),
        color: "image",
        inputs: 0,
        outputs: 1,
        portType: "image",
        ports: {
          in: [],
          out: [
            {
              name: "media",
              type: "image",
              dynamicType: "ref_media_kind",
              label: t("node.portRefImage", "Ref image"),
            },
          ],
        },
      },
      text: {
        name: t("node.textName", "Text"),
        description: t(
          "node.textDesc",
          "Static text/prompt source for @mentions",
        ),
        color: "text",
        inputs: 0,
        outputs: 1,
        portType: "text",
        ports: {
          in: [],
          out: [
            {
              name: "text",
              type: "text",
              label: t("node.portTextOutput", "Text output"),
            },
          ],
        },
      },
      telegram: {
        name: "Telegram",
        description: t("node.telegramDesc", "Send images via Telegram"),
        icon: "telegram",
        color: "telegram",
        inputs: 1,
        outputs: 1,
        portType: "any",
        ui: { terminal_sink: true },
        ports: {
          in: [
            {
              name: "media_in",
              type: "any",
              required: true,
              multiple: true,
              label: t("node.portFilesToTelegram", "Files to Telegram"),
            },
          ],
          out: [
            {
              name: "pass",
              type: "any",
              label: t("node.portPassthrough", "Pass-through"),
            },
          ],
        },
      },
      chatgpt: {
        name: t("node.chatgptName", "ChatGPT"),
        description: t("node.chatgptDesc", "Generate images via ChatGPT"),
        icon: "chatgpt",
        color: "chatgpt",
        inputs: 1,
        outputs: 1,
        portType: "image",
        ports: {
          in: [
            {
              name: "image_ref",
              type: "image",
              required: false,
              multiple: true,
              label: t("node.portRefImages", "Reference images"),
            },
            {
              name: "text",
              type: "text",
              required: false,
              multiple: true,
              label: t("node.portPromptText", "Prompt text"),
            },
          ],
          out: [
            {
              name: "media",
              type: "image",
              label: t("node.portChatgptImages", "ChatGPT images"),
            },
          ],
        },
      },
      grok: {
        name: t("node.grokName", "Grok"),
        description: t("node.grokDesc", "Generate image/video via Grok"),
        icon: "grok",
        color: "grok",
        inputs: 1,
        outputs: 1,
        portType: "image",
        ports: {
          in: [
            {
              name: "image_ref",
              type: "image",
              required: false,
              multiple: true,
              label: t("node.portRefImages", "Reference images"),
            },
            {
              name: "text",
              type: "text",
              required: false,
              multiple: true,
              label: t("node.portPromptText", "Prompt text"),
            },
          ],
          out: [
            {
              name: "media",
              type: "image",
              label: t("node.portResult", "Result"),
              dynamicType: "grok_mode",
            },
            {
              name: "frame",
              type: "frame",
              label: t("node.portFrameOut", "Last frame"),
              visibleWhen: "isGrokVideo",
            },
          ],
        },
      },
      gemini: {
        name: t("node.geminiName", "Gemini"),
        description: t("node.geminiDesc", "Generate image/video via Gemini"),
        icon: "gemini",
        color: "gemini",
        inputs: 1,
        outputs: 1,
        portType: "image",
        ports: {
          in: [
            {
              name: "image_ref",
              type: "image",
              required: false,
              multiple: true,
              label: t("node.portRefImages", "Reference images"),
            },
            {
              name: "text",
              type: "text",
              required: false,
              multiple: true,
              label: t("node.portPromptText", "Prompt text"),
            },
          ],
          out: [
            {
              name: "media",
              type: "image",
              label: t("node.portResult", "Result"),
              dynamicType: "media_type",
            },
          ],
        },
      },
      prompt: {
        name: t("node.promptName", "AI Agent"),
        description: t(
          "node.promptDesc",
          "Pass-through text or use AI (ChatGPT/Gemini) for text processing \u2014 enhance prompt, write scripts, analyze images, summarize, translate, brainstorm.",
        ),
        icon: "prompt",
        color: "prompt",
        inputs: 1,
        outputs: 1,
        portType: "text",
        ports: {
          in: [
            {
              name: "text",
              type: "text",
              required: false,
              multiple: true,
              label: t("node.portPromptUpstream", "Prompt upstream"),
            },
            {
              name: "image_ref",
              type: "image",
              required: false,
              multiple: true,
              label: t("node.portRefImages", "Reference images"),
              visibleWhen: "enhance",
            },
          ],
          out: [
            {
              name: "text",
              type: "text",
              label: t("node.portResultText", "Result text"),
            },
          ],
        },
      },
      text_extract: {
        name: t("node.textExtractName", "Text Extract"),
        description: t(
          "node.textExtractDesc",
          "Extract text from upstream (marker/JSON/regex)",
        ),
        icon: "text_extract",
        color: "text",
        inputs: 1,
        outputs: 1,
        portType: "text",
        ports: {
          in: [
            {
              name: "text",
              type: "text",
              required: true,
              multiple: false,
              label: t("node.portTextUpstream", "Text upstream"),
            },
          ],
          out: [
            {
              name: "text",
              type: "text",
              label: t("node.portExtractedText", "Extracted text"),
            },
          ],
        },
      },
      note: {
        name: t("node.noteName", "Note"),
        description: t("node.noteDesc", "Note on canvas"),
        color: "note",
        inputs: 0,
        outputs: 0,
        portType: "none",
        ports: { in: [], out: [] },
      },
      transform: {
        name: "Transform",
        description: t("node.transformDesc", "Transform image/video"),
        color: "transform",
        inputs: 1,
        outputs: 1,
        portType: "image",
      },
      condition: {
        name: "Condition",
        description: t("node.conditionDesc", "Conditional branching"),
        color: "condition",
        inputs: 1,
        outputs: 2,
        portType: "any",
      },
      merge: {
        name: "Merge",
        description: t("node.mergeDesc", "Merge multiple inputs"),
        color: "merge",
        inputs: 2,
        outputs: 1,
        portType: "any",
      },
      output: {
        name: "Output",
        description: t("node.outputDesc", "Final output"),
        color: "output",
        inputs: 1,
        outputs: 0,
        portType: "any",
      },
    };
  },
  portColors: {
    image: "#3b82f6",
    video: "#8b5cf6",
    text: "#F59E0B",
    any: "#d4d4d8",
    none: "transparent",
  },
  _normalizeType(type) {
    return type;
  },
  createNodeHTML(type, data = {}) {
    type = this._normalizeType(type);
    const config = this.getType(type);
    const iconKey = config.icon || type;
    const icon = this.icons[iconKey] || this.icons[type] || this.icons.generate;
    const name = data.node_name || config.name;
    const prompt = data.prompt || "";
    const status = data.status || "pending";
    const mediaType = data.media_type || "Image";
    const model = data.model || "";
    const ratio = data.ratio || "";
    const quantity = data.quantity || 1;
    const enabled = data.enabled !== false;
    const videoInputType = data.video_input_type || "";
    const isVideoFrames = mediaType === "Video" && videoInputType === "Frames";
    const isVideo = mediaType === "Video";
    const refMediaKind =
      type === "image" ? this.detectRefMediaKind(data) : "image";
    const _vitSettingDefault = window.storageSettings?.get?.(
      "defaultVideoInputType",
    );
    const videoInputTypeDisplay =
      videoInputType ||
      (_vitSettingDefault === "Ingredients" || _vitSettingDefault === "Frames"
        ? _vitSettingDefault
        : "Ingredients");
    const videoDuration = data.video_duration || "6s";
    const durationTier = window.ModelPresentationRegistry?.displayModel?.(
      "flow",
      model,
    )?.config?.duration_tier;
    const showVideoDuration =
      isVideo && !!durationTier && durationTier !== "default";
    const _nz = Number(data.node_zoom);
    const nodeZoom = _nz === 1.5 ? "1.5" : _nz === 2 ? "2" : "1";
    let headerIcon = icon;
    if (type === "generate") {
      headerIcon =
        mediaType === "Video" ? this.icons.video_camera : this.icons.image;
    } else if (type === "chatgpt") {
      headerIcon = this.icons.image;
    } else if (type === "grok") {
      const _grokMode = data.grok_mode || data.mode || "image";
      headerIcon =
        _grokMode === "video" ? this.icons.video_camera : this.icons.image;
    } else if (type === "muse") {
      headerIcon =
        mediaType === "Video" ? this.icons.video_camera : this.icons.image;
    } else if (type === "image") {
      headerIcon =
        refMediaKind === "video" ? this.icons.video_camera : this.icons.image;
    }
    const portRailIn = "";
    const portRailOut = "";
    const nodeHasPortsClass = "";
    const genRatioClassMap = {
      "9:16": "ratio-9-16",
      "D\u1ECDc": "ratio-9-16",
      "3:4": "ratio-3-4",
      "2:3": "ratio-2-3",
      "1:1": "",
      "Vu\xF4ng": "",
      "4:3": "ratio-4-3",
      "3:2": "ratio-3-2",
      "16:9": "ratio-16-9",
      Ngang: "ratio-16-9",
    };
    const ratioClass =
      genRatioClassMap[ratio] !== void 0 ? genRatioClassMap[ratio] : "";
    const hasContent =
      type === "delay"
        ? enabled
        : type === "note"
          ? false
          : type === "image"
            ? false
            : [
                  "chatgpt",
                  "grok",
                  "gemini",
                  "muse",
                  "generate",
                  "prompt",
                  "text_extract",
                ].includes(type)
              ? true
              : !!(prompt && prompt.trim());
    const isNodeSaved = !!data.node_id;
    const canRunNode = hasContent && isNodeSaved;
    const hasResults = !!(data.result_file_ids && data.result_file_ids.trim());
    const hasResetable =
      hasResults ||
      !!data.result_text ||
      !!(data.status && data.status !== "pending");
    const hasPrompt = !!(prompt && prompt.trim());
    const tCopyPrompt = window.I18n?.t("node.copyPrompt") || "Copy prompt";
    const tRunNode = window.I18n?.t("node.runNode") || "Run node";
    const tDownloadResults =
      window.I18n?.t("node.downloadResults") || "Download results";
    const tSettings = window.I18n?.t("node.settings") || "Settings";
    const tBranch = window.I18n?.t("node.branch") || "Create branch";
    const tDuplicate = window.I18n?.t("node.duplicate") || "Duplicate";
    const tDeleteNode = window.I18n?.t("node.deleteNode") || "Delete node";
    const tResetNode = window.I18n?.t("node.resetNode") || "Reset node";
    const tRunNoteGroup =
      window.I18n?.t("workflow.runNoteGroup") || "Run this group";
    const hoverToolbar = `
      <div class="df-hover-toolbar">
        ${
          canRunNode
            ? `<button class="df-hover-btn" data-action="run-node" title="${tRunNode}" data-tooltip="${tRunNode}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>`
            : ""
        }
        ${
          type === "note"
            ? `<button class="df-hover-btn" data-action="run-note-group" title="${this.escapeAttr(tRunNoteGroup)}" data-tooltip="${this.escapeAttr(tRunNoteGroup)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>`
            : ""
        }
        ${
          hasResetable
            ? `<button class="df-hover-btn" data-action="reset-node" title="${tResetNode}" data-tooltip="${tResetNode}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        </button>`
            : ""
        }
        ${
          hasResults
            ? `<button class="df-hover-btn" data-action="download-node" title="${tDownloadResults}" data-tooltip="${tDownloadResults}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>`
            : ""
        }
        <button class="df-hover-btn df-hover-btn-settings" data-action="settings-node" title="${tSettings}" data-tooltip="${tSettings}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
        <button class="df-hover-btn" data-action="branch-node" title="${tBranch}" data-tooltip="${tBranch}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M6 6a9 9 0 0 0 9 9"/></svg>
        </button>
        ${
          hasPrompt
            ? `<button class="df-hover-btn" data-action="copy-prompt" title="${tCopyPrompt}" data-tooltip="${tCopyPrompt}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/><path d="M9 13h8M9 17h6"/></svg>
        </button>`
            : ""
        }
        <button class="df-hover-btn" data-action="copy-node" title="${tDuplicate}" data-tooltip="${tDuplicate}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <button class="df-hover-btn danger" data-action="delete-node" title="${tDeleteNode}" data-tooltip="${tDeleteNode}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>`;
    if (type === "note") {
      const nColor = /^#[0-9a-fA-F]{3,8}$/.test(String(data.note_color || ""))
        ? data.note_color
        : "#3b82f6";
      const nW = Math.max(160, parseInt(data.note_width, 10) || 420);
      const nH = Math.max(100, parseInt(data.note_height, 10) || 280);
      const nFont = Math.max(
        10,
        Math.min(128, parseInt(data.note_font_size, 10) || 48),
      );
      const _h = String(nColor).replace("#", "");
      let _r = 59,
        _g = 130,
        _b = 246,
        _a = 1;
      if (_h.length === 3) {
        _r = parseInt(_h[0] + _h[0], 16);
        _g = parseInt(_h[1] + _h[1], 16);
        _b = parseInt(_h[2] + _h[2], 16);
      } else if (_h.length === 4) {
        _r = parseInt(_h[0] + _h[0], 16);
        _g = parseInt(_h[1] + _h[1], 16);
        _b = parseInt(_h[2] + _h[2], 16);
        _a = parseInt(_h[3] + _h[3], 16) / 255;
      } else if (_h.length >= 6) {
        _r = parseInt(_h.slice(0, 2), 16);
        _g = parseInt(_h.slice(2, 4), 16);
        _b = parseInt(_h.slice(4, 6), 16);
        if (_h.length === 8) _a = parseInt(_h.slice(6, 8), 16) / 255;
      }
      const _bgA = (0.24 * _a).toFixed(3),
        _bdA = (0.6 * _a).toFixed(3);
      const frameStyle = `width:${nW}px;height:${nH}px;background:rgba(${_r},${_g},${_b},${_bgA});border:1.5px solid rgba(${_r},${_g},${_b},${_bdA});`;
      const tResize =
        window.I18n?.t("workflow.noteResizeHint") || "Drag to resize";
      const resizeHandles = ["nw", "ne", "sw", "se", "n", "s", "e", "w"]
        .map(
          (c) =>
            `<div class="df-note-resize df-note-resize--${c} nodrag" data-corner="${c}" title="${this.escapeAttr(tResize)}"></div>`,
        )
        .join("");
      return `
        <div class="df-node df-node-note df-node-note-frame${nodeHasPortsClass}" data-node-type="note" style="${frameStyle}">
          ${portRailIn}${portRailOut}
          ${isNodeSaved ? this.noteRunCornerBtn() : ""}
          <div class="df-node-body" style="height:100%;box-sizing:border-box;align-items:flex-start;">
            <div class="df-node-note-text" style="font-size:${nFont}px;color:${nColor};font-weight:600;opacity:0.92;line-height:1.45;">${this.escapeHtml(data.note_text || window.I18n?.t("node.notePlaceholder") || "Note...")}</div>
          </div>
          ${resizeHandles}
          ${hoverToolbar}
        </div>`;
    }
    if (type === "delay") {
      return `
        <div class="df-node ${!enabled ? "df-node-disabled" : ""}${nodeHasPortsClass} df-node-thumb" data-node-type="delay" data-enabled="${enabled}">
          ${portRailIn}${portRailOut}
          <div class="df-node-status ${status}"></div>
          ${this._thumbHeader("delay", this.icons.delay, name, "", enabled)}
          <div class="df-node-body">
            <div class="df-node-delay-setting">
              <span>${window.I18n?.t("node.wait") || "Wait"}</span>
              <input type="number" class="df-node-inline-input df-delay-seconds nodrag" value="${data.delay_seconds || 3}" min="1" max="300" style="width:50px">
              <span>${window.I18n?.t("node.seconds") || "s"}</span>
            </div>
          </div>
          ${hoverToolbar}
        </div>`;
    }
    if (type === "image") {
      const refFileIds2 = data.ref_file_ids || "";
      const refImgUrls = data.ref_img_urls || [];
      const refCount2 =
        refImgUrls.length > 0
          ? refImgUrls.length
          : refFileIds2
            ? refFileIds2.split(",").filter(Boolean).length
            : 0;
      const imgSlug = data.slug || "";
      return `
        <div class="df-node ${!enabled ? "df-node-disabled" : ""}${nodeHasPortsClass} df-node-thumb" data-node-type="image" data-media-type="${refMediaKind}" data-zoom="${nodeZoom}" data-enabled="${enabled}">
          ${portRailIn}${portRailOut}
          <div class="df-node-status ${status}"></div>
          ${this._thumbHeader("image", this.icons.image, name, "", enabled)}
          ${this.zoomToggleBtn()}
          ${this.slugBadge(imgSlug)}
          <div class="df-node-body">
            <div class="df-node-preview${refCount2 === 0 ? " ratio-9-16" : ""}" data-node-preview>
              <div class="df-node-preview-placeholder">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              </div>
            </div>
            <div class="df-node-settings-bar">
              <span class="df-node-tag">${refCount2 ? refCount2 + " " + (window.I18n?.t("node.images") || "images") : window.I18n?.t("node.noImages") || "No images"}</span>
            </div>
          </div>
          ${hoverToolbar}
        </div>`;
    }
    if (type === "download") {
      return `
        <div class="df-node ${!enabled ? "df-node-disabled" : ""}${nodeHasPortsClass} df-node-thumb" data-node-type="download" data-enabled="${enabled}">
          ${portRailIn}${portRailOut}
          <div class="df-node-status ${status}"></div>
          ${this._thumbHeader("download", this.icons.download, name, "", enabled)}
          <div class="df-node-body">
            <div class="df-node-download-info">${window.I18n?.t("node.downloadInfo") || "Auto-download results from previous node"}</div>
          </div>
          ${hoverToolbar}
        </div>`;
    }
    if (type === "telegram") {
      const chatId = data.telegram_chat_id || "";
      const sendMode =
        data.telegram_send_mode === "group"
          ? window.I18n?.t("node.telegramGroup") || "Group images"
          : window.I18n?.t("node.telegramSingle") || "Individual images";
      const statusText = chatId
        ? `<span class="df-telegram-linked"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> ${window.I18n?.t("node.telegramLinked") || "Linked"}</span>`
        : `<span class="df-telegram-unlinked">${window.I18n?.t("node.notConfigured") || "Not configured"}</span>`;
      return `
        <div class="df-node ${!enabled ? "df-node-disabled" : ""}${nodeHasPortsClass} df-node-thumb" data-node-type="telegram" data-enabled="${enabled}">
          ${portRailIn}${portRailOut}
          <div class="df-node-status ${status}"></div>
          ${this._thumbHeader("telegram", this.icons.telegram, name, "", enabled)}
          <div class="df-node-body">
            <div class="df-node-telegram-info">
              ${statusText}
              <span class="df-telegram-mode">${sendMode}</span>
            </div>
          </div>
          ${hoverToolbar}
        </div>`;
    }
    if (type === "prompt") {
      const promptText = data.prompt || "";
      const enhance = !!data.use_ai && data.multi_prompt !== true;
      const multiPrompt = data.multi_prompt === true;
      const multiPromptCount =
        multiPrompt && Array.isArray(data.prompts_json)
          ? data.prompts_json
              .map((item) => String(item || "").trim())
              .filter(Boolean).length
          : 0;
      const multiPromptLabel =
        window.I18n?.t("workflow.multiPrompt") || "Multi-prompt";
      const promptsLabel = window.I18n?.t("workflow.prompts") || "prompts";
      const provider = data.provider || "chatgpt";
      const resultText = data.result_text || "";
      const resultSource = data.result_source || "";
      const providerLabel = provider === "gemini" ? "Gemini" : "ChatGPT";
      const modeBadge = enhance
        ? `<span class="df-node-tag df-node-tag-mode-image">AI: ${this.escapeHtml(providerLabel)}</span>`
        : multiPrompt
          ? ""
          : '<span class="df-node-tag">Plain</span>';
      const promptRefIds = data.ref_file_ids || "";
      const promptRefCount = promptRefIds
        ? promptRefIds.split(",").filter(Boolean).length
        : 0;
      const refBadge =
        enhance && promptRefCount > 0
          ? `<span class="df-node-tag">${promptRefCount} ${window.I18n?.t("node.images") || "images"}</span>`
          : "";
      const deleteAfter = !!data.ai_delete_after_run;
      const trashIconSvg = `<svg class="df-node-tag-delete-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/>
        <path d="M10 11v6M14 11v6"/>
        <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
      </svg>`;
      const deleteBadge =
        enhance && deleteAfter
          ? `<span class="df-node-tag df-node-tag-delete" title="${this.escapeAttr(window.I18n?.t("node.deleteAfterEnhanceTip") || "Delete ChatGPT/Gemini conversation after AI run" + providerLabel + " sau khi AI run")}">${trashIconSvg}<span class="df-node-tag-delete-text">${this.escapeHtml(window.I18n?.t("node.deleteAfterEnhanceBadge") || "Auto-delete")}</span></span>`
          : "";
      const hasEnhancedResult =
        resultText && enhance && resultText.trim() !== promptText.trim();
      const lastError = data.last_error;
      const errorBadge = lastError
        ? `<span class="df-node-tag df-node-tag-error">${this.escapeHtml(lastError)}</span>`
        : "";
      return `
        <div class="df-node ${!enabled ? "df-node-disabled" : ""}${nodeHasPortsClass} df-node-thumb ${multiPrompt ? "df-node-prompt-batch" : ""}" data-node-type="prompt" data-enabled="${enabled}" data-multi-prompt="${multiPrompt ? "true" : "false"}">
          ${portRailIn}${portRailOut}
          <div class="df-node-status ${status}"></div>
          ${this._thumbHeader("prompt", this.icons.prompt, name, "", enabled, `<span class="df-node-saved-badge nodrag" aria-hidden="true"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span class="df-node-saved-text"></span></span>`)}
          <div class="df-node-body">
            <!-- Always-edit: textarea lu\xF4n editable (b\u1ECF view/edit-btn toggle), char count overlay g\xF3c d\u01B0\u1EDBi-ph\u1EA3i. -->
            <div class="df-inline-prompt-container df-prompt-always-edit" data-mode="edit">
              <textarea
                class="df-inline-prompt-edit"
                placeholder="${this.escapeAttr(window.I18n?.t("node.promptPlaceholder") || "Enter prompt...")}"
                rows="10"
                spellcheck="false"
              >${this.escapeHtml(promptText)}</textarea>
              ${
                multiPrompt
                  ? `
                <div class="df-prompt-multi-counter nodrag" title="${this.escapeAttr(`${multiPromptCount} ${promptsLabel}`)}" aria-label="${this.escapeAttr(`${multiPromptCount} ${promptsLabel}`)}">
                  <strong>${multiPromptCount}</strong><span>${this.escapeHtml(promptsLabel)}</span>
                </div>`
                  : ""
              }
            </div>
            <!-- Section 2: AI Output (read-only). 2026-05-30: ch\u1EC9 hi\u1EC7n khi AI run done + result kh\xE1c prompt g\u1ED1c. -->
            ${
              hasEnhancedResult
                ? `
              <div class="df-ai-output-container nodrag">
                <div class="df-ai-output-label">
                  <svg class="df-ai-output-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2l2 7h7l-5.5 4 2 7L12 16l-5.5 4 2-7L3 9h7z"/>
                  </svg>
                  <span class="df-ai-output-label-text">${this.escapeHtml(window.I18n?.t("node.aiOutputLabel") || "AI Output")}</span>
                  <span class="df-ai-output-provider">${this.escapeHtml(providerLabel)}</span>
                </div>
                <div class="df-ai-output-text">${this.formatPromptWithMentions(resultText)}</div>
              </div>
            `
                : ""
            }
            <div class="df-node-settings-bar">
              <button type="button" class="df-prompt-mode-pill nodrag ${multiPrompt ? "is-active" : ""}" data-action="toggle-prompt-multi" aria-pressed="${multiPrompt ? "true" : "false"}" title="${this.escapeAttr(multiPromptLabel)}">
                <span class="df-prompt-mode-pill-track" aria-hidden="true"><span></span></span>
                <span>${this.escapeHtml(multiPromptLabel)}</span>
              </button>
              ${modeBadge}
              ${refBadge}
              ${deleteBadge}
              ${errorBadge}
              ${this.charCountBadge(promptText)}
            </div>
            ${enhance && promptRefCount > 0 ? `<div class="df-node-ref-preview" data-ref-preview></div>` : ""}
          </div>
          ${hoverToolbar}
        </div>
      `;
    }
    if (type === "text") {
      const textContent = data.prompt || data.note_text || "";
      const slug = data.slug || "";
      return `
        <div class="df-node ${!enabled ? "df-node-disabled" : ""}${nodeHasPortsClass} df-node-thumb" data-node-type="text" data-enabled="${enabled}">
          ${portRailIn}${portRailOut}
          <div class="df-node-status ${status}"></div>
          ${this._thumbHeader("text", this.icons.text, name, "", enabled)}
          ${this.slugBadge(slug)}
          <div class="df-node-body">
            <div class="df-inline-prompt-container df-prompt-always-edit" data-mode="edit">
              <textarea
                class="df-inline-prompt-edit"
                placeholder="${this.escapeAttr(window.I18n?.t("node.textPlaceholder") || "Enter text...")}"
                rows="10"
                spellcheck="false"
              >${this.escapeHtml(textContent)}</textarea>
            </div>
            <div class="df-node-settings-bar">
              ${this.charCountBadge(textContent)}
            </div>
          </div>
          ${hoverToolbar}
        </div>`;
    }
    if (type === "text_extract") {
      const slug = data.slug || "";
      const mode = data.extract_mode || "marker";
      const marker = data.extract_marker || data.extract_regex || "";
      const markerLabel = marker
        ? this.escapeHtml(marker.substring(0, 40))
        : `<em>${window.I18n?.t("node.textExtractEmpty") || "(marker not set)"}</em>`;
      const modeIcon =
        mode === "json" ? "{}" : mode === "regex" ? "/.../" : "[ ]";
      const extractResultText = (data.result_text || "").trim();
      const hasExtractResult = !!extractResultText;
      const extractOutputLabel =
        window.I18n?.t("node.extractOutputLabel") || "Extracted";
      return `
        <div class="df-node ${!enabled ? "df-node-disabled" : ""}${nodeHasPortsClass} df-node-thumb" data-node-type="text_extract" data-enabled="${enabled}">
          ${portRailIn}${portRailOut}
          <div class="df-node-status ${status}"></div>
          ${this._thumbHeader("text", this.icons.text_extract, name, "", enabled)}
          <div class="df-node-body">
            <div class="df-node-extract-row">
              <span class="df-node-tag" title="${this.escapeAttr(mode)}">${modeIcon}</span>
              <span class="df-node-extract-marker" title="${this.escapeAttr(marker)}">${markerLabel}</span>
            </div>
            ${
              hasExtractResult
                ? `
              <div class="df-ai-output-container nodrag" data-extract-output>
                <div class="df-ai-output-label">
                  <svg class="df-ai-output-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="8" width="10" height="8" rx="1"/>
                  </svg>
                  <span class="df-ai-output-label-text">${this.escapeHtml(extractOutputLabel)}</span>
                </div>
                <div class="df-ai-output-text">${this.escapeHtml(extractResultText)}</div>
              </div>
            `
                : ""
            }
          </div>
          ${hoverToolbar}
        </div>`;
    }
    if (type === "gemini" || type === "muse") {
      const providerKey = type === "muse" ? "muse" : "gemini";
      const geminiMode = data.media_type === "Video" ? "Video" : "Image";
      const geminiRatio = data.ratio || "";
      const providerModels =
        window.ModelPresentationRegistry?.getModels?.(
          providerKey,
          geminiMode.toLowerCase(),
        ) || [];
      const configuredModel =
        data.model ||
        window.ModelRegistry?.safeGetDefault?.(
          providerKey,
          geminiMode.toLowerCase(),
        ) ||
        null;
      const modelRecord = providerModels.find(
        (item) => String(item?.value || item?.name) === String(configuredModel),
      );
      const geminiModel =
        modelRecord?.name ||
        modelRecord?.label ||
        configuredModel ||
        window.I18n?.t("common.auto") ||
        "Auto";
      const geminiRefCount = String(data.ref_file_ids || "")
        .split(",")
        .filter(Boolean).length;
      const geminiRatioClass =
        {
          "9:16": "ratio-9-16",
          "3:4": "ratio-3-4",
          "2:3": "ratio-2-3",
          "1:1": "ratio-1-1",
          "4:3": "ratio-4-3",
          "3:2": "ratio-3-2",
          "16:9": "ratio-16-9",
          story: "ratio-9-16",
          portrait: "ratio-3-4",
          square: "ratio-1-1",
          landscape: "ratio-4-3",
          widescreen: "ratio-16-9",
        }[String(geminiRatio).toLowerCase()] || "ratio-1-1";
      const pillArrow =
        '<svg class="df-pill-arrow" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
      return `
        <div class="df-node ${!enabled ? "df-node-disabled" : ""}${nodeHasPortsClass} df-node-thumb" data-node-type="${providerKey}" data-provider="${providerKey}" data-media-type="${geminiMode}" data-zoom="${nodeZoom}" data-enabled="${enabled}">
          ${portRailIn}${portRailOut}
          ${this.renderProviderBadge(providerKey)}
          ${canRunNode ? this.runNodeCornerBtn() : ""}
          <div class="df-node-status ${status}"></div>
          ${this._thumbHeader(providerKey, headerIcon, name, "", enabled)}
          ${this.zoomToggleBtn()}
          <div class="df-node-body">
            <div class="df-node-preview-wrap">
              <div class="df-node-preview ${geminiRatioClass}" data-node-preview><div class="df-node-preview-placeholder">${this._previewPlaceholderIcon(geminiMode === "Video")}</div></div>
              ${prompt ? `<div class="df-node-prompt df-node-prompt-overlay nodrag" title="${this.escapeHtml(prompt)}">${this.escapeHtml(prompt)}</div>` : ""}
            </div>
            <div class="df-node-settings-bar">
              <button type="button" class="df-node-tag df-node-tag-editable" data-setting="${providerKey}Mode" title="${window.I18n?.t("workflow.modeLabel") || "Mode"}"><span>${geminiMode}</span>${pillArrow}</button>
              <button type="button" class="df-node-tag df-node-tag-editable" data-setting="${providerKey}Model" title="${window.I18n?.t("node.modelPill") || "Model"}"><span>${this.escapeHtml(geminiModel)}</span>${pillArrow}</button>
              <button type="button" class="df-node-tag df-node-tag-editable${geminiRatio ? "" : " df-node-tag-empty"}" data-setting="${providerKey}Ratio" title="${window.I18n?.t("node.ratioPill") || "Ratio"}"><span>${this.escapeHtml(geminiRatio || "\u2014")}</span>${pillArrow}</button>
            </div>
            ${geminiRefCount > 0 ? '<div class="df-node-ref-preview" data-ref-preview></div>' : ""}
          </div>
          ${hoverToolbar}
        </div>`;
    }
    if (type === "chatgpt") {
      const ratioUiMap = window.ProviderConfigManager?.getRatioUiMapSync?.(
        "chatgpt",
      ) || {
        story: "9:16",
        portrait: "3:4",
        square: "1:1",
        landscape: "4:3",
        widescreen: "16:9",
      };
      const cgRatio = data.ratio || "story";
      const cgRatioLabel = ratioUiMap[cgRatio] || cgRatio;
      const cgModel =
        data.model ||
        window.ModelRegistry?.safeGetDefault?.("chatgpt", "image") ||
        "";
      const cgRatioClassMap = {
        story: "ratio-9-16",
        portrait: "ratio-3-4",
        square: "",
        landscape: "ratio-4-3",
        widescreen: "ratio-16-9",
      };
      const cgRatioClass =
        cgRatioClassMap[cgRatio] !== void 0 ? cgRatioClassMap[cgRatio] : "";
      const cgUseFallback = data.use_fallback_prefix || "auto";
      const cgModeLabelMap = { auto: "Auto", always: "Always", never: "Never" };
      const cgModeLabel = cgModeLabelMap[cgUseFallback] || cgUseFallback;
      const lastError = data.last_error;
      const errorMap = {
        RATE_LIMIT: window.I18n?.t("node.errBadge.rateLimit") || "Rate limited",
        CONTENT_BLOCKED:
          window.I18n?.t("node.errBadge.contentBlocked") || "Blocked",
        IMAGE_GEN_FAILED:
          window.I18n?.t("node.errBadge.genFailed") || "Gen failed",
        NETWORK: window.I18n?.t("node.errBadge.network") || "Network",
      };
      const errorLabel =
        lastError && errorMap[lastError] ? errorMap[lastError] : "";
      const errorBadge = errorLabel
        ? `<span class="df-node-tag df-node-tag-error">${errorLabel}</span>`
        : "";
      const cgRefFileIds = data.ref_file_ids || "";
      const cgRefCount = cgRefFileIds
        ? cgRefFileIds.split(",").filter(Boolean).length
        : 0;
      return `
        <div class="df-node ${!enabled ? "df-node-disabled" : ""}${nodeHasPortsClass} df-node-thumb" data-node-type="chatgpt" data-provider="openai" data-zoom="${nodeZoom}" data-enabled="${enabled}">
          ${portRailIn}${portRailOut}
          ${this.renderProviderBadge("chatgpt")}
          ${canRunNode ? this.runNodeCornerBtn() : ""}
          <div class="df-node-status ${status}"></div>
          ${this._thumbHeader("chatgpt", headerIcon, name, "", enabled)}
          ${this.zoomToggleBtn()}
          <div class="df-node-body">
            <div class="df-node-preview-wrap">
              <div class="df-node-preview ${cgRatioClass}" data-node-preview>
                <div class="df-node-preview-placeholder">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                </div>
              </div>
              ${prompt ? `<div class="df-node-prompt df-node-prompt-overlay nodrag" title="${this.escapeHtml(prompt)}">${this.escapeHtml(prompt)}</div>` : ""}
            </div>
            <div class="df-node-settings-bar">
              <button type="button" class="df-node-tag df-node-tag-editable" data-setting="chatgptModel" title="${window.I18n?.t("node.modelPill") || "Model"}" data-tooltip="${window.I18n?.t("node.modelPill") || "Model"}"><span>${this.escapeHtml(cgModel)}</span><svg class="df-pill-arrow" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg></button>
              <button type="button" class="df-node-tag df-node-tag-editable" data-setting="chatgptRatio" title="${window.I18n?.t("node.ratioPill") || "Ratio"}" data-tooltip="${window.I18n?.t("node.ratioPill") || "Ratio"}"><span>${this.escapeHtml(cgRatioLabel)}</span><svg class="df-pill-arrow" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg></button>
              <button type="button" class="df-node-tag df-node-tag-editable" data-setting="chatgptMode" title="${window.I18n?.t("workflow.chatgptMode") || "Generation mode"}" data-tooltip="${window.I18n?.t("workflow.chatgptMode") || "Generation mode"}"><span>${this.escapeHtml(cgModeLabel)}</span><svg class="df-pill-arrow" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg></button>
              ${errorBadge}
            </div>
            ${cgRefCount > 0 ? `<div class="df-node-ref-preview" data-ref-preview></div>` : ""}
          </div>
          ${hoverToolbar}
        </div>
      `;
    }
    if (type === "grok") {
      const grokRatio = data.ratio || "widescreen";
      const grokRatioUiMap = window.ProviderConfigManager?.getRatioUiMapSync?.(
        "grok",
      ) || {
        story: "9:16",
        portrait: "2:3",
        square: "1:1",
        landscape: "3:2",
        widescreen: "16:9",
      };
      const grokRatioLabel = grokRatioUiMap[grokRatio] || grokRatio;
      const grokRatioClassMap = {
        story: "ratio-9-16",
        "9:16": "ratio-9-16",
        portrait: "ratio-2-3",
        "2:3": "ratio-2-3",
        square: "",
        "1:1": "",
        landscape: "ratio-3-2",
        "3:2": "ratio-3-2",
        widescreen: "ratio-16-9",
        "16:9": "ratio-16-9",
      };
      const grokRatioClass =
        grokRatioClassMap[grokRatio] !== void 0
          ? grokRatioClassMap[grokRatio]
          : "";
      const grokMode = data.grok_mode || data.mode || "image";
      const grokRefFileIds = data.ref_file_ids || "";
      const grokRefCount = grokRefFileIds
        ? grokRefFileIds.split(",").filter(Boolean).length
        : 0;
      const grokModeLabel = grokMode === "video" ? "Video" : "Image";
      const grokImageQuality = data.grok_image_quality || "speed";
      const grokQualityLabel =
        grokImageQuality === "quality"
          ? window.I18n?.t("grok.imageQualityQuality") || "Quality"
          : window.I18n?.t("grok.imageQualitySpeed") || "Nhanh";
      const grokDuration = data.grok_duration || "6s";
      const grokResolution = data.grok_resolution || "720p";
      return `
        <div class="df-node ${!enabled ? "df-node-disabled" : ""}${nodeHasPortsClass} df-node-thumb" data-node-type="grok" data-provider="grok" data-media-type="${grokModeLabel}" data-zoom="${nodeZoom}" data-enabled="${enabled}">
          ${portRailIn}${portRailOut}
          ${this.renderProviderBadge("grok")}
          ${canRunNode ? this.runNodeCornerBtn() : ""}
          <div class="df-node-status ${status}"></div>
          ${this._thumbHeader("grok", headerIcon, name, "", enabled)}
          ${this.zoomToggleBtn()}
          <div class="df-node-body">
            <div class="df-node-preview-wrap">
              <div class="df-node-preview ${grokRatioClass}" data-node-preview>
                <div class="df-node-preview-placeholder">
                  ${this._previewPlaceholderIcon(grokMode === "video")}
                </div>
              </div>
              ${prompt ? `<div class="df-node-prompt df-node-prompt-overlay nodrag" title="${this.escapeHtml(prompt)}">${this.escapeHtml(prompt)}</div>` : ""}
            </div>
            <div class="df-node-settings-bar">
                <button type="button" class="df-node-tag df-node-tag-editable" data-setting="grokMode" title="${window.I18n?.t("node.modeGrok") || "Mode (Image/Video)"}" data-tooltip="${window.I18n?.t("node.modeGrok") || "Mode (Image/Video)"}"><span>${grokModeLabel}</span><svg class="df-pill-arrow" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg></button>
              <button type="button" class="df-node-tag df-node-tag-editable" data-setting="grokRatio" title="${window.I18n?.t("node.ratioPill") || "Ratio"}" data-tooltip="${window.I18n?.t("node.ratioPill") || "Ratio"}"><span>${this.escapeHtml(grokRatioLabel)}</span><svg class="df-pill-arrow" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg></button>
              ${
                grokMode === "image"
                  ? `
              <button type="button" class="df-node-tag df-node-tag-editable" data-setting="grokImageQuality" title="${window.I18n?.t("workflow.grokImageQuality") || "Image quality"}" data-tooltip="${window.I18n?.t("workflow.grokImageQuality") || "Image quality"}"><span>${this.escapeHtml(grokQualityLabel)}</span><svg class="df-pill-arrow" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg></button>
              `
                  : `
              <button type="button" class="df-node-tag df-node-tag-editable" data-setting="grokDuration" title="${window.I18n?.t("workflow.grokDuration") || "Video duration"}" data-tooltip="${window.I18n?.t("workflow.grokDuration") || "Video duration"}"><span>${this.escapeHtml(grokDuration)}</span><svg class="df-pill-arrow" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg></button>
              <button type="button" class="df-node-tag df-node-tag-editable" data-setting="grokResolution" title="${window.I18n?.t("workflow.grokResolution") || "Resolution"}" data-tooltip="${window.I18n?.t("workflow.grokResolution") || "Resolution"}"><span>${this.escapeHtml(grokResolution)}</span><svg class="df-pill-arrow" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg></button>
              `
              }
              </div>
            ${grokRefCount > 0 ? `<div class="df-node-ref-preview" data-ref-preview></div>` : ""}
          </div>
          ${hoverToolbar}
        </div>
      `;
    }
    const refFileIds = data.ref_file_ids || "";
    const refCount = refFileIds
      ? refFileIds.split(",").filter(Boolean).length
      : 0;
    return `
      <div class="df-node ${!enabled ? "df-node-disabled" : ""}${nodeHasPortsClass} df-node-thumb" data-node-type="${type}" data-media-type="${mediaType}" data-provider="${this.getNodeProvider(type) || ""}" data-zoom="${nodeZoom}" data-enabled="${enabled}">
        ${portRailIn}${portRailOut}
        ${this.renderProviderBadge(type)}
        ${canRunNode ? this.runNodeCornerBtn() : ""}
        <div class="df-node-status ${status}"></div>
        ${this._thumbHeader(config.color, headerIcon, name, "", enabled)}
        ${this.zoomToggleBtn()}
        <div class="df-node-body">
          <div class="df-node-preview-wrap">
            <div class="df-node-preview ${ratioClass}" data-node-preview>
              <div class="df-node-preview-placeholder">
                ${this._previewPlaceholderIcon(isVideo)}
              </div>
            </div>
            ${prompt ? `<div class="df-node-prompt df-node-prompt-overlay nodrag" title="${this.escapeHtml(prompt)}">${this.escapeHtml(prompt)}</div>` : ""}
          </div>
          <div class="df-node-settings-bar">
              <button type="button" class="df-node-tag df-node-tag-editable" data-setting="quantity" data-qty-value title="${window.I18n?.t("node.quantityPill") || "Quantity"}" data-tooltip="${window.I18n?.t("node.quantityPill") || "Quantity"}"><span>${quantity}x</span><svg class="df-pill-arrow" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg></button>
            <button type="button" class="df-node-tag df-node-tag-editable" data-setting="mediaType" title="${window.I18n?.t("node.mediaTypePill") || "Media type"}" data-tooltip="${window.I18n?.t("node.mediaTypePill") || "Media type"}"><span>${mediaType}</span><svg class="df-pill-arrow" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg></button>
            ${model ? `<button type="button" class="df-node-tag df-node-tag-editable" data-setting="model" title="${window.I18n?.t("node.modelPill") || "Model"}" data-tooltip="${window.I18n?.t("node.modelPill") || "Model"}"><span>${this.escapeHtml(model)}</span><svg class="df-pill-arrow" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg></button>` : `<button type="button" class="df-node-tag df-node-tag-editable df-node-tag-empty" data-setting="model" title="${window.I18n?.t("node.modelPill") || "Model"}" data-tooltip="${window.I18n?.t("node.modelPill") || "Model"}"><span>${window.I18n?.t("node.modelAuto") || "Auto"}</span><svg class="df-pill-arrow" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg></button>`}
            ${isVideo ? `<button type="button" class="df-node-tag df-node-tag-editable" data-setting="videoInputType" title="${window.I18n?.t("node.videoInputTypePill") || "Video mode"}" data-tooltip="${window.I18n?.t("node.videoInputTypePill") || "Video mode"}"><span>${this.escapeHtml(videoInputTypeDisplay)}</span><svg class="df-pill-arrow" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg></button>` : ""}
            ${showVideoDuration ? `<button type="button" class="df-node-tag df-node-tag-editable" data-setting="videoDuration" title="${window.I18n?.t("node.durationPill") || "Duration"}" data-tooltip="${window.I18n?.t("node.durationPill") || "Duration"}"><span>${videoDuration}</span><svg class="df-pill-arrow" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg></button>` : ""}
            ${ratio ? `<button type="button" class="df-node-tag df-node-tag-editable" data-setting="ratio" title="${window.I18n?.t("node.ratioPill") || "Ratio"}" data-tooltip="${window.I18n?.t("node.ratioPill") || "Ratio"}"><span>${this.escapeHtml(ratio)}</span><svg class="df-pill-arrow" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg></button>` : `<button type="button" class="df-node-tag df-node-tag-editable df-node-tag-empty" data-setting="ratio" title="${window.I18n?.t("node.ratioPill") || "Ratio"}" data-tooltip="${window.I18n?.t("node.ratioPill") || "Ratio"}"><span>\u2014</span><svg class="df-pill-arrow" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg></button>`}
            </div>
          ${refCount > 0 ? `<div class="df-node-ref-preview" data-ref-preview></div>` : ""}
        </div>
        ${hoverToolbar}
      </div>
    `;
  },
  _mapVnRatioToNumeric(vnRatio) {
    if (!vnRatio) return null;
    const map = { "D\u1ECDc": "9:16", Ngang: "16:9", "Vu\xF4ng": "1:1" };
    return map[vnRatio] || vnRatio;
  },
  normalizeNodeData(data, { preferUserModel = false } = {}) {
    if (!data || typeof data !== "object") return data;
    const t = data.node_type;
    if (t === "generate" || t === "gemini") {
      if (!data.media_type) data.media_type = "Image";
      else {
        const mt = String(data.media_type).toLowerCase();
        if (mt === "image") data.media_type = "Image";
        else if (mt === "video") data.media_type = "Video";
      }
      if (!data.model) {
        const isVid = data.media_type === "Video";
        const provider = t === "gemini" ? "gemini" : "flow";
        const preferred =
          preferUserModel && t === "generate"
            ? window.storageSettings?.get?.(
                isVid ? "defaultVideoModel" : "defaultImageModel",
              )
            : null;
        const configured =
          preferred ||
          window.ModelRegistry?.safeGetDefault?.(
            provider,
            isVid ? "video" : "image",
          );
        data.model =
          window.ModelRegistry?.getCanonicalValue?.(provider, configured) ||
          configured ||
          data.model;
      } else {
        const provider = t === "gemini" ? "gemini" : "flow";
        data.model =
          window.ModelRegistry?.getCanonicalValue?.(provider, data.model) ||
          data.model;
      }
      if (t === "generate" && data.media_type === "Video") {
        if (!data.video_input_type) {
          const settingDefault = window.storageSettings?.get?.(
            "defaultVideoInputType",
          );
          data.video_input_type =
            settingDefault === "Ingredients" || settingDefault === "Frames"
              ? settingDefault
              : "Ingredients";
        }
        if (!data.video_duration) data.video_duration = "6s";
      }
    } else if (t === "chatgpt") {
      if (!data.use_fallback_prefix) data.use_fallback_prefix = "auto";
      const cgModels =
        window.ModelRegistry?.safeGetValuesList?.("chatgpt", "image") || [];
      if (
        !data.model ||
        (cgModels.length > 0 && !cgModels.includes(data.model))
      ) {
        data.model =
          window.ModelRegistry?.safeGetDefault?.("chatgpt", "image") ||
          cgModels[0] ||
          null;
      }
    } else if (t === "grok") {
      window.ProviderRegistry?.get?.("grok")?.normalizeNodeData?.(data);
      if (!data.grok_mode)
        data.grok_mode =
          String(data.media_type || "").toLowerCase() === "video"
            ? "video"
            : "image";
      if (data.grok_mode === "video" && !data.video_input_type)
        data.video_input_type = "Ingredients";
    } else if (t === "download") {
      const wm = data.watermark_mode;
      if (wm !== "clean" && wm !== "original") data.watermark_mode = "inherit";
    }
    if (t === "generate") {
      const wmg = data.watermark_mode;
      if (wmg !== "clean" && wmg !== "original")
        data.watermark_mode = "inherit";
    } else if (t === "note") {
      const clamp = (v, lo) => {
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? Math.max(lo, n) : void 0;
      };
      const w = clamp(data.note_width, 160);
      const h = clamp(data.note_height, 100);
      if (w !== void 0) data.note_width = w;
      if (h !== void 0) data.note_height = h;
    } else if (t === "prompt") {
      if (!data.prompt_mode) data.prompt_mode = "auto";
      if (data.use_ai === void 0 && data.enhance !== void 0)
        data.use_ai = !!data.enhance;
      if (data.ai_fallback === void 0 && data.enhance_fallback !== void 0)
        data.ai_fallback = !!data.enhance_fallback;
      if (
        data.ai_delete_after_run === void 0 &&
        data.delete_after_enhance !== void 0
      )
        data.ai_delete_after_run = !!data.delete_after_enhance;
    } else if (t === "text_extract") {
      if (!data.extract_mode) data.extract_mode = "marker";
      if (data.extract_strict === void 0) data.extract_strict = false;
      if (!data.extract_multi_match) data.extract_multi_match = "first";
      if (!data.extract_on_fail) data.extract_on_fail = "skip_downstream";
    }
    return data;
  },
  getDefaults(type, settings = null) {
    type = this._normalizeType(type);
    switch (type) {
      case "generate": {
        const mediaType = settings?.defaultGenType || "Image";
        const isVideo = mediaType === "Video";
        const userRatio = isVideo
          ? settings?.defaultVideoRatio ||
            this._mapVnRatioToNumeric(settings?.defaultRatio)
          : settings?.defaultImageRatio ||
            this._mapVnRatioToNumeric(settings?.defaultRatio);
        const ratio = isVideo
          ? userRatio === "16:9" || userRatio === "9:16"
            ? userRatio
            : "16:9"
          : userRatio || "16:9";
        const configuredModel =
          (isVideo
            ? settings?.defaultVideoModel
            : settings?.defaultImageModel) ||
          window.ModelRegistry?.safeGetDefault(
            "flow",
            isVideo ? "video" : "image",
          ) ||
          null;
        const model =
          window.ModelRegistry?.getCanonicalValue?.("flow", configuredModel) ||
          configuredModel;
        if (!model)
          console.debug(
            `[Tier3] NodeTemplates: flow.${isVideo ? "video" : "image"} default model cache miss`,
          );
        const videoInputDefault = settings?.defaultVideoInputType;
        const videoInputType =
          videoInputDefault === "Ingredients" || videoInputDefault === "Frames"
            ? videoInputDefault
            : "Ingredients";
        return {
          quantity: 1,
          media_type: mediaType,
          ratio,
          model,
          video_input_type: isVideo ? videoInputType : void 0,
          video_duration: isVideo
            ? settings?.defaultVideoDuration || "6s"
            : void 0,
          voice_slug: null,
          voice_search_value: null,
          character_selections: null,
          character_slug: null,
          character_search_value: null,
          auto_download: false,
          download_resolution: settings?.downloadResolution || "1k",
          video_download_resolution: "720p",
          enabled: true,
          status: "pending",
        };
      }
      case "chatgpt":
        return {
          ratio: settings?.chatgptDefaultRatio || "story",
          use_fallback_prefix: "auto",
          timeout_ms: 12e4,
          max_ref_images: 4,
          auto_download: false,
          chatgpt_delete_after_gen: settings?.chatgptDeleteAfterGen === true,
          enabled: true,
          status: "pending",
        };
      case "grok": {
        const mode = settings?.grokDefaultMode || "image";
        const model =
          window.ModelRegistry?.safeGetDefault?.("grok", mode) || null;
        return {
          model,
          video_input_type: mode === "video" ? "Ingredients" : null,
          ratio: settings?.grokDefaultRatio || "widescreen",
          grok_mode: mode,
          grok_duration: settings?.grokDefaultDuration || "6s",
          grok_resolution: settings?.grokDefaultResolution || "720p",
          grok_image_quality: settings?.grokDefaultImageQuality || "speed",
          quantity: 1,
          timeout_ms: 18e4,
          max_ref_images:
            window.ProviderRegistry?.get?.("grok")?.getMaxRefImages?.({
              mode,
              modelValue: model,
            }) ?? 0,
          auto_download: false,
          enabled: true,
          status: "pending",
        };
      }
      case "gemini": {
        const mediaType =
          settings?.defaultGenType === "Video" ? "Video" : "Image";
        const mode = mediaType.toLowerCase();
        const ratios =
          window.ProviderConfigManager?.safeGetRatiosSync?.("gemini", mode) ||
          [];
        return {
          provider: "gemini",
          media_type: mediaType,
          model:
            settings?.geminiModel ||
            window.ModelRegistry?.safeGetDefault?.("gemini", mode) ||
            null,
          ratio:
            (mediaType === "Video"
              ? settings?.geminiVideoRatio
              : settings?.geminiRatio) ||
            ratios.find((item) => item?.is_default)?.value ||
            ratios[0]?.value ||
            null,
          quantity: 1,
          prompt_source: "textbox",
          multi_prompt: false,
          auto_download: false,
          gemini_delete_after_gen: settings?.geminiDeleteAfterGen === true,
          enabled: true,
          status: "pending",
        };
      }
      case "muse": {
        const mediaType =
          settings?.defaultGenType === "Video" ? "Video" : "Image";
        const mode = mediaType.toLowerCase();
        const ratios =
          window.ProviderConfigManager?.safeGetRatiosSync?.("muse", mode) || [];
        return {
          provider: "muse",
          media_type: mediaType,
          model: window.ModelRegistry?.safeGetDefault?.("muse", mode) || null,
          ratio:
            settings?.museDefaultRatio ||
            ratios.find((item) => item?.is_default)?.value ||
            ratios[0]?.value ||
            null,
          quantity: 1,
          prompt_source: "textbox",
          multi_prompt: false,
          auto_download: false,
          muse_upload_video_to_flow: true,
          muse_delete_after_gen: settings?.museDeleteAfterGen === true,
          enabled: true,
          status: "pending",
        };
      }
      case "prompt":
        return {
          prompt_mode: "auto",
          use_ai: false,
          ai_fallback: true,
          ai_delete_after_run: true,
          provider: "chatgpt",
          timeout_sec: 60,
          max_ref_images: 4,
          enabled: true,
          status: "pending",
        };
      case "delay":
        return { delay_seconds: 3, enabled: true, status: "pending" };
      case "download":
        return {
          download_resolution: settings?.downloadResolution || "1k",
          download_folder: "",
          download_file_template: "{node}_{prompt}_{date}_{time}_{index}",
          download_collect_all: false,
          enabled: true,
          status: "pending",
        };
      case "telegram":
        return {
          telegram_send_mode: "group",
          telegram_message: "",
          enabled: true,
          status: "pending",
        };
      case "image":
        return { max_ref_images: 1, enabled: true, status: "pending" };
      case "text":
        return {
          prompt: "",
          slug_auto: true,
          enabled: true,
          status: "pending",
        };
      case "text_extract":
        return {
          extract_mode: "marker",
          extract_marker: "",
          extract_regex: "",
          extract_strict: false,
          extract_multi_match: "first",
          extract_on_fail: "skip_downstream",
          slug_auto: true,
          enabled: true,
          status: "pending",
        };
      case "note":
        return {
          note_text: "",
          note_color: "#3b82f6",
          note_font_size: 48,
          note_width: 1260,
          note_height: 840,
          enabled: true,
        };
      default:
        return { enabled: true, status: "pending" };
    }
  },
  createPaletteItem(type) {
    const config = this.getType(type);
    const icon = this.icons[type];
    const isComingSoon = !!config.comingSoon;
    const comingSoonLabel =
      window.I18n?.t("workflow.comingSoon") || "Coming soon";
    return `
      <div class="node-palette-item${isComingSoon ? " node-palette-item--coming-soon" : ""}"
           data-node-type="${type}"
           draggable="${isComingSoon ? "false" : "true"}"
           ${isComingSoon ? `data-disabled="true" title="${comingSoonLabel}"` : ""}>
        <div class="node-palette-item-icon df-node-icon ${config.color}">${icon}</div>
        <div class="node-palette-item-name">${config.name}</div>
        ${isComingSoon ? `<span class="node-palette-item-badge">${comingSoonLabel}</span>` : ""}
      </div>
    `;
  },
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text || "";
    return div.innerHTML;
  },
  escapeAttr(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },
  _fmtThousands(n) {
    return String(n >>> 0).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  },
  promptMaxLength() {
    return (
      window.ValidationRules?.safeGetInt?.("prompt_max_length", null) ?? null
    );
  },
  charCountBadge(text) {
    const len = (text || "").length;
    const max = this.promptMaxLength();
    const over = max > 0 && len > max;
    const title =
      window.I18n?.t?.("node.charCountTip") ||
      `Character count / limit (prompt_max_length=${this._fmtThousands(max)})`;
    return `<span class="df-node-char-count${over ? " df-over-limit" : ""}" title="${this.escapeAttr(title)}">${this._fmtThousands(len)}/${max === null ? "\u2026" : max > 0 ? this._fmtThousands(max) : "\u221E"}</span>`;
  },
  formatPromptWithMentions(text) {
    if (!text) return "";
    const escaped = this.escapeHtml(text);
    return escaped
      .replace(
        /@(voice|char):(\[[^\]]+\]|[^\s]+)/g,
        '<span class="df-prompt-mention">$&</span>',
      )
      .replace(
        /@([a-z][a-z0-9_]{0,29})(?![a-zA-Z0-9_:])/gi,
        '<span class="df-prompt-mention">@$1</span>',
      );
  },
  detectRefMediaKind(data) {
    const thumbs = data?.ref_thumbnails;
    const persistedKind =
      String(data?.media_type || data?.gen_type || "").toLowerCase() === "video"
        ? "video"
        : "image";
    if (!thumbs || typeof thumbs !== "object") return persistedKind;
    let activeIds = null;
    const raw = data.ref_file_ids;
    if (typeof raw === "string" && raw.trim()) {
      activeIds = new Set(
        raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
    } else if (Array.isArray(raw) && raw.length > 0) {
      activeIds = new Set(raw.filter(Boolean));
    }
    let explicitImage = false;
    for (const [fid, val] of Object.entries(thumbs)) {
      if (activeIds && !activeIds.has(fid)) continue;
      const displayName = String(val?.display_name || val?.original_name || "");
      if (/\.(?:mp4|webm|mov|m4v|avi|mkv)(?:[?#]|$)/i.test(displayName))
        return "video";
      if (
        /\.(?:png|jpe?g|webp|gif|avif|heic|heif)(?:[?#]|$)/i.test(displayName)
      ) {
        explicitImage = true;
        continue;
      }
      if (
        val &&
        typeof val === "object" &&
        (String(val.type || "").toLowerCase() === "video" || val.video_url)
      )
        return "video";
      if (
        fid.startsWith("upload_import_") &&
        typeof val === "string" &&
        /\.(mp4|webm|mov)(?:[?#]|$)/i.test(val)
      )
        return "video";
    }
    if (explicitImage) return "image";
    return persistedKind;
  },
  getNodePorts(type, data = {}) {
    type = this._normalizeType(type);
    const merged = this.getType ? this.getType(type) : null;
    const config = merged || this.types[type];
    if (!config?.ports) return { in: [], out: [] };
    const filterDynamic = (port) => {
      if (port.name === "frame" || port.name === "last_frame") {
        if (type === "generate")
          return (data.media_type || "Image") === "Video";
        if (type === "grok")
          return (data.grok_mode || data.mode || "image") === "video";
      }
      if (!port.visibleWhen) return true;
      if (port.visibleWhen === "isGrokVideoFrames") {
        return (
          (data.grok_mode || data.mode || "image") === "video" &&
          data.video_input_type === "Frames" &&
          !!window.ProviderRegistry?.get?.("grok")
            ?.getVideoInputTypes?.(data.model)
            ?.some((option) => option.value === "Frames")
        );
      }
      if (port.visibleWhen === "isVideoFrames") {
        const flowAdapter = window.ProviderRegistry?.get?.("flow");
        const modelConfig = window.ModelPresentationRegistry?.displayModel?.(
          "flow",
          data.model,
        )?.config;
        const modelSupportsFrames =
          !!window.ModelRegistry?.findModel?.("flow", data.model) &&
          typeof flowAdapter?.supportsFrames === "function"
            ? flowAdapter.supportsFrames(data.model)
            : modelConfig?.supports_frames !== false;
        return (
          data.media_type === "Video" &&
          data.video_input_type === "Frames" &&
          modelSupportsFrames
        );
      }
      if (port.visibleWhen === "isVideoIngredient") {
        const flowAdapter = window.ProviderRegistry?.get?.("flow");
        const modelConfig = window.ModelPresentationRegistry?.displayModel?.(
          "flow",
          data.model,
        )?.config;
        const modelSupportsRefVideo =
          !!window.ModelRegistry?.findModel?.("flow", data.model) &&
          typeof flowAdapter?.supportsRefVideo === "function"
            ? flowAdapter.supportsRefVideo(data.model)
            : modelConfig?.supports_ref_video === true;
        return (
          data.media_type === "Video" &&
          data.video_input_type === "Ingredients" &&
          modelSupportsRefVideo
        );
      }
      if (port.visibleWhen === "enhance") {
        return !!data.use_ai;
      }
      if (port.visibleWhen === "isVideo") {
        return (data.media_type || "Image") === "Video";
      }
      if (port.visibleWhen === "isGrokVideo") {
        return (data.grok_mode || "image") === "video";
      }
      return true;
    };
    const resolveDynamicType = (port) => {
      if (port.name === "frame" || port.name === "last_frame") {
        return { ...port, type: "frame" };
      }
      if (!port.dynamicType) return port;
      if (port.dynamicType === "media_type") {
        const mt = data.media_type || "Image";
        return { ...port, type: mt === "Video" ? "video" : "image" };
      }
      if (port.dynamicType === "grok_mode") {
        const mode = data.grok_mode || data.mode || "image";
        return { ...port, type: mode === "video" ? "video" : "image" };
      }
      if (port.dynamicType === "ref_media_kind") {
        const isVideo = NodeTemplates.detectRefMediaKind(data) === "video";
        return {
          ...port,
          type: isVideo ? "video" : "image",
          label: isVideo
            ? window.I18n?.t("node.portRefVideo") || "Ref video"
            : window.I18n?.t("node.portRefImage") || "Ref image",
        };
      }
      return port;
    };
    const ports = {
      in: (config.ports.in || []).filter(filterDynamic).map(resolveDynamicType),
      out: (config.ports.out || [])
        .filter(filterDynamic)
        .map(resolveDynamicType),
    };
    if (type === "prompt" && data.multi_prompt === true) {
      const items = Array.isArray(data.prompts_json)
        ? data.prompts_json
            .map((item) => String(item || "").trim())
            .filter(Boolean)
        : [];
      if (items.length > 0) {
        ports.out = items.map((_, index) => ({
          name: `prompt_${index + 1}`,
          type: "text",
          label: `${window.I18n?.t("workflow.prompt") || "Prompt"} ${index + 1}`,
          multiple: true,
        }));
      }
    }
    return ports;
  },
  _serverTypes: null,
  _serverTypesFetching: false,
  _serverTypesPromise: null,
  _serverTypesFetchedAt: 0,
  _SERVER_TYPES_TTL: 60 * 60 * 1e3,
  _lastVersion: null,
  async fetchFromServer() {
    if (
      this._serverTypes &&
      this._serverTypesFetchedAt &&
      Date.now() - this._serverTypesFetchedAt < this._SERVER_TYPES_TTL
    ) {
      console.log(
        "[NodeTemplates] fetchFromServer \u2192 returning cached",
        Object.keys(this._serverTypes).length,
        "types",
      );
      return this._serverTypes;
    }
    console.log(
      "[NodeTemplates] fetchFromServer \u2192 fetching fresh data...",
    );
    if (this._serverTypesFetching && this._serverTypesPromise) {
      return this._serverTypesPromise;
    }
    this._serverTypesFetching = true;
    this._serverTypesPromise = this._doFetch();
    try {
      const result = await this._serverTypesPromise;
      this._serverTypes = result;
      this._serverTypesFetchedAt = Date.now();
      return result;
    } finally {
      this._serverTypesFetching = false;
    }
  },
  _readStoredToken() {
    return new Promise((resolve) => {
      try {
        if (!chrome?.storage?.local) return resolve(null);
        chrome.storage.local.get(["af_auth"], (res) => {
          try {
            void chrome.runtime?.lastError;
          } catch (_) {}
          resolve(res?.af_auth?.token || null);
        });
      } catch (_) {
        resolve(null);
      }
    });
  },
  async _doFetch() {
    try {
      const baseUrl = window.ApiBaseConfig.get();
      const headers = { "Content-Type": "application/json" };
      try {
        if (chrome?.runtime?.id) headers["X-Extension-Id"] = chrome.runtime.id;
      } catch (_) {}
      try {
        Object.assign(
          headers,
          await (window.RequestSigner?.headers?.(
            "GET",
            new URL(`${baseUrl}/workflow-node-types`).pathname,
            "",
          ) || {}),
        );
      } catch (_) {}
      try {
        const manifestVersion = chrome?.runtime?.getManifest?.()?.version;
        if (manifestVersion) headers["X-Ext-Version"] = manifestVersion;
      } catch (e) {}
      try {
        let token = window.authManager?.token || null;
        if (!token && !window.authManager)
          token = await this._readStoredToken();
        if (token) headers["Authorization"] = `Bearer ${token}`;
      } catch (e) {}
      console.log(
        "[NodeTemplates] Fetching from:",
        `${baseUrl}/workflow-node-types`,
        "token:",
        !!headers["Authorization"],
      );
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8e3);
      let resp;
      try {
        resp = await fetch(`${baseUrl}/workflow-node-types`, {
          method: "GET",
          headers,
          cache: "no-store",
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      if (!resp.ok) {
        console.warn(
          "[NodeTemplates] Failed to fetch node types from server:",
          resp.status,
        );
        return {};
      }
      const json = await resp.json();
      if (!json.success || !Array.isArray(json.data)) {
        console.warn("[NodeTemplates] Invalid response:", {
          success: json.success,
          dataType: typeof json.data,
          dataLength: json.data?.length,
        });
        return {};
      }
      console.log(
        "[NodeTemplates] Server returned",
        json.data.length,
        "node types",
      );
      if (json.meta && typeof json.meta.version !== "undefined") {
        this._lastVersion = json.meta.version;
      }
      const serverMap = {};
      for (const item of json.data) {
        const cfg = item.config || {};
        serverMap[item.type] = {
          name: item.name,
          description: item.description,
          icon: item.icon || null,
          color: item.color || item.type,
          comingSoon: item.coming_soon === true || item.coming_soon === 1,
          sortOrder: item.sort_order ?? 999,
          ports: cfg.ports || null,
          defaults: cfg.defaults || {},
          validation: cfg.validation || {},
          ui: cfg.ui || {},
          config: cfg,
        };
      }
      console.log(
        "[NodeTemplates] Loaded",
        Object.keys(serverMap).length,
        "node types from server:",
        Object.entries(serverMap)
          .map(([k, v]) => `${k}="${v.name}"`)
          .join(", "),
      );
      return serverMap;
    } catch (err) {
      console.warn("[NodeTemplates] Error fetching node types:", err.message);
      return {};
    }
  },
  getType(type) {
    type = this._normalizeType(type);
    const localConfig = this.types[type] || this.types.generate;
    const serverConfig = this._serverTypes?.[type];
    if (!serverConfig) {
      return localConfig;
    }
    return {
      ...localConfig,
      name: serverConfig.name || localConfig.name,
      description: serverConfig.description || localConfig.description,
      color: serverConfig.color || localConfig.color,
      icon: serverConfig.icon || localConfig.icon,
      comingSoon: serverConfig.comingSoon ?? localConfig.comingSoon ?? false,
      sortOrder: serverConfig.sortOrder ?? localConfig.sortOrder ?? 999,
      ports: this._mergePortsI18nLabel(serverConfig.ports, localConfig.ports),
      defaults: {
        ...(localConfig.defaults || {}),
        ...(serverConfig.defaults || {}),
      },
      validation: {
        ...(localConfig.validation || {}),
        ...(serverConfig.validation || {}),
      },
      ui: { ...(localConfig.ui || {}), ...(serverConfig.ui || {}) },
      config: { ...(localConfig.config || {}), ...(serverConfig.config || {}) },
    };
  },
  _PORT_LABEL_I18N: {
    "\u1EA2nh tham chi\u1EBFu": "node.portRefImages",
    "Prompt text": "node.portPromptText",
    "Frame 1 (video)": "node.portFrame1",
    "Frame 2 (video)": "node.portFrame2",
    "Video tham chi\u1EBFu": "node.portRefVideo",
    "K\u1EBFt qu\u1EA3": "node.portResult",
    "Files c\u1EA7n t\u1EA3i": "node.portFilesToDownload",
    "Input pass-through": "node.portInputPassthrough",
    "Output (sau delay)": "node.portOutputAfterDelay",
    "\u1EA2nh ref": "node.portRefImage",
    "Files g\u1EEDi Telegram": "node.portFilesToTelegram",
    "Pass-through": "node.portPassthrough",
    "\u1EA2nh ChatGPT": "node.portChatgptImages",
    "Prompt upstream": "node.portPromptUpstream",
    "Result text": "node.portResultText",
    "Text output": "node.portTextOutput",
    "Text upstream": "node.portTextUpstream",
    "Extracted text": "node.portExtractedText",
  },
  _mergePortsI18nLabel(serverPorts, localPorts) {
    if (!serverPorts) return localPorts;
    const idx = (arr) => {
      const m = {};
      (arr || []).forEach((p) => {
        if (p?.name) m[p.name] = p;
      });
      return m;
    };
    const localIn = idx(localPorts?.in);
    const localOut = idx(localPorts?.out);
    const tr = (key, fb) => {
      const v = window.I18n?.t?.(key);
      return v && v !== key ? v : fb;
    };
    const RESOLVER_KEYS = ["dynamicType", "visibleWhen"];
    const patchResolvers = (sp, lp) => {
      if (!lp) return sp;
      let out = sp;
      for (const k of RESOLVER_KEYS) {
        if (out[k] === void 0 && lp[k] !== void 0) {
          if (out === sp) out = { ...sp };
          out[k] = lp[k];
        }
      }
      if (
        Array.isArray(lp.acceptFromNodeTypes) &&
        lp.acceptFromNodeTypes.length > 0
      ) {
        const merged = Array.from(
          new Set([
            ...(out.acceptFromNodeTypes || []),
            ...lp.acceptFromNodeTypes,
          ]),
        );
        if (merged.length !== (out.acceptFromNodeTypes || []).length) {
          if (out === sp) out = { ...sp };
          out.acceptFromNodeTypes = merged;
        }
      }
      return out;
    };
    const mergeSide = (sidePorts, localMap) =>
      (sidePorts || []).map((sp0) => {
        const lp = localMap[sp0.name];
        const sp = patchResolvers(sp0, lp);
        if (lp && lp.label) return { ...sp, label: lp.label };
        const key = sp.label && this._PORT_LABEL_I18N[sp.label];
        if (key) return { ...sp, label: tr(key, sp.label) };
        return sp;
      });
    return {
      in: mergeSide(serverPorts.in, localIn),
      out: mergeSide(serverPorts.out, localOut),
    };
  },
  getMergedTypes() {
    const local = this.types;
    const server = this._serverTypes || {};
    console.log(
      "[NodeTemplates] getMergedTypes - local keys:",
      Object.keys(local).length,
      "server keys:",
      Object.keys(server).length,
    );
    const merged = {};
    const serverLoaded = Object.keys(server).length > 0;
    for (const [key, localConfig] of Object.entries(local)) {
      const serverConfig = server[key];
      if (serverConfig) {
        merged[key] = {
          ...this.getType(key),
          sortOrder: serverConfig.sortOrder ?? 999,
        };
      } else if (!serverLoaded) {
        merged[key] = { ...localConfig, sortOrder: 999 };
      }
    }
    for (const [key, serverConfig] of Object.entries(server)) {
      if (!merged[key]) {
        merged[key] = {
          ...serverConfig,
          name: serverConfig.name || key,
          color: serverConfig.color || "generate",
          sortOrder: serverConfig.sortOrder ?? 999,
        };
      }
    }
    const sorted = Object.entries(merged).sort(
      (a, b) => (a[1].sortOrder ?? 999) - (b[1].sortOrder ?? 999),
    );
    const result = {};
    for (const [key, config] of sorted) {
      result[key] = config;
    }
    return result;
  },
  clearServerCache() {
    this._serverTypes = null;
    this._serverTypesFetchedAt = 0;
  },
  async _updateFromVersion(remoteVersion) {
    if (this._lastVersion === remoteVersion) return;
    console.log(
      "[NodeTemplates] Version mismatch:",
      this._lastVersion,
      "\u2192",
      remoteVersion,
    );
    this._serverTypes = null;
    this._serverTypesFetchedAt = 0;
    await this.fetchFromServer();
    if (window.eventBus) {
      window.eventBus.emit("node_types:refreshed", {
        source: "version_poller",
      });
    }
  },
};
window.NodeTemplates = NodeTemplates;
