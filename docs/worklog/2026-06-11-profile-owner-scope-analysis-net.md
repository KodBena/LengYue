# Worklog — store-write-needs-owner gains scope analysis; the profile aliased-write selectors are relocated (2026-06-11)

> Audit trail for work-status item `profile-owner-scope-analysis-net`,
> filed at the Wave-3 closure per PR #410's out-of-frame gate (triage
> row 3). The in-frame HRA on `settings-profile-mutator-owner` named
> the general fix and did not file it: put the machinery check inside
> `local/store-write-needs-owner` with real AST/scope walking, so
> intra-file aliases and renamed imports are SEEN rather than
> name-matched, replacing the two `PROFILE_ALIASED_WRITE_SELECTORS`.
> Branch `bork/discipline/profile-owner-scope-analysis`.
>
> **Honesty note (out-of-frame HRA finding, recorded up front).** The
> relocation is NOT a strict superset of the deleted selectors. The
> deleted `updateRegistry` descendant-combinator fired on `store.profile`
> at ANY argument position (including a non-arg-0 READ argument); the
> new `aliasedWrites` leg anchors at the write-target argument (arg 0),
> so that non-arg-0 READ case is dropped. A read is not a write, so the
> drop is out of this rule's scope (and removes an over-approximation the
> old selector's own rationale flagged as a cost) — but it is a deliberate
> NARROWING, named here and in the rule file, not a behaviour-preserving
> subsumption. The verbatim HRA artifact is the appendix.

## What the item is, and the measure-first posture

The two `no-restricted-syntax` selectors that fenced `store.profile`'s
generic-machinery writers (`PROFILE_ALIASED_WRITE_SELECTORS` —
`updateRegistry` over a profile root, the knob substrate over the live
store root) matched the callee and the root by NAME. PR #410's
out-of-frame gate named the residue: a renamed import (`import {
updateRegistry as ur }`) and an intermediate-variable root (`const r =
store.profile; updateRegistry(r, …)`) both slip past a name-matched
selector. The four-shape escape probe the gate specified:

1. **renamed import** — `import { updateRegistry as ur }; ur(store.profile, …)`
2. **intermediate-variable root** — `const p = store.profile; p.x = …`
   (and the alias passed to the machinery, `const r = store.profile;
   updateRegistry(r, …)`)
3. **depth-3 root** — `updateRegistry(store.profile.settings.engine, …)`
   — already closed by Row 1 of the gate-recommendations sweep (the
   descendant-combinator selector widening); re-verified here.
4. **renamed knob callee** — `import { writeKnobValue as wkv }; wkv(store, …)`

`mutateProfile` is a routing point with zero runtime enforcement; the
enforcement value lives in the lint + greppability. ADR-0011 Rule 4
(quantify over the class) says the net should resolve the alias class,
not enumerate selector shapes. Population at this change is recorded as
**zero** (`npx eslint .` clean, as the `settings-profile-mutator-owner`
reroute left it) — this item makes the partial fence durable rather
than waiting for the convention-breakdown bug (ADR-0001 Revisit #3
carries that trigger).

## The work (ADR-0011 Rules 3/4)

### Scope analysis in `local/store-write-needs-owner`

The rule already walked `store.<subtree>` member-chains syntactically
(`storePathOf`). It now does real scope/variable resolution
(`sourceCode.getScope` + `Scope.set` / `Variable.defs` /
`Variable.references`):

- **`resolveStoreRoot` / `resolveAliasedMemberWrite`** — a write or a
  machinery argument rooted at a plain identifier bound by a single
  `const`/`let` initializer to a `store.<...>` chain resolves ONE hop to
  that chain. `const p = store.profile; p.x = 1` is a `store.profile`
  write. Reassigned bindings (>1 write reference) and non-`Variable`
  defs (params, imports) bail — named gap: multi-hop re-alias and
  reassigned root escape.
- **`resolveImportedName`** — a callee identifier resolves to its
  binding; an `ImportSpecifier` yields the ORIGINAL exported name
  (`imported.name`), so `updateRegistry as ur` and `writeKnobValue as
  wkv` match the configured callee.
