import { db } from "~/db";
import { getLandingPage, type Db } from "./lib/landing";

export type {
  CatalogueStats,
  FeaturedCourse,
  LandingPage,
} from "./lib/landing";
export { FEATURED_COURSE_LIMIT } from "./lib/landing";

/**
 * The landing page's data bound to a database. The app uses `landing`, which
 * reads the app database; tests build their own against a test database.
 */
export function createLanding(database: Db) {
  return {
    /**
     * The newest published courses, each with its lesson count, and the
     * catalogue's totals. Only published courses count: a draft or archived
     * course, its lessons, its instructor and its category are left out.
     */
    get() {
      return getLandingPage(database);
    },
  };
}

// Pure so a route importing this only for its loader doesn't pull the
// database into the client bundle (see `~/db`).
export const landing = /* @__PURE__ */ createLanding(db);
