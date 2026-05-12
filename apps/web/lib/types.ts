export type ApiEnvelope<T> = {
  ok: boolean;
  data: T | null;
  error: null | { code: string; message: string; details?: unknown };
};

export type StoryStatus = {
  story_id: string;
  current_version_id: string;
  state_type: "template_state" | "story_state";
  phase_status?: Record<string, string>;
  continuity_status?: string;
  title?: string;
};

export type StoryCreateResponse = {
  story_id: string;
  current_version_id: string;
  state_type: string;
  created_files: string[];
};

export type MasterStoryFile = Record<string, any>;
export type CharactersFile = Record<string, any>;
export type PlotOutlineFile = Record<string, any>;
export type PlotWorkspaceFile = Record<string, any>;
export type ChapterScriptFile = Record<string, any>;

export type Phase = {
  key: string;
  title: string;
  href: string;
  file: string;
  description: string;
};

export type PhaseStatus = "locked" | "available" | "in_progress" | "completed" | "not_started" | "draft" | "generated" | "approved";

export interface CharacterProfile {
  profile_id: string;
  character_name: string;
  status?: { selected?: string };
  character_role_level?: { selected?: string };
  main_character_faction_alignment?: { alignment_details?: { linked_master_faction?: string } };
}

export interface ConsequenceQuestion {
  question_id: string;
  question: string;
  why_this_matters?: string;
  options: string[];
  selected?: string;
  custom_answer?: string;
  status: string;
}

export interface StoryEvent {
  event_id: string;
  event_type: string;
  event_category: string;
  target_file: string;
  target_entity_id?: string;
  summary: string;
  payload: Record<string, any>;
  approval_status: string;
}

export interface JsonPatch {
  patch_id: string;
  target_file: string;
  target_branch: string;
  operation: "replace" | "add" | "remove" | "append_to_array" | "merge_object";
  old_value?: any;
  new_value?: any;
  approval_status: string;
}

export interface Chapter {
  chapter_id: string;
  chapter_number: number;
  chapter_title: string;
  chapter_purpose?: string;
  summary?: string;
  status?: string;
}

export interface Scene {
  scene_id: string;
  chapter_id: string;
  scene_order: number;
  location: string;
  time: string;
  scene_goal: string;
}

export interface PlotThread {
  goal?: string;
  obstacles?: string[];
  turning_points?: string[];
  resolution?: string;
}

export interface ContinuityReport {
  report_id: string;
  story_id: string;
  version_id: string;
  issues: any[];
  warnings: any[];
}

export interface GraphStatus {
  enabled: boolean;
  connected: boolean;
}

export interface VectorStatus {
  enabled: boolean;
  connected: boolean;
}

export interface WorkspaceConfirmation {
  status?: string;
  proposed_official_events?: StoryEvent[];
  proposed_json_patches?: JsonPatch[];
  summary_of_detected_changes?: any[];
  unanswered_questions_count?: number;
}
