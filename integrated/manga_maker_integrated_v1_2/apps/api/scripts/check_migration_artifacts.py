from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
required = [
    ROOT / "alembic.ini",
    ROOT / "migrations" / "env.py",
    ROOT / "migrations" / "versions" / "0001_initial_story_state_engine.py",
    ROOT / "infra" / "postgres" / "schema.sql",
]
missing = [str(p) for p in required if not p.exists()]
if missing:
    raise SystemExit({"passed": False, "missing": missing})
print({"passed": True, "checked": [str(p.relative_to(ROOT)) for p in required]})
