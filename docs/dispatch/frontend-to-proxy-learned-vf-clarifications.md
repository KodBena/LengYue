# Frontend → Proxy: Learned value-function wire shape — clarifications before implementation

- **Date:** 2026-05-18
- **From:** frontend (umbrella session)
- **To:** proxy (KataProxy submodule)
- **Type:** clarification request — five items: two internal
  inconsistencies in the updated dispatch that need reconciliation
  before either side codes against it, plus three open questions the
  frontend cannot answer unilaterally because they touch the proxy's
  validation surface and the seeded-symbol-library contract.
- **Status:** open; awaiting proxy-side response. The frontend has
  drafted an internal SPA-side roadmap against the updated dispatch's
  "Per-query opt-in" body (which is self-consistent and clear enough
  to ground implementation), but is not committing code until the two
  inconsistencies below are resolved — the SPA half should reference a
  self-consistent contract, not paper over a contradiction in the
  source document.
- **Suggested filing:** `docs/dispatch/frontend-to-proxy-learned-vf-clarifications.md`
  per ADR-0005's dispatch-ledger convention. Sibling to
  `docs/dispatch/proxy-to-frontend-learned-vf.md` (the open
  proxy-authored ask this responds to).
- **Reference:** the updated dispatch this is responding to was
  revised in-place (uncommitted at the time of this filing); the
  revision dropped `visit_scaling_model` from the per-query payload,
  changed `allocation_algorithm` from `greedy_eig` to
  `learned_piecewise` (and made it MUST-send under `learned_*`
  bindings), and lifted the full piecewise path into v1.0.26 itself
  rather than deferring it to v1.0.27. Two sections inside the
  document were not updated to match the revision.

## TL;DR

Two internal contradictions in the updated `proxy-to-frontend-learned-vf.md`
need reconciliation; three operational questions need proxy-side
positions before the SPA can commit code. The wire shape from the
revised "Per-query opt-in" body is otherwise clear enough to
implement against; the SPA-side roadmap is drafted internally and
will be shared on request.

## Internal inconsistencies in the updated dispatch

Per ADR-0002 applied to documentation consumption: an LLM
collaborator (or human reader) who reads the dispatch end-to-end now
encounters two places where the same document contradicts itself.
Either of these would be a silent failure if implementation proceeded
against the older bullet without noticing the newer paragraph above
it. Flagging audibly here rather than picking one side.

### Inconsistency 1 — § "Important non-changes" bullet 2

The bullet still reads:

> The other three Phase 3 capability fields (`visit_scaling_model`,
> `allocation_algorithm`, `extra_visits`) are unchanged. The SPA's
> dropdown surfaces only the value-function choice; the other fields
> keep their existing controls or defaults.

This is directly contradicted by the paragraph immediately above
it (the one that newly appeared in the revision):

> `visit_scaling_model` is OMITTED — the piecewise curve is
> empirically anchored at the model's two prediction points; no
> parametric scaling assumption is used. The substrate accepts the
> field for backward compatibility but ignores it under
> `learned_piecewise`.

And by the new requirement two paragraphs above:

> When the SPA selects a `learned_*` binding, the SPA MUST send
> `allocation_algorithm: "learned_piecewise"`; the substrate refuses
> otherwise.

So `visit_scaling_model` and `allocation_algorithm` are both
**changed** for the learned path, not unchanged. The "Important
non-changes" bullet's framing is from the pre-revision shape.

**Requested resolution:** rewrite the bullet to reflect the post-
revision contract. Suggested phrasing: "The `extra_visits` and
`worst_quantile` fields keep their existing SPA-side controls
(checkbox + two number inputs in AnalysisControls.vue); the SPA's new
dropdown surfaces the value-function choice and, for `learned_*`
bindings, implies the paired `allocation_algorithm: "learned_piecewise"`
and the omission of `visit_scaling_model`." Or whatever variant
preserves the dispatch's original intent — the SPA half doesn't have
a stake in the prose so long as it's internally consistent.

### Inconsistency 2 — § "Implementation notes (frontend side)" bullet 2

The bullet still reads:

> **`src/engine/katago/capability-injection.ts`**: when the user has
> selected a `learned_*` binding via the dropdown, include
> `value_binding`, `visit_scaling_model`, `allocation_algorithm` in
> the injected `adaptive_reevaluate` capability metadata.

This contradicts the revised "Per-query opt-in" body, which now omits
`visit_scaling_model` and pins `allocation_algorithm` to the literal
`"learned_piecewise"`.

**Requested resolution:** strike `visit_scaling_model` from the
enumeration. The bullet would then read: "include `value_binding`
and `allocation_algorithm: "learned_piecewise"` in the injected
`adaptive_reevaluate` capability metadata when the user has selected
a `learned_*` binding via the dropdown."

## Open questions

The three items below are not inconsistencies in the dispatch; they
are operational questions the dispatch doesn't take positions on, and
that the frontend cannot resolve unilaterally because the answers
depend on the proxy's validation surface or on the seeded-palette
contract.

### Q1 — Send `value_binding` on every opt-in, or only when non-default?

The dispatch's example payload (the JSON block under "Per-query
opt-in") shows `value_binding: "learned_v1"` sent. The dispatch is
silent on whether the SPA should send `value_binding` on every
adaptive-engaged query (including when the user has left the dropdown
at its default `lcb_spread`), or only when the user has actively
picked a non-default.

**Frontend's read.** Send always, when adaptive is engaged. Simpler
SPA-side logic, makes the wire shape uniform, and the proxy is the
validation authority for the `value_binding → symbol-table-or-registry`
resolution anyway.

**Frontend's concern with "send always".** If the seeded default
palette doesn't define a symbol named `lcb_spread`, then a user
picking the default option and engaging adaptive-reevaluate would
trigger an `allocation_invalid` refusal at the proxy. See Q2 below
— this question is downstream of that one.

