# Engine Connection Bootstrap + Zeroconf Discovery — Design Note

**Status:** `design-note: planned`. Filed 2026-05-15 in response to
the project author's request to capture options for later executive
review. The author named decision fatigue as the reason for filing
rather than deciding now; this note records the framing, options,
and open questions in durable form so a future return to the
question can pick up from a settled record rather than a fresh
synthesis.

**Genre.** Planning record. Two threads bundled because they
originated together in the same conversation and one informs the
other:

- The immediate UX pain — editing `engine.katago.url` via the
  registry editor is "always a pain ... the annoying part isn't
  entering the IP address but rather, navigating the nowadays
  completely Byzantine settings/registry."
- The longer-term vision — zeroconf-driven discovery for proxy
  and backend, opt-in coordinated across all three sub-projects,
  reaching toward a bundled distribution where end-users do no
  IP-address management.

**Originating record.** Item 32 in `docs/TODO.md` (Future projects
section) has been parked as "zeroconf / mDNS service discovery"
with constraints recorded but no detailed plan. This design note
is the detailed plan Item 32 anticipated, expanded in scope (Item
32 named backend advertisement only; the user's 2026-05-15 framing
extends to proxy advertisement too).

**Date:** 2026-05-15.

**Author audience.** The project author returning to the question
at executive bandwidth, and a future implementer working from this
note's settled framing.

---

## 1. Motivation

The current friction the author named explicitly:

- The registry editor is the only existing surface for editing
  `engine.katago.url`. Reaching it requires opening the Other tab,
  navigating the registry tree, finding the `engine.katago.url`
  leaf, editing it, and clicking out to save. The author reports
  this as "always a pain."
