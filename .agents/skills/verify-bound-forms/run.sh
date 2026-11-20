#!/usr/bin/env bash
# Run the bound-forms check: build @askdb/core (the check imports its dist), then run the property.
#   .agents/skills/verify-bound-forms/run.sh                         # 300 cases, about a second
#   ASKDB_VERIFY_RUNS=20000 .agents/skills/verify-bound-forms/run.sh # a deep run, about ten seconds
#   ASKDB_VERIFY_SEED=<seed> .agents/skills/verify-bound-forms/run.sh  # replay a reported failure
# Exits with vitest's status: 0 when the property holds.
set -euo pipefail
root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
cd "$root"
pnpm exec turbo run build --filter=@askdb/core --output-logs=errors-only >/dev/null
cd packages/sqlite
exec pnpm exec vitest run --config ../../vitest.config.ts src/verification/bound-forms-agree.test.ts
