# Analysis Bundle Compression — Plan Note

- **Status:** Open. Pre-work. Pairs with the
  `analysisAutoSave` toggle that shipped on `main` (commit
  `9b40b1a`) — auto-save makes the per-bundle payload size a
  load-bearing constraint, and the SPA still surfaces only
  `stored_byte_size` without a counterpart that tells the user
  what they actually saved.
- **Genre:** Design note. Lays out the compression design space
  for analysis bundles, with experiments-shape rather than an
  execution roadmap. Expected to be revisited as experiments
  return numbers.
- **Date:** 2026-05-25.
- **Scope:** Frontend (the wire-shape projection), backend (the
  storage codec dispatch), and the cross-team dispatch the wire
  growth implies. The research-DB corpus (`research/` branch,
  `192.168.122.1/research`) is the empirical substrate.

## What this document is

A working design map for "rudimentary compression" of analysis
bundles, plus the shape of the experiments that would tell us
which of several plausible mechanisms is worth shipping. The
note is deliberately exploratory — the user's framing is
"experiment-as-we-go-along" and the cost-benefit on any
specific scheme depends on numbers we don't have yet.

Not a contract negotiation record. The cross-team dispatch
falls out of whichever wire-shape grows from these experiments;
it'll get written when the design crystallises.

## Motivation

KataGo analysis packets are dominated by two large float arrays:
the 361-float `rootInfo`-level `ownership` map and the 362-float
`policy` head (plus per-move `ownership` arrays inside
`moveInfos[*].ownership` when `includeOwnership` is on). A
final-packet bundle today serialises to ~24 KB pickle / ~20–40
KB JSON per node; gzip already squeezes this 2-4× at storage
time (the `storedScheme: 'json+gzip'` path in the backend).
Saved bundles in active SR usage easily reach hundreds of KB
to a few MB.

Two motivations to push further:

1. **Auto-save raises the constraint.** The shipped opt-in
   `analysisAutoSave` toggle PUTs the full bundle after each
   authoritative ledger record, so the per-user quota becomes a
   continuous-bandwidth concern rather than a per-click one. The
   smaller the bundle, the wider the headroom.
2. **The data is highly redundant.** Sequential mainline
   positions differ by one stone; their ownership maps are
   roughly the previous one with a few cells flipped. The
   policy head is sparser still. Generic compressors (gzip,
   zstd) capture some of this redundancy implicitly but spend
   most of their budget on the JSON tokenisation overhead, not
   the float-array signal.

## What we're compressing

The bundle wire shape (from `analysis-bundle.ts`):

```
{
  schemaVersion: 1,
  records: [
    { configHash: string, nodeId: NodeId, packet: KataAnalysisResponse }
  ]
}
```

A `packet` is the KataGo response normalised to canonical WHITE
framing. The size-dominant fields per `engine/katago/types.ts`:

- `ownership` — 361 floats in `[-1, 1]` (19×19 board) at the
  response root. Optional; present when `includeOwnership: true`
  was on the query (the SPA toggles this from the overlay
  registry).
- `policy` — 362 floats in `[0, 1]` (361 cells + 1 pass slot)
  representing the prior. Optional same way.
- `moveInfos[*]` — variable count. The SPA's typed shape models
  `{move, visits, winrate, scoreLead, pv, order, clusterId?}`.
  KataGo's wire actually carries more (`scoreStdev`, `scoreMean`,
  `scoreSelfplay`, `lcb`, `utility`, `prior`, possibly per-move
  `ownership` when `includeMovesOwnership` is on); those pass
  through the JSON-stored bundle as unmodelled excess properties.
  See proposal B in the design space for the implication.
- `extra` envelope — the proxy's `analysis_enricher` (wire-name
  `delta_analysis`) adds three branches: `state` is a nested
  record indexed first by turn-string then by metric name
  (`Complexity`, `Win Probability`, etc.); `black` and `white`
  each carry per-player enrichment (`triangular` heatmap,
  per-move-index `deltas`, reserved `cwt`). Palette-defined
  symbolic expressions evaluated proxy-side. The values are
  typically a handful of named scalars per turn, not large.

The redundancy axes:

