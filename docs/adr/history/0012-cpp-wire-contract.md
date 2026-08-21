# ADR-0012 — the chocofarm C++ wire contract (redis keys, weight manifest, X/PI/M/Y result blocks)

> *Point-in-time record (ADR-0005 Rule 8): extracted verbatim from
> `law/adr/0012-compositional-and-structural-hygiene.md` at commit `0f7b3e4` under
> `design/MAINT-ADR-PORTABILITY-SPEC.md` (tracker `adr-portability-refactor`). Not
> retro-edited; the lessons these records teach live as rules in the parent ADR.*

This is the concrete, maximally-specific contract chocofarm wrote for its incoming
C++ search/sim runner: the actual redis key formats (`weight_keys`/`result_keys`),
the weight-payload manifest+blob layout, the four named result blocks the source
project calls X/PI/M/Y, and the parity/validation plan against the Python
reference. It is a worked instance of P1 (single source of truth across a language
boundary), P2 (mirroring the env↔Policy seam in a new language), P6 (behavioral-
equivalence parity, not byte-identity), and P7 (cross-language wire discipline) —
concrete enough that a chocofarm C++ author could implement against it without
reading Python beyond one file. None of it is portable law: another project's
wire contract has its own keys, payload shapes, and reference implementation. The
parent ADR's P1/P2/P6/P7 rules are what generalize; this section is the fullest
worked instance of applying all four to one real cross-language boundary at once,
kept here as evidence rather than restated as if it were general guidance.

---

## Concrete guidance for a new-language (C++) component

This section is the actionable contract for the **incoming C++ search/sim
runner** (the audit's and `scaling-and-cpp-seam.md`'s **Shape A**: a worker
that runs the Gumbel-AZ search and belief mechanics in C++/numba, reading
weight bytes from redis and writing transition bytes back). It is deliberately
maximally concrete: a C++ author should be able to implement against it without
reading Python source beyond `transport.py`. It rests on the four already-clean
seams (`scaling-and-cpp-seam.md` §0): env↔Policy, the net-as-injected-port, the
redis raw-bytes transport, and the version-gated weight broadcast.

### 1. Mirror the env↔Policy seam — a composable Policy interface (P2)

The C++ runner reproduces the **shape** of the env↔Policy seam in its own
language, not a binding to the Python objects. Define a C++ `Policy` interface
whose single method mirrors `Policy.decide(env, loc, bw, collected, lam, rng)`:
the env owns all dynamics (belief, simulate, cost), the policy is injected and
decides. A new C++ capability is a new C++ `Policy` implementation with **zero
edits to the C++ core** — the same inversion of control P2 mandates. Start with
the trivial composable instance (a `RandomPolicy`, mirroring the Python
`RandomPolicy`) to validate the seam and the wire end-to-end **before** porting
any search; graduate to a search/MLP policy once parity on the trivial case
holds. `lam` and the budget (`m`, `n_sims`, `max_steps`) arrive as **live
per-decision scalars** (P4), never baked into the C++ object — they cross the
wire as numbers (see §3).

### 2. Derive from the bytes-store channel — cite the actual keys/format (P7)

`chocofarm/az/transport.py` is the **SOLE authority** of the serialization
contract (audit item K): the keys and byte layouts have **one definition**
there, and the C++ runner **derives** its read/write from it — never re-authors
it by hand. Keep the **serialization contract** distinct from the
**transport/coordination mechanism**: redis here is a **pure bytes-store**
holding state/payloads (the weight snapshot, the per-task result blobs), *not*
a coordination primitive. **Coordination today** is the OS process pool — no
sync-via-store is committed (no key-polling, no pub-sub-on-a-store backbone);
**coordination tomorrow** (the C++ worker, the async actor-learner) is an
explicit messaging fabric (ZeroMQ — `scaling-and-cpp-seam.md` Shape B — or a
broker), introduced for events/coordination/streaming **while the bytes
contract below is unchanged.** Redis is named here as the current instance of
(bytes-store), not enshrined as "the contract"; do not enshrine the fabric as
"the one way" either. The C++ runner is a **transport** component, so its
connection is via the transport role's `config.transport_redis_params()` —
default `127.0.0.1:6380` db 0, the **ephemeral** memory-cache instance
(`allkeys-lru`), env-overridable through `CHOCO_TRANSPORT_REDIS_HOST`/
`CHOCO_TRANSPORT_REDIS_PORT`/`CHOCO_TRANSPORT_REDIS_DB`. This is explicitly
**NOT** the registry's disk-persisted `127.0.0.1:6379` `noeviction` instance
(`config.registry_redis_params()`, the `CHOCO_REGISTRY_REDIS_*` family) — the
two roles are deliberately distinct instances. The C++ runner reads the **same
`CHOCO_TRANSPORT_REDIS_*` contract**, so it lands on whatever instance the
operator points the Python transport at; `config.py` is the one owner of "which
redis" per role (P1), not a port re-typed here. The protocol, verbatim from
`transport.py`:

