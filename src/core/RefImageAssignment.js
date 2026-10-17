window.RefImageAssignment = class RefImageAssignment {
  static count(value) {
    const count = Number(value);
    return Number.isSafeInteger(count) && count > 0 ? count : 1;
  }
  static select(refs, promptIndex, perPrompt = 1) {
    const items = [
      ...new Set((Array.isArray(refs) ? refs : []).filter(Boolean)),
    ];
    if (!items.length) return [];
    const size = this.count(perPrompt);
    const groups = Math.ceil(items.length / size);
    const start = (Math.max(0, promptIndex) % groups) * size;
    return items.slice(start, start + size);
  }
};
