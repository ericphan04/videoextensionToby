const IdGenerator = {
  next(prefix) {
    const ts = Date.now();
    const rand = this._shortUuid();
    return `${prefix}_${ts}_${rand}`;
  },
  _shortUuid() {
    try {
      if (
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
      ) {
        return crypto.randomUUID().split("-")[0];
      }
    } catch (e) {}
    return Math.random().toString(36).substring(2, 10).padEnd(8, "0");
  },
};
window.IdGenerator = IdGenerator;
