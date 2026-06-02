# Postmortem — Knob-Registry `domain: 'qeubo'` Category Confusion

- **Date filed:** 2026-05-14
- **Status:** Bug confirmed by user observation during Phase 6 end-to-end
  test of the knob-registry arc; root cause identified at the spec
  level; remediation not yet shipped (in-flight on
  `KodBena/feat/knob-registry`).
- **Audience:** Author + LLM collaborators. The focus is operational
  efficiency in spec authoring + spec auditing + literal-following
  implementation, not blame.
- **Scope:** The category error that surfaced when the user, having set
  a range on the default `alpha` analysis-environment parameter via
  PaletteEditor, observed the resulting knob appearing in the cross-
  domain `KnobRegistryEditor` under a section header labelled
  "qEUBO" — despite the parameter conceptually belonging to the
  palette / analysis-environment subsystem, with qEUBO being one
  consumer that may claim it, not its owner.

---

## TL;DR

The knob-registry plan's `KnobDomain` enum
(`'display' | 'engine' | 'review' | 'qeubo' | 'experimental'`)
conflated two orthogonal concepts the plan §2 was explicitly
shaped around keeping separate:

- **Domain** — where the knob lives in the user's mental model
  (display, engine, review, …). A UX taxonomy.
- **Consumer** — who may hold the knob's claim in the substrate
  state machine (qEUBO, autonomous-SR, …). A claim-API identity.

`'qeubo'` named a consumer in the domain slot. The same string
appears verbatim in `types.ts` as a `ConsumerClaim.consumerId`
value:

```ts
consumerId: string;  // 'qeubo' | 'autonomous-sr' | ...
```

So the symbol was double-counted across two different vocabularies.

The Phase 5 implementation faithfully followed the enum: every
analysis-env parameter was seeded as `domain: 'qeubo'` because
that was the closest match. The category error compounded —
once at spec time, once at implementation time — and surfaced
on first user inspection of the editor surface.

Concrete remediation is in §6. Lessons in §7.

---

## 1. The chain of authorship

| Step | Artifact | What it said about `'qeubo'` |
|---|---|---|
| 1 | `docs/archive/notes/design/knob-registry-plan.md` §3 (authored 2026-05-14) | `domain: 'display' \| 'engine' \| 'review' \| 'qeubo' \| 'experimental'` — listed without commentary. |
| 2 | Phase 1 commit `ab82c66` — `src/types.ts:137` | Copied the enum verbatim into the production `KnobDomain` type. |
| 3 | Phase 1 commit `ab82c66` — `src/types.ts:337` | Wrote `consumerId: string; // 'qeubo' \| 'autonomous-sr' \| ...` — same symbol, different role. The doubling was now in code; no review caught it. |
| 4 | Phase 5 commit `a1dbe76` — `src/store/migrations.ts:265` | Migration 37 → 38 seeded `qeubo.*` KnobDecls with `domain: 'qeubo'`. |
| 5 | Phase 5 commit `a1dbe76` — `src/composables/useQeubo.ts:163` | `ensureKnobDecl` (the experiment-start self-heal) hardcoded `domain: 'qeubo'`. |
| 6 | Phase 6 commit `3c8e59c` — `src/composables/useQeubo.ts:234` | `reconcileQeuboKnobs` (the reactive sync from PaletteEditor edits) did the same. |
| 7 | Phase 3b commit `004c49c` — `src/components/KnobRegistryEditor.vue` | Grouped knobs by domain, rendered "qEUBO" as a section header per the i18n key `knobRegistry.domain.qeubo`. |
| 8 | 2026-05-14, post-Phase-6 testing | User set a range on `alpha` via PaletteEditor → reactive reconcile fired → `qeubo.alpha` appeared under "qEUBO" in the editor. The wrong label surfaced for the first time. |

The category lived in code uninspected across six commits. The
user's first hands-on test produced the report.

---

## 2. Root cause

`KnobDomain` is a **UX taxonomy** — it answers "in which group
should the cross-domain editor show this knob?". The right
content for the enum is mental-model categories the user
recognises ("display", "engine", "review", "palette", …).

`'qeubo'` answers a different question — "which non-UI consumer
might hold this knob's claim?". That's the claim-API's concern,
already represented as the `ConsumerClaim.consumerId` field and
the `KnobDecl.qeuboControlled: boolean` flag.

Placing `'qeubo'` in `KnobDomain` collapsed two orthogonal axes
onto one symbol. The system carried the consequence: every
qEUBO-touched knob got categorised by its consumer, never by its
home.

---

## 3. Contributing factors

### 3.1 Author's assessment (project author, recorded verbatim 2026-05-14)

> A largely contributing root cause was a poorly worded spec and
> a poorly audited spec (my fault). I did read it, there were
> things I did not like, but I hoped to move forward with the
> project. On the other hand, it was an obvious matter that
> should have been flagged at implementation time as well, since
> it was obviously contradictory.

Two distinct things in that statement worth pulling apart:

