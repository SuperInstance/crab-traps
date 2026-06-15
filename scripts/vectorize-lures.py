#!/usr/bin/env python3
"""
vectorize-lures.py — Generate deterministic embeddings from all lure .md files
and upsert to Cloudflare Vectorize index.

Each lure is hashed to a 384-dimensional vector using TF-IDF-like hashing.
These are then upserted in batches to the configured Vectorize index.

Usage:
  python3 scripts/vectorize-lures.py \\
    --index crab-trap-lures \\
    --account-id <CF_ACCOUNT_ID> \\
    --api-token <CF_API_TOKEN> \\
    [--lures-dir lures/] \\
    [--dry-run]

Environment variables (fallback):
  CLOUDFLARE_ACCOUNT_ID
  CLOUDFLARE_API_TOKEN

No external dependencies — uses stdlib only.
"""

import os
import re
import json
import sys
import hashlib
import math
import argparse
import urllib.request
import urllib.error
from pathlib import Path

# ----------------------------------------------------------------
# Embedding generation
# ----------------------------------------------------------------

EMBEDDING_DIM = 384


def tokenize(text):
    """Simple tokenizer: lowercase, split on non-alpha, filter short tokens."""
    text = text.lower()
    tokens = re.findall(r"[a-z][a-z]+", text)
    return [t for t in tokens if len(t) >= 2]


def hash_feature(token, dim):
    """Deterministic hash of a token to a dimension index."""
    h = hashlib.md5(token.encode()).digest()
    return int.from_bytes(h[:4], "little") % dim


def generate_embedding(text):
    """Generate a 384-dim TF-IDF-like embedding deterministically."""
    tokens = tokenize(text)
    if not tokens:
        return [0.0] * EMBEDDING_DIM

    # TF: term frequency in this document
    tf = {}
    for t in tokens:
        tf[t] = tf.get(t, 0) + 1

    max_tf = max(tf.values()) if tf else 1

    vec = [0.0] * EMBEDDING_DIM

    for token, count in tf.items():
        dim = hash_feature(token, EMBEDDING_DIM)
        vec[dim] += count / max_tf

    # L2 normalize
    mag = math.sqrt(sum(v * v for v in vec))
    if mag > 0:
        vec = [v / mag for v in vec]

    return vec


def extract_lure_text(filepath):
    """Extract the meaningful text content from a lure markdown file."""
    with open(filepath) as f:
        content = f.read()

    # Remove code blocks
    content = re.sub(r"```.*?```", "", content, flags=re.DOTALL)
    # Remove inline code
    content = re.sub(r"`[^`]+`", "", content)

    # Extract important fields
    parts = []

    # Title from first h1
    title_match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
    if title_match:
        parts.append(title_match.group(1).strip())

    # Description/behavior sections
    for section in ["description", "behavior", "goal", "task", "category"]:
        m = re.search(
            rf"^##\s+{section}\s*\n(.+?)(?:\n##|\Z)",
            content, re.MULTILINE | re.DOTALL | re.IGNORECASE
        )
        if m:
            section_text = m.group(1).strip()
            # Take first 200 chars of each section
            parts.append(section_text[:200])

    # HTTP endpoints
    endpoints = re.findall(r"https?://[^\s)\"'\]]+", content)
    parts.extend(endpoints[:5])

    return "\n".join(parts)


# ----------------------------------------------------------------
# Cloudflare Vectorize API (stdlib only — no requests needed)
# ----------------------------------------------------------------

VECTORIZE_BASE = "https://api.cloudflare.com/client/v4/accounts"


