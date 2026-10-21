import { describe, expect, it } from "vitest";
import { addLeftFindings } from "./left-findings";
import type { ReviewComment } from "./review-schema";

const finding = (overrides: Partial<ReviewComment>): ReviewComment => ({
  axis: "standards",
  title: "Server module imports a UI component",
  path: "app/modules/a/lib/b.server.ts",
  line: 4,
  body: "**Wrong direction.**\n\nMove the type.",
  ...overrides,
});

const verdict = [
  "## Standards: CHANGES REQUESTED",
  "One line.",
  "",
  "## Spec: PASS",
  "Met.",
  "",
  "## Rules this review wanted and could not find",
  "- None.",
  "",
].join("\n");

describe("addLeftFindings", () => {
  it("leaves a verdict with no findings unchanged", () => {
    expect(addLeftFindings(verdict, [], [])).toBe(verdict);
  });

  it("lists an inline finding by title and line only", () => {
    const result = addLeftFindings(verdict, [finding({})], []);

    expect(result).toContain(
      "One line.\n\n**Left**\n\n- **Server module imports a UI component**, at `app/modules/a/lib/b.server.ts:4`\n\n## Spec: PASS"
    );
    expect(result).not.toContain("Move the type.");
  });

  it("writes a dropped finding out in full, indented under its entry", () => {
    const result = addLeftFindings(verdict, [], [finding({})]);

    expect(result).toContain(
      "- **Server module imports a UI component**, at `app/modules/a/lib/b.server.ts:4`\n\n  **Wrong direction.**\n\n  Move the type.\n\n## Spec: PASS"
    );
  });

  it("puts each finding under its own axis", () => {
    const result = addLeftFindings(
      verdict,
      [finding({ axis: "spec", title: "Scope creep" })],
      []
    );

    expect(result).toContain(
      "## Standards: CHANGES REQUESTED\nOne line.\n\n## Spec"
    );
    expect(result).toContain(
      "Met.\n\n**Left**\n\n- **Scope creep**, at `app/modules/a/lib/b.server.ts:4`\n\n## Rules"
    );
  });

  it("lists inline findings before dropped ones", () => {
    const result = addLeftFindings(
      verdict,
      [finding({ title: "Inline" })],
      [finding({ title: "Dropped" })]
    );

    expect(result.indexOf("**Inline**")).toBeLessThan(
      result.indexOf("**Dropped**")
    );
  });

  it("adds the axis heading when the verdict has none", () => {
    const result = addLeftFindings("No verdict.\n", [finding({})], []);

    expect(result).toBe(
      "No verdict.\n\n## Standards\n\n**Left**\n\n- **Server module imports a UI component**, at `app/modules/a/lib/b.server.ts:4`\n"
    );
  });
});
