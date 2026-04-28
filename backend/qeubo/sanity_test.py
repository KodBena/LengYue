"""
qeubo/sanity_test.py

End-to-end sanity test of the qEUBO public API contract. Configurable
sweep over input dimension and trial count; each trial selects a random
target in [0, 1]^dim and runs an A/B preference optimisation with truth
function "smaller L2 distance to target is preferred."

Init-phase responses are uniform-at-random (preserves SNR on the later
optimisation-phase signal). Optimisation-phase responses are truth-based.
Convergence is reported per trial and aggregated across the sweep.

The runtime self-applies the third-party-API compatibility shims it
needs (botorch sample_shape coercion; torch float64 default) at package
import time; this script imports `qeubo` like any other PD caller and
inherits the shimmed environment transparently. See
`backend/qeubo/runtime/_compat.py` and the README's "Compatibility
envelope" section.

Intended for user-driven invocation. Long sweeps (large `--trials` or
high `--dim`) can run for tens of minutes; per the Robustness Principle
(RFC 793 / RFC 1122 — *"assume the network is filled with malevolent
entities"* applied to LLM tooling), do not have an LLM session invoke
this script in long-running configurations and wait for results. Hand
off to the user for execution and resume when results are reported
back. The same posture applies to any future research-tool script in
this codebase: design for the user-driven case unless the runtime is
genuinely interactive.

Usage (from the backend/ directory, with the venv activated and Redis
on `127.0.0.1:6379`):

    python qeubo/sanity_test.py --dim 2 --trials 5
    python qeubo/sanity_test.py --dim 3 --trials 10 --opt-budget 30
    python qeubo/sanity_test.py --dim 5 --trials 5 --opt-budget 40 --seed 7

Per-trial output looks like:

    [OK ] trial  3 target=(0.412, 0.793, 0.061) best=(0.408, 0.801, 0.078) d=0.0193 cycles=37 t=92.3s

A trial passes when the final L2 distance from `get_best_point` to the
trial's random target is below `--threshold` (default 0.1).

License: MIT — see backend/qeubo/LICENSE
"""
import argparse
import asyncio
import math
import os
import random
import sys
import time
from concurrent.futures import ThreadPoolExecutor

# Make the qeubo package importable regardless of how this script is
# invoked (`python qeubo/sanity_test.py`, `python -m qeubo.sanity_test`,
# or from another working directory).
_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.dirname(_HERE)
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

# Importing the qeubo package activates its runtime/_compat shims as a
# module-import side effect; this PD-caller-shaped test is otherwise
# unaware of the third-party-API drift the shims absorb.
from qeubo import ExperimentService, ExperimentStorage  # noqa: E402


def parse_args(argv):
    p = argparse.ArgumentParser(
        description="qEUBO sanity sweep over random L2-target trials"
    )
    p.add_argument("--dim", type=int, default=2,
                   help="input dimension (default 2)")
    p.add_argument("--trials", type=int, default=5,
                   help="number of random-target trials (default 5)")
    p.add_argument("--opt-budget", type=int, default=25,
                   help="optimisation iterations per trial (default 25)")
    p.add_argument("--seed", type=int, default=42,
                   help="base seed for reproducibility (default 42)")
    p.add_argument("--redis-url", type=str,
                   default="redis://127.0.0.1:6379",
                   help="Redis URL (default redis://127.0.0.1:6379)")
    p.add_argument("--threshold", type=float, default=0.1,
                   help="L2 success threshold (default 0.1)")
    p.add_argument("--verbose", action="store_true",
                   help="print every cycle (default: per-trial summary only)")
    return p.parse_args(argv)


def l2(values, target):
    return math.sqrt(sum((v - t) ** 2 for v, t in zip(values, target)))


