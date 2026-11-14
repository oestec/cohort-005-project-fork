import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("~/db", () => import("~/test/test-db"));
// The buyer's confirmation email is not what these tests are about.
vi.mock("~/lib/mailer.server", () => ({ sendEmail: async () => {} }));

import { db } from "~/db";
import { resetTestDb } from "~/test/test-db";
import {
  categories,
  coupons,
  courses,
  CourseStatus,
  enrollments,
  purchases,
  refunds,
  RefundStatus,
  teams,
  UserRole,
  users,
} from "~/db/schema";
import { eq } from "drizzle-orm";
import { setCurrentUserId } from "~/lib/session";
import {
  recordingTransport,
  setNotificationTransport,
} from "~/lib/notifier.server";
import { action } from "./courses.$slug.refund";

// ─── Fixtures ───

function createUser(name: string, role: UserRole) {
  return db
    .insert(users)
    .values({ name, email: `${name.toLowerCase()}@example.com`, role })
    .returning()
    .get();
}

function createCourse(title: string) {
  const instructor = createUser(`${title}Instructor`, UserRole.Instructor);
  const category = db
    .insert(categories)
    .values({ name: `${title} category`, slug: `${title}-category` })
    .returning()
    .get();
  return db
    .insert(courses)
    .values({
      title,
      slug: title.toLowerCase(),
      description: "A course.",
      salesCopy: "Buy it.",
      instructorId: instructor.id,
      categoryId: category.id,
      status: CourseStatus.Published,
      price: 7900,
    })
    .returning()
    .get();
}

/** An Individual Purchase made today, so it is inside the refund window. */
function buyCourse(userId: number, courseId: number, amountPaid: number) {
  const purchase = db
    .insert(purchases)
    .values({
      userId,
      courseId,
      amountPaid,
      country: "US",
      createdAt: new Date().toISOString(),
    })
    .returning()
    .get();
  db.insert(enrollments).values({ userId, courseId }).run();
  return purchase;
}

/** A Team Licence bought today, with one Unclaimed Seat. */
function buyTeamLicence(userId: number, courseId: number, amountPaid: number) {
  const purchase = db
    .insert(purchases)
    .values({
      userId,
      courseId,
      amountPaid,
      country: "US",
      createdAt: new Date().toISOString(),
    })
    .returning()
    .get();
  const team = db.insert(teams).values({}).returning().get();
  db.insert(coupons)
    .values({
      teamId: team.id,
      courseId,
      code: `SEAT-${purchase.id}`,
      purchaseId: purchase.id,
    })
    .run();
  return purchase;
}

async function postAs(userId: number, slug: string, purchaseId: number) {
  const setCookie = await setCurrentUserId(
    new Request("http://localhost/"),
    userId
  );
  const request = new Request(`http://localhost/courses/${slug}/refund`, {
    method: "POST",
    headers: { Cookie: setCookie.split(";")[0] ?? "", "CF-IPCountry": "US" },
    body: new URLSearchParams({
      purchaseId: String(purchaseId),
      reason: "It was not what I expected.",
    }),
  });
  return action({
    request,
    url: new URL(request.url),
    params: { slug },
    context: {},
  } as unknown as Parameters<typeof action>[0]);
}

function refundRequestsFor(purchaseId: number) {
  // No screen shows the id, so read it straight from the database.
  return db
    .select()
    .from(refunds)
    .where(eq(refunds.purchaseId, purchaseId))
    .all();
}

// ─── Tests ───

let notifications: ReturnType<typeof recordingTransport>;

