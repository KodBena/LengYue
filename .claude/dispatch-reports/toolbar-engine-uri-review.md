# Fresh-context review — toolbar-engine-uri (commission row 713)

(Written to the worktree-local `.claude/dispatch-reports/` — the harness
refused a write to the shared-checkout path
`/home/bork/w/omega/.claude/dispatch-reports/` from inside this
worktree-isolated agent, same fallback the builder's own report used.)

Reviewer posture: REFUTE. Findings below were formed from the diff, the cited
ADRs (read in full: ADR-0012 compositional/structural hygiene — all ten
principles, ADR-0010 render-locality, ADR-0002 fail-loudly; plus
`frontend/CLAUDE.md` and `tests/CLAUDE.md` end to end), and my own gate runs
and probes — the builder's self-report
(`.claude/dispatch-reports/toolbar-engine-uri-build.md`) was read only after
the findings below were already formed, and is cited only where it
independently corroborates something already found from the code.

Artifact reviewed: commit `5a397133` ("feat(frontend): engine WebSocket URI
in the toolbar (toolbar-engine-uri)"), checked out detached in this worktree.

## Verdict: **MERGE-WITH-FIXES**

One witnessed BLOCKER (a real, reachable false error toast), one REQUIRED
documentation-accuracy fix, and one design-level point that should go back
to the commissioner rather than be silently accepted as satisfied. Build,
full suite, and lint are otherwise clean, and the "same cell" / reconnect /
render-locality shape of the delivery is sound.

---

## BLOCKER — Escape can push a spurious "invalid URI" error, exactly through the RegistryEditor asymmetry the commission flagged for scrutiny

**Claim under test:** the spec's "Escape reverts" acceptance property —
cancelling an edit should discard the draft and leave the world exactly as
if the toolbar editor had never been touched (no store write, no visible
side effect).

**What's actually there.** `ToolbarEngineUri.vue`'s `onEscape()`:

```ts
function onEscape(): void {
  cancel();
  inputEl.value?.blur();
}
```

`cancel()` sets `isEditing.value = false` and resets `draft.value =
storedUri.value` (a **live** read of the shared cell at that instant).
`isEditing.value = false` schedules removal of the `<input>` via `v-if`, but
Vue's DOM patch is deferred to a microtask — so at the moment the very next
line calls `.blur()`, the `<input>` is still mounted with its
`@blur="commit"` listener attached. The native `blur` event fires
synchronously and re-invokes `commit()` — a **second** commit attempt the
user never asked for, using whatever `draft.value` cancel() just set (i.e.
the live stored value).

In the ordinary case this second call is a harmless no-op (`commit()`'s
`next === storedUri.value` early return). But the stored cell has **two
editors of unequal strictness** (this PR's own admitted asymmetry): the
Settings tab's `RegistryEditor.vue` writes `store.profile.settings` on
**every keystroke** via `updateProfileAt`, with **zero validation**
(confirmed by reading `RegistryEditor.vue`'s scalar-input branch,
`@input="(e) => handleUpdate(key, e.target.value)"`, and
`SettingsTab.vue:139`'s `<RegistryEditor :registry="store.profile.settings" ... @update="handleSettingsUpdate"/>` → `updateProfileAt(e.path, e.value)`
directly, no validate step). `Toolbar.vue` mounts `ToolbarEngineUri`
**unconditionally**, so it and `SettingsTab`'s Advanced Registry section can
both be live in the DOM at once. If the user (or, more benignly, a mid-typed
character while the user is retyping the URL in Settings) leaves the shared
cell holding a value `validateEngineUri` rejects, and the toolbar editor is
open, pressing **Escape** — the cancel affordance — pushes a visible error
toast ("Engine URI is not a valid URL.") instead of silently reverting.

**WITNESSED — red then green**, driven through the real component (not the
composable in isolation, which is all the delivered suite exercises):

- Mounted `ToolbarEngineUri.vue` with `@vue/test-utils` (`attachTo:
  document.body`, so jsdom focus/blur is real), clicked to open the editor,
  confirmed the input has real DOM focus.
- **GREEN control** — cell stays at the valid default throughout, Escape →
  `store.engine.messages` has no `error` entries. Passed.
- **RED** — externally wrote `store.profile.settings.engine.katago.url =
  'not a uri at all'` via `mutateProfile` (simulating the RegistryEditor
  keystroke path) while the toolbar editor was open, then dispatched
  `keydown.Escape` on the input. Result:
  ```
  AssertionError: expected [ { id: 'ki1s087', …(3) } ] to deeply equal []
  - []
  + [{ "id": "ki1s087", "text": "Engine URI is not a valid URL.", "type": "error", ... }]
  ```
  Confirmed via an added `blur` listener that the native blur event does
  fire on the still-mounted input at that point (`NATIVE BLUR FIRED`
  observed before the assertion).
- Isolated the mechanism further with a plain jsdom probe (no Vue): removing
  a **focused** element from the document via `.remove()` does **not** by
  itself fire a `blur` event (`activeElement` silently falls back to
  `<body>`, no listener invoked) — so the bug is entirely attributable to
  the **explicit** `inputEl.value?.blur()` call in `onEscape()`, not to
  Vue's `v-if` teardown.
- Both probe files were scratch (`tests/integration/_scratch-*.test.ts`),
  deleted after capturing the transcript above — not part of the delivery.

**Why the delivered suite didn't catch it.** `useEngineUriEditor.test.ts`'s
"Escape reverts" coverage calls `editor.cancel()` directly on the composable
— it never drives the real leaf's `@blur`/`@keydown.esc` DOM wiring, so the
one code path where the bug actually lives (the redundant `.blur()` call
racing the still-bound listener) was structurally invisible to it.

**REQUIRED (exact compose step).** Either:
1. Delete the `inputEl.value?.blur()` line in `onEscape()` — the jsdom probe
   above shows it buys nothing (removal already clears `activeElement`); or
2. (More robust, guards any future forced-blur call site) add an early
   return to `commit()`: `if (!isEditing.value) return;` — a commit
   attempted after edit mode has already been exited is definitionally
   stale.

I'd take (2) as the primary fix and keep (1) as a related cleanup, since (2)
also closes the same class of bug for any other forced-blur call that might
be added later.

---

## REQUIRED — `ws-url.ts` and `useEngineUriEditor.ts` overclaim that both editors validate

`src/lib/ws-url.ts`'s header comment: *"the single check both editors of
`store.profile.settings.engine.katago.url` apply before committing a new
value."* `useEngineUriEditor.ts`'s header repeats the framing ("this
composable is a second EDITOR of that cell"). Neither is true as shipped:
`RegistryEditor.vue`'s leaf for this exact path calls `validateEngineUri`
**nowhere** — it's the same untyped `<input>`/`updateRegistry` path every
other scalar registry leaf uses, unchanged by this PR. The builder's own
dispatch report says so plainly ("It is NOT wired into `RegistryEditor.vue`'s
generic `engine.katago.url` leaf... left out under ADR-0004 minimal-touch"),
which makes the source-file comment's claim a documentation defect, not a
disputed reading — the code comment asserts a fact the code doesn't honor
(the same "lying signature" shape ADR-0012 P8/ADR-0002 name, here in prose
rather than a type). Fix: reword both headers to state plainly that only the
toolbar path validates today, and that the cell's "always a valid ws(s)
URI" invariant is **not** enforced end-to-end.

---

## REQUIRED-FOR-DISCUSSION (not a code defect; a scope call that should go back to the commissioner)

The commission text says *"same validation as settings."* Read plainly,
that's a substantive requirement — the two editors of one cell should agree
on what they'll accept. As shipped, it's true only vacuously, because the
settings path enforces nothing. That means the store cell's real invariant
("holds a syntactically valid `ws://`/`wss://` URI") is **not** actually
guaranteed regardless of entry point — exactly the ADR-0012 P2 shape (a
boundary that translates-and-validates on one entry path and silently
accepts anything on a structurally identical sibling path to the same
fact). The builder's dispatch report discloses the narrowing honestly and
cites ADR-0004 minimal-touch as the reason for leaving `RegistryEditor`
unchanged — that's a legitimate call to make, but it's the commissioner's
call to ratify, not something this review should wave through silently. I'd
send it back as: *"same validation as settings" was interpreted as
"whatever settings does today (nothing)" — is that acceptable, or should
`RegistryEditor`'s leaf for this one path also route through
`validateEngineUri` (even as a small, separate follow-up)?* This does not
block merge on its own — the BLOCKER above is the thing actually breaking
today — but it should not be treated as silently resolved by this PR either.

---

## ADVISORY — silent last-write-wins on concurrent edits of the shared cell

While the toolbar editor holds an uncommitted local `draft`, an external
write to the same cell (a RegistryEditor keystroke, a future sync/hydrate
write) is invisible to that draft; on commit, the toolbar unconditionally
overwrites whatever the external writer just put there, no conflict
surfaced. Probably fine for a single-user local profile store, but it's the
same "two writers of one truth" shape the review was asked to look for, and
it isn't called out anywhere in the PR. Not blocking — a one-line
acknowledgement in `useEngineUriEditor.ts`'s docstring would do.

## ADVISORY — no IPv6 test, but behaves correctly

Spot-checked (not part of the delivered suite): `validateEngineUri('ws://[::1]:8080')`
and a `wss://host/path?query=1` form both accept correctly via the
platform `URL` constructor, matching the delivered unit tests' coverage of
ports/paths. Worth a unit-test line for IPv6 given KataGo is often run
loopback-only, but not a gap that changes behavior today.

---

## Things checked and found sound (WITNESSED)

- **Same cell (ADR-0012 P1).** `storedUri` and `RegistryEditor`'s read both
  resolve to the identical `store.profile.settings.engine.katago.url`
  reactive leaf; the delivered "same cell" tests exercise both write
  directions and pass. Confirmed by direct read of `mutateProfile` /
  `updateProfileAt` (`store/profile-owner.ts`) — both are named mutators
  over the same deep-reactive `store.profile` object, no second field.
- **Render locality (ADR-0010).** `useEngineUriEditor` reads only
  `storedUri` (low-frequency: changes only on an explicit edit) and reads
  `isConnected` **inside `commit()`**, a plain function-call context, never
  inside the component's render/template — so it establishes no reactive
  dependency on connection-status churn, and touches `store.engine.metrics`
  nowhere. `ToolbarEngineUri.vue`'s template reads only `storedUri`,
  `isEditing`, `draft` — no per-tick metric. Confirmed by grep: `metrics`
  does not appear in either new file. No imperative-escape machinery is
  needed and none was added, correctly per the ADR.
- **Reconnect only-when-connected.** Delivered tests + code read confirm:
  editing while disconnected writes the cell and does **not** call
  `connect()`/`disconnect()`. `disconnect()` → `connect()` ordering
  (matching the toolbar's own CONNECT/DISCONNECT button pair) is asserted
  via `mock.invocationCallOrder` and passes.
  `analysis-service.ts`'s `connect()`/`disconnect()` are synchronous
  top-level calls (no `await` between them in `commit()`), so no
  interleaving race at the JS-call level; this reuses the existing
  button's semantics rather than inventing new ordering.
  ✓ Enter-then-unmount does **not** double-fire `commit()` the way Escape
  does — verified via the jsdom probe above that DOM removal of a focused
  node doesn't itself fire `blur`; Enter's own commit already makes
  `draft === storedUri`, so even if it did double-fire it would be a no-op.
- **`--surface-0` / other CSS custom properties.** All variables the new
  `<style>` block references (`--surface-0`, `--border-3`, `--text-1`,
  `--accent-primary`, `--space-tight`, `--text-tiny`, `--text-emphasis`,
  `--radius-default`, `--tracking-default`) are defined in both the dark
  and "cluster" theme blocks of `theme.css`.
- **i18n.** New keys (`engineUri.label/placeholder/error.*`) contain no
  literal `{`/`}` needing escaping.
- **`FILES.md`.** All three new files (`ToolbarEngineUri.vue`,
  `useEngineUriEditor.ts`, `ws-url.ts`) are correctly inserted in
  alphabetical position with correct band tags (`[B3]`, `[B3]`, `[B1]`);
  the `utils.ts` row's tree-connector (`└` → `├`) was correctly updated
  since `ws-url.ts` is now the new last entry.
- **Teardown/listeners.** `ToolbarEngineUri.vue` registers no
  `ResizeObserver` / global listener — only Vue-managed template
  bindings, cleaned up automatically on unmount. No `onUnmounted` needed
  and none was skipped.
- **Validator strictness.** Unit-tested and spot-checked: rejects empty,
  whitespace-only, unparseable, `http://`, `file://`; accepts `ws://` /
  `wss://` with ports, paths, query strings, IPv6 host literals.

---

## Gates (run myself, memory-capped: `nice -n 19` + `NODE_OPTIONS=--max-old-space-size=2048` + `VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2`)

- `npm run build` (`vue-tsc -b && vite build`) — **exit 0**. 1085 modules
  transformed, no type errors (pre-existing >500kB chunk-size warning,
  unrelated to this change).
- `npm run test:run` — **exit 0**. 83 files / 1118 tests passed, 3 files /
  4 tests skipped (pre-existing, unrelated).
- `npx eslint .` — **exit 0**, no findings.

All three green — but see the BLOCKER above: green here does not mean the
acceptance property actually holds, because the only test exercising
"Escape reverts" bypasses the DOM layer the bug lives in.

## Files reviewed

- `frontend/src/components/chrome/ToolbarEngineUri.vue` (new)
- `frontend/src/composables/useEngineUriEditor.ts` (new)
- `frontend/src/lib/ws-url.ts` (new)
- `frontend/src/components/chrome/Toolbar.vue` (modified — mount site)
- `frontend/src/components/editors/RegistryEditor.vue` (read, not
  modified — the asymmetric sibling editor)
- `frontend/src/components/SettingsTab.vue` (read — confirms
  `RegistryEditor` wiring for `store.profile.settings`)
- `frontend/src/composables/useEngineControls.ts` (read — confirms
  `isConnected`/`connect`/`disconnect` are cheap, side-effect-free reads)
- `frontend/src/services/analysis-service.ts` (read — `connect()`
  resolution order and synchronicity)
- `frontend/src/store/profile-owner.ts` (read — `mutateProfile` /
  `updateProfileAt` semantics)
- `frontend/tests/integration/useEngineUriEditor.test.ts`,
  `frontend/tests/unit/lib/ws-url.test.ts` (read — delivered coverage)
- `frontend/FILES.md`, `frontend/src/locales/en.json`,
  `frontend/src/assets/css/theme.css` (spot-checked)

## Law consulted (read in full)

`law/adr/0012-compositional-and-structural-hygiene.md` (all ten
principles + amendments), `law/adr/0010-render-locality-and-canvas.md`,
`law/adr/0002-fail-loudly.md`; `frontend/CLAUDE.md`, `tests/CLAUDE.md`,
umbrella `CLAUDE.md` (auto-loaded).
