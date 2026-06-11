#!/bin/sh
# tools/work-status/asof.sh — work-status store time-travel.
#
# Usage: asof.sh <git-sha | ISO-timestamp> [table]
#   asof.sh 39e200d            # items as the store stood at that commit
#   asof.sh 39e200d refs       # refs likewise
#   asof.sh 2026-06-10T18:00Z  # any audited table at a raw timestamp
#
# A git sha resolves to its COMMITTER timestamp; store writes in this project
# cluster within ~a minute of their merge events, so the correlation is
# faithful for ship-closures. Exact anchors, where they exist, live in
# audit_log.commit_sha. See tools/work-status/schema.sql §Audit trail.
set -e
REF="${1:?usage: asof.sh <git-sha|timestamp> [table]}"
TBL="${2:-items}"
PSQL="${TODO_PSQL:-psql -h 192.168.122.1 -d todo}"
if T=$(git show -s --format=%cI "$REF" 2>/dev/null) && [ -n "$T" ]; then
  echo "# $REF -> $T" >&2
else
  T="$REF"
fi
N=$($PSQL -At -c "SELECT count(*) FROM table_asof('${TBL}', '${T}'::timestamptz)")
echo "# ${TBL} rows as of ${T}: ${N}" >&2
$PSQL -At -c "SELECT new_row FROM (SELECT DISTINCT ON (row_key) op, new_row FROM audit_log WHERE tbl='${TBL}' AND at <= '${T}'::timestamptz ORDER BY row_key, at DESC, audit_id DESC) l WHERE op <> 'DELETE'"
