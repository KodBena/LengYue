# Analysis persistence — followups

A working backlog for analysis-persistence issues that surfaced
post-ship but aren't on a current arc. Pairs with
`docs/notes/analysis-persistence-plan.md` (the system note for
the shipped backend + frontend halves).

- **Status:** Open backlog. Items here may become focused PRs
  individually, get bundled into a coordinated arc, or get
  refined as the codebase moves and the issue's shape
  changes. The author has deferred implementation.
- **Genre:** Design-direction note. Each item names the
  symptom, the current shape's relationship to the
  problem, the decision-space the fix has to settle, and
  the cross-cutting reach.
- **Date:** 2026-05-26. Items named in the closing
  conversation of the compression-arc saturation work.
- **Scope:** Cross-cutting — touches the frontend's
  hydration flow, active-analysis state, persistence-
  service ACL, the backend's bundle keying, and (for the
  largest item) a new UI surface for offline browsing.

## Why "followups" and not "roadmap"

The four items below are real inconsistencies / bugs /
missing capabilities the project author has noticed in normal
use after the analysis-persistence arc shipped. They are not
pre-sequenced into a phased plan; ordering and bundling are
open questions the implementer will settle when picking the
work up. The "followups" suffix matches the precedent of
`compression-research-followups.md` — same shape, same
discipline (per-item rationale, decision-space named, no
forced classification).

If one of these triggers a focused arc, the right move is
either to lift it into a plan note in the
analysis-persistence-plan.md sibling style, or to fold it
into the existing plan as a "Phase 2" amendment, with the
followup entry here striking through to point at the plan.

## Item 1 — Pre-connect Discard bungles state

**Symptom.** Pressing the Discard button on the
AnalysisControls cluster before the SPA has connected to the
backend puts the persistence state machine into a bad state.
The damage persists across the eventual connect — Discard
remains broken for the rest of the session even after
connectivity establishes.

**Suspected cause.** The Discard handler depends on state
that is only initialised at connect time — likely a
bundle-metadata reference or an `AnalysisPersistenceService`
slot that the connect-time hydration populates. Calling
Discard pre-connect either no-ops with a side-effect on a
sibling field, or initialises the field in a shape the
connect-time hydration doesn't undo. The exact mechanism is
to-be-determined; the symptom is reproducible.

**The fix has to settle.** Either:

- Disable Discard until the SPA has connected (UI-level
  guard, visible to the user as a "not yet" affordance), or
- Make Discard idempotent and connect-order-independent
  (state-machine-level fix; the Discard handler tolerates
  pre-connect invocation gracefully and the connect-time
  hydration is reentrant against any state Discard left
  behind).

The second is the more conceptually-clean fix; the first is
the cheap defensive one. Either is acceptable. A combined
approach (state-machine-level fix + the UI disable while
loading as defence-in-depth) is also reasonable.

**Cross-cutting reach.** Pure frontend — the
`AnalysisPersistenceService` and its consumer composable own
this. No backend implication.

## Item 2 — All-or-nothing restoration across networks

**Symptom.** When the SPA reconnects to a board that has a
stored bundle, the whole bundle restores into the ledger
regardless of which KataGo network the user is currently
connected to. If the bundle was saved under one network
(e.g., `b18nbt`) and the user is now connected to a
different one (e.g., `b10c128`), the off-network records
sit in the ledger but don't align against the active
`config_hash` for cache lookups.

**Current shape.** The persistence plan's "Forward-compat
hooks" section flags `model_version` on records as the
deliberately-not-yet-implemented third hook. In practice the
`config_hash` already in each `(config_hash, node_id,
packet)` record carries the network information, so the
discriminating data is present — it's just not being used
for selective restoration. The "save all / restore all" v1
shape was intentional at shipping time (named in the dispatch
chain) but interacts poorly with the case where users
analyse the same board under multiple networks across
sessions.

**The fix has to settle.** Either:

- Restoration filters records by `config_hash` matching the
  currently-connected network. Off-network records remain
  in the bundle on disk but don't load into the active
  ledger. (Sub-question: are off-network records fetched at
  all? Wire-bytes savings vs round-trip cost — the bundle
  is typically small enough that client-side filtering is
  fine.)
- A "load analysis" UI surface (Item 3) replaces the
  automatic restoration entirely — restoration becomes
  user-discretionary per-identifier, and the default
  becomes "nothing restores until the user picks."