- **Spec quality.** The plan §3 listed the enum without articulating
  what `KnobDomain` is *for* — no "this categorises by user mental
  model" framing, no "consumer identity belongs elsewhere" rule.
  Without that, the enum's contents look like an arbitrary list, and
  `'qeubo'` slips in unchallenged.
- **Audit cost.** The author reports having read the spec with
  reservations, and chose to ship-it-then-fix rather than block on
  every ambiguity at authoring time. That's a defensible decision in
  a small project — the alternative (gate every imperfect spec) costs
  more in throughput than it gains in correctness when the
  implementer is the same person who'll catch the bug on first
  user-facing exposure. The cost shows up here: the bug propagated
  through six commits of implementation before surfacing, because the
  spec's contradictions were carried forward rather than fixed at
  authoring time.

### 3.2 Implementer's assessment (LLM collaborator)

The plan-level confusion was real, but it was an obvious contradiction
that an attentive implementer should have caught. Specifically:

- The plan's §2 ("the substrate is one tier; consumers are another")
  was authored on the same date, immediately above §3, and explicitly
  named the conceptual axis the enum then violated. Reading §2 →
  §3 → §7 (consumer claim API) in sequence should have triggered the
  "wait, `'qeubo'` is a consumer per §2 and §7, why is it a domain
  per §3?" question. I read those sections end to end (per ADR-0002's
  read-end-to-end discipline) but didn't surface the contradiction.
- At Phase 5 implementation time, when I needed to pick a domain for
  analysis-env parameters and `'qeubo'` was the closest match, the
  honest implementer's move was "the enum doesn't have a good home
  for these; pause and revise it." Instead I took the closest-match
  path. The closest-match move is the silent-failure mode the
  read-end-to-end discipline is shaped to prevent — same failure
  pattern as the partial-document-read failures ADR-0002 calls out,
  applied to enum-content-coherence instead of citation-coherence.
- The cross-domain editor surface was deliberately tested
  end-to-end after Phase 3b (user confirmed sliders worked). At that
  point only four `domain: 'display' | 'engine'` knobs were seeded;
  the editor showed two coherent section headers. Phase 5 added a
  third — a section labelled "qEUBO" — but I shipped Phase 5
  without re-inspecting the editor against the new seeded data.
  Visual confirmation against post-Phase-5 state would have surfaced
  the category error before commit, not after the user found it.

### 3.3 Forces neither author nor implementer can blame

- The substrate / consumer split was articulated cleanly in §2.
  The category split exists at concept level even before §3 was
  written. The conflation isn't a discovery problem — both parties
  had the concept available.
- Test coverage focused on substrate primitives (Phase 1+2) and
  migration shape (Phases 3a, 5). The cross-domain editor's
  visual presentation wasn't tested. Component / template tests
  are explicitly out of scope per `tests/CLAUDE.md`, which means
  this class of bug — "the labels are wrong in a way the
  typechecker can't catch" — has no automated guard. The right
  remedy isn't to introduce component testing wholesale, but to
  expand the "visually inspect the editor after each phase" habit
  into something more disciplined than ad-hoc.

---

## 4. Why this matters beyond cosmetics

The mislabel isn't just a UX wart — it reveals an architectural
ambiguity that, left unaddressed, would have blocked Phase 6's
broader promotion sweep:

- **Other palette-internal concerns deserve the same home.**
  Palette `state_fn` thresholds, gradient-calibration parameters,
  symbol-table tuning constants — none of these are
  qEUBO-specific. If I'd promoted any of them under "qEUBO" by
  analogy, the conflation would have spread.
- **The substrate / consumer split is load-bearing for Phase 5+
  semantics.** The claim machinery's correctness depends on
  consumers being distinct from knobs being distinct from
  domains. Letting a consumer name leak into the domain
  vocabulary muddies the distinction at the type system level
  and primes future implementers to make the same conflation
  in other axes (e.g., adding a `'autonomous-sr'` domain).
- **The user's mental model is the SSOT for UX taxonomy.** The
  user, on first sight, knew "alpha is a palette parameter, not
  a qEUBO thing." The substrate's labelling must agree, or the
  user spends each interaction re-translating.

---

## 5. Detection cost

The defect was found on the **first** user-facing exercise of
the post-Phase-5 editor with seeded analysis-env parameters,
within seconds of opening the Other tab. Detection cost was
near-zero for the user.

What's worth noting is *when* that first exercise happened:
after six commits had layered the same category error. The
elapsed time between authoring and detection wasn't long
(hours, not weeks), but in a project shipping multiple
infrastructure phases per session, "elapsed commits" matters
more than "elapsed wall time" — each phase that compounds the
error is one more revert / fixup needed in the remediation
arc.

---

## 6. Remediation

Targets a single follow-up commit on `KodBena/feat/knob-registry`:

1. **`src/types.ts`** — `KnobDomain` becomes
   `'display' | 'engine' | 'review' | 'palette' | 'experimental'`.
   `'qeubo'` removed; `'palette'` added as the right home for
   analysis-env parameters.
