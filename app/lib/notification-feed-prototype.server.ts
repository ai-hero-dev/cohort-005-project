// PROTOTYPE — throwaway, for "What does the Notification Feed look like in
// Cadence?" (ai-hero-dev/cohort-005-project#19). prototype/notification-feed only.
//
// Only two workflows exist in Knock Development (discussion-reply,
// new-enrollment), so every seeded Notification rides the discussion-reply
// workflow and carries its catalogue kind in `data.kind`. The feed UI renders
// from `data`, not from Knock's rendered template.
import Knock, { signUserToken } from "@knocklabs/node";
import { and, eq, ne } from "drizzle-orm";
import { db } from "~/db";
import { courses, lessons, modules, users } from "~/db/schema";

if (!process.env.KNOCK_SECRET_API_KEY) {
  // Vite doesn't put non-VITE_ vars on process.env, so load .env ourselves.
  process.loadEnvFile(".env");
}

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`PROTOTYPE: ${name} missing from .env`);
  return value;
}

const knock = new Knock({ apiKey: env("KNOCK_SECRET_API_KEY") });

export async function getNotificationFeedConfig(cadenceUserId: number) {
  return {
    knockUserId: String(cadenceUserId),
    userToken: await signUserToken(String(cadenceUserId), {
      signingKey: env("KNOCK_SIGNING_KEY"),
      expiresInSeconds: 60 * 60,
    }),
    publicApiKey: env("KNOCK_PUBLIC_API_KEY"),
    feedChannelId: env("KNOCK_FEED_CHANNEL_ID"),
  };
}

export type NotificationKind =
  | "refund-request-confirmed"
  | "refund-request-approved"
  | "refund-request-declined"
  | "open-refund-request"
  | "seat-claimed"
  | "new-enrollment"
  | "discussion-question"
  | "discussion-reply";

// Seeds one of each catalogue Notification into *my* feed, as if someone else
// caused it, so every variant has a realistic mix to render.
export async function seedMyFeed(cadenceUserId: number, count: number) {
  const me = db.select().from(users).where(eq(users.id, cadenceUserId)).get()!;
  const other =
    db.select().from(users).where(ne(users.id, cadenceUserId)).get() ?? me;
  const lesson = db
    .select({
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      courseId: courses.id,
      courseTitle: courses.title,
      courseSlug: courses.slug,
    })
    .from(lessons)
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, and(eq(courses.id, modules.courseId)))
    .get()!;

  const course = {
    courseTitle: lesson.courseTitle,
    courseUrl: `/courses/${lesson.courseSlug}`,
  };
  const lessonUrl = `/courses/${lesson.courseSlug}/lessons/${lesson.lessonId}`;

  const seeds: { kind: NotificationKind; data: Record<string, unknown> }[] = [
    {
      kind: "discussion-reply",
      data: {
        ...course,
        lessonTitle: lesson.lessonTitle,
        snippet:
          "Good question! You can use a discriminated union here so the compiler narrows for you.",
        // Most specific place: the reply itself, not just the lesson.
        url: `${lessonUrl}#comment-reply`,
      },
    },
    {
      kind: "discussion-question",
      data: {
        ...course,
        lessonTitle: lesson.lessonTitle,
        snippet: "Why does the second example not narrow when I use `in`?",
        url: `${lessonUrl}#comment-question`,
      },
    },
    {
      kind: "new-enrollment",
      data: { ...course, url: `/instructor/${lesson.courseId}/students` },
    },
    {
      kind: "seat-claimed",
      data: { ...course, seatsLeft: 3, url: "/team" },
    },
    {
      kind: "open-refund-request",
      data: {
        ...course,
        amount: "$149.00",
        reason: "Bought the wrong course by mistake.",
        url: "/admin/refunds",
      },
    },
    {
      kind: "refund-request-declined",
      data: {
        ...course,
        decisionNote: "You've completed over half the course.",
        url: course.courseUrl,
      },
    },
    {
      kind: "refund-request-approved",
      data: { ...course, decisionNote: null, url: course.courseUrl },
    },
    {
      // Nowhere to go: clicking just marks it read.
      kind: "refund-request-confirmed",
      data: { ...course, url: null },
    },
  ];

  // Oldest first, so the 8 distinct kinds end up at the top of the feed.
  const all = Array.from(
    { length: count },
    (_, i) => seeds[(count - 1 - i) % seeds.length]
  );
  for (let i = 0; i < all.length; i += 10) {
    await Promise.all(
      all.slice(i, i + 10).map((seed) =>
        knock.workflows.trigger("discussion-reply", {
          recipients: [{ id: String(me.id), name: me.name, email: me.email }],
          actor:
            seed.kind === "refund-request-confirmed"
              ? undefined
              : {
                  id: String(other.id),
                  name: other.name,
                  email: other.email,
                  // Knock's standard user property; comes back on feed actors.
                  avatar: other.avatarUrl,
                },
          data: { kind: seed.kind, ...seed.data },
        })
      )
    );
  }

  return all.length;
}
