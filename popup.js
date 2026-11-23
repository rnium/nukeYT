"use strict";

/* ─────────────────────────────────────────────
   Modal modes
───────────────────────────────────────────── */
const MODE = {
  VERIFY_DISABLE_SHORTS: "verify-disable-shorts",
  VERIFY_DISABLE_RECS: "verify-disable-recs",
  VERIFY_DISABLE_YT: "verify-disable-yt",
  VERIFY_CHANGE_PIN: "verify-change-pin",
  SET_NEW_PIN: "set-new-pin",
  CONFIRM_NEW_PIN: "confirm-new-pin",
};

const VERIFY_MODES = new Set([
  MODE.VERIFY_DISABLE_SHORTS,
  MODE.VERIFY_DISABLE_RECS,
  MODE.VERIFY_DISABLE_YT,
  MODE.VERIFY_CHANGE_PIN,
]);

const RESET_DELAY_MS = 60 * 60 * 1000;

/* ─────────────────────────────────────────────
   Runtime state
───────────────────────────────────────────── */
const state = {
  ytBlocked: false,
  shortsBlocked: true,
  recsBlocked: true,
  pinHash: null, // SHA-256 hex string, or null if no PIN set
  pinResetAt: null, // epoch ms when a forgot-PIN reset clears the PIN, or null
};

let modalMode = null; // current MODE value
let pinBuffer = ""; // digits typed so far (max 4)
let newPinBuffer = ""; // new PIN stored between SET_NEW_PIN -> CONFIRM_NEW_PIN
let pendingDisable = null; // 'yt' | 'shorts' | 'recs' | null

/* ─────────────────────────────────────────────
   Crypto
───────────────────────────────────────────── */
async function sha256(text) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ─────────────────────────────────────────────
   Storage helpers
───────────────────────────────────────────── */
function loadState() {
  return new Promise((resolve) =>
    chrome.storage.local.get(
      ["ytBlocked", "shortsBlocked", "recsBlocked", "pinHash", "pinResetAt"],
      (res) => {
        state.ytBlocked = res.ytBlocked === true; // default false
        state.shortsBlocked = res.shortsBlocked !== false; // default true
        state.recsBlocked = res.recsBlocked !== false; // default true
        state.pinHash = res.pinHash ?? null;
        state.pinResetAt = res.pinResetAt ?? null;
        resolve();
      },
    ),
  );
}

function persist() {
  chrome.storage.local.set({
    ytBlocked: state.ytBlocked,
    shortsBlocked: state.shortsBlocked,
    recsBlocked: state.recsBlocked,
    pinHash: state.pinHash,
    pinResetAt: state.pinResetAt,
  });
}

/* ─────────────────────────────────────────────
   PIN checks & forgot-PIN reset
───────────────────────────────────────────── */
async function checkPin(entered) {
  if ((await sha256(entered)) !== state.pinHash) return false;
  if (state.pinResetAt) {
    state.pinResetAt = null;
    persist();
  }
  return true;
}

function startPinReset() {
  state.pinResetAt = Date.now() + RESET_DELAY_MS;
  persist();
}

function cancelPinReset() {
  state.pinResetAt = null;
  persist();
}

function applyDueReset() {
  if (!state.pinResetAt || Date.now() < state.pinResetAt) return false;
  state.pinHash = null;
  state.pinResetAt = null;
  persist();
  return true;
}

