# LYT relations-first amendment, dispatch C2: fixture reclassification

Ledger rows 2426/2427. Worktree dispatch, commit `61a01c2e` on
`worktree-agent-adf1475133bac23b3` (rebased onto `lyt-phase2` @ `fd028026`
before starting — the worktree's original base predated the whole
`lyt-phase2` line and had no `research/lyt` at all; see "Base freshness"
below).

## Ruling and destination

`current_row_asis.lyt` and `current_row_repaired.lyt` are transcriptions
of reality — measurements of today's SPA's row-axis layout — not designs
under governance, so they move out of `research/lyt/encodings/`.

**Destination: `research/lyt/fixtures/transcription/`.** Chosen as a
sibling of the existing `fixtures/reference/` directory (dispatch A's
`ogs.lyt`/`q5go.lyt` move, ledger rows 2396/2397/2399/2400) — the two
directories now partition the fixture surface by provenance:
`fixtures/reference/` holds third-party UI transcriptions (OGS, q5go),
`fixtures/transcription/` holds first-party transcriptions (LengYue's
own SPA, as-is and repaired). The name mirrors the ruling's own word
("transcriptions of reality") rather than inventing new vocabulary.

## Base freshness

The worktree's assigned branch (`worktree-agent-adf1475133bac23b3`) was
cut from `3378806f`, a commit that predates `lyt-phase2` entirely — no
`research/lyt` directory existed on it at all. Per the standing
worktree-staleness discipline, I rebased onto `lyt-phase2` (`fd028026`,
the branch tip at dispatch time) before starting; `git status` showed no
work-in-progress to lose (only an untracked `.claude/` directory, left
alone). Confirmed post-rebase: `HEAD` == `lyt-phase2` tip, and
`research/lyt/fixtures/reference/ogs.lyt` (dispatch A's own move) was
present, satisfying the dispatch's own freshness precondition.

## The move

```
git mv research/lyt/encodings/current_row_asis.lyt      research/lyt/fixtures/transcription/current_row_asis.lyt
git mv research/lyt/encodings/current_row_repaired.lyt  research/lyt/fixtures/transcription/current_row_repaired.lyt
```

`runner.py`'s `resolve_encoding_file` (dispatch A's own fixture-resolver
mechanism, one function every consumer of `Registration.files` already
goes through) gained a third fallback directory,
`FIXTURES_TRANSCRIPTION_DIR`, alongside the pre-existing `ENCODINGS_DIR`
and `FIXTURES_REFERENCE_DIR`. `tests/test_lyt.py`'s own `_load` helper
(the test-side analog dispatch A introduced) got the same third
directory added to its resolution tuple. This is the one load-bearing
mechanism change; every other consumer (`emit_ts.py`, `emit_mockup.py`,
`coverage_matrix.py`) already routed through `resolve_encoding_file` and
needed no further change once it was extended.

## Reference sweep

Exhaustive `grep -rn "current_row_asis\|current_row_repaired"` over the
whole repository, then narrowed to genuine path claims
(`encodings/current_row_*`, since a bare filename mention resolves
through `resolve_encoding_file`'s fallback chain and isn't a dangling
reference). Final verification grep (`encodings/current_row`, whole
repo, dispatch-reports/logs/divergence excluded) returned zero hits
after the fixes below.

