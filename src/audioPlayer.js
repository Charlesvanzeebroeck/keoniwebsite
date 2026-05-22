// Singleton audio engine. One <audio> element, survives SPA navigations.

const listeners = {};

function emit(event, data) {
    (listeners[event] || []).forEach(fn => fn(data));
}

export function on(event, fn) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(fn);
    return () => {
        listeners[event] = listeners[event].filter(f => f !== fn);
    };
}

let audio = null;
let queue = [];       // array of { ...track, _project }
let queueIndex = -1;
let shuffleActive = false;

function getAudio() {
    if (!audio) {
        audio = document.createElement('audio');
        audio.preload = 'metadata';
        document.body.appendChild(audio);

        audio.addEventListener('timeupdate', () => {
            emit('timeupdate', { currentTime: audio.currentTime, duration: audio.duration || 0 });
        });
        audio.addEventListener('ended', () => {
            next();
        });
        audio.addEventListener('play', () => emit('statechange', getState()));
        audio.addEventListener('pause', () => emit('statechange', getState()));
        audio.addEventListener('loadedmetadata', () => emit('statechange', getState()));

        // Restore volume from localStorage
        const saved = localStorage.getItem('keoni_volume');
        if (saved !== null) audio.volume = parseFloat(saved);
        const savedMute = localStorage.getItem('keoni_muted');
        if (savedMute === 'true') audio.muted = true;
    }
    return audio;
}

export function getState() {
    const a = getAudio();
    return {
        track: queue[queueIndex] || null,
        playing: !a.paused && !a.ended,
        currentTime: a.currentTime,
        duration: a.duration || 0,
        volume: a.volume,
        muted: a.muted,
        shuffleActive,
    };
}

export function setQueue(tracks, startIndex = 0) {
    queue = tracks;
    queueIndex = startIndex;
    return { play: () => _playIndex(startIndex) };
}

export function playTrack(track, projectTracks) {
    if (projectTracks) {
        const idx = projectTracks.findIndex(t => t.id === track.id);
        queue = projectTracks;
        queueIndex = idx >= 0 ? idx : 0;
    } else {
        queue = [track];
        queueIndex = 0;
    }
    _playIndex(queueIndex);
}

function _playIndex(index) {
    if (index < 0 || index >= queue.length) return;
    queueIndex = index;
    const track = queue[index];
    const a = getAudio();
    if (!track.src) {
        emit('statechange', getState());
        return;
    }
    a.src = encodeURI(track.src);
    a.load();
    a.play().catch(() => {});
    emit('statechange', getState());
}

export function play() {
    if (queueIndex < 0 && queue.length > 0) queueIndex = 0;
    if (queueIndex >= 0 && queue[queueIndex]) {
        const a = getAudio();
        if (!a.src && queue[queueIndex].src) {
            a.src = encodeURI(queue[queueIndex].src);
            a.load();
        }
        a.play().catch(() => {});
    }
}

export function pause() {
    getAudio().pause();
}

export function toggle() {
    const a = getAudio();
    if (a.paused) play();
    else pause();
}

export function next() {
    if (!queue.length) return;
    const nextIndex = (queueIndex + 1) % queue.length;
    _playIndex(nextIndex);
}

export function prev() {
    if (!queue.length) return;
    const a = getAudio();
    if (a.currentTime > 3) {
        a.currentTime = 0;
        return;
    }
    const prevIndex = (queueIndex - 1 + queue.length) % queue.length;
    _playIndex(prevIndex);
}

export async function shuffle(getAllTracksFn) {
    const all = await getAllTracksFn();
    if (!all.length) return;
    // Fisher-Yates shuffle
    const shuffled = [...all];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    queue = shuffled;
    queueIndex = 0;
    shuffleActive = true;
    _playIndex(0);
}

export function seek(time) {
    const a = getAudio();
    a.currentTime = time;
}

export function setVolume(v) {
    const a = getAudio();
    a.volume = Math.max(0, Math.min(1, v));
    localStorage.setItem('keoni_volume', a.volume);
    emit('volumechange', getState());
}

export function toggleMute() {
    const a = getAudio();
    a.muted = !a.muted;
    localStorage.setItem('keoni_muted', a.muted);
    emit('statechange', getState());
}

// Boot the audio element so volume restores before first interaction
getAudio();
