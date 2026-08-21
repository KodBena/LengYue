# port-coherence — docker + documentation side (commission ledger row 864)

Branch: `worktree-agent-a37c9f075b119c592`
Base at start: worktree `HEAD` was `3378806f`, 210 commits behind `next` (`f7828c56`).
Fast-forwarded (`git merge --ff-only next`) before reading any code, per the dispatch's
first-action instruction. No conflicts; disclosed here per that instruction.

## Commission recap

Commissioner (row 864, verbatim): "We now have about 3012394 different ports scattered
throughout this travesty of an application... Can we have some sort of coherence at
least between the tauri and docker? The user should at worst have to provide 1 port:
the one that serves the websocket leaf (shim)." Ratified scheme: the KataGo WS shim's
default port, **1242**, is the single user-facing port; both packagings' upstream
defaults converge on it. My scope: docker + documentation. A parallel builder owns the
Tauri side.

**Mid-task refinement from the coordinator** (received after the initial brief):
(1) the dev-default question the brief told me to surface is answered — yes, change
the SPA's plain-dev default engine URI to `ws://127.0.0.1:1242` too; (2) the upstream
override env var has one canonical name across all packagings, `ENGINE_WS_URL`
(docker's existing name) — normalize any other name found in docs touched, and don't
document the Tauri side's dying `LENGYUE_PROXY_UPSTREAM` name anywhere. Addressed below.

## Claims, per item

1. **WITNESSED — shim default port is already 1242, no change needed.**
   `backend/scripts/katago_ws_shim.py`: `DEFAULT_PORT = 1242` (line 86), `--host`/`--port`
   default doc comment already said "127.0.0.1:1242". No port change required. Added one
   docstring paragraph stating explicitly that 1242 is the canonical port every packaging
   converges on (it previously documented the default without saying it was the
   cross-packaging canonical choice).

2. **WITNESSED — `docker-compose.yml`'s `UPSTREAM_URLS` now defaults to the shim.**
   Changed `UPSTREAM_URLS: ${ENGINE_WS_URL:-}` to
   `UPSTREAM_URLS: ${ENGINE_WS_URL:-ws://host.docker.internal:1242}`. Rewrote the
   surrounding comment block (both the service-level comment and the file-header quick-start
   comment) honestly: unset no longer crash-loops (`UPSTREAM_URLS` is never empty now), it
   assumes the shim is running on the host at its default port and logs loud connect
   failures per query until it appears. Published ports 19080/19081/19082 left untouched
   (fixed packaging internals, confirmed still user-agnostic).

3. **WITNESSED (by reading prior evidence) — unreachable-but-set upstream is still
   running-and-loud, not crash-looping.** Re-read
   `.claude/dispatch-reports/kataproxy-docker.md` witness item 4 in full: proxy run
   standalone with `UPSTREAM_URLS=ws://192.0.2.1:41948` (syntactically valid, unroutable)
   reached `Up` and *stayed* `Up`, logging
   `event=upstream_disconnect ... cause="connect_failed: timed out during opening
   handshake"` per query, then `"listening on ws://0.0.0.0:41949"` — server accepts
   connections and returns a "no connected upstreams" error rather than hanging or
   restarting. This is the exact code path my compose change now exercises by default
   (RELAY role, one non-empty-but-unreachable `UPSTREAM_URLS` entry) — same role,
   same construction path, only the specific unreachable URL differs
   (`ws://host.docker.internal:1242` vs. the report's `ws://192.0.2.1:41948`). Did not
   re-run a scratch stack for this — the code path is unchanged from what item 4 already
   witnessed, and a full scratch build (git-clone KataProxy + native-extension compile +
   npm build) is not "cheap" relative to reusing directly-applicable prior evidence.
   Docker was confirmed available (`docker --version` / `docker compose version`) in case
   a scratch run had been needed.

4. **WITNESSED — `docs/docker.md` gained the port table near the top**, covering every
   deployment shape (Vite dev 5173/5174, Vite preview 4173, backend dev 8764, Docker
   19080/19081/19082, Tauri sidecars "OS-assigned, injected", shim/leaf 1242) with a
   "who needs to care" column reading "Nobody" for everything but the shim row. Also
   rewrote: Quick start (zero-config-via-shim framing), the `ENGINE_WS_URL` shapes list
   (shim-default-first, LAN example changed from stale `41948` to `1242`), "What happens
   with no upstream configured" (full rewrite — the old text asserted "unset triggers
   RELAY's ValueError," which is no longer true given item 2's default; new text
   distinguishes "truly empty `UPSTREAM_URLS`" (still ValueError/restart-loop, only
   reachable now via an explicit `ENGINE_WS_URL=`) from "set-but-unreachable" (the new
   default case: up, loud, no restart)), and the matching Troubleshooting bullet.

5. **WITNESSED — README.md "Provide your engine" gained one sentence** stating the shim's
   defaults are found by every packaging, and its port (1242) is the only one a user would
   ever type.

6. **WITNESSED — dev-default coherence, per the coordinator's refinement.** Changed the
   SPA's plain-dev fallback from `ws://127.0.0.1:41948` to `ws://127.0.0.1:1242` in:
   - `frontend/src/config/env.ts` (`KATAGO_WS_URL` fallback + doc comment)
   - `frontend/src/store/defaults.ts` (`defaultSettings.engine.katago.url`)
   - `frontend/.env.example` (`VITE_KATAGO_WS_URL`, with an added comment naming this as
     the cross-packaging canonical port)
   - `frontend/Dockerfile` (`ARG VITE_KATAGO_WS_URL` default, kept in sync with
     `.env.example` per the file's own stated convention)
   - `frontend/src/locales/en.json` (`wizard.engineUri.hint` example URL)
   - Two stale doc-comment references to `41948` fixed for accuracy (not behavioral):
     `frontend/src/composables/perf/scenarios.ts` and
     `frontend/src/components/chrome/ToolbarEngineUri.vue`.

7. **WITNESSED — 41948-purge grep evidence.** Repo-wide grep for `41948` (excluding
   `.claude/dispatch-reports/` and `.claude/logs/`, which are session-artifact history, not
   docs or defaults) after all edits:
   ```
   docs/handoff-current.md:294       — flagged, see "Left untouched" below
   frontend/README.md:99,116         — flagged, see "Left untouched" below
   frontend/tests/integration/migration-store-roundtrip.test.ts:143  — legacy v1 fixture, see below
   frontend/tests/unit/lib/ws-url.test.ts:18,26,48                   — arbitrary example URL, see below
   frontend/tests/integration/useEngineUriEditor.test.ts:48,102,139,142,156,159 — arbitrary/explicit test values, see below
   ```
   None of these are "defaults" in the sense the commission's purge instruction targets
   (a value a fresh install/build resolves to); each is addressed individually below.

8. **ENGINE_WS_URL naming normalization**: grepped every doc I touched
   (`docs/docker.md`, `README.md`, `docker-compose.yml`) for `LENGYUE_PROXY_UPSTREAM` or
   any other name for "the upstream engine URL" — none found; `ENGINE_WS_URL` was already
   the only name used in every file I touched, so no normalization edit was needed there.
   Per the coordinator's instruction, did not introduce or document
   `LENGYUE_PROXY_UPSTREAM` anywhere in my changes.

## Left untouched, and why (flagged, not silently dropped)

- **`docs/handoff-current.md:294`** — states a single dev LEAF on `127.0.0.1:41948`
  "is exactly what the frontend's default config expects (matching `proxy/run_leaf.sh`'s
  default)". The frontend default is now 1242 (item 6), so this sentence is stale. Fixing
  it accurately requires knowing `proxy/run_leaf.sh`'s actual default port, which requires
  reading the `proxy/` submodule — **not checked out in this worktree**
  (`git submodule status proxy` shows the `-` prefix = uninitialized), and the proxy is
  explicitly a separately-developed, separately-scoped project per this repo's own
  `CLAUDE.md`. Rather than guess or touch a cross-boundary fact I can't verify, flagging
  this as a finding: `docs/handoff-current.md`'s dev-LEAF orientation paragraph needs a
  follow-up pass (by whoever can check out/read the `proxy/` submodule) to state the
  frontend's new 1242 default and re-verify whether it still "matches" `run_leaf.sh`'s
  own default or not.
- **`frontend/README.md:99,116`** — the Tauri desktop-shell section, describing
  `LENGYUE_PROXY_UPSTREAM`'s historical fallback (`ws://127.0.0.1:41948`) and comparing it
  to `env.ts`'s old default. This is the parallel Tauri builder's active surface (their
  brief covers `LENGYUE_PROXY_UPSTREAM`'s retirement and `src-tauri/src/lib.rs`, which
  still reads `41948` as of this fast-forwarded `next` tip — confirmed by reading
  `frontend/src-tauri/src/lib.rs` lines 1-71, untouched by me). Deliberately left alone to
  avoid a concurrent-edit collision on a file/topic the other builder owns; once their pass
  lands, `frontend/README.md`'s `41948` references and the `LENGYUE_PROXY_UPSTREAM` name
  will need updating together with `lib.rs` — flagging so it isn't lost.
- **Three test files** (`migration-store-roundtrip.test.ts`, `ws-url.test.ts`,
  `useEngineUriEditor.test.ts`) — read each in context (not just grepped) before deciding:
  - `migration-store-roundtrip.test.ts:143` is a frozen "legacy v1 user save" fixture
    (`legacyV1Blob()`) — the literal value simulates what a real pre-migration user's save
    contained, not what today's default is. Changing it would be editing history, not a
    default; the file's own header explicitly warns against changing fixture values to
    make diffs smaller.
  - `ws-url.test.ts` uses `41948` only as an arbitrary well-formed example URL for a pure
    validator (`validateEngineUri`) — unrelated to the app's default, any valid port would
    do.
  - `useEngineUriEditor.test.ts`'s `DEFAULT_URL` is a locally-scoped test seed
    (`mutateProfile` explicitly writes it), not a read of `env.ts`'s or `defaults.ts`'s
    actual fallback — the test's behavior doesn't depend on what the app's compiled-in
    default is.
  None of these needed to change for gates to pass (confirmed — see Gates below), and none
  are "defaults" in the commission's sense.

## Gates

All run in this worktree (fresh `npm ci` / `venv` — neither existed here yet after the
fast-forward):

- **`npx vue-tsc --noEmit`** (nice -n 19, systemd-run MemoryMax=4G): exit 0, no output —
  clean.
- **`npx vitest run --silent`** (same memory cap): exit 0 — **1830 passed, 4 skipped**
  (153 test files passed, 3 skipped), 139.31s.
- **`backend venv pytest -q`** (fresh venv, `pip install -r requirements.txt -r
  tests/requirements-test.txt`, same memory cap): exit 0 — **740 passed, 2 skipped, 1
  xfailed**, 33.92s. Run because `backend/scripts/katago_ws_shim.py` was touched
  (docstring only — no functional change, but the gate rule is "if you touch the shim,"
  not "if the touch is functional").

## Files changed

`README.md`, `backend/scripts/katago_ws_shim.py`, `docker-compose.yml`, `docs/docker.md`,
`frontend/.env.example`, `frontend/Dockerfile`, `frontend/src/components/chrome/ToolbarEngineUri.vue`,
`frontend/src/composables/perf/scenarios.ts`, `frontend/src/config/env.ts`,
`frontend/src/locales/en.json`, `frontend/src/store/defaults.ts`.

## Deviations from the literal brief

- The dev-default question was answered by the coordinator mid-task (see "Mid-task
  refinement" above) rather than left as a surfaced question in the final reply, per
  their explicit instruction.
- Item 3's "re-verify" was discharged by reading prior direct evidence rather than a fresh
  scratch-stack run, per the brief's own "re-verify by reading, or a scratch-stack run if
  cheap" allowance — judged a fresh build not cheap relative to directly-applicable
  existing evidence for the identical code path.
- No scope changes beyond the coordinator's own mid-task refinement (which was itself an
  answer to a question my brief told me to surface, not a self-initiated scope change).
