# G-Ink Studio — Architecture Review & Recommendations

*A candid technical assessment of the current build, the design decisions that are holding it back, and a concrete proposal for a cleaner foundation that will produce more consistent, professional results.*

---

## Implementation status (2026-05-12)

The refactor in §3 / §5 has been carried out. Done:

- **Ingest** now extracts the camera shot from the panel's visual prose at parse time (`detectCameraShot`), validates it against a single canonical vocabulary (`CAMERA_SHOTS` in `docSchema.js`), maps every panel in a scene to that scene's location, and runs character detection (dialogue speakers + name mentions) at parse time. Fixed a `parseVisuals.js` block-header regex that silently dropped any character/location whose name contained `(` `)` etc. (e.g. "Shimizu Ward Streets (The Quiet District)").
- **Panel prompts are no longer written by an LLM.** `rules.js → compilePanelPrompt(doc, panel)` assembles them deterministically and **branches on render mode**: `t2i` → comma-separated tag list (system + each character's compiled visual tags verbatim + camera shot + location's visual tags + mood-as-lighting); `i2i` / `i2i-2refs` → a short natural-language *edit instruction* for the Qwen Image Edit model that describes the scene around the referenced character(s), not their appearance (the reference image carries that). The effective render mode is whatever the renderer will actually do — `renderMode:'i2i'` with no reference images on file resolves to `t2i`, so the prompt format always matches what gets rendered.
- **The LLM now does exactly two jobs:** (1) Cast & World — prose sheet → visual tag list; (2) Pages — one batched call per page translating each panel's prose mood into 3-5 lighting/atmosphere tags. With no LLM configured, every stage still produces a usable result. `llmFillFields`/`llmCompilePanelPrompts` (the integer-table machinery) are gone.
- **`cameraShot` is an enum**, unified across server and web, validated on every write (`patchPanel`, ingest, `validateDocument`); junk like `"Action Shot"` is rejected/normalised at the door.
- Adding/removing a character or location reference image now marks the affected panels' prompts stale (the render mode — and therefore the prompt *format* — changed).
- Deleted the unused 3-ref `qwen-i2i-4step-multi-image.json` workflow.

Not done (deliberately deferred — "polish", and risky to do in the same pass): §3.6 timestamp-based staleness. The `_promptStale` / `_renderStale` boolean flags remain.

Verification: `npm test` — 9 server tests pass (rules engine, `detectCameraShot`, cameraShot enum rejection, render-mode-branched `compilePanelPrompt`, ingest, stage gates + staleness, auto-run end-to-end) + `tsc && vite build` clean. A full ingest of `new-g-ink-xport/` → Cast & World → Pages produces: 25/25 panels with a camera shot, 25/25 with a location, 25/25 with a compiled prompt; prompt format correctly follows render mode; the i2i path renders sensible edit instructions once reference images exist.

---

## TL;DR

The studio has the right **skeleton** — staged pipeline, gated workflow, layered prompt rules, character/location visual prompts compiled separately, a real ComfyUI adapter with graph→API parity. None of that needs to change.

But the **flesh on the bones is backwards in four places**, and all four trace back to one root cause: **the system uses an LLM to do work that is either already structured in the source files, or is pure mechanical assembly.** The LLM should be doing one hard thing — turning prose descriptions into clean visual tags — and almost nothing else. Right now it's doing five fuzzy things in a chain, and each link can fail silently and corrupt the next.

If you fix the ingest parser and make the panel-prompt compiler fully deterministic, you delete ~60% of the AI-fill complexity, the results become reproducible, and the failure modes you've been hitting (wrong location → wrong prompt, garbage camera-shot values, "the AI told a story instead of describing a picture") mostly disappear.

---

## 1. What is genuinely good — keep all of this

