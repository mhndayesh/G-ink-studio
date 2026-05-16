"""Seed story_003 (The Quiet Pattern) with arc 1 — 4 chapters, 15 scenes, 4 locations.

Run after the 2 majors, 2 sides, and 3 relationships are already in place.
"""
import json
import urllib.request
import urllib.error

BASE = "http://localhost:8080/api/v1/stories/story_003"
HEADERS = {"Content-Type": "application/json", "x-user-id": "dev_user"}


def call(method, path, body=None):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(BASE + path, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"ok": False, "error": json.loads(e.read())}


# Narrative structure
print("narrative:", call("PATCH", "/plot-outline/narrative-structure", {"selected": "Kishotenketsu"})["ok"])

# Arc overview
for k, v in [
    ("arc_title", "The Settling"),
    ("arc_summary",
     "A burned-out detective is the only person to notice the world is becoming too quiet — too uniformly peaceful. "
     "The pattern leads him to a vision he cannot unsee and a book that confirms the worst: an old enemy has returned "
     "with a soft strategy, and there is no clean way to stop them."),
    ("main_external_conflict",
     "An invisible takeover by entities that possess powerful people and erase resistance not through war but through engineered consensus."),
    ("main_internal_conflict",
     "Kinji's drift between alcohol, debt, and giving up — and the certainty that he is the only one who has seen it."),
    ("main_story_question",
     "What does a man do when the truth he carries cannot be acted on without killing the people the world depends on?"),
]:
    r = call("PATCH", "/plot-outline/arc-overview", {"target_branch": k, "operation": "replace", "value": v})
    print(f"  arc/{k}:", r["ok"])

print("arc_length:", call(
    "PATCH", "/plot-outline/arc-overview",
    {"target_branch": "arc_length_type.selected", "operation": "replace", "value": "Short Arc"},
)["ok"])

# 4 Chapters
chapters = [
    {
        "chapter_id": "ch_001", "chapter_number": 1, "chapter_title": "The Pattern",
        "chapter_purpose": "Establish Kinji's lazy, debt-ridden life and the quiet suspicion that the world's peace is too symmetrical to be real. End with his friend Hina dismissing the idea.",
        "main_conflict": "Kinji vs the comfort of disbelief — his own and his friend's.",
        "emotional_beat": "Loneliness disguised as cynicism.",
        "twist_or_hook": "The same speech, word for word, in two different countries, on two different channels.",
        "ending_cliffhanger": "Hina laughs and pours him another. Kinji laughs too. The pattern stays in his head.",
    },
    {
        "chapter_id": "ch_002", "chapter_number": 2, "chapter_title": "The Smoke in the Window",
        "chapter_purpose": "Drunken walk home turns into the moment that breaks his reality — he sees what Hideo Kurosawa really is.",
        "main_conflict": "Kinji's curiosity vs his self-preservation.",
        "emotional_beat": "Drunk numbness sharpened into terror.",
        "twist_or_hook": "Black smoke and two floating red eyes inside a sleeping CEO.",
        "ending_cliffhanger": "He falls off the fence, scrambles up, runs through empty streets toward home.",
    },
    {
        "chapter_id": "ch_003", "chapter_number": 3, "chapter_title": "The Search",
        "chapter_purpose": "Days of obsession. The apartment becomes a paper-strewn cell. He finds one obscure reference and understands the rules of the thing.",
        "main_conflict": "Truth vs the futility of holding it alone.",
        "emotional_beat": "From manic searching to hollow recognition.",
        "twist_or_hook": "An old text describes dimensional invaders who failed twice; this third invasion is silent on purpose.",
        "ending_cliffhanger": "He realises no one will believe him and there is no one left to tell.",
    },
    {
        "chapter_id": "ch_004", "chapter_number": 4, "chapter_title": "The Antique Shop",
        "chapter_purpose": "Last attempt for help. Madam Vesper rebuffs him, then comes to him. The book confirms the worst. He goes home to die.",
        "main_conflict": "Hope vs the cost of finally knowing.",
        "emotional_beat": "From hope to despair to suspended choice.",
        "twist_or_hook": "The old woman has been the shopkeeper for over a hundred years.",
        "ending_cliffhanger": "He reads the book to the end. The only way to kill them is to kill the host. He lies down with the rope in his hand.",
    },
]
for ch in chapters:
    r = call("POST", "/plot-outline/chapters", ch)
    print(f"  chapter {ch['chapter_id']}:", r["ok"])

