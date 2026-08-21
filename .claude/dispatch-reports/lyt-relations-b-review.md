# LYT relations-first amendment — fresh-context review of dispatch B (compiler + grammar)

Reviewer: fresh-context adversarial review, refute posture. Findings
below were formed from the ratified spec, the diff, and gates/probes
run independently in this session; the builder's own report
(`.claude/dispatch-reports/lyt-relations-b-compiler-grammar.md`) was
read only after these findings were drafted, solely to check for
undisclosed divergence (§7).

**Documents read end to end before this review was written** (per
ADR-0002): the governing spec
`.claude/dispatch-reports/lyt-relations-amendment-spec.md` (627 lines,
full census/primitive-inventory/grammar-sketches/probe-contract/purge-
accounting/open-questions); dispatch A's review
`.claude/dispatch-reports/lyt-relations-a-review.md` (233 lines, in
full, since its minor findings are riders on this dispatch); the full
diff `git diff lyt-phase2...HEAD` in the worktree, read as five
per-file slices (`relations.py` — new file, 699 lines, read whole, not
as a diff; `parser.py`, `loader.py`, `errors.py`+`README.md`,
`tests/test_relations.py` — each diff/new-file read in full); the
governing spec's cited §4.2 window of `SPEC.md` (the "Reservation, not
measurement" section, read around it for context); ledger rows
2396/2397/2400/2401/2402 (`./autoharn led show <id>`, from the main
repo checkout, read in full).

**Not read end to end, disclosed**: `SPEC.md`'s other ~1780 lines
outside the §4.2 window sampled for the envelope-repair claim;
`compiler.py`, `wellformed.py`, `emit_layout_tree.py` were grepped for
specific symbols (`envelope`) rather than read end to end — the same
narrowing the builder's own report discloses and justifies (no AST
change means those modules cannot behave differently; the full,
green 419-test run is what this review's own independent gate re-run
corroborates, not a read of those modules' internals). No claim below
rests on their content beyond what was grepped and independently
verified by direct probes against the built system.

---

## 1. Scope-restriction / narrowing audit (row 843/846 discipline)

