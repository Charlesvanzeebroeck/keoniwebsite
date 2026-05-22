import { gsap } from 'gsap';
import { loadProjects } from '../data.js';
import * as player from '../audioPlayer.js';

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

// Drag-to-scroll state
let isDragging = false;
let dragStartX = 0;
let dragScrollLeft = 0;
let dragMoved = false;

function updatePlayingBadge() {
    if (!rowEl) return;
    const s = player.getState();
    const playing = !!s.playing;
    rowEl.querySelectorAll('.project-disc.active').forEach(d => {
        d.classList.toggle('is-playing', playing);
    });
}

function setActive(projectId) {
    activeProjectId = projectId;
    if (!rowEl) return;
    rowEl.querySelectorAll('.project-disc').forEach(d => {
        d.classList.toggle('active', d.dataset.projectId === projectId);
    });
    updatePlayingBadge();
}

function snapCardToLeft(card, opts = {}) {
    if (!rowEl || !card) return;
    const { duration = 0.5, ease = 'power2.inOut', onComplete } = opts;
    const target = card.offsetLeft;
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
    const div = document.createElement('div');
    div.className = 'project-disc';
    div.dataset.projectId = project.id;
    div.setAttribute('role', 'button');
    div.setAttribute('tabindex', '0');
    div.setAttribute('aria-label', project.title);

    const encodedArt = encodeURI(project.artwork || '');
    div.innerHTML = `
        <img src="${encodedArt}" alt="${project.title}" loading="lazy" draggable="false">
        <div class="disc-year-badge">${project.year}</div>
        <div class="disc-playing-badge" aria-hidden="true"><span></span><span></span><span></span></div>`;

    div.addEventListener('click', () => {
        if (dragMoved) return;
        selectCard(div, project);
    });
    div.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectCard(div, project);
        }
    });

    return div;
}

function measureSet() {
    if (!rowEl) return;
    oneSetWidth = rowEl.scrollWidth / COPIES;
}

function snapToNearestAndPlay() {
    if (!rowEl || isSnapping || isDragging) return;
    const rowLeft = rowEl.getBoundingClientRect().left;
    let bestDisc = null;
    let bestDist = Infinity;
    rowEl.querySelectorAll('.project-disc').forEach(d => {
        const dx = Math.abs(d.getBoundingClientRect().left - rowLeft);
        if (dx < bestDist) {
            bestDist = dx;
            bestDisc = d;
        }
    });
    if (!bestDisc) return;
    const projectId = bestDisc.dataset.projectId;
    const project = allProjects.find(p => p.id === projectId);
    if (!project) return;
    const wasAlreadyActive = activeProjectId === projectId;
    snapCardToLeft(bestDisc, {
        duration: 0.35,
        ease: 'power3.out',
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
        requestAnimationFrame(() => { wrapping = false; });
    } else if (sl >= oneSetWidth * 2) {
        wrapping = true;
        rowEl.scrollLeft = sl - oneSetWidth;
        requestAnimationFrame(() => { wrapping = false; });
    }
    if (!isDragging) scheduleSnap();
}

function onMouseDown(e) {
    isDragging = true;
    dragMoved = false;
    dragStartX = e.pageX - rowEl.offsetLeft;
    dragScrollLeft = rowEl.scrollLeft;
    rowEl.style.cursor = 'grabbing';
    rowEl.style.userSelect = 'none';
    if (snapTimer) { clearTimeout(snapTimer); snapTimer = null; }
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
    rowEl.style.cursor = '';
    rowEl.style.userSelect = '';
    scheduleSnap(60);
    setTimeout(() => { dragMoved = false; }, 50);
}

function setupDrag() {
    rowEl.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
}

export async function mount(el, onSelect) {
    rowEl = el;
    onSelectCb = onSelect;
    const loaded = await loadProjects();
    allProjects = [...loaded];
    for (let i = allProjects.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allProjects[i], allProjects[j]] = [allProjects[j], allProjects[i]];
    }

    for (let c = 0; c < COPIES; c++) {
        allProjects.forEach(p => rowEl.appendChild(buildDisc(p)));
    }
    setupDrag();
    rowEl.addEventListener('scroll', onScroll, { passive: true });

    unsubPlayer = player.on('statechange', updatePlayingBadge);

    const initInfinite = () => {
        measureSet();
        if (oneSetWidth) rowEl.scrollLeft = oneSetWidth;

        const middleDisc = rowEl.querySelectorAll('.project-disc')[allProjects.length];
        if (middleDisc && allProjects.length > 0) {
            selectCard(middleDisc, allProjects[0], { silent: true });
        }
    };

    if (document.readyState === 'complete') initInfinite();
    else window.addEventListener('load', initInfinite, { once: true });
    window.addEventListener('resize', measureSet);

    window.__selectProjectById = (slug) => {
        const project = allProjects.find(p => p.id === slug);
        if (!project) return;
        const discs = rowEl.querySelectorAll(`.project-disc[data-project-id="${slug}"]`);
        const card = discs[Math.floor(discs.length / 2)] || discs[0];
        if (card) selectCard(card, project);
    };
}

export function destroy() {
    if (snapTimer) { clearTimeout(snapTimer); snapTimer = null; }
    if (unsubPlayer) { unsubPlayer(); unsubPlayer = null; }
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('resize', measureSet);
    if (rowEl) rowEl.removeEventListener('scroll', onScroll);
    rowEl = null;
    allProjects = [];
    activeProjectId = null;
    onSelectCb = null;
}
