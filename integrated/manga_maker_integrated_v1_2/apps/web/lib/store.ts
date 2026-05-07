import { create } from "zustand";

export type PhaseStatusValue = "locked" | "available" | "in_progress" | "completed" | "not_started" | "draft" | "generated" | "approved";

export type IntegrityLock = {
  locked: boolean;
  lock_reason: string | null;
  locked_at: string | null;
  deleted_chapter_id: string | null;
  deleted_chapter_number: number | null;
  deleted_chapter_title: string | null;
  chapters_to_restore: number[];
  chapters_restored: number[];
};

type StudioState = {
  phaseStatuses: Record<string, PhaseStatusValue>;
  setPhaseStatuses: (statuses: Record<string, PhaseStatusValue>) => void;
  integrityLock: IntegrityLock | null;
  setIntegrityLock: (lock: IntegrityLock | null) => void;
};

export const useStudioStore = create<StudioState>((set) => ({
  phaseStatuses: {},
  setPhaseStatuses: (phaseStatuses) => set({ phaseStatuses }),
  integrityLock: null,
  setIntegrityLock: (integrityLock) => set({ integrityLock }),
}));