- Default URLs ship with one specific value (`ws://127.0.0.1:41948`,
  matching `proxy/run_leaf.sh`'s default for local development),
  which is fine for fresh installs but creates friction in dev
  workflows where the actually-running proxy is on a different
  port or host. The author: "all new users default to something
  that I'm not using, which is fine due to dev process but
  annoying — I have to go there and manually edit it."

The longer-term vision the author named:

- Connection settings explicit in the toolbar when disconnected.
- Zeroconf enumeration of available services if "painless even on
  Linux" — the author's environment is Gentoo + openSUSE.
- Coordinated opt-in across backend and KataProxy.
- End-state: bundled SPA+backend+proxy with no IP-address
  management by the end-user.

The author also explicitly invited skepticism: *"I'd not be
surprised if the 'works transparently' is a pipe dream."* This
note honours that invitation — §4's architectural constraints are
the load-bearing reality check.

---

## 2. The current pain, named precisely

What happens today when the user wants to change the engine
websocket URL:

1. Open the Other tab.
2. Locate the registry editor section (post the knob-registry
   2026-05-14 reshape, sliders surface above the registry editor;
   the registry editor itself is one section among several).
3. Navigate the registry tree to `engine → katago → url`.
4. Click into the field to edit.
5. Edit the URL.
6. Click elsewhere to commit the change.
7. Return to whatever workflow needed the URL change.
8. Click the toolbar's CONNECT button to actually use it.

What the author wants is closer to:

1. Note that the toolbar shows the URL when disconnected.
2. Edit the URL inline.
3. Click CONNECT.

The friction is navigational, not data-entry. The fix is a
surface-level reshape: expose the URL on the toolbar's
disconnected-state chrome, with the registry editor still
available as the spacious detailed view.

---

## 3. Two-tier framing

The user's ask decomposes into two independently-shippable tiers,
with the first useful on its own.

### Tier 1 — In-toolbar quick-connect surface

A new component renders in the toolbar's disconnected state,
adjacent to the existing CONNECT button. It exposes an editable
field reading from and writing to the same `engine.katago.url`
store leaf the registry editor already exposes; the registry
editor remains as the spacious detailed view (no removal). The
toolbar field is a second surface for the same data, not a
replacement.

Shape options (defer-to-implementation but worth recording):

- **Inline field, paired with CONNECT.** A small text input
  rendered next to CONNECT when disconnected. Pros: simplest;
  matches the user's "see it where I'm going to click anyway"
  framing. Cons: takes horizontal toolbar real estate when the
  URL is long.
- **Hover popover on CONNECT.** Hover the CONNECT button to
  reveal the URL with edit affordance; same hover-intent pattern
  as `ToolbarSliderPopover` and `EngineQueueTooltip` (per the
  2026-05-14 popover-hover-finickiness arc). Pros: takes no real
  estate until needed. Cons: less discoverable for new users; the
  whole point is to reduce "where do I find this" cost.
- **Click-to-modal.** CONNECT becomes a split button or
  "Connect…" affordance that opens a tiny modal. Pros: handles
  arbitrarily long URLs and any future additions (proxy
  selection, etc.). Cons: heaviest interaction model for what's
  usually a one-line edit.

The inline-field option is the closest fit for the named pain
("the annoying part isn't even entering the IP address but
rather, navigating ..."). The hover popover repeats the friction
this work is trying to close. The click-to-modal earns its
weight if it has to surface multiple connection-related fields
(URL + proxy selection + zeroconf-discovered list); Tier 1 alone
doesn't need it.

ADR-0003 band: 1 (substrate-driven; reads/writes the same
controlled-preference leaf the registry editor uses; no Go
vocabulary). Mount: the toolbar's `engine-controls` area or as
its own segment outside the engine-metrics-bar (which is
`v-if="isConnected"`-gated per the 2026-05-14 band-mismatch
corrective).

### Tier 2 — Zeroconf discovery (proxy + backend)

The longer-term arc. Proxy advertises itself via mDNS
(`_katago._tcp.local.` or similar); backend observes via
mDNS-aware library; SPA queries backend for a discovered list
and presents it to the user.

The two tiers compose: Tier 1's URL field gains a sibling
"discovered proxies" dropdown when (a) backend is reachable and
(b) discovery is enabled. The dropdown's choice writes the same
`engine.katago.url` leaf. Without zeroconf the dropdown simply
doesn't appear; the URL field stays as the primary affordance.

---

## 4. Architectural constraints (the reality check)

### 4.1 Browsers cannot do mDNS

The structural constraint that shapes everything in Tier 2: a
browser-based SPA cannot enumerate `_katago._tcp.local.` services
natively. The JavaScript sandbox does not expose mDNS service
discovery; there is no `navigator.serviceDiscovery` API; WebRTC
uses mDNS for ICE candidate generation but does not expose
discovery as an application-level capability.

Implication: any zeroconf path requires a non-browser process to
do the observation. The natural candidate is the backend (it
already runs Python; `python-zeroconf` is a mature pure-Python
library with no system-Avahi dependency). A native helper process
would also work but adds a deployment unit and complicates the
distribution story.

### 4.2 The backend dependency chicken-and-egg

If discovery happens on the backend, the SPA must know the
backend's URL to query it. The backend's URL is itself a
configuration the user provides (today via `VITE_*` env vars at
build time; via the registry at runtime). Zeroconf shrinks
"configure two URLs" (backend + proxy) to "configure one URL"
(backend, then discover proxy), but never to zero unless
everything is local.

For the **bundled-localhost case** the author named as the
end-game: all three components on `127.0.0.1`, configuration is
the static localhost defaults, zeroconf is unnecessary because
there's nothing to discover. The vision *is* achievable in this
case, but the lever isn't zeroconf — it's sane localhost
defaults and a bundled distribution.

For the **distributed case** (the author's daily dev shape:
backend on dev machine, proxy on GPU host): zeroconf earns its
keep. Backend URL still requires manual configuration; proxy URL
becomes auto-discovered.

For the **standalone SPA case** (browser-only, no backend
running): zeroconf is unreachable. The Tier 1 quick-connect
surface is the only available affordance.

### 4.3 Item 32's constraints, reconciled

Item 32 in TODO records constraints from earlier discussion:

- *"no mandatory dependencies for Linux users (no Avahi
  requirement)."* — Satisfiable. `python-zeroconf` is pure
  Python; doesn't require Avahi installed on the system. It
  implements its own mDNS responder/browser.
- *"Windows out of the box."* — Satisfiable. `python-zeroconf`
  works cross-platform. Windows doesn't ship Bonjour but the
  library doesn't need it.
- *"Firefox without extensions."* — Implicitly satisfied by
  §4.1's design (discovery happens on the backend; the browser
  doesn't speak mDNS at all, so browser choice and extensions
  are irrelevant).
