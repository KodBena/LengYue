# Investigation — the MiniBoard "flat colour, then texture" flash (2026-06-09)

## Symptom

When the sidebar's docked board preview is scrubbed rapidly — the pointer
entering and leaving board tabs in quick succession — each freshly-shown
thumbnail briefly paints the flat board background colour, then the wood
texture (with grid and stones) "pops in" a frame later. The analysis-panel
preview, rendering the **same** `MiniBoard`, shows no such flash.

The maintainer's framing was the load-bearing clue: *"the impedance observed
indicates a difference in how they're rendered"* — and, crucially, the analysis
preview was **not** deliberately fixed for this; the flash disappeared there
*serendipitously* during an earlier performance overhaul. So the task was to
find the rendering difference, not a prior fix to copy. (And explicitly: no
pre-warm band-aid — the analysis preview doesn't pre-warm, "there it just
works.")

## The detective work (and the dead ends)

Three plausible theories were entertained and discarded at runtime before the
cause surfaced. They are recorded because each was reasonable, and disproving
theories against the running app — rather than assuming them — is the point.

### Dead end 1 — "uncancelled async show/hide race"

From the preceding hover-linger work: the preview is shown via an `await`ed
fetch while hide is synchronous, so a leave-before-show race could strand or
late-show it. **Disproven:** the thumbnail render path is fully synchronous (no
network / timer / worker / real `await`); `await getThumbnailSvg` resolves
purely through microtasks, and the HTML event loop drains microtasks before the
next input-event task — so that ordering is contention-immune and the race
cannot fire. (This belonged to the linger bug, not the texture flash, but it
set the habit of disproving timing theories rather than believing them.)

### Dead end 2 — "snapshot-generation latency / not pre-warmed"

Theory: the sidebar isn't pre-warmed like the analysis path (which calls
`warmPath`), so the first hover of each board pays a cold `generateSnapshot` (a
full-tree deep-copy + replay). **Partly true, but not the flash.** Measured
`generateSnapshot` at **1.6–3.2ms** for ordinary boards; the cache works
(re-hover is a `HIT` at ~0.4ms). A first MutationObserver-based latency probe
reported **~970ms** to fill — which proved to be a **broken measurement** (the
observer / hover bookkeeping), corrected by an in-component `watch` and a
reliable poll that both showed the computed fills in **0.3–3ms** and the canvas
appears in **6–10ms**. Lesson banked: a single measurement that disagrees with
the model is a measurement to re-take with a second method, not a finding.

### Dead end 3 — "ResizeObserver async first paint"

Theory: a fresh `MiniBoardCanvas` defers its first `draw()` to the async
`ResizeObserver` callback, leaving one blank frame (the container background) on
each remount. **Disproven:** instrumenting mount → first-paint showed the first
paint lands **0.7–1.2ms after mount** — fast, not a deferred frame.

### Root cause — "shared" resources that weren't shared

The same instrumentation that killed dead end 3 carried the answer:
**`woodReady` was `false` on *every* sidebar mount**, and `ensureWood` fired
**twice** — once at app load, again on the first sidebar hover — with `woodImg`
null both times. That is impossible if `woodImg` / `woodReady` were module-level.

They weren't. `MiniBoardCanvas` declared its *"loaded once, shared across every
instance"* wood texture **and** stone-sprite cache **inside `<script setup>`** —
which the Vue SFC compiler folds into `setup()`, i.e. **per-instance**. The
comments asserted a sharing the code never delivered.

Why only the sidebar flashes: the analysis-panel preview is a **single,
persistently-mounted instance** — it loads the wood once and never remounts, so
it never re-pays. The sidebar's docked preview **remounts on every hover**
(`v-if` on a `previewBoardId` that is null between hovers), so each hover creates
a fresh instance with its own `woodReady = false`, reloads the texture, and
first-paints textureless until its own copy decodes. The "performance overhaul"
the maintainer recalled didn't fix this — it moved the analysis preview onto a
persistent instance that *masks* it.

## The fix

Move the shared resources (`woodImg` / `woodReady` / `woodWaiters` /
`ensureWood`, and `spriteCache` / `stoneSprite`) into a plain module-scope
`<script>` block, so the texture decodes once per session and every later mount
first-paints with it — and the stone sprites are genuinely shared instead of
rebuilt per thumbnail. Not a pre-warm: making *"shared, loaded once"* actually
true. Verified at runtime — `ensureWood` fires once; every one of 12 rapid
sidebar remounts first-paints with `woodReady = true`; pixel-sampling shows real
wood tones on the first frame.

(Because this touches a reactive/shared-state seam, the change is being measured
under a deliberate in-browser jank profile — main vs. fixed, identical
harness — before it is treated as settled, rather than asserted from the
headless numbers above.)

## Significance — mostly cosmetic, but a discrepancy worth consolidating

At the end of the day this is **mostly cosmetic to real users**: the textureless
frame is visible for **under ~10ms** (sub-frame), and only while scrubbing the
preview rapidly. The value of chasing it was less the pixels than what it
*revealed*: two consumers render the same component along **two different
lifecycles** — one persistently mounted and redrawn, one mounted-and-torn-down
per hover — and a latent "shared" resource that was actually per-instance went
unnoticed for as long as only the persistent consumer existed. The
remount-per-hover consumer is what surfaced it.

That is the kind of discrepancy that warrants **an eye toward consolidation**
(the maintainer's read, recorded here for posterity): a single shared rendering
lifecycle, with genuinely shared resources guarded against the `<script setup>`
per-instance footgun, would make this class of bug impossible rather than
merely latent. Worth fixing — but its real worth is as a signpost toward
consolidating how thumbnails are rendered.

## Lessons, distilled

- **`<script setup>` scopes its top-level declarations per-instance.** Anything
  meant to be module-shared ("loaded once", a cache) must live in a plain
  `<script>` block. A comment claiming "shared across instances" is not a
  guarantee; the block it sits in is.
- **A latent bug masked by one usage pattern surfaces when a second arrives.**
  Persistent-mount hid a per-instance "shared" resource; remount-per-hover
  exposed it. New usage patterns are bug-finders — and an argument for
  consolidating patterns rather than multiplying them.
- **Disagreeing measurements are measurements to re-take.** The 970ms
  MutationObserver artifact would have aimed the fix in the wrong direction; a
  second method (in-component timing) corrected it. Verify at runtime — and
  verify the verifier.

---

License: Public Domain (The Unlicense).
