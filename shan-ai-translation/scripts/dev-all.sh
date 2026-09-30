#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
pnpm --filter @sat/api dev &
pnpm --filter @sat/worker dev &
pnpm --filter @sat/web dev &
wait
