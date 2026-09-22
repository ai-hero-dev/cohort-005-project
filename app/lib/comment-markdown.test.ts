import { describe, it, expect } from "vitest";
import { renderComment } from "./comment-markdown.server";
import { markdown } from "./text";

describe("renderComment", () => {
  describe("markdown", () => {
    it("renders basic formatting", async () => {
      const html = await renderComment(markdown("**bold** and _italic_"));

      expect(html).toContain("<strong>bold</strong>");
      expect(html).toContain("<em>italic</em>");
    });

    it("renders lists", async () => {
      const html = await renderComment(markdown("- one\n- two"));

      expect(html).toContain("<li>one</li>");
    });

    it("highlights fenced code with shiki", async () => {
      const html = await renderComment(markdown("```typescript\nconst a = 1;\n```"));

      expect(html).toContain("shiki");
      expect(html).toContain("const");
    });

    it("falls back to a plain block for unknown languages", async () => {
      const html = await renderComment(markdown("```brainfuck\n+++\n```"));

      expect(html).toContain("<pre");
      expect(html).toContain("+++");
    });

    it("escapes markup inside code blocks", async () => {
      const html = await renderComment(markdown("```html\n<script>alert(1)</script>\n```"));

      // shiki escapes as &#x3C; rather than &lt; — either is safe.
      expect(html).not.toContain("<script>");
      expect(html).not.toContain("</script>");
    });

    it("escapes markup inside inline code", async () => {
      const html = await renderComment(markdown("use `<script>` carefully"));

      expect(html).not.toContain("<script>");
    });
  });

  describe("raw HTML", () => {
    it("escapes a script tag instead of emitting it", async () => {
      const html = await renderComment(markdown("<script>alert('xss')</script>"));

      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });

    it("escapes an event-handler attribute", async () => {
      const html = await renderComment(markdown('<img src=x onerror="alert(1)">'));

      expect(html).not.toContain("<img");
      expect(html).not.toContain('onerror="alert(1)"');
    });

    it("escapes an iframe", async () => {
      const html = await renderComment(markdown('<iframe src="https://evil.test">'));

      expect(html).not.toContain("<iframe");
    });

    it("escapes inline HTML mixed into a paragraph", async () => {
      const html = await renderComment(markdown("hello <b onclick='x()'>there</b>"));

      expect(html).not.toContain("<b onclick");
      expect(html).toContain("&lt;b onclick");
    });

    it("escapes a style tag", async () => {
      const html = await renderComment(markdown("<style>body{display:none}</style>"));

      expect(html).not.toContain("<style>");
    });
  });

  describe("links", () => {
    it("keeps http and https links and marks them nofollow", async () => {
      const html = await renderComment(markdown("[docs](https://example.test/a)"));

      expect(html).toContain('href="https://example.test/a"');
      expect(html).toContain('rel="nofollow noopener noreferrer"');
      expect(html).toContain('target="_blank"');
    });

    it("downgrades a javascript: link to plain text", async () => {
      const html = await renderComment(markdown("[click](javascript:alert(1))"));

      expect(html).not.toContain("javascript:");
      expect(html).not.toContain("<a ");
      expect(html).toContain("click");
    });

    it("downgrades a data: link to plain text", async () => {
      const html = await renderComment(markdown("[click](data:text/html;base64,PHNjcmlwdD4=)"));

      expect(html).not.toContain("<a ");
    });

    it("downgrades a protocol-relative link", async () => {
      const html = await renderComment(markdown("[click](//evil.test)"));

      expect(html).not.toContain("<a ");
    });

    it("escapes quotes in a link title", async () => {
      const html = await renderComment(markdown('[x](https://example.test "a" onmouseover="alert(1)")'));

      expect(html).not.toContain('onmouseover="alert(1)"');
    });

    it("keeps autolinks", async () => {
      const html = await renderComment(markdown("<https://example.test>"));

      expect(html).toContain('href="https://example.test/"');
    });
  });

  describe("images", () => {
    it("drops images, keeping only the alt text", async () => {
      const html = await renderComment(markdown("![tracking](https://evil.test/px.gif)"));

      expect(html).not.toContain("<img");
      expect(html).toContain("tracking");
    });
  });
});
