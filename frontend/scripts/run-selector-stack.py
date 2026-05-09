#!/usr/bin/env python3
"""
frontend/scripts/run-selector-stack.py
Spawns N LEAF proxies (one per supplied KataGo model) on
auto-allocated ports, waits for each to be reachable, then spawns
one SELECTOR proxy on the user-supplied port that routes to all of
them. Forwards SIGINT to all children for clean shutdown.

Modelled after the manual launch convention:

  PYTHONLOGLEVEL=DEBUG \\
    KATAGO_PATH=/path/to/katago_vanilla \\
    KATAGO_MODEL=/path/to/model.txt.gz \\
    PROXY_ROLE=LEAF \\
    PROXY_PORT=1235 \\
    PROXY_HOST=192.168.122.1 \\
    KATAGO_CFG=./analysis.cfg \\
    python ./proxy_server.py

This script automates the multi-process variant of the above: one
LEAF per `KATAGO_MODEL`, plus a SELECTOR whose `SELECTOR_MODELS`
env var enumerates the LEAFs as `label=ws://host:port` pairs.

Usage:

  python run-selector-stack.py <selector_port> MODEL [MODEL ...]
  python run-selector-stack.py 1234 \\
      ~/katann/really_weak.txt.gz \\
      strong=~/katann/really_strong.txt.gz

Each MODEL is either a plain path (label derived from basename) or
`label=path` (explicit label, mirroring `SELECTOR_MODELS` syntax).
Duplicate labels are rejected before any process is spawned.

Defaults can be overridden via flags; see `--help`. The script
inherits the parent shell's environment, so additional KataGo /
proxy env vars set before invocation pass through unchanged.

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path
from typing import NamedTuple


# ─── Defaults ─────────────────────────────────────────────────────────────────
# Match the user's manual-launch convention. Override via flags.
DEFAULT_HOST = "127.0.0.1"
DEFAULT_KATAGO_PATH = "/mnt/n4/home/bork/katago_vanilla"
DEFAULT_KATAGO_CFG = "./analysis.cfg"
DEFAULT_LOGLEVEL = "DEBUG"

# Where the proxy submodule lives, relative to this script. The script
# at frontend/scripts/run-selector-stack.py walks two levels up to the
# umbrella root, then into proxy/.
SCRIPT_DIR = Path(__file__).resolve().parent
UMBRELLA_ROOT = SCRIPT_DIR.parent.parent
PROXY_DIR = UMBRELLA_ROOT / "proxy"
PROXY_SERVER = PROXY_DIR / "proxy_server.py"

# Per-LEAF readiness budget. The LEAF logs "listening on ws://..."
# only after KataGo's startup probe completes; on slow disks /
# cold-load this can take 30s+. The proxy's own
# KATAGO_STARTUP_TIMEOUT_S defaults to 60s, so this is the natural
# upper bound — if the LEAF hasn't started listening by then,
# something is wrong on the proxy side and surfacing it is better
# than waiting longer.
LEAF_READINESS_TIMEOUT_S = 90.0
PORT_POLL_INTERVAL_S = 0.5


class LeafSpec(NamedTuple):
    label: str
    model_path: Path
    port: int


# ─── Argument parsing ─────────────────────────────────────────────────────────


def _parse_model_arg(raw: str) -> tuple[str | None, Path]:
    """Parse a `MODEL` argument into (explicit_label_or_None, path).

    Splits on the first `=` (matches the SELECTOR_MODELS convention).
    A leading `=` (no label before it) is rejected here so the user
    sees a clear message rather than discovering a blank label later.
    """
    if "=" in raw:
        label, _, path_str = raw.partition("=")
        label = label.strip()
        path_str = path_str.strip()
        if not label:
            raise ValueError(
                f"argument {raw!r}: empty label before `=`. "
                f"Use `label=path` or just `path`."
            )
        if not path_str:
            raise ValueError(
                f"argument {raw!r}: empty path after `=`."
            )
        return label, Path(path_str).expanduser()
    return None, Path(raw).expanduser()


def _derive_label(path: Path) -> str:
    """Strip common extensions to yield a clean label.

    `really_weak.txt.gz` → `really_weak`
    `model.bin.gz`       → `model`
    `model`              → `model`
    """
    name = path.name
    # Iteratively strip recognised extensions. Stop at the first
    # unrecognised suffix so labels stay predictable.
    suffixes_to_strip = {".gz", ".bz2", ".xz", ".txt", ".bin", ".model", ".pb"}
    while True:
        stem, dot, ext = name.rpartition(".")
        if not dot:
            return name
        if "." + ext.lower() in suffixes_to_strip:
            name = stem
        else:
            return name


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "selector_port",
        type=int,
        help="port the SELECTOR will listen on (the address the "
             "frontend's KATAGO_WS_URL should point at)",
    )
    parser.add_argument(
        "models",
        nargs="+",
        metavar="MODEL",
        help="KataGo model file(s). Plain path (label derived from "
             "basename) or `label=path` (explicit label).",
    )
    parser.add_argument(
        "--host",
        default=DEFAULT_HOST,
        help=f"bind host for both LEAFs and SELECTOR (default: {DEFAULT_HOST})",
    )
    parser.add_argument(
        "--katago-path",
        default=DEFAULT_KATAGO_PATH,
        help=f"path to katago binary (default: {DEFAULT_KATAGO_PATH})",
    )
    parser.add_argument(
        "--katago-cfg",
        default=DEFAULT_KATAGO_CFG,
        help=f"KataGo analysis config path, resolved relative to "
             f"the proxy directory (default: {DEFAULT_KATAGO_CFG})",
    )
    parser.add_argument(
        "--loglevel",
        default=DEFAULT_LOGLEVEL,
        help=f"PYTHONLOGLEVEL forwarded to every spawned proxy "
             f"(default: {DEFAULT_LOGLEVEL})",
    )
    parser.add_argument(
        "--advertise-capabilities",
        action="store_true",
        default=True,
        help="set PROXY_ADVERTISE_CAPABILITIES=true on every LEAF and "
             "the SELECTOR (default: true; the frontend's capability-"
             "negotiation path activates only when capabilities are "
             "advertised). Use --no-advertise-capabilities to test "
             "the legacy auto-engage path.",
    )
    parser.add_argument(
        "--no-advertise-capabilities",
        action="store_false",
        dest="advertise_capabilities",
    )
    parser.add_argument(
        "--leaf-startup-timeout",
        type=float,
        default=LEAF_READINESS_TIMEOUT_S,
        help=f"seconds to wait for each LEAF to become reachable "
             f"(default: {LEAF_READINESS_TIMEOUT_S}s)",
    )
    return parser.parse_args()


# ─── Port allocation ──────────────────────────────────────────────────────────


def _allocate_free_port(host: str) -> int:
    """Bind to port 0 and return the OS-assigned port.

    There is a TOCTOU window between this returning and the proxy
    actually binding; in single-user dev the collision risk is
    negligible. If a collision does occur, the LEAF process will
    fail to bind and exit with an OSError — the readiness wait
    detects this and surfaces.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((host, 0))
        return s.getsockname()[1]


