from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class CreateStoryRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)


class CreateStoryResponse(BaseModel):
    story_id: str
    current_version_id: str
    state_type: str
    created_files: list[str]
    snapshot_folder_path: str


class StoryStatusResponse(BaseModel):
    story_id: str
    title: str
    current_version_id: str
    state_type: str
    phase_status: dict[str, str]
    continuity_status: str


class CurrentFilesResponse(BaseModel):
    story_id: str
    version_id: str
    files: dict[str, str]
    paths: dict[str, str]


class MasterStoryTemplatePatchRequest(BaseModel):
    target_branch: str = Field(..., min_length=1, max_length=200)
    operation: str = Field(..., pattern="^(replace|merge_object|append_to_array|remove)$")
    value: Any = None


class MasterStoryTemplatePatchResponse(BaseModel):
    story_id: str
    version_id: str
    file_type: str
    state_type: str
    target_branch: str
    operation: str
    updated_value: Any = None
    validation_status: str


class MasterStoryResponse(BaseModel):
    story_id: str
    version_id: str
    file_type: str
    state_type: str
    content: dict


class ValidationResponse(BaseModel):
    story_id: str
    version_id: str
    file_type: str
    validation_status: str
    checks: list[str]


class CharactersResponse(BaseModel):
    story_id: str
    version_id: str
    file_type: str
    state_type: str
    relationship_map_available: bool
    relationship_map_enabled: bool
    created_major_character_profiles_count: int
    content: dict


class CharacterStructureRequest(BaseModel):
    selected: str = Field(..., min_length=1, max_length=120)
    custom_main_character_structure: str = ""
    requested_major_profiles: int | None = Field(default=None, ge=1, le=100)


class CharacterStructureResponse(BaseModel):
    story_id: str
    version_id: str
    selected: str
    profiles_to_create: list[dict]
    relationship_map_available: bool
    relationship_map_enabled: bool
    validation_status: str


class CharacterProfileCreateRequest(BaseModel):
    profile_id: str = Field(..., min_length=1, max_length=40)
    character_name: str = Field(..., min_length=1, max_length=120)
    profile_data: dict = Field(default_factory=dict)


class SideCharacterProfileCreateRequest(BaseModel):
    character_name: str = Field(..., min_length=1, max_length=120)
    profile_data: dict = Field(default_factory=dict)


class CharacterProfileUpdateRequest(BaseModel):
    character_name: str = Field(..., min_length=1, max_length=120)
    profile_data: dict = Field(default_factory=dict)


class SideCharacterProfileUpdateRequest(BaseModel):
    character_name: str = Field(..., min_length=1, max_length=120)
    profile_data: dict = Field(default_factory=dict)


class CharacterProfileCreateResponse(BaseModel):
    story_id: str
    version_id: str
    profile_id: str
    character_name: str
    created_major_character_profiles_count: int
    relationship_map_available: bool
    relationship_map_enabled: bool
    validation_status: str


class RelationshipMapActivateResponse(BaseModel):
    story_id: str
    version_id: str
    is_enabled: bool
    relationships: list[dict]
    validation_status: str


class PlotOutlineResponse(BaseModel):
    story_id: str
    version_id: str
    file_type: str
    state_type: str
    content: dict


class PlotStartWorkflowRequest(BaseModel):
    start_mode: str | None = None
    current_stage: str | None = None


class PlotStartWorkflowResponse(BaseModel):
    story_id: str
    version_id: str
    start_mode: str
    current_stage: str
    validation_status: str


class PlotNarrativeStructureRequest(BaseModel):
    selected: str = Field(..., min_length=1, max_length=120)
    custom_structure: str = ""


class PlotRedoArcStructureRequest(BaseModel):
    selected: str = Field(..., min_length=1, max_length=120)
    custom_structure: str = ""
    preserve_arc_overview: bool = True
    clear_chapter_script: bool = True
    confirmation: str = Field(..., min_length=1, max_length=40)


class PlotNarrativeStructureResponse(BaseModel):
    story_id: str
    version_id: str
    selected: str
    custom_structure: str
    enabled_sections: list[str]
    validation_status: str


class PlotArcOverviewPatchRequest(BaseModel):
    target_branch: str = Field(..., min_length=1, max_length=200)
    operation: str = Field(..., pattern="^(replace|merge_object|append_to_array|remove|remove_index)$")
    value: Any = None


