# Worklog — co-change advisory for derived docs (2026-06-02)

## Trigger

The ADR synopsis was found stale after PR #339 — it summarized ADR-0005 through
Rule 8, missing the just-added Rule 9 (and still framed Rule 7's
provisional-home flag as live, retired 2026-05-17). The maintainer asked the
sharper question: *why didn't the machine-readable doc-graph catch it?*

## The gap

The doc-graph models two things, and synopsis drift is invisible to both:

- **Edge resolution** (the gated part) is a property of the *path*, not the
  *content*: the `adr-synopsis → ADR-0005` link resolves fine while the prose
  silently lags.
- **Node age** (the heatmap, advisory) measures "how long since *this* node was
  touched," not "is it behind a *source it derives from*."

The missing axis is **derivation direction**. The synopsis is the one
sanctioned violation of ADR-0005 Rule 3 (it is deliberately a content snapshot
for cold-start orientation), which makes it the doc most exposed to the exact
staleness Rule 3 exists to prevent — and nothing re-synced it.

## The mechanism

A derived doc declares its sources inline: `<!-- derived-from: <glob> -->`.
`tools/doc-graph/cochange-advisory.mjs` flags, on a PR, any derived doc whose
source changed but which was not itself updated.

- **Per-PR-diff, not state-based.** It computes from `origin/main...HEAD`, so it
  fires only on the PR that changes a source-without-its-derived; once that PR
  merges the change leaves the diff and it cannot re-fire. A state-based
  "derived is older than source" check would nag on every PR until the derived
  doc is touched — one false positive forever. Deliberately not that.
- **Silence valve.** A source change does not always oblige a derived update, so
  within the firing PR add `cochange-ack: <derived-doc> — <reason>` to any
  commit; the tool scans the PR's commit messages, suppresses that pair, and the
  decision + rationale live in the commit that made the call (durable in
  `git log`, no accreting ack-file). Per-PR ⇒ the ack never carries forward. A
  pair acked on *every* PR is signalling it is not a real derivation — undeclare
  it (the scope-curation lever) rather than ack forever.
- **Advisory, never a gate** (exit 0): prompts review, does not block (ADR-0005
  Alternative C — too soft to gate). The `--selftest` step IS gating; it guards
  the tool.

## Scope (curated, not universal)

Two declarations to start, both tight content-projections:
`docs/adr-synopsis.md ⟵ docs/adr/*.md` and `docs/TODO.md ⟵ docs/work-status.json`.
Diffuse summaries (handoff, FEATURES) get no declaration — their "source" is the
whole system, so a co-change rule would be noise (the ADR-0008 don't-force-it
instinct applied to the relation itself).

## Files

- `tools/doc-graph/cochange-advisory.mjs` (new; `advise()` pure core + 7
  selftest cases).
- `.github/workflows/cochange-advisory-ci.yml` (new; pull_request on `docs/**`).
- `docs/adr-synopsis.md`, `docs/TODO.md` — `derived-from` markers + a visible
  one-line note.

## Verification

`--selftest` 7/7; real run against `origin/main` detects both derivations and
reports clean (this branch touched only the derived docs + tooling, no source).

License: Public Domain (The Unlicense).
