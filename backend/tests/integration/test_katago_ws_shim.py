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


# --- mDNS advertising -------------------------------------------------------
#
# `zeroconf` is an optional dependency (see the module docstring): these tests
# never require the real package or real multicast traffic. Absence is
# exercised by monkeypatching the module's own `_ZEROCONF_AVAILABLE` flag;
# presence is exercised by monkeypatching `ServiceInfo` / `AsyncZeroconf` with
# small in-memory fakes that record calls instead of touching the network.
# Both are equally valid because katago_ws_shim resolves the real import once
# at module load and branches on those module-level names at call time — never
# re-importing lazily — so patching the names is exactly what "swap the
# optional dependency" means for this module.


class _FakeServiceInfo:
    def __init__(self, type_, name, port=None, properties=None, parsed_addresses=None, server=None):
        self.type = type_
        self.name = name
        self.port = port
        self.properties = properties
        self.parsed_addresses = parsed_addresses
        self.server = server


class _FakeAsyncZeroconf:
    """Records register/unregister/close calls; never touches a socket."""

    instances: list["_FakeAsyncZeroconf"] = []

    def __init__(self, *args, **kwargs):
        self.registered: list[_FakeServiceInfo] = []
        self.unregistered: list[_FakeServiceInfo] = []
        self.closed = False
        _FakeAsyncZeroconf.instances.append(self)

    async def async_register_service(self, info):
        self.registered.append(info)

    async def async_unregister_service(self, info):
        self.unregistered.append(info)

    async def async_close(self):
        self.closed = True


@pytest.fixture
def fake_zeroconf(monkeypatch):
    """Install the fake zeroconf stack as if the optional package were present."""
    _FakeAsyncZeroconf.instances = []
    monkeypatch.setattr(katago_ws_shim, "_ZEROCONF_AVAILABLE", True)
    monkeypatch.setattr(katago_ws_shim, "ServiceInfo", _FakeServiceInfo)
    monkeypatch.setattr(katago_ws_shim, "AsyncZeroconf", _FakeAsyncZeroconf)
    return _FakeAsyncZeroconf


@pytest.fixture
def _mdns_logger_enabled(monkeypatch):
    """Guard against a session-order footgun unrelated to mDNS itself:
    ``test_alembic_bootstrap.py`` (collected earlier in the suite, by
    filename) triggers Alembic's ``env.py``, which calls
    ``logging.config.fileConfig(...)`` with its default
    ``disable_existing_loggers=True``. That sets ``.disabled = True`` on
    every logger that already existed at that point — including this
    module's ``logger``, created at import time — for the rest of the
    process. It's orthogonal to level filtering, so pytest's own
    ``caplog.at_level`` recovery (which only handles ``logging.disable()``,
    the global manager-level cutoff) doesn't undo it. Force it back on for
    the duration of each caplog-dependent test below, regardless of what
    ran earlier in the session."""
    monkeypatch.setattr(katago_ws_shim.logger, "disabled", False)


@pytest.fixture
def advertisable_host(monkeypatch):
    """Make address-resolution treat the shim's bind host as LAN-advertisable.

    Tests that exercise the registration/deregistration *wiring* still need
    the real WebSocket server bound to a real, connectable loopback address
    (SCRATCH_HOST) — they can't bind to an arbitrary non-loopback IP just to
    satisfy the "is this address honest to advertise" check. So this
    monkeypatches `_mdns_advertise_addresses` itself, decoupling "does
    registration wire up correctly" (this fixture) from "is a loopback bind
    correctly skipped" (covered separately, unpatched, against the real
    127.0.0.1 default).
    """
    monkeypatch.setattr(
        katago_ws_shim, "_mdns_advertise_addresses", lambda host: ["203.0.113.5"]
    )


@pytest.mark.asyncio
async def test_mdns_disabled_when_zeroconf_not_installed_serves_normally(
    fake_engine_path, tmp_path, monkeypatch, caplog, _mdns_logger_enabled
):
    """With zeroconf ABSENT, the shim serves normally and logs one clear line."""
    monkeypatch.setattr(katago_ws_shim, "_ZEROCONF_AVAILABLE", False)
    args = make_args(fake_engine_path, tmp_path, port=SCRATCH_PORT + 5)
    hooks: dict = {}
    with caplog.at_level("INFO", logger="katago_ws_shim"):
        task = await _start_serve(args, hooks)
        try:
            assert hooks["mdns"] is None
            # Core serving is unaffected: a normal round trip still works.
            async with websockets.connect(f"ws://{SCRATCH_HOST}:{SCRATCH_PORT + 5}") as ws:
                await ws.send(json.dumps({"id": "q1", "payload": "hello"}))
                reply = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
                assert reply["id"] == "q1"
                assert reply["echo"] == "hello"
        finally:
            await _stop_serve(task)

    assert any(
        "mDNS advertising disabled: zeroconf not installed" in r.message for r in caplog.records
    )


