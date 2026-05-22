import { start } from './router.js';
import { mount as mountNowPlaying } from './components/nowPlayingBar.js';

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('/sw.js').catch(() => { });
}

const nowPlayingEl = document.getElementById('nowPlaying');
if (nowPlayingEl) mountNowPlaying(nowPlayingEl);

start();
