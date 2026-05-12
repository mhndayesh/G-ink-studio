# Source Bundle Audit — `new-g-ink-xport/`

> **Status (cleanup branch):** The *export layer* now mitigates several of these on the
> way out — see `apps/api/app/services/visual_prompt.py` + the changes in
> `export_service.py`. Specifically:
> - **#2 (bad shot slot)** — `canonical_camera_shot()` drops "Action Shot"/"Reaction Shot"/"Custom" from the panel header tag list (and from `panels.csv`).
> - **#3 (wrong render mode)** — `Render mode` is now derived from the in-frame named-cast count (`render_mode_for_cast`): 0→`t2i`, 1→`i2i`, 2→`i2i-2refs`, 3+→`i2i-2refs` + a "pick 2 references" note. (Counts only *speaking* characters at export time; silent ones are missed.)
> - **#4 / #5 / #6 (dirty character / location prompts; colour; mixed style words)** — every exported AI prompt is now built through `compile_visual_prompt()`: colour words stripped, lighting / "cinematic" / "noir" / "atmospheric" / render-quality / per-entity style tokens removed, and the single fixed prefix **`black and white Japanese manga style`** prepended. Negatives go through `negative_prompt()` (standard B&W-manga exclusion list).
> - **#8** — an `Expression: N/A …` line on an object-only panel is omitted.
> - **validation #8** — `export/validate` now also flags prompts that still contain colour/lighting/style noise in the *source* data (info level).
>
> Still **upstream-only** (the generator should still be fixed at source — these are not yet handled): **#1** (scrambled `Location:` ↔ panel mapping), **#7** (non-canonical character spelling), and improving the LLM *generation* so the stored prompts are already clean — the prompt schemas in `llm_service.py` now ask the model for short, visual-only, colour-free, style-word-free output (`STYLE_INSTRUCTION`), but old stored data is only cleaned on export.

*What's wrong in the exported `others-*.md` bundle, ordered by impact, written so it can be fixed at the generator that produces these files. None of this blocks the studio today — the importer works around most of it — but every fix makes the output cleaner without the studio having to guess.*

Audited: `others-visuals.md` (the structured chapter→page→panel breakdown), `others-story.md`, `others-scenes.md`, `validation_report.md`.

---

## 1. `Location:` on the page header is scrambled — it doesn't match the panels (highest impact)

The `Page N - Scene: … - Location: X` line is shifted/shuffled relative to the actual panel content on **4 of 5 pages**:

| Page | Header says | Panels actually show | Should be |
|---|---|---|---|
| 1 | Shimizu Ward Streets (The Quiet District) | "cramped, dimly lit **apartment** interior with peeling wallpaper", "apartment hallway visible behind Odo", Kinji slouched on a worn sofa | **Kinji Sato's Apartment** |
| 2 | The Underworld Diner / 'The Rusty Anchor' | "Iron Takeda's **abandoned office**, door hanging off its hinges" — every panel; the `Purpose:` line literally says "arrive at Takeda's abandoned office" | **Iron Takeda's Abandoned Office** |
| 3 | Kinji Sato's Apartment | "Exterior wide shot of **Shimizu Ward streets** at dusk", "street lined with closed shops", "looking back toward the office district" — every panel | **Shimizu Ward Streets (The Quiet District)** |
| 4 | Iron Takeda's Abandoned Office | Kinji's eye → the office dissolving into a dimensional rift | OK-ish for P1–2; by P3–5 it's really **The Fracture Point / Dimensional Rift Edge** |
| 5 | Shimizu Ward Streets (The Quiet District) | "pocket of stable reality amidst swirling chaos", "jagged cracks in reality like a broken mirror", "dimensional static" | **The Fracture Point / Dimensional Rift Edge** |

This pattern looks like an off-by-one or a bad shuffle in the upstream scene→location mapping. Knock-on effects:

- **`The Underworld Diner / 'The Rusty Anchor'`** and **`The Veil Syndicate Local Siphon Node`** are never the real setting of any panel — dead location entries. (`Loria's Antique Shop / Archive` too, and the character `loria` never appears in a panel either.)
- Page 2's `Purpose:` ("arrive at Takeda's abandoned office") **contradicts its own `Location:`** ("The Underworld Diner") within the same header.
- Page 3's `Purpose:` ("…as they begin to search the warped room for clues") contradicts its panels (a street walk, no "warped room") — the `Purpose` line looks copied from a different scene as well.

