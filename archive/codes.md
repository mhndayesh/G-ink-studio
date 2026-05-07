Below is the **backend foundation spec** for the Manga Maker System: **database schema + Pydantic models + API contract**.

This is based on the current project logic: six JSON files, versioned story state, event-driven updates, plot workspace free writing, optional AI expansion, mandatory consequence extraction, approval before official updates, and sync to PostgreSQL + graph DB + vector DB. The documentation confirms the file roles, workflow, truth hierarchy, and update pipeline: JSON files are current story state, old versions freeze, events drive updates, the LLM proposes while the system validates, and all memory layers sync after approval. 

---

# 0. Backend truth rules

These rules control everything.

```text
1. The backend is a story-state engine, not simple CRUD.
2. Official story state lives in synchronized version bundles.
3. Old official versions never change.
4. No official change happens without an approved event.
5. The LLM never directly edits official memory.
6. plot_workspace.json is temporary.
7. plot_outline.json is official planning.
8. chapter_script.json is clean manga script output.
9. Relationship map starts disabled until at least 2 real major profiles exist.
10. All official links must use plot_outline.json, never plot_outline(1).json.
```

Your six active file types are:

```text
master_story.json
characters.json
plot_outline.json
memory_system.json
plot_workspace.json
chapter_script.json
```

The docs define `plot_workspace.json` as temporary free writing + AI completion + detected events + questions + patches, while `chapter_script.json` is the clean manga script output. 

---

# 1. PostgreSQL database schema

Important design choice:

**Do not store every JSON field as a SQL column.**
That would become a nightmare.

Use SQL for:

```text
identity
ownership
versioning
approval
events
patches
sync jobs
continuity reports
workspace status
script status
file paths
```

Store full JSON snapshots in object/local storage, and optionally store a JSONB copy for indexing/debug.

---

## 1.1 PostgreSQL enums

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

