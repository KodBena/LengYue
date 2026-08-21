# Use-mode hooks wired to this project

## PROVENANCE

- **Created:** 2026-08-06T10:15:23Z (UTC), by:
  ```
  /home/bork/w/vdc/1/autoharn/bootstrap/new-project.sh /home/bork/w/omega --db toy --host 192.168.122.1 --schema omegago1 --kern omegago1_kernel --role omegago1_rw --name omegago1 --force --boundary-url http://127.0.0.1:8421 --boundary-deployment omegago1 --governed *.py
  ```
  Written by `bootstrap/new-project.sh` itself, from its own real argv, at scaffold time — no
  future world should have to be reconstructed from script source the way an earlier one did
  (autoharn BACKLOG, "how was run3 created? that of course needs to be documented", 2026-07-09).
- **Autoharn instrument version:** `cc36c5845d543137c98f09980b18b349f88006a0 (DIRTY -- uncommitted changes were present in the autoharn checkout at scaffold time; this world's evidence cannot be reproduced from this commit hash alone)` — the commit hash of the autoharn
  checkout (`/home/bork/w/vdc/1/autoharn`) this scaffold ran from, read once at scaffold time and never
  re-derived. This ties this world's evidence to the exact hook/kernel/template bytes that
  produced it: two worlds scaffolded from different autoharn commits ran under genuinely
  different instruments, even if every other PROVENANCE field above looks identical. A
  `(DIRTY -- ...)` suffix or `UNAVAILABLE -- ...` reason, if present, is not a defect in this
  world — it is an honest fact about the checkout that produced it, stated plainly rather than
  silently omitted (this project's standing fail-loud discipline, ADR-0002).
- **World:** ledger schema `omegago1`, kernel schema `omegago1_kernel`, role `omegago1_rw` (db `toy` @
  host `192.168.122.1`).
- **Kernel lineage applied by this scaffold run:** NOT applied by this scaffold run -- apply a kernel lineage to omegago1/omegago1_kernel/omegago1_rw manually (kernel/lineage/, see kernel/lineage/README.md) before first use
- **s21 (session-aware distinctness) status:** NOT applied by this scaffold run (classic --schema/--kern/--role mode applies no kernel lineage at all -- see item 1 above). If this world's kernel predates s21, apply it as a separate, explicit operator act from autoharn's own checkout: `bootstrap/apply-delta.sh <this-project's-directory> kernel/lineage/s21-session-aware-distinctness.sql` (prints the resolved command, requires a typed schema confirmation, never applies bare) -- status/witness live in autoharn's BACKLOG.md (search "s21"). A future delta beyond this world's
  birth chain (above) is NOT applied here (maintainer ruling 2026-07-11, "runs are strictly
  linear": this world is the only present-tense one; older/current worlds are never patched or
  refreshed in place — `bootstrap/apply-delta.sh` is demoted to history, no operator scenario
  applies it to an existing world). A delta reaches reality by entering the birth chain, carried
  automatically into the NEXT world's `--new-world` scaffold — see autoharn's user-guide/ORCH-OPERATING-CARD.md
  "Kernel deltas" decision tree for the current, authoritative shape.
- **`reviewer` principal status:** NOT registered by this scaffold run (classic --schema/--kern/--role mode applies no kernel lineage at all -- see item 1 above, so there is no `principal` table yet to register into). Once a kernel lineage is applied, register one explicitly: `./autoharn led register-principal reviewer subagent`. See this world's root `CLAUDE.md` (if
  present) for the governance preamble that assumes this principal already exists — it is
  auto-loaded by Claude Code at session start, so there is nothing to paste.
- **`commissioner` principal status:** NOT registered by this scaffold run (classic --schema/--kern/--role mode applies no kernel lineage at all -- see item 1 above). Once a kernel lineage carrying kernel/lineage/s25-commission-kind.sql is applied, register one explicitly: `./autoharn led register-principal commissioner human`. Two signing modes exist for the
  commission that opened this world (kernel/lineage/s25-commission-kind.sql): FULL mode is the
  maintainer typing the copy-paste line above himself, in his own terminal; LAZY mode is the
  implementer's first ledger act on receiving the ask, transcribing it vicariously (marked as
  such in the statement text — see this world's root `CLAUDE.md`). The two are mechanically
  distinguishable by reading the row's actor (which principal signed it) together with its
  stamp state (whether a live Claude session invocation stamped it), never by prose claims
  alone.
