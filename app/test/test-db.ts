import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "~/db/schema";

// A stand-in for `~/db` in tests: an in-memory database with every migration
// applied. Swap it in with `vi.mock("~/db", () => import("~/test/test-db"))`
// and call `resetTestDb()` in `beforeEach` to start each test from empty.

type TestDb = ReturnType<typeof drizzle<typeof schema>>;

let connection: Database.Database | undefined;
let instance: TestDb | undefined;

export function resetTestDb() {
  connection?.close();
  connection = new Database(":memory:");
  connection.pragma("foreign_keys = ON");
  instance = drizzle(connection, { schema });
  migrate(instance, { migrationsFolder: "drizzle" });
}

function current() {
  if (!instance) resetTestDb();
  if (!instance) throw new Error("The test database failed to open.");
  return instance;
}

export function getSqlite() {
  current();
  if (!connection) throw new Error("The test database failed to open.");
  return connection;
}

export const db = new Proxy({} as TestDb, {
  get(_target, prop) {
    const target = current();
    const value = Reflect.get(target, prop);
    return typeof value === "function" ? value.bind(target) : value;
  },
});
