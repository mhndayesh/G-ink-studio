import type { ApiEnvelope } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080/api/v1";
const API_KEY = process.env.NEXT_PUBLIC_MANGA_API_KEY || "";
const USER_ID = process.env.NEXT_PUBLIC_MANGA_USER_ID || "dev_user";
const DEBUG_API = process.env.NODE_ENV !== "production";

type RequestOptions = RequestInit & { skipUser?: boolean };

async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "X-Manga-User-Id": USER_ID,
    ...(API_KEY ? { "X-Manga-API-Key": API_KEY } : {}),
    ...(options.headers || {}),
  };

  const url = `${API_BASE}${path}`;
  if (DEBUG_API) console.log(`[API] ${options.method || "GET"} ${url}`, options.body ? JSON.parse(options.body as string) : "");

  const response = await fetch(url, { ...options, headers });
  const payload = (await response.json()) as ApiEnvelope<T> | T;

  if (!response.ok) {
    const maybeError = payload as ApiEnvelope<T>;
    const msg = maybeError?.error?.message || `API error ${response.status}`;
    if (DEBUG_API) console.error(`[API] ERROR ${options.method || "GET"} ${url} →`, response.status, msg, payload);
    throw new Error(msg);
  }

  if (typeof payload === "object" && payload !== null && "ok" in payload) {
    const envelope = payload as ApiEnvelope<T>;
    if (!envelope.ok) {
      if (DEBUG_API) console.error(`[API] ENVELOPE ERROR ${url} →`, envelope.error);
      throw new Error(envelope.error?.message || "API error");
    }
    if (DEBUG_API) console.log(`[API] OK ${url} →`, envelope.data);
    return envelope.data as T;
  }
  if (DEBUG_API) console.log(`[API] OK ${url} →`, payload);
  return payload as T;
}

