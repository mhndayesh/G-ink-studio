Yes — let’s redo the backend accurately based on **all current files and corrections**.

Your backend is **not just a normal CRUD backend**. It is a **story-state engine**.

It must support these official files:

```text
master_story.json
characters.json
plot_outline.json
memory_system.json
plot_workspace.json
chapter_script.json
```

The uploaded files already define these roles: `chapter_script.json` links to the main JSONs and tracks chapter script state, event extraction, and memory update planning; `characters.json` contains the character bible and branching logic; `master_story.json` contains world/story foundation; `memory_system.json` defines event store, snapshots, PostgreSQL, graph, vector, and approval rules; `plot_outline.json` contains narrative structure and story-start workflow; `plot_workspace.json` contains free writing, AI expansion, consequence detection, questions, proposed patches, and confirmation flow.      

---

# 1. Backend goal

The backend must do this:

```text
User writes freely
↓
Optional AI completion expands writing
↓
Backend/LLM extracts consequences
↓
Backend asks only necessary questions
↓
User approves yes / no / custom
↓
Backend creates official events
↓
Backend patches JSONs
↓
Backend creates next version bundle
↓
Backend updates PostgreSQL + Neo4j + Qdrant
↓
Backend runs continuity checks
```

The backend’s main rule:

```text
The LLM never directly changes official files.
LLM proposes.
Backend validates.
User confirms.
Then backend saves.
```

That matches your `memory_system.json` rule that the LLM proposes patches but official memory changes only after validation and approval. 

---

# 2. Correct backend stack

Use this stack from day one:

```text
FastAPI
PostgreSQL
Neo4j
Qdrant
Redis
Object/local file storage
Pydantic
LLM service
Background workers
```

Why:

FastAPI is a Python API framework based on type hints, which fits your Pydantic-heavy JSON validation approach. ([FastAPI][1])

PostgreSQL is needed for registry, metadata, approvals, events, versions, and JSONB records. PostgreSQL supports `json` and `jsonb` types for JSON data, and `jsonb` is the better choice for queryable stored payloads. ([PostgreSQL][2])

Neo4j is the graph database layer for character/faction/location/threat relationships, and the official Python driver supports Python apps connecting to Neo4j. ([Graph Database & Analytics][3])

Qdrant is the vector database layer for semantic memory, and its Python client supports sync and async API requests. ([Qdrant Python Client][4])

---

# 3. Backend services

## 3.1 Story Service

Purpose:

```text
Create story
Load story
Get current version
Get story status
```

It manages the top-level project.

Endpoints:

```text
POST   /stories
GET    /stories/{story_id}
GET    /stories/{story_id}/status
GET    /stories/{story_id}/current-version
```

---

## 3.2 File Snapshot Service

Purpose:

```text
Read JSON files
Write versioned JSON snapshots
Never overwrite old versions
Create version folders
Create version_manifest.json
```

It handles:

```text
master_story.json
characters.json
plot_outline.json
memory_system.json
plot_workspace.json
chapter_script.json
```

Important rule:

```text
Official version files are frozen.
Working files can change.
```

So:

```text
/stories/story_001/versions/v001/master_story.json
/stories/story_001/versions/v001/characters.json
/stories/story_001/versions/v001/plot_outline.json
/stories/story_001/versions/v001/memory_system.json
```

Working files:

```text
/stories/story_001/workspace/plot_workspace.json
/stories/story_001/scripts/chapter_script.json
```

When approved:

```text
/stories/story_001/versions/v002/master_story.json
/stories/story_001/versions/v002/characters.json
/stories/story_001/versions/v002/plot_outline.json
/stories/story_001/versions/v002/memory_system.json
```

---

## 3.3 Template State Service

This is important because your current files are **template-state**, not story-state.

Purpose:

```text
Track whether files are empty templates or filled story state.
```

Each JSON should have:

```json
"state_type": "template_state"
```

When the user fills real data:

```json
"state_type": "story_state"
```

Backend rule:

