# Staged work-status filings — human-readable summary (2026-06-10)

Companion to the history-lessons audit (`audit-spa-history-lessons-2026-06-10.md`)
and the staged SQL (`audit-spa-history-lessons-2026-06-10-filing.sql`). The SQL
does exactly four things, all additive — it modifies and deletes nothing:

1. Inserts **20 new items**, all `state=open`, `disposition=future` (promotion
   to `active` is deliberately left to the maintainer; §7.7 of the audit lists
   the five the verifiers suggested raising).
2. Sets one **parent link**: `adr-record-amendments-2026-06` →
   `adr-effectiveness-audits`.
3. Inserts **refs rows**: every item points at the audit doc, plus five extra
   refs to the postmortems/consults/design notes that ground specific items.
4. Inserts **labels** per item (from the closed label vocabulary).

Apply with
`psql -h 192.168.122.1 -d todo -v ON_ERROR_STOP=1 -f docs/notes/audit/audit-spa-history-lessons-2026-06-10-filing.sql`,
then confirm `SELECT * FROM work_status_violations` returns zero rows.

One vocabulary wrinkle, surfaced rather than silently absorbed (ADR-0002
Rule 7): `refs.kind` has no `audit` value, so the audit-doc refs reuse
`design-note`, matching the existing precedent on two prior items.

## The twenty items

Fork column: how the proposal relates to the planned generic flash-card fork —
**advances** it, was **reshaped** to serve it (reshape already folded into the
item description), or is **orthogonal**. Audit § = where the full reasoning,
evidence, and corrections live.

