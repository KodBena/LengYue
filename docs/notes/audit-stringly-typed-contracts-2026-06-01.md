# Exhaustiveness audit — stringly-typed-then-reparsed contracts (frontend)

- **Date:** 2026-06-01
- **Scope:** all of `frontend/src` (203 `.ts` / `.vue` source files).
- **Mandate:** the deferred-items entry *"Stringly-encoded API errors
  reverse-engineered downstream (brittleness-hazard audit + RCA)"*
  (`docs/notes/deferred-items.md`). PR #318 fixed the six **known**
  API-error reparse sites by introducing `class ApiError extends Error
  { status, body }`; this audit establishes whether that set is
  **complete** — i.e. whether any stringly-typed-then-reparsed contract
  survives beyond those six, API-error or otherwise.
- **Governing tenet:** ADR-0002 (fail loudly). The anti-pattern reaches
  the silent-failure class *through* the error-handling path: a throw
  site bakes a machine-meaningful discriminant into an error *string*; a
  consumer reverse-engineers it back out by regex / substring; a format
  drift then silently degrades a typed failure to "unknown error" with
  **no compile error**.
- **Constraint honoured:** find-and-report only. No source modified, no
  git operations performed.

---

## Summary

- **NEW sites found beyond the 6 already-fixed: 0.**
- The six PR #318 sites are **genuinely fixed** — each now branches on
  `err instanceof ApiError && err.status === N` and reads `err.body`;
  **no residual** `.match` / `.includes` / `.startsWith` on the message
  string survives at any of them.
- The codebase carries **five other custom `Error` subclasses**
  (`AnalysisWaitError`, `QeuboError`, `CardTreeOverflowError`,
  `ParseFailure`, `UnboundHoleError`). Every one of them is already the
  *recommended in-idiom shape* — a structured class whose discriminant /
  payload lives in **fields** (`reason`, `kind`, `paramName`,
  `line`/`column`, `actualSize`/`maxNodes`), consumed by branching on
  those fields, never by reparsing the message. They are documented
  below as **confirming evidence**, not findings.
- **Zero** error-format regex literals (`/^API Error/`, `/\d{3}:/`, an
  `Error:`-prefixed pattern, etc.) survive anywhere in `src`.
- A whole-tree multi-line scan of **every `catch` block body** for a
  string-match (`.match`/`.includes`/`.startsWith`/`.indexOf`) or a
  string-equality (`=== 'literal'`) applied to the caught value or its
  `.message` returned **zero hits**.

**Severity distribution of NEW findings:** none (no new findings).

---

## Per-finding table

No new instances of the anti-pattern were found. The table below records
the **complete inventory of error-discrimination sites examined**, with
the verdict for each. "Reparse?" = does a consumer recover structure by
string-matching an error message / thrown string. "Drift-silent?" = would
a message-format drift silently degrade a typed failure with no compile
error (the ADR-0002 hazard).

### A. The six PR #318 API-error sites (re-verified clean)

