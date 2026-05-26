# `v2-quantized-hifi-xor` — Q8 ownership + byte-XOR delta on the SPA wire

- **Status:** Shipped via PR #272 (commit `355b1e2` on
  `frontend/analysis-bundle-hifi-xor`), merged to `main`
  2026-05-26. The user-facing registry value
  `'v2-quantized-hifi-xor'` is the fifth entry under the
  analysis-bundle compression scheme dropdown; the encoder
  scheme tag `'ownership-q8-policy-q8-factored-xor-v1'` is
  the byte-stable forever value stored in
  `format_descriptor.scheme`.
- **Genre:** Lossy-encoder addition. Follows the
  recipe in the now-struck TODO entry derived from the
  saturation-arc findings (see sibling worklog
  `2026-05-26-compression-arc-saturation.md`). No backend
  changes; the SPA's emitted bytes change shape, the backend
  applies brotli unconditionally over whatever bytes the SPA
  sends, the new `format_descriptor.scheme` value gets
  stored verbatim.
- **Date:** 2026-05-26.

## Context

The 2026-05-26 saturation arc — same date, paired worklog
above — measured a single Pareto-improving operating point
against `v2-quantized-hifi` (Q8 ownership): byte-XOR delta on
the Q8 ownership wire. The framework's run report
(`research/compression/framework/baselines_report_2026-05-26.txt`)
measured ~23% post-brotli savings on the 40-game corpus
(1 656 KB vs 2 164 KB for plain hifi). The savings come from
brotli's literal-zero detection on the XOR'd byte stream — at
Q8 (one byte per cell), consecutive packets sharing the same
Q8 bin produce identical bytes, and XOR produces zero bytes
brotli compresses aggressively.

The asymmetry with Q4 (where the same trick yielded only
~4%) is the technical content: at Q4, byte-level identity
requires both nibble-paired cells to match, so the
zero-byte rate is much lower. The Q8 byte stream's per-byte
temporal correlation is what makes the XOR-after-quant trick
worth shipping at Q8 but not at Q4.

The ship was scoped to ~150 LOC frontend + ~50 LOC tests, no
backend changes — the recipe in `docs/TODO.md` derived from
the saturation report. The PR landed at +301 / -21 across
seven files.

## Shape of the change

### Encoder factory extension

`frontend/src/services/analysis-bundle/encoder.ts` — the
`makeLossyEncoder` factory grew a third parameter,
`byteXorDelta: boolean = false`. The two existing
configurations (Q4 → `OWNERSHIP_Q4_POLICY_Q8_FACTORED_V1`, Q8
→ `OWNERSHIP_Q8_POLICY_Q8_FACTORED_V1`) instantiate with the
parameter left at its default; the new
`OWNERSHIP_Q8_POLICY_Q8_FACTORED_XOR_V1` instantiates with it
set to `true`.

When `byteXorDelta: true`, encode/decode loops thread a
running `prevOwnership: Uint8Array | undefined` reference
across the per-packet calls:

- **Encoder.** First packet is always an I-frame (literal Q8
  bytes, no `_xor_delta` marker). Each subsequent P-frame's
  `_b64` payload is XOR'd against the prior literal Q8 bytes;
  the wrapper gains `_xor_delta: true`. The prior reference
  advances to the *literal* (pre-XOR) Q8 bytes after each
  packet — XOR-against-literals composes cleanly under
  associativity; XOR-against-XOR'd-bytes would not.
- **Decoder.** Walks records in order, maintaining the same
  running prior. On a packet with `_xor_delta: true`, the
  decoder applies XOR-undo with the prior reference to
  recover the literal Q8 bytes, then advances the reference
  to those recovered bytes for the next iteration.

The per-packet helpers `encodePacketLossy` and
`decodePacketLossy` were refactored to return
`{packet, ownershipBytes}` so the bundle-level walkers can
thread state. The per-packet wrapper shape changes only by
the optional `_xor_delta: true` field — backward-compatible
with decoders that read `_q_bits` and skip unknown fields,
though only the new bundle-walking decoder produces correct
output on P-frames.

### Registry value + scheme dispatch

`frontend/src/types.ts` — `BUNDLE_COMPRESSION_SCHEMES` tuple
extended with `'v2-quantized-hifi-xor'`. No migration needed.
The migration 50 → 51's safe-default branch handles
forward/backward compat (an older client that downgrades sees
an unknown value and falls back to `'v1'` via
`readCompressionScheme`'s default).

`frontend/src/services/analysis-persistence-service.ts` —
`readCompressionScheme` maps the new registry value
`'v2-quantized-hifi-xor'` to the encoder scheme tag
`'ownership-q8-policy-q8-factored-xor-v1'`. The encoder-side
factory dispatch is the existing pattern; the new scheme
tag's registration in `encoder.ts`'s scheme map closes the
loop.

### Tooltip / tour / file-map

`frontend/src/components/editors/RegistryEditor.vue` —
the `PATH_TOOLTIPS` entry for the compression-scheme dropdown
extended with a fifth paragraph describing
`v2-quantized-hifi-xor` (additional ~23% post-brotli savings
over `v2-quantized-hifi`; reconstruction is byte-identical to
plain hifi because XOR is algebraic).

`FEATURES.md` — fifth bullet under "Analysis bundle
compression" tour entry. Describes the loss profile (none vs
plain hifi) and the savings rationale framework-grounded.