| Location | Kind | Action | Status |
|---|---|---|---|
| `research/lyt/encodings/current_row_asis.lyt` | file | `git mv` → `fixtures/transcription/` | WITNESSED |
| `research/lyt/encodings/current_row_repaired.lyt` | file | `git mv` → `fixtures/transcription/` | WITNESSED |
| `research/lyt/runner.py` `resolve_encoding_file` | resolver | extended with `FIXTURES_TRANSCRIPTION_DIR` fallback + docstring update | WITNESSED |
| `research/lyt/tests/test_lyt.py` `_load` helper | resolver | extended with same fallback directory | WITNESSED |
| `research/lyt/tests/test_lyt.py:1336,1346,1402` | code | 3× hardcoded `ENCODINGS_DIR / "current_row_asis.lyt"` → `FIXTURES_TRANSCRIPTION_DIR / "current_row_asis.lyt"` | WITNESSED |
| `research/lyt/tests/test_lyt.py:1320` | docstring | `encodings/current_row_asis.lyt` → `fixtures/transcription/current_row_asis.lyt` | WITNESSED |
| `research/lyt/bench_solve.py:174` | code | hardcoded `ENCODINGS_DIR / f` read → `resolve_encoding_file(f)`; unused `ENCODINGS_DIR`/`Path` import removed as dead code this edit created | WITNESSED |
| `research/lyt/bench_solve.py:14` | docstring | path fixed | WITNESSED |
| `research/lyt/emit_ts.py` `render_ts`'s `source_encoding` | code | was a hardcoded `f"research/lyt/encodings/{reg.files[0]}"` string baked into the generated `.gen.ts` header comment — now derived via `resolve_encoding_file(...).relative_to(repo_root)`, correct for whichever of the three directories the file lives in | WITNESSED |
| `research/lyt/emit_ts.py:1,20` | docstring | path fixed | WITNESSED |
| `research/lyt/baseline.py:10` | docstring | path fixed | WITNESSED |
| `research/lyt/wellformed.py:275` | docstring | path fixed | WITNESSED |
| `research/lyt/README.md:284,293` | doc (read end to end, full 341 lines, before editing) | path fixed | WITNESSED |
| `research/lyt/SPEC.md:607,780` | doc | path fixed (context-read only, ~1818-line document — see "Documentation reading disclosure" below) | WITNESSED |
| `research/lyt/SPEC-AMENDMENTS.md:929` | doc | reworded — this line lists what Amendment 6 touched, historically true when all four files lived in `encodings/`; dropped the misleading shared `encodings/` prefix and added a one-sentence note pointing at this dispatch's move (context-read only, ~1805-line document) | WITNESSED |
| `research/lyt/encodings/lengyue_landscape.lyt:69,95` | encoding file, comment only | path fixed inside `--` comments; no grammar/geometry touched | WITNESSED |
| `frontend/FILES.md:406,408` | doc (lookup reference, partial consultation is its intended mode per `frontend/CLAUDE.md`) | path fixed in both `.gen.ts` entries | WITNESSED |
| `frontend/scripts/lyt-conformance.mjs:262,267` | code — actual `encodingPath` used in the divergence-report header | path fixed, comment added | WITNESSED |
| `frontend/src/state/layout-model.ts:343-344` | comment (found during a follow-up grep after the primary sweep — a two-line-wrapped `research/lyt/encodings/\ncurrent_row_asis.lyt` citation the first grep pass, keyed to the single-line form, missed) | path fixed | WITNESSED |
| `frontend/src/state/lyt-solved-layout.gen.ts` | GENERATED | regenerated via `emit_ts.py --registration current_row_repaired.lyt`; 1-line diff (header only), solved geometry byte-identical (45 slots, same OPTIMAL/INFEASIBLE pattern at all 4 sizes) | WITNESSED |
| `frontend/src/state/lyt-solved-layout-asis.gen.ts` | GENERATED | regenerated via `emit_ts.py --registration current_row_asis.lyt`; 1-line diff (header only), solved geometry byte-identical (46 slots) | WITNESSED |
| `.claude/dispatch-reports/*.md` mentions | historical record | EXEMPT per dispatch instruction | — |
| `research/lyt/divergence/*.md` mentions | historical, timestamped run artifacts | EXEMPT, treated the same as dispatch reports (snapshots of a past run, not living cross-references) | — |
| `research/lyt/facts.generated.json`, `facts.residue.json`, `loader.py`, `parser.py`, `tools/probe_harness/measure.mjs` | bare filename mentions, no `encodings/` prefix | no action — not path claims, and every one resolves dynamically through `resolve_encoding_file`/`Registration.files` where it matters | UNEXERCISED (no fix needed; confirmed non-dangling by inspection) |
| `docs/` (umbrella top-level) | — | grepped for `current_row_asis\|current_row_repaired`, zero hits | REFUSED-AS-EXPECTED (nothing to fix) |

## Doc-graph

