# Proxy → Proxy: Post-v1.0.13 follow-up punch list

- **Date:** 2026-05-06
- **From:** proxy (outgoing session, Claude Opus 4.7 1M)
- **To:** proxy (incoming session, whenever that is)
- **Type:** punch list — three loose ends from the v1.0.13 release
  window that are real but don't block anything user-visible
- **Status:** filed for the next proxy-side session's pre-work read.
  No action required of the user beyond merging this dispatch and
  optionally picking items off the list as opportunity warrants.
- **Filing convention:** `docs/dispatch/proxy-to-proxy-{topic}.md`
  per ADR-0005's dispatch ledger. Second proxy↔proxy entry, after
  `proxy-to-proxy-id-translation-near-miss.md`.

## Why this exists

The v1.0.13 release window was unusually busy on the proxy side
(three coupled refactors PR #17/#18/#19 ↦ tag, plus PR #16 for v1.0.12
and PR #20 for the gobackend warnings). Not every loose end that
surfaced was in scope; the user explicitly noted that proxy churn is
slow enough that things drop off the radar between sessions, and
asked that follow-ups be filed rather than relied on conversational
memory.

This is that file. Three items, ordered by ease-of-pickup. None is
user-visible. None blocks any release. All are appropriate to land
in any future proxy patch arc.

## Item 1 — Sibling-parser sweep for silent coercion

**Status:** Punted explicitly from the umbrella `docs/TODO.md`
silent-coercion-at-protocol-boundaries audit entry, which closes
the umbrella side (frontend + backend) but leaves the proxy side as
"already handled the two acute instances; sibling sweep open."

**Background.** The pattern surfaced twice in the v1.0.13 release
window — same shape, different field:

  - **Query side (PR #16, v1.0.12).** `parse_query_from_wire` had
    `action_map.get(action_str, KataGoAction.ANALYZE)`. An unknown
    action coerced to `ANALYZE`; `translate_query_to_wire` then
    dropped the `action` field from the wire because the gate is
    `if action != ANALYZE`. KataGo received `{"id": "..."}` and
    hung. Fix: closed-set membership check + raise on unknown,
    plus dispatch-prism gating to keep audit-H-3 happy.

  - **Response side (PR #17, v1.0.13).** `parse_response_from_wire`
    had `wire.get("isDuringSearch", False)` and
    `wire.get("turnNumber", 0)`. Metadata responses (which carry
    neither field on the wire) round-tripped out with synthetic
    `False`/`0` polluting the wire. Fix: discriminated-union
    response type (`AnalyzeResponse | MetadataResponse`), parser
    discriminates structurally on key presence, half-present is a
    protocol violation.

Same shape, two places. The audit's worry: what if there's a third?

**The sweep.** From `proxy/`:

```sh
# Wire-vocabulary maps and structural defaults
grep -rn '\.get(\(["'\''][^"'\'']*["'\''],[^,)]*[A-Z]' \
    katago/ AbstractProxy/ middleware/ transformers/ \
    proxy_server.py router.py pubsub_hub.py
```

Most hits will be benign — genuine optionality, sentinel-default
extraction. The parser-shaped ones are the smell:

  - A *non-None, non-sentinel* default (e.g. an enum member, a
    boolean literal, an integer constant)
  - That value is then read in a downstream gate or emitted on the
    wire

Specific sites to inspect (as of v1.0.13 main):

  - `pubsub_hub.py` cache-flag extraction:
    `cache_flag = bool(query.opaque.pop("cache", False))` and the
    sibling `lookup_cache`, `replay_final_only` extractions. These
    are wire control flags — `False` is the right vanilla-protocol
    default (analogous to "missing action key means analyze"). But
    confirm the missing/unknown distinction holds: a *missing*
    flag → `False`; a *malformed* value (e.g. `cache: "yes"`,
    `cache: 1`) currently coerces silently via `bool()`. Worth a
    look — does the proxy want to fail loud on type errors here?
  - `router.py` `wire.get("...", default)` patterns in the LEAF
    and RELAY receive paths. Quick scan suggests they're mostly
    structural (id extraction, wire-shape inspection) rather than
    closed-set vocabularies, but a focused pass would confirm.
  - `proxy_server.py` rate-limit / replay-cache-key extraction
    paths.

**Scope.** Probably an afternoon's work as a focused audit pass.
If the sweep finds nothing, the audit's worked-example catalogue
stays at two and the sweep is the witness that two is the count.
If it finds a third, fix it the same shape (closed-set membership,
fail loud on parse, gate-not-raise at receive-loop).

**Output.** Either a "no-third-instance found" closure dispatch
(`proxy-to-proxy-silent-coercion-sweep-status.md`), or a fix PR
mirroring PR #16/#17.

## Item 2 — Wheel-build entry-point breakage

**Status:** Pre-existing; called out in PR #19's "Coordination"
section and in the v1.0.13 tag annotation. Has been broken since
the v1.0.x packaging began.

**The bug.** `proxy/pyproject.toml`'s `[project.scripts]` declares:

```toml
[project.scripts]
kataproxy = "proxy_server:main"
```

But `[tool.hatch.build.targets.wheel] packages = [...]` lists
sub-packages only (`AbstractProxy`, `katago`, `transformers`,
`middleware`, `reactive_pipeline` post-v1.0.13). Root-level loose
modules (`proxy_server.py`, `router.py`, `pubsub_hub.py`,
`sproxy_config.py`, `logging_config.py`, `proxy_json.py`,
`delta_analysis.py`, `registry_interpreter.py`, `contextual.py`)
are NOT in the wheel. So `pip install kataproxy` succeeds, but
`kataproxy` (the script entry point) fails at first call with
`ModuleNotFoundError: No module named 'proxy_server'`.

**Why it doesn't bite anyone.** The proxy is launched via
`run_leaf.sh`, which invokes `python ./proxy_server.py` from a
clone — never via the installed entry point. Nobody is hitting
the broken path. Confirmed in PR #19's verification — the
behaviour is unchanged from v1.0.12 (which had the same shape,
also broken, also unused).

**The structural decision.** Three viable shapes:

  1. **Remove the script entry.** `pip install` becomes "library"
     install; users run from a clone. Honest about current
     reality. One-line fix to `pyproject.toml`. Loses the
     someday-ergonomic-CLI option.

  2. **Package the loose modules via `[tool.hatch.build.targets
     .wheel.force-include]` or a similar config.** Keeps the
     current layout, makes the wheel actually installable as a
     CLI tool. Hatchling supports this; needs a small config
     block listing the loose `*.py` files explicitly.

  3. **Restructure under a single `kataproxy/` package.** Move
     every root-level loose module into `kataproxy/` (or
     `kataproxy_app/` since `kataproxy` is the project name).
     Most idiomatic Python packaging shape; biggest disruption —
     every importer of `from proxy_server import ...`,
     `from router import ...`, etc. would need updating. The
     pre-v1.0.0 pyproject.toml comment ("Phase 5 will reorganize
     these into a proper kataproxy/ package") points at this
     shape; the v1.0.13 reorg PR #19 explicitly chose NOT to
     pursue it.

**Recommendation.** Option 1 is honest and minimal. Option 3 is
the "right" shape but is a separate refactor with its own
import-rewriting cost — not the v1.0.13 vintage. If neither
option is taken in the next year or two, Option 1 is the
appropriate close-out: the entry point doesn't work, isn't used,
and lying about it in `pyproject.toml` is the bug.

## Item 3 — Duplicated `JSONEncoder.default` monkey-patch

**Status:** Flagged in the source itself with "future cleanup"
comments. Pre-existing.

**The bug.** Both `proxy_server.py` (around line 88) and
`delta_analysis.py` (around line 11) install a
`json.JSONEncoder.default` extension that handles `SortedList`,
NumPy scalars, and standard Python `NaN`. Whichever module loads
last wins. The bodies are identical; the duplication is
post-v1.0.6 (audit L-2), and the comments in both modules
acknowledge the duplication explicitly:

```python
# This patch is duplicated by delta_analysis.py for the same
# reasons and survives whichever module loads last; consolidating
# into one place is a future cleanup.
```

**The fix.** Pick a single home — either `logging_config.py`
(probably wrong; it's not a logging concern), `proxy_json.py`
(closest match — it's already the JSON utilities home, currently
just `loads_bounded` + `JsonDepthExceededError`), or a new
`json_encoder_extensions.py` (single-purpose). Recommendation:
`proxy_json.py`, since the file is already the JSON-utils home
and the addition fits the existing posture.

Then import the side-effect from `proxy_server.py` and
`delta_analysis.py` (`import proxy_json` at module top is enough
if the patch is installed at import time of `proxy_json`).

**Scope.** ~15 lines moved, two import statements added, two
duplicated blocks deleted. Tests should exercise the JSON-encoded
path (the `extra` field in baduk-style enrichment is the
exercising case).

## What's NOT in this dispatch

Items already documented elsewhere; no action triggered:

  - **`Dispatcher` unused in live path** — flagged in
    `proxy/ARCHITECTURE.md`'s "Where this falls short". It's
    scaffolding for a multi-protocol future. Don't refactor; it
    only becomes load-bearing if/when a second protocol is
    actually supported.
  - **`Prism` approximate optic** — flagged in the same section.
    Would benefit from formal-FP review, not from incremental
    edits.
  - **`str` constraint on identity types in supposedly generic
    code** — flagged in the same section. Surfacing properly
    requires a second protocol implementation.
  - **`testpaths = []` in pyproject.toml** — empty config, pytest
    discovers from cwd. Harmless; doesn't need changing.
  - **`[project.urls] Repository = "https://github.com/KodBena/
    kataproxy"`** — lowercase project name, actual repo is
    `KataProxy`. GitHub redirects; cosmetic only.

## On the v1.0.14 release

A small patch release accumulates from PR #20 (the gobackend
warning fixes). It's not a loose end in the same sense as the
above — the user knows about it, and the change is small enough
to bundle with whichever item from this dispatch lands first.

If a session picks up Item 1 (the silent-coercion sweep), bundle
the gobackend fixes into the v1.0.14 tag at that point. If
nothing in this dispatch lands soon, cut v1.0.14 stand-alone for
the gobackend warnings — small, mechanical, no risk.

The umbrella's pin (currently v1.0.13) follows the proxy bump per
the standard submodule release arc.

## Suggested onboarding cross-reference

`docs/onboarding/proxy.md`'s "Read in this turn" section already
includes the existing
`proxy-to-proxy-id-translation-near-miss.md` letter. This
dispatch should join it as a second pre-work read when a future
proxy session starts — both letters are short, both are scoped to
the proxy side, and both encode lessons that won't re-emerge
naturally during onboarding.

The onboarding-doc edit lands in the same PR as this dispatch, so
the cross-reference is in place from the moment this file appears.
