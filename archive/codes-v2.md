You’re right — the last answer was too narrow. This is the **full implementation planning + build specs** for the whole Manga Maker System, based on the current project files and corrections.

Your project is **not one app screen** and **not one JSON generator**. It is a full **story-state engine** with:

```text
1. Story setup
2. Character bible
3. Relationship web
4. Plot planning
5. Free writing workspace
6. AI completion / consequence detection
7. User confirmation
8. Manga script generation
9. Event-sourced versioning
10. PostgreSQL + graph + vector memory sync
11. Continuity checking
12. Dynamic frontend studio UX
```

The current file bundle is already corrected around the six official files, including the naming correction to `plot_outline.json`, `state_type: template_state`, disabled relationship map until two real profiles exist, and links between `plot_outline.json`, `plot_workspace.json`, and `chapter_script.json`. 

---

# 1. Final product definition

## Product name

```text
Manga Maker System
```

## Product type

```text
AI-assisted manga story engine
```

## User goal

The user should be able to:

```text
Write a simple idea.
Build a world.
Create characters.
Create relationships.
Plan plot.
Write freely.
Let AI expand if wanted.
Let AI detect story consequences.
Approve changes.
Generate manga script pages/panels.
Keep story memory consistent across chapters/arcs.
```

## Core rule

```text
Simple frontend.
Strict backend.
Event-driven memory.
No direct LLM overwrites.
```

The project documentation says the user writes naturally and the complex structure stays underneath, while official changes are event-driven and validated before saving. 

---

# 2. Current official file set

The system has **six active files**.

## 2.1 `master_story.json`

Purpose:

```text
World and story foundation.
```

Contains:

```text
title
idea_so_far
story_type
ending_direction
story_foundation
world_type
world_master_rules
major_factions_and_ruling_sides
major_threats_and_minor_side_threats
```

Important:

```text
It is mutable across versions.
Old versions freeze.
Hard story turns create new master_story versions.
```

The current master story file is template-state and contains the world/story setup branches. 

---

## 2.2 `characters.json`

Purpose:

```text
Character bible.
```

Contains:

```text
main character structure
branching logic
entity profile
character creation queue
character profile template
appearance design
faction alignment
backstory
mental state
community place
personality
optional powers
arc/threat connection
created profiles
relationship map
```

Critical rule:

```text
character_relationship_map.is_enabled = false
relationships = []
until created_major_character_profiles has at least 2 real profiles.
```

The current characters file includes branching logic for single, dual, ensemble, entity-based, faction-based, family-based, and custom main-character structures. 

---

## 2.3 `plot_outline.json`

Purpose:

```text
Official plot plan.
```

Contains:

```text
story_start_workflow
writing_workspace_link
linked_sources
narrative_structure
story_arc_overview
kishotenketsu_outline
conflict_driven_outline
chapter_or_episode_list
scene_cards
plot_threads
continuity_checks
```

Important:

```text
This is not the messy writing file.
This stays the official plan.
```

The current plot outline already links to `plot_workspace.json` and `chapter_script.json`, and says the workspace holds temporary free writing, AI expansion, consequence review, and proposed patches. 

---

## 2.4 `memory_system.json`

Purpose:

```text
Persistence, versioning, event, graph, vector, SQL, and continuity rules.
```

Contains:

```text
event_store
versioned_json_snapshots
postgresql_registry
knowledge_graph
vector_memory
llm_interpreter
master_story_mutability
official file names
working files
sync pipeline
retrieval pipeline
continuity checks
```

Important:

```text
LLM never directly overwrites official memory.
It proposes patches.
System validates.
User approves.
Then events become official.
```

The memory system defines the official truth order as event store, versioned snapshots, PostgreSQL registry, knowledge graph, vector memory, and LLM interpreter. 

---

## 2.5 `plot_workspace.json`

Purpose:

```text
Temporary writing workspace.
```

Contains:

```text
free user writing
AI completion toggle
expanded text
mandatory consequence detection
context used for analysis
detected events
consequence questions
user answers
proposed official events
proposed JSON patches
continuity review
final confirmation
after-confirmation actions
```

Important:

```text
This file is messy by design.
It is not official plot memory.
It prepares approved changes.
```

The workspace file explicitly says AI completion runs before consequence detection when enabled, and consequence detection runs even when AI completion is disabled. 

---

## 2.6 `chapter_script.json`

Purpose:

```text
Clean manga script output.
```

Contains:

```text
chapter metadata
chapter purpose
linked story context
script format
scene breakdown
pages
panels
dialogue
SFX
visual notes
event extraction
memory update plan
continuity checks
approval
```

Important:

```text
This is the clean manga script after plot/workspace decisions.
```

The chapter script file uses a chapter → scenes → pages → panels structure and keeps visual-first manga scripting rules. 

---

# 3. Non-negotiable architecture rules

These are the rules that must never break.

```text
1. Use exact official filenames.
2. plot_outline.json is the only official plot outline filename.
3. All files include state_type.
4. Template files start as template_state.
5. Relationship map starts disabled and empty.
6. LLM proposes only.
7. User confirms before official memory changes.
8. No official change without event.
9. Old versions never change.
10. vNext creates synchronized version bundle.
11. PostgreSQL, graph DB, vector DB, and continuity report sync after approval.
12. plot_workspace.json is temporary.
13. chapter_script.json is clean script output.
14. master_story.json can change across versions through approved events.
```

