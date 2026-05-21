/**
 * Parser for the "story" asset file format.
 * Extracts: title, genre, synopsis, world, threats, characters, relationships, arc overview, chapters.
 * Supports both the legacy plain-text format and the newer Markdown (## headings) format.
 */

/**
 * Normalize Markdown headings to the plain-text format the rest of the parser expects.
 * Safe to run on already-plain-text files (no-op on non-markdown input).
 */
function normalizeStoryMarkdown(text) {
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // First line: strip "# title" → "title"
    if (i === 0 && /^# /.test(line)) {
      out.push(line.slice(2).trim());
      continue;
    }

    // "# FULL STORY" → "FULL STORY\n=========="
    if (/^# FULL STORY\s*$/.test(line)) {
      out.push('FULL STORY');
      out.push('==========');
      continue;
    }

    // "## Chapter N: ..." → "Chapter N: ..."  (chapter heading inside full story, no underline needed)
    const chapterMd = line.match(/^## (Chapter \d+:.+)$/);
    if (chapterMd) {
      out.push(chapterMd[1].trim());
      continue;
    }

    // "## Story" subsection inside a chapter
    if (/^## Story\s*$/.test(line)) {
      out.push('Story');
      out.push('-----');
      continue;
    }

    // "## Chapter Review" subsection inside a chapter
    if (/^## Chapter Review\s*$/.test(line)) {
      out.push('Chapter Review');
      out.push('--------------');
      continue;
    }

    // "## KEY SCENES" or other chapter subsections
    if (/^## Key scenes\s*$/.test(line)) {
      out.push('Key scenes');
      continue;
    }

    // "## ALL_CAPS SECTION" top-level section headers → "ALL_CAPS SECTION\n---------"
    const sectionMd = line.match(/^#{1,3} ([A-Z][A-Z\s/]+)\s*$/);
    if (sectionMd) {
      const name = sectionMd[1].trim();
      out.push(name);
      out.push('-'.repeat(name.length));
      continue;
    }

    // Strip any remaining ## prefix we haven't handled
    out.push(line.replace(/^#{1,3} /, ''));
  }
  return out.join('\n');
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'item';
}

function trimLines(text) {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .join('\n');
}

function splitSections(text) {
  const sections = {};
  const sectionRe = /^([A-Z][A-Z\s/]+)\n[-=]+\s*$/gm;
  const matches = [...text.matchAll(sectionRe)];
  for (let i = 0; i < matches.length; i++) {
    const key = matches[i][1].trim();
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    sections[key] = text.slice(start, end).trim();
  }
  return sections;
}

function parseKeyValues(text) {
  const result = {};
  const lines = text.split('\n');
  let currentKey = null;
  let currentValue = [];
  for (const line of lines) {
    const m = line.match(/^([A-Za-z][^:]*?):\s*(.*)$/);
    if (m && !line.startsWith(' ') && !line.startsWith('\t')) {
      if (currentKey) result[currentKey] = currentValue.join(' ').trim();
      currentKey = m[1].trim();
      currentValue = m[2] ? [m[2].trim()] : [];
    } else if (currentKey) {
      currentValue.push(line.trim());
    }
  }
  if (currentKey) result[currentKey] = currentValue.join(' ').trim();
  return result;
}

function parseCharacters(text) {
  const chars = [];
  const blocks = text.split(/\n(?=[a-z][\w\s]+ - )/);
  for (const block of blocks) {
    const headerMatch = block.match(/^([^\n]+?) - ([^\n]+)/);
    if (!headerMatch) continue;
    const name = headerMatch[1].trim();
    const role = headerMatch[2].trim();
    const rest = block.slice(headerMatch[0].length).trim();
    const traitsMatch = rest.match(/- Traits:\s*([^\n]+)/);
    const traits = traitsMatch
      ? traitsMatch[1].split(',').map(t => t.trim()).filter(Boolean)
      : [];
    const backstory = rest.replace(/- Traits:[^\n]*/g, '').trim();
    chars.push({ name, role, backstory, traits });
  }
  return chars;
}

function parseRelationships(text) {
  const rels = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^([^/\n]+?)\/([^-\n]+?) - ([^\s(]+)\s*\(([^)]*)\)/);
    if (m) {
      rels.push({
        chars: [m[1].trim(), m[2].trim()],
        type: m[3].trim(),
        description: m[4].trim()
      });
    }
  }
  return rels;
}

function parseArcOverview(text) {
  const kv = parseKeyValues(text);
  return {
    structure: kv['Structure'] || '',
    title: kv['Arc'] || '',
    length: kv['Arc length'] || '',
    summary: kv['Summary'] || '',
    storyQuestion: kv['Story question'] || '',
    emotionalQuestion: kv['Emotional question'] || '',
    externalConflict: kv['External conflict'] || '',
    internalConflict: kv['Internal conflict'] || '',
    relationshipConflict: kv['Relationship conflict'] || '',
    ending: kv['Ending target'] || ''
  };
}

function parseChapterBlock(block) {
  const titleMatch = block.match(/^Chapter\s+(\d+):\s+(.+)/);
  if (!titleMatch) return null;
  const number = parseInt(titleMatch[1], 10);
  const title = titleMatch[2].trim();

  const arcMatch = block.match(/^Arc:\s*(.+)$/m);
  const beatMatch = block.match(/^Structure beat:\s*(.+)$/m);

  // Story section
  const storySection = block.match(/^Story\n-+\n([\s\S]*?)(?=^Key scenes|^Chapter Review|$)/m);
  const storyText = storySection ? storySection[1].trim() : '';
  const storyLines = storyText.split('\n').filter(l => l.trim().length > 0);
  const purpose = storyLines[0] || '';
  const summary = storyLines[1] || '';
  const conflict = storyLines[2] || '';
  const hook = storyLines.length > 4 ? storyLines[4] : '';

  // Key scenes
  const scenesSection = block.match(/^Key scenes\n([\s\S]*?)(?=^Chapter Review|$)/m);
  const keyScenes = [];
  if (scenesSection) {
    for (const line of scenesSection[1].split('\n')) {
      const sm = line.match(/^\d+\.\s+(.+)/);
      if (sm) keyScenes.push(sm[1].trim());
    }
  }

  // Chapter review
  const reviewSection = block.match(/^Chapter Review\n-+\n([\s\S]*)$/m);
  const review = {};
  if (reviewSection) {
    const kv = parseKeyValues(reviewSection[1]);
    review.charactersActive = kv['Characters active'] || '';
    review.openHook = kv['Open hook'] || '';
  }

  return {
    number,
    title,
    arc: arcMatch?.[1]?.trim() || '',
    structureBeat: beatMatch?.[1]?.trim() || '',
    purpose,
    summary,
    conflict,
    hook: review.openHook || hook,
    keyScenes,
    review
  };
}

function parseFullStory(text) {
  const chapters = [];
  const chapterRe = /^(Chapter\s+\d+:[\s\S]*?)(?=^Chapter\s+\d+:|$)/gm;
  for (const m of text.matchAll(chapterRe)) {
    const ch = parseChapterBlock(m[1].trim());
    if (ch) chapters.push(ch);
  }
  return chapters;
}

export function parseStoryFile(rawText) {
  const text = normalizeStoryMarkdown(rawText);
  const lines = text.split('\n');
  const title = lines[0]?.trim() || 'Untitled';
  const genreLine = lines[2]?.trim() || '';

  // Split by top-level headers (ALL-CAPS + underline)
  const sectionText = text;
  const fullStoryIdx = sectionText.indexOf('\nFULL STORY\n');
  const beforeFull = fullStoryIdx >= 0 ? sectionText.slice(0, fullStoryIdx) : sectionText;
  const afterFull = fullStoryIdx >= 0 ? sectionText.slice(fullStoryIdx + '\nFULL STORY\n'.length) : '';

  const sections = splitSections(beforeFull);

  const world = sections['WORLD']
    ? parseKeyValues(sections['WORLD'])
    : {};
  const threats = sections['THREATS']
    ? parseKeyValues(sections['THREATS'])
    : {};
  const factions = sections['FACTIONS']
    ? sections['FACTIONS'].split(',').map(f => f.trim()).filter(Boolean)
    : [];
  const characters = sections['CHARACTERS']
    ? parseCharacters(sections['CHARACTERS'])
    : [];
  const relationships = sections['RELATIONSHIPS']
    ? parseRelationships(sections['RELATIONSHIPS'])
    : [];
  const arcOverview = sections['ARC OVERVIEW']
    ? parseArcOverview(sections['ARC OVERVIEW'])
    : {};

  // Full story section: split on the ======= line
  const fullStoryText = afterFull.replace(/^=+\s*\n/, '').trim();
  const chapters = parseFullStory(fullStoryText);

  return {
    title,
    genre: genreLine,
    synopsis: sections['SYNOPSIS'] || '',
    world,
    threats,
    factions,
    characters,
    relationships,
    arcOverview,
    chapters
  };
}
