#!/usr/bin/env node
/**
 * One-shot migration: pushes public/projects.json into Strapi.
 *
 * Requires:
 *   STRAPI_URL          — e.g. https://innovative-confidence-8a0967f3c3.strapiapp.com
 *   STRAPI_WRITE_TOKEN  — full-access API token (NOT the read-only one)
 *
 * Usage:
 *   node scripts/ingest-to-strapi.mjs           # ingest all
 *   node scripts/ingest-to-strapi.mjs --dry-run # show what would be sent
 *   node scripts/ingest-to-strapi.mjs --slug=fever-shiver  # one project
 *
 * Idempotent: skips projects whose slug already exists in Strapi.
 */
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PUBLIC_DIR = resolve(ROOT, 'public');
const SOURCE = resolve(PUBLIC_DIR, 'projects.json');
const ENV_FILE = resolve(ROOT, '.env');

if (existsSync(ENV_FILE)) {
    const raw = await readFile(ENV_FILE, 'utf8');
    for (const line of raw.split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (!m) continue;
        if (!(m[1] in process.env)) {
            process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
        }
    }
}

const STRAPI_URL = (process.env.STRAPI_URL || '').replace(/\/+$/, '').replace(/\/admin$/, '');
const STRAPI_TOKEN = process.env.STRAPI_WRITE_TOKEN;

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');

if (!DRY && (!STRAPI_URL || !STRAPI_TOKEN)) {
    console.error('Missing STRAPI_URL or STRAPI_WRITE_TOKEN in env / .env');
    process.exit(1);
}
const onlySlug = [...args].find((a) => a.startsWith('--slug='))?.split('=')[1];

const MIME = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg',
};

function authHeaders(extra = {}) {
    return { Authorization: `Bearer ${STRAPI_TOKEN}`, ...extra };
}

async function api(path, init = {}) {
    const res = await fetch(`${STRAPI_URL}${path}`, {
        ...init,
        headers: { ...authHeaders(), 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
    const text = await res.text();
    if (!res.ok) {
        throw new Error(`${init.method || 'GET'} ${path} → ${res.status}\n${text}`);
    }
    return text ? JSON.parse(text) : null;
}

const uploadCache = new Map();

async function uploadFile(relPath) {
    if (!relPath) return null;
    if (uploadCache.has(relPath)) return uploadCache.get(relPath);

    const absPath = resolve(PUBLIC_DIR, '.' + (relPath.startsWith('/') ? relPath : '/' + relPath));
    if (!existsSync(absPath)) {
        console.warn(`  ⚠ file missing: ${absPath}`);
        return null;
    }

    const name = basename(absPath);
    const ext = extname(absPath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    const size = (await stat(absPath)).size;
    console.log(`  ↑ upload ${name} (${(size / 1024 / 1024).toFixed(2)} MB)`);

    if (DRY) {
        const fake = { id: 0, url: relPath };
        uploadCache.set(relPath, fake);
        return fake;
    }

    const buf = await readFile(absPath);
    const fd = new FormData();
    fd.append('files', new Blob([buf], { type: mime }), name);

    const res = await fetch(`${STRAPI_URL}/api/upload`, {
        method: 'POST',
        headers: authHeaders(),
        body: fd,
    });
    if (!res.ok) {
        const t = await res.text();
        throw new Error(`upload ${name} → ${res.status}\n${t}`);
    }
    const [media] = await res.json();
    uploadCache.set(relPath, media);
    return media;
}

async function findBySlug(slug) {
    const params = new URLSearchParams({
        'filters[slug][$eq]': slug,
        'pagination[pageSize]': '1',
        status: 'draft',
    });
    const json = await api(`/api/projects?${params}`);
    return json.data?.[0] || null;
}

async function ingestProject(p) {
    console.log(`\n→ ${p.id}  (${p.title})`);

    if (!DRY) {
        const existing = await findBySlug(p.id);
        if (existing) {
            console.log(`  ⤳ already exists (id=${existing.id}), skipping`);
            return;
        }
    }

    const artworkMedia = await uploadFile(p.artwork);

    let videoComp = null;
    if (p.video?.src) {
        const vMedia = await uploadFile(p.video.src);
        videoComp = {
            file: vMedia?.id ?? null,
            format: p.video.format,
            resolution: p.video.resolution ?? null,
        };
    }

    const tracks = [];
    for (const t of p.tracks || []) {
        const tMedia = await uploadFile(t.src);
        tracks.push({
            title: t.title,
            file: tMedia?.id ?? null,
            ...(t.duration != null ? { duration: t.duration } : {}),
        });
    }

    const collaborators = (p.collaborators || []).map((c) =>
        typeof c === 'string' ? { name: c, url: '' } : { name: c.name || '', url: c.url || '' }
    );
    const links = (p.links || []).map((l) =>
        typeof l === 'string' ? { label: l, url: l } : { label: l.label || l.title || '', url: l.url || l.href || '' }
    );

    const payload = {
        data: {
            title: p.title,
            slug: p.id,
            type: p.type,
            year: p.year,
            description: p.description || '',
            skills: p.skills || [],
            artwork: artworkMedia?.id ?? null,
            video: videoComp,
            tracks,
            collaborators,
            links,
            publishedAt: new Date().toISOString(),
        },
    };

    if (DRY) {
        console.log('  (dry) POST /api/projects', JSON.stringify(payload, null, 2));
        return;
    }

    const created = await api('/api/projects', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
    console.log(`  ✓ created id=${created.data.id}`);
}

const { projects } = JSON.parse(await readFile(SOURCE, 'utf8'));
const targets = onlySlug ? projects.filter((p) => p.id === onlySlug) : projects;

if (targets.length === 0) {
    console.error(`No projects matched.`);
    process.exit(1);
}

console.log(`Ingesting ${targets.length} project(s) into ${STRAPI_URL}${DRY ? ' (dry run)' : ''}`);

for (const p of targets) {
    try {
        await ingestProject(p);
    } catch (e) {
        console.error(`  ✗ failed: ${e.message}`);
    }
}

console.log('\nDone.');