| Narrowing | Ratified? | Basis |
|---|---|---|
| Relations wired only into `min`/`pref`/`max`/bare shorthand/`pinned`/envelope-state/`@demote`-threshold, not `min <axis>`/`floor <axis>`/`unit <axis>`/`ceiling <axis>`/`gap` itself | Disclosed prominently in `loader.py`'s own module docstring and the build report §7(1); no census row or spec §3 worked fragment needs a relation in those axis-keyed positions (verified by re-reading spec §3's three fragments) — a genuinely unnecessary-to-need narrowing, not a silent gap in required coverage. | Consistent with row 843/846 discipline: surfaced, not buried. |
| `aspect-of` has no `.lyt`-source grammar path via the `aspect <number>` key | Disclosed (build report §7(2)); the resolution function is implemented and tested directly against a parsed `RawRelation`, only the concrete-syntax wiring into the `aspect` key is missing. Board aspect is `1` in both real encodings and never varies, so nothing in the census is blocked. | Disclosed, non-blocking. |
| Sibling references left-to-right, one enclosing split deep only | Disclosed (build report §7(4)); matches every worked fragment in spec §3, which never needs more. | Disclosed, non-blocking. |
| `wellformed.py`/`compiler.py`/`presence.py`/`runner.py`/`emit_layout_tree.py` and the two clean-room encodings not read end to end by the builder | Disclosed and justified (no AST change — `lyt_ast.py` is untouched, confirmed by this review's own `git diff --stat`, so those consumers cannot observe a behavioral difference from a relation vs. a literal). | Disclosed, and independently verifiable: `lyt_ast.py` does not appear in the diff at all. |
| L3 envelope repair delivered as a **capability** (relation-valued dict-envelope states), not a rewrite of the two real encodings' still-fabricating bare-name envelope declarations | Disclosed at length in both `loader.py`'s inline commentary and the build report §4 ("There was no code path that ever computed a max — the 'fabrication' was an absence, not a function to delete... Backward compat, deliberately preserved... completely unchanged"). Consistent with ruling 2400's own serial build sequence (A relocation, B compiler+grammar, C encoding rewrite). | **Disclosed, but see §4 below** — the commissioned-scope framing ("the fabricated single-reservation path removed") oversells what changed in the artifacts that matter (the two real encodings), and this needs an explicit rider to the commissioner, not merely a comment buried in `loader.py`. |

No unratified, hidden narrowing found. Every scope restriction traces
either to an explicit disclosure in the diff's own commentary/build
report or to the ratified A→B→C serial sequence. The one item this
review elevates beyond "disclosed, fine" is the envelope repair's
practical scope, discussed in §4.

## 2. Minting census

| Mint | Basis | Risk |
|---|---|---|
| Nine primitive names (`width-of`, `height-of`, `aspect-of`, `pitch-of`, `wrap-breakpoint`, `text-width-of`, `read-constant`, `max-over`, `sum-of`) + `pack-rows` | Directly named, spec §2, verbatim. | None. |
| `pinned <extent>` sizing-bag key | Directly grounded in spec §3(b)'s own worked fragment, `{pinned max-over(children.min)}` — not an invented spelling. | None. |
| `relations.py` (new module) | Implementation-location choice, not a wire/syntax decision; spec §4 recommends a facts-table consumer without naming a file. Reasonable, unremarkable. | None. |
| `RawRelation`/`RawRelationRef`/`RawRelationNumber`/`RawRelationList`/`RawRelationKwarg` (parser-internal AST types) | Internal representation, not concrete syntax — the concrete grammar (`IDENT(args)`, `key: value`, `[...]`) is what the spec sketches, and these types mirror it directly. | None. |
| `errors.RelationsFirstDeprecationWarning` (new warning class) | Directly required by the commissioned scope's task 4 ("px literals stay parseable this wave with a deprecation channel flippable to refusal") — the *requirement* is ratified; the specific mechanism (a `DeprecationWarning` subclass + `warnings.warn`, flippable via `-W error::...`) is a reasonable, disclosed representation choice for satisfying it, not a fresh unratified fork. | Low — flagged per row 2392's "representation choices are the commissioner's" discipline, but this one is a narrow implementation of an already-ratified requirement, not a new design axis. |
| `read-constant(theme, <token>)` special-cased source names (`theme`/`theme.css`/full path) | Directly grounded ("theme-token table from theme.css source" is explicit commissioned scope item 2); the specific alias spelling is an implementation choice, disclosed with a concrete, load-bearing reason (avoiding the `--` line-comment collision). | None. |
| `_get_facts_table`/`reset_facts_table_cache` (loader test seam) | Implementation/testing seam, not user-facing. | None. |

No literal, key, or filename in this delivery is keyed on a file:line
or other unstable coordinate. No representation fork was found that
lacks a traceable basis in spec §2/§3 or an already-ratified task
requirement.

## 3. Refusal contract — verified with independently authored probes

Per the review brief's instruction, the following probes were written
fresh in this session (not copied from `test_relations.py`) and run
against the actual built loader/relations modules:

- **(a) Reference a nonexistent fact** — `width-of(totallyMadeUpWidget, whatever)`
  against the **real** committed `facts.generated.json`. **REFUSED-AS-EXPECTED**:
  `LytLoadError`, `{"prohibition": "no-matching-facts-entry", "law": "relation", "candidates_found": 0}`.
- **(b) Consume an `unexercised: true` entry** — `width-of(boardRail)` (a real
  entry in the committed `facts.generated.json`, `unexercised: true`).
  **REFUSED-AS-EXPECTED**: same prohibition, `candidates_found: 1,
  candidates_unexercised: 1` — an entry that exists but was never
  measured is treated identically to an absent one, not a degraded
  fallback.
- **(c) Malform a relation expression** — three shapes tried:
  `max-over()` (empty operand list), `sum-of(4px, children.min)`
  (a `children.*` reference outside `max-over`'s sole-operand form),
  `pack-rows(items: [10px, 20px])` (missing `target-rows`). All three
  **REFUSED-AS-EXPECTED** with distinct, structured prohibitions
  (`empty-max-over`, `children-ref-outside-max-over`,
  `missing-target-rows`).
- **Deprecation channel** — a synthetic 3-line encoding loaded with
  `warnings.catch_warnings(record=True)`: `RelationsFirstDeprecationWarning`
  fired for every literal px bound, **WITNESSED**. The same load under
  `warnings.simplefilter("error", RelationsFirstDeprecationWarning)`
  raised the warning as an exception — **WITNESSED**, the flip-to-refusal
  channel works exactly as documented, with zero code change.
- **Theme-token resolution against the real source** —
  `read-constant(theme, space-tight)` / `space-medium` / `space-loose`
  resolved to `4.0`/`12.0`/`20.0` against the real
  `frontend/src/assets/css/theme.css`, matching the governing spec's own
  census values for those tokens exactly — **WITNESSED** against real
  data, not merely a synthetic fixture. An unknown token name refused
  loudly (`no-matching-facts-entry`) — **REFUSED-AS-EXPECTED**.
- **T-floor derivation from children, not duplicated** — a fresh probe
  (two synthetic children with `min` 664px-equivalent values) confirmed
  `max-over(children.min)` computes the componentwise max structurally,
  with no facts lookup — **WITNESSED**, matching spec §3(b)'s worked
  fragment and eliminating the class of redundant hand-typed literal
  spec §1.5 names as its clearest example.
- **Envelope max-over-states, independently constructed** — a fresh
  two-state synthetic facts table (`latency` widget, `d1`=40px,
  `d5`=96px) loaded through a genuine `envelope: {d1: width-of(...),
  d5: width-of(...)}` declaration: the slot's `pref` correctly landed on
  `96.0` (the max), and `envelope_state_extents` carried both resolved
  values — **WITNESSED**, this is a real max-over-facts computation, not
  a fabricated single number. A mismatched hand-typed `pref` against the
  same two states was **REFUSED-AS-EXPECTED**
  (`envelope-reservation-mismatch`).

No case produced a silent default, a guessed number, or a warning
where a refusal was warranted. ADR-0002 is honored throughout the
refusal paths actually exercised.

## 4. The envelope repair's real scope — a finding to surface, not a defect

Ruling 2400(4) named the problem precisely: the real encodings'
`I_engine` envelope declarations use the bare-name spelling (no
per-state extents), so the slot's reservation is whatever literal the
author typed, with the declared state list carrying no computational
weight — "the current behavior (declared states silently ignored,
single fabricated reservation) has the ADR-0013 shape."

This dispatch's delivered fix is real but narrower than the
commissioned-scope summary ("the fabricated single-reservation path
removed") suggests at face value: the max-over-states consistency
check itself (`pref` must equal `max(declared states' resolved
extents)`) **predates this dispatch** — it shipped with the METAMODEL
WAVE's dict-envelope upgrade, confirmed by reading `loader.py`'s own
pre-existing docstring citing "METAMODEL WAVE, item 2 (ledger row
2157/2173-2176)" for that exact check, unchanged by this diff. What
dispatch B actually adds is: a per-state extent inside that
already-existing dict-shape MAY now be a relation instead of only a
literal.

Concretely, for the two real, shipped `.lyt` encodings — confirmed via
`git diff --stat`, neither file appears in this diff at all — `I_engine`
still uses the bare-name spelling, and `_resolve_envelope_state_extents`
still returns `None` for it, exactly as before this dispatch. The
"fabricated single reservation" ruling 2400(4) flagged as having the
ADR-0013 shape is **still live in production** after this dispatch
merges; it will remain so until dispatch C rewires `I_engine`'s
declaration to the dict+relation shape once real per-state facts exist
for it (which they do not yet — dispatch A's probe harness only reached
cold-boot, unauthenticated, backend-less DOM, so no `I_engine`
connected/latency-state facts have ever been measured).

This is honestly and repeatedly disclosed in the diff's own inline
commentary and in the build report's §4 ("There was no code path that
ever computed a max — the 'fabrication' was an absence, not a function
to delete... Backward compat, deliberately preserved... completely
unchanged"), and it is consistent with ruling 2400's own serial build
sequence (A/B/C). It is not a hidden narrowing. But the gap between the
scope summary's verb ("removed") and the delivered state (a new,
unused-in-production alternate path; the old path untouched) is exactly
the kind of thing that should be said to the commissioner in plain
terms rather than left to be inferred from a docstring, since the
underlying ADR-0013-shaped defect the ruling was actually worried about
is unresolved in the shipping encodings until dispatch C lands.

