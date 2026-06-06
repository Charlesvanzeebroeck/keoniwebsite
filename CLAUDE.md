# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Portfolio site for "keoni" — a vanilla-JS SPA built with Vite. Deployed on vercel (Hostinger DNS). No framework; uses GSAP for animation and native HTML5 `<video>` for video playback.

## Video is visual, not interactive

Videos on this site are **visual support for the music**, never the primary content. They always render as `<video playsinline preload="metadata" muted autoplay loop>` with **no `controls` attribute** — the user is meant to hear the track and see the imagery, not scrub or pause the video. Do not add Plyr, custom video controls, or any control UI back. If you ever need user-facing playback controls, that signals a product-direction change — confirm with the user before adding.

## Commands

- `npm run dev` — start Vite dev server
- `npm run build` — production build to `dist/`
- `npm run preview` — preview built output

No test or lint scripts are configured.

## Architecture

### Custom SPA router (`src/router.js`)

There is no framework router. `src/router.js` defines a small route table and intercepts all left-clicks on `<a>` tags to do client-side navigation via `history.pushState`. Key behaviors:

- Views are HTML fragments under `public/views/` (`home.html`, `projects.html`, `project-detail.html`), fetched and cached in a `Map`, then injected into `#view` in `index.html`.
- Each route pairs the fragment with a page module under `src/pages/` (e.g. `pages/home.js`). Modules export `init(rootEl, ctx)` and optionally `destroy()` — the router calls `destroy()` on the outgoing module before swapping DOM.
- The router exposes `window.__spaNavigate(href)` so page modules can navigate programmatically.
- Special transition: when navigating from `/projects` or `/project-detail` back to `/`, the router awaits `current.module.prepareHomeTransition()` (if exported) before unmount — used to animate the `.mask` element before swapping views.
- External links, `target="_blank"`, modified clicks, and asset-extension paths (see `isAssetPath`) bypass the SPA.
- Hash links (`#foo`, `/#foo`) are handled as same-page smooth scrolls without remounting.
- `history.scrollRestoration` is forced to `'manual'`; every mount scrolls to top, then to the hash if present.

### Page modules

Each page in `src/pages/` is split into a logic file (`home.js`) and an animation file (`home.gsap.js`). The `.gsap.js` files own GSAP timelines; the page logic imports from them. Follow this split when adding pages.

### Data

`src/data.js` exposes `loadProjects()` which fetches `/projects.json` once and caches the result in-module. Project detail pages read `?slug=` (or similar) from the URL via the `ctx.params` URLSearchParams passed into `init`.

### Service worker

`public/sw.js` is registered once from `src/main.js` (only on HTTPS or localhost). When changing caching behavior, bump the cache version inside `sw.js` — the SPA router caches view fragments in-memory separately.

## Vercel configuration

Deployed on Vercel — all hosting config lives in `vercel.json` at the project root. The old Netlify files (`public/_redirects`, `public/_headers`) are not read by Vercel and should be considered stale; edit `vercel.json` instead.

- **SPA fallback**: the `rewrites` rule `{ "source": "/((?!.*\\.).*)", "destination": "/index.html" }` sends every non-asset path to `index.html` so the SPA router can handle deep links.
- **Headers** (`vercel.json` → `headers`): HSTS, CSP, Permissions-Policy, and long-lived immutable cache for `/videos`, `/audio`, `/artwork`, `/thumbnails`, `/cms`, plus `*.css` / `*.js`. `/projects.json` gets a short 60s cache so CMS rebuilds show up quickly.
- **CSP is strict**: no `unsafe-inline` or `unsafe-eval` in `script-src`. Do not introduce inline `<script>` or `eval`/`new Function` (GSAP works without eval). Adding any new third-party origin means updating the CSP value in `vercel.json`.
- **Build settings**: `buildCommand: npm run build`, `outputDirectory: dist`, `framework: vite`. `npm run build` runs the `prebuild` Strapi fetch first — see the root `CLAUDE.md` for the content pipeline and required `STRAPI_URL` / `STRAPI_TOKEN` env vars on Vercel.
- See `SECURITY_ISSUES.md` for the rationale behind the headers and the Permissions-Policy allowlist (autoplay/fullscreen/picture-in-picture restricted to `self`).

## Conventions

- Vanilla ES modules, `type: "module"`. No TypeScript, no JSX, no bundled framework.
- Vite serves `public/` at the root, so reference assets as `/style.css`, `/videos/...`, `/views/...` — not relative paths.
- When adding a route: add an entry to the `routes` array in `src/router.js`, a fragment in `public/views/`, and a module in `src/pages/` exporting `init` (and `destroy` if it sets up listeners/timelines).
