# Documentation-graph artifact — design note

Status: implemented (2026-06-01). Captured at the maintainer's
request following the 2026-06-01 deferred-items entry "Explicit
documentation-graph artifact with commit-age heatmap"
(`docs/notes/deferred-items.md`), then implemented as designed — the
generator lives at `tools/doc-graph/generate.mjs`, the committed
artifacts at `docs/doc-graph.{json,svg,md}` + `docs/doc-graph-report.md`,
and the CI freshness gate at `.github/workflows/doc-graph-ci.yml`. The
worklog is `docs/worklog/2026-06-01-doc-graph-artifact.md`. A
small-to-medium subproject — a
git-driven generator plus a rendered artifact; documented here with an
honest feasibility assessment (verdict: doable, with one recall seam
named below and one prerequisite that turns out **not** to be a blocker).
This note is a sibling to, not a replacement for,
`docs/notes/doc-graph-discipline-plan.md` (the frontmatter-substrate
plan); the relationship is worked out in §Relation.

## The thought

The documentation graph — the READMEs, `docs/handoff-current.md`, the
ten ADRs, `docs/adr-synopsis.md`, the CLAUDE.md tree,
`frontend/FILES.md` / `frontend/IDENTIFIERS.md`, the growing
`docs/notes/` (64 files), `docs/worklog/` (63), `docs/dispatch/`,
`docs/TODO.md`, `FEATURES.md`, the live-ledgers — is heavy enough that
no one holds its cross-reference structure in their head, and there is
no glance that surfaces which corners have gone stale. The maintainer
wants two things from one artifact:

1. A **navigable picture** of the graph — nodes are documents, edges
   are the cross-references the project already curates by hand
   (handoff→ADRs, FILES.md↔IDENTIFIERS.md, ADR `## Related`
   sections, dispatch request↔response pairs).
2. A **commit-age heatmap** — each node coloured by a discrete age
   bucket so neglected corners surface visually.

The deferred-items entry states a **hard requirement** that any
semantic content shown in practice — the age encoding above all — be
**machine-readable, not merely a colour the maintainer eyeballs**: the
age value lives in the data (a labelled node attribute or an
accompanying manifest), and the gradient is a *projection* of that
data, not its source of truth. This note honours that requirement as a
load-bearing constraint, not a nicety: the generator's primary output
is a structured manifest; the rendered graph is a second projection of
the same manifest.

## The framing (the load-bearing idea)

The artifact is **two outputs from one pass over the doc tree**, and
the picture is the *lesser* of the two. The pass produces a manifest
— `{nodes: [{path, genre, first_committed, last_committed,
commit_distance, age_bucket}], edges: [{from, to, kind, site,
resolved}]}` — and the picture is rendered *from* the manifest. This
inversion matters because it makes the higher-value half fall out for
free: once edges carry a `resolved: bool` and `kind`, the same manifest
that draws the graph **is a doc-link validator** — every dangling
cross-reference is a row in the data, surfaced as output rather than as
a missing arrow no one notices. (§Blind-spots develops this; it is
arguably the higher-value half of the whole artifact, and the empirical
measurement below shows why.)

The dual is exactly the cause/effect split the project already reasons
in: the manifest is the *machine-readable substrate* (the cause side —
what the docs actually say about each other, with resolution status);
the heatmap+graph is the *rendered projection* (the effect side — what
a reader perceives at a glance). A staleness claim or a "this reference
is broken" claim lives on the substrate side; the gradient is only an
honest projection if the substrate is the source of truth. This is the
same posture `docs/notes/doc-graph-discipline-plan.md` takes when it
says the generated `INDEX.md` is "a *cache* of the metadata, regenerable
from source. If it disagrees with frontmatter, frontmatter wins."

## Edge extraction — what the graph is actually made of

The design cannot assume the frontmatter substrate exists. The
discipline plan (`docs/notes/doc-graph-discipline-plan.md`) proposes a
`references:` frontmatter field as the canonical edge source, but that
plan is `status: draft` and — measured 2026-06-01 — **2 of 165
non-archive docs carry frontmatter at all** (`doc-graph-discipline-plan.md`
itself and `per-board-multi-query-model-plan.md`). A generator that
read `references:` fields today would have near-zero recall. The edges
therefore have to be extracted from **prose conventions in the bodies**,
and those conventions, measured across the tree, are:

| Edge convention | Form | Measured volume | Parse precision |
|---|---|---|---|
| **ADR token** | `ADR-NNNN` (4-digit) | 471 hits for `ADR-0002` alone; every ADR cited hundreds of times | High — fixed regex `ADR-[0-9]{4}`, maps to `docs/adr/NNNN-*.md` |
| **Backtick repo-path** | `` `docs/notes/foo.md` ``, `` `frontend/CLAUDE.md` `` | 1098 `docs/` paths + 564 `frontend/` paths | High — repo-relative, resolves directly |
| **Backtick bare-filename** | `` `2026-05-31-perf-foo.md` `` (no directory) | common in ADR `## Related` and worklog cross-refs | **Medium — the recall seam** (see below) |
| **Markdown link** | `[text](path.md)` | **2 in the entire tree** | High but negligible volume |
| **Prose mention** | "the companion document", "see the X note" | rare (ADR-0005 Rule 4 actively discourages bare-naming) | Low — out of scope for v1 |
| **ADR `## Related` section** | bolded backtick paths + ADR tokens, uniform across all 10 ADRs | 10/10 ADRs | High — already covered by the two backtick/token rules, but the *section* gives the edge a stronger `kind` |
| **Dispatch filename** | `{from}-to-{to}-{topic}.md` | all 14 dispatches | High — encodes a *directed* edge and a topic-cluster key |