The documentation’s official update pipeline matches this: user writes or approves content, LLM extracts consequences, user confirms, events save, JSON snapshots update, PostgreSQL records, graph/vector update, continuity runs, then version is marked official. 

---

# 4. Final system architecture

## 4.1 Backend stack

Use this exact backend stack:

```text
FastAPI
PostgreSQL
Neo4j
Qdrant
Redis
Local/S3-compatible snapshot storage
Pydantic
SQLAlchemy or SQLModel
Alembic migrations
Background workers
LLM service
```

## 4.2 Frontend stack

Use the dynamic studio design, not the plain sidebar design.

```text
Next.js App Router
React
TypeScript
Tailwind CSS
shadcn/ui
Motion
TanStack Query
Zustand
React Hook Form
Zod
React Flow
Monaco Editor for advanced JSON/debug view
```

The dynamic frontend concept is **Manga Studio Flow**: Story Seed → World Core → Cast Forge → Relationship Web → Plot Board → Writing Desk → Consequence Court → Manga Script → Memory Timeline. 

---

# 5. Repository structure

Use a monorepo.

```text
manga-maker-system/
  apps/
    api/
    web/

  packages/
    schemas/
    shared-types/
    prompts/
    event-rules/

  storage/
    stories/

  infra/
    docker-compose.yml
    postgres/
    neo4j/
    qdrant/

  docs/
    architecture.md
    api-contract.md
    frontend-ux.md
    event-rules.md
    continuity-rules.md
```

---

# 6. Backend implementation specs

## 6.1 Backend folder structure

```text
apps/api/
  app/
    main.py

    core/
      config.py
      errors.py
      logging.py
      ids.py
      security.py

    db/
      postgres.py
      neo4j.py
      qdrant.py
      redis.py

    models/
      enums.py
      story.py
      version.py
      files.py
      master_story.py
      characters.py
      plot_outline.py
      memory_system.py
      plot_workspace.py
      chapter_script.py
      events.py
      patches.py
      approvals.py
      continuity.py

    repositories/
      story_repo.py
      version_repo.py
      file_repo.py
      event_repo.py
      patch_repo.py
      workspace_repo.py
      script_repo.py
      continuity_repo.py

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
      retrieval_service.py

    api/
      v1/
        stories.py
        master_story.py
        characters.py
        plot_outline.py
        plot_workspace.py
        chapter_script.py
        versions.py
        continuity.py
        developer.py

    workers/
      graph_projection_worker.py
      vector_projection_worker.py
      sync_worker.py
      continuity_worker.py
```

---

# 7. PostgreSQL build spec

## 7.1 Main tables

Build these first:

```text
users
stories
arcs
chapters
story_versions
story_files
plot_workspaces
chapter_scripts
llm_runs
detected_story_events
consequence_questions
user_answers
approval_queue
story_events
json_patches
sync_jobs
event_projections
continuity_reports
vector_chunks
```

## 7.2 Core table purpose

| Table                   | Purpose                                             |
| ----------------------- | --------------------------------------------------- |
| `stories`               | One manga project. Tracks current official version. |
| `story_versions`        | Version bundles like v001, v002, v003.              |
| `story_files`           | File paths and JSON copies for each version.        |
| `plot_workspaces`       | Temporary free-writing sessions.                    |
| `chapter_scripts`       | Clean manga script outputs.                         |
| `llm_runs`              | Every AI call and result.                           |
| `detected_story_events` | LLM-detected possible consequences before approval. |
| `consequence_questions` | Questions the system asks the user.                 |
| `user_answers`          | User yes/no/custom answers.                         |
| `approval_queue`        | Final confirmation objects.                         |
| `story_events`          | Append-only official event store.                   |
| `json_patches`          | Proposed and applied JSON changes.                  |
| `sync_jobs`             | Tracks PostgreSQL, JSON, Neo4j, Qdrant sync.        |
| `event_projections`     | Event → graph/vector/json projection payloads.      |
| `continuity_reports`    | Continuity warnings and errors.                     |
| `vector_chunks`         | Metadata mirror for Qdrant chunks.                  |

---

# 8. Database schema details

## 8.1 Required enums

```sql
CREATE TYPE story_state_type AS ENUM (
  'template_state',
  'story_state'
);

CREATE TYPE version_status AS ENUM (
  'draft',
  'candidate',
  'official',
  'archived',
  'failed'
);

CREATE TYPE approval_status AS ENUM (
  'pending',
  'approved',
  'rejected',
  'needs_revision'
);

CREATE TYPE sync_status AS ENUM (
  'pending',
  'running',
  'success',
  'failed',
  'skipped'
);

CREATE TYPE file_type AS ENUM (
  'master_story',
  'characters',
  'plot_outline',
  'memory_system',
  'plot_workspace',
  'chapter_script',
  'version_manifest'
);

CREATE TYPE event_category AS ENUM (
  'character_events',
  'relationship_events',
  'power_events',
  'world_events',
  'faction_events',
  'threat_events',
  'plot_events',
  'system_events'
);

CREATE TYPE patch_operation AS ENUM (
  'add',
  'replace',
  'remove',
  'append_to_array',
  'merge_object'
);
```

---

## 8.2 Critical tables

### `stories`

```sql
CREATE TABLE stories (
  story_id TEXT PRIMARY KEY,
  user_id TEXT,
  title TEXT NOT NULL,
  current_version_id TEXT,
  state_type story_state_type NOT NULL DEFAULT 'template_state',
  official_plot_outline_filename TEXT NOT NULL DEFAULT 'plot_outline.json',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT official_plot_outline_filename_check
    CHECK (official_plot_outline_filename = 'plot_outline.json')
);
```

