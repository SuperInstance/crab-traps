#!/usr/bin/env bash
# deploy.sh — Deploy the crab-trap-funnel Worker and optionally vectorize lures.
# Usage: ./scripts/deploy.sh [--vectorize]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Crab Trap Funnel Deploy ==="

# 1. Deploy Worker
echo ""
echo "--- Deploying Worker ---"
cd "$REPO_DIR/worker"

if ! command -v wrangler &> /dev/null; then
  echo "Installing wrangler..."
  npm install -g wrangler 2>/dev/null || npm install wrangler
fi

npx wrangler deploy
echo "Worker deployed successfully."

# 2. Optionally vectorize lures
if [[ "${1:-}" == "--vectorize" ]]; then
  echo ""
  echo "--- Vectorizing Lures ---"
  cd "$REPO_DIR"
  python3 scripts/vectorize-lures.py \
    --account-id "${CLOUDFLARE_ACCOUNT_ID}" \
    --api-token "${CLOUDFLARE_API_TOKEN}"
  echo "Lures vectorized."
fi

echo ""
echo "=== Deploy complete ==="
