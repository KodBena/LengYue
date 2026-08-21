# tauri-upstream-setting — independent review (REFUTE posture)

Reviewer worktree: `agent-a474839be439a1514`. Artifact reviewed: branch
`worktree-agent-a8a22b5a272513ce9`, work commit `a5b362a4` (HEAD
`156d5673`), worktree at
`/home/bork/w/omega/.claude/worktrees/agent-a8a22b5a272513ce9`.

Method: findings were formed from independent reading of the diff and
code, and from witnesses run by this reviewer, BEFORE reading the
builder's own report
(`.claude/dispatch-reports/tauri-upstream-setting.md` on the delivery
branch). That report was read only after §1–§6 below were already
written; §7 compares the two.

No `git stash` was used. All mutations happened in a scratch merge
branch (`review-merge-scratch`, built from `next` + a fetched copy of
the delivery branch) inside this reviewer's own isolated worktree; the
delivery worktree was never written to. Live ports were not touched.

## Verdict: **REJECT**

Two independently-verified, reproducible defects contradict explicit
commission requirements and were not caught by the delivery's own test
suite, nor disclosed in its report:

1. A corrupted `proxy-settings.json` crashes the **entire app launch**
   (not just the proxy feature) — directly contradicting the
   commission's explicit ADR-0002 requirement ("corrupted settings
   file ... loud, none fatal to launch").
2. The wizard step's inline validation-error message can never render,
   because it is stored in a non-reactive plain `let`, not a `ref` —
   directly undermining the commission's "validated fail-loud" bar on
   the one surface where a user actually types a value.

Everything else examined (precedence single-homing, non-Tauri
inertness, wizard/settings one-fact-one-home, validator edge cases,
41948/LENGYUE_PROXY_UPSTREAM absence as live defaults, build/typecheck/
test-suite health) held up under adversarial testing. The two defects
above are narrow, mechanically fixable, and don't call the overall
design into question — but they are real, they are exactly the kind of
defect the commission called out by name, and they should not ship
silently.

## 1. Merge onto current `next`

`next` had moved since the delivery branch's base (`f7828c56`) — the
commissioner's port-coherence merge (`d61de898`, purging the `41948`
default and `LENGYUE_PROXY_UPSTREAM` name repo-wide) landed on `next`
**after** the delivery branch's own pre-work merge
(`f7d87f40`, "fast-forward onto current local next"). `git merge-base
next review-scratch-source` confirms this: `f7828c56`, five commits
behind current `next`.

Result: merging the delivery onto current `next` is **not clean**. One
file conflicts — `frontend/src/config/env.ts` — because both branches
touched the same doc comment and the same `KATAGO_WS_URL` fallback
line, with the delivery branch's stale copy still carrying `41948`
where current `next` had already been repointed to the canonical
`1242`. Resolved by hand (keeping `next`'s `1242` default and the
delivery's new `IS_TAURI` export and doc prose). This is a staleness
artifact, not a defect in the builder's own diff — the builder's own
commit never touches that line — but it means the delivery does **not**
fast-forward or auto-merge cleanly onto current `next` today, and a
plain `git merge` without a human resolving the conflict correctly
risks silently reintroducing the retired `41948` default. Flagging per
the review brief's explicit ask to verify clean-merge.

After resolution, confirmed no live occurrence of `41948` or
`LENGYUE_PROXY_UPSTREAM` survives as a default/config value anywhere in
the merged tree (both names appear only in test fixtures using
arbitrary well-formed URLs, and in historical/comparison prose
comments — see §5).

## 2. Witnesses run (on the merged tree, memory-capped per the brief)

| Witness | Result |
|---|---|
| `cargo check` (`systemd-run --user --scope -p MemoryMax=4G`) | **WITNESSED, exit 0.** First attempt failed — `binaries/` in this reviewer's worktree only had `.gitkeep` (Tauri's `externalBin` resource-path check needs the real frozen binaries). Copied both from the main tree's `binaries/` dir per the brief's instruction; re-ran clean. |
| `npx vue-tsc --noEmit` | **WITNESSED, exit 0**, no output. |
| `npx vitest run --silent` (full suite, `NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2`, `nice -n 19`) | **WITNESSED, exit 0.** 157 passed / 3 skipped test files (160), 1851 passed / 4 skipped tests (1855). The 4 new proxy-upstream test files re-run in isolation: 4/4 files, 21/21 tests passed. |

## 3. `resolve_effective_upstream` — single-homed, but not fully fail-safe

