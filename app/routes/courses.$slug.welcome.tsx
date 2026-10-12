import { Link, redirect } from "react-router";
import type { Route } from "./+types/courses.$slug.welcome";
import { db } from "~/db";
import { courses, categories, users, modules, lessons } from "~/db/schema";
import { eq, or } from "drizzle-orm";
import { coursePermissions } from "~/modules/permissions/course-permissions.server";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { PartyPopper, MessageCircle, PlayCircle } from "lucide-react";
import { data } from "react-router";

function getCourseWithDetails(id: number) {
  const course = db
    .select({
      id: courses.id,
      title: courses.title,
      slug: courses.slug,
      description: courses.description,
      salesCopy: courses.salesCopy,
      instructorId: courses.instructorId,
      categoryId: courses.categoryId,
      status: courses.status,
      coverImageUrl: courses.coverImageUrl,
      price: courses.price,
      pppEnabled: courses.pppEnabled,
      createdAt: courses.createdAt,
      updatedAt: courses.updatedAt,
      instructorName: users.name,
      instructorAvatarUrl: users.avatarUrl,
      instructorBio: users.bio,
      categoryName: categories.name,
    })
    .from(courses)
    .innerJoin(users, eq(courses.instructorId, users.id))
    .innerJoin(categories, eq(courses.categoryId, categories.id))
    .where(eq(courses.id, id))
    .get();

  if (!course) return null;

  const courseModules = db
    .select()
    .from(modules)
    .where(eq(modules.courseId, id))
    .orderBy(modules.position)
    .all();

  const moduleIds = courseModules.map((m) => m.id);

  const courseLessons =
    moduleIds.length > 0
      ? db
          .select()
          .from(lessons)
          .where(or(...moduleIds.map((mid) => eq(lessons.moduleId, mid)))!)
          .orderBy(lessons.position)
          .all()
      : [];

  return {
    ...course,
    modules: courseModules.map((mod) => ({
      ...mod,
      lessons: courseLessons.filter((l) => l.moduleId === mod.id),
    })),
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.course?.title ?? "Welcome";
  return [
    { title: `Welcome to ${title} — Cadence` },
    { name: "description", content: `You're enrolled in ${title}!` },
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const slug = params.slug;
  const decisions = await coursePermissions.getCourseDecisions(request, {
    slug,
  });
  if (!decisions.found) {
    throw data("Course not found.", { status: 404 });
  }

  // The welcome page is for Students starting the course. Anyone else,
  // including a Student under Country Lock, goes to the course page, which
  // explains why.
  if (!decisions.take.allowed) {
    throw redirect(`/courses/${slug}`);
  }
  const { course } = decisions;

  const courseWithDetails = getCourseWithDetails(course.id);
  if (!courseWithDetails) {
    throw data("Course not found.", { status: 404 });
  }

  const discordInviteUrl = process.env.DISCORD_INVITE_URL || null;

  return {
    course: courseWithDetails,
    discordInviteUrl,
  };
}

export default function Welcome({ loaderData }: Route.ComponentProps) {
  const { course, discordInviteUrl } = loaderData;

  const firstLessonId =
    course.modules.length > 0 && course.modules[0].lessons.length > 0
      ? course.modules[0].lessons[0].id
      : null;

  return (
    <div className="mx-auto max-w-2xl p-6 lg:p-8">
      <Card>
        <CardContent className="p-8 text-center">
          <div className="mb-4 inline-flex size-16 items-center justify-center rounded-full bg-primary/10">
            <PartyPopper className="size-8 text-primary" />
          </div>

          <h1 className="mb-2 text-3xl font-bold">
            Welcome to {course.title}!
          </h1>
          <p className="mb-8 text-lg text-muted-foreground">
            You&apos;re officially enrolled. Here&apos;s how to get started.
          </p>

          <div className="space-y-4">
            {discordInviteUrl && (
              <a
                href={discordInviteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button variant="outline" size="lg" className="w-full max-w-sm">
                  <MessageCircle className="mr-2 size-5" />
                  Join the Discord Community
                </Button>
              </a>
            )}

            {firstLessonId ? (
              <Link to={`/courses/${course.slug}/lessons/${firstLessonId}`}>
                <Button size="lg" className="w-full max-w-sm">
                  <PlayCircle className="mr-2 size-5" />
                  Start Learning
                </Button>
              </Link>
            ) : (
              <Link to={`/courses/${course.slug}`}>
                <Button size="lg" className="w-full max-w-sm">
                  Go to Course
                </Button>
              </Link>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