# Scenes — 15 total, each with time-of-day for the Lighting fallback
scenes = [
    # Ch 1 — The Pattern
    {"scene_id": "scene_101", "chapter_id": "ch_001", "scene_order": 1, "location": "Kinji's Apartment", "time": "Morning",
     "scene_goal": "Show Kinji's life — cigarettes, debt notices on the floor, empty client ledger, the news on a small TV.",
     "visual_manga_moment": "A close-up of the same world leader speaking on screen, then a wider shot showing the news ticker repeating the same phrasing in a different language."},
    {"scene_id": "scene_102", "chapter_id": "ch_001", "scene_order": 2, "location": "Town Streets", "time": "Afternoon",
     "scene_goal": "Kinji walking. He sees ordinary peace everywhere — too ordinary.",
     "visual_manga_moment": "Two shop owners who used to compete now sharing a smoke and a polite smile. Kinji watches from across the road."},
    {"scene_id": "scene_103", "chapter_id": "ch_001", "scene_order": 3, "location": "Kinji's Apartment", "time": "Evening",
     "scene_goal": "Hina arrives with shochu. They drink. Kinji finally voices the pattern. Hina laughs it off.",
     "visual_manga_moment": "Two men at a low table, the bottle between them. Hina laughing softly, Kinji not."},
    # Ch 2 — The Smoke
    {"scene_id": "scene_201", "chapter_id": "ch_002", "scene_order": 1, "location": "Town Streets", "time": "Night",
     "scene_goal": "Drunken walk home. The town is too quiet.",
     "visual_manga_moment": "A single lit window across the road. Inside, a figure stands motionless."},
    {"scene_id": "scene_202", "chapter_id": "ch_002", "scene_order": 2, "location": "Kurosawa Mansion (Exterior)", "time": "Night",
     "scene_goal": "Kinji climbs the fence to see better.",
     "visual_manga_moment": "His shaking hands gripping cold iron, suit jacket catching on the rail."},
    {"scene_id": "scene_203", "chapter_id": "ch_002", "scene_order": 3, "location": "Kurosawa Mansion (Exterior)", "time": "Night",
     "scene_goal": "He sees the truth through the bedroom window.",
     "visual_manga_moment": "Hideo lying on the bed. A thin black smoke curls from his mouth. Two floating red eyes inside it. Kinji's pupils blow wide."},
    {"scene_id": "scene_204", "chapter_id": "ch_002", "scene_order": 4, "location": "Town Streets", "time": "Night",
     "scene_goal": "Falls off the fence. Runs.",
     "visual_manga_moment": "His soles hammering wet asphalt, breath fogging, the cigarette gone from his mouth."},
    # Ch 3 — The Search
    {"scene_id": "scene_301", "chapter_id": "ch_003", "scene_order": 1, "location": "Kinji's Apartment", "time": "Night",
     "scene_goal": "Tears through every book he owns and every search bar he can find.",
     "visual_manga_moment": "The apartment lit only by the laptop screen. Books open on the floor. An ashtray full of crushed butts."},
    {"scene_id": "scene_302", "chapter_id": "ch_003", "scene_order": 2, "location": "Kinji's Apartment", "time": "Morning",
     "scene_goal": "Days later. He has stopped sleeping. The room is paper and smoke.",
     "visual_manga_moment": "Sunlight through cracked blinds catching the smoke. Kinji's eyes hollow."},
    {"scene_id": "scene_303", "chapter_id": "ch_003", "scene_order": 3, "location": "Kinji's Apartment", "time": "Evening",
     "scene_goal": "Finds the one reference — a single paragraph in an obscure online scan of an old book. Realises no one will believe him.",
     "visual_manga_moment": "A close-up of the laptop screen. The paragraph. Kinji's reflection over the text."},
    # Ch 4 — The Antique Shop
    {"scene_id": "scene_401", "chapter_id": "ch_004", "scene_order": 1, "location": "Antique Shop", "time": "Afternoon",
     "scene_goal": "Last hope. Walks into a dim antique shop. Madam Vesper at the counter.",
     "visual_manga_moment": "Dust suspended in a single shaft of light. The brass bell shivering as the door closes behind him."},
    {"scene_id": "scene_402", "chapter_id": "ch_004", "scene_order": 2, "location": "Antique Shop", "time": "Afternoon",
     "scene_goal": "He asks about the creatures, claiming it's for a film. She knows it isn't. She throws him out without raising her voice.",
     "visual_manga_moment": "Her hand on the door handle. Her face perfectly composed. Kinji on the street, lost."},
    {"scene_id": "scene_403", "chapter_id": "ch_004", "scene_order": 3, "location": "Kinji's Apartment", "time": "Night",
     "scene_goal": "He sets things up to end it. A rope. A chair. A last cigarette.",
     "visual_manga_moment": "His silhouette under the bare bulb, the rope hanging like a question mark."},
    {"scene_id": "scene_404", "chapter_id": "ch_004", "scene_order": 4, "location": "Kinji's Apartment", "time": "Night",
     "scene_goal": "Knock at the door. Vesper, the book in her hand. She presses it into his chest and leaves without a word.",
     "visual_manga_moment": "The book between them. Her small lined hand pushing it forward."},
    {"scene_id": "scene_405", "chapter_id": "ch_004", "scene_order": 5, "location": "Kinji's Apartment", "time": "Night",
     "scene_goal": "He reads. Reads again. The only way to kill them is to kill the host. The arc ends with him holding the book and the rope, frozen.",
     "visual_manga_moment": "The book open on his lap. His face lit by the page. The rope coiled at his feet."},
]
for sc in scenes:
    r = call("POST", "/plot-outline/scenes", sc)
    print(f"  scene {sc['scene_id']}:", r["ok"], "" if r["ok"] else r.get("error", {}).get("error", {}).get("message", ""))

