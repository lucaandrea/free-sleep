import { create } from 'zustand';
import { routinesEqual } from '../../../../server/src/routines/contract';
import type { DailySchedule, DayOfWeek } from '@api/schedulesSchema';

export interface RoutineDraft {
  original: DailySchedule;
  value: DailySchedule;
  copies: DayOfWeek[];
}
interface DraftState {
  day: DayOfWeek;
  drafts: Record<string, RoutineDraft>;
  select: (day: DayOfWeek) => void;
  put: (key: string, draft: RoutineDraft) => void;
  clear: (keys: string[]) => void;
}
// In-memory drafts survive navigation; each Pod, side and day keeps its own original for conflict checks.
export const useRoutineDrafts = create<DraftState>((set) => ({
  day: 'monday',
  drafts: {},
  select: (day) => set({ day }),
  put: (key, draft) => set(state => {
    const original = state.drafts[key]?.original ?? draft.original;
    const drafts = { ...state.drafts };
    if (routinesEqual(original, draft.value) && draft.copies.length === 0) delete drafts[key];
    else drafts[key] = { ...draft, original };
    return { drafts };
  }),
  clear: (keys) =>
    set((state) => {
      const drafts = { ...state.drafts };
      keys.forEach((key) => delete drafts[key]);
      return { drafts };
    }),
}));
