"""One-shot migration: add stable `relationship_id` to every relationship
object in every story's characters.json (every saved version + the live
sqlite registry copy).

Why: until the recent fix, relationships were saved without an `id`. The
threads page references them by id (relationship_threads[*].relationship_id),
so the per-tab save silently dropped any thread that had an empty id.
Slug-based ids (`rel_<slugA>__<slugB>`) are stable and idempotent, so
this script is safe to run more than once.

Usage from the api/ directory:
    .venv/Scripts/python.exe scripts/backfill_relationship_ids.py
"""

from __future__ import annotations

import json
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STORAGE = ROOT / "storage" / "stories"
DB_PATH = ROOT / "storage" / "manga_registry.sqlite"


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (value or "").lower()).strip("_")


def _stable_rel_id(pair: str) -> str:
    parts = [p.strip() for p in (pair or "").split("/") if p.strip()]
    if len(parts) < 2:
        return ""
    return f"rel_{_slug(parts[0])}__{_slug(parts[1])}"


def patch_characters_blob(blob: dict) -> int:
    """Mutate `blob` in place. Returns the number of relationships patched."""
    rels = (blob.get("character_relationship_map") or {}).get("relationships") or []
    if not isinstance(rels, list):
        return 0
    fixed = 0
    for r in rels:
        if not isinstance(r, dict):
            continue
        if r.get("relationship_id"):
            continue
        rid = _stable_rel_id(r.get("characters_involved", ""))
        if rid:
            r["relationship_id"] = rid
            fixed += 1
    return fixed


def patch_file(path: Path) -> int:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"  skip {path}: {exc}")
        return 0
    fixed = patch_characters_blob(data)
    if fixed:
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"  + {path.relative_to(ROOT)}: backfilled {fixed} id(s)")
    return fixed


def patch_registry_db() -> int:
    if not DB_PATH.exists():
        return 0
    total = 0
    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.cursor()
        # Try a few common shapes — the registry stores file blobs in different
        # column names depending on schema version. We only touch rows for
        # file_type='characters'.
        for table in ("story_files", "registry", "files"):
            try:
                cur.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,))
                if not cur.fetchone():
                    continue
                cur.execute(f"PRAGMA table_info({table})")
                cols = [r[1] for r in cur.fetchall()]
                blob_col = next((c for c in cols if c in ("json_copy", "content", "data", "blob")), None)
                if not blob_col:
                    continue
                cur.execute(f"SELECT rowid, {blob_col} FROM {table} WHERE file_type = ?", ("characters",))
                rows = cur.fetchall()
                for rowid, blob in rows:
                    if not blob:
                        continue
                    try:
                        data = json.loads(blob) if isinstance(blob, str) else blob
                    except json.JSONDecodeError:
                        continue
                    if not isinstance(data, dict):
                        continue
                    fixed = patch_characters_blob(data)
                    if fixed:
                        cur.execute(f"UPDATE {table} SET {blob_col} = ? WHERE rowid = ?", (json.dumps(data, ensure_ascii=False), rowid))
                        total += fixed
                        print(f"  + registry({table}) rowid={rowid}: backfilled {fixed} id(s)")
            except sqlite3.Error as exc:
                print(f"  registry table {table}: {exc}")
        conn.commit()
    finally:
        conn.close()
    return total


def main() -> int:
    if not STORAGE.exists():
        print(f"No storage at {STORAGE}", file=sys.stderr)
        return 1
    print(f"Scanning {STORAGE}")
    total_files = 0
    total_ids = 0
    for path in STORAGE.rglob("characters.json"):
        total_files += 1
        total_ids += patch_file(path)
    print(f"\nFile scan: {total_ids} id(s) added across {total_files} characters.json file(s).")
    print("\nRegistry DB:")
    db_ids = patch_registry_db()
    print(f"Registry: {db_ids} id(s) added.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
