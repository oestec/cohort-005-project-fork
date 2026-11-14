import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { outboxTransport, sendNotifications } from "./notifier.server";

describe("sendNotifications", () => {
  it("writes each Notification to the outbox when there is no Knock secret key", async () => {
    const directory = mkdtempSync(join(tmpdir(), "notifications-"));

    await sendNotifications(
      [
        {
          workflow: "refund-request-decided",
          recipients: [{ id: "2", name: "Liam", email: "liam@example.com" }],
          actor: { id: "1", name: "Ada", email: "ada@example.com" },
          data: { courseTitle: "TypeScript", amount: "$79.00" },
          idempotencyKey: "refund-request-decided:7",
        },
      ],
      outboxTransport(directory)
    );

    const files = readdirSync(directory);
    expect(files).toHaveLength(1);
    const written = JSON.parse(
      readFileSync(join(directory, files[0] ?? ""), "utf8")
    );
    expect(written).toEqual({
      workflow: "refund-request-decided",
      recipients: [{ id: "2", name: "Liam", email: "liam@example.com" }],
      actor: { id: "1", name: "Ada", email: "ada@example.com" },
      data: { courseTitle: "TypeScript", amount: "$79.00" },
      idempotencyKey: "refund-request-decided:7",
    });
  });
});
