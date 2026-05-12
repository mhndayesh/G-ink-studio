"""Backfill minor_threat_options and faction_visual_signatures into existing stories."""
import sqlite3
import json
import hashlib
import datetime
import os

MINOR_THREAT_OPTIONS = [
    "Rival Faction Scheming", "Internal Betrayal", "Resource Conflict",
    "Political Manipulation", "Secondary Villain Plot", "Criminal Underworld Rising",
    "Corrupt Officials", "Cult Activity", "Monster Outbreak", "Curse Outbreak",
    "Forbidden Magic Disaster", "Artifact / Relic Misuse", "Disease / Plague",
    "Natural Disaster", "Social Class Oppression", "School Bullying / Academy Threat",
    "Family Bloodline Curse", "Psychological Breakdown", "Time Limit Threat",
    "Hidden Villain Plan", "Secret Organization Plot", "Custom",
]

FACTION_VISUAL_STUB = {
    "note_to_user": "Visual identity per faction — injected into panel AI prompts when characters wear faction gear.",
    "signatures": [{"faction_name": "", "visual_signature": "", "positive_prompt": "", "negative_prompt": ""}],
}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "storage", "manga_registry.sqlite")


def resolve_path(storage_path: str) -> str:
    p = storage_path.replace("\\", "/")
    if os.path.isabs(p):
        return p
    return os.path.join(BASE_DIR, p)


def main():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    cur.execute(
        "SELECT file_id, story_id, storage_path, json_copy FROM story_files "
        "WHERE file_type='master_story' ORDER BY story_id, created_at DESC"
    )
    rows = cur.fetchall()

    seen: set = set()
    for row in rows:
        sid = row["story_id"]
        if sid in seen:
            continue
        seen.add(sid)

        data = json.loads(row["json_copy"]) if row["json_copy"] else {}
        changed = False

        if "faction_visual_signatures" not in data:
            data["faction_visual_signatures"] = FACTION_VISUAL_STUB
            changed = True
            print(f"{sid}: added faction_visual_signatures")

        threats = data.get("major_threats_and_minor_side_threats", {})
        if "minor_threat_options" not in threats:
            threats["minor_threat_options"] = MINOR_THREAT_OPTIONS
            data["major_threats_and_minor_side_threats"] = threats
            changed = True
            print(f"{sid}: added minor_threat_options")

        if not changed:
            print(f"{sid}: already up-to-date")
            continue

        new_json = json.dumps(data, ensure_ascii=False, indent=2)
        checksum = hashlib.sha256(new_json.encode()).hexdigest()
        now = datetime.datetime.utcnow().isoformat() + "+00:00"
        cur.execute(
            "UPDATE story_files SET json_copy=?, checksum=?, updated_at=? WHERE file_id=?",
            (new_json, checksum, now, row["file_id"]),
        )

        full_path = resolve_path(row["storage_path"])
        if os.path.exists(full_path):
            with open(full_path, "w", encoding="utf-8") as f:
                f.write(new_json)
            print(f"  updated file: {full_path}")
        else:
            print(f"  file not found (DB updated, fs skip): {full_path}")

    con.commit()
    con.close()
    print("Done.")


if __name__ == "__main__":
    main()
