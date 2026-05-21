// db.js — the entire data layer.
//
// Design rules (see plan "Data layer & top-tier"):
//   - ONE stateful file: server/data/project.sqlite. Nothing else on disk is mutable.
//   - A real schema with an ordered migration runner (`_migrations` table).
//   - The whole project is one JSON document in `projects.doc`. Every mutation goes
//     through updateProject(id, mutator): BEGIN IMMEDIATE -> read -> structuredClone ->
//     mutate -> validate against the document schema -> write -> COMMIT -> THEN emit SSE.
//   - Binaries (renders, refs, exports, uploads) live in the `assets` BLOB table,
//     deduped by sha256. No PNGs scattered on disk.

import { DatabaseSync } from 'node:sqlite';
import { EventEmitter } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDocument } from './docSchema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.GINK_DATA_DIR || join(__dirname, '..', 'data');
const DB_PATH = process.env.GINK_DB_PATH || join(DATA_DIR, 'project.sqlite');

mkdirSync(DATA_DIR, { recursive: true });

export const projectBus = new EventEmitter();
projectBus.setMaxListeners(0);

// ─── migrations ──────────────────────────────────────────────────────────────

const migrations = [
  {
    id: '0001_init',
    up(db) {
      db.exec(`
        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          slug TEXT UNIQUE,
          title TEXT,
          doc TEXT NOT NULL,
          schema_version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE assets (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          mime TEXT NOT NULL,
          sha256 TEXT NOT NULL,
          byte_size INTEGER NOT NULL,
          width INTEGER,
          height INTEGER,
          source_name TEXT,
          bytes BLOB NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE(project_id, sha256)
        );
        CREATE TABLE renders (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          panel_id TEXT NOT NULL,
          page_id TEXT,
          asset_id TEXT,
          model TEXT,
          seed INTEGER,
          mode TEXT,
          prompt_snapshot TEXT,
          negative_snapshot TEXT,
          ref_asset_ids TEXT,
          is_current INTEGER NOT NULL DEFAULT 1,
          status TEXT NOT NULL DEFAULT 'done',
          error TEXT,
          created_at TEXT NOT NULL
        );
        CREATE TABLE reference_renders (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          target_type TEXT NOT NULL,
          target_id TEXT NOT NULL,
          asset_id TEXT,
          prompt_snapshot TEXT,
          is_current INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL
        );
        CREATE TABLE jobs (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          scope TEXT,
          status TEXT NOT NULL DEFAULT 'running',
          progress REAL NOT NULL DEFAULT 0,
          total INTEGER NOT NULL DEFAULT 0,
          message TEXT,
          error TEXT,
          started_at TEXT NOT NULL,
          finished_at TEXT
        );
        CREATE TABLE events (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          at TEXT NOT NULL,
          action TEXT NOT NULL,
          payload TEXT
        );
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
        CREATE INDEX idx_renders_panel ON renders(project_id, panel_id, is_current);
        CREATE INDEX idx_refrenders_target ON reference_renders(project_id, target_type, target_id, is_current);
        CREATE INDEX idx_assets_sha ON assets(project_id, sha256);
        CREATE INDEX idx_events_proj ON events(project_id, at);
        CREATE INDEX idx_jobs_proj ON jobs(project_id, started_at);
      `);
    },
  },
];

// ─── connection ──────────────────────────────────────────────────────────────

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA busy_timeout = 5000;');
db.exec('PRAGMA foreign_keys = ON;');

