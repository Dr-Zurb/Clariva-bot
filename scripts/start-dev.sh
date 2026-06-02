#!/usr/bin/env bash
# Start Clariva local dev (backend + frontend). Requires Redis for webhooks.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="${HOME}/.local/node-v20.19.2-darwin-arm64/bin:${PATH:-}"

if ! command -v node >/dev/null 2>&1; then
  echo "Node not found. Open a new Terminal tab (loads ~/.zshrc) or run:"
  echo '  export PATH="$HOME/.local/node-v20.19.2-darwin-arm64/bin:$PATH"'
  exit 1
fi

echo "Node $(node -v) | npm $(npm -v)"
echo "Backend:  http://localhost:3001"
echo "Frontend: http://localhost:3000"
echo ""
echo "Start Redis first (brew services start redis), then run backend and frontend in two terminals:"
echo "  cd \"$ROOT/backend\" && npm run dev"
echo "  cd \"$ROOT/frontend\" && npm run dev"