Read in full (`frontend/src-tauri/src/proxy_settings.rs`). Confirmed:
- **Single decision point.** `resolve_effective_upstream` is the sole
  place `ENGINE_WS_URL env > stored > DEFAULT_PROXY_UPSTREAM` is
  decided; both `lib.rs`'s `setup()` (line ~261) and the
  `get_proxy_upstream_setting` command call it — no second copy of the
  order exists (ADR-0012 satisfied).
- **Read-before-spawn in every path.** `setup()` calls
  `resolve_effective_upstream` before the proxy sidecar's `.spawn()`,
  unconditionally — first launch (file absent → `Ok(None)` →
  default), a normal launch with a stored value, and env-override, all
  correctly resolved before spawn.

**Defect: the corrupted-file path is fatal to launch, not just loud.**
`read_stored_upstream` correctly returns a loud `Err` on a settings
file that exists but fails to parse as JSON (line 94-95 —
`serde_json::from_str` error). That `Err` propagates through
`resolve_effective_upstream` unchanged. At the **`setup()` call site**
(`lib.rs:261-262`):

```rust
let (proxy_upstream, _stored, _env_override_active) =
    proxy_settings::resolve_effective_upstream(&handle)?;
```

— a bare `?`, no `map_err`/fallback. `setup()`'s `Err` propagates out
of the closure to `.build(tauri::generate_context!())`, which then hits

```rust
.build(tauri::generate_context!())
.expect("error while building the LengYue tauri application")
```

`.expect()` on an `Err` **panics**, before any window is built and
before the *backend* sidecar's window ever shows either — a corrupted
`proxy-settings.json` (an interrupted write, a disk hiccup, a
truncated-to-zero-bytes file, or a hand-edit) takes down the entire
desktop app on every subsequent launch, not merely the proxy feature,
until the user manually finds and deletes the file. This is worse than
the pre-delivery state, where no such file existed to corrupt.

