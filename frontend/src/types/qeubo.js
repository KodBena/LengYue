/**
 * src/types/qeubo.ts
 *
 * qEUBO calibration domain types: the camel-case projections of the
 * qEUBO wire shapes (experiment / status / pair / best / history),
 * the discriminated `QeuboError` class (a runtime export), and the
 * persisted `QeuboBookmark` parameter snapshot. Carved from the
 * single-file `src/types.ts` (2026-06-10, history-lessons audit
 * §3.15); bodies are verbatim from the pre-split file.
 *
 * License: Public Domain (The Unlicense)
 */
export class QeuboError extends Error {
    kind;
    status;
    constructor(kind, status, message) {
        super(message);
        this.name = 'QeuboError';
        this.kind = kind;
        this.status = status;
    }
}