| # | Item | Scope / tier | What it actually is | Why now (the evidence) | Fork | Audit § |
|---|---|---|---|---|---|---|
| 1 | `multi-writer-slots-get-owners` | frontend / medium | Four staged fixes: route the one mutator-bypassing board write properly; snapshot/restore `showMoveSuggestions` + `treeExpanded` around reviews; extract an engine-connection owner module for the 19 scattered `store.engine` writes; then a lint that enumerates writers per store subtree. | Finishing a review force-enables move suggestions even for users who keep them off — and that clobber is *persisted*. The history shows per-writer gates get re-fixed within hours while owners stick. | advances | 3.7 |
| 2 | `migration-leaf-assertion-and-composition-test` | frontend / small | A fail-loud guard for active migration bodies plus a composition-level test (legacy blob → migrate → hydrate → save → compare key sets). | A migration once silently no-oped on a wrong blob path and stamped the version anyway; 12 consecutive migrations had no test fixtures at all while the test file's header claims full coverage. | advances | 3.13 |
| 3 | `branded-path-types` | frontend / medium | Brand the two variation-path shapes (root→leaf vs root→current), audit the 16 calling files, add the missing mid-tree test fixture. | Four shipped bugs from the same path/cursor confusion class, plus one documented still-latent twin; the brand retrofit is proven cheap (817 tests green, zero runtime change). | reshaped | 3.4 |
| 4 | `hydration-rebind-residue-audit` | frontend / small | Close the *residue* of the module-scope-vs-hydration audit (three named surfaces) and write the one doc that names the failure class. | The class produced real bugs; most of the audit happened piecewise already — this finishes it honestly and records why a global barrier was declined. | advances | 3.9 |
| 5 | `cast-hygiene-lint` | frontend / small | Stage 1: ESLint ban on bare `as any` (~13 sites). Stage 2: a justification-adjacency rule for all casts. | The "every cast needs a justification" rule is review-only and held at ~50% in sample; the corpus shows prose rules decay and lints stick. | advances | 3.10 |
| 6 | `typed-capability-metadata-mirror` | frontend / small | Typed per-capability proxy metadata, validated once at the version-response boundary; deletes consumption-site casts. | A proxy-side field rename currently fails *silently* (the learned-VF dropdown would just vanish); the binding dispatch instructed this type and it was never created. | orthogonal | 3.2 |
| 7 | `services-boundary-deny-by-default` | frontend / small | Invert the component→service import lint from a four-entry blocklist to deny-by-default with named exemptions; also covers the `App.vue` gap the current glob misses. | The blocklist was incomplete from day one and is fail-open: every service added since is unguarded. Also finally files the documented ADR-0010 layering tension as work. | advances | 3.11 |
| 8 | `keyed-cache-brand-at-construction` | frontend / small | A construction-time rule: new keyed caches mint branded keys that declare what the cached value depends on. | Two same-day twin bugs from under-keyed composite caches; discovery was reactive both times. The remaining audit question was answered safe during verification — this records it and prevents regrowth. | advances | 3.5 |
| 9 | `work-status-authoring-hygiene` | umbrella / medium | One harvest pass filing/dropping the ~15+ deferrals stranded in worklog prose; refs rows linking open perf items to their existing diagnoses; a "deferral bullet ends with an item id or `not-filed:` marker" convention. | Deferrals recorded only in prose reliably evaporated (one then recurred as bugs); everything that reached the todo DB is accounted for. The leak is at authoring time. | reshaped | 3.22 |
| 10 | `doc-graph-dangling-signal-cleanup` | umbrella / medium | Make the dangling-reference report trustworthy: align the frozen boundary with the working convention, split "missing on disk" from "outside node set", tombstone retired hubs. | ~66% of the 125 reported live danglers are noise by the project's own conventions, so the report stops being consulted while two real stale pointers sat unnoticed. | orthogonal | 3.24 |
| 11 | `code-comment-stable-handles` | frontend / small | Convention: code comments cite stable handles (slugs, item ids, registry labels), never counts or censuses; fix the O12–O15 numbering collision additively. | A docstring says "Four cleanups" above eleven; an ESLint header asserts violations resolved a week earlier; ad-hoc O-numbers collided with a frozen plan's different definitions. | reshaped | 3.25 |
| 12 | `enrichment-merge-null-validation` | frontend / small | A structural loud-warn at the analysis-ledger merge boundary for null-bearing inner objects replacing populated entries. | A postmortem named this sharp edge four weeks ago; it is still unguarded, and a later change widened the exposure window. Low urgency, small fix. | reshaped | 3.6 |
| 13 | `vue-lifecycle-footgun-guards` | frontend / medium | Guards for the two expressible Vue traps: boolean gate-props defaulting to false on omission, and module-intent state in `<script setup>` being per-instance. Plus one consolidated CLAUDE.md section for the residue. | Five separate paid-for investigations; both lintable classes stayed latent until a second consumer with a different lifecycle arrived. | advances | 3.12 |
| 14 | `adr-record-amendments-2026-06` | umbrella / small | The bounded ADR record repairs: ADR-0001's stale mutator description; ADR-0003's two fired triggers recorded **with the fork-axis re-cut** (B1/B2 becomes the load-bearing boundary; B2 splits); ADR-0010's committed tool-call artifact stripped. Child of `adr-effectiveness-audits`. | Two ADRs silently misdescribe current reality; anyone auditing the mutation model or planning the fork from the ADRs is actively misled. | reshaped | 3.23 |
| 15 | `resource-service-calibration-seam` | frontend / small | Export the generic `getResource<T>` verb; move the Go calibration orchestration (fetch + intensity factory + hue-shift watch) to the engine side. | The named Band-1 exemplar's only public method is Go-specific and fetches as `<any>` — while the proper type already exists one import away. A concrete fork-blocking import line. | advances | 3.18 |
| 16 | `rehome-agnostic-utils-engine-util` | frontend / small | Move `generateUUID` + `updateRegistry` out of Go-bound `engine/util.ts` into `lib/utils.ts`. | Domain-free helpers stranded in a [B3] module drag false Go edges onto agnostic consumers, including the generic settings write path. Verified: do **not** merge `setDeep` with the knobs walkers — deliberately different failure semantics. | advances | 3.19 |
| 17 | `keybindings-substrate-catalog-split` | frontend / medium | Split the generic keybindings registry substrate from the Go-shaped action catalog; parameterize the `enabledWhen` predicate vocabulary and the validator. | The [B1]-tagged file's handlers dispatch the analysis engine; the fork wants the substrate wholesale and the catalog not at all. Persisted action ids confirmed unchanged by the split. | advances | 3.16 |
| 18 | `review-scoring-named-seam` | frontend / medium | Extract per-move delta scoring from `useReviewSession` into a named engine-band function taking an enrichment accessor; tier-1 tests for the scan-order logic. | ADR-0003 designed exactly this seam in prose and named this file as its drift canary — the canary tripped (ADR says Band 2, FILES.md says B3). The SR orchestration is what the fork keeps. | advances | 3.17 |
| 19 | `band-conformance-ci-check` | frontend / medium | A CI script checking FILES.md band tags against the import graph (`band(file) ≥ band(import)`), warn-first, with the two band-mixed hubs handled explicitly. | Band tags are review-enforced only and have demonstrably drifted (one tag points at a file deleted nine days ago). With the fork, the B1 boundary becomes contractual. | advances | 3.14 |
| 20 | `reviewcard-canonical-content-rename` | frontend / small | Rename `ReviewCard.sgf` → `canonicalContent`, matching the generic wire field the ACL currently re-specializes. ~5 src sites + ~3 test fixtures, compiler-driven. | The backend already generalized (`canonical_content` on the wire); 34b *deliberately* kept the Go name, premised on "no second domain consumer" — the fork invalidates that premise. | advances | 3.20 |

## Not filed, on purpose

- **RegistryEditor vocabulary extraction** — refuted as a duplicate: the open
  `config-schema-projections` item's design note already covers it, found more
  than the candidate did, and anticipated the fork. The actionable residue is
  a priority *raise* on that existing item plus a FILES.md drift annotation.
- **Updates to eight existing items** (widening the silent-coercion audit,
  activating `gradingparameter-opacity-typing`, evidence refs on the
  refactoring queue and board-scope items, the `config-schema-projections`
  raise) — editing existing items is curation, so the audit (§4) specifies
  each edit without staging it.

License: Public Domain (The Unlicense).
