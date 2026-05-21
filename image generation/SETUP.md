# G-Ink Studio v2 — Setup Guide

## Prerequisites

| Tool | Minimum version | Check |
|------|----------------|-------|
| Node.js | 22 (LTS) — needs `node:sqlite` | `node -v` |
| npm | 10+ (bundled with Node 22) | `npm -v` |
| Git | any | optional, for version control |

> Node 22+ ships the `node:sqlite` module used by the database layer.  
> Node 18/20 will **not** work — do not use them.

---

## 1 — Install dependencies

```bash
# from the project root (the folder that contains this file)
npm install
```

This installs both the `server` and `web` workspaces in one shot.

---

## 2 — Create your environment file

Copy the sample and fill in the values you need:

```bash
cp server/.env.example server/.env
```

Then open `server/.env` and edit:

```env
# ── LLM provider ──────────────────────────────────────────────────────────────
# auto   = try anthropic → openai → lmstudio → off
# anthropic | openai | lmstudio | off
AI_PROVIDER=auto

# Cloud API keys (only the one you use is required)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Local LM Studio (leave blank if not using)
LLM_BASE_URL=http://localhost:1234/v1
LLM_MODEL=                        # blank = use server default

# ── Image generation ──────────────────────────────────────────────────────────
# placeholder (built-in, no GPU) | comfyui | http
IMAGE_SERVER_TYPE=placeholder
IMAGE_SERVER_URL=http://localhost:8188   # ComfyUI default

# ComfyUI workflow overrides (optional — defaults work with stock SDXL)
COMFY_WORKFLOW_PATH=              # path to custom workflow JSON
COMFY_CKPT=                       # checkpoint name, e.g. v1-5-pruned-emaonly.safetensors
COMFY_STEPS=20
COMFY_CFG=7

# ComfyUI node-id overrides (only needed if your workflow differs from the defaults)
COMFY_POSITIVE_NODE=6
COMFY_NEGATIVE_NODE=7
COMFY_SAMPLER_NODE=3
COMFY_SIZE_NODE=5
COMFY_CKPT_NODE=4
COMFY_OUTPUT_NODE=9

# ── Server ────────────────────────────────────────────────────────────────────
PORT=8788
PARALLEL_RENDERS=3                # max concurrent image renders
GINK_DB_PATH=                     # override SQLite path (default: server/data/project.sqlite)
```

**Minimum viable setup (no GPU, no API key):**  
Leave everything at the defaults — the app starts with `IMAGE_SERVER_TYPE=placeholder` and `AI_PROVIDER=off`. You can write/edit content manually and test the whole pipeline with generated placeholder images.

---

## 3 — Seed the demo project

```bash
npm run reset
```

This runs `server/src/seed.js --force`, which:
- Creates `server/data/project.sqlite` (runs all DB migrations)
- Ingests the sample manga bundle (`new-g-ink-xport/others-*.md`)
- Loads the "others" project so you can explore all 5 stages immediately

Run it again any time to wipe and restart from a clean demo state.

---

## 4 — (Optional) LM Studio setup

1. Download LM Studio from [lmstudio.ai](https://lmstudio.ai)
2. Load any instruction-following model (e.g. Mistral 7B Instruct, Phi-3 Mini)
3. Start the local server on port 1234
4. Set `AI_PROVIDER=lmstudio` (or leave it `auto`) in `server/.env`

---

## 5 — (Optional) ComfyUI setup

1. Install ComfyUI and place a checkpoint in `ComfyUI/models/checkpoints/`
2. Start ComfyUI (default port 8188)
3. Set in `server/.env`:
   ```env
   IMAGE_SERVER_TYPE=comfyui
   IMAGE_SERVER_URL=http://localhost:8188
   COMFY_CKPT=your-model.safetensors
   ```
4. If your workflow uses non-default node IDs, map them with the `COMFY_*_NODE` vars

---

## 6 — Verify the install

```bash
npm test
```

Expected output: **6 tests passing**, then a clean TypeScript + Vite build.  
If all green → you are ready to run.