---

### `story_versions`

```sql
CREATE TABLE story_versions (
  version_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  previous_version_id TEXT REFERENCES story_versions(version_id),
  arc_id TEXT,
  chapter_id TEXT,
  status version_status NOT NULL DEFAULT 'draft',
  state_type story_state_type NOT NULL DEFAULT 'template_state',
  snapshot_folder_path TEXT NOT NULL,
  created_from_event_ids JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  marked_official_at TIMESTAMPTZ,

  UNIQUE (story_id, version_number),
  CONSTRAINT version_number_positive CHECK (version_number > 0)
);
```

---

### `story_files`

```sql
CREATE TABLE story_files (
  file_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  version_id TEXT REFERENCES story_versions(version_id) ON DELETE CASCADE,
  file_type file_type NOT NULL,
  official_filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  state_type story_state_type NOT NULL DEFAULT 'template_state',
  checksum TEXT,
  json_copy JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (story_id, version_id, file_type),

  CONSTRAINT plot_outline_filename_guard
    CHECK (
      file_type != 'plot_outline'
      OR official_filename = 'plot_outline.json'
    )
);
```

---

### `plot_workspaces`

```sql
CREATE TABLE plot_workspaces (
  workspace_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  version_id TEXT NOT NULL REFERENCES story_versions(version_id),
  target_arc_id TEXT,
  target_chapter_id TEXT,
  target_scene_id TEXT,
  status TEXT NOT NULL DEFAULT 'not_started',
  free_text TEXT,
  ai_completion_enabled BOOLEAN NOT NULL DEFAULT false,
  expansion_mode TEXT,
  expanded_text TEXT,
  accepted_expanded_text BOOLEAN NOT NULL DEFAULT false,
  final_text_used_for_analysis TEXT,
  workspace_json_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

### `story_events`

```sql
CREATE TABLE story_events (
  event_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  version_from TEXT NOT NULL REFERENCES story_versions(version_id),
  version_to TEXT REFERENCES story_versions(version_id),
  arc_id TEXT,
  chapter_id TEXT,
  event_type TEXT NOT NULL,
  event_category event_category NOT NULL,
  target_file file_type NOT NULL,
  target_entity_id TEXT,
  summary TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_from_detected_event_id TEXT,
  created_from_question_id TEXT,
  approval_status approval_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ
);
```

Append-only guard:

```sql
CREATE OR REPLACE FUNCTION prevent_story_event_update()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'story_events is append-only. Insert compensating event instead.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER story_events_no_update
BEFORE UPDATE OR DELETE ON story_events
FOR EACH ROW EXECUTE FUNCTION prevent_story_event_update();
```

---

### `json_patches`

```sql
CREATE TABLE json_patches (
  patch_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  event_id TEXT REFERENCES story_events(event_id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES plot_workspaces(workspace_id) ON DELETE SET NULL,
  target_file file_type NOT NULL,
  target_branch TEXT NOT NULL,
  operation patch_operation NOT NULL,
  old_value JSONB,
  new_value JSONB,
  reason TEXT,
  approval_status approval_status NOT NULL DEFAULT 'pending',
  applied_version_id TEXT REFERENCES story_versions(version_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at TIMESTAMPTZ
);
```

---

# 9. Pydantic model specs

Do **not** try to model every option list manually on day one. Model the required structure, file identity, links, state, validation rules, events, patches, and workspace lifecycle.

## 9.1 Base enums

```python
from enum import Enum
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field, model_validator


class StateType(str, Enum):
    template_state = "template_state"
    story_state = "story_state"


class FileType(str, Enum):
    master_story = "master_story"
    characters = "characters"
    plot_outline = "plot_outline"
    memory_system = "memory_system"
    plot_workspace = "plot_workspace"
    chapter_script = "chapter_script"
    version_manifest = "version_manifest"


class ApprovalStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    needs_revision = "needs_revision"


class EventCategory(str, Enum):
    character_events = "character_events"
    relationship_events = "relationship_events"
    power_events = "power_events"
    world_events = "world_events"
    faction_events = "faction_events"
    threat_events = "threat_events"
    plot_events = "plot_events"
    system_events = "system_events"


class PatchOperation(str, Enum):
    add = "add"
    replace = "replace"
    remove = "remove"
    append_to_array = "append_to_array"
    merge_object = "merge_object"
```

---

## 9.2 Linked file validator

```python
class LinkedFiles(BaseModel):
    master_story_file: str = "master_story.json"
    characters_file: str = "characters.json"
    plot_outline_file: str = "plot_outline.json"
    memory_system_file: str = "memory_system.json"
    plot_workspace_file: Optional[str] = None
    chapter_script_output_file: Optional[str] = None
    chapter_script_file: Optional[str] = None

    @model_validator(mode="after")
    def validate_official_names(self):
        if self.master_story_file != "master_story.json":
            raise ValueError("master_story_file must be master_story.json")
        if self.characters_file != "characters.json":
            raise ValueError("characters_file must be characters.json")
        if self.plot_outline_file != "plot_outline.json":
            raise ValueError("plot_outline_file must be plot_outline.json")
        if self.memory_system_file != "memory_system.json":
            raise ValueError("memory_system_file must be memory_system.json")
        return self
```

---

## 9.3 Character relationship map validator

```python
class CharacterRelationshipMap(BaseModel):
    note_to_user: str
    is_enabled: bool = False
    activation_rule: str
    linked_to_created_profiles: bool = True
    relationships: list[dict[str, Any]] = []


class CharactersFile(BaseModel):
    story_id: str
    version_id: str
    file_type: Literal["characters"]
    state_type: StateType = StateType.template_state
    master_story_file: str = "master_story.json"
    story_title: str

    main_character_structure: dict[str, Any]
    main_character_entity_profile: dict[str, Any]
    character_creation_queue: dict[str, Any]
    character_profile_template: dict[str, Any]
    created_major_character_profiles: list[dict[str, Any]] = []
    character_relationship_map: CharacterRelationshipMap

    @model_validator(mode="after")
    def validate_relationship_map_activation(self):
        count = len(self.created_major_character_profiles)
        if count < 2:
            if self.character_relationship_map.is_enabled:
                raise ValueError(
                    "Relationship map must be disabled until at least 2 real profiles exist."
                )
            if self.character_relationship_map.relationships:
                raise ValueError(
                    "Relationship map relationships must be empty until at least 2 real profiles exist."
                )
        return self
```

---

## 9.4 Plot workspace model

```python
class DetectedStoryEvent(BaseModel):
    detected_event_id: str
    event_type: str
    confidence: str
    evidence_from_user_text: str = ""
    target_file: Optional[str] = None
    target_entity_id: Optional[str] = None
    target_entity_name: Optional[str] = None
    requires_user_decision: bool = False
    reason_question_is_needed: str = ""
    suggested_event_summary: str = ""
    status: str = "pending_review"


class ConsequenceQuestion(BaseModel):
    question_id: str
    linked_detected_event_id: Optional[str] = None
    question: str
    why_this_matters: str = ""
    options: list[str]
    selected: str = ""
    custom_answer: str = ""
    status: str = "unanswered"


class PlotWorkspaceFile(BaseModel):
    story_id: str
    version_id: str
    file_type: Literal["plot_workspace"]
    state_type: StateType = StateType.template_state
    workspace_id: str
    linked_files: LinkedFiles
    workspace_status: dict[str, Any]
    user_free_writing: dict[str, Any]
    ai_completion: dict[str, Any]
    mandatory_analysis_after_writing: dict[str, bool]
    context_used_for_analysis: dict[str, Any]
    detected_story_events: list[DetectedStoryEvent] = []
    consequence_questions: dict[str, Any]
    user_answers: list[dict[str, Any]] = []
    proposed_official_events: list[dict[str, Any]] = []
    proposed_json_patches: dict[str, list[dict[str, Any]]] = {}
    continuity_review: dict[str, Any]
    final_confirmation: dict[str, Any]
    after_confirmation_actions: dict[str, bool]
    output_links: dict[str, Any]
    custom_workspace_details: str = ""
```

---

## 9.5 Event and patch models

```python
class StoryEventCreate(BaseModel):
    story_id: str
    version_from: str
    version_to: Optional[str] = None
    arc_id: Optional[str] = None
    chapter_id: Optional[str] = None
    event_type: str
    event_category: EventCategory
    target_file: FileType
    target_entity_id: Optional[str] = None
    summary: str
    payload: dict[str, Any]
    created_from_detected_event_id: Optional[str] = None
    created_from_question_id: Optional[str] = None


class JsonPatchCreate(BaseModel):
    story_id: str
    event_id: Optional[str] = None
    workspace_id: Optional[str] = None
    target_file: FileType
    target_branch: str
    operation: PatchOperation
    old_value: Any = None
    new_value: Any = None
    reason: str = ""
```

---

# 10. API contract

Base path:

```text
/api/v1
```

Standard response:

```json
{
  "ok": true,
  "data": {},
  "error": null
}
```

Standard error:

```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Relationship map must be disabled until at least 2 real profiles exist.",
    "details": {}
  }
}
```

---

## 10.1 Story APIs

```text
POST   /stories
GET    /stories/{story_id}
GET    /stories/{story_id}/status
GET    /stories/{story_id}/current-version
GET    /stories/{story_id}/files/current
```

### `POST /stories`

Creates:

```text
story row
v001 version
six template files
version_manifest.json
story_files rows
```

Request:

```json
{
  "title": "Manga Maker System"
}
```

Response:

```json
{
  "story_id": "story_001",
  "current_version_id": "v001",
  "state_type": "template_state",
  "created_files": [
    "master_story.json",
    "characters.json",
    "plot_outline.json",
    "memory_system.json",
    "plot_workspace.json",
    "chapter_script.json"
  ]
}
```

---

## 10.2 Master story APIs

```text
GET   /stories/{story_id}/master-story
PATCH /stories/{story_id}/master-story/template
POST  /stories/{story_id}/master-story/validate
```

Template patch request:

```json
{
  "target_branch": "story_type.selected",
  "operation": "replace",
  "value": ["Shonen", "Dark Fantasy"]
}
```

Important:

```text
Template edits are normal setup edits.
Story-state edits after official versioning require events.
```

---

## 10.3 Character APIs

```text
GET   /stories/{story_id}/characters
PATCH /stories/{story_id}/characters/structure
POST  /stories/{story_id}/characters/profiles
PATCH /stories/{story_id}/characters/profiles/{character_id}
POST  /stories/{story_id}/characters/relationship-map/activate
POST  /stories/{story_id}/characters/relationships
PATCH /stories/{story_id}/characters/relationships/{relationship_id}
```

### Structure request

```json
{
  "selected": "Dual Main Characters",
  "custom_main_character_structure": ""
}
```

Response:

```json
{
  "profiles_to_create": [
    {
      "profile_id": "char_001",
      "profile_label": "Main Character 1",
      "status": "empty"
    },
    {
      "profile_id": "char_002",
      "profile_label": "Main Character 2",
      "status": "empty"
    }
  ],
  "relationship_map_enabled": false
}
```

### Relationship map activation rule

If fewer than 2 real profiles:

```json
{
  "ok": false,
  "error": {
    "code": "RELATIONSHIP_MAP_LOCKED",
    "message": "Create at least 2 real major profiles before enabling relationship map."
  }
}
```

---

## 10.4 Plot outline APIs

```text
GET   /stories/{story_id}/plot-outline
PATCH /stories/{story_id}/plot-outline/story-start-workflow
PATCH /stories/{story_id}/plot-outline/narrative-structure
PATCH /stories/{story_id}/plot-outline/arc-overview
POST  /stories/{story_id}/plot-outline/chapters
POST  /stories/{story_id}/plot-outline/scenes
PATCH /stories/{story_id}/plot-outline/threads
```

Narrative structure response should enable correct sections:

```json
{
  "selected": "Kishotenketsu",
  "enabled_sections": ["kishotenketsu_outline"]
}
```

---

## 10.5 Plot workspace APIs

```text
POST  /stories/{story_id}/plot-workspace
PATCH /stories/{story_id}/plot-workspace/{workspace_id}/free-writing
POST  /stories/{story_id}/plot-workspace/{workspace_id}/ai-complete
POST  /stories/{story_id}/plot-workspace/{workspace_id}/ai-complete/decision
POST  /stories/{story_id}/plot-workspace/{workspace_id}/analyze
GET   /stories/{story_id}/plot-workspace/{workspace_id}/questions
POST  /stories/{story_id}/plot-workspace/{workspace_id}/questions/{question_id}/answer
GET   /stories/{story_id}/plot-workspace/{workspace_id}/confirmation
POST  /stories/{story_id}/plot-workspace/{workspace_id}/approve
POST  /stories/{story_id}/plot-workspace/{workspace_id}/reject
POST  /stories/{story_id}/plot-workspace/{workspace_id}/edit-change
```

### Free writing request

```json
{
  "text": "Kai fights Ren. Ren badly injures Kai. Mira later discovers Ren was a spy.",
  "input_type": "Scene Idea",
  "user_priority": "Keep My Writing As Much As Possible",
  "do_not_change_these_parts": []
}
```

### AI completion

```json
{
  "expansion_mode": "Light Expansion"
}
```

### Analyze response

```json
{
  "detected_story_events": [
    {
      "detected_event_id": "det_evt_001",
      "event_type": "CHARACTER_INJURED",
      "target_entity_name": "Kai",
      "confidence": "high",
      "requires_user_decision": true
    }
  ],
  "questions_created": 1,
  "next_step": "answer_questions"
}
```

### Question response

```json
{
  "questions": [
    {
      "question_id": "cq_001",
      "question": "Kai suffered a serious injury. What should happen?",
      "options": [
        "Heals Quickly",
        "Heals Slowly",
        "Permanent Scar",
        "Loses Power Temporarily",
        "Loses Power Permanently",
        "Dies",
        "Unknown For Now",
        "Custom"
      ],
      "status": "unanswered"
    }
  ]
}
```

### Approval response

```json
{
  "approved": true,
  "created_events": ["evt_001", "evt_002"],
  "created_patches": ["patch_001", "patch_002"],
  "created_version_candidate": "v002",
  "sync_jobs": ["sync_001", "sync_002", "sync_003"],
  "next_step": "version_candidate_review"
}
```

---

## 10.6 Chapter script APIs

```text
POST  /stories/{story_id}/chapters/{chapter_id}/script/generate
GET   /stories/{story_id}/chapters/{chapter_id}/script
PATCH /stories/{story_id}/chapters/{chapter_id}/script
POST  /stories/{story_id}/chapters/{chapter_id}/script/extract-events
POST  /stories/{story_id}/chapters/{chapter_id}/script/approve
```

Generate request:

```json
{
  "workspace_id": "workspace_001",
  "style": "manga_script",
  "page_target": 20
}
```

Patch panel request:

```json
{
  "target_branch": "pages[0].panels[0].visual",
  "operation": "replace",
  "value": "A wide shot of the academy courtyard at sunset."
}
```

---

## 10.7 Version APIs

```text
GET  /stories/{story_id}/versions
GET  /stories/{story_id}/versions/{version_id}
GET  /stories/{story_id}/versions/{version_id}/manifest
POST /stories/{story_id}/versions/create-from-approved-events
POST /stories/{story_id}/versions/{version_id}/mark-official
```

Mark official allowed only when:

```text
all required files exist
continuity report passed or warnings accepted
PostgreSQL sync success
Neo4j sync success
Qdrant sync success
no mixed filename/version issue
```

---

# 11. LLM prompt contracts

Each LLM task must return strict JSON.

## 11.1 AI completion prompt

Input:

```json
{
  "user_text": "",
  "expansion_mode": "",
  "story_context": {},
  "do_not_change": []
}
```

Output:

```json
{
  "expanded_text": "",
  "preserved_intent_summary": "",
  "added_details": [],
  "warnings": []
}
```

---

## 11.2 Consequence extraction prompt

Input:

```json
{
  "final_text_used_for_analysis": "",
  "master_story_context": {},
  "characters_context": {},
  "plot_outline_context": {},
  "graph_context": {},
  "vector_context": {}
}
```

Output:

```json
{
  "detected_story_events": [
    {
      "event_type": "",
      "event_category": "",
      "confidence": "",
      "evidence_from_user_text": "",
      "target_file": "",
      "target_entity_id": "",
      "target_entity_name": "",
      "requires_user_decision": true,
      "reason_question_is_needed": "",
      "suggested_event_summary": ""
    }
  ],
  "continuity_warnings": []
}
```

---

## 11.3 Consequence question prompt

Output:

```json
{
  "questions": [
    {
      "linked_detected_event_id": "",
      "question": "",
      "why_this_matters": "",
      "options": ["Yes", "No", "Custom"]
    }
  ]
}
```

Rule:

```text
Ask only necessary questions.
Use yes/no/custom where possible.
Do not ask for things already clear in the user writing.
```

---

## 11.4 Event proposal prompt

Output:

```json
{
  "proposed_official_events": [
    {
      "event_type": "",
      "event_category": "",
      "target_file": "",
      "target_entity_id": "",
      "summary": "",
      "payload": {}
    }
  ]
}
```

---

## 11.5 Patch proposal prompt

Output:

```json
{
  "proposed_json_patches": [
    {
      "target_file": "",
      "target_branch": "",
      "operation": "replace",
      "old_value": null,
      "new_value": null,
      "reason": ""
    }
  ]
}
```

---

# 12. Event-to-patch rules

These rules should live in:

```text
packages/event-rules/
```

## 12.1 Character events

```text
CHARACTER_CREATED
→ add to characters.created_major_character_profiles

