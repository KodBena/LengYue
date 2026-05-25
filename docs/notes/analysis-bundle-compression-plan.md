# Analysis Bundle Compression — Implementation Plan

- **Status:** Open. Pre-implementation. Specifies the wire-shape,
  frontend framework, backend storage adapter, and CI gate for an
  upcoming cross-team arc to land compression on
  `analysis-persistence-service`.
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

License: Public Domain (The Unlicense)
