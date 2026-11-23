import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { CourseStatus, UserRole } from "~/db/schema";
import { markdown } from "~/lib/text";
import { createLanding, FEATURED_COURSE_LIMIT } from "../index.server";

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
});

// ─── Fixtures ───
// The landing module only reads, so it has no function to arrange through:
// rows go in directly. Kept in one place so a schema change touches only
// this block.

let counter = 0;

function addInstructor(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase().replaceAll(" ", ".")}@example.com`,
      role: UserRole.Instructor,
    })
    .returning()
    .get();
}

function addCategory(name: string) {
  counter += 1;
  return db
    .insert(schema.categories)
    .values({ name, slug: `category-${counter}` })
    .returning()
    .get();
}

function addCourse(
  title: string,
  options: {
    status?: CourseStatus;
    createdAt?: string;
    instructorId?: number;
    categoryId?: number;
  } = {}
) {
  counter += 1;
  return db
    .insert(schema.courses)
    .values({
      title,
      slug: `course-${counter}`,
      description: `About ${title}`,
      salesCopy: markdown(title),
      instructorId: options.instructorId ?? base.instructor.id,
      categoryId: options.categoryId ?? base.category.id,
      status: options.status ?? CourseStatus.Published,
      createdAt: options.createdAt,
    })
    .returning()
    .get();
}

function addLessons(courseId: number, count: number) {
  const mod = db
    .insert(schema.modules)
    .values({ courseId, title: "Module", position: 1 })
    .returning()
    .get();
  for (let position = 1; position <= count; position += 1) {
    db.insert(schema.lessons)
      .values({ moduleId: mod.id, title: `Lesson ${position}`, position })
      .run();
  }
}

function get() {
  return createLanding(db).get();
}

describe("featured courses", () => {
  it("lists the newest published courses first, up to the limit", () => {
    db.update(schema.courses).set({ status: CourseStatus.Archived }).run();
    addCourse("Oldest", { createdAt: "2026-01-01T00:00:00.000Z" });
    addCourse("Newest", { createdAt: "2026-04-01T00:00:00.000Z" });
    addCourse("Middle", { createdAt: "2026-03-01T00:00:00.000Z" });
    addCourse("Older", { createdAt: "2026-02-01T00:00:00.000Z" });

    const titles = get().featuredCourses.map((course) => course.title);

    expect(FEATURED_COURSE_LIMIT).toBe(3);
    expect(titles).toEqual(["Newest", "Middle", "Older"]);
  });

  it("leaves out draft and archived courses", () => {
    addCourse("Draft", { status: CourseStatus.Draft });
    addCourse("Archived", { status: CourseStatus.Archived });

    const titles = get().featuredCourses.map((course) => course.title);

    expect(titles).toEqual(["Test Course"]);
  });

  it("gives each course its own lesson count, across modules", () => {
    const busy = addCourse("Busy", { createdAt: "2026-05-01T00:00:00.000Z" });
    addLessons(busy.id, 2);
    addLessons(busy.id, 3);
    addLessons(base.course.id, 1);

    const counts = Object.fromEntries(
      get().featuredCourses.map((course) => [course.title, course.lessonCount])
    );

    expect(counts).toEqual({ Busy: 5, "Test Course": 1 });
  });

  it("gives a course with no lessons a count of zero", () => {
    expect(get().featuredCourses[0].lessonCount).toBe(0);
  });

  it("names the instructor and category", () => {
    expect(get().featuredCourses[0]).toMatchObject({
      title: "Test Course",
      slug: "test-course",
      description: "A test course",
      coverImageUrl: null,
      instructorName: "Test Instructor",
      categoryName: "Programming",
    });
  });

  it("is empty when nothing is published", () => {
    db.update(schema.courses).set({ status: CourseStatus.Draft }).run();

    expect(get().featuredCourses).toEqual([]);
  });
});

describe("catalogue stats", () => {
  it("counts published courses, their lessons, instructors and categories", () => {
    const other = addInstructor("Olive Other");
    const design = addCategory("Design");
    const second = addCourse("Second", {
      instructorId: other.id,
      categoryId: design.id,
    });
    addCourse("Third");
    addLessons(base.course.id, 4);
    addLessons(second.id, 2);

    expect(get().stats).toEqual({
      courses: 3,
      lessons: 6,
      instructors: 2,
      categories: 2,
    });
  });

  it("does not count anything that belongs only to an unpublished course", () => {
    const other = addInstructor("Dora Draft");
    const empty = addCategory("Unused");
    const draft = addCourse("Draft", {
      status: CourseStatus.Draft,
      instructorId: other.id,
      categoryId: empty.id,
    });
    addLessons(draft.id, 7);
    addLessons(base.course.id, 1);

    expect(get().stats).toEqual({
      courses: 1,
      lessons: 1,
      instructors: 1,
      categories: 1,
    });
  });

  it("counts every published course, beyond the featured few", () => {
    for (let i = 0; i < 60; i += 1) addCourse(`Course ${i}`);

    const page = get();

    expect(page.stats.courses).toBe(61);
    expect(page.featuredCourses).toHaveLength(FEATURED_COURSE_LIMIT);
  });

  it("is all zeros when nothing is published", () => {
    db.update(schema.courses).set({ status: CourseStatus.Archived }).run();

    expect(get().stats).toEqual({
      courses: 0,
      lessons: 0,
      instructors: 0,
      categories: 0,
    });
  });
});