```text
template_state files can have empty selected fields.
story_state files should pass stricter validation.
```

This avoids false errors while the user is still building.

---

## 3.4 Master Story Service

Purpose:

```text
Manage master_story.json
Apply world/faction/threat/rule changes
Support master story mutability across versions
```

Operations:

```text
save story title
save basic idea
save genre
save ending direction
save world type
save world rules
save factions
save threats
apply hard-turn patches
```

Important:

`master_story.json` **can change**, but only through approved events. This is already defined in `memory_system.json` under master story mutability. 

Example event that changes master story:

```json
{
  "event_type": "WORLD_RULE_CHANGED",
  "target_file": "master_story.json",
  "target_branch": "world_master_rules.rule_details.magic_rules",
  "summary": "Magic becomes unstable after the gate opens."
}
```

---

## 3.5 Character Service

Purpose:

```text
Manage characters.json
Create character profiles
Handle branching logic
Control relationship map activation
Update character status, powers, allegiance, relationships
```

Critical fix:

Relationship map must start disabled:

```json
"character_relationship_map": {
  "is_enabled": false,
  "relationships": []
}
```

Backend rule:

```text
Enable relationship map only when created_major_character_profiles has at least 2 real profiles.
```

Why: your character file has `created_major_character_profiles`, character profile template, and branching logic. It should not create fake `char_001 → char_002` relationships before those characters exist. 

Character endpoints:

```text
POST /stories/{story_id}/characters/structure
POST /stories/{story_id}/characters/create-profile
GET  /stories/{story_id}/characters
POST /stories/{story_id}/characters/{character_id}/update
POST /stories/{story_id}/characters/relationship-map/enable
POST /stories/{story_id}/characters/relationships
```

---

## 3.6 Plot Outline Service

Purpose:

```text
Manage official plot plan
Narrative structure
Arc overview
Chapter list
Scene cards
Plot threads
Continuity checks
```

It uses `plot_outline.json`, which already has story-start workflow, narrative structure, arc overview, chapter list, scene cards, and plot threads. 

Important backend rule:

```text
plot_outline.json is official planning.
Do not store messy free writing here.
```

Messy input goes to:

```text
plot_workspace.json
```

Plot outline endpoints:

```text
GET  /stories/{story_id}/plot-outline
POST /stories/{story_id}/plot-outline/narrative-structure
POST /stories/{story_id}/plot-outline/arc-overview
POST /stories/{story_id}/plot-outline/chapters
POST /stories/{story_id}/plot-outline/scenes
POST /stories/{story_id}/plot-outline/threads
```

---

## 3.7 Plot Workspace Service

This is the most important UX backend service.

Purpose:

```text
Accept free writing
Optionally run AI completion
Extract story consequences
Ask only necessary questions
Track answers
Build proposed official events
Build proposed JSON patches
Prepare final confirmation
```

This service maps directly to `plot_workspace.json`, which contains `user_free_writing`, `ai_completion`, mandatory consequence analysis, detected events, consequence questions, user answers, proposed official events, proposed patches, continuity review, and final confirmation. 

Endpoints:

```text
POST /stories/{story_id}/workspace/free-write
POST /stories/{story_id}/workspace/ai-complete
POST /stories/{story_id}/workspace/analyze
GET  /stories/{story_id}/workspace/questions
POST /stories/{story_id}/workspace/questions/{question_id}/answer
GET  /stories/{story_id}/workspace/final-confirmation
POST /stories/{story_id}/workspace/approve
POST /stories/{story_id}/workspace/reject
POST /stories/{story_id}/workspace/edit-change
```

Correct flow:

```text
free-write
↓
optional ai-complete
↓
analyze
↓
questions
↓
answers
↓
final confirmation
↓
approval
```

---

## 3.8 Chapter Script Service

Purpose:

```text
Generate and edit clean manga script
Scenes → pages → panels
Dialogue, SFX, narration, visual notes
Extract events from finished script
Plan memory update after chapter approval
```