function runMigrations() {
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(db.prepare('SELECT id FROM _migrations').all().map(r => r.id));
  for (const m of migrations) {
    if (applied.has(m.id)) continue;
    db.exec('BEGIN');
    try {
      m.up(db);
      db.prepare('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)').run(m.id, new Date().toISOString());
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${m.id} failed: ${err.message}`);
    }
  }
}
runMigrations();

export { db };

// ─── helpers ─────────────────────────────────────────────────────────────────

const uuid = () => randomUUID();
const now = () => new Date().toISOString();

function slugify(s) {
  return String(s || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'project';
}

function uniqueSlug(base) {
  let slug = slugify(base);
  let n = 1;
  while (db.prepare('SELECT 1 FROM projects WHERE slug = ?').get(slug)) slug = `${slugify(base)}-${++n}`;
  return slug;
}

// ─── settings ────────────────────────────────────────────────────────────────

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}
export function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
}

// ─── projects (the document) ─────────────────────────────────────────────────

function rowToProject(row) {
  if (!row) return null;
  const doc = JSON.parse(row.doc);
  doc.id = row.id;
  return doc;
}

export function listProjects() {
  return db.prepare('SELECT id, slug, title, created_at, updated_at FROM projects ORDER BY updated_at DESC').all();
}

export function getProject(id) {
  return rowToProject(db.prepare('SELECT * FROM projects WHERE id = ? OR slug = ?').get(id, id));
}

export function createProject(doc) {
  const id = doc.id || uuid();
  const title = doc.title || 'Untitled Manga';
  const slug = uniqueSlug(title);
  const full = { ...doc, id };
  const errs = validateDocument(full);
  if (errs.length) throw new Error(`Invalid project document: ${errs.join('; ')}`);
  const ts = now();
  db.prepare('INSERT INTO projects (id, slug, title, doc, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, slug, title, JSON.stringify(full), 1, ts, ts);
  setSetting('currentProjectId', id);
  queueMicrotask(() => projectBus.emit('project:updated', { projectId: id, action: 'created' }));
  return full;
}

/** The one mutation entry point. mutator(doc) mutates a fresh clone in place; return value ignored. */
export function updateProject(id, mutator, { action = 'update', payload = null, silent = false } = {}) {
  db.exec('BEGIN IMMEDIATE');
  let next;
  try {
    const row = db.prepare('SELECT * FROM projects WHERE id = ? OR slug = ?').get(id, id);
    if (!row) throw new Error(`Project ${id} not found`);
    next = JSON.parse(row.doc);
    next.id = row.id;
    mutator(next);
    const errs = validateDocument(next);
    if (errs.length) throw new Error(`Mutation produced an invalid document: ${errs.join('; ')}`);
    db.prepare('UPDATE projects SET title = ?, doc = ?, updated_at = ? WHERE id = ?')
      .run(next.title || row.title, JSON.stringify(next), now(), row.id);
    if (action && action !== 'silent') {
      db.prepare('INSERT INTO events (id, project_id, at, action, payload) VALUES (?, ?, ?, ?, ?)')
        .run(uuid(), row.id, now(), action, payload ? JSON.stringify(payload) : null);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  if (!silent) queueMicrotask(() => projectBus.emit('project:updated', { projectId: next.id, action }));
  return next;
}

export function deleteProject(id) {
  const row = db.prepare('SELECT id FROM projects WHERE id = ? OR slug = ?').get(id, id);
  if (!row) return false;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const t of ['assets', 'renders', 'reference_renders', 'jobs', 'events']) db.prepare(`DELETE FROM ${t} WHERE project_id = ?`).run(row.id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(row.id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  if (getSetting('currentProjectId') === row.id) {
    const fallback = db.prepare('SELECT id FROM projects ORDER BY updated_at DESC LIMIT 1').get();
    if (fallback) setSetting('currentProjectId', fallback.id); else db.prepare('DELETE FROM settings WHERE key = ?').run('currentProjectId');
  }
  queueMicrotask(() => projectBus.emit('project:updated', { projectId: row.id, action: 'deleted' }));
  return true;
}

export function addHistory(doc, action, payload) {
  if (!Array.isArray(doc.history)) doc.history = [];
  doc.history.unshift({ at: now(), action, payload: payload ?? null });
  if (doc.history.length > 500) doc.history.length = 500;
}

// ─── assets (binaries, sha256-deduped) ───────────────────────────────────────

export function putAsset(projectId, { kind, mime, bytes, width = null, height = null, sourceName = null }) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const sha = createHash('sha256').update(buf).digest('hex');
  const existing = db.prepare('SELECT id FROM assets WHERE project_id = ? AND sha256 = ?').get(projectId, sha);
  if (existing) return existing.id;
  const id = uuid();
  db.prepare('INSERT INTO assets (id, project_id, kind, mime, sha256, byte_size, width, height, source_name, bytes, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, projectId, kind, mime, sha, buf.length, width, height, sourceName, buf, now());
  return id;
}

export function getAsset(id) {
  return db.prepare('SELECT * FROM assets WHERE id = ?').get(id) || null;
}

// ─── renders ─────────────────────────────────────────────────────────────────

export function recordRender(projectId, { panelId, pageId = null, assetId = null, model = null, seed = null, mode = null, prompt = null, negative = null, refAssetIds = [], status = 'done', error = null }) {
  const id = uuid();
  if (status === 'done') db.prepare('UPDATE renders SET is_current = 0 WHERE project_id = ? AND panel_id = ?').run(projectId, panelId);
  db.prepare('INSERT INTO renders (id, project_id, panel_id, page_id, asset_id, model, seed, mode, prompt_snapshot, negative_snapshot, ref_asset_ids, is_current, status, error, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, projectId, panelId, pageId, assetId, model, seed, mode, prompt, negative, JSON.stringify(refAssetIds), status === 'done' ? 1 : 0, status, error, now());
  return id;
}

export function listRenders(projectId, panelId) {
  return db.prepare('SELECT * FROM renders WHERE project_id = ? AND panel_id = ? ORDER BY created_at DESC').all(projectId, panelId);
}

export function setCurrentRender(projectId, panelId, renderId) {
  const r = db.prepare('SELECT * FROM renders WHERE id = ? AND project_id = ? AND panel_id = ?').get(renderId, projectId, panelId);
  if (!r) return null;
  db.prepare('UPDATE renders SET is_current = 0 WHERE project_id = ? AND panel_id = ?').run(projectId, panelId);
  db.prepare('UPDATE renders SET is_current = 1 WHERE id = ?').run(renderId);
  return r;
}

// ─── jobs ────────────────────────────────────────────────────────────────────

export function createJob(projectId, kind, scope = null, total = 0) {
  const id = uuid();
  db.prepare('INSERT INTO jobs (id, project_id, kind, scope, status, progress, total, started_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, projectId, kind, scope ? JSON.stringify(scope) : null, 'running', 0, total, now());
  return id;
}
export function updateJob(id, patch) {
  const cur = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  if (!cur) return;
  const merged = { ...cur, ...patch };
  db.prepare('UPDATE jobs SET status=?, progress=?, total=?, message=?, error=?, finished_at=? WHERE id=?')
    .run(merged.status, merged.progress, merged.total, merged.message ?? null, merged.error ?? null, merged.finished_at ?? null, id);
  queueMicrotask(() => projectBus.emit('project:updated', { projectId: cur.project_id, action: 'job', jobId: id }));
}
export function getJob(id) { return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) || null; }
export function listJobs(projectId) { return db.prepare('SELECT * FROM jobs WHERE project_id = ? ORDER BY started_at DESC LIMIT 30').all(projectId); }

// ─── events ──────────────────────────────────────────────────────────────────

export function listEvents(projectId, limit = 50) {
  return db.prepare('SELECT * FROM events WHERE project_id = ? ORDER BY at DESC LIMIT ?').all(projectId, limit);
}
