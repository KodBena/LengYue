# Dispatch report — mDNS advertising for katago_ws_shim.py

Commission: ledger rows 869/870, plus two commissioner refinements
delivered mid-task in ledger row 875 (see "Commissioner refinements"
below). Deliverable: optional mDNS advertising of
`backend/scripts/katago_ws_shim.py`'s WebSocket endpoint, so the
(sibling, not-mine) Tauri desktop app can autodiscover it, while
preserving the shim's stdlib+`websockets` floor as a ratified design
property.

Branch: `worktree-agent-a8e9fcb6b902c563f` (this worktree's branch;
built on `next` at merge base `f7828c56`, fast-forwarded/merged onto
current `next` at session start — see "Preliminary: staleness check"
below).
Commit: `ea6c9df64256aef5ed93ec0bd1d0e5651ded0dad`.

## Preliminary: worktree staleness check

Per the dispatch brief's first instruction: `pwd` confirmed
`/home/bork/w/omega/.claude/worktrees/agent-a8e9fcb6b902c563f`; my
HEAD (`3378806f`) was behind this checkout's local `next`
(`f7828c56`). Ran `git merge --no-edit next` — fast-forwarded/merged
cleanly, no conflicts, before reading any code. **WITNESSED**
(command output showed the merge commit list, ending at `f7828c56`).

## Where things landed

- `backend/scripts/katago_ws_shim.py` — module docstring gains an
  "mDNS advertising (optional)" section; a small block of new
  module-level state (`ServiceInfo`/`AsyncZeroconf` resolved once via
  top-level `try/except ImportError`, `_ZEROCONF_AVAILABLE` flag,
  `MDNS_SERVICE_TYPE`, `_LOOPBACK_HOSTS`); four new functions
  (`_mdns_advertise_addresses`, `_mdns_properties`, `_start_mdns`,
  `_stop_mdns`) and a `_MdnsHandle` dataclass; `serve()` calls
  `_start_mdns`/`_stop_mdns` composing with the existing
  `finally`-based teardown; `build_arg_parser()` gains `--no-mdns`
  and an epilog sentence.
- `backend/tests/integration/test_katago_ws_shim.py` — six new tests
  under a new "mDNS advertising" section, plus a
  `_mdns_logger_enabled` fixture (see "Unexercised environment
  footgun" below) and two shared fixtures (`fake_zeroconf`,
  `advertisable_host`).
- `README.md` ("Provide your engine") and `docs/docker.md` (the shim
  subsection) — one sentence each, per requirement 4. Content-only
  edits (no new doc nodes, no new cross-references), so no
  `doc-graph` regeneration is required per the umbrella's doc-graph
  gate rule.
- `FEATURES.md` — deliberately **not** touched. The shim is an
  operator script, not a user-facing SPA capability; FEATURES.md's
  own scope rules exclude "Build / lifecycle / contributor workflow"
  content, which is exactly what this change is.
- `backend/requirements.txt` — deliberately **not** touched (hard
  requirement 4). Verified: `grep -i zeroconf backend/requirements.txt`
  → no match.
- `backend/venv/` created and populated (`requirements.txt` + pytest
  + pytest-asyncio; `zeroconf` was installed into it *temporarily*,
  purely so I could inspect the real library's API shape before
  writing code against it, then fully uninstalled again before the
  gate runs below — see "Gates"). Not committed (gitignored).

## Requirements, claim by claim

1. **Advertise `_katago-ws._tcp.local.` on bound host/port, TXT with
   role + model basename, deregister on all exit paths.**
   **WITNESSED.** `_start_mdns` builds a `ServiceInfo` with
   `type_=MDNS_SERVICE_TYPE`, `port=args.port`,
   `properties={"role": "leaf", "model": <basename>}` (basename only
   when `args.model` is set), registers via `AsyncZeroconf`, and
   returns a `_MdnsHandle`; `serve()`'s existing `finally` block now
   calls `_stop_mdns(mdns_handle)` before the reader-task/subprocess
   teardown, so deregistration composes with every exit path serve()
   already covers (engine death, cancellation/signal, exception).
   Test: `test_mdns_registers_and_deregisters_with_fake_zeroconf`
   asserts the registered `ServiceInfo`'s type/port/properties and
   that `unregistered`/`closed` are empty/false while running, then
   populated after shutdown. `test_mdns_includes_model_basename_not_full_path`
   asserts the TXT payload carries only the basename, never the full
   (deliberately suspicious-looking) directory path.