def _cf_api(url, api_token, data=None, method=None):
    """Call Cloudflare API with JSON body, no external dependencies."""
    headers = {
        "Authorization": f"Bearer {api_token}",
        "Content-Type": "application/json",
    }
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(
        url, data=body, headers=headers, method=method or ("POST" if data else "GET")
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()[:300] if e.fp else "no body"
        return {"success": False, "status": e.code, "error_body": error_body}
    except Exception as e:
        return {"success": False, "error": str(e)}


def upsert_vectors(account_id, api_token, index_name, vectors, batch_size=100):
    """Upsert vectors to Cloudflare Vectorize index in batches."""
    url = f"{VECTORIZE_BASE}/{account_id}/vectorize/v2/indexes/{index_name}/upsert"

    total = len(vectors)
    success = 0
    failures = []

    for i in range(0, total, batch_size):
        batch = vectors[i : i + batch_size]
        payload = {"vectors": batch}

        result = _cf_api(url, api_token, data=payload, method="POST")
        if not result.get("success"):
            failures.append({
                "batch_start": i,
                "errors": result.get("errors", [result.get("error_body", str(result))]),
            })
            continue

        success += len(batch)
        print(f"  Upserted batch {i//batch_size + 1}/{(total-1)//batch_size + 1} ({len(batch)} vectors)")

    return success, failures


def ensure_index_exists(account_id, api_token, index_name):
    """Check if the Vectorize index exists, return True if it does or was created."""
    url = f"{VECTORIZE_BASE}/{account_id}/vectorize/v2/indexes/{index_name}"

    result = _cf_api(url, api_token)

    if result.get("success"):
        print(f"Index '{index_name}' already exists")
        return True

    # Try to create it
    create_url = f"{VECTORIZE_BASE}/{account_id}/vectorize/v2/indexes"
    create_payload = {
        "name": index_name,
        "dimensions": EMBEDDING_DIM,
        "metric": "cosine",
    }
    result = _cf_api(create_url, api_token, data=create_payload, method="POST")
    if result.get("success"):
        print(f"Created index '{index_name}' ({EMBEDDING_DIM} dim, cosine)")
        return True

    print(f"ERROR ensuring index: {result.get('errors', result.get('error_body', str(result)))}")
    return False


# ----------------------------------------------------------------
# Main
# ----------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Vectorize lure markdown files to Cloudflare Vectorize")
    parser.add_argument("--index", default="crab-trap-lures", help="Vectorize index name")
    parser.add_argument("--lures-dir", default="lures/", help="Directory containing lure .md files")
    parser.add_argument("--account-id", help="Cloudflare account ID (env: CLOUDFLARE_ACCOUNT_ID)")
    parser.add_argument("--api-token", help="Cloudflare API token (env: CLOUDFLARE_API_TOKEN)")
    parser.add_argument("--dry-run", action="store_true", help="Generate vectors but don't upsert")
    args = parser.parse_args()

    account_id = args.account_id or os.environ.get("CLOUDFLARE_ACCOUNT_ID")
    api_token = args.api_token or os.environ.get("CLOUDFLARE_API_TOKEN")

    if not args.dry_run and not (account_id and api_token):
        print("ERROR: --account-id and --api-token required (or set CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN)")
        sys.exit(1)

    # Find all lure .md files
    lures_path = Path(args.lures_dir)
    if not lures_path.is_dir():
        print(f"ERROR: Lures directory '{args.lures_dir}' not found")
        sys.exit(1)

    md_files = sorted(lures_path.rglob("*.md"), key=lambda p: str(p))
    # Exclude known README files
    md_files = [f for f in md_files if f.name != "README.md"]

    if not md_files:
        print(f"WARNING: No lure .md files found in '{args.lures_dir}'")
        sys.exit(0)

    print(f"Processing {len(md_files)} lure files...")

    vectors = []
    for filepath in md_files:
        relpath = str(filepath.relative_to(lures_path.parent))

        # Extract text and generate embedding
        text = extract_lure_text(filepath)
        embedding = generate_embedding(text)

        # Read raw content for metadata
        with open(filepath) as f:
            raw_content = f.read()

        vector_id = f"lure:{relpath}"
        vectors.append({
            "id": vector_id,
            "values": embedding,
            "metadata": {
                "lure_path": relpath,
                "lure_content": raw_content[:1000],  # Store first 1000 chars
                "lure_length": len(raw_content),
            },
        })

    print(f"Generated {len(vectors)} embeddings (dim={EMBEDDING_DIM})")

    if args.dry_run:
        print("DRY RUN — skipping upsert. Sample first vector:")
        sample = json.dumps(
            {k: vectors[0][k] for k in vectors[0] if k != "values"},
            indent=2
        )
        print(sample)
        print(f"  (vector has {len(vectors[0]['values'])} dimensions)")
        sys.exit(0)

    # Ensure index exists
    if not ensure_index_exists(account_id, api_token, args.index):
        print(f"ERROR: Cannot proceed — index '{args.index}' not available")
        sys.exit(1)

    # Upsert
    success, failures = upsert_vectors(account_id, api_token, args.index, vectors)

    print(f"\nUpsert complete: {success}/{len(vectors)} vectors inserted")
    if failures:
        print(f"Failures: {len(failures)}")
        for f in failures:
            print(f"  Batch {f.get('batch_start')}: {f.get('errors', 'unknown error')}")
        sys.exit(1)

    sys.exit(0)


if __name__ == "__main__":
    main()
