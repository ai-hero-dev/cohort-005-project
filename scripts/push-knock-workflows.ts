// Pushes and commits every Notification workflow to Knock through the
// Management API, so no workflow has to be built by hand in the dashboard.
// Each workflow is one in-app feed step on the Cadence feed channel, in its
// preference category. Safe to re-run: it overwrites what is there, including
// a workflow in the wrong category.
//
//   npm run knock:push-workflows                          # Development
//   npm run knock:push-workflows -- --promote production  # then promote
//
// Needs KNOCK_SERVICE_TOKEN (Dashboard → account settings → Service tokens)
// and KNOCK_FEED_CHANNEL_ID in .env. Runs under tsx, so it loads .env itself.

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NotificationKind } from "../app/lib/notification-feed";
import { KNOCK_WORKFLOWS } from "../app/lib/notifications.knock.server";

/**
 * The feed body Knock stores per workflow. Cadence writes the row itself from
 * the trigger data, so these only show in Knock's dashboard and previews.
 */
const TEMPLATES: Record<NotificationKind, { name: string; body: string }> = {
  "discussion-reply": {
    name: "Discussion Reply",
    body: "**{{ actor.name }}** replied to your question in {{ data.lessonTitle }}",
  },
  "discussion-question": {
    name: "Discussion Question",
    body: "**{{ actor.name }}** asked a question in {{ data.lessonTitle }}",
  },
  "seat-claimed": {
    name: "Seat claimed",
    body: "**{{ actor.name }}** claimed a seat on {{ data.courseTitle }}. {{ data.seatsLeft }} left.",
  },
  "new-enrollment": {
    name: "New Enrollment",
    body: "**{{ actor.name }}** enrolled in {{ data.courseTitle }}.",
  },
  "refund-requested": {
    name: "Refund Request received",
    body: "We are reviewing your {{ data.amount }} refund request for {{ data.courseTitle }}.",
  },
  "refund-request-open": {
    name: "Open Refund Request",
    body: "**{{ data.buyerName }}** asked for a {{ data.amount }} refund on {{ data.courseTitle }}.",
  },
  "refund-approved": {
    name: "Refund approved",
    body: "Your refund for {{ data.courseTitle }} was approved.",
  },
  "refund-declined": {
    name: "Refund declined",
    body: "Your refund for {{ data.courseTitle }} was declined.",
  },
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const token = process.env.KNOCK_SERVICE_TOKEN;
const channelId = process.env.KNOCK_FEED_CHANNEL_ID;
if (!token || !channelId) {
  console.error(
    "KNOCK_SERVICE_TOKEN and KNOCK_FEED_CHANNEL_ID must be set (in .env or the environment)."
  );
  process.exit(1);
}

const promoteFlag = process.argv.indexOf("--promote");
const promoteTo = promoteFlag === -1 ? null : process.argv[promoteFlag + 1];
if (promoteFlag !== -1 && !promoteTo) {
  console.error("--promote needs an environment slug, e.g. production.");
  process.exit(1);
}

async function mapi(
  method: "GET" | "PUT",
  pathname: string,
  query: Record<string, string> = {},
  body?: unknown
) {
  const url = new URL(`https://control.knock.app/v1${pathname}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${pathname} → ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

const whoami = await mapi("GET", "/whoami");
console.log(`Knock account: ${whoami.account_name}`);

// Steps name a channel by key; .env holds the feed channel's id.
const channels: { entries: { id: string; key: string }[] } = await mapi(
  "GET",
  "/channels",
  { limit: "100" }
);
const channel = channels.entries.find((c) => c.id === channelId);
if (!channel) {
  console.error(`No Knock channel has the id ${channelId} (KNOCK_FEED_CHANNEL_ID).`);
  process.exit(1);
}

// A workflow's category must already be in the project's catalog. Creating
// one that exists returns it unchanged.
for (const categoryKey of new Set(KNOCK_WORKFLOWS.map((w) => w.categoryKey))) {
  await mapi("PUT", `/preference_categories/${categoryKey}`);
}

for (const { kind, key, categoryKey } of KNOCK_WORKFLOWS) {
  const { name, body } = TEMPLATES[kind];
  await mapi(
    "PUT",
    `/workflows/${key}`,
    {
      environment: "development",
      commit: "true",
      commit_message: `Push ${key} from scripts/push-knock-workflows.ts`,
    },
    {
      workflow: {
        name,
        categories: [categoryKey],
        steps: [
          {
            type: "channel",
            ref: "in_app_feed_1",
            channel_key: channel.key,
            // Knock requires an action_url; Cadence builds click targets from
            // the trigger data, so this is the dashboard's default.
            template: { markdown_body: body, action_url: "{{ vars.app_url }}" },
          },
        ],
      },
    }
  );
  console.log(`✓ ${key} (${categoryKey})`);
}

if (promoteTo) {
  await mapi("PUT", "/commits/promote", { to_environment: promoteTo });
  console.log(`✓ promoted every commit to ${promoteTo}`);
}
