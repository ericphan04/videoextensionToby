class DownloadExecutor {
  constructor() {
    this._queue = [];
    this._isRunning = false;
    this._shouldStop = false;
    this._completedCount = 0;
    this._currentFile = null;
    this._getJob = null;
    this._downloadedTileIds = new Set();
    this._inProgressTileIds = new Set();
    this._stoppedJobs = new Set();
  }
  setJobGetter(fn) {
    this._getJob = fn;
  }
  enqueue(tiles) {
    const existingInQueue = new Set(this._queue.map((t) => t.tileId));
    const newTiles = tiles.filter((t) => {
      if (this._downloadedTileIds.has(t.tileId)) {
        console.log(
          "[DownloadExecutor] Skip tile \u0111\xE3 download:",
          t.tileId.substring(0, 20),
        );
        return false;
      }
      if (this._inProgressTileIds.has(t.tileId)) {
        console.log(
          "[DownloadExecutor] Skip tile \u0111ang download:",
          t.tileId.substring(0, 20),
        );
        return false;
      }
      if (existingInQueue.has(t.tileId)) {
        console.log(
          "[DownloadExecutor] Skip tile \u0111\xE3 trong queue:",
          t.tileId.substring(0, 20),
        );
        return false;
      }
      return true;
    });
    if (newTiles.length > 0) {
      this._queue.push(...newTiles);
      if (!this._isRunning) {
        this._run();
      }
    }
  }
  async _run() {
    this._isRunning = true;
    this._shouldStop = false;
    while (this._queue.length > 0 && !this._shouldStop) {
      const tile = this._queue.shift();
      if (this._stoppedJobs.has(tile.jobId)) continue;
      if (this._getJob) {
        const job = this._getJob(tile.jobId);
        if (!job || job.state === "stopped") continue;
        while (job.state === "paused" && !this._shouldStop) {
          await new Promise((r) => setTimeout(r, 300));
        }
        if (this._shouldStop || job.state === "stopped") continue;
      }
      window.MessageBridge?.heartbeatActivateFlowTab?.();
      this._inProgressTileIds.add(tile.tileId);
      try {
        this._currentFile = tile.promptText || tile.tileId;
        const downloadPromise = MessageBridge.sendToContentScript(
          "downloadTileMedia",
          {
            tileId: tile.tileId,
            promptText: tile.promptText,
            taskName: tile.taskName || null,
            fileName: tile.fileName,
            flowFileId: tile.flowFileId || null,
            resolution: tile.resolution || null,
            index: tile.index ?? null,
            videoResolution: tile.isVideo ? tile.resolution || null : null,
            watermarkMode: tile.watermarkMode || null,
          },
        );
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Download timeout")), 45e3),
        );
        const resp = await Promise.race([downloadPromise, timeoutPromise]);
        if (resp?.success !== true) {
          console.warn(
            "[DownloadExecutor] Download failed:",
            tile.tileId,
            resp?.error || resp?.message || "no success acknowledgement",
          );
        } else {
          this._downloadedTileIds.add(tile.tileId);
          this._completedCount++;
        }
        await new Promise((r) => setTimeout(r, 200));
      } catch (err) {
        console.error(
          "[DownloadExecutor] L\u1ED7i t\u1EA3i xu\u1ED1ng:",
          err.message,
        );
      } finally {
        this._inProgressTileIds.delete(tile.tileId);
        this._currentFile = null;
      }
    }
    this._isRunning = false;
  }
  cancelJob(jobId) {
    this._queue = this._queue.filter((t) => t.jobId !== jobId);
    this._stoppedJobs.add(jobId);
  }
  stop() {
    this._shouldStop = true;
    this._queue = [];
  }
  reset() {
    this._completedCount = 0;
    this._currentFile = null;
    this._downloadedTileIds.clear();
    this._inProgressTileIds.clear();
    this._stoppedJobs.clear();
  }
  get state() {
    if (!this._isRunning) return "idle";
    return "downloading";
  }
  get queueLength() {
    return this._queue.length;
  }
  get completedCount() {
    return this._completedCount;
  }
  get currentFile() {
    return this._currentFile;
  }
}
