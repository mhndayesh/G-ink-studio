// server.test.js — run with `npm test` in server/ (node --test).
// Uses an isolated temp SQLite file so it never touches your real data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

process.env.GINK_DB_PATH = join(tmpdir(), `gink-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
process.env.AI_PROVIDER = 'off';
process.env.IMAGE_SERVER_TYPE = 'placeholder';

const cleanup = () => { try { rmSync(process.env.GINK_DB_PATH); rmSync(process.env.GINK_DB_PATH + '-wal'); rmSync(process.env.GINK_DB_PATH + '-shm'); } catch {} };
process.on('exit', cleanup);

test('rule files load and rules engine emits a tag list, not prose', async () => {
  const { compilePrompt, cleanPromptText } = await import('./ai/rules.js');
  const { newProjectDoc } = await import('./docSchema.js');
  const doc = newProjectDoc('t');
  const out = compilePrompt('character', { appearance: 'a man sits at a kitchen table staring at a phone in a dim apartment.', outfit: 'grey shirt', props: 'cigarette' }, doc);
  assert.ok(out.prompt.toLowerCase().startsWith('manga style'), 'starts with the system tags');
  assert.ok(out.prompt.includes(','), 'is a comma-separated list');
  assert.ok(!/\.\s/.test(out.prompt), 'no sentence-ending periods inside the prompt');
  assert.equal(cleanPromptText('manga, manga, photo,  ,blurry'), 'manga, photo, blurry');
});

test('detectCameraShot pulls the framing out of the visual prose', async () => {
  const { detectCameraShot, normalizeCameraShot } = await import('./ai/shots.js');
  assert.equal(detectCameraShot('Two-shot capturing Kinji sitting up slightly, his gaze locking onto Odo'), 'two-shot');
  assert.equal(detectCameraShot('Close-up on the manila folder spread open on a low table'), 'close-up');
  assert.equal(detectCameraShot('Wide establishing shot of a cramped, dimly lit apartment interior'), 'establishing shot');
  assert.equal(detectCameraShot('Low angle shot looking up at Kinji from the floor'), 'low angle shot');
  assert.equal(detectCameraShot('Medium close-up of the device in her hand'), 'medium close-up');
  assert.equal(detectCameraShot('she just stands there'), '');                 // nothing recognisable
  assert.equal(normalizeCameraShot('Action Shot'), '');                        // ingest junk → cleared
  assert.equal(normalizeCameraShot('Close-Up'), 'close-up');                   // case-fold
  assert.equal(normalizeCameraShot('two-shot'), 'two-shot');                   // already valid
});

test('document schema rejects an out-of-vocabulary camera shot', async () => {
  const { validateDocument, newProjectDoc } = await import('./docSchema.js');
  const { buildProjectFromBundle } = await import('./ingest/index.js');
  const story = `# G\n\nx | y | z\n\n## SYNOPSIS\n\ns\n\n# FULL STORY\n\n## Chapter 1: C\n\nArc: A\n\n## Story\n\nPage 1: p\nPanel 1: A wide shot of a street.\n`;
  const visuals = `# VISUAL REFERENCE - G\n\n# CHARACTER REFERENCE SHEETS\n\n## a man - Lead\n\n  Age: 30\n  AI prompt (positive): manga style, a plain man\n\n# CHAPTERS\n\n## Chapter 1: C\n\n  Page 1 - Scene: Scene 1\n    Panel 1 [Medium / Action Shot / Normal]\n      Visual: A wide shot of a street.\n`;
  const doc = buildProjectFromBundle({ story, visuals }, {});
  assert.equal(validateDocument(doc).length, 0, 'ingest never produces an invalid cameraShot');
  assert.equal(doc.panels[0].cameraShot, 'wide shot', 'shot detected from the visual prose, not the "[… / Action Shot / …]" header junk');
  doc.panels[0].cameraShot = 'Reaction Shot';
  assert.ok(validateDocument(doc).some(e => /bad cameraShot/.test(e)));
});

