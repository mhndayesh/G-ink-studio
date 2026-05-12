import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'package.json',
  'app/layout.tsx',
  'app/studio/page.tsx',
  'app/studio/[storyId]/home/page.tsx',
  'app/studio/[storyId]/seed/page.tsx',
  'app/studio/[storyId]/world/page.tsx',
  'app/studio/[storyId]/cast/page.tsx',
  'app/studio/[storyId]/desk/page.tsx',
  'lib/api.ts',
  'components/studio/StudioShell.tsx'
];

const failures = [];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`Missing ${file}`);
}

const badNames = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\(\d+\)/.test(entry.name)) badNames.push(path.relative(root, full));
  }
}
walk(root);
if (badNames.length) failures.push(`Found suffix filenames: ${badNames.join(', ')}`);

const api = fs.readFileSync(path.join(root, 'lib/api.ts'), 'utf8');
for (const endpoint of ['master-story/template', 'characters/structure', 'plot-outline/narrative-structure', 'plot-workspace/analyze', 'chapter-script/generate']) {
  if (!api.includes(endpoint)) failures.push(`API client missing ${endpoint}`);
}

if (failures.length) {
  console.error(JSON.stringify({ passed: false, failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ passed: true, checked_files: required.length }, null, 2));
