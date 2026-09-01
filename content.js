(() => {
  if (globalThis.__DRAFTED_CONTENT_ACTIVE__) return;
  globalThis.__DRAFTED_CONTENT_ACTIVE__ = true;

  const pureModifiers = new Set([
    "Shift", "Control", "Alt", "Meta", "CapsLock", "Fn", "FnLock",
    "NumLock", "ScrollLock", "Symbol", "SymbolLock", "Hyper", "Super",
  ]);

  const isTopFrame = window === window.top;
  let hud;
  let overlay;
  let hideTimer;

  window.addEventListener("keydown", (event) => {
    if (event.repeat || pureModifiers.has(event.key)) return;
    chrome.runtime.sendMessage({ type: "KEYSTROKE" });
  }, true);

  chrome.runtime.onMessage.addListener((message) => {
    if (!isTopFrame || !message || typeof message.type !== "string") return;

    if (message.type === "SHOW_INTRO") {
      showOverlay("YOU HAVE BEEN DRAFTED", `${message.remaining} KEYSTROKES TO DISCHARGE`);
      showHud(message.remaining);
    } else if (message.type === "SHOW_WARNING") {
      showOverlay("YOU ARE STILL DRAFTED", `${message.remaining} KEYSTROKES TO DISCHARGE`);
      showHud(message.remaining);
    } else if (message.type === "UPDATE_REMAINING") {
      showHud(message.remaining);
    } else if (message.type === "DISCHARGED") {
      removeHud();
      showOverlay("DISCHARGED.", "", 1400);
    } else if (message.type === "SESSION_ENDED") {
      removeHud();
      overlay?.remove();
      overlay = undefined;
      clearTimeout(hideTimer);
    }
  });

  chrome.runtime.sendMessage({ type: "DRAFTED_READY" });

  function showHud(remaining) {
    if (!hud) {
      hud = document.createElement("div");
      hud.id = "drafted-hud";
      hud.setAttribute("role", "status");
      document.documentElement.appendChild(hud);
    }
    hud.textContent = `${remaining} TO DISCHARGE`;
  }

  function removeHud() {
    hud?.remove();
    hud = undefined;
  }

  function showOverlay(title, subtitle, duration = 1800) {
    overlay?.remove();
    clearTimeout(hideTimer);

    overlay = document.createElement("div");
    overlay.id = "drafted-overlay";
    const titleNode = document.createElement("div");
    titleNode.className = "drafted-overlay-title";
    titleNode.textContent = title;
    overlay.appendChild(titleNode);

    if (subtitle) {
      const subtitleNode = document.createElement("div");
      subtitleNode.className = "drafted-overlay-subtitle";
      subtitleNode.textContent = subtitle;
      overlay.appendChild(subtitleNode);
    }

    document.documentElement.appendChild(overlay);
    hideTimer = setTimeout(() => {
      overlay?.remove();
      overlay = undefined;
    }, duration);
  }
})();
