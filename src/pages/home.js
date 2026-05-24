import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { buildIntroTimeline } from './home.gsap.js';
import { mount as mountGallery, destroy as destroyGallery } from '../components/gallery.js';
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
let heroPreloadAudio = null;
let unsubHero = null;
let deferredMountTimer = null;
let tabsEl = null;

const PLAY_ICON = `<svg viewBox="0 0 24 24" fill="none"><path d="M5 3L19 12L5 21V3Z" fill="#fff"/></svg>`;
const PAUSE_ICON = `<svg viewBox="0 0 24 24" fill="none"><rect x="6" y="4" width="4" height="16" fill="#fff"/><rect x="14" y="4" width="4" height="16" fill="#fff"/></svg>`;

export async function init(rootEl, ctx) {
    // ── Mobile tab bar: gallery → [Details | Media] → content ──
    const projectSection = rootEl.querySelector('.project-section');
    const rowWrapper = rootEl.querySelector('.project-row-wrapper');
    const projectInfoEl = rootEl.querySelector('#projectInfo');
    const projectFrameEl = rootEl.querySelector('#projectFrame');

    tabsEl = document.createElement('div');
    tabsEl.className = 'mobile-tabs';
    tabsEl.innerHTML = `
        <button class="mobile-tab-btn active" data-tab="details">Details</button>
        <button class="mobile-tab-btn" data-tab="media">Media</button>`;

    if (projectSection && rowWrapper) {
        rowWrapper.insertAdjacentElement('afterend', tabsEl);
    }

    // Initial state: details visible, media hidden (CSS only affects mobile)
    projectFrameEl?.classList.add('tab-hidden');

    tabsEl.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-tab]');
        if (!btn) return;
        const tab = btn.dataset.tab;
        tabsEl.querySelectorAll('.mobile-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        projectInfoEl?.classList.toggle('tab-hidden', tab !== 'details');
        projectFrameEl?.classList.toggle('tab-hidden', tab !== 'media');
    });
    // ──────────────────────────────────────────────────────────

    const video = rootEl.querySelector('#player');
    if (!video) return;
    videoRef = video;
    video.muted = true;
    video.playsInline = true;

    // Hero audio preloader — kicks off the byte download so audioPlayer's
    // <audio> element hits the HTTP cache the moment the user clicks.
    heroPreloadAudio = new Audio();
    heroPreloadAudio.preload = 'auto';
    heroPreloadAudio.src = HERO_TRACK.src;

    let videoReady = false;
    let audioReady = false;
    let wantsPlay = false;
    let started = false;

    // Overlay UI
    const heroEl = video.parentElement;
    const overlay = document.createElement('button');
    overlay.className = 'sound-overlay';
    overlay.setAttribute('aria-label', 'Play/pause hero theme');
    overlay.innerHTML = PLAY_ICON;
    if (heroEl) {
        heroEl.appendChild(overlay);
        heroEl.addEventListener('mouseenter', () => overlay.classList.add('visible'));
        heroEl.addEventListener('mouseleave', () => overlay.classList.remove('visible'));
    }

    const setLoading = (loading) => {
        overlay.style.opacity = loading ? '0.5' : '';
        overlay.style.cursor = loading ? 'progress' : '';
    };

    const updateIcon = () => {
        const s = player.getState();
        const isHeroPlaying = s.track?.id === HERO_TRACK.id && s.playing;
        overlay.innerHTML = isHeroPlaying ? PAUSE_ICON : PLAY_ICON;
    };

    const startSynced = () => {
        if (started) return;
        started = true;
        setLoading(false);
        try { video.currentTime = 0; } catch (_) {}
        // playTrack will play the audio; once it actually starts, we sync the video.
        player.playTrack(HERO_TRACK, [HERO_TRACK]);
    };

    const attemptStart = () => {
        if (wantsPlay && videoReady && audioReady && !started) startSynced();
    };

    // Readiness tracking
    const markVideoReady = () => {
        videoReady = true;
        attemptStart();
    };
    const markAudioReady = () => {
        audioReady = true;
        attemptStart();
    };

    if (video.readyState >= 4) videoReady = true;
    else {
        video.addEventListener('canplaythrough', markVideoReady, { once: true });
        // Fallback: canplay is good enough if canplaythrough never fires (some browsers/streams).
        video.addEventListener('canplay', markVideoReady, { once: true });
    }
    if (heroPreloadAudio.readyState >= 4) audioReady = true;
    else {
        heroPreloadAudio.addEventListener('canplaythrough', markAudioReady, { once: true });
        heroPreloadAudio.addEventListener('canplay', markAudioReady, { once: true });
    }

    // Force the video to actually buffer (preload=auto from markup should already do this, but be explicit).
    try { video.load(); } catch (_) {}

    overlay.addEventListener('click', (e) => {
        e.stopPropagation();
        const s = player.getState();
        if (s.track?.id === HERO_TRACK.id && started) {
            // Toggle pause/resume. Video follows via statechange listener below.
            player.toggle();
            return;
        }
        wantsPlay = true;
        if (videoReady && audioReady) {
            startSynced();
        } else {
            setLoading(true);
        }
    });

    // Keep video in lockstep with the audio player's state.
    const onState = () => {
        updateIcon();
        const s = player.getState();
        if (s.track?.id !== HERO_TRACK.id) {
            // Another track is playing — pause hero video.
            if (!video.paused) { try { video.pause(); } catch (_) {} }
            return;
        }
        if (s.playing) {
            if (video.paused) {
                try { video.currentTime = s.currentTime || 0; } catch (_) {}
                video.play().catch(() => {});
            }
        } else {
            if (!video.paused) { try { video.pause(); } catch (_) {} }
        }
    };
    unsubHero = player.on('statechange', onState);

    // Drift guard — keep video locked to audio clock (audio is the master).
    const onTick = (data) => {
        const s = player.getState();
        if (s.track?.id !== HERO_TRACK.id || !s.playing) return;
        const drift = Math.abs(video.currentTime - data.currentTime);
        if (drift > 0.15 && isFinite(data.currentTime)) {
            try { video.currentTime = data.currentTime; } catch (_) {}
        }
    };
    const unsubTick = player.on('timeupdate', onTick);
    videoRef._unsubTick = unsubTick;
    videoRef._unsubHero = unsubHero;

    // Defer heavy mounts (gallery, project panel, GSAP intro) until the
    // hero video has buffered enough. Fall back after 1.5s to avoid lockup.
    let restMounted = false;
    const mountRest = () => {
        if (restMounted) return;
        restMounted = true;
        if (deferredMountTimer) { clearTimeout(deferredMountTimer); deferredMountTimer = null; }
        const frameMediaEl = rootEl.querySelector('#projectFrameMedia');
        const infoEl = rootEl.querySelector('#projectInfo');
        const rowEl = rootEl.querySelector('#projectRow');
        if (frameMediaEl && infoEl) mountPanel(frameMediaEl, infoEl);
        if (rowEl) mountGallery(rowEl, (project, opts) => selectProject(project, opts));

        introTl = buildIntroTimeline();
    };

    if (video.readyState >= 3) {
        mountRest();
    } else {
        video.addEventListener('canplaythrough', mountRest, { once: true });
        video.addEventListener('canplay', mountRest, { once: true });
        deferredMountTimer = setTimeout(mountRest, 1500);
    }
}

export async function destroy() {
    if (deferredMountTimer) { clearTimeout(deferredMountTimer); deferredMountTimer = null; }
    if (introTl) { introTl.kill(); introTl = null; }
    tabsEl = null;
    ScrollTrigger.getAll().forEach(t => t.kill());
    destroyPanel();
    destroyGallery();
    if (videoRef?._unsubHero) videoRef._unsubHero();
    if (videoRef?._unsubTick) videoRef._unsubTick();
    if (heroPreloadAudio) {
        try { heroPreloadAudio.pause(); heroPreloadAudio.src = ''; } catch (_) {}
        heroPreloadAudio = null;
    }
    if (!videoRef) return;
    try { videoRef.pause(); } catch (_) {}
    try {
        videoRef.removeAttribute('src');
        videoRef.querySelectorAll('source').forEach(s => s.remove());
        videoRef.load();
    } catch (_) {}
    videoRef = null;
}
