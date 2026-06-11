# Worklog — Delete dead .tab-padding-sr CSS from App.vue (2026-06-11)

> Audit trail for work-status item `app-vue-orphan-sr-css`.
> Branch `bork/refactor/app-vue-orphan-sr-css`.

## Item description summary

Deferral harvested 2026-06-10 from the cards-tab-merge PR2 worklog, which
deferred sweeping the dead SR-tab CSS as a small follow-up PR. Audit
appendix (worklog-2026-05 miner, finding 4) flagged `.tab-padding-sr`
as dangling. Verified at HEAD 2026-06-10: `.tab-padding-sr` defined at
`frontend/src/App.vue:624` (pre-header-add line count) with zero consumers
under `frontend/src`. The item's caution: App.vue's unscoped style block
acts as a global stylesheet for several components — verify each candidate
selector's consumer set before deleting.

## Verification of zero consumers (the item's binding caution)

App.vue's unscoped style block is a global stylesheet. `.tab-padding-sr`
was the only candidate in scope for this item; the following commands were
run before any deletion.

**Commands and results:**

```
$ grep -rn "tab-padding-sr" frontend/src/
frontend/src/App.vue:634:.tab-padding-sr { padding: var(--space-medium) var(--space-default); text-align: center; }
```

Definition only — no template usage, no dynamic class binding.

```
$ grep -rn "tab-padding-sr" frontend/src/ --include="*.vue" --include="*.ts"
frontend/src/App.vue:634:.tab-padding-sr { ... }
```

Same result with explicit extension filter.

```
$ grep -rn "tab-padding-sr\|tab_padding_sr\|tabPaddingSr" frontend/
frontend/src/App.vue:634:.tab-padding-sr { ... }
```

Camel-case and underscore variants also checked — zero non-definition
hits. Consumer count confirmed: **zero**. Deletion is safe.

**Context check — sibling `.tab-padding` (NOT deleted):**

```
$ grep -rn "tab-padding" frontend/src/
App.vue:517:              <div class="tab-padding">
App.vue:633:.tab-padding { padding: var(--space-default); }
components/KeybindingsView.vue:68:  <div class="keybindings-view tab-padding">
components/SettingsTab.vue:91:      <div class="tab-padding">
components/SettingsTab.vue:136:      <div class="tab-padding">
components/editors/AnalysisControls.vue:172:  <div class="tab-padding">
...
```

`.tab-padding` has live consumers in six locations across four files —
retained as required.

## Changes

1. `frontend/src/App.vue` — deleted line 634 (`.tab-padding-sr` rule).
2. `frontend/src/App.vue` — retrofitted ADR-0006 JSDoc header at the top
   of the `<script setup>` block (touched under full visibility; no header
   was present; incremental retrofit per ADR-0004/ADR-0006 composition).

## Not taken

- **Restructuring the App.vue unscoped style block** (separating truly
  global rules from component-specific overrides, etc.) — this is
  `app-vue-style-and-wiring-extraction` (item id: not-filed: separate item
  named in the item description from which this work was harvested; no
  tracked id visible in the work-status store at the time of this session).

## Documentation checklist

- `frontend/FILES.md`: no files added, removed, or moved — no update.
- `frontend/IDENTIFIERS.md`: no identifier changes — no update.
- `FEATURES.md`: pure internal dead-CSS removal; no user-facing capability
  change — no update.
- `docs/handoff-current.md`: no orientation surface affected — no update.
- ADR "Revisit when…": no trigger satisfied.
- Doc-graph: no document added, removed, renamed, or re-cross-referenced —
  this worklog is a new node. Regeneration required.

## Verification

- `npm install` — clean (audit advisory pre-existing, unrelated).
- `npm run build` (vue-tsc -b + vite) — passes.
- `npx eslint .` — exit 0.
- `npm run test:run` — 888 passed / 4 skipped (56 files passed, 3 skipped).

## Deviations

None. The item's caution was followed: each referenced selector verified
before deletion. Todo DB touched read-only. No perf claims (ADR-0009).
`backend/qeubo/` not read.

License: Public Domain (The Unlicense).
