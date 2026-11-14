import { and, count, eq, isNotNull } from "drizzle-orm";
import {
  coupons,
  courses,
  enrollments,
  purchases,
  teamMembers,
  TeamMemberRole,
  users,
} from "~/db/schema";
import type { Notification, NotificationPerson } from "~/lib/notifier.server";
import { getSeatAvailability, type Db } from "~/lib/refunds.server";

// ─── Seats ───
// A Student claiming a Seat on a Team Licence. See GLOSSARY.md for the
// language. Takes the database first, so tests can hand in an in-memory one.

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Seat = typeof coupons.$inferSelect;
type Enrollment = typeof enrollments.$inferSelect;

export const SEAT_ON_HOLD =
  "This seat can't be claimed right now. Ask the person who shared it with you.";
export const SEAT_REFUNDED =
  "This seat is no longer available. Ask the person who shared it with you.";

export type ClaimResult =
  | { ok: true; enrollment: Enrollment; notifications: Notification[] }
  | { ok: false; error: string };

/**
 * Claims the Seat with this code for a Student and enrolls them. The claim and
 * the Enrollment land together or not at all. Returns the Seat claimed
 * Notification for the Team Admin, for the caller to send after the commit.
 */
export function claimSeat(
  db: Db,
  code: string,
  studentId: number,
  studentCountry: string,
  now: Date
): ClaimResult {
  return db.transaction((tx): ClaimResult => {
    const seat = tx.select().from(coupons).where(eq(coupons.code, code)).get();
    if (!seat) {
      return { ok: false, error: "Coupon not found" };
    }

    if (seat.redeemedByUserId !== null) {
      return { ok: false, error: "Coupon has already been redeemed" };
    }

    const availability = getSeatAvailability(tx, seat);
    if (availability === "on_hold") {
      return { ok: false, error: SEAT_ON_HOLD };
    }
    if (availability === "refunded") {
      return { ok: false, error: SEAT_REFUNDED };
    }

    const existingEnrollment = tx
      .select()
      .from(enrollments)
      .where(
        and(
          eq(enrollments.userId, studentId),
          eq(enrollments.courseId, seat.courseId)
        )
      )
      .get();
    if (existingEnrollment) {
      return { ok: false, error: "You are already enrolled in this course" };
    }

    const purchase = tx
      .select()
      .from(purchases)
      .where(eq(purchases.id, seat.purchaseId))
      .get();
    if (purchase?.country && purchase.country !== studentCountry) {
      return {
        ok: false,
        error:
          "This coupon can only be redeemed from the same country as the purchaser",
      };
    }

    tx.update(coupons)
      .set({ redeemedByUserId: studentId, redeemedAt: now.toISOString() })
      .where(eq(coupons.id, seat.id))
      .run();

    const enrollment = tx
      .insert(enrollments)
      .values({ userId: studentId, courseId: seat.courseId })
      .returning()
      .get();

    return {
      ok: true,
      enrollment,
      notifications: buildSeatClaimedNotifications(tx, seat, studentId),
    };
  });
}

function asNotificationPerson(
  db: Tx,
  userId: number
): NotificationPerson | null {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return null;
  return { id: String(user.id), name: user.name, email: user.email };
}

/**
 * The Seat claimed Notification for the Team Admin, with the Team Licence's
 * claimed and total Seat counts (this claim included). A Team Admin claiming a
 * Seat on their own Team Licence is not told what they did.
 */
function buildSeatClaimedNotifications(
  tx: Tx,
  seat: Seat,
  studentId: number
): Notification[] {
  const teamAdmin = tx
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.teamId, seat.teamId),
        eq(teamMembers.role, TeamMemberRole.Admin)
      )
    )
    .get();
  if (!teamAdmin || teamAdmin.userId === studentId) return [];

  const recipient = asNotificationPerson(tx, teamAdmin.userId);
  const student = asNotificationPerson(tx, studentId);
  const course = tx
    .select()
    .from(courses)
    .where(eq(courses.id, seat.courseId))
    .get();
  if (!recipient || !student || !course) return [];

  const seatCount =
    tx
      .select({ n: count() })
      .from(coupons)
      .where(eq(coupons.purchaseId, seat.purchaseId))
      .get()?.n ?? 0;
  const claimedCount =
    tx
      .select({ n: count() })
      .from(coupons)
      .where(
        and(
          eq(coupons.purchaseId, seat.purchaseId),
          isNotNull(coupons.redeemedAt)
        )
      )
      .get()?.n ?? 0;

  return [
    {
      workflow: "seat-claimed",
      recipients: [recipient],
      actor: student,
      data: {
        url: "/team",
        studentName: student.name,
        courseTitle: course.title,
        claimedCount,
        seatCount,
      },
      idempotencyKey: `seat-claimed:${seat.id}`,
    },
  ];
}
