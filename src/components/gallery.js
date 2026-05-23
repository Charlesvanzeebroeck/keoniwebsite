import { gsap } from "gsap";
import { loadProjects } from "../data.js";
import * as player from "../audioPlayer.js";
import { attach as attachTilt, shouldEnableEffects } from "./tiltedDisc.js";

const COPIES = 3;

let rowEl = null;
let allProjects = [];
let activeProjectId = null;
let onSelectCb = null;
let oneSetWidth = 0;
let wrapping = false;
let isSnapping = false;
let snapTimer = null;
let unsubPlayer = null;
let tiltDetachers = [];
let effectsEnabled = false;
let wheelScrollTo = null;
let focusedDisc = null;

// Drag-to-scroll state
let isDragging = false;
let dragStartX = 0;
let dragScrollLeft = 0;
let dragMoved = false;

function updatePlayingBadge() {
  if (!rowEl) return;
  const s = player.getState();
  const playing = !!s.playing;
  rowEl.querySelectorAll(".project-disc.active").forEach((d) => {
    d.classList.toggle("is-playing", playing);
  });
}

function setActive(projectId) {
  activeProjectId = projectId;
  if (!rowEl) return;
  rowEl.querySelectorAll(".project-disc").forEach((d) => {
    d.classList.toggle("active", d.dataset.projectId === projectId);
  });
  updatePlayingBadge();
}

function getSnapCenterX() {
  if (!rowEl) return 0;
  const wrapper = rowEl.parentElement;
  const indicator = wrapper && wrapper.querySelector(".gallery-nav-indicator");
  if (!indicator) return rowEl.offsetWidth / 2;
  const rowRect = rowEl.getBoundingClientRect();
  const indRect = indicator.getBoundingClientRect();
  return indRect.left + indRect.width / 2 - rowRect.left;
}

function snapCardToLeft(card, opts = {}) {
  if (!rowEl || !card) return;
  const { duration = 0.4, ease = "power2.inOut", onComplete } = opts;
  const rowRect = rowEl.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const cardCenter = cardRect.left + cardRect.width / 2 - rowRect.left;
  const target = rowEl.scrollLeft + (cardCenter - getSnapCenterX());
  isSnapping = true;
  gsap.to(rowEl, {
    scrollLeft: target,
    duration,
    ease,
    onComplete: () => {
      isSnapping = false;
      onComplete?.();
    },
  });
}

function selectCard(card, project, opts) {
  setActive(project.id);
  snapCardToLeft(card);
  if (onSelectCb) onSelectCb(project, opts);
}

function buildDisc(project) {
  const div = document.createElement("div");
  div.className = "project-disc";
  div.dataset.projectId = project.id;
  div.setAttribute("role", "button");
  div.setAttribute("tabindex", "0");
  div.setAttribute("aria-label", project.title);

  const encodedArt = encodeURI(project.artwork || "");
  div.innerHTML = `
        <div class="disc-tilt-inner">
            <img src="${encodedArt}" alt="${project.title}" loading="lazy" draggable="false">
            <div class="disc-year-badge">${project.year}</div>
            <div class="disc-playing-badge" aria-hidden="true"><span></span><span></span><span></span></div>
        </div>`;

  const baseRot = (Math.random() * 12 - 6).toFixed(2);
  div.style.setProperty("--rot", `${baseRot}deg`);

  div.addEventListener("click", () => {
    if (dragMoved) return;
    selectCard(div, project);
  });
  div.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectCard(div, project);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      stepFocus(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      stepFocus(-1);
    }
  });
  div.addEventListener("focus", () => {
    focusedDisc = div;
  });

  if (effectsEnabled) {
    const detach = attachTilt(div, { shouldSuppress: () => isDragging });
    tiltDetachers.push(detach);
  }

  return div;
}

function stepFocus(dir) {
  if (!rowEl) return;
  const discs = [...rowEl.querySelectorAll(".project-disc")];
  if (!discs.length) return;
  const center =
    focusedDisc || rowEl.querySelector(".project-disc.is-focus") || discs[0];
  const idx = discs.indexOf(center);
  const next = discs[idx + dir];
  if (!next) return;
  const project = allProjects.find((p) => p.id === next.dataset.projectId);
  if (!project) return;
  setActive(project.id);
  snapCardToLeft(next, { duration: 0.4, ease: "power2.inOut" });
  next.focus({ preventScroll: true });
  focusedDisc = next;
  if (onSelectCb) onSelectCb(project);
}

function measureSet() {
  if (!rowEl) return;
  oneSetWidth = rowEl.scrollWidth / COPIES;
}

function updateDistanceState() {
  if (!rowEl) return;
  const rowRect = rowEl.getBoundingClientRect();
  const rowCenter = rowRect.left + getSnapCenterX();
  const half = rowRect.width / 2;
  const discs = rowEl.querySelectorAll(".project-disc");
  let bestDisc = null;
  let bestDist = Infinity;
  discs.forEach((d) => {
    const dr = d.getBoundingClientRect();
    const dx = dr.left + dr.width / 2 - rowCenter;
    const adx = Math.abs(dx);
    const norm = Math.min(1, adx / half);
    d.style.setProperty("--d", norm.toFixed(3));
    if (adx < bestDist) {
      bestDist = adx;
      bestDisc = d;
    }
  });
  if (bestDisc) {
    discs.forEach((d) => d.classList.toggle("is-focus", d === bestDisc));
  }
}

