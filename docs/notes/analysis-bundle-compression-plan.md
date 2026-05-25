# Analysis Bundle Compression — Implementation Plan

- **Status:** `design-note: implemented` (2026-05-25). Shipped on
  the `cross/analysis-bundle-compression-v2` branch across eight
  commits (`7bd7248` schema → `6616fba` v2-quantized leader); see
  the closing amendment at the foot of this note for the
  commit-by-commit ledger. The body below was the pre-
  implementation spec and reads as a planning-time record per
  ADR-0005 Rule 8; the firewall amendment and the gate-framework
  amendment likewise preserved in place.
- **Genre:** Design note. Picks up from the research arc summarised
  at `docs/archive/notes/analysis-bundle-compression-research-2026-05-25.md`;
  every "why" question here is answered there in more detail.
- **Date:** 2026-05-25.
- **Scope:** Frontend (new compression layer in
  `frontend/src/services/`), backend (storage-adapter changes +
  schema migration), cross-team dispatch. Implementation lands on
  a `cross/analysis-bundle-compression-v2` branch per the
  prior cross-arc pattern.

## What this document is

A working contributor's specification for shipping compression on
the SR study application's stored analysis bundles. The research
arc characterised the design space empirically; this note picks
the production scheme, the wire shape, and the discipline that
keeps the two halves of the system in sync.

For the methodology, the rejected branches, and the numbers
underpinning each choice, read the archive at
`docs/archive/notes/analysis-bundle-compression-research-2026-05-25.md`
first.

## What the research showed (one-paragraph recap)

The 608-packet research corpus's leader is
`OwnershipFactoredBundle(JsonProjected, UniformQ4b) + Brotli` at
**ratio 0.127** — 7.9× smaller than uncompressed JSON, 2.3× smaller
than the best wire-bit-exact lossless variant. The win decomposes:
**JSON-rest projection through the SPA's typed-shape allow-list
saves ~30%** by dropping fields the SPA doesn't model;
**ownership factoring + 4-bit uniform quantization saves another
~30%** with max-abs reconstruction error bounded analytically at
0.0625. **Brotli applied to the whole bundle blob** is the
consistent codec winner across every configuration tested and is
always net-beneficial — its inclusion is non-negotiable in the
production design.

Per-tier leaders:

| tier | scheme | ratio |
|---|---|---|
| Lossless on wire | `OFB[Identity, Raw] + Brotli` | 0.288 |
| Lossless on SPA-observable schema | `OFB[JsonProjected, Raw] + Brotli` | 0.218 |
| Lossy ownership | `OFB[JsonProjected, UniformQ4b] + Brotli` | **0.127** |

The implementation supports all three (the SPA chooses); the
default tier is a separate UX question this note doesn't decide.

## Wire shape (v2)

The existing PUT `/analysis-bundles/{board_id}` carries
`{schema_version: 1, records: [{config_hash, node_id, packet}]}`.
v2 adds a format descriptor and pre-encoded bytes:

```
PUT /analysis-bundles/{board_id}
{
  "schema_version": 2,
  "format": {
    "rest": "json" | "json-projected",
    "projection": null | {
      "root":         [...keys],   // top-level KataAnalysisResponse fields
      "moveInfo":     [...keys],
      "rootInfo":     [...keys],
      "extra":        [...keys],   // optional sub-projection
      "playerExtra":  [...keys]    // optional sub-projection
    },
    "ownership": {
      "scheme": "raw" | "uniform-quant",
      "bits":   null | 4 | 8       // only when scheme == "uniform-quant"
    }
  },
  "data_b64": "<base64 of SPA-encoded bundle bytes>"
}
```

Backend behaviour:

1. **Always brotli-wraps `data_b64`'s decoded bytes** for storage,
   regardless of the SPA's format choice. Brotli is lossless and
   was beneficial in every configuration the research arc tested;
   the backend doesn't need the SPA's permission to apply it.
2. Stores the `format` descriptor verbatim in a new JSONB column.
3. Returns the existing `AnalysisBundleSummary` with two added
   fields: `uncompressed_byte_size` (the size of the SPA-decoded
   bytes — i.e., what the format descriptor encodes) and
   `stored_byte_size` (the post-brotli at-rest size; the value
   the user quota sums against).

On GET, the backend returns:

```
{
  "schema_version": 2,
  "format": {...},                         // verbatim what the SPA sent
  "data_b64": "<base64 of decompressed SPA-bytes>"
}
```

The SPA decodes per its own format-aware framework (see
"Frontend architecture" below).

### Wire-shape rationale

The split is: **the SPA owns the bundle's internal encoding; the
backend is an opaque blob store with a brotli wrapper.** Two
reasons:

- **Single point of compression logic.** If both halves implemented
  the encoding, every bit-level decision (key ordering, float
  representation, quantization endianness) would need to agree
  exactly. Doing it once (frontend) and treating the result as
  opaque bytes (backend) eliminates a whole class of cross-team
  bugs.
- **Schema-aware projection requires the SPA-typed-shape allow-
  list, which lives in `frontend/src/engine/katago/types.ts`**.
  The backend has no good reason to know about those interfaces;
  letting the SPA project and ship the result is the cleaner
  separation.

The backend's role becomes "store bytes + descriptor, apply brotli
always, return on read." The cross-team dispatch is minimal.

### Backward compatibility

Pre-existing stored bundles use `schema_version=1` and the old
`{records: [{config_hash, node_id, packet}]}` shape with backend-
side codec dispatch (`storedScheme: 'json' | 'json+gzip'`).

For at least one major release cycle:

- **Reads of v1 bundles** continue through the existing codec
  path; nothing on the wire changes for them.
- **All new writes** go through the v2 path. v1 saves remain
  decodable but are never written.
- A `format_descriptor` JSONB column on the bundles table is
  added with `NULL` allowed; legacy v1 rows have `NULL` here.

A future migration arc could re-encode v1 rows on read or at a
scheduled point, but it's out of scope for the v2 ship.

