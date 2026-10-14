import { create } from 'zustand';
import type { JournalEntry } from '../../../../server/src/analytics/journal';

interface JournalDrafts {
  drafts: Record<string, JournalEntry>;
  saving: Record<string, boolean>;
  beginSave: (key: string) => boolean;
  finishSave: (key: string) => void;
  put: (key: string, value: JournalEntry) => void;
  clear: (key: string, expected?: JournalEntry) => void;
}
// Keep unsaved notes in memory, scoped to their Pod, side and wake date.
export const useJournalDrafts = create<JournalDrafts>((set, get) => ({
  drafts: {},
  saving: {},
  beginSave: key => {
    if (get().saving[key]) return false;
    set(state => ({ saving: { ...state.saving, [key]: true } })); return true;
  },
  finishSave: key => set(state => { const saving = { ...state.saving }; delete saving[key]; return { saving }; }),
  put: (key, value) => set(state => ({ drafts: { ...state.drafts, [key]: value } })),
  clear: (key, expected) => set(state => {
    if (expected && state.drafts[key] !== expected) return state;
    const drafts = { ...state.drafts }; delete drafts[key]; return { drafts };
  }),
}));