| Decision | Why it's right |
|---|---|
| **5-stage strict linear pipeline** (Story → Cast & World → Pages → Render → Letter/Export) with hard gates and no skip hatch | This is the correct answer to "workflow not corruption-proof." A page can't be rendered before its prompt is compiled; a prompt can't be compiled before the cast sheet exists. Don't loosen this. |
| **Layered prompt rules** (system → entity → panel), system tokens always present, lower layers can only *add* | Conceptually exactly how a production style guide works. The implementation has problems (below) but the model is sound. |
| **Character & location visual prompts compiled in their own stage** | Separating "what does Kinji look like" from "what is happening in panel 4" is the single best structural decision in the codebase. It means a character's appearance is defined *once* and reused everywhere. |
| **i2i / t2i / i2i-2refs render modes**, auto-selected from whether the cast has reference images | Right call. The ImageStitch topology for 2 refs is correct (two LoadImage → ImageStitch → both TextEncodeQwenImageEdit.image and VAEEncode.pixels). |
| **Graph→API conversion at runtime** (`toApiFormat`) reading the actual ComfyUI workflow files | This is the *correct* way to guarantee parity with what the user runs in the ComfyUI UI. Handling `widgets_values`, `control_after_generate` tokens, and `IMAGEUPLOAD` inputs is fiddly but you got it right. |
| **Dynamic panel render size** from the layout cell's aspect ratio, rounded to 64px, capped at 1472 | Sound. A wide establishing panel should not be rendered at the same dimensions as a tall reaction panel. |
| **Jobs + SSE for long operations**, per-item isolation (one bad panel never aborts a batch), deterministic-first (compiler always produces *something* even with no LLM) | All correct instincts. |
| **Provider abstraction** (cloud Anthropic/OpenAI ↔ local LM Studio ↔ off) | Right. The bug surface this introduces (local models returning `"5"` instead of `5`) is real but it's a parsing problem, not an architecture problem. |
| **Single SQLite file, document-per-project, `updateProject(mutator)` discipline**, sha256-deduped asset BLOBs | Clean. Don't scatter state back onto disk. |

---

## 2. What is fundamentally wrong

### 2.1 — The LLM is generating panel prompts. It shouldn't be.

**The current flow** (`director.js` → `llmCompilePanelPrompts`): for each panel, hand the LLM the visual text, action text, the characters' compiled visual prompts, the location, the mood — and ask it to *write* a comma-separated tag list.

**Why this is wrong:** a panel image prompt is not a creative writing task. It is a **mechanical assembly** of pieces that *already exist*:

```
panelPrompt =
    systemTags                       // from systemRule.positive — fixed
  + character1VisualTags             // already compiled in Cast & World — verbatim
  + character2VisualTags             // already compiled in Cast & World — verbatim
  + cameraShotTag                    // a structured enum value
  + locationVisualTags               // already compiled in Cast & World — verbatim
  + moodAsLightingTags               // the ONE thing that needs translation
  + letteringClause                  // fixed, conditional on dialogue/narration
```

Every input on the right-hand side is already a clean, reviewed value. Stitching them together with commas, deduping, and truncating to `maxLength` is a `compilePrompt()` call you already have. It runs in microseconds, produces the **same output every time**, and cannot hallucinate a sixth finger onto the prompt.

When you route this through an LLM instead, you get: nondeterminism (same panel, different prompt each run), the model "improving" the character description (defeating the whole point of compiling it once), the model slipping into prose ("Kinji's weary eyes betray his exhaustion as he…"), and a per-panel network round-trip. You've spent the last several iterations writing ever-stricter system prompts ("NO story context", "copy verbatim", "the image model knows NOTHING about the story") — that is the sound of fighting a tool that shouldn't be in this position.

**The LLM's only legitimate job in the Pages stage** is the one fuzzy translation: `"Eerie urban stillness masking underlying tension"` → `"dim lighting, long shadows, deserted street, oppressive atmosphere"`. That's a small, well-scoped call. Everything else is template substitution.

### 2.2 — Camera shot and location are inferred after the fact. They should come from the ingest.

