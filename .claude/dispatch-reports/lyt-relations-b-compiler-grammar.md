# LYT relations-first amendment — dispatch B: grammar + loader relation resolution (build report)

Dispatch B (ledger rows 2396/2397/2400/2401). Scope: extend the `.lyt`
grammar with the nine ratified relational primitives, wire loader-side
resolution against the generated facts tables, repair the L3 envelope
gap, keep backward compat for px literals with a deprecation channel, and
add test coverage. This report supersedes the earlier stop-report commit
in this worktree's history (`df18cc07`) — the blocker named there (the
governing spec and dispatch A's review missing from the worktree) was
fixed orchestrator-side; both documents are now present and were read end
to end before any edit below.

**Documents read end to end** (per ADR-0002): the governing spec
(`.claude/dispatch-reports/lyt-relations-amendment-spec.md`, 627 lines);
dispatch A's review (`lyt-relations-a-review.md`, 233 lines); `SPEC.md`
(1819 lines); `lyt_ast.py` (885 lines); `parser.py` (856 lines, pre-edit);
`loader.py` (2626 lines, pre-edit, read in two passes); `flow.py` (249
lines); `errors.py` (43 lines); `research/lyt/tests/test_lyt.py`'s header
and fixture-resolution pattern (to match test conventions). `SPEC-
AMENDMENTS.md` was consulted via its own table of contents (grepped
section headers) rather than read end to end — a real, disclosed
narrowing: no claim below rests on any Amendment 1-9 text beyond what
`SPEC.md`'s own current-state sections (§9.3-§17, which restate each
amendment's ruling in current-form) already cover, and the governing
spec's own census (§1) is what actually enumerates the nine primitives'
grounding, not `SPEC-AMENDMENTS.md` directly. `wellformed.py`,
`compiler.py`, `presence.py`, `runner.py`, `emit_layout_tree.py`, and the
two clean-room encodings were **not** read end to end — a disclosed
narrowing, justified below (§7).

## 1. Base freshness (re-confirmed after the mid-flight unblock)

