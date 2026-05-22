const viewContainerId = 'view';
let current = {
    module: null,
    rootEl: null,
    path: null,
};

const routes = [
    {
        name: 'home',
        match: (path) => path === '/' || path === '/index.html',
        viewUrl: '/views/home.html',
        moduleLoader: () => import('./pages/home.js'),
    },
];

function sameOrigin(href) {
    try {
        const url = new URL(href, window.location.origin);
        return url.origin === window.location.origin;
    } catch {
        return false;
    }
}

function isAssetPath(pathname) {
    return /\.(png|jpe?g|gif|svg|webp|mp4|mov|webm|mp3|wav|css|js|json|txt)$/i.test(pathname);
}

const viewCache = new Map();

async function fetchView(url) {
    if (viewCache.has(url)) {
        return viewCache.get(url);
    }
    const res = await fetch(url, { headers: { 'X-Requested-With': 'spa' } });
    if (!res.ok) throw new Error(`Failed to fetch view: ${url}`);
    const html = await res.text();
    viewCache.set(url, html);
    return html;
}

function findRoute(pathname) {
    return routes.find(r => r.match(pathname)) || routes[0];
}

function scrollToHash(hash) {
    if (!hash) return;
    const id = hash.startsWith('#') ? hash.slice(1) : hash;
    const el = document.getElementById(id);
    if (el) {
        try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) { }
    }
}

function navigateSamePageHash(hash, { replace = false } = {}) {
    const h = hash.startsWith('#') ? hash : `#${hash}`;
    const url = new URL(window.location.href);
    url.hash = h;
    try {
        if (replace) {
            window.history.replaceState({}, '', url.pathname + url.search + url.hash);
        } else {
            window.history.pushState({}, '', url.pathname + url.search + url.hash);
        }
    } catch (_) { window.location.hash = h; }
    scrollToHash(h);
}

async function mount(route, ctx, replace = false) {
    const container = document.getElementById(viewContainerId);
    if (!container) return;

    const html = await fetchView(route.viewUrl);
    const wrapper = document.createElement('div');
    wrapper.className = 'view-wrapper';
    wrapper.innerHTML = html;

    if (current.module && typeof current.module.destroy === 'function') {
        try { await current.module.destroy(); } catch { /* no-op */ }
    }

    container.innerHTML = '';
    container.appendChild(wrapper);

    try { window.scrollTo(0, 0); } catch (_) { }

    const pageModule = await route.moduleLoader();
    const ctxObj = { path: window.location.pathname, search: window.location.search, params: new URLSearchParams(window.location.search) };
    if (pageModule && typeof pageModule.init === 'function') {
        await pageModule.init(wrapper, ctxObj);
    }

    current = { module: pageModule, rootEl: wrapper, path: window.location.pathname };

    if (window.location.hash) scrollToHash(window.location.hash);
}

export async function navigate(href, { replace = false } = {}) {
    const url = new URL(href, window.location.origin);
    const route = findRoute(url.pathname);
    if (!route) return;

    if (replace) {
        window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    } else {
        window.history.pushState({}, '', url.pathname + url.search + url.hash);
    }

    await mount(route, { path: url.pathname, search: url.search });
    if (url.hash) scrollToHash(url.hash);
}

function onLinkClick(e) {
    if (e.defaultPrevented) return;
    if (e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const anchor = e.composedPath ? e.composedPath().find(el => el && el.tagName === 'A') : e.target.closest('a');
    if (!anchor) return;
    if (anchor.target && anchor.target.toLowerCase() === '_blank') return;
    const href = anchor.getAttribute('href');
    if (!href) return;
    if (href.startsWith('#')) {
        e.preventDefault();
        navigateSamePageHash(href);
        return;
    }
    if (href.startsWith('/#')) {
        e.preventDefault();
        navigateSamePageHash(href.slice(1));
        return;
    }

    if (!sameOrigin(href)) return;
    const url = new URL(href, window.location.origin);
    if (isAssetPath(url.pathname)) return;

    const route = findRoute(url.pathname);
    if (!route) return;

    e.preventDefault();
    navigate(url.pathname + url.search + url.hash);
}

function onPopState() {
    const route = findRoute(window.location.pathname);
    mount(route, { path: window.location.pathname, search: window.location.search }, true);
}

export async function start() {
    document.addEventListener('click', onLinkClick);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('hashchange', () => scrollToHash(window.location.hash));

    try { if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'; } catch (_) { }
    window.__spaNavigate = (href) => navigate(href);

    await navigate(window.location.pathname + window.location.search + window.location.hash, { replace: true });
}
