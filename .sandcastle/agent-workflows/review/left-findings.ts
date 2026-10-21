import type { ReviewComment } from "./review-schema";

const HEADINGS = { standards: "## Standards", spec: "## Spec" } as const;

const indent = (text: string): string =>
  text
    .split("\n")
    .map((line) => (line ? `  ${line}` : line))
    .join("\n");

const entry = (comment: ReviewComment, inline: boolean): string => {
  const head = `- **${comment.title}**, at \`${comment.path}:${comment.line}\``;
  return inline ? head : `${head}\n\n${indent(comment.body)}`;
};

const leftList = (posted: ReviewComment[], dropped: ReviewComment[]): string =>
  [
    "**Left**",
    "",
    ...posted.map((comment) => entry(comment, true)),
    ...dropped.map((comment) => entry(comment, false)),
  ].join("\n");

// The verdict lists each finding the review left. One posted inline gets a
// single line, since its comment carries the reasoning; one GitHub would not
// take inline (its line is outside the diff) appears here in full, because
// the verdict is its only home. Each list goes at the end of its axis's
// section; with no such section, the lists go at the end.
export const addLeftFindings = (
  verdict: string,
  posted: ReviewComment[],
  dropped: ReviewComment[]
): string => {
  const sections = verdict.split(/^(?=## )/m);

  for (const axis of ["standards", "spec"] as const) {
    const ofAxis = (comment: ReviewComment) => comment.axis === axis;
    if (![...posted, ...dropped].some(ofAxis)) continue;
    const list = leftList(posted.filter(ofAxis), dropped.filter(ofAxis));

    const index = sections.findIndex((section) =>
      section.startsWith(HEADINGS[axis])
    );
    if (index === -1) {
      sections.push(`\n${HEADINGS[axis]}\n\n${list}\n`);
      continue;
    }
    sections[index] = `${sections[index].trimEnd()}\n\n${list}\n\n`;
  }

  return sections.join("").trimEnd() + "\n";
};