@pytest.mark.asyncio
async def test_mdns_registers_and_deregisters_with_fake_zeroconf(
    fake_engine_path, tmp_path, fake_zeroconf, advertisable_host
):
    """With a fake zeroconf stack injected, registration happens with the right
    service type/port while bound to an advertisable host, and deregistration
    happens on shutdown."""
    args = make_args(fake_engine_path, tmp_path, port=SCRATCH_PORT + 6)
    hooks: dict = {}
    task = await _start_serve(args, hooks)
    try:
        handle = hooks["mdns"]
        assert handle is not None
        assert len(fake_zeroconf.instances) == 1
        azc = fake_zeroconf.instances[0]
        assert len(azc.registered) == 1
        info = azc.registered[0]
        assert info.type == katago_ws_shim.MDNS_SERVICE_TYPE
        assert info.port == SCRATCH_PORT + 6
        assert info.parsed_addresses == ["203.0.113.5"]
        assert info.properties["role"] == "leaf"
        assert azc.unregistered == []
        assert not azc.closed
    finally:
        await _stop_serve(task)

    assert azc.unregistered == [info]
    assert azc.closed


@pytest.mark.asyncio
async def test_mdns_includes_model_basename_not_full_path(
    fake_engine_path, tmp_path, fake_zeroconf, advertisable_host
):
    """The TXT payload carries the model's basename, never its full path."""
    args = make_args(fake_engine_path, tmp_path, port=SCRATCH_PORT + 7)
    model_dir = tmp_path / "some" / "deep" / "secret-looking" / "path"
    model_dir.mkdir(parents=True)
    model_path = model_dir / "b18c384nbt.bin.gz"
    model_path.write_bytes(b"")
    args.model = str(model_path)
    hooks: dict = {}
    task = await _start_serve(args, hooks)
    try:
        azc = fake_zeroconf.instances[0]
        info = azc.registered[0]
        assert info.properties["model"] == "b18c384nbt.bin.gz"
        assert str(model_dir) not in "".join(f"{k}={v}" for k, v in info.properties.items())
    finally:
        await _stop_serve(task)


@pytest.mark.asyncio
async def test_mdns_skipped_on_loopback_bind(
    fake_engine_path, tmp_path, fake_zeroconf, caplog, _mdns_logger_enabled
):
    """Bound to the default loopback address, advertising is skipped (it would
    be a lie: no other machine could reach it) and the reason is logged."""
    args = make_args(fake_engine_path, tmp_path, port=SCRATCH_PORT + 8)
    assert args.host == SCRATCH_HOST == "127.0.0.1"  # the shim's own default
    hooks: dict = {}
    with caplog.at_level("INFO", logger="katago_ws_shim"):
        task = await _start_serve(args, hooks)
        try:
            assert hooks["mdns"] is None
            assert fake_zeroconf.instances == []
        finally:
            await _stop_serve(task)

    assert any("mDNS advertising skipped" in r.message for r in caplog.records)


@pytest.mark.asyncio
async def test_mdns_disabled_by_flag_even_with_zeroconf_present(
    fake_engine_path, tmp_path, fake_zeroconf, advertisable_host, caplog, _mdns_logger_enabled
):
    """--no-mdns disables advertising outright, even with zeroconf importable
    and bound to an advertisable address."""
    args = make_args(fake_engine_path, tmp_path, port=SCRATCH_PORT + 9)
    args.no_mdns = True
    hooks: dict = {}
    with caplog.at_level("INFO", logger="katago_ws_shim"):
        task = await _start_serve(args, hooks)
        try:
            assert hooks["mdns"] is None
            assert fake_zeroconf.instances == []
        finally:
            await _stop_serve(task)

    assert any("mDNS advertising disabled (--no-mdns)" in r.message for r in caplog.records)


@pytest.mark.asyncio
async def test_mdns_registration_failure_is_caught_and_serves_normally(
    fake_engine_path, tmp_path, fake_zeroconf, advertisable_host, monkeypatch, caplog,
    _mdns_logger_enabled,
):
    """A registration failure at runtime (e.g. the local mDNS stack absent or
    broken, even though `zeroconf` itself imports fine) is caught, logged once,
    and never turns into a serving failure — no retry, no crash."""

    class _ExplodingAsyncZeroconf(fake_zeroconf):
        async def async_register_service(self, info):
            raise OSError("no multicast interface available")

    monkeypatch.setattr(katago_ws_shim, "AsyncZeroconf", _ExplodingAsyncZeroconf)
    args = make_args(fake_engine_path, tmp_path, port=SCRATCH_PORT + 10)
    hooks: dict = {}
    with caplog.at_level("INFO", logger="katago_ws_shim"):
        task = await _start_serve(args, hooks)
        try:
            assert hooks["mdns"] is None
            async with websockets.connect(f"ws://{SCRATCH_HOST}:{SCRATCH_PORT + 10}") as ws:
                await ws.send(json.dumps({"id": "q1", "payload": "hello"}))
                reply = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
                assert reply["echo"] == "hello"
        finally:
            await _stop_serve(task)

    assert any("mDNS advertising failed to register" in r.message for r in caplog.records)
