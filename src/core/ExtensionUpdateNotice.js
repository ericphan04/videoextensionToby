window.ExtensionUpdateNotice = (() => {
  const icon =
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5"/></svg>';
  let initialized = false;
  const t = (key) => window.I18n?.t(`extensionUpdate.${key}`) || "";
  const escape = (value) =>
    String(value).replace(
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
  function parse(value) {
    if (
      typeof value !== "string" ||
      !/^(0|[1-9]\d{0,4})(\.(0|[1-9]\d{0,4})){0,3}$/.test(value)
    )
      return null;
    const parts = value.split(".").map(Number);
    return parts.every((n) => n <= 65535) ? parts : null;
  }
  function isNewer(remote, installed) {
    const a = parse(remote),
      b = parse(installed);
    if (!a || !b) return false;
    for (let i = 0; i < 4; i++) {
      if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
    }
    return false;
  }
  function render() {
    if (!initialized) return;
    const version = window.SystemConfig?.get("tobyflow_version");
    const available = isNewer(version, chrome.runtime.getManifest().version);
    document
      .querySelectorAll(".extension-update-title-wrap")
      .forEach((wrap) => {
        wrap.classList.toggle("has-update", available);
      });
    document.querySelectorAll(".extension-update-badge").forEach((badge) => {
      badge.hidden = !available;
      const tooltip = `${t("available")} v${version || ""}`;
      badge.removeAttribute("title");
      badge.setAttribute("data-tooltip", tooltip);
      badge.setAttribute("data-tooltip-pos", "bottom");
      badge.setAttribute("aria-label", tooltip);
    });
  }
  async function openExtensions(event) {
    event.preventDefault();
    try {
      const tabs = await chrome.tabs.query({});
      const existing = tabs.find((tab) =>
        /^chrome:\/\/extensions(?:[/?#]|$)/.test(
          tab.pendingUrl || tab.url || "",
        ),
      );
      if (existing) {
        await chrome.tabs.update(existing.id, { active: true });
        await chrome.windows.update(existing.windowId, { focused: true });
      } else {
        const created = await chrome.tabs.create({
          url: "chrome://extensions/",
          active: true,
        });
        await chrome.windows.update(created.windowId, { focused: true });
      }
    } catch (error) {
      console.warn("[ExtensionUpdateNotice] Cannot open extensions:", error);
    }
  }
  function showGuide() {
    const installed = chrome.runtime.getManifest().version;
    const remote = window.SystemConfig?.get("tobyflow_version");
    const versions =
      `${escape(t("installed"))}: v${escape(installed)}` +
      (parse(remote) ? ` \xB7 ${escape(t("latest"))}: v${escape(remote)}` : "");
    window.customDialog?.alert(
      `<div class="extension-update-guide"><p>${versions}</p><ol>
      <li>${escape(t("stepOpen"))}<br><a id="extension-update-open" href="chrome://extensions/">${icon} chrome://extensions/</a></li>
      <li><span class="extension-update-developer-step"><svg class="extension-update-toggle" width="30" height="18" viewBox="0 0 30 18" aria-hidden="true"><rect width="30" height="18" rx="9" fill="#a8c7fa"/><circle cx="21" cy="9" r="6" fill="#082e6f"/></svg><span>${escape(t("stepDeveloper"))}</span></span></li>
      <li>${escape(t("stepUpdate"))}</li>
      </ol></div>`,
      { title: t("title"), html: true, type: "info" },
    );
    const link = document.getElementById("extension-update-open");
    link?.addEventListener("click", openExtensions);
    const dialog = link?.closest(".cdialog-overlay");
    dialog?.classList.add("extension-update-dialog");
    const headerIcon = dialog?.querySelector(".cdialog-icon");
    if (headerIcon) headerIcon.innerHTML = icon;
  }
  function init() {
    if (initialized) return;
    initialized = true;
    const title = document.querySelector(".tobyflow-header-title");
    const menu = document.getElementById("extensionLinkBtn");
    for (const [target, placement] of [
      [title, "title"],
      [menu, "menu"],
    ]) {
      if (!target) continue;
      const badge = document.createElement(
        placement === "title" ? "button" : "span",
      );
      badge.className = `extension-update-badge extension-update-badge-${placement}`;
      badge.hidden = true;
      badge.innerHTML = icon;
      if (placement === "title") {
        badge.type = "button";
        badge.addEventListener("click", showGuide);
        const wrap = document.createElement("span");
        wrap.className = "extension-update-title-wrap";
        target.before(wrap);
        wrap.append(target, badge);
      } else target.append(badge);
    }
    window.eventBus?.on("i18n:changed", render);
    render();
  }
  return { init, render, showGuide, isNewer };
})();
