import { data } from "react-router";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "~/db/schema";
import { UserRole, users } from "~/db/schema";
import { resolveCountry } from "~/lib/country.server";
import { getCurrentUserId } from "~/lib/session";

export type Db = BetterSQLite3Database<typeof schema>;

export type PersonRole = "student" | "instructor" | "platform-admin";

export type Person = {
  id: number;
  role: PersonRole;
  country: string | null;
};

const ROLES: Record<UserRole, PersonRole> = {
  [UserRole.Student]: "student",
  [UserRole.Instructor]: "instructor",
  [UserRole.Admin]: "platform-admin",
};

export async function getPerson(
  db: Db,
  request: Request
): Promise<Person | null> {
  const userId = await getCurrentUserId(request);
  if (userId === null) return null;

  const user = db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!user) return null;

  return {
    id: user.id,
    role: ROLES[user.role],
    country: await resolveCountry(request),
  };
}

/** The one 401 wording: every signed-out refusal says this. */
export const SIGNED_OUT_MESSAGE = "Select a user from the DevUI panel.";

export async function requirePerson(db: Db, request: Request): Promise<Person> {
  const person = await getPerson(db, request);
  if (!person) throw data(SIGNED_OUT_MESSAGE, { status: 401 });
  return person;
}
