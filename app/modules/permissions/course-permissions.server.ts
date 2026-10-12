import { db } from "~/db";
import type { Db, Person } from "./lib/person";
import {
  decide,
  getCourseDecisions,
  requireCapability,
  type Capability,
  type CourseRef,
} from "./lib/course-permissions";

export type {
  Capability,
  Course,
  CourseDecisions,
  CourseRef,
  Decision,
  DenialReason,
} from "./lib/course-permissions";

/**
 * The course permissions entry point bound to a database. The app uses
 * `coursePermissions`, which reads the app database; tests build their own
 * against a test database.
 *
 * Capabilities:
 * - view: the owning Instructor, a Platform Admin, or an Enrollment not under
 *   Country Lock.
 * - take: an Enrollment not under Country Lock. No exemption for the owning
 *   Instructor or Platform Admins.
 * - manage: the owning Instructor (whatever their role) or a Platform Admin.
 */
export function createCoursePermissions(database: Db) {
  return {
    /**
     * May this Person (or nobody) view, take or manage the course? Synchronous
     * and never throws. Gives `{ found: false }` when the course doesn't
     * exist, an id is malformed, or a lesson or module named alongside it
     * isn't in that course.
     */
    decide(person: Person | null, courseRef: CourseRef) {
      return decide(database, person, courseRef);
    },

    /**
     * Every decision for the Person making this request, without throwing.
     * For pages that choose what to show, like the lesson page.
     */
    getCourseDecisions(request: Request, courseRef: CourseRef) {
      return getCourseDecisions(database, request, courseRef);
    },

    /**
     * Refuses unless the Person making this request has the capability.
     * Throws 404 (course not found), then 401 (signed out), then 403.
     * Returns the Person and the course.
     */
    requireCapability(
      request: Request,
      capability: Capability,
      courseRef: CourseRef
    ) {
      return requireCapability(database, request, capability, courseRef);
    },
  };
}

// Pure so a route importing this only for its loader doesn't pull the
// database into the client bundle (see `~/db`).
export const coursePermissions = /* @__PURE__ */ createCoursePermissions(db);