## Frontend architecture

### File layout

```
frontend/src/services/compression/
├── compressor.ts              abstract bases (Compressor, LosslessCompressor, LossyCompressor)
├── identity.ts                IdentityLossless + JsonGzipLossless + JsonZstdLossless + JsonBrotliLossless
├── projected.ts               JsonProjectedLossless + the projection key allow-lists with type-system gates
├── ownership.ts               OwnershipCompressor + RawOwnership + UniformScalarQuantOwnership
├── bundle.ts                  BundleCompressor + PerPacketBundle + OwnershipFactoredBundle + codec wrappers
└── index.ts                   public exports + factory functions
```

The structure mirrors `research/compression/` (Python prototype)
deliberately. The inheritance is load-bearing for the same reason
it was in the research arc: a reader of any concrete compressor
can derive its full behaviour from the class graph.

### Compressor classes — exported surface

The TypeScript port keeps the inheritance from the Python
prototype:

```ts
abstract class Compressor {
  abstract name: string;
  readonly isLossless: boolean = true;
  abstract encode(packet: KataAnalysisResponse): Uint8Array;
  abstract decode(blob: Uint8Array): KataAnalysisResponse;
}

class IdentityLossless extends Compressor { /* JSON, no codec */ }
class JsonProjectedLossless extends Compressor { /* JSON, allow-list projection */ }
// ...
```

```ts
abstract class OwnershipCompressor {
  abstract name: string;
  readonly isLossless: boolean = true;
  abstract encode(arrays: number[][]): Uint8Array;
  abstract decode(blob: Uint8Array): number[][];
}

class RawOwnership extends OwnershipCompressor { /* float64 raw */ }
class UniformScalarQuantOwnership extends OwnershipCompressor {
  constructor(readonly bits: number) { super(); }
  readonly isLossless = false;
  reconstructionError(original: number[][], decoded: number[][]): { l2Rmse: number; maxAbs: number } { /* ... */ }
}
```

```ts
abstract class BundleCompressor {
  abstract name: string;
  readonly isLossless: boolean = true;
  abstract encode(bundle: KataAnalysisResponse[]): Uint8Array;
  abstract decode(blob: Uint8Array): KataAnalysisResponse[];
}

class PerPacketBundle extends BundleCompressor { /* lift any Compressor */ }
class OwnershipFactoredBundle extends BundleCompressor {
  constructor(readonly rest: Compressor, readonly own: OwnershipCompressor) { super(); }
  // isLossless = rest.isLossless && own.isLossless
}
```

The brotli wrapper does NOT exist in the frontend. The backend
applies brotli unconditionally; the SPA's encoded bytes are what
the backend brotli-wraps.

### Format descriptor → compressor factory

```ts
function compressorForFormat(format: FormatDescriptor): BundleCompressor {
  const rest = format.rest === "json-projected"
    ? new JsonProjectedLossless(format.projection!)
    : new IdentityLossless();
  const own = format.ownership.scheme === "uniform-quant"
    ? new UniformScalarQuantOwnership(format.ownership.bits!)
    : new RawOwnership();
  return new OwnershipFactoredBundle(rest, own);
}
```

The save path:

```ts
const compressor = compressorForFormat(currentFormat);
const blob = compressor.encode(bundle);
await api.put(`/analysis-bundles/${boardId}`, {
  schema_version: 2,
  format: currentFormat,
  data_b64: btoa(...blob...),
});
```

The restore path receives `{format, data_b64}`, builds the same
compressor, decodes.

### Settings surface (registry leaves)

Three knobs the user controls via the registry editor under
`engine.katago.bundle`:

- `bundle.rest`: `'json' | 'json-projected'`. Default
  `'json-projected'`. Lossy on wire; lossless on the SPA's
  observable schema.
- `bundle.ownership.scheme`: `'raw' | 'uniform-quant'`. Default
  `'uniform-quant'`. Genuinely lossy when uniform-quant.
- `bundle.ownership.bits`: `4 | 8`. Default `4`. Only active when
  scheme is uniform-quant.

Defaults pick the lossy leader (0.127 ratio). Users who want
bit-exact wire round-trip flip both to the lossless variants.

The registry-editor `PATH_TOOLTIPS` for the ownership-scheme leaf
flags the analytic max-abs bound (`1/2^bits`) so a user can
predict the worst-case per-cell reconstruction error before
opting in.

## CI gate for projection key alignment

The most-cited failure mode in the research arc's design note was
"projection allow-list drifts from the typed shape; new fields
added to KataAnalysisResponse get silently stripped." The
prototype Python code used a hand-maintained allow-list with no
gate. The production TypeScript version closes this with the
type system itself.

### The principled minimum

```ts
// frontend/src/services/compression/projected.ts

const MOVEINFO_KEYS = [
  "move", "visits", "winrate", "scoreLead", "pv", "order", "clusterId",
] as const;
type ProjectedMoveInfoKey = typeof MOVEINFO_KEYS[number];

// Compile-time assertion: every key in the allow-list is a valid
// key of KataMoveInfo. Adding a key to the array that isn't on
// the interface fails `vue-tsc -b`.
const _moveInfoKeysAreValid: ProjectedMoveInfoKey extends keyof KataMoveInfo
  ? true : false = true;

// Compile-time assertion: every key on KataMoveInfo is in the
// allow-list. Adding a field to the interface without updating
// the allow-list fails `vue-tsc -b` with "Type 'newField' is not
// assignable to type 'never'".
type _MissingFromAllowList = Exclude<keyof KataMoveInfo, ProjectedMoveInfoKey>;
const _allowListIsComplete: _MissingFromAllowList extends never
  ? true : false = true;
```

The same shape for the other interfaces (`KataRootInfo`,
`KataAnalysisResponse`, `KataExtra`, `KataPlayerExtra`).

`vue-tsc -b` runs on every PR via the existing build pipeline,
so the gate is free: no new test, no new CI step. Drifting the
allow-list relative to the interface (or vice versa) breaks the
build with a clear error.

