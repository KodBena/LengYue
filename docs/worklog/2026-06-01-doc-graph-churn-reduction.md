# Doc-graph churn reduction — commit the stable projection, not HEAD-relative distances

- **Status:** Done 2026-06-01 (umbrella tooling).
- **Genre:** Generated-artifact hygiene (diff-churn / repo-stats correctness).
- **Date:** 2026-06-01.
- **Touches:** `tools/doc-graph/generate.mjs`, `.gitattributes` (added),
  `CLAUDE.md`, `docs/notes/documentation-graph-artifact-plan.md`, and a full
  artifact regeneration.

## Symptom

A routine doc-touching PR reported a **+5,585 / −5,491** line diff — the
committed doc-graph artifacts re-rendered wholesale even when the actual change
was a handful of cross-references. The maintainer flagged it: the number reads
as a misleading "trophy," would trip diff scrapers, and is the kind of churn
shape that can trigger platform abuse heuristics.

## Diagnosis

Two compounding sources, both in the **committed** artifacts:

1. **`docs/doc-graph.json` (15k lines)** stored two HEAD-relative integers per
   node — `commit_distance` (commits since last touch) and
   `commit_distance_since_first` — plus a top-level `head_sha` /
   `generated_at_head`. Every commit advances HEAD, so **all 331 nodes' distance
   fields shift on essentially every regeneration** (~700 lines), independent of
   any structural change. The 1,360-line JSON churn in the triggering PR was
   mostly this, not the ~4 real edge changes.
2. **`docs/doc-graph.svg` (10.8k lines)** baked the same raw distance into every
   node tooltip, and `docs/doc-graph.md`'s staleness table printed the raw
   numbers — so both re-rendered per commit too.

### Why `.gitattributes` alone is insufficient (verified, not assumed)

The first instinct — mark the artifacts generated/`-diff` — was implemented and
**kept**, but tested empirically rather than trusted:

- `linguist-generated=true` **does** collapse the files in GitHub's "Files
  changed" view and exclude them from the repo's language stats. Worth having.
- `-diff` makes **local `git`** treat them as binary (`git diff --stat` reports
  `Bin … / 0 insertions, 0 deletions`).
- **But GitHub's `+/−` count and its served `.diff`/API ignore `-diff`.** After
  pushing `.gitattributes`, the PR's GitHub-reported total was still
  `+5,609 / −5,491` (the prior number plus the new 24-line file), and
  `gh pr diff` still served the JSON/SVG as full text (mode `100644`, zero
  `Binary files` markers). So `.gitattributes` is display hygiene; it does not
  fix the count or what a scraper fetches.

The only robust fix is to **stop generating the churn** — i.e. not commit
HEAD-relative derived data into a tracked artifact. (This was always in tension
with the freshness gate's own premise: `manifestSkeleton` already compared
graph *structure*, never the distances, precisely because the distances are
volatile.)

## Fix

The generator now separates the **in-memory manifest** (which still computes the
raw distances — they drive the bucket assignment and the staleness-table
ordering) from the **committed projection** (`committedManifest`), which carries
only stable fields:

- **Dropped from the committed JSON:** `commit_distance`,
  `commit_distance_since_first` (per node); `head_sha`, `generated_at_head`
  (top-level — git's own history of the file records which commit generated it).
- **Kept (stable):** `path` / `genre` / `is_hub` / `first_committed` /
  `last_committed` / `age_bucket`, plus `node_count` / `edge_count` /
  `age_buckets` and the full `edges`.
- **SVG tooltip** now reads `bucket, last touched <date>` — never the raw
  distance.
- **Staleness table** still orders by the in-memory commit-distance (the true
  counts-not-wall-clock metric) but displays `Bucket | Last touched`, so the
  row order shifts only when a doc is actually touched, not every commit.

Result: the committed artifacts change **only** when a doc is added, removed,
re-genred, re-cross-referenced, or actually touched (its date/bucket move) —
not on every HEAD advance. A content-only edit that isn't regenerated leaves at
most one node a bucket stale, which the structure-only gate tolerates by design.

`.gitattributes` is retained as complementary display hygiene (collapse +
language-stats exclusion); the JSON and SVG stay `-diff` because, on the now-rare
regenerations, the SVG is a full `dot` re-layout best not flooded into review.

## Verification

- `node tools/doc-graph/generate.mjs --check` → **graph structure fresh**
  (331 nodes, 1668 edges); the structure-only gate is unaffected by the dropped
  fields.
- Committed JSON contains **no** `commit_distance` and **no** `head_sha`
  (grep-confirmed); node keys are exactly the six stable fields.
- SVG contains **zero** `commits behind` strings; the md table header is
  `Document | Bucket | Last touched`.
- **Determinism:** two runs at a fixed HEAD produce byte-identical JSON *and*
  SVG — the precondition for "advancing HEAD without a doc-touch is a no-op
  diff."

## Honest residuals (ADR-0002)

- The committed heatmap is a **snapshot**: between structural regenerations a
  node can lag reality by up to one bucket as HEAD advances. This is the same
  staleness the artifact exists to surface, now at bucket granularity instead of
  per-commit.
- Generation-timing corollary: a doc *added in the same commit* is still
  uncommitted when the artifact is generated, so it shows as `uncommitted` until
  a later regeneration sees it. To land a self-consistent artifact (this PR did),
  commit → regenerate → amend; otherwise the next structural regeneration
  corrects it. The freshness gate is structure-only, so neither state fails it.
- A genuinely **structural** change still produces a real (sometimes chunky) SVG
  re-layout diff, and GitHub still counts those lines. That churn is now
  *proportionate and infrequent* (it tracks structural change), which was the
  goal — not zero.
- A possible follow-on, not done here: sort the committed `edges` array
  deterministically so a one-edge structural change is a one-line JSON diff
  (today the scan-order array can reorder), at which point the JSON could be
  made diffable again. Deferred — `-diff` keeps it clean meanwhile.

## Cross-references

- Generator + the projection boundary: `tools/doc-graph/generate.mjs`
  (`committedManifest`, `manifestSkeleton`).
- Spec amendment: `docs/notes/documentation-graph-artifact-plan.md` (§The
  heatmap, 2026-06-01 amendment).
- Regen-discipline refinement (structural vs content-only): `CLAUDE.md`
  ("Documentation is part of the work").
- Originating artifact: `docs/worklog/2026-06-01-doc-graph-artifact.md` (the
  schema this change refines).

## License

Public Domain (The Unlicense).
