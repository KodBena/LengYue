# Worklog — MiniBoardCanvas texture-scope fix + jank-profile audit trail (2026-06-09)

> Delivery record for the "flat-board-colour, then texture" flash on the sidebar
> docked hover preview. Two PRs to `main`: **#366** (the fix) and **#367** (the
> dev-only jank-test harness built to measure it). The full detective trail —
> three dead ends, the cache-gated race, the lessons — lives in
> `docs/notes/investigation-mini-board-texture-flash-2026-06-09.md`; this worklog
> records the delivery and the before/after measurement audit trail.

## The change

- **#366 — the fix.** `MiniBoardCanvas` declared its *"loaded once, shared across
  every instance"* wood texture and stone-sprite cache **inside `<script setup>`**,
  which the SFC compiler scopes **per-instance**. Remount-per-hover consumers (the
  sidebar docked preview) reloaded the texture and first-painted textureless until
  their own copy decoded; the persistently-mounted analysis preview masked it.
  Fix: move the shared resources (`woodImg`/`woodReady`/`woodWaiters`/`ensureWood`,
  `spriteCache`/`stoneSprite`) into a plain module-scope `<script>` block — "shared,
  loaded once" made actually true. Runtime-verified: `ensureWood` fires once (was
  per-instance / double-load); every one of 12 rapid remounts first-paints with
  `woodReady = true` (was `false`); pixel-sampling shows wood on the first frame.
- **#367 — the harness.** A dev-gated (`import.meta.env.DEV`) `jank test` button +
  `useJankTest` composable: loads 16 boards (the fixed 342-move Shusaku vs Ito Showa
  game + 15 random library games), forwards the rest to move 50, auto-navigates the
  long game, and scrubs the docked preview at a 20–50ms cadence so a human can
  capture an in-browser profile. Kept for future thumbnail/preview profiling.

## Jank-profile measurement (the audit trail)

Same harness on both builds (baseline `main` vs. the fix), four Firefox-Profiler
captures (two each). Every full run splits into a **~8s janky warm-up** (the
16-game load: `eventDelay` p95 600–685ms, ~85% of samples >50ms, main thread ~85%
busy) and a **steady** phase (autonav + scrub: `eventDelay` p95 ~30ms, ~94% busy).
Three views, per the maintainer's request:

- **Aggregate** — dominated by the warm-up; baseline and fixed indistinguishable
  (p95 ≈ 520ms, max ≈ 1000ms).
- **Warm-up** — identical (p95 599/671 baseline vs. 685 fixed; CPU ~6.8s/8s both).
  Expected — the warm-up is SGF parse + replay + render, nothing to do with texture.
- **Steady** — no measurable difference: `eventDelay` p95 30/31 vs. 33; paint
  count (`DisplayList`) 354/353 vs. 352; `GCMinor` ~35 vs. 30. The lone wobble
  (sync reflows/s ~190 vs. ~124) is confounded by the *different* random 15-game
  set per run and contradicted by the second fixed run — not attributed to the fix.

One capture was a partial run (2s warm-up, full 16 games not loaded) and excluded.

**Verdict: no measurable performance delta.** Two recorded reasons: (1) the
captures were warm-cache, so the baseline didn't flash or double-paint — the builds
behave identically by construction, and `DisplayList` confirms it; (2) even cold,
the per-mount cost (~2 sprite rebuilds + an `Image`/`woodWaiters` re-arm × ~700
mounts) is tens of ms against a steady state already ~94% CPU-bound by autonav,
below the `eventDelay` noise floor. The flash is also a *cache-gated race*
(per-instance `onload` vs. first paint), so it isn't even deterministically present
on the buggy build. **Shipped as a correctness / visual fix, not a performance
win.** Methodology notes for any rerun: pin the game set, and capture the baseline
cold if the flash itself is to appear in the trace.

## Status

- PRs #366, #367 merged to `main`.
- Work-status: `mini-board-texture-scope` and `thumbnail-jank-harness` → shipped;
  **`thumbnail-render-lifecycle-consolidation`** opened `future` — the deferred
  follow-up the investigation surfaced (two thumbnail consumers render the same
  `MiniBoard` along different lifecycles; consolidating to one shared lifecycle,
  guarded against the `<script setup>` per-instance footgun, would make this class
  of bug impossible rather than latent).

---

License: Public Domain (The Unlicense).
