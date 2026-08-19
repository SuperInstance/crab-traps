// Unit tests — markdown renderer (zero-dependency, escape-first)

import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  renderInline,
  renderMarkdown,
  renderLureIndexPage,
  renderLurePage,
} from "./markdown";

describe("escapeHtml", () => {
  it("escapes the dangerous five", () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;"
    );
  });

  it("leaves plain text alone", () => {
    expect(escapeHtml("crab trap 42")).toBe("crab trap 42");
  });
});

describe("renderInline", () => {
  it("code spans", () => {
    expect(renderInline("use `connect` here")).toBe(
      "use <code>connect</code> here"
    );
  });

  it("bold and italics", () => {
    expect(renderInline("**bold** and *thin*")).toBe(
      "<strong>bold</strong> and <em>thin</em>"
    );
  });

  it("http(s) links only", () => {
    expect(renderInline("[fleet](http://example.com)")).toBe(
      '<a href="http://example.com" rel="noopener noreferrer">fleet</a>'
    );
    expect(renderInline("[x](javascript:alert(1))")).toBe(
      "[x](javascript:alert(1))"
    );
  });
});

describe("renderMarkdown", () => {
  it("renders headings h1-h6", () => {
    const html = renderMarkdown("# One\n## Two\n### Three\n#### Four\n##### Five\n###### Six");
    expect(html).toContain("<h1>One</h1>");
    expect(html).toContain("<h2>Two</h2>");
    expect(html).toContain("<h3>Three</h3>");
    expect(html).toContain("<h6>Six</h6>");
  });

  it("renders fenced code blocks and escapes their content", () => {
    const html = renderMarkdown("```bash\nget /look?agent=<crab>\n```");
    expect(html).toContain('<pre><code class="language-bash">');
    expect(html).toContain("get /look?agent=&lt;crab&gt;");
  });

  it("renders an unclosed fence gracefully", () => {
    const html = renderMarkdown("```\n dangling code");
    expect(html).toContain("<pre><code>");
  });

  it("renders unordered lists", () => {
    const html = renderMarkdown("- one\n- two\n* three");
    expect(html).toContain("<ul><li>one</li><li>two</li><li>three</li></ul>");
  });

  it("renders ordered lists", () => {
    const html = renderMarkdown("1. connect\n2. look\n3. submit");
    expect(html).toContain("<ol><li>connect</li><li>look</li><li>submit</li></ol>");
  });

  it("joins consecutive lines into one paragraph", () => {
    const html = renderMarkdown("line one\nline two\n\nline three");
    expect(html).toContain("<p>line one line two</p>");
    expect(html).toContain("<p>line three</p>");
  });

  it("stops paragraphs at structural elements", () => {
    const html = renderMarkdown("intro text\n# Heading");
    expect(html).toContain("<p>intro text</p>");
    expect(html).toContain("<h1>Heading</h1>");
  });

  it("escapes raw HTML in paragraphs", () => {
    const html = renderMarkdown("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("handles CRLF line endings", () => {
    const html = renderMarkdown("# Title\r\n\r\nbody\r\n");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<p>body</p>");
  });

  it("renders a realistic lure document", () => {
    const lure = [
      "# Oracle Trap",
      "",
      "Explore the fleet:",
      "1. Connect: `http://fleet/connect`",
      "2. Submit **answers**",
      "",
      "```json",
      "{\"agent\": \"crab\"}",
      "```",
    ].join("\n");
    const html = renderMarkdown(lure);
    expect(html).toContain("<h1>Oracle Trap</h1>");
    expect(html).toContain("<code>http://fleet/connect</code>");
    expect(html).toContain("<strong>answers</strong>");
    expect(html).toContain("&quot;agent&quot;");
  });
});

describe("renderLurePage", () => {
  it("wraps rendered markdown in a full HTML document", () => {
    const html = renderLurePage({
      id: "creative/dream-a-room",
      title: "Dream <Trap>",
      content: "# Dream <Trap>\nbody",
    });
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<title>Dream &lt;Trap&gt;</title>");
    expect(html).toContain("<h1>Dream &lt;Trap&gt;</h1>");
    expect(html).toContain('href="/random-lure"');
  });
});

describe("renderLureIndexPage", () => {
  it("links every lure and tags readmes", () => {
    const html = renderLureIndexPage([
      { id: "creative/dream-a-room", title: "Dream", is_readme: false },
      { id: "creative/README", title: "Creative", is_readme: true },
    ]);
    expect(html).toContain('href="/lures/creative/dream-a-room"');
    expect(html).toContain("(category readme)");
  });
});