## 5. A genuine, undisclosed gap: `facts.residue.json` entries are unreachable via any primitive

Commissioned scope item 2 names `facts.residue.json` explicitly as a
resolution source alongside `facts.generated.json`, and `relations.py`'s
own module docstring states the two are "concatenated — a residue entry
is just as authoritative a source of a px number as a measured one."

This claim does not hold against the real, committed
`facts.residue.json`. `FactsTable._split_key` assumes every facts-file
key follows dispatch A's `facts.generated.json` convention
(`{widget}[+widget...]|{method}[|variant]`) and derives `method` from
splitting the key **string**, rather than reading the `"method"` field
that `facts.generated.json` entries already carry directly (confirmed:
`facts.generated.json`'s own entries carry a `"method"` field, e.g.
`"method": "read-constant"`, which `_split_key` ignores in favor of
re-deriving the same value from the key text — a real, if usually
harmless, duplication of already-present data). `facts.residue.json`'s
19 entries do not follow that convention at all: their `"key"` values
are bare descriptive names (`"AT_basic_scoreLead"`,
`"side_column_max_cap_340px_component (landscape)"`, one even a
comma-joined multi-widget string), carry **no** `"method"` field, and
contain no `"|"` delimiter.

A probe run in this session against the real, loaded facts table
confirmed the consequence directly: every one of the 19 residue entries
tried against all seven facts-lookup primitives (133 combinations)
refused with `no-matching-facts-entry` — **zero** of the 19 residue
entries are reachable via any of the nine primitives as currently
implemented.

