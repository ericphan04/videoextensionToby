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
  function locale() {
    return (
      (window.I18n &&
        (window.I18n.getLocale?.() || window.I18n._currentLocale)) ||
      "vi"
    );
  }
  const _L = {
    vi: {
      title: "Prompt Assistant",
      close: "\u0110\xF3ng",
      provider: "T\u1EA1o b\u1EB1ng:",
      ideaPlaceholder:
        "Nh\u1EADp \xFD t\u01B0\u1EDFng/ch\u1EE7 \u0111\u1EC1, HO\u1EB6C d\xE1n k\u1ECBch b\u1EA3n, HO\u1EB6C d\xE1n ph\u1EE5 \u0111\u1EC1 SRT (m\u1ED7i c\xE2u = 1 \u1EA3nh)...\nVD: 5 l\u1EE3i \xEDch c\u1EE7a ch\u1EA1y b\u1ED9",
      mediaType: "Lo\u1EA1i",
      image: "\u1EA2nh",
      video: "Video",
      pair: "C\u1EB7p \u1EA3nh\u2192video",
      count: "S\u1ED1 l\u01B0\u1EE3ng",
      language: "Ng\xF4n ng\u1EEF",
      langSource: "Theo input",
      detail: "\u0110\u1ED9 chi ti\u1EBFt",
      concise: "Ng\u1EAFn g\u1ECDn",
      detailed: "Chi ti\u1EBFt",
      cinematic: "Cinematic",
      style: "Style",
      aspect: "T\u1EF7 l\u1EC7",
      lighting: "\xC1nh s\xE1ng",
      camera: "G\xF3c m\xE1y",
      auto: "Auto",
      golden_hour: "Gi\u1EDD v\xE0ng",
      neon: "Neon",
      dramatic: "K\u1ECBch t\xEDnh",
      soft: "D\u1ECBu",
      close_up: "C\u1EADn c\u1EA3nh",
      wide: "To\xE0n c\u1EA3nh",
      lens35: "35mm",
      clipDuration: "Th\u1EDDi l\u01B0\u1EE3ng clip",
      totalDuration: "T\u1ED5ng (gi\xE2y)",
      secPerImage: "Gi\xE2y/\u1EA3nh",
      cameraMotion: "Chuy\u1EC3n \u0111\u1ED9ng",
      pan: "Lia (pan)",
      zoom: "Zoom",
      staticMot: "T\u0129nh",
      tone: "T\xF4ng/th\u1EC3 lo\u1EA1i",
      voice: "Gi\u1ECDng \u0111\u1ECDc",
      voicePh: "vd: gi\u1ECDng nam tr\u1EA7m, \u1EA5m, ch\u1EADm",
      blueHour: "Gi\u1EDD xanh",
      rim: "Vi\u1EC1n/ng\u01B0\u1EE3c s\xE1ng",
      lowKey: "Low-key (t\u1ED1i)",
      highKey: "High-key (s\xE1ng)",
      volumetric: "Tia s\xE1ng (god rays)",
      medium: "Trung c\u1EA3nh",
      aerial: "Tr\xEAn cao/drone",
      lowAngle: "G\xF3c th\u1EA5p",
      highAngle: "G\xF3c cao",
      macro: "Macro (\u0111\u1EB7c t\u1EA3)",
      lens85: "85mm",
      dolly: "\u0110\u1EA9y m\xE1y (dolly)",
      tracking: "B\xE1m theo",
      orbit: "V\xF2ng quanh",
      tilt: "Ng\u1EA3 m\xE1y (tilt)",
      crane: "C\u1EA7n c\u1EA9u (crane)",
      handheld: "C\u1EA7m tay",
      audioMusic: "Nh\u1EA1c n\u1EC1n",
      sequential: "N\u1ED1i ti\u1EBFp (storyboard)",
      consistency: "Gi\u1EEF nh\u1EA5t qu\xE1n",
      numbered: "\u0110\xE1nh s\u1ED1",
      autoFill: "T\u1EF1 \u0111\u1ED5 v\xE0o TobyFlow",
      autoScript:
        "T\u1EF1 vi\u1EBFt k\u1ECBch b\u1EA3n + ph\u1EE5 \u0111\u1EC1",
      renderSub: "Ch\xE8n ph\u1EE5 \u0111\u1EC1 l\xEAn \u1EA3nh/video",
      srtDetected: "\u0110\xE3 nh\u1EADn SRT: {n} c\xE2u \xB7 {dur}s",
      negative: "Tr\xE1nh: ... (negative, tu\u1EF3 ch\u1ECDn)",
      addRef: "\u1EA2nh tham chi\u1EBFu",
      refHint: "t\u1ED1i \u0111a {max}",
      removeImg: "Xo\xE1 \u1EA3nh",
      format: "\u0110\u1ECBnh d\u1EA1ng",
      formatNone: "T\u1EF1 do",
      formatOther: "Kh\xE1c",
      advanced: "N\xE2ng cao",
      audio: "\xC2m thanh",
      audioNone: "Kh\xF4ng",
      audioAmbient: "Ti\u1EBFng n\u1EC1n",
      audioSfx: "Hi\u1EC7u \u1EE9ng (SFX)",
      audioDialogue: "L\u1EDDi tho\u1EA1i",
      audioFull: "\u0110\u1EA7y \u0111\u1EE7",
      refSelectDrag: "Ch\u1ECDn \u1EA3nh / K\xE9o th\u1EA3",
      fillImages: "\u0110\u01B0a \u1EA3nh v\xE0o TobyFlow",
      fillVideos: "\u0110\u01B0a video v\xE0o TobyFlow",
      notLogged: "ch\u01B0a \u0111\u0103ng nh\u1EADp",
      noTab: "ch\u01B0a m\u1EDF tab",
      openTab: "M\u1EDF tab",
      ready: "Ready",
      generate: "T\u1EA1o prompt",
      generating: "\u0110ang t\u1EA1o prompt...",
      cancel: "H\u1EE7y",
      confirmGenTitle: "T\u1EA1o prompt v\u1EDBi {provider}",
      confirmGenMsg:
        "S\u1EBD m\u1EDF tab {provider} v\xE0 g\u1EEDi y\xEAu c\u1EA7u t\u1EA1o prompt t\u1EF1 \u0111\u1ED9ng. Ti\u1EBFp t\u1EE5c?",
      countCapped:
        "T\u1ED1i \u0111a {max} prompt m\u1ED7i l\u1EA7n \u2014 \u0111\xE3 t\u1EF1 gi\u1EA3m c\xF2n {max}.",
      resultCount: "\u0110\xE3 t\u1EA1o",
      resultUnit: "prompt",
      empty: "Kh\xF4ng c\xF3 prompt n\xE0o.",
      fillGen: "\u0110\u01B0a v\xE0o TobyFlow",
      copy: "Copy",
      copied: "\u0110\xE3 copy",
      back: "Quay l\u1EA1i",
      copySrt: "Copy ph\u1EE5 \u0111\u1EC1 (SRT)",
      errConfig:
        "Ch\u01B0a t\u1EA3i \u0111\u01B0\u1EE3c c\u1EA5u h\xECnh t\u1EEB server.",
      errProvider: "Provider ch\u01B0a s\u1EB5n s\xE0ng / l\u1ED7i.",
      errFill:
        "Kh\xF4ng \u0111\u1ED5 \u0111\u01B0\u1EE3c v\xE0o TobyFlow (ch\u01B0a s\u1EB5n s\xE0ng).",
      toastFilled: "\u0110\xE3 \u0111\u01B0a {n} prompt v\xE0o TobyFlow",
      premiumNeed:
        "C\u1EA7n n\xE2ng c\u1EA5p g\xF3i Premium \u0111\u1EC3 d\xF9ng format n\xE0y",
      premiumTitle: "Format n\xE0y y\xEAu c\u1EA7u Premium",
    },
    en: {
      title: "Prompt Assistant",
      close: "Close",
      provider: "Generate with:",
      ideaPlaceholder:
        "Enter an idea/topic, OR paste a script, OR paste SRT subtitles (each cue = 1 image)...\nE.g. 5 benefits of running",
      mediaType: "Type",
      image: "Image",
      video: "Video",
      pair: "Image\u2192video pair",
      count: "Count",
      language: "Language",
      langSource: "Same as input",
      detail: "Detail",
      concise: "Concise",
      detailed: "Detailed",
      cinematic: "Cinematic",
      style: "Style",
      aspect: "Aspect",
      lighting: "Lighting",
      camera: "Camera",
      auto: "Auto",
      golden_hour: "Golden hour",
      neon: "Neon",
      dramatic: "Dramatic",
      soft: "Soft",
      close_up: "Close-up",
      wide: "Wide",
      lens35: "35mm",
      clipDuration: "Clip duration",
      totalDuration: "Total (sec)",
      secPerImage: "Sec/image",
      cameraMotion: "Motion",
      pan: "Pan",
      zoom: "Zoom",
      staticMot: "Static",
      tone: "Tone/genre",
      voice: "Voice",
      voicePh: "e.g. deep warm male narrator, slow",
      blueHour: "Blue hour",
      rim: "Rim/backlit",
      lowKey: "Low-key",
      highKey: "High-key",
      volumetric: "Volumetric",
      medium: "Medium",
      aerial: "Aerial/drone",
      lowAngle: "Low-angle",
      highAngle: "High-angle",
      macro: "Macro",
      lens85: "85mm",
      dolly: "Dolly-in",
      tracking: "Tracking",
      orbit: "Orbit",
      tilt: "Tilt",
      crane: "Crane",
      handheld: "Handheld",
      audioMusic: "Music",
      sequential: "Sequential (storyboard)",
      consistency: "Keep consistent",
      numbered: "Numbered",
      autoFill: "Auto-fill TobyFlow",
      autoScript: "Auto-write script + subs",
      renderSub: "Burn subtitle on image/video",
      srtDetected: "SRT detected: {n} cues \xB7 {dur}s",
      negative: "Avoid: ... (negative, optional)",
      addRef: "Reference images",
      refHint: "max {max}",
      removeImg: "Remove",
      format: "Format",
      formatNone: "Free",
      formatOther: "Other",
      advanced: "Advanced",
      audio: "Audio",
      audioNone: "None",
      audioAmbient: "Ambient",
      audioSfx: "SFX",
      audioDialogue: "Dialogue",
      audioFull: "Full",
      refSelectDrag: "Select / Drag image",
      fillImages: "Send images to TobyFlow",
      fillVideos: "Send videos to TobyFlow",
      notLogged: "not signed in",
      noTab: "no tab open",
      openTab: "Open tab",
      ready: "Ready",
      generate: "Generate prompts",
      generating: "Generating prompts...",
      cancel: "Cancel",
      confirmGenTitle: "Generate with {provider}",
      confirmGenMsg:
        "This will open the {provider} tab and auto-send a request to generate prompts. Continue?",
      countCapped: "Max {max} prompts per run \u2014 capped to {max}.",
      resultCount: "Generated",
      resultUnit: "prompts",
      empty: "No prompts.",
      fillGen: "Send to TobyFlow",
      copy: "Copy",
      copied: "Copied",
      back: "Back",
      copySrt: "Copy subtitles (SRT)",
      errConfig: "Could not load server config.",
      errProvider: "Provider not ready / error.",
      errFill: "Could not fill TobyFlow (not ready).",
      toastFilled: "{n} prompts added to TobyFlow",
      premiumNeed: "Upgrade to Premium to use this format",
      premiumTitle: "This format requires Premium",
    },
    ja: {
      title: "Prompt Assistant",
      close: "\u9589\u3058\u308B",
      provider: "\u751F\u6210\u306B\u4F7F\u7528:",
      ideaPlaceholder:
        "\u30A2\u30A4\u30C7\u30A2/\u30C8\u30D4\u30C3\u30AF\u3092\u5165\u529B\u3001\u307E\u305F\u306F\u53F0\u672C\u30FBSRT\u5B57\u5E55\u3092\u8CBC\u308A\u4ED8\u3051\uFF08\u5404\u884C\uFF1D1\u679A\uFF09...\n\u4F8B: \u30E9\u30F3\u30CB\u30F3\u30B0\u306E5\u3064\u306E\u52B9\u679C",
      mediaType: "\u7A2E\u985E",
      image: "\u753B\u50CF",
      video: "\u52D5\u753B",
      pair: "\u753B\u50CF\u2192\u52D5\u753B\u30DA\u30A2",
      count: "\u6570\u91CF",
      language: "\u8A00\u8A9E",
      langSource: "\u5165\u529B\u306B\u5408\u308F\u305B\u308B",
      detail: "\u8A73\u7D30\u5EA6",
      concise: "\u7C21\u6F54",
      detailed: "\u8A73\u7D30",
      cinematic: "\u30B7\u30CD\u30DE\u30C6\u30A3\u30C3\u30AF",
      style: "\u30B9\u30BF\u30A4\u30EB",
      aspect: "\u6BD4\u7387",
      lighting: "\u7167\u660E",
      camera: "\u30AB\u30E1\u30E9",
      auto: "\u81EA\u52D5",
      golden_hour: "\u30B4\u30FC\u30EB\u30C7\u30F3\u30A2\u30EF\u30FC",
      neon: "\u30CD\u30AA\u30F3",
      dramatic: "\u30C9\u30E9\u30DE\u30C1\u30C3\u30AF",
      soft: "\u30BD\u30D5\u30C8",
      close_up: "\u30AF\u30ED\u30FC\u30BA\u30A2\u30C3\u30D7",
      wide: "\u30EF\u30A4\u30C9",
      lens35: "35mm",
      clipDuration: "\u30AF\u30EA\u30C3\u30D7\u9577",
      totalDuration: "\u5408\u8A08\uFF08\u79D2\uFF09",
      cameraMotion: "\u52D5\u304D",
      pan: "\u30D1\u30F3",
      zoom: "\u30BA\u30FC\u30E0",
      staticMot: "\u56FA\u5B9A",
      tone: "\u30C8\u30FC\u30F3/\u30B8\u30E3\u30F3\u30EB",
      voice: "\u30CA\u30EC\u30FC\u30B7\u30E7\u30F3\u58F0",
      voicePh:
        "\u4F8B: \u4F4E\u304F\u6E29\u304B\u3044\u7537\u6027\u30CA\u30EC\u30FC\u30BF\u30FC, \u3086\u3063\u304F\u308A",
      blueHour: "\u30D6\u30EB\u30FC\u30A2\u30EF\u30FC",
      rim: "\u30EA\u30E0\u30E9\u30A4\u30C8",
      lowKey: "\u30ED\u30FC\u30AD\u30FC",
      highKey: "\u30CF\u30A4\u30AD\u30FC",
      volumetric: "\u30DC\u30EA\u30E5\u30FC\u30E1\u30C8\u30EA\u30C3\u30AF",
      medium: "\u30DF\u30C7\u30A3\u30A2\u30E0",
      aerial: "\u7A7A\u64AE/\u30C9\u30ED\u30FC\u30F3",
      lowAngle: "\u30ED\u30FC\u30A2\u30F3\u30B0\u30EB",
      highAngle: "\u30CF\u30A4\u30A2\u30F3\u30B0\u30EB",
      macro: "\u30DE\u30AF\u30ED",
      lens85: "85mm",
      dolly: "\u30C9\u30EA\u30FC\u30A4\u30F3",
      tracking: "\u30C8\u30E9\u30C3\u30AD\u30F3\u30B0",
      orbit: "\u30AA\u30FC\u30D3\u30C3\u30C8",
      tilt: "\u30C6\u30A3\u30EB\u30C8",
      crane: "\u30AF\u30EC\u30FC\u30F3",
      handheld: "\u624B\u6301\u3061",
      audioMusic: "\u97F3\u697D",
      sequential: "\u9023\u7D9A\uFF08\u7D75\u30B3\u30F3\u30C6\uFF09",
      consistency: "\u4E00\u8CAB\u6027\u3092\u4FDD\u3064",
      numbered: "\u756A\u53F7\u4ED8\u3051",
      autoFill: "TobyFlow\u306B\u81EA\u52D5\u5165\u529B",
      autoScript: "\u53F0\u672C+\u5B57\u5E55\u3092\u81EA\u52D5\u751F\u6210",
      renderSub:
        "\u5B57\u5E55\u3092\u753B\u50CF/\u52D5\u753B\u306B\u713C\u304D\u8FBC\u307F",
      srtDetected: "SRT\u691C\u51FA: {n}\u4EF6 \xB7 {dur}s",
      negative:
        "\u907F\u3051\u308B: ...\uFF08\u30CD\u30AC\u30C6\u30A3\u30D6\u3001\u4EFB\u610F\uFF09",
      addRef: "\u53C2\u7167\u753B\u50CF",
      refHint: "\u6700\u5927{max}",
      removeImg: "\u524A\u9664",
      format: "\u5F62\u5F0F",
      formatNone: "\u81EA\u7531",
      formatOther: "\u305D\u306E\u4ED6",
      advanced: "\u8A73\u7D30\u8A2D\u5B9A",
      audio: "\u97F3\u58F0",
      audioNone: "\u306A\u3057",
      audioAmbient: "\u74B0\u5883\u97F3",
      audioSfx: "\u52B9\u679C\u97F3",
      audioDialogue: "\u30BB\u30EA\u30D5",
      audioFull: "\u30D5\u30EB",
      refSelectDrag:
        "\u753B\u50CF\u3092\u9078\u629E / \u30C9\u30E9\u30C3\u30B0",
      fillImages: "\u753B\u50CF\u3092TobyFlow\u3078",
      fillVideos: "\u52D5\u753B\u3092TobyFlow\u3078",
      notLogged: "\u672A\u30ED\u30B0\u30A4\u30F3",
      noTab: "\u30BF\u30D6\u672A\u958B",
      openTab: "\u30BF\u30D6\u3092\u958B\u304F",
      ready: "\u6E96\u5099\u5B8C\u4E86",
      generate: "\u30D7\u30ED\u30F3\u30D7\u30C8\u751F\u6210",
      generating: "\u30D7\u30ED\u30F3\u30D7\u30C8\u751F\u6210\u4E2D...",
      cancel: "\u30AD\u30E3\u30F3\u30BB\u30EB",
      confirmGenTitle: "{provider}\u3067\u751F\u6210",
      confirmGenMsg:
        "{provider}\u306E\u30BF\u30D6\u3092\u958B\u304D\u3001\u30D7\u30ED\u30F3\u30D7\u30C8\u751F\u6210\u30EA\u30AF\u30A8\u30B9\u30C8\u3092\u81EA\u52D5\u9001\u4FE1\u3057\u307E\u3059\u3002\u7D9A\u884C\u3057\u307E\u3059\u304B\uFF1F",
      countCapped:
        "1\u56DE\u3042\u305F\u308A\u6700\u5927{max}\u4EF6 \u2014 {max}\u4EF6\u306B\u8ABF\u6574\u3057\u307E\u3057\u305F\u3002",
      resultCount: "\u751F\u6210",
      resultUnit: "\u4EF6",
      empty: "\u30D7\u30ED\u30F3\u30D7\u30C8\u306A\u3057\u3002",
      fillGen: "TobyFlow\u3078\u9001\u308B",
      copy: "\u30B3\u30D4\u30FC",
      copied: "\u30B3\u30D4\u30FC\u6E08\u307F",
      back: "\u623B\u308B",
      copySrt: "\u5B57\u5E55(SRT)\u3092\u30B3\u30D4\u30FC",
      errConfig:
        "\u30B5\u30FC\u30D0\u30FC\u8A2D\u5B9A\u3092\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3002",
      errProvider:
        "\u30D7\u30ED\u30D0\u30A4\u30C0\u30FC\u672A\u6E96\u5099 / \u30A8\u30E9\u30FC\u3002",
      errFill:
        "TobyFlow\u306B\u5165\u529B\u3067\u304D\u307E\u305B\u3093\uFF08\u672A\u6E96\u5099\uFF09\u3002",
      toastFilled:
        "{n}\u4EF6\u306E\u30D7\u30ED\u30F3\u30D7\u30C8\u3092TobyFlow\u306B\u8FFD\u52A0",
    },
    th: {
      title: "Prompt Assistant",
      close: "\u0E1B\u0E34\u0E14",
      provider: "\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E14\u0E49\u0E27\u0E22:",
      ideaPlaceholder:
        "\u0E43\u0E2A\u0E48\u0E44\u0E2D\u0E40\u0E14\u0E35\u0E22/\u0E2B\u0E31\u0E27\u0E02\u0E49\u0E2D \u0E2B\u0E23\u0E37\u0E2D\u0E27\u0E32\u0E07\u0E2A\u0E04\u0E23\u0E34\u0E1B\u0E15\u0E4C \u0E2B\u0E23\u0E37\u0E2D\u0E27\u0E32\u0E07\u0E0B\u0E31\u0E1A SRT (\u0E41\u0E15\u0E48\u0E25\u0E30\u0E1B\u0E23\u0E30\u0E42\u0E22\u0E04 = 1 \u0E23\u0E39\u0E1B)...\n\u0E40\u0E0A\u0E48\u0E19 5 \u0E1B\u0E23\u0E30\u0E42\u0E22\u0E0A\u0E19\u0E4C\u0E02\u0E2D\u0E07\u0E01\u0E32\u0E23\u0E27\u0E34\u0E48\u0E07",
      mediaType: "\u0E1B\u0E23\u0E30\u0E40\u0E20\u0E17",
      image: "\u0E23\u0E39\u0E1B",
      video: "\u0E27\u0E34\u0E14\u0E35\u0E42\u0E2D",
      pair: "\u0E04\u0E39\u0E48\u0E23\u0E39\u0E1B\u2192\u0E27\u0E34\u0E14\u0E35\u0E42\u0E2D",
      count: "\u0E08\u0E33\u0E19\u0E27\u0E19",
      language: "\u0E20\u0E32\u0E29\u0E32",
      langSource: "\u0E15\u0E32\u0E21\u0E2D\u0E34\u0E19\u0E1E\u0E38\u0E15",
      detail:
        "\u0E23\u0E30\u0E14\u0E31\u0E1A\u0E23\u0E32\u0E22\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14",
      concise: "\u0E01\u0E23\u0E30\u0E0A\u0E31\u0E1A",
      detailed: "\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14",
      cinematic: "\u0E20\u0E32\u0E1E\u0E22\u0E19\u0E15\u0E23\u0E4C",
      style: "\u0E2A\u0E44\u0E15\u0E25\u0E4C",
      aspect: "\u0E2A\u0E31\u0E14\u0E2A\u0E48\u0E27\u0E19",
      lighting: "\u0E41\u0E2A\u0E07",
      camera: "\u0E21\u0E38\u0E21\u0E01\u0E25\u0E49\u0E2D\u0E07",
      auto: "\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34",
      golden_hour:
        "\u0E42\u0E01\u0E25\u0E40\u0E14\u0E19\u0E2D\u0E32\u0E27\u0E23\u0E4C",
      neon: "\u0E19\u0E35\u0E2D\u0E2D\u0E19",
      dramatic: "\u0E14\u0E23\u0E32\u0E21\u0E48\u0E32",
      soft: "\u0E19\u0E38\u0E48\u0E21\u0E19\u0E27\u0E25",
      close_up: "\u0E42\u0E04\u0E25\u0E2A\u0E2D\u0E31\u0E1E",
      wide: "\u0E21\u0E38\u0E21\u0E01\u0E27\u0E49\u0E32\u0E07",
      lens35: "35mm",
      clipDuration:
        "\u0E04\u0E27\u0E32\u0E21\u0E22\u0E32\u0E27\u0E04\u0E25\u0E34\u0E1B",
      totalDuration:
        "\u0E23\u0E27\u0E21 (\u0E27\u0E34\u0E19\u0E32\u0E17\u0E35)",
      cameraMotion:
        "\u0E01\u0E32\u0E23\u0E40\u0E04\u0E25\u0E37\u0E48\u0E2D\u0E19\u0E44\u0E2B\u0E27",
      pan: "\u0E41\u0E1E\u0E19",
      zoom: "\u0E0B\u0E39\u0E21",
      staticMot: "\u0E19\u0E34\u0E48\u0E07",
      tone: "\u0E42\u0E17\u0E19/\u0E41\u0E19\u0E27",
      voice:
        "\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E1C\u0E39\u0E49\u0E1A\u0E23\u0E23\u0E22\u0E32\u0E22",
      voicePh:
        "\u0E40\u0E0A\u0E48\u0E19 \u0E40\u0E2A\u0E35\u0E22\u0E07\u0E0A\u0E32\u0E22\u0E17\u0E38\u0E49\u0E21\u0E2D\u0E1A\u0E2D\u0E38\u0E48\u0E19 \u0E1E\u0E39\u0E14\u0E0A\u0E49\u0E32",
      blueHour: "\u0E1A\u0E25\u0E39\u0E2D\u0E32\u0E27\u0E23\u0E4C",
      rim: "\u0E41\u0E2A\u0E07\u0E02\u0E2D\u0E1A/\u0E22\u0E49\u0E2D\u0E19\u0E41\u0E2A\u0E07",
      lowKey: "\u0E42\u0E25\u0E27\u0E4C\u0E04\u0E35\u0E22\u0E4C",
      highKey: "\u0E44\u0E2E\u0E04\u0E35\u0E22\u0E4C",
      volumetric:
        "\u0E41\u0E2A\u0E07\u0E42\u0E27\u0E25\u0E38\u0E40\u0E21\u0E15\u0E23\u0E34\u0E01",
      medium: "\u0E21\u0E35\u0E40\u0E14\u0E35\u0E22\u0E21",
      aerial: "\u0E21\u0E38\u0E21\u0E2A\u0E39\u0E07/\u0E42\u0E14\u0E23\u0E19",
      lowAngle: "\u0E21\u0E38\u0E21\u0E15\u0E48\u0E33",
      highAngle: "\u0E21\u0E38\u0E21\u0E2A\u0E39\u0E07",
      macro: "\u0E21\u0E32\u0E42\u0E04\u0E23",
      lens85: "85mm",
      dolly: "\u0E14\u0E2D\u0E25\u0E25\u0E35\u0E48\u0E40\u0E02\u0E49\u0E32",
      tracking: "\u0E41\u0E17\u0E23\u0E47\u0E04\u0E01\u0E34\u0E49\u0E07",
      orbit: "\u0E2D\u0E2D\u0E23\u0E4C\u0E1A\u0E34\u0E17",
      tilt: "\u0E17\u0E34\u0E25\u0E17\u0E4C",
      crane: "\u0E40\u0E04\u0E23\u0E19",
      handheld: "\u0E21\u0E37\u0E2D\u0E16\u0E37\u0E2D",
      audioMusic: "\u0E14\u0E19\u0E15\u0E23\u0E35",
      sequential:
        "\u0E15\u0E48\u0E2D\u0E40\u0E19\u0E37\u0E48\u0E2D\u0E07 (\u0E2A\u0E15\u0E2D\u0E23\u0E35\u0E1A\u0E2D\u0E23\u0E4C\u0E14)",
      consistency:
        "\u0E04\u0E07\u0E04\u0E27\u0E32\u0E21\u0E2A\u0E21\u0E48\u0E33\u0E40\u0E2A\u0E21\u0E2D",
      numbered: "\u0E43\u0E2A\u0E48\u0E25\u0E33\u0E14\u0E31\u0E1A",
      autoFill:
        "\u0E43\u0E2A\u0E48\u0E25\u0E07 TobyFlow \u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34",
      autoScript:
        "\u0E40\u0E02\u0E35\u0E22\u0E19\u0E2A\u0E04\u0E23\u0E34\u0E1B\u0E15\u0E4C+\u0E0B\u0E31\u0E1A\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34",
      renderSub:
        "\u0E1D\u0E31\u0E07\u0E0B\u0E31\u0E1A\u0E1A\u0E19\u0E20\u0E32\u0E1E/\u0E27\u0E34\u0E14\u0E35\u0E42\u0E2D",
      srtDetected:
        "\u0E1E\u0E1A SRT: {n} \u0E1B\u0E23\u0E30\u0E42\u0E22\u0E04 \xB7 {dur}s",
      negative:
        "\u0E2B\u0E25\u0E35\u0E01\u0E40\u0E25\u0E35\u0E48\u0E22\u0E07: ... (negative, \u0E44\u0E21\u0E48\u0E1A\u0E31\u0E07\u0E04\u0E31\u0E1A)",
      addRef: "\u0E23\u0E39\u0E1B\u0E2D\u0E49\u0E32\u0E07\u0E2D\u0E34\u0E07",
      refHint: "\u0E2A\u0E39\u0E07\u0E2A\u0E38\u0E14 {max}",
      removeImg: "\u0E25\u0E1A",
      format: "\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A",
      formatNone: "\u0E2D\u0E34\u0E2A\u0E23\u0E30",
      formatOther: "\u0E2D\u0E37\u0E48\u0E19\u0E46",
      advanced: "\u0E02\u0E31\u0E49\u0E19\u0E2A\u0E39\u0E07",
      audio: "\u0E40\u0E2A\u0E35\u0E22\u0E07",
      audioNone: "\u0E44\u0E21\u0E48\u0E21\u0E35",
      audioAmbient:
        "\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E23\u0E2D\u0E1A\u0E02\u0E49\u0E32\u0E07",
      audioSfx: "\u0E40\u0E2D\u0E1F\u0E40\u0E1F\u0E01\u0E15\u0E4C",
      audioDialogue: "\u0E1A\u0E17\u0E1E\u0E39\u0E14",
      audioFull: "\u0E40\u0E15\u0E47\u0E21",
      refSelectDrag:
        "\u0E40\u0E25\u0E37\u0E2D\u0E01 / \u0E25\u0E32\u0E01\u0E23\u0E39\u0E1B",
      fillImages: "\u0E2A\u0E48\u0E07\u0E23\u0E39\u0E1B\u0E44\u0E1B TobyFlow",
      fillVideos:
        "\u0E2A\u0E48\u0E07\u0E27\u0E34\u0E14\u0E35\u0E42\u0E2D\u0E44\u0E1B TobyFlow",
      notLogged:
        "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E23\u0E30\u0E1A\u0E1A",
      noTab:
        "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E40\u0E1B\u0E34\u0E14\u0E41\u0E17\u0E47\u0E1A",
      openTab: "\u0E40\u0E1B\u0E34\u0E14\u0E41\u0E17\u0E47\u0E1A",
      ready: "\u0E1E\u0E23\u0E49\u0E2D\u0E21",
      generate:
        "\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C",
      generating:
        "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C...",
      cancel: "\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01",
      confirmGenTitle:
        "\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E14\u0E49\u0E27\u0E22 {provider}",
      confirmGenMsg:
        "\u0E08\u0E30\u0E40\u0E1B\u0E34\u0E14\u0E41\u0E17\u0E47\u0E1A {provider} \u0E41\u0E25\u0E30\u0E2A\u0E48\u0E07\u0E04\u0E33\u0E02\u0E2D\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34 \u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23\u0E15\u0E48\u0E2D?",
      countCapped:
        "\u0E2A\u0E39\u0E07\u0E2A\u0E38\u0E14 {max} \u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C\u0E15\u0E48\u0E2D\u0E04\u0E23\u0E31\u0E49\u0E07 \u2014 \u0E25\u0E14\u0E40\u0E2B\u0E25\u0E37\u0E2D {max} \u0E41\u0E25\u0E49\u0E27",
      resultCount: "\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E41\u0E25\u0E49\u0E27",
      resultUnit: "\u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C",
      empty:
        "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C",
      fillGen: "\u0E2A\u0E48\u0E07\u0E44\u0E1B TobyFlow",
      copy: "\u0E04\u0E31\u0E14\u0E25\u0E2D\u0E01",
      copied: "\u0E04\u0E31\u0E14\u0E25\u0E2D\u0E01\u0E41\u0E25\u0E49\u0E27",
      back: "\u0E01\u0E25\u0E31\u0E1A",
      copySrt: "\u0E04\u0E31\u0E14\u0E25\u0E2D\u0E01\u0E0B\u0E31\u0E1A (SRT)",
      errConfig:
        "\u0E42\u0E2B\u0E25\u0E14\u0E04\u0E48\u0E32\u0E08\u0E32\u0E01\u0E40\u0E0B\u0E34\u0E23\u0E4C\u0E1F\u0E40\u0E27\u0E2D\u0E23\u0E4C\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49",
      errProvider:
        "\u0E1C\u0E39\u0E49\u0E43\u0E2B\u0E49\u0E1A\u0E23\u0E34\u0E01\u0E32\u0E23\u0E44\u0E21\u0E48\u0E1E\u0E23\u0E49\u0E2D\u0E21 / \u0E1C\u0E34\u0E14\u0E1E\u0E25\u0E32\u0E14",
      errFill:
        "\u0E43\u0E2A\u0E48\u0E25\u0E07 TobyFlow \u0E44\u0E21\u0E48\u0E44\u0E14\u0E49 (\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E1E\u0E23\u0E49\u0E2D\u0E21)",
      toastFilled:
        "\u0E40\u0E1E\u0E34\u0E48\u0E21 {n} \u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C\u0E25\u0E07 TobyFlow \u0E41\u0E25\u0E49\u0E27",
    },
  };
  function L(k) {
    const l = locale();
    return (
      (window.I18n && window.I18n.t && window.I18n.t("pa." + k)) ||
      (_L[l] && _L[l][k]) ||
      _L.en[k] ||
      _L.vi[k] ||
      k
    );
  }
  const _TIP = {
    type: {
      vi: "Lo\u1EA1i \u0111\u1EA7u ra: \u1EA2nh, Video, ho\u1EB7c C\u1EB7p \u1EA3nh\u2192video",
      en: "Output type: Image, Video, or Image\u2192video pair",
      ja: "\u51FA\u529B\u30BF\u30A4\u30D7: \u753B\u50CF / \u52D5\u753B / \u753B\u50CF\u2192\u52D5\u753B\u30DA\u30A2",
      th: "\u0E1B\u0E23\u0E30\u0E40\u0E20\u0E17\u0E1C\u0E25\u0E25\u0E31\u0E1E\u0E18\u0E4C: \u0E23\u0E39\u0E1B / \u0E27\u0E34\u0E14\u0E35\u0E42\u0E2D / \u0E04\u0E39\u0E48\u0E23\u0E39\u0E1B\u2192\u0E27\u0E34\u0E14\u0E35\u0E42\u0E2D",
    },
    count: {
      vi: "S\u1ED1 prompt m\u1ED7i l\u1EA7n (auto = AI t\u1EF1 ch\u1ECDn); v\u01B0\u1EE3t gi\u1EDBi h\u1EA1n s\u1EBD t\u1EF1 gi\u1EA3m",
      en: "Prompts per run (auto = AI decides); over the limit is auto-capped",
      ja: "\u30D7\u30ED\u30F3\u30D7\u30C8\u6570\uFF08auto=AI\u5224\u65AD\uFF09\u3002\u4E0A\u9650\u8D85\u904E\u306F\u81EA\u52D5\u8ABF\u6574",
      th: "\u0E08\u0E33\u0E19\u0E27\u0E19\u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C\u0E15\u0E48\u0E2D\u0E04\u0E23\u0E31\u0E49\u0E07 (auto = AI \u0E40\u0E25\u0E37\u0E2D\u0E01); \u0E40\u0E01\u0E34\u0E19\u0E02\u0E35\u0E14\u0E08\u0E33\u0E01\u0E31\u0E14\u0E08\u0E30\u0E25\u0E14\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34",
    },
    language: {
      vi: "Ng\xF4n ng\u1EEF c\u1EE7a prompt + ch\u1EEF hi\u1EC3n th\u1ECB tr\xEAn \u1EA3nh",
      en: "Language of prompts + on-image text",
      ja: "\u30D7\u30ED\u30F3\u30D7\u30C8\uFF0B\u753B\u50CF\u5185\u30C6\u30AD\u30B9\u30C8\u306E\u8A00\u8A9E",
      th: "\u0E20\u0E32\u0E29\u0E32\u0E02\u0E2D\u0E07\u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C + \u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E1A\u0E19\u0E23\u0E39\u0E1B",
    },
    detail: {
      vi: "\u0110\u1ED9 d\xE0i/chi ti\u1EBFt m\u1ED7i prompt",
      en: "Length/detail of each prompt",
      ja: "\u5404\u30D7\u30ED\u30F3\u30D7\u30C8\u306E\u9577\u3055/\u8A73\u7D30\u5EA6",
      th: "\u0E04\u0E27\u0E32\u0E21\u0E22\u0E32\u0E27/\u0E23\u0E32\u0E22\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14\u0E02\u0E2D\u0E07\u0E41\u0E15\u0E48\u0E25\u0E30\u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C",
    },
    style: {
      vi: "Phong c\xE1ch/ch\u1EA5t li\u1EC7u h\xECnh (vd cinematic, anime)",
      en: "Visual style/medium (e.g. cinematic, anime)",
      ja: "\u30D3\u30B8\u30E5\u30A2\u30EB\u30B9\u30BF\u30A4\u30EB\uFF08\u4F8B: \u30B7\u30CD\u30DE, \u30A2\u30CB\u30E1\uFF09",
      th: "\u0E2A\u0E44\u0E15\u0E25\u0E4C\u0E20\u0E32\u0E1E (\u0E40\u0E0A\u0E48\u0E19 cinematic, anime)",
    },
    aspect: {
      vi: "T\u1EF7 l\u1EC7 khung h\xECnh",
      en: "Aspect ratio",
      ja: "\u30A2\u30B9\u30DA\u30AF\u30C8\u6BD4",
      th: "\u0E2A\u0E31\u0E14\u0E2A\u0E48\u0E27\u0E19\u0E20\u0E32\u0E1E",
    },
    lighting: {
      vi: "Ki\u1EC3u \xE1nh s\xE1ng/t\xF4ng m\xE0u c\u1EE7a c\u1EA3nh",
      en: "Lighting style/mood of the scene",
      ja: "\u7167\u660E\u30B9\u30BF\u30A4\u30EB/\u96F0\u56F2\u6C17",
      th: "\u0E2A\u0E44\u0E15\u0E25\u0E4C\u0E41\u0E2A\u0E07/\u0E2D\u0E32\u0E23\u0E21\u0E13\u0E4C\u0E02\u0E2D\u0E07\u0E09\u0E32\u0E01",
    },
    camera: {
      vi: "G\xF3c m\xE1y / \u1ED1ng k\xEDnh / c\u1EE1 c\u1EA3nh",
      en: "Camera angle / lens / shot size",
      ja: "\u30AB\u30E1\u30E9\u30A2\u30F3\u30B0\u30EB/\u30EC\u30F3\u30BA/\u30B7\u30E7\u30C3\u30C8\u30B5\u30A4\u30BA",
      th: "\u0E21\u0E38\u0E21\u0E01\u0E25\u0E49\u0E2D\u0E07 / \u0E40\u0E25\u0E19\u0E2A\u0E4C / \u0E02\u0E19\u0E32\u0E14\u0E0A\u0E47\u0E2D\u0E15",
    },
    clip: {
      vi: "Th\u1EDDi l\u01B0\u1EE3ng m\u1ED7i clip video",
      en: "Duration of each video clip",
      ja: "\u5404\u52D5\u753B\u30AF\u30EA\u30C3\u30D7\u306E\u9577\u3055",
      th: "\u0E04\u0E27\u0E32\u0E21\u0E22\u0E32\u0E27\u0E02\u0E2D\u0E07\u0E41\u0E15\u0E48\u0E25\u0E30\u0E04\u0E25\u0E34\u0E1B",
    },
    total: {
      vi: "T\u1ED5ng th\u1EDDi l\u01B0\u1EE3ng (video) ho\u1EB7c t\u1ED5ng slideshow (\u1EA3nh)",
      en: "Total duration (video) or total slideshow (image)",
      ja: "\u5408\u8A08\u5C3A\uFF08\u52D5\u753B\uFF09\u307E\u305F\u306F\u30B9\u30E9\u30A4\u30C9\u30B7\u30E7\u30FC\u5408\u8A08\uFF08\u753B\u50CF\uFF09",
      th: "\u0E04\u0E27\u0E32\u0E21\u0E22\u0E32\u0E27\u0E23\u0E27\u0E21 (\u0E27\u0E34\u0E14\u0E35\u0E42\u0E2D) \u0E2B\u0E23\u0E37\u0E2D\u0E2A\u0E44\u0E25\u0E14\u0E4C\u0E42\u0E0A\u0E27\u0E4C\u0E23\u0E27\u0E21 (\u0E23\u0E39\u0E1B)",
    },
    secimg: {
      vi: "Gi\xE2y gi\u1EEF m\u1ED7i \u1EA3nh \u2014 slideshow t\u1EF1 t\xEDnh s\u1ED1 \u1EA3nh",
      en: "Seconds per image \u2014 slideshow auto-computes count",
      ja: "\u753B\u50CF1\u679A\u3042\u305F\u308A\u306E\u79D2\u6570\uFF08\u679A\u6570\u3092\u81EA\u52D5\u8A08\u7B97\uFF09",
      th: "\u0E27\u0E34\u0E19\u0E32\u0E17\u0E35\u0E15\u0E48\u0E2D\u0E23\u0E39\u0E1B \u2014 \u0E04\u0E33\u0E19\u0E27\u0E13\u0E08\u0E33\u0E19\u0E27\u0E19\u0E23\u0E39\u0E1B\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34",
    },
    motion: {
      vi: "Chuy\u1EC3n \u0111\u1ED9ng camera trong video",
      en: "Camera movement in video",
      ja: "\u52D5\u753B\u5185\u306E\u30AB\u30E1\u30E9\u306E\u52D5\u304D",
      th: "\u0E01\u0E32\u0E23\u0E40\u0E04\u0E25\u0E37\u0E48\u0E2D\u0E19\u0E01\u0E25\u0E49\u0E2D\u0E07\u0E43\u0E19\u0E27\u0E34\u0E14\u0E35\u0E42\u0E2D",
    },
    audio: {
      vi: "\xC2m thanh k\xE8m video (Veo sinh t\u1EEB prompt)",
      en: "Audio for video (Veo generates from prompt)",
      ja: "\u52D5\u753B\u306E\u97F3\u58F0\uFF08Veo\u304C\u30D7\u30ED\u30F3\u30D7\u30C8\u304B\u3089\u751F\u6210\uFF09",
      th: "\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E02\u0E2D\u0E07\u0E27\u0E34\u0E14\u0E35\u0E42\u0E2D (Veo \u0E2A\u0E23\u0E49\u0E32\u0E07\u0E08\u0E32\u0E01\u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C)",
    },
    tone: {
      vi: "T\xF4ng/th\u1EC3 lo\u1EA1i n\u1ED9i dung (vd vui, k\u1ECBch t\xEDnh)",
      en: "Tone/genre of content (e.g. fun, dramatic)",
      ja: "\u30C8\u30FC\u30F3/\u30B8\u30E3\u30F3\u30EB\uFF08\u4F8B: \u697D\u3057\u3044, \u30C9\u30E9\u30DE\u30C1\u30C3\u30AF\uFF09",
      th: "\u0E42\u0E17\u0E19/\u0E41\u0E19\u0E27\u0E40\u0E19\u0E37\u0E49\u0E2D\u0E2B\u0E32 (\u0E40\u0E0A\u0E48\u0E19 \u0E2A\u0E19\u0E38\u0E01, \u0E14\u0E23\u0E32\u0E21\u0E48\u0E32)",
    },
    voice: {
      vi: "Ch\u1EA5t gi\u1ECDng \u0111\u1ECDc khi video t\u1EF1 sinh \xE2m thanh (ch\u1EC9 \xE1p khi \xC2m thanh = L\u1EDDi tho\u1EA1i/\u0110\u1EA7y \u0111\u1EE7)",
      en: "Narrator voice when the video model generates audio (only when Audio = Dialogue/Full)",
      ja: "\u52D5\u753B\u304C\u97F3\u58F0\u3092\u751F\u6210\u3059\u308B\u969B\u306E\u30CA\u30EC\u30FC\u30B7\u30E7\u30F3\u58F0\uFF08\u97F3\u58F0=\u30BB\u30EA\u30D5/\u30D5\u30EB\u306E\u307F\uFF09",
      th: "\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E1C\u0E39\u0E49\u0E1A\u0E23\u0E23\u0E22\u0E32\u0E22\u0E40\u0E21\u0E37\u0E48\u0E2D\u0E27\u0E34\u0E14\u0E35\u0E42\u0E2D\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E40\u0E2A\u0E35\u0E22\u0E07 (\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E40\u0E21\u0E37\u0E48\u0E2D\u0E40\u0E2A\u0E35\u0E22\u0E07 = \u0E1A\u0E17\u0E1E\u0E39\u0E14/\u0E40\u0E15\u0E47\u0E21)",
    },
  };
  function TIP(k) {
    const l = locale();
    return (
      (window.I18n && window.I18n.t && window.I18n.t("pa.tip_" + k)) ||
      (_TIP[k] && (_TIP[k][l] || _TIP[k].en)) ||
      ""
    );
  }
  const _PromptAssistantModal = class _PromptAssistantModal {
    static open() {
      const fg = window.featureGate;
      if (
        fg &&
        typeof fg.canUse === "function" &&
        !fg.canUse("prompt_assistant_enabled")
      ) {
        fg.showModuleBlockedDialog("Prompt Assistant");
        return;
      }
      if (_PromptAssistantModal._overlay) _PromptAssistantModal.close();
      _PromptAssistantModal._state = {
        provider: "chatgpt",
        idea: "",
        images: [],
        sending: false,
        view: "form",
        config: null,
        status: null,
        result: null,
        formats: [],
        formatKey: null,
        formatCategory: null,
        advancedOpen: false,
        settings: _PromptAssistantModal._fallbackSettings(),
      };
      _PromptAssistantModal._render();
      _PromptAssistantModal._loadConfigAndStatus();
      _PromptAssistantModal._subscribeSse();
    }
    static _subscribeSse() {
      if (!window.eventBus) return;
      _PromptAssistantModal._onFormatsUpdated = () =>
        _PromptAssistantModal._reloadFormats();
      window.eventBus.on(
        "pa:formats_updated",
        _PromptAssistantModal._onFormatsUpdated,
      );
      _PromptAssistantModal._onEntitlements = () => {
        setTimeout(() => {
          if (_PromptAssistantModal._state)
            _PromptAssistantModal._reloadFormats();
        }, 800);
      };
      window.eventBus.on(
        "sse:entitlements_changed",
        _PromptAssistantModal._onEntitlements,
      );
    }
    static async _reloadFormats() {
      const r = await _PromptAssistantModal._bg({ action: "pa:getFormats" });
      const s = _PromptAssistantModal._state;
      if (!s) return;
      if (r?.ok && Array.isArray(r.formats)) {
        s.formats = r.formats;
        if (s.view === "form") _PromptAssistantModal._render();
      }
    }
    static close() {
      _PromptAssistantModal._cleanup();
      if (_PromptAssistantModal._overlay) {
        _PromptAssistantModal._overlay.remove();
        _PromptAssistantModal._overlay = null;
      }
    }
    static _fallbackSettings() {
      return {
        media_type: "image",
        count: "auto",
        language: "en",
        numbered: true,
        clip_duration: "auto",
        total_duration: "",
        seconds_per_image: "",
        sequential: true,
        camera_motion: "auto",
        style: "cinematic",
        aspect_ratio: "16:9",
        lighting: "auto",
        camera: "auto",
        detail_level: "concise",
        consistency: true,
        negative: "",
        tone: "auto",
        audio: "auto",
        delete_after: false,
        auto_script: false,
        render_sub: false,
      };
    }
    static _bg(msg) {
      return new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage(msg, (r) =>
            resolve(chrome.runtime.lastError ? null : r),
          );
        } catch (_) {
          resolve(null);
        }
      });
    }
    static async _loadConfigAndStatus() {
      const [cfgR, stR, fmtR] = await Promise.all([
        _PromptAssistantModal._bg({ action: "pa:getConfig" }),
        _PromptAssistantModal._bg({ action: "i2p:checkProviders" }),
        _PromptAssistantModal._bg({ action: "pa:getFormats" }),
      ]);
      const s = _PromptAssistantModal._state;
      if (!s) return;
      if (cfgR?.ok && cfgR.config) {
        s.config = cfgR.config;
        s.provider = cfgR.config.defaultProvider || "chatgpt";
        s.settings.delete_after = !!cfgR.config.deleteAfter;
        const d = cfgR.config.defaults || {};
        Object.keys(d).forEach((k) => {
          if (d[k] !== void 0 && d[k] !== null && d[k] !== "")
            s.settings[k] = d[k];
        });
      }
      s.baselineSettings = { ...s.settings };
      s.status = stR?.ok
        ? stR.providers
        : { chatgpt: { tabOpen: false }, gemini: { tabOpen: false } };
      s.formats = fmtR?.ok && Array.isArray(fmtR.formats) ? fmtR.formats : [];
      _PromptAssistantModal._render();
      _PromptAssistantModal._startStatusPoll();
    }
    static _applyFormat(key, skipRender) {
      const s = _PromptAssistantModal._state;
      if (!key) {
        s.formatKey = "";
        s.settings = {
          ...(s.baselineSettings || _PromptAssistantModal._fallbackSettings()),
        };
        if (!skipRender) _PromptAssistantModal._render();
        return;
      }
      const fmt = s.formats.find((f) => f.key === key);
      if (!fmt) return;
      s.formatKey = key;
      const d = fmt.defaults || {};
      Object.keys(d).forEach((k) => {
        if (d[k] !== void 0 && d[k] !== null && d[k] !== "")
          s.settings[k] = d[k];
      });
      if (!skipRender) _PromptAssistantModal._render();
    }
    static _buildMetaPrompt() {
      const s = _PromptAssistantModal._state,
        st = s.settings;
      const tpl = (s.config?.promptTemplate || "").trim();
      if (!tpl) return null;
      const mt =
        st.media_type === "video"
          ? "video"
          : st.media_type === "pair"
            ? "image and video"
            : "image";
      const lang =
        st.language === "vi"
          ? "Vietnamese"
          : st.language === "source"
            ? "the same language as the user idea"
            : "English";
      const detailRule =
        st.detail_level === "detailed"
          ? "each prompt 50\u201380 words"
          : st.detail_level === "cinematic"
            ? "each prompt with full cinematic detail"
            : "each prompt 20\u201350 words, concise and precise";
      const C = [];
      const cnt = parseInt(st.count, 10);
      const unit = st.media_type === "pair" ? "scenes" : "prompts";
      const isVideo = st.media_type === "video" || st.media_type === "pair";
      const _perImg = parseInt(st.seconds_per_image, 10);
      const _slideTotal = parseInt(st.total_duration, 10);
      const slideCount =
        st.media_type === "image" && _slideTotal > 0 && _perImg > 0
          ? Math.max(
              1,
              Math.min(
                _PromptAssistantModal._maxCount(),
                Math.round(_slideTotal / _perImg),
              ),
            )
          : 0;
      const srt = _PromptAssistantModal._parseSrt(s.idea);
      if (srt) {
        C.push(
          `The USER IDEA is an SRT subtitle script with ${srt.cues.length} cues. Create EXACTLY ${srt.cues.length} ${unit} \u2014 ONE per cue, IN ORDER. Each prompt must VISUALIZE the meaning of its cue (not just restate the words); keep each cue's wording unchanged if you reference it.`,
        );
        if (isVideo)
          C.push(
            "Set each clip's duration close to its cue duration (round to the nearest of 4s/6s/8s/10s).",
          );
        if (
          isVideo &&
          (st.audio === "dialogue" || st.audio === "full") &&
          !st.render_sub
        ) {
          C.push(
            `At the END of EACH prompt block, on a NEW line within the SAME block (no ${_PromptAssistantModal._TRANSPORT_NEXT} before it, never numbered), append: VOICEOVER: "<that cue's exact subtitle text>". This line is spoken aloud as the clip's voiceover audio.`,
          );
        }
      } else if (st.auto_script) {
        const durHint =
          isVideo && st.total_duration
            ? ` to fit about ${st.total_duration}s total`
            : slideCount
              ? ` for a slideshow of ${slideCount} images (~${_perImg}s on screen each)`
              : "";
        C.push(
          `SCRIPT MODE: First silently write a coherent ${lang} voice-over script broken into scenes${durHint} \u2014 one short spoken line per scene, paced to be read aloud within that scene. Then turn EACH line into one ${unit} that visualizes it.`,
        );
        C.push(
          slideCount
            ? `Use EXACTLY ${slideCount} ${unit}.`
            : st.count && st.count !== "auto" && cnt > 0
              ? `Use EXACTLY ${cnt} ${unit}.`
              : `Choose an appropriate number of ${unit}.`,
        );
        if (!st.render_sub)
          C.push(
            `At the END of EACH prompt block, on a NEW line within the SAME block (no ${_PromptAssistantModal._TRANSPORT_NEXT} before it, never numbered), append that scene's narration as: VOICEOVER: "<exact spoken line>". This is metadata for the user, NOT part of the image description.`,
          );
      } else {
        C.push(
          slideCount
            ? `Write EXACTLY ${slideCount} ${unit}.`
            : st.count && st.count !== "auto" && cnt > 0
              ? `Write EXACTLY ${cnt} ${unit}.`
              : `Write an appropriate number of ${unit} for the idea.`,
        );
      }
      if (slideCount)
        C.push(
          `This is a SLIDESHOW of still images: produce ${slideCount} images, each held ~${_perImg}s on screen (~${slideCount * _perImg}s total). Pace any narration to ~${_perImg}s per image.`,
        );
      C.push(
        'If the idea is a list (e.g. "N benefits/tips/reasons/ways"), each item MUST belong to a CLEARLY DIFFERENT category \u2014 never repeat or lightly rephrase the same point.',
      );
      if (st.sequential)
        C.push(
          "The prompts must form ONE continuous storyboard \u2014 each scene flows into the next.",
        );
      if (st.media_type === "video" || st.media_type === "pair") {
        if (st.clip_duration && st.clip_duration !== "auto")
          C.push(`Each clip lasts about ${st.clip_duration}.`);
        if (st.total_duration)
          C.push(
            `Total duration about ${st.total_duration}s \u2014 split into clips accordingly.`,
          );
        if (st.camera_motion && st.camera_motion !== "auto")
          C.push(`Camera motion: ${st.camera_motion}.`);
        const audioMap = {
          ambient: "Include ambient background sound that matches each scene.",
          sfx: 'Include specific sound effects (write as "SFX: ...").',
          music:
            'Include background music/score that matches the scene mood (write as "MUSIC: ...").',
          dialogue:
            "Include short spoken dialogue in quotes for characters where natural.",
          full: "Include a full soundscape: ambient noise, sound effects (SFX: ...), and short dialogue in quotes where natural.",
          none: "No audio \u2014 purely visual.",
        };
        const _nativeVoice = st.audio === "dialogue" || st.audio === "full";
        if (_nativeVoice && (st.auto_script || srt) && !st.render_sub) {
          C.push(
            "The scene's VOICEOVER line is spoken aloud as the clip's voiceover (the only speech); also add matching ambient sound and subtle SFX. Do not invent extra unrelated dialogue.",
          );
        } else if (st.audio && audioMap[st.audio]) {
          C.push(audioMap[st.audio]);
        }
        C.push(
          "For every video/motion prompt: state a clear START pose and END pose, ONE controlled main movement, and one subtle or locked camera move; keep the face, body proportions, hands/fingers, costume and background STABLE \u2014 no morphing, no extra limbs, no finger or face deformation, no background warping, no scene cut inside a clip.",
        );
      }
      if (st.media_type === "pair")
        C.push(
          `For EACH scene output TWO separate prompts (separated by ${_PromptAssistantModal._TRANSPORT_NEXT} like every prompt): first the still IMAGE prompt, then the MOTION/animation prompt for that image. So N scenes = 2N prompts.`,
        );
      if (st.style) C.push(`Visual style/medium: ${st.style}.`);
      if (st.aspect_ratio) C.push(`Aspect ratio: ${st.aspect_ratio}.`);
      if (st.lighting && st.lighting !== "auto")
        C.push(`Lighting/mood: ${st.lighting}.`);
      if (st.camera && st.camera !== "auto")
        C.push(`Camera/lens/framing: ${st.camera}.`);
      C.push(`Length: ${detailRule}.`);
      const _subLang =
        st.language === "vi"
          ? "Vietnamese"
          : st.language === "source"
            ? "the user idea's language"
            : "English";
      const _isEnText = _subLang === "English";
      const _diacritics = _isEnText
        ? ""
        : " render every character with correct diacritics;";
      const _egText = _isEnText
        ? ""
        : ' \u2014 e.g. Exact Vietnamese text: "B\u1EEEA S\xC1NG \u0110\u1EA6Y \u0110\u1EE6"';
      const _strongTextRule = (what) =>
        `For ${what}, write it in the prompt as \u2014 Exact ${_subLang} text: "<THE WORDS IN UPPERCASE>"${_egText}. Then add these rules verbatim: ${_subLang} language only; do not translate; do not rewrite; do not paraphrase;${_diacritics} keep the rest of the scene uncluttered so the text stays legible.`;
      if (st.language !== "en") {
        C.push(
          `Write the VISUAL scene description in ENGLISH for best image/video-model accuracy. ONLY the voiceover/narration and any on-screen text are in ${lang}.`,
        );
        C.push(
          "Whenever the image shows text (signs, labels, titles, posters, UI): " +
            _strongTextRule("that text"),
        );
      }
      if (st.render_sub) {
        const _what = srt
          ? "the cue subtitle"
          : st.auto_script
            ? "the narration line"
            : "the caption";
        C.push(
          `Render ${_what} as a LARGE subtitle band at the BOTTOM of the frame. ` +
            _strongTextRule("that subtitle"),
        );
      }
      if (st.consistency)
        C.push(
          "Keep the SAME character(s), wardrobe and setting consistent across all prompts.",
        );
      if (st.tone && st.tone !== "auto") C.push(`Tone/genre: ${st.tone}.`);
      if (st.negative && st.negative.trim())
        C.push(`Avoid: ${st.negative.trim()}.`);
      C.push(
        "Respond with TEXT prompts ONLY. DO NOT generate, create, draw, render or edit any actual image or video \u2014 you are WRITING prompts for the user to paste into a separate image/video tool.",
      );
      if (s.images.length)
        C.push(
          "The attached image(s) are REFERENCE ONLY \u2014 analyze them to guide character/style/composition; do not reproduce or edit them.",
        );
      C.push(
        st.numbered
          ? "Prefix each prompt with its number (1., 2., 3., ...)."
          : "Do NOT number the prompts.",
      );
      C.push(
        `Separate each prompt with a line containing ONLY ${_PromptAssistantModal._TRANSPORT_NEXT}. Keep each complete prompt in ONE self-contained block; a VOICEOVER metadata line may be the second line of that same block. Never put a transport marker inside a prompt, and never put a number on anything except the start of a prompt.`,
      );
      const fmt = s.formats.find((f) => f.key === s.formatKey);
      const formatStructure =
        (fmt?.structure_prompt || "").trim() ||
        "Create a coherent sequence; if the idea implies a story, give it a clear beginning, middle and end.";
      const userInput = srt
        ? "SRT CUES (index | seconds | text):\n" +
          srt.cues
            .map((c, i) => `${i + 1} | ${Math.round(c.dur)}s | ${c.text}`)
            .join("\n")
        : s.idea.trim();
      let out = tpl
        .replace(/\{media_type\}/g, mt)
        .replace(/\{language\}/g, "English")
        .replace(/\{format_structure\}/g, formatStructure)
        .replace(/\{constraints\}/g, C.map((x) => `- ${x}`).join("\n"))
        .replace(/\{user_input\}/g, userInput);
      const _refNote = s.images.length
        ? " The attached image(s) are REFERENCE material to ANALYZE only."
        : "";
      const transportContract = [
        "OUTPUT TRANSPORT CONTRACT \u2014 MANDATORY AND OVERRIDES EVERY EARLIER OUTPUT-FORMAT INSTRUCTION:",
        "Return exactly ONE fenced plain-text code block and nothing outside it.",
        "Do not include citations, source names, footnotes, headings, explanations or commentary.",
        `The first line inside the code block must be exactly: ${_PromptAssistantModal._TRANSPORT_BEGIN}`,
        `Separate prompts with a line containing exactly: ${_PromptAssistantModal._TRANSPORT_NEXT}`,
        `The last line inside the code block must be exactly: ${_PromptAssistantModal._TRANSPORT_END}`,
        "A prompt may contain its own VOICEOVER metadata line, but never place any transport marker inside a prompt.",
      ].join("\n");
      out = `IMPORTANT: Your entire reply must be TEXT prompts as specified below. DO NOT generate, create, draw, render or edit any actual image or video \u2014 you are WRITING prompts, NOT producing media.${_refNote}

${out}

${transportContract}`;
      return out;
    }
    static _parsePrompts(raw, sourceFileNames = []) {
      const fileLabels = new Set();
      for (const name of sourceFileNames) {
        const base = String(name || "")
          .trim()
          .replace(/\.txt$/i, "");
        if (!base) continue;
        fileLabels.add(base);
        fileLabels.add(base.replace(/\(\d{8}-\d{6}\)$/, "").trim());
      }
      let text = (raw || "")
        .replace(/^```(?:json|text|markdown)?\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();
      const beginAt = text.indexOf(_PromptAssistantModal._TRANSPORT_BEGIN);
      const endAt = text.lastIndexOf(_PromptAssistantModal._TRANSPORT_END);
      const hasAnyTransportMarker = beginAt >= 0 || endAt >= 0;
      let transportFramed = false;
      if (hasAnyTransportMarker) {
        if (beginAt < 0 || endAt < 0 || endAt <= beginAt) {
          console.warn(
            "[PA] Incomplete output transport markers; rejecting ambiguous response",
          );
          return [];
        }
        text = text
          .slice(beginAt + _PromptAssistantModal._TRANSPORT_BEGIN.length, endAt)
          .trim();
        transportFramed = true;
      }
      if (fileLabels.size) {
        text = text
          .split(/\r?\n/)
          .filter((line) => {
            const label = line
              .trim()
              .replace(/^\d+[.)]\s+/, "")
              .replace(/^[-*•]\s+/, "")
              .replace(/^\[([^\]]+)\]$/, "$1")
              .trim();
            return !fileLabels.has(label);
          })
          .join("\n")
          .trim();
      }
      const escapedTransportNext =
        _PromptAssistantModal._TRANSPORT_NEXT.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        );
      let blocks = transportFramed
        ? text
            .split(new RegExp(`^[ \\t]*${escapedTransportNext}[ \\t]*$`, "m"))
            .map((b) => b.trim())
            .filter(Boolean)
        : text
            .split(/^[ \t]*-{3,}[ \t]*$/m)
            .map((b) => b.trim())
            .filter(Boolean);
      if (!transportFramed && blocks.length <= 1) {
        const numbered = text.match(/^[ \t]*\d+[.)]\s+/gm);
        if (numbered && numbered.length >= 2) {
          blocks = text
            .split(/\n(?=[ \t]*\d+[.)]\s+)/)
            .map((b) => b.trim())
            .filter(Boolean);
        } else {
          blocks = text
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);
        }
      }
      return blocks;
    }
    static _stripNumbering(line) {
      return line.replace(/^\s*(?:\d+[.)]|[-*•])\s+/, "").trim();
    }
    static _parseSrt(text) {
      const t = (text || "").trim();
      if (
        !/\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{3}/.test(
          t,
        )
      )
        return null;
      const tc = (x) => {
        const m = String(x).match(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/);
        return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1e3 : 0;
      };
      const cues = [];
      for (const b of t.split(/\r?\n\s*\r?\n/)) {
        const lines = b
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        const ti = lines.findIndex((l) => /-->/.test(l));
        if (ti < 0) continue;
        const [a, c] = lines[ti].split("-->");
        const start = tc(a),
          end = tc(c);
        const txt = lines
          .slice(ti + 1)
          .join(" ")
          .trim();
        if (!txt) continue;
        cues.push({ start, end, dur: Math.max(0, end - start), text: txt });
      }
      if (!cues.length) return null;
      return {
        cues,
        totalDur:
          cues[cues.length - 1].end || cues.reduce((s, x) => s + x.dur, 0),
      };
    }
    static _splitSub(block) {
      let body = (block || "").trim();
      let sub = null;
      const vo = body.match(
        /(?:^|\n)[ \t]*(?:VOICEOVER|VO|Narration|Lời dẫn)[ \t]*[:：][ \t]*["“]?(.+?)["”]?[ \t]*(?=\n|$)/i,
      );
      if (vo) {
        sub = vo[1].trim();
        body = (
          body.slice(0, vo.index) + body.slice(vo.index + vo[0].length)
        ).trim();
      }
      if (!sub) {
        const os = body.match(
          /(?:On-screen subtitle|Subtitle reads|Phụ đề|Exact [\w' ]+ text)[ \t]*[:：][ \t]*["“](.+?)["”]/i,
        );
        if (os) sub = os[1].trim();
      }
      return { sub, body };
    }
    static _mergeSubBlocks(arr) {
      const out = [];
      for (const block of arr || []) {
        const sp = _PromptAssistantModal._splitSub(block);
        const bodyEmpty = !(sp.body || "")
          .replace(/^\s*\d+[.)]?\s*/, "")
          .trim();
        if (bodyEmpty && sp.sub && out.length) {
          out[out.length - 1] =
            out[out.length - 1].replace(/\s*$/, "") +
            `
VOICEOVER: "${sp.sub}"`;
        } else {
          out.push(block);
        }
      }
      return out;
    }
    static _promptsText(kind, forGen) {
      const st0 = _PromptAssistantModal._state?.settings || {};
      const nativeVoice =
        (st0.media_type === "video" || st0.media_type === "pair") &&
        (st0.audio === "dialogue" || st0.audio === "full");
      const langWord =
        st0.language === "vi"
          ? "Vietnamese"
          : st0.language === "source"
            ? "the source language"
            : "English";
      const _voice = (st0.voice || "").trim();
      const _voiceArt = /^[aeiou]/i.test(_voice) ? "an" : "a";
      const _voiceIn = _voice ? `in ${_voiceArt} ${_voice} voice ` : "";
      let arr = (_PromptAssistantModal._state?.result?.prompts || []).slice();
      if (kind === "image") arr = arr.filter((_, i) => i % 2 === 0);
      else if (kind === "video") arr = arr.filter((_, i) => i % 2 === 1);
      arr = arr
        .map((p) => {
          const { sub, body } = _PromptAssistantModal._splitSub(p);
          let out = _PromptAssistantModal
            ._stripNumbering(body)
            .replace(/\n[ \t]*\n+/g, "\n")
            .trim();
          if (forGen && nativeVoice && sub && kind !== "image") {
            out += ` Spoken voiceover ${_voiceIn}(${langWord}, audio only \u2014 do NOT render as on-screen text): "${sub}".`;
          }
          return out;
        })
        .filter(Boolean);
      if (_PromptAssistantModal._state?.settings?.numbered)
        arr = arr.map((p, i) => `${i + 1}. ${p}`);
      return arr.join("\n\n");
    }
    static _buildSrt() {
      const s = _PromptAssistantModal._state;
      if (!s) return null;
      if (_PromptAssistantModal._parseSrt(s.idea)) return s.idea.trim();
      const subs = (s.result?.prompts || [])
        .map((p) => _PromptAssistantModal._splitSub(p).sub)
        .filter(Boolean);
      if (!subs.length) return null;
      const st = s.settings || {};
      const isVid = st.media_type === "video" || st.media_type === "pair";
      const clipSec = isVid ? parseFloat(st.clip_duration) || 0 : 0;
      const total = parseFloat(st.total_duration) || 0;
      const pad = (n, w) => String(n).padStart(w, "0");
      const fmt = (sec) =>
        `${pad(Math.floor(sec / 3600), 2)}:${pad(Math.floor((sec % 3600) / 60), 2)}:${pad(Math.floor(sec % 60), 2)},${pad(Math.round((sec - Math.floor(sec)) * 1e3), 3)}`;
      let cur = 0;
      return subs
        .map((text, i) => {
          const dur =
            clipSec > 0
              ? clipSec
              : total > 0
                ? total / subs.length
                : Math.max(1.8, text.split(/\s+/).filter(Boolean).length / 2.6);
          const start = cur;
          cur += dur;
          return `${i + 1}
${fmt(start)} --> ${fmt(cur)}
${text}`;
        })
        .join("\n\n");
    }
    static _render() {
      const exist = _PromptAssistantModal._overlay;
      const scrollTop = exist ? exist.querySelector(".pa-body")?.scrollTop : 0;
      const fmtScrollLeft = exist
        ? exist.querySelector(".pa-formats")?.scrollLeft || 0
        : 0;
      if (exist) exist.remove();
      const overlay = document.createElement("div");
      overlay.className = "pa-overlay";
      const s = _PromptAssistantModal._state;
      overlay.innerHTML = `
        <div class="pa-modal">
          <div class="pa-header">
            <div class="pa-title"><svg class="pa-title-ic" width="24" height="24" viewBox="0 0 18 18" fill="none" role="img" aria-label="Prompt Assistant"><path d="M3.47158 3.7689C4.43604 4.12493 5.19375 4.88096 5.55044 5.84302C5.64791 6.10611 5.89926 6.28072 6.18038 6.28072C6.46138 6.28072 6.71273 6.10611 6.81033 5.84328C7.16715 4.88096 7.92499 4.12493 8.88932 3.7689C9.15287 3.67152 9.32787 3.42073 9.32787 3.14036C9.32787 2.85999 9.15287 2.6092 8.88932 2.51182C7.92499 2.15579 7.16728 1.39976 6.81033 0.437441C6.71273 0.17461 6.46138 0 6.18038 0C5.89926 0 5.64804 0.17461 5.55044 0.437703C5.19362 1.39976 4.43591 2.15579 3.47158 2.51182C3.20803 2.6092 3.03303 2.85999 3.03303 3.14036C3.03303 3.42073 3.20803 3.67152 3.47158 3.7689ZM6.18038 2.07621C6.4783 2.48407 6.83814 2.84324 7.24704 3.14036C6.83801 3.43748 6.4783 3.79639 6.18038 4.20451C5.8826 3.79639 5.52289 3.43748 5.11386 3.14036C5.52276 2.84324 5.8826 2.48407 6.18038 2.07621ZM14.9858 15.163C14.4549 14.967 14.0377 14.5507 13.8412 14.0209C13.7436 13.7578 13.4923 13.5832 13.2113 13.5832C12.9302 13.5832 12.6788 13.7578 12.5813 14.0209C12.385 14.5507 11.9678 14.967 11.4368 15.163C11.1731 15.2604 10.9981 15.5112 10.9981 15.7916C10.9981 16.072 11.1731 16.3228 11.4368 16.4201C11.9678 16.6162 12.385 17.0324 12.5813 17.5623C12.6788 17.8254 12.9302 18 13.2113 18C13.4923 18 13.7436 17.8254 13.8412 17.5623C14.0377 17.0324 14.4549 16.6162 14.9858 16.4201C15.2495 16.3228 15.4245 16.072 15.4245 15.7916C15.4245 15.5112 15.2495 15.2604 14.9858 15.163ZM13.2113 16.0521C13.1293 15.9604 13.0422 15.8735 12.9502 15.7916C13.0422 15.7097 13.1293 15.6227 13.2113 15.5311C13.2934 15.6227 13.3805 15.7097 13.4723 15.7916C13.3805 15.8735 13.2934 15.9604 13.2113 16.0521ZM13.6885 9.89753L15.3237 8.25012C15.8941 7.67524 15.8918 6.74224 15.3186 6.17025L13.5778 4.43331C13.2988 4.15477 12.9277 4.00137 12.5329 4.00137C12.1382 4.00137 11.7671 4.15477 11.4882 4.43331L9.83338 6.08445C9.83292 6.08491 9.83233 6.08523 9.83187 6.08569C9.83145 6.08608 9.83122 6.08661 9.83076 6.08707L2.44678 13.4546C2.32071 13.5803 2.25 13.7507 2.25 13.9285V16.8463C2.25 17.2165 2.55067 17.5165 2.92166 17.5165H5.846C6.02519 17.5165 6.19704 17.445 6.32324 17.3178L13.6885 9.89753ZM12.4381 5.38097C12.5033 5.31578 12.5631 5.31631 12.6279 5.38097L14.3687 7.1179C14.4208 7.17 14.4209 7.25482 14.3691 7.30717L13.2069 8.47813L11.2613 6.55513L12.4381 5.38097ZM5.56592 16.1762H3.59332V14.206L10.3113 7.50299L12.2616 9.4305L5.56592 16.1762Z" fill="currentColor"></path></svg><span>${L("title")}</span></div>
            <button class="pa-close" title="${L("close")}">\u2715</button>
          </div>
          <div class="pa-body">${s.view === "result" ? _PromptAssistantModal._formResult() : _PromptAssistantModal._formInput()}</div>
          <div class="pa-footer">${_PromptAssistantModal._footer()}</div>
        </div>`;
      document.body.appendChild(overlay);
      _PromptAssistantModal._overlay = overlay;
      _PromptAssistantModal._bind();
      const body = overlay.querySelector(".pa-body");
      if (body && scrollTop) body.scrollTop = scrollTop;
      const fmts = overlay.querySelector(".pa-formats");
      if (fmts && fmtScrollLeft) fmts.scrollLeft = fmtScrollLeft;
      if (s.view === "form") _PromptAssistantModal._renderImages();
    }
    static _opt(val, cur, label) {
      return `<option value="${val}"${val === cur ? " selected" : ""}>${label}</option>`;
    }
    static _esc(s) {
      return String(s).replace(
        /[&<>"]/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
      );
    }
    static _sanitizeSvg(svg) {
      return String(svg || "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<\/?(foreignObject|iframe|use)\b[^>]*>/gi, "")
        .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
        .replace(
          /(?:href|xlink:href)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi,
          "",
        );
    }
    static _formInput() {
      const s = _PromptAssistantModal._state,
        st = s.settings;
      const isVideo = st.media_type === "video" || st.media_type === "pair";
      const E = _PromptAssistantModal._esc,
        O = _PromptAssistantModal._opt;
      const dot = (p) => {
        const x = s.status?.[p];
        return x?.ready ? "on" : x?.tabOpen ? "warn" : "";
      };
      const pv = (p, name) =>
        `<div class="pa-pv${s.provider === p ? " sel" : ""}" data-prov="${p}"><span class="pa-dot ${dot(p)}"></span>${name}</div>`;
      const lightOpt = [
        ["auto", L("auto")],
        ["golden_hour", L("golden_hour")],
        ["blue hour", L("blueHour")],
        ["rim light", L("rim")],
        ["low-key", L("lowKey")],
        ["high-key", L("highKey")],
        ["volumetric", L("volumetric")],
        ["neon", L("neon")],
        ["dramatic", L("dramatic")],
        ["soft", L("soft")],
      ];
      const camOpt = [
        ["auto", L("auto")],
        ["close_up", L("close_up")],
        ["medium shot", L("medium")],
        ["wide", L("wide")],
        ["aerial drone", L("aerial")],
        ["low angle", L("lowAngle")],
        ["high angle", L("highAngle")],
        ["macro", L("macro")],
        ["35mm", L("lens35")],
        ["85mm", L("lens85")],
      ];
      const motOpt = [
        ["auto", L("auto")],
        ["dolly in", L("dolly")],
        ["tracking", L("tracking")],
        ["orbit", L("orbit")],
        ["pan", L("pan")],
        ["tilt", L("tilt")],
        ["zoom", L("zoom")],
        ["crane", L("crane")],
        ["handheld", L("handheld")],
        ["static", L("staticMot")],
      ];
      const audioOpt = [
        ["auto", L("auto")],
        ["none", L("audioNone")],
        ["ambient", L("audioAmbient")],
        ["sfx", L("audioSfx")],
        ["music", L("audioMusic")],
        ["dialogue", L("audioDialogue")],
        ["full", L("audioFull")],
      ];
      const dfltFmtSvg =
        '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z"/></svg>';
      const noneIcon =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5.63605 5.63603L18.364 18.364M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"/></svg>';
      const fmtCatCount = {};
      s.formats.forEach((f) => {
        if (f.category)
          fmtCatCount[f.category] = (fmtCatCount[f.category] || 0) + 1;
      });
      const fmtCats = [
        ...new Set(s.formats.map((f) => f.category).filter(Boolean)),
      ].sort((a, b) => fmtCatCount[b] - fmtCatCount[a]);
      const fmtHasUncat = s.formats.some((f) => !f.category);
      const fmtTabs = fmtCats.slice();
      if (fmtHasUncat && fmtCats.length) fmtTabs.push("__other__");
      const curCat = s.formatCategory || fmtTabs[0] || null;
      const fmtTabsHtml = fmtTabs.length
        ? `<div class="pa-fmt-tabs-wrap">
            <div class="pa-fmt-tabs">${fmtTabs.map((c) => `<button class="pa-fmt-tab${curCat === c ? " sel" : ""}" data-cat="${E(c)}">${c === "__other__" ? E(L("formatOther")) : E(c)}</button>`).join("")}</div>
            <button class="pa-fmt-tabs-more" type="button" aria-label="More" hidden>\u22EF</button>
          </div>`
        : "";
      const visFormats = fmtTabs.length
        ? s.formats.filter((f) =>
            curCat === "__other__" ? !f.category : f.category === curCat,
          )
        : s.formats;
      const noneCard = `<button class="pa-fmt pa-fmt--none${!s.formatKey ? " sel" : ""}" data-fmt="" data-tooltip="${E(L("formatNone"))}" data-tooltip-placement="bottom"><span class="pa-fmt-thumb pa-fmt-thumb--icon"><span class="pa-fmt-ic">${noneIcon}</span></span></button>`;
      const canPremium =
        window.featureGate?.canUse?.("premium_templates") || false;
      const crownSvg =
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z"/></svg>';
      const fmtCard = (f) => {
        const thumb = f.thumbnail || "";
        const locked = !!f.is_premium && !canPremium;
        const body = thumb
          ? `<span class="pa-fmt-thumb" style="background-image:url('${E(thumb)}')"></span>`
          : `<span class="pa-fmt-thumb pa-fmt-thumb--icon"><span class="pa-fmt-ic">${_PromptAssistantModal._sanitizeSvg(f.icon) || dfltFmtSvg}</span></span>`;
        const crown = f.is_premium
          ? `<span class="pa-fmt-crown" title="${E(locked ? L("premiumNeed") : "Premium")}">${crownSvg}</span>`
          : "";
        return `<button class="pa-fmt${s.formatKey === f.key ? " sel" : ""}${locked ? " pa-fmt--locked" : ""}" data-fmt="${E(f.key)}" data-thumb="${E(thumb)}" data-video="${E(f.preview_video || "")}" data-tooltip="${E(f.name)}" data-tooltip-placement="bottom" data-locked="${locked ? "1" : ""}">${crown}${body}<span class="pa-fmt-nm">${E(f.name)}</span></button>`;
      };
      const fmtChips = noneCard + visFormats.map(fmtCard).join("");
      return `
        <div class="pa-row pa-provs">
          <span class="pa-lbl">${L("provider")}</span>
          ${pv("chatgpt", "ChatGPT")}${pv("gemini", "Gemini")}
        </div>
        <textarea class="pa-idea" rows="3" placeholder="${E(L("ideaPlaceholder"))}">${E(s.idea || "")}</textarea>
        ${(() => {
          const srt = _PromptAssistantModal._parseSrt(s.idea);
          return srt
            ? `<div class="pa-srt-badge">${L("srtDetected").replace("{n}", srt.cues.length).replace("{dur}", Math.round(srt.totalDur))}</div>`
            : "";
        })()}

        ${
          s.formats.length
            ? `<div class="pa-fmtwrap">
          ${fmtTabsHtml}
          <div class="pa-formats">${fmtChips}</div>
        </div>`
            : ""
        }

        <div class="pa-grid pa-primary">
          ${_PromptAssistantModal._field(
            L("mediaType"),
            `<select data-set="media_type">
            ${O("image", st.media_type, L("image"))}${O("video", st.media_type, L("video"))}${O("pair", st.media_type, L("pair"))}
          </select>`,
            "media",
            false,
            TIP("type"),
          )}
          ${_PromptAssistantModal._field(L("count"), `<input type="text" data-set="count" value="${E(st.count)}" placeholder="auto \xB7 \u2264${_PromptAssistantModal._maxCount()}">`, "count", false, TIP("count"))}
        </div>

        ${_PromptAssistantModal._refSection()}

        <button class="pa-adv-toggle" type="button">${s.advancedOpen ? "\u25BE" : "\u25B8"} ${L("advanced")}</button>

        <div class="pa-adv" style="display:${s.advancedOpen ? "block" : "none"}">
          <div class="pa-grid">
            ${_PromptAssistantModal._field(
              L("language"),
              `<select data-set="language">
              ${O("en", st.language, "English")}${O("vi", st.language, "Ti\u1EBFng Vi\u1EC7t")}${O("source", st.language, L("langSource"))}
            </select>`,
              "language",
              false,
              TIP("language"),
            )}
            ${_PromptAssistantModal._field(
              L("detail"),
              `<select data-set="detail_level">
              ${O("concise", st.detail_level, L("concise"))}${O("detailed", st.detail_level, L("detailed"))}${O("cinematic", st.detail_level, L("cinematic"))}
            </select>`,
              "detail",
              false,
              TIP("detail"),
            )}
            ${_PromptAssistantModal._field(L("style"), `<input type="text" data-set="style" value="${E(st.style)}">`, "style", false, TIP("style"))}
            ${_PromptAssistantModal._field(
              L("aspect"),
              `<div class="pa-aspect">
              ${["16:9", "9:16", "1:1", "4:3", "3:4"].map((r) => `<button type="button" class="pa-ar${st.aspect_ratio === r ? " sel" : ""}" data-aspect="${r}" title="${r}">${_PromptAssistantModal._ratioSvg(r)}<span>${r}</span></button>`).join("")}
            </div>`,
              "aspect",
              true,
              TIP("aspect"),
            )}
            ${_PromptAssistantModal._field(L("lighting"), `<select data-set="lighting">${lightOpt.map(([v, l]) => O(v, st.lighting, l)).join("")}</select>`, "lighting", false, TIP("lighting"))}
            ${_PromptAssistantModal._field(L("camera"), `<select data-set="camera">${camOpt.map(([v, l]) => O(v, st.camera, l)).join("")}</select>`, "camera", false, TIP("camera"))}
            ${
              isVideo
                ? _PromptAssistantModal._field(
                    L("clipDuration"),
                    `<select data-set="clip_duration">
              ${["auto", "4s", "6s", "8s", "10s"].map((r) => O(r, st.clip_duration, r === "auto" ? L("auto") : r)).join("")}
            </select>`,
                    "clock",
                    false,
                    TIP("clip"),
                  )
                : ""
            }
            ${isVideo ? _PromptAssistantModal._field(L("totalDuration"), `<input type="text" data-set="total_duration" value="${E(st.total_duration)}" placeholder="30">`, "clock", false, TIP("total")) : ""}
            ${isVideo ? _PromptAssistantModal._field(L("cameraMotion"), `<select data-set="camera_motion">${motOpt.map(([v, l]) => O(v, st.camera_motion, l)).join("")}</select>`, "motion", false, TIP("motion")) : ""}
            ${isVideo ? _PromptAssistantModal._field(L("audio"), `<select data-set="audio">${audioOpt.map(([v, l]) => O(v, st.audio, l)).join("")}</select>`, "audio", false, TIP("audio")) : ""}
            ${isVideo && (st.audio === "dialogue" || st.audio === "full") ? _PromptAssistantModal._field(L("voice"), `<input type="text" data-set="voice" value="${E(st.voice || "")}" placeholder="${E(L("voicePh"))}">`, "voice", false, TIP("voice")) : ""}
            ${st.media_type === "image" ? _PromptAssistantModal._field(L("totalDuration"), `<input type="text" data-set="total_duration" value="${E(st.total_duration)}" placeholder="60">`, "clock", false, TIP("total")) : ""}
            ${st.media_type === "image" ? _PromptAssistantModal._field(L("secPerImage"), `<input type="text" data-set="seconds_per_image" value="${E(st.seconds_per_image)}" placeholder="5">`, "clock", false, TIP("secimg")) : ""}
            ${_PromptAssistantModal._field(L("tone"), `<input type="text" data-set="tone" value="${E(st.tone === "auto" ? "" : st.tone)}" placeholder="auto">`, "tone", false, TIP("tone"))}
          </div>

          <div class="pa-toggles">
            ${_PromptAssistantModal._toggle("sequential", st.sequential, L("sequential"))}
            ${_PromptAssistantModal._toggle("consistency", st.consistency, L("consistency"))}
            ${_PromptAssistantModal._toggle("numbered", st.numbered, L("numbered"))}
            ${_PromptAssistantModal._toggle("auto_script", st.auto_script, L("autoScript"))}
            ${_PromptAssistantModal._toggle("render_sub", st.render_sub, L("renderSub"))}
          </div>

          <div class="pa-row pa-negwrap">
            <input type="text" class="pa-neg" data-set="negative" value="${E(st.negative || "")}" placeholder="${E(L("negative"))}">
          </div>
        </div>

        ${_PromptAssistantModal._statusHint()}`;
    }
    static _refSection() {
      const s = _PromptAssistantModal._state;
      const E = _PromptAssistantModal._esc;
      return `
        <div class="pa-refsec">
          <div class="pa-reflabel">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g fill="currentColor"><path d="M9 5.62a2.38 2.38 0 1 1 0 4.76 2.38 2.38 0 0 1 0-4.76"></path><path fill-rule="evenodd" d="M16.19 2C19.83 2 22 4.17 22 7.81v8.38c0 3.64-2.17 5.81-5.81 5.81H7.81c-2.39 0-4.157-.94-5.078-2.623l-.172-.347a5 5 0 0 1-.171-.422l-.022-.062C2.126 17.855 2 17.069 2 16.19V7.81C2 4.17 4.17 2 7.81 2zM7.81 3.5C4.99 3.5 3.5 4.99 3.5 7.81v8.38c0 .76.13 1.41.35 1.97l3.74-2.51c.8-.54 1.93-.48 2.64.14l.34.28c.78.67 2.04.67 2.82 0l4.16-3.57c.78-.67 2.04-.67 2.82 0l.13.11v-4.8c0-2.82-1.49-4.31-4.31-4.31z" clip-rule="evenodd"></path></g></svg>
            <span>${L("addRef")}</span>
          </div>
          <div class="pa-refhead">
            <button class="pa-imgbtn pa-imgbtn--wide" title="${E(L("refSelectDrag"))}">
              <svg class="pa-imgbtn-ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 8h.01"/><path d="M12.5 21h-6.5a3 3 0 0 1 -3 -3v-12a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v6.5"/><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l3.5 3.5"/><path d="M14 14l1 -1c.679 -.653 1.473 -.829 2.214 -.526"/><path d="M19 22v-6"/><path d="M22 19l-3 -3l-3 3"/></svg>
              <span>${L("refSelectDrag")}</span>
            </button>
            <span class="pa-refcount">${s.images.length}/${_PromptAssistantModal._MAX_IMAGES}</span>
          </div>
          <div class="pa-imglist"></div>
        </div>`;
    }
    static _footer() {
      const s = _PromptAssistantModal._state;
      if (s.view === "result") {
        const has = (s.result?.prompts || []).length;
        const fillIc =
          '<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M11.8525 4.21651L11.7221 3.2387C11.6906 3.00226 11.4889 2.82568 11.2504 2.82568C11.0118 2.82568 10.8102 3.00226 10.7786 3.23869L10.6483 4.21651C10.2658 7.0847 8.00939 9.34115 5.14119 9.72358L4.16338 9.85396C3.92694 9.88549 3.75037 10.0872 3.75037 10.3257C3.75037 10.5642 3.92694 10.7659 4.16338 10.7974L5.14119 10.9278C8.00938 11.3102 10.2658 13.5667 10.6483 16.4349L10.7786 17.4127C10.8102 17.6491 11.0118 17.8257 11.2504 17.8257C11.4889 17.8257 11.6906 17.6491 11.7221 17.4127L11.8525 16.4349C12.2349 13.5667 14.4913 11.3102 17.3595 10.9278L18.3374 10.7974C18.5738 10.7659 18.7504 10.5642 18.7504 10.3257C18.7504 10.0872 18.5738 9.88549 18.3374 9.85396L17.3595 9.72358C14.4913 9.34115 12.2349 7.0847 11.8525 4.21651Z"></path><path d="M4.6519 14.7568L4.82063 14.2084C4.84491 14.1295 4.91781 14.0757 5.00037 14.0757C5.08292 14.0757 5.15582 14.1295 5.1801 14.2084L5.34883 14.7568C5.56525 15.4602 6.11587 16.0108 6.81925 16.2272L7.36762 16.3959C7.44652 16.4202 7.50037 16.4931 7.50037 16.5757C7.50037 16.6582 7.44652 16.7311 7.36762 16.7554L6.81926 16.9241C6.11587 17.1406 5.56525 17.6912 5.34883 18.3946L5.1801 18.9429C5.15582 19.0218 5.08292 19.0757 5.00037 19.0757C4.91781 19.0757 4.84491 19.0218 4.82063 18.9429L4.65191 18.3946C4.43548 17.6912 3.88486 17.1406 3.18147 16.9241L2.63311 16.7554C2.55421 16.7311 2.50037 16.6582 2.50037 16.5757C2.50037 16.4931 2.55421 16.4202 2.63311 16.3959L3.18148 16.2272C3.88486 16.0108 4.43548 15.4602 4.6519 14.7568Z"></path></svg>';
        const fillBtns =
          s.settings.media_type === "pair"
            ? `<button class="pa-fill" data-kind="image" ${has ? "" : "disabled"}>${fillIc}${L("fillImages")}</button>
          <button class="pa-fill" data-kind="video" ${has ? "" : "disabled"}>${fillIc}${L("fillVideos")}</button>`
            : `<button class="pa-fill" ${has ? "" : "disabled"}>${fillIc}${L("fillGen")}</button>`;
        const hasSub = !!_PromptAssistantModal._buildSrt();
        return `${fillBtns}
          <button class="pa-copy" ${has ? "" : "disabled"}>${L("copy")}</button>
          ${hasSub ? `<button class="pa-copysrt">${L("copySrt")}</button>` : ""}
          <button class="pa-back">${L("back")}</button>`;
      }
      const sparkle =
        '<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path d="M11.8525 4.21651L11.7221 3.2387C11.6906 3.00226 11.4889 2.82568 11.2504 2.82568C11.0118 2.82568 10.8102 3.00226 10.7786 3.23869L10.6483 4.21651C10.2658 7.0847 8.00939 9.34115 5.14119 9.72358L4.16338 9.85396C3.92694 9.88549 3.75037 10.0872 3.75037 10.3257C3.75037 10.5642 3.92694 10.7659 4.16338 10.7974L5.14119 10.9278C8.00938 11.3102 10.2658 13.5667 10.6483 16.4349L10.7786 17.4127C10.8102 17.6491 11.0118 17.8257 11.2504 17.8257C11.4889 17.8257 11.6906 17.6491 11.7221 17.4127L11.8525 16.4349C12.2349 13.5667 14.4913 11.3102 17.3595 10.9278L18.3374 10.7974C18.5738 10.7659 18.7504 10.5642 18.7504 10.3257C18.7504 10.0872 18.5738 9.88549 18.3374 9.85396L17.3595 9.72358C14.4913 9.34115 12.2349 7.0847 11.8525 4.21651Z"></path><path d="M4.6519 14.7568L4.82063 14.2084C4.84491 14.1295 4.91781 14.0757 5.00037 14.0757C5.08292 14.0757 5.15582 14.1295 5.1801 14.2084L5.34883 14.7568C5.56525 15.4602 6.11587 16.0108 6.81925 16.2272L7.36762 16.3959C7.44652 16.4202 7.50037 16.4931 7.50037 16.5757C7.50037 16.6582 7.44652 16.7311 7.36762 16.7554L6.81926 16.9241C6.11587 17.1406 5.56525 17.6912 5.34883 18.3946L5.1801 18.9429C5.15582 19.0218 5.08292 19.0757 5.00037 19.0757C4.91781 19.0757 4.84491 19.0218 4.82063 18.9429L4.65191 18.3946C4.43548 17.6912 3.88486 17.1406 3.18147 16.9241L2.63311 16.7554C2.55421 16.7311 2.50037 16.6582 2.50037 16.5757C2.50037 16.4931 2.55421 16.4202 2.63311 16.3959L3.18148 16.2272C3.88486 16.0108 4.43548 15.4602 4.6519 14.7568Z"></path></svg>';
      return `<button class="pa-generate" ${s.sending || !s.idea.trim() ? "disabled" : ""}>
          ${s.sending ? `<span class="pa-spinner"></span> ${L("generating")}` : `${sparkle}${L("generate")}`}
        </button>
        ${s.sending ? `<button class="pa-cancel-gen">${L("cancel")}</button>` : ""}`;
    }
    static _statusHint() {
      const s = _PromptAssistantModal._state;
      const cur = s.status?.[s.provider];
      if (!s.status || cur?.ready) return "";
      const name = s.provider === "gemini" ? "Gemini" : "ChatGPT";
      const msg = cur?.tabOpen ? L("notLogged") : L("noTab");
      return `<div class="pa-hint">${name} ${msg} \xB7 <button class="pa-openlogin">${L("openTab")}</button></div>`;
    }
    static _formResult() {
      const s = _PromptAssistantModal._state;
      const list = s.result?.prompts || [];
      const numbered = s.settings.numbered;
      return `
        <div class="pa-result-head">${L("resultCount")} ${list.length} ${L("resultUnit")}</div>
        <div class="pa-result-list">
          ${
            list
              .map((p, i) => {
                const sp = _PromptAssistantModal._splitSub(p);
                return `<div class="pa-result-item">${numbered ? `<span class="pa-num">${i + 1}.</span>` : ""}<div class="pa-pcol">${sp.sub ? `<div class="pa-sub">${_PromptAssistantModal._esc(sp.sub)}</div>` : ""}<span class="pa-ptext">${_PromptAssistantModal._esc(_PromptAssistantModal._stripNumbering(sp.body))}</span></div></div>`;
              })
              .join("") || `<div class="pa-hint">${L("empty")}</div>`
          }
        </div>`;
    }
    static _maxCount() {
      const m = parseInt(_PromptAssistantModal._state?.config?.maxCount, 10);
      return m && m > 0 ? m : 50;
    }
    static _sanitizeCount(v) {
      v = String(v == null ? "" : v)
        .trim()
        .toLowerCase();
      if (v === "" || v === "auto") return "auto";
      const n = parseInt(v, 10);
      if (isNaN(n) || n < 1) return "auto";
      return String(Math.min(n, _PromptAssistantModal._maxCount()));
    }
    static _sanitizeDuration(v) {
      v = String(v == null ? "" : v).trim();
      if (v === "") return "";
      const n = parseInt(v, 10);
      if (isNaN(n) || n < 1) return "";
      return String(Math.min(n, 600));
    }
    static _sanitizeSecPerImage(v) {
      v = String(v == null ? "" : v).trim();
      if (v === "") return "";
      const n = parseInt(v, 10);
      if (isNaN(n) || n < 1) return "";
      return String(Math.min(n, 60));
    }
    static _field(label, control, iconName, full, tip) {
      const ic = iconName ? _PromptAssistantModal._fieldIcon(iconName) : "";
      const t = tip
        ? ` data-tooltip="${_PromptAssistantModal._esc(tip)}" data-tooltip-align="auto"`
        : "";
      return `<div class="pa-f${full ? " pa-f--full" : ""}"><label${t}>${ic}<span>${label}</span></label>${control}</div>`;
    }
    static _toggle(key, on, label) {
      return `<label class="pa-tg"><input type="checkbox" data-toggle="${key}"${on ? " checked" : ""}><span>${label}</span></label>`;
    }
    static _fieldIcon(name) {
      const P = {
        media:
          '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.6-3.6a2 2 0 0 0-2.8 0L6 21"/>',
        count:
          '<line x1="10" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="10" y1="18" x2="20" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/>',
        language:
          '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20"/>',
        detail:
          '<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="9" y2="18"/>',
        style:
          '<path d="M2 12a10 10 0 1 0 10-10c5 0 8 3.6 8 8 0 3.3-2.7 6-6 6h-2a1.6 1.6 0 0 0-1.6 1.6c0 .5.2.8.4 1.1.3.3.4.7.4 1.1A1.6 1.6 0 0 1 12 22"/><circle cx="8.5" cy="8" r="1"/><circle cx="13.5" cy="6.5" r="1"/><circle cx="16.5" cy="11" r="1"/>',
        aspect: '<rect x="3" y="5" width="18" height="14" rx="2"/>',
        lighting:
          '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
        camera:
          '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
        clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
        motion: '<polygon points="6 4 20 12 6 20 6 4"/>',
        audio:
          '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/>',
        tone: '<path d="M3 11h3l2-7 4 14 2-7h4"/>',
        voice:
          '<path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="19" x2="12" y2="22"/>',
      };
      const d = P[name];
      return d
        ? `<svg class="pa-f-ic" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`
        : "";
    }
    static _ratioSvg(r) {
      const [a, b] = String(r).split(":").map(Number);
      const max = 18;
      let w, h;
      if (!a || !b) {
        w = h = 16;
      } else if (a >= b) {
        w = max;
        h = (max * b) / a;
      } else {
        h = max;
        w = (max * a) / b;
      }
      const x = (24 - w) / 2,
        y = (24 - h) / 2;
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5"/></svg>`;
    }
    static _bind() {
      const ov = _PromptAssistantModal._overlay;
      if (!ov) return;
      const s = _PromptAssistantModal._state;
      ov.querySelector(".pa-close")?.addEventListener("click", () =>
        _PromptAssistantModal.close(),
      );
      if (_PromptAssistantModal._esc2)
        document.removeEventListener("keydown", _PromptAssistantModal._esc2);
      _PromptAssistantModal._esc2 = (e) => {
        if (e.key === "Escape") _PromptAssistantModal.close();
      };
      document.addEventListener("keydown", _PromptAssistantModal._esc2);
      ov.querySelector(".pa-idea")?.addEventListener("input", (e) => {
        s.idea = e.target.value;
        const g = ov.querySelector(".pa-generate");
        if (g) g.disabled = s.sending || !s.idea.trim();
        const srt = _PromptAssistantModal._parseSrt(s.idea);
        let badge = ov.querySelector(".pa-srt-badge");
        if (srt) {
          if (!badge) {
            badge = document.createElement("div");
            badge.className = "pa-srt-badge";
            e.target.insertAdjacentElement("afterend", badge);
          }
          badge.textContent = L("srtDetected")
            .replace("{n}", srt.cues.length)
            .replace("{dur}", Math.round(srt.totalDur));
        } else if (badge) {
          badge.remove();
        }
      });
      ov.querySelectorAll(".pa-pv").forEach((el) =>
        el.addEventListener("click", () => {
          s.provider = el.dataset.prov;
          _PromptAssistantModal._render();
          _PromptAssistantModal._refreshStatus();
        }),
      );
      ov.querySelectorAll("[data-set]").forEach((el) =>
        el.addEventListener("change", () => {
          const k = el.dataset.set;
          let v = el.value;
          if (k === "count") {
            const _before = String(v).trim();
            v = _PromptAssistantModal._sanitizeCount(v);
            el.value = v;
            const _max = _PromptAssistantModal._maxCount();
            if (/^\d+$/.test(_before) && parseInt(_before, 10) > _max) {
              window.showNotification?.(
                L("countCapped").replace(/\{max\}/g, _max),
                "warning",
                2800,
              );
            }
          } else if (k === "total_duration") {
            v = _PromptAssistantModal._sanitizeDuration(v);
            el.value = v;
          } else if (k === "seconds_per_image") {
            v = _PromptAssistantModal._sanitizeSecPerImage(v);
            el.value = v;
          }
          s.settings[k] = v;
          if (k === "media_type" || k === "audio")
            _PromptAssistantModal._render();
        }),
      );
      ov.querySelectorAll("[data-toggle]").forEach((el) =>
        el.addEventListener("change", () => {
          s.settings[el.dataset.toggle] = el.checked;
        }),
      );
      ov.querySelectorAll(".pa-ar").forEach((b) =>
        b.addEventListener("click", () => {
          s.settings.aspect_ratio = b.dataset.aspect;
          ov.querySelectorAll(".pa-ar").forEach((x) =>
            x.classList.toggle("sel", x === b),
          );
        }),
      );
      const tabsWrap = ov.querySelector(".pa-fmt-tabs-wrap");
      const tabsEl = ov.querySelector(".pa-fmt-tabs");
      const moreBtn = ov.querySelector(".pa-fmt-tabs-more");
      const selectCat = (cat) => {
        s.formatCategory = cat;
        _PromptAssistantModal._render();
      };
      ov.querySelectorAll(".pa-fmt-tab").forEach((el) =>
        el.addEventListener("click", () => {
          if (tabsEl?.classList.contains("pa-just-dragged")) return;
          selectCat(el.dataset.cat);
        }),
      );
      if (tabsEl) {
        let down = false,
          sx = 0,
          sl = 0,
          moved = false;
        tabsEl.addEventListener("pointerdown", (e) => {
          if (e.pointerType === "touch") return;
          down = true;
          moved = false;
          sx = e.clientX;
          sl = tabsEl.scrollLeft;
        });
        tabsEl.addEventListener("pointermove", (e) => {
          if (!down) return;
          const dx = e.clientX - sx;
          if (!moved && Math.abs(dx) > 4) {
            moved = true;
            tabsEl.classList.add("dragging");
          }
          if (moved) tabsEl.scrollLeft = sl - dx;
        });
        const endDrag = () => {
          if (!down) return;
          down = false;
          tabsEl.classList.remove("dragging");
          if (moved) {
            tabsEl.classList.add("pa-just-dragged");
            setTimeout(() => tabsEl.classList.remove("pa-just-dragged"), 50);
          }
        };
        tabsEl.addEventListener("pointerup", endDrag);
        tabsEl.addEventListener("pointerleave", endDrag);
        const overflow = tabsEl.scrollWidth - tabsEl.clientWidth > 2;
        if (moreBtn) moreBtn.hidden = !overflow;
        tabsWrap?.classList.toggle("overflow", overflow);
      }
      if (moreBtn)
        moreBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const old = ov.querySelector(".pa-fmt-tabs-menu");
          if (old) {
            old.remove();
            return;
          }
          const menu = document.createElement("div");
          menu.className = "pa-fmt-tabs-menu";
          const cats = [...ov.querySelectorAll(".pa-fmt-tab")].map((t) => ({
            cat: t.dataset.cat,
            label: t.textContent,
            sel: t.classList.contains("sel"),
          }));
          menu.innerHTML = cats
            .map(
              (c) =>
                `<button class="pa-fmt-tabs-menu-item${c.sel ? " sel" : ""}" data-cat="${_PromptAssistantModal._esc(c.cat)}">${_PromptAssistantModal._esc(c.label)}</button>`,
            )
            .join("");
          ov.appendChild(menu);
          const r = moreBtn.getBoundingClientRect();
          menu.style.top = r.bottom + 4 + "px";
          menu.style.right = window.innerWidth - r.right + "px";
          menu.querySelectorAll(".pa-fmt-tabs-menu-item").forEach((it) =>
            it.addEventListener("click", () => {
              menu.remove();
              selectCat(it.dataset.cat);
            }),
          );
          const closeMenu = (ev) => {
            if (!menu.contains(ev.target) && ev.target !== moreBtn) {
              menu.remove();
              document.removeEventListener("click", closeMenu, true);
            }
          };
          setTimeout(
            () => document.addEventListener("click", closeMenu, true),
            0,
          );
        });
      ov.querySelectorAll(".pa-fmt").forEach((el) =>
        el.addEventListener("click", async () => {
          if (el.dataset.locked === "1") {
            if (window.customDialog?.confirm) {
              const shouldUpgrade = await window.customDialog.confirm(
                L("premiumNeed"),
                {
                  title: L("premiumTitle"),
                  type: "warning",
                  confirmText: window.I18n?.t("common.upgrade") || "Upgrade",
                  cancelText: window.I18n?.t("common.later") || "Later",
                },
              );
              if (
                shouldUpgrade &&
                typeof window.openUpgradeModal === "function"
              )
                window.openUpgradeModal();
            } else if (typeof window.openUpgradeModal === "function") {
              window.openUpgradeModal();
            } else {
              _PromptAssistantModal._err(L("premiumNeed"));
            }
            return;
          }
          _PromptAssistantModal._applyFormat(el.dataset.fmt);
        }),
      );
      let tip = document.body.querySelector(".pa-fmt-tip");
      if (!tip) {
        tip = document.createElement("div");
        tip.className = "pa-fmt-tip";
        tip.innerHTML = '<video muted loop playsinline preload="none"></video>';
        document.body.appendChild(tip);
      }
      _PromptAssistantModal._fmtTip = tip;
      const tipVid = tip.querySelector("video");
      const hideTip = () => {
        tip.classList.remove("show");
        try {
          tipVid.pause();
          tipVid.removeAttribute("src");
          tipVid.load();
        } catch (_) {}
      };
      const showTip = (chip) => {
        const vurl = chip.dataset.video;
        if (!vurl) {
          hideTip();
          return;
        }
        if (tipVid.src !== vurl) tipVid.src = vurl;
        tipVid.poster = chip.dataset.thumb || "";
        try {
          tipVid.currentTime = 0;
          const p = tipVid.play();
          if (p && p.catch) p.catch(() => {});
        } catch (_) {}
        tip.classList.add("show");
        const r = chip.getBoundingClientRect();
        const halfW = (tip.offsetWidth || 100) / 2;
        const cx = Math.max(
          halfW + 6,
          Math.min(r.left + r.width / 2, window.innerWidth - halfW - 6),
        );
        tip.style.left = cx + "px";
        tip.style.top = r.top + "px";
      };
      ov.querySelectorAll(".pa-fmt").forEach((el) => {
        el.addEventListener("mouseenter", () => showTip(el));
        el.addEventListener("mouseleave", hideTip);
      });
      const fmts = ov.querySelector(".pa-formats");
      if (fmts) {
        let down = false,
          startX = 0,
          startScroll = 0,
          moved = false;
        fmts.addEventListener("scroll", hideTip);
        fmts.addEventListener(
          "wheel",
          (e) => {
            if (fmts.scrollWidth - fmts.clientWidth <= 1) return;
            const delta =
              Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
            if (!delta) return;
            e.preventDefault();
            fmts.scrollLeft += delta;
            hideTip();
          },
          { passive: false },
        );
        fmts.addEventListener("pointerdown", (e) => {
          if (e.pointerType === "touch") return;
          down = true;
          moved = false;
          startX = e.clientX;
          startScroll = fmts.scrollLeft;
          hideTip();
        });
        fmts.addEventListener("pointermove", (e) => {
          if (!down) return;
          const dx = e.clientX - startX;
          if (!moved && Math.abs(dx) > 4) {
            moved = true;
            fmts.classList.add("dragging");
          }
          if (moved) fmts.scrollLeft = startScroll - dx;
        });
        const end = () => {
          if (!down) return;
          down = false;
          fmts.classList.remove("dragging");
        };
        fmts.addEventListener("pointerup", end);
        fmts.addEventListener("pointerleave", end);
        fmts.addEventListener(
          "click",
          (e) => {
            if (moved) {
              e.stopPropagation();
              e.preventDefault();
              moved = false;
            }
          },
          true,
        );
      }
      ov.querySelector(".pa-adv-toggle")?.addEventListener("click", () => {
        s.advancedOpen = !s.advancedOpen;
        _PromptAssistantModal._render();
      });
      ov.querySelector(".pa-imgbtn")?.addEventListener("click", () =>
        _PromptAssistantModal._onSelectImage(),
      );
      const refsec = ov.querySelector(".pa-refsec");
      if (refsec) {
        refsec.addEventListener("dragover", (e) => {
          e.preventDefault();
          e.stopPropagation();
          refsec.classList.add("drag-over");
        });
        refsec.addEventListener("dragleave", (e) => {
          if (!refsec.contains(e.relatedTarget))
            refsec.classList.remove("drag-over");
        });
        refsec.addEventListener("drop", (e) => {
          e.preventDefault();
          e.stopPropagation();
          refsec.classList.remove("drag-over");
          _PromptAssistantModal._addLocalFiles(
            Array.from(e.dataTransfer?.files || []),
          );
        });
      }
      ov.querySelector(".pa-openlogin")?.addEventListener("click", async () => {
        await _PromptAssistantModal._bg({
          action: "i2p:openProviderLogin",
          provider: s.provider,
        });
        setTimeout(() => _PromptAssistantModal._refreshStatus(), 1500);
      });
      ov.querySelector(".pa-generate")?.addEventListener("click", () =>
        _PromptAssistantModal._onGenerate(),
      );
      ov.querySelector(".pa-cancel-gen")?.addEventListener("click", () => {
        _PromptAssistantModal._bg({
          action: "i2p:cancel",
          provider: s.provider,
        });
        s.sending = false;
        _PromptAssistantModal._render();
      });
      ov.querySelectorAll(".pa-fill").forEach((b) =>
        b.addEventListener("click", () =>
          _PromptAssistantModal._fillGen(false, b.dataset.kind || void 0),
        ),
      );
      ov.querySelector(".pa-copy")?.addEventListener("click", (e) => {
        const txt = _PromptAssistantModal._promptsText();
        try {
          navigator.clipboard.writeText(txt);
        } catch (_) {}
        e.target.textContent = L("copied");
        setTimeout(() => {
          if (e.target.isConnected) e.target.textContent = L("copy");
        }, 1500);
      });
      ov.querySelector(".pa-copysrt")?.addEventListener("click", (e) => {
        const srt = _PromptAssistantModal._buildSrt();
        if (!srt) return;
        try {
          navigator.clipboard.writeText(srt);
        } catch (_) {}
        e.target.textContent = L("copied");
        setTimeout(() => {
          if (e.target.isConnected) e.target.textContent = L("copySrt");
        }, 1500);
      });
      ov.querySelector(".pa-back")?.addEventListener("click", () => {
        s.view = "form";
        _PromptAssistantModal._render();
      });
    }
    static async _refreshStatus() {
      const r = await _PromptAssistantModal._bg({
        action: "i2p:checkProviders",
      });
      const s = _PromptAssistantModal._state;
      if (!s || !r?.ok) return;
      const changed =
        JSON.stringify(s.status || {}) !== JSON.stringify(r.providers || {});
      s.status = r.providers;
      if (changed && s.view === "form")
        _PromptAssistantModal._renderPreserveIdea();
    }
    static _renderPreserveIdea() {
      const ov = _PromptAssistantModal._overlay;
      const idea = ov && ov.querySelector(".pa-idea");
      const focused = !!idea && document.activeElement === idea;
      const ss = idea ? idea.selectionStart : null,
        se = idea ? idea.selectionEnd : null;
      _PromptAssistantModal._render();
      if (focused) {
        const ni =
          _PromptAssistantModal._overlay &&
          _PromptAssistantModal._overlay.querySelector(".pa-idea");
        if (ni) {
          ni.focus();
          try {
            ni.setSelectionRange(
              ss == null ? ni.value.length : ss,
              se == null ? ni.value.length : se,
            );
          } catch (_) {}
        }
      }
    }
    static _startStatusPoll() {
      _PromptAssistantModal._stopStatusPoll();
      _PromptAssistantModal._statusTimer = setInterval(() => {
        const s = _PromptAssistantModal._state;
        if (!s || s.view !== "form" || s.sending) return;
        _PromptAssistantModal._refreshStatus();
      }, 3500);
      _PromptAssistantModal._focusHandler = () => {
        const s = _PromptAssistantModal._state;
        if (s && s.view === "form" && !s.sending)
          _PromptAssistantModal._refreshStatus();
      };
      window.addEventListener("focus", _PromptAssistantModal._focusHandler);
    }
    static _stopStatusPoll() {
      if (_PromptAssistantModal._statusTimer) {
        clearInterval(_PromptAssistantModal._statusTimer);
        _PromptAssistantModal._statusTimer = null;
      }
      if (_PromptAssistantModal._focusHandler) {
        window.removeEventListener(
          "focus",
          _PromptAssistantModal._focusHandler,
        );
        _PromptAssistantModal._focusHandler = null;
      }
    }
    static _onSelectImage() {
      const s = _PromptAssistantModal._state;
      if (s.images.length >= _PromptAssistantModal._MAX_IMAGES) return;
      if (window.ImagePickerModal || window.imagePickerModal) {
        const picker = window.imagePickerModal || new window.ImagePickerModal();
        const remaining = _PromptAssistantModal._MAX_IMAGES - s.images.length;
        picker.open({
          singleSelect: false,
          maxSelections: remaining,
          existingFileIds: [],
          onConfirm: (sel) => _PromptAssistantModal._addImages(sel),
        });
        return;
      }
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.multiple = true;
      input.style.display = "none";
      document.body.appendChild(input);
      input.addEventListener("change", () => {
        _PromptAssistantModal._addLocalFiles(Array.from(input.files || []));
        input.remove();
      });
      input.click();
    }
    static _addLocalFiles(files) {
      const s = _PromptAssistantModal._state;
      if (!s) return;
      (files || []).forEach((file) => {
        if (s.images.length >= _PromptAssistantModal._MAX_IMAGES) return;
        if (!file.type || !file.type.startsWith("image/")) return;
        const url = URL.createObjectURL(file);
        s.images.push({
          blob: file,
          blobUrl: url,
          thumbnail: url,
          name: file.name,
          type: file.type,
          source: "local",
        });
      });
      _PromptAssistantModal._renderImages();
    }
    static _addImages(sel) {
      const s = _PromptAssistantModal._state;
      (sel || []).forEach((img) => {
        if (s.images.length >= _PromptAssistantModal._MAX_IMAGES) return;
        const entry = {
          blob: img.blob || null,
          blobUrl: img.thumbnail || "",
          thumbnail: img.thumbnail || "",
          name: img.fileId || img.name || "image",
          type: img.type || "image/png",
          source: img.source || "flow",
        };
        if (!entry.blob && entry.thumbnail) {
          _PromptAssistantModal._fetchBlob(entry.thumbnail).then((b) => {
            if (b) {
              entry.blob = b;
              entry.type = b.type || "image/png";
            }
          });
        }
        s.images.push(entry);
      });
      _PromptAssistantModal._renderImages();
    }
    static async _fetchBlob(url) {
      try {
        const r = await fetch(url);
        if (r.ok) return await r.blob();
      } catch (_) {}
      return null;
    }
    static _renderImages() {
      const ov = _PromptAssistantModal._overlay;
      if (!ov) return;
      const list = ov.querySelector(".pa-imglist");
      if (!list) return;
      const imgs = _PromptAssistantModal._state.images;
      const cnt = ov.querySelector(".pa-refcount");
      if (cnt)
        cnt.textContent = `${imgs.length}/${_PromptAssistantModal._MAX_IMAGES}`;
      list.innerHTML = imgs
        .map(
          (img, i) => `
        <div class="pa-thumb" title="${_PromptAssistantModal._esc(img.name || "")}">
          <img src="${_PromptAssistantModal._esc(img.thumbnail || img.blobUrl || "")}" alt="">
          <button class="pa-thumb-x" data-i="${i}" title="${_PromptAssistantModal._esc(L("removeImg"))}">\u2715</button>
        </div>`,
        )
        .join("");
      list.querySelectorAll(".pa-thumb img").forEach((im) =>
        im.addEventListener("error", () => {
          im.style.display = "none";
          im.parentElement.classList.add("broken");
        }),
      );
      list.querySelectorAll(".pa-thumb-x").forEach((b) =>
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          const i = parseInt(b.dataset.i, 10);
          const rm = _PromptAssistantModal._state.images.splice(i, 1);
          if (rm[0]?.blobUrl && rm[0].source === "local")
            URL.revokeObjectURL(rm[0].blobUrl);
          _PromptAssistantModal._renderImages();
        }),
      );
    }
    static _showGenConfirm(provName) {
      return new Promise((resolve) => {
        const s = _PromptAssistantModal._state;
        const st = s.status?.[s.provider];
        const ready = !!st?.ready;
        const logo = window.ProviderBrandIcons?.get?.(s.provider) || "";
        const iconCheck =
          '<svg class="badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
        const iconWarn =
          '<svg class="badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
        const badgeCls = ready ? "is-ready" : "is-warning";
        const badgeIcon = ready ? iconCheck : iconWarn;
        const badgeText = ready
          ? L("ready") || "Ready"
          : st?.tabOpen
            ? L("notLogged")
            : L("noTab");
        const overlay = document.createElement("div");
        overlay.className = "confirm-run-overlay pa-gen-confirm";
        overlay.innerHTML = `
          <div class="confirm-run-modal" style="min-width:300px;">
            <div class="confirm-run-header">
              <span class="confirm-run-title">${L("confirmGenTitle").replace("{provider}", provName)}</span>
              <button class="confirm-run-close" id="paGenConfirmClose" title="${L("close")}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div class="confirm-run-body">
              <div class="confirm-run-provider-status">
                <span class="confirm-provider-info">
                  <span class="confirm-provider-logo">${logo}</span>
                  <span class="confirm-run-provider-label">${provName}</span>
                </span>
                <span class="confirm-run-provider-badge ${badgeCls}">${badgeIcon}<span class="badge-text">${badgeText}</span></span>
              </div>
              <p class="pa-gen-confirm-msg">${L("confirmGenMsg").replace("{provider}", provName)}</p>
            </div>
            <div class="confirm-run-footer">
              <button class="btn btn-secondary" id="paGenConfirmCancel">${L("cancel")}</button>
              <button class="btn btn-primary" id="paGenConfirmRun">${L("generate")}</button>
            </div>
          </div>`;
        document.body.appendChild(overlay);
        setTimeout(() => overlay.classList.add("visible"), 10);
        let done = false;
        const finish = (val) => {
          if (done) return;
          done = true;
          overlay.remove();
          resolve(val);
        };
        overlay
          .querySelector("#paGenConfirmClose")
          ?.addEventListener("click", () => finish(false));
        overlay
          .querySelector("#paGenConfirmCancel")
          ?.addEventListener("click", () => finish(false));
        overlay
          .querySelector("#paGenConfirmRun")
          ?.addEventListener("click", () => finish(true));
      });
    }
    static _blobToB64(blob) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onloadend = () => resolve(r.result.split(",")[1] || r.result);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
    }
    static async _onGenerate() {
      const s = _PromptAssistantModal._state;
      if (s.sending || !s.idea.trim()) return;
      const meta = _PromptAssistantModal._buildMetaPrompt();
      if (!meta) {
        _PromptAssistantModal._err(L("errConfig"));
        return;
      }
      const provName = s.provider === "gemini" ? "Gemini" : "ChatGPT";
      try {
        _PromptAssistantModal._bg({
          action: "pa:activateTab",
          provider: s.provider,
        });
      } catch (_) {}
      const ok = await _PromptAssistantModal._showGenConfirm(provName);
      if (!ok || !_PromptAssistantModal._state) return;
      s.sending = true;
      _PromptAssistantModal._render();
      try {
        const images = [];
        for (const img of s.images) {
          if (img.blob)
            images.push({
              base64: await _PromptAssistantModal._blobToB64(img.blob),
              name: img.name || "ref",
              type: img.type || "image/png",
            });
        }
        window.UsageSync?.trackEvent("pa_generate", { provider: s.provider });
        const resp = await _PromptAssistantModal._bg({
          action: "pa:generate",
          provider: s.provider,
          metaPrompt: meta,
          images,
          deleteAfter: !!s.settings.delete_after,
          timeout: 6e5,
        });
        if (!_PromptAssistantModal._state) return;
        s.sending = false;
        if (!resp || !resp.success) {
          _PromptAssistantModal._render();
          _PromptAssistantModal._err(
            `${L("errProvider")}${resp?.error ? ` (${resp.error})` : ""}`,
          );
          return;
        }
        const prompts = _PromptAssistantModal._mergeSubBlocks(
          _PromptAssistantModal._parsePrompts(
            resp.text || "",
            resp.sourceFileNames,
          ),
        );
        if (!prompts.length) {
          _PromptAssistantModal._render();
          _PromptAssistantModal._err(L("empty"));
          return;
        }
        s.result = { raw: resp.text, prompts };
        s.view = "result";
        _PromptAssistantModal._render();
        if (resp.cleanupReceipt?.provider === "chatgpt") {
          _PromptAssistantModal
            ._bg({
              action: "chatgpt:completeDeferredCleanup",
              tabId: resp.cleanupReceipt.tabId,
              expectedConversationUrl:
                resp.cleanupReceipt.expectedConversationUrl,
            })
            .then((cleanup) => {
              if (!cleanup?.success)
                console.warn(
                  "[PA] deferred ChatGPT cleanup warning:",
                  cleanup?.error || "DELETE_FAILED",
                );
            })
            .catch((error) =>
              console.warn(
                "[PA] deferred ChatGPT cleanup error:",
                error?.message || error,
              ),
            );
        }
      } catch (e) {
        if (!_PromptAssistantModal._state) return;
        s.sending = false;
        _PromptAssistantModal._render();
        _PromptAssistantModal._err(e.message || "Error");
      }
    }
    static async _fillGen(silent, kind) {
      const s = _PromptAssistantModal._state;
      const text = _PromptAssistantModal._promptsText(kind, true);
      if (!text) return;
      if (kind === "image" || kind === "video") {
        try {
          const gt = document.getElementById("genType");
          if (gt) {
            gt.value = kind === "video" ? "Video" : "Image";
            gt.dispatchEvent(new Event("change", { bubbles: true }));
          }
        } catch (_) {}
      }
      const r = window._setGenPromptInternal?.(text);
      if (r?.success) {
        let added = 0;
        if (
          kind !== "video" &&
          s.images?.length &&
          window.GenTab?.addUploadRefImages
        ) {
          try {
            const items = await _PromptAssistantModal._refImagesForGen();
            if (!_PromptAssistantModal._state) return;
            added = window.GenTab.addUploadRefImages(items) || 0;
          } catch (_) {}
        }
        const n = text.split(/\n\s*\n/).filter(Boolean).length;
        const base = L("toastFilled").replace("{n}", n);
        const msg = added
          ? `${base} + ${added} ${L("addRef").toLowerCase()}`
          : base;
        window.showNotification?.(msg, "success", 3e3);
        if (!silent) _PromptAssistantModal.close();
      } else if (!silent) {
        _PromptAssistantModal._err(L("errFill"));
      }
    }
    static async _refImagesForGen() {
      const s = _PromptAssistantModal._state;
      const out = [];
      for (const img of s.images || []) {
        let file = img.blob || null;
        if (file && !(file instanceof File))
          file = new File([file], img.name || "ref.png", {
            type: img.type || "image/png",
          });
        if (!file && (img.thumbnail || img.blobUrl)) {
          const b = await _PromptAssistantModal._fetchBlob(
            img.thumbnail || img.blobUrl,
          );
          if (b)
            file = new File([b], img.name || "ref.png", {
              type: b.type || img.type || "image/png",
            });
        }
        if (file)
          out.push({
            file,
            thumbnail: img.thumbnail || img.blobUrl || "",
            type: img.type || "image/png",
          });
      }
      return out;
    }
    static _err(msg) {
      if (window.customDialog)
        window.customDialog.alert(msg, { title: L("title"), type: "error" });
      else alert(msg);
    }
    static _cleanup() {
      _PromptAssistantModal._stopStatusPoll();
      const s = _PromptAssistantModal._state;
      if (s) {
        for (const img of s.images) {
          if (img.blobUrl && img.source === "local")
            URL.revokeObjectURL(img.blobUrl);
        }
      }
      if (_PromptAssistantModal._esc2) {
        document.removeEventListener("keydown", _PromptAssistantModal._esc2);
        _PromptAssistantModal._esc2 = null;
      }
      if (window.eventBus) {
        if (_PromptAssistantModal._onFormatsUpdated)
          window.eventBus.off?.(
            "pa:formats_updated",
            _PromptAssistantModal._onFormatsUpdated,
          );
        if (_PromptAssistantModal._onEntitlements)
          window.eventBus.off?.(
            "sse:entitlements_changed",
            _PromptAssistantModal._onEntitlements,
          );
      }
      _PromptAssistantModal._onFormatsUpdated = null;
      _PromptAssistantModal._onEntitlements = null;
      if (_PromptAssistantModal._fmtTip) {
        _PromptAssistantModal._fmtTip.remove();
        _PromptAssistantModal._fmtTip = null;
      }
      _PromptAssistantModal._state = null;
    }
  };
  __publicField(_PromptAssistantModal, "_overlay", null);
  __publicField(_PromptAssistantModal, "_state", null);
  __publicField(_PromptAssistantModal, "_MAX_IMAGES", 5);
  __publicField(_PromptAssistantModal, "_TRANSPORT_BEGIN", "TOBY_PA_BEGIN");
  __publicField(_PromptAssistantModal, "_TRANSPORT_NEXT", "<<<TOBY_PA_NEXT>>>");
  __publicField(_PromptAssistantModal, "_TRANSPORT_END", "TOBY_PA_END");
  let PromptAssistantModal = _PromptAssistantModal;
  window.PromptAssistantModal = PromptAssistantModal;
})();