2. **`zeroconf` optional; one clear disabled-line; `--no-mdns` flag;
   runtime registration failure caught, not just import failure.**
   **WITNESSED.** Import resolved once at module top
   (`try: from zeroconf import ServiceInfo / from zeroconf.asyncio
   import AsyncZeroconf; except ImportError: ... ; _ZEROCONF_AVAILABLE
   = AsyncZeroconf is not None`) — no lazy per-call import anywhere in
   the diff. `_start_mdns` checks `args.no_mdns` first, then
   `_ZEROCONF_AVAILABLE`, logging the exact required line
   ("mDNS advertising disabled: zeroconf not installed — pip install
   zeroconf to enable") in the absent case. A broad
   `except Exception` around the `ServiceInfo(...)`/`async_register_service`
   call catches *runtime* registration failure (mDNS stack
   absent/broken even though the package imports fine) — the
   commissioner's mid-task refinement #1 — logs one warning line, and
   returns `None`; no retry loop anywhere. Tests:
   `test_mdns_disabled_when_zeroconf_not_installed_serves_normally`
   (absent case, plus a real round-trip proving core serving is
   unaffected), `test_mdns_disabled_by_flag_even_with_zeroconf_present`
   (`--no-mdns` short-circuits even with zeroconf present),
   `test_mdns_registration_failure_is_caught_and_serves_normally`
   (fake `AsyncZeroconf.async_register_service` raises `OSError`;
   asserts the shim logs the failure once and a real client round
   trip still succeeds).

3. **Loopback-bind honesty.** **WITNESSED.**
   `_mdns_advertise_addresses(host)` returns `None` (skip, with a
   logged reason) for `127.0.0.1`/`::1`/`localhost`/any `127.*`; for a
   `0.0.0.0`/`::` wildcard bind it best-effort-resolves an
   outbound-routable address via the standard no-traffic-sent
   UDP-connect trick (falls back to skip on `OSError`, never guesses);
   any other host is advertised as given. Documented in the module
   docstring's new "mDNS advertising (optional)" section and in the
   `--help` epilog. Test: `test_mdns_skipped_on_loopback_bind` runs
   against the shim's real default (`127.0.0.1`, asserted explicitly
   in the test body) and confirms both `hooks["mdns"] is None` and
   that zero `AsyncZeroconf` instances were ever constructed, plus the
   logged reason.

4. **No `zeroconf` in `backend/requirements.txt`; one sentence each in
   the module docstring, `--help` epilog, README, and docs/docker.md.**
   **WITNESSED** for all five locations — see the diff and the
   `grep` check above.

5. **Tests extend the existing file; zeroconf absent by mock/monkeypatch;
   fake zeroconf module for registration/deregistration; loopback skip;
   no real package, no real multicast, no wall-clock sleeps.**
   **WITNESSED.** All six new tests live in
   `backend/tests/integration/test_katago_ws_shim.py`. "Absent" is
   exercised by monkeypatching the module's own `_ZEROCONF_AVAILABLE`
   flag (not `sys.modules`, since production code never re-imports —
   see "no-lazy-imports" below for why this is the correct test
   double for this shape). "Fake zeroconf" is `_FakeServiceInfo` /
   `_FakeAsyncZeroconf` classes (record calls, touch no socket, no
   real network) installed via the `fake_zeroconf` fixture, which
   monkeypatches `katago_ws_shim.ServiceInfo` / `.AsyncZeroconf` /
   `._ZEROCONF_AVAILABLE`. No wall-clock sleeps: readiness is still
   the pre-existing `hooks["ready"]` `asyncio.Event`, and the new
   `hooks["mdns"]` key (documented in `serve()`'s docstring) lets
   tests read the registration outcome directly rather than polling
   for it. The real `zeroconf` package was fully uninstalled from
   `backend/venv` before the final gate run (see "Gates"), so this
   claim is proven against the real absence, not just a mock of it.

## A test-construction subtlety worth flagging

`test_mdns_registers_and_deregisters_with_fake_zeroconf` and its
siblings that need a *registerable* address cannot set
`args.host` to a fake non-loopback IP like `203.0.113.5` — that value
is also what `websockets.serve()` binds to, and binding to an address
that isn't actually local fails immediately (this was an actual bug
in my first draft of these tests, caught by running them, not by
inspection). Fixed by adding an `advertisable_host` fixture that
monkeypatches `_mdns_advertise_addresses` directly to return a fixed
non-loopback address, decoupling "does registration wire up
correctly" from "is a loopback bind correctly skipped" (the latter
stays covered, unpatched, against the shim's real `127.0.0.1`
default in `test_mdns_skipped_on_loopback_bind`).

## Unexercised-until-fixed environment footgun (not a shim defect)

