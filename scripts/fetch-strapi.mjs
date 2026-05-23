#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUTPUT = resolve(ROOT, 'public/projects.json');
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

function mapTrack(t, projectSlug, i) {
    const file = t.file || {};
    return {
        id: `${projectSlug}-track-${i + 1}`,
        title: t.title,
        src: abs(file.url),
        ...(t.duration != null ? { duration: t.duration } : {}),
    };
}

function defaultResolution(format) {
    if (format === 'v') return [9, 16];
    return [16, 9];
}

function mapVideo(v) {
    if (!v) return undefined;
    const file = v.file || {};
    return {
        src: abs(file.url),
        preview: abs(file.url),
        format: v.format,
        resolution: Array.isArray(v.resolution) && v.resolution.length === 2 ? v.resolution : defaultResolution(v.format),
    };
}

function mapProject(entry) {
    const slug = entry.slug || entry.documentId;
    return {
        id: slug,
        title: entry.title,
        type: entry.type,
        year: entry.year,
        skills: entry.skills || [],
        description: entry.description || '',
        artwork: abs(entry.artwork?.url),
        video: mapVideo(entry.video),
        tracks: (entry.tracks || []).map((t, i) => mapTrack(t, slug, i)),
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

const projects = entries.map(mapProject);
await writeFile(OUTPUT, JSON.stringify({ projects }, null, 2) + '\n', 'utf8');
console.log(`[fetch-strapi] Wrote ${projects.length} projects → public/projects.json`);
