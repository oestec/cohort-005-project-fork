import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("~/db", () => import("~/test/test-db"));

import { db } from "~/db";
import { getSqlite, resetTestDb } from "~/test/test-db";
import {
  categories,
  coupons,
  courses,
  CourseStatus,
  enrollments,
  purchases,
  refunds,
  RefundStatus,
  teamMembers,
  TeamMemberRole,
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
import { action } from "./redeem.$code";

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

/** A Team Admin buys a Team Licence for a course, with one Seat per code. */
function buyTeamLicence(
  teamAdminId: number,
  courseId: number,
  seatCodes: string[],
  country = "US"
) {
  const purchase = db
    .insert(purchases)
    .values({
      userId: teamAdminId,
      courseId,
      amountPaid: 7900 * seatCodes.length,
      country,
      createdAt: "2026-11-01T10:00:00.000Z",
    })
    .returning()
    .get();
  const team = db.insert(teams).values({}).returning().get();
  db.insert(teamMembers)
    .values({
      teamId: team.id,
      userId: teamAdminId,
      role: TeamMemberRole.Admin,
    })
    .run();
  const seats = seatCodes.map((code) =>
    db
      .insert(coupons)
      .values({ teamId: team.id, courseId, code, purchaseId: purchase.id })
      .returning()
      .get()
  );
  return { purchase, team, seats };
}

/** Maya runs a team with a three-Seat Team Licence for TypeScript. */
function mayasTeam() {
  const maya = createUser("Maya", UserRole.Student);
  const liam = createUser("Liam", UserRole.Student);
  const course = createCourse("TypeScript");
  const licence = buyTeamLicence(maya.id, course.id, [
    "SEAT-ONE",
    "SEAT-TWO",
    "SEAT-THREE",
  ]);
  return { maya, liam, course, ...licence };
}

async function claimAs(userId: number, code: string, country = "US") {
  const headers = new Headers({ "CF-IPCountry": country });
  const setCookie = await setCurrentUserId(
    new Request("http://localhost/"),
    userId
  );
  headers.set("Cookie", setCookie.split(";")[0] ?? "");
  const request = new Request(`http://localhost/redeem/${code}`, {
    method: "POST",
    headers,
    body: new URLSearchParams({ intent: "confirm-redeem" }),
  });
  try {
    return await action({
      request,
      params: { code },
      context: {},
    } as unknown as Parameters<typeof action>[0]);
  } catch (thrown) {
    // A successful claim redirects by throwing a Response.
    if (thrown instanceof Response) return thrown;
    throw thrown;
  }
}

function seat(code: string) {
  return db.select().from(coupons).where(eq(coupons.code, code)).get();
}

function enrollmentsOf(userId: number) {
  return db
    .select()
    .from(enrollments)
    .where(eq(enrollments.userId, userId))
    .all();
}

// ─── Tests ───

let notifications: ReturnType<typeof recordingTransport>;

describe("/redeem/:code", () => {
  beforeEach(() => {
    resetTestDb();
    notifications = recordingTransport();
    setNotificationTransport(notifications);
  });

  afterEach(() => {
    setNotificationTransport(undefined);
    vi.restoreAllMocks();
  });

  describe("a Student claiming a Seat", () => {
    it("tells the Team Admin how many Seats are now claimed", async () => {
      const { maya, liam, seats } = mayasTeam();
      const theo = createUser("Theo", UserRole.Student);
      await claimAs(theo.id, "SEAT-ONE");
      notifications.sent.length = 0;

      await claimAs(liam.id, "SEAT-TWO");

      expect(notifications.sent).toEqual([
        {
          workflow: "seat-claimed",
          recipients: [
            { id: String(maya.id), name: "Maya", email: "maya@example.com" },
          ],
          actor: {
            id: String(liam.id),
            name: "Liam",
            email: "liam@example.com",
          },
          data: {
            url: "/team",
            studentName: "Liam",
            courseTitle: "TypeScript",
            claimedCount: 2,
            seatCount: 3,
          },
          idempotencyKey: `seat-claimed:${seats[1]?.id}`,
        },
      ]);
    });

    it("enrolls the Student and sends them to the welcome page", async () => {
      const { liam, course } = mayasTeam();

      const response = await claimAs(liam.id, "SEAT-TWO");

      expect(response).toBeInstanceOf(Response);
      expect((response as Response).headers.get("Location")).toBe(
        "/courses/typescript/welcome"
      );
      expect(seat("SEAT-TWO")).toMatchObject({ redeemedByUserId: liam.id });
      expect(enrollmentsOf(liam.id)).toMatchObject([{ courseId: course.id }]);
    });
  });

  describe("a Team Admin claiming a Seat on their own Team Licence", () => {
    it("enrolls them and notifies nobody", async () => {
      const { maya, course } = mayasTeam();

      await claimAs(maya.id, "SEAT-ONE");

      expect(seat("SEAT-ONE")).toMatchObject({ redeemedByUserId: maya.id });
      expect(enrollmentsOf(maya.id)).toMatchObject([{ courseId: course.id }]);
      expect(notifications.sent).toEqual([]);
    });
  });

  describe("a claim that fails", () => {
    async function expectRefused(
      userId: number,
      code: string,
      error: RegExp,
      country = "US"
    ) {
      const before = seat(code);
      const enrollmentsBefore = enrollmentsOf(userId);

      const response = await claimAs(userId, code, country);

      expect(response).toMatchObject({
        data: { error: expect.stringMatching(error) },
        init: { status: 400 },
      });
      expect(seat(code)).toEqual(before);
      expect(enrollmentsOf(userId)).toEqual(enrollmentsBefore);
      expect(notifications.sent).toEqual([]);
    }

    it("refuses a Seat on hold while its Team Licence has an Open Refund Request", async () => {
      const { liam, purchase } = mayasTeam();
      db.insert(refunds)
        .values({
          purchaseId: purchase.id,
          reason: "We no longer need it.",
          requestedAt: "2026-11-03T09:00:00.000Z",
          status: RefundStatus.Open,
        })
        .run();

      await expectRefused(liam.id, "SEAT-ONE", /can't be claimed right now/);
    });

    it("refuses a refunded Seat", async () => {
      const { liam } = mayasTeam();
      db.update(coupons)
        .set({ refundedAt: "2026-11-04T09:00:00.000Z" })
        .where(eq(coupons.code, "SEAT-ONE"))
        .run();

      await expectRefused(liam.id, "SEAT-ONE", /no longer available/);
    });

    it("refuses a Seat someone has already claimed", async () => {
      const { liam } = mayasTeam();
      const theo = createUser("Theo", UserRole.Student);
      await claimAs(theo.id, "SEAT-ONE");
      notifications.sent.length = 0;

      await expectRefused(liam.id, "SEAT-ONE", /already been claimed/);
    });

    it("refuses a Student already enrolled on the course", async () => {
      const { liam, course } = mayasTeam();
      db.insert(enrollments)
        .values({ userId: liam.id, courseId: course.id })
        .run();

      await expectRefused(liam.id, "SEAT-ONE", /already enrolled/);
    });

    it("refuses a Student in a different country from the Team Admin's purchase", async () => {
      const { liam } = mayasTeam();

      await expectRefused(liam.id, "SEAT-ONE", /same country/, "GB");
    });
  });

  describe("the claim's writes", () => {
    it("leave the Seat unclaimed when the Enrollment can't be written", async () => {
      const { liam, course } = mayasTeam();
      // The database refuses the Enrollment after the Seat update has run.
      getSqlite().exec(`
        CREATE TRIGGER refuse_enrollment BEFORE INSERT ON enrollments
        BEGIN SELECT RAISE(ABORT, 'enrollments are down'); END;
      `);

      await expect(claimAs(liam.id, "SEAT-ONE")).rejects.toThrow(
        /enrollments are down/
      );

      expect(seat("SEAT-ONE")).toMatchObject({
        redeemedByUserId: null,
        redeemedAt: null,
      });
      expect(
        db
          .select()
          .from(enrollments)
          .where(eq(enrollments.courseId, course.id))
          .all()
      ).toEqual([]);
      expect(notifications.sent).toEqual([]);
    });
  });

  describe("when the Notification transport is down", () => {
    it("still claims the Seat", async () => {
      const { liam, course } = mayasTeam();
      setNotificationTransport({
        async send() {
          throw new Error("Knock is down");
        },
      });
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});

      const response = await claimAs(liam.id, "SEAT-ONE");

      expect((response as Response).headers.get("Location")).toBe(
        "/courses/typescript/welcome"
      );
      expect(seat("SEAT-ONE")).toMatchObject({ redeemedByUserId: liam.id });
      expect(enrollmentsOf(liam.id)).toMatchObject([{ courseId: course.id }]);
      expect(logged).toHaveBeenCalled();
    });
  });
});