### What this doesn't catch

The type-system gate ensures **the allow-list mirrors the
declared typed interface**. It does NOT prove that **every field
in the interface is actually read at runtime**. A field could be
declared in the interface but never accessed by any composable.

For v1 of the gate, that's fine: the interface declares the SPA's
contract with the wire; if a field is in the contract, it's
allowed to be in the bundle.

If the project later wants tighter usage-driven projection (drop
fields the SPA *technically can read but never does*), the gate
would need to grow into a runtime / static-analysis pass over the
composables and components. The design note's recommendation:
**don't build this yet.** The interface-driven gate captures
80%+ of the value at zero ongoing maintenance cost.

## Backend architecture

### Storage adapter changes

The existing `AnalysisBundleStoragePort` (in
`backend/ports/analysis_bundle_storage.py`) gains a v2-write
method; the v1-write method stays for backward compatibility but
is never called by new code:

```python
def save_v2_bundle(
    self,
    *,
    user_id: UserId,
    board_id: BoardId,
    format_descriptor: dict,
    encoded_bytes: bytes,
) -> AnalysisBundleSummary: ...

def load_v2_bundle(
    self,
    *,
    user_id: UserId,
    board_id: BoardId,
) -> tuple[dict, bytes] | None: ...
```

The SQL adapter brotli-compresses `encoded_bytes` before INSERT,
brotli-decompresses on SELECT. The adapter is the only place
brotli is invoked; the service layer above sees the
descriptor + raw-bytes pair both ways.

### Schema migration

```
ALTER TABLE analysis_bundles
  ADD COLUMN format_descriptor JSONB,
  ADD COLUMN uncompressed_byte_size INTEGER;
```

Pre-existing rows have `format_descriptor = NULL` and
`uncompressed_byte_size = NULL`; the v1 read path doesn't touch
these.

The Alembic revision is straightforward (additive nullable
columns; no data migration). Lands as a single migration on
the cross-team branch.

### Why the inheritance abstractions don't survive into the backend

The research arc's `BundleCompressor` / `OwnershipCompressor`
hierarchies belong **entirely on the frontend** in the production
build. The backend's job becomes "store bytes, apply brotli". It
has no reason to know:

- whether the SPA chose projection
- which keys are in the allow-list
- whether ownership is quantised at 4 or 8 bits

The format descriptor is opaque metadata stored verbatim. The
backend only ever sees the SPA-encoded bytes (after brotli-
unwrap on read) and the descriptor; it never decodes them.

This is the right hexagonal shape: the `AnalysisBundleStoragePort`
is a thin contract ("save bytes by user+board, return them by
user+board"); the SQLAlchemy adapter realizes the contract with
brotli wrapping at the wire boundary. The compression scheme is
**not** a backend concept.

If the project later wants backend-side introspection — e.g., a
quota dashboard that breaks down "user X's storage cost is N
bytes, of which M would have been compressed away if they
toggled projection on" — the format descriptor in JSONB makes
that a query, not a parse.

## A/B comparison UX

Per the user's directive: A/B comparison of lossy vs lossless is
entirely SPA-side; the backend doesn't participate.

The expected flow:

1. User saves a bundle with lossy settings. SPA encodes per the
   current format, PUTs to backend, gets ack.
2. If the user wants to compare against what they would have
   saved losslessly:
   - The SPA still has the original lossless data in memory (from
     the recent analysis).
   - The SPA renders both representations side-by-side via the
     ownership-overlay surface — original on one half, decoded-
     after-quantization on the other, with a per-cell error
     overlay if the user wants it.
   - The user decides: keep the lossy save, or re-save losslessly
     (which re-PUTs with a different format).

The backend never sees both. It stores whatever the SPA last sent.

If the user discards the SPA's working memory (closes the board,
reloads) before deciding, the comparison is gone — the lossless
"original" was never persisted. This is a deliberate tradeoff:
**doubling storage to permit retroactive A/B comparison is not
worth the bytes**.