Your `chapter_script.json` already includes chapter metadata, chapter purpose, linked story context, script format, scene breakdown, pages/panels, dialogue index, visual index, event extraction, and memory update plan. 

Endpoints:

```text
POST /stories/{story_id}/chapter-script/generate
GET  /stories/{story_id}/chapter-script/{chapter_id}
PATCH /stories/{story_id}/chapter-script/{chapter_id}
POST /stories/{story_id}/chapter-script/{chapter_id}/extract-events
POST /stories/{story_id}/chapter-script/{chapter_id}/approve
```

---

## 3.9 LLM Service

Purpose:

```text
AI completion
Consequence extraction
Question generation
Patch proposal
Script generation
Summary generation
```

Important: the LLM service does not write to official files.

LLM tasks:

```text
expand_user_writing()
extract_detected_events()
generate_consequence_questions()
turn_answers_into_events()
generate_json_patches()
generate_chapter_script()
summarize_final_confirmation()
```

Outputs must be structured JSON, not free text.

---

## 3.10 Event Service

Purpose:

```text
Create official story events after user approval
Store append-only history
Support replay/reconstruction
```

Event categories:

```text
character_events
relationship_events
power_events
world_events
faction_events
threat_events
plot_events
```

Your memory file already defines these categories. 

Add these because of plot workspace workflow:

```text
CHARACTER_INJURED
CHARACTER_HEALED
CHARACTER_REPUTATION_CHANGED
CHARACTER_ATTACKED_CHARACTER
RELATIONSHIP_TRUST_CHANGED
USER_FREE_PLOT_INPUT_CREATED
PLOT_INPUT_EXPANDED_BY_LLM
PLOT_INPUT_REVIEWED
PLOT_CHANGES_CONFIRMED
```

Backend rule:

```text
No event = no official memory change.
```

---

## 3.11 Patch Service

Purpose:

```text
Convert approved events into JSON patches
Apply patches to current JSON files
Create vNext bundle
```

Patch examples:

```json
{
  "target_file": "characters.json",
  "target_branch": "created_major_character_profiles.char_001.status.selected",
  "operation": "replace",
  "old_value": "alive",
  "new_value": "dead"
}
```

Patch service must support:

```text
add
replace
remove
append_to_array
merge_object
```

---

## 3.12 Validation Service

Purpose:

```text
Validate all JSONs
Validate patches
Validate references
Validate version consistency
Validate activation rules
```

Checks:

```text
All linked files use plot_outline.json
No plot_outline(1).json
state_type exists
relationship map disabled if fewer than 2 profiles
workspace links are correct
chapter_script links are correct
events have valid target_file
patches point to existing branches
```

---

## 3.13 Continuity Service

Purpose:

```text
Detect story contradictions
```

Checks:

```text
Dead character used without flashback or revive event
Destroyed location used normally
Lost power used without power recovery
Relationship contradicts relationship map
Faction behavior contradicts faction goals
World rule violated without WORLD_RULE_CHANGED event
Master story changed without event
Mixed versions used together
Future version memory leak
```

This matches the continuity checks in `memory_system.json` and `chapter_script.json`.  

---

## 3.14 Version Service

Purpose:

```text
Create synchronized version bundles
Freeze old versions
Track current version
```

Flow:

```text
v001 current
↓
approved events
↓
apply patches
↓
create v002 folder
↓
write all official JSONs
↓
write version_manifest.json
↓
mark v002 official
```

Even if only `characters.json` changed, create all official files:

```text
master_story.json
characters.json
plot_outline.json
memory_system.json
```

Working files are not part of official story bible, but they can be archived.

---

## 3.15 Graph Service

Purpose:

```text
Project official events into Neo4j
```

Examples:

```text
Character died → Character.status = dead + DIED_IN edge
Relationship changed → Relationship node/edge update
Faction joined → Character MEMBER_OF Faction
Location destroyed → Location.status = destroyed
Threat revealed → Threat REVEALED_IN Chapter
```

Graph endpoints usually do not need to be public. They are internal.