def _wait_for_port(host: str, port: int, proc: subprocess.Popen,
                   timeout: float) -> bool:
    """Poll until the port is listenable, the proc dies, or timeout.

    Returns True iff the port became listenable while the proc
    stayed alive. Proc death short-circuits the wait — no point
    polling a port nothing will ever bind.
    """
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            return False
        try:
            with socket.create_connection((host, port), timeout=1.0):
                return True
        except OSError:
            time.sleep(PORT_POLL_INTERVAL_S)
    return False


# ─── Process spawning ─────────────────────────────────────────────────────────


def _build_env(args: argparse.Namespace, role: str, port: int,
               *, model_path: Path | None = None,
               selector_models: str | None = None) -> dict[str, str]:
    """Compose the environment for a single proxy process.

    Inherits the caller's env so additional KataGo / proxy tuning
    knobs (cache caps, rate limits, etc.) flow through unchanged.
    Only the role-specific variables are set explicitly.
    """
    env = os.environ.copy()
    env["PYTHONLOGLEVEL"] = args.loglevel
    env["PROXY_ROLE"] = role
    env["PROXY_HOST"] = args.host
    env["PROXY_PORT"] = str(port)
    if args.advertise_capabilities:
        env["PROXY_ADVERTISE_CAPABILITIES"] = "true"
    if role == "LEAF":
        assert model_path is not None
        env["KATAGO_PATH"] = args.katago_path
        env["KATAGO_MODEL"] = str(model_path)
        env["KATAGO_CFG"] = args.katago_cfg
    if role == "SELECTOR":
        assert selector_models is not None
        env["SELECTOR_MODELS"] = selector_models
    return env


