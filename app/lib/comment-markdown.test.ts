import { describe, it, expect, vi, afterEach } from "vitest";
import { renderComment } from "./comment-markdown.server";
import { markdown } from "./text";

// The highlighter is cached at module level, so only the first render builds
// it. Tests about how it is built import a fresh copy of the module.
async function freshRenderComment() {
  vi.resetModules();
  const mod = await import("./comment-markdown.server");
  return mod.renderComment;
}

const HIGHLIGHTED_TOKEN = /<span style="color:#/;

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
      const render = await freshRenderComment();

      const html = await render(markdown("```typescript\nconst a = 1;\n```"));

      expect(html).toContain('<pre class="shiki github-dark"');
      expect(html).toContain('<span style="color:#F97583">const</span>');
    });

    it.each([
      ["typescript", "const a = 1;"],
      ["javascript", "const a = 1;"],
      ["json", '{"a": 1}'],
      ["bash", "echo hi"],
      ["html", "<div></div>"],
      ["css", "a { color: red; }"],
      ["tsx", "const a = <div />;"],
      ["jsx", "const a = <div />;"],
      ["sql", "SELECT 1;"],
      ["yaml", "a: 1"],
      ["markdown", "# Title"],
    ])("highlights %s", async (lang, code) => {
      const html = await renderComment(
        markdown("```" + lang + "\n" + code + "\n```")
      );

      expect(html).toMatch(HIGHLIGHTED_TOKEN);
    });

    it("renders unknown languages as unhighlighted shiki text", async () => {
      const html = await renderComment(markdown("```brainfuck\n+++\n```"));

      expect(html).toContain('<pre class="shiki github-dark"');
      expect(html).toContain("<span>+++</span>");
      expect(html).not.toMatch(HIGHLIGHTED_TOKEN);
    });

    it("renders code without a language as unhighlighted shiki text", async () => {
      const html = await renderComment(markdown("```\n+++\n```"));

      expect(html).toContain('<pre class="shiki github-dark"');
      expect(html).toContain("<span>+++</span>");
    });

    describe("when shiki fails", () => {
      afterEach(() => {
        vi.doUnmock("shiki");
      });

      it("falls back to an escaped plain block", async () => {
        vi.doMock("shiki", () => ({
          createHighlighter: async () => ({
            codeToHtml: () => {
              throw new Error("boom");
            },
          }),
        }));
        const render = await freshRenderComment();

        const html = await render(markdown("```typescript\n<b>&</b>\n```"));

        expect(html).toBe("<pre><code>&lt;b&gt;&amp;&lt;/b&gt;</code></pre>");
      });
    });

    it("escapes markup inside code blocks", async () => {
      const html = await renderComment(
        markdown("```html\n<script>alert(1)</script>\n```")
      );

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
      const html = await renderComment(
        markdown("<script>alert('xss')</script>")
      );

      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });

    it("escapes an event-handler attribute", async () => {
      const html = await renderComment(
        markdown('<img src=x onerror="alert(1)">')
      );

      expect(html).not.toContain("<img");
      expect(html).not.toContain('onerror="alert(1)"');
    });

    it("escapes an iframe", async () => {
      const html = await renderComment(
        markdown('<iframe src="https://evil.test">')
      );

      expect(html).not.toContain("<iframe");
    });

    it("escapes inline HTML mixed into a paragraph", async () => {
      const html = await renderComment(
        markdown("hello <b onclick='x()'>there</b>")
      );

      expect(html).not.toContain("<b onclick");
      expect(html).toContain("&lt;b onclick");
    });

    it("escapes ampersands and both kinds of quote", async () => {
      const html = await renderComment(
        markdown(`<span title="a&b" class='x'>`)
      );

      expect(html).toContain(
        "&lt;span title=&quot;a&amp;b&quot; class=&#39;x&#39;&gt;"
      );
    });

    it("escapes a style tag", async () => {
      const html = await renderComment(
        markdown("<style>body{display:none}</style>")
      );

      expect(html).not.toContain("<style>");
    });
  });

  describe("links", () => {
    it("keeps https links and marks them nofollow", async () => {
      const html = await renderComment(
        markdown("[docs](https://example.test/a)")
      );

      expect(html).toBe(
        '<p><a href="https://example.test/a" rel="nofollow noopener noreferrer" target="_blank">docs</a></p>\n'
      );
    });

    it("keeps http links", async () => {
      const html = await renderComment(
        markdown("[docs](http://example.test/a)")
      );

      expect(html).toContain('href="http://example.test/a"');
    });

    it("keeps mailto links", async () => {
      const html = await renderComment(
        markdown("[mail](mailto:a@example.test)")
      );

      expect(html).toContain('href="mailto:a@example.test"');
    });

    it("keeps relative links", async () => {
      const html = await renderComment(
        markdown("[lesson](/courses/x/lessons/1)")
      );

      expect(html).toContain('href="/courses/x/lessons/1"');
    });

    it("trims whitespace around a relative link", async () => {
      const html = await renderComment(markdown("[lesson](< /courses>)"));

      expect(html).toContain('href="/courses"');
    });

    it("downgrades a javascript: link to plain text", async () => {
      const html = await renderComment(
        markdown("[click](javascript:alert(1))")
      );

      expect(html).not.toContain("javascript:");
      expect(html).not.toContain("<a ");
      expect(html).toContain("click");
    });

    it("downgrades a data: link to plain text", async () => {
      const html = await renderComment(
        markdown("[click](data:text/html;base64,PHNjcmlwdD4=)")
      );

      expect(html).not.toContain("<a ");
    });

    it("downgrades a protocol-relative link", async () => {
      const html = await renderComment(markdown("[click](//evil.test)"));

      expect(html).not.toContain("<a ");
    });

    it("escapes quotes in a link title", async () => {
      const html = await renderComment(
        markdown(`[x](https://example.test 'a" onmouseover="alert(1)')`)
      );

      expect(html).toContain('title="a&quot; onmouseover=&quot;alert(1)" rel=');
    });

    it("keeps autolinks", async () => {
      const html = await renderComment(markdown("<https://example.test>"));

      expect(html).toContain('href="https://example.test/"');
    });
  });

  describe("images", () => {
    it("drops images, keeping only the alt text", async () => {
      const html = await renderComment(
        markdown("![tracking](https://evil.test/px.gif)")
      );

      expect(html).not.toContain("<img");
      expect(html).toContain("tracking");
    });
  });
});