---

## 3.16 Vector Service

Purpose:

```text
Store semantic story memories in Qdrant
```

Chunks:

```text
chapter summaries
scene summaries
character emotional memory
relationship memory
world lore
foreshadowing
dialogue notes
plot thread summaries
```

Always attach metadata:

```json
{
  "story_id": "story_001",
  "version_id": "v002",
  "arc_id": "arc_001",
  "chapter_id": "ch_001",
  "scene_id": "scene_001",
  "entity_ids": ["char_001"],
  "source_file": "chapter_script.json",
  "chunk_type": "scene_summary"
}
```

---

# 4. PostgreSQL tables

Use these tables.

## Core tables

```sql
users
stories
story_versions
story_files
arcs
chapters
```

## Event/update tables

```sql
story_events
event_dependencies
event_projections
approval_queue
json_patches
continuity_reports
sync_jobs
```

## LLM/workspace tables

```sql
plot_workspaces
llm_runs
detected_story_events
consequence_questions
user_answers
chapter_scripts
```

---

# 5. Essential table shapes

## stories

```sql
CREATE TABLE stories (
  story_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  current_version_id TEXT NOT NULL,
  state_type TEXT NOT NULL DEFAULT 'template_state',
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);
```

## story_versions

```sql
CREATE TABLE story_versions (
  version_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  previous_version_id TEXT,
  arc_id TEXT,
  chapter_id TEXT,
  status TEXT NOT NULL,
  created_from_event_ids JSONB NOT NULL DEFAULT '[]',
  snapshot_folder_path TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL
);
```

## story_files

```sql
CREATE TABLE story_files (
  file_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  file_type TEXT NOT NULL,
  official_filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  state_type TEXT NOT NULL,
  checksum TEXT,
  created_at TIMESTAMP NOT NULL
);
```

## story_events

```sql
CREATE TABLE story_events (
  event_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  version_from TEXT NOT NULL,
  version_to TEXT,
  arc_id TEXT,
  chapter_id TEXT,
  event_type TEXT NOT NULL,
  event_category TEXT NOT NULL,
  target_file TEXT NOT NULL,
  target_entity_id TEXT,
  summary TEXT NOT NULL,
  payload JSONB NOT NULL,
  approval_status TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL
);
```

## json_patches

```sql
CREATE TABLE json_patches (
  patch_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  target_file TEXT NOT NULL,
  target_branch TEXT NOT NULL,
  operation TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  approval_status TEXT NOT NULL,
  applied_version_id TEXT,
  created_at TIMESTAMP NOT NULL
);
```

## plot_workspaces

```sql
CREATE TABLE plot_workspaces (
  workspace_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  target_arc_id TEXT,
  target_chapter_id TEXT,
  status TEXT NOT NULL,
  free_text TEXT,
  ai_completion_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  expanded_text TEXT,
  final_text_used_for_analysis TEXT,
  workspace_json_path TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);
```

## consequence_questions

```sql
CREATE TABLE consequence_questions (
  question_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  detected_event_id TEXT,
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  selected TEXT,
  custom_answer TEXT,
  status TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL
);
```

---

# 6. API endpoints

## Story setup

```text
POST /stories
GET /stories/{story_id}
GET /stories/{story_id}/current-version
GET /stories/{story_id}/files/current
```

## Master story

```text
GET  /stories/{story_id}/master-story
PATCH /stories/{story_id}/master-story/template
POST /stories/{story_id}/master-story/validate
```

## Characters

```text
GET  /stories/{story_id}/characters
PATCH /stories/{story_id}/characters/structure
POST /stories/{story_id}/characters/profiles
PATCH /stories/{story_id}/characters/profiles/{character_id}
POST /stories/{story_id}/characters/relationship-map/activate
POST /stories/{story_id}/characters/relationships
```

## Plot outline

