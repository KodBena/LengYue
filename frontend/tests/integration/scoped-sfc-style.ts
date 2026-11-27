/**
 * CSS evidence boundaries for Vue SFC integration tests.
 *
 * Raw SFC style text is authoring input, not browser CSS. This helper
 * parses and compiles the scoped block with the component's real scope
 * id before installing it. A CSSOM declaration and a computed value
 * are returned as different tagged types: the former witnesses what a
 * matching rule specifies; the latter witnesses the cascade result.
 * Neither type claims to measure layout.
 */
import { readFileSync } from 'node:fs';
import { compileStyle, parse } from 'vue/compiler-sfc';

export interface InstalledScopedSfcStylesheet {
  readonly kind: 'installed-scoped-sfc-stylesheet';
  readonly filename: string;
  readonly scopeId: string;
  readonly element: HTMLStyleElement;
  readonly sheet: CSSStyleSheet;
  readonly remove: () => void;
}

export interface InstalledGlobalCssStylesheet {
  readonly kind: 'installed-global-css-stylesheet';
  readonly filename: string;
  readonly element: HTMLStyleElement;
  readonly sheet: CSSStyleSheet;
  readonly remove: () => void;
}

export interface SpecifiedCssDeclaration {
  readonly kind: 'specified-css-declaration';
  readonly selectorText: string;
  readonly propertyName: string;
  readonly value: string;
}

export interface ComputedCssValue {
  readonly kind: 'computed-css-value';
  readonly propertyName: string;
  readonly value: string;
}

/** Compile and install the single scoped style block belonging to a Vue component. */
export function installScopedSfcStylesheet(
  component: object,
  filename: string,
  ownerDocument: Document = document,
): InstalledScopedSfcStylesheet {
  const scopeId: unknown = Reflect.get(component, '__scopeId');
  if (typeof scopeId !== 'string' || !/^data-v-[\w-]+$/.test(scopeId)) {
    throw new Error(`${filename}: component has no valid Vue scoped-style id`);
  }

  const parsed = parse(readFileSync(filename, 'utf-8'), { filename });
  if (parsed.errors.length > 0) {
    throw new Error(`${filename}: SFC parse failed: ${parsed.errors.map(String).join('; ')}`);
  }
  if (parsed.descriptor.styles.length !== 1) {
    throw new Error(`${filename}: expected exactly one SFC style block, found ${parsed.descriptor.styles.length}`);
  }

  const [styleBlock] = parsed.descriptor.styles;
  if (!styleBlock || !styleBlock.scoped || (styleBlock.lang && styleBlock.lang !== 'css')) {
    throw new Error(`${filename}: expected one CSS <style scoped> block`);
  }

  const compiled = compileStyle({
    source: styleBlock.content,
    filename,
    id: scopeId,
    scoped: true,
  });
  if (compiled.errors.length > 0) {
    throw new Error(`${filename}: scoped CSS compilation failed: ${compiled.errors.map(String).join('; ')}`);
  }
  if (!compiled.code.trim() || !compiled.code.includes(`[${scopeId}]`)) {
    throw new Error(`${filename}: Vue compiler did not emit scoped selectors for ${scopeId}`);
  }

  const element = ownerDocument.createElement('style');
  element.textContent = compiled.code;
  ownerDocument.head.appendChild(element);
  const sheet = element.sheet;
  if (!sheet) {
    element.remove();
    throw new Error(`${filename}: compiled stylesheet was not installed in the document`);
  }

  return {
    kind: 'installed-scoped-sfc-stylesheet',
    filename,
    scopeId,
    element,
    sheet,
    remove: () => element.remove(),
  };
}

/** Install an ordinary global CSS file, such as the application's theme. */
export function installGlobalCssFile(
  filename: string,
  ownerDocument: Document = document,
): InstalledGlobalCssStylesheet {
  const element = ownerDocument.createElement('style');
  element.textContent = readFileSync(filename, 'utf-8');
  ownerDocument.head.appendChild(element);
  const sheet = element.sheet;
  if (!sheet) {
    element.remove();
    throw new Error(`${filename}: global stylesheet was not installed in the document`);
  }

  return {
    kind: 'installed-global-css-stylesheet',
    filename,
    element,
    sheet,
    remove: () => element.remove(),
  };
}

function styleRules(stylesheet: InstalledScopedSfcStylesheet): CSSStyleRule[] {
  const rules: CSSStyleRule[] = [];
  for (let index = 0; index < stylesheet.sheet.cssRules.length; index += 1) {
    const rule = stylesheet.sheet.cssRules.item(index);
    if (!rule) continue;
    if (rule.type === CSSRule.STYLE_RULE && rule instanceof CSSStyleRule) {
      rules.push(rule);
    } else {
      throw new Error(`${stylesheet.filename}: unsupported nested/non-style CSS rule: ${rule.cssText}`);
    }
  }
  return rules;
}

/** Return authored declarations from compiled rules that match this element. */
export function specifiedDeclarationsForElement(
  stylesheet: InstalledScopedSfcStylesheet,
  element: Element,
  propertyName: string,
): readonly SpecifiedCssDeclaration[] {
  const declarations: SpecifiedCssDeclaration[] = [];
  for (const rule of styleRules(stylesheet)) {
    if (!element.matches(rule.selectorText)) continue;
    const value = rule.style.getPropertyValue(propertyName);
    if (value !== '') {
      declarations.push({
        kind: 'specified-css-declaration',
        selectorText: rule.selectorText,
        propertyName,
        value,
      });
    }
  }
  return declarations;
}

/** Inspect rules by selector identity, including rules whose declarations must remain absent. */
export function specifiedDeclarationsForSelectorFragments(
  stylesheet: InstalledScopedSfcStylesheet,
  selectorFragments: readonly string[],
  propertyName: string,
): readonly SpecifiedCssDeclaration[] {
  const declarations: SpecifiedCssDeclaration[] = [];
  for (const rule of styleRules(stylesheet)) {
    if (!selectorFragments.every(fragment => rule.selectorText.includes(fragment))) continue;
    const value = rule.style.getPropertyValue(propertyName);
    if (value !== '') {
      declarations.push({
        kind: 'specified-css-declaration',
        selectorText: rule.selectorText,
        propertyName,
        value,
      });
    }
  }
  return declarations;
}

/** Read the cascade's computed CSS value; this does not measure box geometry. */
export function computedCssValue(element: Element, propertyName: string): ComputedCssValue {
  return {
    kind: 'computed-css-value',
    propertyName,
    value: window.getComputedStyle(element).getPropertyValue(propertyName),
  };
}