- *"Large not because the implementation is hard but because the
  testing matrix is wide (three OSes × multiple browsers × with-
  and-without network configurations), and the failure modes
  need graceful fallback to the configured URL from item 22."* —
  This is the operational shape, not a constraint. The two-tier
  framing in §3 makes the graceful-fallback structural: when
  zeroconf can't enumerate (no backend, no advertised services,
  network configuration blocks mDNS), the Tier 1 URL field is
  the always-available fallback.

### 4.4 Linux painlessness, per distro

For the author's environment specifically:

- **openSUSE.** Avahi is enabled by default in most flavours
  (Tumbleweed and Leap both). `python-zeroconf` works whether
  Avahi is running or not — it can coexist via `SO_REUSEADDR` on
  port 5353. Best-knowledge: painless.
- **Gentoo.** Avahi is in portage (`net-dns/avahi`); installation
  is `emerge --ask net-dns/avahi` and `rc-service avahi-daemon
  start` (OpenRC) or `systemctl start avahi-daemon` (systemd).
  Uneventful in the author's experience class but requires the
  manual step. `python-zeroconf` works without Avahi being
  present; the Gentoo install is only needed if the user wants
  *other* mDNS-using software on the box to coexist correctly.

The hedging in this section is honest: I'm working from
best-knowledge rather than verified-on-the-author's-machine. The
author's own validation would be Tier 2 implementation's first
test, and the Tier 1 surface ships independent of any of this
being right.

---

## 5. Implementation options

Three distinct opening moves. The author's question to defer was
"which one to start with"; this section records each so a future
return can pick.

### Option A — Tier 1 alone, first

A self-contained frontend PR. Adds the quick-connect surface to
the toolbar's disconnected state; writes to the existing
`engine.katago.url` leaf; the registry editor surface is
unchanged. No cross-team work.

- **Pros.** Fast time-to-merge. Closes the named UX pain
  immediately. Decouples from any zeroconf design uncertainty.
  Independent value that survives even if Tier 2 turns out to be
  a pipe dream.
- **Cons.** Doesn't address the bigger vision. The future Tier 2
  work will revisit the toolbar surface to add the discovered-
  proxies dropdown — Option A's shape needs to accommodate that
  future expansion without rework. Designable but worth noting.

### Option B — Tier 1 + Tier 2 together

Full arc. Dispatch from frontend → proxy (proxy advertises
opt-in); dispatch from frontend → backend (backend observes
opt-in, exposes `GET /discovery/proxies`); frontend consumes the
endpoint and renders the quick-connect surface with the
discovered-proxies dropdown.

- **Pros.** Single coherent shipment. The toolbar surface is
  designed once against the full requirement; no rework.
  Realises the bundled-distribution vision's discovery half.
