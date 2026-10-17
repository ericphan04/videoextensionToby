class EventBus {
  constructor() {
    this.events = {};
  }
  on(event, callback) {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(callback);
    return () => this.off(event, callback);
  }
  off(event, callback) {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter((cb) => cb !== callback);
  }
  emit(event, data) {
    if (!this.events[event]) return;
    const handlers = [...this.events[event]];
    handlers.forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        console.error(`[EventBus] Handler l\u1ED7i cho event "${event}":`, err);
      }
    });
  }
  once(event, callback) {
    const unsubscribe = this.on(event, (data) => {
      unsubscribe();
      callback(data);
    });
    return unsubscribe;
  }
}
window.eventBus = new EventBus();