def _spawn_proxy(env: dict[str, str], log_prefix: str) -> subprocess.Popen:
    """Spawn a proxy_server.py process, inheriting parent stdio.

    `cwd=PROXY_DIR` matches the manual-launch convention so
    KATAGO_CFG=./analysis.cfg resolves the same way it does when
    run by hand. The proxy's logger writes to stderr; child stdio
    is left attached to the parent's so the user sees logs live.
    """
    print(f"[run-stack] spawn {log_prefix}", flush=True)
    return subprocess.Popen(
        [sys.executable, str(PROXY_SERVER)],
        env=env,
        cwd=PROXY_DIR,
    )


# ─── Orchestration ────────────────────────────────────────────────────────────


def _validate_inputs(args: argparse.Namespace) -> list[LeafSpec]:
    """Resolve labels, allocate ports, validate paths.

    Fails loudly before any process is spawned — duplicate labels,
    missing model files, missing proxy_server.py all surface here
    so the user doesn't have to read a half-started log.
    """
    if not PROXY_SERVER.exists():
        raise SystemExit(f"proxy_server.py not found at {PROXY_SERVER}")

    leaf_specs: list[LeafSpec] = []
    seen_labels: set[str] = set()
    for raw in args.models:
        try:
            explicit_label, path = _parse_model_arg(raw)
        except ValueError as e:
            raise SystemExit(f"argument error: {e}")
        if not path.exists():
            raise SystemExit(f"model not found: {path}")
        label = explicit_label or _derive_label(path)
        if label in seen_labels:
            raise SystemExit(
                f"duplicate label {label!r} (from argument {raw!r}); "
                f"use `label=path` to disambiguate."
            )
        seen_labels.add(label)
        port = _allocate_free_port(args.host)
        leaf_specs.append(LeafSpec(label=label, model_path=path, port=port))
    return leaf_specs


def _terminate(procs: list[subprocess.Popen], grace_s: float = 5.0) -> None:
    """Send SIGTERM, wait briefly, then SIGKILL stragglers."""
    for p in procs:
        if p.poll() is None:
            p.terminate()
    deadline = time.monotonic() + grace_s
    for p in procs:
        remaining = max(0.0, deadline - time.monotonic())
        try:
            p.wait(timeout=remaining if remaining > 0 else 0.1)
        except subprocess.TimeoutExpired:
            p.kill()
            try:
                p.wait(timeout=2.0)
            except subprocess.TimeoutExpired:
                pass


