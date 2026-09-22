import { db } from "~/db";
import { users } from "~/db/schema";

/**
 * How many users the seed put in the database.
 *
 * Server only — this reads `data.db`. Do not call it from the browser.
 */
export function countSeededUsers(): number {
  return db.select({ id: users.id }).from(users).all().length;
}
