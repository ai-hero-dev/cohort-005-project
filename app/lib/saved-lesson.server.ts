import { courses, lessons } from "~/db/schema";

// ─── Saved Lesson ───
// What a row on the Saved page needs to link back to its Lesson and name its
// Course. Bookmarks and Notes both select it, joined through modules to
// courses.

export const savedLessonColumns = {
  id: lessons.id,
  title: lessons.title,
  courseTitle: courses.title,
  courseSlug: courses.slug,
};