CHARACTER_INJURED
→ update character status/details
→ maybe update power details
→ maybe update relationship map if others react

CHARACTER_DIED
→ update character status.selected = dead
→ add death metadata
→ update relationships involving character
→ update plot threads

CHARACTER_ALLEGIANCE_CHANGED
→ update faction alignment
→ update relationship map
→ update graph edges

CHARACTER_REPUTATION_CHANGED
→ update community_place_details.public_reputation/private_reputation
```

## 12.2 Relationship events

```text
RELATIONSHIP_CREATED
→ append to character_relationship_map.relationships

RELATIONSHIP_TRUST_CHANGED
→ update relationship_details.trust_level

RELATIONSHIP_BETRAYAL
→ update current_dynamic
→ update secrets/reveals
→ update how_this_relationship_will_change
```

## 12.3 World events

```text
WORLD_RULE_CHANGED
→ patch master_story.world_master_rules.rule_details

LOCATION_DESTROYED
→ update master/world state and graph location node

STORY_FOUNDATION_SHIFTED
→ patch master_story.story_foundation

ENDING_DIRECTION_CHANGED
→ patch master_story.ending_direction
```

## 12.4 Plot events

```text
CHAPTER_COMPLETED
→ update plot_outline.chapter_or_episode_list
→ update chapter_script approval
→ create vector chunks