**Fix at source:** make the scene→location assignment follow the panel visuals; keep `Purpose`, `Location`, and the panel `Visual` lines mutually consistent; don't emit locations that no scene actually uses (or mark them explicitly as "appears later in the story").

---

## 2. The `[Size / Shot / Pacing]` panel header — slot 2 is not a camera shot

Every panel header is `[Medium / Establishing Shot / Slow]`, `[Medium / Wide Shot / Normal]`, `[Medium / Action Shot / …]`, `[Medium / Reaction Shot / …]`, `[Medium / Close-Up / …]`.

- **"Action Shot" and "Reaction Shot" are narrative beats, not camera framings.** The real framing is written into the `Visual:` line ("Two-shot capturing…", "Over-the-shoulder shot…", "Low angle shot…", "Extreme close-up on…") — so the generator already has it, it just puts the wrong token in the header slot.
- **Slot 1 is always "Medium"** for all 25 panels — it carries zero information.

**Fix at source:** put the actual camera framing in slot 2, drawn from a controlled vocabulary: `establishing shot, wide shot, medium shot, medium close-up, close-up, extreme close-up, over-the-shoulder shot, two-shot, low angle shot, high angle shot, cowboy shot, bird's-eye view`. Or drop the `[…]` header entirely and keep relying on the `Visual:` prose — the importer extracts the shot from there fine now.

---

## 3. `Render mode: i2i` is wrong for multi-character panels

`i2i` means **one reference image**. The bundle uses the mechanical rule "panel 1 of each scene = `t2i`, panels 2–5 = `i2i`", which is wrong in two directions:

- **Panels with 2 characters in frame should be `i2i-2refs`** (the ImageStitch workflow), not `i2i`: Page 1 P2/P5, Page 3 P5, Page 4 P5, Page 5 P5, etc.
- **Panels with 3 characters** (the trio scenes — Page 3 P1/P2, Page 4 P3, Page 5 P2/P4) **can't be done with a 2-image stitch at all** — there's a hard 2-reference max. The generator should pick the 2 most important characters and drop the third, or flag the panel.
- The "panel 1 = `t2i`" convention also misfires the other way: Page 4 Panel 1 is "Extreme close-up on Kinji's eye" — a Kinji panel; if Kinji has a reference, it should be `i2i` (1-ref), not `t2i`.

**Fix at source:** set `Render mode` from the in-frame cast count, not panel position — 0 named characters → `t2i`, 1 → `i2i`, 2 → `i2i-2refs`, 3+ → `i2i-2refs` plus a warning. Or just emit `Render mode: auto` and let the studio resolve it (the studio already picks `i2i-2refs` automatically when 2+ characters in a panel have reference images).

---

## 4. Character "AI prompt (positive)" sheets bake in a one-off scene / pose / lighting — they're not clean references

A character reference is **the visible person, nothing else**: gender/age/build, face shape & markings, hair style + colour, eye shape + colour, signature outfit, iconic props. Each of these instead smuggles in an entire scene that then fights every panel the character appears in (the studio reuses the character prompt verbatim in t2i panel prompts):

- **kinji sato** — `"…cigarette in mouth, leaning against a brick wall, noir atmosphere, detailed line art, cinematic lighting"`. "leaning against a brick wall" is a pose + setting; "noir atmosphere" / "cinematic lighting" are render directives. Keep only: *tall thin man in late 20s, messy black hair, tired dark eyes, faded charcoal suit, loose tie, cigarette.*
- **oddo** — `"rough street aesthetic, young man in supermarket vest holding beer can under a concrete bridge at dusk, lo-fi anime lighting, expressive eyes"`. "holding beer can under a concrete bridge at dusk" + "lo-fi anime lighting" = a whole panel. There is **no face / hair / eye-colour / age** at all — the sheet is mostly setting. Should be: *young man, [hair style + colour], [eye colour], supermarket worker's vest, [cap].*
- **hina** — `"Anime style, cute girl, short brown bob hair, amber eyes, oversized sweater and skirt, expressive face, dynamic lighting"`. Better, but "dynamic lighting" is a one-off, and **"Anime style" conflicts with everyone else's "Manga style"** and with the project's global style "manga style, black and white".
- **loria** — `"…warm dim lighting, antique shop background, detailed facial wrinkles, holding brass key, atmospheric dust particles, cinematic composition"`. "antique shop background", "warm dim lighting", "atmospheric dust particles", "cinematic composition" — all scene / render, not appearance.

