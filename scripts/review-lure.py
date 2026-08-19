#!/usr/bin/env python3
"""
review-lure.py — Structural lint review of lure markdown files.

Checks each lure .md file (category READMEs and QUICK-START.md are index
documents, not lures, and are skipped) for:
  - markdown structure — the file matches a recognized lure template
    (modern "Category/Difficulty/Description/Goal" or "## The Lure" or
    "# Hooks:" or agent-specific "Agent Profile")
  - difficulty coherence — `## Difficulty` values follow the Level 1–5 scheme
    (the catalog's five levels), and all five levels are present catalog-wide
  - HTTP endpoints — at least one URL present, and every URL resolves against
    the fleet's known endpoint map (offline allowlist; no network in CI):
      * 147.224.38.131 — known fleet service ports only, plain http
      * fleet.cocapn.ai — only paths verified live on the dashboard API
      * github.com — only the SuperInstance org (the fleet's real source org)
      * cocapn.ai — the project's public face
  - 20+ character description/goal
  - No absolute/unqualified claims (e.g., "best", "perfect")
  - Source attribution for modern-template lures

Usage: python3 scripts/review-lure.py [--path lures/] [--json] [--file FILE]

Returns exit code 0 on pass, 1 on warnings, 2 on errors.
"""

import os
import re
import sys
import json
import argparse
from urllib.parse import urlparse

# --- Rule definitions ---

# Index documents that are not lures themselves.
NON_LURE_NAMES = {"README.md", "QUICK-START.md"}

ABSOLUTE_CLAIMS = r"\b(best|perfect|always|never|the only|guaranteed)\b"

MIN_DESCRIPTION_LENGTH = 20

# Difficulty scheme: the catalog's five levels, marked `## Difficulty` with
# "Level N — <what it demands>". Other values (or none) are allowed, but
# off-scheme values are flagged so the vocabulary stays coherent.
DIFFICULTY_LEVELS = (1, 2, 3, 4, 5)
DIFFICULTY_RE = re.compile(r"^level\s+([1-5])\b", re.IGNORECASE)

# --- Offline endpoint allowlist (verified 2026-08-19) ---
# 147.224.38.131: the home PLATO fleet. The host sits behind Cloudflare and
# refuses direct-IP requests (error 1003) — from CI *and* through the
# worker's /fleet/* proxy — so per-port liveness can't be probed at all.
# The ports below are the coherent service map every lure agrees on
# (MUD, Lock, Arena, Grammar, Dashboard, Nexus, Domain Rooms,
# Skill Forge, terminal, telnet MUD, tile library, PLATO Shell, orchestrator,
# adaptive MUD, monitor, scorer).
FLEET_HOST = "147.224.38.131"
FLEET_PORTS = frozenset({
    4042, 4043, 4044, 4045, 4046, 4047, 4050, 4057, 4060,
    7777, 8847, 8848, 8849, 8850, 8851, 8852,
})

# fleet.cocapn.ai is fleet-dashboard-api; these are the paths its root
# listing advertises (probed live 2026-08-19). Anything else 404s — notably
# /api/stats and /api/disc-golf-board/ /api/disc-golf/prompt, which older
# lures and the README still mention.
DASHBOARD_HOST = "fleet.cocapn.ai"
DASHBOARD_VERIFIED = frozenset({
    "/",
    "/api/fleet/status",
    "/api/fleet/agents",
    "/api/fleet/history",
    "/api/fleet/config",
    "/api/benchmark",
})

# github.com/cocapn 404s — the fleet's real source home is the SuperInstance
# *user* (not an org: github.com/orgs/SuperInstance 404s too).
GITHUB_ALLOWED_PREFIXES = ("/SuperInstance",)

KNOWN_HOSTS = {FLEET_HOST, DASHBOARD_HOST, "cocapn.ai", "github.com"}

ENDPOINT_RE = re.compile(r"https?://[^\s\"'\]\)}>]+")


def check_path_exists(path):
    if not os.path.isdir(path):
        print(f"ERROR: Path '{path}' does not exist or is not a directory")
        return False
    return True


def find_markdown_files(path):
    """All lure .md files under path — excluding category READMEs and
    QUICK-START.md, which are indexes rather than lures."""
    md_files = []
    for root, dirs, files in os.walk(path):
        for f in files:
            if f.endswith(".md") and f not in NON_LURE_NAMES:
                md_files.append(os.path.join(root, f))
    return sorted(md_files)


def _strip_url_junk(url):
    """Drop trailing punctuation that the regex may have swallowed."""
    return re.sub(r"[.,;:!?'\"]+$", "", url)


