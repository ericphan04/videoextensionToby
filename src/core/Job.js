class Job {
  constructor({ owner, label }) {
    this.id = crypto.randomUUID();
    this.owner = owner;
    this.label = label;
    this.state = "running";
    this.items = [];
    this.completedCount = 0;
    this.failedCount = 0;
    this.partialCount = 0;
    this.totalExpected = 0;
    this.createdAt = Date.now();
    this.completedAt = null;
    this.settings = null;
    this.sequentialMode = false;
    this._flowApiEngineLock = null;
    this._flowApiRouteReason = null;
    this._flowApiRouteCommittedAt = null;
    this._flowApiWebReason = null;
    this.taskBatch = null;
    this._resolve = null;
    this._resolved = false;
  }
  get isActive() {
    return this.state === "running" || this.state === "paused";
  }
  get isDone() {
    return this.state === "completed" || this.state === "stopped";
  }
  get progress() {
    if (this.totalExpected === 0) return 0;
    return Math.round((this.completedCount / this.totalExpected) * 100);
  }
  get elapsed() {
    return Math.max(0, (this.completedAt || Date.now()) - this.createdAt);
  }
}
