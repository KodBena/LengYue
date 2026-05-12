# Tag-DSL Macro Language — Design Note

**Status:** `design-note: planned`. No implementation work has
started. Promoted on 2026-05-12 from `docs/TODO.md`'s "Future
projects" section, where the gap had been captured but the
analysis had outgrown the TODO format. This document is the
canonical handle for the work; the TODO entry now redirects
here.

**Genre:** Backend design note — pure-domain refactor of
`backend/domain/tag_dsl.py`, with implications for the deck
pipeline DSL surfaces in `CardSetEditor.vue` and the user-facing
authoring grammar.

**Date:** 2026-05-12.

---

## Motivation — what the user can't currently express

The tag DSL (`backend/domain/tag_dsl.py`) is less expressive than
its surface grammar suggests. Two specific gaps surface during
realistic taxonomy work:

### Gap 1 — Negation is forbidden inside virtual-tag definitions

`_parse_definition` (lines 73-77 of `tag_dsl.py`) raises
`PipelineDSLError` on any term beginning with `~`. So a
definition like:

```
$attack :- $tactic;~$blocked
```

(intent: "everything in tactic except blocked") is unrepresentable.
The user has to inline the `~$blocked` exclusion at every query
site that uses `$attack`. As the taxonomy grows, this inversion
of definition and use creates a class of subtle drift bugs —
adding a new excluded tag requires sweeping every query, not
updating one definition.

### Gap 2 — Recursion is set-flat, not structural

When a definition references another (`$x :- $y;tag1`), the body
of `$y` is eagerly merged into a flat `Set[str]` of concrete tag
names (line 85: `expanded_tags.update(self.definitions[ref_name])`).
Once flattened, the structural information that negation would
need — intersections, unions of unions, exclusions — is gone.
Composition is **monotone-additive only**: a definition can
only ever broaden, never narrow.

The two gaps compose: even if negation in definitions were
allowed at the parse level, the flat-set storage would lose the
information immediately. The fix is a single refactor that
addresses both.

### Why this matters for Go study

The tag DSL is the user's primary tool for slicing the SR
forest into focused decks. As a user's library grows past a few
hundred cards, the taxonomies they build mirror their study
focus: `$opening`, `$middlegame`, `$tactical`, `$shape`,
`$endgame`, `$life-and-death`, `$invasion`, `$reduction`, etc.
These categories overlap and shadow each other in ways that
real taxonomies always do — "attack patterns that aren't
already in my blocked-list," "shape problems excluding ones
I've classified as memorisation traps." Without negation in
definitions, every such combination becomes a long
ad-hoc expression at the query site. The mental overhead
crosses the boundary where the user stops trusting their own
deck definitions.

---

## Current implementation — a precise walk

The compiler at `backend/domain/tag_dsl.py` (147 lines) has the
following flow inside `compile_to_subquery(expression)`:

1. **`_split_statements`** — splits the input on `.` (period).
   Each non-final statement is a virtual-tag definition; the
   final statement is the query.

2. **`_parse_definition(defn)`** — matches
   `$name :- t1;t2;$ref;...` via regex, splits the RHS on
   `[;\n]+`, raises on any term beginning with `~`, dereferences
   any `$ref` by flat-merging the referenced definition's
   concrete set. Stores the result as
   `self.definitions[name]: Set[str]`.

3. **`_parse_query(query)`** — splits on `[;\n]+` (OR), each
   part splits on `,` (AND), and classifies each term as
   positive or negative by `~` prefix. Returns DNF as
   `List[Dict[str, Set[str]]]` with keys `pos` and `neg`.

4. **`_expand_conjunction(conj)`** — for each conjunction:
   - Distributes positive virtuals **multiplicatively**: if N
     positive virtuals each expand to K concrete tags, the
     output is K^N conjunctions, each requiring an independent
     SQL subquery.
   - Negative virtuals are flat-merged into a single negative
     set (no distribution).
   - Returns expanded conjunctions of concrete tags only.