async def run_trial(svc, *, dim, trial_index, opt_budget, seed,
                    threshold, verbose):
    """Run one A/B optimisation trial; return convergence stats."""
    rng = random.Random(seed)
    target = [rng.random() for _ in range(dim)]
    param_names = [f"x{i}" for i in range(dim)]
    parameter_ranges = {name: [0.0, 1.0] for name in param_names}

    eid = f"sanity:trial_{trial_index}"
    try:
        await svc.delete_experiment(eid)
    except ValueError:
        pass

    user_config = {
        "controlled_parameters": param_names,
        "parameter_ranges": parameter_ranges,
        "num_algo_queries": 1_000_000,
    }
    await svc.create_experiment(eid, user_config)

    t0 = time.time()
    cycle = 0
    while True:
        s = await svc.get_status(eid)
        if s["phase"] == "optimization" and s["iteration"] >= opt_budget:
            break

        pair = await svc.request_pair(eid)
        v_a = list(pair["point_a"])
        v_b = list(pair["point_b"])

        if pair["phase"] == "init":
            preferred = rng.randint(0, 1)
            tag = "init"
        else:
            preferred = 0 if l2(v_a, target) <= l2(v_b, target) else 1
            tag = "opt "

        await svc.submit_response(eid, pair["query_uuid"], preferred)
        cycle += 1

        if verbose:
            d_a = l2(v_a, target)
            d_b = l2(v_b, target)
            print(
                f"    cycle {cycle:3d} {tag} "
                f"a_d={d_a:.3f} b_d={d_b:.3f} "
                f"pref={'A' if preferred == 0 else 'B'} "
                f"phase={pair['phase']} iter={pair['iteration']}"
            )

    best = await svc.get_best_point(eid)
    v_final = list(best["best_point"])
    d_final = l2(v_final, target)
    elapsed = time.time() - t0

    try:
        await svc.delete_experiment(eid)
    except ValueError:
        pass

    return {
        "trial": trial_index,
        "target": target,
        "final_best": v_final,
        "d_final": d_final,
        "elapsed_s": elapsed,
        "cycles": cycle,
        "converged": d_final < threshold,
    }


async def main_async(args):
    storage = ExperimentStorage(args.redis_url)
    if not await storage.ping():
        print(f"REDIS DOWN: cannot ping {args.redis_url}", file=sys.stderr)
        return 2

    executor = ThreadPoolExecutor(
        max_workers=2, thread_name_prefix="qeubo_sanity"
    )
    svc = ExperimentService(storage, executor)

    print(
        f"sweep: dim={args.dim} trials={args.trials} "
        f"opt_budget={args.opt_budget} seed={args.seed} "
        f"threshold={args.threshold}"
    )
    print(
        f"  init_total per trial = {4 * args.dim} "
        f"(default num_init_queries = 4 * input_dim)"
    )

    results = []
    try:
        for i in range(args.trials):
            try:
                r = await run_trial(
                    svc,
                    dim=args.dim,
                    trial_index=i,
                    opt_budget=args.opt_budget,
                    seed=args.seed + i,
                    threshold=args.threshold,
                    verbose=args.verbose,
                )
            except Exception as e:
                print(
                    f"  [ERR] trial {i:2d} failed: {type(e).__name__}: {e}",
                    file=sys.stderr,
                )
                continue

            target_str = "(" + ", ".join(f"{t:.3f}" for t in r["target"]) + ")"
            best_str = "(" + ", ".join(f"{v:.3f}" for v in r["final_best"]) + ")"
            verdict = "OK " if r["converged"] else "MISS"
            print(
                f"  [{verdict}] trial {r['trial']:2d} "
                f"target={target_str} best={best_str} "
                f"d={r['d_final']:.4f} cycles={r['cycles']} "
                f"t={r['elapsed_s']:.1f}s"
            )
            results.append(r)
    finally:
        executor.shutdown(wait=False, cancel_futures=True)

    n = len(results)
    if n == 0:
        return 1
    converged = sum(1 for r in results if r["converged"])
    d_finals = [r["d_final"] for r in results]
    elapsed_total = sum(r["elapsed_s"] for r in results)
    print()
    print(f"aggregate: {converged}/{n} converged within {args.threshold}")
    print(
        f"  d_final: min={min(d_finals):.4f} "
        f"mean={sum(d_finals)/n:.4f} max={max(d_finals):.4f}"
    )
    print(f"  total wall time: {elapsed_total:.1f}s")

    return 0 if converged == n else 1


def main(argv=None):
    args = parse_args(argv if argv is not None else sys.argv[1:])
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    sys.exit(main())