The failure mode is safe — ADR-0002 is honored, nothing resolves to a
wrong or guessed number — but the delivered capability the module's own
docstring claims ("just as authoritative... resolvable") does not
function against real data, and this dispatch's own test suite never
caught it, because every one of the 44 new tests exercises a synthetic
`FactsTable` built with pipe-delimited keys that dodge the real
residue-file shape entirely. The build report does not mention this
gap anywhere — this is a genuine **undisclosed** divergence between
what the delivered code claims to do and what it actually does against
the artifacts dispatch A committed, not merely a narrowing the builder
flagged and moved on from. Dispatch C will hit this wall the first time
it tries to reference a residue value (e.g., `otherBand`'s 160px/200px
floor, or the `340px` side-column cap) through any relation primitive.

## 6. Encoding and roundtrip integrity

`git diff --stat lyt-phase2...HEAD` touches exactly seven files:
`.claude/dispatch-reports/lyt-relations-b-compiler-grammar.md`,
`research/lyt/README.md`, `research/lyt/errors.py`,
`research/lyt/loader.py`, `research/lyt/parser.py`,
`research/lyt/relations.py` (new), `research/lyt/tests/test_relations.py`
(new). None of the four live `.lyt` encoding files
(`lengyue_landscape.lyt`, `lengyue_portrait.lyt`, `current_row_asis.lyt`,
`current_row_repaired.lyt`), the fixture/wart files, `lyt_ast.py`,
`compiler.py`, `wellformed.py`, `runner.py`, or
`facts.generated.json`/`facts.residue.json` appear in the diff —
trivially byte-identical since untouched.

Re-ran `emit_layout_tree.py --registration landscape` and
`--registration portrait` against the worktree's own committed
encodings: `git status --short frontend/` showed no diff and the output
files' md5 hashes were identical before and after regeneration —
**WITNESSED**, the two `frontend/src/state/lyt-layout*.gen.ts` files the
live SPA consumes are byte-identical pre/post this dispatch.

## 7. Gates — re-run myself, judged by exit code

- Built a fresh venv per `research/lyt/README.md`'s own "Solver
  environment" section, exactly as written
  (`python3 -m venv ... && pip install ortools pytest && pytest tests/ -q`)
  — **WITNESSED**, the recipe works verbatim, no missing steps.
