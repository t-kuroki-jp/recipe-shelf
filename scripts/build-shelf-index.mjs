#!/usr/bin/env node
/**
 * Zero-dependency Shelf data.json generator for local CLI & GitHub Actions (GitHub Pages).
 *
 * Usage:
 *   node scripts/build-shelf-index.mjs <shelf-dir> [--visibility=public,internal]
 */
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA_V1 = 'studio.item/v1';

function parseArgs(argv) {
  let targetDir = '.';
  let visibilityFilter = null;
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--visibility=')) {
      visibilityFilter = arg
        .slice('--visibility='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (!arg.startsWith('--')) {
      targetDir = arg;
    }
  }
  return { targetDir: path.resolve(targetDir), visibilityFilter };
}

function isEnvelope(obj) {
  return (
    obj &&
    typeof obj === 'object' &&
    !Array.isArray(obj) &&
    obj.schema === SCHEMA_V1 &&
    typeof obj.kind === 'string' &&
    typeof obj.id === 'string' &&
    obj.payload &&
    typeof obj.payload === 'object' &&
    !Array.isArray(obj.payload)
  );
}

function walkJsonFiles(baseDir, currentDir, out) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'snapshots') continue;
    const full = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walkJsonFiles(baseDir, full, out);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json') && entry.name !== 'data.json') {
      const stat = fs.statSync(full);
      out.push({
        absPath: full,
        rel: path.relative(baseDir, full).replace(/\\/g, '/'),
        mtimeIso: stat.mtime.toISOString().slice(0, 19),
      });
    }
  }
}

function readJsonSafe(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function folderCategory(rel) {
  const parts = rel.split('/');
  if (parts.length < 2) return '';
  return parts[parts.length - 2].replace(/^\d+[_-]/, '').trim();
}

function normalizeVisibility(v) {
  if (v === 'private' || v === 'draft') return 'private';
  if (v === 'public') return 'public';
  return 'internal';
}

const { targetDir, visibilityFilter } = parseArgs(process.argv);
const allowedVis = visibilityFilter && visibilityFilter.length > 0 ? new Set(visibilityFilter) : null;

const hasDecks = fs.existsSync(path.join(targetDir, 'decks')) && fs.statSync(path.join(targetDir, 'decks')).isDirectory();
const hasItems = fs.existsSync(path.join(targetDir, 'items')) && fs.statSync(path.join(targetDir, 'items')).isDirectory();

if (!hasDecks && !hasItems) {
  console.error(`[build-shelf-index] Neither decks/ nor items/ found in: ${targetDir}`);
  process.exit(1);
}

const mode = hasDecks ? 'decks' : 'items';
const collectionDir = path.join(targetDir, mode);
const files = [];
walkJsonFiles(collectionDir, collectionDir, files);

const existingData = readJsonSafe(path.join(targetDir, 'data.json'));
const shelfConfig = readJsonSafe(path.join(targetDir, 'shelf.json'));
const prevMap = new Map();
for (const row of (existingData && Array.isArray(existingData[mode]) ? existingData[mode] : [])) {
  if (row && typeof row.id === 'string') prevMap.set(row.id, row);
}

let output;
if (mode === 'decks') {
  const decks = [];
  for (const f of files) {
    const parsed = readJsonSafe(f.absPath);
    if (!parsed) continue;
    const id = (typeof parsed.id === 'string' && parsed.id) || path.basename(f.absPath, '.json');
    const prev = prevMap.get(id) || {};
    const vis = normalizeVisibility(parsed.visibility ?? prev.visibility);
    if (allowedVis && !allowedVis.has(vis)) continue;
    const cat = folderCategory(f.rel);
    const fileRef = `./decks/${f.rel}`;
    if (isEnvelope(parsed)) {
      const meta = parsed.meta || {};
      const slideCount = typeof meta.slideCount === 'number'
        ? meta.slideCount
        : Array.isArray(parsed.payload.slides)
          ? parsed.payload.slides.length
          : (prev.slideCount || 0);
      const entry = {
        id,
        title: parsed.title || prev.title || id,
        category: cat || parsed.category || prev.category || 'その他',
        updatedAt: parsed.updatedAt || prev.updatedAt || f.mtimeIso,
        description: parsed.summary ?? prev.description ?? '',
        slideCount,
        file: fileRef,
        visibility: vis,
        schema: SCHEMA_V1,
        kind: parsed.kind,
      };
      if (Array.isArray(parsed.tags) && parsed.tags.length > 0) entry.tags = parsed.tags;
      if (typeof meta.theme === 'string') entry.theme = meta.theme;
      decks.push(entry);
    } else {
      decks.push({
        id,
        title: parsed.title || prev.title || id,
        category: cat || parsed.category || prev.category || 'その他',
        updatedAt: parsed.updatedAt || prev.updatedAt || f.mtimeIso,
        description: parsed.description || parsed.summary || prev.description || '',
        slideCount: Array.isArray(parsed.slides) ? parsed.slides.length : (parsed.slideCount || prev.slideCount || 0),
        file: fileRef,
      });
    }
  }
  decks.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || String(a.id).localeCompare(String(b.id)));
  output = {
    playlists: (shelfConfig && Array.isArray(shelfConfig.playlists) ? shelfConfig.playlists : null) ??
      (existingData && Array.isArray(existingData.playlists) ? existingData.playlists : []),
    decks,
  };
} else {
  const items = [];
  for (const f of files) {
    const parsed = readJsonSafe(f.absPath);
    if (!parsed) continue;
    const id = (typeof parsed.id === 'string' && parsed.id) || path.basename(f.absPath, '.json');
    const prev = prevMap.get(id) || {};
    const vis = normalizeVisibility(parsed.visibility ?? prev.visibility);
    if (allowedVis && !allowedVis.has(vis)) continue;
    const cat = folderCategory(f.rel);
    const fileRef = `items/${f.rel}`;
    if (isEnvelope(parsed)) {
      items.push({
        ...(parsed.meta || {}),
        id,
        title: parsed.title || prev.title || id,
        category: cat || parsed.category || prev.category || '',
        summary: parsed.summary ?? prev.summary ?? '',
        tags: Array.isArray(parsed.tags) ? parsed.tags : (prev.tags || []),
        visibility: vis,
        updatedAt: parsed.updatedAt || prev.updatedAt || f.mtimeIso,
        file: fileRef,
        schema: SCHEMA_V1,
        kind: parsed.kind,
      });
    } else {
      items.push({
        ...prev,
        id,
        title: parsed.title || prev.title || id,
        category: cat || parsed.category || prev.category || '',
        summary: parsed.summary || prev.summary || '',
        tags: Array.isArray(parsed.tags) ? parsed.tags : (prev.tags || []),
        file: fileRef,
      });
    }
  }
  items.sort((a, b) => String(a.code || '').localeCompare(String(b.code || ''), 'en', { numeric: true }) || String(a.id).localeCompare(String(b.id)));
  output = {
    schema_version: (shelfConfig && shelfConfig.schema_version) ?? (existingData && existingData.schema_version) ?? 1,
    title: (shelfConfig && shelfConfig.title) ?? (existingData && existingData.title) ?? 'Shelf',
    items,
  };
}

const outPath = path.join(targetDir, 'data.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
console.log(`[build-shelf-index] Generated ${outPath} (${mode}: ${output[mode].length} entries)`);