def main() -> int:
    args = _parse_args()
    specs = _validate_inputs(args)

    print(f"[run-stack] LEAFs to spawn:", flush=True)
    for s in specs:
        print(f"[run-stack]   {s.label!r:>16} -> ws://{args.host}:{s.port} "
              f"(model: {s.model_path})", flush=True)
    print(f"[run-stack] SELECTOR will listen on ws://{args.host}:{args.selector_port}",
          flush=True)
    if args.advertise_capabilities:
        print(f"[run-stack] PROXY_ADVERTISE_CAPABILITIES=true on every process",
              flush=True)

    leaf_procs: list[subprocess.Popen] = []
    selector_proc: subprocess.Popen | None = None

    # Forward Ctrl-C cleanly. asyncio's default SIGINT handling lives
    # inside the proxy processes; this script's job is to propagate
    # the signal to every child and exit cleanly itself.
    interrupted = False
    def _on_sigint(signum, frame):
        nonlocal interrupted
        interrupted = True
        print("\n[run-stack] SIGINT received; tearing down children",
              flush=True)
    signal.signal(signal.SIGINT, _on_sigint)

    try:
        # Phase 1 — spawn every LEAF in parallel; the proxy_server's
        # asyncio loop handles its own startup independently per
        # process.
        for spec in specs:
            env = _build_env(args, "LEAF", spec.port, model_path=spec.model_path)
            proc = _spawn_proxy(
                env,
                f"LEAF label={spec.label} pid=<pending> port={spec.port} "
                f"model={spec.model_path.name}",
            )
            leaf_procs.append(proc)

        # Phase 2 — wait for every LEAF to become reachable. The LEAF
        # logs "listening on ws://..." only after KataGo's startup
        # probe clears, so port-listenable is a strong signal that
        # KataGo is loaded and the LEAF is ready to serve. If any
        # LEAF dies or fails to listen within the budget, abort
        # before bringing up the SELECTOR — a half-broken stack
        # under test is worse than a clear "stack failed to start"
        # error.
        for spec, proc in zip(specs, leaf_procs):
            if interrupted:
                raise KeyboardInterrupt()
            print(f"[run-stack] waiting for LEAF {spec.label!r} on port {spec.port}...",
                  flush=True)
            ready = _wait_for_port(
                args.host, spec.port, proc,
                timeout=args.leaf_startup_timeout,
            )
            if not ready:
                if proc.poll() is not None:
                    raise SystemExit(
                        f"LEAF {spec.label!r} exited with code {proc.returncode} "
                        f"before becoming reachable. See its log output above."
                    )
                raise SystemExit(
                    f"LEAF {spec.label!r} did not start listening on port "
                    f"{spec.port} within {args.leaf_startup_timeout}s. "
                    f"KataGo cold-load may be slow; try --leaf-startup-timeout."
                )
            print(f"[run-stack] LEAF {spec.label!r} ready", flush=True)

        # Phase 3 — bring up the SELECTOR. SELECTOR.start tolerates
        # upstream connect failures (background reconnect with
        # backoff), but Phase 2 already verified every LEAF is
        # reachable, so we expect a clean "SELECTOR ready: healthy=[...]"
        # log line on startup.
        selector_models = ",".join(
            f"{s.label}=ws://{args.host}:{s.port}" for s in specs
        )
        env = _build_env(args, "SELECTOR", args.selector_port,
                         selector_models=selector_models)
        selector_proc = _spawn_proxy(
            env,
            f"SELECTOR port={args.selector_port} "
            f"models=[{', '.join(s.label for s in specs)}]",
        )

        # Phase 4 — wait. The SELECTOR is the long-lived process the
        # user interacts with; its exit (or a SIGINT to this script)
        # tears the whole stack down.
        while not interrupted and selector_proc.poll() is None:
            # Detect any LEAF dying mid-run so the user sees it
            # rather than discovering it later through the SELECTOR's
            # error responses.
            for spec, p in zip(specs, leaf_procs):
                if p.poll() is not None:
                    print(f"[run-stack] WARNING: LEAF {spec.label!r} exited "
                          f"with code {p.returncode}; SELECTOR queries "
                          f"routed to this label will fail loudly.",
                          flush=True)
                    leaf_procs.remove(p)
            time.sleep(1.0)

        if selector_proc.poll() is not None and not interrupted:
            print(f"[run-stack] SELECTOR exited with code "
                  f"{selector_proc.returncode}", flush=True)

    except KeyboardInterrupt:
        # Already logged above; fall through to the cleanup block.
        pass
    finally:
        procs_to_clean = list(leaf_procs)
        if selector_proc is not None:
            procs_to_clean.insert(0, selector_proc)
        if procs_to_clean:
            print(f"[run-stack] terminating {len(procs_to_clean)} child process(es)",
                  flush=True)
            _terminate(procs_to_clean)
        print("[run-stack] done", flush=True)

    return 0


if __name__ == "__main__":
    sys.exit(main())
