// Mirrors the server project document (server/src/docSchema.js). A server test
// asserts the two agree on required top-level keys — keep them in sync.

export type Stage = 'story' | 'cast' | 'pages' | 'render' | 'letterExport';
export const STAGES: Stage[] = ['story', 'cast', 'pages', 'render', 'letterExport'];
export type RenderMode = 'auto' | 't2i' | 'i2i' | 'i2i-2refs';
export type LetteringType = 'speech' | 'thought' | 'narration' | 'sfx';

// The canonical camera-shot list (kept in sync with server docSchema.js CAMERA_SHOTS).
// The server also ships it in ProjectView.cameraShots; this is the static fallback.
export const CAMERA_SHOTS: string[] = [
  'extreme close-up', 'close-up', 'medium close-up', 'medium shot', 'cowboy shot',
  'wide shot', 'establishing shot', 'low angle shot', 'high angle shot',
  'over-the-shoulder shot', 'two-shot', "bird's-eye view",
];

export interface SystemRule { positive: string; negative: string; }
export interface AiSettings { provider: string; model: string; autoApprove: boolean; autoLetter: boolean; }

export interface Character {
  id: string; name: string; role?: string; aliases?: string[]; sheet?: string;
  imagePrompt: string; imagePromptLocked?: boolean; promptAddon?: string; negativeAddon?: string;
  refs?: string[]; _promptSource?: 'llm' | 'compiled';
}
export interface Location {
  id: string; name: string; type?: string; description?: string;
  imagePrompt: string; imagePromptLocked?: boolean; promptAddon?: string; negativeAddon?: string;
  refs?: string[]; _promptSource?: 'llm' | 'compiled';
}
export interface Chapter { id: string; number: number; title: string; status?: string; pageIds: string[]; }

export interface LayoutCell { panelId: string; x: number; y: number; w: number; h: number; }
export interface PageLayout { template: string; readingDir: 'rtl' | 'ltr'; panels: LayoutCell[]; }
export interface LetteringObj { id: string; panelId: string | null; type: LetteringType; text: string; x: number; y: number; w: number; h: number; fontSize: number; rotation: number; speaker?: string | null; whisper?: boolean; shout?: boolean; }
export interface Page {
  id: string; number: number; chapterId: string; sceneLabel: string; scenePurpose?: string; mood?: string;
  layout: PageLayout; lettering: LetteringObj[]; approved: boolean; _letteringStale?: boolean;
}

export interface PanelRender { status: 'none' | 'running' | 'done' | 'error' | 'stale'; model: string | null; seed: number | null; assetId: string | null; imageUrl: string | null; renderId: string | null; error: string | null; backend?: string; at?: string; }
export interface PanelQC { status: 'unchecked' | 'passed' | 'needs_fix' | 'manually_reviewed'; issues: { level: 'hard' | 'soft'; msg: string }[]; }
export interface Panel {
  id: string; number: number; pageId: string; chapterId: string; sceneId?: string;
  visual: string; action: string; mood: string; cameraShot: string; pacing?: string;
  background?: string; facialExpression?: string; pose?: string;
  characters: string[]; locationId: string | null;
  narration: string; dialogue: string; sfxText: string; dialogueCount?: number;
  imagePrompt: string; imagePromptLocked?: boolean; promptAddon?: string; negativeAddon?: string;
  renderMode: RenderMode; render: PanelRender; _promptStale?: boolean; _renderStale?: boolean; _promptSource?: 'llm' | 'compiled'; _renderMode?: RenderMode;
  qc: PanelQC;
}

export interface ProjectDoc {
  id: string; title: string; currentStage: Stage; createdAt?: string;
  systemRule: SystemRule; ruleOverrides?: Record<string, any>; aiSettings: AiSettings;
  synopsis?: string; genre?: string; worldNotes?: string;
  characters: Character[]; locations: Location[]; chapters: Chapter[]; pages: Page[]; panels: Panel[];
  history: { at: string; action: string; payload: any }[];
  _lastCleanup?: { at: string; fixed: number }; _lastExport?: { at: string; pages: any[] };
}

export interface GateBlocker { kind: string; id: string | null; label: string; reason: string; jump?: any; }
export interface Gate { ok: boolean; blockers: GateBlocker[]; }
export interface StageInfo { stage: Stage; index: number; title: string; blurb: string; unlocked: boolean; current: boolean; done: boolean; }
export interface LlmStatus { provider: string; model: string; configured: boolean; label: string; }
export interface ImageStatus { type: string; url: string | null; configured: boolean; label: string; }
export interface Rule { id: string; name: string; kind: string; template?: string; templates?: Record<string, string>; maxLength?: number; llmInstructions?: string; letteringClause?: string; [k: string]: any; }

export interface ProjectView {
  project: ProjectDoc;
  stages: StageInfo[];
  stageMeta: Record<Stage, { index: number; title: string; blurb: string }>;
  currentGate: Gate;
  nextStage: Stage | null;
  rules: Record<string, Rule>;
  llm: LlmStatus;
  image: ImageStatus;
  cameraShots?: string[];
  renderModes?: RenderMode[];
}

export interface Job { id: string; project_id: string; kind: string; status: string; progress: number; total: number; message?: string; error?: string; started_at: string; finished_at?: string; }
