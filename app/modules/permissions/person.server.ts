import { db } from "~/db";
import {
  getPerson,
  requireInstructorOrPlatformAdmin,
  requirePerson,
  requirePlatformAdmin,
  type Db,
} from "./lib/person";

export type { Person, PersonRole } from "./lib/person";

/**
 * The Person entry point bound to a database. The app uses `people`, which
 * reads the app database; tests build their own against a test database.
 */
export function createPeople(database: Db) {
  return {
    /**
     * Who is making this request: a Person, or null when signed out or when
     * the session points at a deleted user. Never throws.
     */
    getPerson(request: Request) {
      return getPerson(database, request);
    },

    /**
     * The Person making this request. Throws 401 ("Select a user from the
     * DevUI panel.") when there is none.
     */
    requirePerson(request: Request) {
      return requirePerson(database, request);
    },

    /**
     * The Person making this request, who must be a Platform Admin. Throws
     * 401 when signed out and 403 for anyone else.
     */
    requirePlatformAdmin(request: Request) {
      return requirePlatformAdmin(database, request);
    },

    /**
     * The Person making this request, who must be an Instructor or a
     * Platform Admin. Throws 401 when signed out, 403 otherwise.
     */
    requireInstructorOrPlatformAdmin(request: Request) {
      return requireInstructorOrPlatformAdmin(database, request);
    },
  };
}

// Pure so a route importing this only for its loader doesn't pull the
// database into the client bundle (see `~/db`).
export const people = /* @__PURE__ */ createPeople(db);