- `pytest tests/ -q` (own venv): **WITNESSED, exit 0, 419 passed**
  (matches the build report's own claimed count exactly).
- `pytest tests/ -q --ignore=tests/test_relations.py`: **WITNESSED, exit
  0, 375 passed** — the pre-existing suite (matching row 2401's own
  post-dispatch-A baseline exactly) is unweakened; no regression.
- `pytest tests/test_relations.py -q`: **WITNESSED, exit 0, 44 passed**
  — this dispatch's own new coverage in isolation.
- Independent probes in §3/§5 above were run directly against `loader`/
  `relations`, not merely via the shipped test file.

## 8. Cross-check against the builder's own report (read last)

Read only after the findings above were independently formed. The
report is candid and matches this review's own independent results on
every point it addresses: same 419/375/44 test counts, same "capability
not retrofit" framing for the envelope repair (§4 above — the report's
own words, "the 'fabrication' was an absence, not a function to
delete," are exactly what this review's own reading of `loader.py`
confirms), same disclosed scope narrowings (axis-keyed positions,
`aspect-of`'s missing grammar wiring, one-split-deep sibling scoping),
same honest accounting of the ~15,600 deprecation-warning volume. The
report also surfaces a genuine finding of its own not asked for by the
brief (§9, a first-draft synthetic fixture that was `INFEASIBLE` for a
structural reason, corrected and explained) — a positive sign of
real engineering rather than box-checking.

**One material gap between the report and this review's own findings**:
the report's §2.5/§2.6 disclose which primitives have no matching
entries yet in `facts.generated.json` (correctly, and tested against
synthetic fixtures instead), but the report is **silent** on
`facts.residue.json`'s incompatible key shape (§5 above) — an omission
this review treats as undisclosed rather than a disclosed, reasonable
narrowing, since the module's own docstring makes an affirmative claim
about residue-entry resolvability that the delivered code does not
support.

## Minor findings (non-blocking, riders for dispatch C / a follow-up)

1. `_split_key` re-derives `method` (and `widget_ids`/`variant`) from
   the key **string** even where `facts.generated.json` entries already
   carry a `"method"` field directly — a `raw.get("method")`-first
   approach (falling back to key-derivation only when absent) would
   have been more literally aligned with dispatch A review's "bind to
   the fields, never parse the key string" instruction, and would very
   likely have surfaced the residue-file incompatibility (§5) at build
   time instead of leaving it for this review to find.
2. `loader.py`'s own inline comment describes a relation call in
   `min <axis>` position as reaching a load-time "relation expression...
   but no resolution context" refusal. A probe in this session shows
   the parser's own two-token lookahead for axis-keyed `min` (which
   requires the token immediately after the axis name to be
   `NUMBER`/`NUMUNIT`) never recognizes `min h width-of(...)` as an
   axis-min at all — it falls through to a different parse path and
   fails with a `LytParseError`, not the described `LytLoadError`. Same
   safety outcome (loud refusal), inaccurate internal comment.
3. Neither `SPEC.md` nor `SPEC-AMENDMENTS.md` was updated to describe
   the new relation grammar or the (partial) L3 repair — plausibly
   deferred by the three-dispatch sequence's own design, but worth an
   explicit rider so it isn't lost once dispatch C lands.

## Delta review — 2026-08-13, commit b3051204 (§5 fix)

Reviewed with the same refute posture, against the same worktree, on
top of the delivery already reviewed above. Findings below were formed
by reading `git show b3051204` in full and re-running independent
probes/gates against the fixed code — not from the commit message's own
account of itself, though that account is checked against the
independent findings at the end of this section.

**The fix.** `relations.FactsTable.load` previously called `_split_key`
unconditionally for every entry in every facts source, deriving
`widget_ids`/`method`/`variant` from the `"key"` string even where a
`"method"` field was already present (`facts.generated.json`) and even
where the key shape didn't support it at all (`facts.residue.json`).
The fix makes field-binding field-first: `raw.get("widget_ids")`/
`raw.get("method")`/`raw.get("variant")` are read directly when present,
and `_split_key`'s key-string parsing is now demoted to a per-field
fallback (used only for whichever of the three a given entry doesn't
supply). `facts.residue.json`'s 19 entries were given explicit
`widget_ids` (a list, matching `facts.generated.json`'s own `+`-joined
convention for the six `SP_*` leaves), `method` (uniformly
`"read-constant"`), and `variant` (where landscape/portrait values
differ) — additive only, every pre-existing field (`key`, `component`,
`value_px`, `axis`, `status`, `basis`) unchanged. Three entries with no
real LYT tree widget to attach to (the side column's own max cap, and
two loader-internal constants, `PX_PER_CH`/`WRAPPER_MIN`) get disclosed
synthetic `widget_ids` handles (`sideColumnMaxCap`/`PX_PER_CH`/
`WRAPPER_MIN`), named as synthetic in both the file's own `_comment`
header and each entry's own `basis` field, not left for a reader to
discover as a surprise.

