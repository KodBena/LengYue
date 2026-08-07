# s14-s16-dialogs — fresh-context review (verdict summary, reconstructed)

NOTE ON PROVENANCE: the reviewer wrote its full durable report inside its own
worktree; a permission-classifier denial blocked the orchestrator's file copy
into the main tree, and the worktree was subsequently deleted per the
worktree-hygiene durable (ledger row 798). This file is the orchestrator's
faithful transcription of the reviewer's FINAL VERDICT REPLY (delivered
2026-08-08); the per-command transcripts did not survive. Trust class:
attributable reviewer summary, not the full witnessed transcript.

## Verdict: ACCEPT-WITH-NITS

Basis: S14 and S16 both substantively delivered and match the commission. All
17 native prompt()/confirm()/alert() sites gone (reviewer's own grep),
replaced by promise-based useAppDialogs.ts + two generic components reusing
useModalKeyboard, house CSS honored (transparent backdrop, --surface-0),
cancel-path semantics preserved at every converted call site. Gates green
under reviewer's own hands; mutation-falsification confirmed the new tests
are load-bearing; clean merge onto then-current next (f727f0b3).

## Findings (as reported)
1. 17 native call sites removed, matches audit count, zero remain (WITNESSED, grep before/after).
2. vue-tsc --noEmit exit 0 (WITNESSED).
3. Full vitest run 1787 passed / 4 skipped, exit 0 (WITNESSED).
4. Mutation-falsification of settleConfirm broke 2/9 useAppDialogs tests — load-bearing (WITNESSED).
5. 951742fc merges cleanly onto next @ f727f0b3; one auto-merged FILES.md hunk (WITNESSED).
6. 8 call sites traced (3 destructive) — guard logic and control flow preserved; destructive confirms carry danger: true (WITNESSED).
7. S16 tombstone + locale key fully removed; S3 % badge diff-confirmed untouched (WITNESSED).
8. FINDING (nit, review's own discovery) — C20: AppPromptDialog input had no programmatic label. REPAIRED post-review in e530bc86 (label :for wired to message→title→default-label chain + 2 pinning tests); repair gates exit 0.
9. FINDING (nit, builder-disclosed) — MintCardModal alert conversion adds remediation body, switches to non-awaited void dialogs.alert(); accepted as disclosed improvement (orchestrator ruling, ledger row 800 thread).
10. UNEXERCISED — no mechanized "zero native dialog calls" gate exists; gap disclosed by builder, still open.

Merged as part of merge commit on next following the C20 repair; see ledger
rows 800 (review verdict) and the s14-native-prompts / s16-tombstone close
witnesses.