Worktree was rebased onto `lyt-phase2` in this session's earlier turn,
landing on `b632bbcc` (dispatch A's merge). No further rebase was needed
— `git log -1 --oneline lyt-phase2` still resolves to the same commit at
build time.

## 2. Grammar delta

### 2.1 Relation-expression syntax (parser.py)

Before (extent position accepted only a numeric literal or a bare
symbolic identifier):

```
extent_term ::= NUMBER unit? | IDENT
```

After — `IDENT "("` is recognized as a relation call, permissively, at
every position an extent literal was legal (`min`/`pref`/`max`, the bare
`{extent}` shorthand, the new `pinned <extent>` key, an envelope state's
own extent, and `@demote`'s threshold):

```
extent_term  ::= NUMBER unit? | IDENT | relation
relation     ::= IDENT "(" [relarg ("," relarg)*] ")"
relarg       ::= (IDENT ":")? relarg_value
relarg_value ::= "[" [relarg ("," relarg)*] "]"    -- pack-rows' items list
               | NUMBER unit?                       -- a literal extent operand
               | NUMBER                              -- a bare number (target-rows: N)
               | relation                            -- nested composition
               | IDENT ("." IDENT)*                  -- a dotted/hyphenated reference
```

No relation name is hard-coded in the parser — any `IDENT(...)` parses
as a relation call, matching this codebase's established "parser
permissive, loader refuses" division of labor (the same posture
`WRAPPER_MIN`, bare `envelope`, and every Amendment 5/6/7/8 sizing key
already use). A `+`-extent sum may not contain a relation call (`sum-of`
is the explicit spelling for that); the parser refuses this loudly at
parse time rather than silently mis-combining two different composition
mechanisms.

A `DOT` token was added to the tokenizer for `tree.min` / `children.min`
/ `SidebarWidget.vue`-shaped references (`parser.py`'s `TOKEN_SPEC`).

New sizing-bag key: `pinned <extent>` — the explicit-keyword spelling of
the pre-existing bare `{extent}` shorthand (`min=pref=max=that value`),
needed because a relation call cannot trigger the shorthand's own
NUMUNIT/NUMBER lookahead (governing spec §3(b)'s worked fragment,
`{pinned max-over(children.min)}`, is the motivating case). The two are
mutually exclusive — declaring both in one sizing block is refused
loudly (`prohibition: "fixed-and-pinned"`).

### 2.2 Fragment (a) — `width-of`, from the governing spec §3(a)

Before:

```
@toggle(user, release) {min 168px, pref 168px, max 168px} boardRail[common, info+action],
```

After (this dispatch ships the CAPABILITY; the two committed clean-room
encodings are **not** rewritten — that is dispatch C's own scope, per
the brief):

```
@toggle(user, release) {pinned width-of(SidebarWidget.vue, rail-column)} boardRail[common, info+action],
```

Verified end to end against a synthetic fixture (`tests/test_relations.py`'s
`sideRail` leaf, `{pinned width-of(sideRail, default)}`, resolving to
168px from a synthetic facts entry) — WITNESSED.

### 2.3 Fragment (b) — `max-over(children.min)` / `sum-of`, T-floor derivation

Before (the redundant literal SPEC.md §1.5 names as the clearest example
of a hand-typed number duplicating what the compiler already derives):

```
@demote(h 778px) {min 664px, pref 664px, max 664px} T( ... )[BLACK BOX],
```

After (capability shipped, exercised by this dispatch's own synthetic
test, not applied to the real encodings this wave):

```
@demote(h sum-of(max-over(children.min), tree.min, gap)) {pinned max-over(children.min)} T( ... )[BLACK BOX],
```

`max-over(children.min)` is resolved **structurally** — no facts lookup
at all — from the T node's own already-loaded children's `Sizing.min`
(componentwise max, the same formula `compiler.py`'s own T-branch already
computes independently, now also available to the LOADER so the loaded
AST's own `Sizing.min` is honest rather than left at the disclosed 0px
placeholder). WITNESSED via `test_max_over_children_min` and the
synthetic end-to-end tree (`panelA.min=40`, `panelB.min=55` →
`T.min=T.pref=T.max=55`).

### 2.4 Fragment (c) — `pack-rows`, wired to the real `flow.py`

```
{min pack-rows(items: [text-width-of(...), ...], target-rows: 2)} T(...)
```

`pack-rows` calls `flow.narrowest_width_for_row_count` for real (not a
stub) — WITNESSED via `test_pack_rows_matches_flow_py_directly`, which
asserts the relation's resolved value equals a direct `flow.py` call on
the same inputs, and `test_pack_rows_refuses_unreachable_target`
(REFUSED-AS-EXPECTED, `flow.LytFlowError` re-wrapped as
`LytLoadError{prohibition: "pack-rows-unreachable"}`).

### 2.5 The other six primitives

`height-of`, `aspect-of`, `pitch-of`, `wrap-breakpoint`, `text-width-of`,
`read-constant` all resolve through one shared facts-lookup path
(`relations._resolve_facts_relation`) keyed on a per-primitive `method`
string (`playwright-boundingBox` for width-of/height-of,
`domain-invariant` for aspect-of, `pitch` for pitch-of,
`wrap-breakpoint`/`text-width-of`/`read-constant` for themselves) plus an
axis where the primitive's own name implies one. **Disclosed minting**:
none of `facts.generated.json`'s current 12 entries carry a `pitch`,
`wrap-breakpoint`, `text-width-of`, or `domain-invariant` method — every
real use of those four primitives against the COMMITTED facts file
refuses today (`no-matching-facts-entry`), correctly, since dispatch A's
probe harness hasn't populated them yet. Each is exercised WITNESSED
against this dispatch's own synthetic `FactsTable` fixture instead (see
`test_relations.py`'s `_synthetic_facts_table`).

### 2.6 `read-constant(theme, <token>)` — the theme-token table (task 2)

`relations.py`'s `FactsTable.load` additionally parses
`frontend/src/assets/css/theme.css` (a plain regex over `--token: Npx;`
declarations, `_load_theme_tokens`) into a small `name -> px` table,
consulted when `read-constant`'s first argument names `theme`/`theme.css`.
**Load-bearing gotcha, found and fixed during build**: a `.lyt`-source
token name may never carry its own leading `--` — that spelling collides
with this language's pre-existing `-- text` line-comment marker
(`parser._strip_comments` runs before tokenization and truncates the
line at the first `--` it sees), so `read-constant(theme, --space-tight)`
silently loses everything after `--space-tight)` and fails to parse. The
resolver accepts the bare name (`read-constant(theme, space-tight)`) and
adds the `--` prefix internally; documented in `relations.py`'s own
inline comment at the call site so dispatch C doesn't rediscover this by
a confusing parse error. WITNESSED (`test_read_constant_theme_token_resolves`,
`test_read_constant_theme_token_refuses_unknown_token`).

## 3. Resolution semantics

`relations.py` (new module, ~470 lines) owns the closed nine-primitive
vocabulary and every resolution function; `loader.py` threads a
`relations.RelationContext` (facts table + accumulated sibling `Sizing` +
enclosing `gap_px` + a T node's own children `Sizing`, when applicable)
through `load_slot`'s existing recursive descent. Key design points:

- **Facts-key binding, per dispatch A review's own instruction**: a
  `facts.generated.json`/`facts.residue.json` entry's `"key"` string is
  parsed exactly ONCE, centrally, at `FactsTable.load` time
  (`relations._split_key`) into structured `widget_ids`/`method`/`variant`
  fields on `FactsEntry`; every resolution function afterward reads those
  fields, never the raw key text again.
- **Lateral sibling references** (`tree.min`, per fragment (b)) resolve
  LEFT TO RIGHT only, within the SAME enclosing split — `load_slot`'s
  Split branch now loads its children in an explicit loop (replacing the
  prior list comprehension) so each child's own `RelationContext` carries
  a snapshot of the siblings already loaded before it. A forward
  reference (naming a sibling not yet loaded) is refused loudly
  (`prohibition: "forward-sibling-reference"`), a disclosed scoping
  choice named in `relations.py`'s own docstring, not a silent limitation.
- **`children.min`/`children.max`** resolve only while loading an
  Exclusive (T) node's OWN sizing, from its just-loaded children;
  refused loudly anywhere else (`children-ref-outside-exclusive`,
  `children-ref-outside-max-over`).
- **`gap`** resolves to the enclosing split's own declared `gap_px`
  (`_load_gap_px` was moved earlier in `load_slot`'s Split branch so it
  is available before children — and therefore their relation
  contexts — are built).
- **No AST changes.** Every relation resolves, at load time, to a plain
  `ast.Extent(unit="px", v=...)` — `lyt_ast.py` is byte-identical to
  before this dispatch. This was a deliberate design choice: it keeps
  `wellformed.py`, `compiler.py`, `emit_layout_tree.py`, and every other
  AST consumer completely unaffected (none needed reading or editing —
  see §7's scope-narrowing justification), and it means a relation and a
  literal are indistinguishable once loaded, which is exactly the
  "reservation, not the syntax that produced it, is the fact" posture
  the rest of this language already takes for `WRAPPER_MIN`/`maximize`.

## 4. Envelope repair (task 3, ruling 2400(4))

**The old fabricated-reservation path, shown removed.** Before this
dispatch, `basis == 'envelope'` with no per-state extents (the ONLY
spelling either clean-room encoding uses, e.g. `I_engine`'s `{28px,
envelope: {disconnected, connected_5digit_latency}}`) took the author's
literal `pref`/fixed extent as the reservation, full stop — SPEC.md §4.2's
own words, quoted verbatim in this dispatch's earlier read: "the code
does not compute a max over anything; it stores a fixed extent and a
state list side by side." There was no code path that ever computed a
max — the "fabrication" was an absence, not a function to delete.

**What this dispatch adds**: `_resolve_envelope_state_extents` (already
existing, from the METAMODEL WAVE's dict-envelope upgrade) now threads
`RelationContext` through its own `_resolve_extent_like` calls, so a
per-state extent MAY be a relation (`envelope: {s1: height-of(metrics,
s1), s2: height-of(metrics, s2)}`). Once it is, the EXISTING consistency
check (unchanged code, `pref` must equal `max(resolved.values())`) is
what makes the reservation genuinely `max-over(width-of(component,
state)...)` — resolved from real facts, refusing loudly
(`no-matching-facts-entry`) if any declared state's relation can't find
one. WITNESSED: `test_envelope_derives_from_facts_and_matches_pref`
(pref lands on the correct max, 45px, of two synthetic facts entries),
`test_envelope_refuses_when_declared_state_has_no_facts_entry`
(REFUSED-AS-EXPECTED).

**Backward compat, deliberately preserved**: the LEGACY bare-name
spelling (no per-state extents at all — what `I_engine` in both real
encodings still carries) is **completely unchanged** —
`test_legacy_bare_envelope_still_loads_unchanged` WITNESSES this
directly. This dispatch does not retrofit the two real encodings' own
envelope declarations into forced facts-derivation, because no facts
entries exist yet for `I_engine`'s own states (dispatch A's probe reached
only cold-boot/unauthenticated/backend-less DOM) — doing so would make
both mainline encodings start refusing to load, which task 4 explicitly
forbids ("the roundtrip tests must stay green"). The repair is the
CAPABILITY, proven end to end against a synthetic fixture; wiring it into
the real encodings is dispatch C's own job, once real per-state facts
exist.

## 5. Backward compat / deprecation channel (task 4)

`errors.RelationsFirstDeprecationWarning` (new, `DeprecationWarning`
subclass) fires via `warnings.warn` every time `loader._resolve_extent_like`
resolves a plain px/ch literal under a live `RelationContext` — which is
every ordinary `load_layouts` call, since `load_slot` now always builds
one (lazily, from the process-wide facts table) when none is supplied.
Firing is silent when `ctx is None` (any call site outside the
concrete-syntax loading path, e.g. a direct unit test of
`_resolve_extent_like`) — the diagnostic is scoped to the path this
amendment actually governs. `pytest -W
error::errors.RelationsFirstDeprecationWarning` flips the channel from
"recorded" to "refused" with **zero code change** — this is the seam
dispatch C's own encoding rewrite is expected to flip.

**Honest finding, not swept under the rug**: running the full suite with
warnings enabled produces roughly 15,600 warnings (`pytest tests/ -q`,
no `-p no:warnings`) — every px/ch literal in `lengyue_landscape.lyt` /
`lengyue_portrait.lyt`, resolved at every representative screen size
`bench_solve.py`/`coverage_matrix.py`'s own tests re-solve at. This is
the correct, intended volume (every one of those literals genuinely IS a
deprecated-but-still-legal bound), but it is loud enough that a future
actor should probably add a per-run summary counter (e.g. "N deprecated
literals across M loads") rather than a warning per literal per load —
flagged here as a natural dispatch-C-adjacent follow-up, not fixed in
this dispatch (no ruling asked for it, and the raw warning volume does
not affect any gate's exit code).

## 6. Tests

New file: `research/lyt/tests/test_relations.py`, 44 tests, all against a
synthetic `relations.FactsTable` (installed via a new test seam,
`loader.reset_facts_table_cache`) — none touch the real committed
`facts.generated.json`/`facts.residue.json`, so this dispatch's own
primitives are provably correct independent of whatever facts dispatch
A/C happen to have populated. Coverage:

- Every one of the nine primitives: one WITNESSED resolution case, plus
  REFUSED-AS-EXPECTED cases where the census names one (no matching
  entry, an `unexercised: true` entry, an entry carrying `error`, an
  ambiguous multi-match, a relation with no resolution context, an
  unknown relation name).
- `max-over`/`sum-of`: literal operands, facts-derived operands, nested
  composition (mirroring the governing spec's own §3(b) fragment
  verbatim), the `gap` and `widget.min`/`.pref`/`.max` sibling
  references (WITNESSED and REFUSED-on-forward-reference), the
  `children.min`/`children.max` special case (WITNESSED and REFUSED
  outside a T node / outside `max-over`).
- `pack-rows`: arithmetic cross-checked directly against `flow.py`,
  `target-rows` required, unreachable-target refusal, items list built
  from nested relations.
- The `pinned` sizing key: resolves like the bare shorthand; declaring
  both `pinned` and the bare shorthand together is refused.
- L3 envelope repair: derives-from-facts, refuses-on-missing-state,
  legacy-spelling-unchanged (§4 above).
- Deprecation channel: literal bounds warn under a live context, stay
  silent with `ctx=None`.
- **End-to-end solve** (task 5's own required minimum): a small
  synthetic encoding written relations-first
  (`SYNTHETIC_RELATIONS_FIRST_ENCODING`) — three-way root `H` (a pinned
  `width-of` side rail, an elastic aspect-locked board column, a pinned
  `sum-of`-derived side column containing a `max-over`/envelope-bearing
  interior and the T-floor/`@demote` worked fragment) — loads, resolves
  every relation to the expected values
  (`test_synthetic_relations_first_encoding_loads_and_resolves`), and
  SOLVES via `compiler.solve_lexicographic`
  (`test_synthetic_relations_first_encoding_solves_end_to_end`,
  `OPTIMAL`/`FEASIBLE`, board square, root fills the viewport, no
  negative rectangles — the same shape `test_lyt.py`'s own
  `test_well_formed_encoding_solves` checks).

**A real bug found and fixed while building this synthetic tree**: the
first draft's root `H` had only TWO children (a fixed side rail and one
elastic column carrying everything else, including a fixed-width inner
row) — this produced a genuine `INFEASIBLE`, not a code defect: an
elastic column with no cap absorbs ALL remaining viewport width, but its
own fixed-width interior content (`treePanel` 90px + `T` pinned 55px +
4px gap = 149px) can never match whatever width the column happens to
be forced to. The real clean-room encodings avoid this by giving the
side column its own BOUNDED width (`min 340px, max 340px+60ch`), letting
the solver pick a width that satisfies both the outer partition equality
and the inner content sum simultaneously. The synthetic fixture was
restructured to the same three-way shape (elastic board column separate
from a bounded, `sum-of`-pinned side column) — a genuine, disclosed
finding about HOW to write a relations-first encoding correctly, not
merely a test-authoring slip, and worth flagging for dispatch C.

## 7. Disclosed scope narrowings

1. **Relation expressions are wired into `min`/`pref`/`max`/the bare
   shorthand/`pinned`/envelope per-state extents/`@demote`'s threshold
   only** — the positions the governing spec's own §3 worked fragments
   exercise. The Amendment-7/8 axis-taking keys (`min <axis>`, `floor
   <axis>`, `unit <axis>`, `ceiling <axis>`, `gap` itself) are **not**
   relation-aware this wave; a relation call there is refused the same
   way an unresolvable symbol already is (no `ctx` reaches
   `_resolve_extent_like` at those call sites). Named explicitly in
   `loader.py`'s own module docstring, not silently absorbed.
2. **`aspect-of` has no grammar wiring into the `aspect <number>` sizing
   key** — that key's own parser production (`parse_sizing`'s `aspect`
   clause) still expects a bare `NUMBER` token, unchanged. `aspect-of`'s
   resolution function is fully implemented and tested
   (`relations.resolve_relation` called directly against a parsed
   `RawRelation`), but there is no `.lyt`-source path to reach it via the
   `aspect` key this wave — a real, disclosed gap between "the primitive
   resolves" and "an author can spell it in the one place the census
   names for it." Board aspect is `1` in both real encodings and has
   never varied, so this did not block the end-to-end solve requirement;
   widening the `aspect` key to accept a relation is a small, clearly-
   scoped follow-on, not attempted here without checking whether it's
   wanted (a genuine representation question — should `aspect-of` even
   be spent on the one leaf that never needs it live?).
3. **`wellformed.py`, `compiler.py`, `presence.py`, `runner.py`,
   `emit_layout_tree.py`, and the two clean-room encodings were not read
   end to end** — justified by §3's "no AST changes" design point: every
   relation resolves to a plain `ast.Extent` before any of those modules
   ever see it, so none of them needed to change, and no claim in this
   report rests on their internals beyond what the full, green 419-test
   run already demonstrates behaviorally. Flagged per ADR-0002 rather
   than silently assumed safe.
4. **Sibling references are left-to-right only, one enclosing split
   deep** — no cross-split, cross-depth, or T-to-T-child lateral
   reference is supported. Every worked fragment in the governing spec
   needs at most this much; widening it is a genuine follow-on, not a
   silently-abandoned corner (see `relations.py`'s own docstring on
   `_resolve_ref`).

No STOP-and-report-worthy representation fork was hit beyond the two
narrowings above (1 and 2), both of which stay within syntax the spec
itself sketches — neither invents a new primitive or a new combining
form the spec didn't already name.

## 8. Infrastructure note (worth flagging, not a defect in this dispatch)

This worktree's `./autoharn led` ledger gate required `autoharn`,
`.autoharn-world.json`, and `deployment.json` — none of which are
tracked in git or present in a fresh worktree by default (the same class
of gap that blocked this dispatch's first attempt, before the governing
spec was copied in). They were copied from the main checkout
(`/home/bork/w/omega/`) into this worktree to unblock the ledger-entry-
per-file-edit gate; all three remain **untracked** here (matching the
main checkout's own untracked status for them) and are not part of this
dispatch's `git add`. Every source-file edit in this dispatch is
preceded by a ledger `decision` row (rows 2404-2418) per that gate's own
requirement.

## 9. Test inventory and exact gate commands

- `nice -n 19 /tmp/lyt_review_venv/bin/python3 -m pytest tests/test_relations.py -q -p no:warnings`
  — **WITNESSED, exit 0, 44 passed** (this dispatch's own new coverage,
  isolated).
- `nice -n 19 /tmp/lyt_review_venv/bin/python3 -m pytest tests/ -q -p no:warnings`
  — **WITNESSED, exit 0, 419 passed** (the pre-existing 375 + this
  dispatch's 44, together — no existing law/test weakened).
- `nice -n 19 /tmp/lyt_review_venv/bin/python3 -m pytest tests/ -q` (warnings
  enabled, no filter) — **WITNESSED, exit 0, 419 passed, ~15,600
  warnings** — see §5 for the honest accounting of that volume.

Venv used: `/tmp/lyt_review_venv` (built by a prior dispatch's review,
`ortools`+`pytest` already installed; this dispatch's own README.md
addition, §6/task 6, documents the one-line setup for future actors who
don't have one lying around).

## 10. Deliverable files

- `research/lyt/relations.py` (new) — the nine primitives' resolution
  semantics, `FactsTable`/`RelationContext`.
- `research/lyt/parser.py` — relation-call grammar, `pinned` key, `DOT`
  token.
- `research/lyt/loader.py` — `RelationContext` threading through
  `load_slot`, `_resolve_extent_like`/`_resolve_envelope_state_extents`/
  `_load_sizing`/`_load_demote_axis_and_threshold` relation-awareness,
  the facts-table cache (`_get_facts_table`/`reset_facts_table_cache`),
  the deprecation-warning emission site.
- `research/lyt/errors.py` — `RelationsFirstDeprecationWarning`.
- `research/lyt/README.md` — the "Solver environment" paragraph (task 6).
- `research/lyt/tests/test_relations.py` (new) — 44 tests per §6.

No `.lyt` encoding file, no `wellformed.py`/`compiler.py`/`presence.py`/
`runner.py`/`emit_layout_tree.py` were touched — matches the brief's own
scope line ("encodings are NOT rewritten here, that is dispatch C").
`facts.residue.json` WAS touched, additively, in the follow-up fix below
(§11) — that file is otherwise dispatch A's own deliverable, and this
dispatch's edit to it is scoped narrowly to adding identity/method
fields, per the fresh-context review's own explicit authorization.

## 11. Follow-up fix: `facts.residue.json` was unreachable via every primitive (fresh-context review §5)

The fresh-context review (`.claude/dispatch-reports/lyt-relations-b-review.md`,
verdict ACCEPT-WITH-CONDITIONS) found a genuine, undisclosed defect: zero
of the 19 committed `facts.residue.json` entries were reachable through
any of the nine relation primitives, directly contradicting
`relations.py`'s own docstring claim that residue entries are "just as
authoritative a source of a px number as a measured one." This dispatch's
own 44 tests never caught it because every one used a synthetic,
pipe-delimited `FactsTable` fixture that dodged the real residue file's
shape entirely — a real gap in test realism, not merely an edge case
missed.

**Root cause.** `FactsTable._split_key` assumed EVERY facts-file `"key"`
follows `facts.generated.json`'s own convention
(`{widget}[+widget...]|{method}[|variant]`) and derived `method`
(and `widget_ids`/`variant`) by splitting the key STRING, applied
unconditionally to every entry from every source. `facts.residue.json`'s
19 entries never followed that convention — bare descriptive keys
(`"AT_basic_scoreLead"`, `"side_column_max_cap_340px_component
(landscape)"`, one comma-joined six-widget string), no `"|"`, no
`"method"` field at all. Splitting those keys produced `method == ""`
for every one of them, which matches nothing in
`relations._PRIMITIVE_METHOD`'s value set — every lookup silently found
zero candidates, refused correctly (`no-matching-facts-entry`, ADR-0002
honored — the failure mode was loud and safe, never a wrong number), but
that refusal was indistinguishable from "this fact genuinely doesn't
exist yet," hiding the real defect (an identity-binding bug, not a data
gap) until the review's own fresh probe surfaced it.

**Fix, per the review's own required shape** ("bind to fields, never
parse the key string" — the SAME dispatch A review rider this module was
already built against, now applied to identity resolution too, not only
to already-parsed-entry interpretation):

1. `FactsTable.load` now reads `widget_ids`/`method`/`variant` from
   entry FIELDS first (`raw.get(...)`), falling back to
   `_split_key`'s key-string derivation only for whichever of the three
   a given entry does not supply as a field — entry by entry, not
   source by source, so a facts source is never forced to choose one
   convention for every entry it carries.
2. `facts.residue.json` itself gained explicit `widget_ids` (a list,
   matching `facts.generated.json`'s own `"+"`-joined multi-widget
   shape for the six `SP_*` leaves), `method` (uniformly
   `"read-constant"` — a residue value is, by construction, a
   documented estimate a human read off a note or a component's own
   disclosure, never a live `playwright-boundingBox` probe, so
   `read-constant`'s axis-agnostic, source-agnostic lookup shape is the
   honest fit among the nine primitives, not a repurposing of a
   mismatched one), and `variant` where landscape/portrait values
   genuinely differ (`CP-library_min`, `CP-cards_min`, the six `SP_*`
   leaves, `otherBand_min`). **Additive only** — every pre-existing
   field (`key`, `component`, `value_px`, `axis`, `status`, `basis`) is
   unchanged, confirmed by `git diff research/lyt/facts.residue.json`
   showing only new lines, no removed/altered ones.
3. **Three entries have no real LYT tree widget to attach to at all**
   (`side_column_max_cap_340px_component` — the side column is a Split
   node in both real encodings, which carries no `widget` id of its
   own; `loader.PX_PER_CH` and `WRAPPER_MIN_sentinel` — loader-internal
   constants, not leaf widgets). Their `widget_ids` are disclosed
   SYNTHETIC handles (`sideColumnMaxCap`, `PX_PER_CH`, `WRAPPER_MIN`),
   named as such in both the residue file's own `_comment` header and
   each entry's own `basis` field — not a new key-string convention (no
   change to how any key is SPELLED), and not silently invented without
   a trace.
4. `relations.py`'s own docstring (the module-level intro and
   `FactsTable`'s own class docstring) and `_split_key`'s docstring were
   corrected to describe the field-first binding accurately, with the
   original overclaim preserved and marked corrected (per this
   codebase's own "supersede, don't delete" convention), not silently
   rewritten.

**New test, table-driven against the REAL files** (`tests/test_relations.py`):

- `test_every_real_facts_entry_method_is_mapped_to_some_primitive` —
  loads the real `FactsTable` and asserts every entry's `method` field
  is a value some primitive's `_PRIMITIVE_METHOD` mapping reaches. This
  is the precise regression guard for the exact defect found: a method
  string (`""`, or any future typo/omission) that maps to nothing now
  fails at build time.
- `test_every_real_facts_entry_resolves_or_is_disclosed_unusable` —
  installs the real `FactsTable` as the process-wide cache and, for
  EVERY entry in both real files, constructs `<primitive>(widget[,
  variant])` relation text from the entry's own `widget_ids`/`variant`
  FIELDS (never the raw `key` string) and resolves it through the real
  loader pipeline: an entry with a genuine value must resolve to
  exactly that value; an entry that is honestly `unexercised` or
  carries an `error` must refuse — REFUSED-AS-EXPECTED, not conflated
  with the identity-binding defect this fix closes. WITNESSED for all
  31 real entries (12 generated + 19 residue) — both new tests pass
  clean.

**Minor finding 2 (loader.py comment accuracy), also fixed.** The
review found `loader.py`'s own inline comment (at the `_load_axis_mins`
call site inside `_load_sizing`) described a relation call in `min
<axis>` position as reaching a load-time `LytLoadError` about a missing
resolution context. A probe (`{min h width-of(a,b), pref 1fr, max inf}`)
shows the parser's own axis-min lookahead (which requires the token
immediately after the axis name to be `NUMBER`/`NUMUNIT`) never
recognizes it as an axis-min shape at all — it falls through to the
ordinary sizing-bag loop and fails with a `LytParseError` ("expected
COMMA, got IDENT 'width-of'") instead. Same safety outcome (a loud,
structured refusal), different layer than the comment claimed —
corrected in place, verified against the same probe.

