import { and, eq, isNull, ne } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import * as schema from "~/db/schema";
import {
  comments,
  courses,
  lessons,
  modules,
  users,
  UserRole,
} from "~/db/schema";
import { MAX_COMMENT_LENGTH, MIN_COMMENT_LENGTH } from "~/lib/comments";
import type { Notification, NotificationPerson } from "~/lib/notifier.server";

// ─── Lesson comments ───
// Posting a comment on a lesson. A top-level comment from anyone but the
// course's Instructor or a Platform Admin is a Question (see GLOSSARY.md), and
// the Instructor is notified of it. The route sends the returned Notifications after the write.
//
// Every function takes the database first, so tests can hand in an in-memory
// one. Uses positional parameters (project convention).

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;

type Comment = typeof comments.$inferSelect;

/** How much of a Question the Instructor sees in their Notification. */
export const QUESTION_EXCERPT_LENGTH = 140;

export type CreateCommentResult =
  | { ok: true; comment: Comment; notifications: Notification[] }
  | { ok: false; error: string };

export function createComment(
  db: Db,
  userId: number,
  lessonId: number,
  parentId: number | null,
  body: string
): CreateCommentResult {
  const trimmed = body.trim();
  if (trimmed.length < MIN_COMMENT_LENGTH) {
    return { ok: false, error: "Comment cannot be empty" };
  }
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    return {
      ok: false,
      error: `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer`,
    };
  }

  return db.transaction((tx): CreateCommentResult => {
    const lesson = tx
      .select({
        lessonTitle: lessons.title,
        courseTitle: courses.title,
        instructorId: courses.instructorId,
      })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .innerJoin(courses, eq(modules.courseId, courses.id))
      .where(eq(lessons.id, lessonId))
      .get();
    if (!lesson) {
      return { ok: false, error: "Lesson not found" };
    }

    if (parentId !== null) {
      const parent = tx
        .select()
        .from(comments)
        .where(eq(comments.id, parentId))
        .get();
      if (!parent) {
        return { ok: false, error: "Parent comment not found" };
      }
      if (parent.lessonId !== lessonId) {
        return {
          ok: false,
          error: "Parent comment belongs to a different lesson",
        };
      }
      if (parent.parentId !== null) {
        return { ok: false, error: "Replies can only be one level deep" };
      }
    }

    const comment = tx
      .insert(comments)
      .values({ userId, lessonId, parentId, body: trimmed })
      .returning()
      .get();

    return {
      ok: true,
      comment,
      notifications: buildQuestionNotifications(tx, comment, lesson),
    };
  });
}

function asNotificationPerson(
  db: Queryable,
  userId: number
): NotificationPerson | null {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return null;
  return { id: String(user.id), name: user.name, email: user.email };
}

/**
 * Whether a comment is a Question: live, top-level, and by neither a Platform
 * Admin nor the course's Instructor. The one rule shared by the Instructor's
 * Questions inbox and the New Question Notification, so the Notification never
 * points at a Question the inbox hides.
 *
 * Use it in a query that joins `comments` to its `author` (a users table or an
 * alias of it) and to `courses` through the comment's lesson.
 */
export function isQuestion(author: { role: AnySQLiteColumn }) {
  return and(
    isNull(comments.parentId),
    isNull(comments.deletedAt),
    ne(author.role, UserRole.Admin),
    ne(comments.userId, courses.instructorId)
  );
}

/**
 * The New Question Notification for the course's Instructor. Only a Question
 * counts: a reply, or a comment by staff, sends nothing.
 */
function buildQuestionNotifications(
  db: Queryable,
  comment: Comment,
  lesson: { lessonTitle: string; courseTitle: string; instructorId: number }
): Notification[] {
  const question = db
    .select({ id: comments.id })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .innerJoin(lessons, eq(comments.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(and(eq(comments.id, comment.id), isQuestion(users)))
    .get();
  if (!question) return [];

  const asker = asNotificationPerson(db, comment.userId);
  const instructor = asNotificationPerson(db, lesson.instructorId);
  if (!asker || !instructor) return [];

  return [
    {
      workflow: "question-asked",
      recipients: [instructor],
      actor: asker,
      data: {
        url: "/instructor/questions",
        askerName: asker.name,
        lessonTitle: lesson.lessonTitle,
        courseTitle: lesson.courseTitle,
        excerpt: excerptOf(comment.body),
      },
      idempotencyKey: `question-asked:${comment.id}`,
    },
  ];
}

function excerptOf(body: string) {
  if (body.length <= QUESTION_EXCERPT_LENGTH) return body;
  return `${body.slice(0, QUESTION_EXCERPT_LENGTH - 1).trimEnd()}…`;
}