**Weight keys (`weight_keys(run, phase, version)`).** Two keys per published
net, namespaced by `run`, `phase ∈ {"gen","eval"}`, and `version`:

```
manifest_key = az:w:<run>:<phase>:<version>:m
blob_key     = az:w:<run>:<phase>:<version>:b
```

The `phase` segment is the R14 namespacing that **replaced the `it + 1_000_000`
hack** (audit item C, ADR-0011 Rule 4): the gen and eval phases of one
iteration `it` publish to **distinct** keys at the **real** `version=it`. The
C++ worker selects `gen` vs `eval` weights at the same real `version`. A
missing payload is a **loud failure** (ADR-0002 / P5), never a silent stale-net
serve — `read_weights` raises `RuntimeError(f"weight payload az:w:{run}:{phase}:
{version} missing from redis")`; the C++ read must do the same (raise/abort,
not serve a stale net).

**Weight payload (manifest + blob).** The `blob` is **contiguous float64**
weight bytes — the raw `tobytes()` of each weight concatenated, *not* float32,
*not* pickle. The `manifest` is JSON: per-weight `(name, shape, dtype, offset,
byte-length)` entries plus the scalar construction meta (`in_dim`, `H`,
`n_actions`, `y_mean`, `y_std`, and `residual: bool`). The C++ side reconstructs
the net by reading the manifest's meta (so an older manifest without `residual`
→ block OFF), then binds each weight as a view/copy at its `(offset, len)` into
the blob. **Do not re-enumerate or re-order the params**: the param order is
the `WeightContainer`'s canonical (historical) order, recorded in the manifest;
the C++ reader follows the manifest, it does not invent a layout. Optional
params (the residual block `Wr*`/`br*`) ride along automatically **iff** the
manifest lists them — exactly the derive-don't-duplicate (P1) the param-registry
serializer already nails.

**Result keys (`result_keys(res_token, idx)`).** Four keys per task, namespaced
by a fresh per-`generate`-call `res_token` (a uuid) and the task `idx`. Result
keys **carry no `phase` segment** — results exist only for the gen phase and the
uuid `res_token` already prevents collision, so adding `phase` would be dead
symmetry (ADR-0008: don't fabricate a dimension a key doesn't need):

```
X  = az:res:<token>:<idx>:X
PI = az:res:<token>:<idx>:PI
M  = az:res:<token>:<idx>:M
Y  = az:res:<token>:<idx>:Y
```

**Result-blob layout (the float32 wire).** Each of the four blocks is the
contiguous `tobytes()` of a **float32** array (note: results are float32,
weights are float64 — match each exactly):

- `X`  — features, reshaped `(n, feat_dim)`
- `PI` — policy targets, reshaped `(n, n_slots)`
- `M`  — legal-action mask, reshaped `(n, n_slots)`
- `Y`  — value targets, shape `(n,)`

where `n` is the number of transitions the task produced, and the parent reads
each block with `np.frombuffer(..., dtype=np.float32).reshape(...)` against a
`(idx, n, feat_dim, n_slots)` meta. The C++ worker emits each block as a
contiguous little-endian float32 buffer in **row-major** order matching those
shapes. Set the result TTL (`CHOCO_RESULT_TTL`, default 3600s) in the same SET
round-trip — the aborted-iteration self-clean safety net (the post-mortem found
~980 leaked `az:res:*` keys with no expiry; P5).

**The hot knobs** (`m`, `n_sims`, `lam`, `max_steps`) cross as **scalars**
(P4) — a key→number map plus the raw weight/result bytes is language-agnostic
**by construction** (`scaling-and-cpp-seam.md` §0.3). There is nothing
Python-specific on the wire.

### 3. Stay SSOT — derive, never re-author; reimplement *behind* the seam (P1, P7)

The C++ runner **reimplements the surface behind the seam** — the belief
mechanics (`filter_treasure`/`filter_detector`/`sample_world`/`apply`/
`marginals`) and the single `forward_core(params, X)` — against the wire, and
**derives** its view of every cross-boundary layout from the one authority
rather than **re-authoring it by hand**. This is the SSOT rule (P1) across the
language boundary: a cross-boundary fact has **one authoritative definition**,
and every side reads it (at runtime) or generates it (at build time) — two
writers of one truth is the violation. The two payloads sit at opposite ends of
the static↔dynamic axis and warrant different mechanisms:

