/** A learner on the roster who no longer has a place on the course. */
export function isLapsed(student: { enrollmentId: number | null }): boolean {
  return student.enrollmentId === null;
}