- **Orienting in this world:** run `./autoharn pickup` (below) any time you need a live resume brief —
  in-force decisions, open questions, review debt, recent changes — derived fresh, never stale.

## LAW (portable ADR subset, vendored via this scaffold)

Written by `bootstrap/new-project.sh` (tracker item `portable-adr-delivery`, maintainer instruction 2026-07-15). The subset below is the CURRENTLY-SERVED, cross-project-portable slice of autoharn's ADR corpus -- `design/MAINT-ADR-PORTABILITY-SPEC.md`'s own per-ADR treatment table: every entry here already carries a `generalize-in-place`/`examples-extract`/`already-portable`/`ui-scoped-generalize-or-unserve` treatment, i.e. it is written to be read and applied outside autoharn itself (ADR-0001 is excluded -- its own Status retired it to a history tombstone; it carries no live rule content to extrapolate from). This deployment is **UNPINNED** (live-exec against the checkout at `/home/bork/w/vdc/1/autoharn`, no `.autoharn` submodule) -- the pointers below resolve into that checkout and MOVE whenever it changes; there is no frozen copy here. (Deliberate for a deployment that autoharn itself vendors -- e.g. a panel/demo project -- where pinning autoharn in as a submodule would create a submodule cycle.)

**Reading posture:** read each ADR IN FULL before any work requiring it -- diagnosing, designing, or touching code shaped by its rule -- and read it for its SPIRIT: these are principles to extrapolate from and interpret judiciously, not rules to satisfy by letter alone. Where letter and spirit appear to diverge, the spirit governs, and the divergence is surfaced, not silently resolved.

- **ADR-0000: The Alpha and the Omega — Type-Driven Design as the Foundational Law** -- `docs/adr/0000-the-alpha-and-the-omega-type-driven-design.md`
- **ADR-0002: Fail Loudly** -- `docs/adr/0002-fail-loudly.md`
- **ADR-0003: Domain-Coupling Bands** -- `docs/adr/0003-domain-coupling-bands.md`
- **ADR-0004: Minimal-Touch Edits to Partially-Visible Files** -- `docs/adr/0004-minimal-touch-edits-to-partially-visible-files.md`
- **ADR-0005: Documentation Discipline** -- `docs/adr/0005-documentation-discipline.md`
- **ADR-0006: Source-File Headers** -- `docs/adr/0006-source-file-headers.md`
- **ADR-0007: File Size and Information Density** -- `docs/adr/0007-file-size-and-information-density.md`
- **ADR-0008: Classification Discipline** -- `docs/adr/0008-classification-discipline.md`
- **ADR-0009: Performance Investigation Discipline** -- `docs/adr/0009-performance-investigation-discipline.md`
- **ADR-0010: Render Locality and Canvas for Data-Dense Visuals** -- `docs/adr/0010-render-locality-and-canvas.md`
- **ADR-0011: Mechanization Discipline** -- `docs/adr/0011-mechanization-discipline.md`
- **ADR-0012: Compositional and Structural Hygiene** -- `docs/adr/0012-compositional-and-structural-hygiene.md` (vendored locally 2026-08-10 with LengYue P9 examples appended — ledger row 1484; all other ADRs remain live-exec)
- **ADR-0013: Execution Integrity — Against the Attrition of Will** -- `docs/adr/0013-execution-integrity.md`
- **ADR-0014: Request a Second Opinion When a Problem Resists Resolution** -- `docs/adr/0014-executor-second-opinion.md`
- **ADR-0015: Verification-Substrate Discipline — a result is only as good as the environment that produced it** -- `docs/adr/0015-verification-substrate-discipline.md`
- **ADR-0016: The Service Contract Is an Enforcement Surface — a standing service's promise to a client is gated, not aspired to** -- `docs/adr/0016-the-service-contract-is-an-enforcement-surface.md`
- **ADR-0017: The Zero-Context Reader — Documentation Legibility Discipline** -- `docs/adr/0017-the-zero-context-reader.md`
- **ADR-0018 — Consults are not front-loaded** -- `docs/adr/0018-consults-are-not-front-loaded.md`
- **UI Failure Proscriptions — Consolidated (blind + sighted consults merged)** -- `docs/adr/0019-appendix-ui-proscriptions.md`
- **ADR-0019 — Genre convention is the default spec (UIs are not a novelty surface)** -- `docs/adr/0019-genre-convention-is-the-default-spec.md`
- **ADR-0020 — The meaning-preservation witness (no-content-lost never discharges no-meaning-changed)** -- `docs/adr/0020-meaning-preservation-witness.md`
- **ADR-0021: Witness-Construction Discipline — the witness observes the property, not a symptom** -- `docs/adr/0021-witness-construction-discipline.md`