`llmFillFields` exists to answer two questions per panel: *which camera shot?* and *which location?* It does this by re-reading the panel's narrative text — sometimes with the LLM, sometimes with regex fallbacks (`guessCameraShot`, `detectLocation`).

But **both answers are already in the source material:**

- The camera shot is *literally written in the visual note*: `"Two-shot capturing Kinji sitting up slightly…"`, `"Close-up on the manila folder…"`, `"Wide establishing shot of a cramped, dimly lit apartment interior…"`, `"Low angle shot looking up at Kinji…"`. The author wrote the framing. The `guessCameraShot` regex is the *right logic in the wrong place* — it should run **once, at ingest time**, not as a runtime fallback after a flaky LLM call.

- The location is implied by the scene structure. `others-scenes.md` groups panels into scenes; the scene has a setting. The ingest should build a `scene → location` mapping and stamp every panel in that scene with it. Inferring it later from "Two-shot capturing Kinji sitting up slightly, his gaze locking onto Odo across the small gap between them" — which names *no location at all* — is guesswork that will be wrong roughly as often as it's right. (You saw this: all of Page 2 got tagged "The Rusty Anchor" when the visual text says "Iron Takeda's abandoned office" — the exact name of a *different* location in the project. All of Page 3 got tagged "Kinji's Apartment" when Panels 1–2 are an exterior street scene.)

A panel arriving from the ingest with a blank `cameraShot` or no `locationId` should be the *exception* (a genuinely ambiguous panel), not the rule. Right now it's the rule, and `llmFillFields` is the (leaky) patch.

### 2.3 — Qwen Image Edit is a VLM. You're feeding it Stable-Diffusion tag soup.

This is the quietest and possibly the most damaging mismatch.

The i2i model in the pipeline (`qwen-image-edit-Q4_0.gguf` + the Lightning 4-step LoRA, via `TextEncodeQwenImageEdit`) is a **vision-language instruction model**. It takes a reference image and a *natural-language instruction* about what to do with it: *"put this person in a dimly lit cramped apartment, sitting on the floor, seen from a low angle, cigarette in mouth."* That's the input shape it was trained on.

You're handing it `manga style, black and white, screentone shading, clean ink lines, man in his 30s, dark messy hair, lazy eyes, light beard, worn suit, loose tie, cigarette, two-shot, cramped apartment, dim lighting, leave clear space at top` — a Danbooru-style tag list. It will *do something* with that, but it's not the register the model wants, and it explains a lot of the "results aren't pro" feeling.

**The prompt format should branch on render mode:**

- **t2i** (no reference image): SD-style comma-separated tags — your current approach is fine here. A tag-based checkpoint wants tags.
- **i2i** (Qwen + 1 reference): a short natural-language *edit instruction*. The reference image already carries the character's face/hair/outfit — the text should describe **the scene around them and the framing**, not re-describe the person. `"Place this character in a cramped, dimly lit apartment interior, sitting up slightly on a low couch, two-shot composition with another man across from him, manga style, black and white screentone, leave empty space at the top for a speech bubble."`
- **i2i-2refs** (Qwen + ImageStitch): instruction referencing both — `"The two people from the reference image, standing in [location], [action], [framing], manga style…"`

This is a `rules/` change (a second template per rule, keyed by mode) plus a branch in the compiler. It is not a big change. It is probably the single biggest *visual-quality* lever you have.

### 2.4 — The Pages "AI fill" is a multi-pass chain where every link fails silently.

`aiFillPages` does, in sequence: (1) LLM field-fill for shot+location, (2) commit those, (3) deterministic cast detection, (4) deterministic location fallback, (5) LLM prompt compilation reading the freshly-committed fields, (6) commit prompts. `aiCompileOnePanel` does a single-panel version of the same chain.

When pass (1) returns garbage or an empty map (which it did, because the integer-table format confuses local models), pass (5) compiles a prompt from a panel with no location and a fallback-guessed shot. Nothing errors. The user sees a "COMPILED" badge on a panel whose location says "— none —" and whose shot is wrong. The failure is invisible until someone eyeballs the data — which is exactly what just happened.

