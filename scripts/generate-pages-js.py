#!/usr/bin/env python3
"""
generate-pages-js.py — Regenerate worker/src/pages.js from individual HTML files.

Run this after adding/updating HTML files in worker/pages/.
The generated file is used by the Worker at runtime.

Usage: python3 scripts/generate-pages-js.py [--pages-dir worker/pages] [--output worker/src/pages.js]
"""

import os, re, json, argparse
from pathlib import Path

DOMAIN_FILES = {
    "deckboss.net": "deckboss-net",
    "lucineer.com": "lucineer-com",
    "deckboss.ai": "deckboss-ai",
    "capitaine.ai": "capitaine-ai",
    "capitaineai.com": "capitaineai-com",
    "dmlog.ai": "dmlog-ai",
    "studylog.ai": "studylog-ai",
    "playerlog.ai": "playerlog-ai",
    "purplepincher.org": "purplepincher-org",
    "personallog.ai": "personallog-ai",
    "activelog.ai": "activelog-ai",
    "cocapn.ai": "cocapn-ai",
    "makerlog.ai": "makerlog-ai",
    "api.cocapn.ai": "api-cocapn-ai",
    "superinstance.ai": "superinstance-ai",
    "luciddreamer.ai": "luciddreamer-ai",
    "fishinglog.ai": "fishinglog-ai",
    "activeledger.ai": "activeledger-ai",
    "cocapn.com": "cocapn-com",
    "reallog.ai": "reallog-ai",
    "businesslog.ai": "businesslog-ai",
}


def generate_pages_js(pages_dir, output_path):
    lines = [
        "// Auto-generated from worker/pages/*.html — DO NOT EDIT MANUALLY",
        "// To update, modify the HTML files and run: python3 scripts/generate-pages-js.py",
        "export const PAGES = {",
        "",
    ]

    for domain, base in sorted(DOMAIN_FILES.items()):
        path = os.path.join(pages_dir, f"{base}.html")
        with open(path) as f:
            html = f.read()
        html_escaped = html.replace("`", "\\`").replace("${", "\\${")
        lines.append(f'  "{domain}": `{html_escaped}`,')
        lines.append("")

    # Trap page
    trap_path = os.path.join(pages_dir, "trap.html")
    with open(trap_path) as f:
        trap_html = f.read()
    trap_escaped = trap_html.replace("`", "\\`").replace("${", "\\${")
    lines.append(f'  "trap": `{trap_escaped}`,')
    lines.append("")

    lines.append("};")

    with open(output_path, "w") as f:
        f.write("\n".join(lines))

    size = os.path.getsize(output_path)
    print(f"Generated {output_path} ({size:,} bytes)")


def main():
    parser = argparse.ArgumentParser(description="Generate pages.js from HTML files")
    parser.add_argument("--pages-dir", default="worker/pages", help="Directory with HTML files")
    parser.add_argument("--output", default="worker/src/pages.js", help="Output JS file")
    args = parser.parse_args()
    generate_pages_js(args.pages_dir, args.output)


if __name__ == "__main__":
    main()
