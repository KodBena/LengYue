# Dispatch report — KataGo WebSocket shim (irreducible-minimum cleanup)

Commission: ledger rows 820/823. Semantic reference: `/home/bork/g.py`
(read in full; working prototype). Deliverable: a single-file,
dependency-minimal Python script wrapping a local KataGo `analysis`
process as a WebSocket endpoint, plus a short usage doc section.

## Where things landed

- Script: `backend/scripts/katago_ws_shim.py` — placed alongside the
  repo's existing operator scripts (`backend/scripts/load_sample.py`,
  `make_sample_db.py`, etc.), which is the established convention for
  this kind of standalone operator tool (`README.md` already points
  users at `python backend/scripts/load_sample.py`). Stdlib +
  `websockets` only, matching `backend/requirements.txt`'s existing
  `websockets==15.0.1` pin.
- Usage doc: `docs/docker.md`, new subsection "Sharing one engine
  process across multiple clients" under the existing "Pointing at the
  engine" section — the natural home, since that section is where the
  docs already explain the host/CUDA-vs-Docker boundary this script
  exists to bridge. Content-only edit (no new doc nodes, no new
  markdown-link cross-references — my prose mentions of ADR-0002 and
  `proxy/README.md` are bare-text, matching this doc's existing
  citation style, not `[..](..)` links), so no `doc-graph` regeneration
  is required per the umbrella's doc-graph gate rule.
- Test: `backend/tests/integration/test_katago_ws_shim.py`, 5 tests,
  `integration` marker (real subprocess + real TCP socket, matching
  that marker's existing use in this suite for non-unit tests). No
  fitting standalone "scripts test dir" exists in this repo
  (`backend/scripts/` itself has no test suite of its own); this was
  the closest existing convention, so it was reused rather than
  inventing a new location.
- `backend/venv/` created and populated (`requirements.txt` + pytest +
  pytest-asyncio) per the standing instruction that backend pytest runs
  live in `backend/venv`. Not committed (gitignored, as with any venv).

## What was fixed vs preserved from `/home/bork/g.py`

**Preserved verbatim in spirit** (the mechanics that make the prototype
correct): per-client UUID id prefixing with the `|||` separator;
`terminate`/`terminateId` rewriting on the way in and de-prefixing on
the way out; the 64 KiB chunked-read stdout loop (avoids asyncio's
`LimitOverrunError` on oversized KataGo response lines); non-JSON
engine stdout tolerated with a `logger.warning` and `continue`, not a
crash; per-client `clients`/tracking-dict cleanup in the handler's
`finally` block on disconnect.

**Fixed (the honest defects named in the commission):**

1. **Hardcoded paths and host/port → CLI args + env vars.**
   `--katago-path`/`--model`/`--config` are required (no default — no
   personal path baked in), each with an `KATAGO_*` env-var fallback.
   `--host`/`--port` default to `127.0.0.1:1242` (a documented,
   loopback-only default — not the prototype's LAN-facing
   `192.168.122.1:1242`), each also overridable via env var
   (`KATAGO_WS_HOST`/`KATAGO_WS_PORT`).
2. **Silent dead-engine failure → fail loudly (ADR-0002).** In the
   prototype, `katago_reader` breaking out of its loop on EOF just lets
   the `websockets.serve` context keep accepting new clients into a
   dead engine, with only a log line marking the death. Here, the
   reader's `finally` sets a `Shim.dead` `asyncio.Event`; `serve()`
   `asyncio.wait`s on that event (racing it against a shutdown-signal
   event), and the moment it fires: logs `critical`, closes the
   WebSocket server (which drops already-connected clients — verified,
   see witness table), tears down the subprocess if anything is left
   alive, and returns exit code `1`. There is no restart/reconnection
   logic (explicitly out of scope per the commission) — an operator or
   supervisor restarts it deliberately.
3. **Bare `global proc` → structured `Shim` dataclass.** `process`,
   the `dead` event, `clients`, and `pending` (the per-client
   orig-id→prefixed-id map, renamed from the prototype's
   `client_queries`) live on one `Shim` instance threaded through the
   handler and reader via `functools.partial`/direct arg-passing,
   instead of three module globals. Stayed a plain `@dataclass`, not a
   class hierarchy — no framework growth.
4. **Unreliable child cleanup → `_terminate_process()`.** SIGTERM,
   then a bounded 5s wait, then SIGKILL as a last resort, invoked from
   `serve()`'s `finally` block so it runs on every exit path (engine
   death, deliberate shutdown, or an exception) — not just the
   `KeyboardInterrupt` case the prototype's `main()` special-cased. A
   `SIGINT`/`SIGTERM` handler (`loop.add_signal_handler`) sets a
   `shutdown_requested` event so an operator-initiated stop and an
   engine-death stop share the same teardown path, distinguished only
   by exit code (0 vs 1).

**Not done, per the commission's explicit "do not grow it into a
framework" instruction:** no reconnection/auto-restart, no metrics, no
logging config beyond `basicConfig`, no class hierarchy for its own
sake (one dataclass).