```text
GET  /stories/{story_id}/plot-outline
PATCH /stories/{story_id}/plot-outline/story-start-workflow
PATCH /stories/{story_id}/plot-outline/narrative-structure
PATCH /stories/{story_id}/plot-outline/arc-overview
POST  /stories/{story_id}/plot-outline/chapters
POST  /stories/{story_id}/plot-outline/scenes
```

## Plot workspace

```text
POST /stories/{story_id}/plot-workspace
PATCH /stories/{story_id}/plot-workspace/{workspace_id}/free-writing
POST /stories/{story_id}/plot-workspace/{workspace_id}/ai-complete
POST /stories/{story_id}/plot-workspace/{workspace_id}/analyze
GET  /stories/{story_id}/plot-workspace/{workspace_id}/questions
POST /stories/{story_id}/plot-workspace/{workspace_id}/questions/{question_id}/answer
GET  /stories/{story_id}/plot-workspace/{workspace_id}/confirmation
POST /stories/{story_id}/plot-workspace/{workspace_id}/approve
POST /stories/{story_id}/plot-workspace/{workspace_id}/reject
```

## Chapter script

```text
POST /stories/{story_id}/chapters/{chapter_id}/script/generate
GET  /stories/{story_id}/chapters/{chapter_id}/script
PATCH /stories/{story_id}/chapters/{chapter_id}/script
POST /stories/{story_id}/chapters/{chapter_id}/script/extract-events
POST /stories/{story_id}/chapters/{chapter_id}/script/approve
```

## Versions

```text
GET /stories/{story_id}/versions
GET /stories/{story_id}/versions/{version_id}
POST /stories/{story_id}/versions/create-from-approved-events
GET /stories/{story_id}/versions/{version_id}/manifest
```

## Continuity

```text
POST /stories/{story_id}/continuity/check-workspace
POST /stories/{story_id}/continuity/check-script
POST /stories/{story_id}/continuity/check-version-candidate
GET  /stories/{story_id}/continuity/reports
```

---

# 7. Backend workflow: actual plot phase

This is the exact important flow.

## Step 1 — User opens plot workspace

Frontend calls:

```text
POST /stories/story_001/plot-workspace
```

Backend creates:

```text
plot_workspace.json
workspace row in PostgreSQL
```

---

## Step 2 — User writes freely

Frontend sends:

```text
PATCH /stories/story_001/plot-workspace/workspace_001/free-writing
```

Payload:

```json
{
  "text": "Kai fights Ren. Ren badly injures Kai. Later Mira discovers Ren was a spy.",
  "input_type": "Scene Idea"
}
```

Backend saves to:

```text
plot_workspace.json.user_free_writing.text
plot_workspaces.free_text
```

---

## Step 3 — Optional AI completion

If enabled:

```text
POST /stories/story_001/plot-workspace/workspace_001/ai-complete
```

Backend:

```text
loads current JSON context
sends text to LLM
gets expanded_text
saves expanded_text
waits for user accept/reject
```

If user rejects, original text is used.

---

## Step 4 — Analyze consequences

```text
POST /stories/story_001/plot-workspace/workspace_001/analyze
```

Backend:

```text
loads master_story.json
loads characters.json
loads plot_outline.json
queries graph
queries vector DB
calls LLM extraction
validates detected events
creates consequence questions
```

Example detected:

```text
CHARACTER_INJURED
CHARACTER_ATTACKED_CHARACTER
CHARACTER_ALLEGIANCE_CHANGED
RELATIONSHIP_TRUST_CHANGED
```

---

## Step 5 — Ask only necessary questions

Question examples:

```text
Kai is badly injured. What should happen?
- Heals Quickly
- Heals Slowly
- Loses Power Temporarily
- Dies
- Custom

Ren may be a spy. Which is true?
- Spy From Beginning
- Changed Sides Now
- Forced To Spy
- Double Agent
- Custom
```

---

## Step 6 — User answers

```text
POST /stories/story_001/plot-workspace/workspace_001/questions/cq_001/answer
```

Backend stores answers.

---

## Step 7 — Final confirmation

Backend generates:

