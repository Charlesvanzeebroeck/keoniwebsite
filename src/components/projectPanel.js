import { gsap } from 'gsap';
import * as player from '../audioPlayer.js';

let frameMediaEl = null;
let infoEl = null;
let unsubPlayer = null;
let currentProject = null;
let currentVideo = null;

function videoForTrack(project, trackCmsId) {
    if (!project || trackCmsId == null) return null;
    return (project.videos || []).find(v => v.trackId === trackCmsId) || null;
}

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
        .map(s => `<span>${s}</span>`).join('');

    const collabs = (project.collaborators || []).map(c =>
        c.url
            ? `<a href="${c.url}" target="_blank" rel="noopener noreferrer" class="pi-collab-link">${c.name}</a>`
            : c.name
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
        ${collabs ? `<p class="pi-collabs">With ${collabs}</p>` : ''}
        ${links ? `<div class="pi-links">${links}</div>` : ''}
        ${tracksWithMeta.length ? `<div class="pi-tracklist">${trackRows}</div>` : ''}`;

    infoEl.querySelectorAll('.pi-track-row:not(.no-src)').forEach(row => {
        const idx = parseInt(row.dataset.trackIndex, 10);
        const handler = () => {
            const track = tracksWithMeta[idx];
            player.playTrack(track, tracksWithMeta);
            const linked = videoForTrack(project, track.cmsId);
            if (linked && linked.src && linked !== currentVideo) {
                renderFrame(project, { silent: false, video: linked });
            }
        };
        row.addEventListener('click', handler);
        row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') handler(); });
    });

    syncTrackHighlight();
    revealInfo();
}

function revealInfo() {
    if (!infoEl) return;
    const children = Array.from(infoEl.children);
    if (!children.length) return;
    gsap.fromTo(children,
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', stagger: 0.06, clearProps: 'transform' }
    );
}

function sizeMediaWrapper(res) {
    if (!frameMediaEl) return;
    if (!res || res.length !== 2) {
        frameMediaEl.style.aspectRatio = '';
        return;
    }
    const [vw, vh] = res;
    frameMediaEl.style.aspectRatio = `${vw} / ${vh}`;
}

function renderFrame(project, opts = {}) {
    if (!frameMediaEl) return;
    const { silent = false, video: overrideVideo = null } = opts;

    const video = overrideVideo || project.video || (project.videos && project.videos[0]) || null;
    currentVideo = video;
    const hasVideo = project.type === 'collab' && video?.src;
    const src = hasVideo ? video.src : project.artwork;
    const encodedSrc = encodeURI(src);

    frameMediaEl.innerHTML = '';

    const res = video?.resolution;
    sizeMediaWrapper(res);

    const fmt = project.artworkFormats || {};
    const posterSrc = fmt.medium || fmt.large || fmt.small || project.artwork;

    if (hasVideo) {
        const video = document.createElement('video');
        video.autoplay = !silent;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = silent ? 'none' : 'metadata';
        if (posterSrc) video.poster = encodeURI(posterSrc);
        const source = document.createElement('source');
        source.src = encodedSrc;
        source.type = 'video/mp4';
        video.appendChild(source);
        if (!silent) {
            video.load();
            video.play().catch(() => {});
        }
        frameMediaEl.appendChild(video);
    } else {
        const img = document.createElement('img');
        const srcset = [
            fmt.small && `${encodeURI(fmt.small)} 500w`,
            fmt.medium && `${encodeURI(fmt.medium)} 750w`,
            fmt.large && `${encodeURI(fmt.large)} 1000w`,
        ].filter(Boolean).join(', ');
        if (srcset) {
            img.srcset = srcset;
            img.sizes = '(max-width: 768px) 100vw, 60vw';
        }
        img.src = encodeURI(fmt.large || fmt.medium || project.artwork || src);
        img.alt = project.title;
        img.loading = 'lazy';
        img.decoding = 'async';
        frameMediaEl.appendChild(img);
    }

}

export function select(project, opts = {}) {
    if (!project) return;
    const { silent = false } = opts;
    currentProject = project;

    if (unsubPlayer) { unsubPlayer(); unsubPlayer = null; }

    // Crossfade frame media
    const incoming = frameMediaEl;
    gsap.to(incoming, {
        opacity: 0, duration: 0.2, onComplete: () => {
            renderFrame(project, { silent });
            gsap.to(incoming, { opacity: 1, duration: 0.3 });
        }
    });

    renderInfo(project);
    unsubPlayer = player.on('statechange', syncTrackHighlight);

    if (silent) return;

    const tracksWithMeta = (project.tracks || []).map(t => ({ ...t, _project: project }));
    const firstPlayable = tracksWithMeta.find(t => t.src);
    if (firstPlayable) {
        player.playTrack(firstPlayable, tracksWithMeta);
    }
}

function onResize() {
    if (currentProject) sizeMediaWrapper(currentVideo?.resolution || currentProject.video?.resolution);
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
    currentVideo = null;
}
