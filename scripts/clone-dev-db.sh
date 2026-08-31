#!/usr/bin/env bash
# Clone a remote Postgres database into the local dev services
# (docker-compose.dev.yml). Drops and recreates local objects, so the
# local DB ends up an exact copy — schema and data.
#
# Source URL resolution, first match wins:
#   1. first argument            bash scripts/clone-dev-db.sh postgres://...
#   2. SOURCE_DATABASE_URL env   (for non-interactive/scripted use)
#   3. interactive prompt
#
# pg_dump runs inside a postgres:17 container so the client version always
# matches the compose server — a Homebrew pg_dump may be too old.
set -euo pipefail

cd "$(dirname "$0")/.."

SRC="${1:-${SOURCE_DATABASE_URL:-}}"
if [ -z "$SRC" ] && [ -t 0 ]; then
  read -r -p "Remote database URL (postgresql://user:pass@host:port/db): " SRC
fi
if [ -z "$SRC" ]; then
  echo "No source database URL." >&2
  echo "Run from a terminal to be prompted, or pass it as \$1 / set SOURCE_DATABASE_URL." >&2
  exit 1
fi

echo "Starting local dev services..."
docker compose -f docker-compose.dev.yml up -d --wait

echo "Cloning remote database into local (drops local objects first)..."
docker run --rm postgres:17-alpine \
  pg_dump "$SRC" --format=custom --no-owner --no-acl \
  | docker compose -f docker-compose.dev.yml exec -T postgres \
      pg_restore --username=dashseller --dbname=dashseller \
      --clean --if-exists --no-owner --no-acl

echo "Done. Local: postgresql://dashseller:dashseller@localhost:54320/dashseller"
