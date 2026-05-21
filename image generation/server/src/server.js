// server.js — the Express app.
import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import routes from './routes.js';
import './db.js';          // run migrations on boot
import './ai/rules.js';    // validate rule files on boot (throws on malformed)

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8788);
const WEB_DIST = join(__dirname, '..', '..', 'web', 'dist');

const app = express();
app.use(cors());
app.use(express.json({ limit: '64mb' }));
app.use('/api', routes);

if (existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
  app.get('*', (req, res, next) => { if (req.path.startsWith('/api')) return next(); res.sendFile(join(WEB_DIST, 'index.html')); });
}

app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: String(err.message || err) }); });

app.listen(PORT, () => console.log(`g-ink v2 server on http://localhost:${PORT}  (web ${existsSync(WEB_DIST) ? 'served' : 'dev: run npm run dev'})`));