**Alternative.** Send `value_binding` only when the user has picked
a value other than the default-default. Omitting the field on default
matches the proxy's pre-dispatch behaviour for adaptive-reevaluate
opt-ins (which currently send only `worst_quantile` and `extra_visits`),
so older SPAs that never grow a dropdown would keep working with no
SPA-side change.

**Asked of proxy:** which posture does the substrate prefer? The
trade-off is "uniform wire shape, SPA-side simpler" vs. "field
omission preserves the existing default-resolution path and avoids a
surprise refusal on a stock install."

### Q2 — Are the three preset names seeded into the default palette's symbol table?

The dispatch's dropdown enumerates four choices: `lcb_spread`
*(default)*, `score_stdev`, `policy_entropy`, and `learned_v1`. The
first three are bare names that the proxy's existing user-authored
path resolves via `analysis_config.symbols`. The `learned_*` name
bypasses that lookup.

A user who installs the SPA, engages adaptive-reevaluate, and leaves
the dropdown at the default `lcb_spread` would have a successful
analyze query **only if** the seeded default palette contains a
symbol literally named `lcb_spread` (and ditto for the other two
preset choices when picked).

**Asked of proxy:** are `lcb_spread`, `score_stdev`, and
`policy_entropy` guaranteed to exist as symbols in the seeded default
palette today? If yes, the SPA can ship the dropdown with confidence
that any selection produces a working query. If no, the SPA needs
either:

- (a) a seeded-palette update on the SPA side first (palette-domain
  change, out of scope of this dispatch but tractable);
- (b) a documentation note in the dropdown's `[experimental]`
  tooltip explaining the dependency on the user's palette having the
  symbol defined;
- (c) a different default that *is* guaranteed to resolve.

This question composes with Q1: if the answer to Q2 is "no, they're
not seeded," then the answer to Q1 leans toward "omit when default"
to preserve the pre-dispatch wire shape on stock installs.

### Q3 — `learned_v1` advertisement timing vs. SPA ship readiness

The dispatch's §"Pre-implementation open questions, settled here"
item 3 says the proxy can advertise `learned_v1` once the model
bundle exists; the SPA's `[experimental]` tag and tooltip carry the
user-facing OOD-caveats honesty. The dispatch also notes the diverse-
corpus retraining is the gate before the model is "ready for opt-in"
and is independent of this dispatch.

**Asked of proxy:** what is the proxy side's intended order of
operations? Two plausible shapes:

- (a) v1.0.26 ships **with** the model bundle and advertises
  `learned_v1` immediately. SPA ships its dropdown in the same
  umbrella release window; the `[experimental]` tag is in effect from
  day one.
- (b) v1.0.26 ships **with** the substrate changes
  (`LearnedPiecewiseAllocator`, the registry plumbing, the dispatch
  branch) but **without** the bundled model file. The proxy
  advertises `learned_v1` only after a separate retraining-and-bundle
  arc lands. The SPA's dropdown's `learned_v1` option stays gated on
  advertisement and is simply invisible to users until the proxy
  bumps again with the bundle.

The SPA-side code is identical under both shapes (the advertisement
gate is the only switch). The question is informational — knowing
which shape lets the frontend write FEATURES.md honestly (option (a)
introduces `learned_v1` `[experimental]` as a shipped surface; option
(b) introduces it as a `[planned]` surface that activates when the
proxy advertises).

## SPA-side roadmap status

The frontend has drafted an internal roadmap against the revised
"Per-query opt-in" body of the dispatch. It pins:

- A new `valueBinding: string` field under
  `engine.katago.adaptiveReevaluate` in the SPA's store, defaulting to
  `"lcb_spread"`. Migration 45→46 backfills idempotently.
- The pure builder at `src/engine/katago/capability-injection.ts`
  always includes `value_binding`; when the binding starts with
  `learned_`, also includes `allocation_algorithm: "learned_piecewise"`.
  (Pending Q1 — may switch to "include `value_binding` only when
  non-default.")
- A `<select>` row in `AnalysisControls.vue` inside the existing
  `.adaptive-fields` block. The `learned_v1` option is `v-if`-gated
  on `store.engine.info.capabilities.adaptive_reevaluate.available_value_bindings`
  containing `learned_v1`.
- `KataActionResponse.capabilities`'s `adaptive_reevaluate` metadata
  type gains `available_value_bindings?: readonly string[]`.
- i18n keys for the dropdown label + four option labels +
  experimental tooltip across `en` / `zh-CN` / `ja` / `ko`.
- FEATURES.md augmentation (one sentence under the existing
  adaptive-reevaluate paragraph).
- Unit-test extensions on
  `tests/unit/engine/katago/capability-injection.test.ts` covering
  the default-preset case and the learned case, including a
  regression guard that `visit_scaling_model` is **absent** from the
  learned-case output (catching any future driftback to the pre-
  revision shape).

The roadmap is internal and not part of this dispatch's binding
content; it's referenced here so the proxy side can see the SPA's
intended shape and flag mismatches before code lands.

## Status of this dispatch

Open for response. The frontend will not begin SPA-side
implementation until:

1. The two internal inconsistencies in the proxy-side dispatch are
   reconciled (or the proxy side confirms which body is authoritative
   so the SPA can implement against that).
2. Q1, Q2, and Q3 receive proxy-side positions (Q3 is informational
   and the SPA can ship under either answer; Q1 and Q2 are
   coupled and meaningfully change the SPA's logic).

Once these are settled the frontend roadmap will close to
implementation and the SPA half lands as a single umbrella PR
referencing this dispatch and its proxy-side reply.

License: Public Domain (The Unlicense).