The honest takeaway: **backtick-paths + ADR-tokens are the graph.**
Markdown links are a non-starter to rely on (n=2). Prose mentions are
deliberately rare because ADR-0005 Rule 4 ("document bodies don't
bare-name their siblings") pushes authors toward generic descriptors —
so the messy-prose recall problem the maintainer might fear is smaller
than expected, *because the documentation discipline already suppresses
the unparseable form.* That is a happy interaction worth naming.

The **recall seam** is the backtick bare-filename: `## Related` sections
and worklog cross-refs cite `` `2026-05-31-perf-treewidget-render-decouple.md` ``
with no directory. Resolving it means searching the doc tree for a
basename match — usually unique, occasionally not (a worklog and an
archived copy share a basename), and a basename that matches nothing is
indistinguishable from a typo'd or moved target. v1 resolves
bare-filenames by unique-basename lookup, marks non-unique and
no-match cases `resolved: ambiguous` / `resolved: dangling` in the
manifest, and never silently picks a winner (ADR-0002: a guessed
resolution is surfaced as guessed, not asserted).

## The heatmap — age semantics, made explicit

The deferred-items entry flags an ambiguity: "from when the document
was committed" reads as either *distance-since-last-touched*
(staleness) or *since-first-committed* (absolute age). Git supplies
**both** cheaply — `git log -1 --format=%ci` for last-touched,
`git log --reverse | head -1` for first-committed, and `git rev-list
--count <sha>..HEAD` for commit-distance (e.g. `adr-synopsis.md` is 37
commits behind HEAD; `0002-fail-loudly.md` is 324). The recommendation:
**the heatmap encodes staleness (commit-distance since last touch)**,
because the maintainer's stated want is "see which corners have gone
stale," and absolute age is the wrong signal there — a foundational
ADR *should* be old and untouched; that is not rot. Both values go in
the manifest regardless (cheap, and the absolute-age column answers a
different question a reader may later ask), but the rendered gradient
projects staleness.

Buckets are **discrete** per the entry's "discrete age bucket"
language. A defensible default: `fresh` (≤ ~20 commits behind HEAD),
`recent` (≤ ~80), `aging` (≤ ~250), `stale` (> ~250) — thresholds in
commit-distance, not wall-clock, consistent with the project's
counts-not-wall-clock perf posture and immune to the "no commits for a
week" calendar artifact. The bucket label is a node attribute in the
manifest; the colour is the projection.

> **Amendment (2026-06-01, churn-reduction).** The "both values go in the
> manifest regardless" decision above was refined once the artifact shipped: the
> raw commit-distances are computed in-memory (they still drive the bucket
> assignment and the staleness-table ordering) but are **not written to the
> committed manifest**. Being HEAD-relative they shifted on every commit —
> ~700 lines of churn per commit, the symptom being routine doc PRs reporting
> +5k/−5k line diffs — for no structural change. The committed
> `docs/doc-graph.json` now carries only the **stable** projection: the discrete
> `age_bucket` plus the absolute first/last-commit *dates* (and the SVG tooltip
> and staleness table likewise show bucket + date, never the raw number). The
> freshness gate was already structure-only (it never compared the distances),
> so the contract is unchanged; only the per-commit byte-churn went away. See
> `docs/worklog/2026-06-01-doc-graph-churn-reduction.md`.

## The output format — GitHub-rendering reality decides it

The maintainer's leaning is **Graphviz `dot` → committed `.svg`**, and
the entry notes `mermaid` as the toolchain-free alternative. The
decision is genuinely governed by *how GitHub renders each candidate*,
and the candidates do not render the same way:

| Candidate | Renders in file/blob view? | Embeds in a README's markdown? | Clickable links to doc files? | Layout control for a heavy graph |
|---|---|---|---|---|
| **Mermaid** in a ```` ```mermaid ```` fence | yes (native) | **yes (native, inline)** | yes (`click` directives / link syntax) | **weak** — auto-layout, hairballs on dense graphs |
| **Standalone committed `.svg`** | **yes** | **no** — GitHub sanitizes/strips `<svg>` (and `<script>`) embedded in markdown | **yes** — `<a xlink:href>` survives in the blob view | **strong** — full `dot` control |
| **Inline SVG pasted into markdown** | n/a | **no** — stripped by the sanitizer | n/a | n/a |
| **Committed PNG** | yes | yes (inline `![](...)`) | **no** — raster, no hyperlinks, no zoom | strong (it's pre-rendered `dot`) |
| **Interactive HTML** | **no** — shows source, does not execute | no | n/a (not rendered) | strong but moot |

The tension the maintainer correctly senses: a committed `.svg` is
**navigable in the file view and supports clickable hyperlinks to each
doc** (the single most useful interactive property — click a node, land
on the doc), but **will not embed in a README's markdown** because
GitHub's HTML sanitizer strips `<svg>`. Mermaid is the opposite: it
**embeds inline** in any markdown page natively, but its auto-layout
gives weak control over a heavy graph and produces a hairball at this
project's scale.

**Recommendation: emit both, from the one manifest, and let each serve
its niche — but if forced to one, the maintainer's `dot`→`.svg`
instinct is right for the *primary* artifact.** Concretely:

- **Primary: `dot` → committed `.svg`** at e.g. `docs/doc-graph.svg`,
  with per-node `URL="..."` attributes so every node is a clickable
  hyperlink to its doc in the blob view. This is the navigable artifact
  the maintainer wants; `dot` gives the layout control a 150-plus-node
  graph needs (rank constraints, clustering by directory, edge
  bundling). Confirmed: a standalone `.svg` renders in GitHub's file
  view and its `<a>` links work there.
- **Secondary: a Mermaid block** embedded in a thin `docs/doc-graph.md`
  index page (which also carries the human-readable staleness table —
  see below), so there is an *inline* view for readers who land on the
  markdown rather than opening the raw `.svg`. Because Mermaid hairballs
  at full scale, the embedded Mermaid is the **pruned** view: ADRs +
  hub docs + their first-order edges, not all 165 nodes.
- **The manifest** (`docs/doc-graph.json` or a fenced JSON block in the
  index page) is the machine-readable source-of-truth both renderings
  project from, satisfying the hard requirement.

This challenges the maintainer's framing only at the margin: `dot`→SVG
is correct for the *controllable, clickable, navigable* artifact, but
SVG alone leaves the README/inline-embed niche unserved, and Mermaid
fills it for free since both are generated outputs of one pass. The
cost of emitting both is one extra render step, not a second graph to
maintain — the maintenance unit is the generator, not the pictures.

## Design-space survey — is it really flat?

The maintainer's prior is that "the effective design space is mostly
flat regardless of tooling." Mostly confirmed, with three non-obvious
forks worth surfacing rather than padding:

1. **Manifest-first vs picture-first** is *not* flat and is the real
   decision. Picture-first (draw a graph, bolt on a colour) fails the
   hard requirement and throws away the validator. Manifest-first
   (this note's recommendation) gets both projections and the validator
   for the same cost. This is the one fork that actually matters.
2. **Output format** is *narrowed, not flat* — the GitHub-rendering
   table above eliminates inline-SVG and interactive-HTML on rendering
   grounds, leaving `dot`→SVG vs Mermaid as a niche-split, not a
   free choice. Flat-ish in *effort*, not in *consequence*.
3. **Edge-source** (frontmatter vs prose-scan) *looks* like a fork but
   is currently forced: frontmatter coverage is 2/165, so prose-scan is
   the only option with usable recall today. It re-opens as a real fork
   only if the discipline plan lands and frontmatter coverage climbs
   (see §Relation).

Everything else — JSON vs YAML for the manifest, the exact colour ramp,
where the file lives — is genuinely flat (reversible, low-stakes; pick
a reasonable option and move on).

## Blind-spots — the value-add

Things the deferred-items framing under-specifies or omits, ordered by
leverage:

- **The validator is the higher-value half, and it is measurable
  today.** Of the 244 distinct backtick `` `docs/*.md` `` reference
  targets in the tree, **86 do not resolve to an existing file**
  (measured 2026-06-01). Some are honest false positives — `` `X.md` ``,
  `` `YYYY-MM-DD-...md` ``, `docs/audits/README.md` are *template
  placeholders inside code blocks or worked examples*, which ADR-0005
  Rule 4 explicitly exempts ("filenames in code blocks are fine"). But
  others are genuine drift: `docs/adr/0008-adr-meta-review.md` (an ADR
  number that moved), `docs/ANALYSIS_PERSISTENCE_PLAN.md` (a renamed
  file), `docs/archive/notes/qeubo-namespace-unification-plan.md` (a
  file that lives at a different path now). **The picture is a nicety;
  the broken-link report is the thing that pays rent**, and it slots
  *exactly* into ADR-0005's own Alternative C — automated doc CI was
  "rejected (for now) because the rules are too soft," with the explicit
  note that "as tooling matures, partial mechanization becomes
  attractive." Cross-reference *resolution* is the mechanizable subset:
  it is not soft. This is the natural CI doc-link gate ADR-0005 left a
  hole for, and RFC-0001's open-question-6 "doc-graph integrity check"
  that `doc-graph-discipline-plan.md` §9 names.

  **Precision caveat, named honestly:** the validator must distinguish
  code-block/example placeholders from prose references, or it floods
  with the 86-minus-real false positives. The cheap heuristic: skip
  fenced code blocks and inline-code that is obviously a template
  (`X.md`, `YYYY-`, `NNNN`), and treat ADR-0005 Rule 4's code-block
  exemption as the spec. Recall stays high; precision needs this filter
  to be useful as a gate.

- **Edges are directed and typed — collapsing them loses the signal.**
  An ADR `## Related` ref, a FILES.md `src/` path mention, a worklog
  "see X", and a dispatch request→response are *different edge kinds*
  with different directions. The manifest's `kind` field should
  distinguish at least: `adr-related` (curated, bidirectional-ish),
  `path-mention` (directed A→B), `dispatch-pair` (directed
  request→response via the topic-cluster key), `synopsis-of` (the
  adr-synopsis→ADR fan-out), `supersedes`/`superseded-by` (if the
  frontmatter ever lands). Typing the edges is what lets the picture
  *mean* something (curated structural links drawn solid, incidental
  mentions drawn faint) and lets the validator scope its strictness
  (a dangling `adr-related` is a real bug; a dangling path-mention in a
  frozen archive note is expected).

- **Node-boundary: docs cite *code*, not just docs.** FILES.md and
  IDENTIFIERS.md are dense with `` `src/foo.ts:62` `` references —
  these are edges to *code*, not to documents. v1 should treat the
  node set as **documents only** (the doc-graph, per the entry's core
  scope) and record code-target references as a *separate, optional*
  edge class or drop them — but the decision must be explicit, because
  silently dropping them under-counts FILES.md/IDENTIFIERS.md's
  out-degree and mis-renders them as leaf nodes when they are in fact
  the densest hubs in a code-aware view. **Maintainer decision:** docs
  only, or docs+code-targets? (Recommend docs-only for v1; the entry
  scopes the artifact to the doc-graph.)

- **Hub nodes will hairball the layout.** Measured: `adr-synopsis.md`
  cites 48 ADR tokens; `handoff-current.md` carries 41 doc-path refs +
  30 ADR refs; `TODO.md` carries 42 doc-path refs. These three are
  star-centres that, drawn naively, dominate the picture and bury the
  interesting peripheral structure. This is the legibility-at-scale
  problem the maintainer should expect. Mitigations (all `dot`-side,
  none affecting the manifest): cluster nodes by directory
  (`adr/`, `notes/`, `worklog/`, `dispatch/`), draw hub edges faint or
  bundle them, or offer a `--prune` mode that drops the three known
  hubs to expose the rest. The manifest stays complete; the *picture*
  is the thing that needs the pruning, which is exactly why
  manifest-first matters — you prune the projection, not the data.

- **Self-reference and synopsis noise.** `0002-fail-loudly.md`'s body
  contains "ADR-0002" three times (self-citation). The extractor must
  drop self-edges, or every ADR sprouts a self-loop. Similarly the
  adr-synopsis→every-ADR fan-out is real but should be a distinct
  `synopsis-of` kind so it can be filtered out of the "interesting
  structure" view.

- **The memory graph (`[[name]]` wiki-links) is out of scope, and
  saying so is the call.** The user's auto-memory at
  `~/.claude/.../MEMORY.md` uses `[[name]]` wiki-link syntax and forms
  its own graph — but it lives **outside the repo**, is per-user and
  per-machine, and is not project documentation. **Decision: out of
  scope for the repo doc-graph artifact.** The repo doc-graph is the
  core deliverable; pulling in an out-of-repo, non-versioned,
  privacy-adjacent store would muddy both the node set and the
  staleness signal (memory has no meaningful git-commit-distance in
  *this* repo). Named here so the omission is a decision, not an
  oversight.

- **Incremental vs full regeneration.** At ~165 nodes a full-tree
  rescan is sub-second; **incremental is a non-problem and building it
  would be premature.** Full regeneration every run. (Revisit only if
  the doc set crosses the ~thousands where a rescan is felt — it won't
  for years.)

- **The artifact's own freshness — the meta-irony the entry flags.** A
  hand-drawn graph would become the stalest node (the deferred-items
  entry says this outright: "a hand-maintained graph would itself
  become the stalest node"). So the generator is **scripted, not
  hand-drawn** — non-negotiable. The remaining fork is *committed vs
  on-demand*:
  - **Committed** (`.svg` + `.json` + index `.md` in the tree): readable
    on GitHub without running anything (the navigability the maintainer
    wants), but it then needs the *same* regeneration discipline its
    own heatmap is meant to flag — a committed-but-stale doc-graph is
    self-refuting. The fix is a CI step (or a pre-commit/pre-push hook)
    that regenerates and fails if the committed artifact drifts from a
    fresh run — i.e. the artifact is **CI-verified-fresh**, the same
    way `npm run build` gates the frontend. This also delivers the
    broken-link gate for free (the validator and the freshness check
    are the same pass).
  - **On-demand** (a `scripts/doc-graph.mjs` run locally): no staleness
    risk, but not navigable on GitHub — which defeats the primary
    requirement.

  **Recommendation: committed, CI-verified-fresh.** Navigability is the
  stated want; the staleness risk is exactly what CI regeneration
  neutralises, and the same CI step is the doc-link gate. This is the
  one place the artifact's design must answer to its own thesis.

## Feasibility verdict

**Doable, not blocked.** The caveats, named honestly:

1. **Edge recall is high but not total**, bounded by the prose-scan
   approach: backtick-paths and ADR-tokens (the dominant conventions)
   parse cleanly; bare-filename refs need unique-basename resolution
   with explicit `ambiguous`/`dangling` marking; pure-prose mentions
   ("the companion document") are out of scope for v1 — and are rare
   *because* ADR-0005 Rule 4 suppresses them. The honest precision/recall
   story is: high recall on the curated edge kinds, with the
   placeholder-in-code-block false-positive class handled by the Rule-4
   code-block filter.
2. **The frontmatter substrate does not exist yet** (2/165 docs), so the
   generator cannot lean on `references:` fields and must prose-scan.
   This is *not* a blocker — prose-scan has usable recall today — but it
   means the artifact and `doc-graph-discipline-plan.md` are
   complementary, not redundant (§Relation): the discipline plan would
   *improve* this artifact's precision over time by making edges
   declarative, but is not a prerequisite for shipping it.
3. **Layout legibility at scale** is the real engineering risk, not
   feasibility — the three hub nodes will hairball a naive draw. Solved
   on the `dot`/projection side (clustering, edge-bundling, prune
   modes), never by mutilating the manifest.

The subproject is: (1) freeze the manifest schema (`nodes` with
age/genre, `edges` with `kind`/`site`/`resolved`); (2) write the
git-driven prose-scan generator (one pass: enumerate docs, `git log`
each for commit-distance, regex the bodies for the three edge
conventions, resolve and mark each edge); (3) render `dot`→`.svg`
(clickable, clustered) + a pruned Mermaid block + the manifest into a
thin `docs/doc-graph.md` index carrying a human-readable staleness
table; (4) wire the broken-link validator + freshness check into CI as
one step. Steps (1)–(2) deliver the validator (the rent-paying half)
before any picture is drawn.

## Relation

- **`docs/notes/doc-graph-discipline-plan.md`** — the *substrate* plan
  this artifact is the *projection* of. That plan establishes
  per-doc frontmatter (genre, status, `references`) as a machine-readable
  source of truth and an optional `docs/INDEX.md` generator; this note
  designs the visual+heatmap+validator artifact that consumes the
  graph. They compose: today this artifact prose-scans because
  frontmatter coverage is 2/165; if the discipline plan lands and
  coverage climbs, the generator gains a higher-precision declarative
  edge source (`references:`) alongside the prose-scan, and the
  edge-source fork in §Design-space re-opens as a real choice. Neither
  blocks the other.
- **ADR-0005 (documentation discipline)** — the artifact is ADR-0005
  applied as mechanism. Its Alternative C ("automated mechanism —
  rejected for now, attractive as tooling matures") names the exact
  opening the broken-link validator fills; Rule 3 ("descriptions
  describe relations") and Rule 4 ("no bare-named siblings; code-block
  filenames exempt") shape both the edge-`kind` typing and the
  validator's precision filter. Revisit-when #2 ("documentation tooling
  matures enough to mechanize part of the discipline") is the trigger
  this artifact satisfies.
- **`docs/rfcs/0001-adr-meta-review.md`** — its open-question-6
  "doc-graph integrity check" (per `doc-graph-discipline-plan.md` §9)
  is precisely the validator angle; if an audit ledger lands under
  RFC-0001, the doc-graph manifest is a mechanical input to it.
- **`docs/notes/deferred-items.md`** — the originating entry; this note
  resolves its "open questions for pickup" (generation scripted not
  hand-drawn → yes; node/edge boundary → docs-only nodes, three named
  edge kinds; age semantics → staleness via commit-distance, both
  values in manifest; location+freshness → committed, CI-verified-fresh).
- **The umbrella "Documentation is part of the work" rule** — this
  artifact makes the doc-graph's shape and staleness a first-class
  inspectable thing rather than an implicit structure carried in
  maintainer memory, which is the rule's intent at the meta level.

## License

Public Domain (The Unlicense).
