(function () {
  if (window._tobyflowRefBridge) return;
  window._tobyflowRefBridge = true;
  try {
    let code = null;
    try {
      code = new URL(location.href).searchParams.get("ref");
    } catch (_) {}
    if (!code) {
      try {
        code = localStorage.getItem("tf_ref");
      } catch (_) {}
    }
    if (code && /^[A-Za-z0-9_\-]{4,40}$/.test(code)) {
      try {
        localStorage.setItem("tf_ref", code);
      } catch (_) {}
      chrome.runtime.sendMessage(
        { action: "affiliate:setRef", code },
        function () {
          void chrome.runtime.lastError;
        },
      );
    }
  } catch (_) {}
  try {
    window.addEventListener(
      "message",
      function (event) {
        if (event.source !== window || event.origin !== location.origin) return;
        var d = event.data;
        if (!d || typeof d !== "object" || d.source !== "tobyflow-web") return;
        if (d.type === "ping") {
          console.log("[TobyFlow ref-bridge] ping \u2192 pong");
          try {
            window.postMessage(
              { source: "tobyflow-ext", type: "pong" },
              location.origin,
            );
          } catch (_) {}
          return;
        }
        if (d.type === "useWorkflowTemplate") {
          var useId = d.templateId;
          if (useId === void 0 || useId === null || useId === "") return;
          var useTpl =
            d.template && typeof d.template === "object" ? d.template : null;
          console.log(
            "[TobyFlow ref-bridge] useWorkflowTemplate relay \u2192 cloneWorkflowTemplate, templateId=",
            useId,
          );
          try {
            window.postMessage(
              { source: "tobyflow-ext", type: "useTemplateAck" },
              location.origin,
            );
          } catch (_) {}
          try {
            chrome.runtime.sendMessage(
              {
                action: "cloneWorkflowTemplate",
                templateId: useId,
                template: useTpl,
              },
              function () {
                if (chrome.runtime.lastError)
                  console.warn(
                    "[TobyFlow ref-bridge] useTemplate relay fail:",
                    chrome.runtime.lastError.message,
                  );
              },
            );
          } catch (e) {
            console.warn(
              "[TobyFlow ref-bridge] useTemplate sendMessage threw:",
              e.message,
            );
          }
          return;
        }
        if (d.type === "openTemplatePreview") {
          var templateId = d.templateId;
          var refCode = typeof d.refCode === "string" ? d.refCode.trim() : "";
          var kind = d.kind === "official" ? "official" : "community";
          if (templateId === void 0 || templateId === null || templateId === "")
            return;
          if (refCode && !/^[A-Za-z0-9_\-]{4,40}$/.test(refCode)) refCode = "";
          console.log(
            "[TobyFlow ref-bridge] openTemplatePreview relay, templateId=",
            templateId,
            "kind=",
            kind,
          );
          try {
            window.postMessage(
              { source: "tobyflow-ext", type: "pong" },
              location.origin,
            );
          } catch (_) {}
          try {
            chrome.runtime.sendMessage(
              {
                action: "openWorkflowTemplatePreviewById",
                templateId,
                refCode,
                kind,
              },
              function () {
                if (chrome.runtime.lastError)
                  console.warn(
                    "[TobyFlow ref-bridge] relay fail (context invalid? reload page):",
                    chrome.runtime.lastError.message,
                  );
              },
            );
          } catch (e) {
            console.warn(
              "[TobyFlow ref-bridge] sendMessage threw (extension reloaded? reload page):",
              e.message,
            );
          }
        }
      },
      false,
    );
  } catch (_) {}
  try {
    chrome.runtime.onMessage.addListener(function (msg) {
      if (msg && msg.action === "wfNodeStatusRelay") {
        try {
          window.postMessage(
            {
              source: "tobyflow-ext",
              type: "wf:node_status",
              event: msg.event,
              data: msg.data,
            },
            location.origin,
          );
        } catch (_) {}
      }
    });
  } catch (_) {}
})();