- **Cross-position (across `nodeId`s within a bundle):** ownership
  at game move N differs from move N-1 by a few cells. Strong
  signal if positions can be ordered by adjacency.
- **Unmodelled-field excess:** the wire payload carries
  per-`moveInfos` fields the SPA's typed shape doesn't model
  (and so cannot read). They round-trip through the JSON-stored
  bundle as dead weight.
- **Float quantisation:** ownership values cluster near ±1 for
  settled stones, near 0 for contested cells. A coarse
  quantisation (4-8 bits per cell) is plausibly indistinguishable
  to the user.
- **Policy sparsity:** the top-K policy mass concentrates on a
  small set of cells; the long tail rounds to zero at any
  reasonable display precision.

## Data corpus

The `research/` branch holds the data-collection arc that fed
the proxy's learned value function (see
`research/pg_sink.py`). It's a Postgres database on
`192.168.122.1/research` with:

- 1 164 positions × 10 realizations × ~190 packets ≈ 2.2 M
  packets, 35 GB on disk (with TOAST compression).
- Each packet stored twice: `msg` (the full pickled KataGo
  response — same wire vocabulary as our bundle but pickle-
  serialised) and `msg_thin` (a feature-selection projection,
  not a compression scheme; drops ownership and full policy).
- Two batch fetchers already wired:
  `fetch_positions_bundle_lossless_batch` (the full payload,
  ~5 KB/packet TOAST-compressed) and
  `fetch_positions_bundle_thin_batch` (~350 B/packet).

**Compatibility considerations.**

- *Format:* pickle, not JSON. To emulate an SPA bundle from a
  research packet: unpickle, project the dict through whatever
  pre-upload transform we propose, re-serialise as JSON. The
  semantic content is the same; the serialisation framing isn't.
- *Enrichment envelope:* the research packets carry whatever the
  collector's wire opt-ins produced. The SPA always opts into
  `delta_analysis`; whether the research collector did is a
  thing to verify (grep `collect_trajectory.py` for the
  `capabilities` field on the query). If the research data is
  enrichment-free, we're characterising compression of the raw
  KataGo response only, missing the SPA's `extra.state` palette
  contribution. The contribution is small in absolute bytes,
  so this is an acceptable gap for first-cut experiments.
- *Final-vs-during-search:* the SPA bundle stores final packets
  only; during-search previews collapse at ledger.record time.
  For experiments we restrict to `is_during_search = FALSE`
  (the research arc has 11 610 such packets — ample).
The research arc was about MCTS trajectory dynamics, not bundle
storage, so the data is incidentally rather than purposefully
representative. Bundles users actually save will skew toward
positions they care about reviewing (typically deeper into
games, with more committed shape) — the research corpus's
stratified per-decade sampling biases toward earlier mid-game
positions. A small targeted re-collection on the SPA itself
(`analysisAutoSave` on, run through a few games, export the
saved bundles) would be the truer corpus. Both are fine for
first-cut characterisation.

## Compression design space

Three orthogonal axes.

### Axis 1: lossless vs lossy

- **Lossless** preserves byte-identity of the round-tripped
  packet. The user gets back exactly what KataGo emitted; the
  palette enrichment, chart rendering, restore-on-reopen all
  operate as today. Ceiling on savings is information-theoretic.
- **Lossy** quantises the heavy float arrays and accepts a
  per-cell reconstruction error. The ceiling is much higher —
  the redundancy in ownership maps is partly a redundancy of
  representation (real-number cells used to encode what amounts
  to a low-bit-depth confidence signal). The cost is a UX
  decision the user has to consent to.

These compose: a lossy front-end transform on the float arrays,
followed by a lossless generic compressor on the residual
representation, is the natural shape if both axes earn their
weight.

### Axis 2: format-level vs domain-aware

- **Format-level lossless** is "swap gzip for zstd or brotli";
  trivial change with usually-real wins. Should be measured
  first because it sets the bar any domain-aware scheme has to
  clear.
- **Domain-aware lossless** is delta-encoding ownership across
  ordered positions, sorting `moveInfos` for better
  compressibility, dropping fields the SPA doesn't read,
  ordering JSON keys to expose run-length patterns. Each is its
  own decision; some are obvious wins, others depend on what
  the generic compressor was already finding.