- **`aliasedWrites` config** — each subtree may name machinery callees
  by their original export name + the root-argument index, with a
  `bareStoreRoot` flag for the knob substrate (whose arg-0 is the live
  store ROOT, segments `[]`, not a `store.<subtree>` chain). The profile
  subtree carries the three entries (`updateRegistry`, `writeKnobValue`,
  `writeKnob`) that replace the two deleted selectors' write-target form.

The template path (`.vue`) runs the same `CallExpression` /
assignment visitors via `defineTemplateBodyVisitor`; a template-AST node
falls back to the module scope (`resolveScope` → `moduleScope`) so
`<script setup>` top-level imports/consts the template references still
resolve. Scope lookups are guarded (`scopeFor` try/catch) per ADR-0002
so a thrown lookup never crashes the lint.

### The narrowing (out-of-frame HRA finding, load-bearing)

The deleted `updateRegistry` selector was a descendant-combinator —
`CallExpression[callee.name='updateRegistry'] MemberExpression[…
profile]` — which fires on `store.profile` appearing ANYWHERE inside an
`updateRegistry` call: any argument, any depth, including a non-arg-0
READ argument like `updateRegistry(store.session.ui, store.profile.x,
v)`. The new `aliasedWrites` check inspects only `node.arguments[rootArg]`
with `rootArg: 0` — the write-target position. So the new rule is
STRICTLY NARROWER on the non-arg-0 occurrence: a profile value READ
passed to `updateRegistry` no longer fires. Probe-confirmed (a scratch
`updateRegistry(store.session.ui, store.profile.bookmarks, 1)` lints
clean under the new rule; the old selector flagged it). This is
deliberate — a read is not a write, so it is out of the writer-net's
scope, and the old selector's own rationale named the READ-argument
firing as a COST a legitimate read had to inline-disable around. But the
out-of-frame HRA correctly flagged that an earlier draft of this change
called it "subsumed / behaviour-preserving / provably covers," which
mis-described a narrowing as a superset. The prose is corrected
throughout (rule file, config, this worklog), the dropped case is a
named gap in the rule file, and a negative-control RuleTester case pins
that the non-arg-0 READ is intentionally not flagged.

### Replaced vs kept vs deleted

- **Deleted:** the `PROFILE_ALIASED_WRITE_SELECTORS` constant and both
  its `no-restricted-syntax` / `vue/no-restricted-syntax` usages. The
  constant's rationale comment is replaced by a dated relocation note
  (strike-don't-delete: the historical record of the selector form
  stands, and the narrowing is named there). The config header's "no
  aliased profile writes through generic machinery" bullet gains a dated
  RELOCATED paragraph that names the narrowing.
- **Kept:** every other selector in those two arrays
  (`ANY_ASSERTION_SELECTORS`, the G1 error-message-reparse guards) is
  untouched. The `updateRegistry(store.session.ui, …)` call in
  `SettingsTab.vue` is still admitted (session is not an enumerated
  subtree) — verified by `npx eslint .` staying clean.
- **Owner module:** `src/store/profile-owner.ts`'s two
  `eslint-disable-next-line no-restricted-syntax` directives are
  REMOVED — they went unused the moment the selectors were deleted
  (eslint reported them as unused directives). They are not needed at
  all now: the `store-write-needs-owner` rule recognizes the owner file
  via the profile subtree's `owners` list, the same mechanism that
  exempts `store/index.ts`'s direct writes. The module header's
  Enforcement note is updated to reflect the single-gate shape.

### boards/engine generalization — taken for the cheap leg, not the machinery

The intermediate-variable root resolution is structurally general — it
lives in `resolveStoreRoot` / `resolveAliasedMemberWrite`, not in a
profile branch — so `const e = store.engine; e.status = …` and the
boards analog are now caught for free (probe-verified to fire; the
real-tree `npx eslint .` stays clean, so the widening introduced zero
false positives). That generalization is **taken**. The `aliasedWrites`
machinery leg stays **profile-scoped**: boards/engine have no
`updateRegistry`/knob-substrate writers, so adding machinery callees
there would be enumeration without a population. Widening the machinery
config to boards/engine would be speculative, not cheap — not taken.

