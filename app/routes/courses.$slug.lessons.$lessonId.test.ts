import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("~/db", () => import("~/test/test-db"));

import { db } from "~/db";
import { resetTestDb } from "~/test/test-db";
import {
  categories,
  comments,
  courses,
  CourseStatus,
  enrollments,
  lessons,
  modules,
  UserRole,
  users,
} from "~/db/schema";
import { eq } from "drizzle-orm";
import { setCurrentUserId } from "~/lib/session";
import {
  recordingTransport,
  setNotificationTransport,
} from "~/lib/notifier.server";
import { action } from "./courses.$slug.lessons.$lessonId";

// ─── Fixtures ───

function createUser(name: string, role: UserRole) {
  return db
    .insert(users)
    .values({ name, email: `${name.toLowerCase()}@example.com`, role })
    .returning()
    .get();
}

/** Ines teaches TypeScript; its one lesson is "Narrowing". */
function createCourse() {
  const instructor = createUser("Ines", UserRole.Instructor);
  const category = db
    .insert(categories)
    .values({ name: "Programming", slug: "programming" })
    .returning()
    .get();
  const course = db
    .insert(courses)
    .values({
      title: "TypeScript",
      slug: "typescript",
      description: "A course.",
      salesCopy: "Buy it.",
      instructorId: instructor.id,
      categoryId: category.id,
      status: CourseStatus.Published,
      price: 0,
    })
    .returning()
    .get();
  const courseModule = db
    .insert(modules)
    .values({ courseId: course.id, title: "Module 1", position: 1 })
    .returning()
    .get();
  const lesson = db
    .insert(lessons)
    .values({ moduleId: courseModule.id, title: "Narrowing", position: 1 })
    .returning()
    .get();
  return { instructor, course, lesson };
}

function enrol(userId: number, courseId: number) {
  db.insert(enrollments).values({ userId, courseId }).run();
}

/** Ines's TypeScript course, with Liam enrolled as a Student. */
function liamIsTakingTypeScript() {
  const { instructor, course, lesson } = createCourse();
  const liam = createUser("Liam", UserRole.Student);
  enrol(liam.id, course.id);
  return { instructor, course, lesson, liam };
}

async function postAs(
  userId: number,
  lessonId: number,
  form: Record<string, string>
) {
  const setCookie = await setCurrentUserId(
    new Request("http://localhost/"),
    userId
  );
  const url = `http://localhost/courses/typescript/lessons/${lessonId}`;
  return new Request(url, {
    method: "POST",
    headers: new Headers({
      "CF-IPCountry": "US",
      Cookie: setCookie.split(";")[0] ?? "",
    }),
    body: new URLSearchParams(form),
  });
}

type ActionArgs = Parameters<typeof action>[0];

async function comment(
  userId: number,
  lessonId: number,
  form: Record<string, string>
) {
  const request = await postAs(userId, lessonId, form);
  return action({
    request,
    url: new URL(request.url),
    params: { slug: "typescript", lessonId: String(lessonId) },
    context: {},
  } as unknown as ActionArgs);
}

function ask(userId: number, lessonId: number, body: string) {
  return comment(userId, lessonId, { intent: "create-comment", body });
}

function commentsOn(lessonId: number) {
  return db
    .select()
    .from(comments)
    .where(eq(comments.lessonId, lessonId))
    .all();
}

// ─── Tests ───

let notifications: ReturnType<typeof recordingTransport>;