PLOT_CHANGES_CONFIRMED
→ freeze workspace decision
→ create official events
```

---

# 13. Graph DB implementation specs

Use Neo4j.

## 13.1 Node labels

```text
Story
Version
JsonFile
Arc
Chapter
Scene
Character
Relationship
Faction
Location
Threat
Power
WorldRule
Event
Secret
Object
Prophecy
```

These node/edge categories are already specified in `memory_system.json`. 

## 13.2 Edge labels

```text
HAS_VERSION
CONTAINS_FILE
HAS_CHAPTER
HAS_SCENE
CONTAINS_EVENT
AFFECTS
MEMBER_OF
HAS_POWER
HAS_RELATIONSHIP
CONNECTS
DIED_IN
BETRAYED
DESTROYED
CAUSED
OPPOSES
TARGETS
CHANGED_IN
CREATED_BY
REVEALED_IN
```

## 13.3 Projection examples

### Character death

```cypher
MERGE (c:Character {id: $character_id})
SET c.status = "dead",
    c.death_chapter = $chapter_id

MERGE (ch:Chapter {id: $chapter_id})
MERGE (c)-[:DIED_IN]->(ch)
```

### Relationship trust change

```cypher
MERGE (r:Relationship {id: $relationship_id})
SET r.trust_level = $trust_level,
    r.updated_in_version = $version_id