## Probes (ADR-0011 Rule 3 — probe-verify against the literal shape)

- **RuleTester** (`tests/unit/eslint-rules/store-write-needs-owner.test.ts`,
  23 cases): each of the four escape shapes is pinned RED outside the
  owner and PASS inside it, plus the combined renamed-import +
  intermediate-root case (the two hops the old name-matched selectors
  could not see together), the original syntactic detection (direct
  dotted write, owner exemption, computed-segment walk,
  compound-assign/delete), the non-firing controls (a fresh-object
  root, a non-store root, a same-named local, a session-rooted
  `updateRegistry`), AND the negative control for the disclosed
  narrowing (the non-arg-0 READ argument `updateRegistry(store.session.ui,
  store.profile.bookmarks, 1)` is intentionally NOT flagged — pinning the
  narrowing in the test tree).
- **Real-tree scratch probes** (created in `src/`, eslint-run,
  deleted): all five scope-analysis legs fire on the literal shapes —
  shape (a) renamed import, (b.1) direct intermediate-var write, (b.2)
  renamed import + intermediate root combined, (c) depth-3 root, (d)
  renamed knob callee. A `.vue` script-setup probe confirmed the
  template path fires without crashing. The boards/engine
  intermediate-var generalization probe fired for both subtrees. The
  out-of-frame HRA's regression probe (the non-arg-0 READ argument) was
  reproduced — it lints clean, confirming the narrowing. All scratch
  files removed before commit.
- **Population on the real tree:** `npx eslint .` exit 0, zero output —
  the recorded-zero population holds, so nothing breaks today either way;
  but the relocation is a deliberate narrowing on the non-arg-0 READ
  case, NOT behaviour-preserving (see the narrowing section above).

## Verification

- `npm ci` clean.
- `npm run build` (vue-tsc strict + vite) exit 0.
- `npx eslint .` exit 0 — all nine custom rules at `error` green
  (store-write-needs-owner now carries the machinery check; the two
  former selectors gone, the two owner inline disables gone).
- `npm run test:run`: 1040 passed / 4 skipped (the pre-existing skips);
  +23 new store-write-needs-owner RuleTester cases. (Corrected at gate
  discharge: this line predated the negative-control case the
  disposition note records; the out-of-frame gate ground-truthed
  1040/+23.)

## Documentation audit

- **Work-status store:** NOT touched this session (commission: do not
  touch the todo DB). Item closure is the coordinator's call on merge.
- **ADR-0001:** fifth dated amendment + a dated in-situ correction to
  the Revisit-#3 follow-on note (the two `no-restricted-syntax`
  selectors relocated into the rule's scope analysis; the single-hop
  intermediate-variable case mechanized; multi-hop / reassigned-binding
  residue remains review's). Decision unchanged; trigger stays live.
  `docs/adr-synopsis.md`'s ADR-0001 entry co-changed (the synopsis
  co-change advisory applies since the ADR changed).
- **eslint.config.js:** header bullet gains a dated RELOCATED paragraph
  (naming the narrowing); the deleted-constant rationale replaced by a
  relocation note; the store-write-needs-owner block comment gains a
  dated scope-analysis paragraph and the profile subtree gains
  `aliasedWrites`.
- **Rule file** (`eslint-rules/store-write-needs-owner.js`): a new
  "Scope analysis" header section narrates the legs, the relocation, the
  deliberate non-arg-0 narrowing, and the residual gaps (per ADR-0002,
  named not papered over).