- **Domain-aware lossy** is the more interesting branch — see
  the lossy section below.

### Axis 3: at-rest vs in-flight

- **At-rest compression** runs on the backend at storage time
  and decompresses at retrieval. The wire is JSON; the
  `storedScheme` field grows new tokens (`json+zstd`,
  `json+brotli`, etc.). Frontend code changes are zero; only
  the backend's codec dispatch grows. Reduces storage cost
  and quota usage; **does not** reduce the user's upload
  bandwidth.
- **In-flight compression** runs on the frontend before the PUT
  and on the backend at decompression time. Wire becomes a
  compressed blob (with a content-encoding header or a
  scheme-prefix the backend dispatches on). Frontend gets a new
  codec dependency; backend gets a new content-type or
  scheme path. Reduces the user's upload bandwidth in addition
  to storage. Worth more for `analysisAutoSave`-on users.
- **Lossy transforms** are by their nature pre-upload (the
  reconstruction error is part of what the user agreed to
  store); they live frontend-side regardless.

### Lossless branch — concrete proposals

A. **Codec swap.** Add `json+zstd` (and optionally
   `json+brotli`) to the backend's `storedScheme` dispatch.
   Zstd at level 3-5 typically beats gzip's CPU/ratio Pareto
   meaningfully on JSON-shaped data. Trivial PR; sets the
   measurement bar.

B. **Drop-redundant-fields projection.** The wire payload
   carries per-`moveInfos` fields the SPA's typed shape doesn't
   model (`scoreStdev`, `scoreMean`, `scoreSelfplay`, `lcb`,
   `utility`, `prior`, possibly per-move `ownership` when
   `includeMovesOwnership` was on). The SPA can't read them —
   the typed access surface doesn't expose them — but they
   round-trip through the bundle as dead weight. A pre-upload
   projection through the typed shape (or an explicit allow-list
   derived from it) strips them cleanly; the typed surface is
   the schema, so synchronisation falls out for free. Absent
   fields rehydrate as defaults on restore.