function formatRemaining(ms) {
  const mins = Math.max(1, Math.ceil(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

/* ─────────────────────────────────────────────
   Main-view rendering
───────────────────────────────────────────── */
function renderMain() {
  // Toggles
  document.getElementById("yt-toggle").checked = state.ytBlocked;
  document.getElementById("shorts-toggle").checked = state.shortsBlocked;
  document.getElementById("recs-toggle").checked = state.recsBlocked;

  // PIN section
  let label = "No PIN set";
  let desc = "Set a PIN to lock your settings";
  let action = "Set PIN";
  let forgotStatus = "";

  if (state.pinResetAt) {
    const remaining = formatRemaining(state.pinResetAt - Date.now());
    label = "PIN reset pending";
    desc = `PIN clears in ${remaining}`;
    action = "Cancel reset";
    forgotStatus = `Reset pending · clears in ${remaining}`;
  } else if (state.pinHash) {
    label = "PIN protected";
    desc = "PIN required to disable";
    action = "Change PIN";
  }

  document.getElementById("pin-status-label").textContent = label;
  document.getElementById("pin-status-desc").textContent = desc;
  document.getElementById("pin-action-btn").textContent = action;

  document.getElementById("forgot-pin-btn").hidden = Boolean(state.pinResetAt);
  document.getElementById("forgot-status").textContent = forgotStatus;
}

/* ─────────────────────────────────────────────
   Modal helpers
───────────────────────────────────────────── */
function showView(name /* 'main' | 'pin' | 'reset' */) {
  for (const view of ["main", "pin", "reset"]) {
    document
      .getElementById(`${view}-view`)
      .classList.toggle("hidden", view !== name);
  }
}

function openModal(mode, title, desc) {
  modalMode = mode;
  pinBuffer = "";
  refreshDots();
  clearError();

  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-desc").textContent = desc;
  document.getElementById("forgot-area").hidden = !VERIFY_MODES.has(mode);
  showView("pin");
}

function closeModal() {
  showView("main");
  modalMode = null;
  pinBuffer = "";
  newPinBuffer = "";
  pendingDisable = null;
}

/* ─────────────────────────────────────────────
   Dot display
───────────────────────────────────────────── */
function refreshDots() {
  for (let i = 0; i < 6; i++) {
    const dot = document.getElementById(`d${i}`);
    dot.classList.toggle("filled", i < pinBuffer.length);
    dot.classList.remove("error");
  }
}

function flashDots(errorMsg) {
  const dotsEl = document.getElementById("pin-dots");

  for (let i = 0; i < 6; i++) {
    const d = document.getElementById(`d${i}`);
    d.classList.remove("filled");
    d.classList.add("error");
  }

  dotsEl.classList.remove("shake");
  void dotsEl.offsetWidth;
  dotsEl.classList.add("shake");

  showError(errorMsg);
  pinBuffer = "";

  setTimeout(() => {
    dotsEl.classList.remove("shake");
    for (let i = 0; i < 6; i++) {
      document.getElementById(`d${i}`).classList.remove("error");
    }
  }, 500);
}

/* ─────────────────────────────────────────────
   Error message
───────────────────────────────────────────── */
function showError(msg) {
  const el = document.getElementById("pin-error");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function clearError() {
  const el = document.getElementById("pin-error");
  el.textContent = "";
  el.classList.add("hidden");
}

/* ─────────────────────────────────────────────
   Numpad input
───────────────────────────────────────────── */
function pressDigit(digit) {
  if (pinBuffer.length >= 6) return;
  clearError();
  pinBuffer += digit;
  refreshDots();
  if (pinBuffer.length === 6) {
    setTimeout(handleComplete, 120);
  }
}

function pressBackspace() {
  if (!pinBuffer.length) return;
  pinBuffer = pinBuffer.slice(0, -1);
  refreshDots();
  clearError();
}

/* ─────────────────────────────────────────────
   PIN completion handler (state machine)
───────────────────────────────────────────── */
async function handleComplete() {
  const mode = modalMode;
  const entered = pinBuffer;

  /* ── Verify to disable Shorts ── */
  if (mode === MODE.VERIFY_DISABLE_SHORTS) {
    if (await checkPin(entered)) {
      state.shortsBlocked = false;
      persist();
      renderMain();
      closeModal();
    } else {
      flashDots("Incorrect PIN. Try again.");
    }
    return;
  }

  /* ── Verify to disable Recommendations ── */
  if (mode === MODE.VERIFY_DISABLE_RECS) {
    if (await checkPin(entered)) {
      state.recsBlocked = false;
      persist();
      renderMain();
      closeModal();
    } else {
      flashDots("Incorrect PIN. Try again.");
    }
    return;
  }

  /* ── Verify to disable YouTube nuke ── */
  if (mode === MODE.VERIFY_DISABLE_YT) {
    if (await checkPin(entered)) {
      state.ytBlocked = false;
      persist();
      renderMain();
      closeModal();
    } else {
      flashDots("Incorrect PIN. Try again.");
    }
    return;
  }

  /* ── Verify current PIN before changing ── */
  if (mode === MODE.VERIFY_CHANGE_PIN) {
    if (await checkPin(entered)) {
      openModal(MODE.SET_NEW_PIN, "Set New PIN", "Enter your new 6-digit PIN");
    } else {
      flashDots("Incorrect PIN. Try again.");
    }
    return;
  }

  /* ── Capture new PIN (step 1 of 2) ── */
  if (mode === MODE.SET_NEW_PIN) {
    newPinBuffer = entered;
    openModal(
      MODE.CONFIRM_NEW_PIN,
      "Confirm PIN",
      "Re-enter your new PIN to confirm",
    );
    return;
  }

  /* ── Confirm new PIN (step 2 of 2) ── */
  if (mode === MODE.CONFIRM_NEW_PIN) {
    if (entered === newPinBuffer) {
      state.pinHash = await sha256(entered);

      // Execute any pending disable action that triggered the setup flow
      if (pendingDisable === "yt") state.ytBlocked = false;
      if (pendingDisable === "shorts") state.shortsBlocked = false;
      if (pendingDisable === "recs") state.recsBlocked = false;

      persist();
      renderMain();
      closeModal();
    } else {
      newPinBuffer = "";
      flashDots("PINs don't match.");
      setTimeout(() => {
        openModal(
          MODE.SET_NEW_PIN,
          "Set New PIN",
          "Enter your new 6-digit PIN",
        );
      }, 900);
    }
    return;
  }
}

/* ─────────────────────────────────────────────
   Toggle "turn off" flow
───────────────────────────────────────────── */
function handleTurnOff(feature /* 'yt' | 'shorts' | 'recs' */) {
  const featureNames = {
    yt: "Nuke YouTube",
    shorts: "Nuke Shorts",
    recs: "Nuke Recommendations",
  };
  const featureName = featureNames[feature];

  const modeMap = {
    yt: MODE.VERIFY_DISABLE_YT,
    shorts: MODE.VERIFY_DISABLE_SHORTS,
    recs: MODE.VERIFY_DISABLE_RECS,
  };

  if (!state.pinHash) {
    pendingDisable = feature;
    openModal(
      MODE.SET_NEW_PIN,
      "Create a PIN First",
      `Set a PIN — it will be required to turn off ${featureName}.`,
    );
  } else {
    openModal(
      modeMap[feature],
      "Enter PIN",
      `Enter your PIN to disable ${featureName}`,
    );
  }
}

/* ─────────────────────────────────────────────
   Boot
───────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", async () => {
  await loadState();
  applyDueReset();
  renderMain();

  setInterval(() => {
    if (!state.pinResetAt) return;
    if (applyDueReset()) closeModal();
    renderMain();
  }, 30000);

  /* ── YouTube toggle ── */
  document.getElementById("yt-toggle").addEventListener("change", (e) => {
    if (e.target.checked) {
      state.ytBlocked = true;
      persist();
      renderMain();
    } else {
      e.target.checked = true;
      handleTurnOff("yt");
    }
  });

  /* ── Shorts toggle ── */
  document.getElementById("shorts-toggle").addEventListener("change", (e) => {
    if (e.target.checked) {
      state.shortsBlocked = true;
      persist();
      renderMain();
    } else {
      e.target.checked = true;
      handleTurnOff("shorts");
    }
  });

  /* ── Recs toggle ── */
  document.getElementById("recs-toggle").addEventListener("change", (e) => {
    if (e.target.checked) {
      state.recsBlocked = true;
      persist();
      renderMain();
    } else {
      e.target.checked = true;
      handleTurnOff("recs");
    }
  });

  /* ── PIN action button (Set PIN / Change PIN / Cancel reset) ── */
  document.getElementById("pin-action-btn").addEventListener("click", () => {
    if (state.pinResetAt) {
      cancelPinReset();
      renderMain();
    } else if (state.pinHash) {
      openModal(
        MODE.VERIFY_CHANGE_PIN,
        "Change PIN",
        "Enter your current PIN first",
      );
    } else {
      pendingDisable = null;
      openModal(
        MODE.SET_NEW_PIN,
        "Set PIN",
        "Create a 6-digit PIN to protect your settings",
      );
    }
  });

  /* ── Cancel / back button ── */
  document.getElementById("modal-close").addEventListener("click", () => {
    closeModal();
    renderMain();
  });

  /* ── Forgot PIN flow ── */
  document.getElementById("forgot-pin-btn").addEventListener("click", () => {
    showView("reset");
  });

  document.getElementById("reset-back").addEventListener("click", () => {
    showView("pin");
  });

  document.getElementById("reset-start").addEventListener("click", () => {
    startPinReset();
    closeModal();
    renderMain();
  });

  /* ── Numpad digit buttons ── */
  document.querySelectorAll(".num-btn[data-digit]").forEach((btn) => {
    btn.addEventListener("click", () => pressDigit(btn.dataset.digit));
  });

  /* ── Backspace button ── */
  document
    .getElementById("backspace")
    .addEventListener("click", pressBackspace);

  /* ── Keyboard support ── */
  document.addEventListener("keydown", (e) => {
    if (!document.getElementById("reset-view").classList.contains("hidden")) {
      if (e.key === "Escape") showView("pin");
      return;
    }
    if (document.getElementById("pin-view").classList.contains("hidden"))
      return;

    if (e.key >= "0" && e.key <= "9") pressDigit(e.key);
    else if (e.key === "Backspace") pressBackspace();
    else if (e.key === "Escape") {
      closeModal();
      renderMain();
    }
  });
});