**Fix at source:** the "AI prompt (positive)" for a character should contain *only* what you'd see in a character-sheet drawing — no setting, no lighting, no "cinematic"/"noir"/"atmosphere", no per-character "style" word, no pose. You already emit the structured fields (`Age`, `Hair style`, `Clothing style`, …) — just stop appending a scene to the prompt line.

---

## 5. Style vocabulary is inconsistent

Three characters say "Manga style", hina says "Anime style", locations say "manga background", the project's global style is "manga style, black and white". Pick **one** word — and ideally **don't repeat it per-entity at all**, since the system / global-style layer already prepends "manga style, black and white" to every prompt. Repeating it wastes tokens and risks contradiction.

---

## 6. Location sheets are written in colour, for a black-and-white manga

The location "AI prompt (positive)" lines are full of hues — *"muted earth tones and dusty browns"*, *"desaturated steel blue and gray color palette"*, *"warm amber lighting"*, *"cold violet underlighting"*, *"sickly pale green"*, *"tinged with violet static"*. The project renders **black and white**, so a B&W model either ignores these or actively fights you by trying to introduce tone.

**Fix at source:** describe lighting / atmosphere in value (light–dark) terms for a B&W target — *"deep shadows", "high contrast", "harsh flat white light", "soft grey haze", "dramatic chiaroscuro"* — not colour names.

---

## 7. Character naming isn't canonical

The id / name is **`oddo`** but the dialogue labels and prose say **`Odo`** (one d); `kinji sato` (lowercase) vs prose `Kinji`. Dialogue-speaker detection still works (the `Dialogue:` labels match the lowercase ids), but a *mention* of "Odo" in a `Visual:` / `Action:` line won't reliably link to the character `oddo` unless he also happens to speak in that panel.

**Fix at source:** one canonical spelling per character everywhere — the id, the display name, the `Dialogue:` label, and every mention in `Visual` / `Action` / `Narration`. If you want a casual short form, put it in an explicit aliases list rather than spelling the name differently in different places.

---

## 8. Smaller stuff

- Page 5 Panel 3: `Expression: N/A - object focus on the pulsing surveillance device` — for an object-only panel, just omit the `Expression:` field rather than writing "N/A - …".
- `validation_report.md` says *"No issues detected. Story export is fully compatible with G-Ink Studio."* — it caught **none** of the above. That validator only checks "does it parse", not "does the content cohere". If you own it, it should flag: (a) a `Location:` whose name doesn't appear in any panel's `Visual` text on that page; (b) a `Render mode` that doesn't match the in-frame cast count; (c) a `Purpose` contradicting its own `Location`; (d) character "AI prompt" lines containing setting / pose / lighting / colour / "cinematic" / "noir" tokens; (e) mixed style words across characters; (f) colour words in a black-and-white project; (g) inconsistent character spelling between the id, the dialogue label, and the prose.

---

## Priority — if you only fix three things

1. **The scrambled `Location:` mapping (#1)** — the most visibly wrong thing, and it poisons every i2i panel's scene description.
2. **Stop baking scenes into character "AI prompt" lines (#4)** — clean references are the entire point of the Cast & World stage.
3. **Set `Render mode` from the cast, not panel position (#3)** — so 2-character panels actually get the stitch workflow and 3-character panels get flagged.

---

## How the studio currently copes (so you know what's "handled" vs "lossy")

- **#2 (bad shot slot):** handled — the importer ignores the "Action Shot / Reaction Shot" junk and detects the real framing from the `Visual:` prose; falls back to "medium shot" only if nothing is recognisable.
- **#1 (wrong location):** lossy — the importer trusts the page `Location:`; when it's wrong, every panel on that page (and the i2i scene descriptions) inherit the wrong setting. The AI fill's keyword-based `detectLocation` only kicks in for panels with *no* location, so it can't override a wrong-but-present one.
- **#3 (wrong render mode):** partly handled — the importer respects an explicit `Render mode`, but the studio resolves the *effective* mode against the actual reference images on file (no refs → `t2i` regardless), and auto-mode panels with 2+ referenced characters become `i2i-2refs` automatically. An explicit `i2i` on a 2-character panel still won't auto-upgrade to the stitch workflow, though.
- **#4 / #5 / #6 (dirty character & location sheets):** lossy — those tokens flow straight into the compiled prompts. The Cast & World "AI fill" with an LLM connected re-derives a cleaner visual-only tag list from the structured sheet fields, but without an LLM the raw "AI prompt (positive)" is used as-is.
- **#7 (naming):** mostly handled — dialogue-speaker matching is exact-on-label; first-name aliases are auto-added; only prose-only mentions with a different spelling are missed.