Contrast with the **`get_proxy_upstream_setting`** command path (called
after the webview exists), which is genuinely non-fatal:
`useProxyUpstreamSetting.ts`'s `load()` wraps the `invoke` call in a
`try/catch` and `console.error`s on rejection (confirmed by reading the
composable in full) — the field degrades to "shows empty," exactly the
commission's bar. The builder's own report (§9, "Corrupt-settings-file
recovery UX") discusses only this SPA-side path and does not mention
the `setup()`-time path at all — the fatal branch was missed, not
deliberately descoped.

This is a real, deterministic Rust-semantics bug (not a hypothetical):
`serde_json::from_str` on invalid or empty content reliably errors,
`?` reliably propagates, `.expect()` on `Err` reliably panics. No
`cargo test`/`tauri build` cycle was needed to establish it — the
control flow is fully legible from source, and this reviewer traced it
end to end.

## 4. Wizard-side validation feedback never renders (reactivity bug)

`WizardStepEngineUri.vue`:

```ts
let saveErrorKey = '';
async function commitProxyUpstream(): Promise<void> {
  const result = await proxyUpstream.save();
  saveErrorKey = result.ok ? '' : result.errorKey;
}
```

`saveErrorKey` is a **plain `let`**, not a `ref`. Mutating it inside
`commitProxyUpstream` does not notify Vue's reactivity system, so the
template's `<p v-if="saveErrorKey" ...>` never re-evaluates after a
failed save — the error message the commission requires ("validated
fail-loud") is computed correctly but never reaches the DOM. Contrast
with `SettingsTab.vue`, which does this correctly:

```ts
const proxyUpstreamErrorKey = ref('');
...
proxyUpstreamErrorKey.value = result.ok ? '' : result.errorKey;
```

Confirmed by grep that `SettingsTab.vue` uses `ref('')` while
`WizardStepEngineUri.vue` uses a bare `let`. No existing test exercises
this: all four new test files were read in full, and none of them
submits an invalid value through the **wizard's** DOM input and asserts
the error text appears (`useProxyUpstreamSetting.test.ts` tests the
composable's *return value* directly, which is correct and unaffected
by this bug; the DOM-rendering gap is specific to the wizard
component and untested).

## 5. Non-Tauri inertness, precedence, validation, 41948/name-purge — held up

- **Structural inertness.** `useProxyUpstreamSetting.ts` checks
  `IS_TAURI` first in both `load()` and `save()` and returns/no-ops
  before any `invoke` import/call. `useProxyUpstreamSetting-inert.test.ts`
  uses the REAL (unmocked) `IS_TAURI` (false in jsdom) with an
  `invoke` mock that **throws** if called — a structural guard, not a
  cosmetic one. `wizard-proxy-upstream-non-tauri.test.ts` confirms the
  field is absent from the DOM under the same real-false condition.
  Both pass. **WITNESSED.**
- **Validator edge cases.** `validateEngineUri` (`lib/ws-url.ts`,
  reused, not reimplemented) was fed `http://` (scheme error), `''`
  and whitespace-only (empty error), and `ws://` with no host
  (`new URL('ws://')` throws `Invalid URL` in Node — confirmed by
  direct execution — caught and reported as malformed). All fail loud,
  none silently sanitized. **WITNESSED.**
- **41948 / LENGYUE_PROXY_UPSTREAM.** Grepped the full merged tree.
  `41948` survives only in: test fixtures using it as an arbitrary
  well-formed example value (`ws-url.test.ts`,
  `useEngineUriEditor.test.ts`, `migration-store-roundtrip.test.ts` —
  all pre-existing, untouched by this delivery, unrelated to the
  proxy-upstream feature), and two historical/comparison prose
  sentences (`lib.rs`'s module doc, `README.md`) that describe the
  *prior* default, not a live one. `LENGYUE_PROXY_UPSTREAM` survives
  only in `proxy_settings.rs`'s module doc comment (naming the retired
  var for a reader who might grep for it) and one pre-existing,
  untouched doc comment in `env.ts` that is now slightly stale (still
  describes the Rust-side config as "via `LENGYUE_PROXY_UPSTREAM`" —
  not touched by this delivery, arguably should have been updated
  since this delivery is precisely what retires that mechanism; minor,
  see nits). No live default/config anywhere. **WITNESSED.**
- **Mutation test (store command).** Temporarily changed
  `useProxyUpstreamSetting.ts`'s `save()` to append `'-MUTATED'` to
  the persisted value before calling `invoke('set_proxy_upstream_setting', ...)`,
  reran the wizard/composable tests, reverted. Result: **4 tests
  failed** — `useProxyUpstreamSetting.test.ts`'s persistence tests and
  both `wizard-proxy-upstream-tauri-gate.test.ts` one-fact-one-home
  tests, confirming both the wizard and Settings surfaces' tests do
  catch a break in the shared store command, because they share the
  same composable instance pattern reading/writing the same
  underlying JSON file. **WITNESSED** (mutation reverted; `git diff`
  confirmed clean afterward).
- **Rust-side precedence — coverage gap, not a defect.** No `cargo
  test` exists for `resolve_effective_upstream` or `validate_upstream`
  (confirmed: no `#[cfg(test)]` anywhere under `src-tauri/src/`). The
  TS-side tests only exercise a **hand-written mock** of the Rust
  command's wire shape, not the actual Rust logic — a regression that
  swapped the `env`/`stored` precedence order in `proxy_settings.rs`
  itself would pass every test in this suite. The builder's own report
  discloses this gap honestly (§9). **UNEXERCISED** (disclosed).

## 6. "Next launch, not live" — the engineering justification holds

Assessed per the review brief's instruction to check whether the
double-kill-risk justification is real or a flimsy cover for
descoping "takes effect." Two independent reasons are given
(`proxy_settings.rs:192-209`):

1. A live-respawn command would be a second writer to the same
   `Mutex<Option<CommandChild>>` the `RunEvent::Exit` teardown handler
   already owns exclusively. Confirmed by reading both sites — this is
   real: `std::sync::Mutex` serializes access safely (no data race),
   but the *ordering* risk is real (a respawn mid-flight racing app
   shutdown could leak the new child or double-kill), and the existing
   teardown path was written assuming exactly one owner.
2. Even a perfectly synchronized respawn would not, by itself,
   reconnect the SPA's live WebSocket to the new proxy process — a
   second, independent piece of missing machinery
   (`useEngineUriEditor.ts`'s reconnect dance exists for the SPA's own
   cell, not for a change one layer beneath it).

Point 2 is decisive on its own: a "live" respawn that doesn't
reconnect the SPA would be misleading in a different way (the process
changed but nothing observable did), so descoping to "next launch,
not live" is not simply the easier engineering path — it avoids
shipping a half-live feature. The UI states the caveat plainly and
persistently (`proxyUpstream.hint`: "Takes effect the next time you
launch the app, not immediately") on both the wizard and Settings
surfaces. This scope restriction is **ratified** — it is disclosed,
justified with two independent reasons (not just the more convenient
one), and the UI is honest about it. Not a de-scope collapse.

One associated nit: `proxyUpstream.restartNotice` — the i18n key that
reads as if it's meant to be a distinct "Saved" confirmation shown
right after a successful commit — is defined but **never referenced**
in either `WizardStepEngineUri.vue` or `SettingsTab.vue` (grepped:
zero non-definition occurrences). The builder's report discloses this
(§6, "unused directly — superseded by folding into `.hint`"), so it's
not a hidden gap, but it does mean a user who saves a valid value gets
no positive feedback distinguishing "just saved" from "always been
this value" — only the same persistent hint before and after. Minor
UX gap, not a correctness defect.

## 7. Comparison against the builder's own report

Read only after the above was written. The builder's report
(`.claude/dispatch-reports/tauri-upstream-setting.md` on the delivery
branch) is thorough and its claims for what it covers check out under
independent re-verification (cargo/vue-tsc/vitest exit codes,
41948/LENGYUE_PROXY_UPSTREAM grep results, one-fact-one-home structure,
non-Tauri inertness, the live-respawn rejection rationale). It also
honestly discloses the missing Rust-side test coverage and the
SPA-side (not setup-side) corrupted-file handling.

What it does **not** surface, and this review adds:
- The `setup()`-time fatal-crash path on a corrupted settings file
  (§3) — a real gap in a claim the report implicitly makes (by
  discussing ADR-0002 compliance only for the SPA-side read).
- The wizard's non-reactive `saveErrorKey` (§4) — a concrete rendering
  bug the report's own "WITNESSED" claims for the wizard field never
  actually exercised (its tests check DOM presence/absence and
  round-trip values, never a failed-validation render).
- The merge-onto-current-`next` conflict (§1) — orthogonal to the
  builder's own diff (their commit never touches the conflicting
  lines), but real as of today's `next` tip, and worth naming so a
  merger doesn't resolve it toward the stale `41948` side by accident.

## Findings summary (WITNESSED / REFUSED-AS-EXPECTED / UNEXERCISED)

| # | Finding | Status | Severity |
|---|---|---|---|
| 1 | Corrupted `proxy-settings.json` panics the whole app at `setup()`, not just the proxy feature | **WITNESSED** (traced deterministically; not executed via a full `tauri build`) | **Blocking** — contradicts explicit ADR-0002 commission requirement |
| 2 | Wizard's validation-error message never renders (`let` not `ref`) | **WITNESSED** (code + absence of any covering test) | **Blocking** — contradicts "validated fail-loud" on the surface a user types into |
| 3 | No `cargo test` coverage for `resolve_effective_upstream`/`validate_upstream` | **UNEXERCISED**, disclosed by builder | Nit — follow-up |
| 4 | `proxyUpstream.restartNotice` i18n key defined, never rendered | **WITNESSED**, disclosed by builder | Nit |
| 5 | `env.ts`'s pre-existing doc comment still says the Rust-side upstream is "via `LENGYUE_PROXY_UPSTREAM`" | **WITNESSED**, not disclosed (pre-existing, untouched, now stale given this delivery retires that name) | Nit |
| 6 | Delivery branch does not merge cleanly onto current `next` (`env.ts` conflict, staleness from `next` moving after the branch's own pre-work merge) | **WITNESSED** | Process nit — resolve toward `next`'s canonical values, not the delivery's stale side |
| 7 | Precedence single-homed (`resolve_effective_upstream` sole decision point, called identically pre- and post-webview) | **WITNESSED** | Pass |
| 8 | Non-Tauri inertness structural (no invoke reachable, gated at composable level before any import) | **WITNESSED** | Pass |
| 9 | Wizard/Settings share one persisted cell (round-trip + mutation test) | **WITNESSED** | Pass |
| 10 | Validator edge cases (`http://`, empty, whitespace, `ws://` no host) fail loud, no silent sanitize | **WITNESSED** | Pass |
| 11 | `41948`/`LENGYUE_PROXY_UPSTREAM` absent as live defaults/config | **WITNESSED** | Pass |
| 12 | `cargo check` / `vue-tsc` / `vitest run` on merged tree | **WITNESSED**, all exit 0 | Pass |
| 13 | "Next launch, not live" scope restriction — ratification | **WITNESSED** — two independent, substantive reasons; UI discloses honestly | Ratified |

## Scope restrictions and ratification status

- **"Takes effect on next launch, not live"** — ratified (§6): two
  independent technical reasons, UI states it plainly and persistently
  on both surfaces.
- **No live sidecar respawn machinery** — a corollary of the above,
  same ratification.
- **No Rust-side unit tests** — not ratified as a scope restriction
  exactly, but disclosed as a conscious judgment call by the builder
  (§9 of their report), not silently dropped.
- **Corrupted-file handling scoped to the SPA-side read path only**
  — **not disclosed as a restriction at all**; the builder's report
  frames corrupted-file handling as solved (ADR-0002 satisfied) without
  naming that the `setup()`-time read path was left out. This is the
  one place this review found an unratified, undisclosed narrowing of
  an explicit requirement, not just an incomplete implementation of a
  disclosed one.
