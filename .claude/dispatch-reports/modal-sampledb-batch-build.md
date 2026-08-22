# Modal-escape + sample-db-fixture batch build

Ledger rows 2600 (`learnpath-modal-escape`) / 2601
(`sample-db-nondefault-fixture`). Base: worktree HEAD reset to the
`next` tip `0c21780d10ee135651a6c7b7108de9d154cd4611` per the row-2599
mechanized base check (the worktree had been cut from a stale main
commit, `dc8e3b12`). No uncommitted work was present at reset time
(only an untracked `.claude/logs/invocations.jsonl`). Re-verified
`origin/next` after the work was done: `origin/next` is at `90b67af3`,
which is an **ancestor** of `0c21780d` (local `next` sits 15 commits
ahead of `origin/next`) — nothing moved past the base during this
session, so no rebase/regate was needed before closing.

## Item 1 — learnpath-modal-escape

Read `frontend/CLAUDE.md`, `frontend/tests/CLAUDE.md`, and the umbrella
`CLAUDE.md` end to end before touching anything (backend `CLAUDE.md`
also read end to end per the dispatch's instruction for item 2).

**Finding on inspection: the code fix was already shipped.**
`frontend/src/components/modals/LearnPathModal.vue` already carries
`role="dialog"`, `aria-modal="true"`, and a
`useModalKeyboard(modalContentRef, isOpen, close)` wire-up — commit
`bb94c901` ("feat(frontend): space-owner cure L5 — CornerStack + the
overlay primitive") closed the W5/D1 parity gap before this dispatch
was cut, and the modal's own file header documents the fix explicitly
("this modal was the review's own named gap ... Wired to
`useModalKeyboard`"). So the audit finding named in the brief was
already fixed in source; the fences named only this one component
plus its tests, so no source edit was made.

**What was genuinely missing: a dedicated test.** No sibling modal
under `src/components/modals/` carries a modal-specific Escape/role
test of its own — parity verification for the shared
`useModalKeyboard` composable lives at one level up, driven against
`ResetAllKeybindingsModal` as the "simplest instance"
(`tests/integration/useModalKeyboard.test.ts`). `LearnPathModal` had a
dedicated test file for its backdrop-guard behaviour
(`LearnPathModal-backdrop-guard.test.ts`) but nothing exercising
Escape or the `role="dialog"` markup for this modal specifically.

Added `frontend/tests/integration/LearnPathModal-keyboard.test.ts`,
mirroring both existing idioms:

- The `role="dialog"` / `aria-modal="true"` markup check (new — no
  sibling modal test asserts this directly; mirrored from the
  `[role="dialog"]` query idiom used in `useAppDialogs.test.ts` /
  `workspace-recovery-gate.test.ts`).
- Escape-to-close + focus-restoration-to-opener, in the same shape as
  `useModalKeyboard.test.ts`'s Escape test against
  `ResetAllKeybindingsModal` (dispatch `Escape` on `window`, assert the
  backdrop disappears, assert `document.activeElement` is the opener).
- Escape absorbed mid-`explore()` (this modal's own `close()` no-ops
  while `phase === 'exploring'`), mirroring
  `LearnPathModal-backdrop-guard.test.ts`'s backdrop-click case — since
  Escape and the backdrop click both route through the same `close()`,
  this is the modal-specific behaviour a generic composable test
  can't see.

Witness (targeted vitest, foreground):

```
$ npx vitest run tests/integration/LearnPathModal-keyboard.test.ts \
    tests/integration/LearnPathModal-backdrop-guard.test.ts \
    tests/integration/useModalKeyboard.test.ts \
    tests/unit/composables/useModalKeyboard.test.ts

 Test Files  4 passed (4)
      Tests  13 passed (13)
```

`vue-tsc -b` ran clean (no output, exit clean). No frontend production
source changed (only a new test file), so `npm run build`'s `vite
build` step was not run — the brief's "item 1 touches a component"
premise didn't hold once the actual diff turned out to be test-only;
noting the narrowing explicitly per the disclosed-narrowing
discipline.

Fences respected: only `LearnPathModal-keyboard.test.ts` added; no
other file under `frontend/` touched for this item.

**Status: shipped** (test-only delivery; the component fix predates
this session).

## Item 2 — sample-db-nondefault-fixture

`backend/samples/cards.sample.db`'s single `documents` row
(`key='user_workspace_01', user_id=1`) carried the automated capturing
session's own live settings baked into the JSON blob: appearance theme
`"dark"` and `engine.katago.url` `"ws://127.0.0.1:41949"` — an
ephemeral local port from that session, dead on any other machine.

Confirmed the correct fresh-install defaults by reading
`frontend/src/store/defaults.ts` (`defaultSettings.appearance.theme =
'cluster'`, `defaultSettings.engine.katago.url =
'ws://127.0.0.1:1242'`) and `frontend/src/store/schema.ts` (theme type
is `'dark' | 'cluster'` — `'light'` was retired by an earlier
migration; `'cluster'` is the actual "light-ish" default, not
`'light'`). The `engine.katago.url` field is a required `string` in
the schema (not optional), so the fix sets it to the genuine default
value rather than omitting the key.

**Exact SQL applied** (via `sqlite3 backend/samples/cards.sample.db`):

```sql
UPDATE documents
SET data = json_set(
  data,
  '$.profile.settings.appearance.theme', 'cluster',
  '$.profile.settings.engine.katago.url', 'ws://127.0.0.1:1242'
)
WHERE key = 'user_workspace_01';
```

Before: `theme = "dark"`, `url = "ws://127.0.0.1:41949"`.
After: `theme = "cluster"`, `url = "ws://127.0.0.1:1242"`.
`json_valid(data)` = 1 after the update; the blob shrank from 39809 to
36164 bytes of embedded JSON (the two literal replacements are
shorter — no data loss, verified by loading and rendering the full
document below).

**Verification — live backend read-check**, per the brief:

1. Copied `backend/samples/cards.sample.db` to a scratch directory as
   `cards.db` (never touching the checked-out `cards.db` the real
   backend would use).
2. Started the backend against that scratch file only
   (`DATABASE_URI=sqlite+aiosqlite:////<scratch>/cards.db`, using the
   Python venv at `/home/bork/w/omega/backend/venv` — read-only use of
   an existing environment, no packages installed). Alembic bootstrap
   ran clean, landing the legacy chain through to head.
3. Minted a token for `local_user` (passwordless: `POST /auth/token`
   with any password value, since `ALLOW_PASSWORDLESS_LOGIN` defaults
   true and `local_user` has no `bcrypt_hash`).
4. `curl -H "Authorization: Bearer $TOKEN"
   http://127.0.0.1:18234/documents/user_workspace_01` and parsed the
   response:

   ```
   theme: cluster
   engine url: ws://127.0.0.1:1242
   ```

   — confirming the served JSON reflects the patched values end to
   end (SQLite blob → SQLAlchemy read → FastAPI response), not just
   the raw file.
5. Killed the scratch server; confirmed the port stopped answering.

**Backend targeted test**: grepped `backend/tests` for a sample-db
test — `tests/integration/test_alembic_bootstrap.py::
test_bootstrap_on_shipped_sample_db_reaches_head` is the only one, and
it exercises the *schema*-migration path against the sample (copies
it into a fresh temp DB and walks the legacy Alembic chain to head).
It is agnostic to the `documents.data` JSON payload's content, so the
appearance/engine edit doesn't touch what it asserts — ran it anyway
as the closest available regression gate:

```
$ pytest tests/integration/test_alembic_bootstrap.py -k sample_db -v
tests/integration/test_alembic_bootstrap.py::test_bootstrap_on_shipped_sample_db_reaches_head PASSED
1 passed, 4 deselected
```

No frontend gates apply to this item (binary fixture only); no
frontend source or tests touched for item 2.

**Open hypothesis, VERIFICATION ONLY (not fixed as part of this
item)** — does first-run map the browser's `prefers-color-scheme`
into the persisted theme setting, explaining how `"dark"` got
captured? Searched the frontend source tree end to end for
`prefers-color-scheme` and `matchMedia`:

```
$ grep -rn "prefers-color-scheme\|matchMedia" frontend/src
(no matches)
```

**The hypothesis does not hold** — there is no code path anywhere in
the frontend that reads `prefers-color-scheme` or calls
`window.matchMedia`. First-run theme is simply the hardcoded default
in `frontend/src/store/defaults.ts` (`'cluster'`). The `"dark"` value
baked into the shipped sample is not automation reflecting the
capturing machine's OS/browser preference — it's just the maintainer's
own manually-chosen theme setting on their personal workspace at
capture time, carried through verbatim by `make_sample_db.py` (whose
own docs, `backend/samples/README.md`, name only `game_source
.description` pathname-PII scrubbing as its anonymization scope — the
`documents` table's settings payload was never in scope for
scrubbing). This is worth a maintainer decision on whether
`make_sample_db.py` should also reset `appearance`/`engine` settings
to defaults on every future capture, so the same drift doesn't
recur the next time the sample is regenerated from a live personal
database — flagged here, not actioned, since it's outside this item's
fenced scope (the fixture file only, not the capture script).

Fences respected: only `backend/samples/cards.sample.db` (binary)
touched for this item; no source files.

**Status: shipped.**

## Ledger

Both items claimed at session start (`./autoharn led work claim
learnpath-modal-escape` → row 2600; `./autoharn led work claim
sample-db-nondefault-fixture` → row 2601). Closed shipped with witness
(this report) + `--review-deferred`: `learnpath-modal-escape` → row
2608, `sample-db-nondefault-fixture` → row 2609.