describe("commenting on a lesson", () => {
  beforeEach(() => {
    resetTestDb();
    notifications = recordingTransport();
    setNotificationTransport(notifications);
  });

  afterEach(() => {
    setNotificationTransport(undefined);
  });

  describe("a Student's Question", () => {
    it("notifies the course's Instructor", async () => {
      const { instructor, lesson, liam } = liamIsTakingTypeScript();

      const result = await ask(liam.id, lesson.id, "  Why does `in` narrow?  ");

      expect(result).toEqual({ ok: true });
      const [question] = commentsOn(lesson.id);
      expect(question).toMatchObject({
        userId: liam.id,
        parentId: null,
        body: "Why does `in` narrow?",
      });
      expect(notifications.sent).toEqual([
        {
          workflow: "question-asked",
          recipients: [
            {
              id: String(instructor.id),
              name: "Ines",
              email: "ines@example.com",
            },
          ],
          actor: {
            id: String(liam.id),
            name: "Liam",
            email: "liam@example.com",
          },
          data: {
            url: "/instructor/questions",
            askerName: "Liam",
            lessonTitle: "Narrowing",
            courseTitle: "TypeScript",
            excerpt: "Why does `in` narrow?",
          },
          idempotencyKey: `question-asked:${question?.id}`,
        },
      ]);
    });

    it("cuts a long Question to a 140-character excerpt", async () => {
      const { lesson, liam } = liamIsTakingTypeScript();

      await ask(liam.id, lesson.id, "a".repeat(400));

      expect(notifications.sent).toHaveLength(1);
      expect(notifications.sent[0]?.data.excerpt).toBe(`${"a".repeat(139)}…`);
      expect(commentsOn(lesson.id)[0]?.body).toBe("a".repeat(400));
    });

    it("still posts the Question when the Notification cannot be sent", async () => {
      const { lesson, liam } = liamIsTakingTypeScript();
      setNotificationTransport({
        async send() {
          throw new Error("Knock is down.");
        },
      });
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = await ask(liam.id, lesson.id, "Why does `in` narrow?");

      expect(result).toEqual({ ok: true });
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
      expect(commentsOn(lesson.id)).toHaveLength(1);
    });
  });

  describe("comments that are not Questions", () => {
    it("sends nothing for the Instructor's own comment on their lesson", async () => {
      const { instructor, lesson } = liamIsTakingTypeScript();

      const result = await ask(instructor.id, lesson.id, "Welcome, everyone!");

      expect(result).toEqual({ ok: true });
      expect(commentsOn(lesson.id)).toHaveLength(1);
      expect(notifications.sent).toEqual([]);
    });

    it("sends nothing for a Platform Admin's comment, as the Questions inbox skips it", async () => {
      const { lesson } = liamIsTakingTypeScript();
      const ada = createUser("Ada", UserRole.Admin);

      const result = await ask(ada.id, lesson.id, "Is this lesson current?");

      expect(result).toEqual({ ok: true });
      expect(commentsOn(lesson.id)).toHaveLength(1);
      expect(notifications.sent).toEqual([]);
    });

    it("sends nothing for a reply", async () => {
      const { course, lesson, liam } = liamIsTakingTypeScript();
      const maya = createUser("Maya", UserRole.Student);
      enrol(maya.id, course.id);
      await ask(liam.id, lesson.id, "Why does `in` narrow?");
      const [question] = commentsOn(lesson.id);
      notifications.sent.length = 0;

      const result = await comment(maya.id, lesson.id, {
        intent: "create-comment",
        body: "I wondered that too.",
        parentId: String(question?.id),
      });

      expect(result).toEqual({ ok: true });
      expect(commentsOn(lesson.id)).toHaveLength(2);
      expect(notifications.sent).toEqual([]);
    });

    it("sends nothing when a Question is edited", async () => {
      const { lesson, liam } = liamIsTakingTypeScript();
      await ask(liam.id, lesson.id, "Why does `in` narrow?");
      const [question] = commentsOn(lesson.id);
      notifications.sent.length = 0;

      const result = await comment(liam.id, lesson.id, {
        intent: "edit-comment",
        commentId: String(question?.id),
        body: "Why does `in` narrow a union?",
      });

      expect(result).toEqual({ ok: true });
      expect(commentsOn(lesson.id)[0]?.body).toBe(
        "Why does `in` narrow a union?"
      );
      expect(notifications.sent).toEqual([]);
    });
  });

  describe("comments that are not posted", () => {
    it("sends nothing for an empty Question", async () => {
      const { lesson, liam } = liamIsTakingTypeScript();

      const result = await ask(liam.id, lesson.id, "   ");

      expect(result).toEqual({ ok: false, error: "Comment cannot be empty" });
      expect(commentsOn(lesson.id)).toEqual([]);
      expect(notifications.sent).toEqual([]);
    });

    it("sends nothing when the reply's parent is itself a reply", async () => {
      const { instructor, lesson, liam } = liamIsTakingTypeScript();
      await ask(liam.id, lesson.id, "Why does `in` narrow?");
      const [question] = commentsOn(lesson.id);
      await comment(instructor.id, lesson.id, {
        intent: "create-comment",
        body: "Because of the discriminant.",
        parentId: String(question?.id),
      });
      const reply = commentsOn(lesson.id).find((c) => c.parentId !== null);
      notifications.sent.length = 0;

      const result = await comment(liam.id, lesson.id, {
        intent: "create-comment",
        body: "Thanks!",
        parentId: String(reply?.id),
      });

      expect(result).toEqual({
        ok: false,
        error: "Replies can only be one level deep",
      });
      expect(commentsOn(lesson.id)).toHaveLength(2);
      expect(notifications.sent).toEqual([]);
    });

    it("sends nothing when someone who is not enrolled asks", async () => {
      const { lesson } = liamIsTakingTypeScript();
      const stranger = createUser("Sam", UserRole.Student);

      await expect(
        ask(stranger.id, lesson.id, "Can I see this?")
      ).rejects.toMatchObject({ init: { status: 403 } });

      expect(commentsOn(lesson.id)).toEqual([]);
      expect(notifications.sent).toEqual([]);
    });
  });
});