```

### Location destroyed

```cypher
MERGE (l:Location {id: $location_id})
SET l.status = "destroyed",
    l.destroyed_in_chapter = $chapter_id
```

---

# 14. Vector DB implementation specs

Use Qdrant.

## 14.1 Collections

```text
story_lore_chunks
chapter_summary_chunks
scene_chunks
character_memory_chunks
relationship_memory_chunks
world_rule_chunks
foreshadowing_chunks
dialogue_chunks
plot_thread_chunks
```

These collections are part of the memory system’s vector database design. 

## 14.2 Metadata

Every vector point must include:

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

## 14.3 Retrieval rule

```text
Always filter by story_id.
Filter by version_id <= current_version unless user requests comparison.
Never leak future version memories into earlier versions.
```

---

# 15. Continuity checker specs

## 15.1 Check categories

```text
character_state
relationship_logic
world_rules
faction_logic
power_rules
timeline
version_sync
file_links
memory_sync
```

## 15.2 Required checks

```text
dead_character_used_without_flashback_or_revive_event
destroyed_location_used_as_normal
lost_power_used_without_power_return_event
relationship_state_contradiction
faction_goal_contradiction
world_rule_violation
major_threat_disappears_without_resolution
plot_outline_not_updated_after_major_event
master_story_change_without_event
master_story_hard_turn_without_version_bundle_update
future_version_memory_leaks_into_previous_version
mixed_version_files_used_together
graph_projection_missing_after_event
vector_memory_missing_after_major_scene
plot_outline_filename_mismatch
relationship_map_enabled_too_early
```

The documentation lists core continuity problems like dead character appearing alive, destroyed location reuse, lost power use, relationship contradiction, world rule violation, and future memory leaks. 

---

# 16. Frontend implementation specs

Use the **dynamic animated UX**, not the static sidebar.

## 16.1 Main route structure

```text
apps/web/app/
  studio/
    page.tsx

  studio/[storyId]/
    layout.tsx
    home/page.tsx
    seed/page.tsx
    world/page.tsx
    cast/page.tsx
    web/page.tsx
    board/page.tsx
    desk/page.tsx
    court/page.tsx
    script/page.tsx
    timeline/page.tsx
    radar/page.tsx
    control/page.tsx