export const api = {
  health: () => apiFetch<{ status: string }>("/health"),
  me: () => apiFetch<any>("/auth/me"),
  createStory: (title: string) => apiFetch<any>("/stories", { method: "POST", body: JSON.stringify({ title }) }),
  getStories: () => apiFetch<any[]>("/stories"),
  deleteStory: (storyId: string) => apiFetch<any>(`/stories/${storyId}`, { method: "DELETE" }),
  getLlmStatus: () => apiFetch<any>("/llm/status"),
  aiGenerate: (storyId: string, body: any) => apiFetch<any>(`/stories/${storyId}/ai/generate`, { method: "POST", body: JSON.stringify(body) }),
  getReferences: (storyId: string) => apiFetch<any>(`/stories/${storyId}/ai/references`),
  checkArcCompletion: (storyId: string, arcTitle?: string) => {
    const qs = arcTitle ? `?arc_title=${encodeURIComponent(arcTitle)}` : "";
    return apiFetch<any>(`/stories/${storyId}/ai/check-arc-completion${qs}`);
  },
  storyStatus: (storyId: string) => apiFetch<any>(`/stories/${storyId}/status`),
  currentFiles: (storyId: string) => apiFetch<any>(`/stories/${storyId}/files/current`),

  getMasterStory: (storyId: string) => apiFetch<any>(`/stories/${storyId}/master-story`),
  patchMasterStory: (storyId: string, body: any) => apiFetch<any>(`/stories/${storyId}/master-story/template`, { method: "PATCH", body: JSON.stringify(body) }),
  validateMasterStory: (storyId: string) => apiFetch<any>(`/stories/${storyId}/master-story/validate`, { method: "POST" }),
  advanceLock: (storyId: string, chapterNumber: number) => apiFetch<any>(`/stories/${storyId}/plot-outline/integrity-lock/advance`, { method: "POST", body: JSON.stringify({ chapter_number: chapterNumber }) }),

  getCharacters: (storyId: string) => apiFetch<any>(`/stories/${storyId}/characters`),
  setCharacterStructure: (storyId: string, body: any) => apiFetch<any>(`/stories/${storyId}/characters/structure`, { method: "PATCH", body: JSON.stringify(body) }),
  createCharacterProfile: (storyId: string, body: any) => apiFetch<any>(`/stories/${storyId}/characters/profiles`, { method: "POST", body: JSON.stringify(body) }),
  createSideCharacterProfile: (storyId: string, body: any) => apiFetch<any>(`/stories/${storyId}/characters/side-profiles`, { method: "POST", body: JSON.stringify(body) }),
  activateRelationshipMap: (storyId: string) => apiFetch<any>(`/stories/${storyId}/characters/relationship-map/activate`, { method: "POST" }),
  updateCharacterProfile: (storyId: string, profileId: string, body: any) => apiFetch<any>(`/stories/${storyId}/characters/profiles/${profileId}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteCharacterProfile: (storyId: string, profileId: string) => apiFetch<any>(`/stories/${storyId}/characters/profiles/${profileId}`, { method: "DELETE" }),
  analyzeRelationships: (storyId: string, chapterIds: string[] = []) => {
    const qs = chapterIds.length > 0 ? "?" + chapterIds.map((id) => `chapter_ids=${encodeURIComponent(id)}`).join("&") : "";
    return apiFetch<any>(`/stories/${storyId}/ai/analyze-relationships${qs}`, { method: "POST" });
  },
  applyRelationships: (storyId: string, relationships: any[]) => apiFetch<any>(`/stories/${storyId}/ai/apply-relationships`, { method: "POST", body: JSON.stringify({ relationships }) }),
  updateSideCharacterProfile: (storyId: string, profileId: string, body: any) => apiFetch<any>(`/stories/${storyId}/characters/side-profiles/${profileId}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteSideCharacterProfile: (storyId: string, profileId: string) => apiFetch<any>(`/stories/${storyId}/characters/side-profiles/${profileId}`, { method: "DELETE" }),
  checkCharacterConflicts: (storyId: string, profileId: string, newName?: string) => {
    const params = new URLSearchParams({ profile_id: profileId });
    if (newName) params.set("new_name", newName);
    return apiFetch<any>(`/stories/${storyId}/characters/check-conflicts?${params}`);
  },

  getPlotOutline: (storyId: string) => apiFetch<any>(`/stories/${storyId}/plot-outline`),
  patchNarrativeStructure: (storyId: string, body: any) => apiFetch<any>(`/stories/${storyId}/plot-outline/narrative-structure`, { method: "PATCH", body: JSON.stringify(body) }),
  redoArcStructure: (storyId: string, body: any) => apiFetch<any>(`/stories/${storyId}/plot-outline/redo-arc-structure`, { method: "POST", body: JSON.stringify(body) }),
  patchArcOverview: (storyId: string, body: any) => apiFetch<any>(`/stories/${storyId}/plot-outline/arc-overview`, { method: "PATCH", body: JSON.stringify(body) }),
  createChapter: (storyId: string, body: any) => apiFetch<any>(`/stories/${storyId}/plot-outline/chapters`, { method: "POST", body: JSON.stringify(body) }),
  deleteChapter: (storyId: string, chapterId: string) => apiFetch<any>(`/stories/${storyId}/plot-outline/chapters/${chapterId}`, { method: "DELETE" }),
  createScene: (storyId: string, body: any) => apiFetch<any>(`/stories/${storyId}/plot-outline/scenes`, { method: "POST", body: JSON.stringify(body) }),
  deleteScene: (storyId: string, sceneId: string) => apiFetch<any>(`/stories/${storyId}/plot-outline/scenes/${sceneId}`, { method: "DELETE" }),

  getWorkspace: (storyId: string) => apiFetch<any>(`/stories/${storyId}/plot-workspace`),
  saveFreeWriting: (storyId: string, body: any) => apiFetch<any>(`/stories/${storyId}/plot-workspace/free-writing`, { method: "PATCH", body: JSON.stringify(body) }),
  aiComplete: (storyId: string, body: any) => apiFetch<any>(`/stories/${storyId}/plot-workspace/ai-complete`, { method: "POST", body: JSON.stringify(body) }),
  aiDecision: (storyId: string, body: any) => apiFetch<any>(`/stories/${storyId}/plot-workspace/ai-complete/decision`, { method: "POST", body: JSON.stringify(body) }),
  analyzeWorkspace: (storyId: string) => apiFetch<any>(`/stories/${storyId}/plot-workspace/analyze`, { method: "POST" }),
  getQuestions: (storyId: string) => apiFetch<any>(`/stories/${storyId}/plot-workspace/questions`),
  answerQuestion: (storyId: string, questionId: string, body: any) => apiFetch<any>(`/stories/${storyId}/plot-workspace/questions/${questionId}/answer`, { method: "POST", body: JSON.stringify(body) }),
  getConfirmation: (storyId: string) => apiFetch<any>(`/stories/${storyId}/plot-workspace/confirmation`),
  approveWorkspace: (storyId: string, decision: "Approve All" | "Reject All" | "Edit Specific Change" | "Go Back To Questions" = "Approve All", customUserInstruction = "") =>
    apiFetch<any>(`/stories/${storyId}/plot-workspace/approve`, { method: "POST", body: JSON.stringify({ decision, custom_user_instruction: customUserInstruction }) }),

  getChapterScript: (storyId: string, chapterId = "") => {
    const qs = chapterId ? `?chapter_id=${encodeURIComponent(chapterId)}` : "";
    return apiFetch<any>(`/stories/${storyId}/chapter-script${qs}`);
  },
  generateChapterScript: (storyId: string, chapterId: string = "") => {
    const qs = chapterId ? `?chapter_id=${encodeURIComponent(chapterId)}` : "";
    return apiFetch<any>(`/stories/${storyId}/chapter-script/generate${qs}`, { method: "POST" });
  },
  approveChapterScript: (storyId: string, chapterId: string = "") => {
    const qs = chapterId ? `?chapter_id=${encodeURIComponent(chapterId)}` : "";
    return apiFetch<any>(`/stories/${storyId}/chapter-script/approve${qs}`, { method: "POST" });
  },
  generateBatchApprove: (storyId: string, chapterIds: string[] = []) =>
    apiFetch<{ chapters_processed: number; chapters_failed: number; results: any[]; sync_count?: number; sync_created?: string[] }>(
      `/stories/${storyId}/chapter-script/generate-batch`,
      { method: "POST", body: JSON.stringify(chapterIds) },
    ),
  fillVisualsAllBatch: (storyId: string, body: { chapter_ids?: string[]; available_locations: any[] }) =>
    apiFetch<{ chapters_processed: number; chapters_skipped: number; chapters_failed: number; results: any[] }>(
      `/stories/${storyId}/chapter-script/fill-visuals-batch-all`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  patchChapterScript: (storyId: string, body: any) => apiFetch<any>(`/stories/${storyId}/chapter-script`, { method: "PATCH", body: JSON.stringify(body) }),
  getChapterScriptStatuses: (storyId: string) => apiFetch<any>(`/stories/${storyId}/chapter-script/chapters-status`),
  loadChapterScript: (storyId: string, chapterId: string) => {
    const qs = chapterId ? `?chapter_id=${encodeURIComponent(chapterId)}` : "";
    return apiFetch<any>(`/stories/${storyId}/chapter-script/load${qs}`, { method: "POST" });
  },

  listVersions: (storyId: string) => apiFetch<any>(`/stories/${storyId}/versions`),
  checkContinuityCurrent: (storyId: string) => apiFetch<any>(`/stories/${storyId}/continuity/check-current`, { method: "POST" }),
  continuityReports: (storyId: string) => apiFetch<any>(`/stories/${storyId}/continuity/reports`),

  getGraphStatus: (storyId: string) => apiFetch<any>(`/stories/${storyId}/graph/status`),
  projectEvents: (storyId: string) => apiFetch<any>(`/stories/${storyId}/graph/project-events`, { method: "POST" }),
  getWebGraph: (storyId: string) => apiFetch<any>(`/stories/${storyId}/graph/web`),
  listProjections: (storyId: string) => apiFetch<any>(`/stories/${storyId}/graph/projections`),

  getVectorStatus: (storyId: string) => apiFetch<any>(`/stories/${storyId}/vector/status`),
  upsertCurrentMemory: (storyId: string) => apiFetch<any>(`/stories/${storyId}/vector/upsert-current-memory`, { method: "POST" }),
  listChunks: (storyId: string) => apiFetch<any>(`/stories/${storyId}/vector/chunks`),

  listLlmRuns: (storyId?: string) => {
    const qs = storyId ? `?story_id=${encodeURIComponent(storyId)}` : "";
    return apiFetch<any>(`/llm/runs${qs}`);
  },
  getDbInfo: () => apiFetch<any>("/db/migration-info"),

  getEvents: (storyId: string) => apiFetch<any>(`/stories/${storyId}/events`),
  getPatches: (storyId: string) => apiFetch<any>(`/stories/${storyId}/patches`),

  validateCharacters: (storyId: string) => apiFetch<any>(`/stories/${storyId}/characters/validate`, { method: "POST" }),
  validatePlotOutline: (storyId: string) => apiFetch<any>(`/stories/${storyId}/plot-outline/validate`, { method: "POST" }),
  validateWorkspace: (storyId: string) => apiFetch<any>(`/stories/${storyId}/plot-workspace/validate`, { method: "POST" }),
  validateChapterScript: (storyId: string) => apiFetch<any>(`/stories/${storyId}/chapter-script/validate`, { method: "POST" }),

  // Locations
  listLocations: (storyId: string) => apiFetch<any[]>(`/stories/${storyId}/locations`),
  createLocation: (storyId: string, body: any) => apiFetch<any>(`/stories/${storyId}/locations`, { method: "POST", body: JSON.stringify(body) }),
  getLocation: (storyId: string, locationId: string) => apiFetch<any>(`/stories/${storyId}/locations/${locationId}`),
  updateLocation: (storyId: string, locationId: string, body: any) => apiFetch<any>(`/stories/${storyId}/locations/${locationId}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteLocation: (storyId: string, locationId: string) => apiFetch<any>(`/stories/${storyId}/locations/${locationId}`, { method: "DELETE" }),
  aiGenerateAllLocations: (storyId: string, body?: any) => apiFetch<any>(`/stories/${storyId}/locations/ai-generate-all`, { method: "POST", body: JSON.stringify(body || {}) }),
  aiFillLocation: (storyId: string, locationId: string, body: any) => apiFetch<any>(`/stories/${storyId}/locations/${locationId}/ai-fill`, { method: "POST", body: JSON.stringify(body) }),

  // Universal field fill
  aiFillField: (storyId: string, body: { page: string; target_fields: string[]; partial_input?: any; generation_hints?: any }) =>
    apiFetch<any>(`/stories/${storyId}/ai/fill-field`, { method: "POST", body: JSON.stringify(body) }),
  fillChapterVisuals: (storyId: string, body: { available_locations: any[] }) =>
    apiFetch<any>(`/stories/${storyId}/ai/fill-chapter-visuals`, { method: "POST", body: JSON.stringify(body) }),

  validateExport: (storyId: string) =>
    apiFetch<{ warnings: Array<{ level: string; category: string; message: string; where: string }>; count: number }>(`/stories/${storyId}/export/validate`),

  syncScriptSpeakers: (storyId: string) =>
    apiFetch<{ created: string[]; already_present: string[]; count: number }>(`/stories/${storyId}/characters/sync-script-speakers`, { method: "POST" }),

  autoGenerateSideCast: (storyId: string) =>
    apiFetch<{ created: string[]; skipped: string[]; count: number; used_fallback: boolean; warnings: string[] }>(
      `/stories/${storyId}/characters/auto-generate-side`, { method: "POST" }
    ),

  patchStoryStartWorkflow: (storyId: string, body: any) => apiFetch<any>(`/stories/${storyId}/plot-outline/story-start-workflow`, { method: "PATCH", body: JSON.stringify(body) }),
  // NOTE(dev): extractEvents is disabled — the chapter-script event pipeline is orphaned.
  // detected_events_from_script are written to chapter_script.json but never consumed downstream
  // (EventPatchService + VersionService are never called from the chapter-script flow).
  // Event detection + versioning already happens via the Writing Desk → Consequence Court pipeline.
  extractEvents: (storyId: string, chapterId: string = "") => {
    const qs = chapterId ? `?chapter_id=${encodeURIComponent(chapterId)}` : "";
    return apiFetch<any>(`/stories/${storyId}/chapter-script/extract-events${qs}`, { method: "POST" });
  },

};

// ─── Export helpers ───────────────────────────────────────────────────────────
// These use fetch directly (not apiFetch) because they download binary/text files,
// not JSON envelopes. Auth headers are still sent.

function _exportHeaders(): HeadersInit {
  return {
    "X-Manga-User-Id": USER_ID,
    ...(API_KEY ? { "X-Manga-API-Key": API_KEY } : {}),
  };
}

async function _downloadBlob(path: string): Promise<{ blob: Blob; filename: string }> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, { headers: _exportHeaders() });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  const cd = res.headers.get("Content-Disposition") || "";
  const match = cd.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : "export";
  const blob = await res.blob();
  return { blob, filename };
}

export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const exportApi = {
  story: (storyId: string, fmt: "txt" | "md" | "docx") =>
    _downloadBlob(`/stories/${storyId}/export/story?fmt=${fmt}`),
  scenes: (storyId: string, fmt: "txt" | "md") =>
    _downloadBlob(`/stories/${storyId}/export/scenes?fmt=${fmt}`),
  visuals: (storyId: string, fmt: "txt" | "md") =>
    _downloadBlob(`/stories/${storyId}/export/visuals?fmt=${fmt}`),
  visualsBundle: (storyId: string) =>
    _downloadBlob(`/stories/${storyId}/export/visuals-bundle`),
  tripleZip: (storyId: string) =>
    _downloadBlob(`/stories/${storyId}/export/triple-zip`),
  rawZip: (storyId: string) =>
    _downloadBlob(`/stories/${storyId}/export/raw-zip`),
};
