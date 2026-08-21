# proxy-setup-instructions — engine-URI instruction surface for the KataProxy delivery (ledger rows 820/827)

Branch: `worktree-agent-afa692b62878a1357`
Commit: recorded at the end of this report (see the trailer).

Worktree provenance disclosure: this session's worktree started at
`3378806f`, 208 commits behind the local `next` branch's tip
(`a155140c`), clean working tree, zero commits ahead of `3378806f`.
Fast-forwarded via `git merge --ff-only next` before any code was
read, per the standing instruction to disclose this.

## Commission recap

Per ledger rows 820/827: "Before setup, the user will be instructed to
provide a websocket location for that [the upstream engine]" — the
instruction surface for the now-landed KataProxy deliveries (Docker
`proxy` service + Tauri proxy sidecar, both packaged in prior sessions
— `.claude/dispatch-reports/kataproxy-docker.md`,
`kataproxy-tauri.md`). Three deliverables: the wizard's engine-URI
step copy, a README/docs "provide your engine" surface, and a wiki
note. Scope: instruction surfaces only — no behavioral/wiring changes,
no new settings UI.

## What was read before touching anything (ADR-0002 corollary)

`CLAUDE.md` (umbrella), `frontend/CLAUDE.md`, `frontend/tests/CLAUDE.md`
end to end; both KataProxy dispatch reports
(`kataproxy-docker.md`, `kataproxy-tauri.md`) end to end;
`docs/docker.md`'s "The KataProxy service" section (and its
neighbours) end to end; `frontend/README.md`'s "Desktop app (Tauri
v2)" section end to end; `README.md` (umbrella) end to end;
`WizardStepEngineUri.vue`, `useEngineUriEditor.ts`'s header comment,
`backend/scripts/katago_ws_shim.py`'s module docstring (its own
`--help` reference — could not exec it directly, `websockets` isn't
installed in this environment; the docstring's `Usage` section is
the authoritative reference and was read in full); the
`i18n-messages-compile.test.ts` and `wizard-one-fact-one-home.test.ts`
tests to confirm no catalog-parity or mechanics assertion would be
broken by a copy-only change.

## 1. Wizard step copy — WITNESSED

