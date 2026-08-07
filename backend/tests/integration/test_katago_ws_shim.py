"""
tests/integration/test_katago_ws_shim.py

End-to-end exercise of `scripts/katago_ws_shim.py` against a FAKE engine
subprocess — a tiny Python child (written to a temp file per test) that
echoes analysis-shaped JSON lines on stdin/stdout, standing in for a real
`katago analysis` process. No katago binary or GPU is required.

This drives the shim exactly the way a real client would: a real
`websockets` client connects over a real (loopback, scratch-range) TCP
port. It exercises the mechanics that matter and are easy to regress:
per-client id prefixing/de-prefixing, `terminate`/`terminateId`
rewriting, the chunked stdout reader (an oversized response line spans
multiple 64 KiB reads), non-JSON engine output being tolerated, per-client
cleanup on disconnect, and — the fail-loudly fix over the prototype this
script is derived from — the shim exiting non-zero and dropping clients
the moment the engine process dies, rather than serving a dead engine.

Uses a *fixed* scratch port (19141) rather than an OS-assigned ephemeral
one: `serve()` doesn't hand back the bound `websockets.Server` (keeping
the production module's surface minimal), so there's no clean way to
recover an OS-assigned port from outside. 19141 is in the project's
scratch range (>= 19000, excluding the reserved 19080/19081).

No wall-clock sleeps: readiness is a hook-provided `asyncio.Event`
(`serve(..., hooks=...)`), and "did the process really exit" is read off
`returncode`/`wait()` rather than polled after a guessed delay.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import asyncio
import json
import os
import stat
import sys
import textwrap
from pathlib import Path

import pytest
import websockets

SCRIPT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "katago_ws_shim.py"
sys.path.insert(0, str(SCRIPT_PATH.parent))
import katago_ws_shim  # noqa: E402  (path must be adjusted before this import)

SCRATCH_HOST = "127.0.0.1"
SCRATCH_PORT = 19141

pytestmark = pytest.mark.integration

FAKE_ENGINE_SOURCE = textwrap.dedent(
    """
    #!/usr/bin/env python3
    # Fake KataGo `analysis` engine for tests: ignores its argv (katago_ws_shim
    # always calls it as `<path> analysis -config ... -model ... -quit-without-waiting`),
    # prints one non-JSON startup banner line (exercising the shim's tolerance
    # for non-JSON engine output), then echoes back a response per JSON query
    # line read from stdin. A terminate action gets an ack echoing its id and
    # terminateId. If FAKE_ENGINE_EXIT_AFTER is set, the engine exits abruptly
    # (simulating a crash) after processing that many queries.
    import json
    import os
    import sys

    print("Fake KataGo engine starting up (not real JSON)", flush=True)

    exit_after = os.environ.get("FAKE_ENGINE_EXIT_AFTER")
    exit_after = int(exit_after) if exit_after else None

    count = 0
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        msg = json.loads(line)
        count += 1

        if msg.get("action") == "terminate":
            resp = {"id": msg["id"], "terminateId": msg.get("terminateId"), "terminated": True}
        elif msg.get("bigField"):
            resp = {
                "id": msg["id"],
                "isDuringSearch": False,
                "turnNumber": 1,
                "moveInfos": ["x" * 200_000],
            }
        else:
            resp = {"id": msg["id"], "isDuringSearch": False, "turnNumber": 1, "echo": msg.get("payload")}

        print(json.dumps(resp), flush=True)

        if exit_after is not None and count >= exit_after:
            sys.exit(1)
    """
).strip()


@pytest.fixture
def fake_engine_path(tmp_path: Path) -> Path:
    p = tmp_path / "fake_katago_engine.py"
    p.write_text(FAKE_ENGINE_SOURCE + "\n")
    p.chmod(p.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)
    return p


def make_args(fake_engine_path: Path, tmp_path: Path, port: int = SCRATCH_PORT):
    parser = katago_ws_shim.build_arg_parser()
    return parser.parse_args(
        [
            "--katago-path",
            str(fake_engine_path),
            "--model",
            str(tmp_path / "fake-model.bin.gz"),
            "--config",
            str(tmp_path / "fake-config.cfg"),
            "--host",
            SCRATCH_HOST,
            "--port",
            str(port),
        ]
    )


async def _start_serve(args, hooks: dict) -> asyncio.Task:
    hooks["ready"] = asyncio.Event()
    task = asyncio.create_task(katago_ws_shim.serve(args, hooks=hooks))
    await asyncio.wait_for(hooks["ready"].wait(), timeout=10)
    return task


async def _stop_serve(task: asyncio.Task) -> None:
    if task.done():
        return
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await asyncio.wait_for(task, timeout=10)


@pytest.mark.asyncio
async def test_round_trip_id_prefixing_and_terminate_rewriting(fake_engine_path, tmp_path):
    """A query's id round-trips unprefixed; terminate/terminateId round-trip the same way."""
    args = make_args(fake_engine_path, tmp_path)
    hooks: dict = {}
    task = await _start_serve(args, hooks)
    try:
        async with websockets.connect(f"ws://{SCRATCH_HOST}:{SCRATCH_PORT}") as ws:
            await ws.send(json.dumps({"id": "q1", "payload": "hello"}))
            reply = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
            assert reply["id"] == "q1"  # de-prefixed back to the client's own id
            assert reply["echo"] == "hello"

            await ws.send(json.dumps({"id": "q2", "payload": "in-flight"}))
            await asyncio.wait_for(ws.recv(), timeout=10)  # drain the q2 answer

            await ws.send(json.dumps({"action": "terminate", "id": "t1", "terminateId": "q2"}))
            term_reply = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
            assert term_reply["id"] == "t1"
            assert term_reply["terminateId"] == "q2"  # de-prefixed, not the client-id-qualified form
            assert term_reply["terminated"] is True
    finally:
        await _stop_serve(task)


