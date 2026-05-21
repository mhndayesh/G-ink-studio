// export/bundle.js — whole-book exports:
//   • .cbz  — a (store-only) ZIP of one SVG per page + a book.html index. It's a
//             plain ZIP, so renaming to .zip works too; browsers and some comic
//             readers open it directly.
//   • .html — a single self-contained HTML "reader" with every page SVG inlined
//             and print CSS (page breaks). Open in any browser → Print → Save as
//             PDF for a vector PDF of the book.
//
// No external deps — the ZIP writer is a tiny store-only implementation (~40 lines).

import { exportPageSvg } from './svg.js';

// ─── tiny store-only ZIP ─────────────────────────────────────────────────────

const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

/** files: [{ name, bytes:Buffer|string }] → a Buffer holding a valid .zip (no compression). */
export function zipStore(files) {
  const entries = files.map(f => ({ name: Buffer.from(f.name, 'utf8'), data: Buffer.isBuffer(f.bytes) ? f.bytes : Buffer.from(f.bytes, 'utf8') }));
  const chunks = [];
  let offset = 0;
  const dosTime = 0, dosDate = 0x21; // 1980-01-01 — deterministic
  const central = [];
  for (const e of entries) {
    const crc = crc32(e.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(e.data.length, 18); local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(e.name.length, 26); local.writeUInt16LE(0, 28);
    chunks.push(local, e.name, e.data);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0, 8); cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(dosTime, 12); cd.writeUInt16LE(dosDate, 14); cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(e.data.length, 20); cd.writeUInt32LE(e.data.length, 24);
    cd.writeUInt16LE(e.name.length, 28); cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34); cd.writeUInt16LE(0, 36); cd.writeUInt32LE(0, 38); cd.writeUInt32LE(offset, 42);
    central.push(cd, e.name);
    offset += local.length + e.name.length + e.data.length;
  }
  const centralStart = offset;
  let centralSize = 0;
  for (const c of central) { chunks.push(c); centralSize += c.length; }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(centralStart, 16); end.writeUInt16LE(0, 20);
  chunks.push(end);
  return Buffer.concat(chunks);
}

// ─── book builders ───────────────────────────────────────────────────────────

const pad = (n, w = 2) => String(n).padStart(w, '0');
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function pages(doc) { return [...(doc.pages || [])].sort((a, b) => a.number - b.number); }

export function buildBookHtml(doc) {
  const pg = pages(doc);
  const body = pg.map((p, i) => `  <section class="page" id="p${p.number}">\n    <div class="pagewrap">${exportPageSvg(doc, p).replace('<svg ', '<svg style="width:100%;height:auto;display:block" ')}</div>\n    <div class="pgnum">${p.number}${p.sceneLabel ? ' · ' + esc(p.sceneLabel) : ''}</div>\n  </section>`).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(doc.title)}</title>
<style>
  :root{color-scheme:light}
  body{margin:0;background:#3a3a3a;font:14px/1.5 system-ui,sans-serif}
  header{position:sticky;top:0;background:#222;color:#eee;padding:10px 16px;display:flex;gap:14px;align-items:center;z-index:5}
  header b{font-size:16px}
  header .hint{color:#aaa;font-size:12px}
  main{max-width:820px;margin:0 auto;padding:20px 0 60px}
  .page{margin:0 16px 24px;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.4)}
  .pagewrap{aspect-ratio:1240/1754;overflow:hidden}
  .pgnum{font:12px serif;color:#555;text-align:center;padding:6px;background:#f4f3f1}
  @media print{
    body{background:#fff}header{display:none}main{max-width:none;padding:0}
    .page{margin:0;box-shadow:none;page-break-after:always}.pgnum{display:none}
    @page{margin:0}
  }
</style></head><body>
<header><b>${esc(doc.title)}</b><span class="hint">${pg.length} page(s) — to make a PDF: ⌘/Ctrl-P → "Save as PDF"</span></header>
<main>
${body}
</main></body></html>`;
}

export function buildCbz(doc) {
  const pg = pages(doc);
  const files = [
    { name: 'book.html', bytes: buildBookHtml(doc) },
    ...pg.map(p => ({ name: `page-${pad(p.number)}.svg`, bytes: exportPageSvg(doc, p) })),
    { name: 'README.txt', bytes: `${doc.title}\n${pg.length} pages.\n\nThis is a plain ZIP — rename to .zip if your tools prefer. Open book.html in a browser to read or print to PDF.\nIndividual pages are page-01.svg … page-${pad(pg.length)}.svg.\n` },
  ];
  return zipStore(files);
}

export const slugTitle = doc => String(doc.title || 'manga').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'manga';