- **Cons.** Longest time-to-merge. Defers user-visible relief on
  the immediate pain. Largest testing surface (three sub-
  projects × multiple OSes × multiple network configurations,
  per Item 32's recorded constraint). Highest coordination cost.

### Option C — Hybrid

Ship Option A first as the immediate-relief PR, with the
toolbar surface designed to accommodate a future discovered-
proxies dropdown (additional slot for the dropdown to land in
later). Tier 2 follows as its own arc, opening dispatches when
ready.

- **Pros.** Best of both worlds in principle: immediate relief
  AND a forward-compatible design. The Tier 1 PR is the only
  thing user-visible until Tier 2 lands.
- **Cons.** Requires Tier 1 to design against a Tier 2 shape
  that isn't yet settled. Risk of designing-for-imagined-Tier-2
  and getting the seam wrong — the classic "extract abstraction
  before second use case" failure mode ADR-0003 names. Mitigable
  if Tier 1's shape is the minimum-viable "URL field + CONNECT"
  with explicit "Tier 2 will add a sibling element here" noted
  in the SFC header, deferring the actual sibling-element shape
  until Tier 2's design.

The author's framing — *"I have a couple of directly impactful
things I'd like to get out of the way that don't require
executive level attention"* — suggests Option A is the natural
fit (smallest scope, no cross-team coordination, fastest to
ship). The author can return to Tier 2 when they have executive
bandwidth.

But this note records all three so the decision stays open.

---

## 6. Backwards compatibility

Non-negotiable, per the author's explicit framing. The relevant
invariants:

- **Existing `engine.katago.url` values survive.** Both surfaces
  (registry editor + toolbar field, if Tier 1 lands) read/write
  the same store leaf. No migration is needed; persisted user
  configs continue working unchanged.
- **Existing dev workflows survive.** A user who currently edits
  `engine.katago.url` via the registry editor can continue doing
  so; the toolbar field is additive.
- **Existing proxy / backend deployments survive.** Tier 2's
  opt-in flags default to off on both proxy (zeroconf
  advertisement) and backend (zeroconf observation). An existing
  deployment unaware of the work is unaffected; the new
  functionality engages only when the operator explicitly enables
  it.
- **Failure modes degrade gracefully.** If zeroconf can't
  enumerate (no backend, network configuration blocks mDNS,
  library missing), the Tier 1 URL field is always available as
  the fallback — the structural shape of §3 makes this an
  inherent property rather than a special-case handler.

---

## 7. Cross-team coordination shape (if Tier 2 is pursued)

Tier 2 is cross-boundary by construction. Per the umbrella's
dispatch protocol (ADR-0005 Rule 2 and `docs/dispatch/`):

### Dispatch 1: frontend → proxy

Topic: opt-in mDNS advertisement.

- The proxy gains an opt-in flag (`PROXY_ADVERTISE_MDNS=true` or
  similar) that, when enabled, registers an mDNS service for the
  proxy on its bound port.
- Service type: TBD; candidates include `_katago._tcp.local.` or
  `_kataproxy._tcp.local.`. The latter is more precise (a
  KataProxy specifically, not any KataGo wire-compatible
  endpoint). Proxy team's call.
- TXT record contents: role (LEAF/RELAY/SELECTOR/ECHO),
  capabilities (subset of the v1.0.14 capability advertisement),
  internal name or instance label. Useful for clients to
  pre-filter without connecting.
- Default off; documented in the proxy's operational guide.

The proxy's existing structured-logging release (v1.0.20) and
the identity-type branding (v1.0.21) suggest the proxy team is
in a good shape for cross-cutting infrastructure additions.

### Dispatch 2: frontend → backend

Topic: opt-in mDNS observation + REST endpoint.

- The backend gains an opt-in flag (`ENABLE_DISCOVERY=true`) that
  starts a `python-zeroconf` browser for the matching service
  type.
- New endpoint: `GET /discovery/proxies` returns the currently-
  known list of advertised proxies, with their URLs, role,
  capabilities, instance label.
- The discovery cache refreshes on a TTL (mDNS announcements come
  and go; the backend's view is eventual-consistent with the
  network).
- Default off; documented in the backend's tenancy-and-deployment
  notes.

### Frontend implementation (post both dispatches)

- New service: `discovery-service.ts` that polls or subscribes to
  `GET /discovery/proxies`. Fails loudly per ADR-0002 if the
  endpoint returns 404 (discovery not enabled) — surfaces a
  one-line system message and falls back to the URL field.
- Toolbar quick-connect surface gains a sibling dropdown when the
  discovery endpoint returns a non-empty list.

### Sequencing

Dispatches in parallel; per-team implementation in parallel after
contracts settle; frontend integration last. The 2026-05-09
proxy capability-negotiation dispatch chain is a worked example
of the cross-team contract-settle-then-implement protocol the
umbrella uses.

---

## 8. Open questions for the project author

These are the questions deferred from the 2026-05-15
conversation. Recording them so the future executive review has
the right ground and doesn't have to re-derive them.

### Q1 — Opening move (Options A / B / C)

Which of §5's three options is the right place to start? The
author's framing leaned toward "directly impactful things that
don't require executive attention" which favours Option A. The
question records the choice for explicit decision.

### Q2 — Tier 1 surface shape

If Option A or C: which of §3.Tier 1's three shape options
(inline field / hover popover / click-to-modal) for the toolbar
quick-connect surface? The note recommends inline field as the
closest fit for the named pain, but the author may prefer one of
the others.

### Q3 — Tier 2 backend-discovery default

If Tier 2 is pursued: when the discovery endpoint is reachable
and returns a non-empty list, should the dropdown be primary
(URL field becomes "manual override") or secondary (URL field
stays primary, dropdown is "or pick from discovered")? The
default shapes the user's first-time experience.

### Q4 — Service type naming

If Tier 2 is pursued: `_katago._tcp.local.` (any KataGo wire-
compatible endpoint, generic) or `_kataproxy._tcp.local.`
(specifically a KataProxy, precise)? The latter is more honest
about what's being discovered; the former is more
interoperable if other Go-engine proxies emerge.

### Q5 — Backend URL discoverability

The note focuses on proxy discovery. Backend discovery (the SPA
finding its backend without manual URL configuration) is a
separate question. In the standalone-SPA case (browser only),
the backend's URL is the irreducible configuration. In the
bundled-distribution case, localhost defaults close it. Should
backend discoverability be in scope for Tier 2, or explicitly
out? The note assumes out (proxy only); the author may want it
in.

### Q6 — Zeroconf failure surface

If Tier 2 is pursued: how loudly should zeroconf-discovery
failures surface to the user? Categories: (a) library import
failure on the backend (zeroconf disabled, log only); (b)
no-services-found in normal operation (silent — empty list is a
legitimate state); (c) mDNS port collision or firewall block
(needs surfacing). The note hasn't worked out the loudness
hierarchy in detail; an ADR-0002 application at implementation
time.

---

## 9. What this note is NOT

Per the design-note discipline:

- **Not a commitment to ship.** The author has decision fatigue;
  this note is the durable record while the decision stays open.
- **Not an architectural decision.** Architectural choices (which
  service type, which discovery mechanism, which API contract)
  are deferred to dispatch-time per §7.
- **Not a roadmap.** No dates, no PR sequence. The opening move
  is Q1; subsequent moves depend on what opens.
- **Not a product-thesis statement.** The motivation is the
  author's named friction and named vision, recorded as they
  framed them. The note does not synthesise a "what the product
  is for" position beyond that.

---

## 10. Maintenance contract

Per ADR-0005 Rule 6 (author as you decide) and Rule 8 (sibling
revisions over silent edits):

- **`design-note: planned` → `design-note: implemented`** when
  the work ships. The transition pass also updates the relevant
  worklogs, FEATURES.md (if user-facing surfaces land), and the
  TODO Item 32 closure.
- **If the design is found wrong in a load-bearing way** during
  implementation, file a sibling marked `revised` per ADR-0005
  Rule 8 rather than silently editing this one. The
  qEUBO-namespace-unification-plan's `design-note: revised`
  transition is the worked example.
- **If the work doesn't ship within a reasonable horizon** (the
  author returns to other priorities), the note stays at
  `design-note: planned`. The TODO Item 32 entry remains the
  index-pointer.