function snapToNearestAndPlay() {
  if (!rowEl || isSnapping || isDragging) return;
  const rowRect = rowEl.getBoundingClientRect();
  const rowCenter = rowRect.left + getSnapCenterX();
  let bestDisc = null;
  let bestDist = Infinity;
  rowEl.querySelectorAll(".project-disc").forEach((d) => {
    const dr = d.getBoundingClientRect();
    const dx = Math.abs(dr.left + dr.width / 2 - rowCenter);
    if (dx < bestDist) {
      bestDist = dx;
      bestDisc = d;
    }
  });
  if (!bestDisc) return;
  const projectId = bestDisc.dataset.projectId;
  const project = allProjects.find((p) => p.id === projectId);
  if (!project) return;
  const wasAlreadyActive = activeProjectId === projectId;
  snapCardToLeft(bestDisc, {
    duration: 0.55,
    ease: "expo.out",
    onComplete: () => {
      setActive(projectId);
      if (!wasAlreadyActive && onSelectCb) onSelectCb(project);
    },
  });
}

function scheduleSnap(delay = 140) {
  if (snapTimer) clearTimeout(snapTimer);
  snapTimer = setTimeout(snapToNearestAndPlay, delay);
}

function onScroll() {
  if (!rowEl || !oneSetWidth || wrapping || isSnapping) return;
  const sl = rowEl.scrollLeft;
  if (sl < oneSetWidth) {
    wrapping = true;
    rowEl.scrollLeft = sl + oneSetWidth;
    requestAnimationFrame(() => {
      wrapping = false;
    });
  } else if (sl >= oneSetWidth * 2) {
    wrapping = true;
    rowEl.scrollLeft = sl - oneSetWidth;
    requestAnimationFrame(() => {
      wrapping = false;
    });
  }
  updateDistanceState();
  if (!isDragging) scheduleSnap();
}

function onWheel(e) {
  // Convert vertical wheel into horizontal scroll for trackpad ergonomics.
  if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
  e.preventDefault();
  if (!wheelScrollTo) {
    wheelScrollTo = gsap.quickTo(rowEl, "scrollLeft", {
      duration: 0.4,
      ease: "power3",
    });
  }
  wheelScrollTo(rowEl.scrollLeft + e.deltaY);
}

function onMouseDown(e) {
  isDragging = true;
  dragMoved = false;
  dragStartX = e.pageX - rowEl.offsetLeft;
  dragScrollLeft = rowEl.scrollLeft;
  rowEl.style.cursor = "grabbing";
  rowEl.style.userSelect = "none";
  if (snapTimer) {
    clearTimeout(snapTimer);
    snapTimer = null;
  }
}

function onMouseMove(e) {
  if (!isDragging) return;
  const x = e.pageX - rowEl.offsetLeft;
  const walk = x - dragStartX;
  if (Math.abs(walk) > 4) dragMoved = true;
  rowEl.scrollLeft = dragScrollLeft - walk;
}

function onMouseUp() {
  if (!isDragging) return;
  isDragging = false;
  rowEl.style.cursor = "";
  rowEl.style.userSelect = "";
  scheduleSnap(60);
  setTimeout(() => {
    dragMoved = false;
  }, 50);
}

function setupDrag() {
  rowEl.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
}

export async function mount(el, onSelect) {
  rowEl = el;
  onSelectCb = onSelect;
  effectsEnabled = shouldEnableEffects();
  const loaded = await loadProjects();
  allProjects = [...loaded];

  for (let c = 0; c < COPIES; c++) {
    allProjects.forEach((p) => rowEl.appendChild(buildDisc(p)));
  }
  setupDrag();
  rowEl.addEventListener("scroll", onScroll, { passive: true });
  rowEl.addEventListener("wheel", onWheel, { passive: false });

  const wrapper = rowEl.parentElement;
  if (wrapper) {
    const prevBtn = wrapper.querySelector("#galleryPrev");
    const nextBtn = wrapper.querySelector("#galleryNext");
    if (prevBtn) prevBtn.addEventListener("click", () => stepFocus(-1));
    if (nextBtn) nextBtn.addEventListener("click", () => stepFocus(1));
  }

  unsubPlayer = player.on("statechange", updatePlayingBadge);

  const initInfinite = () => {
    measureSet();
    if (oneSetWidth) rowEl.scrollLeft = oneSetWidth;
    updateDistanceState();

    const middleDisc =
      rowEl.querySelectorAll(".project-disc")[allProjects.length];
    if (middleDisc && allProjects.length > 0) {
      selectCard(middleDisc, allProjects[0], { silent: true });
    }
  };

  if (document.readyState === "complete") initInfinite();
  else window.addEventListener("load", initInfinite, { once: true });
  window.addEventListener("resize", measureSet);

  window.__selectProjectById = (slug) => {
    const project = allProjects.find((p) => p.id === slug);
    if (!project) return;
    const discs = rowEl.querySelectorAll(
      `.project-disc[data-project-id="${slug}"]`,
    );
    const card = discs[Math.floor(discs.length / 2)] || discs[0];
    if (card) selectCard(card, project);
  };
}

export function destroy() {
  if (snapTimer) {
    clearTimeout(snapTimer);
    snapTimer = null;
  }
  if (unsubPlayer) {
    unsubPlayer();
    unsubPlayer = null;
  }
  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("mouseup", onMouseUp);
  window.removeEventListener("resize", measureSet);
  if (rowEl) {
    rowEl.removeEventListener("scroll", onScroll);
    rowEl.removeEventListener("wheel", onWheel);
  }
  tiltDetachers.forEach((fn) => {
    try {
      fn();
    } catch (_) {}
  });
  tiltDetachers = [];
  wheelScrollTo = null;
  focusedDisc = null;
  rowEl = null;
  allProjects = [];
  activeProjectId = null;
  onSelectCb = null;
}