C. **Cross-position ownership delta-encoding.** Order the
   bundle's records by SGF traversal (depth-first mainline,
   then branches); represent each ownership map as the
   per-cell delta against the previous record's; record the
   permutation alongside so replay re-aligns. Adjacent
   ownership maps differ by 5-30 cells (out of 361) typically;
   the delta is mostly zeros, which any generic compressor
   collapses to almost nothing. The permutation save is small
   (a list of nodeIds in traversal order, plus the
   anchor-nodeId for the first record's "delta against zero").

D. **Run-length / sparse encoding of policy.** The policy head
   is mostly zero; representing it as a sparse `[idx, value]`
   pair list for non-near-zero entries (and an "all others
   zero" sentinel) is a domain-aware projection that gzip can't
   reach without seeing the structure.

### Lossy branch — concrete proposals

E. **Uniform ownership quantisation.** Map each ownership cell
   from `float32` to a small integer codebook (e.g. 16
   uniform bins over `[-1, 1]` = 4 bits per cell, 181 bytes
   for the whole map instead of 361×4 = 1.4 KB). Trivial to
   implement; trivial to reconstruct (look up bin centre).
   Reconstruction error is bounded by half-bin-width.

F. **Non-uniform / clustered quantisation.** Ownership values
   cluster near ±1 (settled stones) and near 0 (dame); a
   non-uniform codebook (more bins near the modes, fewer in
   the rare bands) gets the same byte budget at lower
   reconstruction error. Codebook can be fixed (derived
   one-time from the corpus) or learned per-bundle.

G. **Product-residual vector quantization (PRVQ) — your
   proposal.** Treat the ownership map as a vector in
   `R^361`, split into product spaces (e.g. 19 stripes of 19
   cells, or 38 patches of 9 cells), quantise each subspace
   to its own codebook, then run a residual encoder on what's
   left. Standard technique for vector quantisation of
   correlated signals; better than uniform when the cells
   have learned co-occurrence structure beyond what the
   marginals suggest (e.g. settled-territory chunks).
   Codebook training is offline from the research corpus.
   Reconstruction error per cell is small for "typical"
   positions and larger for atypical ones — which is exactly
   where the **opportunistic feedback loop** in the next
   section earns its weight.

### The opportunistic worst-reconstruction surface

Your suggestion: at save time, the SPA pre-quantises, computes
per-cell reconstruction error vs the original float array,
finds the worst-reconstructed turn in the bundle, and surfaces
*that* turn (with a side-by-side "original vs reconstructed"
overlay) so the user can decide whether the compression is
acceptable. If not, they fall back to lossless for this bundle.

Concretely:

- `reconstruction_error_l_infinity` = max(|orig_cell - recon_cell|) across all cells across all turns.
- `reconstruction_error_l2` = sum-of-squares.
- The "worst turn" is the nodeId whose ownership map has the
  highest L-infinity (or L2 — pick after measuring).
- UI surface: a modal or detail pane in the persist-box
  showing "compression dropped X% of bytes; worst-cell error
  was Δ=0.07 at turn N; here it is" with the original-vs-recon
  rendered side by side on the board.

This is itself a small UX research arc — what error
representation does the user actually consent to? Pixel-level
diff might look worse than it is; chart-level "winrate
deviation" might be more honest. Worth flagging that the
choice of error-metric matters and the design probably
iterates with the user as the loop.

The mechanism naturally generalises: any compression scheme
(lossless schemes have reconstruction error = 0; the surface
just says so) can use the same UX. Auto-save can default to
"silent if reconstruction error ≤ threshold; modal-prompt
above threshold".

## Wire-shape implications

If we ship any of the above, the existing `AnalysisBundleSummary`
needs a new field:

```
uncompressed_byte_size: number
```

So the SPA can display both numbers (your follow-on ask).
Computed backend-side at storage time, where the pre-compression
JSON bytes are visible. The summary's existing `stored_byte_size`
stays as the post-compression count (the value quota sums
against).

`storedScheme` already exists as the discriminator. Growth path:
add new tokens (`json+zstd`, `json+zstd+ownership-delta`, etc.)
to the dispatch on both sides. The 500 `unknown_scheme`
envelope already exists for the case where a client sees a
scheme it can't decode — same fail-loud path covers new schemes
without per-scheme handling at the storage-error layer.

For frontend pre-upload schemes (lossy or delta-encoded),
the wire grows a new content type or a scheme prefix the
backend dispatches on. Cleanest is a new `storedScheme` value
sent in the PUT body's envelope; backend treats unknown values
as the structured 500 today, so we'd add coverage for whatever
schemes we ship.

This is a cross-team dispatch. Drafting that is the gating
step before shipping any wire-shape growth; the dispatch
records the negotiation, and the implementation lands per the
agreed shape.

## Where in the stack

Decision table:

| Scheme | Where it lives | Reason |
|---|---|---|
| A (codec swap) | Backend at-rest | One file; no frontend change |
| B (drop redundant fields) | Frontend pre-upload | The frontend owns the typed shape that defines the schema |
| C (cross-position delta + permutation) | Frontend pre-upload | Needs SGF-traversal context the backend lacks |
| D (sparse policy) | Either, mild preference for frontend | Cleaner if grouped with B |
| E-G (lossy) | Frontend pre-upload | Reconstruction error is part of user consent |

The mixed-stack proposal (A backend-side as the encoding floor;
B+C+D+G frontend-side as the pre-upload transform on top) is
the natural shape if multiple branches earn their weight.

## Experiments shape

In rough cost-to-information-ratio order. Each step is a small
experiment with a numeric output the next step depends on. The
research-DB corpus (or a fresh on-SPA collection) supplies the
inputs.

1. **Bar-setting: gzip vs zstd vs brotli on raw bundles.** Pull
   N final-packet realizations from the research DB, unpickle
   into KataGo-response dicts, serialise as JSON, compress with
   each codec at a few levels. Plot ratio vs CPU time. Output: a
   table of (codec, level) → (ratio, encode-ms, decode-ms). The
   experiment script lives under `research/compression/` or
   wherever fits; it's the kind of one-shot characterisation that
   doesn't need a tensorboard pipeline.

2. **Marginal: drop-redundant-fields.** Same corpus, project
   each packet through the SPA's typed-shape allow-list and
   compress with the winning codec from step 1. Output: a
   (kept-field-set, ratio-improvement) point. Since the typed
   shape *is* the schema, the test is just "how much of the
   bundle is currently unmodelled excess?"

3. **Cross-position delta.** Order the bundle's records by SGF
   traversal, delta-encode each ownership map. The harder
   experiment because it requires constructing a fake "user
   workspace" of N positions from the corpus and serialising
   the resulting bundle. The research corpus's per-position
   realizations aren't a bundle in the SPA sense; we'd reshape
   them.

4. **Lossy uniform quantisation.** Pick a bit-depth (4 bits is
   the obvious first try); quantise, compress, decompress,
   measure ratio AND per-cell reconstruction error distribution.
   Worst-cell histogram is the input to the UX decision.

5. **Lossy PRVQ.** Train codebooks on a held-out chunk of the
   corpus; quantise the rest; same measurements as step 4.
   Compare against uniform — PRVQ's win exists if the marginal
   bit-depth saving exceeds the codebook-storage overhead.

6. **Worst-reconstruction surface mockup.** Build the SPA UX
   that renders an original-vs-reconstructed ownership overlay
   for a specific turn, against fixture data. Get
   user-acceptance feedback on the error representation before
   choosing the L-norm / threshold for the auto-save default.

Each step is its own follow-on; we don't have to commit to all
of them up front. The order is also revisitable — if step 1
shows zstd alone gives 1.6× over gzip, the user-bandwidth
calculus on `analysisAutoSave` shifts and steps 4-5 might wait
until lossless headroom is genuinely exhausted.

### Where the data goes

Per the user's defaults:

- **One-shot characterisation tables / final plots:** `~/plots/`.
- **Iterative training (relevant only for step 5's codebook
  fit, if we get there):** tensorboard at `:6006`, log root
  `/home/bork/w/vdc/tensorboard/`.
- **Re-runnable experiment scripts:** `research/compression/`
  next to the other research/`pg_sink`-consumers, so the
  research-DB connection convention is reused. Long-running
  scripts emit flushed progress with ETA per the user's
  long-running-script discipline.

## Open questions

These are the decisions we'd discuss after the first round of
numbers comes back. Listed here so they don't get lost.

- **Lossy default-on or default-off?** If reconstruction error
  is reliably below a user-imperceptible threshold for typical
  positions, lossy-on by default with the worst-recon surface
  as the consent gate is one shape. Lossy-off by default and a
  registry leaf is the other. Depends on what the worst-recon
  surface actually looks like.
- **At-bundle-level vs at-realization-level lossy decision?** A
  user might want lossy on for casual games and lossless for
  studied ones. Per-bundle override vs single registry leaf is
  a UX question that probably defers until step 6.
- **Bundle-too-large path under lossy.** A bundle that the
  lossless path would 413 on, the lossy path might accept.
  Should the SPA fall back automatically (with user notice)
  or refuse and let the user choose? Smells like the
  fail-loud-on-expensive-ops calibration applies — refuse with
  a structured error pointing at the lossy toggle is the
  better default.
- **Restore semantics when the SPA loads a lossy-saved bundle.**
  The replay path needs to know to reconstruct from the
  quantised representation. `storedScheme` carries this; the
  ledger consumers need to be OK with "this packet has
  approximate ownership". They mostly are (the charts smooth,
  the overlays render); the audit at step 4 confirms.
- **Cross-team:** the dispatch chain probably opens with this
  note as a reference, the cross-team negotiation captures the
  agreed wire-shape, and the experiments-shape above feeds
  whichever schemes the negotiation lands on. Order: numbers
  first, dispatch second.

## What this note isn't

- A schedule. We pick experiments as they make sense; no
  step is on a deadline.
- A formal RFC. The cross-team dispatch is the venue for that
  when one branch crystallises.
- A final design. The whole thing is shaped to be revisitable
  as numbers come back.

License: Public Domain (The Unlicense)