`frontend/FILES.md` — the `encoder.ts` row's description
widened to mention the optional byte-XOR delta as the third
configuration axis alongside the existing bits and factorisation.

### Tests

`frontend/tests/unit/services/analysis-bundle-encoder.test.ts`
— six new tests in a new "ownership-q8-policy-q8-factored-xor-v1
encoder (hifi-xor)" describe block:

1. **Scheme registration** — `getEncoder('ownership-q8-policy-q8-factored-xor-v1')`
   resolves; the returned encoder's scheme matches.
2. **`listKnownSchemes` inclusion** — the registry enumeration
   includes the new tag.
3. **Byte-identical reconstruction** — a 10-packet bundle
   encoded under hifi-xor and decoded with the same encoder
   produces ownership bytes identical to the same bundle
   encoded under plain hifi and decoded with that encoder.
   This is the algebraic-identity property: XOR is invertible,
   and the XOR composition with `prevOwnership` advancement
   recovers the original Q8 bins exactly.
4. **Byte-count overhead bound** — the encoded byte count is
   within `(N-1) * 30` bytes of the plain-hifi encoding for
   an N-packet bundle. The `_xor_delta: true` field adds ~18
   bytes per P-frame wrapper as a JSON marker; the bound has
   margin for variation. (Earlier draft asserted byte-count
   *equality* and failed; the marker is the asymmetry.)
5. **L∞ preservation across a 25-packet bundle** — the
   per-cell reconstruction error is bounded by 1/256 on every
   cell across every packet. No drift accumulation; the
   XOR-undo is exact at each step. (Earlier draft used test
   data that overflowed `[-1, 1]` at high seeds and produced
   spurious reconstruction errors from Q8's `[0, 255]` clip;
   the data clamping is the fix.)
6. **Single-packet bundle** — degenerate case round-trips
   cleanly (I-frame only, no P-frames produced).
7. **No-op on packets without ownership** — packets where
   `extra.ownership` is absent thread `prevOwnership = undefined`
   forward correctly without breaking the next packet that
   does have ownership.

(That's seven test cases in the count; the PR description
quoted six because two adjacent assertions were filed as one
test originally. Either count is fine — the artefact is the
behavioural coverage.)

## Verification

- `npm run test:run` — 664 frontend tests pass (+7 new in
  the hifi-xor describe block; previous total was 657).
- `npx vue-tsc -b` — clean, no new diagnostics.
- `npm run build` — clean, `dist/` emits.

The user-side validation step (open the SPA, switch the
registry value, run a study session, confirm round-trip
fidelity) is the remaining item — flagged in PR #272's test
plan checklist. Stored rows under previous scheme values
continue to decode under their original scheme tag regardless
of the current registry setting; the new value affects only
*new* persistence writes.

## What stays

The encoder factory's three-parameter shape (bits + byte-XOR
delta + factorisation, implicit through the closure) is the
substrate for any future Q-quantised variants. A future
`'v2-quantized-hifi-xor-v2'` (e.g., per-cell Q-bin remapping)
would either add a fourth factory parameter or call out into
a new factory if the shape diverges enough to make the
parameter list unwieldy. The scheme-tag string format
(`ownership-q{bits}-policy-{...}-{...delta...}-v{n}`) leaves
room for the natural extensions.

The `_xor_delta: true` marker on the per-packet wrapper is a
soft contract — currently only the hifi-xor decoder reads it.
A future encoder configuration that omits the marker but
emits XOR'd bytes (a non-self-describing variant) would need
its own scheme tag; the marker is for the case where the
decoder needs to dispatch within a single scheme tag's
packets, which is the current shape.

## What follows

The findings ledger at
`docs/notes/compression-research-followups.md` notes (§5)
that further framework-driven probes are open-ended: Q4+ICA
on the R residual specifically called out as "conditionally
sound to probe if the R component shows non-Gaussian
structure" — the conditional fired, ICA was probed, and
filed null on L∞. Future probes that want to ride the
framework can plug into the runner at
`research/compression/run_framework_baselines.py` and produce
a row directly comparable to the published baseline table.

The user-noted continuing-investigation thread in the
struck TODO entry — "Q4-plus-residual hybrid and the ICA /
sparse PCA conditional probes" — was largely cleared on the
same day as the saturation arc (the framework's baseline run
included both Q4-residual variants, the ICA K10/20/50/100
sweep, and the bundle-mean-residual + byte-XOR layered
variants). The followups ledger has the per-variant verdicts.

## Closing

The ship is a small, scoped, framework-derived improvement
that delivers measurable post-brotli savings on the hifi
profile with no loss-quality change. The substrate (lossy
encoder factory) absorbed the new variation as an additional
parameter rather than a parallel encoder path. The
no-backend-change clause held — the SPA's wire shape stays
opaque to the backend, the registered scheme tag round-trips
through persistence verbatim, and the saving is realised
purely on the encode-side byte stream that brotli then
processes.

License: Public Domain (The Unlicense)
