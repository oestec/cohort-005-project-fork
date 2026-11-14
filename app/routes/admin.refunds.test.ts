import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("~/db", () => import("~/test/test-db"));

import { db } from "~/db";
import { resetTestDb } from "~/test/test-db";
import {
  categories,
  coupons,
  courses,
  CourseStatus,
  enrollments,
  lessonProgress,
  LessonProgressStatus,
  lessons,
  modules,
  purchases,
  refunds,
  RefundStatus,
  teams,
  UserRole,
  users,
  videoWatchEvents,
} from "~/db/schema";
import { eq } from "drizzle-orm";
import { setCurrentUserId } from "~/lib/session";
import { getAccess } from "~/lib/access.server";
import { action, loader } from "./admin.refunds";
import {
  action as redeemAction,
  loader as redeemLoader,
} from "./redeem.$code";

// ─── Fixtures ───

function createUser(name: string, role: UserRole) {
  return db
    .insert(users)
    .values({ name, email: `${name.toLowerCase()}@example.com`, role })
    .returning()
    .get();
}

function createCourse(title: string, lessonCount: number) {
  const instructor = createUser(`${title}Instructor`, UserRole.Instructor);
  const category = db
    .insert(categories)
    .values({ name: `${title} category`, slug: `${title}-category` })
    .returning()
    .get();
  const course = db
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
  const courseModule = db
    .insert(modules)
    .values({ courseId: course.id, title: "Module 1", position: 1 })
    .returning()
    .get();
  const lessonIds = Array.from({ length: lessonCount }, (_, index) => {
    return db
      .insert(lessons)
      .values({
        moduleId: courseModule.id,
        title: `Lesson ${index + 1}`,
        position: index + 1,
      })
      .returning()
      .get().id;
  });
  return { course, lessonIds };
}

function buyCourse(
  userId: number,
  courseId: number,
  amountPaid: number,
  createdAt: string
) {
  const purchase = db
    .insert(purchases)
    .values({ userId, courseId, amountPaid, country: "US", createdAt })
    .returning()
    .get();
  db.insert(enrollments).values({ userId, courseId }).run();
  return purchase;
}

function raiseRefundRequest(
  purchaseId: number,
  reason: string,
  requestedAt: string
) {
  return db
    .insert(refunds)
    .values({ purchaseId, reason, requestedAt, status: RefundStatus.Open })
    .returning()
    .get();
}

function completeLesson(userId: number, lessonId: number) {
  db.insert(lessonProgress)
    .values({
      userId,
      lessonId,
      status: LessonProgressStatus.Completed,
      completedAt: new Date().toISOString(),
    })
    .run();
}

function watchUpTo(userId: number, lessonId: number, positionSeconds: number) {
  db.insert(videoWatchEvents)
    .values({ userId, lessonId, eventType: "progress", positionSeconds })
    .run();
}

async function requestAs(userId: number | null) {
  const headers = new Headers({ "CF-IPCountry": "US" });
  if (userId !== null) {
    const setCookie = await setCurrentUserId(
      new Request("http://localhost/"),
      userId
    );
    headers.set("Cookie", setCookie.split(";")[0] ?? "");
  }
  return new Request("http://localhost/admin/refunds", { headers });
}

async function postAs(userId: number, form: Record<string, string>) {
  const { headers } = await requestAs(userId);
  return new Request("http://localhost/admin/refunds", {
    method: "POST",
    headers,
    body: new URLSearchParams(form),
  });
}

type LoaderArgs = Parameters<typeof loader>[0];
type ActionArgs = Parameters<typeof action>[0];

function actionArgs(request: Request) {
  return {
    request,
    url: new URL(request.url),
    params: {},
    context: {},
  } as unknown as ActionArgs;
}

/** Sets up Liam, who bought TypeScript and has one Open Refund Request. */
function liamWantsHisMoneyBack() {
  const admin = createUser("Ada", UserRole.Admin);
  const liam = createUser("Liam", UserRole.Student);
  const { course, lessonIds } = createCourse("TypeScript", 2);
  const purchase = buyCourse(
    liam.id,
    course.id,
    7900,
    "2026-11-01T10:00:00.000Z"
  );
  const refundRequest = raiseRefundRequest(
    purchase.id,
    "It was not what I expected.",
    "2026-11-03T09:00:00.000Z"
  );
  return { admin, liam, course, lessonIds, purchase, refundRequest };
}

function loaderArgs(request: Request) {
  return {
    request,
    url: new URL(request.url),
    params: {},
    context: {},
  } as unknown as LoaderArgs;
}

// ─── Tests ───