test('compilePanelPrompt branches on render mode (tags for t2i, instruction for i2i)', async () => {
  const { compilePanelPrompt, resolvePanelMode } = await import('./ai/rules.js');
  const { newProjectDoc } = await import('./docSchema.js');
  const doc = newProjectDoc('t');
  doc.characters.push({ id: 'c1', name: 'Kinji', imagePrompt: 'manga style, black and white, man in his 30s, dark messy hair, lazy eyes, light beard, worn suit, loose tie, cigarette', refs: [] });
  doc.locations.push({ id: 'l1', name: "Kinji's Apartment", type: 'interior', description: 'A cramped, dimly lit second-floor walk-up. Peeling wallpaper, low table, clutter.', imagePrompt: 'manga style, black and white, cramped apartment interior, peeling wallpaper, low table, clutter', refs: [] });
  const panel = { id: 'p1', number: 1, characters: ['c1'], locationId: 'l1', cameraShot: 'two-shot', visual: 'two-shot of Kinji', action: 'Kinji sets his beer can down on the table', mood: 'tense, dim', dialogue: 'Kinji: "Vanished?"', renderMode: 'auto' };

  // no refs → t2i → comma-separated tag list, system tags first
  assert.equal(resolvePanelMode(doc, panel), 't2i');
  const t2i = compilePanelPrompt(doc, panel);
  assert.equal(t2i.mode, 't2i');
  assert.ok(t2i.prompt.toLowerCase().startsWith('manga style'), 't2i prompt leads with system tags');
  assert.ok(t2i.prompt.includes('two-shot') && t2i.prompt.includes('worn suit'), 't2i merges shot + character visual tags verbatim');
  assert.ok(!/[a-z]\. [A-Z]/.test(t2i.prompt), 't2i prompt is not prose');

  // give the character a reference image → i2i → a natural-language edit instruction, NOT a tag list
  doc.characters[0].refs = ['asset_fake'];
  assert.equal(resolvePanelMode(doc, panel), 'i2i');
  const i2i = compilePanelPrompt(doc, panel);
  assert.equal(i2i.mode, 'i2i');
  assert.ok(/reference image/i.test(i2i.prompt), 'i2i prompt references the reference image');
  assert.ok(/Kinji's Apartment/i.test(i2i.prompt), 'i2i prompt names the scene');
  assert.ok(/\.$/.test(i2i.prompt), 'i2i prompt reads as sentences');
  assert.ok(!i2i.prompt.includes('worn suit'), 'i2i prompt does NOT re-describe the character — the reference image carries that');

  // explicit renderMode wins; with no refs available, even renderMode:'i2i' falls back to t2i (that is what would render)
  doc.characters[0].refs = [];
  const forcedI2I = { ...panel, renderMode: 'i2i' };
  assert.equal(resolvePanelMode(doc, forcedI2I), 't2i', 'renderMode:i2i with no refs → t2i');

  // a second referenced character + renderMode:'auto' → i2i-2refs
  doc.characters.push({ id: 'c2', name: 'Odo', imagePrompt: 'manga style, young man, supermarket vest', refs: ['asset_fake2'] });
  doc.characters[0].refs = ['asset_fake'];
  const twoRef = { ...panel, characters: ['c1', 'c2'], renderMode: 'auto' };
  assert.equal(resolvePanelMode(doc, twoRef), 'i2i-2refs');
  const i2i2 = compilePanelPrompt(doc, twoRef);
  assert.equal(i2i2.mode, 'i2i-2refs');
  assert.ok(/two reference images/i.test(i2i2.prompt) && /Kinji and Odo/.test(i2i2.prompt), 'i2i-2refs names both referenced characters');
});

test('document schema rejects a broken document', async () => {
  const { validateDocument, newProjectDoc } = await import('./docSchema.js');
  assert.equal(validateDocument(newProjectDoc('ok')).length, 0);
  const bad = newProjectDoc('bad'); bad.currentStage = 'nope';
  assert.ok(validateDocument(bad).length > 0);
  const bad2 = newProjectDoc('bad2'); bad2.panels.push({ id: 'p1', pageId: 'missing', number: 1 });
  assert.ok(validateDocument(bad2).some(e => /unknown page/.test(e)));
});

test('ingest builds a valid project from the bundle text', async () => {
  const { buildProjectFromBundle, previewIngest } = await import('./ingest/index.js');
  const { validateDocument } = await import('./docSchema.js');
  const story = `# Tiny\n\nMystery | x | y\n\n## SYNOPSIS\n\nA short synopsis.\n\n## CHARACTERS\n\nkinji sato - Primary Main Character\n  Some backstory - Traits: Apathetic, Sharp\n\n# FULL STORY\n\n## Chapter 1: The Start\n\nArc: A\nStructure beat: setup\n\n## Story\n\nPage 1: stuff happens. Mood: tense\nPanel 1: Wide establishing shot of a room. kinji slouches. Night.\n\n## Chapter Review\n\nOpen hook: something.\n`;
  const visuals = `# VISUAL REFERENCE - Tiny\n\n# CHARACTER REFERENCE SHEETS\n\n## kinji sato - Primary Main Character\n\n  Age: 30\n  Hair style: messy black\n  Clothing style: worn suit\n  AI prompt (positive): manga style, tall thin man, messy black hair, worn suit\n\n# LOCATIONS\n\n## A Room - Interior\n\n  Description: A dim cluttered room.\n  AI prompt (positive): manga background, dim cluttered room\n\n# CHAPTERS\n\n## Chapter 1: The Start\n\nStatus: completed\n\n  Page 1 - Scene: Scene 1 - Location: A Room\n    Purpose: stuff happens\n    Mood: tense\n    Panel 1 [Medium / Establishing Shot / Slow]\n      Visual: Wide establishing shot of a room.\n      Action: kinji slouches.\n      Mood: tense\n      Narration: Night.\n      Render mode: t2i\n`;
  const pv = previewIngest({ story, visuals });
  assert.ok(pv.counts.panels >= 1);
  const doc = buildProjectFromBundle({ story, visuals }, {});
  assert.equal(validateDocument(doc).length, 0);
  assert.ok(doc.characters.length >= 1);
  assert.ok(doc.panels[0].imagePrompt === '');           // panel prompts are NOT compiled at ingest
  assert.ok(doc.characters[0].imagePrompt.startsWith('manga style')); // character prompt comes straight from the sheet
});

test('stage gates and the staleness cascade behave', async () => {
  const db = await import('./db.js');
  const { newProjectDoc } = await import('./docSchema.js');
  const { evalGate, advanceStage, revertStage } = await import('./stages.js');
  const { buildProjectFromBundle } = await import('./ingest/index.js');
  const { aiFillCast, aiFillPages } = await import('./ai/director.js');

  // tiny project with 1 chapter/page/panel
  const story = `# G\n\nx | y | z\n\n## SYNOPSIS\n\ns\n\n# FULL STORY\n\n## Chapter 1: C\n\nArc: A\nStructure beat: setup\n\n## Story\n\nPage 1: p. Mood: m\nPanel 1: A wide shot of a street. A man walks. Day.\n`;
  const visuals = `# VISUAL REFERENCE - G\n\n# CHARACTER REFERENCE SHEETS\n\n## a man - Lead\n\n  Age: 30\n  AI prompt (positive): manga style, a plain man\n\n# CHAPTERS\n\n## Chapter 1: C\n\nStatus: draft\n\n  Page 1 - Scene: Scene 1\n    Purpose: p\n    Mood: m\n    Panel 1 [Medium / Wide Shot / Normal]\n      Visual: A wide shot of a street.\n      Action: A man walks.\n      Narration: Day.\n`;
  const created = db.createProject(buildProjectFromBundle({ story, visuals }, { title: 'gate-test' }));
  const id = created.id;

  // story gate should pass (it has chapter/page/panel with source text)
  assert.ok(evalGate(db.getProject(id), 'story').ok);
  advanceStage(id);
  assert.equal(db.getProject(id).currentStage, 'cast');

  // cast gate: character already has a prompt from the sheet; locations none used -> ok
  assert.ok(evalGate(db.getProject(id), 'cast').ok);
  await aiFillCast(id);                       // no-op (already filled), still fine
  advanceStage(id);
  assert.equal(db.getProject(id).currentStage, 'pages');

  // pages gate fails until prompts are compiled
  assert.equal(evalGate(db.getProject(id), 'pages').ok, false);
  await aiFillPages(id, {});
  const after = db.getProject(id);
  assert.ok(after.panels[0].imagePrompt.startsWith('manga style'));
  assert.ok(after.panels[0].cameraShot);
  assert.ok(evalGate(after, 'pages').ok);
  advanceStage(id);
  assert.equal(db.getProject(id).currentStage, 'render');

  // revert from render -> pages marks the render stale (it was never rendered, but the flag must set)
  revertStage(id, 'pages');
  const rev = db.getProject(id);
  assert.equal(rev.currentStage, 'pages');
  assert.equal(rev.panels[0]._renderStale, true);
});

test('zipStore produces a parseable ZIP and sanitizeCells clamps', async () => {
  const { zipStore } = await import('./export/bundle.js');
  const { sanitizeCells } = await import('./layout.js');
  const z = zipStore([{ name: 'a.txt', bytes: 'hello' }, { name: 'b/c.svg', bytes: '<svg/>' }]);
  assert.equal(z.readUInt32LE(0), 0x04034b50, 'starts with a local file header');
  assert.ok(z.includes(Buffer.from([0x50, 0x4b, 0x05, 0x06])), 'has an end-of-central-directory record');
  assert.ok(z.length > 50);
  const cells = sanitizeCells([{ panelId: 'p1', x: -10, y: 200, w: 500, h: 3 }, { panelId: 'p2', x: 10, y: 10, w: 40, h: 40 }], ['p1', 'p2', 'p3']);
  assert.equal(cells.length, 3);
  assert.ok(cells[0].x >= 0 && cells[0].w <= 100 && cells[0].h >= 5, 'p1 clamped into the box');
  assert.equal(cells[2].panelId, 'p3', 'missing panel gets a fallback strip');
});

test('aiAutoRun walks the whole pipeline from a fresh project to letterExport', async () => {
  const db = await import('./db.js');
  const { buildProjectFromBundle } = await import('./ingest/index.js');
  const { aiAutoRun } = await import('./ai/director.js');
  const story = `# A\n\nx | y | z\n\n## SYNOPSIS\n\ns\n\n# FULL STORY\n\n## Chapter 1: C\n\nArc: A\nStructure beat: setup\n\n## Story\n\nPage 1: p. Mood: m\nPanel 1: A wide shot of a street. A man walks. Day.\n`;
  const visuals = `# VISUAL REFERENCE - A\n\n# CHARACTER REFERENCE SHEETS\n\n## a man - Lead\n\n  Age: 30\n  AI prompt (positive): manga style, a plain man\n\n# CHAPTERS\n\n## Chapter 1: C\n\nStatus: draft\n\n  Page 1 - Scene: Scene 1\n    Purpose: p\n    Mood: m\n    Panel 1 [Medium / Wide Shot / Normal]\n      Visual: A wide shot of a street.\n      Action: A man walks.\n      Narration: Day.\n      Dialogue: a man: "Hi."\n`;
  const created = db.createProject(buildProjectFromBundle({ story, visuals }, { title: 'autorun-test' }));
  const { jobId } = await aiAutoRun(created.id);
  // poll the job to completion
  for (let i = 0; i < 100; i++) { const j = db.getJob(jobId); if (j && j.status !== 'running') break; await new Promise(r => setTimeout(r, 50)); }
  const job = db.getJob(jobId);
  assert.equal(job.error, null, `auto-run should not error: ${job && job.error}`);
  const doc = db.getProject(created.id);
  assert.equal(doc.currentStage, 'letterExport');
  assert.ok(doc.panels[0].imagePrompt.startsWith('manga style'));
  assert.ok(doc.panels[0].render && doc.panels[0].render.status === 'done' && doc.panels[0].render.assetId);
  assert.ok(doc.pages[0].lettering.length > 0);
  assert.equal(doc.pages[0].approved, true);
});
