function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
let isRunning = false;
let shouldStop = false;
function sendLog(msg, level = "info") {
  console.log(`[TobyFlow] ${msg}`);
  const logContainer = document.getElementById("logContainer");
  if (logContainer) {
    const div = document.createElement("div");
    div.className = `log-entry ${level}`;
    div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logContainer.appendChild(div);
    logContainer.scrollTop = logContainer.scrollHeight;
  }
  const logTabBtn = document.querySelector(
    '.tobyflow-tab[data-tab="tab-logs"]',
  );
  if (logTabBtn && !logTabBtn.classList.contains("active")) {
    logTabBtn.classList.add("has-new");
  }
}
function sendProgress() {}
function updateGlobalProgress() {}
function completeGlobalProgress() {}
function resetGlobalProgress() {}
