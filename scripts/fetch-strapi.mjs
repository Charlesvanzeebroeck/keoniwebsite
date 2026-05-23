#!/usr/bin/env node
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUTPUT = resolve(ROOT, 'public/projects.json');
const MEDIA_DIR = resolve(ROOT, 'public/cms');
const MEDIA_PREFIX = '/cms';
const ENV_FILE = resolve(ROOT, '.env');

if (existsSync(ENV_FILE) && !process.env.STRAPI_URL) {
    const raw = await readFile(ENV_FILE, 'utf8');
    for (const line of raw.split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (!m) continue;
        const [, key, val] = m;
        if (!(key in process.env)) {
            process.env[key] = val.replace(/^["']|["']$/g, '');
        }
    }
}

const STRAPI_URL = (process.env.STRAPI_URL || '').replace(/\/+$/, '').replace(/\/admin$/, '');
const STRAPI_TOKEN = process.env.STRAPI_TOKEN;

if (!STRAPI_URL || !STRAPI_TOKEN) {
    console.warn('[fetch-strapi] STRAPI_URL or STRAPI_TOKEN not set — skipping fetch, using committed public/projects.json.');
    process.exit(0);
}

function abs(url) {
    if (!url) return url;
    if (/^https?:\/\//i.test(url)) return url;
    return STRAPI_URL + (url.startsWith('/') ? url : '/' + url);
}

const downloadPromises = new Map();
let stats = { downloaded: 0, cached: 0, bytes: 0 };

async function downloadOnce(absUrl) {
    if (!absUrl) return absUrl;
    if (downloadPromises.has(absUrl)) return downloadPromises.get(absUrl);
    const p = (async () => {
        const name = basename(new URL(absUrl).pathname);
        const dest = resolve(MEDIA_DIR, name);
        const localUrl = `${MEDIA_PREFIX}/${name}`;
        if (existsSync(dest)) {
            stats.cached++;
            return localUrl;
        }
        await mkdir(MEDIA_DIR, { recursive: true });
        const res = await fetch(absUrl);
        if (!res.ok || !res.body) {
            console.warn(`  ⚠ download failed ${res.status} ${absUrl}`);
            return absUrl;
        }
        await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
        const size = (await stat(dest)).size;
        stats.downloaded++;
        stats.bytes += size;
        return localUrl;
    })();
    downloadPromises.set(absUrl, p);
    return p;
}

async function localize(url) {
    if (!url) return url;
    return downloadOnce(abs(url));
}

async function localizeFormats(formats) {
    if (!formats) return undefined;
    const out = {};
    for (const [k, v] of Object.entries(formats)) {
        out[k] = await downloadOnce(v);
    }
    return out;
}

async function mapTrack(t, projectSlug, i) {
    const file = t.file || {};
    return {
        id: `${projectSlug}-track-${i + 1}`,
        title: t.title,
        src: await localize(file.url),
        ...(t.duration != null ? { duration: t.duration } : {}),
    };
}

function defaultResolution(format) {
    if (format === 'v') return [9, 16];
    return [16, 9];
}

function extractFormats(media) {
    if (!media?.formats) return undefined;
    const out = {};
    for (const key of ['thumbnail', 'small', 'medium', 'large']) {
        const f = media.formats[key];
        if (f?.url) out[key] = abs(f.url);
    }
    return Object.keys(out).length ? out : undefined;
}

async function mapVideo(v) {
    if (!v) return undefined;
    const file = v.file || {};
    const src = await localize(file.url);
    return {
        src,
        preview: src,
        format: v.format,
        resolution: Array.isArray(v.resolution) && v.resolution.length === 2 ? v.resolution : defaultResolution(v.format),
    };
}

async function mapProject(entry) {
    const slug = entry.slug || entry.documentId;
    const [artwork, artworkFormats, video, tracks] = await Promise.all([
        localize(entry.artwork?.url),
        localizeFormats(extractFormats(entry.artwork)),
        mapVideo(entry.video),
        Promise.all((entry.tracks || []).map((t, i) => mapTrack(t, slug, i))),
    ]);
    return {
        id: slug,
        title: entry.title,
        type: entry.type,
        year: entry.year,
        skills: entry.skills || [],
        description: entry.description || '',
        artwork,
        artworkFormats,
        video,
        tracks,
        collaborators: entry.collaborators || [],
        links: entry.links || [],
    };
}

const query =
    'populate[artwork]=true' +
    '&populate[video][populate]=*' +
    '&populate[tracks][populate]=*' +
    '&populate[collaborators]=*' +
    '&populate[links]=*' +
    '&pagination[pageSize]=100' +
    '&sort=year:desc';

const endpoint = `${STRAPI_URL}/api/projects?${query}`;

console.log(`[fetch-strapi] GET ${endpoint}`);
const res = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${STRAPI_TOKEN}` },
});

if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[fetch-strapi] HTTP ${res.status} ${res.statusText}\n${body}`);
    process.exit(1);
}

const json = await res.json();
const entries = Array.isArray(json.data) ? json.data : [];

if (entries.length === 0) {
    console.warn('[fetch-strapi] No projects returned from Strapi — keeping existing public/projects.json.');
    process.exit(0);
}

const projects = await Promise.all(entries.map(mapProject));
await writeFile(OUTPUT, JSON.stringify({ projects }, null, 2) + '\n', 'utf8');
console.log(`[fetch-strapi] Wrote ${projects.length} projects → public/projects.json`);
console.log(`[fetch-strapi] Media: ${stats.downloaded} downloaded (${(stats.bytes / 1024 / 1024).toFixed(1)} MB), ${stats.cached} cached`);
