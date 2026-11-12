// PROTOTYPE, throwaway. Sends a sample Notification to the current user
// through the real Knock workflow, so the variants have something to show.
import { data } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/api.prototype-notify";
import { db } from "~/db";
import { users } from "~/db/schema";
import { getCurrentUserId } from "~/lib/session";
import {
  PROTOTYPE_WORKFLOW_KEY,
  triggerSampleNotification,
} from "~/lib/knock-prototype.server";
import {
  SAMPLE_NOTIFICATIONS,
  type SampleKind,
} from "~/components/notifications-prototype/samples";

export async function action({ request }: Route.ActionArgs) {
  if (process.env.NODE_ENV === "production") {
    throw new Response("Not found", { status: 404 });
  }
  const userId = await getCurrentUserId(request);
  if (!userId) return data({ error: "Select a user in the DevUI panel first." });

  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return data({ error: "Unknown user." });

  const kind = String((await request.formData()).get("kind")) as SampleKind;
  if (!(kind in SAMPLE_NOTIFICATIONS)) return data({ error: "Unknown kind." });

  try {
    await triggerSampleNotification(user, kind);
    return data({ ok: `Sent “${SAMPLE_NOTIFICATIONS[kind].label}” to ${user.name}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return data({
      error: `Knock trigger failed (${message}). Does a committed workflow “${PROTOTYPE_WORKFLOW_KEY}” with an in-app feed step exist?`,
    });
  }
}
