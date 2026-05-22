import { gsap } from 'gsap';
import * as player from '../audioPlayer.js';

let frameMediaEl = null;
let infoEl = null;
let unsubPlayer = null;
let currentProject = null;

function formatTime(s) {
    if (!s || isNaN(s)) return '';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
}

function syncTrackHighlight() {
    if (!infoEl) return;
    const state = player.getState();
    infoEl.querySelectorAll('.pi-track-row').forEach(row => {
        const isActive = state.track && state.track.id === row.dataset.trackId;
        row.classList.toggle('playing', isActive);
    });
}

function renderInfo(project) {
    if (!infoEl) return;

    const skills = (project.skills || [])
        .map(s => `<span class="pi-skill-pill">${s}</span>`).join('');

    const collabs = (project.collaborators || []).map(c =>
        c.url
            ? `<a href="${c.url}" target="_blank" rel="noopener noreferrer" class="pi-collab-link">${c.name}</a>`
            : `<span class="pi-collab">${c.name}</span>`
    ).join(', ');

    const links = (project.links || []).map(l =>
        `<a href="${l.url}" target="_blank" rel="noopener noreferrer" class="pi-ext-link">${l.label}</a>`
    ).join('');

    const tracksWithMeta = (project.tracks || []).map(t => ({ ...t, _project: project }));

    const trackRows = (project.tracks || []).map((t, i) => {
        const dur = t.duration ? formatTime(t.duration) : '';
        const hasSrc = !!t.src;
        return `<div class="pi-track-row${hasSrc ? '' : ' no-src'}" data-track-id="${t.id}" data-track-index="${i}" role="${hasSrc ? 'button' : 'presentation'}" tabindex="${hasSrc ? '0' : '-1'}">
            <span class="pi-track-num">${i + 1}</span>
            <span class="pi-track-play">
                <svg viewBox="0 0 24 24" fill="none"><path d="M5 3L19 12L5 21V3Z" fill="currentColor"/></svg>
            </span>
            <span class="pi-track-title">${t.title}</span>
            ${dur ? `<span class="pi-track-dur">${dur}</span>` : ''}
        </div>`;
    }).join('');

    infoEl.innerHTML = `
        <div class="pi-header">
            <h2 class="pi-title">${project.title}</h2>
            <span class="pi-year">${project.year}</span>
        </div>
        ${skills ? `<div class="pi-skills">${skills}</div>` : ''}
        ${project.description ? `<p class="pi-description">${project.description}</p>` : ''}
        ${collabs ? `<p class="pi-collabs"><span class="pi-label">With</span> ${collabs}</p>` : ''}
        ${links ? `<div class="pi-links">${links}</div>` : ''}
        ${tracksWithMeta.length ? `<div class="pi-tracklist"><div class="pi-tracks">${trackRows}</div></div>` : ''}`;

    infoEl.querySelectorAll('.pi-track-row:not(.no-src)').forEach(row => {
        const idx = parseInt(row.dataset.trackIndex, 10);
        const handler = () => player.playTrack(tracksWithMeta[idx], tracksWithMeta);
        row.addEventListener('click', handler);
        row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') handler(); });
    });

    syncTrackHighlight();
}

function sizeMediaWrapper(res) {
    if (!frameMediaEl) return;
    const parent = frameMediaEl.parentElement;
    if (!parent) return;
    const pw = parent.clientWidth;
    const ph = parent.clientHeight;
    if (!res || res.length !== 2 || !pw || !ph) {
        frameMediaEl.style.width = '';
        frameMediaEl.style.height = '';
        return;
    }
    const [vw, vh] = res;
    const ratio = vw / vh;
    let w = pw, h = pw / ratio;
    if (h > ph) { h = ph; w = ph * ratio; }
    frameMediaEl.style.width = `${w}px`;
    frameMediaEl.style.height = `${h}px`;
}

function renderFrame(project) {
    if (!frameMediaEl) return;

    const hasVideo = project.type === 'collab' && project.video?.src;
    const src = hasVideo ? project.video.src : project.artwork;
    const encodedSrc = encodeURI(src);

    frameMediaEl.innerHTML = '';

    const res = project.video?.resolution;
    sizeMediaWrapper(res);

    if (hasVideo) {
        const video = document.createElement('video');
        video.autoplay = true;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        const source = document.createElement('source');
        source.src = encodedSrc;
        source.type = 'video/mp4';
        video.appendChild(source);
        video.load();
        video.play().catch(() => {});
        frameMediaEl.appendChild(video);
    } else {
        const img = document.createElement('img');
        img.src = encodedSrc;
        img.alt = project.title;
        frameMediaEl.appendChild(img);
    }

    const blur = document.createElement('div');
    blur.className = 'frame-blur';
    blur.innerHTML = `
        <div class="frame-blur-layer" style="backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);mask-image:linear-gradient(to bottom, transparent 0%, black 25%);-webkit-mask-image:linear-gradient(to bottom, transparent 0%, black 25%);"></div>
        <div class="frame-blur-layer" style="backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);mask-image:linear-gradient(to bottom, transparent 35%, black 65%);-webkit-mask-image:linear-gradient(to bottom, transparent 35%, black 65%);"></div>
        <div class="frame-blur-layer" style="backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);mask-image:linear-gradient(to bottom, transparent 60%, black 90%);-webkit-mask-image:linear-gradient(to bottom, transparent 60%, black 90%);"></div>
        <div class="frame-blur-tint"></div>`;
    frameMediaEl.appendChild(blur);
}

export function select(project) {
    if (!project) return;
    currentProject = project;

    if (unsubPlayer) { unsubPlayer(); unsubPlayer = null; }

    // Crossfade frame media
    const incoming = frameMediaEl;
    gsap.to(incoming, {
        opacity: 0, duration: 0.2, onComplete: () => {
            renderFrame(project);
            gsap.to(incoming, { opacity: 1, duration: 0.3 });
        }
    });

    renderInfo(project);
    unsubPlayer = player.on('statechange', syncTrackHighlight);

    const tracksWithMeta = (project.tracks || []).map(t => ({ ...t, _project: project }));
    const firstPlayable = tracksWithMeta.find(t => t.src);
    if (firstPlayable) {
        player.playTrack(firstPlayable, tracksWithMeta);
    }
}

function onResize() {
    if (currentProject) sizeMediaWrapper(currentProject.video?.resolution);
}

export function mount(framEl, infEl) {
    frameMediaEl = framEl;
    infoEl = infEl;
    window.addEventListener('resize', onResize);
}

export function destroy() {
    if (unsubPlayer) { unsubPlayer(); unsubPlayer = null; }
    window.removeEventListener('resize', onResize);
    currentProject = null;
}