**One minimal testability seam, disclosed as a deviation from strict
"nothing but the mechanics":** `serve()` takes an optional `hooks:
dict | None = None` kwarg, unused in normal operation (`python
backend/scripts/katago_ws_shim.py ...` never passes it), that lets a
test observe server-readiness and the spawned subprocess without
polling or sleeping. Judged in-scope because the task explicitly
required a real-websocket-client witness with no wall-clock sleeps,
and the alternative (reaching into module globals from the test, or
guessing a startup delay) was worse on every axis. Flagging it plainly
here rather than presenting it as an unremarked "mechanics" line.

## `--help`-visible KataProxy note

Present in the `argparse` epilog (shown by `--help`) and restated in
the module docstring and the new `docs/docker.md` subsection: "KataProxy
can chain to this shim: point KataProxy's upstream engine URL at
ws://<host>:<port> of this process, the same way it would point at a
bare KataGo process."

## Witness table

Per-claim evidentiary status. No real `katago` binary was available/run
on this machine for this task (see UNEXERCISED item) — witnessed
instead with a fake echo-engine subprocess driven over a real
`websockets` client, per the commission's own fallback instruction.

| Claim | Status | Evidence |
|---|---|---|
| Script parses CLI args/env correctly, `--help` shows the KataProxy note | WITNESSED | `venv/bin/python backend/scripts/katago_ws_shim.py --help` output inspected directly; shows required `--katago-path`/`--model`/`--config`, defaulted `--host 127.0.0.1`/`--port 1242`, and the epilog note. |
| Per-client id prefixing + de-prefixing round-trips correctly | WITNESSED | `test_round_trip_id_prefixing_and_terminate_rewriting` — real ws client sends `{"id":"q1",...}`, receives `{"id":"q1",...}` back (never sees the internal `<uuid>\|\|\|q1` form). |
| `terminate`/`terminateId` rewritten on the way in, de-prefixed on the way out | WITNESSED | Same test — a `terminate` action with `terminateId: "q2"` gets an ack back with `terminateId: "q2"` (not the client-qualified form the fake engine actually saw and echoed). |
| Chunked stdout reader handles a response line spanning multiple 64 KiB reads | WITNESSED | `test_chunked_read_handles_oversized_response_line` — fake engine emits a single JSON line with a 200,000-byte field; client receives it intact and correctly parsed. |
| Non-JSON engine stdout tolerated with a warning, doesn't crash the reader | WITNESSED | Every test's fake engine prints a non-JSON startup banner line before any JSON; all 5 tests still pass (the reader logs and continues past it). |
| Per-client cleanup on disconnect doesn't disturb other clients or crash the reader | WITNESSED | `test_per_client_cleanup_does_not_disturb_other_clients` — client A disconnects mid-session; client B still round-trips correctly afterward. |
| Dead engine → shim exits loudly (non-zero) and drops connected clients, rather than serving a dead engine silently | WITNESSED | `test_dead_engine_exits_loudly_and_drops_clients` — fake engine exits after one query; `serve()`'s task resolves to exit code `1`; the still-open client connection then raises `ConnectionClosed` on next `recv()`. |
| Clean/deliberate shutdown reliably terminates the still-alive child process | WITNESSED | `test_cancellation_terminates_child_process_reliably` — cancelling the `serve()` task (standing in for a SIGINT/SIGTERM-driven shutdown) leaves `process.returncode` non-`None` by the time the cancellation has fully propagated, with no polling/sleeping needed to observe it (the `finally` block's `process.wait()` is what makes this deterministic). |
| No regression in the rest of the backend suite | WITNESSED | Full run: `740 passed, 2 skipped, 1 xfailed` (`-m "not qeubo and not slow"`), including the 5 new tests. |
| Real katago binary round-trip (ws://192.168.122.68:1235 or any local engine) | UNEXERCISED | No katago binary/model/config was available on this machine for this task, and the commission explicitly forbids touching the live engine at `ws://192.168.122.68:1235` or its process. Fell back to the commission's own prescribed alternative (fake engine over a real websocket), which is the WITNESSED path above. |

## Deviations from a literal reading of the brief

- The `hooks` testability kwarg on `serve()` (see above) — a seam not
  present in the prototype, added only to make the real-websocket-client,
  no-sleep witness requirement achievable cleanly.
- Test port range: fixed scratch ports `19141`–`19145` (the `serve()`
  function intentionally doesn't expose the bound `websockets.Server`
  back to callers, keeping the production surface minimal, so an
  OS-assigned ephemeral port couldn't be recovered from outside without
  adding that surface). All in the `>= 19000`, non-`19080`/`19081`
  scratch range per the standing hard constraints.
- Default bind host changed from the prototype's `192.168.122.1` (a
  specific LAN IP) to `127.0.0.1` — per the commission's own
  instruction ("no hardcoded personal paths... defaults sensible: host
  127.0.0.1"). An operator who wants LAN-reachability passes
  `--host 0.0.0.0` (or a specific LAN IP) explicitly.

No scope was narrowed or silently deferred relative to the commission;
everything the brief asked for is delivered above. The `--help`
epilog, module docstring, and `docs/docker.md` subsection each restate
the KataProxy-chaining note in the form appropriate to that surface,
which is redundancy, not a substitute for any one of them.

## Branch / commit

Branch: `worktree-agent-aa6ad222583994632` (this worktree's dedicated
branch, fast-forwarded onto `next` @ `8e17f5d6` before any of this
work — see below). Final commit sha recorded after `git commit` runs;
see the commit this report ships alongside.
