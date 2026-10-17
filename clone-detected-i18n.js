(function () {
  const labels = {
    vi: {
      title: "Extension kh\xF4ng h\u1EE3p l\u1EC7",
      desc: "Phi\xEAn b\u1EA3n extension n\xE0y kh\xF4ng c\xF3 quy\u1EC1n truy c\u1EADp API Toby Flow. Vui l\xF2ng c\xE0i l\u1EA1i t\u1EEB Chrome Web Store \u0111\u1EC3 ti\u1EBFp t\u1EE5c s\u1EED d\u1EE5ng.",
      storeButton: "M\u1EDF Chrome Web Store",
    },
    en: {
      title: "Extension Not Authorized",
      desc: "This extension version is not authorized to access Toby Flow API. Please reinstall from the Chrome Web Store to continue.",
      storeButton: "Open Chrome Web Store",
    },
    ja: {
      title:
        "\u62E1\u5F35\u6A5F\u80FD\u304C\u8A31\u53EF\u3055\u308C\u3066\u3044\u307E\u305B\u3093",
      desc: "\u3053\u306E\u62E1\u5F35\u6A5F\u80FD\u306E\u30D0\u30FC\u30B8\u30E7\u30F3\u306F Toby Flow API \u3078\u306E\u30A2\u30AF\u30BB\u30B9\u304C\u8A31\u53EF\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002Chrome \u30A6\u30A7\u30D6\u30B9\u30C8\u30A2\u304B\u3089\u518D\u30A4\u30F3\u30B9\u30C8\u30FC\u30EB\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      storeButton:
        "Chrome \u30A6\u30A7\u30D6\u30B9\u30C8\u30A2\u3092\u958B\u304F",
    },
    th: {
      title:
        "\u0E2A\u0E48\u0E27\u0E19\u0E02\u0E22\u0E32\u0E22\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E2D\u0E19\u0E38\u0E0D\u0E32\u0E15",
      desc: "\u0E2A\u0E48\u0E27\u0E19\u0E02\u0E22\u0E32\u0E22\u0E40\u0E27\u0E2D\u0E23\u0E4C\u0E0A\u0E31\u0E19\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E2D\u0E19\u0E38\u0E0D\u0E32\u0E15\u0E43\u0E2B\u0E49\u0E40\u0E02\u0E49\u0E32\u0E16\u0E36\u0E07 API \u0E02\u0E2D\u0E07 Toby Flow \u0E42\u0E1B\u0E23\u0E14\u0E15\u0E34\u0E14\u0E15\u0E31\u0E49\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E08\u0E32\u0E01 Chrome \u0E40\u0E27\u0E47\u0E1A\u0E2A\u0E42\u0E15\u0E23\u0E4C",
      storeButton:
        "\u0E40\u0E1B\u0E34\u0E14 Chrome \u0E40\u0E27\u0E47\u0E1A\u0E2A\u0E42\u0E15\u0E23\u0E4C",
    },
  };
  try {
    chrome.storage.local.get(["af_locale"], function (r) {
      const locale = r.af_locale || "en";
      const set = labels[locale] || labels.en;
      const titleEl = document.querySelector(".tobyflow-clone-detected-title");
      const descEl = document.querySelector(".tobyflow-clone-detected-desc");
      const btnEl = document.querySelector(
        ".tobyflow-clone-detected-store-btn span",
      );
      if (titleEl) titleEl.textContent = set.title;
      if (descEl) descEl.textContent = set.desc;
      if (btnEl) btnEl.textContent = set.storeButton;
    });
  } catch (e) {}
})();
