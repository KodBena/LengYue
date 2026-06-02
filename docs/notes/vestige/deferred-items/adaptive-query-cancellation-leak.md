# Adaptive-query cancellation leak (mid-adaptive `terminate` — likely proxy-side)

> **Dissolved deferred-items entry — open.** Work status is canonical in the work-status SSOT: see item `adaptive-query-cancellation-leak` in `docs/work-status.json` (query: `node tools/work-status/sql.mjs "SELECT * FROM items WHERE id='adaptive-query-cancellation-leak'"`). This file preserves the working-memory prose of the original `docs/notes/deferred-items.md` entry and carries no authoritative status of its own. It moves to `docs/archive/notes/vestige/deferred-items/` when the item ships.


- **Surfaced:** 2026-05-29 (RB-3 scoping; maintainer-reported).
- **Concern:** Cancelling an adaptive range query works only if cancelled
  *before* the adaptive phase fires. Cancelled *during* the adaptive phase
  (after the original final, before adaptive completes), the proxy query is
  left running while the SPA stops caring about responses
  (`analysis-service.ts::stopQuery` sends one `terminate{terminateId}` then
  `activeQueries.delete` → the `onAnalysisUpdate` guard
  `if (!queryInfo) return` drops all further packets).
- **The SPA model is correct, per the intended contract.** The proxy
  unifies original + adaptive behind **one id**, rewriting `isDuringSearch`
  until the *whole* (adaptive-included) query is done (v1.0.20
  adaptive-reevaluate streaming refactor) and translating that single id
  back to the SPA. So "one id / one terminate / drop-on-cancel" is the
  right SPA shape — there is no adaptive *child* for the SPA to track.
  Leading hypothesis is therefore **proxy-side**: a mid-adaptive
  `terminate{terminateId: parentId}` isn't routed through the id-namespace
  chain (`client_id → internal_id → canonical_id → wire_id`, v1.0.21
  branding) to the running adaptive sub-query, or doesn't cascade across
  the original→adaptive boundary. **Not confirmed** — proxy-vs-SPA must be
  settled with runtime visibility, not wire inference (umbrella
  cross-boundary discipline).
- **Primary diagnosis step (do first):** capture proxy structured logs
  (`proxy/docs/logging.md`) for a mid-adaptive-cancel repro — the `forward`
  events + the role-tinted bind chain's `cid` / `orig` id fields — and read
  whether the `terminate`'s id resolves to the adaptive sub-query's internal
  id and whether the adaptive search actually stops. Three outcomes →
  three fixes: (1) terminate id doesn't *name* the adaptive sub-query →
  contract gap, coordinated proxy + SPA fix; (2) terminate matches but proxy
  doesn't stop → proxy bug; (3) terminate never arrives in time → SPA bug
  (wait-for-ack / re-send).
- **If proxy-side (likely):** file a dispatch under `docs/dispatch/` and a
  coordinated proxy bump (the submodule's own arc), not a frontend fix.
- **Bears on the typed-effect decision.** On the corrected
  (single-id-is-correct) understanding this does **not** fire the §5
  Effect-TS reserve trigger on the SPA side
  (`docs/notes/typed-effect-documentation-plan.md`); record the
  trigger-status there once the diagnosis confirms the side.
- **Code refs:** `src/services/analysis-service.ts` `stopQuery` (1029–1058),
  `onAnalysisUpdate` guard (895–896); wire `terminate` shape
  `src/engine/katago/types.ts` (315–320).

---

License: Public Domain (The Unlicense).