| Throw site | Stringly contract (pre-#318) | Consumer + match (now) | Reparse? | Drift-silent? | Verdict |
|---|---|---|---|---|---|
| `api-client.ts:244` `throw new ApiError(status, body)` | message kept as `API Error <status>: <body>` for back-compat only | — | — | — | **Source now structured** (`status`/`body` fields) |
| `library-service.ts:236` | was `/^API Error 404:/` | `err instanceof ApiError && err.status === 404` | No | No | **Fixed** |
| `analysis-persistence-service.ts:346` | was `/^API Error 404:/` | `err instanceof ApiError && err.status === 404`; non-404 → `rethrowAsStorageError` (`:238`) | No | No | **Fixed** |
| `analysis-bundle.ts:116` `parseStorageError` | was `/^API Error (\d+):\s*(.*)$/` rebuilding `AnalysisBundleStorageError` | reads `err.status` + `JSON.parse(err.body)`, branches on parsed JSON `kind` (`:122–166`) | No | No | **Fixed** |
| `backend-service.ts:345` | was `/^API Error 422:/` rebuilding `CardTreeOverflowError` | `err instanceof ApiError && err.status === 422`; `parse422Body(err.body)` `JSON.parse`s the body (`:371–383`) | No | No | **Fixed** |
| `qeubo-service.ts:267` `rethrowAs` | was `/^API Error (\d+):/` rebuilding `QeuboError` | `extractStatus(err)` → `err.status` (`:68–70`), mapped via `Record<number, kind>` table | No | No | **Fixed** |
| `useAuth.ts:140` | was `msg.includes('API Error 401')` | `err instanceof ApiError && err.status === 401` | No | No | **Fixed** |

Note: `analysis-bundle.ts:parseStorageError` and
`backend-service.ts:parse422Body` do parse a **string** — but they
`JSON.parse(err.body)` (the structured response body the server put on
the wire) and branch on parsed object fields (`kind`, `actual_size`,
`max_nodes`), not on the *error message* the throw site composed. That is
the legitimate "validate the wire body" shape (ADR-0002 Rule 4), not the
reverse-engineer-the-message anti-pattern. Both fail closed (return
`null` → rethrow the original) on a non-JSON / shape-mismatched body, so
diagnostic detail is preserved, not silently dropped.

### B. Other custom Error subclasses (examined; all already in-idiom)

| Class + def site | Discriminant carried as | Consumer(s) | Reparse? | Verdict |
|---|---|---|---|---|
| `AnalysisWaitError` (`wait-for-analysis.ts:47`) | field `reason: 'timeout' \| 'aborted'` | `useReviewSession.ts:447–448` (`err instanceof AnalysisWaitError && err.reason === 'timeout'`) | No | **In-idiom** (structured field) |
| `QeuboError` (`types.ts:814`) | fields `kind`, `status` | `useQeubo.ts:529–542,633,712` (`err instanceof QeuboError && err.kind === …`) | No | **In-idiom** |
| `CardTreeOverflowError` (`types.ts:2094`) | structured fields (`rootCardId`, `actualSize`, `maxNodes`) | thrown at `backend-service.ts:348`; consumed by `instanceof` | No | **In-idiom** |
| `ParseFailure` (`dsl-harness.ts:61`) | fields `line`, `column` | `dsl-harness.ts:95–99` (`err instanceof ParseFailure`, reads `err.line`/`err.column`; `err.message` used only for display) | No | **In-idiom** |
| `UnboundHoleError` (`dsl-harness.ts:383`) | field `paramName` | `useCardTreeData.ts` surfaces `treeErr.message` as a **display** reason; test reads `.paramName` (`dsl-harness.test.ts:266`) | No | **In-idiom** |

### C. Non-API thrown-string / boundary surfaces examined (no contract reparse)

| Surface | What was checked | Reparse? | Verdict |
|---|---|---|---|
| Proxy / WebSocket (`katago-client.ts:81,97`) | `onError(errorMsg: string)` from the proxy's wire `error: string` field (`katago/types.ts:465`) | No — consumers (`analysis-service.ts:186` → `pushSystemMessage`; `usePlayFromPosition.ts:86` → wraps into a diagnostic `new Error(...)`) treat it as an opaque display string | No | Clean |
| WS disconnect (`usePlayFromPosition.ts:79–83`) | `onDisconnect(code, reason)` — interpolates `code`/`reason` into a message | No (composes a message; nobody reparses it) | No | Clean |
| Store migrations (`migrations.ts:207,217`) | future-version / missing-migration throws; caught by `store/index.ts:583` callers | No (terminal diagnostics, surfaced per ADR-0002) | No | Clean |
| SGF parse (`@sabaki/sgf` via `useReviewSession`, `useLibraryPreview:154`, `useCardThumbnail:70`, `useSgfLoader:60`) | catch blocks on parse failure | No (log + recover to placeholder; never inspect message content) | No | Clean |
| `lib/knobs.ts:449` | wraps a cause's `.message` into a richer diagnostic throw | No (one-directional composition; not reparsed) | No | Clean |
| `autonomous-srs.ts:273,320–340` | `failureMessage` string + `failureMessage === undefined` presence check | No (presence check, not content match; message is display-only) | No | Clean |
| `useEnrichedData.ts:99`; coordinate/`split` keys (board, knob paths, locales, colors) | `.split`/`.indexOf` on **composite internal keys** (`hash:nodeId`, `x,y`, `a.b.c`, `en-US`, `rgb(...)`) | No (internal value encodings, not error contracts) | No | Out of scope (not error contracts) |
| Sync / resource / telemetry / persistence catch blocks | every `catch` body in `src/services` | No | No | Clean |

---

## Method

No `Task`/`Agent` sub-agent tool was available in this environment, so
the partition-and-parallelise plan was executed as a single-operator
exhaustive sweep. The search composed several independent passes so a
miss in one would be caught by another:

1. **Every `.message` reference** in `src` (filtered for the reparse
   shape vs. the benign `err instanceof Error ? err.message : String(err)`
   display extraction).
2. **Every** `.match(` / `.test(` / `.startsWith(` / `.indexOf(` /
   `.includes(` call in `src` — inspected each for application to an
   error message / thrown string.
3. **Every** `throw new Error(\`…\`)` template-literal throw and every
   `throw new <Custom>Error(…)`, inspected for an encoded discriminant a
   consumer might branch on.
4. **A whole-tree multi-line (`perl -0777`) scan of every `catch (v) {…}`
   block body** for `v` / `v.message` followed by a string-match or a
   string-equality against a literal — zero hits.
5. **Every custom `Error` subclass** enumerated and its consumers traced
   (field-branching vs. message-reparse).
6. **The proxy/WebSocket, SGF, store-migration, and DSL-harness**
   non-API boundaries inspected directly.
7. **A regex-literal sweep** for any surviving error-format pattern
   (`/^API Error/`, `/\d{3}:/`, `Error:`-prefixed) — zero in `src`.
8. **The test tree** scanned for `toThrow(/…/)` / `toMatch` assertions
   that would reveal a production reparse contract under test — the only
   relevant one (`library-service.test.ts:168` `toThrow(/500/)`) asserts
   on `new ApiError(500, 'oops')`'s message; it is a **test-only**
   assertion on the back-compat message, not a production consumer.

---

## Exhaustiveness verdict

**{the 6 PR #318 sites + 0 new findings} is the complete set of
stringly-typed-then-reparsed contracts in `frontend/src`.** Within the
limits named below, the anti-pattern is fully eradicated: the only error
class whose message ever carried machine-meaningful structure was
`ApiError` (the `API Error <status>: <body>` format), and every consumer
of it now reads the structured `status`/`body` fields. No other thrown
string — API, proxy/WebSocket, SGF, store-migration, DSL, or composable —
is reverse-engineered for structure anywhere. The other five custom error
classes were *born* in the recommended idiom (discriminant-as-field),
so the pattern never spread beyond the API surface.

This is the strong form of the verdict the deferred-items entry asked
for: not merely "the six are fixed" but "the six were the entire
population."

---

## Residual uncertainty (named honestly, per ADR-0002)

These are the gaps the method could not fully close. None is a *found*
instance; each is a class the static sweep cannot see into.

1. **The `ApiError.message` back-compat string is still load-bearing by
   contract, just not by any code in `src`.** PR #318 deliberately kept
   `message = "API Error <status>: <body>"` (`api-client.ts:32`,
   commented at `:240–243`) so an un-migrated consumer would keep
   working during a migration. The audit confirms **no such consumer
   remains in `src`**. But the string format is now a *vestigial public
   contract with zero in-repo readers* — the next person who adds a
   `.includes('API Error')` re-opens the hazard with no compile error to
   stop them. The audit cannot prevent a future re-introduction; that is
   the RCA's domain (the deferred entry asks specifically about a
   missing lint / type gate). Worth noting as the live residual surface
   even though it is currently clean.

2. **Dynamic / computed property access could hide a reparse the static
   greps don't resolve.** The sweep keys on literal method names
   (`.match`, `.includes`, …) and literal `.message`. An indirection
   like `err[fieldName]` with `fieldName` computed, or a message routed
   through a helper that string-matches one layer removed, would not
   surface. No such indirection was observed near any error-handling
   site, and the codebase's style is direct, but the static method
   cannot *prove* their absence.

3. **Third-party thrown shapes are inspected only where the SPA catches
   them.** `@sabaki/sgf` and `fetch` throw their own error objects; the
   audit confirms the SPA's catch sites treat those as opaque
   (log/recover/rewrap), but it did not audit the libraries' internal
   message formats — out of scope and not the anti-pattern in any case
   (the SPA does not reparse them).

4. **`.vue` single-file components: the multi-line `catch`-scan ran over
   the whole file including `<template>`/`<style>`,** which is harmless
   (those sections contain no `catch`), but the script-block boundary was
   not parsed out. This widens, not narrows, coverage; no `.vue` catch
   block matched. Flagged only for transparency about the scan's shape.

None of these four is a deferral of a found problem — they are the
honest boundary of what a no-runtime static sweep can assert. The
**found-instance count beyond the six is zero**, and the four residuals
are surface-area-for-the-future (item 1) or method limits (items 2–4),
which the companion **RCA** — explicitly still open in the deferred-items
entry — is the right vehicle to address (especially item 1's
missing-gate question).
