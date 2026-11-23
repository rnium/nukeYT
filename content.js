(() => {
  "use strict";

  /* ─────────────────────────────────────────────
     Blocking CSS strings
  ───────────────────────────────────────────── */
  // Hide, never remove: deleting nodes YouTube rendered desyncs its feed and stacks loading spinners.
  const SHORTS_CSS = `
    a[href^="/shorts"],
    grid-shelf-view-model:has(a[href^="/shorts/"]),
    ytm-shorts-lockup-view-model-v2,
    ytm-shorts-lockup-view-model,
    ytd-guide-entry-renderer:has(a[href="/shorts"]),
    ytd-guide-entry-renderer:has(a[href^="/shorts"]),
    ytd-mini-guide-entry-renderer:has(a[href="/shorts"]),
    ytd-mini-guide-entry-renderer:has(a[href^="/shorts"]),
    ytd-guide-entry-renderer:has([title="Shorts"]),
    ytd-mini-guide-entry-renderer:has([title="Shorts"]),
    ytd-reel-shelf-renderer,
    ytd-rich-shelf-renderer[is-shorts],
    ytd-video-renderer:has(a[href^="/shorts/"]),
    ytd-grid-video-renderer:has(a[href^="/shorts/"]),
    ytd-compact-video-renderer:has(a[href^="/shorts/"]),
    ytd-rich-item-renderer:has(a[href^="/shorts/"]),
    ytd-channel-video-player-renderer:has(a[href^="/shorts/"]) {
      display: none !important;
    }
  `;

  const RECS_CSS = `
    ytd-watch-next-secondary-results-renderer,
    #related,
    ytd-compact-video-renderer,
    ytd-compact-radio-renderer,
    ytd-compact-playlist-renderer,
    ytd-watch-next-secondary-results-renderer * {
      display: none !important;
    }
    .ytp-ce-element,
    .ytp-endscreen-content,
    .ytp-autonav-endscreen-upnext-container,
    .ytp-autonav-endscreen-countdown-container,
    .ytp-videowall-still,
    .ytp-suggestion-set,
    .ytp-pause-overlay {
      display: none !important;
    }
  `;

  // Settings load async and can land after YouTube's first paint; hide until known.
  const PENDING_CSS = `
    body { opacity: 0 !important; }
  `;

  const YT_NUKE_CSS = `
    html {
      overflow: hidden !important;
    }
    body > *:not(#nukeyt-overlay) {
      display: none !important;
    }
    #nukeyt-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #09090b;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    #nukeyt-overlay .nukeyt-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0 24px;
      text-align: center;
    }
    #nukeyt-overlay .nukeyt-icon {
      width: 40px;
      height: 40px;
      margin-bottom: 20px;
      color: #fafafa;
      animation: nukeyt-spin 20s linear infinite;
    }
    @keyframes nukeyt-spin {
      to {
        transform: rotate(360deg);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      #nukeyt-overlay .nukeyt-icon {
        animation: none;
      }
    }
    #nukeyt-overlay .nukeyt-title {
      font-size: 20px;
      font-weight: 600;
      color: #fafafa;
      letter-spacing: -0.01em;
      line-height: 1.3;
      margin: 0;
    }
    #nukeyt-overlay .nukeyt-desc {
      font-size: 14px;
      color: #71717a;
      line-height: 1.5;
      margin: 8px 0 0;
    }
  `;

  /* ─────────────────────────────────────────────
     Inject a <style> element immediately (sync)
  ───────────────────────────────────────────── */
  const styleEl = document.createElement("style");
  styleEl.id = "nuke-shorts-dynamic-css";
  document.documentElement.appendChild(styleEl);

  const settings = { ytBlocked: false, shortsBlocked: true, recsBlocked: true };
  let settingsLoaded = false;

  function applyCSS() {
    let css = settingsLoaded ? "" : PENDING_CSS;
    if (settings.ytBlocked) css += YT_NUKE_CSS;
    if (settings.shortsBlocked) css += SHORTS_CSS;
    if (settings.recsBlocked) css += RECS_CSS;
    styleEl.textContent = css;
  }

  // Apply defaults immediately
  applyCSS();

  /* ─────────────────────────────────────────────
     YouTube Nuke overlay
  ───────────────────────────────────────────── */
  function showNukeOverlay() {
    if (document.getElementById("nukeyt-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "nukeyt-overlay";
    overlay.innerHTML = `
      <div class="nukeyt-card">
        <svg class="nukeyt-icon" viewBox="-50 -50 100 100" fill="currentColor" aria-hidden="true">
          <circle r="9"/>
          <path d="M6.75 11.69L22.5 38.97A45 45 0 0 1-22.5 38.97L-6.75 11.69A13.5 13.5 0 0 0 6.75 11.69Z
                   M-13.5 0L-45 0A45 45 0 0 1-22.5-38.97L-6.75-11.69A13.5 13.5 0 0 0-13.5 0Z
                   M6.75-11.69L22.5-38.97A45 45 0 0 1 45 0L13.5 0A13.5 13.5 0 0 0 6.75-11.69Z"/>
        </svg>
        <h1 class="nukeyt-title">YouTube is Nuked</h1>
        <p class="nukeyt-desc">Close this tab and do something awesome instead.</p>
      </div>
    `;

    // Ensure body exists before appending
    const target = document.body || document.documentElement;
    target.appendChild(overlay);
  }

  function removeNukeOverlay() {
    const overlay = document.getElementById("nukeyt-overlay");
    if (overlay) overlay.remove();
  }

  function pauseAllMedia() {
    for (const media of document.querySelectorAll("video, audio")) {
      if (!media.paused) media.pause();
    }
  }

  // Media events don't bubble; capture is required.
  document.addEventListener(
    "play",
    (e) => {
      if (settings.ytBlocked && e.target instanceof HTMLMediaElement) e.target.pause();
    },
    true,
  );

  function enforceNuke() {
    if (settings.ytBlocked) {
      showNukeOverlay();
      pauseAllMedia();
    } else {
      removeNukeOverlay();
    }
  }

  /* ─────────────────────────────────────────────
     DOM helpers
  ───────────────────────────────────────────── */
  const SHORTS_PATH = "/shorts/";

  function redirectIfShorts() {
    if (settings.shortsBlocked && location.pathname.startsWith(SHORTS_PATH)) {
      location.replace("https://www.youtube.com/");
    }
  }

  function enforce() {
    enforceNuke();
    if (settings.ytBlocked) return; // skip granular enforcement when fully nuked
    redirectIfShorts();
  }

  /* ─────────────────────────────────────────────
     Load persisted settings, then re-apply
  ───────────────────────────────────────────── */
  chrome.storage.local.get(
    ["ytBlocked", "shortsBlocked", "recsBlocked"],
    (result) => {
      settings.ytBlocked = result.ytBlocked === true; // default off
      settings.shortsBlocked = result.shortsBlocked !== false;
      settings.recsBlocked = result.recsBlocked !== false;
      settingsLoaded = true;
      applyCSS();
      enforce();
    },
  );

  /* ─────────────────────────────────────────────
     Live listener
  ───────────────────────────────────────────── */
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    let changed = false;

    if ("ytBlocked" in changes) {
      settings.ytBlocked = changes.ytBlocked.newValue === true;
      changed = true;
    }
    if ("shortsBlocked" in changes) {
      settings.shortsBlocked = changes.shortsBlocked.newValue !== false;
      changed = true;
    }
    if ("recsBlocked" in changes) {
      settings.recsBlocked = changes.recsBlocked.newValue !== false;
      changed = true;
    }

    if (changed) {
      applyCSS();
      enforce();
    }
  });

  /* ─────────────────────────────────────────────
     MutationObserver
  ───────────────────────────────────────────── */
  let lastHref = location.href;

  const observer = new MutationObserver(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      enforce();
      return;
    }

    // Re-enforce nuke overlay in case YouTube tries to manipulate the DOM
    if (settings.ytBlocked) enforceNuke();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Periodic sweep as a safety net
  setInterval(enforce, 1500);

  enforce();
})();