```text
summary of detected changes
events to create
JSON patches to apply
warnings
version that will be created
```

User approves:

```text
POST /stories/story_001/plot-workspace/workspace_001/approve
```

---

## Step 8 — Official update

Backend does:

```text
save story_events
save json_patches
apply patches to current JSONs
create v002 snapshot bundle
update PostgreSQL
project to Neo4j
upsert Qdrant chunks
run continuity report
mark v002 official
```

---

# 8. Folder structure

```text
backend/
  app/
    main.py

    api/
      stories.py
      master_story.py
      characters.py
      plot_outline.py
      plot_workspace.py
      chapter_script.py
      versions.py
      continuity.py

    core/
      config.py
      auth.py
      errors.py
      logging.py

    db/
      postgres.py
      neo4j.py
      qdrant.py
      redis.py

    models/
      master_story.py
      characters.py
      plot_outline.py
      memory_system.py
      plot_workspace.py
      chapter_script.py
      story_event.py
      json_patch.py
      version_manifest.py

    services/
      story_service.py
      snapshot_service.py
      template_state_service.py
      master_story_service.py
      character_service.py
      plot_outline_service.py
      plot_workspace_service.py
      chapter_script_service.py
      llm_service.py
      event_service.py
      patch_service.py
      validation_service.py
      continuity_service.py
      version_service.py
      graph_service.py
      vector_service.py

    repositories/
      story_repository.py
      version_repository.py
      event_repository.py
      patch_repository.py
      workspace_repository.py

    workers/
      graph_projection_worker.py
      vector_projection_worker.py
      sync_worker.py
      continuity_worker.py

    schemas/
      master_story.schema.json
      characters.schema.json
      plot_outline.schema.json
      memory_system.schema.json
      plot_workspace.schema.json
      chapter_script.schema.json
```

---

# 9. Docker services

Use this for local development:

```yaml
services:
  api:
    image: manga-maker-api
    ports:
      - "8000:8000"
    depends_on:
      - postgres
      - neo4j
      - qdrant
      - redis

  postgres:
    image: postgres:16
    ports:
      - "5432:5432"

  neo4j:
    image: neo4j:5
    ports:
      - "7474:7474"
      - "7687:7687"

  qdrant:
    image: qdrant/qdrant
    ports:
      - "6333:6333"

  redis:
    image: redis:7
    ports:
      - "6379:6379"
```

---

# 10. MVP build order

Build in this order:

```text
1. FastAPI skeleton
2. PostgreSQL schema
3. Pydantic models for 6 JSON files
4. Snapshot service
5. Story/version service
6. Validation service
7. Plot workspace service
8. LLM service for AI completion
9. LLM service for consequence extraction
10. Question/answer approval flow
11. Event store
12. JSON patch service
13. Version bundle creator
14. Chapter script service
15. Neo4j projection
16. Qdrant projection
17. Continuity checker
18. Frontend
```

Do not start with fancy UI.

Start with the backend because if backend memory/version logic is wrong, the UI is just decoration.

---

# 11. Final backend answer

Your accurate backend is:

```text
FastAPI backend
+ PostgreSQL control database
+ append-only event store in PostgreSQL
+ JSON snapshot/version manager
+ Pydantic validation
+ LLM service for expansion/extraction/patch proposals
+ approval service
+ JSON patch service
+ version bundle creator
+ Neo4j graph projection
+ Qdrant vector projection
+ continuity checker
+ Redis/background workers
```

That is the real backend for your system.

[1]: https://fastapi.tiangolo.com/?utm_source=chatgpt.com "FastAPI"
[2]: https://www.postgresql.org/docs/current/datatype-json.html?utm_source=chatgpt.com "Documentation: 18: 8.14. JSON Types"
[3]: https://neo4j.com/docs/python-manual/current/?utm_source=chatgpt.com "Build applications with Neo4j and Python"
[4]: https://python-client.qdrant.tech/?utm_source=chatgpt.com "Qdrant Python Client Documentation — Qdrant Client ..."
