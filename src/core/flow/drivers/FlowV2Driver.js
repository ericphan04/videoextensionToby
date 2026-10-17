(function (root) {
  class FlowV2Driver extends root.FlowPageDriver {
    constructor({ implementation = {}, ...context } = {}) {
      const editorDriver = new FlowV2Editor({
        getEditor: () => globalThis.getEditor?.() || null,
        readEditorText: (editor) => globalThis.getEditorUserText?.(editor),
        hasInlineChips: () =>
          (globalThis._flowV2InlineState?.().count || 0) > 0,
        clearEditor: (editor) => globalThis.clearEditor?.(editor),
        insertText: (editor, text, options) =>
          globalThis.insertText?.(editor, text, options),
        getSubmitButton: () => globalThis.getSubmitButton?.() || null,
        getSubmitBlockReason: () =>
          globalThis._checkFlowCreditLimit?.() === true
            ? "PUBLIC_ERROR_USER_QUOTA_REACHED"
            : null,
        isDisabled: (button) =>
          globalThis._isFlowControlDisabled?.(button) ?? true,
        click: async (button) => {
          if (typeof globalThis.clickFlowSubmitControl === "function") {
            return await globalThis.clickFlowSubmitControl(button);
          }
          if (typeof globalThis.simulateClick !== "function") return false;
          globalThis.simulateClick(button);
          return true;
        },
        pressEnter: (editor) =>
          globalThis.pressFlowEditorSubmit?.(editor) === true,
        snapshotTiles: () => {
          const selector = globalThis._getTileSelectorString?.();
          if (!selector) return [];
          return [...document.querySelectorAll(selector)]
            .map((tile) => {
              const runtimeId = globalThis._getTileRuntimeId?.(tile);
              return runtimeId
                ? { observationKey: runtimeId, runtimeId, element: tile }
                : null;
            })
            .filter(Boolean);
        },
        describeTile: (record) =>
          globalThis._extractTypedTileRecord?.(record.element, null),
        submitTiming: (timing) =>
          console.debug("[FlowV2Submit] pre-click identity snapshot", timing),
        wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      });
      const tileResolver = new FlowV2TileResolver({
        getTileSelector: () => globalThis._getTileSelectorString?.(),
        extractRecord: (tile, operationId) =>
          globalThis._extractTypedTileRecord?.(tile, operationId),
      });
      const generationSettings = new FlowV2GenerationSettings({
        apply: (payload) =>
          globalThis._applyFlowV2Settings?.(
            payload.genType,
            payload.ratio,
            payload.model,
            payload.isFrames,
            payload.quantity,
            payload.flowVideoDuration,
            payload.modelAliases,
            payload.flowVideoResolution,
            payload.flowVideoResolutionDomValue,
            payload.skipFlowDurationControl === true,
          ),
      });
      const pageSettings = new FlowV2PageSettings({
        apply: (payload) =>
          globalThis._ensureFlowV2PageSettingsApplied?.(payload),
      });
      const componentPicker = new FlowV2ComponentPicker({
        list: (kind) => globalThis._scrapeFlowV2Components?.(kind),
        select: (kind, name, options) =>
          globalThis._selectFlowV2Component?.(kind, name, options),
        remove: (kind) =>
          globalThis._removeFlowV2IngredientKind?.(
            {
              image: "ingredient_image_chip",
              video: "ingredient_video_chip",
              voice: "ingredient_voice_chip",
              character: "ingredient_character_chip",
            }[kind],
          ),
        addRefs: async ({ refs = [] } = {}) => {
          if (
            !Array.isArray(refs) ||
            !refs.length ||
            typeof globalThis.addFileToPrompt !== "function"
          ) {
            return { success: false, error: "V2_REFS_UNAVAILABLE" };
          }
          const added = [];
          for (const ref of refs) {
            if (!ref?.fileId)
              return { success: false, error: "V2_REF_ID_REQUIRED", added };
            const ok = await globalThis.addFileToPrompt(
              ref.fileId,
              ref.fileName || null,
              ref.flowFileId || null,
            );
            if (!ok)
              return {
                success: false,
                error: "V2_REF_ADD_FAILED",
                failedRef: ref,
                added,
              };
            added.push(ref.fileId);
          }
          return { success: true, added };
        },
        upload: async ({ file, isStopped } = {}) => {
          if (
            typeof File === "undefined" ||
            !(file instanceof File) ||
            typeof globalThis._uploadFileViaUploadButton !== "function"
          ) {
            return { success: false, error: "V2_UPLOAD_UNAVAILABLE" };
          }
          const initiated = await globalThis._uploadFileViaUploadButton(
            file,
            isStopped,
          );
          if (initiated === true || initiated?.success === true) {
            return {
              success: true,
              initiated: true,
              method: initiated?.method || null,
            };
          }
          return {
            success: false,
            error: initiated?.error || "V2_UPLOAD_INIT_FAILED",
            stage: initiated?.stage || "unknown",
            diagnostics: initiated?.diagnostics || {},
          };
        },
      });
      const mediaMenu = new FlowV2MediaMenu({
        download: async (payload) => {
          if (
            !payload?.tileId ||
            typeof globalThis.downloadTileMedia !== "function"
          ) {
            return { success: false, error: "V2_DOWNLOAD_UNAVAILABLE" };
          }
          const ok = await globalThis.downloadTileMedia(
            payload.tileId,
            payload.promptText || null,
            payload.taskName || null,
            payload.fileName || null,
            payload.resolution || null,
            payload.flowFileId || null,
            payload.index ?? null,
            payload.videoResolution || null,
            payload.watermarkMode || null,
            payload.plannedFilename || null,
          );
          return ok
            ? { success: true }
            : { success: false, error: "V2_DOWNLOAD_FAILED" };
        },
      });
      const builtIn = {
        getProjectContext: () => ({
          success: true,
          ...FlowDriverRegistry.describeUrl(location.href),
        }),
        getEditor: () => {
          const editor = globalThis.getEditor?.() || null;
          return editor
            ? { success: true, editor }
            : { success: false, error: "EDITOR_NOT_FOUND" };
        },
        clearEditor: () => editorDriver.clear(),
        insertText: ({ text, options } = {}) =>
          editorDriver.insert(text, options),
        submit: (options) => editorDriver.submit(options),
        applyGenerationSettings: (payload) => generationSettings.apply(payload),
        applyPageSettings: (payload) => pageSettings.apply(payload),
        enumerateTiles: ({ operationId } = {}) =>
          tileResolver.enumerate(operationId),
        listComponents: ({ kind } = {}) => componentPicker.list(kind),
        selectComponent: ({ kind, name, options } = {}) =>
          componentPicker.select(kind, name, options),
        addRefs: (payload) => componentPicker.addRefs(payload),
        removeRefs: ({ kind } = {}) => componentPicker.remove(kind),
        upload: (payload) => componentPicker.upload(payload),
        download: (payload) => mediaMenu.download(payload),
        preflight: async ({ passive = false } = {}) => {
          const detect = (key) => globalThis._v2QueryConfigured?.(key) || null;
          if (detect("signed_out_indicator")) {
            return {
              success: false,
              state: "signed_out",
              error: "V2_SIGNED_OUT",
            };
          }
          if (detect("project_error_indicator")) {
            return {
              success: false,
              state: "project_error",
              error: "V2_PROJECT_ERROR",
            };
          }
          if (detect("agent_panel_owner") || detect("agent_mode_active")) {
            if (passive)
              return {
                success: false,
                state: "agent_blocked",
                error: "V2_AGENT_BLOCKED",
              };
            const recovered = await globalThis._ensureFlowV2AgentReady?.();
            if (
              recovered?.success &&
              !detect("agent_panel_owner") &&
              !detect("agent_mode_active")
            ) {
              const editor2 = globalThis.getEditor?.();
              if (editor2)
                return { success: true, state: "ready", agentRecovered: true };
            }
            return {
              success: false,
              state: "agent_blocked",
              error: "V2_AGENT_BLOCKED",
            };
          }
          if (detect("media_viewer_owner")) {
            return {
              success: false,
              state: "media_viewer",
              error: "V2_MEDIA_VIEWER_OPEN",
            };
          }
          const editor = globalThis.getEditor?.();
          if (editor) return { success: true, state: "ready" };
          return {
            success: false,
            state: "unknown",
            error: "V2_COMPOSER_NOT_READY",
          };
        },
      };
      super({
        ...context,
        key: "flow_v2",
        origin: root.FlowDriverRegistry.ORIGINS.flow_v2,
        implementation: { ...builtIn, ...implementation },
        capabilities: { pageGlobals: true, angular: true },
      });
    }
  }
  root.FlowDriverRegistry.register(
    "flow_v2",
    (context) => new FlowV2Driver(context),
  );
  root.FlowV2Driver = FlowV2Driver;
})(typeof globalThis !== "undefined" ? globalThis : self);
