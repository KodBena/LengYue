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