A pipeline where the steps are mostly **deterministic** doesn't have this problem: there's no "the LLM didn't answer" branch because there's no LLM in that step. The one remaining LLM call (mood→lighting) either returns tags or it doesn't, and if it doesn't, the mood field is just left as-is and the compiler uses the prose mood as a weak fallback — visibly degraded, not silently corrupted.

### 2.5 — Smaller stuff, same theme

- **`cameraShot` is an unvalidated free string.** The ingest wrote `"Action Shot"` and `"Reaction Shot"` into it — values that don't exist in the UI dropdown's SHOTS list, so they render as "— pick a shot —" and silently fail the gate-readiness check's intent. It should be an **enum**, validated on every write (`patchPanel`, ingest, `llmFillFields`), rejecting anything not in the canonical list.
- **Staleness is tracked with a scatter of boolean flags** (`_promptStale`, `_renderStale`, `_letteringStale`, `_promptSource`). A cleaner model: store `fieldsTouchedAt` and `compiledAt` / `renderedAt` timestamps and *derive* staleness (`compiledAt < fieldsTouchedAt`). One source of truth, no flags to forget to set.
- **The `visual` field is doing double duty** as both "the storyboard director's note" (prose, written by the author) and "the thing we mine for image tags." Those are different. The ingest should parse the director's note into structured fields (shot, subject, setting cue) and leave `visual` as the human-readable note. The compiler then reads the structured fields, never the prose.
- **`negativeAddon` aggregation** concatenates the panel's negative plus every character's `negativeAddon`. For Qwen GGUF you've correctly learned negatives should be near-empty (`COMFY_NEGATIVE_OVERRIDE=no text`). So this aggregation mostly produces a long negative string that then gets thrown away by the override. Either honor it (t2i checkpoints) or drop it (Qwen) — branch on model, don't build-then-discard.

---

## 3. The recommended shape

Same stack. Same five stages. Same gating. Same DB discipline. Same ComfyUI adapter. **Change where the intelligence lives.**

### 3.1 — Invest 3× in the ingest. It is the foundation.

The ingest should turn `others-story.md` / `others-visuals.md` / `others-scenes.md` into **fully-structured panels**. Per panel, parsed deterministically from the source:

- `sceneId`, `pageId`, `chapterId`, `number`
- `cameraShot` — extracted from the visual note prose by the `guessCameraShot` regex logic, **validated against the enum**, blank only if genuinely absent
- `locationId` — from the `scene → location` mapping built out of the scene structure
- `characters[]` — from dialogue speaker labels + name/alias mentions in the note (the `detectCharacters` logic, run at ingest)
- `visual` (human note, untouched), `action`, `mood`, `dialogue`, `narration`, `sfxText`

Document the source format in `ASSET-FORMAT.md` so the parser has a contract. A panel arriving with a blank required field is a parser gap to fix, not a job for runtime AI.

### 3.2 — Make the panel-prompt compiler 100% deterministic.

`compilePrompt('panel', ctx, doc)` already does most of this. Make it the *only* path. It assembles:

```
[systemTags] → [each character's compiled visual tags, verbatim] → [cameraShot tag]
            → [location's compiled visual tags, verbatim] → [mood→lighting tags] → [letteringClause]
```

dedupes, truncates to `maxLength`. No LLM. Instant. Reproducible. The "AI fill this page" button becomes: *run the deterministic compiler over every panel, plus one small LLM call for the mood translations.* That's it.

### 3.3 — Scope the LLM to exactly two jobs.

