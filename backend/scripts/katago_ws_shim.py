"""
backend/scripts/katago_ws_shim.py

KataGo WebSocket Shim — wraps a local KataGo `analysis` engine
process as a WebSocket endpoint.

Why this exists
----------------
KataProxy and the SPA are delivered dockerized / via Tauri, but
KataGo itself is a native, CUDA-bound binary that has to run
directly on the host GPU (see `docs/docker.md`, "What is NOT
containerized"). This script is the small host-side bridge: it
launches `katago analysis` as a subprocess, speaks its JSON-lines
stdin/stdout protocol, and re-exposes it as a WebSocket server that
any number of concurrent clients (KataProxy, or the SPA directly)
can share. Each client's query `id` is prefixed with a
per-connection namespace (`<client_id>|||<orig_id>`) so concurrent
clients' queries never collide inside the one shared engine process,
and `terminate` actions have their `terminateId` rewritten the same
way so they still target the right in-flight query.

Per ADR-0002 (fail loudly): if the katago subprocess dies — crash,
OOM-kill, a GPU refusal surfacing after startup — this shim does not
keep accepting clients into a dead engine. It logs the failure,
closes the WebSocket server (dropping any connected clients), tears
down the subprocess if anything of it is still alive, and exits
non-zero. There is no silent-degradation or auto-restart mode; an
operator (or their process supervisor) restarts the shim
deliberately.

This is a cleaned-up, configurable, supervised derivative of a
working prototype (commission ledger rows 820/823). The
id-prefixing / terminate-rewriting / chunked stdout reader mechanics
are preserved from the prototype; the hardcoded paths and the
silent dead-engine failure mode are not.

mDNS advertising (optional)
----------------------------
Once the WebSocket server is listening, the shim can advertise itself
on the LAN as `_katago-ws._tcp.local.` (TXT record: `role=leaf`, plus
`model=<basename>` when a model path is known) so a sibling autodiscovery
client (e.g. the Tauri desktop app) can find it without a manually typed
address. This is strictly additive over the stdlib+`websockets` floor
below: it requires the optional `zeroconf` package
(`pip install zeroconf`, not part of `backend/requirements.txt` — this
is an operator script, not backend runtime). If `zeroconf` is not
installed, the shim serves exactly as it does today and logs one clear
line saying so. Pass `--no-mdns` to disable advertising explicitly even
when `zeroconf` is installed. Any registration failure at runtime (the
mDNS stack absent/broken on the host, however "importable" zeroconf is)
is caught, logged once, and never turns into a serving failure — there
is no retry loop.

Advertising a loopback bind address to the LAN would be a lie (nothing
off this machine could reach it), so the shim only advertises when
bound to a non-loopback address, or a wildcard bind (`0.0.0.0`/`::`,
where it best-effort resolves the host's outbound-routable address).
Bound to `127.0.0.1` (the default) or another loopback address,
advertising is skipped and the reason is logged at INFO.

Usage
-----
    python backend/scripts/katago_ws_shim.py \\
        --katago-path /path/to/katago \\
        --model /path/to/model.bin.gz \\
        --config /path/to/analysis.cfg

    # 1242 is the canonical port: every packaging this app ships (Docker's
    # ENGINE_WS_URL default, the Tauri desktop shell's upstream default,
    # and the plain-dev SPA's compiled-in default) already assumes a shim
    # or engine listening here, so running with defaults gets a working
    # stack with zero configuration elsewhere. It's the one port a user
    # should ever need to type — only if they move it.
    #
    # Custom bind address/port (defaults: 127.0.0.1:1242):
    python backend/scripts/katago_ws_shim.py \\
        --katago-path ./katago --model ./model.bin.gz --config ./analysis.cfg \\
        --host 0.0.0.0 --port 1242

    # Equivalently via environment variables:
    KATAGO_PATH=./katago KATAGO_MODEL=./model.bin.gz KATAGO_CONFIG=./analysis.cfg \\
        python backend/scripts/katago_ws_shim.py

KataProxy can chain to this shim: point KataProxy's upstream engine
URL (its LEAF/RELAY target) at `ws://<this-host>:<this-port>` exactly
as it would point at a bare KataGo process — this shim is a
drop-in multi-client-safe stand-in for one.

Dependencies: Python stdlib + `websockets`. Nothing else is required
— this is an operator tool, not backend application code, and is
deliberately kept to a single file. `zeroconf` is an *optional* extra
dependency, needed only for mDNS advertising (see above); its absence
never affects core operation.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import argparse
import asyncio
import contextlib
import functools
import json
import logging
import os
import signal
import socket
import sys
import uuid
from dataclasses import dataclass, field

import websockets

# `zeroconf` is an OPTIONAL dependency, used only for mDNS advertising (see the
# module docstring). Resolved once here at import time — never lazily inside a
# function — so every call site branches on a single flag rather than repeating
# the try/except. Its absence never affects core shim operation.
try:
    from zeroconf import ServiceInfo
    from zeroconf.asyncio import AsyncZeroconf
except ImportError:
    ServiceInfo = None  # type: ignore[assignment,misc]
    AsyncZeroconf = None  # type: ignore[assignment,misc]

_ZEROCONF_AVAILABLE = AsyncZeroconf is not None

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("katago_ws_shim")

ID_SEPARATOR = "|||"  # Unlikely to collide with client-chosen query IDs.
READ_CHUNK_BYTES = 65536  # Read chunks, not lines, to avoid asyncio's LimitOverrunError.
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 1242

MDNS_SERVICE_TYPE = "_katago-ws._tcp.local."
_LOOPBACK_HOSTS = {"127.0.0.1", "::1", "localhost"}


@dataclass
class Shim:
    """Everything the running shim needs, in one place instead of module globals.

    `process` is the supervised katago subprocess. `dead` is set exactly
    once, by the reader, the moment the engine's stdout hits EOF or an
    unrecoverable read error occurs — that is this shim's fail-loudly
    signal, consumed by `serve()` to tear the whole server down.
    """

    process: asyncio.subprocess.Process
    dead: asyncio.Event = field(default_factory=asyncio.Event)
    clients: dict[str, websockets.WebSocketServerProtocol] = field(default_factory=dict)
    # client_id -> {orig_id: prefixed_id}, tracking in-flight (non-final) queries.
    pending: dict[str, dict[str, str]] = field(default_factory=dict)


async def client_handler(ws: websockets.WebSocketServerProtocol, *, shim: Shim) -> None:
    if shim.dead.is_set():
        await ws.close(1011, "engine unavailable")
        return

    client_id = uuid.uuid4().hex
    shim.clients[client_id] = ws
    shim.pending[client_id] = {}
    logger.info("client %s connected", client_id)

    try:
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError as e:
                logger.warning("invalid JSON from client %s: %s", client_id, e)
                await ws.send(json.dumps({"error": f"Invalid JSON: {e}"}))
                continue

            if "id" not in msg:
                logger.warning("query without id from client %s: %s", client_id, msg)
                await ws.send(json.dumps({"error": "Query must have 'id' field"}))
                continue

            if msg.get("action") == "terminate" and "terminateId" in msg:
                msg["terminateId"] = f"{client_id}{ID_SEPARATOR}{msg['terminateId']}"

            orig_id = msg["id"]
            prefixed_id = f"{client_id}{ID_SEPARATOR}{orig_id}"
            msg["id"] = prefixed_id
            shim.pending[client_id][orig_id] = prefixed_id

            try:
                shim.process.stdin.write(json.dumps(msg).encode() + b"\n")
                await shim.process.stdin.drain()
            except Exception as e:
                logger.error("failed to write to katago stdin for client %s: %s", client_id, e)
                await ws.send(json.dumps({"error": f"KataGo engine failed to accept input: {e}"}))
    except websockets.exceptions.ConnectionClosedOK:
        logger.info("client %s disconnected normally", client_id)
    except websockets.exceptions.ConnectionClosedError as e:
        logger.warning("client %s disconnected unexpectedly: %s", client_id, e)
    finally:
        shim.clients.pop(client_id, None)
        shim.pending.pop(client_id, None)


async def katago_reader(shim: Shim) -> None:
    """Read katago's stdout, de-prefix response IDs, and route to the owning client.

    Reads fixed-size chunks (not lines) because a single KataGo response line
    can exceed asyncio's default StreamReader line-length limit
    (LimitOverrunError) — the prototype this is derived from hit that with
    large `moveInfos`/`policy`/`ownership` payloads.
    """
    line_buffer = b""
    try:
        while True:
            chunk = await shim.process.stdout.read(READ_CHUNK_BYTES)
            if not chunk:
                logger.critical("katago stdout hit EOF — the engine process exited")
                return

            line_buffer += chunk
            while b"\n" in line_buffer:
                line_bytes, line_buffer = line_buffer.split(b"\n", 1)
                line = line_bytes.decode("utf-8", errors="replace").strip()
                if not line:
                    continue

                try:
                    msg = json.loads(line)
                except json.JSONDecodeError as e:
                    logger.warning("katago sent non-JSON output: %s (%s)", line, e)
                    continue

                rid = msg.get("id")
                if not rid or ID_SEPARATOR not in rid:
                    logger.warning("response missing a valid prefixed id: %s", msg)
                    continue

                client_id, orig_id = rid.split(ID_SEPARATOR, 1)
                msg["id"] = orig_id
                if "terminateId" in msg and ID_SEPARATOR in msg["terminateId"]:
                    _client_term_id, orig_term_id = msg["terminateId"].split(ID_SEPARATOR, 1)
                    msg["terminateId"] = orig_term_id

                if msg.get("isDuringSearch") is False and "turnNumber" in msg:
                    shim.pending.get(client_id, {}).pop(orig_id, None)

                ws = shim.clients.get(client_id)
                if ws is None:
                    logger.debug("response for disconnected client %s dropped", client_id)
                    continue
                try:
                    await ws.send(json.dumps(msg))
                except Exception as e:
                    logger.error("failed to send to client %s: %s", client_id, e)
    except Exception:
        logger.exception("katago_reader crashed")
    finally:
        shim.dead.set()


async def _terminate_process(process: asyncio.subprocess.Process) -> None:
    if process.returncode is not None:
        return
    process.terminate()
    try:
        await asyncio.wait_for(process.wait(), timeout=5)
    except asyncio.TimeoutError:
        logger.warning("katago did not exit within 5s of SIGTERM; killing")
        process.kill()
        await process.wait()


@dataclass
class _MdnsHandle:
    """The live mDNS registration, held only long enough to deregister it."""

    azc: "AsyncZeroconf"
    info: "ServiceInfo"


def _mdns_advertise_addresses(host: str) -> list[str] | None:
    """Return the address(es) honest to advertise for `host`, or None if
    advertising would be a lie (a loopback bind is not LAN-reachable).

    A bind to a specific non-loopback address is advertised as-is. A wildcard
    bind (0.0.0.0 / ::) is resolved to a best-effort outbound-routable address
    (the standard no-traffic-sent UDP-connect trick — this never actually
    sends a packet). If that resolution fails, advertising is skipped rather
    than guessed at.
    """
    if host in _LOOPBACK_HOSTS or host.startswith("127."):
        return None
    if host in ("0.0.0.0", "::"):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
                probe.connect(("8.8.8.8", 80))
                return [probe.getsockname()[0]]
        except OSError:
            return None
    return [host]


def _mdns_properties(args: argparse.Namespace) -> dict[str, str]:
    """The TXT payload: the shim's protocol role, plus the model's basename
    if cheaply available — never a full path (nothing sensitive)."""
    props = {"role": "leaf"}
    if args.model:
        props["model"] = os.path.basename(args.model)
    return props


async def _start_mdns(args: argparse.Namespace) -> _MdnsHandle | None:
    """Register the shim's WS endpoint as `_katago-ws._tcp.local.`, or return
    None if advertising is disabled, skipped, unavailable, or fails.

    Never raises: mDNS is strictly additive over the stdlib+websockets floor,
    so any failure here — missing package, broken/absent local mDNS stack,
    a registration error — is caught, logged once, and the shim keeps serving
    normally. There is no retry loop.
    """
    if args.no_mdns:
        logger.info("mDNS advertising disabled (--no-mdns)")
        return None

    if not _ZEROCONF_AVAILABLE:
        logger.info(
            "mDNS advertising disabled: zeroconf not installed — pip install zeroconf to enable"
        )
        return None

    addresses = _mdns_advertise_addresses(args.host)
    if addresses is None:
        logger.info(
            "mDNS advertising skipped: bound to %s, which is not reachable from "
            "the LAN — advertising it would be misleading. Bind to a LAN address "
            "or 0.0.0.0 to enable.",
            args.host,
        )
        return None

    service_name = f"katago-ws-shim-{socket.gethostname()}-{args.port}.{MDNS_SERVICE_TYPE}"
    try:
        info = ServiceInfo(
            MDNS_SERVICE_TYPE,
            service_name,
            port=args.port,
            properties=_mdns_properties(args),
            parsed_addresses=addresses,
            server=f"{socket.gethostname()}.local.",
        )
        azc = AsyncZeroconf()
        await azc.async_register_service(info)
    except Exception as e:
        logger.warning("mDNS advertising failed to register (%s) — serving without it", e)
        return None

    logger.info("mDNS advertising %s on %s:%s", service_name, addresses[0], args.port)
    return _MdnsHandle(azc=azc, info=info)


async def _stop_mdns(handle: _MdnsHandle | None) -> None:
    if handle is None:
        return
    try:
        await handle.azc.async_unregister_service(handle.info)
    except Exception as e:
        logger.warning("mDNS deregistration failed (%s)", e)
    finally:
        with contextlib.suppress(Exception):
            await handle.azc.async_close()


async def serve(args: argparse.Namespace, *, hooks: dict | None = None) -> int:
    """Run the shim until the engine dies or a shutdown signal arrives; return the exit code.

    `hooks`, if given, is a plain dict a test harness pre-populates and reads
    from — it is not used by normal operation. Recognised keys: "ready" (an
    `asyncio.Event` this function sets once the WebSocket server is actually
    listening), "process" (populated with the spawned engine subprocess as
    soon as it starts, so a test can observe its lifecycle without reaching
    into shim internals), and "mdns" (populated with the `_MdnsHandle` from
    `_start_mdns`, or None, once mDNS registration has been attempted).
    """
    cmd = [
        args.katago_path,
        "analysis",
        "-config",
        args.config,
        "-model",
        args.model,
        "-quit-without-waiting",
    ]
    logger.info("starting katago: %s", " ".join(cmd))
    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=sys.stderr,
        )
    except OSError as e:
        logger.critical("failed to start katago (%s): %s", args.katago_path, e)
        return 1

    if hooks is not None:
        hooks["process"] = process

    shim = Shim(process=process)
    reader_task = asyncio.create_task(katago_reader(shim))

    loop = asyncio.get_running_loop()
    shutdown_requested = asyncio.Event()
    for sig_name in ("SIGINT", "SIGTERM"):
        sig = getattr(signal, sig_name, None)
        if sig is not None:
            with contextlib.suppress(NotImplementedError):
                loop.add_signal_handler(sig, shutdown_requested.set)

    exit_code = 0
    mdns_handle: _MdnsHandle | None = None
    handler = functools.partial(client_handler, shim=shim)
    try:
        async with websockets.serve(handler, args.host, args.port):
            logger.info("KataGo WS shim listening on ws://%s:%s", args.host, args.port)
            mdns_handle = await _start_mdns(args)
            if hooks is not None:
                hooks["mdns"] = mdns_handle
            if hooks is not None and "ready" in hooks:
                hooks["ready"].set()
            await asyncio.wait(
                {asyncio.ensure_future(shim.dead.wait()), asyncio.ensure_future(shutdown_requested.wait())},
                return_when=asyncio.FIRST_COMPLETED,
            )
            if shim.dead.is_set():
                logger.critical(
                    "katago engine process exited (returncode=%s) — shutting down loudly, not serving a dead engine",
                    process.returncode,
                )
                exit_code = 1
            else:
                logger.info("shutdown requested — closing")
    finally:
        await _stop_mdns(mdns_handle)
        reader_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await reader_task
        await _terminate_process(process)

    return exit_code


def _env_default(name: str) -> str | None:
    return os.environ.get(name)


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Wrap a local KataGo `analysis` engine process as a WebSocket "
            "endpoint, so a dockerized/Tauri-delivered KataProxy (or the SPA "
            "directly) can reach a host-side, CUDA-bound engine."
        ),
        epilog=(
            "KataProxy can chain to this shim: point KataProxy's upstream engine "
            "URL at ws://<host>:<port> of this process, the same way it would "
            "point at a bare KataGo process. "
            "mDNS advertising (a sibling autodiscovery client can find this shim "
            "on the LAN as `_katago-ws._tcp.local.`) is optional and requires "
            "`pip install zeroconf` — not part of backend/requirements.txt, since "
            "this is an operator script, not backend runtime. Without it installed "
            "the shim runs exactly as it does today. It is also skipped when bound "
            "to a loopback address (advertising an unreachable address would be "
            "misleading), and can be disabled outright with --no-mdns."
        ),
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--katago-path",
        default=_env_default("KATAGO_PATH"),
        required=_env_default("KATAGO_PATH") is None,
        help="Path to the katago binary. Env: KATAGO_PATH.",
    )
    parser.add_argument(
        "--model",
        default=_env_default("KATAGO_MODEL"),
        required=_env_default("KATAGO_MODEL") is None,
        help="Path to the KataGo model file (.bin.gz / .txt.gz). Env: KATAGO_MODEL.",
    )
    parser.add_argument(
        "--config",
        default=_env_default("KATAGO_CONFIG"),
        required=_env_default("KATAGO_CONFIG") is None,
        help="Path to the KataGo analysis config file. Env: KATAGO_CONFIG.",
    )
    parser.add_argument(
        "--host",
        default=_env_default("KATAGO_WS_HOST") or DEFAULT_HOST,
        help="Address to bind the WebSocket server on. Env: KATAGO_WS_HOST.",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(_env_default("KATAGO_WS_PORT") or DEFAULT_PORT),
        help="Port to bind the WebSocket server on. Env: KATAGO_WS_PORT.",
    )
    parser.add_argument(
        "--no-mdns",
        action="store_true",
        help=(
            "Disable mDNS advertising of this shim's endpoint, even if the "
            "optional `zeroconf` package (pip install zeroconf) is installed. "
            "Advertising is additive and off by default when zeroconf isn't "
            "installed, or when bound to a loopback address."
        ),
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_arg_parser().parse_args(argv)
    try:
        return asyncio.run(serve(args))
    except KeyboardInterrupt:
        logger.info("interrupted — stopped manually")
        return 0


if __name__ == "__main__":
    sys.exit(main())
