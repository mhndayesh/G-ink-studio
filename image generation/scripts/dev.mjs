// dev.mjs — start the API (with --watch) and the Vite dev server together.
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const isWin = process.platform === 'win32';
const npm = isWin ? 'npm' : 'npm';

function run(name, cwd, args, color) {
  const p = spawn(npm, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: process.env, shell: isWin });
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  p.stdout.on('data', d => process.stdout.write(d.toString().split('\n').map(l => l ? tag + l : l).join('\n')));
  p.stderr.on('data', d => process.stderr.write(d.toString().split('\n').map(l => l ? tag + l : l).join('\n')));
  p.on('exit', c => { console.log(`${tag}exited ${c}`); process.exit(c || 0); });
  return p;
}

run('api', join(root, 'server'), ['run', 'dev'], '36');
run('web', join(root, 'web'), ['run', 'dev'], '35');
process.on('SIGINT', () => process.exit(0));