---

## 11. Cross-references

- `docs/TODO.md` Item 32 (zeroconf / mDNS service discovery) —
  the originating record. This design note is the detailed plan
  Item 32 anticipated, expanded in scope (Item 32 covered
  backend advertisement; this note adds proxy advertisement and
  the in-toolbar Tier 1 surface).
- `frontend/src/store/defaults.ts:14` — current
  `engine.katago.url` default (`ws://127.0.0.1:41948`).
- `frontend/src/services/analysis-service.ts:93` — current
  consumer of `settings?.katago?.url`.
- `frontend/src/components/chrome/Toolbar.vue` — the toolbar
  surface Tier 1 would extend.
- `frontend/src/components/RegistryEditor.vue` — the existing
  detailed-view surface that stays operational.
- `proxy/run_leaf.sh` — the proxy's local-development default
  that matches the SPA's default URL. Tier 2's advertisement
  would replace the implicit "everyone agrees on
  127.0.0.1:41948" coordination with an explicit advertised
  record.
- ADR-0002 (fail loudly) — applies to zeroconf failure surfaces
  per Q6.
- ADR-0002 Rule 7 (closest-match selection surfaces too,
  appended 2026-05-15) — applies to the service-type naming
  decision per Q4 (`_katago._tcp.local.` is the closest existing
  Go-engine convention; `_kataproxy._tcp.local.` would be a
  fresh vocabulary entry).
- ADR-0003 (frontend portability and domain boundaries) — the
  Tier 1 surface is band 1; Tier 2's discovery integration sits
  between band 1 (the generic backend-mediated discovery
  pattern) and band 2 (the KataGo-specific service type).
- ADR-0005 (documentation discipline) — Rules 2 (dispatch
  ledger), 6 (author as you decide), 8 (sibling revisions).
- `docs/dispatch/proxy-to-frontend-selector-and-capabilities-status.md`
  — the 2026-05-09 capability-negotiation dispatch chain; worked
  example of the contract-settle-then-implement protocol Tier 2
  would follow.
- `docs/notes/distribution-packaging.md` — the bundled-
  distribution arc the author named as the end-game; this note
  is one of its prerequisites for the no-IP-management user
  experience.

---

## 12. License

Public Domain (The Unlicense).
