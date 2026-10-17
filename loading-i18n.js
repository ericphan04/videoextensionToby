(function () {
  const labels = {
    vi: {
      loading: "\u0110ang t\u1EA3i...",
      connecting: "\u0110ang k\u1EBFt n\u1ED1i Flow...",
    },
    en: { loading: "Loading...", connecting: "Connecting to Flow..." },
    ja: {
      loading: "\u8AAD\u307F\u8FBC\u307F\u4E2D...",
      connecting: "Flow \u306B\u63A5\u7D9A\u4E2D...",
    },
    th: {
      loading: "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E42\u0E2B\u0E25\u0E14...",
      connecting:
        "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D Flow...",
    },
  };
  try {
    chrome.storage.local.get(["af_locale"], function (r) {
      const locale = r.af_locale || "en";
      const set = labels[locale] || labels.en;
      const loadingEl = document.getElementById("tobyflow-loading-text");
      const connectingEl = document.querySelector(".tobyflow-connecting-text");
      if (loadingEl) loadingEl.textContent = set.loading;
      if (connectingEl) connectingEl.textContent = set.connecting;
    });
  } catch (e) {}
})();
