import { slugify } from "./lib/impl";

/**
 * Starter template for a deep module: copy this folder or delete it.
 * The entry point is small; the behaviour lives in `lib/`.
 */
export function toSlug(title: string): string {
  return slugify(title);
}