## Skills

`.claude/skills/` was seeded at scaffold time with every skill under autoharn's
`bootstrap/templates/claude-skills/` (tracker item `skill-vendoring-hack-rationalization`),
copied in **verbatim** — the skill body is not this scaffold's to rewrite; see each vendored
skill's own `PROVENANCE.md` for its source and vendor date.

**Precedence fact (read this before assuming a vendored skill is "the" copy in force):**
Claude Code resolves same-named skills **enterprise > personal > project**. This
deployment's copy is project-level, so it is silently **shadowed** whenever a personal
(`~/.claude/skills/`) or enterprise copy of the same name exists on the machine actually
running the session — including, concretely, the maintainer's own personal
`hack-rationalization-detector`, the very skill this one was vendored from. Duplication is
therefore **idempotent by platform rule**, not a drift hazard: whichever copy is effective is
determined by that fixed precedence order every time, never a race. No mechanism here detects
or warns about the two copies drifting apart in *content* over time (only which one wins is
fixed, not whether they still agree) — the vendored copy's own `PROVENANCE.md` records its
source date for exactly that reason: so a reader can judge staleness by eye.

**Doc-witness convention (this file is a scaffold-generated TEMPLATE):** every example below is
marked **UNWITNESSED** — it has not been run against this instance's own ledger. A template
cannot honestly claim another project's witnessed output as its own (ADR-0005's documentation
discipline: a claim without its own artifact is not a claim). As you actually run each command
against THIS project, replace its UNWITNESSED marker with the real output (or a fresh
UNWITNESSED-until-run note if it still hasn't happened) — the instance witnesses its own
examples; the template only shows their shape.

This instance's stamped deployment (from `deployment.json`, `bootstrap/new-project.sh`
scaffold-time values): db `toy`, host `192.168.122.1`, ledger schema `omegago1`, kernel schema
`omegago1_kernel`, role `omegago1_rw`.

Two PreToolUse hooks in `.claude/settings.json`, both living in autoharn (`/home/bork/w/vdc/1/autoharn/hooks/`),
pointed at this project's ledger:

1. **Change gate** (`pretooluse_change_gate.py`) — an edit to a governed file is allowed only
   under an unconsumed ledger entry naming that file, and the authorization is **windowed, not
   standing** (`WINDOW_S = 600` s, closed early by a test-run/commit boundary command). Which
   files are governed is chosen in `governed_files.json` (see `GOVERNED_FILES.md`); default
   `*.py`. Deny/allow/deny-hint text is per-project via `apparatus.json` (see `APPARATUS.md`) —
   **UNWITNESSED-until-run caveat**: `apparatus.json`'s `deny_hint` is baked into
   `.claude/settings.json` at scaffold time, not read live; see `APPARATUS.md`'s honest-limit
   note. On a deny, the message tells the agent exactly what to do:
   `./autoharn led -f <file> decision "<why>"`, then re-issue the same edit. State and journal live under
   `.claude/` (gitignored).

   **Known host-connection limitation (BACKLOG, autoharn, 2026-07-09):** the change gate's
   `PGHOST` is a hardcoded module constant in `hooks/pretooluse_change_gate.py`, not
   env-overridable — if this instance's postgres host (`192.168.122.1`) differs from that hardcoded
   default, the gate will connect to the WRONG host. Check `hooks/pretooluse_change_gate.py`'s
   `PGHOST` literal against this instance's `192.168.122.1` before trusting the gate's refusals; the
   fix is filed, not yet landed (hooks are out of scaffold scope this session).

2. **Stamp interceptor** (`stamp_intercept.py`) — every `psql` call against db `toy` is
   rewritten to carry an HMAC write-stamp (session id, agent id, ts) into the connection as
   `app.vendor_*` GUCs; the kernel's `set_stamp` trigger validates it server-side. This is
   what makes review-independence checks real: a self-review carries the same agent id as
   its authoring, visibly.

**One manual step remains: provision the stamp secret. UNWITNESSED — the block below has not been run in this instance.** The hook reads the apparatus secret from
`.claude/secrets/stamp_secret.hex` (chmod 600, gitignored). The kernel DDL creates
`stamp_secret` EMPTY on purpose — seed it once, and do NOT re-run later (re-seeding rotates the
secret and invalidates stamps on rows written under the old one):

