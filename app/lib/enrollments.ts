/** An Enrollment that no longer gives its learner access to the course. */
export function isLapsed(enrollment: { revokedAt: string | null }): boolean {
  return enrollment.revokedAt !== null;
}
