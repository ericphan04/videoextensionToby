(function () {
  const bound = new WeakSet();
  const dragBound = new WeakSet();
  window.ProviderTabScroll = {
    bindDrag(tabs) {
      if (!tabs || dragBound.has(tabs)) return;
      dragBound.add(tabs);
      this.bind(tabs);
      let gesture = null,
        suppressClickUntil = 0;
      const finish = (event) => {
        if (!gesture || event.pointerId !== gesture.pointerId) return;
        const ended = gesture;
        gesture = null;
        tabs.classList.remove("is-drag-scrolling");
        if (ended.dragging) suppressClickUntil = Date.now() + 500;
        try {
          if (tabs.hasPointerCapture?.(ended.pointerId))
            tabs.releasePointerCapture(ended.pointerId);
        } catch (_) {}
      };
      tabs.addEventListener("pointerdown", (event) => {
        if (
          event.pointerType !== "mouse" ||
          event.button !== 0 ||
          event.isPrimary === false
        )
          return;
        suppressClickUntil = 0;
        if (tabs.scrollWidth <= tabs.clientWidth) return;
        gesture = {
          pointerId: event.pointerId,
          x: event.clientX,
          scrollLeft: tabs.scrollLeft,
          dragging: false,
        };
      });
      tabs.addEventListener("pointermove", (event) => {
        if (!gesture || event.pointerId !== gesture.pointerId) return;
        if (!(event.buttons & 1)) {
          finish(event);
          return;
        }
        const delta = event.clientX - gesture.x;
        if (!gesture.dragging && Math.abs(delta) < 5) return;
        if (!gesture.dragging) {
          gesture.dragging = true;
          tabs.classList.add("is-drag-scrolling");
          try {
            tabs.setPointerCapture?.(event.pointerId);
          } catch (_) {}
        }
        tabs.scrollLeft = Math.max(
          0,
          Math.min(
            tabs.scrollWidth - tabs.clientWidth,
            gesture.scrollLeft - delta,
          ),
        );
        event.preventDefault();
      });
      for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
        tabs.addEventListener(event, finish);
      tabs.addEventListener("pointerleave", (event) => {
        if (gesture && !gesture.dragging) finish(event);
      });
      tabs.addEventListener("dragstart", (event) => {
        if (gesture) event.preventDefault();
      });
      tabs.addEventListener(
        "click",
        (event) => {
          if (event.detail === 0 || Date.now() >= suppressClickUntil) return;
          suppressClickUntil = 0;
          event.preventDefault();
          event.stopImmediatePropagation();
        },
        true,
      );
    },
    bind(tabs) {
      if (!tabs || bound.has(tabs)) return;
      bound.add(tabs);
      tabs.addEventListener(
        "wheel",
        (event) => {
          if (
            event.ctrlKey ||
            event.metaKey ||
            Math.abs(event.deltaX) > Math.abs(event.deltaY)
          )
            return;
          const maxScroll = tabs.scrollWidth - tabs.clientWidth;
          if (maxScroll <= 0 || !event.deltaY) return;
          const unit =
            event.deltaMode === 1
              ? 16
              : event.deltaMode === 2
                ? tabs.clientWidth
                : 1;
          const next = Math.max(
            0,
            Math.min(maxScroll, tabs.scrollLeft + event.deltaY * unit),
          );
          if (next === tabs.scrollLeft) return;
          tabs.scrollLeft = next;
          event.preventDefault();
        },
        { passive: false },
      );
    },
  };
})();