1. **Cast & World**: prose character/location sheet → clean visual tag list. *This is the genuinely hard NLP task* and the place LLM effort belongs. The strict instructions you've written (`character.json`'s ordered tag list, "the image model knows NOTHING about the story") are well-suited *here* — they're fighting the wrong battle in the Pages stage but exactly right in this one. Prioritizing the source `"AI prompt (positive)"` field as the gold-standard hint is correct.
2. **Pages → mood translation only**: batch all of a page's `mood` strings → `{panelId: "3-5 lighting/composition tags"}` in one call. Small, bounded, reliable. If it fails, the compiler falls back to the raw mood prose — degraded, not broken.

Everything else in `director.js` that calls the LLM for panel-level work goes away.

### 3.4 — Branch the prompt format on render mode.

Add a second template to the panel rule, keyed by mode:

- `panel.json.template.t2i` — the current comma-tag template
- `panel.json.template.i2i` — a natural-language edit instruction template: `"Place {{characters}} in {{location}}, {{action}}, {{cameraShot}} composition, manga style, black and white screentone shading. {{letteringClause}}"` — note it references the characters *by role in the scene*, not by re-describing their appearance, because the reference image carries that.
- `panel.json.template.i2i-2refs` — instruction referencing both subjects.

`compilePrompt` picks the template by `panel.renderMode` (resolving `auto` first). One branch. Big payoff.

### 3.5 — Make `cameraShot` an enum and validate it everywhere.

One canonical list (it already exists in `PagesStage.tsx` and `director.js` — *unify it*, export from one module both sides import). Every write path validates against it. Garbage like `"Action Shot"` is rejected at the door, not discovered three stages later.

### 3.6 — Replace staleness flags with timestamps.

`panel.fieldsTouchedAt`, `panel.compiledAt`, `panel.renderedAt`; page `letteredAt`. Staleness is a derived comparison, computed in one helper, used by the gate checks and the UI badges. No flags to forget to flip on a `revert`.

---

## 4. UX / philosophy note

The "✨ AI fill this stage" button is good UX — it's the right *affordance*. But the current implementation encourages the user to treat each stage as "press button, move on," and the silent-corruption failure mode (§2.4) punishes exactly that behavior. Two adjustments:

1. **Be honest in the UI about what's deterministic vs. AI.** "Compiled 25 panel prompts (24 from your rules, 1 mood translation needed a model call)." The user should know the prompt assembly is mechanical and reproducible — that's *reassuring*, not a weakness.
2. **Show the assembled pieces.** A "prompt inspector" that displays `[system] | [Kinji] | [Odo] | [two-shot] | [apartment] | [dim lighting] | [bubble space]` as labeled chips makes the layered-rule system *visible* and makes it obvious where to fix a bad prompt (edit Kinji's visual tags once, every panel he's in updates).

The studio's whole pitch is "corruption-proof, friendly, AI-leveraged-correctly." Deterministic assembly with a tiny well-scoped LLM call *is* all three of those. The current LLM-writes-everything approach is none of them.

---

## 5. Priority order, if you do this

1. **Ingest parser** — extract & validate `cameraShot`, build `scene→location`, run `detectCharacters` at parse time. *(Foundation. Everything downstream gets simpler.)*
2. **Deterministic panel compiler** as the only path; delete `llmCompilePanelPrompts` and the `llmFillFields` integer-table machinery. *(Kills the silent-corruption class of bugs.)*
3. **Render-mode-branched prompt template** + the i2i natural-language template. *(Biggest visual-quality jump.)*
4. **`cameraShot` enum unification + validation.** *(Cheap, stops garbage at the door.)*
5. **Mood→lighting LLM call** in Pages (the one remaining, well-scoped call). *(Restores the "AI helps" value without the fragility.)*
6. **Timestamp-based staleness.** *(Cleanup; do last.)*

Items 1–3 are the substance. 4–6 are polish.

---

## 6. The honest one-liner

> You built a pipeline and then asked a language model to do the pipeline's job at every step. Take the LLM out of the assembly line, put it in the one workshop where prose-to-tags translation actually lives (Cast & World), make everything else a deterministic template, and feed the i2i model the instruction format it was built for. The result is reproducible, debuggable, and looks like it was made on purpose.

*— end of review*
