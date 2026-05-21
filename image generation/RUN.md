# G-Ink Studio v2 — Commands Reference

All commands run from the **project root** (the folder that contains this file).

---

## Daily use

### Start the dev server

```bash
npm run dev
```

Starts both the API server and the Vite dev server in the same terminal:

| Service | URL | Restart on |
|---------|-----|------------|
| API (Express) | http://localhost:8788 | `--watch` — save any `server/src/**` file |
| UI (Vite) | http://localhost:5174 | HMR — save any `web/src/**` file |

Open **http://localhost:5174** in your browser.

---

### Reset to the demo project

```bash
npm run reset
```

Drops and recreates `server/data/project.sqlite`, runs all migrations, and seeds the "others" manga bundle. Use this any time you want a clean slate.

> **Warning:** this deletes all your current project data.

---

## Building for production

```bash
npm run build
```

Type-checks the frontend, then runs `vite build`. Output goes to `web/dist/`.

```bash
npm start
```

Serves the built frontend as static files from Express on `PORT` (default 8788).  
No Vite dev server — the single process handles everything.

---

## Tests

```bash
npm test
```

Runs the server test suite (`node --test`) then the web build check (`tsc + vite build`).

```
✓ rule engine emits tag list not prose
✓ document schema rejects broken docs
✓ ingest builds valid project
✓ stage gates and staleness cascade
✓ zip writer and sanitizeCells clamping
✓ aiAutoRun walks full pipeline
```

Run server tests only (faster, no build):

```bash
npm run test --workspace server
```

---

## Individual workspace commands

```bash
# API server only (no web)
npm run dev --workspace server

# Web dev server only (needs the API already running)
npm run dev --workspace web

# Seed / reset without the --force prompt
npm run seed --workspace server
```

---

## Environment quick-reference

Set these in `server/.env`. All are optional — defaults shown.

| Variable | Default | What it does |
|----------|---------|--------------|
| `PORT` | `8788` | API + static server port |
| `AI_PROVIDER` | `auto` | `auto` / `anthropic` / `openai` / `lmstudio` / `off` |
| `ANTHROPIC_API_KEY` | — | Needed when using Claude |
| `OPENAI_API_KEY` | — | Needed when using OpenAI |
| `LLM_BASE_URL` | `http://localhost:1234/v1` | LM Studio endpoint |
| `LLM_MODEL` | *(provider default)* | Override the model name |
| `IMAGE_SERVER_TYPE` | `placeholder` | `placeholder` / `comfyui` / `http` |
| `IMAGE_SERVER_URL` | `http://localhost:8188` | ComfyUI or HTTP image server |
| `COMFY_WORKFLOW_PATH` | *(built-in SDXL)* | Custom ComfyUI workflow JSON |
| `COMFY_CKPT` | *(ComfyUI default)* | Checkpoint filename |
| `COMFY_STEPS` | `20` | Sampler steps |
| `COMFY_CFG` | `7` | CFG scale |
| `PARALLEL_RENDERS` | `3` | Concurrent image renders |
| `GINK_DB_PATH` | `server/data/project.sqlite` | Override DB location |

---

## Troubleshooting

**Port 8788 already in use**

```powershell
# Find the PID and kill it
netstat -ano | findstr :8788
taskkill /F /PID <pid>
```

**`node:sqlite` not found**

You are on Node < 22. Install Node 22 LTS from nodejs.org.

**ComfyUI: no output / timeout**

- Confirm ComfyUI is running: open `http://localhost:8188` in a browser
- Check `COMFY_CKPT` matches the exact filename in `ComfyUI/models/checkpoints/`
- Check node-id overrides (`COMFY_*_NODE`) if using a custom workflow

**LLM returns prose instead of tags**

The post-processor in `server/src/ai/rules.js` (`finalizeLLMPrompt`) will strip it back to tags automatically. If it still looks like prose in the UI, check that your model isn't ignoring the system prompt — switch to a stronger model or use `AI_PROVIDER=off` to fall back to the deterministic compiler.

**Wipe everything and start fresh**

```bash
npm run reset
```
