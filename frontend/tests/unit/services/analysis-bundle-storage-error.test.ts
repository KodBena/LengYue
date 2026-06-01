/**
 * tests/unit/services/analysis-bundle-storage-error.test.ts
 *
 * Tier-1 unit tests for `parseStorageError` — the `ApiError` → typed
 * `AnalysisBundleStorageError` projection. Pure function; verifies the
 * structured-`ApiError` path introduced when `api-client` stopped throwing
 * stringly-typed errors (the #1 audit remediation). The integration test
 * (useAutoSaveAnalyses) exercises the same path end-to-end but is
 * timing-flaky on main, so this is the authoritative check of the mapping.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { parseStorageError } from '../../../src/services/analysis-bundle';
import { ApiError } from '../../../src/services/api-client';

describe('parseStorageError', () => {
  it('maps a 413 bundle_too_large envelope to the typed union', () => {
    const err = new ApiError(413, JSON.stringify({
      detail: { kind: 'bundle_too_large', request_bytes: 1_000_000, cap_bytes: 500_000, detail: 'too big' },
    }));
    expect(parseStorageError(err)).toEqual({
      kind: 'bundle_too_large', status: 413, requestBytes: 1_000_000, capBytes: 500_000, detail: 'too big',
    });
  });

  it('maps a 413 user_quota_exceeded envelope', () => {
    const err = new ApiError(413, JSON.stringify({
      detail: { kind: 'user_quota_exceeded', current_bytes: 9, quota_bytes: 10, detail: 'full' },
    }));
    expect(parseStorageError(err)).toEqual({
      kind: 'user_quota_exceeded', status: 413, currentBytes: 9, quotaBytes: 10, detail: 'full',
    });
  });

  it('maps a 500 unknown_scheme envelope', () => {
    const err = new ApiError(500, JSON.stringify({
      detail: { kind: 'unknown_scheme', scheme: 'xyz', detail: 'nope' },
    }));
    expect(parseStorageError(err)).toEqual({
      kind: 'unknown_scheme', status: 500, scheme: 'xyz', detail: 'nope',
    });
  });

  it('returns null for a non-ApiError (e.g. a network TypeError)', () => {
    expect(parseStorageError(new TypeError('network down'))).toBeNull();
  });

  it('returns null for an ApiError whose body is not a recognised envelope', () => {
    expect(parseStorageError(new ApiError(404, 'plain text, not json'))).toBeNull();
    expect(parseStorageError(new ApiError(413, JSON.stringify({ detail: { kind: 'mystery' } })))).toBeNull();
  });
});