**§5 reachability — re-probed independently, against the real fixed
table.** A fresh probe (not copied from the new test file) resolved
`read-constant(<widget_ids[0]>[, <variant>])` for all 19 real,
committed `facts.residue.json` entries: **19/19 resolved successfully,
every resolved value exactly matching that entry's own `value_px`**
(200/200/200/200/200/200/90/160/160/200/200/160/160/160/200/340/8.0/96/
300 — the full census). Also independently confirmed a multi-widget
entry resolves correctly against a NON-first member of its `widget_ids`
list (`read-constant(SP_keybindings, landscape)` → `160.0`), ruling out
a fix that only happens to work for `widget_ids[0]`. Where my original
review found 0/19 reachable, this delta finds 19/19 reachable, with
correct values, against the real committed file — the §5 condition's
concrete defect no longer reproduces.

**Regression check on everything previously verified.**

- **`facts.generated.json` entries still resolve unchanged**: re-probed
  `width-of(A_engine_controls)` → `185.0`, `read-constant(tree,
  portrait-floor)` → `140.0`, `read-constant(AT_multires)` → `580.0` —
  identical to the values verified against the pre-fix code.
- **Refusal contract unchanged**: re-ran the same three probe shapes
  from the original review — nonexistent widget, an `unexercised: true`
  entry (`boardRail`), and an empty `max-over()` — all still
  **REFUSED-AS-EXPECTED** with the same prohibitions
  (`no-matching-facts-entry` twice, `candidates_unexercised: 1` for the
  unexercised case, `empty-max-over`).
- **Encodings and `.gen.ts` outputs still untouched**: `git diff
  --name-only lyt-phase2...HEAD` now lists eight files — the original
  seven plus `research/lyt/facts.residue.json` — still no `.lyt`
  encoding, fixture, wart file, or `.gen.ts` output. Regenerated both
  `frontend/src/state/lyt-layout*.gen.ts` files again from this
  worktree: `git status --short frontend/` empty, md5 hashes unchanged
  from both this delta's own regeneration and the original review's.
- **Full suite, exit code**: `pytest tests/ -q` — **WITNESSED, exit 0,
  421 passed** (the claimed count, exactly): 375 pre-existing + 46 in
  `test_relations.py` (44 original + 2 new table-driven reachability
  tests, matching the commit message's "+2 new tests" precisely).
  `--ignore=tests/test_relations.py` alone still gives 375/375 — no
  regression to the pre-dispatch-B baseline.
- **Minor finding 2 (axis-min comment)**: the corrected `loader.py`
  comment now accurately describes a `min <axis> <relation>` call as
  failing at PARSE time (`LytParseError`, the axis-min lookahead never
  recognizing the shape) rather than the LOAD-time refusal the original
  comment claimed — matches what this review's own original probe
  found. Fixed as claimed.

**The new regression tests are real, not decorative.** Read in full:
`test_every_real_facts_entry_method_is_mapped_to_some_primitive` loads
the actual committed files and asserts every entry's `method` value is
one some primitive's `_PRIMITIVE_METHOD` mapping reaches (this is
exactly the check that would have caught the original defect at build
time, since the pre-fix `method` for every residue entry was the empty
string, matching nothing). `test_every_real_facts_entry_resolves_or_is_
disclosed_unusable` goes further: for every real entry it builds
`<primitive>(widget[, variant])` from the entry's own fields (never the
raw key string), resolves it through the real pipeline, and asserts a
live entry resolves to its own declared `value_px` while an honestly
`unexercised`/errored entry still refuses — correctly distinguishing
"never reachable" (the original bug) from "reachable but the probe
found nothing" (a different, legitimate outcome). Both were re-run
independently in this session (§ above) with the same result the
commit claims.

