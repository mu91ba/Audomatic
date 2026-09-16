#!/usr/bin/env bash
#
# Rebuild the schema from supabase/migrations/ on a throwaway local Postgres and
# assert what each role can and cannot do.
#
# Touches nothing remote: it creates its own cluster under /tmp, runs, and stops.
# Run it after changing any migration, especially an RLS policy — a policy that
# is subtly too permissive looks identical to a correct one until something like
# this actually tries the attack.
#
#   ./supabase/tests/run.sh
#
set -euo pipefail

export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"
export LANG=C LC_ALL=C

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN=/tmp/sightmap-pgtest
PGD="$RUN/data"
SOCK="$RUN/sock"       # kept short: a unix socket path over 103 bytes fails
PORT=54399
DB=sightmap_rls_test

cleanup() { pg_ctl -D "$PGD" stop -m immediate >/dev/null 2>&1 || true; }
trap cleanup EXIT

rm -rf "$RUN"; mkdir -p "$PGD" "$SOCK"
initdb -D "$PGD" -U postgres --auth=trust --locale=C --encoding=UTF8 >/dev/null
pg_ctl -D "$PGD" -o "-p $PORT -k $SOCK -c listen_addresses=''" -l "$RUN/pg.log" start >/dev/null
sleep 1

psql() { command psql -h "$SOCK" -p "$PORT" -U postgres "$@"; }

psql -q -c "CREATE DATABASE $DB;"
psql -d "$DB" -q -f "$ROOT/supabase/tests/supabase-stub.sql" 2>/dev/null

# Migration 001's storage-bucket statements are deliberately never applied —
# that unbounded bucket is what exhausted the free quota and took the site down.
WORK="$RUN/migrations"; mkdir -p "$WORK"
cp "$ROOT"/supabase/migrations/0*.sql "$WORK/"
python3 - "$WORK/001_initial_schema.sql" <<'PY'
import re, sys, pathlib
p = pathlib.Path(sys.argv[1])
p.write_text(re.sub(
    r"-- Create storage bucket for screenshots.*?bucket_id = 'screenshots'\);",
    "-- (storage bucket statements omitted: deliberately never applied)",
    p.read_text(), flags=re.S))
PY

# 001-018 build the pre-existing deployment; seed it; then 019 must migrate it.
for f in "$WORK"/0{01,02,03,04,05,06,07,08,09,10,11,12,13,14,15,16,17,18}_*.sql; do
  psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null 2>&1 \
    || { echo "FAILED to apply $(basename "$f")"; exit 1; }
done
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/tests/seed.sql"

echo "--- applying 019 to a populated database ---"
psql -d "$DB" -v ON_ERROR_STOP=1 -f "$WORK/019_approval_gated_access.sql" 2>&1 \
  | grep -E "NOTICE:  Migration|ERROR" || true

echo
echo "--- roles after backfill ---"
psql -d "$DB" -c "SELECT email, role FROM app_users ORDER BY role, email;"

# Supabase grants these to its client roles by default; the stub must match, or
# every test fails on a missing GRANT rather than on the policy being tested.
psql -d "$DB" -q -c "
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;"

echo "--- role behaviour ---"
psql -d "$DB" -f "$ROOT/supabase/tests/rls-tests.sql" 2>&1 \
  | grep -v "^SET\|^CREATE\|^DO$\|already exists, skipping"

failed=$(psql -d "$DB" -tAc "SELECT COUNT(*) FROM results WHERE NOT passed")
[ "$failed" = "0" ] || { echo "FAILED: $failed assertion(s)"; exit 1; }
echo "All assertions passed."
