// Badge layer — GET /badge/catches.svg renders a shields-style flat badge with
// the live catch count, for other repos' READMEs. On brand: navy label, amber
// value. D1 trouble renders an "n/a" badge with 200 — an <img> in a README
// should never see a 502.

import { Env } from "./index-helpers";
import { getTotalCatches } from "./stats";

const LABEL = "catches";
const NAVY = "#0b1220";
const AMBER = "#fbbf24";
const INK_LIGHT = "#e2e8f0";
const CHAR_W = 7; // approx Verdana 11px advance width
const PAD = 10; // per-side padding inside each half

function halfWidth(text: string): number {
  return text.length * CHAR_W + PAD * 2;
}

/** Pure renderer — count null means "storage unavailable" → n/a value. */
export function renderCatchesBadge(count: number | null): string {
  const value = count === null ? "n/a" : String(count);
  const labelW = halfWidth(LABEL);
  const valueW = halfWidth(value);
  const totalW = labelW + valueW;
  const labelX = labelW / 2;
  const valueX = labelW + valueW / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="20" role="img" aria-label="${LABEL}: ${value}">
<title>${LABEL}: ${value}</title>
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity=".06"/></linearGradient>
<clipPath id="r"><rect width="${totalW}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)">
<rect width="${labelW}" height="20" fill="${NAVY}"/>
<rect x="${labelW}" width="${valueW}" height="20" fill="${AMBER}"/>
<rect width="${totalW}" height="20" fill="url(#s)"/>
</g>
<g font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11" text-anchor="middle">
<text x="${labelX}" y="15" fill="${INK_LIGHT}">${LABEL}</text>
<text x="${valueX}" y="15" fill="${NAVY}">${value}</text>
</g>
</svg>`;
}

export function badgeResponse(svg: string): Response {
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=60",
    },
  });
}

export async function handleCatchesBadge(env: Env): Promise<Response> {
  let count: number | null;
  try {
    count = await getTotalCatches(env);
  } catch {
    count = null; // n/a badge, never 502
  }
  return badgeResponse(renderCatchesBadge(count));
}
