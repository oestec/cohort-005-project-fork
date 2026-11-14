import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Knock from "@knocklabs/node";

// ─── In-app Notifications ───
// Knock delivers every Notification when KNOCK_SECRET_API_KEY is set. Without
// a key (local dev) each one is written to .outbox/notifications/ as a JSON
// file instead, so it can be read without sending anything. Tests swap in the
// recording fake with `setNotificationTransport`.
//
// Services decide who gets a Notification inside their write and return it;
// route actions call `sendNotifications` after the commit. A failed send is
// logged and dropped: it never fails the action.

/** A user as Knock sees them. `id` is `String(user.id)`. */
export type NotificationPerson = { id: string; name: string; email: string };

export type NotificationWorkflow =
  | "refund-request-decided"
  | "refund-request-raised"
  | "question-asked"
  | "seat-claimed";

export type Notification = {
  workflow: NotificationWorkflow;
  recipients: NotificationPerson[];
  /** Who caused the event. Shown by Knock, never notified. */
  actor: NotificationPerson;
  /** Flat scalars only: Knock's compact feed drops nested values. */
  data: Record<string, string | number>;
  /** `<workflow>:<event id>`, so a retried send is never delivered twice. */
  idempotencyKey: string;
};

export interface NotificationTransport {
  send(notification: Notification): Promise<void>;
}

export function knockTransport(secretApiKey: string): NotificationTransport {
  const knock = new Knock({ apiKey: secretApiKey });
  return {
    async send(notification) {
      await knock.workflows.trigger(
        notification.workflow,
        {
          recipients: notification.recipients,
          actor: notification.actor,
          data: notification.data,
        },
        { idempotencyKey: notification.idempotencyKey }
      );
    },
  };
}

export function outboxTransport(directory: string): NotificationTransport {
  return {
    async send(notification) {
      mkdirSync(directory, { recursive: true });
      const file = join(
        directory,
        `${Date.now()}-${notification.idempotencyKey.replace(/[^\w-]/g, "_")}.json`
      );
      writeFileSync(file, JSON.stringify(notification, null, 2));
    },
  };
}

/** A transport for tests: keeps every Notification it is given in `sent`. */
export function recordingTransport(): NotificationTransport & {
  sent: Notification[];
} {
  const sent: Notification[] = [];
  return {
    sent,
    async send(notification) {
      sent.push(notification);
    },
  };
}

let replacement: NotificationTransport | undefined;

/**
 * Replaces the transport route actions send through. Pass `undefined` to go
 * back to Knock or the outbox.
 */
export function setNotificationTransport(
  transport: NotificationTransport | undefined
) {
  replacement = transport;
}

function defaultTransport(): NotificationTransport {
  if (replacement) return replacement;
  const secretApiKey = process.env.KNOCK_SECRET_API_KEY;
  return secretApiKey
    ? knockTransport(secretApiKey)
    : outboxTransport(join(".outbox", "notifications"));
}

/** Sends each Notification on its own. A failure is logged and dropped. */
export async function sendNotifications(
  notifications: Notification[],
  transport: NotificationTransport = defaultTransport()
): Promise<void> {
  for (const notification of notifications) {
    try {
      await transport.send(notification);
    } catch (error) {
      console.error(
        `Dropped the ${notification.workflow} Notification (${notification.idempotencyKey}):`,
        error
      );
    }
  }
}
