# Stringly-encoded API errors reverse-engineered downstream (brittleness-hazard audit + RCA)

> **Dissolved deferred-items entry — closed (implemented/resolved).** Status is canonical in the work-status SSOT: see item `stringly-typed-api-errors` in `docs/work-status.json`. Archived here as the working-memory record of the original `docs/notes/deferred-items.md` entry.


- **Surfaced:** 2026-06-01, as a serendipitous finding of the
  effect-typing consult arc — the `neverthrow` consult measured the
  error channel as content-thin at the service boundaries; tracing
  *why* exposed this. The maintainer classes it not merely a code
  smell but a serious brittleness-hazard violation of engineering
  discipline (ADR-0002 fail-loudly + the type-driven-design tenet),
  warranting both an audit and an RCA — neither scheduled now.
- **Emergency fix applied (PR #318, 2026-06-01).** Classed an
  *emergency*, not merely a latent hazard: in a single-maintainer
  project the bus factor turns an un-defused stringly-typed landmine
  into a project-continuity risk — no second maintainer catches the
  regression when the message format drifts, and the reparse sites
  live only in one person's memory. The fix introduced the structured
  `class ApiError extends Error { status, body }` in
  `api-client.ts` and converted all six known reparse sites
  (library-service, analysis-persistence-service, analysis-bundle,
  backend-service, qeubo-service, useAuth) to branch on
  `err instanceof ApiError && err.status === N` / read `err.body`; the
  `.message` is preserved for back-compat. Typecheck green; the
  `parseStorageError` → typed-union path is locked by a new tier-1 test
  (`analysis-bundle-storage-error.test.ts`). **This does NOT close the
  item.** The fix removed the *known* instances; it did not establish
  the set is complete, nor explain how the pattern proliferated. The
  **exhaustiveness audit** (any stringly-typed contract beyond these
  six — non-API thrown-string contracts; any `.match` / `.includes` on
  a thrown message) and the **RCA** below both remain open.
- **The anti-pattern.** `api-client.ts:218` throws a *stringly-typed*
  error whose message is `API Error <status>: <body>`, discarding the
  structured `status` / `body` it holds at the throw site. Six consumer
  sites then reverse-engineer that structure back out by regex /
  substring on the message:
  - `library-service.ts:236`, `analysis-persistence-service.ts:346` — `/^API Error 404:/`
  - `analysis-bundle.ts:122` — `/^API Error (\d+):\s*(.*)$/`, rebuilding the `AnalysisBundleStorageError` union
  - `backend-service.ts:345` — `/^API Error 422:/`, rebuilding `CardTreeOverflowError`
  - `qeubo-service.ts:71` — `/^API Error (\d+):/`, rebuilding `QeuboError`
  - `useAuth.ts:141` — `msg.includes('API Error 401')`

  The codebase already names the hazard in passing — `useAuth.ts:122`
  ("Brittle in principle") and `api-client.ts:216`.
- **Why it's a brittleness hazard, not cosmetics.** The error contract
  is a *string format*, not a type. A change to that format — or a
  response body that doesn't match a consumer's regex — silently breaks
  every consumer's error branching with **no compile error**: the regex
  stops matching and a typed failure (overflow / quota / 404 / 401)
  silently degrades to "unknown error." That is exactly the
  silent-failure class ADR-0002 forbids, reached *through* the
  error-handling path that is supposed to be the loud one.
- **The audit — closed 2026-06-01 (exhaustive; 0 new sites).** Run as an
  Opus-agent sweep; report at
  `docs/notes/audit-stringly-typed-contracts-2026-06-01.md`. The strong-form
  result the entry asked for: **the six PR-#318 sites ARE the complete
  population** — no stringly-typed-then-reparsed contract exists beyond them.
  The other five custom Error classes (`AnalysisWaitError`, `QeuboError`,
  `CardTreeOverflowError`, `ParseFailure`, `UnboundHoleError`) were born
  field-discriminated (never message-reparsed); the non-API boundaries
  (proxy/WebSocket, SGF parse, store migrations, the DSL harness) treat caught
  errors as opaque; zero error-format regexes survive in `src`. Residual: the
  now-vestigial `ApiError.message` could re-open the hazard if a future
  `.includes('API Error')` lands with no compile gate — exactly the
  missing-lint question the RCA's guard G1 addresses. Original scope, retained
  as the method record: enumerate every stringly-encoded-then-
  reparsed contract — the six above may not be exhaustive, and the
  pattern may exist beyond API errors (any `.match` / `.includes` on a
  thrown message is suspect). The fix is known and in-idiom: a
  structured `class ApiError extends Error` carrying `status: number`
  and `body: string` as fields, with consumers branching on
  `err instanceof ApiError && err.status === …` and reading `err.body`
  directly. Incrementally safe — `ApiError` can keep the same `.message`
  string, so un-migrated consumers keep working during the sweep. It
  also delivers the "information-bearing error channel" the `neverthrow`
  consult named as the real win — library-free, via a plain typed class
  in the existing `CardTreeOverflowError` / `QeuboError` idiom — and so
  subsumes that consult's deferred (e) residual.
- **The RCA — drafted 2026-06-01 (pending maintainer review).** Draft at
  `docs/notes/rca-discipline-lapses-2026-06-01.md`. It root-causes this lapse
  *and* a sibling doc-discipline lapse (a shipped feature left documented as
  open) as two instances of one failure: a discipline in force but guarded only
  by a single maintainer's attention, where each act is locally correct and the
  defect lives in the accumulation — the same diagnosis the render-coupling
  postmortem reached on a third (perf) surface. Recommended guards (adoption is
  the maintainer's call): G1 ESLint ban on `.match`/`.includes` over error
  messages, G4 a retire-on-ship checklist item, G5 a single work-status SSOT.
  Original scope: determine what allowed
  the anti-pattern to *proliferate* across six sites while ADR-0002 and
  the type-driven-design tenet were in force the whole time. Open
  questions for the RCA, not pre-judged here: did the first reparse site
  set a precedent the others copied? did the api-client's deliberate
  "keep the string format" choice (`api-client.ts:216`) entrench it? is
  there a missing lint / type gate that would flag a thrown-string
  contract or a `.match` on an error message? did review not catch the
  spread because each instance looked locally reasonable? The
  single-maintainer context is part of that frame — with no second
  reviewer, the discipline's only guard is one person's attention and
  memory, which is precisely the lapse-surface to examine (not to treat
  as exculpatory). The RCA's job is the organizational / process lapse,
  not the per-site fix.
- **Cross-references.** `docs/notes/opus-consult-2026-06-01-neverthrow-overhaul.md`
  (where the thin error channel was first measured); the "Effect-typing
  as documentation" entry in `docs/notes/decisions-deferred.md` (the
  deferred (e) residual this subsumes).

---

License: Public Domain (The Unlicense).
