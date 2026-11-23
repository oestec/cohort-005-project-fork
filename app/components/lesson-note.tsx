import { useState } from "react";
import { useFetcher } from "react-router";
import { Lock, NotebookPen } from "lucide-react";
import { noteDraftState, type NoteDraftState } from "~/modules/lesson-notes";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Textarea } from "~/components/ui/textarea";
import { cn, formatRelativeTime } from "~/lib/utils";

export function LessonNote({
  note,
}: {
  note: { body: string; updatedAt: string } | null;
}) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const [draft, setDraft] = useState(note?.body ?? "");
  const isSaving = fetcher.state !== "idle";
  const state = noteDraftState(draft, note?.body ?? null);

  return (
    <Card className="mb-8 py-0">
      <CardContent className="p-6">
        <NoteHeader />

        <fetcher.Form method="post" className="space-y-2">
          <input type="hidden" name="intent" value="save-note" />
          <Textarea
            name="body"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Jot down what you want to remember from this lesson..."
            aria-label="Your notes"
            aria-invalid={state.overLimit || undefined}
            className="min-h-32 resize-y"
          />

          <NoteFooter
            isSaving={isSaving}
            error={fetcher.data?.error}
            state={state}
            updatedAt={note?.updatedAt}
          />
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}

function NoteHeader() {
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <NotebookPen className="size-5 text-primary" />
        <h2 className="text-xl font-semibold">Your notes</h2>
      </div>
      <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
        <Lock className="size-3" />
        Only you can see these
      </span>
    </div>
  );
}

function NoteFooter({
  isSaving,
  error,
  state,
  updatedAt,
}: {
  isSaving: boolean;
  error: string | undefined;
  state: NoteDraftState;
  updatedAt: string | undefined;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button type="submit" size="sm" disabled={isSaving || !state.canSave}>
        {isSaving ? "Saving..." : "Save note"}
      </Button>

      <NoteStatus error={error} dirty={state.dirty} updatedAt={updatedAt} />

      <span
        className={cn(
          "ml-auto text-xs tabular-nums",
          state.overLimit ? "text-red-600" : "text-muted-foreground"
        )}
      >
        {state.counter}
      </span>
    </div>
  );
}

function NoteStatus({
  error,
  dirty,
  updatedAt,
}: {
  error: string | undefined;
  dirty: boolean;
  updatedAt: string | undefined;
}) {
  if (error) return <span className="text-sm text-red-600">{error}</span>;
  if (dirty) {
    return (
      <span className="text-xs text-muted-foreground">Unsaved changes</span>
    );
  }
  if (!updatedAt) return null;
  return (
    <span suppressHydrationWarning className="text-xs text-muted-foreground">
      Saved · last edited {formatRelativeTime(updatedAt)}
    </span>
  );
}
