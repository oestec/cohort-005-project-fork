// PROTOTYPE, throwaway. Answers "How do Notifications appear in Cadence?"
// (wayfinder ticket #11). Lives only on branch prototype/notification-appearance.
import Knock, { signUserToken } from "@knocklabs/node";
import { SAMPLE_NOTIFICATIONS, type SampleKind } from "~/components/notifications-prototype/samples";

export const PROTOTYPE_WORKFLOW_KEY = "prototype-notification";

export type KnockPrototypeConfig = {
  publicApiKey: string;
  feedChannelId: string;
  userToken: string | null;
};

export async function getKnockPrototypeConfig(
  userId: number | null
): Promise<KnockPrototypeConfig | null> {
  const publicApiKey = process.env.KNOCK_PUBLIC_API_KEY;
  const feedChannelId = process.env.KNOCK_FEED_CHANNEL_ID;
  if (!userId || !publicApiKey || !feedChannelId) return null;

  const signingKey = process.env.KNOCK_SIGNING_KEY;
  const userToken = signingKey
    ? await signUserToken(String(userId), { signingKey, expiresInSeconds: 3600 })
    : null;

  return { publicApiKey, feedChannelId, userToken };
}

export async function triggerSampleNotification(
  recipient: { id: number; name: string; email: string },
  kind: SampleKind
) {
  const sample = SAMPLE_NOTIFICATIONS[kind];
  const knock = new Knock({ apiKey: process.env.KNOCK_SECRET_API_KEY });
  return knock.workflows.trigger(PROTOTYPE_WORKFLOW_KEY, {
    recipients: [
      { id: String(recipient.id), name: recipient.name, email: recipient.email },
    ],
    actor: { id: "prototype-actor", name: sample.actorName },
    data: { kind, title: sample.title, body: sample.body, url: sample.url },
  });
}
