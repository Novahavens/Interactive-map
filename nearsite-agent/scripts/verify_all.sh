#!/usr/bin/env bash
# Runs every check with every live switch off. Writes only to a temp folder.
#   bash scripts/verify_all.sh
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPS="${NEARSITE_TEST_DEPS:-${TMPDIR:-/tmp}/nearsite-test-deps}"
OUT="$(mktemp -d)"
fail=0
run() { echo "== $1"; shift; "$@" || fail=1; }

if [ ! -d "$DEPS/node_modules/@electric-sql/pglite" ] || [ ! -d "$DEPS/node_modules/jsdom" ]; then
  mkdir -p "$DEPS" && (cd "$DEPS" && npm init -y >/dev/null && npm install --silent @electric-sql/pglite@0.2.17 jsdom@24.1.3 >/dev/null)
fi

run "live switches all off" python3 -c "import json,sys;c=json.load(open('$ROOT/config/agent-config.json'));on=[k for k,v in c['live'].items() if v];print('on:',on);sys.exit(1 if on else 0)"
run "python: engine, checker, gate" python3 -m pytest -q -p no:cacheprovider "$ROOT/tests"
run "node: Slack approval handler" node --test "$ROOT/handlers/slack-approvals/logic.test.mjs"
run "node: messenger extension" env JSDOM_DIR="$DEPS" node --test "$ROOT/extension/content.test.cjs"
run "node: database migration on in-memory Postgres" env PGLITE_DIR="$DEPS" node --test "$ROOT/tests/db/migration.test.mjs"
run "dry run on the fixtures" python3 "$ROOT/scripts/dry_run.py" --out "$OUT"
echo "dry run report: $OUT/dry_run_report.json"
[ $fail -eq 0 ] && echo "ALL CHECKS PASSED" || echo "SOME CHECKS FAILED"
exit $fail