describe("/admin/refunds", () => {
  beforeEach(() => {
    resetTestDb();
  });

  describe("the list of Open Refund Requests", () => {
    it("shows an admin each Open Refund Request with the learner's progress", async () => {
      const admin = createUser("Ada", UserRole.Admin);
      const liam = createUser("Liam", UserRole.Student);
      const { course, lessonIds } = createCourse("TypeScript", 4);
      const purchase = buyCourse(
        liam.id,
        course.id,
        7900,
        "2026-11-01T10:00:00.000Z"
      );
      const [firstLesson, secondLesson] = lessonIds;
      if (firstLesson === undefined || secondLesson === undefined) {
        throw new Error("The course should have lessons.");
      }
      completeLesson(liam.id, firstLesson);
      watchUpTo(liam.id, firstLesson, 300);
      watchUpTo(liam.id, firstLesson, 600);
      watchUpTo(liam.id, secondLesson, 120);
      const refundRequest = raiseRefundRequest(
        purchase.id,
        "It was not what I expected.",
        "2026-11-03T09:00:00.000Z"
      );

      const result = await loader(loaderArgs(await requestAs(admin.id)));

      expect(result.refundRequests).toEqual([
        {
          id: refundRequest.id,
          status: RefundStatus.Open,
          buyerName: "Liam",
          buyerEmail: "liam@example.com",
          courseTitle: "TypeScript",
          courseSlug: "typescript",
          amountPaid: 7900,
          purchasedAt: "2026-11-01T10:00:00.000Z",
          requestedAt: "2026-11-03T09:00:00.000Z",
          daysSincePurchase: expect.any(Number),
          reason: "It was not what I expected.",
          decisionNote: null,
          resolvedAt: null,
          decidedByName: null,
          figures: {
            kind: "individual_purchase",
            lessonsCompleted: 1,
            lessonCount: 4,
            secondsWatched: 720,
          },
          ruleBreaks: [],
          canApprove: true,
        },
      ]);
    });

    it("lists only undecided requests, oldest first", async () => {
      const admin = createUser("Ada", UserRole.Admin);
      const liam = createUser("Liam", UserRole.Student);
      const mia = createUser("Mia", UserRole.Student);
      const { course } = createCourse("TypeScript", 1);
      const liamsPurchase = buyCourse(
        liam.id,
        course.id,
        7900,
        "2026-11-01T10:00:00.000Z"
      );
      const miasPurchase = buyCourse(
        mia.id,
        course.id,
        7900,
        "2026-11-01T11:00:00.000Z"
      );
      const declined = raiseRefundRequest(
        liamsPurchase.id,
        "Changed my mind.",
        "2026-11-02T09:00:00.000Z"
      );
      db.update(refunds)
        .set({ status: RefundStatus.Declined })
        .where(eq(refunds.id, declined.id))
        .run();
      const newer = raiseRefundRequest(
        liamsPurchase.id,
        "Still want my money back.",
        "2026-11-05T09:00:00.000Z"
      );
      const older = raiseRefundRequest(
        miasPurchase.id,
        "Too basic for me.",
        "2026-11-04T09:00:00.000Z"
      );

      const result = await loader(loaderArgs(await requestAs(admin.id)));

      expect(result.refundRequests.map((request) => request.id)).toEqual([
        older.id,
        newer.id,
      ]);
    });

    it("turns away anyone who is not an admin", async () => {
      const liam = createUser("Liam", UserRole.Student);
      const ivy = createUser("Ivy", UserRole.Instructor);

      await expect(
        loader(loaderArgs(await requestAs(null)))
      ).rejects.toMatchObject({ init: { status: 401 } });
      await expect(
        loader(loaderArgs(await requestAs(liam.id)))
      ).rejects.toMatchObject({ init: { status: 403 } });
      await expect(
        loader(loaderArgs(await requestAs(ivy.id)))
      ).rejects.toMatchObject({ init: { status: 403 } });
    });
  });

  describe("approving an Open Refund Request", () => {
    it("ends the learner's access and takes the request off the list", async () => {
      const { admin, liam, course, refundRequest } = liamWantsHisMoneyBack();

      await action(
        actionArgs(
          await postAs(admin.id, {
            intent: "approve",
            refundRequestId: String(refundRequest.id),
          })
        )
      );

      const access = await getAccess(await requestAs(liam.id), course.id);
      expect(access.enrolled).toBe(false);
      expect(access.canViewContent).toBe(false);
      const list = await loader(loaderArgs(await requestAs(admin.id)));
      expect(list.refundRequests).toEqual([]);
    });

    it("records the full amount, who decided and when, and keeps the learner's progress", async () => {
      const { admin, liam, lessonIds, refundRequest } = liamWantsHisMoneyBack();
      const [firstLesson] = lessonIds;
      if (firstLesson === undefined)
        throw new Error("The course should have lessons.");
      completeLesson(liam.id, firstLesson);
      watchUpTo(liam.id, firstLesson, 600);
      const before = new Date().toISOString();

      await action(
        actionArgs(
          await postAs(admin.id, {
            intent: "approve",
            refundRequestId: String(refundRequest.id),
          })
        )
      );

      // No screen shows these yet, so read them straight from the database.
      const decided = db
        .select()
        .from(refunds)
        .where(eq(refunds.id, refundRequest.id))
        .get();
      expect(decided).toMatchObject({
        status: RefundStatus.Approved,
        amountRefunded: 7900,
        resolvedByUserId: admin.id,
      });
      expect(decided?.resolvedAt ?? "").toBeTruthy();
      expect((decided?.resolvedAt ?? "") >= before).toBe(true);
      expect(
        db
          .select()
          .from(lessonProgress)
          .where(eq(lessonProgress.userId, liam.id))
          .all()
      ).toHaveLength(1);
      expect(
        db
          .select()
          .from(videoWatchEvents)
          .where(eq(videoWatchEvents.userId, liam.id))
          .all()
      ).toHaveLength(1);
    });

    it("stops anyone claiming the unclaimed seats of a team purchase", async () => {
      const admin = createUser("Ada", UserRole.Admin);
      const manager = createUser("Maya", UserRole.Student);
      const teammate = createUser("Theo", UserRole.Student);
      const { course } = createCourse("TypeScript", 1);
      // A team purchase does not enroll the buyer; it hands out seat coupons.
      const purchase = db
        .insert(purchases)
        .values({
          userId: manager.id,
          courseId: course.id,
          amountPaid: 15800,
          country: "US",
          createdAt: "2026-11-01T10:00:00.000Z",
        })
        .returning()
        .get();
      const team = db.insert(teams).values({}).returning().get();
      db.insert(coupons)
        .values({
          teamId: team.id,
          courseId: course.id,
          code: "SEAT-ONE",
          purchaseId: purchase.id,
        })
        .run();
      const refundRequest = raiseRefundRequest(
        purchase.id,
        "The team no longer needs it.",
        "2026-11-03T09:00:00.000Z"
      );

      await action(
        actionArgs(
          await postAs(admin.id, {
            intent: "approve",
            refundRequestId: String(refundRequest.id),
          })
        )
      );

      const seatPage = await redeemLoader({
        request: await requestAs(teammate.id),
        params: { code: "SEAT-ONE" },
        context: {},
      } as unknown as Parameters<typeof redeemLoader>[0]);
      expect(seatPage.unavailableReason).toMatch(/no longer available/);

      const { headers } = await requestAs(teammate.id);
      const claim = await redeemAction({
        request: new Request("http://localhost/redeem/SEAT-ONE", {
          method: "POST",
          headers,
          body: new URLSearchParams({ intent: "confirm-redeem" }),
        }),
        params: { code: "SEAT-ONE" },
        context: {},
      } as unknown as Parameters<typeof redeemAction>[0]);
      expect(claim).toMatchObject({ init: { status: 400 } });
      expect(
        db.select().from(coupons).where(eq(coupons.code, "SEAT-ONE")).get()
      ).toMatchObject({ redeemedByUserId: null });
    });
  });

  describe("declining an Open Refund Request", () => {
    it("takes the request off the list and leaves the learner's access alone", async () => {
      const { admin, liam, course, refundRequest } = liamWantsHisMoneyBack();

      await action(
        actionArgs(
          await postAs(admin.id, {
            intent: "decline",
            refundRequestId: String(refundRequest.id),
            note: "You have already watched most of it.",
          })
        )
      );

      const access = await getAccess(await requestAs(liam.id), course.id);
      expect(access.enrolled).toBe(true);
      expect(access.canViewContent).toBe(true);
      const list = await loader(loaderArgs(await requestAs(admin.id)));
      expect(list.refundRequests).toEqual([]);
      // No screen shows these yet, so read them straight from the database.
      const decided = db
        .select()
        .from(refunds)
        .where(eq(refunds.id, refundRequest.id))
        .get();
      expect(decided).toMatchObject({
        status: RefundStatus.Declined,
        amountRefunded: null,
        resolvedByUserId: admin.id,
        decisionNote: "You have already watched most of it.",
      });
      expect(decided?.resolvedAt ?? "").toBeTruthy();
    });
  });

  describe("guarding the decision", () => {
    it("turns away anyone who is not an admin and changes nothing", async () => {
      const { admin, liam, course, refundRequest } = liamWantsHisMoneyBack();

      await expect(
        action(
          actionArgs(
            await postAs(liam.id, {
              intent: "approve",
              refundRequestId: String(refundRequest.id),
            })
          )
        )
      ).rejects.toMatchObject({ init: { status: 403 } });

      const access = await getAccess(await requestAs(liam.id), course.id);
      expect(access.enrolled).toBe(true);
      const list = await loader(loaderArgs(await requestAs(admin.id)));
      expect(list.refundRequests.map((request) => request.id)).toEqual([
        refundRequest.id,
      ]);
    });

    it("refuses to decide a request that has already been decided", async () => {
      const { admin, liam, course, refundRequest } = liamWantsHisMoneyBack();
      const otherAdmin = createUser("Grace", UserRole.Admin);
      await action(
        actionArgs(
          await postAs(admin.id, {
            intent: "decline",
            refundRequestId: String(refundRequest.id),
            note: "You have already watched most of it.",
          })
        )
      );

      // The first decision wins; the second admin is told, not thrown at.
      const second = await action(
        actionArgs(
          await postAs(otherAdmin.id, {
            intent: "approve",
            refundRequestId: String(refundRequest.id),
          })
        )
      );
      expect(second).toMatchObject({
        init: { status: 409 },
        data: { error: "This refund request was already declined." },
      });

      const access = await getAccess(await requestAs(liam.id), course.id);
      expect(access.enrolled).toBe(true);
    });
  });
});