```sh
cd /home/bork/w/omega

# 1. seed ONE fresh secret. Do NOT re-run later.
HEX=$(openssl rand -hex 32)
psql -h 192.168.122.1 -d toy -q -v ON_ERROR_STOP=1 \
  -c "TRUNCATE omegago1_kernel.stamp_secret;" \
  -c "INSERT INTO omegago1_kernel.stamp_secret (secret) VALUES (decode('$HEX','hex'));"

# 2. negative control — the granted role must NOT be able to read it:
psql -h 192.168.122.1 -d toy -c "SET ROLE omegago1_rw; SELECT secret FROM omegago1_kernel.stamp_secret;"
# expect: ERROR: permission denied for table stamp_secret

# 3. export for the hook (CHECK the row count is 1, then confirm the file is 64 bytes afterward):
psql -h 192.168.122.1 -d toy -tAc \
  "SELECT encode(secret,'hex') FROM omegago1_kernel.stamp_secret" \
  > .claude/secrets/stamp_secret.hex
wc -c .claude/secrets/stamp_secret.hex   # expect 65 (64 hex chars + trailing newline); 0 is the silent-failure tell
chmod 600 .claude/secrets/stamp_secret.hex
```

Until then the interceptor passes psql calls through unstamped — writes still land, with
`stamp_verified = false`. A *wrong* stamp is refused outright by the trigger, so a
mis-provisioned secret fails loudly on the first ledger write, not silently.

## Error-recurrence hook (observe-only, self-triggering cross-check)

`hooks/posttooluse_error_recurrence.py` — the self-triggering half of the error-capture
discipline (`design/FABLE-ERROR-RECURRENCE-HOOK-SPEC.md`, ledger row 1697; the MANUAL half —
writing a `defect:` ledger row and cross-checking it by hand before fixing anything new — is
autoharn's `user-guide/USER-RECIPES-FAQ.md` "Capturing errors so they cannot quietly recur"
section, ADR-0000/ADR-0011). **DETECTIVE CONTROL ONLY**: it never blocks, never writes a ledger
row, never polices — it can only surface a prior that is already on record.

**What it does.** On a `PostToolUse(Bash)` result whose stdout/stderr text matches one of a
small, ENUMERATED error signature, it read-only-queries `/home/bork/w/omega`'s own ledger for
`defect:` rows (`defect: <CLASS-SLUG> | <SPECIMEN> | <FORECLOSING-FIX> | <REFS>`, a
`decision`-kind row) whose CLASS-SLUG or SPECIMEN text looks like this error, and if any do,
prints their id/slug/foreclosing-fix plus one ADR-0011 teach-line as a non-blocking
`additionalContext` note. No hit is silent.

**The three enumerated error signatures** (never a general regex zoo — see the hook's own module
docstring for the exact patterns and their provenance):
  1. a `SQLSTATE` kernel-refusal line (the shape `serving/boundary_cli_client.py`'s own kernel
     write-refusal teach-text already carries);
  2. a `REFUSED` line (the house-wide refusal-teach-text convention essentially every governed
     verb and gate in autoharn prints on its own failure path);
  3. a gate `VIOLATIONS (n)` line (the gate failure-count convention several `gates/*.py` files
     share, e.g. `LAZY-IMPORT VIOLATIONS (3):`).

**Fail-open, always**: an unreachable ledger (both the boundary and legacy read legs failing)
prints exactly one stderr line saying the cross-check did not run, then exits 0 — never a hang,
never a block. Malformed `defect:` rows are skipped individually, never crash the check.

**Apparatus switch**: `mechanisms.error_recurrence.mode`, `"off"` (default when the key or file
is absent) / `"observe"` / `"enforce"` (NAMED-IMPOSSIBLE — this mechanism is detective-only by
its own spec; degrades to `"observe"` with a warning). This project's own shipped
`apparatus.json` template (which THIS deployment's `.claude/apparatus.json` was copied from at
scaffold time) carries `"error_recurrence": {"mode": "observe"}` — see `APPARATUS.md`'s own
switchboard table for the full detail.