5. **`_conjunction_to_sql(conj)`** — emits a single SQL
   subquery: a `card_tag JOIN tag` filtered on the positive set
   with `GROUP BY card_id HAVING COUNT(*) = len(pos)`, then
   `EXCEPT` the analogous query over the negative set.

6. **Final `UNION`** — all conjunction subqueries `UNION`'d
   together.

The result is a SQLAlchemy `Select` consumable by the pipeline
executor. Forward-declaration of references prevents cycles for
free.

### What the current design gets right

- The DNF normal form on the query side is structurally clean.
- The separation between virtual-tag dereference and SQL
  emission is honest.
- Forward-declaration is a cheap and effective cycle preventer.
- Concrete tag sets cache cleanly inside `self.definitions`.

### What the structural gaps cost

- Definitions can only express positive disjunctions.
- The dereference is eager, so once a definition is stored,
  the original grammar is lost.
- Negation appearing later in the query has nothing to compose
  with on the definition side.

---

## The proposed shape — macro language as a preprocessor

Treat virtual tags as a **macro language** layered above the tag
DSL, not as a flat alias system. The grammar a definition admits
matches the grammar of the query language:

- Positive terms (concrete or virtual).
- Negative terms (concrete or virtual), prefixed with `~`.
- Disjunctions via `;`.
- Conjunctions via `,`.
- Parentheses (new — admit grouping if useful, see Open
  questions).

A macro definition stores its **parsed grammar tree**, not its
flat concrete-tag set. Reference expansion is **substitutive,
not flattening** — when `$attack` appears in a query, the macro
expander substitutes `$attack`'s full grammar tree at that site,
then recursively expands any `$ref`s in the substituted tree.

### Worked example — what becomes representable

Current grammar (today, both work):

```
$tactic :- attack;defense;invasion.    # definition
$tactic, shape                          # query: tactic AND shape
```

After the change (new):

```
$attack :- $tactic;~$blocked.          # negation in definition
$attack, shape                          # query: ($tactic;~$blocked), shape
```

The macro expander rewrites `$attack` at the query site,
producing the effective query:

```
($tactic;~$blocked), shape
```

Which then expands `$tactic`:

```
(attack;defense;invasion;~$blocked), shape
```

Which then expands `$blocked` (a flat-set definition, no
negation inside):

```
(attack;defense;invasion;~memorisation_trap;~stale), shape
```

The DNF normalisation runs on the fully-expanded grammar and
emits SQL as today.

### Why this composes with the existing query parser

The query side already handles negation, disjunction, and
conjunction. The macro pass is purely a rewrite step before the
existing `_parse_query` / `_expand_conjunction` / SQL-emission
pipeline. **No SQL changes; only the parse-and-substitute pass
is new.**

---

## DoS surface — the load-bearing analysis

Macro expansion has real combinatorial explosion potential, and
naming the failure modes precisely is the load-bearing piece of
the design work. The mitigations below are mechanical, not
research-grade.

### Query-time DNF blow-up exists today at small scale

`_expand_conjunction` already distributes positive virtuals
multiplicatively: `$a, $b, $c` with each containing K concrete
tags produces K³ conjunctions and K³ subqueries `UNION`'d
together. Today this is bounded because virtual-tag definitions
are flat sets and the user picks the K size at write time.

### With negation in definitions, the disjunct count goes exponential

A chain of N virtuals, each expanding to K disjuncts (now
possible because definitions can carry full grammar), gives
K^N final conjunctions before SQL emission. The macro language
inherits the structural depth that the flat-set design avoids.

Concretely: if each of `$a`, `$b`, `$c` is defined as
`x;y;z;~p;~q` (5 disjuncts: 3 positive, 2 negative folded into
neg-set), and the user writes `$a, $b, $c`, the multiplicative
distribution produces 3³ = 27 positive-conjunction shapes, each
with a 6-element merged negative set (2 per virtual × 3 = 6).
Each of the 27 emits a SQL subquery; 27 subqueries `UNION`'d is
expensive but not catastrophic. Push to `$a, $b, $c, $d, $e` with
the same per-virtual disjunct shape and the count is 3⁵ = 243
subqueries.