def _parse_url(url):
    """Normalize a raw URL token → (scheme, hostname, port, path) or None."""
    url = _strip_url_junk(url)
    try:
        p = urlparse(url)
    except ValueError:
        return None
    if not p.scheme or not p.netloc:
        return None
    try:
        port = p.port
    except ValueError:
        return None
    host = (p.hostname or "").lower()
    if not host:
        return None
    return p.scheme.lower(), host, port, p.path or "/"


# --- Checks ---

def check_structure(content, filepath, issues):
    """Recognized lure templates: modern sectioned, '## The Lure', '# Hooks:',
    or agent-specific 'Agent Profile'."""
    headers = re.findall(r"^#{1,6}\s+(.+)$", content, re.MULTILINE)
    header_names = {h.strip().lower() for h in headers}
    recognized = (
        any("category" in h for h in header_names)
        or any("the lure" in h for h in header_names)
        or any("agent profile" in h for h in header_names)
        or any("hooks" in h for h in header_names)
        or bool(re.search(r"^#\s+hooks:", content, re.MULTILINE | re.IGNORECASE))
    )
    if not recognized:
        issues.append({
            "severity": "warning",
            "file": filepath,
            "rule": "unrecognized_structure",
            "message": "No recognized lure template (Category, 'The Lure', 'Agent Profile', or '# Hooks:')",
        })


def check_difficulty(content, filepath, issues):
    """Difficulty values should follow the catalog's Level 1–5 scheme."""
    m = re.search(r"^##\s+difficulty\s*\n([^\n]+)", content, re.MULTILINE | re.IGNORECASE)
    if not m:
        return None  # absent is allowed; off-scheme is not
    value = m.group(1).strip()
    if not DIFFICULTY_RE.match(value):
        issues.append({
            "severity": "warning",
            "file": filepath,
            "rule": "difficulty_off_scheme",
            "message": f"Difficulty '{value[:40]}' is off the Level 1–5 scheme",
        })
        return None
    return int(DIFFICULTY_RE.match(value).group(1))


def check_endpoints(content, filepath, issues):
    """Flag URLs that don't resolve against the fleet's known endpoint map."""
    for raw in ENDPOINT_RE.findall(content):
        parsed = _parse_url(raw)
        if parsed is None:
            continue
        scheme, host, port, path = parsed

        if host not in KNOWN_HOSTS:
            issues.append({
                "severity": "warning",
                "file": filepath,
                "rule": "unknown_endpoint_host",
                "message": f"Unknown endpoint host: {raw}",
            })
            continue

        if host == FLEET_HOST:
            if scheme != "http":
                issues.append({
                    "severity": "warning",
                    "file": filepath,
                    "rule": "https_on_fleet_host",
                    "message": f"Fleet services are plain http, got https: {raw}",
                })
            if port is not None and port not in FLEET_PORTS:
                issues.append({
                    "severity": "warning",
                    "file": filepath,
                    "rule": "unknown_fleet_port",
                    "message": f"Unknown fleet port {port} (known: {sorted(FLEET_PORTS)}): {raw}",
                })

        elif host == DASHBOARD_HOST:
            prefix = path.rstrip("/")
            allowed = any(
                (prefix == "" and v == "/") or prefix == v or prefix.startswith(v + "/")
                for v in DASHBOARD_VERIFIED
            )
            if not allowed:
                issues.append({
                    "severity": "warning",
                    "file": filepath,
                    "rule": "unverified_dashboard_path",
                    "message": f"fleet.cocapn.ai path not on the live dashboard API: {raw} "
                               "(verified paths: /api/fleet/status, /api/fleet/agents, "
                               "/api/fleet/history, /api/benchmark, /api/fleet/config)",
                })

        elif host == "github.com" and not path.startswith(GITHUB_ALLOWED_PREFIXES):
                issues.append({
                    "severity": "warning",
                    "file": filepath,
                    "rule": "unknown_github_path",
                    "message": f"github.com/cocapn 404s (and SuperInstance is a user, "
                               f"not an org — /orgs/... 404s too): {raw}",
                })


def check_http_endpoints(content, filepath, issues):
    """Check for HTTP endpoints."""
    endpoints = ENDPOINT_RE.findall(content)
    if not endpoints:
        issues.append({
            "severity": "warning",
            "file": filepath,
            "rule": "http_endpoints",
            "message": "No HTTP endpoints found — lure should reference at least one URL",
        })
    return endpoints


