import { courses, lessons } from "~/db/schema";

export const savedLessonColumns = {
  id: lessons.id,
  title: lessons.title,
  courseTitle: courses.title,
  courseSlug: courses.slug,
};
