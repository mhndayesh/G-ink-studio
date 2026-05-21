# G-Ink Studio v2

An AI manga maker. You move through **five steps, strictly in order**, and each step has one **✨ AI button** that fills it from the rules + your story:

| # | Step | What you do | The ✨ button |
|---|------|-------------|---------------|
| 1 | **Story** | Import your manga, review the parsed chapters / pages / panels / cast | Clean up & normalize (de-dupe characters, fix blanks) |
| 2 | **Cast & World** | Lock in how every character & location looks; edit the **global style** | Fill every blank look as a direct, comma-separated prompt |
| 3 | **Pages** | Lay out the panels; set camera shots | Assign cast from the dialogue, fill fields, **compile each panel's image prompt** |
| 4 | **Render** | Generate the panel art (pluggable backend; placeholder works with no GPU) | Render every remaining / stale panel |
| 5 | **Letter & Export** | Place speech bubbles / narration / SFX; approve pages | Auto-letter every page, then export |

You cannot skip a step or run one out of order. Going **back** a step marks everything downstream as "needs rework" so the project can never end up in a half-baked state.

There's also a **✨ Auto-run the rest** button at the bottom of every step: it fills the current step and every later one (cast looks → panel prompts → renders → lettering → approval), advancing through the gates, and stops with a plain-language message if anything genuinely needs your input. It runs as a background job with a progress bar.

**Layout editor:** on the Pages step, toggle *edit layout* to drag panels around and drag the corner handle to resize — the page layout is freeform; templates ("auto", "stacked rows", "2-up grid", …) are just starting points.

**Export formats:** per-page `.svg`, a self-contained `.html` "reader" of the whole book (open in a browser → Print → Save as PDF for a vector PDF), and a `.cbz` (a ZIP of the page SVGs + the HTML — rename to `.zip` if your tools prefer).

## What changed from v1 (the design goals)

- **Fewer steps, clearer dependencies** — 10 stages → 5.
- **Faster AI** — every fill batches a whole page / up to ~10 entities into *one* model call; and a deterministic compiler always produces a usable prompt with **zero** model calls, so the model is optional and only ever an *upgrade*.
- **Layered prompt rules** — every image prompt = **system layer** (`manga style, black and white, …` — the editable "Global Style") + **stage rule** (`server/rules/{panel,character,location}.json`) + **per-item overrides**. Image prompts are always a flat comma-separated tag list — never prose, never a poem (LLM output is post-processed to guarantee this).
- **Friendly UI** — one screen per step, one primary ✨ button per step, gates explained in plain language with "jump to it" links. No kitchen-sink panels.
- **Corruption-proof workflow** — strict linear order, no skip-gate escape hatch, explicit backward-revert with a staleness cascade.
- **One clean data layer** — a single SQLite file (`server/data/project.sqlite`) with a real migration runner; the project is one JSON document validated on every write; binaries (renders, refs, exports, uploads) live in a `assets` BLOB table, sha256-deduped. No loose JSON/PNGs anywhere.

## Run it

```bash
npm install            # installs both workspaces (server + web)
npm run reset          # seeds the bundled "others" demo manga (from ../new-g-ink-xport)
npm run dev            # starts the API on :8788 and the Vite dev UI on :5174
```

Then open http://localhost:5174 .

Production-ish: `npm run build` then `npm start` (the server serves the built UI on :8788).

Tests: `npm test` (server `node --test` + web type-check & build).

## Configuration (env vars)

All optional — with nothing set you get deterministic prompt compilation and placeholder renders, and the whole pipeline still runs end-to-end.

| Var | Meaning |
|-----|---------|
| `AI_PROVIDER` | `auto` (default), `anthropic`, `openai`, `lmstudio`, or `off`. `auto` picks the first configured of anthropic→openai→lmstudio, else off. |
| `ANTHROPIC_API_KEY` | enables the Claude (cloud) provider |
| `OPENAI_API_KEY` | enables the OpenAI (cloud) provider |
| `LLM_BASE_URL` | OpenAI-compatible base URL for a local server (e.g. `http://localhost:1234/v1` for LM Studio) |
| `LLM_MODEL` | override the model name (cloud defaults: `claude-haiku-4-5` / `gpt-4o-mini`) |
| `IMAGE_SERVER_TYPE` | `placeholder` (default), `http`, or `comfyui` |
| `IMAGE_SERVER_URL` | for `http`: POSTs `/generate` with `{prompt,negativePrompt,model,seed,mode,width,height,referenceImages}`, expects `{imageBase64}` or `{imageUrl}` back. for `comfyui`: the ComfyUI base URL, e.g. `http://localhost:8188` — the adapter submits a workflow to `/prompt`, polls `/history`, fetches the image from `/view`. |
| `COMFY_WORKFLOW_PATH` | (comfyui) path to a ComfyUI **API-format** workflow JSON to use instead of the built-in SDXL txt2img one |
| `COMFY_CKPT` / `COMFY_STEPS` / `COMFY_CFG` | (comfyui) checkpoint name, steps, cfg for the default workflow |
| `COMFY_POSITIVE_NODE` / `COMFY_NEGATIVE_NODE` / `COMFY_SAMPLER_NODE` / `COMFY_SIZE_NODE` / `COMFY_CKPT_NODE` / `COMFY_OUTPUT_NODE` | (comfyui) node ids in your custom workflow that should receive the prompt / negative / seed / width+height / checkpoint, and the SaveImage node to read the result from (defaults: `6 / 7 / 3 / 5 / 4 / 9` — matching the built-in workflow) |
| `PARALLEL_RENDERS` | concurrent panel renders (default 3) |
| `PORT` | API port (default 8788) |
| `GINK_DB_PATH` | override the SQLite file path |

## Import format

The Story step accepts the same 3-file bundle as v1: `*-story.md` (synopsis, world, characters, relationships, arc) and `*-visuals.md` (character/location sheets with `AI prompt (positive)` strings + the full chapter→page→panel breakdown). A `*-scenes.md` file is accepted but ignored — its dialogue is already in the visuals file. See `../new-g-ink-xport/` for an example.

## Layout

```
g-ink-v2/
  server/
    src/
      db.js            single SQLite file: migrations, updateProject(mutator), assets/renders/jobs/events, SSE bus
      docSchema.js      the project-document shape + validator + newProjectDoc()
      stages.js         the 5-stage order, gate checks, advance/revert + staleness cascade
      layout.js         page panel grid layouts (0..100 coords, RTL by default)
      ingest/           parse the story/visuals bundle -> project document
      ai/
        rules.js        the layered prompt-rule engine (system + stage rule + overrides); deterministic compiler + LLM post-processor
        llm.js          provider abstraction (anthropic | openai | lmstudio | off)
        director.js     the per-stage "AI fill" functions — batched, story-grounded, deterministic-first
      image/adapter.js  pluggable image generation (placeholder | http | comfyui)
      renderer.js       drives panel renders, render history, rollback
      lettering.js      auto-place speech/narration/SFX + per-panel QC
      export/svg.js     render a finished page to a standalone SVG (art + lettering embedded)
      routes.js         the HTTP API
      server.js         the Express app
      seed.js           load the bundled demo manga
    rules/              system layer lives on the project doc; these are the stage rules: panel.json, character.json, location.json, lettering.json
    data/               (gitignored) project.sqlite
  web/                  React + Vite UI — Shell + StageStepper + 5 stage screens
```
