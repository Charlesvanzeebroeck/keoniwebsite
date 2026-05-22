import { gsap } from 'gsap';
import { loadProjects } from '../data.js';

let rowEl = null;
let allProjects = [];
let activeCard = null;
let onSelectCb = null;

// Drag-to-scroll state
let isDragging = false;
let dragStartX = 0;
let dragScrollLeft = 0;
let dragMoved = false;

function centerCard(card) {
    if (!rowEl || !card) return;
    const target = card.offsetLeft - rowEl.offsetWidth / 2 + card.offsetWidth / 2;
    gsap.to(rowEl, { scrollLeft: target, duration: 0.55, ease: 'power2.inOut' });
}

function selectCard(card, project) {
    if (activeCard) activeCard.classList.remove('active');
    activeCard = card;
    card.classList.add('active');
    centerCard(card);
    if (onSelectCb) onSelectCb(project);
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
        <div class="disc-year-badge">${project.year}</div>`;

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

function setupDrag() {
    rowEl.addEventListener('mousedown', e => {
        isDragging = true;
        dragMoved = false;
        dragStartX = e.pageX - rowEl.offsetLeft;
        dragScrollLeft = rowEl.scrollLeft;
        rowEl.style.cursor = 'grabbing';
        rowEl.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', e => {
        if (!isDragging) return;
        const x = e.pageX - rowEl.offsetLeft;
        const walk = x - dragStartX;
        if (Math.abs(walk) > 4) dragMoved = true;
        rowEl.scrollLeft = dragScrollLeft - walk;
    });

    window.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        rowEl.style.cursor = '';
        rowEl.style.userSelect = '';
        setTimeout(() => { dragMoved = false; }, 50);
    });
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

    allProjects.forEach(p => rowEl.appendChild(buildDisc(p)));
    setupDrag();

    // Auto-select first project
    const firstCard = rowEl.querySelector('.project-disc');
    if (firstCard && allProjects.length > 0) {
        selectCard(firstCard, allProjects[0]);
    }

    // Expose for nowPlayingBar
    window.__selectProjectById = (slug) => {
        const card = rowEl.querySelector(`.project-disc[data-project-id="${slug}"]`);
        const project = allProjects.find(p => p.id === slug);
        if (card && project) selectCard(card, project);
    };
}
