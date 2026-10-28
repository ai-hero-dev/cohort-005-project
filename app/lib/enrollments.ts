/** A Revoked Enrollment: its Purchase was refunded, so it no longer gives access to the course. */
export function isRevoked(enrollment: { revokedAt: string | null }): boolean {
  return enrollment.revokedAt !== null;
}
