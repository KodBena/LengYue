# Worklog — ADR-corpus amendments A1–A12 + maintainer ride-ons (2026-06-11)

> Audit trail for work-status item `adr-corpus-amendments-2026-06`,
> executing the signed-off amendment packages of the 2026-06-10
> ADR-corpus audit (`docs/notes/audit/audit-adr-corpus-2026-06-10.md`,
> §4 / Appendix A; per-package sign-off in §8, all packages signed off
> by the maintainer 2026-06-11) plus six maintainer-directed ride-ons.
> Branch `bork/docs/adr-corpus-amendments`. A13 (the
> mechanization-discipline tenet draft) and ADR-0005 Rules 10/11
> (A5b/A5c) are explicitly NOT in this arc — they are the separate
> `mechanization-discipline-tenet` arc.

## Per-package application table

| Pkg | Target | Applied | Notes |
|---|---|---|---|
| A1 | ADR-0001 | yes | Three retired TODO handles re-pointed (Revisit #1 → `item-27-etag-multitab`; Related ×2 → the archive snapshot); dated catalog-split note in Context; third Amendments line. |
| A2 | ADR-0002 | yes | Scope line replaced (pre-umbrella → codebase-wide); Rule 7 postmortem cites gain `postmortem/`; Related planning-note bullet re-pointed to the archive; pre-store item-number anchor + engagement-protocol forward-pointer added; retired-marker note after Rule 7's channel list, referenced from Rule 6; Exception-3 closure note; Negative bullet mechanization update (synthesis redraft incl. `only-throw-error`/G3); new Revisit-when #5; one consolidated Amendments entry. |
| A3 | ADR-0003 | yes | Premise annotation (Decision); analysis-recording section re-tensed with two named deviations; band-mixed bullet shipped-note; two-axis note after the principle blockquote; Chess-sizing snapshot annotation with FILES.md disagreements; Related re-pointed to the archive; **C4 precision rider applied** (binding): "has fired twice" → conservative phrasing in both the Amendments line and Revisit #1, each marked as a dated precision correction; consolidated Amendments entry. |
| A4 | ADR-0004 | yes | Revisit-#1 partial-firing record (CI-gated `vue-tsc -b`; the two adjacent lints; the in-principle ceiling; policy unrelaxed pending measurement); first Amendments header line. |
| A5a | ADR-0005 | yes | Second-wave mechanization record ONLY: Amendments-line note (co-change advisory 2026-06-02; dangling-signal arc 2026-06-10); one sentence in Alternative C; Related doc-graph bullet → `{json,md}` + SVG-off-tree pointer; optional Rule 5 routers-reference historical annotation applied (file verified absent at HEAD). **Rules 10/11 not added; synopsis rules enumeration stays at nine.** |
| A6 | ADR-0006 | yes | Exemplar path corrected at the Context citation + quoted header block, the Form-section template block (same rot, same repair — a third occurrence beyond the two the package names), and the Related bullet; first Amendments header line. |
| A7 | ADR-0007 | yes | Status → Accepted (proposed 2026-04-26; accepted 2026-06-11); acceptance record appended after Not-goals, naming the two open questions (unmeasured density thresholds; bounded-vs-aspirational budgets); Not-goals reorg pointer corrected (landed 2026-05-11, commit `39e200d`, without the promised ADR). Co-changes: synopsis drops "Status as of authoring: Proposed."; `frontend/CLAUDE.md` drops "(proposed)"; `decisions-deferred.md` frontend paragraph gains the dated outcome note. |
| A8 | ADR-0008 | yes | Substrate-4 and Rule-2 citations re-pointed to `docs/archive/notes/frontend-source-tree-reorganization.md`; retired-marker notes on both Exceptions + Rule 3's channel list; Revisit-#4 partial-firing record (enum constraints; refs-kind arc; `band-conformance-ci-check` as the named fuller firing); first Amendments header line; Negative bullet dated pointer. |
| A9 | ADR-0009 | yes | Tools lead-in count fixed; companion-protocol Related entry + routing rule (`perf-capture-normalization-protocol.md`); counts-based Chromium comparable appended to the metric vocabulary (Revisit-#3 instance); optional "(also a Revisit #3 instance)" on the retained-heap entry applied. A short trailing "Amended (2026-06-11)" section added in the ADR's own trailing-section convention so the lead-in replacement is not a silent body edit (the package text named no amendment record; judgment call, recorded here). |
| A10 | ADR-0010 | yes | Revisit-#4 record note (trigger not fired); **bracketed variant resolved as directed**: "is tracked as work-status item `reactive-state-modules-relocation`" (item exists, DB-verified read-only); second Amendments line. |
| A11 | handoff-current.md | yes | Governance section slimmed to: genre-honest lead (two structural records + eight tenets; ADR-0003 stays "bounded-context map" per R5), the R2-calibrated delegation sentence (advisory, not a gate), and the closing personality paragraph kept verbatim ("Read all ten…" retained — R3's ten ADR tokens survive). R1: ships with A11a below. R4: both orphaned glosses **re-homed** in the synopsis why-care lists (ADR-0001 ← "the same philosophy extends to the backend's mutable Pydantic models"; ADR-0002 ← "why the proxy's cache controls are explicit flags rather than implicit behaviour"); named in the PR body. |
| A11a | adr-synopsis.md | yes | ADR-0009 entry refreshed (canonical tool surface incl. Chrome/CDP + HeapProfiler + scenario harness; metric vocabulary extended); optional "two decisions" → "two structural records" applied (composes with A11's genre-honest lead). |
| A12 | README.md | yes | Planning-note line re-pointed to the archive (rest of the enumeration re-verified — all paths resolve); **de-headline variant chosen as directed**: Project status now points at the work-status store + handoff, no release headline; retrospective pointers and the distribution-packaging paragraph retained (still accurate per the handoff). |

## Synopsis substance co-changes (checked manually per package)

- **A3**: the synopsis ADR-0003 why-care carried the same "fired twice"
  overclaim → updated to the C4-conservative phrasing.
- **A7**: "Status as of authoring: Proposed." → replaced with a dated
  acceptance sentence naming the two held-open questions.
- **A1/A2/A4/A5a/A6/A8/A9/A10**: synopsis entries checked; no substance
  change required (the synopsis does not enumerate the affected
  registers; A5a adds no rule, so the nine-rule enumeration stands).
- Coherence residual fixed alongside: the handoff's "Domain extension"
  bullet ("Two adopters have materialized") carried the same overclaim
  the C4 rider corrects → conservative phrasing.

## Maintainer-directed ride-ons

1. **`frontend/FILES.md`** — deleted the `jquery-bridge.ts` ghost row
   (file verified absent under `frontend/src/`); added the
   `RegistryEditor.vue` drift annotation: `[B1]` with a named leak —
   imports `WINRATE_FRAMINGS` from `[B3]` `engine/katago/types`
   (import verified at HEAD, `RegistryEditor.vue:9`); structural fix
   owned by `config-schema-projections` Phase 1.
2. **§7.2 authority correction** (maintainer, 2026-06-11: the
   2026-06-05 consult's keep-Class-B-inline verdict was ADVISORY,
   never a maintainer decision; prior records overstated it). Dated
   notes added at both live citation sites: the
   `BOARD_SCOPED_STORE_CELLS` docstring in `frontend/src/store/index.ts`
   (comment-only; no behavior change) and the two-teardown-classes
   section of the board-scope note (`board-scope.md`, under
   `frontend/docs/notes/`). Both name the open
   question's tracking item `closeboard-class-b-teardown-shape`
   (parked; owner-located teardown a named candidate; item verified in
   the store, read-only).
3. **`docs/pre-merge-checklist.md`** — §A's work-status bullet gains
   the ratified staged-SQL convention line (filing tracks, it does not
   approve; description edits / dispositions / closures await
   maintainer sign-off).
4. **Umbrella `CLAUDE.md`** — the orchestration-layer paragraph
   (maintainer-adopted, E2 §7 synthesis) appended in the
   authoring-posture section, phrased tool-agnostically
   (probe-before-trust; ledger-everything incl. residual sweep before
   closure; artifact-before-verdict).
5. **`docs/notes/decisions-deferred.md`** — (a) dated outcome note on
   the backend-reorg entry's frontend paragraph: the frontend
   reorganization landed 2026-05-11 (commit `39e200d`) without the
   anticipated ADR; ADR-0007 accepted the same day this note lands;
   the missing decision record is surfaced as a maintainer question
   (audit §6.9), not papered over. (b) New entry recording the §7.5
   migration-cadence decision (maintainer, 2026-06-11): **no
   relaxation** — the honest-version-marker property stands; additive
   backfills keep bump+migration; rationale: post-#370 witnessed
   assertions + the composition test make the bump path fail-loud,
   and the masking that argued for relaxation is what hid two real
   defects. Triggers for revisitation named per the ledger's shape.
6. **Synopsis tail — fork-consumption statement** (maintainer-sited
   per audit §6.8/§8.7; drafted from n2's sketch preserved in the
   corpus audit appendix p1, read at its section): tenets transfer
   wholesale; ADR-0003 is the transfer map; enforcement-surface
   declarations become the transfer manifest once the
   mechanization-discipline tenet ships; decisions re-evaluate against
   the fork's own context; umbrella infrastructure re-instantiates;
   numbering continues.

## Text-variant resolutions (binding per the commission + judgment calls)

- **A3 / C4 rider**: adopted (binding). The rider's exact conservative
  phrasing replaces "has fired twice" in the Amendments line and
  Revisit #1; both edits are marked as dated precision corrections so
  the in-place change to a dated record is not silent. The rider's
  phrase subsumes the old parenthetical (which named both adopters).
- **A10 variant**: resolved to "is tracked as work-status item
  `reactive-state-modules-relocation`" (binding; DB-verified).
- **A12 variant**: de-headline (binding).
- **A5a optional Rule-5 annotation**: applied — the routers
  reference-doc near-miss path named by Rule 5 is verified absent at
  HEAD; the note marks it as historical without asserting a current
  location (none was traceable in this repo's history).
- **A9 optional retained-heap tag**: applied.
- **A11a optional "two structural records"**: applied (composes with
  A11's genre-honest lead and the audit's "mild" flattening finding).
- **A6 third occurrence**: the Form-section template block carried the
  same stale path the package's two named occurrences did; corrected
  on the same touch.
- **A9 amendment record**: a trailing dated section added beyond the
  package's literal text (see table) — the corpus convention's
  no-silent-body-edits rule required *some* dated record for the
  lead-in replacement; the ADR's own trailing-section shape was chosen
  over an Amendments header line (audit §6.6: harmonize on touch was
  judged out of A9's bounded scope).

## Deviations

None beyond the recorded judgment calls above. Todo DB touched
read-only (SELECTs verifying item ids). No perf claims (ADR-0009).
`backend/qeubo/` not read. Frozen archives and point-in-time records
untouched except via the dated-note convention.

## Verification

- `node tools/doc-graph/generate.mjs` regenerated (structural:
  cross-reference changes in A2/A3/A5a/A8/A11/A12 + this worklog);
  441 nodes, 2108 edges (1729 resolved, 379 dangling — net −3 vs the
  prior committed report, no new live-class danglers from this arc;
  two pre-existing `backend/data/` directory-ref danglers from frozen
  docs surfaced by regeneration against the current tree, not
  introduced here); artifacts committed.
  `cochange-advisory.mjs origin/main` clean — the synopsis moves in
  the same change as the ADRs.
- Frontend (store/index.ts comment edit touches source):
  `npm install`; `npm run build` (vue-tsc + vite) passes;
  `npx eslint .` exit 0; `npm run test:run` 888 passed / 4 skipped
  (56 files passed, 3 skipped).

License: Public Domain (The Unlicense).