# 4 Locations
locs = [
    {"name": "Kinji's Apartment", "type": "interior",
     "description": "A cramped one-room flat above an old laundromat. Peeling wallpaper, water-stained ceiling, a single naked bulb. Stacks of overdue notices, an ashtray that has not been emptied in a week, a low table with cigarette burns. A small TV with a broken antenna. The window faces a brick wall."},
    {"name": "Town Streets", "type": "exterior",
     "description": "Narrow streets of an old district. Hand-painted shop signs, vending machines glowing in the dark, power lines crossing the sky. The pavement always slightly wet. At night the streets are empty in a way that feels like a held breath."},
    {"name": "Kurosawa Mansion (Exterior)", "type": "exterior",
     "description": "A walled estate at the top of the rise. An iron perimeter fence with spear-tip rails. A single bedroom window glowing through curtained glass on the upper floor. Hedges below the wall."},
    {"name": "Antique Shop", "type": "interior",
     "description": "A small cluttered shop on a side street. Wood-and-glass cabinets full of pocket watches, hand-bound books, lacquered boxes, tarnished mirrors. A brass bell on the counter. Dust suspended in shafts of late afternoon light. The shopkeeper sits in absolute stillness behind the counter."},
]
for loc in locs:
    r = call("POST", "/locations", loc)
    print(f"  location {loc['name']}:", r["ok"], "->", r["data"].get("location_id") if r["ok"] else r.get("error"))