describe("/courses/:slug/refund", () => {
  beforeEach(() => {
    resetTestDb();
    notifications = recordingTransport();
    setNotificationTransport(notifications);
  });

  afterEach(() => {
    setNotificationTransport(undefined);
  });

  describe("telling the Platform Admins about a new Refund Request", () => {
    it("notifies every Platform Admin about an Individual Purchase", async () => {
      const ada = createUser("Ada", UserRole.Admin);
      const grace = createUser("Grace", UserRole.Admin);
      createUser("Ivy", UserRole.Instructor);
      const liam = createUser("Liam", UserRole.Student);
      const course = createCourse("TypeScript");
      const purchase = buyCourse(liam.id, course.id, 7900);

      await postAs(liam.id, "typescript", purchase.id);

      const [refundRequest] = refundRequestsFor(purchase.id);
      expect(notifications.sent).toEqual([
        {
          workflow: "refund-request-raised",
          recipients: [
            { id: String(ada.id), name: "Ada", email: "ada@example.com" },
            { id: String(grace.id), name: "Grace", email: "grace@example.com" },
          ],
          actor: {
            id: String(liam.id),
            name: "Liam",
            email: "liam@example.com",
          },
          data: {
            url: "/admin/refunds?status=open",
            buyerName: "Liam",
            courseTitle: "TypeScript",
            amount: "$79.00",
            purchaseKind: "individual_purchase",
          },
          idempotencyKey: `refund-request-raised:${refundRequest?.id}`,
        },
      ]);
    });

    it("notifies the Platform Admins about a Team Licence", async () => {
      const ada = createUser("Ada", UserRole.Admin);
      const maya = createUser("Maya", UserRole.Student);
      const course = createCourse("TypeScript");
      const purchase = buyTeamLicence(maya.id, course.id, 15800);

      const response = await postAs(maya.id, "typescript", purchase.id);

      expect(response).toMatchObject({ status: 302 });
      expect(notifications.sent).toEqual([
        expect.objectContaining({
          workflow: "refund-request-raised",
          recipients: [
            { id: String(ada.id), name: "Ada", email: "ada@example.com" },
          ],
          data: {
            url: "/admin/refunds?status=open",
            buyerName: "Maya",
            courseTitle: "TypeScript",
            amount: "$158.00",
            purchaseKind: "team_licence",
          },
        }),
      ]);
    });

    it("does not tell a Platform Admin about their own Refund Request", async () => {
      const ada = createUser("Ada", UserRole.Admin);
      const grace = createUser("Grace", UserRole.Admin);
      const course = createCourse("TypeScript");
      const purchase = buyCourse(ada.id, course.id, 7900);

      await postAs(ada.id, "typescript", purchase.id);

      expect(notifications.sent).toEqual([
        expect.objectContaining({
          recipients: [
            { id: String(grace.id), name: "Grace", email: "grace@example.com" },
          ],
          actor: { id: String(ada.id), name: "Ada", email: "ada@example.com" },
        }),
      ]);
    });

    it("notifies the Platform Admins again about a new request after a decline", async () => {
      createUser("Ada", UserRole.Admin);
      const liam = createUser("Liam", UserRole.Student);
      const course = createCourse("TypeScript");
      const purchase = buyCourse(liam.id, course.id, 7900);
      await postAs(liam.id, "typescript", purchase.id);
      const [first] = refundRequestsFor(purchase.id);
      if (!first) throw new Error("The first request should exist.");
      db.update(refunds)
        .set({ status: RefundStatus.Declined, decisionNote: "Not yet." })
        .where(eq(refunds.id, first.id))
        .run();

      await postAs(liam.id, "typescript", purchase.id);

      const second = refundRequestsFor(purchase.id).find(
        (request) => request.id !== first.id
      );
      expect(notifications.sent.map((sent) => sent.idempotencyKey)).toEqual([
        `refund-request-raised:${first.id}`,
        `refund-request-raised:${second?.id}`,
      ]);
    });

    it("sends nothing when the request cannot be raised", async () => {
      createUser("Ada", UserRole.Admin);
      const liam = createUser("Liam", UserRole.Student);
      const mia = createUser("Mia", UserRole.Student);
      const course = createCourse("TypeScript");
      const purchase = buyCourse(liam.id, course.id, 7900);
      const lapsed = db
        .insert(purchases)
        .values({
          userId: liam.id,
          courseId: course.id,
          amountPaid: 7900,
          country: "US",
          createdAt: "2020-01-01T10:00:00.000Z",
        })
        .returning()
        .get();

      // Not found: Mia did not buy it.
      await expect(
        postAs(mia.id, "typescript", purchase.id)
      ).rejects.toMatchObject({ init: { status: 404 } });
      // Rule broken: the window closed long ago.
      await expect(
        postAs(liam.id, "typescript", lapsed.id)
      ).rejects.toMatchObject({ init: { status: 403 } });
      // Invalid: no reason given.
      const setCookie = await setCurrentUserId(
        new Request("http://localhost/"),
        liam.id
      );
      const invalid = new Request(
        "http://localhost/courses/typescript/refund",
        {
          method: "POST",
          headers: { Cookie: setCookie.split(";")[0] ?? "" },
          body: new URLSearchParams({
            purchaseId: String(purchase.id),
            reason: "",
          }),
        }
      );
      expect(
        await action({
          request: invalid,
          url: new URL(invalid.url),
          params: { slug: "typescript" },
          context: {},
        } as unknown as Parameters<typeof action>[0])
      ).toMatchObject({ init: { status: 400 } });
      expect(notifications.sent).toEqual([]);

      // Already open: only the first request notifies.
      await postAs(liam.id, "typescript", purchase.id);
      await expect(
        postAs(liam.id, "typescript", purchase.id)
      ).rejects.toMatchObject({ init: { status: 409 } });
      expect(notifications.sent).toHaveLength(1);
    });

    it("still raises the request when the Notification cannot be sent", async () => {
      createUser("Ada", UserRole.Admin);
      const liam = createUser("Liam", UserRole.Student);
      const course = createCourse("TypeScript");
      const purchase = buyCourse(liam.id, course.id, 7900);
      setNotificationTransport({
        async send() {
          throw new Error("Knock is down.");
        },
      });
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const response = await postAs(liam.id, "typescript", purchase.id);

      expect(response).toMatchObject({ status: 302 });
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
      expect(refundRequestsFor(purchase.id)).toEqual([
        expect.objectContaining({ status: RefundStatus.Open }),
      ]);
    });
  });
});
