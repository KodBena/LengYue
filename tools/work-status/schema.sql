-- tools/work-status/schema.sql — relational schema for the work-status store.
--
-- The work-status / todo list lives in the `todo` PostgreSQL database on the
-- libvirt host:  psql -h 192.168.122.1 -d todo
-- This DDL is the structural anti-corruption layer that the hand-edited JSON
-- file plus tools/work-status/check.mjs used to provide together. Enum, shape,
-- and referential invariants are enforced as CHECK and FOREIGN KEY constraints
-- (a write that violates them fails loudly — ADR-0002), and the cross-row
-- invariants a static constraint cannot express are surfaced by the
-- work_status_violations view (a validator/CI gate fails if it returns rows).
--
-- It is a faithful relational image of docs/work-status.schema.json: one parent
-- table (items) with three multi-valued children (deps, refs, labels), plus an
-- `extra` jsonb column that hoists the schema's additionalProperties:true
-- forward-compatibility. "single source of truth" is the file's *role* re: the
-- todo duty, not a proper noun — the term is used loosely here.
--
-- Closed-but-amendable enums are CHECK ... IN (...) lists: amend an enum by
-- editing the constraint deliberately. An unknown value is an error, never a
-- silent coercion. The lists carry the FULL schema vocabulary (including values
-- not yet used in the data), so the constraint stays faithful to the contract.
--
-- Re-runnable: drops and recreates every object, then re-seeds the meta row.
-- It does NOT load item data — tools/work-status/migrate-to-pg.py does that and
-- self-certifies a faithful round-trip. Apply standalone with:
--   psql -h 192.168.122.1 -d todo -v ON_ERROR_STOP=1 -f tools/work-status/schema.sql
--
-- License: Public Domain (The Unlicense).

BEGIN;

DROP VIEW  IF EXISTS work_status_violations;
DROP TABLE IF EXISTS labels;
DROP TABLE IF EXISTS refs;
DROP TABLE IF EXISTS deps;
DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS meta;

-- schema_version and any future document-level scalars.
CREATE TABLE meta (
  key   text  PRIMARY KEY,
  value jsonb NOT NULL
);

CREATE TABLE items (
  id            text PRIMARY KEY
                  CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title         text NOT NULL CHECK (title <> ''),
  description   text NOT NULL CHECK (description <> ''),
  state         text NOT NULL CHECK (state IN ('open', 'closed')),
  disposition   text          CHECK (disposition IN ('active', 'in-progress', 'future')),
  resolution    text          CHECK (resolution IN ('shipped', 'superseded', 'dropped', 'deferred')),
  scope         text NOT NULL CHECK (scope IN ('frontend', 'backend', 'both', 'proxy', 'umbrella')),
  tier          text          CHECK (tier IN ('small', 'medium', 'large')),
  closed_on     date,
  parent        text REFERENCES items(id) DEFERRABLE INITIALLY DEFERRED,
  superseded_by text REFERENCES items(id) DEFERRABLE INITIALLY DEFERRED,
  legacy_number text,
  extra         jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- The schema's open/closed allOf branches, as one within-row invariant:
  --   open   ⇒ carries a disposition, no resolution;
  --   closed ⇒ carries a resolution and a close date, no disposition.
  CONSTRAINT items_state_shape CHECK (
    (state = 'open'   AND disposition IS NOT NULL AND resolution IS NULL) OR
    (state = 'closed' AND resolution  IS NOT NULL AND closed_on IS NOT NULL AND disposition IS NULL)
  ),
  -- Cheap within-row self-reference guard; longer cycles → work_status_violations.
  CONSTRAINT items_no_self_parent    CHECK (parent        IS DISTINCT FROM id),
  CONSTRAINT items_no_self_supersede CHECK (superseded_by IS DISTINCT FROM id)
);