@pytest.mark.asyncio
async def test_chunked_read_handles_oversized_response_line(fake_engine_path, tmp_path):
    """A >64KiB single JSON line from the engine (spanning multiple stdout reads) arrives intact."""
    args = make_args(fake_engine_path, tmp_path, port=SCRATCH_PORT + 1)
    hooks: dict = {}
    task = await _start_serve(args, hooks)
    try:
        async with websockets.connect(f"ws://{SCRATCH_HOST}:{SCRATCH_PORT + 1}") as ws:
            await ws.send(json.dumps({"id": "big1", "bigField": True}))
            reply = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
            assert reply["id"] == "big1"
            assert len(reply["moveInfos"][0]) == 200_000
    finally:
        await _stop_serve(task)


@pytest.mark.asyncio
async def test_per_client_cleanup_does_not_disturb_other_clients(fake_engine_path, tmp_path):
    """Disconnecting client A doesn't crash the reader or affect client B's round trips."""
    args = make_args(fake_engine_path, tmp_path, port=SCRATCH_PORT + 2)
    hooks: dict = {}
    task = await _start_serve(args, hooks)
    try:
        url = f"ws://{SCRATCH_HOST}:{SCRATCH_PORT + 2}"
        ws_a = await websockets.connect(url)
        await ws_a.send(json.dumps({"id": "a1", "payload": "from-a"}))
        await asyncio.wait_for(ws_a.recv(), timeout=10)
        await ws_a.close()

        async with websockets.connect(url) as ws_b:
            await ws_b.send(json.dumps({"id": "b1", "payload": "from-b"}))
            reply = json.loads(await asyncio.wait_for(ws_b.recv(), timeout=10))
            assert reply["id"] == "b1"
            assert reply["echo"] == "from-b"
    finally:
        await _stop_serve(task)


@pytest.mark.asyncio
async def test_dead_engine_exits_loudly_and_drops_clients(fake_engine_path, tmp_path):
    """When the engine process exits, the shim exits non-zero and closes client connections
    instead of continuing to accept clients into a dead engine (ADR-0002)."""
    args = make_args(fake_engine_path, tmp_path, port=SCRATCH_PORT + 3)
    hooks: dict = {}
    os.environ["FAKE_ENGINE_EXIT_AFTER"] = "1"
    try:
        hooks["ready"] = asyncio.Event()
        task = asyncio.create_task(katago_ws_shim.serve(args, hooks=hooks))
        await asyncio.wait_for(hooks["ready"].wait(), timeout=10)

        async with websockets.connect(f"ws://{SCRATCH_HOST}:{SCRATCH_PORT + 3}") as ws:
            await ws.send(json.dumps({"id": "die1", "payload": "boom"}))
            await asyncio.wait_for(ws.recv(), timeout=10)  # the one answer before the engine exits

            exit_code = await asyncio.wait_for(task, timeout=10)
            assert exit_code == 1

            # The server tore itself down; the connection is no longer usable.
            with pytest.raises(websockets.exceptions.ConnectionClosed):
                await asyncio.wait_for(ws.recv(), timeout=10)

        # The engine subprocess itself is confirmed exited, not left as a zombie/orphan.
        assert hooks["process"].returncode is not None
    finally:
        os.environ.pop("FAKE_ENGINE_EXIT_AFTER", None)


@pytest.mark.asyncio
async def test_cancellation_terminates_child_process_reliably(fake_engine_path, tmp_path):
    """A deliberate shutdown (task cancellation, standing in for SIGINT/SIGTERM) reliably
    terminates the still-alive child process before the shim finishes unwinding."""
    args = make_args(fake_engine_path, tmp_path, port=SCRATCH_PORT + 4)
    hooks: dict = {}
    task = await _start_serve(args, hooks)
    process = hooks["process"]
    assert process.returncode is None  # still alive right after startup

    await _stop_serve(task)

    # serve()'s finally-block awaits process.wait() as part of cleanup, so by the
    # time the cancelled task has actually finished, the child is confirmed dead —
    # no polling/sleeping needed to observe this.
    assert process.returncode is not None