### Cycle detection is already free, but worth re-stating

Definitions require forward declaration (lines 80-85 of
`tag_dsl.py` raise if `$ref` isn't yet defined), so cycles
can't form via in-band references. **The macro language
inherits this property** as long as the same forward-
declaration discipline is preserved. Pathological recursion
needs intentional fan-out, not cycles.

---

## Mitigations — three caps plus SQL sharing

None of these are research-grade; all are mechanical. The
implementation should ship with all four enabled by default.

### Cap 1 — Total expansion size

Refuse a query whose macro expansion produces more than `M`
conjunctions. Start at M = 1024 and tighten if real workloads
stay well below. The cap fires after macro expansion but before
SQL emission; the failure is a `PipelineDSLError` naming the
expansion count and the offending virtual.

### Cap 2 — Definition body length

Refuse a single definition whose expansion (substituted
through all references) yields more than `K` concrete leaves.
Start at K = 256. Caught at definition-parse time, not query
time — so the user sees the error when they author the bad
definition, not when they execute a query against it.

### Cap 3 — Recursion depth

Refuse a definition graph deeper than `D`. D = 8 covers any
realistic study taxonomy. Caught at expansion time when a `$ref`
chain exceeds the cap.

### Mitigation 4 — Share SQL across disjuncts

The current emission `UNION`s K^N separate subqueries against
`card_tag`. A CTE that materialises the shared tag-membership
set once would let the disjuncts re-reference rather than
re-query — reduces the SQL plan cost even at small K.

This composes with item 30c/30d's CTE-consolidation work
(`docs/TODO.md`). If 30c/30d lands first, this mitigation
benefits from the existing helper; if this lands first, the
helper can be extracted at 30c/30d time. Either order works.

---

## Migration and compatibility

### Existing definitions still parse

Every definition that compiles today is a valid definition under
the new grammar. The flat-set storage path becomes a degenerate
case of the macro-tree storage: a definition with no negation
and no nested virtuals stores a tree with a single
positive-disjunction node, which expands trivially.

### No wire-shape change

The tag DSL is backend-internal. The frontend sends pipeline JSON
that includes tag-expression strings; the backend's
`TagDSLCompiler` parses them. **The wire is unchanged.** The
frontend's CardSetEditor doesn't need to know about the macro
language at the type level — it just sends the string, the
backend either accepts or rejects with a structured error.

### CardSetEditor's lint surface

The CardSetEditor's tag-DSL editing surface (per
`docs/archive/notes/dsl-hyperparameter-harness-plan.md`'s
authoring conventions) currently lints definitions via the
backend's compile pass. Negation-in-definitions will newly
parse; the editor's error display will surface
`PipelineDSLError` for cap violations the same way it surfaces
malformed-grammar errors today. **No new frontend surface is
required.** A future iteration could add client-side preview
of macro expansion ("show me what `$attack, shape` expands
to"), but that's optional polish, not a prerequisite.

### Persistence

Virtual-tag definitions today live inside the pipeline DSL of
each `CardSet`. They are query-local — every pipeline execution
constructs a new `TagDSLCompiler` instance and parses its
definitions fresh. **This is preserved.** A future "tag-DSL
definition catalogue per user" is a separate arc (see Open
questions); the macro-language refactor does not depend on it.

---

## Implementation plan

### Module shape

The macro expander lives in **a new file** — keeping the parser,
expander, and SQL emitter separately named makes the boundary
clear:

```
backend/domain/tag_dsl.py            # existing compiler — public surface stays
backend/domain/tag_dsl_grammar.py    # NEW: grammar AST, parser, macro expander
backend/domain/tag_dsl_sql.py        # NEW: SQL emission (extracted from current
                                     # _conjunction_to_sql) — sets up the surface
                                     # for mitigation #4 (shared CTE) later
```

`tag_dsl.py` becomes a thin facade: parse statements via the new
grammar module, expand macros, normalise to DNF, emit SQL via
the new SQL module. The public `compile_to_subquery` signature
is unchanged.