2. **Migration 38 → 39** — rewrite every `qeubo.*` KnobDecl's
   `domain` from `'qeubo'` to `'palette'`. Idempotent: a decl
   whose domain is already `'palette'` (or any other valid
   value) is preserved.
3. **Code-site updates** — `migrations.ts:265`,
   `useQeubo.ts:163`, `useQeubo.ts:234`: replace `'qeubo'` with
   `'palette'` in the three KnobDecl seed sites.
4. **i18n** — drop `knobRegistry.domain.qeubo` across all four
   locale catalogs (en / ja / ko / zh-CN); add
   `knobRegistry.domain.palette`. Visible label becomes
   "Palette".
5. **Plan-note revision** — append a sibling design-note
   revision per ADR-0005 Rule 8 to
   `docs/archive/notes/design/knob-registry-plan.md` recording: the category
   error, this postmortem's location, and the corrected
   `KnobDomain` enum.

The `qeuboControlled: boolean` flag stays as-is — that's the
correct way to express "this knob participates in qEUBO when
an experiment runs." The fix is to stop conflating
*controlled-by-qEUBO* with *belongs-to-qEUBO* at the
categorisation level.

A future "qEUBO status badge per slider" UX (small chip on
each `qeuboControlled` knob's slider row indicating
experiment participation) is the right surface for the
information the misnamed domain header was accidentally
conveying. That's a separate UX call, not part of this
remediation.

---

## 7. Lessons

### For spec authoring

**Articulate what an enum is *for* before listing its members.**
`KnobDomain` should have opened with "categorises by where the
knob lives in the user's mental model; consumer identity belongs
elsewhere." Without that anchor, reviewers can't tell whether
`'qeubo'` is in or out of bounds — it just looks like another
value.

**When two concepts are explicitly named as separate (here:
§2's substrate/consumer split), audit every enum and field for
cross-contamination before declaring the spec stable.** The
contradiction here was visible across two paragraphs of the
same document.

**Specs ship with caveats: name them, don't carry them
silently.** The author's read-with-reservations posture is
honest, but the reservations didn't survive into the document.
A "TODO: revisit the consumer-vs-domain wording" sibling note
would have caught the bug at implementation time at the latest
— the implementer would have read the TODO and paused.

### For implementation

**Closest-match in an enum that doesn't have a true match is
itself a signal.** When Phase 5 needed a domain for analysis-env
parameters and `'qeubo'` was the closest fit, the honest move
was "the enum is wrong for this case; revise it before
committing." Taking the closest match is the literal-spec-
following failure mode that ADR-0002's loud-failure discipline
forbids in other contexts (sentinel-instead-of-throw, partial-
document-read citations). It applies equally to
enum-value-selection.

*Codified 2026-05-15 as ADR-0002 Rule 7 ("Closest-match
selection surfaces too"); this paragraph is one of three origin
instances cited in the rule body. The rule carries a provisional-
home flag noting the principle may relocate to a future
classification-discipline tenet.*

**Re-inspect editor surfaces visually after each
substantive phase, not just after the final phase.** The
"sliders work" smoke test after Phase 3b was insufficient
once Phase 5 added entries; the visual check should re-run
on every commit that adds seeded data.

**Read the spec end-to-end *for coherence*, not just for
content.** The end-to-end discipline catches "did you skip
sections"; it doesn't catch "did the sections contradict each
other." A second pass — specifically asking "does §3 agree
with §2?" — would have surfaced the issue at first read.

### For the umbrella

The `docs/notes/` postmortem corpus (the adaptive-deeper-
enrichment postmortem from 2026-05-12; the SELECTOR watchdog
postmortem under `docs/archive/notes/`) was useful prior art
in writing this one. If the postmortem habit firms up into a
discipline, a short index — "postmortems: when to file,
where to file" — under `docs/notes/` or as an ADR amendment
would help future implementers know they have permission to
file these without ceremony.

---

## 8. References

- `docs/archive/notes/design/knob-registry-plan.md` — the spec under audit;
  the §3 enum is the locus of the category error.
- `src/types.ts` — production `KnobDomain` enum (the
  authoritative type).
- Commits on `KodBena/feat/knob-registry`:
  - `ab82c66` Phase 1 (enum imported into code)
  - `a1dbe76` Phase 5 (first `domain: 'qeubo'` seeds)
  - `3c8e59c` reconcile fix (third `domain: 'qeubo'` site)
- `docs/notes/postmortem-adaptive-deeper-enrichment-2026-05.md`
  — companion postmortem from the same project, sibling format.
- ADR-0002 (fail loudly) — the loud-failure tenet the
  closest-match failure mode violates.
- ADR-0002 Rule 7 (closest-match selection surfaces too,
  appended 2026-05-15) — the rule this postmortem's §7
  "Closest-match in an enum..." paragraph codified, alongside
  the band-mismatch postmortem's §7.6 and the popover-hover
  worklog's §"Recurring pattern."
- ADR-0005 (documentation discipline), Rule 8 — the sibling-
  revision pattern §6's plan-note revision will follow.

---

## 9. License

Public Domain (The Unlicense).
