#!/usr/bin/env bash
# Deploy the Crab Trap Funnel Worker to Cloudflare
# Usage: ./deploy.sh [--dry-run]
set -euo pipefail

cd "$(dirname "$0")"

echo "=== Crab Trap Funnel Deploy ==="
echo ""

# 1. Install deps if needed
if [ ! -d "node_modules" ]; then
  echo "→ Installing dependencies..."
  npm install
fi

# 2. Build pages bundle
echo "→ Building pages bundle..."
npm run build
echo ""

# 3. Check wrangler
if ! command -v wrangler &>/dev/null; then
  echo "✗ wrangler not found. Run: npm install"
  exit 1
fi

# 4. Deploy
if [ "${1:-}" = "--dry-run" ]; then
  echo "→ Dry run — skipping deploy"
  exit 0
fi

echo "→ Deploying to Cloudflare..."
npx wrangler deploy

echo ""
echo "✓ Deploy complete!"
