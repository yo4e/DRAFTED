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
  let hudRemoveTimer;
  let dragState;

  window.addEventListener("keydown", (event) => {
    if (event.repeat || pureModifiers.has(event.key)) return;
    chrome.runtime.sendMessage({ type: "KEYSTROKE" });
  }, true);

  window.addEventListener("resize", () => {
    if (!hud || !hud.style.left) return;
    placeHud(Number.parseFloat(hud.style.left), Number.parseFloat(hud.style.top));
    saveHudPosition();
  });

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
      hideOverlay();
      dischargeHud();
    } else if (message.type === "SESSION_ENDED") {
      clearTimeout(hudRemoveTimer);
      removeHud();
      hideOverlay();
    }
  });

  chrome.runtime.sendMessage({ type: "DRAFTED_READY" });

  function showHud(remaining) {
    clearTimeout(hudRemoveTimer);
    if (!hud) {
      hud = document.createElement("div");
      hud.id = "drafted-hud";
      hud.setAttribute("role", "status");
      hud.setAttribute("title", "Drag to move");
      hud.addEventListener("pointerdown", beginDrag);
      document.documentElement.appendChild(hud);
      applySavedHudPosition();
    }
    hud.classList.remove("is-disappearing");
    hud.textContent = `${remaining} TO DISCHARGE`;
  }

  async function applySavedHudPosition() {
    try {
      const { hudPosition } = await chrome.storage.local.get("hudPosition");
      if (!hud || !hudPosition) return;
      placeHud(Number(hudPosition.left), Number(hudPosition.top));
    } catch {
      // The default top-right position remains usable if storage is unavailable.
    }
  }

  function beginDrag(event) {
    if (!hud || event.button !== 0) return;
    event.preventDefault();

    const rect = hud.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };

    hud.setPointerCapture?.(event.pointerId);
    hud.classList.add("is-dragging");
    hud.addEventListener("pointermove", dragHud);
    hud.addEventListener("pointerup", endDrag);
    hud.addEventListener("pointercancel", endDrag);
    placeHud(rect.left, rect.top);
  }

  function dragHud(event) {
    if (!hud || !dragState || event.pointerId !== dragState.pointerId) return;
    placeHud(event.clientX - dragState.offsetX, event.clientY - dragState.offsetY);
  }

  function endDrag(event) {
    if (!hud || !dragState || event.pointerId !== dragState.pointerId) return;
    hud.releasePointerCapture?.(event.pointerId);
    hud.classList.remove("is-dragging");
    hud.removeEventListener("pointermove", dragHud);
    hud.removeEventListener("pointerup", endDrag);
    hud.removeEventListener("pointercancel", endDrag);
    dragState = undefined;
    saveHudPosition();
  }

  function placeHud(left, top) {
    if (!hud || !Number.isFinite(left) || !Number.isFinite(top)) return;
    const rect = hud.getBoundingClientRect();
    const maxLeft = Math.max(0, window.innerWidth - rect.width);
    const maxTop = Math.max(0, window.innerHeight - rect.height);
    const clampedLeft = Math.min(Math.max(0, left), maxLeft);
    const clampedTop = Math.min(Math.max(0, top), maxTop);

    hud.style.right = "auto";
    hud.style.bottom = "auto";
    hud.style.left = `${clampedLeft}px`;
    hud.style.top = `${clampedTop}px`;
  }

  function saveHudPosition() {
    if (!hud || !hud.style.left || !hud.style.top) return;
    chrome.storage.local.set({
      hudPosition: {
        left: Number.parseFloat(hud.style.left),
        top: Number.parseFloat(hud.style.top),
      },
    });
  }

  function dischargeHud() {
    if (!hud) return;
    hud.textContent = "DISCHARGED.";
    clearTimeout(hudRemoveTimer);
    hudRemoveTimer = setTimeout(() => {
      hud?.classList.add("is-disappearing");
      hudRemoveTimer = setTimeout(removeHud, 220);
    }, 420);
  }

  function removeHud() {
    if (hud) {
      hud.removeEventListener("pointerdown", beginDrag);
      hud.remove();
    }
    hud = undefined;
    dragState = undefined;
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
    hideTimer = setTimeout(hideOverlay, duration);
  }

  function hideOverlay() {
    overlay?.remove();
    overlay = undefined;
    clearTimeout(hideTimer);
  }
})();