Item 3 is the natural superset of Item 2's fix; the open
question is whether automatic-restore stays as a default
for the matching-network case, or whether everything moves
to user-driven loading.

**Cross-cutting reach.** Frontend primarily — the restore
composable + its filtering. Backend implications only if
the wire shape gains a per-`config_hash` filter on the GET
(likely unnecessary; client-side filter on the small bundle
suffices).

## Item 3 — Per-bundle-per-board identifiers for offline loading

**Symptom + want.** Currently a user cannot view a stored
analysis without first connecting to a KataGo backend. Per
Item 2's all-or-nothing restore, the ledger only
meaningfully populates when there is an aligning active
session; in practice the user experience couples "view my
analyses" to "be online."

The proposal: introduce per-bundle-per-board identifiers,
shape like `b18nbt-q8-hifi`. The identifier composes the
network tag (e.g., `b18nbt`, `b10c128`) and the compression
scheme tag (one of the `BUNDLE_COMPRESSION_SCHEMES` values,
e.g., `q8-hifi`, `v2-quantized-hifi-xor`). A "load analysis"
UI surface enumerates the user's stored identifiers per
board and lets them load a specific one — decoupled from
whether a KataGo backend is currently connected.

**Current shape.** The storage row is keyed by
`(user_id, board_id)` with a single bundle holding all
records. Moving to per-identifier bundles per board requires
either:

- **Schema change.** `(user_id, board_id, identifier)` as
  the composite key. Migration walks existing rows and
  assigns a default identifier (e.g., synthesised from the
  records' modal `config_hash` plus the configured scheme
  at write time). Multiple bundles per board become first-
  class.
- **Sub-bundle indexing inside the payload.** Keep one row
  per board, but introduce per-identifier sub-bundle
  structure inside the payload. The GET surfaces
  per-identifier summaries; a "load this identifier" call
  pulls the relevant sub-bundle.

The schema change makes per-identifier quota / lifecycle
(delete one, keep others) a clean single-statement
`DELETE WHERE ... AND identifier=?`. The sub-bundle approach
needs a read-modify-write transaction for the same operation
(load row, decode payload, drop the sub-bundle, re-encode,
atomic UPDATE) — invisible at the UX layer (the user is
picking a slot and clicking delete either way), but a real
storage-layer asymmetry. Both approaches handle bulk
"wipe all for this board" identically (one `DELETE WHERE
board_id=?`). Lean modestly toward the schema change for
the cleaner storage layer, but the call isn't forced — the
sub-bundle approach is a reasonable deferral if the
migration's blast radius is unwelcome.

**The "load analysis" surface itself.** A modal, panel, or
list under the AnalysisControls cluster that shows, for the
current board, the identifiers of stored bundles with their
record counts, modal `config_hash`, compression scheme, and
last-updated timestamps. Clicking an identifier loads its
records into the ledger. Works without an active KataGo
session — pure read against the persistence service.

