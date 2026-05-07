# AI Field Schema — Design Notes

## Current Schema (full context)

The `_build_field_schema()` method in `llm_service.py` injects the full field structure
into every AI generation prompt. The LLM sees every field it must fill per target.

## Compact Schema (future optimization)

If prompt length becomes a concern, replace the full field descriptions with
this compact template:

### Cast — Character Profile

```json
7 tabs: [status_role, appearance, faction, backstory, personality, powers, arc]
→ `characters.json` -> `character_profile_template`
→ Fill all sub-fields per tab, use "selected" + "custom_*" pattern
```

### Side Cast — Same as Cast minus powers + arc

```json
5 tabs: [status_role, appearance, faction, backstory, personality]
→ Same structure as cast profile_template
```

### Board — Chapters

```json
chapters[]: {
  chapter_title, structure_section(Section slug),
  chapter_purpose, summary,
  main_conflict, emotional_beat, twist_or_hook, ending_cliffhanger,
  characters_present[]: <from context>,
  factions_used[]: <from context>,
  threats_used[]: <from context>,
  relationships_used[]: <from context>,
  world_rules_shown[], power_system_shown[]
}
→ 14 text/array fields
→ 6 cross-reference fields (use names/IDs from context)
```

### Board — Arc Overview

```json
arc_overview: {
  arc_title, arc_type, arc_number(1),
  arc_length_type: One-Shot|Short|Medium|Long|Saga|Season|Full Series|Custom,
  arc_summary,
  starting_status_quo, main_story_question, central_emotional_question,
  main_external_conflict, main_internal_conflict, main_relationship_conflict,
  main_threat_used, minor_threats_used[],
  main_factions_used[], main_characters_used[], relationships_used[],
  ending_type_target
}
→ 17 fields total
→ cross-references from context
```

### Board — Structure Editor

```json
Kishotenketsu: kishotenketsu_outline
  → ki_introduction(3) → sho_development(2) → ten_twist_or_turn(6) → ketsu_conclusion(6)

Three-Act: conflict_driven_outline
  → act_1_setup(6) → act_2_escalation(3) → act_3_climax_resolution(8)

Hero's Journey: conflict_driven_outline
  → act_1_setup(6) → act_3_climax_resolution(8) (no Act 2)
```

### Scenes

```json
scenes_for_chapter[]: {
  chapter_id: <from context chapters>,
  scene_order(int), location, time,
  characters_present[]: <from context>,
  scene_goal, scene_conflict,
  relationship_dynamic_used, new_information_revealed,
  action_or_dialogue_focus, visual_manga_moment,
  panel_mood, ending_beat
}
→ 13 fields, cross-references from context
```

### Threads

```json
main: { goal, obstacles[], turning_points[], resolution }
character_arcs[]: { character_id, starting_state, growth_beats[], lowest_point, final_state }
relationships[]: { relationship_id, start_dynamic, change_beats[], breaking_point, final_dynamic }
threats[]: { threat_id_or_name, first_hint, escalation_beats[], reveal, final_outcome }
powers[]: { character_id, power_name, first_use, training_or_failure_beats[], breakthrough, cost_or_consequence }
```

### Courts

```json
suggested_answers: [{ question_id, suggested_selected, reasoning }]
```

## Frontend Enrichment Rules

After AI returns results, each page's `handleApplyAi` enriches:

1. **Default empty values** for any missing fields
2. **Cross-reference population**: if `characters_present` is empty but refData has characters, fill with available names
3. **Status flags**: mark generated fields so UI can show AI-filled vs user-filled

## Implementation Locations

| What | Where |
|------|-------|
| Full schema builder | `llm_service.py::_build_field_schema()` |
| Compact fallback | this file |
| Field regex validation | `models/api.py::AiGenerateRequest.page` |
| Frontend enrichment | per-page `handleApplyAi` |