- **FILES.md / IDENTIFIERS.md:** no edit — no `src/` file created,
  moved, deleted, or re-banded (`profile-owner.ts` edits are
  header/comment only; the new test lives in the test tree, outside
  FILES.md's `src/` scope, as the sibling rule tests do).
- **FEATURES.md:** no edit — a discipline-mechanization change with no
  user-facing surface.
- **handoff-current.md:** read end to end; no orientation surface it
  carries is affected.
- **Dispatch ledger:** no open dispatch addressed to the frontend bears
  on this item (directory listing checked).
- **Doc-graph:** this worklog is a new node — regenerated via
  `node tools/doc-graph/generate.mjs` in the same change; committed
  json+md.

## Deferral ledger (ADR-0005 Rule 10)

- **Non-arg-0 READ-argument occurrence of `store.profile` in an
  `updateRegistry` call** (`updateRegistry(store.session.ui,
  store.profile.x, v)`) — `not-filed:` deliberate narrowing, not a
  deferral of work. The deleted descendant-combinator selector fired on
  this; the `aliasedWrites` write-target anchoring drops it because a
  read passed as a non-target argument is not a write. Named at the rule
  site, in the config relocation note, and pinned by a negative-control
  RuleTester case so the narrowing is legible. Population zero at HEAD.
  Surfaced by the out-of-frame HRA (appendix); the trigger to re-broaden
  would be an `updateRegistry` overload that genuinely WRITES through a
  non-arg-0 root (none exists; arg 0 is always the write target).
- **Multi-hop re-alias and reassigned-root-binding writes** (`const a =
  store.profile; const b = a; b.x = …`; a root variable reassigned after
  init) — `not-filed:` extend-on-occurrence. The one-hop case is the
  measured alias shape (every escape the gate named is single-hop);
  esquery/scope walking could chase further hops but no such shape
  exists in src and chasing arbitrary hops risks over-approximation. The
  gap is named at the rule site per ADR-0002.
- **A renamed import of `store` itself** (`import { store as s }; s.profile.x
  = …`) — `not-filed:` the store is imported under its own name
  everywhere in src; the one-hop variable resolution does not chase a
  renamed store import. Named gap in the rule file.
- **`mutateProfile`/the owner verbs enforce no runtime invariant** —
  unchanged from `settings-profile-mutator-owner` (the routing-point
  finding); the enforcement value is the lint + greppability, and this
  item widens what the lint sees, not what the owner enforces at
  runtime. No new item: this is the boards/engine owner posture too
  (ADR-0001's named residue), now with a tighter lint around it.

## Appendix — out-of-frame hack-rationalization-detector run (verbatim, per ADR-0005 Rule 11)

This change touches the `store.profile` enforcement slot (>1 writer) and
deletes a lint shape while claiming a replacement covers it — exactly the
condition the hack-rationalization-detector exists to distrust. The run
was delegated OUT OF FRAME to a subagent that did not produce the change
and did not see the implementer's reasoning. Its load-bearing finding —
the silent non-arg-0 narrowing — was real, reproduced independently, and
is the reason the "subsumed / behaviour-preserving" prose was corrected
to "relocated / deliberately narrower" throughout this change before
commit. Commission and full report recorded verbatim.

### Commission (the suspicion targets)

> Run the hack-rationalization-detector OUT OF FRAME. Treat the
> implementer's justification as the OBJECT OF SUSPICION. The change
> extends `store-write-needs-owner` with scope analysis and DELETES the
> two `PROFILE_ALIASED_WRITE_SELECTORS`, claiming the rule subsumes them.
> Pay attention to: (1) is the scope leg a real generalization or N
> hard-coded shapes; (2) is the subsumption sound — does the new rule
> catch EVERYTHING the deleted selectors caught, or is there a silent
> coverage REGRESSION (the deleted updateRegistry selector was a
> descendant-combinator firing on store.profile at ANY argument; the new
> rule only checks rootArg 0 — is that an undisclosed narrowing?); (3)
> WRITER DELTA — enumerate store.profile / updateRegistry / writeKnobValue
> writers independently; (4) the boards/engine "free generalization"
> claim; (5) run the gates; (6) probe for the silent gap
> (`updateRegistry(someRoot, store.profile.x, v)` — old selector fired,
> does the new rule? Disclosed or silently dropped?). Final message = the
> verbatim artifact.

### Report (the full artifact; the verdict label does not travel without it)

```
## Hack-rationalization review: `profile-owner-scope-analysis-net`

FRAME CHECK: Out-of-frame. I did not produce this change and did not see the
implementer's reasoning before reviewing; I treated the worklog and the in-diff
comments as the object of suspicion. Frame is valid — proceeding.

GENERAL FIX:   *An aliased subtree write is caught wherever the subtree root
appears in a write-reaching position — through any alias hop and at any argument
position the machinery can land a write on — not only at a configured arg-0.*
PATCH SHIPPED: Real scope analysis was added (one-hop intermediate-variable root
resolution + renamed-import callee resolution), genuinely generalizing the
intermediate-var leg across all subtrees; the two PROFILE_ALIASED_WRITE_SELECTORS
were deleted and the machinery check moved into the rule's `aliasedWrites` config,
keyed to a single `rootArg` index (0). Two now-unused `eslint-disable` directives
were removed from the owner module.
DOWNGRADE:     No discipline-word was used; the narrowing was made *silently*. The
deleted `updateRegistry` selector was a descendant-combinator that fired on
`store.profile` appearing as ANY member-expression descendant of an
`updateRegistry` call (any argument, any depth). The new `checkCall` inspects only
`node.arguments[aw.rootArg]` with `rootArg: 0`. The change DELETED the very comment
paragraph (old eslint.config.js lines 608–611) that documented the broader behavior
("it also fires when `store.profile` appears as a non-target READ argument …
broader than the arguments.0-anchored selectors") and did not carry that loss
forward as a named gap. The subsumption is asserted as "behaviour-preserving at
HEAD" (worklog line 130) and "provably covers their name-matched cases" — true only
because population is zero at HEAD, not because the new rule is a superset of the
old selector. It is strictly narrower.
WRITER DELTA:  Claimed: population zero; updateRegistry-over-profile writers =
{owner only}; the three `aliasedWrites` entries subsume the two selectors.
Enumerated (independently): `updateRegistry` call sites in src = `SettingsTab.vue:80`
(session root — correctly admitted) and `profile-owner.ts:110` (owner — exempt);
`writeKnobValue` call site = `profile-owner.ts:133` only (owner — exempt); `writeKnob`
only internal to `knobs.ts` on a generic `root`. So the *present* population is
genuinely zero and the present writers are all handled — the WRITER DELTA on today's
tree is **empty (claim holds)**. The delta is not in the writer set; it is in the
**catch set**: the rule no longer catches a write-class the deleted selector caught
(non-arg-0 `store.profile` inside an `updateRegistry` call).
RUNTIME:       Reproduced + verified. `npx eslint .` exit 0; RuleTester 22/22 pass;
control probe `updateRegistry(store.profile, …)` fires `aliasedWrite` (exit 1);
engine intermediate-var probe `const e = store.engine; e.status=…` fires
(generalization real). The regression probe `updateRegistry(store.session.ui, ['k'],
store.profile.settings.locale)` and `updateRegistry(store.session.ui,
store.profile.bookmarks, v)` **lint clean (exit 0)** — the old descendant-combinator
selector would have flagged both. Probes written under `frontend/src/`, run, and
deleted.

TELLS (Step 1): `grep_tells.py` on worklog and diff: **0 co-occurrence tells**
(worklog: 1 minimality-term / 27 named-fix cues; diff: 0 / 97). The downgrade was
made without minimality narration — the Step-1-clean / Step-2-dirty pattern the
skill warns of ("a clean implementer simply stopped narrating the downgrade"). The
narrowing is invisible to the prose scanner and visible only in the AST-semantics
comparison.

VERDICT: UNDISCHARGED-HACK
WHY: The change is marketed as a subsumption that "provably covers" the deleted
selectors and is "behaviour-preserving," but the new `rootArg: 0` check is strictly
narrower than the deleted `updateRegistry` descendant-combinator, which fired on
`store.profile` at any argument/any depth. The implementer demonstrably knew this —
they deleted the comment that documented the broader behavior — yet the loss is
disclosed nowhere (not in the SUBSUMED note, not in the rule-file gap list, not in
the worklog's deferral ledger). A claimed superset that is actually a subset, with
the dropped coverage undocumented, is the silent-coverage-regression shape this pass
exists to surface.

FINDINGS BEYOND VERDICT (required; "no residual findings" if truly none):
  - **The coverage loss is exact and reproducible**: `updateRegistry(<anyRoot>, …,
    store.profile.x, …)` where `store.profile` is a non-arg-0 argument lints clean
    under the new rule but was flagged by the deleted selector. Confirmed by probe.
    This is the load-bearing finding.
  - **Severity is bounded but the framing is wrong, not the coverage gap per se.**
    Population is zero at HEAD, so nothing breaks today, and an *honest* version of
    this change would be `narrower-but-justified`: the old selector's READ-argument
    firing was itself an over-approximation the implementer could legitimately choose
    to drop (a future *legitimate* profile READ passed to `updateRegistry` would no
    longer need an inline disable). The defect is that this was presented as
    "provably covers" / "behaviour-preserving" / "subsumed" rather than "narrowed,
    here is what we stop catching and why that is acceptable." The fix is documentary,
    not necessarily code: name the dropped non-arg-0 READ-argument case in the
    rule-file gap list and the deferral ledger, and downgrade "behaviour-preserving" /
    "provably covers their cases" to "behaviour-preserving on the zero-population tree;
    intentionally narrower than the descendant-combinator on non-arg-0 occurrences."
  - **The RuleTester suite cannot catch this regression and gives false subsumption
    confidence.** Its shape-(c) depth-3 case (`updateRegistry(store.profile.settings.engine,
    …)`) keeps `store.profile` at arg-0, so every invalid case still anchors at arg-0.
    There is no test for `store.profile` at a non-arg-0 position — exactly the dropped
    case. The suite *does* exercise both directions (invalid cases demand specific
    `messageId`s; a no-op rule fails them), so it is not vacuous — but it pins only the
    arg-0 catch-set, which is why it passes green over a real coverage narrowing. A
    negative-control test asserting the non-arg-0 case is *intentionally* not caught
    would make the narrowing legible in the test tree.
  - **`required: ['path','owners']` on the schema is a small unrelated tightening**
    folded into this diff (the old schema had no `required`). Benign and arguably an
    improvement, but it is an undisclosed behavioral change to the rule's
    option-validation surface riding along in a "subsumption" PR.
  - **The intermediate-variable generalization (suspicion target #4) is genuine, not
    profile-special-cased** — verified firing on `store.engine` via an aliased local.
    The `aliasedWrites` machinery leg staying profile-scoped is honestly disclosed (no
    boards/engine machinery population) and is a justified narrowing. These two legs
    are *not* the hack; the hack is localized to the `updateRegistry`
    descendant-combinator → arg-0 narrowing and its mis-description as a subsumption.
```

(End of verbatim artifact.)

### Disposition (appended by the implementer, per the skill's append-only relay rule — the artifact above is not edited)

All findings accepted; none deferred:

1. **The load-bearing finding (silent non-arg-0 narrowing) is fixed** —
   the prose is corrected throughout (rule file header, config relocation
   note + header bullet + block comment, this worklog's title / summary /
   narrowing section / verification / deferral ledger) from
   "subsumed / behaviour-preserving / provably covers" to "relocated /
   deliberately narrower, here is the dropped case and why it is
   acceptable." The dropped non-arg-0 READ case is a named gap in the
   rule file and a `not-filed:` entry in the deferral ledger above.
2. **The negative-control RuleTester case is added** (the non-arg-0 READ
   `updateRegistry(store.session.ui, store.profile.bookmarks, 1)` is
   asserted valid), so the narrowing is legible in the test tree — a
   future re-broadening to all args fails there.
3. **The `required: ['path','owners']` schema tightening is disclosed**
   here as a deliberate ride-along: the old schema omitted `required`, so
   a malformed config entry (missing `owners`) would have been silently
   accepted; adding `required` is an ADR-0002 fail-loud improvement to the
   rule's own option validation, kept because it is correct, named so it
   is not a silent surface change.
4. The verdict's RuleTester count (22) reflects the tree the auditor saw;
   the negative control added in response makes it 23.

License: Public Domain (The Unlicense).
