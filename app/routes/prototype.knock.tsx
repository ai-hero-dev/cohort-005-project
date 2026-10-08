// PROTOTYPE — throwaway Knock spike for "Does Knock hold up against Cadence?"
// (ai-hero-dev/cohort-005-project#21). Lives on prototype/knock-spike only.
//
// Check 1: the loader signs a token for whichever DevUI user is selected; the
//          browser reads that user's feed with the public key + token only.
// Check 2: "Trigger Discussion Reply" fires the real workflow via the Node SDK.
// Check 3: the feed panel lists, counts unread/unseen, marks read/seen — all
//          from the browser against Knock's headless API.
// Check 4: "Trigger new Enrollment" should land only for opted-in Instructors.
//          Cadence seeds the default (Enrollment off) on first trigger; Knock's
//          environment default would do the same but is dashboard-only.
import { useCallback, useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import type { Route } from "./+types/prototype.knock";
import { requireUserId } from "~/lib/access.server";
import {
  knock,
  knockPublicConfig,
  knockUserId,
  signKnockUserToken,
} from "~/lib/knock-prototype.server";
import { db } from "~/db";
import { comments, courses, lessons, modules, users } from "~/db/schema";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { Button } from "~/components/ui/button";

const KNOCK_API = "https://api.knock.app/v1";

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireUserId(request);
  const me = db.select().from(users).where(eq(users.id, userId)).get()!;

  // Questions by someone else, so "I" can reply and notify the author.
  const questions = db
    .select({
      id: comments.id,
      body: comments.body,
      authorId: users.id,
      authorName: users.name,
      lessonTitle: lessons.title,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .innerJoin(lessons, eq(lessons.id, comments.lessonId))
    .where(
      and(
        isNull(comments.parentId),
        isNull(comments.deletedAt),
        ne(comments.userId, userId)
      )
    )
    .orderBy(desc(comments.createdAt))
    .limit(5)
    .all();

  const courseList = db
    .select({
      id: courses.id,
      title: courses.title,
      instructorId: users.id,
      instructorName: users.name,
    })
    .from(courses)
    .innerJoin(users, eq(users.id, courses.instructorId))
    .limit(5)
    .all();

  let preferences: unknown = null;
  try {
    preferences = await knock.users.getPreferences(knockUserId(userId), "default");
  } catch (e) {
    preferences = { error: String(e) };
  }

  return {
    me: { id: me.id, name: me.name, role: me.role },
    knockUserId: knockUserId(userId),
    userToken: await signKnockUserToken(userId),
    ...knockPublicConfig,
    questions,
    courseList,
    preferences,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const userId = await requireUserId(request);
  const me = db.select().from(users).where(eq(users.id, userId)).get()!;
  const form = await request.formData();
  const intent = form.get("intent");
  const actor = { id: knockUserId(me.id), name: me.name, email: me.email };

  if (intent === "trigger-reply") {
    const questionId = Number(form.get("questionId"));
    const q = db
      .select({
        id: comments.id,
        body: comments.body,
        lessonTitle: lessons.title,
        author: users,
      })
      .from(comments)
      .innerJoin(users, eq(users.id, comments.userId))
      .innerJoin(lessons, eq(lessons.id, comments.lessonId))
      .where(eq(comments.id, questionId))
      .get()!;
    const result = await knock.workflows.trigger("discussion-reply", {
      // Inline identify: upserts the recipient, so no separate user sync yet.
      recipients: [
        { id: knockUserId(q.author.id), name: q.author.name, email: q.author.email },
      ],
      actor,
      data: {
        questionId: q.id,
        questionExcerpt: q.body.slice(0, 80),
        lessonTitle: q.lessonTitle,
        replierName: me.name,
      },
    });
    return { intent, recipient: q.author.name, result };
  }

  if (intent === "trigger-enrollment") {
    const courseId = Number(form.get("courseId"));
    const c = db
      .select({ id: courses.id, title: courses.title, instructor: users })
      .from(courses)
      .innerJoin(users, eq(users.id, courses.instructorId))
      .where(eq(courses.id, courseId))
      .get()!;
    // Cadence owns the default: an Instructor with no Enrollment preference
    // yet gets it seeded off (stand-in for doing this at user sync).
    const seeded = await seedEnrollmentDefault(c.instructor.id);
    const result = await knock.workflows.trigger("new-enrollment", {
      recipients: [
        {
          id: knockUserId(c.instructor.id),
          name: c.instructor.name,
          email: c.instructor.email,
        },
      ],
      actor,
      data: { courseId: c.id, courseTitle: c.title, studentName: me.name },
    });
    return { intent, recipient: c.instructor.name, seededDefaultOff: seeded, result };
  }

  if (intent === "opt-in-enrollment" || intent === "opt-out-enrollment") {
    const on = intent === "opt-in-enrollment";
    const result = await knock.users.setPreferences(knockUserId(me.id), "default", {
      categories: { enrollment: { channel_types: { in_app_feed: on } } },
    });
    return { intent, result };
  }

  if (intent === "reset-preferences") {
    await knock.users.unsetPreferences(knockUserId(me.id), "default");
    return { intent, result: "unset" };
  }

  throw new Response("Unknown intent", { status: 400 });
}

async function seedEnrollmentDefault(cadenceUserId: number) {
  const id = knockUserId(cadenceUserId);
  const existing = await knock.users
    .getPreferences(id, "default")
    .catch(() => null);
  if (existing?.categories && "enrollment" in existing.categories) return false;
  await knock.users.setPreferences(id, "default", {
    categories: {
      ...(existing?.categories ?? {}),
      enrollment: { channel_types: { in_app_feed: false } },
    },
  });
  return true;
}

type FeedItem = {
  id: string;
  inserted_at: string;
  read_at: string | null;
  seen_at: string | null;
  source: { key: string; categories: string[] };
  data: Record<string, unknown>;
  actors: { name?: string }[];
};

type FeedResponse = {
  entries: FeedItem[];
  meta: { unread_count: number; unseen_count: number; total_count: number };
};

export default function KnockPrototype({ loaderData }: Route.ComponentProps) {
  const { me, knockUserId, userToken, publicApiKey, feedChannelId } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const headers = {
    Authorization: `Bearer ${publicApiKey}`,
    "X-Knock-User-Token": userToken,
    "Content-Type": "application/json",
  };

  const push = (line: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString()} ${line}`, ...l].slice(0, 30));

  const loadFeed = useCallback(async () => {
    const res = await fetch(`${KNOCK_API}/users/${knockUserId}/feeds/${feedChannelId}`, {
      headers,
    });
    if (!res.ok) {
      push(`feed GET ${res.status} ${await res.text()}`);
      return;
    }
    setFeed(await res.json());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knockUserId, userToken]);

  useEffect(() => {
    setFeed(null);
    loadFeed();
    const t = setInterval(loadFeed, 3000);
    return () => clearInterval(t);
  }, [loadFeed]);

  // Triggers notify someone else, so say who to switch to.
  useEffect(() => {
    const d = fetcher.data;
    if (!d) return;
    if (d.intent === "trigger-reply" || d.intent === "trigger-enrollment") {
      const line =
        `✓ ${d.intent} → notified ${d.recipient}` +
        ("seededDefaultOff" in d && d.seededDefaultOff ? " (seeded Enrollment off)" : "") +
        `; switch to them in the DevUI to see it`;
      push(line);
      toast.success(line);
    } else {
      push(`✓ ${d.intent}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data]);

  async function markBatch(status: "read" | "seen" | "unread", ids: string[]) {
    const res = await fetch(`${KNOCK_API}/messages/batch/${status}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message_ids: ids }),
    });
    push(`batch/${status} [${ids.length}] → ${res.status}`);
    loadFeed();
  }

  // Negative check: my token must NOT open someone else's feed.
  async function tryOtherFeed() {
    const otherId = String(me.id === 1 ? 2 : 1);
    const res = await fetch(`${KNOCK_API}/users/${otherId}/feeds/${feedChannelId}`, {
      headers,
    });
    push(`my token → user ${otherId}'s feed: ${res.status} ${await res.text()}`);
  }

  async function clientPreferences() {
    const res = await fetch(`${KNOCK_API}/users/${knockUserId}/preferences/default`, {
      headers,
    });
    push(`client GET preferences → ${res.status} ${await res.text()}`);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 font-mono text-sm">
      <div className="rounded border-2 border-dashed border-amber-500 bg-amber-50 p-3 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        PROTOTYPE: Knock spike (#21). Throwaway. Switch users in the DevUI panel;
        the feed below re-authenticates as them.
      </div>

      <section>
        <h2 className="font-bold">1. Signed user token</h2>
        <p>
          Signed in as <b>{me.name}</b> ({me.role}), Knock user id{" "}
          <b>{knockUserId}</b>
        </p>
        <p className="break-all text-xs text-muted-foreground">
          token sub = {JSON.parse(atob(userToken.split(".")[1])).sub}
        </p>
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="outline" onClick={tryOtherFeed}>
            Try another user's feed with my token (should fail)
          </Button>
          <Button size="sm" variant="outline" onClick={clientPreferences}>
            Read my preferences from the browser
          </Button>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="space-y-4">
          <div>
            <h2 className="font-bold">2. Trigger Discussion Reply → question author</h2>
            {loaderData.questions.map((q) => (
              <fetcher.Form method="post" key={q.id} className="mt-1 flex gap-2">
                <input type="hidden" name="intent" value="trigger-reply" />
                <input type="hidden" name="questionId" value={q.id} />
                <Button size="sm" type="submit">
                  Reply → notify {q.authorName}
                </Button>
                <span className="truncate">"{q.body.slice(0, 40)}"</span>
              </fetcher.Form>
            ))}
          </div>

          <div>
            <h2 className="font-bold">4. Trigger new Enrollment → Instructor</h2>
            {loaderData.courseList.map((c) => (
              <fetcher.Form method="post" key={c.id} className="mt-1 flex gap-2">
                <input type="hidden" name="intent" value="trigger-enrollment" />
                <input type="hidden" name="courseId" value={c.id} />
                <Button size="sm" type="submit">
                  Enroll → notify {c.instructorName}
                </Button>
                <span className="truncate">{c.title}</span>
              </fetcher.Form>
            ))}
            <div className="mt-2 flex gap-2">
              {(["opt-in-enrollment", "opt-out-enrollment", "reset-preferences"] as const).map(
                (intent) => (
                  <fetcher.Form method="post" key={intent}>
                    <input type="hidden" name="intent" value={intent} />
                    <Button size="sm" variant="outline" type="submit">
                      {intent} (me)
                    </Button>
                  </fetcher.Form>
                )
              )}
            </div>
            <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted p-2 text-xs">
              my server-side preferences:{" "}
              {JSON.stringify(loaderData.preferences, null, 2)}
            </pre>
          </div>

          <pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-xs">
            last action: {JSON.stringify(fetcher.data ?? null, null, 2)}
          </pre>
        </section>

        <section>
          <h2 className="font-bold">3. Headless feed (browser → Knock, polled 3s)</h2>
          {feed ? (
            <>
              <p>
                unread <b>{feed.meta.unread_count}</b> · unseen{" "}
                <b>{feed.meta.unseen_count}</b> · total <b>{feed.meta.total_count}</b>
              </p>
              <div className="my-2 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={feed.meta.unseen_count === 0}
                  onClick={() =>
                    markBatch("seen", feed.entries.filter((e) => !e.seen_at).map((e) => e.id))
                  }
                >
                  Mark all seen ({feed.meta.unseen_count} unseen; seen ≠ read)
                </Button>
              </div>
              <ul className="space-y-2">
                {feed.entries.map((e) => (
                  <li
                    key={e.id}
                    className={`rounded border p-2 ${e.read_at ? "opacity-60" : "border-blue-500"}`}
                  >
                    <div>
                      <b>{e.source.key}</b> [{e.source.categories.join(",")}] from{" "}
                      {e.actors[0]?.name ?? "?"}
                    </div>
                    <div className="text-xs">{JSON.stringify(e.data)}</div>
                    <div className="text-xs text-muted-foreground">
                      seen {e.seen_at ? "✓" : "✗"} · read {e.read_at ? "✓" : "✗"} ·{" "}
                      {e.inserted_at}
                    </div>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => markBatch(e.read_at ? "unread" : "read", [e.id])}
                    >
                      mark {e.read_at ? "unread" : "read"}
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>loading…</p>
          )}
        </section>
      </div>

      <section>
        <h2 className="font-bold">Log</h2>
        <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
          {log.join("\n")}
        </pre>
      </section>
    </div>
  );
}
