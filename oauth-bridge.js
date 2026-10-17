(function () {
  "use strict";
  if (!window.location.pathname.includes("/auth/google/success")) {
    return;
  }
  console.log("[TobyFlow] OAuth bridge loaded");
  let tokenForwarded = false;
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== "tobyflow-oauth-success") return;
    const { token, linked } = event.data;
    if (token && !tokenForwarded) {
      tokenForwarded = true;
      console.log(
        "[TobyFlow] OAuth bridge: forwarding token to background via postMessage",
      );
      chrome.runtime.sendMessage(
        { action: "oauth:success", token },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              "[TobyFlow] OAuth bridge error:",
              chrome.runtime.lastError.message,
            );
            tokenForwarded = false;
          } else {
            console.log(
              "[TobyFlow] OAuth bridge: token forwarded successfully",
            );
          }
        },
      );
    } else if (linked) {
      console.log(
        "[TobyFlow] OAuth bridge: forwarding link success to background",
      );
      chrome.runtime.sendMessage(
        { action: "oauth:linked", linked: true },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              "[TobyFlow] OAuth bridge error:",
              chrome.runtime.lastError.message,
            );
          } else {
            console.log("[TobyFlow] OAuth bridge: link success forwarded");
          }
        },
      );
    }
  });
  function checkUrlToken() {
    if (tokenForwarded) return;
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get("token");
    if (urlToken) {
      tokenForwarded = true;
      console.log(
        "[TobyFlow] OAuth bridge: found token in URL query string, forwarding",
      );
      chrome.runtime.sendMessage(
        { action: "oauth:success", token: urlToken },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              "[TobyFlow] OAuth bridge URL fallback error:",
              chrome.runtime.lastError.message,
            );
            tokenForwarded = false;
          } else {
            console.log(
              "[TobyFlow] OAuth bridge: URL token forwarded successfully",
            );
          }
        },
      );
      return true;
    }
    return false;
  }
  if (checkUrlToken()) {
    console.log("[TobyFlow] OAuth bridge: token sent via URL fallback");
  }
  let metaCheckAttempts = 0;
  const maxMetaAttempts = 10;
  function checkMetaTag() {
    if (tokenForwarded) return;
    metaCheckAttempts++;
    const meta = document.querySelector('meta[name="tobyflow-auth-token"]');
    if (meta && meta.content) {
      tokenForwarded = true;
      console.log(
        "[TobyFlow] OAuth bridge: found token in meta tag (attempt " +
          metaCheckAttempts +
          "), forwarding",
      );
      chrome.runtime.sendMessage(
        { action: "oauth:success", token: meta.content },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              "[TobyFlow] OAuth bridge meta fallback error:",
              chrome.runtime.lastError.message,
            );
            tokenForwarded = false;
          } else {
            console.log(
              "[TobyFlow] OAuth bridge: meta fallback token forwarded successfully",
            );
          }
        },
      );
    } else if (metaCheckAttempts < maxMetaAttempts) {
      setTimeout(checkMetaTag, 300);
    } else {
      if (!checkUrlToken()) {
        console.warn(
          "[TobyFlow] OAuth bridge: no token found after all attempts",
        );
      }
    }
  }
  setTimeout(checkMetaTag, 200);
})();
