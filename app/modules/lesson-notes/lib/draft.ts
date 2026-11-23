import { MAX_NOTE_LENGTH } from "~/lib/notes";

export type NoteDraftState = {
  overLimit: boolean;
  dirty: boolean;
  canSave: boolean;
  counter: string;
};

export function describeDraft(
  draft: string,
  savedBody: string | null
): NoteDraftState {
  // The server trims before it checks and stores, so judge the trimmed text.
  const trimmed = draft.trim();
  const length = trimmed.length;
  const overLimit = length > MAX_NOTE_LENGTH;
  const dirty = trimmed !== (savedBody ?? "");
  // The save action rejects a blank note, so a blank draft cannot be saved.
  const blank = length === 0;

  return {
    overLimit,
    dirty,
    canSave: dirty && !blank && !overLimit,
    counter: `${length.toLocaleString("en")} / ${MAX_NOTE_LENGTH.toLocaleString("en")}`,
  };
}
