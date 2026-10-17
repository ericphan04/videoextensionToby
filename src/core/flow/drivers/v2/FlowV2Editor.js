(function (root) {
  class FlowV2Editor {
    constructor(api = {}) {
      this.api = api;
    }
    get() {
      return this.api.getEditor?.() || null;
    }
    text(editor) {
      let value = this.api.readEditorText?.(editor);
      if (
        editor?.cloneNode &&
        (value === void 0 || value === editor.textContent)
      ) {
        try {
          const clone = editor.cloneNode(true);
          for (const decoration of clone.querySelectorAll(
            '[contenteditable="false"]',
          )) {
            decoration.remove();
          }
          value = clone.textContent || "";
        } catch (_) {}
      }
      return String(value === void 0 ? editor?.textContent || "" : value)
        .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }
    async clear() {
      let editor = this.get();
      if (!editor) return { success: false, error: "EDITOR_NOT_FOUND" };
      if (!this.text(editor) && !this.api.hasInlineChips?.())
        return { success: true, alreadyEmpty: true };
      let success = await this.api.clearEditor?.(editor);
      let current = this.get();
      if (
        (!success || this.text(current) || this.api.hasInlineChips?.()) &&
        current &&
        current !== editor
      ) {
        editor = current;
        success = await this.api.clearEditor?.(editor);
        current = this.get();
      }
      return success && !this.text(current) && !this.api.hasInlineChips?.()
        ? { success: true }
        : { success: false, error: "EDITOR_CLEAR_NOT_CONFIRMED" };
    }
    async insert(text, options = {}) {
      let editor = this.get();
      if (!editor) return { success: false, error: "EDITOR_NOT_FOUND" };
      const inserted = String(text || "");
      const normalize = (value) =>
        String(value)
          .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
          .replace(/\s+/g, " ")
          .trim();
      if (!inserted || (!options.segmentMode && !normalize(inserted))) {
        return { success: false, error: "EDITOR_TEXT_REQUIRED", value: "" };
      }
      const before = this.text(editor);
      const expected = options.segmentMode
        ? [normalize(before + inserted), normalize(before + " " + inserted)]
        : [normalize(inserted)];
      let success = await this.api.insertText?.(editor, inserted, options);
      let current = this.get();
      let actual = this.text(current);
      if (
        !expected.includes(actual) &&
        current &&
        current !== editor &&
        actual === before
      ) {
        editor = current;
        success = await this.api.insertText?.(editor, inserted, options);
        current = this.get();
        actual = this.text(current);
      }
      return success && expected.includes(actual)
        ? { success: true, value: actual }
        : {
            success: false,
            error: "EDITOR_INSERT_NOT_CONFIRMED",
            value: actual,
          };
    }
    async submit({
      timeoutMs = 3e4,
      requestEvidenceOnly = false,
      beforeClick = null,
    } = {}) {
      const editor = this.get();
      const promptBefore = this.text(editor);
      if (!editor)
        return {
          success: false,
          error: "EDITOR_NOT_FOUND",
          notDispatched: true,
        };
      if (!promptBefore)
        return { success: false, error: "EDITOR_EMPTY", notDispatched: true };
      const blocked = this.api.getSubmitBlockReason?.();
      if (blocked)
        return { success: false, error: blocked, notDispatched: true };
      let button = this.api.getSubmitButton?.() || null;
      const buttonDeadline = Date.now() + Math.min(2e3, Math.max(0, timeoutMs));
      while (!button && Date.now() < buttonDeadline) {
        await (this.api.wait
          ? this.api.wait(100)
          : new Promise((resolve) => setTimeout(resolve, 100)));
        if (this.text(this.get()) !== promptBefore) {
          return {
            success: false,
            error: "FLOW_PRESUBMIT_STALE",
            notDispatched: true,
          };
        }
        const blockReason = this.api.getSubmitBlockReason?.();
        if (blockReason)
          return { success: false, error: blockReason, notDispatched: true };
        button = this.api.getSubmitButton?.() || null;
      }
      if (!button)
        return {
          success: false,
          error: "SUBMIT_BUTTON_NOT_FOUND",
          notDispatched: true,
        };
      if (this.api.isDisabled?.(button))
        return {
          success: false,
          error: "SUBMIT_BUTTON_DISABLED",
          notDispatched: true,
        };
      const baselineStartedAt = Date.now();
      const before = requestEvidenceOnly
        ? []
        : this.api.snapshotTiles?.() || [];
      const beforeKeys = new Set(
        before.map((record) => record.observationKey).filter(Boolean),
      );
      this.api.submitTiming?.({
        tileCount: before.length,
        baselineMs: Date.now() - baselineStartedAt,
        requestEvidenceOnly,
      });
      if (beforeClick && beforeClick() !== true) {
        return {
          success: false,
          error: "FLOW_PRESUBMIT_STALE",
          notDispatched: true,
        };
      }
      const activation = await this.api.click?.(button);
      const clickDelivered =
        activation !== false && activation?.delivered !== false;
      const controlAccepted = activation?.controlAccepted === true;
      const mainListenerInvoked = activation?.mainListenerInvoked === true;
      if (clickDelivered === false) {
        return {
          success: false,
          error: "SUBMIT_CLICK_NOT_DELIVERED",
          notDispatched: true,
        };
      }
      const startedAt = Date.now();
      let fallbackDispatched = false;
      const maybeDispatchEditorFallback = async () => {
        if (fallbackDispatched || typeof this.api.pressEnter !== "function")
          return false;
        if (mainListenerInvoked) return false;
        if (Date.now() - startedAt < 1200) return false;
        const currentEditor = this.get();
        if (!currentEditor || this.text(currentEditor) !== promptBefore)
          return false;
        const currentButton = this.api.getSubmitButton?.() || null;
        if (!currentButton || this.api.isDisabled?.(currentButton))
          return false;
        if (beforeClick && beforeClick() !== true) return false;
        fallbackDispatched = this.api.pressEnter(currentEditor) === true;
        return fallbackDispatched;
      };
      if (requestEvidenceOnly) {
        if (controlAccepted) {
          return {
            success: true,
            approach: "dom",
            editorCleared: false,
            confirmationSignal: "submit_control_disabled",
            fallbackDispatched,
          };
        }
        while (Date.now() - startedAt < timeoutMs) {
          if (!this.text(this.get())) {
            return {
              success: true,
              approach: "dom",
              editorCleared: true,
              confirmationSignal: "editor_cleared",
              fallbackDispatched,
            };
          }
          await maybeDispatchEditorFallback();
          await this.api.wait?.(100);
        }
        return {
          success: false,
          error: "SUBMIT_NOT_CONFIRMED",
          editorCleared: false,
          observedNewTile: false,
          clickDelivered: clickDelivered !== false,
          mainListenerInvoked,
          fallbackDispatched,
        };
      }
      let editorCleared = false;
      let ownedTile = null;
      if (controlAccepted) {
        return {
          success: true,
          approach: "dom",
          editorCleared: false,
          tile: null,
          confirmationSignal: "submit_control_disabled",
          fallbackDispatched,
        };
      }
      while (Date.now() - startedAt < timeoutMs) {
        const currentEditor = this.get();
        editorCleared = !this.text(currentEditor);
        const records = this.api.snapshotTiles?.() || [];
        ownedTile =
          records.find(
            (record) =>
              record.observationKey && !beforeKeys.has(record.observationKey),
          ) || null;
        if (editorCleared || ownedTile) {
          let tile = ownedTile;
          if (ownedTile && this.api.describeTile) {
            tile = {
              observationKey: ownedTile.observationKey,
              runtimeId: ownedTile.runtimeId || ownedTile.observationKey,
            };
            try {
              tile = this.api.describeTile(ownedTile) || tile;
            } catch (_) {}
          }
          return {
            success: true,
            approach: "dom",
            editorCleared,
            tile,
            confirmationSignal: editorCleared
              ? "editor_cleared"
              : "tile_appeared",
            fallbackDispatched,
          };
        }
        await maybeDispatchEditorFallback();
        await this.api.wait?.(150);
      }
      return {
        success: false,
        error: "SUBMIT_NOT_CONFIRMED",
        editorCleared,
        observedNewTile: !!ownedTile,
        mainListenerInvoked,
        fallbackDispatched,
      };
    }
  }
  root.FlowV2Editor = FlowV2Editor;
})(typeof globalThis !== "undefined" ? globalThis : self);