- **Dynamic weight layout → derive from the runtime manifest (no hardcoded
  offsets in C++).** The layout has one owner (`WeightContainer`, surfaced on
  the wire via the manifest), and because the layout is **dynamic** (residual-
  block toggles, instance-derived dims), a self-describing manifest **read at
  runtime** is the legitimate mechanism: read `(offset, len, shape, dtype)` per
  weight from the manifest JSON each run, so a layout change is **absorbed, not
  drifted**. A hardcoded offset would be the cross-language form of the
  three-writer feature-layout cancer (B). *Residual gap:* the manifest's **own**
  schema is still two hand-written (de)serializers (Python pack / C++ parse) —
  the one place this payload is not yet generated from a single schema.
- **Static result format → a generated/compiled/linted contract, not two hand
  codecs.** The four float32 blocks X/PI/M/Y have **fixed, known dtypes/shapes**
  — a **static** contract, exactly what codegen exists for. Today it is left to
  two hand-written codecs (the Python `np.frombuffer(...).reshape(n, fd)`
  reader and the C++ emitter) joined only by the runtime parity test — a
  **runtime-only convention** (cancer G). At the strongest feasible level it
  should be **generated/compiled from one schema**; the **floor** is a
  build-time lint that **fails the build** on a Python/C++ format-constant
  disagreement. Whichever mechanism is chosen, the C++ side **derives** the four
  blocks' shapes from the one authority and invents **no** packed/struct format
  of its own. (For raw float blobs on this hot path a zero-copy IDL —
  FlatBuffers / Cap'n Proto — fits better than protobuf's parse-and-copy; this
  is an example, not an ADR mandate.)

R8 collapsed the belief mechanics to **one** implementation
(`Environment.restrict`, no `MiniEnv` copy) and R11 collapsed the forward to
**one** `forward_core` — so there is exactly **one** Python surface to mirror,
not four (`scaling-and-cpp-seam.md` §0.1–0.2). The C++ port mirrors that one
surface. Adding a second C++ encoder of a layout the manifest already owns
would re-create the split-brain encoder the whole SSOT discipline exists to
prevent — across the hardest boundary to audit.

### 4. Validate by parity — the backstop, not the primary guarantee (P6)

Parity is the C++ runner's acceptance test under the **same behavioral-
equivalence bar as P6 / ADR-0009** — **not byte-identity** — but it is the
**backstop, not the contract.** A runtime parity test catches a drift only if
it runs, with the right fixtures, *after* the drift already exists; the primary
guarantee is the generated/compiled/linted serialization contract of §3 that
makes a format disagreement **unable to be authored** in the first place
(strongest-feasible: generate-or-compile-from-one-source > build-time lint >
this runtime parity test). With that floor in place, parity then certifies the
*numerics* — a C++ reimplementation of the same math in a different language and
compiler **will** move the float (float32 is not associative across the C++
reorder, just as it moves across the numba/JAX reorder the project already
accepts) and may flip a near-tied Sequential-Halving choice. So the parity bar
is, exactly:

- **Logic invariants → bit-exact.** Illegal-action-slot mass is `== 0.0`; the
  legality `M` mask the C++ worker emits is bit-identical to the Python one for
  the same `(loc, belief)` — these are logic facts float32 cannot perturb.
- **Float-sensitive numerics → aggregate behavioral equivalence.** Run the C++
  worker and the Python reference on **matched seeds** and compare **aggregate
  statistics** — fixed-λ₀ rate `ΣR/ΣT`, mean E[T], and action distribution —
  over **N≥300 episodes across ≥2 seeds**, requiring statistical
  indistinguishability **within Monte-Carlo CI**, with the MC standard error
  reported so "indistinguishable" is a number, not an eyeball (the
  `bench_equivalence.py` metric set, applied cross-language).
- **Bit-identity only where free and proven.** Where a quantity *is* bit-stable
  (the legality mask above; a pure-integer index computation), assert it
  bit-exactly — but do not extend that to any float-sensitive output.

This is the **cross-episode** equivalence kind (`scaling-and-cpp-seam.md` §2
Axis A / Shape B): it carries only the forward-roundoff non-exactness the
project already accepts (`test_jax_equivalence` `ABS_TOL=1e-4`), **not** the
approximate-search non-exactness the project defers. Begin parity at the
trivial `RandomPolicy` (which removes the search-choice float-sensitivity and
isolates the wire + belief mechanics), then graduate to the search policy under
the full aggregate-stat bar.

> **The single asterisk** (`scaling-and-cpp-seam.md` §3): the C++ worker is a
> composition of seams that already exist — the env↔Policy seam, the redis
> transport, the version-gated weight broadcast — and **falls out for free**.
> The one structure that does *not* fall out is the synchronous
> `generate → train` loop becoming a continuous async actor-learner; that is a
> localized, R12/R14-enabled restructure, and the deliberate trade it records
> (relaxing the parallel≈serial *bit-determinism* of aggregate reproducibility
> for throughput, while keeping per-episode exactness) is itself a P6
> behavioral-equivalence judgment, recorded so a later reader does not mistake
> the relaxation for a regression.
