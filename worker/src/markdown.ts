// Tiny zero-dependency markdown renderer for lure serving.
// Renders a safe subset: headings, fenced code, inline code, bold, italics,
// http(s) links, unordered/ordered lists, paragraphs. All input is HTML-escaped
// first — lure content can never inject markup.

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Inline formatting applied to already-escaped text. */
export function renderInline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" rel="noopener noreferrer">$1</a>'
    );
}

export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (/^\s*```/.test(line)) {
      const lang = escapeHtml(line.trim().slice(3).trim());
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        buf.push(escapeHtml(lines[i]));
        i++;
      }
      i++; // skip closing fence
      out.push(
        `<pre><code${lang ? ` class="language-${lang}"` : ""}>${buf.join("\n")}</code></pre>`
      );
      continue;
    }

    // Heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level}>${renderInline(escapeHtml(h[2].trim()))}</h${level}>`);
      i++;
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(
          `<li>${renderInline(escapeHtml(lines[i].replace(/^\s*[-*]\s+/, "")))}</li>`
        );
        i++;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(
          `<li>${renderInline(escapeHtml(lines[i].replace(/^\s*\d+\.\s+/, "")))}</li>`
        );
        i++;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    // Blank line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph: gather until blank line or structural element
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^\s*(```|#{1,6}\s|[-*]\s|\d+\.\s)/.test(lines[i])
    ) {
      para.push(escapeHtml(lines[i].trim()));
      i++;
    }
    out.push(`<p>${renderInline(para.join(" "))}</p>`);
  }

  return out.join("\n");
}

export function renderLurePage(lure: {
  id: string;
  title: string;
  content: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(lure.title)}</title>
<style>
body{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;max-width:72ch;margin:2rem auto;padding:0 1rem;line-height:1.55;background:#0b1220;color:#e2e8f0}
a{color:#7dd3fc}
code{background:#1e293b;padding:0 .3em;border-radius:3px}
pre{background:#1e293b;padding:1em;overflow-x:auto;border-radius:6px}
pre code{background:none;padding:0}
h1,h2,h3{color:#fbbf24}
.meta{color:#94a3b8;font-size:.9em}
</style>
</head>
<body>
<p class="meta">lure: ${escapeHtml(lure.id)} · <a href="/lures">all lures</a> · <a href="/random-lure">random lure</a> · <a href="/lures/${escapeHtml(lure.id)}?format=json">json</a></p>
${renderMarkdown(lure.content)}
</body>
</html>`;
}

export function renderLureIndexPage(
  lures: { id: string; title: string; isReadme: boolean }[]
): string {
  const items = lures
    .map(
      (l) =>
        `<li><a href="/lures/${escapeHtml(l.id)}">${escapeHtml(l.title)}</a>${l.isReadme ? ' <span class="meta">(category readme)</span>' : ""}</li>`
    )
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Crab Trap Lures</title>
<style>
body{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;max-width:72ch;margin:2rem auto;padding:0 1rem;line-height:1.55;background:#0b1220;color:#e2e8f0}
a{color:#7dd3fc}
h1{color:#fbbf24}
.meta{color:#94a3b8}
</style>
</head>
<body>
<h1>Crab Trap Lures</h1>
<p class="meta"><a href="/random-lure">random lure</a> · <a href="/lures?format=json">json</a> · <a href="/lures?format=md">markdown</a></p>
<ul>
${items}
</ul>
</body>
</html>`;
}
