/**
 * src/engine/rulesets.ts
 * The four ruling-mandated named rulesets (AGA, Chinese, Japanese,
 * Tromp-Taylor), total case-insensitive normalization from untrusted
 * SGF `RU`-property input, and the KataGo wire-spelling projection.
 *
 * Scope, per commissioner ruling (ledger row 110,
 * `.claude/dispatch-reports/design-engine-features.md` §RULESETS):
 * exactly these four hard-coded presets, no component-rules model
 * (ko/scoring/suicide/tax toggles — explicitly out of scope), and no
 * silent coercion of unrecognized input. LengYue is public-domain
 * (Unlicense); KataGo is MIT. Per the ruling, nothing from the KataGo
 * rules documentation page (https://lightvector.github.io/KataGo/rules.html)
 * is lifted or paraphrased here — it is cited by URL only, as the
 * external reference for "KataGo accepts named rulesets over the
 * wire." The wire spellings below are not drawn from that page; they
 * are the lowercase form of each canonical display name, matching the
 * pre-existing hardcoded `'tromp-taylor'` literal this module replaces
 * at the two `analysis-service.ts` query-builder call sites.
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
 * Discriminated normalization result. `normalizeRuleset` is TOTAL — it
 * always returns one of these two arms — but distinguishes "confidently
 * resolved to one of the four" from "could not resolve," per the
 * ruling's fail-loud requirement (ADR-0002): an unrecognized `RU` value
 * never silently coerces to a default.
 */
export type RulesetResolution =
  | { kind: 'resolved'; name: RulesetName }
  | { kind: 'unknown'; raw: string };

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
 * including `undefined`, empty, or garbage — returns a value; no input
 * is silently coerced into one of the four names on a fuzzy match. Only
 * the recognized aliases in `RULESET_ALIASES` resolve; anything else
 * (e.g. `"New Zealand"`) returns `{ kind: 'unknown', raw }`.
 */
export function normalizeRuleset(raw: string | undefined): RulesetResolution {
  const input = raw ?? '';
  const name = RULESET_ALIASES[foldRulesetKey(input)];
  if (name !== undefined) {
    return { kind: 'resolved', name };
  }
  return { kind: 'unknown', raw: input };
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