**Synthetic widget handles — judged, not merely noted.** `sideColumnMaxCap`/
`PX_PER_CH`/`WRAPPER_MIN` are new stable identifier strings, minted to
give three residue facts (a Split node's own max cap and two
loader-internal constants) something for `read-constant`'s first
argument to name, since none of the three has a real LYT tree widget id
to attach to. Weighed against row 2392's "representation choices are
the commissioner's": this is not a fresh representation fork on the
order of new grammar or a new primitive — it reuses the already-ratified
`read-constant` primitive exactly as designed, and there is already a
direct precedent for a non-widget `read-constant` subject *within this
same dispatch*, ratified by task 2: `read-constant(theme, <token>)`,
whose first argument (`theme`) is likewise not a tree widget id. Minting
three more non-widget lookup names for the same primitive, for the same
reason (a fact with no widget to attach to), is a narrow extension of an
already-accepted pattern, not a new one. It is also disclosed at three
independent layers (commit message, `facts.residue.json`'s own
`_comment` header, and each of the three entries' own `basis` field) —
none of the "silent" failure modes this review's obligations are
watching for. Judgment: **honest disclosed naming, not an unratified
mint** — worth a one-line mention to the commissioner alongside the rest
of the minting census, not a blocking finding.

**Cross-check against the fix commit's own message.** Read last, after
the above was independently formed. No undisclosed divergence: the
commit message's claims (field-first binding, additive residue-file
fields, three disclosed synthetic handles, the axis-min comment
correction, 421 passed/+2 tests) all match what this delta
independently re-derived.

### §5 condition: DISCHARGED

The concrete defect (0/19 real residue entries reachable via any
primitive, contradicting `relations.py`'s own docstring) no longer
reproduces — independently re-verified at 19/19, correct values,
against the real committed file, with a regression test now guarding
it at build time. No previously-verified behavior regressed.

The other item raised in the original review (§4 — the L3 envelope
repair is a capability addition, not a rewrite of the two real
encodings' still-fabricating `I_engine` declaration) was never a code
defect and this delta correctly does not touch it; it remains an
accurate, already-disclosed rider for the commissioner ahead of
dispatch C, not a condition on this dispatch's own correctness.

## Verdict (superseded by the delta review above): originally ACCEPT-WITH-CONDITIONS

The paragraph below is preserved as the record of the original,
pre-delta judgment; the live verdict is the "Final verdict" section
that follows it.

Basis (as of the original review, before commit b3051204): the core
deliverable — a closed nine-primitive relation grammar with a
disciplined parser-permissive/loader-refuses split, resolution against
the real facts and theme-token tables, structural T-floor derivation
eliminating a named redundant literal, a working and
independently-verified deprecation/flip-to-refusal channel, and 44 new
tests plus a green 419/419 full-suite run with no regression to the
pre-existing 375 — was substantial, well-disciplined, and independently
reproduced via fresh probes and a fresh venv build, not merely trusted
from the builder's self-report. No `.lyt` encoding file was touched,
and both `.gen.ts` regenerations were byte-identical. But two concrete
conditions needed discharging: (1) the `facts.residue.json`
key-matching gap in §5 — zero of the 19 committed residue entries
reachable via any relation primitive, contradicting `relations.py`'s
own stated design intent, uncaught by the delivered test suite and
undisclosed in the build report; and (2) an explicit statement to the
commissioner that the ADR-0013-shaped fabricated-reservation behavior
ruling 2400(4) named is still live in both real encodings after merge
and remains so until dispatch C rewires `I_engine`.

## Final verdict: ACCEPT

Condition (1) is **discharged** — the delta review above independently
re-verified, against the real committed `facts.residue.json` (not a
synthetic fixture), that all 19 entries now resolve correctly through
`read-constant`, with the exact expected `value_px` for each, and a
table-driven regression test now guards this at build time against any
future facts entry whose `method` maps to no primitive. Nothing
previously verified (generated-file resolution, the refusal contract,
encoding/`.gen.ts` byte-identity, the full gate suite) regressed; the
suite now passes 421/421 by exit code, independently re-run. Condition
(2) was never a code defect in dispatch B's own delivery — it is an
accurate, already-disclosed characterization of what remains for
dispatch C, correctly out of this delta's scope, and is carried forward
here as a rider rather than a blocking condition: **the commissioner
should treat ruling 2400(4)'s underlying complaint as still open in
production until dispatch C rewires `I_engine`'s envelope declaration**,
even though the capability to fix it is now built, tested, and,
per this delta, genuinely reachable end to end.

With the one concrete code defect this review found now fixed and
independently reproduced fixed, and no other blocking finding
outstanding, the delivery is **ACCEPT**.
