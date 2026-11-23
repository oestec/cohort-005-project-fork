import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { count, countDistinct, desc, eq, inArray, sql } from "drizzle-orm";
import * as schema from "~/db/schema";
import {
  categories,
  CourseStatus,
  courses,
  lessons,
  modules,
  users,
} from "~/db/schema";

export type Db = BetterSQLite3Database<typeof schema>;

export const FEATURED_COURSE_LIMIT = 3;

export type FeaturedCourse = {
  id: number;
  title: string;
  slug: string;
  description: string;
  coverImageUrl: string | null;
  instructorName: string;
  categoryName: string;
  lessonCount: number;
};

export type CatalogueStats = {
  courses: number;
  lessons: number;
  instructors: number;
  categories: number;
};

export type LandingPage = {
  featuredCourses: FeaturedCourse[];
  stats: CatalogueStats;
};

export function getLandingPage(db: Db): LandingPage {
  return {
    featuredCourses: getFeaturedCourses(db),
    stats: getCatalogueStats(db),
  };
}

function getFeaturedCourses(db: Db): FeaturedCourse[] {
  const newest = db
    .select({
      id: courses.id,
      title: courses.title,
      slug: courses.slug,
      description: courses.description,
      coverImageUrl: courses.coverImageUrl,
      instructorName: users.name,
      categoryName: categories.name,
    })
    .from(courses)
    .innerJoin(users, eq(courses.instructorId, users.id))
    .innerJoin(categories, eq(courses.categoryId, categories.id))
    .where(eq(courses.status, CourseStatus.Published))
    .orderBy(desc(courses.createdAt), desc(courses.id))
    .limit(FEATURED_COURSE_LIMIT)
    .all();

  const lessonCounts = countLessonsByCourse(
    db,
    newest.map((course) => course.id)
  );
  return newest.map((course) => ({
    ...course,
    lessonCount: lessonCounts.get(course.id) ?? 0,
  }));
}

function countLessonsByCourse(db: Db, courseIds: number[]) {
  const rows = db
    .select({ courseId: modules.courseId, count: sql<number>`count(*)` })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(inArray(modules.courseId, courseIds))
    .groupBy(modules.courseId)
    .all();
  return new Map(rows.map((row) => [row.courseId, row.count]));
}

function getCatalogueStats(db: Db): CatalogueStats {
  const [stats] = db
    .select({
      courses: countDistinct(courses.id),
      lessons: count(lessons.id),
      instructors: countDistinct(courses.instructorId),
      categories: countDistinct(courses.categoryId),
    })
    .from(courses)
    .leftJoin(modules, eq(modules.courseId, courses.id))
    .leftJoin(lessons, eq(lessons.moduleId, modules.id))
    .where(eq(courses.status, CourseStatus.Published))
    .all();
  return stats;
}
