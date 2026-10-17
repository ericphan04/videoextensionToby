class MultiTaskTab {
  constructor(container) {
    this.container = container;
    this.taskList = null;
    this.taskModal = null;
    this.isInitialized = false;
  }
  async init() {
    if (this.isInitialized) return;
    console.log("[MultiTaskTab] Initializing...");
    if (window.storageManager && !window.storageManager.storage) {
      await window.storageManager.init();
    }
    const listContainer =
      this.container.querySelector("#taskListSection") || this.container;
    this.taskList = new TaskList(listContainer);
    listContainer.__taskList = this.taskList;
    if (!window.taskModal) {
      window.taskModal = new TaskModal();
    }
    this.taskModal = window.taskModal;
    this.isInitialized = true;
    console.log("[MultiTaskTab] Initialized");
  }
  destroy() {
    this.isInitialized = false;
  }
}
window.MultiTaskTab = MultiTaskTab;