`frontend/src/locales/en.json`, keys `wizard.step.engineUri.description`
and `wizard.engineUri.hint` (title and label left unchanged). New
copy explains the topology: the field sets what the app itself
connects to (normally the local proxy, already wired up in the
Docker/desktop builds); the actual KataGo engine is configured
separately per packaging (Docker's `ENGINE_WS_URL` at compose time,
desktop's proxy-upstream env var); running from source the field may
point straight at an engine or any proxy in the chain. The hint line
adds a pointer to `docs/docker.md` for the full story, keeping the
description itself to one paragraph per the brief ("wizard copy, not
a manual").

**Other catalogs not touched, deliberately**: `ja.json`, `ko.json`,
`zh-CN.json` carry **zero** `wizard.*` keys today (435 lines each vs
`en.json`'s 737) — confirmed by grep before editing. `src/i18n/index.ts`'s
own header comment documents this as intentional ("the CJK trio ships
as `{}` until native-speaker review"), with `fallbackLocale: 'en'`
covering the gap. `i18n-messages-compile.test.ts` (the only catalog
test found, searched for any zh-CN/ja/ko-keyed test — none exist)
compiles only `en.json`'s keys. Adding partial wizard-key coverage to
the CJK catalogs would be a scope expansion inconsistent with the
project's own stated i18n rollout posture, not a fix this task
implied.

**Mechanics unchanged**: `WizardStepEngineUri.vue` itself was not
touched — same composable, same input, same store cell
(`profile.settings.engine.katago.url`), confirmed against
`wizard-one-fact-one-home.test.ts`'s ADR-0012 "one cell, one home"
posture (that test doesn't cover this step directly, but the
composable-reuse discipline it enforces elsewhere was the same
reasoning applied here — no second cell, no new mechanism).

## 2. README/docs "Provide your engine" — WITNESSED

`README.md` (umbrella root): new "Provide your engine" section
inserted between "Cloning" and "Running" — before any setup steps,
per the brief. States plainly that the app needs a KataGo-speaking
WebSocket endpoint, that it never talks to KataGo directly (always
through KataProxy), and names `backend/scripts/katago_ws_shim.py` as
the provided way to wrap a bare `katago` binary, pointing at its
`--help` for the full option list. Points to `docs/docker.md` ("The
KataProxy service") and `frontend/README.md` ("Desktop app (Tauri
v2)") for the per-packaging knob.

Also corrected an adjacent stale line in the "Running via Docker
instead" section — it still read "KataGo/KataProxy are not
containerized in v1," which directly contradicts `docs/docker.md`'s
own documented `proxy` service (landed in a prior session, this
README line was never updated to match). Fixed to say KataProxy IS
containerized; only KataGo itself (native, GPU-bound) stays external.
This is a documentation-accuracy fix directly adjacent to the new
section's own claims, not a scope expansion — leaving it stale would
have had the new "Provide your engine" section contradict the
paragraph two lines below it.

`docs/docker.md` was **not** edited — it already carries a thorough
"The KataProxy service" section (topology diagram, `ENGINE_WS_URL`
shapes, the katago_ws_shim.py pointer under "Sharing one engine
process across multiple clients", the no-upstream-configured failure
mode) from the prior `kataproxy-docker` session. The brief's own
phrasing ("or extend the existing docs/docker.md + a README pointer")
sanctions choosing the README-pointer path when the docs file is
already complete; re-reading it end to end confirmed there was
nothing missing that this task's scope would add.

## 3. Wiki note — WITNESSED

Page `Notes:OmegaGo issues` on the anonymous mediawiki API
(`http://192.168.122.68:8080/api.php`). Flow: `action=query&meta=tokens&type=csrf`
returned the anonymous-edit placeholder token; `action=edit` with
`appendtext` (10 lines of wikitext: one `==` heading + 5 bullets)
and an edit summary. Response: `{"edit":{"result":"Success",
"pageid":797,"oldrevid":1900,"newrevid":1901,...}}`. Re-fetched the
page afterward and confirmed the appended section renders as
intended wikitext (bold, `<code>` spans, the `''next''` italic
convention the page already uses).

Content: the two packagings (Docker service, Tauri sidecar), the
per-packaging upstream knob (`ENGINE_WS_URL` / `LENGYUE_PROXY_UPSTREAM`),
the katago_ws_shim.py pointer, a one-line note that the wizard copy
and README were updated, and an explicit callout that an in-app
upstream setting for the Tauri sidecar remains a known deferred
follow-up (not re-deferred by this session — stated as already on
record, matching the standing constraint).

## Gates

- `npx vue-tsc --noEmit` — **WITNESSED, exit 0.** (`npm install` was
  required first — the worktree had no `node_modules/`; not a scope
  item, just environment setup.)
- `npx vitest run --silent` (under `nice -n 19` +
  `NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=2
  VITEST_MAX_FORKS=2`) — **WITNESSED, exit 0.** 153 passed / 3 skipped
  test files, 1830 passed / 4 skipped tests — the same green baseline
  the `kataproxy-tauri` session recorded (153/3, 1827/4; four
  additional passing tests here are pre-existing suite growth on
  `next` between that session and this one's fast-forward, not
  something this change added).

## Scope discipline

No behavioral change to proxy wiring, no new settings UI. The
Tauri-sidecar in-app upstream setting was named as a known deferred
follow-up in both the wizard-copy prose (implicitly — copy explains
the *current* mechanism, not a hypothetical one) and explicitly in
the wiki note; not built, not re-deferred as if newly discovered.
Ports 4173/5173/5174/8764/19080-19082 were never touched — this
session ran no dev servers or containers, only `npm install`,
`vue-tsc`, `vitest`, and HTTP calls to the wiki API (a non-live-port
service). No `git stash` used.

## Files changed

| File | Change |
|---|---|
| `README.md` | New "Provide your engine" section; corrected stale "not containerized" line |
| `frontend/src/locales/en.json` | `wizard.step.engineUri.description` and `wizard.engineUri.hint` rewritten to explain SPA→proxy→upstream topology |
| `.claude/dispatch-reports/proxy-setup-instructions.md` | This report |

External (non-git) change: `Notes:OmegaGo issues` wiki page, revision
1900 → 1901.

Commit sha: see `git log --oneline -1` on this branch after the
commit that carries this report.
