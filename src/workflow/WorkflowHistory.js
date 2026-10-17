class WorkflowHistory {
  constructor(editor) {
    this.editor = editor;
    this._undoStack = [];
    this._redoStack = [];
    this._maxSize = 40;
    this._lastSnapshot = null;
    this._debounceTimer = null;
    this._suppressing = false;
  }
  _stripHeavyThumbnails(data) {
    try {
      const nodes = data?.nodes;
      if (!Array.isArray(nodes)) return data;
      const cleanMap = (o) => {
        if (!o || typeof o !== "object") return o;
        const out = {};
        for (const k of Object.keys(o)) {
          out[k] =
            typeof o[k] === "string" && o[k].startsWith("data:") ? "" : o[k];
        }
        return out;
      };
      const stripStr = (v) =>
        typeof v === "string" && v.startsWith("data:") ? "" : v;
      for (const n of nodes) {
        if (!n || typeof n !== "object") continue;
        if (n.ref_thumbnails) n.ref_thumbnails = cleanMap(n.ref_thumbnails);
        if (n.result_thumbnails)
          n.result_thumbnails = cleanMap(n.result_thumbnails);
        n.frame_1_thumbnail = stripStr(n.frame_1_thumbnail);
        n.frame_2_thumbnail = stripStr(n.frame_2_thumbnail);
      }
    } catch (_) {}
    return data;
  }
  takeSnapshot(label = "change") {
    if (this._suppressing) return;
    if (!this.editor?.diagramCanvas?.editor) return;
    let data;
    try {
      data = this.editor.diagramCanvas.exportWorkflow();
    } catch (e) {
      console.warn("[WorkflowHistory] exportWorkflow failed:", e);
      return;
    }
    if (!data) return;
    this._stripHeavyThumbnails(data);
    const snapshot = JSON.stringify(data);
    if (snapshot === this._lastSnapshot) return;
    this._undoStack.push({ label, data: snapshot, timestamp: Date.now() });
    if (this._undoStack.length > this._maxSize) this._undoStack.shift();
    this._redoStack = [];
    this._lastSnapshot = snapshot;
  }
  scheduleSnapshot(label = "change", delay = 400) {
    if (this._suppressing) return;
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this.takeSnapshot(label);
      this._debounceTimer = null;
    }, delay);
  }
  flushPending() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
      this.takeSnapshot("flush");
    }
  }
  canUndo() {
    return this._undoStack.length >= 2;
  }
  canRedo() {
    return this._redoStack.length > 0;
  }
  undo() {
    this.flushPending();
    if (!this.canUndo()) return null;
    const current = this._undoStack.pop();
    this._redoStack.push(current);
    if (this._redoStack.length > this._maxSize) this._redoStack.shift();
    const prev = this._undoStack[this._undoStack.length - 1];
    this._lastSnapshot = prev.data;
    this._restore(prev.data);
    return prev;
  }
  redo() {
    this.flushPending();
    if (!this.canRedo()) return null;
    const next = this._redoStack.pop();
    this._undoStack.push(next);
    this._lastSnapshot = next.data;
    this._restore(next.data);
    return next;
  }
  reset() {
    this._undoStack = [];
    this._redoStack = [];
    this._lastSnapshot = null;
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = null;
  }
  _restore(snapshotJson) {
    let data;
    try {
      data = JSON.parse(snapshotJson);
    } catch (e) {
      console.error("[WorkflowHistory] parse snapshot failed:", e);
      return;
    }
    this._suppressing = true;
    try {
      this.editor._restoreFromHistorySnapshot(data);
    } catch (e) {
      console.error("[WorkflowHistory] restore failed:", e);
    } finally {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setTimeout(() => {
            this._suppressing = false;
          }, 50);
        }),
      );
    }
  }
}
window.WorkflowHistory = WorkflowHistory;
