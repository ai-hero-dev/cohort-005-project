// One-off backfill: syncs every existing Cadence user to Knock (name, email,
// avatar) and writes the default preference set for anyone who has none yet.
// Safe to re-run: existing preference sets are left alone.
//
//   npm run knock:sync-users              # every user in data.db
//   npm run knock:sync-users -- --user 12 # just user 12
//
// Runs under tsx, not Vite, so it loads .env itself.

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../app/db/schema";
import { defaultNotifications } from "../app/lib/notifications.server";
import {
  syncAllUsers,
  syncUser,
} from "../app/lib/notification-preferences.server";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

if (!process.env.KNOCK_SECRET_API_KEY) {
  console.error("KNOCK_SECRET_API_KEY is not set (in .env or the environment).");
  process.exit(1);
}

const userFlag = process.argv.indexOf("--user");
const onlyUserId = userFlag === -1 ? null : Number(process.argv[userFlag + 1]);
if (onlyUserId !== null && !Number.isInteger(onlyUserId)) {
  console.error("--user needs a numeric user id.");
  process.exit(1);
}

const db = drizzle(new Database(path.join(root, "data.db")), { schema });
const notifications = await defaultNotifications();

if (onlyUserId === null) {
  const count = await syncAllUsers(db, notifications);
  console.log(`Synced ${count} users to Knock.`);
} else {
  const user = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, onlyUserId))
    .get();
  if (!user) {
    console.error(`No user with id ${onlyUserId}.`);
    process.exit(1);
  }
  await syncUser(notifications, user);
  console.log(`Synced user ${user.id} (${user.email}) to Knock.`);
}