CREATE TABLE deps (
  item_id    text NOT NULL REFERENCES items(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  depends_on text NOT NULL REFERENCES items(id)                   DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY (item_id, depends_on),
  CONSTRAINT deps_no_self CHECK (item_id <> depends_on)
);

CREATE TABLE refs (
  ref_id  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id text NOT NULL REFERENCES items(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  -- 'audit' added 2026-06-10: audit reports under docs/notes/audit/ were previously
  -- filed as 'design-note' (closest match); the history-lessons audit surfaced the
  -- vocabulary gap (ADR-0002 Rule 7 / ADR-0008) and the maintainer approved the value.
  kind    text NOT NULL CHECK (kind IN ('worklog', 'design-note', 'adr', 'dispatch', 'source', 'pr', 'commit', 'audit')),
  target  text NOT NULL CHECK (target <> '')
);
CREATE INDEX refs_item_id_idx ON refs (item_id);

CREATE TABLE labels (
  item_id text NOT NULL REFERENCES items(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  label   text NOT NULL CHECK (label IN (
            'bug', 'feature', 'performance', 'refactor', 'architectural-cruft',
            'investigation', 'docs', 'tooling', 'test', 'ux', 'security')),
  PRIMARY KEY (item_id, label)     -- uniqueItems: a label appears at most once per item
);

-- Cross-row invariants a static CHECK cannot express (check.mjs's graph layer).
-- A non-empty result is the fail-loud signal: a validator / CI gate runs
--   SELECT * FROM work_status_violations
-- and fails the build if any row comes back. (Referential integrity of
-- parent / superseded_by / depends_on is already structural via the FOREIGN
-- KEYs above; the advisory on-disk/git ref-existence checks stay client-side.)
CREATE VIEW work_status_violations AS
WITH RECURSIVE
dep_walk (origin, node) AS (
    SELECT item_id, depends_on FROM deps
  UNION ALL
    SELECT w.origin, d.depends_on
    FROM dep_walk w JOIN deps d ON d.item_id = w.node
) CYCLE node SET is_cycle USING dpath,
parent_walk (origin, node) AS (
    SELECT id, parent FROM items WHERE parent IS NOT NULL
  UNION ALL
    SELECT p.origin, i.parent
    FROM parent_walk p JOIN items i ON i.id = p.node
    WHERE i.parent IS NOT NULL
) CYCLE node SET is_cycle USING ppath
SELECT i.id, 'shipped-without-ship-ref' AS violation
  FROM items i
 WHERE i.resolution = 'shipped'
   AND NOT EXISTS (
     SELECT 1 FROM refs r WHERE r.item_id = i.id AND r.kind IN ('pr', 'commit', 'worklog'))
UNION ALL
SELECT DISTINCT origin, 'depends_on-cycle' FROM dep_walk    WHERE is_cycle
UNION ALL
SELECT DISTINCT origin, 'parent-cycle'     FROM parent_walk WHERE is_cycle;

INSERT INTO meta (key, value) VALUES ('schema_version', '1'::jsonb);

COMMIT;

-- ---------------------------------------------------------------------------
-- Audit trail (added 2026-06-11, maintainer-approved; hand-rolled, no
-- extensions — none are installed on the host and vanilla PostgreSQL has no
-- native SYSTEM_TIME AS OF). This section is the in-repo ATTESTATION of the
-- live objects: future auditors and project successors should treat it as the
-- contract for the store's history layer.
--
-- DELIBERATE CARVE-OUT from this file's re-runnable drop-and-recreate
-- posture: audit_log and the audit functions are NOT in the DROP list above —
-- history survives a reseed. Two consequences, handled here:
--   1. DROP TABLE (above) kills row triggers with their tables, so the
--      triggers are (re)created unconditionally below.
--   2. DROP TABLE does not fire per-row DELETE triggers, so a reseed is a
--      discontinuity in the trail; migrate-to-pg.py re-baselines by calling
--      audit_genesis_snapshot() after loading (rows tagged actor
--      'genesis-snapshot').
-- Attribution: actor = application_name (sessions set PGAPPNAME, e.g.
-- 'coordinator'); commit_sha = the transaction-local GUC `audit.commit`,
-- set by writers whose change corresponds to a git commit (ship-closures),
-- null otherwise — absence is honest, not missing data.
-- Reconstruction is transaction-granular: `at` is now() (xact-stable);
-- audit_id orders entries within a transaction.

BEGIN;

CREATE TABLE IF NOT EXISTS audit_log (
  audit_id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT now(),
  actor      text NOT NULL DEFAULT coalesce(nullif(current_setting('application_name', true), ''), 'unknown'),
  commit_sha text DEFAULT nullif(current_setting('audit.commit', true), ''),
  tbl        text NOT NULL,
  op         text NOT NULL CHECK (op IN ('INSERT','UPDATE','DELETE')),
  row_key    text NOT NULL,
  old_row    jsonb,
  new_row    jsonb
);
CREATE INDEX IF NOT EXISTS audit_log_lookup_idx ON audit_log (tbl, row_key, at DESC, audit_id DESC);

CREATE OR REPLACE FUNCTION record_audit() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  r jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  k text;
BEGIN
  k := CASE TG_TABLE_NAME
    WHEN 'items'  THEN r->>'id'
    WHEN 'refs'   THEN r->>'ref_id'
    WHEN 'labels' THEN (r->>'item_id') || ':' || (r->>'label')
    WHEN 'deps'   THEN (r->>'item_id') || ':' || (r->>'depends_on')
    WHEN 'meta'   THEN r->>'key'
    ELSE r::text
  END;
  INSERT INTO audit_log (tbl, op, row_key, old_row, new_row)
  VALUES (TG_TABLE_NAME, TG_OP, k,
          CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END);
  RETURN NULL;
END $fn$;

DROP TRIGGER IF EXISTS items_audit  ON items;
DROP TRIGGER IF EXISTS refs_audit   ON refs;
DROP TRIGGER IF EXISTS labels_audit ON labels;
DROP TRIGGER IF EXISTS deps_audit   ON deps;
DROP TRIGGER IF EXISTS meta_audit   ON meta;
CREATE TRIGGER items_audit  AFTER INSERT OR UPDATE OR DELETE ON items  FOR EACH ROW EXECUTE FUNCTION record_audit();
CREATE TRIGGER refs_audit   AFTER INSERT OR UPDATE OR DELETE ON refs   FOR EACH ROW EXECUTE FUNCTION record_audit();
CREATE TRIGGER labels_audit AFTER INSERT OR UPDATE OR DELETE ON labels FOR EACH ROW EXECUTE FUNCTION record_audit();
CREATE TRIGGER deps_audit   AFTER INSERT OR UPDATE OR DELETE ON deps   FOR EACH ROW EXECUTE FUNCTION record_audit();
CREATE TRIGGER meta_audit   AFTER INSERT OR UPDATE OR DELETE ON meta   FOR EACH ROW EXECUTE FUNCTION record_audit();

-- State of any audited table as of t:
--   SELECT * FROM table_asof('items', '2026-06-10T18:00:00Z');
-- Per-commit time-travel: tools/work-status/asof.sh <git-sha> resolves the
-- sha's committer timestamp and calls this.
CREATE OR REPLACE FUNCTION table_asof(p_tbl text, p_t timestamptz) RETURNS SETOF jsonb LANGUAGE sql STABLE AS $fn$
  SELECT new_row FROM (
    SELECT DISTINCT ON (row_key) op, new_row
    FROM audit_log WHERE tbl = p_tbl AND at <= p_t
    ORDER BY row_key, at DESC, audit_id DESC
  ) last WHERE op <> 'DELETE'
$fn$;

CREATE OR REPLACE FUNCTION audit_genesis_snapshot() RETURNS bigint LANGUAGE plpgsql AS $fn$
DECLARE n bigint := 0; c bigint;
BEGIN
  INSERT INTO audit_log (actor, tbl, op, row_key, new_row)
    SELECT 'genesis-snapshot', 'items', 'INSERT', id, to_jsonb(t) FROM items t;
  GET DIAGNOSTICS c = ROW_COUNT; n := n + c;
  INSERT INTO audit_log (actor, tbl, op, row_key, new_row)
    SELECT 'genesis-snapshot', 'refs', 'INSERT', ref_id::text, to_jsonb(t) FROM refs t;
  GET DIAGNOSTICS c = ROW_COUNT; n := n + c;
  INSERT INTO audit_log (actor, tbl, op, row_key, new_row)
    SELECT 'genesis-snapshot', 'labels', 'INSERT', item_id || ':' || label, to_jsonb(t) FROM labels t;
  GET DIAGNOSTICS c = ROW_COUNT; n := n + c;
  INSERT INTO audit_log (actor, tbl, op, row_key, new_row)
    SELECT 'genesis-snapshot', 'deps', 'INSERT', item_id || ':' || depends_on, to_jsonb(t) FROM deps t;
  GET DIAGNOSTICS c = ROW_COUNT; n := n + c;
  INSERT INTO audit_log (actor, tbl, op, row_key, new_row)
    SELECT 'genesis-snapshot', 'meta', 'INSERT', key, to_jsonb(t) FROM meta t;
  GET DIAGNOSTICS c = ROW_COUNT; n := n + c;
  RETURN n;
END $fn$;

COMMIT;