**Architectural placement.** Per `backend/CLAUDE.md`, the domain
layer is pure Python with no SQLAlchemy. The current `tag_dsl.py`
already imports SQLAlchemy (per `docs/notes/reflection.md`'s
"`domain/tag_dsl.py` is structurally an adapter" entry, this is
a known mis-filing). This refactor is an opportunity to address
the misfiling: `tag_dsl_grammar.py` is pure domain; only
`tag_dsl_sql.py` imports SQLAlchemy and could live in
`repositories/`. Splitting the file along the import boundary
makes the long-deferred move cheap. **Recommendation:** do the
split, file `tag_dsl_grammar.py` in `domain/`, file
`tag_dsl_sql.py` in `repositories/`, and let `tag_dsl.py`'s
facade either follow to `repositories/` (cleanest) or stay in
`domain/` re-exporting the pure parts for backwards-compat
during transition.

### Grammar AST

A small discriminated-union shape for the macro tree:

```python
@dataclass(frozen=True)
class Concrete:
    name: str

@dataclass(frozen=True)
class Virtual:
    name: str

@dataclass(frozen=True)
class Neg:
    term: 'Term'  # Concrete | Virtual

Atom = Union[Concrete, Virtual, Neg]

@dataclass(frozen=True)
class Conj:
    atoms: tuple[Atom, ...]  # comma-separated

@dataclass(frozen=True)
class Disj:
    conjs: tuple[Conj, ...]  # semicolon-separated
```

A definition stores a `Disj`. The macro expander walks a `Disj`,
substitutes any `Virtual` references with their stored `Disj`,
and emits a fully-expanded `Disj` containing only `Concrete` and
`Neg(Concrete)` atoms. The existing DNF emission consumes this
shape unchanged.

### Test strategy

Per `backend/CLAUDE.md`'s testing tiers, this refactor splits
across:

**Tier 1 — pure unit (`tests/unit/`).** The grammar parser and
macro expander are pure functions over plain inputs. Coverage
target: every grammar production, every cap (size / body / depth),
every error path. The current `tag_dsl.py` test file in
`tests/unit/` is the parallel-evolution target.

**Tier 2 — adapter integration (`tests/integration/`).** The SQL
emission's contract is "given an expanded DNF, produce a
SQLAlchemy `Select` whose result rows match the expected tag
membership semantics." Existing integration tests against
`TagFilterRepository` exercise this; the refactor shouldn't
regress them. Add tests for the new expressions (negation in
definitions, deep references) to confirm the wider grammar
produces correct SQL.

**Failure-mode-first per the testing-arc discipline.** Tests for
cap-violations (M / K / D exceeded) go in before the happy-path
expansion tests, because cap violations are exactly the failure
class the user doesn't routinely exercise.

### Definition-of-done

- New `tag_dsl_grammar.py` with the AST, parser, and macro
  expander. Pure Python.
- New `tag_dsl_sql.py` with the SQL emission, extracted from
  current `tag_dsl.py`. Imports SQLAlchemy.
- `tag_dsl.py` facade preserves the existing public surface
  (`TagDSLCompiler.compile_to_subquery`).
- Tier 1 tests cover grammar parsing, macro expansion, all
  three caps, recursion depth, and the "definition that uses a
  virtual that hasn't been declared yet" failure path.
- Tier 2 integration tests verify SQL semantics for
  negation-in-definition and deep-reference cases.
