import { Link } from "react-router";
import type { Route } from "./+types/courses.$slug.$moduleId";
import { getCurrentUserId } from "~/lib/session";
import { db } from "~/db";
import {
  categories,
  courses,
  enrollments,
  lessonProgress,
  lessons,
  modules,
  users,
  LessonProgressStatus,
} from "~/db/schema";
import { and, eq, or } from "drizzle-orm";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { UserAvatar } from "~/components/user-avatar";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  PlayCircle,
  Video,
} from "lucide-react";
import { data, isRouteErrorResponse } from "react-router";
import { formatDuration } from "~/lib/utils";
import { z } from "zod";

const paramsSchema = z.object({
  slug: z.string().min(1),
  moduleId: z.coerce.number().int(),
});

function getCourseBySlug(slug: string) {
  return db.select().from(courses).where(eq(courses.slug, slug)).get();
}

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

function getModuleWithLessons(id: number) {
  const mod = db.select().from(modules).where(eq(modules.id, id)).get();
  if (!mod) return null;

  const moduleLessons = db
    .select()
    .from(lessons)
    .where(eq(lessons.moduleId, id))
    .orderBy(lessons.position)
    .all();

  return { ...mod, lessons: moduleLessons };
}

function isUserEnrolled(userId: number, courseId: number) {
  const existing = db
    .select()
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
    )
    .get();

  return !!existing;
}

function getLessonProgressForCourse(userId: number, courseId: number) {
  const courseModules = db
    .select({ id: modules.id })
    .from(modules)
    .where(eq(modules.courseId, courseId))
    .all();

  if (courseModules.length === 0) return [];

  const courseLessons = db
    .select({ id: lessons.id })
    .from(lessons)
    .where(or(...courseModules.map((m) => eq(lessons.moduleId, m.id)))!)
    .all();

  if (courseLessons.length === 0) return [];

  return db
    .select()
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        or(...courseLessons.map((l) => eq(lessonProgress.lessonId, l.id)))!
      )
    )
    .all();
}

export function meta({ loaderData }: Route.MetaArgs) {
  const moduleTitle = loaderData?.module?.title ?? "Module";
  const courseTitle = loaderData?.course?.title ?? "Course";
  return [{ title: `${moduleTitle} — ${courseTitle} — Cadence` }];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success) {
    throw data("Invalid parameters", { status: 400 });
  }

  const { slug, moduleId } = parsed.data;

  const course = getCourseBySlug(slug);
  if (!course) {
    throw data("Course not found", { status: 404 });
  }

  const courseWithDetails = getCourseWithDetails(course.id);
  if (!courseWithDetails) {
    throw data("Course not found", { status: 404 });
  }

  const moduleWithLessons = getModuleWithLessons(moduleId);
  if (!moduleWithLessons) {
    throw data("Module not found", { status: 404 });
  }

  // Verify module belongs to this course
  if (moduleWithLessons.courseId !== course.id) {
    throw data("Module not found in this course", { status: 404 });
  }

  const currentUserId = await getCurrentUserId(request);

  let enrolled = false;
  let lessonProgressMap: Record<number, string> = {};

  if (currentUserId) {
    enrolled = isUserEnrolled(currentUserId, course.id);

    if (enrolled) {
      const progressRecords = getLessonProgressForCourse(
        currentUserId,
        course.id
      );
      for (const record of progressRecords) {
        lessonProgressMap[record.lessonId] = record.status;
      }
    }
  }

  // Calculate module-level progress
  const totalLessons = moduleWithLessons.lessons.length;
  const completedLessons = moduleWithLessons.lessons.filter(
    (l) => lessonProgressMap[l.id] === LessonProgressStatus.Completed
  ).length;
  const moduleProgress =
    totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  const totalDuration = moduleWithLessons.lessons.reduce(
    (sum, l) => sum + (l.durationMinutes ?? 0),
    0
  );

  return {
    course: {
      id: courseWithDetails.id,
      title: courseWithDetails.title,
      slug: courseWithDetails.slug,
      instructorName: courseWithDetails.instructorName,
      instructorAvatarUrl: courseWithDetails.instructorAvatarUrl,
      instructorBio: courseWithDetails.instructorBio,
    },
    module: moduleWithLessons,
    enrolled,
    lessonProgressMap,
    moduleProgress,
    completedLessons,
    totalLessons,
    totalDuration,
  };
}

