/** A student on the roster who no longer has an Enrollment. */
export function isLapsed(student: { enrollmentId: number | null }): boolean {
  return student.enrollmentId === null;
}