- The `reflection.md` rough-edge ("`tag_dsl.py` is structurally
  an adapter") either closes (file split to `repositories/`)
  or gets an updated entry naming the partial-progress shape.
- `docs/TODO.md` entry replaced with a one-line pointer at this
  note.

---

## Open questions

1. **Parentheses in the grammar.** The current grammar uses
   precedence (`,` binds tighter than `;`) implicitly. Should
   the new grammar admit parentheses for explicit grouping
   (`($a,$b);$c`)? Pro: necessary for non-trivial macro
   composition. Con: adds parser complexity. Recommendation:
   yes, admit; the parser cost is small and the expressiveness
   gain is real.

2. **Per-user definition catalogue.** Today every pipeline
   carries its own definitions. A future "user-scoped virtual-
   tag catalogue" would let definitions outlive a single deck
   pipeline. **Out of scope for this arc** — the macro refactor
   is purely structural; the catalogue question is a separate
   tenancy + storage decision.

3. **Macro expansion preview surface.** Should the backend
   expose an endpoint like `POST /tag-dsl/expand` that takes
   an expression and returns its fully-expanded form, for
   client-side preview in the CardSetEditor? **Out of scope
   for this arc** — the editor's existing compile-pass error
   surface handles the immediate need; preview is a polish
   feature that can land later.

4. **Cap defaults.** M = 1024, K = 256, D = 8 are starting
   points. The first user-encountered cap failure should
   inform tightening or relaxing. Should the caps be
   user-configurable via environment variables, or hard-coded?
   Recommendation: hard-coded initially, surface as registry
   knobs only if a real workload demands it.

5. **Backwards-compat error messages.** The current
   `_parse_definition` error "Negation not allowed in virtual
   tag definitions" disappears in the new world. Should that
   message-string compatibility matter? Recommendation: no —
   it's a `PipelineDSLError`, callers catch the type, and the
   message text is not part of the wire contract.

6. **`reflection.md` rough-edge resolution.** The note's entry
   on `tag_dsl.py` being structurally an adapter has been
   carried for a long time. Closing it as part of this arc
   would be honest; deferring would leave the entry in place.
   Recommendation: close it; the file-split is a natural
   side-effect of the refactor and there's no benefit to
   carrying the rough-edge note any longer.

---

## Trigger

Picked up when:

- A real taxonomy push surfaces the expressiveness gap
  (someone authoring a deck DSL hits the negation-in-definition
  wall and asks for it).
- A focused investigation session is available for the DoS
  analysis + cap calibration.
- The user is ready to commit to the macro-language refactor
  as a defined arc.

Not blocking any current arc — the existing flat-set virtual
tags are sufficient for the user-facing tag use cases the
project ships today. The promotion of this entry from TODO to
design note (2026-05-12) signals that the work is ready to be
scheduled, not that it must be scheduled immediately.

---

## Maintenance contract

`design-note: planned`. When implementation lands, this document
transitions to `design-note: implemented` per the doc-graph
genre lifecycle: a status line at the top names the closing PR
and worklog, and the body becomes historical record (the
worklog carries the "what actually shipped" detail). At that
point the doc joins the others in `docs/archive/notes/`.

If implementation reveals the design is wrong in some
load-bearing way, that's a worth-publishing rethink — file a
sibling `design-note: revised` rather than silently editing
this one.

---

## Cross-references

- **`backend/domain/tag_dsl.py`** — the file this refactor
  targets.
- **`docs/notes/reflection.md`** — "`domain/tag_dsl.py` is
  structurally an adapter" rough-edge entry that this refactor
  is well-positioned to close.
- **`docs/TODO.md`** items 30c / 30d — CTE consolidation work
  adjacent to mitigation #4 (shared SQL across disjuncts).
- **`docs/adr/0002-fail-loudly.md`** — the cap-violation error
  surfaces follow ADR-0002 (raise loudly with the offending
  count and the named virtual).
- **`docs/adr/0003-frontend-portability-and-domain-boundaries.md`**
  — the file-split (`tag_dsl_grammar.py` to `domain/`,
  `tag_dsl_sql.py` to `repositories/`) implements the
  Dependency Rule the rough-edge entry names.
- **`docs/archive/notes/dsl-hyperparameter-harness-plan.md`** —
  precedent for a tag-DSL-adjacent authoring discipline; the
  macro language refactor leaves the harness's hyperparameter
  semantics unchanged but expands what a `select` stage's
  tag-DSL can express.
- **`backend/CLAUDE.md`** — the Clean/Hexagonal layering this
  refactor honours by splitting the SQL emission out of
  `domain/`.
