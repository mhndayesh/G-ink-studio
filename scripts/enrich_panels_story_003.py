"""Load each approved chapter back to the working slot, patch panels with
characters_in_panel + lighting + facial_expression, re-approve.

Maps scenes → characters based on the story so the AI generation pipeline sees
explicit who's-in-frame for every panel (audit fix #6).
"""
import json
import urllib.request
import urllib.error

BASE = "http://localhost:8080/api/v1/stories/story_003"
HEADERS = {"Content-Type": "application/json", "x-user-id": "dev_user"}

# scene_id → list of character IDs in every panel of that scene
SCENE_CHARS = {
    "scene_101": ["char_001"],                            # Kinji alone, watching news
    "scene_102": ["char_001"],                            # Kinji walks town
    "scene_103": ["char_001", "char_002"],                # Drink with Hina
    "scene_201": ["char_001"],                            # Drunk walk home
    "scene_202": ["char_001"],                            # Climbing fence
    "scene_203": ["char_001", "side_002"],                # Sees Hideo through window
    "scene_204": ["char_001"],                            # Running
    "scene_301": ["char_001"],                            # Research
    "scene_302": ["char_001"],                            # Days later
    "scene_303": ["char_001"],                            # Finds reference
    "scene_401": ["char_001", "side_001"],                # Walks into antique shop
    "scene_402": ["char_001", "side_001"],                # Thrown out
    "scene_403": ["char_001"],                            # Setting up rope
    "scene_404": ["char_001", "side_001"],                # Vesper at his door
    "scene_405": ["char_001"],                            # Reading the book
}

# Per-scene mood / expression context — a few high-impact panels get an
# explicit facial_expression so the character-attributed Expression line lands.
SCENE_EXPRESSION = {
    "scene_103": "Kinji deadpan unsmiling, glass paused at his lips; Hina warmly grinning, eyes crinkled",
    "scene_203": "Kinji pupils blown wide, jaw slack with disbelief; the body on the bed totally still and inhuman",
    "scene_303": "Kinji hollowed out, the recognition of something larger than him settling behind his eyes",
    "scene_402": "Vesper perfectly composed, the slightest knowing tilt of her head; Kinji confused, mouth opening to protest",
    "scene_404": "Vesper still and exhausted, eyes daring him to refuse; Kinji frozen with the book against his chest",
    "scene_405": "Kinji blank, lit by the page, no defence left in his face",
}


def call(method, path, body=None):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(BASE + path, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"ok": False, "error": json.loads(e.read())}


def patch(branch, value, op="replace"):
    return call("PATCH", "/chapter-script", {"target_branch": branch, "operation": op, "value": value})


def enrich_chapter(chapter_id):
    # Load the approved chapter back into the working slot
    r = call("POST", f"/chapter-script/load?chapter_id={chapter_id}")
    print(f"\n[{chapter_id}] load:", r["ok"], r.get("error", {}))
    if not r["ok"]:
        return

    script = call("GET", "/chapter-script")
    pages = script["data"]["content"]["pages"]

    for page_idx, page in enumerate(pages):
        scene_id = page.get("scene_id")
        chars = SCENE_CHARS.get(scene_id, [])
        expression = SCENE_EXPRESSION.get(scene_id, "")
        for panel_idx, _panel in enumerate(page["panels"]):
            base = f"pages.{page_idx}.panels.{panel_idx}"
            if chars:
                r = patch(f"{base}.characters_in_panel", chars, op="add")
                if not r["ok"]:
                    print(f"  WARN page {page_idx} panel {panel_idx} chars:", r.get("error"))
            if expression and panel_idx in (0, 2, 4):  # only set on a few panels per scene
                r = patch(f"{base}.facial_expression", expression, op="replace")
        print(f"  page {page_idx} scene {scene_id} -> {len(chars)} chars, expr={'yes' if expression else 'no'}")

    # Re-approve to commit the enriched version to history
    r = call("POST", "/chapter-script/approve", {})
    print(f"  approve:", r["ok"])


import sys
chapters_to_run = sys.argv[1:] if len(sys.argv) > 1 else ["ch_001", "ch_002", "ch_003", "ch_004"]
for ch in chapters_to_run:
    enrich_chapter(ch)

print("\nAll chapters enriched.")