export function HydrateFallback() {
  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
      <nav className="mb-6">
        <Skeleton className="h-4 w-64" />
      </nav>
      <Skeleton className="mb-2 h-9 w-2/3" />
      <Skeleton className="mb-6 h-4 w-48" />
      <Card className="mb-8">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <div>
              <Skeleton className="mb-1 h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

export default function ModuleDetail({ loaderData }: Route.ComponentProps) {
  const {
    course,
    module: mod,
    enrolled,
    lessonProgressMap,
    moduleProgress,
    completedLessons,
    totalLessons,
    totalDuration,
  } = loaderData;

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/courses" className="hover:text-foreground">
          Courses
        </Link>
        <span className="mx-2">/</span>
        <Link to={`/courses/${course.slug}`} className="hover:text-foreground">
          {course.title}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{mod.title}</span>
      </nav>

      {/* Module title and stats */}
      <h1 className="mb-2 text-3xl font-bold">{mod.title}</h1>
      <div className="mb-6 flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <BookOpen className="size-4" />
          {totalLessons} {totalLessons === 1 ? "lesson" : "lessons"}
        </span>
        {totalDuration > 0 && (
          <span className="flex items-center gap-1">
            <Clock className="size-4" />
            {formatDuration(totalDuration, true, false, false)}
          </span>
        )}
      </div>

      {/* Progress bar for enrolled students */}
      {enrolled && totalLessons > 0 && (
        <div className="mb-6">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {completedLessons} of {totalLessons} lessons completed
            </span>
            <span className="font-medium">{moduleProgress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${moduleProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Instructor card */}
      <Card className="mb-8">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <UserAvatar
              name={course.instructorName}
              avatarUrl={course.instructorAvatarUrl}
              className="size-10"
            />
            <div>
              <div className="font-medium">{course.instructorName}</div>
              {course.instructorBio && (
                <p className="text-sm text-muted-foreground">
                  {course.instructorBio}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lesson list */}
      <h2 className="mb-4 text-xl font-semibold">Lessons</h2>
      {mod.lessons.length === 0 ? (
        <p className="text-muted-foreground">
          No lessons have been added to this module yet.
        </p>
      ) : (
        <div className="space-y-1">
          {mod.lessons.map((lesson) => {
            const status = lessonProgressMap[lesson.id];
            const isCompleted = status === LessonProgressStatus.Completed;
            const isInProgress = status === LessonProgressStatus.InProgress;
            const hasVideo = !!lesson.videoUrl;

            const content = (
              <div className="flex items-center gap-3 rounded-md px-3 py-3 text-sm">
                {enrolled ? (
                  isCompleted ? (
                    <CheckCircle2 className="size-4 shrink-0 text-green-500" />
                  ) : isInProgress ? (
                    <PlayCircle className="size-4 shrink-0 text-blue-500" />
                  ) : (
                    <Circle className="size-4 shrink-0 text-muted-foreground" />
                  )
                ) : (
                  <Circle className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="flex-1">{lesson.title}</span>
                <div className="flex items-center gap-2">
                  {hasVideo ? (
                    <Video className="size-3.5 text-muted-foreground" />
                  ) : (
                    <FileText className="size-3.5 text-muted-foreground" />
                  )}
                  {lesson.durationMinutes && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="size-3" />
                      {formatDuration(
                        lesson.durationMinutes,
                        true,
                        false,
                        false
                      )}
                    </span>
                  )}
                </div>
              </div>
            );

            if (enrolled) {
              return (
                <Link
                  key={lesson.id}
                  to={`/courses/${course.slug}/lessons/${lesson.id}`}
                  className="block hover:bg-muted rounded-md"
                >
                  {content}
                </Link>
              );
            }

            return <div key={lesson.id}>{content}</div>;
          })}
        </div>
      )}
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading this module.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = "Module not found";
      message =
        "The module you're looking for doesn't exist or doesn't belong to this course.";
    } else if (error.status === 400) {
      title = "Invalid request";
      message =
        typeof error.data === "string"
          ? error.data
          : "The request was invalid.";
    } else {
      title = `Error ${error.status}`;
      message = typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/courses">
            <Button variant="outline">Browse Courses</Button>
          </Link>
          <Link to="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