**NOT wired into `.claude/settings.json` by this scaffold** (named honestly, not silently
assumed): unlike every other hook this document describes, `posttooluse_error_recurrence.py` has
no dispatch entry generated above — this build shipped only the hook file, its apparatus default,
and this documentation (`design/FABLE-ERROR-RECURRENCE-HOOK-SPEC.md`'s own "Build conditions"),
deliberately leaving the actual `PostToolUse` wiring as an operator's own act. To arm it in THIS
deployment, add the following entry to `.claude/settings.json`'s `hooks.PostToolUse` array
(mirrors `posttooluse_bash_completion.py`'s own dispatch line shape exactly) — **UNWITNESSED
against this deployment's own live session; the hook itself was witnessed only by direct
invocation with synthesized payloads, on scratch worlds, never by wiring it in here**:

```json
{
  "matcher": "Bash",
  "hooks": [
    {
      "type": "command",
      "command": "env LEDGER_HOST=192.168.122.1 LEDGER_DB=toy GATE_LEDGER=omegago1.ledger GATE_SUBJECT_ROOT=/home/bork/w/omega python3 /home/bork/w/vdc/1/autoharn/hooks/posttooluse_error_recurrence.py",
      "timeout": 10
    }
  ]
}
```

## `led` — one-liner ledger entries

```sh
./autoharn led decision "..."
./autoharn led -f palette.py decision "palette.py: ..."   # authorizes editing palette.py
./autoharn led --recent [N]           # last N rows (default 10)
./autoharn led current [N]            # last N rows of ledger_current (supersedes filtered)
./autoharn led register-principal reviewer subagent   # already done for you in --new-world mode --
                                              # see the "reviewer principal status" bullet above;
                                              # this form registers any FURTHER principal you need
./autoharn led review 12 attest technical "independent read: ... checks out"
```

**UNWITNESSED** — run these against this project's own ledger and replace this line with the
observed output (id, kind, statement, actor) before trusting this doc's claims about `led`.

`-f` puts `files: ...` into the entry's rationale — the declaration form the change gate
matches on. Overridable connection via `LED_PGHOST/LED_PGDB/LED_SCHEMA/LED_KERNEL/LED_ROLE`.

### `led question-status` / `led review-gap` / `led stamp-distinctness`

Read-only views, connecting as the operator identity (not `SET ROLE omegago1_rw`) — display
conveniences for an operator, not evidence of what the granted subject role can read.

**UNWITNESSED.** Note the toy-pilot's own finding (autoharn BACKLOG, 2026-07-09): the
`countersign_obligation` table may have no grant for the subject role in the applied kernel
lineage pre-s20 (`led obligate` / `led review-gap` would then refuse with `permission denied`
under `SET ROLE omegago1_rw` — `led`'s own `review-gap` verb does not `SET ROLE`, so it typically
still returns a result; `pickup`'s review-debt section deliberately DOES `SET ROLE` and reports
this honestly as `BLOCKED: pre-s20 grants` if it fires here too).

### `led review` — countersigning an earlier row

`led review` countersigns an earlier row; a countersign claiming
`independence=technical|managerial|financial` requires a VERIFIED interception stamp from a
DIFFERENT invocation than the row it regards — otherwise the trigger refuses and teaches
`self-review`. **UNWITNESSED** in this instance.

## `judge` — the engine differential verdict

`./autoharn judge` is `led`'s sibling, wiring this project's ledger to autoharn's deductive engine. It
invokes autoharn's `engine/ledger_differential.py omegago1 --retain` (via
`LEDGER_DEPLOYMENT=/home/bork/w/omega/deployment.json`, autoharn `engine/targets.py`'s THIRD
resolution source — vestigial_documentation/design/ORCH-OPUS-READINESS.md move 1) and prints the closed verdict vocabulary
(`AGREE` / `DIVERGE_BY_DESIGN` / `DIVERGE_DEFECT` / `QUARANTINED`), exiting non-zero on
`DIVERGE_DEFECT`/`QUARANTINED`. **Observer-first**: not wired into either project's gates.

```sh
./autoharn judge                  # ordinary run: retain DerivationRecords, print the verdict
./autoharn judge --drop-record    # negative control: drop the ASP witness, watch the consumer refuse
```

**UNWITNESSED** — run `./autoharn judge` against this project's own live ledger and replace this line
with the observed verdict line before trusting this doc's claim about `judge`.

## `pickup` — the resume verb

`./autoharn pickup` derives a resume brief from live sources every time it runs (never stored — a stored
handoff decays from the moment of writing): in-force decisions, open questions, review debt,
recent changes, this repo's git state, and an explicit "in-flight: UNAVAILABLE" line (no
work-item layer yet — v2 territory). See `pickup --help`.

**UNWITNESSED** — run `./autoharn pickup` against this project's own live ledger and replace this line
with its actual section-by-section output before trusting this doc's claim about `pickup`.
