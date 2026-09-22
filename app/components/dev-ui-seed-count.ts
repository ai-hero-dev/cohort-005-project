import { db } from "~/db";
import { users } from "~/db/schema";

/** How many users the seed put in the database. */
export function countSeededUsers(): number {
  return db.select({ id: users.id }).from(users).all().length;
}