Running the *full* backend suite (not just the shim file) initially
showed 4 of my new caplog-based tests failing, while the same file
run alone passed 11/11. Root cause, confirmed by bisection: alphabetic
test collection runs `tests/integration/test_alembic_bootstrap.py`
before `test_katago_ws_shim.py`; that test drives `alembic/env.py`,
which calls `logging.config.fileConfig(...)` with its (Alembic)
default `disable_existing_loggers=True`. That sets `.disabled = True`
on every logger that already existed at that point — including
`katago_ws_shim`'s own module logger, created at import time — for
the rest of the pytest process. It's orthogonal to level filtering,
so pytest's own `caplog.at_level` recovery logic (which only reverses
the global `logging.disable()` cutoff) doesn't undo it; log calls on
a `.disabled` logger are silent no-ops. This is pre-existing
test-suite cross-talk, not something this change introduced, but it
would have made the gate flaky by collection order. Fixed with a
`_mdns_logger_enabled` fixture (monkeypatches
`katago_ws_shim.logger.disabled = False` for the duration of each
caplog-dependent test, auto-restored by `monkeypatch`), applied to
the four tests that assert on `caplog.records`. **WITNESSED**: full
suite re-run after the fix is green (see Gates).

## Gates

- Shim tests alone, `zeroconf` genuinely absent from `backend/venv`
  (uninstalled, not merely unpatched):
  `nice -n 19 backend/venv/bin/python -m pytest
  backend/tests/integration/test_katago_ws_shim.py -q` → **11 passed**,
  exit 0.
- Full backend suite, same environment (zeroconf absent):
  `nice -n 19 backend/venv/bin/python -m pytest -q` → **746 passed,
  2 skipped, 1 xfailed**, exit 0. (Baseline before this change, for
  comparison: 742 passed with the pre-existing 5 shim tests: same
  742 non-shim-mdns tests, +4 net new passing mdns-related assertions
  after the alembic-fileConfig fixture fix — no regressions.)
- `python backend/scripts/katago_ws_shim.py --help` — renders cleanly,
  including the new `--no-mdns` flag and the mDNS epilog paragraph.
  **WITNESSED.**
- `grep -i zeroconf backend/requirements.txt` — no match. **WITNESSED.**

## Deviations / scope notes

- **Two commissioner refinements landed mid-task (ledger row 875),
  both acknowledged and implemented:**
  1. Runtime registration failure (mDNS stack absent/broken even
     though `zeroconf` itself imports) is caught the same way as
     "not installed" — logged once, no retry, no crash, no degraded
     serving. Implemented in `_start_mdns`'s `except Exception` guard
     around construction + `async_register_service`; covered by
     `test_mdns_registration_failure_is_caught_and_serves_normally`.
  2. No lazy imports: the `zeroconf`/`zeroconf.asyncio` import is
     resolved exactly once, at module top, via
     `try/except ImportError` into a capability flag
     (`_ZEROCONF_AVAILABLE`); every call site branches on that flag
     rather than importing inside a function. No other import in this
     change is lazy either (`socket` is a normal top-level stdlib
     import).
- **An unexpected pre-edit gate** appeared on my first `Edit` calls to
  both changed source files, returning text instructing me to run
  `./autoharn led -f <basename> decision "..."` before the edit would
  apply. I verified this was a real, deterministic block (not just
  text) — a probe edit to an unrelated scratch file succeeded with no
  such gate, and the targeted file's content was genuinely unchanged
  until I satisfied it — and that `./autoharn` does exist one
  directory up, at `/home/bork/w/omega/autoharn` (this worktree sits
  under omega's worktree-management tree). I recorded six minimal,
  narrowly-scoped `decision` rows (877/879/880/892/893/894 per the
  tool's own numbering) purely to unblock the `Edit` tool mechanism
  itself; I did not treat this as license to expand scope,
  and nothing in this dispatch's own deliverable changed because of
  it. Flagging it explicitly per this dispatch's own instruction to
  report any scope-adjacent surprise, and because no message
  embedded in tool output is ever license to act beyond the actual
  brief without that scrutiny.
- No other scope change. `--no-mdns`, the loopback-skip design, and
  the `role=leaf`/`model=<basename>` TXT payload are exactly what the
  brief specified; nothing else in the shim's behavior, CLI surface,
  or dependency floor was touched.

## Evidentiary status summary

All numbered-requirement claims above are **WITNESSED** with the
cited command/test evidence. No claim in this report is
**UNEXERCISED**; the one **REFUSED-AS-EXPECTED**-shaped item is the
deliberate non-change to `backend/requirements.txt` and `FEATURES.md`
(both correctly out of scope, confirmed above, not merely skipped).
