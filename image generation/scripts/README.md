# scripts/

Helper scripts for the **image generation** studio.

| Script | Purpose |
|--------|---------|
| `dev.mjs` | Starts the API (`:8788`) and the Vite dev UI (`:5174`) together. Invoked by `npm run dev`. |
| `git-sync.sh` | Stage + commit + push everything under `image generation/` (POSIX / Git Bash / macOS / Linux). |
| `git-sync.ps1` | Same, for Windows PowerShell. |

## Git workflow

This folder lives inside the `mhndayesh/G-ink-studio` repo. The `git-sync`
scripts stage **only** files under `image generation/`, so other folders in the
repo are never touched.

```bash
# POSIX / Git Bash
./scripts/git-sync.sh "fix render mode resolution"

# Windows PowerShell
.\scripts\git-sync.ps1 "fix render mode resolution"
```

With no message argument they default to `"Update image generation"`. If the
working tree is clean they exit without creating an empty commit.

## What never gets committed

`.gitignore` keeps the following out of the repo:

- `node_modules/` — reinstall with `npm install`
- `server/data/` + `*.sqlite*` — the runtime SQLite project DB (rebuild with `npm run reset`)
- `web/dist/` — build output (rebuild with `npm run build`)
- `.env` — secrets and local server URLs (copy `server/.env.example` to `server/.env`)
- `*.gguf`, `*.safetensors`, `*.ckpt`, `*.pt`, `*.pth`, `*.onnx` — model weights (multi-GB; download separately)