```

## 16.2 Frontend screens

| Screen              | File/Backend Area     | User Action                                 |
| ------------------- | --------------------- | ------------------------------------------- |
| Studio Home         | status API            | Continue current step                       |
| Story Seed          | `master_story.json`   | Title, idea, genre, ending, foundation      |
| World Core          | `master_story.json`   | World scale, rules, factions, threats       |
| Cast Forge          | `characters.json`     | Character structure and profiles            |
| Relationship Web    | `characters.json`     | Relationship map                            |
| Plot Board          | `plot_outline.json`   | Narrative structure, arcs, chapters, scenes |
| Writing Desk        | `plot_workspace.json` | Free writing + AI completion                |
| Consequence Court   | workspace/events      | Answer consequence questions                |
| Manga Script Studio | `chapter_script.json` | Chapter/page/panel script                   |
| Memory Timeline     | versions/events       | View versions and history                   |
| Continuity Radar    | continuity reports    | Fix contradictions                          |
| Control Room        | developer view        | JSON/events/graph/vector debug              |

---

## 16.3 Unlock rules

```text
Story Seed
→ always unlocked

World Core
→ unlocked after title/basic idea exists

Cast Forge
→ unlocked after master story minimum setup

Relationship Web
→ unlocked after 2 real major character profiles

Plot Board
→ unlocked after minimum character phase complete

Writing Desk
→ unlocked after plot outline has target arc/chapter

Consequence Court
→ unlocked after detected events/questions exist

Manga Script Studio
→ unlocked after scene cards or approved workspace

Memory Timeline
→ always visible after story creation

Continuity Radar
→ always visible after story creation

Control Room
→ advanced mode only
```

---

## 16.4 Frontend component structure

```text
components/
  studio-shell/
    StudioShell.tsx
    PhaseRail.tsx
    BottomStepDock.tsx
    VersionStatusPill.tsx
    ContinuityPill.tsx
    FileSyncIndicator.tsx

  seed/
    StorySeedWizard.tsx
    StoryTypeChips.tsx
    EndingDirectionCards.tsx
    FoundationSelector.tsx

  world/
    WorldScaleSelector.tsx
    WorldRuleGrid.tsx
    RuleDetailDrawer.tsx
    FactionBoard.tsx
    ThreatBuilder.tsx

  cast/
    CastStructureSelector.tsx
    CharacterQueueRail.tsx
    CharacterSheet.tsx
    AppearanceSheet.tsx
    PowerSheet.tsx
    ArcThreatSheet.tsx

  web/
    RelationshipCanvas.tsx
    RelationshipEdgeEditor.tsx
    RelationshipTable.tsx
    LockedRelationshipState.tsx

  board/
    NarrativeStructureCards.tsx
    KishotenketsuBoard.tsx
    ConflictArcBoard.tsx
    ChapterCardBoard.tsx
    SceneCardBoard.tsx
    PlotThreadPanel.tsx

  desk/
    FreeWritingDesk.tsx
    AICompletionToggle.tsx
    ExpansionPreview.tsx
    DetectedChangeRail.tsx
    ContextDrawer.tsx

  court/
    ConsequenceCaseCard.tsx
    ConsequenceChoiceGrid.tsx
    FinalVerdictPanel.tsx

  script/
    MangaPageBoard.tsx
    MangaPanelCard.tsx
    PanelInspector.tsx
    DialogueBubbleEditor.tsx
    SFXEditor.tsx

  timeline/
    VersionTimeline.tsx
    EventImpactCard.tsx
    VersionComparePanel.tsx

  radar/
    ContinuityRadar.tsx
    ContinuityIssueCard.tsx
