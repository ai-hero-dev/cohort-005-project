import { Form, Link, useSearchParams, useNavigation, isRouteErrorResponse } from "react-router";
import type { Route } from "./+types/courses";
import { db } from "~/db";
import {
  courses as coursesTable,
  categories as categoriesTable,
  users,
  modules,
  lessons,
  enrollments as enrollmentsTable,
  lessonProgress,
  courseRatings,
  CourseStatus,
  LessonProgressStatus,
} from "~/db/schema";
import { eq, like, and, or, sql, inArray } from "drizzle-orm";
import { Card, CardContent, CardFooter, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { AlertTriangle, BookOpen, Search } from "lucide-react";
import { CourseImage } from "~/components/course-image";
import { UserAvatar } from "~/components/user-avatar";
import { getCurrentUserId } from "~/lib/session";
import { formatPrice } from "~/lib/utils";
import { resolveCountry } from "~/lib/country.server";
import { calculatePppPrice } from "~/lib/ppp";
import { StarRating } from "~/components/star-rating";

function buildCourseQuery(
  search: string | null,
  category: string | null,
  status: CourseStatus | null,
  sortBy: string | null,
  limit: number,
  offset: number
) {
  const conditions = [];

  if (status) {
    conditions.push(eq(coursesTable.status, status));
  }

  if (search) {
    const term = `%${search}%`;
    conditions.push(
      or(like(coursesTable.title, term), like(coursesTable.description, term))!
    );
  }

  const query = db
    .select({
      id: coursesTable.id,
      title: coursesTable.title,
      slug: coursesTable.slug,
      description: coursesTable.description,
      salesCopy: coursesTable.salesCopy,
      instructorId: coursesTable.instructorId,
      categoryId: coursesTable.categoryId,
      status: coursesTable.status,
      coverImageUrl: coursesTable.coverImageUrl,
      price: coursesTable.price,
      pppEnabled: coursesTable.pppEnabled,
      createdAt: coursesTable.createdAt,
      updatedAt: coursesTable.updatedAt,
      instructorName: users.name,
      instructorAvatarUrl: users.avatarUrl,
      categoryName: categoriesTable.name,
    })
    .from(coursesTable)
    .innerJoin(users, eq(coursesTable.instructorId, users.id))
    .innerJoin(categoriesTable, eq(coursesTable.categoryId, categoriesTable.id));

  if (category) {
    conditions.push(eq(categoriesTable.slug, category));
  }

  const filtered =
    conditions.length > 0 ? query.where(and(...conditions)) : query;

  const sorted =
    sortBy === "title"
      ? filtered.orderBy(coursesTable.title)
      : sortBy === "oldest"
        ? filtered.orderBy(coursesTable.createdAt)
        : filtered.orderBy(sql`${coursesTable.createdAt} DESC`);

  return sorted.limit(limit).offset(offset).all();
}

function getLessonCountForCourse(courseId: number) {
  const courseModules = db
    .select({ id: modules.id })
    .from(modules)
    .where(eq(modules.courseId, courseId))
    .all();

  if (courseModules.length === 0) return 0;

  const count = db
    .select({ count: sql<number>`count(*)` })
    .from(lessons)
    .where(or(...courseModules.map((m) => eq(lessons.moduleId, m.id)))!)
    .get();

  return count?.count ?? 0;
}

function getAllCategories() {
  return db
    .select()
    .from(categoriesTable)
    .orderBy(categoriesTable.name)
    .all();
}

function getUserEnrolledCourses(userId: number) {
  return db
    .select({
      enrollmentId: enrollmentsTable.id,
      courseId: enrollmentsTable.courseId,
      enrolledAt: enrollmentsTable.enrolledAt,
      completedAt: enrollmentsTable.completedAt,
      courseTitle: coursesTable.title,
      courseSlug: coursesTable.slug,
      courseDescription: coursesTable.description,
      coverImageUrl: coursesTable.coverImageUrl,
    })
    .from(enrollmentsTable)
    .innerJoin(coursesTable, eq(enrollmentsTable.courseId, coursesTable.id))
    .where(eq(enrollmentsTable.userId, userId))
    .all();
}

function getCourseLessonIds(courseId: number): number[] {
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

  return courseLessons.map((l) => l.id);
}

function calculateProgress(
  userId: number,
  courseId: number,
  weightByDuration: boolean
) {
  const lessonIds = getCourseLessonIds(courseId);

  if (lessonIds.length === 0) return 0;

  if (weightByDuration) {
    const courseLessons = db
      .select({
        id: lessons.id,
        durationMinutes: lessons.durationMinutes,
      })
      .from(lessons)
      .where(or(...lessonIds.map((id) => eq(lessons.id, id)))!)
      .all();

    const totalDuration = courseLessons.reduce(
      (sum, l) => sum + (l.durationMinutes ?? 1),
      0
    );

    if (totalDuration === 0) return 0;

    const completed = db
      .select()
      .from(lessonProgress)
      .where(
        and(
          eq(lessonProgress.userId, userId),
          eq(lessonProgress.status, LessonProgressStatus.Completed),
          or(...lessonIds.map((id) => eq(lessonProgress.lessonId, id)))!
        )
      )
      .all();

    const completedIds = new Set(completed.map((p) => p.lessonId));

    const completedDuration = courseLessons
      .filter((l) => completedIds.has(l.id))
      .reduce((sum, l) => sum + (l.durationMinutes ?? 1), 0);

    return Math.round((completedDuration / totalDuration) * 100);
  }

  const completedCount = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        or(...lessonIds.map((id) => eq(lessonProgress.lessonId, id)))!
      )
    )
    .get();

  return Math.round(((completedCount?.count ?? 0) / lessonIds.length) * 100);
}