**Explicit statement to the commissioner, per the review's second
condition.** The review's other condition (§4 of its own report) asked
for plain terms, not just an in-code disclosure: the ADR-0013-shaped
"fabricated single reservation" behavior ruling 2400(4) named is
**still live in both real, shipped `.lyt` encodings** after this
dispatch merges. `I_engine`'s own envelope declaration in
`lengyue_landscape.lyt`/`lengyue_portrait.lyt` still uses the bare-name
spelling (no per-state extents), and its reservation is still whatever
literal the author typed — this dispatch delivers the CAPABILITY to fix
that (a dict-envelope's per-state extent may now be a relation, and the
pre-existing consistency check makes the reservation genuinely
facts-derived once it is), tested end to end against a synthetic
fixture, but does not itself rewire `I_engine`'s declaration, because no
real facts entries exist yet for its connected/latency states (dispatch
A's probe harness only reached cold-boot, unauthenticated, backend-less
DOM). This remains open until dispatch C both measures those states and
rewires the declaration — named here explicitly, not left for a reader
to infer from a diff comment.

**Re-run gates after this fix**:

- `nice -n 19 /tmp/lyt_review_venv/bin/python3 -m pytest tests/test_relations.py -q -p no:warnings`
  — **WITNESSED, exit 0, 46 passed** (44 from the original delivery + 2
  new reachability tests).
- `nice -n 19 /tmp/lyt_review_venv/bin/python3 -m pytest tests/ -q -p no:warnings`
  — **WITNESSED, exit 0, 421 passed** (375 pre-existing + 46 — no
  regression).

No `.lyt` encoding file, `wellformed.py`, `compiler.py`, `presence.py`,
`runner.py`, or `emit_layout_tree.py` was touched by this follow-up fix
either — the change is confined to `relations.py`, `loader.py` (one
comment), `facts.residue.json` (additive fields), and
`tests/test_relations.py` (two new tests).
