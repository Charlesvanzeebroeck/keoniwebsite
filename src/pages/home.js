import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { buildIntroTimeline } from './home.gsap.js';
import { mount as mountGallery } from '../components/gallery.js';
import { mount as mountPanel, select as selectProject, destroy as destroyPanel } from '../components/projectPanel.js';
import * as player from '../audioPlayer.js';

const HERO_TRACK = {
    id: '__hero',
    title: 'Hero Theme',
    src: '/Portofolio/landingong.mp3',
    _project: { id: '__hero', title: 'Keoni', artwork: '/Portofolio/Musics/placeholder.png' },
};

let videoRef = null;
let introTl = null;

export async function init(rootEl, ctx) {
    const video = rootEl.querySelector('#player');
    if (!video) return;
    videoRef = video;

    // Hero video autoplay
    const tryPlay = () => {
        try {
            const p = video.play();
            if (p?.catch) p.catch(() => {});
        } catch (_) {}
    };
    video.muted = true;
    video.playsInline = true;
    video.load();
    tryPlay();
    setTimeout(tryPlay, 60);
    video.addEventListener('canplay', tryPlay, { once: true });
    if (document.visibilityState === 'visible') setTimeout(tryPlay, 150);
    document.addEventListener('click', tryPlay, { once: true });
    document.addEventListener('touchstart', tryPlay, { once: true });
    video.addEventListener('pause', () => video.play());

    // Hero play/pause overlay — drives the audio player with the hero song
    const heroEl = video.parentElement;
    let unsubHero = null;
    if (heroEl) {
        const overlay = document.createElement('button');
        overlay.className = 'sound-overlay';
        overlay.setAttribute('aria-label', 'Play/pause hero theme');
        const updateIcon = () => {
            const s = player.getState();
            const isHeroPlaying = s.track?.id === HERO_TRACK.id && s.playing;
            overlay.innerHTML = isHeroPlaying
                ? `<svg viewBox="0 0 24 24" fill="none"><rect x="6" y="4" width="4" height="16" fill="#fff"/><rect x="14" y="4" width="4" height="16" fill="#fff"/></svg>`
                : `<svg viewBox="0 0 24 24" fill="none"><path d="M5 3L19 12L5 21V3Z" fill="#fff"/></svg>`;
        };
        updateIcon();
        heroEl.appendChild(overlay);
        heroEl.addEventListener('mouseenter', () => overlay.classList.add('visible'));
        heroEl.addEventListener('mouseleave', () => overlay.classList.remove('visible'));
        overlay.addEventListener('click', (e) => {
            e.stopPropagation();
            const s = player.getState();
            if (s.track?.id === HERO_TRACK.id) {
                player.toggle();
            } else {
                player.playTrack(HERO_TRACK, [HERO_TRACK]);
            }
        });
        unsubHero = player.on('statechange', updateIcon);
        videoRef._unsubHero = unsubHero;
    }

    // Panel + gallery
    const frameMediaEl = rootEl.querySelector('#projectFrameMedia');
    const infoEl = rootEl.querySelector('#projectInfo');
    const rowEl = rootEl.querySelector('#projectRow');

    if (frameMediaEl && infoEl) mountPanel(frameMediaEl, infoEl);
    if (rowEl) mountGallery(rowEl, (project) => selectProject(project));

    // GSAP intro
    introTl = buildIntroTimeline();
}

export async function destroy() {
    if (introTl) { introTl.kill(); introTl = null; }
    ScrollTrigger.getAll().forEach(t => t.kill());
    destroyPanel();
    if (videoRef?._unsubHero) { videoRef._unsubHero(); }
    if (!videoRef) return;
    try { videoRef.pause(); } catch (_) {}
    try {
        videoRef.removeAttribute('src');
        videoRef.querySelectorAll('source').forEach(s => s.remove());
        videoRef.load();
    } catch (_) {}
    videoRef = null;
}
