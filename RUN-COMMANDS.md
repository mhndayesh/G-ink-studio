# Manga Maker — Run Commands

> **Port note:** The backend runs on **port 8080**.
> Port 8000 is taken by `open-notebook` SurrealDB (Docker), port 8001 by NVIDIA Omniverse.
> Port 8080 is confirmed free.

All commands are run from the repository root (`v2.1\`).

---

## 1. Infrastructure (Neo4j + Qdrant) — run once

```powershell
cd integrated\manga_maker_integrated_v1_2\infra
docker compose up -d
```

Wait ~20 s for Neo4j and Qdrant to become healthy.

---

## 2. Backend (FastAPI on port 8080)

```powershell
cd integrated\manga_maker_integrated_v1_2\apps\api

# First time only — create venv and install deps
python -m venv .venv
pip install -r requirements.txt
copy .env.example .env   # then edit .env (LM Studio URL, etc.)

# Every time — start backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8080
```

> **Do NOT use bare `uvicorn` or `uvicorn --reload`.**
> Bare `uvicorn` can resolve to system Python instead of the venv on Windows.
> `--reload` is unreliable on Windows and can silently keep serving stale bytecode.

Health check (new terminal):
```powershell
python -c "import httpx; print(httpx.get('http://localhost:8080/api/v1/health').json())"
```

Expected: `{'ok': True, 'data': {'status': 'ok'}, ...}`

---

## 3. Frontend (Next.js on port 3000) — new terminal

```powershell
cd integrated\manga_maker_integrated_v1_2\apps\web

# First time only
npm install
copy .env.example .env.local   # already pre-configured for port 8080

# Every time
npm run dev
```

Open: http://localhost:3000

---

## Stop Everything

```powershell
# Kill backend + frontend
Get-Process python, node -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -like "*story-novel*" -or $_.CommandLine -like "*manga*" } |
  Stop-Process -Force

# Stop infrastructure containers
cd integrated\manga_maker_integrated_v1_2\infra
docker compose down
```

---

## LM Studio (AI features)

1. Open LM Studio and load a model.
2. Start the local server (default: `http://localhost:1234`).
3. In `apps\api\.env` set:
   ```
   MANGA_LLM_ENABLED=true
   MANGA_OPENAI_BASE_URL=http://<LM-Studio-IP>:1234/v1
   MANGA_OPENAI_API_KEY=lm-studio
   MANGA_OPENAI_MODEL=local-model
   ```
   Replace `<LM-Studio-IP>` with the IP shown in LM Studio's server panel
   (e.g. `169.254.83.107` if running on a separate machine/WSL).

LLM status check:
```powershell
python -c "import httpx; print(httpx.get('http://localhost:8080/api/v1/llm/status').json())"
```

---

## Troubleshooting

### Port 8080 already in use
```powershell
$pid = (Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue).OwningProcess | Select-Object -First 1
if ($pid) { Stop-Process -Id $pid -Force; Write-Host "Killed PID $pid" } else { Write-Host "Port 8080 is free" }
```

### Port 8000 conflict (open-notebook SurrealDB)
The `open-notebook` project maps SurrealDB to `0.0.0.0:8000`. This does NOT affect
manga-maker (which uses 8080). If you ever need to free 8000:
```powershell
docker stop open-notebook-surrealdb-1
```

### Backend serving stale code after edits
The fix is always a clean restart — do NOT use `--reload`:
```powershell
# Kill old process
Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force
# Clear bytecode cache
Get-ChildItem -Path integrated\manga_maker_integrated_v1_2\apps\api -Recurse -Filter __pycache__ |
  Remove-Item -Recurse -Force
# Start fresh
cd integrated\manga_maker_integrated_v1_2\apps\api
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8080
```

### Frontend can't reach backend
- Confirm `.env.local` contains `NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api/v1`
- Restart frontend after any `.env.local` change (`Ctrl+C` then `npm run dev`)
- Verify backend health at `http://localhost:8080/api/v1/health`

### System Python vs venv Python
Check which Python uvicorn would use:
```powershell
Get-Command uvicorn | Select-Object -ExpandProperty Source
```
If it shows `AppData\Local\Programs\Python\...` instead of `.venv\Scripts\...`,
always use the explicit path: `.\.venv\Scripts\python.exe -m uvicorn ...`

---

## File Locations

| Concern | Path (from `v2.1\`) |
|---------|----------------------|
| Backend source | `integrated\manga_maker_integrated_v1_2\apps\api\app\` |
| Frontend source | `integrated\manga_maker_integrated_v1_2\apps\web\` |
| Story storage | `integrated\manga_maker_integrated_v1_2\apps\api\storage\stories\` |
| SQLite registry | `integrated\manga_maker_integrated_v1_2\apps\api\storage\manga_registry.sqlite` |
| Templates | `integrated\manga_maker_integrated_v1_2\apps\api\app\templates\` |
| Infra docker-compose | `integrated\manga_maker_integrated_v1_2\infra\docker-compose.yml` |

---

## Safe Fallback Mode (no LLM / no Docker databases)

Set in `.env`:

| Variable | Default | Effect when `false` |
|----------|---------|---------------------|
| `MANGA_LLM_ENABLED` | `true` | AI buttons return deterministic placeholder text |
| `MANGA_NEO4J_ENABLED` | `true` | Graph projections stored locally only |
| `MANGA_QDRANT_ENABLED` | `true` | Vector metadata stored locally only |