class PlotArcOverviewPatchResponse(BaseModel):
    story_id: str
    version_id: str
    target_branch: str
    operation: str
    updated_value: Any = None
    validation_status: str


class PlotChapterCreateRequest(BaseModel):
    chapter_id: str | None = None
    chapter_number: int | None = Field(default=None, ge=1, le=10000)
    arc_title: str = ""
    chapter_title: str = ""
    chapter_purpose: str = ""
    structure_section: str = ""
    summary: str = ""
    characters_present: list[str] = Field(default_factory=list)
    relationships_used: list[str] = Field(default_factory=list)
    factions_used: list[str] = Field(default_factory=list)
    threats_used: list[str] = Field(default_factory=list)
    world_rules_shown: list[str] = Field(default_factory=list)
    power_system_shown: list[str] = Field(default_factory=list)
    main_conflict: str = ""
    emotional_beat: str = ""
    twist_or_hook: str = ""
    ending_cliffhanger: str = ""
    custom_chapter_details: str = ""


class PlotChapterCreateResponse(BaseModel):
    story_id: str
    version_id: str
    chapter: dict
    chapter_count: int
    validation_status: str


class PlotSceneCreateRequest(BaseModel):
    scene_id: str | None = None
    chapter_id: str = Field(..., min_length=1, max_length=40)
    scene_order: int | None = Field(default=None, ge=1, le=10000)
    location: str = ""
    time: str = ""
    characters_present: list[str] = Field(default_factory=list)
    scene_goal: str = ""
    scene_conflict: str = ""
    relationship_dynamic_used: str = ""
    new_information_revealed: str = ""
    action_or_dialogue_focus: str = ""
    visual_manga_moment: str = ""
    panel_mood: str = ""
    ending_beat: str = ""
    custom_scene_details: str = ""


class PlotSceneCreateResponse(BaseModel):
    story_id: str
    version_id: str
    scene: dict
    scene_count: int
    validation_status: str


class PlotWorkspaceFreeWritingRequest(BaseModel):
    text: str = Field(..., min_length=1)
    input_type: str = ""
    user_priority: str = ""
    user_intent_notes: str = ""
    do_not_change_these_parts: list[str] = Field(default_factory=list)


class PlotWorkspaceAICompleteRequest(BaseModel):
    expansion_mode: str = "Light Expansion"
    text: str = ""


class PlotWorkspaceAICompletionDecisionRequest(BaseModel):
    decision: str = Field(..., pattern="^(Accept|Edit|Reject)$")
    edited_text: str = ""


class PlotWorkspaceQuestionAnswerRequest(BaseModel):
    selected: str = Field(..., min_length=1)
    custom_answer: str = ""


class PlotWorkspaceApproveRequest(BaseModel):
    decision: str = Field(default="Approve All", pattern="^(Approve All|Reject All|Edit Specific Change|Go Back To Questions)$")
    custom_user_instruction: str = ""


class EventsResponse(BaseModel):
    story_id: str
    current_version_id: str
    events: list[dict]
    count: int


class PatchesResponse(BaseModel):
    story_id: str
    current_version_id: str
    patches: list[dict]
    count: int


class CreateEventsPatchesResponse(BaseModel):
    story_id: str
    version_from: str
    workspace_id: str
    created_events: list[str]
    created_patches: list[str]
    events: list[dict]
    patches: list[dict]
    already_created: bool
    next_step: str
    validation_status: str

class ChapterScriptPatchRequest(BaseModel):
    target_branch: str = Field(..., min_length=1, max_length=240)
    operation: str = Field(..., pattern="^(replace|merge_object|append_to_array|remove|add)$")
    value: Any = None


class ContinuityCheckRequest(BaseModel):
    version_id: str | None = None


class GraphProjectRequest(BaseModel):
    version_id: str | None = None


class VectorProjectRequest(BaseModel):
    version_id: str | None = None


class AiGenerateRequest(BaseModel):
    page: str = Field(..., pattern="^(cast|board|scenes|threads|court|world|seed|side)$")
    target_fields: list[str] = Field(default_factory=list, max_length=20)
    partial_input: dict = Field(default_factory=dict)
    generation_hints: dict = Field(default_factory=dict)


class AiGenerateResponse(BaseModel):
    generated_fields: dict
    warnings: list[str] = Field(default_factory=list)
