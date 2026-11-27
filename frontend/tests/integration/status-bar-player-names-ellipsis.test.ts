let statusBarStylesheet: ReturnType<typeof installScopedSfcStylesheet> | null = null;

beforeAll(() => {
  statusBarStylesheet = installScopedSfcStylesheet(StatusBar, STATUS_BAR_SFC_PATH);
});

afterAll(() => {
  statusBarStylesheet?.remove();
  statusBarStylesheet = null;
});

function boardWithMetadata(blackName: string, whiteName: string): {
  board: BoardState;
  metadata: { blackName: string; whiteName: string; komi: number; rules: string };
} {
  return {
    board: createInitialBoard(),
    metadata: { blackName, whiteName, komi: 6.5, rules: 'Chinese' },
  };
}

describe('StatusBar — player names elide with affordance, never clip mid-word (occluded-names regression)', () => {
  let wrapper: VueWrapper | null = null;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('wide width: both full names are present verbatim in the DOM (no JS-level truncation) — contract (a)', () => {
    const { board, metadata } = boardWithMetadata('AlphaGo', 'Lee Sedol');
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });

    // CSS ellipsis is a paint-time affordance jsdom cannot render; the
    // DOM's own text content must carry the FULL name either way — a
    // component that pre-truncated in JS would fail this even though
    // no CSS test could ever catch it.
    expect(wrapper.find('.player-name--black').text()).toContain('AlphaGo');
    expect(wrapper.find('.player-name--white').text()).toContain('Lee Sedol');
  });

  it('.status-left genuinely competes for the bar\'s surplus width (closes the "inert flex-grow" defect)', () => {
    const { board, metadata } = boardWithMetadata('Black', 'White');
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });

    // Before the fix, `.status-left` had no `flex-grow` at all (the
    // shorthand default, `flex: 0 1 auto`) — `.player-names`' own
    // `flex: 1 1 auto` could never engage because its PARENT never had
    // any positive free space to redistribute. A non-zero flex-grow
    // here is the structural precondition for "both names render in
    // full whenever the bar's actual free width allows".
    const statusLeft = getComputedStyle(wrapper.find('.status-left').element);
    expect(statusLeft.flexGrow).not.toBe('0');
  });

  it('.player-names is a flex ROW of two independently-ellipsizing children, not one shared blob (closes first-takes-all tail elision) — contract (b)', () => {
    // Superseded shape, statusbar-cards-completion-build (defect f): the
    // ellipsis/nowrap/overflow clip boundary moved from `.player-name`
    // itself to a NEW inner `.player-name-text` span — `.player-name` is
    // now `inline-flex` (chip + text-span as independent flex children)
    // and carries NO overflow clipping, so the active-turn ring (painted
    // outside the chip's border box) is never clipped on any edge. See
    // `StatusBar.vue`'s own comment on `.player-name-text` for the full
    // derivation; this test's intent (symmetric, non-privileged
    // ellipsis) is preserved, just re-pinned against the current DOM
    // shape.
    const { board, metadata } = boardWithMetadata('AlphaGo', 'Lee Sedol');
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });

    const outer = getComputedStyle(wrapper.find('.player-names').element);
    expect(outer.display).toBe('flex');

    const blackName = wrapper.find('.player-name--black');
    const whiteName = wrapper.find('.player-name--white');
    expect(blackName.exists()).toBe(true);
    expect(whiteName.exists()).toBe(true);

    const blackComputed = getComputedStyle(blackName.element);
    const whiteComputed = getComputedStyle(whiteName.element);

    // `.player-name` is `inline-flex` now (chip + `.player-name-text` as
    // two independent flex children) — it is deliberately NOT the
    // ellipsizing box itself, so it carries no overflow clipping.
    expect(blackComputed.display).toBe('inline-flex');
    expect(whiteComputed.display).toBe('inline-flex');
    expect(blackComputed.overflow).not.toBe('hidden');
    expect(whiteComputed.overflow).not.toBe('hidden');

    // The ellipsizing box is the INNER `.player-name-text` span — a
    // plain inline-block leaf, never a flex container itself (Arc 1's
    // lesson, still true, applied one level deeper now).
    const blackNameText = wrapper.find('.player-name--black .player-name-text');
    const whiteNameText = wrapper.find('.player-name--white .player-name-text');
    expect(blackNameText.exists()).toBe(true);
    expect(whiteNameText.exists()).toBe(true);
    const blackTextComputed = getComputedStyle(blackNameText.element);
    const whiteTextComputed = getComputedStyle(whiteNameText.element);
    expect(blackTextComputed.display).not.toBe('flex');
    expect(blackTextComputed.display).not.toBe('inline-flex');
    expect(whiteTextComputed.display).not.toBe('flex');
    expect(whiteTextComputed.display).not.toBe('inline-flex');

    // Both names' text spans carry IDENTICAL ellipsis/nowrap/overflow
    // declarations AND identical flex-basis/flex-grow — the symmetry
    // itself is the assertion that neither player is structurally
    // privileged, unlike the old single-blob shape where Black (head of
    // the run) could never be the one elided.
    for (const computed of [blackTextComputed, whiteTextComputed]) {
      expect(computed.whiteSpace).toBe('nowrap');
      expect(computed.overflow).toBe('hidden');
      expect(computed.textOverflow).toBe('ellipsis');
    }
    expect(blackTextComputed.flexGrow).toBe(whiteTextComputed.flexGrow);
    expect(blackTextComputed.flexShrink).toBe(whiteTextComputed.flexShrink);
    expect(blackTextComputed.flexBasis).toBe(whiteTextComputed.flexBasis);
  });

  it('.player-names carries a title tooltip with the full, untruncated pairing', () => {
    const { board, metadata } = boardWithMetadata('AlphaGo', 'Lee Sedol');
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });

    const el = wrapper.find('.player-names');
    const title = el.attributes('title');
    expect(title).toBeTruthy();
    expect(title).toContain('AlphaGo');
    expect(title).toContain('Lee Sedol');
  });

  it('title tooltip tracks the metadata prop, not a stale snapshot', () => {
    const { board, metadata } = boardWithMetadata('Black Player', 'White Player');
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });

    const title = wrapper.find('.player-names').attributes('title');
    expect(title).toContain('Black Player');
    expect(title).toContain('White Player');
  });

  it('S4 anti-overlap/never-wrap invariants are preserved (the wrap-vs-clip trade cannot silently flip back)', () => {
    const { board, metadata } = boardWithMetadata('Black', 'White');
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });

    const statusLeft = getComputedStyle(wrapper.find('.status-left').element);
    expect(statusLeft.minWidth).toBe('0px');

    const statusRight = getComputedStyle(wrapper.find('.status-right').element);
    expect(statusRight.flexShrink).toBe('0');

    const moveBadge = getComputedStyle(wrapper.find('.move-badge').element);
    expect(moveBadge.whiteSpace).toBe('nowrap');
    expect(moveBadge.flexShrink).toBe('0');

    const gameInfo = getComputedStyle(wrapper.find('.game-info').element);
    expect(gameInfo.whiteSpace).toBe('nowrap');
    expect(gameInfo.flexShrink).toBe('0');

    const playerNames = getComputedStyle(wrapper.find('.player-names').element);
    expect(playerNames.flexGrow).not.toBe('0'); // "flex: 1 1 auto" — still the segment that absorbs the shrink
    expect(playerNames.minWidth).toBe('32px');
  });

  it('defect (f) root fix: the active-turn ring has NO clipping ancestor at all — the left-padding band-aid is retired, not widened', () => {
    // Superseded shape, statusbar-cards-completion-build: the prior fix
    // (commit 87455822, "StatusBar active-turn ring no longer clipped")
    // opened 3px of left-edge headroom on `.player-name`'s own
    // `overflow: hidden` box — live-refuted TWICE: `.stone-chip`'s
    // `vertical-align: middle` leaves near-zero vertical slack, so the
    // ring's top/bottom arcs were still clipped by the same box the
    // left-padding never touched. Root fix: `.player-name` no longer
    // clips on ANY edge (asserted above) — there is no ring-bleed
    // headroom left to reserve, because there is no clipping box left
    // to reserve it against. This test pins the retirement, not a
    // successor magic number.
    const { board, metadata } = boardWithMetadata('Black', 'White');
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });

    const blackComputed = getComputedStyle(wrapper.find('.player-name--black').element);
    const whiteComputed = getComputedStyle(wrapper.find('.player-name--white').element);
    expect(blackComputed.overflow).not.toBe('hidden');
    expect(whiteComputed.overflow).not.toBe('hidden');
    // The chip and the (now-clipping) `.player-name-text` are SIBLINGS
    // under `.player-name` — the chip itself sits outside the only
    // element that still clips, on every edge, at any width.
    const blackChip = wrapper.find('.player-name--black .stone-chip').element;
    expect(blackChip.parentElement?.className).toContain('player-name--black');
  });

  it('narrow mode: symmetric degradation — both names share `.player-names`\' width equally, not one first — contract (b)', () => {
    const { board, metadata } = boardWithMetadata('Black', 'White');
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });

    // Superseded, status-bar-narrow-0c21: the flat 90px `.status-bar--
    // narrow .player-names` ceiling is REMOVED (see that rule's own
    // removal note in StatusBar.vue — it was a step function independent
    // of genuine available width, starving names even when the bar had
    // hundreds of free pixels going to the ephemeral `.transient-hint`
    // slot instead). `.player-names` now flexes the SAME way in every
    // tier — this test's own title survives ("symmetric degradation");
    // its former proof (a shared literal ceiling) does not, because
    // there is no longer a ceiling to point at. Confirmed instead: no
    // narrow-mode `max-width` rule targets `.player-names` at all.
    const narrowMaxWidthDeclarations = specifiedDeclarationsForSelectorFragments(
      statusBarStylesheet!,
      ['.status-bar--narrow', '.player-names'],
      'max-width',
    );
    expect(narrowMaxWidthDeclarations).toHaveLength(0);

    // Because `.player-names` is `display: flex` with two `.player-name`
    // children (each `flex: 1 1 auto`, basis = the name's OWN natural
    // width — statusbar-cards-completion-build, defect (a)'s second
    // reopening: `flex-basis: 0` silently zeroed each name's contribution
    // to `.player-names`' own max-content size up the tree, so `auto` is
    // the fix, not a shared literal), whatever width `.player-names`
    // itself ends up with (ample or narrow) is shared PROPORTIONALLY
    // between the two `flex: 1 1 auto` children — neither is asked to
    // give up more than its own share. The ellipsis affordance itself
    // lives on the inner `.player-name-text` span (defect f). Confirmed
    // against the LIVE computed style of both text spans (not just the
    // rule text), so this assertion tracks the actual cascade.
    const blackTextComputed = getComputedStyle(wrapper!.find('.player-name--black .player-name-text').element);
    const whiteTextComputed = getComputedStyle(wrapper!.find('.player-name--white .player-name-text').element);
    expect(blackTextComputed.textOverflow).toBe('ellipsis');
    expect(whiteTextComputed.textOverflow).toBe('ellipsis');
    expect(blackTextComputed.flexGrow).toBe(whiteTextComputed.flexGrow);
    expect(blackTextComputed.flexBasis).toBe(whiteTextComputed.flexBasis);

    const blackComputed = getComputedStyle(wrapper!.find('.player-name--black').element);
    const whiteComputed = getComputedStyle(wrapper!.find('.player-name--white').element);
    expect(blackComputed.flexBasis).toBe('auto');
    expect(blackComputed.flexBasis).toBe(whiteComputed.flexBasis);
  });
});
