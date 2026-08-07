/**
 * src/engine/rulesets.ts
 * The four ruling-mandated named rulesets (AGA, Chinese, Japanese,
 * Tromp-Taylor), total case-insensitive normalization from untrusted
 * SGF `RU`-property input, and the KataGo wire-spelling projection.
 *
 * Scope, per commissioner ruling (ledger row 110,
 * `.claude/dispatch-reports/design-engine-features.md` §RULESETS) as
 * superseded by the live-testing adjudication recorded in
 * `.claude/dispatch-reports/ruleset-default-wedge-fix.md`: exactly
 * these four hard-coded presets, no component-rules model
 * (ko/scoring/suicide/tax toggles — explicitly out of scope). LengYue
 * is public-domain (Unlicense); KataGo is MIT. Per the original
 * ruling, nothing from the KataGo rules documentation page
 * (https://lightvector.github.io/KataGo/rules.html) is lifted or
 * paraphrased here — it is cited by URL only, as the external
 * reference for "KataGo accepts named rulesets over the wire." The
 * wire spellings below are not drawn from that page; they are the
 * lowercase form of each canonical display name, matching the
 * pre-existing hardcoded `'tromp-taylor'` literal this module
 * originally replaced at the two `analysis-service.ts`
 * query-builder call sites.
 *
 * Adjudication supersession: the ORIGINAL shape here treated an
 * unrecognized/absent `RU` as `{ kind: 'unknown' }` and every
 * downstream query-builder call site refused to construct a query at
 * all (fail-loud, ADR-0002-flavoured). Live testing surfaced that
 * this blocked ordinary analysis on any board without a matching RU
 * (foreign SGF, a ruleset name outside the four) with no in-session
 * recovery — the maintainer adjudicated that this is a case for a
 * REPRESENTED DEFAULT, not a refusal: `normalizeRuleset` is now total
 * in a stronger sense — it always names an effective `RulesetName`,
 * distinguishing only WHETHER that name came from the file
 * (`source: 'ru'`) or was defaulted (`source: 'defaulted'`). This is
 * still not silent coercion in the ADR-0002 sense that mattered: the
 * DEFAULTED provenance is a first-class represented fact a caller can
 * branch on (the StatusBar dropdown surfaces it), it is simply no
 * longer a REFUSAL. The canonical RU value on a loaded SGF is never
 * rewritten by this defaulting — only an explicit user selection
 * (`App.vue`'s `handleUpdateRules`) writes `RU`.
 *
 * This module is the SOLE construction site for `RulesetName` — no
 * other module string-compares against the four names directly
 * (mirrors `frontend/CLAUDE.md`'s "keyed caches mint a branded key at
 * construction" spirit, applied to a validated enum).
 *
 * License: Public Domain (The Unlicense)
 */

/** The four ruling-mandated names, in display form. */
export const RULESET_NAMES = ['AGA', 'Chinese', 'Japanese', 'Tromp-Taylor'] as const;

export type RulesetName = (typeof RULESET_NAMES)[number];

/**
 * `normalizeRuleset`'s result: an effective `RulesetName` (always
 * defined — every query builder can use `.name` unconditionally,
 * there is no refusal arm) plus `source`, which names whether that
 * name was actually read from the file (`'ru'`) or is the
 * commissioner-adjudicated Tromp-Taylor default applied because the
 * `RU` value was missing or didn't match one of the four
 * ruling-mandated names (`'defaulted'`). `source` is what keeps the
 * default from being SILENT — a caller (the StatusBar dropdown, most
 * directly) can branch on it to surface the provenance to the user,
 * even though defaulting itself no longer blocks anything.
 */
export type RulesetResolution = { name: RulesetName; source: 'ru' | 'defaulted' };

/**
 * Alias table keyed by a folded (case/hyphen/space-insensitive) form of
 * each recognized real-SGF spelling. Authored directly against real SGF
 * `RU` values this codebase might see (`"japanese"`, `"AGA"`,
 * `"Chinese"`, `"Tromp-Taylor"`, `"tromp taylor"`, …) — not against any
 * KataGo documentation vocabulary.
 */
const RULESET_ALIASES: Readonly<Record<string, RulesetName>> = {
  aga: 'AGA',
  chinese: 'Chinese',
  japanese: 'Japanese',
  tromptaylor: 'Tromp-Taylor',
};

/**
 * Folds an input string to the alias-table key shape: trimmed,
 * lowercased, with internal whitespace and hyphens collapsed out. This
 * is what gives `normalizeRuleset` its case/hyphen/space tolerance
 * (`"Tromp-Taylor"`, `"tromp taylor"`, `"TROMPTAYLOR"` all fold to the
 * same key) without needing a separate alias entry per spelling
 * variant.
 */
function foldRulesetKey(s: string): string {
  return s.trim().toLowerCase().replace(/[\s-]+/g, '');
}

/**
 * Total, case-insensitive normalization from untrusted input (an SGF
 * `RU` value, typically) to a `RulesetResolution`. Every input —
 * including `undefined`, empty, or garbage — returns a defined
 * `RulesetName`; no input is coerced into a FUZZY match against one
 * of the four names (only the exact aliases in `RULESET_ALIASES`
 * resolve as `source: 'ru'`) — an unrecognized value (e.g. `"New
 * Zealand"`) falls through to `{ name: 'Tromp-Taylor', source:
 * 'defaulted' }` per the live-testing adjudication (see this module's
 * header). Callers that need to know whether the name is provenance-
 * honest or a default branch on `.source`; every caller that just
 * needs an effective name (the KataGo wire-value call sites) can use
 * `.name` unconditionally.
 */
export function normalizeRuleset(raw: string | undefined): RulesetResolution {
  const input = raw ?? '';
  const name = RULESET_ALIASES[foldRulesetKey(input)];
  if (name !== undefined) {
    return { name, source: 'ru' };
  }
  return { name: 'Tromp-Taylor', source: 'defaulted' };
}

/**
 * KataGo wire spelling for each canonical display name — the lowercase
 * form, matching the working `'tromp-taylor'` literal already in use at
 * the query-builder call sites. Single home for the display-name ↔
 * wire-string mapping (the two are two representations of one fact);
 * callers never lowercase a `RulesetName` inline.
 */
const RULESET_WIRE_NAMES: Readonly<Record<RulesetName, string>> = {
  AGA: 'aga',
  Chinese: 'chinese',
  Japanese: 'japanese',
  'Tromp-Taylor': 'tromp-taylor',
};

/** Projects a resolved `RulesetName` to the KataGo wire `rules` string. */
export function rulesetToWireName(name: RulesetName): string {
  return RULESET_WIRE_NAMES[name];
}
