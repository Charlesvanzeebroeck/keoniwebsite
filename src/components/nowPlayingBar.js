import * as player from "../audioPlayer.js";
import { getAllTracks } from "../data.js";

let barEl = null;
let unsubscribe = null;

function formatTime(s) {
  if (!s || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function render(state) {
  if (!barEl) return;

  if (!state.track) {
    barEl.innerHTML = `
            <div class="npb-idle">
                <span class="npb-idle-text">Nothing playing — hit shuffle</span>
                <button class="npb-shuffle-btn" aria-label="Shuffle" title="Shuffle all tracks">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M16 3L21 8L16 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M3 8H21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        <path d="M8 21L3 16L8 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M21 16H3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                </button>
                <div class="npb-volume-idle">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="npb-vol-icon">
                        <path d="M11 5L6 9H2V15H6L11 19V5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <input type="range" class="npb-volume-range" min="0" max="1" step="0.01" value="${state.volume}" aria-label="Volume">
                </div>
            </div>`;
    wireIdle(state);
    return;
  }

  const progress =
    state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;
  const artwork =
    state.track._project?.artwork || "/Portofolio/Musics/placeholder.png";
  const projectTitle = state.track._project?.title || "";
  const projectId = state.track._project?.id || "";

  barEl.innerHTML = `
        <div class="npb-playing">
            <div class="npb-track-info">
                <img class="npb-artwork" src="${artwork}" alt="${projectTitle}" loading="lazy">
                <div class="npb-titles">
                    <span class="npb-track-title">${state.track.title}</span>
                    <button class="npb-project-title" data-project="${projectId}">${projectTitle}</button>
                </div>
            </div>
            <div class="npb-controls">
                <button class="npb-prev" aria-label="Previous">
                    <svg viewBox="0 0 24 24" fill="none"><path d="M19 20L9 12L19 4V20Z" fill="currentColor"/><line x1="5" y1="4" x2="5" y2="20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                </button>
                <button class="npb-playpause" aria-label="${state.playing ? "Pause" : "Play"}">
                    ${
                      state.playing
                        ? `<svg viewBox="0 0 24 24" fill="none"><rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/></svg>`
                        : `<svg viewBox="0 0 24 24" fill="none"><path d="M5 3L19 12L5 21V3Z" fill="currentColor"/></svg>`
                    }
                </button>
                <button class="npb-next" aria-label="Next">
                    <svg viewBox="0 0 24 24" fill="none"><path d="M5 4L15 12L5 20V4Z" fill="currentColor"/><line x1="19" y1="4" x2="19" y2="20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                </button>
                <div class="npb-scrubber">
                    <span class="npb-time">${formatTime(state.currentTime)}</span>
                    <input type="range" class="npb-progress" min="0" max="100" step="0.1" value="${progress}" aria-label="Seek">
                    <span class="npb-time">${formatTime(state.duration)}</span>
                </div>
            </div>
            <div class="npb-right">
                <button class="npb-shuffle-btn ${state.shuffleActive ? "active" : ""}" aria-label="Shuffle">
                    <svg viewBox="0 0 24 24" fill="none">
                        <path d="M16 3L21 8L16 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M3 8H21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        <path d="M8 21L3 16L8 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M21 16H3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                </button>
                <button class="npb-mute-btn" aria-label="Toggle mute">
                    ${
                      state.muted
                        ? `<svg viewBox="0 0 24 24" fill="none"><path d="M11 5L6 9H2V15H6L11 19V5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M23 9L17 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M17 9L23 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`
                        : `<svg viewBox="0 0 24 24" fill="none"><path d="M11 5L6 9H2V15H6L11 19V5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M15.54 8.46C16.48 9.4 17 10.67 17 12C17 13.33 16.48 14.6 15.54 15.54" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`
                    }
                </button>
                <input type="range" class="npb-volume-range" min="0" max="1" step="0.01" value="${state.muted ? 0 : state.volume}" aria-label="Volume">
            </div>
        </div>`;

  wirePlaying(state);
}

function wireIdle(state) {
  const shuffleBtn = barEl.querySelector(".npb-shuffle-btn");
  const volRange = barEl.querySelector(".npb-volume-range");

  shuffleBtn?.addEventListener("click", () => player.shuffle(getAllTracks));
  volRange?.addEventListener("input", (e) =>
    player.setVolume(parseFloat(e.target.value)),
  );
}

function wirePlaying(state) {
  barEl
    .querySelector(".npb-prev")
    ?.addEventListener("click", () => player.prev());
  barEl
    .querySelector(".npb-next")
    ?.addEventListener("click", () => player.next());
  barEl
    .querySelector(".npb-playpause")
    ?.addEventListener("click", () => player.toggle());

  const progress = barEl.querySelector(".npb-progress");
  progress?.addEventListener("input", (e) => {
    const pct = parseFloat(e.target.value) / 100;
    player.seek(pct * (player.getState().duration || 0));
  });

  barEl
    .querySelector(".npb-shuffle-btn")
    ?.addEventListener("click", () => player.shuffle(getAllTracks));
  barEl
    .querySelector(".npb-playpause-side")
    ?.addEventListener("click", () => player.toggle());
  barEl
    .querySelector(".npb-mute-btn")
    ?.addEventListener("click", () => player.toggleMute());

  const volRange = barEl.querySelector(".npb-volume-range");
  volRange?.addEventListener("input", (e) =>
    player.setVolume(parseFloat(e.target.value)),
  );

  barEl.querySelector(".npb-project-title")?.addEventListener("click", (e) => {
    const slug = e.currentTarget.dataset.project;
    if (slug && window.__selectProjectById) window.__selectProjectById(slug);
  });
}

export function mount(mountEl) {
  barEl = mountEl;
  render(player.getState());

  unsubscribe = player.on("statechange", (state) => render(state));

  // Lightweight timeupdate — only refresh scrubber, not full re-render
  player.on("timeupdate", ({ currentTime, duration }) => {
    if (!barEl) return;
    const progressEl = barEl.querySelector(".npb-progress");
    const timeEl = barEl.querySelector(".npb-time");
    if (progressEl && duration > 0) {
      progressEl.value = (currentTime / duration) * 100;
    }
    if (timeEl) {
      timeEl.textContent = formatTime(currentTime);
    }
  });
}

export function destroy() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  barEl = null;
}
