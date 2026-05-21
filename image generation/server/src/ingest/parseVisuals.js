/**
 * Parser for the "visuals" asset file format.
 * Extracts: character reference sheets + chapters/pages/panels with full script data.
 * Supports both legacy plain-text and newer Markdown (## headings) export formats.
 */

/**
 * Normalize Markdown headings in the visuals file to the plain-text format
 * the rest of the parser expects. Safe to run on non-markdown input.
 */
function normalizeVisualsMarkdown(text) {
  return text
    // Top-level section headers: "# SECTION_NAME" → "SECTION_NAME\n============"
    .replace(/^# (VISUAL REFERENCE[^\n]*)\s*$/gm, (_, h) => `${h}\n${'='.repeat(h.length)}`)
    .replace(/^# (CHARACTER REFERENCE SHEETS)\s*$/gm, (_, h) => `${h}\n${'='.repeat(h.length)}`)
    .replace(/^# (LOCATIONS)\s*$/gm, (_, h) => `${h}\n${'='.repeat(h.length)}`)
    .replace(/^# (CHAPTERS)\s*$/gm, (_, h) => `${h}\n${'='.repeat(h.length)}`)
    // Chapter headers: "## Chapter N: Title" → "Chapter N: Title\n---..."
    .replace(/^## (Chapter \d+:[^\n]+)\s*$/gm, (_, ch) => `${ch}\n${'-'.repeat(ch.length)}`)
    // Character / location block headers: "## Name - Type" → "Name - Type\n---..."
    // (these are the per-character and per-location section headers)
    .replace(/^## ([^\n]+ - [^\n]+)\s*$/gm, (_, h) => `${h}\n${'-'.repeat(h.length)}`);
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'item';
}

// ─── Character Reference Sheets ───────────────────────────────────────────────

function parseCharBlock(block) {
  const headerMatch = block.match(/^([^\n]+?) - ([^\n]+)/);
  if (!headerMatch) return null;
  const name = headerMatch[1].trim();
  const role = headerMatch[2].trim();

  const fields = {};
  const lines = block.split('\n').slice(1); // skip header
  let currentKey = null;
  let currentValue = [];

  for (const line of lines) {
    const m = line.match(/^\s{1,4}([A-Za-z][^:]*?):\s*(.*)/);
    if (m) {
      if (currentKey) fields[currentKey] = currentValue.join(' ').trim();
      currentKey = m[1].trim();
      currentValue = m[2] ? [m[2].trim()] : [];
    } else if (currentKey && line.trim()) {
      currentValue.push(line.trim());
    }
  }
  if (currentKey) fields[currentKey] = currentValue.join(' ').trim();

  return {
    name,
    role,
    fields,
    positivePrompt: fields['AI prompt (positive)'] || '',
    negativePrompt: fields['AI prompt (negative)'] || ''
  };
}

// A section block header is a non-indented line "Name - Type" immediately followed
// by an underline of 3+ dashes. The name may contain anything but a newline
// (parentheses, slashes, apostrophes, …) — only the trailing " - Type" is fixed.
const BLOCK_HEAD = /[^\n]+ - [^\n]+\n-{3,}/;

function parseCharacterSheets(text) {
  const chars = [];
  const blocks = text.split(new RegExp(`\\n(?=${BLOCK_HEAD.source})`));
  for (const block of blocks) {
    if (!new RegExp(`^${BLOCK_HEAD.source}`).test(block)) continue;
    const ch = parseCharBlock(block.trim());
    if (ch) chars.push(ch);
  }
  return chars;
}

// ─── Chapter / Page / Panel ────────────────────────────────────────────────────

function parsePanelHeader(line) {
  // e.g. "Panel 3 [Medium / Action Shot / Normal]"
  const m = line.match(/Panel\s+(\d+)\s*\[([^\]]+)\]/i);
  if (!m) return null;
  const parts = m[2].split('/').map(p => p.trim());
  return {
    number: parseInt(m[1], 10),
    size: parts[0] || '',
    cameraShot: parts[1] || '',
    pacing: parts[2] || ''
  };
}

function parsePanelFields(lines) {
  const fields = {};
  const dialogueLines = [];
  let key = null;
  let value = [];
  const flush = () => {
    if (!key) return;
    if (key === 'Dialogue') {
      dialogueLines.push(value.join(' ').trim());
    } else {
      fields[key] = value.join(' ').trim();
    }
  };
  for (const line of lines) {
    const m = line.match(/^\s{6,}([A-Za-z][^:]*?):\s*(.*)/);
    if (m) {
      flush();
      key = m[1].trim();
      value = m[2] ? [m[2].trim()] : [];
    } else if (key && line.trim()) {
      value.push(line.trim());
    }
  }
  flush();
  // Promote bare dialogue: fields with a lowercase key and a fully-quoted value
  // e.g. "oddo: "text"" written without the "Dialogue:" prefix
  for (const k of Object.keys(fields)) {
    if (/^[a-z]/.test(k)) {
      const v = fields[k].trim();
      if (v.startsWith('"') && v.endsWith('"')) {
        dialogueLines.push(`${k}: ${v}`);
        delete fields[k];
      }
    }
  }
  if (dialogueLines.length) fields['Dialogue'] = dialogueLines.join('\n');
  return fields;
}

function parsePanels(block) {
  const panels = [];
  const panelRe = /^\s{4}Panel\s+\d+\s*\[[^\]]+\]/gm;
  const starts = [...block.matchAll(panelRe)].map(m => m.index);

  for (let i = 0; i < starts.length; i++) {
    const from = starts[i];
    const to = i + 1 < starts.length ? starts[i + 1] : block.length;
    const chunk = block.slice(from, to);
    const headerLine = chunk.split('\n')[0].trim();
    const header = parsePanelHeader(headerLine);
    if (!header) continue;
    const restLines = chunk.split('\n').slice(1);
    const fields = parsePanelFields(restLines);

    panels.push({
      number: header.number,
      size: header.size,
      cameraShot: header.cameraShot,
      pacing: header.pacing,
      visual: fields['Visual'] || '',
      characterAction: fields['Action'] || '',
      backgroundDetails: fields['Background'] || '',
      facialExpression: fields['Expression'] || '',
      poseOrBodyLanguage: fields['Pose'] || '',
      mood: fields['Mood'] || '',
      narration: fields['Narration'] || '',
      dialogue: fields['Dialogue'] || '',
      sfxText: fields['SFX'] || '',
      renderMode: fields['Render mode'] || ''
    });
  }
  return panels;
}

function parsePages(chapterBlock) {
  const pages = [];
  // Pages start with "  Page N - Scene: Scene N" optionally followed by "- Location: Name"
  const pageRe = /^\s{2}Page\s+(\d+)\s*-\s*Scene:\s*([^\n]+)/gm;
  const starts = [...chapterBlock.matchAll(pageRe)].map(m => {
    // Extract optional "- Location: ..." suffix from the scene label
    const full = m[2].trim();
    const locMatch = full.match(/^(.*?)\s*-\s*Location:\s*(.+)$/i);
    return {
      index: m.index,
      number: parseInt(m[1], 10),
      sceneLabel: locMatch ? locMatch[1].trim() : full,
      locationName: locMatch ? locMatch[2].trim() : ''
    };
  });

  for (let i = 0; i < starts.length; i++) {
    const { index, number, sceneLabel } = starts[i];
    const to = i + 1 < starts.length ? starts[i + 1].index : chapterBlock.length;
    const block = chapterBlock.slice(index, to);

    // Purpose + Mood from page-level header
    const purposeMatch = block.match(/^\s{4}Purpose:\s*(.+)$/m);
    const moodMatch = block.match(/^\s{4}Mood:\s*(.+)$/m);

    const panels = parsePanels(block);
    pages.push({
      number,
      sceneLabel,
      locationName: starts[i].locationName,
      purpose: purposeMatch?.[1]?.trim() || '',
      mood: moodMatch?.[1]?.trim() || '',
      panels
    });
  }
  return pages;
}

function parseChaptersSection(text) {
  const chapters = [];
  // Split on chapter headers so each chunk is one full chapter block
  const blocks = text.split(/(?=^Chapter\s+\d+:[^\n]+\n-{3,})/m).filter(b => b.trim().length > 0);
  for (const block of blocks) {
    const headerMatch = block.match(/^Chapter\s+(\d+):\s+(.+)/);
    if (!headerMatch) continue;
    const number = parseInt(headerMatch[1], 10);
    const title = headerMatch[2].trim();
    const statusMatch = block.match(/^Status:\s*(.+)$/m);
    const pages = parsePages(block);
    chapters.push({
      number,
      title,
      status: statusMatch?.[1]?.trim() || 'draft',
      pages
    });
  }
  return chapters;
}

function parseLocationBlock(block) {
  const headerMatch = block.match(/^([^\n]+?) - ([^\n]+)/);
  if (!headerMatch) return null;
  const name = headerMatch[1].trim();
  const type = headerMatch[2].trim();
  const fields = {};
  const lines = block.split('\n').slice(2); // skip header + dashes
  let key = null;
  let value = [];
  for (const line of lines) {
    const m = line.match(/^\s{1,4}([A-Za-z][^:]*?):\s*(.*)/);
    if (m) {
      if (key) fields[key] = value.join(' ').trim();
      key = m[1].trim();
      value = m[2] ? [m[2].trim()] : [];
    } else if (key && line.trim()) {
      value.push(line.trim());
    }
  }
  if (key) fields[key] = value.join(' ').trim();
  return {
    name,
    type,
    description: fields['Description'] || '',
    positivePrompt: fields['AI prompt (positive)'] || '',
    negativePrompt: fields['AI prompt (negative)'] || ''
  };
}

function parseLocationsSection(text) {
  const locations = [];
  const blocks = text.split(new RegExp(`\\n(?=${BLOCK_HEAD.source})`));
  for (const block of blocks) {
    if (!new RegExp(`^${BLOCK_HEAD.source}`).test(block)) continue;
    const loc = parseLocationBlock(block.trim());
    if (loc) locations.push(loc);
  }
  return locations;
}

export function parseVisualsFile(rawText) {
  const text = normalizeVisualsMarkdown(rawText);

  // Extract LOCATIONS section if present (between CHARACTER REFERENCE SHEETS and CHAPTERS)
  const locIdx = text.indexOf('\nLOCATIONS\n');
  const chaptersIdx = text.indexOf('\nCHAPTERS\n');

  const beforeChapters = chaptersIdx >= 0 ? text.slice(0, chaptersIdx) : text;
  const chaptersSection = chaptersIdx >= 0 ? text.slice(chaptersIdx + '\nCHAPTERS\n'.length) : '';

  // Characters are everything before LOCATIONS (or before CHAPTERS if no LOCATIONS)
  const charEnd = locIdx >= 0 ? locIdx : beforeChapters.length;
  const charSection = beforeChapters.slice(0, charEnd);
  const locSection = locIdx >= 0 ? beforeChapters.slice(locIdx + '\nLOCATIONS\n'.length) : '';

  const charText = charSection
    .replace(/^VISUAL REFERENCE[^\n]*\n=+\n/m, '')
    .replace(/^CHARACTER REFERENCE SHEETS\n=+\n/m, '')
    .trim();

  const characters = parseCharacterSheets(charText);
  const locations = locSection ? parseLocationsSection(locSection.replace(/^=+\n/, '').trim()) : [];
  const chapters = parseChaptersSection(chaptersSection.replace(/^=+\n/, '').trim());

  return { characters, locations, chapters };
}