def check_description_length(content, filepath, issues):
    """Check description/goal has minimum length."""
    desc_match = re.search(
        r"(?:^#{1,6}\s*(?:description|goal|behavior)[^:]*:?\s*\n)(.+?)(?:\n#|\Z)",
        content, re.MULTILINE | re.DOTALL | re.IGNORECASE
    )
    if desc_match:
        desc = desc_match.group(1).strip()
        if len(desc) < MIN_DESCRIPTION_LENGTH:
            issues.append({
                "severity": "error",
                "file": filepath,
                "rule": "short_description",
                "message": f"Description/goal is too short ({len(desc)} chars, min {MIN_DESCRIPTION_LENGTH})",
            })


def check_absolute_claims(content, filepath, issues):
    """Flag absolute claims."""
    matches = re.findall(ABSOLUTE_CLAIMS, content, re.IGNORECASE)
    for m in matches:
        issues.append({
            "severity": "warning",
            "file": filepath,
            "rule": "absolute_claim",
            "message": f"Potentially absolute claim: '{m}' — prefer qualified language",
        })


def check_source_field(content, filepath, issues):
    """Check for source attribution — only required for modern-template lures
    (those with a Category section), which are expected to carry an origin."""
    if not re.search(r"^#{1,6}\s+category\b", content, re.MULTILINE | re.IGNORECASE):
        return  # older plain-body lures attribute inline or not at all
    has_source = bool(re.search(
        r"^(?:source|origin|attribution|reference)[:\s].+",
        content, re.MULTILINE | re.IGNORECASE
    ))
    if not has_source:
        issues.append({
            "severity": "warning",
            "file": filepath,
            "rule": "missing_source",
            "message": "Modern-template lure lacks a Source/origin attribution section",
        })


def review_file(filepath):
    """Review a single lure markdown file."""
    with open(filepath) as f:
        content = f.read()

    issues = []

    check_structure(content, filepath, issues)
    check_difficulty(content, filepath, issues)
    check_endpoints(content, filepath, issues)
    check_http_endpoints(content, filepath, issues)
    check_description_length(content, filepath, issues)
    check_absolute_claims(content, filepath, issues)
    check_source_field(content, filepath, issues)

    return issues


def catalog_difficulty_check(md_files, issues):
    """Catalog-wide: every level 1–5 should have at least one lure."""
    found = set()
    for filepath in md_files:
        with open(filepath) as f:
            content = f.read()
        m = re.search(r"^##\s+difficulty\s*\n([^\n]+)", content, re.MULTILINE | re.IGNORECASE)
        if not m:
            continue
        dm = DIFFICULTY_RE.match(m.group(1).strip())
        if dm:
            found.add(int(dm.group(1)))
    missing = [n for n in DIFFICULTY_LEVELS if n not in found]
    if missing:
        issues.append({
            "severity": "warning",
            "file": "(catalog)",
            "rule": "missing_difficulty_level",
            "message": f"No lure carries Level {missing} — the catalog should cover Levels 1–5",
        })


def main():
    parser = argparse.ArgumentParser(description="Review lure markdown files")
    parser.add_argument("--path", default="lures/", help="Path to lures directory")
    parser.add_argument("--json", action="store_true", help="Output JSON")
    parser.add_argument("--file", help="Review a single file instead of the whole directory")
    args = parser.parse_args()

    base_path = args.path

    if args.file:
        md_files = [args.file]
    else:
        if not check_path_exists(base_path):
            sys.exit(2)
        md_files = find_markdown_files(base_path)

    if not md_files:
        print(f"INFO: No lure markdown files found in {base_path}")
        sys.exit(0)

    all_issues = []
    files_checked = 0

    for filepath in md_files:
        relpath = os.path.relpath(filepath, start=os.getcwd())
        issues = review_file(filepath)
        if issues:
            all_issues.extend(issues)
        files_checked += 1

    catalog_difficulty_check(md_files, all_issues)

    # Summary
    errors = [i for i in all_issues if i["severity"] == "error"]
    warnings = [i for i in all_issues if i["severity"] == "warning"]

    if args.json:
        print(json.dumps({
            "files_checked": files_checked,
            "issues": all_issues,
            "errors": len(errors),
            "warnings": len(warnings),
            "pass": len(errors) == 0,
        }, indent=2))
    else:
        print(f"Review: {files_checked} files checked")
        print(f"Errors: {len(errors)} | Warnings: {len(warnings)}")

        if all_issues:
            print("\nIssues:")
            for issue in all_issues:
                print(f"  [{issue['severity'].upper()}] {issue['file']}")
                print(f"    {issue['rule']}: {issue['message']}")

    # Exit code: 0 = pass, 1 = warnings only, 2 = errors
    if errors:
        sys.exit(2)
    if warnings:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