CREATE TYPE workspace_status AS ENUM (
  'not_started',
  'free_writing',
  'ai_completion_ready',
  'ai_completion_done',
  'analysis_ready',
  'questions_pending',
  'confirmation_ready',
  'approved',
  'rejected',
  'archived'
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

CREATE TYPE severity_level AS ENUM (
  'low',
  'medium',
  'high',
  'critical'
);
```

---

## 1.2 Users table

Use simple auth first. Add full auth later.

```sql
CREATE TABLE users (
  user_id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 1.3 Stories table

```sql
CREATE TABLE stories (
  story_id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(user_id) ON DELETE CASCADE,
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

Purpose:

```text
One row per manga/story project.
Tracks current official version.
Forces official plot filename rule.
```

---

## 1.4 Arcs table

```sql
CREATE TABLE arcs (
  arc_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  arc_number INTEGER NOT NULL,
  arc_title TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (story_id, arc_number)
);
```

---

## 1.5 Chapters table

```sql
CREATE TABLE chapters (
  chapter_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  arc_id TEXT REFERENCES arcs(arc_id) ON DELETE SET NULL,
  chapter_number INTEGER NOT NULL,
  chapter_title TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (story_id, chapter_number)
);
```

---

## 1.6 Story versions table

Each official version is a synchronized bundle.

```sql
CREATE TABLE story_versions (
  version_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  previous_version_id TEXT REFERENCES story_versions(version_id),
  arc_id TEXT REFERENCES arcs(arc_id) ON DELETE SET NULL,
  chapter_id TEXT REFERENCES chapters(chapter_id) ON DELETE SET NULL,
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

Rule:

```text
A version is official only when all required files exist and sync jobs pass.
```

---

## 1.7 Story files table

Stores file metadata and paths.

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

  UNIQUE (story_id, version_id, file_type)
);
```

Add filename guard:

```sql
ALTER TABLE story_files
ADD CONSTRAINT plot_outline_filename_guard
CHECK (
  file_type != 'plot_outline'
  OR official_filename = 'plot_outline.json'
);
```

---

## 1.8 Plot workspaces table

`plot_workspace.json` is temporary and can change during writing.

```sql
CREATE TABLE plot_workspaces (
  workspace_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  version_id TEXT NOT NULL REFERENCES story_versions(version_id),
  target_arc_id TEXT REFERENCES arcs(arc_id) ON DELETE SET NULL,
  target_chapter_id TEXT REFERENCES chapters(chapter_id) ON DELETE SET NULL,
  target_scene_id TEXT,
  status workspace_status NOT NULL DEFAULT 'not_started',
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

This maps to the `plot_workspace.json` structure: free writing, AI completion, mandatory analysis, detected events, consequence questions, proposed events, proposed JSON patches, continuity review, and final confirmation. 

---

## 1.9 LLM runs table

Every AI call should be tracked.

```sql
CREATE TABLE llm_runs (
  llm_run_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES plot_workspaces(workspace_id) ON DELETE SET NULL,
  chapter_id TEXT REFERENCES chapters(chapter_id) ON DELETE SET NULL,
  run_type TEXT NOT NULL,
  model_name TEXT,
  prompt_version TEXT NOT NULL,
  input_payload JSONB NOT NULL,
  output_payload JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
```

Run types:

```text
ai_completion
consequence_extraction
question_generation
event_proposal
patch_proposal
chapter_script_generation
continuity_check
summary_generation
```

---

## 1.10 Detected story events table

These are not official yet.

```sql
CREATE TABLE detected_story_events (
  detected_event_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES plot_workspaces(workspace_id) ON DELETE CASCADE,
  llm_run_id TEXT REFERENCES llm_runs(llm_run_id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_category event_category NOT NULL,
  confidence TEXT NOT NULL,
  evidence_from_user_text TEXT,
  target_file file_type,
  target_entity_id TEXT,
  target_entity_name TEXT,
  requires_user_decision BOOLEAN NOT NULL DEFAULT false,
  reason_question_is_needed TEXT,
  suggested_event_summary TEXT,
  status TEXT NOT NULL DEFAULT 'pending_review',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 1.11 Consequence questions table

```sql
CREATE TABLE consequence_questions (
  question_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES plot_workspaces(workspace_id) ON DELETE CASCADE,
  detected_event_id TEXT REFERENCES detected_story_events(detected_event_id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  why_this_matters TEXT,
  options JSONB NOT NULL,
  selected TEXT,
  custom_answer TEXT,
  status TEXT NOT NULL DEFAULT 'unanswered',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at TIMESTAMPTZ
);
```

---

## 1.12 User answers table

```sql
CREATE TABLE user_answers (
  answer_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES plot_workspaces(workspace_id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES consequence_questions(question_id) ON DELETE CASCADE,
  selected TEXT,
  custom_answer TEXT,
  answer_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 1.13 Story events table

Official event store. Append-only.

```sql
CREATE TABLE story_events (
  event_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  version_from TEXT NOT NULL REFERENCES story_versions(version_id),
  version_to TEXT REFERENCES story_versions(version_id),
  arc_id TEXT REFERENCES arcs(arc_id) ON DELETE SET NULL,
  chapter_id TEXT REFERENCES chapters(chapter_id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_category event_category NOT NULL,
  target_file file_type NOT NULL,
  target_entity_id TEXT,
  summary TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_from_detected_event_id TEXT REFERENCES detected_story_events(detected_event_id),
  created_from_question_id TEXT REFERENCES consequence_questions(question_id),
  approval_status approval_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ
);
```

Append-only protection:

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

## 1.14 JSON patches table

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

Patch service supports:

```text
add
replace
remove
append_to_array
merge_object
```

---

## 1.15 Approval queue table

This controls final confirmation.

```sql
CREATE TABLE approval_queue (
  approval_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES plot_workspaces(workspace_id) ON DELETE CASCADE,
  chapter_id TEXT REFERENCES chapters(chapter_id) ON DELETE SET NULL,
  approval_type TEXT NOT NULL,
  status approval_status NOT NULL DEFAULT 'pending',
  summary JSONB NOT NULL,
  approved_event_ids JSONB NOT NULL DEFAULT '[]',
  rejected_event_ids JSONB NOT NULL DEFAULT '[]',
  approved_patch_ids JSONB NOT NULL DEFAULT '[]',
  rejected_patch_ids JSONB NOT NULL DEFAULT '[]',
  user_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
```

Approval types:

```text
workspace_changes
chapter_script
version_candidate
continuity_fix
```

---

## 1.16 Chapter scripts table

```sql
CREATE TABLE chapter_scripts (
  script_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  version_id TEXT NOT NULL REFERENCES story_versions(version_id),
  arc_id TEXT REFERENCES arcs(arc_id) ON DELETE SET NULL,
  chapter_id TEXT NOT NULL REFERENCES chapters(chapter_id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES plot_workspaces(workspace_id) ON DELETE SET NULL,
  script_version TEXT NOT NULL DEFAULT 'draft_001',
  chapter_status TEXT NOT NULL DEFAULT 'draft',
  approved_as_official BOOLEAN NOT NULL DEFAULT false,
  script_json_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ
);
```

---

## 1.17 Continuity reports table

```sql
CREATE TABLE continuity_reports (
  report_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  version_id TEXT REFERENCES story_versions(version_id) ON DELETE SET NULL,
  workspace_id TEXT REFERENCES plot_workspaces(workspace_id) ON DELETE SET NULL,
  chapter_id TEXT REFERENCES chapters(chapter_id) ON DELETE SET NULL,
  report_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started',
  approved BOOLEAN NOT NULL DEFAULT false,
  issues JSONB NOT NULL DEFAULT '[]',
  warnings JSONB NOT NULL DEFAULT '[]',
  fix_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 1.18 Sync jobs table

This tracks PostgreSQL → JSON → Neo4j → Qdrant sync.

```sql
CREATE TABLE sync_jobs (
  sync_job_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  version_id TEXT REFERENCES story_versions(version_id) ON DELETE SET NULL,
  event_id TEXT REFERENCES story_events(event_id) ON DELETE SET NULL,
  target_system TEXT NOT NULL,
  status sync_status NOT NULL DEFAULT 'pending',
  input_payload JSONB,
  output_payload JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
```

Target systems:

```text
json_snapshots
postgresql
neo4j
qdrant
continuity_report
```

---

## 1.19 Event projections table

```sql
CREATE TABLE event_projections (
  projection_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES story_events(event_id) ON DELETE CASCADE,
  target_system TEXT NOT NULL,
  projection_payload JSONB NOT NULL,
  status sync_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at TIMESTAMPTZ
);
```

---

## 1.20 Vector chunks metadata table

Qdrant stores vectors. PostgreSQL stores metadata mirror.

```sql
CREATE TABLE vector_chunks (
  chunk_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  version_id TEXT REFERENCES story_versions(version_id) ON DELETE SET NULL,
  arc_id TEXT REFERENCES arcs(arc_id) ON DELETE SET NULL,
  chapter_id TEXT REFERENCES chapters(chapter_id) ON DELETE SET NULL,
  scene_id TEXT,
  source_file file_type NOT NULL,
  chunk_type TEXT NOT NULL,
  entity_ids JSONB NOT NULL DEFAULT '[]',
  qdrant_collection TEXT NOT NULL,
  text_preview TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

# 2. Indexes

```sql
CREATE INDEX idx_story_versions_story_current
ON story_versions (story_id, status, version_number DESC);

CREATE INDEX idx_story_files_story_version
ON story_files (story_id, version_id, file_type);

CREATE INDEX idx_story_events_story_version
ON story_events (story_id, version_from, version_to);

CREATE INDEX idx_story_events_type
ON story_events (story_id, event_type);

CREATE INDEX idx_detected_events_workspace
ON detected_story_events (workspace_id, status);

CREATE INDEX idx_questions_workspace
ON consequence_questions (workspace_id, status);

CREATE INDEX idx_patches_workspace
ON json_patches (workspace_id, approval_status);

CREATE INDEX idx_sync_jobs_status
ON sync_jobs (story_id, status);

CREATE INDEX idx_vector_chunks_entity_ids
ON vector_chunks USING GIN (entity_ids);
```

---

# 3. Pydantic models

These are the backend contract models. They do not need to reproduce every nested JSON field in full at first; the snapshot files already hold the full detailed JSON. Pydantic should strictly validate:

```text
metadata
file links
state type
event structure
patch structure
workspace flow
approval flow
version consistency
```

---

## 3.1 Base enums

```python
from enum import Enum
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field, model_validator


class StateType(str, Enum):
    template_state = "template_state"
    story_state = "story_state"


class VersionStatus(str, Enum):
    draft = "draft"
    candidate = "candidate"
    official = "official"
    archived = "archived"
    failed = "failed"


class ApprovalStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    needs_revision = "needs_revision"


class FileType(str, Enum):
    master_story = "master_story"
    characters = "characters"
    plot_outline = "plot_outline"
    memory_system = "memory_system"
    plot_workspace = "plot_workspace"
    chapter_script = "chapter_script"
    version_manifest = "version_manifest"


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

## 3.2 File metadata model

```python
class StoryFileHeader(BaseModel):
    story_id: str = Field(..., min_length=1)
    version_id: str = Field(..., min_length=1)
    file_type: str = Field(..., min_length=1)
    state_type: StateType = StateType.template_state
```

---

## 3.3 Linked files model

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
        if self.plot_outline_file != "plot_outline.json":
            raise ValueError("plot_outline_file must be plot_outline.json")
        return self
```

---

## 3.4 Story version models

```python
class VersionManifest(BaseModel):
    story_id: str
    version_id: str
    previous_version_id: Optional[str] = None
    arc_id: Optional[str] = None
    chapter_id: Optional[str] = None
    files: dict[str, str]
    created_from_events: list[str] = []
    created_at: str

    @model_validator(mode="after")
    def validate_files(self):
        required = {
            "master_story": "master_story.json",
            "characters": "characters.json",
            "plot_outline": "plot_outline.json",
            "memory_system": "memory_system.json",
        }
        for key, filename in required.items():
            if self.files.get(key) != filename:
                raise ValueError(f"{key} must be {filename}")
        return self


class StoryVersionResponse(BaseModel):
    version_id: str
    story_id: str
    version_number: int
    previous_version_id: Optional[str]
    status: VersionStatus
    state_type: StateType
    snapshot_folder_path: str
    created_from_event_ids: list[str]
```

---

## 3.5 Master story model

Use full detail later; this model validates core metadata and major branches.

```python
class OptionBlock(BaseModel):
    selected: Any = ""
    options: list[str] = []


class MultiOptionBlock(BaseModel):
    selected: list[str] = []
    options: list[str] = []


class MasterStory(BaseModel):
    story_id: str
    version_id: str
    file_type: Literal["master_story"]
    state_type: StateType = StateType.template_state
    title: str
    idea_so_far: str = ""

    story_type: MultiOptionBlock
    ending_direction: OptionBlock
    story_foundation: OptionBlock
    world_type: dict[str, Any]
    world_master_rules: dict[str, Any]
    major_factions_and_ruling_sides: dict[str, Any]
    major_threats_and_minor_side_threats: dict[str, Any]
```

---

## 3.6 Characters model with relationship map rule

This is where the audit correction matters.

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
                    "character_relationship_map must be disabled until at least 2 real profiles exist"
                )
            if self.character_relationship_map.relationships:
                raise ValueError(
                    "character_relationship_map.relationships must be empty until at least 2 real profiles exist"
                )
        return self
```

---

## 3.7 Plot outline model

```python
class WritingWorkspaceLink(BaseModel):
    current_workspace_file: str = "plot_workspace.json"
    current_chapter_script_file: str = "chapter_script.json"
    workspace_status: str = "not_started"


class PlotOutlineFile(BaseModel):
    story_id: str
    version_id: str
    file_type: Literal["plot_outline"]
    state_type: StateType = StateType.template_state
    master_story_file: str = "master_story.json"
    characters_file: str = "characters.json"
    story_title: str

    plot_outline_setup: dict[str, Any]
    story_start_workflow: dict[str, Any]
    writing_workspace_link: Optional[WritingWorkspaceLink] = None
    linked_sources: dict[str, Any]
    narrative_structure: dict[str, Any]
    story_arc_overview: dict[str, Any]
    kishotenketsu_outline: dict[str, Any]
    conflict_driven_outline: dict[str, Any]
    chapter_or_episode_list: dict[str, Any]
    scene_cards: dict[str, Any]
    plot_threads: dict[str, Any]
    continuity_checks: dict[str, Any]
    custom_plot_outline_details: str = ""

    @model_validator(mode="after")
    def validate_filenames(self):
        if self.master_story_file != "master_story.json":
            raise ValueError("master_story_file must be master_story.json")
        if self.characters_file != "characters.json":
            raise ValueError("characters_file must be characters.json")
        return self
```

---

## 3.8 Plot workspace models

```python
class AICompletion(BaseModel):
    is_enabled: bool = False
    button_label: str = "AI Completion / Expand Writing"
    rule: str
    expansion_mode: dict[str, Any]
    expanded_text: str = ""
    user_can_accept_edit_or_reject: bool = True
    accepted_expanded_text: bool = False
    final_text_used_for_analysis: str = ""


class FreePlotInput(BaseModel):
    note_to_user: str
    text: str = ""
    input_type: dict[str, Any]
    user_intent_notes: str = ""
    do_not_change_these_parts: list[str] = []
    user_priority: dict[str, Any]


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


class ProposedOfficialEvent(BaseModel):
    event_id: str = ""
    event_type: str
    target_file: str
    target_entity_id: Optional[str] = None
    summary: str
    payload: dict[str, Any] = {}
    created_from_detected_event_id: Optional[str] = None
    created_from_question_id: Optional[str] = None
    approval_status: ApprovalStatus = ApprovalStatus.pending


class ProposedJsonPatch(BaseModel):
    patch_id: str = ""
    target_file: str
    target_branch: str
    operation: PatchOperation
    old_value: Any = None
    new_value: Any = None
    reason: str = ""
    approval_status: ApprovalStatus = ApprovalStatus.pending


class PlotWorkspaceFile(BaseModel):
    story_id: str
    version_id: str
    file_type: Literal["plot_workspace"]
    state_type: StateType = StateType.template_state
    workspace_id: str
    linked_files: LinkedFiles
    workspace_status: dict[str, Any]
    user_free_writing: FreePlotInput
    ai_completion: AICompletion
    mandatory_analysis_after_writing: dict[str, bool]
    context_used_for_analysis: dict[str, Any]
    detected_story_events: list[DetectedStoryEvent] = []
    consequence_questions: dict[str, Any]
    user_answers: list[dict[str, Any]] = []
    proposed_official_events: list[ProposedOfficialEvent] = []
    proposed_json_patches: dict[str, list[ProposedJsonPatch]] = {}
    continuity_review: dict[str, Any]
    final_confirmation: dict[str, Any]
    after_confirmation_actions: dict[str, bool]
    output_links: dict[str, Any]
    custom_workspace_details: str = ""
```

---

## 3.9 Chapter script models

```python
class DialogueLine(BaseModel):
    speaker_id: str = ""
    speaker_name: str = ""
    text: str = ""
    speech_bubble_type: dict[str, Any]


class MangaPanel(BaseModel):
    panel_id: str
    panel_number: int
    panel_size: dict[str, Any]
    camera_shot: dict[str, Any]
    visual: str = ""
    character_action: str = ""
    background_details: str = ""
    facial_expression: str = ""
    pose_or_body_language: str = ""
    dialogue: list[DialogueLine] = []
    narration: str = ""
    sound_effects: list[dict[str, Any]] = []
    mood: str = ""
    pacing: dict[str, Any]
    continuity_notes: str = ""
    custom_panel_details: str = ""


class MangaPage(BaseModel):
    page_id: str
    page_number: int
    scene_id: str
    page_purpose: str = ""
    page_mood: str = ""
    panels: list[MangaPanel] = []


class ChapterScriptFile(BaseModel):
    story_id: str
    version_id: str
    file_type: Literal["chapter_script"]
    state_type: StateType = StateType.template_state
    script_id: str
    linked_files: LinkedFiles
    chapter_metadata: dict[str, Any]
    chapter_purpose: dict[str, Any]
    linked_story_context: dict[str, Any]
    script_format: dict[str, str]
    chapter_scene_breakdown: list[dict[str, Any]]
    pages: list[MangaPage]
    chapter_dialogue_index: list[dict[str, Any]]
    chapter_visual_index: dict[str, Any]
    chapter_event_extraction: dict[str, Any]
    memory_update_plan_after_chapter: dict[str, Any]
    continuity_checks: dict[str, Any]
    approval: dict[str, Any]
    custom_chapter_script_details: str = ""
```

---

## 3.10 Story event and patch models

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


class StoryEventResponse(StoryEventCreate):
    event_id: str
    approval_status: ApprovalStatus
    created_at: str
    approved_at: Optional[str] = None


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


class JsonPatchResponse(JsonPatchCreate):
    patch_id: str
    approval_status: ApprovalStatus
    applied_version_id: Optional[str] = None
```

---

# 4. API contract

Base path:

```text
/api/v1
```

All endpoints return:

```json
{
  "ok": true,
  "data": {},
  "error": null
}
```

Error shape:

```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "character_relationship_map must be disabled until at least 2 profiles exist",
    "details": {}
  }
}
```

---

## 4.1 Story APIs

### Create story

```http
POST /api/v1/stories
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
  "title": "Manga Maker System",
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

Backend actions:

```text
create story row
create v001
write template JSON files
write story_files rows
create version_manifest.json
```

---

### Get story status

```http
GET /api/v1/stories/{story_id}/status
```

Response:

```json
{
  "story_id": "story_001",
  "current_version_id": "v001",
  "state_type": "template_state",
  "phase_status": {
    "master_story": "incomplete",
    "characters": "incomplete",
    "relationship_map": "locked",
    "plot_outline": "not_started",
    "plot_workspace": "not_started",
    "chapter_script": "draft"
  },
  "continuity_status": "not_checked"
}
```

---

### Get current files

```http
GET /api/v1/stories/{story_id}/files/current
```

Response:

```json
{
  "version_id": "v001",
  "files": {
    "master_story": "master_story.json",
    "characters": "characters.json",
    "plot_outline": "plot_outline.json",
    "memory_system": "memory_system.json",
    "plot_workspace": "plot_workspace.json",
    "chapter_script": "chapter_script.json"
  }
}
```

---

## 4.2 Master story APIs

### Get master story

```http
GET /api/v1/stories/{story_id}/master-story
```

Response:

```json
{
  "file_type": "master_story",
  "version_id": "v001",
  "state_type": "template_state",
  "content": {}
}
```

---

### Patch master story template

```http
PATCH /api/v1/stories/{story_id}/master-story/template
```

Request:

```json
{
  "target_branch": "story_type.selected",
  "operation": "replace",
  "value": ["Shonen", "Dark Fantasy"]
}
```

Response:

```json
{
  "updated": true,
  "state_type": "template_state",
  "validation_status": "passed"
}
```

Rule:

```text
Template edits are allowed before official story-state lock.
Hard-turn edits after story_state require events.
```

---

## 4.3 Character APIs

### Get characters file

```http
GET /api/v1/stories/{story_id}/characters
```

---

### Update main character structure

```http
PATCH /api/v1/stories/{story_id}/characters/structure
```

Request:

```json
{
  "selected": "Dual Main Characters",
  "custom_main_character_structure": ""
}
```

Response:

```json
{
  "selected": "Dual Main Characters",
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

---

### Create major character profile

```http
POST /api/v1/stories/{story_id}/characters/profiles
```

Request:

```json
{
  "profile_id": "char_001",
  "character_name": "Kai",
  "profile_data": {}
}
```

Response:

```json
{
  "profile_id": "char_001",
  "created_major_character_profiles_count": 1,
  "relationship_map_enabled": false
}
```

If count becomes 2:

```json
{
  "profile_id": "char_002",
  "created_major_character_profiles_count": 2,
  "relationship_map_enabled": true,
  "message": "Relationship map is now available."
}
```

---

### Activate relationship map

```http
POST /api/v1/stories/{story_id}/characters/relationship-map/activate
```

Response if fewer than 2 profiles:

```json
{
  "ok": false,
  "error": {
    "code": "RELATIONSHIP_MAP_LOCKED",
    "message": "Create at least 2 real major profiles before enabling relationship map."
  }
}
```

Response if valid:

```json
{
  "is_enabled": true,
  "relationships": []
}
```

---

### Create relationship

```http
POST /api/v1/stories/{story_id}/characters/relationships
```

Request:

```json
{
  "character_a_id": "char_001",
  "character_b_id": "char_002",
  "relationship_type": "Friendly Rivals",
  "relationship_details": {
    "how_they_met": "",
    "current_dynamic": "",
    "main_source_of_conflict_between_them": ""
  }
}
```

Response:

```json
{
  "relationship_id": "rel_001",
  "created": true
}
```

---

## 4.4 Plot outline APIs

### Get plot outline

```http
GET /api/v1/stories/{story_id}/plot-outline
```

---

### Update story start workflow

```http
PATCH /api/v1/stories/{story_id}/plot-outline/story-start-workflow
```

Request:

```json
{
  "start_mode": "Plan First Arc Then Chapter 1",
  "current_stage": "choose_narrative_structure"
}
```

---

### Update narrative structure

```http
PATCH /api/v1/stories/{story_id}/plot-outline/narrative-structure
```

Request:

```json
{
  "selected": "Kishotenketsu"
}
```

Response:

```json
{
  "selected": "Kishotenketsu",
  "enabled_sections": ["kishotenketsu_outline"]
}
```

---

### Create chapter

```http
POST /api/v1/stories/{story_id}/plot-outline/chapters
```

Request:

```json
{
  "chapter_id": "ch_001",
  "chapter_number": 1,
  "chapter_title": "",
  "chapter_purpose": "Introduce the protagonist and first tension."
}
```

---

## 4.5 Plot workspace APIs

This is the most important flow.

### Create workspace

```http
POST /api/v1/stories/{story_id}/plot-workspace
```

Request:

```json
{
  "target_arc_id": "arc_001",
  "target_chapter_id": "ch_001",
  "target_scene_id": ""
}
```

Response:

```json
{
  "workspace_id": "workspace_001",
  "status": "free_writing",
  "workspace_json_path": "/stories/story_001/workspaces/workspace_001/plot_workspace.json"
}
```

---

### Save free writing

```http
PATCH /api/v1/stories/{story_id}/plot-workspace/{workspace_id}/free-writing
```

Request:

```json
{
  "text": "Kai fights Ren. Ren badly injures Kai. Mira later discovers Ren was a spy.",
  "input_type": "Scene Idea",
  "user_priority": "Keep My Writing As Much As Possible",
  "do_not_change_these_parts": []
}
```

Response:

```json
{
  "workspace_id": "workspace_001",
  "status": "analysis_ready",
  "ai_completion_available": true
}
```

---

### AI completion

```http
POST /api/v1/stories/{story_id}/plot-workspace/{workspace_id}/ai-complete
```

Request:

```json
{
  "expansion_mode": "Light Expansion"
}
```

Response:

```json
{
  "expanded_text": "Kai and Ren clash in a tense fight...",
  "user_options": ["Accept", "Edit", "Reject"]
}
```

---

### Accept/reject AI completion

```http
POST /api/v1/stories/{story_id}/plot-workspace/{workspace_id}/ai-complete/decision
```

Request:

```json
{
  "decision": "Accept",
  "edited_text": ""
}
```

Response:

```json
{
  "accepted_expanded_text": true,
  "final_text_used_for_analysis": "Kai and Ren clash in a tense fight..."
}
```

---

### Analyze consequences

```http
POST /api/v1/stories/{story_id}/plot-workspace/{workspace_id}/analyze
```

Response:

```json
{
  "detected_story_events": [
    {
      "detected_event_id": "det_evt_001",
      "event_type": "CHARACTER_INJURED",
      "target_entity_name": "Kai",
      "confidence": "high",
      "requires_user_decision": true
    },
    {
      "detected_event_id": "det_evt_002",
      "event_type": "CHARACTER_ATTACKED_CHARACTER",
      "target_entity_name": "Ren",
      "confidence": "high",
      "requires_user_decision": true
    },
    {
      "detected_event_id": "det_evt_003",
      "event_type": "CHARACTER_ALLEGIANCE_CHANGED",
      "target_entity_name": "Ren",
      "confidence": "medium",
      "requires_user_decision": true
    }
  ],
  "questions_created": 3,
  "next_step": "answer_questions"
}
```

---

### Get consequence questions

```http
GET /api/v1/stories/{story_id}/plot-workspace/{workspace_id}/questions
```

Response:

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

---

### Answer question

```http
POST /api/v1/stories/{story_id}/plot-workspace/{workspace_id}/questions/{question_id}/answer
```

Request:

```json
{
  "selected": "Loses Power Temporarily",
  "custom_answer": "Kai loses right-arm power for 3 chapters."
}
```

Response:

```json
{
  "question_id": "cq_001",
  "status": "answered",
  "remaining_questions": 2
}
```

---

### Generate final confirmation

```http
GET /api/v1/stories/{story_id}/plot-workspace/{workspace_id}/confirmation
```

Response:

```json
{
  "status": "ready",
  "summary_of_detected_changes": [
    "Kai is seriously injured.",
    "Kai temporarily loses right-arm power for 3 chapters.",
    "Ren attacked Kai.",
    "Ren may be revealed as enemy-aligned.",
    "Kai and Ren relationship trust will decrease."
  ],
  "proposed_official_events": [],
  "proposed_json_patches": [],
  "will_create_version": "v002",
  "user_options": [
    "Approve All",
    "Reject All",
    "Edit Specific Change",
    "Go Back To Questions"
  ]
}
```

---

### Approve workspace changes

```http
POST /api/v1/stories/{story_id}/plot-workspace/{workspace_id}/approve
```

Request:

```json
{
  "decision": "Approve All",
  "custom_user_instruction": ""
}
```

Response:

```json
{
  "approved": true,
  "created_events": ["evt_001", "evt_002", "evt_003"],
  "created_patches": ["patch_001", "patch_002"],
  "created_version_candidate": "v002",
  "sync_jobs": ["sync_001", "sync_002", "sync_003"],
  "next_step": "version_candidate_review"
}
```

---

## 4.6 Chapter script APIs

### Generate script

```http
POST /api/v1/stories/{story_id}/chapters/{chapter_id}/script/generate
```

Request:

```json
{
  "workspace_id": "workspace_001",
  "style": "manga_script",
  "page_target": 20
}
```

Response:

```json
{
  "script_id": "script_ch_001",
  "chapter_id": "ch_001",
  "status": "draft",
  "script_json_path": "/stories/story_001/scripts/ch_001/chapter_script.json"
}
```

---

### Patch script

```http
PATCH /api/v1/stories/{story_id}/chapters/{chapter_id}/script
```

Request:

```json
{
  "target_branch": "pages[0].panels[0].visual",
  "operation": "replace",
  "value": "A wide shot of the academy courtyard at sunset."
}
```

---

### Extract events from script

```http
POST /api/v1/stories/{story_id}/chapters/{chapter_id}/script/extract-events
```

Response:

```json
{
  "detected_events_from_script": [],
  "requires_review": true
}
```

---

### Approve script

```http
POST /api/v1/stories/{story_id}/chapters/{chapter_id}/script/approve
```

Response:

```json
{
  "script_approved_by_user": true,
  "ready_for_memory_update": true
}
```

---

## 4.7 Version APIs

### Create version from approved events

```http
POST /api/v1/stories/{story_id}/versions/create-from-approved-events
```

Request:

```json
{
  "version_from": "v001",
  "version_to": "v002",
  "workspace_id": "workspace_001"
}
```

Response:

```json
{
  "version_id": "v002",
  "status": "candidate",
  "snapshot_folder_path": "/stories/story_001/versions/v002/",
  "files": {
    "master_story": "master_story.json",
    "characters": "characters.json",
    "plot_outline": "plot_outline.json",
    "memory_system": "memory_system.json"
  },
  "continuity_report_id": "cont_001"
}
```

---

### Mark version official

```http
POST /api/v1/stories/{story_id}/versions/{version_id}/mark-official
```

Response:

```json
{
  "version_id": "v002",
  "status": "official",
  "story_current_version_id": "v002"
}
```

Only allowed if:

```text
all required files exist
continuity report is approved or user accepted warnings
PostgreSQL update success
Neo4j sync success
Qdrant sync success
```

---

## 4.8 Continuity APIs

### Check workspace

```http
POST /api/v1/stories/{story_id}/continuity/check-workspace
```

Request:

```json
{
  "workspace_id": "workspace_001"
}
```

Response:

```json
{
  "report_id": "cont_001",
  "status": "completed",
  "issues": [],
  "warnings": []
}
```

---

### Check version candidate

```http
POST /api/v1/stories/{story_id}/continuity/check-version-candidate
```

Request:

```json
{
  "version_id": "v002"
}
```

Response:

```json
{
  "report_id": "cont_002",
  "approved": true,
  "issues": [],
  "warnings": []
}
```

---

# 5. Event-to-patch contract

This is the core transformation layer.

## Character injured

Event:

```json
{
  "event_type": "CHARACTER_INJURED",
  "target_file": "characters",
  "target_entity_id": "char_001",
  "payload": {
    "injury_level": "serious",
    "duration": "3 chapters",
    "power_impact": "right-arm power temporarily lost"
  }
}
```

Patches:

```json
[
  {
    "target_file": "characters",
    "target_branch": "created_major_character_profiles.char_001.status",
    "operation": "merge_object",
    "new_value": {
      "selected": "injured",
      "injury_level": "serious"
    }
  },
  {
    "target_file": "characters",
    "target_branch": "created_major_character_profiles.char_001.optional_powers_and_power_level.power_details",
    "operation": "merge_object",
    "new_value": {
      "temporary_power_loss": true,
      "power_loss_duration": "3 chapters"
    }
  }
]
```

## Relationship trust changed

```json
{
  "event_type": "RELATIONSHIP_TRUST_CHANGED",
  "target_file": "characters",
  "target_entity_id": "rel_001",
  "payload": {
    "trust_level": "decreased",
    "reason": "Ren attacked Kai"
  }
}
```

Patch:

```json
{
  "target_file": "characters",
  "target_branch": "character_relationship_map.relationships.rel_001.relationship_details.trust_level",
  "operation": "replace",
  "new_value": "decreased"
}
```

## World rule changed

```json
{
  "event_type": "WORLD_RULE_CHANGED",
  "target_file": "master_story",
  "target_entity_id": "world_master_rules",
  "payload": {
    "rule": "Magic became unstable after forbidden magic was used."
  }
}
```

Patch:

```json
{
  "target_file": "master_story",
  "target_branch": "world_master_rules.rule_details.magic_rules",
  "operation": "replace",
  "new_value": "Magic became unstable after forbidden magic was used."
}
```

---

# 6. Backend services map

```text
StoryService
- create_story
- get_status
- get_current_version

SnapshotService
- read_current_file
- write_working_file
- create_version_bundle
- freeze_version

TemplateStateService
- detect_template_state
- promote_to_story_state
- validate_empty_fields_allowed

MasterStoryService
- update_template_branch
- apply_hard_turn_patch

CharacterService
- update_structure
- create_profile
- validate_relationship_map_unlock
- create_relationship

PlotOutlineService
- update_structure
- create_chapter
- create_scene
- update_plot_threads

PlotWorkspaceService
- save_free_writing
- ai_complete
- analyze
- create_questions
- store_answers
- prepare_confirmation
- approve

ChapterScriptService
- generate_script
- patch_panel
- extract_events
- approve_script

LLMService
- expand_writing
- extract_consequences
- generate_questions
- propose_events
- propose_patches
- generate_script

EventService
- create_detected_events
- create_official_events
- enforce_append_only

PatchService
- validate_patch_paths
- apply_patches
- generate_patch_preview

VersionService
- create_candidate
- create_manifest
- mark_official

GraphService
- project_event_to_neo4j

VectorService
- upsert_story_chunks

ContinuityService
- check_workspace
- check_script
- check_version_candidate
```

---

# 7. Non-negotiable validation rules

```text
1. plot_outline_file must always be plot_outline.json.
2. characters.character_relationship_map.is_enabled must be false if created_major_character_profiles length < 2.
3. characters.character_relationship_map.relationships must be [] if fewer than 2 profiles exist.
4. Official version files cannot be overwritten.
5. Working files can be edited but must not be marked official.
6. LLM output must validate as JSON before being stored.
7. Every official event must have target_file, event_category, summary, and payload.
8. Every patch must point to an existing branch unless operation is add.
9. vNext must include synchronized official files.
10. Continuity check must run before mark-official.
```

---

# 8. Build order

Build exactly in this order:

```text
1. PostgreSQL schema
2. Pydantic models
3. SnapshotService
4. StoryService
5. VersionService
6. ValidationService
7. CharacterService relationship-map rules
8. PlotWorkspaceService
9. LLMService for AI completion
10. LLMService for consequence extraction
11. Consequence questions + answers
12. ApprovalQueue
13. EventService
14. PatchService
15. Version candidate creator
16. ContinuityService
17. ChapterScriptService
18. GraphService
19. VectorService
20. Frontend integration
```

This is the correct backend foundation. The database stores control and history. Pydantic protects structure. API contract supports the actual user experience. The LLM helps, but never owns truth.