The surface also wants two complementary delete affordances:
a per-identifier delete (the natural "pick a slot, click
delete" gesture inside the list) and a per-board "delete
all for this board" button. The single-slot delete handles
the case where one specific analysis has gone stale; the
wipe-all handles "I want to start over on this board" — for
4–8 stored bundles the slot-by-slot path is a chore the
bulk affordance retires.

**Cross-cutting reach.** Schema change (backend); endpoint
shape — either a list-bundles-by-board call or an extension
of the existing GET to support per-identifier addressing
(frontend ACL + backend route); new UI surface (frontend);
persistence-service refactor to handle multi-bundle-per-board
(frontend); naming convention for identifiers (cross-cutting
design decision — what characters are valid, how is the
network tag stable across releases, how is the compression
scheme versioned within the identifier).

The identifier shape also intersects FEATURES.md's user-
facing tour: a "browse and load saved analyses" capability
would warrant a new entry under the analysis-persistence
section.

## Item 4 — Last-displayed analysis restored on hydration (offline)

**Symptom + want.** "Active analysis" here means the
analysis currently displayed for the active network
selection — the SPA's "what am I looking at right now"
state, not a live KataGo session. In the live (KataGo-
connected) case, switching networks on a SELECTOR-capable
proxy already snaps the display to the most recent
analysis performed by the newly-selected network — the
exact semantics aren't fully documented, but the
user-visible behavior is "the display follows the network
selection."

That state should also survive an SPA reload — when the
user opens the SPA again, whatever analysis they were last
looking at (for the network they last had selected) should
restore into view, *whether the SPA is connected to KataGo
or not*. The SPA does not auto-connect to KataGo, so in
practice "on hydration" means "before any KataGo session
exists" — restoration runs against the backend persistence
API, which is available, not against any live KataGo
stream, which is not.

**Current shape.** The hydration pathway (the bootstrap
restore-on-auth+hydrate that the persistence plan
describes) populates the ledger from the stored bundle.
The notion of "what was last being looked at" is in the
SPA's reactive document state — `currentBoardId`, the
active network selection, the active node — and that
state is already part of the document blob the SPA
persists via `SyncService`. On hydration, the document
state restores, but the *displayed analysis* it implies
(the per-identifier bundle for the active network) does
not automatically load into the ledger pre-KataGo.

The fix wires hydration to do exactly that: after the
document state restores, look up the implied identifier
(board + active network + compression scheme) and load that
bundle's records into the ledger using the same backend
read the "load analysis" surface from Item 3 will use. No
KataGo session is required — the bundle data is in the
backend, the network identifier is in the restored document
state, the loading is pure read-and-replay.

**The two coupled state-pieces.**

1. *Local* (SPA document blob): which board / network /
   node was active. Round-trips through `SyncService`
   already; the fix just needs to make sure the active-
   network field is included if it isn't already.
2. *Remote* (analysis-bundle backend): the records
   themselves. Already in the bundle store; the new use is
   "look it up by identifier and load it" without an
   active KataGo session driving the trigger.

**Applies regardless of proxy type.** The SELECTOR framing
above is the more complex case because the active-network
selection is a separate state axis the SPA has to remember.
For a non-SELECTOR proxy, there is no network-selection
dimension — the proxy's single configuration is whatever
the user last connected to, and the identifier resolves
trivially. The user-facing contract is the same in both
cases: on SPA open, the display restores to exactly what
the user was last looking at, regardless of which proxy
type produced the stored analysis or what configuration was
active at the moment of close. The SELECTOR case just adds
"and the active-network selection is part of what restores."

**Cross-cutting reach.** Tightly coupled with Item 3 —
shares the per-identifier loading mechanism the "load
analysis" surface needs; the difference is the trigger
(hydration auto-restore vs explicit user click). Frontend
only: hydration composable, persistence-service read path,
possibly a small extension to the document-blob shape if
the active-network selection isn't already round-tripping.
No backend implication beyond what Item 3 needs (the
backend half is ready — the records are addressable, the
ACL just needs the read paths Item 3 introduces).

## Cross-cutting observations

- **Items 2, 3, and 4 share a substrate.** Items 2 and 3
  are tightly coupled at the schema / endpoint layer (Item
  3 is the natural superset; offline browsing implies
  per-identifier addressing, which subsumes Item 2's
  network-aware restore semantics). Item 4 then sits on
  top of the same per-identifier loading mechanism, with a
  different trigger (hydration auto-restore from saved
  document state vs explicit user pick from a list). All
  three want to land together — or at least be designed
  together — to avoid the persistence-service path
  churning twice. The open question for Item 2 is whether
  automatic-restore-on-connect stays as a convenience for
  the matching-network case once the explicit "load
  analysis" path exists.
- **Item 1 is isolated.** A state-machine bug, fixable in
  its own focused PR. Doesn't need to be coordinated with
  the others.
- **The dispatch-and-coordinate pattern** is the path if
  Items 2/3/4 land together. The original analysis-
  persistence arc shipped on `cross/analysis-persistence`
  with backend + frontend coordinated via the dispatch
  chain at `docs/archive/dispatch/`; Item 3's schema change
  would warrant the same shape if pursued, and Items 2/4
  ride along since they share the surface.

## Provenance

These items are faithful capture from the project author's
closing remarks of the 2026-05-26 compression-arc-saturation
conversation, named as observed-in-normal-use annoyances and
explicitly deferred. The "the fix has to settle" framing on
each item names the implementer's decision-space; the
particular decisions are not pre-made.

The conversation's framing was "concerns are cross-cutting"
and "not sure if it's called a roadmap, a design note or
anything else" — captured here as a backlog / followups
note in the established codebase pattern, without forcing a
sharper classification.

## License

Public Domain (The Unlicense).