function getCompletedLessonCount(userId: number, courseId: number) {
  const lessonIds = getCourseLessonIds(courseId);
  if (lessonIds.length === 0) return 0;

  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        or(...lessonIds.map((id) => eq(lessonProgress.lessonId, id)))!
      )
    )
    .get();

  return result?.count ?? 0;
}

type CourseRatingSummary = {
  average: number | null;
  count: number;
};

const EMPTY_SUMMARY: CourseRatingSummary = { average: null, count: 0 };

function getCourseRatingSummaries(
  courseIds: number[]
): Map<number, CourseRatingSummary> {
  const summaries = new Map<number, CourseRatingSummary>();

  if (courseIds.length === 0) return summaries;

  const rows = db
    .select({
      courseId: courseRatings.courseId,
      average: sql<number | null>`avg(${courseRatings.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(inArray(courseRatings.courseId, courseIds))
    .groupBy(courseRatings.courseId)
    .all();

  for (const row of rows) {
    summaries.set(row.courseId, {
      average: row.average === null ? null : Math.round(row.average * 10) / 10,
      count: row.count,
    });
  }

  for (const courseId of courseIds) {
    if (!summaries.has(courseId)) {
      summaries.set(courseId, EMPTY_SUMMARY);
    }
  }

  return summaries;
}

export function meta() {
  return [
    { title: "Browse Courses — Cadence" },
    { name: "description", content: "Browse all available courses" },
  ];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const search = url.searchParams.get("q");
  const category = url.searchParams.get("category");

  const courses = buildCourseQuery(
    search,
    category,
    CourseStatus.Published,
    "newest",
    50,
    0
  );

  const currentUserId = await getCurrentUserId(request);
  const country = await resolveCountry(request);

  // Build a map of courseId -> progress for enrolled courses
  const progressMap = new Map<
    number,
    { progress: number; completedLessons: number }
  >();
  if (currentUserId) {
    const enrollments = getUserEnrolledCourses(currentUserId);
    for (const enrollment of enrollments) {
      progressMap.set(enrollment.courseId, {
        progress: calculateProgress(currentUserId, enrollment.courseId, false),
        completedLessons: getCompletedLessonCount(currentUserId, enrollment.courseId),
      });
    }
  }

  const ratingSummaries = getCourseRatingSummaries(courses.map((c) => c.id));

  const coursesWithLessonCount = courses.map((course) => {
    const userProgress = progressMap.get(course.id);
    const pppPrice = course.pppEnabled
      ? calculatePppPrice(course.price, country)
      : course.price;
    const rating = ratingSummaries.get(course.id);
    return {
      ...course,
      lessonCount: getLessonCountForCourse(course.id),
      progress: userProgress?.progress ?? null,
      completedLessons: userProgress?.completedLessons ?? null,
      pppPrice,
      ratingAverage: rating?.average ?? null,
      ratingCount: rating?.count ?? 0,
    };
  });

  const categories = getAllCategories();

  return { courses: coursesWithLessonCount, categories, search, category, currentUserId };
}

function CourseCardSkeleton() {
  return (
    <Card className="h-full">
      <Skeleton className="aspect-video rounded-b-none rounded-t-lg" />
      <CardHeader>
        <Skeleton className="mb-1 h-3 w-16" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="mt-1 h-4 w-24" />
      </CardHeader>
      <CardContent>
        <Skeleton className="mb-1 h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </CardContent>
      <CardFooter className="flex items-center justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-16" />
      </CardFooter>
    </Card>
  );
}

export function HydrateFallback() {
  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <div className="mb-8">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="mt-2 h-5 w-64" />
      </div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-20" />
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <CourseCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export default function CourseCatalog({ loaderData }: Route.ComponentProps) {
  const { courses, categories, search, category, currentUserId } = loaderData;
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();
  const isSearching =
    navigation.state === "loading" &&
    navigation.location?.pathname === "/courses";

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Browse Courses</h1>
        <p className="mt-1 text-muted-foreground">
          Find courses to expand your skills
        </p>
      </div>

      {/* Search and Filter */}
      <Form method="get" className="mb-8 flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            name="q"
            defaultValue={search ?? ""}
            placeholder="Search courses..."
            className="h-10 w-full rounded-md border border-input bg-background pl-10 pr-4 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <select
          name="category"
          defaultValue={category ?? ""}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.slug}>
              {cat.name}
            </option>
          ))}
        </select>
        <Button type="submit">Search</Button>
      </Form>

      {/* Course Grid */}
      {isSearching ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CourseCardSkeleton key={i} />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BookOpen className="mb-4 size-12 text-muted-foreground/50" />
          <h2 className="text-lg font-medium">No courses found</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {search || category
              ? "Try adjusting your search or filters."
              : "No published courses are available yet."}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <Link
              key={course.id}
              to={`/courses/${course.slug}`}
              className="group"
            >
              <Card className="h-full overflow-hidden pt-0 transition-shadow group-hover:shadow-md">
                <div className="aspect-video overflow-hidden">
                  <CourseImage
                    src={course.coverImageUrl}
                    alt={course.title}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                </div>
                <CardHeader>
                  <div className="mb-1 flex items-center gap-2 text-xs font-medium">
                    <span className="text-primary">{course.categoryName}</span>
                    {currentUserId !== null && course.instructorId === currentUserId && (
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        Your Course
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold leading-tight group-hover:text-primary">
                    {course.title}
                  </h3>
                  <StarRating
                    average={course.ratingAverage}
                    count={course.ratingCount}
                    className="mt-1"
                  />
                </CardHeader>
                <CardContent>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {course.description}
                  </p>
                </CardContent>
                {course.progress !== null && course.progress > 0 && (
                  <CardContent className="pt-0">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {course.completedLessons} / {course.lessonCount} lessons
                      </span>
                      <span className="font-medium">{course.progress}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${course.progress}%` }}
                      />
                    </div>
                  </CardContent>
                )}
                <CardFooter className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <UserAvatar
                      name={course.instructorName}
                      avatarUrl={course.instructorAvatarUrl}
                      className="size-5"
                    />
                    {course.instructorName}
                  </span>
                  <span className="font-semibold text-foreground">
                    {course.pppPrice < course.price ? (
                      <span className="flex items-center gap-1.5">
                        <span className="text-xs line-through text-muted-foreground font-normal">
                          {formatPrice(course.price)}
                        </span>
                        {formatPrice(course.pppPrice)}
                      </span>
                    ) : (
                      formatPrice(course.price)
                    )}
                  </span>
                </CardFooter>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading courses.";

  if (isRouteErrorResponse(error)) {
    title = `Error ${error.status}`;
    message = typeof error.data === "string" ? error.data : error.statusText;
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
