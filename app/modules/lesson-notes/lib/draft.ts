import { MAX_NOTE_LENGTH } from "~/lib/notes";

export type NoteDraftState = {
  length: number;
  maxLength: number;
  overLimit: boolean;
  dirty: boolean;
  canSave: boolean;
  counter: string;
};

export function describeDraft(
  draft: string,
  savedBody: string | null
): NoteDraftState {
  const length = draft.length;
  const overLimit = length > MAX_NOTE_LENGTH;
  const dirty = draft !== (savedBody ?? "");
  // The save action rejects a blank note, so a blank draft cannot be saved.
  const blank = draft.trim().length === 0;

  return {
    length,
    maxLength: MAX_NOTE_LENGTH,
    overLimit,
    dirty,
    canSave: dirty && !blank && !overLimit,
    counter: `${length.toLocaleString("en")} / ${MAX_NOTE_LENGTH.toLocaleString("en")}`,
  };
}
