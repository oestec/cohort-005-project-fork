import { describeDraft, type NoteDraftState } from "./lib/draft";

export type { NoteDraftState };

/**
 * What the note editor shows for the text in the box: the character
 * counter, whether it differs from the saved note, and whether Save is on.
 */
export function noteDraftState(
  draft: string,
  savedBody: string | null
): NoteDraftState {
  return describeDraft(draft, savedBody);
}
