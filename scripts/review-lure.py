#!/usr/bin/env python3
"""
review-lure.py — Structural lint review of lure markdown files.

Checks each lure .md file for:
  - markdown structure (headers, sections)
  - HTTP endpoints present
  - 20+ character description/goal
  - No absolute/unqualified claims (e.g., "best", "perfect")
  - Has a `source` field or equivalent attribution

Usage: python3 scripts/review-lure.py [--path lures/]

Returns exit code 0 on pass, 1 on warnings, 2 on errors.
"""

import os
import re
import sys
import json
import argparse

# --- Rule definitions ---

REQUIRED_SECTIONS_AGENT = ["agent", "task", "behavior", "source"]
REQUIRED_SECTIONS_CATEGORY = ["category", "description", "goal", "source"]

ABSOLUTE_CLAIMS = r"\b(best|perfect|always|never|the only|guaranteed)\b"

MIN_DESCRIPTION_LENGTH = 20

def check_path_exists(path):
    if not os.path.isdir(path):
        print(f"ERROR: Path '{path}' does not exist or is not a directory")
        return False
    return True

def find_markdown_files(path):
    md_files = []
    for root, dirs, files in os.walk(path):
        for f in files:
            if f.endswith(".md"):
                md_files.append(os.path.join(root, f))
    return sorted(md_files)

def check_structure(content, filepath, issues):
    """Check markdown structure has expected headers."""
    headers = re.findall(r"^#{1,6}\s+(.+)$", content, re.MULTILINE)
    header_names = {h.strip().lower() for h in headers}

    # Determine if agent-specific or category lure
    is_agent = "agent-specific" in filepath.replace("\\", "/")

    required = REQUIRED_SECTIONS_AGENT if is_agent else REQUIRED_SECTIONS_CATEGORY

    for section in required:
        # Check if any header matches or contains the required section name
        matched = any(section in h for h in header_names)
        if not matched:
            issues.append({
                "severity": "warning",
                "file": filepath,
                "rule": "required_section",
                "message": f"Missing required section header: '{section}'",
            })

    return len(issues)

def check_http_endpoints(content, filepath, issues):
    """Check for HTTP endpoints."""
    endpoints = re.findall(r"https?://[^\s)\"'\]]+", content)
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
    # Look for description or goal after their headers
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
    """Check for source attribution."""
    has_source = bool(re.search(
        r"source[:\s]", content[content.find("# source"):] if "# source" in content.lower() else content,
        re.IGNORECASE
    ))
    # Fallback: check whole content
    if not has_source:
        has_source = bool(re.search(
            r"^(?:source|origin|attribution|reference)[:\s].+",
            content, re.MULTILINE | re.IGNORECASE
        ))
    if not has_source:
        issues.append({
            "severity": "warning",
            "file": filepath,
            "rule": "missing_source",
            "message": "No source/origin/attribution field found",
        })

def review_file(filepath):
    """Review a single lure markdown file."""
    with open(filepath) as f:
        content = f.read()

    issues = []

    check_structure(content, filepath, issues)
    check_http_endpoints(content, filepath, issues)
    check_description_length(content, filepath, issues)
    check_absolute_claims(content, filepath, issues)
    check_source_field(content, filepath, issues)

    return issues

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
        print(f"INFO: No markdown files found in {base_path}")
        sys.exit(0)

    all_issues = []
    files_checked = 0

    for filepath in md_files:
        relpath = os.path.relpath(filepath, start=os.getcwd())
        issues = review_file(filepath)
        if issues:
            all_issues.extend(issues)
        files_checked += 1

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