The umbrella's doc-graph (`docs/doc-graph.json`) tracks 491 nodes.
Checked which of the edited files are graph nodes at all: only
`frontend/FILES.md` is (research/lyt's own README/SPEC/SPEC-AMENDMENTS
are not tracked nodes). The `frontend/FILES.md` edit is content-only —
correcting a stale path string inside two pre-existing entries, adding
no doc, removing no doc, adding or removing no cross-reference edge —
so per the umbrella CLAUDE.md's own rule ("a content-only edit need
not [regenerate]"), no `doc-graph` regeneration was required. Confirmed
`git diff --stat -- docs/` is empty; nothing under `docs/` changed.

## Documentation reading disclosure (ADR-0002)

`research/lyt/README.md` was read end to end (all 341 lines) before any
edit or claim about it. `research/lyt/SPEC.md` (1818 lines) and
`research/lyt/SPEC-AMENDMENTS.md` (1805 lines) were **not** read end to
end — given this dispatch's mechanical, narrowly-scoped nature (three
literal path-string citations across two very large specs), I read only
the ~25-40 lines of surrounding context around each hit, enough to make
the surgical edit safely and confirm it didn't collide with the
sentence's own meaning. This is disclosed per the umbrella CLAUDE.md's
own carve-out ("if a document is too long to read in full given the
immediate budget, say so explicitly"). What's skipped: the remainder of
both documents' own content — sections unrelated to these three path
citations. This dispatch made no claim about SPEC.md/SPEC-AMENDMENTS.md
content beyond the three touched sentences, so the gap shouldn't affect
this report's own claims, but a reader relying on this report for
SPEC.md/SPEC-AMENDMENTS.md orientation should read those documents
themselves rather than through this note.

## Gate: research/lyt pytest suite

Venv per `research/lyt/README.md`'s own recipe:
`python3 -m venv /tmp/lyt-venv-c2 && /tmp/lyt-venv-c2/bin/pip install ortools pytest`.

| When | Command | Result |
|---|---|---|
| Before the move | `cd research/lyt && nice -n 19 /tmp/lyt-venv-c2/bin/pytest tests/ -q` | **421 passed**, exit 0 |
| After the move + all reference fixes | same | **421 passed**, exit 0 |

No test was weakened or had its hardcoded path removed rather than
fixed — the three `ENCODINGS_DIR`-hardcoded `read_text()` calls in
`test_lyt.py` were repointed to `FIXTURES_TRANSCRIPTION_DIR`, not
deleted or loosened.

## Additional smoke checks (beyond the pytest gate)

Since the fixture move touches several CLI entry points that the pytest
suite doesn't itself invoke as subprocesses, I ran each directly:

- `python runner.py` (full CLI, all 5 registrations × 4 sizes): resolved
  `current_row_asis.lyt`/`current_row_repaired.lyt` via the new fallback
  directory, no errors.
- `bench_solve.bench_real_encodings(n=1)`: `current-row-asis@1920x1080`
  → `{'OPTIMAL': 1}`, confirming `resolve_encoding_file` wired correctly
  into the benchmark harness.
- `coverage_matrix.py`: ran clean end to end (doesn't reference
  `current_row_*` directly, exercises the shared registration machinery).

(A `coverage_matrix_result.json` byproduct of that smoke run was deleted
before committing — not part of this dispatch's deliverable.)

## Scope discipline

No encoding rewrites (both `.lyt` files' bodies are untouched — `git
diff` on the renamed files shows a pure rename, 100% similarity), no
loader/parser edits beyond `runner.py`'s already-precedented
`resolve_encoding_file` resolver extension, no refusal-flip (that is
dispatch C4, untouched here). The `frontend/` edits were all dangling
reference fixes mandated by this dispatch's own "exhaustive integrity"
instruction (tests, emit scripts, `coverage_matrix.py`, and their
consumers were named explicitly in scope) — no other frontend file was
touched, no frontend behavior changed beyond the two `.gen.ts` header
comments (solved geometry byte-identical, confirmed by diff).

## Commit

`61a01c2e` on `worktree-agent-adf1475133bac23b3` — 17 files changed (2
renames, 15 content edits), 88 insertions / 46 deletions.
