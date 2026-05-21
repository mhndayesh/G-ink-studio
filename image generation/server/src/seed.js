// seed.js — load the bundled "others" manga (../../new-g-ink-xport) as a demo
// project so `npm run reset` gives you something to click through immediately.
// Pass --force to wipe an existing demo project of the same title first.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listProjects, deleteProject, createProject } from './db.js';
import { buildProjectFromBundle } from './ingest/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FORCE = process.argv.includes('--force');

// the sample bundle ships one directory up from g-ink-v2
const CANDIDATES = [
  join(__dirname, '..', '..', '..', 'new-g-ink-xport'),
  join(__dirname, '..', '..', 'new-g-ink-xport'),
  process.env.GINK_SAMPLE_DIR,
].filter(Boolean);

function bundleDir() { for (const d of CANDIDATES) if (d && existsSync(join(d, 'others-story.md'))) return d; return null; }

function main() {
  const dir = bundleDir();
  if (!dir) { console.error('Sample bundle not found (looked for others-story.md in:', CANDIDATES.join(', '), '). Skipping seed.'); return; }
  const story = readFileSync(join(dir, 'others-story.md'), 'utf8');
  const visuals = existsSync(join(dir, 'others-visuals.md')) ? readFileSync(join(dir, 'others-visuals.md'), 'utf8') : '';
  const doc = buildProjectFromBundle({ story, visuals }, { title: 'others — demo' });

  if (FORCE) for (const p of listProjects()) if (p.title === doc.title) { deleteProject(p.id); console.log('Removed existing demo project', p.id); }

  const created = createProject(doc);
  console.log(`Seeded "${created.title}" — ${created.characters.length} characters, ${created.locations.length} locations, ${created.chapters.length} chapter(s), ${created.pages.length} page(s), ${created.panels.length} panel(s).`);
  console.log(`Project id: ${created.id}`);
}
main();