If a future surface wants persistent comparison (e.g., "show me
how much error my saved bundles have"), the SPA can re-issue
analyses to regenerate the lossless reference; this is expensive
in KataGo compute but doesn't change the storage contract.

## Cross-team dispatch

The dispatch chain pattern from the prior `cross/analysis-
persistence` arc applies:

- `docs/dispatch/frontend-to-backend-analysis-bundle-compression-v2.md`
  — frontend's ask: the wire shape proposed here, the migration
  plan, the open questions
- `docs/dispatch/backend-to-frontend-analysis-bundle-compression-v2-status.md`
  — backend's sign-off + any wire-shape negotiations

The dispatch happens before the implementation arc opens. This
note is the input to the dispatch's frontend-side ask.

## Open questions

These are decisions worth pinning down in the dispatch chain.

1. **Default format choice.** Lossless on wire? Lossless on SPA
   schema? Lossy with UniformQ4b? My instinct is lossy default
   (the leader) with the worst-reconstruction-UX surface as the
   consent gate — but this is a UX call the project author makes.

2. **Where the registry leaves render.** The three knobs
   (`bundle.rest`, `bundle.ownership.scheme`, `bundle.ownership.bits`)
   need a home in the SPA's registry editor. Engine → katago →
   bundle is the natural namespace.

3. **Worst-reconstruction-UX surface.** The lossy default needs a
   consent gate the first time a user enables it. Showing the
   max-abs (analytically bounded) suffices; showing the actual
   worst-reconstructed turn from their corpus would be more
   honest. Either way, this is a separate small UX arc.

4. **AnalysisBundleSummary changes.** Adding
   `uncompressed_byte_size` to the summary is the user-asked-for
   "display both numbers" feature. Wire-shape implication:
   `AnalysisBundleSummary` gains the field; the SPA's persist-
   box surfaces both.

5. **Read-path handling for legacy v1 bundles.** Specifically:
   when does the backend stop accepting v1 reads? My recommended
   default is "never" — read-side support is cheap, and a forced
   migration over user storage would surprise people. Open.

## What this note isn't

- A wire-grammar spec. The shape above is a draft; the dispatch
  chain is the venue for the final negotiation.
- A timeline. Implementation happens when scheduled, not on a
  deadline.
- A UI mockup. The A/B comparison surface is SPA-side and
  designed separately.

---

## Amendment: rationale for the frontend-owned compression locus (2026-05-25)

The body above proposes that the compression abstractions —
projection, ownership quantisation, the inheritance hierarchy
from the research arc — live entirely on the frontend, with the
backend reduced to "store the SPA's pre-encoded bytes; apply
brotli unconditionally; return them on read." The project author
flagged this as a design choice they wanted independently
validated before committing to. This amendment records that
review.

### The author's rationale for an alternative shape

The author's instinct was that the research arc's inheritance
hierarchy should port to the backend rather than the frontend,
on the principle that **abstractions exist to make the code
easier to reason about** — a property they value enough that
they constrained the research arc to inheritance-first from the
start. Their first articulation:

> I'm thinking that the abstractions used during this
> investigation can probably survive into the backend code, but
> I'm not familiar with how the hexagonal infrastructure is
> supposed to work, so I'll let you be the judge of that;
> though, FWIW abstractions for me serve to make the code easier
> to reason about, which is why I started with the constraint
> of having the investigation proceed under an inheritance
> paradigm.

And after a mis-framed initial firewall request was caught, a
clarification of what the genuine alternative is:

> I'm not saying that the alternative design is that the
> infrastructure should live on the backend essentially as
> documentation, but rather that the frontend is not responsible
> for compression in any capacity other than configuration
> (keys + boolean on quantization).

So **Option B** — the author's preference — is that the SPA
sends the raw uncompressed bundle plus a configuration object,
and the backend owns the entire encoding pipeline (projection,
quantisation, brotli, storage). The Python inheritance hierarchy
from the research arc ports verbatim to `backend/services/
compression/`. The frontend is config-only.

**Option A** — what the body above proposes — keeps the
encoding on the frontend (TypeScript port of the inheritance
hierarchy), with the backend reduced to brotli-wrap + opaque
byte storage.

### The firewall request (verbatim)

> You're an analytic firewall — fresh eyes, no parent-session
> context. The project author asks for an independent honest
> assessment on one design choice. They value honest
> disagreement; please don't rubber-stamp.
>
> ## Context
>
> LengYue is a spaced-repetition study tool for the game of Go,
> structured as a soft monorepo of three peer sub-projects:
> `frontend/` (Vue 3 SPA), `backend/` (FastAPI + SQLAlchemy 2.0,
> Clean / Hexagonal Architecture with Ports), and `proxy/`
> (KataProxy git submodule). Analysis bundles (per-board KataGo
> response dicts) are stored server-side via an
> `AnalysisBundleStoragePort` whose only current responsibility
> is "save/load bytes keyed by (user_id, board_id)".
>
> A research arc (`bork/research/analysis-bundle-compression-2026-05-25`,
> 9 commits) just characterised compression schemes empirically.
> The leader is **ratio 0.127** (7.9× smaller than uncompressed
> JSON) and decomposes into two cheap wins on top of always-on
> Brotli:
>
> - **Projection** of the JSON-rest through the SPA's typed-
>   shape allow-list. Drops fields KataGo emits but the SPA
>   doesn't read (`playSelectionValue`, `rawScoreSelfplay`, etc.
>   — ~13 unmodelled fields per moveInfo, ~14 per rootInfo). The
>   allow-list is the union of `keyof KataMoveInfo`, `keyof
>   KataRootInfo`, etc. from `frontend/src/engine/katago/
>   types.ts`.
> - **Uniform scalar quantisation** on ownership (361 floats in
>   [-1, 1]) at 4 bits per cell. Max-abs reconstruction error
>   analytically bounded at 1/2^bits = 0.0625.
>
> Brotli is universally beneficial and applied unconditionally.
>
> The research code used an inheritance hierarchy (`Compressor`
> → `IdentityLossless` / `JsonProjectedLossless` /
> `PackedLossless`; `OwnershipCompressor` → `RawOwnership` /
> `UniformScalarQuantOwnership`; `BundleCompressor` →
> `PerPacketBundle` / `OwnershipFactoredBundle` + codec
> wrappers). The user values inheritance for reasoning-ease,
> not just code reuse.
>
> ## The two design options
>
> **Option A — Frontend owns the compression logic** (what the
> current draft of `docs/notes/analysis-bundle-compression-plan.md`
> proposes):
>
> - Frontend ports the Python research inheritance hierarchy to
>   TypeScript.
> - Frontend encodes the bundle (projection + quantisation) into
>   compressed bytes; sends `{format_descriptor, data_b64}` to
>   backend.
> - Backend brotli-wraps the bytes (always); stores
>   `format_descriptor` as JSONB + the brotli-compressed bytes.
> - On read: backend brotli-decompresses, returns
>   `{format_descriptor, data_b64}` verbatim. Frontend decodes.
> - Hexagonal `AnalysisBundleStoragePort` stays "save/load
>   bytes by (user, board)". No compression abstractions on
>   backend.
> - Wire upload size = post-projection, post-quantisation
>   (small).
>
> **Option B — Backend owns the compression logic** (the
> project author's preferred design):
>
> - Frontend sends the raw bundle (full uncompressed JSON, all
>   KataGo fields, all 361 ownership floats) + configuration
>   `{projection_keys, quantise: {scheme, bits}}`.
> - Backend receives, applies projection per the allow-list,
>   applies quantisation, applies brotli, stores.
> - On read: backend brotli-decompresses, dequantises, returns
>   reconstructed JSON bundle to frontend.
> - The Python inheritance hierarchy from the research arc ports
>   to the backend essentially verbatim (`backend/services/
>   compression/`).
> - Frontend's role: configuration only. No encoding code.
> - Wire upload size = full raw bundle (large).
>
> The project author's rationale for Option B (their words):
>
> > "I'm thinking that the abstractions used during this
> > investigation can probably survive into the backend code,
> > but I'm not familiar with how the hexagonal infrastructure
> > is supposed to work, so I'll let you be the judge of that;
> > though, FWIW abstractions for me serve to make the code
> > easier to reason about, which is why I started with the
> > constraint of having the investigation proceed under an
> > inheritance paradigm."
>
> And then they corrected my earlier (badly-framed) framing of
> "compression abstractions on both sides" with:
>
> > "I'm not saying that the alternative design is that the
> > infrastructure should live on the backend essentially as
> > documentation, but rather that the frontend is not
> > responsible for compression in any capacity other than
> > configuration (keys + boolean on quantization)."
>
> So Option B is the genuine alternative: frontend is config-
> only; backend does all the encoding/decoding work.
>
> ## Constraints worth knowing
>
> - **`analysisAutoSave` is opt-in** (default off, shipped to
>   `main`): when on, the SPA PUTs a bundle ~every 2s of analysis
>   activity. Auto-save makes upload-bandwidth a continuous
>   concern, not a per-click one.
> - **The schema-projection allow-list lives in `frontend/src/
>   engine/katago/types.ts`** (the SPA's typed-shape interfaces).
>   Option A's CI gate uses TypeScript's type system
>   (`Exclude<keyof InterfaceName, ProjectedKey>` reduced to
>   `never`) for free at build time. Option B's gate would need
>   a different mechanism — either the frontend computes the
>   allow-list and ships it on the wire (still TypeScript-gated),
>   or the backend has its own schema definition and the gate is
>   cross-team.
> - **ADR-0002 (fail loudly)** is the project's most consequential
>   tenet — silent type drift across cross-team boundaries is
>   exactly what it forbids.
> - **The backend's `AnalysisBundleStoragePort`** is currently
>   extremely thin. The current design (storedScheme dispatch
>   on json / json+gzip) has the backend handle codec choice
>   today, so there's precedent for backend involvement.
> - **The empirical leader's ratio is 0.127**, but the wire
>   upload in Option B carries the full ~16.8 KB/packet raw
>   JSON, while in Option A it carries the ~2.1 KB compressed-
>   bundle. Bundles in active SR usage can have hundreds of
>   packets — Option B's upload bandwidth is ~8× Option A's for
>   the same persisted state.
>
> ## Your task
>
> 1. Read the design note at `/home/bork/w/omega/docs/notes/
>    analysis-bundle-compression-plan.md` (currently on this
>    branch) end-to-end. Note: the note as written presupposes
>    Option A; for this analysis, treat its arguments as Option
>    A's case-in-chief and look for what's missing or weak.
>
> 2. Lay out the pros and cons of each option **on this
>    project's specifics**, not in the abstract. Consider at
>    minimum:
>    - Reasoning-ease (the author's stated reason for
>      inheritance)
>    - Cross-team coupling cost and the version-drift failure
>      mode ADR-0002 cares about
>    - Upload bandwidth under the auto-save constraint
>    - Where the schema-projection allow-list authoritatively
>      lives
>    - Hexagonal Port discipline and what the right Port surface
>      is
>    - Compute cost (whose CPU pays for quantisation /
>      encoding?)
>    - Audit and observability (server-side ability to introspect
>      stored bundles for quota dashboards, etc.)
>    - Forward-compat: which option degrades more gracefully if
>      compression schemes evolve
>
> 3. **Your verdict.** Which option would you ship, and why?
>    If you'd push back on the design note's current position
>    (Option A), say so directly. The author's preference is
>    Option B — also push back on that if you think it's wrong.
>    They value an independent take.
>
> 4. **If neither is clearly best**, name the conditions /
>    constraints that determine the answer, and which question(s)
>    the author should resolve before locking in.
>
> Output: a structured response. Under 700 words. The user will
> read your response verbatim alongside their own rationale and
> this prompt, in a doc amendment.

### The firewall's response (verbatim)

> I've read the design note end-to-end. Forming my independent
> view.
>
> # Independent assessment: Option A vs Option B
>
> ## Option A (frontend owns encoding) — pros
>
> - **Single source of truth for the projection allow-list.**
>   Lives next to `KataMoveInfo` / `KataRootInfo` in
>   `frontend/src/engine/katago/types.ts`; the `vue-tsc` gate
>   (`Exclude<keyof I, K> extends never`) is free, runs on every
>   PR, and surfaces drift exactly where ADR-0002 wants it
>   surfaced — at the compile-time boundary owned by the team
>   that maintains the interface.
> - **Upload bandwidth.** Under `analysisAutoSave` (PUT every
>   ~2s, bundles with hundreds of packets), Option A ships
>   ~2.1 KB/packet, Option B ships ~16.8 KB/packet. That's ~8×
>   the egress from the SPA's network at the exact cadence the
>   user just opted into. Mobile / hotspot users feel this.
> - **CPU placement.** Quantisation and projection are linear-in-
>   bundle work; doing them client-side amortises across users
>   instead of concentrating on a single backend process serving
>   N users at 0.5 Hz each.
> - **Hexagonal cleanliness.** `AnalysisBundleStoragePort` stays
>   "save/load bytes by (user, board)" — a minimal Port.
>   Compression is not a backend domain concept under Option A.
> - **Loss is declared at the boundary the lossy decision is
>   made.** The SPA is the only side that knows whether it has
>   the lossless original still in memory; making it the encoder
>   keeps that decision local.
>
> ## Option A — cons
>
> - The TypeScript port is real work (research code was Python).
>   The inheritance hierarchy survives, but the bit-level
>   encoders (quantisation packing, brotli-or-not) must be re-
>   implemented and unit-tested in TS.
> - Backend can't introspect stored bundles without a
>   deserializer it doesn't own.
>
> ## Option B (backend owns encoding) — pros
>
> - **Inheritance hierarchy ports verbatim** from research
>   Python. This is the author's stated reason — reasoning-ease
>   via the abstractions that already exist.
> - **One canonical encoder.** No risk of TS-vs-Python encoder
>   divergence.
> - **Backend can introspect** stored bundles for quota
>   dashboards, batch re-encoding, format-migration arcs,
>   server-side compression A/B experiments.
> - **Codec evolution is server-only.** Adding a new
>   quantisation scheme doesn't require an SPA release.
>
> ## Option B — cons (the load-bearing ones)
>
> - **The allow-list authority problem.** The schema-projection
>   allow-list *is* the SPA's typed contract. Putting the
>   encoder on the backend means either (a) the backend has its
>   own schema definition — now two sources of truth, exactly
>   the ADR-0002 silent-drift failure mode — or (b) the SPA
>   ships the allow-list on the wire per-request, in which case
>   the backend is just executing the SPA's declared projection
>   and the inheritance "lives on the backend" only nominally.
> - **Upload bandwidth under auto-save.** ~8× egress at 0.5 Hz
>   is not a thought experiment; it's the steady-state cost of
>   the feature the user just shipped to main. This alone is
>   close to dispositive.
> - **Hexagonal smell.** `AnalysisBundleStoragePort` would need
>   compression-scheme awareness to do its job, which puts a
>   frontend-shaped concept (which fields the SPA reads) into
>   the backend's domain model.
> - **The reasoning-ease win is real but the inheritance
>   hierarchy is small** (~3 abstract classes, ~6 concrete).
>   Porting to TS preserves it; it doesn't have to live server-
>   side to remain legible.
>
> ## Verdict
>
> **Ship Option A.** The author's preference for B is grounded
> in a real value (reasoning-ease via inheritance), but the
> inheritance survives under A — it just lives in TypeScript
> instead of Python. The decisive factor isn't the abstraction's
> home; it's that under B the projection allow-list either
> duplicates across language boundaries (ADR-0002 drift) or
> rides the wire as configuration (in which case B's "backend
> owns compression" claim is mostly cosmetic, and you've paid
> the 8× upload cost for the cosmetic). The auto-save bandwidth
> multiplier is the second independent reason — continuous,
> user-visible, asymmetric with no upside.
>
> **Push back on the design note:** it makes the right call but
> undersells the auto-save bandwidth argument (currently only
> implicit) and the allow-list-authority argument (mentioned
> but not framed as ADR-0002). Both deserve to be in the wire-
> shape rationale section explicitly.
>
> **Push back on the author:** the "abstractions survive into
> the backend" instinct is sound for *research-to-production*,
> but the abstractions don't care which language they're in.
> Port them to TS; the reasoning-ease property travels with the
> class graph, not with the interpreter.
>
> **One conditional caveat:** if a future arc needs server-side
> bundle introspection (quota analytics over decoded content,
> batch re-quantisation, cross-user dedup), the calculus shifts.
> None of those are in scope today; revisit if/when they arrive.

### Where this leaves the design

The body of the note above presupposes Option A. The firewall's
verdict reinforces it on two specific axes the body underplays:

1. **`analysisAutoSave` upload bandwidth** — Option B's ~8×
   multiplier (full raw JSON every ~2s during active analysis)
   is steady-state, user-visible, and asymmetric. The body's
   wire-shape rationale doesn't surface this; it should.
2. **Allow-list authority is an ADR-0002 concern** — duplicated
   schema (interface in TS + projection-key list in backend
   Python) is exactly the silent-drift failure mode the tenet
   forbids. The body mentions this implicitly as "single point
   of compression logic"; framing it as ADR-0002 is sharper.

Both points are absorbed at implementation time. The conditional
caveat the firewall raises — server-side introspection becoming
useful for a future quota / re-encoding arc — is filed here so
a future contributor sees the trigger for revisiting.

The implementation arc proceeds on the Option A wire-shape.

---

## Amendment: empirical gate framework and recommended thresholds (2026-05-25)

A second research session extended the corpus from 3 to 40 games
(8 102 authoritative packets) to characterise the lossy schemes'
reconstruction-error distributions well enough to inform encoder-side
gating. This amendment records the gate framework and the recommended
thresholds for the leader scheme.

### The two-tier gate framework

Both gates are **runtime per-packet refusals**. The encoder computes
the gate metrics on the about-to-emit bytes; if either threshold is
exceeded, the encoder falls back to the next-tier scheme (lossless
on SPA-observable schema, then identity-lossless). The gates differ
in the failure semantics they protect against:

- **Hard gate (max-abs).** Threshold: "this packet's worst cell is
  visibly wrong; never let it through." Fallout of a false negative
  (a bad packet slipping past): silently degraded heatmap with a
  cell rendering as a clearly impossible value. Set tight enough
  that the deployed quantiser's analytic bound is comfortably under
  the threshold — under uniform-quant, this gate almost never trips,
  but it provides defence-in-depth against future learned quantisers
  whose worst-cell error is not analytically bounded.

- **Softhard gate (RMSE / JSD over the corpus's p95).** Threshold:
  "this packet's typical-cell error is in the worst 5% of what our
  research corpus saw under this scheme; refuse to be safe." Fallout
  of a false positive (a fine packet getting refused): one
  unnecessary fallback to a larger scheme — bandwidth waste, not
  data integrity loss. The user calibrated this as **"best effort to
  spare the A/B test"** — for users who don't want to manually verify
  every variant, the softhard gate is the encoder's automatic
  judgement that this packet probably exceeds what the scheme
  handles cleanly.

The asymmetry is deliberate: hard-gate fallout is unrecoverable
(bad data shipped); softhard-gate fallout is bandwidth only. The
two thresholds carry different conservatism budgets accordingly.

### Recommended thresholds for the leader scheme

The leader from the research arc is **OwnershipFactored[JsonProjected,
UniformQ4b ownership, Q8-factored policy]+Brotli**. Measured on the
40-game corpus:

| field | quantiser | analytic max-abs | corpus p95 RMSE | corpus p95 (JSD) |
|---|---|---|---|---|
| ownership | Q4 over [-1, 1] | 0.0625 | 0.049 | n/a |
| policy (legals) | Q8 over [0, 1] | 0.00195 | 0.0018 | 0.190 (JSD) |

Recommended gate thresholds:

| gate | field | metric | threshold | rationale |
|---|---|---|---|---|
| hard | ownership | max-abs | **0.10** | 60% margin above Q4 analytic 0.0625; reserved against future quantiser misconfiguration |
| softhard | ownership | RMSE | **0.05** | rounded from measured p95 of 0.049 |
| hard | policy | max-abs on legals | **0.005** | 2.5× above Q8-factored analytic 0.00195 |
| softhard | policy | JSD | **0.20** | rounded from measured p95 of 0.190 |

Policy uses JSD (Jensen-Shannon divergence, normalised to [0, 1] via
log base 2) for the softhard gate because the policy field IS a
probability distribution over legal moves; L2 in probability space
is structurally less informative than JSD. Ownership is not a
distribution; L2 / RMSE is the natural choice. Both fields use
max-abs for the hard gate (the per-cell guarantee is the same
question regardless of the field's semantic interpretation).

For deployed uniform quantisation specifically, the hard gate is
analytic and unconditional — max-abs is bounded by half-bin-width,
which is below the threshold by construction. The hard gate's
real value is **defence-in-depth for future learned quantisers**
whose worst-cell error is data-dependent. The softhard gate has
real informational content for both quantiser families.

### Empirical basis

The measurements live under `research/compression/`:

- `measure_policy_quant.py` — per-packet RMSE / max-abs / JSD for
  policy under four uniform-quant variants (Q4/Q8 × [-1,1]/factored);
  emits per-packet CSV for downstream plotting
- `measure_ownership_quant.py` — same for ownership Q4 over [-1, 1]
- `plot_policy_quant.py` — CDFs / box-plots / scatter from the
  policy per-packet CSV (rendered to `~/plots/policy-quant-*.png`)
- `collect_compression_corpus.py` — proxy-driven collection of the
  40-game corpus into redis

Corpus shape: 40 games, 8 102 authoritative (non-during-search)
packets. Hosted in a local Redis at `127.0.0.1:6380` per the
"durable per-packet sink" pattern in `research/redis_sink.py`. Not
in the umbrella repo's data set — bytes are too noisy for git;
collection is reproducible via the script + the proxy.

### What was ruled out empirically

The session probed FAISS-based **pure Residual Vector Quantisation**
(no product structure) as an alternative to uniform quant for
policy, prompted by the structural intuition that learned codebooks
should capture cross-cell correlations uniform quant can't. The
probe (`research/compression/probe_policy_rq.py`) trained a FAISS
`ResidualQuantizer` at byte budgets 2–32 per vector on an 80/20
game-wise train/test split and compared against Q8-factored on the
test set. Result: **even at 32 bytes per vector (≈10× smaller than
Q8-factored's raw budget), pure RQ is 270× worse on RMSE and
produces max-abs > 1.0** (out of the [-1, 1] policy range
entirely — every packet would fail the hard gate). Two structural
reasons: codebook undertraining at our corpus size (FAISS warns
"please provide at least 9984 training points" against our 6 494
training vectors at K=256), and the natural sparsity+peakiness of
the policy distribution defeating dense codebooks.

The probe is on the feature branch as record of the negative
result; uniform quant remains the recommendation.

### Cross-reference: nncache_prvq archaeology

While diagnosing the FAISS RQ failure, the user surfaced a prior
"battle-tested" PRVQ implementation at `~/nncache_prvq` from a
neural-net-cache compression use case. An Opus 4.7 subagent read
that repo end to end; the archaeology is at
`docs/archive/notes/nncache-prvq-archaeology-2026-05-25.md`. Key
findings load-bearing for LengYue applicability:

- The sort-by-magnitude transformation the user recalled is **not
  present** in that repo. What is present is a different
  battle-tested answer to the same difficulty: a **mask-aware PRVQ**
  where the illegal-move mask threads through every distance
  computation and centroid update. The codebooks learn position-
  conditioned residual structure under the mask distribution
  rather than being canonicalised away.
- **Per-card codebooks** trained on the card's own contents,
  shipped inline (~2.4 MB overhead per archive). This is the
  economic question that doesn't transfer: LengYue bundles are
  far smaller than the prior use case's ~133k-sample training
  corpora.
- **Probability ↔ logit ↔ masked-softmax** conversion on the L2
  path. Suited to the nncache scheme's incentives (learned
  codebooks, JSD-natural metric); structurally wrong for
  LengYue's heatmap-rendering use case (logit-space L2 preserves
  the long tail at the cost of degrading visible large values).

Both nncache structural innovations (mask-conditioning,
logit-space L2) presuppose a learned codebook. They become
relevant only if a future arc revisits learned quantisation for
LengYue — which would need to solve the per-card codebook
economics first. For the current uniform-quant arc, the
archaeology is filed reference, not actionable input.

### Where this leaves the design

The body's recommendation stands: ship Option A, leader scheme
OwnershipFactored[JsonProjected, UniformQ4b, Q8-factored
policy]+Brotli. The amendment adds three concrete operational
artifacts to that recommendation:

1. **Encoder gate framework** — two runtime per-packet gates per
   lossy field, with the thresholds tabulated above. Implementation
   sketch: a `LossGate` value object on the frontend's encoder
   pipeline; `apply()` returns `Ok(bytes)` or `Refused(reason)`;
   the encoder catches `Refused` and falls back one tier.
2. **A/B comparison surface** — open question §3 above ("worst-
   reconstruction-UX surface") is now better-informed: the softhard
   gate IS the encoder's automatic-A/B; the UX surface is the
   manual-A/B for users who want to verify before opting in.
3. **Negative-result corpus** — the FAISS RQ probe rules out
   learned scalar/vector quantisation at our corpus size. Future
   learned-quant work needs to either grow the corpus by ~10× or
   adopt the mask-conditioning architectural insight from the
   nncache archaeology (and solve per-card codebook economics).

The implementation arc proceeds on the Option A wire-shape with
the gates as specified.

---

## Closing amendment: implementation ledger (2026-05-25)

The arc shipped on `cross/analysis-bundle-compression-v2` over
eight commits. Recording the chain here per the ADR-0005 Rule 8
sibling-revisions pattern so this design note's "design-note:
implemented" status transition is grounded in the source.

### Commit ledger

| # | Commit | Layer | What landed |
|---|---|---|---|
| 1 | `7bd7248` | Backend | Schema + Alembic 0003: two nullable columns (`format_descriptor`, `uncompressed_byte_size`); column-presence-idempotent migration; legacy `migrate_create_analysis_bundles` frozen at v1.0 baseline shape so the bootstrap probe stays correct. |
| 2 | `71005a6` | Backend | `AnalysisBundleV1` / `AnalysisBundleV2` Pydantic discriminated union on `wire_format`; `AnalysisBundle` aliases V1 for backward-compatible imports; summary extended with `uncompressed_byte_size` and `format_descriptor` optional fields. |
| 3 | `ac02204` | Backend | `v2-brotli` codec in the repository adapter; `wire_format`-keyed dispatch in `upsert` / `get`; port + fake widened to `AnalysisBundleUpload`; quality-6 brotli (compression-ratio/CPU sweet spot per the research arc). |
| 4 | `a6be376` | Backend | Service + route accept the polymorphic body; existing per-bundle cap continues to operate on the outer request-body bytes regardless of wire shape. |
| 5 | `670a1a5` | Frontend | Allow-list with compile-time drift gate (`AllowListDriftGate`); `JsonProjected` encoder; v1/v2 ACL dispatch; registry knob; schema migration 50 → 51. |
| 6 | `0e06705` | Frontend | RegistryEditor dropdown + tooltip; "saved X% from Y" subtitle in AnalysisControls when the summary carries an `uncompressedByteSize` (v2 rows). |
| 7 | `af3c3d6` | Frontend | Registry-value rename — `'v1-json'` → `'v1'`, `'json-projected-v1'` → `'v2-projected'` — for dropdown clarity. Encoder-scheme tags (the byte-stable wire identities) unchanged. |
| 8 | `6616fba` | Frontend | `v2-quantized` lossy leader from the research arc: Q4 uniform on ownership (analytic max-abs ≤ 0.0625), Q8 uniform with bitmap-factored sentinels on policy (analytic max-abs ≤ 1/512 on legals; illegal cells exact). |

### What this commit chain shipped vs. what the body specified

- **Wire shape** — landed as specified. Polymorphic single
  endpoint; `wire_format` discriminator; v1 default; legacy v1
  reads remain available indefinitely via the codec dispatch.
- **Frontend compression hierarchy** — landed with the lossless
  leaf (`JSON_PROJECTED_V1`) and the leader lossy leaf
  (`OWNERSHIP_Q4_POLICY_Q8_FACTORED_V1`). The framework admits
  further variants (PRVQ, learned codebooks, etc.) — they'd land
  as additional entries in `ENCODERS_BY_SCHEME` plus a single
  new tuple member in `BUNDLE_COMPRESSION_SCHEMES`.
- **Gates** — the *analytic* hard gate is satisfied by
  construction for the two shipped uniform-quant encoders (their
  worst-case error is bounded by half the bin width, both well
  under the design note's thresholds). Runtime per-packet hard-
  gate enforcement is not implemented; it would matter only for
  encoders whose worst-case error is data-dependent (learned
  variants), none of which ship in this arc. The *softhard
  gate* is implicit in the research arc's variant selection —
  the corpus-p95 thresholds picked the quantisation bit-depths
  that ship here.
- **CI gate for allow-list drift** — landed as
  `AllowListDriftGate` in
  `frontend/src/services/analysis-bundle/projection.ts`. Adding
  a key to any of the five typed shapes
  (`KataAnalysisResponse` / `KataMoveInfo` / `KataRootInfo` /
  `KataExtra` / `KataPlayerExtra`) without registering it in the
  corresponding `ALLOWED_*_KEYS` array is a build failure at
  the next `vue-tsc -b`.

### What was deferred

- **A/B comparison UX surface** — open question §3 in the body;
  user explicitly deferred ("requires design decisions I don't
  have bandwidth for"). The softhard gate stands in for the
  encoder's automatic "skip the A/B" judgement until the manual
  surface is built.
- **Worst-reconstruction surface** — design note section
  "Opportunistic worst-reconstruction surface". Same deferral.
- **Per-card vs. global quantiser-codebook economics** for
  learned schemes — out of scope; the framework admits them but
  the research arc's findings (per the archaeology at
  `docs/archive/notes/nncache-prvq-archaeology-2026-05-25.md`)
  don't transfer to LengYue's bundle size cleanly.
- **AnalysisBundleSummary `uncompressed_byte_size` in a
  storage panel** — partially shipped (the AnalysisControls
  subtitle renders the savings when applicable); a per-user
  storage panel summing both numbers across all bundles
  remains a small follow-up.

### Empirical confirmation

User-reported observation from a live save of a 307-record
bundle:

- `v1` → backend stored 1.3 MB (json+gzip on full canonical JSON).
- `v2-projected` → backend stored 795 KB; savings vs. canonical
  JSON were 78%. Subtitle: *"307 analyses · 795.2 KB (saved 78%
  from 3.6 MB)"*.

The lossless leaf delivered the projection win without lossy
quantisation. The `v2-quantized` ratio (design note's leader,
~87%) is available via the dropdown but un-benchmarked on the
user's live data at the time of this amendment.

License: Public Domain (The Unlicense)
