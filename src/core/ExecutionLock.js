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
class ExecutionLock {
  static getState() {
    return {
      locked: this._owner !== null,
      owner: this._owner,
      label: this._label,
      lockedAt: this._lockedAt,
    };
  }
  static acquire(owner, label = "") {
    if (this._owner === null) {
      this._owner = owner;
      this._label = label;
      this._lockedAt = Date.now();
      this._emitChange();
      return true;
    }
    if (this._owner === owner) {
      this._label = label;
      return true;
    }
    if (window.PromptQueue && PromptQueue.isEnabled()) {
      return true;
    }
    return false;
  }
  static release(owner) {
    if (this._owner === owner) {
      this._owner = null;
      this._label = "";
      this._lockedAt = null;
      this._emitChange();
    }
  }
  static forceRelease() {
    this._owner = null;
    this._label = "";
    this._lockedAt = null;
    this._emitChange();
  }
  static isBlockedBy(owner) {
    if (window.PromptQueue && PromptQueue.isEnabled()) {
      return false;
    }
    if (this._owner === "queue") return false;
    return this._owner !== null && this._owner !== owner;
  }
  static isQueueMode() {
    return this._owner === "queue";
  }
  static async showBlockedDialog(requestingOwner) {
    const ownerLabels = {
      prompts: "Prompt",
      task: "Task",
      workflow: "Workflow",
      angles: "Angles",
      effects: "Effects",
      queue: "Queue",
    };
    const currentLabel = this._label || ownerLabels[this._owner] || this._owner;
    const requestLabel = ownerLabels[requestingOwner] || requestingOwner;
    if (!window.customDialog) {
      console.warn("[ExecutionLock] customDialog ch\u01B0a s\u1EB5n s\xE0ng");
      return false;
    }
    const result = await window.customDialog.confirm(
      window.I18n?.t("exec.flowBusyMessage", { label: currentLabel }) ||
        `Running: ${currentLabel}

You need to stop the current task before running ${requestLabel}.`,
      {
        title: window.I18n?.t("msg.flowBusy") || "Google Flow is busy",
        confirmText:
          window.I18n?.t("exec.stopAndContinue") || "Stop and run new",
        cancelText: window.I18n?.t("common.cancel") || "Cancel",
      },
    );
    return result;
  }
  static async stopCurrent() {
    if (!this._owner) return true;
    const owner = this._owner;
    try {
      if (owner === "prompts") {
        if (window.MessageBridge) {
          await MessageBridge.stopExecution().catch(() => {});
        }
      } else if (owner === "task") {
        window._taskShouldStop = true;
        window._taskBatchStopped = true;
        if (window.MessageBridge) {
          await MessageBridge.stopExecution().catch(() => {});
        }
        if (window.eventBus) {
          window.eventBus.emit("tasks:stop_all");
        }
      } else if (owner === "workflow") {
        if (window.workflowExecutor) {
          await window.workflowExecutor.stop();
        }
      } else if (owner === "angles") {
        if (window.angleExecution) {
          window.angleExecution.stop();
        }
        if (window.MessageBridge) {
          await MessageBridge.stopExecution().catch(() => {});
        }
      } else if (owner === "effects") {
        if (window.effectsExecution) {
          window.effectsExecution.stop();
        }
        if (window.MessageBridge) {
          await MessageBridge.stopExecution().catch(() => {});
        }
      } else if (owner === "queue") {
        window.eventBus?.emit("queue:stop_all", {
          stopOrigin: "user",
          stopReason: "USER_CANCELLED",
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      this.forceRelease();
      return true;
    } catch (err) {
      console.error(
        "[ExecutionLock] L\u1ED7i khi d\u1EEBng t\xE1c v\u1EE5:",
        err,
      );
      this.forceRelease();
      return true;
    }
  }
  static broadcastTracker(data) {
    if (window.eventBus) {
      window.eventBus.emit("execution:tracker_update", data);
    }
    if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      chrome.runtime
        .sendMessage({
          action: "execution:tracker_broadcast",
          data,
          _originId: this._contextId,
        })
        .catch(() => {});
    }
  }
  static _emitChange() {
    const state = this.getState();
    if (window.eventBus) {
      window.eventBus.emit("execution:lock_changed", state);
    }
    if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      chrome.runtime
        .sendMessage({
          action: "execution:lock_broadcast",
          state,
          _originId: this._contextId,
        })
        .catch(() => {});
    }
  }
}
__publicField(ExecutionLock, "_owner", null);
__publicField(ExecutionLock, "_label", "");
__publicField(ExecutionLock, "_lockedAt", null);
ExecutionLock._contextId =
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
window.ExecutionLock = ExecutionLock;