```

---

# 17. Build phases

## Phase 0 — Project setup

Deliverables:

```text
monorepo
docker-compose
FastAPI app skeleton
Next.js app skeleton
PostgreSQL running
Neo4j running
Qdrant running
Redis running
```

Done when:

```text
/api/v1/health returns OK
web app loads Studio Home placeholder
all containers start
```

---

## Phase 1 — File + version foundation

Deliverables:

```text
six template JSON files
snapshot storage service
version_manifest.json
story creation endpoint
file loading endpoint
state_type validation
filename validation
```

Done when:

```text
POST /stories creates v001
six files are written
plot_outline.json filename is enforced
relationship map starts disabled
```

---

## Phase 2 — Story setup

Deliverables:

```text
master_story APIs
Story Seed frontend
World Core frontend
template patch service
validation service
```

Done when:

```text
user can fill title, idea, genre, world rules, factions, threats
master_story.json updates as template_state
```

---

## Phase 3 — Character builder

Deliverables:

```text
character structure endpoint
profile queue generator
profile creation endpoint
relationship map unlock rule
Cast Forge frontend
Relationship Web frontend
```

Done when:

```text
dual/team/etc creates correct queue
profiles can be filled
relationship map unlocks only after 2 real profiles
no fake placeholder relationships
```

---

## Phase 4 — Plot board

Deliverables:

```text
plot_outline APIs
story_start_workflow editor
narrative structure selector
arc/chapter/scene editors
Plot Board frontend
```

Done when:

```text
user can choose Kishotenketsu/Three-Act/etc
create chapter cards
create scene cards
plot_outline.json remains official planning only
```

---

## Phase 5 — Writing workspace

Deliverables:

```text
plot_workspace APIs
free writing save
AI completion endpoint
accept/reject AI completion
consequence extraction endpoint
question generation
Writing Desk frontend
Consequence Court frontend
```

Done when:

```text
user writes freely
AI expansion optional
consequence detection mandatory
system asks necessary questions
user answers yes/no/custom
final confirmation generated
```

---

## Phase 6 — Event + patch + version engine

Deliverables:

```text
event store
append-only event guard
patch service
approval queue
version candidate creator
version manifest
mark official endpoint
```

Done when:

```text
approved workspace creates events
patches apply to JSON copies
v002 bundle is created
old v001 remains frozen
```

---

## Phase 7 — Chapter script studio

Deliverables:

```text
chapter_script APIs
script generation
panel editor
dialogue editor
script approval
script event extraction
Manga Script Studio frontend
```

Done when:

```text
approved workspace can generate chapter_script.json
user can edit pages/panels/dialogue/SFX
script can be approved
```

---

## Phase 8 — Graph + vector sync

Deliverables:

```text
Neo4j projection service
Qdrant vector service
sync jobs
event projections
retrieval service
```

Done when:

```text
official events project to graph
chapter/scene summaries upsert to Qdrant
sync status visible
version cannot be official if sync fails unless user/admin overrides
```

---

## Phase 9 — Continuity system

Deliverables:

```text
continuity checker
workspace checks
script checks
version candidate checks
Continuity Radar frontend
```

Done when:

```text
dead character misuse detected
destroyed location misuse detected
lost power misuse detected
relationship contradiction detected
filename mismatch detected
relationship map early activation detected
```

---

## Phase 10 — Developer control room

Deliverables:

```text
JSON viewer
event log
patch viewer
version compare
graph preview
vector chunk preview
LLM run logs
```

Done when:

```text
advanced user can inspect raw system state safely
frozen versions are read-only
```

---

# 18. MVP cut

Build the MVP with these parts only:

```text
1. Story creation
2. Six JSON files
3. Version v001
4. Story Seed + World Core
5. Cast Forge
6. Plot Board basic
7. Writing Desk
8. AI completion
9. Consequence extraction
10. Consequence Court
11. Approved events
12. JSON patches
13. v002 creation
14. Basic continuity check
```

Do **not** start with:

```text
beautiful graph animations
full developer control room
full vector retrieval
complex script generation
full production auth
```

Those come after the engine works.

---

# 19. Testing plan

## 19.1 Unit tests

```text
filename validation
state_type validation
relationship map lock rule
patch path validation
event creation
append-only event guard
version bundle creation
workspace AI decision flow
```

## 19.2 Integration tests

```text
create story → six files exist
create dual characters → relationship map unlocks after 2 profiles
free write → detect events → answer questions → approve
approve → events + patches + v002
v001 remains unchanged
plot_outline filename never becomes plot_outline(1).json
```

## 19.3 End-to-end tests

```text
User creates story
fills master story
creates two characters
creates relationship
creates plot chapter
writes free plot
AI expands
system detects injury/betrayal
user answers
approves
chapter script created
v002 created
continuity passes
```

---

# 20. Final implementation order

Build it in this exact order:

```text
1. Monorepo + Docker
2. PostgreSQL schema + Alembic
3. Pydantic models
4. SnapshotService
5. StoryService
6. File validation rules
7. MasterStoryService
8. CharacterService
9. PlotOutlineService
10. PlotWorkspaceService
11. LLMService: AI completion
12. LLMService: consequence extraction
13. Consequence questions
14. Approval queue
15. EventService
16. PatchService
17. VersionService
18. ChapterScriptService
19. GraphService
20. VectorService
21. ContinuityService
22. Frontend Studio Shell
23. Story Seed + World Core
24. Cast Forge + Relationship Web
25. Plot Board
26. Writing Desk
27. Consequence Court
28. Manga Script Studio
29. Memory Timeline
30. Continuity Radar
31. Advanced Control Room
```

---

# 21. What “flawless” means here

This project is correct only if these pass:

```text
User never edits raw JSON unless advanced mode.
User can write freely in plot workspace.
AI expansion is optional.
Consequence detection is mandatory.
System asks only needed questions.
User confirms before official memory changes.
Events are append-only.
Old versions freeze.
New version bundles include synchronized files.
Graph/vector/PostgreSQL sync after approval.
Relationship map cannot activate early.
plot_outline.json filename never mismatches.
master_story.json can mutate only through approved hard-turn events.
```

That is the full implementation plan and build spec for the complete Manga Maker System.
